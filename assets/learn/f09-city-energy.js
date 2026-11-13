// f09-city-energy.js — Lesson F9, "What does a city run on, and who controls what?" (step cards, Foundations, D1, no
// model). The data-center campus appears only as a load.
//
// Data: data/prairie-city.json (Prairie City's 2025 flows in GWh: flows, balance, supply; read, never retyped),
// data/f09-city-energy.json (how sectors group, colors, who typically decides what, each with a dated primary source,
// the numbers to remember) and data/path.json (lesson links that appear once a lesson is live).
//
// No model beyond arithmetic on the flows:
//   the Sankey      prairie-city.json's flows (sources -> carriers -> sectors -> useful, hydrogen, losses), every node
//                   balanced; "four sectors" merges the users into buildings, transport, industry and farms, and the
//                   data-center campus kept apart (links summed, so every node still balances)
//   shares          a carrier's energy = what flows into it; a sector's losses = its flows to losses / what flows in;
//                   the city's own electricity = rooftop solar / everything into electricity
//   who controls    typical U.S. roles (not universal), each with a dated primary source in the data file; the lens
//                   lights the Sankey's nodes where each actor has a main lever
// Every number on the page comes from the data files; _tests/learn/test_f09-city-energy.js checks them.
//
// Shared components: LX.StepCards, LX.Sankey, LX.Predict, LX.Guess, LX.CardSort, LX.Stakeholders, LX.lessonRefHTML,
// LX.demo. Lesson-local: the actor lens (a recoloured Sankey).
(function () {
  "use strict";
  var KEY = "f09_city_energy";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return fmtN(100 * v, d) + "%"; }
  function gwh(v) { return fmtN(v) + " GWh"; }
  function nodeOf(C, id) { return C.flows.nodes.filter(function (n) { return n.id === id; })[0]; }
  function into(C, id) { return sum(C.flows.links.filter(function (l) { return l.to === id; }).map(function (l) { return l.value; })); }
  function outOf(C, id) { return sum(C.flows.links.filter(function (l) { return l.from === id; }).map(function (l) { return l.value; })); }
  function colorOf(F, n) { return F.colors[n.id] || (n.kind === "sector" ? F.colors.sector : "var(--lx-ink-3)"); }
  // the detailed spec (the file's own nodes), colored
  function detailed(C, F) {
    return { nodes: C.flows.nodes.map(function (n) { return { id: n.id, label: n.short, short: n.short, note: n.label, col: n.col, kind: n.kind === "loss" ? "loss" : n.kind, color: colorOf(F, n) }; }),
             links: C.flows.links.map(function (l) { return { from: l.from, to: l.to, value: l.value }; }) };
  }
  // four sectors: the users merged into groups; links between the same two nodes summed
  function grouped(C, F) {
    var g = {}; F.groups.forEach(function (x) { x.members.forEach(function (m) { g[m] = x.key; }); });
    var nodes = [];
    C.flows.nodes.forEach(function (n) {
      if (n.kind === "sector") return;
      nodes.push({ id: n.id, label: n.short, short: n.short, note: n.label, col: n.col, kind: n.kind === "loss" ? "loss" : n.kind, color: colorOf(F, n) });
      if (n.col === 1 && n.id === "air") F.groups.forEach(function (x) { nodes.push({ id: x.key, label: x.short, short: x.short, note: x.label, col: 2, kind: "sector", color: F.colors.sector }); });
    });
    var acc = {}, order = [];
    C.flows.links.forEach(function (l) {
      var a = g[l.from] || l.from, b = g[l.to] || l.to, k = a + ">" + b;
      if (!(k in acc)) { acc[k] = 0; order.push([a, b, k]); }
      acc[k] += l.value;
    });
    return { nodes: nodes, links: order.map(function (o) { return { from: o[0], to: o[1], value: Math.round(acc[o[2]] * 10) / 10 }; }) };
  }
  function balance(spec) {   // in - out per node with both (0 for a pass-through)
    var out = {}; spec.nodes.forEach(function (n) { out[n.id] = { inn: 0, out: 0 }; });
    spec.links.forEach(function (l) { out[l.from].out += l.value; out[l.to].inn += l.value; });
    return out;
  }
  function carriers(C) {   // what flows into each carrier, largest first (the outdoor air's heat is not bought)
    return C.flows.nodes.filter(function (n) { return n.col === 1 && n.kind === "carrier"; }).map(function (n) { return { id: n.id, label: n.label, short: n.short, gwh: into(C, n.id) }; })
      .sort(function (a, b) { return b.gwh - a.gwh; });
  }
  function sectors(C, F) {   // per group: energy in, useful, hydrogen, lost
    var S = grouped(C, F);
    return F.groups.map(function (x) {
      var inn = sum(S.links.filter(function (l) { return l.to === x.key; }).map(function (l) { return l.value; }));
      var by = function (to) { return sum(S.links.filter(function (l) { return l.from === x.key && l.to === to; }).map(function (l) { return l.value; })); };
      return { key: x.key, label: x.label, short: x.short, gwh: inn, useful: by("useful"), h2: by("h2"), lost: by("losses"), lossShare: by("losses") / inn };
    });
  }
  function power(C) {
    var el = into(C, "el"), solar = outOf(C, "src_solar"), grid = outOf(C, "src_grid"), lost = sum(C.flows.links.filter(function (l) { return l.from === "el" && l.to === "grid_losses"; }).map(function (l) { return l.value; }));
    return { el: el, solar: solar, grid: grid, own: solar / el, lost: lost, meters: C.balance.totals.el, gridMeters: C.balance.totals.el - solar, lossShare: C.supply.gridLossShare };
  }
  // the lens: an actor's nodes lit, the rest pale
  function lens(C, F, key) {
    var a = F.actors.filter(function (x) { return x.key === key; })[0], spec = grouped(C, F), lit = {};
    a.nodes.forEach(function (id) { lit[id] = true; });
    spec.nodes.forEach(function (n) { if (!lit[n.id]) n.color = "var(--lx-line-2)"; else n.color = a.color; });
    spec.links.forEach(function (l) { l.color = lit[l.from] || lit[l.to] ? a.color : "var(--lx-line-2)"; });
    return { spec: spec, actor: a, lit: Object.keys(lit) };
  }
  // the lens in words (the colors' text equivalent): the lit parts, in the Sankey's column order
  function litParts(C, F, key) {
    var L = lens(C, F, key), on = {}; L.lit.forEach(function (id) { on[id] = true; });
    return L.spec.nodes.filter(function (n) { return on[n.id]; }).sort(function (a, b) { return a.col - b.col; }).map(function (n) { return n.short; });
  }
  function litLine(C, F, key) {
    var a = F.actors.filter(function (x) { return x.key === key; })[0];
    return "Lit for " + a.label.charAt(0).toLowerCase() + a.label.slice(1) + ": " + litParts(C, F, key).join(", ") + ".";
  }
  var LENS_MIN = 3;   // step 6 opens Next once this many actors have been compared
  function countLine(n) { return n >= LENS_MIN ? "Actors compared: " + n + " of 5." : "Actors compared: " + n + " of at least " + LENS_MIN + "."; }
  // how useful energy is counted (shown beside the first Sankey, the losses step, the no-JS table and the explain layer)
  var CONV = "Convention: for computers, appliances and lights, the electricity delivered counts as useful; their own losses are not estimated, so a sector's loss share is not its efficiency.";
  // the fertilizer plant's branch ends at the hydrogen it makes: the count stops before ammonia synthesis
  var H2_LINE = "Boundary: the fertilizer plant's flow stops at the hydrogen its gas reformers make, at its higher heating value; turning that hydrogen into ammonia is outside this count.";

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  var STEPS = [
    "Prairie City's year of energy, 2025, in [[gigawatt-hour|GWh]] (1 GWh is a million kWh): where it comes from and where it goes. Before the flows appear, which [[energy-carrier|carrier]] brings the city the most energy?",
    "Now group the users into sectors: buildings, transport, industry with the farms, and the data-center campus kept apart as one large load. Tap the biggest sector.",
    "Not all of it becomes warmth, motion or light that people use: some leaves as waste heat. Which sector loses the largest share of what it takes in?",
    "Where does the city's electricity come from? Guess how much of it Prairie City makes itself, from rooftop solar.",
    "Who decides? For Prairie City, a Kansas city served by an [[investor-owned-utility|investor-owned utility]], sort each lever to the body that usually controls it; other states and utilities differ.",
    "Now light up the flows each one touches. Compare at least three actors and see each one's part of Prairie City's year of energy.",
    "Some U.S. cities own their electric utility, a [[public-power-utility|public power utility]]. If Prairie City did, which lever would move to its own local government?"
  ];
  var Q_CARRIER = { options: [{ value: "el", label: "Electricity" }, { value: "gas", label: "Natural gas" }, { value: "gasoline", label: "Gasoline" }] };
  function carrierQ(C) {   // the answer and feedback follow the data
    var cs = carriers(C), top = cs[0], byId = {}; cs.forEach(function (c) { byId[c.id] = c; });
    var fb = {};
    Q_CARRIER.options.forEach(function (o) {
      var c = byId[o.value];
      fb[o.value] = (o.value === top.id ? "Yes: " : "No: ") + c.label.toLowerCase() + " brings " + gwh(c.gwh) + "; " + (o.value === top.id ? "the most, " + gwh(top.gwh - cs[1].gwh) + " ahead of " + cs[1].label.toLowerCase() + "." : top.label.toLowerCase() + " brings the most, " + gwh(top.gwh) + ".");
    });
    return { answer: top.id, feedback: fb };
  }
  function sectorLine(C, F, key) {
    var s = sectors(C, F), top = s.slice().sort(function (a, b) { return b.gwh - a.gwh; })[0], x = s.filter(function (y) { return y.key === key; })[0];
    if (!x) return null;
    return "**" + x.short + "**: " + gwh(x.gwh) + " a year" + (x.key === top.key ? ", the biggest sector." : "; the biggest is " + top.short.toLowerCase() + ", " + gwh(top.gwh) + ".");
  }
  function sectorSaw(C, F) {
    var s = sectors(C, F).slice().sort(function (a, b) { return b.gwh - a.gwh; });
    return s.map(function (x, i) { return (i ? "" : "Biggest first: ") + x.short.toLowerCase() + " " + gwh(x.gwh); }).join(", ") + ".";
  }
  var Q_LOSS = { options: [{ value: "buildings", label: "Buildings" }, { value: "transport", label: "Transport" }, { value: "industry", label: "Industry and farms" }] };
  function lossQ(C, F) {
    var s = sectors(C, F).filter(function (x) { return x.key !== "datacenter"; }), top = s.slice().sort(function (a, b) { return b.lossShare - a.lossShare; })[0], fb = {};
    var v = function (x) { return x.key === "buildings" ? " lose " : " loses "; }, w = function (x) { return x.key === "buildings" ? " of what they take in" : " of what it takes in"; };
    s.forEach(function (x) { fb[x.key] = (x.key === top.key ? "Yes: " : "No: ") + x.short.toLowerCase() + v(x) + pct(x.lossShare) + w(x) + (x.key === top.key ? ", the most." : "; " + top.short.toLowerCase() + v(top) + pct(top.lossShare) + "."); });
    return { answer: top.key, feedback: fb };
  }
  function lossLine(C, F) {
    var t = sectors(C, F).filter(function (x) { return x.key === "transport"; })[0];
    return "Transport takes in " + gwh(t.gwh) + " and turns " + gwh(t.useful) + " into motion: engines turn about " + pct(C.transport.engineEfficiency) + " of their fuel into motion, the rest into heat.";
  }
  var OWN_TICKS = ["About 1%", "About 10%", "About a quarter", "About half"];
  var OWN_VAL = [0.01, 0.1, 0.25, 0.5];
  function ownTick(v) { var k = 0; OWN_VAL.forEach(function (t, i) { if (Math.abs(t - v) < Math.abs(OWN_VAL[k] - v)) k = i; }); return k; }
  function powerLine(C) {
    var p = power(C);
    return "Rooftop solar makes **" + pct(p.own, 1) + "** of the electricity; the other " + gwh(p.grid) + " comes from the [[spp|SPP]] grid. " + gwh(p.lost) + " is lost in the city's own wires (" + pct(p.lossShare) + " of the grid electricity users take, set for teaching).";
  }
  var POWER_SAW = "The power sector sits mostly outside the city: its plants are on the regional grid. The city's own accounting starts where electricity enters its wires.";
  // step 5: who the bins are, before the sort (their glossary terms open here, not only in the feedback)
  var WHO_LINE = "Here the electric utility is [[vertically-integrated-utility|vertically integrated]], owning plants and wires; Prairie City's also runs the gas mains (set for teaching). The state regulator is a [[public-utility-commission|public utility commission]].";
  var SORT_NOTE = "Roles for a Kansas city served by an investor-owned utility, each from a dated primary source (listed under Sources); a city-owned utility or another state can differ.";
  function lensLine(F, key) { var a = F.actors.filter(function (x) { return x.key === key; })[0]; return "**" + a.label + "**: " + a.levers; }
  var LENS_SAW = "No one owns the whole picture: the city's levers sit on buildings and transport, while its electricity supply belongs to the utility, under the regulator and federal rules.";
  function muniSaw(C, F, picked) { return F.muni.feedback[picked]; }
  function srcShort(F, k) {
    var s = F.sources[k], d = s.date, ab = /about ([A-Za-z]+ \d{4})/.exec(d);
    d = ab ? "about " + ab[1] : /^undated/.test(d) ? d.replace(/^undated[^;]*; /, "") : d.split(";")[0];
    return s.publisher.split(",")[0] + ", " + d;
  }
  function whyItems(F) {   // every lever's reason with its sources, for the list under the sort
    return F.levers.map(function (l) { return { text: l.text, why: l.why, src: l.src.map(function (k) { return srcShort(F, k); }).join("; ") }; });
  }

  // the no-JS block, the ideas, the check and the sources (written into the page by the test)
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function lostCell(x) { return x.lost > 0 ? gwh(x.lost) + " (" + pct(x.lossShare) + ")" : "not estimated (its electricity counts as useful)"; }
  function staticFallback(C, F) {
    var cs = carriers(C), s = sectors(C, F), p = power(C);
    return "<p class=\"lx-eyebrow\">Prairie City's year of energy, 2025, in GWh (1 GWh = 1 million kWh)</p><p class=\"lx-hint\">" + esc(C.about.line) + "</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table f9-fbt\"><thead><tr><th scope=\"col\">Sector</th><th scope=\"col\">Takes in</th><th scope=\"col\">Useful energy</th><th scope=\"col\">Counted as lost</th></tr></thead><tbody>" +
      s.map(function (x) { return "<tr><td>" + esc(x.label) + "</td><td>" + gwh(x.gwh) + "</td><td>" + gwh(x.useful) + (x.h2 ? " (and " + gwh(x.h2) + " of hydrogen)" : "") + "</td><td>" + lostCell(x) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<p class=\"lx-hint\">" + esc(CONV) + "</p><p class=\"lx-hint\">" + esc(H2_LINE) + "</p>" +
      "<ul><li><b>Carriers.</b> " + cs.map(function (c) { return esc(c.label) + " " + gwh(c.gwh); }).join("; ") + ".</li>" +
      "<li><b>Electricity.</b> Rooftop solar makes " + pct(p.own, 1) + " of it; the rest comes from the SPP grid, and " + gwh(p.lost) + " is lost in the city's wires.</li></ul>" +
      "<p class=\"lx-eyebrow\">Who decides, for a Kansas city served by an investor-owned utility (typical roles)</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table f9-fbt\"><thead><tr><th scope=\"col\">Lever</th><th scope=\"col\">Usually decided by</th></tr></thead><tbody>" +
      F.levers.map(function (l) { return "<tr><td>" + esc(l.text) + "</td><td>" + esc(F.actors.filter(function (a) { return a.key === l.bin; })[0].label) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<p class=\"lx-hint\">With JavaScript on, you follow the flows step by step, sort who decides each lever, and light up each actor's part of the flows.</p>";
  }
  function ideasHTML(C, F) {
    var s = sectors(C, F).slice().sort(function (a, b) { return b.gwh - a.gwh; }), p = power(C), t = s.filter(function (x) { return x.key === "transport"; })[0];
    return "<dl class=\"lx-ideas\">" +
      "<dt>Carriers to sectors</dt><dd>A city buys gas, fuels and electricity, and uses them in buildings, transport and industry; " + s[0].short.toLowerCase() + " take the most, " + gwh(s[0].gwh) + ".</dd>" +
      "<dt>Useful and lost</dt><dd>Engines lose most of their fuel as heat: transport turns " + pct(1 - t.lossShare) + " of what it takes in into motion.</dd>" +
      "<dt>A convention</dt><dd>" + esc(CONV.replace(/^Convention: f/, "F")) + "</dd>" +
      "<dt>The power sector</dt><dd>Prairie City makes " + pct(p.own, 1) + " of its electricity; its accounting starts where the regional grid's power enters its wires.</dd>" +
      "<dt>Who decides</dt><dd>For a Kansas city served by an investor-owned utility, the state regulator approves rates; federal rules set equipment standards and govern interstate markets.</dd>" +
      "<dt>The city and owners</dt><dd>The city adopts its energy code and issues permits; owners choose their equipment.</dd>" +
      "<dt>Typical, not universal</dt><dd>A city that owns its utility sets its own rates; many states adopt one energy code for the whole state, and states organize their utilities differently.</dd></dl>";
  }
  // the homes' energy (the gas-share question): what they buy, and what they take in with the outdoor air's heat
  function homesMix(C) {
    var h = C.balance.sectors.homes, bought = h.el + h.gas + h.propane;
    return { h: h, bought: bought, all: bought + h.air, gasBought: h.gas / bought, gasAll: h.gas / (bought + h.air) };
  }
  function checkHTML(C, F) {
    var p = power(C), t = sectors(C, F).filter(function (x) { return x.key === "transport"; })[0], X = homesMix(C), h = X.h;
    var q = function (id, ans, text, a) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"" + ans + "\"><p class=\"lx-qtext\">Myth or fact? “" + text + "”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + a + "</p></details></div>"; };
    var qq = function (id, ans, text, opts, a) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"" + ans + "\"><p class=\"lx-qtext\">" + text + "</p><ul class=\"lx-choices\">" + opts.map(function (o) { return "<li data-value=\"" + o[0] + "\">" + o[1] + "</li>"; }).join("") + "</ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + a + "</p></details></div>"; };
    var lost = Math.round(p.gridMeters * p.lossShare * 10) / 10;
    return "<div class=\"lx-myths\" data-quiz=\"f09-myth\">" +
      q("gridmix", "myth", "Prairie City's council alone decides which power plants make its electricity.", "Myth. In Kansas the utility owns plants and signs supply contracts, the state regulator reviews their costs, and SPP's market decides which plants run across the region; the city shapes its own use and permits.") +
      q("council", "myth", "The city council sets the electricity rate every home pays.", "Myth for an investor-owned utility: in Kansas, the state's commission approves the rates. Fact where the city owns its utility.") +
      q("cars", "myth", "Most of the energy a car burns moves the car.", "Myth. Prairie City's transport takes in " + gwh(t.gwh) + " and turns " + gwh(t.useful) + " into motion; the rest leaves as heat.") +
      "</div><div class=\"lx-quiz\" data-quiz=\"f09\">" +
      qq("gasshare", "b", "Prairie City's homes buy " + gwh(h.el) + " of electricity, " + gwh(h.gas) + " of gas and " + gwh(h.propane) + " of propane. About what share of what they buy is gas?",
        [["a", "A quarter"], ["b", "Half"], ["c", "Three quarters"]], "About half: " + fmtN(h.gas, 1) + " ÷ " + fmtN(X.bought, 1) + " = " + pct(X.gasBought) + ". Their heat pumps also draw " + gwh(h.air) + " of free outdoor-air heat; counting it, " + fmtN(h.gas, 1) + " ÷ " + fmtN(X.all, 1) + " = " + pct(X.gasAll) + ".") +
      qq("kcc", "c", "Who approves the rates of Kansas's investor-owned electric utilities?", [["a", "The city council"], ["b", "FERC"], ["c", "The Kansas Corporation Commission"]], "The Kansas Corporation Commission, the state regulator; FERC regulates interstate transmission and wholesale sales.") +
      qq("ferc", "a", "Which body regulates interstate transmission and wholesale power sales?", [["a", "FERC"], ["b", "The state regulator"], ["c", "The utility"]], "FERC, the Federal Energy Regulatory Commission.") +
      qq("losses", "b", "Prairie City's meters take " + fmtN(p.gridMeters, 1) + " GWh of grid electricity a year (rooftop solar aside), and the wires lose " + pct(p.lossShare) + " as much again (set for teaching). How much is lost?",
        [["a", "About " + fmtN(Math.round(lost / 10)) + " GWh"], ["b", "About " + fmtN(Math.round(lost)) + " GWh"], ["c", "About " + fmtN(Math.round(lost * 10)) + " GWh"]], fmtN(p.gridMeters, 1) + " × " + fmtN(p.lossShare, 2) + " = " + fmtN(lost, 1) + " GWh, about the flow to distribution losses in the Sankey.") +
      "</div>";
  }
  function factsHTML(F) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      F.facts.map(function (f) { return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + "</td><td class=\"s\"><a href=\"" + esc(f.url) + "\">" + esc(f.source) + "</a> · " + esc(f.asof) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  // the city data's sources for the parts this page shows, the hydrogen branch included (gas per kg, the heating value)
  var CITY_SRC = ["eia-btu", "eia-dg-2024", "eia-recs-wnc", "doe-fotw1360", "eia-930", "eia-aeo2026-hmm", "hydrogen-properties"];
  function srcItem(s) {
    var via = function (x) { return x.replace(/ \(via [^)]*\)/g, ""); }, cap = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
    var t = s.url && s.url !== "no link" ? "<a href=\"" + esc(s.url) + "\">" + esc(s.title) + "</a>" : esc(s.title) + " (no link)";
    return "<li>" + esc(cap(s.publisher)) + ". " + t + ". " + esc(cap(via(s.date))) + ". " + esc(cap(via(s.where))) + ".</li>";
  }
  function sourcesHTML(C, F) {
    return "<p class=\"lx-hint\">Who decides what (typical U.S. practice):</p><ul>" + Object.keys(F.sources).map(function (k) { return srcItem(F.sources[k]); }).join("") + "</ul>" +
      "<p class=\"lx-hint\">Prairie City's flows (the course's shared city data), the parts used here:</p><ul>" + CITY_SRC.map(function (k) { return srcItem(C.sources[k]); }).join("") + "</ul>";
  }

  var model = { detailed: detailed, grouped: grouped, balance: balance, carriers: carriers, sectors: sectors, power: power, lens: lens, litParts: litParts, litLine: litLine, LENS_MIN: LENS_MIN, countLine: countLine, CONV: CONV, H2_LINE: H2_LINE, into: into, outOf: outOf,
    STEPS: STEPS, Q_CARRIER: Q_CARRIER, carrierQ: carrierQ, sectorLine: sectorLine, sectorSaw: sectorSaw, Q_LOSS: Q_LOSS, lossQ: lossQ, lossLine: lossLine,
    OWN_TICKS: OWN_TICKS, OWN_VAL: OWN_VAL, ownTick: ownTick, powerLine: powerLine, POWER_SAW: POWER_SAW, WHO_LINE: WHO_LINE, SORT_NOTE: SORT_NOTE, lensLine: lensLine, LENS_SAW: LENS_SAW, muniSaw: muniSaw, whyItems: whyItems,
    homesMix: homesMix, lostCell: lostCell, staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, factsHTML: factsHTML, sourcesHTML: sourcesHTML, CITY_SRC: CITY_SRC, fmtN: fmtN, pct: pct, gwh: gwh };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function fmtG(v) { return fmtN(v); }

  LX.mount("f09", function (live, data, root) {
    var C = data.prairie_city, F = data[KEY], P = data.path, demo = [];
    var last = { view: "grouped", actor: "city" };
    function fictional(host) { H("p", { class: "lx-hint f9-fict", text: C.about.line }, host); }
    function conv(host) { H("p", { class: "lx-hint f9-conv", text: CONV }, host); H("p", { class: "lx-hint f9-conv", text: H2_LINE }, host); }
    function sankey(host, label, h) { return LX.Sankey(host, { label: label, unit: "GWh", fmt: fmtG, height: h || 340, heightN: 420, textHead: ["From", "To", "GWh in 2025"], colNames: ["Sources", "Carriers", "Sectors", "Becomes"] }); }

    var steps = [
      { text: STEPS[0], build: function (act, api) {
          var Q = carrierQ(C), res = H("div", { class: "f9-res" }, act);
          var pr = LX.Predict(act, { id: "f9-carrier", q: "The biggest carrier", title: false, answer: Q.answer, options: Q_CARRIER.options, feedback: Q.feedback, onPick: function () { show(); } });
          act.appendChild(res);
          function show() { pr.reveal(); res.innerHTML = ""; sankey(res, "Prairie City's energy in 2025, sources to carriers to users to useful energy, in GWh", 400).set(detailed(C, F)); conv(res); fictional(res); api.done(); }
          if (pr.picked()) show();
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelector(".lx-choice"); if (b) b.click(); } };
        } },
      { text: STEPS[1], build: function (act, api) {
          var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), sk;
          sk = LX.Sankey(act, { label: "Prairie City's energy in 2025 by sector, in GWh", unit: "GWh", fmt: fmtG, height: 300, heightN: 380, textHead: ["From", "To", "GWh in 2025"], colNames: ["Sources", "Carriers", "Sectors", "Becomes"],
            onPick: function (id) { var t = id && sectorLine(C, F, id); if (t) { ln.innerHTML = bold(t); api.done(); api.saw(sectorSaw(C, F)); } } });
          sk.set(grouped(C, F)); act.insertBefore(ln, null); fictional(act);
          ln.textContent = "Tap a sector's bar in the third column.";
          demo[1] = function () { sk.pick("buildings"); };
        } },
      { text: STEPS[2], build: function (act, api) {
          var Q = lossQ(C, F), res = H("div", { class: "f9-res" }, act);
          var pr = LX.Predict(act, { id: "f9-loss", q: "The sector that loses the most", title: false, answer: Q.answer, options: Q_LOSS.options, feedback: Q.feedback, onPick: function () { show(); } });
          act.appendChild(res);
          function show() {
            pr.reveal(); res.innerHTML = "";
            var sk = sankey(res, "Prairie City's energy in 2025 by sector, in GWh"); sk.set(grouped(C, F)); sk.pick("transport");
            H("p", { class: "lx-step-line", html: bold(lossLine(C, F)) }, res); conv(res); fictional(res); api.done();
          }
          if (pr.picked()) show();
          demo[2] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } },
      { text: STEPS[3], build: function (act, api) {
          var res = H("div", { class: "f9-res" }, act), ans = ownTick(power(C).own);
          function result() {
            res.innerHTML = "";
            var sk = sankey(res, "Prairie City's energy in 2025 by sector, in GWh"); sk.set(grouped(C, F)); sk.pick("el");
            H("p", { class: "lx-step-line", html: bold(powerLine(C)) }, res); fictional(res); api.done(); api.saw(POWER_SAW);
          }
          var g0 = LX.progress.guess("f9-own");
          if (g0 != null && OWN_TICKS[g0]) { H("p", { class: "lx-hint", text: "Your guess: " + OWN_TICKS[g0] + "." }, act); result(); }
          else LX.Guess(act, { id: "f9-own", q: "Share of the electricity made in the city", ticks: OWN_TICKS, answer: ans, start: 1, onLock: function () { result(); } });
          act.appendChild(res);
          demo[3] = function () { var b = act.querySelector(".lx-guess .lx-btn"); if (b) b.click(); };
        } },
      { text: STEPS[4], build: function (act, api) {
          var bins = F.actors.map(function (a) { return { id: a.key, label: a.label, sub: a.sub, color: a.color }; });
          var cards = F.levers.map(function (l) { return { id: l.id, text: l.text, bin: l.bin, why: l.why }; });
          var note = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", html: LX.rich(WHO_LINE) }, act);
          var why = H("details", { class: "lx-textalt f9-why" }), wl;
          H("summary", { text: "Every reason, with its source" }, why); wl = H("ul", null, why);
          whyItems(F).forEach(function (x) { H("li", { html: "<b>" + LX.esc(x.text) + ".</b> " + LX.rich(x.why) + " <span class=\"f9-src\">(" + LX.esc(x.src) + ")</span>" }, wl); });
          var cs = LX.CardSort(act, { bins: bins, cards: cards, maxWhy: 9, onCheck: function (g) { note.textContent = g.right + " of " + g.total + " match the typical roles. Open the reasons for their sources."; act.appendChild(why); api.done(); buildExplain(); } });
          act.appendChild(note);
          H("p", { class: "lx-hint", text: SORT_NOTE }, act);
          demo[4] = function () { var m = {}; cards.forEach(function (c) { m[c.id] = c.bin; }); cs.place(m); cs.check(); };
        } },
      { text: STEPS[5], build: function (act, api) {
          var seen = {}, seg = H("div", { class: "lx-seg f9-actors", role: "group", "aria-label": "Who" }, act), btn = {};
          var sk = sankey(H("div", null, act), "Prairie City's energy in 2025, lit where the chosen actor has a main lever");
          var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          var lt = H("p", { class: "lx-hint", "aria-live": "polite" }, act), cnt = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          fictional(act);
          F.actors.forEach(function (a) { btn[a.key] = H("button", { type: "button", text: a.label }, seg); btn[a.key].addEventListener("click", function () { show(a.key); }); });
          function show(k) {
            seen[k] = true; last.actor = k; Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === k)); });
            sk.set(lens(C, F, k).spec); ln.innerHTML = bold(lensLine(F, k)); lt.textContent = litLine(C, F, k);
            var n = Object.keys(seen).length; cnt.textContent = countLine(n);
            if (n >= LENS_MIN) { api.done(); api.saw(LENS_SAW); }
          }
          show(last.actor);
          demo[5] = function () { ["utility", "regulator", "city"].forEach(show); };
        } },
      { text: STEPS[6], build: function (act, api) {
          var M_ = F.muni, extra = H("p", { class: "lx-hint" }, act);
          var pr = LX.Predict(act, { id: "f9-muni", q: M_.q, title: false, answer: M_.answer, options: M_.options, feedback: M_.feedback, onPick: function () { show(); } });
          act.appendChild(extra);
          function show() {
            pr.reveal();
            extra.textContent = F.muni.extra;
            api.done();
          }
          if (pr.picked()) show();
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "Who decides what, as diagrams" + LX.icon("arrow") }, act);
          demo[6] = function () { if (!pr.picked()) { var b = act.querySelector(".lx-choice"); if (b) b.click(); } };
        } }
    ];
    var cards = LX.StepCards(live, { id: "f9-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("f09-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var c1 = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Prairie City's year of energy, by sector" }, c1);
      LX.Sankey(c1, { label: "Prairie City's energy in 2025 by sector, in GWh", unit: "GWh", fmt: fmtG, height: 300, heightN: 380, textHead: ["From", "To", "GWh in 2025"], colNames: ["Sources", "Carriers", "Sectors", "Becomes"],
        caption: C.about.line }).set(grouped(C, F));
      H("p", { class: "lx-hint", text: C.about.line + " Tap a bar for its flows in and out." }, c1); conv(c1);
      var R = F.roles;
      LX.Stakeholders(H("div", { class: "lx-xcard" }, xhost), { title: "Who decides what, by sector", lede: "Typical roles in a U.S. city served by an investor-owned utility, as in Kansas.",
        cols: R.cols, rows: R.rows, note: R.note });
      var nx = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Where this goes next" }, nx);
      var ul = H("ul", { class: "f9-next" }, nx);
      [["A15", "how much efficiency and electrification can change a city's demand"], ["A18", "how a city's energy plan is made"], ["F11", "what energy does to the air and to people's lives"], ["SB3", "the City Planner sandbox"], ["A4", "how electricity bills are designed"]]
        .forEach(function (x) { H("li", { html: LX.lessonRefHTML(P, x[0]) + ": " + LX.esc(x[1]) + "." }, ul); });
    }
    buildExplain();

    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, C: C, F: F, cards: cards };
  });
})();
