/* exemplars.js — LX.Exemplars: a good and a weak answer to the same task, side by side, with tap-to-reveal notes that
   say what makes the difference (research studios, curriculum v2 §11.1; W2).
   var ex = LX.Exemplars(host, {
     title: "Two answers to the same brief",     the card's heading (an h3 in .lx-x-head; optional)
     lede: "One sentence.",                       optional
     task: "The task both answer, in one line.",  optional, above the answers
     answers: [
       { key: "weak", label: "Weak answer", level: "Developing",
         parts: ["Text ", { n: 1, text: "a marked phrase", note: "Why it falls short." }, " more text."] },
       { key: "good", label: "Strong answer", level: "Proficient", parts: [ ... ] } ],
                     key "weak" or "good" (other keys are neutral); level: the rubric level the answer reaches; parts:
                     plain text and marked phrases; a note is one or two sentences ([[glossary|marks]] and **bold** work);
                     n numbers the notes within an answer (default: reading order); lead: the word before each note
                     (default "Falls short" for weak, "Works" for good)
     diff: [{ label: "Framing", weak: "No audience", good: "A co-op board" }],   optional table "What made the difference"
     diffTitle: "What made the difference",
     lines: true,                keep the answers' line breaks (an answer written as a card, one field per line); the
                                 no-JS version from staticHTML keeps them too
     id: "r1-ex",                which notes the reader opened, kept in this browser (optional)
     onOpen: function (key, n) {},   a note opened by the reader
     note: "Both answers are illustrative." });   a hint under the card
   Returns { el, open(key, n), openAll(), opened() } (opened: { weak: [1, 2], good: [] }).
   Reading: each marked phrase is a button (role="button", Tab, Enter, Space) with a number badge; it opens or shuts its
   note under the answer (aria-expanded, aria-controls) and the note is read out (aria-live). "Show all notes" opens every
   note. Two columns from 700 px, one below; the answers keep their order (put the weak one first). Text with notes in
   place, so no separate text version.
   Node: module.exports = { marks, plain, validate, staticHTML } (pure): marks(answer) the numbered marks [{n, text, note}];
   plain(answer) the text with [n] after each marked phrase; validate(o) a list of problems (empty when fine);
   staticHTML(o) the no-JS version for the page's fallback (each answer, its level, its text with [n], its notes; with
   o.lines the text's <p> has class lx-ex-lines, which keeps line breaks). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // [[id|words]] glossary marks and **bold**, as core.js LX.rich does it (here without the DOM, for Node and fallbacks)
  function rich(t) {
    return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, '<span class="lx-term" data-term="$1">$2</span>').replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  function words(t) { return String(t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1"); }
  var LEAD = { weak: "Falls short", good: "Works" };
  function marks(a) {
    var k = 0;
    return (a.parts || []).filter(function (p) { return p && typeof p === "object"; }).map(function (p) {
      k = p.n != null ? p.n : k + 1;
      return { n: k, text: p.text, note: p.note };
    });
  }
  function plain(a) {
    var k = 0;
    return (a.parts || []).map(function (p) {
      if (!p || typeof p !== "object") return words(p == null ? "" : p);
      k = p.n != null ? p.n : k + 1;
      return words(p.text) + " [" + k + "]";
    }).join("");
  }
  function validate(o) {
    var out = [], keys = {};
    if (!o || !Array.isArray(o.answers) || o.answers.length < 2) return ["needs at least two answers"];
    o.answers.forEach(function (a, i) {
      var name = a.key || "answer " + (i + 1);
      if (!a.key) out.push(name + ": no key");
      if (keys[a.key]) out.push(name + ": key repeated");
      keys[a.key] = true;
      if (!a.label) out.push(name + ": no label");
      var m = marks(a), seen = {};
      if (!m.length) out.push(name + ": no marked phrase");
      m.forEach(function (x) {
        if (seen[x.n]) out.push(name + ": note " + x.n + " repeated");
        seen[x.n] = true;
        if (!x.text || !String(x.text).trim()) out.push(name + ": mark " + x.n + " has no text");
        if (!x.note || !String(x.note).trim()) out.push(name + ": mark " + x.n + " has no note");
      });
    });
    return out;
  }
  function lead(a) { return a.lead != null ? a.lead : LEAD[a.key] || ""; }
  function staticHTML(o) {
    var h = ['<div class="lx-ex-cols">'];
    o.answers.forEach(function (a) {
      h.push('<div class="lx-ex-ans ' + esc(a.key || "") + '"><p class="lx-eyebrow">' + esc(a.label) + (a.level ? " · " + esc(a.level) : "") + "</p>"
        + (o.lines ? '<p class="lx-ex-lines">' : "<p>") + esc(plain(a)) + "</p>"
        + '<ol class="lx-ex-static">' + marks(a).map(function (x) {
          return '<li value="' + x.n + '">' + (lead(a) ? "<b>" + esc(lead(a)) + ":</b> " : "") + rich(x.note) + "</li>";
        }).join("") + "</ol></div>");
    });
    h.push("</div>");
    if (o.diff && o.diff.length) {
      var A = o.answers;
      h.push('<table class="lx-facts lx-ex-diff"><thead><tr><th scope="col"></th>' + A.map(function (a) { return '<th scope="col">' + esc(a.label) + "</th>"; }).join("")
        + "</tr></thead><tbody>" + o.diff.map(function (d) {
          return '<tr><th scope="row">' + esc(d.label) + "</th>" + A.map(function (a) { return "<td>" + rich(d[a.key] || "") + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table>");
    }
    return h.join("\n");
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { marks: marks, plain: plain, validate: validate, staticHTML: staticHTML };
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.Exemplars = function (host, o) {
    var bad = validate(o);
    if (bad.length) throw new Error("LX.Exemplars: " + bad.join("; "));
    var box = H("div", { class: "lx-ex" }, host), saved = (o.id && LX.store.get(o.id)) || {}, opened = {}, notes = [], total = 0;
    if (o.title) { var hd = H("header", { class: "lx-x-head" }, box); H("h3", { text: o.title }, hd); }
    if (o.lede) H("p", { class: "lx-ex-lede", html: rich(o.lede) }, box);
    if (o.task) { var tk = H("div", { class: "lx-ex-task" }, box); H("p", { class: "lx-eyebrow", text: "The task" }, tk); H("p", { html: rich(o.task) }, tk); }
    var cols = H("div", { class: "lx-ex-cols" }, box);
    var live = H("p", { class: "lx-sr", "aria-live": "polite" }, box);
    o.answers.forEach(function (a) {
      opened[a.key] = [];
      var col = H("section", { class: "lx-ex-ans " + a.key, "aria-label": a.label + (a.level ? ", " + a.level : "") }, cols);
      var head = H("div", { class: "lx-ex-head" }, col);
      H("h4", { text: a.label }, head);
      if (a.level) H("span", { class: "lx-ex-level", text: a.level }, head);
      var text = H("p", { class: "lx-ex-text" + (o.lines ? " lx-ex-lines" : "") }, col), list = H("ol", { class: "lx-ex-notes" }, col), k = 0;
      (a.parts || []).forEach(function (p) {
        if (!p || typeof p !== "object") { text.appendChild(document.createTextNode(words(p == null ? "" : p))); return; }
        k = p.n != null ? p.n : k + 1;
        var n = k, id = LX.uid("exn");
        var m = H("span", { class: "lx-ex-mark", role: "button", tabindex: "0", "aria-expanded": "false", "aria-controls": id,
          "aria-label": words(p.text) + ", note " + n }, text);
        m.appendChild(document.createTextNode(words(p.text)));
        H("span", { class: "lx-ex-n", "aria-hidden": "true", text: String(n) }, m);
        var li = H("li", { id: id, class: "lx-ex-note", value: n, hidden: true }, list);
        H("span", { class: "lx-ex-n", "aria-hidden": "true", text: String(n) }, li);
        H("span", { html: (lead(a) ? "<b>" + LX.esc(lead(a)) + ":</b> " : "") + rich(p.note) }, li);
        var rec = { key: a.key, n: n, mark: m, li: li, note: p.note };
        notes.push(rec); total++;
        function toggle() { show(rec, li.hidden, true); }
        m.addEventListener("click", toggle);
        m.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); } });
      });
    });
    var foot = H("div", { class: "lx-ex-foot" }, box);
    var all = H("button", { class: "lx-btn ghost small", type: "button", text: "Show all notes" }, foot);
    var count = H("span", { class: "lx-ex-count", "aria-live": "polite" }, foot);
    function nOpen() { return notes.filter(function (r) { return !r.li.hidden; }).length; }
    function paint() {
      count.textContent = nOpen() + " of " + total + " notes open";
      all.textContent = nOpen() === total ? "Hide the notes" : "Show all notes";
    }
    function save() {
      if (!o.id) return;
      var s = {}; notes.forEach(function (r) { if (!r.li.hidden) (s[r.key] = s[r.key] || []).push(r.n); });
      LX.store.set(o.id, s);
    }
    function show(rec, on, byReader) {
      rec.li.hidden = !on;
      rec.mark.classList.toggle("on", on);
      rec.mark.setAttribute("aria-expanded", on ? "true" : "false");
      var lst = opened[rec.key], at = lst.indexOf(rec.n);
      if (on && at < 0) lst.push(rec.n); else if (!on && at >= 0) lst.splice(at, 1);
      if (byReader) {
        var a = o.answers.filter(function (x) { return x.key === rec.key; })[0];
        live.textContent = on ? a.label + ", note " + rec.n + ": " + (lead(a) ? lead(a) + ": " : "") + words(rec.note) : "";
        if (on && o.onOpen) o.onOpen(rec.key, rec.n);
        save();
      }
      paint();
      if (LX.emit) LX.emit("layout");
    }
    all.addEventListener("click", function () {
      var on = nOpen() < total;
      notes.forEach(function (r) { show(r, on, false); });
      live.textContent = on ? "All " + total + " notes are open." : "The notes are shut.";
      save();
    });
    notes.forEach(function (r) { if ((saved[r.key] || []).indexOf(r.n) >= 0) show(r, true, false); });
    if (o.diff && o.diff.length) {
      var dw = H("div", { class: "lx-ex-diffbox" }, box);
      H("p", { class: "lx-eyebrow", text: o.diffTitle || "What made the difference" }, dw);
      var sc = H("div", { class: "lx-scroll-x" }, dw), t = H("table", { class: "lx-ex-diff" }, sc), hr = H("tr", null, H("thead", null, t));
      H("th", { scope: "col", text: "" }, hr);
      o.answers.forEach(function (a) { H("th", { scope: "col", text: a.label }, hr); });
      var tb = H("tbody", null, t);
      o.diff.forEach(function (d) {
        var tr = H("tr", null, tb); H("th", { scope: "row", text: d.label }, tr);
        o.answers.forEach(function (a) { H("td", { "data-label": a.label, html: rich(d[a.key] || "") }, tr); });
      });
    }
    if (o.note) H("p", { class: "lx-hint", html: rich(o.note) }, box);
    paint();
    function find(key, n) { return notes.filter(function (r) { return r.key === key && r.n === n; })[0]; }
    return {
      el: box,
      open: function (key, n) { var r = find(key, n); if (r) show(r, true, true); },
      openAll: function () { notes.forEach(function (r) { show(r, true, false); }); save(); },
      opened: function () { var c = {}; Object.keys(opened).forEach(function (k) { c[k] = opened[k].slice().sort(function (x, y) { return x - y; }); }); return c; }
    };
  };
})();
