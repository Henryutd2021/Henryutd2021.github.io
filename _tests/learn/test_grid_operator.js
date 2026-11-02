// test_grid_operator.js — Node tests for the Lesson 0 model (assets/learn/grid-operator.js) and its data
// (assets/learn/data/town.json). Same pattern as the explainer model tests: require the pure model, run checks, count fails.
// Usage (from the site folder):  node _tests/learn/test_grid_operator.js
// Folders starting with "_" are not rendered or published by Quarto.
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/grid-operator.js"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const days = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_days.json"), "utf8"));
const W = M.prepare(town, days, "lesson0"), H = M.HOURS, F = W.fleet, G = W.game;

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);

// deterministic random numbers, so a failure can be reproduced
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
const pickStep = (lo, hi) => lo + G.step * Math.floor(rnd() * (Math.floor((hi - lo) / G.step) + 1));

// ---------------- data: the real day's shapes, scaled to Prairie Town
{
  const d = days.days[G.day];
  ok(d && d.date === G.date, `data: scenario day ${G.day} is ${G.date}`);
  ["demand", "wind", "solar"].forEach(k => ok(d[k].length === H && W[k].length === H, `data: ${k} has 24 hours`));
  d.wind.concat(d.solar, d.demand).forEach((v, i) => ok(Number.isInteger(v) && v >= 0 && v <= 1000, `data: shape value ${i} in thousandths`));
  for (let t = 0; t < H; t++) {
    ok(Math.abs(W.wind[t] - d.wind[t] / 1000 * F.wind.mw) <= 0.5 && Math.abs(W.solar[t] - d.solar[t] / 1000 * F.solar.mw) <= 0.5, `data: hour ${t} wind and solar = shape x farm size, rounded`);
    ok(Math.abs(W.demand[t] - d.demand[t] / 1000 * G.demandPeakMW) <= G.step / 2 + 0.5 + 1e-9, `data: hour ${t} demand within rounding of shape x peak`);
  }
  console.log(`day ${G.date} (${G.day}): demand ${Math.min(...W.demand)}-${Math.max(...W.demand)} MW, wind ${Math.min(...W.wind)}-${Math.max(...W.wind)} MW, solar up to ${Math.max(...W.solar)} MW`);
  for (let t = 0; t < H; t++) {
    const x = M.facts(W, t);
    const need = x.demand - x.nuclear - x.wind - x.solar;
    // exact balance must be reachable with 5 MW steps (otherwise a careful reader cannot hit 60.00 Hz)
    ok(Math.abs(need / G.step - Math.round(need / G.step)) < 1e-9, `data: hour ${t} gas need ${need} is a multiple of ${G.step} MW`);
    ok(x.nuclear + F.cc.mw + F.peaker.mw >= x.demand, `data: hour ${t} enough firm capacity`);
    ok(x.nuclear <= x.demand, `data: hour ${t} nuclear alone never exceeds demand`);
  }
}

// ---------------- one hour: balance, energy and cost identities for random set-points
for (let t = 0; t < H; t++) {
  const x = M.facts(W, t);
  for (let k = 0; k < 400; k++) {
    const cc = pickStep(0, F.cc.mw), pk = pickStep(0, F.peaker.mw), r = M.settle(W, x, cc, pk);
    const tag = `settle h${t} cc${cc} pk${pk}`;
    ok(near(r.nuclear + r.windAvail + r.solarAvail + cc + pk + r.unserved - r.curtailed - r.over, r.demand), `${tag}: balance with unserved and spilled`);
    ok(near(r.nuclear + r.wind + r.solar + cc + pk - r.over, r.served), `${tag}: used output = served demand`);
    ok(near(r.served + r.unserved, r.demand), `${tag}: served + unserved = demand`);
    ok(r.unserved === 0 || (r.curtailed === 0 && r.over === 0), `${tag}: never short and spilling at once`);
    ok(r.curtailed <= r.windAvail + r.solarAvail + 1e-9 && r.wind >= -1e-9 && r.solar >= -1e-9, `${tag}: curtailment within wind and solar`);
    ok(r.over === 0 || near(r.curtailed, r.windAvail + r.solarAvail), `${tag}: over-supply only after all wind and solar are spilled`);
    ok(near(r.spilled, r.curtailed + r.over), `${tag}: spilled = curtailed + over`);
    ok(near(r.imbalance, r.over - r.unserved), `${tag}: imbalance`);
    ok(near(r.cost, F.nuclear.cost * r.nuclear + F.cc.cost * cc + F.peaker.cost * pk), `${tag}: cost = sum of cost x MWh`);
    ok(near(r.co2, F.cc.co2 * cc + F.peaker.co2 * pk), `${tag}: CO2 = sum of rate x MWh`);
    ok(r.freq >= 60 - G.hzLimit - 1e-12 && r.freq <= 60 + G.hzLimit + 1e-12, `${tag}: frequency within the gauge`);
    ok((r.imbalance < 0) === (r.freq < 60) && (Math.abs(r.imbalance) < 1e-9) === near(r.freq, 60), `${tag}: frequency below 60 Hz exactly when short`);
  }
}

// ---------------- the expert rule
const ex = M.expert(W), plan = M.expertPlan(W);
{
  ok(ex.rampOK, "expert: simulate() accepts the plan");
  let prev = G.startCC;
  plan.forEach((p, t) => {
    ok(Math.abs(p.cc - prev) <= F.cc.ramp + 1e-9, `expert: ramp limit kept at hour ${t} (${prev} -> ${p.cc})`);
    ok(p.cc >= 0 && p.cc <= F.cc.mw && p.pk >= 0 && p.pk <= F.peaker.mw, `expert: capacity kept at hour ${t}`);
    ok(p.cc % G.step === 0 && p.pk % G.step === 0, `expert: hour ${t} on the reader's ${G.step} MW grid`);
    const r = ex.hours[t], range = M.ccRange(W, prev);
    ok(r.unserved === 0 && r.over === 0, `expert: hour ${t} balanced`);
    if (p.pk > 0) ok(near(p.cc, range.hi), `expert: hour ${t} uses the peaker only when the combined-cycle plant is at its reach`);
    if (r.curtailed > 0) ok(near(p.cc, range.lo) && p.pk === 0, `expert: hour ${t} spills wind/solar only when gas is at its minimum`);
    // within the hour (given last hour), no choice on the reader's grid is better: fewer unserved, then less over, then cheaper
    let best = null;
    for (let cc = range.lo; cc <= range.hi + 1e-9; cc += G.step) for (let pk = 0; pk <= F.peaker.mw; pk += G.step) {
      const q = M.settle(W, M.facts(W, t), cc, pk), key = [q.unserved, q.over, q.cost];
      if (!best || key[0] < best[0] - 1e-9 || (near(key[0], best[0]) && (key[1] < best[1] - 1e-9 || (near(key[1], best[1]) && key[2] < best[2] - 1e-9)))) best = key;
    }
    ok(near(r.unserved, best[0]) && near(r.over, best[1]) && near(r.cost, best[2]), `expert: hour ${t} is the cheapest balanced choice for that hour`);
    prev = p.cc;
  });
  const T = ex.totals;
  ok(near(T.served + T.unserved, T.demand) && T.unserved === 0, "expert: all demand served");
  ok(near(T.nuclear + T.wind + T.solar + T.cc + T.pk - T.over, T.served), "expert: daily energy identity");
  ok(near(T.windAvail + T.solarAvail - T.curtailed, T.wind + T.solar), "expert: wind and solar used = available - spilled");
  ok(near(T.cost, ex.hours.reduce((s, r) => s + r.cost, 0)) && near(T.co2, ex.hours.reduce((s, r) => s + r.co2, 0)), "expert: totals = sum of hours");
  ok(T.hoursOff === 0, "expert: no hour out of balance");
  console.log(`expert rule: cost $${T.cost.toFixed(0)}, CO2 ${T.co2.toFixed(1)} t, demand ${T.demand} MWh, CC ${T.cc} MWh, peaker ${T.pk} MWh, ` +
              `spilled ${T.spilled} MWh, wind+solar used ${(T.wind + T.solar).toFixed(0)} of ${(T.windAvail + T.solarAvail).toFixed(0)} MWh`);
  console.log("expert plan (CC/peaker MW by hour): " + plan.map((p, t) => `${t}:${p.cc}/${p.pk}`).join(" "));
}

// ---------------- planning the whole day at once (dynamic programming over the combined-cycle level, 1 MW steps)
// The peaker then fills what is missing, and wind and solar are spilled first; unserved energy carries a large penalty.
// This is the optimum of the same rules, used for the "Go deeper" claim that full-day planning does slightly better.
function dayOptimum(stepMW) {
  const VOLL = 10000, levels = [];
  for (let v = 0; v <= F.cc.mw + 1e-9; v += stepMW) levels.push(v);
  let cost = levels.map(v => (v === G.startCC ? 0 : Infinity)), back = [];
  for (let t = 0; t < H; t++) {
    const x = M.facts(W, t), need = x.demand - x.nuclear - x.wind - x.solar;
    const nc = levels.map(() => Infinity), nb = levels.map(() => -1);
    levels.forEach((v, j) => {
      const pk = Math.min(F.peaker.mw, Math.max(0, need - v)), r = M.settle(W, x, v, pk);
      const here = r.cost + VOLL * (r.unserved + r.over);
      levels.forEach((u, i) => {
        if (cost[i] === Infinity || Math.abs(v - u) > F.cc.ramp + 1e-9) return;
        if (cost[i] + here < nc[j]) { nc[j] = cost[i] + here; nb[j] = i; }
      });
    });
    cost = nc; back.push(nb);
  }
  let j = cost.indexOf(Math.min(...cost)); const ccs = [];
  for (let t = H - 1; t >= 0; t--) { ccs[t] = levels[j]; j = back[t][j]; }
  const p = ccs.map((v, t) => { const x = M.facts(W, t); return { cc: v, pk: Math.min(F.peaker.mw, Math.max(0, x.demand - x.nuclear - x.wind - x.solar - v)) }; });
  return M.simulate(W, p);
}
const opt = dayOptimum(1), opt5 = dayOptimum(G.step);
{
  ok(opt.rampOK && opt.totals.unserved === 0 && opt.totals.hoursOff === 0, "optimum: feasible and balanced");
  ok(opt.totals.cost <= ex.totals.cost + 1e-6, "optimum: never more expensive than the expert rule");
  const save = ex.totals.cost - opt.totals.cost, pct = 100 * save / ex.totals.cost;
  console.log(`full-day optimum (1 MW steps): cost $${opt.totals.cost.toFixed(0)}, saves $${save.toFixed(0)} (${pct.toFixed(2)}%), ` +
              `CO2 ${opt.totals.co2.toFixed(1)} t, peaker ${opt.totals.pk} MWh, spilled ${opt.totals.spilled.toFixed(0)} MWh; on the 5 MW grid $${opt5.totals.cost.toFixed(0)}`);
  ok(pct > 0.3 && pct < 2, "optimum: 'slightly better' (between 0.3% and 2% cheaper) as the lesson says");
  ok(near(opt5.totals.cost, opt.totals.cost, 1e-6), "optimum: reachable on the reader's 5 MW grid (a careful reader can match it)");
  // random ramp-feasible plans never beat the optimum (penalised for unserved and over-supply)
  const pen = s => s.totals.cost + 10000 * (s.totals.unserved + s.totals.over), best = pen(opt);
  for (let k = 0; k < 3000; k++) {
    let prev = G.startCC; const p = [];
    for (let t = 0; t < H; t++) {
      const r = M.ccRange(W, prev), base = plan[t];
      const cc = rnd() < 0.5 ? Math.min(r.hi, Math.max(r.lo, base.cc + G.step * Math.round((rnd() - 0.5) * 8))) : pickStep(r.lo, r.hi);
      p.push({ cc: cc, pk: rnd() < 0.5 ? base.pk : pickStep(0, F.peaker.mw) }); prev = cc;
    }
    const s = M.simulate(W, p);
    ok(s.rampOK, "random plan: ramp-feasible by construction");
    ok(pen(s) >= best - 1e-6, "random plan never beats the full-day optimum");
  }
}

// ---------------- numbers the lesson page states (Go deeper boxes, quiz) and the static fallback figure
const fmtInt = v => Math.round(v).toLocaleString("en-US");
{
  const qmd = fs.readFileSync(path.join(SITE, "learn/00-grid-operator.qmd"), "utf8"), T = ex.totals;
  const tex = v => fmtInt(v).replace(",", "{,}");
  [`${fmtInt(T.nuclear)} MWh of nuclear`, `${fmtInt(T.cc)} MWh from the combined-cycle plant`, `${fmtInt(T.pk)} MWh from the peaker`,
   `\\$${tex(T.cost)}`, `${T.co2.toFixed(1)}`].forEach(s => ok(qmd.indexOf(s) >= 0, `page states "${s}"`));
  ok(qmd.indexOf(`${T.nuclear} \\times ${F.nuclear.cost} + ${T.cc} \\times ${F.cc.cost} + ${T.pk} \\times ${F.peaker.cost}`) >= 0, "page: cost sum written with the model's numbers");
  ok(qmd.indexOf(`${T.cc} \\times ${F.cc.co2} + ${T.pk} \\times ${F.peaker.co2}`) >= 0, "page: CO2 sum written with the model's numbers");
  const save = ex.totals.cost - opt.totals.cost, pct = 100 * save / ex.totals.cost;
  [`\\$${fmtInt(save)}`, `about ${pct.toFixed(1)}%`, `from ${T.pk} to ${opt.totals.pk} MWh`].forEach(s => ok(qmd.indexOf(s) >= 0, `page states "${s}"`));
  // quiz 1 uses hour 21 (21:00-22:00)
  const q = M.facts(W, 21), need = q.demand - q.nuclear - q.wind - q.solar;
  ok(qmd.indexOf(`demand is ${q.demand} MW. Nuclear makes ${q.nuclear} MW, wind ${q.wind} MW and solar nothing`) >= 0 && q.solar === 0, "page: quiz 1 states hour 21's numbers");
  ok(qmd.indexOf(`${q.demand} − ${q.nuclear} − ${q.wind} = ${need} MW`) >= 0, `page: quiz 1 answer ${need} MW`);
  // "warms up the combined-cycle plant before the evening climb": above the expert rule in some hour before the evening
  const warm = opt.hours.filter((r, t) => t >= 12 && t < 19 && r.cc > ex.hours[t].cc + 1e-9).map(r => r.t);
  ok(warm.length > 0, "optimum warms up the combined-cycle plant before the evening");
  console.log("optimum CC/peaker by hour: " + opt.hours.map(r => `${r.t}:${r.cc}/${r.pk}`).join(" ") + `  (above the rule in hours ${warm.join(",")})`);
  const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "fallback_grid_operator.js"), "--check"], { encoding: "utf8" });
  ok(r.status === 0, "static fallback figure is up to date (" + (r.stdout || r.stderr).trim() + ")");
}

// ---------------- stars and share links
{
  const st = M.stars(ex.totals, ex.totals);
  ok(st.reliability === 3 && st.cost === 3 && st.co2 === 3, "stars: the expert rule earns 3/3/3 against itself");
  const noGas = M.simulate(W, Array.from({ length: H }, () => ({ cc: 0, pk: 0 })));
  const s0 = M.stars(noGas.totals, ex.totals);
  ok(noGas.totals.unserved > 0 && s0.reliability === 1 && s0.cost === 1 && s0.co2 === 1, "stars: no gas at all leaves the lights out and earns one star each");
  const so = M.stars(opt.totals, ex.totals);
  ok(so.reliability === 3 && so.cost === 3, "stars: the full-day optimum earns 3 stars for cost");
  // a day that leans on the peaker: balanced, but expensive
  const pkPlan = Array.from({ length: H }, (_, t) => { const x = M.facts(W, t), need = x.demand - x.nuclear - x.wind - x.solar;
    return { cc: 0, pk: Math.max(0, Math.min(F.peaker.mw, need)) }; });
  const pkDay = M.simulate(W, pkPlan), sp = M.stars(pkDay.totals, ex.totals);
  ok(sp.cost === 1, "stars: a peaker-heavy day earns one cost star");
  for (let k = 0; k < 300; k++) {
    const p = Array.from({ length: H }, () => ({ cc: pickStep(0, F.cc.mw), pk: pickStep(0, F.peaker.mw) }));
    const back = M.decodePlan(M.encodePlan(p, W), W);
    ok(back && back.every((q, t) => q.cc === p[t].cc && q.pk === p[t].pk), "share link: encode/decode round trip");
  }
  ok(M.decodePlan("abc", W) === null && M.decodePlan("A".repeat(48), W) === null && M.decodePlan("zz".repeat(24), W) === null,
     "share link: malformed or out-of-range strings rejected");
  ok(M.encodePlan(plan, W).length === 48, "share link: 48 characters");
}

// ---------------- the lesson page states the same fleet numbers as town.json
{
  const qmd = fs.readFileSync(path.join(SITE, "learn/00-grid-operator.qmd"), "utf8");
  const table = (qmd.match(/<table class="lx-fleet"[\s\S]*?<\/table>/) || [""])[0];
  ok(table.length > 0, "page: fleet table found");
  [`${F.nuclear.mw} MW`, `${F.wind.mw} MW`, `${F.solar.mw} MW`, `0–${F.cc.mw} MW`, `0–${F.peaker.mw} MW`, `${F.cc.ramp} MW`,
   `$${F.nuclear.cost}`, `$${F.cc.cost}`, `$${F.peaker.cost}`, `${F.cc.co2} t`, `${F.peaker.co2} t`].forEach(s =>
    ok(table.indexOf(s) >= 0, `page: fleet table states ${s}`));
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
