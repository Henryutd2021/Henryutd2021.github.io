/* engine-e2.js — LX.E2: engine E2 of Learn, the Plains Grid (one of the course's sandbox engines).
   Three zones on a transport model, unit commitment as a mixed-integer program (MILP), then the dispatch linear program
   (LP) with the commitment fixed, whose balance duals are the prices, conditional on the commitment. Used by the Grid
   Room (SB2, learn/sb2-grid-room.qmd) and capstone C2 (learn/c2-plains-grid-hard-year.qmd).

   Data: assets/learn/data/e2-plains-grid.json (hand-written; its `precomputed` block is written by
   _tests/learn/test_e2-engine.js --write). The Plains Grid is fictional: three zones in a chain, Wind Ridge (W) – Prairie
   Town (T) – Metro (M), two links (Ridge–Town, Town–Metro) with transfer limits, an illustrative fleet. Hourly demand,
   wind and solar follow SPP's 2025 shapes (town_year.json, EIA-930), scaled per zone; wind and solar per MW through
   LX.townProfile with EIA's 2025 monthly capacity factors. The zones share one weather (said on the pages). A second
   weather year, 2024 (m03-capacity-expansion-2024.json, 29 February left out), scaled to 2025's yearly demand energy,
   serves the checks (the test's full-year runs and C2's adequacy). Fuel prices: EIA, Electric Power Annual Table 7.4
   (2025: gas $3.85, coal $2.42 per MMBtu); CO2: EIA's coefficients (gas 52.91, subbituminous coal 97.13 kg per MMBtu).

   The day's model (every power in MW over one hour = MWh; dayModel):
     unit groups g (identical units, n_g of them, in one zone): u[g,t] units on (a whole number, 0..n_g), v and w units
       started and stopped, p output, r operating reserve; u_t - u_(t-1) = v_t - w_t; pmin u <= p; p + r <= pmax u;
       r <= rcap u; minimum up time sum_(last ut hours) v <= u; minimum down time sum_(last dt hours) w <= n - u, with
       the starts and stops of the day before carried over. Peakers ("fast" groups) start within minutes and have no
       minimum output, so they have no on/off decision: p + r <= pmax n, and they count as reserve whether on or off.
     zones z: sum p + wind and solar used (available - spilled) + battery out - battery in + flows in - flows out
       + unserved + the large load's curtailment = load (the zone's balance row; its dual is the zone's price)
     links l: -limit <= flow <= limit (a transport model: no loop flows and no power-flow physics; the chain makes each
       flow equal the net injection on one side)
     reserve: sum r + battery reserve + reserve shortfall >= the requirement (one region-wide requirement; where the
       reserve sits is not checked against the links)
     battery (C2's build, at Town, 4 hours): q_t = q_(t-1) + 0.85 c - d, starting and ending each day half full; its
       reserve rb <= power - d + c and rb <= q_t
     goal: min sum (heat rate x fuel price + variable O&M) p + (no-load heat x fuel price) u + start-up cost v
       + $5,000 per MWh unserved + $1,000 per MWh of reserve short + the large load's bid per MWh curtailed + ties
   First day of a period: each unit starts in whatever state suits 00:00, at no start-up cost, and has been in it long
   enough for its minimum times. Later days carry the state of 23:00 and the last day's starts and stops. Each day is
   committed without seeing the next (as a day-ahead market commits one day at a time).
   Pricing (prices come from LPs, never from MILPs): the MILP shows no prices (its duals are null and never read). The dispatch LP keeps every commitment
   fixed (the units on are bounded by pmin x n and pmax x n; units off are left out); its balance duals are the zones'
   prices and its reserve dual the reserve price, "conditional on the commitment". Uplift: a committed group whose
   day's revenue at those prices (energy and reserve) falls short of its running, no-load and start-up costs is paid
   the difference (make-whole), charged to load in proportion to energy (C2). Prices are shown only when the pricing LP
   itself reports optimal: a pricing LP that stops early gives no result, whatever the MILP did.
   Who is short: a zone's unserved load is shared by its customers in proportion to their
   load that hour (the large load's after its own curtailment); the large load's served energy and payment follow that
   rule (readDay: h.llShed, tot.llShed).

   Tie rule, all in $/MWh (data file, `tie`), far below a cent: spilling wind and sun costs
   0.00001 at Wind Ridge, 0.00002 at Prairie Town, 0.00003 in Metro (the farthest from the city spills first); unserved
   load 0.003, 0.002, 0.001 above $5,000 in W, T, M (Metro's load is shed first when several zones could be); reserve
   0.000001 x (the group's place in the list + 1), so the groups listed first carry reserve first; the battery 0.001 per
   MWh in or out, plus 0.00001 x hour on charging and 0.00001 x (23 - hour) on discharging (earlier charging, later
   discharging when prices tie). The test re-solves with the tie weights x10 and x0.1 and checks every number the pages
   show (totals, prices, flows, uplift, commitments; with a battery its hourly schedule and the flows may differ, and the
   pages say so); each shown price (zones and reserve) is checked as the slope of the cost when its row moves 0.001 MWh
   up and down (equal slopes: no corner, so the price is unique); and the commitment of the first days of each tested
   run is the MILP's unique optimum (the best commitment that differs anywhere costs more).
   Every MILP stops only within 0.0001% of its best bound (mip_rel_gap 1e-6). "Optimal" only when every solve of a run
   is optimal; a time limit with a plan returns status "time-limit", the plan, its gap and "not proven optimal".

   API (the sandbox contract, learn/_template-sandbox.qmd):
     E2.prepare(cfg, { y2025, y2024, targets }, townProfile) -> P
     E2.schema (SB2), E2.c2schema (C2), E2.presets, E2.c2presets, E2.sysOf(state, P) (the system a plan describes)
     E2.solve(state, P, { task: "period" | "year" | "weeks", signal, timeLimit, attempt, solver, onDay }) -> Promise of
       { status, ok, kind: "milp", message, hint, results, mipGap, ms }   never rejects
     E2.summarize(state, P, raw), E2.note(state, R, P), E2.fallback(P, key)
     E2.adequacy(P, sys, { years, seed, signal, sync, onProgress }) -> Promise (or, with sync, the result) of
       { lole, lolh, eue, curtailHours, years, ci: { lole: [lo, hi] }, byYear }   (a seeded Monte Carlo; below)
     Pure models: dayModel, readDay, carry, weighting, priceSlopes (the test's corner check)
   Adequacy (C2's probabilistic check; adequacy is never judged from the reduced runs of representative days): a seeded Monte Carlo
   (LX.mulberry32) over every hour of the 2025 and 2024 weather (alternate draw years), with each unit available or out
   for a whole day, drawn afresh each day with its forced outage rate (illustrative), and the battery charged and
   discharged greedily hour by hour; each hour's unserved load is the max-flow deficit of the three zones and two links
   (the largest, over the zone subsets S, of S's load minus S's available supply minus the links' limits into S). The
   large load's flexible share is curtailed before any load is unserved. LOLE: days a year with any load unserved
   (C2's target is 0.1, PJM's criterion of one day in ten years, Manual 20A §1.3); LOLH hours; EUE MWh; a 90% interval
  of LOLE from the spread of the draw years. The operating reserve plays no part in it (operations, not adequacy).
   Node: module.exports = E2 (no DOM). In a page: LX.E2 and the view kit LX.E2.ui (controls, the zone map, results). */
(function () {
  "use strict";
  var MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var TIE = { reserve: 1e-4, battery: 0.01, batteryHour: 1e-4 };
  var EPS = 1e-6;

  // ---------------------------------------------------------------- calendar (365-day years: 29 February left out)
  function dayIndex(date) {
    var m = +date.slice(5, 7) - 1, k = +date.slice(8, 10) - 1;
    for (var i = 0; i < m; i++) k += MD[i];
    return k;
  }
  function dateOf(k) { var m = 0; while (k >= MD[m]) { k -= MD[m]; m++; } return { m: m, d: k + 1 }; }
  function dayLabel(k) { var x = dateOf(k); return x.d + " " + MON[x.m]; }
  function dayLong(k, y) { var x = dateOf(k); return x.d + " " + MONTHS[x.m] + (y ? " " + y : ""); }
  function hh(h) { return (h < 10 ? "0" : "") + h + ":00"; }

  // ---------------------------------------------------------------- data
  function prepare(cfg, D, prof) {
    var P = { cfg: cfg, zones: cfg.zones, links: cfg.links, units: cfg.units, years: {}, zix: {}, uix: {} };
    cfg.zones.forEach(function (z, i) { P.zix[z.id] = i; });
    cfg.units.forEach(function (u, i) { P.uix[u.id] = i; });
    var base = null;
    ["2025", "2024"].forEach(function (y) {
      var yr = D["y" + y];
      if (!yr) return;
      var o = { year: yr, targets: D.targets, monthlyCF: true, monthDays: MD };
      var wind = prof("wind", 1, o).mw, solar = prof("solar", 1, o).mw, dem = yr.demand.map(function (v) { return v / 1000; });
      var sum = dem.reduce(function (a, b) { return a + b; }, 0);
      if (base == null) base = sum;
      var k = base / sum;   // 2024 is scaled to 2025's yearly demand energy
      P.years[y] = { wind: wind, solar: solar, demand: k === 1 ? dem : dem.map(function (v) { return v * k; }), scale: k, hours: dem.length };
    });
    P.periods = {}; P.periodList = [];
    cfg.periods.forEach(function (p) { var o = {}; for (var k in p) o[k] = p[k]; o.day0 = dayIndex(p.start); P.periods[p.id] = o; P.periodList.push(p.id); });
    if (cfg.c2) {
      P.rep = cfg.c2.repDays.map(function (d, m) { return { year: "2025", day: dayIndex(d), date: d, weight: MD[m], month: m }; });
    }
    return P;
  }
  function price(P, sys, f) { return f === "gas" ? sys.gas : P.cfg.fuels[f].price; }
  function runCost(P, sys, u) { return u.hr * price(P, sys, u.fuel) + u.vom; }
  function nlCost(P, sys, u) { return u.fast ? 0 : u.nlHeat * price(P, sys, u.fuel); }
  function co2Run(P, u) { return u.hr * P.cfg.fuels[u.fuel].co2 / 1000; }          // t per MWh
  function co2NL(P, u) { return u.fast ? 0 : u.nlHeat * P.cfg.fuels[u.fuel].co2 / 1000; }  // t per unit-hour on
  function fleet(P, sys) { return P.units.concat(sys.extra || []); }

  // ---------------------------------------------------------------- the plans (LX.ShareState schemas)
  var GAS = "gas";
  function sb2Schema() {
    return { key: "sb2", version: 1, title: "Grid Room plan", fields: [
      { id: "per", short: "p", type: "enum", values: ["peak", "winter", "windy", "hot", "calm"], names: { peak: "Summer peak day", winter: "Winter peak day", windy: "Windy spring day", hot: "Peak-demand week", calm: "Low-wind winter week" }, def: "peak", label: "Period" },
      { id: "ll", short: "l", type: "int", min: 0, max: 600, step: 50, def: 0, label: "Large load (a data center)", unit: "MW" },
      { id: "llz", short: "z", type: "enum", values: ["T", "M"], names: { T: "Prairie Town", M: "Metro" }, def: "T", label: "It connects in" },
      { id: "flex", short: "f", type: "int", min: 0, max: 50, step: 10, def: 0, label: "Share it can curtail", unit: "%" },
      { id: "bid", short: "b", type: "int", min: 100, max: 2000, step: 50, def: 300, label: "Curtailment bid", unit: "$/MWh" },
      { id: "wt", short: "w", type: "int", min: 0, max: 1500, step: 50, def: 900, label: "Ridge–Town limit", unit: "MW" },
      { id: "tm", short: "t", type: "int", min: 0, max: 1200, step: 50, def: 400, label: "Town–Metro limit", unit: "MW" },
      { id: "res", short: "r", type: "int", min: 0, max: 600, step: 25, def: 250, label: "Operating reserve required", unit: "MW" },
      { id: "gas", short: "g", type: "num", min: 1.5, max: 8, step: 0.05, def: 3.85, label: "Gas price", unit: "$/MMBtu" }] };
  }
  var schema = sb2Schema();
  var presets = [
    { id: "today", label: "Today's grid", state: { ll: 0, flex: 0, wt: 900, tm: 400 }, note: "No large load; the links as built" },
    { id: "load", label: "Add the 300 MW load", state: { ll: 300, llz: "T", flex: 0 }, note: "A 300 MW data center at Prairie Town, always on" },
    { id: "flex", label: "Make it flexible", state: { ll: 300, llz: "T", flex: 20, bid: 300 }, note: "The same load, 20% of it curtailable at a $300/MWh bid" },
    { id: "link", label: "Uprate Town–Metro", state: { ll: 300, llz: "T", tm: 800 }, note: "The 300 MW load and a Town–Metro limit of 800 MW" }
  ];
  // C2: the capstone's plan (builds, the link, reserves, the large load's connection and tariff, the cost ranges)
  // C2: the capstone's plan. The fields that change the dispatch (DISPATCH) take only the values of the precomputed grid
  // (each is a min, max and step: 2 x 2 x 4 x 2 x 2 x 2 = 128 plans; the library holds each plan's year, solved by this
  // engine); the large load's share and the three costs (fixed ranges the reader sets) change only the ledger
  var C2_DISPATCH = ["conn", "flex", "pk", "bat", "up", "res"];
  function c2Schema(cfg) {
    var C = cfg.c2, R = C.costs, f = [
      { id: "conn", short: "c", type: "int", min: 150, max: 300, step: 150, def: 300, label: "Large load connected this year", unit: "MW" },
      { id: "flex", short: "f", type: "int", min: 0, max: 20, step: 20, def: 0, label: "Share it can curtail (bid $" + C.bid + "/MWh)", unit: "%" },
      { id: "pk", short: "k", type: "int", min: 0, max: 6, step: 2, def: 0, label: "New peakers at Prairie Town (50 MW each)", unit: "units" },
      { id: "bat", short: "s", type: "int", min: 0, max: 100, step: 100, def: 0, label: "Battery at Prairie Town (4 hours)", unit: "MW" },
      { id: "up", short: "u", type: "int", min: 0, max: 300, step: 300, def: 0, label: "Town–Metro uprate", unit: "MW" },
      { id: "res", short: "r", type: "int", min: 150, max: 250, step: 100, def: 250, label: "Operating reserve required", unit: "MW" },
      { id: "share", short: "h", type: "int", min: 0, max: 100, step: 10, def: 0, label: "Direct share of new fixed costs (large load)", unit: "%" }];
    ["pk", "bat", "up"].forEach(function (k) {
      var r = R[k];
      f.push({ id: "c" + k, short: "c" + k, type: "int", min: r.lo, max: r.hi, step: r.step, def: r.def, label: r.label, unit: r.unit });
    });
    return { key: "c2", version: 1, title: "C2 plan", fields: f };
  }
  // every plan of the grid, in a fixed order (the library's), each with the schema's defaults for the other fields
  function c2Grid(S, def) {
    var out = [{}];
    C2_DISPATCH.forEach(function (k) {
      var f = S.fields.filter(function (x) { return x.id === k; })[0], vals = [], nx = [];
      for (var v = f.min; v <= f.max + 1e-9; v += f.step) vals.push(v);
      out.forEach(function (o) { vals.forEach(function (v2) { var p = {}; for (var q in o) p[q] = o[q]; p[k] = v2; nx.push(p); }); });
      out = nx;
    });
    return out.map(function (o) { var p = {}, q; for (q in def) p[q] = def[q]; for (q in o) p[q] = o[q]; return p; });
  }
  function c2Key(st) { return C2_DISPATCH.map(function (k) { return k + st[k]; }).join("-"); }
  var c2presets = [
    { id: "ask", label: "Connect it, build nothing", state: { conn: 300, flex: 0, pk: 0, bat: 0, up: 0 }, note: "The 300 MW request on today's grid" },
    { id: "firm", label: "Peakers and an uprate", state: { conn: 300, flex: 0, pk: 6, bat: 0, up: 300 }, note: "Six 50 MW peakers at Town and 300 MW more on Town–Metro" },
    { id: "flex", label: "Flexible load and a battery", state: { conn: 300, flex: 20, pk: 0, bat: 100, up: 0 }, note: "20% curtailable at a $500/MWh bid, and a 100 MW battery" },
    { id: "staged", label: "Stage it: 150 MW now", state: { conn: 150, flex: 0, pk: 0, bat: 0, up: 0 }, note: "Half the request this year, the rest later" }
  ];
  // the system a plan describes: { ll, llz, flex (share), bid, caps, res, gas, extra (built peakers), bat, add (wind, solar) }
  function sysOf(st, P) {
    var C = P.cfg.c2;
    if (st.conn != null) {   // C2
      var s = { kind: "c2", ll: st.conn, llz: "T", flex: st.flex / 100, bid: C.bid, caps: { WT: linkCap(P, "WT"), TM: linkCap(P, "TM") + st.up }, res: st.res, gas: P.cfg.fuels.gas.price,
        extra: [], bat: null, add: null };
      if (st.pk > 0) { var u = {}; for (var k in C.peaker) u[k] = C.peaker[k]; u.n = st.pk; s.extra.push(u); }
      if (st.bat > 0) s.bat = { zone: "T", mw: st.bat, hours: C.battery.hours, eff: C.battery.eff };
      return s;
    }
    return { kind: "sb2", ll: st.ll, llz: st.llz, flex: st.flex / 100, bid: st.bid, caps: { WT: st.wt, TM: st.tm }, res: st.res, gas: st.gas, extra: [], bat: null, add: null };
  }
  function linkCap(P, id) { return P.links.filter(function (l) { return l.id === id; })[0].cap; }

  // ---------------------------------------------------------------- one hour's inputs, per zone
  function hourInputs(P, sys, y, h) {
    var Y = P.years[y];
    return P.zones.map(function (z) {
      var a = sys.add && sys.add[z.id], wMW = z.wind + (a ? a.wind : 0), sMW = z.solar + (a ? a.solar : 0);
      var base = Y.demand[h] * z.peak, ll = sys.ll && sys.llz === z.id ? sys.ll : 0;
      return { base: base, ll: ll, load: base + ll, wind: wMW * Y.wind[h], solar: sMW * Y.solar[h] };
    });
  }

  // ---------------------------------------------------------------- the day's model
  // st: the state carried from the day before ({ u: {id: n at 23:00}, v: {id: [24]}, w: {id: [24]} }) or null (the first
  // day); o: { fix: { u: {id: [24]}, v: {id: [24]} } (the dispatch LP), relax, tie: {...} (other tie weights, tests),
  // bump: { row, d } (move one row's right-hand side: the test's slopes) }
  function dayModel(P, sys, y, day, st, o) {
    o = o || {};
    var V = [], C = [], H = 24, t0 = day * 24, T = tieOf(P, o.tie), U = fleet(P, sys), fix = o.fix, offset = 0;
    var bal = [], res = [], inp = [], t;
    for (t = 0; t < H; t++) { bal.push(P.zones.map(function () { return []; })); res.push([]); inp.push(hourInputs(P, sys, y, t0 + t)); }
    U.forEach(function (u, gi) {
      var zi = P.zix[u.zone], rc = runCost(P, sys, u), nl = nlCost(P, sys, u), rt = T.reserve * (gi + 1);
      for (var t = 0; t < H; t++) {
        var p = u.id + "_" + t;
        if (u.fast) {
          V.push({ name: "p" + p, ub: u.pmax * u.n, cost: rc }, { name: "r" + p, ub: u.rcap * u.n, cost: rt });
          C.push({ name: "px" + p, terms: [["p" + p, 1], ["r" + p, 1]], le: u.pmax * u.n });
        } else if (fix) {
          var n = fix.u[u.id][t];
          offset += nl * n;
          if (n === 0) continue;
          V.push({ name: "p" + p, lb: u.pmin * n, ub: u.pmax * n, cost: rc }, { name: "r" + p, ub: u.rcap * n, cost: rt });
          C.push({ name: "px" + p, terms: [["p" + p, 1], ["r" + p, 1]], le: u.pmax * n });
        } else {
          V.push({ name: "u" + p, ub: u.n, type: o.relax ? "continuous" : "integer", cost: nl },
            { name: "v" + p, ub: u.n, cost: u.su }, { name: "w" + p, ub: u.n }, { name: "p" + p, cost: rc }, { name: "r" + p, cost: rt });
          C.push({ name: "pn" + p, terms: [["p" + p, 1], ["u" + p, -u.pmin]], ge: 0 },
            { name: "px" + p, terms: [["p" + p, 1], ["r" + p, 1], ["u" + p, -u.pmax]], le: 0 },
            { name: "rc" + p, terms: [["r" + p, 1], ["u" + p, -u.rcap]], le: 0 });
          if (t > 0) C.push({ name: "lg" + p, terms: [["u" + p, 1], ["u" + u.id + "_" + (t - 1), -1], ["v" + p, -1], ["w" + p, 1]], eq: 0 });
          else if (st) C.push({ name: "lg" + p, terms: [["u" + p, 1], ["v" + p, -1], ["w" + p, 1]], eq: st.u[u.id] });
          else C.push({ name: "lg" + p, terms: [["v" + p, 1], ["w" + p, 1]], eq: 0 });
          var s, hist;
          if (u.ut > 1) {
            var a = [["u" + p, 1]]; hist = 0;
            for (s = t - u.ut + 1; s <= t; s++) { if (s >= 0) a.push(["v" + u.id + "_" + s, -1]); else if (st) hist += st.v[u.id][24 + s] || 0; }
            C.push({ name: "up" + p, terms: a, ge: hist });
          }
          if (u.dt > 1) {
            var b = [["u" + p, 1]]; hist = 0;
            for (s = t - u.dt + 1; s <= t; s++) { if (s >= 0) b.push(["w" + u.id + "_" + s, 1]); else if (st) hist += st.w[u.id][24 + s] || 0; }
            C.push({ name: "dn" + p, terms: b, le: u.n - hist });
          }
        }
        bal[t][zi].push(["p" + p, 1]);
        res[t].push(["r" + p, 1]);
      }
    });
    for (t = 0; t < H; t++) {
      P.zones.forEach(function (z, i) {
        var x = inp[t][i], q = "_" + z.id + "_" + t, av = x.wind + x.solar;
        if (av > 0) { V.push({ name: "sp" + q, ub: av, cost: T.spill[i] }); bal[t][i].push(["sp" + q, -1]); }
        V.push({ name: "sh" + q, cost: P.cfg.voll + T.shed[i] }); bal[t][i].push(["sh" + q, 1]);
        bal[t][i].rhs = x.load - av;
      });
      P.links.forEach(function (l) {
        var cap = sys.caps[l.id], f = "f_" + l.id + "_" + t;
        V.push({ name: f, lb: -cap, ub: cap });
        bal[t][P.zix[l.from]].push([f, -1]); bal[t][P.zix[l.to]].push([f, 1]);
      });
      if (sys.ll > 0 && sys.flex > 0) { V.push({ name: "cl_" + t, ub: sys.ll * sys.flex, cost: sys.bid }); bal[t][P.zix[sys.llz]].push(["cl_" + t, 1]); }
      if (sys.bat) {
        var B = sys.bat, q2 = "_" + t, E = B.mw * B.hours;
        V.push({ name: "bc" + q2, ub: B.mw, cost: T.battery + T.batteryHour * t }, { name: "bd" + q2, ub: B.mw, cost: T.battery + T.batteryHour * (H - 1 - t) },
          { name: "bq" + q2, ub: E }, { name: "br" + q2, cost: T.reserve * (U.length + 1) });
        bal[t][P.zix[B.zone]].push(["bd" + q2, 1], ["bc" + q2, -1]);
        C.push({ name: "bs" + q2, terms: [["bq" + q2, 1], ["bc" + q2, -B.eff], ["bd" + q2, 1]].concat(t > 0 ? [["bq_" + (t - 1), -1]] : []), eq: t > 0 ? 0 : E / 2 });
        C.push({ name: "bp" + q2, terms: [["br" + q2, 1], ["bd" + q2, 1], ["bc" + q2, -1]], le: B.mw }, { name: "be" + q2, terms: [["br" + q2, 1], ["bq" + q2, -1]], le: 0 });
        if (t === H - 1) C.push({ name: "bend", terms: [["bq" + q2, 1]], ge: E / 2 });
        res[t].push(["br" + q2, 1]);
      }
      V.push({ name: "rs_" + t, cost: P.cfg.reserveShort }); res[t].push(["rs_" + t, 1]);
      P.zones.forEach(function (z, i) { C.push({ name: "bal_" + z.id + "_" + t, terms: bal[t][i], eq: bal[t][i].rhs }); });
      C.push({ name: "res_" + t, terms: res[t], ge: sys.res });
    }
    if (fix) U.forEach(function (u) { if (!u.fast) offset += u.su * sum(fix.v[u.id]); });
    if (o.bump) C.forEach(function (c) { if (c.name === o.bump.row) { if (c.eq != null) c.eq += o.bump.d; else c.ge += o.bump.d; } });
    return { sense: "min", variables: V, constraints: C, offset: offset };
  }
  function tieOf(P, t) { var o = {}, k, b = P.cfg.tie; for (k in b) o[k] = b[k]; for (k in TIE) if (o[k] == null) o[k] = TIE[k]; for (k in (t || {})) o[k] = t[k]; return o; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

  // the commitment a MILP chose: { u: {id: [24]}, v, w } (whole numbers)
  function commitment(P, sys, r) {
    var c = { u: {}, v: {}, w: {} };
    fleet(P, sys).forEach(function (u) {
      if (u.fast) return;
      ["u", "v", "w"].forEach(function (k) { var a = []; for (var t = 0; t < 24; t++) a.push(Math.round(r.values[k + u.id + "_" + t])); c[k][u.id] = a; });
    });
    return c;
  }
  // the state carried to the next day
  function carry(P, sys, c) {
    var s = { u: {}, v: c.v, w: c.w };
    fleet(P, sys).forEach(function (u) { if (!u.fast) s.u[u.id] = c.u[u.id][23]; });
    return s;
  }

  // ---------------------------------------------------------------- one solved day -> what the pages show
  // milp: the MILP's result (its commitment); lp: the dispatch LP's result (dispatch, prices); both with values
  function readDay(P, sys, y, day, com, lp) {
    var x = lp.values, U = fleet(P, sys), Z = P.zones, out = { y: y, day: day, hours: [] };
    var tot = { running: 0, noload: 0, startup: 0, co2: 0, shed: 0, rshort: 0, spill: 0, curtail: 0, llMWh: 0, llPay: 0, llShed: 0, rent: 0,
      gen: {}, starts: {}, uplift: {}, rev: {}, cost: {}, pay: Z.map(function () { return 0; }), load: Z.map(function () { return 0; }), base: Z.map(function () { return 0; }),
      cong: {}, spillZ: Z.map(function () { return 0; }), shedZ: Z.map(function () { return 0; }), batIn: 0, batOut: 0 };
    P.links.forEach(function (l) { tot.cong[l.id] = 0; });
    U.forEach(function (u) { tot.gen[u.id] = 0; tot.starts[u.id] = 0; tot.rev[u.id] = 0; tot.cost[u.id] = 0; tot.uplift[u.id] = 0; });
    for (var t = 0; t < 24; t++) {
      var inp = hourInputs(P, sys, y, day * 24 + t), h = { t: t, z: [], f: {}, p: {}, u: {}, r: {} };
      h.rho = clean(lp.duals["res_" + t]);
      Z.forEach(function (z, i) {
        var q = "_" + z.id + "_" + t, sp = x["sp" + q] || 0, sh = x["sh" + q] || 0, lam = clean(lp.duals["bal" + q]);
        h.z.push({ load: inp[i].load, base: inp[i].base, wind: inp[i].wind, solar: inp[i].solar, used: inp[i].wind + inp[i].solar - sp, spill: sp, shed: sh, price: lam });
        tot.spill += sp; tot.spillZ[i] += sp; tot.shed += sh; tot.shedZ[i] += sh; tot.load[i] += inp[i].load; tot.base[i] += inp[i].base;
      });
      P.links.forEach(function (l) {
        var f = x["f_" + l.id + "_" + t], cap = sys.caps[l.id];
        h.f[l.id] = f;
        if (cap > 0 && Math.abs(f) >= cap - 1e-6) tot.cong[l.id]++;
        tot.rent += f * (h.z[P.zix[l.to]].price - h.z[P.zix[l.from]].price);
      });
      h.cl = x["cl_" + t] || 0; tot.curtail += h.cl;
      if (sys.ll > 0) {
        // the zone's unserved load is shared in proportion to load (the large load's after its own curtailment)
        var zi = P.zix[sys.llz], want = sys.ll - h.cl, rest = h.z[zi].load - h.cl, cut = rest > 0 ? want * h.z[zi].shed / rest : 0;
        h.llShed = cut; tot.llShed += cut;
        tot.llMWh += want - cut; tot.llPay += (want - cut) * h.z[zi].price;
      }
      Z.forEach(function (z, i) { tot.pay[i] += (h.z[i].load - h.z[i].shed - (sys.ll > 0 && i === P.zix[sys.llz] ? h.cl : 0)) * h.z[i].price; });
      if (sys.bat) { h.bc = x["bc_" + t]; h.bd = x["bd_" + t]; h.bq = x["bq_" + t]; h.br = x["br_" + t]; tot.batIn += h.bc; tot.batOut += h.bd; }
      h.rshort = x["rs_" + t] || 0; tot.rshort += h.rshort;
      U.forEach(function (u) {
        var nm = u.id + "_" + t, p = x["p" + nm] || 0, r = x["r" + nm] || 0, n = u.fast ? null : com.u[u.id][t], lam = h.z[P.zix[u.zone]].price;
        h.p[u.id] = p; h.r[u.id] = r; h.u[u.id] = n;
        var rc = runCost(P, sys, u), nl = n ? nlCost(P, sys, u) * n : 0;
        tot.gen[u.id] += p; tot.running += rc * p; tot.noload += nl;
        tot.co2 += co2Run(P, u) * p + (n ? co2NL(P, u) * n : 0);
        tot.rev[u.id] += lam * p + h.rho * r; tot.cost[u.id] += rc * p + nl;
      });
      out.hours.push(h);
    }
    U.forEach(function (u) {
      if (u.fast) return;
      var st = sum(com.v[u.id]); tot.starts[u.id] = st; tot.startup += st * u.su; tot.cost[u.id] += st * u.su;
      var gap = tot.cost[u.id] - tot.rev[u.id];
      tot.uplift[u.id] = gap > 0.5 ? gap : 0;
    });
    tot.prod = tot.running + tot.noload + tot.startup;
    tot.upliftAll = U.reduce(function (s, u) { return s + tot.uplift[u.id]; }, 0);
    out.tot = tot;
    out.objective = lp.objective;
    return out;
  }
  function clean(v) { return v == null ? null : (Math.abs(v) < 5e-7 ? 0 : v); }

  // ---------------------------------------------------------------- solving (never rejects)
  var RANK = { optimal: 0, "time-limit": 2, "iteration-limit": 2, "objective-bound": 2, "objective-target": 2, interrupted: 2, infeasible: 3, "infeasible-or-unbounded": 3, unbounded: 3, cancelled: 4, superseded: 4, error: 5 };
  function worst(list) { var w = "optimal"; list.forEach(function (s) { if ((RANK[s] == null ? 5 : RANK[s]) > (RANK[w] == null ? 5 : RANK[w])) w = s; }); return w; }
  // the days a task runs: [{ y, day, carry (use yesterday's state), label }]
  function daysOf(state, P, task) {
    // C2's year (representative days): the 12 representative days, each weighted by its month's days, less the days of a kept hard week
    // in that month; then the two hard weeks, day by day in order (weight 1 each): 365 days in all
    var wk = [];
    if (task === "year" || task === "weeks") P.cfg.c2.weeks.forEach(function (id) { var pr = P.periods[id]; for (var d = 0; d < pr.days; d++) wk.push({ y: String(pr.year), day: pr.day0 + d, carry: d > 0, period: id, weight: 1, label: dayLong(pr.day0 + d) }); });
    if (task === "weeks") return wk;
    if (task === "year") return P.rep.map(function (r) {
      var less = wk.filter(function (x) { return dateOf(x.day).m === r.month; }).length;
      return { y: r.year, day: r.day, carry: false, weight: r.weight - less, rep: true, label: dayLong(r.day) };
    }).concat(wk);
    if (task === "day") return [];   // solve() fills in opts.only
    var p = P.periods[state.per] || P.periods[P.periodList[0]], o = [];
    for (var k = 0; k < p.days; k++) o.push({ y: String(p.year), day: p.day0 + k, carry: k > 0, period: p.id, label: dayLong(p.day0 + k) });
    return o;
  }
  function solve(state, P, opts) {
    opts = opts || {};
    var task = opts.task || (state.conn != null ? "year" : "period"), attempt = opts.attempt || 1;
    var limit = opts.timeLimit != null ? opts.timeLimit : (attempt > 1 ? 30 : 10);
    var call = opts.solver || (typeof window !== "undefined" && window.LX && window.LX.solver ? function (m, so) { return window.LX.solver.solve(m, so); } : null);
    var t0 = Date.now(), sys = sysOf(state, P), days = opts.only ? [{ y: String(opts.only.y), day: opts.only.day, carry: false, label: dayLong(opts.only.day) }] : daysOf(state, P, task), raw = { task: task, state: state, sys: sys, days: [], solves: [] };
    function fail(e) { return { status: "error", ok: false, kind: "milp", message: "The run failed before it gave an answer" + (e && e.message ? " (" + e.message + ")." : "."), results: null, mipGap: null }; }
    if (!call) return Promise.resolve(fail(new Error("no solver")));
    function one(model, label, gap) {
      var p;
      try { p = Promise.resolve(call(model, { timeLimit: limit, signal: opts.signal, gap: gap, label: label })); }
      catch (e) { p = Promise.resolve({ status: "error", ok: false, message: e && e.message }); }
      return p.then(function (r) { r = r && typeof r === "object" ? r : { status: "error", ok: false }; raw.solves.push({ label: label, status: r.status, mipGap: r.mipGap }); return r; },
        function (e) { raw.solves.push({ label: label, status: "error" }); return { status: "error", ok: false, message: e && e.message }; });
    }
    function stop(r) { return !r || r.status === "cancelled" || r.status === "superseded" || r.status === "error" || !r.values; }
    var k = 0, st = null;
    function next() {
      if (k >= days.length) return Promise.resolve();
      var d = days[k++], prev = d.carry ? st : null;
      if (opts.onDay) opts.onDay(k, days.length);
      return one(dayModel(P, sys, d.y, d.day, prev), "e2-uc", 1e-6).then(function (rm) {
        if (stop(rm)) { raw.failed = { day: d, r: rm, step: "commit" }; return; }
        var com = commitment(P, sys, rm);
        return one(dayModel(P, sys, d.y, d.day, prev, { fix: com }), "e2-price").then(function (rl) {
          // prices only from a pricing LP that reports optimal (a time-limited LP's duals are not shown, whatever the MILP did)
          if (stop(rl) || !rl.duals || rl.status !== "optimal") { raw.failed = { day: d, r: rl, step: "price" }; return; }
          var rd = readDay(P, sys, d.y, d.day, com, rl);
          rd.spec = d; rd.milp = { status: rm.status, gap: rm.mipGap, objective: rm.objective }; rd.com = com;
          raw.days.push(rd);
          st = carry(P, sys, com);
          return next();
        });
      });
    }
    return next().then(function () {
      var sts = raw.solves.map(function (s) { return s.status; }), status = raw.solves.length ? worst(sts) : "error";
      var gaps = raw.solves.map(function (s) { return s.mipGap; }).filter(function (g) { return g != null && isFinite(g); });
      var gap = gaps.length ? Math.max.apply(null, gaps) : null;
      var res = { status: status, ok: status === "optimal", kind: "milp", task: task, mipGap: status === "optimal" && gap != null && gap < 5e-5 ? 0 : gap, gapRaw: gap,
        ms: { roundTrip: Date.now() - t0 }, raw: raw, results: null, message: null, hint: null };
      // the commitment's and the pricing's statuses, apart (the pages may show prices only when every pricing LP is optimal)
      var stOf = function (lb) { var a = raw.solves.filter(function (s) { return s.label === lb; }).map(function (s) { return s.status; }); return a.length ? worst(a) : null; };
      res.commitStatus = stOf("e2-uc"); res.priceStatus = stOf("e2-price");
      var priceStop = raw.failed && raw.failed.step === "price" && raw.failed.r && raw.failed.r.status && raw.failed.r.status !== "optimal";
      var complete = raw.days.length === days.length;
      if (complete) res.results = summarize(state, P, raw);
      if (status === "optimal" && !complete) { res.status = "error"; res.ok = false; }
      var n = days.length, nRep = days.filter(function (d) { return d.rep; }).length;
      var what = task === "year" ? n + " days (" + nRep + " representative days and the " + (n - nRep) + " days of the two hard weeks)" : n + " day" + (n === 1 ? "" : "s");
      if (RANK[res.status] === 2) {
        var lim = (limit >= 1 ? Math.round(limit) : limit) + " s";
        if (priceStop && !res.results) res.message = "The dispatch linear program that prices " + raw.failed.day.label + " stopped (" + raw.failed.r.status + ") before it proved its prices, so no result is shown: the commitment alone gives no prices. Try again gives the solver more time.";
        else res.message = res.results
          ? "Stopped at the " + lim + " time limit" + (n > 1 ? " on at least one day" : "") + ": the commitment shown is the best found so far" + (gap != null ? ", within " + (gap * 100).toFixed(2) + "% of the best bound" : "") + ". It is not proven optimal, and its prices are conditional on it. Try again gives the solver more time."
          : "Stopped at the " + lim + " time limit on " + (raw.failed ? raw.failed.day.label : "a day") + " before any commitment was found, so no result is shown. Try again gives the solver more time.";
      } else if (res.status === "optimal") {
        res.message = "Done: " + what + ", each committed by a mixed-integer program (reported optimal) and priced by the dispatch linear program with that commitment fixed.";
      } else if (/infeasible/.test(res.status)) {
        res.message = "No dispatch meets every rule on " + (raw.failed ? raw.failed.day.label : "a day") + ".";
        res.hint = "This should not happen (unserved load is allowed at a penalty): please report the plan link.";
      } else if (res.status === "error" && !res.message) res.message = "The run failed before it gave an answer" + (raw.failed ? " (" + raw.failed.day.label + ", " + raw.failed.step + ")." : ".");
      return res;
    }, function (e) { return fail(e); });
  }

  // ---------------------------------------------------------------- what the pages show (pure)
  // R: { task, sys, days: [readDay], tot (sums over the days, or weighted to a year for task "year"), avg, max, ... }
  function summarize(state, P, raw) {
    var sys = raw.sys, days = raw.days, task = raw.task, U = fleet(P, sys), Z = P.zones;
    var w = days.map(function (d) { return d.spec && d.spec.weight != null ? d.spec.weight : 1; });
    var T = { running: 0, noload: 0, startup: 0, prod: 0, co2: 0, shed: 0, rshort: 0, spill: 0, curtail: 0, llMWh: 0, llPay: 0, llShed: 0, rent: 0, upliftAll: 0, batIn: 0, batOut: 0,
      gen: {}, starts: {}, uplift: {}, pay: Z.map(function () { return 0; }), load: Z.map(function () { return 0; }), base: Z.map(function () { return 0; }),
      cong: {}, spillZ: Z.map(function () { return 0; }), shedZ: Z.map(function () { return 0; }) };
    P.links.forEach(function (l) { T.cong[l.id] = 0; });
    U.forEach(function (u) { T.gen[u.id] = 0; T.starts[u.id] = 0; T.uplift[u.id] = 0; });
    var mx = Z.map(function () { return -Infinity; }), mn = Z.map(function () { return Infinity; }), rhoMax = 0, rshortH = 0, shedH = 0;
    days.forEach(function (d, k) {
      var t = d.tot, wk = w[k];
      ["running", "noload", "startup", "prod", "co2", "shed", "rshort", "spill", "curtail", "llMWh", "llPay", "llShed", "rent", "upliftAll", "batIn", "batOut"].forEach(function (q) { T[q] += wk * t[q]; });
      U.forEach(function (u) { T.gen[u.id] += wk * t.gen[u.id]; T.starts[u.id] += wk * t.starts[u.id]; T.uplift[u.id] += wk * t.uplift[u.id]; });
      Z.forEach(function (z, i) { T.pay[i] += wk * t.pay[i]; T.load[i] += wk * t.load[i]; T.base[i] += wk * t.base[i]; T.spillZ[i] += wk * t.spillZ[i]; T.shedZ[i] += wk * t.shedZ[i]; });
      P.links.forEach(function (l) { T.cong[l.id] += wk * t.cong[l.id]; });
      d.hours.forEach(function (h) {
        h.z.forEach(function (x, i) { mx[i] = Math.max(mx[i], x.price); mn[i] = Math.min(mn[i], x.price); });
        rhoMax = Math.max(rhoMax, h.rho); if (h.rshort > 1e-6) rshortH += wk; if (h.z.some(function (x) { return x.shed > 1e-6; })) shedH += wk;
      });
    });
    var served = Z.map(function (z, i) { return T.load[i] - T.shedZ[i] - (sys.ll > 0 && i === P.zix[sys.llz] ? T.curtail : 0); });
    var R = { task: task, plan: state, sys: sys, days: days, tot: T, hours: days.length * 24, weights: w,
      avgPrice: Z.map(function (z, i) { return served[i] > 0 ? T.pay[i] / served[i] : 0; }),
      maxPrice: mx, minPrice: mn, rhoMax: rhoMax, rshortHours: rshortH, shedHours: shedH, served: served,
      llAvg: T.llMWh > 0 ? T.llPay / T.llMWh : null, mixed: U.map(function (u) { return { id: u.id, name: u.name, short: u.short, mwh: T.gen[u.id], starts: T.starts[u.id], uplift: T.uplift[u.id] }; }) };
    R.renUsed = Z.reduce(function (s, z, i) { return s + days.reduce(function (a, d, k) { return a + w[k] * d.hours.reduce(function (b, h) { return b + h.z[i].used; }, 0); }, 0); }, 0);
    return R;
  }

  // ---------------------------------------------------------------- the test's corner check (Node): the slope of the
  // dispatch LP's cost when one balance or the reserve row moves by ±d; a shown price is unique when both slopes equal it
  function priceSlopes(P, sys, y, day, st, com, row, solveSync, d) {
    d = d || 0.1;
    var base = solveSync(dayModel(P, sys, y, day, st, { fix: com })).objective;
    var up = solveSync(dayModel(P, sys, y, day, st, { fix: com, bump: { row: row, d: d } })).objective;
    var dn = solveSync(dayModel(P, sys, y, day, st, { fix: com, bump: { row: row, d: -d } })).objective;
    return { up: (up - base) / d, down: (base - dn) / d };
  }

  // ---------------------------------------------------------------- adequacy: a seeded Monte Carlo (C2)
  var rng = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) || (typeof require === "function" ? require("./core.js").mulberry32 : null);
  // the hour's unserved MW: the max-flow deficit of the chain W - T - M (subsets in the order W, T, M, WT, TM, WM, WTM)
  function deficit(dW, dT, dM, cWT, cTM) {   // d = load - available supply in each zone
    var x = Math.max(0, dW - cWT, dT - cWT - cTM, dM - cTM, dW + dT - cTM, dT + dM - cWT, dW + dM - cWT - cTM, dW + dT + dM);
    return x;
  }
  // the most extra load Town can take this hour with nothing unserved (for charging the battery)
  function slackT(dW, dT, dM, cWT, cTM) {
    return Math.min(-dT + cWT + cTM, -(dW + dT) + cTM, -(dT + dM) + cWT, -(dW + dT + dM));
  }
  function adequacyCore(P, sys, o) {
    var C = P.cfg.c2.adequacy, N = o.years || C.years, seed = o.seed || C.seed, r = rng(seed), U = fleet(P, sys);
    var yrs = (o.weather || C.weather).filter(function (y) { return P.years[y]; });
    var units = [];
    U.forEach(function (u) { for (var k = 0; k < u.n; k++) units.push({ z: P.zix[u.zone], mw: u.pmax, q: u.for }); });
    var cWT = sys.caps.WT, cTM = sys.caps.TM, B = sys.bat, E = B ? B.mw * B.hours : 0, flex = sys.ll * sys.flex, llz = sys.ll > 0 ? P.zix[sys.llz] : -1;
    // per weather year: each hour's load minus wind and sun, per zone (the large load included)
    var net = {};
    yrs.forEach(function (y) {
      var Y = P.years[y], n = Y.hours, a = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
      for (var h = 0; h < n; h++) { var x = hourInputs(P, sys, y, h); for (var i = 0; i < 3; i++) a[i][h] = x[i].load - x[i].wind - x[i].solar; }
      net[y] = a;
    });
    var out = { years: 0, lolDays: 0, lolh: 0, eue: 0, curtailHours: 0, curtailMWh: 0, perYear: [], seed: seed, weather: yrs };
    var avail = [0, 0, 0];
    return {
      // run draw years [from, to); returns true when all N are done
      step: function (count) {
        var end = Math.min(N, out.years + count);
        for (var yk = out.years; yk < end; yk++) {
          var y = yrs[yk % yrs.length], A = net[y], days = A[0].length / 24, soc = E, lolDaysY = 0;
          for (var d = 0; d < days; d++) {
            avail[0] = avail[1] = avail[2] = 0;
            for (var k = 0; k < units.length; k++) { var uu = units[k]; if (r() >= uu.q) avail[uu.z] += uu.mw; }
            var dayLol = false;
            for (var t = 0; t < 24; t++) {
              var h = d * 24 + t, dW = A[0][h] - avail[0], dT = A[1][h] - avail[1], dM = A[2][h] - avail[2];
              var x = deficit(dW, dT, dM, cWT, cTM);
              if (x > 1e-9 && flex > 0) {   // the flexible share curtails first (it sits in llz)
                var c0 = Math.min(flex, x), dd = [dW, dT, dM]; dd[llz] -= flex;
                var x2 = deficit(dd[0], dd[1], dd[2], cWT, cTM), cut = x - x2;
                if (cut > 1e-9) { out.curtailHours++; out.curtailMWh += cut; }
                if (llz === 0) dW -= cut; else if (llz === 1) dT -= cut; else dM -= cut;
                x = x2; void c0;
              }
              if (B) {
                if (x > 1e-9 && soc > 1e-9) {
                  var dis = Math.min(B.mw, soc), x3 = deficit(dW, dT - dis, dM, cWT, cTM), used = x - x3;
                  soc -= used; x = x3;
                } else if (x <= 1e-9 && soc < E - 1e-9) {
                  var room = slackT(dW, dT, dM, cWT, cTM), ch = Math.min(B.mw, (E - soc) / B.eff, Math.max(0, room));
                  soc += ch * B.eff;
                }
              }
              if (x > 1e-6) { out.lolh++; out.eue += x; dayLol = true; }
            }
            if (dayLol) { out.lolDays++; lolDaysY++; }
          }
          out.perYear.push(lolDaysY);
          out.years++;
        }
        return out.years >= N;
      },
      out: out, N: N
    };
  }
  function adequacyResult(o) {
    var n = o.years, m = o.lolDays / n, v = 0;
    o.perYear.forEach(function (x) { v += (x - m) * (x - m); });
    var se = n > 1 ? Math.sqrt(v / (n - 1) / n) : 0;
    return { years: n, seed: o.seed, weather: o.weather, lole: m, lolh: o.lolh / n, eue: o.eue / n, curtailHours: o.curtailHours / n, curtailMWh: o.curtailMWh / n,
      se: se, ci: [Math.max(0, m - 1.645 * se), m + 1.645 * se], lolDays: o.lolDays };
  }
  function adequacy(P, sys, o) {
    o = o || {};
    var A = adequacyCore(P, sys, o);
    if (o.sync) { A.step(A.N); return adequacyResult(A.out); }
    return new Promise(function (resolve) {
      var chunk = o.chunk || 10;
      function go() {
        if (o.signal && o.signal.aborted) { resolve({ status: "cancelled", ok: false }); return; }
        var done; try { done = A.step(chunk); } catch (e) { resolve({ status: "error", ok: false, message: e && e.message }); return; }
        if (o.onProgress) o.onProgress(A.out.years, A.N);
        if (done) resolve({ status: "optimal", ok: true, kind: "simulation", results: adequacyResult(A.out) });
        else setTimeout(go, 0);
      }
      go();
    });
  }

  // ---------------------------------------------------------------- words and numbers
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function mwh(v) { return kilo(v) + " MWh"; }
  function priceTxt(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function millions(v) { var r = Math.round(v / 1e5) / 10; return (r < 0 ? "−$" : "$") + Math.abs(r).toFixed(1) + "M"; }

  // ---------------------------------------------------------------- the no-JS blocks (written into the pages by the tests)
  function escH(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function linkA(src, txt) { return src && src.url ? '<a href="' + escH(src.url) + '">' + escH(txt || src.text) + "</a>" : escH(txt || ""); }
  // the precomputed default run(s) as a plain table: cfg.precomputed[key] = { head, rows: [[label, value]], note }
  function fallback(P, key) {
    var pc = P.cfg.precomputed && P.cfg.precomputed[key];
    if (!pc) return "";
    var rows = pc.rows.map(function (r) { return "<tr><td>" + escH(r[0]) + "</td><td class=\"n\">" + escH(r[1]) + "</td></tr>"; }).join("");
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">" + escH(pc.head) + "</th><th scope=\"col\">Value</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      "<p class=\"lx-hint\">" + escH(pc.note) + "</p>";
  }
  // the inputs the engine uses, with their sources (the sources card of SB2 and C2)
  function inputsHTML(P) {
    var c = P.cfg, S = c.sources, Z = c.zones, sys = { gas: c.fuels.gas.price };
    var zl = function (k) { return Z.map(function (z) { return kilo(z[k]); }).join(" · "); };
    var rows = [
      ["Peak load: Ridge · Town · Metro", zl("peak") + " MW", "Illustrative; each hour follows SPP's 2025 demand shape (" + linkA(S.eia930, "EIA-930") + ", accessed " + S.eia930.asOf + ")"],
      ["Wind built: Ridge · Town · Metro", zl("wind") + " MW", "Illustrative"],
      ["Solar built: Ridge · Town · Metro", zl("solar") + " MW", "Illustrative"],
      ["Output per MW: wind · solar", (P.cfg.cf.wind * 100).toFixed(1) + "% · " + (P.cfg.cf.solar * 100).toFixed(1) + "% a year", "SPP's 2025 shapes scaled to EIA's 2025 monthly capacity factors: " + linkA(S.epm607, "EPM Table 6.07.B") + ", " + S.epm607.asOf],
      ["Link limits: Ridge–Town · Town–Metro", P.links.map(function (l) { return kilo(l.cap); }).join(" · ") + " MW", "Illustrative"],
      ["Fuel: gas · coal", "$" + c.fuels.gas.price.toFixed(2) + " · $" + c.fuels.coal.price.toFixed(2) + "/MMBtu", "Average cost to the electric power industry, 2025: " + linkA(S.epa74, "EIA, Electric Power Annual, Table 7.4") + " · " + S.epa74.asOf + ". One <span class=\"lx-term\" data-term=\"mmbtu\">MMBtu</span> is a million British thermal units of fuel heat"],
      ["Heat rates", "6.4 to 11.2 MMBtu/MWh", "Illustrative, around EIA's 2025 averages (coal 10.65, gas 7.78 MMBtu/MWh): " + linkA(S.epa81, "Electric Power Annual, Table 8.1") + " · " + S.epa81.asOf],
      ["CO₂: gas · subbituminous coal", c.fuels.gas.co2.toFixed(2) + " · " + c.fuels.coal.co2.toFixed(2) + " kg/MMBtu", linkA(S.co2, "EIA, Carbon Dioxide Emissions Coefficients") + " · " + S.co2.asOf],
      ["Unserved load · reserve short", "$" + kilo(c.voll) + " · $" + kilo(c.reserveShort) + "/MWh", "Illustrative penalties in the objective, not costs anyone pays"]];
    var h = "<div class=\"lx-scroll-x\"><table class=\"lx-facts e2-inputs\"><thead><tr><th scope=\"col\">Input</th><th scope=\"col\">Value</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      rows.map(function (r) { return "<tr><td>" + escH(r[0]) + "</td><td class=\"n\">" + escH(r[1]) + "</td><td class=\"s\">" + r[2] + "</td></tr>"; }).join("") + "</tbody></table></div>";
    var head = ["Unit group", "Zone", "Units", "Minimum output", "Running cost at $" + sys.gas.toFixed(2) + " gas", "No-load cost", "Start-up", "Minimum up · down", "Reserve per unit"];
    var urows = P.units.map(function (u) {
      return [u.name, Z[P.zix[u.zone]].name, u.n + " × " + kilo(u.pmax) + " MW", u.fast ? "none" : kilo(u.pmin) + " MW", "$" + runCost(P, sys, u).toFixed(2) + "/MWh", u.fast ? "none" : "$" + kilo(nlCost(P, sys, u)) + "/h", u.fast ? "none" : "$" + kilo(u.su), u.fast ? "none" : u.ut + " · " + u.dt + " h", kilo(u.rcap) + " MW"];
    });
    h += "<details class=\"lx-deeper e2-units\"><summary><span class=\"k\">The plants</span>Each unit group's data (illustrative)</summary><div class=\"lx-deeper-body\"><div class=\"lx-scroll-x\"><table class=\"lx-facts\"><thead><tr>" +
      head.map(function (x) { return "<th scope=\"col\">" + escH(x) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      urows.map(function (r) { return "<tr>" + r.map(function (x, i) { return i ? "<td class=\"n\" data-l=\"" + escH(head[i]) + "\">" + escH(x) + "</td>" : "<th scope=\"row\">" + escH(x) + "</th>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div><p class=\"lx-hint\">Running cost = heat rate × fuel price + variable upkeep; no-load cost = the heat burned each hour a unit is on × fuel price. Peakers start within minutes and have no minimum output, so the model gives them no on/off decision.</p></div></details>";
    return h;
  }

  var E2 = { VERSION: 1, MD: MD, MON: MON, MONTHS: MONTHS, TIE: TIE, dayIndex: dayIndex, dateOf: dateOf, dayLabel: dayLabel, dayLong: dayLong, hh: hh,
    prepare: prepare, runCost: runCost, nlCost: nlCost, co2Run: co2Run, co2NL: co2NL, fleet: fleet, hourInputs: hourInputs, tieOf: tieOf,
    schema: schema, sb2Schema: sb2Schema, c2Schema: c2Schema, c2Grid: c2Grid, c2Key: c2Key, C2_DISPATCH: C2_DISPATCH, presets: presets, c2presets: c2presets, sysOf: sysOf, linkCap: linkCap,
    dayModel: dayModel, commitment: commitment, carry: carry, readDay: readDay, daysOf: daysOf, solve: solve, worst: worst, summarize: summarize,
    priceSlopes: priceSlopes, fallback: fallback, inputsHTML: inputsHTML, escH: escH, deficit: deficit, slackT: slackT, adequacy: adequacy, adequacyResult: adequacyResult,
    money: money, kilo: kilo, mwh: mwh, priceTxt: priceTxt, millions: millions };
  if (typeof module !== "undefined" && module.exports) module.exports = E2;
  if (typeof window === "undefined" || !window.LX) return;
  window.LX.E2 = E2;
  // ---------------------------------------------------------------- view kit, shared by SB2 and C2 (LX.E2.ui)
  var LX = window.LX, H = LX.H;
  var ZCOL = { W: "var(--lx-wind)", T: "var(--lx-demand)", M: "var(--lx-tier-4)" };
  var GCOL = { tcc: "var(--lx-cc)", tpk: "var(--lx-pk)", mco: "var(--lx-ink-2)", mcc: "var(--lx-cc)", mst: "var(--lx-steel)", mpk: "var(--lx-pk)", npk: "var(--lx-pk)" };
  var LCOL = { WT: "var(--lx-wind)", TM: "var(--lx-tier-4)" };
  function esc(s) { return LX.esc(String(s)); }
  function when(R, i) { var d = R.days[Math.floor(i / 24)]; return dayLabel(d.day) + " " + hh(i % 24); }
  function moneyK(v) { return money(Math.round(v / 1000) * 1000); }
  function fmtOf(f) {
    var u = f.unit;
    if (u === "MW") return function (v) { return kilo(v) + " MW"; };
    if (u === "%") return function (v) { return v + "%"; };
    if (u === "$/MWh") return function (v) { return "$" + kilo(v) + "/MWh"; };
    if (u === "$/MMBtu") return function (v) { return "$" + v.toFixed(2) + "/MMBtu"; };
    if (u === "units") return function (v) { return v + " × 50 MW"; };
    if (u === "$/kW-year") return function (v) { return "$" + v + "/kW-yr"; };
    return function (v) { return v + " " + (u || ""); };
  }
  function seg(host, label, values, names, value, onPick) {
    var el = H("div", { class: "lx-seg e2-seg", role: "group", "aria-label": label }, host), bs = {};
    values.forEach(function (v) {
      var b = H("button", { type: "button", text: names[v], "aria-pressed": v === value ? "true" : "false" }, el);
      b.addEventListener("click", function () { set(v); onPick(v); });
      bs[v] = b;
    });
    function set(v) { values.forEach(function (x) { bs[x].setAttribute("aria-pressed", x === v ? "true" : "false"); }); }
    return { el: el, set: set, buttons: bs };
  }
  function fieldset(host, title, hint) {
    var f = H("fieldset", { class: "lx-sb-group" }, host);
    H("legend", { text: title }, f);
    if (hint) H("p", { class: "lx-hint e2-ghint", html: LX.rich(hint) }, f);
    return f;
  }
  function label(tb) {
    var heads = [].slice.call(tb.querySelectorAll("thead th")).map(function (th) { return th.textContent; });
    tb.classList.add("e2-lab");
    [].slice.call(tb.querySelectorAll("tbody tr")).forEach(function (tr) { [].slice.call(tr.children).forEach(function (c, i) { if (i > 0 && heads[i]) c.setAttribute("data-l", heads[i]); }); });
    return tb;
  }
  function table(host, head, rows, cls) {
    var sx = H("div", { class: "lx-scroll-x" }, host), tb = H("table", { class: "lx-facts " + (cls || "") }, sx), hr = H("tr", null, H("thead", null, tb)), bd = H("tbody", null, tb);
    head.forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
    rows.forEach(function (r) { var tr = H("tr", null, bd); r.forEach(function (c, i) { var cell = H(i ? "td" : "th", i ? { class: typeof c === "object" && c && c.cls ? c.cls : "n" } : { scope: "row" }, tr); cell.textContent = typeof c === "object" && c ? c.text : c; }); });
    return label(tb);
  }
  // a Stop button for an LX.BenchRun: pass s.busy as its busy callback, then s.attach(run)
  function stopper() {
    var b = null, run = null;
    return {
      busy: function (on) { if (b) b.hidden = !on; },
      attach: function (r) {
        run = r;
        b = H("button", { class: "lx-btn ghost small e2-stop", type: "button", text: "Stop", hidden: true });
        r.button.parentNode.insertBefore(b, r.again);
        b.addEventListener("click", function () { if (!run.running()) return; run.cancel(); run.button.focus(); });
        return b;
      }
    };
  }
  function copy(p) { return JSON.parse(JSON.stringify(p)); }

  // ---- controls built from a schema, in groups: groups = [{ title, hint, fields: [ids] }]; returns { set(plan), ctl }
  function controls(host, S, plan, groups, onChange) {
    var ctl = {};
    groups.forEach(function (g) {
      var fs = fieldset(host, g.title, g.hint);
      g.fields.forEach(function (id) {
        var f = S.fields.filter(function (x) { return x.id === id; })[0];
        if (f.type === "enum") {
          var row = H("div", { class: "e2-segrow" }, fs);
          if (g.fields.length > 1) H("span", { class: "e2-segl", text: f.label }, row);   // a group of one: its legend names it
          ctl[id] = seg(row, f.label, f.values, f.names, plan[id], function (v) { var p = copy(plan); p[id] = v; onChange(p); });
          ctl[id].kind = "enum";
        } else {
          ctl[id] = LX.Slider(fs, { label: f.label, color: g.color || "var(--lx-ink-2)", min: f.min, max: f.max, step: f.step, value: plan[id], fmt: fmtOf(f),
            onChange: function (v) { var p = copy(plan); p[id] = v; onChange(p); } });
        }
      });
    });
    return { ctl: ctl, set: function (p) { plan = p; for (var k in ctl) ctl[k].set(p[k]); } };
  }

  // ---- the zone map: three zones in a row and the two links between them, for one hour of a run
  function ZoneMap(host, P, o) {
    o = o || {};
    var el = H("div", { class: "e2-map" }, host), R = null, sel = 0;
    var top = H("div", { class: "e2-map-head" }, el);
    H("p", { class: "e2-map-t", html: "<b>The Plains Grid, hour by hour</b>" }, top);
    var hourBox = H("div", { class: "e2-map-hour" }, top);
    var row = H("div", { class: "e2-zrow" }, el), zEls = [], lEls = [];
    P.zones.forEach(function (z, i) {
      var c = H("div", { class: "e2-zone", style: "--c:" + ZCOL[z.id] }, row);
      c.innerHTML = '<p class="e2-zn"><b>' + esc(z.name) + '</b></p><p class="e2-zp" aria-hidden="true"></p><dl class="e2-zd"></dl>';
      zEls.push(c);
      if (i < P.links.length) {
        var l = P.links[i], li = H("div", { class: "e2-link", style: "--c:" + LCOL[l.id] }, row);
        li.innerHTML = '<span class="e2-ln">' + esc(l.name) + '</span><span class="e2-lf"></span><span class="e2-lc"></span>';
        lEls.push(li);
      }
    });
    var note = H("p", { class: "lx-hint e2-map-note" }, el);
    var alt = H("details", { class: "lx-textalt" }, el); H("summary", { text: "Text version: the zones and links this hour" }, alt);
    var altList = H("ul", null, alt);
    var sl = null;
    function paint() {
      if (!R) return;
      var d = R.days[Math.floor(sel / 24)], h = d.hours[sel % 24], items = [];
      P.zones.forEach(function (z, i) {
        var x = h.z[i], U = fleet(P, R.sys).filter(function (u) { return u.zone === z.id; }), th = U.reduce(function (s, u) { return s + h.p[u.id]; }, 0);
        var bat = R.sys.bat && R.sys.bat.zone === z.id ? h.bd - h.bc : 0;
        // the load asked for, what the large load chose to curtail (its bid), what went unserved, and what was served
        var cl = R.sys.ll > 0 && R.sys.llz === z.id ? h.cl : 0, served = x.load - cl - x.shed, part = cl > 0.5 || x.shed > 0.5;
        zEls[i].querySelector(".e2-zp").textContent = priceTxt(x.price) + "/MWh";
        var rows = [[part ? "Load asked" : "Load", kilo(x.load) + " MW"]];
        if (cl > 0.5) rows.push(["Curtailed (its bid)", kilo(cl) + " MW"]);
        if (x.shed > 0.5) rows.push(["Unserved", kilo(x.shed) + " MW"]);
        if (part) rows.push(["Load served", kilo(served) + " MW"]);
        rows.push(["Wind and sun used", kilo(x.used) + " MW"], ["Plants", kilo(th) + " MW"]);
        if (Math.abs(bat) > 0.5) rows.push(["Battery", (bat > 0 ? "out " : "in ") + kilo(Math.abs(bat)) + " MW"]);
        if (x.spill > 0.5) rows.push(["Spilled", kilo(x.spill) + " MW"]);
        zEls[i].querySelector(".e2-zd").innerHTML = rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("");
        zEls[i].classList.toggle("short", x.shed > 0.5);
        items.push(z.name + ": price " + priceTxt(x.price) + "/MWh (conditional on the commitment); load asked " + kilo(x.load) + " MW" +
          (cl > 0.5 ? "; " + kilo(cl) + " MW curtailed by the large load at its bid" : "") + (x.shed > 0.5 ? "; " + kilo(x.shed) + " MW unserved" : "") + (part ? "; load served " + kilo(served) + " MW" : "") +
          "; wind and sun used " + kilo(x.used) + " MW; plants " + kilo(th) + " MW" +
          (Math.abs(bat) > 0.5 ? "; battery " + (bat > 0 ? "out " : "in ") + kilo(Math.abs(bat)) + " MW" : "") + (x.spill > 0.5 ? "; " + kilo(x.spill) + " MW spilled" : "") + ".");
      });
      P.links.forEach(function (l, i) {
        var f = h.f[l.id], cap = R.sys.caps[l.id], at = cap > 0 && Math.abs(f) >= cap - 1e-6, a = P.zones[P.zix[l.from]], b = P.zones[P.zix[l.to]];
        var dir = Math.abs(f) < 0.5 ? "" : (f > 0 ? "→ " : "← ");
        lEls[i].querySelector(".e2-lf").textContent = dir + kilo(Math.abs(f)) + " MW";
        lEls[i].querySelector(".e2-lc").textContent = cap === 0 ? "open: limit 0 MW" : at ? "at its " + kilo(cap) + " MW limit" : "limit " + kilo(cap) + " MW";
        lEls[i].classList.toggle("at", at);
        items.push(l.name + " link: " + (cap === 0 ? "open (limit 0 MW), so nothing flows and each side is priced on its own." :
          (Math.abs(f) < 0.5 ? "no flow" : kilo(Math.abs(f)) + " MW from " + (f > 0 ? a.name + " to " + b.name : b.name + " to " + a.name)) + (at ? ", at its " + kilo(cap) + " MW limit." : " (limit " + kilo(cap) + " MW).")));
      });
      note.textContent = "Prices are conditional on the commitment. Reserve price this hour: " + priceTxt(h.rho) + "/MWh" + (h.rshort > 0.5 ? "; reserve short by " + kilo(h.rshort) + " MW." : ".");
      altList.innerHTML = ""; items.forEach(function (t) { H("li", { text: t }, altList); });
    }
    function set(r, at) {
      R = r; var n = R.days.length * 24;
      if (at != null) sel = at; else if (sel >= n) sel = 0;
      hourBox.innerHTML = "";
      sl = LX.Slider(hourBox, { label: "Hour", min: 0, max: n - 1, step: 1, value: sel, color: "var(--lx-ink-2)", fmt: function (v) { return when(R, v); },
        onChange: function (v) { sel = v; paint(); if (o.onPick) o.onPick(v); } });
      paint();
    }
    return { el: el, set: set, pick: function (i) { sel = i; if (sl) sl.set(i); paint(); }, sel: function () { return sel; } };
  }

  // ---- results: prices, flows, the commitment and the money, each with a text version
  function tickStep(n) { return n > 168 ? 48 : n > 48 ? 24 : 6; }
  function priceChart(host, P, R, o) {
    o = o || {};
    var n = R.days.length * 24, all = [], cap = 0;
    R.days.forEach(function (d) { d.hours.forEach(function (h) { all.push(h); h.z.forEach(function (x) { cap = Math.max(cap, x.price); }); }); });
    var top = Math.max(60, Math.min(300, Math.ceil(cap * 1.15 / 20) * 20)), clipped = cap > top;
    var step = top <= 100 ? 20 : top <= 200 ? 40 : 60, ticks = [];
    for (var k = 0; k <= n; k += tickStep(n)) ticks.push([k, k === n ? "" : (n > 48 ? dayLabel(R.days[k / 24].day) : hh(k % 24)), k === 0 ? "start" : null]);
    var lines = P.zones.map(function (z, i) { return { values: all.map(function (h) { return Math.min(top, h.z[i].price); }), x0: 0, step: 1, color: ZCOL[z.id], width: 2.2, dash: i === 1 ? "5 3" : null, offset: i - 1 }; });
    var marks = [];
    if (clipped) all.forEach(function (h, i) { var m = Math.max.apply(null, h.z.map(function (x) { return x.price; })); if (m > top && (i === 0 || Math.max.apply(null, all[i - 1].z.map(function (x) { return x.price; })) <= top)) marks.push({ x: i + 0.5, y: top, label: priceTxt(m), kind: "dot", pos: "below", color: "var(--lx-bad)" }); });
    var pl = LX.Plot(host, { caption: true, text: "Text version: every hour's prices", box: true });
    pl.render({ x: { min: 0, max: n, ticks: ticks, ticksN: ticks.filter(function (t, i) { return n > 48 ? i % 2 === 0 : i % 2 === 0; }) }, y: { min: 0, max: top, step: step, fmt: function (v) { return "$" + v; }, unit: "$/MWh" },
      caption: "Price in each zone, $/MWh, conditional on the commitment" + (clipped ? " (the axis stops at $" + top + "; higher hours are marked)" : ""),
      lines: lines, marks: marks, legend: P.zones.map(function (z, i) { return { label: z.name, color: ZCOL[z.id], dash: i === 1 ? "5 3" : null }; }),
      aria: "Hourly prices in the three zones, conditional on the commitment; highest " + P.zones.map(function (z, i) { return z.name + " " + priceTxt(R.maxPrice[i]); }).join(", ") + ".",
      tip: function (x) { var i = Math.max(0, Math.min(n - 1, Math.floor(x))), h = all[i]; return "<div><b>" + when(R, i) + "</b></div>" + P.zones.map(function (z, j) { return "<div>" + esc(z.short) + " " + priceTxt(h.z[j].price) + "/MWh</div>"; }).join(""); },
      text: { head: ["Hour", "Wind Ridge, $/MWh", "Prairie Town, $/MWh", "Metro, $/MWh", "Reserve, $/MWh"], rows: all.map(function (h, i) { return [when(R, i)].concat(h.z.map(function (x) { return priceTxt(x.price); })).concat([priceTxt(h.rho)]); }) } });
    return pl;
  }
  function flowChart(host, P, R) {
    var n = R.days.length * 24, all = [], mx = 50, ticks = [];
    R.days.forEach(function (d) { d.hours.forEach(function (h) { all.push(h); }); });
    P.links.forEach(function (l) { mx = Math.max(mx, R.sys.caps[l.id]); all.forEach(function (h) { mx = Math.max(mx, Math.abs(h.f[l.id])); }); });
    var top = Math.ceil(mx * 1.1 / 200) * 200;
    for (var k = 0; k <= n; k += tickStep(n)) ticks.push([k, k === n ? "" : (n > 48 ? dayLabel(R.days[k / 24].day) : hh(k % 24)), k === 0 ? "start" : null]);
    var pl = LX.Plot(host, { caption: true, text: "Text version: every hour's flows", box: true });
    pl.render({ x: { min: 0, max: n, ticks: ticks, ticksN: ticks.filter(function (t, i) { return i % 2 === 0; }) }, y: { min: -top, max: top, step: top / 2, fmt: function (v) { return kilo(v); }, unit: "MW", zero: true }, height: 220, heightN: 190,
      caption: "Flow on each link, MW: above zero toward Metro (Ridge to Town, Town to Metro), below zero toward Wind Ridge",
      lines: P.links.map(function (l) { return { values: all.map(function (h) { return h.f[l.id]; }), x0: 0, step: 1, color: LCOL[l.id], width: 2.2, dash: l.id === "TM" ? "5 3" : null }; }),
      refs: P.links.map(function (l) { return { y: R.sys.caps[l.id], label: l.name + " limit", labelN: "", color: LCOL[l.id], labelColor: "var(--lx-ink-2)", dash: "2 3" }; })
        .concat(P.links.map(function (l) { return { y: -R.sys.caps[l.id], label: "", color: LCOL[l.id], dash: "2 3" }; })),
      legend: P.links.map(function (l) { return { label: l.name, color: LCOL[l.id], dash: l.id === "TM" ? "5 3" : null }; }),
      aria: "Hourly flows on the two links against their limits; hours at a limit: " + P.links.map(function (l) { return l.name + " " + kilo(R.tot.cong[l.id]); }).join(", ") + ".",
      text: { head: ["Hour", "Ridge–Town, MW", "Town–Metro, MW"], rows: all.map(function (h, i) { return [when(R, i), kilo(h.f.WT), kilo(h.f.TM)]; }) } });
    return pl;
  }
  // the commitment of one day: a row per unit group with whole-number decisions, a cell per hour
  function commitTable(host, P, R, dayIdx) {
    var d = R.days[dayIdx], U = fleet(P, R.sys).filter(function (u) { return !u.fast; });
    var sx = H("div", { class: "lx-scroll-x e2-commit" }, host), tb = H("table", { class: "e2-ct" }, sx);
    var cap = H("caption", { text: "Units on in each hour, " + dayLong(d.day, d.y) + " (the mixed-integer program's decisions)" }, tb);
    void cap;
    var hr = H("tr", null, H("thead", null, tb)); H("th", { scope: "col", text: "Unit group" }, hr);
    for (var t = 0; t < 24; t++) H("th", { scope: "col", text: String(t), "aria-label": hh(t) }, hr);
    var bd = H("tbody", null, tb);
    U.forEach(function (u) {
      var tr = H("tr", null, bd); H("th", { scope: "row", text: u.short + " (" + u.n + " × " + u.pmax + " MW)" }, tr);
      d.com.u[u.id].forEach(function (n, t) { H("td", { class: "e2-c" + (n === 0 ? " off" : n === u.n ? " all" : " some"), text: String(n), "aria-label": hh(t) + ": " + n + " of " + u.n + " on" }, tr); });
    });
    return tb;
  }
  function moneyTable(host, P, R) {
    var T = R.tot, U = fleet(P, R.sys);
    var rows = U.map(function (u) { return [u.short, kilo(T.gen[u.id]) + " MWh", u.fast ? "–" : kilo(T.starts[u.id]), u.fast ? "–" : moneyK(T.uplift[u.id])]; });
    return table(host, ["Unit group", "Energy", "Starts", "Uplift"], rows, "e2-money");
  }
  E2.ui = { ZCOL: ZCOL, GCOL: GCOL, LCOL: LCOL, seg: seg, fieldset: fieldset, label: label, table: table, stopper: stopper, copy: copy, controls: controls, fmtOf: fmtOf,
    ZoneMap: ZoneMap, priceChart: priceChart, flowChart: flowChart, commitTable: commitTable, moneyTable: moneyTable, when: when, moneyK: moneyK };
})();
