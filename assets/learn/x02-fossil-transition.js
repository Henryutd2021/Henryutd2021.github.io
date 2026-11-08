// x02-fossil-transition.js — Lesson X2, "What happens to gas, coal and oil systems in a transition, and can carbon be
// removed?" (side-topic shelf, step cards, Analyst, D2, no model).
//
// Data: data/x02-fossil-transition.json (the map, every dated number with its source, the two teaching toys, IPCC's
// removal methods, the Steelman card, the stop box, facts and sources), data/a13-fairness-jobs.json (Ridge County, read
// from A13's file, never retyped) and data/path.json (lesson links that appear once a lesson is live).
//
// No model beyond arithmetic:
//   vals          every number the page prints, from the data: shares of EIA's 2025 generation, the retirement
//                 balance (planned = retired + delayed + cancelled), CO2 per kWh generated, capture capacity against
//                 energy CO2 (spelled out: million and billion tonnes)
//   fill          text in the data carries {tokens}; fill() writes vals into them, so no number is typed twice
//   gas network   (illustrative) cost per remaining customer = F × (1 − a·s) / (1 − s): F the network cost per customer
//                 today, s the share who leave (0 ≤ s ≤ 0.6), a the share of a leaver's cost avoided by retiring pipes
//                 (0 or 0.5); never below F, never negative
//   book value    (illustrative) unrecovered share = (L − r) / L for a plant closing r years after opening, its
//                 building cost recovered evenly over an L-year book life (straight line), 0 ≤ r ≤ L
//   removal       IPCC's table sorted three ways (storage time, readiness by the middle of its range, cost range's low
//                 end); ties keep the table's order
// Neutral: roles and open questions, no forecasts, no verdicts.
// Every number on the page comes from the data files; _tests/learn/test_x02-fossil-transition.js checks them.
//
// Shared components: LX.StepCards, LX.ConceptMap, LX.Predict, LX.Slider, LX.CompareTable, LX.Steelman,
// LX.lessonRefHTML, LX.demo. Lesson-local: two bar readouts. The "where we stop" box is static HTML written by the test
// (the shelf's shared e-stop box: xs- markup, styles in components/explain.css).
(function () {
  "use strict";
  var KEY = "x02_fossil_transition";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return fmtN(100 * v, d || 0) + "%"; }
  function money(v) { return "$" + fmtN(Math.round(v)); }
  function pctx(v) { return Number(100 * v).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%"; }   // exact to 0.1 point, no padding (37.5%, 75%)
  function vals(D) {
    var g = D.gen2025, r = D.retire, c = D.co2kwh;
    return {
      gasShare: pct(g.gas / g.total), coalShare: pct(g.coal / g.total),
      oilPrimary: D.primary2025.petroleum + "%",
      gasPower: D.gasUse.power + "%", gasIndustry: D.gasUse.industrial + "%", gasHomes: "about " + D.gasUse.homes + "%", gasYear: String(D.gasUse.year),
      oilTransport: "two-thirds",
      lngBcfd: fmtN(D.lng.bcfd, 1), lngShare: D.lng.worldShare + "%",
      planned: fmtN(r.planned2025, 1) + " GW", retired: fmtN(r.retired2025, 1) + " GW", delayed: fmtN(r.delayed, 1) + " GW", cancelled: fmtN(r.cancelled, 1) + " GW", planned2026: fmtN(r.planned2026, 1) + " GW",
      mmst: fmtN(D.mines.mmst, 1), employees: fmtN(D.mines.employees),
      co2coal: fmtN(c.coal, 2), co2gas: fmtN(c.gas, 2), gasVsCoal: pct(c.gas / c.coal),
      ccsMt: "about " + fmtN(D.ccs.captureMt) + " million tonnes", co2Gt: "about " + fmtN(D.energyCo2.gt) + " billion tonnes", ccsShare: "about " + pct(D.ccs.captureMt / (D.energyCo2.gt * 1000), 2),
      co2MtAll: fmtN(D.energyCo2.gt * 1000),
      methane: fmtN(D.methane.pct, 1) + "%"
    };
  }
  function fill(D, t) { var V = vals(D); return String(t).replace(/\{([a-zA-Z0-9]+)\}/g, function (m, k) { if (!(k in V)) throw new Error("unknown token " + k); return V[k]; }); }
  // the retirement plan in parts
  function retireParts(D) { var r = D.retire; return { planned: r.planned2025, retired: r.retired2025, delayed: r.delayed, cancelled: r.cancelled, sum: r.retired2025 + r.delayed + r.cancelled, share: r.retired2025 / r.planned2025 }; }
  // the gas network (illustrative)
  function netCost(D, s, avoid) {
    if (s < D.gasNet.min || s > D.gasNet.max) throw new Error("share out of range");
    return D.gasNet.perCustomer * (1 - avoid * s) / (1 - s);
  }
  // the unrecovered share of a plant's cost (illustrative, straight line)
  function unrecovered(D, r) { var L = D.book.life; if (r < 0 || r > L) throw new Error("year out of range"); return (L - r) / L; }
  // the removal table's sorts (ties keep the table's order)
  function trlMid(row) { return (row.trl[0] + row.trl[1]) / 2; }
  function sortOrder(D, key) {
    var rows = D.cdr.rows.map(function (r, i) { return { r: r, i: i }; });
    var by = { store: function (a, b) { return b.r.storeRank - a.r.storeRank || a.i - b.i; },
               trl: function (a, b) { return trlMid(b.r) - trlMid(a.r) || a.i - b.i; },
               cost: function (a, b) { return a.r.cost[0] - b.r.cost[0] || a.i - b.i; } }[key];
    return rows.sort(by).map(function (x) { return x.r.key; });
  }
  var POT_LABEL = "Potential, billion tonnes CO₂ a year";
  // the notes under the removal table, live and in the fallback: the readiness scale, cost, potential, why BECCS removes
  function cdrNotes(D) { var C = D.cdr; return [C.trlScale, C.note, C.note2, C.beccsWhy]; }
  function range(a) { return a[0] === a[1] ? String(a[0]) : a[0] + " to " + a[1]; }
  function costText(a) { return (a[0] < 0 ? "−" + Math.abs(a[0]) : String(a[0])) + " to " + a[1]; }
  function cdrRows(D) {
    return D.cdr.rows.map(function (r) { return { key: r.key, name: r.name, store: r.store, trl: range(r.trl), cost: "$" + costText(r.cost).replace(" to ", " to $"), potential: r.potential, measure: r.measure }; });
  }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  var STEPS = [
    "Gas, coal, oil, [[carbon-capture|carbon capture]] and [[carbon-removal|carbon removal]] on one map. Tap at least four parts: what each does for the system today, and the question a transition opens.",
    "A retirement plan is an assumption, not an outcome: early in 2025, U.S. coal plant owners planned to retire 8.5 GW. How much retired that year?",
    "A gas network's pipes cost about the same however many customers stay. Slide the share who leave the network entirely, then try both assumptions about the pipes.",
    "Ridge County, in the course's fictional nation, has a coal plant whose building cost is recovered evenly over 40 years. Slide when it closes: how much is still unrecovered?",
    "A coal plant captures 90% of its CO₂ and stores it deep underground: does that remove carbon from the air? Choose, then see how large capture is today.",
    "Six ways to remove carbon, from IPCC's 2022 assessment. Sort the table by storage time, by [[technology-readiness|readiness]] and by cost range: does one method lead every time?",
    "Is gas a bridge, filling in while cleaner sources grow, or a [[lock-in|lock-in]] that keeps it burning for decades? Open both cases; the lesson takes no side."
  ];
  function retireFeedback(D) {
    var R = retireParts(D), V = vals(D), core = V.retired + " retired, " + pct(R.share) + " of the plan; " + V.delayed + " was delayed and " + V.cancelled + " cancelled.";
    return { all: "No: " + core, two: "No: " + core, third: "Yes: " + core };
  }
  function retireSaw(D) { return fill(D, "Many delays came under DOE emergency orders. For 2026 owners list {planned2026}, and EIA says the plans may change more than usual."); }
  var MAP_SAW = "Each part does a job today, and each raises a question that a plan has to answer with an assumption.";
  function mapCount(n, need) { return n >= need ? "Parts opened: " + n + " of 9." : "Parts opened: " + n + " of at least " + need + "."; }
  function netLine(D, s, avoid) {
    var c = netCost(D, s, avoid);
    return "With " + pct(s) + " of customers gone, each remaining customer pays **" + money(c) + " a year** for the network, against " + money(D.gasNet.perCustomer) + " today (illustrative).";
  }
  function netSaw(D) { return "LBNL (2018): as buildings electrify, gas's fixed costs are spread over less gas sold, potentially raising gas rates. The answer rests on what the scenario assumes."; }
  function netCount(n, of) { return "Assumptions tried with customers gone: " + n + " of " + of + "."; }
  function bookLine(D, r) {
    var L = D.book.life;
    return "Closing " + r + " years after opening leaves **" + pctx(unrecovered(D, r)) + "** of the building cost [[stranded-cost|unrecovered]]: " + (L - r) + " of its " + L + " years of even recovery still to come (illustrative).";
  }
  var BOOK_WHO = "Who carries it, owners, customers or taxpayers, is set by regulators and contracts, not by the engineering.";
  var BOOK_SAW = "The share left is simple arithmetic. Who pays it, and what replaces the plant's jobs and taxes, are in the explain section below.";
  function ridgeLine(A) {
    var R = A.ridgeCounty, p = R.plant;
    return p.name + " (" + fmtN(p.mw) + " MW) employs " + fmtN(p.staff) + " people and its mines " + fmtN(p.mineJobs) + "; coal pays " + pct(R.coalTaxShare) + " of the county's tax revenue.";
  }
  function ccsLine(D) { return fill(D, "Capture capacity worldwide: {ccsMt} of CO₂ a year (IEA, December 2025). Compared with 2025's energy CO₂, {co2Gt}, that capacity is {ccsShare}, even running full all year."); }
  var CCS_SAW = "Capturing fossil CO₂ and storing it durably can cut emissions; CO₂ that is used instead may be released again. Removal takes back CO₂ already in the air.";
  function cdrSaw(D) { return "No method leads on every list: the longest storage comes with readiness of 6 or below, and the most ready methods (8 to 9) store carbon for decades to centuries."; }
  function sortCount(n, need) { return n >= need ? "Orders tried: " + n + " of 3." : "Orders tried: " + n + " of at least " + need + "."; }

  // ---------------------------------------------------------------- the no-JS block, ideas, check, facts, sources
  function esc(t) { return String(t).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function systemRows(D) { return D.systems.map(function (s) { return { key: s.key, name: s.name, today: fill(D, s.today), number: fill(D, s.number), open: fill(D, s.open) }; }); }
  function staticFallback(D) {
    var R = retireParts(D), V = vals(D);
    return "<p class=\"lx-eyebrow\">Fossil systems and carbon: what each does today, and the open question</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table x2-fbt\"><thead><tr><th scope=\"col\">System</th><th scope=\"col\">Today</th><th scope=\"col\">A number</th><th scope=\"col\">Open question</th></tr></thead><tbody>" +
      systemRows(D).map(function (s) { return "<tr><td>" + esc(s.name) + "</td><td>" + esc(s.today) + "</td><td>" + esc(s.number) + "</td><td>" + esc(s.open) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<p class=\"lx-eyebrow\">Six ways to remove carbon (IPCC, 2022)</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table x2-fbt x2-fbt-cdr\"><thead><tr><th scope=\"col\">Method</th><th scope=\"col\">Stores carbon in</th><th scope=\"col\">Readiness (1 to 9)</th><th scope=\"col\">Cost range per tonne CO₂</th><th scope=\"col\">" + POT_LABEL + "</th><th scope=\"col\">Measuring it</th></tr></thead><tbody>" +
      cdrRows(D).map(function (r) { return "<tr><td>" + esc(r.name) + "</td><td>" + esc(r.store) + "</td><td>" + esc(r.trl) + "</td><td>" + esc(r.cost) + "</td><td>" + esc(r.potential) + "</td><td>" + esc(r.measure) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<ul class=\"x2-notes\">" + cdrNotes(D).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      "<ul><li>Coal retirements in 2025: " + V.planned + " planned, " + V.retired + " retired (" + pct(R.share) + " of the plan).</li><li>" + esc(ccsLine(D)) + "</li></ul>" +
      "<p class=\"lx-hint\">With JavaScript on, you tap the map, check a retirement plan, try a gas-network scenario and a plant's early closure, tell capture from removal and sort the removal table.</p>";
  }
  function ideasHTML(D) {
    var V = vals(D);
    return "<dl class=\"lx-ideas\">" +
      "<dt>Roles today</dt><dd>Gas made " + V.gasShare + " and coal " + V.coalShare + " of U.S. utility-scale electricity in 2025; oil was about " + V.oilPrimary + " of <span class=\"lx-term\" data-term=\"primary-energy\">primary energy</span>.</dd>" +
      "<dt>A plan is an assumption</dt><dd>Owners planned to retire " + V.planned + " of coal in 2025; " + V.retired + " retired.</dd>" +
      "<dt>Networks have fixed costs</dt><dd>Fewer customers can mean a higher share each, unless pipes are retired or costs are recovered another way.</dd>" +
      "<dt>Capture is not removal</dt><dd>Capturing fossil CO₂ and storing it durably can cut emissions; CO₂ that is used instead may be released again. Removal takes back CO₂ already in the air.</dd>" +
      "<dt>Removal differs by method</dt><dd>Rock and minerals store carbon for 10,000 years or longer, trees and soils for decades to centuries; readiness, cost range and measurement differ too.</dd></dl>";
  }
  function checkHTML(D) {
    var V = vals(D), F = D.gasNet.perCustomer, c25 = netCost(D, 0.25, 0);
    var q = function (id, ans, text, a) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"" + ans + "\"><p class=\"lx-qtext\">Myth or fact? “" + text + "”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + a + "</p></details></div>"; };
    var qq = function (id, ans, text, opts, a) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"" + ans + "\"><p class=\"lx-qtext\">" + text + "</p><ul class=\"lx-choices\">" + opts.map(function (o) { return "<li data-value=\"" + o[0] + "\">" + o[1] + "</li>"; }).join("") + "</ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + a + "</p></details></div>"; };
    return "<div class=\"lx-myths\" data-quiz=\"x02-myth\">" +
      q("capture", "myth", "Capturing CO₂ at a coal plant removes CO₂ from the air.", "Myth. Stored durably, the captured share of the plant's own CO₂ stays out of the air; IPCC: capture applied to fossil fuel use is not removal, since it takes no CO₂ out of the air.") +
      q("trees", "myth", "Carbon stored in new forests stays there for good.", "Myth. IPCC puts trees and soils at decades to centuries, and wildfire, disease or pests can reverse it.") +
      q("lng", "fact", "LNG is natural gas cooled until it is a liquid about 600 times smaller.", "Fact. EIA: it is cooled to −260 °F, and the liquid is 600 times smaller than the gas.") +
      q("plans", "myth", "When owners plan to retire a coal plant, it closes that year.", "Myth. In 2025 owners planned " + V.planned + " and " + V.retired + " retired; " + V.delayed + " was delayed and " + V.cancelled + " cancelled (EIA).") +
      "</div><div class=\"lx-quiz\" data-quiz=\"x02\">" +
      qq("co2", "b", "EIA: in 2023 burning coal for power emitted " + V.co2coal + " lb of CO₂ per kWh of electricity generated and burning gas " + V.co2gas + ". About what share of coal's is gas's?", [["a", "About 20%"], ["b", "About 40%"], ["c", "About 60%"]],
        "About 40%: " + V.co2gas + " ÷ " + V.co2coal + " = " + fmtN(D.co2kwh.gas / D.co2kwh.coal, 3) + ", or " + V.gasVsCoal + ". Burning only: leaks before burning are not counted.") +
      qq("net", "b", "A network costs " + money(F) + " a year per customer and no pipe can be retired; a quarter of the customers leave. What does each remaining one pay for it (illustrative)?", [["a", money(F)], ["b", money(c25)], ["c", money(F * 1.25)]],
        money(F) + " ÷ (1 − 0.25) = " + money(F) + " ÷ 0.75 = " + money(c25) + ". The network's total cost has not changed; it is shared by fewer customers.") +
      qq("ew", "c", "In IPCC's table, which method stores carbon for 10,000 years or longer but has the lowest readiness, 3 to 4?", [["a", "Direct air capture with storage"], ["b", "Biochar"], ["c", "Enhanced weathering"]],
        "Enhanced weathering: crushed rock on fields stores carbon in minerals, but its readiness is 3 to 4 and its uptake in real soils is still poorly quantified (IPCC).") +
      "</div>";
  }
  function factsHTML(D) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      D.facts.map(function (f) { var s = D.sources[f.src]; return "<tr><td class=\"n\">" + esc(fill(D, f.n)) + "</td><td>" + esc(fill(D, f.what)) + "</td><td class=\"s\"><a href=\"" + esc(s.url) + "\">" + esc(s.short) + "</a> · " + esc(s.date.split(";")[0]) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function sourcesHTML(D) {
    var cap = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
    return "<ul>" + Object.keys(D.sources).map(function (k) { var s = D.sources[k];
      return "<li>" + esc(s.publisher) + ". <a href=\"" + esc(s.url) + "\">" + esc(s.title) + "</a>. " + esc(cap(s.date)) + ". " + esc(cap(s.where)) + ".</li>"; }).join("") +
      "<li>Ridge County and Prairieland are fictional; their numbers are illustrative, read from lesson A13's data.</li></ul>";
  }
  function mapSpec(D) {
    var M = D.map;
    return { title: M.title, lede: M.lede, groups: M.groups, cols: M.cols, rows: M.rows, colsN: M.colsN, rowsN: M.rowsN, edges: M.edges, gameLabel: "Open question",
      nodes: M.nodes.map(function (n) { return { id: n.id, g: n.g, label: n.label, lines: n.lines, at: n.at, atN: n.atN, text: fill(D, n.text), game: fill(D, n.open) }; }) };
  }
  function steelmanSpec(D) {
    var S = D.steelman;
    return { title: S.title, note: S.note, sides: S.sides.map(function (s) { var o = { key: s.key, title: s.title, points: s.points.map(function (t) { return fill(D, t); }) }; if (s.wide) o.wide = true; return o; }) };
  }

  var model = { vals: vals, fill: fill, retireParts: retireParts, netCost: netCost, unrecovered: unrecovered, trlMid: trlMid, sortOrder: sortOrder, cdrRows: cdrRows, systemRows: systemRows, mapSpec: mapSpec, steelmanSpec: steelmanSpec,
    STEPS: STEPS, retireFeedback: retireFeedback, retireSaw: retireSaw, MAP_SAW: MAP_SAW, mapCount: mapCount, netLine: netLine, netSaw: netSaw, netCount: netCount, bookLine: bookLine, BOOK_WHO: BOOK_WHO, BOOK_SAW: BOOK_SAW, ridgeLine: ridgeLine, cdrNotes: cdrNotes, POT_LABEL: POT_LABEL,
    ccsLine: ccsLine, CCS_SAW: CCS_SAW, cdrSaw: cdrSaw, sortCount: sortCount,
    staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, factsHTML: factsHTML, sourcesHTML: sourcesHTML, fmtN: fmtN, pct: pct, pctx: pctx, money: money };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  // two labelled bars on one scale (lesson-local): rows [{label, value, text, color}]
  function Bars(host, max) {
    var w = H("div", { class: "x2-bars" }, host);
    return { set: function (rows) {
      w.innerHTML = "";
      rows.forEach(function (r) {
        var row = H("div", { class: "x2-bar" }, w);
        H("span", { class: "l", text: r.label }, row);
        var t = H("span", { class: "t", "aria-hidden": "true" }, row);
        H("i", { style: "width:" + Math.max(0.2, Math.min(100, 100 * r.value / max)) + "%;background:" + (r.color || "var(--lx-ink-3)") }, t);
        H("b", { text: r.text }, row);
      });
    } };
  }

  LX.mount("x02", function (live, data, root) {
    var D = data[KEY], A = data.a13_fairness_jobs, P = data.path, demo = [];
    function line(host) { return H("p", { class: "lx-step-line", "aria-live": "polite" }, host); }
    var steps = [
      { text: STEPS[0], build: function (act, api) {
          var seen = {}, cnt = H("p", { class: "lx-hint", "aria-live": "polite" }), need = D.map.need;
          var spec = mapSpec(D);
          spec.moment = function (id) {
            seen[id] = true; var n = Object.keys(seen).length; cnt.textContent = mapCount(n, need);
            if (n >= need) { api.done(); api.saw(MAP_SAW); }
            return null;
          };
          var cm = LX.ConceptMap(H("div", { class: "x2-map" }, act), spec);
          act.appendChild(cnt);
          demo[0] = function () { ["lng", "gasnet", "coal", "cdr"].forEach(function (id) { cm.select(id); }); };
        } },
      { text: STEPS[1], build: function (act, api) {
          var Q = D.predictRetire, extra = H("p", { class: "lx-hint" });
          var pr = LX.Predict(act, { id: "x2-retire", q: Q.q, title: false, answer: Q.answer, options: Q.options, feedback: retireFeedback(D), onPick: function () { show(); } });
          act.appendChild(extra);
          function show() { pr.reveal(); extra.textContent = retireSaw(D); api.done(); }
          if (pr.picked()) show();
          demo[1] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[2]; if (b) b.click(); } };
        } },
      { text: STEPS[2], build: function (act, api) {
          var G = D.gasNet, s = G.start, a = G.assume[0], tried = {};
          var seg = H("div", { class: "lx-seg x2-assume", role: "group", "aria-label": "Assumption about the pipes" }, act), btn = {};
          G.assume.forEach(function (x) { btn[x.key] = H("button", { type: "button", "aria-pressed": String(x === a), text: x.label }, seg); btn[x.key].addEventListener("click", function () { a = x; paint(); }); });
          var sl = LX.Slider(act, { label: "Customers who leave the gas network entirely", min: G.min, max: G.max, step: G.step, value: s, color: "var(--lx-cc)", fmt: function (v) { return pct(v); }, onChange: function (v) { s = v; paint(); } });
          var bars = Bars(act, G.perCustomer * 2.5), ln = line(act), why = H("p", { class: "lx-hint" }, act);
          var cnt = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: "Illustrative: a network cost of " + money(G.perCustomer) + " per customer a year today; the customers who stay share it equally." }, act);
          function paint() {
            Object.keys(btn).forEach(function (k) { btn[k].setAttribute("aria-pressed", String(k === a.key)); });
            var c = netCost(D, s, a.avoid);
            bars.set([{ label: "Today", value: G.perCustomer, text: money(G.perCustomer), color: "var(--lx-ink-3)" }, { label: "Each remaining customer", value: c, text: money(c), color: "var(--lx-cc)" }]);
            ln.innerHTML = bold(netLine(D, s, a.avoid)); why.textContent = a.line;
            if (s >= G.need - 1e-9) tried[a.key] = true;   // an assumption counts once some customers have left under it
            cnt.textContent = netCount(Object.keys(tried).length, G.assume.length);
            if (Object.keys(tried).length === G.assume.length) { api.done(); api.saw(netSaw(D)); }
          }
          paint();
          demo[2] = function () { sl.set(0.3, true); btn.retire.click(); };
        } },
      { text: STEPS[3], build: function (act, api) {
          var B = D.book, moved = false;
          var sl = LX.Slider(act, { label: "Years since " + A.ridgeCounty.plant.name + " opened", min: B.min, max: B.max, step: B.step, value: B.start, color: "var(--lx-cc)", fmt: function (v) { return v + " years"; }, onChange: function (v) { moved = true; paint(v); } });
          var bars = Bars(act, 1), ln = line(act);
          H("p", { class: "lx-hint", text: A.ridgeCounty.fiction }, act);
          function paint(r) {
            var u = unrecovered(D, r);
            bars.set([{ label: "Still unrecovered", value: u, text: pctx(u), color: "var(--lx-cc)" }, { label: "Recovered", value: 1 - u, text: pctx(1 - u), color: "var(--lx-ink-3)" }]);
            ln.innerHTML = bold(bookLine(D, r));
            if (moved) { api.done(); api.saw(BOOK_SAW); }
          }
          paint(B.start);
          demo[3] = function () { sl.set(15, true); };
        } },
      { text: STEPS[4], build: function (act, api) {
          var Q = D.predictCcs, res = H("div", { class: "x2-res" });
          var pr = LX.Predict(act, { id: "x2-capture", q: Q.q, title: false, answer: Q.answer, options: Q.options, feedback: Q.feedback, onPick: function () { show(); } });
          act.appendChild(res);
          function show() {
            pr.reveal(); res.innerHTML = "";
            var cap = D.ccs.captureMt, all = D.energyCo2.gt * 1000;
            H("p", { class: "lx-hint", text: "Both bars in million tonnes of CO₂ a year." }, res);
            Bars(res, all).set([{ label: "Energy CO₂, 2025", value: all, text: vals(D).co2MtAll, color: "var(--lx-ink-3)" }, { label: "Capture capacity", value: cap, text: fmtN(cap), color: "var(--lx-dr)" }]);
            H("p", { class: "lx-step-line", text: ccsLine(D) }, res);
            api.done(); api.saw(CCS_SAW);
          }
          if (pr.picked()) show();
          demo[4] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } },
      { text: STEPS[5], build: function (act, api) {
          var C = D.cdr, tried = {}, cnt = H("p", { class: "lx-hint", "aria-live": "polite" });
          var rows = cdrRows(D).map(function (r) { return { key: r.key, name: r.name, store: r.store, trl: r.trl, cost: r.cost, potential: r.potential, measure: r.measure, color: "var(--lx-dr)" }; });
          var host = H("div", { class: "x2-cdr" }, act);
          LX.CompareTable(host, { title: C.title, text: true,
            columns: [{ key: "name", label: "Method", main: true }, { key: "store", label: "Stores carbon in" }, { key: "trl", label: "Readiness (1 to 9)" }, { key: "cost", label: "Cost range per tonne CO₂" }, { key: "potential", label: POT_LABEL, phoneHide: false }, { key: "measure", label: "Measuring it" }],
            rows: rows, sorts: C.sorts.map(function (s) { return { label: s.label, order: sortOrder(D, s.key), note: s.note }; }) });
          var nl = H("ul", { class: "x2-notes" }, act);
          cdrNotes(D).forEach(function (t) { H("li", { html: LX.rich(t) }, nl); });
          act.appendChild(cnt);
          var seg = host.querySelector(".lx-seg");
          if (seg) [].forEach.call(seg.children, function (b, i) { b.addEventListener("click", function () { if (i > 0) tried[i] = true; var n = 1 + Object.keys(tried).length; cnt.textContent = sortCount(n, C.need + 1); if (Object.keys(tried).length >= C.need) { api.done(); api.saw(cdrSaw(D)); } }); });
          cnt.textContent = sortCount(1, C.need + 1);
          demo[5] = function () { if (seg) { seg.children[1].click(); seg.children[2].click(); } };
        } },
      { text: STEPS[6], build: function (act, api) {
          var opened = {}, S = steelmanSpec(D);
          S.heading = "h4"; S.eyebrow = "Steelman card"; S.frame = true; S.reveal = "button";
          S.onOpen = function (k) { opened[k] = true; if (opened.bridge && opened.lock) api.done(); };
          var sm = LX.Steelman(act, S);
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "The systems side by side" + LX.icon("arrow") }, act);
          demo[6] = function () { sm.open("bridge"); sm.open("lock"); sm.open("tell"); };
        } }
    ];
    var cards = LX.StepCards(live, { id: "x2-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("x02-explain");
    if (xhost) {
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var c1 = H("div", { class: "lx-xcard x2-wide" }, xhost);
      LX.CompareTable(c1, { title: "Six systems: what each does today, and the open question", text: true, caption: "Numbers dated and sourced below; open questions shown without a verdict.",
        columns: [{ key: "name", label: "System", main: true }, { key: "today", label: "Today" }, { key: "number", label: "A number" }, { key: "open", label: "Open question" }],
        rows: systemRows(D).map(function (r) { r.color = r.key === "cdr" || r.key === "ccs" ? "var(--lx-dr)" : "var(--lx-cc)"; return r; }) });
      var rc = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Ridge County: what an early closure leaves" }, rc);
      var rl = H("ul", { class: "x2-next" }, rc);
      H("li", { text: ridgeLine(A) }, rl);
      H("li", { html: LX.rich(BOOK_WHO) }, rl);
      H("li", { html: LX.lessonRefHTML(P, "A13") + " works out Ridge County's tax base and jobs." }, rl);
      H("p", { class: "lx-hint", text: A.ridgeCounty.fiction }, rc);
      var nx = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Where this goes next" }, nx);
      var ul = H("ul", { class: "x2-next" }, nx);
      [["A13", "who pays and who benefits, with Ridge County's tax base and jobs"], ["F11", "methane leaks and air pollution, counted"], ["A21", "energy security: imports, one sea route and minerals"], ["A20", "why national scenarios disagree"], ["X3", "how fast past transitions moved"]]
        .forEach(function (x) { H("li", { html: LX.lessonRefHTML(P, x[0]) + ": " + LX.esc(x[1]) + "." }, ul); });
    }

    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, D: D, cards: cards };
  });
})();
