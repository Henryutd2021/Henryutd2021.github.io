// m04-storage-multienergy.js — Modeler lesson M4, "Storage and coupled carriers: modelling power, hydrogen and heat
// together" (model-lab: step cards with solver runs), wave W3, 2026-11-03.
//
// Data: assets/learn/data/m04-storage-multienergy.json (the plant, its devices, the customers, two weeks, the four
// configurations, and a reference block written by the test), town.json (Prairie Town's fleet, for its grid price),
// town_year.json (SPP 2025 hourly shapes, EIA-930) and cf_targets.json (EIA's wind capacity factor).
//
// The model: one linear program for a week (t = 0..167, one hour each, so MW over the hour is MWh). Decisions each hour:
//   exp, imp      sold to and bought from the grid at Prairie Town's price p_t (MW, each at most 50)
//   cur           curtailed wind (MW)
//   bc, bd, s     battery charge, discharge (MW) and its state of charge (MWh)
//   ez            electrolyzer power (MW); it makes 1,000 / 57 kg of hydrogen per MWh
//   L, tr         hydrogen in the tank (kg) and hydrogen trucked in (kg)
//   hp            heat pump power (MW); it gives COP x hp of heat
//   rec           heat recovered from the electrolyzer (MW of heat, at most 20% of ez)
//   hin, hout, Q  heat store charge, discharge (MW) and level (MWh)
//   boil          the town's gas boiler (MW of heat)
// Balances (each one a row whose dual is that carrier's marginal value under the stated assumptions):
//   power     exp + bc + ez + hp + cur - imp - bd = wind_t                       ("p<t>"; marginal value of power = -dual)
//   hydrogen  (1,000/57) ez + tr + L_{t-1} - L_t = q                             ("h<t>"; dual = marginal cost of a kg)
//   heat      COP hp + rec - hin + hout + boil = H_t                             ("q<t>"; dual = marginal cost of a MWh of heat)
//   network   COP hp + rec - hin + hout <= 12 (the heat network's limit)
//   levels    s_t = s_{t-1} + eta bc - bd; Q_t = (1 - lambda) Q_{t-1} + hin - hout; every level ends the week where it starts
//   limits    tank 400 <= L <= 4,000 kg; ez <= 20 MW, and ez >= 15% of 20 MW in every hour when the unit must stay on
// Goal: the week's cost = sum of p_t (imp - exp) + $2.50 per kg trucked + $15 per MWh of boiler heat.
// A configuration switches devices off (their upper bounds 0). With the electrolyzer off, all hydrogen is trucked.
// Exact on/off for the minimum load needs a binary per hour (a mixed-integer program): build(..., {minLoad: "binary"});
// the page shows its cost only, from the reference block, with no prices (curriculum §9.2).
// The configurations' costs, savings, flows and prices come from this LP with mode "stop": the electrolyzer may run at any
// load from 0 to 20 MW (the LP relaxation of its 15% minimum). The page labels them so (M4 review, finding 3); the exact
// on/off cost is shown only where the test proves it (winter, hydrogen configuration).
// Coefficients are named with their exact values: k = 1,000 / 57 kg per MWh (about 17.54), eta = 0.8259 (DOE's 82.59%),
// COP = 3, lambda = 1 - 0.98^(1/24) (M4 review, finding 2).
// Every number on the page is checked by _tests/learn/test_m04-storage-multienergy.js, which also proves that the hourly
// marginal values the page shows are unique (both one-sided changes of the cost agree).
(function () {
  "use strict";
  var DAY = 24;

  // ---------------------------------------------------------------- pure model
  function startIndex(year, wk) {
    return Math.round((Date.parse(wk.date + "T00:00:00Z") - Date.parse(year.start_utc + "Z")) / 3600000) + 1 - wk.utcOffsetHours;
  }
  function prepare(D, town, year, targets, profile, weekId) {
    var wk = D.weeks.filter(function (w) { return w.id === weekId; })[0], T = 7 * DAY, i0 = startIndex(year, wk), f = town.fleet;
    var pw = profile("wind", D.plant.windMW, { year: year, targets: targets, method: D.plant.profileMethod });
    var W = { id: wk.id, label: wk.label, short: wk.short, T: T, i0: i0, wind: [], price: [], heat: [], demand: [], short: 0 };
    var dmax = 0, t;
    for (t = 0; t < T; t++) dmax = Math.max(dmax, year.demand[i0 + t]);
    for (t = 0; t < T; t++) {
      var d = Math.round(year.demand[i0 + t] / 1000 * D.town.demandPeakMW), w = Math.round(year.wind[i0 + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i0 + t] / 1000 * f.solar.mw);
      var g = d - f.nuclear.mw - w - s;
      W.price.push(g < 0 ? 0 : g < f.cc.mw ? f.cc.cost : f.peaker.cost); if (g >= f.cc.mw + f.peaker.mw) W.short++;
      W.demand.push(d); W.wind.push(Math.round(pw.mw[i0 + t] * 10) / 10);
      W.heat.push(Math.round(wk.heatPeakMW * year.demand[i0 + t] / dmax * 100) / 100);
    }
    W.windMWh = sum(W.wind); W.heatMWh = sum(W.heat); W.spare = sum(W.wind.map(function (x) { return Math.max(0, x - D.plant.exportMW); }));   // wind above the connection: without storage it must be curtailed
    return W;
  }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function cfgOf(D, id) { return D.configs.filter(function (c) { return c.id === id; })[0]; }
  // o: { minLoad: "stop" | "on" | "binary", exportMW, delta: {row: amount} (adds to a row's right-hand side, for the test) }
  function build(W, D, cfg, o) {
    o = o || {}; var T = W.T, B = D.battery, E = D.electrolyzer, K = D.tank, Hh = D.heat, q = D.hydrogen.demandKgPerHour;
    var kpm = 1000 / E.kWhPerKg, lam = 1 - Math.pow(1 - Hh.lossPerDay, 1 / DAY), ex = o.exportMW != null ? o.exportMW : D.plant.exportMW;
    var ezMax = cfg.ez ? E.MW : 0, mode = o.minLoad || "stop", vars = [], cons = [], dl = o.delta || {};
    function rhs(name, v) { return v + (dl[name] || 0); }
    for (var t = 0; t < T; t++) {
      var p = W.price[t], pr = (t + T - 1) % T;
      vars.push({ name: "exp" + t, ub: ex, cost: -p }, { name: "imp" + t, ub: D.plant.importMW, cost: p }, { name: "cur" + t, ub: W.wind[t] },
        { name: "bc" + t, ub: cfg.battery ? B.MW : 0 }, { name: "bd" + t, ub: cfg.battery ? B.MW : 0 }, { name: "s" + t, ub: cfg.battery ? B.MWh : 0 },
        { name: "ez" + t, lb: cfg.ez && mode === "on" ? E.minLoad * E.MW : 0, ub: ezMax }, { name: "L" + t, lb: K.minKg, ub: K.kg }, { name: "tr" + t, cost: D.hydrogen.truckPerKg },
        { name: "hp" + t, ub: cfg.heat ? Hh.pumpMW : 0 }, { name: "rec" + t, ub: cfg.rec ? E.heatShare * E.MW : 0 },
        { name: "hin" + t, ub: cfg.heat ? Hh.networkMW * 2 : 0 }, { name: "hout" + t, ub: cfg.heat ? Hh.networkMW * 2 : 0 }, { name: "Q" + t, ub: cfg.heat ? Hh.storeMWh : 0 },
        { name: "boil" + t, cost: Hh.boilerPerMWh });
      if (cfg.ez && mode === "binary") vars.push({ name: "on" + t, type: "binary" });
      var a = {}; a["exp" + t] = 1; a["bc" + t] = 1; a["ez" + t] = 1; a["hp" + t] = 1; a["cur" + t] = 1; a["imp" + t] = -1; a["bd" + t] = -1;
      cons.push({ name: "p" + t, terms: a, eq: rhs("p" + t, W.wind[t]) });
      var h = {}; h["ez" + t] = kpm; h["tr" + t] = 1; h["L" + pr] = 1; h["L" + t] = (h["L" + t] || 0) - 1;
      cons.push({ name: "h" + t, terms: h, eq: rhs("h" + t, q) });
      var qh = {}; qh["hp" + t] = Hh.cop; qh["rec" + t] = 1; qh["hin" + t] = -1; qh["hout" + t] = 1; qh["boil" + t] = 1;
      cons.push({ name: "q" + t, terms: qh, eq: rhs("q" + t, W.heat[t]) });
      var n = {}; n["hp" + t] = Hh.cop; n["rec" + t] = 1; n["hin" + t] = -1; n["hout" + t] = 1;
      cons.push({ name: "net" + t, terms: n, le: Hh.networkMW });
      var r = {}; r["rec" + t] = 1; r["ez" + t] = -E.heatShare; cons.push({ name: "rc" + t, terms: r, le: 0 });
      var sb = {}; sb["s" + t] = 1; sb["bc" + t] = -B.eta; sb["bd" + t] = 1; sb["s" + pr] = (sb["s" + pr] || 0) - 1; cons.push({ name: "sb" + t, terms: sb, eq: 0 });
      var sq = {}; sq["Q" + t] = 1; sq["hin" + t] = -1; sq["hout" + t] = 1; sq["Q" + pr] = (sq["Q" + pr] || 0) - (1 - lam); cons.push({ name: "sq" + t, terms: sq, eq: 0 });
      if (cfg.ez && mode === "binary") {
        var u1 = {}; u1["ez" + t] = 1; u1["on" + t] = -E.MW; cons.push({ name: "onU" + t, terms: u1, le: 0 });
        var u2 = {}; u2["ez" + t] = 1; u2["on" + t] = -E.minLoad * E.MW; cons.push({ name: "onL" + t, terms: u2, ge: 0 });
      }
    }
    return { sense: "min", variables: vars, constraints: cons };
  }
  function read(W, D, cfg, r) {
    if (!r || !r.values) return { ok: false, status: r ? r.status : "error" };
    var v = function (k) { var x = r.values[k]; return Math.abs(x) < 1e-7 ? 0 : x; }, E = D.electrolyzer, o = { ok: !!r.ok, status: r.status, cost: r.objective, exp: 0, imp: 0, cur: 0, ez: 0, kg: 0, tr: 0, boil: 0, hpHeat: 0, rec: 0, below: 0, L: [], s: [], Q: [], ezs: [] };
    for (var t = 0; t < W.T; t++) {
      o.exp += v("exp" + t); o.imp += v("imp" + t); o.cur += v("cur" + t); o.ez += v("ez" + t); o.tr += v("tr" + t); o.boil += v("boil" + t);
      o.hpHeat += D.heat.cop * v("hp" + t); o.rec += v("rec" + t); o.L.push(v("L" + t)); o.s.push(v("s" + t)); o.Q.push(v("Q" + t)); o.ezs.push(v("ez" + t));
      if (v("ez" + t) > 1e-4 && v("ez" + t) < E.minLoad * E.MW - 1e-4) o.below++;
    }
    o.kg = o.ez * 1000 / E.kWhPerKg; o.truckCost = o.tr * D.hydrogen.truckPerKg; o.boilCost = o.boil * D.heat.boilerPerMWh; o.power = o.cost - o.truckCost - o.boilCost;
    o.duals = r.duals || null;
    return o;
  }
  // the hour's marginal values (LP only): power $/MWh, hydrogen $/kg, heat $/MWh of heat
  function prices(r, t) { if (!r || !r.duals) return null; return { power: -r.duals["p" + t], h2: r.duals["h" + t], heat: r.duals["q" + t] }; }
  // the separate systems: hydrogen all trucked, heat all from the boiler (closed form)
  function separateExtras(W, D) { return { h2: D.hydrogen.demandKgPerHour * W.T * D.hydrogen.truckPerKg, heat: W.heatMWh * D.heat.boilerPerMWh }; }
  var fm = {
    usd: function (v) { return (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US"); },
    k: function (v) { return (v < 0 ? "−$" : "$") + (Math.abs(v) / 1000).toFixed(1) + "k"; },
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    t: function (kg) { return (kg / 1000).toFixed(1) + " t"; },
    p: function (v) { return "$" + (Math.abs(v) < 0.005 ? 0 : v).toFixed(2); }
  };
  var model = { DAY: DAY, startIndex: startIndex, prepare: prepare, cfgOf: cfgOf, build: build, read: read, prices: prices, separateExtras: separateExtras, sum: sum, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "m04-storage-multienergy", KEY = "m4-own";
  function css() {
    if (document.getElementById("m4-css")) return;
    H("style", { id: "m4-css", text: [
      ".m4-lab .lx-stepcard{grid-template-columns:minmax(0,1fr)}.m4-lab .lx-step-act{grid-template-columns:minmax(0,1fr)}.m4-lab .lx-stepcard>*,.m4-lab .lx-step-act>*{min-width:0}",
      ".m4-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".m4-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".m4-kpi{display:grid;padding:7px 11px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:100px}",
      ".m4-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display)}.m4-kpi b{font-family:var(--lx-f-mono);font-size:16px;font-weight:600}",
      ".m4-kpi.bad b{color:var(--lx-bad)}",
      ".m4-formula{font-family:var(--lx-f-mono);font-size:14px;padding:9px 12px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);overflow-x:auto;white-space:nowrap}",
      ".m4-formula var{font-family:var(--lx-f-body);font-style:italic}",
      ".m4-tbl{overflow-x:auto;max-width:100%}.m4-tbl table{width:100%;border-collapse:collapse;font-size:14px}",
      ".m4-tbl th,.m4-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:right;font-weight:400}.m4-tbl th:first-child,.m4-tbl td:first-child{text-align:left}",
      ".m4-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3);vertical-align:bottom}.m4-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.m4-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".m4-note{font-size:13.5px;color:var(--lx-ink-3);margin:0}",
      ".m4-key{margin:0;padding-left:1.1rem;display:grid;gap:2px;font-size:13.5px;color:var(--lx-ink-2)}.m4-key var{font-style:italic}",
      "@media (max-width:560px){.m4-tbl table{font-size:12.5px}.m4-tbl th,.m4-tbl td{padding:4px 3px}.m4-tbl .ph{display:none}}"
    ].join("\n") }, document.head);
  }
  function kpi(host, label, value, tone) { var k = H("div", { class: "m4-kpi" + (tone ? " " + tone : "") }, host); H("small", { text: label }, k); H("b", { text: value }, k); return k; }
  function table(host, head, rows, label) {
    var w = H("div", { class: "m4-tbl", tabindex: "0", role: "region", "aria-label": label }, host), t = H("table", null, w), hr = H("tr", null, H("thead", null, t)), ph = head.map(function (x) { return x.charAt(0) === "~"; });
    head.forEach(function (x, i) { H("th", { scope: "col", class: ph[i] ? "ph" : "", text: x.replace(/^~/, "") }, hr); });
    var b = H("tbody", null, t); rows.forEach(function (r) { var tr = H("tr", null, b); r.forEach(function (c, i) { H("td", { class: ph[i] ? "ph" : "", text: c }, tr); }); });
    return w;
  }
  function dayTicks(date, n) { var o = []; for (var k = 0; k <= 7; k += n) { var d = new Date(Date.parse(date + "T00:00:00Z") + k * 864e5); o.push([k * DAY, d.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]]); } return o; }

  LX.mount(SLUG, function (live, data, root) {
    css(); root.classList.add("m4-lab");
    var D = data.m04_storage_multienergy, R = D.reference, own = LX.store.get(KEY, {}) || {};
    function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var Wk = {}; D.weeks.forEach(function (w) { Wk[w.id] = prepare(D, data.town, data.town_year, data.cf_targets, LX.townProfile, w.id); });
    var res = {};   // key "<week>|<config>|<mode>|<export>" -> read result (with r)
    function keyOf(w, c, m, ex) { return w + "|" + c + "|" + (m || "stop") + "|" + (ex || D.plant.exportMW); }
    function solve(w, c, m, ex) {
      var k = keyOf(w, c, m, ex); if (res[k] && res[k].ok) return Promise.resolve(res[k]);
      var cfg = cfgOf(D, c), W = Wk[w];
      return LX.solver.solve(build(W, D, cfg, { minLoad: m, exportMW: ex }), { timeLimit: 10, key: "m4-" + k, label: "m4" }).then(function (r) {
        var o = r.ok ? read(W, D, cfg, r) : { ok: false, status: r.status, message: r.message }; o.r = r; res[k] = o; return o;
      });
    }
    function all(list) { return list.reduce(function (p, a) { return p.then(function (bad) { return bad || solve.apply(null, a).then(function (o) { return o.ok ? null : o; }); }); }, Promise.resolve(null)); }
    // one solver action of a step (job() -> Promise of null (all solved) or the failed result):
    // LX.SolveStep (components/solvestep.js); the note keeps the class m4-fail
    function action(o) { o.cls = "m4-fail"; return LX.SolveStep.action(o); }
    function solveStep(act, api, label, list, show) {
      var row = H("div", { class: "m4-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + label }, row), st = LX.SolverStatus(row), out = H("div", { "aria-live": "polite" }, act);
      go.addEventListener("click", action({ api: api, st: st, host: act, go: go, job: function () { return all(list()); }, show: function () { var x = res[keyOf.apply(null, list()[list().length - 1])]; st.set(x.r); show(out); } }));
      return go;
    }
    var W = Wk.winter, shown = D.configs.filter(function (c) { return !c.hidden; });
    var RELAX = "LP relaxation: here the electrolyzer may run below its 15% minimum load.";
    // a store's text version: every hour's level at its end and the change in the hour, with the lowest and highest
    // level and when (M4 review, finding 7)
    function levelText(values, unit) {
      var n = function (v) { return Math.round(v).toLocaleString("en-US"); }, lab = function (t) { return dayTicks(D.weeks[0].date, 1)[Math.floor(t / DAY)][1] + " " + (t % DAY < 10 ? "0" : "") + (t % DAY) + ":00"; };
      var lo = 0, hi = 0; values.forEach(function (v, t) { if (v < values[lo]) lo = t; if (v > values[hi]) hi = t; });
      return { head: ["Hour starting", unit + " at the hour's end", "Change in the hour"], note: "Lowest " + n(values[lo]) + " (" + lab(lo) + "), highest " + n(values[hi]) + " (" + lab(hi) + "). One best plan: other plans of the same cost can run the store differently.",
        rows: values.map(function (v, t) { var d = v - values[(t + values.length - 1) % values.length]; return [lab(t), n(v), (d > 0.5 ? "+" : d < -0.5 ? "−" : "") + n(Math.abs(d))]; }) };
    }
    function v(w, c) { return res[keyOf(w, "power")].cost - res[keyOf(w, c)].cost; }
    function levelPlot(host, values, max, unit, color, label) {
      var P = LX.Plot(host, { box: true, text: "Text version of the chart" });
      P.render({ x: { min: 0, max: W.T, ticks: dayTicks(D.weeks[0].date, 1), ticksN: dayTicks(D.weeks[0].date, 2) }, y: { min: 0, max: max, step: max / 4, fmt: function (v) { return v.toLocaleString("en-US"); }, unit: unit },
        lines: [{ values: values, x0: 0.5, color: color, area: 0.14 }], aria: label,
        text: levelText(values, unit) });
      return P;
    }

    var steps = [
      // 1 the plant
      { text: "The plant: 100 MW of wind behind a 50 MW grid connection, selling at Prairie Town's price each hour (lesson 9). Solve its winter week with no storage.",
        build: function (act, api) {
          solveStep(act, api, "Solve: power only, no battery", function () { return [["winter", "nobat"]]; }, function (out) {
            var x = res[keyOf("winter", "nobat")]; out.innerHTML = ""; var k = H("div", { class: "m4-kpis" }, out);
            kpi(k, "Power earnings", fm.k(-x.power)); kpi(k, "Above the connection", fm.mwh(W.spare), "bad"); kpi(k, "Curtailed (one best plan)", fm.mwh(x.cur));
            // finding 1: the curtailment the connection forces (the same in every best plan) apart from optional $0 curtailment
            api.done(); api.saw("The plant earns " + fm.k(-x.power) + " from power this week. It must curtail " + fm.mwh(W.spare) + ", the wind above its 50 MW connection; this plan curtails " + fm.mwh(x.cur - W.spare) + " more in $0 hours, when selling earns nothing.");
          });
        } },
      // 2 state of charge
      { text: "Add a 20 MW, 80 MWh battery. Its [[state-of-charge|state of charge]] links each hour to the next, and the week ends where it starts.",
        build: function (act, api) {
          H("div", { class: "m4-formula", role: "math", "aria-label": "s t equals s of t minus 1 plus eta times b c t minus b d t; s of minus 1 equals s of 167; eta equals 0.8259", html: "<var>s</var><sub><var>t</var></sub> = <var>s</var><sub><var>t</var>−1</sub> + <var>η</var> <var>bc</var><sub><var>t</var></sub> − <var>bd</var><sub><var>t</var></sub>, &nbsp; <var>s</var><sub>−1</sub> = <var>s</var><sub>167</sub>, &nbsp; <var>η</var> = " + D.battery.eta }, act);
          // every symbol beside the equation (finding 6)
          var key = H("ul", { class: "m4-key" }, act);
          [["s", "state of charge at the end of hour t, MWh (at most 80)"], ["bc, bd", "charging and discharging in hour t, MW (each at most 20)"], ["η", "round trip, " + D.battery.eta + " (DOE's 82.59%); the loss is taken on charging"], ["s−1 = s167", "hour 0 starts where hour 167 ends: the week ends where it starts"]].forEach(function (r) { H("li", { html: "<var>" + LX.esc(r[0]) + "</var>: " + LX.esc(r[1]) }, key); });
          solveStep(act, api, "Solve with the battery", function () { return [["winter", "nobat"], ["winter", "power"]]; }, function (out) {
            var a = res[keyOf("winter", "nobat")], b = res[keyOf("winter", "power")]; out.innerHTML = ""; var k = H("div", { class: "m4-kpis" }, out);
            kpi(k, "Power earnings", fm.k(-b.power)); kpi(k, "Curtailed (one best plan)", fm.mwh(b.cur)); kpi(k, "Battery's value", fm.k(a.cost - b.cost), "good");
            api.done(); remember("bat", a.cost - b.cost); api.saw("The battery moves energy from cheap hours to dearer ones, spare wind or power bought from the grid: worth " + fm.k(a.cost - b.cost) + " this week. 80 MWh is small against the " + fm.mwh(W.spare) + " above the connection.");
          });
        } },
      // 3 electrolyzer and tank
      { text: "Couple a second carrier: a 20 MW [[electrolyzer|electrolyzer]] and a 4,000 kg tank that must stay above 400 kg. A fertilizer plant takes 150 kg every hour; trucked hydrogen costs $2.50 per kg.",
        build: function (act, api) {
          var plotHost = H("div", null, act);
          solveStep(act, api, "Solve with hydrogen", function () { return [["winter", "power"], ["winter", "h2"]]; }, function (out) {
            var a = res[keyOf("winter", "power")], b = res[keyOf("winter", "h2")], base = a.cost; out.innerHTML = ""; var k = H("div", { class: "m4-kpis" }, out);
            kpi(k, "Made on site", fm.t(b.kg)); kpi(k, "Trucked in", fm.t(b.tr)); kpi(k, "Value of coupling", fm.k(base - b.cost), "good");
            H("p", { class: "m4-note", text: RELAX + " Step 4 looks at that limit." }, out);
            plotHost.innerHTML = ""; levelPlot(plotHost, b.L, D.tank.kg, "kg in the tank", "var(--lx-good)", "Hydrogen in the tank through the week (one best plan)");
            api.done(); remember("h2", base - b.cost); api.saw("Against power only with every kg trucked (" + fm.k(base) + " for the week), coupling saves " + fm.k(base - b.cost) + ". The tank rides between its 400 kg floor and its top: a [[reservoir-limit|reservoir limit]] in hydrogen.");
          });
        } },
      // 4 part-load limit
      { text: "This [[alkaline-electrolyzer|alkaline]] electrolyzer must stop below 15% of its size, an on-or-off choice an LP cannot make. Compare two LP stand-ins: any load allowed, or on all week above 15%.",
        build: function (act, api) {
          solveStep(act, api, "Solve both", function () { return [["winter", "h2"], ["winter", "h2", "on"]]; }, function (out) {
            var a = res[keyOf("winter", "h2")], b = res[keyOf("winter", "h2", "on")]; out.innerHTML = "";
            table(out, ["Stand-in", "Week's cost", "~Hours below 15% (this plan)"], [["Any load (relaxed)", fm.k(a.cost), String(a.below)], ["Stays on above 15%", fm.k(b.cost), "0"]], "Two LP stand-ins for the minimum load");
            var same = Math.abs(R.binary.cost - a.cost) < 1;
            H("p", { class: "m4-note", html: LX.rich("The exact on/off model, a [[mixed-integer-program|mixed-integer program]] solved in the test and the notebook, costs " + fm.k(R.binary.cost) + (same ? ": the same as the relaxed LP, so here the low-load hours can be avoided at no cost." : ": between the two.") + " It gives no prices.") }, out);
            api.done(); api.saw("This relaxed plan runs it below 15% in " + a.below + " hours, which the machine cannot do. Forcing it on costs " + fm.k(b.cost - a.cost) + " more. **The two LPs bound the exact answer.**");
          });
        } },
      // 5 heat
      { text: "Add a third carrier, heat: a [[heat-pump|heat pump]] and a heat store feed the town's heat network, and a gas boiler covers the rest.",
        build: function (act, api) {
          table(act, ["Device", "Size", "Conversion or limit"], [["Heat pump", D.heat.pumpMW + " MW of power", D.heat.cop + " MWh of heat per MWh (DOE)"], ["Heat store", D.heat.storeMWh + " MWh of heat", "loses " + Math.round(D.heat.lossPerDay * 100) + "% a day"], ["Heat network", D.heat.networkMW + " MW of heat", "the most it takes from the plant"], ["Gas boiler", "as needed", "$" + D.heat.boilerPerMWh + " per MWh of heat"]], "The heat devices");
          var plotHost = H("div", null, act);
          solveStep(act, api, "Solve with heat", function () { return [["winter", "h2"], ["winter", "heat"]]; }, function (out) {
            var a = res[keyOf("winter", "h2")], b = res[keyOf("winter", "heat")]; out.innerHTML = ""; var k = H("div", { class: "m4-kpis" }, out);
            kpi(k, "Heat from the pump", fm.mwh(b.hpHeat)); kpi(k, "Boiler", fm.mwh(b.boil)); kpi(k, "Value of heat coupling", fm.k(a.cost - b.cost), "good");
            H("p", { class: "m4-note", text: RELAX }, out);
            plotHost.innerHTML = ""; levelPlot(plotHost, b.Q, D.heat.storeMWh, "MWh of heat stored", "var(--lx-pk)", "Heat in the store through the week (one best plan)");
            api.done(); remember("heat", a.cost - b.cost); api.saw("The heat pump turns spare and cheap power into heat: " + fm.k(a.cost - b.cost) + " saved this week. The 12 MW network caps it at the town's coldest hours.");
          });
        } },
      // 6 where coupling earns value
      { text: "Where does coupling earn value, and where not? Predict how heat coupling fares in summer, then solve each configuration for a winter and a summer week.",
        build: function (act, api) {
          var tb, go;
          var pr = LX.Predict(act, { id: "m4-where", fresh: true, q: "The heat pump and heat store save money in the winter week. In the summer week they save…", answer: "less",
            options: [{ value: "less", label: "much less" }, { value: "same", label: "about the same" }, { value: "more", label: "more" }],
            feedback: { less: "Summer heat demand is small (a 3 MW peak), so there is little heat to make.", same: "Heat demand falls in summer, and so does what heat coupling can save.", more: "Summer has spare wind, but little heat demand to use it on." },
            onPick: function () { pr.reveal(); if (go) go.click(); } });
          go = solveStep(act, api, "Solve the eight cases", function () { var L = []; D.weeks.forEach(function (w) { shown.forEach(function (c) { L.push([w.id, c.id]); }); }); return L; }, function () {
            tb.innerHTML = "";
            var rows = shown.filter(function (c) { return c.id !== "power"; }).map(function (c) { return [c.label].concat(D.weeks.map(function (w) { return fm.k(v(w.id, c.id)); })); });
            table(tb, ["Configuration: saving against separate systems", "Winter week", "Summer week"], rows, "The value of each step of coupling in two weeks");
            H("p", { class: "m4-note", text: "Separate systems: the plant with its battery, every kg trucked, all heat from the boiler. Each saving is a difference of optimal costs, the same for every best plan." }, tb);
            H("p", { class: "m4-note", text: RELAX }, tb);
            api.done(); remember("where", 1);
            api.saw("Heat adds " + fm.k(v("winter", "heat") - v("winter", "h2")) + " in winter, " + fm.k(v("summer", "heat") - v("summer", "h2")) + " in summer; waste heat adds " + fm.k(v("winter", "all") - v("winter", "heat")) + " and " + fm.k(v("summer", "all") - v("summer", "heat")) + ". **Coupling saves operating cost when conversion and storage connect cheap supply with useful demand, within the devices' limits.**");
          });
          tb = H("div", null, act);
        } },
      // 7 prices of coupled carriers
      { text: "Each balance row has a [[shadow-price|dual]]: that carrier's marginal value in that hour, under this model's assumptions. Pick an hour and see how one carrier's price sets another's.",
        build: function (act, api) {
          // prices are drawn only after a solve that worked; a failed solve keeps the chosen hour, and "Try again" solves
          // and then shows that hour, removing the note (LX.SolveStep; M4 review, finding 5)
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Hours to read" }, act), out = H("div", { "aria-live": "polite" }, act), seen = {}, st = LX.SolverStatus(act), bs = [], sel = null, pending = null;
          function show(i) {
            var hr = R.hours[i], x = res[keyOf("winter", "all")], p = x && x.ok ? prices(x.r, hr.t) : null; if (!p) return;
            out.innerHTML = ""; seen[i] = 1;
            bs.forEach(function (b, j) { b.setAttribute("aria-pressed", String(j === i)); });
            var k = H("div", { class: "m4-kpis" }, out);
            kpi(k, "Power", fm.p(p.power) + "/MWh"); kpi(k, "Hydrogen", fm.p(p.h2) + "/kg"); kpi(k, "Heat", fm.p(p.heat) + "/MWh");
            H("p", { class: "m4-note", html: LX.esc(hr.why) }, out);
            H("p", { class: "m4-note", text: RELAX + " Prices of the exact on/off model are not shown." }, out);
            if (Object.keys(seen).length >= 2) { api.done(); api.saw("When the heat pump is the unit that moves, heat is worth power's price ÷ 3; free power makes hydrogen and heat free. **Coupling ties the carriers' prices together.**"); }
          }
          var run = action({ api: api, st: st, host: act, go: null, job: function () { return all([["winter", "all"]]); },
            show: function () { st.set(res[keyOf("winter", "all")].r); if (sel != null) show(sel); } });
          R.hours.forEach(function (h, i) { bs.push(H("button", { type: "button", "aria-pressed": "false", text: h.label, onclick: function () { sel = i; if (!pending) pending = run().then(function () { pending = null; }); } }, seg)); });
          H("p", { class: "m4-note", text: "Hours offered are ones where each price is unique: raising or lowering that hour's demand a little changes the cost at the same rate. In some other hours several prices fit." }, act);
        } },
      // 8 formulate it
      { text: "You built a three-carrier LP: decisions every hour, one balance per carrier, levels that link the hours, and limits. The explain layer writes it out; the notebook rebuilds it.",
        free: true,
        build: function (act) { H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "The model, symbol by symbol" + LX.icon("arrow") }, act); LX.progress.done(SLUG); } }
    ];
    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "m4-steps", steps: steps, onStep: function (i) { if (i === 0) { try { LX.solver.preload(); } catch (e) { /* the first solve loads it */ } } } });
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 6 : m ? +m[1] : 0;
      if (!n) return null;
      cards.go(Math.min(steps.length, n) - 1);
      var act = cardsHost.querySelector(".lx-step-act");
      if (n === 6) { var c = act && act.querySelectorAll(".lx-choice"); if (c && c[0]) c[0].click(); }
      else if (n === 7) { var b = act && act.querySelectorAll(".lx-seg button"); if (b && b[0]) { b[0].click(); setTimeout(function () { if (b[1]) b[1].click(); }, 400); } }
      else { var g = act && act.querySelector(".m4-row .lx-btn"); if (g) g.click(); }
      return { view: state };
    }, cards);
    root.lxLesson = { model: model, Wk: Wk, res: res, cards: cards };
    explain(D, Wk, data.cf_targets);
  });

  // ---------------------------------------------------------------- explain layer: annotated diagram, equation card, table
  function explain(D, Wk, CFT) {
    var x = document.getElementById("m4-explain"); if (!x) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var R = D.reference, F = R.flows, CF = CFT.targets.wind, CFsrc = CFT.source;   // the 33.8% benchmark with its source (M4 review, finding 10)
    LX.ConceptMap(H("div", { class: "lx-xcard" }, x), {
      title: "The plant, annotated", lede: "Winter week, all devices available; LP relaxation (the electrolyzer may run below its 15% minimum), one best plan. Tap a part: what it does and what flowed through it.",
      groups: { p: ["Power", "var(--lx-wind)"], h: ["Hydrogen", "var(--lx-good)"], q: ["Heat", "var(--lx-pk)"] },
      nodes: [
        { id: "wind", g: "p", label: "Wind", text: "100 MW; real SPP shape, scaled to " + (CF.cf * 100).toFixed(1) + "%, EIA's " + CF.year + " capacity factor of the U.S. utility-scale wind fleet (" + CFsrc.short + ", accessed " + new Date(CFsrc.accessed + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) + "). This week: " + fm.mwh(F.wind) + ".", at: [1, 0] },
        { id: "grid", g: "p", label: "Grid", text: "50 MW each way. Sold " + fm.mwh(F.exp) + ", bought " + fm.mwh(F.imp) + " at the town's price.", at: [0, 0] },
        { id: "bat", g: "p", label: "Battery", text: "20 MW, 80 MWh. State of charge links the hours; round trip 0.8259 (DOE).", at: [2, 0] },
        { id: "ez", g: "h", label: "Electrolyzer", text: "20 MW, alkaline; 57 kWh per kg (illustrative); " + fm.t(F.kg) + " made this week.", at: [0, 1] },
        { id: "tank", g: "h", label: "Tank", text: "Kept between 400 and 4,000 kg; " + fm.t(F.tr) + " trucked in.", at: [0, 2] },
        { id: "hp", g: "q", label: "Heat pump", text: "5 MW; 3 MWh of heat per MWh; " + fm.mwh(F.hp) + " of heat.", at: [2, 1] },
        { id: "store", g: "q", label: "Heat store", text: "60 MWh; loses 2% a day; the network takes at most 12 MW.", at: [2, 2] },
        { id: "town", g: "q", label: "Town's heat", text: "Boiler " + fm.mwh(F.boil) + "; waste heat " + fm.mwh(F.rec) + ".", at: [1, 2] }
      ],
      edges: [["wind", "grid", "sell"], ["wind", "bat", "shift"], ["wind", "ez", "power"], ["ez", "tank", "kg"], ["wind", "hp", "power"], ["hp", "store", "heat"], ["store", "town", "≤ 12 MW"], ["ez", "town", "waste heat"]],
      cols: 3, rows: 3, colsN: 2, rowsN: 4, atN: { wind: [0, 0], grid: [1, 0], ez: [0, 1], bat: [1, 1], tank: [0, 2], hp: [1, 2], store: [0, 3], town: [1, 3] }, sel: "wind", gameLabel: "In this lesson"
    });
    var sym = LX.EquationCard.sym;
    LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "The coupled LP, symbol by symbol", lede: "Tap a symbol: what it means, its unit and its value in this lesson.", dense: true, label: "The plant's linear program; each symbol is a button",
      fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
      // every symbol is a button, in the notation of the code, the algebra and the notebook (M4 review, finding 6)
      rows: [
        { html: "min Σ<sub><var>t</var></sub> " + sym("p", "<var>p</var><sub><var>t</var></sub>") + " (" + sym("imp", "<var>imp</var>") + " − " + sym("exp", "<var>exp</var>") + ") + 2.50 " + sym("tr", "<var>tr</var>") + " + 15 " + sym("boil", "<var>boil</var>"), tag: "goal: the week's cost", say: "Minimise the week's cost: grid purchases minus sales at the hourly price p, plus trucked hydrogen and boiler heat." },
        { html: "<var>exp</var> + " + sym("bc", "<var>bc</var>") + " + " + sym("ez", "<var>ez</var>") + " + " + sym("hp", "<var>hp</var>") + " + " + sym("cur", "<var>cur</var>") + " − <var>imp</var> − " + sym("bd", "<var>bd</var>") + " = " + sym("w", "<var>w</var><sub><var>t</var></sub>"), tag: "power", say: "Every MWh of wind is sold, stored, turned into hydrogen or heat, or curtailed; power bought adds to it." },
        { html: sym("k", "<var>k</var>") + " <var>ez</var> + <var>tr</var> + " + sym("L", "<var>L</var><sub><var>t</var>−1</sub>") + " − <var>L</var><sub><var>t</var></sub> = 150", tag: "hydrogen", say: "Hydrogen made plus trucked plus the tank's drop meets the plant's 150 kilograms an hour." },
        { html: sym("cop", "<var>COP</var>") + " <var>hp</var> + " + sym("rec", "<var>rec</var>") + " − " + sym("hin", "<var>hin</var>") + " + " + sym("hout", "<var>hout</var>") + " + <var>boil</var> = " + sym("H", "<var>H</var><sub><var>t</var></sub>"), tag: "heat", say: "Heat from the pump, waste heat, the store and the boiler meets the town's heat." },
        { html: "<var>COP</var> <var>hp</var> + <var>rec</var> − <var>hin</var> + <var>hout</var> ≤ 12", tag: "network", say: "What passes through the heat network is at most 12 megawatts of heat." },
        { html: sym("s", "<var>s</var><sub><var>t</var></sub>") + " = <var>s</var><sub><var>t</var>−1</sub> + " + sym("eta", "<var>η</var>") + " <var>bc</var> − <var>bd</var>, &nbsp; " + sym("Q", "<var>Q</var><sub><var>t</var></sub>") + " = (1 − " + sym("lam", "<var>λ</var>") + ") <var>Q</var><sub><var>t</var>−1</sub> + <var>hin</var> − <var>hout</var>", tag: "levels", say: "The battery's and the heat store's levels carry each hour into the next; every level ends the week where it starts." },
        { html: "400 ≤ <var>L</var> ≤ 4,000, &nbsp; <var>rec</var> ≤ 0.2 <var>ez</var>, &nbsp; 0 ≤ <var>ez</var> ≤ 20", tag: "limits", say: "The tank stays between 400 and 4,000 kilograms; recovered heat is at most a fifth of the electrolyzer's power; the electrolyzer runs between 0 and 20 megawatts (the LP relaxation; 3 to 20 when it must stay on)." }
      ],
      symbols: {
        p: { name: "p_t", label: "p t, the grid price", unit: "$/MWh", words: "Prairie Town's cost of one more MWh in hour t (lesson 8): $0, $40 or $100.", you: "Winter week: " + R.priceHours.zero + " hours at $0, " + R.priceHours.cc + " at $40, " + R.priceHours.pk + " at $100.", code: "W.price[t]" },
        exp: { name: "exp_t", label: "exp t, power sold", unit: "MW", words: "Power sold to the grid in hour t, through the 50 MW connection.", you: fm.mwh(R.flows.exp) + " this winter week (one best plan).", code: '"exp" + t' },
        imp: { name: "imp_t", label: "imp t, power bought", unit: "MW", words: "Power bought from the grid in hour t, at most 50 MW.", you: fm.mwh(R.flows.imp) + " this winter week (one best plan).", code: '"imp" + t' },
        cur: { name: "cur_t", label: "cur t, wind curtailed", unit: "MW", words: "Wind the plant lets go in hour t.", you: "At most the hour's wind.", code: '"cur" + t' },
        bc: { name: "bc_t", label: "b c t, battery charging", unit: "MW", words: "Power into the battery in hour t, at most 20 MW.", you: "Multiplied by η on the way in.", code: '"bc" + t' },
        bd: { name: "bd_t", label: "b d t, battery discharging", unit: "MW", words: "Power out of the battery in hour t, at most 20 MW.", you: "It lowers the state of charge one for one.", code: '"bd" + t' },
        hp: { name: "hp_t", label: "h p t, heat pump power", unit: "MW", words: "Power into the heat pump in hour t, at most 5 MW.", you: "It gives COP × hp of heat.", code: '"hp" + t' },
        w: { name: "w_t", label: "w t, the plant's wind", unit: "MW", words: "The 100 MW plant's output in hour t, from SPP's real 2025 shape (EIA-930).", you: fm.mwh(R.flows.wind) + " this winter week.", code: "W.wind[t]" },
        rec: { name: "rec_t", label: "rec t, heat recovered", unit: "MW of heat", words: "Low-temperature heat taken from the electrolyzer, at most 20% of its power (illustrative).", you: fm.mwh(R.flows.rec) + " this winter week.", code: '"rec" + t' },
        hin: { name: "hin_t", label: "h in t, heat store charging", unit: "MW of heat", words: "Heat put into the heat store in hour t.", you: "It raises Q one for one.", code: '"hin" + t' },
        hout: { name: "hout_t", label: "h out t, heat store discharging", unit: "MW of heat", words: "Heat taken from the heat store in hour t.", you: "It lowers Q one for one.", code: '"hout" + t' },
        s: { name: "s_t", label: "s t, the battery's state of charge", unit: "MWh", words: "Energy in the battery at the end of hour t, at most 80 MWh.", you: "Hour 0 starts from hour 167's level.", code: '"s" + t' },
        Q: { name: "Q_t", label: "Q t, heat in the store", unit: "MWh of heat", words: "Heat in the store at the end of hour t, at most 60 MWh.", you: "Hour 0 starts from hour 167's level.", code: '"Q" + t' },
        eta: { name: "η", label: "eta, the battery's round trip", unit: "share", words: "Of each MWh charged, " + D.battery.eta + " MWh can come back (DOE's 82.59%, about 83%).", you: "Taken on charging: s rises by η × bc.", code: "D.battery.eta" },
        lam: { name: "λ", label: "lambda, the heat store's hourly loss", unit: "share per hour", words: "1 − 0.98^(1/24), about 0.084% an hour: 2% a day.", you: "Q keeps (1 − λ) of last hour's heat.", code: "1 - Math.pow(0.98, 1 / 24)" },
        tr: { name: "tr_t", label: "tr t, hydrogen trucked in", unit: "kg", words: "The fallback supply: hydrogen from a gas reformer at an illustrative $2.50 per kg.", you: fm.t(R.flows.tr) + " this winter week, all devices available.", code: '"tr" + t' },
        boil: { name: "boil_t", label: "boil t, boiler heat", unit: "MWh of heat", words: "The town's gas boiler, at an illustrative $15 per MWh of heat.", you: fm.mwh(R.flows.boil) + " this winter week.", code: '"boil" + t' },
        ez: { name: "ez_t", label: "ez t, electrolyzer power", unit: "MW", words: "Power into the electrolyzer; it links the power and hydrogen balances.", you: "Up to 20 MW.", code: '"ez" + t' },
        k: { name: "k = 1000/57", label: "k, kilograms per MWh", unit: "kg/MWh", words: "1,000 kWh ÷ 57 kWh per kg, about 17.54: DOE Record 24005's PEM figure, illustrative for this alkaline unit (IRENA's alkaline systems: 50–78).", you: "This conversion makes a kg's price track power's: × 0.057 MWh.", code: "1000 / E.kWhPerKg" },
        L: { name: "L_t", label: "L t, hydrogen in the tank", unit: "kg", words: "The tank's level at the end of hour t; the week ends where it starts.", you: "Between 400 and 4,000 kg.", code: '"L" + t' },
        cop: { name: "COP = 3", label: "COP, the heat pump's coefficient of performance", unit: "MWh of heat per MWh", words: "Heat pumps give up to three times more heat than the energy they use (DOE).", you: "Heat's price is power's ÷ 3 when the pump sets it.", code: "D.heat.cop" },
        H: { name: "H_t", label: "H t, the town's heat demand", unit: "MW of heat", words: "Shaped like the town's demand, scaled to a 15 MW winter peak (illustrative).", you: fm.mwh(Wk.winter.heatMWh) + " this winter week.", code: "W.heat[t]" }
      }
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Where coupling earns value", lede: "Saving against separate systems (the plant with its battery, hydrogen trucked, heat from the boiler), per week. LP relaxation: the electrolyzer may run below its 15% minimum.",
      columns: [{ key: "name", label: "Configuration", main: true }, { key: "win", label: "Winter week", phone: "Winter", num: true }, { key: "sum", label: "Summer week", phone: "Summer", num: true }],
      rows: D.configs.filter(function (c) { return c.id !== "power" && !c.hidden; }).map(function (c) { var v = R.value[c.id]; return { key: c.id, color: "var(--lx-good)", name: c.label, win: { text: fm.k(v.winter), value: v.winter }, sum: { text: fm.k(v.summer), value: v.summer } }; }),
      sorts: [{ label: "As added", order: ["h2", "heat", "all"], note: "Each row adds a device to the row above." },
              { label: "By winter saving", order: ["h2", "heat", "all"].sort(function (a, b) { return R.value[b].winter - R.value[a].winter; }), ranked: true, note: "Heat coupling earns in winter; in summer there is little heat to make." }]
    });
  }
})();
