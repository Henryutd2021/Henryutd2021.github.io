/* r01-framing.js — research studio R1, "What makes a question worth researching?".
   Data: assets/learn/data/r01-framing.json (twenty illustrative questions, three rewrites, the exemplars, the checklist and
   the two sourced numbers) and data/path.json (to link the lessons that are live, and name the rest as upcoming).
   Page: learn/r01-framing.qmd (studio form: Task, Exemplars, Self-check, Sources).
   Task (step cards): sort twenty questions in two rounds into researchable, too vague, already answered and not answerable
   with the data at hand (LX.CardSort); name the type of the sixteen that are clear enough to type (the course's five question
   types): researchability and type are separate, so an answered or data-short question keeps its type; rewrite three vague
   questions with an audience, a metric with units and a counterfactual, then compare with an example.
   A rewrite is done when all five parts are written; its example can be opened at any time and does not complete it.
   Exemplars: a weak and a strong card for the same vague question (LX.Exemplars) and the four tests as a flowchart
   (LX.Flowchart, e-flowchart). Self-check: the reader's question card (LX.QuestionCard, started from a rewrite: each
   rewrite keeps its own card, so switching never mixes two questions, and a card the reader edited comes back with the
   edits; "Refresh from the rewrite" takes the rewrite's five parts again), the Framing competence of the course rubric
   (LX.Rubric) and a reusable checklist (LX.Checklist, e-checklist); the myth-or-fact cards (e-myth) are page markup.
   Lesson links follow data/path.json through LX.lessonRef (core.js).
   Node: module.exports = the pure model below (checks, grading, the no-JS version of the task); the test is
   _tests/learn/test_r01-framing.js (it also writes the page's no-JS blocks with --write). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var BIN_IDS = ["research", "vague", "answered", "nodata"];
  var TYPE_IDS = ["descriptive", "explanatory", "evaluative", "predictive", "prescriptive"];
  var RW_FIELDS = ["question", "audience", "metric", "units", "counterfactual"];
  // the card's other parts, which the reader adds on the card itself (kept per rewrite)
  var EXTRA = ["type", "scale", "boundary", "wrong", "uncertainty"];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // glossary marks (double brackets) as spans, built from parts so the build's glossary scan finds no placeholder id
  function rich(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; }); }
  function plainMarks(t) { return String(t == null ? "" : t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"); }
  function words(s) { return plainMarks(s).trim().split(/\s+/).filter(Boolean).length; }
  function round(D, n) { return D.questions.filter(function (q) { return q.round === n; }); }
  // the questions clear enough to type: every one except the too-vague ones, which get a type once rewritten (a question
  // that is already answered, or that the data at hand cannot answer, still asks for one kind of answer)
  function typeable(D) { return D.questions.filter(function (q) { return q.bin !== "vague"; }); }
  // the cards of a sort: round 1 or 2 into the four bins, or "types": the typeable ones into the five types
  function cards(D, which) {
    if (which === "types") return typeable(D).map(function (q) { return { id: q.id, text: q.text, bin: q.type, why: q.typeWhy }; });
    return round(D, which).map(function (q) { return { id: q.id, text: q.text, bin: q.bin, why: q.why }; });
  }
  // {right, placed, total} for a map {cardId: binId}
  function grade(list, placed) {
    var right = 0, n = 0;
    list.forEach(function (c) { if (placed[c.id]) { n++; if (placed[c.id] === c.bin) right++; } });
    return { right: right, placed: n, total: list.length };
  }
  // "place the rest for me": keep the reader's placements, put only the unplaced cards in their right bins
  function fillRest(list, placed) {
    var out = {}; Object.keys(placed || {}).forEach(function (k) { out[k] = placed[k]; });
    list.forEach(function (c) { if (!out[c.id]) out[c.id] = c.bin; });
    return out;
  }
  function filled(v) { return RW_FIELDS.filter(function (k) { return v && String(v[k] || "").trim(); }).length; }
  function hasAny(c) { return Object.keys(c || {}).some(function (k) { return String(c[k] || "").trim(); }); }
  // the question card follows one source at a time: a rewrite ("rw1" ...) or the card the reader typed ("own").
  // Switching keeps the current card under its source, then builds the new one. A rewrite's card already started comes
  // back whole, with the reader's edits to its question, metric or any other part; a rewrite's first card takes its five
  // parts from the reader's rewrite (a blank part stays blank). refresh: take the rewrite's five parts again, keeping the
  // other parts. Nothing ever comes from another question's card. Returns { cards, card, from }.
  function switchCard(cards, from, current, to, v, refresh) {
    var out = {}, card = {};
    Object.keys(cards || {}).forEach(function (k) { out[k] = cards[k]; });
    if (hasAny(current)) out[from || "own"] = JSON.parse(JSON.stringify(current));
    var kept = out[to] || {}, started = RW_FIELDS.some(function (k) { return String(kept[k] || "").trim(); });
    EXTRA.concat(RW_FIELDS).forEach(function (k) { card[k] = String(kept[k] || ""); });
    if (to !== "own" && (refresh || !started)) RW_FIELDS.forEach(function (k) { card[k] = String((v && v[k]) || "").trim(); });
    return { cards: out, card: card, from: to };
  }
  // a rewrite's feedback, in separate pieces: progress (a count), a short guidance line, and (last rewrite) what comes next
  function rewriteFeedback(n, opened, last) {
    var f = { progress: n + " of 5 parts written.", saw: null, bad: false, next: null };
    if (n === 5) {
      f.saw = "All five parts written. Compare your counterfactual with the example's: a good one could really have happened instead.";
      if (last) f.next = "Next: put your best rewrite on a question card in the self-check below.";
    } else if (opened) { f.saw = "The example is open. Write all five parts of your own to finish this rewrite."; f.bad = true; }
    return f;
  }
  // data checks: counts per bin and type, ids, notes within the text budget
  function check(D) {
    var out = [], ids = {};
    D.questions.forEach(function (q) {
      if (ids[q.id]) out.push(q.id + ": repeated id"); ids[q.id] = true;
      if (BIN_IDS.indexOf(q.bin) < 0) out.push(q.id + ": unknown bin " + q.bin);
      if (q.bin !== "vague" && TYPE_IDS.indexOf(q.type) < 0) out.push(q.id + ": a question clear enough to type, without a type");
      if (q.bin !== "vague" && !q.typeWhy) out.push(q.id + ": a type without its reason");
      if (q.bin === "vague" && q.type) out.push(q.id + ": a type on a question too vague to type (it gets one once rewritten)");
      if (!/\?$/.test(q.text)) out.push(q.id + ": not a question");
      if (words(q.text) > 26) out.push(q.id + ": question over 26 words");
      if (words(q.why) > 30 || (q.typeWhy && words(q.typeWhy) > 20)) out.push(q.id + ": a reason over the text budget");
    });
    return out;
  }
  // the no-JS version of the task: the twenty questions with bins, types and reasons, then the three example rewrites
  function staticTask(D, types) {
    var B = {}, T = {};
    D.bins.forEach(function (b) { B[b.id] = b.label; });
    (types || []).forEach(function (t) { T[t.id] = t.label; });
    var h = ['<details class="lx-textalt"><summary>The twenty questions, sorted, with reasons</summary>',
      '<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Question</th><th scope="col">Where it goes</th><th scope="col">Why</th><th scope="col">Its type</th></tr></thead><tbody>'];
    D.questions.forEach(function (q) {
      h.push("<tr><td>" + esc(q.text) + "</td><td>" + esc(B[q.bin]) + "</td><td>" + rich(q.why) + "</td><td>"
        + (q.typeWhy ? rich(q.typeWhy) : "Typed once rewritten") + "</td></tr>");
    });
    h.push("</tbody></table></div>");
    Object.keys(D.terms || {}).forEach(function (k) { h.push('<p class="lx-hint">Words in round ' + esc(k) + ": " + rich(D.terms[k]) + "</p>"); });
    h.push("</details>");
    h.push('<details class="lx-textalt"><summary>Three vague questions, rewritten as examples</summary>');
    D.rewrites.forEach(function (r) {
      h.push(rewriteTable(r, T));
    });
    h.push("</details>");
    return h.join("\n");
  }
  // one example rewrite as a labelled table: one part per row
  function rewriteTable(r, T) {
    var e = r.example;
    return '<table class="lx-facts r1-rw"><caption>“' + esc(r.vague) + "”, rewritten</caption><tbody>"
      + [["Rewrite", e.question], ["Type", T[e.type] || e.type], ["Audience", e.audience], ["Metric", e.metric], ["Units", e.units], ["Compared with", e.counterfactual]]
        .map(function (x) { return '<tr><th scope="row">' + esc(x[0]) + "</th><td>" + rich(x[1]) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  // the page's three no-JS blocks, from the data and the components' own staticHTML (the test writes and checks them):
  // C = { types: LX.QuestionCard.TYPES, exemplars: LX.Exemplars staticHTML, rubric: LX.Rubric staticHTML }
  function staticBlocks(D, C) {
    return {
      task: staticTask(D, C.types),
      exemplars: C.exemplars(D.exemplars),
      rubric: C.rubric(D.rubric.competences) + '\n<p class="lx-eyebrow">A checklist to reuse</p>\n<ul>'
        + D.checklist.map(function (c) { return "<li><b>" + rich(c.label) + ":</b> " + rich(c.text) + "</li>"; }).join("") + "</ul>"
    };
  }
  var model = { BIN_IDS: BIN_IDS, TYPE_IDS: TYPE_IDS, RW_FIELDS: RW_FIELDS, EXTRA: EXTRA, cards: cards, grade: grade, fillRest: fillRest, filled: filled,
                switchCard: switchCard, rewriteFeedback: rewriteFeedback, check: check, staticTask: staticTask, staticBlocks: staticBlocks,
                rich: rich, words: words, plainMarks: plainMarks };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, M_BINS = BIN_IDS, M_TYPES = TYPE_IDS;
  function injectCSS() {
    if (document.getElementById("r1-css")) return;
    H("style", { id: "r1-css", text: [
      ".r1-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".r1-sort .lx-cs-bins{grid-template-columns:repeat(2,minmax(0,1fr))}",
      ".r1-sort .lx-step-foot{flex-wrap:wrap;gap:8px}",
      ".r1-why{margin:0;padding-left:1.1rem;display:grid;gap:4px;font-size:14px;color:var(--lx-ink-2)}",
      ".r1-why b{color:var(--lx-ink);font-weight:600}",
      ".r1-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}",
      ".r1-form .wide{grid-column:1/-1}",
      ".r1-form label{display:grid;gap:4px;font-family:var(--lx-f-display);font-weight:500;font-size:14px;color:var(--lx-ink)}",
      ".r1-form input,.r1-form textarea{font:inherit;font-size:15px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);width:100%;box-sizing:border-box}",
      ".r1-form textarea{min-height:56px;resize:vertical}",
      ".r1-vague{font-family:var(--lx-f-display);font-weight:500;font-size:17px;color:var(--lx-ink)}",
      ".r1-model{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 12px;margin:0;padding:10px 12px;border-radius:10px;background:var(--lx-surface-2);font-size:14.5px}",
      ".r1-model dt{font-family:var(--lx-f-display);font-weight:500;color:var(--lx-ink-3)}.r1-model dd{margin:0;color:var(--lx-ink)}",
      ".r1-load{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".r1-terms{margin:0 0 8px}",
      "@media (max-width:560px){.r1-form{grid-template-columns:minmax(0,1fr)}.r1-model{grid-template-columns:minmax(0,1fr)}.r1-model dd{margin-bottom:4px}}"
    ].join("\n") }, document.head);
  }
  function typeBins() {
    var tiers = ["var(--lx-tier-1)", "var(--lx-tier-2)", "var(--lx-tier-3)", "var(--lx-tier-4)", "var(--lx-tier-5)"];
    return LX.QuestionCard.TYPES.map(function (t, i) { return { id: t.id, label: t.label, sub: t.template, color: tiers[i] }; });
  }
  function typeLabel(id) { var t = LX.QuestionCard.TYPES.filter(function (x) { return x.id === id; })[0]; return t ? t.label : id; }

  // one sort (a round of the four bins, or the types): placements kept in this browser, "Place the rest for me" keeps
  // the reader's own placements and fills only the empty ones, then checks
  function sortStep(D, which, opt) {
    return function (act, api) {
      var list = cards(D, which), key = "r1-sort-" + which, placed = LX.store.get(key, {}) || {};
      var bins = which === "types" ? typeBins() : D.bins;
      if (opt.hint) H("p", { class: "lx-hint r1-terms", html: LX.rich(opt.hint) }, act);
      if (D.terms && D.terms[which]) H("p", { class: "lx-hint r1-terms", html: "Words in these questions: " + LX.rich(D.terms[which]) }, act);
      var cs = LX.CardSort(act, { bins: bins, cards: list, maxWhy: 10, checkLabel: "Check my sort", cls: "r1-sort",
        onCheck: function (g) { LX.store.set(key, placed); report(g); } });
      cs.place(placed); placed = cs.placed();
      // every placement is kept (a bin's own click handler runs first, then this one as the click bubbles up)
      act.addEventListener("click", function () { LX.store.set(key, cs.placed()); });
      var foot = cs.el.querySelector(".lx-step-foot");
      var rest = H("button", { class: "lx-btn ghost small", type: "button", text: "Place the rest for me" }, null);
      foot.insertBefore(rest, foot.children[1] || null);
      var why = H("details", { class: "lx-textalt", hidden: true }, act);
      H("summary", { text: which === "types" ? "Why each question has its type" : "Why each question goes where it does" }, why);
      var ul = H("ul", { class: "r1-why" }, why);
      list.forEach(function (c) { H("li", { html: "<b>" + LX.esc(c.text) + "</b> " + LX.esc(which === "types" ? typeLabel(c.bin) : binLabel(c.bin)) + ". " + LX.rich(c.why) }, ul); });
      rest.addEventListener("click", function () {
        cs.place(fillRest(list, cs.placed())); placed = cs.placed(); cs.check();
      });
      function binLabel(id) { return D.bins.filter(function (b) { return b.id === id; })[0].label; }
      function report(g) {
        if (g.placed < g.total) { api.saw("Place every card first: " + (g.total - g.placed) + " still in the pool.", true); return; }
        why.hidden = false; api.done();
        api.saw(opt.saw(g));
        LX.emit("layout");
      }
    };
  }

  // a rewrite: five fields kept in this browser and a parts count. The step is done when all five are written; the
  // example can be opened at any time to compare, and opening it completes nothing.
  function rewriteStep(D, k, last) {
    return function (act, api) {
      var r = D.rewrites[k], all = LX.store.get("r1-rewrites", {}) || {}, v = all[r.id] || {};
      H("p", { class: "r1-vague", text: "“" + r.vague + "”" }, act);
      var form = H("div", { class: "r1-form" }, act);
      var labels = { question: "Your rewrite, as one question", audience: "Audience or decision-maker", metric: "Metric", units: "Units", counterfactual: "Compared with (the counterfactual)" };
      RW_FIELDS.forEach(function (f) {
        var lab = H("label", { class: f === "question" || f === "counterfactual" ? "wide" : "" }, form);
        lab.appendChild(document.createTextNode(labels[f]));
        var inp = f === "question" ? H("textarea", { rows: "2" }, lab) : H("input", { type: "text" }, lab);
        inp.setAttribute("maxlength", "400"); inp.value = v[f] || "";
        inp.addEventListener("input", function () { v[f] = inp.value; all[r.id] = v; LX.store.set("r1-rewrites", all); paint(); });
      });
      var row = H("div", { class: "r1-row" }, act);
      var cmp = H("button", { class: "lx-btn ghost small", type: "button", text: "Compare with an example", "aria-expanded": "false" }, row);
      var count = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
      var ex = H("dl", { class: "r1-model", hidden: true }, act), e = r.example;
      [["Question", e.question], ["Type", typeLabel(e.type)], ["Audience", e.audience], ["Metric", e.metric], ["Units", e.units], ["Compared with", e.counterfactual]]
        .forEach(function (p) { H("dt", { text: p[0] }, ex); H("dd", { html: LX.rich(p[1]) }, ex); });
      var nextP = H("p", { class: "lx-hint", hidden: true }, act);
      var opened = false, shown = null;
      function paint() {
        var n = filled(v), f = rewriteFeedback(n, opened, last), key = n === 5 ? "done" : opened ? "open" : null;
        count.textContent = f.progress;
        if (n === 5) api.done();
        // guidance changes only when the state does, so a screen reader is not interrupted at every keystroke
        if (key !== shown) {
          if (f.saw) api.saw(f.saw, f.bad); else if (shown) api.saw("Write all five parts to finish this rewrite.", true);
          shown = key;
        }
        nextP.hidden = !f.next; nextP.textContent = f.next || "";
      }
      cmp.addEventListener("click", function () {
        ex.hidden = !ex.hidden; opened = opened || !ex.hidden;
        cmp.setAttribute("aria-expanded", ex.hidden ? "false" : "true");
        cmp.textContent = ex.hidden ? "Compare with an example" : "Hide the example";
        paint(); LX.emit("layout");
      });
      paint();
    };
  }

  function exemplars(D, P) {
    var host = document.getElementById("r01-exemplars"); if (!host) return;
    host.innerHTML = "";
    LX.Exemplars(H("div", { class: "lx-xcard" }, host), D.exemplars);
    var q = {}; D.questions.forEach(function (x) { q[x.id] = x; });
    LX.Flowchart(H("div", { class: "lx-xcard" }, host), {
      title: "Four tests before a question is worth researching",
      lede: "The same tests you used to sort the twenty questions. Trace four of them.",
      nodes: {
        start: { t: "A question", k: "end" },
        q1: { t: "Specific?", k: "q" },
        vague: { t: "Too vague", s: "rewrite it", k: "end" },
        q2: { t: "Already answered?", tN: ["Already", "answered?"], k: "q" },
        ans: { t: "Use the answer", s: "or plan a re-check", sN: "or re-check it", k: "end" },
        q3: { t: "Data at hand can show it?", tN: ["Data at hand", "can show it?"], k: "q" },
        nod: { t: "Change the data", s: "or narrow the question", sN: "or the question", k: "end" },
        res: { t: "Researchable", s: "now name its type", k: "end" }
      },
      cols: 3, at: { start: [1, 0], q1: [1, 1], vague: [2, 1.9], q2: [1, 2.4], ans: [2, 3.3], q3: [1, 3.8], nod: [2, 4.7], res: [0.2, 4.7] },
      colsN: 2, atN: { start: [0, 0], q1: [0, 1], vague: [1, 1.9], q2: [0, 2.4], ans: [1, 3.3], q3: [0, 3.8], nod: [1, 4.7], res: [0, 5.2] },
      edges: [["start", "q1"], ["q1", "vague", "no"], ["q1", "q2", "yes"], ["q2", "ans", "yes"], ["q2", "q3", "no"], ["q3", "nod", "no"], ["q3", "res", "yes"]],
      traces: [
        { label: "Is solar power good?", path: ["start", "q1", "vague"], text: q.q02.why },
        { label: "U.S. use in 2025", path: ["start", "q1", "q2", "ans"], text: q.q03.why },
        { label: "Charging hours from yearly sales", path: ["start", "q1", "q2", "q3", "nod"], text: q.q05.why },
        { label: "A co-op's tariff and its evening peak", path: ["start", "q1", "q2", "q3", "res"], text: q.q04.why + " " + q.q04.typeWhy }
      ],
      sel: 3
    });
  }

  function selfcheck(D, P) {
    var host = document.getElementById("r01-rubric"); if (!host) return;
    host.innerHTML = "";
    var c1 = H("div", { class: "lx-xcard" }, host);
    var hd = H("header", { class: "lx-x-head" }, c1); H("h3", { text: "Your question card" }, hd);
    H("p", { class: "lx-lede", text: "Start from one of your three rewrites, then add the type, scale, boundary, a falsification statement and the main uncertainty." }, c1);
    var load = H("div", { class: "r1-load", role: "group", "aria-label": "Start from a rewrite" }, c1), msg = H("span", { class: "lx-hint", "aria-live": "polite" }, null);
    var fix = {}, r3 = LX.lessonRef(P, "R3"), r6 = LX.lessonRef(P, "R6"), r2 = LX.lessonRef(P, "R2");
    if (r3.ready) fix.scale = { href: r3.href, label: "R3" };
    if (r6.ready) fix.uncertainty = { href: r6.href, label: "R6" };
    var qcHost = H("div", null, c1);
    var qc = LX.QuestionCard(qcHost, { id: "r1-card", code: "R1", fix: fix });
    // each rewrite keeps its own card (r1-cards), so a card never mixes parts of two questions
    var cards = LX.store.get("r1-cards", {}) || {}, from = LX.store.get("r1-card-from", null);
    function go(to, v, done, refresh) {
      var s = switchCard(cards, from, qc.get(), to, v, refresh);
      cards = s.cards; from = s.from;
      LX.store.set("r1-cards", cards); LX.store.set("r1-card-from", from);
      qc.set(s.card); paintOwn(); msg.textContent = done;
    }
    function rwOf(id) { return (LX.store.get("r1-rewrites", {}) || {})[id] || {}; }
    D.rewrites.forEach(function (r, i) {
      var b = H("button", { class: "lx-btn ghost small", type: "button", text: "Start from rewrite " + (i + 1) }, load);
      b.addEventListener("click", function () {
        var v = (LX.store.get("r1-rewrites", {}) || {})[r.id] || {};
        if (!filled(v)) { msg.textContent = "Rewrite " + (i + 1) + " is still empty: write it in the task above first."; return; }
        var back = !!cards[r.id] && hasAny(cards[r.id]);
        go(r.id, v, back ? "Rewrite " + (i + 1) + "'s card is back, with your edits. Your other cards are kept."
          : "Rewrite " + (i + 1) + " is on a fresh card. Your other cards are kept.");
      });
    });
    var own = H("button", { class: "lx-btn ghost small", type: "button", text: "Back to the card you typed", hidden: true }, load);
    own.addEventListener("click", function () { go("own", null, "Your own card is back."); });
    // an explicit action, never a side effect of switching: the rewrite's current five parts replace the card's
    var fresh = H("button", { class: "lx-btn ghost small", type: "button", text: "Refresh from the rewrite", hidden: true }, load);
    fresh.addEventListener("click", function () {
      var k = D.rewrites.map(function (r) { return r.id; }).indexOf(from); if (k < 0) return;
      go(from, rwOf(from), "The five parts of rewrite " + (k + 1) + " are on the card again; its other parts are kept.", true);
    });
    function paintOwn() {
      own.hidden = !(cards.own && hasAny(cards.own) && from !== "own");
      fresh.hidden = !from || from === "own" || !filled(rwOf(from));
    }
    paintOwn();
    load.appendChild(msg);
    LX.Rubric(H("div", { class: "lx-xcard" }, host), D.rubric);
    LX.Checklist(H("div", { class: "lx-xcard" }, host), { id: "r1-checklist", title: "Is it worth researching? A checklist to reuse",
      lede: "Run it on the next question you meet in a course, a seminar or the news.", columns: 2,
      doneText: "Now ask what is already known (" + r2.label + (r2.ready ? "" : ", upcoming") + ").", items: D.checklist });
    return qc;
  }

  LX.mount("r01-framing", function (live, data, root) {
    injectCSS();
    var D = data.r01_framing, P = data.path;
    var steps = [
      { text: "Sort ten questions into four bins: tap a question, then its bin.",
        build: sortStep(D, 1, { hint: "Researchable means specific, still open, and answerable with data you could get.", saw: function (g) { return "You placed " + g.right + " of " + g.total + " where a researcher would. Open the reasons above: a few questions sit near a border, and the reason matters more than the bin."; } }) },
      { text: "Ten more. Watch for questions that name data which cannot show the answer: yearly totals for an hourly question, one year for a trend.",
        build: sortStep(D, 2, { saw: function (g) { return "You placed " + g.right + " of " + g.total + " where a researcher would. Next, name the types of every question that is not too vague."; } }) },
      { text: "Name the [[question-type|type]] of each question, except the too-vague ones: they get a type once rewritten. The type sets the kind of answer, and so which methods can give it.",
        build: sortStep(D, "types", { hint: "Optimization is often used for prescriptive questions, alongside decision analysis and multi-criteria methods; it also supports other analyses.", saw: function (g) { return "You typed " + g.right + " of " + g.total + " as a researcher would. An answered question, or one the data cannot answer, keeps its type: researchability is a separate test."; } }) },
      { text: "Now rewrite a vague question so it could be researched: an audience, a metric with units and a [[counterfactual|counterfactual]]. Then compare with an example.",
        build: rewriteStep(D, 0) },
      { text: "Next: worth what, to whom, over how long, compared with which heating? Same five parts, then compare.",
        build: rewriteStep(D, 1) },
      { text: "Last: pick one problem, one grid and one decision-maker. Then compare with an example.",
        build: rewriteStep(D, 2, true) }
    ];
    var cardsUI = LX.StepCards(live, { id: "r1-steps", steps: steps });
    exemplars(D, P);
    selfcheck(D, P);
    root.lxLesson = { data: D, model: model };
    // demo states (core.js LX.demo): "mid" = round 1 sorted (eight right, two in a neighbouring bin) and checked;
    // "step-1" to "step-3": that sort done the same way; "step-4" to "step-6": the rewrite written (the example's words, as
    // plain text) and the example opened
    function clickText(re) { setTimeout(function () { [].forEach.call(live.querySelectorAll("button"), function (b) { if (re.test(b.textContent)) b.click(); }); }, 60); }
    LX.demo(root, function (state) {
      var m = /^step-(\d)$/.exec(state), n = state === "mid" ? 1 : m ? +m[1] : 0;
      if (!n || n > 6) return null;
      if (n <= 3) {
        var which = n === 3 ? "types" : n, placed = {}, list = cards(D, which);
        list.forEach(function (c) { placed[c.id] = c.bin; });
        placed[list[0].id] = (which === "types" ? M_TYPES : M_BINS).filter(function (b) { return b !== list[0].bin; })[0];
        placed[list[3].id] = (which === "types" ? M_TYPES : M_BINS).filter(function (b) { return b !== list[3].bin; })[1];
        LX.store.set("r1-sort-" + which, placed);
        cardsUI.go(n - 1); clickText(/^Check my sort$/);
        return { view: "sort " + which + " checked" };
      }
      var r = D.rewrites[n - 4], all = LX.store.get("r1-rewrites", {}) || {}, e = r.example;
      all[r.id] = { question: plainMarks(e.question), audience: plainMarks(e.audience), metric: plainMarks(e.metric), units: plainMarks(e.units), counterfactual: plainMarks(e.counterfactual) };
      LX.store.set("r1-rewrites", all);
      cardsUI.go(n - 1); clickText(/^Compare with an example$/);
      return { view: "rewrite " + (n - 3) + " compared" };
    }, cardsUI);
  });
})();
