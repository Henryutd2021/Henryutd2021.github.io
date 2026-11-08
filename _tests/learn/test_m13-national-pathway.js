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
//     peak-hour rule; the page's "240 hours"); the near-optimal ranges, solved live in one click (E4.nearRanges: the
//     plan's LP once, two LPs a choice; the same numbers as one nearRange per choice; 2050 solar at least a gigawatt wide,
//     the plan shown inside each)
//   - the cost: the static table's boundary, the reported cost's existing-fleet upkeep, the gas rule and the retirement
//     convention in words, the dated correction line against the library
//   - the details: the budget's price by model year is dual x w / D (the engine's test also checks it against
//     the gas row's dual), Hotelling's path shown apart; out-of-reach budgets have no dual and say so; the closest pathway;
//     early retirement for one year, never summed; near-optimal choices are cohorts; the full-year criteria; the budget
//     gap with A20 recomputed (build-rate and transmission limits x100; A20's electrification path in a copy of the
//     engine); the flowchart; every displayed symbol defined; no editorial guard code
//   - the page frame: sections, scripts, data-src, the notebook and its downloads, the fictional line; no reactor named,
//     the firm option never called nuclear; no AI wording
// --write: writes the marker blocks.
// Usage (from the site folder):  node _tests/learn/test_m13-national-pathway.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const X = require("./e4_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const QPATH = path.join(X.SITE, "learn/m13-national-pathway.qmd");

(async () => {
  const { E4, PL, cfg, P, SS, S, L, solver, J } = await X.load();
  const PG = require(L("m13-national-pathway.js"));
  const LIB = JSON.parse(fs.readFileSync(L("data/e4-library.json"), "utf8")), def = SS.defaults(S), rate = def.dr / 100;
  const lib = (pr, fs) => LIB.plans.find(e => e.preset === pr && e.foresight === fs);
  const row = (label, e) => { const V = e.view, F = e.full, vs = F.map(c => E4.fullVerdict(c)), bad = vs.filter(v => !v.ok).length, un = Math.max(...F.map(c => c.unservedHours));
    const why = [vs.some(v => !v.served) ? "demand unserved, up to " + PG.kilo(un) + " hours" : null, vs.some(v => !v.near) ? "CO₂ more than 10% above the slices" : null].filter(Boolean).join("; ");
    return [label, PG.bn(V.pv.total), PG.kilo(V.cum) + " of " + PG.kilo(V.budget) + " Mt", PG.pct(Math.max(...V.imp)), bad ? bad + " of 4 checks fail (" + why + ")" : "all 4 checks survive"]; };
  const STATIC = () => E4.tableHTML(["Pathway", "Cost to 2050 (present value)", "CO₂ 2026–2050", "Imports, highest year", "Full years of hours (2030, 2050; 2025 and 2024 weather)"],
    [row("Central, perfect foresight", lib("central", "perfect")), row("Central, decade by decade", lib("central", "myopic")), row("Deep cuts (3,000 Mt), perfect foresight", lib("deep", "perfect")), row("Central without the peak-hour rule", lib("central-norule", "perfect"))], "m13-table") +
    '<p class="lx-hint">Precomputed with this engine on ' + LIB.date + ". Cost: the supply side and every fuel bought, 2026–2050 in 2025 dollars, with the existing wind, solar and batteries' upkeep; end-use equipment left out.</p>";
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
    // the budget's price in each model year comes from the LP's coefficients: the goal's yearly costs weigh D_p, the budget
    // row's CO2 weighs w_p (the engine's test checks the same numbers against the gas row's dual)
    const Sx2 = E4.sysOf(def, P), Vd = lib("central", "perfect").view, cp = PG.carbonPath(Vd.carbonValue[0], Sx2.w, Sx2.D), hp = PG.hotelling(Vd.carbonValue[0], rate, P.Y);
    ok(cp.every((x, p) => Math.abs(x - Vd.carbonPrice[p]) <= 0.06 + 0.05 * Sx2.w[p] / Sx2.D[p]) && cp[4] < cp[3] && hp[4] / hp[0] > 2.5, "the budget's price, dual x w / D: $" + cp.map(x => x.toFixed(0)).join(", $") + " (2050 counts three years of CO2 against five of costs, so it drops); Hotelling's every-year path for comparison: $" + hp.map(x => x.toFixed(0)).join(", $"));
    const cps = PG.carbonPath(Vd.carbonValue[0], E4.sysOf(Object.assign({}, def, { acc: "step" }), P).w, Sx2.D); ok(cps.every((x, p) => p === 0 || Math.abs(x / cps[p - 1] - Math.pow(1 + rate, 5)) < 1e-9), "with step counting the LP's price rises at the discount rate between model years (×" + Math.pow(1 + rate, 5).toFixed(3) + " a period)");
    ok(/V\.carbonPrice/.test(JS) && /Hotelling's rule in a model of every year/.test(JS) && /\[\[capital-recovery-factor\|/.test(JS) && !/× \(1 \+ rate\)\^\(t − 2025\)\. Move/.test(JS), "step 6 shows the LP's price and Hotelling's path apart; the step text no longer states the endpoint formula");
  }

  // ---------------- the steps' runs and words
  const run = async st => { const r = await E4.solve(st, P, { solver }); ok(r.ok, JSON.stringify(st).slice(0, 50) + "…: optimal"); return r; };
  const r5 = await run(def), V = E4.view(r5.results.plan, P), w5 = PG.runWords(V);
  ok(w5.indexOf(PG.bn(V.pv.total)) >= 0 && w5.indexOf(PG.kilo(V.cum) + " Mt") >= 0 && w5.indexOf(PG.fix(V.built.wind.reduce((a, b) => a + b, 0), 1) + " GW of wind") >= 0, "step 5: the central pathway's words as run");
  ok(JSON.stringify(V) === JSON.stringify(lib("central", "perfect").view), "step 5's live run equals the library's central entry");
  const sweep = [];
  for (const b of [5400, 3600, 2600]) { const V2 = E4.view((await run(Object.assign({}, def, { bud: b }))).results.plan, P); sweep.push({ budget: b, pv: V2.pv.total, cum: V2.cum, over: V2.over, dual: V2.carbonValue[0] }); }
  ok(sweep[0].dual <= sweep[1].dual && sweep[0].pv <= sweep[1].pv && sweep[1].pv <= sweep[2].pv, "step 6: a tighter budget costs more and its dual rises ($" + sweep.map(s => s.dual == null ? "none" : s.dual.toFixed(0)).join(", $") + "; the closest pathway to 2,600 Mt costs " + PG.bn(sweep[2].pv) + ")");
  ok(sweep[2].over > 0.5 && sweep[2].dual === null && PG.sweepWords(sweep).indexOf("2,600 Mt is out of reach with these levers: no pathway emits less than " + PG.kilo(sweep[2].cum) + " Mt, so the budget has no marginal value") >= 0 && /none: out of reach/.test(JS) && /E4\.GAP\[1\]/.test(JS),
    "step 6: the slider's 2,600 Mt at central electrification is out of reach (closest " + sweep[2].cum + " Mt): no dual, and the words, the readout and the A20 note say so");
  const DEEP = E4.withPreset(def, cfg.presets.find(p => p.id === "deep")), LINE = PL.carbon.budget.presets.find(x => x.key === "line2050");
  ok(DEEP.eb === P.elRange.buildings.hi && DEEP.et === P.elRange.transport.hi && DEEP.ei === P.elRange.industry.hi, "step 7 uses the most electrification the data allows");
  const st7 = Object.assign({}, DEEP, { bud: LINE.mt }), V7 = E4.view((await run(st7)).results.plan, P), S7 = E4.sysOf(st7, P), w7 = PG.deepWords(V7, S7, LINE.mt);
  ok(V7.over > 0.5 && w7.indexOf(PG.kilo(V7.over) + " Mt over") >= 0 && w7.indexOf("no pathway emits less than " + PG.kilo(V7.cum) + " Mt") >= 0, "step 7: the straight line to zero (" + LINE.mt + " Mt) is out of reach by " + V7.over + " Mt: the prediction's answer is no");
  // the budget gap with A20 (E4.GAP, shown on SB4, M13 and C4): the floor about 2,700 Mt; the build-rate and transmission
  // limits lifted a hundredfold move it by about 5 Mt; A20's electrification path inside a copy of the engine lowers it to
  // about 2,400 Mt and meets 2,600 Mt
  {
    const floor = async (EE, PP) => { const st = Object.assign({}, EE.defaults(EE.schema(PP)), { eb: PP.elRange.buildings.hi, et: PP.elRange.transport.hi, ei: PP.elRange.industry.hi, bud: 500 }); return EE.view((await EE.solve(st, PP, { solver })).results.plan, PP).cum; };
    const f0 = await floor(E4, P), PLx = JSON.parse(JSON.stringify(PL));
    for (const k in PLx.costs.buildLimits.gwPerRegionPerPeriod) PLx.costs.buildLimits.gwPerRegionPerPeriod[k] *= 100; PLx.transmission.expansion.maxAddMWPerPeriod *= 100;
    const f1 = await floor(E4, E4.prepare(PLx, cfg));
    const SRC = fs.readFileSync(L("components/engine-e4.js"), "utf8"), pat = "z = Z[k] * (y - P.base) / (2050 - P.base)";
    const ctx = { module: { exports: {} } }; vm.runInNewContext(SRC.replace(pat, "z = (function () { var s0 = P.sigma0[k], e50 = s0 + Z[k] * (1 - s0), e = Math.min(e50, s0 + 0.15 * (y - P.base) / 5); return Math.max(0, (e - s0) / (1 - s0)); })()"), ctx);
    const EA = ctx.module.exports, PA = EA.prepare(PL, cfg), f2 = await floor(EA, PA);
    const stA = Object.assign({}, EA.defaults(EA.schema(PA)), { eb: PA.elRange.buildings.hi, et: PA.elRange.transport.hi, ei: PA.elRange.industry.hi, bud: 2600 }), VA = EA.view((await EA.solve(stA, PA, { solver })).results.plan, PA);
    ok(SRC.indexOf(pat) >= 0 && Math.round(f0 / 100) * 100 === 2700 && f0 - f1 >= 2 && f0 - f1 <= 8 && Math.round(f2 / 100) * 100 === 2400 && VA.over === 0 && /about 5 Mt/.test(E4.GAP[2]) && /about 2,400 Mt/.test(E4.GAP[2]),
      "the gap with A20: the floor " + f0 + " Mt; limits x100: " + f1 + " Mt (" + (f0 - f1) + " Mt lower); A20's electrification path inside the engine: " + f2 + " Mt, and 2,600 Mt met ($" + (VA.pv.total / 1000).toFixed(1) + " bn)");
  }
  const rem = PG.remains(S7); ok(w7.indexOf(PG.kilo(rem.oil) + " PJ of oil products") >= 0 && rem.oil > 300 && rem.gas > 100, "step 7: the fuel left in 2050 as the engine's demand has it (" + PG.kilo(rem.oil) + " PJ oil, " + PG.kilo(rem.gas) + " PJ gas, " + PG.kilo(rem.coal) + " PJ coal)");
  ok(/answer: "no"/.test(JS), "the prediction's answer is no");
  const Vm = E4.view((await run(Object.assign({}, def, { fs: "myopic" }))).results.plan, P), w8 = PG.foresightWords(V, Vm);
  ok(Vm.pv.total > V.pv.total && w8.indexOf(PG.bn(Vm.pv.total - V.pv.total) + " more") >= 0, "step 8: decade by decade costs more (" + PG.bn(Vm.pv.total - V.pv.total) + ")");
  ok(Math.abs(Vm.early[0] - V.early[0]) <= 0.05 || w8.indexOf(PG.fix(Vm.early[0], 1) + " GW of fossil plants retired early by 2030") >= 0, "step 8: early retirement for 2030 (" + Vm.early[0] + " GW decade by decade, " + V.early[0] + " GW with perfect foresight), never summed over the years");
  ok(JSON.stringify(Vm) === JSON.stringify(lib("central", "myopic").view), "step 8's live run equals the library's entry");
  for (const k of E4.c4Shocks(P)) {
    const r = await run(Object.assign({}, def, { sh: k })), Xs = E4.shockView(r.results.shock, V, P), w = PG.shockWords(Xs, V);
    ok(w.indexOf(PG.bn(Math.abs(Xs.dPV))) >= 0 && (Xs.over > 0.5 ? /over the budget/.test(w) : /still within the budget/.test(w)) && JSON.stringify(Xs) === JSON.stringify(lib("central", "perfect").shocks[k]), "step 9, " + k + ": the words as run, equal to the library's");
  }
  const e = lib("central", "perfect"), n = lib("central-norule", "perfect"), w10 = PG.fullWords(e, n, E4);
  ok(/two tests: all demand served, and the year's CO₂ within 10% of the slices' \(a tolerance set for teaching\)/.test(JS) && /not the cumulative budget, not adequacy/.test(JS) && E4.FULL_TOL === 0.1, "step 10 names both pass criteria, the 10% as a teaching choice, and what the check does not test");
  const maxH = Math.max(...n.full.map(c => c.unservedHours));
  ok(/all four checks pass both tests/.test(w10) === e.full.every(c => c.unservedMWh < 0.5 && Math.abs(c.gap) <= 0.1) && w10.indexOf("up to " + PG.kilo(maxH) + " hours") >= 0, "step 10: the full-year verdicts as the library has them");
  ok(T.indexOf("unserved for up to " + maxH + " hours in 2024's weather") >= 0 && n.full.find(c => c.unservedHours === maxH).weather === "2024", "the check card's 240 hours is the library's (" + maxH + ", in 2024's weather)");
  // step 11's near-optimal ranges, solved live in one click: the plan's LP, the same LP without the tie rule (the least
  // economic cost), then two LPs a choice over the plans whose economic cost is within a millionth of the least; the same
  // LPs, and so the same numbers, as one nearRange per choice
  const list = Object.keys(PG.NEAR).map(k => [k, E4.builtTerms(P, PG.NEAR[k].t, PG.NEAR[k].q)]), NRL = await E4.nearRanges(P, def, list, 1e-6, { solver });
  ok(NRL.ok && NRL.solves === 8, "step 11: one click solves eight LPs (the plan, its least cost without the tie rule, then the least and the most of three choices)");
  for (const [k, t] of list) { const r1 = await E4.nearRange(P, def, t, 1e-6, { solver }); const a = NRL.items[k];
    ok(r1.ok && a && Math.abs(r1.lo - a.lo) < 1e-6 && Math.abs(r1.hi - a.hi) < 1e-6 && Math.abs(r1.at - a.at) < 1e-6 && r1.slack === a.slack, "near-optimal " + k + ": the shared run equals nearRange (" + (a.lo / 1000).toFixed(2) + " to " + (a.hi / 1000).toFixed(2) + " GW)"); }
  const Vc = lib("central", "perfect").view, ns = NRL.items.solar;
  ok(ns.objective <= Vc.pv.total + 0.5 && Vc.pv.total - ns.objective < 1 && Math.abs(ns.slack - 1e-6 * ns.objective) < 1e-9, "the least cost is the economic cost the page reports, without the tie rule, with the existing fleet's upkeep ($" + ns.objective.toFixed(3) + "M; the plan shown $" + Vc.pv.total + "M)");
  ok(Object.keys(NRL.items).every(k => { const x = NRL.items[k]; return x.costLo <= x.objective + x.slack + 1e-6 && x.costHi <= x.objective + x.slack + 1e-6 && x.costAt <= x.objective + x.slack + 1e-6; }),
    "every endpoint plan, and the plan shown, costs at most a millionth more than the least economic cost (solar's ends: +$" + (ns.costLo - ns.objective).toFixed(3) + "M and +$" + (ns.costHi - ns.objective).toFixed(3) + "M; allowance $" + ns.slack.toFixed(3) + "M)");
  ok(ns.lo <= ns.at + 0.1 && ns.at <= ns.hi + 0.1 && ns.hi - ns.lo >= 1000, "step 11: within a millionth of the cost, new solar in 2046–2050 runs from " + (ns.lo / 1000).toFixed(2) + " to " + (ns.hi / 1000).toFixed(2) + " GW (at least a gigawatt wide; the plan shown " + (ns.at / 1000).toFixed(2) + ")");
  ok(PG.nearWords(ns, PG.NEAR.solar.label).indexOf(PG.fix(ns.lo / 1000, 2) + " to " + PG.fix(ns.hi / 1000, 2) + " GW of new solar in 2046–2050") >= 0 && /E4\.nearRanges\(P, st, list, 1e-6/.test(JS) && !/m13near|too slow for a phone click/.test(JS) && !("precomputed" in cfg && cfg.precomputed && cfg.precomputed.m13near), "step 11 runs live (E4.nearRanges), labelled as one build cohort (2046–2050); no precomputed ranges left");
  ok(Object.keys(NRL.items).every(k => NRL.items[k].lo <= NRL.items[k].at + 0.1 && NRL.items[k].at <= NRL.items[k].hi + 0.1), "every range holds the plan shown");

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
  ok(!/learning curve|learning rate|first[- ]of[- ]a[- ]kind/i.test(PAGE + JS + NBT), "no learning curves (costs are fixed ranges; none changes with deployment)");
  ok(/LX\.Flowchart\(/.test(JS) && /Qualified conclusions/.test(JS), "the explain layer has its flowchart: inputs, decisions, rules, solve, limits met?, hourly checks, qualified conclusions");
  ["$y_p$, $i$", "$c_f$", "$\\alpha_{g,s}$", "$\\lambda_\\ell$", "$x^{\\text{dis}}$"].forEach(sy => ok(PAGE.indexOf("| " + sy) >= 0, "the symbol table defines " + sy));
  ok(/\\frac\{A_g\}\{1000\}/.test(PAGE) && /x\^\{\\text\{dis\}\}_\{r,s,p\} - x\^\{\\text\{ch\}\}_\{r,s,p\}/.test(PAGE) && /u_\{r,s,p\} = L_\{r,p\}/.test(PAGE) && /links\} \+ \\text\{penalties\}/.test(PAGE), "the formulation: A_g / 1000 for $M, batteries and unserved energy in the balance, links, penalties and ties in the goal");
  ok(/Busbar load: the electricity/.test(JS) && /\[\[capital-recovery-factor\|/.test(JS) && /operation and maintenance \(O&M\)/.test(JS) && /liquefied natural gas/.test(JS) && /Hotelling's rule/.test(JS), "busbar, the capital recovery factor, O&M, LNG and Hotelling's rule are defined where they appear");
  ok(!/G-COST|G-NUC|G-GIS/.test(T + JS.replace(/\/\/.*$/gm, "")), "no editorial guard code on the page or in its strings");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS + NBT), "no AI wording");
  // the cost, the gas rule and the fleet, in words; the dated correction
  ok(PAGE.indexOf("The reported cost adds the existing wind, solar and batteries' fixed O&M, a constant that moves no decision.") >= 0 && T.indexOf("Also left out: the upkeep of the existing hydro and steady plants (the data give no figure; the same in every pathway).") >= 0, "the reported cost's existing-fleet upkeep, and what is left out");
  ok(!/domestic first/.test(PAGE + JS + NBT) && T.indexOf("fuels bought at least cost") >= 0 && T.indexOf("The LP buys domestic gas and LNG in the least-cost mix within the import cap, so under a tight budget LNG can win: the national inventory counts the gas burned in domestic fields, not LNG's upstream emissions abroad.") >= 0, "one gas rule in words: least cost within the cap, and why LNG can win under a tight budget; no 'domestic first'");
  ok(T.indexOf("so it leaves in the five-year period that contains that year: a conservative simplification.") >= 0 && /conservative simplification/.test(NBT), "the retirement convention, on the page and in the notebook");
  const corr = X.correction(E4, LIB, PL); ok(T.indexOf(corr.text) >= 0, "the dated correction line, from the library: " + corr.text);

  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (M13)");
  process.exit(fails ? 1 : 0);
})();
