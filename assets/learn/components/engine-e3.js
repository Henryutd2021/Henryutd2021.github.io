/* engine-e3.js — LX.E3: engine E3 of Learn, Prairie City's energy hub (wave W5, 2026-11-06; curriculum v2 §16.4, §9.2,
   §9.5, §9.6). Used by the City Planner (SB3, learn/sb3-city-planner.qmd), Modeler lesson M12 (learn/m12-city-model.qmd)
   and capstone C3 (learn/c3-prairie-city-2040.qmd): one model, three pages.

   Data: assets/learn/data/prairie-city.json (the city: districts, heat, loads, days, COP, prices, emission factors,
   household groups; shared, read only) and assets/learn/data/e3-city-hub.json (what the engine adds: costs, plant and
   store settings, the tie rule, the ranges; from scripts/build_learn_e3_data.py; its `precomputed` block from the tests'
   --write). Prairie City is fictional; its numbers are illustrative. Every dollar is a 2025 dollar.

   The hub (a linear program, LP), over the eight representative days of 2025 (weights w_k, summing to 365), hour by hour:
     districts d (dense core, suburbs, rural fringe), each behind its substation limit L_d (linearized feeder limit):
       imp + pvUsed + batOut - batIn - evCharge - plantEl - heatEl(y) = base                    (balance; its dual: the
                                                         marginal cost of one more MWh in that district-hour)
       imp - upg_d <= L_d                                (the substation; its dual: the value of 1 MW more room that hour)
       imp >= 0 (no reverse flow: rooftop solar a district cannot use is spilled), pvUsed <= PV_d x sun
     buildings as shares y[e][s] of each district's heat: envelope e (as built, retrofitted: heat x (1 - saving)) times
       heating system s (fuel: gas, or propane where the fringe has it, in 80% furnaces; resistance; heat pump at the
       hour's COP; district heat in the core). heatEl = sum Q_dkh (1 - saving e) (y[e].res + y[e].hp / COP_kh).
       In a run the shares are fixed by the plan (bounds lb = ub); in sizing (M12) they are decisions with
       sum y = 1, fuel and resistance no more than in 2025, retrofits and district heat up to stated maxima.
     EV charging: unmanaged, each day's charge follows prairie-city.json's evening profile (fixed); managed, the same daily
       energy in any hours of the same day, at most a sixth of it in one hour.
     batteries (4 hours) at the substations: q_h = q_(h-1) + 0.85 in - out, cyclic within each day.
     district heat (core): plant heat pump (COP 3, up to its size) + gas boiler + store out - store in = connected heat
       / 0.9 (10% lost in the pipes); store s_h = 0.995 s_(h-1) + in - out, cyclic within each day.
     goal: min sum_k w_k sum_h (each district's 2025 blended retail price x imp + the boiler's gas) + the fuel heat of
       y (gas and propane at 2025 prices) + upgrades (up-front cost x capital recovery) [+ in sizing: the yearly cost of
       heat pumps, retrofits, the network, plant, store, rooftop solar and batteries] + the tie rule's small costs
       [+ in sizing, optionally: CO2 <= a cap, whose dual is the cost of the last tonne cut].
   C3 adds (capstone schema): the industrial park (food plants' heat below 100 C by industrial heat pumps; the fertilizer
     plant's hydrogen by electrolysis: flat loads at the park's own substation), the data-center campus (a load only, at
     its own substation, fixed), a wind contract and a solar farm whose output is netted against the city's purchases
     hour by hour (farmUse <= output, farmUse <= the city's meter load; the rest spilled, no CO2 credit for it), valued
     at the reader's "avoided cost" per MWh. CO2 stays location-based: the contract MWh do not change the grid's
     average rate, so they are never deducted (C3 review finding 1, GHG Protocol Scope 2 Guidance); what a
     market-based report could claim for them is reported apart (acc.contract).

   Prices and duals (§9.2): only from this LP, labelled "marginal values under stated assumptions": the substation duals
   (value of 1 MW more room, $ per MW per year), the balance duals ($/MWh in a district-hour), the CO2 cap's dual.
   Screening household outputs (§9.6): bills and energy burden by household group come from an accounting layer after
   the LP (E3.households), never from the LP: who adopts first (a stated rule), each adopting home's change (the
   district's average, scaled by the group's use index), shared costs (upgrades, batteries) on every kWh, district heat
   billed at its average cost. Equipment bought by adopting households is not in bills (LEAD's definition of burden).
   Car charging the plan adds is transport, counted with motor fuel, not home energy (LEAD's burden leaves transport
   out; SB3 review finding 1); new EVs replace only gasoline a group has (a fitted district-by-group table; finding 2).

   Tie rule (W2 review finding 2): stated costs far below any real one (e3-city-hub.json `tie`): $20 a year per MW of each
   district's busiest hour, $10 per MW of the three districts' busiest hour together, $1 per MWh out of a battery, $0.50
   per MWh out of the heat store, $0.10 x the hour's share of SPP's peak per MWh of managed charging. Left out of every
   reported cost. The LP minimises the economic cost plus these small costs, so on a few plans it spends a few dollars a
   year more to keep a busiest hour that is under its limit lower (SB3 review finding 4): _tests/learn/test_e3-engine.js
   finds the economic optimum (ties x0) for every preset and the review's plans and checks the gap is under $30 a year
   ($24.80 at most). It also re-solves with the tie costs x2 and x0.1 and checks every reported number on the optimal
   face (min and max of each over the plans within $1 of the best cost).

   API (the sandbox contract, learn/_template-sandbox.qmd):
     E3.prepare(city, cfg) -> P;  E3.schema (SB3), E3.c3Schema(cfg), E3.presets, E3.c3presets, E3.sysOf(state, P)
     E3.build(P, sys, { size, cap, tie }) -> model;  E3.read(P, sys, model, r) -> raw
     E3.solve(state, P, { signal, timeLimit, attempt, solver, size, cap }) -> Promise of
       { status, ok, kind: "lp", message, hint, results, ms }   never rejects; results = E3.summarize(...)
     E3.account(P, sys, raw), E3.households(P, sys, A, A0), E3.summarize(state, P, raw, base), E3.note(state, R, P, o),
     E3.hhAssume(R) (the household table's assumptions, one sentence each), E3.fuelMatrix(P),
     E3.fullYear(state, P, PY, R8, { solver, base }) -> the full-year check of a plan on all 8,760 hours (Node and the
       tests only); E3.fullView, fullFind, fullRows, fullWhy, fullPlanRow (its numbers and words) and E3.ui.fullCard
     E3.fallback(P, key), E3.inputsHTML(P, { c3, fixed }); formats money, mw, kilo, pct
   Node: module.exports = E3 (no DOM). In a page: LX.E3 and its view kit LX.E3.ui. */
(function () {
  "use strict";
  var SYS = ["fuel", "res", "hp", "dh"];
  var LB_PER_T = 2204.62262;

  // ---------------------------------------------------------------- small helpers
  function crf(r, n) { return r / (1 - Math.pow(1 + r, -n)); }
  function yearly(capex, life, rate, fomShare, fom) { return capex * crf(rate, life) + (fomShare || 0) * capex + (fom || 0); }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function copAt(C, T) { return T < C.cutoutC ? 1 : C.anchorCOP * (C.supplyC - C.anchorC) / (C.supplyC - T); }
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function millions(v, d) { d = d == null ? 1 : d; var x = v / 1e6, s = Math.abs(x).toFixed(d); return (x < 0 && +s !== 0 ? "−$" : "$") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "M"; }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 0 : d) + "%"; }
  function hh(h) { return (h < 10 ? "0" : "") + h + ":00"; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------- data
  function prepare(city, cfg) {
    var u = city.units, pr = city.prices, em = city.emissions, mm = u.mwhPerMMBtu;
    var galPerMWh = u.btuPerKWh * 1000 / u.btuPerGal.propane;       // gallons of propane in one MWh of its heat content
    var days = city.days, K = days.length;
    var P = { city: city, cfg: cfg, line: city.about.line, days: days, K: K, rate: cfg.finance.rate, galPerMWh: galPerMWh };
    P.w = days.map(function (d) { return d.weight; });
    P.cop = days.map(function (d) { return d.temp.map(function (T) { return copAt(city.cop, T); }); });
    P.shape = days.map(function (d) { return d.demandShape; });
    P.price = { res: pr.electricityCentsPerKWh.residential * 10, com: pr.electricityCentsPerKWh.commercial * 10, ind: pr.electricityCentsPerKWh.industrial * 10,
      gasRes: pr.gasPerMMBtu.residential / mm, gasCom: pr.gasPerMMBtu.commercial / mm, gasInd: pr.gasPerMMBtu.industrial / mm,
      propGal: pr.propanePerGal, propMWh: pr.propanePerGal * galPerMWh, gasoline: pr.gasolinePerGal, diesel: pr.dieselPerGal };
    P.ef = { grid: em.gridLbPerMWh.sppNorth / LB_PER_T, loss: city.supply.gridLossShare, gas: em.kgCO2.gasPerMMBtu / 1000 / mm,
      propGal: em.kgCO2.propanePerGal / 1000, gasoline: em.kgCO2.gasolinePerGal / 1000, diesel: em.kgCO2.dieselPerGal / 1000 };
    var hours = 0, sun = 0;
    days.forEach(function (d, k) { hours += P.w[k] * 24; sun += P.w[k] * sum(d.solar); });
    P.hours = hours;
    P.roofK = city.supply.rooftopCF / (sun / hours);                 // rooftop output per MW = farm shape x roofK (17.6%)
    P.sun = days.map(function (d) { return d.solar.map(function (v) { return v * P.roofK; }); });
    var tr = city.transport;
    P.evDay = tr.milesPerVehicle / 365 * tr.evKWhPerMile / 1000;      // MWh per EV per day
    P.galPerCar = tr.milesPerVehicle / tr.mpg;
    P.evProfile = tr.evProfile;
    P.eta = city.homes.furnaceEfficiency;
    P.D = city.districts.map(function (x, i) {
      var Q = days.map(function (d) { return d.districts[x.key].heat; }), B = days.map(function (d) { return d.districts[x.key].base; });
      var Qann = 0, Ehp = 0, Bann = 0;
      days.forEach(function (d, k) { for (var h = 0; h < 24; h++) { Qann += P.w[k] * Q[k][h]; Ehp += P.w[k] * Q[k][h] / P.cop[k][h]; Bann += P.w[k] * B[k][h]; } });
      var sh = x.heat.share, fuel0 = sh.gas + sh.propane, Qd = x.heat.residentialMWh + x.heat.commercialMWh;
      var am = x.annualMWh, resMWh = am.residentialBase + am.residentialHeat + am.ev, comMWh = am.commercialBase + am.commercialHeat + am.farm;
      var g = x.gasMMBtu;
      return { key: x.key, label: x.label, i: i, Q: Q, B: B, Qann: Qann, Ehp: Ehp, eps: Ehp / Qann, Bann: Bann,
        s0: { fuel: fuel0, res: sh.resistance, hp: sh.heatPump, dh: 0 }, pf: fuel0 > 0 ? sh.propane / fuel0 : 0,
        H: x.households, homeEq: x.households * Qd / x.heat.residentialMWh, rho: x.heat.residentialMWh / Qd, L: x.substationMW,
        pv0: x.rooftopSolarMW, evs0: x.evs, ldv: x.lightDutyVehicles,
        pEl: (resMWh * P.price.res + comMWh * P.price.com) / (resMWh + comMWh),
        pGas: (g.residential * P.price.gasRes + g.commercial * P.price.gasCom) / (g.residential + g.commercial),
        otherGas: (g.residential + g.commercial) * mm - Qd * sh.gas / P.eta,                  // MWh of gas: water, cooking
        otherProp: x.propaneGal / galPerMWh - Qd * sh.propane / P.eta };                       // MWh of propane: the same
    });
    var pv0 = sum(P.D.map(function (D) { return D.pv0; })), L0 = sum(P.D.map(function (D) { return D.L; }));
    P.pvShare = P.D.map(function (D) { return D.pv0 / pv0; });
    P.batShare = P.D.map(function (D) { return D.L / L0; });
    var ind = city.industry, fm = city.farms;
    var low = ind.processHeat.filter(function (b) { return b.band === "low"; })[0];
    P.dc = days.map(function (d) { return d.dataCenterMW; });
    P.out = { foodEl: ind.food.electricityMWh, fertEl: ind.fertilizer.electricityMWh, foodGas: ind.food.gasMMBtu * mm, fertGas: ind.fertilizer.gasMMBtu * mm,
      lowHeat: low.deliveredMWh, burner: ind.food.burnerEfficiency, h2El: ind.fertilizer.electrolysisEquivalentMWh, h2T: ind.fertilizer.hydrogenT,
      busDiesel: tr.buses.dieselGal, truckDiesel: tr.trucksDieselGal, farmDiesel: fm.dieselGal, farmProp: fm.propaneGal };
    var dcAnn = 0; days.forEach(function (d, k) { dcAnn += P.w[k] * sum(d.dataCenterMW); });
    P.out.dcEl = dcAnn;
    P.groups = city.groups;
    P.hhDG = city.householdsByGroup.households;   // [district][group]
    return P;
  }

  // ---------------------------------------------------------------- the plans (LX.ShareState schemas)
  function sb3Schema(cfg) {
    var rc = cfg.retrofit.cost, sv = cfg.retrofit.save, nc = cfg.dh.network.cost, up = cfg.upgrade.capex;
    return { key: "sb3", version: 1, title: "City Planner plan", fields: [
      { id: "hp", short: "h", type: "int", min: 0, max: 100, step: 5, def: 0, label: "Furnaces and resistance heat switched to heat pumps", unit: "%" },
      { id: "ret", short: "r", type: "int", min: 0, max: 100, step: 5, def: 0, label: "Buildings retrofitted", unit: "%" },
      { id: "dh", short: "d", type: "int", min: 0, max: 50, step: 5, def: 0, label: "Dense core's heat from a district network", unit: "%" },
      { id: "dhp", short: "p", type: "int", min: 0, max: 250, step: 10, def: 0, label: "Network's heat pump", unit: "MW heat" },
      { id: "sto", short: "s", type: "int", min: 0, max: 2000, step: 100, def: 0, label: "Network's heat store", unit: "MWh" },
      { id: "ev", short: "e", type: "int", min: 1, max: 100, step: 1, def: 1, label: "Cars that are electric", unit: "%" },
      { id: "evm", short: "m", type: "enum", values: ["home", "managed"], names: { home: "Unmanaged", managed: "Managed" }, def: "home", label: "EV charging" },
      { id: "pv", short: "v", type: "int", min: 0, max: 400, step: 10, def: 0, label: "Rooftop solar added", unit: "MW" },
      { id: "bat", short: "b", type: "int", min: 0, max: 200, step: 10, def: 0, label: "Batteries at the substations (4 hours)", unit: "MW" },
      { id: "up", short: "u", type: "enum", values: ["yes", "no"], names: { yes: "Allowed", no: "Not allowed" }, def: "yes", label: "Substation upgrades" },
      { id: "upc", short: "c", type: "int", min: up.lo, max: up.hi, step: up.step, def: up.def, label: "Upgrade cost", unit: "$/kW" },
      { id: "save", short: "a", type: "int", min: sv.lo, max: sv.hi, step: sv.step, def: sv.def, label: "Heat a retrofit saves", unit: "%" },
      { id: "rc", short: "k", type: "int", min: rc.lo, max: rc.hi, step: rc.step, def: rc.def, label: "Retrofit cost", unit: "$/home" },
      { id: "dhc", short: "n", type: "int", min: nc.lo, max: nc.hi, step: nc.step, def: nc.def, label: "Network cost", unit: "$/home" },
      { id: "rule", short: "o", type: "enum", values: ["even", "low", "high"], names: { even: "Every group alike", low: "Lower incomes first", high: "Higher incomes first" }, def: "even", label: "Who adopts first" },
      { id: "rec", short: "q", type: "enum", values: ["kwh", "fixed", "income"], names: { kwh: "Per kWh", fixed: "Fixed charge", income: "By income" }, def: "kwh", label: "Shared costs recovered" }] };
  }
  // C3: the same plan for 2040, plus the industrial park and local supply (sited with the map: A19's hook)
  function c3Schema(cfg) {
    var S = sb3Schema(cfg), av = cfg.c3.avoided;
    S.key = "c3"; S.version = 1; S.title = "Prairie City 2040 plan";
    S.fields = S.fields.concat([
      { id: "ihp", short: "i", type: "int", min: 0, max: 100, step: 10, def: 0, label: "Food plants' heat below 100 °C from heat pumps", unit: "%" },
      { id: "ely", short: "y", type: "int", min: 0, max: 100, step: 10, def: 0, label: "Fertilizer plant's hydrogen from electrolysis", unit: "%" },
      { id: "wind", short: "w", type: "int", min: 0, max: 400, step: 10, def: 0, label: "Wind contract to the west", unit: "MW" },
      { id: "farm", short: "f", type: "int", min: 0, max: 150, step: 10, def: 0, label: "Solar farm", unit: "MW" },
      { id: "site", short: "t", type: "enum", values: ["A", "B", "C", "D", "E"], names: { A: "Site A", B: "Site B", C: "Site C", D: "Site D", E: "Site E" }, def: "A", label: "Solar farm's site" },
      { id: "av", short: "x", type: "int", min: av.lo, max: av.hi, step: av.step, def: av.def, label: "Value of a contract MWh", unit: "$/MWh" }]);
    return S;
  }
  var presets = [
    { id: "today", label: "2025 as it is", state: { hp: 0, ret: 0, dh: 0, dhp: 0, sto: 0, ev: 1, evm: "home", pv: 0, bat: 0, up: "yes" }, note: "No change: 2025's buildings, cars and rooftop solar" },
    { id: "electrify", label: "Electrify heat and cars", state: { hp: 80, ret: 0, dh: 0, dhp: 0, sto: 0, ev: 50, evm: "home", pv: 0, bat: 0, up: "yes" }, note: "80% of furnaces and resistance heat to heat pumps, half the cars electric, charging unmanaged" },
    { id: "flex", label: "Electrify with flexibility", state: { hp: 80, ret: 40, dh: 0, dhp: 0, sto: 0, ev: 50, evm: "managed", pv: 100, bat: 40, up: "yes" }, note: "The same, with retrofits, managed charging, rooftop solar and batteries" },
    { id: "network", label: "Heat network in the core", state: { hp: 80, ret: 40, dh: 40, dhp: 120, sto: 1200, ev: 50, evm: "managed", pv: 100, bat: 0, up: "yes" }, note: "Four in ten of the core's buildings on a network with a heat pump and a store" }];
  // C3's "2025 as it is" resets every lever of the 2040 plan, the park's and the farms' too (C3 review finding 4)
  var c3presets = [
    { id: "today", label: "2025 as it is", state: { hp: 0, ret: 0, dh: 0, dhp: 0, sto: 0, ev: 1, evm: "home", pv: 0, bat: 0, up: "yes", ihp: 0, ely: 0, wind: 0, farm: 0 } },
    { id: "buildings", label: "Buildings first", state: { hp: 70, ret: 50, dh: 30, dhp: 100, sto: 800, ev: 40, evm: "managed", pv: 60, bat: 20, ihp: 50, ely: 0, wind: 100, farm: 50 } },
    { id: "supply", label: "Supply first", state: { hp: 40, ret: 10, dh: 0, dhp: 0, sto: 0, ev: 40, evm: "home", pv: 150, bat: 0, ihp: 0, ely: 50, wind: 300, farm: 150 } }];
  function defaults(S) { var o = {}; S.fields.forEach(function (f) { o[f.id] = f.def; }); return o; }
  function withPreset(s, pr) { var o = copy(s); for (var k in pr.state) o[k] = pr.state[k]; return o; }

  // ---------------------------------------------------------------- what a plan describes
  function sysOf(s, P) {
    var cfg = P.cfg, rate = P.rate, c3 = s.ihp != null;
    var S = { s: s, c3: c3, hp: s.hp / 100, ret: s.ret / 100, save: s.save / 100, dh: s.dh / 100, dhp: s.dh > 0 ? s.dhp : 0, sto: s.dh > 0 ? s.sto : 0,
      evm: s.evm, up: s.up === "yes", pvAdd: s.pv, batAdd: s.bat, rule: s.rule, rec: s.rec || "kwh" };
    // yearly cost per unit (2025 dollars): capital x capital recovery at the course's rate over the item's life, plus upkeep
    S.a = { hp: yearly(cfg.heatPump.capex, cfg.heatPump.life, rate), ret: yearly(s.rc, cfg.retrofit.life, rate), net: yearly(s.dhc, cfg.dh.network.life, rate),
      plant: yearly(cfg.dh.plant.capex.def * 1000, cfg.dh.plant.life, rate), store: yearly(cfg.dh.store.capex.def, cfg.dh.store.life, rate),
      pv: yearly(cfg.rooftop.capex * 1000, cfg.rooftop.life, rate, 0, cfg.rooftop.fom * 1000), bat: yearly(cfg.battery.capex * 1000, cfg.battery.life, rate, cfg.battery.fomShare),
      up: yearly(s.upc * 1000, cfg.upgrade.life, rate) };
    S.capex = { hp: cfg.heatPump.capex, ret: s.rc, net: s.dhc, plant: cfg.dh.plant.capex.def * 1000, store: cfg.dh.store.capex.def, pv: cfg.rooftop.capex * 1000, bat: cfg.battery.capex * 1000, up: s.upc * 1000 };
    S.d = P.D.map(function (D, i) {
      var s0 = D.s0, x = i === 0 ? S.dh : 0, c = S.hp, r = S.ret;
      var after = { fuel: (1 - x) * s0.fuel * (1 - c), res: (1 - x) * s0.res * (1 - c), hp: (1 - x) * (s0.hp + c * (s0.fuel + s0.res)), dh: x };
      var y = [{}, {}];
      SYS.forEach(function (k) { y[0][k] = (1 - r) * after[k]; y[1][k] = r * after[k]; });
      var evs = Math.max(D.evs0, Math.round(s.ev / 100 * D.ldv));
      return { after: after, y: y, evs: evs, E: evs * P.evDay, pv: D.pv0 + S.pvAdd * P.pvShare[i], pvAdd: S.pvAdd * P.pvShare[i], bat: S.batAdd * P.batShare[i] };
    });
    if (c3) {
      var c = cfg.c3;
      S.ihp = s.ihp / 100; S.ely = s.ely / 100; S.wind = s.wind; S.farm = s.farm; S.site = s.site; S.av = s.av;
      S.a.wind = yearly(c.wind.capex * 1000, c.wind.life, rate, 0, c.wind.fom * 1000);
      S.a.farm = yearly(c.solarFarm.capex * 1000, c.solarFarm.life, rate, 0, c.solarFarm.fom * 1000);
      var ez = c.electrolyzer;
      S.a.ely = yearly(ez.capex * 1000, ez.life, rate, ez.fomShare + ez.stackShare * 8760 / ez.stackHours);
      S.a.ihp = yearly(c.indHP.capex * 1000, c.indHP.life, rate);
      S.capex.wind = c.wind.capex * 1000; S.capex.farm = c.solarFarm.capex * 1000; S.capex.ely = ez.capex * 1000; S.capex.ihp = c.indHP.capex * 1000;
      // set by the page's siting hook: { connectUSD, cfK } (A19's map), else none; only with a solar farm, so a plan without
      // one (and 2025's baseline, which keeps the plan's other fields) carries no site's line, road or land
      S.siteAdj = s.farm > 0 ? s.siteInfo || null : null;
      // the park's flat new loads (MW) and the gas they replace (MWh of gas a year)
      S.ihpHeatMW = S.ihp * P.out.lowHeat / 8760;
      S.ihpElMW = S.ihpHeatMW / c.indHP.cop;
      S.elyMW = S.ely * P.out.h2El / 8760;
    }
    return S;
  }

  // ---------------------------------------------------------------- the LP
  // o.size: the building shares and the sizes of rooftop solar, batteries, the network's plant and store become decisions
  //   (bounds in o: retMax, dhMax, pvMax, batMax, dhpMax, stoMax); o.cap: a CO2 cap (t a year) on the districts' hub
  // o.tie: multiplies the tie costs (the test's x10 and x0.1); o.limits: an override of the substation limits (MW)
  // o.upFixed: each district's upgrade fixed (MW; the full-year check keeps the eight days' upgrades); o.unserved: $ per
  //   MWh, a district-hour may then leave part of its load unserved at that penalty (the full-year check; never a reported
  //   cost). Without them the model is exactly the eight days' run.
  function build(P, S, o) {
    o = o || {};
    var cfg = P.cfg, T = cfg.tie, tk = o.tie == null ? 1 : o.tie, K = P.K, V = [], C = [], size = !!o.size;
    var dh = cfg.dh, eff = cfg.battery.rte, keep = 1 - dh.store.lossPerHour, net = 1 - dh.loss, copP = dh.plant.cop;
    function v(name, lb, ub, cost) { V.push({ name: name, lb: lb == null ? 0 : lb, ub: ub == null ? Infinity : ub, cost: cost || 0 }); return name; }
    function row(name, terms, lo, hi) { var c = { name: name, terms: terms }; if (lo === hi) c.eq = lo; else { if (lo != null) c.lb = lo; if (hi != null) c.ub = hi; if (lo == null) c.ub = hi; if (hi == null) c.lb = lo; } C.push(c); return c; }
    var co2 = [], co2c = 0;   // the hub's CO2 as terms (for a cap)
    var efEl = P.ef.grid * (1 + P.ef.loss);
    // building shares
    var Y = P.D.map(function (D, i) {
      var sd = S.d[i], out = [{}, {}];
      [0, 1].forEach(function (e) {
        SYS.forEach(function (k) {
          if (k === "dh" && i !== 0) return;
          // shares are in percent inside the LP (0 to 100), which keeps the matrix's numbers close in size for HiGHS
          var fix = sd.y[e][k] * 100, cost = 0, f = (1 - S.save * e) * D.Qann / 100;
          if (k === "fuel") cost = f / P.eta * ((1 - D.pf) * D.pGas + D.pf * P.price.propMWh);
          if (size) {
            if (e === 1) cost += S.a.ret * D.homeEq / 100;
            if (k === "dh") cost += S.a.net * D.homeEq / 100;
            out[e][k] = v("y" + i + e + k, 0, Infinity, cost);
          } else out[e][k] = v("y" + i + e + k, fix, fix, cost);
          if (k === "fuel") co2.push([out[e][k], f / P.eta * ((1 - D.pf) * P.ef.gas + D.pf * P.galPerMWh * P.ef.propGal)]);
        });
      });
      if (size) {
        var all = [];
        [0, 1].forEach(function (e) { for (var k in out[e]) all.push([out[e][k], 1]); });
        row("yall" + i, all, 100, 100);
        row("yfuel" + i, [[out[0].fuel, 1], [out[1].fuel, 1]], null, D.s0.fuel * 100);
        row("yres" + i, [[out[0].res, 1], [out[1].res, 1]], null, D.s0.res * 100);
        var r1 = []; for (var k1 in out[1]) r1.push([out[1][k1], 1]);
        row("yret" + i, r1, null, (o.retMax == null ? 1 : o.retMax) * 100);
        if (i === 0) row("ydh", [[out[0].dh, 1], [out[1].dh, 1]], null, (o.dhMax == null ? 0.5 : o.dhMax) * 100);
        var zh = v("zhp" + i, 0, Infinity, S.a.hp * D.homeEq / 100);   // heat pumps beyond 2025's (percent)
        row("zhp" + i, [[zh, 1], [out[0].hp, -1], [out[1].hp, -1]], -D.s0.hp * 100, null);
      }
      return out;
    });
    // sizes
    var pvA = size ? v("pvAdd", 0, o.pvMax == null ? 400 : o.pvMax, S.a.pv) : null, batA = size ? v("batAdd", 0, o.batMax == null ? 200 : o.batMax, S.a.bat) : null;
    var dhOn = size ? (o.dhMax == null || o.dhMax > 0) : S.dh > 0;
    var dhpV = dhOn && size ? v("dhp", 0, o.dhpMax == null ? 250 : o.dhpMax, S.a.plant) : null, stoV = dhOn && size ? v("sto", 0, o.stoMax == null ? 2000 : o.stoMax, S.a.store) : null;
    var upg = P.D.map(function (D, i) { var f = o.upFixed ? o.upFixed[i] : null; return f != null ? v("upg" + i, f, f, S.a.up) : v("upg" + i, 0, S.up ? Infinity : 0, S.a.up); });
    var pk = P.D.map(function (D, i) { return v("pk" + i, 0, Infinity, T.peak * tk); }), pkC = v("pkC", 0, Infinity, T.cityPeak * tk);
    var lim = o.limits || P.D.map(function (D) { return D.L; });
    var farmOn = S.c3 && (S.wind > 0 || S.farm > 0);
    for (var k = 0; k < K; k++) {
      var w = P.w[k];
      for (var h = 0; h < 24; h++) {
        var tag = k + "_" + h, cityTerms = [[pkC, -1]], meter = [];
        P.D.forEach(function (D, i) {
          var sd = S.d[i], t = i + "_" + tag;
          var imp = v("i" + t, 0, Infinity, w * D.pEl), pvAvail = P.sun[k][h];
          var bal = [[imp, 1]], rhs = D.B[k][h];
          co2.push([imp, w * efEl]);
          // rooftop solar
          if (size || sd.pv > 0) {
            var pvU = v("s" + t, 0, size ? Infinity : sd.pv * pvAvail);
            bal.push([pvU, 1]);
            if (size) row("sm" + t, [[pvU, 1], [pvA, -pvAvail * P.pvShare[i]]], null, D.pv0 * pvAvail);
          }
          // electric heating from the building shares
          [0, 1].forEach(function (e) {
            var q = (1 - S.save * e) * D.Q[k][h] / 100;
            if (q > 0) { bal.push([Y[i][e].res, -q]); bal.push([Y[i][e].hp, -q / P.cop[k][h]]); }
          });
          // EV charging
          if (S.evm === "managed") {
            var ev = v("v" + t, 0, sd.E / cfg.ev.minHours, T.ev * tk * P.shape[k][h] / 1000 * w); bal.push([ev, -1]);
            if (h === 23) { var day = []; for (var hv = 0; hv < 24; hv++) day.push(["v" + i + "_" + k + "_" + hv, 1]); row("ve" + i + "_" + k, day, sd.E, sd.E); }
          }
          else rhs += sd.E * P.evProfile[h];
          // batteries
          if (size || sd.bat > 0) {
            var bmax = size ? Infinity : sd.bat, bi = v("bc" + t, 0, bmax), bo = v("bd" + t, 0, bmax, T.wear * tk * w), bq = v("bq" + t, 0, size ? Infinity : sd.bat * cfg.battery.hours);
            bal.push([bo, 1], [bi, -1]);
            var prev = "bq" + i + "_" + k + "_" + (h + 23) % 24;
            row("bs" + t, [[bq, 1], [prev, -1], [bi, -eff], [bo, 1]], 0, 0);
            if (size) {
              var sb = P.batShare[i];
              row("bci" + t, [[bi, 1], [batA, -sb]], null, 0); row("bco" + t, [[bo, 1], [batA, -sb]], null, 0); row("bcq" + t, [[bq, 1], [batA, -sb * cfg.battery.hours]], null, 0);
            }
          }
          // the network's plant draws on the core's substation
          if (i === 0 && dhOn) {
            // the plant buys at the industrial (large-customer) price, though its power comes through the core's substation
            var hpH = v("dp" + tag, 0, size ? Infinity : S.dhp, w * (P.price.ind - D.pEl) / copP), boil = v("db" + tag, 0, Infinity, w * P.price.gasCom / dh.plant.boilerEff);
            co2.push([boil, w * P.ef.gas / dh.plant.boilerEff]);
            bal.push([hpH, -1 / copP]);
            if (size) row("dpc" + tag, [[hpH, 1], [dhpV, -1]], null, 0);
            var heat = [[hpH, 1], [boil, 1]];
            if (size || S.sto > 0) {
              var si = v("ti" + tag, 0, size ? Infinity : S.sto / dh.store.minHours), so = v("to" + tag, 0, size ? Infinity : S.sto / dh.store.minHours, cfg.tie.storeWear * tk * w),
                sq = v("tq" + tag, 0, size ? Infinity : S.sto);
              heat.push([so, 1], [si, -1]);
              row("ts" + tag, [[sq, 1], ["tq" + k + "_" + (h + 23) % 24, -keep], [si, -1], [so, 1]], 0, 0);
              if (size) { row("tci" + tag, [[si, 1], [stoV, -1 / dh.store.minHours]], null, 0); row("tco" + tag, [[so, 1], [stoV, -1 / dh.store.minHours]], null, 0); row("tcq" + tag, [[sq, 1], [stoV, -1]], null, 0); }
            }
            [0, 1].forEach(function (e) { var q = (1 - S.save * e) * D.Q[k][h] / net / 100; if (q > 0) heat.push([Y[0][e].dh, -q]); });
            row("dh" + tag, heat, 0, 0);
          }
          if (o.unserved != null) bal.push([v("u" + t, 0, Infinity, w * o.unserved), 1]);
          row("b" + t, bal, rhs, rhs);
          row("l" + t, [[imp, 1], [upg[i], -1]], null, lim[i]);
          row("p" + t, [[imp, 1], [pk[i], -1]], null, 0);
          cityTerms.push([imp, 1]);
          meter.push(imp);
        });
        row("c" + tag, cityTerms, null, 0);
        // C3: the park and the campus (fixed), the farms netted hour by hour against the city's meter load
        if (farmOn) {
          var gen = S.wind * P.days[k].wind[h] + S.farm * P.days[k].solar[h] * (S.siteAdj && S.siteAdj.cfK ? S.siteAdj.cfK : 1);
          var fu = v("f" + tag, 0, gen, -w * S.av);   // money only: location-based CO2 does not count contract MWh
          var fixed = P.dc[k][h] + parkMW(P, S);
          row("fm" + tag, [[fu, 1]].concat(meter.map(function (m) { return [m, -1]; })), null, fixed);
        }
      }
    }
    var obj = V; // costs on the columns
    var model = { sense: "min", variables: obj, constraints: C };
    if (o.cap != null) {
      var cst = hubFixedCO2(P, S);
      model.constraints.push({ name: "cap", terms: co2, ub: o.cap - cst });
    }
    model.meta = { size: size, dhOn: dhOn, farmOn: farmOn, unserved: o.unserved != null };
    return model;
  }
  // the park's flat electricity (MW): 2025's plants plus C3's heat pumps and electrolyzers
  function parkMW(P, S) { return (P.out.foodEl + P.out.fertEl) / 8760 + (S.c3 ? S.ihpElMW + S.elyMW : 0); }
  // the hub's CO2 that the LP cannot change (t a year): water heating and cooking gas and propane, cars' gasoline
  function hubFixedCO2(P, S) {
    var t = 0;
    P.D.forEach(function (D, i) { t += D.otherGas * P.ef.gas + D.otherProp * P.galPerMWh * P.ef.propGal + (D.ldv - S.d[i].evs) * P.galPerCar * P.ef.gasoline; });
    return t;
  }

  // ---------------------------------------------------------------- reading a solved LP
  function read(P, S, model, r) {
    var x = r.values, du = r.duals, K = P.K, m = model.meta || {};
    function val(n) { var q = x[n]; return q == null ? 0 : q; }
    var raw = { status: r.status, days: [], y: [], sizes: {}, upg: [], pk: [], obj: r.objective, meta: m };
    P.D.forEach(function (D, i) {
      var y = [{}, {}];
      [0, 1].forEach(function (e) { SYS.forEach(function (k) { y[e][k] = k === "dh" && i !== 0 ? 0 : val("y" + i + e + k) / 100; }); });
      raw.y.push(y); raw.upg.push(val("upg" + i)); raw.pk.push(val("pk" + i));
    });
    raw.pkC = val("pkC");
    raw.sizes = m.size ? { pvAdd: val("pvAdd"), batAdd: val("batAdd"), dhp: val("dhp"), sto: val("sto") } : { pvAdd: S.pvAdd, batAdd: S.batAdd, dhp: S.dhp, sto: S.sto };
    for (var k = 0; k < K; k++) {
      var day = { d: [], dh: null, farm: null };
      P.D.forEach(function (D, i) {
        var o = { imp: [], pv: [], pvAvail: [], heat: [], ev: [], bc: [], bd: [], bq: [], plant: [], base: D.B[k].slice(), lim: [], bal: [], tie: [], un: [] };
        var pvMW = m.size ? D.pv0 + raw.sizes.pvAdd * P.pvShare[i] : S.d[i].pv;
        var E = S.d[i].E;
        for (var h = 0; h < 24; h++) {
          var t = i + "_" + k + "_" + h;
          o.imp.push(val("i" + t)); o.pv.push(val("s" + t)); o.pvAvail.push(pvMW * P.sun[k][h]);
          var he = 0;
          [0, 1].forEach(function (e) { var q = (1 - S.save * e) * D.Q[k][h]; he += q * (raw.y[i][e].res + raw.y[i][e].hp / P.cop[k][h]); });
          o.heat.push(he);
          o.ev.push(S.evm === "managed" ? val("v" + t) : E * P.evProfile[h]);
          o.bc.push(val("bc" + t)); o.bd.push(val("bd" + t)); o.bq.push(val("bq" + t)); o.un.push(m.unserved ? val("u" + t) : 0);
          o.plant.push(i === 0 && m.dhOn ? val("dp" + k + "_" + h) / P.cfg.dh.plant.cop : 0);
          // duals (LP only): the substation row's value of 1 MW more room that hour ($ per MW, for the year: the day's
          // weight is in it), and the balance row's marginal cost per MWh in that hour
          o.lim.push(du ? -(du["l" + t] || 0) : null);
          o.bal.push(du ? (du["b" + t] || 0) / P.w[k] : null);
          o.tie.push(du ? -(du["p" + t] || 0) - (du["c" + k + "_" + h] || 0) : null);   // the tie rule's share, $ for the year
        }
        day.d.push(o);
      });
      if (m.dhOn) {
        var q = { hp: [], boil: [], si: [], so: [], sq: [], load: [] };
        for (var h2 = 0; h2 < 24; h2++) {
          var tg = k + "_" + h2;
          q.hp.push(val("dp" + tg)); q.boil.push(val("db" + tg)); q.si.push(val("ti" + tg)); q.so.push(val("to" + tg)); q.sq.push(val("tq" + tg));
          var ld = 0; [0, 1].forEach(function (e) { ld += (1 - S.save * e) * P.D[0].Q[k][h2] * raw.y[0][e].dh; });
          q.load.push(ld);
        }
        day.dh = q;
      }
      if (m.farmOn) {
        var f = { use: [], gen: [] };
        for (var h3 = 0; h3 < 24; h3++) { f.use.push(val("f" + k + "_" + h3)); f.gen.push(S.wind * P.days[k].wind[h3] + S.farm * P.days[k].solar[h3] * (S.siteAdj && S.siteAdj.cfK ? S.siteAdj.cfK : 1)); }
        day.farm = f;
      }
      raw.days.push(day);
    }
    raw.capDual = du && du.cap != null ? -du.cap : null;   // $ per tonne: the cost of cutting the last tonne under the cap
    return raw;
  }

  // ---------------------------------------------------------------- the accounting (energy, money, CO2 a year)
  function wsum(P, f) { var t = 0; for (var k = 0; k < P.K; k++) for (var h = 0; h < 24; h++) t += P.w[k] * f(k, h); return t; }
  function account(P, S, raw) {
    var cfg = P.cfg, A = { d: [], money: {}, co2: {}, upfront: {} }, M = A.money, Z = A.co2, U = A.upfront;
    var mz = raw.sizes;
    var hpShare = 0, retHomes = 0, dhHomes = 0;
    ["elec", "gas", "propane", "boiler", "gasoline", "hp", "ret", "net", "plant", "store", "pv", "bat", "up"].forEach(function (k) { M[k] = 0; });
    ["elec", "gas", "propane", "boiler", "gasoline"].forEach(function (k) { Z[k] = 0; });
    ["hp", "ret", "net", "plant", "store", "pv", "bat", "up"].forEach(function (k) { U[k] = 0; });
    var efEl = P.ef.grid * (1 + P.ef.loss);
    P.D.forEach(function (D, i) {
      var y = raw.y[i], o = { key: D.key, label: D.label };
      o.imp = wsum(P, function (k, h) { return raw.days[k].d[i].imp[h]; });
      o.pvUsed = wsum(P, function (k, h) { return raw.days[k].d[i].pv[h]; });
      o.pvAvail = wsum(P, function (k, h) { return raw.days[k].d[i].pvAvail[h]; });
      o.heatEl = wsum(P, function (k, h) { return raw.days[k].d[i].heat[h]; });
      o.ev = S.d[i].E * 365;
      o.plant = wsum(P, function (k, h) { return raw.days[k].d[i].plant[h]; });
      // what the batteries gave back, and the load left unserved (only the full-year check allows it), MWh a year
      o.batOut = wsum(P, function (k, h) { return raw.days[k].d[i].bd[h]; });
      o.unserved = wsum(P, function (k, h) { return raw.days[k].d[i].un[h]; });
      o.fuelHeat = 0; o.dhHeat = 0; o.share = {};
      SYS.forEach(function (k) { o.share[k] = y[0][k] + y[1][k]; });
      o.retShare = SYS.reduce(function (s, k) { return s + y[1][k]; }, 0);
      [0, 1].forEach(function (e) { o.fuelHeat += (1 - S.save * e) * D.Qann * y[e].fuel; o.dhHeat += (1 - S.save * e) * D.Qann * y[e].dh; });
      o.gas = o.fuelHeat * (1 - D.pf) / P.eta + D.otherGas;            // MWh of gas
      o.propane = o.fuelHeat * D.pf / P.eta + D.otherProp;             // MWh of propane
      o.gasoline = (D.ldv - S.d[i].evs) * P.galPerCar;                 // gallons
      o.peak = raw.pk[i]; o.limit = D.L; o.upg = raw.upg[i];
      o.pvAdd = mz.pvAdd * P.pvShare[i]; o.bat = mz.batAdd * P.batShare[i];
      o.hpNew = Math.max(0, o.share.hp - D.s0.hp);
      M.elec += o.imp * D.pEl - o.plant * (D.pEl - P.price.ind); M.gas += o.gas * D.pGas; M.propane += o.propane * P.price.propMWh; M.gasoline += o.gasoline * P.price.gasoline;
      Z.elec += o.imp * efEl; Z.gas += o.gas * P.ef.gas; Z.propane += o.propane * P.galPerMWh * P.ef.propGal; Z.gasoline += o.gasoline * P.ef.gasoline;
      M.hp += o.hpNew * D.homeEq * S.a.hp; U.hp += o.hpNew * D.homeEq * S.capex.hp;
      M.ret += o.retShare * D.homeEq * S.a.ret; U.ret += o.retShare * D.homeEq * S.capex.ret;
      M.net += o.share.dh * D.homeEq * S.a.net; U.net += o.share.dh * D.homeEq * S.capex.net;
      M.up += o.upg * S.a.up; U.up += o.upg * S.capex.up;
      A.d.push(o);
    });
    var boil = 0;
    if (raw.meta.dhOn) boil = wsum(P, function (k, h) { return raw.days[k].dh.boil[h]; }) / cfg.dh.plant.boilerEff;
    A.boilerGas = boil; M.boiler = boil * P.price.gasCom; Z.boiler = boil * P.ef.gas;
    A.storeOut = raw.meta.dhOn ? wsum(P, function (k, h) { return raw.days[k].dh.so[h]; }) : 0;   // MWh of heat a year
    A.batOut = sum(A.d.map(function (o) { return o.batOut; })); A.unserved = sum(A.d.map(function (o) { return o.unserved; }));
    A.dhHeat = A.d[0].dhHeat;
    M.plant = mz.dhp * S.a.plant; U.plant = mz.dhp * S.capex.plant;
    M.store = mz.sto * S.a.store; U.store = mz.sto * S.capex.store;
    M.pv = mz.pvAdd * S.a.pv; U.pv = mz.pvAdd * S.capex.pv;
    M.bat = mz.batAdd * S.a.bat; U.bat = mz.batAdd * S.capex.bat;
    A.energy = M.elec + M.gas + M.propane + M.boiler + M.gasoline;
    // cars apart (their gasoline and their charging at each district's price; vehicle prices are not counted), so a
    // fuel saving from electric cars is never read as a saving from the buildings or the grid
    M.cars = M.gasoline + sum(A.d.map(function (o, i) { return o.ev * P.D[i].pEl; }));
    M.buildings = A.energy - M.cars;
    A.capital = M.hp + M.ret + M.net + M.plant + M.store + M.pv + M.bat + M.up;
    A.upfrontTotal = U.hp + U.ret + U.net + U.plant + U.store + U.pv + U.bat + U.up;
    A.co2Hub = Z.elec + Z.gas + Z.propane + Z.boiler + Z.gasoline;
    A.imp = sum(A.d.map(function (o) { return o.imp; }));
    A.cityPeak = raw.pkC;
    // outside the districts: the park, the campus, buses, trucks and farm machinery (C3 changes the park and adds farms)
    var O = { el: P.out.foodEl + P.out.fertEl + P.out.dcEl, gas: P.out.foodGas + P.out.fertGas, diesel: P.out.busDiesel + P.out.truckDiesel + P.out.farmDiesel, prop: P.out.farmProp, money: 0, co2: 0, farmUse: 0, farmGen: 0 };
    if (S.c3) {
      O.el += (S.ihpElMW + S.elyMW) * 8760;
      O.gas -= S.ihp * P.out.lowHeat / P.out.burner + S.ely * P.out.fertGas;
      if (raw.meta.farmOn) {
        O.farmUse = wsum(P, function (k, h) { return raw.days[k].farm.use[h]; });
        O.farmGen = wsum(P, function (k, h) { return raw.days[k].farm.gen[h]; });
      }
      M.wind = S.wind * S.a.wind; U.wind = S.wind * S.capex.wind;
      M.farm = S.farm * S.a.farm + (S.siteAdj && S.siteAdj.connectUSD ? S.siteAdj.connectUSD * crf(P.rate, cfg.c3.solarFarm.life) : 0);
      U.farm = S.farm * S.capex.farm + (S.siteAdj && S.siteAdj.connectUSD ? S.siteAdj.connectUSD : 0);
      M.ihp = S.ihpHeatMW * S.a.ihp; U.ihp = S.ihpHeatMW * S.capex.ihp;
      M.ely = S.elyMW * S.a.ely; U.ely = S.elyMW * S.capex.ely;
      M.farmSaved = -O.farmUse * S.av;
      A.capital += M.wind + M.farm + M.ihp + M.ely;
      A.upfrontTotal += U.wind + U.farm + U.ihp + U.ely;
    }
    O.money = O.el * P.price.ind + O.gas * P.price.gasInd + O.diesel * P.price.diesel + O.prop * P.price.propGal + (M.farmSaved || 0);
    // location-based: every MWh used at the grid's average rate; a contract does not change that rate, so its MWh are not
    // deducted (GHG Protocol Scope 2 Guidance). What a market-based report could claim for them, at the same average rate
    // and without a residual mix (a simplification), is kept apart in A.contract and never added to any total.
    O.co2 = O.el * efEl + O.gas * P.ef.gas + O.diesel * P.ef.diesel + O.prop * P.ef.propGal;
    A.contract = { mwh: O.farmUse, gen: O.farmGen, t: O.farmUse * P.ef.grid };
    A.outside = O;
    A.total = A.energy + A.capital;
    A.city = { money: A.total + O.money, co2: A.co2Hub + O.co2 };
    return A;
  }

  // ---------------------------------------------------------------- screening household outputs (an accounting layer)
  // Screening household outputs (§9.6) in two parts, never from the LP. (1) E3 spreads each measure's change in the homes'
  // energy over the five income groups, district by district: a group's potential for a measure is its eligible homes
  // times its use index (gas for heating measures, electricity for rooftop solar), filled by the plan's rule (even: every
  // group at the same rate; low or high: one group after another, lowest or highest income first), so each district's
  // changes add up to the engine's. Cars: the district's 2025 non-electric cars by group come from fuelMatrix (gasoline
  // by district and group, fitted to both totals), so an EV replaces only gasoline a group has. (2) Lesson A13's
  // accounting layer (LX.A13, assets/learn/components/whopays.js, in the bundle before this engine) turns the homes'
  // changes into money and burden: allocate(rows, cost, design, { kWh, spendDelta }), with the homes' energy changes at
  // 2025 residential prices as spendDelta (district heat billed at its average cost), and the households' share of the
  // shared costs (substation upgrades and batteries, by their share of the districts' electricity) recovered by the
  // plan's design (per kWh, a fixed charge, or by income). Burden = home energy spending / income (DOE LEAD); it leaves
  // transport out, so the charging the plan adds goes with motor fuel (at the residential price plus the shared costs'
  // rate per kWh), shown apart as transport. 2025's bills keep the few EVs charged at home in 2025, as prairie-city.json
  // counts them.
  // the 2025 cars' gasoline by district (rows) and income group (columns), gallons a year: each group's households times
  // its gasoline index, fitted by iterative proportional fitting so that each row adds to the district's non-electric
  // cars' gasoline and each column to the group's gasoline in prairie-city.json (scaled to the districts' total; the two
  // agree within rounding). Cached on P.
  function fuelMatrix(P) {
    if (P._fuelM) return P._fuelM;
    var G = P.groups, rows = P.D.map(function (D) { return (D.ldv - D.evs0) * P.galPerCar; });
    var cols = G.map(function (g) { return g.households * g.use.gasolineGal; }), kc = sum(rows) / sum(cols);
    cols = cols.map(function (c) { return c * kc; });
    var M = P.D.map(function (D, i) { return G.map(function (g, j) { return P.hhDG[i][j] * g.index.gasoline; }); });
    for (var it = 0; it < 500; it++) {
      M = M.map(function (r, i) { var s = sum(r); return r.map(function (x) { return x * rows[i] / s; }); });
      for (var j = 0; j < G.length; j++) { var s = 0; M.forEach(function (r) { s += r[j]; }); M.forEach(function (r) { r[j] *= cols[j] / s; }); }
    }
    P._fuelM = { M: M, rows: rows, cols: cols };
    return P._fuelM;
  }
  function spread(room, N, rule) {
    var n = room.map(function () { return 0; }), tot = sum(room);
    if (N <= 0 || tot <= 0) return n;
    N = Math.min(N, tot);
    if (rule === "even") return room.map(function (r) { return r / tot * N; });
    var order = room.map(function (x, j) { return j; });
    if (rule === "high") order.reverse();
    order.forEach(function (j) { var a = Math.min(room[j], N); n[j] = a; N -= a; });
    return n;
  }
  function households(P, S, A, A0) {
    var G = P.groups, ng = G.length, pr = P.price;
    // per group, summed: the homes' change (MWh, MWh of gas, MWh of propane, MWh of heat) and transport's (gallons of
    // gasoline; MWh of charging added)
    var D = { el: [], gas: [], prop: [], gal: [], dh: [], ev: [] };
    for (var g = 0; g < ng; g++) { D.el.push(0); D.gas.push(0); D.prop.push(0); D.gal.push(0); D.dh.push(0); D.ev.push(0); }
    var idx = function (g, c) { return G[g].index[c]; };
    var adopters = { hp: 0, ret: 0, dh: 0, ev: 0, pv: 0 }, clamp = false, FM = fuelMatrix(P);
    P.D.forEach(function (Dd, i) {
      var a = A.d[i], a0 = A0.d[i], H = P.hhDG[i], Hd = sum(H), r = Dd.rho;
      // measures: (1) heating systems switched at the 2025 envelope, (2) retrofits on the switched mix, (3) EVs, (4) solar
      var s0 = Dd.s0;
      var share = a.share, ret = a.retShare, Qr = r * Dd.Qann;
      var mix = function (sh) { return { el: Qr * (sh.res + sh.hp * Dd.eps), gas: Qr * sh.fuel * (1 - Dd.pf) / P.eta, prop: Qr * sh.fuel * Dd.pf / P.eta, dh: Qr * sh.dh }; };
      var m0 = mix(s0), m1 = mix(share);
      var changed = 1 - SYS.reduce(function (t, k) { return t + Math.min(share[k], s0[k] || 0); }, 0);
      var sw = { el: m1.el - m0.el, gas: m1.gas - m0.gas, prop: m1.prop - m0.prop, dh: m1.dh - m0.dh };
      var rt = { el: -S.save * ret * m1.el, gas: -S.save * ret * m1.gas, prop: -S.save * ret * m1.prop, dh: -S.save * ret * m1.dh };
      var meas = [
        // eligible homes: any home not already on a heat pump (the switch); every home (a retrofit, rooftop solar). The
        // rule decides which eligible homes adopt first.
        { n: changed * Hd, cap: Math.max(changed, 1 - s0.hp), dl: sw, key: "hp", idx: "gas" },
        { n: ret * Hd, cap: 1, dl: rt, key: "ret", idx: "gas" }];
      // the EVs: every car not already electric is eligible, in the group that drives it (fuelMatrix); each new EV
      // replaces one car's gasoline and adds one car's charging (transport, not home energy)
      var evN = S.d[i].evs - Dd.evs0;
      if (evN > 0) {
        adopters.ev += evN;
        var cars = spread(FM.M[i].map(function (gal) { return gal / P.galPerCar; }), evN, S.rule || "even");
        for (var gv = 0; gv < ng; gv++) { D.gal[gv] -= cars[gv] * P.galPerCar; D.ev[gv] += cars[gv] * P.evDay * 365; }
      }
      var pvHomes = a.pvAdd / 0.005;   // a 5 kW system a home (set for teaching)
      meas.push({ n: Math.min(pvHomes, Hd), cap: 1, dl: { el: -(a.pvUsed - a0.pvUsed) }, key: "pv", idx: "electricity" });
      meas.forEach(function (ms) {
        if (!(ms.n > 0) || !(ms.cap > 0)) return;
        adopters[ms.key] += ms.n;
        var pot = H.map(function (h, g) { return ms.cap * h * idx(g, ms.idx); }), f = Math.min(1, ms.n / (ms.cap * Hd));
        var got = spread(pot, f * sum(pot), S.rule || "even"), A = sum(got);
        if (A <= 0) return;
        ["el", "gas", "prop", "gal", "dh"].forEach(function (c) {
          var tot = ms.dl[c]; if (!tot) return;
          for (var g3 = 0; g3 < ng; g3++) D[c][g3] += tot * got[g3] / A;
        });
      });
    });
    // a group cannot cut more than it uses: where the measures together take a group's electricity, gas or propane below
    // zero (the same first adopters taking every measure under a rule), the rest of that cut passes to the next groups in
    // the rule's order (every group alike: in proportion to their remaining use). Totals are kept; settled says how
    // much moved (MWh). A cut larger than all the groups' use together cannot be spread: clamped.
    var mmh = P.city.units.mwhPerMMBtu, settled = { el: 0, gas: 0, prop: 0 };
    var use0 = { el: G.map(function (g) { return g.households * g.use.electricityKWh / 1000; }), gas: G.map(function (g) { return g.households * g.use.gasMMBtu * mmh; }),
      prop: G.map(function (g) { return g.households * g.use.propaneGal / P.galPerMWh; }) };
    ["el", "gas", "prop"].forEach(function (c) { var m = settle(use0[c], D[c], S.rule || "even"); if (m < 0) clamp = true; else settled[c] = m; });
    // district heat at its average cost (network, plant, store, energy); the households' share of the shared costs
    var meterMWh = sum(A.d.map(function (o) { return o.imp + o.pvUsed; }));
    var dhPrice = A.dhHeat > 0 ? (A.money.net + A.money.plant + A.money.store + A.money.boiler + A.d[0].plant * P.price.ind) / A.dhHeat : 0;
    var M = a13();
    if (!M) return null;
    // the shared costs' rate on every MWh the districts use ($/MWh): homes pay it on their kWh by the plan's design;
    // the charging the plan adds pays it per kWh, with transport
    var shared = A.money.up + A.money.bat, adder = meterMWh > 0 ? shared / meterMWh : 0;
    var rows = M.groupsFrom(P.city), kWh = {}, spendDelta = {}, resMWh = 0, evMWh = 0;
    rows.forEach(function (r, g) {
      var Hg = r.households, dEl = D.el[g] / Hg, dGas = D.gas[g] / Hg, dProp = D.prop[g] / Hg, dh = D.dh[g] / Hg;
      kWh[r.key] = r.kWh + dEl * 1000;
      if (kWh[r.key] < 0 || G[g].use.gasMMBtu * P.city.units.mwhPerMMBtu + dGas < -1e-9 || G[g].use.propaneGal / P.galPerMWh + dProp < -1e-9 || FM.cols[g] + D.gal[g] < -1e-6 * FM.cols[g]) clamp = true;
      spendDelta[r.key] = dEl * pr.res + dGas * pr.gasRes + dProp * pr.propMWh + dh * dhPrice;
      resMWh += Hg * kWh[r.key] / 1000;
      evMWh += D.ev[g];
    });
    var cost = shared * Math.min(1, resMWh / meterMWh), evCost = adder * evMWh;
    var al = M.allocate(rows, cost, S.rec || "kwh", { kWh: kWh, spendDelta: spendDelta });
    var two = M.regroup(al, [["g1", "g2", "g3"], ["g4", "g5"]]);
    var out = al.rows.map(function (x, g) {
      var gr = G[g], Hg = x.households, fuel0 = gr.spending.motorFuel;
      // motor fuel scales with the group's gasoline left (never below zero); charging at the residential price plus the
      // shared costs' rate
      var fuel = fuel0 * Math.max(0, 1 + D.gal[g] / FM.cols[g]), chg = D.ev[g] / Hg * (pr.res + adder);
      return { key: x.key, label: x.label, households: Hg, income: x.income, home0: x.spend, home: x.spendAfter, change: x.spendAfter - x.spend,
        burden0: x.burden, burden: x.burdenAfter, charge: x.charge, fuel0: fuel0, fuel: fuel, charging: chg, tr0: fuel0, tr: fuel + chg,
        tburden0: fuel0 / x.income, tburden: (fuel + chg) / x.income,
        d: { el: D.el[g] / Hg, gas: D.gas[g] / Hg, prop: D.prop[g] / Hg, gal: D.gal[g] / Hg, dh: D.dh[g] / Hg, ev: D.ev[g] / Hg } };
    });
    return { rows: out, low: { burden0: two[0].burden, burden: two[0].burdenAfter }, other: { burden0: two[1].burden, burden: two[1].burdenAfter },
      shared: shared, cost: cost, evCost: evCost, costAll: cost + evCost, adder: adder, evMWh: evMWh, design: al.design, rate: al.rate, dhPrice: dhPrice,
      adopters: adopters, clamped: clamp, settled: settled, rule: S.rule || "even", screening: M.SCREENING, a13: al };
  }
  // settle(use, d, rule): d (each group's change, MWh) is changed in place so that use + d >= 0 for every group, the
  // excess cut going to the next groups in the rule's order (even: in proportion to their remaining use); returns the MWh
  // moved, or -1 when the groups together cannot take the cut
  function settle(use, d, rule) {
    var n = use.length, ex = 0, g;
    for (g = 0; g < n; g++) if (use[g] + d[g] < 0) { ex += -(use[g] + d[g]); d[g] = -use[g]; }
    if (ex <= 1e-9) return 0;
    var moved = ex, room = use.map(function (u, j) { return Math.max(0, u + d[j]); }), tot = sum(room);
    if (tot < ex - 1e-9) return -1;
    if (rule === "even") { for (g = 0; g < n; g++) d[g] -= ex * room[g] / tot; return moved; }
    var order = room.map(function (x, j) { return j; }); if (rule === "high") order.reverse();
    order.forEach(function (j) { var t = Math.min(room[j], ex); d[j] -= t; ex -= t; });
    return moved;
  }
  // the household table's assumptions, one sentence each (beside the table, and in C3's note): the rule, what the
  // households pay of the plan and how, what is left out, how cars count (M12 review finding 4, C3 finding 7)
  var RULE_WORDS = { even: "every group alike", low: "lower incomes first", high: "higher incomes first" };
  var REC_WORDS = { kwh: "per kWh", fixed: "as the same fixed charge on every household", income: "in proportion to income" };
  function hhAssume(R) {
    var h = R && R.hh; if (!h) return [];
    return ["Who adopts first: " + RULE_WORDS[h.rule] + "; each group is its average household, changing by its district's average scaled by its use.",
      "Households pay " + millions(h.costAll) + " a year of the substation upgrades and batteries, " + REC_WORDS[h.design] + (h.evCost > 0.5 && h.design !== "kwh" ? " (the added charging's share per kWh)" : "") + "; the rest of the plan's cost is not in their bills.",
      "Burden is home energy bills ÷ income (DOE LEAD): equipment households buy is left out, and the charging the plan adds counts as transport, with motor fuel." +
        (h.dhPrice > 0 ? " District heat is billed at its average cost, $" + kilo(h.dhPrice) + " per MWh of heat." : "")].concat(
      h.settled && h.settled.el + h.settled.gas + h.settled.prop > 0.5 ? ["A group cannot cut more than it uses: " + kilo(h.settled.el + h.settled.gas + h.settled.prop) + " MWh of the cut passed to the next groups in the rule's order."] : []);
  }
  // LX.A13 (lesson A13's accounting layer, components/whopays.js): in the learn.js bundle on a page; Node requires it
  // from this folder
  function a13() {
    if (typeof window !== "undefined" && window.LX && window.LX.A13) return window.LX.A13;
    if (typeof require === "function") { try { return require("./whopays.js"); } catch (e) { return null; } }
    return null;
  }

  // ---------------------------------------------------------------- results: every number a page shows
  function summarize(state, P, raw, base) {
    var S = sysOf(state, P), A = account(P, S, raw);
    var A0 = base ? base.acc : A;
    var R = { state: state, sys: S, raw: raw, acc: A, base: base || null };
    R.hh = households(P, S, A, A0);
    R.delta = { cost: A.total - A0.total, co2: A.co2Hub - A0.co2Hub, city: A.city.co2 - A0.city.co2, cityCost: A.city.money - A0.city.money };
    R.dist = A.d.map(function (o, i) {
      // the busiest hour, its day, and the summed substation value (LP duals). Hours at the limit come from the slack
      // (the flow within 0.001 MW of the limit plus any upgrade), each representative hour counted for the days its day
      // stands for: hours a year (SB3 review finding 3). bindSlots: representative hours whose dual is positive.
      // need: the busiest hour of what the district asked of its substation (bought plus any load left unserved, which
      // only the full-year check allows); unservedHours: hours with more than 0.05 MW unserved (M3's threshold)
      var best = -1, at = null, val = 0, slots = 0, hrs = 0, top = o.limit + o.upg, need = -1, nat = null, uh = 0, um = 0;
      raw.days.forEach(function (d, k) { d.d[i].imp.forEach(function (v, h) {
        var u = d.d[i].un[h];
        if (v > best + 1e-9) { best = v; at = { k: k, h: h }; }
        if (v + u > need + 1e-9) { need = v + u; nat = { k: k, h: h }; }
        if (v >= top - 1e-3) hrs += P.w[k];
        if (u > 0.05) uh += P.w[k];
        if (u > um) um = u;
        if (d.d[i].lim[h] != null) { val += d.d[i].lim[h]; if (d.d[i].lim[h] > 1e-6) slots++; } }); });
      return { key: o.key, label: o.label, peak: o.peak, at: at, limit: o.limit, upg: o.upg, value: raw.days[0].d[i].lim[0] == null ? null : val, bindHours: hrs, bindSlots: slots, imp: o.imp, share: o.share,
        need: need, needAt: nat, unserved: o.unserved, unservedHours: uh, unservedMax: um };
    });
    R.money = A.money; R.co2 = A.co2;
    return R;
  }

  // ---------------------------------------------------------------- solving (the page path; never rejects)
  var CLAMPED = "the household layer could not spread this plan's changes without a group's use going below zero, so no household numbers are shown";
  var WORDS = { infeasible: "The plan cannot be run: some district needs more than its substation can carry, and upgrades are not allowed.",
    "time-limit": "The run reached its time limit before the solver proved a best plan, so no result is shown.", error: "The solver stopped with an error.",
    cancelled: "The run was stopped.", superseded: "A newer run replaced this one." };
  function solve(state, P, o) {
    o = o || {};
    var S = sysOf(state, P), t0 = Date.now();
    var sol = o.solver || (typeof window !== "undefined" && window.LX && window.LX.solver ? function (m, op) { return window.LX.solver.solve(m, op); } : null);
    if (!sol) return Promise.resolve({ status: "error", ok: false, kind: "lp", message: "No solver is available." });
    var tl = o.timeLimit || (o.attempt > 1 ? 30 : 10);
    function one(sys, opt) { var m = build(P, sys, opt); return Promise.resolve(sol(m, { timeLimit: tl, signal: o.signal })).then(function (r) { return { m: m, r: r }; }); }
    function fail(r, hint) { return { status: r.status, ok: false, kind: "lp", message: WORDS[r.status] || r.message || ("The solver reported " + r.status + "."), hint: hint || null, ms: Date.now() - t0 }; }
    var baseP = P._base && P._baseKey === JSON.stringify(baseState(state)) ? Promise.resolve(P._base) :
      one(sysOf(baseState(state), P), {}).then(function (x) {
        if (x.r.status !== "optimal") return { fail: x.r };
        var raw = read(P, sysOf(baseState(state), P), x.m, x.r), b = { raw: raw, acc: account(P, sysOf(baseState(state), P), raw) };
        P._base = b; P._baseKey = JSON.stringify(baseState(state)); return b;
      });
    return baseP.then(function (b) {
      if (b.fail) return fail(b.fail);
      return one(S, { size: o.size, cap: o.cap, retMax: o.retMax, dhMax: o.dhMax, pvMax: o.pvMax, batMax: o.batMax }).then(function (x) {
        if (x.r.status === "optimal") {
          var raw = read(P, S, x.m, x.r);
          return { status: "optimal", ok: true, kind: "lp", message: "", results: summarize(state, P, raw, b), ms: Date.now() - t0, model: { cols: x.m.variables.length, rows: x.m.constraints.length } };
        }
        if (x.r.status === "infeasible" && !S.up) {
          // the hint: run again with upgrades allowed to find each district's shortfall
          var S2 = sysOf(Object.assign(copy(state), { up: "yes" }), P);
          return one(S2, {}).then(function (y) {
            if (y.r.status !== "optimal") return fail(x.r, "Allow substation upgrades, or lower electric heating and cars.");
            var short = P.D.map(function (D, i) { return { label: D.label, mw: y.r.values["upg" + i] || 0 }; }).filter(function (q) { return q.mw > 0.05; });
            return fail(x.r, "Short by " + short.map(function (q) { return kilo(Math.ceil(q.mw)) + " MW in the " + q.label.toLowerCase(); }).join(" and ") +
              " in the busiest hour: manage EV charging, retrofit more buildings, add a heat store or batteries, or allow upgrades.");
          });
        }
        if (x.r.status === "infeasible" && o.cap != null) return fail(x.r, "No plan within these limits meets the cap: raise the cap, or allow more retrofits, heat pumps or district heat.");
        return fail(x.r);
      });
    }).then(null, function (e) { return { status: "error", ok: false, kind: "lp", message: "The run failed: " + (e && e.message || e), ms: Date.now() - t0 }; });
  }
  // ---------------------------------------------------------------- the full-year check (Node and the tests only)
  // A plan run on the eight days, re-run on all 8,760 hours of 2025 (PY: E3.prepare of prairie-city.json with its days
  // replaced by the 365 days of fullYear's rule; the tests build it, _tests/learn/e3_harness.js yearCity). The same LP
  // and the same constraints (storage and managed charging within each day, the tie rule), with what the eight days
  // decided kept: the building shares and sizes (fixedSys, for a plan the LP sized), and each district's upgrade
  // (upFixed). Load the substation cannot carry is left unserved at a penalty (cfg.fullYear.unservedPerMWh), never in a
  // reported cost. The 2025 plan is re-run the same way, so each change against 2025 is like for like. One LP of 80,000
  // to 240,000 columns for the year (a second one re-buys the upgrades): too slow for a click; the results are
  // precomputed (data/e3-full-year.json, rebuilt by _tests/learn/test_e3-full-year.js --write).
  function fixedSys(state, P, raw) {
    var S = sysOf(state, P), z = raw.sizes;
    S.pvAdd = z.pvAdd; S.batAdd = z.batAdd; S.dhp = z.dhp; S.sto = z.sto;
    S.dh = raw.y[0][0].dh + raw.y[0][1].dh;
    S.d.forEach(function (sd, i) {
      sd.y = [0, 1].map(function (e) { var q = {}; SYS.forEach(function (k) { q[k] = raw.y[i][e][k]; }); return q; });
      sd.pvAdd = z.pvAdd * P.pvShare[i]; sd.pv = P.D[i].pv0 + sd.pvAdd; sd.bat = z.batAdd * P.batShare[i];
    });
    S.fixed = true;
    return S;
  }
  // fullYear(state, P, PY, R8, o): R8 the eight days' results (E3.solve's results, or summarize's); o: { solver, timeLimit,
  // base } (base: the year's 2025 run from an earlier call, reused). Never rejects.
  function fullYear(state, P, PY, R8, o) {
    o = o || {};
    var sol = o.solver, pen = PY.cfg.fullYear.unservedPerMWh;
    function run(st, raw8) {
      var S = raw8.meta && raw8.meta.size ? fixedSys(st, PY, raw8) : sysOf(st, PY);
      var m = build(PY, S, { upFixed: raw8.upg, unserved: pen });
      return Promise.resolve(sol(m, { timeLimit: o.timeLimit || 600 })).then(function (r) {
        if (r.status !== "optimal") return { fail: r };
        return { raw: read(PY, S, m, r), S: S, model: { cols: m.variables.length, rows: m.constraints.length } };
      });
    }
    var bp = o.base ? Promise.resolve(o.base) : run(baseState(state), R8.base.raw).then(function (x) { return x.fail ? x : { raw: x.raw, acc: account(PY, x.S, x.raw), model: x.model }; });
    // the same plan with its upgrades bought on the year instead (when the plan allows upgrades): what the year would buy,
    // and each district's busiest hour then (pk: with flexible loads the least busiest hour the year allows)
    function rebuy(st, raw8) {
      var S = raw8.meta && raw8.meta.size ? fixedSys(st, PY, raw8) : sysOf(st, PY);
      if (!S.up) return Promise.resolve(null);
      var m = build(PY, S, {});
      return Promise.resolve(sol(m, { timeLimit: o.timeLimit || 600 })).then(function (r) {
        if (r.status !== "optimal") return { fail: r };
        var raw = read(PY, S, m, r), A = account(PY, S, raw);
        return { upg: raw.upg, pk: raw.pk, total: S.c3 ? A.city.money : A.total };
      });
    }
    return bp.then(function (b) {
      if (b.fail) return { status: b.fail.status, ok: false, message: b.fail.message };
      return run(state, R8.raw).then(function (x) {
        if (x.fail) return { status: x.fail.status, ok: false, message: x.fail.message };
        return rebuy(state, R8.raw).then(function (q) {
          if (q && q.fail) return { status: q.fail.status, ok: false, message: q.fail.message };
          return { status: "optimal", ok: true, results: summarize(state, PY, x.raw, b), base: b, rebuy: q, model: x.model };
        });
      });
    }).then(null, function (e) { return { status: "error", ok: false, message: String(e && e.message || e) }; });
  }
  // one time set's numbers as the check shows them (rounded once, here: the data file stores this; its test compares
  // fresh runs with it byte for byte). Money in $M (3 decimals), CO2 in t, MW to 0.001 (so a page's whole MW match the
  // eight days' own tables), energy in MWh (a short day's and a district's to 0.1). Only numbers the LP
  // fixes are kept: cost and CO2 of the plan as decided; each district's busiest hour and upgrade (on the year, from the
  // re-buy run q: the upgrades the year would buy); unserved energy day by day (days do not share storage or charging, so
  // each day's least unserved energy is unique; how it falls across a day's hours is not, so no hour is shown); the hour
  // of the busiest hour only for a plan with no flexible load (otherwise several hours can tie at it).
  function rnd(v, d) { var k = Math.pow(10, d == null ? 0 : d), x = Math.round(v * k) / k; return x === 0 ? 0 : x; }
  function flexible(R) { var S = R.sys; return S.evm === "managed" || R.acc.d.some(function (o) { return o.bat > 0; }) || (R.raw.meta.dhOn && (R.raw.sizes.sto || 0) > 0); }
  function fullView(R, P, q) {
    var A = R.acc, c3 = R.sys.c3, bat = sum(A.d.map(function (o) { return o.bat; })), fx = flexible(R);
    var when = function (at) { var d = P.days[at.k]; return { day: P.K === 365 ? d.date : d.key, h: at.h }; };
    var short = [];
    R.raw.days.forEach(function (d, k) { var u = 0; d.d.forEach(function (x) { u += sum(x.un); }); if (u * P.w[k] > 0.05) short.push({ day: P.days[k].date, mwh: rnd(u * P.w[k], 1) }); });
    return { cost: rnd((c3 ? A.city.money : A.total) / 1e6, 3), dCost: rnd((c3 ? R.delta.cityCost : R.delta.cost) / 1e6, 3),
      co2: rnd(c3 ? A.city.co2 : A.co2Hub), dCo2: rnd(c3 ? R.delta.city : R.delta.co2), flexible: fx,
      dist: R.dist.map(function (d, i) { return { key: d.key, peak: rnd(q ? q.pk[i] : d.peak, 3), limit: d.limit, upg: rnd(q ? q.upg[i] : d.upg, 3), at: fx ? null : when(d.needAt), unserved: rnd(d.unserved, 1) }; }),
      unserved: rnd(A.unserved), shortDays: short, batteryMW: rnd(bat, 1), batteryOut: rnd(A.batOut), storeMWh: rnd(R.raw.sizes.sto || 0), storeOut: rnd(A.storeOut),
      contractGWh: c3 ? rnd(A.contract.mwh / 1000, 1) : null, rebuyCost: q ? rnd(q.total / 1e6, 3) : null };
  }
  // the words of the check (pure; the pages and their tests read them). FY: data/e3-full-year.json; FYc: prairie-city.json
  // fullYear (the year's rule and sums); P: the eight days' prepared data (for the days' and districts' names)
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fdate(iso) { return +iso.slice(8, 10) + " " + MON[+iso.slice(5, 7) - 1]; }
  function andList(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function dateList(isos) { return andList(isos.map(fdate)); }
  function sgn(v, f) { return (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v)); }
  // the entry for a plan: its key is the plan link's, with the household table's two choices (who adopts first, how
  // shared costs are recovered) at their defaults, since they never change the LP; SS: LX.ShareState (or its Node module)
  function fullFind(FY, page, S, state, SS) {
    if (!FY || !FY.plans || !state) return null;
    var st = copy(state); delete st.siteInfo;
    S.fields.forEach(function (f) { if (f.id === "rule" || f.id === "rec") st[f.id] = f.def; });
    var k; try { k = SS.encode(S, st); } catch (e) { return null; }
    var ok = page === "c3" ? ["c3"] : ["sb3", "m12"];
    return FY.plans.filter(function (e) { return e.key === k && ok.indexOf(e.page) >= 0; })[0] || null;
  }
  function fullById(FY, page, id) { return FY && FY.plans ? FY.plans.filter(function (e) { return e.page === page && e.id === id; })[0] || null : null; }
  // the card's rows: [what, eight days, full year, gap]
  function fullRows(e, P) {
    var D = e.days, Y = e.year, c3 = e.page === "c3";
    var lab = function (key) { var d = P.days.filter(function (x) { return x.key === key; })[0]; return d ? d.label.toLowerCase() : key; };
    var grid = function (d, yr) { return kilo(d.peak) + " MW, " + (d.upg >= 0.5 ? kilo(d.upg) + " MW over its " + kilo(d.limit) + " MW limit" : "within its " + kilo(d.limit) + " MW limit") + (d.at ? " (" + (yr ? fdate(d.at.day) : lab(d.at.day)) + ", " + hh(d.at.h) + ")" : ""); };
    var dmw = function (v) { return Math.abs(v) < 0.5 ? "same" : sgn(Math.round(v), function (x) { return kilo(x) + " MW"; }); };
    var rows = [[(c3 ? "The city's yearly cost against 2025" : "Yearly cost against 2025") + " (no penalty on unserved energy)", millions(D.dCost * 1e6), millions(Y.dCost * 1e6), Math.abs(Y.dCost - D.dCost) < 0.05 ? "under $0.1M" : sgn(Y.dCost - D.dCost, function (x) { return millions(x * 1e6); })],
      [c3 ? "The city's CO₂ a year" : "The districts' CO₂ a year", kilo(D.co2) + " t", kilo(Y.co2) + " t", sgn(Y.co2 / D.co2 - 1, function (x) { return pct(x, 2); })]];
    if (e.cap != null) rows.push(["Against the CO₂ cap, " + kilo(e.cap) + " t", D.co2 <= e.cap + 0.5 ? "within" : kilo(D.co2 - e.cap) + " t over", Y.co2 <= e.cap + 0.5 ? "within" : kilo(Y.co2 - e.cap) + " t over", ""]);
    D.dist.forEach(function (d, i) { rows.push([P.D[i].label + ": busiest hour, and the upgrade it needs", grid(d, false), grid(Y.dist[i], true), dmw(Y.dist[i].peak - d.peak)]); });
    rows.push(["Unserved, with only the eight days' upgrades", "none (sized on these days)", Y.unserved < 0.5 ? "none" : kilo(Y.unserved) + " MWh on " + dateList(Y.shortDays.map(function (x) { return x.day; })), ""]);
    if (D.batteryMW > 0) rows.push(["Batteries: MWh out a year", kilo(D.batteryOut), kilo(Y.batteryOut), sgn(Math.round(Y.batteryOut - D.batteryOut), kilo)]);
    if (D.storeMWh > 0) rows.push(["Heat store: MWh of heat out a year", D.storeOut < 0.5 ? "not used" : kilo(D.storeOut), Y.storeOut < 0.5 ? "not used" : kilo(Y.storeOut), Math.max(D.storeOut, Y.storeOut) < 0.5 ? "" : sgn(Math.round(Y.storeOut - D.storeOut), kilo)]);
    if (c3 && Math.max(D.contractGWh, Y.contractGWh) > 0) rows.push(["Contract wind and solar the city used", kilo(D.contractGWh) + " GWh", kilo(Y.contractGWh) + " GWh", sgn(Y.contractGWh / D.contractGWh - 1, function (x) { return pct(x, 1); })]);
    return rows;
  }
  // the gaps in plain words, one idea a line: [[label, text]]
  function fullWhy(e, FYc, date) {
    var D = e.days, Y = e.year, out = [], c3 = e.page === "c3";
    var gap = Math.max(Math.abs(Y.cost / D.cost - 1), Math.abs(Y.co2 / D.co2 - 1));
    var extra = sum(Y.dist.map(function (y, i) { return y.upg - D.dist[i].upg; })), up = sum(D.dist.map(function (d) { return d.upg; }));
    var most = Math.max.apply(null, Y.dist.map(function (y, i) { return y.peak - D.dist[i].peak; }));
    var ua = 1 - FYc.degreeHoursDays / FYc.degreeHours;   // the year's heat-loss rate against the eight days' (same heat need)
    out.push(["The check", "the plan as the eight days decided it (shares, sizes, substation upgrades), run on every hour of 2025 with the same model. Precomputed on " + date + ": too large for a click."]);
    out.push(["Two runs", "cost, CO₂ and unserved energy keep the eight days' upgrades; the busiest hours and upgrades come from a second run with the upgrades sized on the year."]);
    out.push(["What holds", "yearly cost and CO₂, within " + (gap < 0.001 ? "0.1%" : "about " + pct(gap, 1)) + ": like the days, the year is scaled to the city's annual base and heat energy (its heat-loss rate " + pct(ua, 1) + " lower)."]);
    var cost = extra * e.upYearly;
    out.push(["Three cold days", "the design day stands for 3 days: in the year, " + dateList(FYc.designDays) + ", equally cold. Only their base load (SPP's demand) differs, and February's is higher in the hours that matter."]);
    out.push(["The grid", Y.unserved >= 0.5 ? "the eight days' upgrades leave " + kilo(Y.unserved) + " MWh unserved on " + dateList(Y.shortDays.map(function (x) { return x.day; })) + " (load the model's substations cannot carry). Sized on the year, the plan buys " + (extra).toFixed(1) + " MW more, about " + (cost < 1e5 ? money(Math.round(cost / 1000) * 1000) : millions(cost)) + " a year."
      : "every hour of the year stays within the limits" + (up >= 0.5 ? " and the eight days' upgrades" : "") + (most >= 0.5 ? "; the busiest hour is up to " + kilo(most) + " MW higher than on the eight days." : ".")]);
    if (c3 && Math.max(D.contractGWh, Y.contractGWh) > 0) out.push(["Wind and sun", "the eight days are picked by their shapes, not scaled: " + pct(FYc.windCF.days, 1) + " wind and " + pct(FYc.solarCF.days, 1) + " solar capacity factors, against 2025's " + pct(FYc.windCF.year, 1) + " and " + pct(FYc.solarCF.year, 1) + ". Hence the contract row and the cost gap."]);
    out.push(["Not tested", "another weather year, cold beyond the design day, or storage from one day to the next: the year uses the eight days' synthetic weather rule."]);
    return out;
  }
  // one line per plan, for a page that compares plans (M12): [plan, cost against 2025, CO2 gap, upgrades, unserved]
  function fullPlanRow(e, label) {
    var D = e.days, Y = e.year, up = function (V) { return sum(V.dist.map(function (d) { return d.upg; })); };
    return [label || e.label, millions(D.dCost * 1e6) + " → " + millions(Y.dCost * 1e6), sgn(Y.co2 / D.co2 - 1, function (x) { return pct(x, 2); }),
      kilo(up(D)) + " → " + kilo(up(Y)) + " MW", Y.unserved < 0.5 ? "none" : kilo(Y.unserved) + " MWh"];
  }

  // the 2025 plan the results are compared with: today's buildings, cars and solar, with the plan's own cost settings
  function baseState(state) {
    var b = copy(state);
    ["hp", "ret", "dh", "dhp", "sto", "pv", "bat"].forEach(function (k) { b[k] = 0; });
    b.ev = 1; b.evm = "home"; b.up = "yes";
    if (b.ihp != null) { b.ihp = 0; b.ely = 0; b.wind = 0; b.farm = 0; }
    return b;
  }

  // ---------------------------------------------------------------- words for the pages and the note
  function planRows(state, S) {
    var out = [["Heat pumps", state.hp + "% of furnaces and resistance heat switched"], ["Retrofits", state.ret + "% of buildings, saving " + state.save + "% of their heat"],
      ["District heat", state.dh > 0 ? state.dh + "% of the core's heat; heat pump " + kilo(state.dhp) + " MW, store " + kilo(state.sto) + " MWh" : "none"],
      ["Electric cars", state.ev + "% of cars, " + (state.evm === "managed" ? "managed charging" : "unmanaged charging")],
      ["Rooftop solar added", kilo(state.pv) + " MW"], ["Batteries", kilo(state.bat) + " MW (4 hours)"], ["Substation upgrades", state.up === "yes" ? "allowed at $" + kilo(state.upc) + "/kW" : "not allowed"]];
    if (S && S.c3) out.push(["Industrial park", state.ihp + "% of the food plants' low-temperature heat from heat pumps; " + state.ely + "% of the hydrogen from electrolysis"],
      ["Wind contract", kilo(state.wind) + " MW"], ["Solar farm", kilo(state.farm) + " MW at site " + state.site]);
    return out;
  }
  function note(state, R, P, o) {
    o = o || {};
    var A = R.acc, A0 = R.base ? R.base.acc : A, c3 = R.sys.c3;
    var res = [
      { label: "Change in the yearly cost against 2025", value: millions(c3 ? R.delta.cityCost : R.delta.cost), note: "energy plus equipment and upgrades as yearly payments, 2025 dollars" },
      { label: "CO₂ a year", value: kilo(c3 ? A.city.co2 : A.co2Hub) + " t (" + (Math.abs(R.delta[c3 ? "city" : "co2"]) < 0.5 ? "as in 2025" : (R.delta[c3 ? "city" : "co2"] < 0 ? "−" : "+") + pct(Math.abs((c3 ? R.delta.city : R.delta.co2) / (c3 ? A0.city.co2 : A0.co2Hub))) + " against 2025") + ")", note: c3 ? "the whole city, location-based, operating only" : "the three districts' buildings and cars, location-based, operating only" },
      { label: "Busiest hour against the limit", value: R.dist.map(function (d) { return d.label + " " + kilo(d.peak) + "/" + kilo(d.limit) + " MW"; }).join("; "), note: "on the eight representative days" },
      { label: "Substation upgrades", value: kilo(sum(R.dist.map(function (d) { return d.upg; }))) + " MW", note: "the model buys only what the busiest hour needs" },
      { label: "Energy burden, homes below 80% of area median income", value: R.hh.clamped ? "not shown" : pct(R.hh.low.burden, 1) + " (2025: " + pct(R.hh.low.burden0, 1) + ")",
        note: R.hh.clamped ? CLAMPED : "screening estimate, not from the LP" }];
    if (c3) res.splice(1, 0, { label: "Up-front spending, 2026 to 2040", value: millions(A.upfrontTotal, 0), note: "against a budget of " + millions(P.cfg.c3.budget.def * 1e6, 0) });
    if (c3 && A.contract && A.contract.mwh > 0) res.splice(3, 0, { label: "Contract wind and solar the city used", value: kilo(A.contract.mwh / 1000) + " GWh a year",
      note: "not deducted from the location-based CO₂; a market-based claim: about " + kilo(A.contract.t) + " t" });
    return { heading: o.heading || (c3 ? "Prairie City 2040: the energy plan" : "Prairie City: a plan for the three districts"),
      made: o.made || "the City Planner (engine E3, a linear program)", plan: planRows(state, R.sys).map(function (r) { return { label: r[0], value: r[1] }; }),
      results: res,
      assumptions: assumptions(state, R, P),
      limits: ["Bills, burden and jobs are screening estimates, not predictions: an accounting layer gives them, not the energy model.",
        "Storage is cyclic within each day: no heat or charge carried between representative days.",
        "No power-flow physics inside a district, no outages, no change in population or prices to 2040."] };
  }
  // the run's assumptions, one sentence each: the model's, then the plan's own (managed charging, the boiler, the
  // contracts), then the household table's (hhAssume)
  function assumptions(state, R, P) {
    var c3 = R.sys.c3, out = ["Prairie City is fictional; its numbers are illustrative.", "2025 dollars, prices, people and homes; synthetic weather (NOAA's 1991-2020 normals on SPP's 2025 days).",
      "Eight representative days stand for the year, the design and peak days kept; full-year checks cover the presets.",
      "One substation per district (a teaching simplification), its limit a ceiling on each hour's flow.",
      "CO₂ location-based: eGRID's 2023 SPP North rate plus 5% losses; fuels at EIA's coefficients."];
    if (state.evm === "managed") out.push("Managed cars are plugged in at home or work when needed; a day's charge takes 6 hours or more.");
    if (state.dh > 0) out.push("The heat network's gas boiler exists already: its fuel counts, not its construction.");
    if (c3 && (state.wind > 0 || state.farm > 0)) out.push("A contract MWh the city uses is worth $" + kilo(state.av) + " (set for teaching); it does not lower the location-based CO₂.");
    return out.concat(hhAssume(R));
  }

  // ---------------------------------------------------------------- the no-JS blocks
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // a plain table for a no-JS block; colCls: each column's class after the first (default "n", a number)
  function tableHTML(head, rows, cls, colCls) {
    return '<div class="lx-scroll-x"><table class="lx-facts' + (cls ? " " + cls : "") + '"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return i ? '<td class="' + ((colCls && colCls[i]) || "n") + '">' + esc(c) + "</td>" : "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function fallback(P, key) {
    var pre = P.cfg.precomputed && P.cfg.precomputed[key];
    if (!pre) return '<p class="lx-hint">With JavaScript on, the bench runs the plan in your browser.</p>';
    return tableHTML([pre.head, "Value"], pre.rows) + '<p class="lx-hint">' + esc(pre.note) + "</p>";
  }
  // the inputs table (no-JS and the sources step). o.c3: C3's rows too; o.fixed: the page fixes the teaching costs at
  // their defaults (M12), else the reader sets them on the bench. Every value is read from the two data files.
  function inputsHTML(P, o) {
    o = o || {};
    var cfg = P.cfg, c = P.city, cop = c.cop, dh = cfg.dh, src = c.sources;
    var head = P.D.map(function (D) { return Math.round((D.L / c.districts[D.i].peak2025MW - 1) * 100) + "%"; });
    var where = o.fixed ? "set for teaching (illustrative); fixed here at the defaults: change them in the City Planner or the notebook" : "set for teaching (illustrative): the defaults, which you change on the bench";
    var rows = [
      ["Substation limits: core · suburbs · fringe", P.D.map(function (D) { return kilo(D.L); }).join(" · ") + " MW", "prairie-city.json: each district's 2025 busiest hour × 1.15, rounded up to the next 10 MW (" + head.slice(0, 2).join(", ") + " and " + head[2] + " above it; teaching)"],
      ["Electricity, Kansas 2025: homes · businesses", (P.price.res / 10).toFixed(2) + "¢ · " + (P.price.com / 10).toFixed(2) + "¢ per kWh", c.sources[c.prices.electricitySrc].title + " (EIA)"],
      ["Gas, Kansas 2025: homes · businesses", "$" + c.prices.gasPerMcf.residential.toFixed(2) + " · $" + c.prices.gasPerMcf.commercial.toFixed(2) + " per thousand cubic feet", c.sources["eia-ng-ks"].title + " (EIA)"],
      ["Grid CO₂", kilo(c.emissions.gridLbPerMWh.sppNorth) + " lb per MWh, plus " + pct(P.ef.loss) + " losses", "EPA eGRID2023, SPP North"],
      ["Heat pump COP, an illustrative curve", copAt(cop, cop.anchorC).toFixed(1) + " at " + num(cop.anchorC) + " °C; " + copAt(cop, 0).toFixed(1) + " at 0 °C; 1 below " + num(cop.cutoutC) + " °C",
        "anchored to DOE's cold-climate challenge target, " + cop.anchorCOP + " at " + num(cop.anchorC) + " °C (" + src[cop.src].publisher + ", " + src[cop.src].date.split(" (")[0] + "); the rest is the course's curve (lesson F3), with resistance backup assumed below " + num(cop.cutoutC) + " °C"],
      ["Heat pump, per home", money(cfg.heatPump.capex) + ", " + cfg.heatPump.life + " years", "EIA AEO2026, residential (2022 dollars, converted)"],
      ["Rooftop solar", money(cfg.rooftop.capex) + " per kW, " + cfg.rooftop.life + " years", "EIA AEO2026, residential (2022 dollars, converted)"],
      ["Battery, 4 hours", money(cfg.battery.capex) + " per kW, " + cfg.battery.life + " years", "NREL 2025 update (2024 dollars, converted)"],
      ["Retrofit: cost a home · heat saved · life", money(cfg.retrofit.cost.def) + " · " + cfg.retrofit.save.def + "% · " + cfg.retrofit.life + " years", where],
      ["Heat network: per home-equivalent · plant heat pump · heat store", money(dh.network.cost.def) + " (" + dh.network.life + " years) · " + money(dh.plant.capex.def) + " per kW of heat, COP " + dh.plant.cop + " (" + dh.plant.life + " years) · " + money(dh.store.capex.def) + " per MWh (" + dh.store.life + " years)",
        "set for teaching (illustrative); " + pct(dh.loss) + " of the heat lost in the pipes; the gas boiler (" + pct(dh.plant.boilerEff) + ") is assumed to exist already: its fuel is counted, not its construction"],
      ["Substation upgrade", money(cfg.upgrade.capex.def) + " per kW, " + cfg.upgrade.life + " years", where],
      ["Managed charging", "any hours of the same day, at most a " + (cfg.ev.minHours === 6 ? "sixth" : "1/" + cfg.ev.minHours) + " of the day's charge in one hour", "set for teaching: cars plugged in at home or work whenever needed (an upper bound on what managed charging can do)"],
      ["Yearly payments", pct(P.rate) + " real, over each item's life", "lesson 13's rate (NLR ATB 2025)"]];
    if (o.c3) {
      var c3 = cfg.c3, gi = c.prices.gasIndustrialInputs;
      rows.push(["Gas, the industrial park", "$" + c.prices.gasPerMcf.industrial.toFixed(2) + " per thousand cubic feet", "set for teaching from EIA: Kansas's 2025 citygate price ($" + gi.citygate2025.toFixed(2) + ") × its 2024 ratio of industrial to citygate price (" + gi.industrial2024.toFixed(2) + " / " + gi.citygate2024.toFixed(2) + "); EIA publishes no 2025 Kansas industrial price"],
        ["Wind farm · solar farm", money(c3.wind.capex) + " · " + money(c3.solarFarm.capex) + " per kW, " + c3.wind.life + " years", "EIA AEO2026, electricity (2025 dollars; via lesson 13)"],
        ["Electrolyzer", money(c3.electrolyzer.capex) + " per kW, " + c3.electrolyzer.life + " years; 57.5 kWh per kg", "DOE Record 24005 (2022 dollars, converted)"],
        ["Industrial heat pump · value of a contract MWh", money(c3.indHP.capex) + " per kW of heat · $" + c3.avoided.def + "/MWh", "set for teaching (illustrative)"],
        ["Budget, up front 2026 to 2040", "$" + kilo(c3.budget.def) + " million", "set for teaching (illustrative)"]);
    }
    return tableHTML(["Input", "Value", "Source"], rows, "e3-inputs", [null, "n", "s"]);
  }
  function num(v) { return (v < 0 ? "−" : "") + Math.abs(v); }

  var E3 = { prepare: prepare, sb3Schema: sb3Schema, c3Schema: c3Schema, presets: presets, c3presets: c3presets, defaults: defaults, withPreset: withPreset,
    sysOf: sysOf, build: build, read: read, account: account, households: households, spread: spread, settle: settle, a13: a13, summarize: summarize, solve: solve, baseState: baseState, fixedSys: fixedSys, fullYear: fullYear, fullView: fullView, fullFind: fullFind, fullById: fullById, fullRows: fullRows, fullWhy: fullWhy, fullPlanRow: fullPlanRow, dateList: dateList,
    note: note, assumptions: assumptions, hhAssume: hhAssume, fuelMatrix: fuelMatrix, CLAMPED: CLAMPED, planRows: planRows, fallback: fallback, inputsHTML: inputsHTML, tableHTML: tableHTML, hubFixedCO2: hubFixedCO2, parkMW: parkMW,
    crf: crf, yearly: yearly, copAt: copAt, kilo: kilo, money: money, millions: millions, pct: pct, hh: hh, SYS: SYS, WORDS: WORDS };
  if (typeof module !== "undefined" && module.exports) module.exports = E3;
  if (typeof window === "undefined" || !window.LX) return;
  window.LX.E3 = E3;

  // ---------------------------------------------------------------- view kit, shared by SB3, M12 and C3 (LX.E3.ui)
  var LX = window.LX, H = LX.H;
  var DCOL = ["var(--lx-demand)", "var(--lx-tier-4)", "var(--lx-wind)"];
  function fmtOf(f) {
    var u = f.unit;
    if (u === "%") return function (v) { return v + "%"; };
    if (u === "$/kW" || u === "$/home") return function (v) { return "$" + kilo(v) + (u === "$/kW" ? "/kW" : " a home"); };
    if (u === "$/MWh") return function (v) { return "$" + kilo(v) + "/MWh"; };
    return function (v) { return kilo(v) + " " + u; };
  }
  function seg(host, label, values, names, value, onPick) {
    var el = H("div", { class: "lx-seg e3-seg", role: "group", "aria-label": label }, host), bs = {};
    values.forEach(function (v) {
      var b = H("button", { type: "button", text: names[v], "aria-pressed": v === value ? "true" : "false" }, el);
      b.addEventListener("click", function () { set(v); onPick(v); });
      bs[v] = b;
    });
    function set(v) { values.forEach(function (x) { bs[x].setAttribute("aria-pressed", x === v ? "true" : "false"); }); }
    return { el: el, set: set, buttons: bs };
  }
  // controls from a schema, in groups [{ title, hint, color, fields: [ids] }]; returns { set(plan), ctl }
  function controls(host, S, plan, groups, onChange) {
    var ctl = {};
    groups.forEach(function (g) {
      var fs = H("fieldset", { class: "lx-sb-group" }, host);
      H("legend", { text: g.title }, fs);
      if (g.hint) H("p", { class: "lx-hint e3-ghint", html: LX.rich(g.hint) }, fs);
      g.fields.forEach(function (id) {
        var f = S.fields.filter(function (x) { return x.id === id; })[0];
        if (!f) return;
        if (f.type === "enum") {
          var row = H("div", { class: "e3-segrow" }, fs);
          H("span", { class: "e3-segl", text: f.label }, row);
          ctl[id] = seg(row, f.label, f.values, f.names, plan[id], function (v) { var p = copy(plan); p[id] = v; onChange(p); });
        } else {
          ctl[id] = LX.Slider(fs, { label: f.label, color: g.color || "var(--lx-ink-2)", min: f.min, max: f.max, step: f.step, value: plan[id], fmt: fmtOf(f),
            onChange: function (v) { var p = copy(plan); p[id] = v; onChange(p); } });
        }
      });
    });
    return { ctl: ctl, set: function (p) { plan = p; for (var k in ctl) ctl[k].set(p[k]); } };
  }
  function stopper() {
    var b = null, run = null;
    return { busy: function (on) { if (b) b.hidden = !on; },
      attach: function (r) { run = r; b = H("button", { class: "lx-btn ghost small e3-stop", type: "button", text: "Stop", hidden: true });
        r.button.parentNode.insertBefore(b, r.again);
        b.addEventListener("click", function () { if (!run.running()) return; run.cancel(); run.button.focus(); }); return b; } };
  }
  function table(host, head, rows, cls) {
    var sx = H("div", { class: "lx-scroll-x" }, host), tb = H("table", { class: "lx-facts e3-lab " + (cls || "") }, sx), hr = H("tr", null, H("thead", null, tb)), bd = H("tbody", null, tb);
    head.forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
    rows.forEach(function (r) { var tr = H("tr", r.cls ? { class: r.cls } : null, bd); (r.cells || r).forEach(function (c, i) { var cell = H(i ? "td" : "th", i ? { class: "n", "data-l": head[i] } : { scope: "row" }, tr); cell.textContent = c; }); });
    return tb;
  }
  // the readouts beside the bench: [label, value, tone]
  function readouts(R) {
    var up = sum(R.dist.map(function (d) { return d.upg; })), worst = R.dist.slice().sort(function (a, b) { return b.peak / b.limit - a.peak / a.limit; })[0];
    var dCars = R.acc.money.cars - (R.base ? R.base.acc.money.cars : R.acc.money.cars);
    return [R.sys.c3 ? ["Yearly cost against 2025, the whole city", millions(R.delta.cityCost), ""] : ["Buildings and grid, a year, against 2025", (R.delta.cost - dCars > 0 ? "+" : "") + millions(R.delta.cost - dCars), ""],
      ["CO₂ against 2025", (R.delta[R.sys.c3 ? "city" : "co2"] > 0 ? "+" : "−") + kilo(Math.abs(R.delta[R.sys.c3 ? "city" : "co2"])) + " t", R.delta[R.sys.c3 ? "city" : "co2"] > 0 ? "bad" : "good"],
      ["Busiest substation", worst.label + " " + kilo(worst.peak) + " of " + kilo(worst.limit) + " MW", worst.peak > worst.limit + 0.5 ? "warn" : ""],
      ["Upgrades bought", kilo(up) + " MW", up > 0.5 ? "warn" : "good"]];
  }
  // one district's day: what it bought through the substation, its loads, its rooftop solar, and the limit
  function DayView(host, P, o) {
    o = o || {};
    var el = H("div", { class: "e3-day" }, host), R = null, di = 0, k = 0;
    var top = H("div", { class: "e3-pick" }, el);
    var dseg = seg(top, "District", [0, 1, 2], { 0: P.D[0].label, 1: P.D[1].label, 2: P.D[2].label }, 0, function (v) { di = v; draw(); });
    var lab = H("label", { class: "e3-sel-l" }, top); H("span", { text: "Day" }, lab);
    var sel = H("select", { class: "e3-sel" }, lab);
    P.days.forEach(function (d, i) { H("option", { value: String(i), text: d.label + " (" + d.weight + (d.weight === 1 ? " day)" : " days)") }, sel); });
    sel.addEventListener("change", function () { k = +sel.value; draw(); });
    var plot = LX.Plot(el, { caption: true, text: "Text version: the hours of this day", box: true });
    var say = H("p", { class: "lx-hint e3-day-say", "aria-live": "polite" }, el);
    function draw() {
      if (!R) return;
      var d = R.raw.days[k].d[di], D = P.D[di], lim = D.L, up = R.dist[di].upg;
      var load = d.imp.map(function (v, h) { return v + d.pv[h] + d.bd[h] - d.bc[h]; });   // what the district used that hour
      var top = Math.max(lim + up, Math.max.apply(null, load), Math.max.apply(null, d.imp)) * 1.12;
      var step = top > 300 ? 100 : top > 120 ? 50 : 20;
      var bi = 0; d.imp.forEach(function (v, h) { if (v > d.imp[bi] + 1e-9) bi = h; });
      var refs = [{ y: lim, label: "Limit " + kilo(lim) + " MW", dash: "6 4", color: "var(--lx-bad)" }];
      if (up > 0.05) refs.push({ y: lim + up, label: "With the upgrade " + kilo(lim + up) + " MW", dash: "2 3", color: "var(--lx-warn)" });
      var lines = [{ values: load, x0: 0.5, color: "var(--lx-ink-3)", dash: "5 4", width: 2, step: false },
        { values: d.imp, x0: 0.5, color: DCOL[di], area: 0.12, width: 2.6 }];
      if (d.pvAvail.some(function (v) { return v > 0.05; })) lines.push({ values: d.pv, x0: 0.5, color: "var(--lx-solar)", width: 2 });
      plot.render({ x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [12, "12"], [24, "24"]] },
        y: { min: 0, max: Math.ceil(top / step) * step, step: step, fmt: function (v) { return kilo(v); }, unit: "MW" }, refs: refs, lines: lines,
        marks: [{ x: bi + 0.5, y: d.imp[bi], label: kilo(d.imp[bi]) + " MW at " + hh(bi), kind: "dot", pos: "above" }],
        caption: D.label + ", " + P.days[k].label.toLowerCase() + " (" + P.days[k].date + ")",
        legend: [{ label: "Bought through the substation", color: DCOL[di] }, { label: "Used in the district", color: "var(--lx-ink-3)", dash: "5 4" }].concat(lines.length > 2 ? [{ label: "Rooftop solar used", color: "var(--lx-solar)" }] : []),
        tip: function (x) { var h = Math.max(0, Math.min(23, Math.floor(x))); return "<div><b>" + hh(h) + "</b></div><div>Bought " + kilo(d.imp[h]) + " MW</div><div>Used " + kilo(load[h]) + " MW</div>" + (d.lim[h] > 0.5 ? "<div>Room worth $" + kilo(d.lim[h]) + " per MW a year</div>" : ""); },
        aria: "Hourly chart: " + D.label + ", " + P.days[k].label + ". Busiest hour " + hh(bi) + " at " + kilo(d.imp[bi]) + " MW against a limit of " + kilo(lim) + " MW.",
        text: { head: ["Hour", "Bought (MW)", "Used (MW)", "Base", "Heating", "EV charging", "Rooftop solar used", "Battery in − out", "Value of 1 MW more room ($ a year)"],
          rows: d.imp.map(function (v, h) { return [hh(h), kilo(v), kilo(load[h]), kilo(d.base[h]), kilo(d.heat[h] + d.plant[h]), kilo(d.ev[h]), kilo(d.pv[h]), kilo(d.bc[h] - d.bd[h]), d.lim[h] == null ? "–" : kilo(d.lim[h])]; }) } }, true);
      say.textContent = "Busiest hour " + hh(bi) + ": " + kilo(d.imp[bi]) + " MW bought against the " + kilo(lim) + " MW limit" + (up > 0.05 ? " (" + kilo(up) + " MW of upgrade bought for the year's busiest hour)." : ".");
    }
    return { el: el, set: function (r, pick) { R = r; if (pick) { di = pick.d; k = pick.k; dseg.set(di); sel.value = String(k); } draw(); }, draw: draw };
  }
  // the LP's duals: what 1 MW more room at each substation is worth, hour by hour, summed over the year
  function valueRows(P, R) {
    return R.dist.map(function (d, i) {
      var hours = [];
      R.raw.days.forEach(function (day, k) { day.d[i].lim.forEach(function (v, h) { if (v > 0.5) hours.push({ k: k, h: h, v: v }); }); });
      hours.sort(function (a, b) { return b.v - a.v; });
      return { label: d.label, value: d.value, hours: hours, upg: d.upg };
    });
  }
  function costRows(R) {
    var M = R.acc.money, M0 = R.base ? R.base.acc.money : M, c3 = R.sys.c3;
    var eq = function (A) { var m = A.money; return m.hp + m.ret + m.net + m.plant + m.store + m.pv + m.bat; };
    var rows = [["Buildings' energy: electricity, gas, propane, the network's boiler", M0.buildings, M.buildings],
      ["Cars' fuel and charging (vehicle prices not counted)", M0.cars, M.cars],
      ["Equipment, as yearly payments", eq(R.base ? R.base.acc : R.acc), eq(R.acc)],
      ["Substation upgrades, as yearly payments", M0.up, M.up]];
    if (c3) {
      var O = R.acc.outside, O0 = R.base ? R.base.acc.outside : O, ex = function (m) { return (m.wind || 0) + (m.farm || 0) + (m.ihp || 0) + (m.ely || 0); };
      rows.push(["Park, campus, buses, trucks and farms: their energy, less the contract MWh's value", O0.money, O.money], ["Wind, solar farm and the park's new equipment, yearly", ex(M0), ex(M)]);
    }
    var t0 = rows.reduce(function (s, r) { return s + r[1]; }, 0), t1 = rows.reduce(function (s, r) { return s + r[2]; }, 0);
    rows.push(["Total a year", t0, t1]);
    return rows;
  }
  function costTable(host, R) {
    return table(host, ["Yearly cost, 2025 dollars", "2025", "Your plan", "Change"], costRows(R).map(function (r, i, a) {
      return { cls: i === a.length - 1 ? "e3-tot" : "", cells: [r[0], millions(r[1]), millions(r[2]), (r[2] - r[1] >= 0 ? "+" : "") + millions(r[2] - r[1])] };
    }), "e3-cost");
  }
  // the screening household table (accounting layer, not the LP) and its assumptions beside it (hhAssume); a plan the
  // layer cannot spread (a group's use below zero) shows why instead of numbers (SB3 review finding 2)
  function hhTable(host, R) {
    var h = R.hh;
    if (!h || h.clamped) { H("p", { class: "lx-hint e3-hh-off", role: "status", text: "No household table for this plan: " + (h ? CLAMPED : "lesson A13's accounting layer did not load") + "." }, host); return null; }
    var tb = LX.Ledger(host, { caption: "Screening estimate by household group (accounting layer, not the LP): a year's home energy bills and energy burden, 2025 against your plan; transport apart.",
      columns: ["Household group", "Income", "Home energy bills", "Energy burden", "Transport: motor fuel and charging"],
      rows: h.rows.map(function (x) {
        return { head: x.label, sub: kilo(x.households) + " households", cells: [money(x.income), money(x.home0) + " → " + money(x.home), pct(x.burden0, 1) + " → " + pct(x.burden, 1),
          { text: money(x.tr0) + " → " + money(x.tr), l: "Transport: motor fuel and charging (not in burden)" }] };
      }), cls: "e3-hh" });
    var ul = H("ul", { class: "e3-notes e3-hh-assume", "aria-label": "Assumptions of the household table" }, host);
    [h.screening + " An energy model does not produce these outcomes by itself: this accounting layer (lesson A13's) does, after the LP."].concat(hhAssume(R),
      ["2025's bills keep the few EVs charged at home in 2025, as prairie-city.json counts them; use does not respond to the charge."]).forEach(function (t) { H("li", { text: t }, ul); });
    return tb;
  }
  // short labelled lines, one idea each: [[label, text], ...] (text may carry glossary marks)
  function keys(host, items, cls) {
    var el = H("div", { class: "e3-keys" + (cls ? " " + cls : "") }, host);
    items.forEach(function (x) { H("p", { html: "<b>" + x[0] + ":</b> " + LX.rich(x[1]) }, el); });
    return el;
  }
  // the hub, as an annotated diagram: carriers in, converters and stores, uses out, the substation between
  function hubDiagram(host, o) {
    o = o || {};
    var el = H("figure", { class: "e3-hub" }, host);
    el.innerHTML = '<div class="e3-hub-cols">' +
      '<div class="e3-hub-col"><p class="e3-hub-h">In</p><p class="e3-hub-n el">Grid electricity <span>through each district\'s substation, up to its limit</span></p><p class="e3-hub-n gas">Gas and propane <span>from the pipeline and tanks</span></p><p class="e3-hub-n sun">Rooftop sun <span>used or spilled</span></p></div>' +
      '<div class="e3-hub-col"><p class="e3-hub-h">Convert and store</p><p class="e3-hub-n">Furnaces <span>80%</span></p><p class="e3-hub-n">Heat pumps <span>COP falls as it gets colder</span></p><p class="e3-hub-n">District-heat plant <span>heat pump and boiler, with a heat store</span></p><p class="e3-hub-n">Batteries and managed charging <span>move electricity in time</span></p></div>' +
      '<div class="e3-hub-col"><p class="e3-hub-h">Out</p><p class="e3-hub-n">Space heat <span>less after a retrofit</span></p><p class="e3-hub-n">Lights, appliances, cooling <span>the base load</span></p><p class="e3-hub-n">Car travel <span>gasoline or charging</span></p></div></div>' +
      '<figcaption>' + LX.rich(o.caption || "The [[energy-hub|energy hub]]: each hour, what comes in through the [[substation|substation]], the pipeline and the roofs must meet the heat, base and charging the district uses. The limit is a ceiling on each hour's flow (a [[linearized-feeder-limit|linearized feeder limit]]).") + "</figcaption>";
    return el;
  }
  // the full-year check's card (SB3, M12, C3): the table and the gaps in words, or why there is none for this plan
  function fullCard(host, e, FYc, P, o) {
    o = o || {};
    var c = H("div", { class: "lx-xcard lx-sb-chart e3-full" }, host);
    H("h3", { text: o.title || "Full-year check: eight days against 8,760 hours" }, c);
    if (!e) {
      H("p", { class: "lx-hint", html: "<b>No full-year check for this plan.</b> " + esc(o.none || "It is precomputed for the presets, with every other setting at its default: a year of hours is too large to solve on a click.") }, c);
      if (o.load) H("button", { class: "lx-btn ghost small", type: "button", text: o.load.label, onclick: o.load.go }, c);
      return c;
    }
    table(c, ["", "Eight days", "Full year", "Gap"], fullRows(e, P), "e3-fullt");
    keys(c, fullWhy(e, FYc, o.date || ""));
    return c;
  }
  E3.ui = { fullCard: fullCard, controls: controls, seg: seg, stopper: stopper, table: table, readouts: readouts, DayView: DayView, valueRows: valueRows, costRows: costRows, costTable: costTable, hhTable: hhTable, keys: keys, hubDiagram: hubDiagram, fmtOf: fmtOf, copy: copy };
})();
