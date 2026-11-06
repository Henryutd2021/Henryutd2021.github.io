// m12-city-model.js — M12, "Model a city's energy system: an energy hub with grid limits and screening fairness outputs"
// (Modeler, model-lab in the cards form, wave W5, 2026-11-06), on engine E3 (assets/learn/components/engine-e3.js, LX.E3,
// in the bundle; the City Planner SB3 and capstone C3 run the same model). Data: prairie-city.json and e3-city-hub.json.
//
// Steps: predict where the limit bites; the formulation (the hub, building shares as decisions, the balance, the
// substation's ceiling); run 2025; electrify and read the substation duals; add flexibility; let the LP choose under a
// CO2 cap and read the cap's dual; the screening household table from the accounting layer (not the LP); compare the
// plans. Then the explain layer (the hub, the equation card, a comparison table) built from the reader's runs.
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
  var CHOOSE = { base: { ev: 50, evm: "managed" }, retMax: 0.6, dhMax: 0.4, pvMax: 400, batMax: 200, capDef: 80, capMin: 65, capMax: 100, capStep: 5 };
  function upTotal(R) { return R.dist.reduce(function (s, d) { return s + d.upg; }, 0); }
  function peaksText(R) { return R.dist.map(function (d) { return d.label.toLowerCase() + " " + kilo(d.peak) + " of " + kilo(d.limit) + " MW"; }).join(", "); }
  function words(id, R, P) {
    if (id === "today") return "Every substation stays within its limit in 2025's busiest hours: " + peaksText(R) + ". Each limit is 15% above its district's 2025 peak, by construction.";
    if (id === "electrify") {
      var over = R.dist.filter(function (d) { return d.upg > 0.05; });
      var sb = R.dist[1], when = "The suburbs' busiest hour: " + (sb.at.h < 10 ? "0" : "") + sb.at.h + ":00 on the " + P.days[sb.at.k].label.toLowerCase() + ". ";
      return when + (over.length ? "Over the limit: " + over.map(function (d) { return d.label.toLowerCase() + " " + kilo(d.peak) + " of " + kilo(d.limit) + " MW"; }).join(", ") + ". The LP buys " + kilo(upTotal(R)) + " MW of upgrades. Each district's summed duals are $" + kilo(over[0].value) + " per MW a year, the upgrade's yearly cost." : "No district passes its limit.");
    }
    if (id === "flex") return "With managed charging and batteries the LP buys " + kilo(upTotal(R)) + " MW of upgrades, " + kilo(upTotal(R.prev) - upTotal(R)) + " MW fewer than without. Busiest hours: " + peaksText(R) + ".";
    return "";
  }
  // the LP's own plan under a cap: what it chose and the cap's dual
  function chooseWords(R, capPct) {
    var A = R.acc, sz = R.raw.sizes, hp = A.d.map(function (o) { return pct0(o.share.hp); }).join(", "), ret = A.d.map(function (o) { return pct0(o.retShare); }).join(", ");
    var cap = R.raw.capDual;
    return "With CO₂ at most " + capPct + "% of 2025, the LP puts heat pumps in " + hp + " of the core's, suburbs' and fringe's heat, retrofits " + ret + ", district heat " + pct0(A.d[0].share.dh) +
      ", " + kilo(sz.pvAdd) + " MW of rooftop solar and " + kilo(sz.batAdd) + " MW of batteries. " + (cap != null && cap > 0.5 ? "The cap binds: the last tonne cut costs about $" + kilo(cap) + " (the cap's dual)." : "The cap does not bind: its dual is $0.");
  }
  function compareRows(runs) {
    return runs.map(function (x) {
      var R = x.R;
      return { key: x.key, name: x.label, cost: R.delta.cost, co2: R.acc.co2Hub, up: upTotal(R), burden: R.hh.low.burden };
    });
  }
  var page = { PLANS: PLANS, CHOOSE: CHOOSE, words: words, chooseWords: chooseWords, compareRows: compareRows, upTotal: upTotal, kilo: kilo, mil: mil, signedMil: signedMil, pct1: pct1, pct0: pct0 };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E3) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E3 = LX.E3, U = E3.ui;
  LX.mount("m12", function (live, data, root) {
    var P = E3.prepare(data.prairie_city, data.e3_city_hub), S = E3.sb3Schema(P.cfg), DEF = E3.defaults(S);
    var S0 = { runs: {}, choose: null, cap: CHOOSE.capDef, rule: "even", runners: {} }, stub = null;
    function planOf(id) { return Object.assign({}, DEF, PLANS[id].state); }
    function solver() { if (!stub) return null; stub = null; return function () { return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" }); }; }
    function kpi(host, label, value, tone) { var d = H("div", { class: "lx-readout " + (tone || "") }, host); H("span", { text: label }, d); H("b", { text: value }, d); }
    function says(t) { return LX.rich(t); }
    H("p", { class: "lx-hint e3-line", text: P.line }, live);
    // a run step: one plan through E3 with BenchRun (failure states, Try again, busy holds Next)
    function runStep(act, api, id, after) {
      var kp = H("div", { class: "lx-readouts" }), res = H("div", { class: "m12-res" });
      var run = LX.BenchRun(act, { label: "Run: " + PLANS[id].label, busy: api.busy, results: [kp, res], state: function () { return planOf(id); },
        solve: function (st, ctx) { return E3.solve(st, P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); },
        render: function (R) {
          if (id === "flex" && S0.runs.electrify) R.prev = S0.runs.electrify;
          S0.runs[id] = R;
          kp.innerHTML = ""; R.dist.forEach(function (d) { kpi(kp, d.label, kilo(d.peak) + " / " + kilo(d.limit) + " MW", d.upg > 0.05 ? "warn" : "good"); }); kpi(kp, "Upgrades", kilo(upTotal(R)) + " MW", upTotal(R) > 0.05 ? "warn" : "good");
          res.innerHTML = ""; if (after) after(R, res);
          api.done(); api.saw(words(id, R, P) + (id === "flex" && !R.prev ? " (Run step 4 first to compare.)" : ""));
          refreshExplain();
        } });
      act.appendChild(kp); act.appendChild(res);
      if (S0.runs[id]) api.done();
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
          var tr = H("ul", { class: "m12-trick" }, act);
          ["**The trick that keeps it linear:** heat is split into shares y[e][s] of each district: envelope e (as built, retrofitted) × system s (furnace, resistance, heat pump, district heat). Heating power is a sum of shares × heat ÷ [[coefficient-of-performance|COP]], never a product of two decisions.",
            "**Run or choose:** the City Planner fixes the shares from your sliders; step 6 lets the LP choose them."].forEach(function (t) { H("li", { html: says(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, tr); });
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
      { text: "Add flexibility: managed charging (each day's charge in any hours of that day) and 40 MW of batteries at the substations. Which upgrades disappear?",
        build: function (act, api) { runStep(act, api, "flex"); } },
      // 6 the LP chooses under a cap
      { text: "Let the LP choose: heat pumps, retrofits, district heat, rooftop solar and batteries become decisions, at their yearly costs. Cap the districts' CO₂ and read the cap's dual: the cost of the last tonne.",
        build: function (act, api) {
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
              kp.innerHTML = ""; kpi(kp, "CO₂", kilo(R.acc.co2Hub) + " t"); kpi(kp, "Cap's dual", R.raw.capDual > 0.5 ? "$" + kilo(R.raw.capDual) + "/t" : "$0/t", R.raw.capDual > 0.5 ? "warn" : ""); kpi(kp, "Upgrades", kilo(upTotal(R)) + " MW");
              res.innerHTML = "";
              U.table(res, ["District", "Heat pumps", "Retrofitted", "District heat", "Furnaces left"], R.acc.d.map(function (o) { return [o.label, pct0(o.share.hp), pct0(o.retShare), pct0(o.share.dh), pct0(o.share.fuel)]; }), "m12-chosen");
              api.done(); api.saw(chooseWords(R, st.cap));
              refreshExplain();
            } });
          act.appendChild(stale); act.appendChild(kp); act.appendChild(res);
          S0.runners.choose = function () { run.run({ cap: S0.cap }); };
          H("p", { class: "lx-hint", text: "Half the cars electric with managed charging, fixed; retrofits up to 60% of buildings, district heat up to 40% of the core's heat. Below about 65% no plan within these limits meets the cap: gasoline and water heating stay." }, act);
          if (S0.choose) api.done();
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
            api.done(); api.saw("Homes below 80% of area median income: " + pct1(R.hh.low.burden0) + " in 2025, " + pct1(R.hh.low.burden) + " with this plan and rule. The cost and CO₂ do not change with the rule: they come from the LP.");
          }
          draw();
        } },
      // 8 compare
      { text: "Compare the plans you ran. Cost is against 2025 and includes the cars' fuel (not their prices); CO₂ is the districts'; burden is a screening estimate.",
        build: function (act, api) {
          var host = H("div", null, act);
          var runs = ["today", "electrify", "flex"].filter(function (k) { return S0.runs[k]; }).map(function (k) { return { key: k, label: PLANS[k].label, R: S0.runs[k] }; });
          if (S0.choose) runs.push({ key: "choose", label: "The LP's choice, CO₂ ≤ " + S0.choose.cap + "%", R: S0.choose.R });
          if (!runs.length) { H("p", { class: "lx-hint", text: "Run steps 3 to 6 first." }, host); return; }
          U.table(host, ["Plan", "Yearly cost against 2025", "CO₂ (t a year)", "Upgrades", "Burden, below 80% of AMI"], compareRows(runs).map(function (r) { return [r.name, signedMil(r.cost), kilo(r.co2), kilo(r.up) + " MW", pct1(r.burden)]; }), "m12-compare");
          api.done(); api.saw("One model, four answers: the LP finds the cheapest way to run each plan; which plan to choose, and for whom, is a planning question (A18, C3).");
        } }];
    var cards = LX.StepCards(live, { steps: steps });

    // ---- explain: the hub, the equation card, a comparison of the two modes
    var x = document.getElementById("m12-explain");
    function refreshExplain() {
      x.innerHTML = "";
      U.hubDiagram(H("div", { class: "lx-xcard" }, x), { caption: "An annotated hub: what crosses each district's substation is the only thing the limit constrains." });
      var sym = LX.EquationCard.sym, el = S0.runs.electrify, ch = S0.choose;
      LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
        title: "The hub's linear program, symbol by symbol", lede: "Tap a symbol: what it means, its unit and, once you have run it, its value.", dense: true, label: "The hub's linear program; each symbol is a button",
        fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
        rows: [
          { html: "min Σ<sub><var>k</var>,<var>h</var></sub> " + sym("w", "<var>w</var><sub><var>k</var></sub>") + " Σ<sub><var>d</var></sub> " + sym("p", "<var>p</var><sub><var>d</var></sub>") + " " + sym("imp", "<var>imp</var>") + " + Σ<sub><var>d</var></sub> " + sym("a", "<var>a</var>") + " " + sym("up", "<var>up</var><sub><var>d</var></sub>") + " + fuel and equipment", tag: "goal", say: "Minimise the year's cost: each district's purchases at its price, weighted by the days each representative day stands for, plus upgrades at their yearly cost, plus fuel and, when the LP chooses, equipment." },
          { html: "<var>imp</var> + " + sym("pv", "<var>pv</var>") + " + <var>out</var> − <var>in</var> − " + sym("ev", "<var>ev</var>") + " − Σ<sub><var>e</var>,<var>s</var></sub> " + sym("Q", "<var>Q</var>") + " (1 − σ<var>e</var>) " + sym("y", "<var>y</var><sub><var>e</var>,<var>s</var></sub>") + " / " + sym("cop", "<var>COP</var><sub><var>s</var></sub>") + " = " + sym("B", "<var>B</var>"), tag: "balance", say: "Each district-hour: purchases, rooftop sun and battery output, less charging and heating power, meet the base load." },
          { html: "<var>imp</var> − <var>up</var><sub><var>d</var></sub> ≤ " + sym("L", "<var>L</var><sub><var>d</var></sub>"), tag: "the substation", say: "Each hour's purchase stays under the district's limit plus any upgrade bought." },
          { html: "Σ CO₂ ≤ " + sym("cap", "<var>cap</var>"), tag: "step 6", say: "In step 6, the districts' CO2 a year stays under the cap." }],
        symbols: {
          w: { name: "w_k", label: "w k, days a representative day stands for", unit: "days", words: "Eight days of 2025, weighted to add to 365; the cold design day counts 3.", you: P.w.join(", "), code: "P.w[k]" },
          p: { name: "p_d", label: "p d, the district's electricity price", unit: "$/MWh", words: "Each district's 2025 blend of Kansas's residential and commercial prices (EIA).", you: P.D.map(function (D) { return D.label + " $" + D.pEl.toFixed(2); }).join("; "), code: "P.D[d].pEl" },
          imp: { name: "imp", label: "imp, purchase through the substation", unit: "MW in an hour", words: "Electricity bought through the district's substation in one hour; never negative (no reverse flow).", you: el ? "Busiest, electrified: " + peaksText(el) : "Run step 4.", code: '"i" + d + "_" + k + "_" + h' },
          a: { name: "a", label: "a, the upgrade's yearly cost", unit: "$ per MW a year", words: "The up-front cost per kW you set, paid over 40 years at 4% real.", you: "$" + kilo(E3.sysOf(DEF, P).a.up) + " per MW a year at $" + kilo(DEF.upc) + "/kW.", code: "S.a.up" },
          up: { name: "up_d", label: "up d, upgrade bought", unit: "MW", words: "More room at the district's substation, bought once for the year's busiest hour.", you: el ? kilo(upTotal(el)) + " MW in all, electrified." : "Run step 4.", code: '"upg" + d' },
          pv: { name: "pv", label: "pv, rooftop solar used", unit: "MW", words: "Up to the panels' output that hour; the rest is spilled.", you: "17.6% capacity factor (EIA's rooftop figure).", code: '"s" + d + "_" + k + "_" + h' },
          ev: { name: "ev", label: "ev, car charging", unit: "MW", words: "Unmanaged: the evening profile. Managed: each day's energy in any hours of that day, at most a sixth of it in one hour.", you: "Half the cars: about " + kilo(P.D.reduce(function (s, D) { return s + Math.max(D.evs0, Math.round(0.5 * D.ldv)); }, 0)) + " EVs.", code: '"v" + d + "_" + k + "_" + h' },
          Q: { name: "Q", label: "Q, heat needed that hour", unit: "MW of heat", words: "Degree-hours below 18.3 °C times the district's heat-loss rate (prairie-city.json).", you: "Design day, 03:00: " + P.D.map(function (D) { return D.label + " " + kilo(D.Q[0][3]) + " MW"; }).join("; "), code: "P.D[d].Q[k][h]" },
          y: { name: "y_e,s", label: "y e s, a building share", unit: "share of the district's heat", words: "The share of heat in envelope e with system s. Fixed in a run; a decision when the LP chooses. They add to 1.", you: ch ? "Step 6: heat pumps " + ch.R.acc.d.map(function (o) { return pct0(o.share.hp); }).join(", ") + "." : "Run step 6.", code: '"y" + d + e + s' },
          cop: { name: "COP_s", label: "COP s, heat per unit of power", unit: "MWh of heat per MWh", words: "Heat pump: 144 ÷ (45 − T), 2.4 at −15 °C, 1 below −23 °C; resistance: 1; furnace and district heat: no district power.", you: "Design day 03:00: " + P.cop[0][3].toFixed(2), code: "P.cop[k][h]" },
          B: { name: "B", label: "B, the base load", unit: "MW", words: "Everything but space heating and cars, spread by SPP's 2025 demand shape.", you: "Design day 18:00, core: " + kilo(P.D[0].B[0][18]) + " MW", code: "P.D[d].B[k][h]" },
          L: { name: "L_d", label: "L d, the substation's limit", unit: "MW", words: "15% above the district's 2025 busiest hour (a teaching simplification: one substation per district).", you: P.D.map(function (D) { return D.label + " " + kilo(D.L) + " MW"; }).join("; "), code: "P.D[d].L" },
          cap: { name: "cap", label: "cap, CO2 ceiling", unit: "t a year", words: "A share of 2025's districts' CO2; its dual is the cost of the last tonne cut.", you: ch ? ch.cap + "% of 2025: dual $" + kilo(ch.R.raw.capDual || 0) + "/t." : "Run step 6.", code: "o.cap" } } });
      LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
        title: "Run or choose: one model, two modes", lede: "The same rules; what is fixed changes.", text: true,
        columns: [{ key: "name", label: "", main: true }, { key: "run", label: "Run (SB3, C3)" }, { key: "choose", label: "Choose (step 6)" }],
        rows: [{ key: "y", name: "Building shares", run: { text: "fixed by the sliders" }, choose: { text: "decisions, with their yearly costs" } },
          { key: "eq", name: "Equipment sizes", run: { text: "fixed" }, choose: { text: "decisions, up to stated maxima" } },
          { key: "d", name: "Duals to read", run: { text: "substation room; balance" }, choose: { text: "the same, plus the CO₂ cap" } },
          { key: "hh", name: "Household table", run: { text: "accounting layer after the LP" }, choose: { text: "the same: never in the LP" } }],
        sorts: [{ label: "As listed", order: ["y", "eq", "d", "hh"] }] });
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
