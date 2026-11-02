// explainers/nuclear-dc.js — interactive explainer for the nuclear-dc project page (website v2, 2026-11-02).
//
// Mechanism (Energy Conversion and Management, 2026, accepted; text as in arXiv:2608.10999, Secs. 2.2.1, 2.2.6, 3.2,
// Discussion and Conclusion): the Section 45Y production credit is
// paid on each MWh of net electricity the reactor generates. Steam extracted at the turbine crossover for an absorption
// chiller forgoes turbine output (extraction penalty alpha, MW_e per MW_th of steam), so it gives up both the market value
// and the credit of that output. An electric chiller uses electricity that is still generated, and still credited, so it
// costs only the market price. A larger credit therefore raises the cost of steam-driven cooling and favours generation.
//
// Toy model, per MWh of cooling (operating cost only; the absorption chiller's own capital is not included):
//   steam route        = (alpha / COP_abs) * (price + credit)
//   electric chiller   = (1 / COP_el) * price
//   break-even credit  = price * (COP_abs / (alpha * COP_el) - 1)
// Stylized values: alpha = 0.20 (the paper's coefficient), COP_abs = 1.2 (between the paper's 1.10 design value and
// 1.30 cap), COP_el = 3.2 (the paper's design-point electric COP). Left out: absorber pumps and fans, part-load and
// wet-bulb effects, capital costs. Illustrative only: these are not the study's results.
(function () {
  "use strict";

  var DEFAULTS = { alpha: 0.20, copAbs: 1.2, copEl: 3.2 };

  // pure model: p = {credit, price} in $/MWh of electricity (+ optional alpha, copAbs, copEl); costs in $ per MWh of cooling
  function model(p) {
    var alpha = p.alpha != null ? p.alpha : DEFAULTS.alpha;
    var copAbs = p.copAbs != null ? p.copAbs : DEFAULTS.copAbs;
    var copEl = p.copEl != null ? p.copEl : DEFAULTS.copEl;
    var lost = alpha / copAbs;          // MWh of turbine output forgone per MWh of absorption cooling
    var used = 1 / copEl;               // MWh of electricity an electric chiller uses per MWh of cooling
    var steamSales = lost * p.price;    // market value of the forgone output
    var steamCredit = lost * p.credit;  // credit that output would have earned
    var steam = steamSales + steamCredit;
    var electric = used * p.price;
    var beCredit = p.price * (used / lost - 1);                          // credit at which the two routes cost the same
    var bePrice = used > lost ? p.credit * lost / (used - lost) : Infinity; // price above which steam is cheaper
    var diff = electric - steam;        // > 0: steam cheaper
    return { lost: lost, used: used, steamSales: steamSales, steamCredit: steamCredit, steam: steam, electric: electric,
             breakEvenCredit: beCredit, breakEvenPrice: bePrice, diff: diff,
             cheaper: Math.abs(diff) < 0.05 ? "tie" : diff > 0 ? "steam" : "electric" };
  }

  var X_MAX = 80;   // chart domain: credit $0-80/MWh (the break-even credit stays inside it for prices up to $90)
  // cost axis: scales with the price so the lines stay legible at low prices; rounded up to $5
  function yMax(price) {
    var top = Math.max(model({ credit: X_MAX, price: price }).steam, model({ credit: 0, price: price }).electric);
    return Math.ceil(1.2 * top / 5) * 5;
  }

  function view(root, h) {
    var state = { credit: 20, price: 50 };
    var money = function (v) { return "$" + h.fmt(v, 1); };
    var ui = h.scaffold(root, { title: "At what credit does generating power beat using the steam for cooling?" });

    h.slider(ui.controls, { label: "Production credit", min: 0, max: X_MAX, step: 1, value: state.credit,
      format: function (v) { return "$" + v + "/MWh"; }, hint: "paid on each MWh of electricity the reactor generates",
      onInput: function (v) { state.credit = v; update(); } });
    h.slider(ui.controls, { label: "Electricity price", min: 15, max: 90, step: 1, value: state.price,
      format: function (v) { return "$" + v + "/MWh"; }, hint: "market value of one MWh of power",
      onInput: function (v) { state.price = v; update(); } });

    var chart = h.el("div", { class: "ex-chart" }, ui.figure);
    var legend = h.el("div", { class: "ex-legend", style: "display:flex;flex-wrap:wrap;gap:.3rem 1.1rem;margin-top:.45rem;font-size:.8rem;color:var(--ink-2)" }, ui.figure);
    var read = h.readouts(ui.side, [
      { key: "steam", label: "Steam route, per MWh of cooling" },
      { key: "elec", label: "Electric chiller, per MWh of cooling" },
      { key: "be", label: "Break-even credit" }]);
    var say = h.sentence(ui.side);

    function swatch(parent, colour, dash, text) {
      var item = h.el("span", { style: "display:inline-flex;align-items:center;gap:.4rem" }, parent);
      var s = h.el("svg", { width: 22, height: 10, "aria-hidden": "true" }, item);
      h.el("line", { x1: 1, y1: 5, x2: 21, y2: 5, stroke: colour, "stroke-width": 2.5, "stroke-dasharray": dash || null }, s);
      h.el("span", { text: text }, item);
    }
    function drawLegend() {
      while (legend.firstChild) legend.removeChild(legend.firstChild);
      swatch(legend, h.color("t"), null, "Steam route: lost turbine output × (price + credit)");
      swatch(legend, h.color("accent"), null, "Electric chiller: power used × price");
    }

    // text label; o.halo draws a background-coloured outline under the glyphs so crossing lines do not hurt legibility
    function label(g, x, y, s, o) {
      o = o || {};
      var st = [];
      if (o.fill) st.push("fill:" + o.fill);
      if (o.weight) st.push("font-weight:" + o.weight);
      if (o.halo) st.push("paint-order:stroke;stroke:" + h.color("surface") + ";stroke-width:3px;stroke-linejoin:round");
      return h.el("text", { x: x, y: y, "text-anchor": o.anchor || "start", class: o.cls || null,
        style: st.length ? st.join(";") : null, text: s }, g);
    }

    function draw(w) {
      var m = model(state);
      var H = Math.max(240, Math.min(320, Math.round(w * 0.58)));
      var M = { l: 48, r: 12, t: 24, b: 42 };
      var pw = w - M.l - M.r, ph = H - M.t - M.b;
      var Y_MAX = yMax(state.price);
      var x = h.scale(0, X_MAX, M.l, M.l + pw), y = h.scale(0, Y_MAX, M.t + ph, M.t);
      var tc = h.color("t"), ac = h.color("accent"), ink = h.color("ink"), surface = h.color("surface");
      while (chart.firstChild) chart.removeChild(chart.firstChild);
      var svg = h.svg(chart, { width: w, height: H, label: "Line chart of operating cost per MWh of cooling against the " +
        "production credit. At a $" + state.credit + " credit and $" + state.price + " power, the steam route costs " +
        money(m.steam) + " and the electric chiller " + money(m.electric) + "; they cost the same at a credit of $" +
        h.fmt(m.breakEvenCredit, 0) + " per MWh." });

      // regions where each route is cheaper (the break-even credit is always inside 0-80 for prices up to $90)
      var be = Math.max(0, Math.min(X_MAX, m.breakEvenCredit));
      var regions = h.el("g", {}, svg);
      h.el("rect", { x: x(0), y: M.t, width: x(be) - x(0), height: ph, fill: tc, "fill-opacity": 0.07 }, regions);
      h.el("rect", { x: x(be), y: M.t, width: x(X_MAX) - x(be), height: ph, fill: ac, "fill-opacity": 0.07 }, regions);
      var lw = 96;  // approximate width of a region label at 11px
      if (x(be) - x(0) > lw) label(regions, (x(0) + x(be)) / 2, M.t - 8, "Steam cheaper", { anchor: "middle", fill: tc, weight: 600 });
      if (x(X_MAX) - x(be) > lw) label(regions, (x(be) + x(X_MAX)) / 2, M.t - 8, "Electric cheaper", { anchor: "middle", fill: ac, weight: 600 });

      // grid and axes
      var grid = h.el("g", { class: "ex-grid" }, svg), axis = h.el("g", { class: "ex-axis" }, svg);
      h.ticks(0, Y_MAX, 5).forEach(function (v) {
        h.el("line", { x1: M.l, x2: M.l + pw, y1: y(v), y2: y(v) }, grid);
        label(axis, M.l - 6, y(v) + 4, "$" + v, { anchor: "end" });
      });
      h.ticks(0, X_MAX, 4).forEach(function (v) {
        h.el("line", { x1: x(v), x2: x(v), y1: M.t + ph, y2: M.t + ph + 4 }, axis);
        label(axis, x(v), M.t + ph + 16, "$" + v, { anchor: "middle" });
      });
      h.el("line", { x1: M.l, x2: M.l + pw, y1: M.t + ph, y2: M.t + ph }, axis);
      label(axis, M.l + pw / 2, H - 6, "Production credit ($ per MWh of electricity)", { anchor: "middle" });
      var yl = label(axis, 0, 0, "Cost per MWh of cooling", { anchor: "middle" });
      yl.setAttribute("transform", "translate(12," + (M.t + ph / 2) + ") rotate(-90)");

      // the two routes (their labels go in a group that is moved to the top at the end)
      var lines = h.el("g", {}, svg), tags = h.el("g", {}, svg);
      h.el("line", { x1: x(0), y1: y(m.electric), x2: x(X_MAX), y2: y(m.electric), stroke: ac, "stroke-width": 2.5 }, lines);
      var steamEnd = model({ credit: X_MAX, price: state.price }).steam;
      h.el("line", { x1: x(0), y1: y(m.steamSales), x2: x(X_MAX), y2: y(steamEnd), stroke: tc, "stroke-width": 2.5 }, lines);
      // direct labels, placed away from the crossing: the steam line is below the electric line left of the break-even
      // credit and above it to the right
      var bx = x(be), crossLeft = bx < M.l + pw / 2;
      if (crossLeft) {   // crossing in the left half: both labels at the right end, steam above electric there
        label(tags, x(X_MAX) - 4, y(m.electric) - 7, "Electric chiller", { anchor: "end", fill: ac, weight: 600, halo: true });
        label(tags, x(X_MAX) - 4, y(steamEnd) - 8, "Steam route", { anchor: "end", fill: tc, weight: 600, halo: true });
      } else {           // crossing in the right half: both labels at the left end, electric above, steam below its line
        label(tags, x(0) + 6, y(m.electric) - 7, "Electric chiller", { fill: ac, weight: 600, halo: true });
        label(tags, x(0) + 6, y(m.steamSales) + 16, "Steam route", { fill: tc, weight: 600, halo: true });
      }

      // break-even point, labelled where neither line passes: below-right of the crossing, or above-left near the right edge
      h.el("circle", { cx: bx, cy: y(m.electric), r: 4.5, fill: surface, stroke: ink, "stroke-width": 1.5 }, lines);
      var beText = "break-even $" + h.fmt(m.breakEvenCredit, 0);
      if (bx <= M.l + pw - 100) label(tags, bx + 8, y(m.electric) + 16, beText, { cls: "ex-strong", halo: true });
      else label(tags, bx - 8, y(m.electric) - 9, beText, { anchor: "end", cls: "ex-strong", halo: true });

      // current setting: marker, both costs, and the part of the steam cost that is forgone credit
      var cx = x(state.credit), cur = h.el("g", {}, svg);
      h.el("line", { x1: cx, x2: cx, y1: M.t, y2: M.t + ph, stroke: ink, "stroke-opacity": 0.45, "stroke-dasharray": "3 3" }, cur);
      var side = cx > M.l + pw - 90 ? -1 : 1;   // bracket and its label go left near the right edge
      var y0 = y(m.steamSales), y1 = y(m.steam);
      if (y0 - y1 > 3) {
        var bxk = cx + side * 7;
        // reference: the steam route's cost without any credit (its value at a zero credit)
        h.el("line", { x1: x(0), x2: bxk, y1: y0, y2: y0, stroke: tc, "stroke-opacity": 0.5, "stroke-dasharray": "2 3" }, cur);
        h.el("line", { x1: bxk, x2: bxk, y1: y0, y2: y1, stroke: tc, "stroke-width": 3, "stroke-opacity": 0.55 }, cur);
        h.el("line", { x1: bxk - 3, x2: bxk + 3, y1: y0, y2: y0, stroke: tc, "stroke-width": 1.5 }, cur);
        h.el("line", { x1: bxk - 3, x2: bxk + 3, y1: y1, y2: y1, stroke: tc, "stroke-width": 1.5 }, cur);
        if (y0 - y1 > 16) label(tags, bxk + side * 6, (y0 + y1) / 2 + 4, "forgone credit", { anchor: side > 0 ? "start" : "end", fill: tc, halo: true });
      }
      h.el("circle", { cx: cx, cy: y(m.steam), r: 5, fill: tc, stroke: surface, "stroke-width": 1.5 }, cur);
      h.el("circle", { cx: cx, cy: y(m.electric), r: 5, fill: ac, stroke: surface, "stroke-width": 1.5 }, cur);
      svg.appendChild(tags);
    }

    function update() {
      var m = model(state);
      read({ steam: money(m.steam), elec: money(m.electric), be: "$" + h.fmt(m.breakEvenCredit, 0) + "/MWh" });
      var head = "At a <strong>$" + state.credit + "</strong> credit and <strong>$" + state.price + "</strong> power, " +
        "cooling with steam costs <strong>" + money(m.steam) + "</strong> per MWh in lost turbine output" +
        (state.credit > 0 ? ", " + money(m.steamCredit) + " of it credit" : "") + "; an electric chiller would use <strong>" +
        money(m.electric) + "</strong> of power. ";
      var be = "$" + h.fmt(m.breakEvenCredit, 0);
      var tail = m.cheaper === "tie" ? "The two routes cost about the same: this is the break-even credit."
        : m.cheaper === "steam" ? "<strong>Steam is cheaper</strong> until the credit reaches " + be +
          " (before the absorption chiller's own capital)."
        : "Above a " + be + " credit, <strong>generating power pays more</strong> than using the steam for cooling.";
      say(head + tail);
      redraw();
    }

    var redraw = h.responsive(chart, draw);
    h.onTheme(function () { drawLegend(); redraw(); });
    drawLegend();
    update();
  }

  if (typeof window !== "undefined" && window.Explainer) window.Explainer.register("nuclear-dc", view);
  if (typeof module !== "undefined" && module.exports) module.exports = { model: model, DEFAULTS: DEFAULTS };
})();
