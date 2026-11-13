// k02-rates-efficiencies.js — Toolbox K2, "Rates and efficiencies" (step cards).
//
// Just-in-time math for lesson 1 (the average power a home buys from the grid), lesson 5 (capacity factor), lesson 7 (fuel cost per MWh from a
// heat rate) and lessons 9 and 13 (a battery's round trip). Five step cards, an explain layer and a practice drill.
//
// Data (read through data-src, so every number stays the same as in the lessons that use it):
//   assets/learn/data/01-power-energy.json  anchors.home_year (EIA: 10,791 kWh a year, 2022 data), fermi.hours (8,760)
//   assets/learn/data/07-cost.json          techs.cc / techs.peaker heat rates (EIA AEO2026 assumptions, Table 3: 6.226 and
//                                           9.142 MMBtu per MWh) and fuel.gas ($3.85 per MMBtu, EIA, 2025)
//   assets/learn/data/13-capstone.json      fuel.co2PerMMBtu (EIA: 52.91 kg CO2 per MMBtu) and techs.battery.rte (85%,
//                                           NREL 2025)
//   assets/learn/data/town.json             fleet.wind.mw (Prairie Town's 150 MW wind farm, illustrative)
//   assets/learn/data/cf_targets.json       targets.wind.cf (EIA: U.S. wind 33.8% in 2025)
//   assets/learn/data/k02-rates-efficiencies.json   the one new constant: 3,412 Btu per kWh (EIA FAQ, checked 3 Nov 2026), and
//                                           the cited 82% U.S. battery benchmark (EIA, 2019 data) behind the battery note
//
// Model (closed form):
//   average power (kW)       = energy (kWh) ÷ hours; the EIA home figure is electricity bought from the grid, so its
//                              quotient is the average power bought (homes with their own solar use more than they buy)
//   fuel cost ($/MWh)        = heat rate (MMBtu/MWh) × gas price ($/MMBtu)              (lesson 7's lcoe().fuel)
//   CO2 (kg/MWh)             = heat rate (MMBtu/MWh) × 52.91 kg/MMBtu                   (lesson 13's costs().co2 × 1,000)
//                              operating CO2 at the plant only (no fuel supply, no construction)
//   efficiency               = 3.412 MMBtu/MWh ÷ heat rate (MMBtu/MWh)                  (EIA: 3,412 Btu ÷ heat rate in Btu/kWh)
//   chained efficiencies     = product of the stages; energy needed in = energy wanted out ÷ efficiency
//   capacity factor          = energy in a year (MWh) ÷ (size (MW) × 8,760 h)           (lesson 5's annualEnergy)
// Every number the page states comes from this model or the data files; _tests/learn/test_k02-rates-efficiencies.js
// checks them against lessons 1, 5, 7 and 13 and against the page (it also writes the no-JS table: --write).
(function () {
  "use strict";
  // shared pieces: LX.NumAnswer (number boxes; close() is its tolerance check) and LX.Drill (the seeded practice drill)
  var NA = (typeof window !== "undefined" && window.LX && window.LX.NumAnswer) || require("./components/numanswer.js");
  var DR = (typeof window !== "undefined" && window.LX && window.LX.Drill) || require("./components/drill.js");

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function avgKW(kwh, hours) { return kwh / hours; }
  function fuelCost(hr, gas) { return hr * gas; }
  function co2Kg(hr, kgPerMMBtu) { return hr * kgPerMMBtu; }
  function efficiency(hr, mmbtuPerMWh) { return mmbtuPerMWh / hr; }
  function heatRateFor(eff, mmbtuPerMWh) { return mmbtuPerMWh / eff; }
  function chain(effs) { return effs.reduce(function (a, e) { return a * e; }, 1); }
  function energyOut(inMWh, eff) { return inMWh * eff; }
  function energyIn(outMWh, eff) { return outMWh / eff; }
  function cfEnergy(mw, cf, hours) { return mw * hours * cf; }
  function cfOf(mwh, mw, hours) { return mwh / (mw * hours); }

  // number formats shared by the page and the test (the test checks the page's text with these)
  function num(v, d) { d = d == null ? 0 : d; return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function usd(v, d) { return (v < 0 ? "−$" : "$") + num(Math.abs(v), d == null ? 2 : d); }
  function pct(v, d) { return num(v * 100, d == null ? 1 : d) + "%"; }

  // the page's story numbers, from the lessons' data files
  function story(D1, D7, D13, town, cft, DK) {
    var s = {};
    s.homeKWh = D1.anchors.home_year.value; s.hours = D1.fermi.hours;
    s.homeKW = avgKW(s.homeKWh, s.hours); s.homeW = s.homeKW * 1000;
    s.hrCC = D7.techs.cc.heatRate; s.hrPK = D7.techs.peaker.heatRate; s.gas = D7.fuel.gas;
    s.fuelCC = fuelCost(s.hrCC, s.gas); s.fuelPK = fuelCost(s.hrPK, s.gas);
    s.co2Coef = D13.fuel.co2PerMMBtu; s.co2CC = co2Kg(s.hrCC, s.co2Coef); s.co2PK = co2Kg(s.hrPK, s.co2Coef);
    s.btu = DK.btuPerKWh.value; s.k = s.btu / 1000;                       // 3,412 Btu per kWh = 3.412 MMBtu per MWh
    s.effCC = efficiency(s.hrCC, s.k); s.effPK = efficiency(s.hrPK, s.k);
    s.gasRatio = s.hrPK / s.hrCC; s.points = (s.effCC - s.effPK) * 100;
    s.rte = D13.techs.battery.rte; s.target = 100;
    s.back = energyOut(s.target, s.rte); s.need = energyIn(s.target, s.rte);
    s.naive = s.target * (1 + (1 - s.rte)); s.naiveBack = energyOut(s.naive, s.rte);
    s.chainEff = chain([s.effCC, s.rte]);
    s.gasIn = 100; s.chainMWh = s.gasIn / s.hrCC; s.chainBack = s.chainMWh * s.rte;   // 100 MMBtu of gas, through the plant and the battery
    s.windMW = town.fleet.wind.mw; s.windCF = cft.targets.wind.cf;
    s.windMax = s.windMW * s.hours; s.windE = cfEnergy(s.windMW, s.windCF, s.hours);
    // the quiz
    s.quiz = { cfMW: 100, cfMWh: 438000 }; s.quiz.cf = cfOf(s.quiz.cfMWh, s.quiz.cfMW, s.hours);
    return s;
  }

  // the rates of the page, one row each (the explain table and the no-JS table)
  function rateRows(s) {
    return [
      { key: "avg", name: "Average power bought from the grid", unit: "kW = kWh per hour", ex: num(s.homeKWh) + " kWh ÷ " + num(s.hours) + " h = " + num(s.homeKW, 3) + " kW", used: "lesson 1" },
      { key: "hr", name: "Heat rate", unit: "MMBtu per MWh", ex: num(s.hrCC, 3) + " (combined-cycle), " + num(s.hrPK, 3) + " (peaker)", used: "lessons 7, 12, 13" },
      { key: "fuel", name: "Fuel cost", unit: "$ per MWh", ex: num(s.hrCC, 3) + " × " + usd(s.gas) + " = " + usd(s.fuelCC), used: "lesson 7" },
      { key: "co2", name: "CO₂ at the plant", unit: "kg per MWh", ex: num(s.hrCC, 3) + " × " + num(s.co2Coef, 2) + " = " + num(s.co2CC) + " kg", used: "lessons 12, 13" },
      { key: "eff", name: "Efficiency", unit: "% (out ÷ in)", ex: num(s.k, 3) + " ÷ " + num(s.hrCC, 3) + " = " + pct(s.effCC), used: "lesson 7" },
      { key: "rte", name: "Round trip", unit: "% (back ÷ in)", ex: num(s.need, 1) + " MWh in, " + num(s.target) + " MWh back at " + pct(s.rte, 0), used: "lessons 9, 13" },
      { key: "cf", name: "Capacity factor", unit: "% (made ÷ most possible)", ex: num(s.windMW) + " MW × " + num(s.hours) + " h × " + pct(s.windCF) + " = " + num(s.windE) + " MWh", used: "lesson 5" }];
  }

  // ---------------------------------------------------------------- the no-JS table (written into the page by the test)
  function staticBlocks(s) {
    var rows = rateRows(s).map(function (r) { return "<tr><td>" + r.name + "</td><td>" + r.unit + "</td><td>" + r.ex + "</td></tr>"; }).join("\n");
    return { rates: '<table class="k2-static" aria-label="The rates and ratios of this page, worked">\n' +
      '<thead><tr><th scope="col">Rate</th><th scope="col">Unit</th><th scope="col">Worked on this page</th></tr></thead>\n<tbody>\n' + rows + "\n</tbody></table>" };
  }

  // ---------------------------------------------------------------- practice drill items (seeded by LX.Drill, so tests can replay them)
  var KINDS = ["avg", "fuel", "eff", "back", "co2", "cf", "chain"];
  var HOURS = 8760, K_MMBTU = 3.412, CO2_COEF = 52.91;
  function drillItem(k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (a) { return a[Math.floor(r() * a.length)]; };
    if (kind === "avg") {
      var e = pick([4380, 6000, 8760, 10791, 12000, 17520]), w = e * 1000 / HOURS;
      return { kind: kind, q: "A home uses " + num(e) + " kWh in a year (" + num(HOURS) + " h). What is its average power, in watts?", answer: w, tol: 1.5, unit: "W",
               why: num(e) + " kWh ÷ " + num(HOURS) + " h = " + num(e / HOURS, 3) + " kW = " + num(w) + " W." };
    }
    if (kind === "fuel") {
      var hr = pick([6.2, 6.5, 7.0, 7.5, 8.0, 9.0, 10.0, 10.5]), g = pick([2.5, 3.0, 3.5, 3.85, 4.5, 5.0, 6.0]), f = fuelCost(hr, g);
      return { kind: kind, q: "A gas plant's heat rate is " + num(hr, 1) + " MMBtu per MWh and gas costs " + usd(g) + " per MMBtu. Its fuel cost per MWh, in dollars?", answer: f, tol: 0.02, unit: "$",
               why: num(hr, 1) + " MMBtu/MWh × " + usd(g) + "/MMBtu = " + usd(f) + " per MWh: MMBtu cancels." };
    }
    if (kind === "eff") {
      var h2 = pick([6.0, 6.5, 7.0, 7.5, 8.0, 9.0, 10.0, 10.5, 11.0]), ef = efficiency(h2, K_MMBTU);
      return { kind: kind, q: "A plant's heat rate is " + num(h2, 1) + " MMBtu per MWh. Its efficiency, in %, to one decimal?", answer: ef * 100, tol: 0.15, unit: "%",
               why: num(K_MMBTU, 3) + " ÷ " + num(h2, 1) + " = " + pct(ef) + "." };
    }
    if (kind === "co2") {
      var h3 = pick([6.2, 6.5, 7.0, 7.5, 8.0, 9.0, 10.0]), c = co2Kg(h3, CO2_COEF);
      return { kind: kind, q: "Gas gives " + num(CO2_COEF, 2) + " kg of CO₂ per MMBtu burned. A plant with a heat rate of " + num(h3, 1) + " MMBtu per MWh emits how many kg per MWh, at the plant?", answer: c, tol: 1.5, unit: "kg",
               why: num(h3, 1) + " × " + num(CO2_COEF, 2) + " = " + num(c) + " kg (" + num(c / 1000, 3) + " t) per MWh." };
    }
    if (kind === "back") {
      var eta = pick([0.75, 0.8, 0.85, 0.9]), x = pick([40, 50, 80, 100, 200]);
      if (r() < 0.5) {
        var o = energyOut(x, eta);
        return { kind: kind, q: "A battery's round trip is " + pct(eta, 0) + ". Charge " + num(x) + " MWh: how many MWh come back?", answer: o, tol: 0.15, unit: "MWh",
                 why: num(x) + " × " + num(eta, 2) + " = " + num(o, 1) + " MWh: multiply going forward." };
      }
      var n = energyIn(x, eta);
      return { kind: kind, q: "A battery's round trip is " + pct(eta, 0) + ". To get " + num(x) + " MWh back, how many MWh must you charge, to one decimal?", answer: n, tol: 0.15, unit: "MWh",
               why: num(x) + " ÷ " + num(eta, 2) + " = " + num(n, 1) + " MWh: divide going backwards (adding " + pct(1 - eta, 0) + " gives too little)." };
    }
    if (kind === "cf") {
      var mw = pick([50, 100, 150, 200, 400]), cf = pick([0.2, 0.25, 0.3, 0.4, 0.5, 0.6]), E = cfEnergy(mw, cf, HOURS);
      if (r() < 0.5) return { kind: kind, q: "A " + num(mw) + " MW plant made " + num(E) + " MWh in a year (" + num(HOURS) + " h). Its capacity factor, in %?", answer: cf * 100, tol: 0.15, unit: "%",
               why: num(E) + " ÷ (" + num(mw) + " × " + num(HOURS) + ") = " + pct(cf) + "." };
      return { kind: kind, q: "A " + num(mw) + " MW plant runs at a " + pct(cf, 0) + " capacity factor for a year (" + num(HOURS) + " h). How many MWh does it make?", answer: E, tol: 1, unit: "MWh",
               why: num(mw) + " MW × " + num(HOURS) + " h × " + pct(cf, 0) + " = " + num(E) + " MWh." };
    }
    // chain: two stages in a row (illustrative efficiencies)
    var e1 = pick([0.35, 0.4, 0.5, 0.55]), e2 = pick([0.8, 0.85, 0.9, 0.95]), right = Math.round(chain([e1, e2]) * 10000) / 10000;   // exact to 0.01 point, so 35% × 95% shows 33.3%, not a float's 33.2%
    var opts = [right, e1 + e2 - 1, (e1 + e2) / 2].map(function (v) { return pct(v); });
    var order = opts.map(function (v, i) { return [r(), v, i]; }).sort(function (a, b) { return a[0] - b[0]; });
    return { kind: kind, q: "Two stages in a row: the first keeps " + pct(e1, 0) + " of the energy, the second " + pct(e2, 0) + " of what reaches it. How much comes out overall?",
             choices: order.map(function (p) { return p[1]; }), answer: order.map(function (p) { return p[2]; }).indexOf(0),
             why: pct(e1, 0) + " × " + pct(e2, 0) + " = " + pct(right) + ": efficiencies multiply; they do not add or average." };
  }
  function drill(seed, n) { return DR.series(drillItem, seed, n); }
  var close = NA.close;   // v within tol of ans (plus 1e-9 for rounding); null is never close

  var model = { avgKW: avgKW, fuelCost: fuelCost, co2Kg: co2Kg, efficiency: efficiency, heatRateFor: heatRateFor, chain: chain, energyOut: energyOut,
                energyIn: energyIn, cfEnergy: cfEnergy, cfOf: cfOf, story: story, rateRows: rateRows, staticBlocks: staticBlocks, drill: drill,
                drillItem: drillItem, rng: DR.rng, close: close, KINDS: KINDS, num: num, usd: usd, pct: pct, K_MMBTU: K_MMBTU, CO2_COEF: CO2_COEF, HOURS: HOURS };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H;

  function textAlt(host, title, items) {
    var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title || "Text version" }, d);
    var ul = H("ul", null, d); (items || []).forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    return { el: d, ul: ul, set: function (list) { ul.innerHTML = ""; list.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); }); } };
  }
  function readouts(host, labels, cls) {
    var box = H("div", { class: "lx-readouts" + (cls ? " " + cls : ""), "aria-live": "polite" }, host), out = {};
    labels.forEach(function (l) { var d = H("div", { class: "lx-readout" }, box); H("span", { text: l[1] }, d); out[l[0]] = H("b", null, d); });
    return out;
  }

  function view(live, data, root) {
    var s = story(data["01_power_energy"], data["07_cost"], data["13_capstone"], data.town, data.cf_targets, data.k02_rates_efficiencies);
    var steps = [], autos = {}, eqRef = {};
    var HR = num(s.hrCC, 3), HRP = num(s.hrPK, 3), G = usd(s.gas), CO = num(s.co2Coef, 2), KK = num(s.k, 3);

    // ---- step 1: a rate is a "per"
    steps.push({
      text: "A rate is one amount per another. An average U.S. home buys " + num(s.homeKWh) + " [[kilowatt-hour|kWh]] from the grid in a year of " + num(s.hours) + " hours: what is the [[average-power|average power]] it buys, in watts (W)?",
      build: function (act, api) {
        var uc = LX.UnitChain(act, { label: "Average power bought from the grid", steps: [{ v: num(s.homeKWh) + " kWh", u: "in a year" }, { op: "÷ " + num(s.hours) + " h =" }, { v: "? kW", u: "average power bought", out: true }] });
        var tries = 0;
        var n = LX.NumAnswer(act, { label: "Average power bought:", unit: "W", onCheck: function (v) {
          tries++;
          if (close(v, s.homeW, 1)) {
            uc.set([{ v: num(s.homeKWh) + " kWh", u: "in a year" }, { op: "÷ " + num(s.hours) + " h =" }, { v: num(s.homeKW, 3) + " kW", u: "= " + num(s.homeW) + " W", out: true }]);
            api.done(); api.saw("kWh per hour is kW: " + num(s.homeKW, 3) + " kW, or " + num(s.homeW) + " W bought from the grid on average, as in lesson 1. A rate's unit says what was divided by what.");
          } else if (v != null && close(v, s.homeKW, 0.002)) api.saw("That is in kW. One kW is 1,000 W: multiply by 1,000.", true);
          else api.saw(tries < 2 ? "Not yet. Divide the kWh by the hours, then turn kW into W." : num(s.homeKWh) + " ÷ " + num(s.hours) + " = " + num(s.homeKW, 3) + " kW = " + num(s.homeW) + " W.", true);
        } });
        autos[0] = function () { n.input.value = String(Math.round(s.homeW)); n.go(); };
      }
    });

    // ---- step 2: chain rates so the units cancel
    var FACTORS = [
      { key: "gas", label: G + " per MMBtu", unit: "$ per MWh", value: s.fuelCC, text: usd(s.fuelCC) + " per MWh" },
      { key: "co2", label: CO + " kg CO₂ per MMBtu", unit: "kg per MWh", value: s.co2CC, text: num(s.co2CC) + " kg CO₂ per MWh" },
      { key: "k", label: KK + " MMBtu per MWh", unit: null }];
    var GOALS = [{ key: "gas", want: "$ per MWh", title: "Fuel cost, $ per MWh" }, { key: "co2", want: "kg CO₂ per MWh", title: "CO₂, kg per MWh" }];
    steps.push({
      text: "Lesson 7's [[combined-cycle|combined-cycle plant]] burns " + HR + " [[mmbtu|MMBtu]] of gas per MWh: its [[heat-rate|heat rate]]. Rates multiply when the units cancel, so for each goal pick the rate that cancels MMBtu.",
      build: function (act, api) {
        var right = {};
        GOALS.forEach(function (gl) {
          var box = H("div", { class: "k2-goal" }, act);
          H("p", { class: "k2-goal-t", text: "Goal: " + gl.title }, box);
          var row = H("div", { class: "lx-choices-row", role: "group", "aria-label": "Rate for: " + gl.title }, box), btns = [];
          var out = H("div", { class: "k2-goal-out", "aria-live": "polite" }, box);
          FACTORS.forEach(function (f, i) {
            var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: f.label }, row);
            b.addEventListener("click", function () {
              var ok = f.key === gl.key;
              btns.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); x.classList.toggle("right", j === i && ok); x.classList.toggle("wrong", j === i && !ok); });
              out.innerHTML = "";
              if (ok) {
                LX.UnitChain(out, { label: gl.title, steps: [{ v: HR, u: "MMBtu per MWh" }, { op: "×" }, { v: f.key === "gas" ? G : CO, u: f.key === "gas" ? "$ per MMBtu" : "kg CO₂ per MMBtu" }, { op: "=" }, { v: f.key === "gas" ? usd(f.value) : num(f.value) + " kg", u: gl.want, out: true }] });
              } else {
                H("p", { class: "k2-why", text: f.key === "k" ? "MMBtu per MWh × MMBtu per MWh: nothing cancels, so this is not " + gl.want + "." : "MMBtu cancels, but the result is " + f.unit + ", not " + gl.want + "." }, out);
              }
              right[gl.key] = ok;
              if (right.gas && right.co2) {
                LX.store.set("k2-own", Object.assign({}, LX.store.get("k2-own") || {}, { chains: true }));
                api.done(); api.saw("MMBtu cancels both times: " + usd(s.fuelCC) + " of fuel and " + num(s.co2CC) + " kg (" + num(s.co2CC / 1000, 3) + " t, metric tonnes) of CO₂ per MWh, counted at the plant only. Lesson 7 uses the first; lessons 12 and 13 the second.");
              }
            });
            btns.push(b);
          });
          gl.btns = btns;
        });
        autos[1] = function () { GOALS.forEach(function (gl) { gl.btns[FACTORS.map(function (f) { return f.key; }).indexOf(gl.key)].click(); }); };
      }
    });

    // ---- step 3: heat rate to efficiency
    var PLANTS = [{ key: "cc", name: "Combined-cycle plant", hr: s.hrCC, eff: s.effCC, color: "var(--lx-cc)" }, { key: "pk", name: "Peaker", hr: s.hrPK, eff: s.effPK, color: "var(--lx-pk)" }];
    steps.push({
      text: "One MWh of electricity holds " + KK + " MMBtu, so [[efficiency|efficiency]] = " + KK + " ÷ heat rate: " + pct(s.effCC) + " for the combined-cycle plant. Is the [[peaker|peaker]], with a heat rate of " + HRP + ", more or less efficient?",
      build: function (act, api) {
        var row = H("div", { class: "lx-choices-row", role: "group", "aria-label": "Your answer" }, act), btns = [];
        var box = H("div", { class: "k2-eff" }, act), shown = false;
        [["less", "Less efficient"], ["more", "More efficient"]].forEach(function (c, i) {
          var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: c[1] }, row);
          b.addEventListener("click", function () {
            var ok = c[0] === "less";
            btns.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); x.classList.toggle("right", j === i && ok); x.classList.toggle("wrong", j === i && !ok); });
            reveal();
            LX.store.set("k2-own", Object.assign({}, LX.store.get("k2-own") || {}, { plant: "pk" }));
            if (eqRef.card) eqRef.card.select(eqRef.card.current());   // the explain card's open symbol shows the plant just looked at
            api.done();
            api.saw((ok ? "Right: " : "Less: ") + KK + " ÷ " + HRP + " = " + pct(s.effPK) + ", so the peaker burns " + num(s.gasRatio, 2) + " times as much gas per MWh. A higher heat rate means a lower efficiency; the rest leaves as heat.");
          });
          btns.push(b);
        });
        function reveal() {
          if (shown) return; shown = true;
          H("p", { class: "k2-hint", text: "Of every 100 MMBtu of gas burned:" }, box);
          PLANTS.forEach(function (p) {
            var rw = H("div", { class: "k2-effrow" }, box);
            H("span", { class: "k2-effnm", text: p.name }, rw);
            LX.CostSplit.bar(rw, [{ color: p.color, value: p.eff * 100 }, { color: "var(--lx-line-2)", value: 100 - p.eff * 100 }], 100, { height: 18 });
            H("b", { text: pct(p.eff) }, rw);
          });
          H("p", { class: "k2-key", text: "Bright part: becomes electricity. Gray part: leaves as heat." }, box);
          textAlt(box, "Text version", PLANTS.map(function (p) { return p.name + ": heat rate " + num(p.hr, 3) + " MMBtu per MWh, so " + KK + " ÷ " + num(p.hr, 3) + " = " + pct(p.eff) + " of the gas's energy becomes electricity and " + pct(1 - p.eff) + " leaves as heat."; }));
        }
        autos[2] = function () { btns[0].click(); };
      }
    });

    // ---- step 4: efficiencies multiply going forward; dividing undoes them
    steps.push({
      text: "Lesson 13's battery gives back " + pct(s.rte, 0) + " of what it takes in, its [[round-trip-efficiency|round-trip efficiency]]: charge " + num(s.target) + " MWh and " + num(s.back) + " come back. To get " + num(s.target) + " MWh back, how much must you charge, to one decimal place?",
      build: function (act, api) {
        var uc = LX.UnitChain(act, { label: "Battery round trip", steps: [{ v: "? MWh", u: "charged" }, { op: "× " + num(s.rte, 2) + " =" }, { v: num(s.target) + " MWh", u: "back", out: true }] });
        var tries = 0;
        var n = LX.NumAnswer(act, { label: "Charge:", unit: "MWh", onCheck: function (v) {
          tries++;
          if (close(v, s.need, 0.06)) {
            uc.set([{ v: num(s.need, 1) + " MWh", u: "charged" }, { op: "× " + num(s.rte, 2) + " =" }, { v: num(s.target) + " MWh", u: "back", out: true }]);
            api.done(); api.saw(num(s.target) + " ÷ " + num(s.rte, 2) + " = " + num(s.need, 1) + " MWh. Going forward through a loss, multiply; going backwards, divide.");
          } else if (v != null && close(v, s.naive, 0.5)) api.saw("Adding " + pct(1 - s.rte, 0) + " is not enough: " + num(s.naive) + " × " + num(s.rte, 2) + " = " + num(s.naiveBack, 2) + " MWh back. Divide by " + num(s.rte, 2) + " instead.", true);
          else api.saw(tries < 2 ? "Not yet. What times " + num(s.rte, 2) + " gives " + num(s.target) + "? Divide." : num(s.target) + " ÷ " + num(s.rte, 2) + " = " + num(s.need, 1) + " MWh.", true);
        } });
        autos[3] = function () { n.input.value = num(s.need, 1); n.go(); };
      }
    });

    // ---- step 5: capacity factor is a ratio
    steps.push({
      text: "A [[capacity-factor|capacity factor]] is energy made ÷ the most possible over the same period. In a year, Prairie Town's " + num(s.windMW) + " MW wind farm could make " + num(s.windMax) + " MWh: at U.S. wind's " + pct(s.windCF) + " in 2025, how many MWh?",
      build: function (act, api) {
        var rows = H("div", { class: "k2-cf" }, act);
        var r1 = H("div", { class: "k2-effrow" }, rows); H("span", { class: "k2-effnm", text: "Most possible" }, r1);
        LX.CostSplit.bar(r1, [{ color: "var(--lx-wind)", value: 100 }], 100, { height: 18 }); H("b", { text: num(s.windMax) }, r1);
        var r2 = H("div", { class: "k2-effrow" }, rows); H("span", { class: "k2-effnm", text: "At " + pct(s.windCF) }, r2);
        var bar = LX.CostSplit.bar(r2, [], 100, { height: 18 }), made = H("b", { text: "?" }, r2);
        H("p", { class: "k2-key", text: num(s.windMW) + " MW × " + num(s.hours) + " h = " + num(s.windMax) + " MWh: the farm at full output every hour of the year." }, act);
        var gwh = H("p", { class: "k2-key", "aria-live": "polite" }, act);   // the GWh conversion, a caption of its own once the answer is in
        var tries = 0;
        var n = LX.NumAnswer(act, { label: "A year's energy:", unit: "MWh", onCheck: function (v) {
          tries++;
          if (close(v, s.windE, 1000)) {
            LX.CostSplit.fill(bar, [{ color: "var(--lx-wind)", value: s.windCF * 100 }], 100); made.textContent = num(s.windE);
            gwh.textContent = "In GWh (thousands of MWh): " + num(s.windE) + " MWh ≈ " + num(s.windE / 1000) + " GWh.";
            api.done(); api.saw(num(s.windMax) + " × " + num(s.windCF, 3) + " = " + num(s.windE) + " MWh in a year.");
          } else if (v != null && close(v, s.windE / 1000, 1)) api.saw("That is in GWh. One GWh is 1,000 MWh: multiply by 1,000.", true);
          else api.saw(tries < 2 ? "Not yet. Multiply the most possible by " + num(s.windCF, 3) + " (" + pct(s.windCF) + " as a fraction)." : num(s.windMax) + " × " + num(s.windCF, 3) + " = " + num(s.windE) + " MWh.", true);
        } });
        autos[4] = function () { n.input.value = String(Math.round(s.windE)); n.go(); };
        textAlt(act, "Text version", ["Most possible in a year: " + num(s.windMax) + " MWh (" + num(s.windMW) + " MW × " + num(s.hours) + " h).", "At a " + pct(s.windCF) + " capacity factor the farm makes " + num(s.windE) + " MWh, " + pct(s.windCF) + " of the most possible."]);
      }
    });

    var cards = LX.StepCards(live, { id: "k2-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // "mid" = step 2 with both chains picked; "step-N" = card N with its action done; "done" = the last card done
      var k = state === "mid" ? 1 : state === "done" ? steps.length - 1 : /^step-(\d+)$/.test(state) ? Math.max(0, Math.min(steps.length - 1, +state.slice(5) - 1)) : -1;
      if (k < 0) return null;
      cards.go(k); if (autos[k]) autos[k]();
      return { view: "step " + (k + 1) };
    }, cards);

    explain(s, eqRef);
    drillView();
  }

  // ---------------------------------------------------------------- explain layer
  function explain(s, eqRef) {
    var x = document.getElementById("k2-explain"); if (!x) return; x.innerHTML = "";
    var KK = num(s.k, 3);
    function plant() { var o = LX.store.get("k2-own"); return o && o.plant === "pk" ? { name: "the peaker", hr: s.hrPK, eff: s.effPK, fuel: s.fuelPK, co2: s.co2PK, own: true } : { name: "the combined-cycle plant", hr: s.hrCC, eff: s.effCC, fuel: s.fuelCC, co2: s.co2CC, own: false }; }
    function you(kind) {
      return function () {
        var p = plant(), head = (p.own ? "The last plant you looked at, " : "The ") + (p.own ? p.name : p.name.replace(/^the /, "")) + ": ";
        if (kind === "eta") return head + KK + " ÷ " + num(p.hr, 3) + " = " + pct(p.eff) + ".";
        if (kind === "hr") return head + num(p.hr, 3) + " MMBtu per MWh.";
        if (kind === "fuel") return head + num(p.hr, 3) + " × " + usd(s.gas) + " = " + usd(p.fuel) + " per MWh.";
        if (kind === "co2") return head + num(p.hr, 3) + " × " + num(s.co2Coef, 2) + " = " + num(p.co2) + " kg per MWh.";
        return null;
      };
    }
    eqRef.card = LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "Three rates from one heat rate", lede: "Tap a symbol: its meaning, its unit and your numbers from step 3.",
      rows: [
        { parts: [{ k: "eta" }, "=", { k: "k" }, "÷", { k: "hr" }], say: "Efficiency equals 3.412 MMBtu per MWh divided by the heat rate.", tag: "efficiency" },
        { parts: [{ k: "fuel" }, "=", { k: "hr" }, "×", { k: "p" }], say: "Fuel cost per MWh equals the heat rate times the gas price.", tag: "fuel cost" },
        { parts: [{ k: "co2" }, "=", { k: "hr" }, "×", { k: "ef" }], say: "CO₂ per MWh equals the heat rate times the CO₂ per MMBtu of gas.", tag: "CO₂ at the plant" }],
      symbols: {
        eta: { sym: "η", name: "Efficiency", unit: "%", color: "var(--lx-good)", words: "The share of the fuel's energy that leaves as electricity.", you: you("eta"), code: "eta = 3.412 / hr" },
        k: { sym: "3.412", name: "Energy in one MWh", unit: "MMBtu per MWh", color: "var(--lx-ink-3)", words: "One MWh of electricity holds 3.412 MMBtu (3,412 Btu per kWh, EIA).", code: "k = 3.412" },
        hr: { sym: "HR", name: "Heat rate", unit: "MMBtu per MWh", color: "var(--lx-cc)", words: "Gas burned per MWh made; lower is better.", you: you("hr"), code: function () { return "hr = " + num(plant().hr, 3); } },
        fuel: { sym: "F", name: "Fuel cost", unit: "$ per MWh", color: "var(--lx-tier-2)", words: "What the gas for one MWh costs; lesson 7 adds upkeep and building cost to it.", you: you("fuel"), code: "fuel = hr * gas" },
        p: { sym: "p", name: "Gas price", unit: "$ per MMBtu", color: "var(--lx-tier-5)", words: "The 2025 U.S. average cost of gas to power plants, " + usd(s.gas) + " (EIA).", code: "gas = " + num(s.gas, 2) },
        co2: { sym: "CO₂", name: "CO₂ per MWh", unit: "kg per MWh", color: "var(--lx-ink)", words: "[[operating-emissions|Operating CO₂]] at the plant's stack; the gas's supply chain is outside this boundary.", you: you("co2"), code: "co2 = hr * 52.91" },
        ef: { sym: "c", name: "CO₂ per MMBtu", unit: "kg per MMBtu", color: "var(--lx-tier-4)", words: "Natural gas gives " + num(s.co2Coef, 2) + " kg of CO₂ per MMBtu burned (EIA).", code: "c = 52.91" } },
      fields: [{ key: "you", label: "Your numbers" }, { key: "code", label: "In code", code: true }],
      sel: "eta", hint: "All three are rates: each multiplies or divides something per MWh."
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Rates and ratios on this page", text: true,
      columns: [{ key: "name", label: "Rate", main: true }, { key: "unit", label: "Unit" }, { key: "ex", label: "Worked here" }, { key: "used", label: "Used in", phoneHide: true }],
      rows: rateRows(s).map(function (r, i) { return { key: r.key, color: ["var(--lx-demand)", "var(--lx-cc)", "var(--lx-tier-2)", "var(--lx-ink)", "var(--lx-good)", "var(--lx-tier-3)", "var(--lx-wind)"][i], name: r.name, unit: r.unit, ex: r.ex, used: r.used }; })
    });
    LX.EnergyChain(H("div", { class: "lx-xcard" }, x), {
      title: "Efficiencies multiply along a chain", aside: "Gas to a stored MWh",
      lede: "Burn " + num(s.gasIn) + " MMBtu of gas in the combined-cycle plant, store the electricity, and take it back out.",
      stops: [
        { icon: "flame", title: "Gas burned", text: "energy in", value: num(s.gasIn) + " MMBtu" },
        { icon: "plant", title: "Combined-cycle plant", text: pct(s.effCC) + " efficient", value: num(s.chainMWh, 2) + " MWh" },
        { icon: "battery", title: "Battery", text: pct(s.rte, 0) + " round trip", value: num(s.chainBack, 2) + " MWh back" },
        { icon: "bolt", title: "Overall", text: pct(s.effCC) + " × " + pct(s.rte, 0), value: pct(s.chainEff) + " of the gas's energy" }]
    });
  }

  // ---------------------------------------------------------------- practice drill (LX.Drill; this visit only)
  function drillView() {
    var host = document.getElementById("k2-drill"); if (!host) return; host.innerHTML = "";
    LX.Drill(host, { hint: "Seven kinds of item in rotation, new numbers each time; a calculator helps. Aim for eight, about 10 minutes.",
                     unit: function (it) { return it.unit === "$" ? "dollars" : it.unit; }, empty: "Type a number first.", item: drillItem });
  }

  LX.mount("k02", function (live, data, root) { view(live, data, root); });
})();
