// test_r02-literature.js — Node tests for research studio R2 (assets/learn/r02-literature.js and its two data files):
//   - the OpenAlex snapshot is complete and dated; the ladder's predicted directions follow its counts
//   - the routes (search, backward and forward snowballing) cover the twelve matrix papers as the page says
//   - the matrix coding: four rows to code, every cell with a reason, the storage-by-extremes cell empty, the three
//     papers of the direct search found by it; the papers the closest one builds on are in the matrix
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

function exSpec() {
  const E = D.exemplars;
  return { answers: [{ key: "weak", label: "Weak answer", level: "Developing", parts: E.weak }, { key: "good", label: "Strong answer", level: "Proficient", parts: E.good }], diff: E.diff };
}
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
  ok(M.KEYS.every(k => ["yes", "no", "partly"].indexOf(p.ref[k]) >= 0 && p.why[k] && p.why[k].length > 10), p.name + ": every cell coded with a reason");
});
D.fillers.forEach((f, i) => ok(f.doi === S.fillers[i].doi && +(f.name.match(/\((\d{4})\)/) || [])[1] === S.fillers[i].year, f.name + ": matches the snapshot"));
ok(S.found_by.targeted.length === 3 && D.fillers.every(f => S.found_by.targeted.indexOf(f.doi) >= 0), "the direct search finds all three papers that do both");
ok(D.matrix.filter(p => p.code).map(p => p.key).join() === "p02,p04,p10,p11", "the reader codes four rows: p02, p04, p10, p11");

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
const start = M.startMarks(D);
ok(D.matrix.every(p => M.KEYS.every(k => start[p.key][k] === (p.code ? false : p.ref[k] === "yes"))), "start: eight rows coded, the reader's four blank");
ok(/want = \["p04", "p11"\]/.test(JS) && D.matrix.find(p => p.key === "p04").name === "Kotzur et al. (2018)" && D.matrix.find(p => p.key === "p11").name.indexOf("Teichgraeber, Küpper") === 0,
  "the closest paper builds on p04 (Kotzur et al. 2018b in its references) and p11 (Teichgraeber et al. 2021)");
ok(D.five_cs[0].options.some(o => o[0] === D.five_cs[0].answer) && D.gap_q.options.some(o => o[0] === D.gap_q.answer) && D.gap_q.answer === "test", "the quiz answers exist; the gap answer is 'search it first'");

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
ok(/concept matrix of 12 papers/.test(good) && D.matrix.length === 12, "strong answer: 12 papers");
ok(new RegExp("returned " + S.targeted.count + " works").test(good) && /at least three of which do both/.test(good) && S.fillers.length === 3, "strong answer: 23 works, three do both");
ok(/Hilbers et al\. 2023; Moradi-Sepahvand and Tindemans 2023, 2024/.test(good) && S.fillers.map(p => p.year).join() === "2023,2023,2024", "strong answer: the three papers and their years");
ok(D.exemplars.diff.some(d => d.good === "Searched directly: " + S.targeted.count + " works, at least " + S.fillers.length + " do both"), "difference table: 23 works, at least 3 do both");
const nums = (good.match(/\d[\d,]*/g) || []).map(s => +s.replace(/,/g, ""));
ok(nums.every(n => [3, 2026, 12, 23, 2023, 2024].indexOf(n) >= 0), "strong answer: no number without a source (" + nums.join(", ") + ")");

// ---------------- the page: fallbacks, date, links
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(r && PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + ": the page's no-JS block equals the model's (run with --write after a data edit)"); });
const task = M.staticTask(D, S);
ok(S.ladder.every(r => task.indexOf(M.f0(r.count)) >= 0) && task.indexOf(M.f0(S.targeted.count)) >= 0 && D.matrix.every(p => task.indexOf(p.doi) >= 0), "no-JS task: every count and every matrix DOI");
ok(/3 November 2026/.test(PAGE) && M.dateText(S.meta.as_of) === "3 November 2026", "the data note dates the snapshot");
ok(/About 30 minutes guided here, then about 4 hours/.test(task) && D.practice.reduce((s, p) => s + p.min, 0) === 240, "practice plan adds up to 240 minutes (4 hours), as path.yml says");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = (OWN + task + JSON.stringify(D) + JSON.stringify(S)).match(/https?:\/\/[^\s"'<>)]+/g) || [];
const allowed = /^https:\/\/((api|help)\.)?openalex\.org\/|^https:\/\/doi\.org\//;
ok(hrefs.every(u => allowed.test(u)), "every URL is openalex.org or doi.org: " + hrefs.filter(u => !allowed.test(u)).slice(0, 3).join(" "));
const text = JSON.stringify(D) + JSON.stringify(S) + JS;
ok(!/\bAI\b|artificial intelligence|learning[- ](curve|rate)|\bFOAK\b|nuclear|reactor|\bSMR\b/i.test(text), "no deny-listed or out-of-scope words in the data or the script");

// ---------------- text budget
const words = s => s.trim().split(/\s+/).length;
D.matrix.concat(D.fillers).forEach(p => ok(words(p.summary) <= 32, p.name + ": summary at most 32 words (" + words(p.summary) + ")"));
const stepTexts = (JS.match(/\{ text: "([^"]+)", build/g) || []).map(s => s.slice(9, -8));
ok(stepTexts.length === 9, "nine step cards");
stepTexts.forEach((t, i) => ok(words(t.replace(/\[\[[a-z-]+\|([^\]]+)\]\]/g, "$1")) <= 35, "step " + (i + 1) + ": at most 35 words (" + words(t) + ")"));

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
