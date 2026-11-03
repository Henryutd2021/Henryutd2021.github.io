// test_a22-tradeoff-explorer.js — Node tests for A22 (assets/learn/a22-tradeoff-explorer.js, data/a22-tradeoff-explorer.json)
// and every number that learn/a22-tradeoff-explorer.qmd states. The plans' years come from lesson 13's model
// (assets/learn/13-capstone.js), solved here with the vendored HiGHS.
//   - inputs: the RECS household shares, the reserve-margin capacity values, the 450 MW peak
//   - the nine plans: each precomputed year matches a fresh full-year solve; C's peakers never run; H is the only plan short
//   - measures: the low-income share formula for the three tariffs, the reserve margin rule, the gas and largest shares
//   - dominance: only C is beaten (by D) with the first definitions; five of nine on cost and CO2 alone; the rescues and
//     the narrowest escape; how the unbeaten set changes with each alternative definition
//   - picks of the five priority sets under each definition; the step 1 prediction; step 3's conflict counter
//   - the limits model: infeasible at 200 kt, 25% gas and a 33% share under a fixed charge per home, feasible with the
//     income-graduated charge or a 34.5% share; the solved plan meets its limits on the seven weeks
//   - the fallback table, the Go deeper numbers, the myths, the quick question, the numbers to remember, the practice
//   - wording: illustrative labels, sources with dates, the radar's text version
// Usage (from the site folder):  node _tests/learn/test_a22-tradeoff-explorer.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
const { core, VERSION } = sctx.module.exports;
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const TP = require(L("13-capstone.js"));
const M = require(L("a22-tradeoff-explorer.js"));
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const cfg = JSON.parse(fs.readFileSync(L("data/13-capstone.json"), "utf8"));
const A = JSON.parse(fs.readFileSync(L("data/a22-tradeoff-explorer.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const page = fs.readFileSync(path.join(SITE, "learn/a22-tradeoff-explorer.qmd"), "utf8");
const JS = fs.readFileSync(L("a22-tradeoff-explorer.js"), "utf8");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const onPage = (s, what) => ok(page.includes(s), `page states ${what}: "${s}"`);
const onJS = (s, what) => ok(JS.includes(s), `script says ${what}: "${s}"`);
const musd = v => "$" + (v / 1e6).toFixed(1) + "M", kt = v => Math.round(v / 1e3).toLocaleString("en-US") + " kt";
const pct = (x, d) => (x * 100).toFixed(d == null ? 0 : d) + "%";
const DEF = { rel: "unserved", fair: "fixed", sec: "gas" };
const ALT = { graded: { rel: "unserved", fair: "graded", sec: "gas" }, flat: { rel: "unserved", fair: "flat", sec: "gas" },
              largest: { rel: "unserved", fair: "fixed", sec: "largest" }, rm: { rel: "rm", fair: "fixed", sec: "gas" } };
// the page's own formatting of a measure (as val() in the script)
function val(m, axis, defs) {
  const k = M.axisKey(axis, defs), v = M.shown(M.axisValue(m, axis, defs), k);
  return k === "cost" ? musd(v) : k === "co2" ? kt(v) : k === "unserved" ? Math.round(v).toLocaleString("en-US") + " MWh" : k === "fair" ? pct(v, 1) : pct(v);
}

(async () => {
  const highs = await loadHighs();
  const solve = (m) => core.solveWith(highs, m, { timeLimit: 600 });
  const Y = TP.prepareYear(year, T, cfg, pctx.module.exports.townProfile), C = TP.costs(cfg, {}), RW = TP.selectWeeks(Y, cfg.weeks), per = TP.periodsOf(RW);
  const g = A.groups;
  const D = { cv: M.capValues(Y, A.reserve.hours), peak: Y.peak, groups: { homes: g.homesM / g.totalHomesM, use: g.kwhB / g.totalKwhB }, graded: A.graded, batteryHours: A.reserve.batteryHours };
  const LIB = A.plans.map(p => ({ id: p.id, m: p.m, plan: M.blank(p.plan) })), BY = {};
  LIB.forEach(p => { BY[p.id] = p; });

  // ---------------- inputs
  ok(near(D.groups.homes, 0.34655, 1e-4) && pct(D.groups.homes, 1) === "34.7%", "low-income homes: 42.81 of 123.53 million = 34.7% (RECS 2020 CE2.1)");
  ok(near(D.groups.use, 0.29579, 1e-4) && pct(D.groups.use, 1) === "29.6%", "their electricity: 386 of 1,305 billion kWh = 29.6%");
  ok(4.48 + 4.01 + 10.25 + 24.07 === 42.81 || near(4.48 + 4.01 + 10.25 + 24.07, 42.81, 1e-9), "42.81 = the four RECS brackets under $40,000");
  ok(40 + 32 + 86 + 228 === 386, "386 billion kWh = the four brackets' electricity");
  ok(near(D.peak, 450, 1e-6) && A.peakMW === 450, "the year's peak demand is 450 MW");
  ok(near(D.cv.wind, A.reserve.cv.wind, 1e-6) && near(D.cv.solar, A.reserve.cv.solar, 1e-6), "the stored capacity values match the 100 highest-demand hours");
  ok(pct(D.cv.wind) === "37%" && pct(D.cv.solar) === "71%", `capacity values: wind ${pct(D.cv.wind)}, solar ${pct(D.cv.solar)}`);
  const gA = D.groups.homes * D.graded / (D.groups.homes * D.graded + 1 - D.groups.homes);
  ok(pct(gA, 1) === "21.0%", `income-graduated: low-income homes pay ${pct(gA, 1)} of the fixed charges`);

  // ---------------- each plan's year, re-solved on all 8,760 hours
  for (const p of A.plans) {
    const plan = M.blank(p.plan), r = solve(TP.fullYearModel(C, Y, { plan }));
    ok(r.ok, `plan ${p.id}: full-year solve ${r.status}`);
    const m = M.measure(C, Y, r, plan, D), s = p.m;
    ok(near(m.cost, s.cost, 1) && near(m.co2, s.co2, 1) && near(m.unserved, s.unserved, 0.1) && m.hoursShort === s.hoursShort, `plan ${p.id}: ${musd(m.cost)}, ${kt(m.co2)}, ${Math.round(m.unserved)} MWh unserved match the stored year`);
    ok(near(m.gas, s.gas, 1e-5) && near(m.largest, s.largest, 1e-5) && near(m.rm, s.rm, 1e-6) && near(m.f, s.f, 1e-5), `plan ${p.id}: shares, reserve margin and fixed-cost fraction match`);
    ok(["fixed", "graded", "flat"].every(t => near(m.fair[t], s.fair[t], 1e-5)), `plan ${p.id}: the three low-income shares match`);
    const S = TP.summarize(C, [{ demand: Y.demand, wind: Y.wind, solar: Y.solar, weight: 1 }], r, { plan });
    ok(near(S.cost, m.cost, 1) && near(S.co2, m.co2, 1), `plan ${p.id}: measure() agrees with lesson 13's summarize()`);
    ok(near(m.shares.wind + m.shares.solar + m.shares.nuc + m.shares.gas, 1, 1e-9), `plan ${p.id}: source shares sum to 1`);
    // the low-income share formula, by hand
    ok(near(m.fair.fixed, D.groups.homes * m.f + D.groups.use * (1 - m.f), 1e-12) && near(m.fair.flat, D.groups.use, 1e-12) && near(m.fair.graded, gA * m.f + D.groups.use * (1 - m.f), 1e-12), `plan ${p.id}: the share follows the tariff formula`);
    if (p.id === "C") ok(S.energy.pk === 0, "plan C's 80 MW of peakers never run in 2025");
    if (p.id === "H") ok(m.unserved > 1000 && m.hoursShort === 78, `plan H leaves ${Math.round(m.unserved)} MWh unserved in ${m.hoursShort} hours`);
    else ok(m.unserved < 0.5, `plan ${p.id}: every hour served`);
  }
  const rmC = M.reserveMargin(BY.C.plan, D.cv, D.peak, 4);
  ok(near(rmC, (300 + 80 + 600 * D.cv.wind + 200 * D.cv.solar + 100) / 450 - 1, 1e-12), "plan C's reserve margin by the stated rule");
  ok(near(M.reserveMargin({ wind: 0, solar: 0, cc: 0, pk: 0, nuc: 0, bp: 100, be: 200 }, D.cv, 450, 4), 50 / 450 - 1, 1e-12), "a 2-hour battery counts at MWh / 4");

  // ---------------- dominance
  const dom = M.dominated(LIB, DEF), un = M.unbeaten(LIB, DEF), d2 = M.dominated(LIB, DEF, ["cost", "co2"]);
  ok(JSON.stringify(dom) === JSON.stringify({ C: ["D"] }) && un.join() === "A,B,D,E,F,G,H,I", "first definitions: only C is beaten, by D; 8 of 9 unbeaten");
  ok(Object.keys(d2).join() === "B,C,E,F,G" && d2.B.join() === "H" && d2.F.join() === "I", "cost and CO₂ alone: B, C, E, F, G beaten (5 of 9)");
  const rs = M.rescued(LIB, DEF, A.scales);
  ok(rs.list.map(r => r.id).join() === "B,E,F,G", "rescued by the other three goals: B, E, F, G (4 plans)");
  ok(rs.list.find(r => r.id === "B").axes.join() === "rel,fair" && rs.list.find(r => r.id === "G").axes.join() === "fair", "B escapes on Reliable and Fair; G on Fair only");
  ok(rs.narrow.id === "G" && rs.narrow.key === "fair" && near(rs.narrow.g, 0.003, 1e-9) && pct(rs.narrow.v, 1) === "34.0%" && pct(rs.narrow.vs, 1) === "34.3%", "narrowest escape: G by 0.3 points of the low-income share (34.0% against 34.3%)");
  ok(BY.C.m.cost - BY.D.m.cost > 5.8e6 && val(BY.C.m, "co2", DEF) === val(BY.D.m, "co2", DEF) && ["rel", "fair", "sec"].every(a => val(BY.C.m, a, DEF) === val(BY.D.m, a, DEF)), "C and D show the same four values; D is $5.9M cheaper");
  ok(musd(M.shown(BY.C.m.cost, "cost") - M.shown(BY.D.m.cost, "cost")) === "$5.9M", "the cost gap as shown: $5.9M");
  const exp = { graded: { C: ["D"], E: ["C", "D"], F: ["I"], G: ["C", "D"] }, flat: { C: ["D"], E: ["C", "D"], F: ["I"], G: ["C", "D"] }, largest: { C: ["D"] }, rm: {} };
  Object.keys(ALT).forEach(k => ok(JSON.stringify(M.dominated(LIB, ALT[k])) === JSON.stringify(exp[k]), `${k}: beaten ${JSON.stringify(exp[k])}`));
  // adding a goal never knocks a plan out: unbeaten on two goals implies unbeaten on five, for every definition
  [DEF].concat(Object.values(ALT)).forEach(df => { const u2 = M.unbeaten(LIB, df, ["cost", "co2"]), u5 = M.unbeaten(LIB, df); ok(u2.every(id => u5.includes(id)), "more goals only rescue plans"); });

  // ---------------- picks
  const pk = (df) => A.priorities.map(p => p.id + ":" + M.pick(LIB, p.w, df, A.scales).id).join();
  ok(pk(DEF) === "bills:A,climate:I,lights:D,supply:I,equal:D", "first definitions: Bills first A, Climate first I, Lights first D, Supply first I, Equal weights D");
  ok(pk(ALT.graded) === "bills:B,climate:I,lights:D,supply:I,equal:D", "income-graduated: Bills first moves to B");
  ok(pk(ALT.largest) === "bills:A,climate:I,lights:G,supply:G,equal:G", "largest source: Lights, Supply and Equal move to G");
  ok(pk(ALT.rm) === "bills:C,climate:I,lights:I,supply:I,equal:C", "reserve margin: Bills and Equal pick C, Lights picks I");
  A.priorities.forEach(p => ok(near(Object.values(p.w).reduce((s, x) => s + x, 0), 100, 1e-9), `${p.label}: weights sum to 100`));
  [DEF].concat(Object.values(ALT)).forEach(df => A.priorities.forEach(p => ok(M.unbeaten(LIB, df).includes(M.pick(LIB, p.w, df, A.scales).id), "every positive-weight pick is unbeaten")));

  // ---------------- step 1: adding 300 MW of wind to plan A (plan B)
  const mv = M.moves(BY.A.m, BY.B.m, DEF);
  ok(mv.co2 > 0 && mv.sec > 0 && mv.cost < 0 && mv.fair < 0 && mv.rel === 0, "A → B: Clean and Secure better, Cheap and Fair worse, Reliable the same (the predicted answer 'mixed')");
  ok(BY.B.plan.wind === 300 && BY.B.plan.cc === BY.A.plan.cc && BY.B.plan.pk === BY.A.plan.pk, "plan B is plan A plus 300 MW of wind");
  onJS('answer: "mixed"', "the step 1 answer");
  const cf = M.conflicts([{ from: BY.A.m, to: BY.B.m }, { from: BY.B.m, to: BY.D.m }, { from: BY.D.m, to: BY.C.m }, { from: BY.C.m, to: BY.D.m }], DEF);
  ok(cf.top === "cost|co2" && cf.pairs["cost|co2"] === 2 && cf.free === 1, "conflict counter: cost against CO₂ twice; C → D is a free gain");

  // ---------------- scores, scales and the Go deeper numbers
  const sc = A.scales;
  ok(sc.cost.best === 100e6 && sc.cost.worst === 250e6 && sc.co2.worst === 850e3 && sc.unserved.worst === 2000 && sc.fair.best === 0.2 && sc.fair.worst === 0.35 && sc.gas.worst === 1, "the stated scales");
  onPage("cost $100M and $250M a year; CO₂ 0 and 850 kt; unserved energy 0 and 2,000 MWh; low-income share 20% and 35%; gas share 0% and 100%", "the scales");
  ok(Math.round((sc.cost.worst - sc.cost.best) / (sc.co2.worst - sc.co2.best)) === 176, "equal weights: $150M against 850 kt ≈ $176 a tonne");
  onPage("One spoke of cost ($150M) counts as much as one spoke of CO₂ (850 kt): about $176 a tonne", "the implied price");
  const fairs = LIB.map(p => p.m.fair.fixed), fs_ = LIB.map(p => M.scores(p.m, DEF, sc).fair);
  ok(pct(Math.min(...fairs), 1) === "31.3%" && pct(Math.max(...fairs), 1) === "34.6%" && Math.min(...fs_).toFixed(2) === "0.03" && Math.max(...fs_).toFixed(2) === "0.25", "fixed charge per home: shares 31.3% to 34.6%, Fair scores 0.03 to 0.25");
  onPage("every plan's low-income share lies between 31.3% and 34.6%, so Fair scores span only 0.03 to 0.25", "the squeezed spoke");
  onPage("| Fixed charge per home | 34.7% (their share of homes) | $34.7\\%\\,\\phi + 29.6\\%\\,(1-\\phi)$ |", "the tariff table, fixed");
  onPage("| Income-graduated (half the charge) | 21.0% | $21.0\\%\\,\\phi + 29.6\\%\\,(1-\\phi)$ |", "the tariff table, graduated");
  onPage("their share of use:", "the linearised share");
  onPage("$u = 29.6\\%$", "u in the Modeler box");

  // ---------------- the limits model ("can you have them all?")
  const lim = (co2, gas, fair, tariff) => solve(M.limitModel(TP, C, null, RW, { co2: co2 * 1e3, gas: gas / 100, fair: fair / 100, tariff }, D));
  const L0 = A.limits;
  ok(L0.co2.start === 200 && L0.gas.start === 25 && L0.fair.start === 33, "the limits start at 200 kt, 25% gas, a 33% share");
  const r1 = lim(200, 25, 33, "fixed");
  ok(r1.status === "infeasible", `200 kt, 25% gas, 33% share, fixed charge per home: ${r1.status}`);
  const checkSol = (r, co2, gas, fair, tariff, what) => {
    ok(r.ok, `${what}: ${r.status}`); if (!r.ok) return;
    const s = TP.summarize(C, per, r, {}), F_ = s.fixed, V_ = s.fuel, gasE = s.energy.cc + s.energy.pk, used = s.demand + s.energy.ch - s.energy.dis;
    const share = M.fairShare(F_ / (F_ + V_), D.groups, tariff, D.graded);
    ok(s.co2 <= co2 * 1e3 + 1 && gasE <= gas / 100 * used + 1 && share <= fair / 100 + 1e-6 && s.unserved === 0, `${what}: meets every limit on the seven weeks (${kt(s.co2)}, gas ${pct(gasE / used, 1)}, share ${pct(share, 2)})`);
  };
  checkSol(lim(200, 25, 33, "graded"), 200, 25, 33, "graded", "the same limits with the income-graduated charge");
  checkSol(lim(200, 25, 33, "flat"), 200, 25, 33, "flat", "the same limits per kWh only");
  checkSol(lim(200, 25, 34.5, "fixed"), 200, 25, 34.5, "fixed", "a 34.5% share with a fixed charge per home");
  ok(lim(800, 100, 29.5, "flat").status === "infeasible", "per kWh only, a share below 29.6% cannot be met");

  // ---------------- the fallback table and the page's numbers
  const LAB = { A: "A · Gas only", B: "B · Gas + wind", C: "C · Wind, sun and battery, full gas backup", D: "D · Wind, sun and battery, lean gas backup", E: "E · Sun and battery, gas backup", F: "F · Nuclear and gas", G: "G · Even mix", H: "H · Wind with thin gas backup", I: "I · Deep clean" };
  A.plans.forEach(p => {
    ok(LAB[p.id] === p.id + " · " + p.label, `plan ${p.id}'s label`);
    const cells = ["cost", "co2", "rel", "fair", "sec"].map(a => val(p.m, a, DEF)), verdict = dom[p.id] ? "beaten by " + dom[p.id].join(", ") : "unbeaten";
    const lab = ["Cheap", "Clean", "Reliable", "Fair", "Secure"];
    onPage(`<tr><td>${LAB[p.id]}</td>` + cells.map((c, i) => `<td data-l="${lab[i]}">${c}</td>`).join("") + `<td data-l="Verdict">${verdict}</td></tr>`, `fallback row ${p.id}`);
  });
  onPage("Five illustrative sets of priorities pick three plans: Bills first picks A, Climate first and Supply first pick I, Lights first and Equal weights pick D.", "the fallback picks");
  onPage("No other plan is at least as good on all five goals and better on one: 8 of the 9 plans here.", "the no-JS idea list");
  // myths and quick question
  onPage("A new goal can only rescue plans: 4 plans beaten on cost and CO₂ alone are unbeaten on all five.", "myth 2");
  onPage("and E, F and G become beaten", "myth 3");
  ok(BY.A.m.cost === Math.min(...LIB.map(p => p.m.cost)) && BY.A.m.co2 === Math.max(...LIB.map(p => p.m.co2)) && BY.I.m.co2 === Math.min(...LIB.map(p => p.m.co2)), "A is the cheapest and dirtiest; I the cleanest");
  ok(BY.I.m.cost > 2 * BY.A.m.cost, "I costs more than twice as much as A");
  onPage("the cheapest plan (A) emits the most, and the cleanest (I) costs more than twice as much", "myth 1");
  ok(LIB.every(p => LIB.some(q => q !== p && ["cost", "co2", "rel", "fair", "sec"].some(a => M.better(M.axisKey(a, DEF)) * (M.shown(M.axisValue(q.m, a, DEF), M.axisKey(a, DEF)) - M.shown(M.axisValue(p.m, a, DEF), M.axisKey(a, DEF))) > 0))), "no plan is best on all five");
  onPage("88% for C against 70% for D", "the quick question");
  ok(val(BY.C.m, "rel", ALT.rm) === "88%" && val(BY.D.m, "rel", ALT.rm) === "70%", "reserve margins: C 88%, D 70%");
  // numbers to remember and sources
  onPage("<td class=\"n\">34.7% · 29.6%</td>", "RECS shares");
  onPage("<td class=\"n\">6% · 2%</td>", "LEAD burden");
  onPage("<td class=\"n\">44.2% · 27.3%</td>", "FERC shares");
  ["eia-recs-ce21", "doe-lead", "ferc-2021-freeze"].forEach(k => ok(A.sources[k] && /^https:\/\//.test(A.sources[k].url) && A.sources[k].asOf, `source ${k} has a URL and a date`));
  onPage("https://doi.org/10.1016/j.rser.2009.06.021", "Wang et al. 2009");
  onPage("https://doi.org/10.1016/j.enpol.2009.02.023", "Stirling 2010");

  // ---------------- practice
  const sD = M.scores(BY.D.m, DEF, sc), eqD = ["cost", "co2", "rel", "fair", "sec"].reduce((t, a) => t + Math.round(sD[a] * 100) / 100, 0) / 5;
  ok(near(eqD, 0.666, 1e-9) && Math.abs(M.total(BY.D.m, { cost: 1, co2: 1, rel: 1, fair: 1, sec: 1 }, DEF, sc) - eqD) < 0.01, "practice: D's equal-weight total ≈ 0.666");
  ok(M.pick(LIB, { cost: 30, co2: 30, rel: 20, fair: 10, sec: 10 }, DEF, sc).id === "D", "practice: the shown weights pick D");
  ok(pct(M.fairShare(0.6, D.groups, "fixed", D.graded), 1) === "32.6%" && pct(M.fairShare(0.6, D.groups, "graded", D.graded), 1) === "24.4%", "practice: 60% fixed costs give 32.6% and 24.4%");
  const pm = (JS.match(/minutes: (\d+), title:/g) || []).map(s => +s.match(/\d+/)[0]);
  ok(pm.reduce((s, x) => s + x, 0) === 20, `practice minutes add to 20 (${pm.join(" + ")})`);

  // ---------------- wording and structure
  onPage("<b>Illustrative:</b> the plans, tariffs, priority weights and radar scales; Prairie Town is fictional.", "illustrative label");
  ok(/A\.prioritiesNote/.test(JS) && /not the stated views of any real organization/.test(A.prioritiesNote), "priority sets are labelled illustrative");
  ok(/a choice<\/em>/.test(JS) && /one choice among several/.test(JS), "constructed measures are labelled as one choice among several");
  ok(/Text version of the radar/.test(JS) && /The nine plans in numbers/.test(JS), "the radar and the plans have text versions");
  ok(/api\.busy\(true\)/.test(JS) && /aria-live/.test(JS), "busy solves hold Next; results are announced");
  ok(/Steelman/.test(JS) && /reveal: "details"/.test(JS), "a Steelman card on the tariff");
  ok(!/\bAI\b|Claude|ChatGPT/.test(page + JS), "no AI wording");
  ok(!/nuclear[^.]*\b(credit|screen|order|deliver|timing|buyer|siting|threshold|subsid|learning)/i.test(JSON.stringify(A) + JS.replace(/\/\/[^\n]*/g, "")), "no nuclear sentence with a deny-listed risk word");
  ok(page.includes("data-learn=\"tradeoff-explorer\"") && /LX\.mount\("tradeoff-explorer"/.test(JS), "the page and the script share a slug");

  console.log(`${checks - fails} of ${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
