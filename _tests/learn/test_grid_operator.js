// test_grid_operator.js — Node tests for the Lesson 0 model (assets/learn/grid-operator.js), its data
// (assets/learn/data/town.json + town_year.json) and every number the lesson page states.
// Usage (from the site folder):  node _tests/learn/test_grid_operator.js
// Folders starting with "_" are not rendered or published by Quarto.
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/grid-operator.js"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"));
const days = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_days.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/00-grid-operator.qmd"), "utf8");
const W = M.prepare(town, year, "lesson0"), H = M.HOURS, F = W.fleet, G = W.game;

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
const pickStep = (lo, hi) => lo + G.step * Math.floor(rnd() * (Math.floor((hi - lo) / G.step) + 1));
const fmtInt = v => Math.round(v).toLocaleString("en-US");

// ---------------- data: one real day cut from the year, scaled to Prairie Town
{
  // the year file's hour convention, checked against a day stored separately in town_days.json
  const sp = days.days.summer_peak, probe = { scenarios: { p: Object.assign({}, G, { date: sp.date }) }, fleet: F };
  const Wp = M.prepare(probe, year, "p"), Wd = M.prepare({ scenarios: { p: Object.assign({}, G, { day: "summer_peak" }) }, fleet: F }, days, "p");
  ok(Wp.demand.join() === Wd.demand.join() && Wp.solar.join() === Wd.solar.join() && Wp.wind.join() === Wd.wind.join(),
     "data: year slice by local date matches town_days.json for " + sp.date + " (index = hour ending at start_utc + i, UTC-5)");
  ["demand", "wind", "solar"].forEach(k => ok(W[k].length === H, `data: ${k} has 24 hours`));
  const t0 = Date.parse(year.start_utc + "Z"), i0 = Math.round((Date.parse(G.date + "T00:00:00Z") - t0) / 3600000) + 1 - G.utcOffsetHours;
  for (let t = 0; t < H; t++) {
    ok(W.wind[t] === Math.round(year.wind[i0 + t] / 1000 * F.wind.mw) && W.solar[t] === Math.round(year.solar[i0 + t] / 1000 * F.solar.mw), `data: hour ${t} wind and solar = shape x farm size`);
    ok(Math.abs(W.demand[t] - year.demand[i0 + t] / 1000 * G.demandPeakMW) <= G.step / 2 + 1e-9, `data: hour ${t} demand within rounding of shape x peak`);
    const x = M.facts(W, t), need = x.demand - x.nuclear - x.wind - x.solar;
    ok(need === W.need[t] && need % G.step === 0, `data: hour ${t} gas need ${need} is a multiple of ${G.step} MW`);
    ok(x.nuclear + x.wind + x.solar + F.cc.mw + F.peaker.mw >= x.demand, `data: hour ${t} the fleet can meet demand`);
    ok(x.nuclear <= x.demand, `data: hour ${t} nuclear alone never exceeds demand`);
  }
  // the midday dip is real data (no scripted event): one hour, solar well below both neighbours
  const dips = W.cloud.map((c, t) => c > 0 ? t : -1).filter(t => t >= 0);
  ok(dips.length === 1 && dips[0] >= 11 && dips[0] <= 15, `data: exactly one real midday solar dip (${dips})`);
  const c = dips[0], sh = year.solar.slice(i0 + c - 1, i0 + c + 2);
  ok(sh[1] < 0.8 * sh[0] && sh[1] < 0.8 * sh[2], `data: SPP solar shape around ${c}:00 is ${sh.join(", ")} (a dip of over 20% that recovers)`);
  ok(QMD.indexOf(G.dateLabel) >= 0 && QMD.indexOf("scripted") < 0, `page: data label states the real date ${G.dateLabel}, and nothing is scripted`);
  console.log(`day ${G.date}: demand ${Math.min(...W.demand)}-${Math.max(...W.demand)} MW, wind ${Math.min(...W.wind)}-${Math.max(...W.wind)} MW, solar up to ${Math.max(...W.solar)} MW, cloud at ${c}:00 (solar ${W.solar[c - 1]} -> ${W.solar[c]} -> ${W.solar[c + 1]} MW)`);
}

// ---------------- one hour: balance, energy and cost identities for random set-points
for (let t = 0; t < H; t++) {
  const x = M.facts(W, t);
  for (let k = 0; k < 300; k++) {
    const cc = pickStep(0, F.cc.mw), pk = pickStep(0, F.peaker.mw), r = M.settle(W, x, cc, pk), tag = `settle h${t} cc${cc} pk${pk}`;
    ok(near(r.nuclear + r.windAvail + r.solarAvail + cc + pk + r.unserved - r.curtailed - r.over, r.demand), `${tag}: balance with unserved and spilled`);
    ok(near(r.nuclear + r.wind + r.solar + cc + pk - r.over, r.served), `${tag}: used output = served demand`);
    ok(near(r.served + r.unserved, r.demand), `${tag}: served + unserved = demand`);
    ok(r.unserved === 0 || (r.curtailed === 0 && r.over === 0), `${tag}: never short and spilling at once`);
    ok(r.curtailed <= r.windAvail + r.solarAvail + 1e-9 && r.wind >= -1e-9 && r.solar >= -1e-9, `${tag}: curtailment within wind and solar`);
    ok(r.over === 0 || near(r.curtailed, r.windAvail + r.solarAvail), `${tag}: over-supply only after all wind and solar are spilled`);
    ok(near(r.cost, F.nuclear.cost * r.nuclear + F.cc.cost * cc + F.peaker.cost * pk), `${tag}: cost = sum of cost x MWh`);
    ok(near(r.co2, F.cc.co2 * cc + F.peaker.co2 * pk), `${tag}: CO2 = sum of rate x MWh`);
    ok(r.freq >= 60 - G.hzLimit - 1e-12 && r.freq <= 60 + G.hzLimit + 1e-12, `${tag}: frequency within the dial`);
    ok((r.imbalance < 0) === (r.freq < 60) && (Math.abs(r.imbalance) < 1e-9) === near(r.freq, 60), `${tag}: frequency below 60 Hz exactly when short`);
  }
}

// ---------------- the expert rule (cheapest first, hour by hour)
const ex = M.expert(W), plan = M.expertPlan(W), T = ex.totals;
{
  ok(ex.rampOK, "expert: simulate() accepts the plan");
  let prev = G.startCC;
  plan.forEach((p, t) => {
    const r = ex.hours[t], range = M.ccRange(W, prev);
    ok(Math.abs(p.cc - prev) <= F.cc.ramp + 1e-9 && p.cc >= 0 && p.cc <= F.cc.mw && p.pk >= 0 && p.pk <= F.peaker.mw, `expert: limits kept at hour ${t}`);
    ok(p.cc % G.step === 0 && p.pk % G.step === 0, `expert: hour ${t} on the reader's ${G.step} MW grid`);
    ok(r.unserved === 0 && r.over === 0, `expert: hour ${t} balanced`);
    if (p.pk > 0) ok(near(p.cc, range.hi), `expert: hour ${t} uses the peaker only when the combined-cycle plant is at its reach`);
    if (r.curtailed > 0) ok(near(p.cc, range.lo) && p.pk === 0, `expert: hour ${t} spills only when gas is at its minimum`);
    let best = null;
    for (let cc = range.lo; cc <= range.hi + 1e-9; cc += G.step) for (let pk = 0; pk <= F.peaker.mw; pk += G.step) {
      const q = M.settle(W, M.facts(W, t), cc, pk), key = [q.unserved, q.over, q.cost];
      if (!best || key[0] < best[0] - 1e-9 || (near(key[0], best[0]) && (key[1] < best[1] - 1e-9 || (near(key[1], best[1]) && key[2] < best[2] - 1e-9)))) best = key;
    }
    ok(near(r.unserved, best[0]) && near(r.over, best[1]) && near(r.cost, best[2]), `expert: hour ${t} is the cheapest balanced choice for that hour`);
    prev = p.cc;
  });
  ok(near(T.served + T.unserved, T.demand) && T.unserved === 0 && T.hoursOff === 0, "expert: all demand served, every hour balanced");
  ok(near(T.nuclear + T.wind + T.solar + T.cc + T.pk - T.over, T.served), "expert: daily energy identity");
  ok(near(T.windAvail + T.solarAvail - T.curtailed, T.wind + T.solar), "expert: wind and solar used = available - spilled");
  const pkHours = ex.hours.filter(r => r.pk > 0).map(r => r.t);
  ok(pkHours.some(t => t === W.cloud.findIndex(c => c > 0)) && pkHours.some(t => t >= 17 && t <= 21), `expert: the ramp limit forces the peaker at the clouds and in the evening (${pkHours})`);
  ok(ex.hours.some(r => r.curtailed > 0), "expert: the morning ramp-down spills some sun");
  console.log(`expert rule: cost $${T.cost}, CO2 ${T.co2.toFixed(1)} t, CC ${T.cc} MWh, peaker ${T.pk} MWh (hours ${pkHours}), spilled ${T.curtailed} MWh`);
  console.log("expert plan (CC/peaker MW): " + plan.map((p, t) => `${t}:${p.cc}/${p.pk}`).join(" "));
}

// ---------------- planning the whole day at once (dynamic programming over the combined-cycle level)
function dayOptimum(stepMW) {
  const VOLL = 10000, levels = [];
  for (let v = 0; v <= F.cc.mw + 1e-9; v += stepMW) levels.push(v);
  let cost = levels.map(v => (v === G.startCC ? 0 : Infinity)); const back = [];
  for (let t = 0; t < H; t++) {
    const x = M.facts(W, t), need = W.need[t], nc = levels.map(() => Infinity), nb = levels.map(() => -1);
    levels.forEach((v, j) => {
      const pk = Math.min(F.peaker.mw, Math.max(0, need - v)), r = M.settle(W, x, v, pk), here = r.cost + VOLL * (r.unserved + r.over);
      levels.forEach((u, i) => { if (cost[i] === Infinity || Math.abs(v - u) > F.cc.ramp + 1e-9) return; if (cost[i] + here < nc[j]) { nc[j] = cost[i] + here; nb[j] = i; } });
    });
    cost = nc; back.push(nb);
  }
  let j = cost.indexOf(Math.min(...cost)); const ccs = [];
  for (let t = H - 1; t >= 0; t--) { ccs[t] = levels[j]; j = back[t][j]; }
  return M.simulate(W, ccs.map((v, t) => ({ cc: v, pk: Math.min(F.peaker.mw, Math.max(0, W.need[t] - v)) })));
}
const opt = dayOptimum(1), opt5 = dayOptimum(G.step);
const save = T.cost - opt.totals.cost, pct = 100 * save / T.cost;
{
  ok(opt.rampOK && opt.totals.unserved === 0 && opt.totals.hoursOff === 0, "optimum: feasible and balanced");
  ok(opt.totals.cost <= T.cost + 1e-6, "optimum: never more expensive than the expert rule");
  ok(pct > 0.3 && pct < 2, `optimum: 'a little better' (${pct.toFixed(2)}% cheaper)`);
  ok(near(opt5.totals.cost, opt.totals.cost, 1e-6), "optimum: reachable on the reader's 5 MW grid (a careful reader can match it)");
  const warm = opt.hours.filter((r, t) => r.cc > ex.hours[t].cc + 1e-9).map(r => r.t);
  ok(warm.some(t => t < W.cloud.findIndex(c => c > 0)) && warm.some(t => t >= 15 && t < 19), `optimum warms up the combined-cycle plant before the clouds and the sunset (hours ${warm})`);
  const pen = s => s.totals.cost + 10000 * (s.totals.unserved + s.totals.over), best = pen(opt);
  for (let k = 0; k < 2000; k++) {
    let prev = G.startCC; const p = [];
    for (let t = 0; t < H; t++) {
      const r = M.ccRange(W, prev), base = plan[t];
      const cc = rnd() < 0.5 ? Math.min(r.hi, Math.max(r.lo, base.cc + G.step * Math.round((rnd() - 0.5) * 8))) : pickStep(r.lo, r.hi);
      p.push({ cc: cc, pk: rnd() < 0.5 ? base.pk : pickStep(0, F.peaker.mw) }); prev = cc;
    }
    ok(pen(M.simulate(W, p)) >= best - 1e-6, "random ramp-feasible plan never beats the full-day optimum");
  }
  console.log(`full-day optimum: $${opt.totals.cost}, saves $${save} (${pct.toFixed(2)}%), peaker ${opt.totals.pk} MWh, warm-up hours ${warm}`);
}

// ---------------- flowchart traces and missions
{
  const cloudH = W.cloud.findIndex(c => c > 0);
  const tr = M.trace(W, cloudH);
  ok(tr.path.join() === "start,q1,a1,q2,a2,end" && tr.gap > F.cc.ramp && tr.ccStep === F.cc.ramp, "trace: at the clouds the rule turns up the combined-cycle to its ramp limit, then the peaker");
  ok(M.trace(W, 8).path.join() === "start,q1,q3,a3,end" && M.trace(W, 8).spill > 0, "trace: at 08:00 too much power, the combined-cycle ramps down, sun is spilled");
  plan.forEach((p, t) => { const o = M.trace(W, t); ok(o.path[0] === "start" && o.path[o.path.length - 1] === "end", `trace: hour ${t} starts and ends`); });
  const tg = M.targets(W);
  ok(tg.budget > T.cost && tg.budget <= T.cost * 1.06 && tg.cap > T.co2 && tg.cap <= T.co2 * 1.06, `missions: targets just above the rule ($${tg.budget}, ${tg.cap} t)`);
}

// ---------------- every number the page states, checked against the model
{
  const t1 = M.trace(W, 0);
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- fallback-svg:start -->[\s\S]*?<!-- fallback-svg:end -->/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<table class="lx-facts">[\s\S]*?<\/table>/, "")                      // sourced facts: checked below
    .replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "")
    .replace(/https?:\/\/\S+/g, "").replace(/\$\$[\s\S]*?\$\$/g, m => m);
  const prose = strip(QMD.split("<!-- learn:meta:start")[0] + QMD.split("<!-- learn:meta:end -->")[1]);
  const q = M.facts(W, 21), need21 = q.demand - q.nuclear - q.wind - q.solar;
  const allowed = {
    MW: new Set([F.nuclear.mw, F.wind.mw, F.solar.mw, F.cc.mw, F.peaker.mw, F.cc.ramp, G.startCC /* Modeler preview */, q.demand, q.nuclear, q.wind, need21,
                 50, /* quiz 2 */ q.demand - q.nuclear, need21 + 100 /* quiz 1 distractors */]),
    MWh: new Set([T.nuclear, T.cc, T.pk, opt.totals.pk, opt.totals.curtailed - T.curtailed /* Modeler preview: extra spill */, 150, 50, 53 /* quiz 2 answer and distractors */]),
    "$": new Set([T.cost, opt.totals.cost, save]), t: new Set([+T.co2.toFixed(1)]), Hz: new Set([60, G.hzPerMW, G.hzLimit]), "%": new Set([+pct.toFixed(1)])
  };
  const rx = /(\$?)(\d[\d,]*(?:\.\d+)?)(?:\\?\{,\}\d+)?\s*(MWh|MW|Hz|%|t\b)?/g;
  let m, seen = 0;
  const clean = prose.replace(/\\\$/g, "§").replace(/\$/g, " ").replace(/§/g, "$").replace(/(\d)\{,\}(\d)/g, "$1,$2");
  while ((m = rx.exec(clean))) {
    const unit = m[1] ? "$" : m[3], v = +m[2].replace(/,/g, "");
    if (!unit) continue;
    seen++;
    ok(allowed[unit] && allowed[unit].has(v), `page states ${m[0].trim()} — matches the model or a quiz option`);
  }
  ok(seen >= 15, `page: ${seen} numbers with units checked`);
  // the worked equations use the model's numbers
  ok(QMD.indexOf(`${T.nuclear} \\times ${F.nuclear.cost} + ${T.cc} \\times ${F.cc.cost} + ${T.pk} \\times ${F.peaker.cost} = \\$${fmtInt(T.cost).replace(",", "{,}")}`) >= 0, "page: cost sum written with the model's numbers");
  ok(QMD.indexOf(`${T.cc} \\times ${F.cc.co2} + ${T.pk} \\times ${F.peaker.co2} = ${T.co2.toFixed(1)}`) >= 0, "page: CO2 sum written with the model's numbers");
  ok(QMD.indexOf(`| Running cost | \\$${fmtInt(T.cost)} | \\$${fmtInt(opt.totals.cost)} |`) >= 0 && QMD.indexOf(`| Peaker energy | ${T.pk} MWh | ${opt.totals.pk} MWh |`) >= 0 &&
     QMD.indexOf(`Planning saves \\$${fmtInt(save)}, about ${pct.toFixed(1)}%`) >= 0, "page: Modeler preview's rule-versus-plan rows and saving stated from the model");
  ok(QMD.indexOf(`At 21:00 demand is ${q.demand} MW. Nuclear makes ${q.nuclear} MW, wind ${q.wind} MW, and the sun is down`) >= 0 && q.solar === 0, "page: quiz 1 states hour 21's numbers");
  ok(QMD.indexOf(`${q.demand} − ${q.nuclear} − ${q.wind} = ${need21}`) >= 0 && QMD.indexOf(`data-answer="c"`) >= 0 && QMD.indexOf(`<li data-value="c">${need21} MW</li>`) >= 0, `page: quiz 1 answer is ${need21} MW`);
  // the Modeler box is a preview, not a way past the depth budget: words for decisions, goal and rules, one symbolic line, links to lessons 10 and 11
  ok(QMD.indexOf(`${F.cc.cost}\\,p_\\mathrm{cc}(t) + ${F.peaker.cost}\\,p_\\mathrm{pk}(t)`) >= 0, "page: the preview's goal line uses the gas running costs");
  ok(QMD.indexOf(`at most ${F.cc.ramp} MW an hour, starting from ${G.startCC} MW at midnight`) >= 0, "page: the preview states the ramp limit and the start (initial condition)");
  ok(QMD.indexOf("\\begin{aligned}") < 0 && QMD.indexOf("(10-write-it-down.qmd)") >= 0 && QMD.indexOf("(11-solver.qmd)") >= 0, "page: no full formulation in lesson 0; it links lessons 10 and 11");
  ok(QMD.indexOf(`change its output by only ${F.cc.ramp} MW`) >= 0, "page: no-JS explain list states the ramp limit");
  // sourced facts keep their source and date
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  ["60 Hz", "63", "759 GW", "4.20 trillion kWh", "10,791 kWh"].forEach(s => ok(facts.indexOf(s) >= 0, `facts table: ${s}`));
  ok((facts.match(/<tr>/g) || []).length - 1 === (facts.match(/eia\.gov/g) || []).length, "facts table: every row links an EIA source");
  const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "fallback_grid_operator.js"), "--check"], { encoding: "utf8" });
  ok(r.status === 0, "static fallback figure is up to date (" + (r.stdout || r.stderr).trim() + ")");
  void t1;
}

// ---------------- the details, one by one
{
  const JS = fs.readFileSync(path.join(SITE, "assets/learn/grid-operator.js"), "utf8");
  // auto-finish continues from the reader's own last hour (a reproduction: 75/45 MW at 00:00, 35/80 MW at 01:00)
  const mine = [{ cc: 75, pk: 45 }, { cc: 35, pk: 80 }], done = M.simulate(W, M.finishPlan(W, mine));
  ok(done.rampOK && done.totals.unserved === 0 && done.totals.hoursOff === 0, "auto-finish: from 75/45 and 35/80 MW every later hour is balanced and ramp-feasible");
  // the old button: the precomputed schedule's set-points, the combined-cycle clamped to its reach (the slider's range)
  let pv = mine[1].cc; const oldPlan = mine.slice();
  for (let t = 2; t < H; t++) { const r = M.ccRange(W, pv), cc = Math.min(r.hi, Math.max(r.lo, plan[t].cc)); oldPlan.push({ cc: cc, pk: plan[t].pk }); pv = cc; }
  const oldSim = M.simulate(W, oldPlan);
  ok(oldSim.hours[2].unserved === 35, `auto-finish: the old precomputed schedule left ${oldSim.hours[2].unserved} MW unserved at 02:00 (the reported bug)`);
  ok(M.finishPlan(W, []).every((p, t) => p.cc === plan[t].cc && p.pk === plan[t].pk), "auto-finish: from a fresh start it is the cheapest-first rule's own day");
  for (let k = 0; k < 400; k++) {
    const n = 1 + Math.floor(rnd() * 22), pre = []; let prev = G.startCC;
    for (let t = 0; t < n; t++) { const r = M.ccRange(W, prev), cc = pickStep(r.lo, r.hi); pre.push({ cc: cc, pk: pickStep(0, F.peaker.mw) }); prev = cc; }
    const fin = M.finishPlan(W, pre), sim = M.simulate(W, fin);
    ok(fin.length === H && sim.rampOK, `auto-finish: after ${n} random hours the finished day keeps every ramp`);
    pv = pre[n - 1].cc;
    for (let t = n; t < H; t++) { const g = M.greedyStep(W, pv, t); ok(fin[t].cc === g.cc && fin[t].pk === g.pk, `auto-finish: hour ${t} is the rule's step from the hour before`); pv = fin[t].cc; }
    // whenever the rule's range can cover the need, the hour is balanced
    pv = pre[n - 1].cc;
    for (let t = n; t < H; t++) { const r = M.ccRange(W, pv), need = W.need[t]; if (r.lo <= need && need <= r.hi + F.peaker.mw) ok(sim.hours[t].unserved === 0, `auto-finish: hour ${t} served when reachable`); pv = fin[t].cc; }
  }
  ok(/greedyStep\(W, S_\.prev, S_\.t\)/.test(JS) && JS.indexOf("cc.set(EXP[") < 0, "view: the finish button uses greedyStep from the reader's state, not the precomputed plan");
  // 08:00: the spilled 15 MW is wind and solar, split in proportion
  const h8 = ex.hours[8];
  ok(h8.curtailed > 0 && h8.windAvail - h8.wind > 0 && h8.solarAvail - h8.solar > 0, `08:00: both wind (${(h8.windAvail - h8.wind).toFixed(2)}) and solar (${(h8.solarAvail - h8.solar).toFixed(2)}) are spilled`);
  ok(JS.indexOf("MW of wind and solar spilled") >= 0 && JS.indexOf("of sun spilled") < 0, "view: the flowchart trace says wind and solar, not sun alone");
  // the real-world card: gas output and CO2 per MWh peak at different hours
  const gas = ex.hours.map(r => r.cc + r.pk), inten = ex.hours.map(r => r.co2 / r.demand);
  const gMax = gas.indexOf(Math.max(...gas)), iMax = inten.indexOf(Math.max(...inten));
  ok(gMax === 19 && iMax === 0, `real-world card: gas output peaks at ${gMax}:00 and CO2 per MWh at ${iMax}:00`);
  ok(QMD.indexOf("gas output peaks at 19:00, but CO₂ per MWh peaks at 00:00") >= 0 && QMD.indexOf("were the dirtiest") < 0, "page: the real-world card separates emissions from emissions per MWh");
  // 06:00: the demand-change prediction (HOOK = 6 in the view); its answer comes from the data
  ok(W.demand[6] > W.demand[5] && /HOOK = 6/.test(JS) && JS.indexOf('"g0-morning"') >= 0 && JS.indexOf('q: "Demand climbs from "') >= 0,
     `06:00: the question says demand climbs, and it does (${W.demand[5]} -> ${W.demand[6]} MW)`);
  ok(JS.indexOf("Under a second") < 0 && JS.indexOf("under a second") < 0 && QMD.indexOf("stores almost nothing") < 0, "no 'under a second old' or 'stores almost nothing' claims");
  // wording: frequency, weather causes, the dial, the emissions boundary, units
  ok(QMD.indexOf("cycles per second") < 0 && /60 cycles each second/.test(QMD) && /60 cycles each second/.test(JS), "frequency: 60 electrical cycles each second, generators turn in step");
  ok(JS.indexOf("Clouds drift") < 0 && JS.indexOf("air conditioning") < 0 && JS.indexOf("one possible cause") >= 0, "solar dip: observed in the data; clouds are one possible cause; no unverified demand cause");
  ok(JS.indexOf("Illustrative indicator of imbalance") >= 0 && QMD.indexOf(`capped at ${G.hzLimit} Hz`) >= 0, "dial: labelled illustrative; the clip is disclosed");
  ok(JS.indexOf("Operating CO₂") >= 0 && /fuel burned at the plants only/.test(QMD) && /methane leaks/.test(QMD), "emissions boundary: operating CO2 only, stated on the page and in the table");
  ok(/metric tonnes/.test(JS) && /\[\[megawatt\|MW\]\]/.test(JS) && /\[\[frequency\|Hz\]\]/.test(JS), "unit key at first use: MW, MWh, Hz, t");
  ok(JS.indexOf('class: "lx-sr" }, left)') >= 0, "accessibility: a current-hour table for screen readers");
  const fb = (QMD.match(/<!-- fallback-svg:start -->[\s\S]*?<!-- fallback-svg:end -->/) || [""])[0];
  ok((fb.match(/<tr><td>/g) || []).length === H && fb.indexOf("lx-textalt") >= 0, "accessibility: the static fallback carries a 24-hour text table");
  ok(QMD.indexOf("ANSI") < 0 && QMD.indexOf("p. A-6") >= 0 && JS.indexOf("DOE, July 2015, p. 12") >= 0, "voltages: DOE sources with date and page; no undated ANSI reference");
  // the full-day optimum also turns down surplus wind and solar, and the preview names that decision
  const optSpill = opt.hours.filter(r => r.curtailed > 0).map(r => r.t);
  ok(optSpill.length > 0 && opt.totals.over === 0, `optimum: spills surplus wind and solar at ${optSpill.join(", ")}:00, never extra gas`);
  ok(opt.totals.curtailed - T.curtailed === 20 && QMD.indexOf("how much surplus wind and solar to") >= 0 && QMD.indexOf("accepts spilling 20 MWh more wind and solar") >= 0,
     `page: the preview's decisions include spilling; the plan spills ${opt.totals.curtailed} MWh against the rule's ${T.curtailed} MWh`);
  // one convention in the balance equation: p_g is what each plant makes; o(t) is power beyond demand
  ok(QMD.indexOf("\\sum_g p_g(t) + u(t) - o(t) = d(t)") >= 0 && QMD.indexOf("what plant $g$ actually makes") >= 0, "page: the balance equation uses delivered output and over-supply");
  ok(ex.hours.every(r => near(r.nuclear + r.wind + r.solar + r.cc + r.pk + r.unserved - r.over, r.demand)), "model: delivered output + unserved - over-supply = demand, every hour");
  // the model has ramp limits but no warm-up state, so the page never says "warm up"
  ok(!/warm(ing)? (the|up)|warm the/i.test(QMD) && !/warm the|warming/i.test(JS), "wording: planning raises output earlier; no warm-up state is claimed");
  // the wind myth carries its qualifier; the frequency note is collected by holding 60 Hz too
  ok(QMD.indexOf("A wind farm can always make more power when demand rises") >= 0 && QMD.indexOf("never more than the wind allows") >= 0, "check: the wind myth says 'always'");
  ok(JS.indexOf("Let supply fall short once") < 0 && JS.indexOf("You held 60.00 Hz all day.") >= 0, "debrief: the frequency note never asks the reader to cause a shortage");
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  // first-use terms: the two gas plants, voltage, GW and kWh
  ok(JS.indexOf("[[combined-cycle|Combined-cycle]]") >= 0 && JS.indexOf("[[peaker|Peaker]]") >= 0 && JS.indexOf("[[voltage|Voltage]]") >= 0, "terms: combined-cycle, peaker and voltage marked at first use");
  ok(facts.indexOf("A <span class=\"lx-term\" data-term=\"gigawatt\">GW</span> is 1,000 MW") >= 0 && facts.indexOf('data-term="kilowatt-hour"') >= 0, "facts table: GW and kWh explained");
}

// ---------------- stars and share links
{
  const st = M.stars(T, T);
  ok(st.reliability === 3 && st.cost === 3 && st.co2 === 3, "stars: the expert rule earns 3/3/3 against itself");
  const noGas = M.simulate(W, Array.from({ length: H }, () => ({ cc: 0, pk: 0 }))), s0 = M.stars(noGas.totals, T);
  ok(noGas.totals.unserved > 0 && s0.reliability === 1 && s0.cost === 1 && s0.co2 === 1, "stars: no gas leaves the lights out and earns one star each");
  ok(M.stars(opt.totals, T).cost === 3, "stars: the full-day optimum earns 3 cost stars");
  const pkDay = M.simulate(W, W.need.map(n => ({ cc: 0, pk: Math.max(0, Math.min(F.peaker.mw, n)) })));
  ok(M.stars(pkDay.totals, T).cost === 1, "stars: a peaker-heavy day earns one cost star");
  for (let k = 0; k < 200; k++) {
    const p = Array.from({ length: H }, () => ({ cc: pickStep(0, F.cc.mw), pk: pickStep(0, F.peaker.mw) }));
    const back = M.decodePlan(M.encodePlan(p, W), W);
    ok(back && back.every((q, t) => q.cc === p[t].cc && q.pk === p[t].pk), "share link: encode/decode round trip");
  }
  ok(M.decodePlan("abc", W) === null && M.decodePlan("A".repeat(48), W) === null, "share link: malformed strings rejected");
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
