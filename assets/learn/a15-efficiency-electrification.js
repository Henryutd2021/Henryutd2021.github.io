// a15-efficiency-electrification.js — Lesson A15, "How much can efficiency and electrification change demand? Buildings,
// heat, transport and industry" (step cards, Analyst, D3, closed form; wave W5, builder learn-w5-a, 2026-11-06).
//
// Data: data/prairie-city.json (Prairie City: districts, homes, floor area, the heat model, F3's COP curve, the eight
// representative days with the cold design day, EV charging, the industrial park, 2025 Kansas prices; read, never retyped),
// data/a15-efficiency-electrification.json (this lesson's own inputs: measure costs, lives and savings with their sources,
// the rebound range, the district-heat and industry settings) and data/path.json (lesson links that appear once live).
//
// Model (closed form; no optimization):
//   cost of saved energy  CSE = C x CRF(r, n) / dE, $ per MWh saved, 2025 dollars. C = the extra cost per unit (at
//                         replacement: the efficient choice minus the standard one; a retrofit: the whole cost), moved to
//                         2025 dollars with BEA's GDP deflator; CRF(r, n) = r (1 + r)^n / ((1 + r)^n - 1), r the real
//                         discount rate (LBNL's 6% by default), n the life in years; dE the MWh of the carrier saved a year,
//                         times (1 - rebound) for the homes' measures. A measure pays when its CSE is below the retail price
//                         of what it saves (2025 Kansas: homes' and shops' electricity, homes' gas).
//   savings per unit      heat pump from resistance: q (1 - 1/SCOP), q = the district's average home's heat a year, SCOP
//                         the heat-weighted COP over the representative days (F3's curve at each hour's temperature);
//                         heat-pump water heater: w (1/0.92 - 1/3.73), w = hot water delivered per home; weatherization:
//                         a pre-1980 home (average floor area) brought from the pre-1980 to the 1980-2009 heat intensity
//                         (/ 0.80 for gas); condensing furnace: q (1/0.80 - 1/0.99); LED tubes: 63.1 W - 27.4 W x
//                         5,082/3,686 (equal light) x 3,541 h. The measures A18 also prices (water heaters, furnaces,
//                         weatherization, the heat pump's cost) use A18's sources and values; the heat pump's cost is read
//                         from e0.json (SB0's and A18's figure). Yearly extras (upkeep, a furnace fan's electricity at the
//                         homes' price) are added to C x CRF.
//   the curve             blocks sorted by CSE (ties by key), each as wide as the city's MWh saved a year (units x dE).
//   electrification       per district and representative day, MW: base + heat' x (res' + hp'/COP(T_h)) + EV_h, with
//                         heat' = heat x (1 - env x weatherization's cut x pre-1980 home heat / all heat), res' = res (1 - x),
//                         hp' = hp + res x + (gas + propane) g; EVs: the 2025 MWh per EV a day x vehicles x EV share, by
//                         rule: as today (the evening profile), a timer (00:00-06:00 evenly) or filling the valleys
//                         (the lowest hours raised to one level). With every setting at 2025's, the peaks are the file's.
//   district heat         a share d of the core's gas and propane heat goes to a network: sent = heat / (1 - losses);
//                         plant electricity = sent / COP(source); with a store the plant runs flat all day; store size =
//                         max - min of the running sum of (sent - its daily mean); water volume = MWh / (c_p dT rho).
//   industry              electricity = low band / COP + medium band / 0.98 + high band / 0.98 (the ceiling of full
//                         electrification), and the fertilizer plant's electrolysis equivalent from prairie-city.json.
// Every number on the page comes from this model or the data files; _tests/learn/test_a15-efficiency-electrification.js
// checks them, and every feedback line over its whole input range.
//
// Shared components: LX.StepCards, LX.Plot, LX.Predict, LX.Slider, LX.UnitChain, LX.CardSort, LX.CompareTable,
// LX.CausalChain, LX.Boundary, LX.lessonRefHTML, LX.demo. Lesson-local: the curve's measure buttons, the district bars.
(function () {
  "use strict";
  var KEY = "a15_efficiency_electrification";
  var LINE = null;   // the fictional line, read from prairie-city.json (about.line)

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function mid(r) { return Array.isArray(r) ? (r[0] + r[1]) / 2 : r; }
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return fmtN(100 * v, d) + "%"; }
  function usd(v, d) { return (v < 0 ? "−$" : "$") + fmtN(Math.abs(v), d); }
  function hm(h) { return (h < 10 ? "0" : "") + h + ":00"; }
  function num(v, d) { return fmtN(v, d).replace(/^-/, "−"); }   // a real minus sign
  function toY(D, v, y) { return v * D.deflator.index["2025"] / D.deflator.index[String(y)]; }
  function crf(r, n) { if (!(r > 0)) return 1 / n; var q = Math.pow(1 + r, n); return r * q / (q - 1); }
  function cop(C, T) { var c = C.cop, k = c.anchorCOP * (c.supplyC - c.anchorC); return T >= c.cutoutC ? k / (c.supplyC - T) : 1; }
  function dhrs(C, T) { return Math.max(0, C.heatModel.balanceC - T); }
  // the seasonal COP over the representative days, heat-weighted (one weather, so the same in every district)
  function scop(C) {
    var q = 0, e = 0;
    C.days.forEach(function (d) { d.temp.forEach(function (T) { q += d.weight * dhrs(C, T); e += d.weight * dhrs(C, T) / cop(C, T); }); });
    return q / e;
  }
  function prices(C) {   // $ per MWh of the carrier, 2025 Kansas
    return { residential: C.prices.electricityCentsPerKWh.residential * 10, commercial: C.prices.electricityCentsPerKWh.commercial * 10,
             gas: C.prices.gasPerMMBtu.residential / C.units.mwhPerMMBtu };
  }
  function priceOf(C, m) { var P = prices(C); return m.carrier === "gas" ? P.gas : P[m.price]; }
  // a district's average home: heat a year, hot water delivered, its pre-1980 share and a pre-1980 home's heat (MWh)
  function homeOf(C, d) {
    var H = d.households, hw = 0;
    Object.keys(d.dwellings).forEach(function (k) { hw += d.dwellings[k] * C.dwellingTypes[k].hotWaterFactor; });
    return { H: H, heat: d.heat.residentialMWh / H, wh: C.homes.recsWNC.waterHeatGasMMBtu * C.units.mwhPerMMBtu * C.homes.gasWaterHeaterEfficiency * hw / H,
             pre: d.envelope.pre1980, preHeat: d.heatedFloorM2 / H * C.vintages.pre1980.heatKWhPerM2 / 1000 };
  }
  // the heat pump's cost is SB0's and A18's figure, read from e0.json: link(D, e0) once, before any measure is priced
  function link(D, e0) { D.e0hpCapex = e0.home.hp.high.capex; D.e0hpYear = e0.home.hp.capexYear; return D; }
  function cost22(D, v) { if (v === "e0") { if (!(D.e0hpCapex > 0) || D.e0hpYear !== 2022) throw new Error("A15: link(D, e0) first"); return D.e0hpCapex; } return mid(v); }
  function unitCost(D, m) {   // 2025 $ per unit, up front
    if (m.key === "led") { var c = m.cost2022; return toY(D, (c.lamps + c.laborHours * c.laborRate) * m.t8Lumens / m.ledLumens, 2022); }
    if (m.cost2008) return toY(D, m.cost2008, 2008);
    return toY(D, cost22(D, m.cost2022.efficient) - cost22(D, m.cost2022.standard), 2022);
  }
  function extraYear(C, D, m) {   // 2025 $ a year on top of C x CRF: extra upkeep, and a fan's extra electricity at the homes' price
    var x = 0;
    if (m.upkeep2022) x += toY(D, m.upkeep2022.efficient - m.upkeep2022.standard, 2022);
    if (m.fanKWh) x += (m.fanKWh.efficient - m.fanKWh.standard) / 1000 * prices(C).residential;
    return x;
  }
  function weatherCut(C) { var v = C.vintages; return (v.pre1980.heatKWhPerM2 - v.y1980_2009.heatKWhPerM2) / v.pre1980.heatKWhPerM2; }
  function lifeOf(m) { return m.key === "led" ? m.lifeHours / m.hoursPerYear : m.life; }
  function unitsAndSave(C, D, m) {   // units across the city, and MWh saved a year before rebound
    var units = 0, save = 0, sc = scop(C), eff = C.homes.furnaceEfficiency, cut = weatherCut(C);
    C.districts.forEach(function (d) {
      var h = homeOf(C, d), n = 0, s = 0;
      if (m.key === "led") { n = d.commercialM2 * D.lighting.shareFluorescent / D.lighting.m2PerFixture; s = (m.t8Watts - m.ledWatts * m.t8Lumens / m.ledLumens) * m.hoursPerYear / 1e6; }
      else if (m.key === "hpwh") { n = d.heating.resistance + d.heating.heatPump; s = h.wh * (1 / m.baseUEF - 1 / m.uef); }
      else if (m.key === "hp") { n = d.heating.resistance; s = h.heat * (1 - 1 / sc); }
      else if (m.key === "weatherEl") { n = d.heating.resistance * h.pre; s = h.preHeat * cut; }
      else if (m.key === "condensing") { n = d.heating.gas; s = h.heat * (1 / eff - 1 / m.afue); }
      else if (m.key === "weatherGas") { n = d.heating.gas * h.pre; s = h.preHeat * cut / eff; }
      units += n; save += n * s;
    });
    return { units: units, save: save };
  }
  function measure(C, D, m, S) {
    var u = unitsAndSave(C, D, m), cost = unitCost(D, m), life = lifeOf(m), rb = m.household ? S.rebound : 0;
    var perUnit = u.save / u.units, net = perUnit * (1 - rb), extra = extraYear(C, D, m), ann = cost * crf(S.rate, life) + extra, P = priceOf(C, m);
    return { key: m.key, m: m, label: m.label, short: m.short, carrier: m.carrier, units: u.units, perUnit: perUnit, net: net, cost: cost, life: life,
             crf: crf(S.rate, life), extra: extra, annual: ann, cse: ann / net, mwh: u.units * net, price: P, pays: ann / net < P, household: m.household };
  }
  function curve(C, D, S, carrier) {
    var list = D.measures.filter(function (m) { return m.carrier === carrier; }).map(function (m) { return measure(C, D, m, S); });
    list.sort(function (a, b) { return a.cse - b.cse || (a.key < b.key ? -1 : 1); });
    var x = 0; list.forEach(function (b, i) { b.n = i + 1; b.x0 = x; x += b.mwh; b.x1 = x; });
    return list;
  }
  function paying(list) { return list.filter(function (b) { return b.pays; }); }
  function payMWh(list) { return sum(paying(list).map(function (b) { return b.mwh; })); }

  // ---- electrification: one district on one representative day (MW, hour h = h:00 to h+1:00)
  function evSplit(load, E, rule, M) {   // hourly EV charging by rule; load = the district without EVs
    if (rule === "timer") return load.map(function (v, h) { return M.indexOf(h) >= 0 ? E / M.length : 0; });
    if (rule === "fill") {   // the lowest hours raised to one level L: sum of max(0, L - load) = E
      var s = load.slice().sort(function (a, b) { return a - b; }), acc = 0, L = s[0];
      for (var i = 0; i < s.length; i++) {
        var next = i + 1 < s.length ? s[i + 1] : Infinity, room = (i + 1) * (next - s[i]);
        if (acc + room >= E) { L = s[i] + (E - acc) / (i + 1); break; }
        acc += room;
      }
      return load.map(function (v) { return Math.max(0, L - v); });
    }
    return null;
  }
  function districtDay(C, D, k, day, s) {
    s = s || {};
    var d = C.districts[k], dd = day.districts[d.key], sh = d.heat.share, g = s.gas || 0, x = s.res || 0, env = s.env || 0;
    var preHeat = d.heatedFloorM2 * d.envelope.pre1980 * C.vintages.pre1980.heatKWhPerM2 / 1000;
    var cut = 1 - env * weatherCut(C) * preHeat / (d.heat.residentialMWh + d.heat.commercialMWh);
    var fuel = sh.gas + sh.propane, net = s.dh ? s.dh.share : 0;
    var res = sh.resistance * (1 - x), hp = sh.heatPump + sh.resistance * x + fuel * (1 - net) * g;
    var heat = dd.heat.map(function (q) { return q * cut; });
    var hel = heat.map(function (q, h) { return q * (res + hp / cop(C, day.temp[h])); });
    var dhEl = heat.map(function () { return 0; }), store = 0, sent = null;
    if (s.dh && net > 0) {   // the network's share of the fuel heat (s.dh.mode: "hp" individual, "plant", "store")
      var Hd = heat.map(function (q) { return q * fuel * net; }), DH = D.districtHeat;
      if (s.dh.mode === "hp") dhEl = Hd.map(function (q, h) { return q / cop(C, day.temp[h]); });
      else {
        sent = Hd.map(function (q) { return q / (1 - DH.lossShare); });
        var cs = cop(C, DH.sourceC), mean = sum(sent) / sent.length;
        dhEl = s.dh.mode === "store" ? sent.map(function () { return mean / cs; }) : sent.map(function (q) { return q / cs; });
        if (s.dh.mode === "store") { var run = 0, hi = 0, lo = 0; sent.forEach(function (q) { run += q - mean; hi = Math.max(hi, run); lo = Math.min(lo, run); }); store = hi - lo; }
      }
    }
    var perEV = d.evMWhPerDay / d.evs, share = s.ev == null ? d.evs / d.lightDutyVehicles : s.ev, E = perEV * d.lightDutyVehicles * share;
    var pre = dd.base.map(function (b, h) { return b + hel[h] + dhEl[h]; });
    var ev = evSplit(pre, E, s.rule, D.electrify.managedHours) || C.transport.evProfile.map(function (p) { return E * p; });
    var tot = pre.map(function (v, h) { return v + ev[h]; });
    var pk = 0; tot.forEach(function (v, h) { if (v > tot[pk] + 1e-9) pk = h; });
    return { key: d.key, label: d.label, base: dd.base.slice(), heat: heat, hel: hel, dhEl: dhEl, ev: ev, tot: tot, peak: tot[pk], hour: pk,
             limit: d.substationMW, energy: sum(tot), evDay: E, store: store, sent: sent };
  }
  function design(C) { return C.days.filter(function (d) { return d.design; })[0]; }
  function dayByKey(C, key) { return C.days.filter(function (d) { return d.key === key; })[0]; }
  function yearMWh(C, D, k, s) { return sum(C.days.map(function (day) { return day.weight * districtDay(C, D, k, day, s).energy; })); }
  function yearPeak(C, D, k, s) { var p = 0; C.days.forEach(function (day) { p = Math.max(p, districtDay(C, D, k, day, s).peak); }); return p; }
  // the whole city on the design day: each district's peak, and the coincident peak (the sum, hour by hour)
  function city(C, D, S) {
    var day = design(C), parts = C.districts.map(function (d, k) { return districtDay(C, D, k, day, S[d.key] || {}); });
    var tot = parts[0].tot.map(function (v, h) { return sum(parts.map(function (p) { return p.tot[h]; })); });
    var pk = 0; tot.forEach(function (v, h) { if (v > tot[pk] + 1e-9) pk = h; });
    return { parts: parts, tot: tot, peak: tot[pk], hour: pk, sumPeaks: sum(parts.map(function (p) { return p.peak; })), over: parts.filter(function (p) { return p.peak > p.limit; }) };
  }
  function storeM3(D, mwh) { var w = D.water; return mwh * 3.6e9 / (w.cp * 1000 * D.districtHeat.deltaK * w.rho); }
  // ---- industry: the electricity full electrification would need (a ceiling)
  function industry(C, D, copV) {
    var b = {}; C.industry.processHeat.forEach(function (x) { b[x.band] = x.deliveredMWh; });
    var I = D.industry, el = { low: b.low / copV, medium: b.medium / I.boilerEff, high: b.high / I.ovenEff };
    var heatEl = el.low + el.medium + el.high, h2 = C.industry.fertilizer.electrolysisEquivalentMWh;
    return { bands: b, el: el, heatEl: heatEl, h2: h2, total: heatEl + h2, mwFlat: (heatEl + h2) / 8760, share: (heatEl + h2) / C.annual.electricityMWh,
             gasNow: C.industry.food.gasMMBtu * C.units.mwhPerMMBtu };
  }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  function M_(D, key) { return D.measures.filter(function (m) { return m.key === key; })[0]; }
  function fmtCSE(v) { return usd(v, 1) + " per MWh"; }
  function stepTexts(C, D) {
    var core = C.districts[0], dd = design(C);
    return [
      "Treat a saving like a power plant: what does a saved MWh cost? A [[heat-pump-water-heater|heat-pump water heater]] costs more, then uses less electricity for " + fmtN(M_(D, "hpwh").life, 1) + " years. Is its saved MWh cheaper than a bought one?",
      "Now every electricity measure for Prairie City's buildings, cheapest first: a [[cost-of-saved-energy|cost-of-saved-energy]] curve. Each block is as wide as the MWh it saves a year and as tall as the cost of each. Open three blocks.",
      "Most homes here heat with gas, and gas is cheap: " + usd(prices(C).gas, 1) + " per MWh in 2025, against " + usd(prices(C).residential, 1) + " for electricity. Switch to the gas curve: which measures still beat their price?",
      "Engineering savings assume nothing else changes. Add a [[rebound-effect|rebound]], homes kept a little warmer once heat is cheaper, and change the discount rate. Which blocks cross their price?",
      "Now electrify: the dense core's [[substation|substation]] can carry " + core.substationMW + " MW. On the cold [[design-day|design day]], " + num(dd.tmin) + " °C before dawn, its gas furnaces become heat pumps. Will the peak fit?",
      "Efficiency first: insulate and seal the core's older homes, and swap its resistance heaters for heat pumps. How far does the design day's peak come down?",
      "Cars next, in the suburbs: set the share of electric cars (" + pct(C.transport.evShare2025, 1) + " in 2025) and choose when they charge. Which charging rule keeps the cold day's peak lowest?",
      "District by district: each has its own substation, and the city's peak is their sum, hour by hour. Electrify all three and compare each [[coincident-peak|peak]] with its limit.",
      "A heat network for the core instead: one large heat pump on a steady " + fmtN(D.districtHeat.sourceC) + " °C source, with a hot-water [[thermal-storage|store]]. Compare it with heat pumps in every building.",
      "Industry last: the park's [[process-heat|process heat]] by temperature. Sort each band to the electric option that can reach it, then see the electricity full electrification would need."
    ];
  }
  var Q1 = { options: [{ value: "cheaper", label: "Cheaper than buying" }, { value: "same", label: "About the same" }, { value: "dearer", label: "Dearer than buying" }] };
  function q1(C, D, S) {   // the prediction of step 1: its answer and feedback follow the model at the reader's rate
    var b = measure(C, D, M_(D, "hpwh"), { rate: S.rate, rebound: 0 }), ratio = b.cse / b.price;
    var answer = ratio < 0.8 ? "cheaper" : ratio > 1.25 ? "dearer" : "same";
    var tail = " " + fmtCSE(b.cse) + " saved against " + fmtCSE(b.price) + " bought.";
    return { answer: answer, feedback: { cheaper: (answer === "cheaper" ? "Yes, much cheaper:" : "Not here:") + tail, same: (answer === "same" ? "Close:" : "Not close:") + tail, dearer: (answer === "dearer" ? "Yes, dearer:" : "No, cheaper:") + tail } };
  }
  function chain1(C, D, S) {
    var b = measure(C, D, M_(D, "hpwh"), { rate: S.rate, rebound: 0 });
    return [{ v: usd(b.cost), u: "extra, 2025 $" }, { op: "× " + fmtN(b.crf, 3) + " (" + pct(S.rate) + ", " + fmtN(b.life, 1) + " years) =" }, { v: usd(b.annual, 1), u: "a year" },
            { op: "÷ " + fmtN(b.perUnit, 2) + " MWh saved a year =" }, { v: usd(b.cse, 1), u: "per MWh saved", out: true }];
  }
  function line1(C, D, S) {
    var b = measure(C, D, M_(D, "hpwh"), { rate: S.rate, rebound: 0 });
    return "At " + pct(S.rate) + " a saved MWh costs **" + usd(b.cse, 1) + "**, " + (b.pays ? "below" : "above") + " the " + usd(b.price, 1) + " a home pays per MWh bought (2025).";
  }
  function blockLine(b) {
    return "**" + b.n + ". " + b.label + "**: " + fmtN(b.units) + " units, " + fmtN(b.net, 2) + " MWh saved a year each, " + usd(b.cost) + (b.m.basis === "replacement" ? " extra" : "") + " up front" + (b.extra > 0.005 ? " and " + usd(b.extra) + " a year" : "") + ", " + fmtN(b.life, 1) + " years: " +
      fmtCSE(b.cse) + ", " + (b.pays ? "below" : "above") + " its " + usd(b.price, 1) + " price.";
  }
  function curveSaw(list, carrier) {
    var pay = paying(list), all = sum(list.map(function (b) { return b.mwh; }));
    return fmtN(pay.length) + " of " + fmtN(list.length) + " " + (carrier === "gas" ? "gas" : "electricity") + " blocks cost less than the energy they save: **" + fmtN(payMWh(list)) + " of " + fmtN(all) + " MWh** a year.";
  }
  function reboundLine(C, D, S) {
    var a = curve(C, D, S, "el"), g = curve(C, D, S, "gas"), above = a.concat(g).filter(function (b) { return !b.pays; });
    var head = "At " + pct(S.rate) + " and " + pct(S.rebound) + " rebound, ";
    return head + (above.length ? "above their price: " + above.map(function (b) { return b.short; }).join(", ") + "." : "every block stays below its price.") +
      " Paying savings: " + fmtN(payMWh(a)) + " MWh of electricity, " + fmtN(payMWh(g)) + " MWh of gas a year.";
  }
  function peakLine(r, label) {
    var over = r.peak - r.limit;
    return label + ": the peak is **" + fmtN(r.peak, 1) + " MW** at " + hm(r.hour) + ", " + (over > 0 ? fmtN(over, 1) + " MW over" : fmtN(-over, 1) + " MW under") + " the " + r.limit + " MW substation.";
  }
  function annualVsPeak(C, D, k, s) {   // what electrification does to the year's MWh and the design day's peak
    var y0 = yearMWh(C, D, k, {}), y1 = yearMWh(C, D, k, s), p0 = districtDay(C, D, k, design(C), {}).peak, p1 = districtDay(C, D, k, design(C), s).peak;
    return { y0: y0, y1: y1, dy: y1 / y0 - 1, p0: p0, p1: p1, dp: p1 / p0 - 1 };
  }
  function avpLine(a) {
    if (Math.abs(a.y1 - a.y0) < 0.5 && Math.abs(a.p1 - a.p0) < 0.05) return "Nothing switched yet: the district's year and its design-day peak are 2025's.";
    return "Over the year (eight representative days) the district uses " + pct(Math.abs(a.dy)) + (a.dy >= 0 ? " more" : " less") + " electricity; on the design day its peak is " + pct(Math.abs(a.dp)) + (a.dp >= 0 ? " higher." : " lower.");
  }
  function evLine(r, rule) {
    var names = { evening: "As today", timer: "With a timer at midnight", fill: "Filling the valleys" };
    return names[rule] + ": " + fmtN(r.evDay, 1) + " MWh of charging a day; the design day's peak is **" + fmtN(r.peak, 1) + " MW** at " + hm(r.hour) + " (limit " + r.limit + " MW).";
  }
  function evSaw(rs) {   // rs: {evening, timer, fill} results at the reader's share
    var keys = ["evening", "timer", "fill"], best = keys.slice().sort(function (a, b) { return rs[a].peak - rs[b].peak || keys.indexOf(a) - keys.indexOf(b); })[0];
    var names = { evening: "charging as today", timer: "the midnight timer", fill: "filling the valleys" };
    return "Lowest peak: **" + names[best] + "**, " + fmtN(rs[best].peak, 1) + " MW. The timer puts charging on the coldest hours: " + fmtN(rs.timer.peak, 1) + " MW against " + fmtN(rs.evening.peak, 1) + " MW as today.";
  }
  function together(R) { return R.sumPeaks - R.peak <= 0.005 * R.sumPeaks; }
  function cityLine(R) {
    return "City peak **" + fmtN(R.peak, 1) + " MW** at " + hm(R.hour) + (together(R) ? ", almost the sum of the districts' own peaks (" + fmtN(R.sumPeaks, 1) + " MW): one cold night hits every district at once. "
      : ", " + fmtN(R.sumPeaks - R.peak, 1) + " MW below the sum of the districts' own peaks, which fall at different hours. ") +
      (R.over.length ? "Over their limits: " + R.over.map(function (p) { return p.label.toLowerCase(); }).join(", ") + "." : "Every district fits its limit.");
  }
  function gasSaw(list) {
    var no = list.filter(function (b) { return !b.pays; });
    return "Cheap gas sets a low bar: a gas saving must cost under " + usd(list[0].price, 1) + " per MWh. " + (no.length ? "Above it: " + no.map(function (b) { return b.short.toLowerCase(); }).join(", ") + "." : "Every gas block clears it at your settings.");
  }
  function dhLine(D, r, mode) {
    var t = { hp: "Heat pumps in every building", plant: "A network without a store", store: "A network with a store" }[mode];
    return t + ": the core's peak is **" + fmtN(r.peak, 1) + " MW** at " + hm(r.hour) + (mode === "store" ? "; the store holds " + fmtN(r.store, 0) + " MWh of heat, about " + fmtN(Math.round(storeM3(D, r.store) / 100) * 100) + " m³ of hot water." : ".");
  }
  function dhSaw(a, b, c) {   // a: heat pumps everywhere, b: network without a store, c: with its store
    var head = "Design-day peak: " + fmtN(a.peak, 1) + " MW with heat pumps everywhere, " + fmtN(b.peak, 1) + " MW with the network, **" + fmtN(c.peak, 1) + " MW** with its store. ";
    if (a.peak - c.peak < 0.05) return head + "With so little heat on the network, the three are about the same.";
    return head + (b.peak < a.peak - 0.05 ? "The steady source cuts the peak" + (c.peak < b.peak - 0.05 ? ", and the store cuts it further." : "; the store adds little here.") : "Here the store does the cutting.");
  }
  function indLine(C, D, copV) {
    var I = industry(C, D, copV);
    return "At a heat-pump COP of " + fmtN(copV, 1) + ", the process heat would need " + fmtN(I.heatEl / 1000, 1) + " GWh a year and the plant's hydrogen " + fmtN(I.h2 / 1000, 1) + " GWh: **" + pct(I.share) + "** of the city's 2025 electricity, a steady " + fmtN(I.mwFlat, 1) + " MW.";
  }

  // the no-JS block: the curves at the defaults, the core's design day, the districts, the industry ceiling
  function staticFallback(C, D) {
    var S = { rate: D.rate.start, rebound: 0 }, e = curve(C, D, S, "el"), g = curve(C, D, S, "gas"), dd = design(C);
    var row = function (b) { return "<tr><td>" + b.label + "</td><td>" + usd(b.cost) + "</td><td>" + fmtN(b.life, 1) + "</td><td>" + fmtN(b.mwh) + "</td><td>" + usd(b.cse, 1) + "</td><td>" + usd(b.price, 1) + "</td></tr>"; };
    var core = [0, 0.5, 1].map(function (gv) { return districtDay(C, D, 0, dd, { gas: gv }); });
    var all = districtDay(C, D, 0, dd, { gas: 1, res: 1, env: 1 }), I = industry(C, D, D.industry.cop.start);
    return "<p class=\"lx-eyebrow\">Prairie City's buildings: the cost of saved energy at a " + pct(S.rate) + " discount rate (2025 dollars)</p>" +
      "<p class=\"lx-hint\">" + LINE + "</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a15-fbt\"><thead><tr><th scope=\"col\">Measure</th><th scope=\"col\">Cost per unit</th><th scope=\"col\">Life (years)</th><th scope=\"col\">MWh saved a year</th><th scope=\"col\">Per MWh saved</th><th scope=\"col\">Price it competes with</th></tr></thead><tbody>" +
      e.map(row).join("") + g.map(row).join("") + "</tbody></table></div>" +
      "<ul>" +
      "<li><b>Electricity.</b> " + curveSaw(e, "el").replace(/\*\*/g, "") + "</li>" +
      "<li><b>Gas.</b> " + curveSaw(g, "gas").replace(/\*\*/g, "") + "</li>" +
      "<li><b>The core on the design day.</b> " + core.map(function (r, i) { return ["As in 2025", "Half the gas heat to heat pumps", "All of it"][i] + ": " + fmtN(r.peak, 1) + " MW"; }).join("; ") + ", against a " + C.districts[0].substationMW + " MW substation.</li>" +
      "<li><b>Efficiency first.</b> With every older home sealed and insulated and every resistance heater swapped too, the all-electric core peaks at " + fmtN(all.peak, 1) + " MW.</li>" +
      "<li><b>Industry.</b> Full electrification of the park's process heat and hydrogen would need " + pct(I.share) + " of the city's 2025 electricity (a ceiling, at a heat-pump COP of " + fmtN(D.industry.cop.start, 1) + ").</li>" +
      "</ul><p class=\"lx-hint\">With JavaScript on, you build the curve, add a rebound, electrify each district on the cold design day, try charging rules and a heat network, and sort the park's heat.</p>";
  }
  // the explain layer's no-JS ideas, and the Check section's myths and question (written into the page by the test)
  function ideasHTML(C, D) {
    var S = { rate: D.rate.start, rebound: 0 }, e = curve(C, D, S, "el"), a = annualVsPeak(C, D, 0, { gas: 1 }), dd = design(C);
    return "<dl class=\"lx-ideas\">" +
      "<dt>Efficiency as a resource</dt><dd>A saved MWh has a cost: the extra cost spread over the life with the capital recovery factor, divided by the MWh saved a year.</dd>" +
      "<dt>The curve</dt><dd>Sorted cheapest first, " + fmtN(paying(e).length) + " of " + fmtN(e.length) + " electricity measures for Prairie City's buildings cost less than the electricity they save (6%, no rebound).</dd>" +
      "<dt>Rebound</dt><dd>Part of a saving comes back as more comfort; it raises the cost per MWh actually saved.</dd>" +
      "<dt>Peaks, not MWh</dt><dd>All the core's gas heat on heat pumps adds " + pct(a.dy) + " to its year's electricity but " + pct(a.dp) + " to its design-day peak, at " + num(dd.tmin) + " °C.</dd>" +
      "<dt>Industry by temperature</dt><dd>Low-temperature heat suits heat pumps; steam, ovens and hydrogen need other electric routes.</dd></dl>";
  }
  function checkHTML(C, D) {
    var S = { rate: D.rate.start, rebound: 0 }, dd = design(C), full = districtDay(C, D, 0, dd, { gas: 1 }), base = districtDay(C, D, 0, dd, {}), a = annualVsPeak(C, D, 0, { gas: 1 });
    var ev = {}; ["evening", "timer"].forEach(function (k) { ev[k] = districtDay(C, D, 1, dd, { ev: 0.3, rule: k }); });
    var wg = measure(C, D, M_(D, "weatherGas"), S), cc = D.coldClimate.cop;
    var q = function (id, ans, text, ansText) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"" + ans + "\"><p class=\"lx-qtext\">Myth or fact? “" + text + "”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + ansText + "</p></details></div>"; };
    var x = 40, rb = 0.25, y = r2(x / (1 - rb), 2);
    return "<div class=\"lx-myths\" data-quiz=\"a15-myth\">" +
      q("kwh", "myth", "Electrifying heat only adds kilowatt-hours over the year.", "Myth. The core's gas heat on heat pumps adds " + pct(a.dy) + " to its year's electricity but " + pct(a.dp) + " to its design-day peak: " + fmtN(base.peak, 1) + " to " + fmtN(full.peak, 1) + " MW.") +
      q("cold", "myth", "Heat pumps stop working in a cold snap.", "Myth. ENERGY STAR's cold-climate criteria ask for a COP of at least " + fmtN(cc, 2) + " at " + num(D.coldClimate.atC) + " °C (" + D.coldClimate.atF + " °F); this lesson's curve gives " + fmtN(cop(C, dd.tmin), 2) + " at " + num(dd.tmin) + " °C. Efficiency falls, so peaks grow.") +
      q("timer", "myth", "Charging cars after midnight always eases the grid.", "Myth. On the design day a midnight timer puts the suburbs' charging on the coldest hours: " + fmtN(ev.timer.peak, 1) + " MW against " + fmtN(ev.evening.peak, 1) + " MW as today, with 30% electric cars.") +
      q("pays", "myth", "Every efficiency measure pays for itself.", "Myth. Weatherizing an older gas-heated home saves gas at " + usd(wg.cse, 1) + " per MWh at 6%, " + (wg.pays ? "below" : "above") + " the " + usd(wg.price, 1) + " a home pays for gas; its other gains, comfort and a lower peak, are not in that number.") +
      "</div><div class=\"lx-quiz\" data-quiz=\"a15\"><div class=\"lx-qq\" data-id=\"rebound\" data-answer=\"b\"><p class=\"lx-qtext\">A measure saves energy at $" + x + " per MWh with no rebound. With a 25% rebound, what does a saved MWh cost?</p>" +
      "<ul class=\"lx-choices\"><li data-value=\"a\">$30.00</li><li data-value=\"b\">$" + fmtN(y, 2) + "</li><li data-value=\"c\">$50.00</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>$" + x + " ÷ (1 − 0.25) = $" + fmtN(y, 2) + ": the cost is the same, the MWh saved are a quarter fewer.</p></details></div></div>";
  }
  // numbers to remember and the sources list (from the data files)
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function factsHTML(D) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      D.facts.map(function (f) { return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + "</td><td class=\"s\"><a href=\"" + esc(f.url) + "\">" + esc(f.source) + "</a> · " + esc(f.asof) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  var CITY_SRC = ["eia-epa-2-10", "eia-ng-ks", "doe-cchp", "eia-recs-wnc", "doe-efficiency", "noaa-normals", "eia-930", "afdc-ks"];
  function srcItem(s) {
    var via = function (x) { return x.replace(/ \(via [^)]*\)/g, ""); }, s0 = s;
    s = { title: s0.title, publisher: s0.publisher, url: s0.url, date: via(s0.date), where: via(s0.where) };
    var t = s.url && s.url !== "no link" ? "<a href=\"" + esc(s.url) + "\">" + esc(s.title) + "</a>" : esc(s.title);
    return "<li>" + esc(s.publisher) + ". " + t + ". " + esc(s.date.charAt(0).toUpperCase() + s.date.slice(1)) + ". " + esc(s.where.charAt(0).toUpperCase() + s.where.slice(1)) + ".</li>";
  }
  function sourcesHTML(C, D) {
    return "<p class=\"lx-hint\">This lesson's measures and settings:</p><ul>" + Object.keys(D.sources).map(function (k) { return srcItem(D.sources[k]); }).join("") + "</ul>" +
      "<p class=\"lx-hint\">Prairie City's data (shared by the city lessons), the parts used here:</p><ul>" + CITY_SRC.map(function (k) { return srcItem(C.sources[k]); }).join("") + "</ul>";
  }
  // the practice set (Check section; the test writes it into the page and recomputes every answer)
  function r2(v, d) { var m = Math.pow(10, d); return Math.round(v * m) / m; }
  function cseByHand(b) {   // the worked sum with the numbers as shown: cost (cents), CRF (4 places), yearly extras, saving (2 places)
    var cost = r2(b.cost, 2), f = r2(b.crf, 4), cap = r2(cost * f, 2), x = r2(b.extra, 2), ann = r2(cap + x, 2), save = r2(b.perUnit, 3);
    return { cost: cost, crf: f, cap: cap, extra: x, annual: ann, save: save, cse: r2(ann / save, 2) };
  }
  function practice(C, D) {
    var S = { rate: D.rate.start, rebound: 0 }, cf = measure(C, D, M_(D, "condensing"), S), eg = M_(D, "weatherEl");
    var x1 = cseByHand(cf), e3 = cseByHand(measure(C, D, eg, { rate: 0.03, rebound: 0 })), e10 = cseByHand(measure(C, D, eg, { rate: 0.1, rebound: 0 })), Pg = r2(cf.price, 2), Pe0 = r2(prices(C).residential, 2);
    var hp = cseByHand(measure(C, D, M_(D, "hp"), S)), hp20 = r2(hp.cse / 0.8, 2), Pe = r2(prices(C).residential, 2);
    var sc = r2(scop(C), 2), ae = cseByHand(measure(C, D, M_(D, "weatherEl"), S)), aeHP = r2(ae.cse * sc, 2);
    var dd = design(C), core = C.districts[0], k7 = 7, T = dd.temp[k7], sh = core.heat.share, fuel = sh.gas + sh.propane;
    var Q = dd.districts.core.heat[k7], B = dd.districts.core.base[k7], cp = r2(cop(C, T), 2), rs = r2(sh.resistance, 3), hs = r2(sh.heatPump + fuel * 0.5, 3);
    var hel = r2(Q * (rs + hs / cp), 1), evh = districtDay(C, D, 0, dd, {}).ev[k7], tot = r2(B + hel + evh, 1);
    var sub = districtDay(C, D, 1, dd, { ev: 0.3 }), sub0 = districtDay(C, D, 1, dd, {}), h19 = 19, Ed = r2(sub.evDay, 1), p19 = C.transport.evProfile[h19];
    var I = industry(C, D, 2.5);
    return [
      { t: "One measure by hand", q: "A condensing furnace costs " + usd(x1.cost, 2) + " more than a standard one, plus " + usd(x1.extra, 2) + " a year of upkeep and fan electricity; it lasts " + fmtN(cf.life, 1) + " years and saves " + fmtN(x1.save, 3) + " MWh of gas a year. At " + pct(S.rate) + ", what does a saved MWh cost?",
        a: "CRF = " + fmtN(x1.crf, 4) + "; " + usd(x1.cost, 2) + " × " + fmtN(x1.crf, 4) + " = " + usd(x1.cap, 2) + ", plus " + usd(x1.extra, 2) + " = " + usd(x1.annual, 2) + " a year; ÷ " + fmtN(x1.save, 3) + " MWh = " + usd(x1.cse, 2) + " per MWh, " + (x1.cse < Pg ? "under" : "over") + " gas at " + usd(Pg, 2) + ".",
        check: { cse: x1.cse, exact: cf.cse } },
      { t: "The discount rate decides", q: "Weatherizing an older home heated by resistance costs " + usd(e3.cost, 2) + ", lasts " + fmtN(eg.life) + " years and saves " + fmtN(e3.save, 3) + " MWh of electricity a year. Does it beat electricity at " + usd(Pe0, 2) + " per MWh at 3% and at 10%?",
        a: "At 3%: CRF " + fmtN(e3.crf, 4) + ", " + usd(e3.annual, 2) + " a year, " + usd(e3.cse, 2) + " per MWh: " + (e3.cse < Pe0 ? "yes" : "no") + ". At 10%: CRF " + fmtN(e10.crf, 4) + ", " + usd(e10.annual, 2) + ", " + usd(e10.cse, 2) + ": " + (e10.cse < Pe0 ? "yes" : "no") + ". Near the price, the rate decides.",
        check: { r3: e3.cse, r10: e10.cse } },
      { t: "Rebound", q: "A heat pump replacing resistance heat saves electricity at " + usd(hp.cse, 2) + " per MWh. With a 20% rebound, what does a saved MWh cost?",
        a: usd(hp.cse, 2) + " ÷ (1 − 0.20) = " + usd(hp20, 2) + " per MWh, " + (hp20 < Pe ? "still under" : "over") + " " + usd(Pe, 2) + ". Rebound shrinks the saving, not the cost.",
        check: { cse: hp20 } },
      { t: "Interactions", q: "Weatherization saves electricity in a resistance-heated home at " + usd(ae.cse, 2) + " per MWh. If a heat pump with a seasonal COP of " + fmtN(sc, 2) + " goes in first, what does its saved MWh cost?",
        a: "The heat pump already divides the heat's electricity by " + fmtN(sc, 2) + ", so weatherization saves that much less: " + usd(ae.cse, 2) + " × " + fmtN(sc, 2) + " = " + usd(aeHP, 2) + " per MWh, " + (aeHP < Pe ? "still under" : "now over") + " " + usd(Pe, 2) + ". Order matters.",
        check: { cse: aeHP } },
      { t: "A cold hour", q: "At " + hm(k7) + " on the design day (" + num(T, 1) + " °C, COP " + fmtN(cp, 2) + "), the core needs " + fmtN(Q, 1) + " MW of heat and " + fmtN(B, 1) + " MW of base load. Half its gas and propane heat goes to heat pumps. The hour's total?",
        a: "Heat-pump share " + fmtN(hs, 3) + ", resistance " + fmtN(rs, 3) + ": " + fmtN(Q, 1) + " × (" + fmtN(rs, 3) + " + " + fmtN(hs, 3) + " ÷ " + fmtN(cp, 2) + ") = " + fmtN(hel, 1) + " MW; plus " + fmtN(B, 1) + " MW base and " + fmtN(evh, 1) + " MW of cars: " + fmtN(tot, 1) + " MW, against " + core.substationMW + ".",
        check: { hel: hel, tot: tot, model: districtDay(C, D, 0, dd, { gas: 0.5 }).tot[k7] } },
      { t: "Evening chargers", q: "In the suburbs, 30% of cars become electric and charge as today: " + fmtN(Ed, 1) + " MWh a day. How much do they add at " + hm(h19) + ", when " + pct(p19) + " of a day's charging happens?",
        a: fmtN(Ed, 1) + " × " + fmtN(p19, 2) + " = " + fmtN(r2(Ed * p19, 1), 1) + " MW, against " + fmtN(sub0.ev[h19], 2) + " MW in 2025.",
        check: { mw: r2(Ed * p19, 1), model: sub.ev[h19] } },
      { t: "Industrial heat pump", q: "The park's heat below 100 °C is " + fmtN(I.bands.low) + " MWh a year. How much electricity would heat pumps at a COP of 2.5 need, as a steady MW?",
        a: fmtN(I.bands.low) + " ÷ 2.5 = " + fmtN(I.el.low) + " MWh a year; ÷ 8,760 h = " + fmtN(I.el.low / 8760, 1) + " MW.",
        check: { mwh: I.el.low } }
    ];
  }
  function practiceHTML(C, D) {
    var P = practice(C, D), mins = 30;
    return "<p class=\"lx-eyebrow\">Practice · about " + mins + " minutes on your own</p><ol class=\"lx-fb-practice\">" + P.map(function (p) {
      return "<li><p><b>" + p.t + ".</b> " + p.q + "</p><details class=\"lx-answer\"><summary>Answer</summary><p>" + p.a + "</p></details></li>";
    }).join("") + "</ol>";
  }

  var model = { crf: crf, cop: cop, scop: scop, prices: prices, priceOf: priceOf, homeOf: homeOf, unitCost: unitCost, extraYear: extraYear, weatherCut: weatherCut, link: link, lifeOf: lifeOf, unitsAndSave: unitsAndSave, measure: measure, curve: curve,
    paying: paying, payMWh: payMWh, evSplit: evSplit, districtDay: districtDay, design: design, dayByKey: dayByKey, yearMWh: yearMWh, yearPeak: yearPeak, city: city, storeM3: storeM3, industry: industry,
    stepTexts: stepTexts, Q1: Q1, q1: q1, chain1: chain1, line1: line1, blockLine: blockLine, curveSaw: curveSaw, reboundLine: reboundLine, peakLine: peakLine, annualVsPeak: annualVsPeak, avpLine: avpLine,
    evLine: evLine, evSaw: evSaw, cityLine: cityLine, together: together, dhSaw: dhSaw, gasSaw: gasSaw, num: num, dhLine: dhLine, indLine: indLine, staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, factsHTML: factsHTML, sourcesHTML: sourcesHTML, CITY_SRC: CITY_SRC, practice: practice, practiceHTML: practiceHTML,
    setLine: function (l) { LINE = l; }, fmtN: fmtN, pct: pct, usd: usd, hm: hm, toY: toY };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  var COL = { el: "var(--lx-bat)", gas: "var(--lx-cc)", base: "var(--lx-demand)", heat: "var(--lx-tier-4)", ev: "var(--lx-tier-5)", dh: "var(--lx-tier-3)", limit: "var(--lx-bad)" };
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  LX.mount("a15", function (live, data, root) {
    var C = data.prairie_city, D = link(data[KEY], data.e0), P = data.path;
    LINE = C.about.line;
    var texts = stepTexts(C, D), dd = design(C);
    var S = { rate: D.rate.start, rebound: D.rebound.start, carrier: "el",
      dist: { core: { gas: 0, res: 0, env: 0 }, suburbs: { gas: 0, res: 0, env: 0 }, fringe: { gas: 0, res: 0, env: 0 } }, rule: "evening", evShare: 0.3, dh: D.districtHeat.share.start, dhMode: "hp", cop: D.industry.cop.start };
    var saved = LX.store.get("a15");
    function inR(v, r) { return typeof v === "number" && v >= r.min - 1e-9 && v <= r.max + 1e-9; }
    if (saved) {
      if (inR(saved.rate, D.rate)) S.rate = saved.rate;
      if (inR(saved.rebound, D.rebound)) S.rebound = saved.rebound;
      if (saved.dist) Object.keys(S.dist).forEach(function (k) { var s = saved.dist[k]; if (!s) return; ["gas", "res", "env"].forEach(function (f) { if (inR(s[f], D.electrify[f])) S.dist[k][f] = s[f]; }); });
      if (inR(saved.evShare, D.electrify.ev)) S.evShare = saved.evShare;
      if (["evening", "timer", "fill"].indexOf(saved.rule) >= 0) S.rule = saved.rule;
      if (inR(saved.dh, D.districtHeat.share)) S.dh = saved.dh;
      if (inR(saved.cop, D.industry.cop)) S.cop = saved.cop;
    }
    function keep() { LX.store.set("a15", { rate: S.rate, rebound: S.rebound, dist: S.dist, evShare: S.evShare, rule: S.rule, dh: S.dh, cop: S.cop }); }
    function sOf(key) { var s = S.dist[key]; return { gas: s.gas, res: s.res, env: s.env, ev: key === "suburbs" ? S.evShare : null, rule: key === "suburbs" ? S.rule : "evening" }; }
    function allS() { var o = {}; Object.keys(S.dist).forEach(function (k) { o[k] = sOf(k); }); return o; }
    var demo = [];
    function chips(host, list) {
      host.innerHTML = "";
      list.forEach(function (x) { var c = H("div", { class: "lx-readout" + (x[2] ? " " + x[2] : "") }, host); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); });
    }
    function lineP(host, t) { host.innerHTML = bold(t); }
    function fictional(host) { H("p", { class: "lx-hint a15-fict", text: C.about.line }, host); }
    function slider(host, label, r, val, fmt, color, on) {
      return LX.Slider(host, { label: label, color: color || "var(--lx-accent)", min: r.min, max: r.max, step: r.step, value: val, fmt: fmt, onChange: on });
    }
    var pctF = function (v) { return pct(v); };

    // the cost-of-saved-energy curve, on LX.Plot: blocks, the prices they compete with, numbered marks
    function drawCurve(Pl, list, carrier) {
      var Pr = prices(C), xMax = Math.max(1, list.length ? list[list.length - 1].x1 : 1), top = Math.max.apply(null, list.map(function (b) { return Math.max(b.cse, b.price); }));
      var yMax = Math.ceil(top * 1.12 / 50) * 50, xStep = xMax > 400000 ? 100000 : xMax > 200000 ? 50000 : 25000, xt = [];
      for (var v = 0; v <= xMax; v += xStep) xt.push([v, fmtN(v / 1000) + (v === 0 ? "" : "k")]);
      var bars = [], marks = [];
      list.forEach(function (b) {
        bars.push({ x0: b.x0, x1: b.x1, y0: 0, y1: b.cse, color: COL[carrier], op: b.pays ? 0.8 : 0.3, rx: 0 });
        bars.push({ x0: b.x0, x1: b.x1, y0: b.price - yMax * 0.006, y1: b.price + yMax * 0.006, color: "var(--lx-ink)", op: 0.9, rx: 0 });
        marks.push({ x: (b.x0 + b.x1) / 2, y: b.cse, n: String(b.n), kind: "dot", pos: "above" });
      });
      // the price lines' words go in the legend: a label on the line would sit on the blocks
      var refs = carrier === "gas" ? [{ y: Pr.gas, dash: "5 4", color: "var(--lx-ink-3)" }]
        : [{ y: Pr.residential, dash: "5 4", color: "var(--lx-ink-3)" }, { y: Pr.commercial, dash: "2 3", color: "var(--lx-ink-3)" }];
      var priceLeg = carrier === "gas" ? [{ label: "Gas, homes: " + usd(Pr.gas, 1) + " per MWh", color: "var(--lx-ink-3)", dash: "5 4" }]
        : [{ label: "Electricity, homes: " + usd(Pr.residential, 1) + " per MWh", color: "var(--lx-ink-3)", dash: "5 4" }, { label: "Electricity, shops: " + usd(Pr.commercial, 1), color: "var(--lx-ink-3)", dash: "2 3" }];
      Pl.render({
        x: { min: 0, max: xMax, ticks: xt, ticksN: xt.filter(function (t, i) { return i % 2 === 0; }) },
        y: { min: 0, max: yMax, step: yMax > 300 ? 100 : 50, fmt: function (v) { return "$" + fmtN(v); }, unit: "$ per MWh saved" }, height: 260, heightN: 230,
        bars: bars, marks: marks, refs: refs,
        legend: [{ label: "Pays: below the price it competes with (block width: MWh saved a year)", color: COL[carrier] }, { label: "Each block's price (the tick across it)", color: "var(--lx-ink)" }].concat(priceLeg),
        tip: function (x) { var b = list.filter(function (q) { return x >= q.x0 && x <= q.x1; })[0]; return b ? "<div><b>" + b.n + ". " + LX.esc(b.short) + "</b></div><div>" + usd(b.cse, 1) + " per MWh · " + fmtN(b.mwh) + " MWh a year</div>" : null; },
        aria: "Cost-of-saved-energy curve for " + (carrier === "gas" ? "gas" : "electricity") + ": " + list.map(function (b) { return b.n + " " + b.short + " " + usd(b.cse, 0) + " per MWh"; }).join("; ") + ".",
        text: { head: ["#", "Measure", "MWh saved a year", "$ per MWh saved", "Price"], rows: list.map(function (b) { return [String(b.n), b.label, fmtN(b.mwh), usd(b.cse, 1), usd(b.price, 1)]; }) }
      });
    }
    // one district's design day as stacked hourly bars, with its substation's limit
    function drawDay(Pl, r, opts) {
      opts = opts || {};
      var bars = [], top = Math.max(r.limit, r.peak);
      r.tot.forEach(function (v, h) {
        var y = 0;
        [[r.base[h], COL.base], [r.hel[h], COL.heat], [r.dhEl[h], COL.dh], [r.ev[h], COL.ev]].forEach(function (p) {
          if (p[0] > 0) { bars.push({ x0: h + 0.08, x1: h + 0.92, y0: y, y1: y + p[0], color: p[1], op: 0.85, rx: 0 }); y += p[0]; }
        });
      });
      var yMax = Math.ceil(top * 1.15 / 50) * 50;
      var legend = [{ label: "Base load (SPP's shape, which carries some of the region's heating)", color: COL.base }, { label: "Heating electricity", color: COL.heat }];
      if (r.dhEl.some(function (v) { return v > 0; })) legend.push({ label: "Heat-network plant", color: COL.dh });
      legend.push({ label: "Electric cars", color: COL.ev }, { label: "Substation limit, " + r.limit + " MW", color: COL.limit, dash: "5 4" });
      Pl.render({
        x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [6, "6"], [12, "12"], [18, "18"], [24, "24 h"]] },
        y: { min: 0, max: yMax, step: yMax > 300 ? 100 : 50, fmt: function (v) { return fmtN(v); }, unit: "MW" }, height: 250, heightN: 220, bars: bars,
        refs: [{ y: r.limit, dash: "5 4", color: COL.limit }],   // its words are in the legend: a label here would sit on the bars
        marks: opts.marks || [{ x: r.hour + 0.5, y: r.peak, label: "Peak " + fmtN(r.peak, 1) + " MW", kind: "dot", pos: "above" }],
        legend: legend,
        aria: (opts.title || r.label) + " on the design day, hour by hour: peak " + fmtN(r.peak, 1) + " MW at " + hm(r.hour) + " against a " + r.limit + " MW limit.",
        text: { head: ["Hour", "Base", "Heating", "Network plant", "Cars", "Total (MW)"], rows: r.tot.map(function (v, h) { return [hm(h), fmtN(r.base[h], 1), fmtN(r.hel[h], 1), fmtN(r.dhEl[h], 1), fmtN(r.ev[h], 1), fmtN(v, 1)]; }) }
      });
    }
    function pickBlocks(host, list, onPick) {   // numbered buttons, one per block
      host.innerHTML = "";
      var seg = H("div", { class: "lx-seg a15-blocks", role: "group", "aria-label": "Measures on the curve" }, host);
      list.forEach(function (b) { var bt = H("button", { type: "button", "aria-pressed": "false", text: b.n + ". " + b.short }, seg); bt.addEventListener("click", function () { onPick(b, seg, bt); }); });
      return seg;
    }
    function press(seg, bt) { Array.prototype.forEach.call(seg.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", String(x === bt)); }); }

    var steps = [
      { text: texts[0], build: function (act, api) {
          var Q = q1(C, D, S);
          var pr = LX.Predict(act, { id: "a15-hpwh", q: "A saved MWh, against a bought one", title: false, answer: Q.answer, options: Q1.options, feedback: Q.feedback, onPick: function () { show(); } });
          var res = H("div", { class: "a15-res" }, act);
          function show() {
            res.innerHTML = ""; pr.reveal();
            var uc = LX.UnitChain(res, { label: "From the extra cost to a cost per saved MWh", steps: chain1(C, D, S) });
            var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, res);
            slider(res, "Real discount rate", D.rate, S.rate, pctF, "var(--lx-tier-2)", function (v) { S.rate = v; keep(); uc.set(chain1(C, D, S)); lineP(ln, line1(C, D, S)); buildExplain(); });
            H("p", { class: "lx-hint", text: "CRF, the capital recovery factor, turns a cost paid now into equal yearly payments over the life. LBNL uses 6% real." }, res);
            fictional(res); lineP(ln, line1(C, D, S)); api.done();
          }
          if (pr.picked()) show();
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelector(".lx-choice"); if (b) b.click(); } };
        } },
      { text: texts[1], build: function (act, api) {
          var list = curve(C, D, S, "el"), seen = {};
          var Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var bh = H("div", null, act), ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          fictional(act);
          drawCurve(Pl, list, "el");
          var seg = pickBlocks(bh, list, function (b, sg, bt) { press(sg, bt); seen[b.key] = true; lineP(ln, blockLine(b)); if (Object.keys(seen).length >= 3) { api.done(); api.saw(curveSaw(list, "el")); } });
          lineP(ln, "Tap a numbered block to read it.");
          H("p", { class: "lx-hint", text: "Assumed: each measure on its own; equipment at replacement costs only its extra over a standard choice; LED tubes counted at equal light; older homes spread evenly over heating fuels." }, act);
          demo[1] = function () { Array.prototype.slice.call(seg.querySelectorAll("button"), 0, 3).forEach(function (b) { b.click(); }); };
        } },
      { text: texts[2], build: function (act, api) {
          var seen = {}, Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var tabs = H("div", { class: "lx-seg", role: "group", "aria-label": "Which carrier" }, act), bh = H("div", null, act), ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), btn = {};
          act.insertBefore(tabs, act.firstChild);
          fictional(act);
          [["el", "Electricity saved"], ["gas", "Gas saved"]].forEach(function (t) { btn[t[0]] = H("button", { type: "button", text: t[1] }, tabs); btn[t[0]].addEventListener("click", function () { show(t[0]); }); });
          function show(k) {
            seen[k] = true; S.carrier = k; Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === k)); });
            var list = curve(C, D, S, k); drawCurve(Pl, list, k);
            pickBlocks(bh, list, function (b, sg, bt) { press(sg, bt); lineP(ln, blockLine(b)); });
            lineP(ln, curveSaw(list, k));
            if (seen.gas) { api.done(); api.saw(gasSaw(curve(C, D, S, "gas"))); }
          }
          show("gas");
          demo[2] = function () { show("el"); show("gas"); };
        } },
      { text: texts[3], build: function (act, api) {
          var tabs = H("div", { class: "lx-seg", role: "group", "aria-label": "Which carrier" }, act), btn = {};
          var Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          slider(act, "Rebound (homes' measures)", D.rebound, S.rebound, pctF, "var(--lx-warn)", function (v) { S.rebound = v; keep(); paint(); api.done(); });
          slider(act, "Real discount rate", D.rate, S.rate, pctF, "var(--lx-tier-2)", function (v) { S.rate = v; keep(); paint(); api.done(); });
          H("p", { class: "lx-hint", text: "A review of studies finds the direct rebound for household energy services in rich countries generally below 30% (Sorrell and others, 2009, abstract)." }, act);
          fictional(act);
          [["el", "Electricity"], ["gas", "Gas"]].forEach(function (t) { btn[t[0]] = H("button", { type: "button", text: t[1] }, tabs); btn[t[0]].addEventListener("click", function () { S.carrier = t[0]; paint(); }); });
          function paint() {
            Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === S.carrier)); });
            drawCurve(Pl, curve(C, D, S, S.carrier), S.carrier); lineP(ln, reboundLine(C, D, S)); buildExplain();
          }
          paint();
          if (S.rebound > 0) api.done();
          demo[3] = function () { S.rebound = 0.3; S.rate = 0.1; keep(); paint(); api.done(); };
        } },
      { text: texts[4], build: function (act, api) {
          var opts = [{ value: "fits", label: "It fits" }, { value: "over", label: "It goes over" }];
          var full = districtDay(C, D, 0, dd, { gas: 1 }), ans = full.peak > full.limit ? "over" : "fits";
          var fb = { fits: (ans === "fits" ? "Right" : "No") + ": with every furnace replaced the design day peaks at " + fmtN(full.peak, 1) + " MW against " + full.limit + " MW.",
                     over: (ans === "over" ? "Right" : "No") + ": with every furnace replaced the design day peaks at " + fmtN(full.peak, 1) + " MW against " + full.limit + " MW." };
          var sl5 = null;
          var pr = LX.Predict(act, { id: "a15-fit", q: "Does the core's peak fit its substation?", title: false, answer: ans, options: opts, feedback: fb, onPick: function () { show(); } });
          var res = H("div", { class: "a15-res" }, act);
          function show() {
            pr.reveal(); res.innerHTML = "";
            var tabs = H("div", { class: "lx-seg", role: "group", "aria-label": "Which day" }, res), btn = {}, day = "winter_design";
            var Pl = LX.Plot(H("div", null, res), { text: "Text version of the chart", legend: true });
            var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, res), av = H("p", { class: "lx-hint", "aria-live": "polite" }, res);
            [["winter_design", "Design day"], ["winter", "A normal winter day"]].forEach(function (t) { btn[t[0]] = H("button", { type: "button", text: t[1] }, tabs); btn[t[0]].addEventListener("click", function () { day = t[0]; paint(); }); });
            sl5 = slider(res, "Gas and propane heat to heat pumps", D.electrify.gas, S.dist.core.gas, pctF, COL.heat, function (v) { S.dist.core.gas = v; keep(); paint(); api.done(); buildExplain(); });
            fictional(res);
            function paint() {
              Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === day)); });
              var dy = dayByKey(C, day), r = districtDay(C, D, 0, dy, sOf("core"));
              r.label = C.districts[0].label; drawDay(Pl, r, { title: C.districts[0].label + ", " + dy.label.toLowerCase() });
              lineP(ln, peakLine(r, dy.label)); av.textContent = avpLine(annualVsPeak(C, D, 0, sOf("core")));
            }
            paint(); if (S.dist.core.gas > 0) api.done();
          }
          if (pr.picked()) show();
          demo[4] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } if (sl5) sl5.set(1, true); };
        } },
      { text: texts[5], build: function (act, api) {
          var Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          slider(act, "Older homes sealed and insulated", D.electrify.env, S.dist.core.env, pctF, "var(--lx-good)", function (v) { S.dist.core.env = v; keep(); paint(); api.done(); });
          slider(act, "Resistance heat to heat pumps", D.electrify.res, S.dist.core.res, pctF, COL.heat, function (v) { S.dist.core.res = v; keep(); paint(); api.done(); });
          slider(act, "Gas and propane heat to heat pumps (from step 5)", D.electrify.gas, S.dist.core.gas, pctF, COL.heat, function (v) { S.dist.core.gas = v; keep(); paint(); });
          fictional(act);
          function paint() {
            var r = districtDay(C, D, 0, dd, sOf("core")), r0 = districtDay(C, D, 0, dd, { gas: S.dist.core.gas });
            r.label = C.districts[0].label; drawDay(Pl, r);
            chips(ro, [["Gas heat to heat pumps only", fmtN(r0.peak, 1) + " MW"], ["With your efficiency", fmtN(r.peak, 1) + " MW", r.peak > r.limit ? "bad" : "good"], ["Substation", r.limit + " MW"]]);
            lineP(ln, peakLine(r, "Design day")); buildExplain();
          }
          paint(); if (S.dist.core.env > 0 || S.dist.core.res > 0) api.done();
          demo[5] = function () { S.dist.core.env = 1; S.dist.core.res = 1; S.dist.core.gas = 1; keep(); paint(); api.done(); };
        } },
      { text: texts[6], build: function (act, api) {
          var seen = {}, tabs = H("div", { class: "lx-seg", role: "group", "aria-label": "Charging rule" }, act), btn = {};
          var Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          slider(act, "Electric share of the suburbs' cars", D.electrify.ev, S.evShare, pctF, COL.ev, function (v) { S.evShare = v; keep(); paint(); });
          H("p", { class: "lx-hint", text: "Step 8 keeps your share and rule for the suburbs." }, act);
          H("p", { class: "lx-hint", text: "Illustrative rules: a timer spreads each day's charging over 00:00 to 06:00; filling the valleys raises the lowest hours to one level, at any hour." }, act);
          fictional(act);
          D.electrify.rules.forEach(function (t) { btn[t.key] = H("button", { type: "button", text: t.label }, tabs); btn[t.key].addEventListener("click", function () { S.rule = t.key; seen[t.key] = true; keep(); paint(); }); });
          function all3() { var o = {}; ["evening", "timer", "fill"].forEach(function (k) { var s = sOf("suburbs"); s.rule = k; o[k] = districtDay(C, D, 1, dd, s); }); return o; }
          function paint() {
            Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === S.rule)); });
            var r = districtDay(C, D, 1, dd, sOf("suburbs")); r.label = C.districts[1].label; drawDay(Pl, r);
            lineP(ln, evLine(r, S.rule));
            if (seen.evening && seen.timer && seen.fill) { api.done(); api.saw(evSaw(all3())); }
            buildExplain();
          }
          seen[S.rule] = true; paint();
          demo[6] = function () { ["timer", "fill", "evening"].forEach(function (k) { btn[k].click(); }); };
        } },
      { text: texts[7], build: function (act, api) {
          var sel = "fringe", tabs = H("div", { class: "lx-seg", role: "group", "aria-label": "District" }, act), btn = {};
          var bars = H("div", { class: "a15-dbars", role: "img" }, act);
          var ctl = H("div", { class: "a15-ctl" }, act), ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          fictional(act);
          C.districts.forEach(function (d) { btn[d.key] = H("button", { type: "button", text: d.label }, tabs); btn[d.key].addEventListener("click", function () { sel = d.key; build(); }); });
          function build() {
            Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === sel)); });
            ctl.innerHTML = "";
            [["gas", "Gas and propane heat to heat pumps", COL.heat], ["env", "Older homes sealed and insulated", "var(--lx-good)"], ["res", "Resistance heat to heat pumps", COL.heat]].forEach(function (f) {
              slider(ctl, f[1] + " (" + C.districts.filter(function (d) { return d.key === sel; })[0].label.toLowerCase() + ")", D.electrify[f[0]], S.dist[sel][f[0]], pctF, f[2], function (v) { S.dist[sel][f[0]] = v; keep(); paint(); api.done(); });
            });
            paint();
          }
          function paint() {
            var R = city(C, D, allS()); bars.innerHTML = "";
            var mx = Math.max.apply(null, R.parts.map(function (p) { return Math.max(p.peak, p.limit); })) * 1.08;
            R.parts.forEach(function (p) {
              var row = H("div", { class: "a15-dbar" }, bars);
              H("span", { class: "a15-dbar-l", text: p.label }, row);
              var tr = H("span", { class: "a15-dbar-t" }, row);
              H("i", { class: "a15-dbar-v" + (p.peak > p.limit ? " over" : ""), style: "width:" + (100 * p.peak / mx).toFixed(2) + "%" }, tr);
              H("i", { class: "a15-dbar-lim", style: "left:" + (100 * p.limit / mx).toFixed(2) + "%" }, tr);
              H("span", { class: "a15-dbar-n", text: fmtN(p.peak, 1) + " / " + p.limit + " MW" }, row);
            });
            bars.setAttribute("aria-label", "Design-day peaks against limits: " + R.parts.map(function (p) { return p.label + " " + fmtN(p.peak, 1) + " of " + p.limit + " MW"; }).join("; ") + ".");
            lineP(ln, cityLine(R)); buildExplain();
          }
          build();
          demo[7] = function () { ["core", "suburbs", "fringe"].forEach(function (k) { S.dist[k].gas = 1; }); keep(); build(); api.done(); };
        } },
      { text: texts[8], build: function (act, api) {
          var seen = {}, tabs = H("div", { class: "lx-seg", role: "group", "aria-label": "How the core is heated" }, act), btn = {};
          var Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          slider(act, "Share of the core's gas heat on the network", D.districtHeat.share, S.dh, pctF, COL.dh, function (v) { S.dh = v; keep(); paint(); });
          H("p", { class: "lx-hint", text: "Every gas and propane furnace in the core is replaced here; your step 6 settings stay. Source, losses and store are set for teaching." }, act);
          fictional(act);
          [["hp", "Heat pumps everywhere"], ["plant", "Network, no store"], ["store", "Network with a store"]].forEach(function (t) { btn[t[0]] = H("button", { type: "button", text: t[1] }, tabs); btn[t[0]].addEventListener("click", function () { S.dhMode = t[0]; seen[t[0]] = true; paint(); }); });
          function rOf(mode) { var s = sOf("core"); s.gas = 1; s.dh = { share: S.dh, mode: mode }; var r = districtDay(C, D, 0, dd, s); r.label = C.districts[0].label; return r; }
          function paint() {
            Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === S.dhMode)); });
            var r = rOf(S.dhMode); drawDay(Pl, r); lineP(ln, dhLine(D, r, S.dhMode));
            if (seen.hp && seen.plant && seen.store) { var a = rOf("hp"), b = rOf("plant"), c = rOf("store"); api.done(); api.saw(dhSaw(a, b, c)); }
          }
          seen[S.dhMode] = true; paint();
          demo[8] = function () { ["plant", "store", "hp"].forEach(function (k) { btn[k].click(); }); btn.store.click(); };
        } },
      { text: texts[9], build: function (act, api) {
          var I = D.industry, bands = C.industry.processHeat.map(function (b) { return { band: b.band, deliveredMWh: b.deliveredMWh, label: b.label.replace(/(\d) C\b/g, "$1 °C") }; });
          var bins = [{ id: "hp", label: "Industrial heat pump", sub: "up to about " + I.hpMaxC + " °C", color: "var(--lx-good)" }, { id: "boiler", label: "Electric boiler", sub: "steam", color: "var(--lx-bat)" },
                      { id: "oven", label: "Electric ovens and furnaces", sub: "resistance or induction", color: "var(--lx-tier-4)" }, { id: "elys", label: "Hydrogen by electrolysis", sub: "a feedstock, not only heat", color: "var(--lx-hyd)" }];
          var cards = [
            { id: "low", text: "Food plants: " + bands[0].label + ", " + fmtN(bands[0].deliveredMWh) + " MWh a year", bin: "hp", why: "Below 100 °C is easy for an industrial heat pump, and it delivers several units of heat per unit of electricity." },
            { id: "medium", text: "Food plants: " + bands[1].label + ", " + fmtN(bands[1].deliveredMWh) + " MWh a year", bin: "boiler", why: "Steam up to 400 °C is past today's commercial heat pumps (about " + I.hpMaxC + " °C); an electric boiler makes it, and heat pumps can take the lower part." },
            { id: "high", text: "Food plants: " + bands[2].label + ", " + fmtN(bands[2].deliveredMWh) + " MWh a year", bin: "oven", why: "Above 400 °C, electric resistance or induction heats directly, at about one unit of heat per unit of electricity." },
            { id: "h2", text: "The fertilizer plant: " + fmtN(C.industry.fertilizer.hydrogenT) + " t of hydrogen a year from gas reformers", bin: "elys", why: "The plant needs hydrogen itself, not only heat: electrolysis would make it from electricity and water." }];
          var res = H("div", { class: "a15-res" }, act);
          fictional(act);
          var cs = LX.CardSort(act, { bins: bins, cards: cards, onCheck: function () { show(); } });
          act.appendChild(res);
          function show() {
            res.innerHTML = "";
            var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, res);
            slider(res, "Industrial heat pump COP", I.cop, S.cop, function (v) { return fmtN(v, 1); }, "var(--lx-good)", function (v) { S.cop = v; keep(); lineP(ln, indLine(C, D, S.cop)); });
            H("p", { class: "lx-hint", text: "LBNL (2022): COP from 1.6 to 5.8 at temperature lifts of 130 to 40 K. Electric boilers and ovens at 98%. A ceiling, not a forecast." }, res);
            lineP(ln, indLine(C, D, S.cop)); api.done();
          }
          demo[9] = function () { var m = {}; cards.forEach(function (c) { m[c.id] = c.bin; }); cs.place(m); cs.check(); };
        } }
    ];
    var cards = LX.StepCards(live, { id: "a15-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer (the reader's own numbers)
    var xhost = document.getElementById("a15-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var e = curve(C, D, S, "el"), g = curve(C, D, S, "gas");
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), {
        title: "The measures, side by side (your rate " + pct(S.rate) + ", rebound " + pct(S.rebound) + ")", text: true,
        columns: [{ key: "name", label: "Measure", main: true }, { key: "cost", label: "Extra cost, 2025 $ (up front, and a year)" }, { key: "life", label: "Life" }, { key: "save", label: "Saves a year" }, { key: "cse", label: "Per MWh saved" }, { key: "pays", label: "Against its price" }],
        rows: e.concat(g).map(function (b) { return { key: b.key, color: COL[b.carrier], name: b.label, cost: usd(b.cost) + (b.extra > 0.005 ? " + " + usd(b.extra) + " a year" : ""), life: fmtN(b.life, 1) + " years", save: fmtN(b.net, 2) + " MWh of " + (b.carrier === "gas" ? "gas" : "electricity"), cse: usd(b.cse, 1), pays: (b.pays ? "pays, under " : "does not pay, over ") + usd(b.price, 1) }; }),
        caption: C.about.line + " Costs from EIA, LBNL and ResStock (sources below); 2025 Kansas retail prices." });
      var core = districtDay(C, D, 0, dd, sOf("core"));
      LX.CausalChain(H("div", { class: "lx-xcard" }, xhost), {
        title: "Cause and effect: a cold night on electrified heat",
        links: [{ title: "The design day", text: "The coldest planning day: every home heats at once, before dawn.", value: num(dd.tmin) + " °C at its coldest" },
                { title: "COP falls", text: "An air-source heat pump moves less heat per kWh when the air is colder.", value: "COP " + fmtN(cop(C, dd.tmin), 2) + " against " + fmtN(scop(C), 2) + " over the year" },
                { title: "The peak grows", text: "Heating electricity rises faster than the year's MWh.", value: fmtN(core.peak, 1) + " MW in the core (your settings)" },
                { title: "The substation binds", text: "The wires and transformers are sized for the peak hour, not the year.", value: core.limit + " MW limit" },
                { title: "What helps", text: "Envelopes, steadier heat sources with stores, and charging away from the coldest hours.", value: "steps 6, 7 and 9" }],
        note: C.about.line });
      var ann = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "The design day in the core, annotated" }, ann);
      var Pl = LX.Plot(H("div", null, ann), { text: "Text version of the chart", legend: true });
      core.label = C.districts[0].label;
      var mk = [{ x: 3.5, y: core.base[3] / 2, n: "1", kind: "dot" }, { x: 5.5, y: core.base[5] + core.hel[5] / 2, n: "2", kind: "dot" }, { x: 19.5, y: core.tot[19], n: "3", kind: "dot", pos: "above" },
                { x: 13.5, y: core.limit, n: "4", kind: "dot", pos: "above" }, { x: core.hour + 0.5, y: core.peak, n: "5", kind: "dot", pos: "above" }];
      drawDay(Pl, core, { marks: mk, title: "The dense core with your settings" });
      var ol = H("ol", { class: "a15-ann" }, ann);
      ["Base load: SPP's 2025 winter-peak shape, which already carries some of the region's own electric heating.", "Heating electricity: heat × (resistance share + heat-pump share ÷ COP), largest before dawn.",
       "Electric cars, mostly in the evening as today.", "The substation's peak-hour limit, " + core.limit + " MW (one substation per district is a teaching simplification).",
       "The peak, " + fmtN(core.peak, 1) + " MW at " + hm(core.hour) + "."].forEach(function (t) { H("li", { html: LX.rich(t) }, ol); });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where these answers hold",
        lede: "Closed-form estimates for a fictional city. The City Planner sandbox, " + LX.lessonRefHTML(P, "SB3") + ", chooses measures, heat and wires together with an optimization model.",
        holds: ["Costs and savings as stated, in 2025 dollars, each measure on its own.", "Eight representative days of 2025 weather, with one cold design day.", "Retail prices as the yardstick: what the customer pays."],
        leaves: ["Interactions between measures (practice item 4 shows one).", "What the grid avoids: generation, wires and capacity the savings defer.", "Comfort, health and the value of the rebound itself.", "Upgrade costs of substations and feeders."],
        source: "Data: prairie-city.json and this lesson's sources (below)." });
    }
    buildExplain();

    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, C: C, D: D, S: S, cards: cards };
  });
})();
