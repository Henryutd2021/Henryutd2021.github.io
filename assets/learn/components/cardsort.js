/* cardsort.js — LX.CardSort: sort cards into bins and check the sort, with a one-line reason for each card. Two modes
   of one component:

   "cards" (default; lesson 10's i-formulation): tap a card, then tap a bin; tap a placed card to move it. Check marks each
   placed card right or not and gives the reasons of up to three wrong ones.
     LX.CardSort(host, { bins: [{id, label, sub, color}], cards: [{id, text, bin, why}],
                         hint (default "Tap a card, then tap the box it belongs in. Tap a placed card to move it."),
                         checkLabel (default "Check"), emptyText (shown when every card is placed), maxWhy (default 3),
                         onCheck: function (g) {} })            g = LX.CardSort.grade(cards, placed)
       -> { el, placed() ({cardId: binId}), place(map), check() }
     Keep a "Given (data)" bin next to Decisions, Goal and Rules: telling parameters from decisions is the commonest
     formulation error (lesson 10's sidecar, learn/_w1/10-write-it-down.yml).

   "toggles" (the job sorter, lesson 6): one row per item, one toggle per bin, any number of bins per item. Check compares
   every cell with a reference: a "yes" cell agrees when the toggle is on; any other value except "partly" is a clear
   "off" cell, which agrees when the toggle is off ("no", or a word such as "not stated", R2: the value is shown as
   written in the "Why" list); a "partly" cell accepts either answer. Each row has a "Why" button that opens the
   reference's reasons (shown after the first check).
     LX.CardSort(host, { mode: "toggles", bins: [{key, label, short, icon}], items: [{key, label, color, ref: {binKey: "yes" |
                         "no" | "partly" | another "off" word}, why: {binKey: "One sentence."}}], marks: {itemKey: {binKey: true}},
                         onChange: function (marks) {}, onCheck: function (res) {}, checked (show the last check again),
                         checkLabel (default "Check"), legend (HTML; default: agrees · differs · "partly": either is fair),
                         cls (extra class on the root) })
       -> { el, check() }                                       res = LX.CardSort.score(marks, items, binKeys)

   Pure (no DOM; Node: require("assets/learn/components/cardsort.js") = { grade, score, reference }):
     grade(cards, placed)            -> {items: [{id, placed, ok}], right, placed, total}
     score(marks, items, binKeys)    -> {agree, differ, partly, clear, cells: {itemKey: {binKey: "agree" | "differ" | "partly"}}}
     reference(items, binKeys)       -> the marks that agree with every clear cell ("yes" on, every other value off)
   Bins and items take `id` or `key`. Keyboard: cards, bins and toggles are buttons (Tab, Enter or Space); the score and the
   reasons are announced (aria-live). No chart, so no text version is needed.
   Glossary marks ([[id|words]]) work in every text. Inside a button (a card, a bin, a toggle's spoken name) the words
   show plain, and in "cards" mode the marked terms of the cards and bins are listed once under the hint as glossary
   buttons; the row names, the reasons and the "Why" lists show the marks in place. */
(function () {
  "use strict";
  function kid(x) { return x.id != null ? x.id : x.key; }
  function grade(cards, placed) {
    var res = cards.map(function (c) { var id = kid(c); return { id: id, placed: placed[id] || null, ok: placed[id] === c.bin }; });
    return { items: res, right: res.filter(function (r) { return r.ok; }).length, placed: res.filter(function (r) { return r.placed; }).length, total: cards.length };
  }
  function score(marks, items, binKeys) {
    var res = { agree: 0, differ: 0, partly: 0, clear: 0, cells: {} };
    items.forEach(function (t) {
      var k = kid(t); res.cells[k] = {};
      binKeys.forEach(function (j) {
        var ref = t.ref[j], on = !!(marks[k] && marks[k][j]), c;
        if (ref === "partly") { c = "partly"; res.partly++; }
        else { res.clear++; c = (ref === "yes") === on ? "agree" : "differ"; res[c]++; }
        res.cells[k][j] = c;
      });
    });
    return res;
  }
  function reference(items, binKeys) {
    var m = {}; items.forEach(function (t) { var k = kid(t); m[k] = {}; binKeys.forEach(function (j) { m[k][j] = t.ref[j] === "yes"; }); }); return m;
  }
  var pure = { grade: grade, score: score, reference: reference };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  var LX = window.LX, H = LX.H;
  // glossary marks ([[id|words]], LX.rich) in card and bin texts: a card or bin is a button, and a term inside a button
  // cannot be its own button, so there the words show plain and the marked terms are listed once, as glossary buttons,
  // under the hint ("Terms on the cards: ..."); the reasons, row names and "Why" lists show the marks in place
  var MARK = /\[\[(?:lesson:)?[a-z0-9-]+\|([^\]]+)\]\]/g;
  function plain(t) { return String(t == null ? "" : t).replace(MARK, "$1"); }
  function marked(t) { return /\[\[(?:lesson:)?[a-z0-9-]+\|[^\]]+\]\]/.test(String(t == null ? "" : t)); }
  function termsOf(texts) {
    var seen = {}, out = [];
    texts.forEach(function (t) { (String(t || "").match(/\[\[[a-z0-9-]+\|[^\]]+\]\]/g) || []).forEach(function (m) { var id = m.slice(2, m.indexOf("|")); if (!seen[id]) { seen[id] = 1; out.push(m); } }); });
    return out;
  }

  // ---- "cards": tap a card, then tap a bin
  function cardsMode(host, o) {
    var w = H("div", { class: "lx-cs" + (o.cls ? " " + o.cls : "") }, host), placed = {}, armed = null, checked = false;
    H("p", { class: "lx-hint", text: o.hint || "Tap a card, then tap the box it belongs in. Tap a placed card to move it." }, w);
    var terms = termsOf(o.cards.map(function (c) { return c.text; }).concat(o.bins.map(function (b) { return b.label; }), o.bins.map(function (b) { return b.sub; })));
    if (terms.length) H("p", { class: "lx-hint lx-cs-terms", html: "Terms on the cards: " + terms.map(LX.rich).join(" · ") }, w);
    var pool = H("div", { class: "lx-cs-pool", "data-empty": o.emptyText || "All cards placed.", role: "group", "aria-label": "Cards to sort" }, w);
    var bins = H("div", { class: "lx-cs-bins", style: "--n:" + o.bins.length }, w), binEls = {};
    o.bins.forEach(function (b) {
      var id = kid(b), el = H("div", { class: "lx-cs-bin", style: "--c:" + b.color }, bins);
      var bt = H("button", { type: "button", class: "lx-cs-binbtn", "aria-label": "Put the chosen card in " + plain(b.label) }, el);
      H("b", { text: plain(b.label) }, bt); if (b.sub) H("small", { text: plain(b.sub) }, bt);
      var list = H("div", { class: "lx-cs-list" }, el);
      bt.addEventListener("click", function () { if (armed) { placed[armed] = id; armed = null; checked = false; feedback.innerHTML = ""; score.textContent = ""; paint(); } });
      binEls[id] = { el: el, list: list, label: plain(b.label) };
    });
    var foot = H("div", { class: "lx-step-foot" }, w);
    var chk = H("button", { type: "button", class: "lx-btn small", text: o.checkLabel || "Check" }, foot);
    var score = H("span", { class: "lx-hint", "aria-live": "polite" }, foot);
    var feedback = H("div", { "aria-live": "polite" }, w);
    var btns = {};
    o.cards.forEach(function (c) {
      var id = kid(c), b = H("button", { type: "button", class: "lx-cs-card", "aria-pressed": "false" }, null);
      H("span", { text: plain(c.text) }, b);
      b.addEventListener("click", function () { armed = armed === id ? null : id; paint(); });
      btns[id] = b;
    });
    function paint() {
      o.cards.forEach(function (c) {
        var id = kid(c), b = btns[id], where = placed[id], par = where ? binEls[where].list : pool;
        if (b.parentNode !== par) par.appendChild(b);
        b.setAttribute("aria-pressed", armed === id ? "true" : "false");
        var g = checked && where ? (where === c.bin ? "ok" : "no") : "";
        b.className = "lx-cs-card" + (g ? " " + g : "");
        var ic = b.querySelector(".lx-ic"); if (ic) ic.remove();
        if (g) b.insertAdjacentHTML("afterbegin", LX.icon(g === "ok" ? "check" : "cross"));
        b.setAttribute("aria-label", plain(c.text) + (where ? ", in " + binEls[where].label : ", not placed") + (g === "ok" ? ", right" : g === "no" ? ", not right" : "") + (armed === id ? ", chosen: now tap a box" : ""));
      });
      Object.keys(binEls).forEach(function (k) { binEls[k].el.classList.toggle("armed", !!armed); });
    }
    chk.addEventListener("click", function () {
      checked = true; paint();
      var g = grade(o.cards, placed);
      score.textContent = g.right + " of " + g.total + " right" + (g.placed < g.total ? " (" + (g.total - g.placed) + " not placed yet)" : "");
      feedback.innerHTML = "";
      var wrong = o.cards.filter(function (c) { var id = kid(c); return placed[id] && placed[id] !== c.bin; });
      if (wrong.length) {
        var ul = H("ul", { class: "lx-cs-why" }, feedback);
        wrong.slice(0, o.maxWhy || 3).forEach(function (c) { H("li", { html: "<b>" + LX.rich(c.text) + "</b>: " + LX.rich(c.why) }, ul); });
      }
      if (o.onCheck) o.onCheck(g);
    });
    paint();
    return { el: w, placed: function () { return placed; }, place: function (m) { placed = m; checked = false; paint(); }, check: function () { chk.click(); } };
  }

  // ---- "toggles": several bins per item, scored against a reference with "partly" cells
  function togglesMode(host, o) {
    var items = o.items, bins = o.bins, binKeys = bins.map(kid), marks = o.marks || {}, res = null;
    var box = H("div", { class: "lx-cs-grid" + (o.cls ? " " + o.cls : ""), style: "--n:" + bins.length }, host), rows = {};
    var head = H("div", { class: "lx-cs-row head", "aria-hidden": "true" }, box); H("span", null, head);
    bins.forEach(function (j) { H("span", { class: "jh", html: (j.icon ? LX.icon(j.icon) : "") + LX.esc(plain(j.short || j.label)) }, head); });
    items.forEach(function (t) {
      var k = kid(t), r = H("div", { class: "lx-cs-row", role: "group", "aria-label": plain(t.label), style: "--c:" + (t.color || "var(--lx-ink-3)") }, box);
      var nm = H("div", { class: "nm" }, r), nl = H("span", { class: "nl" }, nm); H("i", null, nl); H("span", marked(t.label) ? { html: LX.rich(t.label) } : { text: t.label }, nl);
      var wb = H("button", { type: "button", class: "lx-link lx-cs-whyb", "aria-expanded": "false", text: "Why" }, nm);
      var cells = {};
      bins.forEach(function (j) {
        var jk = kid(j), on = !!(marks[k] && marks[k][jk]);
        var b = H("button", { type: "button", class: "tg", "aria-pressed": on ? "true" : "false", "aria-label": plain(t.label) + ": " + plain(j.label) }, r);
        b.innerHTML = LX.icon("check");
        b.addEventListener("click", function () {
          marks[k] = marks[k] || {}; marks[k][jk] = !marks[k][jk];
          b.setAttribute("aria-pressed", marks[k][jk] ? "true" : "false"); if (o.onChange) o.onChange(marks);
          if (res) paint();
        });
        cells[jk] = b;
      });
      var why = H("div", { class: "lx-cs-rwhy", hidden: true }, r), ul = H("ul", null, why);
      bins.forEach(function (j) { var jk = kid(j); H("li", { html: "<b>" + LX.rich(j.label) + ": " + LX.esc(t.ref[jk]) + ".</b> " + LX.rich((t.why || {})[jk] || "") }, ul); });
      wb.addEventListener("click", function () { why.hidden = !why.hidden; wb.setAttribute("aria-expanded", why.hidden ? "false" : "true"); LX.emit("layout"); });
      rows[k] = { cells: cells, why: why };
    });
    var foot = H("div", { class: "lx-step-foot" }, box);
    var chk = H("button", { class: "lx-btn small", type: "button", text: o.checkLabel || "Check" }, foot);
    var key = H("p", { class: "lx-hint lx-cs-key" }, foot);
    key.innerHTML = o.legend || '<span class="k agree"></span>agrees · <span class="k differ"></span>differs · <span class="k partly"></span>“partly”: either is fair';
    function paint() {
      res = score(marks, items, binKeys);
      items.forEach(function (t) {
        var k = kid(t);
        binKeys.forEach(function (jk) { var c = rows[k].cells[jk]; c.classList.remove("agree", "differ", "partly"); c.classList.add(res.cells[k][jk]); });
      });
      box.classList.add("is-checked");
      return res;
    }
    chk.addEventListener("click", function () { var r = paint(); if (o.onCheck) o.onCheck(r); });
    if (o.checked) paint();
    return { el: box, check: function () { return paint(); } };
  }

  LX.CardSort = function (host, o) { return o.mode === "toggles" ? togglesMode(host, o) : cardsMode(host, o); };
  LX.CardSort.grade = grade;
  LX.CardSort.score = score;
  LX.CardSort.reference = reference;
})();
