/* tornado.js — LX.Tornado: a tornado chart. Each row swings one input from a low to a high value while the others stay
   at their defaults, and a bar shows how far the result moves; rows are sorted by swing, largest first (lesson 7).
   var t = LX.Tornado(host, {
     fmt: function (v) { return "$" + Math.round(v); },    the labels at both ends of each bar (default: v rounded)
     fmtAlt: function (v) { return "$" + v.toFixed(2); },  the values in the text version (default: fmt)
     measure: "LCOE",                                      the result's name in the text version (default "result")
     sort: true,                                           sort rows by swing, largest first (stable; false keeps the order)
     pad: 0.28, padAbs: 1,                                 room for the end labels: the axis runs from lo − p to hi + p,
                                                           p = pad × (hi − lo) + padAbs (lo, hi: the lowest and highest result)
     below: "var(--lx-good)", above: "var(--lx-bad)"       colors of the part of a bar below and above the base (swap them
                                                           for a result where higher is better)
   });
   t.draw({ base: 37.52,                                   the result with every input at its default (the black line)
            rows: [{ label: "Capacity factor", loText: "25%", hiText: "45%", atLo: 50.7, atHi: 28.2 }],
                                                           atLo / atHi: the result with this input at its low / high value
            lede: "**Wind farm**: $37.52/MWh at the defaults (black line).",   a line above the rows (**bold**, [[glossary]])
            note: "One or two sentences." });              a hint under the rows, before the text version
   Returns { el, draw(data) }; draw returns the layout (sorted rows with min, max and swing; the axis a..b).
   The bars are decorative (aria-hidden). The text version (details.lx-textalt) lists every row:
   "<label> from <loText> to <hiText>: <measure> <atLo> to <atHi>." Nothing to operate, so no keyboard handling.
   On phones (≤ 560 px) each row's label sits above its bar.
   Node: module.exports = { tornadoLayout } (pure: the rows sorted with min, max and swing, the axis and x(v) in %). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure layout (no DOM; exported for Node)
  function tornadoLayout(rows, base, o) {
    o = o || {};
    var rs = rows.map(function (r, i) {
      var out = {}; for (var k in r) out[k] = r[k];
      out.min = Math.min(r.atLo, r.atHi); out.max = Math.max(r.atLo, r.atHi); out.swing = Math.abs(r.atHi - r.atLo); out.order = i;
      return out;
    });
    if (o.sort !== false) rs.sort(function (a, b) { return b.swing - a.swing || a.order - b.order; });
    var lo = rs.length ? Math.min.apply(null, rs.map(function (r) { return r.min; })) : base;
    var hi = rs.length ? Math.max.apply(null, rs.map(function (r) { return r.max; })) : base;
    var p = (hi - lo) * (o.pad == null ? 0.28 : o.pad) + (o.padAbs == null ? 1 : o.padAbs), a = lo - p, b = hi + p;
    return { rows: rs, base: base, lo: lo, hi: hi, a: a, b: b, x: function (v) { return (v - a) / (b - a) * 100; } };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { tornadoLayout: tornadoLayout };
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  LX.Tornado = function (host, o) {
    o = o || {};
    var fmt = o.fmt || function (v) { return String(Math.round(v)); }, fmtAlt = o.fmtAlt || fmt, measure = o.measure || "result";
    var style = (o.below ? "--below:" + o.below + ";" : "") + (o.above ? "--above:" + o.above : "");
    var box = H("div", { class: "lx-torn", style: style || null }, host);
    var note = H("p", { class: "lx-hint", hidden: true }, host);
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version" }, alt);
    var altB = H("div", null, alt);
    function draw(d) {
      var L = tornadoLayout(d.rows, d.base, o), X = L.x;
      box.innerHTML = ""; altB.innerHTML = "";
      if (d.lede) H("p", { class: "lx-torn-lede", html: bold(d.lede) }, box);
      var ul = H("ul", null, altB);
      L.rows.forEach(function (r) {
        var rw = H("div", { class: "lx-torn-row" }, box), lab = H("span", { text: r.label }, rw);
        if (r.loText != null) H("small", { text: r.loText + " to " + r.hiText }, lab);
        var br = H("div", { class: "lx-torn-bar", "aria-hidden": "true" }, rw);
        H("i", { class: "lo", style: "left:" + X(r.min) + "%;width:" + (X(d.base) - X(r.min)) + "%" }, br);
        H("i", { class: "hi", style: "left:" + X(d.base) + "%;width:" + (X(r.max) - X(d.base)) + "%" }, br);
        H("span", { class: "mid", style: "left:" + X(d.base) + "%" }, br);
        H("em", { text: fmt(r.min), style: "right:" + (100 - X(r.min) + 1) + "%" }, br);
        H("em", { text: fmt(r.max), style: "left:" + (X(r.max) + 1) + "%" }, br);
        H("li", { text: r.label + (r.loText != null ? " from " + r.loText + " to " + r.hiText : "") + ": " + measure + " " + fmtAlt(r.atLo) + " to " + fmtAlt(r.atHi) + "." }, ul);
      });
      note.hidden = !d.note; note.innerHTML = d.note ? LX.rich(d.note) : "";
      LX.emit("layout");
      return L;
    }
    return { el: box, draw: draw };
  };
  LX.Tornado.layout = tornadoLayout;
})();
