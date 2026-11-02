// n01-news-lens.js — Lesson N1, "How do you read an energy headline like a researcher?" (lens type, step cards; 2026-11-02).
//
// Data: assets/learn/data/n01-news-lens.json — the seven lens questions, three worked stories (paraphrased headlines,
// tagged phrases, a researcher's annotation, a back-of-envelope check, a model take, primary sources with dates), the
// units-or-scale spotter and the evidence ladder. Every real number on the page lives in that file with its source.
//
// What the reader does (step cards): open the seven questions; for each story tag its highlighted phrases with the
// question they raise (the "dissector"), name the question the story leaves unanswered, and compare with a researcher's
// notes; run one check with units per story (the "envelope": energy to power, power to energy, the evidence clock);
// judge six sentences for units or scale errors; write a three-sentence take. The explain layer is a reusable checklist
// and the evidence ladder (announced ... at design output), with the stories' claims placed on it.
//
// Lesson-local components (candidates for the shared library; see learn/_w1/n01-news-lens.yml): LX.Checklist (also in
// b02-python-data.js), the phrase tagger, the unit chain, the evidence ladder and the evidence clock. Their CSS is
// injected once by injectCSS() below, using only the --lx-* tokens, so day and night both work.
//
// The pure model is exported for Node (_tests/learn/test_n01-news-lens.js checks every number the page states).
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  var HOURS_PER_YEAR = 8760;
  function phrases(story) { return story.parts.filter(function (x) { return typeof x === "object"; }); }
  // a reader's tag for one phrase against the researcher's: "same" (the main tag), "fair" (also valid), "other" or "none"
  function judge(ph, tag) {
    if (!tag) return "none";
    if (tag === ph.tag) return "same";
    return (ph.also || []).indexOf(tag) >= 0 ? "fair" : "other";
  }
  function score(story, picks) {
    var out = { same: 0, fair: 0, other: 0, none: 0, total: 0 };
    phrases(story).forEach(function (ph) { out[judge(ph, picks[ph.p])]++; out.total++; });
    var m = story.missing, mp = picks._missing;
    out.missing = !mp ? "none" : mp === m.answer ? "same" : (m.also || []).indexOf(mp) >= 0 ? "fair" : "other";
    return out;
  }
  // energy over a year (TWh) -> average power (GW); a connection need at an assumed average use (%)
  function averageGW(twh, hours) { return twh * 1000 / (hours || HOURS_PER_YEAR); }
  function connectionGW(twh, utilPct, hours) { return averageGW(twh, hours) / (utilPct / 100); }
  // power (GW) x duration (h) -> energy (GWh); minutes of average national use that energy would cover
  function storedGWh(gw, h) { return gw * h; }
  function minutesOfUse(gwh, nationalTWh, hours) { return gwh / averageGW(nationalTWh, hours) * 60; }
  function days(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function ladderOK(item, choice) { return item.answer.indexOf(choice) >= 0; }
  // which phrases each lens question caught across the stories (for the explain checklist)
  function caught(data) {
    var by = {};
    data.lens.forEach(function (l) { by[l.id] = []; });
    data.stories.forEach(function (s) { phrases(s).forEach(function (ph) { by[ph.tag].push(ph.text); }); by[s.missing.answer].push("left unanswered in story " + (data.stories.indexOf(s) + 1)); });
    return by;
  }
  var model = { HOURS_PER_YEAR: HOURS_PER_YEAR, phrases: phrases, judge: judge, score: score, averageGW: averageGW, connectionGW: connectionGW,
                storedGWh: storedGWh, minutesOfUse: minutesOfUse, days: days, ladderOK: ladderOK, caught: caught };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  var fmt1 = function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  var fmt0 = function (v) { return Math.round(v).toLocaleString("en-US"); };

  function injectCSS() {
    if (document.getElementById("n1-css")) return;
    var css = [
      // tag colours come from the lens data (--c); the number badge repeats the question, so colour is never the only cue
      ".n1-lens{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}",
      ".n1-q{display:grid;gap:4px;align-content:start;text-align:left;min-height:84px;padding:10px 12px;border-radius:12px;border:1px solid var(--lx-line-2);border-top:4px solid var(--c);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer;font:inherit}",
      ".n1-q b{font-family:var(--lx-f-display);font-weight:500;font-size:15px;display:flex;gap:6px;align-items:baseline}",
      ".n1-q small{font-size:12.5px;color:var(--lx-ink-3)}",
      ".n1-q .t{font-size:13.5px;color:var(--lx-ink-2);line-height:1.35}",
      ".n1-q[aria-expanded=true]{background:var(--lx-surface-2)}",
      ".n1-n{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--c);color:#fff;font-family:var(--lx-f-mono);font-size:12px;font-weight:600}",
      "body.quarto-dark .n1-n{color:var(--lx-bg)}",
      ".n1-story{border:1px solid var(--lx-line);border-radius:14px;padding:14px 16px;display:grid;gap:8px;background:var(--lx-surface-2)}",
      ".n1-kicker{font-family:var(--lx-f-display);font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--lx-ink-3)}",
      ".page-learn .n1-head{font-family:var(--lx-f-display);font-weight:600;font-size:20px;line-height:1.25;margin:0;color:var(--lx-ink)}",
      ".n1-framing,.n1-src{font-size:13px;color:var(--lx-ink-3)}",
      ".n1-body{font-size:16.5px;line-height:1.9;color:var(--lx-ink)}",
      ".n1-ph{color:var(--lx-ink);border-bottom:2px dashed var(--lx-ink-3);border-radius:4px 4px 0 0;padding:1px 3px;cursor:pointer;-webkit-box-decoration-break:clone;box-decoration-break:clone}",
      ".n1-ph:focus-visible{outline:3px solid var(--lx-accent);outline-offset:2px}",
      ".n1-ph.sel{outline:2px solid var(--lx-ink);outline-offset:1px}",
      ".n1-ph.tagged{background:color-mix(in srgb,var(--c) 18%,var(--lx-surface));border-bottom:2px solid var(--c)}",
      ".n1-ph .n1-n{margin-left:5px;vertical-align:1px;font-size:11px;height:17px;min-width:17px}",
      ".n1-pal{display:grid;gap:8px}",
      ".n1-pq{font-family:var(--lx-f-display);font-weight:500;font-size:15.5px}",
      ".n1-chips{display:flex;flex-wrap:wrap;gap:6px}",
      ".n1-chip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:4px 11px 4px 6px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer;font-family:var(--lx-f-display);font-size:14px;font-weight:500}",
      ".n1-chip[aria-pressed=true]{border-color:var(--lx-ink);box-shadow:inset 0 0 0 1px var(--lx-ink);background:var(--lx-surface-2)}",
      ".n1-chip small{font-family:var(--lx-f-body);font-weight:400;font-size:12px;color:var(--lx-ink-3)}",
      ".n1-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".n1-count{font-size:13.5px;color:var(--lx-ink-3)}",
      ".n1-cmp{display:grid;gap:8px;margin:0;padding:0;list-style:none}",
      ".n1-cmp li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;padding:9px 10px;border-radius:10px;border:1px solid var(--lx-line);background:var(--lx-surface)}",
      ".n1-cmp li .lx-ic{width:18px;height:18px;margin-top:2px}",
      ".n1-cmp li.same .lx-ic,.n1-cmp li.fair .lx-ic{color:var(--lx-good)} .n1-cmp li.other .lx-ic,.n1-cmp li.none .lx-ic{color:var(--lx-warn)}",
      ".n1-cmp b{font-family:var(--lx-f-display);font-weight:500}",
      ".n1-cmp .why{display:block;font-size:14px;color:var(--lx-ink-2);margin-top:2px}",
      ".n1-cmp .tags{display:block;font-size:13px;color:var(--lx-ink-3);margin-top:2px}",
      ".n1-chain{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;padding:0;list-style:none}",
      ".n1-chain li{display:grid;gap:1px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface)}",
      ".n1-chain li b{font-family:var(--lx-f-mono);font-size:15.5px;font-weight:600;color:var(--lx-ink)}",
      ".n1-chain li span{font-size:12px;color:var(--lx-ink-3)}",
      ".n1-chain li.op{border:0;background:none;padding:0 2px;font-family:var(--lx-f-mono);font-size:13px;color:var(--lx-ink-2)}",
      ".n1-chain li.out{border-color:var(--lx-ink);box-shadow:inset 0 0 0 1px var(--lx-ink)}",
      ".n1-clock svg{width:100%;height:auto;display:block}",
      ".n1-clock text{font-family:var(--lx-f-body);font-size:12.5px;fill:var(--lx-ink-2)}",
      ".n1-clock text.v{font-family:var(--lx-f-mono);font-weight:600;fill:var(--lx-ink)}",
      ".n1-spot{display:grid;gap:8px;margin:0;padding:0;list-style:none}",
      ".n1-spot li{display:grid;gap:8px;padding:10px 12px;border:1px solid var(--lx-line);border-radius:12px;background:var(--lx-surface)}",
      ".n1-spot .s{font-family:var(--lx-f-display);font-weight:500;font-size:15.5px}",
      ".n1-spot .lx-qbtns{grid-template-columns:repeat(2,minmax(0,1fr))}",
      ".n1-take{display:grid;gap:10px}",
      ".n1-take label{display:grid;gap:4px;font-family:var(--lx-f-display);font-weight:500;font-size:14.5px;color:var(--lx-ink)}",
      ".n1-take textarea{font:inherit;font-size:15px;min-height:52px;padding:8px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);resize:vertical;width:100%}",
      ".n1-model{padding:10px 12px;border-radius:10px;background:var(--lx-surface-2);font-size:15px;color:var(--lx-ink)}",
      // checklist (lesson-local LX.Checklist) and evidence ladder
      ".lx-checklist{display:grid;gap:6px;margin:0;padding:0;list-style:none}",
      ".lx-checklist li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:start;padding:8px 10px;border-radius:10px;border:1px solid var(--lx-line);background:var(--lx-surface)}",
      ".lx-checklist input{width:20px;height:20px;margin:3px 0 0;accent-color:var(--lx-good)}",
      ".lx-checklist label{display:grid;gap:2px;cursor:pointer;margin:0}",
      ".lx-checklist label b{font-family:var(--lx-f-display);font-weight:500;font-size:15px;color:var(--lx-ink)}",
      ".lx-checklist label span{font-size:14px;color:var(--lx-ink-2)}",
      ".lx-checklist label small{font-size:12.5px;color:var(--lx-ink-3);overflow-wrap:anywhere}",
      "@media (min-width:861px){.n1-wide .lx-checklist{grid-template-columns:repeat(2,minmax(0,1fr))}}",
      ".lx-checklist li.on{border-color:color-mix(in srgb,var(--lx-good) 45%,var(--lx-line))}",
      ".lx-checklist-foot{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:13.5px;color:var(--lx-ink-3)}",
      ".n1-ladder{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:20px;align-items:start;max-width:900px}",
      ".n1-rungs{display:grid;gap:4px;margin:0;padding:0 0 0 18px;list-style:none;border-left:3px solid var(--lx-line-2);position:relative}",
      ".n1-rungs li{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;align-items:center;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line);background:var(--lx-surface);position:relative}",
      ".n1-rungs li::before{content:'';position:absolute;left:-21px;top:50%;width:18px;border-top:3px solid var(--lx-line-2)}",
      ".n1-rungs li b{font-family:var(--lx-f-display);font-weight:500;font-size:14.5px}",
      ".n1-rungs li small{display:block;font-size:12.5px;color:var(--lx-ink-3)}",
      ".n1-rungs li .k{font-family:var(--lx-f-mono);font-size:12px;color:var(--lx-ink-3)}",
      ".n1-rungs li.hit{border-color:var(--lx-ink);box-shadow:inset 0 0 0 1px var(--lx-ink);background:var(--lx-surface-2)}",
      ".n1-proj{margin-top:8px;padding:7px 10px;border-radius:10px;border:1px dashed var(--lx-line-2);font-size:14px;color:var(--lx-ink-2)}",
      ".n1-proj.hit{border-style:solid;border-color:var(--lx-ink)}",
      ".n1-place{display:grid;gap:10px;margin:0;padding:0;list-style:none}",
      ".n1-place li{display:grid;gap:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--lx-line);background:var(--lx-surface)}",
      ".n1-place label{font-family:var(--lx-f-display);font-weight:500;font-size:15px;margin:0}",
      ".n1-place select{font:inherit;font-size:15px;min-height:42px;padding:6px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);max-width:100%}",
      "@media (max-width:760px){.n1-ladder{grid-template-columns:minmax(0,1fr)}}",
      "@media (max-width:560px){.page-learn .n1-head{font-size:18px}.n1-body{font-size:16px}.n1-lens{grid-template-columns:repeat(2,minmax(0,1fr))}.n1-q{min-height:0}}"
    ].join("\n");
    H("style", { id: "n1-css", text: css }, document.head);
  }

  // ---- lesson-local checklist (a candidate shared component; the same code is in b02-python-data.js)
  // LX.Checklist(host, {id, title, lede, items: [{id, label, text, note}]}) -> native checkboxes, kept in this browser.
  LX.Checklist = LX.Checklist || function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var ul = H("ul", { class: "lx-checklist" }, host), state = LX.store.get(o.id, {}) || {}, boxes = [];
    o.items.forEach(function (it) {
      var li = H("li", null, ul), id = LX.uid("ck");
      var cb = H("input", { type: "checkbox", id: id }, li);
      var lab = H("label", { for: id }, li);
      H("b", { html: LX.rich(it.label) }, lab);
      if (it.text) H("span", { html: LX.rich(it.text) }, lab);
      if (it.note) H("small", { html: LX.rich(it.note) }, lab);
      cb.checked = !!state[it.id];
      cb.addEventListener("change", function () { state[it.id] = cb.checked; LX.store.set(o.id, state); paint(); });
      boxes.push({ cb: cb, li: li });
    });
    var foot = H("div", { class: "lx-checklist-foot" }, host);
    var cnt = H("span", { "aria-live": "polite" }, foot);
    var reset = H("button", { class: "lx-link", type: "button", text: "Clear the ticks" }, foot);
    reset.addEventListener("click", function () { state = {}; LX.store.set(o.id, state); boxes.forEach(function (b) { b.cb.checked = false; }); paint(); });
    function paint() {
      var n = boxes.filter(function (b) { b.li.classList.toggle("on", b.cb.checked); return b.cb.checked; }).length;
      cnt.textContent = n + " of " + boxes.length + " checked" + (o.doneText && n === boxes.length ? ". " + o.doneText : ".");
    }
    paint();
  };

  function lensById(D) { var m = {}; D.lens.forEach(function (l) { m[l.id] = l; }); return m; }
  function chipHTML(l, withSub) {
    return '<span class="n1-n" style="--c:' + l.color + '" aria-hidden="true">' + l.n + "</span>" + LX.esc(l.label) + (withSub && l.sub ? " <small>" + LX.esc(l.sub) + "</small>" : "");
  }
  function sourceLine(host, story) {
    var p = H("p", { class: "n1-src" }, host);
    p.appendChild(document.createTextNode("Source: "));
    story.sources.forEach(function (s, i) {
      if (i) p.appendChild(document.createTextNode("; "));
      H("a", { href: s.url, text: s.label }, p);
      p.appendChild(document.createTextNode(" (" + s.as_of + ")"));
    });
    return p;
  }

  // ---- step 0: the seven questions
  function lensStep(D) {
    return function (act, api) {
      var grid = H("div", { class: "n1-lens" }, act), opened = {}, prog = H("p", { class: "n1-count", "aria-live": "polite", text: "0 of " + D.lens.length + " opened." }, act);
      D.lens.forEach(function (l) {
        var b = H("button", { class: "n1-q", type: "button", "aria-expanded": "false", style: "--c:" + l.color }, grid);
        H("b", { html: chipHTML(l, false) }, b);
        H("span", { class: "t", text: l.ask }, b);
        var trap = H("small", { text: "Trap: " + l.trap, hidden: true }, b);
        if (l.sub) H("small", { text: "Covers " + l.sub }, b);
        b.addEventListener("click", function () {
          var open = b.getAttribute("aria-expanded") !== "true";
          b.setAttribute("aria-expanded", open ? "true" : "false"); trap.hidden = !open;
          opened[l.id] = true;
          var n = Object.keys(opened).length;
          prog.textContent = n + " of " + D.lens.length + " opened.";
          if (n === D.lens.length) { api.done(); api.saw("Seven questions, one trap each. Time covers the horizon and power or energy; Physics covers units and limits. Next, use them on a real story."); }
        });
      });
    };
  }

  // ---- the phrase tagger (dissector) for one story
  function tagStep(D, story, idx) {
    var L = lensById(D), key = "n1-tags-" + story.id;
    return function (act, api) {
      var picks = LX.store.get(key, {}) || {};
      var art = H("article", { class: "n1-story" }, act);
      H("p", { class: "n1-kicker", text: "Story " + (idx + 1) + " of 3 · " + story.kicker }, art);
      H("p", { class: "n1-head", text: story.headline }, art);
      H("p", { class: "n1-framing", text: story.framing }, art);
      var body = H("p", { class: "n1-body" }, art), btns = {}, sel = null;
      story.parts.forEach(function (part) {
        if (typeof part === "string") { body.appendChild(document.createTextNode(part)); return; }
        // an inline span with button semantics, so a long phrase wraps with the sentence (a <button> would not)
        var b = H("span", { class: "n1-ph", role: "button", tabindex: "0", "data-p": part.p, text: part.text }, body);
        btns[part.p] = { b: b, ph: part };
        b.addEventListener("click", function () { select(part.p); });
        b.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(part.p); } });
      });
      sourceLine(art, story);
      var pal = H("div", { class: "n1-pal", role: "group", "aria-label": "Tag the selected phrase" }, act);
      var pq = H("p", { class: "n1-pq", "aria-live": "polite" }, pal);
      var chips = H("div", { class: "n1-chips" }, pal), chipBtns = {};
      D.lens.forEach(function (l) {
        var c = H("button", { class: "n1-chip", type: "button", "aria-pressed": "false", html: chipHTML(l, true) }, chips);
        c.addEventListener("click", function () { if (sel) { picks[sel] = l.id; save(); var nx = nextUntagged(sel); select(nx || sel); } });
        chipBtns[l.id] = c;
      });
      var miss = H("div", { class: "n1-pal", role: "group", "aria-label": "The question the story leaves unanswered" }, act);
      H("p", { class: "n1-pq", text: "Which question does the story leave unanswered?" }, miss);
      var mchips = H("div", { class: "n1-chips" }, miss), mBtns = {};
      D.lens.forEach(function (l) {
        var c = H("button", { class: "n1-chip", type: "button", "aria-pressed": "false", html: chipHTML(l, false) }, mchips);
        c.addEventListener("click", function () { picks._missing = l.id; save(); });
        mBtns[l.id] = c;
      });
      var row = H("div", { class: "n1-row" }, act);
      var cmpBtn = H("button", { class: "lx-btn small", type: "button", html: LX.icon("check") + "Compare with a researcher" }, row);
      var count = H("span", { class: "n1-count", "aria-live": "polite" }, row);
      var cmpBox = H("div", null, act), compared = false;
      cmpBtn.addEventListener("click", function () { compared = true; compare(); api.done(); });

      function nextUntagged(from) {
        var ids = Object.keys(btns), i = ids.indexOf(from);
        for (var k = 1; k <= ids.length; k++) { var id = ids[(i + k) % ids.length]; if (!picks[id]) return id; }
        return null;
      }
      function select(p) {
        sel = p;
        Object.keys(btns).forEach(function (k) { btns[k].b.classList.toggle("sel", k === p); });
        pq.innerHTML = "Which question does “" + LX.esc(btns[p].ph.text) + "” raise?";
        paint();
      }
      function save() { LX.store.set(key, picks); paint(); if (compared) compare(); }
      function paint() {
        var n = 0;
        Object.keys(btns).forEach(function (k) {
          var x = btns[k], t = picks[k], l = t && L[t];
          x.b.classList.toggle("tagged", !!l);
          x.b.style.setProperty("--c", l ? l.color : "var(--lx-ink-3)");
          var old = x.b.querySelector(".n1-n"); if (old) old.remove();
          if (l) { H("span", { class: "n1-n", style: "--c:" + l.color, "aria-hidden": "true", text: l.n }, x.b); n++; }
          x.b.setAttribute("aria-label", x.ph.text + (l ? ", tagged " + l.label : ", not tagged yet"));
          x.b.setAttribute("aria-pressed", k === sel ? "true" : "false");
        });
        D.lens.forEach(function (l) {
          chipBtns[l.id].setAttribute("aria-pressed", sel && picks[sel] === l.id ? "true" : "false");
          mBtns[l.id].setAttribute("aria-pressed", picks._missing === l.id ? "true" : "false");
        });
        var total = Object.keys(btns).length;
        count.textContent = n + " of " + total + " phrases tagged" + (picks._missing ? "; unanswered question chosen." : ".");
      }
      function compare() {
        var sc = score(story, picks);
        cmpBox.innerHTML = "";
        var ul = H("ul", { class: "n1-cmp" }, cmpBox);
        phrases(story).forEach(function (ph) {
          var j = judge(ph, picks[ph.p]), r = L[ph.tag], you = picks[ph.p] && L[picks[ph.p]];
          var li = H("li", { class: j }, ul);
          H("span", { html: LX.icon(j === "same" || j === "fair" ? "check" : "question") }, li);
          var d = H("div", null, li);
          H("b", { text: "“" + ph.text + "”" }, d);
          H("span", { class: "tags", text: "Researcher: " + r.n + " " + r.label + (ph.also && ph.also.length ? " (also fair: " + ph.also.map(function (a) { return L[a].label; }).join(", ") + ")" : "") +
            " · You: " + (you ? you.n + " " + you.label : "not tagged") }, d);
          H("span", { class: "why", html: LX.rich(ph.note) }, d);
        });
        var m = story.missing, mr = L[m.answer], mj = sc.missing;
        var li2 = H("li", { class: mj }, ul);
        H("span", { html: LX.icon(mj === "same" || mj === "fair" ? "check" : "question") }, li2);
        var d2 = H("div", null, li2);
        H("b", { text: "Left unanswered" }, d2);
        H("span", { class: "tags", text: "Researcher: " + mr.n + " " + mr.label + " · You: " + (picks._missing ? L[picks._missing].n + " " + L[picks._missing].label : "no choice yet") }, d2);
        H("span", { class: "why", html: LX.rich(m.note) }, d2);
        api.saw("You matched the researcher on " + sc.same + " of " + sc.total + " phrases" + (sc.fair ? ", and " + sc.fair + " more are fair alternatives" : "") +
          ". Most phrases raise more than one question; the habit that matters is asking all seven.", sc.same + sc.fair < sc.total / 2);
      }
      select(Object.keys(btns)[0]);
      if (picks._missing || Object.keys(picks).length) paint();
    };
  }

  // ---- envelope checks
  function chainInto(host, steps) {
    host.innerHTML = "";
    var ol = H("ol", { class: "n1-chain", "aria-label": "Unit chain" }, host);
    steps.forEach(function (s) {
      if (s.op) { H("li", { class: "op", text: s.op }, ol); return; }
      var li = H("li", { class: s.out ? "out" : "" }, ol); H("b", { text: s.v }, li); H("span", { text: s.u }, li);
    });
  }
  function envelopeA(story) {
    var e = story.envelope;
    return function (act, api) {
      var avg = averageGW(e.twh, e.hours), chain, note, sl;
      var pr = LX.Predict(act, { id: "n1-env-a", q: e.q, fresh: true, options: e.options.map(function (o, i) { return { value: String(i), label: o }; }), answer: String(e.answer),
        feedback: e.options.reduce(function (m, o, i) { m[String(i)] = e.feedback[i]; return m; }, {}),
        onPick: function () {
          pr.reveal(); chain.hidden = false; note.hidden = false;
          if (!sl) {
            sl = LX.Slider(slBox, { label: "Average use of the connections (illustrative)", color: "var(--lx-tier-2)", min: 30, max: 100, step: 5, unit: "%",
              hint: function () { return "The report assumes 50%. Lower use needs more connection capacity for the same energy."; }, onChange: draw });
            sl.set(e.util);
          }
          draw(e.util); api.done();
        } });
      chain = H("div", { hidden: true }, act);
      var slBox = H("div", null, act);
      note = H("p", { class: "lx-hint", hidden: true }, act);
      function draw(u) {
        var con = connectionGW(e.twh, u, e.hours);
        chainInto(chain, [{ v: fmt0(e.twh) + " TWh", u: "a year (energy)" }, { op: "× 1,000 =" }, { v: fmt0(e.twh * 1000) + " GWh", u: "a year" },
          { op: "÷ " + fmt0(e.hours) + " h =" }, { v: fmt1(avg) + " GW", u: "average power" }, { op: "÷ " + u + "% =" }, { v: fmt0(con) + " GW", u: "of connections", out: true }]);
        var at = Math.round(con) === e.report_gw;
        note.innerHTML = LX.rich(at ? "At " + u + "% you reproduce the report's " + e.report_gw + " GW. The headline's GW depends on an assumption it never shows." :
          "At " + u + "%: " + fmt0(con) + " GW, against the report's " + e.report_gw + " GW at 50%. Same energy, a different [[capacity|capacity]] need.");
      }
    };
  }
  function envelopeB(story) {
    var e = story.envelope;
    return function (act, api) {
      var box = H("div", { hidden: true, class: "lx-stack" }, act);
      var pr = LX.Predict(act, { id: "n1-env-b", q: e.q, fresh: true, options: e.options.map(function (o, i) { return { value: String(i), label: o }; }), answer: String(e.answer),
        feedback: e.options.reduce(function (m, o, i) { m[String(i)] = e.feedback[i]; return m; }, {}),
        onPick: function () { pr.reveal(); box.hidden = false; api.done(); } });
      act.appendChild(box);
      H("p", { class: "n1-pq", text: "Pick an average duration (illustrative):" }, box);
      var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Battery duration in hours" }, box);
      var chain = H("div", null, box), out = H("p", { class: "lx-hint" }, box);
      var plan = H("p", { class: "lx-hint" }, box);
      plan.innerHTML = LX.rich("Planned against built: " + e.gw + " ÷ " + e.planned_gw + " = **" + Math.round(e.gw / e.planned_gw * 100) + "%** of the planned battery capacity arrived in 2025.").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      var bs = e.durations.map(function (h) {
        var b = H("button", { type: "button", "aria-pressed": "false", text: h + " h" }, seg);
        b.addEventListener("click", function () { draw(h); });
        return { b: b, h: h };
      });
      function draw(h) {
        bs.forEach(function (x) { x.b.setAttribute("aria-pressed", x.h === h ? "true" : "false"); });
        var gwh = storedGWh(e.gw, h), min = minutesOfUse(gwh, e.us_twh, e.hours);
        chainInto(chain, [{ v: e.gw + " GW", u: "power" }, { op: "× " + h + " h =" }, { v: fmt0(gwh) + " GWh", u: "energy stored", out: true }]);
        out.innerHTML = LX.rich("Enough to run the whole U.S. for about **" + fmt1(min) + " minutes** at its 2025 average of " + fmt0(averageGW(e.us_twh, e.hours)) + " GW. Batteries shift energy by hours; they do not store a season.").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      }
      draw(e.duration);
    };
  }
  function clockStep(story) {
    var e = story.envelope, dF = days(e.event, e.factual), dX = days(e.event, e.final);
    return function (act, api) {
      LX.Guess(act, { id: "n1-clock", q: e.q, ticks: e.ticks, answer: e.answer, start: 0, srLabel: e.q,
        onLock: function (g, out) {
          var ok = g === e.answer, box = H("div", { class: "n1-clock" }, out);
          var W = 640, Hh = 96, x = function (d) { return 30 + d / dX * (W - 60); };
          var svg = LX.S("svg", { viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": "Timeline: the blackout on 28 April 2025; a single-cause claim within a day; the factual report after " + dF + " days; the final report after " + dX + " days." }, box);
          LX.S("path", { d: "M30 46 H" + (W - 30), stroke: "var(--lx-line-2)", "stroke-width": 3 }, svg);
          [[0, "Blackout", "28 Apr 2025"], [1, "One-cause claim", "within a day"], [dF, "Factual report", dF + " days"], [dX, "Final report", dX + " days"]].forEach(function (m, i) {
            var xx = x(m[0]), up = i % 2 === 1;
            LX.S("circle", { cx: xx, cy: 46, r: 6, fill: i === 1 ? "var(--lx-warn)" : "var(--lx-ink)" }, svg);
            var anchor = i === 0 ? "start" : i === 3 ? "end" : i === 1 ? "start" : "middle";
            LX.S("text", { x: i === 1 ? xx + 4 : xx, y: up ? 26 : 74, "text-anchor": anchor }, svg).textContent = m[1];
            LX.S("text", { x: i === 1 ? xx + 4 : xx, y: up ? 12 : 90, "text-anchor": anchor, class: "v" }, svg).textContent = m[2];
          });
          H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "You called it." : "Not quite.") + "</b> " +
            "The factual report came " + dF + " days after the blackout and the final report " + dX + " days after: about 11 months. The one-cause claim came within a day.</div>" }, out);
          api.done();
        } });
    };
  }

  // ---- units or scale error spotter
  function spotStep(D) {
    return function (act, api) {
      var ul = H("ul", { class: "n1-spot" }, act), answered = {}, right = 0;
      var tally = H("p", { class: "n1-count", "aria-live": "polite" }, act);
      D.spotter.forEach(function (s) {
        var li = H("li", null, ul), sid = LX.uid("sp");
        H("p", { class: "s", id: sid, text: "“" + s.text + "”" }, li);
        var g = H("div", { class: "lx-qbtns", role: "group", "aria-labelledby": sid }, li), fb = H("div", { "aria-live": "polite" }, li);
        [["ok", "Reads right"], ["error", "Unit or scale error"]].forEach(function (o) {
          var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: o[1] }, g);
          b.addEventListener("click", function () {
            [].forEach.call(g.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.classList.remove("right", "wrong"); });
            var ok = o[0] === s.answer; b.classList.add(ok ? "right" : "wrong");
            if (!(s.id in answered)) { answered[s.id] = ok; if (ok) right++; }
            fb.innerHTML = "";
            H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " +
              (s.answer === "error" ? "A " + s.kind + " error. " : "") + LX.rich(s.fix) + "</div>" }, fb);
            var n = Object.keys(answered).length;
            tally.textContent = n + " of " + D.spotter.length + " judged; " + right + " right on the first try.";
            if (n === D.spotter.length) { api.done(); api.saw("Most errors are a rate written as an amount (MW for MWh) or a number with no sense of scale. Divide by 8,760 hours, or compare with a known total, before you believe it."); }
          });
        });
      });
    };
  }

  // ---- three-sentence take
  function takeStep(D) {
    return function (act, api) {
      var cur = LX.store.get("n1-take-story", "b"), seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Story" }, act), segBtns = {};
      D.stories.forEach(function (s, i) {
        var b = H("button", { type: "button", "aria-pressed": "false", text: "Story " + (i + 1) }, seg);
        b.addEventListener("click", function () { cur = s.id; LX.store.set("n1-take-story", cur); load(); });
        segBtns[s.id] = b;
      });
      var head = H("p", { class: "n1-pq" }, act), form = H("div", { class: "n1-take" }, act), fields = {};
      [["claim", "The claim I accept or reject"], ["mind", "What would change my mind"], ["conf", "My confidence (low, medium or high) and why"]].forEach(function (f) {
        var lab = H("label", null, form); H("span", { text: f[1] }, lab);
        var ta = H("textarea", { rows: 2 }, lab);
        ta.addEventListener("input", function () { var t = LX.store.get("n1-take-" + cur, {}) || {}; t[f[0]] = ta.value; LX.store.set("n1-take-" + cur, t); });
        fields[f[0]] = ta;
      });
      var row = H("div", { class: "n1-row" }, act);
      var show = H("button", { class: "lx-btn small ghost", type: "button", text: "Show a researcher's take" }, row);
      H("span", { class: "n1-count", text: "Your words stay in this browser." }, row);
      var model = H("p", { class: "n1-model", hidden: true }, act);
      show.addEventListener("click", function () { model.hidden = false; api.done(); api.saw("Compare the three parts, not the wording. A good take names what would change the author's mind; that line is what turns an opinion into a claim someone can check."); });
      function load() {
        var s = D.stories.filter(function (x) { return x.id === cur; })[0] || D.stories[1];
        Object.keys(segBtns).forEach(function (k) { segBtns[k].setAttribute("aria-pressed", k === s.id ? "true" : "false"); });
        head.textContent = "“" + s.headline + "”";
        var t = LX.store.get("n1-take-" + s.id, {}) || {};
        Object.keys(fields).forEach(function (k) { fields[k].value = t[k] || ""; });
        model.textContent = s.take;
      }
      load();
    };
  }

  // ---- explain layer: the checklist and the evidence ladder
  function explain(D) {
    var host = document.getElementById("n1-explain"); if (!host) return;
    host.innerHTML = "";
    var by = caught(D), L = lensById(D);
    var c1 = H("div", { class: "lx-xcard n1-wide" }, host), c2 = H("div", { class: "lx-xcard" }, host);
    LX.Checklist(c1, { id: "n1-checklist", title: "The lens as a checklist",
      lede: "Use it on your next headline: tick each question as you ask it. Under each, the phrases it caught in today's three stories.",
      doneText: "Now write your three-sentence take.",
      items: D.lens.map(function (l) {
        return { id: l.id, label: l.n + ". " + l.label + ": " + l.ask, text: "Trap: " + l.trap, note: "Caught today: " + by[l.id].join(" · ") };
      }) });
    // evidence ladder, top rung first
    var hd = H("header", { class: "lx-x-head" }, c2); H("h3", { text: "The evidence ladder" }, hd);
    H("p", { class: "lx-lede", text: "A project climbs these rungs. Headlines often report a low rung as if it were the top one. Place each claim from today's stories." }, c2);
    var lad = H("div", { class: "n1-ladder" }, c2), left = H("div", null, lad);
    var rungs = H("ol", { class: "n1-rungs", "aria-label": "Rungs, highest first" }, left), rli = {};
    D.ladder.rungs.slice().reverse().forEach(function (r) {
      var i = D.ladder.rungs.indexOf(r) + 1, li = H("li", null, rungs);
      H("span", { class: "k", text: i }, li); var d = H("div", null, li); H("b", { text: r.label }, d); H("small", { text: r.text }, d);
      rli[r.id] = li;
    });
    var proj = H("p", { class: "n1-proj", text: D.ladder.projection_label }, left);
    var place = H("ul", { class: "n1-place" }, lad);
    D.ladder.items.forEach(function (it) {
      var li = H("li", null, place), id = LX.uid("ld");
      H("label", { for: id, text: it.text }, li);
      var s = H("select", { id: id }, li);
      H("option", { value: "", text: "Where does it sit?" }, s);
      D.ladder.rungs.forEach(function (r) { H("option", { value: r.id, text: r.label }, s); });
      H("option", { value: "projection", text: D.ladder.projection_label }, s);
      var fb = H("div", { "aria-live": "polite" }, li);
      s.addEventListener("change", function () {
        Object.keys(rli).forEach(function (k) { rli[k].classList.toggle("hit", k === s.value); }); proj.classList.toggle("hit", s.value === "projection");
        fb.innerHTML = ""; if (!s.value) return;
        var ok = ladderOK(it, s.value);
        H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + LX.esc(it.note) + "</div>" }, fb);
      });
    });
    var alt = H("details", { class: "lx-textalt" }, c2); H("summary", { text: "Text version of the ladder" }, alt);
    var ol = H("ol", null, alt);
    D.ladder.rungs.forEach(function (r) { H("li", { text: r.label + ": " + r.text }, ol); });
    var ul = H("ul", null, alt);
    D.ladder.items.forEach(function (it) { H("li", { text: it.text + ": " + it.note }, ul); });
    return L;
  }

  LX.mount("news-lens", function (live, data, root) {
    injectCSS();
    var D = data["n01-news-lens"] || data.n01_news_lens;
    var A = D.stories[0], B = D.stories[1], C = D.stories[2];
    var steps = [
      { text: "A researcher reads an energy headline with seven questions, always in the same order, so none gets skipped. Open each one to see the trap it catches.", build: lensStep(D) },
      { text: "Tap each highlighted phrase and tag it with the question it raises. Then choose the question the story leaves unanswered, and compare with a researcher's notes.", build: tagStep(D, A, 0) },
      { text: "Now one check with units. The report gives [[energy|energy]] per year; grids are sized in [[power|power]]. Turn 649 TWh a year into average GW.", build: envelopeA(A) },
      { text: "Tag the second story. Watch for power against energy, and for plans against results. Then compare with a researcher's notes.", build: tagStep(D, B, 1) },
      { text: "The story gives power, not energy. Choose a [[battery-duration|duration]] and see how much energy 15 GW could hold, and how long that would run the whole country.", build: envelopeB(B) },
      { text: "The third story is a claim about a cause, made the day after a blackout. Tag its phrases, then choose the question the headline skips.", build: tagStep(D, C, 2) },
      { text: "Evidence takes time. Guess how long the formal investigation took before its final report, then lock in your guess.", build: clockStep(C) },
      { text: "Spot the units or scale error. Four of these six sentences break a unit or a sense of scale; two read right. Judge each one.", build: spotStep(D) },
      { text: "Write your take in three sentences: the claim you accept or reject, what would change your mind, and your confidence. Then compare with a researcher's take.", build: takeStep(D) }
    ];
    LX.StepCards(live, { id: "n1-steps", steps: steps });
    explain(D);
    root.lxLesson = { data: D, model: model };
    // screenshot hook: learn/n01-news-lens.html#lx-demo opens story 1 with every phrase tagged and the comparison shown
    if (location.hash === "#lx-demo") {
      var pk = {}; model.phrases(A).forEach(function (ph, i) { pk[ph.p] = i % 3 === 2 ? "scale" : ph.tag; }); pk._missing = "pays";
      LX.store.set("n1-tags-a", pk);
      var card = live.querySelector(".lx-stepcard");
      var go = function () { var b = card.querySelectorAll(".n1-q"); [].forEach.call(b, function (x) { x.click(); }); card.querySelector(".lx-step-foot .lx-btn:not(.ghost)").click();
        var c = card.querySelector(".n1-row .lx-btn"); if (c) c.click(); };
      setTimeout(go, 50);
    }
  });
})();
