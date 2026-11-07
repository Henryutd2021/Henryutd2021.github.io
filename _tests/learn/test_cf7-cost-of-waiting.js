// test_cf7-cost-of-waiting.js — Node tests for case file CF7 (assets/learn/cf7-cost-of-waiting.js, its data file and
// the page, learn/cf7-cost-of-waiting.qmd, or the draft in learn/_drafts/):
//   - the toy (illustrative): present-value identities, accounts that grow with the wait, a tariff that moves cost
//     between accounts without changing the total, bridge power that lowers the developer's cost and adds a social cost
//     (its CO2 above grid power); the most worth paying to wait less is the avoided cost
//   - every number on the page (comparison table, assumptions, worked month, myth answers, Go deeper, numbers to
//     remember) matches the model or the data file; the bars have a text version; the live status keeps one idea a line
//   - the three no-JS blocks (timeline, toy, boundary) equal what the components write from the data (--write rewrites them)
//   - scope (guard G-DC): data centers only as loads; no nuclear technology anywhere on the page, in the data or the script;
//     no "AI"; delay economics only; the paper is "accepted", never "published"
//   - research wording (curriculum §13, guard G-SRC): every sentence on the page, in the data file and in this lesson's
//     script that describes the course author's study is an approved sentence of reports/learn/excerpts_for_approval.md
//     (E7, with its "Revisions after review"), word for word; the citation is E7.14 (no title, DOI pending)
//   - text budget of every text element, links
// Usage (from the site folder):  node _tests/learn/test_cf7-cost-of-waiting.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ID = "cf7-cost-of-waiting";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const TL = require(L("components/timeline.js"));
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
  "cf7-timeline": () => TL.staticHTML(D.timeline.events),
  "cf7-idea": () => M.staticIdea(I),
  "cf7-bound": () => M.staticBoundary(D.boundary)
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

// ---------------- present value
const i = M.monthly(I);
ok(near(Math.pow(1 + i, 12), 1 + I.discountPerYear, 1e-12), "monthly rate compounds to the yearly 8%");
let s24 = 0; for (let t = 1; t <= 24; t++) s24 += 1 / Math.pow(1 + i, t);
ok(near(M.annuity(I, 24), s24, 1e-9) && M.annuity(I, 0) === 0, "annuity factor = the sum of discounted months (24 months: " + s24.toFixed(3) + ")");

// ---------------- the accounts
const L0 = M.ledgers(I, 0, 0, false);
ok(L0.developer === 0 && L0.ratepayers === 0 && L0.society === 0 && L0.dci === null, "no wait, no cost");
const base = M.ledgers(I, 24, 0, false), tar = M.ledgers(I, 24, 1, false), half = M.ledgers(I, 24, 0.5, false), br = M.ledgers(I, 24, 0, true);
ok(near(base.dev.margin, 4.5e6 * s24, 1) && near(base.dev.capital, 500e6 * i * s24, 1), "developer: $4.5M margin and the carrying cost of $500M each month, discounted");
ok(near(base.rate.strand, 0.12 * 60e6 / Math.pow(1 + i, 24), 1), "ratepayers: 12% chance after 24 months that the $60M of upgrades are stranded, discounted");
ok(M.musd(base.developer) === "$171.1M" && M.musd(base.ratepayers) === "$14.7M" && M.musd(base.society) === "$0.0M", "24 months, no tariff: $171.1M, $14.7M, $0.0M");
ok(near(tar.total, base.total, 1e-6) && near(half.total, base.total, 1e-6) && tar.ratepayers === 0 && near(tar.developer - base.developer, base.ratepayers, 1e-6), "a tariff moves cost between accounts; the total does not change");
ok(M.musd(tar.total) === "$185.8M" && M.musd(base.ratepayers) === "$14.7M", "the tariff moves $14.7M; the total stays $185.8M");
ok(br.developer < base.developer && br.society > 0 && near(br.ratepayers, base.ratepayers), "bridge power: lower developer cost, a social cost, ratepayers unchanged");
ok(M.musd(base.developer - br.developer) === "$25.6M" && M.musd(br.society) === "$8.1M", "bridge power saves the developer $25.6M and adds $8.1M of CO2 damage");
ok(near(br.co2t, 0.5 * 100 * 730 * 0.1 * 24, 1e-6), "bridge power: 50 MW x 730 h x 0.1 t/MWh x 24 months = " + br.co2t + " t of extra CO2");
for (let t = I.delays.step; t <= I.delays.max; t += I.delays.step) {
  const a = M.ledgers(I, t - I.delays.step, 0, false), b = M.ledgers(I, t, 0, false);
  ok(b.developer > a.developer && b.ratepayers > a.ratepayers, "each account grows with the wait (" + t + " months)");
}
ok(M.kusd(base.dci) === "$71.3k", "developer per MW-month at 24 months: $71.3k (got " + M.kusd(base.dci) + ")");
const short = M.ledgers(I, 18, 0, false);
ok(M.musd(base.developer - short.developer) === "$40.3M" && M.musd(short.developer) === "$130.8M", "24 to 18 months avoids $40.3M of the developer's cost ($171.1M − $130.8M): the most worth paying");
ok(M.musd(4.5e6) === "$4.5M" && M.annuity(I, 24).toFixed(2) === "22.17" && M.musd(base.dev.margin) === "$99.8M", "worked month: $4.5M a month × 22.17 = $99.8M");
ok(M.accountLines(br).length === 3 && /^Society: \$8\.1M \(CO₂ damage above grid power \$8\.1M\)$/.test(M.accountLines(br)[2]) && /^Developer: \$145\.5M \(lost margin/.test(M.accountLines(br)[0]),
  "the bars' text version names every account and its parts");
for (let t = 0; t <= I.delays.max; t += I.delays.step) I.tariffShares.forEach(s => [false, true].forEach(b => {
  const lines = M.statusLines(I, t, s, b);
  if (!(lines.length <= 3 && lines.every(x => text(x).split(" ").length <= 25))) ok(false, "status at " + t + " months, share " + s + ", bridge " + b + ": at most three lines of 25 words");
}));
ok(M.PARTS.filter(p => p.key === "co2")[0].label === "CO₂ damage above grid power", "the social part is named against its baseline (grid power, on time)");
ok(I.tariffShares.indexOf(I.startShare) >= 0 && I.delays.start % I.delays.step === 0, "start state inside the controls");

// ---------------- numbers on the page
const T = text(PAGE);
ok(/In the toy, 24 months">\$171\.1M</.test(PAGE) && /In the toy, 24 months">\$14\.7M</.test(PAGE) && /In the toy, 24 months">\$0\.0M</.test(PAGE) && I.delays.start === 24, "comparison table = the toy at 24 months");
ok(/moves \$14\.7M from other customers to the developer; the total stays \$185\.8M/.test(T), "myth 1 = the toy");
ok(/saves the developer \$25\.6M and adds \$8\.1M of CO₂ damage above grid power/.test(T), "myth 2 = the toy");
ok(/In the toy, 24 → 18 months avoids \$40\.3M \(\$171\.1M − \$130\.8M\)\./.test(T), "Go deeper: the avoided cost = the toy");
ok(/Worked month: the lost margin is \$45,000 × 100 MW = \$4\.5M a month\. Over 24 months, discounted month by month, that is \$4\.5M × 22\.17 = \$99\.8M today\./.test(T), "worked month on the page = the model");
ok(!/\bpublished\b[^.]{0,60}(NAPS|Li et al\. \(2026\))|(NAPS|Li et al\. \(2026\))[^.]{0,60}\bpublished\b/i.test(T + " " + RAW), "the NAPS paper is accepted and presented, never called published");
D.facts.forEach(fc => {
  const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
  ok(row >= 0 && (!fc.url || PAGE.slice(row, row + 700).indexOf(fc.url) >= 0) && PAGE.slice(row, row + 700).indexOf(fc.asof) >= 0, "numbers to remember: '" + fc.n + "' carries its source and date");
});
ok(/on the order of \$0\.7 billion in present value/.test(T) && /about 176 TWh in 2023, about 4\.4%/.test(T), "facts agree with the excerpt and the timeline");

// ---------------- scope: guard G-DC, no nuclear technology, no AI, approved sources only
const ALL = PAGE + "\n" + RAW + "\n" + JS;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear technology on the page, in the data or in the script");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere (the paper's published title is not quoted; see E7)");
ok(!/data[- ]cent\w*[^.]{0,80}\b(supply|supplies|supplied|power plant|build|generat)/i.test(text(PAGE)), "data centers appear as loads, never as builders or buyers of supply");
const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
ok(keys.length === 2 && keys.every(k => k === "excerpt:code"), "the only excerpt key is excerpt:code (findings, then limits)");
// the page's own links (the generated header, next box and footer are build_learn.py's and checked by the scope scan)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.every(h => h === "https://github.com/Henryutd2021/code-delayed-energization" || /^https:\/\/www\.energy\.gov\//.test(h) || /^[0-9a-z-]+\.html$/.test(h) || /^#/.test(h)),
  "links: energy.gov, the allow-listed repository and learn pages only");
ok(!/projects\/|research\.html/.test(PAGE), "no project page and no Research page");
ok(TL.validate(D.timeline.events).length === 0, "every timeline event has a valid date and a source");

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
const CF = { prefix: "cf7", sections: ["E7"], excerpts: 6, question: "E7.1", papers: 0 };
const APPROVED_SNAPSHOT = {   // excerpts_for_approval.md, E7 with the revisions after review, 2026-11-03
  "E7.1": "What does it cost when a large data center must wait for grid energization, and how does the delay affect the developer, electricity ratepayers and society?",
  "E7.2": "A late grid connection costs the developer lost margin and carrying costs; ratepayers face utility carrying and stranding costs; society bears external costs.",
  "E7.3": "The study keeps these present-value accounts separate.",
  "E7.4": "For a 300 MW-IT facility, a 36-month delay costs the developer on the order of $0.7 billion in present value.",
  "E7.5": "Staged energization can recover a large share of that cost.",
  "E7.6": "Ratepayer exposure depends strongly on large-load tariff design.",
  "E7.7": "The delay is treated as exogenous and parameters are illustrative; network feasibility is not modeled, and the social perspective is illustrated with a single bridge-power example.",
  "E7.8": "Holds when: the delay is given and the inputs are illustrative. Leaves out: why service is late.",
  "E7.9": "Inside: one large load waiting for its first grid service (the study's case: a 300 MW-IT data center), priced for three parties in present value. Left out: why the connection is late, whether the network can carry the load, and real project data: the parameters are illustrative.",
  "E7.10": "Decisions: whether to pay for a mitigation option (staged service or bridge power), and who funds it. Goal: price the wait for each party, so an option can be judged against what it saves each one. Rules: the three accounts stay separate; a net-benefit test says when they may be combined.",
  "E7.11": "A present-value framework turns the delayed computing capacity into the grid MW it needs and prices the delay in three ledgers. Two measures compare cases: a delay cost per MW-month, and the largest payment worth making to shorten the wait. Inputs are screened with Latin hypercube sampling.",
  "E7.12": "The delay is priced in three separate accounts: the developer, electricity ratepayers and society.",
  "E7.13": "Where the result holds: the delay is taken as given, not explained; the parameters are illustrative, so the study reports which inputs move the result, not a forecast; the three accounts stay separate, and a net-benefit test says when they may be added. It leaves out: why service is late: the interconnection process itself; whether the network can carry the load (network feasibility); social costs beyond a single bridge-power example.",
  "E7.14": "Li et al. (2026). Accepted paper on the cost of delayed energization for large loads, 2026 North American Power Symposium (NAPS), presented October 2026; DOI pending."
};
// names the study, its author, its case or its method: such an element is research text unless approved or listed below
const RX = /\b(stud(y|y's|ies)|paper|article|NAPS|Li et al|course author|excerpt|research|published|accepted|300 MW-IT|36-month|0\.7 billion|ledgers?|Latin hypercube|framework|exogenous|net-benefit test|staged (service|energization))\b/i;
const NOT_RESEARCH = [
  [/^\d · [A-Z][a-z ,]+$/, "part label"],
  [/^Question type: descriptive \(how much, and for whom\?\)\.$/, "course label (§11.2 question type)"],
  [/^(A large new load, such as a data center or a factory, is ready to run, but its grid service will not start for months\.|What does the wait cost, and who pays\?)$/, "the puzzle: a general idea; no study claim"],
  [/^Words first: energization is switching on grid service; the developer is the company building the facility; ratepayers are the utility's other customers\.$/, "general definitions"],
  [/^Approved excerpt of: Li et al\. \(2026\), accepted paper, 2026 North American Power Symposium \(NAPS\); DOI pending\.$/, "provenance label (E7.14's citation, short)"],
  [/^From the approved excerpt of Li et al\. \(2026\), NAPS 2026 \(accepted\)\.$/, "provenance label"],
  [/^Every result about the study is quoted from the approved excerpt of the accepted paper named in the sources; the two public events carry their own sources\.$/, "provenance label"],
  [/^The toy below uses illustrative round numbers\.$/, "provenance label (the toy)"],
  [/^Li et al\. \(2026\), (NAPS 2026 \(accepted\)( · presented October 2026; DOI pending)?|North American Power Symposium \(NAPS 2026\), accepted; DOI pending)$/, "citation label"],
  [/^presented October 2026; DOI pending$/, "citation label (date)"],
  [/^on the order of \$0\.7 billion$/, "number cell; the sentence beside it is E7.4"],
  [/^U\.S\. Department of Energy \(Berkeley Lab report\) · published 20 December 2024; data for 2023$/, "citation label (DOE, a public event)"],
  [/^(The question in time|Where the result holds)$/, "heading"],
  [/^Two public events, then the study and its code\.$/, "navigation"],
  [/^(Paper presented|Code released)$/, "timeline step label: the kind of output"],
  [/^Illustrative round numbers, not the study's inputs, equations or results\.$/, "provenance label (the toy)"],
  [/^code-delayed-energization: public example repository · MIT licence · illustrative inputs\.$/, "repository label"],
  [/^code-delayed-energization on GitHub, version 1\.0\.0 \(30 October 2026\)\.$/, "citation of the repository"],
  [/^code-delayed-energization on GitHub$/, "citation label (repository)"],
  [/^Run examples\/options\.py: compare staged service with full service, and read the net-benefit test for the bridge pathway\.$/, "repository exercise on its illustrative inputs, not the study"],
  [/^U\.S\. Department of Energy \(2024\)\. DOE Releases New Report Evaluating Increase in Electricity Demand from Data Centers\. 20 December 2024\.$/, "citation (DOE, a public event)"],
  [/^U\.S\. Secretary of Energy \(2025\)\. Letter to the Federal Energy Regulatory Commission on the interconnection of large loads \(PDF\)\. 23 October 2025\.$/, "citation (DOE, a public event)"]
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
strict("page, explainer no-JS steps", elements(cut(/<ol class="ex-fallback[\s\S]*?<\/ol>/, true)));
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
// citations: titles as in inputs/publications.bib
if (RP) {
  const bib = fs.readFileSync(path.join(RP, "inputs/publications.bib"), "utf8");
  const titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(m => m[1].replace(/[{}]/g, "").replace(/\\textbf/g, "").toLowerCase());
  const cites = SRC_LI.map(li => li.match(TITLED)).filter(Boolean);
  ok(cites.length === CF.papers, CF.papers + " Li et al. paper(s) with a title in the sources list (" + cites.length + ")");
  cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0 && /^https:\/\/doi\.org\//.test(c[2]), "sources: '" + c[3].slice(0, 50) + "' is the title in publications.bib, with its DOI"));
}

// ---------------- text budget: every text element of the page's own prose stays short (one idea, about 35 words)
const prose = elements(OWN.replace(GENERATED, " ").replace(/<table class="lx-facts">[\s\S]*?<\/table>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/^---[\s\S]*?\n---\n/, " "));
prose.forEach(s => { const w = s.split(" ").length; ok(w <= 40 || approved(s), "text element of " + w + " words (40 at most unless one approved sentence): " + s.slice(0, 70)); });

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
