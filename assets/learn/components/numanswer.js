/* numanswer.js — LX.NumAnswer: a number box with its label, its unit and a Check button, plus the lenient number parser and
   the tolerance check behind it (used by the toolbox lessons K1 to K5 and K8, and LX.Drill builds its numeric items
   with it). Styles in numanswer.css.
   LX.NumAnswer(host, { label, unit, accept, button, width, widthPhone, onCheck })
     label       the visible label, tied to the box (for/id)
     unit        a short unit after the box ("MW", "dollars", "% of hours"); none when empty. The box's description
                 (aria-describedby), and the one unit a reader may type after the number ("450,000 kW" in a kW box)
     accept      other units that may follow the number, as a list (default: the unit only)
     button      the button's text (default "Check")
     width       the box's width as a CSS length (default 7.5em); widthPhone the width at 560 px and below (default: width)
     onCheck     function (v, input): v is the parsed number, or null when the box is empty; Check and Enter run it
   Returns { row, input, button, msg, go } (go() runs the check, e.g. for a page's "finish for me" shortcut).
   Text that is not just a number (another unit, such as "450,000 MW" in a kW box, or other words) is refused: the box
   says "Type just the number: the box is in kW." in its own live note (msg, tied to the box), sets aria-invalid, and does
   not call onCheck, so a refused entry is never graded.
   The box is a text input with inputmode="decimal", so phones show a number pad and "1,230", "$3.85" or "−3" are accepted.
   Pure (no DOM; Node: require("assets/learn/components/numanswer.js"); page: LX.NumAnswer.parse, .read, .close):
     parse(text, unit)    "450,000", "0.45", "$78,600", "33.8%", "6.96e9", "6.96 × 10^9", "6.96x10^9", "6.96 × 10⁹", "10⁹",
                          "−3" -> a number; null when the text is not a number. Thousands commas, spaces, $ and % are
                          dropped, − and – read as minus signs, superscript digits as an exponent. After the number only
                          the unit (a string or a list; case and spaces ignored, "/" for "per") may follow; any other
                          leftover text gives null.
     read(text, unit)     { value, why }: why is null (a number), "empty" (nothing but spaces, $ or %) or "text" (not just a
                          number: another unit, words, or no number at all)
     close(v, ans, tol)   v is a number within tol of ans (plus 1e-9 for rounding); without tol, v must equal ans exactly
   Classes: .lx-na (the row), .lx-na-num (the box; .right and .wrong mark a checked answer), .lx-na-unit, .lx-na-msg. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  var SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };
  // the text with commas, spaces, $ and % dropped, minus signs and superscript exponents ("10⁹" -> "10^9") read
  function squeeze(text) {
    return String(text == null ? "" : text).replace(/[−–]/g, "-").replace(/[,\s$%]/g, "")
      .replace(/[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, function (x) { return "^" + x.replace(/./g, function (c) { return SUP[c]; }); }).replace(/\^\^/g, "^");
  }
  function unitKey(u) { return squeeze(u).toLowerCase().replace(/per/g, "/"); }
  var NUM = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(?:[x×*·]10\^([-+]?\d+))?(.*)$/i;
  function read(text, unit) {
    var t = squeeze(text);
    if (t === "") return { value: null, why: "empty" };
    var m = /^10\^([-+]?\d+)(.*)$/.exec(t), v, rest;   // a bare power of ten, "10^9" or "10⁹"
    if (m) { v = Math.pow(10, +m[1]); rest = m[2]; }
    else {
      m = NUM.exec(t);
      if (!m) return { value: null, why: "text" };
      v = m[2] != null ? +m[1] * Math.pow(10, +m[2]) : +m[1]; rest = m[3];
    }
    if (rest) {
      var ok = [].concat(unit == null ? [] : unit).some(function (u) { var k = unitKey(u); return k !== "" && k === unitKey(rest); });
      if (!ok) return { value: null, why: "text" };
    }
    return isFinite(v) ? { value: v, why: null } : { value: null, why: "text" };
  }
  function parse(text, unit) { return read(text, unit).value; }
  function close(v, ans, tol) {
    if (v == null || typeof v !== "number" || isNaN(v)) return false;
    return tol == null ? v === ans : Math.abs(v - ans) <= tol + 1e-9;
  }
  var pure = { parse: parse, read: read, close: close };
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
    var uid = o.unit ? id + "-u" : null, mid = id + "-m";
    if (o.unit) H("span", { id: uid, class: "lx-na-unit", text: o.unit }, row);
    var btn = H("button", { type: "button", class: "lx-btn small", text: o.button || "Check" }, row);
    var msg = H("span", { id: mid, class: "lx-na-msg", "aria-live": "polite", hidden: true }, row);
    var units = (o.unit ? [o.unit] : []).concat(o.accept || []);
    function describe(refused) { inp.setAttribute("aria-describedby", [uid, refused ? mid : null].filter(Boolean).join(" ")); if (!uid && !refused) inp.removeAttribute("aria-describedby"); }
    describe(false);
    function go() {
      var r = read(inp.value, units);
      if (r.why === "text") {
        msg.textContent = "Type just the number" + (o.unit ? ": the box is in " + o.unit + "." : ".");
        msg.hidden = false; inp.setAttribute("aria-invalid", "true"); describe(true);
        return;
      }
      msg.textContent = ""; msg.hidden = true; inp.removeAttribute("aria-invalid"); describe(false);
      if (o.onCheck) o.onCheck(r.value, inp);
    }
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    return { row: row, input: inp, button: btn, msg: msg, go: go };
  };
  LX.NumAnswer.parse = parse;
  LX.NumAnswer.read = read;
  LX.NumAnswer.close = close;
})();
