// test_r01-framing.js — Node tests for research studio R1 (assets/learn/r01-framing.js, assets/learn/data/r01-framing.json,
// learn/r01-framing.qmd):
//   - the twenty questions: ten researchable (two of each type), four too vague, three already answered, three not
//     answerable with the data at hand; both rounds hold every bin; every researchable question has a type and a reason
//   - grading and "place the rest for me" keep the reader's own placements
//   - the two numbers quoted on the page agree with their sources (EIA 2025 use; the 2025 wind capacity factor in
//     cf_targets.json) and appear in the sources table with the same links
//   - the exemplars are well formed (LX.Exemplars' validate), the strong card has every rigour part, and the rubric uses the
//     course's competence ids
//   - the three no-JS blocks on the page equal the generated ones (write them with --write after a data edit)
//   - text budget, method neutrality, the narrow promise, and the scope deny-list on the data, script and page
// Usage (from the site folder):  node _tests/learn/test_r01-framing.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L("r01-framing.js"));
const QC = require(L("components/questioncard.js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const D = JSON.parse(fs.readFileSync(L("data/r01-framing.json"), "utf8"));
const CF = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const QPATH = path.join(SITE, "learn/r01-framing.qmd");
const BLOCKS = M.staticBlocks(D, { types: QC.TYPES, exemplars: EX.staticHTML, rubric: RB.staticHTML });
const MARK = { task: "r01-task", exemplars: "r01-exemplars", rubric: "r01-rubric" };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  return a && b >= a.index ? { a: a.index + a[0].length, b: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(MARK).forEach(k => { const r = between(q, MARK[k]); if (!r) throw new Error(MARK[k] + " markers missing"); q = q.slice(0, r.a) + BLOCKS[k] + "\n" + q.slice(r.b); });
  fs.writeFileSync(QPATH, q);
  console.log("r01 no-JS blocks written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(L("r01-framing.js"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const count = (arr, f) => arr.filter(f).length;

// ---------------- the questions
ok(M.check(D).length === 0, "data checks pass: " + M.check(D).join("; "));
const Q = D.questions;
ok(Q.length === 20, "twenty questions");
ok(count(Q, q => q.bin === "research") === 10 && count(Q, q => q.bin === "vague") === 4 && count(Q, q => q.bin === "answered") === 3 && count(Q, q => q.bin === "nodata") === 3, "bins: 10 researchable, 4 too vague, 3 already answered, 3 not answerable with the data at hand");
[1, 2].forEach(r => { const R = Q.filter(q => q.round === r); ok(R.length === 10 && D.bins.every(b => R.some(q => q.bin === b.id)), "round " + r + ": ten questions, every bin present"); });
M.TYPE_IDS.forEach(t => ok(count(Q, q => q.type === t) === 2, "two researchable questions of type " + t));
ok(JSON.stringify(M.TYPE_IDS) === JSON.stringify(QC.TYPES.map(t => t.id)), "the five types are the question card's (§11.2)");
ok(Q.filter(q => q.bin === "research").every(q => q.typeWhy && q.typeWhy.toLowerCase().indexOf(q.type) === 0), "every type reason starts with its type");
ok(Q.filter(q => q.bin === "nodata").every(q => /^Using /.test(q.text)), "every 'not answerable' question names the data at hand");
ok(M.cards(D, "types").length === 10 && M.cards(D, "types").every(c => M.TYPE_IDS.indexOf(c.bin) >= 0), "the type sort has the ten researchable questions");

// ---------------- grading and the shortcut
const c1 = M.cards(D, 1), mine = { q01: "vague", q02: "vague" };
const filled = M.fillRest(c1, mine);
ok(filled.q01 === "vague" && filled.q02 === "vague" && c1.every(c => filled[c.id]), "place the rest: the reader's placements stay (even a wrong one), only empty ones are filled");
const g = M.grade(c1, filled);
ok(g.placed === 10 && g.right === 9 && g.total === 10, "grade: 9 of 10 right after one wrong placement");
ok(M.grade(c1, {}).placed === 0, "grade: nothing placed");
ok(M.filled({ question: "Did it?", audience: " ", metric: "x", units: "", counterfactual: "y" }) === 3, "rewrite parts: blanks do not count");

// ---------------- numbers and sources
const q03 = Q.find(q => q.id === "q03"), q15 = Q.find(q => q.id === "q15");
ok(/4\.20 trillion kWh/.test(q03.why) && D.sources["eia-use"].number === "4.20 trillion kWh", "q03: 4.20 trillion kWh (EIA, data for 2025)");
ok((CF.targets.wind.cf * 100).toFixed(1) + "%" === "33.8%" && /33\.8%/.test(q15.why) && D.sources["eia-cf"].number === "33.8%", "q15: 33.8% = cf_targets.json wind capacity factor for 2025");
ok(D.sources["eia-cf"].url === CF.source.url, "q15's source is cf_targets.json's EIA table");
Object.keys(D.sources).forEach(k => {
  const s = D.sources[k];
  ok(PAGE.indexOf('<td class="n">' + s.number + "</td>") >= 0 && PAGE.indexOf('href="' + s.url + '"') >= 0, "sources table lists " + s.number + " with its link");
});
const nums = JSON.stringify(D).match(/\d[\d,.]*\s?%|\d[\d,.]* (trillion|million|kWh|MW|GW)/g) || [];
ok(nums.every(n => /4\.20 trillion|33\.8%|% of|1 million/.test(n)), "no other sourced-looking numbers in the data: " + nums.join(", "));

// ---------------- exemplars and rubric
ok(EX.validate(D.exemplars).length === 0, "exemplars are well formed: " + EX.validate(D.exemplars).join("; "));
const good = EX.plain(D.exemplars.answers.find(a => a.key === "good"));
["Question:", "Type:", "Audience:", "Metric:", "Compared with:", "Scale and boundary:", "I would be wrong if:", "Main uncertainty:"].forEach(k => ok(good.indexOf(k) >= 0, "strong card has " + k));
ok(/left out/.test(good), "strong card says what its boundary leaves out");
ok(D.exemplars.answers.map(a => a.level).join() === "Developing,Proficient", "levels: Developing and Proficient (the strong card does not claim Strong: it does not say why the question matters)");
ok(D.rubric.competences.every(c => RB.COMPETENCES.some(x => x.id === c.id)) && D.rubric.competences.map(c => c.id).join() === "framing", "rubric: R1 builds framing, with the course's competence id");
ok(/not a certificate/.test(D.rubric.note), "the narrow promise: a studio is practice, not a certificate (§3.1)");

// ---------------- page blocks
Object.keys(MARK).forEach(k => {
  const r = between(PAGE, MARK[k]);
  ok(r && PAGE.slice(r.a, r.b) === BLOCKS[k] + "\n", "no-JS block " + MARK[k] + " equals the generated one (run with --write after a data edit)");
});
ok(/<b>Produce:<\/b>/.test(PAGE) && /<b>From:<\/b>/.test(PAGE) && /<b>Done when:<\/b>/.test(PAGE), "the task card: produce, from, done when");
ok(PAGE.indexOf('class="lx-card lx-studio-brief"') >= 0 && PAGE.indexOf('class="lx-card lx-studio-brief"') < PAGE.indexOf('data-learn="r01-framing"'), "the task card sits outside the interactive, so it stays visible with JavaScript on");
ok(/About 30 minutes guided here, then about an hour on your own/.test(PAGE), "guided and practice time stated (30 + 60 min, as path.yml)");

// ---------------- text budget, neutrality, scope
const words = s => String(s).trim().split(/\s+/).length;
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n?\s*build/g)].map(m => m[1]);
ok(stepTexts.length === 6 && stepTexts.every(t => words(t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1")) <= 35), "six step cards, each at most 35 words");
D.exemplars.answers.forEach(a => EX.marks(a).forEach(m => ok(words(m.note) <= 30, "exemplar note within budget: " + m.note)));
ok(/Optimization answers only one type, prescriptive, and it is not the only way/.test(JS), "method neutrality: the type step says optimization is one way for one type");
const DENY = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
  /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/i, /artificial intelligence/i,
  /nuclear|reactor|\bSMR\b|small modular/i, /\bClaude\b|ChatGPT|language model/i];
// the page's own text: comments and the generated learn:* blocks (prerequisite titles from path.yml) left out
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
const texts = [JSON.stringify(D), JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), OWN];
DENY.forEach(re => ok(texts.every(t => !re.test(t)), "scope: nothing matches " + re));
ok(!/data[- ]cent/i.test(JSON.stringify(D) + OWN), "no data centers on this page");
ok(!/novel|\bhot\b|untouched|nobody has studied/i.test(JSON.stringify(D)) || /Novelty can be a new question/.test(PAGE), "no originality claims in the data");

console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (test_r01-framing)");
process.exit(fails ? 1 : 0);
