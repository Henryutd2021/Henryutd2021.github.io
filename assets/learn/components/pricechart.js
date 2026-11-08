/* pricechart.js — LX.PriceChart and LX.HourPicker: hourly prices as step lines (one per bus, or one single price), an
   earlier run dashed behind them, the selected hour shaded, and a picker for the hour. First
   used by M1 (m01-dispatch-to-lmp.js); the chart is drawn by LX.Plot (plot.js).

   var ch = LX.PriceChart(host, { label: "what the chart shows", ghostLabel: "With the ramp rule", onPick: function (t) {},
                                  unit: "$/MWh" });
   ch.set({ series: [{id, label, color, v: [price per hour]}], ghost: [price per hour] or null, sel: hour });   any subset;
                 the chart keeps the rest and draws once it has series
     series      one step line per series (each price holds for its hour). Equal prices would hide each other, so with
                 several series each line is moved 1.6 px from its neighbour (the middle one stays put)
     ghost       an earlier run as a dashed grey step line, named ghostLabel in the legend (default "Before")
     sel         the selected hour, shaded; with onPick a tap on an hour, or ← → Home End on the focused chart, picks it
   The y axis runs from $0 to a round top (at least $100, in steps of $50) with four gridlines; the time axis is marked
   every 6 hours (every 12 under 480 px); hovering shows the hour's prices; the text version is a table of every hour.
   ch.el is the chart element.

   var hp = LX.HourPicker(host, { start: 12, jumps: [[19, "19:00"], [12, "12:00"]], onChange: function (t) {}, label: "Hour" });
     previous and next buttons (wrapping round midnight; spoken "Previous hour", "Next hour"), the hour as an output
     (aria-live), and optional jump buttons. hp.set(t) moves it without calling onChange; hp.val() is the hour. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure helpers (Node tests: _tests/learn/test_components_a.js)
  function hh(t) { t = ((Math.floor(t) % 24) + 24) % 24; return (t < 10 ? "0" : "") + t + ":00"; }
  // the axis top: the highest price (ghost included) rounded up to $50, at least $100
  function priceTop(series, ghost) {
    var all = [0];
    (series || []).forEach(function (s) { all = all.concat(s.v); });
    if (ghost) all = all.concat(ghost);
    return Math.max(100, Math.ceil(Math.max.apply(null, all) / 50) * 50);
  }
  // pixel offsets that keep equal step lines apart: 1.6 px per series, centred on the middle one
  function offsets(n) { var o = []; for (var k = 0; k < n; k++) o.push(n > 1 ? (k - (n - 1) / 2) * 1.6 : 0); return o; }
  var pure = { hh: hh, priceTop: priceTop, offsets: offsets };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  var LX = window.LX, H = LX.H;
  LX.PriceChart = function (host, o) {
    o = o || {};
    var P = LX.Plot(host, { box: true, text: "Text version", cls: "lx-pricechart" }), st = { series: null, ghost: null, sel: 12 };
    function spec() {
      var ser = st.series, n = ser[0].v.length, top = priceTop(ser, st.ghost), off = offsets(ser.length), lines = [], legend = [];
      var pts = function (v) { return v.map(function (p, t) { return [t, p]; }); };
      var hours = function (hs) { return hs.filter(function (h) { return h <= n; }).map(function (h) { return [h, h === 24 ? "24:00" : hh(h)]; }); };
      if (st.ghost) lines.push({ pts: pts(st.ghost), step: 1, color: "var(--lx-ink-3)", width: 2, dash: "4 3", op: 0.8, cap: "butt" });
      ser.forEach(function (s, k) {
        lines.push({ pts: pts(s.v), step: 1, color: s.color, width: ser.length > 1 ? 2.4 : 2.6, offset: off[k], cap: "butt" });
        legend.push({ label: s.label, color: s.color });
      });
      if (st.ghost) legend.push({ label: o.ghostLabel || "Before", dash: true });
      var money = function (v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); };
      return {
        x: { min: 0, max: n, ticks: hours([0, 6, 12, 18, 24]), ticksN: hours([0, 12, 24]) },
        y: { min: 0, max: top, ticks: [0, 1, 2, 3, 4].map(function (k) { return [k * top / 4, "$" + k * top / 4]; }) },
        margin: { l: 44, r: 10, t: 12, b: 26 }, height: 230, heightN: 200,
        lines: lines, legend: legend,
        pick: { n: n, sel: st.sel, onPick: o.onPick },
        tip: function (x) {
          var t = Math.min(n - 1, Math.floor(x));
          return "<div><b>" + hh(t) + "–" + (t + 1 === 24 ? "24:00" : hh(t + 1)) + "</b></div>" +
            ser.map(function (s) { return "<div><span>" + LX.esc(s.label) + "</span><b>" + money(s.v[t]) + "</b></div>"; }).join("");
        },
        aria: o.label || "Price in each hour, dollars per MWh.",
        text: { head: ["Hour"].concat(ser.map(function (s) { return s.label + " (" + (o.unit || "$/MWh") + ")"; })),
                rows: ser[0].v.map(function (x, t) { return [hh(t)].concat(ser.map(function (s) { return Math.round(s.v[t]); })); }) }
      };
    }
    return {
      el: P.el,
      set: function (x) { for (var k in x) st[k] = x[k]; if (st.series && st.series.length) P.render(spec()); }
    };
  };

  LX.HourPicker = function (host, o) {
    o = o || {};
    var w = H("div", { class: "lx-hours", role: "group", "aria-label": o.label || "Hour" }, host), t = o.start || 0;
    H("span", { class: "lx-eyebrow", text: o.label || "Hour" }, w);
    var prev = H("button", { type: "button", class: "lx-btn ghost small", "aria-label": "Previous hour", html: LX.icon("back") }, w);
    var out = H("output", { "aria-live": "polite" }, w);
    var next = H("button", { type: "button", class: "lx-btn ghost small", "aria-label": "Next hour", html: LX.icon("arrow") }, w);
    (o.jumps || []).forEach(function (j) { H("button", { type: "button", class: "lx-btn ghost small", text: j[1], onclick: function () { set(j[0], true); } }, w); });
    function set(v, user) { t = (v + 24) % 24; out.textContent = hh(t); if (user && o.onChange) o.onChange(t); }
    prev.addEventListener("click", function () { set(t - 1, true); });
    next.addEventListener("click", function () { set(t + 1, true); });
    set(t);
    return { set: function (v) { set(v); }, val: function () { return t; }, el: w };
  };
})();
