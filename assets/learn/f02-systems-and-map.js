// f02-systems-and-map.js — F2, "How does everything connect? Stocks, flows, feedback and the whole-system map"
// (play-first form, W2, 2026-11-03).
//
// Data: assets/learn/data/f02-systems-and-map.json (the three stock-and-flow presets, the two causal-loop diagrams, the
// whole-system map with four levers, and the sourced real-world numbers). Everything in the presets is illustrative.
//
// Three stations, one model each (model mode "simulation"; no solver, no prices):
//   1 Stocks and flows   one stock, one inflow, one outflow, stepped through time, kept between a floor and a ceiling:
//                          S[k+1] = S[k] + Δt × (in[k] − out[k]); above the ceiling the excess spills, below the floor
//                          the outflow is cut short.
//                        reservoir  weekly, 52 weeks; stock in GWh, flows in average MW; GWh per week = MW × 168 ÷ 1,000;
//                                   inflow = base + amp × exp(−((w − peak) ÷ width)²) (spring snowmelt); release steady
//                        battery    hourly, one day; charge from 10:00 to 15:00, discharge from 18:00 to 22:00; the whole
//                                   loss on charging (stored = 80% of bought), as in lesson 9's battery
//                        carbon     yearly, 2025-2070; emissions in straight lines (2025 → the 2035 level → zero in the
//                                   net-zero year, or held); the stock is cumulative CO₂ since the start of 2025; no outflow
//   2 Feedback loops     a causal-loop diagram: the reader signs every link (+: more causes more, −: more causes less) and
//                        names each loop. Loop polarity: an even number of − links makes a reinforcing loop, an odd
//                        number a balancing one (loopType). Chargers and EVs (one R, one B loop); the rebound effect (B).
//   3 The system map     four levers; each ripples in three waves of first-round directions (rises, falls, shifts,
//                        depends), other things equal, across five dimensions. Directions, not sizes: a thinking tool.
//
// Lesson-local components (candidates for promotion): StockFlow (i-stockflow: tub, flow and stock charts, a time
// scrubber), LoopBuilder (i-cld: sign the links, polarity check, name the loops; a static mode for e-loop) and
// RippleMap (i-ripple: lanes by dimension, levers, waves, edges drawn between the cards, hubs).
// Shared components: LX.Missions, LX.Notes, LX.Slider, LX.Predict, LX.Plot, LX.ConceptMap, LX.CompareTable.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function reservoirInflow(R) {
    var f = R.inflow, out = [];
    for (var w = 0; w < R.steps; w++) out.push(r6(f.base + f.amp * Math.exp(-Math.pow((w - f.peak) / f.width, 2))));
    return out;
  }
  // one stock between floor 0 and a ceiling; inflow and outflow in flow units per step; k = stock units per flow unit per step
  function stepStock(s, inS, outS, cap) {
    var next = s + inS - outS, spill = 0, short = 0;
    if (cap != null && next > cap) { spill = next - cap; next = cap; }
    if (next < 0) { short = -next; next = 0; }
    return { s: r6(next), spill: r6(spill), short: r6(short) };
  }
  function simReservoir(R, release) {
    var inflow = reservoirInflow(R), k = R.hours / 1000, s = R.start, stock = [s], outMW = [], spill = 0, short = 0, firstDry = -1, firstSpill = -1, dryWeeks = 0;
    inflow.forEach(function (q, w) {
      var st = stepStock(s, q * k, release * k, R.capacity);
      outMW.push(r6(release - st.short / k));
      if (st.short > 1e-9) { short += st.short; dryWeeks++; if (firstDry < 0) firstDry = w; }
      if (st.spill > 1e-9) { spill += st.spill; if (firstSpill < 0) firstSpill = w; }
      s = st.s; stock.push(s);
    });
    var avg = inflow.reduce(function (a, b) { return a + b; }, 0) / inflow.length;
    return { inMW: inflow, outMW: outMW, stock: stock, spill: r6(spill), short: r6(short), firstDry: firstDry, firstSpill: firstSpill, dryWeeks: dryWeeks,
             min: Math.min.apply(null, stock), max: Math.max.apply(null, stock), end: s, avgIn: r6(avg), release: release,
             won: spill < 1e-9 && short < 1e-9 };
  }
  function simBattery(B, chargeMW, dischargeMW) {
    var soc = B.start, stock = [soc], inMW = [], outMW = [], bought = 0, delivered = 0, refused = 0, short = 0, emptyAt = -1;
    for (var h = 0; h < 24; h++) {
      var askC = h >= B.charge.from && h < B.charge.to ? chargeMW : 0, askD = h >= B.discharge.from && h < B.discharge.to ? dischargeMW : 0;
      var store = Math.min(B.eta * askC, B.E - soc), take = store / B.eta;
      refused += askC - take; bought += take; soc = r6(soc + store);
      var give = Math.min(askD, soc);
      if (askD - give > 1e-9) { short += askD - give; if (emptyAt < 0) emptyAt = h; }
      delivered += give; soc = r6(soc - give);
      inMW.push(r6(take)); outMW.push(r6(give)); stock.push(soc);
    }
    bought = r6(bought); delivered = r6(delivered);
    return { inMW: inMW, outMW: outMW, stock: stock, bought: bought, stored: r6(bought * B.eta), lost: r6(bought * (1 - B.eta)), delivered: delivered,
             refused: r6(refused), short: r6(short), emptyAt: emptyAt, left: soc, peak: Math.max.apply(null, stock),
             won: delivered >= B.E - 1e-9 && short < 1e-9 };
  }
  function carbonPath(C, l35pct, nz) {
    var L = C.e0 * l35pct / 100, out = [];
    for (var y = C.start_year; y <= C.end_year; y++) {
      var e;
      if (y <= C.pivot_year) e = C.e0 + (L - C.e0) * (y - C.start_year) / (C.pivot_year - C.start_year);
      else if (nz >= C.nz.never) e = L;
      else e = y < nz ? L * (nz - y) / (nz - C.pivot_year) : 0;
      out.push(r6(e));
    }
    return out;
  }
  function simCarbon(C, l35pct, nz) {
    var e = carbonPath(C, l35pct, nz), s = 0, stock = [0], over = null;
    e.forEach(function (v, i) { s = r6(s + v); stock.push(s); if (over == null && s > C.budget + 1e-9) over = C.start_year + i; });
    var at = function (y) { return stock[y - C.start_year + 1]; };
    return { e: e, stock: stock, end: s, over: over, at: at, l35: l35pct, nz: nz, never: nz >= C.nz.never,
             won: s <= C.budget + 1e-9 };
  }
  // causal loops: the links along a loop's path (closing back to its start), and the loop's polarity from a set of signs
  function loopLinks(L, loop) {
    return loop.path.map(function (a, i) {
      var b = loop.path[(i + 1) % loop.path.length];
      return L.links.filter(function (l) { return l.from === a && l.to === b; })[0];
    });
  }
  function loopType(L, loop, signs) {
    var ls = loopLinks(L, loop), minus = 0;
    for (var i = 0; i < ls.length; i++) { var s = signs[ls[i].id]; if (s !== "+" && s !== "-") return null; if (s === "-") minus++; }
    return { type: minus % 2 ? "B" : "R", minus: minus, n: ls.length };
  }
  function gradeSigns(L, signs) {
    var wrong = L.links.filter(function (l) { return signs[l.id] !== l.sign; }).map(function (l) { return l.id; });
    return { right: L.links.length - wrong.length, total: L.links.length, wrong: wrong, set: L.links.filter(function (l) { return signs[l.id]; }).length };
  }
  function reboundKept(eng, pct) { return r6(eng * (1 - pct / 100)); }
  // the ripple: every effect of a lever up to a wave (0-based, inclusive); per node, the directions in order
  function ripple(lever, upTo) {
    var by = {}, eff = [];
    lever.waves.forEach(function (w, i) { if (i > upTo) return; w.effects.forEach(function (e) { eff.push({ node: e.node, dir: e.dir, from: e.from, why: e.why, wave: i }); (by[e.node] = by[e.node] || []).push(e.dir); }); });
    return { by: by, effects: eff };
  }
  function dimsReached(R, lever) {
    var dimOf = {}; R.nodes.forEach(function (n) { dimOf[n.id] = n.dim; });
    var seen = {}; ripple(lever, lever.waves.length - 1).effects.forEach(function (e) { seen[dimOf[e.node]] = true; });
    return R.dims.map(function (d) { return d.id; }).filter(function (d) { return seen[d]; });
  }
  function hubs(R) {
    var count = {};
    R.levers.forEach(function (lv) { Object.keys(ripple(lv, lv.waves.length - 1).by).forEach(function (n) { count[n] = (count[n] || 0) + 1; }); });
    return count;
  }
  var model = { reservoirInflow: reservoirInflow, stepStock: stepStock, simReservoir: simReservoir, simBattery: simBattery, carbonPath: carbonPath,
                simCarbon: simCarbon, loopLinks: loopLinks, loopType: loopType, gradeSigns: gradeSigns, reboundKept: reboundKept,
                ripple: ripple, dimsReached: dimsReached, hubs: hubs };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view helpers
  var LX = window.LX, H = LX.H, S = LX.S, LESSON = "f02-systems-and-map";
  var fx = function (v, d) { return (+v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var HH = function (h) { return (h < 10 ? "0" : "") + h + ":00"; };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function weekLabel(w) { var d = new Date(Date.UTC(2025, 0, 1) + w * 7 * 86400000); return "week " + (w + 1) + " (from " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + ")"; }
  function rich(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function loopName(lp) { return "Loop " + lp.id.replace(/^L/, ""); }
  function lower(s) { return s.replace(/^[A-Z](?=[a-z])/, function (c) { return c.toLowerCase(); }); }
  // keyboard focus survives a re-render: controls carry data-fk; refocus() finds the new copy
  function focusKey() { var a = document.activeElement; return a && a.getAttribute ? a.getAttribute("data-fk") : null; }
  function refocus(root, k) { if (!k) return; var e = root.querySelector('[data-fk="' + k + '"]'); if (e && !e.hidden && !e.disabled) e.focus({ preventScroll: true }); }
  function seg(host, label, items, sel, onPick) {
    var g = H("div", { class: "lx-seg f2-seg", role: "group", "aria-label": label }, host), bs = {};
    items.forEach(function (it) {
      var b = H("button", { type: "button", "data-fk": "seg-" + label + "-" + it.id, "aria-pressed": it.id === sel ? "true" : "false", html: (it.icon ? LX.icon(it.icon) : "") + "<span>" + LX.esc(it.label) + "</span>" + (it.done ? LX.icon("check", "f2-done") : "") }, g);
      b.addEventListener("click", function () { onPick(it.id); });
      bs[it.id] = b;
    });
    return { el: g, set: function (id) { Object.keys(bs).forEach(function (k) { bs[k].setAttribute("aria-pressed", k === id ? "true" : "false"); }); } };
  }

  // ---------------------------------------------------------------- StockFlow (i-stockflow; lesson-local)
  // The tub: a tank with an inflow pipe and an outflow pipe whose widths follow the flows, the level, a ceiling or budget
  // line, spill and empty marks. o: {kind, color, unit, flowUnit, max (tank top in stock units), ceiling, ceilingLabel,
  // inMax, outMax, lossFrac (battery), noOut (carbon)}
  function Tub(host, o) {
    var svg = S("svg", { viewBox: "0 0 300 220", class: "f2-tub", role: "img" }, host);
    function draw(st) {
      var top = 44, bot = 192, x0 = 96, x1 = 206, hgt = bot - top, frac = LX.clamp(st.stock / o.max, 0, 1), y = bot - hgt * frac;
      var wIn = st.inF > 0 ? 3 + 13 * Math.min(1, st.inF / o.inMax) : 0, wOut = st.outF > 0 ? 3 + 13 * Math.min(1, st.outF / o.outMax) : 0;
      var g = '<rect class="f2-tank-bg" x="' + x0 + '" y="' + top + '" width="' + (x1 - x0) + '" height="' + hgt + '" rx="6"/>' +
        '<rect class="f2-water" style="fill:' + o.color + '" x="' + (x0 + 2) + '" y="' + y.toFixed(1) + '" width="' + (x1 - x0 - 4) + '" height="' + (bot - y).toFixed(1) + '" rx="4"/>' +
        '<rect class="f2-tank" x="' + x0 + '" y="' + top + '" width="' + (x1 - x0) + '" height="' + hgt + '" rx="6"/>';
      if (o.ceiling != null) {
        var yc = bot - hgt * o.ceiling / o.max;
        g += '<path class="f2-cap" d="M' + (x0 - 6) + " " + yc.toFixed(1) + " H" + (x1 + 6) + '"/><text class="f2-t sm" x="' + (x1 + 8) + '" y="' + (yc + 4).toFixed(1) + '">' + LX.esc(o.ceilingLabel) + "</text>";
      }
      // inflow pipe (top left), outflow pipe (bottom right)
      g += '<path class="f2-pipe" d="M14 24 H' + (x0 + 26) + ' V' + (top + 10) + '"/>';
      if (wIn) g += '<path class="f2-flow in" style="stroke-width:' + wIn.toFixed(1) + '" d="M18 24 H' + (x0 + 26) + ' V' + (top + 6) + '"/><path class="f2-head in" d="M' + (x0 + 19) + " " + (top + 2) + " l7 10 l7 -10 z" + '"/>';
      g += '<text class="f2-t" x="14" y="14">' + LX.esc(o.inLabel) + ": " + LX.esc(st.inText) + "</text>";
      if (!o.noOut) {
        g += '<path class="f2-pipe" d="M' + x1 + " " + (bot - 14) + ' H286"/>';
        if (wOut) g += '<path class="f2-flow out" style="stroke-width:' + wOut.toFixed(1) + '" d="M' + x1 + " " + (bot - 14) + ' H276"/><path class="f2-head out" d="M276 ' + (bot - 21) + " l10 7 l-10 7 z" + '"/>';
        g += '<text class="f2-t" x="296" y="' + (bot + 12) + '" text-anchor="end">' + LX.esc(o.outLabel) + ": " + LX.esc(st.outText) + "</text>";
      } else g += '<text class="f2-t sm" x="' + (x1 + 6) + '" y="' + (bot - 4) + '">no way out</text>';
      if (o.lossFrac && st.inF > 0) g += '<path class="f2-loss" d="M' + (x0 + 34) + " " + (top + 18) + " C" + (x0 + 50) + " " + (top - 4) + " " + (x0 + 64) + " " + (top - 4) + " " + (x0 + 76) + " " + (top - 18) + '"/><text class="f2-t sm" x="' + (x0 + 62) + '" y="' + (top - 22) + '">' + Math.round(o.lossFrac * 100) + "% lost as heat</text>";
      if (st.spill) g += '<text class="f2-t warn" x="' + (x0 - 6) + '" y="' + (top + 12) + '" text-anchor="end">spilling</text>';
      if (st.short) g += '<text class="f2-t warn" x="' + (x0 - 6) + '" y="' + (bot - 4) + '" text-anchor="end">empty</text>';
      g += '<text class="f2-level" x="' + ((x0 + x1) / 2) + '" y="' + Math.min(bot - 10, Math.max(top + 24, y + (frac > 0.25 ? 24 : -8))).toFixed(1) + '" text-anchor="middle">' + LX.esc(st.stockText) + "</text>";
      g += '<text class="f2-t" x="' + ((x0 + x1) / 2) + '" y="214" text-anchor="middle">' + LX.esc(st.timeText) + "</text>";
      svg.innerHTML = g;
      svg.setAttribute("aria-label", "The stock at " + st.timeText + ": " + st.stockText + "; " + o.inLabel.toLowerCase() + " " + st.inText + (o.noOut ? "" : "; " + o.outLabel.toLowerCase() + " " + st.outText) + ".");
    }
    return { draw: draw };
  }

  function StockFlow(host, ctx) {
    var D = ctx.D.stockflow, st = ctx.st, el = H("div", { class: "f2-sf" }, host);
    var areaTub = H("div", { class: "f2-sf-tub" }, el), areaPanel = H("div", { class: "f2-sf-panel lx-play-panel" }, el), areaCharts = H("div", { class: "f2-sf-charts" }, el);
    var kinds = [{ id: "reservoir", label: D.reservoir.label, icon: D.reservoir.icon }, { id: "battery", label: D.battery.label, icon: D.battery.icon }, { id: "carbon", label: D.carbon.label, icon: D.carbon.icon }];
    var kind = st.sfKind || "reservoir", res = null, cursor = 0, timer = null, tub = null, pFlow = null, pStock = null;
    var tubBox = H("div", { class: "f2-tub-box" }, areaTub);
    var timeRow = H("div", { class: "f2-time" }, areaTub);
    var playB = H("button", { type: "button", class: "lx-btn small ghost", html: LX.icon("play") + "Play it" }, timeRow);
    var scrubId = LX.uid("f2t"), scrubL = H("label", { for: scrubId, class: "lx-sr", text: "Time" }, timeRow);
    var scrub = H("input", { type: "range", id: scrubId, min: 0, max: 1, step: 1, value: 0 }, timeRow);
    void scrubL;
    var segBox = H("div", null, areaPanel), task = H("p", { class: "f2-task" }, areaPanel), predBox = H("div", null, areaPanel);
    var ctlBox = H("div", { class: "lx-gctl" }, areaPanel), chips = H("div", { class: "lx-tallies f2-chips" }, areaPanel);
    var saw = H("div", { "aria-live": "polite" }, areaPanel), about = H("p", { class: "lx-hint f2-about" }, areaPanel);
    var segC = null;
    function paintSeg() {
      segBox.innerHTML = "";
      segC = seg(segBox, "Which stock", kinds.map(function (k) { return { id: k.id, label: k.label, icon: k.icon, done: !!(st.won || {})[k.id] }; }), kind, function (id) { var fk = focusKey(); kind = id; st.sfKind = id; ctx.save(); build(); refocus(el, fk); });
    }
    function chip(label, value, tone) { var t = H("div", { class: "lx-tally" + (tone ? " f2-" + tone : "") }, chips); H("span", { text: label }, t); H("b", { text: value }, t); }
    function setSaw(text, bad) { saw.innerHTML = ""; H("div", { class: "lx-saw" + (bad ? " no" : ""), html: LX.icon(bad ? "question" : "check") + "<div>" + rich(text) + "</div>" }, saw); }

    function build() {
      stop(); paintSeg(); ctlBox.innerHTML = ""; predBox.innerHTML = ""; saw.innerHTML = ""; tubBox.innerHTML = ""; areaCharts.innerHTML = "";
      var P = D[kind]; task.textContent = P.task; about.textContent = P.about;
      pFlow = LX.Plot(areaCharts, { caption: true, text: "Text version of the flow chart" });
      pStock = LX.Plot(areaCharts, { caption: true, text: "Text version of the stock chart" });
      var c = (st.ctl = st.ctl || {})[kind] = st.ctl[kind] || {};
      if (kind === "reservoir") {
        var avg = simReservoir(P, 0).avgIn;
        tub = Tub(tubBox, { color: "color-mix(in srgb, var(--lx-hyd) 45%, transparent)", max: P.capacity * 1.15, ceiling: P.capacity, ceilingLabel: "full: " + P.capacity + " GWh",
                            inMax: P.inflow.base + P.inflow.amp, outMax: P.release.max, inLabel: "River in", outLabel: "Release" });
        if (c.release == null) c.release = P.release.start;
        LX.Slider(ctlBox, { label: "Release through the turbines (steady)", color: "var(--lx-hyd)", min: P.release.min, max: P.release.max, step: P.release.step, value: c.release,
          fmt: function (v) { return v + " MW"; }, hint: function () { return "The river brings " + fx(avg, 0) + " MW on average over the year."; },
          onChange: function (v) { c.release = v; ctx.save(); run(); } });
      } else if (kind === "battery") {
        tub = Tub(tubBox, { color: "color-mix(in srgb, var(--lx-bat) 55%, transparent)", max: P.E * 1.15, ceiling: P.E, ceilingLabel: "full: " + P.E + " MWh",
                            inMax: P.P, outMax: P.P, inLabel: "Charging", outLabel: "Discharging", lossFrac: 1 - P.eta });
        if (c.c == null) c.c = P.chargeMW.start; if (c.d == null) c.d = P.dischargeMW.start;
        LX.Slider(ctlBox, { label: "Charge, " + HH(P.charge.from) + " to " + HH(P.charge.to), color: "var(--lx-bat)", min: P.chargeMW.min, max: P.chargeMW.max, step: P.chargeMW.step, value: c.c,
          fmt: function (v) { return v + " MW"; }, onChange: function (v) { c.c = v; ctx.save(); run(); } });
        LX.Slider(ctlBox, { label: "Discharge, " + HH(P.discharge.from) + " to " + HH(P.discharge.to), color: "var(--lx-cc)", min: P.dischargeMW.min, max: P.dischargeMW.max, step: P.dischargeMW.step, value: c.d,
          fmt: function (v) { return v + " MW"; }, onChange: function (v) { c.d = v; ctx.save(); run(); } });
      } else {
        tub = Tub(tubBox, { color: "color-mix(in srgb, var(--lx-ink-3) 40%, transparent)", max: P.budget * 2.2, ceiling: P.budget, ceilingLabel: "budget: " + fx(P.budget) + " Mt",
                            inMax: P.e0, outMax: 1, inLabel: "Emissions", outLabel: "", noOut: true });
        if (c.l35 == null) c.l35 = P.l35.start; if (c.nz == null) c.nz = P.nz.start;
        var sliders = [];
        var enable = function (on) { sliders.forEach(function (s) { s.disable(!on); }); };
        sliders.push(LX.Slider(ctlBox, { label: "Emissions in " + P.pivot_year + ", share of " + P.start_year, color: "var(--lx-ink-3)", min: P.l35.min, max: P.l35.max, step: P.l35.step, value: c.l35,
          fmt: function (v) { return v + "%"; }, onChange: function (v) { c.l35 = v; ctx.save(); run(); } }));
        sliders.push(LX.Slider(ctlBox, { label: "Net-zero year", color: "var(--lx-good)", min: P.nz.min, max: P.nz.max, step: P.nz.step, value: c.nz,
          fmt: function (v) { return v >= P.nz.never ? "never" : String(v); }, onChange: function (v) { c.nz = v; ctx.save(); run(); } }));
        var pr = P.predict;
        if (!st.pred) {
          enable(false);
          var box = H("div", { class: "f2-pred" }, predBox);
          H("p", { class: "lx-q", text: pr.q }, box);
          var pp = LX.Predict(box, { id: pr.id, answer: pr.answer, fresh: true, options: pr.options, title: false,
            onPick: function (v) {
              st.pred = v; c.l35 = pr.l35; c.nz = pr.nz; ctx.save();
              sliders[0].set(pr.l35); sliders[1].set(pr.nz); enable(true); run();
              var r = res;
              pp.reveal("The stock goes from " + fx(r.at(P.pivot_year)) + " Mt at the end of " + P.pivot_year + " to " + fx(r.end) + " Mt at the end of " + P.end_year + ": a smaller inflow is still an inflow.");
            } });
        }
      }
      scrub.max = kind === "reservoir" ? P.steps : kind === "battery" ? 24 : P.end_year - P.start_year + 1;
      run();
    }
    function run() {
      var P = D[kind], c = st.ctl[kind];
      res = kind === "reservoir" ? simReservoir(P, c.release) : kind === "battery" ? simBattery(P, c.c, c.d) : simCarbon(P, c.l35, c.nz);
      cursor = focus(); scrub.value = cursor;
      charts(); judge(); show(cursor);
    }
    function focus() {
      var n = res.stock.length - 1;
      if (kind === "carbon") return n;
      if (kind === "reservoir" && (res.firstDry >= 0 || res.firstSpill >= 0)) return Math.min.apply(null, [res.firstDry, res.firstSpill].filter(function (x) { return x >= 0; })) + 1;
      if (kind === "battery" && res.emptyAt >= 0) return res.emptyAt + 1;
      return res.stock.indexOf(Math.max.apply(null, res.stock));
    }
    function xSpec() {
      var P = D[kind];
      if (kind === "reservoir") return { min: 0, max: P.steps, ticks: [[0, "Jan"], [13, "Apr"], [26, "Jul"], [39, "Oct"], [52, "Dec 31"]], ticksN: [[0, "Jan"], [26, "Jul"], [52, "Dec 31"]] };
      if (kind === "battery") return { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]] };
      return { min: P.start_year, max: P.end_year + 1, ticks: [[P.start_year, String(P.start_year)], [P.pivot_year, String(P.pivot_year)], [2050, "2050"], [P.end_year + 1, String(P.end_year + 1)]],
               ticksN: [[P.start_year, String(P.start_year)], [2050, "2050"], [P.end_year + 1, String(P.end_year + 1)]] };
    }
    function charts() {
      var P = D[kind], x = xSpec(), x0 = x.min, mark = [{ x: x0 + cursor, vline: true }];
      if (kind === "reservoir") {
        pFlow.render({ caption: "The flows: river in and release out (MW, weekly averages)", x: x, y: { min: 0, max: 400, step: 100, fmt: fx, unit: "MW" }, height: 170, heightN: 150,
          lines: [{ values: res.inMW, step: 1, color: "var(--lx-hyd)", area: 0.12 }, { values: res.outMW, step: 1, color: "var(--lx-ink)", width: 2 }],
          marks: mark, legend: [{ label: "River in", color: "var(--lx-hyd)" }, { label: "Release out", color: "var(--lx-ink)" }],
          aria: "River inflow and release, week by week", text: { head: ["Week", "River in (MW)", "Release (MW)"], rows: res.inMW.map(function (v, i) { return [i + 1, fx(v), fx(res.outMW[i])]; }) } });
        pStock.render({ caption: "The stock: water in the reservoir (GWh)", x: x, y: { min: 0, max: 400, step: 100, fmt: fx, unit: "GWh" }, height: 170, heightN: 150,
          lines: [{ values: res.stock, color: "var(--lx-hyd)", area: 0.18, width: 2.6 }], refs: [{ y: P.capacity, label: "full", dash: "5 4" }], marks: mark,
          aria: "Water in the reservoir, week by week", text: { head: ["End of week", "Stock (GWh)"], rows: res.stock.slice(1).map(function (v, i) { return [i + 1, fx(v)]; }) } });
      } else if (kind === "battery") {
        pFlow.render({ caption: "The flows: charging in and discharging out (MW)", x: x, y: { min: 0, max: 30, step: 10, fmt: fx, unit: "MW" }, height: 170, heightN: 150,
          lines: [{ values: res.inMW, step: 1, color: "var(--lx-bat)", area: 0.15 }, { values: res.outMW, step: 1, color: "var(--lx-cc)", area: 0.15 }],
          marks: mark, legend: [{ label: "Charging (bought)", color: "var(--lx-bat)" }, { label: "Discharging (delivered)", color: "var(--lx-cc)" }],
          aria: "Charging and discharging, hour by hour", text: { head: ["Hour", "Charging (MW)", "Discharging (MW)"], rows: res.inMW.map(function (v, i) { return [HH(i), fx(v), fx(res.outMW[i])]; }) } });
        pStock.render({ caption: "The stock: energy in the battery (MWh)", x: x, y: { min: 0, max: 120, step: 20, fmt: fx, unit: "MWh" }, height: 170, heightN: 150,
          lines: [{ values: res.stock, color: "var(--lx-bat)", area: 0.18, width: 2.6 }], refs: [{ y: P.E, label: "full", dash: "5 4" }], marks: mark,
          aria: "Energy in the battery, hour by hour", text: { head: ["End of hour", "Stored (MWh)"], rows: res.stock.slice(1).map(function (v, i) { return [HH(i + 1), fx(v)]; }) } });
      } else {
        var top = Math.max(2000, Math.ceil(Math.max.apply(null, res.stock) / 1000) * 1000);
        pFlow.render({ caption: "The flow: Prairieland's CO₂ emissions (Mt a year)", x: x, y: { min: 0, max: 120, step: 20, fmt: fx, unit: "Mt/yr" }, height: 170, heightN: 150,
          lines: [{ values: res.e, x0: P.start_year, step: 1, color: "var(--lx-ink-3)", area: 0.15 }], marks: mark,
          aria: "Prairieland's emissions, year by year", text: { head: ["Year", "Emissions (Mt)"], rows: res.e.map(function (v, i) { return [P.start_year + i, fx(v, 1)]; }) } });
        pStock.render({ caption: "The stock: CO₂ emitted since the start of " + P.start_year + " (Mt)", x: x, y: { min: 0, max: top, step: top / 4, fmt: fx, unit: "Mt" }, height: 170, heightN: 150,
          lines: [{ values: res.stock, x0: P.start_year, color: "var(--lx-ink-2)", area: 0.15, width: 2.6 }], refs: [{ y: P.budget, label: "budget", dash: "5 4", color: "var(--lx-bad)" }], marks: mark,
          aria: "Cumulative CO₂ since 2025", text: { head: ["End of year", "Cumulative (Mt)"], rows: res.stock.slice(1).map(function (v, i) { return [P.start_year + i, fx(v)]; }) } });
      }
    }
    function show(k) {
      cursor = k; var P = D[kind], i = Math.max(0, Math.min(res.stock.length - 2, k - 1)), s = res.stock[k];
      var t = kind === "reservoir" ? (k === 0 ? "start of the year" : "end of week " + k) : kind === "battery" ? HH(k) : (k === 0 ? "start of " + P.start_year : "end of " + (P.start_year + k - 1));
      var inF = kind === "carbon" ? res.e[i] : res.inMW[i], outF = kind === "carbon" ? 0 : res.outMW[i];
      var u = kind === "reservoir" ? " GWh" : kind === "battery" ? " MWh" : " Mt";
      var spill = kind === "reservoir" && k > 0 && s >= P.capacity - 1e-9 && res.inMW[i] > res.outMW[i];
      var short = kind !== "carbon" && k > 0 && s <= 1e-9 && (kind === "reservoir" ? res.outMW[i] < res.release - 1e-9 : (st.ctl.battery.d > res.outMW[i] + 1e-9 && i >= P.discharge.from && i < P.discharge.to));
      tub.draw({ stock: s, inF: inF, outF: outF, inText: fx(inF, kind === "carbon" ? 0 : 0) + (kind === "carbon" ? " Mt/yr" : " MW"), outText: fx(outF) + " MW",
                 stockText: fx(s) + u, timeText: t, spill: spill, short: short });
      if (pFlow && pFlow.spec()) { var m = [{ x: xSpec().min + k, vline: true }]; var a = pFlow.spec(), b = pStock.spec(); a.marks = m; b.marks = m; pFlow.render(a); pStock.render(b); }
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; playB.innerHTML = LX.icon("play") + "Play it"; } }
    playB.addEventListener("click", function () {
      if (timer) { stop(); return; }
      var n = res.stock.length - 1;
      if (LX.reduced()) { scrub.value = n; show(n); return; }
      var k = 0; playB.innerHTML = "Stop";
      timer = setInterval(function () { scrub.value = k; show(k); k++; if (k > n) stop(); }, n > 30 ? 70 : 160);
    });
    scrub.addEventListener("input", function () { stop(); show(+scrub.value); });
    function judge() {
      var P = D[kind]; chips.innerHTML = ""; var won = res.won, msg, bad = !won;
      if (kind === "reservoir") {
        chip("Lowest", fx(res.min) + " GWh", res.short ? "bad" : null); chip("Highest", fx(res.max) + " GWh", res.spill ? "bad" : null); chip("End of year", fx(res.end) + " GWh");
        if (res.short) msg = "The reservoir runs dry in " + weekLabel(res.firstDry) + ". The river brings " + fx(res.avgIn) + " MW on average, and a steady release above that drains the stock. Try less.";
        else if (res.spill) msg = "It spills " + fx(res.spill) + " GWh, from " + weekLabel(res.firstSpill) + ": the spring flood is more than the reservoir can hold at this release. Try more.";
        else msg = "No spill, never dry. Your release of **" + res.release + " MW** against an average inflow of " + fx(res.avgIn) + " MW ends the year at " + fx(res.end) + " GWh (it started at " + P.start + "). The stock moved spring's water into summer, autumn and winter.";
      } else if (kind === "battery") {
        chip("Bought", fx(res.bought) + " MWh"); chip("Stored", fx(res.stored) + " MWh"); chip("Delivered", fx(res.delivered) + " MWh", res.short ? "bad" : null);
        if (res.short) msg = "The battery runs empty at " + HH(res.emptyAt) + ": it stored only " + fx(res.stored) + " MWh, so " + fx(res.short) + " MWh of the evening's request could not be met. Charge more, or ask for less.";
        else if (won) msg = "You bought " + fx(res.bought) + " MWh, stored " + fx(res.stored) + " (" + fx(res.lost) + " lost as heat) and delivered **" + fx(res.delivered) + " MWh**: " + st.ctl.battery.d + " MW for 4 hours. MW is the flow; MWh is the stock.";
        else msg = "No shortfall, but only " + fx(res.delivered) + " MWh delivered" + (res.left > 1e-9 ? " and " + fx(res.left) + " MWh left unused" : "") + ". The battery holds " + P.E + " MWh: can you deliver all of it?";
      } else {
        chip("Emitted " + P.start_year + "–" + P.end_year, fx(res.end) + " Mt", won ? null : "bad"); chip("Budget", fx(P.budget) + " Mt"); chip(P.end_year + " emissions", fx(res.e[res.e.length - 1], 1) + " Mt/yr");
        if (!st.pred) { msg = "Make your prediction first."; bad = true; }
        else if (won) msg = "Within the [[carbon-budget|carbon budget]]: " + fx(res.end) + " Mt by " + P.end_year + ". The stock stops rising only in " + res.nz + ", when emissions reach zero; every year before adds to it.";
        else msg = "Over the budget from " + res.over + ": the stock keeps rising as long as emissions are above zero" + (res.never ? ", and with no net-zero year they never are." : ". Cut sooner, or reach zero earlier.");
      }
      setSaw(msg, bad);
      if (won && (kind !== "carbon" || st.pred)) { (st.wonAt = st.wonAt || {})[kind] = JSON.parse(JSON.stringify(st.ctl[kind])); ctx.save(); }
      if (won && !(st.won || {})[kind] && (kind !== "carbon" || st.pred)) { var fk = focusKey(); (st.won = st.won || {})[kind] = true; ctx.save(); paintSeg(); ctx.note(); refocus(el, fk); }
      ctx.progress();
    }
    paintSeg(); build();
    return { el: el, pick: function (k) { kind = k; st.sfKind = k; build(); }, set: function (k, c) { kind = k; st.sfKind = k; st.ctl = st.ctl || {}; st.ctl[k] = c; build(); } };
  }

  // ---------------------------------------------------------------- LoopBuilder (i-cld; lesson-local; static mode for e-loop)
  function cldSVG(host, L, o) {
    var svg = S("svg", { viewBox: "0 0 420 300", class: "f2-cld", role: "img", "aria-label": o.aria || L.label }, host), mk = LX.uid("f2m");
    var defs = S("defs", null, svg), m = S("marker", { id: mk, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
    S("path", { d: "M0 1 L9 5 L0 9 z", class: "f2-arrowhead" }, m);
    var by = {}, size = {}, cx = 210, cy = 155;
    L.nodes.forEach(function (n) { by[n.id] = n; var lines = n.lines || [n.label]; size[n.id] = [Math.max.apply(null, lines.map(function (t) { return t.length; })) * 7.9 + 20, 12 + lines.length * 17]; });
    function edgePt(p, q, s) { var dx = q[0] - p[0], dy = q[1] - p[1]; var tx = dx ? (s[0] / 2 + 3) / Math.abs(dx) : 1e9, ty = dy ? (s[1] / 2 + 3) / Math.abs(dy) : 1e9, t = Math.min(tx, ty, 1); return [p[0] + dx * t, p[1] + dy * t]; }
    var eg = S("g", null, svg), ng = S("g", null, svg), lg = S("g", null, svg), linkEls = {}, badges = {}, loopEls = {};
    L.links.forEach(function (l) {
      var a = by[l.from].at, b = by[l.to].at, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
      var nx = -dy / len, ny = dx / len; if ((mx + nx - cx) * (mx + nx - cx) + (my + ny - cy) * (my + ny - cy) < (mx - nx - cx) * (mx - nx - cx) + (my - ny - cy) * (my - ny - cy)) { nx = -nx; ny = -ny; }
      var k = 0.16 * len, c = [mx + nx * k, my + ny * k];
      var p1 = edgePt(a, c, size[l.from]), p2 = edgePt(b, c, size[l.to]);
      var g = S("g", { class: "f2-link" }, eg);
      S("path", { d: "M" + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + " Q" + c[0].toFixed(1) + " " + c[1].toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1), "marker-end": "url(#" + mk + ")" }, g);
      var bx = 0.25 * p1[0] + 0.5 * c[0] + 0.25 * p2[0], by2 = 0.25 * p1[1] + 0.5 * c[1] + 0.25 * p2[1];
      var bd = S("g", { class: "f2-badge" }, g); S("circle", { cx: bx.toFixed(1), cy: by2.toFixed(1), r: 10 }, bd);
      var t = S("text", { x: bx.toFixed(1), y: (by2 + 4.5).toFixed(1), "text-anchor": "middle" }, bd); t.textContent = "?";
      linkEls[l.id] = g; badges[l.id] = t;
    });
    L.nodes.forEach(function (n) {
      var s = size[n.id], p = n.at, lines = n.lines || [n.label], g = S("g", { class: "f2-cnode" }, ng);
      S("rect", { x: (p[0] - s[0] / 2).toFixed(1), y: (p[1] - s[1] / 2).toFixed(1), width: s[0].toFixed(1), height: s[1], rx: 9 }, g);
      lines.forEach(function (ln, i) { var tt = S("text", { x: p[0], y: (p[1] - (lines.length - 1) * 8.5 + i * 17 + 5).toFixed(1), "text-anchor": "middle" }, g); tt.textContent = ln; });
    });
    L.loops.forEach(function (lp) {
      var g = S("g", { class: "f2-loopmark " + lp.type }, lg);
      S("path", { d: "M" + (lp.at[0] + 13) + " " + lp.at[1] + " A13 13 0 1 1 " + lp.at[0] + " " + (lp.at[1] - 13), class: "arc" }, g);
      var tt = S("text", { x: lp.at[0], y: lp.at[1] + 5, "text-anchor": "middle" }, g); tt.textContent = o.static ? lp.type : "?";
      loopEls[lp.id] = { g: g, t: tt };
    });
    function signs(sg, checked) {
      L.links.forEach(function (l) {
        var v = sg[l.id], g = linkEls[l.id];
        badges[l.id].textContent = v === "+" ? "+" : v === "-" ? "−" : "?";
        g.classList.toggle("pos", v === "+"); g.classList.toggle("neg", v === "-");
        g.classList.toggle("ok", !!checked && v === l.sign); g.classList.toggle("no", !!checked && v !== l.sign);
      });
    }
    function loopLabel(id, text) { loopEls[id].t.textContent = text; }
    function light(loop) {
      var on = {}; if (loop) loopLinks(L, loop).forEach(function (l) { if (l) on[l.id] = true; });
      L.links.forEach(function (l) { linkEls[l.id].classList.toggle("lit", !!on[l.id]); linkEls[l.id].classList.toggle("dim", !!loop && !on[l.id]); });
      L.loops.forEach(function (lp) { loopEls[lp.id].g.classList.toggle("lit", !!loop && lp.id === loop.id); });
    }
    if (o.static) { var ref = {}; L.links.forEach(function (l) { ref[l.id] = l.sign; }); signs(ref); }
    return { svg: svg, signs: signs, loopLabel: loopLabel, light: light };
  }
  // a behaviour-over-time sketch: R = growth that feeds itself (or decline); B = settles toward a level (illustrative shapes)
  function sketch(host, type) {
    var d = type === "R" ? "M14 70 C60 68 92 60 116 46 C134 34 146 20 154 8" : "M14 70 C34 34 58 22 92 18 C118 16 136 15 154 15";
    var svg = S("svg", { viewBox: "0 0 168 84", class: "f2-sketch " + type, role: "img", "aria-label": type === "R" ? "Typical behaviour of a reinforcing loop: growth that feeds itself" : "Typical behaviour of a balancing loop: it settles toward a level" }, host);
    svg.innerHTML = '<path class="ax" d="M12 6 V74 H160"/>' + (type === "B" ? '<path class="goal" d="M12 15 H160"/>' : "") + '<path class="cv" d="' + d + '"/>' +
      '<text x="16" y="82">time</text>';
    return svg;
  }

  function LoopBuilder(host, ctx) {
    var D = ctx.D.loops, st = ctx.st, el = H("div", { class: "lx-play f2-lb" }, host);
    var stage = H("div", { class: "f2-lb-stage" }, el), panel = H("div", { class: "lx-play-panel" }, el);
    var which = st.lbWhich || "ev", cld = null;
    st.loops = st.loops || {};
    function build() {
      stage.innerHTML = ""; panel.innerHTML = "";
      var L = D[which], S0 = st.loops[which] = st.loops[which] || { signs: {}, checked: false, named: {} };
      seg(panel, "Which diagram", [{ id: "ev", label: D.ev.label, done: !!(st.loops.ev || {}).done }, { id: "rebound", label: D.rebound.label, done: !!(st.loops.rebound || {}).done }], which,
        function (id) { var fk = focusKey(); which = id; st.lbWhich = id; ctx.save(); build(); refocus(el, fk); });
      H("p", { class: "f2-task", text: L.lede }, panel);
      cld = cldSVG(stage, L, { aria: "Causal-loop diagram: " + L.label + ". The links and their signs are listed beside it." });
      var bh = H("div", { class: "f2-behave" }, stage);
      H("p", { class: "lx-hint", html: "This is a <span class=\"lx-term\" data-term=\"causal-loop-diagram\">causal-loop diagram</span>. Sign each arrow: <b>+</b> if more of the cause brings more of the effect, <b>−</b> if more brings less." }, panel);
      var list = H("ul", { class: "f2-links" }, panel), rows = {};
      var byN = {}; L.nodes.forEach(function (n) { byN[n.id] = n; });
      L.links.forEach(function (l) {
        var li = H("li", null, list), txt = H("span", { class: "t", html: LX.esc(byN[l.from].label) + " <span aria-hidden='true'>→</span><span class='lx-sr'> to </span> " + LX.esc(byN[l.to].label) }, li);
        var g = H("span", { class: "f2-pm", role: "group", "aria-label": "Sign of the link from " + byN[l.from].label + " to " + byN[l.to].label }, li);
        var bp = H("button", { type: "button", class: "f2-pmb", "aria-pressed": "false", "aria-label": "plus: more brings more", text: "+" }, g);
        var bm = H("button", { type: "button", class: "f2-pmb", "aria-pressed": "false", "aria-label": "minus: more brings less", text: "−" }, g);
        var why = H("span", { class: "why" }, li);
        [[bp, "+"], [bm, "-"]].forEach(function (x) { x[0].addEventListener("click", function () { S0.signs[l.id] = x[1]; S0.checked = false; ctx.save(); paint(); }); });
        rows[l.id] = { li: li, bp: bp, bm: bm, why: why, txt: txt };
      });
      var foot = H("div", { class: "lx-step-foot" }, panel);
      var chk = H("button", { type: "button", class: "lx-btn small", "data-fk": "chk", text: "Check my signs" }, foot);
      var score = H("span", { class: "lx-hint", "aria-live": "polite" }, foot);
      var nameBox = H("div", { class: "f2-name" }, panel), saw = H("div", { "aria-live": "polite" }, panel), extra = H("div", null, panel);
      chk.addEventListener("click", function () { S0.checked = true; ctx.save(); paint(); });
      function paint() {
        var g = gradeSigns(L, S0.signs);
        L.links.forEach(function (l) {
          var r = rows[l.id], v = S0.signs[l.id];
          r.bp.setAttribute("aria-pressed", v === "+" ? "true" : "false"); r.bm.setAttribute("aria-pressed", v === "-" ? "true" : "false");
          r.li.className = S0.checked && v ? (v === l.sign ? "ok" : "no") : "";
          r.why.textContent = S0.checked && v ? (v === l.sign ? "" : "Not quite. ") + l.why : "";
        });
        cld.signs(S0.signs, S0.checked);
        score.textContent = S0.checked ? (g.set < g.total ? "Sign every arrow first: " + (g.total - g.set) + " to go." : g.right + " of " + g.total + " signs match.") : "";
        names(g);
      }
      function names(g) {
        nameBox.innerHTML = ""; saw.innerHTML = "";
        if (!S0.checked || g.set < g.total) { cld.light(null); return; }
        H("p", { class: "f2-sub", text: "Now name each loop. Follow its arrows round, and count the − links." }, nameBox);
        L.loops.forEach(function (lp) {
          var row = H("div", { class: "f2-loopq" }, nameBox), mine = loopType(L, lp, S0.signs);
          var nm = lp.path.map(function (id) { return byN[id].label; });
          H("p", { class: "path", html: "<b>" + loopName(lp) + ":</b> " + LX.esc(nm.concat([nm[0]]).join(" → ")) }, row);
          var ch = H("div", { class: "lx-choices-row", role: "group", "aria-label": "Name the loop through " + nm.join(", ") }, row);
          [["R", "Reinforcing"], ["B", "Balancing"]].forEach(function (x) {
            var b = H("button", { type: "button", class: "lx-choice", "data-fk": "name-" + lp.id + "-" + x[0], "aria-pressed": S0.named[lp.id] === x[0] ? "true" : "false", text: x[1] }, ch);
            b.addEventListener("click", function () { var fk = focusKey(); S0.named[lp.id] = x[0]; ctx.save(); cld.light(lp); names(gradeSigns(L, S0.signs)); refocus(el, fk); });
            b.addEventListener("focus", function () { cld.light(lp); });
          });
          var pick = S0.named[lp.id];
          if (pick) {
            var ok = pick === lp.type;
            H("p", { class: "f2-verdict " + (ok ? "ok" : "no"), html: (ok ? LX.icon("check") + "<b>Right.</b> " : LX.icon("question") + "<b>Not quite.</b> ") +
              "Your signs on this loop have " + mine.minus + " − link" + (mine.minus === 1 ? "" : "s") + ": " + (mine.minus % 2 ? "odd, so balancing" : "even, so reinforcing") + ". " + rich(lp.why) }, row);
            cld.loopLabel(lp.id, ok ? lp.type : "?");
          } else cld.loopLabel(lp.id, "?");
        });
        var all = g.right === g.total && L.loops.every(function (lp) { return S0.named[lp.id] === lp.type; });
        bh.innerHTML = "";
        if (all) {
          L.loops.forEach(function (lp) { var f = H("figure", { class: "f2-fig" }, bh); sketch(f, lp.type); H("figcaption", { text: loopName(lp) + (lp.type === "R" ? ", reinforcing: growth or decline that feeds itself" : ", balancing: settles toward a level") }, f); });
          if (!S0.done) { var fk = focusKey(); S0.done = true; ctx.save(); ctx.note(); build(); refocus(el, fk); return; }
          var src = ctx.D.sources;
          H("div", { class: "lx-saw", html: LX.icon("check") + "<div>" + rich(which === "ev"
            ? "Both [[feedback-loop|feedback loops]] closed. Which one wins depends on their strength and delays. Researchers have measured this loop: EV sales and chargers fed each other in " + src.li_ev.value + " U.S. metro areas, 2011 to 2013 (Li et al., 2017)."
            : "Loop closed. The [[rebound-effect|rebound effect]] takes back part of the saving, not all of it: move the slider.") + "</div>" }, saw);
          if (which === "rebound") rebound(extra);
        } else extra.innerHTML = "";
      }
      paint();
    }
    function rebound(host) {
      host.innerHTML = "";
      var R = D.rebound.rebound, src = ctx.D.sources.sorrell_rebound, box = H("div", { class: "f2-rb" }, host);
      if (st.rb == null) st.rb = R.start;
      var bars = H("div", { class: "f2-rb-bars", "aria-live": "polite" }, box);
      LX.Slider(box, { label: "Rebound: share of the saving taken back", color: "var(--lx-warn)", min: R.min, max: R.max, step: R.step, value: st.rb,
        fmt: function (v) { return v + "%"; }, hint: function () { return "Reviews put the direct rebound for most household energy services in OECD countries below " + src.value + "% (Sorrell et al., 2009)."; },
        onChange: function (v) { st.rb = v; ctx.save(); draw(); } });
      function draw() {
        var kept = reboundKept(R.engineering, st.rb);
        bars.innerHTML = "";
        [["Engineers' estimate", R.engineering, "eng"], ["Kept after the rebound", kept, "kept"], ["Taken back", R.engineering - kept, "back"]].forEach(function (b) {
          var row = H("div", { class: "f2-rb-row " + b[2] }, bars); H("span", { class: "l", text: b[0] }, row);
          var tr = H("span", { class: "tr" }, row); H("i", { style: "width:" + (b[1] / R.engineering * 100) + "%" }, tr); H("b", { text: fx(b[1]) + " units" }, row);
        });
      }
      draw();
    }
    build();
    return { el: el, pick: function (w) { which = w; st.lbWhich = w; build(); } };
  }

  // ---------------------------------------------------------------- RippleMap (i-ripple; lesson-local)
  function RippleMap(host, ctx) {
    var R = ctx.D.ripple, st = ctx.st, el = H("div", { class: "f2-rm" }, host);
    var dirs = R.dirs, dimBy = {}, nodeBy = {}; R.dims.forEach(function (d) { dimBy[d.id] = d; }); R.nodes.forEach(function (n) { nodeBy[n.id] = n; });
    st.levers = st.levers || {}; st.preds = st.preds || {};
    var levRow = H("div", { class: "f2-levers", role: "group", "aria-label": "Levers" }, el), levBtn = {};
    H("span", { class: "f2-levl", text: "Pull a lever:" }, levRow);
    R.levers.forEach(function (lv) {
      var b = H("button", { type: "button", class: "f2-lever", "aria-pressed": "false", html: LX.icon(lv.icon) + "<span>" + LX.esc(lv.label) + "</span>" }, levRow);
      b.addEventListener("click", function () { pull(lv.id); });
      levBtn[lv.id] = b;
    });
    var map = H("div", { class: "f2-map" }, el), svg = S("svg", { class: "f2-edges", "aria-hidden": "true" }, map), mk = LX.uid("f2r");
    var src = H("div", { class: "f2-src", "aria-hidden": "true" }, map);
    var lanes = H("div", { class: "f2-lanes" }, map), nodeEl = {};
    R.dims.forEach(function (d) {
      var ln = H("div", { class: "f2-lane", style: "--c:var(--f2-" + d.id + ")" }, lanes);
      H("p", { class: "f2-lane-h", text: d.label }, ln);
      var list = H("div", { class: "f2-lane-n" }, ln);
      R.nodes.filter(function (n) { return n.dim === d.id; }).forEach(function (n) {
        var b = H("button", { type: "button", class: "f2-node", "data-id": n.id }, list);
        H("span", { class: "nl", text: n.label }, b); H("span", { class: "bd", "aria-hidden": "true" }, b);
        b.addEventListener("click", function () { info(n.id); });
        nodeEl[n.id] = b;
      });
    });
    var panel = H("div", { class: "f2-rpanel" }, el), live = H("div", { "aria-live": "polite" }, panel), say = H("p", { class: "lx-sr", "aria-live": "polite" }, el);
    var lever = null, wave = -1, showHubs = false;
    function pull(id) {
      lever = R.levers.filter(function (l) { return l.id === id; })[0]; showHubs = false;
      Object.keys(levBtn).forEach(function (k) { levBtn[k].setAttribute("aria-pressed", k === id ? "true" : "false"); });
      wave = st.preds[id] ? Math.min(lever.waves.length - 1, Math.max(0, (st.levers[id] || 1) - 1)) : -1;
      src.innerHTML = LX.icon(lever.icon) + "<span>" + LX.esc(lever.label) + "</span>"; src.classList.add("on");
      render();
    }
    function nodeState() { return lever && wave >= 0 ? ripple(lever, wave).by : {}; }
    function render() {
      var by = nodeState(), hub = showHubs ? hubs(R) : null;
      R.nodes.forEach(function (n) {
        var b = nodeEl[n.id], ds = by[n.id] || [], bd = b.querySelector(".bd");
        var cur = lever && wave >= 0 ? ripple(lever, wave).effects.filter(function (e) { return e.node === n.id && e.wave === wave; }).length : 0;
        b.classList.toggle("hit", !hub && ds.length > 0); b.classList.toggle("now", !hub && cur > 0);
        b.classList.toggle("hub", !!hub && hub[n.id] === R.levers.length);
        bd.textContent = hub ? (hub[n.id] ? "×" + hub[n.id] : "") : ds.map(function (d) { return dirs[d].sym; }).join("");
        b.setAttribute("aria-label", n.label + ", " + dimBy[n.dim].label + (hub ? ": touched by " + (hub[n.id] || 0) + " of " + R.levers.length + " levers" : ds.length ? ": " + ds.map(function (d) { return dirs[d].word; }).join(", then ") : ""));
      });
      Object.keys(levBtn).forEach(function (k) { levBtn[k].classList.toggle("done", (st.levers[k] || 0) >= 3); });
      edges(); panelView(); ctx.progress();
    }
    function edges() {
      svg.innerHTML = '<defs><marker id="' + mk + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" class="f2-arrowhead"/></marker></defs>';
      if (!lever || wave < 0 || showHubs || !LX.visible(map) || (window.matchMedia && window.matchMedia("(max-width: 860px)").matches)) return;   // stacked lanes: the list says "via"
      var box = map.getBoundingClientRect();
      svg.setAttribute("viewBox", "0 0 " + box.width.toFixed(0) + " " + box.height.toFixed(0));
      var rect = function (e) { var r = e.getBoundingClientRect(); return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, cx: r.left - box.left + r.width / 2, cy: r.top - box.top + r.height / 2 }; };
      ripple(lever, wave).effects.forEach(function (e) {
        var a = rect(e.from === "lever" ? src : nodeEl[e.from]), b = rect(nodeEl[e.node]);
        var p1 = clip(a, b.cx, b.cy), p2 = clip(b, a.cx, a.cy), mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2 - Math.min(40, Math.abs(p1[0] - p2[0]) * 0.12);
        S("path", { d: "M" + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + " Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1),
                    class: "f2-redge " + e.dir + (e.wave === wave ? " now" : ""), "marker-end": "url(#" + mk + ")" }, svg);
      });
    }
    function clip(r, tx, ty) { var dx = tx - r.cx, dy = ty - r.cy, sx = dx ? (r.w / 2 + 2) / Math.abs(dx) : 1e9, sy = dy ? (r.h / 2 + 2) / Math.abs(dy) : 1e9, t = Math.min(sx, sy, 1); return [r.cx + dx * t, r.cy + dy * t]; }
    function panelView() {
      panel.querySelectorAll(".f2-pv").forEach(function (x) { x.remove(); });
      live.innerHTML = "";
      var pv = H("div", { class: "f2-pv" }, panel);
      panel.insertBefore(pv, live);
      if (showHubs) {
        var hc = hubs(R), all = R.nodes.filter(function (n) { return hc[n.id] === R.levers.length; }).map(function (n) { return lower(n.label); });
        H("div", { class: "lx-saw", html: LX.icon("check") + "<div>" + rich("**Hubs.** " + cap(list(all)) + " moved under every one of the four levers. A study that changes any part of the system should check these first.") + "</div>" }, live);
        return;
      }
      if (!lever) { H("p", { class: "lx-hint", text: "Pick a lever above. Each one starts a ripple that spreads in waves across the five lanes." }, pv); return; }
      if (wave < 0) {
        var pr = lever.predict, q = H("div", { class: "f2-pred" }, pv);
        H("p", { class: "lx-q", text: pr.q }, q);
        LX.Predict(q, { id: "f2-" + lever.id, answer: pr.answer, fresh: true, title: false,
          options: ["up", "down", "mixed"].map(function (d) { return { value: d, label: d === "mixed" ? "It depends" : cap(dirs[d].word) }; }),
          onPick: function (v) { st.preds[lever.id] = v; wave = 0; st.levers[lever.id] = Math.max(st.levers[lever.id] || 0, 1); ctx.save(); render(); focusWave(); } });
        return;
      }
      var head = H("div", { class: "f2-wavehead" }, pv);
      H("b", { tabindex: "-1", "data-fk": "wavehead", text: "Wave " + (wave + 1) + " of " + lever.waves.length + " · " + lever.waves[wave].label }, head);
      var nx = H("button", { type: "button", class: "lx-btn small", "data-fk": "next", html: "Next wave" + LX.icon("arrow") }, head);
      var now = ripple(lever, wave).effects.filter(function (e) { return e.wave === wave; });
      say.textContent = lever.label + ", wave " + (wave + 1) + " of " + lever.waves.length + ", " + lever.waves[wave].label.toLowerCase() + ": " +
        now.map(function (e) { return lower(nodeBy[e.node].label) + " " + dirs[e.dir].word; }).join("; ") + ".";
      nx.hidden = wave >= lever.waves.length - 1;
      nx.addEventListener("click", function () { wave = Math.min(lever.waves.length - 1, wave + 1); st.levers[lever.id] = Math.max(st.levers[lever.id] || 0, wave + 1); ctx.save(); render(); if (wave === lever.waves.length - 1) ctx.note(); focusWave(); });
      var ul = H("ul", { class: "f2-effects" }, pv);
      ripple(lever, wave).effects.slice().reverse().forEach(function (e) {
        var n = nodeBy[e.node], li = H("li", { class: e.wave === wave ? "now" : "", style: "--c:var(--f2-" + n.dim + ")" }, ul);
        H("span", { class: "d " + e.dir, text: dirs[e.dir].sym, title: dirs[e.dir].word }, li);
        H("span", { html: "<b>" + LX.esc(n.label) + "</b> " + LX.esc(dirs[e.dir].word) + (e.wave === wave ? "" : " (wave " + (e.wave + 1) + ")") + ". " + rich(e.why) +
          ' <span class="via">' + (e.from === "lever" ? "From the lever." : "Via " + LX.esc(lower(nodeBy[e.from].label)) + ".") + "</span>" }, li);
      });
      var pr2 = lever.predict, mine = st.preds[lever.id], reach = ripple(lever, wave).by[pr2.node];
      if (reach) {
        var ok = mine === pr2.answer;
        H("p", { class: "f2-verdict " + (ok ? "ok" : "no"), html: (ok ? LX.icon("check") + "<b>Your prediction holds.</b> " : LX.icon("question") + "<b>Not what you predicted.</b> ") +
          LX.esc(nodeBy[pr2.node].label) + ": " + dirs[pr2.answer].word + "." }, pv);
      }
      if (wave === lever.waves.length - 1) {
        var dr = dimsReached(R, lever);
        H("div", { class: "lx-saw", html: LX.icon("check") + "<div>" + rich("One lever reached **" + dr.length + " of " + R.dims.length + "** dimensions in " + lever.waves.length + " waves" + (lever.loop ? ". " + lever.loop.text : ".") +
          (doneAll() ? " All four levers pulled: show the hubs." : " Pull another lever.")) + "</div>" }, live);
        if (doneAll()) { var hb = H("button", { type: "button", class: "lx-btn small ghost", text: "Show the hubs" }, live); hb.addEventListener("click", function () { showHubs = true; st.hubs = true; ctx.save(); ctx.note(); render(); var lb = levBtn[lever.id]; if (lb) lb.focus({ preventScroll: true }); }); }
      }
    }
    function info(id) {
      var n = nodeBy[id], uses = [];
      R.levers.forEach(function (lv) { var by = ripple(lv, lv.waves.length - 1).by[id]; if (by && (st.levers[lv.id] || 0) >= 1) uses.push(lv.label + ": " + by.map(function (d) { return dirs[d].word; }).join(", then ")); });
      live.innerHTML = "";
      H("p", { class: "f2-info", html: "<b>" + LX.esc(n.label) + "</b> (" + LX.esc(dimBy[n.dim].label) + "). " + (uses.length ? "So far: " + LX.esc(uses.join("; ")) + "." : "No lever you pulled has reached it yet.") }, live);
    }
    function focusWave() { var n = panel.querySelector('[data-fk="next"]'); if (n && !n.hidden) n.focus({ preventScroll: true }); else refocus(panel, "wavehead"); }
    function doneAll() { return R.levers.every(function (l) { return (st.levers[l.id] || 0) >= l.waves.length; }); }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function list(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
    if (window.ResizeObserver) new ResizeObserver(function () { edges(); }).observe(map);
    LX.onTheme(edges);
    render();
    return { el: el, pull: pull, all: function () { R.levers.forEach(function (l) { st.levers[l.id] = l.waves.length; st.preds[l.id] = st.preds[l.id] || l.predict.answer; }); },
             toWave: function (k) { wave = k; st.levers[lever.id] = Math.max(st.levers[lever.id] || 0, k + 1); render(); }, hubs: function () { showHubs = true; st.hubs = true; render(); }, edges: edges };
  }

  // ---------------------------------------------------------------- the lesson
  function view(live, data, root) {
    var D = data.f02_systems_and_map, st = LX.store.get("f2-log", {}) || {};
    var ctx = { D: D, st: st, save: function () { LX.store.set("f2-log", st); }, note: function () { notes(); buildExplain(D, st); }, progress: function () { progress(); } };
    var M = LX.Missions(live, [{ id: "stock", label: "Stocks and flows: meet the goal in all three tanks", short: "Stocks and flows", main: true },
                               { id: "loops", label: "Feedback loops: close both diagrams", short: "Feedback loops" },
                               { id: "map", label: "The system map: follow all four levers to the last wave", short: "System map" }]);
    var tabsBox = H("div", { class: "f2-tabs" }, live), stage = H("div", { class: "f2-stage" }, live), tabs = null, current = null, comp = null;
    var TABS = [{ id: "stock", label: "1 · Stocks and flows", icon: "drop" }, { id: "loops", label: "2 · Feedback loops", icon: "wave" }, { id: "map", label: "3 · The system map", icon: "map" }, { id: "debrief", label: "Debrief", icon: "star" }];
    function open(id) {
      current = id; st.tab = id; ctx.save(); tabs.set(id); stage.innerHTML = "";
      if (id === "stock") comp = StockFlow(stage, ctx);
      else if (id === "loops") comp = LoopBuilder(stage, ctx);
      else if (id === "map") comp = RippleMap(stage, ctx);
      else comp = debrief(stage);
      LX.emit("layout");
    }
    tabs = seg(tabsBox, "Stations", TABS, st.tab || "stock", open);
    function counts() {
      var won = st.won || {}, lp = st.loops || {}, lv = st.levers || {};
      return { stock: ["reservoir", "battery", "carbon"].filter(function (k) { return won[k]; }).length, loops: ["ev", "rebound"].filter(function (k) { return (lp[k] || {}).done; }).length,
               map: D.ripple.levers.filter(function (l) { return (lv[l.id] || 0) >= l.waves.length; }).length };
    }
    function progress() {
      var c = counts();
      M.set("stock", { frac: c.stock / 3, text: c.stock + " of 3 tanks", won: c.stock === 3 });
      M.set("loops", { frac: c.loops / 2, text: c.loops + " of 2 diagrams", won: c.loops === 2 });
      M.set("map", { frac: c.map / 4, text: c.map + " of 4 levers", won: c.map === 4 });
      if (c.stock === 3 && c.loops === 2 && c.map === 4) LX.progress.done(LESSON);
    }
    function noteList() {
      var c = counts(), won = st.won || {}, lp = st.loops || {}, cS = (st.wonAt || {}).reservoir;
      return [
        { icon: "drop", title: "Stock", got: !!won.reservoir, lock: "Meet the reservoir's goal.", text: "An amount that builds up or drains: water in a reservoir, energy in a battery, CO₂ emitted.", moment: cS && won.reservoir ? "Your reservoir: a steady " + cS.release + " MW release." : null },
        { icon: "battery", title: "Flow", got: !!won.battery, lock: "Meet the battery's goal.", text: "A rate that fills or drains a stock: MW into a battery, Mt of CO₂ a year. MW is a flow, MWh a stock." },
        { icon: "cloud", title: "Only zero stops the rise", got: !!won.carbon, lock: "Keep Prairieland within its budget.", text: "A smaller inflow still fills the tub. Cumulative CO₂ stops rising only when net emissions reach zero." },
        { icon: "wave", title: "Reinforcing loop", got: !!(lp.ev || {}).done, lock: "Close the chargers and EVs diagram.", text: "An even number of − links: change feeds itself, up or down." },
        { icon: "scale", title: "Balancing loop", got: !!(lp.rebound || {}).done, lock: "Close the rebound diagram.", text: "An odd number of − links: change is pulled back toward a level, as the rebound takes back part of a saving." },
        { icon: "map", title: "Ripple and hubs", got: c.map === 4, lock: "Follow all four levers.", text: "One change spreads in waves, with delays, across technology, cost, emissions, people and security; some parts move every time." }
      ];
    }
    function notes() { progress(); if (current === "debrief") open("debrief"); }
    function debrief(host) {
      var d = H("div", { class: "lx-debrief" }, host), c = counts();
      var hd = H("div", { class: "lx-deb-head" }, d); H("h3", { text: "What you collected" }, hd);
      H("span", { class: "lx-pill " + (c.stock + c.loops + c.map === 9 ? "good" : "neutral"), text: (c.stock + c.loops + c.map) + " of 9 goals met" }, hd);
      H("p", { class: "lx-deb-notes", text: "Three ways to see a whole system: what accumulates, what feeds back, and where one change spreads." }, d);
      LX.Notes(d, noteList());
      var go = H("a", { class: "lx-btn small ghost", href: "#explain", text: "See it as diagrams" }, d); void go;
      return { el: d };
    }
    progress();
    open(st.tab || "stock");
    buildExplain(D, st);
    // demo states (core.js LX.demo): "mid" = the reservoir with a winning release; "battery", "carbon"; "step-1" … "step-4"
    // = the three stations and the debrief; "loops", "rebound", "ripple" (the gas lever to its last wave), "hubs", "done"
    LX.demo(root, function (state) {
      var R = D.ripple;
      if (state === "mid" || state === "step-1") { st.ctl = st.ctl || {}; st.ctl.reservoir = { release: 105 }; st.sfKind = "reservoir"; open("stock"); return { view: "reservoir" }; }
      if (state === "battery") { st.ctl = st.ctl || {}; st.ctl.battery = { c: 15, d: 25 }; st.sfKind = "battery"; open("stock"); return { view: "battery" }; }
      if (state === "carbon") { st.pred = "rises"; st.ctl = st.ctl || {}; st.ctl.carbon = { l35: 50, nz: 2060 }; st.sfKind = "carbon"; open("stock"); return { view: "carbon" }; }
      if (state === "loops" || state === "step-2" || state === "rebound") {
        var w = state === "rebound" ? "rebound" : "ev", L = D.loops[w], sg = {}, nm = {};
        L.links.forEach(function (l) { sg[l.id] = l.sign; }); L.loops.forEach(function (lp) { nm[lp.id] = lp.type; });
        st.loops = st.loops || {}; st.loops[w] = { signs: sg, checked: true, named: nm, done: true }; st.lbWhich = w; if (w === "rebound") st.rb = 30;
        open("loops"); return { view: w };
      }
      if (state === "ripple" || state === "step-3") { open("map"); comp.pull("gas"); st.preds.gas = "mixed"; comp.pull("gas"); comp.toWave(2); return { view: "map" }; }
      if (state === "hubs" || state === "done" || state === "step-4") {
        st.won = { reservoir: true, battery: true, carbon: true }; st.pred = st.pred || "rises";
        st.wonAt = { reservoir: { release: 105 }, battery: { c: 25, d: 25 }, carbon: { l35: 50, nz: 2060 } }; st.ctl = JSON.parse(JSON.stringify(st.wonAt)); st.rb = 30;
        ["ev", "rebound"].forEach(function (w) { var L = D.loops[w], sg = {}, nm = {}; L.links.forEach(function (l) { sg[l.id] = l.sign; }); L.loops.forEach(function (lp) { nm[lp.id] = lp.type; }); (st.loops = st.loops || {})[w] = { signs: sg, checked: true, named: nm, done: true }; });
        st.levers = {}; st.preds = {}; R.levers.forEach(function (l) { st.levers[l.id] = l.waves.length; st.preds[l.id] = l.predict.answer; });
        progress(); buildExplain(D, st);
        if (state === "hubs") { open("map"); comp.pull("dc"); comp.hubs(); return { view: "hubs" }; }
        open("debrief"); return { view: "debrief" };
      }
      return null;
    });
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, st) {
    var host = document.getElementById("f2-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var R = D.ripple, dirs = R.dirs, nodeBy = {}; R.nodes.forEach(function (n) { nodeBy[n.id] = n; });
    // 1 e-loop: the two kinds of loop, with their signs and typical behaviour
    var c1 = H("div", { class: "lx-xcard" }, host);
    var hd = H("header", { class: "lx-x-head" }, c1); H("h3", { text: "Two kinds of feedback loop" }, hd);
    H("p", { class: "lx-lede", html: rich("Follow a loop's arrows round and count the − links: **even** makes it reinforcing (R), **odd** makes it balancing (B).") }, c1);
    var two = H("div", { class: "f2-x2" }, c1);
    [["ev", "Chargers and EVs: one R loop and one B loop"], ["rebound", "The rebound effect: one B loop"]].forEach(function (x) {
      var f = H("figure", { class: "f2-xfig" }, two), L = D.loops[x[0]];
      cldSVG(f, L, { static: true, aria: x[1] + ". Links: " + L.links.map(function (l) { var a = L.nodes.filter(function (n) { return n.id === l.from; })[0].label, b = L.nodes.filter(function (n) { return n.id === l.to; })[0].label; return a + " to " + b + " (" + (l.sign === "+" ? "plus" : "minus") + ")"; }).join("; ") + "." });
      var row = H("div", { class: "f2-sk" }, f);
      L.loops.forEach(function (lp) { var s = H("div", null, row); sketch(s, lp.type); H("span", { text: loopName(lp) + " · " + (lp.type === "R" ? "reinforcing: feeds itself" : "balancing: settles") }, s); });
      H("figcaption", { text: x[1] }, f);
    });
    // 2 e-concept-map: the vocabulary of systems thinking, with the reader's own moments
    var c2 = H("div", { class: "lx-xcard" }, host), ctl = st.wonAt || {}, won = st.won || {};
    var G = { parts: ["Parts", "var(--lx-tier-2)"], loops: ["Feedback", "var(--lx-tier-4)"], whole: ["The whole system", "var(--lx-tier-1)"] };
    LX.ConceptMap(c2, {
      title: "The ideas, and how they connect", lede: "Tap an idea to see what it means and where you met it.", groups: G, gameLabel: "In the lab",
      cols: 4, rows: 3, colsN: 3, rowsN: 4, sel: "stock",
      nodes: [
        { id: "stock", g: "parts", label: "Stock", at: [0, 0], atN: [0, 0], text: "An amount that builds up or drains over time: water, stored energy, cumulative CO₂, cars on the road, power plants.",
          game: won.reservoir && ctl.reservoir ? "Your reservoir ended the year at " + fx(simReservoir(D.stockflow.reservoir, ctl.reservoir.release).end) + " GWh." : "The reservoir, the battery and the carbon budget." },
        { id: "flow", g: "parts", label: "Flow", at: [1, 0], atN: [1, 0], text: "A rate that fills or drains a stock: MW, Mt a year, cars sold a year. Only flows change a stock.",
          game: "The battery took in MW and held MWh: lesson 1's power and energy." },
        { id: "limit", g: "parts", label: "Limits", at: [2, 0], atN: [2, 0], text: "A stock has a floor and a ceiling: a full reservoir spills, an empty battery delivers nothing, a budget can be overrun.",
          game: "Spill, run dry, or overrun the budget." },
        { id: "delay", g: "parts", label: "Delay", at: [3, 0], atN: [0, 1], text: "Time between a cause and its effect: a stock fills slowly, a new line takes years.", game: "The waves on the system map: hours, months, years." },
        { id: "R", g: "loops", label: "Reinforcing loop", lines: ["Reinforcing", "loop"], at: [0.5, 1], atN: [1, 1], text: "An even number of − links: change feeds itself, growth or decline.", game: "More EVs, more chargers, more EVs." },
        { id: "B", g: "loops", label: "Balancing loop", lines: ["Balancing", "loop"], at: [1.5, 1], atN: [2, 1], text: "An odd number of − links: change is pulled back toward a level.", game: "Queues at chargers; the rebound effect." },
        { id: "rebound", g: "loops", label: "Rebound", at: [2.5, 1], atN: [0, 2], text: "Efficiency makes a service cheaper, so people use more of it; part of the saving is taken back.",
          game: st.rb != null ? "Your rebound: " + st.rb + "%, so " + fx(reboundKept(100, st.rb)) + " of 100 units kept." : "The LED bulbs." },
        { id: "lever", g: "whole", label: "Lever", at: [0.5, 2], atN: [1, 2], text: "A change from outside the part you study: a price shock, the weather, a policy, a new load.", game: "Gas price, heat wave, carbon price, new data center." },
        { id: "ripple", g: "whole", label: "Ripple", at: [1.5, 2], atN: [2, 2], text: "A lever's effects spread in waves across technology, cost, emissions, people and security.", game: "Every lever reached all five dimensions." },
        { id: "hub", g: "whole", label: "Hub", at: [2.5, 2], atN: [1, 3], text: "A part that many levers move: watch it first in any study.", game: "The wholesale price, household bills, the plant mix, CO₂ and what gets built moved under all four levers." }
      ],
      edges: [["flow", "stock", "changes"], ["limit", "stock", "bounds"], ["stock", "delay", "creates"], ["R", "stock", "grows or drains"], ["B", "stock", "steadies"],
              ["rebound", "B", "is a"], ["lever", "ripple", "starts"], ["ripple", "hub", "meets"], ["delay", "ripple", "spaces"]]
    });
    // 3 e-table: the four levers across the five dimensions
    var c3 = H("div", { class: "lx-xcard" }, host);
    LX.CompareTable(c3, {
      title: "Four levers, five dimensions", text: true,
      columns: [{ key: "name", label: "Lever", main: true }].concat(R.dims.map(function (d) { return { key: d.id, label: d.short }; })),
      rows: R.levers.map(function (lv) {
        var row = { key: lv.id, name: lv.label, note: lv.waves.length + " waves", color: "var(--lx-ink-3)" }, by = ripple(lv, lv.waves.length - 1).by;
        R.dims.forEach(function (d) { row[d.id] = R.nodes.filter(function (n) { return n.dim === d.id && by[n.id]; }).map(function (n) { return by[n.id].map(function (x) { return dirs[x].sym; }).join("") + " " + n.label; }).join("; ") || "–"; });
        return row;
      }),
      sorts: [{ label: "As pulled", order: R.levers.map(function (l) { return l.id; }), note: "↑ rises, ↓ falls, ⇄ shifts, ± depends. First-round directions, other things equal; no sizes." }]
    });
  }

  LX.mount("systems-map", function (live, data, root) { view(live, data, root); });
})();
