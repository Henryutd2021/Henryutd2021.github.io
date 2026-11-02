// wind-hydrogen.js — interactive explainer on the co-located wind–hydrogen project page (website v2, 2026-11-02).
// Mechanism (the paper in J. Mech. Des. 146(2):020903, 2024, §3.2.1 and Fig. 7): a higher hydrogen selling price makes
// the optimizer install a larger electrolyzer; its utilization falls, so the levelized cost of hydrogen (LCOH) rises
// while the system's net cost falls. LCOH alone can therefore point to the wrong design.
// Toy model with stylized numbers (not the study's inputs or results), documented and tested with Node
// separately. Structure: pure model() (exported for Node), then the view (browser only).
(function () {
  "use strict";

  // ---------------------------------------------------------------------------------------------------------------
  // Toy model. Surplus wind power the grid cannot take (curtailed unless used) is sorted from the windiest hour down:
  // s(u) = S (1 - u)^k for u = t / Ts in [0, 1], zero for the rest of the year. An electrolyzer of size K uses
  // min(s, K). The optimizer picks K to minimize net system cost = C0 + ce*K + v*H - price*H (H = hydrogen made),
  // i.e. it adds megawatts until the last one, which runs at full power only in the hours when s > K, just pays back
  // its annual cost: (price - v) * eta * hoursAbove(K) = ce.
  var C = {
    S: 160,      // MW, largest hourly wind surplus
    Ts: 5500,    // h/yr with some surplus
    k: 1.5,      // shape of the sorted surplus curve (> 1: a few very windy hours)
    hours: 8760, // h/yr
    ce: 140000,  // $/MW-yr, electrolyzer capital (annualized) plus fixed O&M
    eta: 18,     // kg of hydrogen per MWh (about 55 kWh/kg)
    v: 0.2,      // $/kg variable cost (water, stack wear)
    C0: 30,      // $M/yr, wind farm cost net of its electricity sales (the same in every case)
    pMin: 2, pMax: 6, pStart: 3.5  // slider range and start, $/kg
  };

  function surplusAt(t, c) {  // MW of surplus in the t-th windiest hour
    return t >= c.Ts ? 0 : c.S * Math.pow(1 - t / c.Ts, c.k);
  }

  function model(params) {
    var c = Object.assign({}, C, (params && params.C) || {});
    var p = params.price;
    var perMWh = (p - c.v) * c.eta;                           // $ earned per MWh of surplus turned into hydrogen
    var r = perMWh > 0 ? c.ce / (perMWh * c.Ts) : Infinity;   // full-power hours the last MW needs, as a share of Ts
    var K = r < 1 ? c.S * Math.pow(1 - r, c.k) : 0;           // optimal electrolyzer size, MW
    var x = Math.pow(K / c.S, 1 / c.k);
    var E = K > 0 ? c.Ts * K * (1 - c.k / (c.k + 1) * x) : 0; // MWh/yr used: integral of min(s, K)
    var H = c.eta * E;                                        // kg/yr
    var surplus = c.S * c.Ts / (c.k + 1);                     // MWh/yr of surplus in total
    var elecCost = c.ce * K + c.v * H;                        // $/yr
    return {
      price: p, size: K, energy: E, hydrogen: H, surplus: surplus,
      fullHours: c.Ts * (1 - x),                              // h/yr the electrolyzer runs at full power
      cf: K > 0 ? E / (c.hours * K) : NaN,                    // capacity factor: average output / size
      lcoh: H > 0 ? elecCost / H : NaN,                       // $/kg: electrolyzer cost per kg (surplus power is free)
      netCost: c.C0 + (elecCost - p * H) / 1e6,               // $M/yr: costs minus hydrogen revenue
      curtailedShare: 1 - E / surplus
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { model: model, C: C, surplusAt: surplusAt };
  if (typeof window === "undefined" || !window.Explainer) return;

  // ---------------------------------------------------------------------------------------------------------------
  // View: one slider (hydrogen price), a sorted-surplus chart with the electrolyzer size, three readouts, one sentence.
  window.Explainer.register("wind-hydrogen", function (root, h) {
    var state = { price: C.pStart };
    var ref = model({ price: C.pMin });  // the comparison case: the lowest price on the slider
    var money = function (v) { return "$" + v.toFixed(2) + "/kg"; };

    var ui = h.scaffold(root, { title: "As the hydrogen price rises, what happens to the electrolyzer, the cost per kilogram and the system's net cost?" });
    h.slider(ui.controls, {
      label: "Hydrogen selling price", min: C.pMin, max: C.pMax, step: 0.25, value: state.price, format: money,
      hint: "The optimizer sizes the electrolyzer to minimize the system's net cost. Capacity factor = average output ÷ size.",
      onInput: function (v) { state.price = v; update(); }
    });
    var svg = h.svg(ui.figure, { width: 400, height: 250, label: "Chart: surplus wind power over the hours of a year, sorted from the windiest hour. " +
      "A dashed line marks the electrolyzer size; the area under both is turned into hydrogen, the rest is still curtailed." });
    var g = h.el("g", {}, svg);
    var legend = h.el("div", { style: "display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin-top:.45rem;font-size:.78rem;color:var(--ink-2)" }, ui.figure);
    var set = h.readouts(ui.side, [
      { key: "size", label: "Electrolyzer size" },
      { key: "lcoh", label: "Levelized cost of hydrogen" },
      { key: "net", label: "Net system cost" }
    ]);
    var say = h.sentence(ui.side);
    var redraw = null;

    function update() {
      var m = model(state);
      set({ size: h.fmt(m.size, 0) + " MW", lcoh: money(m.lcoh), net: "$" + h.fmt(m.netCost, 1) + "M/yr" });
      if (state.price <= C.pMin + 1e-9) {
        say("At <strong>" + money(m.price) + "</strong>, hydrogen sells for little more than it costs to make, so the optimizer builds only a " +
            "<strong>" + h.fmt(m.size, 0) + "-MW</strong> electrolyzer with a capacity factor of " + h.fmt(m.cf * 100, 0) + "%. Raise the price to see the trade-off.");
      } else {
        say("At <strong>" + money(m.price) + "</strong>, the optimizer builds a <strong>" + h.fmt(m.size, 0) + "-MW</strong> electrolyzer whose added " +
            "megawatts run only in the windiest hours. Compared with " + money(C.pMin) + ", the cost per kilogram rises (" + money(ref.lcoh).replace("/kg", "") +
            " → <strong>" + money(m.lcoh) + "</strong>), yet net system cost falls ($" + h.fmt(ref.netCost, 1) + "M → <strong>$" + h.fmt(m.netCost, 1) +
            "M</strong> a year). The cost per kilogram and the system's cost move in opposite directions.");
      }
      if (redraw) redraw();
    }

    function draw(w) {
      var m = model(state);
      var H = w < 420 ? 236 : 296, ml = 40, mr = 10, mt = 28, mb = 38;
      svg.setAttribute("viewBox", "0 0 " + w + " " + H);
      h.clear(g);
      var x = h.scale(0, C.hours, ml, w - mr), y = h.scale(0, C.S * 1.06, H - mb, mt);
      var cWind = h.color("wind"), cH2 = h.color("hydrogen"), cMuted = h.color("muted"), cInk = h.color("ink");

      // grid, axes, titles
      var grid = h.el("g", { class: "ex-grid" }, g);
      h.ticks(0, C.S, 4).forEach(function (v) {
        if (v > 0) h.el("line", { x1: ml, x2: w - mr, y1: y(v), y2: y(v) }, grid);
        h.el("text", { x: ml - 6, y: y(v) + 4, "text-anchor": "end", text: h.fmt(v, 0) }, g);
      });
      var axis = h.el("g", { class: "ex-axis" }, g);
      h.el("line", { x1: ml, x2: w - mr, y1: y(0), y2: y(0) }, axis);
      h.ticks(0, C.hours, 4).forEach(function (v) {
        h.el("line", { x1: x(v), x2: x(v), y1: y(0), y2: y(0) + 4 }, axis);
        h.el("text", { x: x(v), y: y(0) + 16, "text-anchor": v === 0 ? "start" : "middle", text: h.fmt(v, 0) }, g);
      });
      h.el("text", { x: ml, y: H - 4, text: "Hours of the year, windiest first" }, g);
      h.el("text", { x: ml - 34, y: 12, text: "Surplus wind (MW) that the grid cannot take" }, g);

      // areas: used for hydrogen = under min(s, K); still curtailed = between s and K where s > K
      var n = 90, used = [], top = [], i, t;
      for (i = 0; i <= n; i++) { t = C.Ts * i / n; used.push([x(t), y(Math.min(surplusAt(t, C), m.size))]); }
      var usedPath = "M" + x(0) + "," + y(0) + " L" + used.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" L") +
                     " L" + x(C.Ts) + "," + y(0) + " Z";
      var aUsed = h.el("path", { d: usedPath, fill: cH2, "fill-opacity": 0.32 }, g);
      h.el("title", { text: "Turned into hydrogen: " + h.fmt(m.energy / 1000, 0) + " GWh a year (" + h.fmt((1 - m.curtailedShare) * 100, 0) + "% of the surplus)" }, aUsed);
      if (m.fullHours > 0) {
        var up = [], dn = [];
        for (i = 0; i <= n; i++) { t = m.fullHours * i / n; up.push(x(t).toFixed(1) + "," + y(surplusAt(t, C)).toFixed(1)); dn.push(x(t).toFixed(1) + "," + y(m.size).toFixed(1)); }
        var aCurt = h.el("path", { d: "M" + up.join(" L") + " L" + dn.reverse().join(" L") + " Z", fill: cMuted, "fill-opacity": 0.2 }, g);
        h.el("title", { text: "Still curtailed: " + h.fmt(m.curtailedShare * 100, 0) + "% of the surplus" }, aCurt);
      }
      for (i = 0; i <= n; i++) { t = C.Ts * i / n; top.push(x(t).toFixed(1) + "," + y(surplusAt(t, C)).toFixed(1)); }
      top.push(x(C.hours).toFixed(1) + "," + y(0).toFixed(1));
      h.el("path", { d: "M" + top.join(" L"), fill: "none", stroke: cWind, "stroke-width": 2, "stroke-linejoin": "round" }, g);

      // electrolyzer size: dashed line across the whole year (its capacity); labels
      var yk = y(m.size);
      h.el("line", { x1: x(0), x2: x(C.hours), y1: yk, y2: yk, stroke: cInk, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, g);
      var lab = "Electrolyzer " + h.fmt(m.size, 0) + " MW", cfLab = "capacity factor " + h.fmt(m.cf * 100, 0) + "%";
      var roomBelow = y(0) - yk > 30;
      h.el("text", { x: w - mr, y: roomBelow ? yk - 6 : yk - 20, "text-anchor": "end", class: "ex-strong", text: lab }, g);
      h.el("text", { x: w - mr, y: roomBelow ? yk + 15 : yk - 6, "text-anchor": "end", text: cfLab }, g);

      // legend (HTML so it wraps on phones)
      legend.innerHTML = "";
      [["fill", cH2, 0.45, "Turned into hydrogen"], ["fill", cMuted, 0.35, "Still curtailed"],
       ["line", cWind, 1, "Surplus wind"], ["dash", cInk, 1, "Electrolyzer size"]].forEach(function (it) {
        var item = h.el("span", { style: "display:inline-flex;align-items:center;gap:.35rem" }, legend);
        var sw = it[0] === "fill" ? "width:.8rem;height:.8rem;border-radius:2px;background:" + it[1] + ";opacity:" + it[2]
               : it[0] === "line" ? "width:1rem;height:2px;background:" + it[1]
               : "width:1rem;height:0;border-top:2px dashed " + it[1];
        h.el("span", { "aria-hidden": "true", style: "display:inline-block;" + sw }, item);
        h.el("span", { text: it[3] }, item);
      });
    }

    redraw = h.responsive(ui.figure, draw);
    h.onTheme(function () { redraw(); });
    update();
  });
})();
