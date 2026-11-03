/* steelman.js — LX.Steelman: the Steelman card, the strongest case on each side of a contested point (lessons 6, 7, 8, 12).
   var sm = LX.Steelman(host, {
     title: "Is LCOE a fair yardstick? The strongest case on each side",
     heading: "h3",            "h3" (default): the title in an explain-card header (.lx-x-head); "h4": a title inside a step card
     eyebrow: "Steelman card", a small line above the title (optional; may stand alone, without a title)
     frame: false,             true: the card sits in its own framed box, sides on white with a coloured top edge (step cards)
     reveal: false,            false: every side open | "button": each side opens with a button named by its title |
                               "details": each side is a <details> whose summary is its title
     sides: [{ key: "for", title: "For: a common, checkable yardstick", points: ["One sentence.", ...] },
             { key: "against", title: "Against: ...", points: [...] },
             { key: "both", title: "What both leave open", text: ["One sentence."], wide: true }],
                               points: a bulleted list; text: paragraphs; wide: spans both columns.
                               Text may carry [[glossary|marks]] and **bold**.
     opened: { for: true },    sides open from the start (the reader's earlier visit); the map is not changed
     onOpen: function (key) {},   the reader opened a side (button or details; not called for sides open from the start)
     note: "One sentence." }); a hint under the card
   Returns { el, open(key) } (open: as if the reader had opened that side).
   Keyboard: buttons and summaries are native controls (Tab, Enter, Space; the shared focus ring); a revealed list is
   announced through aria-expanded. Two columns; one on phones (≤ 640 px with a frame, ≤ 560 px otherwise).
   No diagram, so no text version: the card is text. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  function rich(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  LX.Steelman = function (host, o) {
    var reveal = o.reveal || false, opened = o.opened || {}, api = {};
    var box = H("div", { class: "lx-steel" + (o.frame ? " framed" : "") + (reveal === "details" ? " details" : "") }, host);
    if (o.title && (o.heading || "h3") === "h3") { var hd = H("header", { class: "lx-x-head" }, box); H("h3", { text: o.title }, hd); }
    if (o.eyebrow) H("p", { class: "lx-eyebrow", text: o.eyebrow }, box);
    if (o.title && o.heading === "h4") H("h4", { class: "lx-steel-title", text: o.title }, box);
    var cols = H("div", { class: "lx-steel-cols" }, box);
    function body(s, into) {
      if (s.text) s.text.forEach(function (t) { H("p", { html: rich(t) }, into); });
      if (s.points) { var ul = H("ul", null, into); s.points.forEach(function (p) { H("li", { html: rich(p) }, ul); }); }
    }
    o.sides.forEach(function (s) {
      var cls = "lx-steel-side " + (s.key || "") + (s.wide ? " wide" : ""), open = !!opened[s.key];
      if (reveal === "details") {
        var d = H("details", { class: cls, open: open || null }, cols), primed = open;
        H("summary", { text: s.title }, d); body(s, d);
        d.addEventListener("toggle", function () {
          if (primed) { primed = false; return; }   // the toggle event of a side that was open from the start
          if (d.open && o.onOpen) o.onOpen(s.key);
          LX.emit("layout");
        });
        api[s.key] = function () { if (!d.open) { primed = false; d.open = true; } };
      } else if (reveal === "button") {
        var c = H("div", { class: cls }, cols);
        var b = H("button", { class: "lx-btn ghost small", type: "button", "aria-expanded": open ? "true" : "false", text: s.title }, c);
        var inner = H("div", { class: "lx-steel-body", hidden: !open }, c);
        body(s, inner);
        var go = function () { inner.hidden = false; b.setAttribute("aria-expanded", "true"); if (o.onOpen) o.onOpen(s.key); LX.emit("layout"); };
        b.addEventListener("click", go);
        api[s.key] = go;
      } else {
        var e = H("div", { class: cls }, cols); H("h4", { text: s.title }, e); body(s, e);
      }
    });
    if (o.note) H("p", { class: "lx-hint", html: rich(o.note) }, o.frame ? box : host);
    return { el: box, open: function (k) { if (api[k]) api[k](); } };
  };
})();
