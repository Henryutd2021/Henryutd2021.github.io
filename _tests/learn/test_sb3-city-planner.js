// test_sb3-city-planner.js — Node tests for SB3, the City Planner (learn/sb3-city-planner.qmd,
// assets/learn/sb3-city-planner.js), on engine E3 (its own tests: test_e3-engine.js). What it checks:
//   - the no-JS blocks: the bench's table is LX.ShareState.staticHTML of the plan's defaults; the results table is the
//     engine's precomputed run of 2025 as it is and of the "Electrify heat and cars" preset (data file,
//     `precomputed.sb3`), equal to fresh runs; the inputs table is E3.inputsHTML
//   - every number the page states (the brief, the tie rule) against prairie-city.json, e3-city-hub.json and the engine
//   - the run's words (says): true for every preset and for each "who adopts first" rule, never more than the run shows
//     (an upgrade line only with an upgrade, "stays within" only at or under the limit, the substation's value equal to
//     its summed duals); the busiest hour picked for the chart is the run's highest share of a limit
//   - the full-year check (data/e3-full-year.json, rebuilt by test_e3-full-year.js): the no-JS table of "Electrify heat
//     and cars" from the data file; the explain layer's sentence true of every preset's check; the card for the plan
//     that ran, none for another plan, and never a full-year solve on the page
//   - the page frame: the sandbox sections, scripts, data-src, the engine in the bundle; the fictional line; the household
//     table said to be a screening estimate from an accounting layer, not the LP; no nuclear term; no AI wording
// --write: recomputes `precomputed.sb3` in e3-city-hub.json and writes the marker blocks (sb3-full from e3-full-year.json).
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
  const FY = JSON.parse(fs.readFileSync(L("data/e3-full-year.json"), "utf8")), FYc = city.fullYear, fel = E3.fullById(FY, "sb3", "electrify");
  const fullHTML = () => E3.tableHTML(["Full-year check of \"Electrify heat and cars\"", "Eight days", "Full year", "Gap"], E3.fullRows(fel, P), "e3-fullt", [null, "n", "n", "n"]) +
    '<p class="lx-hint">Precomputed with HiGHS on ' + FY.date + ": the preset run again on all 8,760 hours of 2025, with the shares and substation upgrades its eight days chose kept. With JavaScript on, each preset shows its own check.</p>";
  const BLOCKS = { "sb3-bench": () => SS.staticHTML(S, def), "sb3-results": () => E3.fallback(withPre, "sb3"), "sb3-full": fullHTML, "sb3-inputs": () => E3.inputsHTML(P) };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { sb3: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    X.writeBlocks(QPATH, { "sb3-bench": BLOCKS["sb3-bench"](), "sb3-results": BLOCKS["sb3-results"](), "sb3-full": BLOCKS["sb3-full"](), "sb3-inputs": BLOCKS["sb3-inputs"]() });
    console.log("wrote precomputed.sb3 and the sb3-bench, sb3-results, sb3-full and sb3-inputs blocks");
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
  has("under $30 a year in the engine's test"); ok(/gap < 30/.test(fs.readFileSync(path.join(X.SITE, "_tests/learn/test_e3-engine.js"), "utf8")), "the tie rule's economic price: under $30 a year, as the engine test checks (SB3 review finding 4)");
  // the review's other fixes, where the reader sees them
  ok(/Siting with map layers is in the capstone <a href="c3-prairie-city-2040\.html">C3<\/a>/.test(PAGE), "the brief says where siting with map layers is (C3, on this engine; SB3 review finding 6, to the coordinator)");
  ok(/assumed to exist already \(its fuel counts, not its construction\)/.test(JS) && /plugged in at home or work when needed/.test(JS), "beside the controls: the existing boiler and the managed-charging assumption (SB3 review findings 7, 8)");
  ok(/"Hours a year at the limit"/.test(JS) && !/Hours it binds/.test(JS), "the substation table counts hours a year at the limit, weighted (SB3 review finding 3)");
  ok(/eight representative days, weighted to 365: an estimate/.test(JS) && /representative-day estimates/.test(JS) && /synthetic weather/.test(JS) && !/people, homes and weather/.test(JS), "the boundary: representative-day estimates and synthetic weather (SB3 review finding 5)");
  // ---------------- the full-year check
  const sbF = FY.plans.filter(e => e.page === "sb3"), FEB = FYc.designDays.filter(d => d !== city.days.find(x => x.design).date), up = V => V.dist.reduce((t, d) => t + d.upg, 0);
  ok(sbF.map(e => e.id).join() === E3.presets.map(p => p.id).join() && sbF.every(e => e.key === SS.encode(S, E3.withPreset(def, E3.presets.find(p => p.id === e.id)))), "a check for every preset, keyed by its plan link");
  ok(sbF.every(e => Math.abs(e.year.cost / e.days.cost - 1) < 0.001 && Math.abs(e.year.co2 / e.days.co2 - 1) < 0.001), "the explain layer: every preset's cost and CO2 within 0.1% on the year");
  ok(sbF.every(e => e.year.shortDays.every(x => FEB.includes(x.day)) && (up(e.days) < 0.5 ? e.year.dist.every(d => d.at && FEB.includes(d.at.day)) : e.year.shortDays.length > 0 && up(e.year) > up(e.days) + 0.5)) && FEB.join() === "2025-02-19,2025-02-20",
    "the explain layer: the tightest hours fall on 19 and 20 February; every preset that buys upgrades needs more on the year (" + sbF.map(e => up(e.days).toFixed(1) + "→" + up(e.year).toFixed(1)).join(", ") + " MW)");
  has("cost and CO₂ within 0.1%"); has("The tightest hours fall on 19 and 20 February, two other days the design day stands for; plans that buy upgrades need a little more room.");
  ok(/U\.fullCard\(res, E3\.fullFind\(FY, "sb3", S, R\.state, LX\.ShareState\)/.test(JS) && !/fullYear\s*\(/.test(JS) && /data\/e3-full-year\.json/.test(PAGE), "the card shows the check of the plan that ran (none for another plan); the page reads the data file and never solves the year");
  ok(E3.fullFind(FY, "sb3", S, def, SS) === sbF[0] && E3.fullFind(FY, "sb3", S, Object.assign({}, def, { pv: 10 }), SS) === null, "the default plan has its check; a plan off the presets has none");
  ok(/data-term="substation"/.test(PAGE) && /data-term="electric-vehicle">electric cars \(EVs\)/.test(PAGE) && /linear program \(LP\)/.test(PAGE) && /data-term="energy-burden"/.test(PAGE) && /area median income \(AMI\)/.test(PAGE) && /\[\[linearized-feeder-limit\|/.test(JS), "terms glossed or expanded at first use (SB3 review finding 10)");
  ok(/U\.keys\(c1, \[\["Read the lines"/.test(JS) && /\["The value"/.test(JS) && /\["Its assumptions"/.test(JS), "the chart and dual explanations split into labelled lines (SB3 review finding 11)");
  ok(/energycodes|bto-cchp-tech-challenge-spec-102521\.pdf/.test(PAGE), "the DOE specification is in the sources, dated (SB3 review finding 9)");
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
  ok(/data-learn="sb3"/.test(PAGE) && /prairie-city\.json/.test(PAGE) && /e3-city-hub\.json/.test(PAGE) && /e3-full-year\.json/.test(PAGE), "the interactive loads prairie-city.json, e3-city-hub.json and e3-full-year.json");
  ok(/sb3-city-planner\.js/.test(PAGE) && /learn\.js/.test(PAGE), "scripts");
  const BUNDLE = fs.readFileSync(L("learn.js"), "utf8");
  ok(BUNDLE.indexOf("window.LX.E3 = E3") >= 0, "engine E3 is in the bundle (scripts/build_learn.py's W5_ENGINES)");
  ok(/not from the LP|not an output of the LP/.test(JS + PAGE), "the household table is said not to come from the LP");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(PAGE + JS), "no nuclear term on the page or in its script (guard G-DC)");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS), "no AI wording");

  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (SB3)");
  process.exit(fails ? 1 : 0);
})();
