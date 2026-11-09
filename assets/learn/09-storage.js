// 09-storage.js — Lesson 9, "How does storage move energy through time?" (step cards, Analyst tier).
//
// Data: assets/learn/data/09-storage.json (the day, the battery, sizes to compare, real-world numbers with sources and a
// precomputed answer used only if the solver cannot load), town.json (Prairie Town's fleet; illustrative) and
// town_year.json (every hour of 2025 on the Southwest Power Pool grid, from EIA-930, as shapes).
//
// The day: 9 June 2025, cut from the year by local date (Central daylight time, UTC-5) as lesson 0 does, and scaled the
// same way: demand = shape x 450 MW, wind = shape x 150 MW, solar = shape x 200 MW, each rounded to whole MW. Chosen as
// the 2025 day (no filled or frozen hours) with the longest midday surplus of sun (9 hours, 08:00-17:00) and an
// evening that needs the peaker (3 hours, 20:00-23:00) under these rules. Hour t runs from t:00 to (t+1):00.
// The town without a battery (closed form, one hour at a time; no ramp limit in this lesson): the nuclear plant runs
// flat at 100 MW (lesson 0); gap = demand - nuclear - wind - sun. A gap below zero is spilled wind and sun; otherwise
// the combined-cycle ($40/MWh, up to 150 MW) fills it, then the peaker ($100/MWh, up to 100 MW).
// The hour's price shown on the page = the cost of one more MWh without the battery: $0 while sun is spilled, $40 on
// the combined-cycle, $100 on the peaker (lesson 8's marginal cost).
// The battery: P MW, E MWh, round-trip efficiency eta, with the whole loss on charging:
//   soc_t = soc_{t-1} + eta x charge_t - discharge_t,  0 <= soc <= E,  charge and discharge <= P, soc_{-1} = 0.
// Its value = the town's running cost without it minus the cost with it (the battery's charging is extra demand, its
// discharging extra supply, and the hour is re-dispatched as above). The reader's schedule uses full power (P) in each
// chosen hour, clipped by the state of charge. The best schedule is the town's dispatch with the battery inside, a
// linear program solved by HiGHS (LX.solver); two tiny tie-break costs (below $0.002/MWh) pick among equally good plans
// and are left out of every reported number.
// Every number on the page is checked against this model by _tests/learn/test_09-storage.js.
(function () {
  "use strict";
  var HOURS = 24, TIE = 0.001;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function prepare(town, year, D) {
    var f = town.fleet, d = D.day, t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(d.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - d.utcOffsetHours, W = { fleet: f, date: d.date, dateLabel: d.dateLabel, demand: [], wind: [], solar: [], gap: [], price: [], marginal: [] };
    if (i < 0 || i + HOURS > year.demand.length) throw new Error("date " + d.date + " is outside the year file");
    for (var t = 0; t < HOURS; t++) {
      var dm = Math.round(year.demand[i + t] / 1000 * d.demandPeakMW), w = Math.round(year.wind[i + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i + t] / 1000 * f.solar.mw);
      var g = dm - f.nuclear.mw - w - s;
      W.demand.push(dm); W.wind.push(w); W.solar.push(s); W.gap.push(g);
      var m = g < 0 ? "spill" : g < f.cc.mw ? "cc" : g < f.cc.mw + f.peaker.mw ? "pk" : "short";
      W.marginal.push(m); W.price.push(m === "spill" ? 0 : m === "cc" ? f.cc.cost : m === "pk" ? f.peaker.cost : D.penalty);
    }
    W.base = cost(W, W.gap, D.penalty);
    return W;
  }
  // one hour dispatched cheapest first for a gas need g (MW); negative g is spilled
  function hour(f, g, V) {
    var need = Math.max(0, g), cc = Math.min(f.cc.mw, need), pk = Math.min(f.peaker.mw, need - cc), un = need - cc - pk;
    return { cc: cc, pk: pk, un: un, sp: Math.max(0, -g), cost: f.cc.cost * cc + f.peaker.cost * pk + V * un };
  }
  function cost(W, gaps, V) {
    var f = W.fleet, c = HOURS * f.nuclear.mw * f.nuclear.cost;
    gaps.forEach(function (g) { c += hour(f, g, V).cost; });
    return c;
  }
  // the reader's schedule: plan[t] = -1 charge, 0 idle, +1 discharge, each at full power, clipped by the state of charge
  function simulate(W, B, plan, V) {
    var f = W.fleet, soc = 0, hs = [], T = { in: 0, out: 0, lost: 0, fromSpill: 0, fromGas: 0, save: 0, cost: 0 };
    for (var t = 0; t < HOURS; t++) {
      var a = plan[t] || 0, ch = 0, dis = 0;
      if (a < 0) { var room = B.E - soc; ch = Math.min(B.P, room / B.eta); soc += B.eta * ch; }
      if (a > 0) { dis = Math.min(B.P, soc); soc -= dis; }
      if (soc < 1e-9) soc = 0; if (soc > B.E - 1e-9) soc = B.E;
      var g = W.gap[t] + ch - dis, before = hour(f, W.gap[t], V), after = hour(f, g, V);
      var spillUsed = Math.min(ch, before.sp);
      hs.push({ t: t, act: a, ch: ch, dis: dis, soc: soc, fromSpill: spillUsed, fromGas: ch - spillUsed, save: before.cost - after.cost });
      T.in += ch; T.out += dis; T.fromSpill += spillUsed; T.fromGas += ch - spillUsed; T.save += before.cost - after.cost;
    }
    T.lost = T.in * (1 - B.eta); T.socEnd = soc; T.cost = W.base - T.save;
    return { hours: hs, totals: T };
  }
  // the town's dispatch with the battery inside (LX.solver model format)
  function buildLP(W, B, V) {
    var f = W.fleet, vars = [], cons = [];
    for (var t = 0; t < HOURS; t++) {
      vars.push({ name: "cc_" + t, ub: f.cc.mw, cost: f.cc.cost }, { name: "pk_" + t, ub: f.peaker.mw, cost: f.peaker.cost },
        { name: "sp_" + t, ub: W.wind[t] + W.solar[t] }, { name: "un_" + t, cost: V },
        { name: "ch_" + t, ub: B.P, cost: TIE }, { name: "dis_" + t, ub: B.P, cost: TIE * (1 - W.gap[t] / 1000) }, { name: "soc_" + t, ub: B.E });
      var bal = {}; bal["cc_" + t] = 1; bal["pk_" + t] = 1; bal["sp_" + t] = -1; bal["un_" + t] = 1; bal["ch_" + t] = -1; bal["dis_" + t] = 1;
      cons.push({ name: "balance_" + t, terms: bal, eq: W.gap[t] });
      var sc = {}; sc["soc_" + t] = 1; sc["ch_" + t] = -B.eta; sc["dis_" + t] = 1; if (t) sc["soc_" + (t - 1)] = -1;
      cons.push({ name: "soc_" + t, terms: sc, eq: 0 });
    }
    return { sense: "min", variables: vars, constraints: cons, objective: { terms: {}, constant: HOURS * f.nuclear.mw * f.nuclear.cost } };
  }
  function parseLP(W, B, r, V) {
    if (!r || !r.values) return null;
    var f = W.fleet, o = { ch: [], dis: [], soc: [], cost: HOURS * f.nuclear.mw * f.nuclear.cost, in: 0, out: 0, fromSpill: 0, fromGas: 0 };
    for (var t = 0; t < HOURS; t++) {
      var v = function (k) { var x = r.values[k + "_" + t]; return Math.abs(x) < 1e-7 ? 0 : x; };
      o.ch.push(v("ch")); o.dis.push(v("dis")); o.soc.push(v("soc"));
      o.cost += f.cc.cost * v("cc") + f.peaker.cost * v("pk") + V * v("un");
      o.in += v("ch"); o.out += v("dis");
      var spill0 = Math.max(0, -W.gap[t]); o.fromSpill += Math.min(v("ch"), spill0); o.fromGas += Math.max(0, v("ch") - spill0);
    }
    o.save = W.base - o.cost; o.lost = o.in * (1 - B.eta);
    return o;
  }
  // a battery's state of charge at the end of each hour, for drawing: [0 at the start, then 24 values]
  function socLine(soc) { return [0].concat(soc); }
  // clock times: hour t runs from hm(t) to hm(t + 1); hm(24) = "24:00"
  function hm(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  // the day's windows as clock intervals: the spilled-sun hours (midday), the hours before them (overnight) and the
  // evening from the hour before the first peaker hour to the end of the last one
  function windows(W) {
    var sp = [], pk = [];
    W.marginal.forEach(function (m, t) { if (m === "spill") sp.push(t); if (m === "pk") pk.push(t); });
    var s0 = sp[0], s1 = sp[sp.length - 1], p0 = pk[0], p1 = pk[pk.length - 1];
    return { night: [0, s0], mid: [s0, s1 + 1], eve: [p0 - 1, p1 + 1], spill: [s0, s1 + 1], peak: [p0, p1 + 1],
             label: function (w) { return hm(w[0]) + "–" + hm(w[1]); } };
  }
  // the first clock time at which a schedule's state of charge reaches E (the end of that hour)
  function fullAt(soc, E) { for (var t = 0; t < soc.length; t++) if (soc[t] >= E - 1e-6) return hm(t + 1); return null; }
  // step 1's question: how long can P MW drain E MWh? Options and the feedback for each (numbers from the ratings)
  function hoursQuiz(B) {
    var h = B.E / B.P, q = B.E / 0.25;
    return {
      options: [{ value: "a", label: "15 minutes" }, { value: "b", label: h + " hours" }, { value: "c", label: B.P + " hours" }, { value: "d", label: B.E + " hours" }], answer: "b",
      feedback: { b: h + " hours: " + B.E + " MWh ÷ " + B.P + " MW. Energy = power × time, as in lesson 1.",
                  a: "Emptying " + B.E + " MWh in 15 minutes would take " + q + " MW, " + (q / B.P) + " times this battery's " + B.P + " MW. " + B.E + " MWh ÷ " + B.P + " MW = " + h + " hours.",
                  c: "The MW and MWh got swapped. " + B.E + " MWh ÷ " + B.P + " MW = " + h + " hours.",
                  d: "Only at 1 MW. At " + B.P + " MW: " + B.E + " ÷ " + B.P + " = " + h + " hours." },
      fast: q
    };
  }
  var model = { HOURS: HOURS, TIE: TIE, prepare: prepare, hour: hour, cost: cost, simulate: simulate, buildLP: buildLP, parseLP: parseLP, socLine: socLine,
                hm: hm, windows: windows, fullAt: fullAt, hoursQuiz: hoursQuiz };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, S = LX.S;
  var CSS = [
    ".w9-stage{display:grid;gap:10px;background:var(--lx-surface);border:1px solid var(--lx-line);border-radius:var(--lx-r-lg);padding:14px 16px;box-shadow:var(--lx-shadow)}",
    ".w9-stage[hidden]{display:none}",
    ".w9-stage>*{min-width:0}",   // an open text version's table scrolls in its box instead of widening the stage on phones
    ".w9-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px 12px;flex-wrap:wrap}.page-learn .w9-head :is(h2,h3){font-size:16px;margin:0}.page-learn .w9-head h2{opacity:.9}",
    ".w9-chips{display:flex;flex-wrap:wrap;gap:8px}",
    ".w9-chip{display:grid;gap:1px;padding:5px 10px;border-radius:10px;background:var(--lx-surface-2)}",
    ".w9-chip span{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3)}",
    ".w9-chip b{font-family:var(--lx-f-mono);font-size:15.5px;font-weight:600;color:var(--lx-ink);font-variant-numeric:tabular-nums}",
    ".w9-chip.good b{color:var(--lx-good)}.w9-chip.bad b{color:var(--lx-bad)}",
    ".w9-tiles{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px}",
    "@media(max-width:700px){.w9-tiles{grid-template-columns:repeat(12,minmax(0,1fr));row-gap:6px}}",
    ".w9-tile{display:grid;gap:3px;justify-items:center;min-width:0}",
    ".w9-tile small{font-family:var(--lx-f-mono);font-size:10.5px;color:var(--lx-ink-3)}",
    ".w9-price{width:100%;text-align:center;font-family:var(--lx-f-mono);font-size:11px;font-weight:600;border-radius:5px;padding:2px 0;color:#fff;background:var(--c);overflow:hidden}",
    ".w9-price.dk{color:#16181d}",
    ".w9-act{width:100%;min-height:40px;border-radius:8px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink-3);cursor:pointer;display:grid;place-items:center;padding:0}",
    ".w9-act:disabled{cursor:default}",
    ".w9-act svg{width:16px;height:16px}",
    ".w9-act.ch{background:var(--lx-good-soft);border-color:var(--lx-good);color:var(--lx-good)}",
    ".w9-act.dis{background:var(--lx-warn-soft);border-color:var(--lx-warn);color:var(--lx-warn)}",
    ".w9-act.best{box-shadow:inset 0 -4px 0 var(--lx-ink-3)}",
    ".w9-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--lx-ink-2)}",
    ".w9-legend span{display:inline-flex;align-items:center;gap:5px}.w9-legend i{width:12px;height:12px;border-radius:3px;background:var(--c)}",
    ".w9-legend i.line{height:0;border-top:2.5px solid var(--c);border-radius:0;background:none;width:16px}.w9-legend i.dash{border-top-style:dashed}",
    ".w9-soc svg{display:block;width:100%;height:auto}",
    ".w9-tank{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}",
    ".w9-tankbar{height:34px;border-radius:9px;border:2px solid var(--lx-ink-3);position:relative;overflow:hidden;background:var(--lx-surface-2)}",
    ".w9-tankbar i{position:absolute;left:0;top:0;bottom:0;background:var(--lx-good);transition:width .4s}",
    "@media(prefers-reduced-motion:reduce){.w9-tankbar i{transition:none}}",
    ".w9-tank b{font-family:var(--lx-f-mono);font-size:15px}",
    ".w9-sizes{display:grid;gap:6px}",
    ".w9-size{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:8px;align-items:center;font-size:14px}",
    "@media(max-width:560px){.w9-size{font-size:12.5px}}",
    ".w9-size b{font-family:var(--lx-f-mono)}.w9-size .bar{height:16px;border-radius:5px;background:var(--lx-surface-3);position:relative}",
    ".w9-size .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:var(--lx-accent)}",
    ".w9-size span{font-family:var(--lx-f-mono);color:var(--lx-ink-2);text-align:right;white-space:nowrap}",
    ".w9-rules{margin-top:10px}.w9-rules td.k{font-weight:600;color:var(--lx-ink);white-space:nowrap}",
    ".w9-legtab{margin-top:10px;line-height:1.4}.w9-legtab td,.w9-legtab th{padding:3px 8px;text-align:left;vertical-align:top}.w9-legtab td:nth-child(2){font-family:var(--lx-f-body)}"
  ].join("\n");
  var COL = { spill: "var(--lx-solar)", cc: "var(--lx-cc)", pk: "var(--lx-pk)", short: "var(--lx-bad)" };
  var WHY = { spill: "sun is being spilled", cc: "the combined-cycle is the last plant needed", pk: "the peaker is the last plant needed", short: "demand is not met" };
  var usd = function (v) { return (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US"); };
  var f1 = function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }); };
  function sawB(api, t, bad) { api.saw(t, bad); var b = api.card.querySelector(":scope > div[aria-live] > .lx-saw > div"); if (b) b.innerHTML = b.innerHTML.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  function view(live, data, root) {
    if (!document.getElementById("w9-css")) H("style", { id: "w9-css", text: CSS }, document.head);
    var D = data["09_storage"], town = data.town, W = prepare(town, data.town_year, D), f = town.fleet, V = D.penalty, B = D.battery;
    var plan = []; for (var t = 0; t < HOURS; t++) plan.push(0);
    var best = null, bestBy = {}, mode = "look", hook = null;
    var hh = LX.fmt.hh;

    // ---------- stage: chips, the 24 hours, state of charge
    var stage = H("div", { class: "w9-stage" }, live);
    var w9h = H("div", { class: "w9-head" }, stage);   // the scene's title: an h2 when the stage sits right under the page title
    H(LX.hTag(3, w9h), { text: W.dateLabel + " in Prairie Town · battery " + B.P + " MW / " + B.E + " MWh, " + Math.round(B.eta * 100) + "% round trip" }, w9h);
    var chips = H("div", { class: "w9-chips", "aria-live": "polite" }, stage);
    var tiles = H("div", { class: "w9-tiles", role: "group", "aria-label": "The day's 24 hours: price and the battery's action" }, stage);
    var lg = H("div", { class: "w9-legend", "aria-hidden": "true" }, stage);
    [["Without the battery, one more MWh costs, $: 0 (sun spilled)", COL.spill], [f.cc.cost + " (combined-cycle)", COL.cc], [f.peaker.cost + " (peaker)", COL.pk]].forEach(function (x) { var s = H("span", null, lg); H("i", { style: "--c:" + x[1] }, s); H("span", { text: x[0] }, s); });
    H("span", { text: "Each tile is the hour that starts at its label. Savings re-run the plants with the battery." }, lg);
    var socBox = H("div", { class: "w9-soc" }, stage);
    var lg2 = H("div", { class: "w9-legend", "aria-hidden": "true" }, stage);
    var alt = H("details", { class: "lx-textalt" }, stage); H("summary", { text: "Text version of the day" }, alt); var altBody = H("div", { class: "lx-scroll-x" }, alt);
    var tileEls = [];
    for (var k = 0; k < HOURS; k++) (function (t) {
      var d = H("div", { class: "w9-tile" }, tiles);
      H("small", { text: (t < 10 ? "0" : "") + t, "aria-hidden": "true" }, d);
      H("div", { class: "w9-price" + (W.marginal[t] === "pk" ? "" : " dk"), style: "--c:" + COL[W.marginal[t]], text: String(W.price[t]), "aria-hidden": "true" }, d);
      var b = H("button", { type: "button", class: "w9-act" }, d);
      b.addEventListener("click", function () {
        if (mode === "look") { if (hook) hook({ look: t }); return; }
        plan[t] = plan[t] === 0 ? -1 : plan[t] === -1 ? 1 : 0; paint(); if (hook) hook({ plan: t });
      });
      tileEls.push(b);
    })(k);

    function chip(label, value, cls) { var c = H("div", { class: "w9-chip" + (cls ? " " + cls : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function drawSoc(you, opt) {
      socBox.innerHTML = "";
      var Wd = Math.max(280, socBox.clientWidth || 600), Hh = Wd < 480 ? 150 : 170, m = { l: 40, r: 8, t: 10, b: 22 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b;
      var svg = S("svg", { viewBox: "0 0 " + Wd + " " + Hh, role: "img", "aria-label": "State of charge through the day, 0 to " + B.E + " MWh" + (opt ? ", yours and the best schedule's" : "") + "." }, socBox);
      var x = function (t) { return m.l + t / HOURS * iw; }, y = function (v) { return m.t + ih - v / B.E * ih; };
      [0, B.E / 2, B.E].forEach(function (v) {
        S("line", { x1: m.l, x2: Wd - m.r, y1: y(v), y2: y(v), stroke: "var(--lx-line)" }, svg);
        S("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = v;
      });
      [0, 6, 12, 18, 24].forEach(function (h) { S("text", { x: x(h), y: Hh - 5, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = (h < 10 ? "0" : "") + h + ":00"; });
      S("text", { x: m.l + 4, y: m.t + 10, "font-size": 11, "font-family": "var(--lx-f-display)", fill: "var(--lx-ink-3)" }, svg).textContent = "MWh stored";
      function path(arr, attrs) { var dd = arr.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" "); var a = { d: dd, fill: "none", "stroke-width": 2.5 }; for (var q in attrs) a[q] = attrs[q]; S("path", a, svg); }
      if (opt) path(socLine(opt.soc), { stroke: "var(--lx-good)", "stroke-dasharray": "6 4" });
      if (you) path(socLine(you.hours.map(function (r) { return r.soc; })), { stroke: "var(--lx-accent)" });
      lg2.innerHTML = "";
      [["Your battery", "var(--lx-accent)", ""], opt ? ["The best schedule", "var(--lx-good)", " dash"] : null].filter(Boolean).forEach(function (q) { var s = H("span", null, lg2); H("i", { class: "line" + q[2], style: "--c:" + q[1] }, s); H("span", { text: q[0] }, s); });
    }
    function paint() {
      var you = simulate(W, B, plan, V);
      tileEls.forEach(function (b, t) {
        var a = plan[t], r = you.hours[t];
        b.className = "w9-act" + (a < 0 ? " ch" : a > 0 ? " dis" : "") + (best && mode === "plan" && (best.ch[t] > 0.5 || best.dis[t] > 0.5) ? " best" : "");
        b.innerHTML = "";
        if (a < 0) b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 4v14M6 12l6 6 6-6"/></svg>';
        if (a > 0) b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 20V6M6 12l6-6 6 6"/></svg>';
        b.disabled = mode === "off";
        b.setAttribute("aria-label", hm(t) + " to " + hm(t + 1) + ": without the battery, one more MWh costs $" + W.price[t] + " (" + WHY[W.marginal[t]] + (W.marginal[t] === "spill" ? ", " + Math.round(-W.gap[t]) + " MW" : "") + "). " +
          (mode === "look" ? "Press for details." : "Your battery: " + (a < 0 ? "charging " + f1(r.ch) + " MW" : a > 0 ? "discharging " + f1(r.dis) + " MW" : "idle") + ". Press to change your schedule."));
      });
      chips.innerHTML = "";
      if (mode === "plan" || mode === "best") {
        chip("Town's saving", usd(you.totals.save), you.totals.save > 0 ? "good" : you.totals.save < 0 ? "bad" : "");
        chip("In from spilled sun", f1(you.totals.fromSpill) + " MWh");
        chip("In from gas", f1(you.totals.fromGas) + " MWh", you.totals.fromGas > 0.5 ? "bad" : "");
        chip("Lost as heat", f1(you.totals.lost) + " MWh");
        if (best) chip("Best saving", usd(best.save), "good");
      } else {
        chip("Spilled sun", W.gap.filter(function (g) { return g < 0; }).reduce(function (a, g) { return a - g; }, 0) + " MWh");
        chip("Peaker", W.gap.reduce(function (a, g) { return a + Math.max(0, Math.min(f.peaker.mw, g - f.cc.mw)); }, 0) + " MWh");
        chip("Cost, no battery", usd(W.base));
      }
      if (LX.visible(socBox) || !socBox.firstChild) drawSoc(mode === "look" ? null : you, best && mode !== "look" ? best : null);
      // text version
      altBody.innerHTML = "";
      var tb = H("table", { class: "lx-mini-table" }, altBody), tr = H("tr", null, H("thead", null, tb));
      ["Hour", "Demand, MW", "Wind, MW", "Sun, MW", "One more MWh without the battery, $", "Your battery, MW", "Your stored, MWh"].concat(best ? ["Best: charge, MW", "Best: discharge, MW", "Best: stored, MWh"] : []).forEach(function (x) { H("th", { scope: "col", text: x }, tr); });
      var bd = H("tbody", null, tb);
      you.hours.forEach(function (r, t) {
        var row = H("tr", null, bd);
        [hm(t) + "–" + hm(t + 1), W.demand[t], W.wind[t], W.solar[t], W.price[t], r.act < 0 ? "charge " + f1(r.ch) : r.act > 0 ? "discharge " + f1(r.dis) : "idle", f1(r.soc)].concat(best ? [f1(best.ch[t]), f1(best.dis[t]), f1(best.soc[t])] : []).forEach(function (x) { H("td", { text: String(x) }, row); });
      });
      H("p", { class: "lx-hint", text: "Each row is one hour, so a battery running at " + B.P + " MW for the hour moves " + B.P + " MWh. Stored energy is at the end of the hour." }, altBody);
      return you;
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(socBox)) paint(); }).observe(socBox);
    LX.onTheme(function () { paint(); });

    function solveBest(E) {
      var b = { P: B.P, E: E, eta: B.eta }, key = String(E);
      if (bestBy[key]) return Promise.resolve(bestBy[key]);
      return LX.solver.solve(buildLP(W, b, V), { timeLimit: 5, key: "w9-" + key, label: "w9" }).then(function (r) {
        // "best" needs a proven optimum: any other status (an error, or a stop at the time limit with a plan that may not
        // be the best) falls back to the precomputed optimum, which the tests check against a fresh solve
        var o = r && r.status === "optimal" ? parseLP(W, b, r, V) : null;
        if (!o) { var P = D.precomputed[key]; if (P) { o = { save: P.save, ch: P.ch || [], dis: P.dis || [], soc: P.soc || [], in: P.in, out: P.out, fromSpill: P.fromSpill, fromGas: P.fromGas, precomputed: true }; } }
        if (o) { o.status = r ? r.status : "error"; o.ms = r && r.ms; bestBy[key] = o; }
        return o;
      });
    }

    // ---------- step cards
    var steps = [
      { text: "Prairie Town is adding a battery rated " + B.P + " MW and " + B.E + " MWh. The MW say how fast it charges or discharges; the MWh say how much it holds. Flat out, how long can it discharge?",
        build: function (act, api) {
          mode = "look"; hook = null; stage.hidden = true;
          var hq = hoursQuiz(B);
          var pr = LX.Predict(act, { id: "w9-hours", q: "Flat out, how long can it discharge?", title: false, fresh: true, options: hq.options, answer: hq.answer, feedback: hq.feedback,
            onPick: function () { pr.reveal("That ratio is the battery's duration: a " + (B.E / B.P) + "-hour battery."); api.done(); } });
        } },
      { text: "Batteries lose some energy as heat. This one returns " + Math.round(B.eta * 100) + "% of what goes in: its [[round-trip-efficiency|round-trip efficiency]]. Charge it for one hour at full power.",
        build: function (act, api) {
          mode = "look"; hook = null; stage.hidden = true;
          var soc = 0, tank = H("div", { class: "w9-tank" }, act), bar = H("div", { class: "w9-tankbar", role: "img", "aria-label": "Battery, empty" }, tank), fill = H("i", { style: "width:0%" }, bar), lab = H("b", { text: "0 / " + B.E + " MWh" }, tank);
          var row = H("div", { class: "lx-step-foot" }, act), n = 0;
          var bc = H("button", { type: "button", class: "lx-btn small", text: "Charge for one hour" }, row);
          var bd = H("button", { type: "button", class: "lx-btn ghost small", text: "Discharge for one hour" }, row);
          function draw() { fill.style.width = (soc / B.E * 100) + "%"; lab.textContent = f1(soc) + " / " + B.E + " MWh"; bar.setAttribute("aria-label", "Battery holding " + f1(soc) + " of " + B.E + " MWh"); }
          bc.addEventListener("click", function () {
            var ch = Math.min(B.P, (B.E - soc) / B.eta); soc += ch * B.eta; n++; draw(); api.done();
            sawB(api, "**" + f1(ch) + " MWh in, " + f1(ch * B.eta) + " MWh stored:** " + f1(ch * (1 - B.eta)) + " MWh became heat. Filling all " + B.E + " MWh takes " + f1(B.E / B.eta) + " MWh, " + f1(B.E / B.eta / B.P) + " hours at full power.");
          });
          bd.addEventListener("click", function () { var d = Math.min(B.P, soc); soc -= d; draw(); if (d > 0) sawB(api, "**" + f1(d) + " MWh out.** Nothing more is lost on the way out in this lesson's battery."); });
        } },
      { text: "Here is " + W.dateLabel + " (real Southwest Power Pool shapes, scaled to the town). Each hour shows what one more MWh costs: the last plant needed, as in lesson 8. When should the battery charge?",
        build: function (act, api) {
          mode = "look"; stage.hidden = false; hook = function (e) { if (e.look != null) sawB(api, hm(e.look) + " to " + hm(e.look + 1) + ": without the battery, one more MWh costs **$" + W.price[e.look] + "** because " + WHY[W.marginal[e.look]] + (W.marginal[e.look] === "spill" ? " (" + (-W.gap[e.look]) + " MW)." : ".")); };
          paint();
          var win = windows(W);
          var pr = LX.Predict(act, { id: "w9-when", q: "When should the battery charge?", title: false, fresh: true,
            options: [{ value: "night", label: "Overnight (" + win.label(win.night) + ")" }, { value: "mid", label: "Midday (" + win.label(win.mid) + ")" }, { value: "eve", label: "Evening (" + win.label(win.eve) + ")" }], answer: "mid",
            feedback: { mid: "Midday: sun, wind and the flat nuclear plant together make more than the town needs. Storing that spare sun costs $0; charging faster than the sun spills takes gas at $" + f.cc.cost + ".", night: "At night the combined-cycle makes every extra MWh, at $" + f.cc.cost + ". Midday sun that would be spilled costs $0.", eve: "The evening is when the battery should give power back: the peaker is running." },
            onPick: function () { pr.reveal("Tap any hour on the strip to see why its price is what it is."); api.done(); } });
        } },
      { text: "Your turn. Tap an hour to cycle Charge, Discharge, Idle; each runs at the full " + B.P + " MW. The battery starts empty. Make the town's day as cheap as you can.",
        build: function (act, api) {
          mode = "plan"; stage.hidden = false;
          var rs = H("button", { type: "button", class: "lx-btn ghost small", text: "Clear my schedule" }, act);
          rs.addEventListener("click", function () { for (var q = 0; q < HOURS; q++) plan[q] = 0; paint(); });
          hook = function () {
            var you = simulate(W, B, plan, V), T = you.totals;
            if (T.save > 0 && T.in > 0 && T.out > 0) api.done();
            if (!T.in) { sawB(api, "Charge first: tap a midday hour once."); return; }
            if (!T.out) { sawB(api, "Stored " + f1(T.in * B.eta) + " MWh. Now tap an evening hour twice to discharge."); return; }
            var gas = you.hours.filter(function (r) { return r.fromGas > 0.5 && W.marginal[r.t] === "spill"; })[0];
            sawB(api, "Your schedule saves the town **" + usd(T.save) + "**." + (gas ? " At " + hh(gas.t) + " only " + (-W.gap[gas.t]) + " MW of sun is spilled, so charging " + f1(gas.ch) + " MW" + (gas.ch < B.P - 0.05 ? " (slower: the battery is nearly full)" : "") + " takes " + f1(gas.fromGas) + " MW from gas." : T.fromGas > 0.5 ? " Some charging came from gas at $" + f.cc.cost + "/MWh." : ""), T.save <= 0);
          };
          paint();
        } },
      { text: "Now ask a [[solver|solver]] for the best schedule. It plans all 24 hours at once as a [[linear-program|linear program]] (lesson 10 writes one down) and may charge at part power.",
        build: function (act, api) {
          mode = "best"; stage.hidden = false;
          // the comparison, refreshed when the reader changes their schedule after the solve
          var compare = function () {
            if (!best) return;
            var you = simulate(W, B, plan, V), pct = best.save > 0 ? Math.round(you.totals.save / best.save * 100) : 0, w = windows(W);
            sawB(api, "Best: **" + usd(best.save) + "**; yours: " + usd(you.totals.save) + " (" + pct + "%). The solver stores only spilled sun, at part power where the spill is small, then discharges from " + hm(w.eve[0]) + " to " + hm(w.eve[1]) + ".");
          };
          hook = function (e) { if (e.plan != null) compare(); };
          var stl = LX.SolverStatus(act);
          var b = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Find the best schedule" }, act);
          b.addEventListener("click", function () {
            b.disabled = true; stl.set(LX.solver.mode ? "solving" : "loading");
            solveBest(B.E).then(function (o) {
              b.disabled = false; if (!o) { stl.set({ status: "error" }); return; }
              stl.set(o.precomputed ? "" : o); if (o.precomputed) stl.el.textContent = (o.status === "error" ? "The solver could not load here" : "The solver stopped before proving the best plan") + "; showing the precomputed best schedule.";
              best = o; paint(); api.done(); compare();
            });
          });
          paint();
        } },
      { text: "Is a longer battery always better? Keep " + B.P + " MW and try " + D.durations.join(", ") + " hours of storage. The solver re-plans the day for each.",
        build: function (act, api) {
          mode = "best"; hook = null; stage.hidden = true;   // the day above shows the 100 MWh battery; each bar here is a battery of its own
          var row = H("div", { class: "lx-step-foot", style: "justify-content:flex-start;flex-wrap:wrap" }, act), tried = {};
          H("p", { class: "lx-hint", text: "Each bar is a separate " + B.P + " MW battery, solved for its own best schedule on " + W.dateLabel + "." }, act);
          var box = H("div", { class: "w9-sizes" }, act);
          D.durations.forEach(function (h) {
            var b = H("button", { type: "button", class: "lx-btn ghost small", text: h + " h" }, row);
            b.addEventListener("click", function () {
              solveBest(B.P * h).then(function (o) {
                if (!o) return; tried[h] = o; b.setAttribute("aria-pressed", "true"); draw();
                var n = Object.keys(tried).length; if (n >= 3) api.done();
                var hs = Object.keys(tried).map(Number).sort(function (a, c) { return a - c; }), lo = hs[0], hi = hs[hs.length - 1];
                var pl = tried[lo].save / (B.P * lo), ph = tried[hi].save / (B.P * hi);
                if (n >= 2) sawB(api, "From " + lo + " to " + hi + " hours the saving goes from " + usd(tried[lo].save) + " to " + usd(tried[hi].save) + (ph > pl - 0.5 ? ", still " + usd(ph) + " per MWh of storage: every stored MWh replaces peaker output." :
                  ", but per MWh of storage it falls from " + usd(pl) + " to " + usd(ph) + ". Spilled sun runs out, and " + B.P + " MW caps how much peaker it can replace."));
              });
            });
          });
          function draw() {
            box.innerHTML = ""; var mx = Math.max.apply(null, Object.keys(tried).map(function (k) { return tried[k].save; }).concat([1]));
            Object.keys(tried).map(Number).sort(function (a, c) { return a - c; }).forEach(function (h) {
              var o = tried[h], r = H("div", { class: "w9-size" }, box);
              H("b", { text: h + " h" }, r); var bar = H("div", { class: "bar", role: "img", "aria-label": h + " hours: saves " + usd(o.save) + " a day" }, r); H("i", { style: "width:" + (o.save / mx * 100) + "%" }, bar);
              H("span", { text: usd(o.save) + " a day · " + usd(o.save / (B.P * h)) + "/MWh" }, r);
            });
          }
          paint();
        } },
      { text: "You have just solved a storage problem. In words: decide when to charge and discharge; keep the town's running cost lowest; obey power, energy, losses and balance. The diagrams below write it out.",
        free: true,
        build: function (act) {
          mode = "best"; hook = null; stage.hidden = false; paint();
          H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "Formulate it, as diagrams" + LX.icon("arrow") }, act);
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });
    live.insertBefore(stage, cards.el);
    LX.demo(root, function (state) {   // standard states (core.js LX.demo) plus best and sizes
      if (state === "mid") { cards.go(3); [11, 12, 13, 14, 15].forEach(function (t) { plan[t] = -1; }); [17, 20, 21, 22].forEach(function (t) { plan[t] = 1; }); paint(); if (hook) hook({ plan: 0 }); return { view: "hand schedule" }; }
      if (state === "best") { cards.go(4); var b = live.querySelector(".lx-step-act .lx-btn"); if (b) b.click(); return { view: "best schedule" }; }
      if (state === "sizes") { cards.go(5); live.querySelectorAll(".lx-step-act .lx-btn").forEach(function (b, i) { setTimeout(function () { b.click(); }, 200 * i); }); return { view: "sizes" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, W: W, plan: plan, cards: cards, best: function () { return best; } };
    buildExplain(town, W, D);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(town, W, D) {
    var host = document.getElementById("w9-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var f = town.fleet, B = D.battery, P = D.precomputed, best = P[String(B.E)];
    // 1 formulate it (LX.FormulateBox, components/formulate.js)
    var tag = function (t) { return ' &nbsp;<span class="tag">' + t + "</span>"; };
    var fcard = H("div", { class: "lx-xcard" }, host);
    LX.FormulateBox(fcard, {
      title: "Formulate it: the battery's day in words",
      lede: "The same three parts as every optimization model, plus the data it is given.",
      parts: [
        { k: "Decisions", color: "var(--lx-tier-2)", text: "For each hour: how much the battery charges and discharges, and how much it then holds; plus the gas plants and spilled sun, as in lesson 0." },
        { k: "Goal", color: "var(--lx-good)", text: "Make the town's running cost for the day as small as possible. The saving against no battery is the battery's value: " + usd(best.save) + " on " + W.dateLabel + "." },
        { k: "Rules", color: "var(--lx-warn)", text: "Five rules hold in every hour, one per row of the table below." },
        { k: "Given", color: "var(--lx-ink-3)", text: "Demand, wind and sun for each hour; plant sizes and costs; the battery's ratings. It starts the day empty." }
      ],
      symbols: "min Σ<sub>t</sub> ( " + f.cc.cost + " cc<sub>t</sub> + " + f.peaker.cost + " pk<sub>t</sub> )<br>" +
        "cc<sub>t</sub> + pk<sub>t</sub> − sp<sub>t</sub> + dis<sub>t</sub> − ch<sub>t</sub> = gap<sub>t</sub>" + tag("balance") + "<br>" +
        "soc<sub>t</sub> = soc<sub>t−1</sub> + " + B.eta + " ch<sub>t</sub> − dis<sub>t</sub>, &nbsp;soc<sub>−1</sub> = 0" + tag("losses") + "<br>" +
        "0 ≤ ch<sub>t</sub>, dis<sub>t</sub> ≤ " + B.P + tag("power") + "<br>" +
        "0 ≤ soc<sub>t</sub> ≤ " + B.E + tag("energy") + "<br>" +
        "0 ≤ cc<sub>t</sub> ≤ " + f.cc.mw + ", 0 ≤ pk<sub>t</sub> ≤ " + f.peaker.mw + tag("plants") + "<br>" +
        "0 ≤ sp<sub>t</sub> ≤ wind<sub>t</sub> + sun<sub>t</sub>" + tag("spill") +
        '<table class="lx-mini-table w9-legtab"><thead><tr><th scope="col">Symbol</th><th scope="col">Meaning</th><th scope="col">Unit</th></tr></thead><tbody>' +
        [["t", "the hour, 0 to 23 (1 MW for one hour = 1 MWh)", "–"], ["cc<sub>t</sub>, pk<sub>t</sub>", "combined-cycle and peaker output", "MW"],
         ["sp<sub>t</sub>", "spilled wind and sun", "MW"], ["ch<sub>t</sub>, dis<sub>t</sub>", "battery charging and discharging", "MW"],
         ["soc<sub>t</sub>", "energy stored at the end of hour t", "MWh"], ["gap<sub>t</sub>", "demand minus nuclear, wind and sun", "MW"]]
          .map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }).join("") + "</tbody></table>"
    });
    // the rules, one per row (before the symbols box)
    var rt = H("table", { class: "lx-facts w9-rules" }), rh = H("tr", null, H("thead", null, rt)), rb = H("tbody", null, rt);
    ["Rule", "In words"].forEach(function (x) { H("th", { scope: "col", text: x }, rh); });
    [["Power", "Charge or discharge at most " + B.P + " MW."], ["Energy", "Hold between 0 and " + B.E + " MWh; start the day empty."],
     ["Losses", "Stored energy grows by " + Math.round(B.eta * 100) + "% of what goes in."], ["Balance", "Supply equals demand; spare wind and sun may be spilled."],
     ["Plants", "Gas output stays within each plant's size: " + f.cc.mw + " and " + f.peaker.mw + " MW."]].forEach(function (r) {
      var tr = H("tr", null, rb); H("td", { class: "k", text: r[0] }, tr); H("td", { text: r[1] }, tr);
    });
    var symBox = fcard.querySelector(".lx-form-symbols");
    fcard.insertBefore(rt, symBox);
    // 2 comparison table: four batteries on the same day
    var rows = D.durations.map(function (h) {
      var o = P[String(B.P * h)];
      return { key: "h" + h, color: "var(--lx-accent)", name: h + "-hour battery", note: B.P + " MW, " + (B.P * h) + " MWh", save: { text: usd(o.save), value: o.save },
               per: { text: usd(o.save / (B.P * h)), value: o.save / (B.P * h) }, spill: f1(o.fromSpill) + " MWh", gas: f1(o.fromGas) + " MWh" };
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, host), {
      title: "Four batteries on " + W.dateLabel,
      columns: [{ key: "name", label: "Battery", main: true }, { key: "save", label: "Saving that day", phone: "Saving", num: true, bar: { max: Math.max.apply(null, rows.map(function (r) { return r.save.value; })) } },
        { key: "per", label: "Per MWh of storage", phone: "Per MWh", num: true, bar: { max: Math.max.apply(null, rows.map(function (r) { return r.per.value; })), color: "var(--lx-ink-3)" } },
        { key: "spill", label: "Charged from spilled sun", num: true, phoneHide: true }, { key: "gas", label: "Charged from gas", num: true, phoneHide: true }],
      rows: rows,
      sorts: [{ label: "By size", order: rows.map(function (r) { return r.key; }), note: "Each battery is solved for its best schedule. Doubling from " + D.durations[2] + " to " + D.durations[3] + " hours adds only " + usd(P[String(B.P * D.durations[3])].save - P[String(B.P * D.durations[2])].save) + "." },
              { label: "By value per MWh", order: rows.slice().sort(function (a, b) { return b.per.value - a.per.value; }).map(function (r) { return r.key; }), ranked: true,
                note: "<b>The first hours of storage earn the most.</b> Later ones find little spilled sun left to store, and the " + B.P + " MW limit caps how much peaker output they can replace." }]
    });
    // 3 causal chain with the best schedule's numbers
    var sp = W.gap.filter(function (x) { return x < 0; }).reduce(function (a, x) { return a - x; }, 0), pkMWh = W.gap.reduce(function (a, x) { return a + Math.max(0, Math.min(f.peaker.mw, x - f.cc.mw)); }, 0);
    LX.CausalChain(H("div", { class: "lx-xcard" }, host), {
      title: "Cause and effect: moving midday sun into the evening",
      links: [{ title: "Spare sun at midday", text: "Sun, wind and the flat plant exceed demand.", value: sp + " MWh spilled" },
              { title: "The battery soaks it up", text: "At part power, matching the spill.", value: f1(best.fromSpill) + " MWh in" },
              { title: "Heat takes its share", text: Math.round((1 - B.eta) * 100) + "% of what goes in.", value: f1(best.fromSpill * (1 - B.eta)) + " MWh lost" },
              { title: "Sunset, demand still high", text: "The peaker would run.", value: pkMWh + " MWh of peaker" },
              { title: "The battery discharges", text: "Into the dearest hours first.", value: f1(best.out) + " MWh out" },
              { title: "The town's cost falls", text: "Against no battery.", value: usd(best.save) + " saved" }],
      note: "The battery makes no energy: it shifts it in time and loses some on the way. Its value comes from the price gap between the hours."
    });
  }

  LX.mount("storage", function (live, data, root) { view(live, data, root); });
})();
