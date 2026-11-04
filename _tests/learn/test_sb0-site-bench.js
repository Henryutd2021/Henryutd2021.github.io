// test_sb0-site-bench.js — Node tests for engine E0 (assets/learn/components/engine-e0.js) and the Site Bench page
// (learn/sb0-site-bench.qmd, assets/learn/sb0-site-bench.js), solved with the vendored HiGHS:
//   - inputs: the sites' hours (9,000 kWh of use, 14,000 kWh of heat, the panels' 17.6% and the wind's 33.8% capacity
//     factors, the time-of-use tariff revenue-neutral on the household use, the heat pumps' seasonal COP = HSPF / 3.412),
//     the price index (2022 and 2024 dollars to 2025), the capital recovery factor (1 MW of wind = $133,575 a year)
//   - the LP: energy balances, battery losses and hydrogen yields in every run; closed forms where there is no storage
//     (the home without a battery, the farm alone); the 52-week run against one full-year LP (storage across weeks)
//   - ties: the totals the page reports are the same on the whole optimal face (each pushed up and down), own solar's
//     share too; the busiest grid hour is not (a second least-cost schedule found), so with storage it is labelled
//   - each hour followed (split): the bars under the chart's line add up to the line, the whole bar to the hour's sources;
//     own solar's share is never negative; the CO₂ tile is bought power and gas, the export credit apart (review 2026-11-03)
//   - money: NPV = the sum of the discounted cash flows; replacements and residual values; sizing ("Size it for me")
//     beats its neighbours on the representative weeks
//   - failure states: a solver that times out, is infeasible, throws, rejects or is cancelled gives a clear status,
//     never a rejection; BenchRun classifies each with "Try again", and the words say why and in which week
//   - sensitivity: every case not run again equals a fresh solve; the farm's equipment cost is run again (stack wear)
//   - the bench's view on a stub page: a sizing run never writes sizes onto another plan (switching sites stops it)
//   - the plan link: the schema, every preset, defaults and 300 seeded random plans round-trip
//   - the page: the five generated blocks equal the engine's (write them with --write, which also writes e0.json's
//     reference block), every readout is the engine's, the text budget (about 35 words an element, the drawn captions too)
// Usage (from the site folder):  node _tests/learn/test_sb0-site-bench.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const rel = (a, b, r) => Math.abs(a - b) <= r * Math.max(1, Math.abs(a), Math.abs(b));
const WRITE = process.argv.includes("--write");

const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
const { core, VERSION } = sctx.module.exports;
const E0 = require(L("components/engine-e0.js")), prof = require(L("components/profiles.js")), SS = require(L("components/sharestate.js"));
const BR = require(L("components/benchrun.js")), PAGE_JS = require(L("sb0-site-bench.js"));
const D = J("e0.json"), X = J("sb0-site-bench.json"), year = J("town_year.json"), T = J("cf_targets.json");
const QPATH = path.join(SITE, "learn/sb0-site-bench.qmd");

(async () => {
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solver = (m, o) => core.solveWith(highs, m, { timeLimit: (o && o.timeLimit) || 60 });
  const P = E0.prepare(D, year, T, prof.townProfile);
  const st = x => Object.assign(E0.defaults(), x);
  const run = (s, o) => E0.solve(s, P, Object.assign({ solver }, o || {}));
  const sum = a => a.reduce((x, y) => x + y, 0), wcount = t => String(t).split(/\s+/).filter(Boolean).length;

  // ---------------- inputs
  ok(near(sum(P.home.use), 9000, 1e-6) && near(sum(P.home.heat), 14000, 1e-6), "home: 9,000 kWh of use and 14,000 kWh of heat a year");
  ok(near(P.home.pvCF, 0.176, 1e-9) && near(P.farm.windCF, 0.338, 1e-9), "capacity factors: panels 17.6% (EIA), wind 33.8% (EIA 2025)");
  ok(near(sum(P.home.use.map((u, i) => u * P.home.buy.tou[i])), 0.14 * 9000, 1e-6), "time-of-use tariff: the household use costs the same as at 14¢ flat");
  ok(near(P.home.touPeak / P.home.touOff, 3, 1e-12), "time-of-use: the 16:00-21:00 price is three times the rest");
  ["standard", "high"].forEach(k => ok(near(14000 / sum(P.home.hpE[k]), D.home.hp[k].hspf / 3.412, 1e-9), `heat pump (${k}): heat over electricity = HSPF / 3.412 over the year`));
  const T0 = E0.temperature(D.home.heat);
  ok(T0.indexOf(Math.min(...T0)) === 14 * 24 + 3, "the made-up temperature is coldest on 15 January at 03:00");
  ok(near(E0.usd(D, 1, 2022), 128.989 / 118.035, 1e-12) && near(E0.usd(D, 1, 2024), 128.989 / 125.43, 1e-12) && E0.usd(D, 7, 2025) === 7, "price index: EIA's GDP deflator, 2022 and 2024 dollars to 2025");
  const C4 = E0.costs(D, st({}));
  ok(Math.round(C4.wind.eac) === 133575, "1 MW of wind = $133,575 a year at 4% over 30 years (lesson 13's CRF): " + Math.round(C4.wind.eac));
  ok(near(C4.fb.capex, 1521000 / 4, 1e-9) && near(C4.el.capex, 2000000 * 128.989 / 118.035, 1e-6), "battery $380.25/kWh (EIA 4-hour); electrolyzer $2,000/kW of 2022 in 2025 dollars");
  ok(near(C4.elWear, C4.el.capex * 0.11 / 40000, 1e-12), "stack wear: 11% of the electrolyzer's cost per 40,000 full-power hours, per MWh");
  ok(near(E0.costs(D, st({ cost: 50 })).pv.capex, C4.pv.capex / 2, 1e-9), "the equipment-cost control scales every capital cost");
  const homeReps = P.home.weeks.reps, farmReps = P.farm.weeks.reps;
  ok(homeReps.length === 6 && farmReps.length === 5 && near(sum(homeReps.map(r => r.weight)) * 168, 8760, 1e-9) && near(sum(farmReps.map(r => r.weight)) * 168, 8760, 1e-9), "representative weeks: 6 (home) and 5 (farm); their hours × weights add up to 8,760");
  ok(P.home.weeks.chrono.every(k => k >= 0 && k < homeReps.length) && P.farm.weeks.chrono.length === 52, "every calendar week has a representative week");
  const ws = E0.periods(P, st({}), "week");
  ok(ws.length === 53 && sum(ws.map(p => p.n)) === 8760 && ws.every(p => p.w === 1) && ws[52].n === 24, "the year: 52 weeks and 31 December, each hour once");

  // ---------------- runs: identities and closed forms
  const results = {}, D0x = E0.defaults();
  for (const p of E0.presets) {
    const s = E0.withPreset(E0.defaults(), p), r = await run(s);
    ok(r.ok && r.status === "optimal", `preset ${p.id}: optimal (${r.status})`);
    results[p.id] = r;
    const t = r.results.tot;
    if (s.site === "home") {
      ok(rel(t.imp - t.exp + t.pv + t.dis - t.ch, t.need, 1e-9), `preset ${p.id}: bought − sent back + solar + battery out − battery in = need`);
      ok(near(t.ch * 0.85, t.dis, 1e-6 * Math.max(1, t.ch)), `preset ${p.id}: the battery gives back 85% of what goes in`);
      ok(rel(t.bill, t.buyCost - t.credit, 1e-12) && rel(r.results.money.saving, t.baseCost - t.cost, 1e-12), `preset ${p.id}: bill and saving`);
      ok(t.exp <= t.pv + 1e-6, `preset ${p.id}: only the panels export`);
    } else {
      ok(rel(t.sell + t.spill + t.el + t.ch - t.dis, t.wind, 1e-9), `preset ${p.id}: sold + spilled + electrolyzer + battery in − battery out = wind`);
      ok(near(t.ch * 0.85, t.dis, 1e-6 * Math.max(1, t.ch)), `preset ${p.id}: battery 85% round trip`);
      ok(near(t.h2, t.el * 1000 / 57.5, 1e-6 * Math.max(1, t.h2)), `preset ${p.id}: hydrogen sold = MWh × 1000 / 57.5 (tanks end each week where they start)`);
      ok(rel(t.revenue, t.sales + t.h2Rev - t.wear, 1e-12), `preset ${p.id}: revenue = power + hydrogen − stack wear`);
    }
    const M = r.results.money;
    ok(rel(M.npv, sum(M.cash.map(c => c.disc)), 1e-9) && M.cash.length === M.horizon + 1, `preset ${p.id}: NPV = the discounted cash flows over ${M.horizon} years`);
  }
  // the home without a battery, hour by hour
  {
    const s = st({ pv: 6 }), r = results.solar, Z = P.home;
    let imp = 0, exp = 0;
    for (let i = 0; i < 8760; i++) { const n = Z.use[i] - 6 * Z.pv[i]; if (n > 0) imp += n; else exp -= n; }
    ok(rel(r.results.tot.imp, imp, 1e-9) && rel(r.results.tot.exp, exp, 1e-9), "no battery: bought = Σ max(0, need − solar), sent back = Σ max(0, solar − need)");
    const base = sum(Z.use) * 0.14, gas = 14000 / 0.8 * (14.81 / 1.036) / 293.071;
    ok(rel(r.results.tot.baseCost, base + gas, 1e-9), "nothing new: 9,000 kWh at 14¢ plus 17,500 kWh of gas at $14.81/Mcf");
    const ef = 680 * 0.45359237 / 1000;
    ok(rel(r.results.tot.baseCO2, 9000 * ef / 1000 + 17500 / 293.071 * 52.91 / 1000, 1e-9), "nothing new: CO₂ = 9,000 kWh × 680 lb/MWh + gas × 52.91 kg/MMBtu");
    ok(rel(r.results.co2.plan, imp * ef / 1000 + 17500 / 293.071 * 52.91 / 1000, 1e-9) && rel(r.results.co2.net, (imp - exp) * ef / 1000 + 17500 / 293.071 * 52.91 / 1000, 1e-9), "solar: CO₂ = bought power and gas; the net takes off what is sent back");
  }
  {
    const r = results.farm, w = P.farm.wind; let sell = 0;
    for (let i = 0; i < 8760; i++) sell += Math.min(150 * w[i], 100);
    ok(rel(r.results.tot.sell, sell, 1e-9) && rel(r.results.tot.sales, 50 * sell, 1e-9), "farm alone: sells min(wind, line) every hour at $50/MWh");
    ok(near(r.results.money.added, 0, 1e-3), "farm alone: the extra equipment adds nothing");
  }
  ok(results.hp.results.tot.gasKWh === 0 && results.solar.results.tot.gasKWh > 0, "a heat pump replaces the furnace: no gas");

  // ---------------- each hour followed (split) and the chart's bars; own solar's share; CO₂ apart from the export credit
  const GRIDCHARGE = st({ pv: 0, hb: 30, tariff: "tou" }), BIGPV = st({ pv: 15, hp: "high" });
  results.gridcharge = await run(GRIDCHARGE); results.bigpv = await run(BIGPV);
  for (const id of Object.keys(results)) {
    const R0 = results[id].results, site = R0.site;
    let worst = 0, n = 0;
    R0.periods.forEach(p => { const S = p.series; for (let h = 0; h < S[site === "home" ? "need" : "wind"].length; h++) {
      const q = E0.split(site, S, h); n++;
      const under = site === "home" ? q.solarHome + q.batHome + q.gridHome : q.windSell + q.windEl + q.windBat + q.spill;
      const line = site === "home" ? S.need[h] : S.wind[h];
      const whole = site === "home" ? under + q.toBat + q.sentBack : under + q.batOut;
      const src = site === "home" ? S.pv[h] + S.dis[h] + S.imp[h] : S.sell[h] + S.el[h] + S.ch[h] + S.spill[h];
      worst = Math.max(worst, Math.abs(under - line), Math.abs(whole - src), ...Object.values(q).map(v => v < -1e-9 ? 1 : 0));
    } });
    ok(worst < 1e-6, `chart (${id}): under the line the bars add up to the ${site === "home" ? "home's use" : "wind made"}, the whole bar to the hour's ${site === "home" ? "sources" : "uses"}, none below zero (${n} hours, worst ${worst.toExponential(1)})`);
    if (site === "home") {
      const t = R0.tot;
      ok(t.selfShare >= 0 && t.selfShare <= 1 && R0.periods.every(p => p.sums.share >= 0 && p.sums.share <= 1 + 1e-9), `own solar's share (${id}): between 0 and 100%, every week too (${E0.fmt.pct(t.selfShare)})`);
      ok(near(t.co2, t.imp * t.ef / 1000 + t.gasCO2, 1e-9) && t.co2 >= 0 && near(t.co2Net, t.co2 - t.exp * t.ef / 1000, 1e-9), `CO₂ (${id}): bought power and gas, never negative; the net takes off power sent back`);
      ok(/bought power and gas/.test(R0.readouts.find(r => r.key === "co2").label) && (t.exp > 0) === /net of power sent back/.test(R0.readouts.find(r => r.key === "co2").note), `CO₂ tile (${id}): labelled as bought power and gas; the net named as a net when power is sent back`);
    }
  }
  {
    const g = results.gridcharge.results, b = results.bigpv.results;
    ok(g.tot.selfShare === 0 && g.readouts.find(r => r.key === "self").value === "0%" && g.tot.gridBat > 1000, "no solar, a battery charged from the grid: own solar covers 0% (it read −4% before the review)");
    ok(b.co2.plan > 0 && b.co2.net < 0 && /−3\.2 t/.test(b.readouts.find(r => r.key === "co2").note) && !/^−/.test(b.readouts.find(r => r.key === "co2").value), "15 kW and a heat pump: the tile shows what the home emits (" + b.readouts.find(r => r.key === "co2").value + "); the negative net is a labelled credit balance");
    const sol = results.solar.results.tot;
    ok(near(sol.selfShare, 1 - sol.imp / sol.need, 1e-9), "no battery: own solar's share = 1 − bought ÷ use (the old figure, unchanged where it was right)");
    let hit = null;
    results.gridcharge.results.periods.some(p => { const S = p.series; for (let h = 0; h < S.need.length; h++) if (S.ch[h] > 5 && S.imp[h] > 5) { hit = { S, h }; return true; } return false; });
    ok(hit && (q => near(q.solarHome + q.batHome + q.gridHome, hit.S.need[hit.h], 1e-9) && near(q.gridBat, hit.S.ch[hit.h], 1e-9))(E0.split("home", hit.S, hit.h)), "an hour that charges from the grid: the bars under the line are the home's use; the charge is drawn above it");
  }

  // ---------------- the 52-week run against one full-year LP (storage free to carry across weeks)
  const check = { date: null, rows: [] };
  for (const p of E0.presets) {
    const s = E0.withPreset(E0.defaults(), p), a = results[p.id], b = await run(s, { full: true });
    ok(b.ok, `preset ${p.id}: the full-year LP solves`);
    const gap = Math.abs(a.results.money.npv - b.results.money.npv), cap = a.results.money.capex;
    ok(gap <= 0.005 * Math.max(cap, 1) + 1, `preset ${p.id}: 52 weeks and one year agree within 0.5% of the equipment cost (${Math.round(gap)} of ${Math.round(cap)})`);
    if (!/(bat|tank|allin)$/.test(p.id) && p.id !== "allin") ok(gap < 1, `preset ${p.id}: no storage, so the two are the same (${gap})`);
    check.rows.push({ id: p.id, label: (s.site === "home" ? "Home: " : "Wind farm: ") + p.label.toLowerCase(), weeks: Math.round(a.results.money.npv), year: Math.round(b.results.money.npv), capex: Math.round(cap) });
  }

  // ---------------- ties: the reported totals on the optimal face (a week of each storage preset)
  // own solar's share (home) or the spilled share (farm) of one solved schedule of period p
  const shareOf = (s, p, r) => { const raw = E0.read(P, s, r, { periods: [p] }); return s.site === "home" ? (raw.tot.solarHome + 0.85 * raw.tot.solarBat) / raw.tot.need : raw.tot.spill / raw.tot.wind; };
  async function face(s, p, keys) {
    const m = E0.build(P, s, { periods: [p] }), r = solver(m), obj = r.objective, tol = 1e-7 * Math.max(1, Math.abs(obj));
    const row = { name: "opt", terms: {}, le: obj + tol };
    m.variables.forEach(v => { if (v.cost) row.terms[v.name] = v.cost; });
    const out = {}, shares = [shareOf(s, p, r)];
    for (const k of keys) {
      const vars = m.variables.filter(v => v.name.charAt(0) === k && /^\w\d+_\d+$/.test(v.name)).map(v => v.name);
      const mk = sgn => ({ sense: "min", variables: m.variables.map(v => Object.assign({}, v, { cost: vars.indexOf(v.name) >= 0 ? sgn : 0 })), constraints: m.constraints.concat([row]) });
      const lo = solver(mk(1)), hi = solver(mk(-1));
      out[k] = [lo.objective, -hi.objective, lo.status, hi.status];
      shares.push(shareOf(s, p, lo), shareOf(s, p, hi));
    }
    out.share = [Math.min(...shares), Math.max(...shares)];
    return out;
  }
  const TIES = [["solarbat", "home", ["i", "x", "c", "d"], [0, 20, 30]], ["allin", "home", ["i", "x", "c", "d"], [2, 26]], ["farmbat", "farm", ["g", "c", "d"], [5, 33]], ["farmtank", "farm", ["g", "y", "h"], [10, 40]], ["farmall", "farm", ["g", "c", "d", "y", "h"], [3, 30]]];
  for (const [id, site, keys, weeks] of TIES) {
    const s = id === "farmall" ? st({ site: "farm", wind: 300, line: 100, fb: 1000, el: 200, tank: 200, take: 2000, sale: "tou" }) : E0.withPreset(E0.defaults(), E0.presets.find(q => q.id === id));
    for (const w of weeks) {
      const f = await face(s, E0.periods(P, s, "week")[w], keys);
      Object.keys(f).filter(k => k !== "share").forEach(k => ok(f[k][2] === "optimal" && f[k][3] === "optimal" && Math.abs(f[k][1] - f[k][0]) <= 0.01 + 1e-4 * Math.abs(f[k][1]),
        `tie rule: ${id}, week ${w + 1}: the total of ${k} is the same on every least-cost schedule (${f[k][0].toFixed(4)} to ${f[k][1].toFixed(4)})`));
      ok(f.share[1] - f.share[0] <= 1e-5, `tie rule: ${id}, week ${w + 1}: ${site === "home" ? "own solar's share" : "the wind spilled"} is the same on every schedule found (${f.share[0].toFixed(5)} to ${f.share[1].toFixed(5)})`);
    }
  }
  // the busiest grid hour is not shared by every least-cost schedule once a battery charges from the grid (the review's
  // case, week 1): the least import that hour can take on the optimal face is far below the schedule's own peak
  {
    const s = GRIDCHARGE, p = E0.periods(P, s, "week")[0], m = E0.build(P, s, { periods: [p] }), r = solver(m), tol = 1e-7 * Math.max(1, Math.abs(r.objective));
    const row = { name: "opt", terms: {}, le: r.objective + tol }; m.variables.forEach(v => { if (v.cost) row.terms[v.name] = v.cost; });
    let hk = 0; for (let h = 0; h < 168; h++) if (r.values["i0_" + h] > r.values["i0_" + hk]) hk = h;
    const lo = solver({ sense: "min", variables: m.variables.map(v => Object.assign({}, v, { cost: v.name === "i0_" + hk ? 1 : 0 })), constraints: m.constraints.concat([row]) });
    ok(lo.status === "optimal" && lo.objective < r.values["i0_" + hk] - 1, `ties: the busiest grid hour differs between least-cost schedules (${r.values["i0_" + hk].toFixed(2)} kWh, or ${lo.objective.toFixed(2)} kWh on another)`);
    const R0 = results.gridcharge.results, R1 = results.solar.results, F1 = results.farmtank.results, F0 = results.farmel.results;
    ok(R0.stores && R0.readouts.find(x => x.key === "grid").note.indexOf(E0.SCHED) >= 0 && R1.readouts.every(x => x.note.indexOf(E0.SCHED) < 0), "with a battery the hour counts are labelled as the schedule shown; without one (a unique schedule) they are not");
    ok(["spill", "h2"].every(k => F1.readouts.find(x => x.key === k).note.indexOf(E0.SCHED) >= 0) && F0.readouts.every(x => x.note.indexOf(E0.SCHED) < 0), "the farm: with a tank, the hours at the line and the buyer's limit are labelled; with none, not");
  }

  // ---------------- money
  {
    const cf = E0.cashflow([{ capex: 100, fom: 0, life: 15 }], 10, 25, 0);
    ok(cf.rows[15].replace === 100 && near(cf.rows[25].residual, 100 * 5 / 15, 1e-9) && near(cf.npv, -100 + 250 - 100 + 100 / 3, 1e-9), "cash flow: replaced in year 15; a third of its life left at year 25");
    const cf2 = E0.cashflow([{ capex: 100, fom: 1, life: 30 }], 10, 30, 0.04);
    ok(cf2.rows.every(r => r.replace === 0) && cf2.rows[30].residual === 0 && near(cf2.rows[1].net, 9, 1e-12), "cash flow: a 30-year life on a 30-year horizon is bought once");
    const r = results.solar, raw = r.raw;
    const r2 = E0.summarize(st({ pv: 6, rate: 7 }), E0.recost(raw, st({ pv: 6, rate: 7 })));
    ok(r2.money.npv < r.results.money.npv && near(r2.money.saving, r.results.money.saving, 1e-9), "a higher rate lowers the NPV and leaves the operation alone");
  }
  // sensitivity: a case not run again equals a fresh solve; the farm's equipment cost is run again when an electrolyzer
  // wears with use (the review's cases: 50 MW, $4/kg and $3.25/kg)
  for (const s of [st({}), st({ site: "farm" }), st({ site: "farm", el: 50 }), st({ site: "farm", el: 50, h2: 3.25 })]) {
    const base = await run(s), sens = await E0.sensitivity(s, P, base, { solver });
    for (const r of sens.rows) for (const [side, v] of [["lo", r.atLo], ["hi", r.atHi]]) {
      const row = E0.sensRows(s).find(x => x.key === r.key), fresh = await run(Object.assign({}, s, row[side]));
      ok(rel(v, fresh.results.money.npv, 1e-9), `sensitivity ${s.site}${s.el ? " " + s.el + " MW at $" + s.h2 + "/kg" : ""}: ${r.key} ${side} = a fresh solve (${E0.fmt.money(v)} vs ${E0.fmt.money(fresh.results.money.npv)})${r.rerun ? ", run again" : ""}`);
    }
    if (s.site === "farm" && s.el > 0) ok(sens.rows.find(r => r.key === "cost").rerun && sens.rows.find(r => r.key === "cost").why === "wear", "farm with an electrolyzer: the equipment cost is run again (it changes the stack wear)");
    if (s.site === "farm") ok(sens.rows.find(r => r.key === "line").limit && /connection limit; its cost is not counted/.test(E0.sensWords(s, sens).line) && /cost not counted/.test(sens.rows.find(r => r.key === "line").label), "farm: the line's cases are a connection-limit scenario, its cost not counted, said on the chart's bar and in the note");
    const w = E0.sensWords(s, sens);
    ok(wcount(w.note) <= 35, "the chart's note within 35 words (" + wcount(w.note) + ")");
    ok(sens.rows.every(r => w.line.indexOf(E0.fmt.money(r.atLo)) >= 0 && w.line.indexOf(E0.fmt.money(r.atHi)) >= 0) && /held fixed/.test(w.line), "the sensitivity in words carries every bar of the chart (" + s.site + ")");
  }
  {
    const s = st({ site: "farm", el: 50, h2: 3.25 }), r = await run(s), raw = E0.recost(r.raw, Object.assign({}, s, { cost: 125 }));
    ok(near(raw.tot.wear, r.raw.tot.el * E0.costs(D, Object.assign({}, s, { cost: 125 })).elWear, 1e-6) && rel(raw.tot.revenue, raw.tot.sales + raw.tot.h2Rev - raw.tot.wear, 1e-12), "recost (farm): the stack wear and the net revenue are priced again at the new cost");
  }
  // sizing beats its neighbours on the representative weeks
  for (const x of [{ site: "home", tariff: "tou", cost: 50 }, { site: "farm", line: 50, h2: 6 }]) {
    const s = st(x), z = await run(s, { size: true });
    ok(z.ok && z.results.sizes && z.results.snapped, `size it (${JSON.stringify(x)}): optimal with sizes`);
    const keys = s.site === "home" ? ["pv", "hb"] : ["fb", "el", "tank"];
    const at = async zz => { const q = Object.assign({}, s); keys.forEach(k => { q[k] = zz[k]; }); const rr = await run(q, { mode: "reps" }); const it = E0.items(q, rr.raw).reduce((a, i) => a + (i.key === "wind" ? 0 : i.capex * E0.crf(q.rate / 100, i.life) + i.fom), 0);
      return (s.site === "home" ? rr.raw.tot.cost : -rr.raw.tot.revenue) + it; };
    const best = await at(z.results.sizes);
    for (const k of keys) for (const d of [-1, 1]) {
      const f = E0.field(k), zz = Object.assign({}, z.results.sizes); zz[k] = Math.min(f.max, Math.max(0, zz[k] + d * (f.step || 1)));
      if (zz[k] === z.results.sizes[k]) continue;
      ok(best <= await at(zz) + 1e-6 * Math.abs(best) + 1e-6, `size it: ${k} ${d > 0 ? "+" : "−"} one step costs no less (${JSON.stringify(x)})`);
    }
    keys.forEach(k => ok(z.results.snapped[k] % (E0.field(k).step || 1) < 1e-9 || near(z.results.snapped[k] % E0.field(k).step, E0.field(k).step, 1e-9), `size it: ${k} snapped to the control's step`));
  }

  // ---------------- failure states (a stubbed solver) and the run box's words
  const stub = r => () => r;
  for (const [what, solverX, want] of [["time limit", stub({ status: "time-limit", ok: false }), "time-limit"], ["infeasible", stub({ status: "infeasible", ok: false }), "infeasible"],
    ["throws", () => { throw new Error("boom"); }, "error"], ["rejects", () => Promise.reject(new Error("worker died")), "error"], ["nothing", stub(null), "error"]]) {
    let r = null, rejected = false;
    try { r = await E0.solve(st({}), P, { solver: solverX }); } catch (e) { rejected = true; }
    ok(!rejected && r && r.status === want && r.ok === false && r.results === null, `solve never rejects: ${what} -> ${r && r.status}`);
    const c = BR.classify(r);
    ok(c.retry && !c.draw && !/optimal|best/i.test(c.text.replace("not proven best", "")), `run box: ${what} offers Try again and claims nothing (${c.text.slice(0, 60)})`);
    if (want === "infeasible") ok(r.hint === E0.HINT && c.text.indexOf(E0.HINT) >= 0, "infeasible: the hint is said");
  }
  {
    let n = 0; const ac = { aborted: false }, slow = m => { n++; if (n === 3) ac.aborted = true; return solver(m); };
    const r = await E0.solve(st({}), P, { solver: slow, signal: ac });
    ok(r.status === "cancelled" && n === 3, "a cancelled run stops between weeks (" + n + " weeks solved)");
    const ok1 = await run(st({}));
    ok(BR.classify(ok1).kind === "ok" && /optimal/.test(BR.classify(ok1, { ok: "Done: the cheapest way to run this plan through every hour of 2025, as 52 weeks (the solver reports each one optimal)." }).text), "a finished run says optimal, from the solver's status");
    const mid = await E0.solve(st({}), P, { solver: (() => { let k = 0; return m => (++k === 10 ? { status: "time-limit", ok: false } : solver(m)); })() });
    ok(mid.status === "time-limit" && mid.message.indexOf("week of " + E0.periods(P, st({}), "week")[9].start) >= 0, "a stop in week 10 says which week (" + mid.message + ")");
    const said = BR.classify(mid).text;
    ok(/time limit/.test(said) && /no new result is shown/.test(said) && said.indexOf("the week of " + E0.periods(P, st({}), "week")[9].start) >= 0, "the learner reads why and where it stopped: " + said);
    const inf = await E0.solve(st({}), P, { solver: (() => { let k = 0; return m => (++k === 3 ? { status: "infeasible", ok: false } : solver(m)); })() });
    const isaid = BR.classify(inf).text;
    ok(/No way to run this plan meets every rule in the week of /.test(isaid) && isaid.indexOf(E0.HINT) > 0, "an infeasible week: the reason, the week and the hint: " + isaid.slice(0, 90));
    const err = await E0.solve(st({}), P, { solver: () => { throw new Error("boom"); } });
    ok(/boom/.test(BR.classify(err).text) && /week of/.test(BR.classify(err).text), "a failed week: the error and the week");
  }

  // ---------------- the bench's view on a stub page: sizes are written only onto the plan they were found for (review
  // 2026-11-03: sizing the home, then switching to the farm, set the farm's battery, electrolyzer and tank to undefined)
  {
    const SD = require("./stubdom.js"), E = SD.env();
    SD.El.prototype.insertBefore = SD.El.prototype.insertBefore || function (c, ref) { if (c.parentNode) c.remove(); c.parentNode = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; };
    E.LX.Slider = (host, o) => { const el = E.LX.H("div", { class: "stub-slider", "data-id": o.label }, host); return { el, set() {} }; };
    E.LX.Plot = host => ({ render() {}, el: E.LX.H("div", null, host) });
    E.LX.solver = { solve: m => Promise.resolve(solver(m)) };
    SD.load("sharestate", E); SD.load("benchrun", E); SD.load("engine-e0", E);
    const live = E.LX.H("div", null, E.body), rh = E.LX.H("div", null, E.body);
    const B = E.LX.E0.ui.bench(live, { P, resultsHost: rh, id: "sb0" });
    const settle = async () => { for (let i = 0; i < 5000 && B.sizer.running(); i++) await new Promise(r => setImmediate(r)); for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
    const sizeBtn = SD.buttons(live, /^Size it for me$/)[0], farmBtn = SD.buttons(live, /^Ridge wind farm$/)[0], homeBtn = SD.buttons(live, /^Prairie Town home$/)[0];
    const sizerSays = () => B.sizer.status.textContent;
    sizeBtn.click();
    ok(B.sizer.running(), "view: Size it for me starts a sizing run");
    farmBtn.click();
    await settle();
    let pl = B.plan();
    ok(!B.sizer.running() && /plan on the controls changed/.test(sizerSays()) && pl.site === "farm" && ["fb", "el", "tank"].every(k => pl[k] === 0) && pl.pv === 6 && pl.hb === 0,
      "view: switching sites while the home is sized stops the sizing; the farm's fields keep their values (" + JSON.stringify({ fb: pl.fb, el: pl.el, tank: pl.tank }) + ")");
    ok(SS.validate(E0.schema, pl).length === 0 && SS.decode(E0.schema, SS.encode(E0.schema, pl)).status === "ok", "view: the plan stays valid and its link round-trips after the stopped sizing");
    B.sizer.again.click(); await settle();
    pl = B.plan();
    ok(/plan on the controls changed/.test(sizerSays()) && pl.site === "farm" && pl.fb === 0 && pl.el === 0, "view: Try again on the home's sizing, with the farm on the controls, stops at once and writes nothing");
    sizeBtn.click(); await settle();
    pl = B.plan();
    const want = await run(Object.assign({}, pl, { fb: 0, el: 0, tank: 0 }), { size: true });
    ok(/^Sized/.test(sizerSays()) && ["fb", "el", "tank"].every(k => pl[k] === want.results.snapped[k]), "view: sizing the farm writes its own least-cost sizes (" + JSON.stringify({ fb: pl.fb, el: pl.el, tank: pl.tank }) + ")");
    homeBtn.click(); sizeBtn.click(); E.LX.E0.ui.SIZE_KEYS.home.forEach(() => {}); B.set({ pv: 8 }); await settle();
    pl = B.plan();
    ok(pl.site === "home" && pl.pv === 8 && pl.hb === 0 && /plan on the controls changed/.test(sizerSays()), "view: a control changed while the home is sized stops the sizing; the reader's value stays");
  }

  // ---------------- the plan link
  ok((() => { try { SS.checkSchema(E0.schema); SS.checkSchema(E0.schemaFor("c0")); return true; } catch (e) { console.log(e.message); return false; } })(), "the schema (and the capstone's copy) pass ShareState.checkSchema");
  const D0 = E0.defaults();
  ok(SS.validate(E0.schema, D0).length === 0 && SS.decode(E0.schema, SS.encode(E0.schema, D0)).status === "ok", "defaults: valid, and the link round-trips");
  E0.presets.forEach(p => { const s = E0.withPreset(D0, p), h = SS.encode(E0.schema, s), d = SS.decode(E0.schema, h);
    ok(SS.validate(E0.schema, s).length === 0 && d.status === "ok" && SS.same(E0.schema, d.state, s), `preset ${p.id}: valid and round-trips (${h})`); });
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let rt = 0;
  for (let k = 0; k < 300; k++) {
    const s = {};
    E0.schema.fields.forEach(f => { if (f.type === "enum") s[f.id] = f.values[Math.floor(rnd() * f.values.length)]; else { const n = Math.round((f.max - f.min) / (f.step || 1)); s[f.id] = +(f.min + Math.floor(rnd() * (n + 1)) * (f.step || 1)).toFixed(4); } });
    const d = SS.decode(E0.schema, SS.encode(E0.schema, s)); if (d.status === "ok" && SS.same(E0.schema, d.state, s)) rt++;
  }
  ok(rt === 300, "300 random plans round-trip through the link (" + rt + ")");
  ok(SS.decode(E0.schema, "#sb0-v1-s1-pv6-hb0").status === "bad" && SS.decode(E0.schema, "#sb0-v2-s0").status === "newer", "a damaged or newer link is refused");
  ok(SS.decode(E0.schemaFor("c0"), SS.encode(E0.schema, D0)).status === "none", "a Site Bench link does not open on the capstone (its own key)");

  // ---------------- the page's generated blocks and numbers
  if (WRITE) {
    const def = await run(D0);
    D.reference = { about: "Written by node _tests/learn/test_sb0-site-bench.js --write: the default plan's results (the no-JS blocks) and the check of the 52-week run against one full-year LP for each preset.",
      "default": { date: new Date().toLocaleDateString("en-CA"), state: D0, readouts: def.results.readouts }, check: Object.assign(check, { date: new Date().toLocaleDateString("en-CA") }) };
    fs.writeFileSync(L("data/e0.json"), JSON.stringify(D, null, 1) + "\n");
  }
  const DD = J("e0.json");
  ok(DD.reference && DD.reference.default && DD.reference.check, "e0.json has its reference block (run --write)");
  if (DD.reference) {
    const def = await run(D0);
    ok(JSON.stringify(DD.reference.default.readouts) === JSON.stringify(def.results.readouts), "the stored default results equal a fresh run");
    DD.reference.check.rows.forEach((r, i) => ok(check.rows[i] && r.weeks === check.rows[i].weeks && r.year === check.rows[i].year, "the stored check equals a fresh one: " + r.id));
  }
  const BLOCKS = PAGE_JS.staticBlocks(DD, X, P, E0, SS);
  const MARK = { bench: "sb0-bench", results: "sb0-results", explain: "sb0-explain", inputs: "sb0-inputs", sources: "sb0-sources" };
  function between(q, name) { const a = q.indexOf("<!-- " + name + ":start"), b = q.indexOf("<!-- " + name + ":end -->"); if (a < 0 || b < 0) return null; return { a: q.indexOf("\n", a) + 1, b: b }; }
  let Q = fs.readFileSync(QPATH, "utf8");
  if (WRITE) { Object.keys(MARK).forEach(k => { const r = between(Q, MARK[k]); if (!r) throw new Error(MARK[k] + " markers missing"); Q = Q.slice(0, r.a) + BLOCKS[k] + "\n" + Q.slice(r.b); }); fs.writeFileSync(QPATH, Q); }
  Object.keys(MARK).forEach(k => { const r = between(Q, MARK[k]); ok(r && Q.slice(r.a, r.b) === BLOCKS[k] + "\n", `page block ${MARK[k]} equals the engine's (run --write)`); });
  // every readout the default run shows is in the no-JS block
  if (DD.reference) DD.reference.default.readouts.forEach(r => ok(Q.indexOf(r.value.replace(/&/g, "&amp;")) >= 0, "no-JS results show " + r.label + " = " + r.value));
  // the readouts are the engine's numbers
  {
    const r = results.solarbat.results, m = E0.fmt.money;
    ok(r.readouts[0].value === m(r.money.npv) && r.readouts[1].value === m(r.money.saving) && r.readouts[2].value === m(r.money.capex), "readouts: NPV, saving and equipment are the money summary's");
    const f = results.farmel.results;
    ok(f.readouts[1].value === m(f.money.added) && near(f.money.added, f.money.npv - f.money.aloneNpv, 1e-6), "farm: what the extra equipment adds = NPV − the farm alone's");
    ok(f.money.lcoh > 0 && near(f.money.lcoh, (50 * E0.costs(D, st({ site: "farm" })).el.eac + f.tot.wear) / f.tot.h2, 1e-9), "farm: cost per kg = the electrolyzer's yearly cost and wear ÷ kg sold");
  }
  // text: the page's own prose stays short, no AI wording, no nuclear terms, data centers nowhere
  // (the sources list is citations, not prose: left out of the word budget)
  const OWN = Q.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!-- sb0-sources:start[\s\S]*?<!-- sb0-sources:end -->/, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const elems = OWN.replace(/<table[\s\S]*?<\/table>/g, " ").split(/<\/?(?:p|li|dt|dd|div|summary|h[1-6]|blockquote)\b[^>]*>|\n- /).map(t => t.replace(/<[^>]+>/g, "").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\s+/g, " ").trim()).filter(t => t && /[A-Za-z]/.test(t) && !/^(:::|```|---)/.test(t));
  elems.forEach(t => ok(t.split(" ").length <= 35, "text element within 35 words: " + t.slice(0, 70)));
  // what the results draw (captions, tile notes, the sensitivity words): each sentence group within about 35 words
  {
    const wc = t => t.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length, seen = [];
    for (const id of Object.keys(results)) {
      const R0 = results[id].results, s = id === "gridcharge" ? GRIDCHARGE : id === "bigpv" ? BIGPV : E0.withPreset(D0x, E0.presets.find(q => q.id === id)), c = E0.captions(s, R0);
      [c.strip, c.week, c.sched].concat(c.cash).filter(Boolean).forEach(t => seen.push(t));
      R0.readouts.forEach(r => seen.push(r.label + " " + r.value + " " + r.note));
    }
    seen.push(E0.SCHED);
    [...new Set(seen)].forEach(t => ok(wc(t) <= 35, "drawn text within 35 words (" + wc(t) + "): " + t.slice(0, 60)));
  }
  const ALLTEXT = Q + fs.readFileSync(L("sb0-site-bench.js"), "utf8") + fs.readFileSync(L("components/engine-e0.js"), "utf8") + JSON.stringify(DD) + JSON.stringify(X);
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(ALLTEXT), "no nuclear terms anywhere in the bench");
  ok(!/data[- ]cent/i.test(ALLTEXT), "no data centers in the bench");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(ALLTEXT), "no AI wording");
  ok(!/projects\/|research\.html/.test(Q), "no project page and no Research page");

  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
