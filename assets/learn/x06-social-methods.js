// x06-social-methods.js — Side topic X6, "How do social scientists study energy and people?" (step cards, Researcher,
// side line, D1, no model). Method-neutral: six methods, each answering a
// different kind of question; none ranked above another.
//
// Data: data/x06-social-methods.json (the six methods with what each asks, its data, what it gives a modeller, what it
// cannot tell and whether people take part; six questions to match; the predicts; facts, stop box and sources, dated)
// and data/path.json (lesson links that appear once a lesson is live). Prairie City and its council are fictional.
//
// Shared components: LX.StepCards, LX.Predict, LX.CardSort (cards and toggles), LX.CompareTable, LX.lessonRefHTML,
// LX.demo. Lesson-local: the method picker (buttons that open a method's card).
(function () {
  "use strict";
  var KEY = "x06_social_methods";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function method(D, id) { return D.methods.filter(function (m) { return m.id === id; })[0]; }
  var STEPS = [
    "Prairie City's council (fictional) is weighing a heat-pump programme: its energy model gives costs, peaks and emissions, but the council also asks about people. Which question can the model answer by itself?",
    "Six of the council's questions, six methods, each with a short definition on its box. Match each question to the method that fits it best; several could help.",
    "Each method gives a modeller something and leaves something out. Tap at least three methods to see what each can and cannot tell a model.",
    "Some methods study people directly. Mark the ones in which people take part; before such a study, the institution's [[ethics-board|ethics board]] decides what review and [[informed-consent|informed consent]] it needs.",
    "One more trap, where social science meets statistics: a survey finds that homes in the heat-pump programme use less energy than homes outside it. Does that show the programme cut their use?"
  ];
  var PICK_MIN = 3;
  function pickCount(n) { return n >= PICK_MIN ? "Methods opened: " + n + " of 6." : "Methods opened: " + n + " of at least " + PICK_MIN + "."; }
  // a method's card (what it gives and cannot tell show at once; what it asks and the data it needs open
  // under "More", so the first view keeps to the text budget)
  function methodParts(D, id) { var m = method(D, id); return { shown: [m.label, m.gives, m.cannot], more: [m.asks, m.data] }; }
  function methodHTML(D, id) {
    var m = method(D, id);
    return "<b>" + (m.term ? "<span class=\"lx-term\" data-term=\"" + m.term + "\">" + esc(m.label) + "</span>" : esc(m.label)) + "</b><dl class=\"x6-dl\"><dt>Gives a model</dt><dd>" + esc(m.gives) + "</dd><dt>Cannot tell</dt><dd>" + esc(m.cannot) + "</dd></dl>" +
      "<details class=\"x6-more\"><summary>More: what it asks and the data it needs</summary><dl class=\"x6-dl\"><dt>Asks</dt><dd>" + esc(m.asks) + "</dd><dt>Data</dt><dd>" + esc(m.data) + "</dd></dl></details>";
  }
  // the sort's bins carry a short definition each, so the methods are explained where they are tested
  function bins(D) { return D.methods.map(function (m) { return { id: m.id, label: m.short, sub: m.def, color: m.color }; }); }
  function matchLine(g) { return g.placed < g.total ? "Place every question first: " + (g.total - g.placed) + " still in the pool." : g.right + " of " + g.total + " match the best fit. Open the reasons below; other methods can add to each answer."; }
  // every pairing with its reason, shown after a full check, right or wrong (a perfect match included)
  function reasonsHTML(D) { return "<ul>" + D.questions.map(function (q) { return "<li><b>" + esc(q.text) + "</b> " + esc(q.why) + "</li>"; }).join("") + "</ul>"; }
  var MATCH_SAW = "For these questions, surveys estimate shares, interviews explore reasons, choice experiments weigh trade-offs, ethnography follows daily life, documents trace rules and participatory mapping finds places.";
  var PICK_SAW = "Every method hands a modeller something different: shares, reasons, weights, routines, rules or map layers; none of them alone tells the whole story.";
  var PEOPLE_SAW = "Surveys, interviews, choice experiments, ethnography and participatory mapping involve people, so the ethics board decides first what review and consent apply; policy analysis can too, through interviews or personal records.";
  function peopleItems(D) {
    return D.methods.map(function (m) { return { key: m.id, label: m.label, color: m.color, ref: { people: m.people }, why: { people: D.peopleWhy[m.people] } }; });
  }

  // ---------------------------------------------------------------- the no-JS block, ideas, check, facts, sources
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function staticFallback(D) {
    // a prediction without JavaScript: the question, then every option with its feedback
    var qa = function (q, Q) { return "<details class=\"x6-qa\"><summary>" + esc(q) + "</summary><ul>" + Q.options.map(function (o) { return "<li><b>" + esc(o.label) + ".</b> " + esc(Q.feedback[o.value]) + "</li>"; }).join("") + "</ul></details>"; };
    return qa("Prairie City's council (fictional) weighs a heat-pump programme. Which of its questions can the energy model answer by itself?", D.predict) +
      "<p class=\"lx-eyebrow\">Six methods, what each asks, the data it needs and what it can tell a modeller</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table x6-fbt\"><thead><tr><th scope=\"col\">Method</th><th scope=\"col\">Asks</th><th scope=\"col\">Data</th><th scope=\"col\">Gives a model</th><th scope=\"col\">Cannot tell</th></tr></thead><tbody>" +
      D.methods.map(function (m) { return "<tr><td>" + esc(m.label) + "</td><td>" + esc(m.asks) + "</td><td>" + esc(m.data) + "</td><td>" + esc(m.gives) + "</td><td>" + esc(m.cannot) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<p class=\"lx-eyebrow\">Six questions and the method that fits each best</p><ul>" + D.questions.map(function (q) { return "<li>" + esc(q.text) + " " + esc(method(D, q.bin).label) + ".</li>"; }).join("") + "</ul>" +
      qa(STEPS[4].replace(/^One more trap, where social science meets statistics: a/, "A"), D.selection) +
      "<p class=\"lx-hint\">With JavaScript on, you match the questions to methods, open each method, mark which involve people and test one survey result.</p>";
  }
  function ideasHTML() {
    return "<dl class=\"lx-ideas\">" +
      "<dt>Different questions</dt><dd>Each method answers its own kind of question: how many, why, which trade-off, how people live, how rules came about, which places matter.</dd>" +
      "<dt>For a modeller</dt><dd>Findings become inputs, household groups, behaviour rules, constraints, map layers or scenarios.</dd>" +
      "<dt>Ethics board first</dt><dd>Before research with people, or with identifiable records about them, ask the institution's ethics board what review and consent apply; exemptions and waivers follow its process.</dd>" +
      "<dt>Not causal by itself</dt><dd>A difference between joiners and others does not, by itself, establish the programme's effect; a fair comparison is a design choice of its own.</dd>" +
      "<dt>Neutral</dt><dd>No method is ranked above another here: each is the right tool for some questions and the wrong one for others.</dd></dl>";
  }
  function checkHTML() {
    return "<div class=\"lx-myths\" data-quiz=\"x06-myth\">" +
      "<div class=\"lx-qq\" data-id=\"volunteers\" data-answer=\"myth\"><p class=\"lx-qtext\">Myth or fact? “An online poll of 50 volunteers shows what share of a city's households struggle with their energy bills.”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>Myth. Volunteers choose themselves; a share for the whole city needs a sample drawn to represent it, as large surveys such as EIA's do.</p></details></div>" +
      "</div><div class=\"lx-quiz\" data-quiz=\"x06\">" +
      "<div class=\"lx-qq\" data-id=\"count\" data-answer=\"a\"><p class=\"lx-qtext\">A modeller needs to know how many of a city's homes have a heat pump today, by income group. Which method fits best?</p><ul class=\"lx-choices\"><li data-value=\"a\">A survey of a representative sample</li><li data-value=\"b\">Ethnography in a few homes</li><li data-value=\"c\">Interviews with installers</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>A survey: a count by group across a population is what surveys do; ethnography and interviews explain how and why, in depth.</p></details></div>" +
      "</div>";
  }
  function factsHTML(D) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      D.facts.map(function (f) { var s = D.sources[f.src]; return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + "</td><td class=\"s\"><a href=\"" + esc(s.url) + "\">" + esc(s.cite.split(": ")[0]) + "</a> · " + esc(cap(s.asOf)) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  // each source: the citation, its link and date, then the short claims it supports, one per line
  function sourcesHTML(D) {
    return "<ul>" + Object.keys(D.sources).map(function (k) { var s = D.sources[k]; return "<li>" + esc(s.cite) + ". <a href=\"" + esc(s.url) + "\">Link</a>. " + esc(cap(s.asOf)) + ".<ul class=\"x6-used\">" + s.used.map(function (u) { return "<li>" + esc(u) + "</li>"; }).join("") + "</ul></li>"; }).join("") + "</ul>" +
      "<p class=\"lx-hint\">The six method summaries are this course's own, at awareness level; the codes of practice above give each method's standards.</p>";
  }

  var model = { method: method, methodParts: methodParts, bins: bins, reasonsHTML: reasonsHTML, STEPS: STEPS, PICK_MIN: PICK_MIN, pickCount: pickCount, methodHTML: methodHTML, matchLine: matchLine, MATCH_SAW: MATCH_SAW, PICK_SAW: PICK_SAW,
    PEOPLE_SAW: PEOPLE_SAW, peopleItems: peopleItems, staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, factsHTML: factsHTML, sourcesHTML: sourcesHTML };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;

  LX.mount("x06", function (live, data, root) {
    var D = data[KEY], P = data.path, demo = [];
    var cards = LX.StepCards(live, { id: "x6-steps", steps: [
      { text: STEPS[0], build: function (act, api) {
          var Q = D.predict;
          var pr = LX.Predict(act, { id: "x6-model", q: Q.q, title: false, answer: Q.answer, options: Q.options, feedback: Q.feedback, onPick: function () { pr.reveal(); api.done(); } });
          if (pr.picked()) { pr.reveal(); api.done(); }
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelector(".lx-choice"); if (b) b.click(); } };
        } },
      { text: STEPS[1], build: function (act, api) {
          var note = H("p", { class: "lx-step-line", "aria-live": "polite" }), why = H("details", { class: "lx-textalt x6-why" });
          H("summary", { text: "Every pairing, with its reason" }, why); why.insertAdjacentHTML("beforeend", reasonsHTML(D));
          var cs = LX.CardSort(act, { bins: bins(D), cards: D.questions, maxWhy: 6, cls: "x6-cs",
            onCheck: function (g) { note.textContent = matchLine(g); if (g.placed < g.total) { api.saw(matchLine(g), true); return; } act.appendChild(why); api.done(); api.saw(MATCH_SAW); } });
          act.appendChild(note);
          demo[1] = function () { var m = {}; D.questions.forEach(function (q) { m[q.id] = q.bin; }); cs.place(m); cs.check(); };
        } },
      { text: STEPS[2], build: function (act, api) {
          var seen = {}, seg = H("div", { class: "lx-seg x6-methods", role: "group", "aria-label": "Six methods" }, act), btn = {};
          var card = H("div", { class: "lx-step-line x6-card", "aria-live": "polite", text: "Tap a method." }, act), cnt = H("p", { class: "lx-hint", "aria-live": "polite", text: pickCount(0) }, act);
          D.methods.forEach(function (m) { btn[m.id] = H("button", { type: "button", text: m.label, "aria-pressed": "false" }, seg); btn[m.id].addEventListener("click", function () { open(m.id); }); });
          function open(id) {
            seen[id] = true; Object.keys(btn).forEach(function (k) { btn[k].setAttribute("aria-pressed", String(k === id)); });
            card.innerHTML = methodHTML(D, id); var n = Object.keys(seen).length; cnt.textContent = pickCount(n);
            if (n >= PICK_MIN) { api.done(); api.saw(PICK_SAW); }
          }
          demo[2] = function () { ["survey", "choice", "mapping"].forEach(open); };
        } },
      { text: STEPS[3], build: function (act, api) {
          var items = peopleItems(D);
          LX.CardSort(act, { mode: "toggles", bins: [{ key: "people", label: "People take part", short: "People" }], items: items, checkLabel: "Check my marks",
            onCheck: function () { api.done(); api.saw(PEOPLE_SAW); } });
          H("p", { class: "lx-hint", html: "Consent and review in practice: " + LX.lessonRefHTML(P, "R9") + "." }, act);
          demo[3] = function () {
            var rows = act.querySelectorAll(".lx-cs-row:not(.head)");
            D.methods.forEach(function (m, i) { var b = rows[i] && rows[i].querySelector(".tg"); if (b && m.people === "yes" && b.getAttribute("aria-pressed") !== "true") b.click(); });
            var chk = Array.prototype.filter.call(act.querySelectorAll("button"), function (b) { return /Check my marks/.test(b.textContent); })[0]; if (chk) chk.click();
          };
        } },
      { text: STEPS[4], build: function (act, api) {
          var Q = D.selection;
          var pr = LX.Predict(act, { id: "x6-select", q: Q.q, title: false, answer: Q.answer, options: Q.options, feedback: Q.feedback, onPick: function () { pr.reveal(); api.done(); buildExplain(); } });
          if (pr.picked()) { pr.reveal(); api.done(); }
          H("p", { class: "lx-hint", html: "Fair comparisons with data: " + LX.lessonRefHTML(P, "M14") + "; who pays and who benefits: " + LX.lessonRefHTML(P, "A13") + "." }, act);
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "The six methods side by side" + LX.icon("arrow") }, act);
          demo[4] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } }
    ] });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("x06-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      LX.CompareTable(H("div", { class: "lx-xcard x6-wide" }, xhost), { title: "Six methods, side by side", text: true,
        caption: "This course's own summaries, at awareness level; no method is ranked above another.",
        columns: [{ key: "name", label: "Method", main: true }, { key: "asks", label: "Asks" }, { key: "gives", label: "Gives a model" }, { key: "cannot", label: "Cannot tell" }],
        rows: D.methods.map(function (m) { return { key: m.id, color: m.color, name: m.label, asks: m.asks, gives: m.gives, cannot: m.cannot }; }) });
      var nx = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Where this connects" }, nx);
      var ul = H("ul", { class: "x6-next" }, nx);
      [["M14", "fair comparisons with data: did a programme work?"], ["A13", "who pays and who benefits, by household group"], ["A19", "map layers, where participatory maps can feed in"], ["R9", "consent, ethics boards and the people a study owes"], ["R3", "method families, of which these are some"]]
        .forEach(function (x) { H("li", { html: LX.lessonRefHTML(P, x[0]) + ": " + LX.esc(x[1]) + "." }, ul); });
    }
    buildExplain();

    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(4, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, D: D, cards: cards };
  });
})();
