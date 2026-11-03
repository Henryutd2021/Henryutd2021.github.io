// test_a22-tradeoff-explorer.js — Node tests for A22 (assets/learn/a22-tradeoff-explorer.js, data/a22-tradeoff-explorer.json)
// and every number that learn/a22-tradeoff-explorer.qmd states. The plans' years come from lesson 13's model, the shared
// planning engine (assets/learn/components/planengine.js, LX.townPlan), solved here with the vendored HiGHS.
//   - inputs: the RECS household shares, the reserve-margin capacity values, the 450 MW peak
//   - the nine plans: each precomputed year matches a fresh full-year solve; C's peakers never run; H is the only plan short
//   - measures: the low-income share formula for the three tariffs, the reserve margin rule, the gas and largest shares
//   - dominance: only C is beaten (by D) with the first definitions; five of nine on cost and CO2 alone; the rescues and
//     the narrowest escape; how the unbeaten set changes with each alternative definition; values compared as shown (ties
//     within the shown step) against full precision (only C under the income-graduated charge differs); a tie lets a new
//     goal beat a plan that was unbeaten; clipped scores could hide a difference, so picks weigh only unbeaten plans
//   - picks of the five priority sets under each definition; the step 1 prediction; step 3's conflict counter
//   - the limits model: infeasible at 200 kt, 25% gas and a 33% share under a fixed charge per home, feasible with the
//     income-graduated charge or a 34.5% share; the solved plan meets its limits on the seven weeks; the full-year check
//     (sizes rounded up) fails on CO2, the gas share and unserved energy at 200 kt, and passes at loose limits
//   - the fallback table, the Go deeper numbers, the myths, the quick question, the numbers to remember, the practice
//     (interactive and static)
//   - wording: illustrative labels, sources with dates, the radar's text version
//   - the re-solve behind the sliders (M.resolver, fake timers): 260 ms debounce, a newer change aborts a running solve,
//     stale results are dropped, Next is held until the newest result, results are announced in a live region
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
const TP = require(L("components/planengine.js"));
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
  // in this library no plan unbeaten on cost and CO2 is beaten on five (no two plans tie on both), for every definition
  [DEF].concat(Object.values(ALT)).forEach(df => { const u2 = M.unbeaten(LIB, df, ["cost", "co2"]), u5 = M.unbeaten(LIB, df); ok(u2.every(id => u5.includes(id)), "this library: the three extra goals only rescue plans"); });
  // ...but with a tie on the earlier goals a new goal can beat an unbeaten plan (the page's claim: "The reverse needs a tie")
  {
    const base = BY.D.m, tieA = { id: "X", m: Object.assign({}, base, { unserved: 0 }) }, tieB = { id: "Y", m: Object.assign({}, base, { unserved: 10 }) };
    const u2 = M.unbeaten([tieA, tieB], DEF, ["cost", "co2"]), u5 = M.unbeaten([tieA, tieB], DEF);
    ok(u2.join() === "X,Y" && u5.join() === "X", "a tie on cost and CO₂: both unbeaten on two goals, Y beaten once Reliable is added");
  }
  onPage("The reverse needs a tie: a new goal can beat an unbeaten plan only if another plan matched it on every earlier goal.", "myth 2's tie rule");
  onPage("It can beat a plan that was unbeaten only if another plan tied that plan on every earlier goal.", "the Modeler box's tie rule");
  // values as shown against full precision
  const exact = df => M.unbeaten(LIB, df, null, true).join();
  ok(exact(DEF) === un.join() && exact(ALT.flat) === M.unbeaten(LIB, ALT.flat).join() && exact(ALT.largest) === M.unbeaten(LIB, ALT.largest).join() && exact(ALT.rm) === M.unbeaten(LIB, ALT.rm).join(),
     "full precision gives the same unbeaten plans as the shown values, except under the income-graduated charge");
  ok(exact(ALT.graded) === "A,B,C,D,H,I" && M.unbeaten(LIB, ALT.graded).join() === "A,B,D,H,I", "income-graduated: C unbeaten at full precision, beaten by D as shown");
  const hid = M.hiddenByRounding(LIB, ALT.graded);
  ok(hid.length === 1 && hid[0].id === "C" && hid[0].by === "D" && hid[0].key === "fair" && (hid[0].v * 100).toFixed(2) === "21.61" && (hid[0].vs * 100).toFixed(2) === "21.64" && pct(hid[0].v, 1) === pct(hid[0].vs, 1),
     "the rounding note: C's 21.61% against D's 21.64%, both shown as 21.6%");
  ok([DEF, ALT.flat, ALT.largest, ALT.rm].every(df => M.hiddenByRounding(LIB, df).length === 0), "no rounding note under the other definitions");
  onPage("Under the income-graduated charge, C's share (21.61%) and D's (21.64%) both show 21.6%, so D beats C; at full precision, C is unbeaten.", "the ties-as-shown bullet");
  onPage("Verdicts compare values as shown: two values that round to the same number count as a tie.", "the fallback's tie rule");
  onJS("Values count as equal when they look equal: rounded to $0.1M, 1 kt, 1 MWh, 0.1 point of the low-income share and 1 point of the gas share.", "step 4's tie rule");
  ok(M.shown(0.0005, "fair") === 0.001 && M.shown(1e5 * 0.49, "cost") === 0 && M.shown(499, "co2") === 0 && M.shown(0.49, "unserved") === 0 && M.shown(0.0049, "gas") === 0, "the stated steps match PREC");

  // ---------------- picks
  const pk = (df) => A.priorities.map(p => p.id + ":" + M.pick(LIB, p.w, df, A.scales).id).join();
  ok(pk(DEF) === "bills:A,climate:I,lights:D,supply:I,equal:D", "first definitions: Bills first A, Climate first I, Lights first D, Supply first I, Equal weights D");
  ok(pk(ALT.graded) === "bills:B,climate:I,lights:D,supply:I,equal:D", "income-graduated: Bills first moves to B");
  ok(pk(ALT.largest) === "bills:A,climate:I,lights:G,supply:G,equal:G", "largest source: Lights, Supply and Equal move to G");
  ok(pk(ALT.rm) === "bills:C,climate:I,lights:I,supply:I,equal:C", "reserve margin: Bills and Equal pick C, Lights picks I");
  A.priorities.forEach(p => ok(near(Object.values(p.w).reduce((s, x) => s + x, 0), 100, 1e-9), `${p.label}: weights sum to 100`));
  [DEF].concat(Object.values(ALT)).forEach(df => A.priorities.forEach(p => ok(M.unbeaten(LIB, df).includes(M.pick(LIB, p.w, df, A.scales).id), "every positive-weight pick is unbeaten")));
  // out of range: two CO2 values beyond the 850 kt end both score 0, so the clipped totals tie and a beaten plan could win
  // on the order; pick() weighs only unbeaten plans
  {
    const hi = { id: "P", m: Object.assign({}, BY.A.m, { co2: 950e3 }) }, lo = { id: "Q", m: Object.assign({}, BY.A.m, { co2: 900e3 }) };
    ok(M.scores(hi.m, DEF, A.scales).co2 === 0 && M.scores(lo.m, DEF, A.scales).co2 === 0 && M.total(hi.m, A.priorities[0].w, DEF, A.scales) === M.total(lo.m, A.priorities[0].w, DEF, A.scales), "out of range: 950 kt and 900 kt both score 0 and tie");
    ok(JSON.stringify(M.dominated([hi, lo], DEF)) === JSON.stringify({ P: ["Q"] }) && M.pick([hi, lo], A.priorities[0].w, DEF, A.scales).id === "Q", "out of range: the pick is the unbeaten Q, not the beaten P listed first");
    const rmClip = LIB.filter(p => M.reserveMargin(p.plan, D.cv, D.peak, 4) > 1).map(p => p.id).join();
    ok(rmClip === "E,I", "reserve margins above the 100% rim: E and I (drawn at the rim)");
  }
  onPage("A value beyond its scale's end scores the same as that end, which can hide a difference, so the page weighs only the unbeaten plans.", "the clipping rule");
  ok(/weigh only the plans that are unbeaten as shown/.test(A.scales.note), "the data's scale note says picks weigh only unbeaten plans");

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
  // the worked tariff table (a plan with 95% fixed costs): the shown arithmetic and the model agree to 0.1 point
  {
    const f = 0.95, fx = M.fairShare(f, D.groups, "fixed", D.graded), gr = M.fairShare(f, D.groups, "graded", D.graded), fl = M.fairShare(f, D.groups, "flat", D.graded);
    ok(pct(fx, 1) === "34.4%" && (34.7 * 0.95 + 29.6 * 0.05).toFixed(1) === "34.4", "worked table, fixed charge: 34.4% (model and shown arithmetic)");
    ok(pct(gr, 1) === "21.4%" && (21.0 * 0.95 + 29.6 * 0.05).toFixed(1) === "21.4", "worked table, income-graduated: 21.4%");
    ok(pct(fl, 1) === "29.6%" && ((fx - gr) * 100).toFixed(1) === "13.0", "worked table: per kWh 29.6%; the tariff moves the share by 13.0 points");
    onPage("| Fixed charge per home | 34.7% of the fixed costs, 29.6% of the running costs | 34.7% × 0.95 + 29.6% × 0.05 = 34.4% |", "the worked table, fixed");
    onPage("| Income-graduated (half the charge) | 21.0% of the fixed costs, 29.6% of the running costs | 21.0% × 0.95 + 29.6% × 0.05 = 21.4% |", "the worked table, graduated");
    onPage("the tariff alone moves the share by 13.0 points", "the worked table's gap");
    ok(!/Longleftrightarrow|\\phi/.test(page), "the Modeler box no longer derives the linear form of the share limit (depth D2)");
  }

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
  // the full-year check of step 7: the optimizer's plan, sizes rounded up, run on all 8,760 hours
  const yearCheck = (co2, gas, fair, tariff) => {
    const Lm = { co2: co2 * 1e3, gas: gas / 100, fair: fair / 100, tariff }, r = solve(M.limitModel(TP, C, null, RW, Lm, D));
    const wv = M.weekVals(TP, C, per, r, tariff, D), plan = TP.ceilPlan(wv.plan, cfg.limits), rf = solve(TP.fullYearModel(C, Y, { plan }));
    const yv = M.yearVals(M.measure(C, Y, rf, plan, D), tariff);
    return { wv, yv, wc: M.checkLimits(wv, Lm), yc: M.checkLimits(yv, Lm) };
  };
  {
    const g1 = yearCheck(200, 25, 33, "graded");
    ok(g1.wc.pass, "200 kt, 25% gas, 33% share, income-graduated: met on the seven weeks");
    ok(!g1.yc.pass && !g1.yc.co2 && !g1.yc.gas && g1.yc.fair && !g1.yc.served, "...but the full-year check fails on CO₂, the gas share and unserved energy (the share is met)");
    ok(kt(g1.yv.co2) === "215 kt" && Math.round(g1.yv.unserved) === 33 && pct(g1.yv.gas, 1) === "26.3%" && musd(g1.yv.cost) === "$132.0M", `full year: ${kt(g1.yv.co2)}, ${Math.round(g1.yv.unserved)} MWh unserved, gas ${pct(g1.yv.gas, 1)}, ${musd(g1.yv.cost)} (lesson 13 states 215 kt and 33 MWh)`);
    onPage("With the income-graduated charge the seven weeks meet them, but the full year emits 215 kt and leaves 33 MWh unserved.", "the fallback's full-year check");
    const g2 = yearCheck(800, 100, 35, "fixed");
    ok(g2.wc.pass && g2.yc.pass && g2.yv.unserved < 0.5, `loose limits (800 kt, 100% gas, 35%): the full-year check passes (${kt(g2.yv.co2)}, gas ${pct(g2.yv.gas, 1)})`);
    ok(M.checkLimits({ co2: 200.4e3, gas: 0.2504, fair: 0.3304, unserved: 0.4 }, { co2: 200e3, gas: 0.25, fair: 0.33 }).pass && !M.checkLimits({ co2: 200.6e3, gas: 0.25, fair: 0.33, unserved: 0 }, { co2: 200e3, gas: 0.25, fair: 0.33 }).co2 &&
       !M.checkLimits({ co2: 0, gas: 0.2506, fair: 0, unserved: 0 }, { co2: 1, gas: 0.25, fair: 1 }).gas && !M.checkLimits({ co2: 0, gas: 0, fair: 0, unserved: 0.6 }, { co2: 1, gas: 1, fair: 1 }).served,
       "limits are judged at the table's precision: 1 kt, 0.1 point, 1 MWh");
  }
  onJS('Find limits that no plan can meet: <b>', "step 7's first task");
  onJS('Find limits the solver can meet on the seven weeks: <b>', "step 7's second task");
  onJS("<b>Fails the full-year check:</b> ", "a failed full-year check is reported as a failure");
  onJS('" The full-year check " + (o.pass === false ? "fails" : "did not run") + ", so your plan stays a seven-week result."', "the step's conclusion keeps a failed check");
  ok(/S_\.lim\.weeks = att\(\{ pass: yc\.pass/.test(JS) && !/S_\.lim\.ok/.test(JS), "the seven-week result and the full-year verdict are stored apart");
  onJS("Switch the definitions of two goals", "step 6 says how many definitions to switch");
  onJS('"Goals with a switched definition: " + Math.min(n, 2) + " of 2."', "step 6 shows its progress");

  // ---------------- the fallback table and the page's numbers
  const LAB = { A: "A · Gas only", B: "B · Gas + wind", C: "C · Wind, sun and battery, full gas backup", D: "D · Wind, sun and battery, lean gas backup", E: "E · Sun and battery, gas backup", F: "F · Nuclear and gas", G: "G · Even mix", H: "H · Wind with thin gas backup", I: "I · Deep clean" };
  A.plans.forEach(p => {
    ok(LAB[p.id] === p.id + " · " + p.label, `plan ${p.id}'s label`);
    const cells = ["cost", "co2", "rel", "fair", "sec"].map(a => val(p.m, a, DEF)), verdict = dom[p.id] ? "beaten by " + dom[p.id].join(", ") : "unbeaten";
    const lab = ["Cheap", "Clean", "Reliable", "Fair", "Secure"];
    onPage(`<tr><td>${LAB[p.id]}</td>` + cells.map((c, i) => `<td data-l="${lab[i]}">${c}</td>`).join("") + `<td data-l="Verdict">${verdict}</td></tr>`, `fallback row ${p.id}`);
  });
  onPage("Five illustrative sets of priorities pick three plans: Bills first picks A, Climate first and Supply first pick I, Lights first and Equal weights pick D.", "the fallback picks");
  onPage("No other plan is at least as good on all five goals and better on one: 8 of the 9 plans here, comparing values as shown.", "the no-JS idea list");
  // myths and quick question
  onPage("Fact. Here 4 plans beaten on cost and CO₂ alone are unbeaten on all five.", "myth 2");
  ok(/data-id="rescue" data-answer="fact"/.test(page) && !/data-id="knockout"/.test(page), "myth 2 is a fact, with a new id (no stale stored answer)");
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
  // the static practice (no JavaScript): the same six exercises with their answers
  {
    ok(musd(BY.H.m.cost) === "$116.2M" && musd(BY.B.m.cost) === "$119.5M" && kt(BY.H.m.co2) === "424 kt" && kt(BY.B.m.co2) === "521 kt", "static practice: H and B's cost and CO₂");
    onPage("H costs less than B ($116.2M against $119.5M) and emits less (424 kt against 521 kt).", "static practice 1");
    onPage("Unbeaten: H leaves " + val(BY.H.m, "rel", DEF) + " unserved and B none", "static practice 1's answer");
    onPage("D: it costs $5.9M less and is the same on the other four goals.", "static practice 2's answer");
    ok(dom.C[0] === "D" && !M.dominated(LIB, ALT.rm).C, "static practice 2 and 3: D beats C; with the reserve margin C is unbeaten");
    onPage("C's margin is 88%, D's 70%.", "static practice 3");
    const sc5 = ["cost", "co2", "rel", "fair", "sec"].map(a => sD[a].toFixed(2));
    ok(sc5.join() === "0.63,0.83,1.00,0.05,0.82", `static practice 4: D's scores ${sc5.join(", ")}`);
    onPage("Its scores: Cheap 0.63, Clean 0.83, Reliable 1.00, Fair 0.05, Secure 0.82.", "static practice 4");
    onPage("0.666, the average of the five: the highest of the nine, so Equal weights picks D.", "static practice 4's answer");
    ok(LIB.every(p => p.id === "D" || M.total(p.m, { cost: 1, co2: 1, rel: 1, fair: 1, sec: 1 }, DEF, sc) < M.total(BY.D.m, { cost: 1, co2: 1, rel: 1, fair: 1, sec: 1 }, DEF, sc)), "D has the highest equal-weight total of the nine");
    onPage("Bills first (cost 40, clean 5, reliable 20, fair 30, secure 5) picks A.", "static practice 5");
    ok(JSON.stringify(A.priorities[0].w) === JSON.stringify({ cost: 40, co2: 5, rel: 20, fair: 30, sec: 5 }), "static practice 5: Bills first's weights");
    onPage("For example cost 30, clean 30, reliable 20, fair 10, secure 10: D wins.", "static practice 5's answer");
    const f6 = M.fairShare(0.6, D.groups, "fixed", D.graded), g6 = M.fairShare(0.6, D.groups, "graded", D.graded);
    ok(((f6 - g6) * 100).toFixed(1) === "8.2", "static practice 6: the tariff moves the share by 8.2 points");
    onPage("32.6% and 24.4%: the tariff alone moves the share by 8.2 points.", "static practice 6's answer");
    ok(/host\.innerHTML = "";\s+\/\/ the static exercises/.test(JS), "the interactive practice replaces the static one");
  }
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
  ok(A.plans.every(p => !/nuclear/i.test(p.note) || !/cost/i.test(p.note)), "no plan note pairs nuclear with cost");
  onPage("DOE uses a different definition here: income up to 80% of the local median.", "DOE's low-income definition");
  onPage("Home energy only, not transport; DOE's low-income means income up to 80% of the local median.", "DOE's definition in the numbers to remember");
  ok(/0-80% of area median income/.test(A.sources["doe-lead"].text), "the data file keeps DOE's definition");
  onJS("[[tariff|tariff]], the rule for calculating bills", "step 1 glosses the tariff");
  onJS("[[epsilon-constraint|epsilon-constraint method]]", "the concept map marks the epsilon-constraint term");
  onPage("A supply is concentrated when one source makes most of it, and diverse when many sources make similar shares.", "concentration in plain words before the indices");
  ok(!/nuclear[^.]*\b(credit|screen|order|deliver|timing|buyer|siting|threshold|subsid|learning)/i.test(JSON.stringify(A) + JS.replace(/\/\/[^\n]*/g, "")), "no nuclear sentence with a deny-listed risk word");
  ok(page.includes("data-learn=\"tradeoff-explorer\"") && /LX\.mount\("tradeoff-explorer"/.test(JS), "the page and the script share a slug");
  ok(!/13-capstone\.js(?!on)/.test(page) && /<script src="\.\.\/assets\/learn\/learn\.js" defer><\/script>/.test(page), "the page uses the shared planning engine in learn.js, not lesson 13's script");

  // ---------------- the re-solve behind the sliders: debounced, cancellable, newest result only (M.resolver, fake timers)
  {
    let now = 0, timers = [], tid = 0;
    const clock = { setTimeout: (f, ms) => { timers.push({ id: ++tid, at: now + ms, f }); return tid; }, clearTimeout: id => { timers = timers.filter(t => t.id !== id); } };
    const flush = () => new Promise(r => setImmediate(r));
    async function advance(ms) {
      now += ms;
      for (;;) { const due = timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers = timers.filter(t => t !== due); due.f(); await flush(); }
      await flush();
    }
    const jobs = [], log = [], busy = [];
    let aborted = 0;
    const R = M.resolver(Object.assign({ delay: 260, AbortController,
      job: (x, signal) => { let res; const pr = new Promise(r => { res = r; }); const j = { x, signal, res, aborts: 0 }; signal.addEventListener("abort", () => { j.aborts++; }); jobs.push(j); return pr; },
      done: (r, x) => log.push([r, x]), busy: on => busy.push(on), aborted: () => { aborted++; } }, clock));
    R.set("a"); await advance(100); R.set("b"); await advance(100); R.set("c");
    ok(jobs.length === 0 && busy.join() === "true" && R.busy() && R.pending(), "re-solve: changes within 260 ms only restart the wait (no solve yet; Next held from the first change)");
    await advance(259); ok(jobs.length === 0, "re-solve: nothing runs before 260 ms of quiet");
    await advance(1); ok(jobs.length === 1 && jobs[0].x === "c", "re-solve: after the pause only the newest change is solved");
    R.set("d");
    ok(jobs[0].signal.aborted && jobs[0].aborts === 1 && aborted === 1, "re-solve: a newer change aborts the solve already running (its AbortSignal), and the page may restart the solver");
    await advance(260); ok(jobs.length === 2 && jobs[1].x === "d" && !jobs[1].signal.aborted, "re-solve: the newer change is solved after its own pause");
    jobs[0].res("late result for c"); await flush();
    ok(log.length === 0 && busy.join() === "true", "re-solve: a stale result (the aborted solve answering late) is dropped and Next stays held");
    jobs[1].res("result for d"); await flush();
    ok(log.length === 1 && log[0][0] === "result for d" && log[0][1] === "d" && busy.join() === "true,false" && !R.busy() && !R.pending(), "re-solve: the newest result is delivered once, and Next is released just before it");
    R.set("e", true); ok(jobs.length === 2, "re-solve: set(x, true) skips the pause but still runs from the timer queue");
    await advance(0); ok(jobs.length === 3 && jobs[2].x === "e", "re-solve: a reset to a stored plan runs at once");
    R.set("f"); ok(jobs[2].signal.aborted && aborted === 2, "re-solve: a change during that solve aborts it");
    await advance(260); jobs[3].res("result for f"); await flush(); jobs[2].res("result for e"); await flush();
    ok(log.length === 2 && log[1][1] === "f" && log.every(l => l[1] !== "e"), "re-solve: results that arrive out of order never overwrite a newer plan");
    R.set("g"); R.cancel(); await advance(1000);
    ok(jobs.length === 4 && !R.busy() && busy[busy.length - 1] === false && aborted === 2, "re-solve: cancel() drops a waiting change without a solve and releases Next");
    const R2 = M.resolver(Object.assign({ delay: 260, AbortController, job: () => ({ m: "stored" }), done: (r, x) => log.push([r, x]), busy: on => busy.push(on), fail: () => log.push(["fail"]) }, clock));
    R2.set("lib"); await advance(260);
    ok(log[log.length - 1][0].m === "stored" && !R2.busy(), "re-solve: a job that answers at once (a stored plan) is delivered too");
    const R3 = M.resolver(Object.assign({ delay: 260, AbortController, job: () => { throw new Error("bad"); }, done: () => log.push(["done"]), fail: (e, x) => log.push(["fail", x]) }, clock));
    R3.set("boom"); await advance(260);
    ok(log[log.length - 1][0] === "fail" && log[log.length - 1][1] === "boom" && !R3.busy(), "re-solve: a job that throws reaches fail() and releases Next");
    ok(/M\.resolver\(\{\s*delay: 260/.test(JS) && /signal: signal \}\)/.test(JS) && /key: "a22-plan"/.test(JS) && /class: "lx-sr", "aria-live": "polite"/.test(JS) && /said\.textContent = "Your plan, run through 2025: "/.test(JS),
       "the page re-solves through the resolver with the solver's AbortSignal, and announces each new result in a live region");
    ok(!/S_\.seq/.test(JS) && !/timer = setTimeout\(run/.test(JS), "the page keeps no second re-solve path");
  }

  console.log(`${checks - fails} of ${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
