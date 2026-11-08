/* daychart.js — LX.DayChart: hourly stacked bars (one colour per plant) with demand as a dashed step line.
   const c = LX.DayChart(host, { series: [{key: "nuclear", label: "Nuclear", color: "var(--lx-nuc)"}, ...],
                                 demand: [24 numbers], rows: function () { return [{nuclear: 100, ..., unserved: 0}, ...]; },
                                 yMax: 400, unit: "MW", pending: "not played yet", label: "what the chart shows" });
   c.render()  draws (call after the host becomes visible); hover or tap shows the hour; a "Text version" table follows,
   with one row for every hour of demand (an hour with no row yet shows demand and the `pending` words, default
   "not played yet"; the readout says the same) and a "Short" column when
   any hour is short. yMax is the smallest top of the scale: it grows (in steps of 100) when demand or a stacked bar
   would rise above it, so no bar is cut off. The unit names the vertical scale and the table's caption. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H, S = LX.S, clamp = LX.clamp;
  LX.DayChart = function (host, o) {
    var w = H("div", { class: "lx-chart" }, host);
    var tip = H("div", { class: "lx-chart-tip", hidden: true, "aria-hidden": "true" }, w);
    var legend = H("div", { class: "lx-legend" }, host);
    o.series.slice().reverse().forEach(function (s) { var sp = H("span", null, legend); H("i", { style: "--c:" + s.color }, sp); H("span", { text: s.label }, sp); });
    var dl = H("span", null, legend); H("i", { class: "line" }, dl); H("span", { text: "Demand" }, dl);
    var alt = H("details", { class: "lx-textalt" }, host);
    H("summary", { text: "Text version" }, alt);
    var svg = null, n = o.demand.length, pendingText = o.pending || "not played yet";
    function render() {
      var rows = o.rows(), W = Math.max(280, w.clientWidth || 600), Hh = W < 480 ? 190 : 220, unit = o.unit || "MW";
      var top = Math.max.apply(null, o.demand.concat(rows.map(function (r) {
        return o.series.reduce(function (a, s) { return a + (r[s.key] || 0); }, 0) + Math.max(0, r.unserved || 0);
      })));
      var ymax = Math.max(o.yMax || 400, Math.ceil(top / 100) * 100);
      var m = { l: 40, r: 8, t: 22, b: 24 }, iw = W - m.l - m.r, ih = Hh - m.t - m.b;
      if (svg) svg.remove();
      svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": o.label || "Hourly output by plant, with demand." });
      w.insertBefore(svg, tip);
      var y = function (v) { return m.t + ih - v / ymax * ih; }, bw = iw / n;
      S("text", { x: m.l - 6, y: 11, "text-anchor": "end", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = unit;
      for (var v = 0; v <= ymax; v += ymax / 4) {
        S("path", { d: "M" + m.l + " " + y(v) + " H" + (W - m.r), stroke: "var(--lx-line)", "stroke-width": 1 }, svg);
        S("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = v;
      }
      [0, 6, 12, 18, 24].forEach(function (h) {
        S("text", { x: m.l + h * bw, y: Hh - 6, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = (h < 10 ? "0" : "") + h + ":00";
      });
      rows.forEach(function (r, t) {
        var yy = 0, x = m.l + t * bw + 1, ww = Math.max(1, bw - 2);
        o.series.forEach(function (s) {
          var val = r[s.key] || 0; if (val < 0.5) return;
          S("rect", { x: x, y: y(yy + val), width: ww, height: Math.max(0.5, y(yy) - y(yy + val) - 1), fill: s.color, rx: 1 }, svg); yy += val;
        });
        if (r.unserved > 0) S("rect", { x: x, y: y(yy + r.unserved), width: ww, height: Math.max(1, y(yy) - y(yy + r.unserved)), fill: "none", stroke: "var(--lx-bad)", "stroke-width": 1.2, "stroke-dasharray": "2 2" }, svg);
      });
      var d = "";
      o.demand.forEach(function (v, t) { d += (t ? " L" : "M") + (m.l + t * bw) + " " + y(v) + " H" + (m.l + (t + 1) * bw); });
      S("path", { d: d, fill: "none", stroke: "var(--lx-ink)", "stroke-width": 2, "stroke-dasharray": "5 3" }, svg);
      var hit = S("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);
      function show(ev) {
        var rr = svg.getBoundingClientRect(), t = clamp(Math.floor(((ev.clientX - rr.left) / rr.width * W - m.l) / bw), 0, n - 1), row = rows[t];
        var html = "<div><b>" + LX.fmt.hh(t) + "</b><span>demand <b>" + Math.round(o.demand[t]) + "</b> " + unit + "</span></div>";
        if (row) o.series.slice().reverse().forEach(function (s) { html += "<div><span>" + s.label + "</span><b>" + Math.round(row[s.key] || 0) + "</b></div>"; });
        else html += "<div><span>" + LX.esc(pendingText.charAt(0).toUpperCase() + pendingText.slice(1)) + "</span></div>";
        if (row && row.unserved > 0) html += '<div><span class="bad">Short</span><b>' + Math.round(row.unserved) + "</b></div>";
        tip.innerHTML = html; tip.hidden = false;
        var px = (m.l + (t + 0.5) * bw) / W * rr.width;
        tip.style.left = clamp(px + 12, 0, rr.width - 156) + "px"; tip.style.top = "6px";
      }
      hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", function () { tip.hidden = true; });
      // text version: one row for every hour of demand, so the whole day's demand is readable before it is played
      alt.querySelectorAll(".lx-scroll-x").forEach(function (t) { t.remove(); });
      var short = rows.some(function (r) { return r && r.unserved > 0; }), pending = rows.length < n;
      var tb = H("table", { class: "lx-mini-table" }, H("div", { class: "lx-scroll-x" }, alt));
      H("caption", { text: "Average power in each hour, " + unit + "." + (pending ? " Hours " + pendingText + " show demand only." : "") }, tb);
      var hd = H("tr", null, H("thead", null, tb));
      ["Hour", "Demand"].concat(o.series.map(function (s) { return s.label; }), short ? ["Short"] : []).forEach(function (t) { H("th", { text: t, scope: "col" }, hd); });
      var body = H("tbody", null, tb);
      o.demand.forEach(function (dv, t) {
        var r = rows[t], tr = H("tr", null, body); H("th", { text: LX.fmt.hh(t), scope: "row" }, tr); H("td", { text: Math.round(dv) }, tr);
        if (!r) { H("td", { text: pendingText, colspan: o.series.length + (short ? 1 : 0), style: "text-align:left" }, tr); return; }
        o.series.forEach(function (s) { H("td", { text: Math.round(r[s.key] || 0) }, tr); });
        if (short) H("td", { text: Math.round(Math.max(0, r.unserved || 0)) }, tr);
      });
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(w)) render(); }).observe(w);
    LX.onTheme(function () { if (LX.visible(w)) render(); });
    return { render: render, el: w };
  };
})();
