// m13-national-pathway.js — M13, "Build a nation's pathway: a multi-region, multi-decade model" (Modeler, model-lab in
// the cards form, wave W6, 2026-11-07), on engine E4 (assets/learn/components/engine-e4.js, LX.E4, in the bundle; the
// Pathway Explorer SB4 and capstone C4 run the same model). Data: prairieland.json, e4-pathways.json, e4-library.json.
//
// Steps: predict whether a straight line to zero is in reach; vintages and residual value; the twelve slices and their
// chronology; the model in four parts; solve the central pathway; the budget's dual as a carbon value and a budget sweep;
// the straight line to zero (out of reach, and why); perfect foresight against decade by decade; a shock and the re-plan;
// slices against full years of hours (from the library); near-optimal plans. Then the explain layer (the equation card,
// the flowchart of a run, a comparison table) built from the reader's runs.
// Every number comes from E4 or its library; _tests/learn/test_m13-national-pathway.js checks the words against them.
// Prairieland is fictional; its numbers are illustrative.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (Node: the test reads it)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function fix(v, d) { var s = Math.abs(v).toFixed(d == null ? 1 : d); return (v < 0 && +s !== 0 ? "−" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function pct(v, d) { return fix(v * 100, d == null ? 0 : d) + "%"; }
  function bn(v) { return (v < 0 ? "−$" : "$") + fix(Math.abs(v) / 1000, 1) + " billion"; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] || 0; return s; }
  var TECH = { wind: "Wind farm", solar: "Solar farm", battery: "Battery (4 hours)", gasCC: "Gas combined cycle", firm: "Generic firm clean plant" };
  // a plant built in model year q (index): the model years it runs, the years it pays for up to 2050, and the share of
  // its payments' present value left as residual value (the payments after 2050)
  function vintage(P, tech, q, rate) {
    var T = P.tech[tech], life = T.life, Y = P.Y, y0 = Y[q] - P.each + 1, last = y0 + life - 1, pvAll = 0, pvIn = 0, inYears = 0;
    for (var t = y0; t <= last; t++) { var df = Math.pow(1 + rate, -(t - 2025)); pvAll += df; if (t <= 2050) { pvIn += df; inYears++; } }
    return { tech: tech, q: q, built: Y[q], life: life, first: y0, last: last, runs: Y.map(function (y, p) { return p >= q && y - Y[q] < life; }), years: inYears,
      residual: 1 - pvIn / pvAll };
  }
  function vintageWords(v) {
    return "A " + TECH[v.tech].toLowerCase() + " built in the model year " + v.built + " runs from " + v.first + " to " + v.last + " (" + v.life + " years). The model charges its yearly payments for " + v.years + " years, to 2050" +
      (v.residual > 0.0005 ? "; the other " + (v.life - v.years) + " are its residual value, " + pct(v.residual) + " of its payments' present value." : ": its whole life fits before 2050, so it has no residual value.");
  }
  // the carbon value the budget's dual implies in each model year (it rises at the discount rate)
  function carbonPath(dual, rate, Y) { return Y.map(function (y) { return dual * Math.pow(1 + rate, y - 2025); }); }
  function runWords(V) {
    var b = function (t) { return fix(sum(V.built[t]), 1); };
    return "The cheapest central pathway costs " + bn(V.pv.total) + " (present value in 2025) and emits " + kilo(V.cum) + " Mt over 2026–2050, against a " + kilo(V.budget) + " Mt budget. It builds " + b("wind") + " GW of wind, " + b("solar") +
      " GW of solar and " + fix(sum(V.built.gasCC) + sum(V.built.gasCT), 1) + " GW of gas; imports peak at " + pct(Math.max.apply(null, V.imp)) + " of primary energy.";
  }
  function sweepWords(rows) {
    var r = rows.slice().sort(function (a, b) { return b.budget - a.budget; }), last = r[r.length - 1];
    if (r.length < 2) return "Run another budget to compare.";
    var tight = r.filter(function (x) { return x.over < 0.5; }), out = r.filter(function (x) { return x.over >= 0.5; });
    return "From " + kilo(r[0].budget) + " to " + kilo(last.budget) + " Mt the cost rises from " + bn(r[0].pv) + " to " + bn(last.pv) + " and the budget's dual from $" + fix(r[0].dual, 0) + " to $" + fix(last.dual, 0) + " a tonne." +
      (out.length ? " At " + out.map(function (x) { return kilo(x.budget); }).join(" and ") + " Mt no pathway within these levers meets the budget: the dual is the penalty's $1,000." : "") + (tight.length ? "" : "");
  }
  // what fuel use stays in 2050 at the most electrification (PJ), from the engine's demand
  function remains(S) { var f = S.fuel[S.fuel.length - 1]; return { oil: f.oil, gas: f.gas, coal: f.coal }; }
  function deepWords(V, S, B) {
    var r = remains(S);
    return "Even with the most electrification the data allows, the closest pathway emits " + kilo(V.cum) + " Mt: " + kilo(V.over) + " Mt over the " + kilo(B) + " Mt straight line to zero. In 2050 the fuel burned outside power still holds " + kilo(r.oil) + " PJ of oil products, " + kilo(r.gas) + " PJ of gas and " + kilo(r.coal) + " PJ of coal, and the model has no way to cut them.";
  }
  function foresightWords(Vp, Vm) {
    var d = Vm.pv.total - Vp.pv.total, ep = sum(Vp.early), em = sum(Vm.early);
    return "Decade by decade costs " + bn(d) + " more than perfect foresight (" + bn(Vm.pv.total) + " against " + bn(Vp.pv.total) + "). Its first window gets its share of the budget and cuts CO₂ to " + fix(Vm.co2[0], 0) + " Mt in 2030 (perfect foresight: " + fix(Vp.co2[0], 0) + " Mt)" +
      (Math.abs(em - ep) > 0.05 ? "; it retires " + fix(em, 1) + " GW of fossil plants early (perfect foresight: " + fix(ep, 1) + " GW)" : "") + ".";
  }
  function shockWords(X, V) {
    var y = V.Y.indexOf(X.year);
    return X.label + " in " + X.year + ": the re-planned pathway costs " + bn(Math.abs(X.dPV)) + (X.dPV >= 0 ? " more" : " less") + "; CO₂ in " + X.year + " " + fix(X.co2[y], 0) + " Mt (plan " + fix(V.co2[y], 0) + "); imports " + pct(X.imp[y]) + " (plan " + pct(V.imp[y]) + ")" +
      (X.reserveShort[y] > 0.5 ? "; short at a stress hour by " + kilo(X.reserveShort[y]) + " MW" : "") + (X.over > 0.5 ? "; " + kilo(X.over) + " Mt over the budget" : "; still within the budget") + ".";
  }
  function fullWords(e, n) {
    var bad = e.full.filter(function (c) { return c.unservedMWh >= 0.5 || Math.abs(c.gap) > 0.1; }), badN = n.full.filter(function (c) { return c.unservedMWh >= 0.5; });
    return "With the peak-hour rule, " + (bad.length ? bad.length + " of 4 checks fail" : "all four checks survive: nothing unserved, CO₂ within " + pct(Math.max.apply(null, e.full.map(function (c) { return Math.abs(c.gap); })), 1) + " of the slices") +
      ". Without it, " + badN.length + " of 4 leave demand unserved, up to " + kilo(Math.max.apply(null, n.full.map(function (c) { return c.unservedHours; }))) + " hours in a year: the twelve-hour slices hid the evening peaks.";
  }
  function nearWords(r, label) {
    return "Plans within a millionth of the least cost ($" + fix(r.slack, 1) + " million of $" + fix(r.objective / 1000, 0) + " billion) build between " + fix(r.lo / 1000, 2) + " and " + fix(r.hi / 1000, 2) + " GW of " + label + "; the plan shown builds " + fix(r.at / 1000, 2) + " GW.";
  }
  var NEAR = { solar: { t: "solar", q: 4, label: "solar in 2050" }, gasCC: { t: "gasCC", q: 4, label: "gas combined cycle in 2050" }, wind: { t: "wind", q: 3, label: "wind in 2045" } };
  var page = { TECH: TECH, NEAR: NEAR, vintage: vintage, vintageWords: vintageWords, carbonPath: carbonPath, runWords: runWords, sweepWords: sweepWords, remains: remains, deepWords: deepWords,
    foresightWords: foresightWords, shockWords: shockWords, fullWords: fullWords, nearWords: nearWords, kilo: kilo, fix: fix, pct: pct, bn: bn };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E4) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E4 = LX.E4, U = E4.ui;
  LX.mount("m13", function (live, data, root) {
    var P = E4.prepare(data.prairieland, data.e4_pathways), S = E4.schema(P), DEF = E4.defaults(S), LIB = data.e4_library, rate = DEF.dr / 100;
    var PRE = function (id) { return E4.withPreset(DEF, E4.presetsOf(P).filter(function (p) { return p.id === id; })[0]); };
    var DEEP = PRE("deep"), B = P.PL.carbon.budget, LINE = B.presets.filter(function (x) { return x.key === "line2050"; })[0];
    var lib = function (preset, fs) { for (var i = 0; i < LIB.plans.length; i++) if (LIB.plans[i].preset === preset && (!fs || LIB.plans[i].foresight === fs)) return LIB.plans[i]; return null; };
    var S0 = { V: null, Vm: null, sweep: [], X: null, near: null, runners: {} }, stub = null;
    function solver() { if (!stub) return null; stub = null; return function () { return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" }); }; }
    function kpi(host, label, value, tone) { var d = H("div", { class: "lx-readout " + (tone || "") }, host); H("span", { text: label }, d); H("b", { text: value }, d); }
    H("p", { class: "lx-hint e4-line", text: P.line }, live);
    function runBox(act, api, label, state, solve, render) {
      var kp = H("div", { class: "lx-readouts" }), res = H("div", { class: "m13-res" }), stale = H("p", null);
      var run = LX.BenchRun(act, { label: label, busy: api.busy, results: [kp, res], stale: stale, state: state, solve: solve, render: function (R, st) { kp.innerHTML = ""; res.innerHTML = ""; render(R, st, kp, res); } });
      act.appendChild(stale); act.appendChild(kp); act.appendChild(res);
      return run;
    }
    var live1 = function (st, ctx) { return E4.solve(st, P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); };
    var steps = [
      // 1 the scene and a prediction
      { text: "Prairieland: five regions, oil through one strait, coal from Ridge County. A [[carbon-budget|cumulative budget]] of " + kilo(LINE.mt) + " Mt is a straight line from 2025's CO₂ to zero in 2050. Predict: can any pathway meet it?",
        build: function (act, api) {
          var c = H("div", { class: "lx-xcard m13-map" }, act); U.Map(c, P, { p: 0 }).set(lib("central", "perfect").view, 0);
          LX.Predict(act, { id: "m13-reach", q: "With the most electrification the data allows…", options: [{ value: "easy", label: "yes, cheaply: power is easy to clean" }, { value: "dear", label: "yes, but only at a high carbon value" }, { value: "no", label: "no: some fuel use is out of the model's reach" }],
            answer: "no", onPick: function () { api.done(); api.saw("Kept. Step 7 runs it."); } });
        } },
      // 2 vintages and residual value
      { text: "Each plant is a [[vintage|vintage]]: it runs in its model year and the later ones its life covers. Plants built late keep a [[residual-value|residual value]] after 2050, which the model does not charge.",
        build: function (act, api) {
          var tech = "wind", q = 3, host = H("div", { class: "m13-vin" });
          U.seg(act, "Technology", Object.keys(TECH), TECH, tech, function (v) { tech = v; draw(); });
          U.yearPick(act, P.Y, q, function (i) { q = i; draw(); });
          act.appendChild(host);
          function draw() {
            var v = vintage(P, tech, q, rate); host.innerHTML = "";
            var strip = H("div", { class: "m13-strip", role: "img", "aria-label": "Model years it runs: " + P.Y.filter(function (y, p) { return v.runs[p]; }).join(", ") }, host);
            P.Y.forEach(function (y, p) { H("span", { class: v.runs[p] ? "on" : "", text: String(y) }, strip); });
            api.done(); api.saw(vintageWords(v) + " Payments at the " + DEF.dr + "% [[discount-rate|discount rate]].");
          }
          draw();
        } },
      // 3 time slices
      { text: "Each model year is twelve [[time-slice|time slices]] of 2025's weather: day and night of each season, the peak net-load day and the scarce-wind week. Weights are hours; they add to 8,760.",
        build: function (act, api) {
          U.table(act, ["Slice", "Hours", "Demand ÷ average", "Wind, Plains, per MW", "Solar, Coast, per MW"], P.S.map(function (s) { return [s.label, kilo(s.h), fix(s.demand, 2), fix(s.wind[2], 2), fix(s.solar[4], 2)]; }), "m13-slices");
          U.keys(act, [["Batteries", "a season's day and night form one day; the store cycles within it (state at 08:00 and 20:00 within 0 and 4 hours × power)."],
            ["The week", "the scarce-wind week's store may enter full and run down over its seven days, with no refill from other seasons."],
            ["Stress hours", P.cfg.stress.map(function (h) { return h.label; }).join(" and ") + ": the peak-hour rule checks them."]]);
          api.done(); api.saw("Load, wind, sun and hydro all come from 2025, so their correlation survives; outages stay out of the LP.");
        } },
      // 4 the model in four parts
      { text: "The [[linear-program|linear program]] in four parts. Count it: how many decisions and rules for five regions, five model years and twelve slices?",
        build: function (act, api) {
          LX.FormulateBox(act, { parts: [{ k: "Decisions", color: "var(--lx-tier-2)", text: "MW built per region, technology and model year; MW kept open of each fossil unit; links widened; every plant's output, battery and flow in every slice; fuels bought." },
            { k: "Goal", color: "var(--lx-good)", text: "Least present value 2026–2050: payments for the years each plant runs to 2050, fixed and variable O&M, fuels." },
            { k: "Rules", color: "var(--lx-warn)", text: "Balance per region-slice; capacity by vintage; stores; links; Σ w·CO₂ ≤ budget; imports ≤ cap × primary energy; stress hours." },
            { k: "Given", color: "var(--lx-ink-3)", text: "Electrification and demand (the plan), costs and fuels (fixed ranges), 2025's fleet and retirement years, the slices." }] });
          var b = H("button", { type: "button", class: "lx-btn small ghost", text: "Count the model" }, act), kp = H("div", { class: "lx-readouts" }, act);
          b.addEventListener("click", function () {
            var m = E4.build(P, E4.sysOf(DEF, P));
            kp.innerHTML = ""; kpi(kp, "Decisions", kilo(m.variables.length)); kpi(kp, "Rules", kilo(m.constraints.length)); kpi(kp, "Whole numbers", "0");
            api.done(); api.saw("One LP: " + kilo(m.variables.length) + " decisions and " + kilo(m.constraints.length) + " rules. No whole numbers, so every rule has a [[shadow-price|dual]].");
          });
        } },
      // 5 solve the central pathway
      { text: "Solve the central plan: electricity's 2050 shares of useful energy (buildings " + DEF.eb + "%, transport " + DEF.et + "%, industry " + DEF.ei + "%), a " + kilo(DEF.bud) + " Mt budget and imports at most " + DEF.cap + "% of primary energy.",
        build: function (act, api) {
          var run = runBox(act, api, "Solve the central pathway", function () { return DEF; }, live1, function (r, st, kp, res) {
            var V = E4.view(r.plan, P); S0.V = V;
            kpi(kp, "Cost to 2050", bn(V.pv.total)); kpi(kp, "CO₂ 2026–2050", kilo(V.cum) + " Mt", V.over > 0.5 ? "bad" : "good"); kpi(kp, "Imports, highest", pct(Math.max.apply(null, V.imp)));
            U.MixChart(H("div", { class: "lx-xcard" }, res), P).set(V);
            api.done(); api.saw(runWords(V)); refresh();
          });
          S0.runners.central = function () { run.run(DEF); };
        } },
      // 6 the budget's dual
      { text: "The budget row's [[shadow-price|dual]] is what one more tonne allowed would save, in 2025's present value. As a carbon price in year t it is that × (1 + rate)^(t − 2025). Move the budget and run again.",
        build: function (act, api) {
          var bud = 3000;
          LX.Slider(act, { label: "Budget, 2026–2050", color: "var(--lx-bad)", min: 2600, max: 5400, step: 200, value: bud, fmt: function (v) { return kilo(v) + " Mt"; }, onChange: function (v) { bud = v; run.changed({ bud: v }); } });
          var tb = H("div", null);
          var run = runBox(act, api, "Run this budget", function () { return Object.assign({}, DEF, { bud: bud }); }, live1, function (r, st, kp, res) {
            var V = E4.view(r.plan, P), d = V.carbonValue[0];
            S0.sweep = S0.sweep.filter(function (x) { return x.budget !== st.bud; }).concat([{ budget: st.bud, pv: V.pv.total, cum: V.cum, over: V.over, dual: d }]).sort(function (a, b) { return b.budget - a.budget; });
            kpi(kp, "The dual", "$" + fix(d, 0) + " a tonne", d >= 999 ? "bad" : ""); kpi(kp, "Cost to 2050", bn(V.pv.total));
            var cp = carbonPath(d, rate, P.Y);
            U.table(res, ["Model year"].concat(P.Y.map(String)), [["Carbon value, $ a tonne (that year's dollars)"].concat(cp.map(function (x) { return "$" + fix(x, 0); }))], "m13-cv");
            tb.innerHTML = ""; U.table(tb, ["Budget", "Cost to 2050", "CO₂ 2026–2050", "The dual, $/t (present value)"], S0.sweep.map(function (x) { return [kilo(x.budget) + " Mt", bn(x.pv), kilo(x.cum) + " Mt" + (x.over > 0.5 ? " (over)" : ""), "$" + fix(x.dual, 0)]; }), "m13-sweep");
            api.done(); api.saw(sweepWords(S0.sweep)); refresh();
          });
          act.appendChild(tb);
          U.keys(act, [["Rising at the rate", "a tonne cut later is worth as much, in present value, as one cut now: Hotelling's rule for a cumulative cap."]]);
          S0.runners.sweep = function () { run.run(Object.assign({}, DEF, { bud: bud })); };
        } },
      // 7 the straight line to zero
      { text: "Now the most electrification the data allows (buildings " + DEEP.eb + "%, transport " + DEEP.et + "%, industry " + DEEP.ei + "% of useful energy by 2050) and the " + kilo(LINE.mt) + " Mt straight line to zero. Run it.",
        build: function (act, api) {
          var st0 = Object.assign({}, DEEP, { bud: LINE.mt });
          var run = runBox(act, api, "Run the straight line to zero", function () { return st0; }, live1, function (r, st, kp, res) {
            var V = E4.view(r.plan, P), Sx = E4.sysOf(st, P);
            kpi(kp, "CO₂ 2026–2050", kilo(V.cum) + " Mt", "bad"); kpi(kp, "Over the budget", kilo(V.over) + " Mt", "bad");
            var f = remains(Sx);
            U.table(res, ["Fuel burned outside power in 2050", "PJ"], [["Oil products (vehicles, farms, industry)", kilo(f.oil)], ["Gas (industry, a little transport)", kilo(f.gas)], ["Coal (industry)", kilo(f.coal)]], "m13-remain");
            api.done(); api.saw(deepWords(V, Sx, LINE.mt) + " Your prediction is in step 1.");
          });
          U.keys(act, [["What is missing", "clean fuels for the oil and gas that stay, and deeper electrification of industrial heat: the model leaves them out, so the budget is out of its reach."]]);
          S0.runners.deep = function () { run.run(st0); };
        } },
      // 8 foresight
      { text: "Real planners do not see 2050. Decade by decade, the model sees only 2030–2035, then 2040–2045, then 2050; each window gets its share of the budget left. Compare with perfect foresight.",
        build: function (act, api) {
          var run = runBox(act, api, "Run decade by decade", function () { return Object.assign({}, DEF, { fs: "myopic" }); }, live1, function (r, st, kp, res) {
            var Vm = E4.view(r.plan, P), Vp = S0.V || lib("central", "perfect").view; S0.Vm = Vm;
            kpi(kp, "Extra cost", bn(Vm.pv.total - Vp.pv.total), Vm.pv.total > Vp.pv.total + 1 ? "warn" : "");
            U.Co2Chart(H("div", { class: "lx-xcard" }, res), P).set(Vp, Vm, "Decade by decade");
            api.done(); api.saw(foresightWords(Vp, Vm)); refresh();
          });
          U.keys(act, [["Why it costs more", "perfect foresight could have chosen the decade-by-decade pathway; it found a cheaper one. The gap is the value of seeing ahead, in this model."]]);
          S0.runners.myopic = function () { run.run(Object.assign({}, DEF, { fs: "myopic" })); };
        } },
      // 9 a shock
      { text: "Inject a shock: the plan's builds up to the shock's year stay; that year runs what was built; later years re-plan knowing it. Pick one.",
        build: function (act, api) {
          var keys = E4.c4Shocks(P), sh = "demandSurprise", names = {}; keys.forEach(function (k) { names[k] = P.shocks[k].label; });
          U.seg(act, "Shock", keys, names, sh, function (v) { sh = v; run.changed({ sh: v }); });
          var run = runBox(act, api, "Run the plan and the re-plan", function () { return Object.assign({}, DEF, { sh: sh }); }, live1, function (r, st, kp, res) {
            var V = E4.view(r.plan, P), X = E4.shockView(r.shock, V, P); S0.X = X;
            kpi(kp, "Extra cost", bn(X.dPV), X.dPV > 1 ? "warn" : ""); kpi(kp, "CO₂ 2026–2050", kilo(X.cum) + " Mt", X.over > 0.5 ? "bad" : "good");
            U.ImportChart(H("div", { class: "lx-xcard" }, res), P).set(V, X, "After the shock");
            api.done(); api.saw(shockWords(X, V));
          });
          S0.runners.shock = function () { run.run(Object.assign({}, DEF, { sh: sh })); };
        } },
      // 10 slices against full years
      { text: "Do the conclusions survive a full year of hours? The plan's 2030 and 2050 capacities, run hour by hour over 2025's weather and over 2024's, week by week.",
        build: function (act, api) {
          var e = lib("central", "perfect"), n = lib("central-norule", "perfect");
          var fr = function (F) { return F.map(function (c) { var ok = c.unservedMWh < 0.5 && Math.abs(c.gap) <= 0.1; return [c.year + ", " + c.weather + " weather", kilo(c.unservedHours) + " h", fix(c.co2, 1) + " Mt (" + (c.gap >= 0 ? "+" : "") + pct(c.gap, 1) + ")", fix(c.curtailTWh, 1) + " TWh (slices " + fix(c.curtailSlices, 1) + ")", ok ? "survives" : "does not survive"]; }); };
          var h = ["Check", "Hours not served", "CO₂ against the slices", "Wind and solar spilled", "Verdict"];
          H("h4", { text: "The central plan, with the peak-hour rule" }, act); U.table(act, h, fr(e.full), "m13-full");
          H("h4", { text: "The same plan without the rule" }, act); U.table(act, h, fr(n.full), "m13-full");
          U.keys(act, [["From the library", "precomputed with this engine on " + LIB.date + ": 53 LPs a check, too slow for a click."], ["What moves", "spilled wind and solar is several times the slices' estimate: twelve-hour averages smooth the sunniest and windiest hours."]]);
          api.done(); api.saw(fullWords(e, n));
        } },
      // 11 near-optimal plans (precomputed: three LPs a choice are too slow for a phone click)
      { text: "Many plans cost almost the same. Over every plan within a millionth of the least cost, how little and how much of each choice could be built? Two more LPs a choice.",
        build: function (act, api) {
          var NR = P.cfg.precomputed && P.cfg.precomputed.m13near;
          if (!NR) { H("p", { class: "lx-hint", text: "The ranges are not in this page's data." }, act); return; }
          U.table(act, ["Choice", "Least", "The plan shown", "Most"], Object.keys(NEAR).map(function (k) { var r = NR.items[k]; return [NEAR[k].label, fix(r.lo / 1000, 2) + " GW", fix(r.at / 1000, 2) + " GW", fix(r.hi / 1000, 2) + " GW"]; }), "m13-near");
          U.keys(act, [["Precomputed", "with this engine on " + NR.date + " for the central plan: six more LPs, too slow for a phone click."], ["Report", "what every near-optimal plan shares, or say which one you show; the notebook's practice task 4 runs it."]]);
          S0.near = NR;
          api.done(); api.saw(nearWords(NR.items.solar, NEAR.solar.label) + " Report what every near-optimal plan shares, or say which one you show.");
        } }];
    var cards = LX.StepCards(live, { steps: steps });

    // ---- explain: the equation card, the flowchart of a run, a comparison
    var x = document.getElementById("m13-explain");
    function refresh() {
      x.innerHTML = "";
      var sym = LX.EquationCard.sym, V = S0.V, sw = S0.sweep;
      LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
        title: "The pathway's linear program, symbol by symbol", lede: "Tap a symbol: what it means, its unit and, once you have run it, its value. Regions r (5), model years p (5), slices s (12), technologies g.", dense: true, label: "The pathway's linear program; each symbol is a button",
        fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
        rows: [
          { html: "min Σ<sub><var>p</var></sub> " + sym("D", "<var>D</var><sub><var>p</var></sub>") + " (fuels + O&amp;M)<sub><var>p</var></sub> + Σ<sub><var>q</var>,<var>g</var></sub> " + sym("A", "<var>A</var><sub><var>g</var></sub>") + " Σ<sub><var>p</var> ≥ <var>q</var>, ≤ 2050</sub> <var>D</var><sub><var>p</var></sub> " + sym("n", "<var>n</var><sub><var>g</var>,<var>q</var></sub>"), tag: "goal", say: "Minimise the present value: each model year's fuels and O&M, discounted over its five years, plus each plant's yearly payment for the model years it runs up to 2050." },
          { html: "Σ<sub><var>g</var></sub> " + sym("x", "<var>x</var><sub><var>g</var>,<var>r</var>,<var>s</var>,<var>p</var></sub>") + " + inflows − outflows = " + sym("L", "<var>L</var><sub><var>r</var>,<var>p</var></sub>") + " · " + sym("d", "<var>d</var><sub><var>s</var></sub>"), tag: "balance", say: "Each region-slice: output plus net imports from the links meets the load." },
          { html: "<var>x</var><sub><var>g</var>,<var>r</var>,<var>s</var>,<var>p</var></sub> ≤ " + sym("a", "<var>a</var><sub><var>g</var>,<var>s</var></sub>") + " (existing + Σ<sub><var>q</var>: vintage covers <var>p</var></sub> <var>n</var><sub><var>g</var>,<var>q</var></sub>)", tag: "capacity by vintage", say: "Output within availability (wind and solar: the slice's output) times what is open: existing plants not yet retired plus new builds whose life covers that year." },
          { html: "Σ<sub><var>p</var></sub> " + sym("w", "<var>w</var><sub><var>p</var></sub>") + " " + sym("E", "CO₂<sub><var>p</var></sub>") + " + <var>w</var><sub>2025</sub> · 214.9 ≤ " + sym("B", "<var>B</var>"), tag: "budget", say: "The cumulative budget, built from each model year's emissions with its weight." },
          { html: sym("I", "<var>imp</var><sub><var>p</var></sub>") + " ≤ " + sym("c", "<var>cap</var>") + " · " + sym("Pr", "<var>prim</var><sub><var>p</var></sub>"), tag: "import cap", say: "Crude imports and LNG at most the cap's share of primary energy, every model year." }],
        symbols: {
          D: { name: "D_p", label: "D p, a model year's discount sum", unit: "years", words: "The discount factors of the five years a model year stands for (2026–2030 for 2030), at the plan's rate.", you: E4.sysOf(DEF, P).D.map(function (v) { return fix(v, 2); }).join(", "), code: "S.D[p]" },
          A: { name: "A_g", label: "A g, a plant's yearly payment", unit: "$ per kW a year", words: "Capital × the capital recovery factor over its life, plus fixed O&M; the same in every period (G-COST).", you: "Wind $" + fix(DEF.cw * E4.crf(rate, P.tech.wind.life) + P.tech.wind.fom, 0) + " per kW a year.", code: "capex * crf(rate, life) + fom" },
          n: { name: "n_g,q", label: "n g q, MW built", unit: "MW", words: "Built in model year q, by region (the firm option: nationally, shared by demand).", you: V ? "Central: wind " + fix(sum(V.built.wind), 1) + " GW in all." : "Run step 5.", code: '"n_" + r + g + q' },
          x: { name: "x", label: "x, output in a slice", unit: "MW (average over the slice)", words: "A plant's output, a battery's or a flow, as a slice's average.", you: "12 slices × 5 regions × 5 years.", code: '"g_" + unit + "_" + s + "_" + p' },
          L: { name: "L_r,p", label: "L r p, average load", unit: "MW", words: "The region's electricity at the busbar that year (with grid losses, 6%), from the plan's electrification and demand.", you: P.R.map(function (R, r) { return R.short + " " + kilo(E4.sysOf(DEF, P).loadMW[0][r]); }).join("; ") + " MW in 2030", code: "S.loadMW[p][r]" },
          d: { name: "d_s", label: "d s, the slice's demand factor", unit: "÷ the year's average", words: "SPP's 2025 shape over the slice's hours.", you: P.S.map(function (s) { return fix(s.demand, 2); }).join(", "), code: "P.S[s].demand" },
          a: { name: "a_g,s", label: "a g s, availability", unit: "share", words: "Fossil plants' availability (outages stand-in); wind and solar the slice's output per MW.", you: "Coal " + P.cfg.existing.availability.coal + ", combined cycle " + P.cfg.existing.availability.gasCC, code: "cfg.existing.availability" },
          w: { name: "w_p", label: "w p, the budget's weight", unit: "years", words: "Straight lines between model years: 2025 counts 2, 2030–2045 count 5, 2050 counts 3 (25 in all).", you: E4.sysOf(DEF, P).w.join(", "), code: "S.w[p]" },
          E: { name: "CO2_p", label: "CO2 p, a model year's emissions", unit: "Mt a year", words: "Fuels burned × the IPCC's factors (crude 73.3, gas 56.1, coal 94.6 t per TJ).", you: V ? V.co2.map(function (c) { return fix(c, 0); }).join(", ") + " Mt" : "Run step 5.", code: "m.meta.CO2[p]" },
          B: { name: "B", label: "B, the budget", unit: "Mt, 2026–2050", words: "A learner choice; its dual is the value of one more tonne.", you: sw.length ? sw.map(function (z) { return kilo(z.budget) + " Mt: $" + fix(z.dual, 0); }).join("; ") : "Run step 6.", code: "state.bud" },
          I: { name: "imp_p", label: "imp p, imports", unit: "PJ a year", words: "Crude imports (all through the strait) and LNG.", you: V ? V.imp.map(function (s) { return pct(s); }).join(", ") + " of primary energy" : "Run step 5.", code: "m.meta.IMP[p]" },
          c: { name: "cap", label: "cap, the import cap", unit: "share", words: "At most this share of primary energy in every model year.", you: DEF.cap + "%", code: "state.cap / 100" },
          Pr: { name: "prim_p", label: "prim p, primary energy", unit: "PJ a year", words: "Physical energy content: fuels as burned; existing nuclear plants count their heat; hydro, wind, solar and the generic firm option count their electricity.", you: V ? kilo(V.primary[0]) + " PJ in 2030" : "Run step 5.", code: "m.meta.PRIM[p]" } } });
      LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
        title: "Two ways to see the future, and two ways to count time", lede: "The same rules; what the model sees changes.", text: true,
        columns: [{ key: "name", label: "", main: true }, { key: "a", label: "Perfect foresight" }, { key: "b", label: "Decade by decade" }],
        rows: [{ key: "sees", name: "Sees", a: { text: "2030–2050 at once" }, b: { text: "two model years at a time" } },
          { key: "budget", name: "The budget", a: { text: "one constraint over 25 years" }, b: { text: "each window gets its share of what is left" } },
          { key: "cost", name: "Cost", a: { text: S0.V ? bn(S0.V.pv.total) : "run step 5" }, b: { text: S0.Vm ? bn(S0.Vm.pv.total) : "run step 8" } },
          { key: "time", name: "Time", a: { text: "12 slices a year; a full year of hours only in the check" }, b: { text: "the same slices" } }],
        sorts: [{ label: "As listed", order: ["sees", "budget", "cost", "time"] }] });
    }
    refresh();

    // ---- demo states: mid (step 5 run), step-8, fail
    LX.demo(root, function (s) {
      if (s === "mid") { cards.go(4); S0.runners.central(); return { view: "mid" }; }
      if (s === "step-8") { cards.go(7); S0.runners.myopic(); return { view: "mid" }; }
      if (s === "step-11") { cards.go(10); return { view: "mid" }; }
      if (s === "fail") { cards.go(4); stub = "fail"; S0.runners.central(); return { view: "mid" }; }
      return null;
    }, cards);
  });
})();
