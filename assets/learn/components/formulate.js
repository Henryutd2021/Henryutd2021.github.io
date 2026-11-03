/* formulate.js — LX.FormulateBox: "Formulate it", the parts of an optimization model in words (the curriculum's e-formulate):
   what is decided, the goal, the rules, what is given or what comes back; the symbols on request.
   LX.FormulateBox(host, { title: "Formulate it: the battery's day in words", lede: "One sentence.",
     parts: [{ k: "Decisions", color: "var(--lx-tier-2)", text: "One or two sentences ([[glossary|marks]] allowed)." },
             { k: "Goal", color: "var(--lx-good)", text: "..." }, { k: "Rules", color: "var(--lx-warn)", text: "..." },
             { k: "Given", color: "var(--lx-ink-3)", text: "..." }],      k: the part's name; color: the bar on top (a token)
     symbols: "min Σ<sub>t</sub> ... <span class=\"tag\">balance</span><br>...",   optional: the same model in symbols, as html
                                                                                     (.tag = a small grey label after a line)
     symbolsLabel: "Show it in symbols" });                                         the summary of the collapsed symbols box
   Four parts sit in one row on wide cards, two by two under 860 px, and stacked under 520 px. The symbols box is a
   <details>, so it is keyboard operable and readable as text; long lines scroll inside the box, not the page.
   Returns { el, parts: [part elements], symbols: the symbols box or null }. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.FormulateBox = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var g = H("div", { class: "lx-form" + (o.parts.length === 3 ? " three" : "") }, host);
    var els = o.parts.map(function (pt) {
      var d = H("div", { style: "--c:" + (pt.color || "var(--lx-line-2)") }, g);
      H("h4", { text: pt.k }, d); H("p", { html: LX.rich(pt.text) }, d);
      return d;
    });
    var sym = null;
    if (o.symbols) {
      var det = H("details", { class: "lx-textalt lx-form-symbols" }, host); H("summary", { text: o.symbolsLabel || "Show it in symbols" }, det);
      sym = H("div", { class: "lx-form-sym", html: o.symbols }, det);
    }
    return { el: g, parts: els, symbols: sym };
  };
})();
