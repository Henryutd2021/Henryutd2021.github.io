// test_13-capstone.js — Node tests for lesson 13's planning model (assets/learn/components/planengine.js, LX.townPlan; the
// game is assets/learn/13-capstone.js), its data
// (assets/learn/data/13-capstone.json) and every number that learn/13-capstone.qmd states.
//   - inputs: EIA and NREL costs and their sources; capital recovery factors, yearly fixed costs, running costs, CO2 rates
//   - the town's year: wind and solar at EIA's 2025 capacity factors, no solar at night, a 450 MW peak
//   - the seven weeks: weights add up to 8,760 hours, every calendar week is mapped, season energy is kept
//   - the LP: balance, battery limits and the calendar link of the battery's level; objective = reported cost
//   - the precomputed frontier: every point re-solved; cost falls and the cap's shadow price rises as the cap loosens
//   - the optimizer's cap read as zero, binding or loose (a zero cap is never called loose)
//   - the game: the starting plan goes short; the optimizer's 200 kt plan, rounded up, wins every mission on seven weeks
//   - the full-year check (8,760 hours, fixed plans) behind the Go deeper table and the debrief's full-year verdict
//     (demand served and CO2 against the target, judged again); share links; stars
//   - timings of the solves the page makes (Node, this machine)
// Usage (from the site folder):  node _tests/learn/test_13-capstone.js [--full] [--write]
//   --full   also solve the optimizer on all 8,760 hours (slow: about a minute) and print its error against seven weeks
//   --write  recompute the precomputed frontier (13-capstone.json) and lesson 12's six plans (12-trade-offs.json) first
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
const { core, VERSION } = sctx.module.exports;
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const P = pctx.module.exports;
const M = require(L("components/planengine.js"));
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const cfgPath = L("data/13-capstone.json"), t12Path = L("data/12-trade-offs.json");
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const page = fs.readFileSync(path.join(SITE, "learn/13-capstone.qmd"), "utf8"), JS = fs.readFileSync(L("13-capstone.js"), "utf8") + fs.readFileSync(L("components/planengine.js"), "utf8");
const FULL = process.argv.includes("--full"), WRITE = process.argv.includes("--write");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const rel = (a, b, r) => Math.abs(a - b) <= r * Math.max(1, Math.abs(b));
const musd = v => "$" + (v / 1e6).toFixed(1) + "M", kt = v => Math.round(v / 1e3).toLocaleString("en-US") + " kt";
const onPage = (s, what) => ok(page.includes(s), `page states ${what}: "${s}"`);
const median = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

(async () => {
  const highs = await loadHighs();
  const solve = (m, o) => core.solveWith(highs, m, Object.assign({ timeLimit: 600 }, o || {}));
  let cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const Y = M.prepareYear(year, T, cfg, P.townProfile);
  const RW = M.selectWeeks(Y, cfg.weeks), per = M.periodsOf(RW);
  let C = M.costs(cfg, {});

  // ---------------- --write: the precomputed frontier and lesson 12's plans
  if (WRITE) {
    const r1 = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
    cfg.frontier.points = cfg.frontier.caps.map(cap => {
      const o = cap == null ? {} : { cap: cap * 1e3 }, r = solve(M.weekModel(C, RW, o)), s = M.summarize(C, per, r, o);
      const plan = {}; M.KEYS.forEach(k => { plan[k] = r1(s.plan[k], 1); });
      return { cap, cost: r1(s.cost, 0), co2: r1(s.co2, 0), dual: s.capDual == null ? null : r1(s.capDual, 2), spilled: r1(s.spilledShare, 4), plan };
    });
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 1) + "\n");
    const t12 = JSON.parse(fs.readFileSync(t12Path, "utf8"));
    t12.plans.forEach(p => {
      const plan = Object.assign({ wind: 0, solar: 0, cc: 0, pk: 0, nuc: 0, bp: 0, be: 0 }, p.plan);
      const s = M.summarize(C, per, solve(M.weekModel(C, RW, { plan })), { plan });
      p.result = { cost: r1(s.cost, 0), co2: r1(s.co2, 0), unserved: r1(s.unserved, 1), spilled: r1(s.spilledShare, 4) };
    });
    fs.writeFileSync(t12Path, JSON.stringify(t12, null, 1) + "\n");
    console.log("wrote the frontier (13-capstone.json) and lesson 12's plans (12-trade-offs.json)");
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  }

  // ---------------- inputs and their sources
  const tc = cfg.techs;
  ok(tc.wind.capex === 1712 && tc.wind.fom === 34.57 && tc.solar.capex === 1484 && tc.solar.fom === 23.6, "EIA AEO2026 Table 3: wind $1,712/kW + $34.57/kW-yr, solar $1,484/kW + $23.60");
  ok(tc.cc.capex === 1086 && tc.cc.fom === 16.23 && tc.cc.vom === 3.49 && tc.cc.heatRate === 6.226, "EIA Table 3: combined-cycle single-shaft $1,086/kW, $16.23, $3.49/MWh, 6,226 Btu/kWh");
  ok(tc.pk.capex === 1158 && tc.pk.fom === 7.18 && tc.pk.vom === 4.17 && tc.pk.heatRate === 9.142, "EIA Table 3: industrial-frame turbine $1,158/kW, $7.18, $4.17/MWh, 9,142 Btu/kWh");
  ok(tc.nuc.capex === 8255 && tc.nuc.fom === 163.4 && tc.nuc.vom === 2.62 && tc.nuc.fuel === 6.64 && tc.nuc.avail === T.reference.nuclear.cf, "EIA: light-water $8,255/kW, $163.40, $2.62/MWh; fuel 6.64 mills/kWh; 91.1% (cf_targets.json)");
  ok(tc.battery.energyCapex === 241 && tc.battery.powerCapex === 372 && near(tc.battery.energyCapex + tc.battery.powerCapex / 4, 334) && tc.battery.rte === 0.85 && tc.battery.life === 15 && tc.battery.fomShare === 0.04,
     "NREL battery 2025 update: $241/kWh + $372/kW (4-hour $334/kWh), 85% round trip, 15 years, O&M 4%");
  ok(cfg.fuel.gas === 3.85 && cfg.fuel.co2PerMMBtu === 52.91 && cfg.finance.wacc === 4 && cfg.finance.life === 30, "gas $3.85/MMBtu, 52.91 kg/MMBtu, 4% real, 30 years");
  Object.keys(tc).forEach(k => (tc[k].src || []).forEach(id => {
    const s = cfg.sources[id];
    ok(s && /^https:\/\/(www\.|docs\.|atb\.)?(eia\.gov|nlr\.gov|nrel\.gov)\//.test(s.url) && s.asOf && s.text, `source ${id} of ${k}: allow-listed URL, text and date`);
  }));
  [cfg.finance.src, cfg.fuel.src].forEach(list => list.forEach(id => ok(cfg.sources[id] && cfg.sources[id].asOf, `source ${id} has a date`)));

  // ---------------- cost identities (and the numbers in Go deeper)
  ok(near(M.crf(0.04, 30), 0.0578301, 1e-6) && near(M.crf(0.04, 15), 0.0899411, 1e-6), "capital recovery factors 0.0578 (30 y) and 0.0899 (15 y) at 4%");
  ok(near(C.techs.wind.fixed, 1000 * (1712 * M.crf(0.04, 30) + 34.57), 1e-6) && near(C.techs.wind.fixed / 1e3, 133.6, 0.05), `wind: $${(C.techs.wind.fixed / 1e3).toFixed(1)}k per MW-year`);
  ok(near(C.techs.cc.run, 6.226 * 3.85 + 3.49, 1e-9) && near(C.techs.cc.run, 27.46, 0.005), `combined-cycle running cost $${C.techs.cc.run.toFixed(2)}/MWh`);
  ok(near(C.techs.cc.co2, 6.226 * 0.05291, 1e-12) && near(C.techs.cc.co2, 0.329, 0.0005) && near(C.techs.pk.co2, 0.484, 0.0005), "CO2: 0.329 t/MWh (CC), 0.484 (peaker)");
  ok(near(C.techs.nuc.fixedTotal, C.techs.nuc.fixed + (6.64 + 2.62) * 0.911 * 8760, 1e-6), "nuclear runs flat: fuel and O&M per MWh become a yearly cost per MW");
  ok(near(C.techs.be.fixed, 1000 * 241 * (M.crf(0.04, 15) + 0.04), 1e-6) && near(C.techs.bp.fixed, 1000 * 372 * (M.crf(0.04, 15) + 0.04), 1e-6), "battery: energy and power parts, 15-year recovery + 4% O&M");
  onPage("0.0578", "the capital recovery factor"); onPage("1{,}712 \\times 0.05783 + 34.57 = \\$133.6", "wind's yearly cost");
  ok((1712 * 0.05783 + 34.57).toFixed(1) === "133.6" && (1712 * M.crf(0.04, 30) + 34.57).toFixed(1) === "133.6", "the printed factor 0.05783 reproduces the printed $133.6 (shared fix 11, K3)");
  onPage("6.226 \\times \\$3.85 + \\$3.49 = \\$27.46", "the CC running cost"); onPage("6.226 \\times 0.05291 = 0.329", "the CC CO2 rate");
  onPage("0.329\\, g_t + 0.484\\, q_t", "the CO2 row"); onPage("0.911\\,K_\\mathrm{nuc}", "nuclear availability"); onPage("0.85\\,c_t", "the round trip");
  // a scenario changes only what it should
  const C2 = M.costs(cfg, { gas: 6, nucCapex: 4000 });
  ok(near(C2.techs.cc.run, 6.226 * 6 + 3.49) && C2.techs.nuc.capex === 4000 && near(C2.techs.wind.fixed, C.techs.wind.fixed), "scenario: gas price and nuclear capital cost change, nothing else");

  // ---------------- the town's year
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  ok(near(mean(Y.wind), T.targets.wind.cf, 1e-6) && near(mean(Y.solar), T.targets.solar.cf, 1e-6), "wind 33.8% and solar 24.0% a year (EIA 2025, townProfile scale)");
  ok(Y.solar.every((v, i) => year.solar[i] > 0 || v === 0) && JS.indexOf("nightless") < 0, "solar is zero wherever town_year.json is (night set to zero by the data build, no lesson-local rule)");
  ok(near(Y.peak, 450, 1e-9) && Y.demand.length === 8760, "demand peaks at 450 MW; 8,760 hours");
  onPage("scaled to a 450 MW peak", "the peak");

  // ---------------- the seven weeks
  ok(RW.reps.length === 7 && RW.reps.map(r => r.kind).join() === "season,season,season,season,peak,netpeak,calm", "seven weeks: four seasons, peak, net peak, least wind");
  ok(near(RW.reps.reduce((s, r) => s + r.weight * 168, 0), 8760, 1e-6), "the weights cover 8,760 hours");
  ok(RW.chrono.length === 52 && RW.chrono.every((k, i) => RW.reps[k].members.indexOf(i) >= 0), "every calendar week maps to the representative week that stands for it");
  const nS = RW.reps.filter(r => r.kind === "season").map(r => r.n);
  ok(nS.length === 4, `seasons stand for ${nS.join(", ")} weeks`);
  onPage(`${nS[0]} (winter), ${nS[1]} (spring), ${nS[2]} (summer) or ${nS[3]} (fall) weeks`, "the season weights");
  RW.reps.filter(r => r.kind === "season").forEach(r => {
    let real = 0, model = 0; r.members.forEach(m => { for (let h = 0; h < 168; h++) real += Y.demand[m * 168 + h]; }); r.demand.forEach(d => { model += d * r.n; });
    ok(rel(model, real, 1e-9), `${r.season}: the scaled week keeps the season's demand energy`);
  });
  const peakWeek = Math.floor(Y.demand.indexOf(Y.peak) / 168);
  ok(RW.reps.some(r => r.kind === "peak" && r.week === peakWeek), "the week of the year's peak hour is kept");

  // ---------------- the LP: sizes, identities, the battery link
  const opt200 = M.weekModel(C, RW, { cap: 200e3 }), fixedFull = M.fullYearModel(C, Y, { plan: cfg.start.plan });
  console.log(`  model sizes: 7-week optimizer ${opt200.variables.length} columns x ${opt200.constraints.length} rows; full-year fixed plan ${fixedFull.variables.length} x ${fixedFull.constraints.length}`);
  const rO = solve(opt200), sO = M.summarize(C, per, rO, { cap: 200e3 });
  ok(rO.ok && rel(rO.objective, sO.cost, 1e-9), "optimizer: objective = reported yearly cost");
  ok(sO.co2 <= 200e3 + 1 && sO.unserved === 0, "optimizer: CO2 within the cap, every hour served");
  let balOK = true, batOK = true;
  per.forEach((Pd, p) => {
    const ws = M.weekSeries(C, Pd, rO.values, p, sO.plan);
    ws.demand.forEach((d, h) => { const sup = ws.nuc[h] + ws.wind[h] + ws.solar[h] + ws.dis[h] + ws.cc[h] + ws.pk[h] + ws.unserved[h] - ws.ch[h]; if (sup < d - 1e-5 || !near(sup - d, ws.spilled[h], 1e-6)) balOK = false; });
  });
  ok(balOK, "every modelled hour: supply covers demand; the rest is spilled");
  // the battery's real level in every calendar week stays within [0, MWh], and the year ends where it began
  const plan200 = sO.plan;
  if (plan200.be > 1e-6) {
    for (let i = 0; i < 52; i++) {
      const k = RW.chrono[i], W0 = rO.values["W" + i];
      for (let h = 0; h < 168; h++) { const lvl = W0 + rO.values["s" + k + "_" + h]; if (lvl < -1e-5 || lvl > plan200.be + 1e-5) batOK = false; }
      const nx = rO.values["W" + ((i + 1) % 52)];
      if (!near(nx, W0 + rO.values["s" + k + "_167"], 1e-5)) batOK = false;
    }
  }
  ok(batOK, "battery: the linked level stays within [0, MWh] in all 52 calendar weeks; the year closes");
  // a fixed plan: objective = running cost + penalty, as the page reports cost apart from unserved energy
  const start = cfg.start.plan, rS = solve(M.weekModel(C, RW, { plan: start })), sS = M.summarize(C, per, rS, { plan: start });
  ok(rel(rS.objective, sS.cost - sS.fixed - sS.energy.nuc * C.techs.nuc.run + cfg.unservedPenalty * sS.unserved, 1e-9), "fixed plan: objective = gas running cost + penalty x unserved");
  ok(sS.unserved > 1, `the starting plan (lesson 0's plants) goes short: ${sS.unserved.toFixed(0)} MWh unserved, so the opening question's answer is "no"`);

  // ---------------- the precomputed frontier
  const pts = cfg.frontier.points;
  ok(pts.length === cfg.frontier.caps.length, "one frontier point per cap");
  const times = [];
  pts.forEach(p => {
    const o = p.cap == null ? {} : { cap: p.cap * 1e3 }, r = solve(M.weekModel(C, RW, o)), s = M.summarize(C, per, r, o);
    if (p.cap != null && p.cap >= 25) times.push(r.ms.solve);
    ok(r.ok && rel(s.cost, p.cost, 1e-6) && near(s.co2, p.co2, 1) && (p.dual == null || p.cap === 0 || rel(s.capDual, p.dual, 1e-3)), `frontier at ${p.cap == null ? "no cap" : p.cap + " kt"}: ${musd(s.cost)}, ${kt(s.co2)}`);
  });
  const capped = pts.filter(p => p.cap != null).sort((a, b) => b.cap - a.cap);
  ok(capped.every((p, i) => i === 0 || p.cost >= capped[i - 1].cost - 1), "tighter caps never cost less");
  ok(capped.filter(p => p.cap > 0).every((p, i, a) => i === 0 || p.dual >= a[i - 1].dual - 0.01), "the cap's shadow price rises as the cap tightens (a convex frontier)");
  const at = cap => pts.find(p => p.cap === cap), free = pts.find(p => p.cap == null);
  ok(near(M.frontierAt(pts, at(200).co2), at(200).cost, 1e-6) && M.frontierAt(pts, (at(150).co2 + at(200).co2) / 2) >= (at(150).cost + at(200).cost) / 2 - 1, "frontierAt: exact at solved points, straight lines between");
  // the static fallback table
  const gas = p => Math.round(p.plan.cc + p.plan.pk) + " MW", mw = v => Math.round(v) + " MW", bat = p => Math.round(p.plan.bp) + " / " + Math.round(p.plan.be);
  [[null, "none (" + kt(free.co2) + ")"], [600, "600 kt"], [400, "400 kt"], [200, "200 kt"], [100, "100 kt"], [0, "0 kt"]].forEach(([cap, lab]) => {
    const p = pts.find(q => q.cap === cap);
    onPage(`<tr><td>${lab}</td><td>${musd(p.cost)}</td><td>${mw(p.plan.wind)}</td><td>${mw(p.plan.solar)}</td><td>${gas(p)}</td><td>${mw(p.plan.nuc)}</td><td>${bat(p)}</td></tr>`, `the fallback row for ${lab} (battery MW / MWh)`);
  });
  onPage("Battery (MW / MWh)", "the battery column names both sizes");
  // myths and the quick question
  onPage(`at 100 kt the optimizer keeps ${gas(at(100))} of gas and adds solar and a battery`, "the first myth");
  ok(at(100).plan.bp > 0.5, "at 100 kt the optimizer builds a battery");
  onPage(`At a 100 kt cap the optimizer spills ${Math.round(at(100).spilled * 100)}% on purpose`, "the spill myth");
  onPage(`The cheapest plan at 150 kt costs ${musd(at(150).cost)}`, "the quick question");
  const qq = 140.0 / +(at(150).cost / 1e6).toFixed(1) - 1, gapM = (140.0 - +(at(150).cost / 1e6).toFixed(1)).toFixed(1);
  onPage(`${(qq * 100).toFixed(1)}%: 140.0 ÷ ${(at(150).cost / 1e6).toFixed(1)} − 1 = ${qq.toFixed(3)}. You could cut cost by $${gapM}M`, `the quick question's answer (${(qq * 100).toFixed(1)}%)`);

  // ---------------- what the optimizer's cap means (the line under its plan): zero, binding, or loose
  const capAt = cap => M.summarize(C, per, solve(M.weekModel(C, RW, { cap })), { cap });
  const z0 = capAt(0), c900 = capAt(900e3);
  ok(M.capReading(0, z0).kind === "zero" && z0.cost > 2 * free.cost, `a zero cap is read as "zero" (it binds: ${musd(z0.cost)} against ${musd(free.cost)} with no cap), never as "does not bind"`);
  ok(M.capReading(200e3, sO).kind === "binds" && near(M.capReading(200e3, sO).dual, at(200).dual, 0.01), "a 200 kt cap binds, with its shadow price");
  ok(M.capReading(900e3, c900).kind === "free" && c900.co2 < 900e3 - 1e3, `a 900 kt cap is looser than the cheapest plan's ${kt(c900.co2)}: "does not bind"`);
  ok(JS.indexOf("This plan meets a zero operational-CO₂ cap") > 0 && JS.indexOf('rd.kind === "zero"') > 0 && JS.indexOf("this is the cheapest plan of all") < 0, "the page words the zero cap apart from a loose cap");
  ok(!/every light on, all year/i.test(JS + page), "no 'every light on, all year' claim from seven weeks");

  // ---------------- the game's missions are reachable with the optimizer's plan
  const lim = cfg.limits, target = cfg.game.co2Target * 1e3;
  const p200 = M.ceilPlan(at(200).plan, lim), r200 = solve(M.weekModel(C, RW, { plan: p200 })), s200 = M.summarize(C, per, r200, { plan: p200 });
  ok(M.KEYS.every(k => p200[k] >= at(200).plan[k] - 1e-6 && p200[k] % lim[k].step === 0), "ceilPlan rounds up to the sliders' steps");
  const exact = M.summarize(C, per, solve(M.weekModel(C, RW, { cap: s200.co2 })), { cap: s200.co2 }).cost;
  const st = M.stars(s200, target, exact);
  ok(s200.unserved === 0 && s200.co2 <= target && st.gap <= cfg.game.costSlack && st.lights === 3 && st.co2 === 3,
     `the optimizer's 200 kt plan, rounded up: every hour served, ${kt(s200.co2)}, ${(st.gap * 100).toFixed(1)}% above the frontier`);
  ok(M.stars({ unserved: 100, unservedShare: 0.01, co2: 1e6, cost: 2e8 }, target, 1e8).cost === 1, "stars: no cost stars while lights are out");

  // ---------------- the full-year check (Go deeper table and the third myth)
  const fy = [{ demand: Y.demand, wind: Y.wind, solar: Y.solar, weight: 1 }], fullTimes = [], fyRows = {};
  [400, 200, 100].forEach(cap => {
    const plan = M.ceilPlan(at(cap).plan, lim);
    const w = M.summarize(C, per, solve(M.weekModel(C, RW, { plan })), { plan });
    const rf = solve(M.fullYearModel(C, Y, { plan })), f = M.summarize(C, fy, rf, { plan });
    fullTimes.push(rf.ms.solve);
    const row = `| Optimizer at ${cap} kt | ${musd(w.cost)} | ${musd(f.cost)} | ${kt(w.co2)} | ${kt(f.co2)} | ${Math.round(f.unserved).toLocaleString("en-US")} MWh |`;
    onPage(row, `the full-year check at ${cap} kt`);
    console.log(`  full-year check at ${cap} kt: cost ${((f.cost / w.cost - 1) * 100).toFixed(1)}%, CO2 ${((f.co2 / w.co2 - 1) * 100).toFixed(1)}%, unserved ${f.unserved.toFixed(0)} MWh (${(f.unserved / f.demand * 1e6).toFixed(0)} per million), spilled ${(w.spilledShare * 100).toFixed(1)}% -> ${(f.spilledShare * 100).toFixed(1)}%`);
    if (cap === 200) onPage(`the optimizer's 200 kt plan emits ${kt(f.co2)} and leaves ${Math.round(f.unserved)} MWh unserved`, "the third myth");
    fyRows[cap] = { w, f, plan };
  });
  // the observations under the table: cost, CO2 against the cap (not against the seven-week estimate), unserved energy
  const over = c => Math.round((fyRows[c].f.co2 / (c * 1e3) - 1) * 100);
  ok(over(200) > 0 && over(100) > over(200), `deeper cuts overshoot their caps more: ${over(200)}% at 200 kt, ${over(100)}% at 100 kt`);
  onPage(`Deeper cuts overshoot their caps: ${kt(fyRows[200].f.co2)} against 200 kt (${over(200)}% over) and ${kt(fyRows[100].f.co2)} against 100 kt (${over(100)}% over)`, "the full-year CO2 overshoot, against the caps");
  ok([400, 200, 100].every(c => fyRows[c].f.cost / fyRows[c].w.cost - 1 <= 0.02), "full-year check: each plan costs at most 2% more");
  onPage("Each plan costs at most 2% more on the full year", "the cost observation");
  const maxU = Math.max(...[400, 200, 100].map(c => fyRows[c].f.unserved));
  ok([400, 200, 100].every(c => fyRows[c].f.unserved / fyRows[c].f.demand < 0.00002), "full-year check: unserved energy under 0.002% of demand, as the page says");
  onPage(`at most ${Math.round(maxU)} MWh, under 0.002% of the year's demand`, "the unserved observation");
  // the debrief's full-year verdict: the optimizer's 200 kt plan, rounded up, fails both missions on the full year
  const v200 = M.fullVerdict(fyRows[200].w, fyRows[200].f, target);
  ok(!v200.served && !v200.co2ok && !v200.held && v200.changed && near(v200.overShare, fyRows[200].f.co2 / target - 1, 1e-12),
     `full-year verdict for the 200 kt plan: ${Math.round(v200.unserved)} MWh unserved, ${kt(v200.co2)}, ${(v200.overShare * 100).toFixed(1)}% over the target: both missions re-judged`);
  const v400 = M.fullVerdict(fyRows[400].w, fyRows[400].f, 400e3);
  ok(!v400.served && v400.co2ok, "full-year verdict judges demand and CO2 separately (400 kt plan: short, but under its cap)");
  ok(M.fullVerdict({ unserved: 0, co2: 1 }, { unserved: 0, co2: 1, unservedShare: 0 }, 2).held, "full-year verdict: a plan that passes both stays held");
  ok(JS.indexOf("model.fullVerdict(s, f, target)") > 0 && JS.indexOf('ms.set("co2", { frac: f.co2 / target, text: "Full year: "') > 0, "the debrief re-judges the missions with the full year");

  // ---------------- share links
  const enc = M.encodePlan(p200, null), dec = M.decodePlan("#" + enc, cfg);
  ok(/^plan(-[a-z]+\d+)+$/.test(enc) && dec && M.KEYS.every(k => dec.plan[k] === p200[k]), `share link round trip: #${enc}`);
  const enc2 = M.encodePlan(p200, { gas: 5.5, nucCapex: 6000 }), dec2 = M.decodePlan(enc2, cfg);
  ok(dec2 && near(dec2.scenario.gas, 5.5) && dec2.scenario.nucCapex === 6000, "share link carries a non-default scenario");
  ok(M.decodePlan("#plan-w99999999", cfg) === null && M.decodePlan("#explain", cfg) === null && M.decodePlan("#plan-w10-s10", cfg) === null, "share link: bad or partial hashes are ignored");
  ok(M.decodePlan("#plan-w99999-s0-g0-p0-n0-b0-e0", cfg).plan.wind === lim.wind.max, "share link: values are clamped to the sliders");

  // ---------------- data strings stay in scope (no nuclear sentence with a risk term; the scan does the rest)
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  const strs = []; (function walk(o) { if (typeof o === "string") strs.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(cfg);
  const bad = []; strs.forEach(s => s.split(/(?<=[.;:!?])\s+/).forEach(x => { if (NUC.test(x) && RISK.test(x.replace(/merit[- ]order|in order to/gi, ""))) bad.push(x); }));
  ok(!bad.length, "no data sentence pairs nuclear with a risk term: " + bad.join(" | "));
  // the data note labels the price-year mix (shared fix 9; converting to one price year is a W3 item)
  onPage("<b>Price years:</b> plant costs and the gas price in 2025 dollars, battery costs in 2024 dollars, as the sources give them, added without conversion.", "the price years of the costs, added unconverted");
  // the data file's `about`: constant costs and the reader-set nuclear capital cost are separate sentences (shared fix 8)
  const aboutS = cfg.about.split(/(?<=[.!?])\s+/);
  ok(aboutS.indexOf("Technology costs are constant for the whole year modelled (no change over time).") >= 0 && aboutS.indexOf("The reader can change two inputs: the gas price and the nuclear capital cost.") >= 0 &&
     !aboutS.some(x => NUC.test(x) && /constant|over time/i.test(x)), "about: constant costs and the reader's nuclear capital cost in separate sentences");
  // the constant nuclear output is labelled a simplification wherever it is used
  onPage("a constant 91.1% of its size every hour", "the constant nuclear output, labelled");
  ok(JS.indexOf("modelled as a constant ") > 0 && JS.indexOf("which cannot show reliability") > 0, "the slider hint and the boundary card call constant nuclear output a simplification");
  const st9 = M.stars({ unserved: 0, unservedShare: 0, co2: 99e3, cost: 1.019e8 }, target, 1e8);
  ok(st9.lights + st9.co2 + st9.cost === 9 && cfg.limits.gas.min <= 6 && cfg.limits.gas.max >= 6, "the practice task is reachable: nine stars under 100 kt within 2% of the frontier; $6/MMBtu is on the gas slider");
  onPage("earn all nine stars with a plan under 100 kt", "the practice task");

  // ---------------- timings (Node; the page solves in a Web Worker with the same HiGHS build)
  const plTimes = []; for (let i = 0; i < 5; i++) plTimes.push(solve(M.weekModel(C, RW, { plan: p200 })).ms.solve);
  console.log(`  solve times (Node, this machine): 7-week optimizer median ${median(times).toFixed(0)} ms, max ${Math.max(...times).toFixed(0)} ms over ${times.length} caps; ` +
              `your plan's year median ${median(plTimes).toFixed(0)} ms; full-year check median ${median(fullTimes).toFixed(0)} ms`);

  // ---------------- --full: the optimizer on all 8,760 hours (Go deeper's sentence on it is checked only here)
  if (!FULL) console.log("  (the full-year optimizer sentence in Go deeper is checked with --full)");
  if (FULL) {
    for (const cap of [null, 400, 200, 100]) {
      const o = cap == null ? {} : { cap: cap * 1e3 }, t0 = Date.now();
      const rf = solve(M.fullYearModel(C, Y, o)), f = M.summarize(C, fy, rf, o), w = pts.find(p => p.cap === cap);
      ok(rf.ok, `full-year optimizer at ${cap == null ? "no cap" : cap + " kt"}: optimal`);
      const pl = k => `${k} ${Math.round(w.plan[k])}/${Math.round(f.plan[k])}`;
      if (cap === 200) {
        onPage(`The cheapest 200 kt plan costs ${musd(f.cost)}, ${Math.round((f.cost / w.cost - 1) * 100)}% more, and its last tonne $${Math.round(f.capDual)} instead of $${Math.round(w.dual)}`, "the full-year optimizer at 200 kt");
        ok(f.cost > w.cost, "seven weeks underestimate the cost of a deep cut (the page's stated limitation)");
      }
      if (cap == null) ok(Math.abs(f.cost / w.cost - 1) < 0.002, "with no cap the full-year optimizer gives the same cost");
      console.log(`  full-year optimizer, ${cap == null ? "no cap" : cap + " kt"} (${((Date.now() - t0) / 1000).toFixed(1)} s): cost ${musd(w.cost)} on 7 weeks vs ${musd(f.cost)} on 8,760 h (${((w.cost / f.cost - 1) * 100).toFixed(1)}%); ` +
                  `shadow price ${w.dual == null ? "-" : "$" + w.dual.toFixed(1)} vs ${f.capDual == null ? "-" : "$" + f.capDual.toFixed(1)}; MW weeks/full: ${M.KEYS.map(pl).join(", ")}`);
    }
  }

  console.log(`test_13-capstone: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
