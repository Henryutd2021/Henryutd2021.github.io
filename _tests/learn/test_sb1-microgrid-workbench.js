// test_sb1-microgrid-workbench.js — Node tests for SB1, the Microgrid Workbench (learn/sb1-microgrid-workbench.qmd,
// assets/learn/sb1-microgrid-workbench.js), on engine E1 (its own tests: test_e1-engine.js). What it checks:
//   - the no-JS blocks: the bench's table is LX.ShareState.staticHTML of the plan's defaults; the results table is the
//     engine's precomputed run of the default plan (data file, `precomputed.sb1`), which equals a fresh run
//   - every number the page states: the brief (1,200 kW), the inputs table (each value from the data file), the outage
//     descriptions (start, length, seed), against the data and the engine
//   - the seeded test's words: never more than the ten outages support
//   - the page frame: the sandbox form's sections, the scripts, the data-src, the engine in the bundle; the text names
//     no price from the model; links only to live lessons and allowed sources (the scope scan checks the rest)
// --write: recomputes `precomputed.sb1` in the data file and writes both marker blocks.
// Usage (from the site folder):  node _tests/learn/test_sb1-microgrid-workbench.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e1_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const QPATH = path.join(X.SITE, "learn/sb1-microgrid-workbench.qmd"), DPATH = X.L("data/e1-prairie-campus.json");
const RUN_DATE = "3 November 2026";

function resultRows(E1, R) {
  const p = R.plan, rows = [
    ["Plan", E1.kilo(p.pv) + " kW of solar · " + E1.kilo(p.bat) + " kWh battery · " + p.gen + " sets of 200 kW · " + E1.kilo(p.fuel) + " gallons"],
    ["Annual cost (2025 dollars, illustrative)", E1.money(R.total)],
    ["The year's bill with nothing built", E1.money(R.base)],
    ["CO₂ from grid electricity in a normal year", E1.kilo(R.year.co2) + " t"]];
  R.outages.forEach(o => rows.push(["Must-stay-on load unserved: " + o.short.toLowerCase(), E1.kilo(o.must) + " kWh (" + E1.kilo(o.fuel) + " gal of diesel)"]));
  return rows;
}

(async () => {
  const { E1, cfg, P, SS, solver } = await X.load();
  const PG = require(X.L("sb1-microgrid-workbench.js"));
  const def = SS.defaults(E1.schema);
  const run = await E1.solve(def, P, { solver });
  ok(run.ok, "the default plan's run is optimal");
  const pre = { head: "Result for the default plan (F7's campus)", rows: resultRows(E1, run.results), note: "Precomputed with HiGHS on " + RUN_DATE + " for the default plan above; with JavaScript on, the bench runs your own plan." };
  const BLOCKS = { "sb1-bench": () => SS.staticHTML(E1.schema, def), "sb1-results": () => E1.fallback({ cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { sb1: pre }) }) }, "sb1") };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { sb1: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    X.writeBlocks(QPATH, { "sb1-bench": BLOCKS["sb1-bench"](), "sb1-results": BLOCKS["sb1-results"]() });
    console.log("wrote precomputed.sb1 and the sb1-bench and sb1-results blocks");
  }
  const PAGE = fs.readFileSync(QPATH, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
  ok(JSON.stringify(D.precomputed && D.precomputed.sb1) === JSON.stringify(pre), "the data file's precomputed default run equals a fresh run (run with --write after a change)");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
  const T = X.norm(PAGE);
  const has = (s, why) => ok(T.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (why ? " (" + why + ")" : ""));

  // ---------------- the page's numbers
  has("1,200 kW in all", "the loads' total, " + P.total);
  has("300 · 100 · 250 · 550 kW", "F7's loads " + P.loads.map(l => l.kw).join(", "));
  has("24.0% a year", "annual CF " + cfg.sun.annualCF);
  has("13.37¢/kWh"); has("28.31¢ from 16:00 to 21:00, 9.44¢ otherwise", "the TOU split in the data");
  ok(cfg.grid.tariffs.tou.on === 28.31 && cfg.grid.tariffs.tou.off === 9.44 && cfg.grid.tariffs.tou.peak.join() === "16,21", "TOU data as stated");
  has("$3.66/gallon"); has("10.19 kg/gallon"); has("0.367 kg/kWh"); has("about 0.81 pounds per kWh");
  const tc = cfg.tech;
  has("$" + tc.pv.capex.toLocaleString("en-US") + "/kW · $" + tc.bat.capex + "/kWh · $" + tc.gen.capex + "/kW · $" + tc.tank.capexPerGal + "/gal", "equipment costs");
  has("solar ($" + tc.pv.fom + "/kW, " + tc.pv.life + " years), battery (" + (tc.bat.fomShare * 100) + "%, " + tc.bat.life + " years, 90% of a charge back), generator sets ($" + tc.gen.fom + "/kW, " + tc.gen.life + " years), diesel tank (" + tc.tank.life + " years)");
  ok(tc.bat.eff === 0.9 && tc.bat.hours === 4, "battery: 90% of a charge back, 4 hours");
  has(tc.gen.galPerKWh + " gal/kWh"); has("runs at 30% of its 200 kW or more"); ok(tc.gen.minLoad === 0.3 && tc.gen.unitKW === 200, "sets: 200 kW, 30% minimum");
  has("4¢/kWh"); ok(cfg.grid.exportCredit === 4, "export credit 4¢");
  has("6% · 4% · 5%"); ok(cfg.owners.map(o => o.rate).join() === "0.06,0.04,0.05", "owners' rates");
  has("72 hours from 00:00 on 20 January, 24 hours from 16:00 on 20 January, and 72 hours from 00:00 on 28 July");
  ok(P.scen.jan3.hours === 72 && E1.when(P.scen.jan3, 0) === "20 Jan 00:00" && P.scen.eve1.hours === 24 && E1.when(P.scen.eve1, 0) === "20 Jan 16:00" && E1.when(P.scen.jul3, 0) === "28 Jul 00:00", "the three named outages are as the page says");
  has("seed 7: each starts at a whole hour from 1 January to 25 February 2025, every hour equally likely, and lasts 6 to 72 hours");
  ok(cfg.seeded.seed === 7 && cfg.seeded.lastStartDay === 55 && cfg.seeded.minHours === 6 && cfg.seeded.maxHours === 72, "the seeded outages' rules as the page says (day 55 = 25 February)");

  // ---------------- the seeded test's words
  const sd = await E1.solve(def, P, { solver, scenarios: P.seeded });
  ok(sd.ok && sd.results.outages.length === 10, "the default plan on the ten seeded outages: optimal runs");
  const w = PG.seededWords(sd.results);
  ok(w.ok === sd.results.outages.filter(o => o.must < 0.5).length && /drawn outages/.test(w.text) && /not how often it would fail/.test(w.caution) && !/reliab|probab|percent|%/.test(w.text), "seeded words: a count of these outages, no reliability or probability claim: " + w.text);

  // ---------------- the page frame
  ["brief", "bench", "results", "explain", "sources"].forEach(id => ok(new RegExp('::: \\{#' + id + ' \\.lx-sec\\}').test(PAGE), "section #" + id));
  ok(/data-learn="sb1" data-src="\.\.\/assets\/learn\/data\/e1-prairie-campus\.json \.\.\/assets\/learn\/data\/path\.json"/.test(PAGE) && /<script src="\.\.\/assets\/learn\/sb1-microgrid-workbench\.js" defer><\/script>/.test(PAGE), "data-src and the page script");
  const bundle = fs.readFileSync(X.L("learn.js"), "utf8");
  ok(bundle.indexOf("/* engine-e1.js — LX.E1") >= 0 && bundle.indexOf("/* engine-e1.js") > bundle.indexOf("/* benchrun.js"), "engine E1 is in the bundle, after BenchRun");
  const js = fs.readFileSync(X.L("sb1-microgrid-workbench.js"), "utf8");
  ok(!/\bprice\b/i.test(T.replace(/No prices[^.]*\.|Prices \(a mixed-integer program gives none\)|prices of any kind from the model|diesel price|retail price|average price/gi, "")), "the page names no price from the model (only that it gives none)");
  ok(!/shadow price|dual/i.test(T + js), "no shadow prices or duals on the page");
  const hrefs = [...PAGE.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^(https?:|mailto:|#|\.\.\/)/.test(h) && h !== "index.html");
  const P2 = JSON.parse(fs.readFileSync(X.L("data/path.json"), "utf8")), live = new Set([].concat(P2.starter || [], P2.more || [], P2.toolbox || []).filter(l => l.ready).map(l => l.href));
  ok(hrefs.every(h => live.has(h.replace(/#.*$/, ""))), "internal links go to live lessons only: " + hrefs.filter(h => !live.has(h.replace(/#.*$/, ""))).join(", "));
  console.log(`test_sb1-microgrid-workbench: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
