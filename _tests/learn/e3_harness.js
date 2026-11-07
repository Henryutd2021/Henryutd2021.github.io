// e3_harness.js — shared setup for the tests of engine E3 and its pages (SB3, M12, C3), wave W5, 2026-11-06. Not a test
// itself (learn_qa.sh runs test_*.js only).
//   load()   the engine, its prepared data (prairie-city.json and e3-city-hub.json), the solver core with the vendored
//            HiGHS, LX.ShareState's pure part; solveSync(model, opts) and solver (a Promise-returning wrapper for E3.solve)
//   face(model, r, terms, sense)   the min or max of a linear expression over the optimal face (every plan whose cost is
//            within $1 of the best): the uniqueness check of a reported number (W2 review finding 2)
//   between, writeBlocks, norm, excerpts, register, portfolio: as in e1_harness.js (re-exported)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const X1 = require("./e1_harness.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
async function load() {
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports;
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const E3 = require(L("components/engine-e3.js"));
  const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
  const city = J("prairie-city.json"), cfg = J("e3-city-hub.json");
  const P = E3.prepare(city, cfg);
  const SS = require(L("components/sharestate.js"));
  const solveSync = (m, o) => core.solveWith(highs, m, { timeLimit: (o && o.timeLimit) || 60 });
  const solver = (m, o) => Promise.resolve(solveSync(m, o));
  return { SITE, L, E3, city, cfg, P, SS, core, highs, solveSync, solver, J };
}
// the optimal face: keep every row, add "cost <= best + slack" and optimise a linear expression over it
function face(model, r, terms, sense, solveSync, slack) {
  const cost = model.variables.filter(v => v.cost).map(v => [v.name, v.cost]);
  const m = { sense: sense, variables: model.variables.map(v => Object.assign({}, v, { cost: 0 })), constraints: model.constraints.concat([{ name: "face", terms: cost, ub: r.objective + (slack == null ? 1 : slack) }]) };
  m.objective = { terms: terms };
  const q = solveSync(m);
  return q.status === "optimal" ? q.objective : null;
}
module.exports = { SITE, L, load, face, between: X1.between, writeBlocks: X1.writeBlocks, norm: X1.norm, excerpts: X1.excerpts, register: X1.register, portfolio: X1.portfolio };
