// test_sb1-microgrid-workbench.js — Node tests for SB1, the Microgrid Workbench (learn/sb1-microgrid-workbench.qmd,
// assets/learn/sb1-microgrid-workbench.js), on engine E1 (its own tests: test_e1-engine.js). What it checks:
//   - the no-JS blocks: the bench's table is LX.ShareState.staticHTML of the plan's defaults; the results table is the
//     engine's precomputed run of the default plan (data file, `precomputed.sb1`), which equals a fresh run
//   - every number the page states: the brief (1,200 kW), the inputs table (each value from the data file), the outage
//     descriptions (start, length, seed), against the data and the engine
//   - the seeded test's words: never more than the ten outages support
//   - the full-year check of the 12 average days: the sb1-year block holds four plans' grid bills on
//     12 average days and over all 8,760 hours (X.fullYear), as the page states (the same for F7's campus, 4% to 7%
//     higher for the large solar-and-battery plans)
//   - the wording details: hypothetical outages, the cost's boundary, marginal prices, the glossary marks
//   - the page frame: the sandbox form's sections, the scripts, the data-src, the engine in the bundle; the text names
//     no price from the model; links only to live lessons and allowed sources (the scope scan checks the rest)
// --write: recomputes `precomputed.sb1` in the data file and writes the three marker blocks.
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
    ["Annual cost: equipment and upkeep plus the normal-year grid bill on 12 average days (2025 dollars, illustrative; outage diesel not included)", E1.money(R.total)],
    ["The year's bill with nothing built", E1.money(R.base)],
    ["CO₂ from grid electricity in a normal year", E1.kilo(R.year.co2) + " t"]];
  R.outages.forEach(o => rows.push(["Must-stay-on load unserved: " + o.short.toLowerCase(), E1.kilo(o.must) + " kWh (" + E1.kilo(o.fuel) + " gal of diesel, " + E1.fuelMoney(o.fuelCost) + ")"]));
  return rows;
}

(async () => {
  const { E1, cfg, P, SS, solver, solveSync } = await X.load();
  const PG = require(X.L("sb1-microgrid-workbench.js"));
  const def = SS.defaults(E1.schema);
  const run = await E1.solve(def, P, { solver });
  ok(run.ok, "the default plan's run is optimal");
  const pre = { head: "Result for the default plan (F7's campus)", rows: resultRows(E1, run.results), note: "Precomputed with HiGHS on " + RUN_DATE + " for the default plan above; with JavaScript on, the bench runs your own plan." };
  // the full-year check: four plans, their grid bills on 12 average days and over the 8,760 hours of 2025
  const sizedOf = async st => (await E1.solve(st, P, { solver, task: "size", check: false })).results.plan;
  const YP = [["F7's campus (the default plan)", def], ["Size it for me, from the default plan", await sizedOf(def)],
    ["Sized with the dorms also must stay on (C1)", await sizedOf(Object.assign({}, def, { pd: "must" }))],
    ["M5's plan: exports capped at 0 kW", Object.assign({}, def, { exp: 0, pv: cfg.reference.m5.plan.pv, bat: cfg.reference.m5.plan.bat, gen: cfg.reference.m5.plan.gen })]];
  const yr = YP.map(([label, st]) => { const avg = E1.readYear(st, P, solveSync(E1.yearModel(st, P))), full = X.fullYear(E1, P, st, solveSync); return { label, st, avg: avg.bill, full: full.bill, ok: full.status === "optimal" && full.unserved < 0.5 && avg.unserved < 0.5 }; });
  const pct = r => (r.full - r.avg) / r.avg * 100;
  // each cell carries its column's name (data-l, engine-e1.css .e1-lab), so a phone, which shows one block per row, still says what each number is
  const yearHTML = '<div class="lx-scroll-x"><table class="lx-facts e1-lab"><thead><tr><th scope="col">Plan</th><th scope="col">Grid bill, 12 average days</th><th scope="col">Grid bill, 8,760 hours</th><th scope="col">Difference</th></tr></thead><tbody>' +
    yr.map(r => "<tr><td>" + r.label + " · " + E1.kilo(r.st.pv) + " kW, " + E1.kilo(r.st.bat) + " kWh</td><td class=\"n\" data-l=\"Grid bill, 12 average days\">" + E1.money(r.avg) + "</td><td class=\"n\" data-l=\"Grid bill, 8,760 hours\">" + E1.money(r.full) + "</td><td class=\"n\" data-l=\"Difference\">" + (Math.abs(pct(r)) < 0.05 ? "the same" : (pct(r) > 0 ? "+" : "") + pct(r).toFixed(1) + "%") + "</td></tr>").join("") +
    "</tbody></table></div>";
  const BLOCKS = { "sb1-bench": () => SS.staticHTML(E1.schema, def), "sb1-results": () => E1.fallback({ cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { sb1: pre }) }) }, "sb1"), "sb1-year": () => yearHTML };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { sb1: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    X.writeBlocks(QPATH, { "sb1-bench": BLOCKS["sb1-bench"](), "sb1-results": BLOCKS["sb1-results"](), "sb1-year": BLOCKS["sb1-year"]() });
    console.log("wrote precomputed.sb1 and the sb1-bench, sb1-results and sb1-year blocks");
  }
  ok(yr.every(r => r.ok), "full-year check: every plan's 8,760-hour LP is optimal and serves the campus");
  ok(Math.abs(pct(yr[0])) < 0.05 && yr.slice(1).every(r => pct(r) >= 4 && pct(r) <= 7), "full-year check: F7's campus the same, the large plans 4% to 7% higher (" + yr.map(r => pct(r).toFixed(2) + "%").join(", ") + "), as the page and the engine's notes say");
  // the 4% to 7% holds for the three plans checked, not for every plan: the largest plan with no exports comes out far
  // higher (a review's case), so the page and the engine's words add that other plans can differ more
  {
    const big = Object.assign({}, def, { pv: 4000, bat: 8000, exp: 0 }), avg = E1.readYear(big, P, solveSync(E1.yearModel(big, P))), full = X.fullYear(E1, P, big, solveSync), d = (full.bill - avg.bill) / avg.bill * 100;
    const ENG = fs.readFileSync(X.L("components/engine-e1.js"), "utf8"), JS0 = fs.readFileSync(X.L("sb1-microgrid-workbench.js"), "utf8"), PG0 = fs.readFileSync(QPATH, "utf8");
    ok(full.status === "optimal" && d > 10 && !/up to 7%/.test(ENG + JS0 + PG0) && (ENG.match(/4% to 7% higher; other plans can differ more/g) || []).length === 2 && /for the three larger plans checked below, a full year's bill came out 4% to 7% higher; other plans can differ more/.test(JS0) && /Other plans can differ more than these\./.test(PG0),
      "the full-year bound only for the plans checked: 4,000 kW, 8,000 kWh, no exports comes out " + d.toFixed(1) + "% higher, so every statement says other plans can differ more");
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
  [["Winter storm, 3 days", "72 hours from 00:00 on 20 January 2025"], ["Winter evening, 1 day", "24 hours from 16:00 on 20 January 2025"], ["Summer storm, 3 days", "72 hours from 00:00 on 28 July 2025"]].forEach(([n, w]) =>
    ok(PAGE.indexOf("<tr><td>" + n + "</td><td>" + w + "</td></tr>") >= 0, "the outage table: " + n + ", " + w));
  ok(P.scen.jan3.hours === 72 && E1.when(P.scen.jan3, 0) === "20 Jan 00:00" && P.scen.eve1.hours === 24 && E1.when(P.scen.eve1, 0) === "20 Jan 16:00" && E1.when(P.scen.jul3, 0) === "28 Jul 00:00", "the three named outages are as the page says");
  has("Seed 7: the same ten on every visit."); has("Start: any whole hour from 1 January to 25 February 2025, each equally likely."); has("Length: 6 to 72 hours, each equally likely.");
  ok(cfg.seeded.seed === 7 && cfg.seeded.lastStartDay === 55 && cfg.seeded.minHours === 6 && cfg.seeded.maxHours === 72, "the seeded outages' rules as the page says (day 55 = 25 February)");

  // ---------------- the seeded test's words
  const sd = await E1.solve(def, P, { solver, scenarios: P.seeded });
  ok(sd.ok && sd.results.outages.length === 10, "the default plan on the ten seeded outages: optimal runs");
  const w = PG.seededWords(sd.results);
  ok(w.ok === sd.results.outages.filter(o => o.must < 0.5).length && /drawn outages/.test(w.text) && /not how often it would fail/.test(w.caution) && !/reliab|probab|percent|%/.test(w.text), "seeded words: a count of these outages, no reliability or probability claim: " + w.text);
  // the pass count, the worst outage and the caution are three short elements (49 words in one paragraph before)
  {
    const wc = s => String(s || "").split(/\s+/).filter(Boolean).length, JS1 = fs.readFileSync(X.L("sb1-microgrid-workbench.js"), "utf8");
    const bad = Object.assign({}, def, { gen: 0, bat: 0, pv: 0 }), sb = await E1.solve(bad, P, { solver, scenarios: P.seeded }), wb = PG.seededWords(sb.results);
    ok(sb.ok && wb.ok < wb.n && wb.worstText && [w.text, w.worstText, w.caution, wb.text, wb.worstText, wb.caution].every(s => wc(s) <= 35) && /if \(w\.worstText\)/.test(JS1), "seeded words: three short elements, each within 35 words (" + [wb.text, wb.worstText, wb.caution].map(wc).join(", ") + ")");
    const strs = (JS1.match(/LX\.rich\("[^"]+"\)|text: "[^"]{60,}"/g) || []).map(s => s.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1"));
    ok(strs.length >= 2 && strs.every(s => wc(s) <= 37), "the explain layer's paragraphs within about 35 words: " + strs.map(wc).join(", "));
  }

  // ---------------- the page frame
  ["brief", "bench", "results", "explain", "sources"].forEach(id => ok(new RegExp('::: \\{#' + id + ' \\.lx-sec\\}').test(PAGE), "section #" + id));
  ok(/data-learn="sb1" data-src="\.\.\/assets\/learn\/data\/e1-prairie-campus\.json \.\.\/assets\/learn\/data\/path\.json"/.test(PAGE) && /<script src="\.\.\/assets\/learn\/sb1-microgrid-workbench\.js" defer><\/script>/.test(PAGE), "data-src and the page script");
  const bundle = fs.readFileSync(X.L("learn.js"), "utf8");
  ok(bundle.indexOf("/* engine-e1.js — LX.E1") >= 0 && bundle.indexOf("/* engine-e1.js") > bundle.indexOf("/* benchrun.js"), "engine E1 is in the bundle, after BenchRun");
  const js = fs.readFileSync(X.L("sb1-microgrid-workbench.js"), "utf8");
  ok(!/\bprices?\b/i.test(T.replace(/Marginal electricity prices \(the engine does not calculate them\)|Marginal prices|diesel price|retail price|average price|Prices each outage's diesel/gi, "")), "the page names no price from the model (only that it calculates none)");
  ok(/does not calculate marginal electricity prices/.test(js) && /marginal prices of any kind from the model/.test(js), "the explain layer: the engine does not calculate marginal electricity prices");
  // ---------------- the wording details
  ok(/Size it for me may build/.test(PAGE) && /It replaces your sizes; your other choices stay\./.test(fs.readFileSync(X.L("sb1-microgrid-workbench.js"), "utf8")) && /Its sizes replace yours; a technology switched off here is sized to zero\./.test(fs.readFileSync(X.L("components/engine-e1.js"), "utf8")),
    "Size it for me: the bench says its sizes replace the reader's and a technology switched off is sized to zero");
  ["Starts with a full battery and a full diesel tank; no fuel arrives during it.", "loads are flat and can be partly served", "It leaves out the sets' 30% minimum.", "not proven the cheapest on the steps"].forEach(s => has(s, "the no-JS explanation keeps the assumptions the results rest on"));
  ok(/data-term="islanding">island<\/span>, cut off from the main grid/.test(PAGE) && !/part-load/.test(PAGE) && /1 kW of panels averages about 0\.24 kW over the year/.test(T), "island, fuel use below full output and the solar capacity factor said in plain words");
  ok(/test hypothetical outages on 2025 solar profiles/.test(PAGE) && !/real outages/.test(PAGE + js), "the subtitle: hypothetical outages, not real ones");
  ok(T.indexOf("not measured campus output") >= 0 && T.indexOf("The sun is real") < 0, "solar: a teaching profile, not measured campus output");
  ["feeder", "tariff", "linear-program", "cost-of-capital", "mixed-integer-program"].forEach(id => ok(new RegExp('data-term="' + id + '"').test(PAGE), "glossary mark on the page: " + id + ""));
  ok(/\[\[linear-program\|linear program\]\]/.test(js) && /\[\[cost-of-capital\|/.test(fs.readFileSync(X.L("components/engine-e1.js"), "utf8")) && !/\[\[capital-recovery-factor\|cost of capital\]\]/.test(fs.readFileSync(X.L("components/engine-e1.js"), "utf8")), "cost of capital links its own term, not the capital recovery factor");
  ok(/tStop\.attach\(T\)/.test(js) && /busy: tStop\.busy/.test(js), "the ten-outage run box has a Stop button (the engine test drives the bench's)");
  const desc = (PAGE.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 35, "the description is within the 35-word budget (" + desc.split(/\s+/).length + " words; SB1 11)");
  ok(!/shadow price|dual/i.test(T + js), "no shadow prices or duals on the page");
  const hrefs = [...PAGE.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^(https?:|mailto:|#|\.\.\/)/.test(h) && h !== "index.html");
  const P2 = JSON.parse(fs.readFileSync(X.L("data/path.json"), "utf8")), live = new Set([].concat(P2.starter || [], P2.more || [], P2.toolbox || []).filter(l => l.ready).map(l => l.href));
  ok(hrefs.every(h => live.has(h.replace(/#.*$/, ""))), "internal links go to live lessons only: " + hrefs.filter(h => !live.has(h.replace(/#.*$/, ""))).join(", "));
  console.log(`test_sb1-microgrid-workbench: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
