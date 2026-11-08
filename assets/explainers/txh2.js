// txh2.js — interactive explainer on the Texas hydrogen (ERCOT) project page.
// Mechanism (the paper in Int. J. Hydrogen Energy 113:77–89, 2025, §3.3 p. 86 and Fig. 8b): when power from gas-fired
// (CCGT) plants costs more, the model installs fuel cells and turns green hydrogen into electricity; reformer (grey)
// hydrogen then fills industrial demand. Gas-plant CO2 falls, reformer CO2 rises more (the hydrogen-to-power round trip
// loses energy), so total emissions rise.
// Toy model with stylized numbers (not the study's inputs or results), documented and tested with Node
// separately. Structure: pure model() (exported for Node), then the view (browser only).
(function () {
  "use strict";

  // ---------------------------------------------------------------------------------------------------------------
  // Toy model. A fixed supply G of green hydrogen goes to industry (default) or to fuel cells. Fuel cells only replace
  // gas-fired power in shortfall hours; sorted, the shortfall falls linearly from P MW to 0 over T hours a year. A fuel
  // cell of size K runs at full power in the hours when the shortfall exceeds K: T (1 - K/P). Each MWh it makes uses
  // 1/mwhPerT tonnes of hydrogen that industry must then buy from reformers at cRef. The planner adds fuel-cell MW
  // while the gas power it saves pays for the fuel cell and the replacement hydrogen:
  //   (price - cRef/mwhPerT) * T (1 - K/P) = cf   ->   K = P (1 - r),  r = cf / ((price - cRef/mwhPerT) T)
  var C = {
    G: 6000,         // t/yr of green hydrogen (fixed)
    P: 100,          // MW, largest shortfall that gas-fired plants cover
    T: 2000,         // h/yr with a shortfall
    cf: 100000,      // $/MW-yr, fuel cell capital (annualized) plus fixed O&M
    mwhPerT: 16.7,   // MWh of electricity per tonne of hydrogen in a fuel cell (about 50% of 33.3 MWh/t)
    cRef: 1000,      // $/t, cost of reformer hydrogen that replaces green hydrogen in industry
    efGas: 0.4,      // t CO2 per MWh from gas-fired power
    efRef: 9,        // t CO2 per t of reformer hydrogen
    pMin: 40, pMax: 300, pStart: 150  // slider: price of gas-fired power, $/MWh
  };

  function model(params) {
    var c = Object.assign({}, C, (params && params.C) || {});
    var p = params.price;
    var opp = c.cRef / c.mwhPerT;                          // $/MWh: replacement hydrogen per MWh of fuel-cell power
    var r = p > opp ? c.cf / ((p - opp) * c.T) : Infinity;
    var K = r < 1 ? c.P * (1 - r) : 0;                     // MW of fuel cells
    var E = c.T * (K - K * K / (2 * c.P));                 // MWh/yr of fuel-cell power = integral of min(shortfall, K)
    var toPower = Math.min(c.G, E / c.mwhPerT);            // t/yr of green hydrogen sent to fuel cells
    E = toPower * c.mwhPerT;
    var dGas = -c.efGas * E, dRef = c.efRef * toPower;     // t CO2/yr, changes against "all green hydrogen to industry"
    return {
      price: p, threshold: opp + c.cf / c.T, fuelCellMW: K, fuelCellMWh: E,
      toPower: toPower, toIndustry: c.G - toPower, share: toPower / c.G,
      extraReformer: toPower,                              // t/yr more reformer hydrogen for industry
      dGas: dGas, dRef: dRef, dNet: dGas + dRef
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { model: model, C: C };
  if (typeof window === "undefined" || !window.Explainer) return;

  // ---------------------------------------------------------------------------------------------------------------
  // View: one slider (price of gas-fired power); an allocation bar and a chart of CO2 changes across the price range,
  // with the current price marked; the values at that price as a table ("Show the numbers"); three readouts; one sentence.
  window.Explainer.register("txh2", function (root, h) {
    var state = { price: C.pStart };
    var kt = function (t, signed) { var v = t / 1000; return (signed && v > 0.05 ? "+" : "") + h.fmt(v, Math.abs(v) < 10 ? 1 : 0); };

    var ui = h.scaffold(root, { title: "As gas-fired power gets more expensive, where does green hydrogen go, and what happens to CO₂?" });
    h.slider(ui.controls, {
      label: "Price of power from gas-fired plants", min: C.pMin, max: C.pMax, step: 5, value: state.price,
      format: function (v) { return "$" + v + "/MWh"; },
      hint: "Assumed: a fuel cell makes about 17 MWh from a tonne of hydrogen; gas-fired power emits 0.4 t CO₂/MWh; a reformer emits about 9 t CO₂ per tonne of hydrogen.",
      onInput: function (v) { state.price = v; update(); }
    });
    var svg = h.svg(ui.figure, { width: 400, height: 290, label: "Top: how a fixed supply of green hydrogen is split between industry and fuel cells at the chosen price. " +
      "Bottom: change in yearly CO₂ from gas-fired power, from reformers and in total, across prices of gas-fired power, compared with sending all green hydrogen to industry." });
    var g = h.el("g", {}, svg);
    var legend = h.el("div", { style: "display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin-top:.45rem;font-size:.78rem;color:var(--ink-2)" }, ui.figure);
    // the values at the chosen price as a table, for keyboard and screen-reader users (the SVG is one image)
    var data = h.el("details", { class: "ex-data" }, ui.figure);
    h.el("summary", { text: "Show the numbers" }, data);
    var table = h.el("table", {}, data);
    function fillTable(m) {
      var rows = [["Price of power from gas-fired plants", "$" + m.price + "/MWh"],
        ["Green hydrogen to industry", kt(m.toIndustry) + " kt a year (" + h.fmt((1 - m.share) * 100, 0) + "%)"],
        ["Green hydrogen to fuel cells", kt(m.toPower) + " kt a year (" + h.fmt(m.share * 100, 0) + "%)"],
        ["Fuel cells installed", h.fmt(m.fuelCellMW, 0) + " MW"], ["Power from fuel cells", h.fmt(m.fuelCellMWh / 1000, 1) + " GWh a year"],
        ["Extra reformer hydrogen", kt(m.extraReformer) + " kt a year"],
        ["Change in CO₂ from gas-fired power", kt(m.dGas, true) + " kt a year"], ["Change in CO₂ from reformers", kt(m.dRef, true) + " kt a year"],
        ["Net change in CO₂", kt(m.dNet, true) + " kt a year"]];
      table.innerHTML = "<caption>Illustrative values from the toy model, compared with sending all green hydrogen to industry</caption><tbody>" +
        rows.map(function (r) { return "<tr><th scope=\"row\">" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody>";
    }
    var set = h.readouts(ui.side, [
      { key: "share", label: "Green hydrogen to fuel cells" },
      { key: "ref", label: "Extra reformer hydrogen" },
      { key: "net", label: "Net change in CO₂" }
    ]);
    var say = h.sentence(ui.side);
    var redraw = null;

    function update() {
      var m = model(state);
      set({ share: h.fmt(m.share * 100, 0) + "%", ref: kt(m.extraReformer) + " kt/yr", net: kt(m.dNet, true) + " kt CO₂/yr" });
      fillTable(m);
      var price = "<strong>$" + m.price + "/MWh</strong>";
      if (m.share <= 0) {
        say("At " + price + ", gas-fired power is cheaper than making electricity from green hydrogen once the fuel cells and the reformer " +
            "hydrogen industry would need instead are paid for. All green hydrogen stays in industry, and emissions do not change.");
      } else {
        say("At " + price + ", fuel cells pay off and <strong>" + h.fmt(m.share * 100, 0) + "%</strong> of the green hydrogen becomes electricity. " +
            "Gas-fired CO₂ falls by " + kt(-m.dGas) + " kt a year, but reformers must replace that hydrogen and emit " + kt(m.dRef) +
            " kt more, since turning hydrogen back into power loses about half its energy. Total: <strong>" + kt(m.dNet, true) + " kt</strong>.");
      }
      if (redraw) redraw();
    }

    function inkOn(hex) {  // white or near-black text on a coloured fill, whichever contrasts more
      var mm = /^#?([0-9a-f]{6})$/i.exec(hex || "");
      if (!mm) return "#fff";
      var n = parseInt(mm[1], 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      var L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
      return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0687) ? "#fff" : "#111827";
    }

    function draw(w) {
      var m = model(state);
      var H = w < 420 ? 286 : 326, ml = 42, mr = 12;
      svg.setAttribute("viewBox", "0 0 " + w + " " + H);
      h.clear(g);
      var cInd = h.color("microgrid"), cPow = h.color("accent"), cInk = h.color("ink"), cSurf = h.color("surface");

      // --- allocation bar: where the fixed green hydrogen supply goes -------------------------------------------
      h.el("text", { x: ml - 36, y: 12, class: "ex-strong", text: "Where the green hydrogen goes (" + kt(C.G) + " kt a year)" }, g);
      var bx = h.scale(0, 1, ml - 36, w - mr), by = 20, bh = 24;
      [[0, 1 - m.share, cInd, "Industry"], [1 - m.share, 1, cPow, "Fuel cells"]].forEach(function (s) {
        var x0 = bx(s[0]) + (s[0] > 0 ? 1 : 0), x1 = bx(s[1]) - (s[1] < 1 ? 1 : 0), wd = x1 - x0;
        if (wd <= 0.5) return;
        var r = h.el("rect", { x: x0, y: by, width: wd, height: bh, rx: 4, fill: s[2] }, g);
        h.el("title", { text: s[3] + ": " + h.fmt((s[1] - s[0]) * 100, 0) + "% (" + kt((s[1] - s[0]) * C.G) + " kt a year)" }, r);
        var label = s[3] + " " + h.fmt((s[1] - s[0]) * 100, 0) + "%";
        if (wd > label.length * 6.4 + 12) h.el("text", { x: x0 + 7, y: by + 16, text: label, style: "fill:" + inkOn(s[2]) + ";font-weight:600" }, g);
      });

      // --- chart: change in CO2 across the price range, current price marked ------------------------------------
      var top = 78, bot = H - 38;
      var lo = -45000, hi = 60000;
      var x = h.scale(C.pMin, C.pMax, ml, w - mr), y = h.scale(lo, hi, bot, top);
      h.el("text", { x: ml - 36, y: top - 14, class: "ex-strong",
                     text: w < 440 ? "Change in CO₂ (kt a year) vs. no fuel cells" : "Change in CO₂ (kt a year) vs. all green hydrogen to industry" }, g);
      var grid = h.el("g", { class: "ex-grid" }, g);
      h.ticks(lo / 1000, hi / 1000, 5).forEach(function (v) {
        if (v !== 0) h.el("line", { x1: ml, x2: w - mr, y1: y(v * 1000), y2: y(v * 1000) }, grid);
        h.el("text", { x: ml - 6, y: y(v * 1000) + 4, "text-anchor": "end", text: (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) }, g);
      });
      var axis = h.el("g", { class: "ex-axis" }, g);
      h.el("line", { x1: ml, x2: w - mr, y1: y(0), y2: y(0), "stroke-width": 1.2 }, axis);
      h.el("line", { x1: ml, x2: w - mr, y1: bot, y2: bot }, axis);
      h.ticks(C.pMin, C.pMax, w < 360 ? 4 : 5).forEach(function (v) {
        if (v < C.pMin) return;
        h.el("line", { x1: x(v), x2: x(v), y1: bot, y2: bot + 4 }, axis);
        h.el("text", { x: x(v), y: bot + 16, "text-anchor": "middle", text: "$" + v }, g);
      });
      h.el("text", { x: ml, y: H - 4, text: "Price of power from gas-fired plants ($/MWh)" }, g);

      var series = [["dRef", cInd, 2, "Reformers"], ["dGas", cPow, 2, "Gas-fired power"], ["dNet", cInk, 2.5, "Net"]];
      var pts = { dRef: [], dGas: [], dNet: [] };
      for (var p = C.pMin; p <= C.pMax + 1e-9; p += 2) {
        var q = model({ price: p });
        series.forEach(function (s) { pts[s[0]].push(x(p).toFixed(1) + "," + y(q[s[0]]).toFixed(1)); });
      }
      series.forEach(function (s) {
        h.el("path", { d: "M" + pts[s[0]].join(" L"), fill: "none", stroke: s[1], "stroke-width": s[2], "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
      });
      // current price: marker line, dots with a surface ring, value label for the net change
      var xm = x(m.price);
      h.el("line", { x1: xm, x2: xm, y1: top - 4, y2: bot, stroke: cInk, "stroke-width": 1, "stroke-dasharray": "3 3", "stroke-opacity": 0.6 }, g);
      series.forEach(function (s) {
        var dot = h.el("circle", { cx: xm, cy: y(m[s[0]]), r: 4.5, fill: s[1], stroke: cSurf, "stroke-width": 2 }, g);
        h.el("title", { text: s[3] + ": " + kt(m[s[0]], true) + " kt CO₂ a year" }, dot);
      });
      // label left of the marker when it fits (the net line rises with price, so the left side stays clear)
      var netLab = m.share > 0 ? "Net " + kt(m.dNet, true) + " kt" : "No change", labW = netLab.length * 6.3;
      var left = xm - 8 - labW >= ml + 2;
      h.el("text", { x: xm + (left ? -8 : 8), y: y(m.dNet) - 8, "text-anchor": left ? "end" : "start", class: "ex-strong", text: netLab }, g);

      // legend (HTML so it wraps on phones)
      legend.innerHTML = "";
      [[cInd, "Reformer CO₂ (grey hydrogen for industry)"], [cPow, "Gas-fired power CO₂"], [cInk, "Net change"]].forEach(function (it) {
        var item = h.el("span", { style: "display:inline-flex;align-items:center;gap:.35rem" }, legend);
        h.el("span", { "aria-hidden": "true", style: "display:inline-block;width:1rem;height:2px;background:" + it[0] }, item);
        h.el("span", { text: it[1] }, item);
      });
    }

    redraw = h.responsive(ui.figure, draw);
    h.onTheme(function () { redraw(); });
    update();
  });
})();
