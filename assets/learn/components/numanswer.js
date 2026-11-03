/* numanswer.js — LX.NumAnswer: a number box with its label, its unit and a Check button, plus the lenient number parser and
   the tolerance check behind it (promoted from the toolbox, K1 to K4, at the W2 merge, 2026-11-03; K5 and K8 use it too,
   and LX.Drill builds its numeric items with it). Styles in numanswer.css.
   LX.NumAnswer(host, { label, unit, button, width, widthPhone, onCheck })
     label       the visible label, tied to the box (for/id)
     unit        a short unit after the box ("MW", "dollars", "% of hours"); none when empty
     button      the button's text (default "Check")
     width       the box's width as a CSS length (default 7.5em); widthPhone the width at 560 px and below (default: width)
     onCheck     function (v, input): v is the parsed number, or null when the box holds no number; Check and Enter run it
   Returns { row, input, button, go } (go() runs the check, e.g. for a page's "finish for me" shortcut).
   The box is a text input with inputmode="decimal", so phones show a number pad and "1,230", "$3.85" or "−3" are accepted.
   Pure (no DOM; Node: require("assets/learn/components/numanswer.js"); page: LX.NumAnswer.parse, LX.NumAnswer.close):
     parse(text)          "450,000", "0.45", "$78,600", "33.8%", "6.96e9", "6.96 × 10^9", "6.96x10^9", "−3" -> a number;
                          null when the text holds no number. Thousands commas, spaces, $ and % are dropped, − and – read
                          as minus signs; otherwise the leading number counts, as parseFloat reads it.
     close(v, ans, tol)   v is a number within tol of ans (plus 1e-9 for rounding); without tol, v must equal ans exactly
   Classes: .lx-na (the row), .lx-na-num (the box; .right and .wrong mark a checked answer), .lx-na-unit. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function parse(text) {
    var t = String(text == null ? "" : text).replace(/[−–]/g, "-").replace(/[,\s$%]/g, "");
    var m = /^(-?\d*\.?\d+)(?:[x×*]10\^?(-?\d+))?$/i.exec(t);
    if (m) return m[2] != null ? +m[1] * Math.pow(10, +m[2]) : +m[1];
    var v = parseFloat(t); return isNaN(v) ? null : v;
  }
  function close(v, ans, tol) {
    if (v == null || typeof v !== "number" || isNaN(v)) return false;
    return tol == null ? v === ans : Math.abs(v - ans) <= tol + 1e-9;
  }
  var pure = { parse: parse, close: close };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX;
  LX.NumAnswer = function (host, o) {
    o = o || {};
    var H = LX.H, id = LX.uid("in"), w = [];
    if (o.width) w.push("--lx-na-w:" + o.width);
    if (o.widthPhone) w.push("--lx-na-wp:" + o.widthPhone);
    var row = H("div", { class: "lx-na", style: w.length ? w.join(";") : null }, host);
    H("label", { for: id, text: o.label || "Answer" }, row);
    var inp = H("input", { id: id, type: "text", inputmode: "decimal", autocomplete: "off", class: "lx-na-num" }, row);
    if (o.unit) H("span", { class: "lx-na-unit", text: o.unit }, row);
    var btn = H("button", { type: "button", class: "lx-btn small", text: o.button || "Check" }, row);
    function go() { if (o.onCheck) o.onCheck(parse(inp.value), inp); }
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    return { row: row, input: inp, button: btn, go: go };
  };
  LX.NumAnswer.parse = parse;
  LX.NumAnswer.close = close;
})();
