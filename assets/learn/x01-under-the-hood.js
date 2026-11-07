// x01-under-the-hood.js — Side topic X1, "What engineering lies beneath the system?" (step cards, Foundations, side
// line, D1, no model; wave W7, builder learn-w7-a, 2026-11-07). Guard G-NUC: the reactor core card is physics,
// thermal hydraulics and materials only.
//
// Data (read through data-src, never retyped):
//   data/x01-under-the-hood.json   eight components (discipline, two questions, what models borrow, reading), the six
//                                  kinds of borrowed number, the predict, the sort, the cyber question, the stop box
//   data/f04-power-plants.json     the Betz limit, the best measured power coefficient, U.S. combined-cycle heat rate (2025)
//   data/f05-nuclear-basics.json   the outlet temperature of large water-cooled reactors, the 2025 nuclear heat rate,
//                                  3,412 Btu in a kWh
//   data/13-capstone.json          the course battery's round trip and life
//   data/a16-hydrogen-ptx.json     the electrolyzer's kWh per kg and its minimum loads
//   data/town.json                 the combined-cycle plant's ramp limit (illustrative)
//   data/path.json                 lesson links that appear once a lesson is live
// Arithmetic only: efficiency = 3,412 Btu ÷ heat rate (Btu per kWh).
//
// Shared components: LX.StepCards, LX.Predict, LX.CardSort, LX.ConceptMap, LX.CompareTable, LX.lessonRefHTML,
// LX.demo. Lesson-local: the component board (tiles that open cards, lit by kind).
(function () {
  "use strict";
  var KEY = "x01_under_the_hood";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function inputs(data) { return { X: data[KEY], F4: data.f04_power_plants, F5: data.f05_nuclear_basics, C13: data["13_capstone"], A16: data.a16_hydrogen_ptx, T: data.town }; }
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function src4(s) { return { label: s.publisher + ", " + s.title, url: s.url, asof: s.as_of }; }
  function plant(F4, key) { return F4.plants.filter(function (p) { return p.key === key; })[0]; }
  // the numbers this course already borrows, by component, each read from the lesson that teaches it
  function numbers(I) {
    var btu = I.F5.facts.btu_per_kwh.value, cc = plant(I.F4, "cc"), hrN = I.F5.facts.heat_rate_btu_kwh, b = I.C13.techs.battery, E = I.A16.electrolyzer;
    var effCC = btu / cc.heatRate, effN = btu / hrN.value;
    return {
      inverter: [{ n: "DC to AC", what: "Solar cells make direct current; an inverter turns it into the grid's alternating current.", lesson: "F4", src: src4(I.F4.sources.eia_pv) }],
      relay: [{ n: "Thermal rating", what: "The most current a line or transformer can carry before it overheats; relays clear faults that would exceed it.", lesson: "A17", src: { label: "Lesson A17", url: null, asof: "this course" } }],
      blade: [{ n: fmtN(I.F4.facts.betz.value, 1) + "%", what: "The most of the wind's power any rotor can take, the Betz limit (physics).", lesson: "F4", src: { label: "Physics: 16/27 of the wind's power", url: null, asof: "lesson 5" } },
              { n: fmtN(I.F4.facts.cpBest.value, 2), what: "The best measured power coefficient of DOE's 1.5 MW test turbine.", lesson: "F4", src: src4(I.F4.sources.nrel_dl15) }],
      combustor: [{ n: fmtN(cc.heatRate) + " Btu/kWh", what: "U.S. combined-cycle plants' 2025 tested heat rate: " + fmtN(btu) + " ÷ " + fmtN(cc.heatRate) + " = " + fmtN(100 * effCC, 1) + "% of the fuel's energy becomes electricity.", lesson: "F4", src: src4(I.F4.sources.eia_t82), eff: effCC },
                  { n: fmtN(I.T.fleet.cc.ramp) + " MW per hour", what: "The ramp limit of Prairie Town's combined-cycle plant (illustrative).", lesson: "0", src: { label: "Prairie Town (fictional)", url: null, asof: "illustrative" } }],
      core: [{ n: I.F5.facts.lwr_outlet_c.text, what: "The outlet temperature of large water-cooled reactors.", lesson: "F5", src: src4(I.F5.sources.qtr_lwr) },
             { n: fmtN(hrN.value) + " Btu/kWh", what: "The U.S. nuclear fleet's " + hrN.year + " heat rate: " + fmtN(btu) + " ÷ " + fmtN(hrN.value) + " = " + fmtN(100 * effN, 1) + "% of the heat becomes electricity.", lesson: "F5", src: src4(I.F5.sources.eia_heatrate), eff: effN }],
      electrolyzer: [{ n: fmtN(E.kWhPerKg) + " kWh/kg", what: "Electricity per kilogram of hydrogen in lesson A16.", lesson: "A16", src: { label: E.source.label, url: E.source.url, asof: E.source.as_of } },
                     { n: fmtN(100 * E.minLoad.pem) + "% and " + fmtN(100 * E.minLoad.alk) + "%", what: "The lowest steady load of PEM and of alkaline electrolyzers, as a share of their size.", lesson: "A16", src: { label: E.loadSource.label, url: E.loadSource.url, asof: E.loadSource.as_of } }],
      cell: [{ n: fmtN(100 * b.rte) + "%", what: "The round trip of the course's lithium-ion battery: the share of stored energy that comes back.", lesson: "13", src: { label: I.C13.sources["nrel-battery-2025"].text.split(" (")[0], url: I.C13.sources["nrel-battery-2025"].url, asof: I.C13.sources["nrel-battery-2025"].asOf } },
             { n: b.life + " years", what: "The life the course gives that battery.", lesson: "13", src: { label: I.C13.sources["nrel-battery-2025"].text.split(" (")[0], url: I.C13.sources["nrel-battery-2025"].url, asof: I.C13.sources["nrel-battery-2025"].asOf } }],
      control: [{ n: "CIP", what: "NERC's mandatory cybersecurity standards cover the bulk power system's cyber systems, in general not those on the distribution grid.", lesson: null, src: { label: I.X.sources["nerc-sites"].text.split(" (")[0], url: I.X.sources["nerc-sites"].url, asof: "December 2022" } }]
    };
  }
  function comp(X, id) { return X.components.filter(function (c) { return c.id === id; })[0]; }
  function kind(X, id) { return X.kinds.filter(function (k) { return k.id === id; })[0]; }
  function withKind(X, kid) { return X.components.filter(function (c) { return c.borrows.indexOf(kid) >= 0; }).map(function (c) { return c.id; }); }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  var STEPS = [
    "Behind every number in an energy model sits a device that someone designed. A planner models Prairie Town's wind farm: what does she take from the engineers who design its blades?",
    "Eight components, eight kinds of engineering. Tap at least four to see the discipline that designs each, two questions it answers and what system models borrow from it.",
    "Borrowed or left to the engineers? Sort eight items: a system model takes numbers with units, while the design behind them stays with the discipline.",
    "System models borrow a few kinds of number. Tap at least three kinds to light the components that supply each one, with the values this course uses.",
    "Control rooms run on software, so cybersecurity is engineering too. Do NERC's mandatory cybersecurity standards cover a home's rooftop solar inverter on a local feeder?"
  ];
  var BOARD_MIN = 4, KIND_MIN = 3;
  function boardCount(n) { return n >= BOARD_MIN ? "Components opened: " + n + " of 8." : "Components opened: " + n + " of at least " + BOARD_MIN + "."; }
  function kindCount(n) { return n >= KIND_MIN ? "Kinds tried: " + n + " of 6." : "Kinds tried: " + n + " of at least " + KIND_MIN + "."; }
  function kindLine(X, kid) {
    var k = kind(X, kid), names = withKind(X, kid).map(function (id) { return comp(X, id).label.toLowerCase(); });
    return "**" + k.label + "**: " + k.text + " Supplied here by: " + names.join(", ") + ".";
  }
  var BOARD_SAW = "Each discipline answers its own questions; a system model keeps only the numbers it needs from each answer.";
  var SORT_SAW = "Borrowed: heat rate, round trip, power curve, kWh per kilogram. Kept: flame shape, electrode coating, fiber layup, catalyst. Each kept design shows up in the model only through a borrowed number.";
  var KIND_SAW = "Ratings, efficiencies, ramp limits, outlet temperatures and failure rates carry the devices into the model; operating rules carry the control room.";

  // ---------------------------------------------------------------- the no-JS block, ideas, check, facts, sources
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function kindsOf(X, c) { return c.borrows.map(function (k) { return kind(X, k).label.toLowerCase(); }).join(", "); }
  function staticFallback(I) {
    var X = I.X, N = numbers(I);
    return "<p class=\"lx-eyebrow\">Eight components, the discipline behind each, and what system models borrow</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table x1-fbt\"><thead><tr><th scope=\"col\">Component</th><th scope=\"col\">Discipline</th><th scope=\"col\">Models borrow</th><th scope=\"col\">In this course</th></tr></thead><tbody>" +
      X.components.map(function (c) { return "<tr><td>" + esc(c.label) + "</td><td>" + esc(c.discipline) + "</td><td>" + esc(c.text) + "</td><td>" + esc(N[c.id].map(function (n) { return n.n; }).join("; ")) + "</td></tr>"; }).join("") +
      "</tbody></table></div><p class=\"lx-hint\">With JavaScript on, you tap each component for its discipline and questions, sort what models borrow, and light the components by the kind of number they supply.</p>";
  }
  function ideasHTML(I) {
    return "<dl class=\"lx-ideas\">" +
      "<dt>Disciplines</dt><dd>Power electronics, protection, aerodynamics, combustion, reactor physics, electrochemistry and control each design a part of the system.</dd>" +
      "<dt>What crosses over</dt><dd>A system model borrows ratings, efficiencies, ramp limits, outlet temperatures and failure rates, plus the control room's operating rules.</dd>" +
      "<dt>What stays</dt><dd>Designs, materials and calculations stay with each discipline; the model sees them only through the numbers they lead to.</dd>" +
      "<dt>Cybersecurity</dt><dd>NERC's mandatory standards protect the bulk power system's cyber systems; distribution-grid devices are in general outside them.</dd></dl>";
  }
  function checkHTML(I) {
    var N = numbers(I), c = N.combustor[0], btu = I.F5.facts.btu_per_kwh.value, hr = plant(I.F4, "cc").heatRate, e = 100 * btu / hr;
    return "<div class=\"lx-myths\" data-quiz=\"x01-myth\">" +
      "<div class=\"lx-qq\" data-id=\"design\" data-answer=\"myth\"><p class=\"lx-qtext\">Myth or fact? “To plan a grid, a modeller needs the full design of every turbine and inverter.”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>Myth. A system model borrows a few numbers from each design (ratings, efficiencies, ramp limits, outlet temperatures, failure rates); the design itself stays with the engineers.</p></details></div>" +
      "</div><div class=\"lx-quiz\" data-quiz=\"x01\">" +
      "<div class=\"lx-qq\" data-id=\"eff\" data-answer=\"b\"><p class=\"lx-qtext\">U.S. combined-cycle plants burned " + fmtN(hr) + " Btu of fuel per kWh in 2025, and one kWh holds " + fmtN(btu) + " Btu. About what share of the fuel's energy becomes electricity?</p><ul class=\"lx-choices\"><li data-value=\"a\">About " + fmtN(e / 2) + "%</li><li data-value=\"b\">About " + fmtN(e) + "%</li><li data-value=\"c\">About " + fmtN(Math.min(99, e * 1.5)) + "%</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + fmtN(btu) + " ÷ " + fmtN(hr) + " = " + fmtN(e / 100, 3) + ", about " + fmtN(e) + "%: the efficiency a model borrows as a heat rate (lesson F4).</p></details></div>" +
      "</div>";
  }
  function factsRows(I) {
    var N = numbers(I);
    return [N.blade[0], N.combustor[0], N.core[0], N.electrolyzer[0], N.cell[0]];
  }
  function factsHTML(I) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      factsRows(I).map(function (f) { var s = f.src; return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + "</td><td class=\"s\">" + (s.url ? "<a href=\"" + esc(s.url) + "\">" + esc(s.label) + "</a>" : esc(s.label)) + " · " + esc(s.asof) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function sourcesHTML(I) {
    var X = I.X, N = numbers(I), seen = {}, out = [];
    Object.keys(N).forEach(function (k) { N[k].forEach(function (n) { var s = n.src; if (!s.url || seen[s.url]) return; seen[s.url] = 1; out.push("<li>" + esc(s.label) + ". <a href=\"" + esc(s.url) + "\">Link</a>. " + esc(s.asof) + ".</li>"); }); });
    Object.keys(X.sources).forEach(function (k) { var s = X.sources[k]; if (seen[s.url]) return; seen[s.url] = 1; out.push("<li>" + esc(s.text) + ". <a href=\"" + esc(s.url) + "\">Link</a>. " + esc(s.asOf.charAt(0).toUpperCase() + s.asOf.slice(1)) + ".</li>"); });
    return "<p class=\"lx-hint\">The numbers, read from the lessons that teach them, and the cybersecurity paper:</p><ul>" + out.join("") + "</ul>" +
      "<p class=\"lx-hint\">One book per discipline (cited by name; any recent edition):</p><ul>" + X.components.map(function (c) { return "<li>" + esc(c.discipline) + ": " + esc(c.read) + ".</li>"; }).join("") + "</ul>";
  }

  var model = { inputs: inputs, numbers: numbers, comp: comp, kind: kind, withKind: withKind, STEPS: STEPS, BOARD_MIN: BOARD_MIN, KIND_MIN: KIND_MIN, boardCount: boardCount, kindCount: kindCount,
    kindLine: kindLine, BOARD_SAW: BOARD_SAW, SORT_SAW: SORT_SAW, KIND_SAW: KIND_SAW, kindsOf: kindsOf, staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML,
    factsRows: factsRows, factsHTML: factsHTML, sourcesHTML: sourcesHTML, fmtN: fmtN };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function lessonList(P, codes) { return codes.map(function (c) { return LX.lessonRefHTML(P, /^\d+$/.test(c) ? +c : c); }).join(", "); }
  // the component board: eight tiles (buttons); a card under it; tiles can be lit by kind
  function Board(host, I, P, o) {
    var X = I.X, N = numbers(I), wrap = H("div", { class: "x1-board" }, host), btn = {};
    var grid = H("div", { class: "x1-tiles", role: "group", "aria-label": "Eight components" }, wrap);
    X.components.forEach(function (c) {
      var b = H("button", { type: "button", class: "x1-tile", "aria-pressed": "false" }, grid);
      H("span", { class: "x1-ic", html: LX.icon(c.icon) }, b); H("span", { class: "t", text: c.label }, b);
      b.addEventListener("click", function () { if (o.onPick) o.onPick(c.id); });
      btn[c.id] = b;
    });
    var card = H("div", { class: "x1-card", "aria-live": "polite" }, wrap);
    function show(id) {
      var c = comp(X, id);
      Object.keys(btn).forEach(function (k) { btn[k].setAttribute("aria-pressed", String(k === id)); });
      card.innerHTML = "<p class=\"x1-disc\"><b>" + LX.esc(c.label) + "</b> · " + LX.esc(c.discipline) + "</p>" +
        "<dl class=\"x1-dl\"><dt>Asks</dt><dd><ul>" + c.qs.map(function (q) { return "<li>" + LX.esc(q) + "</li>"; }).join("") + "</ul></dd>" +
        "<dt>Models borrow</dt><dd>" + LX.esc(c.text) + "</dd>" +
        "<dt>In this course</dt><dd>" + N[id].map(function (n) { return "<b>" + LX.esc(n.n) + "</b>: " + LX.esc(n.what); }).join(" ") + " See " + lessonList(P, c.lessons) + ".</dd>" +
        "<dt>Read next</dt><dd>" + LX.esc(c.read) + "</dd></dl>";
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
          var cs = LX.CardSort(act, { bins: S.bins, cards: S.cards, maxWhy: 8, onCheck: function (g) { note.textContent = g.right + " of " + g.total + " match."; api.done(); api.saw(SORT_SAW); } });
          act.appendChild(note);
          demo[2] = function () { var m = {}; S.cards.forEach(function (c) { m[c.id] = c.bin; }); cs.place(m); cs.check(); };
        } },
      { text: STEPS[3], build: function (act, api) {
          var seen = {}, seg = H("div", { class: "lx-seg x1-kinds", role: "group", "aria-label": "Kinds of borrowed number" }, act), kb = {};
          var line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          var bd = Board(act, I, P, { onPick: function (id) { bd.show(id); } });
          var cnt = H("p", { class: "lx-hint", "aria-live": "polite", text: kindCount(0) }, act);
          bd.card.textContent = "Tap a kind above, then any lit component for its numbers.";
          X.kinds.forEach(function (k) { kb[k.id] = H("button", { type: "button", text: k.label, "aria-pressed": "false" }, seg); kb[k.id].addEventListener("click", function () { pick(k.id); }); });
          function pick(kid) {
            seen[kid] = true; Object.keys(kb).forEach(function (j) { kb[j].setAttribute("aria-pressed", String(j === kid)); });
            var ids = withKind(X, kid); bd.light(ids); bd.show(ids[0]); line.innerHTML = bold(kindLine(X, kid));
            var n = Object.keys(seen).length; cnt.textContent = kindCount(n);
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
        cols: 3, rows: 5, colsN: 3, rowsN: 5, sel: "eff", gameLabel: "In this lesson",
        nodes: [
          { id: "pe", g: "disc", label: "Power electronics", lines: ["Power", "electronics"], at: [0, 0], text: "Power electronics and protection design inverters and relays: how power is converted, and how faults are cleared." },
          { id: "mech", g: "disc", label: "Aero, combustion", lines: ["Aero,", "combustion"], at: [0, 1], text: "Aerodynamics and combustion design blades and combustors: how much power a rotor catches, how hot a flame burns." },
          { id: "nucl", g: "disc", label: "Reactor physics", lines: ["Reactor", "physics"], at: [0, 2], text: "With thermal hydraulics and materials: a steady chain reaction and the heat carried out of the core." },
          { id: "chem", g: "disc", label: "Electrochemistry", lines: ["Electro-", "chemistry"], at: [0, 3], text: "Design battery cells and electrolyzer stacks: energy held, kWh per kilogram, wear." },
          { id: "ctl", g: "disc", label: "Control, cyber", lines: ["Control,", "cyber"], at: [2, 0], text: "Control engineering and cybersecurity design the control room's software and protect it; NERC's CIP standards cover the bulk power system." },
          { id: "rating", g: "num", label: "Ratings", at: [1, 0], text: "MW, MWh and line limits." },
          { id: "eff", g: "num", label: "Efficiencies", at: [1, 1], text: "Heat rates, round trips, kWh per kilogram." },
          { id: "ramp", g: "num", label: "Ramp limits", lines: ["Ramp", "limits"], at: [1, 2], text: "How fast output changes, and the lowest steady load." },
          { id: "out", g: "num", label: "Outlet temperatures", lines: ["Outlet", "temps"], at: [1, 3], text: "How hot the heat is, which sets its uses." },
          { id: "fail", g: "num", label: "Failure rates", lines: ["Failure", "rates"], at: [1, 4], text: "How often equipment is out, and how long it lasts." },
          { id: "model", g: "model", label: "System model", lines: ["System", "model"], at: [2, 2], text: "Dispatch, planning and adequacy models run on these numbers and on operating rules." }
        ],
        edges: [["pe", "rating", "sets"], ["mech", "eff", "sets"], ["mech", "ramp", "sets"], ["nucl", "out", "sets"], ["chem", "eff", "sets"], ["chem", "fail", "sets"], ["ctl", "model", "rules"],
                ["rating", "model", "in"], ["eff", "model", "in"], ["ramp", "model", "in"], ["out", "model", "in"], ["fail", "model", "in"]] });
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), { title: "The eight components at a glance", text: true,
        columns: [{ key: "name", label: "Component", main: true }, { key: "disc", label: "Discipline" }, { key: "kinds", label: "Models borrow" }, { key: "num", label: "In this course" }],
        rows: X.components.map(function (c) { return { key: c.id, color: "var(--lx-tier-1)", name: c.label, disc: c.discipline, kinds: kindsOf(X, c), num: N[c.id].map(function (n) { return n.n; }).join("; ") }; }) });
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
