/* plainsplan.js — LX.plainsPlan: the Plains Grid's planning linear program (a year on four representative days: new wind,
   solar and a 4-hour battery against the existing gas fleet), with the carbon and policy options that edit it.
   Shared by Modeler lesson M6 (whose page script is assets/learn/m06-carbon-in-models.js) and Analyst lesson A12
   (policy instruments), which runs the same LP. Pure: no DOM; the page passes in its data
   and solves the models with LX.solver. Node: require("assets/learn/components/plainsplan.js"); tests:
   _tests/learn/test_m06-carbon-in-models.js, test_a12-policy-instruments.js (each number proved the same on every best
   plan by _tests/learn/plains_face.js), test_components_w4_int.js (the shared component in the bundle).

   Data: assets/learn/data/a10-emissions-questions.json (the Plains Grid's existing fleet: a 4,000 MW peak, 3,000 MW of
   wind, 600 MW of solar, 2,000 MW of gas combined-cycle plants and 2,300 MW of gas peakers, with EIA's 2025 heat rates,
   gas price and CO2 coefficient), assets/learn/data/m06-carbon-in-models.json (what may be built and at what cost, in
   2025 dollars; the four representative days and their weights; the tie rule; the reference block written by the test),
   town_year.json (SPP 2025 hourly shapes, EIA-930) and cf_targets.json (EIA's 2025 capacity factors).

   The model: one linear program for a year, estimated on four representative days (one real day per season, the
   season's medoid; each hour weighted by the days its season has, 365 in all). Decisions:
     Wn, Sn, Bn          new wind (MW), new solar (MW) and a new 4-hour battery (MW; 4 MWh per MW)
     per hour j:  we, se  existing wind and solar used (at most what the weather gives; the rest is curtailed)
                  wn, sn  new wind and solar used (at most the hour's capacity factor x Wn or Sn)
                  cc, ct  gas combined-cycle and peaker output (at most 2,000 and 2,300 MW)
                  ch, dc, soc  battery charge, discharge (MW) and its energy (MWh), cyclic within each day
                  un      unserved demand (MW), at the value of lost load ($10,000 per MWh)
   Rules each hour:  we + se + wn + sn + cc + ct + dc - ch + un = demand (+ a load)     ("b<j>": the balance)
                     soc_j = soc_{j-1} + 0.85 ch_j - dc_j (the last hour of a day links to its first); ch, dc <= Bn;
                     soc <= 4 Bn; wn <= cfw_j Wn; sn <= cfs_j Sn
   Goal: the year's cost = sum over hours of weight x (fuel and variable O&M of gas + $10,000 x unserved)
                          + annual capital (capital recovery at 4% real over 30 years, a battery's 15) and fixed O&M.
   Policy (A12) and carbon (M6) options, each an edit of the same LP:
     tau  a carbon price, $ per t, added to each gas MWh: cost + tau x CO2 rate     (the emitters pay tau x CO2)
     ptc  a production credit, $ per MWh, subtracted from each MWh of new wind and solar used (taxpayers pay)
     itc  an investment credit, a share of the capital cost of new wind, solar and batteries (taxpayers pay)
     ces  a clean-energy standard: the year's wind and sun used >= ces x the year's demand    ("ces"; its dual is the
          marginal compliance cost, $ per MWh of clean energy; the pages read it as the certificate price only under a
          stated assumption: certificates trade at that cost in a competitive market and customers fund them)
     cap  a CO2 cap, t a year: the year's gas CO2 <= cap                                       ("cap"; its dual is the
          shadow price of the cap, $ per t)
     load a flat load added to demand; buy: "annual" | "hourly" adds the buyer's own new wind, solar and battery (Wb, Sb,
          Bb) with a matching rule: annual, the year's buyer wind and sun >= the year's load; hourly, every hour the buyer's
          wind, sun and battery output >= the load, the buyer's battery charging only from the buyer's wind and sun.
   Reported numbers leave out transfers: resource cost = new capital and fixed O&M (the full
   cost, before any credit) + gas fuel and variable O&M + unserved energy at $10,000. Transfers are listed apart, a year:
   carbon payments, credit payments, certificate payments (illustrative, as above). The investment credit's payment is
   an annual equivalent (its share of the annual capital recovery); itcUpfront is the cash credit at the build, its share
   of the overnight capital cost. Existing plants' fixed costs are sunk and left out.
   Ties (stated in advance, data "tie"): the pages solve the LP as written, with no tie-breaking costs, and report only
   numbers that are the same for every best plan: the tests minimize and maximize each over the LP's optimal face
   (_tests/learn/plains_face.js). Which plant is curtailed in a spilled hour, and how a battery cycles surplus it cannot
   use, can differ between best plans, so the pages show no such split. build(Y, {tie: true}) adds the hair costs in
   "tie" (kept for the notebook's practice task on ties); no page uses it.
*/
(function () {
  "use strict";
  var HOURS = 24;

  // ---------------------------------------------------------------- pure model
  function crf(r, n) { return r / (1 - Math.pow(1 + r, -n)); }
  function startIndex(year, date, off) { return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(year.start_utc + "Z")) / 3600000) + 1 - off; }
  // local offset (Central time) of a 2025 date: daylight time from 9 March to 1 November
  function offsetOf(date) { return date >= "2025-03-09" && date < "2025-11-02" ? -5 : -6; }
  function gas(P) {
    var o = {};
    ["cc", "ct"].forEach(function (k) { var p = P.plants[k]; o[k] = { mw: p.mw, rate: p.heatRate * P.gas.co2PerMMBtu / 1000, cost: p.heatRate * P.gas.price + p.vom }; });
    return o;
  }
  // the year's 8,760 hours as per-MW shapes (the same scaling for existing and new plants)
  function profiles(P, year, targets, profile) {
    var po = { year: year, targets: targets, method: P.profile.method, monthlyCF: P.profile.monthlyCF };
    var pw = profile("wind", P.windMW, po), ps = profile("solar", P.solarMW, po);
    return { w: pw.mw.map(function (x) { return x / P.windMW; }), s: ps.mw.map(function (x) { return x / P.solarMW; }) };
  }
  // one day: demand and existing output in whole MW, new plants' capacity factors per MW
  function dayOf(P, year, PF, date) {
    var i0 = startIndex(year, date, offsetOf(date)), d = { date: date, i0: i0, demand: [], we: [], se: [], cfw: [], cfs: [] };
    for (var t = 0; t < HOURS; t++) {
      d.demand.push(Math.round(year.demand[i0 + t] / 1000 * P.demandPeakMW));
      d.we.push(Math.round(PF.w[i0 + t] * P.windMW)); d.se.push(Math.round(PF.s[i0 + t] * P.solarMW));
      d.cfw.push(PF.w[i0 + t]); d.cfs.push(PF.s[i0 + t]);
    }
    return d;
  }
  // every whole local day of 2025, by season, without the two clock-change days
  function calendar(S) {
    var out = [], m0 = Date.UTC(2025, 0, 1);
    for (var k = 0; k < 365; k++) {
      var date = new Date(m0 + k * 864e5).toISOString().slice(0, 10), mo = +date.slice(5, 7);
      var se = S.filter(function (s) { return s.months.indexOf(mo) >= 0; })[0];
      out.push({ date: date, season: se.id, skip: date === "2025-03-09" || date === "2025-11-02" });
    }
    return out;
  }
  // the season's medoid: the day whose hourly demand (share of the peak), wind and solar (per MW) are closest, in summed
  // squares, to all the season's other days
  // plus two extreme days kept with a weight of one day each (the course's representative days), taken out of their seasons' weights: the
  // calmest day (the lowest daily mean wind) and the day of the highest net load (demand less existing wind and solar,
  // its highest hour)
  function medoids(P, M, year, PF) {
    var cal = calendar(M.seasons), all = cal.filter(function (c) { return !c.skip; }).map(function (c) { return { c: c, d: dayOf(P, year, PF, c.date) }; });
    var calm = all.slice().sort(function (a, b) { return sum(a.d.cfw) - sum(b.d.cfw) || (a.c.date < b.c.date ? -1 : 1); })[0];
    var net = function (x) { return Math.max.apply(null, x.d.demand.map(function (v, t) { return v - x.d.we[t] - x.d.se[t]; })); };
    var peak = all.slice().sort(function (a, b) { return net(b) - net(a) || (a.c.date < b.c.date ? -1 : 1); })[0];
    var out = M.seasons.map(function (s) {
      var ds = cal.filter(function (c) { return c.season === s.id; }), cand = all.filter(function (x) { return x.c.season === s.id && x !== calm && x !== peak; });
      var vec = cand.map(function (x) { return x.d.demand.map(function (v) { return v / P.demandPeakMW; }).concat(x.d.cfw, x.d.cfs); });
      var best = -1, bestV = Infinity;
      vec.forEach(function (a, i) { var v = 0; vec.forEach(function (b) { for (var q = 0; q < a.length; q++) v += (a[q] - b[q]) * (a[q] - b[q]); }); if (v < bestV - 1e-12) { bestV = v; best = i; } });
      var wgt = ds.length - (calm.c.season === s.id ? 1 : 0) - (peak.c.season === s.id ? 1 : 0);
      return { season: s.id, kind: "typical", date: cand[best].c.date, weight: wgt };
    });
    out.push({ season: calm.c.season, kind: "calm", date: calm.c.date, weight: 1 }, { season: peak.c.season, kind: "peak", date: peak.c.date, weight: 1 });
    return out;
  }
  function prepare(P, M, year, targets, profile) {
    var PF = profiles(P, year, targets, profile), G = gas(P);
    var days = M.days.map(function (x) { var d = dayOf(P, year, PF, x.date); d.weight = x.weight; d.season = x.season; d.kind = x.kind; d.label = x.label; d.dateLabel = x.dateLabel; return d; });
    var B = M.build, f = M.finance, defl = M.deflator["2025"] / M.deflator["2024"], b = B.battery;
    var batKW = (b.powerCapex2024 + b.hours * b.energyCapex2024) * defl;   // $ per kW of a 4-hour battery, 2025 dollars
    var cost = {
      wind: { cap: B.wind.capex * 1000 * crf(f.rate, f.life), fom: B.wind.fom * 1000 },
      solar: { cap: B.solar.capex * 1000 * crf(f.rate, f.life), fom: B.solar.fom * 1000 },
      battery: { cap: batKW * 1000 * crf(f.rate, f.batteryLife), fom: b.fomShare * batKW * 1000, kW: batKW }
    };
    var D = 0; days.forEach(function (d) { D += d.weight * sum(d.demand); });
    return { P: P, M: M, G: G, days: days, cost: cost, eta: b.rte, hours: b.hours, demandMWh: D, PF: PF };
  }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  // o: { tau, ptc, itc, ces, cap, load, buy: "annual" | "hourly", tie (default true), fix: {Wn, Sn, Bn}, delta: {row: amount} }
  function build(Y, o) {
    o = o || {}; var G = Y.G, M = Y.M, tie = o.tie === true ? M.tie : null, tau = o.tau || 0, ptc = o.ptc || 0, itc = o.itc || 0, L = o.load || 0, buy = L ? o.buy || null : null;
    var vars = [], cons = [], dl = o.delta || {}, n = Y.days.length;
    function rhs(name, v) { return v + (dl[name] || 0); }
    function capVar(name, c, max) { var v = { name: name, cost: c, ub: max }; if (o.fix && o.fix[name] != null) { v.lb = o.fix[name]; v.ub = o.fix[name]; } vars.push(v); }
    var B = M.build, C = Y.cost;
    capVar("Wn", C.wind.cap * (1 - itc) + C.wind.fom, B.wind.max);
    capVar("Sn", C.solar.cap * (1 - itc) + C.solar.fom, B.solar.max);
    capVar("Bn", C.battery.cap * (1 - itc) + C.battery.fom, B.battery.max);
    if (buy) {
      capVar("Wb", C.wind.cap * (1 - itc) + C.wind.fom, B.wind.max); capVar("Sb", C.solar.cap * (1 - itc) + C.solar.fom, B.solar.max);
      capVar("Bb", buy === "hourly" ? C.battery.cap * (1 - itc) + C.battery.fom : 0, buy === "hourly" ? B.battery.max : 0);
    }
    var ces = {}, cap = {}, ann = {};
    for (var k = 0; k < n; k++) {
      var d = Y.days[k], w = d.weight;
      for (var t = 0; t < HOURS; t++) {
        var j = k * HOURS + t, pj = k * HOURS + (t + HOURS - 1) % HOURS;
        vars.push({ name: "we" + j, ub: d.we[t], cost: w * (tie ? tie.curtail.we : 0) }, { name: "se" + j, ub: d.se[t], cost: w * (tie ? tie.curtail.se : 0) },
          { name: "wn" + j, cost: w * ((tie ? tie.curtail.wn : 0) - ptc) }, { name: "sn" + j, cost: w * ((tie ? tie.curtail.sn : 0) - ptc) },
          { name: "cc" + j, ub: G.cc.mw, cost: w * (G.cc.cost + tau * G.cc.rate) }, { name: "ct" + j, ub: G.ct.mw, cost: w * (G.ct.cost + tau * G.ct.rate) },
          { name: "ch" + j }, { name: "dc" + j, cost: w * (tie ? tie.wear : 0) }, { name: "soc" + j }, { name: "un" + j, cost: w * M.voll });
        var bal = {}; bal["we" + j] = 1; bal["se" + j] = 1; bal["wn" + j] = 1; bal["sn" + j] = 1; bal["cc" + j] = 1; bal["ct" + j] = 1; bal["dc" + j] = 1; bal["ch" + j] = -1; bal["un" + j] = 1;
        if (buy) {
          vars.push({ name: "wb" + j, cost: w * ((tie ? tie.curtail.wn : 0) - ptc) }, { name: "sb" + j, cost: w * ((tie ? tie.curtail.sn : 0) - ptc) });
          bal["wb" + j] = 1; bal["sb" + j] = 1;
          cons.push(lin("wbc" + j, [["wb" + j, 1], ["Wb", -d.cfw[t]]], "le", 0), lin("sbc" + j, [["sb" + j, 1], ["Sb", -d.cfs[t]]], "le", 0));
          if (buy === "hourly") {
            vars.push({ name: "chb" + j }, { name: "dcb" + j, cost: w * (tie ? tie.wear : 0) }, { name: "socb" + j });
            bal["dcb" + j] = 1; bal["chb" + j] = -1;
            cons.push(lin("mat" + j, [["wb" + j, 1], ["sb" + j, 1], ["dcb" + j, 1], ["chb" + j, -1]], "ge", L),
              lin("chbs" + j, [["chb" + j, 1], ["wb" + j, -1], ["sb" + j, -1]], "le", 0),
              lin("chbc" + j, [["chb" + j, 1], ["Bb", -1]], "le", 0), lin("dcbc" + j, [["dcb" + j, 1], ["Bb", -1]], "le", 0),
              lin("socbc" + j, [["socb" + j, 1], ["Bb", -Y.hours]], "le", 0),
              lin("sbb" + j, [["socb" + j, 1], ["socb" + pj, -1], ["chb" + j, -Y.eta], ["dcb" + j, 1]], "eq", 0));
          } else { ann["wb" + j] = (ann["wb" + j] || 0) + w; ann["sb" + j] = (ann["sb" + j] || 0) + w; }
        }
        cons.push({ name: "b" + j, terms: bal, eq: rhs("b" + j, d.demand[t] + L) });
        cons.push(lin("wnc" + j, [["wn" + j, 1], ["Wn", -d.cfw[t]]], "le", 0), lin("snc" + j, [["sn" + j, 1], ["Sn", -d.cfs[t]]], "le", 0),
          lin("chc" + j, [["ch" + j, 1], ["Bn", -1]], "le", 0), lin("dcc" + j, [["dc" + j, 1], ["Bn", -1]], "le", 0),
          lin("socc" + j, [["soc" + j, 1], ["Bn", -Y.hours]], "le", 0),
          lin("sb" + j, [["soc" + j, 1], ["soc" + pj, -1], ["ch" + j, -Y.eta], ["dc" + j, 1]], "eq", 0));
        if (o.ces != null) { ces["we" + j] = w; ces["se" + j] = w; ces["wn" + j] = w; ces["sn" + j] = w; }
        if (o.cap != null) { cap["cc" + j] = w * G.cc.rate; cap["ct" + j] = w * G.ct.rate; }
      }
    }
    if (o.ces != null) cons.push({ name: "ces", terms: ces, ge: rhs("ces", o.ces * Y.demandMWh) });
    if (o.cap != null) cons.push({ name: "cap", terms: cap, le: rhs("cap", o.cap) });
    if (buy === "annual") cons.push({ name: "match", terms: ann, ge: rhs("match", L * HOURS * sumW(Y)) });
    return { sense: "min", variables: vars, constraints: cons };
  }
  // the LP's optimal face: the same rules, the cost held within tol of the optimum `opt`, and a new goal: the year's gas
  // CO2, minimized (sense 1) or maximized (sense -1). Used to show a tie honestly: the range of CO2 among the best plans.
  function faceModel(Y, o, opt, sense, tol) {
    var m = build(Y, o), cost = {}, G = Y.G;
    m.variables.forEach(function (v) { if (v.cost) cost[v.name] = v.cost; v.cost = 0; });
    m.variables.forEach(function (v) { var mt = /^(cc|ct)(\d+)$/.exec(v.name); if (mt) { var k = Math.floor(+mt[2] / HOURS); v.cost = sense * Y.days[k].weight * (mt[1] === "cc" ? G.cc.rate : G.ct.rate); } });
    m.constraints.push({ name: "face", terms: cost, le: opt + (tol == null ? 0.01 + 1e-9 * Math.abs(opt) : tol) });
    return m;
  }
  function sumW(Y) { return Y.days.reduce(function (s, d) { return s + d.weight; }, 0); }
  function lin(name, pairs, op, v) { var t = {}; pairs.forEach(function (p) { t[p[0]] = (t[p[0]] || 0) + p[1]; }); var c = { name: name, terms: t }; c[op] = v; return c; }
  // the reported numbers (no hair costs, transfers apart); r: a solved LP
  function read(Y, o, r) {
    o = o || {};
    if (!r || !r.values) return { ok: false, status: r ? r.status : "error" };
    var v = function (k) { var x = r.values[k]; return x == null || Math.abs(x) < 1e-9 ? 0 : x; }, G = Y.G, C = Y.cost, itc = o.itc || 0;
    var R = { ok: !!r.ok, status: r.status, Wn: v("Wn"), Sn: v("Sn"), Bn: v("Bn"), Wb: v("Wb"), Sb: v("Sb"), Bb: v("Bb"),
      co2: 0, gasMWh: 0, ccMWh: 0, ctMWh: 0, fuel: 0, unMWh: 0, clean: 0, newClean: 0, curtailed: 0, demand: Y.demandMWh, load: 0, hourly: [] };
    Y.days.forEach(function (d, k) {
      var w = d.weight;
      for (var t = 0; t < HOURS; t++) {
        var j = k * HOURS + t, cc = v("cc" + j), ct = v("ct" + j), un = v("un" + j);
        var nc = v("wn" + j) + v("sn" + j) + v("wb" + j) + v("sb" + j), cl = v("we" + j) + v("se" + j) + nc;
        var avail = d.we[t] + d.se[t] + d.cfw[t] * (R.Wn + R.Wb) + d.cfs[t] * (R.Sn + R.Sb);
        R.co2 += w * (cc * G.cc.rate + ct * G.ct.rate); R.ccMWh += w * cc; R.ctMWh += w * ct; R.fuel += w * (cc * G.cc.cost + ct * G.ct.cost);
        R.unMWh += w * un; R.clean += w * cl; R.newClean += w * nc; R.curtailed += w * Math.max(0, avail - cl);
        R.hourly.push({ cc: cc, ct: ct, un: un, clean: cl, dc: v("dc" + j) + v("dcb" + j), ch: v("ch" + j) + v("chb" + j) });
      }
    });
    R.gasMWh = R.ccMWh + R.ctMWh; R.load = (o.load || 0) * HOURS * sumW(Y);
    var capFull = (R.Wn + R.Wb) * (C.wind.cap + C.wind.fom) + (R.Sn + R.Sb) * (C.solar.cap + C.solar.fom) + (R.Bn + R.Bb) * (C.battery.cap + C.battery.fom);
    R.capital = capFull; R.unserved = R.unMWh * Y.M.voll;
    R.resource = capFull + R.fuel + R.unserved;
    R.carbonPay = (o.tau || 0) * R.co2;                                  // emitters to the government
    R.ptcPay = (o.ptc || 0) * R.newClean;                                // the government to new wind and solar
    R.itcPay = itc * ((R.Wn + R.Wb) * C.wind.cap + (R.Sn + R.Sb) * C.solar.cap + (R.Bn + R.Bb) * C.battery.cap);   // annual equivalent
    var B = Y.M.build;
    R.itcUpfront = itc * ((R.Wn + R.Wb) * B.wind.capex * 1000 + (R.Sn + R.Sb) * B.solar.capex * 1000 + (R.Bn + R.Bb) * C.battery.kW * 1000);   // at the build
    R.shareClean = R.clean / (R.demand + R.load);
    R.duals = r.duals || null;
    R.cesPrice = r.duals && o.ces != null ? r.duals.ces : null;          // $ per MWh of clean energy (>= 0)
    R.capPrice = r.duals && o.cap != null ? -r.duals.cap : null;         // $ per t (>= 0 when the cap binds)
    R.certPay = R.cesPrice != null ? R.cesPrice * o.ces * Y.demandMWh : 0;
    return R;
  }
  var fm = {
    mt: function (t) { return (t / 1e6).toFixed(2) + " Mt"; },
    kt: function (t) { return Math.round(t / 1000).toLocaleString("en-US") + " kt"; },
    musd: function (v) { return (v < 0 ? "−$" : "$") + (Math.abs(v) / 1e6).toFixed(1) + "M"; },
    gw: function (mw) { return (Math.round(mw) || 0).toLocaleString("en-US") + " MW"; },   // || 0: never "-0 MW"
    twh: function (mwh) { return (mwh / 1e6).toFixed(2) + " TWh"; },
    pct: function (x) { return Math.round(x * 100) + "%"; },
    pt: function (v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  };
  var model = { HOURS: HOURS, crf: crf, startIndex: startIndex, offsetOf: offsetOf, gas: gas, profiles: profiles, dayOf: dayOf, calendar: calendar,
    medoids: medoids, prepare: prepare, build: build, faceModel: faceModel, read: read, sum: sum, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window !== "undefined" && window.LX) window.LX.plainsPlan = model;
})();
