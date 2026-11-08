/* tagger.js — LX.PhraseTagger: the "dissector". The reader tags the highlighted phrases of a short text with the question
   each one raises, names the question the text leaves unanswered, and compares with a researcher's tags and notes
   (first used by N1, the news lens).
   LX.PhraseTagger(host, { key: "n1-tags-a",
     tags: [{ id: "scale", n: 1, label: "Scale", sub: "units, size", color: "var(--lx-tier-1)" }, ...],   the question set
     kicker: "Story 1 of 3 · Data centers", title: "A paraphrased headline", framing: "One line on where it comes from.",
     parts: ["Plain text ", { p: "a1", text: "a phrase", tag: "scale", also: ["time"], note: "One or two sentences." }, " more text."],
     sources: [{ label: "LBNL report", url: "https://...", as_of: "Dec 2024" }],
     missing: { answer: "pays", also: [], note: "One or two sentences." },        optional
     onCompare: function (score) {} });
   Options:
     key          LX.store key of the reader's picks ({phraseId: tagId, _missing: tagId}); they survive a reload
     tags         id, n (the number badge, so colour is never the only cue), label, sub (small words on the chips), color (token)
     parts        strings and phrase objects in reading order; a phrase is an inline span with button semantics, so a long
                  phrase wraps with its sentence. tag is the researcher's main tag; also lists other fair tags.
     missing      the unanswered question: a second row of chips (missingQ, default "Which question does the story leave
                  unanswered?") and a "Left unanswered" line in the comparison
     ask          function (phraseText) -> the palette's question (default "Which question does “…” raise?")
     compareLabel the button (default "Compare with a researcher");  who  the other side of the comparison (default "Researcher")
     onCompare    called with score(...) when the reader compares, and again after every change once compared
   Each phrase's verdict: "same" (the main tag), "fair" (in also), "other", "none" (untagged). Picking a chip tags the
   selected phrase and moves on to the next untagged one.
   Returns { el, picks(), select(phraseId), tag(phraseId, tagId), miss(tagId), compare() }.
   Keyboard: phrases are focusable (Tab), Enter or Space selects; chips are buttons with aria-pressed; counts are announced.
   Text version: the text itself; the comparison is a list. Pure (Node: module.exports): phrases, judge, score, badge.
   LX.PhraseTagger.badge(tag) gives the number badge as HTML for other parts of a lesson (N1's lens cards). */
(function () {
  "use strict";
  function phrases(text) { return text.parts.filter(function (x) { return typeof x === "object"; }); }
  // a reader's tag for one phrase against the researcher's: "same" (the main tag), "fair" (also valid), "other" or "none"
  function judge(ph, tag) {
    if (!tag) return "none";
    if (tag === ph.tag) return "same";
    return (ph.also || []).indexOf(tag) >= 0 ? "fair" : "other";
  }
  function score(text, picks) {
    var out = { same: 0, fair: 0, other: 0, none: 0, total: 0 };
    phrases(text).forEach(function (ph) { out[judge(ph, picks[ph.p])]++; out.total++; });
    var m = text.missing, mp = picks._missing;
    if (m) out.missing = !mp ? "none" : mp === m.answer ? "same" : (m.also || []).indexOf(mp) >= 0 ? "fair" : "other";
    return out;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function badge(l, withLabel, withSub) {
    return '<span class="lx-tag-n" style="--c:' + l.color + '" aria-hidden="true">' + l.n + "</span>" +
      (withLabel ? esc(l.label) + (withSub && l.sub ? " <small>" + esc(l.sub) + "</small>" : "") : "");
  }
  var pure = { phrases: phrases, judge: judge, score: score, badge: badge };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  var LX = window.LX, H = LX.H;
  LX.PhraseTagger = function (host, o) {
    var L = {}; o.tags.forEach(function (l) { L[l.id] = l; });
    var picks = LX.store.get(o.key, {}) || {}, who = o.who || "Researcher";
    var wrap = H("div", { class: "lx-tagger" }, host);
    var art = H("article", { class: "lx-tagger-text" }, wrap);
    if (o.kicker) H("p", { class: "lx-tagger-kicker", text: o.kicker }, art);
    if (o.title) H("p", { class: "lx-tagger-head", text: o.title }, art);
    if (o.framing) H("p", { class: "lx-tagger-framing", text: o.framing }, art);
    var body = H("p", { class: "lx-tagger-body" }, art), btns = {}, sel = null;
    o.parts.forEach(function (part) {
      if (typeof part === "string") { body.appendChild(document.createTextNode(part)); return; }
      // an inline span with button semantics, so a long phrase wraps with the sentence (a <button> would not)
      var b = H("span", { class: "lx-ph", role: "button", tabindex: "0", "data-p": part.p, text: part.text }, body);
      btns[part.p] = { b: b, ph: part };
      b.addEventListener("click", function () { select(part.p); });
      b.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(part.p); } });
    });
    if (o.sources && o.sources.length) {
      var src = H("p", { class: "lx-tagger-src" }, art);
      src.appendChild(document.createTextNode("Source: "));
      o.sources.forEach(function (s, i) {
        if (i) src.appendChild(document.createTextNode("; "));
        H("a", { href: s.url, text: s.label }, src);
        src.appendChild(document.createTextNode(" (" + s.as_of + ")"));
      });
    }
    var pal = H("div", { class: "lx-tagger-pal", role: "group", "aria-label": "Tag the selected phrase" }, wrap);
    var pq = H("p", { class: "lx-tagger-q", "aria-live": "polite" }, pal);
    var chips = H("div", { class: "lx-tagger-chips" }, pal), chipBtns = {}, mBtns = {};
    o.tags.forEach(function (l) {
      var c = H("button", { class: "lx-tag-chip", type: "button", "aria-pressed": "false", html: badge(l, true, true) }, chips);
      c.addEventListener("click", function () { if (sel) { picks[sel] = l.id; save(); var nx = nextUntagged(sel); select(nx || sel); } });
      chipBtns[l.id] = c;
    });
    if (o.missing) {
      var miss = H("div", { class: "lx-tagger-pal", role: "group", "aria-label": "The question the story leaves unanswered" }, wrap);
      H("p", { class: "lx-tagger-q", text: o.missingQ || "Which question does the story leave unanswered?" }, miss);
      var mchips = H("div", { class: "lx-tagger-chips" }, miss);
      o.tags.forEach(function (l) {
        var c = H("button", { class: "lx-tag-chip", type: "button", "aria-pressed": "false", html: badge(l, true, false) }, mchips);
        c.addEventListener("click", function () { setMissing(l.id); });
        mBtns[l.id] = c;
      });
    }
    var row = H("div", { class: "lx-tagger-row" }, wrap);
    var cmpBtn = H("button", { class: "lx-btn small", type: "button", html: LX.icon("check") + LX.esc(o.compareLabel || "Compare with a researcher") }, row);
    var count = H("span", { class: "lx-tagger-count", "aria-live": "polite" }, row);
    var cmpBox = H("div", null, wrap), compared = false;
    cmpBtn.addEventListener("click", function () { compared = true; compare(); });

    function nextUntagged(from) {
      var ids = Object.keys(btns), i = ids.indexOf(from);
      for (var k = 1; k <= ids.length; k++) { var id = ids[(i + k) % ids.length]; if (!picks[id]) return id; }
      return null;
    }
    function select(p) {
      if (!btns[p]) return;
      sel = p;
      Object.keys(btns).forEach(function (k) { btns[k].b.classList.toggle("sel", k === p); });
      pq.innerHTML = o.ask ? LX.esc(o.ask(btns[p].ph.text)) : "Which question does “" + LX.esc(btns[p].ph.text) + "” raise?";
      paint();
    }
    function setMissing(id) { picks._missing = id; save(); }
    function save() { LX.store.set(o.key, picks); paint(); if (compared) compare(); }
    function paint() {
      var n = 0;
      Object.keys(btns).forEach(function (k) {
        var x = btns[k], t = picks[k], l = t && L[t];
        x.b.classList.toggle("tagged", !!l);
        x.b.style.setProperty("--c", l ? l.color : "var(--lx-ink-3)");
        var old = x.b.querySelector(".lx-tag-n"); if (old) old.remove();
        if (l) { H("span", { class: "lx-tag-n", style: "--c:" + l.color, "aria-hidden": "true", text: l.n }, x.b); n++; }
        x.b.setAttribute("aria-label", x.ph.text + (l ? ", tagged " + l.label : ", not tagged yet"));
        x.b.setAttribute("aria-pressed", k === sel ? "true" : "false");
      });
      o.tags.forEach(function (l) {
        chipBtns[l.id].setAttribute("aria-pressed", sel && picks[sel] === l.id ? "true" : "false");
        if (mBtns[l.id]) mBtns[l.id].setAttribute("aria-pressed", picks._missing === l.id ? "true" : "false");
      });
      var total = Object.keys(btns).length;
      count.textContent = n + " of " + total + " phrases tagged" + (picks._missing ? "; unanswered question chosen." : ".");
    }
    function line(ul, cls, title, tags, why) {
      var li = H("li", { class: cls }, ul);
      H("span", { html: LX.icon(cls === "same" || cls === "fair" ? "check" : "question") }, li);
      var d = H("div", null, li);
      H("b", { text: title }, d); H("span", { class: "tags", text: tags }, d); H("span", { class: "why", html: LX.rich(why) }, d);
    }
    function compare() {
      var sc = score(o, picks);
      cmpBox.innerHTML = "";
      var ul = H("ul", { class: "lx-tagger-cmp" }, cmpBox);
      phrases(o).forEach(function (ph) {
        var r = L[ph.tag], you = picks[ph.p] && L[picks[ph.p]];
        line(ul, judge(ph, picks[ph.p]), "“" + ph.text + "”",
          who + ": " + r.n + " " + r.label + (ph.also && ph.also.length ? " (also fair: " + ph.also.map(function (a) { return L[a].label; }).join(", ") + ")" : "") +
          " · You: " + (you ? you.n + " " + you.label : "not tagged"), ph.note);
      });
      if (o.missing) {
        var m = o.missing, mr = L[m.answer];
        line(ul, sc.missing, "Left unanswered", who + ": " + mr.n + " " + mr.label + " · You: " + (picks._missing ? L[picks._missing].n + " " + L[picks._missing].label : "no choice yet"), m.note);
      }
      if (o.onCompare) o.onCompare(sc);
      return sc;
    }
    select(Object.keys(btns)[0]);
    return {
      el: wrap, compare: compare, select: select,
      picks: function () { return JSON.parse(JSON.stringify(picks)); },
      tag: function (p, id) { if (btns[p] && L[id]) { picks[p] = id; save(); } },
      miss: function (id) { if (L[id]) setMissing(id); }
    };
  };
  Object.keys(pure).forEach(function (k) { LX.PhraseTagger[k] = pure[k]; });
})();
