/* unitchain.js — LX.UnitChain: a back-of-envelope chain of numbers with units (649 TWh × 1,000 = 649,000 GWh ÷ 8,760 h =
   74.1 GW ...), and LX.EvidenceClock: a timeline of how long evidence took after an event (first used by N1's envelope
   checks).
   var uc = LX.UnitChain(host, { label: "Unit chain", steps: [
       { v: "649 TWh", u: "a year (energy)" }, { op: "× 1,000 =" }, { v: "649,000 GWh", u: "a year" },
       { op: "÷ 8,760 h =" }, { v: "74.1 GW", u: "average power", out: true }] });
   uc.set(steps)   redraws the chain (for a slider or a choice that changes a number)
   Steps: { v, u } a value and what it is (unit words); { op } the operation between two values; out: true marks the result.
   Returns { el (the <ol class="lx-uchain">), set(steps) }. The chain is an ordered list, so it reads as text; it wraps on
   phones. (Not .lx-chain: that class is the causal chain's, causal.js.)

   var ck = LX.EvidenceClock(host, { label: "Timeline: ...", marks: [
       { d: 0, label: "Blackout", value: "28 Apr 2025" },
       { d: 1, label: "One-cause claim", value: "within a day", warn: true, anchor: "start", dx: 4 },
       { d: 158, label: "Factual report", value: "158 days" }, { d: 326, label: "Final report", value: "326 days" }] });
   Marks sit at their day d on one line, scaled to the last mark; labels alternate below (even) and above (odd) the line.
   anchor: "start" | "middle" | "end" (default: the first mark "start", the last "end", others "middle"); dx shifts the
   text; warn: true draws the dot in the warning color (a claim that came before the evidence).
   textLabel: the summary of the text version (default "Text version of the timeline"); textalt: false leaves it out.
   Returns { el }. The SVG has role="img" and the label; the text version lists every mark. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.LX) return;
  var LX = window.LX, H = LX.H, S = LX.S;

  LX.UnitChain = function (host, o) {
    o = o || {};
    var ol = H("ol", { class: "lx-uchain", "aria-label": o.label || "Unit chain" }, host);
    function set(steps) {
      ol.innerHTML = "";
      (steps || []).forEach(function (s) {
        if (s.op) { H("li", { class: "op", text: s.op }, ol); return; }
        var li = H("li", { class: s.out ? "out" : "" }, ol); H("b", { text: s.v }, li); H("span", { text: s.u }, li);
      });
    }
    set(o.steps);
    return { el: ol, set: set };
  };

  LX.EvidenceClock = function (host, o) {
    var box = H("div", { class: "lx-clock" }, host), M = o.marks, last = M.length - 1;
    var W = 640, Hh = 96, dMax = Math.max.apply(null, M.map(function (m) { return m.d; })) || 1;
    var x = function (d) { return 30 + d / dMax * (W - 60); };
    var svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": o.label || M.map(function (m) { return m.label + ": " + m.value; }).join("; ") }, box);
    S("path", { d: "M30 46 H" + (W - 30), stroke: "var(--lx-line-2)", "stroke-width": 3 }, svg);
    M.forEach(function (m, i) {
      var xx = x(m.d), up = i % 2 === 1, tx = xx + (m.dx || 0);
      var anchor = m.anchor || (i === 0 ? "start" : i === last ? "end" : "middle");
      S("circle", { cx: xx, cy: 46, r: 6, fill: m.warn ? "var(--lx-warn)" : "var(--lx-ink)" }, svg);
      S("text", { x: tx, y: up ? 26 : 74, "text-anchor": anchor }, svg).textContent = m.label;
      S("text", { x: tx, y: up ? 12 : 90, "text-anchor": anchor, class: "v" }, svg).textContent = m.value;
    });
    if (o.textalt !== false) {
      var alt = H("details", { class: "lx-textalt" }, box); H("summary", { text: o.textLabel || "Text version of the timeline" }, alt);
      var ul = H("ul", null, alt);
      M.forEach(function (m) { H("li", { text: m.label + ": " + m.value }, ul); });
    }
    return { el: box };
  };
})();
