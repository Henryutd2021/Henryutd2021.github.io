// a18-city-plan.js — Analyst lesson A18, "How is a city or regional energy plan made?" (step cards, closed form).
//
// Data: assets/learn/data/a18-city-plan.json (the six measures and their sources, the plan's rules and settings),
// prairie-city.json (Prairie City: inventory, flows, districts, days, prices, factors, household groups; never retyped),
// e0.json (lesson SB0's engine: the 4% real rate, the heat pump's and rooftop solar's costs, so they stay the same),
// path.json (lesson links that appear when a lesson goes live).
//
// The model (pure, no DOM; exported for Node). Everything is relative to Prairie City's 2025, with a 2035 horizon.
//   inventory   inventory2025 (t CO2 by sector, location-based, operating only) split into GPC scopes: scope 2 = the
//               sector's grid-supplied electricity x eGRID's SPP North rate (rooftop solar used on site comes off the
//               homes' and businesses' electricity in proportion to their use, as prairie-city.json does); scope 1 = the
//               rest (fuels burned in the city); scope 3 = distribution losses. CO2-only teaching subtotals, not the
//               GPC's BASIC or BASIC+ totals (no waste, no other gases, the fertilizer plant's feedstock not split out)
//   measures    each at its 2035 potential: replaced equipment = 10 / average life of the stock (ages spread evenly)
//   evaluate    one plan (a set of measures) against no plan: the change in electricity (homes, shops), gas, propane and
//               rooftop output; CO2 = gas x 52.91 kg/MMBtu + propane x 5.75 kg/gal + electricity x factor x (1 + 5% lost
//               on the wires); net annual cost = annualized extra capital (capital recovery at the rate, each item over
//               its own life) + extra upkeep + the change in energy bills at 2025 Kansas retail prices; up-front money.
//               2035 without a plan = 2025's energy use at the 2035 grid's rate, so the cut from 2025 = the grid's own
//               change (the inventory's scope 2 and losses rows at the new rate) + the measures' cut; targets use it
//   bars        each measure alone (its bar); the curve sorts them by cost per tonne (tie rule: data order) and
//               "in order" gives each bar what it adds after the bars before it (interactions)
//   peak        each district's load in every hour of the eight representative days: base x (1 - savings share) +
//               space heat x (resistance share + heat-pump share / COP(T)) + EV charging - new rooftop output; against
//               its substation limit (one substation per district: a teaching simplification)
//   groups      who gets the home measures' savings and who pays the programme's rebates, by household group: the
//               programme pays 40% of each home measure's extra up-front cost where that is positive (a measure that
//               costs less than the usual replacement gets none), recovered on all homes' bills over the item's life
// Every number on the page is checked by _tests/learn/test_a18-city-plan.js.
(function () {
  "use strict";
  var IDS = ["hpwh", "comm", "furnace", "weather", "solar", "hp"];     // the data file's order: the default curve, cheapest first
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
    // Heat per home is the same for every heating fuel within a district: prairie-city.json's builder derives the homes'
    // gas, propane and electricity that way (district heat.share mixes homes with businesses, so it is not used here)
    W.vint = { from: PC.vintages.pre1980.heatKWhPerM2, to: PC.vintages.y1980_2009.heatKWhPerM2 };
    W.I = inventory(W);
    W.gridT = W.I.tot.s2 + W.I.tot.s3;                                        // t CO2 of 2025 that follow the grid's rate
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
    R.t = -R.co2;                                                            // tonnes the measures avoid a year (by 2035)
    R.gridCut = W.gridT * (1 - o.grid / W.grid23);                           // the grid's own change from 2025, no measure
    R.total = R.gridCut + R.t;                                               // the cut from 2025's inventory by 2035
    R.billHome = R.elRes * P.elRes - R.roof * P.elRes + R.gas * P.gasRes * o.gasX + R.prop * P.prop;    // change in homes' bills
    R.billCom = R.elCom * P.elCom;
    R.capital = sum(IDS.map(function (k) { return R.ann[k] + R.keep[k]; }));
    R.net = R.capital + R.billHome + R.billCom;                              // net annual cost ($ a year, annual equivalent)
    R.upfront = sum(IDS.map(function (k) { return R.up[k]; }));              // one-time, 2025 dollars
    R.per = R.t > 0 ? R.net / R.t : null;
    R.homeCost = sum(IDS.filter(function (k) { return HOME[k]; }).map(function (k) { return R.ann[k] + R.keep[k]; }));
    R.homeUnits = sum(IDS.filter(function (k) { return HOME[k]; }).map(function (k) { return R.units[k]; }));
    // the programme's rebates: 40% of each home measure's extra up-front cost where it is positive, as an annual
    // equivalent over the item's life (what all homes' bills recover)
    var life = { hpwh: wh.life, furnace: fu.life, weather: we.life, solar: W.E0.home.pv.life, hp: hp.life };
    R.reb = {}; IDS.filter(function (k) { return HOME[k]; }).forEach(function (k) { R.reb[k] = W.A.programme.share * Math.max(0, R.up[k]) * crf(r, life[k]); });
    R.rebate = sum(Object.keys(R.reb).map(function (k) { return R.reb[k]; }));
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
  // (gas MMBtu, gallons) x EIA's coefficients, rounded; scope 2 = the sector's inventory - scope 1 (its grid-supplied
  // electricity x eGRID's rate; the test checks it within 2 t of roundings); scope 3 = distribution losses
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
  // grid-supplied electricity by sector (MWh, 2025): rooftop solar used on site is not grid-supplied (GPC scope 2), so its
  // MWh come off the homes' and businesses' electricity in proportion to their use, as prairie-city.json's inventory does
  function gridElOf(PC) {
    var el = elOf(PC), B = PC.balance.sectors, hc = B.homes.el + B.commercial.el, out = {};
    Object.keys(el).forEach(function (k) { out[k] = el[k] - (k === "homes" || k === "commercial" ? PC.supply.rooftopMWh * B[k].el / hc : 0); });
    return out;
  }
  function inventory(W) {
    var PC = W.PC, inv = PC.inventory2025.sectors, F = fuelsOf(PC), el = elOf(PC), ge = gridElOf(PC);
    var rows = Object.keys(inv).map(function (k) {
      if (k === "grid_losses") return { key: k, s1: 0, s2: 0, s3: inv[k], total: inv[k] };
      var s1 = Math.round(F[k]); return { key: k, s1: s1, s2: inv[k] - s1, s3: 0, total: inv[k], el: el[k], gridEl: ge[k], fuel: F[k] };
    });
    var tot = { s1: sum(rows.map(function (x) { return x.s1; })), s2: sum(rows.map(function (x) { return x.s2; })), s3: sum(rows.map(function (x) { return x.s3; })), total: PC.inventory2025.total };
    return { rows: rows, tot: tot, s12: tot.s1 + tot.s2 };
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
    var PC = W.PC, G = PC.groups, w = W.A.participation[key].w;
    var save = -R.billHome, cost = R.homeCost, prog = R.rebate, partNet = save - cost + prog;   // prog: rebates, never below zero
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
  // ---------------------------------------------------------------- the reader's settings and the page's lines (pure)
  function gridOf(W, key) { var g = W.A.options.grid.filter(function (x) { return x.key === key; })[0] || W.A.options.grid[0]; return g.t == null ? W.grid23 : g.t; }
  function gasOf(W, key) { var g = W.A.options.gas.filter(function (x) { return x.key === key; })[0] || W.A.options.gas[1]; return g.x; }
  function settings(W, S) { return { grid: gridOf(W, S.grid), gasX: gasOf(W, S.gas), solar: S.solar, ac: !!S.ac }; }
  function planIds(S) { return IDS.filter(function (k) { return S.plan[k]; }); }
  function words(s) { return String(s).replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, "$1").replace(/\*\*/g, "").trim().split(/\s+/).length; }
  function name(W, id) { return W.M[id].short; }
  function lineInventory(I) {
    return "Scope 1, burned in the city: " + fm.kt(I.tot.s1) + "; scope 2, electricity from the grid (not rooftop solar used on site): " + fm.kt(I.tot.s2) +
      "; scope 3, losses on the wires: " + fm.kt(I.tot.s3) + ". 1 kt is 1,000 t.";
  }
  function targetT(W, pct) { return W.PC.inventory2025.total * pct / 100; }
  function lineTarget(W, pct, all) {
    var tot = W.PC.inventory2025.total;
    return "A " + pct + "% cut is " + fm.t(targetT(W, pct)) + " a year by 2035, from 2025's " + fm.t(tot) + ". The curve's six bars together cut " + fm.pct(all.t / tot) +
      (all.gridCut > 0.5 ? "; the grid's own change adds " + fm.pct(all.gridCut / tot) + "." : ".");
  }
  // the target counts the whole cut from 2025: the measures' and the grid's own (R.total)
  function linePlan(W, R, pct) {
    var n = Object.keys(R.on).length, tot = W.PC.inventory2025.total, need = targetT(W, pct), g = R.gridCut > 0.5;
    if (!n) return (g ? "No bars yet; the grid's own change cuts " + fm.t(R.gridCut) + (R.total >= need ? ", enough for the " + pct + "% target. " : ". ") : "No bars in the plan yet. ") +
      "Add the cheapest ones, or press **Cheapest first**.";
    var s = "**Your plan:** " + n + (n === 1 ? " bar cuts " : " bars cut ") + fm.t(R.t) + " a year by 2035" + (g ? "; with the grid's own " + fm.t(R.gridCut) + " the cut is " + fm.t(R.total) : "") +
      ", " + fm.pct(R.total / tot) + " of 2025. ";
    if (R.total >= need) return s + "It reaches the " + pct + "% target.";
    return s + "It is " + fm.t(need - R.total) + " short of the target" + (n === IDS.length ? ": the rest lies outside this curve (transport, industry, the grid's rate)." : ".");
  }
  function lineBudget(R, budgetM) {
    if (!Object.keys(R.on).length) return "No bars yet, so the plan needs no money up front.";
    var b = budgetM * 1e6, up = R.upfront, s = up >= 0 ? "Up front the plan needs " + fm.musd(up) + ", one-time. " : "Up front the plan costs " + fm.musd(-up) + " less than the usual replacements. ";
    s += up <= b ? "That fits your " + fm.musd(b) + " budget. " : "Your " + fm.musd(b) + " budget is " + fm.musd(up - b) + " short. ";
    if (Math.abs(R.net) < 5e4) return s + "Net of energy saved, it costs about nothing a year.";
    return s + "Net of energy saved, it " + (R.net < 0 ? "gains " + fm.musd(-R.net) : "costs " + fm.musd(R.net)) + " a year (an annual equivalent).";
  }
  function linePeak(P) {
    var over = P.filter(function (x) { return x.over > 1e-9; });
    var s = "Highest hours: " + P.map(function (x) { return x.label.toLowerCase() + " " + fm.mw(x.mw) + " of " + x.limit; }).join(", ") + " MW. ";
    if (!over.length) return s + "Every district stays within its substation's limit.";
    return s + "Over the limit: " + over.map(function (x) { return x.label.toLowerCase() + " by " + fm.mw(x.over); }).join(", ") + ", an upgrade the curve does not price.";
  }
  function lineGroups(W, G, R) {
    if (!(R.homeUnits > 0)) return "The plan has no home measures yet, so no household gains or pays through it.";
    var lo = Math.min.apply(null, G.map(function (g) { return g.charge; })), hi = Math.max.apply(null, G.map(function (g) { return g.charge; }));
    var s = "Households at 100% of the area median income or more take " + fm.pct(G[4].share, 0) + " of the home measures; the 0-30% group takes " + fm.pct(G[0].share, 0) + ". ";
    if (!(R.rebate > 0)) return s + "They cost less up front than the usual replacements, so the programme pays no rebate and nobody pays for one.";
    return s + "A home that takes none pays " + fm.usd(lo) + " to " + fm.usd(hi) + " a year for the programme's rebates.";
  }
  function lineOrder(W, o) {
    var B = bars(W, o), ids = B.map(function (b) { return b.id; }), io = inOrder(W, ids, o), all = evaluate(W, IDS, o);
    var alone = sum(B.map(function (b) { return b.t; })), k = -1, drop = -1;
    io.forEach(function (x, i) { var d = B[i].t - x.t; if (d > drop + 1e-6) { drop = d; k = i; } });
    var s = "Alone, the six bars add to " + fm.t(alone) + "; in order they cut " + fm.t(all.t) + ". ", b = B[k], x = io[k];
    var nm = b.m.bar.charAt(0).toUpperCase() + b.m.bar.slice(1);
    if (!(x.t > 0.5)) return s + nm + " adds nothing in line (" + fm.t(b.t) + " alone): its furnaces have become heat pumps.";
    return s + nm + " adds " + fm.t(x.t) + " in line instead of " + fm.t(b.t) + " alone, at " + fm.per(x.per) + " instead of " + fm.per(b.per).replace(" per t", "") + ".";
  }
  function orderText(W, B) { return B.map(function (b, i) { return (i + 1) + " " + b.m.short.toLowerCase(); }).join(", "); }
  function lineBaseline(W, o) {
    var B = bars(W, o), g = evaluate(W, [], o).gridCut;
    var s = "At " + o.grid.toFixed(3) + " t per MWh" + (o.ac ? ", air conditioner due," : "") + " the order is " + orderText(W, B) + ". ";
    return s + (g > 0.5 ? "The grid alone cuts " + fm.t(g) + " a year (scopes 2 and 3), which counts toward the target." : "At 2023's rate the grid cuts nothing by itself.");
  }
  function lineStatic(W, o) {
    var B = bars(W, o), lo = B[0], hi = B[B.length - 1];
    return "Cheapest now: " + lo.m.short.toLowerCase() + " at " + fm.per(lo.per) + "; dearest: " + hi.m.short.toLowerCase() + " at " + fm.per(hi.per) + ". The order is " + orderText(W, B) + ".";
  }
  // what each measure is: its replacement and main assumption, and how many by 2035 at its potential
  function measureLines(W) {
    return W.A.measures.map(function (m) { var u = evaluate(W, [m.id]).units[m.id];
      return { id: m.id, head: m.n + " · " + m.label + ".", text: m.what + " By 2035: " + Math.round(u).toLocaleString("en-US") + " " + m.unit + "." }; });
  }
  // the explain layer's "Your plan" trace: adopting needs the target, the budget and the peaks; who gains and who pays
  // is weighed, not passed or failed (pure; P = peaks with the plan)
  function tracePlan(W, R, P, S) {
    var n = Object.keys(R.on).length, over = P.filter(function (x) { return x.over > 1e-9; }).length;
    if (!n) return { pass: false, n: 0, text: "No measures yet: the plan stops at the options." };
    var miss = [R.total < targetT(W, S.target) ? "misses the target" : null, R.upfront > S.budget * 1e6 ? "needs more than the budget" : null, over ? "puts a substation over its limit" : null].filter(Boolean);
    if (!miss.length) return { pass: true, n: n, text: "It meets the target, the budget and every substation limit. Who gains and who pays (test 3) is not pass or fail: the council weighs it before adopting." };
    var last = miss.pop();
    return { pass: false, n: n, text: "It " + (miss.length ? miss.join(", ") + " and " : "") + last + ": revise the measures or their order, and screen again." };
  }
  // every reported total of a plan, for the comparison table (each measure alone)
  function table(W, o) {
    var base = peaks(W, null), sub = base.map(function (x) { return x.key; }).indexOf("suburbs");
    return bars(W, o).map(function (b) { var P = peaks(W, b.R); return { id: b.id, m: b.m, per: b.per, t: b.t, up: b.up, dPeak: P[sub].mw - base[sub].mw }; });
  }
  var model = { IDS: IDS, HOME: HOME, crf: crf, prepare: prepare, rep: rep, opt: opt, evaluate: evaluate, bars: bars, sortBars: sortBars, curve: curve,
    inOrder: inOrder, inventory: inventory, fuelsOf: fuelsOf, elOf: elOf, gridElOf: gridElOf, peaks: peaks, groups: groups, hm: hm, fm: fm, round2: round2,
    measureLines: measureLines, tracePlan: tracePlan,
    gridOf: gridOf, gasOf: gasOf, settings: settings, planIds: planIds, words: words, targetT: targetT, table: table,
    lineInventory: lineInventory, lineTarget: lineTarget, linePlan: linePlan, lineBudget: lineBudget, linePeak: linePeak, lineGroups: lineGroups,
    lineOrder: lineOrder, lineBaseline: lineBaseline, lineStatic: lineStatic };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "a18-city-plan";
  LX.mount(SLUG, function (live, data, root) {
    var A = data.a18_city_plan, PC = data.prairie_city, PATH = data.path, W = prepare(A, PC, data.e0), I = inventory(W);
    var saved = LX.store.get("a18", {}) || {}, plan0 = {};
    IDS.forEach(function (k) { plan0[k] = !!(saved.plan && saved.plan[k]); });
    var S = { plan: plan0, target: clampStep(saved.target, A.target), budget: clampStep(saved.budget, A.budget), grid: pick(saved.grid, A.options.grid, "egrid"),
      gas: pick(saved.gas, A.options.gas, "y2025"), solar: pick(saved.solar, A.options.solar, "y2020"), ac: !!saved.ac, who: saved.who === "low" ? "low" : "first",
      part: "inv", order: false, sorted: !!saved.sorted };
    function clampStep(v, c) { v = Number(v); if (!isFinite(v)) return c.def; v = Math.min(c.max, Math.max(c.min, v)); return Math.round((v - c.min) / c.step) * c.step + c.min; }
    function pick(v, list, def) { return list.some(function (x) { return x.key === v; }) ? v : def; }
    function keep() { LX.store.set("a18", { plan: S.plan, target: S.target, budget: S.budget, grid: S.grid, gas: S.gas, solar: S.solar, ac: S.ac, who: S.who, sorted: S.sorted }); }
    function O() { return settings(W, S); }
    function R() { return evaluate(W, S.plan, O()); }
    var onPlan = null;                                   // the open step's hook, called after the plan or a setting changes
    function refRich(code) { var r = LX.lessonRef(PATH, code); return r.ready ? "[[lesson:" + r.href.replace(/\.html$/, "") + "|" + r.label + "]]" : r.label + " (upcoming)"; }
    function refText(code) { var r = LX.lessonRef(PATH, code); return r.ready ? r.label : r.label + " (upcoming)"; }

    // ---------- the stage: title, readouts, the chart, the measures
    var stage = H("div", { class: "lx-stage a18-stage" }, live), head = H("div", { class: "lx-stage-head" }, stage), title = H("h3", null, head);
    H("p", { class: "lx-hint a18-fict", text: PC.about.line }, stage);
    var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, stage);
    var invHost = H("div", { class: "a18-inv" }, stage), maccHost = H("div", { class: "a18-macc" }, stage);
    var plot = LX.Plot(maccHost, { text: "Text version of the curve" });
    var tg = H("div", { class: "lx-toggles a18-measures", role: "group", "aria-label": "Measures in your plan" }, maccHost), toggles = {};
    A.measures.forEach(function (m) {
      toggles[m.id] = LX.Toggle(tg, { label: m.n + " · " + m.label, on: S.plan[m.id], onChange: function (on) { S.plan[m.id] = on; keep(); paint(); if (onPlan) onPlan(); } });
      toggles[m.id].el.style.setProperty("--a18-c", m.color);
    });
    var what = H("details", { class: "lx-textalt a18-what" }, maccHost); H("summary", { text: "What each measure is, and how many by 2035" }, what);
    var whatList = H("ul", null, what);
    measureLines(W).forEach(function (x) { var li = H("li", null, whatList); li.innerHTML = "<b>" + LX.rich(x.head) + "</b> " + LX.rich(x.text); });
    var status = H("p", { class: "lx-stage-status", "aria-live": "polite" }, stage);
    var invSplit = null;
    function chip(label, value, tone) { var c = H("div", { class: "lx-readout" + (tone ? " " + tone : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    var SHORT = {}; PC.flows.nodes.forEach(function (n) { SHORT[n.id] = n.short; });
    function drawInventory() {
      invHost.innerHTML = "";
      var parts = S.sorted ? [{ key: "s1", label: "Scope 1: burned in the city", color: "var(--lx-warn)", words: "scope 1" }, { key: "s2", label: "Scope 2: grid electricity used", color: "var(--lx-accent)", words: "scope 2" },
        { key: "s3", label: "Scope 3: lost on the wires", color: "var(--lx-ink-3)", words: "scope 3" }] : [{ key: "all", label: "CO₂ in 2025", color: "var(--lx-ink-3)", words: "CO₂" }];
      invSplit = LX.CostSplit(invHost, { parts: parts, fmt: function (v) { return fm.kt(v); },
        rows: I.rows.slice().sort(function (a, b) { return b.total - a.total; }).map(function (r) { return { key: r.key, label: SHORT[r.key], color: "var(--lx-ink-3)", total: r.total,
          values: S.sorted ? { s1: r.s1, s2: r.s2, s3: r.s3 } : { all: r.total } }; }) });
      H("p", { class: "lx-hint", text: "Prairie City's 2025 CO₂ by sector in kt (1 kt = 1,000 t), location-based, operating only: " + fm.t(I.tot.total) + " in all. A teaching inventory: CO₂ only, no waste." }, invHost);
    }
    function yAxis(list) {
      var lo = Math.min.apply(null, list.map(function (b) { return b.per == null ? 0 : b.per; }).concat([-100])), hi = Math.max.apply(null, list.map(function (b) { return b.per == null ? 0 : b.per; }).concat([100]));
      var step = hi - lo > 700 ? 200 : 100; return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step: step };
    }
    function drawCurve() {
      var o = O(), B = bars(W, o), io = S.order ? inOrder(W, B.map(function (b) { return b.id; }), o) : null;
      var list = B.map(function (b, i) { return io ? { id: b.id, m: b.m, t: Math.max(0, io[i].t), per: io[i].per, alone: b } : { id: b.id, m: b.m, t: b.t, per: b.per, alone: b }; });
      var g = evaluate(W, [], o).gridCut, C = curve(list), xmax = Math.max(180, Math.ceil(C[C.length - 1].x1 / 1000 / 30) * 30), ya = yAxis(list);
      var need = Math.max(0, targetT(W, S.target) - g) / 1000;             // what the measures must add to the grid's own change
      var xt = []; for (var v = 0; v <= xmax; v += 30) xt.push([v, v + (v === xmax ? " kt" : "")]);
      plot.render({
        x: { min: 0, max: xmax, ticks: xt, ticksN: xt.filter(function (t, i) { return i % 2 === 0; }) },
        y: { min: ya.min, max: ya.max, step: ya.step, zero: true, fmt: function (v) { return (v < 0 ? "−$" : "$") + Math.abs(v); }, unit: "$ per t CO₂" }, height: 280, heightN: 240,
        bars: C.filter(function (c) { return c.per != null; }).map(function (c) { return { x0: c.x0 / 1000, x1: c.x1 / 1000, y0: 0, y1: c.per, color: c.b.m.color, op: S.plan[c.id] ? 0.9 : 0.25 }; }),
        marks: C.filter(function (c) { return c.per != null && c.x1 > c.x0; }).map(function (c) { return { x: (c.x0 + c.x1) / 2000, y: c.per, n: String(c.b.m.n) }; })
          .concat(S.part === "inv" || !(need > 0) ? [] : [{ x: Math.min(need, xmax), y: ya.max, vline: true }]),
        legend: A.measures.map(function (m) { return { label: m.n + " " + m.short, color: m.color }; }),
        aria: "Prairie City's marginal abatement cost curve" + (S.order ? ", each bar in order after the bars before it" : ", each measure alone") + ": width, tonnes of CO₂ avoided a year by 2035; height, cost per tonne. The dashed line is what the measures must cut to reach the target.",
        text: { head: ["Order", "Measure", "Tonnes a year", "Cost per tonne", "In your plan"], rows: C.map(function (c, i) { return [String(i + 1), c.b.m.label, fm.t(c.t), fm.per(c.per), S.plan[c.id] ? "yes" : "no"]; }),
          note: g > 0.5 ? (need > 0 ? "Dashed line: the target less the grid's own " + fm.t(g) + ", " + fm.t(need * 1000) + " a year for the measures." : "The grid's own " + fm.t(g) + " already meets the target: no dashed line.") :
            "Dashed line: the target, " + fm.t(need * 1000) + " a year." }
      });
    }
    function paint() {
      var r = R(), need = targetT(W, S.target), inv = S.part === "inv";
      title.textContent = inv ? "Prairie City's emissions, 2025" : "Prairie City's plan, 2026 to 2035" + (S.order ? " · bars in order" : "");
      chips.innerHTML = "";
      if (inv) { chip("Inventory, 2025", fm.kt(I.tot.total)); if (S.sorted) { chip("Scope 1", fm.kt(I.tot.s1)); chip("Scope 2", fm.kt(I.tot.s2)); chip("Scope 3", fm.kt(I.tot.s3)); } }
      else {
        chip("Target", fm.t(need) + " a year"); chip("Your measures cut", fm.t(r.t), r.total >= need && planIds(S).length ? "good" : null);
        if (r.gridCut > 0.5) { chip("The grid's own change", fm.t(r.gridCut)); chip("Cut from 2025", fm.t(r.total), r.total >= need ? "good" : null); }
        chip("Net cost a year", fm.musd(r.net), Math.abs(r.net) < 5e4 ? null : r.net > 0 ? "bad" : "good"); chip("Up front, one-time", fm.musd(r.upfront));
      }
      invHost.hidden = !inv; maccHost.hidden = inv;
      if (inv) drawInventory(); else drawCurve();
      IDS.forEach(function (k) { toggles[k].set(!!S.plan[k]); });
      status.textContent = inv ? "Scope 1 is burned in the city; scope 2 is grid electricity used in it (rooftop solar used on site is not); scope 3 happens outside it because of the city." :
        (S.order ? "Bars in order, cheapest first: width = tonnes each adds after the bars before it, height = its cost per tonne." : "Each bar alone, cheapest first: width = tonnes avoided a year by 2035, height = cost per tonne.");
      buildExplain();
    }

    // ---------- step cards
    function seg(act, id, label, opts, cur, onPick) {
      var w = H("div", { class: "cf-ctl" }, act); H("p", { class: "cf-ctl-l", id: id, text: label }, w);
      var s = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, w), bs = opts.map(function (o) {
        var b = H("button", { type: "button", text: o[1] }, s); b.setAttribute("aria-pressed", String(o[0] === cur));
        b.addEventListener("click", function () { bs.forEach(function (x, i) { x.setAttribute("aria-pressed", String(opts[i][0] === o[0])); }); onPick(o[0]); });
        return b;
      });
      return bs;
    }
    function cheapest() {   // continue from the reader's plan: add the cheapest bars not yet in it until the target is met
      var need = targetT(W, S.target), B = bars(W, O());
      for (var i = 0; i < B.length && R().total < need; i++) if (!S.plan[B[i].id]) S.plan[B[i].id] = true;
      keep(); paint(); if (onPlan) onPlan();
    }
    function ledgerPeak(host) {
      host.innerHTML = ""; var P = peaks(W, R()), P0 = peaks(W, null);
      LX.Ledger(host, { cls: "a18-led", caption: "Each district's highest hour over Prairie City's eight days, with your plan. " + PC.about.simplifications[0],
        columns: ["District", "Limit", "2025", "With your plan", "Margin"],
        rows: P.map(function (x, i) { return { head: x.label, sub: x.dayLabel.toLowerCase() + ", " + hm(x.h), cells: [fm.mw(x.limit), fm.mw(P0[i].mw), fm.mw(x.mw),
          { text: (x.over > 1e-9 ? "over by " : "") + fm.mw(Math.abs(x.over)), cls: x.over > 1e-9 ? "a18-over" : "" }] }; }) });
      return P;
    }
    function ledgerGroups(host) {
      host.innerHTML = ""; var r = R(), G = groups(W, r, S.who);
      LX.Ledger(host, { cls: "a18-led", caption: "A screening estimate for one year by 2035 (" + A.participation[S.who].label.toLowerCase() + "): bills at 2025 prices, equipment as an annual equivalent; rate changes and transfers are left to " + refText("A13") + ".",
        columns: ["Household group", "Home measures per 100 homes", "A home that takes none, a year", "Average per home, a year"],
        rows: G.map(function (g) { return { head: g.label, sub: g.hh.toLocaleString("en-US") + " households", cells: [g.per100.toFixed(0), fm.usd(-g.charge), fm.usd(g.avg)] }; }) });
      return G;
    }
    var steps = [
      { text: "A plan starts with an [[emissions-inventory|inventory]]. Sort eight activities into the scopes of the [[gpc|GPC]], the standard for city inventories: burned in the city ([[scope-1|scope 1]]), grid electricity used in it ([[scope-2|scope 2]]), or caused outside it ([[scope-3|scope 3]]).",
        build: function (act, api) {
          onPlan = null; S.part = "inv"; S.order = false; paint();
          H("p", { class: "lx-hint", text: "GPC: the Global Protocol for Community-Scale Greenhouse Gas Emission Inventories (WRI, C40 Cities and ICLEI, 2014)." }, act);
          LX.CardSort(act, { bins: A.scopeSort.bins.map(function (b, i) { return { id: b.id, label: b.label, sub: b.sub, color: ["var(--lx-warn)", "var(--lx-accent)", "var(--lx-ink-3)"][i] }; }),
            cards: A.scopeSort.cards, onCheck: function (g) { if (g.placed === g.total) { S.sorted = true; keep(); paint(); api.done(); api.saw("You placed " + g.right + " of " + g.total + " as the GPC does. " + lineInventory(I)); } } });
          if (S.sorted) { api.done(); api.saw(lineInventory(I)); }
        } },
      { text: "Next, a target: the share of 2025's emissions to cut by 2035. A city council adopts it, and the inventory is the yardstick. Set it.",
        build: function (act, api) {
          onPlan = null; S.part = "target"; S.order = false; paint();
          var all = evaluate(W, IDS, O());
          LX.Slider(act, { label: "Cut by 2035, share of 2025", min: A.target.min, max: A.target.max, step: A.target.step, value: S.target, fmt: function (v) { return v + "%"; },
            onChange: function (v) { S.target = v; keep(); paint(); api.saw(lineTarget(W, v, evaluate(W, IDS, O()))); api.done(); } });
          var b = H("button", { type: "button", class: "lx-btn small", text: "Keep " + S.target + "%" }, act);
          b.addEventListener("click", function () { api.saw(lineTarget(W, S.target, all)); api.done(); });
        } },
      { text: "Each bar is a measure on a [[marginal-abatement-cost-curve|marginal abatement cost curve]]: width, tonnes avoided a year by 2035; height, [[abatement-cost|cost per tonne]]. Below zero it saves more than it costs. Switch bars on to reach the target.",
        build: function (act, api) {
          S.part = "plan"; S.order = false; paint();
          var b = H("button", { type: "button", class: "lx-btn small", text: "Cheapest first" }, act);
          H("p", { class: "lx-hint", text: "Cheapest first adds the cheapest bars missing from your plan until it reaches the target." }, act);
          function check() { var r = R(); api.saw(linePlan(W, r, S.target)); if (r.total >= targetT(W, S.target) || planIds(S).length === IDS.length) api.done(); }
          onPlan = check; b.addEventListener("click", cheapest);
          if (planIds(S).length) check();
        } },
      { text: "Test 1, money up front. A bar's height is a yearly average over the equipment's life, yet the plan needs cash at the start. Set the budget available and compare.",
        build: function (act, api) {
          S.part = "budget"; S.order = false; paint();
          LX.Slider(act, { label: "Budget up front, 2026 to 2035", min: A.budget.min, max: A.budget.max, step: A.budget.step, value: S.budget, fmt: function (v) { return "$" + v + "M"; },
            onChange: function (v) { S.budget = v; keep(); api.saw(lineBudget(R(), v)); api.done(); } });
          onPlan = function () { api.saw(lineBudget(R(), S.budget)); };
          var b = H("button", { type: "button", class: "lx-btn small", text: "Compare" }, act);
          b.addEventListener("click", function () { api.saw(lineBudget(R(), S.budget)); api.done(); });
        } },
      { text: "Test 2, the coldest morning: each district has one [[substation|substation]] with a limit. Run your plan through Prairie City's eight days, the cold [[design-day|design day]] included; then switch heat pumps on and check again.",
        build: function (act, api) {
          S.part = "peak"; S.order = false; paint();
          var b = H("button", { type: "button", class: "lx-btn small", text: "Check the peaks" }, act), host = H("div", null, act);
          function run() { var P = ledgerPeak(host); api.saw(linePeak(P)); api.done(); }
          b.addEventListener("click", run); onPlan = function () { if (host.firstChild) { var P = ledgerPeak(host); api.saw(linePeak(P)); } };
        } },
      { text: "Test 3, who benefits. Homes that take a measure keep its savings; a programme paying 40% of the extra cost up front recovers it on every home's bill. Compare two ways homes take part.",
        build: function (act, api) {
          S.part = "who"; S.order = false; paint();
          var host = H("div", null, act), ref = H("p", { class: "lx-hint" }, act);
          seg(act, "a18-who-l", "Who takes part", [["first", A.participation.first.label], ["low", A.participation.low.label]], S.who, function (k) {
            S.who = k; keep(); var G = ledgerGroups(host); api.saw(lineGroups(W, G, R())); api.done(); });
          act.appendChild(host); act.appendChild(ref);
          ref.innerHTML = LX.lessonRefHTML(PATH, "A13") + " does the full accounting: rates, transfers against real costs, and energy burden by group.";
          onPlan = function () { var G = ledgerGroups(host); api.saw(lineGroups(W, G, R())); };
          ledgerGroups(host);
        } },
      { text: "Where the curve misleads, 1: each bar was priced alone. Show them in order, so each bar gives only what it adds to the bars before it. A heat pump in a weatherized home saves less.",
        build: function (act, api) {
          onPlan = null; S.part = "order"; paint();
          LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "How the bars are counted" }, act), { label: "Bars in order", on: S.order,
            onChange: function (on) { S.order = on; paint(); api.saw(lineOrder(W, O())); api.done(); } });
          H("p", { class: "lx-hint", text: "Lock-in: a furnace bought in 2026 lasts " + W.M.furnace.life + " years on average, past 2045; a home that buys one is out of the heat-pump bar until then." }, act);
          if (S.order) { api.done(); api.saw(lineOrder(W, O())); }
        } },
      { text: "Where it misleads, 2: the [[counterfactual|baseline]], what would happen anyway. The grid's CO₂ per MWh in 2035 changes the tonnes; whether the old air conditioner is due too changes the heat pump's cost.",
        build: function (act, api) {
          onPlan = null; S.part = "base"; S.order = false; paint();
          function say() { api.saw(lineBaseline(W, O())); api.done(); }
          seg(act, "a18-grid-l", "The grid in 2035", A.options.grid.map(function (g) { return [g.key, g.label + " (" + (g.t == null ? W.grid23 : g.t).toFixed(2) + " t/MWh)"]; }), S.grid, function (k) { S.grid = k; keep(); paint(); say(); });
          LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "What a heat pump replaces" }, act), { label: "The air conditioner is due too", on: S.ac,
            onChange: function (on) { S.ac = on; keep(); paint(); say(); } });
          H("p", { class: "lx-hint", text: "The two cleaner grids are set for teaching. The real one depends on utilities, regional markets and state and federal policy; a city can cut its use." }, act);
        } },
      { text: "Where it misleads, 3: a curve is a snapshot of prices and costs. Move the gas price and use EIA's 2030 cost for rooftop solar; watch bars change height and order.",
        build: function (act, api) {
          onPlan = null; S.part = "static"; S.order = false; paint();
          function say() { api.saw(lineStatic(W, O())); api.done(); }
          seg(act, "a18-gas-l", "Gas price", A.options.gas.map(function (g) { return [g.key, g.label + " (×" + g.x + ")"]; }), S.gas, function (k) { S.gas = k; keep(); paint(); say(); });
          seg(act, "a18-sol-l", "Rooftop solar cost", A.options.solar.map(function (g) { return [g.key, g.label]; }), S.solar, function (k) { S.solar = k; keep(); paint(); say(); });
          H("p", { class: "lx-hint", text: A.options.gasNote }, act);
        } },
      { text: "Where it misleads, 4: bars below zero rarely happen by themselves. Sort what a bar's cost counts and what it leaves out; programmes and rules exist for the gap.",
        build: function (act, api) {
          onPlan = null; S.part = "barrier"; S.order = false; paint();
          LX.CardSort(act, { bins: A.barrierSort.bins.map(function (b, i) { return { id: b.id, label: b.label, sub: b.sub, color: ["var(--lx-good)", "var(--lx-bad)"][i] }; }),
            cards: A.barrierSort.cards, onCheck: function (g) { api.saw("You placed " + g.right + " of " + g.total + " as the sources do. A bar's cost is the equipment's, not the whole effort of getting it installed."); if (g.placed === g.total) api.done(); } });
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });

    // ---------- the explain layer, with the reader's numbers
    var xhost = document.getElementById("a18-explain");
    function buildExplain() {
      if (!xhost) return;
      var o = O(), r = R(), P = peaks(W, r), tp = tracePlan(W, r, P, S), n = tp.n;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var F = {}; A.flow.steps.forEach(function (s) { F[s.id] = s; });
      function nd(id) { var s = F[id], o2 = { t: s.t, tN: s.t.length > 14 ? splitWords(s.t) : [s.t] }; if (s.s) { o2.s = s.s; o2.sN = s.sN || s.s; } if (id === "ok") o2.k = "q"; if (id === "mon" || id === "rev") o2.k = "end"; return o2; }
      function splitWords(t) { var w = t.split(" "), h = Math.ceil(w.length / 2); return [w.slice(0, h).join(" "), w.slice(h).join(" ")]; }
      var pass = tp.pass;
      LX.Flowchart(H("div", { class: "lx-xcard" }, xhost), {
        title: "How a U.S. city plan is made, and who decides", lede: A.flow.note,
        nodes: { inv: nd("inv"), tgt: nd("tgt"), opt: nd("opt"), irp: nd("irp"), scr: nd("scr"), ok: nd("ok"), plan: nd("plan"), rev: nd("rev"), mon: nd("mon") },
        cols: 2, colsN: 2,
        at: { inv: [0, 0], tgt: [0, 1], opt: [0, 2], irp: [1, 2], scr: [0, 3], ok: [0, 4], rev: [1, 4], plan: [0, 5], mon: [0, 6] },
        atN: { inv: [0, 0], tgt: [0, 1], opt: [0, 2], irp: [1, 2], scr: [0, 3], ok: [0, 4], rev: [1, 4], plan: [0, 5], mon: [0, 6] },
        edges: [["inv", "tgt"], ["tgt", "opt"], ["opt", "irp"], ["opt", "scr"], ["irp", "scr", null, { v: true }], ["scr", "ok"], ["ok", "plan", "yes"], ["ok", "rev", "no"], ["plan", "mon"]],
        traces: [
          { label: "Your plan", path: n ? ["inv", "tgt", "opt", "scr", "ok", pass ? "plan" : "rev"].concat(pass ? ["mon"] : []) : ["inv", "tgt", "opt"], text: tp.text },
          { label: "The utility's part", path: ["opt", "irp", "scr", "ok", "plan"], text: F.irp.who + " " + F.plan.who }],
        sel: 0 });
      // who decides each step: one row per step, one sentence each
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), {
        title: "Who decides each step", text: true, caption: "Typical U.S. practice; who does what differs by state and city.",
        columns: [{ key: "step", label: "Step", main: true }, { key: "who", label: "Who does what" }],
        rows: A.flow.steps.filter(function (s) { return s.who; }).map(function (s) { return { key: s.id, step: s.t, who: s.who }; }) });
      var T = table(W, o);
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), {
        title: "The curve and the tests, measure by measure", text: true,
        caption: "Each measure alone, with your settings. Peak: the change in the suburbs' highest hour. Who decides: typical U.S. practice.",
        columns: [{ key: "name", label: "Measure", main: true }, { key: "per", label: "Cost per tonne" }, { key: "t", label: "Tonnes a year" }, { key: "up", label: "Up front" }, { key: "pk", label: "Suburbs' peak" }, { key: "who", label: "Who decides" }],
        rows: T.map(function (x) { return { key: x.id, color: x.m.color, name: x.m.n + " " + x.m.label, per: fm.per(x.per), t: fm.t(x.t), up: fm.musd(x.up),
          pk: (x.dPeak > 0.05 ? "+" : x.dPeak < -0.05 ? "−" : "") + fm.mw(Math.abs(x.dPeak)), who: x.m.whoText }; }) });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where this curve holds",
        holds: ["Prairie City, a fictional city, with 2025 prices and costs in 2025 dollars;", "2035 without a plan: 2025's energy use, at the 2035 grid's rate;", "ten years, each measure at its stated potential, equipment replaced only when it wears out;",
          "CO₂ at each fuel's coefficient and the grid's average rate (location-based), with 5% lost on the wires;", "costs spread over each item's life at a 4% real rate, energy at retail prices."],
        leaves: ["transport, the industrial park and the grid's own plan: no bar here;", "rebound, comfort, health and soft costs;", "how lower sales move rates for everyone: " + refRich("A13") + ";", "the cost of a bigger substation."],
        source: "Costs: EIA (2022 dollars), LBNL (2012), ORNL (2008), in 2025 dollars with BEA's deflator. Prairie City is fictional; its numbers are illustrative." });
    }

    // lesson links in the static Go deeper text: a link once the lesson is live
    Array.prototype.forEach.call(document.querySelectorAll(".a18-ref[data-code]"), function (el) { el.innerHTML = LX.lessonRefHTML(PATH, el.getAttribute("data-code")); });
    paint();
    LX.demo(root, function (state) {
      if (state === "mid") { S.sorted = true; IDS.forEach(function (k) { S.plan[k] = false; }); keep(); cards.go(2); cheapest(); return { view: "cheapest bars to the target" }; }
      if (state === "peak") { S.sorted = true; IDS.forEach(function (k) { S.plan[k] = k === "hp"; }); keep(); cards.go(4); paint();
        Array.prototype.forEach.call(live.querySelectorAll("button"), function (x) { if (x.textContent === "Check the peaks") x.click(); }); return { view: "heat pumps alone on the cold design day" }; }
      if (state === "order") { S.sorted = true; IDS.forEach(function (k) { S.plan[k] = false; }); keep(); cards.go(2); cheapest(); cards.go(6); Array.prototype.forEach.call(live.querySelectorAll("button[aria-pressed]"), function (x) { if (/Bars in order/.test(x.textContent) && x.getAttribute("aria-pressed") !== "true") x.click(); }); return { view: "bars in order" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, W: W, S: S, cards: cards };
  });
})();
