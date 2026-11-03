// test_r01-framing.js — Node tests for research studio R1 (assets/learn/r01-framing.js, assets/learn/data/r01-framing.json,
// learn/r01-framing.qmd):
//   - the twenty questions: ten researchable (two of each type), four too vague, three already answered, three not
//     answerable with the data at hand; both rounds hold every bin; every researchable question has a type and a reason
//   - grading and "place the rest for me" keep the reader's own placements
//   - a rewrite is done only when all five parts are written (opening the example completes nothing); its feedback comes
//     in separate pieces (progress, guidance, what is next)
//   - the question card keeps one card per rewrite: switching between incomplete rewrites never carries a part of one
//     question onto another, and switching back restores what the reader added
//   - the two numbers quoted on the page agree with their sources (EIA 2025 use; the 2025 wind capacity factor in
//     cf_targets.json) and appear in the sources table with the same links
//   - the exemplars are well formed (LX.Exemplars' validate), the strong card has every rigour part, and the rubric uses the
//     course's competence ids
//   - the three no-JS blocks on the page equal the generated ones (write them with --write after a data edit)
//   - text budget (step cards, feedback, every text element of the page and of its no-JS blocks: at most 35 words and
//     two sentences), method neutrality, the narrow promise, and the scope deny-list on the data, script and page
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

// ---------------- a rewrite's completion and feedback
const fb3 = M.rewriteFeedback(3, true, false), fb5 = M.rewriteFeedback(5, false, true), fb0 = M.rewriteFeedback(0, false, false);
ok(fb0.saw === null && fb0.progress === "0 of 5 parts written.", "rewrite: nothing written, nothing said beyond the count");
ok(fb3.bad && /Write all five parts/.test(fb3.saw) && fb3.next === null, "rewrite: the example opened with 3 of 5 parts does not complete it");
ok(!fb5.bad && /^All five parts written/.test(fb5.saw) && /self-check/.test(fb5.next) && fb5.saw.indexOf("self-check") < 0, "rewrite: five parts complete it; progress, guidance and the next step are separate pieces");
ok(M.rewriteFeedback(5, true, false).next === null, "rewrite: only the last rewrite names the next step");
const JSRW = JS.slice(JS.indexOf("function rewriteStep"), JS.indexOf("function exemplars"));
ok(/if \(n === 5\) api\.done\(\)/.test(JSRW) && (JSRW.match(/api\.done\(\)/g) || []).length === 1, "rewrite: api.done() only when all five parts are written, never from the example button");
[0, 1, 2, 3, 4, 5].forEach(n => [true, false].forEach(o => [true, false].forEach(l => {
  const f = M.rewriteFeedback(n, o, l);
  [f.progress, f.saw, f.next].filter(Boolean).forEach(t => ok(M.words(t) <= 25, "rewrite feedback piece within 25 words: " + t));
})));

// ---------------- one card per rewrite (switching never mixes two questions)
const rwA = { question: "Did the co-op's array lower bills?", audience: "the board", metric: "average bill", units: "$ a year", counterfactual: "wholesale purchase" };
const rwB = { question: "Would a heat pump cost less?", audience: "homeowners", metric: "15-year cost", units: "", counterfactual: "" };
let sw = M.switchCard({}, null, {}, "rw1", rwA);
ok(sw.from === "rw1" && sw.card.question === rwA.question && sw.card.type === "" && sw.card.boundary === "", "card: rewrite 1 on a fresh card");
const card1 = Object.assign({}, sw.card, { type: "evaluative", scale: "S1", boundary: "members, 2022-2025", wrong: "bills did not fall", uncertainty: "prices" });
sw = M.switchCard(sw.cards, sw.from, card1, "rw2", rwB);
ok(sw.from === "rw2" && sw.card.question === rwB.question && sw.card.audience === "homeowners", "card: switching to rewrite 2 puts rewrite 2's parts on the card");
ok(["type", "scale", "boundary", "wrong", "uncertainty", "units", "counterfactual"].every(k => sw.card[k] === ""), "card: nothing of rewrite 1 (type, scale, boundary, falsification, uncertainty) stays on rewrite 2's card, and its blank parts stay blank");
sw = M.switchCard(sw.cards, sw.from, Object.assign({}, sw.card, { type: "predictive" }), "rw1", rwA);
ok(sw.card.boundary === "members, 2022-2025" && sw.card.type === "evaluative" && sw.card.question === rwA.question, "card: switching back to rewrite 1 restores what the reader added to it");
ok(sw.cards.rw2.type === "predictive", "card: rewrite 2's card is kept too");
sw = M.switchCard({}, null, { question: "My own question?", type: "descriptive" }, "rw1", rwA);
ok(sw.cards.own.question === "My own question?" && M.switchCard(sw.cards, sw.from, sw.card, "own", null).card.question === "My own question?", "card: a card typed by hand is kept and can be brought back");

// ---------------- numbers and sources
const q03 = Q.find(q => q.id === "q03"), q15 = Q.find(q => q.id === "q15");
ok(/4\.20 trillion kWh/.test(q03.why) && D.sources["eia-use"].number === "4.20 trillion kWh", "q03: 4.20 trillion kWh (EIA, data for 2025)");
ok((CF.targets.wind.cf * 100).toFixed(1) + "%" === "33.8%" && /33\.8%/.test(q15.why) && D.sources["eia-cf"].number === "33.8%", "q15: 33.8% = cf_targets.json wind capacity factor for 2025");
ok(D.sources["eia-cf"].url === CF.source.url, "q15's source is cf_targets.json's EIA table");
Object.keys(D.sources).forEach(k => {
  const s = D.sources[k];
  ok(PAGE.indexOf('<td class="n">' + s.number + "</td>") >= 0 && PAGE.indexOf('href="' + s.url + '"') >= 0, "sources table lists " + s.number + " with its link");
  ok(/checked \d+ \w+ \d{4}$/.test(s.as_of) && PAGE.indexOf(s.as_of) >= 0, "sources table shows the data year and the date it was checked: " + s.as_of);
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
const sawTexts = [...JS.matchAll(/return "(You (?:placed|typed)[^\n]+?)"; \}/g)].map(m => m[1].replace(/" \+ g\.\w+ \+ "/g, "8"));
ok(sawTexts.length === 3 && sawTexts.every(t => M.words(t) <= 35), "the three sort feedback lines, each at most 35 words");
// every text element the page shows, with JavaScript off (the page's own text and its no-JS blocks): at most 35 words and
// two sentences; an answer written as a card (one field per line) is checked line by line; references are left out
const sentences = t => (t.replace(/\b(U\.S\.|e\.g\.|i\.e\.)/g, "x").match(/[.!?](\s|$)/g) || []).length;
const VIS = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "");
const long = [];
for (const m of VIS.matchAll(/<(li|p|td|th|caption|summary|dd)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
  const parts = /lx-ex-lines/.test(m[2]) ? m[3].split("\n") : [m[3]];
  parts.forEach(x => { const t = x.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, "x").replace(/\s+/g, " ").trim(); if (t && (words(t) > 35 || sentences(t) > 2)) long.push(t.slice(0, 60)); });
}
ok(long.length === 0, "every visible text element of the page is at most 35 words and two sentences: " + long.join(" | "));
D.exemplars.answers.forEach(a => EX.marks(a).forEach(m => ok(words(m.note) <= 30, "exemplar note within budget: " + m.note)));
ok(/Optimization is often used for prescriptive questions, alongside decision analysis and multi-criteria methods; it also supports other analyses/.test(JS) && !/answers only one type/.test(JS), "method neutrality: optimization is often used for prescriptive questions, alongside other methods, and supports other analyses too");
ok(!/\bfair\b/.test(JSON.stringify(D.exemplars)) && /same payer/.test(JSON.stringify(D.exemplars)) && /matched on income and housing type/.test(JSON.stringify(D.exemplars)), "strong exemplar: same budget, payer and years, with comparability stated, not a claim of fairness");
ok(D.exemplars.diff.every(d => !/Those (who decide|affected)/.test(d.weak + d.good)), "exemplar audience: a broad group against a specific audience and its use, not affected against deciding");
ok(/is enough for this task/.test(D.bins.find(b => b.id === "answered").sub) && /replicating a published number is research/.test(PAGE), "already answered: a lookup is enough for this task; replication is research with its own purpose");
const q16 = Q.find(q => q.id === "q16"), rw3 = D.rewrites.find(r => r.id === "rw3").example;
ok(/\(MW\)/.test(q16.text), "the peak-demand question states its unit (MW)");
ok(/customer-hours/.test(rw3.metric) && /customer-hours per \$1 million/.test(rw3.units) && /one customer-hour/.test(rw3.units), "rewrite 3: customer-hours avoided per $1 million, defined");
ok(!/net present cost/.test(JSON.stringify(D)) && /\[\[present-value\|present value\]\]/.test(D.rewrites[1].example.metric), "rewrite 2: plain words with a glossary mark, not 'net present cost'");
["co-op", "time-of-use-tariff", "feeder", "substation", "wholesale-price"].forEach(id => ok(JSON.stringify(D).indexOf("[[" + id + "|") >= 0, "glossary mark at first use in the data: " + id));
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
