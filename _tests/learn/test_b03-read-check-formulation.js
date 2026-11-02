// test_b03-read-check-formulation.js — Node tests for bridge B3 (assets/learn/b03-read-check-formulation.js) and its data
// (assets/learn/data/b03-read-check-formulation.json): the four hours are lesson 0's day; the correct model, solved with
// the vendored HiGHS, matches the precomputed solution the page shows before solving (balance, costs, duals, curtailment);
// each planted bug gives the symptom the page describes; the row counts, units and sums are right; and every number the
// page states matches the model.
// Usage (from the site folder):  node _tests/learn/test_b03-read-check-formulation.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L("b03-read-check-formulation.js"));
const G0 = require(L("grid-operator.js"));
const J = JSON.parse(fs.readFileSync(L("data/b03-read-check-formulation.json"), "utf8"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/b03-read-check-formulation.qmd"), "utf8");
const JS = fs.readFileSync(L("b03-read-check-formulation.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));

(async () => {
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports, highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const inst = M.instance(town, year), T = inst.T, ref = J.ref;
  const solve = bug => M.summarize(inst, core.solveWith(highs, M.buildModel(inst, bug)));

  // ---------------- data: four hours of lesson 0's day; the start is lesson 0's cheapest-first plan at 16:00
  {
    const W = G0.prepare(town, year, "lesson0"), plan = G0.expertPlan(W);
    T.forEach(t => ok(inst.d[t] === W.demand[t] && inst.a.wind[t] === W.wind[t] && inst.a.solar[t] === W.solar[t], `data: hour ${t} equals lesson 0's day`));
    ok(inst.start === plan[16].cc && plan[16].cc === 45, "data: the combined-cycle plant starts from lesson 0's 45 MW at 16:00");
    ok(JSON.stringify(ref.hours) === JSON.stringify(T), "data: hours 17-20");
    ok(inst.c.nuc === 10 && inst.c.cc === 40 && inst.c.pk === 100 && inst.cap.nuc === 100 && inst.cap.cc === 150 && inst.cap.pk === 100 && inst.ramp === 40, "data: Prairie Town's fleet");
  }

  // ---------------- the correct model
  const S = solve(null);
  {
    ok(S.ok && S.balanced && !S.overWeather, "correct: optimal, balanced every hour, within the weather");
    ok(near(S.objective, ref.objective) && near(S.trueCost, ref.objective), `correct: cost ${S.objective} = precomputed ${ref.objective}`);
    ok(near(S.objective, 4 * 100 * 10 + 40 * (75 + 115 + 145 + 130)), "correct: $22,600 = nuclear 4 × 100 × $10 + combined-cycle 465 MWh × $40");
    S.rows.forEach((x, k) => {
      ["nuc", "cc", "pk"].forEach(g => ok(near(x[g], ref.p[g][k]), `correct ${x.t}: ${g} ${x[g]} = precomputed ${ref.p[g][k]}`));
      ok(near(x.wind + x.solar, ref.p.wind[k] + ref.p.solar[k]), `correct ${x.t}: wind + solar ${x.wind + x.solar} = precomputed`);
      ok(near(x.u, ref.u[k]) && near(x.dual, ref.balanceDuals[k]), `correct ${x.t}: unserved 0 and balance dual ${x.dual} = ${ref.balanceDuals[k]}`);
      ok(x.dual >= -1e-9, `correct ${x.t}: balance dual ≥ 0`);
      const sum = ref.p.nuc[k] + ref.p.wind[k] + ref.p.solar[k] + ref.p.cc[k] + ref.p.pk[k] + ref.u[k];
      ok(sum === inst.d[x.t], `precomputed ${x.t}: the plants add up to demand (${sum})`);
      ok(ref.p.wind[k] <= inst.a.wind[x.t] && ref.p.solar[k] <= inst.a.solar[x.t], `precomputed ${x.t}: within the weather`);
    });
    ok(near(S.rows[0].curtailed, 10) && S.rows.slice(1).every(x => near(x.curtailed, 0)), "correct: 10 MW spilled at 17:00, none later");
    T.forEach((t, k) => { if (k) ok(Math.abs(ref.p.cc[k] - ref.p.cc[k - 1]) <= 40, `correct: ramp ${t}`); });
    ok(Math.abs(ref.p.cc[0] - inst.start) <= 40, "correct: ramp from 16:00");
    ok(ref.p.cc[1] - ref.p.cc[0] === 40, "correct: the climb from 17:00 to 18:00 uses the whole ramp (why 18:00 costs $80)");
    const D = S.duals;
    T.forEach(t => { ok(D["wx_wind_" + t] <= 1e-9 && D["wx_solar_" + t] <= 1e-9, `correct ${t}: weather-limit duals ≤ 0`);});
    ok(near(D.ramp_18, -40), "correct: ramp dual at 18:00 is −40 (a looser ramp saves $40)");
    // finite difference: one more MWh at 18:00 costs $80
    const inst2 = M.instance(town, year); inst2.d[18] += 1;
    const S2 = M.summarize(inst2, core.solveWith(highs, M.buildModel(inst2, null)));
    ok(near(S2.objective - S.objective, 80), `correct: +1 MWh at 18:00 adds $${S2.objective - S.objective}`);
    const inst3 = M.instance(town, year); inst3.d[17] += 1;
    ok(near(M.summarize(inst3, core.solveWith(highs, M.buildModel(inst3, null))).objective - S.objective, 0), "correct: +1 MWh at 17:00 adds $0 (spills less)");
  }

  // ---------------- the five suspects
  const sym = {};
  {
    const B = {}; ["unit", "sign", "index", "double", "lunch"].forEach(b => { B[b] = solve(b); sym[b] = M.symptom(b, B[b], S, inst); ok(B[b].ok, `${b}: the buggy model still solves to optimal`); });
    ok(B.unit.balanced && B.unit.rows.every(x => x.pk > 0) && B.unit.trueCost > S.trueCost && B.unit.objective < S.objective, "unit: the peaker runs every hour; reported cost falls, true cost rises");
    ok(near(B.unit.objective, 7836) && near(B.unit.trueCost, 43800), `unit: reports $7,836, really $43,800 (${B.unit.objective}, ${B.unit.trueCost})`);
    ok(!B.sign.balanced && B.sign.rows.every(x => x.supply < x.d) && near(B.sign.objective, 4200), `sign: short every hour, $4,200 (${B.sign.objective})`);
    ok(!B.index.balanced && B.index.rows[0].balanced && B.index.rows.slice(1).every(x => !x.balanced) && near(B.index.objective, 7600), "index: balanced at 17:00 only, $7,600");
    ok(B.double.balanced && near(B.double.objective, 40600) && near(B.double.trueCost, 22800) && B.double.rows.some(x => x.pk > 0), "double: reports $40,600; the plan really costs $22,800 and runs the peaker");
    ok(B.lunch.balanced && B.lunch.overWeather && near(B.lunch.objective, 10720), "lunch: wind above the weather, $10,720");
    ok(sym.unit.indexOf("$7,836") > 0 && sym.unit.indexOf("$43,800") > 0, "symptom text: unit");
    ok(sym.sign.indexOf("$4,200") > 0, "symptom text: sign");
    ok(sym.index.indexOf("$7,600") > 0 && sym.index.indexOf("17:00 balances") > 0, "symptom text: index");
    ok(sym.double.indexOf("$40,600") > 0 && sym.double.indexOf("$22,800") > 0 && sym.double.indexOf("$200 dearer") > 0 && sym.double.indexOf("$22,600") > 0, "symptom text: double: " + sym.double);
    ok(sym.lunch.indexOf("54–89 MW") > 0, "symptom text: lunch: " + sym.lunch);
    J.bugs.forEach(b => ok(J.lines[b.line] && b.html !== J.lines[b.line], `bugs: ${b.key} changes line ${b.line}`));
    ok(new Set(J.bugs.map(b => b.key)).size === 5, "bugs: five distinct planted errors");
    // the table on the page: what each bug looks like to the solver
    ["optimal, with the dearest plant running first", "optimal, with demand unmet in every hour", "optimal, balanced at 17:00 only", "optimal, cost far above a hand calculation", "optimal, wind above what the wind allowed"].forEach(s => has(s));
  }

  // ---------------- counts, units, sums
  {
    const N = M.counts(inst);
    ok(N.balance === 4 && N.size === 20 && N.weather === 8 && N.ramp === 8 && N.must === 4 && N.rows === 44 && N.variables === 24, "counts: 4 + 20 + 8 + 8 + 4 = 44 rows, 24 variables");
    const model = M.buildModel(inst, null);
    ok(model.variables.length === N.variables, "counts: the solver model has 24 variables");
    ok(model.variables.filter(v => v.ub !== undefined && v.ub !== Infinity).length === N.size, "counts: the 20 size rows are bounds in the solver model");
    const rowsInModel = model.constraints.reduce((a, c) => a + (c.lb !== undefined && c.ub !== undefined ? 2 : 1), 0);
    ok(rowsInModel === N.balance + N.weather + N.ramp + N.must, "counts: balance, weather, ramp (two-sided) and must-run rows");
    const U = J.units; ok(U.factors.map(f => f.answer).join(" × ") === "$/MWh × MW × h" && U.result === "$", "units: $/MWh × MW × h = $");
    const k = T.indexOf(19); ok(["nuc", "wind", "solar", "cc", "pk"].reduce((a, g) => a + ref.p[g][k], 0) === inst.d[19] && inst.d[19] === 331, "sums: the 19:00 column adds to 331 MW, the demand");
    ok(ref.p.cc.reduce((a, v) => a + v, 0) === 465, "sums: the cc row adds to 465 MWh");
    ok(JS.indexOf("rows and \" + N.variables") > 0 || JS.indexOf("N.rows") > 0, "js: row count comes from counts()");
    has("120: one row for each plant in each hour, 5 × 24", "the 24-hour count in the quiz");
    ok(5 * 24 === 120, "quiz: 5 × 24 = 120");
  }

  // ---------------- the page
  {
    has("$22,600"); has("75, 115, 145 and 130 MW"); has("$10,000/MWh"); has("45 MW"); has("3 September 2025");
    has("\\$40 + \\$40 = \\$80", "the $80 explanation"); has("spills 10 MW of wind and sun", "the 17:00 spill"); has("\\$0", "the $0 dual");
    has("the cost-optimal paths of a model, under the study's alternative assumptions", "the Trutnevyte wording");
    has("9 to 23%");
    ok(J.vv.filter(v => v.answer === 0).length === 3 && J.vv.length === 6, "vv: three verification, three validation");
    ok(J.blocks.map(b => b.key).join() === "sets,par,vars,obj,cons", "blocks: the reading sequence");
  }

  console.log(`b03-read-check-formulation: ${checks - fails} of ${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
