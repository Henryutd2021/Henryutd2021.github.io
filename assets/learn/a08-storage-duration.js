// a08-storage-duration.js — Analyst lesson A8, "How long should storage last? From batteries to seasonal stores"
// (step cards with a linear program), wave W3, 2026-11-03.
//
// Data: assets/learn/data/a08-storage-duration.json (the Plains Grid fleet, the week, four stores with their sources, the
// duration ladder, 2021 installed costs from DOE's 2022 storage assessment, numbers to remember, and a reference block
// written by the test), town_year.json (SPP 2025 hourly shapes, EIA-930) and cf_targets.json (EIA capacity factors).
//
// The engine (pure, no DOM; exported for Node). It is lesson-local and kept small so that it can later be served by the
// shared single-site engine E0 (SB0): inputs -> LP -> results.
//   prepare(D, year, targets, profile) -> W   the week: demand, wind, solar and firm output, hour by hour (168 hours)
//   build(W, store, opts) -> LP                one store dispatched through the week (LX.solver model format)
//   read(W, store, r) -> result                unserved energy, the share of the shortfall covered, the store's schedule
// The week: 2-8 January 2025 by local date (Central standard time, UTC-6), read from town_year.json as lesson 9 reads its
// day. Demand = shape x 4,000 MW (the Plains Grid of lesson 3); wind and solar = LX.townProfile (method "scale", monthly
// capacity factors from EIA, then the 2025 annual ones) for 5,000 MW and 2,000 MW; firm (gas) output up to 1,000 MW in
// every hour. All rounded to whole MW. Gap_t = demand - wind - solar; the shortfall without storage = max(0, gap - firm).
// The LP for one store (power P MW, energy E MWh, round trip eta with the whole loss on charging, standing loss lambda per
// hour from the loss per day): for every hour t,
//   firm_t + unserved_t - spill_t - charge_t + discharge_t = gap_t                      (balance)
//   level_t = (1 - lambda) level_{t-1} + eta charge_t - discharge_t, level_{-1} = E     (the store starts the week full)
//   0 <= firm_t <= 1,000; 0 <= spill_t <= wind_t + solar_t; 0 <= charge_t, discharge_t <= P; 0 <= level_t <= E
// Goal: least unserved energy. Tie rule, stated in advance: an unserved MWh costs $10,000 plus $0.01 for each hour it is
// earlier than the end of the week (shortfalls are pushed late), and a discharged MWh $0.001 (firm output is used before
// the store). Neither changes the least unserved energy, which is the only number the page reads from the LP; the store's
// schedule drawn on the page is one of the best schedules, named as such. The test proves both points.
// Every number on the page is checked by _tests/learn/test_a08-storage-duration.js.
(function () {
  "use strict";
  var DAY = 24;

  // ---------------------------------------------------------------- pure model
  function weekStart(year, wk) {
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(wk.date + "T00:00:00Z");
    return Math.round((d0 - t0) / 3600000) + 1 - wk.utcOffsetHours;
  }
  function prepare(D, year, targets, profile) {
    var G = D.plains, wk = D.week, T = wk.days * DAY, i0 = weekStart(year, wk);
    if (i0 < 0 || i0 + T > year.demand.length) throw new Error("a08: the week is outside the year file");
    var po = { year: year, targets: targets, method: G.profileMethod, monthlyCF: G.monthlyCF };
    var pw = profile("wind", G.windMW, po), ps = profile("solar", G.solarMW, po);
    var W = { T: T, i0: i0, firm: G.firmMW, label: wk.label, date: wk.date, demand: [], wind: [], solar: [], gap: [], short0: [], windCF: 0, solarCF: 0 };
    for (var t = 0; t < T; t++) {
      var d = Math.round(year.demand[i0 + t] / 1000 * G.demandPeakMW), w = Math.round(pw.mw[i0 + t]), s = Math.round(ps.mw[i0 + t]);
      W.demand.push(d); W.wind.push(w); W.solar.push(s); W.gap.push(d - w - s); W.short0.push(Math.max(0, d - w - s - G.firmMW));
      W.windCF += w / G.windMW / T; W.solarCF += s / G.solarMW / T;
    }
    W.shortSum = sum(W.short0); W.peakGap = Math.max.apply(null, W.short0); W.shortHours = W.short0.filter(function (x) { return x > 0; }).length;
    W.surplus = sum(W.gap.map(function (g) { return Math.max(0, -g); }));
    W.daily = []; for (var k = 0; k < wk.days; k++) W.daily.push({ wind: avg(W.wind.slice(k * DAY, (k + 1) * DAY)) / G.windMW, short: sum(W.short0.slice(k * DAY, (k + 1) * DAY)) });
    return W;
  }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function avg(a) { return sum(a) / a.length; }
  function store(D, id, patch) { var s = D.techs.filter(function (x) { return x.id === id; })[0], o = {}; for (var k in s) o[k] = s[k]; for (var q in patch || {}) o[q] = patch[q]; o.E = o.P * o.hours; return o; }
  function lossPerHour(s) { return 1 - Math.pow(1 - (s.lossPerDay || 0), 1 / DAY); }
  // o: {tie: false} drops the tie rule (for the test's proofs); {latestFree: n} forces hours 0..n-1 fully served
  function build(W, s, o) {
    o = o || {}; var G = o.plains || {}, V = G.voll || 10000, tau = o.tie === false ? 0 : (G.tieStep != null ? G.tieStep : 0.01), wear = o.tie === false ? 0 : (G.wear != null ? G.wear : 0.001);
    var lam = lossPerHour(s), vars = [], cons = [], T = W.T;
    for (var t = 0; t < T; t++) {
      vars.push({ name: "g" + t, ub: W.firm }, { name: "u" + t, cost: V + tau * (T - t), ub: o.latestFree != null && t < o.latestFree ? 0 : Infinity },
        { name: "sp" + t, ub: Math.max(0, W.wind[t] + W.solar[t]) }, { name: "c" + t, ub: s.P }, { name: "d" + t, ub: s.P, cost: wear }, { name: "e" + t, ub: s.E });
      var b = {}; b["g" + t] = 1; b["u" + t] = 1; b["sp" + t] = -1; b["c" + t] = -1; b["d" + t] = 1;
      cons.push({ name: "bal" + t, terms: b, eq: W.gap[t] });
      var l = {}; l["e" + t] = 1; l["c" + t] = -s.eta; l["d" + t] = 1; if (t) l["e" + (t - 1)] = -(1 - lam);
      cons.push({ name: "lev" + t, terms: l, eq: t ? 0 : (1 - lam) * s.E });
    }
    if (o.capUnserved != null) { var cu = {}; for (var k = 0; k < T; k++) cu["u" + k] = 1; cons.push({ name: "ucap", terms: cu, le: o.capUnserved }); }
    return { sense: "min", variables: vars, constraints: cons };
  }
  function read(W, s, r) {
    if (!r || !r.values) return { ok: false, status: r ? r.status : "error" };
    var v = function (k) { var x = r.values[k]; return Math.abs(x) < 1e-7 ? 0 : x; }, o = { ok: !!r.ok, status: r.status, unserved: 0, level: [s.E], ch: [], dis: [], firm: [] };
    for (var t = 0; t < W.T; t++) { o.unserved += v("u" + t); o.level.push(v("e" + t)); o.ch.push(v("c" + t)); o.dis.push(v("d" + t)); o.firm.push(v("g" + t)); }
    o.covered = W.shortSum > 0 ? 1 - o.unserved / W.shortSum : 1;
    return o;
  }
  // the shortfall no store of power P can remove: hours when the gap exceeds firm output plus P
  function powerFloor(W, P) { return sum(W.short0.map(function (x) { return Math.max(0, x - P); })); }
  // 1 MWh put in, held idle for `days`, comes back as this many MWh (loss on charging, then standing losses)
  function idle(s, days) { return s.eta * Math.pow(1 - (s.lossPerDay || 0), days); }
  // ---------------------------------------------------------------- costs (closed form)
  function crf(r, n) { return r / (1 - Math.pow(1 + r, -n)); }
  function maxCycles(it, perDay) { return Math.min(365 * (perDay || 1), Math.floor(8760 / (it.hours * (1 + 1 / it.eta)))); }
  // $ per MWh delivered: yearly capital (capital recovery x installed cost) over the MWh delivered a year, plus the energy
  // bought to charge (price / round trip). cycles above the store's limit are capped (capped: true)
  function perMWh(it, cycles, price, rate, perDay) {
    var n = Math.min(cycles, maxCycles(it, perDay)), yearly = crf(rate, it.life) * it.perKW * 1000, mwh = n * it.hours;
    return { cycles: n, capped: n < cycles, capital: yearly / mwh, charging: price / it.eta, total: yearly / mwh + price / it.eta, yearly: yearly };
  }
  var fm = {
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    mw: function (v) { return Math.round(v).toLocaleString("en-US") + " MW"; },
    pct: function (x) { return Math.round(x * 100) + "%"; },
    usd: function (v) { return "$" + Math.round(v).toLocaleString("en-US"); },
    hm: function (t) { return (t % DAY < 10 ? "0" : "") + (t % DAY) + ":00"; }
  };
  var model = { DAY: DAY, weekStart: weekStart, prepare: prepare, store: store, lossPerHour: lossPerHour, build: build, read: read, powerFloor: powerFloor,
                idle: idle, crf: crf, maxCycles: maxCycles, perMWh: perMWh, sum: sum, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "a08-storage-duration", KEY = "a8-own";
  function css() {
    if (document.getElementById("a8-css")) return;
    H("style", { id: "a8-css", text: [
      ".a8-lab .lx-stepcard{grid-template-columns:minmax(0,1fr)}.a8-lab .lx-step-act{grid-template-columns:minmax(0,1fr)}.a8-lab .lx-stepcard>*,.a8-lab .lx-step-act>*{min-width:0}",
      ".a8-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".a8-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".a8-kpi{display:grid;padding:7px 11px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:104px}",
      ".a8-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display)}.a8-kpi b{font-family:var(--lx-f-mono);font-size:16px;font-weight:600}",
      ".a8-kpi.bad b{color:var(--lx-bad)}.a8-kpi.good b{color:var(--lx-good)}",
      ".a8-tbl{overflow-x:auto;max-width:100%}.a8-tbl table{width:100%;border-collapse:collapse;font-size:14px}",
      ".a8-tbl th,.a8-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:right;font-weight:400}",
      ".a8-tbl th:first-child,.a8-tbl td:first-child{text-align:left}",
      ".a8-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3);vertical-align:bottom}",
      ".a8-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.a8-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".a8-tbl td i{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--c);margin-right:6px}",
      ".a8-bars{margin:0;padding:0;list-style:none;display:grid;gap:7px}",
      ".a8-bars li{display:grid;grid-template-columns:minmax(6.5em,9em) minmax(0,1fr) 5.5em;gap:8px;align-items:center;font-size:14px}",
      ".a8-bars .bar{height:14px;border-radius:6px;background:var(--lx-surface-3);overflow:hidden;display:flex}",
      ".a8-bars .bar i{display:block;height:100%}.a8-bars b{font-family:var(--lx-f-mono);font-weight:600;text-align:right}",
      ".a8-note{font-size:13.5px;color:var(--lx-ink-3);margin:0}",
      ".a8-fail{display:grid;gap:8px;justify-items:start;padding:10px 12px;border:1px solid var(--lx-bad);border-radius:10px;background:var(--lx-surface-2)}.a8-fail p{margin:0;font-size:14.5px}",
      "@media (max-width:560px){.a8-tbl table{font-size:12.5px}.a8-tbl th,.a8-tbl td{padding:4px 3px}.a8-tbl .ph{display:none}.a8-bars li{grid-template-columns:minmax(5.5em,7em) minmax(0,1fr) 5em;font-size:13px}}"
    ].join("\n") }, document.head);
  }
  function kpi(host, label, value, tone) { var k = H("div", { class: "a8-kpi" + (tone ? " " + tone : "") }, host); H("small", { text: label }, k); H("b", { text: value }, k); return k; }
  function table(host, head, rows, label) {
    var w = H("div", { class: "a8-tbl", tabindex: "0", role: "region", "aria-label": label }, host), t = H("table", null, w), hr = H("tr", null, H("thead", null, t));
    var ph = head.map(function (x) { return x.charAt(0) === "~"; });
    head.forEach(function (x, i) { H("th", { scope: "col", class: ph[i] ? "ph" : "", text: x.replace(/^~/, "") }, hr); });
    var b = H("tbody", null, t);
    rows.forEach(function (r) { var tr = H("tr", null, b); r.forEach(function (c, i) { var td = H("td", { class: ph[i] ? "ph" : "" }, tr); if (c && c.html != null) td.innerHTML = c.html; else td.textContent = c; }); });
    return w;
  }
  function dayTicks(W, narrow) {
    var out = []; for (var k = 0; k <= W.T / DAY; k++) { if (narrow && k % 2) continue; var d = new Date(Date.parse(W.date + "T00:00:00Z") + k * 864e5); out.push([k * DAY, d.getUTCDate() + " Jan"]); }
    return out;
  }

  LX.mount(SLUG, function (live, data, root) {
    css(); root.classList.add("a8-lab");
    var D = data.a08_storage_duration, W = prepare(D, data.town_year, data.cf_targets, LX.townProfile), G = D.plains;
    var own = LX.store.get(KEY, {}) || {}; function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var res = {};   // solved results by key (store id, or "h2-<MW>")
    function solveStore(key, s) {
      if (res[key] && res[key].ok) return Promise.resolve(res[key]);
      return LX.solver.solve(build(W, s, { plains: G }), { timeLimit: 10, key: "a8-" + key, label: "a8" }).then(function (r) {
        var o = r.ok ? read(W, s, r) : { ok: false, status: r.status, message: r.message, r: r }; o.r = r; o.store = s; res[key] = o; return o;
      });
    }
    // solves that fail (W2 review): a message, "Try again", the busy state cleared, results kept
    function failNote(host, r, again) {
      var why = r.status === "time-limit" ? "The solver stopped at its time limit before it finished." : r.status === "cancelled" || r.status === "superseded" ? "The run was stopped before it finished."
        : ((LX.solver.describe ? LX.solver.describe(r) : "") || "The solver did not finish.") + (r.message && r.status === "error" ? " (" + r.message + ")" : "");
      var box = H("div", { class: "a8-fail", role: "alert" }, host);
      H("p", { html: "<b>No result to show.</b> " + LX.esc(why) + " Results already solved are kept." }, box);
      H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Try again", onclick: function () { again(); } }, box);
      return box;
    }
    function action(o) {
      var note = null;
      function attempt() {
        if (note) { note.remove(); note = null; }
        if (o.go) o.go.disabled = true; o.st.set(LX.solver.mode ? "solving" : "loading"); o.api.busy(true);
        return Promise.resolve().then(o.job).then(function (bad) {
          o.api.busy(false); if (o.go) o.go.disabled = false;
          if (bad) { o.st.set(""); note = failNote(o.host, bad.r || bad, attempt); return; }
          o.show();
        }).catch(function (e) { o.api.busy(false); if (o.go) o.go.disabled = false; o.st.set(""); note = failNote(o.host, { status: "error", message: String(e && e.message || e) }, attempt); });
      }
      return attempt;
    }
    function weekPlot(host, sol, label) {
      var P = LX.Plot(host, { box: true, text: "Text version of the week" }), narrow = (host.clientWidth || 600) < 480;
      var supply = W.wind.map(function (w, t) { return w + W.solar[t] + W.firm; });
      var lines = [{ values: W.demand, x0: 0.5, color: "var(--lx-ink)", width: 2.2 }, { values: supply, x0: 0.5, color: "var(--lx-wind)", area: 0.12 }];
      var legend = [{ label: "Demand", color: "var(--lx-ink)" }, { label: "Wind + sun + firm", color: "var(--lx-wind)" }];
      if (sol) { lines.push({ values: supply.map(function (x, t) { return x + sol.dis[t] - sol.ch[t]; }), x0: 0.5, color: sol.store.color, dash: "5 3", width: 2 }); legend.push({ label: "With " + sol.store.short.toLowerCase() + " (one best schedule)", color: sol.store.color, dash: "5 3" }); }
      P.render({ x: { min: 0, max: W.T, ticks: dayTicks(W, false), ticksN: dayTicks(W, true) }, y: { min: 0, max: 5000, step: 1000, fmt: function (v) { return v.toLocaleString("en-US"); }, unit: "MW" },
        lines: lines, legend: legend, aria: label,
        text: { head: ["Day", "Wind (share of " + fm.mw(G.windMW) + ")", "Shortfall without storage, MWh"], rows: W.daily.map(function (d, k) { return [dayTicks(W, false)[k][1], fm.pct(d.wind), Math.round(d.short).toLocaleString("en-US")]; }) } });
      return P;
    }
    var TECHS = D.techs.map(function (t) { return store(D, t.id); });

    var steps = [
      // 1 duration
      { text: "A store has two ratings: power (MW), how fast it charges or discharges, and energy (MWh), how much it holds. A store of 1,000 MW and 10,000 MWh runs flat out for how long?",
        build: function (act, api) {
          var pr = LX.Predict(act, { id: "a8-dur", fresh: true, q: "", title: false, answer: "b",
            options: [{ value: "a", label: "1 hour" }, { value: "b", label: "10 hours" }, { value: "c", label: "10,000 hours" }],
            feedback: { b: "10,000 MWh ÷ 1,000 MW = 10 hours: its [[battery-duration|duration]].", a: "That would need 10,000 MW. 10,000 MWh ÷ 1,000 MW = 10 hours.", c: "Only at 1 MW. At 1,000 MW: 10,000 ÷ 1,000 = 10 hours." },
            onPick: function () { pr.reveal("Duration = energy ÷ power. It says how long a store can keep giving full power."); api.done(); } });
        } },
      // 2 the ladder
      { text: "Stores sit on a ladder of durations, from seconds to seasons. Place six of them on DOE's ladder, then check.",
        build: function (act, api) {
          LX.CardSort(act, { bins: D.ladder.bins, cards: D.ladder.cards, onCheck: function (g) {
            if (g.placed < g.total) return; api.done(); remember("ladder", g.right);
            api.saw(g.right + " of " + g.total + " as DOE places them. [[long-duration-storage|Long-duration storage]] starts at about 10 hours; the ranges overlap.");
          } });
          H("p", { class: "a8-note", html: "Ladder: " + LX.esc(D.ladder.source.label) + "." }, act);
        } },
      // 3 operating limits: what comes back after an idle spell
      { text: "Each store has its own limits. Put 1 MWh into each, leave it idle, and see what comes back after a few days.",
        build: function (act, api) {
          var out = H("ul", { class: "a8-bars", "aria-live": "polite" }, act), moved = 0;
          var lim = H("ul", { class: "a8-note", style: "padding-left:1.1rem;display:grid;gap:2px" }, act);
          TECHS.forEach(function (s) { H("li", { html: "<b>" + LX.esc(s.short) + ":</b> " + LX.esc(s.limit) }, lim); });
          function draw(days) {
            out.innerHTML = "";
            TECHS.forEach(function (s) { var back = idle(s, days), li = H("li", null, out); H("span", { text: s.short }, li); var b = H("span", { class: "bar", role: "img", "aria-label": s.short + ": " + back.toFixed(2) + " MWh back" }, li); H("i", { style: "width:" + (back * 100).toFixed(1) + "%;background:" + s.color }, b); H("b", { text: back.toFixed(2) + " MWh" }, li); });
          }
          LX.Slider(act, { label: "Days idle", min: 0, max: 30, step: 1, value: 0, fmt: function (v) { return v + (v === 1 ? " day" : " days"); },
            onChange: function (v) { draw(v); moved++; if (v >= 7) { api.done(); var th = store(D, "thermal"); api.saw("After " + v + " days the heat store returns " + idle(th, v).toFixed(2) + " MWh, down from " + th.eta.toFixed(2) + ": it loses " + fm.pct(th.lossPerDay) + " a day. Hydrogen loses most on conversion, " + fm.pct(1 - store(D, "hydrogen").eta) + ", but little while it waits."); } } });
          draw(0);
        } },
      // 4 the week
      { text: "Now a hard week on the Plains Grid: " + W.label + ", real shapes scaled to an illustrative fleet with little firm power. Which days are short?",
        build: function (act, api) {
          var k = H("div", { class: "a8-kpis" }, act);
          kpi(k, "Shortfall, no storage", fm.mwh(W.shortSum), "bad"); kpi(k, "Hours short", String(W.shortHours)); kpi(k, "Largest gap", fm.mw(W.peakGap));
          weekPlot(act, null, "The week: demand against wind, sun and firm output");
          var pr = LX.Predict(act, { id: "a8-week", fresh: true, q: "Where does most of the shortfall fall?", answer: "late",
            options: [{ value: "early", label: "The first two days" }, { value: "late", label: "The last three days" }, { value: "even", label: "Spread evenly" }],
            feedback: { late: "On 6 and 7 January wind gives " + fm.pct(W.daily[4].wind) + " and " + fm.pct(W.daily[5].wind) + " of its size, against " + fm.pct(W.windCF) + " over the week.", early: "The first days have short gaps only; the long one comes after the windy weekend.", even: "Days 3 and 4 are windy and spill wind; the shortfall bunches at the end." },
            onPick: function () { pr.reveal(); api.done(); api.saw("The last three days hold " + fm.mwh(sum(W.daily.slice(4).map(function (d) { return d.short; }))) + " of the " + fm.mwh(W.shortSum) + " shortfall. Firm output covers only " + fm.mw(W.firm) + "."); } });
        } },
      // 5 run each store
      { text: "Give the grid one store of 1,000 MW, full at the start. A [[solver|solver]] runs it through the week to leave as little demand unserved as it can. Run at least three.",
        build: function (act, api) {
          var row = H("div", { class: "a8-row" }, act), st = LX.SolverStatus(act), tb = H("div", { "aria-live": "polite" }, act), plotHost = H("div", null, act), shown = null;
          function show() {
            tb.innerHTML = "";
            var done = TECHS.filter(function (s) { return res[s.id] && res[s.id].ok; });
            table(tb, ["Store", "~Energy held", "Unserved left", "Shortfall covered"], done.map(function (s) { var o = res[s.id]; return [{ html: "<i style='--c:" + s.color + "'></i>" + LX.esc(s.short) + " · " + s.hours + " h" }, fm.mwh(s.E), fm.mwh(o.unserved), fm.pct(o.covered)]; }), "Each store in the week: unserved energy left and the share of the shortfall covered");
            H("p", { class: "a8-note", text: "Without storage: " + fm.mwh(W.shortSum) + " unserved. Unserved energy is the same for every best schedule; the dashed line is one of them." }, tb);
            if (shown) { plotHost.innerHTML = ""; weekPlot(plotHost, res[shown], "The week with the " + res[shown].store.short.toLowerCase()); }
            if (done.length >= 3) { api.done(); var b = res.battery, h = res.hydrogen; api.saw(done.length + " stores run." + (b && h ? " The 4-hour battery covers " + fm.pct(b.covered) + " of the shortfall, the week-long hydrogen store " + fm.pct(h.covered) + "." : "")); }
          }
          TECHS.forEach(function (s) {
            var go = H("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: s.short + " · " + s.hours + " h" }, row);
            go.addEventListener("click", action({ api: api, st: st, host: act, go: go, job: function () { return solveStore(s.id, s).then(function (o) { return o.ok ? null : o; }); },
              show: function () { go.setAttribute("aria-pressed", "true"); shown = s.id; st.set(res[s.id].r); remember(s.id, res[s.id].unserved); show(); } }));
          });
          show();
        } },
      // 6 power still matters
      { text: function () { return "The hydrogen store holds " + fm.mwh(store(D, "hydrogen").E) + ", far more than the week's shortfall. Why does some remain? Change its power and solve again."; },
        build: function (act, api) {
          var st = LX.SolverStatus(act), out = H("div", { class: "a8-kpis", "aria-live": "polite" }, act), P = 1000, run;
          var go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve" }, H("div", { class: "a8-row" }, act));
          LX.Slider(act, { label: "Hydrogen store's power (fuel cell)", min: 500, max: 2000, step: 100, value: P, fmt: function (v) { return v.toLocaleString("en-US") + " MW"; }, onChange: function (v) { P = v; } });
          function show() {
            var o = res["h2-" + P]; out.innerHTML = "";
            kpi(out, "Power", fm.mw(P)); kpi(out, "Unserved left", fm.mwh(o.unserved), o.unserved > 0.5 ? "bad" : "good"); kpi(out, "Hours when the gap tops firm + power", String(W.short0.filter(function (x) { return x > P; }).length));
            api.done(); remember("h2P", P);
            api.saw(o.unserved > 0.5 ? "At " + fm.mw(P) + " the store still leaves " + fm.mwh(o.unserved) + ": exactly the MWh by which the gap tops firm output plus " + fm.mw(P) + " in its worst hours. **Power, not energy, limits it.**"
              : "At " + fm.mw(P) + " every hour is served: the largest gap above firm output is " + fm.mw(W.peakGap) + ". Energy and power both have to be enough.");
          }
          run = action({ api: api, st: st, host: act, go: go, job: function () { var s = store(D, "hydrogen", { P: P }); s.E = store(D, "hydrogen").E; return solveStore("h2-" + P, s).then(function (o) { return o.ok ? null : o; }); },
            show: function () { st.set(res["h2-" + P].r); show(); } });
          go.addEventListener("click", run);
        } },
      // 7 cost per MWh delivered
      { text: "A store earns its cost back only on the energy it delivers. Set how often it cycles a year, and the price of the power that charges it.",
        build: function (act, api) {
          var C = D.costs, cyc = 250, price = 20, moved = {}, ctl = H("div", null, act), out = H("ul", { class: "a8-bars", "aria-live": "polite" }, act), note = H("p", { class: "a8-note" }, act);
          var mx = function () { return 600; };
          function draw() {
            out.innerHTML = "";
            C.items.forEach(function (it) {
              var c = perMWh(it, cyc, price, C.rate), li = H("li", null, out), s = store(D, it.id);
              H("span", { text: s.short + " · " + it.hours + " h" }, li);
              var b = H("span", { class: "bar", role: "img", "aria-label": s.short + ": " + fm.usd(c.total) + " per MWh delivered, " + fm.usd(c.capital) + " capital and " + fm.usd(c.charging) + " charging" + (c.capped ? ", at its limit of " + c.cycles + " cycles a year" : "") }, li);
              H("i", { style: "width:" + Math.min(100, c.capital / mx() * 100).toFixed(1) + "%;background:" + s.color }, b); H("i", { style: "width:" + Math.min(100, c.charging / mx() * 100).toFixed(1) + "%;background:var(--lx-ink-3)" }, b);
              H("b", { text: (c.total > mx() ? "> " : "") + fm.usd(c.total) }, li);
            });
            var h = C.items.filter(function (i) { return i.id === "hydrogen"; })[0];
            note.textContent = "Coloured: building it (capital recovery at " + Math.round(C.rate * 100) + "% real). Grey: charging, price ÷ round trip. The hydrogen store can cycle at most " + maxCycles(h) + " times a year; bars stop at $600.";
          }
          LX.Slider(ctl, { label: "Full cycles a year", min: 2, max: 365, step: 1, value: cyc, fmt: function (v) { return v + " a year"; }, onChange: function (v) { cyc = v; moved.c = 1; draw(); check(); } });
          LX.Slider(ctl, { label: "Price of charging power", min: 0, max: 60, step: 5, value: price, fmt: function (v) { return "$" + v + "/MWh"; }, onChange: function (v) { price = v; moved.p = 1; draw(); check(); } });
          function check() {
            if (!moved.c) return; api.done();
            var b = perMWh(C.items[0], cyc, price, C.rate), p = perMWh(C.items[1], cyc, price, C.rate), h = perMWh(C.items[2], cyc, price, C.rate);
            api.saw("At " + cyc + " cycles: battery " + fm.usd(b.total) + ", pumped hydro " + fm.usd(p.total) + ", hydrogen " + fm.usd(h.total) + " per MWh delivered" + (h.capped ? " (hydrogen at its " + h.cycles + "-cycle limit)" : "") + ". **The fewer the cycles, the more each MWh must carry.**");
          }
          draw();
          H("p", { class: "a8-note", html: "Installed costs of 100 MW systems, 2021, from " + LX.esc(C.source.label) + "; fixed upkeep, wear and replacements left out." }, act);
        } },
      // 8 what a week can and cannot show
      { text: "One week tests endurance. Sort five claims: which does this week show, and which need a full year or many years?",
        build: function (act, api) {
          var h = res.hydrogen, b = res.battery;
          LX.CardSort(act, { bins: [{ id: "shown", label: "Shown", sub: "by this week" }, { id: "untested", label: "Not tested", sub: "needs more than a week" }],
            cards: [
              { id: "battery", text: "A 4-hour battery alone cannot carry the grid through these calm days.", bin: "shown", why: "It covers " + (b ? fm.pct(b.covered) : "a quarter") + " of the shortfall in this run." },
              { id: "power", text: "A store's power limits it in the worst hours, however much energy it holds.", bin: "shown", why: "The hydrogen store's leftover shortfall equals the MWh above firm output plus its power." },
              { id: "adequate", text: "With the hydrogen store, the grid is adequate.", bin: "untested", why: "Adequacy needs many weather years and plant outages (A5, upcoming), not one week." },
              { id: "refill", text: "The store can refill before the next calm spell.", bin: "untested", why: "That needs the whole year in order, as M3's linked weeks keep it." },
              { id: "pays", text: "A seasonal store pays for itself.", bin: "untested", why: "Its value depends on the year's prices and how often it cycles, not on one week." }
            ],
            onCheck: function (g) { if (g.placed < g.total) return; api.done(); LX.progress.done(SLUG); remember("sorted", g.right); api.saw(g.right + " of " + g.total + " as a planner would sort them. A week shows endurance, not adequacy or seasonal value."); } });
        } }
    ];
    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "a8-steps", steps: steps, onStep: function (i) { if (i === 3) { try { LX.solver.preload(); } catch (e) { /* the first solve loads it */ } } } });
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 5 : m ? +m[1] : 0;
      if (!n) return null;
      cards.go(Math.min(steps.length, n) - 1);
      if (n === 5) { var bs = cardsHost.querySelectorAll(".lx-step-act .a8-row .lx-btn"); Array.prototype.forEach.call(bs, function (b, i) { setTimeout(function () { b.click(); }, 300 * i); }); }
      if (n === 6) { var g = cardsHost.querySelector(".lx-step-act .a8-row .lx-btn"); if (g) g.click(); }
      return { view: state };
    }, cards);
    root.lxLesson = { model: model, W: W, res: res, cards: cards };
    explain(W, D);
  });

  // ---------------------------------------------------------------- explain layer: comparison table, causal chain
  function explain(W, D) {
    var x = document.getElementById("a8-explain"); if (!x) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var R = D.reference, C = D.costs;
    var rows = D.techs.map(function (t) {
      var s = store(D, t.id), r = R.stores[t.id], it = C.items.filter(function (i) { return i.id === t.id; })[0], c = it ? perMWh(it, R.cyclesShown, R.priceShown, C.rate) : null;
      return { key: t.id, color: t.color, name: t.short, note: s.P.toLocaleString("en-US") + " MW, " + s.hours + " h", eta: { text: fm.pct(t.eta), value: t.eta }, loss: t.lossPerDay ? fm.pct(t.lossPerDay) + " a day" : "none modelled",
               cov: { text: fm.pct(r.covered), value: r.covered }, cost: c ? { text: fm.usd(c.total), value: c.total } : { text: "–", value: 0 } };
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Four stores, one calm week",
      lede: "Each store 1,000 MW and full at the start. Cost per MWh delivered at " + R.cyclesShown + " cycles a year (or a store's limit) and $" + R.priceShown + "/MWh charging power.",
      columns: [{ key: "name", label: "Store", main: true }, { key: "eta", label: "Round trip", num: true, phoneHide: true }, { key: "loss", label: "Heat loss", phoneHide: true },
                { key: "cov", label: "Shortfall covered", phone: "Covered", num: true, bar: { max: 1 } }, { key: "cost", label: "$ per MWh delivered", phone: "$/MWh", num: true }],
      rows: rows,
      sorts: [{ label: "By duration", order: rows.map(function (r) { return r.key; }), note: "Longer stores cover more of the week; the heat store and hydrogen lose much of what they take in." },
              { label: "By shortfall covered", order: rows.slice().sort(function (a, b) { return b.cov.value - a.cov.value; }).map(function (r) { return r.key; }), ranked: true, note: "No 1,000 MW store covers it all: in " + R.hoursAbove + " hours the gap tops firm output plus 1,000 MW." }]
    });
    LX.CausalChain(H("div", { class: "lx-xcard" }, x), {
      title: "Cause and effect: a calm week drains short stores",
      links: [{ title: "Wind drops for three days", text: "Demand stays high.", value: fm.pct(W.daily[5].wind) + " of wind's size" },
              { title: "Firm output runs flat out", text: "It cannot cover the gap.", value: fm.mw(W.firm) },
              { title: "Short stores empty in hours", text: "They refill only if wind returns.", value: "battery: " + fm.pct(R.stores.battery.covered) + " covered" },
              { title: "Long stores keep going", text: "Losses eat into what they hold.", value: "hydrogen: " + fm.pct(R.stores.hydrogen.covered) },
              { title: "Power caps the worst hours", text: "However much energy is stored.", value: fm.mwh(R.floor1000) + " left" }],
      note: "A week shows endurance. Adequacy needs many weather years; seasonal value needs the full year in order."
    });
  }
})();
