// solver_models.js — model builders shared by the solver tests (test_solver.js) and the browser benchmark
// (the browser solver benchmark). Not a test itself. Each builder returns a model in the LX.solver format
// (assets/learn/components/solver.js). Sizes follow the course's solver benchmark set:
//   dispatch3()             3 generators, one hour: the textbook check that the demand dual equals the marginal cost
//   dispatch24(town, days)  Prairie Town's five plants over a real day (24 h), ramp limits on the combined-cycle plant,
//                           unserved energy at a high penalty
//   storage168(town, days)  the calmest week of 2025 (168 h) with a 50 MW / 200 MWh battery (state of charge, losses)
//   uc24(town, days)        a small unit commitment MILP: 4 gas units x 24 h, on/off and start-up decisions
// Numbers are illustrative (Prairie Town); the hourly shapes are the real SPP 2025 shapes in town_days.json.
"use strict";

function dispatch3(demand) {
  const D = demand == null ? 80 : demand;
  return {
    sense: "min",
    variables: [{ name: "coal", ub: 50, cost: 10 }, { name: "gas", ub: 50, cost: 30 }, { name: "oil", ub: 50, cost: 60 }],
    constraints: [{ name: "demand", terms: { coal: 1, gas: 1, oil: 1 }, eq: D }],
  };
}

function scaledDay(town, day, peak) {
  const f = town.fleet;
  return {
    demand: day.demand.map(v => v / 1000 * peak),
    wind: day.wind.map(v => v / 1000 * f.wind.mw),
    solar: day.solar.map(v => v / 1000 * f.solar.mw),
  };
}

function dispatch24(town, days, which) {
  const f = town.fleet, d = scaledDay(town, days.days[which || "summer_peak"], 450), H = 24;
  const vars = [], cons = [];
  for (let t = 0; t < H; t++) {
    vars.push({ name: `nuc_${t}`, ub: f.nuclear.mw, cost: f.nuclear.cost });
    vars.push({ name: `wind_${t}`, ub: d.wind[t], cost: f.wind.cost });
    vars.push({ name: `solar_${t}`, ub: d.solar[t], cost: f.solar.cost });
    vars.push({ name: `cc_${t}`, ub: f.cc.mw, cost: f.cc.cost });
    vars.push({ name: `pk_${t}`, ub: f.peaker.mw, cost: f.peaker.cost });
    vars.push({ name: `shed_${t}`, cost: 3000 });
    cons.push({ name: `balance_${t}`, terms: { [`nuc_${t}`]: 1, [`wind_${t}`]: 1, [`solar_${t}`]: 1, [`cc_${t}`]: 1, [`pk_${t}`]: 1, [`shed_${t}`]: 1 }, eq: d.demand[t] });
    if (t > 0) {
      cons.push({ name: `ramp_up_${t}`, terms: { [`cc_${t}`]: 1, [`cc_${t - 1}`]: -1 }, le: f.cc.ramp });
      cons.push({ name: `ramp_down_${t}`, terms: { [`cc_${t}`]: 1, [`cc_${t - 1}`]: -1 }, ge: -f.cc.ramp });
    }
  }
  return { sense: "min", variables: vars, constraints: cons };
}

function storage168(town, days) {
  const f = town.fleet, w = days.calm_week, H = w.demand.length, eta = Math.sqrt(0.85), P = 50, E = 200;
  const dem = w.demand.map(v => v / 1000 * 450), wind = w.wind.map(v => v / 1000 * f.wind.mw), solar = w.solar.map(v => v / 1000 * f.solar.mw);
  const vars = [], cons = [];
  for (let t = 0; t < H; t++) {
    vars.push({ name: `nuc_${t}`, ub: f.nuclear.mw, cost: f.nuclear.cost }, { name: `wind_${t}`, ub: wind[t] }, { name: `solar_${t}`, ub: solar[t] },
      { name: `cc_${t}`, ub: f.cc.mw, cost: f.cc.cost }, { name: `pk_${t}`, ub: f.peaker.mw, cost: f.peaker.cost }, { name: `shed_${t}`, cost: 3000 },
      { name: `ch_${t}`, ub: P }, { name: `dis_${t}`, ub: P }, { name: `soc_${t}`, ub: E });
    cons.push({ name: `balance_${t}`, terms: { [`nuc_${t}`]: 1, [`wind_${t}`]: 1, [`solar_${t}`]: 1, [`cc_${t}`]: 1, [`pk_${t}`]: 1, [`shed_${t}`]: 1, [`dis_${t}`]: 1, [`ch_${t}`]: -1 }, eq: dem[t] });
    // state of charge: soc_t = soc_{t-1} + eta*ch_t - dis_t/eta; the week starts and ends half full
    const terms = { [`soc_${t}`]: 1, [`ch_${t}`]: -eta, [`dis_${t}`]: 1 / eta };
    if (t > 0) terms[`soc_${t - 1}`] = -1;
    cons.push({ name: `soc_${t}`, terms, eq: t > 0 ? 0 : E / 2 });
    if (t > 0) {
      cons.push({ name: `ramp_up_${t}`, terms: { [`cc_${t}`]: 1, [`cc_${t - 1}`]: -1 }, le: f.cc.ramp });
      cons.push({ name: `ramp_down_${t}`, terms: { [`cc_${t}`]: 1, [`cc_${t - 1}`]: -1 }, ge: -f.cc.ramp });
    }
  }
  cons.push({ name: "soc_end", terms: { [`soc_${H - 1}`]: 1 }, ge: E / 2 });
  return { sense: "min", variables: vars, constraints: cons };
}

function uc24(town, days, which) {
  const d = scaledDay(town, days.days[which || "winter_peak"], 450), H = 24;
  const net = d.demand.map((v, t) => Math.max(0, v - d.wind[t] - d.solar[t] - town.fleet.nuclear.mw));   // left for the gas units
  // four illustrative gas units: capacity, minimum output when on, running cost, no-load cost per hour on, start-up cost
  const units = [
    { id: "cc1", max: 150, min: 60, cost: 38, noload: 900, start: 6000 },
    { id: "cc2", max: 120, min: 50, cost: 42, noload: 700, start: 5000 },
    { id: "ct1", max: 80, min: 20, cost: 70, noload: 300, start: 800 },
    { id: "ct2", max: 60, min: 15, cost: 95, noload: 200, start: 400 },
  ];
  const vars = [], cons = [];
  for (let t = 0; t < H; t++) {
    const bal = { [`shed_${t}`]: 1 };
    vars.push({ name: `shed_${t}`, cost: 3000 });
    units.forEach(u => {
      vars.push({ name: `g_${u.id}_${t}`, ub: u.max, cost: u.cost }, { name: `on_${u.id}_${t}`, type: "binary", cost: u.noload },
        { name: `st_${u.id}_${t}`, ub: 1, cost: u.start });
      bal[`g_${u.id}_${t}`] = 1;
      cons.push({ name: `max_${u.id}_${t}`, terms: { [`g_${u.id}_${t}`]: 1, [`on_${u.id}_${t}`]: -u.max }, le: 0 });
      cons.push({ name: `min_${u.id}_${t}`, terms: { [`g_${u.id}_${t}`]: 1, [`on_${u.id}_${t}`]: -u.min }, ge: 0 });
      cons.push({ name: `start_${u.id}_${t}`, terms: t > 0 ? { [`st_${u.id}_${t}`]: 1, [`on_${u.id}_${t}`]: -1, [`on_${u.id}_${t - 1}`]: 1 } : { [`st_${u.id}_${t}`]: 1, [`on_${u.id}_${t}`]: -1 }, ge: 0 });
    });
    cons.push({ name: `balance_${t}`, terms: bal, eq: net[t] });
  }
  return { sense: "min", variables: vars, constraints: cons };
}

// The lesson instances of the solver benchmark (T11, T13 and M1; plus B3's small solves), built by the
// lessons' own pure models exactly as the pages build them:
//   t11       lesson 11's day as one LP (lesson 0's day, ramp limits, unserved penalty; default settings)
//   m1net     M1 part B: 24 hours on the three-bus DC network, Ridge-Town line limited to 110 MW (congested)
//   t13week   lesson 13's planning LP on seven representative weeks with a 200 kt CO2 cap (the "Ask the optimizer" solve)
//   t13full   lesson 13's full-year check: the optimizer's 200 kt plan, fixed, on all 8,760 hours (the debrief's check)
//   b3        B3's correct four-hour dispatch (the page solves it and five planted bugs)
//   m2milp    M2's unit commitment on the summer peak: 264 columns, 48 of them binary switches (step 5 and each of the
//             step-6 staircase solves)
//   m2relax   M2's root relaxation (the LP behind step 2 and the first node of the step-4 tree; the tree solves 11 like it)
//   m2fixed   M2's dispatch LP with the switches fixed at the MILP's plan (step 7's conditional prices)
// M3 (capacity expansion with representative weeks), built with the planning engine's own functions as the page builds
// them (LX.townPlan.weekModel, .link, .fullYearModel; data/m03-capacity-expansion.json, its reference plans):
//   m3typ4    the plan LP on 4 typical weeks at 200 kt (step 3; solved on the page)
//   m3typ8    the plan LP on 8 typical weeks (step 6; solved on the page). 4 + 3 extreme weeks is lesson 13's t13week
//   m3wk11    the plan LP on 8 typical + 3 extreme weeks (precomputed on the page, as are 12 + 3 and the full-year optimum)
//   m3link, m3cyc, m3free   step 8's storage what-if (battery energy at an illustrative $20 per kWh) on the seven weeks,
//             the battery linked across the calendar, cyclic within each week, or free between weeks (solved on the page)
//   m3chk25   the 4-week plan, fixed, on all 8,760 hours of 2025 (step 4's check; steps 5-6 run the same LP for other plans)
//   m3chkfree the no-link storage plan (the largest battery), fixed, on 2025 (step 8's checks)
//   m3y24     the seven-week plan, fixed, on all 8,760 hours of 2024 (step 9)
// A22 (trade-off explorer):
//   a22plan   a reader's plan (plan E with 50 MW more wind: a battery plan, the heaviest kind), fixed, on all 8,760 hours:
//             the full-year re-solve after each slider change; step 7's check of the solver's plan is the same LP
//   a22lim    step 7's limits LP on the seven weeks: 200 kt, 25% gas, a 33% low-income share under the income-graduated
//             charge (feasible; the same limits under a fixed charge per home are infeasible and solve faster)
function lessonSet(site) {
  const path = require("path"), fs = require("fs");
  const A = p => path.join(site, "assets/learn", p), J = p => JSON.parse(fs.readFileSync(A("data/" + p), "utf8"));
  const town = J("town.json"), year = J("town_year.json"), targets = J("cf_targets.json");
  const M11 = require(A("11-solver.js")), M1 = require(A("m01-dispatch-to-lmp.js")), M13 = require(A("components/planengine.js")), B3 = require(A("b03-read-check-formulation.js"));
  const D11 = J("11-solver.json"), W11 = M11.dayOf(town, year);
  const D1 = J("m01-dispatch-to-lmp.json");
  const cfg = J("13-capstone.json"), Y = M13.prepareYear(year, targets, cfg, require(A("components/profiles.js")).townProfile);
  const RW = M13.selectWeeks(Y, cfg.weeks), C = M13.costs(cfg, {});
  const M2 = require(A("m02-unit-commitment.js")), D2 = J("m02-unit-commitment.json");
  const on2 = D2.day.demand.map((_, t) => (t >= 17 && t <= 22 ? 1 : 0));   // the MILP's plan: the peaker on 17:00-22:00
  const p200 = cfg.frontier.points.find(p => p.cap === 200), plan = M13.ceilPlan(p200.plan, cfg.limits);
  const prof = require(A("components/profiles.js")).townProfile;
  const M3 = require(A("m03-capacity-expansion.js")), D3 = J("m03-capacity-expansion.json"), R3 = D3.reference;
  const S3 = M3.prepare(cfg, D3, year, targets, J("m03-capacity-expansion-2024.json"), prof), cap3 = D3.cap * 1e3, scap3 = D3.storage.cap * 1e3;
  const m3plan = (Cx, id, cap, mode) => M13.link(M13.weekModel(Cx, S3.weeks(id), { cap }), S3.weeks(id), mode);
  const A22 = require(A("a22-tradeoff-explorer.js")), DA = J("a22-tradeoff-explorer.json"), g = DA.groups;
  const DD = { cv: A22.capValues(Y, DA.reserve.hours), peak: Y.peak, groups: { homes: g.homesM / g.totalHomesM, use: g.kwhB / g.totalKwhB }, graded: DA.graded, batteryHours: DA.reserve.batteryHours };
  const a22p = A22.blank(DA.plans.find(p => p.id === "E").plan); a22p.wind += 50;
  return [
    ["t11", "T11 day LP (lesson 11)", M11.buildLP(W11, M11.settings(), D11.penalty)],
    ["m1net", "M1 three-bus day LP, congested", M1.build(D1, { network: true, limit: 110 })],
    ["t13week", "T13 seven-week plan LP, 200 kt", M13.weekModel(C, RW, { cap: 200e3 })],
    ["t13full", "T13 full-year check, fixed plan", M13.fullYearModel(C, Y, { plan })],
    ["b3", "B3 four-hour dispatch LP", B3.buildModel(B3.instance(town, year))],
    ["m2milp", "M2 unit commitment MILP", M2.build(D2, { onoff: true })],
    ["m2relax", "M2 root relaxation LP", M2.build(D2, { onoff: true, relax: true })],
    ["m2fixed", "M2 LP with switches fixed", M2.build(D2, { onoff: true, relax: true, fix: M2.planFix(D2, on2) })],
    ["m3typ4", "M3 plan LP, 4 typical weeks, 200 kt", m3plan(S3.C, "typ4", cap3)],
    ["m3typ8", "M3 plan LP, 8 typical weeks, 200 kt", m3plan(S3.C, "typ8", cap3)],
    ["m3wk11", "M3 plan LP, 8 + 3 weeks (precomputed)", m3plan(S3.C, "wk11", cap3)],
    ["m3link", "M3 storage what-if, linked", m3plan(S3.Cw, D3.storage.set, scap3, "linked")],
    ["m3cyc", "M3 storage what-if, cyclic", m3plan(S3.Cw, D3.storage.set, scap3, "cyclic")],
    ["m3free", "M3 storage what-if, no link", m3plan(S3.Cw, D3.storage.set, scap3, "free")],
    ["m3chk25", "M3 check on 2025, 4-week plan", M13.fullYearModel(S3.C, S3.Y, { plan: R3.sets.typ4.plan })],
    ["m3chkfree", "M3 check on 2025, no-link plan", M13.fullYearModel(S3.Cw, S3.Y, { plan: R3.storage.free.plan })],
    ["m3y24", "M3 check on 2024, 7-week plan", M13.fullYearModel(S3.C, S3.Y2, { plan: R3.sets.wk7.plan })],
    ["a22plan", "A22 slider re-solve, full year", M13.fullYearModel(C, Y, { plan: a22p })],
    ["a22lim", "A22 limits LP, seven weeks", A22.limitModel(M13, C, null, RW, { co2: DA.limits.co2.start * 1e3, gas: DA.limits.gas.start / 100, fair: DA.limits.fair.start / 100, tariff: "graded" }, DD)],
  ].concat(e1Set(A, J));
}
// engine E1 (SB1, C1, M5): the sizing MILP for the storm and for three outages, the year LP, and the outage check
// MILP (whole sets, 30% minimum) for the sized plan and for F7's campus; skipped when the engine is absent
function e1Set(A, J) {
  const fs = require("fs");
  if (!fs.existsSync(A("components/engine-e1.js")) || !fs.existsSync(A("data/e1-prairie-campus.json"))) return [];
  const E1 = require(A("components/engine-e1.js")), P = E1.prepare(J("e1-prairie-campus.json"));
  const def = { pv: 600, bat: 2000, gen: 2, fuel: 675, ph: "must", pw: "must", pd: "keep", pl: "shed", out: ["jan3"], exp: 500, imp: 2000, tar: "tou", own: "community", allow: ["pv", "bat", "gen"] };
  const sized = Object.assign({}, def, { pv: 2625, bat: 3650, gen: 1 }), three = ["jan3", "eve1", "jul3"].map(i => P.scen[i]);
  return [
    ["e1size", "E1 sizing MILP, the storm", E1.sizeModel(def, P, [P.scen.jan3])],
    ["e1size3", "E1 sizing MILP, 3 outages, 650 kW", E1.sizeModel(Object.assign({}, def, { pd: "must" }), P, three)],
    ["e1year", "E1 year LP, 12 average days", E1.yearModel(sized, P)],
    ["e1out", "E1 outage check MILP, sized plan", E1.outageModel(sized, P, P.scen.jan3)],
    ["e1outf7", "E1 outage check MILP, F7's campus", E1.outageModel(def, P, P.scen.jan3)]];
}

module.exports = { dispatch3, dispatch24, storage168, uc24, lessonSet };
