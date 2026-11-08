/* engine-e4.js — LX.E4: engine E4 of Learn, Prairieland's pathway to 2050 (one of the course's sandbox engines). Used
   by the Pathway Explorer (SB4, learn/sb4-pathway-explorer.qmd), Modeler lesson M13 (learn/m13-national-pathway.qmd)
   and capstone C4 (learn/c4-prairieland-2050.qmd): one model, three pages.

   Data: assets/learn/data/prairieland.json (the nation: regions, fleet with vintages, links, fuels, cost ranges, the
   carbon budget, time slices, shocks, demand; shared, read only) and assets/learn/data/e4-pathways.json (what the
   engine adds: levers, the existing fleet's operating settings, penalties, the tie rule, presets, the precomputed runs).
   Prairieland is fictional; its numbers are illustrative. Every dollar is a 2025 dollar.

   The model (a linear program, LP): five regions r, model years p = 2030, 2035, 2040, 2045, 2050 (each standing for the
   five years ending in it), twelve time slices s of 2025's weather (hours h_s, summing to 8,760), six representative
   days (a season's day and night slice, the peak net-load day, the scarce-wind week).
     balance (region, slice, year):  existing plants + new gas + hydro + wind + solar + battery out - in
                                     + share_r x firm + inflows x (1 - loss) - outflows + unserved = load
     existing coal, gas and oil plants unit by unit: output <= availability x capacity kept open; kept open never rises
                                     (early retirement saves fixed O&M); each runs at its own efficiency
     new builds n (wind, solar, 4-hour battery, gas combined cycle, gas turbine; region by region) and the generic firm
                                     clean option (national, no location): within the generic limits per region and period,
                                     wind and solar within each region's most; a plant runs in its model year and the later
                                     ones its life covers (vintages)
     batteries: cyclic within each representative day (state at 08:00 and 20:00 within 0 and 4 h x power); in the
                                     scarce-wind week the store may enter full and runs down over the seven days
     links: flows each way within the link's limit (existing + additions), 1% lost per 100 km
     fuels (national, each year): crude = refinery input + oil plants; gas = final + plants, domestic first (up to 2025's
                                     output) then LNG; coal from Ridge County; final fuel use fixed by the plan's demand
                                     and electrification
     CO2 (Mt a year) = fuels burned x IPCC factors; cumulative 2026-2050 = sum_p w_p CO2_p + w_2025 x 214.9 <= budget
                                     (+ an overshoot, see "limits first"); w linear (2, 5, 5, 5, 5, 3) or step (0, 5, 5, 5, 5, 5)
     imports (crude imports + LNG) <= cap x primary energy, each year (+ an overshoot, see "limits first")
     the stress hours (peak-hour rule): plants at their availability (the summer hour with a drought's derating), wind and
                                     solar at that hour, batteries at full power, the firm option's share, the links
     goal: min the present value in 2025 of new plants' and links' yearly payments for the years they serve up to 2050
                                     (the rest is residual value), fixed O&M of fossil plants kept open and of new plants,
                                     variable O&M, fuels, unserved energy and stress-hour shortfall at penalties, the tie rule
   Limits first: the budget and the import cap are limits, not prices. Each window's LP
   runs with the overshoots at their penalties; when it meets both limits it is the least-cost plan within them (one LP).
   When it misses one, two more LPs: the least overshoot (no more unserved energy or stress-hour shortfall than run 1:
   serving demand comes first), then the least cost at that overshoot. Overshoot 0: the limits hold (e.g. a 2,800 Mt
   budget); above 0: they are out of reach, the run is the closest plan, and their duals are not marginal values (null).
   Foresight: perfect (one LP over 2030-2050) or decade by decade (myopic: 2030-2035 seeing only them, their builds fixed;
   then 2040-2045; then 2050; each window gets the remaining budget in proportion to its weights).
   Shocks (C4, SB4): the plan's builds and retirements up to and including the shock's model year stay as planned; that
   year runs with what was built; later years re-plan knowing the shock. A price shock on new plants (the mineral export
   restriction, e4-pathways.json levers.shockRule "before") arrives before the shock year's plants are bought: decisions
   through the model year before it stay, and the shock year's builds are re-planned at the shock's price.

   Prices and duals (from LPs only, never from MILPs): only from this LP, labelled "marginal values under stated assumptions": the budget's dual
   (present value in 2025 of one more tonne; as a price in model year p's own 2025 dollars it is mu x w_p / D_p, from the
   LP's own coefficients), the import cap's duals, each region's marginal cost of electricity. Screening outputs (kept
   apart from the model's costs: affordability and Ridge County jobs) come from LX.A13 (components/whopays.js) after the LP, never from it.

   Costs: the learner-set fixed ranges from prairieland.json, the same in every period; no cost changes with how much is
   built; the firm clean option is one generic option with constant cost and the generic build limits, with no timeline
   of its own and no location.

   API (the sandbox contract, learn/_template-sandbox.qmd):
     E4.prepare(PL, cfg) -> P;  E4.schema(P), E4.presets, E4.sysOf(state, P, o) -> S
     E4.build(P, S, o) -> model;  E4.read(P, S, model, r) -> raw;  E4.summarize(state, P, raw) -> results
     E4.solve(state, P, { signal, timeLimit, attempt, solver, foresight, shock }) -> Promise of
       { status, ok, kind: "lp", message, hint, results, ms }   never rejects
     E4.fullYear(P, S, raw, { year, weather, hours }) -> the hour-by-hour check of one model year (Node and the tests)
   Node: module.exports = E4 (no DOM). In a page: LX.E4 and its view kit LX.E4.ui. */
(function () {
  "use strict";
  var REG = ["highlands", "ridge", "plains", "capital", "coast"];
  var NEW = ["wind", "solar", "battery", "gasCC", "gasCT"];          // built region by region; "firm" is national
  var FOSSIL = ["coal", "gasCC", "gasCT", "oil"];
  var SEC = ["industry", "buildings", "transport", "agriculture"];
  var PJ_PER_MWH = 3.6e-6, MWH_PER_PJ = 1e6 / 3.6;

  // ---------------------------------------------------------------- small helpers
  function crf(r, n) { return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n)); }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function fix(v, d) { var s = (Math.abs(v)).toFixed(d == null ? 1 : d); return (v < 0 && +s !== 0 ? "−" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function pct(v, d) { return fix(v * 100, d == null ? 0 : d) + "%"; }
  function bn(v, d) { return (v < 0 ? "−$" : "$") + fix(Math.abs(v) / 1000, d == null ? 1 : d) + " billion"; }   // $M -> "$x billion"

  // ---------------------------------------------------------------- data
  function prepare(PL, cfg) {
    var P = { PL: PL, cfg: cfg, line: PL.about.line, base: PL.periods.base, Y: PL.periods.years.slice(), each: PL.periods.yearsEach };
    P.R = PL.regions.map(function (r, i) {
      var el = 0; SEC.forEach(function (k) { el += r.final[k].el || 0; });
      return { key: r.key, name: r.name, short: r.short, i: i, people: r.people, res: r.resources, final: r.final, el2025: el };
    });
    P.ri = {}; P.R.forEach(function (r) { P.ri[r.key] = r.i; });
    var el0 = sum(P.R.map(function (r) { return r.el2025; }));
    P.R.forEach(function (r) { r.elShare = r.el2025 / el0; });
    var TS = PL.timeSlices;
    P.S = TS.slices.map(function (s, i) {
      return { key: s.key, label: s.label, i: i, h: s.hours, days: s.days, part: s.part, season: s.season, extreme: s.extreme, demand: s.demand,
        wind: REG.map(function (k) { return s.wind[k]; }), solar: REG.map(function (k) { return s.solar[k]; }), hydro: s.hydro,
        summer: s.season === "summer" };
    });
    // representative days: a day slice and the night slice after it (keys share the part before "_")
    P.days = [];
    P.S.forEach(function (s) {
      if (s.part !== "day") return;
      var stem = s.key.replace(/_day$/, ""), n = P.S.filter(function (x) { return x.key === stem + "_night"; })[0];
      P.days.push({ key: stem, d: s.i, n: n.i, days: s.days, week: stem === "lowwind" });
    });
    P.hours = sum(P.S.map(function (s) { return s.h; }));
    // existing units: fossil unit by unit; nuclear, hydro, wind, solar and batteries by region
    var U = PL.fleet.units, av = cfg.existing.availability;
    P.units = U.filter(function (u) { return FOSSIL.indexOf(u.tech) >= 0; }).map(function (u, j) {
      return { id: u.id, name: u.name, r: P.ri[u.region], tech: u.tech, mw: u.mw, built: u.built, retire: u.retire, eff: u.efficiency, j: j, av: av[u.tech] };
    });
    P.on = function (u, y) { return u.retire > y; };
    P.exist = function (tech, r, y) {                         // MW of an existing technology online in region r, model year y
      var t = 0; U.forEach(function (u) { if (u.tech === tech && P.ri[u.region] === r && u.retire > y) t += u.mw; }); return t;
    };
    P.links = PL.transmission.links.map(function (l, i) { return { key: l.key, a: P.ri[l.from], b: P.ri[l.to], mw: l.mw, km: l.km, loss: l.lossShare, i: i }; });
    P.tx = PL.transmission.expansion;
    P.tech = PL.costs.technologies; P.fuels = PL.costs.fuels; P.lim = PL.costs.buildLimits;
    P.carbon = PL.carbon;
    P.f = PL.carbon.factors.tPerTJ;                          // t per TJ = Mt per 1,000 PJ
    var tr = PL.balance.transformation;
    P.refYield = tr.refinery.out / tr.refinery.in;           // 0.945
    P.gasOwn = tr.ownUse.gas / PL.balance.primary.gas.domestic;   // field own use per PJ of domestic gas
    P.coalOwn = tr.ownUse.coal / PL.balance.primary.coal;
    P.gridLoss = tr.grid.lossShare;                          // of the busbar input
    P.domGas = PL.balance.primary.gas.domestic; P.domCrude = PL.balance.primary.oil.domestic; P.coalMax = PL.balance.primary.coal;
    P.useful = PL.balance.useful.efficiency; P.elec = PL.demand.electrification;
    P.hydroCF = P.R.map(function (r) { return r.res.hydroCF || 0; });
    P.nuc = U.filter(function (u) { return u.tech === "nuclear"; });
    P.shocks = {}; PL.shocks.forEach(function (s) { P.shocks[s.key] = s; });
    P.imports = PL.imports;
    // the stress hours' seasons (the summer hour carries a drought's thermal derating, as the summer slices do)
    P.stressSummer = (cfg.stress || []).map(function (H) { return (H.season || seasonOfDay(Math.floor(H.i / 24))) === "summer"; });
    // electricity's 2025 share of each sector's useful energy, and the range the plan may set for 2050: at most 15 points a
    // period (75 by 2050), at most 100%, industry at most 60% (prairieland.json demand.electrification)
    P.sigma0 = {}; P.elRange = {};
    var FB = PL.balance.final, EF = P.useful, Ld = cfg.levers.electrification;
    SEC.forEach(function (k) {
      var u = 0, e = (FB[k].el || 0) * EF[k].el; for (var c in FB[k]) u += FB[k][c] * EF[k][c];
      P.sigma0[k] = e / u;
      if (k === "agriculture") return;
      var lo = Math.floor(P.sigma0[k] * 100), hi = Math.min(100, Math.floor(P.sigma0[k] * 100 + 75 * P.elec.maxSharePerPeriod / 0.15), P.elec[k].maxShare2050 ? Math.round(P.elec[k].maxShare2050 * 100) : 100);
      P.elRange[k] = { lo: lo, hi: hi, step: 1, def: Ld[k].def };
    });
    return P;
  }

  // the discount factor of year t (base 2025) and the sum over the five years a model year stands for
  function dsum(rate, y, each) { var s = 0; for (var t = y - each + 1; t <= y; t++) s += Math.pow(1 + rate, -(t - 2025)); return s; }

  // ---------------------------------------------------------------- the plan (an LX.ShareState schema)
  function schema(P) {
    var c = P.PL.costs, T = c.technologies, F = c.fuels, L = P.cfg.levers, B = P.PL.carbon.budget, D = P.PL.periods.discount, X = P.PL.transmission.expansion.costPerMWkm;
    // the data's defaults are EIA's values, off the data's slider steps for some (wind $1,712/kW, gas $4.05/GJ): the plan
    // takes the finest step that keeps every default on its grid ($1 per kW, $0.01 per GJ)
    var onStep = function (r) { var k = (r.def - r.lo) / r.step; return Math.abs(k - Math.round(k)) < 1e-9; };
    var num = function (id, short, label, unit, r) {
      var st = onStep(r) ? r.step : unit === "$/GJ" ? 0.01 : 1;
      return { id: id, short: short, type: "num", label: label, unit: unit, min: r.lo, max: r.hi, step: st, def: r.def };
    };
    var f = [
      { id: "dem", short: "d", type: "enum", values: P.PL.demand.scenarios.map(function (s) { return s.key; }), names: (function () { var o = {}; P.PL.demand.scenarios.forEach(function (s) { o[s.key] = s.label; }); return o; })(), def: P.PL.demand.default, label: "Demand growth" },
      num("eb", "eb", "Buildings: electricity's share of useful energy in 2050", "%", P.elRange.buildings),
      num("et", "et", "Transport: electricity's share of useful energy in 2050", "%", P.elRange.transport),
      num("ei", "ei", "Industry: electricity's share of useful energy in 2050", "%", P.elRange.industry),
      num("bud", "b", "Carbon budget, 2026-2050", "Mt", { lo: B.lo, hi: B.hi, step: B.step, def: L.budget.def }),
      { id: "acc", short: "a", type: "enum", values: ["linear", "step"], names: { linear: "Straight lines between model years", step: "Each model year for its five years" }, def: P.PL.carbon.accounting.default, label: "Counting the years between" },
      num("cap", "c", "Import share cap, each model year", "%", L.importCap),
      { id: "fs", short: "f", type: "enum", values: ["perfect", "myopic"], names: { perfect: "Perfect foresight (2030-2050 at once)", myopic: "Decade by decade" }, def: "perfect", label: "Foresight" },
      { id: "rm", short: "m", type: "enum", values: ["off", "r0", "r10", "r20"], names: { off: "No peak-hour rule", r0: "Meet the stress hours", r10: "Stress hours + 10%", r20: "Stress hours + 20%" }, def: L.reserve.def, label: "Peak-hour reserve rule" },
      { id: "fm", short: "fm", type: "int", min: 0, max: 1, def: 1, label: "Generic firm clean option allowed", unit: "" },
      { id: "tx", short: "t", type: "int", min: 0, max: 1, def: 1, label: "New transmission allowed", unit: "" },
      { id: "rt", short: "r", type: "int", min: 0, max: 1, def: 1, label: "Early retirement of fossil plants allowed", unit: "" },
      { id: "sh", short: "s", type: "enum", values: ["none", "gasSpike", "drought", "mineralBan", "demandSurprise"], names: { none: "No shock", gasSpike: P.shocks.gasSpike.label, drought: P.shocks.drought.label, mineralBan: P.shocks.mineralBan.label, demandSurprise: P.shocks.demandSurprise.label }, def: "none", label: "Shock" },
      num("cw", "cw", "Wind farm, capital", "$/kW", T.wind.capex),
      num("cs", "cs", "Solar farm, capital", "$/kW", T.solar.capex),
      num("cb", "cb", "Battery (4 hours), capital", "$/kW", T.battery.capex),
      num("cc", "cc", "Gas combined cycle, capital", "$/kW", T.gasCC.capex),
      num("ct", "ct", "Gas turbine, capital", "$/kW", T.gasCT.capex),
      num("cf", "cf", "Generic firm clean plant, capital", "$/kW", T.firm.capex),
      num("cx", "cx", "New transmission", "$/MW-km", X),
      num("pg", "pg", "Domestic gas", "$/GJ", F.gas),
      num("pl", "pl", "LNG imports", "$/GJ", F.lng),
      num("pc", "pc", "Coal", "$/GJ", F.coal),
      num("po", "po", "Crude oil", "$/GJ", F.oil),
      num("dr", "dr", "Discount rate (real)", "%", D)
    ];
    return { key: "sb4", version: 1, title: "Pathway Explorer plan", fields: f,
      check: function (s) { return null; } };
  }
  function defaults(S) { var o = {}; S.fields.forEach(function (f) { o[f.id] = f.def; }); return o; }
  function withPreset(s, pr) { var o = copy(s); for (var k in pr.state) o[k] = pr.state[k]; return o; }

  // ---------------------------------------------------------------- the system a plan describes
  // o: { shock (key or null), elX (demand multiplier from a year), only (period indexes modelled), fixed (decisions of
  //      earlier periods: { n: {name: MW}, k: {unit index: [MW kept per period]}, a: {link: [MW added per period]} }),
  //      budgetLeft (Mt the modelled periods may emit, counted with their weights) }
  function sysOf(state, P, o) {
    o = o || {};
    var s = state, rate = s.dr / 100, Y = P.Y, np = Y.length;
    var scen = P.PL.demand.scenarios.filter(function (x) { return x.key === s.dem; })[0];
    var S = { state: copy(s), rate: rate, Y: Y, np: np, scen: scen.key };
    S.D = Y.map(function (y) { return dsum(rate, y, P.each); });
    var acc = P.PL.carbon.accounting, w = s.acc === "step" ? acc.stepWeights : acc.linearWeights;
    S.w = Y.map(function (y) { return w[String(y)]; }); S.w0 = w["2025"];
    S.budget = s.bud; S.cap = s.cap / 100;
    S.firm = !!s.fm; S.txOn = !!s.tx; S.retOn = !!s.rt;
    S.reserve = s.rm === "off" ? null : { r0: 0, r10: 0.1, r20: 0.2 }[s.rm];
    var T = P.tech;
    S.capex = Y.map(function () { return { wind: s.cw, solar: s.cs, battery: s.cb, gasCC: s.cc, gasCT: s.ct, firm: s.cf }; });
    S.price = Y.map(function () { return { gas: s.pg, lng: s.pl, coal: s.pc, oil: s.po }; });
    S.txCost = s.cx;
    S.hydroX = Y.map(function () { return 1; }); S.summerX = Y.map(function () { return 1; });
    S.elX = Y.map(function () { return 1; });
    var sh = o.shock || null; S.shock = sh;
    if (sh) {
      var q = P.shocks[sh], yr = P.cfg.levers.shockYear[sh], pi = Y.indexOf(yr); S.shockP = pi; S.shockYear = yr;
      if (sh === "gasSpike") { S.price[pi].lng *= q.params.lngX; S.price[pi].gas *= q.params.gasX; }
      if (sh === "drought") { S.hydroX[pi] = q.params.hydroX; S.summerX[pi] = q.params.thermalSummerX; }
      if (sh === "mineralBan") S.capex[pi].battery *= q.params.batteryCapexX;
      if (sh === "demandSurprise") Y.forEach(function (y, p) { if (y >= q.params.from) S.elX[p] = q.params.elX; });
    }
    // demand: each region's electricity (PJ, busbar MW) and the nation's final fuels, year by year
    // z: the share of a sector's fossil useful energy switched by 2050, so that electricity's national share reaches the plan's
    var zOf = function (k, sig) { return Math.max(0, (sig - P.sigma0[k]) / (1 - P.sigma0[k])); };
    var Z = { buildings: zOf("buildings", s.eb / 100), transport: zOf("transport", s.et / 100), industry: zOf("industry", s.ei / 100), agriculture: 0 };
    S.z = Z;
    var NL = P.PL.demand.scenarios.filter(function (x) { return x.key === s.dem; })[0].newLoadsTWh;
    var nl = function (y) { var ks = Object.keys(NL).map(Number).sort(function (a, b) { return a - b; });
      for (var i = 0; i < ks.length - 1; i++) if (y >= ks[i] && y <= ks[i + 1]) return NL[ks[i]] + (NL[ks[i + 1]] - NL[ks[i]]) * (y - ks[i]) / (ks[i + 1] - ks[i]);
      return y < ks[0] ? 0 : NL[ks[ks.length - 1]]; };
    S.elPJ = []; S.loadMW = []; S.fuel = []; S.share = []; S.newLoadPJ = []; S.switched = [];
    Y.forEach(function (y, p) {
      var fuel = { oil: 0, gas: 0, coal: 0 }, el = [], sw = { buildings: 0, transport: 0, industry: 0 };
      P.R.forEach(function (r, i) {
        var e = 0;
        SEC.forEach(function (k) {
          var g = Math.pow(1 + scen.growth[k] / 100, y - P.base), z = Z[k] * (y - P.base) / (2050 - P.base), F = r.final[k];
          e += (F.el || 0) * g;
          ["oil", "gas", "coal"].forEach(function (c) {
            var v = (F[c] || 0) * g; if (!v) return;
            fuel[c] += v * (1 - z);
            if (z > 0) { var add = v * z * P.useful[k][c] / P.elec[k].ratio; e += add; sw[k] += add; }
          });
        });
        e += nl(y) * 3.6 * r.elShare;
        el.push(e * S.elX[p]);
      });
      S.newLoadPJ.push(nl(y) * 3.6);
      S.elPJ.push(el); S.fuel.push(fuel); S.switched.push(sw);
      S.loadMW.push(el.map(function (e) { return e * MWH_PER_PJ / (1 - P.gridLoss) / P.hours; }));
      var tot = sum(S.loadMW[p]); S.share.push(S.loadMW[p].map(function (x) { return x / tot; }));
    });
    S.only = o.only || Y.map(function (y, p) { return p; });
    S.fixedThrough = o.fixedThrough == null ? -1 : o.fixedThrough;   // decisions of periods up to this index are fixed
    S.fixed = o.fixed || null;
    S.budgetLeft = o.budgetLeft != null ? o.budgetLeft : null;
    S.horizonEnd = o.horizonEnd != null ? o.horizonEnd : np - 1;   // last period index whose years are charged (myopic: the window's end)
    return S;
  }

  // ---------------------------------------------------------------- the LP
  // o: { tie (multiplier of the tie rule, default 1), noPenalty (hard budget and cap), objective (override: a terms map
  //      to minimise instead of the cost, for the least-CO2 hint) }
  function build(P, S, o) {
    o = o || {};
    var cfg = P.cfg, tk = o.tie == null ? 1 : o.tie, T = P.tech, V = [], C = [], pen = cfg.penalties, tie = cfg.tie;
    var only = S.only, inW = {}, ft = S.fixedThrough == null ? -1 : S.fixedThrough;
    only.forEach(function (p) { inW[p] = true; });
    var free = function (q) { return inW[q] && q > ft; };   // a decision of period q is a variable (else a fixed number)
    var fx = S.fixed || { n: {}, k: {}, a: {} };
    var cat = {}, tieC = {};          // each variable's cost category, and the part of its cost that is the tie rule's
    function v(name, lb, ub, cost, k, tc) { V.push({ name: name, lb: lb == null ? 0 : lb, ub: ub == null ? Infinity : ub, cost: cost || 0 }); if (k) cat[name] = k; if (tc) tieC[name] = tc; return name; }
    function row(name, terms, lo, hi) { var c = { name: name, terms: terms }; if (lo != null && hi != null && lo === hi) c.eq = lo; else { if (lo != null) c.lb = lo; if (hi != null) c.ub = hi; } C.push(c); return c; }
    var lastP = S.horizonEnd;
    // years a plant built in period q serves, charged: the periods p >= q (within life, up to the horizon), each D_p
    function served(q, life) { var t = 0; for (var p = q; p <= lastP; p++) if ((S.Y[p] - S.Y[q]) < life) t += S.D[p]; return t; }
    function online(q, p, life) { return q <= p && (S.Y[p] - S.Y[q]) < life; }
    // ---- capacity decisions
    var nv = {};                        // nv[r][t][q] = variable name or a number (fixed)
    P.R.forEach(function (R, r) {
      nv[r] = {};
      NEW.forEach(function (t) {
        nv[r][t] = S.Y.map(function (y, q) {
          var nm = "n_" + r + t + q;
          if (!free(q)) return fx.n[nm] || 0;
          var life = T[t].life, ann = S.capex[q][t] * crf(S.rate, life) + T[t].fom;     // $/kW-year
          var lim = P.lim.gwPerRegionPerPeriod[t] * 1000;
          if (y < P.lim.availableFrom) lim = 0;
          return v(nm, 0, lim, ann * served(q, life) / 1000, "capital");   // $M per MW
        });
      });
    });
    var fv = S.Y.map(function (y, q) {
      var nm = "n_firm" + q; if (!free(q)) return fx.n[nm] || 0;
      var life = T.firm.life, ann = S.capex[q].firm * crf(S.rate, life) + T.firm.fom;
      return v(nm, 0, S.firm ? P.lim.gwPerRegionPerPeriod.firm * 1000 * P.R.length : 0, ann * served(q, life) / 1000, "capital");
    });
    var av = P.links.map(function (l) {
      return S.Y.map(function (y, q) {
        var nm = "a_" + l.i + "_" + q; if (!free(q)) return (fx.a[nm] || 0);
        return v(nm, 0, S.txOn ? P.tx.maxAddMWPerPeriod : 0, l.km * S.txCost * crf(S.rate, P.tx.life) * served(q, P.tx.life) / 1e6, "transmission");
      });
    });
    // kept-open capacity of existing fossil units
    var kv = P.units.map(function (u) {
      return S.Y.map(function (y, p) {
        if (!P.on(u, y)) return 0;
        var nm = "k_" + u.j + "_" + p;
        if (!free(p)) return fx.k[nm] != null ? fx.k[nm] : u.mw;
        var om = u.tech === "coal" || u.tech === "oil" ? cfg.existing.om[u.tech].fom : T[u.tech].fom;
        return v(nm, S.retOn ? 0 : u.mw, u.mw, om * (p <= lastP ? S.D[p] : 0) / 1000, "fom");
      });
    });
    // capacity expression: [terms, constant]
    function capOf(list, p, life) {          // list[q] = var name or number
      var terms = [], c = 0;
      for (var q = 0; q <= p; q++) if (online(q, p, life)) { if (typeof list[q] === "string") terms.push([list[q], 1]); else c += list[q]; }
      return [terms, c];
    }
    var fuelTerms = [], CO2 = {}, PRIM = {}, IMP = {};
    only.forEach(function (p) {
      var y = S.Y[p], D = S.D[p], pr = S.price[p], tg = "_" + p, sh = S.share[p];
      var bal = P.R.map(function () { return P.S.map(function () { return []; }); });
      var oilF = [], gasF = [], coalF = [], nucE = [], renE = [];
      // existing fossil units
      P.units.forEach(function (u) {
        var k = kv[u.j][p]; if (k === 0) return;
        var vom = u.tech === "coal" || u.tech === "oil" ? cfg.existing.om[u.tech].vom : T[u.tech].vom;
        P.S.forEach(function (s) {
          var g = v("g_" + u.j + "_" + s.i + tg, 0, Infinity, vom * s.h * D / 1e6, "vom");
          var a = u.av * (s.summer && (u.tech === "coal" || u.tech === "gasCC") ? S.summerX[p] : 1);
          if (typeof k === "string") row("cu_" + u.j + "_" + s.i + tg, [[g, 1], [k, -a]], null, 0);
          else V[V.length - 1].ub = a * k;
          bal[u.r][s.i].push([g, 1]);
          var fl = s.h * PJ_PER_MWH / u.eff;
          (u.tech === "coal" ? coalF : u.tech === "oil" ? oilF : gasF).push([g, fl]);
        });
      });
      // existing nuclear (Capital), hydro, wind, solar, batteries
      P.R.forEach(function (R, r) {
        var nucMW = P.exist("nuclear", r, y), hyMW = P.exist("hydro", r, y);
        if (nucMW > 0) P.S.forEach(function (s) {
          var a = cfg.existing.availability.nuclear * (s.summer ? S.summerX[p] : 1);
          var g = v("nu_" + r + "_" + s.i + tg, 0, a * nucMW, cfg.existing.om.nuclear.vom * s.h * D / 1e6, "vom");
          bal[r][s.i].push([g, 1]); nucE.push([g, s.h * PJ_PER_MWH / 0.33]);
        });
        if (hyMW > 0) P.days.forEach(function (d) {
          var gd = v("hy_" + r + "_" + d.d + tg, 0, hyMW), gn = v("hy_" + r + "_" + d.n + tg, 0, hyMW);
          var e = 2 * hyMW * P.hydroCF[r] * P.S[d.d].hydro * S.hydroX[p];
          row("he_" + r + "_" + d.key + tg, [[gd, 1], [gn, 1]], e, e);
          bal[r][d.d].push([gd, 1]); bal[r][d.n].push([gn, 1]);
          renE.push([gd, P.S[d.d].h * PJ_PER_MWH], [gn, P.S[d.n].h * PJ_PER_MWH]);
        });
        // wind and solar: existing online + new builds online
        ["wind", "solar"].forEach(function (t) {
          var cap = capOf(nv[r][t], p, T[t].life), ex = P.exist(t, r, y), mx = (t === "wind" ? R.res.windMaxGW : R.res.solarMaxGW) * 1000;
          var c0 = cap[1] + ex;
          if (cap[0].length) row("mx_" + r + t + tg, cap[0], null, mx - c0);
          P.S.forEach(function (s) {
            var cf = t === "wind" ? s.wind[r] : s.solar[r];
            var g = v("vr_" + r + t + "_" + s.i + tg, 0, cap[0].length ? Infinity : cf * c0, 0);
            if (cap[0].length) row("cv_" + r + t + "_" + s.i + tg, [[g, 1]].concat(cap[0].map(function (x) { return [x[0], -cf]; })), null, cf * c0);
            bal[r][s.i].push([g, 1]); renE.push([g, s.h * PJ_PER_MWH]);
          });
        });
        // new gas plants
        ["gasCC", "gasCT"].forEach(function (t) {
          var cap = capOf(nv[r][t], p, T[t].life);
          if (!cap[0].length && cap[1] === 0) return;
          P.S.forEach(function (s) {
            var a = cfg.existing.availability[t] * (s.summer && t === "gasCC" ? S.summerX[p] : 1);
            var g = v("ng_" + r + t + "_" + s.i + tg, 0, cap[0].length ? Infinity : a * cap[1], T[t].vom * s.h * D / 1e6, "vom");
            if (cap[0].length) row("cn_" + r + t + "_" + s.i + tg, [[g, 1]].concat(cap[0].map(function (x) { return [x[0], -a]; })), null, a * cap[1]);
            bal[r][s.i].push([g, 1]); gasF.push([g, s.h * PJ_PER_MWH / T[t].efficiency]);
          });
        });
        // batteries: existing online + new online; 4 hours; 85% round trip on charging
        var bc = capOf(nv[r].battery, p, T.battery.life), bex = P.exist("battery", r, y), b0 = bc[1] + bex, bt = bc[0];
        if (bt.length || b0 > 0) {
          var hrs = T.battery.hours, eta = T.battery.roundTrip;
          var ch = [], dis = [];
          P.S.forEach(function (s) {
            ch[s.i] = v("bc_" + r + "_" + s.i + tg, 0, Infinity, 0);
            dis[s.i] = v("bd_" + r + "_" + s.i + tg, 0, Infinity, tie.batteryPerMWh * tk * s.h * D / 1e6, null, tie.batteryPerMWh * tk * s.h * D / 1e6);
            row("bp_" + r + "_" + s.i + tg, [[ch[s.i], 1], [dis[s.i], 1]].concat(bt.map(function (x) { return [x[0], -1]; })), null, b0);
            bal[r][s.i].push([dis[s.i], 1], [ch[s.i], -1]);
          });
          var E = function (extra, c) { return extra.concat(bt.map(function (x) { return [x[0], -hrs]; })); };   // terms - 4 x P
          P.days.forEach(function (d) {
            var s0 = v("bs_" + r + "_" + d.key + tg, 0, Infinity, 0), hd = P.S[d.d].h / P.S[d.d].days, hn = P.S[d.n].h / P.S[d.n].days;   // 12 h
            var dayEnd = [[s0, 1], [ch[d.d], hd * eta], [dis[d.d], -hd]];
            row("b0_" + r + "_" + d.key + tg, E([[s0, 1]]), null, hrs * b0);
            row("b1_" + r + "_" + d.key + tg, dayEnd, 0, null);
            row("b2_" + r + "_" + d.key + tg, E(dayEnd), null, hrs * b0);
            if (!d.week) row("bz_" + r + "_" + d.key + tg, [[ch[d.d], hd * eta], [dis[d.d], -hd], [ch[d.n], hn * eta], [dis[d.n], -hn]], 0, 0);
            else {
              var N = d.days, delta = [[ch[d.d], hd * eta], [dis[d.d], -hd], [ch[d.n], hn * eta], [dis[d.n], -hn]];
              var times = function (k) { return delta.map(function (x) { return [x[0], x[1] * k]; }); };
              var endW = [[s0, 1]].concat(times(N)), lastDay = [[s0, 1]].concat(times(N - 1)).concat([[ch[d.d], hd * eta], [dis[d.d], -hd]]);
              row("bw0_" + r + tg, endW, 0, null); row("bw1_" + r + tg, E(endW), null, hrs * b0);
              row("bw2_" + r + tg, lastDay, 0, null); row("bw3_" + r + tg, E(lastDay), null, hrs * b0);
            }
          });
        }
        // unserved energy
        P.S.forEach(function (s) { var u = v("us_" + r + "_" + s.i + tg, 0, Infinity, pen.unservedPerMWh * s.h * D / 1e6, "penalty"); bal[r][s.i].push([u, 1]); });
      });
      // the generic firm clean option: national, shared by demand
      var fcap = capOf(fv, p, T.firm.life);
      if (fcap[0].length || fcap[1] > 0) P.S.forEach(function (s) {
        var a = T.firm.availability * (s.summer ? S.summerX[p] : 1);
        var g = v("fg_" + s.i + tg, 0, fcap[0].length ? Infinity : a * fcap[1], T.firm.vom * s.h * D / 1e6, "vom");
        if (fcap[0].length) row("cf_" + s.i + tg, [[g, 1]].concat(fcap[0].map(function (x) { return [x[0], -a]; })), null, a * fcap[1]);
        P.R.forEach(function (R, r) { bal[r][s.i].push([g, sh[r]]); });
        renE.push([g, s.h * PJ_PER_MWH]);
      });
      // links
      P.links.forEach(function (l) {
        var cap = capOf(av[l.i], p, 1e9), c0 = cap[1] + l.mw;
        P.S.forEach(function (s) {
          var c = tie.flowPerMWh * tk * s.h * D / 1e6;
          var fw = v("fw_" + l.i + "_" + s.i + tg, 0, Infinity, c, null, c), bw = v("fb_" + l.i + "_" + s.i + tg, 0, Infinity, c, null, c);
          row("cl_" + l.i + "_" + s.i + tg, [[fw, 1], [bw, 1]].concat(cap[0].map(function (x) { return [x[0], -1]; })), null, c0);
          bal[l.a][s.i].push([fw, -1], [bw, 1 - l.loss]); bal[l.b][s.i].push([fw, 1 - l.loss], [bw, -1]);
        });
      });
      // the peak-hour reserve rule: at each stress hour of 2025's weather (e4-pathways.json stress), every region's load x
      // (1 + margin) from plants at their availability, wind and solar at that hour's output, batteries at full power,
      // the firm option's share and the links; a shortfall is allowed at a penalty (reported, never in a cost). The summer
      // hour derates what the summer slices derate (a drought: coal, combined cycles, existing nuclear, the firm option)
      if (S.reserve != null) (cfg.stress || []).forEach(function (H, hi) {
        var sx = P.stressSummer[hi] ? S.summerX[p] : 1, dr = function (t) { return t === "coal" || t === "gasCC" ? sx : 1; };
        var sb = P.R.map(function () { return []; }), c0 = P.R.map(function () { return 0; }), add = function (r, terms, c) { terms.forEach(function (x) { sb[r].push(x); }); c0[r] += c; };
        P.units.forEach(function (u) { var k = kv[u.j][p], a = u.av * dr(u.tech); if (k === 0) return; if (typeof k === "string") sb[u.r].push([k, a]); else c0[u.r] += a * k; });
        P.R.forEach(function (R, r) {
          c0[r] += cfg.existing.availability.nuclear * sx * P.exist("nuclear", r, y) + P.exist("hydro", r, y) * cfg.existing.availability.hydro * S.hydroX[p];
          ["wind", "solar"].forEach(function (t) { var cap = capOf(nv[r][t], p, T[t].life), f = H[t][r]; add(r, cap[0].map(function (x) { return [x[0], f]; }), f * (cap[1] + P.exist(t, r, y))); });
          ["gasCC", "gasCT"].forEach(function (t) { var cap = capOf(nv[r][t], p, T[t].life), a = cfg.existing.availability[t] * dr(t); add(r, cap[0].map(function (x) { return [x[0], a]; }), a * cap[1]); });
          var bc = capOf(nv[r].battery, p, T.battery.life); add(r, bc[0], bc[1] + P.exist("battery", r, y));
          var fa = T.firm.availability * sx * sh[r], fc = capOf(fv, p, T.firm.life); add(r, fc[0].map(function (x) { return [x[0], fa]; }), fa * fc[1]);
        });
        P.links.forEach(function (l) {
          var cap = capOf(av[l.i], p, 1e9), fw = v("sw_" + hi + "_" + l.i + tg, 0, Infinity, 0), bw = v("sx_" + hi + "_" + l.i + tg, 0, Infinity, 0);
          row("sl_" + hi + "_" + l.i + tg, [[fw, 1], [bw, 1]].concat(cap[0].map(function (x) { return [x[0], -1]; })), null, cap[1] + l.mw);
          sb[l.a].push([fw, -1], [bw, 1 - l.loss]); sb[l.b].push([fw, 1 - l.loss], [bw, -1]);
        });
        P.R.forEach(function (R, r) {
          var sf = v("ss_" + hi + "_" + r + tg, 0, Infinity, pen.reservePerMWYear * D / 1e6, "penalty");
          sb[r].push([sf, 1]);
          row("st_" + hi + "_" + r + tg, sb[r], S.loadMW[p][r] * H.demand * (1 + S.reserve) - c0[r], null);
        });
      });
      // the balances
      P.R.forEach(function (R, r) { P.S.forEach(function (s) { var L = S.loadMW[p][r] * s.demand; row("bal_" + r + "_" + s.i + tg, bal[r][s.i], L, L); }); });
      // fuels, national
      var F = S.fuel[p];
      var cd = v("cdom" + tg, 0, P.domCrude, pr.oil * D, "fuel"), ci = v("cimp" + tg, 0, Infinity, (pr.oil + tie.importPremiumPerGJ * tk) * D, "fuel", tie.importPremiumPerGJ * tk * D);
      var gd = v("gdom" + tg, 0, P.domGas, pr.gas * D, "fuel"), gl = v("lng" + tg, 0, Infinity, pr.lng * D, "fuel"), qc = v("coal" + tg, 0, P.coalMax, pr.coal * D, "fuel");
      row("oil" + tg, [[cd, 1], [ci, 1]].concat(oilF.map(function (x) { return [x[0], -x[1]]; })), F.oil / P.refYield, F.oil / P.refYield);
      row("gas" + tg, [[gd, 1 - P.gasOwn], [gl, 1]].concat(gasF.map(function (x) { return [x[0], -x[1]]; })), F.gas, F.gas);
      row("cl" + tg, [[qc, 1 - P.coalOwn]].concat(coalF.map(function (x) { return [x[0], -x[1]]; })), F.coal, F.coal);
      CO2[p] = [[cd, P.f.oil / 1000], [ci, P.f.oil / 1000], [gd, P.f.gas / 1000], [gl, P.f.gas / 1000], [qc, P.f.coal / 1000]];
      PRIM[p] = [[cd, 1], [ci, 1], [gd, 1], [gl, 1], [qc, 1]].concat(nucE, renE);
      IMP[p] = [[ci, 1], [gl, 1]];
      // the import cap: imports - cap x primary - over <= 0
      var oi = v("oimp" + tg, 0, o.noPenalty ? 0 : Infinity, pen.importPerGJ, "penalty");
      var t = {}; IMP[p].forEach(function (x) { t[x[0]] = (t[x[0]] || 0) + x[1]; }); PRIM[p].forEach(function (x) { t[x[0]] = (t[x[0]] || 0) - S.cap * x[1]; });
      t[oi] = (t[oi] || 0) - 1;
      row("imp" + tg, Object.keys(t).map(function (k) { return [k, t[k]]; }), null, 0);
    });
    // retirements never reverse: kept open in p <= kept open in p-1. A unit online in p was online in p-1 (retirement years
    // only end), so a fixed 0 in p-1 is a unit retired in an earlier window: it stays at 0 (no reopening)
    if (S.retOn) P.units.forEach(function (u) {
      for (var p = 1; p < S.np; p++) { var a = kv[u.j][p - 1], b = kv[u.j][p];
        if (typeof b !== "string" || !P.on(u, S.Y[p - 1])) continue;
        if (typeof a === "string") row("kr_" + u.j + "_" + p, [[b, 1], [a, -1]], null, 0);
        else row("kr_" + u.j + "_" + p, [[b, 1]], null, a); }
    });
    // the budget: sum_p w_p CO2_p (modelled periods) <= what is left for them
    var left = S.budgetLeft != null ? S.budgetLeft : S.budget - S.w0 * P.carbon.base2025Mt;
    var ob = v("over", 0, o.noPenalty ? 0 : Infinity, pen.budgetPerT, "penalty");
    var bt = [[ob, -1]];
    only.forEach(function (p) { CO2[p].forEach(function (x) { bt.push([x[0], x[1] * S.w[p]]); }); });
    row("budget", bt, null, left);
    var m = { sense: "min", variables: V, constraints: C };
    if (o.objective) { var obj = o.objective(CO2, S); V.forEach(function (x) { x.cost = 0; }); m.objective = { terms: obj }; }
    m.meta = { only: only.slice(), CO2: CO2, PRIM: PRIM, IMP: IMP, left: left, cat: cat, tieC: tieC };
    return m;
  }

  // ---------------------------------------------------------------- limits first: one window's solve (see the header)
  // Run 1: the LP as built (overshoots at their penalties). It meets both limits: done. Else run 2: the least overshoot,
  // tonnes over the budget and GJ over the cap weighted as their penalties weigh them, with no more unserved energy and
  // stress-hour shortfall (penalty dollars) than run 1; run 3: the least cost with each overshoot at most run 2's (0 when
  // run 2 reaches 0: the limits hold, and run 3 is the hard-limit LP). The result is run 3's, with reach, miss and stages.
  var LIM_TOL = { miss: 0.01, svc: 0.001 };      // $M: 10 t over the budget or 0.1 TJ over the cap; $1,000 of penalties
  function termsOf(m, re) { var t = []; m.variables.forEach(function (v) { if (re.test(v.name)) t.push([v.name, v.cost]); }); return t; }
  function solveWindow(m, sol, op) {
    var call = function (mm) { return new Promise(function (res) { res(sol(mm, op)); }); };
    var MT = termsOf(m, /^(over|oimp_\d+)$/), ST = termsOf(m, /^(us|ss)_/);
    var lin = function (T, x) { return T.reduce(function (a, t) { return a + (x[t[0]] || 0) * t[1]; }, 0); };
    return call(m).then(function (r) {
      if (r.status !== "optimal") return r;
      r.reach = true; r.miss = 0; r.stages = 1;
      if (lin(MT, r.values) <= LIM_TOL.miss) return r;
      var svc = lin(ST, r.values), svcRow = { name: "service", terms: ST, ub: svc + Math.max(LIM_TOL.svc, 1e-7 * svc) };
      var m2 = { sense: "min", variables: m.variables.map(function (v) { return { name: v.name, lb: v.lb, ub: v.ub, cost: 0 }; }), constraints: m.constraints.concat([svcRow]), objective: { terms: MT } };
      return call(m2).then(function (r2) {
        if (r2.status !== "optimal") return r2;
        var reach = r2.objective <= LIM_TOL.miss;
        var third = function (hard) {
          var ub = {}; MT.forEach(function (t) { ub[t[0]] = hard ? 0 : (r2.values[t[0]] || 0) * (1 + 1e-9) + 1e-6; });
          var m3 = { sense: "min", variables: m.variables.map(function (v) { return ub[v.name] != null ? { name: v.name, lb: 0, ub: ub[v.name], cost: 0 } : { name: v.name, lb: v.lb, ub: v.ub, cost: v.cost }; }), constraints: m.constraints.concat([svcRow]) };
          return call(m3);
        };
        return third(reach).then(function (r3) { return reach && r3.status === "infeasible" ? third(false) : r3; }).then(function (r3) {
          if (r3.status !== "optimal") return r3;
          r3.reach = reach; r3.miss = r2.objective; r3.stages = 3;
          return r3;
        });
      });
    });
  }

  // ---------------------------------------------------------------- the hourly year (prairieland.json timeSlices.hourRule)
  // Yr: { demand, wind, solar } (8,760 values each: town_year.json for 2025, m03-capacity-expansion-2024.json for 2024)
  function hourly(P, Yr) {
    var TS = P.PL.timeSlices, N = Yr.demand.length, mean = sum(Yr.demand) / N;
    return { N: N, demand: Yr.demand.map(function (d) { return d / mean; }),
      wind: REG.map(function (k) { var a = TS.windScale[k], lag = TS.windLagHours[k]; return Yr.demand.map(function (d, i) { return a * Yr.wind[((i - lag) % N + N) % N] / 1000; }); }),
      solar: REG.map(function (k) { var a = TS.solarScale[k]; return Yr.solar.map(function (v) { return a * v / 1000; }); }) };
  }
  // the two stress hours of the reserve rule, from 2025's hours: the peak net-load hour prairieland.json names, and the hour
  // of the highest national net load inside the scarce-wind week (net load: load less the 2025 fleet's wind and solar)
  function stressHours(P, y25) {
    var H = hourly(P, y25), ex = P.PL.timeSlices.extremes, y0 = Date.UTC(2025, 0, 1);
    var dayOf = function (iso) { return Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - y0) / 864e5); };
    var bus = P.R.map(function (R) { var e = R.el2025; return e * MWH_PER_PJ / (1 - P.gridLoss) / P.hours; });
    var w25 = P.R.map(function (R, r) { return P.PL.fleet.units.filter(function (u) { return u.tech === "wind" && P.ri[u.region] === r && u.built <= 2025 && u.retire > 2025; }).reduce(function (a, u) { return a + u.mw; }, 0); });
    var s25 = P.R.map(function (R, r) { return P.PL.fleet.units.filter(function (u) { return u.tech === "solar" && P.ri[u.region] === r && u.built <= 2025 && u.retire > 2025; }).reduce(function (a, u) { return a + u.mw; }, 0); });
    var net = function (i) { var t = 0; P.R.forEach(function (R, r) { t += bus[r] * H.demand[i] - w25[r] * H.wind[r][i] - s25[r] * H.solar[r][i]; }); return t; };
    var pk = dayOf(ex.peakNetLoadDay.date) * 24 + ex.peakNetLoadDay.hour;
    var w0 = dayOf(ex.scarceWindWeek.start), wi = w0 * 24;
    for (var i = w0 * 24; i < (w0 + 7) * 24; i++) if (net(i) > net(wi) + 1e-9) wi = i;
    var hh = function (i) { var d = new Date(y0 + Math.floor(i / 24) * 864e5); return d.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()] + " 2025, " + ((i % 24) < 10 ? "0" : "") + (i % 24) + ":00"; };
    var r4 = function (v) { return Math.round(v * 1e4) / 1e4; };
    return [{ key: "peak", i: pk, when: hh(pk), label: "the peak net-load hour (" + hh(pk) + ")" }, { key: "winter", i: wi, when: hh(wi), label: "the busiest hour of the scarce-wind week (" + hh(wi) + ")" }].map(function (x) {
      return { key: x.key, i: x.i, when: x.when, label: x.label, season: seasonOfDay(Math.floor(x.i / 24)), demand: r4(H.demand[x.i]), wind: P.R.map(function (R, r) { return r4(H.wind[r][x.i]); }), solar: P.R.map(function (R, r) { return r4(H.solar[r][x.i]); }), netLoad2025GW: Math.round(net(x.i) / 10) / 100 };
    });
  }

  // ---------------------------------------------------------------- reading a solved model
  // raw: the decisions of every period (from this model, or fixed from earlier windows) and, for each modelled period p,
  // what ran (raw.per[p]); merge() joins the windows of a decade-by-decade run
  function read(P, S, m, r) {
    var x = r.values, val = function (n) { return x[n] || 0; }, fx = S.fixed || { n: {}, k: {}, a: {} };
    var dec = function (nm, dflt) { return x[nm] != null ? x[nm] : fx[nm.charAt(0)][nm] != null ? fx[nm.charAt(0)][nm] : dflt; };
    var raw = { Y: S.Y, np: S.np, only: m.meta.only.slice(), per: S.Y.map(function () { return null; }), over: val("over"), reach: r.reach !== false, stages: r.stages || 1 };
    raw.n = P.R.map(function (R, rr) { var o = {}; NEW.forEach(function (t) { o[t] = S.Y.map(function (y, q) { return dec("n_" + rr + t + q, 0); }); }); return o; });
    raw.firm = S.Y.map(function (y, q) { return dec("n_firm" + q, 0); });
    raw.a = P.links.map(function (l) { return S.Y.map(function (y, q) { return dec("a_" + l.i + "_" + q, 0); }); });
    raw.k = P.units.map(function (u) { return S.Y.map(function (y, p) { return P.on(u, y) ? dec("k_" + u.j + "_" + p, u.mw) : 0; }); });
    var duals = r.duals || {};
    raw.budgetDual = duals.budget || 0;
    raw.only.forEach(function (p) {
      var y = S.Y[p], tg = "_" + p, D = S.D[p], q = { p: p, y: y };
      var G = {}, GR = P.R.map(function () { return {}; }), add = function (r_, t, v) { G[t] = (G[t] || 0) + v; GR[r_][t] = (GR[r_][t] || 0) + v; };
      var mwh = function (nm, s) { return val(nm) * P.S[s].h; };
      P.units.forEach(function (u) { if (!raw.k[u.j][p]) return; P.S.forEach(function (s) { add(u.r, u.tech, mwh("g_" + u.j + "_" + s.i + tg, s.i)); }); });
      var avail = { wind: 0, solar: 0 }, unserved = P.R.map(function () { return 0; }), unservedH = 0, bIn = 0;
      P.R.forEach(function (R, rr) {
        P.S.forEach(function (s) {
          add(rr, "nuclear", mwh("nu_" + rr + "_" + s.i + tg, s.i));
          add(rr, "hydro", mwh("hy_" + rr + "_" + s.i + tg, s.i));
          ["wind", "solar"].forEach(function (t) { add(rr, t, mwh("vr_" + rr + t + "_" + s.i + tg, s.i)); });
          ["gasCC", "gasCT"].forEach(function (t) { add(rr, t, mwh("ng_" + rr + t + "_" + s.i + tg, s.i)); });
          add(rr, "battery", mwh("bd_" + rr + "_" + s.i + tg, s.i)); bIn += mwh("bc_" + rr + "_" + s.i + tg, s.i);
          var us = val("us_" + rr + "_" + s.i + tg); unserved[rr] += us * s.h; if (us > 0.5) unservedH += s.h;
          add(rr, "firm", mwh("fg_" + s.i + tg, s.i) * S.share[p][rr]);
        });
        ["wind", "solar"].forEach(function (t) { var c = capNow(P, raw, t, rr, p); P.S.forEach(function (s) { avail[t] += c * (t === "wind" ? s.wind[rr] : s.solar[rr]) * s.h; }); });
      });
      q.genMWh = G; q.genR = GR; q.batteryIn = bIn; q.unservedMWh = sum(unserved); q.unservedR = unserved; q.unservedHours = unservedH;
      q.curtailMWh = { wind: Math.max(0, avail.wind - (G.wind || 0)), solar: Math.max(0, avail.solar - (G.solar || 0)) }; q.availMWh = avail;
      q.fuel = { crudeDom: val("cdom" + tg), crudeImp: val("cimp" + tg), gasDom: val("gdom" + tg), lng: val("lng" + tg), coal: val("coal" + tg) };
      var lin = function (T) { return T.reduce(function (a, t) { return a + val(t[0]) * t[1]; }, 0); };
      q.co2 = lin(m.meta.CO2[p]); q.primary = lin(m.meta.PRIM[p]); q.imports = lin(m.meta.IMP[p]); q.importShare = q.imports / q.primary;
      q.fuelValue = { oil: (duals["oil" + tg] || 0) / D, gas: (duals["gas" + tg] || 0) / D, coal: (duals["cl" + tg] || 0) / D };   // $/GJ that year, carbon value included
      q.importOver = val("oimp" + tg); q.importDual = duals["imp" + tg] ? -duals["imp" + tg] / D : 0;   // $ per GJ a year, in that year
      q.price = P.R.map(function (R, rr) {                       // load-weighted marginal cost of electricity ($/MWh, that year's dollars)
        var a = 0, b = 0; P.S.forEach(function (s) { var L = S.loadMW[p][rr] * s.demand * s.h, d = duals["bal_" + rr + "_" + s.i + tg]; if (d == null) return; a += L * d * 1e6 / (s.h * D); b += L; });
        return b ? a / b : null;
      });
      q.slicePrice = P.R.map(function (R, rr) { return P.S.map(function (s) { var d = duals["bal_" + rr + "_" + s.i + tg]; return d == null ? null : d * 1e6 / (s.h * D); }); });
      q.linkAt = P.links.map(function (l) {                      // hours a year the link runs at its limit (slice hours)
        var cap = l.mw; for (var qq = 0; qq <= p; qq++) cap += raw.a[l.i][qq];
        var h = 0; P.S.forEach(function (s) { if (val("fw_" + l.i + "_" + s.i + tg) + val("fb_" + l.i + "_" + s.i + tg) >= cap - 0.5 && cap > 0) h += s.h; }); return h;
      });
      q.stressShort = {}; (cfg0(P).stress || []).forEach(function (Hh, hi) { P.R.forEach(function (R, rr) { var sv = val("ss_" + hi + "_" + rr + tg); if (sv > 1e-6) q.stressShort[hi + "_" + rr] = sv; }); });
      q.flows = P.links.map(function (l) { return P.S.map(function (s) { return val("fw_" + l.i + "_" + s.i + tg) - val("fb_" + l.i + "_" + s.i + tg); }); });
      raw.per[p] = q;
    });
    return raw;
  }
  function cfg0(P) { return P.cfg; }
  // online capacity (MW) of a technology in region r, period p: existing units still open + new builds whose life covers p
  function capNow(P, raw, t, r, p) {
    var Y = raw.Y, y = Y[p], c = 0;
    if (t === "firm") { for (var q = 0; q <= p; q++) if (Y[p] - Y[q] < P.tech.firm.life) c += raw.firm[q]; return c; }
    if (FOSSIL.indexOf(t) >= 0) P.units.forEach(function (u) { if (u.r === r && u.tech === t) c += raw.k[u.j][p]; });
    else c += P.exist(t, r, y);
    if (NEW.indexOf(t) >= 0) for (var q2 = 0; q2 <= p; q2++) if (Y[p] - Y[q2] < P.tech[t].life) c += raw.n[r][t][q2];
    return c;
  }
  // join the windows of a run: decisions from the last window (it holds every earlier one as fixed), periods from each
  function merge(raws) {
    var out = copy(raws[raws.length - 1]);
    out.per = out.per.map(function (q, p) { for (var i = 0; i < raws.length; i++) if (raws[i].per[p] && raws[i].only.indexOf(p) >= 0) return raws[i].per[p]; return q; });
    out.only = out.Y.map(function (y, p) { return p; });
    out.over = sum(raws.map(function (r) { return r.over; }));
    out.reach = raws.every(function (r) { return r.reach; });
    out.windows = raws.map(function (r) { return { only: r.only, budgetDual: r.budgetDual, over: r.over, reach: r.reach }; });
    return out;
  }
  // the decisions of periods up to f (index), as S.fixed
  function fixedOf(P, raw, f) {
    var o = { n: {}, k: {}, a: {} };
    raw.Y.forEach(function (y, q) {
      if (q > f) return;
      P.R.forEach(function (R, r) { NEW.forEach(function (t) { o.n["n_" + r + t + q] = raw.n[r][t][q]; }); });
      o.n["n_firm" + q] = raw.firm[q];
      P.links.forEach(function (l) { o.a["a_" + l.i + "_" + q] = raw.a[l.i][q]; });
      P.units.forEach(function (u) { if (P.on(u, y)) o.k["k_" + u.j + "_" + q] = raw.k[u.j][q]; });
    });
    return o;
  }

  // ---------------------------------------------------------------- money: each model year's cost and the present value
  // yearly ($M a year, that year's 2025 dollars): new plants' and links' payments (annuity + fixed O&M) for what is open,
  // fixed O&M of fossil plants kept open, variable O&M of what ran, fuels bought; pv = sum_p D_p x yearly_p
  function money(P, S, raw) {
    var T = P.tech, cfg = P.cfg, Y = S.Y;
    var yearly = Y.map(function (y, p) {
      var q = raw.per[p]; if (!q) return null;
      var o = { capital: 0, transmission: 0, fom: 0, vom: 0, fuel: 0 };
      P.R.forEach(function (R, r) { NEW.forEach(function (t) { for (var b = 0; b <= p; b++) if (Y[p] - Y[b] < T[t].life) o.capital += raw.n[r][t][b] * (S.capex[b][t] * crf(S.rate, T[t].life) + T[t].fom) / 1000; }); });
      for (var b = 0; b <= p; b++) if (Y[p] - Y[b] < T.firm.life) o.capital += raw.firm[b] * (S.capex[b].firm * crf(S.rate, T.firm.life) + T.firm.fom) / 1000;
      P.links.forEach(function (l) { for (var b2 = 0; b2 <= p; b2++) o.transmission += raw.a[l.i][b2] * l.km * S.txCost * crf(S.rate, P.tx.life) / 1e6; });
      P.units.forEach(function (u) { var om = u.tech === "coal" || u.tech === "oil" ? cfg.existing.om[u.tech].fom : T[u.tech].fom; o.fom += raw.k[u.j][p] * om / 1000; });
      var G = q.genR, vomOf = function (t) { return t === "coal" || t === "oil" ? cfg.existing.om[t].vom : t === "nuclear" ? cfg.existing.om.nuclear.vom : t === "firm" ? T.firm.vom : T[t] ? T[t].vom : 0; };
      G.forEach(function (g) { for (var t in g) if (t !== "battery" && t !== "firm") o.vom += g[t] * vomOf(t) / 1e6; });
      o.vom += (q.genMWh.firm || 0) * T.firm.vom / 1e6;
      var f = q.fuel, pr = S.price[p];
      o.fuel = (f.crudeDom + f.crudeImp) * pr.oil + f.gasDom * pr.gas + f.lng * pr.lng + f.coal * pr.coal;
      o.total = o.capital + o.transmission + o.fom + o.vom + o.fuel;
      return o;
    });
    var pv = { capital: 0, transmission: 0, fom: 0, vom: 0, fuel: 0, total: 0 };
    yearly.forEach(function (o, p) { if (!o) return; for (var k in pv) pv[k] += o[k] * S.D[p]; });
    return { yearly: yearly, pv: pv };
  }

  // ---------------------------------------------------------------- runs: windows, foresight and shocks
  var WORDS = { infeasible: "No pathway meets every rule of this plan.", "time-limit": "The run reached its time limit before the solver proved the best pathway.",
    cancelled: "The run was stopped.", superseded: "A newer run replaced this one.", error: "The solver failed on this plan." };
  function windowsOf(state, from) {
    var all = state.fs === "myopic" ? [[0, 1], [2, 3], [4]] : [[0, 1, 2, 3, 4]];
    return all.map(function (w) { return w.filter(function (p) { return p >= from; }); }).filter(function (w) { return w.length; });
  }
  // solve windows in turn; each sees only its periods, earlier decisions fixed, and a share of the budget left
  function runWindows(state, P, sol, o) {
    var B = state.bud, w0 = sysOf(state, P).w0, base = P.carbon.base2025Mt;
    var wins = windowsOf(state, o.from || 0), raws = [], fixed = o.fixed || { n: {}, k: {}, a: {} }, spent = w0 * base + (o.spent || 0), models = [];
    var step = function (i) {
      if (i >= wins.length) return Promise.resolve({ ok: true });
      var win = wins[i], rest = []; for (var j = i; j < wins.length; j++) rest = rest.concat(wins[j]);
      var S0 = sysOf(state, P, { shock: o.shock }), wsum = function (ps) { return sum(ps.map(function (p) { return S0.w[p]; })); };
      var left = i === 0 && o.firstLeft != null ? o.firstLeft : (B - spent) * wsum(win) / wsum(rest);
      var S = sysOf(state, P, { shock: o.shock, only: win, fixed: fixed, budgetLeft: left, horizonEnd: state.fs === "myopic" ? win[win.length - 1] : S0.np - 1, fixedThrough: o.fixedThrough });
      var m = build(P, S, o.build);
      return solveWindow(m, sol, { timeLimit: o.timeLimit, signal: o.signal }).then(function (r) {
        if (r.status !== "optimal") return { ok: false, r: r, window: win };
        var raw = read(P, S, m, r); raws.push(raw); models.push({ cols: m.variables.length, rows: m.constraints.length, ms: r.ms && r.ms.total, stages: r.stages });
        win.forEach(function (p) { spent += S.w[p] * raw.per[p].co2; });
        fixed = fixedOf(P, raw, win[win.length - 1]);
        return step(i + 1);
      });
    };
    return step(0).then(function (x) { if (!x.ok) return x; return { ok: true, raws: raws, models: models }; });
  }
  // a plan's run: its pathway (perfect or decade by decade); with a shock, the re-plan from the shock's year as well
  function solverOf(o) { return o.solver || (typeof window !== "undefined" && window.LX && window.LX.solver ? function (m, op) { return window.LX.solver.solve(m, op); } : null); }
  function planRun(state, P, sol, o) {
    return runWindows(state, P, sol, { timeLimit: o.timeLimit, signal: o.signal, build: o.build }).then(function (a) {
      if (!a.ok) return a; return { ok: true, raw: merge(a.raws), models: a.models };
    });
  }
  // the re-plan after a shock: decisions up to and including the shock's model year fixed at the plan's; that year runs
  // what was built under the shock; later years re-plan knowing it (with the plan's foresight). A shock on new plants'
  // price (levers.shockRule "before": the mineral restriction) meets plants not yet bought: decisions through the model
  // year before it are kept, and the shock year's builds are re-planned at its price (plants
  // already decided are never repriced)
  function keptThrough(P, shock, sp) { return ((P.cfg.levers.shockRule || {})[shock] || {}).keep === "before" ? sp - 1 : sp; }
  function shockRun(state, P, sol, raw, shock, o) {
    var S = sysOf(state, P), Ss = sysOf(state, P, { shock: shock }), sp = Ss.shockP, spent = 0, kt = keptThrough(P, shock, sp);
    for (var p = 0; p < sp; p++) spent += S.w[p] * raw.per[p].co2;
    // decade by decade: the window the shock falls in keeps the share of the budget the plan gave it, less what its
    // earlier years emitted (so a shock that changes nothing the plan uses changes nothing)
    var firstLeft = null;
    if (state.fs === "myopic") {
      var wins = windowsOf(state, 0), win = wins.filter(function (w) { return w.indexOf(sp) >= 0; })[0], wsum = function (ps) { return sum(ps.map(function (q) { return S.w[q]; })); };
      var before = S.w0 * P.carbon.base2025Mt, restAll = [];
      for (var q = 0; q < win[0]; q++) before += S.w[q] * raw.per[q].co2;
      for (var q2 = win[0]; q2 < S.np; q2++) restAll.push(q2);
      firstLeft = (state.bud - before) * wsum(win) / wsum(restAll);
      win.forEach(function (q3) { if (q3 < sp) firstLeft -= S.w[q3] * raw.per[q3].co2; });
    }
    return runWindows(state, P, sol, { timeLimit: o.timeLimit, signal: o.signal, shock: shock, from: sp, fixed: fixedOf(P, raw, kt), fixedThrough: kt, spent: spent, firstLeft: firstLeft, build: o.build }).then(function (b) {
      if (!b.ok) return b;
      var rawS = merge(b.raws); for (var p2 = 0; p2 < sp; p2++) rawS.per[p2] = raw.per[p2];
      var R = summarize(state, P, Ss, rawS); R.key = shock; R.year = Ss.shockYear; R.label = P.shocks[shock].label; R.keptThrough = kt;
      return { ok: true, raw: rawS, results: R, models: b.models };
    });
  }
  function solve(state, P, o) {
    o = o || {};
    var t0 = Date.now(), sol = solverOf(o);
    if (!sol) return Promise.resolve({ status: "error", ok: false, kind: "lp", message: "No solver is available." });
    var tl = o.timeLimit || (o.attempt > 1 ? P.cfg.solver.retryTimeLimit : P.cfg.solver.timeLimit), op = { timeLimit: tl, signal: o.signal, build: o.build };
    var fail = function (r) { return { status: r.status, ok: false, kind: "lp", message: WORDS[r.status] || r.message || ("The solver reported " + r.status + "."), hint: null, ms: Date.now() - t0 }; };
    var shock = o.shock !== undefined ? o.shock : (state.sh && state.sh !== "none" ? state.sh : null);
    return Promise.resolve().then(function () { return planRun(state, P, sol, op); }).then(function (a) {
      if (!a.ok) return fail(a.r);
      var res = { plan: summarize(state, P, sysOf(state, P), a.raw), models: a.models }, msg = doneWords(state, { reach: a.raw.reach, windowReach: (a.raw.windows || []).map(function (w) { return w.reach; }) });
      if (!shock) return { status: "optimal", ok: true, kind: "lp", message: msg, results: res, ms: Date.now() - t0 };
      return shockRun(state, P, sol, a.raw, shock, op).then(function (b) {
        if (!b.ok) return fail(b.r);
        res.shock = b.results; res.models = res.models.concat(b.models);
        return { status: "optimal", ok: true, kind: "lp", message: msg, results: res, ms: Date.now() - t0 };
      });
    }).then(null, function (e) { return { status: "error", ok: false, kind: "lp", message: "The run failed: " + (e && e.message || e), ms: Date.now() - t0 }; });
  }
  // C4's test: the plan once, then each of the four shocks (C4's list in prairieland.json) re-planned in turn
  function c4Shocks(P) { return P.PL.shocks.filter(function (s) { return s.in.indexOf("C4") >= 0; }).map(function (s) { return s.key; }); }
  function shockTest(state, P, o) {
    o = o || {};
    var t0 = Date.now(), sol = solverOf(o);
    if (!sol) return Promise.resolve({ status: "error", ok: false, kind: "lp", message: "No solver is available." });
    var tl = o.timeLimit || (o.attempt > 1 ? P.cfg.solver.retryTimeLimit : P.cfg.solver.timeLimit), op = { timeLimit: tl, signal: o.signal, build: o.build };
    var fail = function (r, k) { return { status: r.status, ok: false, kind: "lp", message: (k ? "The " + P.shocks[k].label.toLowerCase() + " run: " : "") + (WORDS[r.status] || r.message || ("The solver reported " + r.status + ".")), hint: null, ms: Date.now() - t0 }; };
    var keys = c4Shocks(P), out = { shocks: {} };
    return Promise.resolve().then(function () { return planRun(state, P, sol, op); }).then(function (a) {
      if (!a.ok) return fail(a.r);
      out.plan = summarize(state, P, sysOf(state, P), a.raw);
      var step = function (i) {
        if (i >= keys.length) return Promise.resolve({ status: "optimal", ok: true, kind: "lp", message: "", results: out, ms: Date.now() - t0 });
        if (o.onShock) o.onShock(i, keys.length, keys[i]);
        return shockRun(state, P, sol, a.raw, keys[i], op).then(function (b) { if (!b.ok) return fail(b.r, keys[i]); out.shocks[keys[i]] = b.results; return step(i + 1); });
      };
      return step(0);
    }).then(null, function (e) { return { status: "error", ok: false, kind: "lp", message: "The run failed: " + (e && e.message || e), ms: Date.now() - t0 }; });
  }
  function presetsOf(P) { return P.cfg.presets; }
  // the budget gap with lesson A20 (A20 states the other side): A20's closed-form
  // accounting meets 2,600 Mt, this LP's floor is about 2,700 Mt (most electrification, central demand, straight-line
  // counting: 2,673 Mt). Tested: lifting the build-rate and transmission limits a hundredfold moves the floor by about 5 Mt;
  // A20's electrification path inside a copy of this engine lowers it to about 2,414 Mt (test_m13-national-pathway.js).
  // [the floor, the reason, what it is not]; [[lesson:...]] marks for LX.rich
  var GAP = ["Counted with straight lines between model years, no pathway here gets below about 2,700 Mt at central demand, even at the most electrification.",
    "[[lesson:a20-national-scenarios|A20]]'s simpler accounting meets 2,600 Mt: its fastest path electrifies buildings and industry years sooner (15 points a period from 2025), while here each share rises in a straight line to 2050.",
    "Not the build limits: lifting this engine's build-rate and transmission limits a hundredfold lowers its floor by about 5 Mt; A20's electrification path inside it lowers the floor to about 2,400 Mt."];
  // the run's status line, by foresight (decade by decade solves each window to optimality, which does
  // not make the combined pathway the cheapest over 2026-2050); V: a view, or { reach } from a run
  var WIN_NAMES = ["2030–2035", "2040–2045", "2050"];
  function doneWords(state, V, o) {
    o = o || {};
    var t = state.fs === "myopic" ? "Done: three decision windows in turn (2030–2035, 2040–2045, 2050), each solved to optimality" + (o.four ? ", then the four shocks re-planned" : "") + "; the combined pathway is not guaranteed the cheapest over 2026–2050."
      : "Done: the least-cost pathway for this plan over 2026–2050 with perfect foresight" + (o.four ? ", re-planned after each of the four shocks" : "") + " (the solver reports optimal).";
    if (V && V.reach === false) {
      var miss = state.fs === "myopic" && V.windowReach ? V.windowReach.map(function (ok, i) { return ok ? null : WIN_NAMES[i]; }).filter(Boolean) : [];
      t += miss.length ? " The window " + miss.join(" and the window ") + " cannot meet its share of the limits: it runs the closest plan (least overshoot), then the least cost among those."
        : " A limit is out of reach: the run shows the closest pathway (least overshoot), then the least cost among those.";
    }
    return t;
  }
  // a full-year check's verdict (prairieland.json timeSlices.fullYearCheck.survives, a teaching rule): survives when all
  // demand is served and the year's CO2 is within 10% of the slices' estimate; why, in words. It checks the dispatch of one
  // model year, not the cumulative budget and not adequacy
  var FULL_TOL = 0.1;
  function fullVerdict(c) {
    var served = c.unservedMWh < 0.5, near = Math.abs(c.gap) <= FULL_TOL, why = [];
    if (!served) why.push(kilo(c.unservedHours) + " h unserved");
    if (!near) why.push("CO₂ " + (c.gap >= 0 ? "+" : "") + pct(c.gap, 1) + " against the slices");
    return { ok: served && near, served: served, near: near, text: served && near ? "survives" : "does not survive (" + why.join("; ") + ")" };
  }
  // the four shocks (and the two A21 keeps for itself) as the engine runs them: one row each, with the model year it hits,
  // what changes, and what the re-plan keeps (magnitudes and durations, modelled effects apart from the story)
  function shockTable(P, keys) {
    var yr = P.cfg.levers.shockYear, each = P.each;
    return (keys || c4Shocks(P)).map(function (k) {
      var s = P.shocks[k], q = s.params, y = yr[k], y0 = y - each + 1, kt = ((P.cfg.levers.shockRule || {})[k] || {}).keep === "before";
      var what = k === "gasSpike" ? "LNG × " + q.lngX + " and domestic gas × " + q.gasX + " in price."
        : k === "drought" ? "Hydro output × " + q.hydroX + " in every slice. River-cooled plants (coal, combined cycles, the existing nuclear plants) at × " + q.thermalSummerX + " of their capacity in the summer slices and the summer stress hour. The generic firm option too."
        : k === "mineralBan" ? "New batteries bought in " + y0 + "–" + y + " cost × " + q.batteryCapexX + "."
        : k === "demandSurprise" ? "Electricity demand × " + q.elX + " in every slice and stress hour." : s.what;
      var when = k === "demandSurprise" ? "from " + q.from + " on (" + (q.from - each + 1) + "–2050)" : y + " (all of " + y0 + "–" + y + ")";
      var keep = kt ? "Decisions through " + (y - each) + " kept; " + y + "'s new plants re-planned at the higher price." : "Builds and retirements through " + y + " kept; " + y + " runs what was built; later years re-plan.";
      return [s.label, when, what, keep];
    });
  }

  // ---------------------------------------------------------------- the full-year check (of the representative slices)
  // The plan's capacities in model year p, re-dispatched hour by hour over a whole weather year (H = hourly(P, year)):
  // 52 weeks of 168 hours and 31 December, one LP each, batteries cyclic within each week, hydro's energy fixed day by day
  // (its season's factor), the links' limits, unserved energy at the penalty; fuels at the slice run's marginal values for
  // that year (fuel plus the carbon budget's value: the fuel rows' duals), so the check runs the same economics hour by
  // hour. CO2 of the year: the plants' fuel by the same domestic-first rule, plus the fixed final fuels.
  var MONTH0 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
  function seasonOfDay(d) { var m = 0; while (d >= MONTH0[m + 1]) m++; return m === 11 || m < 2 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "autumn"; }
  function fullYear(P, S, raw, p, H, o) {
    o = o || {};
    var cfg = P.cfg, T = P.tech, y = S.Y[p], q = raw.per[p], fv = q.fuelValue, pen = cfg.penalties;
    var hydroF = {}; P.S.forEach(function (s) { if (!s.extreme) hydroF[s.season] = s.hydro; });
    var weeks = []; for (var w = 0; w < 52; w++) weeks.push([w * 168, (w + 1) * 168]); weeks.push([52 * 168, H.N]);
    var cap = {}; P.R.forEach(function (R, r) { cap[r] = {}; ["wind", "solar", "battery", "gasCC", "gasCT"].forEach(function (t) { cap[r][t] = (t === "gasCC" || t === "gasCT") ? newCap(P, raw, t, r, p) : capNow(P, raw, t, r, p); }); });
    var firm = capNow(P, raw, "firm", 0, p), links = P.links.map(function (l) { var c = l.mw; for (var b = 0; b <= p; b++) c += raw.a[l.i][b]; return c; });
    var tot = { unservedMWh: 0, unservedHours: 0, curtailMWh: 0, oilPJ: 0, gasPJ: 0, coalPJ: 0, linkHours: P.links.map(function () { return 0; }), weekLow: null, gen: {}, status: "optimal", solves: 0, ms: 0 };
    var sol = o.solver;
    var one = function (wi) {
      if (wi >= weeks.length) return Promise.resolve(tot);
      var a = weeks[wi][0], b = weeks[wi][1], V = [], C = [], bal = {};
      var v = function (n, lb, ub, c) { V.push({ name: n, lb: lb, ub: ub, cost: c || 0 }); return n; };
      var row = function (n, t, lo, hi) { var c = { name: n, terms: t }; if (lo === hi) c.eq = lo; else { if (lo != null) c.lb = lo; if (hi != null) c.ub = hi; } C.push(c); };
      var B = function (r, h) { var k = r + "_" + h; return bal[k] || (bal[k] = []); };
      var fuelUse = { oil: [], gas: [], coal: [] }, ids = [];
      for (var h = a; h < b; h++) {
        var summer = seasonOfDay(Math.floor(h / 24)) === "summer";
        P.units.forEach(function (u) { var k = raw.k[u.j][p]; if (!k) return; var vom = u.tech === "coal" || u.tech === "oil" ? cfg.existing.om[u.tech].vom : T[u.tech].vom, f = u.tech === "coal" ? "coal" : u.tech === "oil" ? "oil" : "gas";
          var gpj = PJ_PER_MWH / u.eff, n = v("g" + u.j + "_" + h, 0, u.av * k * (summer && (u.tech === "coal" || u.tech === "gasCC") ? S.summerX[p] : 1), vom + fv[f] * gpj * 1e6);
          B(u.r, h).push([n, 1]); fuelUse[f].push([n, gpj]); ids.push([u.tech, n]); });
        P.R.forEach(function (R, r) {
          var nuc = P.exist("nuclear", r, y); if (nuc) { var n1 = v("nu" + r + "_" + h, 0, cfg.existing.availability.nuclear * nuc * (summer ? S.summerX[p] : 1), cfg.existing.om.nuclear.vom); B(r, h).push([n1, 1]); ids.push(["nuclear", n1]); }
          ["wind", "solar"].forEach(function (t) { var c = cap[r][t] * H[t][r][h]; if (c > 0) { var n2 = v(t.charAt(0) + r + "_" + h, 0, c, 0); B(r, h).push([n2, 1]); ids.push([t, n2]); tot._avail = (tot._avail || 0) + c; } });
          ["gasCC", "gasCT"].forEach(function (t) { var c = cap[r][t]; if (c > 0) { var gpj = PJ_PER_MWH / T[t].efficiency, n3 = v(t + r + "_" + h, 0, cfg.existing.availability[t] * c * (summer && t === "gasCC" ? S.summerX[p] : 1), T[t].vom + fv.gas * gpj * 1e6); B(r, h).push([n3, 1]); fuelUse.gas.push([n3, gpj]); ids.push([t, n3]); } });
          var un = v("u" + r + "_" + h, 0, Infinity, pen.unservedPerMWh); B(r, h).push([un, 1]); ids.push(["unserved", un]);
        });
        if (firm > 0) { var nf = v("f_" + h, 0, T.firm.availability * firm * (summer ? S.summerX[p] : 1), T.firm.vom); P.R.forEach(function (R, r) { B(r, h).push([nf, S.share[p][r]]); }); ids.push(["firm", nf]); }
        P.links.forEach(function (l) { var c = links[l.i], fw = v("lw" + l.i + "_" + h, 0, c, cfg.tie.flowPerMWh), bw = v("lx" + l.i + "_" + h, 0, c, cfg.tie.flowPerMWh);
          row("L" + l.i + "_" + h, [[fw, 1], [bw, 1]], null, c); B(l.a, h).push([fw, -1], [bw, 1 - l.loss]); B(l.b, h).push([fw, 1 - l.loss], [bw, -1]); });
      }
      // hydro by day, batteries cyclic over the week
      P.R.forEach(function (R, r) {
        var hy = P.exist("hydro", r, y);
        if (hy) for (var d0 = a; d0 < b; d0 += 24) { var e = hy * P.hydroCF[r] * hydroF[seasonOfDay(Math.floor(d0 / 24))] * S.hydroX[p] * 24, t2 = [];
          for (var h2 = d0; h2 < Math.min(b, d0 + 24); h2++) { var nh = v("h" + r + "_" + h2, 0, hy, 0); B(r, h2).push([nh, 1]); t2.push([nh, 1]); ids.push(["hydro", nh]); }
          row("H" + r + "_" + d0, t2, e * t2.length / 24, e * t2.length / 24); }
        var bp = cap[r].battery; if (bp > 0) {
          var eta = T.battery.roundTrip, E = T.battery.hours * bp, prev = null, first = null;
          for (var h3 = a; h3 < b; h3++) { var c3 = v("bc" + r + "_" + h3, 0, bp, 0), d3 = v("bd" + r + "_" + h3, 0, bp, cfg.tie.batteryPerMWh), sc = v("bs" + r + "_" + h3, 0, E, 0);
            row("bp" + r + "_" + h3, [[c3, 1], [d3, 1]], null, bp);
            B(r, h3).push([d3, 1], [c3, -1]); ids.push(["battery", d3]); ids.push(["batteryIn", c3]); ids.push(["soc" + r, sc]);
            if (prev) row("bq" + r + "_" + h3, [[sc, 1], [prev, -1], [c3, -eta], [d3, 1]], 0, 0); else first = { sc: sc, c: c3, d: d3 };
            prev = sc; }
          row("bq" + r + "_" + a, [[first.sc, 1], [prev, -1], [first.c, -eta], [first.d, 1]], 0, 0);
        }
      });
      for (var h4 = a; h4 < b; h4++) P.R.forEach(function (R, r) { var L = S.loadMW[p][r] * H.demand[h4]; row("bal" + r + "_" + h4, B(r, h4), L, L); });
      var m = { sense: "min", variables: V, constraints: C };
      return new Promise(function (res) { res(sol(m, { timeLimit: o.timeLimit || 60, signal: o.signal })); }).then(function (r) {
        tot.solves++; tot.ms += (r.ms && r.ms.total) || 0;
        if (r.status !== "optimal") { tot.status = r.status; tot.failedWeek = wi; tot.msg = r.message; return tot; }
        var x = r.values;
        ids.forEach(function (it) { var vv = x[it[1]] || 0; if (it[0].indexOf("soc") === 0) return; tot.gen[it[0]] = (tot.gen[it[0]] || 0) + vv; });
        var used = 0; ids.forEach(function (it) { if (it[0] === "wind" || it[0] === "solar") used += x[it[1]] || 0; });
        for (var h5 = a; h5 < b; h5++) { var us = 0; P.R.forEach(function (R, r) { us += x["u" + r + "_" + h5] || 0; }); tot.unservedMWh += us; if (us > 0.5) tot.unservedHours++;
          P.links.forEach(function (l) { if ((x["lw" + l.i + "_" + h5] || 0) + (x["lx" + l.i + "_" + h5] || 0) >= links[l.i] - 0.5 && links[l.i] > 0) tot.linkHours[l.i]++; }); }
        ["oil", "gas", "coal"].forEach(function (f) { fuelUse[f].forEach(function (t) { tot[f + "PJ"] += (x[t[0]] || 0) * t[1]; }); });
        if (wi === 0) { var low = Infinity, any = false; ids.forEach(function (it) { if (it[0].indexOf("soc") === 0) { any = true; } });
          if (any) { for (var h6 = a; h6 < b; h6++) { var sN = 0; P.R.forEach(function (R, r) { sN += x["bs" + r + "_" + h6] || 0; }); low = Math.min(low, sN); } tot.weekLow = low; } }
        if (o.onWeek) o.onWeek(wi + 1, weeks.length);
        return one(wi + 1);
      });
    };
    return one(0).then(function (t) {
      if (t.status !== "optimal") return t;
      t.curtailMWh = Math.max(0, (t._avail || 0) - (t.gen.wind || 0) - (t.gen.solar || 0)); delete t._avail;
      // CO2: the plants' fuel plus the final fuels, supplied domestic first (as the slice run's fuel rows)
      var F = S.fuel[p], crude = F.oil / P.refYield + t.oilPJ, gasNeed = F.gas + t.gasPJ, gd = Math.min(P.domGas, gasNeed / (1 - P.gasOwn)), lng = Math.max(0, gasNeed - gd * (1 - P.gasOwn));
      var coal = (F.coal + t.coalPJ) / (1 - P.coalOwn);
      t.co2 = (crude * P.f.oil + (gd + lng) * P.f.gas + coal * P.f.coal) / 1000; t.co2Slices = q.co2; t.co2Gap = t.co2 / q.co2 - 1;
      t.coalOverMine = coal > P.coalMax + 1e-6;
      t.year = y; t.p = p;
      return t;
    });
  }
  function newCap(P, raw, t, r, p) { var c = 0; for (var q = 0; q <= p; q++) if (raw.Y[p] - raw.Y[q] < P.tech[t].life) c += raw.n[r][t][q]; return c; }

  // ---------------------------------------------------------------- what a page shows (pure)
  function summarize(state, P, S, raw) {
    var M = money(P, S, raw), Y = S.Y, R = { Y: Y, raw: raw, money: M, S: { w: S.w, w0: S.w0, D: S.D, budget: S.budget, cap: S.cap, loadMW: S.loadMW, elPJ: S.elPJ, fuel: S.fuel, share: S.share, z: S.z,
      reserve: S.reserve, summerX: S.summerX, hydroX: S.hydroX, acc: state.acc, fs: state.fs } };
    R.co2 = Y.map(function (y, p) { return raw.per[p].co2; });
    R.cum = S.w0 * P.carbon.base2025Mt + sum(Y.map(function (y, p) { return S.w[p] * R.co2[p]; }));
    R.over = Math.max(0, R.cum - S.budget);
    R.importShare = Y.map(function (y, p) { return raw.per[p].importShare; });
    R.capOver = Y.map(function (y, p) { return raw.per[p].importOver; });
    R.techs = ["coal", "gasCC", "gasCT", "oil", "nuclear", "hydro", "wind", "solar", "battery", "firm"];
    R.cap = Y.map(function (y, p) { var o = {}; R.techs.forEach(function (t) { o[t] = 0; P.R.forEach(function (Rr, r) { if (t !== "firm") o[t] += capNow(P, raw, t, r, p); }); }); o.firm = capNow(P, raw, "firm", 0, p); return o; });
    R.gen = Y.map(function (y, p) { var g = raw.per[p].genMWh, o = {}; R.techs.forEach(function (t) { o[t] = (g[t] || 0) / 1e6; }); return o; });   // TWh
    R.genTot = R.gen.map(function (g) { return sum(R.techs.map(function (t) { return g[t]; })); });
    R.clean = Y.map(function (y, p) { var g = R.gen[p]; return (g.nuclear + g.hydro + g.wind + g.solar + g.firm) / (R.genTot[p] - g.battery); });
    R.built = {}; NEW.concat(["firm"]).forEach(function (t) { R.built[t] = Y.map(function (y, q) { return t === "firm" ? raw.firm[q] : sum(P.R.map(function (Rr, r) { return raw.n[r][t][q]; })); }); });
    R.builtR = P.R.map(function (Rr, r) { var o = {}; NEW.forEach(function (t) { o[t] = sum(raw.n[r][t]); }); return o; });
    R.txAdd = Y.map(function (y, q) { return sum(P.links.map(function (l) { return raw.a[l.i][q]; })); });
    R.early = Y.map(function (y, p) { return sum(P.units.map(function (u) { return P.on(u, y) ? u.mw - raw.k[u.j][p] : 0; })); });
    R.unservedTWh = Y.map(function (y, p) { return raw.per[p].unservedMWh / 1e6; });
    R.curtailTWh = Y.map(function (y, p) { var c = raw.per[p].curtailMWh; return (c.wind + c.solar) / 1e6; });
    R.fuel = Y.map(function (y, p) { return raw.per[p].fuel; });
    R.price = Y.map(function (y, p) { return raw.per[p].price; });
    // $ per t, present value in 2025, one per decision window; null where the window missed a limit (its LP is the closest
    // plan's, pinned at the frontier: its duals are not marginal values of the plan asked for); the windows' model years
    var wins = raw.windows || [{ only: Y.map(function (y, p) { return p; }), budgetDual: raw.budgetDual, over: raw.over, reach: raw.reach !== false }];
    R.windowReach = wins.map(function (w) { return w.reach !== false; });
    R.budgetDual = wins.map(function (w) { return w.reach === false ? null : -w.budgetDual; });
    R.windowOf = Y.map(function (y, p) { for (var i = 0; i < wins.length; i++) if (wins[i].only.indexOf(p) >= 0) return i; return null; });
    R.importDual = Y.map(function (y, p) { var i = R.windowOf[p]; return i != null && wins[i].reach === false ? null : raw.per[p].importDual; });
    R.reach = raw.reach !== false;
    // security
    var im = P.imports;
    R.security = Y.map(function (y, p) {
      var f = raw.per[p].fuel, gas = f.gasDom + f.lng, peak = sum(S.loadMW[p]) * Math.max.apply(null, P.S.map(function (s) { return s.demand; }));
      var firmCap = 0, c = R.cap[p]; ["coal", "gasCC", "gasCT", "oil", "nuclear", "hydro", "firm"].forEach(function (t) { firmCap += c[t]; });
      return { importShare: raw.per[p].importShare, strait: f.crudeImp * im.oil.throughStraitShare + f.lng * im.lng.throughStraitShare,
        lngShare: gas > 0 ? f.lng / gas : 0, stockDays: f.crudeImp > 0 ? im.oil.stocksPJ / (f.crudeImp / 365) : null,
        firmMargin: firmCap / peak - 1, peakMW: peak, firmMW: firmCap, batteryGWh: c.battery * P.tech.battery.hours / 1000 };
    });
    // Ridge County: Ridge Station's capacity kept open; the coal mined (all of Prairieland's)
    var rs = P.units.filter(function (u) { return u.id === "rg-ridge"; })[0];
    R.ridge = { station: Y.map(function (y, p) { return raw.k[rs.j][p]; }), coal: Y.map(function (y, p) { return raw.per[p].fuel.coal; }),
      closes: (function () { for (var p = 0; p < Y.length; p++) if (raw.k[rs.j][p] < 1) return p === 0 ? "by 2030" : "between " + Y[p - 1] + " and " + Y[p]; return "after 2050"; })() };
    R.ridge.closeP = (function () { for (var p = 0; p < Y.length; p++) if (raw.k[rs.j][p] < 1) return p; return null; })();
    R.ridge.windSolarMW = R.builtR[P.ri.ridge].wind + R.builtR[P.ri.ridge].solar;
    R.pv = M.pv; R.pvTotal = M.pv.total;
    return R;
  }

  // ---------------------------------------------------------------- the view: every number a page shows, rounded
  // The same object for a live run and a library entry (pages draw only from it; the test compares library entries with
  // fresh runs byte for byte). Units: $M (pv, yearly), Mt CO2, GW, TWh, PJ, shares 0-1, $/MWh, $/t, $/GJ.
  var TECHS = ["coal", "gasCC", "gasCT", "oil", "nuclear", "hydro", "wind", "solar", "battery", "firm"];
  function rd(v, d) { var k = Math.pow(10, d == null ? 1 : d); var x = Math.round(v * k) / k; return x === 0 ? 0 : x; }
  function view(R, P) {
    var Y = R.Y, o = { Y: Y.slice() };
    o.pv = {}; for (var k in R.pv) o.pv[k] = rd(R.pv[k], 0);
    o.yearly = R.money.yearly.map(function (q) { var x = {}; for (var k2 in q) x[k2] = rd(q[k2], 0); return x; });
    o.budget = R.S.budget; o.cum = rd(R.cum, 0); o.over = rd(R.over, 0); o.w = R.S.w.slice(); o.w0 = R.S.w0;
    o.co2 = R.co2.map(function (v) { return rd(v, 1); });
    o.imp = R.importShare.map(function (v) { return rd(v, 3); }); o.cap = R.S.cap; o.capOver = R.capOver.map(function (v) { return rd(v, 1); });
    o.clean = R.clean.map(function (v) { return rd(v, 3); });
    o.unserved = R.unservedTWh.map(function (v) { return rd(v, 2); }); o.curtail = R.curtailTWh.map(function (v) { return rd(v, 1); });
    o.capGW = R.cap.map(function (c) { var x = {}; TECHS.forEach(function (t) { x[t] = rd(c[t] / 1000, 2); }); return x; });
    o.genTWh = R.gen.map(function (g) { var x = {}; TECHS.forEach(function (t) { x[t] = rd(g[t], 1); }); return x; });
    o.genR = Y.map(function (y, p) { return R.raw.per[p].genR.map(function (g) { var x = {}; TECHS.forEach(function (t) { if (g[t]) x[t] = rd(g[t] / 1e6, 1); }); return x; }); });
    o.built = {}; for (var t in R.built) o.built[t] = R.built[t].map(function (v) { return rd(v / 1000, 2); });
    o.builtR = R.builtR.map(function (b) { var x = {}; for (var t2 in b) x[t2] = rd(b[t2] / 1000, 2); return x; });
    o.txAdd = R.txAdd.map(function (v) { return rd(v / 1000, 2); }); o.early = R.early.map(function (v) { return rd(v / 1000, 2); });
    o.linkGW = Y.map(function (y, p) { return P.links.map(function (l) { var c = l.mw; for (var q = 0; q <= p; q++) c += R.raw.a[l.i][q]; return rd(c / 1000, 2); }); });
    o.linkAt = Y.map(function (y, p) { return R.raw.per[p].linkAt.slice(); });
    o.price = R.price.map(function (pr) { return pr.map(function (v) { return v == null ? null : rd(v, 1); }); });
    o.reach = R.reach; o.windowReach = R.windowReach.slice();
    o.carbonValue = R.budgetDual.map(function (v) { return v == null ? null : rd(v, 1); });
    // the budget's value as a price in each model year's own 2025 dollars, from the LP's coefficients: the
    // budget row weighs that year's CO2 by w_p, the goal its yearly costs by D_p, so mu x w_p / D_p
    o.carbonPrice = Y.map(function (y, p) { var i = R.windowOf[p], mu = i == null ? null : R.budgetDual[i]; return mu == null ? null : rd(mu * R.S.w[p] / R.S.D[p], 1); });
    o.D = R.S.D.map(function (v) { return rd(v, 4); });
    o.importValue = R.importDual.map(function (v) { return v == null ? null : rd(v, 2); });
    o.sec = R.security.map(function (x) { return { strait: rd(x.strait, 1), lngShare: rd(x.lngShare, 3), stockDays: x.stockDays == null ? null : rd(x.stockDays, 0), batteryGWh: rd(x.batteryGWh, 1) }; });
    o.rule = R.S.reserve == null ? null : R.S.reserve;          // the peak-hour rule's margin, or null when it is off (not tested)
    o.acc = R.S.acc; o.fs = R.S.fs;
    o.reserve = stressMargins(P, R);
    o.ridge = { station: R.ridge.station.map(function (v) { return rd(v, 0); }), coal: R.ridge.coal.map(function (v) { return rd(v, 1); }), closeP: R.ridge.closeP, windSolarGW: rd(R.ridge.windSolarMW / 1000, 2) };
    o.fuel = R.fuel.map(function (f) { var x = {}; for (var k3 in f) x[k3] = rd(f[k3], 1); return x; });
    o.elTWh = R.S.elPJ.map(function (e) { return rd(sum(e) / 3.6, 1); });
    o.primary = R.raw.per.map(function (q) { return rd(q.primary, 0); });
    o.newLoadTWh = null;
    return o;
  }
  // a shock's view: what changes against the plan
  function shockView(Q, V0, P) {
    var v = view(Q, P);
    return { key: Q.key, year: Q.year, label: Q.label, pv: v.pv.total, dPV: rd(v.pv.total - V0.pv.total, 0), cum: v.cum, over: v.over, co2: v.co2, imp: v.imp, capOver: v.capOver, unserved: v.unserved,
      carbonValue: v.carbonValue, reserveShort: v.reserve.map(function (x) { return x.shortMW; }), clean: v.clean, rule: v.rule, reach: v.reach, keptThrough: Q.keptThrough == null ? null : V0.Y[Q.keptThrough] || null };
  }
  // the reserve rule's spare at the tighter stress hour, nation-wide, each model year (from the plan's capacities, with the
  // same availability as the rule's rows: a drought derates the summer hour), and the shortfall: the nation's at the worse
  // of the two stress hours (regions summed within an hour, never across hours)
  function stressMargins(P, R) {
    var cfg = P.cfg, T = P.tech, S = R.S;
    return R.Y.map(function (y, p) {
      var worst = null, short = 0;
      (cfg.stress || []).forEach(function (H, hi) {
        var sx = P.stressSummer[hi] && S.summerX ? S.summerX[p] : 1, dr = function (t) { return t === "coal" || t === "gasCC" ? sx : 1; };
        var have = 0, load = sum(S.loadMW[p]) * H.demand;
        P.units.forEach(function (u) { have += u.av * dr(u.tech) * R.raw.k[u.j][p]; });
        P.R.forEach(function (Rr, r) {
          have += cfg.existing.availability.nuclear * sx * P.exist("nuclear", r, y) + P.exist("hydro", r, y) * cfg.existing.availability.hydro * (S.hydroX ? S.hydroX[p] : 1);
          have += H.wind[r] * capNow(P, R.raw, "wind", r, p) + H.solar[r] * capNow(P, R.raw, "solar", r, p) + capNow(P, R.raw, "battery", r, p);
          ["gasCC", "gasCT"].forEach(function (t) { have += cfg.existing.availability[t] * dr(t) * newCap(P, R.raw, t, r, p); });
        });
        have += T.firm.availability * sx * capNow(P, R.raw, "firm", 0, p);
        var m = have / load - 1; if (!worst || m < worst.margin) worst = { key: H.key, margin: m };
        var sh = 0; P.R.forEach(function (Rr, r) { sh += (R.raw.per[p].stressShort && R.raw.per[p].stressShort[hi + "_" + r]) || 0; });
        short = Math.max(short, sh);
      });
      return worst ? { key: worst.key, margin: rd(worst.margin, 3), shortMW: rd(short, 0) } : { key: null, margin: null, shortMW: 0 };
    });
  }

  // ---------------------------------------------------------------- near-optimal plans (M13): the optimal face widened
  // faceModel: every row of a solved model, plus "objective <= best + slack" ($M, the whole objective with its penalties and
  // tie costs), minimising or maximising a linear expression (terms: { variable: coefficient }) over it
  function faceModel(m, r, terms, sense, slack) {
    var cost = m.variables.filter(function (v) { return v.cost; }).map(function (v) { return [v.name, v.cost]; });
    var out = { sense: sense, variables: m.variables.map(function (v) { return { name: v.name, lb: v.lb, ub: v.ub, cost: 0 }; }), constraints: m.constraints.concat([{ name: "face", terms: cost, ub: r.objective + slack }]) };
    out.objective = { terms: terms };
    return out;
  }
  // the new capacity of one technology built in one model year, nationally, as terms
  function builtTerms(P, t, q) { var o = {}; if (t === "firm") o["n_firm" + q] = 1; else P.R.forEach(function (R, r) { o["n_" + r + t + q] = 1; }); return o; }
  // plans within a share of the best cost: the lowest and highest of an expression (two more LPs); Promise of { lo, hi }
  function nearRange(P, state, terms, share, o) {
    o = o || {};
    var sol = solverOf(o), S = sysOf(state, P), m = build(P, S), tl = o.timeLimit || P.cfg.solver.timeLimit;
    var one = function (mm) { return new Promise(function (res) { res(sol(mm, { timeLimit: tl, signal: o.signal })); }); };
    return one(m).then(function (r) {
      if (r.status !== "optimal") return { status: r.status, ok: false };
      var slack = Math.abs(r.objective) * share;
      return one(faceModel(m, r, terms, "min", slack)).then(function (a) {
        if (a.status !== "optimal") return { status: a.status, ok: false };
        return one(faceModel(m, r, terms, "max", slack)).then(function (b) {
          if (b.status !== "optimal") return { status: b.status, ok: false };
          var at = 0; for (var k in terms) at += (r.values[k] || 0) * terms[k];
          return { status: "optimal", ok: true, lo: a.objective, hi: b.objective, at: at, slack: slack, objective: r.objective };
        });
      });
    }).then(null, function (e) { return { status: "error", ok: false, message: String(e && e.message || e) }; });
  }

  // ---------------------------------------------------------------- plain tables for the no-JS blocks and the note
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tableHTML(head, rows, cls) {
    return '<div class="lx-scroll-x"><table class="lx-facts' + (cls ? " " + cls : "") + '"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return i ? '<td class="n">' + esc(c) + "</td>" : "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  // a view's main results as rows [label, value]
  function resultRows(V, P) {
    var L = V.Y.length - 1, b = function (t) { return fix(sum(V.built[t]), 1) + " GW"; };
    return [["Cost 2026–2050, present value in 2025 (2025 dollars; supply side and every fuel bought)", bn(V.pv.total)],
      ["CO₂ 2026–2050 against the budget", kilo(V.cum) + " of " + kilo(V.budget) + " Mt" + (V.over > 0.5 ? " (" + kilo(V.over) + " Mt over)" : "")],
      ["CO₂ a year, " + V.Y.join(", "), V.co2.map(function (x) { return fix(x, 0); }).join(", ") + " Mt"],
      ["Imports, share of primary energy, " + V.Y.join(", "), V.imp.map(function (x) { return pct(x); }).join(", ") + " (cap " + pct(V.cap) + ")"],
      ["Clean share of electricity, 2030 and 2050", pct(V.clean[0]) + " and " + pct(V.clean[L])],
      ["Built 2026–2050: wind, solar, gas, batteries, firm clean (generic)", b("wind") + ", " + b("solar") + ", " + fix(sum(V.built.gasCC) + sum(V.built.gasCT), 1) + " GW, " + b("battery") + ", " + b("firm")],
      ["New transmission", fix(sum(V.txAdd), 1) + " GW"],
      ["The budget's marginal value (the LP's dual: what one more tonne allowed would save)", V.carbonValue.map(cvText).join(", ") + (V.carbonValue.some(function (x) { return x != null; }) ? " a tonne, present value in 2025" : "")],
      ["Ridge Station (2,400 MW of coal)", V.ridge.closeP === null ? "open to 2050" : "closed by " + V.Y[V.ridge.closeP]]];
  }
  // a budget's marginal value as text: none when the budget (or the window's share) is out of reach
  function cvText(x) { return x == null ? "none (out of reach)" : "$" + fix(x, 0); }
  function fallbackHTML(V, P, o) {
    o = o || {};
    return tableHTML(["Result: " + (o.label || "the default plan"), "Value"], resultRows(V, P)) +
      '<p class="lx-hint">Precomputed with this engine on ' + esc(o.date) + ": one linear program over 2030–2050 on twelve time slices. " + esc(P.line) + " With JavaScript on, the bench runs your own plan.</p>";
  }
  // the inputs, with what is a published value, what is a published range and what is set for teaching kept apart:
  // the default (its source), the range a learner may set (always set for teaching), and the source's own range
  function inputsHTML(P) {
    var T = P.tech, F = P.fuels, kw = function (v) { return "$" + kilo(v) + "/kW"; }, gj = function (v) { return "$" + fix(v, 2) + "/GJ"; }, rg = function (r, f) { return f(r.lo) + " to " + f(r.hi); };
    var cap = function (t, name, def, src) { var c = T[t]; return [name, kw(c.capex.def) + " (" + def + ")", rg(c.capex, kw), src + ": " + kw(c.source.lo) + " to " + kw(c.source.hi)]; };
    var rows = [cap("wind", "Wind farm, capital", "EIA Table 3", "EIA AEO2026 Table 4, its regions"), cap("solar", "Solar farm, capital", "EIA Table 3", "EIA AEO2026 Table 4, its regions"),
      cap("battery", "Battery (4 hours, 85% round trip), capital", "EIA Table 3", "NREL's 2025 battery update (low) and EIA AEO2026 Table 4 (high)"), cap("gasCC", "Gas combined cycle, capital", "EIA Table 3", "EIA AEO2026 Table 4, its regions"),
      cap("gasCT", "Gas turbine, capital", "EIA Table 3", "EIA AEO2026 Table 4, its regions"), cap("firm", "Generic firm clean plant, capital", "set for teaching", "EIA AEO2026 Table 4, firm low-carbon plants that burn no fuel"),
      ["New transmission", "$" + kilo(P.tx.costPerMWkm.def) + " per MW-km (set for teaching)", rg(P.tx.costPerMWkm, function (v) { return "$" + kilo(v) + " per MW-km"; }), "set for teaching"],
      ["Domestic gas", gj(F.gas.def) + " (EIA, 2025: $" + fix(F.gas.anchor.usdPerMMBtu, 2) + " per MMBtu, on net calorific values)", rg(F.gas, gj), "EIA Electric Power Annual, Table 7.4"], ["LNG imports", gj(F.lng.def) + " (set for teaching)", rg(F.lng, gj), "set for teaching"],
      ["Coal (Ridge County)", gj(F.coal.def) + " (EIA, 2025: $" + fix(F.coal.anchor.usdPerMMBtu, 2) + " per MMBtu, on net calorific values)", rg(F.coal, gj), "EIA Electric Power Annual, Table 7.4"], ["Crude oil", gj(F.oil.def) + " (set for teaching: about $70 a barrel)", rg(F.oil, gj), "set for teaching"],
      ["CO₂ factors: crude oil, gas, coal", P.f.oil + ", " + P.f.gas + ", " + P.f.coal + " t per TJ", "fixed", "IPCC 2006 Guidelines, Volume 2, net calorific values"],
      ["Build limits, a region a period", "wind " + P.lim.gwPerRegionPerPeriod.wind + ", solar " + P.lim.gwPerRegionPerPeriod.solar + ", batteries " + P.lim.gwPerRegionPerPeriod.battery + ", gas " + P.lim.gwPerRegionPerPeriod.gasCC + " + " + P.lim.gwPerRegionPerPeriod.gasCT + ", firm " + P.lim.gwPerRegionPerPeriod.firm + " GW", "fixed", "set for teaching: one generic rule, no technology's own timeline"],
      ["Discount rate (real)", P.PL.periods.discount.def + "% (set for teaching)", rg(P.PL.periods.discount, function (v) { return v + "%"; }), "set for teaching"],
      ["Hourly shapes", "SPP's 2025 grid (slices); 2024 for the independent year", "fixed", "EIA Hourly Electric Grid Monitor (Form EIA-930)"]];
    return tableHTML(["Input (2025 dollars)", "Default", "Range you can set (set for teaching)", "Source, and the source's own range"], rows, "e4-inputs");
  }
  // the plan as rows [label, value] (C4's note); each number at its field's precision (5.5% stays 5.5%)
  function planRows(state, P) {
    var S = schema(P), o = [];
    var num = function (f, v) { var s = String(f.step), d = s.indexOf(".") >= 0 ? s.length - s.indexOf(".") - 1 : 0, t = fix(v, d); return d ? t.replace(/\.?0+$/, "") : t; };
    S.fields.forEach(function (f) { var v = state[f.id]; o.push([f.label, f.type === "enum" ? f.names[v] : f.type === "int" && f.max === 1 ? (v ? "yes" : "no") : (f.unit === "$/GJ" ? "$" + fix(v, 2) + "/GJ" : f.unit === "$/kW" ? "$" + kilo(v) + "/kW" : f.unit === "$/MW-km" ? "$" + kilo(v) + " per MW-km" : num(f, v) + (f.unit === "%" ? "%" : " " + f.unit))]); });
    return o;
  }

  var E4 = { REG: REG, NEW: NEW, FOSSIL: FOSSIL, prepare: prepare, schema: schema, defaults: defaults, withPreset: withPreset, sysOf: sysOf, build: build, crf: crf, dsum: dsum,
    hourly: hourly, stressHours: stressHours, fullYear: fullYear, seasonOfDay: seasonOfDay, newCap: newCap, read: read, capNow: capNow, merge: merge, fixedOf: fixedOf, money: money, windowsOf: windowsOf, runWindows: runWindows, planRun: planRun, shockRun: shockRun, solve: solve, shockTest: shockTest, c4Shocks: c4Shocks, presetsOf: presetsOf, summarize: summarize, faceModel: faceModel, builtTerms: builtTerms, nearRange: nearRange, resultRows: resultRows, fallbackHTML: fallbackHTML, inputsHTML: inputsHTML, tableHTML: tableHTML, planRows: planRows, esc: esc, view: view, shockView: shockView, stressMargins: stressMargins, TECHS: TECHS, rd: rd, WORDS: WORDS,
    GAP: GAP, solveWindow: solveWindow, LIM_TOL: LIM_TOL, keptThrough: keptThrough, doneWords: doneWords, fullVerdict: fullVerdict, FULL_TOL: FULL_TOL, shockTable: shockTable, cvText: cvText,
    kilo: kilo, fix: fix, pct: pct, bn: bn, copy: copy, sum: sum, PJ_PER_MWH: PJ_PER_MWH, MWH_PER_PJ: MWH_PER_PJ };
  if (typeof module !== "undefined" && module.exports) module.exports = E4;
  if (typeof window === "undefined" || !window.LX) return;
  window.LX.E4 = E4;

  // ---------------------------------------------------------------- view kit, shared by SB4, M13 and C4 (LX.E4.ui)
  var LX = window.LX, H = LX.H;
  var COL = { coal: "var(--lx-ink-3)", gasCC: "var(--lx-cc)", gasCT: "var(--lx-pk)", oil: "var(--lx-geo)", nuclear: "var(--lx-nuc)", hydro: "var(--lx-hyd)",
    wind: "var(--lx-wind)", solar: "var(--lx-solar)", battery: "var(--lx-bat)", firm: "var(--lx-tier-5)" };
  var NAME = { coal: "Coal", gasCC: "Gas combined cycle", gasCT: "Gas turbines", oil: "Oil-fired", nuclear: "Existing nuclear", hydro: "Hydro", wind: "Wind", solar: "Solar",
    battery: "Batteries (4 h)", firm: "Firm clean (generic)" };
  function fmtOf(f) {
    var u = f.unit;
    if (u === "%") return function (v) { return v + "%"; };
    if (u === "$/kW") return function (v) { return "$" + kilo(v) + "/kW"; };
    if (u === "$/MW-km") return function (v) { return "$" + kilo(v) + " per MW-km"; };
    if (u === "$/GJ") return function (v) { return "$" + fix(v, 2) + "/GJ"; };
    if (u === "Mt") return function (v) { return kilo(v) + " Mt"; };
    if (u === "") return function (v) { return v ? "Yes" : "No"; };
    return function (v) { return kilo(v) + " " + u; };
  }
  function seg(host, label, values, names, value, onPick) {
    var el = H("div", { class: "lx-seg e4-seg", role: "group", "aria-label": label }, host), bs = {};
    values.forEach(function (v) {
      var b = H("button", { type: "button", text: names[v], "aria-pressed": v === value ? "true" : "false" }, el);
      b.addEventListener("click", function () { set(v); onPick(v); });
      bs[v] = b;
    });
    function set(v) { values.forEach(function (x) { bs[x].setAttribute("aria-pressed", x === v ? "true" : "false"); }); }
    return { el: el, set: set, buttons: bs };
  }
  // controls from a schema, in groups [{ title, hint, color, fields }]; hints: { id: function (val) -> text }
  function controls(host, S, plan, groups, onChange, hints) {
    var ctl = {};
    hints = hints || {};
    groups.forEach(function (g) {
      var par = host;
      if (g.fold) { var dt = H("details", { class: "e4-fold" }, host); H("summary", { text: g.fold }, dt); par = dt; }
      var fs = H("fieldset", { class: "lx-sb-group" }, par);
      H("legend", { text: g.title }, fs);
      if (g.hint) H("p", { class: "lx-hint e4-ghint", html: LX.rich(g.hint) }, fs);
      g.fields.forEach(function (id) {
        var f = S.fields.filter(function (x) { return x.id === id; })[0];
        if (!f) return;
        if (f.type === "enum" || (f.type === "int" && f.max === 1 && f.min === 0)) {
          var vals = f.type === "enum" ? f.values : [1, 0], names = f.type === "enum" ? f.names : { 1: "Yes", 0: "No" };
          var row = H("div", { class: "e4-segrow" }, fs);
          H("span", { class: "e4-segl", text: f.label }, row);
          ctl[id] = seg(row, f.label, vals, names, plan[id], function (v) { var p = copy(plan); p[id] = v; onChange(p); });
        } else {
          ctl[id] = LX.Slider(fs, { label: f.label, color: g.color || "var(--lx-ink-2)", min: f.min, max: f.max, step: f.step, value: plan[id], fmt: fmtOf(f),
            hint: hints[id] ? function (lo, hi, mx, v) { return hints[id](v); } : null,
            onChange: function (v) { var p = copy(plan); p[id] = v; onChange(p); } });
        }
      });
      if (g.extra) g.extra(fs);         // a group's own note or table after its controls (SB4's shock table)
    });
    return { ctl: ctl, set: function (p) { plan = p; for (var k in ctl) ctl[k].set(p[k]); } };
  }
  function stopper() {
    var b = null, run = null;
    return { busy: function (on) { if (b) b.hidden = !on; },
      attach: function (r) { run = r; b = H("button", { class: "lx-btn ghost small e4-stop", type: "button", text: "Stop", hidden: true });
        r.button.parentNode.insertBefore(b, r.again);
        b.addEventListener("click", function () { if (!run.running()) return; run.cancel(); run.button.focus(); }); return b; } };
  }
  function table(host, head, rows, cls) {
    var sx = H("div", { class: "lx-scroll-x" }, host), tb = H("table", { class: "lx-facts e4-tab " + (cls || "") }, sx), hr = H("tr", null, H("thead", null, tb)), bd = H("tbody", null, tb);
    head.forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
    rows.forEach(function (r) { var tr = H("tr", r.cls ? { class: r.cls } : null, bd); (r.cells || r).forEach(function (c, i) { var cell = H(i ? "td" : "th", i ? { class: "n", "data-l": head[i] } : { scope: "row" }, tr); cell.textContent = c; }); });
    return tb;
  }
  function keys(host, items) { var el = H("div", { class: "e4-keys" }, host); items.forEach(function (x) { H("p", { html: "<b>" + x[0] + ":</b> " + LX.rich(x[1]) }, el); }); return el; }
  // a year picker (the five model years)
  function yearPick(host, Y, p, onPick) { var names = {}; Y.forEach(function (y, i) { names[i] = String(y); }); return seg(host, "Model year", Y.map(function (y, i) { return i; }), names, p, onPick); }

  // the nation as a schematic map: five regions, the seven links (width by transfer limit), the strait, Ridge County
  var POS = { highlands: [480, 72], ridge: [268, 122], plains: [92, 226], capital: [470, 262], coast: [282, 356] };
  var LINKT = { "plains-capital": 0.3, "ridge-coast": 0.62, "highlands-capital": 0.5, "ridge-capital": 0.5, "capital-coast": 0.5, "highlands-ridge": 0.5, "plains-ridge": 0.5 };
  function Map(host, P, o) {
    o = o || {};
    var el = H("div", { class: "e4-map" }, host), top = H("div", { class: "e4-map-top" }, el), p = o.p == null ? P.Y.length - 1 : o.p, V = null;
    var yp = yearPick(top, P.Y, p, function (i) { p = i; draw(); });
    var svgWrap = H("div", { class: "e4-map-svg" }, el), say = H("p", { class: "e4-map-say", "aria-live": "polite" }, el);
    var alt = H("details", { class: "lx-textalt" }, el); H("summary", { text: "Text version of the map" }, alt); var altBody = H("div", null, alt);
    function draw() {
      if (!V) return;
      var NS = "http://www.w3.org/2000/svg", y = P.Y[p];
      var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 640 470"); svg.setAttribute("class", "e4-svg"); svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Prairieland's five regions and seven links in " + y + ": each region's mix of electricity and the transfer limit of each link (details in the text version).");
      var mk = function (tag, at, par) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); (par || svg).appendChild(e); return e; };
      // sea and the strait
      mk("path", { d: "M0 448 Q160 432 320 446 T640 436 L640 470 L0 470 Z", class: "e4-sea" });
      var st = mk("g", { class: "e4-strait" }); mk("path", { d: "M628 462 L520 446 L352 386", class: "e4-route" }, st);
      var tx = mk("text", { x: 632, y: 430, "text-anchor": "end", class: "e4-mlab small e4-halo" }, st); tx.textContent = "oil and LNG through the strait";
      // links
      P.links.forEach(function (l, i) {
        var a = POS[P.R[l.a].key], b = POS[P.R[l.b].key], gw = V.linkGW[p][i], at = V.linkAt[p][i];
        mk("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "e4-link" + (at > 2000 ? " hot" : ""), "stroke-width": Math.max(1.5, gw * 1.1) });
        var f = LINKT[l.key] == null ? 0.5 : LINKT[l.key], mx = a[0] + (b[0] - a[0]) * f, my = a[1] + (b[1] - a[1]) * f;
        var t = mk("text", { x: mx, y: my + 4, "text-anchor": "middle", class: "e4-mlab small e4-halo" }); t.textContent = fix(gw, 1) + " GW";
      });
      // regions: a disc whose ring shows the year's generation mix, the name, the marginal cost
      P.R.forEach(function (R, r) {
        var c = POS[R.key], g = mixOf(V, P, r, p), tot = sum(g.map(function (x) { return x[1]; })), a0 = -Math.PI / 2, rad = 34;
        mk("circle", { cx: c[0], cy: c[1], r: rad + 6, class: "e4-node" });
        g.forEach(function (x) {
          if (!(x[1] > 0)) return; var a1 = a0 + 2 * Math.PI * x[1] / tot, big = a1 - a0 > Math.PI ? 1 : 0;
          var d = "M" + c[0] + " " + c[1] + " L" + (c[0] + rad * Math.cos(a0)) + " " + (c[1] + rad * Math.sin(a0)) + " A" + rad + " " + rad + " 0 " + big + " 1 " + (c[0] + rad * Math.cos(a1)) + " " + (c[1] + rad * Math.sin(a1)) + " Z";
          if (x[1] / tot > 0.9999) mk("circle", { cx: c[0], cy: c[1], r: rad, fill: COL[x[0]] }); else mk("path", { d: d, fill: COL[x[0]] });
          a0 = a1;
        });
        var t1 = mk("text", { x: c[0], y: c[1] + rad + 22, "text-anchor": "middle", class: "e4-mlab e4-halo" }); t1.textContent = R.name;
        var pr = V.price[p][r], t2 = mk("text", { x: c[0], y: c[1] + rad + 38, "text-anchor": "middle", class: "e4-mlab small e4-halo" }); t2.textContent = pr == null ? "" : "about $" + Math.round(pr) + "/MWh";
      });
      var rc = POS.ridge, rcm = mk("g", { class: "e4-rc" }); mk("rect", { x: rc[0] - 62, y: rc[1] - 70, width: 124, height: 20, rx: 10, class: "e4-rc-box" }, rcm);
      var t3 = mk("text", { x: rc[0], y: rc[1] - 56, "text-anchor": "middle", class: "e4-mlab small" }, rcm); t3.textContent = "Ridge County: coal";
      svgWrap.innerHTML = ""; svgWrap.appendChild(svg);
      say.textContent = y + ": " + P.R.map(function (R, r) { var g = mixOf(V, P, r, p), t = sum(g.map(function (x) { return x[1]; })), b = g.slice().sort(function (u, w) { return w[1] - u[1]; })[0]; return R.short + " mostly " + NAME[b[0]].toLowerCase() + " (" + pct(b[1] / t) + ")"; }).join("; ") + ".";
      altBody.innerHTML = "";
      // every wedge of every disc (not only the largest source)
      table(altBody, ["Region, " + y, "Electricity made", "By source (TWh, share)", "Marginal cost (LP)"], P.R.map(function (R, r) { var g = mixOf(V, P, r, p), t = sum(g.map(function (x) { return x[1]; }));
        var mix = g.filter(function (x) { return x[1] > 0; }).sort(function (u, w) { return w[1] - u[1]; }).map(function (x) { return NAME[x[0]] + " " + fix(x[1], 1) + " (" + pct(x[1] / t) + ")"; }).join("; ");
        return [R.name, fix(t, 1) + " TWh", mix || "none", V.price[p][r] == null ? "–" : "about $" + Math.round(V.price[p][r]) + "/MWh"]; }), "e4-wrap");
      table(altBody, ["Link, " + y, "Transfer limit", "Hours a year at the limit (slices)"], P.links.map(function (l, i) { return [P.R[l.a].short + " – " + P.R[l.b].short, fix(V.linkGW[p][i], 1) + " GW", kilo(V.linkAt[p][i])]; }));
    }
    return { el: el, set: function (v, pp) { V = v; if (pp != null) { p = pp; yp.set(p); } draw(); } };
  }
  // a region's generation by technology in model year p (TWh): from the view's genR when present, else the nation's mix
  function mixOf(V, P, r, p) { var g = V.genR ? V.genR[p][r] : null; return TECHS.map(function (t) { return [t, g ? (g[t] || 0) : 0]; }); }

  // capacity (GW) or generation (TWh) by technology, stacked, the five model years
  function MixChart(host, P, o) {
    o = o || {};
    var el = H("div", { class: "e4-mix" }, host), top = H("div", { class: "e4-map-top" }, el), mode = o.mode || "cap", V = null;
    var sg = seg(top, "Show", ["cap", "gen"], { cap: "Capacity (GW)", gen: "Electricity (TWh)" }, mode, function (m) { mode = m; draw(); });
    var pl = LX.Plot(el, { caption: true, box: true, text: "Text version of the chart" });
    var leg = H("div", { class: "e4-legend" }, el);
    TECHS.forEach(function (t) { var i = H("span", { class: "e4-key" }, leg); H("i", { style: "background:" + COL[t] }, i); H("span", { text: NAME[t] }, i); });
    function draw() {
      if (!V) return;
      var src = mode === "cap" ? V.capGW : V.genTWh, bars = [], top = 0;
      src.forEach(function (c, p) { var y0 = 0; TECHS.forEach(function (t) { var v = c[t] || 0; if (v > 0) { bars.push({ x0: p + 0.18, x1: p + 0.82, y0: y0, y1: y0 + v, color: COL[t], op: 0.95 }); y0 += v; } }); top = Math.max(top, y0); });
      var step = mode === "cap" ? (top > 160 ? 50 : 25) : (top > 400 ? 100 : 50), ymax = Math.ceil(top / step) * step;
      pl.render({ x: { min: 0, max: P.Y.length, ticks: P.Y.map(function (y, i) { return [i + 0.5, String(y)]; }) },
        y: { min: 0, max: ymax, step: step, fmt: function (v) { return kilo(v); }, unit: mode === "cap" ? "GW" : "TWh" }, bars: bars, height: 260, heightN: 240,
        aria: (mode === "cap" ? "Capacity open" : "Electricity made") + " by technology in each model year, stacked.",
        text: { head: ["Technology"].concat(P.Y.map(String)), rows: TECHS.map(function (t) { return [NAME[t]].concat(src.map(function (c) { return fix(c[t] || 0, 1); })); }) } }, true);
    }
    return { el: el, set: function (v) { V = v; draw(); }, mode: function (m) { mode = m; sg.set(m); draw(); } };
  }
  // CO2 a year: the plan, and a shocked or compared run dashed; 2025's level as the start
  function Co2Chart(host, P) {
    var el = H("div", { class: "e4-co2" }, host), pl = LX.Plot(el, { caption: true, box: true, text: "Text version of the chart" });
    return { el: el, set: function (V, other, otherLabel) {
      var xs = [2025].concat(V.Y), base = P.carbon.base2025Mt, line = [base].concat(V.co2), lines = [{ pts: xs.map(function (x, i) { return [x, line[i]]; }), color: "var(--lx-cc)", width: 2.5, dots: true }];
      if (other) lines.push({ pts: xs.map(function (x, i) { return [x, i ? other.co2[i - 1] : base]; }), color: "var(--lx-ink-2)", dash: "5 4", width: 2 });
      var head = ["Year", "Plan"]; if (other) head.push(otherLabel || "Compared");
      pl.render({ x: { min: 2025, max: 2050, ticks: xs.map(function (x) { return [x, String(x)]; }) }, y: { min: 0, max: 250, step: 50, fmt: function (v) { return kilo(v); }, unit: "Mt CO₂ a year" },
        lines: lines, legend: other ? [{ label: "Plan", color: "var(--lx-cc)" }, { label: otherLabel || "Compared", color: "var(--lx-ink-2)", dash: "5 4" }] : null, height: 230, heightN: 220,
        aria: "CO₂ a year from 2025 to 2050 (model years).", text: { head: head, rows: xs.map(function (x, i) { var r = [String(x), fix(line[i], 1) + " Mt"]; if (other) r.push(fix(i ? other.co2[i - 1] : base, 1) + " Mt"); return r; }) } }, true);
    } };
  }
  // import share of primary energy against the cap
  function ImportChart(host, P) {
    var el = H("div", { class: "e4-imp" }, host), pl = LX.Plot(el, { caption: true, box: true, text: "Text version of the chart" });
    return { el: el, set: function (V, other, otherLabel) {
      var xs = [2025].concat(V.Y), d0 = P.imports.dependence.share, line = [d0].concat(V.imp);
      var lines = [{ pts: xs.map(function (x, i) { return [x, 100 * line[i]]; }), color: "var(--lx-accent)", width: 2.5, dots: true }];
      if (other) lines.push({ pts: xs.map(function (x, i) { return [x, 100 * (i ? other.imp[i - 1] : d0)]; }), color: "var(--lx-ink-2)", dash: "5 4", width: 2 });
      pl.render({ x: { min: 2025, max: 2050, ticks: xs.map(function (x) { return [x, String(x)]; }) }, y: { min: 0, max: 60, step: 10, fmt: function (v) { return v + "%"; }, unit: "imports, % of primary energy" },
        lines: lines, refs: [{ y: 100 * V.cap, label: "Cap " + pct(V.cap), dash: "5 4" }], height: 220, heightN: 210, legend: other ? [{ label: "Plan", color: "var(--lx-accent)" }, { label: otherLabel || "Compared", color: "var(--lx-ink-2)", dash: "5 4" }] : null,
        aria: "Imports as a share of primary energy, 2025 to 2050, against the cap.",
        text: { head: ["Year", "Plan"].concat(other ? [otherLabel || "Compared"] : []), rows: xs.map(function (x, i) { var r = [String(x), pct(line[i], 1)]; if (other) r.push(pct(i ? other.imp[i - 1] : d0, 1)); return r; }) } }, true);
    } };
  }
  // the readouts beside the bench: [label, value, tone]
  // the readouts; an absent rule is "not tested", never "served", and a shortfall is the worst model
  // year's at its worse stress hour
  function ruleOn(V) { return !("rule" in V) || V.rule !== null; }
  function readouts(V) {
    var maxImp = Math.max.apply(null, V.imp), un = sum(V.unserved), short = Math.max.apply(null, V.reserve.map(function (x) { return x.shortMW; }).concat([0]));
    return [["Cost to 2050 (present value)", bn(V.pv.total), ""],
      ["CO₂ 2026–2050", kilo(V.cum) + " of " + kilo(V.budget) + " Mt", V.over > 0.5 ? "bad" : "good"],
      ["Imports, highest year", pct(maxImp) + " (cap " + pct(V.cap) + ")", maxImp > V.cap + 0.0005 ? "bad" : "good"],
      ["Clean electricity, 2050", pct(V.clean[V.clean.length - 1]), ""],
      un > 0.005 ? ["Electricity not served in the slices", fix(un, 2) + " TWh", "bad"] : !ruleOn(V) ? ["Slices served; stress hours", "not tested (rule off)", "warn"]
        : short > 0.5 ? ["Short at a stress hour (worst year)", kilo(short) + " MW", "warn"] : ["Every slice and stress hour served", "yes", "good"]];
  }
  E4.ui = { COL: COL, NAME: NAME, POS: POS, fmtOf: fmtOf, seg: seg, controls: controls, stopper: stopper, table: table, keys: keys, yearPick: yearPick, Map: Map, MixChart: MixChart,
    Co2Chart: Co2Chart, ImportChart: ImportChart, readouts: readouts, mixOf: mixOf, ruleOn: ruleOn };
})();
