/* scatter.js — LX.Scatter: a dot chart of two measures, one labelled dot per item, every dot a button, with an optional
   dashed y = x line and a text version. First used by lesson 6 (06-three-jobs.js:
   capacity factor across, firm share up).

   var sc = LX.Scatter(host, {
     points: [{key, label, x, y, color, aria: "what a screen reader says for the dot", text: "its line in the text version"}],
     x: {min: 0, max: 1, ticks: [0, .25, .5, .75, 1], fmt: function (v) { return v * 100 + "%"; }, title: "...", titleN: "..."},
     y: {min: 0, max: 1, ticks: [...], fmt, title: "...", titleN},      titleN: a shorter axis title on phones
     diagonal: {label: "y = x", labelN: "...", at: [x, y], atN: [x, y]},  a dashed y = x line with a label at a data point
     aria: "what the chart shows", onPick: function (key) {}, sel: key, textLabel: "Text version"
   });
   sc.select(key) marks a dot as picked without calling onPick; sc.el is the SVG; sc.render() lays it out again.
   Layout: a 560 x 330 drawing scaled to the column; under 520 px it is laid out at its real width (at least 300) and
   300 high, so the labels stay legible. A dot's label goes right of it if it fits, else left, else above it (kept inside).
   Keyboard: every dot is in the tab order (role button, aria-pressed); Enter or Space picks it; focus shows an accent ring.
   Without points' aria, a dot reads "<label>: <x fmt>, <y fmt>"; without text, the text version line is the same. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure helpers (Node tests: _tests/learn/test_components_a.js)
  // the drawing's size for a column width cw (phones: real width, so text is not scaled down)
  function size(cw) { var phone = cw < 520; return { phone: phone, W: phone ? Math.max(300, cw) : 560, H: phone ? 300 : 330 }; }
  // where a dot's label goes: right if it fits, else left, else centred above (kept inside [left, right])
  function labelPos(px, py, text, left, right) {
    var tw = text.length * 7.4;
    if (px + 16 + tw <= right) return { x: px + 16, y: py + 5, anchor: "start" };
    if (px - 16 - tw >= left) return { x: px - 16, y: py + 5, anchor: "end" };
    return { x: Math.max(left + tw / 2, Math.min(right - tw / 2, px)), y: py - 17, anchor: "middle" };
  }
  var pure = { size: size, labelPos: labelPos };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  var LX = window.LX, H = LX.H, S = LX.S;
  LX.Scatter = function (host, o) {
    var xa = o.x || {}, ya = o.y || {}, sel = o.sel == null ? null : o.sel, svg = null, dots = {}, laid = null;
    var fx = xa.fmt || String, fy = ya.fmt || String;
    var lo = function (a) { return a.min == null ? 0 : a.min; }, hi = function (a) { return a.max == null ? 1 : a.max; };
    var spoken = function (p) { return p.aria || p.label + ": " + fx(p.x) + ", " + fy(p.y); };
    function pick(k, fire) {
      sel = k;
      Object.keys(dots).forEach(function (d) { dots[d].setAttribute("aria-pressed", d === k ? "true" : "false"); });
      if (fire && o.onPick) o.onPick(k);
    }
    function render() {
      var L = size(host.clientWidth || 560);
      if (laid && laid.W === L.W && laid.phone === L.phone) return;
      laid = L;
      var focused = document.activeElement && svg && svg.contains(document.activeElement) ? document.activeElement.getAttribute("data-key") : null;
      var Wd = L.W, Hh = L.H, m = { l: 46, r: 16, t: 14, b: 40 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b;
      var x = function (v) { return m.l + (v - lo(xa)) / (hi(xa) - lo(xa)) * iw; }, y = function (v) { return m.t + ih - (v - lo(ya)) / (hi(ya) - lo(ya)) * ih; };
      var old = svg;
      svg = S("svg", { viewBox: "0 0 " + Wd + " " + Hh, class: "lx-scatter", role: "group", "aria-label": o.aria || "" });
      if (old) host.replaceChild(svg, old); else host.insertBefore(svg, alt);
      (ya.ticks || [0, 0.25, 0.5, 0.75, 1]).forEach(function (v) {
        S("path", { d: "M" + m.l + " " + y(v) + "H" + (Wd - m.r), stroke: "var(--lx-line)" }, svg);
        S("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", class: "ax" }, svg).textContent = fy(v);
      });
      (xa.ticks || [0, 0.25, 0.5, 0.75, 1]).forEach(function (v) {
        S("text", { x: x(v), y: m.t + ih + 16, "text-anchor": "middle", class: "ax" }, svg).textContent = fx(v);
      });
      if (o.diagonal) {
        var a = Math.max(lo(xa), lo(ya)), b = Math.min(hi(xa), hi(ya)), at = L.phone && o.diagonal.atN ? o.diagonal.atN : o.diagonal.at;
        S("path", { d: "M" + x(a) + " " + y(a) + "L" + x(b) + " " + y(b), stroke: "var(--lx-ink-3)", "stroke-dasharray": "4 4" }, svg);
        if (at) {   // the label starts at its data point; when it would run past the plot's right edge, it ends there instead
          var dl = S("text", { x: x(at[0]), y: y(at[1]), "text-anchor": "start", class: "ax" }, svg);
          dl.textContent = L.phone && o.diagonal.labelN ? o.diagonal.labelN : o.diagonal.label;
          var dw = (dl.getComputedTextLength && dl.getComputedTextLength()) || dl.textContent.length * 7.4;
          if (x(at[0]) + dw > Wd - m.r) { dl.setAttribute("x", Wd - m.r); dl.setAttribute("text-anchor", "end"); }
        }
      }
      var xt = L.phone && xa.titleN ? xa.titleN : xa.title, yt = L.phone && ya.titleN ? ya.titleN : ya.title;
      if (xt) S("text", { x: m.l + iw / 2, y: Hh - 4, "text-anchor": "middle", class: "axt" }, svg).textContent = xt;
      if (yt) S("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", class: "axt", transform: "rotate(-90 12 " + (m.t + ih / 2) + ")" }, svg).textContent = yt;
      dots = {};
      o.points.forEach(function (p) {
        var g = S("g", { class: "lx-scatter-dot", tabindex: 0, role: "button", "data-key": p.key, "aria-label": spoken(p), "aria-pressed": p.key === sel ? "true" : "false" }, svg);
        var px = x(p.x), py = y(p.y);
        S("circle", { class: "ring", cx: px, cy: py, r: 15.5, fill: "none" }, g);
        S("circle", { class: "dot", cx: px, cy: py, r: 11, fill: p.color, stroke: "var(--lx-surface)", "stroke-width": 2 }, g);
        var lp = labelPos(px, py, p.label, m.l, Wd - m.r);
        S("text", { x: lp.x, y: lp.y, "text-anchor": lp.anchor, class: "dl" }, g).textContent = p.label;
        g.addEventListener("click", function () { pick(p.key, true); });
        g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(p.key, true); } });
        dots[p.key] = g;
      });
      if (focused && dots[focused]) dots[focused].focus();
      api.el = svg;
    }
    var api = { el: null, render: function () { laid = null; render(); }, select: function (k) { pick(k, false); } };
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: o.textLabel || "Text version" }, alt);
    var ul = H("ul", null, alt);
    o.points.forEach(function (p) { H("li", { text: p.text || spoken(p) + "." }, ul); });
    render();
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(host)) render(); }).observe(host);
    return api;
  };
})();
