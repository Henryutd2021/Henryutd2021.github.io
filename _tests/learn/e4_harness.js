// e4_harness.js — shared setup for the tests of engine E4 and its pages (SB4, M13, C4). Not a test itself (the test
// runner runs test_*.js only).
//   load()   the engine, its prepared data (prairieland.json and e4-pathways.json), the solver core with the vendored
//            HiGHS, LX.ShareState's pure part; solveSync(model, opts) and solver (a Promise-returning wrapper for E4.solve)
//   face(model, r, terms, sense, solveSync, slack)   the min or max of a linear expression over the optimal face (every
//            plan whose cost is within slack, default $1M, of the best): the uniqueness check of a reported number
//   libEntry(...) and LIB_DATE: how the precomputed library (data/e4-library.json) is built, shared by the engine's test
//            (which writes it) and the pages' tests (which read it)
//   between, writeBlocks, norm: as in e1_harness.js (re-exported)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const X1 = require("./e1_harness.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const LIB_DATE = "7 November 2026";
async function load() {
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports;
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const E4 = require(L("components/engine-e4.js"));
  const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
  const PL = J("prairieland.json"), cfg = J("e4-pathways.json");
  const P = E4.prepare(PL, cfg);
  const SS = require(L("components/sharestate.js"));
  const solveSync = (m, o) => core.solveWith(highs, m, { timeLimit: (o && o.timeLimit) || 120 });
  const solver = (m, o) => Promise.resolve(solveSync(m, o));
  const S = E4.schema(P);
  return { SITE, L, E4, PL, cfg, P, SS, S, core, highs, solveSync, solver, J };
}
// the optimal face: keep every row, add "economic cost <= best + slack" and optimise a linear expression over it
function face(model, r, terms, sense, solveSync, slack) {
  const cost = model.variables.filter(v => v.cost).map(v => [v.name, v.cost]);
  const m = { sense: sense, variables: model.variables.map(v => Object.assign({}, v, { cost: 0 })), constraints: model.constraints.concat([{ name: "face", terms: cost, ub: r.objective + (slack == null ? 1 : slack) }]) };
  m.objective = { terms: terms };
  const q = solveSync(m);
  return q.status === "optimal" ? q.objective : null;
}
// the library: one entry per plan of the grid (the presets, each with perfect foresight and decade by decade): its view,
// C4's four shocks re-planned, and the full-year checks of 2030 and 2050 in 2025's and 2024's weather
function grid(E4, P, S) {
  const d = E4.defaults(S), out = [];
  E4.presetsOf(P).forEach(pr => ["perfect", "myopic"].forEach(fs => out.push({ preset: pr.id, state: Object.assign(E4.withPreset(d, pr), { fs: fs, sh: "none" }) })));
  // the central plan without the peak-hour rule (M13's full-year step: what the slices alone miss)
  out.push({ preset: "central-norule", state: Object.assign(E4.withPreset(d, E4.presetsOf(P).find(p => p.id === "central")), { fs: "perfect", sh: "none", rm: "off" }) });
  return out;
}
function fullOf(E4, c, R, p, weather) {
  const r = E4.rd;
  return { year: c.year, weather: weather, status: c.status, unservedMWh: r(c.unservedMWh, 0), unservedHours: c.unservedHours, co2: r(c.co2, 1), co2Slices: r(c.co2Slices, 1), gap: r(c.co2Gap, 4),
    curtailTWh: r(c.curtailMWh / 1e6, 1), curtailSlices: r(R.curtailTWh[p], 1), linkHours: c.linkHours.slice(), weekLowMWh: c.weekLow == null ? null : r(c.weekLow, 0), solves: c.solves };
}
async function libEntry(X, g, H25, H24, o) {
  const { E4, P, S, SS, solver } = X;
  const t = await E4.shockTest(g.state, P, { solver, timeLimit: 120 });
  if (!t.ok) throw new Error("library: " + g.preset + " " + g.state.fs + ": " + t.status);
  const V = E4.view(t.results.plan, P), shocks = {};
  E4.c4Shocks(P).forEach(k => { shocks[k] = E4.shockView(t.results.shocks[k], V, P); });
  const full = [];
  if (!o || o.full !== false) {
    const Sx = E4.sysOf(g.state, P), raw = t.results.plan.raw;
    for (const p of P.PL.timeSlices.fullYearCheck.periods.map(y => P.Y.indexOf(y))) for (const [w, H] of [["2025", H25], ["2024", H24]]) {
      const c = await E4.fullYear(P, Sx, raw, p, H, { solver, timeLimit: 120 });
      if (c.status !== "optimal") throw new Error("library full year: " + g.preset + " " + P.Y[p] + " " + w + ": " + c.status);
      full.push(fullOf(E4, c, t.results.plan, p, w));
    }
  }
  return { key: SS.encode(S, Object.assign({}, g.state, { sh: "none" })), preset: g.preset, foresight: g.state.fs, status: "optimal", view: V, shocks: shocks, full: full };
}
function libText(plans) {
  return JSON.stringify({ about: "Engine E4's precomputed library for SB4, M13 and C4 (learn/sb4-pathway-explorer.qmd, m13-national-pathway.qmd, c4-prairieland-2050.qmd): every preset with perfect foresight and decade by decade, and the central plan without the peak-hour rule, solved with E4 itself on " + LIB_DATE +
    " (each LP optimal, at most 120 s a solve), its view (every number a page shows), C4's four shocks re-planned, and the full-year checks of 2030 and 2050 in 2025's and 2024's weather (52 weeks and 31 December, an LP each). Phones read it instead of loading the solver; the full-year checks are too slow for a click. Written by node _tests/learn/test_e4-engine.js --write; checked byte for byte (--library: every entry).",
    date: LIB_DATE, timeLimit: 120, plans: plans });
}
// the dated correction line of SB4, M13 and C4 (7 Nov 2026), from the library: the existing fleet's upkeep is the same in
// every entry; the central pathway's cost with it and without it (the cost before the correction)
// (every library entry has the default discount rate, so one upkeep; another rate gives another, the same for every pathway)
function correction(E4, LIB, PL) {
  const ups = LIB.plans.map(e => e.view.pv.upkeep), V = LIB.plans.find(e => e.preset === "central" && e.foresight === "perfect").view;
  if (ups.some(u => u !== ups[0])) throw new Error("correction: the upkeep differs between entries");
  return { text: "Corrected 7 Nov 2026: costs now include the existing wind, solar and batteries' fixed O&M, the same in every pathway at one discount rate (" + E4.bn(ups[0]) + " at " + PL.periods.discount.def + "%; central: " + E4.bn(V.pv.total) + ", was " + E4.bn(V.pv.total - V.pv.upkeep) +
    "). The full-year check buys gas in the slice run's own mix.", upkeep: ups[0], now: V.pv.total, was: V.pv.total - V.pv.upkeep };
}
module.exports = { SITE, L, LIB_DATE, load, face, grid, libEntry, libText, fullOf, correction, between: X1.between, writeBlocks: X1.writeBlocks, norm: X1.norm };
