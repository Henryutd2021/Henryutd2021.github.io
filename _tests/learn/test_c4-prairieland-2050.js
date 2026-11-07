// test_c4-prairieland-2050.js — Node tests for capstone C4 (learn/c4-prairieland-2050.qmd, assets/learn/c4-prairieland-2050.js),
// on engine E4 (its own tests and the library's: test_e4-engine.js). What it checks:
//   - the plan: C4's schema is the engine's fields without the shock, plus four screening inputs whose ranges are A13's;
//     defaults and presets are valid and round-trip; a C4 plan maps to the engine's plan and to its library entry
//   - the no-JS blocks: the plan's table, the default pathway's results with its four shocks, affordability and jobs
//     (from the library), the brief's outline, the exemplars, the rubric, the inputs
//   - the run as the page does it, live and from the library: the same views; the four shocks re-planned; the reference
//     (policies as in 2025, the plan's own costs)
//   - screening affordability (LX.A13.allocate): households pay the share set of 2050's change against the reference, per
//     household and by group; the groups' charges add to the households' share; a negative change is a saving
//   - Ridge County's jobs (LX.A13.jobs): Ridge Station's staff and the mine jobs from coal mined at A13's ratio, new jobs from
//     the Ridge region's wind and solar; gross and net kept apart; recomputed by hand
//   - the words (says, the sensitivity line, the exemplars) true for every library plan, numbers as run
//   - the brief's checks (two pages, the fields) and its assumptions say what is left out (equipment, the stand-in groups)
//   - the page frame: capstone sections, scripts, data-src, the fictional line, the notebook's section 8; no reactor named,
//     the firm option never called nuclear; no AI wording
// --write: writes the marker blocks.
// Usage (from the site folder):  node _tests/learn/test_c4-prairieland-2050.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e4_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const QPATH = path.join(X.SITE, "learn/c4-prairieland-2050.qmd");

(async () => {
  const { E4, PL, cfg, P, SS, S: S4, L, solver, J } = await X.load();
  const PG = require(L("c4-prairieland-2050.js")), A13 = require(L("components/whopays.js"));
  const RN = require(L("components/reportnote.js")), EX = require(L("components/exemplars.js")), RB = require(L("components/rubric.js"));
  const A = J("a13-fairness-jobs.json"), PC = J("prairie-city.json"), LIB = J("e4-library.json");
  const S = PG.c4Schema(E4, P, A), def = SS.defaults(S);

  // ---------------- the plan
  let sok = true; try { SS.checkSchema(S); } catch (e) { sok = false; console.log(e.message); } ok(sok, "C4's schema is valid");
  ok(S.fields.length === S4.fields.length - 1 + 4 && !S.fields.some(f => f.id === "sh"), "C4's plan: the engine's fields without the shock, and four screening inputs");
  const fj = id => S.fields.find(f => f.id === id);
  ok(fj("jm").min === A.jobs.multiplier.min && fj("jm").max === A.jobs.multiplier.max && fj("jm").def === A.jobs.multiplier.start && fj("jd").def === A.jobs.displacement.start && fj("rc").values.join() === A.designs.map(d => d.key).join(), "the jobs multiplier, displacement and recovery designs are A13's");
  E4.presetsOf(P).forEach(pr => { const st = E4.withPreset(def, pr); ok(SS.validate(S, st).length === 0 && SS.decode(S, SS.encode(S, st)).status === "ok", "preset " + pr.id + " is a valid C4 plan and round-trips"); });
  const e0 = PG.libEntry(LIB, SS, E4, P, def), r0 = PG.libEntry(LIB, SS, E4, P, PG.refState(E4, P, def));
  ok(e0 && e0.preset === "central" && e0.foresight === "perfect" && r0 && r0.preset === "today" && r0.foresight === "perfect", "the default C4 plan is the library's central entry; its reference is the 'policies as in 2025' entry");
  ok(JSON.stringify(PG.toE4(E4, P, def)) === JSON.stringify(Object.assign(E4.defaults(S4), { sh: "none" })), "a C4 plan's engine fields are the Pathway Explorer's");

  // ---------------- the live run equals the library (the plan, its four shocks, the reference)
  const t = await E4.shockTest(PG.toE4(E4, P, def), P, { solver }), V = E4.view(t.results.plan, P), Xl = {};
  Object.keys(t.results.shocks).forEach(k => { Xl[k] = E4.shockView(t.results.shocks[k], V, P); });
  ok(JSON.stringify(V) === JSON.stringify(e0.view) && JSON.stringify(Xl) === JSON.stringify(e0.shocks), "the default plan solved live, with its four shocks, equals the library's entry");
  const rr = await E4.solve(PG.refState(E4, P, def), P, { solver }), Vr = E4.view(rr.results.plan, P);
  ok(JSON.stringify(Vr) === JSON.stringify(r0.view), "the reference solved live equals the library's");
  ok(Object.keys(Xl).join() === E4.c4Shocks(P).join() && E4.c4Shocks(P).join() === "gasSpike,drought,mineralBan,demandSurprise", "C4's four shocks: gas-price spike, drought, mineral export restriction, demand surprise (prairieland.json)");

  // ---------------- screening affordability
  const af = PG.afford(V, Vr, def, PL, PC, A13), hhN = PL.nation.people / PC.city.personsPerHousehold, dM = V.yearly[4].total - Vr.yearly[4].total;
  ok(near(af.dM, dM, 1e-9) && near(af.perHH, dM * 1e6 * def.hs / 100 / hhN, 1e-6) && af.year === 2050, "affordability: households pay " + def.hs + "% of 2050's change against the reference ($" + Math.round(dM) + "M a year), $" + Math.round(af.perHH) + " a household");
  const Hpc = af.rows.reduce((s, r) => s + r.households, 0), tot = af.rows.reduce((s, r) => s + r.group, 0);
  ok(near(tot, af.perHH * Hpc, 1e-6 * Math.abs(af.perHH * Hpc) + 1e-6), "the groups' charges add to the households' share (Prairie City's households as the stand-in)");
  ["kwh", "fixed", "income"].forEach(d => { const a2 = PG.afford(V, Vr, Object.assign({}, def, { rc: d }), PL, PC, A13); ok(near(a2.rows.reduce((s, r) => s + r.group, 0), tot, 1e-6 * Math.abs(tot) + 1e-6) && a2.design === d, "design " + d + ": the same total, spread differently"); });
  const a0 = PG.afford(V, Vr, Object.assign({}, def, { hs: 0 }), PL, PC, A13); ok(a0.rows.every(r => near(r.charge, 0)), "households paying 0% change no bill");
  ok(/Heat pumps and cars bought are not in it/.test(PG.says(V, Xl, af, PG.ridgeJobs(V, def, PL, A, A13))[3].text) && (af.perHH >= 0 ? /a cost/ : /a saving/).test(PG.says(V, Xl, af, PG.ridgeJobs(V, def, PL, A, A13))[3].text), "the affordability line says what is left out, and a cost or a saving as run");
  // ---------------- Ridge County's jobs
  const jb = PG.ridgeJobs(V, def, PL, A, A13), rc = PL.ridgeCounty, per = rc.a13.plant.mineJobs / rc.ridgeStationFuel2025PJ, coalLost = PL.balance.primary.coal - V.ridge.coal[4];
  const ri = PL.regions.findIndex(r => r.key === "ridge"), mw = (V.builtR[ri].wind + V.builtR[ri].solar) * 1000;
  ok(near(jb.mineLost, per * coalLost, 1e-9) && near(jb.newMW, mw, 1e-9) && jb.staff === rc.a13.plant.staff, "jobs inputs: " + Math.round(jb.mineLost) + " mine jobs (" + Math.round(coalLost) + " PJ less coal at " + per.toFixed(2) + " a PJ), Ridge Station's " + jb.staff + " staff, " + (mw / 1000).toFixed(1) + " GW built in the Ridge region");
  const lostHand = (jb.staff + jb.mineLost) * def.jm, newG = mw / 100 * A.jobs.omPer100MW.start * def.jm;
  ok(near(jb.j.lostTotal, lostHand, 1e-9) && near(jb.j.newPermGross, newG, 1e-9) && near(jb.j.newPermNet, newG * (1 - def.jd / 100), 1e-9) && near(jb.j.buildJobYearsNet, jb.j.buildJobYears * (1 - def.jd / 100), 1e-9), "jobs recomputed by hand: lost × multiplier, new gross and net of displacement, construction job-years gross and net");
  ok(V.ridge.closeP !== null, "Ridge Station closes before 2050 in the default pathway (its retirement year is 2037)");

  // ---------------- the words, for every library plan
  for (const e of LIB.plans) {
    const ref = LIB.plans.find(x => x.preset === "today" && x.foresight === "perfect").view, af2 = PG.afford(e.view, ref, def, PL, PC, A13), jb2 = PG.ridgeJobs(e.view, def, PL, A, A13), s = PG.says(e.view, e.shocks, af2, jb2), tag = e.preset + "/" + e.foresight;
    ok(s[0].text.indexOf(PG.bn(e.view.pv.total)) >= 0 && (e.view.over > 0.5) === /out of reach/.test(s[0].text), tag + ": the cost and carbon line as run");
    const sl = PG.sensLine(e.view, e.shocks), d = Object.values(e.shocks).map(x => x.dPV);
    ok(sl.indexOf(PG.sbn(Math.min(...d))) >= 0 && sl.indexOf(PG.sbn(Math.max(...d))) >= 0 && (Object.values(e.shocks).some(x => x.over > 0.5) ? /missed under/.test(sl) : /met under all four/.test(sl)), tag + ": the sensitivity line's range and the budget as run");
    ok(s[4].text.indexOf(PG.kilo(jb2.j.lostTotal) + " jobs lost") >= 0 && s[4].text.indexOf(PG.kilo(jb2.j.newPermNet) + " net") >= 0, tag + ": Ridge County's line, gross and net");
  }
  const exd = PG.exemplars(e0.view, e0.shocks, af, jb);
  let exOk = true; try { EX.validate(exd); } catch (er) { exOk = false; console.log(er.message); }
  ok(exOk && EX.plain(exd.answers[1]).indexOf(PG.bn(e0.view.pv.total)) >= 0 && EX.plain(exd.answers[1]).indexOf(PG.sensLine(e0.view, e0.shocks)) >= 0, "the strong exemplar quotes the default plan's run (cost, the shocks' line)");

  // ---------------- the blocks
  const fbRes = () => E4.fallbackHTML(e0.view, P, { date: LIB.date, label: "the default pathway (" + cfg.presets.find(p => p.id === "central").label + ")" }) +
    E4.tableHTML(["Shock (model year)", "Cost to 2050, against the plan", "CO₂ 2026–2050", "Imports that year", "Peak-hour rule that year", "Not served that year"], PG.shockRows(e0.view, e0.shocks), "c4-shocks") +
    E4.tableHTML(["Screening (A13's accounting layer)", "Value"], [["Households' change in 2050 at " + def.hs + "% (against the 2025-policies pathway; equipment left out)", (af.perHH >= 0 ? "+$" : "−$") + PG.kilo(Math.abs(af.perHH)) + " a household a year"],
      ["Ridge County: jobs lost (Ridge Station and the mines, × " + PG.fix(def.jm, 1) + ")", PG.kilo(jb.j.lostTotal)], ["Ridge County: new ongoing jobs, gross and net of " + def.jd + "% displacement", PG.kilo(jb.j.newPermGross) + " and " + PG.kilo(jb.j.newPermNet)],
      ["Ridge County: construction job-years, gross and net", PG.kilo(jb.j.buildJobYears) + " and " + PG.kilo(jb.j.buildJobYearsNet)]], "c4-screen");
  const BLOCKS = { "c4-plan": () => SS.staticHTML(S, def), "c4-results": fbRes, "c4-note": () => RN.outlineHTML(PG.FIELDS), "c4-exemplars": () => EX.staticHTML(exd), "c4-rubric": () => RB.staticHTML(PG.RUBRIC, { bar: PG.RUBRIC_BAR }), "c4-inputs": () => E4.inputsHTML(P) };
  if (process.argv.includes("--write")) { const b = {}; Object.keys(BLOCKS).forEach(k => { b[k] = BLOCKS[k](); }); X.writeBlocks(QPATH, b); console.log("wrote the c4 blocks"); }
  const PAGE = fs.readFileSync(QPATH, "utf8"), T = X.norm(PAGE), JS = fs.readFileSync(L("c4-prairieland-2050.js"), "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });

  // ---------------- the brief
  ok(PG.TWO_PAGES === 2 * RN.PAGE_WORDS, "two pages: twice the one-page note's words (" + PG.TWO_PAGES + ")");
  ok(PG.FIELDS.every(f => f.need) && PG.FIELDS[0].at === "top" && PG.FIELDS.some(f => /what would change/.test(f.label)), "the brief's fields: recommendation first; the uncertainty that would change it asked for");
  const as = PG.assumptions(def, af, jb);
  ok(as.some(x => /end-use equipment/.test(x)) && as.some(x => /Prairie City's five groups stand in/.test(x)) && as.some(x => /builds up to the shock's year are kept/.test(x)) && A13.ASSUME.split.every(x => as.indexOf(x) >= 0) && A13.ASSUME.jobs.every(x => as.indexOf(x) >= 0), "the assumptions: equipment left out, the stand-in groups, the shock rule, A13's own");
  ok(RB.COMPETENCES && PG.RUBRIC.every(c => RB.COMPETENCES.some(x => x.id === c.id)), "the rubric's competences are the course's");

  // ---------------- the page frame
  ["brief", "plan", "note", "selfcheck", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  ok(/data-learn="c4" data-src="\.\.\/assets\/learn\/data\/prairieland\.json \.\.\/assets\/learn\/data\/e4-pathways\.json \.\.\/assets\/learn\/data\/e4-library\.json \.\.\/assets\/learn\/data\/a13-fairness-jobs\.json \.\.\/assets\/learn\/data\/prairie-city\.json \.\.\/assets\/learn\/data\/path\.json"/.test(PAGE), "data-src: the nation, the engine, the library, A13's coefficients, Prairie City's groups, the course map");
  ok(/c4-prairieland-2050\.js/.test(PAGE) && /learn\.js/.test(PAGE), "scripts");
  const NB = fs.readFileSync(path.join(X.SITE, "learn/notebooks/m13-national-pathway.ipynb"), "utf8");
  ok(/## 8\. Your pathway \(the Modeler version of capstone C4\)/.test(NB) && /section 8/.test(PAGE), "the Modeler version points to the notebook's section 8, which is the C4 cell");
  ok(T.indexOf(PL.about.line) >= 0 && JS.indexOf("P.line") >= 0, "the fictional line");
  ok(!/firm[^.;\n]{0,50}nuclear|nuclear[^.;\n]{0,50}firm/i.test(T + JS) && !/reactor|\bSMR\b|small modular/i.test(PAGE + JS), "the firm option is never named nuclear; no reactor named");
  ok(!/learning curve|learning rate|first[- ]of[- ]a[- ]kind/i.test(PAGE + JS), "no learning curves (G-COST)");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS), "no AI wording");

  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (C4)");
  process.exit(fails ? 1 : 0);
})();
