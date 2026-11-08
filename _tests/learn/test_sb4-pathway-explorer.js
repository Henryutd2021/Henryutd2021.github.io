// test_sb4-pathway-explorer.js — Node tests for SB4, the Pathway Explorer (learn/sb4-pathway-explorer.qmd,
// assets/learn/sb4-pathway-explorer.js), on engine E4 (its own tests, and the library's: test_e4-engine.js). What it checks:
//   - the no-JS blocks: the people (prairieland.json), the bench's table (LX.ShareState.staticHTML of the defaults), the
//     results (E4.fallbackHTML of the library's default plan, with the library's date), the inputs (E4.inputsHTML)
//   - every number the page states (the tie rule, the penalties, the near-tie sentence) against e4-pathways.json and the
//     engine
//   - the run's words (says), for every library entry and each of its shocks: true and never more than the run shows (the
//     budget "binds" only when the cumulative CO2 is at the budget; "out of reach" only with an overshoot; imports above
//     the cap only with an overshoot; Ridge Station's line as run); the full-year verdict is prairieland.json's rule
//   - the library on the page: only the first view is drawn from it (when the plan on load is a library entry's, shock set
//     aside), labelled "precomputed with this engine on <date>"; every run the reader starts solves live; the full-year
//     checks stay precomputed
//   - the cost: its parts (the existing wind, solar and batteries' upkeep a row of its own), the boundary with what is
//     left out, the retirement convention, and the dated correction line against the library
//   - the details: the penalty table; the default-plan near-tie check named as such; the budget gap with A20
//     (the engine's sentences, its floor); the shock table is the engine's; a plan without the peak-hour rule is "not
//     tested"; full-year checks follow the plan's key whether drawn from the library or solved live; units and terms
//   - the page frame: the sandbox sections, scripts, data-src, the engine in the bundle; the fictional line; costs said to
//     leave out end-use equipment; the firm option never named nuclear; no editorial guard code shown; no AI wording
// --write: writes the marker blocks.
// Usage (from the site folder):  node _tests/learn/test_sb4-pathway-explorer.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e4_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const QPATH = path.join(X.SITE, "learn/sb4-pathway-explorer.qmd");

(async () => {
  const { E4, PL, cfg, P, SS, S, L, solver } = await X.load();
  const PG = require(L("sb4-pathway-explorer.js"));
  const LIB = JSON.parse(fs.readFileSync(L("data/e4-library.json"), "utf8")), def = SS.defaults(S);
  const e0 = PG.libEntry(LIB, SS, S, def);
  ok(e0 && e0.preset === "central" && e0.foresight === "perfect", "the default plan is a library entry (central, perfect foresight)");
  ok(PL.nation.people === 20e6, "20 million people (prairieland.json)");
  const BLOCKS = { "sb4-bench": () => SS.staticHTML(S, def),
    "sb4-results": () => E4.fallbackHTML(e0.view, P, { date: LIB.date, label: "the default plan (" + cfg.presets.find(p => p.id === "central").label + ")" }), "sb4-inputs": () => E4.inputsHTML(P) };
  if (process.argv.includes("--write")) { const b = {}; Object.keys(BLOCKS).forEach(k => { b[k] = BLOCKS[k](); }); X.writeBlocks(QPATH, b); console.log("wrote the sb4 blocks"); }
  const PAGE = fs.readFileSync(QPATH, "utf8"), T = X.norm(PAGE), JS = fs.readFileSync(L("sb4-pathway-explorer.js"), "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
  const has = (s, why) => ok(T.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (why ? " (" + why + ")" : ""));

  // ---------------- the page's numbers
  has("20 million people in five regions"); ok(PL.regions.length === 5 && PL.transmission.links.length === 7, "five regions, seven links"); has("joined by seven links");
  has("2030, 2035, 2040, 2045 and 2050"); ok(PL.periods.years.join() === "2030,2035,2040,2045,2050", "the model years");
  has("twelve time slices of 2025's weather"); ok(PL.timeSlices.count === 12 && PL.timeSlices.weatherYear === 2025, "twelve slices of 2025");
  const tie = cfg.tie, pen = cfg.penalties;
  has("$" + tie.flowPerMWh.toFixed(2) + " per MWh carried on any link"); has("$" + tie.batteryPerMWh.toFixed(2) + " per MWh out of a battery"); has("$" + tie.importPremiumPerGJ.toFixed(2) + " per GJ more for imported crude");
  has("Electricity not servedMWh$" + E4.kilo(pen.unservedPerMWh)); has("Short at a stress hourMW for a year$" + E4.kilo(pen.reservePerMWYear)); has("CO₂ over the budgettonne$" + E4.kilo(pen.budgetPerT)); has("Imports over the capGJ$" + E4.kilo(pen.importPerGJ), "the penalty table");
  has("plans within $1,000 of its best cost build the same national wind, solar, gas and firm capacity in 2030, 2040 and 2050, within 10 MW (the engine's test)");
  has("The tie rule picks one answer; it does not make it the only one.");
  ok(/\["wind", "solar", "gasCC", "gasCT", "firm"\]\.forEach\(t => \[0, 2, 4\]/.test(fs.readFileSync(path.join(X.SITE, "_tests/learn/test_e4-engine.js"), "utf8")), "the engine test's face check covers exactly those technologies and years (2030, 2040, 2050)");
  ok(/X\.face\(m, r, t, "min", solveSync, 0\.001\)/.test(fs.readFileSync(path.join(X.SITE, "_tests/learn/test_e4-engine.js"), "utf8")), "the engine test checks the face at $1,000 (0.001 $M) with 10 MW, as the page says");
  has("a plan that electrifies more looks cheaper here than it would be");
  has("Prairieland is fictional; its numbers are illustrative.");
  ok(PAGE.split(PL.about.line).length >= 3 && JS.indexOf("P.line") >= 0, "the fictional line in the brief, the bench's fallback and the live results");

  // ---------------- the run's words, for every library entry and its shocks
  for (const e of LIB.plans) {
    const V = e.view, tag = e.preset + "/" + e.foresight;
    const shocks = [null].concat(Object.keys(e.shocks).map(k => e.shocks[k]));
    for (const Xs of shocks) {
      const s = PG.says(V, Xs, P), t = s.map(x => x.text).join(" ");
      if (V.over > 0.5) ok(/out of reach/.test(s[0].text) && s[0].text.indexOf(E4.kilo(V.cum) + " Mt") >= 0, tag + ": out of reach only with an overshoot, its CO2 as run");
      else { ok(/within the|below the budget|at the budget/.test(s[0].text) && V.cum <= V.budget + 0.5, tag + ": within the budget"); if (/The budget binds/.test(s[0].text)) ok(Math.abs(V.cum - V.budget) <= 1, tag + ": the budget binds only when CO2 is at the budget (" + V.cum + ")"); else if (/does not bind/.test(s[0].text)) ok(V.cum < V.budget, tag + ": the budget does not bind below it");
        if (V.carbonValue.length > 1) ok(/Decade by decade/.test(s[0].text) && (V.windowReach.every(Boolean) ? (V.carbonValue[0] > 0.05) === /2030–2035 window's share binds/.test(s[0].text) : /cannot meet its share/.test(s[0].text)), tag + ": decade by decade, the windows' shares as run");
        if (V.carbonValue.length === 1 && V.carbonValue[0] === null) ok(/not a marginal value/.test(s[0].text), tag + ": a missed limit gives no dual"); }
      ok((V.rule === null) === /not tested/.test(t), tag + ": the peak-hour rule off is 'not tested', and only then");
      const capOver = V.capOver.reduce((a, b) => a + b, 0);
      ok(/Imports above the cap/.test(s[1].text) === capOver > 0.5, tag + ": imports above the cap only with an overshoot");
      ok(t.indexOf("wind " + PG.fix(V.built.wind.reduce((a, b) => a + b, 0), 1) + " GW") >= 0, tag + ": built wind as run");
      const rl = s.find(x => /Ridge Station/.test(x.text)).text;
      if (V.ridge.closeP === null) ok(/stays open/.test(rl), tag + ": Ridge Station open"); else if (/on its schedule/.test(rl)) ok(V.ridge.closeP === 2 && V.ridge.station[1] > 0, tag + ": on its schedule (end of 2037: gone in the 2040 model year)"); else ok(V.ridge.closeP < 2, tag + ": closes early");
      if (Xs) { const l = s[s.length - 1].text; ok(l.indexOf(Xs.label) >= 0 && l.indexOf("$" + PG.fix(Math.abs(Xs.dPV) / 1000, 1) + " billion " + (Xs.dPV >= 0 ? "more" : "less")) >= 0, tag + " " + Xs.key + ": the shock line as run"); }
    }
    // the full-year verdict: prairieland.json's rule (all demand served, CO2 within 10%)
    PG.fullRows(e.full, E4).forEach((row, i) => { const c = e.full[i], want = c.unservedMWh < 0.5 && Math.abs(c.gap) <= 0.1; ok((row[4] === "survives") === want && (want || /\(/.test(row[4])), tag + " " + c.year + " " + c.weather + ": verdict " + row[4]); });
  }
  ok(/survives if it holds in both years: all demand served, CO2 within 10%/.test(PL.timeSlices.fullYearCheck.survives), "the page's verdict follows prairieland.json's survives rule");

  // ---------------- what "out of reach" proves: only the budget missed, no plan within the cap emits less; both missed,
  // the least combined overshoot (weighed as their penalties), never "emits less" (a cap of 10% and 2,600 Mt misses both)
  {
    const both = Object.assign({}, def, { cap: 10, bud: 2600 }), Vb = E4.view((await E4.solve(both, P, { solver, timeLimit: 120 })).results.plan, P), sb = PG.says(Vb, null, P).map(x => x.text).join(" ");
    ok(Vb.over > 0.5 && Vb.capOver.some(x => x > 0.5) && /least combined overshoot \(a tonne over the budget weighed as 10 GJ over the cap\)/.test(sb) && !/emits less|imports less/.test(sb), "both limits missed (cap 10%, 2,600 Mt): the words say least combined overshoot, never 'emits less' (" + Vb.cum + " Mt)");
    const e = LIB.plans.find(x => x.view.over > 0.5 && x.view.capOver.every(c => c < 0.5));
    ok(!e || /No pathway within these levers and the import cap emits less/.test(PG.says(e.view, null, P)[0].text), "only the budget missed: no plan within the levers and the import cap emits less" + (e ? " (" + e.preset + "/" + e.foresight + ")" : ""));
  }

  // ---------------- the library on the page
  ok(PG.libEntry(LIB, SS, S, Object.assign({}, def, { sh: "drought" })) === e0, "a shock does not change which library entry a plan is (its re-plan is in the entry)");
  ok(PG.libEntry(LIB, SS, S, Object.assign({}, def, { cw: def.cw + 1 })) === null, "a plan off the library is solved live");
  ok(/The first view, precomputed with this engine on " \+ LIB\.date/.test(JS) && /useLib = e && first && !stub; first = false;/.test(JS) && /started = true; first = true; run\.run\(plan\)/.test(JS) && !/Solve it live|forceLive/.test(JS),
    "only the first view comes from the library (labelled with its date); every run the reader starts, a preset included, solves live: no 'Solve it live' detour");
  has("the first view and the presets' full-year checks (about a minute of solving each) come from a library made with this engine; every run you start solves in your browser.");
  // the cost: parts, boundary, the existing fleet, the correction
  ok(/\["Fixed O&M of the existing wind, solar and batteries", bn\(pv\.upkeep\), bn\(V\.yearly\[4\]\.upkeep\)\]/.test(JS) && /The data give none for existing hydro and the steady plants, so their upkeep is left out/.test(JS), "the cost table has the existing fleet's upkeep as a part, and the key says what is left out");
  const pvs = e0.view.pv; ok(Math.abs(pvs.capital + pvs.transmission + pvs.fom + pvs.upkeep + pvs.vom + pvs.fuel - pvs.total) <= 3, "the cost table's parts add up to the total ($" + pvs.total + "M)");
  has("Also left out: the upkeep of the existing hydro and steady plants (the data give no figure; the same in every pathway).");
  ok(/an existing plant leaves in the five-year period that contains its retirement year, a conservative simplification/.test(JS), "the retirement convention, stated where the page describes the fleet");
  const corr = X.correction(E4, LIB, PL); has(corr.text, "the dated correction, from the library"); ok(E4.bn(corr.was) === "$401.6 billion" && E4.bn(corr.now) === "$410.7 billion", "the correction's numbers: " + E4.bn(corr.was) + " before, " + E4.bn(corr.now) + " now");
  ok(/full: e \? e\.full : null/.test(JS) && /Full-year validation unavailable for this plan/.test(JS) && /Load the default plan \(validated\)/.test(JS), "a live run of a library plan keeps its full-year checks; any other plan says the validation is unavailable and offers the validated default");
  ok(/E4\.doneWords\(st, e\.view\)/.test(JS) && !/words: \{ ok:/.test(JS), "the status line is the engine's, by foresight (no fixed 'cheapest pathway' for decade by decade)");

  // ---------------- the budget gap with A20, the shock table, units and terms
  ok(/E4\.GAP\.slice\(0, 2\)/.test(JS) && E4.GAP.length === 3 && /about 2,700 Mt/.test(E4.GAP[0]) && /a20-national-scenarios/.test(E4.GAP[1]) && /electrifies buildings and industry years sooner/.test(E4.GAP[1]), "the limits group carries the engine's two gap sentences (floor about 2,700 Mt; why A20 meets 2,600 Mt)");
  has("no pathway here gets below about 2,700 Mt (straight-line counting, central demand)"); ok(/href="a20-national-scenarios\.html"/.test(PAGE), "the page links A20");
  const shk = E4.shockTable(P); ok(shk.length === 4 && shk.every(r => r.length === 4) && /five years/.test(JS) && /E4\.shockTable\(P\)/.test(JS), "the shock group opens the engine's table: each shock's model year, multiplier and what the re-plan keeps; five years per model year said");
  ok(shk.find(r => /Mineral/.test(r[0]))[3].indexOf("Decisions through 2030 kept") === 0 && shk.find(r => /Drought/.test(r[0]))[3].indexOf("Builds and retirements through 2035 kept") === 0, "the table's rules: the mineral restriction keeps decisions through 2030; the drought through 2035");
  ok(shk.every(r => r.every(c => !(/nuclear/i.test(c) && /cost|\$|price/i.test(c.split(/\.\s/).find(x => /nuclear/i.test(x)) || "")))), "no sentence of the shock table pairs a nuclear term with a cost");
  has("1 TWh = 3.6 PJ"); has("Mt, million tonnes"); has("O&M: operation and maintenance."); ok(/data-term="time-slice"/.test(PAGE) && /data-term="net-calorific-value"/.test(PAGE) && /\[\[vintage\|/.test(JS) && /\[\[residual-value\|/.test(JS), "units and terms marked at first use");
  has("Electric Power Annual, Table 7.4: weighted average cost of fossil fuels for the electric power industry, 2015 through 2025 (2025: gas $3.85, coal $2.42 per MMBtu; read 7 Nov 2026)");
  ok(PL.costs.fuels.gas.anchor.usdPerMMBtu === 3.85 && PL.costs.fuels.coal.anchor.usdPerMMBtu === 2.42 && /docs\.nlr\.gov\/docs\/fy25osti\/93281\.pdf/.test(PAGE), "the fuel anchors as cited; the battery report linked");
  ok(LIB.plans.every(e => e.shocks && Object.keys(e.shocks).join() === E4.c4Shocks(P).join()), "every entry holds C4's four shocks");

  // ---------------- the page frame
  ["brief", "bench", "results", "explain", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  ok(/data-learn="sb4" data-src="\.\.\/assets\/learn\/data\/prairieland\.json \.\.\/assets\/learn\/data\/e4-pathways\.json \.\.\/assets\/learn\/data\/e4-library\.json \.\.\/assets\/learn\/data\/path\.json"/.test(PAGE), "data-src: the nation, the engine's settings, the library, the course map");
  ok(/sb4-pathway-explorer\.js/.test(PAGE) && /learn\.js/.test(PAGE), "scripts");
  const BUNDLE = fs.readFileSync(L("learn.js"), "utf8");
  ok(BUNDLE.indexOf("window.LX.E4 = E4") >= 0, "engine E4 is in the bundle (the build step's component order)");
  ok(!/firm[^.;\n]{0,50}nuclear|nuclear[^.;\n]{0,50}firm/i.test(T + JS) && !/reactor|\bSMR\b|small modular/i.test(PAGE + JS), "the generic firm option is never named nuclear; no reactor named");
  ok(!/learning curve|learning rate|first[- ]of[- ]a[- ]kind/i.test(PAGE + JS), "no learning curves (costs are fixed ranges; none changes with deployment)");
  ok(!/G-COST|G-NUC|G-GIS/.test(T + JS.replace(/\/\/.*$/gm, "")), "no editorial guard code on the page or in its strings");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS), "no AI wording");

  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (SB4)");
  process.exit(fails ? 1 : 0);
})();
