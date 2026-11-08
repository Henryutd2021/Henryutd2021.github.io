// m12-city-model.js — M12, "Model a city's energy system: an energy hub with grid limits and screening fairness outputs"
// (Modeler, model-lab in the cards form), on engine E3 (assets/learn/components/engine-e3.js, LX.E3,
// in the bundle; the City Planner SB3 and capstone C3 run the same model). Data: prairie-city.json and e3-city-hub.json.
//
// Steps: predict where the limit bites; the formulation (the hub, building shares as decisions, the balance, the
// substation's ceiling); run 2025; electrify and read the substation duals; add flexibility; let the LP choose under a
// CO2 cap and read the cap's dual; the screening household table from the accounting layer (not the LP); compare the
// plans. Then the explain layer (the hub, the equation card, a comparison table) built from the reader's runs, and the
// full-year check of the lesson's four plans (precomputed: data/e3-full-year.json; never solved on the page).
// Every number comes from E3; _tests/learn/test_m12-city-model.js checks the words against the engine for each plan.
// Prairie City is fictional; its numbers are illustrative.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (Node: the test reads it)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function mil(v) { var x = Math.round(v / 1e5) / 10; return (x < 0 ? "−$" : "$") + Math.abs(x).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "M"; }
  function signedMil(v) { return (v > 0 ? "+" : "") + mil(v); }
  function pct1(v) { return (v * 100).toFixed(1) + "%"; }
  function pct0(v) { return Math.round(v * 100) + "%"; }
  // the lesson's plans: 2025, electrify, electrify with flexibility; the LP's own choice is step 6 (a cap you set)
  var PLANS = {
    today: { label: "2025 as it is", state: { hp: 0, ret: 0, dh: 0, dhp: 0, sto: 0, ev: 1, evm: "home", pv: 0, bat: 0, up: "yes" } },
    electrify: { label: "Electrify heat and cars", state: { hp: 80, ret: 0, dh: 0, dhp: 0, sto: 0, ev: 50, evm: "home", pv: 0, bat: 0, up: "yes" } },
    flex: { label: "Electrify, managed charging, 40 MW of batteries", state: { hp: 80, ret: 0, dh: 0, dhp: 0, sto: 0, ev: 50, evm: "managed", pv: 0, bat: 40, up: "yes" } } };
  // floorPct: the least CO2 the choice's limits allow, as a share of 2025, rounded to 0.1 (the test finds it by bisection)
  var CHOOSE = { base: { ev: 50, evm: "managed" }, retMax: 0.6, dhMax: 0.4, pvMax: 400, batMax: 200, capDef: 80, capMin: 65, capMax: 100, capStep: 5, floorPct: 63.4 };
  function upTotal(R) { return R.dist.reduce(function (s, d) { return s + d.upg; }, 0); }
  function peaksText(R) { return R.dist.map(function (d) { return d.label.toLowerCase() + " " + kilo(d.peak) + " of " + kilo(d.limit) + " MW"; }).join(", "); }
  function words(id, R, P) {
    if (id === "today") return (R.dist.every(function (d) { return d.peak <= d.limit + 1e-6; }) ? "Every substation stays within its limit in 2025's busiest hours (see the readouts)." : "A substation passes its limit (see the readouts).") + " By construction: each limit is its district's 2025 peak × 1.15, rounded up to the next 10 MW.";
    if (id === "electrify") {
      var over = R.dist.filter(function (d) { return d.upg > 0.05; });
      var sb = R.dist[1], when = "The suburbs' busiest hour: " + (sb.at.h < 10 ? "0" : "") + sb.at.h + ":00 on the " + P.days[sb.at.k].label.toLowerCase() + ". ";
      return when + (over.length ? (over.length === R.dist.length ? "All three districts pass" : over.length + " districts pass") + " their limits (see the readouts); the LP buys " + kilo(upTotal(R)) + " MW of upgrades. Each one's summed duals: $" + kilo(over[0].value) + " per MW a year, the upgrade's yearly cost." : "No district passes its limit.");
    }
    if (id === "flex") return "With managed charging and batteries the LP buys " + kilo(upTotal(R)) + " MW of upgrades, " + kilo(upTotal(R.prev) - upTotal(R)) + " MW fewer than without. Busiest hours: " + peaksText(R) + ".";
    return "";
  }
  // the LP's own plan under a cap: one short result (the cap's dual); what it chose is in the step's table and readouts
  function chooseWords(R, capPct) {
    var cap = R.raw.capDual;
    return "CO₂ at most " + capPct + "% of 2025. " + (cap != null && cap > 0.5 ? "The cap binds: the last tonne cut costs about $" + kilo(cap) + " (the cap's dual)." : "The cap does not bind: its dual is $0.") + " The table shows what the LP chose.";
  }
  // the step's readouts: [label, value, tone]
  function chooseReadouts(R) {
    var sz = R.raw.sizes, cap = R.raw.capDual;
    return [["CO₂", kilo(R.acc.co2Hub) + " t", ""], ["Cap's dual", cap > 0.5 ? "$" + kilo(cap) + "/t" : "$0/t", cap > 0.5 ? "warn" : ""], ["Upgrades", kilo(upTotal(R)) + " MW", ""],
      ["Rooftop solar added", kilo(sz.pvAdd) + " MW", ""], ["Batteries added", kilo(sz.batAdd) + " MW", ""]];
  }
  // the comparison's rows; rule: "who adopts first" for every row's burden (step 7's choice). The
  // rule moves the household table only, so cost, CO2 and upgrades are the runs' own; resum(R, rule) re-reads the run
  // with that rule (E3.summarize on the same LP solution)
  function compareRows(runs, rule, resum) {
    return runs.map(function (x) {
      var R = rule && resum && x.R.hh && x.R.hh.rule !== rule ? resum(x.R, rule) : x.R;
      return { key: x.key, name: x.label, cost: R.delta.cost, co2: R.acc.co2Hub, up: upTotal(R), burden: R.hh.low.burden, rule: R.hh.rule };
    });
  }
  var RULES = { even: "Every group alike", low: "Lower incomes first", high: "Higher incomes first" };
  // the full-year check of the lesson's four plans (2025 and electrify are the City Planner's presets; flexibility and the
  // LP's choice are this lesson's own), one row each, and the gaps in words: what holds, what moves, the cap
  var FULL = [["sb3", "today", "today"], ["sb3", "electrify", "electrify"], ["m12", "flex", "flex"], ["m12", "choose", null]];
  function fullEntries(FY) { return FULL.map(function (f) { return FY ? FY.plans.filter(function (e) { return e.page === f[0] && e.id === f[1]; })[0] || null : null; }); }
  function fullLabel(e, i) { return FULL[i][2] ? PLANS[FULL[i][2]].label : e.label; }
  function fullKeys(FY, FYc, E3) {
    var E = fullEntries(FY), worst = E.reduce(function (a, e) { return e.year.unserved > a.year.unserved ? e : a; }, E[0]), ch = E[3];
    var why = E3.fullWhy(E[1], FYc, FY.date), pick = function (k) { return why.filter(function (x) { return x[0] === k; })[0]; };
    return [["The check", "each plan as its eight days decided it (step 6's at the 80% cap), run on every hour of 2025 with the same model. Precomputed on " + FY.date + ": too large for a click."],
      ["Two runs", "the cost, CO₂ gap and unserved columns keep the eight days' upgrades; the upgrades column comes from a second run that sizes them on the year."],
      pick("What holds"), pick("Three cold days"),
      ["The grid", "every plan that buys upgrades leaves load unserved on 19 or 20 February. Flexibility fills the design day up to its limits, so " + (worst === E[2] ? "the plan with managed charging and batteries" : lc(fullLabel(worst, E.indexOf(worst)))) + " misses most: " + kilo(worst.year.unserved) + " MWh."],
      ["Step 6's cap", ch.year.co2 > ch.cap + 0.5 ? "on the year, the LP's choice is " + kilo(ch.year.co2 - ch.cap) + " t over the cap it was chosen under (" + pct2(ch.year.co2 / ch.cap - 1) + ")." : "on the year, the LP's choice stays within its cap."],
      pick("Not tested")];
  }
  function lc(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  function pct2(v) { return (v * 100).toFixed(2) + "%"; }
  var page = { PLANS: PLANS, CHOOSE: CHOOSE, RULES: RULES, FULL: FULL, fullEntries: fullEntries, fullLabel: fullLabel, fullKeys: fullKeys, words: words, chooseWords: chooseWords, chooseReadouts: chooseReadouts, compareRows: compareRows, upTotal: upTotal, kilo: kilo, mil: mil, signedMil: signedMil, pct1: pct1, pct0: pct0 };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E3) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E3 = LX.E3, U = E3.ui;
  LX.mount("m12", function (live, data, root) {
    var P = E3.prepare(data.prairie_city, data.e3_city_hub), S = E3.sb3Schema(P.cfg), DEF = E3.defaults(S), FY = data.e3_full_year || null, FYc = data.prairie_city.fullYear;
    var S0 = { runs: {}, choose: null, cap: CHOOSE.capDef, rule: "even", runners: {} }, stub = null;
    function planOf(id) { return Object.assign({}, DEF, PLANS[id].state); }
    function solver() { if (!stub) return null; stub = null; return function () { return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" }); }; }
    function kpi(host, label, value, tone) { var d = H("div", { class: "lx-readout " + (tone || "") }, host); H("span", { text: label }, d); H("b", { text: value }, d); }
    function says(t) { return LX.rich(t); }
    H("p", { class: "lx-hint e3-line", text: P.line }, live);
    // a run step: one plan through E3 with BenchRun (failure states, Try again, busy holds Next)
    function runStep(act, api, id, after) {
      var kp = H("div", { class: "lx-readouts" }), res = H("div", { class: "m12-res" });
      // the run's readouts, results and words (also when the reader comes back to the step: the run is kept)
      function show(R) {
        kp.innerHTML = ""; R.dist.forEach(function (d) { kpi(kp, d.label, kilo(d.peak) + " / " + kilo(d.limit) + " MW", d.upg > 0.05 ? "warn" : "good"); }); kpi(kp, "Upgrades", kilo(upTotal(R)) + " MW", upTotal(R) > 0.05 ? "warn" : "good");
        res.innerHTML = ""; if (after) after(R, res);
        api.done(); api.saw(words(id, R, P) + (id === "flex" && !R.prev ? " (Run step 4 first to compare.)" : ""));
      }
      var run = LX.BenchRun(act, { label: "Run: " + PLANS[id].label, busy: api.busy, results: [kp, res], state: function () { return planOf(id); },
        solve: function (st, ctx) { return E3.solve(st, P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); },
        render: function (R) {
          if (id === "flex" && S0.runs.electrify) R.prev = S0.runs.electrify;
          S0.runs[id] = R;
          show(R);
          refreshExplain();
        } });
      act.appendChild(kp); act.appendChild(res);
      if (S0.runs[id]) show(S0.runs[id]);
      S0.runners[id] = function () { run.run(planOf(id)); };
      return run;
    }
    var steps = [
      // 1 predict
      { text: "Prairie City switches 80% of its furnaces and resistance heaters to [[heat-pump|heat pumps]] and half its cars to electric. Predict: when does the suburbs' [[substation|substation]] first pass its limit?",
        build: function (act, api) {
          LX.Predict(act, { id: "m12-when", q: "The suburbs pass their limit…", options: [{ value: "night", label: "on a cold winter night" }, { value: "summer", label: "on a hot summer afternoon" }, { value: "never", label: "never: yearly use rises only a little" }],
            answer: "night", onPick: function () { api.done(); api.saw("Kept. Step 4 runs it."); } });
        } },
      // 2 the formulation
      { text: "The model is an [[energy-hub|energy hub]]: each district-hour, electricity bought plus rooftop sun meets the base load, heating and charging. The [[linearized-feeder-limit|substation's limit]] is one ceiling on each hour's purchase.",
        build: function (act, api) {
          U.hubDiagram(act, { caption: "Each district (core, suburbs, fringe) is one hub; 8 representative days × 24 hours, weighted to 365 days." });
          U.keys(act, [["Building shares", "each district's heat is split into shares y[e][s]: [[building-envelope|envelope]] e (as built, or [[retrofit|retrofitted]]) × heating system s."],
            ["Why it stays linear", "each system's heating power is a share times known numbers (the table), never a product of two decisions."],
            ["COP", "a heat pump's [[coefficient-of-performance|coefficient of performance]]: heat out per unit of electricity in, lower in colder hours."]]);
          U.keys(act, [["Q and y", "Q is the heat a district needs that hour, in MW of heat; y is the share of it one heating system serves."]]);
          U.table(act, ["Heating system s", "Electrical input (MW) for a share y of the heat Q"], [["Furnace (gas or propane)", "none: it burns fuel"], ["Resistance heater", "Q × y"],
            ["Heat pump", "Q × y ÷ COP, the hour's"], ["District heat (core)", "through the network's plant: its heat pump's power"]], "m12-lin");
          U.keys(act, [["Run or choose", "the City Planner fixes the shares from your sliders; step 6 lets the LP choose them."]]);
          var b = H("button", { type: "button", class: "lx-btn small ghost", text: "Count the model" }, act), kp = H("div", { class: "lx-readouts" }, act);
          b.addEventListener("click", function () {
            var m = E3.build(P, E3.sysOf(planOf("flex"), P));
            kp.innerHTML = ""; kpi(kp, "Decisions", kilo(m.variables.length)); kpi(kp, "Rules", kilo(m.constraints.length)); kpi(kp, "Whole numbers", "0");
            api.done(); api.saw("A [[linear-program|linear program]]: " + kilo(m.variables.length) + " decisions and " + kilo(m.constraints.length) + " rules for the flexible plan of step 5; no whole numbers, so every rule has a dual.");
          });
        } },
      // 3 run 2025
      { text: "Run 2025 as it is. The LP has little to choose: every load is fixed, so it buys what each district needs, hour by hour.",
        build: function (act, api) { runStep(act, api, "today"); } },
      // 4 electrify
      { text: "Now electrify heat and cars, with charging unmanaged. Where the busiest hour passes a limit, the LP buys an upgrade, and the limit's [[shadow-price|dual]] says what one more MW of room is worth.",
        build: function (act, api) {
          runStep(act, api, "electrify", function (R, res) {
            var c = H("div", { class: "lx-xcard" }, res); var dv = U.DayView(c, P); var best = 0; R.dist.forEach(function (d, i) { if (d.peak / d.limit > R.dist[best].peak / R.dist[best].limit) best = i; });
            dv.set(R, { d: best, k: R.dist[best].at.k });
          });
        } },
      // 5 flexibility
      { text: "Add flexibility: managed charging (each day's charge in any hours of that day) and 40 MW of batteries at the substations. How much smaller do the upgrades get?",
        build: function (act, api) {
          U.keys(act, [["Assumed", "managed cars are plugged in at home or work whenever needed, and a day's charge takes 6 hours or more: an upper bound on what managed charging can do."]]);
          runStep(act, api, "flex"); } },
      // 6 the LP chooses under a cap
      { text: "Let the LP choose the equipment: heat pumps, retrofits, [[district-heating|district heat]], rooftop solar and batteries become decisions, each at its yearly cost.",
        build: function (act, api) {
          U.keys(act, [["The cap", "the districts' CO₂ a year may not pass the share of 2025 you set."], ["Its dual", "the cost of the last tonne cut, under this model's assumptions."]]);
          var sl = LX.Slider(act, { label: "CO₂ cap, share of 2025", color: "var(--lx-good)", min: CHOOSE.capMin, max: CHOOSE.capMax, step: CHOOSE.capStep, value: S0.cap, fmt: function (v) { return v + "%"; },
            onChange: function (v) { S0.cap = v; run.changed({ cap: v }); } });
          var kp = H("div", { class: "lx-readouts" }), res = H("div", { class: "m12-res" }), stale = H("p", null);
          var run = LX.BenchRun(act, { label: "Let the LP choose", busy: api.busy, results: [kp, res], stale: stale, state: function () { return { cap: S0.cap }; },
            solve: function (st, ctx) {
              var base = S0.runs.today ? Promise.resolve(S0.runs.today) : E3.solve(DEF, P, {}).then(function (r) { return r.ok ? r.results : null; });
              return base.then(function (B) {
                var b0 = B ? B.acc.co2Hub : null;
                if (b0 == null) return { status: "error", ok: false, message: "2025 could not be run." };
                return E3.solve(Object.assign({}, DEF, CHOOSE.base), P, { size: true, cap: b0 * st.cap / 100, retMax: CHOOSE.retMax, dhMax: CHOOSE.dhMax, pvMax: CHOOSE.pvMax, batMax: CHOOSE.batMax, signal: ctx.signal, attempt: ctx.attempt, solver: solver() });
              });
            },
            render: function (R, st) {
              S0.choose = { R: R, cap: st.cap };
              show(R, st.cap);
              refreshExplain();
            } });
          // the LP's choice: readouts, the shares it chose and the words (also when the reader comes back to the step)
          function show(R, cap) {
            kp.innerHTML = ""; chooseReadouts(R).forEach(function (x) { kpi(kp, x[0], x[1], x[2]); });
            res.innerHTML = "";
            U.table(res, ["District (shares of its heat)", "Heat pumps", "Retrofitted", "District heat", "Furnaces left"], R.acc.d.map(function (o) { return [o.label, pct0(o.share.hp), pct0(o.retShare), pct0(o.share.dh), pct0(o.share.fuel)]; }), "m12-chosen");
            if (cap !== S0.cap) H("p", { class: "lx-hint", text: "Shown: your last run, at " + cap + "% of 2025. Press Let the LP choose for " + S0.cap + "%." }, res);
            api.done(); api.saw(chooseWords(R, cap));
          }
          act.appendChild(stale); act.appendChild(kp); act.appendChild(res);
          S0.runners.choose = function () { run.run({ cap: S0.cap }); };
          U.keys(act, [["Fixed", "half the cars electric, with managed charging."], ["Limits", "retrofits up to 60% of buildings; district heat up to 40% of the core's heat."],
            ["The slider's floor", "65%: just above the least CO₂ these limits allow, about " + CHOOSE.floorPct + "% of 2025 (gasoline and water heating stay)."]]);
          if (S0.choose) show(S0.choose.R, S0.choose.cap);
        } },
      // 7 screening outputs
      { text: "Bills by household group are not in the LP. An [[screening-estimate|accounting layer]] spreads each measure over the groups by a stated rule. Change the rule: the LP's plan does not move.",
        build: function (act, api) {
          var host = H("div", null, act), seg = U.seg(act, "Who adopts first", ["even", "low", "high"], { even: "Every group alike", low: "Lower incomes first", high: "Higher incomes first" }, S0.rule, function (v) { S0.rule = v; draw(); });
          act.insertBefore(seg.el, host);
          function draw() {
            host.innerHTML = "";
            var src = S0.choose ? S0.choose.R : S0.runs.flex || S0.runs.electrify;
            if (!src) { H("p", { class: "lx-hint", text: "Run step 4, 5 or 6 first." }, host); return; }
            var st = Object.assign({}, src.state, { rule: S0.rule });
            var R = E3.summarize(st, P, src.raw, src.base);
            U.hhTable(host, R);
            api.done(); api.saw("[[energy-burden|Energy burden]] of homes below 80% of [[area-median-income|area median income]]: " + pct1(R.hh.low.burden0) + " in 2025, " + pct1(R.hh.low.burden) + " with this plan and rule. The cost and CO₂ do not change with the rule: they come from the LP.");
          refreshCompare();
          }
          draw();
        } },
      // 8 compare
      { text: "Compare the plans you ran. Cost is against 2025 and includes the cars' fuel (not their prices); CO₂ is the districts'; burden is a screening estimate.",
        build: function (act, api) {
          var host = H("div", null, act);
          cmp = function () {
            host.innerHTML = "";
            var runs = ["today", "electrify", "flex"].filter(function (k) { return S0.runs[k]; }).map(function (k) { return { key: k, label: PLANS[k].label, R: S0.runs[k] }; });
            if (S0.choose) runs.push({ key: "choose", label: "The LP's choice, CO₂ ≤ " + S0.choose.cap + "%", R: S0.choose.R });
            if (!runs.length) { H("p", { class: "lx-hint", text: "Run steps 3 to 6 first." }, host); return false; }
            U.keys(host, [["Who adopts first, for every row's burden", RULES[S0.rule] + " (step 7's choice)."]]);
            U.table(host, ["Plan", "Yearly cost against 2025", "CO₂ (t a year)", "Upgrades", "Burden, homes below 80% of area median income (AMI)"],
              compareRows(runs, S0.rule, resum).map(function (r) { return [r.name, signedMil(r.cost), kilo(r.co2), kilo(r.up) + " MW", pct1(r.burden)]; }), "m12-compare");
            return true;
          };
          if (cmp()) { api.done(); api.saw("One model, four answers: the LP finds the cheapest way to run each plan; which plan to choose, and for whom, is a planning question (A18, C3)."); }
        } }];
    function resum(R, rule) { return E3.summarize(Object.assign({}, R.state, { rule: rule }), P, R.raw, R.base); }
    var cmp = null;
    function refreshCompare() { if (cmp) cmp(); }
    var cards = LX.StepCards(live, { steps: steps });

    // ---- explain: the hub, the equation card, a comparison of the two modes
    var x = document.getElementById("m12-explain");
    function refreshExplain() {
      x.innerHTML = "";
      U.hubDiagram(H("div", { class: "lx-xcard" }, x), { caption: "An annotated hub: what crosses each district's substation is the only thing the limit constrains." });
      var sym = LX.EquationCard.sym, el = S0.runs.electrify, ch = S0.choose;
      LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
        title: "The hub's linear program, symbol by symbol", lede: "Tap a symbol: what it means, its unit and, once you have run it, its value. The indices are in the table below.", dense: true, label: "The hub's linear program; each symbol is a button",
        fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
        rows: [
          { html: "min Σ<sub><var>k</var>,<var>h</var></sub> " + sym("w", "<var>w</var><sub><var>k</var></sub>") + " [Σ<sub><var>d</var></sub> " + sym("p", "<var>p</var><sub><var>d</var></sub>") + " " + sym("imp", "<var>imp</var>") + " + (" + sym("pind", "<var>p</var><sub>ind</sub>") + " − <var>p</var><sub>core</sub>) " + sym("pl", "<var>pl</var>") + "] + Σ<sub><var>d</var></sub> " + sym("a", "<var>a</var>") + " " + sym("up", "<var>up</var><sub><var>d</var></sub>") + " + fuel (furnaces and the network's boiler) and equipment", tag: "goal", say: "Minimize the year's cost, in five parts: purchases (each district's price, weighted by w); the network plant's power (the industrial price); upgrades (their yearly cost); furnace and boiler fuel; equipment, when the LP chooses." },
          { html: "<var>imp</var> + " + sym("pv", "<var>pv</var>") + " + " + sym("out", "<var>out</var>") + " − " + sym("in", "<var>in</var>") + " − " + sym("ev", "<var>ev</var>") + " − Σ<sub><var>e</var>,<var>s</var></sub> " + sym("Q", "<var>Q</var>") + " (1 − " + sym("sig", "σ") + "<var>e</var>) " + sym("y", "<var>y</var><sub><var>e</var>,<var>s</var></sub>") + " " + sym("kap", "κ<sub><var>s</var></sub>") + " − " + sym("pl", "<var>pl</var>") + " = " + sym("B", "<var>B</var>"), tag: "balance", say: "Each district-hour: purchases, rooftop sun and battery output, less charging, heating power and (in the core) the plant's power, meet the base load. Its dual ÷ w_k is $ per MWh in one such hour." },
          { html: "κ<sub>res</sub> = 1,  κ<sub>hp</sub> = 1 ÷ " + sym("cop", "<var>COP</var><sub><var>kh</var></sub>") + ",  κ<sub>fuel</sub> = κ<sub>dh</sub> = 0", tag: "heating power", say: "A share of heat becomes electric power by its system: all of it for a resistance heater, 1 ÷ COP for a heat pump, none for a furnace (it burns fuel) or district heat (its plant's power is pl)." },
          { html: sym("net", "<var>hp</var> + <var>boil</var> + <var>so</var> − <var>si</var>") + " = Σ<sub><var>e</var></sub> <var>Q</var> (1 − σ<var>e</var>) <var>y</var><sub><var>e</var>,dh</sub> ÷ 0.9,  " + sym("pl", "<var>pl</var>") + " = <var>hp</var> ÷ 3", tag: "heat network (core)", say: "The network's heat each hour: its heat pump, the gas boiler and the store meet the connected buildings' heat plus the 10% lost in the pipes; the heat pump's power is in the core's balance." },
          { html: "<var>imp</var> − <var>up</var><sub><var>d</var></sub> ≤ " + sym("L", "<var>L</var><sub><var>d</var></sub>"), tag: "the substation", say: "Each hour's purchase stays under the district's limit plus any upgrade bought." },
          { html: "Σ CO₂ ≤ " + sym("cap", "<var>cap</var>"), tag: "step 6", say: "In step 6, the districts' CO2 a year stays under the cap." }],
        symbols: {
          w: { name: "w_k", label: "w k, days a representative day stands for", unit: "days", words: "Eight days of 2025, weighted to add to 365; the cold design day counts 3.", you: P.w.join(", "), code: "P.w[k]" },
          p: { name: "p_d", label: "p d, the district's electricity price", unit: "$/MWh", words: "Each district's 2025 blend of Kansas's residential and commercial prices (EIA).", you: P.D.map(function (D) { return D.label + " $" + D.pEl.toFixed(2); }).join("; "), code: "P.D[d].pEl" },
          imp: { name: "imp", label: "imp, purchase through the substation", unit: "MW in an hour", words: "Electricity bought through the district's substation in one hour; never negative (no reverse flow).", you: el ? "Busiest, electrified: " + peaksText(el) : "Run step 4.", code: '"i" + d + "_" + k + "_" + h' },
          a: { name: "a", label: "a, the upgrade's yearly cost", unit: "$ per MW a year", words: "The up-front cost per kW (set for teaching; the City Planner's slider changes it), paid over 40 years at 4% a year after inflation (a real rate).", you: "$" + kilo(E3.sysOf(DEF, P).a.up) + " per MW a year at $" + kilo(DEF.upc) + "/kW.", code: "S.a.up" },
          up: { name: "up_d", label: "up d, upgrade bought", unit: "MW", words: "More room at the district's substation, bought once for the year's busiest hour.", you: el ? kilo(upTotal(el)) + " MW in all, electrified." : "Run step 4.", code: '"upg" + d' },
          pv: { name: "pv", label: "pv, rooftop solar used", unit: "MW", words: "Up to the panels' output that hour; the rest is spilled.", you: "17.6% capacity factor (EIA's rooftop figure).", code: '"s" + d + "_" + k + "_" + h' },
          ev: { name: "ev", label: "ev, car charging", unit: "MW", words: "Unmanaged: the evening profile. Managed: each day's energy in any hours of that day, at most a sixth of it in one hour (cars assumed plugged in when needed).", you: "Half the cars: about " + kilo(P.D.reduce(function (s, D) { return s + Math.max(D.evs0, Math.round(0.5 * D.ldv)); }, 0)) + " EVs.", code: '"v" + d + "_" + k + "_" + h' },
          out: { name: "out", label: "out, battery output", unit: "MW", words: "Power from the substation's batteries (4 hours) that hour.", you: "Step 5: 40 MW of batteries in all, split by the limits.", code: '"bd" + d + "_" + k + "_" + h' },
          "in": { name: "in", label: "in, battery charging", unit: "MW", words: "Power into the batteries; 85% of it comes back out. The store is cyclic within each day.", you: "Round trip " + Math.round(P.cfg.battery.rte * 100) + "%.", code: '"bc" + d + "_" + k + "_" + h' },
          sig: { name: "σ", label: "sigma, heat a retrofit saves", unit: "share of the heat", words: "A retrofitted building (e = 1) needs (1 − σ) of its heat; one as built (e = 0) needs all of it. Set for teaching.", you: Math.round(DEF.save) + "% here.", code: "S.save" },
          pl: { name: "pl", label: "pl, the heat network's plant power", unit: "MW", words: "The core's network plant: a large heat pump at COP 3, through the core's substation. Zero in the other districts.", you: "None in steps 3 to 5 (no network).", code: '"dp" + k + "_" + h + " / 3"' },
          net: { name: "hp, boil, so, si", label: "the heat network's sources", unit: "MW of heat", words: "The plant's heat pump, the gas boiler (assumed to exist already: its fuel only), and the heat store's output less its input.", you: "Step 6 may choose a network, its plant and its store.", code: '"dp", "db", "to", "ti"' },
          Q: { name: "Q", label: "Q, heat needed that hour", unit: "MW of heat", words: "A power: how far the hour's temperature is below 18.3 °C (°C) times the district's heat-loss rate (MW of heat per °C, prairie-city.json). Held for one hour, it is MWh of heat.", you: "Design day, 03:00: " + P.D.map(function (D) { return D.label + " " + kilo(D.Q[0][3]) + " MW"; }).join("; "), code: "P.D[d].Q[k][h]" },
          y: { name: "y_e,s", label: "y e s, a building share", unit: "share of the district's heat", words: "The share of heat in envelope e with system s. Fixed in a run; a decision when the LP chooses. They add to 1.", you: ch ? "Step 6: heat pumps " + ch.R.acc.d.map(function (o) { return pct0(o.share.hp); }).join(", ") + "." : "Run step 6.", code: '"y" + d + e + s' },
          cop: { name: "COP_kh", label: "COP k h, the heat pump's coefficient of performance", unit: "MWh of heat per MWh", words: "Coefficient of performance (COP): heat out per unit of electricity in. Here an illustrative curve, 144 ÷ (45 − T), through DOE's challenge target of 2.4 at −15 °C, with resistance backup (1) assumed below −23 °C.", you: "Design day 03:00: " + P.cop[0][3].toFixed(2), code: "P.cop[k][h]" },
          kap: { name: "κ_s", label: "kappa s, electric power per unit of heat", unit: "MW per MW of heat", words: "Resistance 1; heat pump 1 ÷ COP, the hour's; furnace 0 (it burns fuel); district heat 0 in the district's balance (its plant's power is pl).", you: "Design day 03:00, heat pump: " + (1 / P.cop[0][3]).toFixed(2), code: "1, 1 / P.cop[k][h], 0" },
          pind: { name: "p_ind", label: "p ind, the industrial electricity price", unit: "$/MWh", words: "The network's plant buys at Kansas's 2025 industrial price, though its power comes through the core's substation: the goal swaps the core's price for it on pl.", you: "$" + P.price.ind.toFixed(2) + " against the core's $" + P.D[0].pEl.toFixed(2), code: "P.price.ind" },
          B: { name: "B", label: "B, the base load", unit: "MW", words: "Everything but space heating and cars, spread by SPP's 2025 demand shape, which still carries the region's own electric heating.", you: "Design day 18:00, core: " + kilo(P.D[0].B[0][18]) + " MW", code: "P.D[d].B[k][h]" },
          L: { name: "L_d", label: "L d, the substation's limit", unit: "MW", words: "The district's 2025 busiest hour × 1.15, rounded up to the next 10 MW (a teaching simplification: one substation per district).", you: P.D.map(function (D) { return D.label + " " + kilo(D.L) + " MW"; }).join("; "), code: "P.D[d].L" },
          cap: { name: "cap", label: "cap, CO2 ceiling", unit: "t a year", words: "A share of 2025's districts' CO2; its dual is the cost of the last tonne cut.", you: ch ? ch.cap + "% of 2025: dual $" + kilo(ch.R.raw.capDual || 0) + "/t." : "Run step 6.", code: "o.cap" } } });
      U.table(H("div", { class: "lx-xcard" }, x), ["Index", "Runs over"], [["k", "the 8 representative days"], ["h", "the 24 hours of a day"], ["d", "the 3 districts: core, suburbs, fringe"],
        ["e", "2 envelopes: as built, retrofitted"], ["s", "4 heating systems: furnace, resistance, heat pump, district heat"]], "m12-idx");
      LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
        title: "Run or choose: one model, two modes", lede: "The same rules; what is fixed changes.", text: true,
        columns: [{ key: "name", label: "", main: true }, { key: "run", label: "Run (SB3, C3)" }, { key: "choose", label: "Choose (step 6)" }],
        rows: [{ key: "y", name: "Building shares", run: { text: "fixed by the sliders" }, choose: { text: "decisions, with their yearly costs" } },
          { key: "eq", name: "Equipment sizes", run: { text: "fixed" }, choose: { text: "decisions, up to stated maxima" } },
          { key: "hp", name: "Heat pumps bought", run: { text: "every home the sliders switch, even where district heat replaces a 2025 heat pump" }, choose: { text: "the rise above 2025's share: the LP picks which homes change and keeps 2025's heat pumps" } },
          { key: "d", name: "Duals to read", run: { text: "substation room; balance" }, choose: { text: "the same, plus the CO₂ cap" } },
          { key: "hh", name: "Household table", run: { text: "accounting layer after the LP" }, choose: { text: "the same: never in the LP" } }],
        sorts: [{ label: "As listed", order: ["y", "eq", "hp", "d", "hh"] }] });
      // the full-year check of the lesson's four plans (precomputed; the same for every reader)
      var fc = H("div", { class: "lx-xcard lx-sb-chart e3-full" }, x); H("h3", { text: "Full-year check: the lesson's four plans on 8,760 hours" }, fc);
      if (!FY) { H("p", { class: "lx-hint", text: "The full-year check did not load." }, fc); return; }
      U.table(fc, ["Plan", "Yearly cost against 2025, no penalty on unserved energy: eight days → full year", "CO₂ gap", "Upgrades: eight days → sized on the year", "Unserved with the eight days' upgrades"],
        fullEntries(FY).map(function (e, i) { return E3.fullPlanRow(e, fullLabel(e, i)); }), "e3-fullt");
      U.keys(fc, fullKeys(FY, FYc, E3));
    }
    refreshExplain();

    // ---- demo states: mid (steps 3 and 4 run), fail
    LX.demo(root, function (s) {
      if (s === "mid") { cards.go(3); S0.runners.electrify(); return { view: "mid" }; }
      if (s === "step-6") { cards.go(5); S0.runners.choose(); return { view: "mid" }; }
      if (s === "fail") { cards.go(2); stub = "fail"; S0.runners.today(); return { view: "mid" }; }
      return null;
    }, cards);
  });
})();
