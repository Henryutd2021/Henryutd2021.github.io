/* costsplit.js — LX.CostSplit: stacked bars that split a total into its parts, one row per item, with a colour key (lesson
   7: a plant's cost per MWh split into building the plant, fixed upkeep, fuel and upkeep per MWh).
   var cs = LX.CostSplit(host, {
     parts: [{ key: "capital", label: "Building the plant", color: "var(--lx-tier-2)", words: "building the plant" }, ...],
                                    words: the part inside a sentence (text version, spoken labels; default: label in lower case)
     rows: [{ key: "wind", label: "Wind", color: "var(--lx-wind)", values: { capital: 31.2, fom: 9.8, fuel: 0, vom: 0 },
              total: 41.0, aria: "Wind farm: $41.00 per MWh; building the plant $31.20, ..." }],
                                    label: the short name on the row; aria: the row's spoken text (a button's label; on
                                    a plain row a hidden sentence, default "Wind: $41; building the plant $31, ...")
     scale: 120,                    the value that fills a whole bar (default: the largest total × 1.04)
     fmt: function (v) { return "$" + Math.round(v); },   the total at the end of each row (default: v rounded)
     min: 0.005,                    parts at or below this are left out (bar and text)
     onPick: function (key) {},     rows become toggle buttons (aria-pressed marks the last one picked); without it, plain rows
     key: true });                  the colour key right after the rows (false: place it with cs.key(host))
   cs.set(rows[, scale])  redraw the rows (a calculator) | cs.key(host) add the colour key (aria-hidden) | cs.el | cs.rows {key: row}
   Helpers for other bars and for text versions:
     LX.CostSplit.bar(host, [{ color, value }], scale, { height }) -> one stacked bar (span, aria-hidden)
     LX.CostSplit.fill(bar, [{ color, value }], scale)            repaint that bar
     LX.CostSplit.text(parts, values, fmt, min) -> "building the plant $31.20, fixed upkeep $9.80" (parts above min only)
   Keyboard: picked rows are real buttons (Tab, Enter, Space; the shared focus ring). The bars are decorative: give each
   button row an aria label (row.aria) and the lesson a text version (LX.CostSplit.text writes its sentences). A plain row
   (no onPick) is read from a visually hidden sentence (.lx-sr): row.aria, else its name, total and parts; its drawn name
   and total are hidden from screen readers, so nothing is read twice.
   On phones (≤ 560 px) the name and the total share a line and the bar runs full width below them.
   Node: module.exports = { segments, splitText } (pure). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure helpers (no DOM; exported for Node)
  // the drawn segments of one bar: [{key, color, value, pct}] for the parts above `min`, pct = value / scale × 100
  function segments(parts, values, scale, min) {
    var m = min == null ? 0.005 : min;
    return parts.filter(function (p) { return values[p.key] > m; })
      .map(function (p) { return { key: p.key, color: p.color, value: values[p.key], pct: values[p.key] / scale * 100 }; });
  }
  function splitText(parts, values, fmt, min) {
    var f = fmt || function (v) { return String(v); };
    return segments(parts, values, 1, min).map(function (s) {
      var p = parts.filter(function (q) { return q.key === s.key; })[0];
      return (p.words || p.label.toLowerCase()) + " " + f(s.value);
    }).join(", ");
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { segments: segments, splitText: splitText };
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function fill(bar, segs, scale) {
    bar.innerHTML = "";
    segs.forEach(function (s) { if (s.value > 0) H("i", { style: "--c:" + s.color + ";width:" + (s.value / scale * 100) + "%" }, bar); });
    return bar;
  }
  function bar(host, segs, scale, opt) {
    var b = H("span", { class: "lx-split-bar", "aria-hidden": "true", style: opt && opt.height ? "height:" + opt.height + "px" : null }, host);
    return fill(b, segs, scale);
  }
  LX.CostSplit = function (host, o) {
    var fmt = o.fmt || function (v) { return String(Math.round(v)); }, min = o.min == null ? 0.005 : o.min;
    function rowText(r) { var t = splitText(o.parts, r.values || {}, fmt, min); return r.aria || r.label + ": " + fmt(r.total) + (t ? "; " + t : "") + "."; }
    var box = H("div", { class: "lx-split" }, host), rows = {}, keyEl = null, out = { el: box, rows: rows };
    function draw(list, scale) {
      box.innerHTML = ""; Object.keys(rows).forEach(function (k) { delete rows[k]; });
      var sc = scale || o.scale || Math.max.apply(null, list.map(function (r) { return r.total; })) * 1.04;
      list.forEach(function (r) {
        var b = H(o.onPick ? "button" : "div", o.onPick ? { type: "button", class: "lx-split-row", "aria-pressed": "false", "aria-label": r.aria || null } : { class: "lx-split-row" }, box);
        // a plain row is read from a hidden sentence (row.aria, else the name, total and parts), the drawn parts hidden
        var hide = o.onPick ? null : "true";
        var nm = H("span", { class: "lx-split-nm", "aria-hidden": hide }, b); H("i", { style: "--c:" + (r.color || "var(--lx-ink-3)") }, nm); H("span", { text: r.label }, nm);
        bar(b, segments(o.parts, r.values, 1, min).map(function (s) { return { color: s.color, value: s.value }; }), sc);
        H("span", { class: "lx-split-tot", "aria-hidden": hide, text: fmt(r.total) }, b);
        if (!o.onPick) H("span", { class: "lx-sr", text: rowText(r) }, b);
        rows[r.key] = b;
        if (o.onPick) b.addEventListener("click", function () {
          Object.keys(rows).forEach(function (j) { rows[j].setAttribute("aria-pressed", j === r.key ? "true" : "false"); });
          o.onPick(r.key);
        });
      });
    }
    out.key = function (h) {
      keyEl = H("div", { class: "lx-split-key", "aria-hidden": "true" }, h || host);
      o.parts.forEach(function (p) { var s = H("span", null, keyEl); H("i", { style: "--c:" + p.color }, s); H("span", { text: p.label }, s); });
      return keyEl;
    };
    out.set = function (list, scale) { draw(list, scale); LX.emit("layout"); };
    draw(o.rows || [], o.scale);
    if (o.key !== false) out.key(host);
    return out;
  };
  LX.CostSplit.bar = bar;
  LX.CostSplit.fill = fill;
  LX.CostSplit.text = splitText;
  LX.CostSplit.segments = segments;
})();
