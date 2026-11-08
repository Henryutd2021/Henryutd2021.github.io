// test_r02-literature.js — Node tests for research studio R2 (assets/learn/r02-literature.js and its two data files):
//   - the OpenAlex snapshot is complete and dated; the ladder's predicted directions follow its counts
//   - the routes (search, backward and forward snowballing) cover the twelve matrix papers as the page says
//   - the matrix coding: four rows to code, every cell with a reason, coded from abstracts only ("not stated" is never
//     "no"), the storage-by-extremes cell empty, the three papers of the direct search found by it; the papers the
//     closest one builds on are in the matrix
//   - the two by two's feedback names the cell tapped for any coding (the course's, a wrong one, none or several empty)
//   - every number in the exemplars and on the page comes from the snapshot; years in the names match OpenAlex
//   - the no-JS blocks (task, exemplars, rubric) equal what the model and the components write (--write rewrites them)
//   - text budget, links on the allow-list, no deny-listed words
// Usage (from the site folder):  node _tests/learn/test_r02-literature.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L("r02-literature.js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const D = JSON.parse(fs.readFileSync(L("data/r02-literature.json"), "utf8"));
const S = JSON.parse(fs.readFileSync(L("data/r02-literature-openalex.json"), "utf8"));
const QPATH = path.join(SITE, "learn/r02-literature.qmd");
const JS = fs.readFileSync(L("r02-literature.js"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// the page's own exemplars spec (lines: true), so the no-JS block keeps the live card's field breaks
function exSpec() { return M.exemplarsSpec(D); }
const BLOCKS = {
  "r02-task": () => M.staticTask(D, S),
  "r02-exemplars": () => EX.staticHTML(exSpec()),
  "r02-rubric": () => RB.staticHTML(D.rubric)
};
function between(text, key) {
  const a = text.match(new RegExp("<!-- " + key + ":start[^>]*-->\\n")), b = text.indexOf("<!-- " + key + ":end -->");
  return a && b > a.index ? { from: a.index + a[0].length, to: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); if (!r) throw new Error(k + " markers missing"); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("r02 fallback blocks written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");

// ---------------- the snapshot
ok(/^\d{4}-\d\d-\d\d$/.test(S.meta.as_of) && S.meta.as_of === D.meta.as_of, "snapshot and text share one date (" + S.meta.as_of + ")");
ok(S.ladder.length === 5 && S.ladder.every(r => r.count > 0 && /^https:\/\/api\.openalex\.org\/works\?filter=title_and_abstract\.search:/.test(r.url)), "five ladder strings with counts and repeatable API addresses");
ok(S.ladder.every(r => r.url === M.apiURL(r.query)) && S.targeted.url === M.apiURL(S.targeted.query), "each stored address is apiURL(query), so the page's own links repeat the same search");
D.ladder_q.forEach((q, i) => {
  const a = S.ladder[i], b = S.ladder[i + 1];
  ok(a.id === q.from && b.id === q.to, "ladder question " + (i + 1) + " joins " + q.from + " and " + q.to);
  ok((b.count > a.count) === (q.answer === "more"), "ladder question " + (i + 1) + ": " + a.count + " → " + b.count + " is '" + q.answer + "'");
});
ok(S.ladder[0].count === 344 && S.ladder[1].count === 649 && S.ladder[2].count === 2191 && S.ladder[3].count === 113 && S.ladder[4].count === 49 && S.targeted.count === 23,
  "the snapshot's counts (344, 649, 2,191, 113, 49; 23) are the ones the report and the exemplars use");
ok(S.matrix.length === 12 && S.fillers.length === 3 && S.top.length === 5, "twelve matrix papers, three from the direct search, five top hits");
ok(S.matrix.concat(S.fillers, S.top, [S.review]).every(p => p.doi && p.title && p.year && p.authors.length && p.cited_by >= 0 && /^W\d+$/.test(p.openalex)), "every paper has DOI, title, year, authors, citations and an OpenAlex id");
ok(!JSON.stringify(S).match(/abstract/i) || !S.matrix.some(p => p.abstract), "no abstracts are stored");

// ---------------- the studio text against the snapshot
ok(D.matrix.length === 12 && D.matrix.every((p, i) => p.doi === S.matrix[i].doi), "the twelve rows are the snapshot's twelve, in order");
D.matrix.forEach((p, i) => {
  const y = +(p.name.match(/\((\d{4})\)/) || [])[1], sp = S.matrix[i];
  ok(y === sp.year, p.name + ": year as OpenAlex lists it (" + sp.year + ")");
  const fam = sp.authors[0].split(" ").pop().replace(/[‐‑]/g, "-");
  ok(p.name.replace(/[‐‑]/g, "-").indexOf(fam) === 0, p.name + ": first author " + sp.authors[0]);
  ok(M.KEYS.every(k => ["yes", "not stated", "partly"].indexOf(p.ref[k]) >= 0 && p.why[k] && p.why[k].length > 10), p.name + ": every cell coded (yes, partly, not stated) with a reason");
  ok(M.KEYS.every(k => /abstract/i.test(p.why[k])), p.name + ": every reason is a claim about the abstract, no stronger");
});
D.fillers.forEach((f, i) => ok(f.doi === S.fillers[i].doi && +(f.name.match(/\((\d{4})\)/) || [])[1] === S.fillers[i].year, f.name + ": matches the snapshot"));
ok(S.found_by.targeted.length === 3 && D.fillers.every(f => S.found_by.targeted.indexOf(f.doi) >= 0), "the direct search finds all three papers that do both");
ok(D.matrix.filter(p => p.code).map(p => p.key).join() === "p02,p04,p10,p11", "the reader codes four rows: p02, p04, p10, p11");
ok(!/"(storage|extreme|full)": "no"/.test(JSON.stringify(D.matrix)) && D.matrix.find(p => p.key === "p02").ref.extreme === "not stated", "no cell says 'no' from an abstract; Kotzur et al. (2017)'s extremes are 'not stated' (the full paper may use them)");
ok(D.values && D.values["not stated"] && /not the same as no/.test(D.values["not stated"] + D.coding_rule), "the coding rule says 'not stated' is not 'no'");

// ---------------- routes
const R = M.routes(S);
ok(R.all.length === 12 && R.union.length === 12, "search plus snowballing find all twelve");
ok(R.search.length === 9 && R.backward.length === 9 && R.forward.length === 1, "string 4 finds 9, backward 9, forward 1");
ok(R.onlySnow.length === 3 && R.onlySearch.length === 2, "search alone misses 3; snowballing alone misses 2");
ok(S.found_by.storage.length === 2, "string 5 finds only 2 of the 12");
ok(S.snowball.references === 196 && S.snowball.cited_by === 229, "the review: 196 references, 229 citing works (as of the snapshot)");
ok(S.snowball.fillers_citing_review.indexOf(D.fillers[0].doi) >= 0, "the closest paper cites the review (forward snowballing would find it)");

// ---------------- the matrix and its empty cell
const ref = M.refMarks(D), c = M.cross(D, ref);
ok(c.yy.length === 0 && c.yn.join() === "p04,p06" && c.ny.join() === "p10,p11" && c.nn.length === 8, "storage × extremes: 0 both, 2 storage only, 2 extremes only, 8 neither");
ok(M.emptyCells(c).join() === "yy", "the only empty cell is storage linked and extremes kept");
// feedback from the selected cell and the counted coding
ok(M.cellFeedback(D, c, "yy").empty && /falls in “storage link and extremes both reported”/.test(M.cellFeedback(D, c, "yy").text), "course's coding: the empty cell's feedback names both");
ok(["yy", "yn", "ny", "nn"].every(k => !/without|\bno storage|\bnor\b/.test(M.cellPhrase(k))) && /reported, extremes not stated/.test(M.cellPhrase("yn")) && M.cellPhrase("nn") === "neither reported",
  "cell names say what the abstracts report or do not state, never a confirmed absence");
ok(!M.cellFeedback(D, c, "yn").empty && /Kotzur et al\. \(2018\); Tejada-Arango/.test(M.cellFeedback(D, c, "yn").text), "course's coding: a full cell lists its papers");
{ const m = JSON.parse(JSON.stringify(ref)); m.p04.extreme = true; m.p06.extreme = true;
  const x = M.cross(D, m), f = M.cellFeedback(D, x, "yn");
  ok(M.emptyCells(x).join() === "yn" && f.empty && /storage link reported, extremes not stated/.test(f.text) && !/both/.test(f.text), "a wrong coding (p04, p06 with extremes): the empty cell is storage-only, and its feedback says so, not 'both'");
  ok(!M.cellFeedback(D, x, "yy").empty && /2 papers here/.test(M.cellFeedback(D, x, "yy").text), "a wrong coding: the both cell now holds two papers, and says so");
  ok(!/both/.test(M.gapQuestion(D, "yn")) && /both/.test(M.gapQuestion(D, "yy")), "the follow-up question names the tapped cell");
  ok(M.differs(D, m).join() === "p04,p06" && M.differs(D, ref).length === 0, "rows that differ from the course's coding are found"); }
{ const m = JSON.parse(JSON.stringify(ref)); m.p04.extreme = true;
  ok(M.emptyCells(M.cross(D, m)).length === 0, "a coding with no empty cell: none is offered (the page asks to switch to the course's coding)"); }
{ const off = {}; D.matrix.forEach(p => { off[p.key] = {}; });
  const x = M.cross(D, off);
  ok(M.emptyCells(x).join() === "yy,yn,ny" && ["yy", "yn", "ny"].every(k => M.cellFeedback(D, x, k).empty && M.cellFeedback(D, x, k).text.indexOf(M.cellPhrase(k)) >= 0), "a coding with three empty cells: each one's feedback names its own cell"); }
const start = M.startMarks(D);
ok(D.matrix.every(p => M.KEYS.every(k => start[p.key][k] === (p.code ? false : p.ref[k] === "yes"))), "start: eight rows coded, the reader's four blank");
ok(M.PICK.join() === "p04,p11" && D.matrix.find(p => p.key === "p04").name === "Kotzur et al. (2018)" && D.matrix.find(p => p.key === "p11").name.indexOf("Teichgraeber, Küpper") === 0,
  "the closest paper builds on p04 (Kotzur et al. 2018b in its references) and p11 (Teichgraeber et al. 2021)");
ok(D.five_cs[0].options.some(o => o[0] === D.five_cs[0].answer) && D.gap_q.options.some(o => o[0] === D.gap_q.answer) && D.gap_q.answer === "test", "the quiz answers exist; the gap answer is 'search it first'");

// pick two: a tap toggles, at most two at a time; a check is explicit, with one retry
{ let p = M.pickToggle([], "p01").picks; p = M.pickToggle(p, "p02").picks;
  ok(M.pickToggle(p, "p04").full && M.pickToggle(p, "p04").picks.join() === "p01,p02", "a third pick waits: two at most");
  ok(M.pickToggle(p, "p01").picks.join() === "p02", "a second tap unpicks a paper (a mistaken choice can be corrected)");
  const w1 = M.pickCheck(p, 0);
  ok(w1.hit === 0 && w1.retry && !w1.done, "two wrong picks: no answer yet, a retry");
  p = M.pickToggle(M.pickToggle(p, "p01").picks, "p02").picks; p = M.pickToggle(M.pickToggle(p, "p04").picks, "p11").picks;
  const r = M.pickCheck(p, w1.tries);
  ok(p.join() === "p04,p11" && r.hit === 2 && r.done && !r.retry, "after unpicking the wrong two, the right two pass: never four selected at once");
  ok(M.pickCheck(["p01", "p04"], 1).done && !M.pickCheck(["p01", "p04"], 1).retry && M.pickCheck(["p04"], 0).ready === false, "a second wrong check shows the answer; one pick cannot be checked"); }

// ---------------- second database: syntax named per database, never assumed portable
ok(D.databases.map(d => d.name).join() === "OpenAlex,Semantic Scholar,Crossref", "the second-database table: OpenAlex, Semantic Scholar, Crossref");
ok(/AND, OR, NOT and quoted phrases/.test(D.databases[0].syntax) && /no AND, OR or NOT/.test(D.databases[1].syntax) && /Quoted phrases/.test(D.databases[1].syntax) && /No AND, OR or exact phrases/.test(D.databases[2].syntax),
  "OpenAlex takes the strings unchanged; Semantic Scholar takes quotes but no Boolean operators; Crossref takes neither");
ok(D.databases.slice(1).every(d => /checked 8 November 2026/.test(d.src)), "each syntax claim for another database is sourced and dated");
ok(/adapt them to a second database's syntax/.test(D.practice[0].task) && !/OpenAlex and one other open database/.test(JSON.stringify(D)), "the practice adapts the strings to the second database, rather than running them unchanged");
ok(/OpenAlex search", note: "an open index; takes AND, OR and quoted phrases"/.test(JS) && /Semantic Scholar takes quoted phrases but not AND or OR; Crossref takes neither/.test(JS) && !/note: "OpenAlex, Semantic Scholar, Crossref"/.test(JS),
  "the comparison table keeps OpenAlex's exact strings apart from the relevance-ranked searches");
ok(/Semantic Scholar<\/td><td>[^<]*takes quoted phrases but not AND, OR or NOT/.test(PAGE) && /Crossref<\/td><td>[^<]*takes no AND, OR or exact phrases/.test(PAGE), "the tools table says what each database's search takes");
ok(/your own statement also logs your second database/.test(D.exemplars.note), "the strong exemplar says what remains: the second database");

// ---------------- the coding step: the two ideas defined before the coding
{ const mi = M.matrixIntro(D);
  ok(mi.length === 3 && /\[\[storage-link\|/.test(mi[1]) && /\[\[extreme-period\|/.test(mi[1]) && /The rule: /.test(mi[2]), "the coding step: task, the two ideas defined, then the rule, as three elements");
  mi.forEach((t, i) => ok(M.plain(t).trim().split(/\s+/).length <= 35, "coding step element " + (i + 1) + ": at most 35 words (" + M.plain(t).trim().split(/\s+/).length + ")")); }
ok(/\[\[extreme-period\|extreme periods\]\]/.test(D.question) && /\[\[reanalysis\|/.test(JSON.stringify(D.sheet)) && /\[\[self-organizing-map\|/.test(JSON.stringify(D.matrix)), "first-use terms are marked: extreme periods, reanalysis, self-organizing maps");
ok(/Plan on representative days chosen from the input data; run operations over the full series; use those results to choose new periods/.test(D.sheet.find(x => x.k === "Method").v), "the extraction sheet's method has the second planning stage (section 3.1 of the preprint)");
ok(/where wind and solar supply 90% of generation/.test(D.matrix.find(p => p.key === "p12").summary), "the 90% share is a share of generation");

// ---------------- string builder
ok(M.queryString(D.blocks, { A: ["representative days"], B: ["capacity expansion"] }) === '"representative days" AND "capacity expansion"', "one term per block: quoted phrases joined by AND");
ok(M.queryString(D.blocks, { A: ["representative days", "clustering"], B: [] }) === '("representative days" OR clustering)', "a single word is not quoted; an empty block drops out");
const four = { A: ["representative days", "representative periods", "time series aggregation", "typical days"], B: ["capacity expansion", "generation expansion", "energy system model", "investment planning"] };
ok(M.knownCount(S, M.queryString(D.blocks, four)) === 113, "the builder's string for the ladder's eight terms gets the stored count, 113");
ok(M.knownCount(S, M.queryString(D.blocks, { A: ["clustering"], B: ["unit commitment"] })) === null, "an unknown string has no stored count");
ok(D.blocks.every(b => b.start.length >= 2 && b.start.every(t => b.terms.indexOf(t) >= 0)) || D.blocks.some(b => b.start.length < 2), "start terms are in the blocks");

// ---------------- exemplars: valid, and every number from the snapshot
const spec = exSpec();
ok(EX.validate(spec).length === 0, "exemplars are well formed: " + EX.validate(spec).join("; "));
const good = EX.plain(spec.answers[1]).replace(/ \[\d+\]/g, "");
ok(good.indexOf(M.dateText(S.meta.as_of)) >= 0, "strong answer: the snapshot date");
ok(/five logged strings/.test(good) && S.ladder.length === 5, "strong answer: five strings");
ok(/12 papers coded from their abstracts/.test(good) && D.matrix.length === 12, "strong answer: 12 papers, coded from abstracts");
ok(new RegExp("returned " + S.targeted.count + " works").test(good) && /at least three do both/.test(good) && S.fillers.length === 3, "strong answer: 23 works, three do both");
ok(/^Remaining question: /m.test(good) && /six-region test grid with demand and wind only, no solar/.test(good) && /demand and wind only, no solar/.test(D.five_cs.find(x => x.c === "Correctness").worked),
  "strong answer: a remaining question tied to the closest paper's second pass, whose facts are on the extraction sheet");
ok(/provisional/.test(JSON.stringify(D.exemplars.good)) && /Strong needs/.test(JSON.stringify(D.exemplars.good)), "strong answer: Proficient, and the note says why not Strong");
ok(/Hilbers et al\. 2023; Moradi-Sepahvand and Tindemans 2023, 2024/.test(good) && S.fillers.map(p => p.year).join() === "2023,2023,2024", "strong answer: the three papers and their years");
ok(D.exemplars.diff.some(d => d.good === "Searched directly: " + S.targeted.count + " works, at least " + S.fillers.length + " do both"), "difference table: 23 works, at least 3 do both");
const nums = (good.match(/\d[\d,]*/g) || []).map(s => +s.replace(/,/g, ""));
ok(nums.every(n => [3, 2026, 12, 23, 2023, 2024].indexOf(n) >= 0), "strong answer: no number without a source (" + nums.join(", ") + ")");
ok(D.ladder_q[0].q.indexOf("Two changes at once") === 0 && /cannot show what quoting alone does/.test(D.ladder_q[0].why) && /two changes at once/.test(JS) && D.ladder_labels.phrase.indexOf("two changes") >= 0,
  "the first ladder step is named as two changes, whose effects cannot be separated");

// ---------------- the page: fallbacks, date, links
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(r && PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + ": the page's no-JS block equals the model's (run with --write after a data edit)"); });
const task = M.staticTask(D, S);
ok(S.ladder.every(r => task.indexOf(M.f0(r.count)) >= 0) && task.indexOf(M.f0(S.targeted.count)) >= 0 && D.matrix.every(p => task.indexOf(p.doi) >= 0), "no-JS task: every count and every matrix DOI");
ok(/at least three do both, by their abstracts/.test(JS) && !/three do both:/.test(JS.replace(/at least three do both/g, "")), "step 7 says at least three: only the three abstracts were read");
ok(/3 November 2026/.test(PAGE) && M.dateText(S.meta.as_of) === "3 November 2026", "the data note dates the snapshot");
ok(!/return more|grow every day|counts grow|larger numbers/.test(PAGE + JS + JSON.stringify(D)) && /may change as OpenAlex updates/.test(PAGE) && /can change as OpenAlex updates/.test(JS), "counts 'may change', not 'grow' (a rerun can move them either way)");
ok(S.ladder.concat([S.targeted]).every(r => task.indexOf(M.web(r.url).replace(/&/g, "&amp;")) >= 0 && task.indexOf('href="' + r.url) < 0) && M.web(S.targeted.url) === M.searchURL(S.targeted.query) && /^https:\/\/openalex\.org\/works\?filter=/.test(M.web(S.snowball.forward_url)),
  "links open OpenAlex's own search page (the same filter as the stored API address)");
ok(!/q \? apiURL\(q\)|\(raw results\)/.test(JS) && /q \? searchURL\(q\)/.test(JS), "the live page links the search page, not raw API results");
["three passes", "First pass", "Second pass", "Third pass, optional", "the five Cs", "the extraction sheet", "Remaining", "Your own literature map", "Optional, beyond the 4 hours"].forEach(k => ok(task.indexOf(k) >= 0 || (k === "three passes" && task.indexOf("Reading the closest paper") >= 0) || (k === "Remaining" && task.indexOf("the question that remains") >= 0), "no-JS task: " + k));
ok(D.five_cs.every(x => task.indexOf(M.rich(x.worked)) >= 0) && D.sheet.every(x => task.indexOf(M.rich(x.v)) >= 0) && D.practice.every(x => task.indexOf(x.task.replace(/&/g, "&amp;")) >= 0), "no-JS task: every worked C, every sheet line, every practice task");
ok(!/\[\[/.test(task), "no-JS task: glossary marks become term spans");
ok(/second-pass extraction sheet/.test(PAGE) && /outside this studio's 4 hours/.test(D.passes[2].time), "task and passes agree: a second pass is required, the third is optional and outside the 4 hours");
ok(/About 30 minutes guided here, then about 4 hours/.test(PAGE) && D.practice.reduce((s, p) => s + p.min, 0) === 240, "practice plan adds up to 240 minutes (4 hours), as path.yml says");
const brief = PAGE.indexOf('<div class="lx-card lx-studio-brief">'), inter = PAGE.indexOf('<div class="lx-interactive');
ok(brief >= 0 && brief < inter && /<b>Produce:<\/b>[\s\S]*<b>From:<\/b>[\s\S]*<b>Done when:<\/b>[\s\S]*About 30 minutes guided here/.test(PAGE.slice(brief, inter)) && !/<b>Produce:<\/b>/.test(task),
  "the task card (produce, from, done when, time) sits above the interactive, outside its fallback, so readers with JavaScript see it");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = (OWN + task + JSON.stringify(D) + JSON.stringify(S)).match(/https?:\/\/[^\s"'<>)]+/g) || [];
const allowed = /^https:\/\/((api|help)\.)?openalex\.org\/|^https:\/\/doi\.org\//;
ok(hrefs.every(u => allowed.test(u)), "every URL is openalex.org or doi.org: " + hrefs.filter(u => !allowed.test(u)).slice(0, 3).join(" "));
const text = JSON.stringify(D) + JSON.stringify(S) + JS;
ok(!/\bAI\b|artificial intelligence|learning[- ](curve|rate)|\bFOAK\b|nuclear|reactor|\bSMR\b/i.test(text), "no deny-listed or out-of-scope words in the data or the script");

// ---------------- text budget
{ const r = between(PAGE, "r02-exemplars"), blk = r ? PAGE.slice(r.from, r.to) : "";
  ok(/<p class="lx-ex-lines">/.test(blk) && /<b>Matrix:<\/b>/.test(blk), "no-JS exemplars keep the live card's field lines and bold labels"); }
ok(/Its headings \(open preprint, October 2022\), for the first pass:<\/p><ul><li>1\. Introduction/.test(task) && /for your first pass:" \}, act\);\n      var hl = H\("ul"/.test(JS), "the headings are a short list, on the page and in the no-JS block");
const words = s => M.plain(s).trim().split(/\s+/).length;
const strip = h => h.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, "x");
EX.plain(spec.answers[1]).replace(/ \[\d+\]/g, "").split("\n").forEach((l, i) => ok(words(l) <= 35, "strong answer line " + (i + 1) + ": at most 35 words (" + words(l) + ")"));
spec.answers.forEach(a => EX.marks(a).forEach(m => ok(words(m.note) <= 30, a.key + " note " + m.n + ": at most 30 words (" + words(m.note) + ")")));
D.ladder_q.forEach((q, i) => ok(words(q.why) <= 35 && words(q.q) <= 35, "ladder question " + (i + 1) + ": question and reason at most 35 words"));
Object.keys(D.gap_q.feedback).forEach(k => ok(words(D.gap_q.feedback[k]) <= 35, "gap feedback " + k + ": at most 35 words"));
D.practice.forEach(p => ok(words(p.task) <= 30, "practice task: at most 30 words (" + words(p.task) + ")"));
ok(words(D.coding_rule) <= 35 && words(D.write_prompt) <= 40, "coding rule and writing prompt within budget");
{ const dn = (PAGE.match(/<p class="lx-datanote">[\s\S]*?<\/p>/) || [""])[0].split(/<br>/).map(strip);
  ok(dn.length >= 3, "data note in labelled rows");
  dn.forEach((r, i) => ok(words(r) <= 35, "data note row " + (i + 1) + ": at most 35 words (" + words(r) + ")"));
  const deep = (PAGE.match(/<div class="lx-deeper-body">[\s\S]*?<\/div>\n<\/details>/g) || []).join("").replace(/<table[\s\S]*?<\/table>/g, "");
  const bits = (deep.match(/<(p|li)>[\s\S]*?<\/\1>/g) || []).map(strip);
  ok(bits.length >= 10, "Go deeper boxes in short paragraphs and list items (" + bits.length + ")");
  bits.forEach(b => ok(words(b) <= 35, "Go deeper element at most 35 words (" + words(b) + "): " + b.slice(0, 40))); }
D.matrix.concat(D.fillers).forEach(p => ok(words(p.summary) <= 32, p.name + ": summary at most 32 words (" + words(p.summary) + ")"));
const stepTexts = (JS.match(/\{ text: "([^"]+)", build/g) || []).map(s => s.slice(9, -8));
ok(stepTexts.length === 9, "nine step cards");
stepTexts.forEach((t, i) => ok(words(t.replace(/\[\[[a-z-]+\|([^\]]+)\]\]/g, "$1")) <= 35, "step " + (i + 1) + ": at most 35 words (" + words(t) + ")"));

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
