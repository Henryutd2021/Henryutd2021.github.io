/* supplystack.js — LX.SupplyStack: one hour's supply stack. Each offer is a block as wide as its MW and as high as its
   price, cheapest first; a vertical demand line, the clearing price as a dotted line, the marginal block outlined, the
   unused (or spilled) part of a block pale, and negative offers below the zero line (lesson 8).
   var ch = LX.SupplyStack(host, {
     series: { wind: { name: "Wind farm", short: "Wind", color: "var(--lx-wind)" }, ... },   one entry per block key:
                                 name in the text version and spoken label, short on the block (when it is wide enough)
     clear: function (blocks, demand) -> { price, marginal, plants: { key: { run } }, spilled }   the lesson's own market
                                 clearing (default: LX.SupplyStack.clear, uniform price, cheapest first, the lower block
                                 marginal at an exact edge; wind and solar left unused count as spilled)
     noLegend: false,            true: hide the legend ("Running", "Not needed or spilled", "Demand")
     later: true });             the legend and text version are appended after the step's other controls (next microtask);
                                 false: right under the chart
   ch.draw(blocks [{ key, mw, offer }] (cheapest first), demand MW, { xMax: 450, hideDemand: false }) -> the clearing result
     (hideDemand: just the blocks, full colour, no price; for building a stack). Money reads "$40.00" and "−$5.00".
     Tick steps: { xStep: 1000, yStep: 50 } in draw's options, or xStep / yStep in the constructor's options for every
     draw: MW labels every xStep, $/MWh gridlines every yStep from the axis start (defaults: 100 or 150 MW; $20 or $40).
   ch.el (the chart box). It redraws itself on resize and on the day/night switch.
   Text version (details.lx-textalt): one line per block ("Wind farm: offers 150 MW at $0.00/MWh; runs 120 MW.") and the
   demand, price and spilled MW. The SVG has a spoken summary (role img); nothing to operate by keyboard.
   Node: module.exports = { clear, scaleOf } (pure: the clearing and the axes; scaleOf(blocks, xMax, { xStep, yStep })). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  // uniform-price clearing of offers sorted cheapest first; spillKeys: blocks whose unused MW is spilled (wind and sun)
  function clear(blocks, demand, spillKeys) {
    var left = demand, cum = 0, cost = 0, out = {}, marginal = null, total = 0, sk = spillKeys || ["wind", "solar"];
    blocks.forEach(function (b) {
      var use = Math.max(0, Math.min(b.mw, left));
      out[b.key] = { key: b.key, mw: b.mw, offer: b.offer, run: use, start: cum };
      if (use > 0 && left - use <= 1e-9 && !marginal) marginal = b.key;
      left -= use; cum += b.mw; cost += use * b.offer; total += b.mw;
    });
    if (!marginal && demand <= 1e-9) marginal = blocks[0].key;
    var price = marginal ? out[marginal].offer : NaN, spilled = 0;
    sk.forEach(function (k) { if (out[k]) spilled += out[k].mw - out[k].run; });
    return { price: price, marginal: marginal, cost: cost, plants: out, short: Math.max(0, left), spilled: spilled, total: total };
  }
  // the axes: $/MWh from yMin (below zero only for a negative offer) to yMax, gridlines every `step`; MW from 0 to xMax,
  // labelled every `xStep`; steps.xStep and steps.yStep (positive numbers) replace the default steps
  function scaleOf(blocks, xMax, steps) {
    var offers = blocks.map(function (b) { return b.offer; });
    var yMax = Math.max(120, Math.ceil((Math.max.apply(null, offers) + 15) / 40) * 40), lowest = Math.min.apply(null, offers);
    var yMin = lowest < 0 ? Math.floor((lowest - 10) / 20) * 20 : 0;
    var st = steps || {};
    return { xMax: xMax || 450, yMax: yMax, yMin: yMin, step: st.yStep > 0 ? st.yStep : yMax - yMin > 200 ? 40 : 20,
      xStep: st.xStep > 0 ? st.xStep : (xMax || 450) > 500 ? 150 : 100 };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { clear: clear, scaleOf: scaleOf };
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S;
  function usd(v, d) { d = d == null ? 2 : d; return (v < -1e-9 ? "−⁠$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  LX.SupplyStack = function (host, o) {
    o = o || {};
    var SE = o.series || {}, clr = o.clear || function (b, d) { return clear(b, d); };
    function nm(k) { return (SE[k] && SE[k].name) || k; }
    function sh(k) { return (SE[k] && SE[k].short) || nm(k); }
    function col(k) { return (SE[k] && SE[k].color) || "var(--lx-ink-3)"; }
    var w = H("div", { class: "lx-stack" }, host), tail = H("div", { class: "lx-stack-tail" }), svg = null, last = null;
    var legend = H("div", { class: "lx-legend", "aria-hidden": "true", hidden: !!o.noLegend }, tail);
    var alt = H("details", { class: "lx-textalt" }, tail); H("summary", { text: "Text version" }, alt); alt = H("div", null, alt);
    if (o.later === false) host.appendChild(tail); else Promise.resolve().then(function () { host.appendChild(tail); });
    [["Running", "var(--lx-ink-2)"], ["Not needed or spilled", "var(--lx-line-2)"]].forEach(function (l, j) { var s = H("span", null, legend); H("i", { style: "--c:" + l[1] + (j ? ";opacity:.5" : "") }, s); H("span", { text: l[0] }, s); });
    var dl = H("span", null, legend); H("i", { class: "line" }, dl); H("span", { text: "Demand" }, dl);
    function draw(blocks, demand, opt) {
      last = [blocks, demand, opt]; opt = opt || {};
      var res = clr(blocks, demand), W = Math.max(280, w.clientWidth || 640), Hh = W < 480 ? 230 : 250, m = { l: 46, r: 12, t: 26, b: 34 };
      var sc = scaleOf(blocks, opt.xMax, { xStep: opt.xStep || o.xStep, yStep: opt.yStep || o.yStep }), xMax = sc.xMax, yMax = sc.yMax, yMin = sc.yMin;
      var iw = W - m.l - m.r, ih = Hh - m.t - m.b, x = function (v) { return m.l + v / xMax * iw; }, y = function (v) { return m.t + (yMax - v) / (yMax - yMin) * ih; };
      if (svg) svg.remove();
      var show = opt.hideDemand ? null : res;
      svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": "Supply stack: " + blocks.map(function (b) { return nm(b.key) + " " + b.mw + " MW at " + usd(b.offer) + " per MWh"; }).join("; ") +
        (show ? ". Demand " + demand + " MW; clearing price " + usd(res.price) + " per MWh, set by the " + nm(res.marginal).toLowerCase() + "." : ".") }, w);
      for (var v = yMin; v <= yMax; v += sc.step) {
        S("path", { d: "M" + m.l + " " + y(v) + "H" + (W - m.r), stroke: v === 0 ? "var(--lx-ink-3)" : "var(--lx-line)", "stroke-width": v === 0 ? 1.3 : 1 }, svg);
        S("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = usd(v, 0);
      }
      for (var q = 0; q <= xMax; q += sc.xStep) S("text", { x: x(q), y: Hh - 16, "text-anchor": q === 0 ? "start" : "middle" }, svg).textContent = q;
      S("text", { x: W - m.r, y: Hh - 3, "text-anchor": "end" }, svg).textContent = "MW, cheapest first →";
      S("text", { x: 2, y: 13 }, svg).textContent = "$/MWh";
      var cum = 0, labs = [];   // block labels: [x centre, baseline, width], so the price label can keep clear of them
      blocks.forEach(function (b) {
        if (b.mw <= 0) return;
        var p = res.plants[b.key], x0 = x(cum), x1 = x(cum + b.mw), xr = x(cum + p.run), top = Math.abs(b.offer) < 2 ? y(0) - 4 : Math.min(y(b.offer), y(0)), bot = Math.abs(b.offer) < 2 ? y(0) : Math.max(y(b.offer), y(0));
        if (p.run > 0 && show) S("rect", { x: x0, y: top, width: Math.max(0, xr - x0), height: Math.max(2, bot - top), fill: col(b.key) }, svg);
        if (!show || p.run < b.mw) S("rect", { x: show ? xr : x0, y: top, width: Math.max(0, x1 - (show ? xr : x0)), height: Math.max(2, bot - top), fill: col(b.key), "fill-opacity": show ? 0.28 : 0.9 }, svg);
        S("rect", { x: x0, y: top, width: Math.max(0, x1 - x0), height: Math.max(2, bot - top), fill: "none", stroke: show && res.marginal === b.key ? "var(--lx-ink)" : "var(--lx-surface)", "stroke-width": show && res.marginal === b.key ? 2 : 1 }, svg);
        if (x1 - x0 > 34) {
          var ly = b.offer >= 0 ? Math.min(y(b.offer), y(0) - 4) - 6 : (y(0) + y(b.offer)) / 2 + 4;
          S("text", { x: (x0 + x1) / 2, y: ly, "text-anchor": "middle", class: "lab bg" }, svg).textContent = sh(b.key);
          S("text", { x: (x0 + x1) / 2, y: ly, "text-anchor": "middle", class: "lab" }, svg).textContent = sh(b.key);
          labs.push([(x0 + x1) / 2, ly, sh(b.key).length * 7]);
        }
        cum += b.mw;
      });
      if (show) {
        var xd = x(demand), yp = y(res.price);
        S("path", { d: "M" + m.l + " " + yp + "H" + xd, stroke: "var(--lx-ink)", "stroke-width": 1.6, "stroke-dasharray": "2 3" }, svg);
        S("path", { d: "M" + xd + " " + (m.t - 6) + "V" + (Hh - m.b), stroke: "var(--lx-ink)", "stroke-width": 2, "stroke-dasharray": "6 4" }, svg);
        var anchor = xd > W - 120 ? "end" : "start", dx = anchor === "end" ? -6 : 6;
        ["big bg", "big"].forEach(function (c) { S("text", { x: xd + dx, y: 13, "text-anchor": anchor, class: c }, svg).textContent = "Demand " + Math.round(demand) + " MW"; });
        var pt = "Price " + usd(res.price), py = res.price < 0 ? m.t + 14 : yp - 6, pw = pt.length * 7.6;
        // a block's label at the same height (a $0 block next to the axis, on a phone) would sit under the price: lift the price a line
        if (labs.some(function (l) { return Math.abs(l[1] - py) < 15 && l[0] + l[2] / 2 > m.l + 6 && l[0] - l[2] / 2 < m.l + 6 + pw; })) py -= 16;
        ["big bg", "big"].forEach(function (c) { S("text", { x: m.l + 6, y: py, class: c }, svg).textContent = pt; });
      }
      alt.innerHTML = "";
      var ul = H("ul", null, alt);
      blocks.forEach(function (b) { var p = res.plants[b.key]; H("li", { text: nm(b.key) + ": offers " + b.mw + " MW at " + usd(b.offer) + "/MWh" + (show ? "; runs " + Math.round(p.run) + " MW" : "") + "." }, ul); });
      if (show) H("li", { text: "Demand " + Math.round(demand) + " MW. Clearing price " + usd(res.price) + "/MWh, set by the " + nm(res.marginal).toLowerCase() + "." + (res.spilled > 0 ? " Spilled wind and sun: " + Math.round(res.spilled) + " MW." : "") }, ul);
      return res;
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (last && LX.visible(w)) draw(last[0], last[1], last[2]); }).observe(w);
    LX.onTheme(function () { if (last && LX.visible(w)) draw(last[0], last[1], last[2]); });
    return { draw: draw, el: w };
  };
  LX.SupplyStack.clear = clear;
  LX.SupplyStack.scaleOf = scaleOf;
})();
