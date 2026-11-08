/* plot.js — LX.Plot: one XY chart (SVG) for every Learn lesson, and LX.PlotCard: a chart card with value chips above it.
   It replaced the lesson-local plot() of 03-balancing.js and 04-forecasts.js, the LineChart of 02-demand.js and the
   light chart of b02-python-data.js. LX.PriceChart (pricechart.js) is built on it.

   var P = LX.Plot(host, { caption: true, text: "Text version of the chart", legend: true, box: true, cls: "" });
     caption  true: a caption line above the chart (set by spec.caption; [[glossary|marks]] allowed); implies box
     text     the summary of the chart's own "Text version" (details.lx-textalt), filled from spec.text or by the lesson
              through P.text; leave it out when the lesson keeps its own text version next to the chart
     legend   false: no legend row (default: a .lx-legend row under the chart, filled from spec.legend)
     box      true: caption, chart, legend and text version sit in one div (P.box), to move as a unit; otherwise they
              are added to host directly
     cls      extra class on the chart element
   P.render(spec, animate)  draws spec and keeps it (P.render() redraws it). Drawing waits until the chart is visible;
                            a resize or the day/night toggle redraws it. animate: lines with anim: true draw on.
   P.el (the chart element), P.box, P.text (body of the text version), P.legend, P.spec() (the last spec)

   spec = {
     x: {min, max, ticks: [[v, "label", anchor]] or function (W) -> ticks, ticksN: ticks under 480 px}
        (anchor optional: the first tick at min starts there, the last at max ends there, others are centred)
     y: {min, max, ticks: [[v, "label"]] or step: s with fmt(v) -> label (gridlines from min), unit: "MW" (top left),
         zero: true (the gridline at 0 drawn darker)}
     height, heightN (under 480 px; defaults 260 and 220), ml (left margin) or margin: {l, r, t, b} (default 52, 14, 18, 28)
     title    a title inside the chart, top left (adds 14 px on top)
     caption  text for the caption line (needs the caption option)
     spans:   [{x0, x1, color, op, label}]       full-height shading (a weekend, flagged hours), label at the top
     hbands:  [{y0, y1, color, op, label}]       full-width shading (below zero), label top left
     bars:    [{x0, x1, y0, y1, color, op, rx}]  rectangles in data units (misses, bands, columns)
     refs:    [{y, label, labelN, color, dash, width, below, labelColor}]   horizontal reference lines, label at the right
     lines:   [{pts: [[x, y]], or values: [y] (at x0 + i × dx; defaults 0 and 1; null leaves a gap), color, width
               (default 2.4; 0 draws only the area), dash, anim (draw on), dots, area (fill opacity down to y = 0),
               step (each point holds for this x width: hourly prices), offset (px down, to show equal lines side by
               side), op, cap ("round" default, or "butt")}]
     marks:   [{x, y, label, color, kind: "ring" (default: hollow, bold label beside) | "dot" (filled, label centred
               above), above (ring), pos: "above" | "below" | "bottom" (dot), n: "1" (a numbered disc), vline: true
               (a dashed line down the chart; no dot unless dot: true)}]
     legend:  [{label, color, dash}]
     tip:     function (x) -> HTML of the readout at data x (null hides it); tipStep: arrow-key step (default axis / 24)
     pick:    {n, sel, onPick(i)}  n equal columns across x; column sel is shaded; with onPick a tap or the arrow keys
              pick a column (hovered columns are lit)
     aria:    the chart's label (role img)
     text:    {head: [...], rows: [[...]], note} or {html} for the plot's own text version (needs the text option)
   }
   Keyboard: a chart with a tip or a pick takes focus (visible ring): ← and → move the readout or the picked column,
   Home and End jump to the ends, Escape hides the readout. The text version carries every number for screen readers.

   var c = LX.PlotCard(host, { text: "Text version of the chart", cls: "" });
     a card (.lx-xcard) with c.title (an eyebrow line), c.chips (value chips, aria-live), the chart c.plot (LX.Plot)
     and its text version c.text. c.chip(label, value, tone) adds a chip; tone "good" | "bad" | "warn" colours the
     value; c.clear() empties the chips. Used by lessons 3 and 4. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure helpers (Node tests: _tests/learn/test_components_a.js)
  function round(v) { return Math.round(v * 1e9) / 1e9; }
  // gridline values from min to max every step (decimal-safe), with labels from fmt
  function ticks(min, max, step, fmt) {
    var out = [];
    if (!(step > 0)) return out;
    for (var k = 0; k < 1000; k++) { var v = round(min + k * step); if (v > max + 1e-9 * Math.max(1, Math.abs(max))) break; out.push([v, fmt ? fmt(v) : String(v)]); }
    return out;
  }
  // text-anchor of the i-th x tick: explicit, else start at min, end at max, middle otherwise
  function anchor(tk, i, list, min, max) {
    if (tk[2]) return tk[2];
    if (i === 0 && tk[0] === min) return "start";
    if (i === list.length - 1 && tk[0] === max) return "end";
    return "middle";
  }
  // a line's points: pts as given, or values at x0 + i * dx
  function points(ln) {
    if (ln.pts) return ln.pts;
    var x0 = ln.x0 || 0, dx = ln.dx == null ? 1 : ln.dx;
    return (ln.values || []).map(function (v, i) { return [x0 + i * dx, v]; });
  }
  // SVG path data through the points (X, Y map data to pixels); a null y starts a new piece; step w holds each value
  // for w data units (a step line); off shifts the line down by off pixels
  function linePath(pts, X, Y, step, off) {
    var d = "", gap = true;
    off = off || 0;
    pts.forEach(function (p) {
      if (p[1] == null || !isFinite(p[1])) { gap = true; return; }
      var x = X(p[0]), y = Y(p[1]) + off;
      d += (gap ? (d ? " M" : "M") : " L") + x.toFixed(1) + " " + y.toFixed(1);
      if (step) d += " H" + X(p[0] + step).toFixed(1);
      gap = false;
    });
    return d;
  }
  // which of n equal columns across [min, max] holds data x
  function column(x, min, max, n) { return Math.max(0, Math.min(n - 1, Math.floor((x - min) / (max - min) * n))); }
  var pure = { ticks: ticks, anchor: anchor, points: points, linePath: linePath, column: column };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- the chart
  var LX = window.LX, H = LX.H, S = LX.S;
  LX.Plot = function (host, o) {
    o = o || {};
    var box = o.box || o.caption ? H("div", { class: "lx-plotbox" }, host) : host;
    var cap = o.caption ? H("p", { class: "lx-plot-cap" }, box) : null;
    var wrap = H("div", { class: "lx-plot" + (o.cls ? " " + o.cls : "") }, box);
    var tip = H("div", { class: "lx-chart-tip", hidden: true, "aria-hidden": "true" }, wrap);
    var legend = o.legend === false ? null : H("div", { class: "lx-legend" }, box);
    var textBody = null;
    if (o.text) { var alt = H("details", { class: "lx-textalt" }, box); H("summary", { text: o.text }, alt); textBody = H("div", null, alt); }
    var svg = null, spec = null, lastW = 0, G = null, kx = null, dirty = false;

    function fillText(s) {
      if (!textBody || !s.text) return;
      textBody.innerHTML = "";
      if (s.text.html != null) { textBody.innerHTML = s.text.html; return; }
      var tb = H("table", { class: "lx-mini-table" }, H("div", { class: "lx-scroll-x" }, textBody)), hr = H("tr", null, H("thead", null, tb));
      (s.text.head || []).forEach(function (h) { H("th", { scope: "col", text: h }, hr); });
      var body = H("tbody", null, tb);
      (s.text.rows || []).forEach(function (r) { var tr = H("tr", null, body); r.forEach(function (c) { H("td", { text: c == null ? "" : String(c) }, tr); }); });
      if (s.text.note) H("p", { class: "lx-hint", text: s.text.note }, textBody);
    }
    function paintLegend(s) {
      if (!legend) return;
      legend.innerHTML = "";
      (s.legend || []).forEach(function (l) {
        var sp = H("span", null, legend);
        H("i", l.dash ? (l.color ? { class: "line", style: "border-top-color:" + l.color } : { class: "line" }) : { style: "--c:" + l.color }, sp);
        H("span", { text: l.label }, sp);
      });
      legend.hidden = !(s.legend && s.legend.length);
    }

    function render(s, animate) {
      if (s) { spec = s; dirty = true; if (cap) cap.innerHTML = s.caption ? LX.rich(s.caption) : ""; fillText(s); paintLegend(s); }
      if (!spec || !LX.visible(wrap)) return;
      s = spec; dirty = false;
      var W = Math.max(280, wrap.clientWidth || 600), narrow = W < 480; lastW = W;
      var Hh = (narrow && s.heightN != null ? s.heightN : s.height) || (narrow ? 220 : 260);
      var mg = s.margin || {}, m = { l: mg.l != null ? mg.l : s.ml || 52, r: mg.r != null ? mg.r : 14, t: mg.t != null ? mg.t : 18, b: mg.b != null ? mg.b : 28 };
      if (s.title) { Hh += 14; m.t += 14; }
      var iw = W - m.l - m.r, ih = Hh - m.t - m.b, xa = s.x, ya = s.y;
      var X = function (v) { return m.l + (v - xa.min) / (xa.max - xa.min) * iw; };
      var Y = function (v) { return m.t + ih - (v - ya.min) / (ya.max - ya.min) * ih; };
      G = { W: W, H: Hh, m: m, iw: iw, ih: ih, X: X, Y: Y };
      if (svg) svg.remove();
      svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": s.aria || "" });
      wrap.insertBefore(svg, tip);
      var txt = function (x, y, t, a, cls, parent) { var e = S("text", { x: x, y: y, "text-anchor": a || "middle", class: cls || "ax" }, parent || svg); e.textContent = t; return e; };
      // shading under everything
      (s.spans || []).forEach(function (sp) {
        S("rect", { x: X(sp.x0), y: m.t, width: Math.max(2, X(sp.x1) - X(sp.x0)), height: ih, fill: sp.color || "var(--lx-surface-2)", opacity: sp.op == null ? 1 : sp.op }, svg);
        if (sp.label) txt((X(sp.x0) + X(sp.x1)) / 2, m.t + 12, sp.label, "middle", "ax spanl");   // on its own shading: a darker ink
      });
      (s.hbands || []).forEach(function (hb) {
        var a = Y(Math.max(hb.y0, hb.y1)), b = Y(Math.min(hb.y0, hb.y1));
        S("rect", { x: m.l, y: a, width: iw, height: Math.max(1, b - a), fill: hb.color || "var(--lx-bad-soft)", opacity: hb.op == null ? 1 : hb.op }, svg);
        if (hb.label) txt(m.l + 6, a + 14, hb.label, "start");
      });
      // axes
      var yt = ya.ticks || ticks(ya.min, ya.max, ya.step, ya.fmt);
      yt.forEach(function (tk) {
        S("path", { d: "M" + m.l + " " + Y(tk[0]) + " H" + (W - m.r), stroke: ya.zero && tk[0] === 0 ? "var(--lx-ink-3)" : "var(--lx-line)", "stroke-width": 1 }, svg);
        txt(m.l - 6, Y(tk[0]) + 4, tk[1], "end");
      });
      var xt = narrow && xa.ticksN ? xa.ticksN : xa.ticks;
      if (typeof xt === "function") xt = xt(W);
      (xt || []).forEach(function (tk, i, list) { txt(X(tk[0]), Hh - 8, tk[1], anchor(tk, i, list, xa.min, xa.max)); });
      if (ya.unit) txt(4, 10, ya.unit, "start");
      // picked and hovered columns
      var pk = s.pick, cw = pk ? iw / pk.n : 0, hov = null;
      if (pk) {
        if (pk.sel != null && pk.sel >= 0) S("rect", { x: m.l + pk.sel * cw, y: m.t, width: cw, height: ih, fill: "var(--lx-accent-soft)" }, svg);
        if (pk.onPick) hov = S("rect", { x: m.l, y: m.t, width: cw, height: ih, fill: "var(--lx-surface-3)", visibility: "hidden" }, svg);
      }
      // bars and lines, clipped to the plot area; reference lines and marks above them
      var clip = LX.uid("clip"); S("rect", { x: m.l, y: m.t - 2, width: iw, height: ih + 4 }, S("clipPath", { id: clip }, S("defs", null, svg)));
      var g = S("g", { "clip-path": "url(#" + clip + ")" }, svg);
      (s.bars || []).forEach(function (b) {
        var y0 = Y(Math.max(b.y0, b.y1)), y1 = Y(Math.min(b.y0, b.y1));
        S("rect", { x: X(b.x0), y: y0, width: Math.max(1, X(b.x1) - X(b.x0)), height: Math.max(1, y1 - y0), fill: b.color, opacity: b.op == null ? 1 : b.op, rx: b.rx || 0 }, g);
      });
      (s.refs || []).forEach(function (r) {
        S("path", { d: "M" + m.l + " " + Y(r.y) + " H" + (W - m.r), stroke: r.color || "var(--lx-ink-3)", "stroke-width": r.width || 1.3, "stroke-dasharray": r.dash || null }, svg);
        var rl = narrow && r.labelN ? r.labelN : r.label;
        if (rl) { var lt = txt(W - m.r - 4, Y(r.y) + (r.below ? 13 : -5), rl, "end", "rl"); lt.setAttribute("fill", r.labelColor || r.color || "var(--lx-ink-3)"); }
      });
      var base = Y(LX.clamp(0, ya.min, ya.max));
      (s.lines || []).forEach(function (ln) {
        var pts = points(ln); if (!pts.length) return;
        var d = linePath(pts, X, Y, ln.step, ln.offset);
        if (ln.area) {
          var real = pts.filter(function (p) { return p[1] != null && isFinite(p[1]); });
          if (real.length) S("path", { d: "M" + X(real[0][0]).toFixed(1) + " " + base.toFixed(1) + " L" + d.replace(/^M/, "").replace(/ M/g, " L") + " L" + X(real[real.length - 1][0] + (ln.step || 0)).toFixed(1) + " " + base.toFixed(1) + "Z", fill: ln.color, opacity: ln.area }, g);
        }
        if (ln.width === 0) return;
        var p = S("path", { d: d, fill: "none", stroke: ln.color, "stroke-width": ln.width || 2.4, "stroke-dasharray": ln.dash || null, "stroke-linejoin": "round",
          "stroke-linecap": ln.cap || "round", opacity: ln.op == null ? null : ln.op }, g);
        if (ln.dots) pts.forEach(function (q) { if (q[1] != null) S("circle", { cx: X(q[0]), cy: Y(q[1]), r: 3, fill: ln.color }, g); });
        if (animate && ln.anim && !LX.reduced() && !ln.dash && p.getTotalLength) {
          var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
          p.getBoundingClientRect(); p.style.transition = "stroke-dashoffset 1.8s ease-out"; p.style.strokeDashoffset = 0;
        }
      });
      (s.marks || []).forEach(function (mk) { mark(mk, G); });
      if (s.title) txt(m.l, 13, s.title, "start", "ttl");
      // the readout and the column picker
      if (s.tip || (pk && pk.onPick)) {
        var hit = S("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", class: "hit" + (pk && pk.onPick ? " pick" : "") }, svg);
        var at = function (ev) { var rr = svg.getBoundingClientRect(); return LX.clamp(xa.min + ((ev.clientX - rr.left) / rr.width * W - m.l) / iw * (xa.max - xa.min), xa.min, xa.max); };
        hit.addEventListener("pointermove", function (ev) {
          var x = at(ev); show(x);
          if (hov) { hov.setAttribute("x", m.l + column(x, xa.min, xa.max, pk.n) * cw); hov.setAttribute("visibility", "visible"); }
        });
        hit.addEventListener("pointerdown", function (ev) { show(at(ev)); });
        hit.addEventListener("pointerleave", function () { tip.hidden = true; if (hov) hov.setAttribute("visibility", "hidden"); });
        if (pk && pk.onPick) hit.addEventListener("click", function (ev) { pk.onPick(column(at(ev), xa.min, xa.max, pk.n)); });
      }
      var keys = !!(s.tip || (pk && pk.onPick));
      if (keys) {
        wrap.setAttribute("tabindex", "0"); wrap.setAttribute("role", "group");
        wrap.setAttribute("aria-label", (pk && pk.onPick ? "Chart: the left and right arrow keys pick a column" : "Chart: the left and right arrow keys move the readout") + "; the text version lists every value.");
      } else { wrap.removeAttribute("tabindex"); wrap.removeAttribute("role"); wrap.removeAttribute("aria-label"); }
    }
    // a mark: a hollow ring with a bold label beside it (default), a filled dot with a centred label, or a numbered disc
    function mark(mk, g) {
      var m = g.m, cx = g.X(mk.x), cy = g.Y(mk.y), kind = mk.n != null ? "num" : (mk.kind || "ring");
      if (mk.vline) S("path", { d: "M" + cx + " " + m.t + "V" + (m.t + g.ih), stroke: "var(--lx-ink-3)", "stroke-dasharray": "4 3", "stroke-width": 1.5 }, svg);
      if (kind === "num") {
        S("circle", { cx: cx, cy: cy, r: 11, fill: "var(--lx-ink)" }, svg);
        S("text", { x: cx, y: cy + 4.5, "text-anchor": "middle", class: "num" }, svg).textContent = mk.n;
      } else if (!mk.vline || mk.dot) {
        if (kind === "dot") S("circle", { cx: cx, cy: cy, r: 4.5, fill: mk.color || "var(--lx-ink)", stroke: "var(--lx-surface)", "stroke-width": 2 }, svg);
        else S("circle", { cx: cx, cy: cy, r: 5, fill: "var(--lx-surface)", stroke: mk.color || "var(--lx-ink)", "stroke-width": 2.4 }, svg);
      }
      if (!mk.label) return;
      var tx, ty, an;
      if (kind === "ring" && !mk.vline) {
        // above: a point near the top of the plot keeps its label below it, out of the top margin (the y unit's row)
        var up = !!mk.above && cy - 21 >= m.t;
        var right = cx < m.l + g.iw * 0.62; tx = cx + (right ? 9 : -9); ty = cy + (up ? -10 : 18); an = right ? "start" : "end";
        var e = S("text", { x: tx, y: ty, "text-anchor": an, class: "mk" }, svg); e.textContent = mk.label;
        // keep the label inside the chart (narrow phones): switch sides when it would run off an edge; if neither side
        // fits, pin it to the edge on the other side of the line (above instead of below, or below instead of above)
        var len = e.getComputedTextLength ? e.getComputedTextLength() : 0, R = g.W - m.r, pin = function (x, a) {
          e.setAttribute("x", x); e.setAttribute("text-anchor", a); e.setAttribute("y", cy + (up ? 18 : -10)); };
        if (len && right && cx + 9 + len > R) { if (cx - 9 - len >= m.l) { e.setAttribute("x", cx - 9); e.setAttribute("text-anchor", "end"); } else pin(R, "end"); }
        else if (len && !right && cx - 9 - len < m.l) { if (cx + 9 + len <= R) { e.setAttribute("x", cx + 9); e.setAttribute("text-anchor", "start"); } else pin(m.l, "start"); }
        return;
      }
      var pos = mk.pos || (mk.vline ? "bottom" : "above");
      ty = pos === "bottom" ? m.t + g.ih - 8 : pos === "below" ? cy + 22 : cy - 13;
      if (ty > m.t + g.ih - 4) ty = cy - 13;
      if (ty < 12) ty = cy + 22;
      if (mk.vline) { var rt = cx < m.l + g.iw * 0.7; an = rt ? "start" : "end"; tx = cx + (rt ? 6 : -6); }
      else { an = cx < m.l + 70 ? "start" : cx > m.l + g.iw - 70 ? "end" : "middle"; tx = cx + (an === "start" ? -4 : an === "end" ? 4 : 0); }
      S("text", { x: tx, y: ty, "text-anchor": an, class: "mkd" }, svg).textContent = mk.label;
    }
    // the readout at data x (pointer or keyboard)
    function show(x) {
      if (!spec || !spec.tip || !G) { tip.hidden = true; return; }
      var html = spec.tip(x); if (!html) { tip.hidden = true; return; }
      tip.innerHTML = html; tip.hidden = false;
      var rr = svg.getBoundingClientRect(), px = G.X(x) / G.W * rr.width;
      tip.style.left = LX.clamp(px + 12, 0, rr.width - 170) + "px"; tip.style.top = "6px";
    }
    wrap.addEventListener("keydown", function (ev) {
      var s = spec; if (!s || !G) return;
      var pk = s.pick && s.pick.onPick ? s.pick : null, xa = s.x, k = ev.key;
      if (k === "Escape") { tip.hidden = true; return; }
      if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(k) < 0) return;
      ev.preventDefault();
      if (pk) {
        var i = pk.sel == null || pk.sel < 0 ? 0 : pk.sel;
        i = k === "Home" ? 0 : k === "End" ? pk.n - 1 : LX.clamp(i + (k === "ArrowRight" ? 1 : -1), 0, pk.n - 1);
        pk.onPick(i);
        show(xa.min + (i + 0.5) / pk.n * (xa.max - xa.min));
        return;
      }
      var st = s.tipStep || (xa.max - xa.min) / 24;
      kx = kx == null ? xa.min + st / 2 : kx;
      kx = k === "Home" ? xa.min + st / 2 : k === "End" ? xa.max - st / 2 : LX.clamp(kx + (k === "ArrowRight" ? st : -st), xa.min, xa.max);
      show(kx);
    });
    wrap.addEventListener("blur", function () { tip.hidden = true; kx = null; });
    // redraw when the width changes, or when a spec arrived while the chart was hidden
    if (window.ResizeObserver) new ResizeObserver(function () { var w = Math.max(280, wrap.clientWidth || 600); if (w !== lastW || dirty || !svg) render(); }).observe(wrap);
    LX.onTheme(function () { render(); });
    return { render: render, el: wrap, box: box, text: textBody, legend: legend, caption: cap, spec: function () { return spec; } };
  };
  LX.Plot.ticks = ticks;

  // ---------------------------------------------------------------- a chart card with value chips
  LX.PlotCard = function (host, o) {
    o = o || {};
    var card = H("div", { class: "lx-xcard lx-plotcard" + (o.cls ? " " + o.cls : "") }, host);
    var head = H("div", { class: "lx-plotcard-head" }, card);
    var title = H("p", { class: "lx-eyebrow" }, head);
    var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, card);
    var plot = LX.Plot(card, { text: o.text || "Text version of the chart" });
    return {
      el: card, head: head, title: title, chips: chips, plot: plot, text: plot.text,
      chip: function (label, value, tone) { var c = H("div", { class: "lx-readout" + (tone ? " " + tone : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); return c; },
      clear: function () { chips.innerHTML = ""; }
    };
  };
})();
