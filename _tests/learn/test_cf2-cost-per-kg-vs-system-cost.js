// test_cf2-cost-per-kg-vs-system-cost.js — Node tests for case file CF2 (assets/learn/cf2-cost-per-kg-vs-system-cost.js,
// its data file and the page, learn/cf2-cost-per-kg-vs-system-cost.qmd, or the draft in learn/_drafts/):
//   - the toy (illustrative): block hours fall, each block's own cost per kg rises, the average cost per kg (LCOH) rises
//     with size, the lowest net cost sits where the last block's cost per kg is below the price and the next one's above,
//     and a higher price gives a bigger electrolyzer with a higher LCOH and a lower net cost
//   - the chart puts each mark at the size it belongs to; the live status keeps one idea per line
//   - the allow-listed explainer (assets/explainers/wind-hydrogen.js) moves the same way, as the page says
//   - every number on the page (comparison table, assumptions, myth answers, numbers to remember) matches the model or
//     the data file
//   - the three no-JS blocks (timeline, toy, boundary) equal what the components write from the data (--write rewrites them)
//   - research wording (the course's sourcing rule): every sentence on the page, in the data file and in this lesson's
//     script that describes the course author's studies is an approved sentence of the excerpt wording
//     (E3-E5, with its "Revisions after review"), word for word; see "research wording" below
//   - citations: the title of every Li et al. paper in the sources list is the title in the author's publication list
//   - text budget of every text element, links (doi.org, the allow-listed repository, learn pages only)
// Usage (from the site folder):  node _tests/learn/test_cf2-cost-per-kg-vs-system-cost.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const PRIV = require("./private_sources.js");
const ID = "cf2-cost-per-kg-vs-system-cost";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const TL = require(L("components/timeline.js"));
const EX = require(path.join(SITE, "assets/explainers/wind-hydrogen.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const D = JSON.parse(RAW);
const QPATH = [path.join(SITE, "learn", ID + ".qmd"), path.join(SITE, "learn/_drafts", ID + ".qmd")].find(p => fs.existsSync(p));
const I = D.idea;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "cf2-timeline": () => TL.staticHTML(D.timeline.events),
  "cf2-idea": () => M.staticIdea(I),
  "cf2-bound": () => M.staticBoundary(D.boundary)
};
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("no-JS blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ---------------- the toy model
const B = M.blocks(I), N = B.length;
ok(N === 8 && B.every((b, k) => k === 0 || b.hours < B[k - 1].hours), "eight blocks, each running fewer full-power hours than the one below");
ok(B.every((b, k) => k === 0 || b.perKg > B[k - 1].perKg), "each added block's own cost per kg is higher");
ok(near(B[0].kg, 900000) && near(B[0].cost, 1580000) && near(B[0].perKg, 1400000 / 900000 + 0.2), "block 1: 10 MW x 5,000 h x 18 kg/MWh = 900,000 kg; $1,580,000 a year; $1.76/kg");
for (let n = 2; n <= N; n++) ok(M.design(I, 4, n).lcoh > M.design(I, 4, n - 1).lcoh, "LCOH rises from " + (n - 1) + " to " + n + " blocks");
const want = { 3: 40, 4: 50, 5: 60 }, lcohAt = { 3: 2.19, 4: 2.36, 5: 2.53 }, netAt = { 3: "−$2.26M", 4: "−$5.31M", 5: "−$8.88M" };
I.prices.forEach(p => {
  const b = M.best(I, p), n = b.net.n;
  ok(b.net.mw === want[p], "at $" + p + "/kg the lowest net cost is at " + want[p] + " MW (got " + b.net.mw + ")");
  ok(B[n - 1].perKg < p && (n === N || B[n].perKg > p), "at $" + p + "/kg: the last block built is below the price, the next above (the page's stopping rule)");
  ok(b.lcoh.n === 1 && near(b.lcoh.lcoh, B[0].perKg), "at $" + p + "/kg the lowest cost per kg is the smallest size, 10 MW");
  ok(M.usd2(b.net.lcoh) === "$" + lcohAt[p].toFixed(2), "at $" + p + "/kg the best size's LCOH is $" + lcohAt[p].toFixed(2) + " (got " + M.usd2(b.net.lcoh) + ")");
  ok(M.musd(b.net.net) === netAt[p], "at $" + p + "/kg the best net cost change is " + netAt[p] + " (got " + M.musd(b.net.net) + ")");
  for (let k = 0; k <= N; k++) ok(M.design(I, p, k).net >= b.net.net - 1e-6, "at $" + p + "/kg no size beats the best net cost (" + k + " blocks)");
});
ok(!I.prices.some(p => B.some(b => near(b.perKg, p, 0.005))), "no block's own cost per kg equals a price on the buttons: the optimum is a stopping rule, not an equality");
ok(M.best(I, 3).net.lcoh < M.best(I, 4).net.lcoh && M.best(I, 4).net.lcoh < M.best(I, 5).net.lcoh && M.best(I, 3).net.net > M.best(I, 4).net.net && M.best(I, 4).net.net > M.best(I, 5).net.net,
  "a higher price: bigger electrolyzer, higher LCOH, lower net cost (the case's pattern, in the toy)");
ok(M.design(I, 4, 0).net === 0 && M.design(I, 4, 0).lcoh === null, "no electrolyzer: no change, no LCOH");
ok(I.prices.indexOf(I.startPrice) >= 0 && I.startBlocks >= 0 && I.startBlocks <= N, "start state inside the controls");
ok(near(M.design(I, 4, 6).net - M.design(I, 4, 5).net, 1400000 - 3.8 * 360000, 1e-6) && M.design(I, 4, 6).net > M.design(I, 4, 5).net,
  "at $4/kg the sixth block ($4.09/kg) raises the net cost slightly");

// ---------------- the chart: each mark at the size it belongs to (x = size in blocks; 1 block = 10 MW)
I.prices.forEach(p => { for (let n = 0; n <= N; n++) {
  const C = M.chart(I, p, n), d = M.design(I, p, n);
  ok(C.bars.length === N && C.bars.every((b, k) => b.x0 > k && b.x1 < k + 1 && near(b.y1, B[k].perKg) && (b.op > 0.5) === (k < n)), "chart at $" + p + ", " + n + " blocks: block k's bar inside [k-1, k] MW/10, solid when built");
  ok(C.avg.length === N && C.avg.every((pt, k) => pt[0] === k + 1 && near(pt[1], M.design(I, p, k + 1).lcoh)), "chart: the average for n blocks sits at x = n (" + (n * 10) + " MW), not half a block early");
  ok(n ? C.marks.length === 1 && C.marks[0].x * I.blockMW === d.mw && near(C.marks[0].y, d.lcoh) : C.marks.length === 0, "chart: the 'You' marker sits at the displayed size (" + d.mw + " MW)");
} });
ok(M.chart(I, 4, 5).ticks.every(t => t[1].replace(" MW", "") === String(t[0] * I.blockMW)), "chart ticks label blocks as MW");

// ---------------- live status: one idea per line, short
I.prices.forEach(p => { for (let n = 0; n <= N; n++) {
  const lines = M.status(I, p, n);
  ok(lines.length >= 1 && lines.length <= 2 && lines.every(t => text(t).split(" ").length <= 25), "status at $" + p + ", " + n + " blocks: at most two lines of 25 words or fewer");
} });
ok(/lowers the system's net cost/.test(M.status(I, 4, 5)[0]) && /lowest net cost/.test(M.status(I, 4, 5)[1]) && /\$2\.36, is above the smallest size's \$1\.76/.test(M.status(I, 4, 5)[1]), "status at the optimum: the marginal line, then the average line");

// ---------------- the allow-listed explainer shows the same mechanism (stylized), and its readout is a total
const lo = EX.model({ price: EX.C.pMin }), hi = EX.model({ price: EX.C.pMax });
ok(hi.size > lo.size && hi.lcoh > lo.lcoh && hi.netCost < lo.netCost, "explainer: a higher price gives a bigger electrolyzer, higher LCOH and lower net system cost");
ok(EX.C.ce === I.annualCostPerMW && EX.C.eta === I.kgPerMWh && EX.C.v === I.variableCostPerKg, "toy and explainer share the stylized cost, yield and variable cost");
ok(EX.C.C0 > 0 && near(EX.model({ price: 4 }).netCost - EX.C.C0, (EX.C.ce * EX.model({ price: 4 }).size + (EX.C.v - 4) * EX.model({ price: 4 }).hydrogen) / 1e6, 1e-9),
  "explainer: its net cost includes the wind farm's own cost (a total, not a change), as the page says");
ok(Math.abs(EX.model({ price: 4 }).size - M.best(I, 4).net.mw) > 10, "explainer: its best size at $4/kg differs from the blocks' (its own wind shape), as the page says");

// ---------------- numbers on the page
const T = text(PAGE);
ok(/10 MW makes the cheapest kilogram \(\$1\.76\), but 50 MW gives the lowest net cost/.test(T) && M.usd2(B[0].perKg) === "$1.76" && M.best(I, 4).net.mw === 50, "myth 1 numbers = the toy at $4.00/kg");
ok(/Best size at \$4\.00\/kg">10 MW</.test(PAGE) && /Best size at \$4\.00\/kg">50 MW</.test(PAGE) && I.startPrice === 4, "comparison table: 10 MW and 50 MW at $4.00/kg");
ok(/Worked block: 10 MW × 5,000 h × 18 kg\/MWh = 900,000 kg a year\. It costs \$140,000 × 10 \+ \$0\.20 × 900,000 = \$1,580,000 a year, so \$1\.76 per kg\./.test(T), "worked block on the page = the model");
D.facts.forEach(f => {
  const row = PAGE.indexOf('<td class="n">' + f.n + "</td><td>" + f.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + f.n + "' row matches the data file");
  ok(row >= 0 && PAGE.slice(row, row + 600).indexOf(f.url) >= 0 && PAGE.slice(row, row + 600).indexOf(f.asof) >= 0, "numbers to remember: '" + f.n + "' carries its source and date");
});
ok(/reduced total system cost by about 7%/.test(T) && /reduced it by about 26%/.test(T) && /fell by about 2%/.test(T) && /about 10%/.test(T), "facts agree with the excerpts");
ok(/about 10% lower turbine upkeep cut the cost per kilogram of hydrogen by about 2%/.test(T), "myth 2 uses the excerpt's numbers");

// ---------------- excerpts and sources
const allowed = ["excerpt:wind-hydrogen", "excerpt:solar-hydrogen", "excerpt:offshore-om"];
const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
ok(keys.length === 3 && keys.every(k => allowed.indexOf(k) >= 0), "excerpts use only CF2's approved source keys (" + keys.join(", ") + ")");
// the page's own links (the generated header, next box and footer are the course build step's and checked by the scope scan)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.every(h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://github.com/Henryutd2021/reopt-hydrogen-framework" || /^[0-9a-z-]+\.html$/.test(h) || /^\.\.\/assets\//.test(h) || /^#/.test(h)),
  "links: doi.org, the allow-listed repository and learn pages only");
ok(!/projects\/|research\.html/.test(PAGE), "no project page and no Research page");
ok(TL.validate(D.timeline.events).length === 0 && D.timeline.events.every(e => e.source && e.source.label), "every timeline event has a valid date and a source");
ok(D.timeline.events.filter(e => /doi\.org/.test((e.source || {}).url || "")).every(e => hrefs.indexOf(e.source.url) >= 0), "every study in the timeline is in the sources list");

// ---------------- research wording (the sourcing rule)
// Every sentence that describes the course author's studies (question, method, data, findings, limits, citation) is (a) an
// approved sentence of the excerpt wording (the sections in CF.sections) or (b) a revision listed under
// "Revisions after review", word for word. A page sentence may be a clause of an approved row only where the row itself breaks
// (": ", "; ", ". "), as in "Inside: ..." or a boundary list item. Where it looks:
//   strict (every text element, unless listed in NOT_RESEARCH): the case parts, the excerpts and their notes, the
//     explainer's no-JS steps, the sources list; in the data file the texts of the study and code steps of the timeline,
//     the boundary lists and the facts' 'what'
//   signalled (an element that names a study, paper, author, site or method, by RX): everything else on the page (the
//     generated header's description and course-map line included), every string of the data file, every string literal
//     of this lesson's script
// NOT_RESEARCH lists what may name a study without describing it: part labels, provenance labels, citation labels and
// general ideas that hold in the toy; each entry has its reason. The approved wording is read through
// private_sources.js; without it the test uses APPROVED_SNAPSHOT below, which it otherwise checks against that wording.
const CF = { prefix: "cf2", sections: ["E3", "E4", "E5"], excerpts: 6, question: "E3.1", papers: 4 };
const APPROVED_SNAPSHOT = {   // the approved wording, E3-E5 with the revisions after review
  "E3.1": "How do electrolyzers, hydrogen storage and fuel cells change the cost, curtailment and firm output of a grid-connected wind farm?",
  "E3.2": "As the hydrogen price rose, the optimizer built a larger electrolyzer to use more surplus wind.",
  "E3.3": "The larger unit ran at lower utilization, so each kilogram carried more capital and the levelized cost of hydrogen rose, while hydrogen revenue lowered total system cost.",
  "E3.4": "Compared with wind and a battery alone, adding an electrolyzer reduced total system cost by about 7%, and using hydrogen as the storage medium for fuel cells reduced it by about 26%.",
  "E3.5": "Holds when: one planned West Texas wind farm, ERCOT prices, costs from 2020 to 2023. Leaves out: final federal hydrogen credit rules.",
  "E3.6": "Inside: one planned 253 MW wind farm in West Texas, with a battery and hydrogen equipment, hour by hour for a year (8,760 hours).",
  "E3.7": "Left out: the rest of the grid, which enters only through ERCOT wholesale prices, and final federal hydrogen credit rules; costs date from 2020 to 2023.",
  "E3.8": "Decisions: the sizes of the battery, electrolyzer, hydrogen tank and fuel cell, and how each runs every hour. Goal: the lowest life-cycle cost of the whole system, net of what it earns from electricity and hydrogen. Rules: deliver the largest steady output it can in every hour; no machine runs above its size.",
  "E3.9": "A mixed-integer linear program, an extension of NREL's REopt model, sizes and runs the equipment over a year of hours with ERCOT wholesale prices. Sensitivity runs vary the hydrogen price, the wind profile (four regions) and projected equipment costs to 2050.",
  "E3.10": "A grid-connected wind farm gets electrolyzers, a hydrogen tank and fuel cells, sized by an extended REopt model.",
  "E3.11": "Four system configurations, wind profiles from four regions and a hydrogen-price sensitivity; published online in December 2023, in the February 2024 issue.",
  "E3.12": "A documented, open implementation of the model, with synthetic examples (version 1.0.0).",
  "E3.13": "Where the result holds: one planned 253 MW wind farm in West Texas, with ERCOT wholesale prices; hydrogen sold at a set price per kilogram; cost assumptions dated 2020 to 2023. It leaves out: final federal hydrogen credit rules, which came later; the rest of the grid, which enters only through wholesale prices; where the hydrogen goes after it is sold.",
  "E3.14": "A higher hydrogen price makes each kilogram worth more, so the optimizer builds a larger electrolyzer to capture more surplus wind. The extra capacity runs fewer full-load hours, so the cost per kilogram, the levelized cost of hydrogen, goes up. Yet the added hydrogen revenue lowers the net cost of the whole system. The cost per kilogram and the system's cost move in opposite directions.",
  "E3.15": "Battery, hydrogen and hybrid storage were compared, each set to deliver the largest stabilized output in every hour at the lowest life-cycle cost.",
  "E3.16": "Hybrid hydrogen and battery storage delivered the highest stabilized output of the four configurations.",
  "E4.1": "Among the cases studied, concentrated solar power with thermal storage running a high-temperature electrolyzer at variable power gave the lowest levelized cost of hydrogen; constant-power operation was the most expensive.",
  "E4.2": "Yardstick here: the cost per kilogram across designs. Holds for: one West Texas site, cost projections from NREL's Annual Technology Baseline, a conference-length study.",
  "E4.3": "Concentrated solar and photovoltaic designs for making hydrogen are compared by their cost per kilogram.",
  "E5.1": "Prognostics-based maintenance lowered wind operation-and-maintenance cost by about 10% and downtime by about 11%.",
  "E5.2": "The saving applies to the turbines alone, so its effect on the whole system was smaller: the levelized cost of hydrogen fell by about 2%.",
  "E5.3": "Prognostics: predicting failures to plan repairs. Holds for: one Gulf of Mexico site and one weather year.",
  "E5.4": "An offshore wind farm supplying hydrogen: a maintenance simulation feeds the same kind of plant optimization.",
  "E5.5": "In the offshore study, about 10% lower turbine upkeep cut the cost per kilogram of hydrogen by about 2%: upkeep is one share of all the costs."
};
// names a study, its author, its site or its method: such an element is research text unless approved or listed below
const RX = /\b(stud(y|y's|ies|ies')|paper|article|journal|Li et al|course author|excerpt|research|published|REopt|ERCOT|West Texas|253 MW|Gulf of Mexico|offshore|optimizer|configurations?|four regions|2050|8,760|stabilized|utilization)\b/i;
const NOT_RESEARCH = [
  [/^\d · [A-Z][a-z ,]+$/, "part label"],
  [/^Related study · (solar and hydrogen|maintenance offshore)$/, "part label"],
  [/^Question type: prescriptive \(what should be built, and how should it run\?\)\.$/, "course label (the course's question types)"],
  [/^Approved excerpt of: Li et al\. \(\d{4}\), (Journal of Mechanical Design|EEM 2023|J\. Phys\.: Conf\. Ser\. 2767)\.$/, "provenance label"],
  [/^From the approved excerpt of Li et al\. \(2024\), Journal of Mechanical Design\.$/, "provenance label"],
  [/^Every result about the studies is quoted from approved excerpts of the published papers named in the sources\.$/, "provenance label"],
  [/^Li et al\. \(\d{4}\), (Journal of Mechanical Design|J\. Phys\.: Conf\. Ser\. 2767) · published (online )?[A-Z][a-z]+ \d{4}$/, "citation label (numbers table)"],
  [/^Li et al\. \(\d{4}\), (J\. Phys\.: Conf\. Ser\. \d+, \d+|EEM 2023|Journal of Mechanical Design( 146, 020903)?|J\. Phys\.: Conf\. Ser\. 2767)$/, "citation label (timeline, data file)"],
  [/^(The studies in time|Where the result holds)$/, "heading"],
  [/^(Conference paper|Journal article \(this case\)|Code released)$/, "timeline step label: the kind of output"],
  [/^Illustrative numbers, not the studies' inputs or results\.$/, "provenance label (the toy)"],
  [/^A separate example with stylized numbers, from the course author's open explainer: not the study's data or results\.$/, "provenance label (the explainer)"],
  [/^Myth, unless that part is the whole cost\.$/, "general idea"],
  [/^(An electrolyzer next to a wind farm turns spare wind into hydrogen\.|A bigger one makes each kilogram cost more\.|Can the bigger one still be the better choice\?)$/, "the puzzle: a general idea, true of the toy; no study claim"],
  [/^The toy below uses illustrative round numbers\.$/, "provenance label (the toy)"],
  [/^(Run examples\/configurations\.py\.|Its hydrogen-price cases solve one synthetic site at several prices: compare the electrolyzer size, LCOH and the objective \(net life-cycle cost\) row by row\.)$/, "repository exercise on its synthetic examples, not the study"],
  [/^reopt-hydrogen-framework: public example repository · MIT licence · synthetic data\.$/, "repository label"],
  [/^reopt-hydrogen-framework on GitHub, version 1\.0\.0 \(30 October 2026\)\.$/, "citation of the repository"],
  [/^Cutler, D\. et al\. \(2017\)\. REopt: A Platform for Energy System Integration and Optimization\. NREL\/TP-7A40-70022 \(the model family the study extended\)\.$/, "citation (NREL report)"],
  [/^reopt-hydrogen-framework on GitHub$/, "citation label (repository)"]
];
const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
// {id: sentence} of the approved wording's rows in SECTIONS, each revision applied (a revised row replaces the approved one)
function register(md) {
  const out = {}; let sec = null;
  const strip = t => norm(t.replace(/^(Timeline, [^:]+|Myth answer|Citation): /, ""));
  md.split("\n").forEach(line => {
    if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+) \| (.*) \|\s*$/);
    if (!m || !sec || CF.sections.indexOf("E" + m[2]) < 0) return;
    const cells = m[3].split(" | ");
    if (sec === "REV") out[m[1]] = strip(cells[1]); else if (sec === "E" + m[2]) out[m[1]] = strip(cells[0]);
  });
  return out;
}
const RP = PRIV.path("excerpts");
let APPROVED = APPROVED_SNAPSHOT;
if (RP) {
  const reg = register(fs.readFileSync(RP, "utf8"));
  const same = (x, y) => Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => x[k] === y[k]);
  ok(same(reg, APPROVED_SNAPSHOT), "the approved-sentence snapshot in this test equals the approved wording (" + CF.sections.join(", ") + ", revisions applied); differs at: " +
    Object.keys(Object.assign({}, reg, APPROVED_SNAPSHOT)).filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
  APPROVED = reg;
} else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); research wording checked against the snapshot in this test");
const UNITS = Object.values(APPROVED).map(norm);
function approved(seg) {
  const s = norm(seg);
  return s.length > 0 && UNITS.some(u => {
    for (let i = u.indexOf(s); i >= 0; i = u.indexOf(s, i + 1)) {
      const pre = u.slice(0, i), post = u.slice(i + s.length);
      if ((i === 0 || /[:;.?!] $/.test(pre)) && (post === "" || /^[:;.]/.test(post) || (/^ /.test(post) && /[.;:?!]$/.test(s)))) return true;
    }
    return false;
  });
}
const listed = s => NOT_RESEARCH.some(r => r[0].test(norm(s)));
const sentencesOf = s => norm(s).split(/(?<=[.?!])\s+(?=[A-Z“"])/);
// the offending sentence of an element, or null when the element is approved, listed or made of approved and listed sentences
function offending(seg) {
  if (approved(seg) || listed(seg)) return null;
  return sentencesOf(seg).find(x => !approved(x) && !listed(x)) || null;
}
// text elements of an HTML (or Markdown list) fragment; inline tags stay inside their element
function elements(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|caption|details|summary|header|h[1-6]|section|nav|script)\b[^>]*>|```[^\n]*\n?/i)
    .map(norm).filter(s => s && !/^(:::|\{=html\})/.test(s) && /[A-Za-z]/.test(s));
}
const bad = [];
const strict = (where, list) => list.forEach(s => { const o = offending(s); if (o) bad.push(where + ": " + o); });
const signalled = (where, list) => list.forEach(s => { if (RX.test(s)) { const o = offending(s); if (o) bad.push(where + ": " + o); } });
// the page: strict zones cut out, generated no-JS blocks dropped (their data is checked below), the rest signalled
const GENERATED = new RegExp("<!-- (" + CF.prefix + "-[a-z]+):start[\\s\\S]*?<!-- \\1:end -->", "g");
let REST = OWN.replace(GENERATED, " ");
const cut = (re, optional) => { const m = REST.match(re); ok(!!m || optional, "page zone found: " + re); if (m) REST = REST.replace(m[0], " "); return m ? m[0] : ""; };
strict("page, the case", elements(cut(/<div class="lx-case">[\s\S]*?\n<\/div>\n(?=<div class="lx-interactive")/)));
strict("page, the case's data note", elements(cut(/<p class="lx-datanote"><span>Every result[\s\S]*?<\/p>/)));
strict("page, explainer no-JS steps", elements(cut(/<ol class="ex-fallback[\s\S]*?<\/ol>/, true)));
const SRC = cut(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/);
// a paper cited with its title and DOI is checked against the publication list below; every other item is strict
const TITLED = /^<li>Li et al\. \((\d{4})\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>\./;
const SRC_LI = [...SRC.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => m[0]);
strict("page, sources", SRC_LI.filter(li => !TITLED.test(li)).map(norm));
signalled("page", elements(REST.replace(/^---[\s\S]*?\n---\n/, " ")));
const FM = (PAGE.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
signalled("front matter", [...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].map(m => m[2]));
const PATHYML = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = (PATHYML.split(/\n- kind: /).find(e => new RegExp("\\n  id: " + ID + "\\n").test(e)) || "");
ok(entry.length > 0, "path.yml has the entry");
signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome): "(.*)"$/gm)].map(m => m[2]));
// the data file
const henry = e => e.kind === "study" || e.kind === "event";
D.timeline.events.filter(henry).forEach(e => {
  if (e.text) strict("data, timeline " + e.date, [e.text]);
  ok(listed(e.label), "data, timeline " + e.date + ": the step's label names its kind only (" + e.label + ")");
});
strict("data, boundary", D.boundary.holds.concat(D.boundary.leaves, [D.boundary.title, D.boundary.source], D.boundary.lede ? [D.boundary.lede] : []));
strict("data, facts", D.facts.filter(f => /^Li et al\./.test(f.source)).map(f => f.what));
const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
signalled("data", strings(D).filter(x => ["about", "url", "date", "as_of", "asof", "built", "kind"].indexOf(x[0]) < 0).map(x => x[1]));
// this lesson's script: its string literals (comments are not shown)
const literals = JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
ok(bad.length === 0, "research wording: every sentence about the studies is approved or a recorded revision:\n  " + bad.join("\n  "));
// the excerpts themselves: approved sentences, and the question
const sentences = [...PAGE.matchAll(/<blockquote class="lx-excerpt"[^>]*>([\s\S]*?)<footer>/g)].flatMap(m => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
ok(sentences.length === CF.excerpts && sentences.every(approved), CF.excerpts + " excerpt sentences, each approved (" + sentences.length + ")");
ok(norm((PAGE.match(/<p class="lx-case-q">([\s\S]*?)<\/p>/) || [])[1] || "") === APPROVED[CF.question], "the question is " + CF.question + ", word for word");
// citations: titles as in the author's publication list
if (RP) {
  const bib = fs.readFileSync(PRIV.path("publications"), "utf8");
  const titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(m => m[1].replace(/[{}]/g, "").replace(/\\textbf/g, "").toLowerCase());
  const cites = SRC_LI.map(li => li.match(TITLED)).filter(Boolean);
  ok(cites.length === CF.papers, CF.papers + " Li et al. paper(s) with a title in the sources list (" + cites.length + ")");
  cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0 && /^https:\/\/doi\.org\//.test(c[2]), "sources: '" + c[3].slice(0, 50) + "' is the title in the publication list, with its DOI"));
}

// ---------------- text budget: every text element of the page's own prose stays short (one idea, about 35 words)
const prose = elements(OWN.replace(GENERATED, " ").replace(/<table class="lx-facts">[\s\S]*?<\/table>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/^---[\s\S]*?\n---\n/, " "));
prose.forEach(s => { const w = s.split(" ").length; ok(w <= 40 || approved(s), "text element of " + w + " words (40 at most unless one approved sentence): " + s.slice(0, 70)); });
I.assumptions.forEach(a => ok((a[0] + " " + a[1]).split(" ").length <= 25, "assumption row is short: " + a[0]));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
