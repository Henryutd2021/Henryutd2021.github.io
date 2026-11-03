// test_cf1-supply-chain-microgrids.js — Node tests for case file CF1 (assets/learn/cf1-supply-chain-microgrids.js, its
// data file and the page: the draft in learn/_drafts/, or learn/cf1-supply-chain-microgrids.qmd once it is live):
//   - the toy (illustrative): every site's cheapest wind and solar are unique, the hourly balance holds, the winner in each
//     setting is the one the page names (near without on-site energy, near when spare energy earns nothing or $25, windy at
//     $40), on-site energy narrows the gap, and with nothing to sell each site sells little of what it makes
//   - the toy's shapes: SPP's 2025 hourly wind and solar (town_year.json) scaled to each site's capacity factor
//   - the three no-JS blocks (timeline, toy, boundary) and the myths equal what the components write (--write rewrites them)
//   - research wording (curriculum §13, guard G-SRC): every sentence on the page, in the data file and in this lesson's
//     script that describes the course author's studies is an approved sentence of reports/learn/excerpts_for_approval.md
//     (E8, without the dropped E8.11-E8.12), word for word; see "research wording" below
//   - citations: the title of every Li et al. paper in the sources list is the title in inputs/publications.bib
//   - text budget, links (doi.org, the allow-listed repository, EIA, learn pages only)
// Usage (from the site folder):  node _tests/learn/test_cf1-supply-chain-microgrids.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ID = "cf1-supply-chain-microgrids";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const TL = require(L("components/timeline.js"));
const PR = require(L("components/profiles.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const D = JSON.parse(RAW);
const QPATH = [path.join(SITE, "learn", ID + ".qmd"), path.join(SITE, "learn/_drafts", ID + ".qmd")].find(p => fs.existsSync(p));
const I = D.idea;
const YEAR = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const SH = M.shapesFrom(I, YEAR, PR.townProfile), R = M.solve(I, SH);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// the myths, written from the toy (no study claim)
function staticMyths() {
  const n = R.none, s = R["sell" + I.sell[I.sell.length - 1]], w = s.sites[s.winner];
  const qq = (id, q, a) => '<div class="lx-qq" data-id="' + id + '" data-answer="myth">\n<p class="lx-qtext">Myth or fact? “' + q + '”</p>\n<ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>\n<details class="lx-answer"><summary>Answer</summary><p>' + a + "</p></details>\n</div>";
  return [qq("nearest", "The site nearest the customers is always the cheapest place for a factory.", "Myth. In the toy, once spare energy earns $" + s.st.sell + "/MWh, the " + I.sites[s.winner].name.toLowerCase() + " wins by " + M.usdK(s.gap) + " a year, though its site and shipping cost " + M.usdK(I.sites[1].site + I.sites[1].shipping - I.sites[0].site - I.sites[0].shipping) + " more."),
          qq("offgrid", "A factory with its own wind and solar no longer needs the grid.", "Myth. Even with " + w.W + " MW of wind and " + w.P + " MW of solar, the " + I.sites[s.winner].name.toLowerCase() + " still buys " + M.int(w.bought) + " MWh a year in calm, dark hours, and sells " + M.int(w.sold) + " MWh when it makes more than it needs.")].join("\n");
}
// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "cf1-timeline": () => TL.staticHTML(D.timeline.events),
  "cf1-idea": () => M.staticIdea(I, R),
  "cf1-bound": () => M.staticBoundary(D.boundary),
  "cf1-myth": () => staticMyths()
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
ok(/learn\/_drafts\//.test(QPATH) || /learn\/cf1/.test(QPATH), "the page: " + path.relative(SITE, QPATH));

// ---------------- the toy's shapes
I.sites.forEach(s => {
  const w = SH[s.key].wind, p = SH[s.key].solar, mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  ok(w.length === 8760 && near(mean(w), s.windCF, 1e-9) && near(mean(p), s.solarCF, 1e-9), s.key + ": wind and solar shapes scaled to the site's capacity factors");
});
// ---------------- the toy model
const expect = { none: 0, sell0: 0, sell25: 0, sell40: 1 };
Object.keys(R).forEach(k => {
  const r = R[k];
  ok(r.winner === expect[k], k + ": the winner is the " + I.sites[expect[k]].name.toLowerCase() + " (got " + I.sites[r.winner].name + ")");
  ok(r.gap > 1000, k + ": the two sites do not tie (gap $" + Math.round(r.gap) + ")");
  r.sites.forEach((x, i) => {
    const s = I.sites[i], all = [];
    for (let W = 0; W <= (r.st.onsite ? I.roomMW : 0); W++) for (let P = 0; P <= (r.st.onsite ? I.roomMW : 0); P++) all.push(M.siteYear(I, s, SH[s.key], W, P, r.st.sell).total);
    all.sort((a, b) => a - b);
    ok(near(all[0], x.total, 1e-6) && (all.length === 1 || all[1] - all[0] > 100), k + " " + s.key + ": the cheapest sizes (" + x.W + " MW wind, " + x.P + " MW solar) are unique");
    ok(near(x.made + x.bought - x.sold, I.loadMW * 8760, 1e-6), k + " " + s.key + ": made + bought − sold = the year's load");
    ok(near(x.total, Object.values(x.parts).reduce((a, b) => a + b, 0), 1e-6), k + " " + s.key + ": the parts add up to the total");
  });
});
ok(R.sell0.gap < R.none.gap && R.sell25.gap < R.sell0.gap, "on-site energy narrows the near site's lead, and a selling price narrows it further");
ok(R.sell0.sites.every(x => x.sold / x.made < 0.1), "with nothing to sell, each site sells (spills) under 10% of what it makes (the status line)");
ok(R.none.sites.every(x => x.W === 0 && x.P === 0) && near(R.none.gap, 550000, 1e-6), "without on-site energy: no plant, and the gap is the $550k of site and shipping");
ok(I.sell.indexOf(0) === 0 && I.sell.every((s, i) => i === 0 || s > I.sell[i - 1]) && I.sell.every(s => s < I.buyPrice), "selling prices below the buying price, in order");
const s40 = R.sell40.sites[1];
ok(s40.P === I.roomMW && s40.W < I.roomMW, "at $40 the windy site's solar fills its room (" + I.roomMW + " MW): a corner the toy's room limit sets, said in its assumptions");
ok(/room for up to 8 MW of each/.test(M.staticIdea(I, R)) && I.roomMW === 8, "the room limit is on the page");
ok(M.status(I, R, "sell40").length === 2 && M.status(I, R, "none").length === 1 && Object.keys(R).every(k => M.status(I, R, k).every(t => text(t).split(" ").length <= 25)), "status lines: one idea each, short");
// the page's comparison card and myths agree with the toy
const PT = text(PAGE);
ok(/the windy site, once spare energy earns enough/.test(PT) && R.sell40.winner === 1 && R.sell0.winner === 0, "the comparison card: the windy site wins only once spare energy earns enough");
ok(/It has no storage and no outages\./.test(PT) && !/battery|storage/i.test(JSON.stringify(I)), "the toy has no storage (and says so)");

const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/g, " ");
// ---------------- research wording (curriculum §13, guard G-SRC)
// Every sentence that describes the course author's studies (question, method, data, findings, limits, citation) is (a) an
// approved sentence of reports/learn/excerpts_for_approval.md (the sections in CF.sections) or (b) a revision listed under
// "Revisions after review", word for word. A page sentence may be a clause of an approved row only where the row itself breaks
// (": ", "; ", ". "), as in "Inside: ..." or a boundary list item. Where it looks:
//   strict (every text element, unless listed in NOT_RESEARCH): the case parts, the excerpts and their notes, the
//     explainer's no-JS steps, the sources list; in the data file the texts of the study and code steps of the timeline,
//     the boundary lists and the facts' 'what'
//   signalled (an element that names a study, paper, author, site or method, by RX): everything else on the page (the
//     generated header's description and course-map line included), every string of the data file, every string literal
//     of this lesson's script
// NOT_RESEARCH lists what may name a study without describing it: part labels, provenance labels, citation labels and
// general ideas that hold in the toy; each entry has its reason. The register is read from the ResearchPortfolio folder
// (LEARN_PORTFOLIO, the site's parent, or the parent of the site repository's main worktree); without it the test uses
// APPROVED_SNAPSHOT below, which it otherwise checks against the register.
const CF = { prefix: "cf1", sections: ["E8"], excerpts: 4, question: "E8.1", papers: 2, dropped: ["E8.11", "E8.12"] };
const APPROVED_SNAPSHOT = {   // excerpts_for_approval.md, E8 (approved 2026-11-03; E8.11-E8.12 dropped)
  "E8.1": "Where should a manufacturing supply chain place its facilities, and how much on-site wind, solar and storage should each facility install when facilities can trade energy with the grid?",
  "E8.2": "From the course author's research: in the modeled supply chains, each open factory or warehouse could run its own microgrid, with on-site wind, solar and storage, an energy balance every hour, and energy bought from and sold to the grid.",
  "E8.3": "When each facility can install its own wind, solar and storage and trade energy with the grid, a candidate site's renewable resource affects its operating cost.",
  "E8.4": "Because the transactive energy market brought a new revenue stream, locations with stronger renewables became competitive to establish facilities despite higher fixed and logistics cost.",
  "E8.5": "Transactive energy, time-of-use tariffs and climate conditions played a critical role in locating factories, warehouses, wind turbines, solar photovoltaics and energy storage systems.",
  "E8.6": "Contrary to intuition, energy storage systems, which balance intermittent power and uncertain load, had limited benefits for cost saving.",
  "E8.7": "Holds when: stylized networks with synthetic distances and costs, candidate sites in California, Arizona and Nevada, and one year, planned week by week for products and hour by hour for energy. Leaves out: grid outages, which the studies do not model.",
  "E8.8": "Inside: a stylized supply chain of factories, warehouses and retail stores, with candidate sites in California, Arizona and Nevada, over one year: production week by week, energy hour by hour (52 weeks of 168 hours). Left out: real distances and costs, which are synthetic; grid outages; the rest of the grid, which enters through hourly buying and selling prices.",
  "E8.9": "Decisions: which candidate factories and warehouses to open, how products move through the network, how much wind, solar and storage each open site installs, and what it buys and sells every hour. Goal: the lowest net cost of the supply chain (facilities, production, inventory, transport and energy), less what energy sales earn. Rules: each open site balances its energy every hour; weekly store demand is met at a set service level (a chance constraint).",
  "E8.10": "A mixed-integer model opens factories and warehouses, routes products and sizes each open site's wind, solar and storage, with an hourly energy balance and grid trade. Uncertain weekly store demand enters as a chance constraint with a set service level, written as its deterministic equivalent, so the model stays a mixed-integer linear program.",
  "E8.13": "Factories, warehouses and their on-site microgrids are sited and sized together, for a three-tier supply chain over one year; published online in February 2023, in the July 2023 issue.",
  "E8.14": "A two-tier version locates warehouses and sizes their microgrids, with electric-truck routing and electricity trading.",
  "E8.15": "A documented, runnable implementation of the location models, with synthetic examples (version 1.0.1).",
  "E8.16": "Where the result holds: stylized supply-chain networks with synthetic distances and costs; candidate sites in California, Arizona and Nevada; products planned week by week and energy hour by hour over one year; the modeled time-of-use tariffs and grid buying and selling prices. It leaves out: grid outages, which the studies do not model; real distances and costs, which are synthetic.",
  "E8.17": "Li et al. (2023). Facility and microgrid location-allocation for integrated supply chain and transactive energy operations. Applied Mathematical Modelling 119, 119–136. Li et al. (2023). Locating and Allocating Warehouse Facilities and Prosumer Microgrid in Transactive Energy Paradigm. 2023 International Conference on Smart Electrical Grid and Renewable Energy (SEGRE), 410–415. supply-chain-microgrid-models on GitHub, version 1.0.1 (30 October 2026)."
};
// names a study, its author, its site or its method: such an element is research text unless approved or listed below
const RX = /\b(stud(y|y's|ies|ies')|paper|article|journal|Li et al|course author|excerpt|research|published|supply chains?|factor(y|ies)|warehouses?|facilit(y|ies)|transactive|California|Arizona|Nevada|chance constraint|service level|stylized|synthetic|mixed-integer|SEGRE|Applied Mathematical Modelling|three-tier|two-tier|logistics)\b/i;
const NOT_RESEARCH = [
  [/^\d · [A-Z][a-z ,]+$/, "part label"],
  [/^Question type: prescriptive \(where should it build, and what should each site install\?\)\.$/, "course label (§11.2 question type)"],
  [/^Approved excerpt of: Li et al\. \(2023\), Applied Mathematical Modelling\.$/, "provenance label"],
  [/^From the approved excerpt of Li et al\. \(2023\), Applied Mathematical Modelling\.$/, "provenance label"],
  [/^Every result about the studies is quoted from approved excerpts of the published papers named in the sources\.$/, "provenance label"],
  [/^The toy below uses illustrative round numbers\.$/, "provenance label (the toy)"],
  [/^Illustrative numbers, not the studies' inputs or results\.$/, "provenance label (the toy)"],
  [/^Li et al\. \(2023\), (Applied Mathematical Modelling 119, 119–136|SEGRE 2023, 410–415)$/, "citation label (timeline, data file)"],
  [/^(The studies in time|Where the result holds)$/, "heading"],
  [/^(Conference paper|Journal article \(this case\)|Code released)$/, "timeline step label: the kind of output"],
  [/^(A factory usually goes where land is cheap and its customers are close\.|If it can make its own power and sell what it does not use, does a windy, sunny site far away start to look better\?)$/, "the puzzle: a general idea, true of the toy; no study claim"],
  [/^(When a factory can make and sell its own energy, its wind and sun become part of choosing where to build it\.?|Case file CF1 of Energy Systems, Step by Step: when a factory can make and sell its own energy, its wind and sun become part of choosing where to build it\.|Factories with their own energy|A case file in six parts and a timeline; then choose between two factory sites and see when on-site wind and sun, and selling energy to the grid, change the choice\.|Say how on-site energy and an hourly energy balance enter a location decision, and why a site with stronger wind and sun can win despite higher shipping costs\.|Where should a factory go when sun and wind are part of the decision\?)$/, "title, subtitle and path.yml text: the general idea of the toy, no study claim"],
  [/^(Run examples\/sensitivity\.py\.|It solves a synthetic supply chain in several cases: compare the benchmark row with "grid supply only"\.|Do the open factories or warehouses change\?|Predict first, then read the "purchase price \+25%" row: does on-site wind and PV capacity grow or shrink\?)$/, "repository exercise on its synthetic examples, not the study"],
  [/^supply-chain-microgrid-models: public example repository · MIT licence · synthetic data\.$/, "repository label"],
  [/^supply-chain-microgrid-models on GitHub$/, "citation label (repository)"],
  [/^Lesson F7 islanded a campus, and A14 asked whether its microgrid pays\.$|^This case puts on-site energy inside a larger choice: where to build\.$/, "course pointer: lessons, not the study"],
  [/^(Opening a site is a yes-or-no choice, so a location model is a mixed-integer program: lesson 10 writes such a model down and lesson 11 solves one\.|The toy above tries every pair of whole-MW sizes at two sites; a solver searches far larger networks without listing every choice\.)$/, "Go deeper: modelling method in general, not the study"],
  [/^(One factory, two sites|One factory, two sites \(illustrative\))$/, "toy title"],
  [/^(Both: a flat 3 MW factory load; .*|The toy's two sites \(illustrative, 2025 dollars\)|No on-site energy: .*|On-site wind and solar, spare energy sold for .*)$/, "the toy's no-JS lines (checked against the model)"],
  [/^Myth, unless .*$/, "general idea"],
  [/^EIA\. Hourly Electric Grid Monitor \(Form EIA-930\), SPP wind and solar, 2025: the toy's hourly shapes\.$/, "data source of the toy"],
  [/^Every hour counts on its own: energy made when the factory needs none is worth only what the grid pays for it\.$/, "the toy's general idea"],
  [/^MW factory load; grid power bought at \$$/, "a fragment of the toy's no-JS line, written by the script"]
];
const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
function portfolio() {
  const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
  try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a git checkout */ }
  return c.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
}
// {id: sentence} of the register's rows in SECTIONS, each revision applied (a revised row replaces the approved one)
function register(md) {
  const out = {}; let sec = null;
  const strip = t => norm(t.replace(/^(Timeline, [^:]+|Myth answer|Citations?): /, ""));
  md.split("\n").forEach(line => {
    if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+)(?: \[J\])? \| (.*) \|\s*$/);
    if (!m || !sec || CF.sections.indexOf("E" + m[2]) < 0) return;
    const cells = m[3].split(" | ");
    if (CF.dropped.indexOf(m[1]) >= 0) return;
    if (sec === "REV") out[m[1]] = strip(cells[1]); else if (sec === "E" + m[2]) out[m[1]] = strip(cells[0]);
  });
  return out;
}
const RP = portfolio();
let APPROVED = APPROVED_SNAPSHOT;
if (RP) {
  const reg = register(fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"));
  const same = (x, y) => Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => x[k] === y[k]);
  ok(same(reg, APPROVED_SNAPSHOT), "the approved-sentence snapshot in this test equals the register (" + CF.sections.join(", ") + ", revisions applied); differs at: " +
    Object.keys(Object.assign({}, reg, APPROVED_SNAPSHOT)).filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
  APPROVED = reg;
} else console.log("note: reports/learn/excerpts_for_approval.md not found (set LEARN_PORTFOLIO); research wording checked against the snapshot in this test");
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
const SRC = cut(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/);
// a paper cited with its title and DOI is checked against publications.bib below; every other item is strict
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
const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
signalled("data", strings(D).filter(x => ["about", "url", "date", "as_of", "asof", "built", "kind"].indexOf(x[0]) < 0).map(x => x[1]));
// this lesson's script: its string literals (comments are not shown)
const literals = JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
ok(bad.length === 0, "research wording: every sentence about the studies is approved or a recorded revision:\n  " + bad.join("\n  "));
// the excerpts themselves: approved sentences, and the question
const sentences = [...PAGE.matchAll(/<blockquote class="lx-excerpt"[^>]*>([\s\S]*?)<footer>/g)].flatMap(m => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
ok(sentences.length === CF.excerpts && sentences.every(s => UNITS.indexOf(s) >= 0), CF.excerpts + " excerpt sentences, each a whole approved row (" + sentences.length + ")");
ok(sentences.join(" ") === ["E8.3", "E8.4", "E8.5", "E8.6"].map(k => norm(APPROVED[k])).join(" "), "the excerpt quotes E8.3, E8.4, E8.5 and E8.6, in that order");
ok(norm((PAGE.match(/<p class="lx-case-q">([\s\S]*?)<\/p>/) || [])[1] || "") === APPROVED[CF.question], "the question is " + CF.question + ", word for word");
// citations: titles as in inputs/publications.bib
if (RP) {
  const bib = fs.readFileSync(path.join(RP, "inputs/publications.bib"), "utf8");
  const titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(m => m[1].replace(/[{}]/g, "").replace(/\\textbf/g, "").toLowerCase());
  const cites = SRC_LI.map(li => li.match(TITLED)).filter(Boolean);
  ok(cites.length === CF.papers, CF.papers + " Li et al. paper(s) with a title in the sources list (" + cites.length + ")");
  cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0 && /^https:\/\/doi\.org\//.test(c[2]), "sources: '" + c[3].slice(0, 50) + "' is the title in publications.bib, with its DOI"));
}

// ---------------- links and sources
const OWN2 = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs2 = [...OWN2.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN2.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
ok(hrefs2.every(h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://github.com/Henryutd2021/supply-chain-microgrid-models" || h === "https://www.eia.gov/electricity/gridmonitor/" || /^[0-9a-z-]+\.html$/.test(h) || /^\.\.\/assets\//.test(h) || /^#/.test(h)),
  "links: doi.org, the allow-listed repository, EIA and learn pages only: " + hrefs2.filter(h => !/^(https:\/\/doi\.org|\.\.\/|#|[0-9a-z-]+\.html$)/.test(h)).join(", "));
ok(!/projects\/|research\.html/.test(PAGE + RAW), "no project page and no Research page");
ok(TL.validate(D.timeline.events).length === 0 && D.timeline.events.every(e => e.source && e.source.label), "every timeline event has a valid date and a source");
ok(D.timeline.events.filter(e => /doi\.org/.test((e.source || {}).url || "")).every(e => hrefs2.indexOf(e.source.url) >= 0), "every study in the timeline is in the sources list");
ok(!/JORS|Operational Research Society|01605682/.test(PAGE + RAW + JS), "the JORS paper is left out (Henry, 2026-11-03)");
const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
ok(keys.length === 1 && keys[0] === "excerpt:supply-chain-mg", "the excerpt uses CF1's approved source key");

// ---------------- text budget: every text element of the page's own prose stays short (one idea, about 35 words)
const prose = elements(OWN2.replace(GENERATED, " ").replace(/<style>[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/^---[\s\S]*?\n---\n/, " "));
prose.forEach(s => { const w = s.split(" ").length; ok(w <= 40 || approved(s), "text element of " + w + " words (40 at most unless one approved sentence): " + s.slice(0, 70)); });

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
