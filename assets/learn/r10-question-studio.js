/* r10-question-studio.js — research studio R10, "What could you study? The question studio".
   Data: assets/learn/data/r10-question-studio.json (the pickers exactly as the course plan lists them, draft templates
   for the five question types, the realism checks, search terms, the OpenAlex crowding counts, seven example cards, the
   exemplars and the checklist) and data/path.json (to link live lessons and name the rest as upcoming).
   Page: learn/r10-question-studio.qmd (studio form: Task, Exemplars, Self-check, Sources).
   Task (step cards): pick or spin scale, dimension, system element, lever, stakeholder and an optional twist (a "road
   less travelled" toggle weights the element spin towards smaller keyword clusters, to diversify suggestions only);
   choose a question type and see a draft; write the question on a card (LX.QuestionCard: its checks show which parts are
   filled in; rigour is judged with the rubric); answer five realism checks (pass, warn or block, each with the lesson that
   helps, and a line for the evidence); get three search strings and run them on a dated OpenAlex snapshot
   (assets/learn/data/r10-question-studio-openalex.json, from its data build step: for each system element, the most-cited
   works whose titles or abstracts match the element's block, metadata only), searched in this page: each string's other
   blocks are matched in the titles and OpenAlex keywords (a review also by its type), and the reader can filter the same
   collection with words of their own; a link repeats a string on OpenAlex today, as an optional rerun whose results differ from the snapshot's
   date. Note the three closest papers; copy everything. When the picks or the card's question change after the realism
   answers or the paper notes were written, those steps say so, to review them.
   Example cards: loading one starts a fresh card with that example's own picks and card fields (an element, stakeholder
   or dimension outside the pickers comes as an example "extra" with its own search terms); realism answers and papers
   start empty, and the previous work is kept, to restore with one button.
   Rules: the studio makes no originality judgement (no combination is called new, hot or a gap; counts are
   context only); the pickers' lists contain no excluded topic, so no spin or draft can produce one, and data centers
   appear only as a load ("data-center loads" in every draft); a learner may still type any question. The audience is
   filled in only for a prescriptive draft, which names the stakeholder as the one who acts; for the other types the
   learner says who would use the answer.
   Lesson links follow data/path.json through LX.lessonRef and LX.lessonRefHTML (core.js).
   Node: module.exports = the pure model (drafts, search strings, crowding, spin weights, realism states, the card's
   automatic fields and how they follow the picks, the example cards, the no-JS blocks); the test is
   _tests/learn/test_r10-question-studio.js. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var KEYS = ["scale", "dimension", "element", "lever", "stakeholder", "twist"];
  var REQUIRED = ["scale", "dimension", "element", "lever", "stakeholder"];
  var STATES = ["pass", "warn", "block"];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function item(D, key, id) { return id ? (D.pickers[key] || []).filter(function (x) { return x.id === id; })[0] || null : null; }
  // the picks, and an example's extras: a part outside the pickers' lists ({label, phrase, terms, metric, units, goal}),
  // used only while that slot has no pick of its own
  function clean(D, p) {
    var o = {}, x = {};
    KEYS.forEach(function (k) {
      o[k] = item(D, k, p && p[k]) ? p[k] : null;
      var e = p && p.extra && p.extra[k];
      if (!o[k] && e && e.label && e.terms && e.terms.length) x[k] = e;
    });
    if (Object.keys(x).length) o.extra = x;
    return o;
  }
  function slot(D, c, k) { return item(D, k, c[k]) || (c.extra && c.extra[k]) || null; }
  function complete(D, p) { var c = clean(D, p); return REQUIRED.every(function (k) { return !!slot(D, c, k); }); }
  function combo(D, p) {
    var c = clean(D, p);
    return KEYS.filter(function (k) { return slot(D, c, k); }).map(function (k) { var x = slot(D, c, k); return k === "scale" && c[k] ? x.id : x.label; }).join(" · ");
  }
  // the draft question for a type: the question type's template filled with the picks; "[…]" marks what only the learner can supply
  function draft(D, p, type) {
    var t = D.drafts[type]; if (!t) return "";
    var c = clean(D, p), S = slot(D, c, "scale"), M = slot(D, c, "dimension"), E = slot(D, c, "element"),
        L = slot(D, c, "lever"), K = slot(D, c, "stakeholder"), T = slot(D, c, "twist");
    return t.replace("{metric}", M ? M.metric : "[a metric]").replace("{goal}", M ? M.goal : "[a goal]")
      .replace("{stakeholder}", K ? K.label : "[a group]").replace("{element}", E ? E.phrase || E.label : "[a system element]")
      .replace("{lever}", L ? L.phrase : "[a change]").replace("{scale}", S ? S.phrase : "[a place]").replace("{twist}", T ? " " + T.phrase : "");
  }
  // the fields the studio fills on the card (the learner's own edits win; see sync). The audience comes only with a
  // prescriptive draft, which names the stakeholder as the one who acts; otherwise the learner names who would use the
  // answer (an affected group can be that audience, with a stated use).
  function autoCard(D, p, type) {
    var c = clean(D, p), M = slot(D, c, "dimension"), K = slot(D, c, "stakeholder");
    return { question: type ? draft(D, c, type) : "", type: type || "", scale: c.scale || "",
             audience: K && type === "prescriptive" ? K.label : "", metric: M ? M.metric : "", units: M ? M.units : "" };
  }
  function trim(v) { return String(v == null ? "" : v).trim(); }
  // the card's automatic fields follow the picks: a field takes the new automatic value when it is empty, or when the
  // automatic value changed (gen against prevGen, the values for the previous picks) and the card still holds what the
  // studio last put there (put: prevGen, or an example's own fields). The learner's edits always stay.
  // Returns { card, put } (put: what the studio has now put in each field).
  function sync(card, gen, prevGen, put) {
    var out = {}, now = {}; put = put || prevGen || {};
    Object.keys(card || {}).forEach(function (k) { out[k] = card[k]; });
    Object.keys(put).forEach(function (k) { now[k] = put[k]; });
    Object.keys(gen).forEach(function (k) {
      var cur = trim(out[k]);
      if ((!cur && gen[k]) || (prevGen && gen[k] !== prevGen[k] && cur === trim(put[k]))) { out[k] = gen[k]; now[k] = gen[k]; }
    });
    return { card: out, put: now };
  }
  function example(D, id) { return D.examples.filter(function (e) { return e.id === id; })[0] || null; }
  // an example's type as the tables show it: typeLabel when the question has a second part of another type (example 5,
  // "predictive, with a prescriptive follow-up"); the card itself takes the main type, e.type
  function typeLabel(e) { return e.typeLabel || e.type; }
  // an example's picks (with its extras) and its own card: the question, type and scale, and the audience, metric and
  // units written for that question; every other part starts empty
  function examplePicks(D, e) { var p = {}; Object.keys(e.picks).forEach(function (k) { p[k] = e.picks[k]; }); p.extra = e.extra; return clean(D, p); }
  function exampleCard(D, e) {
    var c = e.card || {};
    return { question: e.question, type: e.type, audience: c.audience || "", metric: c.metric || "", units: c.units || "", counterfactual: "",
             scale: e.picks.scale || "", boundary: "", wrong: "", uncertainty: "" };
  }
  // glossary marks (double brackets) as spans, built from parts so the build's glossary scan finds no placeholder id
  function rich(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; }); }
  function group(terms) { return terms.length > 1 ? "(" + terms.join(" OR ") + ")" : terms[0]; }
  function bare(t) { return String(t).replace(/"/g, "").toLowerCase(); }
  function operators(s) { return (String(s).match(/\b(AND|OR|NOT)\b/g) || []).length; }
  // search strings for open databases: a core string, a narrow one and one for reviews (at most 5 operators each)
  function searchStrings(D, p) {
    var c = clean(D, p), E = slot(D, c, "element"), M = slot(D, c, "dimension");
    if (!E || !M) return [];
    var K = slot(D, c, "stakeholder"), tw = slot(D, c, "twist"), X = tw || slot(D, c, "lever"), out = [];
    // need: the blocks after the element's, as plain lowercase terms (the snapshot holds the element's works already)
    out.push({ id: "core", label: "Core: the element and the dimension", text: group(E.terms) + " AND " + group(M.terms), need: [M.terms.map(bare)] });
    if (K && X) out.push({ id: "narrow", label: "Narrow: who is involved, and " + (tw ? "the twist" : "the lever"), text: group(E.terms) + " AND " + group(K.terms) + " AND " + group(X.terms),
      need: [K.terms.map(bare), X.terms.map(bare)] });
    out.push({ id: "reviews", label: "Reviews first: read one before the papers", text: "review AND " + group(E.terms) + " AND " + group(M.terms), need: [M.terms.map(bare)], review: true });
    return out;
  }
  // ---- the dated snapshot (S: r10-question-studio-openalex.json): the picked element's collection, searched here
  // works: [openalex id, doi, title, year, citations, venue index, review (1) or not (0), keyword indices], most-cited first
  function snapElement(S, D, p) {
    var c = clean(D, p), x = item(D, "element", c.element), e = slot(D, c, "element");
    if (!S || !e) return null;
    return S.elements.filter(function (r) { return x ? r.id === x.id : !!(c.extra && c.extra.element) && r.label === e.label; })[0] || null;
  }
  // a work's searchable text: its title and its OpenAlex keywords (S.keywords, by index), in lower case
  function hay(S, w) { return (String(w[2]) + " | " + (w[7] || []).map(function (k) { return S && S.keywords ? S.keywords[k] : ""; }).join(" | ")).toLowerCase(); }
  // a block matches when one of its terms appears in the title or a keyword (anywhere, so "price" also finds "prices");
  // "review" matches a work OpenAlex types as a review, or a title with the word
  function inWork(S, w, terms) { var t = hay(S, w); return terms.some(function (x) { return t.indexOf(x) >= 0; }); }
  function localMatches(el, s, S) {
    if (!el || !s) return [];
    return el.works.filter(function (w) {
      return (s.need || []).every(function (b) { return inWork(S, w, b); }) && (!s.review || w[6] === 1 || /review/i.test(w[2]));
    });
  }
  // the reader's own words: every word of three letters or more in the title or a keyword
  function ownMatches(el, text, S) {
    var ws = String(text || "").toLowerCase().replace(/["()]/g, " ").split(/\s+/).filter(function (w) { return w.length >= 3 && !/^(and|not|the|for|with|from|into)$/.test(w); });
    if (!el || !ws.length) return [];
    return el.works.filter(function (w) { var t = hay(S, w); return ws.every(function (x) { return t.indexOf(x) >= 0; }); });
  }
  function workRef(S, w) {
    var v = S.venues[w[5]];
    return w[2] + " (" + w[3] + (v ? ", " + v : "") + ")" + (w[1] ? ", doi:" + w[1] : ", OpenAlex " + w[0]);
  }
  function workURL(w) { return w[1] ? "https://doi.org/" + w[1] : "https://openalex.org/" + w[0]; }
  function snapDate(S) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(S.meta.as_of), M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return m ? +m[3] + " " + M[+m[2] - 1] + " " + m[1] : S.meta.as_of;
  }
  function snapLine(S, el, s, n) {
    var one = n === 1;
    return n + " of the " + el.works.length + " works " + (one ? "has" : "have") + " these words in " + (one ? "its title or keywords" : "their titles or keywords") +
      (s.review ? (one ? " and is a review" : " and are reviews") : "") + ".";
  }
  // what the element's collection is: its date, size and source, and what was left out
  function snapAbout(S, el) {
    var out = el.top - el.works.length;
    return "Snapshot: OpenAlex, retrieved " + snapDate(S) + ": the " + el.top + " most-cited works since 2016 on " + el.label + ", of " + fmtInt(el.count) + " matched" +
      (out ? " (" + out + " outside the course's scope left out)" : "") + ". The other blocks are matched in titles and OpenAlex keywords.";
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
  // realism: answer 0 passes, 1 warns, 2 blocks (a block marks what to fix first; it never stops a card being saved);
  // evidence: what the learner wrote under each check (a dataset, a rule, a plan)
  function realism(D, answers, evidence) {
    return D.realism.map(function (r) {
      var a = answers ? answers[r.id] : null, s = a == null ? null : STATES[a];
      return { id: r.id, label: r.label, state: s, text: s ? r[s] : "", fix: r.fix, evidence: trim(evidence && evidence[r.id]) };
    });
  }
  function realismCount(list) {
    var n = { pass: 0, warn: 0, block: 0, open: 0 };
    list.forEach(function (x) { if (x.state) n[x.state]++; else n.open++; });
    return n;
  }
  // what the realism answers and paper notes were written for: the combination and the card's question. When it changes
  // afterwards, those steps ask the reader to review them (searches and notes follow the question, not only the picks)
  function basis(D, picks, question) { return JSON.stringify([combo(D, picks), trim(question)]); }
  // the whole studio result as text: the card (LX.QuestionCard's text), realism, search strings (with their counts in the
  // snapshot S, when given) and the three papers
  function summary(D, st, cardText, S) {
    var lines = [cardText || "", "Combination: " + (combo(D, st.picks) || "(not yet)")];
    realism(D, st.realism, st.evidence).forEach(function (r) {
      lines.push("Realism, " + r.label.toLowerCase() + ": " + (r.state || "not answered") + (r.evidence ? "; evidence: " + r.evidence : ""));
    });
    var el = S ? snapElement(S, D, st.picks) : null;
    searchStrings(D, st.picks).forEach(function (s) {
      lines.push("Search (" + s.id + "): " + s.text + (el ? " · in the OpenAlex snapshot of " + snapDate(S) + ": " + localMatches(el, s, S).length + " of " + el.works.length + " works" : ""));
    });
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
    D.examples.forEach(function (e) {
      Object.keys(e.picks).forEach(function (k) { if (!item(D, k, e.picks[k])) out.push(e.id + ": unknown pick " + k); });
      Object.keys(e.extra || {}).forEach(function (k) {
        var x = e.extra[k];
        if (KEYS.indexOf(k) < 0 || e.picks[k] || !x.label || !x.terms || !x.terms.length || x.terms.length > 2) out.push(e.id + ": extra " + k + " needs a label and one or two search terms, for a slot without a pick");
      });
      var p = examplePicks(D, e);
      if (!complete(D, p)) out.push(e.id + ": the example leaves a required part empty");
      if (searchStrings(D, p).length !== 3) out.push(e.id + ": the example gives " + searchStrings(D, p).length + " search strings, not three");
      ["audience", "metric", "units"].forEach(function (k) { if (!trim((e.card || {})[k])) out.push(e.id + ": the example card has no " + k); });
    });
    return out;
  }
  // the no-JS blocks
  function staticTask(D, types) {
    var h = ['<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Picker</th><th scope="col">Options</th></tr></thead><tbody>'];
    KEYS.forEach(function (k) {
      h.push('<tr><th scope="row">' + esc(D.pickerLabels[k]) + "</th><td>" + D.pickers[k].map(function (x) { return esc(x.label) + (x.note ? " (" + esc(x.note) + ")" : "") + (x.def ? " (" + esc(x.def) + ")" : ""); }).join(" · ") + "</td></tr>");
    });
    h.push("</tbody></table></div>");
    h.push('<p class="lx-eyebrow">Five types of question, and a draft for each</p>');
    h.push('<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Type</th><th scope="col">Template</th><th scope="col">Draft from the picks</th><th scope="col">Typical methods</th></tr></thead><tbody>');
    (types || []).forEach(function (t) { h.push('<tr><th scope="row">' + esc(t.label) + "</th><td>" + esc(t.template) + "</td><td>" + esc(D.drafts[t.id]) + "</td><td>" + rich(methodsMarked(D, t.methods)) + "</td></tr>"); });
    h.push("</tbody></table></div>");
    if (D.terms) h.push('<p class="lx-hint">Words used here: ' + rich(D.terms) + "</p>");
    h.push('<p class="lx-eyebrow">Realism checks: each passes, warns or blocks</p><ul>');
    D.realism.forEach(function (r) { h.push("<li><strong>" + esc(r.label) + ":</strong> " + esc(r.q) + " <em>Note: " + esc(r.evidence.charAt(0).toLowerCase() + r.evidence.slice(1)) + ".</em></li>"); });
    h.push("</ul>");
    return h.join("\n");
  }
  function staticExamples(D) {
    var h = ['<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Combination</th><th scope="col">Type</th><th scope="col">Question</th></tr></thead><tbody>'];
    D.examples.forEach(function (e) { h.push("<tr><td>" + esc(e.combo) + "</td><td>" + esc(typeLabel(e)) + "</td><td>" + esc(e.question) + "</td></tr>"); });
    h.push("</tbody></table></div>");
    return h.join("\n");
  }
  function staticCrowding(D) {
    var h = ['<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Keyword cluster</th><th scope="col">Papers, 2016–2026</th><th scope="col">RGI</th></tr></thead><tbody>'];
    D.clusters.forEach(function (c) { h.push("<tr><td>" + esc(c.name) + '</td><td class="n">' + fmtInt(c.papers) + '</td><td class="n">' + (c.rgi == null ? "–" : c.rgi.toFixed(2)) + "</td></tr>"); });
    h.push("</tbody></table></div>");
    h.push("<ul>" + D.crowding.caveats.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>");
    return h.join("\n");
  }
  // the literature step for readers without JavaScript: one spin (D.litPicks) worked on the snapshot, with the recipe for
  // the three strings and a paper record to copy
  function staticLit(D, S) {
    var p = clean(D, D.litPicks), el = snapElement(S, D, p), h = [];
    h.push('<p class="lx-eyebrow">Three searches, worked for one spin</p>');
    h.push('<p class="lx-hint">' + esc(combo(D, p)) + "</p>");
    h.push('<ul><li><b>Core:</b> the element\'s block AND the dimension\'s.</li><li><b>Narrow:</b> the element AND the stakeholder AND the twist, or the lever.</li><li><b>Reviews:</b> the word review AND the core string.</li></ul>');
    h.push('<p class="lx-hint">' + esc(snapAbout(S, el)) + "</p>");
    searchStrings(D, p).forEach(function (s) {
      var m = localMatches(el, s, S);
      h.push('<div class="r10-str"><p><b>' + esc(s.label.split(":")[0]) + ":</b> <code>" + esc(s.text) + '</code></p><p class="lx-hint">' + esc(snapLine(S, el, s, m.length)) + "</p>" +
        (m.length ? '<ul class="r10-hits">' + m.slice(0, 3).map(function (w) { return '<li><a href="' + esc(workURL(w)) + '">' + esc(w[2]) + "</a> (" + w[3] + ")</li>"; }).join("") + "</ul>"
          : '<p class="lx-hint">None: drop a block, or search a database yourself and record the date.</p>') + "</div>");
    });
    h.push("<p><b>A paper record, three times:</b> title or DOI; how your card differs from it.</p>");
    return h.join("\n");
  }
  // a type's typical methods with glossary marks on the method names the glossary explains (D.methodTerms)
  function methodsMarked(D, methods) {
    var T = D.methodTerms || {}, keys = Object.keys(T).sort(function (a, b) { return b.length - a.length; });
    if (!keys.length) return String(methods);
    var re = new RegExp(keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|"), "g");
    return String(methods).replace(re, function (w) { return "[[" + T[w] + "|" + w + "]]"; });
  }
  // the page's no-JS blocks (the test writes and checks them): C = { types, exemplars, rubric }
  function staticBlocks(D, C, S) {
    return {
      lit: S ? staticLit(D, S) : "",
      task: staticTask(D, C.types),
      exemplars: C.exemplars(D.exemplars) + '\n<p class="lx-eyebrow">Seven example cards</p>\n' + staticExamples(D),
      rubric: C.rubric(D.rubric.competences) + '\n<p class="lx-eyebrow">Before you take a card to a mentor</p>\n<ul>'
        + D.checklist.map(function (c) { return "<li><b>" + rich(c.label) + ":</b> " + rich(c.text) + "</li>"; }).join("") + "</ul>",
      crowding: staticCrowding(D)
    };
  }
  var model = { KEYS: KEYS, REQUIRED: REQUIRED, item: item, slot: slot, clean: clean, complete: complete, combo: combo, draft: draft, autoCard: autoCard, sync: sync,
                example: example, typeLabel: typeLabel, examplePicks: examplePicks, exampleCard: exampleCard, methodsMarked: methodsMarked,
                searchStrings: searchStrings, searchURL: searchURL, snapElement: snapElement, localMatches: localMatches, ownMatches: ownMatches,
                workRef: workRef, workURL: workURL, snapDate: snapDate, snapLine: snapLine, snapAbout: snapAbout, staticLit: staticLit, basis: basis, operators: operators, crowd: crowd, crowdText: crowdText, cluster: cluster,
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
      ".r10-pick .r10-def{grid-column:1/-1;margin:0}",
      ".r10-hits{margin:0;padding-left:1.1rem;display:grid;gap:6px;font-size:14px;color:var(--lx-ink-2)}",
      ".r10-hits li{overflow-wrap:anywhere}.r10-hits button{margin-left:6px}",
      ".r10-own{display:grid;gap:4px;font-size:13.5px;color:var(--lx-ink-2)}",
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
      ".r10-real .ev{display:grid;gap:4px;font-size:13.5px;color:var(--lx-ink-2)}",
      ".r10-real .ev input{font:inherit;font-size:15px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);width:100%;box-sizing:border-box;min-width:0}",
      ".r10-res{margin:0;display:flex;gap:6px;align-items:flex-start;font-size:14px}.r10-res .lx-ic{width:16px;height:16px;flex:none;margin-top:2px}",
      ".r10-res.pass .lx-ic{color:var(--lx-good)}.r10-res.warn .lx-ic{color:var(--lx-warn)}.r10-res.block .lx-ic{color:var(--lx-bad)}",
      ".r10-res b{font-weight:600}",
      ".r10-lit{display:grid;gap:10px}",
      ".r10-str{display:grid;gap:6px;padding:10px 12px;border:1px solid var(--lx-line);border-radius:12px}",
      ".r10-str code{font-family:var(--lx-f-mono);font-size:13px;white-space:pre-wrap;word-break:break-word;padding:6px 8px;border-radius:8px}",
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
    var st = LX.store.get("r10-state", null) || {}, SNAP_URL = LX.base + "data/r10-question-studio-openalex.json", snap = null;
    st.picks = clean(D, st.picks || {}); st.realism = st.realism || {}; st.evidence = st.evidence || {}; st.papers = st.papers || [{}, {}, {}]; st.auto = st.auto || null;
    function save() { LX.store.set("r10-state", st); }
    function key() { return JSON.stringify([st.picks, st.type || null]); }
    // a card already written (or opened from a shared link) lets the reader go straight on to it
    function hasCard() { var c = LX.store.get("r10-card", null); return !!(c && String(c.question || "").trim()); }
    function cardQ() { return String((LX.store.get("r10-card", null) || {}).question || "").trim(); }
    function nowBasis() { return basis(D, st.picks, cardQ()); }
    // a notice when the picks or the card's question changed after this step's answers were written (st[k]: the basis
    // they were written for); "Reviewed" takes the new basis
    function stale(host, k, text) {
      if (!st[k] || st[k] === nowBasis()) return;
      var n = H("div", { class: "lx-saw no", role: "status" }, host);
      n.innerHTML = LX.icon("question") + "<div>" + LX.esc(text) + "</div>";
      var b = H("button", { class: "lx-btn ghost small", type: "button", text: "Reviewed: keep them" }, n.lastChild);
      b.addEventListener("click", function () { st[k] = nowBasis(); save(); n.remove(); LX.emit("layout"); });
    }
    function iconLine(cls, word, html) { return '<p class="r10-res ' + cls + '">' + LX.icon(cls === "pass" ? "check" : cls === "warn" ? "question" : "cross") + "<span><b>" + word + "</b> " + html + "</span></p>"; }
    function fixLinks(list) { return list && list.length ? " See " + list.map(function (c) { return LX.lessonRefHTML(P, c); }).join(" and ") + "." : ""; }
    // the card's automatic fields follow the picks (only when the picks or the type changed); the learner's edits stay
    function syncCard() {
      if (st.autoKey === key()) return;
      var gen = autoCard(D, st.picks, st.type), prev = st.autoFrom ? autoCard(D, st.autoFrom.picks, st.autoFrom.type) : null;
      var r = sync(LX.store.get("r10-card", null) || {}, gen, prev, st.auto);
      LX.store.set("r10-card", QC.clean(r.card));
      st.auto = r.put; st.autoFrom = { picks: st.picks, type: st.type || null }; st.autoKey = key(); save();
    }

    var steps = [
      { text: "Pick or spin each part of a possible study; the twist is optional. Spinning only suggests: change any part you like.",
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
            sel.addEventListener("change", function () { st.picks[k] = sel.value || null; dropExtra(k); changed(); paintDef(); });
            var sp = H("button", { class: "lx-btn ghost small", type: "button", text: "Spin", "aria-label": "Spin " + D.pickerLabels[k].toLowerCase() }, w);
            sp.addEventListener("click", function () { st.picks[k] = spinOne(k); sel.value = st.picks[k]; dropExtra(k); changed(); paintDef(); });
            // a native option holds plain text: the chosen option's meaning shows under the picker
            var def = H("p", { class: "lx-hint r10-def", "aria-live": "polite", id: id + "-d" }, w);
            sel.setAttribute("aria-describedby", def.id);
            function paintDef() { var x = item(D, k, sel.value); def.textContent = x && x.def ? x.label.charAt(0).toUpperCase() + x.label.slice(1) + ": " + x.def + "." : ""; def.hidden = !def.textContent; }
            paintDef();
            sels[k] = { sel: sel, paint: paintDef };
          });
          if (D.terms) H("p", { class: "lx-hint", html: "Words used here: " + LX.rich(D.terms) }, act);
          var ctx = H("div", { class: "r10-ctx", "aria-live": "polite" }, act);
          // a pick of the learner's own replaces an example's extra for that slot
          function dropExtra(k) { if (st.picks.extra) { delete st.picks.extra[k]; if (!Object.keys(st.picks.extra).length) delete st.picks.extra; } }
          function spinOne(k) { return spin(D.pickers[k], Math.random, k === "element" ? weights(D, !!st.road) : null); }
          all.addEventListener("click", function () {
            KEYS.forEach(function (k) { if (k === "twist" && Math.random() < 0.5) { st.picks[k] = null; } else st.picks[k] = spinOne(k); sels[k].sel.value = st.picks[k] || ""; sels[k].paint(); });
            delete st.picks.extra; changed();
          });
          function paintCtx() {
            ctx.innerHTML = "";
            var c = combo(D, st.picks);
            H("span", { class: "r10-combo", text: c || "Nothing picked yet." }, ctx);
            Object.keys(st.picks.extra || {}).forEach(function (k) {
              H("span", { text: "From the example: " + st.picks.extra[k].label + ", outside the " + D.pickerLabels[k].toLowerCase() + " list. Pick one to replace it." }, ctx);
            });
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
          // the scale is a field of the card, beside the draft rather than inside it (so the question stays short)
          var where = H("p", { class: "lx-hint", hidden: true }, act);
          var meth = H("p", { class: "lx-hint", hidden: true }, act);
          var row = H("div", { class: "r10-bar" }, act), use = H("button", { class: "lx-btn ghost small", type: "button", hidden: true, text: "Put this draft on my card" }, row);
          var um = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
          use.addEventListener("click", function () {
            var c = LX.store.get("r10-card", null) || {}; c.question = draft(D, st.picks, st.type); LX.store.set("r10-card", QC.clean(c));
            st.auto = st.auto || {}; st.auto.question = c.question; save();   // the draft is the studio's value now: it follows later picks
            use.hidden = true; um.textContent = "The draft is now your card's question.";
          });
          QC.TYPES.forEach(function (t) {
            var b = H("button", { type: "button", "aria-pressed": st.type === t.id ? "true" : "false" }, wrap);
            H("b", { text: t.label + ": " + t.template }, b);
            b.addEventListener("click", function () { pick(t.id, true); });
            btns[t.id] = b;
          });
          function pick(id, byReader) {
            st.type = id; if (byReader) syncCard(); else save();
            Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === id ? "true" : "false"); });
            out.hidden = false; out.textContent = "Draft: " + draft(D, st.picks, id);
            var sc = slot(D, clean(D, st.picks), "scale");
            where.hidden = !sc; where.textContent = sc ? "Scale: " + sc.label + ", on the card's scale field; say the place in your own words." : "";
            var T = QC.TYPES.filter(function (x) { return x.id === id; })[0];
            meth.hidden = false; meth.innerHTML = "Typical methods for this type: " + LX.rich(methodsMarked(D, T.methods)) + "; other methods can answer it too.";
            // the card keeps a question the reader wrote; offer the draft instead of overwriting it
            var cq = String((LX.store.get("r10-card", null) || {}).question || "").trim();
            use.hidden = !cq || cq === draft(D, st.picks, id); um.textContent = "";
            api.done();
            api.saw("A draft, not your question yet. Next, rewrite it on the card: replace each bracket and make the metric your own.");
          }
          if (st.type) pick(st.type, false);
        } },
      { text: "Write your question on the card; the studio filled what it could. The checks show which parts are still empty, not whether they are rigorous or new.",
        build: function (act, api) {
          if (st.type) syncCard();
          var fix = {}, map = { type: "R1", audience: "R1", metric: "R1", counterfactual: "R1", wrong: "R1", scale: "R3", uncertainty: "R6" };
          Object.keys(map).forEach(function (k) { var r = LX.lessonRef(P, map[k]); if (r.ready) fix[k] = { href: r.href, label: r.label }; });
          // a #q- link is applied once by the card itself (kept as the draft, the hash dropped), so coming back to this
          // step shows the reader's edits rather than the link's card again
          var qc = LX.QuestionCard(act, { id: "r10-card", code: "R10", share: true, fix: fix, onChange: status });
          function status(v, c) {
            var q = (v || qc.get()).question, written = /\?\s*$/.test(q) && q.indexOf("[") < 0;
            if (written) { api.done(); api.saw((c || qc.checks()).pass + " of 8 parts filled in. Rate their rigour against the rubric below, then ask whether the study could really be done."); }
            else api.saw("Replace the brackets [ ] in the draft with your own words, and end with a question mark.", true);
          }
          status(null, null);
        } },
      { text: "Run five realism checks. Answer honestly: a warning or a block does not stop you, it shows what to fix first.",
        build: function (act, api) {
          stale(act, "realBasis", "Your picks or your card's question changed since you answered these checks: review each answer.");
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
              inp.addEventListener("change", function () { if (inp.checked) { st.realism[r.id] = i; st.realBasis = nowBasis(); save(); paint(); } });
            });
            res[r.id] = H("div", { "aria-live": "polite" }, fs);
            var el = H("label", { class: "ev" }, fs); el.appendChild(document.createTextNode(r.evidence));
            var ei = H("input", { type: "text", maxlength: "300" }, el); ei.value = st.evidence[r.id] || "";
            ei.addEventListener("input", function () { st.evidence[r.id] = ei.value; st.realBasis = nowBasis(); save(); });
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
      { text: "Find out what is already known. Run these [[search-string|search strings]] on a dated snapshot, then note the three closest papers and how your card differs from each.",
        free: true,
        build: function (act, api) {
          var lit = H("div", { class: "r10-lit" }, act), S = searchStrings(D, st.picks), c = combo(D, st.picks), q = cardQ(), inputs = [];
          stale(lit, "paperBasis", "Your picks or your card's question changed since you noted these papers: check that the searches and notes still fit.");
          if (!S.length) H("p", { class: "lx-hint", text: "Pick an element and a dimension in step 1 to get search strings." }, lit);
          else {
            H("p", { class: "lx-hint", text: "These strings follow your picks in step 1: " + c + "." }, lit);
            if (q) {
              H("p", { class: "lx-hint", text: "Your card asks: “" + q + "”" }, lit);
              H("p", { class: "lx-hint", text: "If it has moved away from the picks, change them, or search the snapshot with your own words below." }, lit);
            }
          }
          var box = H("div", { class: "r10-lit", "aria-live": "polite" }, lit);
          if (S.length) box.textContent = "Loading the dated snapshot…";
          // note a work as the next empty close paper (title, year, venue and DOI), never over a note the reader wrote
          function note(w, msg) {
            var i = [0, 1, 2].filter(function (k) { return !String((st.papers[k] || {}).t || "").trim(); })[0];
            if (i == null) { msg.textContent = "All three paper lines are filled: clear one first."; return; }
            st.papers[i].t = workRef(snap, w); inputs[i].value = st.papers[i].t; st.paperBasis = nowBasis(); save();
            msg.textContent = "Noted as paper " + (i + 1) + ". Say how your card differs from it.";
          }
          function hits(host, list, msg) {
            var ul = H("ul", { class: "r10-hits" }, host);
            list.slice(0, 5).forEach(function (w) {
              var li = H("li", null, ul), v = snap.venues[w[5]];
              H("a", { href: workURL(w), target: "_blank", rel: "noopener", text: w[2] }, li);
              li.appendChild(document.createTextNode(" (" + w[3] + (v ? ", " + v : "") + (w[6] ? ", a review" : "") + ")"));
              var b = H("button", { class: "lx-btn ghost small", type: "button", text: "Note it", "aria-label": "Note as a close paper: " + w[2] }, li);
              b.addEventListener("click", function () { note(w, msg); });
            });
          }
          function render(SN) {
            snap = SN; box.textContent = "";
            var el = snapElement(SN, D, st.picks);
            if (!el) { H("p", { class: "lx-hint", text: "The snapshot has no collection for this element yet; copy the strings and search a database yourself, noting the date." }, box); return; }
            H("p", { class: "lx-hint", text: snapAbout(SN, el) }, box);
            var msg = H("p", { class: "lx-hint", "aria-live": "polite" }, null);
            S.forEach(function (s) {
              var sb = H("div", { class: "r10-str" }, box), m = localMatches(el, s, SN);
              H("p", { class: "lx-eyebrow", text: s.label }, sb);
              H("code", { text: s.text }, sb);
              H("p", { class: "lx-hint", text: snapLine(SN, el, s, m.length) }, sb);
              if (m.length) hits(sb, m, msg);
              else H("p", { class: "lx-hint", text: "None in the snapshot: try your own words below, or rerun the string on OpenAlex today." }, sb);
              var row = H("div", { class: "r10-bar" }, sb);
              var cp = H("button", { class: "lx-btn ghost small", type: "button", text: "Copy" }, row);
              H("a", { href: searchURL(D, s.text), target: "_blank", rel: "noopener", text: "Optional: rerun on OpenAlex today (new tab)" }, row);
              var cm = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
              cp.addEventListener("click", function () { LX.copyText(s.text).then(function (ok) { cm.textContent = ok ? "Copied." : "Select the string and copy it."; }); });
            });
            var own = H("label", { class: "r10-own" }, box); own.appendChild(document.createTextNode("Search the snapshot with your own words (every word in the title or keywords)"));
            var oi = H("input", { type: "text", maxlength: "120" }, own), out = H("div", { "aria-live": "polite" }, box);
            oi.addEventListener("input", function () {
              out.innerHTML = ""; var m = ownMatches(el, oi.value, SN); if (!oi.value.trim()) return;
              H("p", { class: "lx-hint", text: m.length + " of " + el.works.length + " works have every word in their titles or keywords." }, out);
              if (m.length) hits(out, m, msg);
            });
            box.appendChild(msg);
            H("p", { class: "lx-hint", text: D.search.live }, box);
            H("p", { class: "lx-hint", text: D.search.note + " " + D.search.noreq }, box);
            LX.emit("layout");
          }
          if (S.length) LX.json(SNAP_URL).then(render, function () { box.textContent = "The snapshot could not be loaded; copy the strings and search a database yourself, noting the date."; });
          H("p", { class: "lx-eyebrow", text: "The three closest papers" }, lit);
          [0, 1, 2].forEach(function (i) {
            var row = H("div", { class: "r10-paper" }, lit), p = st.papers[i] = st.papers[i] || {};
            var l1 = H("label", null, row); l1.appendChild(document.createTextNode("Paper " + (i + 1) + ": title or DOI"));
            var a = H("input", { type: "text", maxlength: "300" }, l1); a.value = p.t || ""; inputs[i] = a;
            var l2 = H("label", null, row); l2.appendChild(document.createTextNode("How your card differs"));
            var b = H("input", { type: "text", maxlength: "300" }, l2); b.value = p.d || "";
            a.addEventListener("input", function () { p.t = a.value; st.paperBasis = nowBasis(); save(); });
            b.addEventListener("input", function () { p.d = b.value; st.paperBasis = nowBasis(); save(); });
          });
          var ctx = H("div", { class: "r10-ctx" }, lit);
          crowd(D, st.picks).forEach(function (x) { H("span", { html: LX.rich(crowdText(x).replace("RGI", "[[relative-growth-index|RGI]]")) }, ctx); });
          D.crowding.caveats.forEach(function (c) { H("span", { text: c }, ctx); });
          var r2 = LX.lessonRef(P, "R2");
          api.saw("The studio makes no originality judgement. Read the closest papers yourself; " + (r2.ready ? "R2" : "R2, upcoming,") + " shows how to map them.");
        } },
      { text: "Save your work. Copy the card, the checks, the search strings and your three papers into your notes, or share the card as a link from step 3.",
        free: true,
        build: function (act, api) {
          var card = QC.text(LX.store.get("r10-card", null) || {}, { code: "R10" }), txt = summary(D, st, card, snap);
          var ta = H("textarea", { class: "r10-out", readonly: true, rows: "14", "aria-label": "Your question card, checks and search strings as text" }, act);
          ta.value = txt;
          // the searches' counts in the snapshot, once it is loaded (it is fetched once, by step 5 or here)
          if (!snap && searchStrings(D, st.picks).length) LX.json(SNAP_URL).then(function (SN) { snap = SN; txt = summary(D, st, card, SN); ta.value = txt; }, function () {});
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
        rows: D.examples.map(function (e, i) { return { key: e.id, name: (i + 1) + ". " + e.combo, type: typeLabel(e), question: e.question }; }),
        caption: "Illustrative cards, one per row. Load one to see how the studio fills a card, then make it your own." });
      var load = H("div", { class: "r10-load" }, c2), lid = LX.uid("r10l");
      H("label", { for: lid, text: "Example" }, load);
      var sel = H("select", { id: lid }, load);
      D.examples.forEach(function (e, i) { H("option", { value: e.id, text: "Example " + (i + 1) + " (" + typeLabel(e) + ")" }, sel); });
      var lb = H("button", { class: "lx-btn ghost small", type: "button", text: "Load into the studio" }, load);
      var rb = H("button", { class: "lx-btn ghost small", type: "button", text: "Restore my previous card", hidden: true }, load);
      var lm = H("span", { class: "lx-hint", "aria-live": "polite" }, load);
      var WORK = ["picks", "type", "realism", "evidence", "papers", "auto", "autoFrom", "autoKey", "example", "exampleCard"];
      function snapshot() { var o = { card: LX.store.get("r10-card", null) }; WORK.forEach(function (k) { o[k] = st[k]; }); return JSON.parse(JSON.stringify(o)); }
      // an example loaded and not touched since: loading another one keeps the stash of the learner's own work
      function untouched() {
        return !!st.example && JSON.stringify(QC.clean(LX.store.get("r10-card", null) || {})) === JSON.stringify(st.exampleCard)
          && !Object.keys(st.realism || {}).length && !Object.keys(st.evidence || {}).some(function (k) { return String(st.evidence[k] || "").trim(); })
          && !(st.papers || []).some(function (p) { return p && (String(p.t || "").trim() || String(p.d || "").trim()); });
      }
      function paintRestore() { rb.hidden = !st.stash; }
      lb.addEventListener("click", function () {
        var e = example(D, sel.value);
        if (!untouched()) st.stash = snapshot();
        var card = QC.clean(exampleCard(D, e));
        st.picks = examplePicks(D, e); st.type = e.type; st.realism = {}; st.evidence = {}; st.papers = [{}, {}, {}];
        LX.store.set("r10-card", card);
        st.auto = { question: card.question, type: card.type, scale: card.scale, audience: card.audience, metric: card.metric, units: card.units };
        st.autoFrom = { picks: st.picks, type: st.type }; st.autoKey = key(); st.example = e.id; st.exampleCard = card;
        save(); paintRestore();
        lm.textContent = "Example " + e.id.slice(1) + " is on a fresh card, with its own picks; realism answers and papers start empty. Your earlier work is kept: restore it with the button.";
        cardsUI.go(2);
        var t = document.getElementById("task"); if (t) t.scrollIntoView({ behavior: LX.reduced() ? "auto" : "smooth" });
      });
      rb.addEventListener("click", function () {
        var o = st.stash; if (!o) return;
        WORK.forEach(function (k) { st[k] = o[k]; });
        st.picks = clean(D, st.picks || {}); st.realism = st.realism || {}; st.evidence = st.evidence || {}; st.papers = st.papers || [{}, {}, {}];
        if (o.card) LX.store.set("r10-card", o.card); else LX.store.set("r10-card", {});
        st.stash = null; save(); paintRestore();
        lm.textContent = "Your previous card, picks, realism answers and papers are back.";
        cardsUI.go(2);
      });
      paintRestore();
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
      if (n >= 4) { st.realism = { data: 1, physics: 0, institutions: 1, scope: 0, people: 2 }; st.evidence = { physics: "about 3 kW of cooling per flat" }; }
      save();
      cardsUI.go(n - 1);
      return { view: "the exemplar's spin, step " + n };
    }, cardsUI);
  });
})();
