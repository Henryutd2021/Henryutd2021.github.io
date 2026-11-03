/* checklist.js — LX.Checklist: a list of tick boxes the reader keeps for their own work (native checkboxes; the ticks
   stay in this browser). Promoted in W1 (2026-11-02) from N1 and B2 (bordered rows, count and "Clear" under the list) and
   from B3 and K7 (soft rows, label and text on one line, count in the header).
   LX.Checklist(host, { id: "b2-checklist", title: "A data check you can reuse", lede: "One sentence.",
     items: [{ id: "rows", label: "Rows and span", text: "One sentence.", note: "len(df)" }, ...],
     doneText: "Write what you found in a data note." });
   Options:
     id        LX.store key. The ticks are stored as {itemId: true | false}; an item without an id is stored under its
               index (0, 1, ...), as B3 ("b3-check") and K7 ("k7-check") always did.
     title     the h3 of an lx-x-head header;  lede  an lx-lede paragraph (glossary marks allowed)
     items     label (bold), text (one sentence), note (a small third line). All three take glossary marks.
     count     "foot" (default): "N of M checked." under the list, with a "Clear the ticks" button;
               "head": "N of M ticked" in the header (lx-step-n), no clear button (clear: true adds one under the list)
     word      the verb of the count (default "checked" in the foot, "ticked" in the header)
     doneText  added to the count when every box is ticked ("9 of 9 checked. Write what you found in a data note.")
     inline    the label and its text on one line (bold label, then sep, then the text); default: stacked lines
     sep       what joins an inline label to its text (default " "; K7 uses ". ")
     soft      soft rows without a border and accent-coloured ticks (the B3 and K7 look); default: bordered rows with
               green ticks and a green edge when ticked
     columns   2: two columns on wide screens (≥ 861 px)
     code      notes in the monospace font (B2's pandas lines)
     ordered   an <ol> (default <ul>); the numbers are not shown
     onChange  function (state, n) after every tick
   Returns { el (the list), state() -> {id: bool}, count() -> number ticked, set(id, on), clear() }.
   Keyboard: native checkboxes (Tab, Space); the whole label toggles its box; the count is announced (aria-live).
   Text version: the list is its own text. Pure (Node): LX.Checklist.countText(n, total, o). */
(function () {
  "use strict";
  // ---- pure: the count line
  function countText(n, total, o) {
    o = o || {};
    var head = o.count === "head", word = o.word || (head ? "ticked" : "checked");
    if (head) return n + " of " + total + " " + word + (o.doneText && n === total ? ". " + o.doneText : "");
    return n + " of " + total + " " + word + (o.doneText && n === total ? ". " + o.doneText : ".");
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { countText: countText };
  if (typeof window === "undefined" || !window.LX) return;

  var LX = window.LX, H = LX.H;
  LX.Checklist = function (host, o) {
    var head = o.count === "head";
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    var cnt = head ? H("span", { class: "lx-step-n", "aria-live": "polite" }, hd) : null;
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var cls = "lx-checklist" + (o.soft ? " lx-ck-soft" : "") + (o.inline ? " lx-ck-inline" : "") + (o.columns === 2 ? " lx-ck-2col" : "") + (o.code ? " lx-ck-code" : "");
    var ul = H(o.ordered ? "ol" : "ul", { class: cls }, host), state = LX.store.get(o.id, {}) || {}, boxes = [];
    o.items.forEach(function (it, i) {
      var key = it.id != null ? it.id : i, li = H("li", null, ul), id = LX.uid("ck");
      var cb = H("input", { type: "checkbox", id: id }, li);
      var lab = H("label", { for: id }, li);
      H("b", { html: LX.rich(it.label) }, lab);
      if (o.inline) { if (it.text) lab.insertAdjacentHTML("beforeend", LX.rich((o.sep == null ? " " : o.sep) + it.text)); }
      else if (it.text) H("span", { html: LX.rich(it.text) }, lab);
      if (it.note) H("small", { html: LX.rich(it.note) }, lab);
      cb.checked = !!state[key];
      cb.addEventListener("change", function () { state[key] = cb.checked; LX.store.set(o.id, state); paint(); if (o.onChange) o.onChange(state, n()); });
      boxes.push({ cb: cb, li: li, key: key });
    });
    if (!head) {
      var foot = H("div", { class: "lx-checklist-foot" }, host);
      cnt = H("span", { "aria-live": "polite" }, foot);
    }
    if (!head || o.clear) {
      var reset = H("button", { class: "lx-link", type: "button", text: "Clear the ticks" }, foot || H("div", { class: "lx-checklist-foot" }, host));
      reset.addEventListener("click", clear);
    }
    function n() { return boxes.filter(function (b) { return b.cb.checked; }).length; }
    function paint() {
      boxes.forEach(function (b) { b.li.classList.toggle("on", b.cb.checked); });
      cnt.textContent = countText(n(), boxes.length, o);
    }
    function clear() { state = {}; LX.store.set(o.id, state); boxes.forEach(function (b) { b.cb.checked = false; }); paint(); if (o.onChange) o.onChange(state, 0); }
    paint();
    return {
      el: ul, count: n, clear: clear,
      state: function () { var s = {}; boxes.forEach(function (b) { s[b.key] = b.cb.checked; }); return s; },
      set: function (key, on) { boxes.forEach(function (b) { if (String(b.key) === String(key)) { b.cb.checked = on !== false; state[b.key] = b.cb.checked; } }); LX.store.set(o.id, state); paint(); }
    };
  };
  LX.Checklist.countText = countText;
})();
