// test_e1-engine.js — Node tests for engine E1 (assets/learn/components/engine-e1.js, LX.E1) with the vendored HiGHS, the
// solver core the pages run in a Web Worker. What it checks:
//   - the data: the solar values are LX.townProfile's (monthlyCF) for the named 2025 hours, F7's method; the 20-22 January
//     window; the tariff's flat-load average is EIA's 13.37¢; the loads total 1,200 kW; the seeded outages are fixed by
//     their seed and fit their window
//   - the plan link: the schema is valid; defaults, presets and 300 seeded random plans survive encode and decode (SB1's
//     and C1's schemas); a damaged link is refused
//   - the models as built: hour-by-hour balances, the battery's charge, the fuel limit, whole sets and their 30%
//     minimum in the check; the cost accounting (capital recovery, upkeep, bill) against the solver's objective
//   - ties: the totals the pages report (unserved kWh per load and priority, diesel, the bill)
//     stay the same when the tie weights change; the hourly schedule is not claimed unique
//   - no prices from a MILP: every MILP result has duals null and the engine never reads a dual
//   - sizing: optimal; the sized plan, rounded up, carries the must-stay-on loads in its check; rounding up never makes
//     the check worse; an infeasible plan gets a hint
//   - branch and bound on the sets: proven, with the same cost as HiGHS's MILP; a node whose LP fails (a time limit
//     stubbed into one solve) leaves the tree not proven with an open gap, and a retry proves it
//   - solve never rejects: a solver that throws, rejects, returns nothing or an error gives status "error"; a time limit
//     with a plan gives "time-limit", the plan, its gap and "not proven" (never "optimal"); a real time-limited solve
//     (HiGHS with a 1 ms limit) too; BenchRun.classify of each result offers Try again and never says optimal
//   - the rolling horizon: a perfect forecast leaves the sized plan's must-stay-on loads served; yesterday's sun leaves
//     them short; every real hour balances; the battery and the tank stay in bounds
//   - the details: normal-year unserved load reported and the saving not called one; each outage's diesel priced on its
//     own, outside the annual cost; end-of-hour labels across midnight and a month; the outage weights as the page
//     states them; realTime brings must-stay-on loads back before it charges; the 12 average days against a full
//     8,760-hour year; the bench in a stub DOM: a sizing adopts its sizes onto the plan it was given and tells the other
//     results, a change while it runs stops it and adopts nothing, and Stop cancels a run
// Usage (from the site folder):  node _tests/learn/test_e1-engine.js
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e1_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const SD = require("./stubdom.js");

(async () => {
  const { E1, cfg, P, SS, solveSync, solver, L, SITE } = await X.load();
  const BR = require(L("components/benchrun.js"));
  const PR = require(L("components/profiles.js"));
  const SRC = fs.readFileSync(L("components/engine-e1.js"), "utf8");

  // ---------------- data
  const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8")), targets = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
  const pm = PR.townProfile("solar", 1, { year, targets, monthlyCF: true });
  const r3 = x => +x.toFixed(3);
  ok(cfg.sun.winter.kw.length === 61 * 24 && cfg.sun.winter.kw.every((v, i) => v === r3(pm.mw[i])), "winter sun: every hour from 1 January to 2 March 2025 equals townProfile (monthlyCF), F7's method");
  ok(cfg.sun.july.kw.every((v, i) => v === r3(pm.mw[208 * 24 + i])), "July window: 72 hours from 28 July 2025 (day 208)");
  let d0 = 0, mOk = true;
  E1.MD.forEach((nd, m) => { for (let h = 0; h < 24; h++) { let s = 0; for (let d = 0; d < nd; d++) s += pm.mw[(d0 + d) * 24 + h]; if (cfg.sun.months[m][h] !== r3(s / nd)) mOk = false; } d0 += nd; });
  ok(mOk, "the 12 average days are the mean of each hour over each month");
  ok(near(cfg.sun.annualCF, 0.24, 1e-9), "annual solar capacity factor 24.0% (EIA 2025)");
  const jan = P.scen.jan3;
  ok(jan.hours === 72 && jan.sun.join() === cfg.sun.winter.kw.slice(19 * 24, 22 * 24).join() && jan.first === "2025-01-01" && E1.when(jan, 0) === "20 Jan 00:00" && E1.when(jan, 71) === "22 Jan 23:00", "the winter storm: 72 hours from 00:00 on 20 January 2025");
  ok(jan.sun.slice(0, 18).join() === [0, 0, 0, 0, 0, 0, 0, 0, 0.059, 0.276, 0.434, 0.477, 0.463, 0.455, 0.463, 0.42, 0.362, 0.101].join(), "the storm's first day equals F7's January window (first 18 hours)");
  ok(jan.sun.filter(v => v === 0).length === 40, "40 of the storm's 72 hours have no sun (M5's numbers to remember)");
  ok(E1.when(P.scen.eve1, 0) === "20 Jan 16:00" && P.scen.eve1.hours === 24 && E1.when(P.scen.jul3, 0) === "28 Jul 00:00", "the evening and summer outages start where their labels say");
  ok(P.total === 1200 && P.loads.map(l => l.kw).join() === "300,100,250,550", "F7's loads: 300, 100, 250, 550 kW, 1,200 kW in all");
  const T = cfg.grid.tariffs.tou, avg = (19 * T.off + 5 * T.on) / 24;
  ok(near(avg, 13.37, 0.005) && near(T.on / T.off, 3, 0.002) && cfg.grid.tariffs.flat.rate === 13.37, "time-of-use: on-peak three times off-peak, and a flat load pays 13.37¢ on average (" + avg.toFixed(4) + ")");
  ok(cfg.fuel.price === 3.66 && cfg.fuel.co2 === 10.19 && cfg.grid.co2 === 0.367 && near(0.81 * 0.45359237, 0.367, 0.0005), "EIA's diesel price, diesel CO2 and grid CO2 (0.81 lb = 0.367 kg)");
  ok(P.seeded.length === 10 && P.seeded.every(s => s.hours >= 6 && s.hours <= 72 && s.start >= 0 && s.start <= 55 * 24 + 23 && s.sun.length === s.hours), "ten seeded outages, 6 to 72 hours, starting 1 January to 25 February");
  const P2 = E1.prepare(JSON.parse(JSON.stringify(cfg)));
  ok(P2.seeded.map(s => s.start + ":" + s.hours).join() === P.seeded.map(s => s.start + ":" + s.hours).join(), "the seeded outages are the same every time (seed 7): " + P.seeded.map(s => E1.when(s, 0) + "/" + s.hours + "h").join(", "));
  ok(/675 gallons/.test(cfg.campus.asBuilt.note) && near(400 * 24 * cfg.tech.gen.galPerKWh, 672, 1e-9), "F7's 24 hours of fuel for 400 kW is 672 gallons; the preset keeps 675 (the bench's 25-gallon step)");

  // ---------------- the plan link
  [E1.schema, E1.makeSchema({ key: "c1", defaults: { pd: "must", out: ["jan3"] } })].forEach(S => {
    let threw = null; try { SS.checkSchema(S); } catch (e) { threw = e.message; }
    ok(!threw, S.key + ": the schema is valid " + (threw || ""));
    const def = SS.defaults(S);
    ok(!SS.validate(S, def).length, S.key + ": the defaults are valid");
    E1.presets.forEach(p => { const st = Object.assign({}, def, p.state); ok(!SS.validate(S, st).length && SS.same(S, SS.decode(S, SS.encode(S, st)).state, st), S.key + ": preset " + p.id + " round-trips"); });
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, bad = [];
    for (let k = 0; k < 300; k++) {
      const st = {};
      S.fields.forEach(f => {
        if (f.type === "int") st[f.id] = f.min + Math.round(rnd() * (f.max - f.min) / (f.step || 1)) * (f.step || 1);
        else if (f.type === "enum") st[f.id] = f.values[Math.floor(rnd() * f.values.length)];
        else if (f.type === "set") st[f.id] = f.values.filter(() => rnd() < 0.5);
      });
      const h = SS.encode(S, st), back = SS.decode(S, h);
      if (back.status !== "ok" || !SS.same(S, back.state, st) || !/^[a-z0-9_-]+$/i.test(h)) bad.push(h);
    }
    ok(!bad.length, S.key + ": 300 seeded random plans round-trip through the link (" + bad.slice(0, 2).join(" ") + ")");
    ok(SS.decode(S, "#" + S.key + "-v1-pv999999").status === "bad", S.key + ": a damaged link is refused");
  });
  ok(SS.encode(E1.schema, SS.defaults(E1.schema)) === "mg-v1-pv600-b2000-g2-f675-ph0-pw0-pd1-pl2-o1-ex500-im2000-t0-w2-al7", "the default plan's link");

  // ---------------- costs
  const def = SS.defaults(E1.schema), cs = E1.costs(def, P);
  ok(near(E1.crf(0.05, 20), 0.05 * Math.pow(1.05, 20) / (Math.pow(1.05, 20) - 1), 1e-12) && near(E1.crf(0.05, 20), 0.0802426, 1e-6), "capital recovery factor (5%, 20 years) 0.0802");
  ok(near(cs.per.pv, 1800 * E1.crf(0.05, 25) + 20) && near(cs.per.bat, 450 * (E1.crf(0.05, 15) + 0.025)) && near(cs.per.gen, 200 * (600 * E1.crf(0.05, 20) + 15)) && near(cs.per.tank, 5 * E1.crf(0.05, 20)), "each item's cost a year at the community owner's 5%");
  let bb0 = 0; for (let m = 0; m < 12; m++) for (let h = 0; h < 24; h++) bb0 += E1.MD[m] * 1200 * (h >= 16 && h < 21 ? 0.2831 : 0.0944);
  ok(near(E1.baseBill(def, P), bb0, 1e-6) && near(E1.baseBill(Object.assign({}, def, { tar: "flat" }), P), 1200 * 8760 * 0.1337, 1e-6), "the grid-only bill: " + E1.money(bb0) + " (time-of-use), " + E1.money(1200 * 8760 * 0.1337) + " (flat)");

  // ---------------- the check of a plan: year LP and outage MILPs
  const f7 = Object.assign({}, def, { out: ["jan3", "eve1", "jul3"] });
  const ry = solveSync(E1.yearModel(f7, P)), y = E1.readYear(f7, P, ry);
  ok(ry.ok && ry.duals && y.unserved < 1e-6, "year LP optimal, nothing unserved with a 2,000 kW import limit");
  let tie = 0; for (let m = 0; m < 12; m++) for (let h = 0; h < 24; h++) { const p = "y" + m + "_" + h; tie += E1.MD[m] * 1e-4 * (ry.values[p + "c"] + ry.values[p + "d"]); }
  ok(near(ry.objective, y.bill + tie, 1e-4), "year LP: objective = the bill + the battery tie cost ($" + tie.toFixed(2) + ")");
  let balOk = true;
  y.days.forEach(day => day.forEach((h, k) => { if (!near(h.s + h.d + h.i - h.c - h.e, 1200, 1e-5)) balOk = false; const q0 = day[(k + 23) % 24].q; if (!near(h.q, q0 + 0.9 * h.c - h.d, 1e-5)) balOk = false; if (h.i > 2000 + 1e-6 || h.e > 500 + 1e-6) balOk = false; }));
  ok(balOk, "year LP: every hour balances at 1,200 kW, the battery's charge carries over around each day, the feeder's limits hold");
  const ry2 = solveSync(E1.yearModel(f7, P, { tieBattery: 3e-4 })), y2 = E1.readYear(f7, P, ry2);
  ok(near(y2.bill, y.bill, 1.0), "tie rule: the year's bill stays the same with another battery tie weight (" + E1.money(y.bill) + ", " + E1.money(y2.bill) + ")");
  const runF7 = await E1.solve(f7, P, { solver });
  ok(runF7.ok && runF7.status === "optimal" && runF7.results.outages.length === 3, "F7's campus: the run (year + 3 outages) is optimal");
  const R7 = runF7.results;
  R7.outages.forEach(o => {
    const sc = o.sc; let good = true;
    o.hours.forEach((h, t) => {
      const served = 1200 - h.x.reduce((a, b) => a + b, 0);
      if (!near(h.s + h.d + h.g - h.c, served, 1e-4)) good = false;
      if (h.s > f7.pv * sc.sun[t] + 1e-6 || h.g > 200 * h.u + 1e-6 || (h.u > 0 && h.g < 60 * h.u - 1e-6) || h.u > f7.gen || h.u !== Math.round(h.u)) good = false;
      const q0 = t ? o.hours[t - 1].q : f7.bat; if (!near(h.q, q0 + 0.9 * h.c - h.d, 1e-4) || h.q > f7.bat + 1e-6) good = false;
    });
    ok(good && o.fuel <= f7.fuel + 1e-6, o.id + ": every hour balances; whole sets, each at 30% to 100%; the battery's charge; diesel within the tank (" + o.fuel.toFixed(1) + " gal)");
    ok(near(o.co2, o.fuel * 10.19, 1e-6) && near(o.must, o.perLoad[0] + o.perLoad[1], 1e-6) && near(o.keep, o.perLoad[2], 1e-6) && near(o.shed, o.perLoad[3], 1e-6), o.id + ": CO2 = gallons × 10.19 kg; unserved summed by priority");
  });
  ok(R7.outages[0].must > 1000 && R7.outages[1].must < 0.5, "F7's campus leaves must-stay-on load short in the storm (" + E1.kilo(R7.outages[0].must) + " kWh) but not in the winter evening");
  ok(near(R7.total, R7.equipment.equipment + R7.year.bill, 1e-6) && near(R7.saving, R7.base - R7.total, 1e-6), "annual cost = equipment + bill; saving = grid-only bill − annual cost");
  // ties: totals under other tie weights
  const alt = [{ order: 0.02, time: 0 }, { order: 0, time: 0.05, fuel: 0.05 }, { battery: 0.002 }];
  let tieOk = true, tieMsg = [];
  R7.outages.forEach(o => alt.forEach(tw => {
    const r = solveSync(E1.outageModel(f7, P, o.sc, { tie: tw }), { gap: 1e-6 }), z = E1.readOutage(f7, P, o.sc, r);
    ["must", "keep", "shed"].forEach(k => { if (!near(z[k], o[k], 1.0)) { tieOk = false; tieMsg.push(o.id + " " + k + " " + z[k].toFixed(1) + "/" + o[k].toFixed(1)); } });
    if (!near(z.fuel, o.fuel, 0.5)) { tieOk = false; tieMsg.push(o.id + " fuel " + z.fuel.toFixed(2) + "/" + o.fuel.toFixed(2)); }
  }));
  ok(tieOk, "tie rule: unserved kWh by priority and the diesel stay the same with other tie weights " + tieMsg.join("; "));
  // no prices
  ok(runF7.raw.solves.length === 4 && runF7.raw.outages.every(o => o.r.duals === null && o.r.kind === "milp"), "no prices: every outage solve is a MILP that returns no duals");
  ok(!/\.duals\b|reducedCosts|fixAndReprice/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "no prices: the engine never reads a dual or re-prices");

  // ---------------- sizing
  const sz = await E1.solve(def, P, { solver, task: "size", check: false });
  ok(sz.ok && sz.results.sizeOnly && sz.results.sized.gap != null && sz.results.sized.gap <= 1e-6, "size (defaults): optimal within 0.0001%");
  const S1 = sz.results.sized;
  ok(S1.rounded.pv % 25 === 0 && S1.rounded.bat % 50 === 0 && S1.rounded.pv >= S1.exact.pv - 1e-9 && S1.rounded.bat >= S1.exact.bat - 1e-9 && S1.rounded.gen === S1.exact.gen, "the sizes are rounded up to the bench's steps (" + JSON.stringify(S1.rounded) + ")");
  const rs1 = await E1.solve(sz.results.plan, P, { solver });
  ok(rs1.ok && rs1.results.outages[0].must < 0.5, "the sized plan, checked with whole sets and their minimum, carries the must-stay-on loads through the storm");
  ok(near(S1.total, S1.equipment + S1.bill, 1e-6) && S1.objective >= S1.total - 1e-6 && S1.objective - S1.total < 1000, "the sizing's cost = equipment + bill; the objective adds only tie terms ($" + (S1.objective - S1.total).toFixed(2) + ")");
  ok(rs1.results.total >= S1.total - 1e-6, "rounding up costs a little more than the exact optimum (" + E1.money(rs1.results.total) + " ≥ " + E1.money(S1.total) + ")");
  // rounding up never makes the check worse: more equipment, the same outages
  const cases = [Object.assign({}, def, { pd: "must" }), Object.assign({}, def, { tar: "flat", exp: 0 })];
  for (const c of cases) {
    const s = await E1.solve(c, P, { solver, task: "size", check: false }); const z = s.results.sized;
    const ex = Object.assign({}, c, { pv: z.exact.pv, bat: z.exact.bat, gen: z.exact.gen }), up = s.results.plan;
    const a = E1.readOutage(ex, P, P.scen.jan3, solveSync(E1.outageModel(ex, P, P.scen.jan3, { relax: true }))), b = E1.readOutage(up, P, P.scen.jan3, solveSync(E1.outageModel(up, P, P.scen.jan3)));
    ok(a.must < 0.5 && b.must < 0.5, "sized for " + (c.pd === "must" ? "650 kW" : "flat, no export") + ": the exact sizes serve the must-stay-on loads with the minimum relaxed, and the rounded plan with it");
  }
  const inf = await E1.solve(Object.assign({}, def, { pd: "must", allow: ["pv", "bat"] }), P, { solver, task: "size", check: false });
  ok(inf.status === "infeasible" && !inf.ok && /650 kW/.test(inf.hint) && !inf.results, "infeasible sizing (650 kW must stay on, no generator): a hint, no results: " + inf.hint);
  const none = await E1.solve(Object.assign({}, def, { out: [] }), P, { solver, task: "size", check: false });
  ok(none.ok && none.results.sized.exact.gen === 0 && near(S1.total - none.results.sized.total, 12629, 5), "without an outage no sets are bought; the storm adds " + E1.money(S1.total - none.results.sized.total) + " a year (the difference of two solved plans)");

  // ---------------- branch and bound on the sets (M5's tree)
  const flat = Object.assign({}, def, { tar: "flat", exp: 2000 });
  const mz = E1.sizeModel(flat, P, [P.scen.jan3]);
  const Tr = E1.bb.run(mz, ["N"], m => solveSync(m));
  const mi = solveSync(mz, { gap: 1e-6 });
  ok(E1.bb.proven(Tr) && Tr.branchings === 1 && Tr.solved === 3 && near(Tr.inc.bound, mi.objective, 1e-6 * mi.objective) && Math.round(Tr.inc.x.N) === Math.round(mi.values.N), "the tree on the sets is proven in 1 branching and 3 LPs, at HiGHS's MILP cost (" + E1.money(Tr.inc.bound) + ", " + Math.round(Tr.inc.x.N) + " sets)");
  ok(near(Tr.nodes[0].x.N, 1.312, 0.001) && Tr.nodes[1].at === 1 && Tr.nodes[2].at === 2 && Tr.nodes[2].status === "best", "the relaxation buys 1.312 sets; the children are at most 1 and at least 2; 2 is best");
  // a node's LP fails: the tree is not proven, the gap stays open, retry proves it
  let n = 0;
  const T2 = E1.bb.tree(mz, ["N"]);
  const settle = failAt => E1.bb.pending(T2).forEach(m => { n++; E1.bb.accept(T2, m.id, n === failAt ? { status: "time-limit", ok: false } : solveSync(m.model)); });
  settle(2); E1.bb.branch(T2); settle(2);
  n = 10; settle(0);
  const v1 = E1.bb.verdict(T2);
  ok(!E1.bb.proven(T2) && v1 && !v1.proven && /Not proven/.test(v1.text) && !/[Pp]roven optimal/.test(v1.text), "a node whose LP stopped: the tree is not proven (" + (v1 && v1.text) + ")");
  if (T2.nodes[1].status === "error") {
    ok(T2.nodes[1].bound === T2.nodes[0].bound && E1.bb.gap(T2) > 0, "the unsolved node keeps its parent's bound and the gap stays open");
    E1.bb.retry(T2); settle(0);
    ok(E1.bb.proven(T2) && near(T2.inc.bound, Tr.inc.bound, 1e-6), "after a retry the tree is proven");
  } else ok(T2.nodes.some(n2 => n2.status === "error"), "one node stays unsolved");

  // ---------------- solve never rejects; failure states
  const bads = [() => { throw new Error("boom"); }, () => Promise.reject(new Error("no")), () => null, () => Promise.resolve({ status: "error", ok: false })];
  for (const b of bads) {
    const r = await E1.solve(def, P, { solver: b });
    const c = BR.classify(r, {}, true);
    ok(r && r.status === "error" && !r.ok && !r.results && typeof r.message === "string" && c.kind === "error" && c.retry && !/optimal/i.test(c.text), "a failing solver gives status error, a message and Try again: " + r.message);
  }
  const tlStub = (m, o) => { const r = solveSync(m, o); if (r.values && m.variables.some(v => v.type === "integer")) { r.status = "time-limit"; r.ok = false; r.mipGap = 0.0123; } return Promise.resolve(r); };
  const tl = await E1.solve(f7, P, { solver: tlStub });
  const ctl = BR.classify(tl, {}, true);
  ok(tl.status === "time-limit" && !tl.ok && tl.results && tl.mipGap === 0.0123 && /not proven optimal/.test(tl.message) && /1\.23%/.test(tl.message) && ctl.kind === "early" && ctl.draw && ctl.retry && !/is optimal|reports optimal|best plan/i.test(ctl.text), "a time limit with a plan: drawn as the best found so far, its gap, not proven: " + tl.message);
  const tl2 = await E1.solve(def, P, { solveSync, solver: (m, o) => Promise.resolve(solveSync(m, { timeLimit: 0.001 })), task: "size", check: false });
  const ctl2 = BR.classify(tl2, {}, true);
  ok(tl2.status === "time-limit" && !tl2.ok && !/is optimal|reports optimal/.test(tl2.message || "") && ctl2.retry, "a real time-limited solve (HiGHS, 1 ms): status time-limit, " + (tl2.results ? "the plan kept, not proven" : "no plan shown") + ": " + tl2.message);
  const okc = BR.classify(rs1, {}, true);
  ok(okc.kind === "ok" && /reports optimal/.test(okc.text), "a finished run says optimal: " + okc.text);

  // ---------------- the rolling horizon
  const plan = sz.results.plan, rolls = {};
  for (const key of ["perfect", "persist", "sunny", "dull"]) rolls[key] = await E1.roll(plan, P, P.scen.jan3, key, m => solveSync(m, { gap: 1e-6 }));
  ok(rolls.perfect.totals.must < 0.5 && rolls.perfect.status === "optimal" && rolls.perfect.plans.length === 12, "rolling, perfect forecast: 12 re-plans, the must-stay-on loads served");
  ok(rolls.persist.totals.must > 1000 && rolls.sunny.totals.must > rolls.persist.totals.must, "rolling on yesterday's sun leaves " + E1.kilo(rolls.persist.totals.must) + " kWh of must-stay-on load short; too sunny " + E1.kilo(rolls.sunny.totals.must) + " kWh; too dull " + E1.kilo(rolls.dull.totals.must) + " kWh");
  let rtOk = true;
  Object.keys(rolls).forEach(k => { let fuel = plan.fuel; rolls[k].hours.forEach((h, t) => {
    const served = 1200 - h.x.reduce((a, b) => a + b, 0), sun = plan.pv * P.scen.jan3.sun[t];
    if (!near(h.s + h.d + h.g - h.c, served, 1e-4) || h.s > sun + 1e-6 || h.q < -1e-6 || h.q > plan.bat + 1e-6 || h.g > 200 * h.u + 1e-6 || (h.u > 0 && h.g < 60 * h.u - 1e-6)) rtOk = false;
    fuel -= 0.07 * h.g; if (fuel < -1e-6) rtOk = false; }); });
  ok(rtOk, "rolling: every real hour balances, solar within the sun, sets within 30% to 100%, battery and tank within bounds");
  ok(near(E1.forecast(P, jan, 0, "persist")[10], cfg.sun.winter.kw[18 * 24 + 10]) && near(E1.forecast(P, jan, 24, "persist")[0], jan.sun[0]) && E1.forecast(P, jan, 0, "sunny").every(v => v <= 1), "forecasts: persistence uses the last full day; too sunny is capped at the panels' size");

  // ---------------- the details, one by one
  // end-of-hour labels: the battery's charge after hour t is labelled t + 1, across midnight and a month
  ok(E1.hourEnd(jan, 0) === "20 Jan 01:00" && E1.hourEnd(jan, 23) === "21 Jan 00:00" && E1.hourEnd(jan, 71) === "23 Jan 00:00" && E1.hourEnd(P.scen.eve1, 7) === "21 Jan 00:00" &&
    E1.hourEnd({ first: "2025-01-01", start: 30 * 24 + 23 }, 0) === "1 Feb 00:00" && /\["Hour ending", "Battery charge", "Diesel left"\], rows: x\.hours\.map\(function \(h, i\) \{ return \[hourEnd\(x\.sc, h\.t\)/.test(SRC), "end-of-hour labels: 01:00 after the first hour, midnight and 31 January to 1 February roll over");
  // normal-year unserved load: no equipment and an 800 kW import limit
  const shortPlan = Object.assign({}, def, { pv: 0, bat: 0, gen: 0, imp: 800, out: [] }), rsh = await E1.solve(shortPlan, P, { solver });
  const Rsh = rsh.results, nsh = E1.note(shortPlan, Rsh, P);
  ok(rsh.ok && Rsh.short && !Rsh.comparable && near(Rsh.year.unserved, 400 * 8760, 1) && nsh.results.some(r => r.label === "Unserved in a normal year on the grid" && r.value === "3,504,000 kWh") && !R7.short && R7.comparable,
    "a plan that leaves " + E1.kilo(Rsh.year.unserved) + " kWh unserved in a normal year is flagged, not comparable, and the note says so; F7's campus is comparable");
  ok(/R\.comparable \? \["Saving on the grid-only bill"/.test(SRC) && /if \(R\.short\) H\("p", \{ class: "e1-short"/.test(SRC), "the bench shows the unserved kWh in place of a saving, and the results say why");
  // each outage's diesel, priced on its own
  const o0 = R7.outages[0], n7 = E1.note(f7, R7, P);
  ok(near(o0.fuelCost, o0.fuel * 3.66, 1e-9) && near(R7.total, R7.equipment.equipment + R7.year.bill, 1e-6) && E1.fuelMoney(o0.fuelCost) === "$2,470" &&
    n7.results[0].note === E1.costNote && /outage diesel not included/.test(E1.costNote) && n7.results.some(r => /gallons of diesel burned \(\$2,470 at \$3\.66 a gallon, not in the annual cost\)/.test(r.note || "")) &&
    n7.assumptions.some(a => /leaves out the diesel burned in an outage and refilling the tank; no outage frequency is assumed/.test(a)),
    "outage diesel: priced at $3.66 a gallon, shown per outage, kept out of the annual cost, and said so in the note");
  // the outage weights, as the results state them
  ok(E1.PRIO_W.must / E1.PRIO_W.keep === 100 && E1.PRIO_W.keep / E1.PRIO_W.shed === 10 && E1.TIE.order === 0.005 && E1.TIE.time === 0.02 &&
    /a kWh of must stay on weighs 100 times one of keep if possible, which weighs 10 times one of shed first/.test(SRC) && /each step up the list \(hospital, water and heat, dorms, labs\) counts 0\.5% more and an earlier hour up to 2% more: a preference, not a strict order/.test(SRC) &&
    !/within one priority the list order decides/.test(SRC), "the results state the outage model's weights as built: 100 and 10 between priorities, 0.5% a step, up to 2% for earlier hours");
  // realTime: spare power brings shed must-stay-on loads back before it charges the battery
  const rt = E1.realTime(def, P, { u: 0, g: 0, x: [300, 0, 250, 550], sunReal: 1 }, { soc: 1000, fuel: 675 });
  ok(rt.hour.x[0] === 0 && near(rt.hour.c, 200, 1e-9) && rt.hour.x[2] === 250 && rt.hour.x[3] === 550, "realTime: 600 kW of sun, the plan shed the hospital: the hospital comes back first (0 kWh short), then 200 kW charge the battery");
  // the 12 average days against a full 8,760-hour year: F7's campus the same, the sized plan 4% to 7% higher
  const fyF7 = X.fullYear(E1, P, def, solveSync), fyS = X.fullYear(E1, P, sz.results.plan, solveSync);
  const avF7 = E1.readYear(def, P, solveSync(E1.yearModel(def, P))).bill, avS = E1.readYear(sz.results.plan, P, solveSync(E1.yearModel(sz.results.plan, P))).bill;
  ok(fyF7.status === "optimal" && fyS.status === "optimal" && Math.abs(fyF7.bill / avF7 - 1) < 5e-4 && fyS.bill / avS - 1 >= 0.04 && fyS.bill / avS - 1 <= 0.07,
    "full year vs 12 average days: F7's campus " + E1.money(fyF7.bill) + " vs " + E1.money(avF7) + "; the sized plan " + E1.money(fyS.bill) + " vs " + E1.money(avS) + " (+" + ((fyS.bill / avS - 1) * 100).toFixed(1) + "%)");
  // the bench in a stub DOM: solves wait until the test releases them, so a change can land mid-sizing
  {
    const E = SD.env();
    if (!SD.El.prototype.insertBefore) SD.El.prototype.insertBefore = function (c, ref) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); this._html = null; return c; };
    ["toggle", "controls", "sharestate", "benchrun", "engine-e1"].forEach(nm => SD.load(nm, E));
    const LE = E.LX.E1;
    LE.Line = () => ({ el: E.LX.H("div"), set() {} });   // the diagram's HTML is not what this checks (the stub does not parse innerHTML)
    let held = [];
    const deferred = () => (m, o) => new Promise(res => held.push(() => res(solveSync(m, o))));
    const flush = async () => { for (let k = 0; k < 60; k++) { await new Promise(r => setImmediate(r)); if (held.length) { const h = held; held = []; h.forEach(f => f()); } } };
    const live = E.LX.H("div", null, E.body), resHost = E.LX.H("div", null, E.body), told = [];
    const B = LE.Bench(live, { P: LE.prepare(cfg), slug: "t", resultsHost: resHost, solver: deferred, onChange: p => told.push(p) });
    const stopB = live.querySelector(".e1-stop");
    B.size();
    ok(B.run.running() && stopB && !stopB.hidden, "a sizing runs, with a visible Stop button");
    await flush();
    ok(B.plan().pv === S1.rounded.pv && B.plan().bat === S1.rounded.bat && B.plan().gen === S1.rounded.gen && told.length === 1 && told[0].pv === S1.rounded.pv && B.sizeNote() && SS.same(E1.schema, B.sizeNote().plan, B.plan()),
      "Size it for me adopts the rounded sizes onto the plan it was given and tells the other results panels (onChange: " + told.length + "; SB1 2)");
    B.set({ pv: 600, bat: 2000, gen: 2 }); const before = told.length;
    B.size(); B.set({ pd: "must" });
    ok(!B.run.running() && /Size it for me stopped: the plan changed while it ran/.test(B.run.status.textContent) && B.run.again.hidden && told.length === before + 1, "a change while the sizing runs stops it, hides Try again and says why");
    await flush();
    ok(B.plan().pv === 600 && B.plan().bat === 2000 && B.plan().pd === "must" && told.length === before + 1, "the stopped sizing adopts nothing: the reader's plan stays");
    B.go(); ok(B.run.running() && !stopB.hidden, "a run shows Stop");
    stopB.click();
    ok(!B.run.running() && stopB.hidden && B.run.status.textContent === "The run was stopped." && SD.active() === B.run.button, "Stop cancels the run, hides itself and gives the focus back to Run");
    await flush();
  }

  // ---------------- sizes and timing (printed, for the benchmark)
  const t0 = Date.now(); solveSync(E1.sizeModel(Object.assign({}, def, { out: ["jan3", "eve1", "jul3"], pd: "must" }), P, ["jan3", "eve1", "jul3"].map(i => P.scen[i])), { gap: 1e-6 });
  const sm = E1.sizeModel(def, P, [jan]), om = E1.outageModel(def, P, jan);
  console.log("sizing MILP " + sm.variables.length + " x " + sm.constraints.length + " (1 integer); outage MILP " + om.variables.length + " x " + om.constraints.length + " (" + om.variables.filter(v => v.type === "integer").length + " integers); 3-outage sizing " + (Date.now() - t0) + " ms in Node");
  console.log(`test_e1-engine: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
