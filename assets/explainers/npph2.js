// npph2.js — interactive explainer on the nuclear–hydrogen (42 U.S. reactors) project page.
// Mechanism (the paper in Nature Communications 2026, Results on Cases 1–3 and Fig. 3): an existing reactor's capital is
// sunk, so revenue from electricity, hydrogen (with the assumed $3/kg hydrogen production credit) and reserves is set
// against running costs and the hydrogen equipment; a new plant must also repay its capital, which the same additions
// do not cover (new-build NPVs stayed negative). Wording rule: the study's positive results for existing reactors
// include the assumed hydrogen credit; never state or imply profitability without it.
// Toy model with stylized numbers (not the study's inputs or results), documented and tested with Node
// separately. Structure: pure model() (exported for Node), then the view (browser only).
(function () {
  "use strict";

  // ---------------------------------------------------------------------------------------------------------------
  // Toy model of one year for a 1,000-MW reactor. Hourly prices follow a sorted price-duration shape with mean 1,
  // scaled by the average price. With an electrolyzer, a share f of output can go to hydrogen in any hour where a MWh
  // earns more as hydrogen (yield * (sale price + credit - variable cost)) than as electricity. Reserves (a small,
  // fixed sum) need the electrolyzer's flexibility. Costs: running costs (operation and fuel) and hydrogen equipment;
  // a new reactor also repays its construction cost (annualized).
  var C = {
    out: 8000000,     // MWh/yr of reactor output (about 91% of 1,000 MW)
    f: 0.25,          // share of output the electrolyzer can take
    yieldKg: 25,      // kg of hydrogen per MWh of reactor output sent to the electrolyzer
    h2Price: 1.5,     // $/kg hydrogen sale price
    credit: 3.0,      // $/kg hydrogen production credit (the study assumed $3/kg for ten years)
    h2Var: 0.2,       // $/kg variable cost of hydrogen (water, stack wear)
    h2Fixed: 60,      // $M/yr, hydrogen equipment: capital (annualized) plus fixed O&M
    reserves: 8,      // $M/yr from reserves when the electrolyzer can vary its load
    running: 42,      // $/MWh, reactor operation, maintenance and fuel
    capitalNew: 520,  // $M/yr, construction cost of a new reactor, annualized
    bins: 200,        // price-duration bins
    pMin: 20, pMax: 40, pStart: 32  // slider: average electricity price, $/MWh
  };
  var MODES = ["elec", "h2", "credit"];  // electricity only; + hydrogen and reserves; + hydrogen credit

  function shape(u) { return 0.4 + 3 * Math.pow(1 - u, 4); }  // price relative to the average (mean 1 on [0, 1])
  var SHAPE = (function () {
    var s = [], sum = 0, i;
    for (i = 0; i < C.bins; i++) { s.push(shape((i + 0.5) / C.bins)); sum += s[i]; }
    return s.map(function (v) { return v * C.bins / sum; });     // normalize the discrete mean to exactly 1
  })();

  function model(params) {
    var c = Object.assign({}, C, (params && params.C) || {});
    var p = params.price, mode = params.mode || "credit";
    var h2 = mode !== "elec", cr = mode === "credit";
    var perMWh = c.yieldKg * (c.h2Price + (cr ? c.credit : 0) - c.h2Var);  // $ a MWh earns as hydrogen, net of variable cost
    var per = c.out / SHAPE.length, elec = 0, toH2 = 0;
    SHAPE.forEach(function (g) {
      var price = p * g, d = h2 && perMWh > price ? c.f * per : 0;
      elec += price * (per - d);
      toH2 += d;
    });
    var kg = toH2 * c.yieldKg;
    var rev = { electricity: elec / 1e6, hydrogen: kg * c.h2Price / 1e6, credit: cr ? kg * c.credit / 1e6 : 0, reserves: h2 ? c.reserves : 0 };
    var cost = { running: c.running * c.out / 1e6, hydrogen: h2 ? c.h2Fixed + kg * c.h2Var / 1e6 : 0, capital: c.capitalNew };
    var revenue = rev.electricity + rev.hydrogen + rev.credit + rev.reserves;
    var existingCost = cost.running + cost.hydrogen, newCost = existingCost + cost.capital;
    return {
      price: p, mode: mode, rev: rev, cost: cost, revenue: revenue,
      existingCost: existingCost, newCost: newCost,
      existingNet: revenue - existingCost, newNet: revenue - newCost,   // $M/yr
      shareH2: toH2 / c.out, hydrogenKt: kg / 1e6
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { model: model, C: C, MODES: MODES };
  if (typeof window === "undefined" || !window.Explainer) return;

  // ---------------------------------------------------------------------------------------------------------------
  // View: a three-way toggle (revenue streams) and a slider (average electricity price); three stacked bars
  // (revenue, existing-reactor costs, new-reactor costs) on one $M/yr axis; three readouts; one sentence.
  window.Explainer.register("npph2", function (root, h) {
    var state = { price: C.pStart, mode: "credit" };
    var XMAX = 1000;  // fixed axis so bars stay comparable across states
    var musd = function (v, signed) { return (signed ? (v >= 0 ? "+" : "−") : "") + "$" + h.fmt(Math.abs(v), 0) + "M"; };

    var ui = h.scaffold(root, { title: "Do the same revenue streams cover the costs of an existing reactor, and of a new one?" });
    h.toggle(ui.controls, {
      label: "Revenue streams", value: state.mode,
      options: [{ value: "elec", label: "Power" }, { value: "h2", label: "+ Hydrogen" }, { value: "credit", label: "+ H₂ credit" }],
      onChange: function (v) { state.mode = v; update(); }
    });
    h.slider(ui.controls, {
      label: "Average electricity price", min: C.pMin, max: C.pMax, step: 1, value: state.price,
      format: function (v) { return "$" + v + "/MWh"; },
      hint: "One year for a 1,000-MW reactor. “+ Hydrogen” adds hydrogen sales and reserves; “+ H₂ credit” adds a $3/kg production credit, paid for the first ten years (the bars show such a year).",
      onInput: function (v) { state.price = v; update(); }
    });
    var svg = h.svg(ui.figure, { width: 400, height: 260, label: "Stacked bars in millions of dollars a year: revenue from electricity, hydrogen sales, " +
      "the hydrogen credit and reserves; the costs of an existing reactor; and the costs of a new reactor, which add its construction cost." });
    var g = h.el("g", {}, svg);
    var legend = h.el("div", { style: "display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin-top:.45rem;font-size:.78rem;color:var(--ink-2)" }, ui.figure);
    // the bar segments as a table, for keyboard and screen-reader users (the SVG is one image)
    var data = h.el("details", { class: "ex-data" }, ui.figure);
    h.el("summary", { text: "Show the numbers" }, data);
    var table = h.el("table", {}, data);
    function fillTable(m) {
      var rows = [["Revenue: electricity", m.rev.electricity], ["Revenue: hydrogen sales", m.rev.hydrogen],
        ["Revenue: hydrogen credit", m.rev.credit], ["Revenue: reserves", m.rev.reserves], ["Revenue: total", m.revenue],
        ["Existing reactor: running costs", m.cost.running], ["Existing reactor: hydrogen equipment", m.cost.hydrogen],
        ["Existing reactor: total costs", m.existingCost], ["New reactor: construction cost (added)", m.cost.capital],
        ["New reactor: total costs", m.newCost]];
      table.innerHTML = "<caption>Illustrative values, millions of dollars a year</caption><tbody>" + rows.map(function (r) {
        return "<tr><th scope=\"row\">" + r[0] + "</th><td>" + musd(r[1]) + "</td></tr>"; }).join("") + "</tbody>";
    }
    var set = h.readouts(ui.side, [
      { key: "ex", label: "Existing reactor: revenue − costs" },
      { key: "nw", label: "New reactor: revenue − costs" },
      { key: "h2", label: "Output sent to hydrogen" }
    ]);
    var say = h.sentence(ui.side);
    var redraw = null;

    function update() {
      var m = model(state);
      set({ ex: musd(m.existingNet, true) + "/yr", nw: musd(m.newNet, true) + "/yr", h2: h.fmt(m.shareH2 * 100, 0) + "%" });
      fillTable(m);
      var price = "<strong>$" + m.price + "/MWh</strong>";
      var newPart = " A new reactor must also repay its construction cost: far more than these streams add.";
      if (m.mode === "elec") {
        say("Selling only power at an average " + price + ", revenue falls short of even the existing reactor's running costs here." + newPart);
      } else if (m.mode === "h2") {
        say("In this toy model, without the credit, hydrogen beats selling power only in lower-price hours (the electrolyzer runs <strong>" +
            h.fmt(m.shareH2 / C.f * 100, 0) + "%</strong> of the time), and here it earns less than the equipment costs. (The paper assumes the credit in every case.)" + newPart);
      } else {
        say("With the credit, a MWh earns more as hydrogen in almost every hour, so <strong>" + h.fmt(m.shareH2 * 100, 0) +
            "%</strong> of output goes to hydrogen and revenue " +
            (m.existingNet >= 0 ? "<strong>covers</strong> the existing reactor's costs." : "still falls short at this low power price.") + newPart);
      }
      if (redraw) redraw();
    }

    function hatch(defs, id, col) {  // diagonal stripes for the credit, so it is not told apart by colour alone
      var pat = h.el("pattern", { id: id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
      h.el("rect", { width: 6, height: 6, fill: col, "fill-opacity": 0.35 }, pat);
      h.el("rect", { width: 3, height: 6, fill: col }, pat);
    }

    var hatchId = "ex-npph2-hatch-" + Math.random().toString(36).slice(2, 8);

    function draw(w) {
      var m = model(state);
      var cEl = h.color("accent"), cH2 = h.color("hydrogen"), cRes = h.color("microgrid"), cRun = h.color("muted"),
          cCap = h.color("datacenter"), cInk = h.color("ink");
      var ml = 8, mr = w < 420 ? 74 : 92, rowH = 54, top = 10, bh = 22;
      var H = top + rowH * 3 + 30;
      svg.setAttribute("viewBox", "0 0 " + w + " " + H);
      h.clear(g);
      var defs = h.el("defs", {}, g);
      hatch(defs, hatchId, cH2);
      var x = h.scale(0, XMAX, ml, w - mr);

      var grid = h.el("g", { class: "ex-grid" }, g);
      var ticks = h.ticks(0, XMAX, w < 420 ? 4 : 5);
      ticks.forEach(function (v) {
        if (v > 0) h.el("line", { x1: x(v), x2: x(v), y1: top, y2: top + rowH * 3 - 8 }, grid);
        h.el("text", { x: x(v), y: top + rowH * 3 + 8, "text-anchor": v === 0 ? "start" : "middle", text: h.fmt(v, 0) }, g);
      });
      h.el("text", { x: ml, y: H - 4, text: "Millions of dollars a year" }, g);

      var rows = [
        { label: "Revenue (the same for both reactors)", total: m.revenue, parts: [
          ["Electricity", m.rev.electricity, cEl], ["Hydrogen sales", m.rev.hydrogen, cH2],
          ["Hydrogen credit", m.rev.credit, "url(#" + hatchId + ")"], ["Reserves", m.rev.reserves, cRes]] },
        { label: "Costs: existing reactor", total: m.existingCost, net: m.existingNet, parts: [
          ["Running costs", m.cost.running, cRun], ["Hydrogen equipment", m.cost.hydrogen, cH2, 0.5]] },
        { label: "Costs: new reactor", total: m.newCost, net: m.newNet, parts: [
          ["Running costs", m.cost.running, cRun], ["Hydrogen equipment", m.cost.hydrogen, cH2, 0.5],
          ["Construction cost", m.cost.capital, cCap]] }
      ];
      rows.forEach(function (row, i) {
        var y0 = top + i * rowH, yb = y0 + 16;
        h.el("text", { x: ml, y: y0 + 9, class: "ex-strong", text: row.label }, g);
        var acc = 0, drawn = row.parts.filter(function (pt) { return pt[1] > 0.05; });
        drawn.forEach(function (pt, j) {
          var x0 = x(acc) + (j > 0 ? 1 : 0), x1 = x(acc + pt[1]) - (j < drawn.length - 1 ? 1 : 0);
          acc += pt[1];
          if (x1 - x0 <= 0.3) return;
          var last = j === drawn.length - 1;  // rounded data end only on the last segment; square at the baseline
          var rect = last
            ? h.el("path", { d: "M" + x0 + "," + yb + " H" + (x1 - 4) + " a4,4 0 0 1 4,4 V" + (yb + bh - 4) + " a4,4 0 0 1 -4,4 H" + x0 + " Z", fill: pt[2] }, g)
            : h.el("rect", { x: x0, y: yb, width: x1 - x0, height: bh, fill: pt[2] }, g);
          if (pt[3]) rect.setAttribute("fill-opacity", pt[3]);
          h.el("title", { text: pt[0] + ": $" + h.fmt(pt[1], 0) + "M a year" }, rect);
        });
        // total at the bar end; on cost rows keep it clear of the dashed revenue line
        var tx = x(row.net !== undefined && row.net > 0 ? m.revenue : row.total) + 6, lab = musd(row.total);
        h.el("text", { x: tx, y: yb + 15, class: "ex-strong", text: lab }, g);
        if (row.net !== undefined) {
          var ok = row.net >= 0;
          h.el("text", { x: tx, y: yb + 15 + 13, text: ok ? "covered" : "short " + musd(-row.net) }, g);
        }
      });
      // revenue level marked on each cost bar (not through the row labels), so the gap is visible
      var xr = x(m.revenue);
      [1, 2].forEach(function (i) {
        var yb = top + i * rowH + 16;
        h.el("line", { x1: xr, x2: xr, y1: yb - 4, y2: yb + bh + 4, stroke: cInk, "stroke-width": 1.5, "stroke-dasharray": "4 2" }, g);
      });

      // legend (HTML so it wraps on phones)
      legend.innerHTML = "";
      [["Electricity", cEl, 1], ["Hydrogen sales", cH2, 1], ["Hydrogen credit", cH2, "hatch"], ["Reserves", cRes, 1],
       ["Running costs", cRun, 1], ["Hydrogen equipment", cH2, 0.5], ["Construction cost", cCap, 1], ["Revenue level", cInk, "dash"]].forEach(function (it) {
        var item = h.el("span", { style: "display:inline-flex;align-items:center;gap:.35rem" }, legend);
        var sw = it[2] === "dash" ? "width:1rem;height:0;border-top:2px dashed " + it[1]
               : it[2] === "hatch" ? "width:.8rem;height:.8rem;border-radius:2px;background:repeating-linear-gradient(45deg," + it[1] + " 0 2px,transparent 2px 4px);box-shadow:inset 0 0 0 1px " + it[1]
               : "width:.8rem;height:.8rem;border-radius:2px;background:" + it[1] + ";opacity:" + it[2];
        h.el("span", { "aria-hidden": "true", style: "display:inline-block;" + sw }, item);
        h.el("span", { text: it[0] }, item);
      });
    }

    redraw = h.responsive(ui.figure, draw);
    h.onTheme(function () { redraw(); });
    update();
  });
})();
