// e2_harness.js — shared setup for the tests of engine E2 and its pages (SB2, C2), wave W4, 2026-11-05. Not a test itself
// (learn_qa.sh runs test_*.js only).
//   load()        the engine, its prepared data (2025 and 2024), the solver core with the vendored HiGHS, LX.ShareState's
//                 pure part; solveSync(model, opts) and solver (a Promise-returning wrapper for E2.solve)
//   between, writeBlocks, norm, excerpts, register, portfolio: as in e1_harness.js (re-exported)
//   fullYear(E2, P, state, solveSync, year)   the plan's whole year, day by day in order (each day a MILP, then the
//                 dispatch LP with the commitment fixed; the state of 23:00 carried), for the check of the representative
//                 days (§9.3): { days, tot (summed), avgPrice, ... } as E2.summarize gives them
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
  const E2 = require(L("components/engine-e2.js"));
  const PR = require(L("components/profiles.js"));
  const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
  const cfg = J("e2-plains-grid.json");
  const D = { y2025: J("town_year.json"), y2024: J("m03-capacity-expansion-2024.json"), targets: J("cf_targets.json") };
  const P = E2.prepare(cfg, D, PR.townProfile);
  const SS = require(L("components/sharestate.js"));
  const solveSync = (m, o) => core.solveWith(highs, m, { timeLimit: (o && o.timeLimit) || 60, gap: o && o.gap });
  const solver = (m, o) => Promise.resolve(solveSync(m, o));
  return { SITE, L, E2, cfg, D, P, PR, SS, core, highs, solveSync, solver, J };
}
// the whole year in order: one plan's 365 days
function fullYear(E2, P, st, solveSync, year) {
  const sys = E2.sysOf(st, P), days = [], y = String(year || 2025);
  let carry = null;
  for (let d = 0; d < 365; d++) {
    const rm = solveSync(E2.dayModel(P, sys, y, d, carry), { gap: 1e-6 });
    if (!rm.values) throw new Error("fullYear: day " + d + " " + rm.status);
    const com = E2.commitment(P, sys, rm), rl = solveSync(E2.dayModel(P, sys, y, d, carry, { fix: com }));
    const rd = E2.readDay(P, sys, y, d, com, rl); rd.spec = { y, day: d, carry: d > 0, weight: 1 }; rd.com = com; rd.milp = { status: rm.status };
    days.push(rd); carry = E2.carry(P, sys, com);
  }
  return E2.summarize(st, P, { task: "full", sys, days });
}
module.exports = { SITE, L, load, fullYear, between: X1.between, writeBlocks: X1.writeBlocks, norm: X1.norm, excerpts: X1.excerpts, register: X1.register, portfolio: X1.portfolio };
