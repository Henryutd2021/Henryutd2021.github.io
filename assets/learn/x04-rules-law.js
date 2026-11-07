// x04-rules-law.js — Side topic X4, "How are energy rules made?" (step cards, Analyst, side line, D1, no model; wave W7,
// builder learn-w7-a, 2026-11-07). Neutral: the page describes who decides, in what order and when; it judges no rule.
//
// Data: data/x04-rules-law.json (the chain, the six stages of one finished federal rulemaking, FERC Order No. 2222, with
// dates and comment counts; the six stages of a Kansas rate case; the jurisdiction sort; the facts, the stop box and the
// sources, each dated) and data/path.json (lesson links that appear once a lesson is live). No live proceeding appears.
//
// Arithmetic only: date differences in whole years, months and days (calendar months, the day of the month compared),
// and a 240-day clock from a filing date.
//
// Shared components: LX.StepCards, LX.Predict, LX.EnergyChain, LX.CardSort, LX.Flowchart, LX.Timeline,
// LX.lessonRefHTML, LX.demo. Lesson-local: the stage picker (OrderTap) and the rate-case track (CaseTrack).
(function () {
  "use strict";
  var KEY = "x04_rules_law";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function ymd(s) { var p = s.split("-").map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  // whole years, months and days from a to b (b later): months counted on the calendar, then the days left over
  function span(a, b) {
    var A = ymd(a), B = ymd(b), months = (B.y - A.y) * 12 + (B.m - A.m), days;
    if (B.d < A.d) { months -= 1; var prev = new Date(Date.UTC(B.y, B.m - 1, 0)).getUTCDate(); days = prev - A.d + B.d; } else days = B.d - A.d;
    return { years: Math.floor(months / 12), months: months % 12, days: days, totalMonths: months };
  }
  function spanText(s) {   // "4 years and 9 months" (+ "and 29 days" when asked)
    return s.years + " years and " + s.months + " months";
  }
  function addDays(iso, n) { var A = ymd(iso), t = new Date(Date.UTC(A.y, A.m - 1, A.d + n)); return t.toISOString().slice(0, 10); }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function longDate(iso) { var A = ymd(iso); return A.d + " " + MONTHS[A.m - 1] + " " + A.y; }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
  // the order a reader tapped against the true order: how many stages sit in their right place
  function orderScore(D, picks) {
    var truth = D.steps.map(function (s) { return s.id; });
    return { right: picks.filter(function (id, i) { return truth[i] === id; }).length, total: truth.length, truth: truth };
  }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  var STEPS = [
    "Energy rules come in layers: a law gives a regulator its power, the regulator writes rules, and tariffs, rates and permits follow. First, a date question: how long did one federal rule take, from first meeting to final rule?",
    "The rule was FERC's Order No. 2222, which lets groups of small, distributed resources sell into the regional grid markets. Tap its six stages in the order they happened.",
    "Your electricity bill follows a different track, the state's: a Kansas utility asks the commission to change its rates in a [[rate-case|rate case]]. Tap each stage to see who may speak.",
    "Partway through, the utility, the commission's staff and the consumers' advocate sign a settlement. Must the commission accept it?",
    "Prairie Town's wind farm and its new line need permits as well as rates. Sort each decision by who makes it: federal, state or local.",
    "Last, your own voice. Which of these can any member of the public do?"
  ];
  function hookFeedback(D) {
    var s = span(D.hook.start, D.hook.end), t = spanText(s);
    return { a: "Longer: " + t + ", from " + longDate(D.hook.start) + " to " + longDate(D.hook.end) + ".",
             b: "Longer: " + t + ", from " + longDate(D.hook.start) + " to " + longDate(D.hook.end) + ".",
             c: "Yes: " + s.years + " years, " + s.months + " months and " + s.days + " days, from " + longDate(D.hook.start) + " to " + longDate(D.hook.end) + "." };
  }
  var CHAIN_SAW = "Four layers, two tracks: federal (Congress, FERC, wholesale markets and the grid) and state (the legislature, the commission, retail rates), with counties and cities deciding much of the siting.";
  function orderLine(D, picks) {
    var sc = orderScore(D, picks);
    return sc.right + " of " + sc.total + " stages in their right place." + (sc.right < sc.total ? " The true order is shown below." : "");
  }
  function orderSaw(D) {
    var n = byId(D.steps, "nopr"), f = byId(D.steps, "final"), s = span(n.date, f.date);
    return "From the proposed rule to the final rule: " + spanText(s) + (s.days ? " and " + s.days + " days" : "") + ". Before the rule, FERC gathered views four times: a panel, a request for comments, comments on the proposal and a technical conference.";
  }
  function stepLi(s) { return (s.date ? longDate(s.date) : "Then") + ": " + s.label + (s.comments ? " (" + s.comments + " comments)" : "") + "."; }
  function caseHTML(D, id) {
    var c = byId(D.rateCase, id);
    return "<b>" + esc(c.label) + (c.day ? " · " + esc(c.day) : "") + "</b><dl class=\"x4-dl\"><dt>Who</dt><dd>" + esc(c.who) + "</dd><dt>What</dt><dd>" + esc(c.text) + "</dd></dl>";
  }
  var CASE_SAW = "Six stages, one clock: the commission must decide within 240 days in most cases, and the public, the advocate and other intervenors each have a stage to speak.";
  function sortLine(g) { return g.right + " of " + g.total + " match. Open the reasons below for each source."; }
  var SORT_SAW = "Wholesale markets, reliability and air safety are federal; retail rates and big Kansas lines are state; most siting and building permits are local.";

  // ---------------------------------------------------------------- the no-JS block, ideas, check, facts, sources
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function staticFallback(D) {
    var binLabel = function (id) { return byId(D.bins, id).label; };
    return "<p class=\"lx-eyebrow\">From a law to a rate and a permit (U.S. federal and Kansas examples)</p>" +
      "<p>" + esc(D.project) + "</p>" +
      "<p class=\"lx-eyebrow\">One finished federal rulemaking: FERC Order No. 2222</p><ol>" + D.steps.map(function (s) { return "<li>" + esc(stepLi(s)) + "</li>"; }).join("") + "</ol>" +
      "<p class=\"lx-eyebrow\">A Kansas rate case</p><div class=\"lx-scroll-x\"><table class=\"lx-mini-table x4-fbt\"><thead><tr><th scope=\"col\">Stage</th><th scope=\"col\">Who</th><th scope=\"col\">What happens</th></tr></thead><tbody>" +
      D.rateCase.map(function (c) { return "<tr><td>" + esc(c.label) + (c.day ? " (" + esc(c.day) + ")" : "") + "</td><td>" + esc(c.who) + "</td><td>" + esc(c.text) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<p class=\"lx-eyebrow\">Who decides</p><div class=\"lx-scroll-x\"><table class=\"lx-mini-table x4-fbt\"><thead><tr><th scope=\"col\">Decision</th><th scope=\"col\">Level</th></tr></thead><tbody>" +
      D.cards.map(function (c) { return "<tr><td>" + esc(c.text) + "</td><td>" + esc(binLabel(c.bin)) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<p class=\"lx-hint\">With JavaScript on, you put the rule's stages in order, step through a rate case, sort who decides what and find where the public can speak.</p>";
  }
  function ideasHTML(D) {
    var s = span(D.hook.start, D.hook.end);
    return "<dl class=\"lx-ideas\">" +
      "<dt>Layers</dt><dd>A law gives a regulator its power; the regulator writes rules; tariffs, rates and permits apply them.</dd>" +
      "<dt>Two tracks</dt><dd>FERC regulates interstate transmission and wholesale sales; state commissions such as the KCC approve retail rates.</dd>" +
      "<dt>Dates</dt><dd>One federal rule, Order No. 2222, took " + spanText(s) + " from first panel to final rule; a Kansas rate case runs on a 240-day clock in most cases.</dd>" +
      "<dt>Voices</dt><dd>Rulemakings take comments; rate cases take testimony from parties and comments from the public; the commissioners decide.</dd>" +
      "<dt>Siting</dt><dd>Where turbines may stand is decided mostly by local governments, sometimes with the state.</dd></dl>";
  }
  function checkHTML(D) {
    var due = addDays(D.quiz.filed, D.quiz.days);
    return "<div class=\"lx-myths\" data-quiz=\"x04-myth\">" +
      "<div class=\"lx-qq\" data-id=\"ferc\" data-answer=\"myth\"><p class=\"lx-qtext\">Myth or fact? “FERC sets the price a Kansas home pays for its electricity.”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>Myth. State regulators approve retail rates, in Kansas the KCC for the utilities it oversees; FERC regulates interstate transmission and wholesale sales.</p></details></div>" +
      "</div><div class=\"lx-quiz\" data-quiz=\"x04\">" +
      "<div class=\"lx-qq\" data-id=\"clock\" data-answer=\"b\"><p class=\"lx-qtext\">A Kansas utility files a rate case on " + longDate(D.quiz.filed) + ". In most cases, by when must the KCC decide?</p><ul class=\"lx-choices\"><li data-value=\"a\">" + longDate(addDays(D.quiz.filed, 60)) + "</li><li data-value=\"b\">" + longDate(due) + "</li><li data-value=\"c\">" + longDate(addDays(D.quiz.filed, 365)) + "</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + longDate(due) + ": " + D.quiz.days + " days after the filing date, the KCC's usual limit (it can be waived in certain circumstances).</p></details></div>" +
      "</div>";
  }
  function factsHTML(D) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      D.facts.map(function (f) {
        var s = D.sources[f.src], label = esc(s.text.split(":")[0].split(" (")[0]);
        return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + "</td><td class=\"s\">" + (s.url ? "<a href=\"" + esc(s.url) + "\">" + label + "</a>" : label) + (f.where ? ", " + esc(f.where) : "") + " · " + esc(s.asOf.split(",")[0]) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  function sourcesHTML(D) {
    return "<ul>" + Object.keys(D.sources).map(function (k) { var s = D.sources[k]; return "<li>" + esc(s.text) + (s.url ? ". <a href=\"" + esc(s.url) + "\">Link</a>" : "") + ". " + esc(s.asOf.charAt(0).toUpperCase() + s.asOf.slice(1)) + ".</li>"; }).join("") + "</ul>";
  }
  // the explain layer's timeline: every dated stage, with the order's own source (as_of: its issue date, ISO)
  function timelineEvents(D) {
    var s = D.sources["ferc-2222"];
    return D.steps.filter(function (x) { return x.date; }).map(function (x) {
      return { date: x.date, label: x.label, kind: x.kind, key: !!x.key, text: x.text + " (" + x.where + ")", source: { label: "FERC, Order No. 2222", url: s.url, as_of: D.hook.end } };
    });
  }
  function deeperHTML() {
    return "<ul><li><b>Step one: how much.</b> The commission sets a <span class=\"lx-term\" data-term=\"revenue-requirement\">revenue requirement</span>: the utility's allowed operating expenses plus an allowed return on its rate base, the net value of what it has built.</li>" +
      "<li><b>Step two: who pays it.</b> Rate design splits that amount into charges for each customer class: fixed charges, prices per kWh and, for large users, demand charges.</li>" +
      "<li><b>Where to see it.</b> The KCC describes both steps in its guide; the bills that result are the subject of lesson A4.</li></ul>";
  }

  var model = { span: span, spanText: spanText, addDays: addDays, longDate: longDate, orderScore: orderScore, STEPS: STEPS, hookFeedback: hookFeedback, CHAIN_SAW: CHAIN_SAW,
    orderLine: orderLine, orderSaw: orderSaw, stepLi: stepLi, caseHTML: caseHTML, CASE_SAW: CASE_SAW, sortLine: sortLine, SORT_SAW: SORT_SAW,
    staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, factsHTML: factsHTML, sourcesHTML: sourcesHTML, deeperHTML: deeperHTML, timelineEvents: timelineEvents };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  LX.mount("x04", function (live, data, root) {
    var D = data[KEY], P = data.path, demo = [], picks = [];
    var cards = LX.StepCards(live, { id: "x4-steps", steps: [
      { text: STEPS[0], build: function (act, api) {
          var res = H("div", { class: "x4-res" });
          var pr = LX.Predict(act, { id: "x4-hook", q: D.hook.q, title: false, answer: D.hook.answer, options: D.hook.options, feedback: hookFeedback(D), onPick: function () { show(); } });
          act.appendChild(res);
          function show() {
            pr.reveal(); res.innerHTML = "";
            LX.EnergyChain(res, { title: "From a law to a rate and a permit", stops: D.chain.map(function (c) { return { icon: c.icon, title: c.title, text: c.text, value: "" }; }) });
            api.done(); api.saw(CHAIN_SAW);
          }
          if (pr.picked()) show();
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[2]; if (b) b.click(); } };
        } },
      { text: STEPS[1], build: function (act, api) {
          var grid = H("div", { class: "x4-order", role: "group", "aria-label": "The six stages, to tap in order" }, act), btn = {};
          var ctl = H("div", { class: "lx-choices-row x4-ctl" }, act);
          var undo = H("button", { type: "button", class: "lx-btn small", text: "Undo" }, ctl), check = H("button", { type: "button", class: "lx-btn small", text: "Check my order", disabled: "" }, ctl);
          var line = H("p", { class: "lx-step-line", "aria-live": "polite", text: "Tap the stage that came first." }, act), out = H("div", { class: "x4-truth" }, act);
          D.shuffle.forEach(function (id) {
            var s = byId(D.steps, id), b = H("button", { type: "button", class: "x4-stage", "aria-pressed": "false" }, grid);
            H("span", { class: "n", "aria-hidden": "true" }, b); H("span", { class: "t", text: s.label }, b);
            b.addEventListener("click", function () { if (picks.indexOf(id) >= 0 || picks.length >= D.steps.length) return; picks.push(id); paint(); });
            btn[id] = b;
          });
          function paint() {
            Object.keys(btn).forEach(function (id) { var i = picks.indexOf(id), b = btn[id]; b.querySelector(".n").textContent = i >= 0 ? String(i + 1) : ""; b.setAttribute("aria-pressed", String(i >= 0)); b.setAttribute("aria-label", byId(D.steps, id).label + (i >= 0 ? ", placed " + (i + 1) : "")); });
            if (picks.length < D.steps.length) { check.setAttribute("disabled", ""); line.textContent = picks.length ? "Placed " + picks.length + " of " + D.steps.length + ". Tap the next one." : "Tap the stage that came first."; }
            else { check.removeAttribute("disabled"); line.textContent = "All six placed. Check your order."; }
          }
          undo.addEventListener("click", function () { picks.pop(); out.innerHTML = ""; paint(); });
          check.addEventListener("click", function () {
            if (picks.length < D.steps.length) return;
            line.textContent = orderLine(D, picks); out.innerHTML = "";
            var ol = H("ol", { class: "x4-list" }, out); D.steps.forEach(function (s) { H("li", { text: stepLi(s) }, ol); });
            api.done(); api.saw(orderSaw(D));
          });
          paint();
          demo[1] = function () { picks.length = 0; D.steps.forEach(function (s) { picks.push(s.id); }); paint(); check.click(); };
        } },
      { text: STEPS[2], build: function (act, api) {
          var seen = {}, track = H("div", { class: "x4-track", role: "group", "aria-label": "The stages of a Kansas rate case" }, act), btn = {};
          var panel = H("div", { class: "lx-step-line x4-card", "aria-live": "polite", text: "Tap a stage." }, act), cnt = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          D.rateCase.forEach(function (c, i) {
            var b = H("button", { type: "button", class: "x4-stop", "aria-pressed": "false" }, track);
            H("span", { class: "n", text: String(i + 1), "aria-hidden": "true" }, b); H("span", { class: "t", text: c.label }, b); if (c.day) H("span", { class: "d", text: c.day }, b);
            b.addEventListener("click", function () { open(c.id); }); btn[c.id] = b;
          });
          H("p", { class: "lx-hint", text: "Kansas Corporation Commission, How rates are set (undated; read 7 November 2026). Other states differ in their steps and clocks." }, act);
          function open(id) {
            seen[id] = true; Object.keys(btn).forEach(function (k) { btn[k].setAttribute("aria-pressed", String(k === id)); });
            panel.innerHTML = caseHTML(D, id); var n = Object.keys(seen).length; cnt.textContent = "Stages opened: " + n + " of " + D.rateCase.length + ".";
            if (n === D.rateCase.length) { api.done(); api.saw(CASE_SAW); }
          }
          demo[2] = function () { D.rateCase.forEach(function (c) { open(c.id); }); };
        } },
      { text: STEPS[3], build: function (act, api) {
          var S = D.settlement;
          var pr = LX.Predict(act, { id: "x4-settle", q: S.q, title: false, answer: S.answer, options: S.options, feedback: S.feedback, onPick: function () { pr.reveal(); api.done(); } });
          if (pr.picked()) { pr.reveal(); api.done(); }
          demo[3] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } },
      { text: STEPS[4], build: function (act, api) {
          var note = H("p", { class: "lx-step-line", "aria-live": "polite" });
          var why = H("details", { class: "lx-textalt x4-why" }), wl;
          H("summary", { text: "Every reason, with its source" }, why); wl = H("ul", null, why);
          D.cards.forEach(function (c) { var s = D.sources[c.src]; H("li", { html: "<b>" + LX.esc(c.text) + ".</b> " + LX.esc(c.why) + " <span class=\"x4-src\">(" + LX.esc(s.text.split(":")[0].split(" (")[0]) + ")</span>" }, wl); });
          var cs = LX.CardSort(act, { bins: D.bins, cards: D.cards.map(function (c) { return { id: c.id, text: c.text, bin: c.bin, why: c.why }; }), maxWhy: 7,
            onCheck: function (g) { note.textContent = sortLine(g); act.appendChild(why); api.done(); api.saw(SORT_SAW); } });
          act.appendChild(note);
          demo[4] = function () { var m = {}; D.cards.forEach(function (c) { m[c.id] = c.bin; }); cs.place(m); cs.check(); };
        } },
      { text: STEPS[5], build: function (act, api) {
          var V = D.voice;
          var pr = LX.Predict(act, { id: "x4-voice", q: V.q, title: false, answer: V.answer, options: V.options, feedback: V.feedback, onPick: function () { pr.reveal(); api.done(); buildExplain(); } });
          if (pr.picked()) { pr.reveal(); api.done(); }
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "The two tracks, as diagrams" + LX.icon("arrow") }, act);
          demo[5] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[2]; if (b) b.click(); } };
        } }
    ] });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("x04-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      LX.Flowchart(H("div", { class: "lx-xcard" }, xhost), {
        title: "Two tracks from a law to what you pay and what gets built", lede: "Trace three cases; each box names who decides.",
        nodes: {
          cong: { t: "Congress passes a law", tN: ["Congress", "passes a law"], k: "end" },
          leg: { t: "Kansas passes a law", tN: ["Kansas passes", "a law"], k: "end" },
          ferc: { t: "FERC writes a rule", tN: ["FERC writes", "a rule"], s: "proposal, comments, rule", sN: "comments first" },
          kcc: { t: "The KCC decides", tN: ["The KCC", "decides"], s: "rate cases, line permits", sN: "rates, lines" },
          tar: { t: "Tariff filed at FERC", tN: ["Tariff filed", "at FERC"], s: "by SPP or a utility", sN: "SPP, utilities" },
          rate: { t: "Retail rates change", tN: ["Retail rates", "change"], s: "within 240 days", sN: "240 days" },
          loc: { t: "County and city permits", tN: ["County and", "city permits"], s: "zoning, building", sN: "zoning" },
          out: { t: "Bills or projects change", tN: ["Bills or", "projects change"], k: "end" }
        },
        cols: 3, at: { cong: [0, 0], leg: [1, 0], loc: [2, 0], ferc: [0, 1], kcc: [1, 1], tar: [0, 2], rate: [1, 2], out: [1, 3] },
        colsN: 3, atN: { cong: [0, 0], leg: [1, 0], loc: [2, 0], ferc: [0, 1], kcc: [1, 1], tar: [0, 2], rate: [1, 2], out: [1, 3] },
        edges: [["cong", "ferc"], ["leg", "kcc"], ["ferc", "tar", "wholesale"], ["kcc", "rate", "retail"], ["tar", "out", null, { v: true }], ["rate", "out"], ["loc", "out", null, { v: true }]],
        traces: [{ label: "Order No. 2222", path: ["cong", "ferc", "tar", "out"], text: "Federal track: FERC's rule changed each regional market's tariff, filed at FERC." },
                 { label: "A Kansas rate change", path: ["leg", "kcc", "rate", "out"], text: "State track: the KCC decides the utility's application, in most cases within 240 days." },
                 { label: "A wind farm's site", path: ["loc", "out"], text: "Local track, in most places: the county, sometimes with the state; a tall-turbine check is federal." }], sel: 1 });
      LX.Timeline(H("div", { class: "lx-card x4-tl" }, xhost), { title: "One federal rule in time: Order No. 2222",
        events: timelineEvents(D) });
      var nx = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Where this connects" }, nx);
      var ul = H("ul", { class: "x4-next" }, nx);
      [["A3", "the market rules FERC oversees"], ["A4", "how a rate becomes a bill"], ["A12", "the policy instruments that laws create"], ["F9", "who decides what in a city"], ["A6", "the interconnection rules a new plant meets"]]
        .forEach(function (x) { H("li", { html: LX.lessonRefHTML(P, x[0]) + ": " + LX.esc(x[1]) + "." }, ul); });
    }
    buildExplain();

    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(5, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, D: D, cards: cards };
  });
})();
