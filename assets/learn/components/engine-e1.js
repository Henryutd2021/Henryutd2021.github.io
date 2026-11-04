/* engine-e1.js — LX.E1: engine E1 of Learn, a campus microgrid sized and run through outage scenarios with a small
   mixed-integer program (MILP), with the host feeder's import and export limits and three owners (wave W3, 2026-11-03;
   curriculum v2 §16.4). Used by the Microgrid Workbench (SB1, learn/sb1-microgrid-workbench.qmd), capstone C1
   (learn/c1-keep-the-campus-running.qmd) and Modeler lesson M5 (learn/m05-microgrid-size-and-run.qmd). No prices: a MILP
   gives none (§9.2), so nothing here reads a dual; any "value" is the difference between two solved plans, said so.

   Data: assets/learn/data/e1-prairie-campus.json (scripts/build_learn_e1_data.mjs): lesson F7's Prairie Campus (fictional;
   flat loads: hospital 300 kW, water and heating plant 100 kW, dorms 250 kW, labs 550 kW), illustrative costs in 2025
   dollars, a teaching solar profile per kW of panels (SPP's observed 2025 hourly shape scaled to EIA's monthly capacity
   factors; not measured campus output), EIA's tariff level, diesel price and CO2 factors, the outage scenarios (the grid
   assumed down in those weather windows: hypothetical outages, not outage records).

   The plan (the schema, LX.ShareState): solar kW (pv), battery kWh (bat; a 4-hour battery, so its kW is kWh / 4), whole
   200 kW generator sets (gen), diesel kept on site in gallons (fuel), each load's priority (must stay on, keep if
   possible, shed first), the outages to plan for (out), the feeder's export and import limits (exp, imp, kW), the
   tariff (tou or flat), the owner (utility, co-op or community: the cost of capital) and what "Size it" may build (allow).

   Two models (every power in kW over one hour = kWh):
   1. The check of a plan ("run", sizes fixed): an LP for the grid-connected year, 12 average days (one per month,
      weighted by its days): solar used s <= pv x sun, battery charge c and discharge d <= bat / 4, stored q <= bat with
      q_h = q_(h-1) + 0.9 c_h - d_h around the day (each average day ends where it began: the battery cycles daily and
      carries nothing from one day to the next), import i <= imp, export e <= exp, s + d + i + x = 1,200 + c + e;
      cost = sum of weight x (tariff_h x i - credit x e), plus $10 per kWh x left unserved (the year may fall short only
      when the import limit is below 1,200 kW and the plan cannot make up the rest; the page then says so, shows the
      kWh and does not compare the cost with the grid-only bill: W3 review SB1 1, C1 3). The generator runs only in
      outages (illustrative rule). The 12 average days smooth the weather: the test checks four plans against a
      chronological 8,760-hour year (F7's campus: the same bill; larger solar-and-battery plans: a bill 4% to 7% higher).
      Then one MILP per outage scenario (islanded; the battery and the tank start full): s + d + g - c = loads served;
      g <= 200 u, g >= 60 u (a set that is on runs at 30% or more), u = sets on, a whole number from 0 to gen;
      fuel: sum 0.07 g <= the gallons on site; each load may be partly served. The objective is a priority order, not
      money: unserved kWh weigh 1,000 (must stay on), 10 (keep if possible), 1 (shed first).
   2. Sizing ("size"): one MILP that chooses pv, bat and gen (a whole number) at the least annual cost (equipment paid
      over its life at the owner's cost of capital, plus upkeep, the tank and the year's grid bill), with every
      must-stay-on load served in every hour of every chosen outage. To keep it small it leaves out the 30% minimum
      (g <= 200 x gen only); the check above then runs the plan with it. The chosen sizes are rounded up to the bench's
      steps (25 kW, 50 kWh) and checked: a safe candidate (more equipment never makes the check worse), not proven the
      cheapest plan on the steps (W3 review SB1 6: a nearby plan on the steps can cost a few dollars less).
   Annual cost (summarize, note): equipment paid over its life plus upkeep and the tank, plus the normal-year grid bill.
   It leaves out the diesel burned in an outage and refilling the tank: each outage reports its gallons and their cost
   at EIA's diesel price on its own, with no outage frequency assumed (W3 review SB1 8, C1 6, M5 5).

   Tie rule (W2 review finding 2; weights restated, W3 review SB1 7): the check's objective is weighted, not a strict
   order. Unserved kWh of must stay on weigh 1,000, keep if possible 10, shed first 1; within a priority each step up the
   list (hospital, water and heat, dorms, labs) adds 0.5% and each hour earlier in the outage up to 2% in all, so an
   earlier hour can outweigh the list order; then 0.01 per gallon of fuel and 0.0001 per kWh through the battery. The
   year LP adds $0.0001 per kWh through the battery; the sizing $0.001 per gallon and $0.000001 per kWh through the
   battery in an outage (a few dollars at most). Totals the page reports (unserved kWh per load, gallons, the bill) are
   what these rules fix; the hourly schedule drawn is one of possibly several with those totals. The test re-solves with
   other tie weights and checks that the totals stay the same.
   Every MILP here stops only within 0.0001% of its best bound (mip_rel_gap 1e-6, not HiGHS's default 0.01%), so the
   reported totals are the optimum's, not a near-optimum's.
   No false certificates (finding 3): "optimal" only when every solve of a run is optimal; a time limit returns the best
   plan found with status "time-limit" and its gap, never "optimal" or "best".

   API (the sandbox contract, learn/_template-sandbox.qmd):
     E1.prepare(cfg) -> P                    the prepared data (scenarios with their sun, the seeded winter outages)
     E1.schema, E1.makeSchema({ key, title, defaults }), E1.presets
     E1.solve(state, P, { task: "run" | "size", signal, timeLimit, attempt, scenarios, solver }) -> Promise of
       { status, ok, kind: "milp", message, hint, results, mipGap, ms }   never rejects; `solver(model, opts)` replaces
       LX.solver.solve (tests stub it); `scenarios` (ids or scenario objects) replaces the plan's outages
     E1.summarize(state, raw), E1.note(state, results, P), E1.fallback(P, page key: "sb1" or "c1")
       results: { plan, owner, rate, equipment, year (bill, imports, exports, unserved, co2, ...), base, total, saving,
       short (the normal year leaves load unserved), comparable (!short: only then is the saving a like-for-like
       comparison), outages [{ must, keep, shed, perLoad, fuel, fuelCost, co2, lasts, hours, ... }], cls, mustKW, ... }
     Models (pure): yearModel, outageModel, sizeModel, read*, costs, roundUp, hint, seeded, forecast, realTime, roll
     Branch and bound on the sizing model's whole numbers (M5): E1.bb.{tree, pending, accept, branch, bound, gap, done,
       proven, retry, verdict, run, layout}
   Node: module.exports = E1 (no DOM). In a page: LX.E1, with the shared view pieces LX.E1.Line (the one-line diagram),
   LX.E1.Bench (the controls, presets, run box with a Stop button and plan link), LX.E1.Results (readouts, tables,
   charts), LX.E1.ui.stopper() (a Stop button for any LX.BenchRun: { busy, attach(run) }; shown while it runs, cancels it).
   Changes after the W3 reviews (2026-11-03; assets/learn/README.md lists them): normal-year unserved load reported and
   the saving withheld when service differs; outage diesel shown with its cost and kept out of the annual cost; the
   sizing's plan adopted from the plan it was given (a change while it runs stops it) and the other results told; a
   Stop button; the tie weights stated; end-of-hour labels in the battery table; realTime brings must-stay-on loads
   back before it charges the battery. */
(function () {
  "use strict";
  var MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var PRIO = ["must", "keep", "shed"];
  var PRIO_NAMES = { must: "Must stay on", keep: "Keep if possible", shed: "Shed first" };
  var PRIO_W = { must: 1000, keep: 10, shed: 1 };
  var TIE = { order: 0.005, time: 0.02, fuel: 0.01, battery: 1e-4, yearBattery: 1e-4, sizeFuel: 1e-3, sizeBattery: 1e-6 };
  var FKEYS = { hospital: "ph", water: "pw", dorms: "pd", labs: "pl" };
  var TOL = 1e-6;

  // ---------------------------------------------------------------- data
  function prepare(cfg) {
    var P = { cfg: cfg, loads: cfg.campus.loads, total: 0, scen: {}, list: [], extra: [], T: cfg.tech };
    P.loads.forEach(function (l) { P.total += l.kw; });
    cfg.scenarios.forEach(function (s) {
      var w = cfg.sun[s.window], sun = w.kw.slice(s.start, s.start + s.hours);
      if (sun.length !== s.hours) throw new Error("E1: scenario " + s.id + " runs past its window");
      var o = { id: s.id, label: s.label, short: s.short, window: s.window, start: s.start, hours: s.hours, sun: sun, first: w.first, day0: w.day0 };
      P.scen[s.id] = o;
      (s.extra ? P.extra : P.list).push(s.id);
    });
    P.seeded = seeded(cfg);
    return P;
  }
  // a small seeded generator (mulberry32, LX.mulberry32 in core.js), so the drawn outages are the same on every page and in
  // the notebook
  var rng = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) || require("./core.js").mulberry32;
  function seeded(cfg) {
    var S = cfg.seeded, w = cfg.sun[S.window], r = rng(S.seed), out = [];
    var firstHour = S.firstDay * 24, lastHour = S.lastStartDay * 24 + 23;
    for (var i = 0; i < S.n; i++) {
      var start = firstHour + Math.floor(r() * (lastHour - firstHour + 1));
      var hours = S.minHours + Math.floor(r() * (S.maxHours - S.minHours + 1));
      var o = { id: "s" + (i + 1), window: S.window, start: start, hours: hours, sun: w.kw.slice(start, start + hours), first: w.first, day0: w.day0, seeded: true };
      o.label = "Outage " + (i + 1) + ": " + hours + " hours from " + when(o, 0);
      o.short = "#" + (i + 1) + " · " + hours + " h";
      out.push(o);
    }
    return out;
  }
  // "20 Jan 16:00": hour t of a scenario
  function when(sc, t) {
    var d = new Date(Date.UTC(+sc.first.slice(0, 4), +sc.first.slice(5, 7) - 1, +sc.first.slice(8, 10)));
    var h = sc.start + t; d.setUTCDate(d.getUTCDate() + Math.floor(h / 24));
    return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + hh(h % 24);
  }
  function hh(h) { return (h < 10 ? "0" : "") + h + ":00"; }
  // the end of hour t (the battery's charge and the diesel left are states at the end of the hour: W3 review SB1 13, M5 11)
  function hourEnd(sc, t) { return when(sc, t + 1); }

  // ---------------------------------------------------------------- the plan
  function makeSchema(o) {
    o = o || {};
    var C = o.cfg && o.cfg.limits || { pv: [0, 4000, 25], bat: [0, 8000, 50], gen: [0, 4, 1], fuel: [0, 6000, 25], exp: [0, 2000, 50], imp: [800, 2000, 50] };
    var D = { pv: 600, bat: 2000, gen: 2, fuel: 675, ph: "must", pw: "must", pd: "keep", pl: "shed", out: ["jan3"], exp: 500, imp: 2000, tar: "tou", own: "community", allow: ["pv", "bat", "gen"] };
    for (var k in (o.defaults || {})) D[k] = o.defaults[k];
    var pr = function (id, short, label) { return { id: id, short: short, type: "enum", values: PRIO, names: PRIO_NAMES, def: D[id], label: label }; };
    return {
      key: o.key || "mg", version: 1, title: o.title || "Microgrid plan",
      fields: [
        { id: "pv", short: "pv", type: "int", min: C.pv[0], max: C.pv[1], step: C.pv[2], def: D.pv, label: "Solar panels", unit: "kW" },
        { id: "bat", short: "b", type: "int", min: C.bat[0], max: C.bat[1], step: C.bat[2], def: D.bat, label: "Battery", unit: "kWh" },
        { id: "gen", short: "g", type: "int", min: C.gen[0], max: C.gen[1], step: 1, def: D.gen, label: "Generator sets (200 kW each)", unit: "sets", range: "0 to 4 whole sets" },
        { id: "fuel", short: "f", type: "int", min: C.fuel[0], max: C.fuel[1], step: C.fuel[2], def: D.fuel, label: "Diesel on site", unit: "gallons" },
        pr("ph", "ph", "County hospital"), pr("pw", "pw", "Water and heating plant"), pr("pd", "pd", "Dorms"), pr("pl", "pl", "Classrooms and labs"),
        { id: "out", short: "o", type: "set", values: ["jan3", "eve1", "jul3"], names: { jan3: "Winter storm, 3 days", eve1: "Winter evening, 1 day", jul3: "Summer storm, 3 days" }, def: D.out, label: "Outages to plan for" },
        { id: "exp", short: "ex", type: "int", min: C.exp[0], max: C.exp[1], step: C.exp[2], def: D.exp, label: "Feeder export limit", unit: "kW" },
        { id: "imp", short: "im", type: "int", min: C.imp[0], max: C.imp[1], step: C.imp[2], def: D.imp, label: "Feeder import limit", unit: "kW" },
        { id: "tar", short: "t", type: "enum", values: ["tou", "flat"], names: { tou: "Time-of-use", flat: "Flat" }, def: D.tar, label: "Tariff" },
        { id: "own", short: "w", type: "enum", values: ["utility", "coop", "community"], names: { utility: "Utility-owned", coop: "Co-op-owned", community: "Community-owned" }, def: D.own, label: "Owner" },
        { id: "allow", short: "al", type: "set", values: ["pv", "bat", "gen"], names: { pv: "solar", bat: "battery", gen: "generator sets" }, def: D.allow, label: "Size it may build" }]
    };
  }
  var schema = makeSchema();
  var presets = [
    { id: "f7", label: "F7's campus", state: { pv: 600, bat: 2000, gen: 2, fuel: 675 }, note: "Lesson F7's microgrid as built" },
    { id: "diesel", label: "Diesel only", state: { pv: 0, bat: 0, gen: 2, fuel: 675 }, note: "Two generator sets and a day of fuel, no solar or battery" },
    { id: "sun", label: "Solar and battery", state: { pv: 2000, bat: 6000, gen: 0, fuel: 0 }, note: "No diesel at all" }
  ];
  function prio(state, key) { return state[FKEYS[key]]; }
  function classes(state, P) {
    var c = { must: [], keep: [], shed: [] };
    P.loads.forEach(function (l, k) { c[prio(state, l.key)].push(k); });
    return c;
  }
  function kwOf(P, ks) { return ks.reduce(function (s, k) { return s + P.loads[k].kw; }, 0); }
  function rate(P, state, h) {
    var T = P.cfg.grid.tariffs;
    return state.tar === "flat" ? T.flat.rate : (h >= T.tou.peak[0] && h < T.tou.peak[1] ? T.tou.on : T.tou.off);
  }
  function crf(r, n) { var a = Math.pow(1 + r, n); return r * a / (a - 1); }
  function owner(P, state) { return P.cfg.owners.filter(function (o) { return o.key === state.own; })[0] || P.cfg.owners[0]; }
  // what each kW or kWh costs a year at this owner's cost of capital, and the plan's equipment cost
  function costs(state, P, sizes) {
    var T = P.T, r = owner(P, state).rate, z = sizes || state;
    var per = { pv: T.pv.capex * crf(r, T.pv.life) + T.pv.fom, bat: T.bat.capex * (crf(r, T.bat.life) + T.bat.fomShare),
      gen: T.gen.unitKW * (T.gen.capex * crf(r, T.gen.life) + T.gen.fom), tank: T.tank.capexPerGal * crf(r, T.tank.life) };
    var a = { pv: per.pv * z.pv, bat: per.bat * z.bat, gen: per.gen * z.gen, tank: per.tank * (z.fuel != null ? z.fuel : state.fuel) };
    a.equipment = a.pv + a.bat + a.gen + a.tank;
    return { rate: r, per: per, annual: a };
  }
  // the year's bill with nothing built: the campus's flat 1,200 kW on the tariff
  function baseBill(state, P) {
    var b = 0;
    for (var m = 0; m < 12; m++) for (var h = 0; h < 24; h++) b += MD[m] * rate(P, state, h) / 100 * P.total;
    return b;
  }

  // ---------------------------------------------------------------- model 1a: the grid-connected year (LP)
  // o.size: S and B are variables of a sizing model (rows instead of bounds); o.slack: unserved kWh allowed at a penalty
  function yearVars(state, P, o, V, C) {
    var size = !!o.size, eta = P.T.bat.eff, credit = P.cfg.grid.exportCredit / 100, tb = o.tieBattery != null ? o.tieBattery : TIE.yearBattery;
    for (var m = 0; m < 12; m++) {
      var w = MD[m];
      for (var h = 0; h < 24; h++) {
        var p = "y" + m + "_" + h, sun = P.cfg.sun.months[m][h];
        V.push({ name: p + "i", ub: state.imp, cost: w * rate(P, state, h) / 100 }, { name: p + "e", ub: state.exp, cost: -w * credit },
          { name: p + "s", ub: size ? Infinity : state.pv * sun }, { name: p + "c", ub: size ? Infinity : state.bat / 4, cost: w * tb },
          { name: p + "d", ub: size ? Infinity : state.bat / 4, cost: w * tb }, { name: p + "q", ub: size ? Infinity : state.bat });
        var b = [[p + "s", 1], [p + "d", 1], [p + "i", 1], [p + "c", -1], [p + "e", -1]];
        if (o.slack) { V.push({ name: p + "x", cost: w * o.slack }); b.push([p + "x", 1]); }
        C.push({ name: p + "bal", terms: b, eq: P.total });
        C.push({ name: p + "soc", terms: [[p + "q", 1], ["y" + m + "_" + ((h + 23) % 24) + "q", -1], [p + "c", -eta], [p + "d", 1]], eq: 0 });
        if (size) {
          C.push({ name: p + "pv", terms: [[p + "s", 1], ["S", -sun]], le: 0 }, { name: p + "cB", terms: [[p + "c", 1], ["B", -0.25]], le: 0 },
            { name: p + "dB", terms: [[p + "d", 1], ["B", -0.25]], le: 0 }, { name: p + "qB", terms: [[p + "q", 1], ["B", -1]], le: 0 });
        }
      }
    }
  }
  function yearModel(state, P, o) {
    o = o || {};
    var V = [], C = [];
    yearVars(state, P, { slack: o.slack == null ? 10 : o.slack, tieBattery: o.tieBattery }, V, C);
    return { sense: "min", variables: V, constraints: C };
  }
  function readYear(state, P, r) {
    if (!r || !r.values) return null;
    var x = r.values, credit = P.cfg.grid.exportCredit / 100, y = { bill: 0, imports: 0, exports: 0, solar: 0, unserved: 0, cycled: 0, days: [] };
    for (var m = 0; m < 12; m++) {
      var day = [];
      for (var h = 0; h < 24; h++) {
        var p = "y" + m + "_" + h, i = x[p + "i"], e = x[p + "e"];
        y.bill += MD[m] * (rate(P, state, h) / 100 * i - credit * e);
        y.imports += MD[m] * i; y.exports += MD[m] * e; y.solar += MD[m] * x[p + "s"]; y.cycled += MD[m] * x[p + "d"];
        y.unserved += MD[m] * (x[p + "x"] || 0);
        day.push({ h: h, i: i, e: e, s: x[p + "s"], c: x[p + "c"], d: x[p + "d"], q: x[p + "q"] });
      }
      y.days.push(day);
    }
    y.co2 = y.imports * P.cfg.grid.co2 / 1000;   // tonnes
    return y;
  }

  // ---------------------------------------------------------------- model 1b: one outage (MILP)
  // sc: { sun: [...], hours }; o: { init: { soc, fuel } (default: full), sun (forecast in place of sc.sun), tie: {...} }
  function outageModel(state, P, sc, o) {
    o = o || {};
    var T = P.T, U = T.gen.unitKW, eta = T.bat.eff, sun = o.sun || sc.sun, H = sun.length, V = [], C = [], fuel = [];
    var tie = {}; for (var k in TIE) tie[k] = TIE[k]; for (k in (o.tie || {})) tie[k] = o.tie[k];
    var init = o.init || {}, q0 = init.soc != null ? init.soc : state.bat, f0 = init.fuel != null ? init.fuel : state.fuel;
    for (var t = 0; t < H; t++) {
      var p = "t" + t;
      V.push({ name: p + "s", ub: state.pv * sun[t] }, { name: p + "c", ub: state.bat / 4, cost: tie.battery }, { name: p + "d", ub: state.bat / 4, cost: tie.battery },
        { name: p + "q", ub: state.bat }, { name: p + "g", ub: U * state.gen, cost: tie.fuel * T.gen.galPerKWh }, { name: p + "u", ub: state.gen, type: o.relax ? "continuous" : "integer" });
      var b = [[p + "s", 1], [p + "d", 1], [p + "g", 1], [p + "c", -1]];
      P.loads.forEach(function (l, k) {
        var W = PRIO_W[prio(state, l.key)] * (1 + tie.order * (P.loads.length - 1 - k)) * (1 + tie.time * (H - t) / H);
        V.push({ name: p + "x" + k, ub: l.kw, cost: W }); b.push([p + "x" + k, 1]);
      });
      C.push({ name: p + "bal", terms: b, eq: P.total });
      C.push(t > 0 ? { name: p + "soc", terms: [[p + "q", 1], ["t" + (t - 1) + "q", -1], [p + "c", -eta], [p + "d", 1]], eq: 0 }
        : { name: p + "soc", terms: [[p + "q", 1], [p + "c", -eta], [p + "d", 1]], eq: q0 });
      C.push({ name: p + "gx", terms: [[p + "g", 1], [p + "u", -U]], le: 0 }, { name: p + "gn", terms: [[p + "g", 1], [p + "u", -U * T.gen.minLoad]], ge: 0 });
      fuel.push([p + "g", T.gen.galPerKWh]);
    }
    C.push({ name: "fuel", terms: fuel, le: f0 });
    return { sense: "min", variables: V, constraints: C };
  }
  // the outage's results; with o.sun (a forecast) the "planned" sun, else the scenario's real sun
  function readOutage(state, P, sc, r, o) {
    if (!r || !r.values) return null;
    o = o || {};
    var x = r.values, sun = o.sun || sc.sun, H = sun.length, cls = classes(state, P), T = P.T;
    var out = { id: sc.id, hours: [], perLoad: P.loads.map(function () { return 0; }), fuel: 0, solar: 0, gen: 0, firstShort: null, setsMax: 0 };
    for (var t = 0; t < H; t++) {
      var p = "t" + t, hr = { t: t, s: x[p + "s"], c: x[p + "c"], d: x[p + "d"], q: x[p + "q"], g: x[p + "g"], u: Math.round(x[p + "u"]), x: [], sun: state.pv * sun[t] };
      P.loads.forEach(function (l, k) { var v = clean(x[p + "x" + k]); hr.x.push(v); out.perLoad[k] += v; });
      hr.must = cls.must.reduce(function (s, k) { return s + hr.x[k]; }, 0);
      if (hr.must > 1e-3 && out.firstShort === null) out.firstShort = t;
      out.fuel += T.gen.galPerKWh * hr.g; out.solar += hr.s; out.gen += hr.g; out.setsMax = Math.max(out.setsMax, hr.u);
      out.hours.push(hr);
    }
    sums(out, cls);
    out.co2 = out.fuel * P.cfg.fuel.co2;   // kg
    out.lasts = out.firstShort === null ? H : out.firstShort;
    return out;
  }
  function clean(v) { return v < 1e-6 ? 0 : v; }
  function sums(out, cls) {
    ["must", "keep", "shed"].forEach(function (c) { out[c] = cls[c].reduce(function (s, k) { return s + out.perLoad[k]; }, 0); });
  }

  // ---------------------------------------------------------------- model 2: sizing (MILP)
  function sizeModel(state, P, scens, o) {
    o = o || {};
    var T = P.T, U = T.gen.unitKW, eta = T.bat.eff, lim = P.cfg.limits, cs = costs(state, P, { pv: 1, bat: 1, gen: 1, fuel: 1 });
    var al = state.allow || [], V = [], C = [], cls = classes(state, P), must = kwOf(P, cls.must), other = P.total - must;
    V.push({ name: "S", ub: al.indexOf("pv") >= 0 ? lim.pv[1] : 0, cost: cs.per.pv },
      { name: "B", ub: al.indexOf("bat") >= 0 ? lim.bat[1] : 0, cost: cs.per.bat },
      { name: "N", ub: al.indexOf("gen") >= 0 ? lim.gen[1] : 0, type: o.relax ? "continuous" : "integer", cost: cs.per.gen });
    if (o.bounds) V.forEach(function (v) { var b = o.bounds[v.name]; if (b) { if (b.lb != null) v.lb = Math.max(v.lb || 0, b.lb); if (b.ub != null) v.ub = Math.min(v.ub, b.ub); } });
    yearVars(state, P, { size: true }, V, C);
    scens.forEach(function (sc, j) {
      var fuel = [];
      for (var t = 0; t < sc.sun.length; t++) {
        var p = "o" + j + "_" + t;
        V.push({ name: p + "s" }, { name: p + "c", cost: TIE.sizeBattery }, { name: p + "d", cost: TIE.sizeBattery }, { name: p + "q" },
          { name: p + "g", cost: TIE.sizeFuel * T.gen.galPerKWh }, { name: p + "o", ub: other });
        C.push({ name: p + "bal", terms: [[p + "s", 1], [p + "d", 1], [p + "g", 1], [p + "c", -1], [p + "o", -1]], eq: must });
        C.push(t > 0 ? { name: p + "soc", terms: [[p + "q", 1], ["o" + j + "_" + (t - 1) + "q", -1], [p + "c", -eta], [p + "d", 1]], eq: 0 }
          : { name: p + "soc", terms: [[p + "q", 1], ["B", -1], [p + "c", -eta], [p + "d", 1]], eq: 0 });
        C.push({ name: p + "pv", terms: [[p + "s", 1], ["S", -sc.sun[t]]], le: 0 }, { name: p + "cB", terms: [[p + "c", 1], ["B", -0.25]], le: 0 },
          { name: p + "dB", terms: [[p + "d", 1], ["B", -0.25]], le: 0 }, { name: p + "qB", terms: [[p + "q", 1], ["B", -1]], le: 0 },
          { name: p + "gN", terms: [[p + "g", 1], ["N", -U]], le: 0 });
        fuel.push([p + "g", T.gen.galPerKWh]);
      }
      C.push({ name: "o" + j + "_fuel", terms: fuel, le: state.fuel });
    });
    return { sense: "min", variables: V, constraints: C, offset: cs.per.tank * state.fuel };
  }
  function readSize(state, P, r) {
    if (!r || !r.values) return null;
    var x = r.values, exact = { pv: Math.max(0, x.S), bat: Math.max(0, x.B), gen: Math.round(x.N) }, credit = P.cfg.grid.exportCredit / 100, bill = 0;
    for (var m = 0; m < 12; m++) for (var h = 0; h < 24; h++) bill += MD[m] * (rate(P, state, h) / 100 * x["y" + m + "_" + h + "i"] - credit * x["y" + m + "_" + h + "e"]);
    var eq = costs(state, P, { pv: exact.pv, bat: exact.bat, gen: exact.gen, fuel: state.fuel }).annual;
    return { exact: exact, objective: r.objective, bill: bill, equipment: eq.equipment, total: eq.equipment + bill, rounded: roundUp(P, exact), status: r.status, gap: r.mipGap };
  }
  // sizes rounded up to the bench's steps (more equipment never makes the check worse: curtailing is free and the
  // battery starts full)
  function roundUp(P, z) {
    var L = P.cfg.limits, up = function (v, s, hi) { return Math.min(hi, Math.ceil(v / s - 1e-6) * s); };
    return { pv: up(z.pv, L.pv[2], L.pv[1]), bat: up(z.bat, L.bat[2], L.bat[1]), gen: Math.round(z.gen) };
  }
  // what to change after an infeasible sizing, in words (the first rule that applies)
  function hint(state, P, scens) {
    var cls = classes(state, P), must = kwOf(P, cls.must), al = state.allow || [], U = P.T.gen.unitKW;
    if (state.imp < P.total && al.indexOf("bat") < 0) return "The feeder's import limit (" + state.imp.toLocaleString("en-US") + " kW) is below the campus's " + P.total.toLocaleString("en-US") + " kW: raise it, or let Size it build a battery.";
    if (state.imp < P.total) return "The feeder's import limit (" + state.imp.toLocaleString("en-US") + " kW) is below the campus's " + P.total.toLocaleString("en-US") + " kW every hour: raise it.";
    if (!scens.length || !must) return "Check the plan's limits.";
    if (al.indexOf("gen") < 0 && al.indexOf("bat") < 0) return "Without a battery or generator sets nothing carries the must-stay-on loads at night: allow one of them.";
    var genMax = al.indexOf("gen") >= 0 ? P.cfg.limits.gen[1] * U : 0;
    if (al.indexOf("bat") < 0 && genMax < must) return "Four sets give at most " + genMax + " kW, below the " + must + " kW that must stay on: allow a battery, or move a load to keep if possible.";
    if (al.indexOf("gen") >= 0 && state.fuel < 1) return "The generator sets have no fuel: add diesel, or move a load to keep if possible.";
    return "Even the largest plan cannot carry the " + must + " kW that must stay on through every chosen outage: add diesel, allow more equipment, or move a load to keep if possible.";
  }

  // ---------------------------------------------------------------- solving (the contract's solve)
  var RANK = { optimal: 0, "time-limit": 2, "iteration-limit": 2, "objective-bound": 2, "objective-target": 2, interrupted: 2, infeasible: 3, "infeasible-or-unbounded": 3, unbounded: 3, cancelled: 4, superseded: 4, error: 5 };
  function worst(list) { var w = "optimal"; list.forEach(function (s) { if ((RANK[s] == null ? 5 : RANK[s]) > (RANK[w] == null ? 5 : RANK[w])) w = s; }); return w; }
  function scenList(state, P, opts) {
    var ids = opts && opts.scenarios ? opts.scenarios : (state.out || []);
    return ids.map(function (s) { return typeof s === "string" ? P.scen[s] : s; }).filter(Boolean);
  }
  function solve(state, P, opts) {
    opts = opts || {};
    var task = opts.task || "run", attempt = opts.attempt || 1, limit = opts.timeLimit != null ? opts.timeLimit : (attempt > 1 ? 10 : 3);
    var call = opts.solver || (typeof window !== "undefined" && window.LX && window.LX.solver ? function (m, so) { return window.LX.solver.solve(m, so); } : null);
    var t0 = Date.now(), raw = { task: task, state: state, solves: [] };
    function fail(e) { return { status: "error", ok: false, kind: "milp", message: "The run failed before it gave an answer" + (e && e.message ? " (" + e.message + ")." : "."), results: null, mipGap: null }; }
    if (!call) return Promise.resolve(fail(new Error("no solver")));
    function one(model, label, gap) {
      var p;
      try { p = Promise.resolve(call(model, { timeLimit: limit, signal: opts.signal, gap: gap, label: label })); }
      catch (e) { p = Promise.resolve({ status: "error", ok: false, message: e && e.message }); }
      return p.then(function (r) { r = r && typeof r === "object" ? r : { status: "error", ok: false }; raw.solves.push({ label: label, status: r.status, mipGap: r.mipGap, ms: r.ms && r.ms.roundTrip }); return r; },
        function (e) { var r = { status: "error", ok: false, message: e && e.message }; raw.solves.push({ label: label, status: "error" }); return r; });
    }
    function stop(r) { return r.status === "cancelled" || r.status === "superseded" || r.status === "error" || !r.values; }
    function runPlan(plan) {
      var scs = scenList(plan, P, opts);
      return one(yearModel(plan, P), "e1-year", 1e-6).then(function (ry) {
        raw.year = ry;
        if (stop(ry)) return null;
        var outs = [], k = 0;
        function next() {
          if (k >= scs.length) return outs;
          var sc = scs[k++];
          return one(outageModel(plan, P, sc), "e1-outage", 1e-6).then(function (ro) { outs.push({ sc: sc, r: ro }); return stop(ro) ? outs : next(); });
        }
        return Promise.resolve(next()).then(function (o) { raw.outages = o; return o; });
      });
    }
    var chain;
    if (task === "size") {
      var scs = scenList(state, P, opts);
      chain = one(sizeModel(state, P, scs), "e1-size", 1e-6).then(function (rs) {
        raw.size = rs;
        if (stop(rs) || !rs.values) return null;
        raw.sized = readSize(state, P, rs);
        var plan = {}; for (var k in state) plan[k] = state[k];
        if (opts.check === false) { plan.pv = raw.sized.rounded.pv; plan.bat = raw.sized.rounded.bat; plan.gen = raw.sized.rounded.gen; raw.plan = plan; return null; }
        plan.pv = raw.sized.rounded.pv; plan.bat = raw.sized.rounded.bat; plan.gen = raw.sized.rounded.gen;
        raw.plan = plan;
        return runPlan(plan);
      });
    } else { raw.plan = state; chain = runPlan(state); }
    return chain.then(function () {
      var sts = raw.solves.map(function (s) { return s.status; }), st = worst(sts);
      if (!raw.solves.length) st = "error";
      var gaps = raw.solves.map(function (s) { return s.mipGap; }).filter(function (g) { return g != null && isFinite(g); });
      var gap = gaps.length ? Math.max.apply(null, gaps) : null;
      // a proven optimum's gap below 0.005% is reported as 0 (BenchRun prints the gap to two decimals); gapRaw keeps it
      var res = { status: st, ok: st === "optimal", kind: "milp", mipGap: st === "optimal" && gap != null && gap < 5e-5 ? 0 : gap, gapRaw: gap, ms: { roundTrip: Date.now() - t0 }, raw: raw, results: null, message: null, hint: null };
      var complete = raw.year && raw.year.values && raw.outages && raw.outages.length === scenList(raw.plan || state, P, opts).length && raw.outages.every(function (o) { return o.r && o.r.values; });
      if (task === "size" && raw.size && /infeasible/.test(raw.size.status)) {
        res.status = "infeasible"; res.ok = false; res.hint = hint(state, P, scenList(state, P, opts));
        res.message = "No plan within the bench's limits carries the must-stay-on loads through every chosen outage.";
        return res;
      }
      if (complete) res.results = summarize(raw.plan, { P: P, raw: raw, task: task });
      else if (task === "size" && opts.check === false && raw.sized) res.results = { sizeOnly: true, sized: raw.sized, plan: raw.plan };
      if (st === "optimal" && !res.results) { res.status = "error"; res.ok = false; }
      if (res.status !== "optimal" && RANK[res.status] === 2) {
        var lim = (limit >= 1 ? Math.round(limit) : limit) + " s";
        res.message = res.results
          ? "Stopped at the " + lim + " time limit: the plan shown is the best found so far" + (gap != null ? ", within " + (gap * 100).toFixed(2) + "% of the best bound" : "") + ". It is not proven optimal. Try again gives the solver more time."
          : "Stopped at the " + lim + " time limit before any plan was found, so no result is shown. Try again gives the solver more time.";
      }
      if (res.status === "optimal") res.message = task === "size"
        ? "Sized: the mixed-integer program reports this plan as optimal" + (gap ? ", within " + (gap * 100).toFixed(4) + "% of the best bound" : "") + "."
        : "Done: every solve of this run (the year and " + (raw.outages || []).length + " outage" + ((raw.outages || []).length === 1 ? "" : "s") + ") reports optimal.";
      if (res.status === "error" && !res.message) res.message = "The run failed before it gave an answer" + (raw.solves.filter(function (s) { return s.status === "error"; }).length ? "." : " (" + st + ").");
      return res;
    }, function (e) { return fail(e); });
  }

  // ---------------------------------------------------------------- what the page shows (pure)
  function summarize(state, ctx) {
    var P = ctx.P, raw = ctx.raw, y = readYear(state, P, raw.year), cs = costs(state, P);
    var res = { plan: { pv: state.pv, bat: state.bat, gen: state.gen, fuel: state.fuel, imp: state.imp, exp: state.exp }, owner: owner(P, state), task: ctx.task,
      equipment: cs.annual, rate: cs.rate, year: y, base: baseBill(state, P), outages: [], sized: raw.sized || null };
    res.total = cs.annual.equipment + y.bill;
    res.saving = res.base - res.total;
    // a plan that leaves load unserved in a normal year buys less service than the grid-only bill: the saving is then
    // not a like-for-like comparison, and the pages say so instead of showing it as a saving
    res.short = y.unserved > 0.5;
    res.comparable = !res.short;
    res.fuelPrice = P.cfg.fuel.price;
    (raw.outages || []).forEach(function (o) {
      var r = readOutage(state, P, o.sc, o.r);
      r.label = o.sc.label; r.short = o.sc.short; r.status = o.r.status; r.gap = o.r.mipGap; r.sc = o.sc;
      r.fuelCost = r.fuel * P.cfg.fuel.price;   // this outage's diesel at EIA's 2025 price: not in the annual cost
      res.outages.push(r);
    });
    res.cls = classes(state, P);
    res.mustKW = kwOf(P, res.cls.must);
    res.fuelUsed = res.outages.reduce(function (s, o) { return Math.max(s, o.fuel); }, 0);
    return res;
  }
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function kilo(v) { return Math.round(v).toLocaleString("en-US"); }
  // the annual cost's boundary, in one line (the pages and the note say the same)
  var COST_NOTE = "equipment and upkeep plus the normal-year grid bill (12 average days), 2025 dollars; outage diesel not included";
  // an outage's diesel bill, to the nearest $10 (so 675 gallons at $3.66 reads $2,470 whether 674.9 or 675.1 burned)
  function fuelMoney(v) { return money(Math.round(v / 10) * 10); }
  // "675 gallons of diesel burned ($2,470 at $3.66 a gallon, not in the annual cost)"
  function fuelWords(o, R) { return kilo(o.fuel) + " gallons of diesel burned (" + fuelMoney(o.fuelCost) + " at $" + R.fuelPrice.toFixed(2) + " a gallon, not in the annual cost)"; }
  function note(state, R, P) {
    var p = R.plan, cls = R.cls;
    var names = function (ks) { return ks.map(function (k) { return P ? P.loads[k].short.toLowerCase() : k; }).join(", ") || "none"; };
    return {
      heading: "Prairie Campus: " + kilo(p.pv) + " kW of solar, a " + kilo(p.bat) + " kWh battery and " + p.gen + " generator set" + (p.gen === 1 ? "" : "s"),
      made: "the Microgrid Workbench (engine E1, a small mixed-integer program)",
      plan: [{ label: "Solar panels", value: kilo(p.pv) + " kW" }, { label: "Battery", value: kilo(p.bat) + " kWh (" + kilo(p.bat / 4) + " kW)" },
        { label: "Generator sets", value: p.gen + " × 200 kW" }, { label: "Diesel on site", value: kilo(p.fuel) + " gallons" },
        { label: "Must stay on", value: names(cls.must) }, { label: "Owner", value: R.owner.label + " (" + Math.round(R.rate * 100) + "% real cost of capital)" }],
      results: [{ label: "Annual cost", value: money(R.total), note: COST_NOTE }]
        .concat(R.short ? [{ label: "Unserved in a normal year on the grid", value: kilo(R.year.unserved) + " kWh", note: "the feeder's import limit and this plan cannot carry the whole campus, so the cost is not comparable with the grid-only bill" }] : [])
        .concat([{ label: "The year's bill with nothing built", value: money(R.base) }]).concat(R.outages.map(function (o) {
          return { label: "Unserved must-stay-on load, " + o.short.toLowerCase(), value: kilo(o.must) + " kWh", note: fuelWords(o, R) + ", " + (o.co2 / 1000).toFixed(1) + " t CO2" };
        })).concat([{ label: "CO2 from grid electricity in a normal year", value: kilo(R.year.co2) + " t", note: "U.S. average CO2 per kWh, from operation only" }]),
      assumptions: ["Prairie Campus and its loads are fictional (lesson F7's), each load flat in every hour",
        "Costs are illustrative 2025 dollars; the tariff is set to EIA's 2025 U.S. commercial average",
        "The annual cost leaves out the diesel burned in an outage and refilling the tank; no outage frequency is assumed",
        "The battery and the diesel tank are full when an outage starts; no fuel arrives during it",
        "The model knows the coming sun (perfect foresight); the sun is a teaching profile from SPP's 2025 hourly solar, not measured campus output"],
      sensitivity: null,
      limits: ["It checks only the outages chosen: a different start, a longer storm or a broken set can turn out worse",
        "Its year is 12 average days: over a full 8,760-hour year, a large solar-and-battery plan's grid bill comes out up to 7% higher",
        "It leaves out the network inside the campus, the generator's part-load fuel use and battery wear"]
    };
  }
  // the no-JS tables of the default plan's precomputed run (written into the data by the test's --write mode)
  function fallback(P, key) {
    var pc = P.cfg.precomputed && P.cfg.precomputed[key || "sb1"];
    if (!pc) return "";
    var e = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var rows = pc.rows.map(function (r) { return "<tr><td>" + e(r[0]) + "</td><td class=\"n\">" + e(r[1]) + "</td></tr>"; }).join("");
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">" + e(pc.head) + "</th><th scope=\"col\">Value</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      "<p class=\"lx-hint\">" + e(pc.note) + "</p>";
  }

  // ---------------------------------------------------------------- rolling horizon on forecasts (M5)
  // the forecast at hour t0 of a scenario, for hours t0 .. end: "perfect" (the real sun), "persist" (each hour's sun on
  // the last full day before t0's day), "sunny" / "dull" (persist times a factor, at most the panels' size)
  function forecast(P, sc, t0, key) {
    if (key === "perfect") return sc.sun.slice(t0);
    var F = P.cfg.forecasts.filter(function (f) { return f.key === key; })[0] || {}, w = P.cfg.sun[sc.window].kw;
    var abs0 = sc.start + t0, lastDay = Math.floor(abs0 / 24) - 1, out = [];
    for (var t = t0; t < sc.sun.length; t++) {
      var h = (sc.start + t) % 24, v = lastDay >= 0 ? w[lastDay * 24 + h] : 0;
      out.push(F.factor ? Math.min(1, v * F.factor) : v);
    }
    return out;
  }
  // one real hour, following the plan: the planned sets stay on (or off) and the plan's loads are the targets. The real
  // sun all goes in first, then the plan's generator output. Short: the battery, then the sets up to full, then loads
  // shed in reverse priority (shed first, keep if possible, must stay on; the list's last load first). Spare: first the
  // must-stay-on loads the plan shed come back (the forecast was gloomier than the sun; W3 review M5 1: before, the
  // battery charged first and left them short), then the sets go down to their minimum, then the battery charges, then
  // the other shed loads come back in priority order, then the panels are curtailed. Returns the hour and the new
  // state { soc, fuel }.
  function realTime(state, P, h, st) {
    var T = P.T, U = T.gen.unitKW, eta = T.bat.eff, gpk = T.gen.galPerKWh;
    var u = Math.max(0, Math.min(state.gen, Math.round(h.u || 0)));
    while (u > 0 && st.fuel < U * T.gen.minLoad * u * gpk - 1e-9) u--;          // too little fuel left to run a set at its minimum
    var gmin = U * T.gen.minLoad * u, gmax = Math.min(U * u, st.fuel / gpk);
    var order = [];                                       // loads from the first to shed to the last
    ["shed", "keep", "must"].forEach(function (c) { for (var k = P.loads.length - 1; k >= 0; k--) if (prio(state, P.loads[k].key) === c) order.push(k); });
    var serve = P.loads.map(function (l, k) { return Math.max(0, Math.min(l.kw, l.kw - (h.x ? h.x[k] : 0))); });   // the plan's targets
    var load = serve.reduce(function (a, b) { return a + b; }, 0), sun = state.pv * h.sunReal, s = sun;
    var g = Math.max(gmin, Math.min(gmax, h.g == null ? 0 : h.g));
    var dMax = Math.min(state.bat / 4, st.soc), cMax = Math.min(state.bat / 4, (state.bat - st.soc) / eta);
    var net = load - s - g, d = 0, c = 0, i, k;
    if (net > 1e-9) {
      d = Math.min(net, dMax); net -= d;
      var up = Math.min(net, gmax - g); g += up; net -= up;
      for (i = 0; i < order.length && net > 1e-9; i++) { k = order[i]; var cut = Math.min(serve[k], net); serve[k] -= cut; net -= cut; }
    } else if (net < -1e-9) {
      var spare = -net, add;
      for (i = order.length - 1; i >= 0 && spare > 1e-9; i--) { k = order[i]; if (prio(state, P.loads[k].key) !== "must") continue; add = Math.min(P.loads[k].kw - serve[k], spare); serve[k] += add; spare -= add; }
      var down = Math.min(spare, g - gmin); g -= down; spare -= down;
      c = Math.min(spare, cMax); spare -= c;
      for (i = order.length - 1; i >= 0 && spare > 1e-9; i--) { k = order[i]; add = Math.min(P.loads[k].kw - serve[k], spare); serve[k] += add; spare -= add; }
      s -= Math.min(spare, s);
    }
    var soc = Math.min(state.bat, Math.max(0, st.soc + eta * c - d)), fuel = Math.max(0, st.fuel - gpk * g);
    var x = P.loads.map(function (l, k2) { return clean(l.kw - serve[k2]); });
    return { hour: { s: s, c: c, d: d, g: g, u: u, x: x, q: soc, sun: sun }, state: { soc: soc, fuel: fuel } };
  }
  // the outage run with a rolling horizon: every `every` hours, plan the rest of the outage on the forecast (a MILP),
  // keep its sets on or off for the next `every` hours and balance each against the real sun with realTime().
  // solveFn(model) -> Promise of a solver result. Returns a Promise of { hours, totals, plans, status }.
  function roll(state, P, sc, key, solveFn, o) {
    o = o || {};
    var every = o.every || P.cfg.rolling.every, H = sc.sun.length, st = { soc: state.bat, fuel: state.fuel }, hours = [], plans = [], cls = classes(state, P);
    var stats = [];
    function stepAt(t0) {
      if (t0 >= H) return Promise.resolve();
      var fc = forecast(P, sc, t0, key), m = outageModel(state, P, { sun: fc }, { init: st, sun: fc });
      if (o.onStep) o.onStep(t0, H);
      return Promise.resolve(solveFn(m, t0)).then(function (r) {
        stats.push(r ? r.status : "error");
        var pl = r && r.values ? readOutage(state, P, { id: sc.id, sun: fc }, r, { sun: fc }) : null;
        plans.push({ t0: t0, status: r ? r.status : "error", plannedMust: pl ? pl.must : null, gap: r ? r.mipGap : null });
        for (var t = t0; t < Math.min(H, t0 + every); t++) {
          var ph = pl ? pl.hours[t - t0] : { u: state.gen, g: Infinity, x: null };
          var rt = realTime(state, P, { u: ph.u, g: ph.g, x: ph.x, sunReal: sc.sun[t] }, st);
          rt.hour.t = t; hours.push(rt.hour); st = rt.state;
        }
        if (!pl && r && (r.status === "cancelled" || r.status === "superseded")) return Promise.reject(r);
        return stepAt(t0 + every);
      });
    }
    return stepAt(0).then(function () {
      var tot = { perLoad: P.loads.map(function () { return 0; }), fuel: 0, firstShort: null };
      hours.forEach(function (h) {
        h.x.forEach(function (v, k) { tot.perLoad[k] += v; });
        tot.fuel += P.T.gen.galPerKWh * h.g;
        var m = cls.must.reduce(function (s, k) { return s + h.x[k]; }, 0);
        if (m > 1e-3 && tot.firstShort === null) tot.firstShort = h.t;
      });
      sums(tot, cls); tot.co2 = tot.fuel * P.cfg.fuel.co2;
      return { key: key, hours: hours, totals: tot, plans: plans, status: worst(stats) };
    });
  }

  // ---------------------------------------------------------------- branch and bound on the sizing model's whole numbers (M5)
  // A node is the LP relaxation (every integer made continuous) with bounds on the branched variables. Rules (stated on
  // the page, as M2's): open the node with the lowest bound (ties: the older node); branch on the integer farthest from
  // a whole number (ties: the list order); solve both children, "down" (x <= floor) first. A node whose LP fails (time
  // limit, error) stays unresolved with its parent's bound and can be retried; the tree is proven only when nothing is
  // open, pending or unresolved and the gap is 0.
  function relaxed(model, bounds) {
    var m = { sense: model.sense, offset: model.offset, constraints: model.constraints, variables: model.variables.map(function (v) {
      var w = {}; for (var k in v) w[k] = v[k]; delete w.type;
      var b = bounds && bounds[v.name]; if (b) { if (b.lb != null) w.lb = Math.max(w.lb || 0, b.lb); if (b.ub != null) w.ub = Math.min(w.ub == null ? Infinity : w.ub, b.ub); }
      return w; }) };
    return m;
  }
  var bb = {
    tree: function (model, ints) { return { model: model, ints: ints, nodes: [{ id: 0, parent: null, bounds: {}, depth: 0, status: "pending" }], inc: null, seq: 0, branchings: 0, solved: 0 }; },
    pending: function (T) { return T.nodes.filter(function (n) { return n.status === "pending"; }).map(function (n) { return { id: n.id, model: relaxed(T.model, n.bounds) }; }); },
    accept: function (T, id, r) {
      var n = T.nodes[id];
      n.tries = (n.tries || 0) + 1;
      if (!r || !r.ok) {
        n.why = r ? r.status : "none";
        if (r && r.status === "infeasible") { T.solved++; n.status = "infeasible"; n.bound = null; return n; }
        n.status = "error"; n.inherited = true; n.bound = n.parent == null ? null : T.nodes[n.parent].bound;
        if (T.inc && n.bound != null && n.bound >= T.inc.bound - 1e-6 * Math.abs(T.inc.bound)) { n.status = "pruned"; n.prunedBy = T.inc.id; }
        return n;
      }
      T.solved++; n.inherited = false; n.why = null; n.bound = r.objective; n.x = {}; n.values = r.values;
      T.ints.forEach(function (k) { n.x[k] = r.values[k]; });
      n.frac = T.ints.filter(function (k) { return Math.abs(n.x[k] - Math.round(n.x[k])) > 1e-6; });
      var tol = 1e-6 * Math.abs(n.bound);
      if (T.inc && n.bound >= T.inc.bound - tol) { n.status = "pruned"; n.prunedBy = T.inc.id; return n; }
      if (!n.frac.length) {
        if (T.inc) T.inc.status = "integer";
        T.inc = n; n.status = "best";
        T.nodes.forEach(function (m) { if ((m.status === "open" || m.status === "error") && m.bound != null && m.bound >= n.bound - tol) { m.status = "pruned"; m.prunedBy = n.id; } });
        return n;
      }
      n.status = "open"; return n;
    },
    branch: function (T) {
      var n = null;
      T.nodes.forEach(function (m) { if (m.status === "open" && (!n || m.bound < n.bound - 1e-9)) n = m; });
      if (!n) return null;
      var v = null, far = -1;
      n.frac.forEach(function (k) { var f = Math.abs(n.x[k] - Math.round(n.x[k])), d = Math.min(f, 1 - f); var fr = n.x[k] - Math.floor(n.x[k]); d = Math.min(fr, 1 - fr); if (d > far + 1e-9) { far = d; v = k; } });
      n.status = "branched"; n.on = { name: v, x: n.x[v] }; T.branchings++;
      var kids = [0, 1].map(function (up) {
        var b = {}; for (var k in n.bounds) b[k] = { lb: n.bounds[k].lb, ub: n.bounds[k].ub };
        b[v] = b[v] || {};
        if (up) b[v].lb = Math.ceil(n.x[v]); else b[v].ub = Math.floor(n.x[v]);
        var c = { id: ++T.seq, parent: n.id, bounds: b, depth: n.depth + 1, status: "pending", by: v, up: !!up, at: up ? Math.ceil(n.x[v]) : Math.floor(n.x[v]) };
        T.nodes.push(c); return c;
      });
      return { node: n, on: n.on, kids: kids };
    },
    bound: function (T) {
      var b = T.inc ? T.inc.bound : Infinity, none = false;
      T.nodes.forEach(function (n) {
        if (n.status !== "open" && n.status !== "pending" && n.status !== "error") return;
        var nb = n.status === "pending" ? (n.parent == null ? null : T.nodes[n.parent].bound) : n.bound;
        if (nb == null) none = true; else b = Math.min(b, nb);
      });
      return none ? null : b;
    },
    gap: function (T) { if (!T.inc) return null; var lb = bb.bound(T); return lb == null ? null : Math.max(0, (T.inc.bound - lb) / Math.abs(T.inc.bound)); },
    done: function (T) { return !T.nodes.some(function (n) { return n.status === "open" || n.status === "pending" || n.status === "error"; }); },
    proven: function (T) { var g = bb.gap(T); return bb.done(T) && !!T.inc && g != null && g <= 1e-9; },
    failed: function (T) { return T.nodes.filter(function (n) { return n.status === "error"; }); },
    retry: function (T) { var k = 0; T.nodes.forEach(function (n) { if (n.status === "error") { n.status = "pending"; k++; } }); return k; },
    // what the page says once nothing is left to branch; null while the tree can still branch
    verdict: function (T) {
      if (bb.proven(T)) return { proven: true, text: T.branchings + " branching" + (T.branchings === 1 ? "" : "s") + ", " + T.solved + " LPs: no node is left open or unsolved, so the gap is 0%. Proven optimal." };
      var bad = bb.failed(T);
      if (!bad.length && T.nodes.some(function (n) { return n.status === "open" || n.status === "pending"; })) return null;
      if (!bad.length) return { proven: false, text: "No plan meets every rule: every branch is infeasible." };
      var g = bb.gap(T);
      return { proven: false, text: "Not proven: " + (bad.length === 1 ? "one node's LP" : bad.length + " nodes' LPs") + " did not finish (" + bad[0].why + "). Best plan " + (T.inc ? money(T.inc.bound) : "none yet") +
        (g != null ? ", gap " + (g * 100).toFixed(2) + "%" : "") + ". Press Retry." };
    },
    // a whole tree with a synchronous solve (Node tests)
    run: function (model, ints, solveFn) {
      var T = bb.tree(model, ints);
      var settle = function () { bb.pending(T).forEach(function (m) { bb.accept(T, m.id, solveFn(m.model)); }); };
      settle();
      for (var k = 0; k < 60 && !bb.done(T); k++) { if (!bb.branch(T)) break; settle(); }
      return T;
    }
  };

  // the same storm with the plan held fixed, cut or stretched to `days` days from its start (C1's sensitivity)
  function lengths(P, base, days) {
    var b = P.scen[base], w = P.cfg.sun[b.window];
    return days.map(function (d) {
      var o = { id: base + "-" + d + "d", window: b.window, start: b.start, hours: 24 * d, first: b.first, day0: b.day0, days: d, sun: w.kw.slice(b.start, b.start + 24 * d) };
      o.label = (d === 1 ? "1 day" : d + " days") + " from " + when(o, 0); o.short = d === 1 ? "1 day" : d + " days";
      return o;
    });
  }
  var E1 = { VERSION: 1, lengths: lengths, MD: MD, PRIO: PRIO, PRIO_NAMES: PRIO_NAMES, PRIO_W: PRIO_W, TIE: TIE, FKEYS: FKEYS, prepare: prepare, seeded: seeded, rng: rng, when: when, hh: hh, hourEnd: hourEnd, costNote: COST_NOTE, fuelWords: fuelWords, fuelMoney: fuelMoney,
    makeSchema: makeSchema, schema: schema, presets: presets, classes: classes, kwOf: kwOf, rate: rate, crf: crf, owner: owner, costs: costs, baseBill: baseBill,
    yearModel: yearModel, readYear: readYear, outageModel: outageModel, readOutage: readOutage, sizeModel: sizeModel, readSize: readSize, roundUp: roundUp,
    hint: hint, solve: solve, worst: worst, summarize: summarize, note: note, fallback: fallback, forecast: forecast, realTime: realTime, roll: roll, bb: bb,
    relaxed: relaxed, money: money, kilo: kilo };
  if (typeof module !== "undefined" && module.exports) module.exports = E1;
  if (typeof window === "undefined" || !window.LX) return;
  window.LX.E1 = E1;

  // ---------------------------------------------------------------- view pieces shared by SB1, C1 and M5
  var LX = window.LX, H = LX.H;
  var COL = { pv: "var(--lx-solar)", bat: "var(--lx-bat)", gen: "var(--lx-pk)", grid: "var(--lx-cc)", short: "var(--lx-bad)" };
  var HOSP = '<svg class="lx-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
  function ic(name) { return name === "plus" ? HOSP : LX.icon(name); }
  function kwh(v) { return kilo(v) + " kWh"; }
  function gal(v) { return kilo(v) + " gal"; }
  function tons(kg) { return (kg / 1000).toFixed(kg >= 10000 ? 0 : 1) + " t"; }
  function hours(h) { return h + " h"; }
  // a row of buttons, one pressed: { el, set(v) }
  function seg(host, label, values, names, value, onPick, o) {
    o = o || {};
    var el = H("div", { class: "lx-seg " + (o.cls || ""), role: "group", "aria-label": label }, host), bs = {};
    values.forEach(function (v) {
      var b = H("button", { type: "button", text: names[v], "aria-pressed": v === value ? "true" : "false" }, el);
      if (o.aria) b.setAttribute("aria-label", o.aria(v));
      b.addEventListener("click", function () { set(v); onPick(v); });
      bs[v] = b;
    });
    function set(v) { values.forEach(function (x) { bs[x].setAttribute("aria-pressed", x === v ? "true" : "false"); }); }
    return { el: el, set: set, buttons: bs };
  }
  // label each cell of a data table with its column's heading (data-l), so the phone layout (one block per row, the
  // header hidden: base.css) still says what each number is; call it after the rows are in
  function label(tb) {
    var heads = [].slice.call(tb.querySelectorAll("thead th")).map(function (th) { return th.textContent; });
    tb.classList.add("e1-lab");
    [].slice.call(tb.querySelectorAll("tbody tr")).forEach(function (tr) {
      [].slice.call(tr.children).forEach(function (c, i) { if (i > 0 && heads[i]) c.setAttribute("data-l", heads[i]); });
    });
    return tb;
  }
  function fieldset(host, title, hint) {
    var f = H("fieldset", { class: "lx-sb-group" }, host);
    H("legend", { text: title }, f);
    if (hint) H("p", { class: "lx-hint e1-ghint", html: LX.rich(hint).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, f);
    return f;
  }
  // a Stop button for an LX.BenchRun (W3 review SB1 9): pass s.busy as the run box's busy callback, then s.attach(run).
  // It sits after Run, shows only while a run is on, and cancels it (run.cancel()); focus then goes to Run, since Stop
  // hides itself (a keyboard reader would otherwise lose their place)
  function stopper() {
    var b = null, run = null;
    return {
      busy: function (on) { if (b) b.hidden = !on; },
      attach: function (r) {
        run = r;
        b = H("button", { class: "lx-btn ghost small e1-stop", type: "button", text: "Stop", hidden: true });
        r.button.parentNode.insertBefore(b, r.again);
        b.addEventListener("click", function () { if (!run.running()) return; run.cancel(); run.button.focus(); });
        return b;
      }
    };
  }

  // ---- the one-line diagram: the feeder, the switch to the grid, the campus bus, the sources and the loads, each load
  //      with its priority (three buttons) when editable. Real buttons, a phone layout (one column) and a text version.
  E1.Line = function (host, o) {
    var P = o.P, plan = o.plan, el = H("div", { class: "e1-line" + (o.island ? " island" : "") }, host);
    var top = H("div", { class: "e1-top" }, el);
    var fd = H("div", { class: "e1-node e1-feeder" }, top);
    fd.innerHTML = ic("tower") + '<span class="e1-nt"><b>Host <span class="lx-term" data-term="feeder">feeder</span></b><small class="e1-fl"></small></span>';
    H("span", { class: "e1-wire", "aria-hidden": "true" }, top);
    var sw = H("div", { class: "e1-node e1-switch" }, top);
    sw.innerHTML = '<span class="e1-sym" aria-hidden="true"><i></i></span><span class="e1-nt"><b>Switch to the grid</b><small class="e1-ss"></small></span>';
    H("div", { class: "e1-bus", "aria-hidden": "true" }, el).appendChild(H("span", { text: "Campus bus: the shared connection" }));
    var cols = H("div", { class: "e1-cols" }, el);
    var sc = H("div", { class: "e1-col" }, cols), lc = H("div", { class: "e1-col" }, cols);
    H("p", { class: "e1-colh", text: "Sources" }, sc); H("p", { class: "e1-colh", text: "Loads, and what stays on in an outage" }, lc);
    var SRC = [{ k: "pv", icon: "sun", name: "Solar panels" }, { k: "bat", icon: "battery", name: "Battery" }, { k: "gen", icon: "flame", name: "Generator sets" }];
    var srcEls = {}, loadEls = {}, segs = {};
    SRC.forEach(function (s) {
      var r = H("div", { class: "e1-node e1-src", style: "--c:" + COL[s.k] }, sc);
      r.innerHTML = ic(s.icon) + '<span class="e1-nt"><b>' + s.name + '</b><small></small></span>';
      srcEls[s.k] = r.querySelector("small");
    });
    P.loads.forEach(function (l, k) {
      var r = H("div", { class: "e1-node e1-load" }, lc);
      r.innerHTML = ic(l.icon) + '<span class="e1-nt"><b>' + LX.esc(l.label) + "</b><small>" + l.kw + " kW, every hour</small></span>";
      loadEls[l.key] = r;
      if (o.editable) segs[l.key] = seg(r, l.label + ": priority in an outage", PRIO, { must: "Must", keep: "Keep", shed: "Shed" }, prio(plan, l.key),
        function (v) { if (o.onPrio) o.onPrio(l.key, v); }, { cls: "e1-prio", aria: function (v) { return l.label + ": " + PRIO_NAMES[v].toLowerCase(); } });
      else H("span", { class: "e1-tag", text: "" }, r);
    });
    var alt = H("details", { class: "lx-textalt" }, el); H("summary", { text: "Text version: the one-line diagram" }, alt);
    var altList = H("ul", null, alt);
    function set(p, isl) {
      plan = p;
      if (isl != null) o.island = isl;
      el.classList.toggle("island", !!o.island);
      el.querySelector(".e1-fl").textContent = "imports up to " + kilo(p.imp) + " kW · exports up to " + kilo(p.exp) + " kW";
      el.querySelector(".e1-ss").textContent = o.island ? "open: the campus runs as an island" : "closed: connected to the feeder";
      srcEls.pv.textContent = kilo(p.pv) + " kW";
      srcEls.bat.textContent = kilo(p.bat) + " kWh · " + kilo(p.bat / 4) + " kW";
      srcEls.gen.textContent = p.gen + " × 200 kW · " + kilo(p.fuel) + " gal of diesel";
      P.loads.forEach(function (l) {
        var v = prio(p, l.key); loadEls[l.key].setAttribute("data-prio", v);
        if (segs[l.key]) segs[l.key].set(v); else loadEls[l.key].querySelector(".e1-tag").textContent = PRIO_NAMES[v];
      });
      altList.innerHTML = "";
      ["Host feeder: imports up to " + kilo(p.imp) + " kW, exports up to " + kilo(p.exp) + " kW.",
        "Switch to the grid (the point of common coupling): " + (o.island ? "open, so the campus runs as an island." : "closed."),
        "Sources on the campus bus (the shared electrical connection every source and load meets at): " + kilo(p.pv) + " kW of solar panels, a " + kilo(p.bat) + " kWh battery (" + kilo(p.bat / 4) + " kW), " + p.gen + " generator set" + (p.gen === 1 ? "" : "s") + " of 200 kW with " + kilo(p.fuel) + " gallons of diesel."]
        .concat(P.loads.map(function (l) { return l.label + ", " + l.kw + " kW: " + PRIO_NAMES[prio(p, l.key)].toLowerCase() + "."; }))
        .forEach(function (t) { H("li", { text: t }, altList); });
    }
    set(plan);
    return { el: el, set: set };
  };

  // ---- the bench: the one-line diagram, the controls, presets, the run box (Run, Size it), readouts and the plan link.
  //      o: { P, schema, slug, resultsHost, presets, hide: { out, allow, owner }, scenarios(plan, task) -> the outages,
  //           runLabel, draw(host, results, plan, r, sizeNote), onRun(results, plan, r), onChange(plan), busy,
  //           solver(task) -> a solver function or null (demo states stub a failing or time-limited solve),
  //           main: n (the readouts use only the first n outages of a run) }
  E1.Bench = function (live, o) {
    var P = o.P, S = o.schema || schema, L = P.cfg.limits;
    var wrap = H("div", { class: "lx-sb e1-sb" }, live);
    var ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan = null, ctl = {}, task = "run", sizeNote = null, lastRun = null, adopted = false;
    var ss = LX.ShareState(side, { schema: S, id: o.slug + "-link", onLoad: function (s) { stopSizing(); plan = s; paint(); run.changed(plan); if (o.onChange) o.onChange(plan); } });
    plan = ss.state;
    var g0 = fieldset(ctr, "The campus", "Set what must stay on in an outage: **Must** stay on, **Keep** if possible, **Shed** first.");
    var line = E1.Line(g0, { P: P, plan: plan, editable: true, onPrio: function (k, v) { var p = copy(plan); p[FKEYS[k]] = v; change(p); } });
    var g1 = fieldset(ctr, "Equipment");
    var sl = function (id, label, color, step, fmt) { var f = S.fields.filter(function (x) { return x.id === id; })[0];
      ctl[id] = LX.Slider(g1, { label: label, color: color, min: f.min, max: f.max, step: f.step || step, value: plan[id], fmt: fmt, onChange: function (v) { var p = copy(plan); p[id] = v; change(p); } }); };
    sl("pv", "Solar panels", COL.pv, 25, function (v) { return kilo(v) + " kW"; });
    sl("bat", "Battery (4 hours)", COL.bat, 50, function (v) { return kilo(v) + " kWh · " + kilo(v / 4) + " kW"; });
    sl("gen", "Generator sets", COL.gen, 1, function (v) { return v + " × 200 kW"; });
    sl("fuel", "Diesel on site", COL.gen, 25, function (v) { return kilo(v) + " gal"; });
    if (!(o.hide && o.hide.allow)) {
      var al = H("div", { class: "e1-allow" }, g1);
      H("span", { class: "e1-allowl", text: "Size it may build:" }, al);
      var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "What Size it may build" }, al);
      ctl.allow = {};
      [["pv", "Solar"], ["bat", "Battery"], ["gen", "Generator sets"]].forEach(function (x) {
        ctl.allow[x[0]] = LX.Toggle(tg, { label: x[1], on: plan.allow.indexOf(x[0]) >= 0, onChange: function (on) {
          var p = copy(plan), a = p.allow.filter(function (y) { return y !== x[0]; }); if (on) a.push(x[0]);
          p.allow = ["pv", "bat", "gen"].filter(function (y) { return a.indexOf(y) >= 0; }); change(p); } });
      });
    }
    if (!(o.hide && o.hide.out)) {
      var g2 = fieldset(ctr, "Outages to plan for", "Hypothetical: the grid assumed down during a stretch of 2025 sun; the battery and the tank start full.");
      var tg2 = H("div", { class: "lx-toggles", role: "group", "aria-label": "Outages to plan for" }, g2);
      ctl.out = {};
      P.list.forEach(function (id) {
        ctl.out[id] = LX.Toggle(tg2, { label: P.scen[id].short, on: plan.out.indexOf(id) >= 0, onChange: function (on) {
          var p = copy(plan), a = p.out.filter(function (y) { return y !== id; }); if (on) a.push(id);
          p.out = P.list.filter(function (y) { return a.indexOf(y) >= 0; }); change(p); } });
      });
    }
    var g3 = fieldset(ctr, "Host feeder and tariff", "The [[feeder|feeder]] carries at most these kW; the [[tariff|tariff]] sets what each kWh bought costs.");
    ctl.exp = LX.Slider(g3, { label: "Export limit", color: COL.grid, min: L.exp[0], max: L.exp[1], step: L.exp[2], value: plan.exp, fmt: function (v) { return kilo(v) + " kW"; }, onChange: function (v) { var p = copy(plan); p.exp = v; change(p); } });
    ctl.imp = LX.Slider(g3, { label: "Import limit", color: COL.grid, min: L.imp[0], max: L.imp[1], step: L.imp[2], value: plan.imp, fmt: function (v) { return kilo(v) + " kW"; }, onChange: function (v) { var p = copy(plan); p.imp = v; change(p); } });
    var tr = H("div", { class: "e1-segrow" }, g3); H("span", { class: "e1-segl", text: "Tariff" }, tr);
    ctl.tar = seg(tr, "Tariff", ["tou", "flat"], { tou: "Time-of-use", flat: "Flat" }, plan.tar, function (v) { var p = copy(plan); p.tar = v; change(p); });
    if (!(o.hide && o.hide.owner)) {
      var g4 = fieldset(ctr, "Owner", "Who pays for the equipment sets the [[cost-of-capital|real cost of capital]] (illustrative): utility 6%, co-op 4%, community 5%.");
      ctl.own = seg(g4, "Owner", ["utility", "coop", "community"], { utility: "Utility", coop: "Co-op", community: "Community" }, plan.own, function (v) { var p = copy(plan); p.own = v; change(p); });
    }
    // side: presets, the run box, readouts, the plan link
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (sizes only; your other choices stay)" }, side);
    (o.presets || presets).forEach(function (pr) {
      H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, title: pr.note, onclick: function () { var p = copy(plan); for (var k in pr.state) p[k] = pr.state[k]; change(p); } }, pre);
    });
    var stale = H("p", null, o.resultsHost), res = H("div", { class: "lx-sb-results" }, o.resultsHost);
    var ro = H("div", { class: "lx-readouts e1-ro" }), stopB = stopper();
    var run = LX.BenchRun(side, { label: o.runLabel || "Run the outages", state: function () { return plan; }, partial: true, results: [res, ro], stale: stale,
      busy: function (on) { stopB.busy(on); if (o.busy) o.busy(on); },
      solve: function (st, ctx) { var t = task; return E1.solve(st, P, { task: t, check: t === "size" ? false : undefined, signal: ctx.signal, attempt: ctx.attempt, scenarios: o.scenarios ? o.scenarios(st, t) : null, solver: o.solver ? o.solver(t) : null }).then(function (r) { r.task = t; return r; }); },
      render: function (R, st, r) {
        if (r.task === "size") {
          // adopt the sizes (rounded up to the bench's steps) onto the plan the sizing was given (st), never onto
          // choices made while it ran (a change stops a sizing: change() below; W3 review SB1 3); then tell every
          // results panel that the plan changed (SB1 2) and check the sizes hour by hour (onDone)
          adopted = LX.ShareState.same(S, st, plan);
          if (!adopted) { sizeNote = null; return; }
          var p = copy(st); p.pv = R.plan.pv; p.bat = R.plan.bat; p.gen = R.plan.gen;
          sizeNote = { plan: copy(p), sized: R.sized, proven: r.status === "optimal", gap: r.mipGap };
          plan = p; ss.set(plan); paint(); run.changed(plan);
          if (o.onChange) o.onChange(plan);
          return;
        }
        lastRun = { plan: copy(st), R: R, r: r };
        readouts(R); if (o.draw) o.draw(res, R, st, r, noteFor(st)); if (o.onRun) o.onRun(R, st, r);
      },
      onDone: function (r) { if (r && r.task === "size" && r.results && adopted) { adopted = false; setTimeout(function () { task = "run"; run.run(plan); }, 0); } }
    });
    stopB.attach(run);
    var sizeB = H("button", { class: "lx-btn ghost small", type: "button", text: "Size it for me" }, run.button.parentNode);
    sizeB.addEventListener("click", function () { if (run.running()) return; task = "size"; run.run(plan); });
    run.button.parentNode.addEventListener("click", function (e) { if (e.target === run.button || run.button.contains(e.target)) task = "run"; }, true);
    H("p", { class: "lx-hint e1-sizehint", html: "<b>Size it for me</b> " + LX.rich("asks the [[mixed-integer-program|mixed-integer program]] for the cheapest sizes that keep every must-stay-on load on through the chosen outages, rounds them up to the bench's steps and runs them: a safe plan, not proven the cheapest on the steps.") }, side);
    side.appendChild(ro);
    side.insertBefore(ss.status, pre);
    side.appendChild(ss.el);
    function noteFor(st) { return sizeNote && ShareSame(S, sizeNote.plan, st) ? sizeNote : null; }
    function ShareSame(Sc, a, b) { return LX.ShareState.same(Sc, a, b); }
    function readouts(R) {
      ro.innerHTML = "";
      var outs = o.main ? R.outages.slice(0, o.main) : R.outages;   // a capstone's extra runs (C1: other storm lengths) stay out
      var worstMust = outs.reduce(function (m, x) { return Math.max(m, x.must); }, 0);
      // a plan that leaves load unserved in a normal year gets that kWh in place of a saving (SB1 1, C1 3)
      [["Annual cost (12 average days)", money(R.total), ""], R.comparable ? ["Saving on the grid-only bill", money(R.saving), R.saving >= 0 ? "good" : "bad"] : ["Unserved in a normal year", kwh(R.year.unserved), "bad"],
        [outs.length > 1 ? "Must-stay-on unserved, worst outage" : "Must-stay-on load unserved", outs.length ? kwh(worstMust) : "no outage chosen", worstMust > 0.5 ? "bad" : "good"],
        ["CO₂ in a normal year", kilo(R.year.co2) + " t", ""]].forEach(function (x) {
        var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d);
      });
    }
    // a sizing still running when the plan changes is stopped: its sizes would belong to the earlier choices (SB1 3).
    // BenchRun's "Try again" would size that earlier plan, so it stays hidden and the status says what to do
    function stopSizing() {
      if (task !== "size" || !run || !run.running()) return;
      run.cancel(); task = "run";
      run.again.hidden = true;
      run.status.setAttribute("data-kind", "cancelled");
      run.status.textContent = "Size it for me stopped: the plan changed while it ran, so its sizes would be for the earlier choices. Press it again to size this plan.";
    }
    function paint() {
      line.set(plan);
      ["pv", "bat", "gen", "fuel", "exp", "imp"].forEach(function (k) { ctl[k].set(plan[k]); });
      ctl.tar.set(plan.tar); if (ctl.own) ctl.own.set(plan.own);
      if (ctl.allow) ["pv", "bat", "gen"].forEach(function (k) { ctl.allow[k].set(plan.allow.indexOf(k) >= 0); });
      if (ctl.out) P.list.forEach(function (id) { ctl.out[id].set(plan.out.indexOf(id) >= 0); });
    }
    function change(p) {
      stopSizing();
      plan = p; paint(); ss.set(plan); run.changed(plan);
      if (o.onChange) o.onChange(plan);
    }
    paint();
    return { ss: ss, run: run, el: wrap, line: line, plan: function () { return copy(plan); }, set: function (p) { var q = copy(plan); for (var k in p) q[k] = p[k]; change(q); },
      last: function () { return lastRun; }, sizeNote: function () { return sizeNote; }, size: function () { task = "size"; return run.run(plan); }, go: function () { task = "run"; return run.run(plan); } };
  };
  function copy(p) { return JSON.parse(JSON.stringify(p)); }

  // ---- results: the annual cost, the outages and one outage hour by hour (o: { P, slug, pick })
  E1.Results = function (host, R, o) {
    o = o || {};
    var P = o.P;
    host.innerHTML = "";
    if (o.sizeNote) H("p", { class: "e1-sized", html: (o.sizeNote.proven ? "<b>Sized by the mixed-integer program</b> " : "<b>Sized by a run stopped at its time limit</b>: ") + LX.esc(o.sizeNote.proven
      ? "for the chosen outages: " + kilo(o.sizeNote.sized.exact.pv) + " kW, " + kilo(o.sizeNote.sized.exact.bat) + " kWh and " + o.sizeNote.sized.exact.gen + " set" + (o.sizeNote.sized.exact.gen === 1 ? "" : "s") + ", optimal (" + money(o.sizeNote.sized.total) + " a year). Rounded up to the bench's steps, a safe plan but not proven the cheapest on them, and checked below with whole sets and their 30% minimum."
      : "the best plan found so far (gap " + (o.sizeNote.gap != null ? (o.sizeNote.gap * 100).toFixed(2) + "%" : "unknown") + "), not proven the cheapest; checked below.") }, host);
    // a plan that cannot carry the campus in a normal year (the import limit below 1,200 kW): said first (SB1 1, C1 3)
    if (R.short) H("p", { class: "e1-short", role: "note", html: "<b>This plan leaves " + kwh(R.year.unserved) + " unserved in a normal year on the grid.</b> " +
      LX.esc("The feeder's import limit (" + kilo(R.plan.imp) + " kW) is below the campus's " + kilo(P.total) + " kW and the plan cannot make up the rest, so its cost buys less service than the grid-only bill: no saving is shown.") }, host);
    var grid = H("div", { class: "lx-sb-charts" }, host);
    // the annual cost
    var c1 = H("div", { class: "lx-xcard lx-sb-chart" }, grid); H("h3", { text: "Where the annual cost goes" }, c1);
    var rows = [["Solar panels", R.equipment.pv, COL.pv], ["Battery", R.equipment.bat, COL.bat], ["Generator sets", R.equipment.gen, COL.gen], ["Diesel tank", R.equipment.tank, COL.gen],
      ["Grid bill (bought minus credits)", R.year.bill, COL.grid]];
    var top = Math.max(R.base, R.total);
    var tb = H("table", { class: "lx-facts e1-cost" }, c1);
    var tbody = H("tbody", null, tb);
    rows.forEach(function (x) {
      var tr = H("tr", null, tbody); var th = H("td", null, tr);
      th.innerHTML = '<span class="e1-sw" style="--c:' + x[2] + '"></span>' + x[0];
      var v = H("td", { class: "n", text: money(x[1]) }, tr);
      var bar = H("td", { class: "e1-barcell", "aria-hidden": "true" }, tr); H("span", { class: "e1-bar", style: "--c:" + x[2] + ";width:" + Math.max(0, x[1] / top * 100).toFixed(1) + "%" }, bar);
    });
    var tf = H("tfoot", null, tb);
    [["Annual cost of this plan", R.total], [R.comparable ? "The bill with nothing built" : "The bill with nothing built (serves every load)", R.base]].forEach(function (x, i) {
      var tr = H("tr", { class: i ? "e1-base" : "e1-total" }, tf); H("td", { text: x[0] }, tr); H("td", { class: "n", text: money(x[1]) }, tr);
      var bar = H("td", { class: "e1-barcell", "aria-hidden": "true" }, tr); H("span", { class: "e1-bar " + (i ? "base" : "tot"), style: "width:" + (x[1] / top * 100).toFixed(1) + "%" }, bar);
    });
    // the cost's boundary, one idea a line (SB1 5, 8 and 10)
    var cn = H("ul", { class: "lx-hint e1-cost-notes" }, c1);
    ["**Equipment**: paid over its life at the " + R.owner.label.toLowerCase().replace("-owned", "") + " owner's " + Math.round(R.rate * 100) + "% real [[cost-of-capital|cost of capital]] (through the [[capital-recovery-factor|capital recovery factor]]), plus upkeep.",
      "**Grid bill**: estimated on 12 average days; a full 8,760-hour year comes out up to 7% higher for large solar-and-battery plans.",
      "**Not included**: the diesel burned in outages (its cost is under each outage). 2025 dollars, illustrative.",
      "**Grid electricity**: " + kilo(R.year.imports / 1000) + " MWh bought, " + kilo(R.year.exports / 1000) + " MWh exported, " + kilo(R.year.co2) + " t CO₂ (U.S. [[average-emission-factor|average factor]], [[operating-emissions|operating only]])."]
      .forEach(function (t) { H("li", { html: LX.rich(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, cn); });
    // the outages
    var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, grid); H("h3", { text: R.outages.length ? "The outages, with this plan" : "No outage chosen" }, c2);
    var sel = o.sel != null ? Math.min(o.sel, R.outages.length - 1) : 0, chartHost = null;
    if (R.outages.length) {
      var sx = H("div", { class: "lx-scroll-x" }, c2), t2 = H("table", { class: "lx-facts e1-outs" }, sx);
      var hr = H("tr", null, H("thead", null, t2));
      ["Outage", "Must stay on, unserved", "Keep if possible, unserved", "Shed first, unserved", "Must-stay-on carried for", "Diesel burned (cost)"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
      var b2 = H("tbody", null, t2), btns = [];
      R.outages.forEach(function (x, i) {
        var tr = H("tr", { class: i === sel ? "sel" : "" }, b2), td = H("th", { scope: "row" }, tr);
        var b = H("button", { type: "button", class: "e1-pick", text: x.short, "aria-pressed": i === sel ? "true" : "false", "aria-label": "Show " + x.label + " hour by hour" }, td);
        b.addEventListener("click", function () { sel = i; btns.forEach(function (bb, j) { bb.setAttribute("aria-pressed", j === i ? "true" : "false"); bb.closest("tr").classList.toggle("sel", j === i); }); draw(); if (o.onPick) o.onPick(i); });
        btns.push(b);
        H("td", { class: "n" + (x.must > 0.5 ? " bad" : " good"), text: kwh(x.must) }, tr);
        H("td", { class: "n", text: kwh(x.keep) }, tr); H("td", { class: "n", text: kwh(x.shed) }, tr);
        H("td", { class: "n", text: x.lasts >= x.hours.length ? "all " + x.hours.length + " h" : x.lasts + " of " + x.hours.length + " h" }, tr);
        H("td", { class: "n", text: gal(x.fuel) + " (" + fuelMoney(x.fuelCost != null ? x.fuelCost : x.fuel * P.cfg.fuel.price) + ") · " + tons(x.co2) + " CO₂" }, tr);
      });
      label(t2);
      // what the outage model weighs, as it is built (SB1 7): weights, not a strict order
      var on = H("ul", { class: "lx-hint e1-cost-notes" }, c2);
      ["Per outage only: the stretches the plan was run on, not a reliability figure. Diesel at $" + P.cfg.fuel.price.toFixed(2) + " a gallon, not in the annual cost.",
        "Who goes short: a kWh of must stay on weighs 100 times one of keep if possible, which weighs 10 times one of shed first.",
        "Within a priority, each step up the list (hospital, water and heat, dorms, labs) counts 0.5% more and an earlier hour up to 2% more: a preference, not a strict order."]
        .forEach(function (t) { H("li", { text: t }, on); });
      chartHost = H("div", { class: "lx-xcard lx-sb-chart e1-hourcard" }, host);
      draw();
    }
    function draw() { chartHost.innerHTML = ""; E1.HourChart(chartHost, P, R, R.outages[sel], { slug: o.slug }); }
    return { select: function (i) { if (R.outages.length) { sel = i; draw(); } } };
  };

  // ---- one outage hour by hour: supply as stacked columns (solar, battery, generator) against the loads served and the
  //      must-stay-on load; below, the battery's charge and the diesel left, as % of full
  E1.HourChart = function (host, P, R, x, o) {
    o = o || {};
    var plan = R.plan, H0 = x.hours.length, must = R.mustKW, top = Math.max(P.total, 400);
    H("h3", { text: "Hour by hour: " + x.label }, host);
    var bars = [], served = [], rowsT = [];
    x.hours.forEach(function (h) {
      var y = 0, add = function (v, c) { if (v > 0.5) { bars.push({ x0: h.t, x1: h.t + 1, y0: y, y1: y + v, color: c }); y += v; } };
      var batOut = Math.max(0, h.d - h.c), sOut = h.s - Math.max(0, h.c - h.d);
      add(Math.max(0, sOut), COL.pv); add(batOut, COL.bat); add(h.g, COL.gen);
      var shortMust = R.cls.must.reduce(function (s, k) { return s + h.x[k]; }, 0);
      if (shortMust > 0.5) bars.push({ x0: h.t, x1: h.t + 1, y0: must - shortMust, y1: must, color: COL.short, op: 0.85 });
      var sv = P.total - h.x.reduce(function (a, b) { return a + b; }, 0);
      served.push(sv);
      rowsT.push([E1.when(x.sc, h.t), kilo(Math.max(0, sOut)), kilo(batOut), kilo(h.g) + " (" + h.u + " on)", kilo(sv), kilo(shortMust), kilo(h.q)]);
    });
    var ticks = []; for (var k = 0; k <= H0; k += (H0 > 48 ? 12 : 6)) ticks.push([k, k === H0 ? "" : E1.when(x.sc, k).replace(/^(\d+) (\w+) (\d\d):00$/, function (m, d, mo, hr) { return hr === "00" ? d + " " + mo : hr + ":00"; })]);
    var p1 = LX.Plot(host, { caption: true, text: "Text version: the outage hour by hour", box: true });
    p1.render({ x: { min: 0, max: H0, ticks: ticks, ticksN: ticks.filter(function (t, i) { return i % 2 === 0; }) }, y: { min: 0, max: top, step: 300, fmt: function (v) { return kilo(v); }, unit: "kW" },
      caption: "Supply and the loads served, kW in each hour (the drawn schedule is one of possibly several with the same totals)",
      bars: bars, lines: [{ values: served, x0: 0, step: 1, color: "var(--lx-ink)", width: 1.8 }],
      refs: [{ y: P.total, label: "All loads " + kilo(P.total) + " kW", labelN: kilo(P.total) + " kW", dash: "4 3" }].concat(must > 0 ? [{ y: must, label: "Must stay on " + kilo(must) + " kW", labelN: kilo(must) + " kW", dash: "2 3", color: "var(--lx-bad)" }] : []),
      legend: [{ label: "Solar used", color: COL.pv }, { label: "Battery", color: COL.bat }, { label: "Generator sets", color: COL.gen }, { label: "Loads served", color: "var(--lx-ink)" }, { label: "Must-stay-on load short", color: COL.short }],
      aria: "Outage " + x.label + ": supply by hour against the loads served; " + kwh(x.must) + " of must-stay-on load unserved.",
      tip: function (t) { var i = Math.max(0, Math.min(H0 - 1, Math.floor(t))), r = rowsT[i]; return "<div><b>" + r[0] + "</b></div><div>Solar " + r[1] + " · battery " + r[2] + " · sets " + r[3] + " kW</div><div>Served " + r[4] + " kW" + (+r[5].replace(/,/g, "") > 0 ? " · must-stay-on short " + r[5] + " kW" : "") + "</div>"; },
      text: { head: ["Hour from", "Solar used, kW", "Battery out, kW", "Generator sets, kW", "Loads served, kW", "Must-stay-on short, kW", "Battery stored at the hour's end, kWh"], rows: rowsT } });
    var soc = x.hours.map(function (h) { return plan.bat > 0 ? h.q / plan.bat * 100 : 0; }), fuelLeft = [], f = plan.fuel;
    x.hours.forEach(function (h) { f -= P.T.gen.galPerKWh * h.g; fuelLeft.push(plan.fuel > 0 ? Math.max(0, f) / plan.fuel * 100 : 0); });
    var p2 = LX.Plot(host, { caption: true, text: "Text version: battery and diesel", box: true });
    p2.render({ x: { min: 0, max: H0, ticks: ticks, ticksN: ticks.filter(function (t, i) { return i % 2 === 0; }) }, y: { min: 0, max: 100, step: 25, fmt: function (v) { return v + "%"; } }, height: 150, heightN: 130,
      caption: "What is left: the battery's charge and the diesel, % of full",
      lines: [{ values: soc, x0: 1, color: COL.bat, width: 2.2 }, { values: fuelLeft, x0: 1, color: COL.gen, width: 2.2, dash: "5 3" }],
      legend: [{ label: "Battery charge", color: COL.bat }, { label: "Diesel left", color: COL.gen, dash: "5 3" }],
      aria: "Battery charge and diesel left over the outage, as a share of full.",
      text: { head: ["Hour ending", "Battery charge", "Diesel left"], rows: x.hours.map(function (h, i) { return [hourEnd(x.sc, h.t), Math.round(soc[i]) + "%", Math.round(fuelLeft[i]) + "%"]; }) } });
    return { p1: p1, p2: p2 };
  };
  E1.fmt = { kwh: kwh, gal: gal, tons: tons, hours: hours, money: money, kilo: kilo };
  E1.ui = { seg: seg, fieldset: fieldset, ic: ic, COL: COL, copy: copy, label: label, stopper: stopper };
})();
