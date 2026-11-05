// test_sb2-grid-room.js — Node tests for SB2, the Grid Room (learn/sb2-grid-room.qmd, assets/learn/sb2-grid-room.js), on
// engine E2 (its own tests: test_e2-engine.js). What it checks:
//   - the no-JS blocks: the bench's table is LX.ShareState.staticHTML of the plan's defaults; the results table is the
//     engine's precomputed run of the default plan and the 300 MW preset (data file, `precomputed.sb2`), equal to a
//     fresh run; the inputs table is E2.inputsHTML of the data file
//   - every number the page states (the brief, the data note, the periods, the tie rule) against the data and the engine
//   - the run's words (says, readouts): true for every preset on every period, never more than the run shows
//   - the page frame: the sandbox sections, scripts, data-src, the engine in the bundle; prices named as conditional on
//     the commitment; no nuclear term on the page, in its script, the engine or the data (guard G-DC); no AI wording;
//     links only to live lessons and allowed sources (the scope scan checks the rest)
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
function moneyK(v) { const r = Math.round(v / 1000) * 1000; return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
function rowsOf(E2, P, R, tag) {
  const T = R.tot;
  return [
    [tag + ": production cost (running, no-load and start-up; 2025 dollars)", moneyK(T.prod)],
    [tag + ": average price, " + P.zones.map(z => z.name).join(" · ") + " (conditional on the commitment)", R.avgPrice.map(v => E2.priceTxt(v)).join(" · ") + " /MWh"],
    [tag + ": highest price in any zone", E2.priceTxt(Math.max.apply(null, R.maxPrice)) + "/MWh"],
    [tag + ": hours at the limit, Ridge–Town · Town–Metro", E2.kilo(T.cong.WT) + " · " + E2.kilo(T.cong.TM) + " of " + R.hours],
    [tag + ": unserved · reserve short", E2.kilo(T.shed) + " MWh · " + E2.kilo(T.rshort) + " MWh"],
    [tag + ": uplift (make-whole payments)", moneyK(T.upliftAll)]];
}

(async () => {
  const { E2, cfg, P, SS, solver } = await X.load();
  const PG = require(X.L("sb2-grid-room.js"));
  const def = SS.defaults(E2.schema), withLoad = Object.assign({}, def, E2.presets.filter(p => p.id === "load")[0].state);
  const r0 = await E2.solve(def, P, { solver }), r1 = await E2.solve(withLoad, P, { solver });
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
  const T = X.norm(PAGE), JS = fs.readFileSync(X.L("sb2-grid-room.js"), "utf8"), ENG = fs.readFileSync(X.L("components/engine-e2.js"), "utf8");
  const has = (s, why) => ok(T.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (why ? " (" + why + ")" : ""));

  // ---------------- the page's numbers
  has("4,000 MW at the 2025 peak", "the zones' peaks add to " + cfg.zones.reduce((s, z) => s + z.peak, 0));
  has("the $5,000/MWh penalty for unserved load and the $1,000/MWh for reserve short"); ok(cfg.voll === 5000 && cfg.reserveShort === 1000, "penalties as stated");
  E2.sb2Schema().fields[0].values.forEach(id => { const p = P.periods[id]; ok(T.indexOf(p.label) >= 0, "the periods table names " + p.label); });
  [["Summer peak day, 29 July 2025", "The 2025 summer day with the highest hourly demand"], ["Winter peak day, 21 January 2025", "The 2025 winter day with the highest hourly demand, among days with no repaired hours"],
    ["Windy spring day, 17 April 2025", "The 2025 spring day with the most wind energy"], ["Peak-demand week, 14–20 August 2025", "The 2025 week with the highest average daily demand peak"],
    ["Low-wind winter week, 2–8 January 2025", "One of the two calmest weeks of winter 2025 by mean wind; lesson A8's week"]].forEach(([a, b]) => ok(PAGE.indexOf("<tr><td>" + a + "</td><td>" + b + "</td></tr>") >= 0, "the periods table row: " + a + " (the engine test checks each claim)"));
  ok(cfg.tie.spill[0] < cfg.tie.spill[1] && cfg.tie.spill[1] < cfg.tie.spill[2] && cfg.zones.map(z => z.id).join() === "W,T,M", "tie rule as the page says: Wind Ridge's spill first, then Prairie Town's, then Metro's");
  ok(cfg.tie.shed[2] < cfg.tie.shed[1] && cfg.tie.shed[1] < cfg.tie.shed[0], "tie rule as the page says: Metro's load shed first, then Prairie Town's, then Wind Ridge's");
  ok(Math.max(...cfg.tie.spill, ...cfg.tie.shed, cfg.tie.reserve, cfg.tie.battery + 23 * cfg.tie.batteryHour) < 0.01, "every tie cost is below a cent per MWh, as the page says");
  has("moves 0.001 MWh up equals the slope when it moves down", "the engine test's step");
  ok(/bump: \{ row, d: 1e-3 \}/.test(fs.readFileSync(path.join(X.SITE, "_tests/learn/test_e2-engine.js"), "utf8")), "the engine test moves each row by 0.001 MWh");

  // ---------------- the run's words, for every preset on every period
  let wordsOk = true, notes = [];
  for (const per of P.periodList) for (const pr of E2.presets) {
    const st = Object.assign({}, def, pr.state, { per }), r = await E2.solve(st, P, { solver });
    if (!r.ok) { wordsOk = false; notes.push(per + "/" + pr.id + " " + r.status); continue; }
    const R = r.results, S = PG.says(R, P), txt = S.map(s => s.text).join(" ");
    const shed = R.tot.shed > 0.5;
    if (shed !== /MWh unserved/.test(txt) || (!shed && !/Every MWh served/.test(txt))) { wordsOk = false; notes.push(per + "/" + pr.id + " shed"); }
    P.links.forEach(l => {
      const n = R.tot.cong[l.id], says = new RegExp(l.name + " at its limit for " + n + " of").test(txt);
      if ((n > 0) !== says) { wordsOk = false; notes.push(per + "/" + pr.id + " " + l.id); }
    });
    if (P.links.every(l => R.tot.cong[l.id] === 0)) {
      const spread = Math.max(...R.days.map(d => Math.max(...d.hours.map(h => Math.max(...h.z.map(x => x.price)) - Math.min(...h.z.map(x => x.price))))));
      if (!(spread < 0.01) || !/within a cent/.test(txt)) { wordsOk = false; notes.push(per + "/" + pr.id + " spread " + spread); }
    }
    if (R.tot.rshort > 0.5 !== /Reserve short by/.test(txt)) { wordsOk = false; notes.push(per + "/" + pr.id + " reserve"); }
    const ro = PG.readouts(R, P);
    if (ro[0][1] !== moneyK(R.tot.prod) || ro[2][1] !== E2.kilo(R.tot.shed) + " MWh" || ro[3][1] !== E2.kilo(R.tot.cong.TM) + " h") { wordsOk = false; notes.push(per + "/" + pr.id + " readouts"); }
  }
  ok(wordsOk, "the run's words and readouts are true for all " + P.periodList.length * E2.presets.length + " preset runs (" + notes.slice(0, 4).join("; ") + ")");

  // ---------------- the page frame
  ["brief", "bench", "results", "explain", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  ok(/data-learn="sb2" data-src="\.\.\/assets\/learn\/data\/e2-plains-grid\.json \.\.\/assets\/learn\/data\/town_year\.json \.\.\/assets\/learn\/data\/cf_targets\.json \.\.\/assets\/learn\/data\/path\.json"/.test(PAGE) && /<script src="\.\.\/assets\/learn\/sb2-grid-room\.js" defer><\/script>/.test(PAGE), "data-src and the page script");
  const bundle = fs.readFileSync(X.L("learn.js"), "utf8");
  ok(bundle.indexOf("/* engine-e2.js — LX.E2") >= 0 && bundle.indexOf("/* engine-e2.js") > bundle.indexOf("/* benchrun.js") && bundle.indexOf("/* engine-e2.js") > bundle.indexOf("/* plot.js"), "engine E2 is in the bundle, after BenchRun and Plot");
  ok(/conditional on the commitment/.test(ENG) && (ENG.match(/conditional on the commitment/g) || []).length >= 3 && /Prices, conditional on the commitment/.test(JS), "the prices are labelled conditional on the commitment (chart caption, map note, card title)");
  ok(!/\b(nuclear|reactor|SMR|small modular)\b/i.test(PAGE + JS + ENG + fs.readFileSync(DPATH, "utf8")), "no nuclear term on the page, in its script, the engine or the data (guard G-DC)");
  ok(!/\bAI\b|artificial intelligence|Claude|ChatGPT|generated by/i.test(T + JS), "no AI wording");
  ["mixed-integer-program", "linear-program", "transport-model", "reserves", "shadow-price"].forEach(id => ok(new RegExp('data-term="' + id + '"').test(PAGE), "glossary mark: " + id));
  const desc = (PAGE.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 35, "the description is within the 35-word budget (" + desc.split(/\s+/).length + " words)");
  const hrefs = [...PAGE.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^(https?:|mailto:|#|\.\.\/)/.test(h) && !/^index\.html(#|$)/.test(h));
  const P2 = JSON.parse(fs.readFileSync(X.L("data/path.json"), "utf8")), live = new Set([].concat(P2.starter || [], P2.more || [], P2.toolbox || []).filter(l => l.ready).map(l => l.href));
  ok(hrefs.every(h => live.has(h.replace(/#.*$/, ""))), "internal links go to live lessons only: " + hrefs.filter(h => !live.has(h.replace(/#.*$/, ""))).join(", "));
  console.log(`test_sb2-grid-room: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
