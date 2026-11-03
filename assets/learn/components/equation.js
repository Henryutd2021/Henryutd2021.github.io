/* equation.js — LX.EquationCard: an equation whose symbols are buttons (the curriculum's e-equation). A symbol opens its
   words, its unit, the reader's own numbers, a story line and its code; a "Text version" lists every row and symbol.
   LX.EquationCard(host, {
     title: "The capacity-factor equation", lede: "Tap a symbol ...",       heading, and a one-line lede ([[glossary|marks]] allowed)
     rows: [                                                                one entry per line of the equation, as parts or as html
       { parts: [{ k: "cf" }, "=", { k: "E" }, "÷", "(", { k: "P" }, "×", { k: "T" }, ")"],
                  parts: a string or number is plain text (an operator or a word);
                         { k: "cf" } is symbol cf's button, showing its `sym` html ({ k, html } shows other html);
                         { html: "minimize " } is plain html, no button (smaller, for words);
                         { frac: [[...numerator parts], [...denominator parts]] } is a fraction
         say: "Capacity factor equals ...",                                 the row read aloud: its aria-label, and the first lines of
                                                                            the text version (its plain-text parts are then hidden
                                                                            from screen readers, which read `say` instead)
         note: "the same, turned around",                                   a small line under the row
         tag: "goal" },                                                     a small label at the end of the row
       { html: 'min Σ ( ' + LX.EquationCard.sym("c", "40") + ' … )', tag: "goal" }
                  html: the row as html; every <button data-s="id"> in it becomes symbol id's button
     ],
     symbols: { cf: { sym: "CF",                       the button's html (parts rows)
                      name: "Capacity factor",         the panel's heading and the button's spoken name
                      label: "C F",                    spoken name instead of `name` (optional)
                      unit: "%",                       shown after the name: "Capacity factor (%)", in the panel and
                                                       in the text version
                      color: "var(--lx-tier-1)",       a colour bar under the button (optional)
                      words: "One or two sentences.",  what it means (alias: text)
                      you: "..." | function () {},     and any key named in `fields`: the lines under the words
                      story: "...", code: "..." } },
     fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
                  the lines under the words, in this order, each shown when the symbol has that key (a function is called
                  each time the symbol opens, so it can read the reader's stored numbers). label: null shows the value in
                  bold with no label. code: true shows it as code. alt: true (or a label of its own) also writes the line
                  into the text version. Default: you "In this lesson", story "In the story", code "In code" (code: true).
     sel: "cf",                 the symbol shown first (default: the first symbol)
     dense: false,              true: a formula box with the symbols as dotted-underlined words, rows kept on one line and the
                                box scrolling sideways (for a whole model with many symbols); default: large symbol buttons
     aside: false,              true: the panel sits beside the equation when the card is wider than 860 px
     eyebrow: "Symbol",         a small label above the symbol's name in the panel
     label: "LCOE equation",    the equation's spoken name (default "Symbols of the equation; select one")
     hint: "One sentence.",     a line under the panel
     code: "...", codeLabel: "The same equation in code (Python)",   the whole equation as code, in a collapsed box
     textLabel: "Text version" });                                    the text version's summary
   Returns { select(id), el }. Symbols are real buttons (Tab, Enter, Space) with aria-pressed and a visible focus ring;
   the panel is a polite live region. Colours come from tokens only. LX.EquationCard.sym(id, html) writes the button
   markup for html rows. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  var DEFAULT_FIELDS = [{ key: "you", label: "In this lesson" }, { key: "story", label: "In the story" }, { key: "code", label: "In code", code: true }];
  function val(v) { return typeof v === "function" ? v() : v; }
  function stop(s) { return /[.!?:;]$/.test(s) ? s : s + "."; }

  LX.EquationCard = function (host, o) {
    var S = o.symbols, fields = o.fields || DEFAULT_FIELDS, btns = {}, cur = null;
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var wrap = H("div", { class: "lx-eqc" + (o.aside ? " lx-eqc-side" : "") }, host), main = H("div", { class: "lx-eqc-main" }, wrap);
    var eq = H("div", { class: "lx-eq" + (o.dense ? " dense" : ""), role: "group", "aria-label": o.label || "Symbols of the equation; select one" }, main);
    var det = H("div", { class: "lx-cdetail lx-eq-det", "aria-live": "polite" });

    function wire(b, k) {
      var s = S[k]; if (!s) return;
      b.setAttribute("type", "button"); b.classList.add("lx-eq-sym"); b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", s.label || s.name);
      if (s.color && !o.dense) { b.classList.add("c"); b.style.setProperty("--c", s.color); }
      b.addEventListener("click", function () { select(k); });
      (btns[k] = btns[k] || []).push(b);
    }
    function parts(par, list, quiet) {
      list.forEach(function (p) {
        if (typeof p === "string" || typeof p === "number") { H("span", { class: "op", text: String(p), "aria-hidden": quiet ? "true" : null }, par); return; }
        if (p.frac) {
          var f = H("span", { class: "frac" }, par);
          parts(H("span", { class: "num" }, f), p.frac[0], quiet); parts(H("span", { class: "den" }, f), p.frac[1], quiet);
          return;
        }
        if (p.k) { var b = H("button", { "data-s": p.k, html: p.html != null ? p.html : S[p.k].sym }, par); wire(b, p.k); return; }
        H("span", { class: "op txt", html: p.html, "aria-hidden": quiet ? "true" : null }, par);
      });
    }
    o.rows.forEach(function (r) {
      var row = H("div", { class: "lx-eq-row", role: r.say ? "group" : null, "aria-label": r.say || null }, eq);
      if (r.html != null) {
        row.innerHTML = r.html;
        [].forEach.call(row.querySelectorAll("button[data-s]"), function (b) { wire(b, b.getAttribute("data-s")); });
      } else parts(row, r.parts, !!r.say);
      if (r.tag) H("span", { class: "tag", text: r.tag }, row);
      if (r.note) H("span", { class: "note", text: r.note }, row);
    });
    if (o.aside) wrap.appendChild(det); else main.appendChild(det);
    if (o.hint) H("p", { class: "lx-hint", html: LX.rich(o.hint) }, main);
    if (o.code) { var cd = H("details", { class: "lx-textalt lx-eq-code" }, main); H("summary", { text: o.codeLabel || "The same equation in code" }, cd); H("pre", { text: o.code }, cd); }

    // text version: the rows read aloud, then every symbol with its words (and the fields marked alt)
    var alt = H("details", { class: "lx-textalt" }, main); H("summary", { text: o.textLabel || "Text version" }, alt);
    var ul = H("ul", null, alt);
    o.rows.forEach(function (r) { if (r.say) H("li", { text: r.say }, ul); });
    Object.keys(S).forEach(function (k) {
      var s = S[k], t = LX.rich(s.words != null ? s.words : s.text);
      fields.forEach(function (f) {
        if (!f.alt) return;
        var v = val(s[f.key]); if (v == null || v === "") return;
        t += " " + LX.esc(f.alt === true ? f.label : f.alt) + ": " + LX.rich(stop(String(v)));
      });
      H("li", { html: "<b>" + LX.esc(s.name) + (s.unit ? " (" + LX.esc(s.unit) + ")" : "") + "</b>: " + t }, ul);   // name (unit), as the panel
    });

    function select(k) {
      var s = S[k]; if (!s) return;
      cur = k;
      Object.keys(btns).forEach(function (j) { btns[j].forEach(function (b) { b.setAttribute("aria-pressed", j === k ? "true" : "false"); }); });
      det.innerHTML = "";
      if (o.eyebrow) H("p", { class: "lx-eyebrow", text: o.eyebrow }, det);
      H("h4", { text: s.name + (s.unit ? " (" + s.unit + ")" : "") }, det);
      H("p", { html: LX.rich(s.words != null ? s.words : s.text) }, det);
      fields.forEach(function (f) {
        var v = val(s[f.key]); if (v == null || v === "") return;
        if (f.label == null) { H("p", { class: "you", html: LX.rich(String(v)) }, det); return; }
        var ig = H("div", { class: "ingame" }, det); H("b", { text: f.label }, ig);
        if (f.code) H("code", { text: String(v) }, ig); else H("span", { html: LX.rich(String(v)) }, ig);
      });
    }
    select(o.sel && S[o.sel] ? o.sel : Object.keys(S)[0]);
    return { select: select, el: wrap, current: function () { return cur; } };
  };
  // markup of one symbol button inside an html row
  LX.EquationCard.sym = function (id, html) { return '<button type="button" data-s="' + LX.esc(id) + '">' + html + "</button>"; };
})();
