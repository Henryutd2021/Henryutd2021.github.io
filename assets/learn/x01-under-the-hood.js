// x01-under-the-hood.js — Side topic X1, "What engineering lies beneath the system?" (step cards, Foundations, side
// line, D1, no model). Nuclear scope: the reactor core card is physics,
// thermal hydraulics and materials only.
//
// Data (read through data-src, never retyped):
//   data/x01-under-the-hood.json   eight components (discipline, two questions, what models borrow, reading), the seven
//                                  kinds of borrowed number, the predict, the sort, the cyber question, the stop box
//   data/x01-inputs.json           only the fields X1 reads from five other lessons' files, written and checked by the
//                                  test (PROJ below): from f04-power-plants.json the Betz limit, the best measured power
//                                  coefficient and the U.S. combined-cycle heat rate (2025); from f05-nuclear-basics.json
//                                  the outlet temperature of large water-cooled reactors, the 2025 nuclear heat rate and
//                                  3,412 Btu in a kWh; from 13-capstone.json the course battery's round trip and life;
//                                  from a16-hydrogen-ptx.json the electrolyzer's kWh per kg and minimum loads; from
//                                  town.json the combined-cycle plant's ramp limit (illustrative)
//   data/path.json                 lesson links that appear once a lesson is live
// Each efficiency shown is read as a share: 3,412 Btu per kWh ÷ heat rate (Btu per kWh). The reader does no arithmetic.
//
// Shared components: LX.StepCards, LX.Predict, LX.CardSort, LX.ConceptMap, LX.CompareTable, LX.lessonRefHTML,
// LX.demo. Lesson-local: the component board (tiles that open cards, lit by kind).
(function () {
  "use strict";
  var KEY = "x01_under_the_hood";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function inputs(data) { var Y = data.x01_inputs; return { X: data[KEY], F4: Y.F4, F5: Y.F5, C13: Y.C13, A16: Y.A16, T: Y.T }; }
  // the projection of the other lessons' files: only the fields X1 reads (the test writes and checks it). A list names the
  // fields to copy whole; an object recurses; "plants" keeps only the combined-cycle row.
  var SRC4 = ["publisher", "title", "url", "as_of"];
  var PROJ = { F4: { plants: ["key", "heatRate"], facts: { betz: ["value"], cpBest: ["value"] }, sources: { eia_pv: SRC4, nrel_dl15: SRC4, eia_t82: SRC4 } },
    F5: { facts: { btu_per_kwh: ["value"], heat_rate_btu_kwh: ["value", "year"], lwr_outlet_c: ["text"] }, sources: { qtr_lwr: SRC4, eia_heatrate: SRC4 } },
    C13: { techs: { battery: ["rte", "life"] }, sources: { "nrel-battery-2025": ["text", "url", "asOf"] } },
    A16: { electrolyzer: ["kWhPerKg", "minLoad", "source", "loadSource"] }, T: { fleet: { cc: ["label", "ramp"] } } };
  function projectInputs(full) {   // full: { F4, F5, C13, A16, T } as the lessons' files hold them
    function pick(src, spec) {
      if (Array.isArray(spec)) { var o = {}; spec.forEach(function (k) { o[k] = src[k]; }); return o; }
      var r = {}; Object.keys(spec).forEach(function (k) {
        r[k] = k === "plants" ? src.plants.filter(function (p) { return p.key === "cc"; }).map(function (p) { return pick(p, spec.plants); }) : pick(src[k], spec[k]); });
      return r;
    }
    var out = {}; Object.keys(PROJ).forEach(function (k) { out[k] = pick(full[k], PROJ[k]); }); return out;
  }
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function src4(s) { return { label: s.publisher + ", " + s.title, url: s.url, asof: s.as_of }; }
  function plant(F4, key) { return F4.plants.filter(function (p) { return p.key === key; })[0]; }
  // the numbers this course already borrows, by component, each read from the lesson that teaches it; each carries the kind
  // of number it is (kind: null for the inverter's "DC to AC", which says what the device does) and a short label, so the
  // kinds step shows only the values of the kind picked and the no-JS block names every value
  function numbers(I) {
    var btu = I.F5.facts.btu_per_kwh.value, cc = plant(I.F4, "cc"), hrN = I.F5.facts.heat_rate_btu_kwh, b = I.C13.techs.battery, E = I.A16.electrolyzer;
    var effCC = btu / cc.heatRate, effN = btu / hrN.value, bat = { label: I.C13.sources["nrel-battery-2025"].text.split(" (")[0], url: I.C13.sources["nrel-battery-2025"].url, asof: I.C13.sources["nrel-battery-2025"].asOf };
    return {
      inverter: [{ n: "DC to AC", label: "what it does", kind: null, what: "Solar cells make direct current; an inverter turns it into the grid's alternating current.", lesson: "F4", src: src4(I.F4.sources.eia_pv) }],
      relay: [{ n: "Thermal rating", label: "a line's limit", kind: "rating", what: "The most current a line or transformer can carry before it overheats; models keep flows under it. A relay is different: it detects a [[fault|fault]] and tells a breaker to open.", lesson: "A17", src: { label: "Lesson A17", url: null, asof: "this course" } }],
      blade: [{ n: fmtN(I.F4.facts.betz.value, 1) + "%", label: "the Betz limit", kind: "efficiency", what: "The most of the wind's power any rotor can take, the Betz limit (physics).", lesson: "F4", src: { label: "Physics: 16/27 of the wind's power", url: null, asof: "lesson 5" } },
              { n: fmtN(I.F4.facts.cpBest.value, 2), label: "best measured power coefficient", kind: "efficiency", what: "The best measured [[power-coefficient|power coefficient]] of DOE's 1.5 MW test turbine: the share of the wind's power it turned into electricity.", lesson: "F4", src: src4(I.F4.sources.nrel_dl15) }],
      combustor: [{ n: fmtN(cc.heatRate) + " Btu/kWh", label: "whole-plant heat rate, 2025 full-load test", kind: "efficiency", what: "EIA's 2025 average full-load tested heat rate for U.S. natural-gas combined-cycle plants, a whole-plant value the turbines and cooling shape too: about " + fmtN(100 * effCC, 1) + "% of the fuel's energy becomes electricity at full load.", lesson: "F4", src: src4(I.F4.sources.eia_t82), eff: effCC },
                  { n: fmtN(I.T.fleet.cc.ramp) + " MW per hour", label: "whole-plant ramp limit, Prairie Town", kind: "ramp", what: "The ramp limit of Prairie Town's whole combined-cycle plant (illustrative).", lesson: "0", src: { label: "Prairie Town (fictional)", url: null, asof: "illustrative" } }],
      core: [{ n: I.F5.facts.lwr_outlet_c.text, label: "outlet temperature", kind: "outlet", what: "The outlet temperature of large water-cooled reactors.", lesson: "F5", src: src4(I.F5.sources.qtr_lwr) },
             { n: fmtN(hrN.value) + " Btu/kWh", label: "whole-plant heat rate, " + hrN.year, kind: "efficiency", what: "The U.S. nuclear fleet's " + hrN.year + " heat rate, a whole-plant value the turbine and cooling shape too: about " + fmtN(100 * effN, 1) + "% of the core's heat becomes electricity.", lesson: "F5", src: src4(I.F5.sources.eia_heatrate), eff: effN }],
      electrolyzer: [{ n: fmtN(E.kWhPerKg) + " kWh/kg", label: "whole-system electricity use", kind: "efficiency", what: "A16 assumes about " + fmtN(E.kWhPerKg) + " kWh per kilogram of hydrogen for the complete PEM electrolyzer system; stack design helps set that system value.", lesson: "A16", src: { label: E.source.label, url: E.source.url, asof: E.source.as_of } },
                     { n: "PEM " + fmtN(100 * E.minLoad.pem) + "%, alkaline " + fmtN(100 * E.minLoad.alk) + "%", label: "minimum loads", kind: "minload", what: "A16 assumes these lowest steady loads for [[pem-electrolyzer|PEM]] and [[alkaline-electrolyzer|alkaline]] electrolyzers, as a share of their size, from IRENA's 2020 overview; real equipment varies.", lesson: "A16", src: { label: E.loadSource.label, url: E.loadSource.url, asof: E.loadSource.as_of } }],
      cell: [{ n: fmtN(100 * b.rte) + "%", label: "round trip of the battery system", kind: "efficiency", what: "The course assumes " + fmtN(100 * b.rte) + "% of the electricity sent into its utility-scale battery system comes back out: charging and discharging losses together, for the whole system, not one cell.", lesson: "13", src: bat },
             { n: b.life + " years", label: "life", kind: "reliability", what: "The life the course gives that battery system.", lesson: "13", src: bat }],
      control: [{ n: "CIP", label: "cybersecurity standards", kind: "rules", what: "The mandatory Critical Infrastructure Protection (CIP) standards of the North American Electric Reliability Corporation (NERC) cover the [[bulk-power-system|bulk power system]]'s cyber systems, in general not those on the distribution grid.", lesson: null, src: { label: I.X.sources["nerc-sites"].text.split(" (")[0], url: I.X.sources["nerc-sites"].url, asof: "December 2022" } }]
    };
  }
  // the values of one kind for one component, or none (the kinds step: "This course does not quantify this property here.")
  var NONE = "This course does not quantify this property here.";
  function kindValues(I, id, kid) { return numbers(I)[id].filter(function (n) { return n.kind === kid; }); }
  // a component's card: what shows at once (the discipline, one question, what models borrow) and what opens under "More"
  // (the second question, the course's numbers one per line, the book), so each part keeps to the text budget
  function cardParts(I, id) {
    var c = comp(I.X, id);
    return { head: c.label + " · " + c.discipline, ask: c.qs[0], borrow: c.text, more: { ask: c.qs[1], nums: numbers(I)[id].map(function (n) { return "**" + n.n + "** (" + n.label + "): " + n.what; }), read: c.read } };
  }
  function comp(X, id) { return X.components.filter(function (c) { return c.id === id; })[0]; }
  function kind(X, id) { return X.kinds.filter(function (k) { return k.id === id; })[0]; }
  function withKind(X, kid) { return X.components.filter(function (c) { return c.borrows.indexOf(kid) >= 0; }).map(function (c) { return c.id; }); }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  var STEPS = [
    "Behind every number in an energy model sits a device that someone designed. A planner models Prairie Town's wind farm: what does she take from the engineers who design its blades?",
    "Eight components, eight kinds of engineering. Tap at least four to see the discipline that designs each, a question it answers and what system models borrow; More opens the rest.",
    "Borrowed or left to the engineers? Sort all eight items: a system model takes numbers with units, while the design behind them stays with the discipline.",
    "System models borrow a few kinds of number. Tap at least three kinds to light the components that supply each one, with the values this course uses.",
    "Control rooms run on software, so cybersecurity is engineering too. Do the mandatory cybersecurity standards of NERC, the North American Electric Reliability Corporation, cover a home's rooftop solar inverter on a local [[feeder|feeder]]?"
  ];
  var BOARD_MIN = 4, KIND_MIN = 3;
  function boardCount(n) { return n >= BOARD_MIN ? "Components opened: " + n + " of 8." : "Components opened: " + n + " of at least " + BOARD_MIN + "."; }
  function kindCount(n, total) { return n >= KIND_MIN ? "Kinds tried: " + n + " of " + total + "." : "Kinds tried: " + n + " of at least " + KIND_MIN + "."; }
  function kindLine(X, kid) {
    var k = kind(X, kid), names = withKind(X, kid).map(function (id) { return comp(X, id).label.toLowerCase(); });
    return "**" + k.label + "**: " + k.text + " Supplied here by: " + names.join(", ") + ".";
  }
  // the sort is checked only with every card placed (an empty check no longer unlocks Next)
  function sortNote(g) { return g.placed < g.total ? "Place every card first: " + (g.total - g.placed) + " still in the pool." : g.right + " of " + g.total + " match."; }
  var BOARD_SAW = "Each discipline answers its own questions; a system model keeps only the numbers it needs from each answer.";
  var SORT_SAW = "Borrowed: heat rate, round trip, power curve, kWh per kilogram. Kept: flame shape, electrode coating, fiber layup and catalyst, which reach the model only through those numbers.";
  var KIND_SAW = "Ratings, efficiencies, ramp limits, minimum loads, outlet temperatures, and reliability and life carry the devices into the model; operating rules carry the control room.";
  var KINDS_LIST = "ratings, efficiencies, ramp limits, minimum loads, outlet temperatures, and reliability and life";

  // ---------------------------------------------------------------- the no-JS block, ideas, check, facts, sources
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  // escaped text with glossary marks (two square brackets: id, a bar, words) and **bold**, as LX.rich writes them (pure, for the static blocks)
  // (the attribute is built in pieces so the build's term scanner does not read "$1" as an id, as A4 does)
  function richS(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; }).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function kindsOf(X, c) { return c.borrows.map(function (k) { return kind(X, k).label.toLowerCase(); }).join(", "); }
  function numsLine(N, id) { return N[id].map(function (n) { return n.n + " (" + n.label + ")"; }).join("; "); }
  // the no-JS block: one closed box per component with everything the interactive card shows (both questions, what
  // models borrow, each course number with its label and meaning, the book), then the seven kinds
  function staticFallback(I) {
    var X = I.X;
    return "<p class=\"lx-eyebrow\">Eight components, the discipline behind each, and what system models borrow</p><div class=\"x1-fb\">" +
      X.components.map(function (c) {
        var P = cardParts(I, c.id);
        return "<details class=\"x1-fbd\"><summary><b>" + esc(c.label) + "</b> · " + esc(c.discipline) + "</summary><dl class=\"x1-dl\">" +
          "<dt>Asks</dt><dd><ul>" + c.qs.map(function (q) { return "<li>" + richS(q) + "</li>"; }).join("") + "</ul></dd>" +
          "<dt>Models borrow</dt><dd>" + richS(c.text) + "</dd>" +
          "<dt>In this course</dt><dd><ul>" + P.more.nums.map(function (t) { return "<li>" + richS(t) + "</li>"; }).join("") + "</ul></dd>" +
          "<dt>Read next</dt><dd>" + esc(c.read) + "</dd></dl></details>";
      }).join("") + "</div>" +
      "<p class=\"lx-eyebrow\" style=\"margin-top:10px\">The kinds of number a model borrows</p><ul>" + X.kinds.map(function (k) { return "<li><b>" + esc(k.label) + "</b>: " + esc(k.text) + "</li>"; }).join("") + "</ul>" +
      "<p class=\"lx-hint\">With JavaScript on, you tap each component, sort what models borrow, and light the components by the kind of number they supply.</p>";
  }
  function ideasHTML(I) {
    return "<dl class=\"lx-ideas\">" +
      "<dt>Disciplines</dt><dd>Power electronics, protection, aerodynamics, combustion, reactor physics, electrochemistry and control each design a part of the system.</dd>" +
      "<dt>What crosses over</dt><dd>A system model borrows " + KINDS_LIST + ", plus the control room's operating rules.</dd>" +
      "<dt>What stays</dt><dd>Designs, materials and calculations stay with each discipline; the model sees them only through the numbers they lead to.</dd>" +
      "<dt>Cybersecurity</dt><dd>" + richS("NERC's mandatory standards protect the [[bulk-power-system|bulk power system]]'s cyber systems; distribution-grid devices are in general outside them.") + "</dd></dl>";
  }
  // the second check matches a device's limit to the kind of number it is (no arithmetic: this side topic stays at awareness)
  function checkHTML(I) {
    var X = I.X, K = function (id) { return esc(kind(X, id).label); };
    return "<div class=\"lx-myths\" data-quiz=\"x01-myth\">" +
      "<div class=\"lx-qq\" data-id=\"design\" data-answer=\"myth\"><p class=\"lx-qtext\">Myth or fact? “To plan a grid, a modeler needs the full design of every turbine and inverter.”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>Myth. A system model borrows a few numbers from each design (" + KINDS_LIST + "); the design itself stays with the engineers.</p></details></div>" +
      "</div><div class=\"lx-quiz\" data-quiz=\"x01\">" +
      "<div class=\"lx-qq\" data-id=\"kind\" data-answer=\"b\"><p class=\"lx-qtext\">An electrolyzer engineer reports the lowest output the stack can hold steadily, as a share of its size. Which kind of number does a system model borrow?</p><ul class=\"lx-choices\"><li data-value=\"a\">" + K("rating") + "</li><li data-value=\"b\">" + K("minload") + "</li><li data-value=\"c\">" + K("ramp") + "</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + K("minload") + ": below it the stack must stop. A rating is the most it can take; a ramp limit is how fast its output can change.</p></details></div>" +
      "</div>";
  }
  function factsRows(I) {
    var N = numbers(I);
    return [N.blade[0], N.combustor[0], N.core[0], N.electrolyzer[0], N.cell[0]];
  }
  function factsHTML(I) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      factsRows(I).map(function (f) { var s = f.src; return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + richS(f.what) + "</td><td class=\"s\">" + (s.url ? "<a href=\"" + esc(s.url) + "\">" + esc(s.label) + "</a>" : esc(s.label)) + " · " + esc(s.asof) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function sourcesHTML(I) {
    var X = I.X, N = numbers(I), seen = {}, out = [];
    Object.keys(N).forEach(function (k) { N[k].forEach(function (n) { var s = n.src; if (!s.url || seen[s.url]) return; seen[s.url] = 1; out.push("<li>" + esc(s.label) + ". <a href=\"" + esc(s.url) + "\">Link</a>. " + esc(s.asof) + ".</li>"); }); });
    Object.keys(X.sources).forEach(function (k) { var s = X.sources[k]; if (seen[s.url]) return; seen[s.url] = 1; out.push("<li>" + esc(s.text) + ". <a href=\"" + esc(s.url) + "\">Link</a>. " + esc(s.asOf.charAt(0).toUpperCase() + s.asOf.slice(1)) + ".</li>"); });
    return "<p class=\"lx-hint\">The numbers, read from the lessons that teach them, and the cybersecurity paper:</p><ul>" + out.join("") + "</ul>" +
      "<p class=\"lx-hint\">One book per discipline (cited by name; any recent edition):</p><ul>" + X.components.map(function (c) { return "<li>" + esc(c.discipline) + ": " + esc(c.read) + ".</li>"; }).join("") + "</ul>";
  }

  var model = { inputs: inputs, projectInputs: projectInputs, PROJ: PROJ, numbers: numbers, comp: comp, kind: kind, withKind: withKind, kindValues: kindValues, NONE: NONE, cardParts: cardParts, STEPS: STEPS, BOARD_MIN: BOARD_MIN, KIND_MIN: KIND_MIN,
    boardCount: boardCount, kindCount: kindCount, kindLine: kindLine, sortNote: sortNote, BOARD_SAW: BOARD_SAW, SORT_SAW: SORT_SAW, KIND_SAW: KIND_SAW, KINDS_LIST: KINDS_LIST, kindsOf: kindsOf, numsLine: numsLine,
    staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, factsRows: factsRows, factsHTML: factsHTML, sourcesHTML: sourcesHTML, fmtN: fmtN, richS: richS };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function lessonList(P, codes) { return codes.map(function (c) { return LX.lessonRefHTML(P, /^\d+$/.test(c) ? +c : c); }).join(", "); }
  // the component board: eight tiles (buttons); a card under it; tiles can be lit by kind. show(id) opens a component's
  // card (the discipline, one question and what models borrow; "More" holds the second question, the course's numbers
  // and a book); show(id, kid) shows only that component's values of kind kid, or says the course has none
  function Board(host, I, P, o) {
    var X = I.X, wrap = H("div", { class: "x1-board" }, host), btn = {};
    var grid = H("div", { class: "x1-tiles", role: "group", "aria-label": "Eight components" }, wrap);
    X.components.forEach(function (c) {
      var b = H("button", { type: "button", class: "x1-tile", "aria-pressed": "false" }, grid);
      H("span", { class: "x1-ic", html: LX.icon(c.icon) }, b); H("span", { class: "t", text: c.label }, b);
      b.addEventListener("click", function () { if (o.onPick) o.onPick(c.id); });
      btn[c.id] = b;
    });
    var card = H("div", { class: "x1-card", "aria-live": "polite" }, wrap);
    function press(id) { Object.keys(btn).forEach(function (k) { btn[k].setAttribute("aria-pressed", String(k === id)); }); }
    function show(id, kid) {
      var c = comp(X, id), C = cardParts(I, id); press(id);
      if (kid) {
        var vals = kindValues(I, id, kid);
        card.innerHTML = "<p class=\"x1-disc\"><b>" + LX.esc(c.label) + "</b> · " + LX.esc(kind(X, kid).label) + "</p>" +
          (vals.length ? "<ul class=\"x1-vals\">" + vals.map(function (n) { return "<li>" + bold("**" + n.n + "** (" + n.label + "): " + n.what) + "</li>"; }).join("") + "</ul>" : "<p>" + LX.esc(NONE) + "</p>") +
          "<p class=\"lx-hint\">See " + lessonList(P, c.lessons) + ".</p>";
        return;
      }
      card.innerHTML = "<p class=\"x1-disc\"><b>" + LX.esc(c.label) + "</b> · " + LX.esc(c.discipline) + "</p>" +
        "<dl class=\"x1-dl\"><dt>Asks</dt><dd>" + bold(C.ask) + "</dd><dt>Models borrow</dt><dd>" + bold(C.borrow) + "</dd></dl>" +
        "<details class=\"x1-more\"><summary>More: a second question, the course's numbers, a book</summary><dl class=\"x1-dl\">" +
        "<dt>Also asks</dt><dd>" + bold(C.more.ask) + "</dd>" +
        "<dt>In this course</dt><dd><ul>" + C.more.nums.map(function (t) { return "<li>" + bold(t) + "</li>"; }).join("") + "</ul>See " + lessonList(P, c.lessons) + ".</dd>" +
        "<dt>Read next</dt><dd>" + LX.esc(C.more.read) + "</dd></dl></details>";
      var d = card.querySelector("details"); if (d) d.addEventListener("toggle", function () { LX.emit("layout"); });
    }
    function light(ids) { Object.keys(btn).forEach(function (k) { btn[k].classList.toggle("lit", ids.indexOf(k) >= 0); btn[k].classList.toggle("dim", ids.length > 0 && ids.indexOf(k) < 0); }); }
    return { el: wrap, show: show, light: light, card: card };
  }

  LX.mount("x01", function (live, data, root) {
    var I = inputs(data), X = I.X, P = data.path, N = numbers(I), demo = [];
    var cards = LX.StepCards(live, { id: "x1-steps", steps: [
      { text: STEPS[0], build: function (act, api) {
          var Q = X.predict;
          var pr = LX.Predict(act, { id: "x1-blade", q: Q.q, title: false, answer: Q.answer, options: Q.options, feedback: Q.feedback, onPick: function () { pr.reveal(); api.done(); } });
          if (pr.picked()) { pr.reveal(); api.done(); }
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } },
      { text: STEPS[1], build: function (act, api) {
          var seen = {}, cnt;
          var bd = Board(act, I, P, { onPick: function (id) { seen[id] = true; bd.show(id); var n = Object.keys(seen).length; cnt.textContent = boardCount(n); if (n >= BOARD_MIN) { api.done(); api.saw(BOARD_SAW); } } });
          cnt = H("p", { class: "lx-hint", "aria-live": "polite", text: boardCount(0) }, act);
          bd.card.textContent = "Tap a component.";
          demo[1] = function () { X.components.slice(0, BOARD_MIN).forEach(function (c) { bd.el.querySelectorAll(".x1-tile")[X.components.indexOf(c)].click(); }); };
        } },
      { text: STEPS[2], build: function (act, api) {
          var S = X.sort, note = H("p", { class: "lx-step-line", "aria-live": "polite" });
          var cs = LX.CardSort(act, { bins: S.bins, cards: S.cards, maxWhy: 8, onCheck: function (g) {
            note.textContent = sortNote(g);
            if (g.placed < g.total) { api.saw(sortNote(g), true); return; }
            api.done(); api.saw(SORT_SAW); } });
          act.appendChild(note);
          demo[2] = function () { var m = {}; S.cards.forEach(function (c) { m[c.id] = c.bin; }); cs.place(m); cs.check(); };
        } },
      { text: STEPS[3], build: function (act, api) {
          var seen = {}, seg = H("div", { class: "lx-seg x1-kinds", role: "group", "aria-label": "Kinds of borrowed number" }, act), kb = {};
          var line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          var cur = null, bd = Board(act, I, P, { onPick: function (id) { bd.show(id, cur); } });
          var cnt = H("p", { class: "lx-hint", "aria-live": "polite", text: kindCount(0, X.kinds.length) }, act);
          bd.card.textContent = "Tap a kind above, then any lit component for its numbers.";
          X.kinds.forEach(function (k) { kb[k.id] = H("button", { type: "button", text: k.label, "aria-pressed": "false" }, seg); kb[k.id].addEventListener("click", function () { pick(k.id); }); });
          function pick(kid) {
            seen[kid] = true; cur = kid; Object.keys(kb).forEach(function (j) { kb[j].setAttribute("aria-pressed", String(j === kid)); });
            var ids = withKind(X, kid), first = ids.filter(function (id) { return kindValues(I, id, kid).length; })[0] || ids[0];
            bd.light(ids); bd.show(first, kid); line.innerHTML = bold(kindLine(X, kid));
            var n = Object.keys(seen).length; cnt.textContent = kindCount(n, X.kinds.length);
            if (n >= KIND_MIN) { api.done(); api.saw(KIND_SAW); }
          }
          demo[3] = function () { ["rating", "efficiency", "outlet"].forEach(pick); };
        } },
      { text: STEPS[4], build: function (act, api) {
          var Q = X.cyber;
          var pr = LX.Predict(act, { id: "x1-cyber", q: Q.q, title: false, answer: Q.answer, options: Q.options, feedback: Q.feedback, onPick: function () { pr.reveal(); api.done(); buildExplain(); } });
          if (pr.picked()) { pr.reveal(); api.done(); }
          H("p", { class: "lx-hint", text: "NERC, Cyber Security for Distributed Energy Resources and DER Aggregators (December 2022), p. 2." }, act);
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "The disciplines and what crosses over, as diagrams" + LX.icon("arrow") }, act);
          demo[4] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } }
    ] });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("x01-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      LX.ConceptMap(H("div", { class: "lx-xcard" }, xhost), {
        title: "From a discipline to a number in the model", lede: "Tap an idea: each discipline hands the model a few kinds of number.",
        groups: { disc: ["Disciplines", "var(--lx-tier-1)"], num: ["What models borrow", "var(--lx-tier-2)"], model: ["The system model", "var(--lx-tier-4)"] },
        cols: 3, rows: 6, colsN: 3, rowsN: 6, sel: "eff", gameLabel: "In this lesson",
        nodes: [
          { id: "pe", g: "disc", label: "Power electronics", lines: ["Power", "electronics"], at: [0, 0.5], text: "Power electronics and protection design inverters and relays: how power is converted, and how a fault is found and a breaker told to open." },
          { id: "mech", g: "disc", label: "Aero, combustion", lines: ["Aero,", "combustion"], at: [0, 1.75], text: "Aerodynamics and combustion design blades and combustors: how much power a rotor catches, how hot a flame burns." },
          { id: "nucl", g: "disc", label: "Reactor physics", lines: ["Reactor", "physics"], at: [0, 3], text: "With thermal hydraulics and materials: a steady chain reaction and the heat carried out of the core." },
          { id: "chem", g: "disc", label: "Electrochemistry", lines: ["Electro-", "chemistry"], at: [0, 4.25], text: "Design battery cells and electrolyzer stacks: energy held, kWh per kilogram, wear." },
          { id: "ctl", g: "disc", label: "Control, cyber", lines: ["Control,", "cyber"], at: [2, 0], text: "Control engineering and cybersecurity design the control room's software and protect it; NERC's CIP standards cover the bulk power system." },
          { id: "rating", g: "num", label: "Ratings", at: [1, 0], text: "MW, MWh and line limits." },
          { id: "eff", g: "num", label: "Efficiencies", at: [1, 1], text: "A round trip is output per input; a heat rate and kWh per kilogram are input per output, so lower is better." },
          { id: "ramp", g: "num", label: "Ramp limits", lines: ["Ramp", "limits"], at: [1, 2], text: "How fast output can change, in MW per hour." },
          { id: "minl", g: "num", label: "Minimum loads", lines: ["Minimum", "loads"], at: [1, 3], text: "The lowest output a machine can hold steadily, as a share of its size: a separate limit from the ramp." },
          { id: "out", g: "num", label: "Outlet temperatures", lines: ["Outlet", "temps"], at: [1, 4], text: "How hot the heat is, which sets its uses." },
          { id: "fail", g: "num", label: "Reliability and life", lines: ["Reliability,", "life"], at: [1, 5], text: "Three separate numbers: how often equipment fails, how long each outage lasts, and how many years it serves." },
          { id: "model", g: "model", label: "System model", lines: ["System", "model"], at: [2, 2.5], text: "Dispatch, planning and adequacy models run on these numbers and on operating rules." }
        ],
        edges: [["pe", "rating", "sets"], ["mech", "eff", "sets"], ["mech", "ramp", "sets"], ["mech", "minl", "sets"], ["nucl", "out", "sets"], ["chem", "eff", "sets"], ["chem", "minl", "sets"], ["chem", "fail", "sets"], ["ctl", "model", "rules"],
                ["rating", "model", "in"], ["eff", "model", "in"], ["ramp", "model", "in"], ["minl", "model", "in"], ["out", "model", "in"], ["fail", "model", "in"]] });
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), { title: "The eight components at a glance", text: true,
        columns: [{ key: "name", label: "Component", main: true }, { key: "disc", label: "Discipline" }, { key: "kinds", label: "Models borrow" }, { key: "num", label: "In this course" }],
        rows: X.components.map(function (c) { return { key: c.id, color: "var(--lx-tier-1)", name: c.label, disc: c.discipline, kinds: kindsOf(X, c), num: numsLine(N, c.id) }; }) });
    }
    buildExplain();

    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(4, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, cards: cards };
  });
})();
