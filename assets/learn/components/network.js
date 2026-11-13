/* network.js — LX.Network: a small power network (the curriculum's i-network). Buses are boxes with their plants and their
   price; lines carry flows with arrows, limits, and a red "full" when congested; a bus can be tapped; a text version lists
   every bus and line.
   var net = LX.Network(host, {
     buses: [{ id: "T", name: "Prairie Town", short: "Town", color: "var(--lx-demand)", at: [180, 238],   box center, in the viewBox
               note: "load + nuclear",                  small gray line in the box, after the plants' color squares
               desc: "all the demand and the nuclear plant",   the bus in the text version (default: its plants' labels)
               reference: true }],                      (kept for callers; no effect on the drawing)
     lines: [{ id: "RT", from: "R", to: "T", name: "Ridge–Town",
               labelAt: [x, y, "start" | "middle" | "end"] }],   where the flow label goes (default: beside the line's middle,
                                                                  on the side away from the network's center)
     plants: [{ bus: "R", color: "var(--lx-wind)", label: "Wind farm" }],   a color square per plant in its bus's box
     size: [360, 300],                       the viewBox, width and height
     label: "Three-bus network: ...",        the diagram's spoken name
     onPick: function (busId) {},            buses become buttons (Tab, Enter, Space; aria-pressed shows the selected bus)
     money: function (v) { return "$40"; },  price format (default: whole dollars, "−$" for a negative price)
     unit: "/MWh",                           after each price
     mwPerPx: 22 });                         a line is 2.5 px wide plus 1 px per this many MW of flow (at most 9 px more)
   net.set({ h: { price: { T: 80, ... }, flow: { RT: 110, ... }, full: { RT: true } },   an hour's prices, flows (MW, positive
                                                                                          from `from` to `to`) and full lines
             lim: { RT: 110 },      line limits: "110 / 110 MW"; a non-finite limit is not shown
             sel: "T",              the selected bus (thicker border)
             transfer: { RT: 60 } })  flows of a transfer instead of an hour's (shown without limits)
   Any key left out keeps its value. Returns { set, el }. Colors are tokens (CSS variables), so day and night both work
   without a redraw. Node: module.exports = { flowWidth, autoLabel, describe } (pure; tests). */
(function () {
  "use strict";
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function flowWidth(fl, mwPerPx) { return fl == null ? 3 : 2.5 + Math.min(9, Math.abs(fl) / (mwPerPx || 22)); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  // where a line's label goes: o.labelAt, else 14 units out from the line's middle, away from the buses' center
  function autoLabel(o, l) {
    if (l.labelAt) return l.labelAt;
    var a = byId(o.buses, l.from).at, b = byId(o.buses, l.to).at, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, cx = 0, cy = 0;
    o.buses.forEach(function (q) { cx += q.at[0] / o.buses.length; cy += q.at[1] / o.buses.length; });
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
    var x = mx + nx * 14, y = my + ny * 14 + (ny < 0 ? -4 : 12);
    return [x, y, Math.abs(nx) < 0.3 ? "middle" : nx > 0 ? "start" : "end"];
  }
  function plantsAt(o, id) { return (o.plants || []).filter(function (p) { return p.bus === id; }); }
  // the text version: one sentence per bus, then one per line (st as in set())
  function describe(o, st) {
    var fmt = o.money || money, unit = o.unit == null ? "/MWh" : o.unit, h = st.h, lim = st.lim || {};
    var buses = o.buses.map(function (b) {
      var price = h && h.price ? h.price[b.id] : null;
      var desc = b.desc || plantsAt(o, b.id).map(function (p) { return p.label.toLowerCase(); }).join(" and ");
      return b.name + (price != null ? ": " + fmt(price) + (unit === "/MWh" ? " per MWh" : unit) : "") + (desc ? " (" + desc + ")" : "");
    });
    var lines = o.lines.map(function (l) {
      var fl = st.transfer ? st.transfer[l.id] : h && h.flow ? h.flow[l.id] : null, full = !!(h && h.full && h.full[l.id]);
      var limTxt = isFinite(lim[l.id]) && !st.transfer ? ", limit " + lim[l.id] + " MW" + (full ? " (full)" : "") : "";
      return l.name + ": " + (fl == null ? "no flow shown" : Math.round(Math.abs(fl) * 10) / 10 + " MW from " + byId(o.buses, fl >= 0 ? l.from : l.to).short +
        " to " + byId(o.buses, fl >= 0 ? l.to : l.from).short) + limTxt;
    });
    return { buses: buses, lines: lines };
  }
  var pure = { money: money, flowWidth: flowWidth, autoLabel: autoLabel, describe: describe };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;
  var LX = window.LX, H = LX.H, S = LX.S;

  LX.Network = function (host, o) {
    var fmt = o.money || money, unit = o.unit == null ? "/MWh" : o.unit, size = o.size || [360, 300];
    var w = H("div", { class: "lx-net" }, host);
    var svg = S("svg", { viewBox: "0 0 " + size[0] + " " + size[1], role: "group", "aria-label": o.label || "Network: buses and the lines between them." }, w);
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version" }, alt); var altBody = H("div", null, alt);
    var gl = S("g", null, svg), gb = S("g", null, svg), st = { h: null, sel: null, lim: {}, transfer: null };
    function draw() {
      gl.innerHTML = ""; gb.innerHTML = "";
      var lim = st.lim || {}, h = st.h;
      o.lines.forEach(function (l) {
        var a = byId(o.buses, l.from).at, b = byId(o.buses, l.to).at, fl = st.transfer ? st.transfer[l.id] : h && h.flow ? h.flow[l.id] : null;
        var full = h && h.full && h.full[l.id], col = full ? "var(--lx-bad)" : "var(--lx-ink-3)";
        S("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col, "stroke-width": flowWidth(fl, o.mwPerPx), "stroke-linecap": "round", opacity: full ? 1 : .75 }, gl);
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (fl != null && Math.abs(fl) > 0.05) {   // an arrow in the flow's direction
          var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy), ux = dx / L * (fl > 0 ? 1 : -1), uy = dy / L * (fl > 0 ? 1 : -1);
          var px = -uy, py = ux, cx = mx + ux * 22, cy = my + uy * 22, s = 7;
          S("path", { d: "M" + (cx + ux * s) + " " + (cy + uy * s) + " L" + (cx - ux * s + px * s) + " " + (cy - uy * s + py * s) + " L" + (cx - ux * s - px * s) + " " + (cy - uy * s - py * s) + "Z", fill: col }, gl);
        }
        var lab = fl == null ? l.name : Math.round(Math.abs(fl)) + (isFinite(lim[l.id]) && !st.transfer ? " / " + lim[l.id] : "") + " MW";
        var at = autoLabel(o, l);
        var txa = { x: at[0], y: at[1], "text-anchor": at[2], "font-size": 13.5, class: "num", fill: full ? "var(--lx-bad)" : "var(--lx-ink-2)", stroke: "var(--lx-surface)", "stroke-width": 4, "paint-order": "stroke" };
        S("text", txa, gl).textContent = lab;
        if (full) { var t2 = {}; for (var q in txa) t2[q] = txa[q]; t2.y = at[1] + 17; S("text", t2, gl).textContent = "full"; }
      });
      o.buses.forEach(function (b) {
        var p = b.at, price = h && h.price ? h.price[b.id] : null, sel = st.sel === b.id;
        var g = S("g", { class: "bus" + (sel ? " sel" : ""), transform: "translate(" + (p[0] - 66) + "," + (p[1] - 34) + ")", tabindex: o.onPick ? 0 : null,
          role: o.onPick ? "button" : null, "aria-pressed": o.onPick ? (sel ? "true" : "false") : null,
          "aria-label": b.name + (price != null ? ", price " + fmt(price) + (unit === "/MWh" ? " per MWh" : unit) : "") }, gb);
        S("rect", { class: "box", x: 0, y: 0, width: 132, height: 68, rx: 12, fill: "var(--lx-surface)", stroke: b.color, "stroke-width": sel ? 3.5 : 2 }, g);
        S("text", { x: 10, y: 20, "font-size": 14, "font-weight": 500, fill: "var(--lx-ink)" }, g).textContent = b.name;
        var x = 10;
        plantsAt(o, b.id).forEach(function (pl) { S("rect", { x: x, y: 29, width: 9, height: 9, rx: 2, fill: pl.color }, g); x += 13; });
        if (b.note) S("text", { x: x + 2, y: 38, "font-size": 11.5, fill: "var(--lx-ink-3)" }, g).textContent = b.note;
        if (price != null) {
          S("text", { x: 10, y: 59, "font-size": 16, class: "num", fill: "var(--lx-ink)" }, g).textContent = fmt(price);
          if (unit) S("text", { x: 14 + 10 * fmt(price).length, y: 59, "font-size": 11.5, fill: "var(--lx-ink-3)" }, g).textContent = unit;
        }
        if (o.onPick) {
          g.addEventListener("click", function () { o.onPick(b.id); });
          g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); o.onPick(b.id); } });
        }
      });
      var d = describe(o, st);
      altBody.innerHTML = "";
      var ul = H("ul", null, altBody);
      d.buses.concat(d.lines).forEach(function (s) { H("li", { text: s }, ul); });
    }
    draw();
    return { set: function (x) { for (var k in x) st[k] = x[k]; draw(); }, el: w };
  };
})();
