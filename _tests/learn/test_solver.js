// test_solver.js — Node tests for the solver component (assets/learn/components/solver.js) with the vendored HiGHS
// (assets/learn/vendor/highs-1.15.4/). The same pure core runs in the page's Web Worker.
//   - a 3-generator dispatch LP: the demand dual equals the marginal generator's cost, in min and max form, and agrees
//     with a finite difference of the optimal objective; reduced costs follow the same dObjective/dBound convention
//   - infeasible and unbounded models are reported as such, with no values and no duals
//   - a MILP never reports duals or reduced costs; fixedModel + re-solve gives prices labelled conditional
//   - HiGHS early stops at an objective bound (model status 11) or target (12) are not "optimal" and not ok
//   - authoring errors (unknown or repeated names, missing bounds) come back as status "error" with a message
//   - the benchmark models (solver_models.js) solve to optimality; their timings are printed (p50/p95, Node, this machine)
// Usage (from the site folder):  node _tests/learn/test_solver.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
const { core, VERSION } = ctx.module.exports;
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const MODELS = require("./solver_models.js");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);

(async () => {
  const highs = await loadHighs();
  const solve = (m, o) => core.solveWith(highs, m, o);

  // ---------------- 3-generator dispatch: 80 MW from coal 10, gas 30, oil 60 $/MWh (50 MW each)
  const r = solve(MODELS.dispatch3(80));
  ok(r.status === "optimal" && r.ok && r.kind === "lp", "dispatch3: optimal LP");
  ok(near(r.objective, 50 * 10 + 30 * 30), `dispatch3: cost ${r.objective} = 50 x 10 + 30 x 30`);
  ok(near(r.values.coal, 50) && near(r.values.gas, 30) && near(r.values.oil, 0), "dispatch3: cheapest first (coal full, gas 30, oil 0)");
  ok(near(r.duals.demand, 30), `dispatch3: demand dual ${r.duals.demand} = marginal cost of gas (30 $/MWh)`);
  ok(near(r.rows.demand, 80), "dispatch3: balance row activity = demand");
  ok(near(r.reducedCosts.coal, -20) && near(r.reducedCosts.oil, 30) && near(r.reducedCosts.gas, 0), "dispatch3: reduced costs -20 (coal at its limit), 30 (oil idle), 0 (marginal gas)");
  const r81 = solve(MODELS.dispatch3(81));
  ok(near(r81.objective - r.objective, r.duals.demand), "dispatch3: dual = finite difference of the optimal cost (one more MWh)");
  [40, 120].forEach((D, i) => {
    const x = solve(MODELS.dispatch3(D));
    ok(near(x.duals.demand, [10, 60][i]), `dispatch3: at ${D} MW the price is set by ${["coal", "oil"][i]} (${x.duals.demand})`);
  });
  // the same with demand as >= and max sense (negated costs): duals keep the dObjective/dRHS sign convention
  const ge = MODELS.dispatch3(80); ge.constraints[0] = { name: "demand", terms: ge.constraints[0].terms, ge: 80 };
  ok(near(solve(ge).duals.demand, 30), "dispatch3: a >= demand row gives the same dual");
  const mx = MODELS.dispatch3(80); mx.sense = "max"; mx.variables.forEach(v => { v.cost = -v.cost; });
  const rmx = solve(mx), mx81 = JSON.parse(JSON.stringify(mx)); mx81.constraints[0].eq = 81; mx81.variables.forEach(v => { if (v.ub === null) v.ub = Infinity; });
  ok(near(rmx.objective, -1400) && near(rmx.duals.demand, -30) && near(solve(mx81).objective - rmx.objective, rmx.duals.demand), "dispatch3 (max of -cost): dual = dObjective/dRHS = -30");
  // objective given separately, a constant, op/rhs constraints and list-form terms
  const alt = { sense: "minimize", variables: { coal: { ub: 50 }, gas: { ub: 50 }, oil: { ub: 50 } }, objective: { terms: { coal: 10, gas: 30, oil: 60 }, constant: 7 },
    constraints: [{ name: "demand", terms: [["coal", 1], ["gas", 1], ["oil", 1]], op: "=", rhs: 80 }] };
  const ra = solve(alt);
  ok(ra.ok && near(ra.objective, 1407) && near(ra.duals.demand, 30), "model forms: objective map, constant, op/rhs and list terms");

  // ---------------- infeasible and unbounded
  const inf = solve(MODELS.dispatch3(200));
  ok(inf.status === "infeasible" && !inf.ok && inf.values === null && inf.duals === null, `infeasible: 200 MW from 150 MW of plants -> ${inf.status}`);
  const unb = solve({ sense: "max", variables: [{ name: "x", cost: 1 }, { name: "y", cost: 1 }], constraints: [{ name: "c", terms: { x: 1, y: -1 }, le: 4 }] });
  ok((unb.status === "unbounded" || unb.status === "infeasible-or-unbounded") && unb.duals === null, `unbounded: max x + y with x - y <= 4 -> ${unb.status}`);

  // ---------------- MILP: no duals; fix the integers and re-solve for conditional prices
  const milp = { sense: "min",
    variables: [{ name: "g1", ub: 100, cost: 20 }, { name: "g2", ub: 100, cost: 40 }, { name: "on1", type: "binary", cost: 500 }, { name: "on2", type: "binary", cost: 100 }],
    constraints: [{ name: "demand", terms: { g1: 1, g2: 1 }, eq: 60 }, { name: "cap1", terms: { g1: 1, on1: -100 }, le: 0 }, { name: "cap2", terms: { g2: 1, on2: -100 }, le: 0 },
      { name: "min1", terms: { g1: 1, on1: -30 }, ge: 0 }] };
  const rm = solve(milp);
  ok(rm.kind === "milp" && rm.ok && rm.duals === null && rm.reducedCosts === null, "MILP: optimal, and no duals or reduced costs");
  ok(near(rm.objective, Math.min(500 + 60 * 20, 100 + 60 * 40, 500 + 100 + 60 * 20)), `MILP: cost ${rm.objective} is the cheapest commitment`);
  ok(rm.mipGap === null || rm.mipGap <= 1e-4, "MILP: gap within the default tolerance");
  const fx = core.fixedModel(milp, rm.values), rf = solve(fx.model);
  ok(fx.fixed.on1 === 1 && fx.fixed.on2 === 0 && rf.kind === "lp" && rf.ok, "fixedModel: binaries fixed at the MILP values; the rest is an LP");
  ok(near(rf.objective, rm.objective) && near(rf.duals.demand, 20), `fix and re-price: same cost, demand price conditional on the commitment = 20 (${rf.duals.demand})`);
  ok(/conditional|fixAndReprice/.test(fs.readFileSync(L("components/solver.js"), "utf8")), "solver.js documents the conditional re-pricing");
  let threw = false; try { core.fixedModel(milp, { g1: 1 }); } catch (e) { threw = /no value/.test(e.message); }
  ok(threw, "fixedModel: refuses to fix an integer variable without a value");

  // ---------------- early stops: HiGHS model status 11 (objective bound) and 12 (objective target) are not "optimal".
  // No lesson sets these options; the test adds them to HiGHS's options through a thin wrapper around the module.
  const withOpts = extra => ({ constants: highs.constants, createModel: d => {
    const m = highs.createModel(d), set = m.options.set.bind(m.options);
    return new Proxy(m, { get: (t, k) => k === "options" ? { set: o => set(Object.assign({}, o, extra)) } : typeof t[k] === "function" ? t[k].bind(t) : t[k] });
  } });
  const tw = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8")), dy = JSON.parse(fs.readFileSync(L("data/town_days.json"), "utf8"));
  const ucBase = solve(MODELS.uc24(tw, dy));
  const tgt = core.solveWith(withOpts({ objective_target: 1e9 }), MODELS.uc24(tw, dy), {});
  ok(tgt.status === "objective-target" && !tgt.ok, `objective target: a MILP stopped at its first plan under the target is ${tgt.status}, ok ${tgt.ok}`);
  ok(tgt.values && tgt.objective > ucBase.objective + 1, `objective target: the early plan is kept (${tgt.objective && tgt.objective.toFixed(0)} against the optimum ${ucBase.objective.toFixed(0)})`);
  const bnd = core.solveWith(withOpts({ objective_bound: 1, presolve: "off", solver: "simplex", simplex_strategy: 1 }), MODELS.storage168(tw, dy), {});
  ok(bnd.status === "objective-bound" && !bnd.ok && bnd.duals === null, `objective bound: dual simplex stopped at the bound is ${bnd.status}, ok ${bnd.ok}, no duals`);
  ok(core.STATUS[11] === "objective-bound" && core.STATUS[12] === "objective-target", "status map: 11 objective-bound, 12 objective-target");

  // ---------------- authoring errors
  [[{ variables: [{ name: "x" }], constraints: [{ name: "c", terms: { y: 1 }, le: 1 }] }, /unknown variable y/],
   [{ variables: [{ name: "x" }, { name: "x" }] }, /defined twice/],
   [{ variables: [{ name: "x" }], constraints: [{ name: "c", terms: { x: 1 } }] }, /no bound/],
   [{ sense: "up", variables: [] }, /sense/],
   [{ variables: [{ name: "x", cost: NaN }] }, /not a number/]].forEach(([m, rx], i) => {
    const e = solve(m);
    ok(e.status === "error" && rx.test(e.message), `authoring error ${i + 1}: ${e.message}`);
  });

  // ---------------- benchmark models (the solver benchmark set) and timings in Node on this machine
  const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8")), days = JSON.parse(fs.readFileSync(L("data/town_days.json"), "utf8"));
  const set = [["24-hour dispatch LP", MODELS.dispatch24(town, days)], ["168-hour storage LP", MODELS.storage168(town, days)], ["24-hour unit commitment MILP", MODELS.uc24(town, days)]];
  const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)];
  set.forEach(([label, m]) => {
    const N = core.normalize(m), ms = [];
    let last;
    for (let k = 0; k < 15; k++) { last = solve(m, { timeLimit: 5 }); ms.push(last.ms.total); }
    ok(last.ok, `${label}: optimal (${N.vars.length} variables, ${N.rows.length} constraints)`);
    if (N.kind === "lp") {
      const bal = Object.keys(last.duals).filter(k => k.startsWith("balance_")).map(k => last.duals[k]);
      ok(bal.every(y => y >= -1e-6 && y <= 3000 + 1e-6), `${label}: hourly balance duals between 0 and the shed penalty`);
    } else ok(last.duals === null, `${label}: no duals`);
    console.log(`  ${label}: ${N.vars.length} vars, ${N.rows.length} rows, objective ${last.objective.toFixed(0)}; Node p50 ${pct(ms, 0.5).toFixed(1)} ms, p95 ${pct(ms, 0.95).toFixed(1)} ms`);
  });
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL:", e && e.stack || e); process.exit(1); });
