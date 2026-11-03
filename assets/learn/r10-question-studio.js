/* r10-question-studio.js — research studio R10, "What could you study? The question studio" (curriculum v2 §11.3; W2,
   2026-11-03). Data: assets/learn/data/r10-question-studio.json (the pickers exactly as §11.3 lists them, draft templates
   for the five question types, the realism checks, search terms, the OpenAlex crowding counts, seven example cards, the
   exemplars and the checklist) and data/path.json (to link live lessons and name the rest as upcoming).
   Page: learn/r10-question-studio.qmd (studio form: Task, Exemplars, Self-check, Sources).
   Task (step cards): pick or spin scale, dimension, system element, lever, stakeholder and an optional twist (a "road
   less travelled" toggle weights the element spin towards smaller keyword clusters, to diversify suggestions only);
   choose a question type and see a draft; write the question on a card (LX.QuestionCard: the seven rigour checks); answer
   five realism checks (pass, warn or block, each with the lesson that helps); get search strings for OpenAlex and note
   the three closest papers; copy everything.
   Rules (§11.3, §20): the studio makes no originality judgement (no combination is called new, hot or a gap; counts are
   context only); the pickers' lists contain no excluded topic, so no spin or draft can produce one, and data centers
   appear only as a load ("data-center loads" in every draft); a learner may still type any question.
   Lesson links follow data/path.json through LX.lessonRef and LX.lessonRefHTML (core.js).
   Node: module.exports = the pure model (drafts, search strings, crowding, spin weights, realism states, the card's
   automatic fields, the no-JS blocks); the test is _tests/learn/test_r10-question-studio.js. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var KEYS = ["scale", "dimension", "element", "lever", "stakeholder", "twist"];
  var REQUIRED = ["scale", "dimension", "element", "lever", "stakeholder"];
  var STATES = ["pass", "warn", "block"];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function item(D, key, id) { return id ? (D.pickers[key] || []).filter(function (x) { return x.id === id; })[0] || null : null; }
  function clean(D, p) { var o = {}; KEYS.forEach(function (k) { o[k] = item(D, k, p && p[k]) ? p[k] : null; }); return o; }
  function complete(D, p) { var c = clean(D, p); return REQUIRED.every(function (k) { return !!c[k]; }); }
  function combo(D, p) {
    var c = clean(D, p);
    return KEYS.filter(function (k) { return c[k]; }).map(function (k) { var x = item(D, k, c[k]); return k === "scale" ? x.id : x.label; }).join(" · ");
  }
  // the draft question for a type: the §11.2 template filled with the picks; "[…]" marks what only the learner can supply
  function draft(D, p, type) {
    var t = D.drafts[type]; if (!t) return "";
    var c = clean(D, p), S = item(D, "scale", c.scale), M = item(D, "dimension", c.dimension), E = item(D, "element", c.element),
        L = item(D, "lever", c.lever), K = item(D, "stakeholder", c.stakeholder), T = item(D, "twist", c.twist);
    return t.replace("{metric}", M ? M.metric : "[a metric]").replace("{goal}", M ? M.goal : "[a goal]")
      .replace("{stakeholder}", K ? K.label : "[a group]").replace("{element}", E ? E.phrase : "[a system element]")
      .replace("{lever}", L ? L.phrase : "[a change]").replace("{scale}", S ? S.phrase : "[a place]").replace("{twist}", T ? " " + T.phrase : "");
  }
  // the fields the studio fills on the card (the learner's own edits win; see merge)
  function autoCard(D, p, type) {
    var c = clean(D, p), M = item(D, "dimension", c.dimension), K = item(D, "stakeholder", c.stakeholder);
    return { question: type ? draft(D, c, type) : "", type: type || "", scale: c.scale || "",
             audience: K && K.decides ? K.label : "", metric: M ? M.metric : "", units: M ? M.units : "" };
  }
  // put new automatic values only where the card is empty or still holds the previous automatic value
  function merge(card, auto, prev) {
    var out = {}; Object.keys(card || {}).forEach(function (k) { out[k] = card[k]; });
    Object.keys(auto).forEach(function (k) {
      var cur = String(out[k] || "").trim();
      if (!cur || (prev && cur === String(prev[k] || "").trim())) out[k] = auto[k];
    });
    return out;
  }
  // glossary marks (double brackets) as spans, built from parts so the build's glossary scan finds no placeholder id
  function rich(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; }); }
  function group(terms) { return terms.length > 1 ? "(" + terms.join(" OR ") + ")" : terms[0]; }
  function operators(s) { return (String(s).match(/\b(AND|OR|NOT)\b/g) || []).length; }
  // search strings for open databases: a core string, a narrow one and one for reviews (at most 5 operators each)
  function searchStrings(D, p) {
    var c = clean(D, p), E = item(D, "element", c.element), M = item(D, "dimension", c.dimension);
    if (!E || !M) return [];
    var K = item(D, "stakeholder", c.stakeholder), X = item(D, "twist", c.twist) || item(D, "lever", c.lever), out = [];
    out.push({ id: "core", label: "Core: the element and the dimension", text: group(E.terms) + " AND " + group(M.terms) });
    if (K && X) out.push({ id: "narrow", label: "Narrow: who is involved, and " + (c.twist ? "the twist" : "the lever"), text: group(E.terms) + " AND " + group(K.terms) + " AND " + group(X.terms) });
    out.push({ id: "reviews", label: "Reviews first: read one before the papers", text: group(E.terms) + " AND " + group(M.terms) + " AND review" });
    return out;
  }
  function searchURL(D, s) { return D.search.url + encodeURIComponent(s); }
  function cluster(D, id) { return D.clusters.filter(function (c) { return c.id === id; })[0] || null; }
  // crowding context for the picked element and twist (only where a keyword cluster maps to the pick)
  function crowd(D, p) {
    var c = clean(D, p), out = [];
    ["element", "twist"].forEach(function (k) {
      var x = item(D, k, c[k]), cl = x && x.cluster ? cluster(D, x.cluster) : null;
      if (cl) out.push({ key: k, label: x.label, name: cl.name, papers: cl.papers, rgi: cl.rgi });
    });
    return out;
  }
  function fmtInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function crowdText(x) {
    return "Keyword cluster “" + x.name + "”: " + fmtInt(x.papers) + " papers, 2016–2026" + (x.rgi != null ? "; RGI " + x.rgi.toFixed(2) : "; too few papers for a growth figure") + ".";
  }
  // spin weights for the elements: even, or with the road-less-travelled toggle sqrt(median count / count) for elements
  // with a cluster (fewer papers, a higher weight) and 1 for elements without one; every weight stays above zero
  function weights(D, roadLess) {
    var els = D.pickers.element, w = {};
    if (!roadLess) { els.forEach(function (e) { w[e.id] = 1; }); return w; }
    var counts = els.filter(function (e) { return e.cluster; }).map(function (e) { return cluster(D, e.cluster).papers; }).sort(function (a, b) { return a - b; });
    var mid = counts.length % 2 ? counts[(counts.length - 1) / 2] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
    els.forEach(function (e) { w[e.id] = e.cluster ? Math.sqrt(mid / cluster(D, e.cluster).papers) : 1; });
    return w;
  }
  function spin(list, rnd, w) {
    var tot = 0; list.forEach(function (x) { tot += w ? w[x.id] : 1; });
    var r = rnd() * tot;
    for (var i = 0; i < list.length; i++) { r -= w ? w[list[i].id] : 1; if (r < 0) return list[i].id; }
    return list[list.length - 1].id;
  }
  // realism: answer 0 passes, 1 warns, 2 blocks (a block marks what to fix first; it never stops a card being saved)
  function realism(D, answers) {
    return D.realism.map(function (r) {
      var a = answers ? answers[r.id] : null, s = a == null ? null : STATES[a];
      return { id: r.id, label: r.label, state: s, text: s ? r[s] : "", fix: r.fix };
    });
  }
  function realismCount(list) {
    var n = { pass: 0, warn: 0, block: 0, open: 0 };
    list.forEach(function (x) { if (x.state) n[x.state]++; else n.open++; });
    return n;
  }
  // the whole studio result as text: the card (LX.QuestionCard's text), realism, search strings and the three papers
  function summary(D, st, cardText) {
    var lines = [cardText || "", "Combination: " + (combo(D, st.picks) || "(not yet)")];
    var R = realism(D, st.realism);
    lines.push("Realism: " + R.map(function (r) { return r.label.toLowerCase() + " " + (r.state || "not answered"); }).join("; ") + ".");
    searchStrings(D, st.picks).forEach(function (s) { lines.push("Search (" + s.id + "): " + s.text); });
    (st.papers || []).forEach(function (p, i) { if (p && (String(p.t || "").trim() || String(p.d || "").trim())) lines.push("Close paper " + (i + 1) + ": " + String(p.t || "").trim() + (String(p.d || "").trim() ? " (differs: " + String(p.d).trim() + ")" : "")); });
    return lines.join("\n");
  }
  // data checks
  function check(D) {
    var out = [];
    KEYS.forEach(function (k) {
      var ids = {};
      (D.pickers[k] || []).forEach(function (x) {
        if (ids[x.id]) out.push(k + ": repeated id " + x.id); ids[x.id] = true;
        if (k !== "scale" && (!x.terms || !x.terms.length || x.terms.length > 2)) out.push(k + " " + x.id + ": one or two search terms");
        if (x.cluster && !cluster(D, x.cluster)) out.push(k + " " + x.id + ": unknown cluster");
      });
    });
    D.examples.forEach(function (e) { Object.keys(e.picks).forEach(function (k) { if (!item(D, k, e.picks[k])) out.push(e.id + ": unknown pick " + k); }); });
    return out;
  }
  // the no-JS blocks
  function staticTask(D, types) {
    var h = ['<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Picker</th><th scope="col">Options</th></tr></thead><tbody>'];
    KEYS.forEach(function (k) {
      h.push('<tr><th scope="row">' + esc(D.pickerLabels[k]) + "</th><td>" + D.pickers[k].map(function (x) { return esc(x.label) + (x.note ? " (" + esc(x.note) + ")" : ""); }).join(" · ") + "</td></tr>");
    });
    h.push("</tbody></table></div>");
    h.push('<p class="lx-eyebrow">Five types of question, and a draft for each</p><ul>');
    (types || []).forEach(function (t) { h.push("<li><strong>" + esc(t.label) + "</strong> (" + esc(t.template) + "): " + esc(D.drafts[t.id]) + " <em>Typical methods: " + esc(t.methods) + ".</em></li>"); });
    h.push("</ul>");
    h.push('<p class="lx-eyebrow">Realism checks: each passes, warns or blocks</p><ul>');
    D.realism.forEach(function (r) { h.push("<li><strong>" + esc(r.label) + ":</strong> " + esc(r.q) + "</li>"); });
    h.push("</ul>");
    return h.join("\n");
  }
  function staticExamples(D) {
    var h = ['<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Combination</th><th scope="col">Type</th><th scope="col">Question</th></tr></thead><tbody>'];
    D.examples.forEach(function (e) { h.push("<tr><td>" + esc(e.combo) + "</td><td>" + esc(e.type) + "</td><td>" + esc(e.question) + "</td></tr>"); });
    h.push("</tbody></table></div>");
    return h.join("\n");
  }
  function staticCrowding(D) {
    var h = ['<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Keyword cluster</th><th scope="col">Papers, 2016–2026</th><th scope="col">RGI</th></tr></thead><tbody>'];
    D.clusters.forEach(function (c) { h.push("<tr><td>" + esc(c.name) + '</td><td class="n">' + fmtInt(c.papers) + '</td><td class="n">' + (c.rgi == null ? "–" : c.rgi.toFixed(2)) + "</td></tr>"); });
    h.push("</tbody></table></div>");
    return h.join("\n");
  }
  // the page's no-JS blocks (the test writes and checks them): C = { types, exemplars, rubric }
  function staticBlocks(D, C) {
    return {
      task: staticTask(D, C.types),
      exemplars: C.exemplars(D.exemplars) + '\n<p class="lx-eyebrow">Seven example cards</p>\n' + staticExamples(D),
      rubric: C.rubric(D.rubric.competences) + '\n<p class="lx-eyebrow">Before you take a card to a mentor</p>\n<ul>'
        + D.checklist.map(function (c) { return "<li><b>" + rich(c.label) + ":</b> " + rich(c.text) + "</li>"; }).join("") + "</ul>",
      crowding: staticCrowding(D)
    };
  }
  var model = { KEYS: KEYS, REQUIRED: REQUIRED, item: item, clean: clean, complete: complete, combo: combo, draft: draft, autoCard: autoCard, merge: merge,
                searchStrings: searchStrings, searchURL: searchURL, operators: operators, crowd: crowd, crowdText: crowdText, cluster: cluster,
                weights: weights, spin: spin, realism: realism, realismCount: realismCount, summary: summary,
                check: check, staticTask: staticTask, staticExamples: staticExamples, staticCrowding: staticCrowding, staticBlocks: staticBlocks, rich: rich, fmtInt: fmtInt };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function injectCSS() {
    if (document.getElementById("r10-css")) return;
    H("style", { id: "r10-css", text: [
      ".r10-bar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}",
      ".r10-picks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}",
      ".r10-pick{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;align-items:end}",
      ".r10-pick label{grid-column:1/-1;font-family:var(--lx-f-display);font-weight:500;font-size:14px;color:var(--lx-ink)}",
      ".r10-pick select,.r10-lit input,.r10-lit textarea{font:inherit;font-size:15px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);width:100%;box-sizing:border-box;min-width:0}",
      ".r10-ctx{margin:0;padding:10px 12px;border-radius:10px;background:var(--lx-surface-2);font-size:14px;color:var(--lx-ink-2);display:grid;gap:4px}",
      ".r10-combo{font-family:var(--lx-f-display);font-weight:500;font-size:16px;color:var(--lx-ink)}",
      ".r10-types{display:grid;gap:8px}",
      ".r10-types button{display:grid;gap:2px;text-align:left;padding:10px 12px;border-radius:12px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font:inherit;cursor:pointer}",
      ".r10-types button b{font-family:var(--lx-f-display);font-weight:500;font-size:15.5px}.r10-types button small{font-size:13px;color:var(--lx-ink-3)}",
      ".r10-types button[aria-pressed=true]{border-color:var(--lx-accent);box-shadow:inset 0 0 0 2px var(--lx-accent)}",
      ".r10-draft{margin:0;padding:10px 12px;border-left:4px solid var(--lx-tier-4);background:var(--lx-surface-2);border-radius:0 10px 10px 0;font-size:15.5px;color:var(--lx-ink)}",
      ".r10-real{display:grid;gap:10px}",
      ".r10-real fieldset{margin:0;padding:10px 12px;border:1px solid var(--lx-line);border-radius:12px;display:grid;gap:6px;min-width:0}",
      ".r10-real legend{font-family:var(--lx-f-display);font-weight:500;font-size:15px;padding:0 4px}",
      ".r10-real .q{margin:0;font-size:14.5px;color:var(--lx-ink-2)}",
      ".r10-real .opts{display:flex;flex-wrap:wrap;gap:6px 16px}.r10-real .opts label{display:flex;gap:6px;align-items:center;font-size:14.5px}",
      ".r10-res{margin:0;display:flex;gap:6px;align-items:flex-start;font-size:14px}.r10-res .lx-ic{width:16px;height:16px;flex:none;margin-top:2px}",
      ".r10-res.pass .lx-ic{color:var(--lx-good)}.r10-res.warn .lx-ic{color:var(--lx-warn)}.r10-res.block .lx-ic{color:var(--lx-bad)}",
      ".r10-res b{font-weight:600}",
      ".r10-lit{display:grid;gap:10px}",
      ".r10-str{display:grid;gap:6px;padding:10px 12px;border:1px solid var(--lx-line);border-radius:12px}",
      ".r10-str code{font-family:var(--lx-f-mono);font-size:13px;white-space:pre-wrap;word-break:break-word;color:var(--lx-ink)}",
      ".r10-paper{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px}",
      ".r10-paper label{display:grid;gap:4px;font-size:13.5px;color:var(--lx-ink-2)}",
      ".r10-out{width:100%;box-sizing:border-box;font-family:var(--lx-f-mono);font-size:13px;padding:8px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink)}",
      ".r10-load{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}",
      ".r10-load select{font:inherit;font-size:14.5px;padding:6px 8px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);max-width:100%}",
      "@media (max-width:640px){.r10-picks,.r10-paper{grid-template-columns:minmax(0,1fr)}}"
    ].join("\n") }, document.head);
  }

  LX.mount("r10-question-studio", function (live, data, root) {
    injectCSS();
    var D = data.r10_question_studio, P = data.path, QC = LX.QuestionCard;
    var st = LX.store.get("r10-state", null) || {};
    st.picks = clean(D, st.picks || {}); st.realism = st.realism || {}; st.papers = st.papers || [{}, {}, {}]; st.auto = st.auto || null;
    function save() { LX.store.set("r10-state", st); }
    // a card already written (or opened from a shared link) lets the reader go straight on to it
    function hasCard() { var c = LX.store.get("r10-card", null); return !!(c && String(c.question || "").trim()); }
    function iconLine(cls, word, html) { return '<p class="r10-res ' + cls + '">' + LX.icon(cls === "pass" ? "check" : cls === "warn" ? "question" : "cross") + "<span><b>" + word + "</b> " + html + "</span></p>"; }
    function fixLinks(list) { return list && list.length ? " See " + list.map(function (c) { return LX.lessonRefHTML(P, c); }).join(" and ") + "." : ""; }
    // the card's automatic fields follow the picks; the learner's own edits are kept
    function syncCard() {
      var auto = autoCard(D, st.picks, st.type), cur = LX.store.get("r10-card", null) || {};
      LX.store.set("r10-card", QC.clean(merge(cur, auto, st.auto)));
      st.auto = auto; save();
    }

    var steps = [
      { text: "Pick or spin each part of a possible study. The twist is optional. Spinning only suggests: change any part you like.",
        build: function (act, api) {
          var bar = H("div", { class: "r10-bar" }, act);
          var all = H("button", { class: "lx-btn small", type: "button", text: "Spin all" }, bar);
          LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Spin settings" }, bar), { label: "Road less travelled", on: !!st.road,
            onChange: function (on) { st.road = on; save(); paintCtx(); } });
          var grid = H("div", { class: "r10-picks" }, act), sels = {};
          KEYS.forEach(function (k) {
            var w = H("div", { class: "r10-pick" }, grid), id = LX.uid("r10p");
            H("label", { for: id, text: D.pickerLabels[k] }, w);
            var sel = H("select", { id: id }, w);
            H("option", { value: "", text: k === "twist" ? "No twist" : "Pick…" }, sel);
            D.pickers[k].forEach(function (x) { H("option", { value: x.id, text: x.label + (x.note ? " (" + x.note + ")" : "") }, sel); });
            sel.value = st.picks[k] || "";
            sel.addEventListener("change", function () { st.picks[k] = sel.value || null; changed(); });
            var sp = H("button", { class: "lx-btn ghost small", type: "button", text: "Spin", "aria-label": "Spin " + D.pickerLabels[k].toLowerCase() }, w);
            sp.addEventListener("click", function () { st.picks[k] = spinOne(k); sel.value = st.picks[k]; changed(); });
            sels[k] = sel;
          });
          var ctx = H("div", { class: "r10-ctx", "aria-live": "polite" }, act);
          function spinOne(k) { return spin(D.pickers[k], Math.random, k === "element" ? weights(D, !!st.road) : null); }
          all.addEventListener("click", function () {
            KEYS.forEach(function (k) { if (k === "twist" && Math.random() < 0.5) { st.picks[k] = null; } else st.picks[k] = spinOne(k); sels[k].value = st.picks[k] || ""; });
            changed();
          });
          function paintCtx() {
            ctx.innerHTML = "";
            var c = combo(D, st.picks);
            H("span", { class: "r10-combo", text: c || "Nothing picked yet." }, ctx);
            crowd(D, st.picks).forEach(function (x) { H("span", { html: LX.rich(crowdText(x).replace("RGI", "[[relative-growth-index|RGI]]")) }, ctx); });
            H("span", { class: "lx-hint", text: st.road ? "Road less travelled is on: spins favour elements with fewer papers, to vary the suggestions. It says nothing about which question is better." :
              "Counts are context only: few papers is no evidence that a question is new, important or feasible." }, ctx);
          }
          function changed() {
            save(); paintCtx();
            if (complete(D, st.picks)) { api.done(); api.saw("Your combination: " + combo(D, st.picks) + ". Next, choose what kind of answer you want."); }
            LX.emit("layout");
          }
          paintCtx();
          if (complete(D, st.picks) || hasCard()) api.done();
        } },
      { text: "Choose the type of question. The same picks can ask how much, why, whether it worked, what will happen, or what someone should do.",
        build: function (act, api) {
          if (!complete(D, st.picks)) {
            H("p", { class: "lx-hint", text: hasCard() ? "Pick the five parts in step 1 for a new draft, or go on to the card you already have." : "Pick the five parts in step 1 first." }, act);
            if (hasCard()) api.done();
            return;
          }
          H("p", { class: "r10-combo", text: combo(D, st.picks) }, act);
          var wrap = H("div", { class: "r10-types", role: "group", "aria-label": "Five types of question" }, act), btns = {};
          var out = H("p", { class: "r10-draft", "aria-live": "polite", hidden: true }, act);
          var row = H("div", { class: "r10-bar" }, act), use = H("button", { class: "lx-btn ghost small", type: "button", hidden: true, text: "Put this draft on my card" }, row);
          var um = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
          use.addEventListener("click", function () {
            var c = LX.store.get("r10-card", null) || {}; c.question = draft(D, st.picks, st.type); LX.store.set("r10-card", QC.clean(c));
            use.hidden = true; um.textContent = "The draft is now your card's question.";
          });
          QC.TYPES.forEach(function (t) {
            var b = H("button", { type: "button", "aria-pressed": st.type === t.id ? "true" : "false" }, wrap);
            H("b", { text: t.label + ": " + t.template }, b); H("small", { text: "Typical methods: " + t.methods + "." }, b);
            b.addEventListener("click", function () { pick(t.id, true); });
            btns[t.id] = b;
          });
          function pick(id, byReader) {
            st.type = id; if (byReader) syncCard(); else save();
            Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === id ? "true" : "false"); });
            out.hidden = false; out.textContent = "Draft: " + draft(D, st.picks, id);
            // the card keeps a question the reader wrote; offer the draft instead of overwriting it
            var cq = String((LX.store.get("r10-card", null) || {}).question || "").trim();
            use.hidden = !cq || cq === draft(D, st.picks, id); um.textContent = "";
            api.done();
            api.saw("A draft, not your question yet. Next, rewrite it on the card: replace each bracket and make the metric your own.");
          }
          if (st.type) pick(st.type, false);
        } },
      { text: "Write your question on the card. The studio filled what it could; the checks show what is still to do. They judge rigour, never originality.",
        build: function (act, api) {
          if (st.type) syncCard();
          var fix = {}, map = { type: "R1", audience: "R1", metric: "R1", counterfactual: "R1", wrong: "R1", scale: "R3", uncertainty: "R6" };
          Object.keys(map).forEach(function (k) { var r = LX.lessonRef(P, map[k]); if (r.ready) fix[k] = { href: r.href, label: r.label }; });
          // a #q- link is applied once by the card itself (kept as the draft, the hash dropped), so coming back to this
          // step shows the reader's edits rather than the link's card again
          var qc = LX.QuestionCard(act, { id: "r10-card", code: "R10", share: true, fix: fix, onChange: status });
          function status(v, c) {
            var q = (v || qc.get()).question, written = /\?\s*$/.test(q) && q.indexOf("[") < 0;
            if (written) { api.done(); api.saw((c || qc.checks()).pass + " of 8 checks pass. Next, ask whether the study could really be done."); }
            else api.saw("Replace the brackets [ ] in the draft with your own words, and end with a question mark.", true);
          }
          status(null, null);
        } },
      { text: "Run five realism checks. Answer honestly: a warning or a block does not stop you, it shows what to fix first.",
        build: function (act, api) {
          var wrap = H("div", { class: "r10-real" }, act), res = {};
          var sum = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          D.realism.forEach(function (r) {
            var fs = H("fieldset", null, wrap), name = LX.uid("r10r"); H("legend", { text: r.label }, fs);
            H("p", { class: "q", text: r.q }, fs);
            var opts = H("div", { class: "opts" }, fs);
            r.answers.forEach(function (a, i) {
              var lab = H("label", null, opts), inp = H("input", { type: "radio", name: name, value: String(i) }, lab);
              lab.appendChild(document.createTextNode(a));
              inp.checked = st.realism[r.id] === i;
              inp.addEventListener("change", function () { if (inp.checked) { st.realism[r.id] = i; save(); paint(); } });
            });
            res[r.id] = H("div", { "aria-live": "polite" }, fs);
          });
          function paint() {
            var R = realism(D, st.realism);
            R.forEach(function (x) {
              res[x.id].innerHTML = !x.state ? "" : iconLine(x.state, x.state === "pass" ? "Passes." : x.state === "warn" ? "Warns." : "Blocks.",
                LX.esc(x.text) + (x.state === "pass" ? "" : fixLinks(x.fix)));
            });
            var n = realismCount(R);
            sum.textContent = n.open ? (5 - n.open) + " of 5 answered." : n.pass + " pass, " + n.warn + " warn, " + n.block + " block.";
            if (!n.open) { api.done(); api.saw(n.block ? "Fix what blocks first; then the warnings. A block does not stop you saving the card." : n.warn ? "No blocks. Work on the warnings as you read." : "All five pass, as far as you can tell now. A mentor may see more."); }
            LX.emit("layout");
          }
          paint();
        } },
      { text: "Find out what is already known. Run these [[search-string|search strings]], then note the three closest papers and how your card differs from each.",
        free: true,
        build: function (act, api) {
          var lit = H("div", { class: "r10-lit" }, act), S = searchStrings(D, st.picks);
          if (!S.length) H("p", { class: "lx-hint", text: "Pick an element and a dimension in step 1 to get search strings." }, lit);
          S.forEach(function (s) {
            var box = H("div", { class: "r10-str" }, lit);
            H("p", { class: "lx-eyebrow", text: s.label }, box);
            H("code", { text: s.text }, box);
            var row = H("div", { class: "r10-bar" }, box);
            var cp = H("button", { class: "lx-btn ghost small", type: "button", text: "Copy" }, row);
            H("a", { href: searchURL(D, s.text), target: "_blank", rel: "noopener", text: "Search OpenAlex" }, row);
            var m = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
            cp.addEventListener("click", function () { LX.copyText(s.text).then(function (ok) { m.textContent = ok ? "Copied." : "Select the string and copy it."; }); });
          });
          H("p", { class: "lx-hint", text: D.search.note + " Link format checked on " + D.search.checked + "." }, lit);
          H("p", { class: "lx-eyebrow", text: "The three closest papers" }, lit);
          [0, 1, 2].forEach(function (i) {
            var row = H("div", { class: "r10-paper" }, lit), p = st.papers[i] = st.papers[i] || {};
            var l1 = H("label", null, row); l1.appendChild(document.createTextNode("Paper " + (i + 1) + ": title or DOI"));
            var a = H("input", { type: "text", maxlength: "300" }, l1); a.value = p.t || "";
            var l2 = H("label", null, row); l2.appendChild(document.createTextNode("How your card differs"));
            var b = H("input", { type: "text", maxlength: "300" }, l2); b.value = p.d || "";
            a.addEventListener("input", function () { p.t = a.value; save(); });
            b.addEventListener("input", function () { p.d = b.value; save(); });
          });
          var ctx = H("div", { class: "r10-ctx" }, lit);
          crowd(D, st.picks).forEach(function (x) { H("span", { html: LX.rich(crowdText(x).replace("RGI", "[[relative-growth-index|RGI]]")) }, ctx); });
          H("span", { text: D.crowding.caveat }, ctx);
          var r2 = LX.lessonRef(P, "R2");
          api.saw("The studio makes no originality judgement. Read the closest papers yourself; " + (r2.ready ? "R2" : "R2, upcoming,") + " shows how to map them.");
        } },
      { text: "Save your work. Copy the card, the checks, the search strings and your three papers into your notes, or share the card as a link from step 3.",
        free: true,
        build: function (act, api) {
          var txt = summary(D, st, QC.text(LX.store.get("r10-card", null) || {}, { code: "R10" }));
          var ta = H("textarea", { class: "r10-out", readonly: true, rows: "14", "aria-label": "Your question card, checks and search strings as text" }, act);
          ta.value = txt;
          var row = H("div", { class: "r10-bar" }, act);
          var cp = H("button", { class: "lx-btn small", type: "button", text: "Copy everything" }, row);
          var m = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
          cp.addEventListener("click", function () { LX.copyText(txt, { select: ta }).then(function (ok) { m.textContent = ok ? "Copied to the clipboard." : "Select the text and copy it."; }); });
          var r2 = LX.lessonRef(P, "R2");
          api.saw("Take the card to " + (r2.ready ? "R2" : "R2 (upcoming)") + " to map the literature, and to R3 to choose the system, boundary and method.");
        } }
    ];
    var cardsUI = LX.StepCards(live, { id: "r10-steps", steps: steps });

    // ---- exemplars and the example cards (e-table), with "load into the studio"
    var ex = document.getElementById("r10-exemplars");
    if (ex) {
      ex.innerHTML = "";
      LX.Exemplars(H("div", { class: "lx-xcard" }, ex), D.exemplars);
      var c2 = H("div", { class: "lx-xcard" }, ex);
      LX.CompareTable(c2, { title: "Seven example cards", text: true,
        columns: [{ key: "name", label: "Combination", main: true }, { key: "type", label: "Type" }, { key: "question", label: "Question" }],
        rows: D.examples.map(function (e, i) { return { key: e.id, name: (i + 1) + ". " + e.combo, type: e.type, question: e.question }; }),
        caption: "Illustrative cards, one per row. Load one to see how the studio fills a card, then make it your own." });
      var load = H("div", { class: "r10-load" }, c2), lid = LX.uid("r10l");
      H("label", { for: lid, text: "Example" }, load);
      var sel = H("select", { id: lid }, load);
      D.examples.forEach(function (e, i) { H("option", { value: e.id, text: "Example " + (i + 1) + " (" + e.type + ")" }, sel); });
      var lb = H("button", { class: "lx-btn ghost small", type: "button", text: "Load into the studio" }, load);
      var lm = H("span", { class: "lx-hint", "aria-live": "polite" }, load);
      lb.addEventListener("click", function () {
        var e = D.examples.filter(function (x) { return x.id === sel.value; })[0];
        st.picks = clean(D, e.picks); st.type = e.type;
        var auto = autoCard(D, st.picks, e.type); auto.question = e.question;
        var cur = LX.store.get("r10-card", null) || {};
        ["question", "type", "scale", "audience", "metric", "units"].forEach(function (k) { cur[k] = auto[k]; });
        LX.store.set("r10-card", QC.clean(cur)); st.auto = auto; save();
        lm.textContent = "Loaded: the card's question, type, scale, audience and metric now come from example " + e.id.slice(1) + ".";
        cardsUI.go(2);
        var t = document.getElementById("task"); if (t) t.scrollIntoView({ behavior: LX.reduced() ? "auto" : "smooth" });
      });
    }

    // ---- self-check: the rubric and the checklist
    var sc = document.getElementById("r10-rubric");
    if (sc) {
      sc.innerHTML = "";
      LX.Rubric(H("div", { class: "lx-xcard" }, sc), D.rubric);
      LX.Checklist(H("div", { class: "lx-xcard" }, sc), { id: "r10-checklist", title: "Before you take a card to a mentor", columns: 2,
        lede: "Twelve things a mentor will ask about. None of them is “is it new?”: that takes reading, not a checklist.",
        doneText: "Book the conversation.", items: D.checklist });
    }
    root.lxLesson = { data: D, model: model };
    // a shared card (#q-...) opens on the card step
    if (QC.decode(location.hash)) cardsUI.go(2);
    // demo states: "mid" = the exemplar's spin picked (step 1 with the crowding line); "card" = its card (step 3);
    // "real" = the realism checks answered (step 4); "lit" = the search strings (step 5); "step-N" = steps 1-6 the same way
    LX.demo(root, function (state) {
      var m = /^step-(\d)$/.exec(state), n = { mid: 1, card: 3, real: 4, lit: 5 }[state] || (m ? +m[1] : 0);
      if (!n || n > 6) return null;
      st.picks = clean(D, { scale: "S3", dimension: "SOC", element: "heatpumps", lever: "tech", stakeholder: "renters", twist: "heatwave" });
      if (n >= 2) { st.type = "predictive"; syncCard(); }
      if (n >= 4) st.realism = { data: 1, physics: 0, institutions: 1, scope: 0, people: 2 };
      save();
      cardsUI.go(n - 1);
      return { view: "the exemplar's spin, step " + n };
    }, cardsUI);
  });
})();
