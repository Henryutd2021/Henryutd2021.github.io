// test_sb3-city-planner.js — Node tests for SB3, the City Planner (learn/sb3-city-planner.qmd,
// assets/learn/sb3-city-planner.js), on engine E3 (its own tests: test_e3-engine.js). What it checks:
//   - the no-JS blocks: the bench's table is LX.ShareState.staticHTML of the plan's defaults; the results table is the
//     engine's precomputed run of 2025 as it is and of the "Electrify heat and cars" preset (data file,
//     `precomputed.sb3`), equal to fresh runs; the inputs table is E3.inputsHTML
//   - every number the page states (the brief, the tie rule) against prairie-city.json, e3-city-hub.json and the engine
//   - the run's words (says): true for every preset and for each "who adopts first" rule, never more than the run shows
//     (an upgrade line only with an upgrade, "stays within" only at or under the limit, the substation's value equal to
//     its summed duals); the busiest hour picked for the chart is the run's highest share of a limit
//   - the page frame: the sandbox sections, scripts, data-src, the engine in the bundle; the fictional line; the household
//     table said to be a screening estimate from an accounting layer, not the LP; no nuclear term; no AI wording
// --write: recomputes `precomputed.sb3` in e3-city-hub.json and writes the marker blocks.
// Usage (from the site folder):  node _tests/learn/test_sb3-city-planner.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e3_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const QPATH = path.join(X.SITE, "learn/sb3-city-planner.qmd"), DPATH = X.L("data/e3-city-hub.json");
const RUN_DATE = "6 November 2026";
function rowsOf(E3, R, tag) {
  const pg = require(X.L("sb3-city-planner.js"));
  return [[tag + ": yearly cost against 2025 (2025 dollars; equipment and upgrades as yearly payments)", pg.mil(R.delta.cost)],
    [tag + ": CO₂ of the three districts' buildings and cars", E3.kilo(R.acc.co2Hub) + " t a year"],
    [tag + ": busiest hour against the limit, core · suburbs · fringe", R.dist.map(d => E3.kilo(d.peak) + "/" + E3.kilo(d.limit)).join(" · ") + " MW"],
    [tag + ": substation upgrades bought", E3.kilo(R.dist.reduce((s, d) => s + d.upg, 0)) + " MW"],
    [tag + ": energy burden, homes below 80% of area median income (screening estimate)", pg.pct1(R.hh.low.burden)]];
}

(async () => {
  const { E3, city, cfg, P, SS, solver, L } = await X.load();
  const PG = require(L("sb3-city-planner.js"));
  const S = E3.sb3Schema(cfg), def = SS.defaults(S), el = E3.withPreset(def, E3.presets.filter(p => p.id === "electrify")[0]);
  const r0 = await E3.solve(def, P, { solver }), r1 = await E3.solve(el, P, { solver });
  ok(r0.ok && r1.ok, "2025 as it is and the electrify preset run optimal");
  const pre = { head: "Result: 2025 as it is, then \"Electrify heat and cars\" (80% of furnaces and resistance heat to heat pumps, half the cars electric)",
    rows: rowsOf(E3, r0.results, "2025 as it is").concat(rowsOf(E3, r1.results, "Electrify heat and cars")),
    note: "Precomputed with HiGHS on " + RUN_DATE + ": the hub as a linear program over eight representative days. Prairie City is fictional; its numbers are illustrative. With JavaScript on, the bench runs your own plan." };
  const withPre = Object.assign({}, P, { cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { sb3: pre }) }) });
  const BLOCKS = { "sb3-bench": () => SS.staticHTML(S, def), "sb3-results": () => E3.fallback(withPre, "sb3"), "sb3-inputs": () => E3.inputsHTML(P) };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { sb3: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    X.writeBlocks(QPATH, { "sb3-bench": BLOCKS["sb3-bench"](), "sb3-results": BLOCKS["sb3-results"](), "sb3-inputs": BLOCKS["sb3-inputs"]() });
    console.log("wrote precomputed.sb3 and the sb3-bench, sb3-results and sb3-inputs blocks");
  }
  const PAGE = fs.readFileSync(QPATH, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
  ok(JSON.stringify(D.precomputed && D.precomputed.sb3) === JSON.stringify(pre), "the data file's precomputed runs equal fresh runs (run with --write after a change)");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
  const T = X.norm(PAGE), JS = fs.readFileSync(L("sb3-city-planner.js"), "utf8");
  const has = (s, why) => ok(T.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (why ? " (" + why + ")" : ""));

  // ---------------- the page's numbers
  has(E3.kilo(city.city.people) + " people"); has("one substation");
  has("Prairie City is fictional; its numbers are illustrative.");
  ok(PAGE.split(city.about.line).length >= 3, "the fictional line in the brief and the bench's fallback");
  const tie = cfg.tie;
  has("$" + tie.peak + " a year per MW of each district's busiest hour, and $" + tie.cityPeak + " per MW of the three districts' busiest hour together");
  has("$" + tie.wear + " per MWh out of a battery and $" + tie.storeWear.toFixed(2) + " per MWh out of the heat store");
  has("$" + tie.ev.toFixed(2) + " per MWh of managed charging");
  has("×2 and ×0.1"); ok(/\[2, 0\.1\]/.test(fs.readFileSync(path.join(X.SITE, "_tests/learn/test_e3-engine.js"), "utf8")), "the engine test runs the ties x2 and x0.1, as the page says");
  has("paid yearly at 4% real over each item's life"); ok(cfg.finance.rate === 0.04, "4% real");
  has("eGRID's 2023 SPP North CO₂ rate"); ok(city.emissions.gridLbPerMWh.year === 2023, "eGRID 2023");

  // ---------------- the run's words, for every preset and rule
  const plans = E3.presets.map(p => E3.withPreset(def, p)).concat(["low", "high"].map(rule => Object.assign(E3.withPreset(def, E3.presets[2]), { rule })))
    .concat([Object.assign(E3.withPreset(def, E3.presets[3]), { up: "yes", upc: 2000 })]);
  for (const st of plans) {
    const r = await E3.solve(st, P, { solver });
    ok(r.ok, JSON.stringify(st).slice(0, 60) + ": optimal");
    if (!r.ok) continue;
    const R = r.results, says = PG.says(R);
    ok(says.length === R.dist.length + 3, "one line per district, then CO2, cost and burden");
    R.dist.forEach((d, i) => {
      const t = says[i].text;
      if (/buys/.test(t)) ok(d.upg > 0.05 && d.peak > d.limit, d.key + ": an upgrade line only with an upgrade");
      if (/stays within/.test(t)) ok(d.peak <= d.limit + 1e-6 && d.upg < 0.05, d.key + ": stays within only at or under its limit");
      if (/reaches its limit/.test(t)) { ok(Math.abs(d.peak - d.limit) < 0.5 && d.upg < 0.05, d.key + ": reaches its limit"); ok(t.indexOf("$" + E3.kilo(d.value)) >= 0, "its value is the summed duals"); }
      ok(t.indexOf(E3.kilo(d.peak) + (d.upg > 0.05 ? " MW in its busiest hour" : "")) >= 0, d.key + ": the busiest hour as run");
    });
    const co2 = says[R.dist.length].text;
    if (Math.abs(R.delta.co2) < 0.5) ok(/as in 2025/.test(co2) && co2.indexOf(E3.kilo(R.acc.co2Hub)) >= 0, "the CO2 line as run (no change)");
    else ok(co2.indexOf(E3.kilo(Math.abs(R.delta.co2)) + " t a year") >= 0 && (R.delta.co2 < 0 ? /down/.test(co2) : /up/.test(co2)), "the CO2 line as run");
    const cost = says[R.dist.length + 1].text, M = R.acc.money, M0 = R.base.acc.money;
    ok(cost.indexOf(PG.mil(Math.abs(R.delta.cost))) >= 0 && cost.indexOf(PG.mil(Math.abs(M.cars - M0.cars))) >= 0, "the cost line splits the cars' fuel and charging from the rest");
    ok(says[R.dist.length + 2].text.indexOf(PG.pct1(R.hh.low.burden)) >= 0 && /screening estimate from the accounting layer, not from the LP/.test(says[R.dist.length + 2].text), "the burden line is labelled a screening estimate, not from the LP");
    const pk = PG.pick(R), ratio = R.dist.map(d => d.peak / d.limit);
    ok(ratio[pk.d] === Math.max(...ratio) && R.raw.days[pk.k].d[pk.d].imp.some(v => Math.abs(v - R.dist[pk.d].peak) < 1e-6), "the chart opens on the busiest hour against its limit");
  }

  // ---------------- the page frame
  ["brief", "bench", "results", "explain", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  ok(/data-learn="sb3"/.test(PAGE) && /prairie-city\.json/.test(PAGE) && /e3-city-hub\.json/.test(PAGE), "the interactive loads prairie-city.json and e3-city-hub.json");
  ok(/sb3-city-planner\.js/.test(PAGE) && /learn\.js/.test(PAGE), "scripts");
  const BUNDLE = fs.readFileSync(L("learn.js"), "utf8");
  ok(BUNDLE.indexOf("window.LX.E3 = E3") >= 0, "engine E3 is in the bundle (scripts/build_learn.py's W5_ENGINES)");
  ok(/not from the LP|not an output of the LP/.test(JS + PAGE), "the household table is said not to come from the LP");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(PAGE + JS), "no nuclear term on the page or in its script (guard G-DC)");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS), "no AI wording");

  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (SB3)");
  process.exit(fails ? 1 : 0);
})();
