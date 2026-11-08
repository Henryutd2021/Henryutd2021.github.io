// m13-national-pathway.js — M13, "Build a nation's pathway: a multi-region, multi-decade model" (Modeler, model-lab in
// the cards form), on engine E4 (assets/learn/components/engine-e4.js, LX.E4, in the bundle; the
// Pathway Explorer SB4 and capstone C4 run the same model). Data: prairieland.json, e4-pathways.json, e4-library.json.
//
// Steps: predict whether the budget of a straight-line decline to zero is in reach; vintages and residual value; the twelve slices and their
// chronology; the model in four parts; solve the central pathway; the budget's dual as a carbon value and a budget sweep;
// that straight-line budget (out of reach, and why); perfect foresight against decade by decade; a shock and the re-plan;
// slices against full years of hours (from the library: about a minute a check); near-optimal plans (live, eight LPs).
// Then the explain layer (the equation card,
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
  // the budget missed or met: the engine's flag (E4.missB, cumText, overText), never a rounded overshoot (0.4 Mt over is
  // over); kept here so that the words work in Node too
  function missB(V) { return V.missBudget != null ? V.missBudget : V.over > 0.5; }
  function cumOf(V) { return missB(V) && V.over1 != null && V.over1 < 10 ? fix(V.cum1, 1) : kilo(V.cum); }
  function overOf(V) { var o = V.over1 != null ? V.over1 : V.over; return o >= 0.05 ? (o < 10 ? fix(o, 1) : kilo(V.over)) + " Mt" : "under 0.1 Mt"; }
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
    return "A " + TECH[v.tech].toLowerCase() + " built in the model year " + v.built + " runs " + v.first + "–" + v.last + ". The model charges " + v.years + " of its " + v.life + " years, to 2050" +
      (v.residual > 0.0005 ? "; the other " + (v.life - v.years) + " are its residual value, " + pct(v.residual) + " of its payments' present value." : ": its whole life fits before 2050, so no residual value.");
  }
  // the budget's value as a price in each model year's own 2025 dollars, from the LP's coefficients: the budget row counts
  // that year's CO2 w_p times, the goal its yearly costs D_p times (never the endpoint formula)
  function carbonPath(dual, w, D) { return w.map(function (x, p) { return dual == null ? null : dual * x / D[p]; }); }
  // the same tonne in a model of every year, each counted once: Hotelling's rule, rising at the discount rate (for comparison)
  function hotelling(dual, rate, Y) { return Y.map(function (y) { return dual == null ? null : dual * Math.pow(1 + rate, y - 2025); }); }
  function runWords(V) {
    var b = function (t) { return fix(sum(V.built[t]), 1); };
    return "The cheapest central pathway: " + bn(V.pv.total) + " (present value in 2025), " + kilo(V.cum) + " of " + kilo(V.budget) + " Mt. It builds " + b("wind") + " GW of wind, " + b("solar") +
      " GW of solar and " + fix(sum(V.built.gasCC) + sum(V.built.gasCT), 1) + " GW of gas; imports peak at " + pct(Math.max.apply(null, V.imp)) + ".";
  }
  function dualText(d) { return d == null ? "none (out of reach)" : "$" + fix(d, 0); }
  function sweepWords(rows) {
    var r = rows.slice().sort(function (a, b) { return b.budget - a.budget; }), inR = r.filter(function (x) { return !missB(x); }), out = r.filter(function (x) { return missB(x); });
    if (r.length < 2 && !out.length) return "Run another budget to compare.";
    var s = inR.length >= 2 ? "From " + kilo(inR[0].budget) + " to " + kilo(inR[inR.length - 1].budget) + " Mt the cost rises from " + bn(inR[0].pv) + " to " + bn(inR[inR.length - 1].pv) + " and the dual from " + dualText(inR[0].dual) + " to " + dualText(inR[inR.length - 1].dual) + " a tonne." : "";
    if (out.length) s += (s ? " " : "") + kilo(out[0].budget) + " Mt is out of reach with these levers: no pathway emits less than " + cumOf(out[0]) + " Mt, so the budget has no marginal value.";
    return s;
  }
  // what fuel use stays in 2050 at the most electrification (PJ), from the engine's demand
  function remains(S) { var f = S.fuel[S.fuel.length - 1]; return { oil: f.oil, gas: f.gas, coal: f.coal }; }
  function deepWords(V, B) {
    return "At the most electrification the data allows, no pathway emits less than " + cumOf(V) + " Mt: " + overOf(V) + " over the " + kilo(B) + " Mt budget.";
  }
  // the fuel still burned outside power in 2050, the table beside those words: [label, PJ]
  function remainRows(S) { var r = remains(S); return [["Oil products (vehicles, farms, industry)", kilo(r.oil)], ["Gas (industry, a little transport)", kilo(r.gas)], ["Coal (industry)", kilo(r.coal)]]; }
  // capacity retired early in a model year is a state (what is shut that year), so it is reported for one year, never summed
  function foresightWords(Vp, Vm) {
    var d = Vm.pv.total - Vp.pv.total;
    return "Decade by decade costs " + bn(d) + " more (" + bn(Vm.pv.total) + "). Its first window cuts 2030's CO₂ to " + fix(Vm.co2[0], 0) + " Mt (perfect foresight: " + fix(Vp.co2[0], 0) + " Mt)" +
      (Math.abs(Vm.early[0] - Vp.early[0]) > 0.05 ? ", with " + fix(Vm.early[0], 1) + " GW of fossil plants retired early by 2030 (" + fix(Vp.early[0], 1) + " GW)" : "") + ".";
  }
  // the peak-hour rule's requirement in words: each region's stress-hour load, plus the rule's margin
  function ruleNeed(m) { return m ? "load + " + pct(m) : "the load itself"; }
  function shockWords(X, V) {
    var y = V.Y.indexOf(X.year);
    return X.label + " in " + X.year + ": the re-planned pathway costs " + bn(Math.abs(X.dPV)) + (X.dPV >= 0 ? " more" : " less") + "; CO₂ in " + X.year + " " + fix(X.co2[y], 0) + " Mt (plan " + fix(V.co2[y], 0) + "); imports " + pct(X.imp[y]) + " (plan " + pct(V.imp[y]) + ")" +
      (X.rule === null ? "; stress hours not tested" : X.reserveShort[y] > 0.5 ? "; " + kilo(X.reserveShort[y]) + " MW short of the peak-hour rule (" + ruleNeed(X.rule) + ") at its worse stress hour" : "") + (missB(X) ? "; " + overOf(X) + " over the budget" : "; still within the budget") + ".";
  }
  // the full-year words: the two criteria named (E4.fullVerdict), and what the check does not show
  function fullWords(e, n, E4) {
    var bad = e.full.filter(function (c) { return !E4.fullVerdict(c).ok; }), badN = n.full.filter(function (c) { return !E4.fullVerdict(c).served; });
    return "With the peak-hour rule, " + (bad.length ? bad.length + " of 4 checks fail" : "all four checks pass both tests: nothing unserved, CO₂ within " + pct(Math.max.apply(null, e.full.map(function (c) { return Math.abs(c.gap); })), 1) + " of the slices") +
      ". Without it, " + badN.length + " of 4 leave demand unserved, up to " + kilo(Math.max.apply(null, n.full.map(function (c) { return c.unservedHours; }))) + " hours in a year.";
  }
  function nearWords(r, label) {
    return "Plans within a millionth of the least cost ($" + fix(r.slack, 1) + " million of $" + fix(r.objective / 1000, 0) + " billion) build " + fix(r.lo / 1000, 2) + " to " + fix(r.hi / 1000, 2) + " GW of " + label + "; the plan shown, " + fix(r.at / 1000, 2) + " GW.";
  }
  // near-optimal choices: one build cohort each (what is built in that model year's five years), not the capacity open
  // the near-optimal click's usual time, seconds: the solver bench at 6x CPU slowdown (a phone stand-in), 8 November 2026
  var NEAR_USUAL = 7;
  var NEAR = { solar: { t: "solar", q: 4, label: "new solar in 2046–2050" }, gasCC: { t: "gasCC", q: 4, label: "new gas combined cycle in 2046–2050" }, wind: { t: "wind", q: 3, label: "new wind in 2041–2045" } };
  var page = { TECH: TECH, NEAR: NEAR, vintage: vintage, vintageWords: vintageWords, carbonPath: carbonPath, hotelling: hotelling, runWords: runWords, sweepWords: sweepWords, dualText: dualText, remains: remains, deepWords: deepWords, remainRows: remainRows, ruleNeed: ruleNeed,
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
    function runBox(act, api, label, state, solve, render, progress) {
      var kp = H("div", { class: "lx-readouts" }), res = H("div", { class: "m13-res" }), stale = H("p", null);
      var run = LX.BenchRun(act, { label: label, busy: api.busy, results: [kp, res], stale: stale, state: state, solve: solve, progress: progress, render: function (R, st) { kp.innerHTML = ""; res.innerHTML = ""; render(R, st, kp, res); } });
      act.appendChild(stale); act.appendChild(kp); act.appendChild(res);
      return run;
    }
    var live1 = function (st, ctx) { return E4.solve(st, P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); };
    var steps = [
      // 1 the scene and a prediction
      { text: "Prairieland: five regions; oil and [[lng|liquefied natural gas (LNG)]] arrive through one strait. A [[carbon-budget|cumulative budget]] of " + kilo(LINE.mt) + " Mt equals a straight-line decline from 2025's CO₂ to zero in 2050. Predict: can any pathway meet it?",
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
          U.keys(act, [["Generic firm clean plant", "low-emission output that can be counted on whatever the weather ([[firm-capacity|firm]]); the model names no technology."]]);
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
      { text: "Each model year is twelve [[time-slice|time slices]] of 2025's weather: day and night of each season, the day of the highest net load (demand less wind and solar) and the scarce-wind week. Weights are hours: 8,760.",
        build: function (act, api) {
          U.table(act, ["Slice", "Hours", "Demand ÷ average", "Wind, Plains, per MW", "Solar, Coast, per MW"], P.S.map(function (s) { return [s.label, kilo(s.h), fix(s.demand, 2), fix(s.wind[2], 2), fix(s.solar[4], 2)]; }), "m13-slices");
          U.keys(act, [["Batteries", "a season's day and night form one day; the store cycles within it (state at 08:00 and 20:00 within 0 and 4 hours × power)."],
            ["The week", "the scarce-wind week's store may enter full and run down over its seven days; winter runs in order, its days then the week, so winter's days pay back what the week draws."],
            ["Stress hours", P.cfg.stress.map(function (h) { return h.label; }).join(" and ") + ": the peak-hour rule checks them."]]);
          api.done(); api.saw("Demand, wind and solar follow 2025's hourly shapes, adapted to each region; hydro uses seasonal factors set for teaching. Outages stay out of the LP.");
        } },
      // 4 the model in four parts
      { text: "The [[linear-program|linear program]] in four parts. Count it: how many decisions and rules for five regions, five model years and twelve slices?",
        build: function (act, api) {
          LX.FormulateBox(act, { parts: [{ k: "Decisions", color: "var(--lx-tier-2)", text: "MW built per region, technology and model year; MW kept open of each fossil unit; links widened; every plant's output, battery and flow in every slice; fuels bought." },
            { k: "Goal", color: "var(--lx-good)", text: "Least present value 2026–2050: payments for the years each plant runs to 2050, fixed and variable operation and maintenance (O&M), fuels." },
            { k: "Rules", color: "var(--lx-warn)", text: "Balance per region-slice; capacity by vintage; stores; links; Σ w·CO₂ ≤ budget; imports ≤ cap × (primary energy − battery and link losses); stress hours." },
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
            kpi(kp, "Cost to 2050", bn(V.pv.total)); kpi(kp, "CO₂ 2026–2050", E4.cumText(V) + " Mt", E4.missB(V) ? "bad" : "good"); kpi(kp, "Imports, highest", pct(Math.max.apply(null, V.imp)));
            U.MixChart(H("div", { class: "lx-xcard" }, res), P).set(V);
            api.done(); api.saw(runWords(V)); refresh();
          });
          S0.runners.central = function () { run.run(DEF); };
        } },
      // 6 the budget's dual
      { text: "The budget row's [[shadow-price|dual]]: what one more tonne allowed would save, in 2025's present value. Move the budget, run it and watch the dual.",
        build: function (act, api) {
          var bud = 3000;
          LX.Slider(act, { label: "Budget, 2026–2050", color: "var(--lx-bad)", min: 2600, max: 5400, step: 200, value: bud, fmt: function (v) { return kilo(v) + " Mt"; }, onChange: function (v) { bud = v; run.changed({ bud: v }); } });
          var tb = H("div", null);
          var run = runBox(act, api, "Run this budget", function () { return Object.assign({}, DEF, { bud: bud }); }, live1, function (r, st, kp, res) {
            var V = E4.view(r.plan, P), d = V.carbonValue[0], out = E4.missB(V);
            S0.sweep = S0.sweep.filter(function (x) { return x.budget !== st.bud; }).concat([{ budget: st.bud, pv: V.pv.total, cum: V.cum, over: V.over, cum1: V.cum1, over1: V.over1, missBudget: V.missBudget, dual: d }]).sort(function (a, b) { return b.budget - a.budget; });
            kpi(kp, "CO₂ 2026–2050", E4.cumText(V) + " of " + kilo(V.budget) + " Mt", out ? "bad" : "good"); kpi(kp, "The dual", out ? "none: out of reach" : "$" + fix(d, 0) + " a tonne", out ? "bad" : ""); kpi(kp, "Cost to 2050", bn(V.pv.total));
            if (out) H("p", { class: "lx-hint", html: LX.rich("**Out of reach:** with central electrification no pathway emits less than " + E4.cumText(V) + " Mt; the run shows the closest one. " + E4.GAP[1]).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, res);
            else U.table(res, ["Model year"].concat(P.Y.map(String)), [["The LP's price, dual × w ÷ D ($ a tonne that year)"].concat(V.carbonPrice.map(function (x) { return "$" + fix(x, 0); })),
              ["Hotelling's rule in a model of every year, dual × (1 + i)^(t − 2025)"].concat(hotelling(d, rate, P.Y).map(function (x) { return "$" + fix(x, 0); }))], "m13-cv");
            tb.innerHTML = ""; U.table(tb, ["Budget", "Cost to 2050", "CO₂ 2026–2050", "The dual, $/t (present value)"], S0.sweep.map(function (x) { return [kilo(x.budget) + " Mt", bn(x.pv), E4.cumText(x) + " Mt" + (E4.missB(x) ? " (out of reach)" : ""), dualText(x.dual)]; }), "m13-sweep");
            api.done(); api.saw(sweepWords(S0.sweep)); refresh();
          });
          act.appendChild(tb);
          U.keys(act, [["A model year's price", "dual × w ÷ D: w is the years of CO₂ the budget counts for that year, D the discount factors of its five years added up."],
            ["Hotelling's rule", "under a cumulative cap a tonne cut later is worth as much, in present value, as one cut now, so its price in each year's own dollars rises at the discount rate i."],
            ["Here it bends", "straight-line counting gives 2050 three years of CO₂ (w) against five years of costs (D), so its price drops; count each model year for its five years and it rises at the rate."]]);
          S0.runners.sweep = function () { run.run(Object.assign({}, DEF, { bud: bud })); };
        } },
      // 7 the straight-line budget (a cap on the total)
      { text: "Now the most electrification the data allows (buildings " + DEEP.eb + "%, transport " + DEEP.et + "%, industry " + DEEP.ei + "% of useful energy by 2050) and the " + kilo(LINE.mt) + " Mt straight-line budget. Run it.",
        build: function (act, api) {
          var st0 = Object.assign({}, DEEP, { bud: LINE.mt });
          var run = runBox(act, api, "Run the " + kilo(LINE.mt) + " Mt budget", function () { return st0; }, live1, function (r, st, kp, res) {
            var V = E4.view(r.plan, P), Sx = E4.sysOf(st, P);
            kpi(kp, "CO₂ 2026–2050", E4.cumText(V) + " Mt", "bad"); kpi(kp, "Over the budget", E4.overText(V), "bad");
            U.table(res, ["Fuel burned outside power in 2050", "PJ"], remainRows(Sx), "m13-remain");
            api.done(); api.saw(deepWords(V, LINE.mt) + " Your prediction is in step 1.");
          });
          U.keys(act, [["Only the total", "the budget caps CO₂ summed over 2026–2050; no year, not even 2050, has to follow the line or reach zero."], ["The closest pathway", "a second LP finds the least CO₂ these levers allow, serving every slice and stress hour; a third, the least cost at that level."],
            ["What is missing", "clean fuels for the oil and gas that stay, and deeper electrification of industrial heat."], ["Against A20", E4.GAP[1]], ["Why", E4.GAP[2]]]);
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
          U.keys(act, [["Why it costs more", "perfect foresight could have chosen the decade-by-decade pathway; it found a cheaper one."], ["What the gap measures", "the extra cost of this planning rule (two model years a window, each window given its share of the budget left), not the value of foresight in general."]]);
          S0.runners.myopic = function () { run.run(Object.assign({}, DEF, { fs: "myopic" })); };
        } },
      // 9 a shock
      { text: "Inject a shock. An operating shock keeps the plan's builds through its year, which runs what was built; the mineral restriction re-plans that year's purchases at its price. Later years re-plan. Pick one.",
        build: function (act, api) {
          var keys = E4.c4Shocks(P), sh = "demandSurprise", names = {}; keys.forEach(function (k) { names[k] = P.shocks[k].label; });
          U.seg(act, "Shock", keys, names, sh, function (v) { sh = v; run.changed({ sh: v }); });
          U.table(act, ["Shock", "When, in the model", "What changes", "What the re-plan keeps"], E4.shockTable(P), "m13-shocks e4-wrap");
          var run = runBox(act, api, "Run the plan and the re-plan", function () { return Object.assign({}, DEF, { sh: sh }); }, live1, function (r, st, kp, res) {
            var V = E4.view(r.plan, P), X = E4.shockView(r.shock, V, P); S0.X = X;
            kpi(kp, "Extra cost", bn(X.dPV), X.dPV > 1 ? "warn" : ""); kpi(kp, "CO₂ 2026–2050", E4.cumText(X) + " Mt", E4.missB(X) ? "bad" : "good");
            U.ImportChart(H("div", { class: "lx-xcard" }, res), P).set(V, X, "After the shock");
            api.done(); api.saw(shockWords(X, V));
          });
          U.keys(act, [["Short of the rule", "the peak-hour rule asks for each region's " + ruleNeed(E4.sysOf(DEF, P).reserve) + " at the two stress hours; a shortfall means that margin is missed, not that demand goes unserved."]]);
          S0.runners.shock = function () { run.run(Object.assign({}, DEF, { sh: sh })); };
        } },
      // 10 slices against full years
      { text: "Do the conclusions survive a full year of hours? The plan's 2030 and 2050 capacities, run hour by hour over 2025's weather and over 2024's, week by week.",
        build: function (act, api) {
          var e = lib("central", "perfect"), n = lib("central-norule", "perfect");
          var fr = function (F) { return F.map(function (c) { return [c.year + ", " + c.weather + " weather", kilo(c.unservedHours) + " h", fix(c.co2, 1) + " Mt (" + (c.gap >= 0 ? "+" : "") + pct(c.gap, 1) + ")", fix(c.curtailTWh, 1) + " TWh (slices " + fix(c.curtailSlices, 1) + ")", E4.fullVerdict(c).text]; }); };
          var h = ["Check", "Hours not served", "CO₂ against the slices", "Wind and solar spilled", "Verdict"];
          H("h4", { text: "The central plan, with the peak-hour rule" }, act); U.table(act, h, fr(e.full), "m13-full e4-wrap");
          H("h4", { text: "A separately optimized central pathway, with the peak-hour rule off" }, act); U.table(act, h, fr(n.full), "m13-full e4-wrap");
          U.keys(act, [["Survives", "two tests: all demand served, and the year's CO₂ within 10% of the slices' (a tolerance set for teaching)."], ["Not a proof", "it checks two years' dispatch: not the cumulative budget, not adequacy (lesson A5)."],
            ["From the library", "precomputed with this engine on " + LIB.date + ": 53 LPs a check, too slow for a click."], ["What moves", "spilled wind and solar is several times the slices' estimate: twelve-hour averages smooth the sunniest and windiest hours."]]);
          api.done(); api.saw(fullWords(e, n, E4));
        } },
      // 11 near-optimal plans, solved live: the central plan's LP, then the least and the most of each choice over every
      // plan within a millionth of the least economic cost (E4.nearRanges: eight LPs in one click)
      { text: "Many plans cost almost the same. Over every plan within a millionth of the least cost, how little and how much of each choice could be built? Two more LPs a choice.",
        build: function (act, api) {
          var list = Object.keys(NEAR).map(function (k) { return [k, E4.builtTerms(P, NEAR[k].t, NEAR[k].q)]; });
          var near = function (st, ctx) {
            // the progress line counts the LPs (after LP k, LP k + 1 runs)
            return E4.nearRanges(P, st, list, 1e-6, { signal: ctx.signal, solver: solver(), onSolve: function (k, n) { if (k < n) ctx.step(k + 1, n); } }).then(function (r) {
              return r.ok ? { status: "optimal", ok: true, kind: "lp", message: "Done: the central plan's LP, its least cost without the tie rule, then the least and the most of each choice over the plans within a millionth of that cost (" + r.solves + " LPs, each optimal).", results: r }
                : { status: r.status, ok: false, kind: "lp", message: E4.WORDS[r.status] || r.message };
            });
          };
          runBox(act, api, "Map the near-optimal plans", function () { return DEF; }, near, function (r, st, kp, res) {
            U.table(res, ["Choice", "Least", "The plan shown", "Most"], Object.keys(NEAR).map(function (k) { var x = r.items[k]; return [NEAR[k].label, fix(x.lo / 1000, 2) + " GW", fix(x.at / 1000, 2) + " GW", fix(x.hi / 1000, 2) + " GW"]; }), "m13-near");
            S0.near = r;
            api.done(); api.saw(nearWords(r.items.solar, NEAR.solar.label) + " Report what every near-optimal plan shares, or say which one you show.");
          }, { unit: "LP", usual: NEAR_USUAL });
          U.keys(act, [["One click", "eight LPs: the central plan, its least cost without the [[tie-rule|tie rule]] (tiny extra costs that pick one plan among equally cheap ones), then the least and the most of each of three choices."], ["Cost", "the economic cost the page reports, without the tie rule's small costs."], ["Report", "what every near-optimal plan shares, or say which one you show; the notebook's practice task 4 runs it."]]);
        } }];
    var cards = LX.StepCards(live, { steps: steps });

    // ---- explain: the equation card, the flowchart of a run, a comparison
    var x = document.getElementById("m13-explain");
    function refresh() {
      x.innerHTML = "";
      var sym = LX.EquationCard.sym, V = S0.V, sw = S0.sweep;
      LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
        title: "The pathway's linear program, symbol by symbol", hint: "Indices: regions r (5), model years p (5) in calendar years y, slices s (12), technologies g.", lede: "Selected rows, in schematic form, in millions of 2025 dollars ($M). Tap a symbol for its meaning, its unit and, after a run, its value.", dense: true, label: "The pathway's linear program; each symbol is a button",
        fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
        rows: [
          { html: "min Σ<sub><var>p</var></sub> " + sym("D", "<var>D</var><sub><var>p</var></sub>") + " (fuels + O&amp;M)<sub><var>p</var></sub> + Σ<sub><var>q</var>,<var>g</var></sub> " + sym("A", "<var>A</var><sub><var>g</var></sub>") + " ⁄ 1000 · " + sym("n", "<var>n</var><sub><var>g</var>,<var>q</var></sub>") + " Σ<sub><var>p</var> ≥ <var>q</var>, <var>y</var><sub><var>p</var></sub> − <var>y</var><sub><var>q</var></sub> &lt; life<sub><var>g</var></sub></sub> <var>D</var><sub><var>p</var></sub> + links + penalties + ties", tag: "goal", say: "In $M: fuels and O&M, each model year discounted over its five years; each plant's yearly payment in the model years its life covers, to 2050; links; penalties and ties, never reported as cost." },
          { html: "Σ<sub><var>g</var></sub> " + sym("x", "<var>x</var><sub><var>g</var>,<var>r</var>,<var>s</var>,<var>p</var></sub>") + " + discharge − charge + inflows − outflows + " + sym("u", "<var>u</var>") + " = " + sym("L", "<var>L</var><sub><var>r</var>,<var>p</var></sub>") + " · " + sym("d", "<var>d</var><sub><var>s</var></sub>"), tag: "balance", say: "Each region-slice: output, batteries, net imports over the links and any unserved energy u meet the load." },
          { html: "<var>x</var><sub><var>g</var>,<var>r</var>,<var>s</var>,<var>p</var></sub> ≤ " + sym("a", "<var>a</var><sub><var>g</var>,<var>s</var></sub>") + " (existing + Σ<sub><var>q</var>: vintage covers <var>p</var></sub> <var>n</var><sub><var>g</var>,<var>q</var></sub>)", tag: "capacity by vintage", say: "Output within availability (wind and solar: the slice's output per MW) times what is open: existing plants not yet retired plus new builds whose life covers that year." },
          { html: "Σ<sub><var>p</var></sub> " + sym("w", "<var>w</var><sub><var>p</var></sub>") + " " + sym("E", "CO₂<sub><var>p</var></sub>") + " + <var>w</var><sub>2025</sub> · 214.9 ≤ " + sym("B", "<var>B</var>"), tag: "budget", say: "The cumulative budget, built from each model year's emissions with its weight." },
          { html: sym("I", "<var>imp</var><sub><var>p</var></sub>") + " ≤ " + sym("c", "<var>cap</var>") + " · (" + sym("Pr", "<var>prim</var><sub><var>p</var></sub>") + " − " + sym("Lo", "<var>loss</var><sub><var>p</var></sub>") + ")", tag: "import cap", say: "Crude imports and LNG (liquefied natural gas) at most the cap's share of primary energy, less what batteries and links lose, every model year." }],
        symbols: {
          D: { name: "D_p", label: "D p, a model year's discount sum", unit: "years", words: "The discount factors of the five years a model year stands for (2026–2030 for 2030), at the plan's rate i (a decimal: 5% is 0.05).", you: E4.sysOf(DEF, P).D.map(function (v) { return fix(v, 2); }).join(", "), code: "S.D[p]" },
          A: { name: "A_g", label: "A g, a plant's yearly payment", unit: "$ per kW a year", words: "Capital × the [[capital-recovery-factor|capital recovery factor]] over its life, plus fixed O&M; the same in every period, whatever is built.", you: "Wind $" + fix(DEF.cw * E4.crf(rate, P.tech.wind.life) + P.tech.wind.fom, 0) + " per kW a year.", code: "capex * crf(rate, life) + fom" },
          n: { name: "n_g,q", label: "n g q, MW built", unit: "MW", words: "Built in model year q, by region (the firm option: nationally, shared by demand).", you: V ? "Central: wind " + fix(sum(V.built.wind), 1) + " GW in all." : "Run step 5.", code: '"n_" + r + g + q' },
          x: { name: "x", label: "x, output in a slice", unit: "MW (average over the slice)", words: "A plant's output, a battery's or a flow, as a slice's average.", you: "12 slices × 5 regions × 5 years.", code: '"g_" + unit + "_" + s + "_" + p' },
          u: { name: "u", label: "u, unserved energy", unit: "MW (average over the slice)", words: "Load not met, at a penalty of $10,000 per MWh: every run solves, and a shortfall shows.", you: V ? fix(sum(V.unserved), 2) + " TWh in the central run" : "Run step 5.", code: '"us_" + r + "_" + s + "_" + p' },
          L: { name: "L_r,p", label: "L r p, average busbar load", unit: "MW", words: "Busbar load: the electricity the region needs at its power plants' outlets: its use ÷ 0.94, since grid losses are 6% of what enters the grid.", you: P.R.map(function (R, r) { return R.short + " " + kilo(E4.sysOf(DEF, P).loadMW[0][r]); }).join("; ") + " MW in 2030", code: "S.loadMW[p][r]" },
          d: { name: "d_s", label: "d s, the slice's demand factor", unit: "÷ the year's average", words: "SPP's 2025 shape over the slice's hours.", you: P.S.map(function (s) { return fix(s.demand, 2); }).join(", "), code: "P.S[s].demand" },
          a: { name: "a_g,s", label: "a g s, availability", unit: "share", words: "Fossil plants' availability (a stand-in for outages); wind and solar the slice's output per MW.", you: "Coal " + P.cfg.existing.availability.coal + ", combined cycle " + P.cfg.existing.availability.gasCC, code: "cfg.existing.availability" },
          w: { name: "w_p", label: "w p, the budget's weight", unit: "years", words: "Straight lines between model years: 2025 counts 2, 2030–2045 count 5, 2050 counts 3 (25 in all).", you: E4.sysOf(DEF, P).w.join(", "), code: "S.w[p]" },
          E: { name: "CO2_p", label: "CO2 p, a model year's emissions", unit: "Mt a year", words: "Fuels burned × the IPCC's factors (crude 73.3, gas 56.1, coal 94.6 t per TJ).", you: V ? V.co2.map(function (c) { return fix(c, 0); }).join(", ") + " Mt" : "Run step 5.", code: "m.meta.CO2[p]" },
          B: { name: "B", label: "B, the budget", unit: "Mt, 2026–2050", words: "A learner choice; its dual is the value of one more tonne.", you: sw.length ? sw.map(function (z) { return kilo(z.budget) + " Mt: " + dualText(z.dual); }).join("; ") : "Run step 6.", code: "state.bud" },
          I: { name: "imp_p", label: "imp p, imports", unit: "PJ a year", words: "Crude imports (all through the strait) and LNG.", you: V ? V.fuel.map(function (f) { return kilo(f.crudeImp + f.lng); }).join(", ") + " PJ a year, 2030–2050 (imports ÷ primary energy: " + V.imp.map(function (s) { return pct(s); }).join(", ") + ")" : "Run step 5.", code: "m.meta.IMP[p]" },
          c: { name: "cap", label: "cap, the import cap", unit: "share", words: "At most this share of primary energy, less battery and link losses, in every model year.", you: DEF.cap + "%", code: "state.cap / 100" },
          Lo: { name: "loss_p", label: "loss p, battery and link losses", unit: "PJ a year", words: "What batteries (charge less discharge) and links (1% per 100 km) lose, left out of the cap's base; the plants' own conversion losses stay in it, as in primary energy.", you: V ? V.lossPJ.map(function (v) { return fix(v, 1); }).join(", ") + " PJ a year, 2030–2050" : "Run step 5.", code: "m.meta.LOSS[p]" },
          Pr: { name: "prim_p", label: "prim p, primary energy", unit: "PJ a year", words: "Physical energy content: fuels as burned; existing nuclear plants count their heat; hydro, wind, solar and the generic firm option count their electricity.", you: V ? kilo(V.primary[0]) + " PJ in 2030" : "Run step 5.", code: "m.meta.PRIM[p]" } } });
      LX.Flowchart(H("div", { class: "lx-xcard" }, x), { title: "One run, from inputs to what you may conclude", lede: "Each box is one stage of steps 4 to 10.",
        nodes: { inp: { t: "Inputs", s: "plan, costs, fleet, slices" }, dec: { t: "Decisions", s: "build, retire, run, buy" }, rules: { t: "Rules", s: "balance, vintages, budget, cap" },
          lp: { t: "Solve the LP", s: "limits first" }, reach: { t: "Limits met?", k: "q" }, close: { t: "Closest pathway", s: "least overshoot, then cost" },
          hr: { t: "Hourly checks", s: "two years, 8,760 h" }, out: { t: "Qualified conclusions", s: "what survives, and where", k: "end" } },
        at: { inp: [1, 0], dec: [1, 1], rules: [1, 2], lp: [1, 3], reach: [1, 4], close: [2, 5], hr: [1, 6], out: [1, 7] }, cols: 3, colsN: 3,
        edges: [["inp", "dec"], ["dec", "rules"], ["rules", "lp"], ["lp", "reach"], ["reach", "hr", "yes"], ["reach", "close", "no"], ["close", "hr"], ["hr", "out"]],
        traces: [{ label: "The central plan", path: ["inp", "dec", "rules", "lp", "reach", "hr", "out"], text: "Steps 5 and 10: the budget is met; the hourly checks then say which conclusions hold." },
          { label: "The straight-line budget", path: ["inp", "dec", "rules", "lp", "reach", "close", "hr", "out"], text: "Step 7: no plan stays within " + kilo(LINE.mt) + " Mt, so the run reports the closest pathway and by how much it misses." }] });
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
