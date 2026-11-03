// test_r10-question-studio.js — Node tests for research studio R10, the question studio (assets/learn/r10-question-studio.js,
// its data file and learn/r10-question-studio.qmd):
//   - the pickers are exactly curriculum v2 §11.3's lists (scale, the ten threads, the 23 system elements, the 8 levers, the
//     16 stakeholders, the 12 twists), in order; checked against the curriculum itself when it is reachable
//     (LEARN_CURRICULUM=<path>, or ../reports/learn/curriculum_v2.md from the site folder), else against the copy below
//   - blocked combinations (§11.3, §20): no picker text, phrase, search term or draft template names nuclear technology, so
//     no combination can meet the nuclear-plus-risk rule; every draft built from every value of every slot, and a seeded
//     random sample of 200,000 full combinations in all five types, passes the §20.4 deny-list; data centers enter every
//     draft as a load
//   - no originality judgement: no data string calls anything new, hot, a gap or untouched; the crowding counts are §11.3's
//     table, shown as context with their caveat
//   - search strings: at most five Boolean operators for every element, dimension, stakeholder and twist or lever; the
//     OpenAlex link form; the road-less-travelled weights favour smaller clusters and never exclude an element
//   - the card's automatic fields keep the learner's edits; realism states; the copied summary; the seven example cards
//     are §11.3's, word for word
//   - the no-JS blocks on the page equal the generated ones (write them with --write after a data edit); text budget
// Usage (from the site folder):  node _tests/learn/test_r10-question-studio.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L("r10-question-studio.js"));
const QC = require(L("components/questioncard.js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const D = JSON.parse(fs.readFileSync(L("data/r10-question-studio.json"), "utf8"));
const P = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
const QPATH = path.join(SITE, "learn/r10-question-studio.qmd");
const BLOCKS = M.staticBlocks(D, { types: QC.TYPES, exemplars: EX.staticHTML, rubric: RB.staticHTML });
const MARK = { task: "r10-task", exemplars: "r10-exemplars", rubric: "r10-rubric", crowding: "r10-crowding" };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  return a && b >= a.index ? { a: a.index + a[0].length, b: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(MARK).forEach(k => { const r = between(q, MARK[k]); if (!r) throw new Error(MARK[k] + " markers missing"); q = q.slice(0, r.a) + BLOCKS[k] + "\n" + q.slice(r.b); });
  fs.writeFileSync(QPATH, q);
  console.log("r10 no-JS blocks written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(L("r10-question-studio.js"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const labels = k => D.pickers[k].map(x => x.label);

// ---------------- the pickers, exactly §11.3 (a copy; compared with the curriculum below when it is reachable)
const REF = {
  scale: ["S0 device and plant", "S1 microgrid and community", "S2 regional grid", "S3 city and region", "S4 nation"],
  element: ["rooftop solar", "heat pumps", "EV fleets and school buses", "irrigation pumps", "cold chains", "district heating", "industrial process heat", "data centers", "wind farms", "utility solar", "batteries", "long-duration storage", "hydrogen", "transmission lines", "distribution feeders", "gas networks", "geothermal", "hydro", "mini-grids", "water treatment and desalination", "agrivoltaics", "building retrofits", "demand-response programmes"],
  lever: ["new technology", "operation", "market or tariff design", "policy", "sufficiency (using less)", "maintenance and asset life", "avoided demand", "governance and ownership"],
  stakeholder: ["low-income renters", "homeowners", "farmers", "rural co-ops", "municipal utilities", "investor-owned utilities", "grid operators", "regulators", "developers", "large energy users", "city councils", "transit agencies", "workers in fossil industries", "tribal nations", "communities near infrastructure", "future generations"],
  twist: ["a week-long cold snap", "a drought", "a heat wave", "a fuel-price spike", "a one-mineral supply disruption", "a policy reversal", "a cyber incident", "population decline", "rapid load growth", "a wildfire season", "a new tariff design", "a doubled interconnection queue"],
  dimension: ["Physics and technology", "Operations", "Planning and optimization", "Economics and markets", "Techno-economic analysis", "LCA and environment", "Policy and regulation", "Society and livelihoods", "Security, resilience and national strategy", "Research methods"]
};
Object.keys(REF).forEach(k => ok(JSON.stringify(labels(k)) === JSON.stringify(REF[k]), "picker " + k + " is §11.3's list, in order (" + labels(k).length + ")"));
const CUR = process.env.LEARN_CURRICULUM || path.resolve(SITE, "..", "reports", "learn", "curriculum_v2.md");
const EXAMPLES_REF = {};
if (fs.existsSync(CUR)) {
  const c = fs.readFileSync(CUR, "utf8"), sec = c.slice(c.indexOf("### 11.3 The question studio"), c.indexOf("## 12. The news lens"));
  const row = name => (sec.match(new RegExp("\\| " + name + " \\| (.+) \\|")) || [])[1] || "";
  const split = s => s.replace(/\*\*/g, "").split(" · ").map(x => x.trim());
  ok(JSON.stringify(split(row("Scale"))) === JSON.stringify(REF.scale), "curriculum: scale list");
  ["element", "lever", "stakeholder", "twist"].forEach(k => {
    const name = { element: "System element", lever: "Lever", stakeholder: "Stakeholder", twist: "Twist \\(optional\\)" }[k];
    ok(JSON.stringify(split(row(name))) === JSON.stringify(REF[k]), "curriculum: " + k + " list matches the page's, item for item");
  });
  const thr = c.slice(c.indexOf("| Coverage thread |"), c.indexOf("## 6. The scale ladder"));
  const threads = [...thr.matchAll(/^\| ([^|(]+?) \([A-Z]{3}\) \|/gm)].map(m => m[1].trim());
  ok(JSON.stringify(threads) === JSON.stringify(REF.dimension), "curriculum: the ten coverage threads are the dimension picker (" + threads.join("; ") + ")");
  const tab = sec.slice(sec.indexOf("| Studio element | Cluster |"));
  const rows = [...tab.matchAll(/^\| ([a-zA-Z][^|]+?) \| (C\d\d) \| ([\d,]+) \| ([\d.]+|–) \|$/gm)];
  ok(rows.length === 29 && rows.every((m, i) => D.clusters[i] && D.clusters[i].name === m[1].trim() && D.clusters[i].id === m[2] && D.clusters[i].papers === +m[3].replace(/,/g, "") && (m[4] === "–" ? D.clusters[i].rgi === null : D.clusters[i].rgi === +m[4])),
    "curriculum: the 29 crowding counts, names and RGIs, in order");
  [...sec.matchAll(/^\| (\d) \| (.+?) \| (\w+) \| (.+) \|$/gm)].forEach(m => { EXAMPLES_REF[m[1]] = { combo: m[2], type: m[3], question: m[4] }; });
  ok(Object.keys(EXAMPLES_REF).length === 7, "curriculum: seven example cards found");
} else console.log("note: curriculum_v2.md not found (set LEARN_CURRICULUM); the lists were checked against the copy in this test only");
D.examples.forEach((e, i) => {
  const r = EXAMPLES_REF[String(i + 1)];
  if (r) ok(r.combo === e.combo && r.type === e.type && r.question === e.question, "example " + (i + 1) + " is §11.3's card, word for word");
  Object.keys(e.picks).forEach(k => ok(!!M.item(D, k, e.picks[k]), "example " + e.id + ": pick " + k + " exists"));
});
ok(M.check(D).length === 0, "data checks pass: " + M.check(D).join("; "));
const dc = M.item(D, "element", "datacenters");
ok(dc.note === "as a load" && /load/.test(dc.phrase), "data centers: labelled and phrased as a load (G-DC)");

// ---------------- blocked combinations: every slot, every type, and a sample of full combinations
const DENY = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
  /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/i, /artificial intelligence/i];
const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
const allStrings = [];
(function walk(v) { if (typeof v === "string") allStrings.push(v); else if (v && typeof v === "object") Object.values(v).forEach(walk); })(D);
ok(allStrings.every(s => !NUC.test(s)), "no string in the data names nuclear technology, so no draft or search can meet the nuclear-plus-risk rule");
ok(allStrings.every(s => DENY.every(re => !re.test(s))), "no string in the data matches the §20.4 deny-list");
const TYPES = QC.TYPES.map(t => t.id), base = { scale: "S3", dimension: "SOC", element: "heatpumps", lever: "tech", stakeholder: "renters", twist: "heatwave" };
let nDraft = 0, bad = [];
function test(p, t) {
  const d = M.draft(D, p, t); nDraft++;
  if (!/^[A-Z]/.test(d) || !/\?$/.test(d) || /[{}]/.test(d) || NUC.test(d) || DENY.some(re => re.test(d))) bad.push(d);
  if (p.element === "datacenters" && !/data-center loads/.test(d)) bad.push("not as a load: " + d);
}
TYPES.forEach(t => M.KEYS.forEach(k => D.pickers[k].concat(k === "twist" ? [{ id: null }] : []).forEach(x => test(Object.assign({}, base, { [k]: x.id }), t))));
let seed = 20261103; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < 200000; i++) {
  const p = {}; M.KEYS.forEach(k => { p[k] = k === "twist" && rnd() < 0.3 ? null : D.pickers[k][Math.floor(rnd() * D.pickers[k].length)].id; });
  test(p, TYPES[i % 5]);
}
ok(bad.length === 0, "drafts: " + nDraft + " built (every slot value, then 200,000 full combinations); all start with a capital, end with ?, fill every slot and pass the deny-list" + (bad.length ? ": " + bad.slice(0, 3).join(" | ") : ""));
ok(M.draft(D, base, "prescriptive") === "What should low-income renters do about heat pumps in a city or region, through new technology, to achieve a lower energy burden during a heat wave, compared with […]?", "draft: the prescriptive template, filled");
ok(M.draft(D, Object.assign({}, base, { twist: null }), "descriptive") === "How much does energy burden vary among low-income renters with heat pumps in a city or region?", "draft: the twist is optional");
ok(D.drafts.evaluative.indexOf("compared with […]") > 0 && D.drafts.prescriptive.indexOf("compared with […]") > 0, "evaluative and prescriptive drafts leave the counterfactual to the learner");

// ---------------- no originality judgement; crowding as context
ok(allStrings.every(s => !/\bnovel|\bhot (topic|spot|area|question)s?\b|untouched|\bgaps?\b|nobody has/i.test(s)), "no data string calls anything novel, a hot topic, untouched or a gap");
ok(/no originality judgement/i.test(D.meta.note) && /Few papers is no evidence that a question is new, important or feasible/.test(D.crowding.caveat), "the crowding caveat (§11.3)");
ok(/The studio makes no originality judgement/.test(PAGE) && /no originality judgement/.test(JS), "page and studio both say they make no originality judgement");
const cr = M.crowd(D, base);
ok(cr.length === 2 && M.crowdText(cr[0]) === "Keyword cluster “heat pumps”: 3,977 papers, 2016–2026; RGI 1.53." && M.crowdText(cr[1]) === "Keyword cluster “extreme weather”: 2,868 papers, 2016–2026; RGI 2.08.", "crowding lines for heat pumps and a heat wave");
ok(M.crowdText(M.crowd(D, { element: "irrigation", twist: "queue" })[0]) === "Keyword cluster “interconnection queues”: 95 papers, 2016–2026; too few papers for a growth figure.", "crowding: no cluster for irrigation pumps; the queue cluster has no RGI");
const w0 = M.weights(D, false), w1 = M.weights(D, true);
ok(Object.values(w0).every(v => v === 1), "spin weights: even without the toggle");
ok(w1.batteries < w1.heatpumps && w1.irrigation === 1 && Object.values(w1).every(v => v > 0), "road less travelled: smaller clusters weigh more, unmapped elements stay at 1, nobody is excluded");
let s2 = 7; const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647, hits = {};
for (let i = 0; i < 23000; i++) { const id = M.spin(D.pickers.element, r2, w1); hits[id] = (hits[id] || 0) + 1; }
ok(Object.keys(hits).length === 23 && hits.irrigation > hits.batteries, "spin: every element comes up; with the toggle, irrigation pumps more often than batteries");

// ---------------- search strings
let maxOps = 0, nStr = 0;
D.pickers.element.forEach(e => D.pickers.dimension.forEach(d => D.pickers.stakeholder.forEach(s => D.pickers.twist.concat([{ id: null }]).forEach(t => {
  M.searchStrings(D, { element: e.id, dimension: d.id, stakeholder: s.id, lever: "policy", twist: t.id }).forEach(x => { nStr++; maxOps = Math.max(maxOps, M.operators(x.text)); });
}))));
ok(maxOps <= 5, "search strings: at most 5 Boolean operators in all " + nStr + " (max " + maxOps + ")");
const ss = M.searchStrings(D, base);
ok(ss.length === 3 && ss[0].text === '("heat pump" OR "heat pumps") AND ("energy burden" OR "energy poverty")' && ss[1].text === '("heat pump" OR "heat pumps") AND (renters OR "low-income") AND ("heat wave" OR heatwave)' && /AND review$/.test(ss[2].text), "search strings for the exemplar's spin");
ok(M.searchURL(D, ss[0].text) === "https://openalex.org/works?search=" + encodeURIComponent(ss[0].text), "search link: OpenAlex's works search (form checked 3 November 2026)");
ok(M.searchStrings(D, { element: "heatpumps" }).length === 0, "no search strings without a dimension");

// ---------------- the card, realism, summary
const auto1 = M.autoCard(D, base, "predictive");
ok(auto1.audience === "" && auto1.metric === "energy burden" && auto1.units === "% of household income" && auto1.scale === "S3" && auto1.type === "predictive", "card: renters are affected, not deciders, so the audience is left to the learner");
ok(M.autoCard(D, Object.assign({}, base, { stakeholder: "councils" }), "predictive").audience === "city councils", "card: a deciding stakeholder fills the audience");
const mine = M.merge({ question: "My own question?", metric: "energy burden", units: "" }, auto1, null);
ok(mine.question === "My own question?" && mine.units === "% of household income", "card: the learner's question stays; empty fields are filled");
const auto2 = M.autoCard(D, Object.assign({}, base, { dimension: "SEC" }), "predictive"), moved = M.merge(mine, auto2, auto1);
ok(moved.metric === "customer hours without power" && moved.question === "My own question?", "card: a field still holding the old automatic value follows the new picks; edits stay");
const R = M.realism(D, { data: 0, physics: 1, institutions: 2 });
ok(R.map(r => r.state).join() === "pass,warn,block,," && M.realismCount(R).open === 2 && R[2].text === D.realism[2].block, "realism: pass, warn, block and two open");
ok(D.realism.length === 5 && D.realism.map(r => r.label).join() === "Data exist,Physics sanity,Institutions,Scope fits the time,People and ethics", "realism: the five checks of §11.3");
ok(D.realism.every(r => r.fix.every(c => typeof c === "number" || /^[A-Z]+\d*$/.test(c))), "realism: every fix names a lesson by number or code");
// the fix links follow path.json's live status (read here, not assumed): every code a realism fix names, plus one upcoming module
const PALL = [].concat(P.starter || [], P.more || [], P.toolbox || []);
const pentry = c => PALL.filter(l => (typeof c === "number" ? l.starter === c : l.code === c))[0];
const fixCodes = [...new Set([].concat(...D.realism.map(r => r.fix)))];
ok(fixCodes.every(c => M.ref(P, c).ready === !!(pentry(c) || {}).ready), "fix links: ref() reads the live status of every code a realism fix names, from path.json (" + fixCodes.join(", ") + "; live: " + fixCodes.filter(c => M.ref(P, c).ready).join(", ") + ")");
const upc = PALL.filter(l => l.code && !l.ready)[0], liveR = PALL.filter(l => l.code && l.ready && l.href)[0];
ok(upc && M.refHTML(P, upc.code) === upc.code + " (upcoming)", "fix links: an upcoming module (" + (upc && upc.code) + ") is named, not linked");
ok(liveR && M.refHTML(P, liveR.code) === '<a href="' + liveR.href + '">' + liveR.code + "</a>", "fix links: a live module (" + (liveR && liveR.code) + ") links to its page");
ok(M.ref(P, "R9").ready === !!(pentry("R9") || {}).ready && M.ref(P, "R3").ready === !!(pentry("R3") || {}).ready, "fix links: R3 and R9 follow path.yml (live on this branch: " + ["R3", "R9"].filter(c => M.ref(P, c).ready).join(", ") + ")");
const sum = M.summary(D, { picks: base, realism: { data: 0 }, papers: [{ t: "A paper", d: "other city" }, {}, {}] }, "CARD").split("\n");
ok(sum[0] === "CARD" && sum[1] === "Combination: S3 · Society and livelihoods · heat pumps · new technology · low-income renters · a heat wave" && /^Realism: data exist pass; physics sanity not answered/.test(sum[2]) && sum.indexOf("Close paper 1: A paper (differs: other city)") > 0, "the copied summary");

// ---------------- exemplars, rubric, page
ok(EX.validate(D.exemplars).length === 0, "exemplars are well formed");
const good = EX.plain(D.exemplars.answers.find(a => a.key === "good"));
["Question:", "Type:", "Audience:", "Metric:", "Compared with:", "Scale and boundary:", "I would be wrong if:", "Main uncertainty:"].forEach(k => ok(good.indexOf(k) >= 0, "strong card has " + k));
ok(D.rubric.competences.map(c => c.id).join() === "framing,realism" && /not a certificate/.test(D.rubric.note), "rubric: framing and realism; the narrow promise");
Object.keys(MARK).forEach(k => {
  const r = between(PAGE, MARK[k]);
  ok(r && PAGE.slice(r.a, r.b) === BLOCKS[k] + "\n", "no-JS block " + MARK[k] + " equals the generated one (run with --write after a data edit)");
});
ok(PAGE.indexOf('class="lx-card lx-studio-brief"') < PAGE.indexOf('data-learn="r10-question-studio"'), "the task card sits above the interactive");
ok(/About 40 minutes guided here, then about an hour on your own/.test(PAGE), "guided and practice time stated (40 + 60 min)");
ok(/2 November 2026/.test(PAGE) && /retrieved 2 November 2026/.test(D.crowding.source), "counts dated on the page and in the data");

// ---------------- text budget and scope of the page and script
const words = s => String(s).trim().split(/\s+/).length;
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n?\s*(free: true,\s*\n?\s*)?build/g)].map(m => m[1]);
ok(stepTexts.length === 6 && stepTexts.every(t => words(t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1")) <= 35), "six step cards, each at most 35 words");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
const code = JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
DENY.concat([NUC, /\bClaude\b|ChatGPT|language model/i]).forEach(re => ok(!re.test(OWN) && !re.test(code), "scope: page and script free of " + re));
ok((OWN.match(/data[- ]cent[a-z]*/gi) || []).every(m => /^data[- ]centers?$/i.test(m)) && /data centers \(as a load\)/.test(BLOCKS.task) && /data-center cooling/.test(BLOCKS.exemplars), "data centers appear only as the element (a load) and in example 4 (cooling, a load)");

console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (test_r10-question-studio)");
process.exit(fails ? 1 : 0);
