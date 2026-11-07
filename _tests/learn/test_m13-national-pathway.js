// test_m13-national-pathway.js — Node tests for M13 (learn/m13-national-pathway.qmd, assets/learn/m13-national-pathway.js),
// on engine E4 (its own tests and the library's: test_e4-engine.js). What it checks:
//   - the no-JS blocks: the lesson in one table (the library's runs) and the inputs table (E4.inputsHTML)
//   - vintages and residual value: the years each technology and build year pays for equal the engine's LP coefficients;
//     the residual share recomputed from the discount factors
//   - the budget's dual as a carbon value: the path rises at the discount rate
//   - every step's words against fresh runs: the central pathway; a budget sweep (the dual rises as the budget tightens,
//     the cost too; an out-of-reach budget's dual is the penalty); the straight line to zero out of reach at the most
//     electrification (the prediction's answer) and the fuel left in 2050; decade by decade costs more than perfect
//     foresight; each of C4's shocks re-planned; the full-year verdicts from the library (with and without the
//     peak-hour rule; the page's "240 hours"); the near-optimal range of 2050 solar (at least a gigawatt wide, the plan
//     shown inside it)
//   - the page frame: sections, scripts, data-src, the notebook and its downloads, the fictional line; no reactor named,
//     the firm option never called nuclear; no AI wording
// --write: writes the marker blocks.
// Usage (from the site folder):  node _tests/learn/test_m13-national-pathway.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e4_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const QPATH = path.join(X.SITE, "learn/m13-national-pathway.qmd");

(async () => {
  const { E4, PL, cfg, P, SS, S, L, solver } = await X.load();
  const PG = require(L("m13-national-pathway.js"));
  const LIB = JSON.parse(fs.readFileSync(L("data/e4-library.json"), "utf8")), def = SS.defaults(S), rate = def.dr / 100;
  const lib = (pr, fs) => LIB.plans.find(e => e.preset === pr && e.foresight === fs);
  const row = (label, e) => { const V = e.view, F = e.full, bad = F.filter(c => c.unservedMWh >= 0.5 || Math.abs(c.gap) > 0.1).length;
    return [label, PG.bn(V.pv.total), PG.kilo(V.cum) + " of " + PG.kilo(V.budget) + " Mt", PG.pct(Math.max(...V.imp)), bad ? bad + " of 4 checks fail (up to " + PG.kilo(Math.max(...F.map(c => c.unservedHours))) + " hours unserved)" : "all 4 checks survive"]; };
  const STATIC = () => E4.tableHTML(["Pathway", "Cost to 2050 (present value)", "CO₂ 2026–2050", "Imports, highest year", "Full years of hours (2030, 2050; 2025 and 2024 weather)"],
    [row("Central, perfect foresight", lib("central", "perfect")), row("Central, decade by decade", lib("central", "myopic")), row("Deep cuts (3,000 Mt), perfect foresight", lib("deep", "perfect")), row("Central without the peak-hour rule", lib("central-norule", "perfect"))], "m13-table") +
    '<p class="lx-hint">Precomputed with this engine on ' + LIB.date + ". Cost: the supply side and every fuel bought, 2026–2050 in 2025 dollars; end-use equipment left out.</p>";
  const BLOCKS = { "m13-static": STATIC, "m13-inputs": () => E4.inputsHTML(P) };
  if (process.argv.includes("--write")) { const b = {}; Object.keys(BLOCKS).forEach(k => { b[k] = BLOCKS[k](); }); X.writeBlocks(QPATH, b); console.log("wrote the m13 blocks"); }
  const PAGE = fs.readFileSync(QPATH, "utf8"), T = X.norm(PAGE), JS = fs.readFileSync(L("m13-national-pathway.js"), "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });

  // ---------------- vintages and residual value
  {
    const Sx = E4.sysOf(def, P), m = E4.build(P, Sx);
    Object.keys(PG.TECH).forEach(t => P.Y.forEach((y, q) => {
      const v = PG.vintage(P, t, q, rate), name = t === "firm" ? "n_firm" + q : "n_0" + t + q, cv = m.variables.find(x => x.name === name);
      const ann = (t === "firm" ? def.cf : { wind: def.cw, solar: def.cs, battery: def.cb, gasCC: def.cc }[t]) * E4.crf(rate, P.tech[t].life) + P.tech[t].fom;
      let D = 0; for (let tt = v.first; tt <= Math.min(2050, v.last); tt++) D += Math.pow(1 + rate, -(tt - 2025));
      ok(cv && near(cv.cost, ann * D / 1000, 1e-9), t + " built " + y + ": the LP charges " + v.years + " years of payments (to 2050)");
      let all = 0; for (let tt = v.first; tt <= v.last; tt++) all += Math.pow(1 + rate, -(tt - 2025));
      ok(near(v.residual, 1 - D / all, 1e-12) && v.runs.filter(Boolean).length === P.Y.filter((yy, p) => p >= q && yy - y < P.tech[t].life).length, t + " built " + y + ": residual " + (100 * v.residual).toFixed(1) + "% of its payments' present value");
    }));
    ok(/no residual value/.test(PG.vintageWords(PG.vintage(P, "battery", 0, rate))) && /residual value, /.test(PG.vintageWords(PG.vintage(P, "wind", 3, rate))), "the words: a battery built in 2030 has none; a wind farm built in 2045 has some");
    const cp = PG.carbonPath(48, rate, P.Y); ok(P.Y.every((y, i) => near(cp[i], 48 * Math.pow(1 + rate, y - 2025), 1e-9)) && cp[4] / cp[0] > 2, "the carbon value rises at the discount rate (×" + (cp[4] / cp[0]).toFixed(2) + " from 2030 to 2050)");
  }

  // ---------------- the steps' runs and words
  const run = async st => { const r = await E4.solve(st, P, { solver }); ok(r.ok, JSON.stringify(st).slice(0, 50) + "…: optimal"); return r; };
  const r5 = await run(def), V = E4.view(r5.results.plan, P), w5 = PG.runWords(V);
  ok(w5.indexOf(PG.bn(V.pv.total)) >= 0 && w5.indexOf(PG.kilo(V.cum) + " Mt") >= 0 && w5.indexOf(PG.fix(V.built.wind.reduce((a, b) => a + b, 0), 1) + " GW of wind") >= 0, "step 5: the central pathway's words as run");
  ok(JSON.stringify(V) === JSON.stringify(lib("central", "perfect").view), "step 5's live run equals the library's central entry");
  const sweep = [];
  for (const b of [5400, 3600, 2600]) { const V2 = E4.view((await run(Object.assign({}, def, { bud: b }))).results.plan, P); sweep.push({ budget: b, pv: V2.pv.total, cum: V2.cum, over: V2.over, dual: V2.carbonValue[0] }); }
  ok(sweep[0].dual <= sweep[1].dual && sweep[1].dual <= sweep[2].dual && sweep[0].pv <= sweep[1].pv && sweep[1].pv <= sweep[2].pv, "step 6: a tighter budget costs more and its dual rises ($" + sweep.map(s => s.dual.toFixed(0)).join(", $") + ")");
  ok(sweep[2].over > 0.5 && near(sweep[2].dual, cfg.penalties.budgetPerT, 0.5) && /no pathway within these levers meets the budget: the dual is the penalty's \$1,000/.test(PG.sweepWords(sweep)), "step 6: 2,600 Mt at central electrification is out of reach; its dual is the penalty ($1,000), and the words say so");
  const DEEP = E4.withPreset(def, cfg.presets.find(p => p.id === "deep")), LINE = PL.carbon.budget.presets.find(x => x.key === "line2050");
  ok(DEEP.eb === P.elRange.buildings.hi && DEEP.et === P.elRange.transport.hi && DEEP.ei === P.elRange.industry.hi, "step 7 uses the most electrification the data allows");
  const st7 = Object.assign({}, DEEP, { bud: LINE.mt }), V7 = E4.view((await run(st7)).results.plan, P), S7 = E4.sysOf(st7, P), w7 = PG.deepWords(V7, S7, LINE.mt);
  ok(V7.over > 0.5 && w7.indexOf(PG.kilo(V7.over) + " Mt over") >= 0, "step 7: the straight line to zero (" + LINE.mt + " Mt) is out of reach by " + V7.over + " Mt: the prediction's answer is no");
  const rem = PG.remains(S7); ok(w7.indexOf(PG.kilo(rem.oil) + " PJ of oil products") >= 0 && rem.oil > 300 && rem.gas > 100, "step 7: the fuel left in 2050 as the engine's demand has it (" + PG.kilo(rem.oil) + " PJ oil, " + PG.kilo(rem.gas) + " PJ gas, " + PG.kilo(rem.coal) + " PJ coal)");
  ok(/answer: "no"/.test(JS), "the prediction's answer is no");
  const Vm = E4.view((await run(Object.assign({}, def, { fs: "myopic" }))).results.plan, P), w8 = PG.foresightWords(V, Vm);
  ok(Vm.pv.total > V.pv.total && w8.indexOf(PG.bn(Vm.pv.total - V.pv.total) + " more") >= 0, "step 8: decade by decade costs more (" + PG.bn(Vm.pv.total - V.pv.total) + ")");
  ok(JSON.stringify(Vm) === JSON.stringify(lib("central", "myopic").view), "step 8's live run equals the library's entry");
  for (const k of E4.c4Shocks(P)) {
    const r = await run(Object.assign({}, def, { sh: k })), Xs = E4.shockView(r.results.shock, V, P), w = PG.shockWords(Xs, V);
    ok(w.indexOf(PG.bn(Math.abs(Xs.dPV))) >= 0 && (Xs.over > 0.5 ? /over the budget/.test(w) : /still within the budget/.test(w)) && JSON.stringify(Xs) === JSON.stringify(lib("central", "perfect").shocks[k]), "step 9, " + k + ": the words as run, equal to the library's");
  }
  const e = lib("central", "perfect"), n = lib("central-norule", "perfect"), w10 = PG.fullWords(e, n);
  const maxH = Math.max(...n.full.map(c => c.unservedHours));
  ok(/all four checks survive/.test(w10) === e.full.every(c => c.unservedMWh < 0.5 && Math.abs(c.gap) <= 0.1) && w10.indexOf("up to " + PG.kilo(maxH) + " hours") >= 0, "step 10: the full-year verdicts as the library has them");
  ok(T.indexOf("unserved for up to " + maxH + " hours in 2024's weather") >= 0 && n.full.find(c => c.unservedHours === maxH).weather === "2024", "the check card's 240 hours is the library's (" + maxH + ", in 2024's weather)");
  const nr = await E4.nearRange(P, def, E4.builtTerms(P, "solar", 4), 1e-6, { solver });
  ok(nr.ok && nr.lo <= nr.at + 1e-3 && nr.at <= nr.hi + 1e-3 && nr.hi - nr.lo >= 1000, "step 11: within a millionth of the cost, 2050 solar runs from " + (nr.lo / 1000).toFixed(2) + " to " + (nr.hi / 1000).toFixed(2) + " GW (at least a gigawatt wide; the plan shown " + (nr.at / 1000).toFixed(2) + ")");
  ok(PG.nearWords(nr, "solar in 2050").indexOf(PG.fix(nr.lo / 1000, 2) + " and " + PG.fix(nr.hi / 1000, 2) + " GW") >= 0, "step 11's words as run");

  // ---------------- the page frame
  ["steps", "explain", "check", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  ok(/data-learn="m13" data-src="\.\.\/assets\/learn\/data\/prairieland\.json \.\.\/assets\/learn\/data\/e4-pathways\.json \.\.\/assets\/learn\/data\/e4-library\.json \.\.\/assets\/learn\/data\/path\.json"/.test(PAGE), "data-src: the nation, the engine's settings, the library, the course map");
  ok(/m13-national-pathway\.js/.test(PAGE) && /learn\.js/.test(PAGE), "scripts");
  const NB = path.join(X.SITE, "learn/notebooks/m13-national-pathway.ipynb");
  ok(fs.existsSync(NB) && /href="notebooks\/m13-national-pathway\.ipynb" download/.test(PAGE) && /e4-library\.json" download/.test(PAGE) && /prairieland\.json" download/.test(PAGE) && /e4-pathways\.json" download/.test(PAGE), "the notebook and its three data files are offered for download");
  const NBT = fs.existsSync(NB) ? fs.readFileSync(NB, "utf8") : "";
  ok(/assert/.test(NBT) && /e4-library\.json/.test(NBT) && /Prairieland is fictional/.test(NBT), "the notebook asserts the browser's numbers from the library and carries the fictional line");
  ok(PAGE.indexOf(PL.about.line) >= 0 && JS.indexOf("P.line") >= 0, "the fictional line");
  ok(T.indexOf("twelve slices") >= 0 || /twelve \[\[time-slice/.test(JS), "twelve slices named");
  ok(!/firm[^.;\n]{0,50}nuclear|nuclear[^.;\n]{0,50}firm/i.test(T + JS) && !/reactor|\bSMR\b|small modular/i.test(PAGE + JS + NBT), "the firm option is never named nuclear; no reactor named (page, script, notebook)");
  ok(!/learning curve|learning rate|first[- ]of[- ]a[- ]kind/i.test(PAGE + JS + NBT), "no learning curves (G-COST)");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS + NBT), "no AI wording");

  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (M13)");
  process.exit(fails ? 1 : 0);
})();
