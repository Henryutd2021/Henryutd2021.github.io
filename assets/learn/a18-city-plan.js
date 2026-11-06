// a18-city-plan.js — Analyst lesson A18, "How is a city or regional energy plan made?" (step cards, closed form),
// wave W5, builder learn-w5-d, 2026-11-06.
//
// Data: assets/learn/data/a18-city-plan.json (the six measures and their sources, the plan's rules and settings),
// prairie-city.json (Prairie City: inventory, flows, districts, days, prices, factors, household groups; never retyped),
// e0.json (lesson SB0's engine: the 4% real rate, the heat pump's and rooftop solar's costs, so they stay the same),
// path.json (lesson links that appear when a lesson goes live).
//
// The model (pure, no DOM; exported for Node). Everything is relative to Prairie City's 2025, with a 2035 horizon.
//   inventory   inventory2025 (t CO2 by sector, location-based, operating only) split into GPC scopes: scope 2 = the
//               sector's electricity at the meter x eGRID's SPP North rate; scope 1 = the rest (fuels burned in the city);
//               scope 3 = distribution losses (the GPC counts them in BASIC+ only)
//   measures    each at its 2035 potential: replaced equipment = 10 / average life of the stock (ages spread evenly)
//   evaluate    one plan (a set of measures) against no plan: the change in electricity (homes, shops), gas, propane and
//               rooftop output; CO2 = gas x 52.91 kg/MMBtu + propane x 5.75 kg/gal + electricity x factor x (1 + 5% lost
//               on the wires); net annual cost = annualized extra capital (capital recovery at the rate, each item over
//               its own life) + extra upkeep + the change in energy bills at 2025 Kansas retail prices; up-front money
//   bars        each measure alone (its bar); the curve sorts them by cost per tonne (tie rule: data order) and
//               "in order" gives each bar what it adds after the bars before it (interactions)
//   peak        each district's load in every hour of the eight representative days: base x (1 - savings share) +
//               space heat x (resistance share + heat-pump share / COP(T)) + EV charging - new rooftop output; against
//               its substation limit (one substation per district: a teaching simplification)
//   groups      who gets the home measures' savings and who pays the programme's share, by household group
// Every number on the page is checked by _tests/learn/test_a18-city-plan.js.
(function () {
  "use strict";
  var IDS = ["hpwh", "furnace", "hp", "weather", "comm", "solar"];
  var HOME = { hpwh: 1, furnace: 1, hp: 1, weather: 1, solar: 1 };

  // ---------------------------------------------------------------- pure model
  function crf(r, n) { return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n)); }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function byId(A) { var o = {}; A.measures.forEach(function (m) { o[m.id] = m; }); return o; }
  // the world: everything the model needs, read from the three data files
  function prepare(A, PC, E0) {
    var u = PC.units, mm = u.mwhPerMMBtu, M = byId(A), cop = PC.cop;
    var W = { A: A, PC: PC, E0: E0, M: M, years: A.horizon.years, r: E0.finance.rate / 100, mm: mm };
    W.defl = function (y) { return A.deflator.index["2025"] / A.deflator.index[String(y)]; };
    W.grid23 = PC.emissions.gridLbPerMWh.sppNorth * 0.45359237 / 1000;     // t per MWh, eGRID2023 SPP North
    W.loss = PC.supply.gridLossShare;
    W.gasT = PC.emissions.kgCO2.gasPerMMBtu / 1000; W.propT = PC.emissions.kgCO2.propanePerGal / 1000;
    W.propMMBtu = u.btuPerGal.propane / 1e6;                                  // MMBtu per gallon
    var p = PC.prices;
    W.price = { elRes: p.electricityCentsPerKWh.residential * 10, elCom: p.electricityCentsPerKWh.commercial * 10,   // $ per MWh
      gasRes: p.gasPerMMBtu.residential, gasCom: p.gasPerMMBtu.commercial, prop: p.propanePerGal };
    W.COP = function (T) { return T >= cop.cutoutC ? cop.anchorCOP * (cop.supplyC - cop.anchorC) / (cop.supplyC - T) : 1; };
    // seasonal COP: the year's heat over the heat pumps' electricity, on the eight days (weights sum to 365)
    var hq = 0, he = 0, sol = 0;
    PC.days.forEach(function (d) { d.temp.forEach(function (T, h) { var x = d.weight * Math.max(0, PC.heatModel.balanceC - T); hq += x; he += x / W.COP(T); sol += d.weight * d.solar[h]; }); });
    W.scop = hq / he;
    W.solarShapeCF = sol / 8760;                                              // capacity factor of the days' solar shape
    W.roofScale = PC.supply.rooftopCF / W.solarShapeCF;                       // rooftop output per MW = shape x this
    var H = PC.city.households, dt = PC.dwellingTypes, rec = PC.homes.recsWNC;
    W.D = PC.districts.map(function (d) {
      var hh = d.households, hw = 0; Object.keys(d.dwellings).forEach(function (k) { hw += d.dwellings[k] * dt[k].hotWaterFactor; });
      return { key: d.key, label: d.label, hh: hh, gasHomes: d.heating.gas, resHomes: d.heating.resistance, hpHomes: d.heating.heatPump, propHomes: d.heating.propane,
        q: d.heat.residentialMWh / hh, resHeat: d.heat.residentialMWh, comHeat: d.heat.commercialMWh,
        hwDel: mm * rec.waterHeatGasMMBtu * PC.homes.gasWaterHeaterEfficiency * hw / hh,   // MWh of hot water per home a year
        pre: d.envelope.pre1980, floor: d.heatedFloorM2, base: d.annualMWh.base, comBase: d.annualMWh.commercialBase,
        ev: d.evMWhPerDay, limit: d.substationMW, peak25: d.peak2025MW, share: hh / H, src: d };
    });
    W.vint = { from: PC.vintages.pre1980.heatKWhPerM2, to: PC.vintages.y1980_2009.heatKWhPerM2 };
    W.elTotal = PC.balance.totals.el * 1000;                                  // MWh at the meter, 2025
    return W;
  }
  function rep(W, life) { return Math.min(1, W.years / life); }
  function opt(W, o) {   // the reader's settings: grid factor in 2035 (t/MWh), gas price multiple, solar cost year, AC due
    o = o || {};
    return { grid: o.grid == null ? W.grid23 : o.grid, gasX: o.gasX == null ? 1 : o.gasX, solar: o.solar || "y2020", ac: !!o.ac };
  }
  // one plan (an object or array of measure ids) against no plan, under settings o
  function evaluate(W, plan, o) {
    o = opt(W, o); var on = {}; (Array.isArray(plan) ? plan : Object.keys(plan).filter(function (k) { return plan[k]; })).forEach(function (k) { on[k] = true; });
    var M = W.M, d22, r = W.r, mm = W.mm, R = { on: on, o: o, elRes: 0, elCom: 0, gas: 0, prop: 0, roof: 0, up: {}, ann: {}, keep: {}, units: {}, dist: [] };
    IDS.forEach(function (k) { R.up[k] = 0; R.ann[k] = 0; R.keep[k] = 0; R.units[k] = 0; });
    var fu = M.furnace, hp = M.hp, wh = M.hpwh, we = M.weather, cm = M.comm;
    var rf = rep(W, fu.life), rw = rep(W, wh.life), useHP = !!on.hp, useF = !!on.furnace && !useHP;
    W.D.forEach(function (d) {
      var x = { key: d.key, s: 0, conv: 0, hpwh: 0, comm: 0 };
      if (on.weather) x.s = we.share * d.pre * d.floor * (W.vint.from - W.vint.to) / 1000 / d.resHeat;   // share of residential heat saved
      var q1 = d.q * (1 - x.s), g = d.gasHomes * rf;                                                  // heat per home after; furnaces replaced
      // space heat: gas (MWh of fuel), electricity, propane, against 2025
      var gas0 = d.gasHomes * d.q / fu.baseAFUE, gas1 = (d.gasHomes - g) * q1 / fu.baseAFUE + g * q1 * (useHP ? 0 : useF ? 1 / fu.newAFUE : 1 / fu.baseAFUE);
      var el0 = d.resHomes * d.q + d.hpHomes * d.q / W.scop, el1 = d.resHomes * q1 + (d.hpHomes + (useHP ? g : 0)) * q1 / W.scop;
      var pr0 = d.propHomes * d.q / fu.baseAFUE, pr1 = d.propHomes * q1 / fu.baseAFUE;
      var fan = useHP ? -g * fu.baseFanKWh / 1000 : useF ? g * (fu.newFanKWh - fu.baseFanKWh) / 1000 : 0;
      x.conv = useHP ? g : 0;
      if (on.hpwh) x.hpwh = (d.resHomes + d.hpHomes) * rw * d.hwDel * (1 / wh.baseUEF - 1 / wh.newUEF);
      if (on.comm) x.comm = cm.share * d.comBase;
      R.gas += (gas1 - gas0) / mm; R.prop += (pr1 - pr0) / mm / W.propMMBtu;
      R.elRes += el1 - el0 + fan - x.hpwh; R.elCom -= x.comm;
      x.g = g; x.weathered = on.weather ? we.share * d.hh * d.pre : 0; x.hpwhHomes = on.hpwh ? (d.resHomes + d.hpHomes) * rw : 0;
      R.dist.push(x);
    });
    var G = sum(R.dist.map(function (x) { return x.g; }));
    if (on.hpwh) { d22 = W.defl(wh.costYear); R.units.hpwh = sum(R.dist.map(function (x) { return x.hpwhHomes; }));
      R.up.hpwh = R.units.hpwh * (wh.newCost - wh.baseCost) * d22; R.ann.hpwh = R.up.hpwh * crf(r, wh.life); }
    if (useF) { d22 = W.defl(fu.costYear); R.units.furnace = G;
      R.up.furnace = G * (fu.newCost - fu.baseCost) * d22; R.ann.furnace = R.up.furnace * crf(r, fu.life); R.keep.furnace = G * (fu.newUpkeep - fu.baseUpkeep) * d22; }
    if (useHP) { d22 = W.defl(hp.costYear); var hc = W.E0.home.hp.high.capex * W.defl(W.E0.home.hp.capexYear); R.units.hp = G;
      R.up.hp = G * (hc - fu.baseCost * d22 - (o.ac ? hp.acCost * d22 : 0));
      R.ann.hp = G * (hc * crf(r, hp.life) - fu.baseCost * d22 * crf(r, fu.life) - (o.ac ? hp.acCost * d22 * crf(r, hp.acLife) : 0));
      R.keep.hp = G * (hp.upkeep - fu.baseUpkeep - (o.ac ? hp.acUpkeep : 0)) * d22; }
    if (on.weather) { R.units.weather = sum(R.dist.map(function (x) { return x.weathered; }));
      R.up.weather = R.units.weather * we.costPerHome * W.defl(we.costYear); R.ann.weather = R.up.weather * crf(r, we.life); }
    if (on.comm) { var cs = sum(R.dist.map(function (x) { return x.comm; })); R.units.comm = cs;
      R.up.comm = cs * cm.cse * 1000 * W.defl(cm.cseYear) / crf(cm.cseRate, cm.life); R.ann.comm = R.up.comm * crf(r, cm.life); }
    if (on.solar) { var pv = W.E0.home.pv, kw = M.solar.addMW * 1000, cap = (o.solar === "y2030" ? M.solar.cost2030 : pv.capex) * W.defl(pv.capexYear);
      R.units.solar = kw / M.solar.systemKW; R.roof = M.solar.addMW * 8760 * W.PC.supply.rooftopCF;
      R.up.solar = kw * cap; R.ann.solar = R.up.solar * crf(r, pv.life); R.keep.solar = kw * pv.fom; }
    var P = W.price;
    R.elGrid = R.elRes + R.elCom - R.roof;                                    // change of electricity from the grid, MWh at the meter
    R.co2 = R.gas * W.gasT + R.prop * W.propT + R.elGrid * o.grid * (1 + W.loss);
    R.t = -R.co2;                                                            // tonnes avoided a year (by 2035)
    R.billHome = R.elRes * P.elRes - R.roof * P.elRes + R.gas * P.gasRes * o.gasX + R.prop * P.prop;    // change in homes' bills
    R.billCom = R.elCom * P.elCom;
    R.capital = sum(IDS.map(function (k) { return R.ann[k] + R.keep[k]; }));
    R.net = R.capital + R.billHome + R.billCom;                              // net annual cost ($ a year, annual equivalent)
    R.upfront = sum(IDS.map(function (k) { return R.up[k]; }));              // one-time, 2025 dollars
    R.per = R.t > 0 ? R.net / R.t : null;
    R.homeCost = sum(IDS.filter(function (k) { return HOME[k]; }).map(function (k) { return R.ann[k] + R.keep[k]; }));
    R.homeUnits = sum(IDS.filter(function (k) { return HOME[k]; }).map(function (k) { return R.units[k]; }));
    return R;
  }
  function round2(v) { return Math.round(v * 100) / 100; }
  // each measure alone; sorted cheapest first (tie rule: equal cost per tonne to the cent keeps the data order)
  function bars(W, o) {
    var list = W.A.measures.map(function (m, i) { var R = evaluate(W, [m.id], o); return { id: m.id, n: m.n, i: i, m: m, t: R.t, net: R.net, per: R.per, up: R.upfront, R: R }; });
    return sortBars(list);
  }
  function sortBars(list) { return list.slice().sort(function (a, b) { return round2(a.per) - round2(b.per) || a.i - b.i; }); }
  // the curve: bars side by side from x = 0 (tonnes a year), each as wide as its tonnes
  function curve(list) { var x = 0; return list.map(function (b) { var c = { id: b.id, x0: x, x1: x + Math.max(0, b.t), per: b.per, t: b.t, b: b }; x = c.x1; return c; }); }
  // the bars in order: each gives what it adds to the bars before it (same cost order as alone)
  function inOrder(W, ids, o) {
    var prev = evaluate(W, [], o), have = [];
    return ids.map(function (id) { have.push(id); var R = evaluate(W, have.slice(), o), t = R.t - prev.t, net = R.net - prev.net, x = { id: id, t: t, net: net, per: t > 0 ? net / t : null }; prev = R; return x; });
  }
  // the inventory, split into GPC scopes by sector (t CO2, 2025): scope 1 from each sector's fuels in their own units
  // (gas MMBtu, gallons) x EIA's coefficients, rounded; scope 2 = the sector's inventory - scope 1 (its electricity x
  // eGRID's rate; the test checks it within 1 t); scope 3 = distribution losses
  function fuelsOf(PC) {
    var c = PC.emissions.kgCO2, t = PC.city.totals, tr = PC.transport, g = function (mmbtu) { return mmbtu * c.gasPerMMBtu / 1000; };
    return { homes: g(t.gasMMBtu.residential) + t.propaneGal * c.propanePerGal / 1000, commercial: g(t.gasMMBtu.commercial),
      food: g(PC.industry.food.gasMMBtu), fertilizer: g(PC.industry.fertilizer.gasMMBtu), datacenter: 0,
      transport: tr.gasolineGal * c.gasolinePerGal / 1000 + (tr.buses.dieselGal + tr.trucksDieselGal) * c.dieselPerGal / 1000,
      farms: PC.farms.dieselGal * c.dieselPerGal / 1000 + PC.farms.propaneGal * c.propanePerGal / 1000 };
  }
  function elOf(PC) {
    var T = PC.city.totals.annualMWh;
    return { homes: T.residentialBase + T.residentialHeat, commercial: T.commercialBase + T.commercialHeat, food: PC.industry.food.electricityMWh,
      fertilizer: PC.industry.fertilizer.electricityMWh, datacenter: PC.dataCenter.annualMWh, transport: PC.transport.evMWh, farms: PC.farms.electricityMWh };
  }
  function inventory(W) {
    var PC = W.PC, inv = PC.inventory2025.sectors, F = fuelsOf(PC), el = elOf(PC);
    var rows = Object.keys(inv).map(function (k) {
      if (k === "grid_losses") return { key: k, s1: 0, s2: 0, s3: inv[k], total: inv[k] };
      var s1 = Math.round(F[k]); return { key: k, s1: s1, s2: inv[k] - s1, s3: 0, total: inv[k], el: el[k], fuel: F[k] };
    });
    var tot = { s1: sum(rows.map(function (x) { return x.s1; })), s2: sum(rows.map(function (x) { return x.s2; })), s3: sum(rows.map(function (x) { return x.s3; })), total: PC.inventory2025.total };
    return { rows: rows, tot: tot, basic: tot.s1 + tot.s2 };
  }
  // the district loads in every hour of the eight days, with a plan (the evaluate result R)
  function peaks(W, R) {
    var PC = W.PC, ev = PC.transport.evProfile, out = [];
    W.D.forEach(function (d, i) {
      var x = R ? R.dist[i] : { s: 0, conv: 0, hpwh: 0, comm: 0 }, b = (x.hpwh + x.comm) / d.base;
      var tot = d.resHeat + d.comHeat, rr = d.resHeat / tot, cc = d.comHeat / tot, ch = W.PC.commercial.heating;
      var sRes = d.resHomes / d.hh, sHP = (d.hpHomes + x.conv) / d.hh, add = R && R.on.solar ? W.M.solar.addMW * d.share : 0;
      var best = { mw: -1 };
      PC.days.forEach(function (day, di) {
        var dd = day.districts[d.key];
        day.temp.forEach(function (T, h) {
          var cop = W.COP(T), heatEl = dd.heat[h] * (cc * (ch.resistance + ch.heatPump / cop) + rr * (1 - x.s) * (sRes + sHP / cop));
          var mw = dd.base[h] * (1 - b) + heatEl + d.ev * ev[h] - add * day.solar[h] * W.roofScale;
          if (mw > best.mw + 1e-9) best = { mw: mw, day: day.key, dayLabel: day.label, h: h, T: T };
        });
      });
      out.push({ key: d.key, label: d.label, limit: d.limit, peak25: d.peak25, mw: best.mw, day: best.day, dayLabel: best.dayLabel, h: best.h, T: best.T, over: best.mw - d.limit });
    });
    return out;
  }
  // who gets the home measures' savings and who pays the programme's share, by household group (annual, $)
  function groups(W, R, key) {
    var PC = W.PC, G = PC.groups, w = W.A.participation[key].w, p = W.A.programme.share;
    var save = -R.billHome, cost = R.homeCost, prog = p * cost, partNet = save - (1 - p) * cost;
    var wsum = sum(G.map(function (g, i) { return w[i] * g.households; })), spend = sum(G.map(function (g) { return g.homeEnergy * g.households; }));
    return G.map(function (g, i) {
      var sh = w[i] * g.households / wsum, charge = prog * g.homeEnergy / spend;   // per household, a year
      return { key: g.key, label: g.label, hh: g.households, share: sh, per100: 100 * sh * R.homeUnits / g.households,
        charge: charge, avg: (sh * partNet) / g.households - charge, income: g.income };
    });
  }
  function hm(h) { return (h < 10 ? "0" : "") + h + ":00"; }
  var fm = {
    t: function (v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US") + " t"; },
    kt: function (v) { return (Math.round(v / 100) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " kt"; },
    per: function (v) { if (v == null) return "n/a"; var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US") + " per t"; },
    usd: function (v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); },
    musd: function (v) { var r = Math.round(v / 1e5) / 10; return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M"; },
    mw: function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " MW"; },
    pct: function (v, dp) { return (v * 100).toFixed(dp == null ? 1 : dp) + "%"; },
    f3: function (v) { return v.toFixed(3); }
  };
  var model = { IDS: IDS, HOME: HOME, crf: crf, prepare: prepare, rep: rep, opt: opt, evaluate: evaluate, bars: bars, sortBars: sortBars, curve: curve,
    inOrder: inOrder, inventory: inventory, fuelsOf: fuelsOf, elOf: elOf, peaks: peaks, groups: groups, hm: hm, fm: fm, round2: round2 };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;
})();
