// explainers/ghg.js — interactive explainer for the ghg project page (website v2, 2026-11-02).
//
// Mechanism (Cell Reports Sustainability 2, 100367, 2025, doi:10.1016/j.crsus.2025.100367; Methods, "Load regulation optimization model",
// Equations 1-3): within an optimization cycle, each hour's load d_t may change by a fraction x_t with -a <= x_t <= a
// (the adjustment range); the cycle's total consumption may not fall (Eq. 3); the objective is the sum of attributed
// emissions E_t = (1 + x_t) d_t e_t (Eqs. 1-2), where e_t is the hour's average grid emission intensity. Load therefore
// moves from high-intensity to low-intensity hours, and a wider range or a larger daily swing in e_t gives a larger reduction.
//
// Toy model: one stylized 24-hour day (the paper uses months, quarters or years of EIA data), no adjustment penalty
// (set to zero, as in the paper's first two case studies) and no hourly capacity limits (Eqs. 4-5). With a zero penalty the
// problem is a linear program whose exact solution is a greedy fill: start every hour at -a*d_t, then return the removed
// energy to the lowest-intensity hours first, each up to +a*d_t. Emissions are attributed at each hour's average intensity
// with the whole day known in advance; the toy says nothing about the grid's marginal (consequential) response.
// Load in MWh per hour (about 100 MW on average), intensity in kg CO2/MWh (= g CO2/kWh). Illustrative numbers only.
(function () {
  "use strict";

  // stylized daily load, MWh in each hour (night trough, evening peak)
  var LOAD = [82, 79, 77, 76, 77, 81, 88, 96, 101, 104, 106, 107, 108, 109, 110, 112, 115, 119, 121, 118, 112, 104, 95, 88];
  // stylized hourly average emission intensity, g CO2/kWh: a grid with a large daily swing (solar lowers midday intensity)
  // and a grid with a small swing (steady fossil and nuclear output)
  var GRIDS = {
    large: [428, 426, 424, 424, 426, 430, 432, 405, 365, 318, 275, 245, 230, 228, 240, 268, 315, 375, 430, 452, 448, 440, 434, 430],
    small: [392, 390, 389, 389, 390, 394, 400, 404, 402, 398, 395, 393, 392, 392, 394, 398, 404, 410, 414, 415, 412, 406, 400, 395]
  };

  // pure model: p = {range: allowed |x_t| as a fraction (0-0.10), grid: "large"|"small"} (+ optional load, intensity arrays)
  function model(p) {
    var d = p.load || LOAD, e = p.intensity || GRIDS[p.grid || "large"], a = Math.max(0, p.range || 0);
    var n = d.length, i, total = 0;
    var y = new Array(n);                         // MWh added (+) or removed (-) in each hour
    for (i = 0; i < n; i++) { total += d[i]; y[i] = -a * d[i]; }
    var order = d.map(function (_, k) { return k; }).sort(function (u, v) { return e[u] - e[v] || u - v; });
    var budget = a * total;                       // energy that must be returned so the daily total is kept (Eq. 3)
    for (i = 0; i < n && budget > 1e-12; i++) {
      var t = order[i], add = Math.min(2 * a * d[t], budget);
      y[t] += add; budget -= add;
    }
    var base = 0, after = 0, moved = 0, fromE = 0, toE = 0, removed = 0;
    var shifted = new Array(n);
    for (i = 0; i < n; i++) {
      if (Math.abs(y[i]) < 1e-9) y[i] = 0;
      shifted[i] = d[i] + y[i];
      base += d[i] * e[i] / 1000;                 // t CO2 attributed before re-timing
      after += shifted[i] * e[i] / 1000;          // t CO2 attributed after re-timing
      if (y[i] > 0) { moved += y[i]; toE += y[i] * e[i]; }
      if (y[i] < 0) { removed -= y[i]; fromE -= y[i] * e[i]; }
    }
    var newTotal = shifted.reduce(function (s, v) { return s + v; }, 0);
    return { load: d, intensity: e, adjust: y, shifted: shifted, total: total, newTotal: newTotal,
             base: base, after: after, reductionPct: base > 0 ? 100 * (base - after) / base : 0,
             moved: moved, movedPct: total > 0 ? 100 * moved / total : 0,
             fromIntensity: removed > 0 ? fromE / removed : null, toIntensity: moved > 0 ? toE / moved : null };
  }

  var E_MIN = 150, E_MAX = 480, L_MAX = 140;   // fixed axes so the two grids and all ranges compare directly

  function view(root, h) {
    var state = { range: 5, grid: "large" };
    var ui = h.scaffold(root, { title: "How much do attributed emissions fall as the adjustment range widens?" });

    h.slider(ui.controls, { label: "Adjustment range", min: 0, max: 10, step: 1, value: state.range,
      format: function (v) { return "±" + v + "%"; }, hint: "how far each hour's load may move up or down",
      onInput: function (v) { state.range = v; update(); } });
    h.toggle(ui.controls, { label: "Daily swing in grid intensity", value: state.grid,
      options: [{ value: "large", label: "Large" }, { value: "small", label: "Small" }],
      onChange: function (v) { state.grid = v; update(); } });

    var chart = h.el("div", { class: "ex-chart" }, ui.figure);
    var legend = h.el("div", { class: "ex-legend", style: "display:flex;flex-wrap:wrap;gap:.3rem 1.1rem;margin-top:.45rem;font-size:.8rem;color:var(--ink-2)" }, ui.figure);
    h.el("p", { class: "ex-hint", style: "margin:.4rem 0 0", text: "Emissions are counted at each hour's average " +
      "intensity, with the whole day known in advance. This is an accounting view, not the grid's marginal response." }, ui.figure);
    var read = h.readouts(ui.side, [
      { key: "red", label: "Change in attributed emissions" },
      { key: "moved", label: "Energy moved, share of the day (total unchanged)" },
      { key: "from", label: "Intensity of hours it leaves → joins, g/kWh" }]);
    var say = h.sentence(ui.side);

    function item(parent, draw, text) {
      var it = h.el("span", { style: "display:inline-flex;align-items:center;gap:.4rem" }, parent);
      var s = h.el("svg", { width: 18, height: 12, "aria-hidden": "true" }, it);
      draw(s);
      h.el("span", { text: text }, it);
    }
    function drawLegend() {
      var tc = h.color("t"), mu = h.color("muted"), ink = h.color("ink");
      while (legend.firstChild) legend.removeChild(legend.firstChild);
      item(legend, function (s) { h.el("rect", { x: 3, y: 1, width: 12, height: 10, fill: tc }, s); }, "Load added");
      item(legend, function (s) { h.el("rect", { x: 3.5, y: 1.5, width: 11, height: 9, fill: "none", stroke: mu, "stroke-dasharray": "2 2" }, s); }, "Load removed");
      item(legend, function (s) { h.el("rect", { x: 3, y: 1, width: 12, height: 10, fill: tc, "fill-opacity": 0.3 }, s); }, "Unchanged load");
      item(legend, function (s) { h.el("line", { x1: 1, x2: 17, y1: 6, y2: 6, stroke: ink, "stroke-width": 2 }, s); }, "Grid intensity");
    }

    function label(g, x, y, s, o) {
      o = o || {};
      return h.el("text", { x: x, y: y, "text-anchor": o.anchor || "start", class: o.cls || null,
        style: o.fill ? "fill:" + o.fill : null, text: s }, g);
    }

    function draw(w) {
      var m = model({ range: state.range / 100, grid: state.grid });
      var H = Math.max(270, Math.min(340, Math.round(w * 0.6)));
      var M = { l: 40, r: 8, t: 18, b: 34 }, gap = 30;
      var pw = w - M.l - M.r, inner = H - M.t - M.b - gap;
      var hTop = Math.round(inner * 0.34), hBot = inner - hTop;
      var topY0 = M.t, botY0 = M.t + hTop + gap;
      var x = h.scale(0, 24, M.l, M.l + pw);
      var ye = h.scale(E_MIN, E_MAX, topY0 + hTop, topY0), yl = h.scale(0, L_MAX, botY0 + hBot, botY0);
      var tc = h.color("t"), ink = h.color("ink"), mu = h.color("muted");
      while (chart.firstChild) chart.removeChild(chart.firstChild);
      var svg = h.svg(chart, { width: w, height: H, label: "Two aligned charts over the 24 hours of a stylized day. Top: " +
        "grid emission intensity. Bottom: load before and after re-timing within ±" + state.range + "%. Attributed " +
        "emissions change by " + h.fmt(-m.reductionPct, 2) + "% with the daily total unchanged." });

      // hours that receive load: a light column through both panels links them to the intensity curve
      var cols = h.el("g", {}, svg);
      m.adjust.forEach(function (v, t) {
        if (v > 0) h.el("rect", { x: x(t), y: topY0, width: x(1) - x(0), height: botY0 + hBot - topY0, fill: tc, "fill-opacity": 0.08 }, cols);
      });

      var grid = h.el("g", { class: "ex-grid" }, svg), axis = h.el("g", { class: "ex-axis" }, svg);
      (hTop >= 80 ? [200, 300, 400] : [200, 400]).forEach(function (v) {
        h.el("line", { x1: M.l, x2: M.l + pw, y1: ye(v), y2: ye(v) }, grid);
        label(axis, M.l - 6, ye(v) + 4, v, { anchor: "end" });
      });
      [0, 50, 100].forEach(function (v) {
        h.el("line", { x1: M.l, x2: M.l + pw, y1: yl(v), y2: yl(v) }, grid);
        label(axis, M.l - 6, yl(v) + 4, v, { anchor: "end" });
      });
      h.el("line", { x1: M.l, x2: M.l + pw, y1: botY0 + hBot, y2: botY0 + hBot }, axis);
      [0, 6, 12, 18, 24].forEach(function (v) {
        h.el("line", { x1: x(v), x2: x(v), y1: botY0 + hBot, y2: botY0 + hBot + 4 }, axis);
        label(axis, x(v), botY0 + hBot + 16, v + ":00", { anchor: "middle" });
      });
      label(axis, M.l, topY0 - 6, "Grid emission intensity (g CO₂/kWh)", { cls: "ex-strong" });
      label(axis, M.l, botY0 - 8, "Load (MWh in each hour)", { cls: "ex-strong" });
      label(axis, M.l + pw, H - 4, "hour of day", { anchor: "end" });

      // intensity: a step-like line through the hour centres
      var pts = m.intensity.map(function (v, t) { return x(t + 0.5).toFixed(1) + "," + ye(v).toFixed(1); }).join(" ");
      h.el("polyline", { points: pts, fill: "none", stroke: ink, "stroke-width": 2, "stroke-linejoin": "round" }, svg);

      // load bars: unchanged part (tint), added part (solid), removed part (dashed outline)
      var bars = h.el("g", {}, svg), bw = (x(1) - x(0)) * 0.72, off = (x(1) - x(0) - bw) / 2;
      m.load.forEach(function (d0, t) {
        var d1 = m.shifted[t], lo = Math.min(d0, d1), bx = x(t) + off;
        h.el("rect", { x: bx, y: yl(lo), width: bw, height: yl(0) - yl(lo), fill: tc, "fill-opacity": 0.3 }, bars);
        if (d1 > d0 + 1e-9) h.el("rect", { x: bx, y: yl(d1), width: bw, height: yl(d0) - yl(d1), fill: tc }, bars);
        if (d1 < d0 - 1e-9) h.el("rect", { x: bx + 0.5, y: yl(d0) + 0.5, width: bw - 1, height: Math.max(0, yl(d1) - yl(d0) - 1),
          fill: "none", stroke: mu, "stroke-width": 1, "stroke-dasharray": "2 2" }, bars);
      });
    }

    function update() {
      var m = model({ range: state.range / 100, grid: state.grid });
      // tell the host page what is shown, for its own text version (Learn's case file CF6 writes the hour-by-hour table)
      if (root.dispatchEvent && typeof CustomEvent === "function")
        root.dispatchEvent(new CustomEvent("explainer-update", { bubbles: true, detail: { slug: "ghg", range: state.range / 100, grid: state.grid, model: m } }));
      var r = state.range, red = m.reductionPct;
      read({ red: r === 0 ? "0%" : "−" + h.fmt(red, 2) + "%",
             moved: h.fmt(m.movedPct, 1) + "%",
             from: m.moved > 0 ? h.fmt(m.fromIntensity, 0) + " → " + h.fmt(m.toIntensity, 0) : "–" });
      if (r === 0) {
        say("With no adjustment allowed, the load profile and its attributed emissions stay as they are.");
      } else {
        var s = "Letting each hour's load move up to <strong>±" + r + "%</strong> shifts " + h.fmt(m.movedPct, 1) +
          "% of the day's energy into cleaner hours (" + h.fmt(m.fromIntensity, 0) + " → " + h.fmt(m.toIntensity, 0) +
          " g/kWh on average). With the same daily total, attributed emissions fall by <strong>" + h.fmt(red, 2) + "%</strong>";
        s += state.grid === "small" ? ": with a small daily swing in intensity there is little to gain."
          : ", a modest reduction because only a small share of the load moves.";
        say(s);
      }
      redraw();
    }

    var redraw = h.responsive(chart, draw);
    h.onTheme(function () { drawLegend(); redraw(); });
    drawLegend();
    update();
  }

  if (typeof window !== "undefined" && window.Explainer) window.Explainer.register("ghg", view);
  if (typeof module !== "undefined" && module.exports) module.exports = { model: model, view: view, LOAD: LOAD, GRIDS: GRIDS };
})();
