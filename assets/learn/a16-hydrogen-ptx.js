// a16-hydrogen-ptx.js — Analyst lesson A16, "Where does hydrogen make sense? From renewables to electrolysis, storage and
// use" (step cards, closed form), wave W3, 2026-11-03.
//
// Data: assets/learn/data/a16-hydrogen-ptx.json (the wind farm, the electrolyzer and its costs in 2022 dollars from DOE
// Hydrogen Program Record 24005, part-load ranges from IRENA, the use sorter, numbers to remember, each with its source),
// town_year.json (SPP's 2025 hourly wind shape, EIA-930) and cf_targets.json (EIA's 2025 wind capacity factor).
//
// The model (pure; exported for Node). Every hour of 2025 (8,760):
//   wind_t = LX.townProfile("wind", 100 MW, method "power"): the shape raised to a power so the year averages EIA's 33.8%
//            and the windiest hour reaches the farm's size.
//   available_t for an electrolyzer of X MW depends on the procurement rule:
//     "spare"  wind the 50 MW grid connection cannot take: max(0, wind_t - 50)
//     "hourly" any of the farm's wind in the same hour (it is then not sold): wind_t
//     "annual" grid power in any hour, matched by the farm's wind over the year: X (it runs flat out)
//   part-load limit: the electrolyzer runs at p_t = min(X, available_t) when available_t >= m X, and is off otherwise
//   (m = 5% for PEM, 15% for alkaline: IRENA 2020).
//   hydrogen kg_t = p_t x 1,000 / 57 (kWh per kg, DOE Record 24005).
//   electricity cost: spare wind $0 (it would be curtailed); wind diverted from sale and grid power $30/MWh (the record's
//   renewable electricity price, 2022 dollars).
//   cost per kg (a partial levelized cost): (capital recovery at 4% real over 30 years x $2,000/kW + electricity) / kg.
//   It leaves out O&M, stack replacement, compression and other plant costs that DOE's full analysis counts ($5-7/kg).
//   the system's net change (the farm's owner, against no electrolyzer): hydrogen sold at a price minus the electrolyzer's
//   yearly capital minus lost wind sales and grid purchases.
//   steady delivery: the user takes the year's average output every hour; the tank must hold the range of the cumulative
//   difference between production and delivery (it starts at the level that never runs dry).
//   CO2 of grid hours (annual rule): grid MWh x 0.37 t/MWh (illustrative: Prairie Town's gas plant), per kg.
// Every number on the page is checked by _tests/learn/test_a16-hydrogen-ptx.js.
(function () {
  "use strict";
  var HOURS = 8760;

  // ---------------------------------------------------------------- pure model
  function prepare(D, year, targets, profile) {
    var p = profile("wind", D.farm.windMW, { year: year, targets: targets, method: D.farm.profileMethod });
    return { wind: p.mw.slice(0, HOURS), cf: p.cf, D: D };
  }
  function crf(r, n) { return r / (1 - Math.pow(1 + r, -n)); }
  // one design: X MW, rule "spare" | "hourly" | "annual", tech "pem" | "alk"
  function run(Y, X, rule, tech) {
    var D = Y.D, E = D.electrolyzer, m = E.minLoad[tech || "pem"], ex = D.farm.exportMW, o = { X: X, rule: rule, tech: tech || "pem", mwh: 0, kg: 0, hoursOn: 0, spareUsed: 0, diverted: 0, grid: 0, curtailed: 0, curtailed0: 0, kgByHour: [], lostMin: 0 };
    for (var t = 0; t < HOURS; t++) {
      var w = Y.wind[t], spare = Math.max(0, w - ex), av = rule === "spare" ? spare : rule === "hourly" ? w : X, pw = 0;
      if (X > 0 && av >= m * X - 1e-12) pw = Math.min(X, av); else if (X > 0) o.lostMin += Math.min(X, av);
      var fromSpare = Math.min(pw, rule === "annual" ? Math.min(spare, pw) : spare), fromWind = rule === "annual" ? Math.min(w, pw) : pw;
      var diverted = rule === "spare" ? 0 : Math.max(0, fromWind - fromSpare), grid = rule === "annual" ? pw - fromWind : 0;
      o.mwh += pw; o.hoursOn += pw > 0 ? 1 : 0; o.spareUsed += fromSpare; o.diverted += diverted; o.grid += grid;
      o.curtailed0 += spare; o.curtailed += Math.max(0, spare - fromSpare);
      var kg = pw * 1000 / E.kWhPerKg; o.kg += kg; o.kgByHour.push(kg);
    }
    o.util = X > 0 ? o.mwh / (X * HOURS) : 0;
    o.capital = crf(E.rate, E.life) * E.capexPerKW * 1000 * X;
    o.elecCost = (o.diverted + o.grid) * D.elecPrice;
    o.lcoh = o.kg > 0 ? (o.capital + o.elecCost) / o.kg : null;
    o.gridCO2 = o.kg > 0 ? o.grid * D.gridCO2 * 1000 / o.kg : 0;   // kg CO2 per kg H2
    o.windMWh = sum(Y.wind); o.matched = rule !== "annual" || o.mwh <= o.windMWh + 1e-6;
    return o;
  }
  function net(o, price) { return price * o.kg - o.capital - o.elecCost; }   // $ a year, against no electrolyzer
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function sweep(Y, rule, tech, price) {
    var S = Y.D.sizes, out = [];
    for (var X = S.min; X <= S.max + 1e-9; X += S.step) { var o = run(Y, X, rule, tech); out.push({ X: X, lcoh: o.lcoh, net: net(o, price), util: o.util, kg: o.kg, curtailed: o.curtailed }); }
    return out;
  }
  // the best size for the owner (highest net change; ties go to the smaller size) and the size with the cheapest kg
  function best(Y, rule, tech, price) {
    var s = sweep(Y, rule, tech, price), bn = s[0], bl = s[0];
    s.forEach(function (r) { if (r.net > bn.net + 1e-6) bn = r; if (r.lcoh != null && (bl.lcoh == null || r.lcoh < bl.lcoh - 1e-9)) bl = r; });
    return { net: bn, lcoh: bl, sweep: s };
  }
  // steady delivery: tank size (kg) for the year's average flow; level at the end of each day for the chart
  function tank(o) {
    var q = o.kg / HOURS, s = 0, lo = 0, hi = 0, daily = [];
    for (var t = 0; t < HOURS; t++) { s += o.kgByHour[t] - q; if (s < lo) lo = s; if (s > hi) hi = s; if (t % 24 === 23) daily.push(s); }
    return { q: q, size: hi - lo, days: (hi - lo) / (q * 24), daily: daily.map(function (v) { return v - lo; }) };
  }
  // the energy chain of 1 MWh of electricity
  function chain(D) {
    var kg = 1000 / D.electrolyzer.kWhPerKg, lhv = kg * D.lhv / 1000, back = lhv * D.fuelCell;
    return { kg: kg, lhv: lhv, back: back, eff: D.lhv / D.electrolyzer.kWhPerKg };
  }
  var fm = {
    t: function (kg) { return Math.round(kg / 1000).toLocaleString("en-US") + " t"; },
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    gwh: function (v) { return (v / 1000).toFixed(1) + " GWh"; },
    pct: function (x) { return Math.round(x * 100) + "%"; },
    kg2: function (v) { return v == null ? "–" : "$" + v.toFixed(2); },
    musd: function (v) { return (v < 0 ? "−$" : "+$") + (Math.abs(v) / 1e6).toFixed(2) + "M"; },
    co2: function (v) { return v.toFixed(1) + " kg"; }
  };
  var model = { HOURS: HOURS, prepare: prepare, crf: crf, run: run, net: net, sweep: sweep, best: best, tank: tank, chain: chain, sum: sum, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "a16-hydrogen-ptx", KEY = "a16-own";
  var RULES = { spare: "Spare wind only", hourly: "Hourly matched", annual: "Annual matched" };
  function css() {
    if (document.getElementById("a16-css")) return;
    H("style", { id: "a16-css", text: [
      ".a16-lab .lx-stepcard{grid-template-columns:minmax(0,1fr)}.a16-lab .lx-step-act{grid-template-columns:minmax(0,1fr)}.a16-lab .lx-stepcard>*,.a16-lab .lx-step-act>*{min-width:0}",
      ".a16-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".a16-kpi{display:grid;padding:7px 11px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:100px}",
      ".a16-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display)}.a16-kpi b{font-family:var(--lx-f-mono);font-size:16px;font-weight:600}",
      ".a16-kpi.bad b{color:var(--lx-bad)}.a16-kpi.good b{color:var(--lx-good)}",
      ".a16-tbl{overflow-x:auto;max-width:100%}.a16-tbl table{width:100%;border-collapse:collapse;font-size:14px}",
      ".a16-tbl th,.a16-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:right;font-weight:400}",
      ".a16-tbl th:first-child,.a16-tbl td:first-child{text-align:left}.a16-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3);vertical-align:bottom}",
      ".a16-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.a16-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".a16-note{font-size:13.5px;color:var(--lx-ink-3);margin:0}",
      "@media (max-width:560px){.a16-tbl table{font-size:12.5px}.a16-tbl th,.a16-tbl td{padding:4px 3px}.a16-tbl .ph{display:none}}"
    ].join("\n") }, document.head);
  }
  function kpi(host, label, value, tone) { var k = H("div", { class: "a16-kpi" + (tone ? " " + tone : "") }, host); H("small", { text: label }, k); H("b", { text: value }, k); return k; }
  function table(host, head, rows, label) {
    var w = H("div", { class: "a16-tbl", tabindex: "0", role: "region", "aria-label": label }, host), t = H("table", null, w), hr = H("tr", null, H("thead", null, t)), ph = head.map(function (x) { return x.charAt(0) === "~"; });
    head.forEach(function (x, i) { H("th", { scope: "col", class: ph[i] ? "ph" : "", text: x.replace(/^~/, "") }, hr); });
    var b = H("tbody", null, t); rows.forEach(function (r) { var tr = H("tr", null, b); r.forEach(function (c, i) { H("td", { class: ph[i] ? "ph" : "", text: c }, tr); }); });
    return w;
  }

  LX.mount(SLUG, function (live, data, root) {
    css(); root.classList.add("a16-lab");
    var D = data.a16_hydrogen_ptx, Y = prepare(D, data.town_year, data.cf_targets, LX.townProfile), E = D.electrolyzer;
    var st = { X: D.sizes.start, tech: "pem", price: D.prices.start };
    var own = LX.store.get(KEY, {}) || {}; function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var spare0 = run(Y, 0, "spare", "pem").curtailed0;
    var steps = [
      // 1 the chain
      { text: "Follow 1 MWh of wind power into an [[electrolyzer|electrolyzer]] and back out of a [[fuel-cell|fuel cell]]. Predict first: how much electricity comes back?",
        build: function (act, api) {
          var c = chain(D), host = H("div", { hidden: true }, act);
          var pr = LX.Predict(act, { id: "a16-back", fresh: true, q: "", title: false, answer: "c",
            options: [{ value: "a", label: "About 0.9 MWh" }, { value: "b", label: "About 0.6 MWh" }, { value: "c", label: "About 0.35 MWh" }],
            feedback: { c: "About " + c.back.toFixed(2) + " MWh: two conversions, each losing a large share.", b: c.lhv.toFixed(2) + " MWh is what the hydrogen holds; the fuel cell loses more on the way back.", a: "Batteries return about that much; hydrogen goes through two conversions." },
            onPick: function () { pr.reveal(); host.hidden = false; api.done(); api.saw("Electrolysis keeps about " + fm.pct(c.eff) + " of the energy, the fuel cell about " + fm.pct(D.fuelCell) + ": **" + c.back.toFixed(2) + " MWh back**."); } });
          LX.EnergyChain(host, { title: "1 MWh through hydrogen", stops: [
            { icon: "turbine", title: "Wind power", text: "Electricity in.", value: "1 MWh" },
            { icon: "flask", title: "Electrolyzer", text: E.kWhPerKg + " kWh per kg (DOE).", value: c.kg.toFixed(1) + " kg" },
            { icon: "bolt", title: "Energy in the hydrogen", text: D.lhv + " kWh per kg, lower heating value.", value: c.lhv.toFixed(2) + " MWh" },
            { icon: "battery", title: "Fuel cell", text: "About " + fm.pct(D.fuelCell) + " efficient (DOE).", value: c.back.toFixed(2) + " MWh" }] });
        } },
      // 2 size an electrolyzer on spare wind
      { text: "A 100 MW wind farm's grid connection takes 50 MW; the rest is [[curtailment|curtailed]]. Add a PEM electrolyzer that uses only that spare wind. Try three sizes.",
        build: function (act, api) {
          var out = H("div", { class: "a16-kpis", "aria-live": "polite" }, act), tried = {};
          function draw() {
            var o = run(Y, st.X, "spare", st.tech); out.innerHTML = "";
            kpi(out, "Hydrogen a year", fm.t(o.kg)); kpi(out, "Runs at full size", fm.pct(o.util)); kpi(out, "Curtailed left", fm.gwh(o.curtailed)); kpi(out, "Cost per kg (partial)", fm.kg2(o.lcoh));
            return o;
          }
          LX.Slider(act, { label: "Electrolyzer size", min: D.sizes.min, max: D.sizes.max, step: D.sizes.step, value: st.X, fmt: function (v) { return v + " MW"; },
            onChange: function (v) { st.X = v; var o = draw(); tried[v] = 1; if (Object.keys(tried).length >= 3) { api.done(); api.saw("At " + v + " MW it runs " + fm.pct(o.util) + " of the time at full size. **Bigger electrolyzers sit idle more**, so each kg carries more capital: " + fm.kg2(o.lcoh) + " per kg."); } } });
          H("p", { class: "a16-note", text: "Without it, " + fm.gwh(spare0) + " of wind a year is curtailed. Cost per kg here counts capital ($" + E.capexPerKW.toLocaleString("en-US") + "/kW, 2022 dollars) and power only; DOE's full estimate is $5–7/kg." }, act);
          draw();
        } },
      // 3 part-load limits
      { text: "Electrolyzers cannot run at any load: below a [[minimum-load|minimum load]] they stop. Compare a PEM unit (5%) with an alkaline one (15%) on the same spare wind.",
        build: function (act, api) {
          var out = H("div", { class: "a16-kpis", "aria-live": "polite" }, act), seen = {}, seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Electrolyzer type" }, act);
          var bs = [["pem", "PEM · 5% minimum"], ["alk", "Alkaline · 15% minimum"]].map(function (x) { return H("button", { type: "button", "aria-pressed": "false", text: x[1], onclick: function () { pick(x[0]); } }, seg); });
          function pick(k) {
            st.tech = k; seen[k] = 1; bs.forEach(function (b, i) { b.setAttribute("aria-pressed", String((i ? "alk" : "pem") === k)); });
            var o = run(Y, st.X, "spare", k); out.innerHTML = "";
            kpi(out, "Hours running", o.hoursOn.toLocaleString("en-US")); kpi(out, "Spare wind lost below the minimum", fm.mwh(o.lostMin), o.lostMin > 0 ? "bad" : ""); kpi(out, "Cost per kg (partial)", fm.kg2(o.lcoh));
            if (seen.pem && seen.alk) { var a = run(Y, st.X, "spare", "pem"), b = run(Y, st.X, "spare", "alk"); api.done(); api.saw("At " + st.X + " MW the alkaline unit runs " + (a.hoursOn - b.hoursOn).toLocaleString("en-US") + " fewer hours and loses " + fm.mwh(b.lostMin) + " of spare wind a year. Weak wind hours are many."); }
          }
          H("p", { class: "a16-note", text: "Load ranges: " + E.loadSource.label + "." }, act);
          pick("alk");
        } },
      // 4 cost per kg against the system
      { text: "The owner sells hydrogen at a price. Which size gives the cheapest kilogram, and which leaves the owner best off? Move the price.",
        build: function (act, api) {
          var P = LX.Plot(act, { box: true, text: "Text version of the chart" }), out = H("p", { class: "a16-note", "aria-live": "polite" }, act), moved = 0;
          function draw() {
            var b = best(Y, "spare", st.tech, st.price), s = b.sweep;
            P.render({ x: { min: 0, max: 60, ticks: [[0, "0"], [20, "20"], [40, "40"], [60, "60 MW"]] }, y: { min: 0, max: 12, step: 2, fmt: function (v) { return "$" + v; }, unit: "$ per kg" },
              lines: [{ pts: s.map(function (r) { return [r.X, r.lcoh]; }), color: "var(--lx-accent)", dots: true }], refs: [{ y: st.price, label: "Price $" + st.price.toFixed(2), dash: "5 4" }],
              marks: [{ x: b.lcoh.X, y: b.lcoh.lcoh, label: "Cheapest kg", kind: "dot", pos: "below" }, { x: b.net.X, y: b.net.lcoh, label: "Best for the owner", kind: "ring" }],
              legend: [{ label: "Cost per kg (partial)", color: "var(--lx-accent)" }], aria: "Cost per kilogram against electrolyzer size, with the hydrogen price",
              text: { head: ["Size, MW", "Cost per kg", "Owner's net change a year"], rows: s.map(function (r) { return [String(r.X), fm.kg2(r.lcoh), fm.musd(r.net)]; }) } });
            out.innerHTML = LX.rich("At $" + st.price.toFixed(2) + "/kg: cheapest kg at **" + b.lcoh.X + " MW** (" + fm.kg2(b.lcoh.lcoh) + "); best for the owner at **" + b.net.X + " MW** (" + fm.musd(b.net.net) + " a year, cost per kg " + fm.kg2(b.net.lcoh) + ").").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
            return b;
          }
          LX.Slider(act, { label: "Hydrogen price", min: D.prices.min, max: D.prices.max, step: D.prices.step, value: st.price, fmt: function (v) { return "$" + v.toFixed(2) + "/kg"; },
            onChange: function (v) { st.price = v; var b = draw(); moved++; if (moved >= 2) { api.done(); remember("price", v); api.saw("The owner keeps adding size while one more block's hydrogen is worth more than it costs; the average cost per kg keeps rising. Case file CF2 tells a published study's version."); } } });
          draw();
        } },
      // 5 storage for steady delivery
      { text: "A fertilizer plant needs the same flow of hydrogen every hour, but wind is not steady. How big must the tank be to deliver the year's output evenly?",
        build: function (act, api) {
          var o = run(Y, st.X, "spare", st.tech), tk = tank(o), out, P;
          var pr = LX.Predict(act, { id: "a16-tank", fresh: true, q: "The tank must hold about…", answer: "weeks",
            options: [{ value: "hours", label: "a few hours of delivery" }, { value: "days", label: "a few days" }, { value: "weeks", label: "weeks or more" }],
            feedback: { weeks: "Windy and calm seasons differ, so the tank fills for weeks and drains for weeks.", hours: "Daily swings are small next to the seasons'.", days: "Calm spells last days, and seasons longer." },
            onPick: function () {
              pr.reveal(); out.innerHTML = ""; kpi(out, "Steady delivery", Math.round(tk.q).toLocaleString("en-US") + " kg/h"); kpi(out, "Tank needed", fm.t(tk.size)); kpi(out, "Days of delivery", Math.round(tk.days).toLocaleString("en-US"));
              P.render({ x: { min: 0, max: 365, ticks: [[0, "Jan"], [90, "Apr"], [181, "Jul"], [273, "Oct"], [365, "Dec 31"]], ticksN: [[0, "Jan"], [181, "Jul"], [365, "Dec"]] }, y: { min: 0, max: Math.ceil(tk.size / 1000 / 100) * 100, step: Math.ceil(tk.size / 1000 / 400) * 100, fmt: function (v) { return v.toLocaleString("en-US"); }, unit: "t in the tank" },
                lines: [{ values: tk.daily.map(function (v) { return v / 1000; }), x0: 1, color: "var(--lx-good)", area: 0.15 }], aria: "Hydrogen in the tank at the end of each day of 2025",
                text: { head: ["Month end", "t in the tank"], rows: [30, 58, 89, 119, 150, 180, 211, 242, 272, 303, 333, 364].map(function (d, i) { return ["month " + (i + 1), Math.round(tk.daily[d] / 1000).toLocaleString("en-US")]; }) } });
              api.done(); remember("tank", tk.size);
              api.saw("At " + st.X + " MW: " + fm.t(tk.size) + ", " + Math.round(tk.days) + " days of delivery. A salt cavern holds about " + fm.t(D.cavernTonnes * 1000) + " (DOE): steady delivery from wind needs [[long-duration-storage|long-duration storage]].");
            } });
          out = H("div", { class: "a16-kpis" }, act); P = LX.Plot(act, { box: true, text: "Text version of the tank" });
        } },
      // 6 procurement rules
      { text: "[[procurement-rule|Rules]] for calling hydrogen clean set which power may count. Compare three at 30 MW: spare wind, wind [[hourly-matching|matched hour by hour]], or grid power matched over the year.",
        build: function (act, api) {
          var X = 30, tb = H("div", null, act), note = H("p", { class: "a16-note" }, act), rs = ["spare", "hourly", "annual"].map(function (r) { return run(Y, X, r, st.tech); });
          var pr = LX.Predict(act, { id: "a16-match", fresh: true, q: "Which rule gives the cheapest kilogram?", answer: "annual",
            options: [{ value: "spare", label: RULES.spare }, { value: "hourly", label: RULES.hourly }, { value: "annual", label: RULES.annual }],
            feedback: { annual: "It runs flat out, so its capital is spread over the most kilograms.", spare: "Spare wind is free, but it comes in few hours.", hourly: "Hourly matching runs whenever the wind blows: more hours than spare wind, fewer than the grid." },
            onPick: function () {
              pr.reveal(); tb.innerHTML = "";
              table(tb, ["Rule", "Runs at full size", "Cost per kg", "~Grid power", "CO₂ of grid hours, per kg"], rs.map(function (o) { return [RULES[o.rule], fm.pct(o.util), fm.kg2(o.lcoh), fm.gwh(o.grid), fm.co2(o.gridCO2)]; }), "Three procurement rules at 30 MW");
              note.innerHTML = LX.rich("Grid hours' CO₂ assumes a gas plant at " + D.gridCO2 + " t/MWh makes that power (illustrative). DOE's clean-hydrogen target is " + D.chps.toFixed(1) + " kg CO₂e per kg, life cycle.");
              api.done(); var a = rs[2];
              api.saw("Annual matching: " + fm.kg2(a.lcoh) + " per kg, yet its grid hours carry about " + fm.co2(a.gridCO2) + " of CO₂ per kg. **A matching rule sets what may be claimed; what is emitted depends on the grid** (additionality, deliverability).");
            } });
        } },
      // 7 the use sorter
      { text: "Where is hydrogen worth its losses? Sort eight uses by their alternative today, then check.",
        build: function (act, api) {
          LX.CardSort(act, { bins: D.uses.bins, cards: D.uses.cards, onCheck: function (g) {
            if (g.placed < g.total) return; api.done(); LX.progress.done(SLUG); remember("uses", g.right);
            api.saw(g.right + " of " + g.total + " as the evidence sorts them. Hydrogen makes most sense where it is the feedstock, or where nothing electric does the job yet.");
          } });
          H("p", { class: "a16-note", text: "Sources: " + D.uses.sources.map(function (s) { return s.label; }).join("; ") + "." }, act);
        } }
    ];
    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "a16-steps", steps: steps });
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 6 : m ? +m[1] : 0;
      if (!n) return null;
      cards.go(Math.min(steps.length, n) - 1);
      var pick = { 1: 2, 5: 2, 6: 2 }[n];
      if (pick != null) { var bs = cardsHost.querySelectorAll(".lx-step-act .lx-choice"); if (bs[pick]) bs[pick].click(); }
      return { view: state };
    }, cards);
    root.lxLesson = { model: model, Y: Y, cards: cards };
    explain(Y, D);
  });

  // ---------------------------------------------------------------- explain layer: flowchart, comparison table, boundary
  function explain(Y, D) {
    var x = document.getElementById("a16-explain"); if (!x) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var X = 30, rs = ["spare", "hourly", "annual"].map(function (r) { return run(Y, X, r, "pem"); });
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "From wind to a use: the questions in order", lede: "Each step either keeps hydrogen in the running or sends the job to electricity.",
      nodes: { wind: { t: "Spare or cheap power?", tN: ["Spare or", "cheap power?"], k: "q" }, ez: { t: "Electrolyzer runs enough hours?", tN: ["Runs enough", "hours?"], k: "q" },
               store: { t: "Steady user? Store it", tN: ["Steady user?", "Store it"], s: "tank or cavern", sN: "tank or cavern" },
               use: { t: "Is hydrogen the feedstock?", tN: ["Hydrogen the", "feedstock?"], k: "q" }, yes: { t: "Hydrogen makes sense", tN: ["Hydrogen", "makes sense"], k: "end" },
               elec: { t: "Use electricity directly", tN: ["Use electricity", "directly"], k: "end" } },
      cols: 2, at: { wind: [0, 0], ez: [0, 1], store: [0, 2], use: [0, 3], yes: [0, 4], elec: [1, 3] }, colsN: 2, atN: { wind: [0, 0], ez: [0, 1], store: [0, 2], use: [0, 3], yes: [0, 4], elec: [1, 3] },
      edges: [["wind", "ez", "yes"], ["ez", "store", "yes"], ["store", "use"], ["use", "yes", "yes"], ["use", "elec", "no"]],
      traces: [{ label: "Fertilizer", path: ["wind", "ez", "store", "use", "yes"], text: "Ammonia needs hydrogen: the question is how cheaply and how cleanly it is made." },
               { label: "Home heating", path: ["wind", "ez", "store", "use", "elec"], text: "A heat pump gives up to three times the heat of the power it uses." }], sel: 0
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Three procurement rules, one 30 MW electrolyzer", lede: "Same farm, same year (PEM, 5% minimum). Cost per kg counts capital and power only.",
      columns: [{ key: "name", label: "Rule", main: true }, { key: "util", label: "Runs at full size", phone: "Full size", num: true }, { key: "lcoh", label: "Cost per kg", num: true }, { key: "co2", label: "CO₂ of grid hours, per kg", phone: "Grid CO₂", num: true }],
      rows: rs.map(function (o) { return { key: o.rule, color: o.rule === "annual" ? "var(--lx-bad)" : "var(--lx-good)", name: RULES[o.rule], note: fm.t(o.kg) + " a year", util: { text: fm.pct(o.util), value: o.util }, lcoh: { text: fm.kg2(o.lcoh), value: o.lcoh }, co2: { text: fm.co2(o.gridCO2), value: o.gridCO2 } }; }),
      sorts: [{ label: "By rule", order: ["spare", "hourly", "annual"], note: "The rule changes how many hours run, so it changes the cost per kg." },
              { label: "By cost per kg", order: rs.slice().sort(function (a, b) { return a.lcoh - b.lcoh; }).map(function (o) { return o.rule; }), ranked: true, note: "The cheapest kg comes with the grid's emissions unless the grid power is itself clean." }]
    });
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where this lesson's numbers hold",
      holds: ["one illustrative 100 MW wind farm with a 50 MW connection, on SPP's real 2025 wind hours;", "DOE's 2022-dollar capital cost and power price, at 4% real over 30 years;", "hydrogen used or stored on site, sold at a price you set."],
      leaves: ["operation and maintenance, stack replacement, compression and pipelines;", "credit rules, which change from year to year;", "whether the wind farm would have been built anyway (additionality)."],
      source: "Costs: DOE Hydrogen Program Record 24005 (2022 dollars). Part-load ranges: IRENA (2020)." });
  }
})();
