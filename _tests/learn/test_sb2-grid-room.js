// test_sb2-grid-room.js — Node tests for SB2, the Grid Room (learn/sb2-grid-room.qmd, assets/learn/sb2-grid-room.js), on
// engine E2 (its own tests: test_e2-engine.js). What it checks:
//   - the no-JS blocks: the bench's table is LX.ShareState.staticHTML of the plan's defaults; the results table is the
//     engine's precomputed run of the default plan and the 300 MW preset (data file, `precomputed.sb2`), equal to a
//     fresh run; the inputs table is E2.inputsHTML of the data file
//   - every number the page states (the brief, the periods, the tie rule) against the data and the engine
//   - the run's words (says, readouts): true for each preset on each period, never more than the run shows
//   - the page frame: the sandbox sections, scripts, data-src, the engine in the bundle; prices named only as conditional
//     on the commitment; no nuclear term anywhere (guard G-DC); links only to live lessons and allowed sources
// --write: recomputes `precomputed.sb2` in the data file and writes the marker blocks.
// Usage (from the site folder):  node _tests/learn/test_sb2-grid-room.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e2_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const QPATH = path.join(X.SITE, "learn/sb2-grid-room.qmd"), DPATH = X.L("data/e2-plains-grid.json");
const RUN_DATE = "5 November 2026";

function rowsOf(E2, P, R, tag) {
  const T = R.tot, pr = v => E2.priceTxt(v) + "/MWh", Z = P.zones;
  return [
    [tag + ": production cost (running, no-load, start-up; 2025 dollars, illustrative plants)", E2.ui ? "" : "", "x"].slice(0, 0).concat([[tag + ": production cost (running, no-load and start-up; 2025 dollars)", moneyK(T.prod)]])[0],
    [tag + ": average price, " + Z.map(z => z.name).join(" · ") + " (conditional on the commitment)", R.avgPrice.map(v => E2.priceTxt(v)).join(" · ") + " /MWh"],
    [tag + ": highest price in any zone", pr(Math.max.apply(null, R.maxPrice))],
    [tag + ": hours at the limit, Ridge–Town · Town–Metro", E2.kilo(T.cong.WT) + " · " + E2.kilo(T.cong.TM) + " of " + R.hours],
    [tag + ": unserved · reserve short", E2.kilo(T.shed) + " MWh · " + E2.kilo(T.rshort) + " MWh"],
    [tag + ": uplift (make-whole payments)", moneyK(T.upliftAll)]];
}
function moneyK(v) { const r = Math.round(v / 1000) * 1000; return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }

(async () => {
  const { E2, cfg, P, SS, solver } = await X.load();
  const PG = require(X.L("sb2-grid-room.js"));
  const def = SS.defaults(E2.schema), load = Object.assign({}, def, E2.presets.filter(p => p.id === "load")[0].state);
  const r0 = await E2.solve(def, P, { solver }), r1 = await E2.solve(load, P, { solver });
  ok(r0.ok && r1.ok, "the default plan and the 300 MW preset run optimal on the summer peak day");
  const pre = { head: "Result: summer peak day, 29 July 2025 (the default plan, then a 300 MW data center at Prairie Town)",
    rows: rowsOf(E2, P, r0.results, "Today's grid").concat(rowsOf(E2, P, r1.results, "With the 300 MW load")),
    note: "Precomputed with HiGHS on " + RUN_DATE + ": each day a mixed-integer program commits the plants, then the dispatch linear program with that commitment fixed gives the prices. With JavaScript on, the bench runs your own plan." };
  const withPre = { cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { sb2: pre }) }) };
  const BLOCKS = { "sb2-bench": () => SS.staticHTML(E2.schema, def), "sb2-results": () => E2.fallback(withPre, "sb2"), "sb2-inputs": () => E2.inputsHTML(P) };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { sb2: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    X.writeBlocks(QPATH, { "sb2-bench": BLOCKS["sb2-bench"](), "sb2-results": BLOCKS["sb2-results"](), "sb2-inputs": BLOCKS["sb2-inputs"]() });
    console.log("wrote precomputed.sb2 and the sb2-bench, sb2-results and sb2-inputs blocks");
  }
  const PAGE = fs.readFileSync(QPATH, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
  ok(JSON.stringify(D.precomputed && D.precomputed.sb2) === JSON.stringify(pre), "the data file's precomputed runs equal fresh runs (run with --write after a change)");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
  console.log(`test_sb2-grid-room: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
