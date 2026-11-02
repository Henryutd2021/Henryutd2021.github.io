// solver_models.js — model builders shared by the solver tests (test_solver.js) and the browser benchmark
// (scripts/learn_solver_bench.mjs). Not a test itself. Each builder returns a model in the LX.solver format
// (assets/learn/components/solver.js). Sizes follow the W1 benchmark set (curriculum v2 §18.3):
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

module.exports = { dispatch3, dispatch24, storage168, uc24 };
