// f11-air-climate-people.js — Lesson F11, "What does energy do to the air, the climate and people's lives?" (step cards,
// Foundations, D1; wave W5, 2026-11-06, builder learn-w5-b).
//
// Data: assets/learn/data/f11-air-climate-people.json (the fuels' IPCC defaults, the methane GWP and the leak studies, the
// AP-42 emission factors and controls, the spreading toy, EPA's benefit-per-ton values, WHO's figures, the burden lines
// and their sources), prairie-city.json (Prairie City's five household groups: incomes and home energy spending; never
// retyped) and path.json (lesson links that appear once a lesson is live).
//
// Model (closed form; no optimization):
//   a tonne       heat = NCV (GJ per tonne, IPCC 2006 Table 1.2); CO2 = NCV x factor (kg per TJ / 1000, Table 1.4);
//                 carbon = CO2 x 12/44; per MWh of heat = CO2 / (NCV / 3.6). Net heat (NCV), as the IPCC counts it.
//   methane       a leak of L (share of the gas produced) means L / (1 - L) t of methane per tonne burned (the leaked gas
//                 counted as pure methane); CO2e = methane x 29.8 (AR6 100-year GWP of fossil methane)
//   pollutants    kg per metric tonne from AP-42's factors for large boilers (lb per short ton x 0.5 = kg per tonne for
//                 coal; per million scf at 42,000 lb per million scf for gas; per 1,000 gal at 845 kg/m3 for oil); the
//                 illustrative coal has 2% sulfur and 10% ash, the oil 0.2% sulfur; PM2.5 = filterable PM2.5 +
//                 condensable PM (all below 1 micrometre). Controls: coal a wet limestone scrubber (90% of SO2, and
//                 AP-42's condensable factor with FGD), low-NOx burners and an ESP; gas low-NOx burners; oil low-NOx
//                 burners with flue gas recirculation. CO2 is not changed by any of them.
//   where it goes the spreading toy (illustrative, not a dispersion model): a year of winds from every direction, a mixed
//                 layer, people spread evenly; concentration c(r) = (r0 / r) x exp(-(r - r0) / L) relative to r0 = 10 km;
//                 the share of all exposure within R = 1 - exp(-(R - r0) / L) with an illustrative reach L = 300 km
//   health        $ = sum over pollutants of kg / 907.18474 kg per short ton x EPA's 2025 benefit per ton for power
//                 plants (2019 dollars, 2% discount rate): an estimate, PM2.5-related harm only
//   burden        Prairie City's household groups (prairie-city.json): burden = home energy spending / income; a reader's
//                 income falls in the group whose band holds it (lower edge in, upper edge out) and takes that group's
//                 average spending; the 6% and 10% lines are conventions (ACEEE; DOE's LEAD tool calls 6% or more high)
// Every number on the page comes from this model or from the data files; _tests/learn/test_f11-air-climate-people.js
// checks them.
//
// Shared components: LX.StepCards, LX.Predict, LX.Slider, LX.Toggle, LX.Plot, LX.UnitChain, LX.CausalChain,
// LX.CompareTable, LX.Stakeholders, LX.lessonRefHTML. Lesson-local: the value bars (f11-bars) and the fuel buttons.
(function () {
  "use strict";
  var KEY = "f11_air_climate_people";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return fmtN(100 * v, d == null ? 0 : d) + "%"; }
  function money(v) { return "$" + fmtN(v); }
  function fuel(D, key) { var f = D.fuels.filter(function (x) { return x.key === key; })[0]; if (!f) throw new Error("no fuel " + key); return f; }

  // one tonne burned: heat, CO2, carbon (IPCC defaults, net calorific value)
  function tonne(f, D) {
    var co2 = f.ncvGJperT * f.co2KgPerTJ / 1000, mwh = f.ncvGJperT / D.units.gjPerMWh;   // kg CO2 per tonne; MWh of heat
    return { key: f.key, name: f.name, gj: f.ncvGJperT, mwh: mwh, co2Kg: co2, co2T: co2 / 1000, carbonKg: co2 * 12 / 44, perMWh: co2 / mwh };
  }
  function tonnes(D) { return D.fuels.map(function (f) { return tonne(f, D); }); }

  // methane leaked before a tonne of gas is burned, as CO2e over 100 years
  function methane(D, leakPct) {
    var L = leakPct / 100, ch4 = L / (1 - L), gas = tonne(fuel(D, "gas"), D), co2e = ch4 * D.methane.gwp100;
    return { leakPct: leakPct, ch4T: ch4, ch4Kg: ch4 * 1000, co2eT: co2e, co2T: gas.co2T, totalT: gas.co2T + co2e, share: co2e / gas.co2T,
             perMWh: (gas.co2T + co2e) * 1000 / gas.mwh };
  }

  // air pollutants per tonne (kg), before and after the controls AP-42 describes
  function pollutants(D, key, controls) {
    var P = D.pollutants, U = D.units, f = tonne(fuel(D, key), D), so2, nox, pm;
    if (key === "coal") {
      var c = P.coal, S = c.sulfurPct, A = c.ashPct, half = U.kgPerLb / (U.kgPerShortTon / 1000);   // lb per short ton -> kg per tonne: x 0.5
      so2 = c.so2LbPerTonPerS * S * half * (controls ? 1 - c.scrubberPct / 100 : 1);
      nox = (controls ? c.noxLbPerTonLNB : c.noxLbPerTon) * half;
      var filt = (controls ? c.pm25LbPerTonPerAESP : c.pm25LbPerTonPerA) * A * half;
      var cond = (controls ? c.cpmFGD : c.cpmNoFGD.perS * S - c.cpmNoFGD.minus) * c.mmbtuPerTon * half;
      pm = filt + cond;
    } else if (key === "gas") {
      var g = P.gas, mmscf = 1000 / U.kgPerLb / g.densityLbPerMMscf;                  // million scf in a tonne
      so2 = g.so2Lb * mmscf * U.kgPerLb; nox = (controls ? g.noxLbLNB : g.noxLb) * mmscf * U.kgPerLb; pm = g.pmLb * mmscf * U.kgPerLb;
    } else {
      var o = P.oil, kgal = 1000 / o.densityKgPerM3 * 1000 / U.litresPerGal / 1000;      // thousands of gallons in a tonne
      so2 = o.so2LbPerKgalPerS * o.sulfurPct * kgal * U.kgPerLb; nox = (controls ? o.noxLbPerKgalLNB : o.noxLbPerKgal) * kgal * U.kgPerLb;
      pm = (o.pm25FiltLbPerKgal + o.cpmLbPerKgal) * kgal * U.kgPerLb;
    }
    return { key: key, controls: !!controls, so2: so2, nox: nox, pm25: pm, co2T: f.co2T };
  }
  // EPA's benefit per ton (2025, power plants, 2019 $) applied to a tonne's pollutants: an estimate of the health harm
  function health(D, p) {
    var B = D.bpt.egu, t = D.units.kgPerShortTon;
    var parts = { so2: p.so2 / t * B.so2, nox: p.nox / t * B.nox, pm25: p.pm25 / t * B.pm25 };
    return { parts: parts, total: parts.so2 + parts.nox + parts.pm25 };
  }
  // the spreading toy: exposure per person relative to r0, and the share of all exposure within r
  function perPerson(D, r) { var S = D.spread; return S.r0km / r * Math.exp(-(r - S.r0km) / S.reachKm); }
  function within(D, r) { var S = D.spread; return 1 - Math.exp(-(r - S.r0km) / S.reachKm); }

  // Prairie City's groups (prairie-city.json, read as given), and a reader's income
  function groups(PC) {
    return PC.groups.map(function (g) {
      return { key: g.key, label: g.label, households: g.households, income: g.income, lo: g.incomeRange[0], hi: g.incomeRange[1],
               spend: g.homeEnergy, motor: g.spending.motorFuel, burden: g.homeEnergy / g.income, transport: g.spending.motorFuel / g.income, data: g.burden };
    });
  }
  function groupOf(G, income) { for (var i = 0; i < G.length; i++) { if (income >= G[i].lo && (G[i].hi == null || income < G[i].hi)) return G[i]; } return G[G.length - 1]; }
  function burdenAt(G, income) { var g = groupOf(G, income); return { group: g, spend: g.spend, burden: g.spend / income }; }
  function verdict(D, b) { return b > D.burden.severe ? "severe" : b > D.burden.high ? "high" : b >= D.burden.high ? "lead" : "below"; }
  function above(G, line) { var h = 0, n = 0; G.forEach(function (g) { n += g.households; if (g.burden > line) h += g.households; }); return { households: h, total: n, share: h / n, groups: G.filter(function (g) { return g.burden > line; }).length }; }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  function fuelOpts(D) { return D.fuels.map(function (f) { return { value: f.key, label: f.name, color: f.color }; }); }
  var MOST = {
    q: "Which fuel's tonne sends the most CO₂ into the air?",
    answer: "oil",
    feedback: {
      coal: "A tonne of coal also carries ash, water and other elements, so it holds less carbon than a tonne of oil or gas.",
      gas: "Gas is mostly methane, a quarter of whose mass is hydrogen; a tonne of oil holds more carbon.",
      oil: "A tonne of oil holds the most carbon, and every tonne of carbon burned makes 3.67 t of CO₂."
    }
  };
  function mostSaw(D) {
    var T = tonnes(D);
    return "Per tonne: " + T.slice().sort(function (a, b) { return b.co2T - a.co2T; }).map(function (t) { return t.name.toLowerCase().replace("natural ", "") + " **" + fmtN(t.co2T, 2) + " t**"; }).join(", ") +
      " of CO₂. Each tonne of carbon burned makes " + fmtN(D.carbon.co2PerC, 2) + " t of CO₂.";
  }
  function heatSaw(D) {
    var T = tonnes(D), c = T.filter(function (t) { return t.key === "coal"; })[0], g = T.filter(function (t) { return t.key === "gas"; })[0], o = T.filter(function (t) { return t.key === "oil"; })[0];
    return "Per MWh of heat, coal sends **" + fmtN(c.perMWh) + " kg** of CO₂, oil " + fmtN(o.perMWh) + " kg and gas " + fmtN(g.perMWh) + " kg: coal about " + fmtN(c.perMWh / g.perMWh, 1) + " times gas.";
  }
  function leakLine(D, leakPct) {
    var m = methane(D, leakPct);
    if (leakPct === 0) return "With no leak, a tonne of gas sends only its **" + fmtN(m.co2T, 2) + " t** of CO₂ from burning.";
    return "A " + fmtN(leakPct, 1) + "% leak adds " + fmtN(m.ch4Kg, 1) + " kg of methane, about **" + fmtN(m.co2eT, 2) + " t** of CO₂e over 100 years: " + pct(m.share) + " on top of the " + fmtN(m.co2T, 2) + " t from burning.";
  }
  function leakChain(D, leakPct) {
    var m = methane(D, leakPct);
    return [{ v: fmtN(leakPct, 1) + "%", u: "of the gas leaks" }, { op: "→" }, { v: fmtN(m.ch4Kg, 1) + " kg", u: "methane per tonne burned" },
            { op: "× " + fmtN(D.methane.gwp100, 1) + " =" }, { v: fmtN(m.co2eT, 2) + " t", u: "CO₂e over 100 years", out: true }];
  }
  var LEAK_NOTE = "Measured U.S. leaks: about 2.3% of gas production in 2015 (Alvarez et al., 2018), and from 0.75% to 9.63% across six regions (Sherwin et al., 2024).";
  function pollLine(D, key, controls) {
    var p = pollutants(D, key, controls), f = fuel(D, key);
    return f.name + (controls ? ", with controls: " : ", before controls: ") + fmtN(p.so2, p.so2 < 1 ? 2 : 1) + " kg of SO₂, " + fmtN(p.nox, 1) + " kg of NOx and " +
      fmtN(p.pm25, 2) + " kg of fine particles per tonne; CO₂ stays " + fmtN(p.co2T, 2) + " t.";
  }
  function pollSaw(D) {
    var a = pollutants(D, "coal", false), b = pollutants(D, "coal", true);
    return "For coal, controls cut SO₂ from " + fmtN(a.so2) + " to " + fmtN(b.so2, 1) + " kg a tonne and fine particles from " + fmtN(a.pm25, 1) + " to " + fmtN(b.pm25, 1) + " kg, but leave its **" + fmtN(a.co2T, 2) + " t** of CO₂ untouched.";
  }
  function spreadLine(D, r) {
    return "At " + fmtN(r) + " km each person gets " + (r === D.spread.r0km ? "the toy's reference dose" : pct(perPerson(D, r), perPerson(D, r) < 0.01 ? 2 : 1) + " of the dose at " + D.spread.r0km + " km") +
      "; **" + pct(within(D, r)) + "** of all the breathing happens closer than this.";
  }
  function spreadSaw(D) {
    return "Each person far away breathes little, but many more people live far away. In this toy, " + pct(1 - within(D, 100)) + " of all the breathing happens beyond 100 km.";
  }
  function healthLine(D, key, controls) {
    var h = health(D, pollutants(D, key, controls));
    return "About **" + money(Math.round(h.total / 10) * 10) + "** of health harm per tonne of " + fuel(D, key).name.toLowerCase() + (controls ? " with controls" : " before controls") + ", at EPA's power-plant values: an estimate.";
  }
  function woodLine(D) {
    return "Where and how a ton is released matters: EPA values a ton of fine particles at " + money(D.bpt.woodstovePm25) + " from home wood stoves, against " + money(D.bpt.egu.pm25) + " from power plants.";
  }
  function healthSaw(D) {
    var a = health(D, pollutants(D, "coal", false)), b = health(D, pollutants(D, "coal", true));
    return "For a tonne of coal, controls cut EPA's estimate of the harm from about " + money(Math.round(a.total / 10) * 10) + " to about " + money(Math.round(b.total / 10) * 10) + ". WHO counts 4.2 million early deaths from outdoor air pollution in 2019.";
  }
  function burdenLine(D, G, income) {
    var r = burdenAt(G, income), v = verdict(D, r.burden), shown = pct(r.burden, 1);
    var word = { severe: "above the 10% line ACEEE calls severe", high: "above the 6% line ACEEE calls high", lead: "at the 6% DOE's LEAD tool calls high", below: "below the 6% line" }[v];
    return "Income " + money(income) + " a year, home energy " + money(r.spend) + ": a burden of **" + shown + "**, " + word + ".";
  }
  var BURDEN_NOTE = "Spending is the average of the household's income group; real bills vary within a group.";
  var LINES_NOTE = "The 6% and 10% lines are conventions (ACEEE; DOE's LEAD tool calls 6% or more high), not physical limits.";
  var HOWMANY = {
    q: "How many of the five groups spend more than 6% of income on home energy, on average?",
    options: [{ value: "0", label: "None" }, { value: "1", label: "One" }, { value: "2", label: "Two" }, { value: "3", label: "Three" }],
    answer: "2",
    feedback: {
      "0": "The two lowest-income groups average above 6%, though they use less energy than richer homes.",
      "1": "The two lowest-income groups average above 6%: the poorest group pays about 15%, the next about 6.5%.",
      "2": "The two lowest-income groups average above 6%, though they use less energy than richer homes.",
      "3": "Only the two lowest-income groups average above 6%; the 50-80% group averages just over 4%."
    }
  };
  function groupsSaw(D, G) {
    var a = above(G, D.burden.high);
    return "**" + fmtN(a.households) + "** of Prairie City's " + fmtN(a.total) + " households (" + pct(a.share) + ") are in groups whose average burden is above 6%. Group averages can hide households above the line in the other groups.";
  }
  var FICTION = "Prairie City is fictional; its numbers are illustrative.";

  // the no-JS version (the test writes it into the page between the f11-fallback markers)
  function staticFallback(D, PC) {
    var T = tonnes(D), G = groups(PC);
    var rows = T.map(function (t) {
      var a = pollutants(D, t.key, false), b = pollutants(D, t.key, true);
      return "<tr><td>" + t.name + "</td><td>" + fmtN(t.co2T, 2) + " t</td><td>" + fmtN(t.perMWh) + " kg</td><td>" + fmtN(a.so2, a.so2 < 1 ? 2 : 1) + " → " + fmtN(b.so2, b.so2 < 1 ? 2 : 1) + " kg</td><td>" +
        fmtN(a.nox, 1) + " → " + fmtN(b.nox, 1) + " kg</td><td>" + fmtN(a.pm25, 2) + " → " + fmtN(b.pm25, 2) + " kg</td><td>" + money(Math.round(health(D, a).total / 10) * 10) + " → " + money(Math.round(health(D, b).total / 10) * 10) + "</td></tr>";
    }).join("");
    var m = methane(D, D.methane.leak.start);
    var grp = G.map(function (g) { return "<tr><td>" + g.label + "</td><td>" + money(g.income) + "</td><td>" + money(g.spend) + "</td><td>" + pct(g.burden, 1) + "</td></tr>"; }).join("");
    return "<p class=\"lx-eyebrow\">The idea in two tables: one tonne burned, and who carries the bills</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table f11-fbt\"><caption class=\"lx-hint\">One tonne burned in a large boiler, before → after the controls AP-42 describes (illustrative coal and oil; EPA factors).</caption>" +
      "<thead><tr><th scope=\"col\">Fuel</th><th scope=\"col\">CO₂</th><th scope=\"col\">CO₂ per MWh of heat</th><th scope=\"col\">SO₂</th><th scope=\"col\">NOx</th><th scope=\"col\">Fine particles</th><th scope=\"col\">Health harm (EPA estimate)</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      "<ul><li><b>Methane.</b> If " + fmtN(D.methane.leak.start, 1) + "% of the gas leaks before it is burned, a tonne of gas adds " + fmtN(m.ch4Kg, 1) + " kg of methane, about " + fmtN(m.co2eT, 2) + " t of CO₂e over 100 years (GWP " + fmtN(D.methane.gwp100, 1) + ").</li>" +
      "<li><b>Where it goes.</b> In the lesson's spreading toy (illustrative), each person 300 km away breathes " + pct(perPerson(D, 300), 1) + " of the dose at 10 km, yet " + pct(1 - within(D, 100)) + " of all the breathing happens beyond 100 km.</li>" +
      "<li><b>Health.</b> Dollar values are EPA's 2025 benefit-per-ton estimates for power plants (2019 dollars): " + money(D.bpt.egu.so2) + " per short ton of SO₂, " + money(D.bpt.egu.nox) + " of NOx, " + money(D.bpt.egu.pm25) + " of fine particles.</li></ul>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table f11-fbt\"><caption class=\"lx-hint\">" + FICTION + " Energy burden = home energy spending ÷ income, by income group (share of area median income).</caption>" +
      "<thead><tr><th scope=\"col\">Group</th><th scope=\"col\">Average income</th><th scope=\"col\">Home energy a year</th><th scope=\"col\">Burden</th></tr></thead><tbody>" + grp + "</tbody></table></div>" +
      "<p class=\"lx-hint\">" + LINES_NOTE + " With JavaScript on, you burn each fuel, slide the leak, add controls, walk away from the stack and slide a household's income.</p>";
  }

  var model = { fuel: fuel, tonne: tonne, tonnes: tonnes, methane: methane, pollutants: pollutants, health: health, perPerson: perPerson, within: within,
    groups: groups, groupOf: groupOf, burdenAt: burdenAt, verdict: verdict, above: above, fuelOpts: fuelOpts,
    MOST: MOST, mostSaw: mostSaw, heatSaw: heatSaw, leakLine: leakLine, leakChain: leakChain, LEAK_NOTE: LEAK_NOTE, pollLine: pollLine, pollSaw: pollSaw,
    spreadLine: spreadLine, spreadSaw: spreadSaw, healthLine: healthLine, woodLine: woodLine, healthSaw: healthSaw, burdenLine: burdenLine,
    BURDEN_NOTE: BURDEN_NOTE, LINES_NOTE: LINES_NOTE, HOWMANY: HOWMANY, groupsSaw: groupsSaw, FICTION: FICTION, staticFallback: staticFallback, fmtN: fmtN, pct: pct, money: money };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  LX.mount("air-climate-people", function (live, data, root) {
    var D = data[KEY], PC = data.prairie_city, P = data.path, G = groups(PC), FUEL = {};
    D.fuels.forEach(function (f) { FUEL[f.key] = f; });
    var S = { fuel: "coal", per: "tonne", leak: D.methane.leak.start, controls: false, r: 100, income: D.burden.income.start, motor: false };
    var saved = LX.store.get("f11");
    function inRange(v, r) { return typeof v === "number" && v >= r.min - 1e-9 && v <= r.max + 1e-9; }
    if (saved) {
      if (FUEL[saved.fuel]) S.fuel = saved.fuel;
      if (inRange(saved.leak, D.methane.leak)) S.leak = saved.leak;
      if (typeof saved.controls === "boolean") S.controls = saved.controls;
      if (D.spread.stops.indexOf(saved.r) >= 0) S.r = saved.r;
      if (inRange(saved.income, D.burden.income)) S.income = saved.income;
    }
    function keep() { LX.store.set("f11", { fuel: S.fuel, leak: S.leak, controls: S.controls, r: S.r, income: S.income }); }
    var demo = [];

    function chips(host, list) {
      host.innerHTML = "";
      list.forEach(function (x) { var c = H("div", { class: "lx-readout" + (x[2] ? " " + x[2] : "") }, host); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); });
    }
    // value bars: one row per item, its value written beside the bar (readable without the bars)
    function bars(host, label, rows, max) {
      host.innerHTML = "";
      var box = H("div", { class: "f11-bars", role: "group", "aria-label": label }, host);
      rows.forEach(function (r) {
        var row = H("div", { class: "f11-bar-row" + (r.sel ? " sel" : "") }, box);
        H("span", { class: "f11-bar-l", text: r.label }, row);
        var tr = H("span", { class: "f11-bar-track", "aria-hidden": "true" }, row);
        H("i", { class: "f11-bar", style: "width:" + Math.max(0.5, Math.min(100, 100 * r.value / max)).toFixed(2) + "%;--c:" + r.color }, tr);
        H("b", { class: "f11-bar-v", text: r.text }, row);
      });
    }
    function fuelSeg(host, onPick) {
      var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Fuel" }, host), b = {};
      D.fuels.forEach(function (f) { b[f.key] = H("button", { type: "button", text: f.name }, seg); b[f.key].addEventListener("click", function () { onPick(f.key); }); });
      return function (k) { Object.keys(b).forEach(function (j) { b[j].setAttribute("aria-pressed", String(j === k)); }); };
    }
    function co2Bars(host, per) {
      var T = tonnes(D), max = per === "tonne" ? 3.5 : 400;
      bars(host, per === "tonne" ? "CO₂ per tonne burned" : "CO₂ per MWh of heat", T.map(function (t) {
        var v = per === "tonne" ? t.co2T : t.perMWh;
        return { label: t.name, value: v, color: FUEL[t.key].color, text: per === "tonne" ? fmtN(v, 2) + " t CO₂ a tonne" : fmtN(v) + " kg CO₂ a MWh" };
      }), max);
    }

    var steps = [
      { text: "Burn one tonne of fuel in a large boiler. Which fuel's tonne sends the most CO₂ into the air: coal, natural gas or oil?",
        build: function (act, api) {
          var pr = LX.Predict(act, { id: "f11-most", q: MOST.q, title: false, answer: MOST.answer, options: fuelOpts(D), feedback: MOST.feedback, onPick: function () { show(); } });
          var out = H("div", { class: "f11-res" }, act), bx = H("div", null, out), ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, out);
          function show() {
            pr.reveal(); co2Bars(bx, "tonne");
            chips(ro, tonnes(D).map(function (t) { return ["Carbon in a tonne of " + t.name.toLowerCase(), fmtN(t.carbonKg) + " kg"]; }));
            api.done(); api.saw(mostSaw(D));
          }
          if (pr.picked()) show();
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[2]; if (b) b.click(); } };
        } },
      { text: "A tonne of gas gives far more heat than a tonne of coal. Switch to CO₂ per MWh of heat, the fair way to compare fuels doing the same job.",
        build: function (act, api) {
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Measure" }, act), b = {};
          [["tonne", "Per tonne"], ["mwh", "Per MWh of heat"]].forEach(function (x) { b[x[0]] = H("button", { type: "button", text: x[1] }, seg); b[x[0]].addEventListener("click", function () { pick(x[0]); }); });
          var bx = H("div", null, act), ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          function pick(k) {
            S.per = k; Object.keys(b).forEach(function (j) { b[j].setAttribute("aria-pressed", String(j === k)); });
            co2Bars(bx, k);
            chips(ro, tonnes(D).map(function (t) { return ["Heat in a tonne of " + t.name.toLowerCase(), fmtN(t.mwh, 1) + " MWh"]; }));
            if (k === "mwh") { api.done(); api.saw(heatSaw(D)); }
          }
          pick(S.per);
          demo[1] = function () { pick("mwh"); };
        } },
      { text: "Some gas escapes before it is burned, from wells, pipes and compressors. Slide the share that [[methane-leak|leaks]], and count the methane as CO₂ over 100 years.",
        build: function (act, api) {
          var M = D.methane.leak, res = H("div", { class: "f11-res" }, act);
          var uc = LX.UnitChain(res, { label: "From a leak to CO₂e", steps: leakChain(D, S.leak) });
          var bx = H("div", null, res), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, res);
          var sl = LX.Slider(act, { label: "Share of the gas that leaks", color: "var(--lx-cc)", min: M.min, max: M.max, step: M.step, value: S.leak,
            fmt: function (v) { return fmtN(v, 1) + "%"; }, onChange: function (v) { S.leak = v; keep(); paint(); api.done(); } });
          H("p", { class: "lx-hint", text: LEAK_NOTE }, act);
          H("p", { class: "lx-hint", text: "GWP 29.8: fossil methane, 100 years (IPCC AR6, via the GHG Protocol). Coal mines and oil wells leak methane too; this step leaves them out." }, act);
          function paint() {
            var m = methane(D, S.leak); uc.set(leakChain(D, S.leak));
            bars(bx, "A tonne of gas: CO₂ from burning and methane as CO₂e", [{ label: "Burning", value: m.co2T, color: "var(--lx-cc)", text: fmtN(m.co2T, 2) + " t CO₂" },
              { label: "Leak", value: m.co2eT, color: "var(--lx-warn)", text: fmtN(m.co2eT, 2) + " t CO₂e" }], 3.5);
            line.innerHTML = bold(leakLine(D, S.leak));
          }
          paint(); api.done();
          demo[2] = function () { sl.set(3, true); };
        } },
      { text: "Smoke carries more than CO₂. Pick a fuel to see the sulfur dioxide, nitrogen oxides and [[fine-particles|fine particles]] from one tonne, then add the controls EPA describes, such as a [[scrubber|scrubber]].",
        build: function (act, api) {
          var paintSeg = fuelSeg(act, function (k) { S.fuel = k; keep(); paint(); });
          var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Pollution controls" }, act), { label: "Add the controls", on: S.controls, onChange: function (v) { S.controls = v; keep(); paint(); done(); } });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line" }, act), ctl = H("p", { class: "lx-hint" }, act);
          H("p", { class: "lx-hint", html: LX.rich("Illustrative coal with 2% sulfur and 10% ash, and oil with 0.2% sulfur; EPA's AP-42 [[emission-factor|emission factors]] are averages of tests.") }, act);
          function done() { api.done(); api.saw(pollSaw(D)); }
          function paint() {
            paintSeg(S.fuel); var p = pollutants(D, S.fuel, S.controls);
            chips(ro, [["Sulfur dioxide (SO₂)", fmtN(p.so2, p.so2 < 1 ? 2 : 1) + " kg"], ["Nitrogen oxides (NOx)", fmtN(p.nox, 1) + " kg"], ["Fine particles (PM2.5)", fmtN(p.pm25, 2) + " kg"], ["CO₂", fmtN(p.co2T, 2) + " t", "warn"]]);
            line.textContent = pollLine(D, S.fuel, S.controls);
            ctl.textContent = "Controls for " + FUEL[S.fuel].name.toLowerCase() + " here: " + D.pollutants.controls[S.fuel] + ".";
          }
          paint(); if (S.controls) done();
          demo[3] = function () { if (!tg.val()) tg.el.click(); };
        } },
      { text: "From a tall stack the particles drift for days. Move away from the plant: each person breathes less, but how much of all the breathing happens closer than you?",
        build: function (act, api) {
          var stops = D.spread.stops, Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          var sl = LX.Slider(act, { label: "Distance from the plant", color: "var(--lx-accent)", min: 0, max: stops.length - 1, step: 1, value: Math.max(0, stops.indexOf(S.r)),
            fmt: function (i) { return fmtN(stops[i]) + " km"; }, onChange: function (i) { S.r = stops[i]; keep(); paint(); api.done(); api.saw(spreadSaw(D)); } });
          H("p", { class: "lx-hint", text: "A spreading toy, not an air-quality model: winds from every direction, people spread evenly, particles removed over an illustrative 300 km." }, act);
          var lg = function (r) { return Math.log(r) / Math.LN10; };
          function paint() {
            var pts = [], x0 = lg(stops[0]), x1 = lg(stops[stops.length - 1]);
            for (var k = 0; k <= 60; k++) { var x = x0 + (x1 - x0) * k / 60; pts.push([x, 100 * within(D, Math.pow(10, x))]); }
            Pl.render({
              x: { min: x0, max: x1, ticks: stops.map(function (r) { return [lg(r), fmtN(r) + (r === stops[stops.length - 1] ? " km" : "")]; }),
                   ticksN: [10, 100, 1000].map(function (r) { return [lg(r), fmtN(r) + (r === 1000 ? " km" : "")]; }) },
              y: { min: 0, max: 100, step: 25, fmt: function (v) { return v + "%"; }, unit: "share of all breathing" }, height: 220, heightN: 200,
              lines: [{ pts: pts, color: "var(--lx-accent)", width: 2.6, area: 0.12 }],
              marks: [{ x: lg(S.r), y: 100 * within(D, S.r), label: pct(within(D, S.r)), kind: "dot", pos: "above" }],
              legend: [{ label: "Share of all the breathing that happens within this distance (toy)", color: "var(--lx-accent)" }],
              aria: "In the spreading toy, the share of all exposure that happens within a distance rises from 0% at 10 km to " + pct(within(D, 1000)) + " at 1,000 km.",
              text: { head: ["Distance", "Each person's dose (10 km = 100%)", "Share of all breathing closer than this"], rows: stops.map(function (r) { return [fmtN(r) + " km", pct(perPerson(D, r), perPerson(D, r) < 0.01 ? 2 : 1), pct(within(D, r))]; }) }
            });
            chips(ro, [["Distance", fmtN(S.r) + " km"], ["Each person's dose", pct(perPerson(D, S.r), perPerson(D, S.r) < 0.01 ? 2 : 1) + " of 10 km's"], ["Breathing closer than this", pct(within(D, S.r))]]);
            line.innerHTML = bold(spreadLine(D, S.r));
          }
          paint();
          demo[4] = function () { sl.set(stops.indexOf(300), true); };
        } },
      { text: "EPA puts a dollar value on that harm, mostly early deaths it expects to avoid. Apply its 2025 [[benefit-per-ton|values per ton]] for power plants to your tonne, with and without controls.",
        build: function (act, api) {
          var paintSeg = fuelSeg(act, function (k) { S.fuel = k; keep(); paint(); });
          var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Pollution controls" }, act), { label: "Add the controls", on: S.controls, onChange: function (v) { S.controls = v; keep(); paint(); } });
          var bx = H("div", null, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: woodLine(D) }, act);
          H("p", { class: "lx-hint", text: "EPA, June 2024: 2025 values in 2019 dollars, per short ton, PM2.5-related harm only. Estimates, not prices." }, act);
          function paint() {
            paintSeg(S.fuel); var p = pollutants(D, S.fuel, S.controls), h = health(D, p);
            bars(bx, "Health harm per tonne burned, by pollutant (EPA estimate)", [
              { label: "From SO₂", value: h.parts.so2, color: "var(--lx-warn)", text: money(Math.round(h.parts.so2)) },
              { label: "From NOx", value: h.parts.nox, color: "var(--lx-tier-3)", text: money(Math.round(h.parts.nox)) },
              { label: "From PM2.5", value: h.parts.pm25, color: "var(--lx-bad)", text: money(Math.round(h.parts.pm25)) }], 2500);
            line.innerHTML = bold(healthLine(D, S.fuel, S.controls));
            api.done(); api.saw(healthSaw(D));
          }
          paint();
          demo[5] = function () { if (!tg.val()) tg.el.click(); };
        } },
      { text: "Now the bills. [[energy-burden|Energy burden]] is home energy spending divided by income. Slide a Prairie City household's income and watch its burden against the 6% and 10% lines.",
        build: function (act, api) {
          var B = D.burden.income, ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          var sl = LX.Slider(act, { label: "Household income a year", color: "var(--lx-tier-4)", min: B.min, max: B.max, step: B.step, value: S.income,
            fmt: function (v) { return money(v); }, onChange: function (v) { S.income = v; keep(); paint(); api.done(); } });
          H("p", { class: "lx-hint", text: BURDEN_NOTE + " " + FICTION }, act);
          H("p", { class: "lx-hint", text: LINES_NOTE }, act);
          function paint() {
            var r = burdenAt(G, S.income), v = verdict(D, r.burden);
            chips(ro, [["Income group", r.group.label], ["Home energy a year", money(r.spend)], ["Energy burden", pct(r.burden, 1), v === "below" ? "good" : v === "severe" ? "bad" : "warn"]]);
            line.innerHTML = bold(burdenLine(D, G, S.income));
          }
          paint(); api.done();
          demo[6] = function () { sl.set(20000, true); };
        } },
      { text: "Here are Prairie City's five income groups, as shares of area median income. Before you look: how many of them spend more than 6% of income on home energy, on average?",
        build: function (act, api) {
          var pr = LX.Predict(act, { id: "f11-groups", q: HOWMANY.q, title: false, answer: HOWMANY.answer, options: HOWMANY.options, feedback: HOWMANY.feedback, onPick: function () { show(); } });
          var res = H("div", { class: "f11-res" }, act); res.hidden = true;
          var Pl = LX.Plot(H("div", null, res), { text: "Text version of the chart", legend: true });
          var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Motor fuel" }, res), { label: "Show motor fuel apart", on: S.motor, onChange: function (v) { S.motor = v; paint(); } });
          H("p", { class: "lx-hint", text: FICTION + " Motor fuel is not part of energy burden as DOE's LEAD tool defines it." }, res);
          var short = ["0–30%", "30–50%", "50–80%", "80–100%", "100%+"];
          function paint() {
            var bs = [], w = 0.36;
            G.forEach(function (g, i) {
              bs.push({ x0: i + 0.5 - (S.motor ? w : w / 2), x1: i + 0.5 + (S.motor ? 0 : w / 2), y0: 0, y1: 100 * g.burden, color: "var(--lx-tier-4)" });
              if (S.motor) bs.push({ x0: i + 0.5, x1: i + 0.5 + w, y0: 0, y1: 100 * g.transport, color: "var(--lx-pk)", op: 0.75 });
            });
            Pl.render({
              x: { min: 0, max: G.length, ticks: G.map(function (g, i) { return [i + 0.5, short[i]]; }), ticksN: G.map(function (g, i) { return [i + 0.5, short[i].replace("%", "")]; }) },
              y: { min: 0, max: 16, step: 4, fmt: function (v) { return v + "%"; }, unit: "share of income" }, height: 230, heightN: 210,
              bars: bs,
              refs: [{ y: 100 * D.burden.high, label: "6%: high", dash: "5 4", color: "var(--lx-warn)" }, { y: 100 * D.burden.severe, label: "10%: severe", dash: "5 4", color: "var(--lx-bad)" }],
              legend: [{ label: "Home energy (energy burden)", color: "var(--lx-tier-4)" }].concat(S.motor ? [{ label: "Motor fuel, shown apart", color: "var(--lx-pk)" }] : []),
              aria: "Average energy burden by income group: " + G.map(function (g, i) { return short[i] + " " + pct(g.burden, 1); }).join(", ") + ".",
              text: { head: ["Group (share of area median income)", "Households", "Average income", "Home energy", "Energy burden"].concat(S.motor ? ["Motor fuel burden"] : []),
                      rows: G.map(function (g) { return [g.label, fmtN(g.households), money(g.income), money(g.spend), pct(g.burden, 1)].concat(S.motor ? [pct(g.transport, 1)] : []); }) }
            });
          }
          function show() { pr.reveal(); res.hidden = false; paint(); api.done(); api.saw(groupsSaw(D, G)); }
          if (pr.picked()) show();
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "Who emits, who breathes, who pays, as diagrams" + LX.icon("arrow") }, act);
          demo[7] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[2]; if (b) b.click(); } };
        } }
    ];
    var cards = LX.StepCards(live, { id: "f11-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("f11-explain");
    if (xhost) {
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var T = tonnes(D), m = methane(D, D.methane.leak.start), cu = pollutants(D, "coal", false), hc = health(D, cu);
      LX.CausalChain(H("div", { class: "lx-xcard" }, xhost), {
        title: "Cause and effect: one tonne of coal burned",
        links: [{ title: "Carbon burns", text: "Every tonne of carbon makes 3.67 t of CO₂, whatever the plant.", value: fmtN(T[0].co2T, 2) + " t CO₂" },
                { title: "CO₂ stays", text: "It adds to the stock that sets warming; no smokestack filter removes it here.", value: "the same with controls" },
                { title: "Sulfur and ash", text: "They leave as SO₂ and fine particles unless controls catch them.", value: fmtN(cu.so2) + " kg SO₂ before controls" },
                { title: "Air downwind", text: "Particles spread for hundreds of km; each person gets a little, many people get some.", value: pct(1 - within(D, 100)) + " beyond 100 km (toy)" },
                { title: "Health", text: "EPA turns expected early deaths and illness into dollars: an estimate.", value: "about " + money(Math.round(hc.total / 10) * 10) + " a tonne" },
                { title: "Bills", text: "Fuel and plant costs reach homes as bills; the poorest groups pay the largest share of income.", value: pct(G[0].burden, 1) + " for the lowest group" }],
        note: "Coal, illustrative: 2% sulfur and 10% ash, no controls; EPA's 2025 power-plant values. Prairie City is fictional." });
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), {
        title: "Three fuels, one tonne each", text: true,
        columns: [{ key: "name", label: "Fuel", main: true }, { key: "co2", label: "CO₂" }, { key: "heat", label: "CO₂ per MWh of heat" }, { key: "so2", label: "SO₂, before → with controls" }, { key: "pm", label: "Fine particles" }, { key: "extra", label: "Also" }],
        rows: T.map(function (t) {
          var a = pollutants(D, t.key, false), b = pollutants(D, t.key, true);
          return { key: t.key, color: FUEL[t.key].color, name: t.name, co2: fmtN(t.co2T, 2) + " t", heat: fmtN(t.perMWh) + " kg",
                   so2: fmtN(a.so2, a.so2 < 1 ? 2 : 1) + " → " + fmtN(b.so2, b.so2 < 1 ? 2 : 1) + " kg", pm: fmtN(a.pm25, 2) + " → " + fmtN(b.pm25, 2) + " kg",
                   extra: t.key === "gas" ? "a " + fmtN(D.methane.leak.start, 1) + "% leak adds " + fmtN(m.co2eT, 2) + " t CO₂e" : t.key === "coal" ? "the most CO₂ per MWh of heat" : "the most CO₂ per tonne" };
        }),
        caption: "IPCC default values; EPA's AP-42 factors for large boilers (illustrative coal and oil)." });
      LX.Stakeholders(H("div", { class: "lx-xcard" }, xhost), {
        title: "Who decides, who breathes, who pays",
        lede: "Typical roles; who decides what differs by country and state.",
        cols: [{ key: "dec", label: "Decides" }, { key: "harm", label: "Breathes or bears the harm" }, { key: "pay", label: "Pays" }],
        rows: [
          { key: "owner", name: "The plant's owner", cells: { dec: { v: "yes", t: "fuel, controls, when to run" }, harm: { v: "no" }, pay: { v: "yes", t: "fuel and controls, then passes costs on" } } },
          { key: "reg", name: "Regulators", note: "such as EPA and state agencies", cells: { dec: { v: "yes", t: "emission limits and air standards" }, harm: { v: "no" }, pay: { v: "no" } } },
          { key: "near", name: "Neighbours", cells: { dec: { v: "part", t: "comment on permits" }, harm: { v: "yes", t: "the highest dose per person" }, pay: { v: "part", t: "through bills and health" } } },
          { key: "far", name: "People far downwind", cells: { dec: { v: "no" }, harm: { v: "yes", t: "small doses, many people" }, pay: { v: "part", t: "through health" } } },
          { key: "future", name: "People in later decades", cells: { dec: { v: "no" }, harm: { v: "yes", t: "the warming the CO₂ adds" }, pay: { v: "part", t: "adapting to a warmer climate" } } },
          { key: "low", name: "Low-income households", cells: { dec: { v: "part", t: "comment at rate hearings" }, harm: { v: "part", t: "depends on where they live" }, pay: { v: "yes", t: "the largest share of income" } } }],
        note: "Illustrative roles, not a ranking of blame." });
    }

    LX.demo(root, function (state) {
      var n = state === "mid" ? 3 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, D: D, G: G, S: S, cards: cards };
  });
})();
