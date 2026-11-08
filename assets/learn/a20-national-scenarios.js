// a20-national-scenarios.js — Lesson A20, "Why do national energy scenarios disagree?" (step cards, Analyst, D3).
//
// Data: assets/learn/data/prairieland.json (Prairieland's balance, fleet, demand cases, cost and fuel ranges, carbon factors,
// the budget and its accounting; read, never retyped), assets/learn/data/a20-national-scenarios.json (the four scenarios,
// the screening accounting's settings, the gap tracer's groups and outputs, the sort and the real-world families) and
// path.json.
//
// Model (closed form, no optimization; a screening accounting in the family of scenario-accounting tools):
//   useful energy U_s(t) = U_s(2025) x (1 + g_s)^(t - 2025)  (the demand case's rates)
//   electric share e_s(t) = min(cap_s, b_s + pace x k), k = (t - 2025) / 5; agriculture keeps its 2025 share
//   final electricity = U_s [b_s / eff_el + (e_s - b_s) / ratio_s]; fossil fuels scale with U_s (1 - e_s), carrier shares of 2025
//   electricity made G = (final electricity + new large loads) / (1 - grid losses)
//   existing plants run as in 2025 until their retirement year; from 2030 an existing coal or combined-cycle plant closes
//     early when its fuel and carbon cost per MWh is above the clean mix's full cost; if the plants left make more than G,
//     the fossil ones run less
//   the rest is new: a share s of it from the clean mix, 1 - s from new gas combined cycles, with
//     s = clamp(0.5 + (C_gas - C_clean) / (2 W), 0, 1)    (W = the rule's half-width, $/MWh)
//     C_clean = wind, solar and firm-plant full costs weighted by the mix, plus batteries beside the solar
//     C_gas = capital and fixed O&M at the rule's capacity factor + variable O&M + fuel (domestic gas and LNG blended by
//             2025's supply) + the carbon price x CO2 per MWh
//     full cost of a plant = (capital x CRF(r, life) + fixed O&M) / (capacity factor x 8.76) + variable O&M, at the default
//     discount rate; capital costs are fixed values inside Prairieland's ranges, the same in every year (no cost changes with how much is built)
//   fuels: crude = oil products / (1 - refinery losses) + oil burned in plants; gas = (final + plants) / (1 - own use);
//     coal = (final + plants) x 2025's ratio of coal mined to coal used; imports = use above 2025's domestic output
//     (domestic supply meets demand up to its 2025 output; below it, domestic production falls: no exports)
//   CO2 = fuels x IPCC 2006 factors (net calorific values); cumulative 2026-2050 = Prairieland's linear weights x model years
//   target-seeking: the lowest whole-dollar carbon price from $0 to $300 a tonne that keeps the cumulative CO2 within the
//     budget (bisection; cumulative CO2 never rises with the price, tested); none when even $300 does not. It is the
//     lowest tested price under the sharing rule, not a constraint's dual value (there is no optimization here)
//   why engine E4 (M13, SB4) does not reach Prairieland's default budget, which this accounting meets (step 7's
//     collapsed card and the no-JS block): E4's floor (its least cumulative CO2 at central demand and the most
//     electrification) is about 2,700 Mt, recomputed by this page's test; E4 raises each sector's share in a straight line
//     to its 2050 value, while here each sector electrifies early, up to the most a period allows. M13 reports that with
//     this page's path inside E4 the floor falls to about 2,400 Mt: a reported comparison, not a cause isolated here.
//   gap tracing: swap a group of assumptions (demand, fuel prices, policy, technology costs) from scenario B into A; alone
//     (one at a time), in an order (a waterfall), or averaged over all 24 orders (each group's average contribution)
// Every number on the page comes from this model or the two data files; _tests/learn/test_a20-national-scenarios.js checks
// them over every input.
//
// Shared components: LX.StepCards, LX.Predict, LX.Plot, LX.Ledger, LX.CardSort, LX.Slider, LX.Toggle, LX.CompareTable,
// LX.CausalChain, LX.Flowchart, LX.Boundary, LX.lessonRefHTML. Lesson-local: the segmented pickers.
(function () {
  "use strict";
  var KEY = "a20_national_scenarios";
  var SECT = ["industry", "buildings", "transport", "agriculture"];
  var FUEL_OF = { coal: "coal", gasCC: "gas", gasCT: "gas", oil: "oil" };
  var CLEAN_TECH = ["wind", "solar", "battery", "firm"];
  var GROUPS = ["demand", "fuel", "policy", "costs"];

  // ---------------------------------------------------------------- the pure model (no DOM; exported for Node)
  function crf(r, n) { return r / (1 - Math.pow(1 + r, -n)); }
  function prepare(PL, D) {
    var B = PL.balance, EFF = B.useful.efficiency, sect = {};
    SECT.forEach(function (s) {
      var f = B.final[s], U = 0, Uel = 0, fos = {};
      Object.keys(f).forEach(function (c) { var u = f[c] * EFF[s][c]; U += u; if (c === "el") Uel += u; else fos[c] = f[c]; });
      var E = PL.demand.electrification[s] || null;
      sect[s] = { U: U, b: Uel / U, fos: fos, elEff: EFF[s].el, ratio: E ? E.ratio : null, cap: E ? (E.maxShare2050 != null ? E.maxShare2050 : 1) : null };
    });
    function cfOf(kind) { var w = 0, s = 0; PL.regions.forEach(function (r) { w += r.resources[kind + "MaxGW"]; s += r.resources[kind + "MaxGW"] * r.resources[kind + "CF"]; }); return s / w; }
    var T = B.transformation, coalUse25 = B.final.industry.coal + T.power.in.coal, gasPrim = B.primary.gas.lng + B.primary.gas.domestic;
    return {
      PL: PL, D: D, sect: sect, years: [PL.periods.base].concat(PL.periods.years), base: PL.periods.base, step: PL.periods.yearsEach,
      cfWind: cfOf("wind"), cfSolar: cfOf("solar"), gridLoss: T.grid.lossShare, refLoss: T.refinery.lossShare,
      gasOwn: T.ownUse.gas / gasPrim, coalOwnX: B.primary.coal / coalUse25,
      oilDom: B.primary.oil.domestic, gasDom: B.primary.gas.domestic, gasLNG: B.primary.gas.lng,
      units: PL.fleet.units.filter(function (u) { return u.gen2025GWh > 0; }),
      weights: PL.carbon.accounting.linearWeights, F: PL.carbon.factors.tPerTJ, r: PL.periods.discount.def / 100,
      maxPace: PL.demand.electrification.maxSharePerPeriod, budget: PL.carbon.budget
    };
  }
  function scOf(P, key) { return P.D.scenarios.filter(function (s) { return s.key === key; })[0]; }
  function paceOf(P, elec) { var E = P.D.elec[elec]; return E.perPeriod === "max" ? P.maxPace : E.perPeriod; }
  // a scenario's assumptions as numbers
  function inputs(P, sc) {
    var C = P.PL.costs, X = { key: sc.key, demand: sc.demand, gas: C.fuels.gas[sc.fuel.gas], lng: C.fuels.lng[sc.fuel.lng], price: sc.policy.price,
      pace: paceOf(P, sc.policy.elec), elec: sc.policy.elec, capex: {}, lv: { fuel: sc.fuel, costs: sc.costs } };
    CLEAN_TECH.forEach(function (k) { X.capex[k] = C.technologies[k].capex[sc.costs[k]]; });
    return X;
  }
  // a slider step for a fuel range that keeps its default on the slider's grid (the data's step, halved until it does),
  // so step 4 shows the price it computes with
  function gridStep(r) { var st = r.step; while (Math.abs(Math.round((r.def - r.lo) / st) * st - (r.def - r.lo)) > 1e-9 && st > 1e-6) st /= 2; return st; }
  function blend(P, X) { return (P.gasDom * X.gas + P.gasLNG * X.lng) / (P.gasDom + P.gasLNG); }
  // full costs per MWh of the clean mix and of a new gas combined cycle at a carbon price; the clean share of new power
  function costs(P, X, price) {
    var T = P.PL.costs.technologies, R = P.D.rule, r = P.r;
    function lc(k, cf, capex) { var c = T[k]; return ((capex == null ? c.capex.def : capex) * crf(r, c.life) + c.fom) / (cf * 8.76) + c.vom; }
    var w = lc("wind", P.cfWind, X.capex.wind), s = lc("solar", P.cfSolar, X.capex.solar), f = lc("firm", T.firm.availability, X.capex.firm);
    var bt = T.battery, batYear = X.capex.battery * crf(r, bt.life) + bt.fom, bat = R.batteryPerSolar * R.mix.solar / (P.cfSolar * 8.76) * batYear;
    var clean = R.mix.wind * w + R.mix.solar * s + R.mix.firm * f + bat;
    var hr = 3.6 / T.gasCC.efficiency, gb = blend(P, X), tPer = hr * P.F.gas / 1000;
    var gasCap = lc("gasCC", R.gasCF), gasFuel = hr * gb, gasCO2 = price * tPer, gas = gasCap + gasFuel + gasCO2;
    var share = Math.max(0, Math.min(1, 0.5 + (gas - clean) / (2 * R.halfWidth)));
    return { wind: w, solar: s, firm: f, battery: bat, clean: clean, gasCap: gasCap, gasFuel: gasFuel, gasCO2: gasCO2, gas: gas, gap: gas - clean, share: share, blend: gb, tPerMWh: tPer, heatRate: hr };
  }
  function demandCase(P, key) { return P.PL.demand.scenarios.filter(function (d) { return d.key === key; })[0]; }
  function newLoads(P, dem, t) {
    var pts = [[P.base, 0]].concat(Object.keys(dem.newLoadsTWh).map(function (y) { return [+y, dem.newLoadsTWh[y]]; })).sort(function (a, b) { return a[0] - b[0]; });
    for (var i = 1; i < pts.length; i++) if (t <= pts[i][0]) return pts[i - 1][1] + (t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]) * (pts[i][1] - pts[i - 1][1]);
    return pts[pts.length - 1][1];
  }
  // one model year (2025 is the observed year: no new plants, no carbon price)
  function year(P, X, t, C) {
    var PL = P.PL, dem = demandCase(P, X.demand), k = (t - P.base) / P.step, isBase = t === P.base;
    var finEl = 0, fos = { oil: 0, gas: 0, coal: 0 }, useful = 0, share = {};
    SECT.forEach(function (s) {
      var b = P.sect[s], U = b.U * Math.pow(1 + dem.growth[s] / 100, t - P.base), e = b.b;
      if (b.ratio != null && !isBase) e = Math.max(b.b, Math.min(b.cap, b.b + X.pace * k));
      share[s] = e; useful += U;
      finEl += U * (b.b / b.elEff + (b.ratio != null ? (e - b.b) / b.ratio : 0));
      var x = U * (1 - e) / (b.U * (1 - b.b));
      Object.keys(b.fos).forEach(function (c) { fos[c] += b.fos[c] * x; });
    });
    var loads = newLoads(P, dem, t), G = (finEl / 3.6 + loads) / (1 - P.gridLoss);
    var price = isBase ? 0 : X.price, exClean = 0, exFos = 0, pf = { oil: 0, gas: 0, coal: 0 }, closed = [];
    P.units.forEach(function (u) {
      if (u.retire < t) return;
      var fuel = FUEL_OF[u.tech];
      if (!fuel) { exClean += u.gen2025GWh / 1000; return; }
      if (!isBase && P.D.rule.earlyClose.indexOf(u.tech) >= 0) {
        var fp = fuel === "gas" ? C.blend : PL.costs.fuels[fuel].def, g = 3.6 / u.efficiency * (fp + price * P.F[fuel] / 1000);
        if (g > C.clean) { closed.push(u.id); return; }
      }
      exFos += u.gen2025GWh / 1000; pf[fuel] += u.fuel2025PJ;
    });
    var f = 1;
    if (!isBase && exFos + exClean > G) f = Math.max(0, (G - exClean) / exFos);
    Object.keys(pf).forEach(function (c) { pf[c] *= f; });
    var exCleanUsed = Math.min(exClean, G), resid = isBase ? 0 : Math.max(0, G - exClean - exFos * f), s = isBase ? 0 : C.share;
    var newClean = s * resid, newGas = (1 - s) * resid;
    pf.gas += newGas * 3.6 / PL.costs.technologies.gasCC.efficiency;
    var crude = fos.oil / (1 - P.refLoss) + pf.oil, gasP = (fos.gas + pf.gas) / (1 - P.gasOwn), coalP = (fos.coal + pf.coal) * P.coalOwnX;
    var co2 = (crude * P.F.oil + gasP * P.F.gas + coalP * P.F.coal) / 1000;
    var oilImp = Math.max(0, crude - P.oilDom), lng = Math.max(0, gasP - P.gasDom);
    return { t: t, useful: useful, elShare: share, finEl: finEl, loads: loads, G: G, exClean: exCleanUsed, exFos: exFos * f, resid: resid, newClean: newClean, newGas: newGas,
      crude: crude, gasP: gasP, coalP: coalP, co2: co2, oilImp: oilImp, lng: lng, imp: oilImp + lng, closed: closed, cleanShare: (exCleanUsed + newClean) / G };
  }
  function run(P, X) {
    var C = costs(P, X, X.price), Y = {};
    P.years.forEach(function (t) { Y[t] = year(P, X, t, C); });
    var cum = Object.keys(P.weights).reduce(function (a, y) { return a + P.weights[y] * Y[y].co2; }, 0), last = Y[P.years[P.years.length - 1]];
    return { X: X, C: C, Y: Y, cum: cum, last: last, out: { co2: last.co2, el: last.G, imp: last.imp, cum: cum, share: last.cleanShare } };
  }
  // target-seeking: the lowest whole-dollar price from 0 to priceMax that keeps the cumulative CO2 within the budget
  function solvePrice(P, X, budget) {
    var R = P.D.rule, at = function (p) { return run(P, Object.assign({}, X, { price: p })); };
    var hi = at(R.priceMax);
    if (hi.cum > budget + 1e-9) return { ok: false, price: null, floor: hi.cum, run: hi };
    var z = at(0); if (z.cum <= budget + 1e-9) return { ok: true, price: 0, run: z };
    var lo = 0, up = R.priceMax;   // cum(lo) > budget >= cum(up)
    while (up - lo > R.priceStep) { var mid = lo + Math.floor((up - lo) / R.priceStep / 2) * R.priceStep, m = at(mid); if (m.cum <= budget + 1e-9) up = mid; else lo = mid; }
    return { ok: true, price: up, run: at(up) };
  }
  function budgetOf(P, sc) { var b = sc.policy.target.budget; return b === "def" ? P.budget.def : b; }
  // a scenario, resolved (a target-seeking one with its price found); opts: { budget, X } to change its target or inputs
  function scenario(P, key, opts) {
    opts = opts || {};
    var sc = scOf(P, key), X = opts.X || inputs(P, sc);
    if (sc.kind === "target") {
      var Bd = opts.budget == null ? budgetOf(P, sc) : opts.budget, sol = solvePrice(P, X, Bd);
      var r = sol.run; r.X = Object.assign({}, X, { price: sol.ok ? sol.price : P.D.rule.priceMax });
      r.sc = sc; r.target = { budget: Bd, ok: sol.ok, price: sol.price, floor: sol.floor }; return r;
    }
    var q = run(P, X); q.sc = sc; return q;
  }
  // swap the groups in `which` from B's inputs into A's
  function mix(XA, XB, which) {
    var X = JSON.parse(JSON.stringify(XA));
    which.forEach(function (g) {
      if (g === "demand") X.demand = XB.demand;
      if (g === "fuel") { X.gas = XB.gas; X.lng = XB.lng; X.lv.fuel = XB.lv.fuel; }
      if (g === "policy") { X.price = XB.price; X.pace = XB.pace; X.elec = XB.elec; }
      if (g === "costs") { X.capex = JSON.parse(JSON.stringify(XB.capex)); X.lv.costs = XB.lv.costs; }
    });
    return X;
  }
  // the Budget pathway's inputs with step 7's two toggles (Gas boom's cheap gas and LNG; the pace of electrification)
  function budgetInputs(P, cheap, pace) {
    var x = inputs(P, scOf(P, "budget")), gb = inputs(P, scOf(P, "gasboom"));
    if (cheap) { x.gas = gb.gas; x.lng = gb.lng; x.lv.fuel = gb.lv.fuel; }
    x.pace = paceOf(P, pace); x.elec = pace; return x;
  }
  // the reader's step 7 run, or null while it is the Budget pathway as defined (S: { budget, cheap, pace })
  function mine(P, S) {
    var sc = scOf(P, "budget");
    if (S.budget === budgetOf(P, sc) && !S.cheap && S.pace === sc.policy.elec) return null;
    return scenario(P, "budget", { budget: S.budget, X: budgetInputs(P, S.cheap, S.pace) });
  }
  function pair(P, ka, kb) { return { A: scenario(P, ka), B: scenario(P, kb) }; }
  function waterfall(P, ka, kb, outKey, order) {
    var pr = pair(P, ka, kb), done = [], steps = [], prev = pr.A.out[outKey];
    order.forEach(function (g) { done.push(g); var v = run(P, mix(pr.A.X, pr.B.X, done)).out[outKey]; steps.push({ g: g, from: prev, to: v, d: v - prev }); prev = v; });
    return { a: pr.A.out[outKey], b: pr.B.out[outKey], steps: steps, gap: pr.B.out[outKey] - pr.A.out[outKey] };
  }
  function perms(a) { if (a.length <= 1) return [a.slice()]; var out = []; a.forEach(function (x, i) { perms(a.slice(0, i).concat(a.slice(i + 1))).forEach(function (p) { out.push([x].concat(p)); }); }); return out; }
  function average(P, ka, kb, outKey) {
    var all = perms(GROUPS), sum = {}, lo = {}, hi = {};
    GROUPS.forEach(function (g) { sum[g] = 0; lo[g] = Infinity; hi[g] = -Infinity; });
    all.forEach(function (o) { waterfall(P, ka, kb, outKey, o).steps.forEach(function (s) { sum[s.g] += s.d; lo[s.g] = Math.min(lo[s.g], s.d); hi[s.g] = Math.max(hi[s.g], s.d); }); });
    GROUPS.forEach(function (g) { sum[g] /= all.length; });
    return { avg: sum, lo: lo, hi: hi, orders: all.length };
  }
  function alone(P, ka, kb, outKey) {
    var pr = pair(P, ka, kb), base = pr.A.out[outKey];
    var rows = GROUPS.map(function (g) { return { g: g, d: run(P, mix(pr.A.X, pr.B.X, [g])).out[outKey] - base }; });
    return { a: base, b: pr.B.out[outKey], gap: pr.B.out[outKey] - base, rows: rows, sum: rows.reduce(function (s, r) { return s + r.d; }, 0) };
  }
  // which groups differ between two scenarios' inputs
  function differs(P, ka, kb) {
    var pr = pair(P, ka, kb), A = pr.A.X, B = pr.B.X;
    return GROUPS.filter(function (g) {
      if (g === "demand") return A.demand !== B.demand;
      if (g === "fuel") return A.gas !== B.gas || A.lng !== B.lng;
      if (g === "policy") return A.price !== B.price || A.pace !== B.pace;
      return CLEAN_TECH.some(function (k) { return A.capex[k] !== B.capex[k]; });
    });
  }

  // ---------------------------------------------------------------- formats and words (pure)
  // a gridline step giving at most six gridlines over a span: 1, 2 or 5 times a power of ten
  function niceStep(span) { var p = Math.pow(10, Math.floor(Math.log10(span))), c = [0.1, 0.2, 0.5, 1, 2, 5, 10]; for (var i = 0; i < c.length; i++) if (span / (c[i] * p) <= 6) return c[i] * p; return 10 * p; }
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function signed(v, d) { var r = Number(Math.abs(v).toFixed(d || 0)); return (r === 0 ? "" : v < 0 ? "−" : "+") + fmtN(r, d); }
  function pct(v) { return fmtN(100 * v, 0) + "%"; }
  function usdMWh(v) { return "$" + fmtN(v, 1) + " per MWh"; }
  function usdT(v) { return "$" + fmtN(v, 0) + " a tonne"; }
  function outFmt(P, key, v) { var o = P.D.outputs.filter(function (x) { return x.key === key; })[0]; return fmtN(v, o.dec) + " " + o.unit; }
  function outSigned(P, key, v) { var o = P.D.outputs.filter(function (x) { return x.key === key; })[0]; return signed(v, o.dec) + " " + o.unit; }
  function grp(P, g) { return P.D.groups.filter(function (x) { return x.key === g; })[0]; }
  function kindWord(sc) { return sc.kind === "target" ? "target-seeking" : "exploratory"; }
  function lvWord(l) { return l === "lo" ? "low end" : l === "hi" ? "high end" : "default"; }
  function policyWords(P, R) {
    var X = R.X, el = P.D.elec[X.elec].phrase;
    if (R.sc && R.sc.kind === "target") return R.target.ok ? "carbon price found: " + usdT(R.target.price) + "; " + el : "no price up to " + usdT(P.D.rule.priceMax) + " meets the budget; " + el;
    return (X.price > 0 ? "carbon price " + usdT(X.price) + " from " + P.D.rule.carbonFrom : "no carbon price") + "; " + el;
  }
  // the scenario's settings in words, one per group
  function setWords(P, R) {
    var X = R.X, lv = X.lv, dem = demandCase(P, X.demand);   // the levels of the run's own inputs (a reader's run included)
    var cl = CLEAN_TECH.map(function (k) { return lv.costs[k]; }), same = cl.every(function (l) { return l === cl[0]; });
    return { demand: dem.label + " demand",
      fuel: "gas $" + fmtN(X.gas, 2) + ", LNG $" + fmtN(X.lng, 2) + " per GJ (" + (lv.fuel.gas === lv.fuel.lng ? lvWord(lv.fuel.gas) + (lv.fuel.gas === "def" ? "s" : "s of their ranges") : "mixed") + ")",
      policy: policyWords(P, R),
      costs: same ? "clean plants at the " + lvWord(cl[0]) + (cl[0] === "def" ? " values" : " of their ranges") : "mixed" };
  }
  // the same, short, for the step's table
  function setShort(P, R) {
    var X = R.X, sc = R.sc, lv = X.lv, dem = demandCase(P, X.demand), cl = lv.costs.wind, el = P.D.elec[X.elec].label.toLowerCase();
    return { demand: dem.label, fuel: "$" + fmtN(X.gas, 2) + " · $" + fmtN(X.lng, 2),
      policy: (sc.kind === "target" ? (R.target.ok ? "found: " + usdT(R.target.price) : "none meets it") : X.price > 0 ? usdT(X.price) : "no carbon price") + "; electrification " + el,
      costs: CLEAN_TECH.every(function (k) { return lv.costs[k] === cl; }) ? (cl === "def" ? "default" : lvWord(cl)) : "mixed" };
  }
  function spread(P) {
    var vals = P.D.scenarios.map(function (s) { return scenario(P, s.key).out.co2; });
    return { lo: Math.min.apply(null, vals), hi: Math.max.apply(null, vals) };
  }
  var PREDICT = {
    q: "These four scenarios for Prairieland end up far apart. Why?",
    answer: "both",
    options: [{ value: "error", label: "Some of the modellers made mistakes" }, { value: "assume", label: "They assume different futures" },
              { value: "ask", label: "They answer different questions" }, { value: "both", label: "Both: different questions and different assumptions" }],
    feedback: {
      error: "Nothing here is a mistake: the four use one accounting and one data set. They ask different questions and assume different futures.",
      assume: "That is part of it. One of the four also asks a different question: what it would take to meet a budget.",
      ask: "That is part of it. The three that ask what happens also assume different demand, prices, policies and costs.",
      both: "Three ask what happens if their assumptions come true; one asks what it would take to meet a goal. And the assumptions differ too."
    }
  };
  function sceneSaw(P) {
    var sp = spread(P);
    return "In 2050 the four run from " + outFmt(P, "co2", sp.lo) + " to " + outFmt(P, "co2", sp.hi) + " of CO₂: three are **exploratory** (what happens if), one is **target-seeking** (what it would take).";
  }
  function ruleLine(P, X) {
    var C = costs(P, X, X.price);
    return "Clean mix " + usdMWh(C.clean) + ", new gas " + usdMWh(C.gas) + " at " + usdT(X.price) + ": **" + pct(C.share) + "** of new power comes from the clean mix.";
  }
  function ruleSaw(P, X) {
    var C = costs(P, X, X.price), W = P.D.rule.halfWidth;
    if (C.share >= 1) return "The clean mix is at least $" + W + " per MWh cheaper here, so all new power is clean: dearer gas or a higher carbon price changes nothing more.";
    if (C.share <= 0) return "Gas is at least $" + W + " per MWh cheaper here, so no new power is clean: cheaper gas or dearer clean plants change nothing more.";
    return "Each dollar per MWh between the two moves the clean share by " + fmtN(100 / (2 * W), 1) + " points. At the ends of the ramp, a further change does nothing: remember this for the gap tracer.";
  }
  function aloneLine(P, ka, kb, o) {
    var a = alone(P, ka, kb, o), A = scOf(P, ka), B = scOf(P, kb);
    return "From " + A.name + " to " + B.name + ": the four groups alone add up to **" + outSigned(P, o, a.sum) + "**; the real gap is **" + outSigned(P, o, a.gap) + "**.";
  }
  function aloneSaw(P, ka, kb, o) {
    var a = alone(P, ka, kb, o), off = Math.abs(a.sum - a.gap), dec = P.D.outputs.filter(function (x) { return x.key === o; })[0].dec;
    if (Number(off.toFixed(dec)) === 0) return "Here the parts alone add up to the gap: the groups do not interact for this result. That is not true in general.";
    return "The parts alone miss the gap by " + outFmt(P, o, off) + ": assumptions interact, so a change counted alone is not its share of the gap.";
  }
  function orderLine(P, ka, kb, o, mode) {
    if (mode === "avg") {
      var av = average(P, ka, kb, o);
      return "Averaged over all " + av.orders + " orders: " + GROUPS.map(function (g) { return grp(P, g).short + " " + outSigned(P, o, av.avg[g]); }).join(", ") + ".";
    }
    var w = waterfall(P, ka, kb, o, mode === "rev" ? GROUPS.slice().reverse() : GROUPS);
    return "In this order: " + w.steps.map(function (s) { return grp(P, s.g).short + " " + outSigned(P, o, s.d); }).join(", ") + "; together " + outSigned(P, o, w.gap) + ".";
  }
  function orderSaw(P, ka, kb, o) {
    var av = average(P, ka, kb, o), dec = P.D.outputs.filter(function (x) { return x.key === o; })[0].dec;
    var moved = GROUPS.filter(function (g) { return Number((av.hi[g] - av.lo[g]).toFixed(dec)) > 0; });
    if (!moved.length) return "Here every order gives each group the same share: nothing interacts. Say the order anyway when you report a gap.";
    var g = moved.slice().sort(function (x, y) { return (av.hi[y] - av.lo[y]) - (av.hi[x] - av.lo[x]); })[0];
    return "The total never changes; the shares do. Swapping " + grp(P, g).label.toLowerCase() + " adds " + outSigned(P, o, av.lo[g]) + " to " + outSigned(P, o, av.hi[g]) + ", depending on the order: report the order, or the average.";
  }
  function targetLine(P, R) {
    var t = R.target;
    if (!t.ok) return "Not reachable on this page: even at " + usdT(P.D.rule.priceMax) + " the cumulative CO₂ is **" + fmtN(t.floor, 0) + " Mt**, above the " + fmtN(t.budget, 0) + " Mt budget.";
    return "Budget " + fmtN(t.budget, 0) + " Mt: the lowest carbon price that meets it is **" + usdT(t.price) + "**; cumulative CO₂ " + fmtN(R.cum, 0) + " Mt, " + outFmt(P, "co2", R.out.co2) + " in 2050.";
  }
  function targetSaw(P, R) {
    var t = R.target;
    if (!t.ok) return "Meeting it within 2026–2050 needs cuts this page leaves out: earlier closures, efficiency beyond the demand case, other fuels or removals. A larger budget or other years would change the question.";
    if (t.price === 0) return "This budget needs no carbon price: the scenario's other settings already meet it. Here the target is fixed and the carbon price is found.";
    return "The target is fixed and the price is found: change the fuel prices or the pace, and the price moves while the CO₂ stays within the budget.";
  }
  // the cross-page card (step 7, collapsed) and its no-JS line: why engine E4 (M13, SB4) does not reach the budget this
  // page meets. E4's floor is read from this lesson's data (pathwayModel.floorMt), which the test recomputes with E4;
  // the floor with this page's path (withThisPathMt) is M13's reported comparison, which the test ties to E4's own words.
  // html: true writes plain links for the no-JS block, otherwise lesson and glossary marks for LX.rich
  function gapNote(P, html) {
    var B = scenario(P, "budget"), y = P.years[1], e = B.Y[y].elShare, bud = fmtN(budgetOf(P, scOf(P, "budget")), 0) + " Mt", PM = P.D.pathwayModel;
    var fl = "about " + fmtN(PM.floorMt, 0) + " Mt", wp = "about " + fmtN(PM.withThisPathMt, 0) + " Mt";
    var m13 = html ? "<a href=\"m13-national-pathway.html\">M13</a>" : "[[lesson:m13-national-pathway|M13]]", sb4 = html ? "<a href=\"sb4-pathway-explorer.html\">SB4</a>" : "[[lesson:sb4-pathway-explorer|SB4]]";
    return { head: "Why the pathway model disagrees",
      here: "The Budget pathway electrifies early and fast: by " + y + ", buildings reach " + pct(e.buildings) + " and industry " + pct(e.industry) + " of their " + (html ? "useful energy" : "[[useful-energy|useful energy]]") + ".",
      there: "The pathway model of " + m13 + " and " + sb4 + " raises each sector's share in a straight line to 2050; at best its CO₂ for 2026–2050 is " + fl + ", above the " + bud + " budget.",
      path: m13 + " reports that with this page's electrification path in its place, that model's best falls to " + wp + ", below the budget. The two models also differ in other ways.",
      lineHead: "Why " + m13 + " disagrees.", line: "Its least CO₂ for 2026–2050 is " + fl + ", above the " + bud + " budget; M13 reports " + wp + " when this page's earlier electrification replaces its straight line." };
  }
  // reference budgets: Prairieland's presets, listed (the slider has no preset buttons)
  function refBudgets(P) {
    return "Reference budgets, arithmetic on 2025's emissions and not a fair share: " + P.budget.presets.map(function (p) { return p.label.charAt(0).toLowerCase() + p.label.slice(1) + ", " + fmtN(p.mt, 0) + " Mt"; }).join("; ") + ".";
  }
  // the notes under the sharing rule (step 4) and the budget (step 7): one idea per line
  function ruleNotes(P) {
    var W = P.D.rule.halfWidth;
    return ["The clean mix is wind, solar, batteries and a generic [[firm-output|firm]] clean plant (steady output, no CO₂ in operation); new gas is a [[combined-cycle|combined cycle]].",
      "The rule's half-width, $" + W + " per MWh, is the cost gap at which all or none of new power is clean; the rule is set for teaching.",
      "Costs are per [[megawatt-hour|MWh]] made, from fixed values in fixed ranges, the same in every year; none changes with how much is built.", P.PL.about.line];
  }
  function budgetNotes(P) { return [refBudgets(P), P.PL.about.line]; }
  // the first words a reader needs in step 2
  var TERMS = "[[lng|LNG]] is liquefied natural gas, shipped in; a [[carbon-price|carbon price]] charges each tonne of CO₂ emitted; [[electrification|electrification]] switches heating, driving and industry from fuel to electricity.";
  // the units, each where it first appears: Mt in step 1, GJ in step 2's table, TWh and PJ in step 5; all four in the no-JS block
  var UNITS = {
    mt: "Mt is a million tonnes; the chart counts the CO₂ from the fuel Prairieland burns each year.",
    gj: "Gas and LNG in $ per GJ, a gigajoule (a billion joules); clean plants' capital costs as a level of Prairieland's ranges.",
    energy: "Electricity is counted in [[terawatt-hour|TWh]] and fuels in [[petajoule|PJ]]; both measure energy, and 1 TWh = 3.6 PJ.",
    all: "Units: Mt is a million tonnes of CO₂; TWh and PJ measure energy (1 TWh = 3.6 PJ); fuel prices are in $ per GJ (1 PJ = a million GJ). LNG is liquefied natural gas, shipped in."
  };
  function readSaw(P) {
    var A = scenario(P, "current"), B = scenario(P, "budget"), d = differs(P, "current", "budget");
    return "Current policies and the Budget pathway differ only in " + d.map(function (g) { return grp(P, g).label.toLowerCase(); }).join(" and ") + ": " + outFmt(P, "co2", A.out.co2) + " against " + outFmt(P, "co2", B.out.co2) + " in 2050, and the Budget pathway's carbon price was found to meet its goal.";
  }
  // the no-JS block and the practice set (written by the test's --write)
  function rowsTable(P) {
    return P.D.scenarios.map(function (s) { var R = scenario(P, s.key), w = setWords(P, R); return { s: s, R: R, w: w }; });
  }
  // the no-JS block: the units, the four groups of assumptions in one table, the results in another, then the ideas
  function staticFallback(P) {
    var line = P.PL.about.line, T = rowsTable(P), th = function (t) { return "<th scope=\"col\">" + t + "</th>"; };
    return "<p class=\"lx-eyebrow\">The idea in two tables: four scenarios for Prairieland, one accounting</p>" +
      "<p class=\"lx-hint\">" + UNITS.all + "</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a20-fbt\"><caption class=\"lx-hint\">The assumptions, in four groups. " + line + "</caption>" +
      "<thead><tr>" + th("Scenario") + th("Kind") + P.D.groups.map(function (g) { return th(g.label); }).join("") + "</tr></thead><tbody>" +
      T.map(function (x) { return "<tr><td>" + x.s.name + "</td><td>" + kindWord(x.s) + "</td>" + GROUPS.map(function (g) { return "<td>" + x.w[g] + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a20-fbt\"><caption class=\"lx-hint\">The results, for 2050 and for 2026–2050.</caption>" +
      "<thead><tr>" + th("Scenario") + th("CO₂ in 2050") + th("CO₂ 2026–2050") + th("Electricity made, 2050") + th("Oil and LNG imports, 2050") + "</tr></thead><tbody>" +
      T.map(function (x) { return "<tr><td>" + x.s.name + "</td><td>" + outFmt(P, "co2", x.R.out.co2) + "</td><td>" + fmtN(x.R.cum, 0) + " Mt</td><td>" + outFmt(P, "el", x.R.out.el) + "</td><td>" + outFmt(P, "imp", x.R.out.imp) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      "<ul><li><b>Two kinds.</b> Exploratory scenarios start from assumptions and ask what happens; a target-seeking one starts from a goal (the " + fmtN(budgetOf(P, scOf(P, "budget")), 0) + " Mt budget), keeps its other assumptions and finds the carbon price that meets it.</li>" +
      "<li><b>Gaps have causes.</b> From Announced plans to Gas boom, CO₂ in 2050 moves " + outSigned(P, "co2", waterfall(P, "announced", "gasboom", "co2", GROUPS).gap) + "; " + orderLine(P, "announced", "gasboom", "co2", "avg").replace("Averaged over all 24 orders: ", "averaged over all 24 orders of swapping: ") + "</li>" +
      "<li><b>Order matters.</b> Swapped one at a time, in a different order, the same groups get different shares of one total.</li>" +
      "<li><b>" + gapNote(P, true).lineHead + "</b> " + gapNote(P, true).line + "</li></ul>" +
      "<p class=\"lx-hint\">A screening accounting, not a forecast. With JavaScript on, you trace the gaps yourself.</p>";
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function dsum(pairs) { return pairs.reduce(function (a, p) { return a + r2(p[0]) * r2(p[1]); }, 0); }
  function practice(P) {
    var X = inputs(P, scOf(P, "current")), C = costs(P, X, 0), R = P.D.rule, T = P.PL.costs.technologies;
    var Xa = inputs(P, scOf(P, "announced")), Ca = costs(P, Xa, Xa.price);
    var w = P.weights, cur = scenario(P, "current"), ys = Object.keys(w);
    var two = (function () { var a = run(P, X).out.co2, d1 = run(P, mix(X, inputs(P, scOf(P, "gasboom")), ["demand"])).out.co2, d2 = run(P, mix(X, inputs(P, scOf(P, "gasboom")), ["fuel"])).out.co2, b = run(P, mix(X, inputs(P, scOf(P, "gasboom")), ["demand", "fuel"])).out.co2; return { a: a, d1: d1, d2: d2, b: b }; })();
    var items = [
      { t: "The clean mix's cost.", q: "What does the clean mix cost per MWh?",
        g: [["Wind", "$" + fmtN(C.wind, 2) + " per MWh; weight " + pct(R.mix.wind)], ["Solar", "$" + fmtN(C.solar, 2) + " per MWh; weight " + pct(R.mix.solar)],
            ["Firm clean plant", "$" + fmtN(C.firm, 2) + " per MWh; weight " + pct(R.mix.firm)], ["Batteries beside the solar", "$" + fmtN(C.battery, 2) + " per MWh of the mix"]],
        a: fmtN(R.mix.wind, 2) + " × " + fmtN(C.wind, 2) + " + " + fmtN(R.mix.solar, 2) + " × " + fmtN(C.solar, 2) + " + " + fmtN(R.mix.firm, 2) + " × " + fmtN(C.firm, 2) + " + " + fmtN(C.battery, 2) + " = $" + fmtN(dsum([[R.mix.wind, C.wind], [R.mix.solar, C.solar], [R.mix.firm, C.firm], [1, C.battery]]), 2) + " per MWh." },
      { t: "The sharing rule.", q: "What share of new power is clean?",
        g: [["Clean mix", "$" + fmtN(Ca.clean, 2) + " per MWh"], ["New gas, with Announced plans' $" + Xa.price + " carbon price", "$" + fmtN(Ca.gas, 2) + " per MWh"],
            ["Half-width, the cost gap at which all or none is clean", "$" + R.halfWidth + " per MWh"]],
        a: "0.5 + (" + fmtN(Ca.gas, 2) + " − " + fmtN(Ca.clean, 2) + ") ÷ (2 × " + R.halfWidth + ") = 0.5 + " + fmtN(r2(Ca.gas) - r2(Ca.clean), 2) + " ÷ " + (2 * R.halfWidth) + " = " + fmtN(0.5 + (r2(Ca.gas) - r2(Ca.clean)) / (2 * R.halfWidth), 2) + ", about " + pct(Ca.share) + "." },
      { t: "A carbon price per MWh.", q: "What does a $" + Xa.price + " carbon price add to each MWh from a new <span class=\"lx-term\" data-term=\"combined-cycle\">combined cycle</span>?",
        g: [["Gas burned", fmtN(C.heatRate, 3) + " GJ per MWh"], ["CO₂ from gas", fmtN(P.F.gas, 1) + " kg per GJ"]],
        a: fmtN(C.heatRate, 3) + " × " + fmtN(P.F.gas, 1) + " ÷ 1,000 = " + fmtN(C.tPerMWh, 3) + " t per MWh; × $" + Xa.price + " = " + usdMWh(Xa.price * C.tPerMWh) + "." },
      { t: "Cumulative CO₂.", q: "What is Current policies' total CO₂ for 2026–2050?",
        g: [["Weight", "how many years of 2026–2050 a model year counts for, with straight lines between model years"]].concat(ys.map(function (y) { return [y, fmtN(cur.Y[y].co2, 1) + " Mt; weight " + w[y]]; })),
        a: ys.map(function (y) { return w[y] + " × " + fmtN(cur.Y[y].co2, 1); }).join(" + ") + " = " + fmtN(cur.cum, 0) + " Mt (from unrounded values)." },
      { t: "Two orders, two answers.", q: "What does swapping in Gas boom's fuel prices add in each order?",
        g: [["Current policies, CO₂ in 2050", outFmt(P, "co2", two.a)], ["With Gas boom's demand swapped in", outFmt(P, "co2", two.d1)], ["With Gas boom's fuel prices swapped in", outFmt(P, "co2", two.d2)], ["With both swapped in", outFmt(P, "co2", two.b)]],
        a: "Demand first, fuel adds " + fmtN(r1(two.b), 1) + " − " + fmtN(r1(two.d1), 1) + " = " + outSigned(P, "co2", r1(two.b) - r1(two.d1)) + "; fuel first, " + fmtN(r1(two.d2), 1) + " − " + fmtN(r1(two.a), 1) + " = " + outSigned(P, "co2", r1(two.d2) - r1(two.a)) + ". Averaged over the two orders: (" + fmtN(r1(two.b) - r1(two.d1), 1) + " + " + fmtN(r1(two.d2) - r1(two.a), 1) + ") ÷ 2 = " + fmtN(r2(((r1(two.b) - r1(two.d1)) + (r1(two.d2) - r1(two.a))) / 2), 2) + " Mt." },
      { t: "Sort a description.", q: "An outlook “assumes laws and regulations in force on 31 December and reports what follows to 2050.” Exploratory or target-seeking?", g: [],
        a: "Exploratory: it fixes its assumptions and asks what follows; nothing forces a result. EIA describes its Counterfactual Baseline case this way." }
    ];
    return "<p class=\"lx-eyebrow\">Practice · about 30 minutes on your own</p><ol class=\"lx-fb-practice\">" + items.map(function (x) {
      return "<li><p><b>" + x.t + "</b> " + x.q + "</p>" + givensHTML(x.g) + "<details class=\"lx-answer\"><summary>Answer</summary><p>" + x.a + "</p></details></li>";
    }).join("") + "</ol><p class=\"lx-hint\">" + P.PL.about.line + " Every number here comes from the page's screening accounting.</p>";
  }
  // a practice item's givens as a two-column table (none: nothing)
  function givensHTML(g) { return g.length ? "<table class=\"lx-mini-table a20-given\"><tbody>" + g.map(function (r) { return "<tr><th scope=\"row\">" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table>" : ""; }

  // the explain layer's no-JS ideas and the myth cards (written by the test's --write)
  function ideas(P) {
    var sp = spread(P), B = scenario(P, "budget"), al = alone(P, "announced", "gasboom", "co2"), av = average(P, "announced", "gasboom", "co2");
    var g = GROUPS.slice().sort(function (x, y) { return (av.hi[y] - av.lo[y]) - (av.hi[x] - av.lo[x]); })[0];
    var items = [
      ["Two kinds of question", "Exploratory scenarios ask what happens if their assumptions hold; a target-seeking one asks what it would take to meet a goal."],
      ["The spread is information", "Prairieland's four end 2050 between " + outFmt(P, "co2", sp.lo) + " and " + outFmt(P, "co2", sp.hi) + " of CO₂; none of them is a forecast."],
      ["Gaps have causes", "From Announced plans to Gas boom, the four groups alone add up to " + outSigned(P, "co2", al.sum) + " against a real gap of " + outSigned(P, "co2", al.gap) + "."],
      ["Order matters", "Swapping " + grp(P, g).label.toLowerCase() + " adds " + outSigned(P, "co2", av.lo[g]) + " to " + outSigned(P, "co2", av.hi[g]) + ", depending on the order; its average over the " + av.orders + " orders is " + outSigned(P, "co2", av.avg[g]) + "."],
      ["The carbon price is an output", "The Budget pathway fixes its " + fmtN(B.target.budget, 0) + " Mt budget and assumes the fastest electrification allowed; the page then searches for the lowest carbon price that meets the budget: " + usdT(B.target.price) + "."]
    ];
    return "<dl class=\"lx-ideas\">" + items.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl>";
  }
  function myths(P) {
    var av = average(P, "announced", "gasboom", "co2"), g = GROUPS.slice().sort(function (x, y) { return (av.hi[y] - av.lo[y]) - (av.hi[x] - av.lo[x]); })[0], B = scenario(P, "budget");
    var Xc = inputs(P, scOf(P, "budget")), gb = inputs(P, scOf(P, "gasboom")); Xc.gas = gb.gas; Xc.lng = gb.lng;
    var Rc = scenario(P, "budget", { X: Xc });
    var M = [
      ["forecast", "myth", "“An energy outlook is a forecast of what will happen.”", "Myth. EIA says the results of its Annual Energy Outlook 2026 are not predictions; the IEA calls its scenarios exploratory or normative."],
      ["wrong", "myth", "“When two outlooks disagree, at least one of them is wrong.”", "Myth. Both can be consistent: Current policies and the Budget pathway answer different questions with the same data."],
      ["target", "myth", "“A target-seeking scenario shows what will happen once a country adopts the target.”", "Myth. It shows one way to meet the target under its assumptions: with Gas boom's cheap gas, the Budget pathway needs " + (Rc.target.ok ? usdT(Rc.target.price) : "more than " + usdT(P.D.rule.priceMax)) + " instead of " + usdT(B.target.price) + "."],
      ["split", "myth", "“A gap between two scenarios splits into parts that do not depend on how you split it.”", "Myth. When assumptions interact, the parts depend on the order: here, swapping " + grp(P, g).label.toLowerCase() + " adds " + outSigned(P, "co2", av.lo[g]) + " to " + outSigned(P, "co2", av.hi[g]) + "."]
    ];
    return M.map(function (m) {
      return "<div class=\"lx-qq\" data-id=\"" + m[0] + "\" data-answer=\"" + m[1] + "\">\n<p class=\"lx-qtext\">Myth or fact? " + m[2] + "</p>\n<ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul>\n<details class=\"lx-answer\"><summary>Answer</summary><p>" + m[3] + "</p></details>\n</div>";
    }).join("\n");
  }

  var model = { KEY: KEY, GROUPS: GROUPS, CLEAN_TECH: CLEAN_TECH, crf: crf, prepare: prepare, scOf: scOf, inputs: inputs, costs: costs, year: year, run: run, solvePrice: solvePrice,
    budgetOf: budgetOf, scenario: scenario, mix: mix, pair: pair, waterfall: waterfall, perms: perms, average: average, alone: alone, differs: differs, demandCase: demandCase,
    fmtN: fmtN, signed: signed, pct: pct, usdMWh: usdMWh, usdT: usdT, outFmt: outFmt, outSigned: outSigned, grp: grp, kindWord: kindWord, setWords: setWords, setShort: setShort, spread: spread,
    PREDICT: PREDICT, niceStep: niceStep, sceneSaw: sceneSaw, ruleLine: ruleLine, ruleSaw: ruleSaw, aloneLine: aloneLine, aloneSaw: aloneSaw, orderLine: orderLine, orderSaw: orderSaw,
    targetLine: targetLine, targetSaw: targetSaw, readSaw: readSaw, rowsTable: rowsTable, staticFallback: staticFallback, practice: practice, ideas: ideas, myths: myths, paceOf: paceOf,
    budgetInputs: budgetInputs, mine: mine, gapNote: gapNote, refBudgets: refBudgets, ruleNotes: ruleNotes, budgetNotes: budgetNotes, TERMS: TERMS, UNITS: UNITS, givensHTML: givensHTML, gridStep: gridStep };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  LX.mount("national-scenarios", function (live, data, root) {
    var PL = data.prairieland, D = data[KEY], PATH = data.path, P = prepare(PL, D), LINE = PL.about.line;
    var S = { pair: 0, out: "co2", mode: "fwd", budget: budgetOf(P, scOf(P, "budget")), cheap: false, pace: "fast", pick: "current",
              rule: { gas: PL.costs.fuels.gas.def, lng: PL.costs.fuels.lng.def, price: 0, level: "def" } };
    var saved = LX.store.get("a20");
    if (saved) {
      if (saved.pair >= 0 && saved.pair < D.pairs.length) S.pair = saved.pair;
      if (D.outputs.some(function (o) { return o.key === saved.out; })) S.out = saved.out;
      if (typeof saved.budget === "number" && saved.budget >= P.budget.lo && saved.budget <= P.budget.hi) S.budget = saved.budget;
      if (typeof saved.cheap === "boolean") S.cheap = saved.cheap;
      if (saved.pace === "fast" || saved.pace === "stated") S.pace = saved.pace;
    }
    // every change is kept in this browser and, a moment later, redrawn in the explain layer (it shows the reader's step 7 run)
    var xTimer = null;
    function keep() { LX.store.set("a20", { pair: S.pair, out: S.out, budget: S.budget, cheap: S.cheap, pace: S.pace }); if (xTimer) clearTimeout(xTimer); xTimer = setTimeout(paintExplain, 200); }
    // a short list of notes under a step's controls, one idea per line (glossary and lesson marks allowed)
    function notes(host, list) { var ul = H("ul", { class: "lx-hint a20-notes" }, host); list.forEach(function (t) { H("li", { html: bold(t) }, ul); }); }
    var demo = [];
    function seg(host, label, items, cur, onPick) {
      var wrap = H("div", { class: "cf-ctl" }, host), id = LX.uid("a20s");
      H("p", { class: "cf-ctl-l", id: id, text: label }, wrap);
      var g = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, wrap), b = {};
      items.forEach(function (it) { b[it[0]] = H("button", { type: "button", text: it[1] }, g); b[it[0]].addEventListener("click", function () { onPick(it[0]); paint(it[0]); }); });
      function paint(k) { Object.keys(b).forEach(function (j) { b[j].setAttribute("aria-pressed", String(j === k)); }); }
      paint(cur); return paint;
    }
    function chips(host, list) { host.innerHTML = ""; list.forEach(function (x) { var c = H("div", { class: "lx-readout" + (x[2] ? " " + x[2] : "") }, host); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); }); }
    var pairItems = D.pairs.map(function (p, i) { return [String(i), scOf(P, p.a).short + " → " + scOf(P, p.b).short]; });
    var outItems = D.outputs.map(function (o) { return [o.key, o.label]; });
    function curPair() { return D.pairs[S.pair]; }
    function co2Chart(Pl, list) {
      var lines = list.map(function (R) { return { pts: P.years.map(function (t) { return [t, R.Y[t].co2]; }), color: R.sc.color, width: R.sc.kind === "target" ? 3 : 2.4, dash: R.sc.kind === "target" ? "6 4" : null, dots: true }; });
      var mx = Math.max.apply(null, list.map(function (R) { return Math.max.apply(null, P.years.map(function (t) { return R.Y[t].co2; })); }));
      Pl.render({ x: { min: P.base, max: P.years[P.years.length - 1], ticks: P.years.map(function (t) { return [t, String(t)]; }), ticksN: [[2025, "2025"], [2035, "2035"], [2050, "2050"]] },
        y: { min: 0, max: Math.ceil(mx / 50) * 50, step: 50, fmt: function (v) { return fmtN(v); }, unit: "Mt CO₂ a year" }, height: 250, heightN: 220, lines: lines,
        legend: list.map(function (R) { return { label: R.sc.name + " (" + kindWord(R.sc) + ")", color: R.sc.color, dash: R.sc.kind === "target" ? "6 4" : null }; }),
        aria: "Prairieland's CO₂ in four scenarios, 2025 to 2050: " + list.map(function (R) { return R.sc.name + " " + outFmt(P, "co2", R.out.co2) + " in 2050"; }).join("; ") + ".",
        text: { head: ["Year"].concat(list.map(function (R) { return R.sc.name; })), rows: P.years.map(function (t) { return [String(t)].concat(list.map(function (R) { return fmtN(R.Y[t].co2, 1); })); }), note: "Mt CO₂ a year; model years only. " + LINE } });
    }
    function bars(Pl, o, items, title) {
      // items: [{label, short, v, total}] drawn as a waterfall when steps, as plain bars otherwise
      var dec = D.outputs.filter(function (x) { return x.key === o; })[0].dec, ys = [], bs = [], tk = [], tkN = [], marks = [];
      items.forEach(function (it, i) {
        var y0 = it.y0 == null ? 0 : it.y0, y1 = it.y1; ys.push(y0, y1);
        bs.push({ x0: i + 0.15, x1: i + 0.85, y0: Math.min(y0, y1), y1: Math.max(y0, y1), color: it.total ? "var(--lx-accent)" : y1 < y0 ? "var(--lx-good)" : "var(--lx-bad)", op: 0.85, rx: 3 });
        tk.push([i + 0.5, it.mid || it.short]); tkN.push([i + 0.5, it.short]);
        var down = y1 < y0 || (y1 < 0 && y0 <= 0);   // a fall, or a negative value: its label goes under the bar
        marks.push({ x: i + 0.5, y: down ? Math.min(y0, y1) : Math.max(y0, y1), label: it.text.replace(/ (Mt|TWh|PJ)$/, ""), kind: "dot", pos: down ? "below" : "above" });
      });
      var lo = Math.min.apply(null, ys.concat([0])), hi = Math.max.apply(null, ys.concat([0])), span = hi - lo || 1, st = niceStep(span);
      var y = { min: Math.floor((lo < 0 ? lo - span * 0.12 : lo) / st) * st, max: Math.ceil((hi + span * 0.12) / st) * st, step: st, fmt: function (v) { return fmtN(v); }, unit: D.outputs.filter(function (x) { return x.key === o; })[0].unit, zero: true };
      Pl.render({ x: { min: 0, max: items.length, ticks: tk, ticksN: tkN }, y: y, height: 250, heightN: 230, bars: bs, marks: marks,
        legend: [{ label: "Raises it", color: "var(--lx-bad)" }, { label: "Lowers it", color: "var(--lx-good)" }, { label: "A scenario's own value", color: "var(--lx-accent)" }],
        aria: title + ": " + items.map(function (it) { return it.label + " " + it.text; }).join("; ") + ".",
        text: { head: ["Bar", "Value"], rows: items.map(function (it) { return [it.label, it.text]; }), note: LINE } });
      return dec;
    }

    var steps = [
      { text: "Four scenarios for Prairieland's CO₂ to 2050, built on one data set and one accounting. Before you look closer: why do they end so far apart?",
        build: function (act, api) {
          var list = D.scenarios.map(function (s) { return scenario(P, s.key); });
          var Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          co2Chart(Pl, list);
          H("p", { class: "lx-hint", text: LINE + " A screening accounting, not a forecast." }, act);
          H("p", { class: "lx-hint", html: bold(UNITS.mt) }, act);
          var pr = LX.Predict(act, { id: "a20-why", q: PREDICT.q, answer: PREDICT.answer, options: PREDICT.options, feedback: PREDICT.feedback, onPick: function () { show(); } });
          function show() { pr.reveal(); api.done(); api.saw(sceneSaw(P)); }
          if (pr.picked()) show();
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelector(".lx-choice"); if (b) b.click(); } };
        } },
      { text: "Line them up: each scenario's question, its assumptions and its results. Pick a scenario to read what it asks and what it sets.",
        build: function (act, api) {
          var card, paint = seg(act, "Scenario", D.scenarios.map(function (s) { return [s.key, s.short]; }), S.pick, function (k) { pick(k); });
          card = H("div", { class: "a20-card", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", html: bold(TERMS) }, act);
          LX.Ledger(H("div", null, act), { caption: UNITS.gj + " " + LINE, columns: ["Scenario", "Demand", "Gas · LNG", "Policy", "Clean plants", "CO₂ 2050", "CO₂ 2026–2050"],
            rows: rowsTable(P).map(function (x) { var w = setShort(P, x.R); return { head: x.s.name, sub: kindWord(x.s), cells: [w.demand, w.fuel, w.policy, w.costs, outFmt(P, "co2", x.R.out.co2), fmtN(x.R.cum, 0) + " Mt"] }; }), cls: "a20-led" });
          function pick(k) {
            S.pick = k; var R = scenario(P, k), s = R.sc; card.innerHTML = "";
            H("p", { class: "a20-q", html: "<b>" + LX.esc(s.name) + "</b> · " + kindWord(s) + ": “" + LX.esc(s.question) + "”" }, card);
            H("p", { class: "lx-hint", text: s.story }, card);
            api.done(); api.saw("A scenario is a question plus its assumptions. Compare two scenarios' questions before you compare their numbers.");
          }
          pick(S.pick);
          demo[1] = function () { pick("budget"); paint("budget"); };
        } },
      { text: "Sort them: an [[exploratory-scenario|exploratory scenario]] starts from assumptions, a [[target-seeking-scenario|target-seeking]] one from a goal. Four real outlooks join them, named as their authors describe them.",
        build: function (act, api) {
          var cs = LX.CardSort(act, { bins: D.sort.bins, cards: D.sort.cards, onCheck: function (g) {
            if (g.placed < g.total) return; api.done();
            api.saw(g.right + " of " + g.total + " as their authors describe them. IEA calls the goal-reaching kind **normative**; EIA says its cases are not predictions.");
          } });
          H("p", { class: "lx-hint", html: D.realWorld.map(function (r) { var s = D.sources[r.src]; return "<a href=\"" + LX.esc(s.url) + "\">" + LX.esc(r.who) + "</a>"; }).join("; ") + "." }, act);
          demo[2] = function () { var m = {}; D.sort.cards.forEach(function (c) { m[c.id] = c.bin; }); cs.place(m); cs.check(); };
        } },
      { text: "New power is shared between new gas plants and a clean mix by their full costs per MWh. Move fuel prices, a carbon price and the clean plants' fixed cost level, and watch the share.",
        build: function (act, api) {
          var X = inputs(P, scOf(P, "current")), F = PL.costs.fuels;
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function cur() { var x = JSON.parse(JSON.stringify(X)); x.gas = S.rule.gas; x.lng = S.rule.lng; x.price = S.rule.price; CLEAN_TECH.forEach(function (k) { x.capex[k] = PL.costs.technologies[k].capex[S.rule.level]; }); return x; }
          function paint() { var x = cur(), C = costs(P, x, x.price); chips(ro, [["Clean mix", usdMWh(C.clean)], ["New gas", usdMWh(C.gas)], ["Clean share of new power", pct(C.share), C.share >= 0.5 ? "good" : "bad"]]); line.innerHTML = bold(ruleLine(P, x)); api.done(); api.saw(ruleSaw(P, x)); }
          var g = LX.Slider(act, { label: "Domestic gas", color: "var(--lx-cc)", min: F.gas.lo, max: F.gas.hi, step: gridStep(F.gas), value: S.rule.gas, fmt: function (v) { return "$" + fmtN(v, 2) + " per GJ"; }, onChange: function (v) { S.rule.gas = v; paint(); } });
          LX.Slider(act, { label: "LNG", color: "var(--lx-cc)", min: F.lng.lo, max: F.lng.hi, step: gridStep(F.lng), value: S.rule.lng, fmt: function (v) { return "$" + fmtN(v, 2) + " per GJ"; }, onChange: function (v) { S.rule.lng = v; paint(); } });
          LX.Slider(act, { label: "Carbon price (illustrative)", color: "var(--lx-tier-5)", min: 0, max: D.rule.priceMax, step: 5, value: S.rule.price, fmt: usdT, onChange: function (v) { S.rule.price = v; paint(); } });
          seg(act, "Wind, solar, battery and firm-plant capital costs (fixed values in Prairieland's ranges)", [["lo", "Low end"], ["def", "Default"], ["hi", "High end"]], S.rule.level, function (k) { S.rule.level = k; paint(); });
          notes(act, ruleNotes(P));
          paint();
          demo[3] = function () { g.set(F.gas.hi, true); };
        } },
      { text: "Now trace a gap. Swap one group of assumptions at a time from one scenario into another, and compare each change with the whole gap.",
        build: function (act, api) {
          var ctl = H("div", null, act), Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true }), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function paint() {
            var p = curPair(), a = alone(P, p.a, p.b, S.out), A = scOf(P, p.a), B = scOf(P, p.b);
            var items = a.rows.map(function (r) { return { label: grp(P, r.g).label + " alone", mid: grp(P, r.g).short, short: grp(P, r.g).short.slice(0, 4), y0: 0, y1: r.d, text: outSigned(P, S.out, r.d) }; })
              .concat([{ label: "Sum of the four", short: "Sum", y0: 0, y1: a.sum, text: outSigned(P, S.out, a.sum), total: true }, { label: "The real gap", short: "Gap", y0: 0, y1: a.gap, text: outSigned(P, S.out, a.gap), total: true }]);
            bars(Pl, S.out, items, D.outputs.filter(function (x) { return x.key === S.out; })[0].label + ", " + A.name + " to " + B.name + ", each group alone");
            line.innerHTML = bold(aloneLine(P, p.a, p.b, S.out)); keep(); api.done(); api.saw(aloneSaw(P, p.a, p.b, S.out));
          }
          var pp = seg(ctl, "From → to", pairItems, String(S.pair), function (k) { S.pair = +k; paint(); });
          seg(ctl, "Result", outItems, S.out, function (k) { S.out = k; paint(); });
          H("p", { class: "lx-hint", html: bold(UNITS.energy) }, ctl);
          paint();
          demo[4] = function () { S.pair = 0; pp("0"); paint(); };
        } },
      { text: "Swap them in order instead: each bar is what one group adds after the ones before it. Change the order, or average over every order.",
        build: function (act, api) {
          var ctl = H("div", null, act), Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true }), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), seen = {};
          function paint() {
            var p = curPair(), A = scOf(P, p.a), B = scOf(P, p.b), items = [], prev;
            if (S.mode === "avg") {
              var av = average(P, p.a, p.b, S.out), w0 = waterfall(P, p.a, p.b, S.out, GROUPS); prev = w0.a;
              items.push({ label: A.name, mid: A.short, short: A.short.slice(0, 3), y0: 0, y1: w0.a, text: outFmt(P, S.out, w0.a), total: true });
              GROUPS.forEach(function (g) { items.push({ label: grp(P, g).label + " (average)", mid: grp(P, g).short, short: grp(P, g).short.charAt(0), y0: prev, y1: prev + av.avg[g], text: outSigned(P, S.out, av.avg[g]) }); prev += av.avg[g]; });
              items.push({ label: B.name, mid: B.short, short: B.short.slice(0, 3), y0: 0, y1: w0.b, text: outFmt(P, S.out, w0.b), total: true });
            } else {
              var w = waterfall(P, p.a, p.b, S.out, S.mode === "rev" ? GROUPS.slice().reverse() : GROUPS);
              items.push({ label: A.name, mid: A.short, short: A.short.slice(0, 3), y0: 0, y1: w.a, text: outFmt(P, S.out, w.a), total: true });
              w.steps.forEach(function (s, i) { items.push({ label: (i + 1) + ". " + grp(P, s.g).label, mid: (i + 1) + ". " + grp(P, s.g).short, short: (i + 1) + "." + grp(P, s.g).short.charAt(0), y0: s.from, y1: s.to, text: outSigned(P, S.out, s.d) }); });
              items.push({ label: B.name, mid: B.short, short: B.short.slice(0, 3), y0: 0, y1: w.b, text: outFmt(P, S.out, w.b), total: true });
            }
            bars(Pl, S.out, items, D.outputs.filter(function (x) { return x.key === S.out; })[0].label + ", " + A.name + " to " + B.name + ", in order");
            line.innerHTML = bold(orderLine(P, p.a, p.b, S.out, S.mode)); seen[S.mode] = true; keep();
            if (Object.keys(seen).length >= 2) { api.done(); api.saw(orderSaw(P, p.a, p.b, S.out)); }
          }
          seg(ctl, "From → to", pairItems, String(S.pair), function (k) { S.pair = +k; paint(); });
          seg(ctl, "Result", outItems, S.out, function (k) { S.out = k; paint(); });
          var pm = seg(ctl, "Order of the swaps", [["fwd", "Demand first"], ["rev", "Costs first"], ["avg", "Average of all 24"]], S.mode, function (k) { S.mode = k; paint(); });
          paint();
          demo[5] = function () { S.mode = "rev"; pm("rev"); paint(); };
        } },
      { text: "The Budget pathway is target-seeking: its budget is fixed and its carbon price is found. Move the budget, then change the fuel prices or the pace of electrification.",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function paint() {
            var R = scenario(P, "budget", { budget: S.budget, X: budgetInputs(P, S.cheap, S.pace) }), t = R.target;
            chips(ro, [["Carbon price found", t.ok ? usdT(t.price) : "none up to " + usdT(D.rule.priceMax), t.ok ? "" : "bad"], ["CO₂ 2026–2050", fmtN(t.ok ? R.cum : t.floor, 0) + " Mt"], ["CO₂ in 2050", outFmt(P, "co2", R.out.co2)]]);
            line.innerHTML = bold(targetLine(P, R)); keep(); api.done(); api.saw(targetSaw(P, R));
          }
          var sl = LX.Slider(act, { label: "Budget: CO₂ from 2026 to 2050 (a choice)", color: "var(--lx-good)", min: P.budget.lo, max: P.budget.hi, step: P.budget.step, value: S.budget, fmt: function (v) { return fmtN(v) + " Mt"; }, onChange: function (v) { S.budget = v; paint(); } });
          var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Change the assumptions" }, act);
          LX.Toggle(tg, { label: "Gas boom's cheap gas and LNG", on: S.cheap, onChange: function (on) { S.cheap = on; paint(); } });
          LX.Toggle(tg, { label: "Electrification as announced, not the fastest", on: S.pace !== "fast", onChange: function (on) { S.pace = on ? "stated" : "fast"; paint(); } });
          notes(act, budgetNotes(P));
          // the comparison with the pathway model, collapsed: one idea per paragraph
          var gc = H("details", { class: "lx-textalt a20-gap" }, act), gn = gapNote(P);
          H("summary", { text: gn.head }, gc); H("p", { html: bold(gn.here) }, gc); H("p", { html: bold(gn.there) }, gc); H("p", { html: bold(gn.path) }, gc);
          paint();
          demo[6] = function () { sl.set(P.budget.def - 300, true); };
        } },
      { text: "Read two outlooks as an analyst: first their questions, then their assumptions, then their numbers. Here is the gap a headline would quote.",
        build: function (act, api) {
          // the two scenarios as defined; the reader's step 7 run beside them when it differs (a third column)
          var A = scenario(P, "current"), B = scenario(P, "budget"), Y = mine(P, S), tb = H("div", null, act), L = [A, B].concat(Y ? [Y] : []);
          function cell(f) { return L.map(f); }
          LX.Ledger(tb, { caption: (Y ? "The two as defined, at their default settings, beside your step 7 run" : "The two as defined, at their default settings") + ", with this page's accounting. " + LINE,
            columns: ["", A.sc.name, B.sc.name].concat(Y ? ["Your step 7 run"] : []),
            rows: [{ head: "Question", cells: cell(function (R) { return R.sc.question; }) }, { head: "Kind", cells: cell(function (R) { return kindWord(R.sc); }) },
                   { head: "Budget", cells: cell(function (R) { return R.target ? fmtN(R.target.budget, 0) + " Mt" : "none"; }) },
                   { head: "Policy", sub: "set by the authors, or its carbon price found", cells: cell(function (R) { return setWords(P, R).policy; }) },
                   { head: "CO₂ in 2050", cells: cell(function (R) { return outFmt(P, "co2", R.out.co2); }) },
                   { head: "CO₂ 2026–2050", cells: cell(function (R) { return fmtN(R.target && !R.target.ok ? R.target.floor : R.cum, 0) + " Mt"; }) }], cls: "a20-led" });
          api.done(); api.saw(readSaw(P));
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "How to compare two scenarios, as diagrams" + LX.icon("arrow") }, act);
          demo[7] = function () {};
        } }
    ];
    var cards = LX.StepCards(live, { id: "a20-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer
    // the four scenarios as defined (default settings) and, when it differs, the reader's step 7 run as a fifth row;
    // redrawn a moment after each change (keep)
    function paintExplain() {
      var xhost = document.getElementById("a20-explain");
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var T = rowsTable(P), Y = mine(P, S);
      function res(R) { return outFmt(P, "co2", R.out.co2) + " CO₂ in 2050; " + fmtN(R.cum, 0) + " Mt 2026–2050; " + outFmt(P, "imp", R.out.imp) + " imported"; }
      function set(w) { return [w.demand, w.fuel, w.policy, w.costs].join("; "); }
      var rows = T.map(function (x) { return { key: x.s.key, color: x.s.color, name: x.s.name, note: kindWord(x.s), q: x.s.question, set: set(x.w), res: res(x.R) }; });
      if (Y) rows.push({ key: "mine", color: "var(--lx-accent)", name: "Your step 7 run", note: "target-seeking; budget " + fmtN(Y.target.budget, 0) + " Mt", q: Y.sc.question, set: set(setWords(P, Y)), res: res(Y) });
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), { title: "The four scenarios as defined, one table", text: true,
        caption: LINE + " Default settings, with this page's screening accounting" + (Y ? "; the last row is your step 7 run." : "."),
        columns: [{ key: "name", label: "Scenario", main: true }, { key: "q", label: "Question" }, { key: "set", label: "Assumptions" }, { key: "res", label: "Results" }],
        rows: rows });
      var cb = scenario(P, "current"), gbR = scenario(P, "gasboom"), Cc = cb.C, Cg = gbR.C;
      LX.CausalChain(H("div", { class: "lx-xcard" }, xhost), { title: "Cause and effect: cheap gas in the Gas boom",
        links: [{ title: "Gas and LNG are cheaper", text: "Both at the low ends of Prairieland's ranges.", value: "$" + fmtN(Cc.blend, 2) + " → $" + fmtN(Cg.blend, 2) + " per GJ" },
                { title: "New gas power is cheaper", text: "Fuel is most of a combined cycle's full cost.", value: usdMWh(Cc.gas) + " → " + usdMWh(Cg.gas) },
                { title: "Less new power is clean", text: "The sharing rule moves new power toward the cheaper option.", value: pct(Cc.share) + " → " + pct(Cg.share) },
                { title: "More CO₂ and more LNG", text: "With fast demand growth and dearer clean plants too.", value: outFmt(P, "co2", cb.out.co2) + " → " + outFmt(P, "co2", gbR.out.co2) + " in 2050" }],
        note: "The last link mixes all four groups: the gap tracer splits it." });
      LX.Flowchart(H("div", { class: "lx-xcard" }, xhost), { title: "How to compare two scenarios",
        nodes: { q: { t: "Same question?", k: "q" }, lev: { t: "Compare the policies they need", tN: ["Compare the", "policies needed"], s: "not the results", sN: "not results" },
                 bd: { t: "Same boundary and units?", tN: ["Same boundary", "and units?"], k: "q" }, fix: { t: "Align them first", s: "sectors, gases, conventions", sN: "sectors, gases" },
                 one: { t: "Swap assumptions", s: "one at a time" }, ord: { t: "Then in order", s: "state the order, or average", sN: "say the order" }, rep: { t: "Report the spread", s: "not one number", k: "end" } },
        cols: 2, colsN: 2, at: { q: [0, 0], lev: [1, 0], bd: [0, 1], fix: [1, 1], one: [0, 2], ord: [0, 3], rep: [0, 4] }, atN: { q: [0, 0], lev: [1, 0], bd: [0, 1], fix: [1, 1], one: [0, 2], ord: [0, 3], rep: [0, 4] },
        edges: [["q", "lev", "no"], ["q", "bd", "yes"], ["lev", "bd", null, { v: true }], ["bd", "fix", "no"], ["bd", "one", "yes"], ["fix", "one", null, { v: true }], ["one", "ord"], ["ord", "rep"]],
        traces: [{ label: "Announced → Gas boom", path: ["q", "bd", "one", "ord", "rep"], text: orderLine(P, "announced", "gasboom", "co2", "avg") },
                 { label: "Current → Budget", path: ["q", "lev", "bd", "one", "ord", "rep"], text: readSaw(P) }], sel: 0 });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where these scenarios hold",
        holds: ["Prairieland, a fictional nation, in 2025 dollars, with its own data;", "existing plants run as in 2025 until they retire, unless a carbon price closes them;", "new power shared by full costs per MWh, with fixed costs the same in every year;", "domestic oil and gas meeting demand up to their 2025 output, imports beyond it, no exports."],
        leaves: ["Balance over [[time-slice|time slices]], storage, transmission between regions and hourly checks of selected years: the pathway model of [[lesson:m13-national-pathway|M13]] adds them;", "adequacy judged over many weather years and plant outages: lesson [[lesson:a05-adequacy|A5]];", "end-use equipment costs, behaviour and prices that respond to demand;", "methane and other gases, and removals;", "probabilities: this lesson assigns none, so it cannot say which scenario is more likely."],
        source: "Accounting: this page's screening model. Data: Prairieland (course data); costs from EIA's AEO2026 assumptions." });
    }
    paintExplain();

    LX.demo(root, function (state) {
      var n = state === "mid" ? 4 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, P: P, S: S, cards: cards };
    void PATH;
  });
})();
