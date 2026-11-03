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
//   - the card's automatic fields keep the learner's edits and follow the picks only where the automatic value changed;
//     the audience is filled only for a prescriptive draft; realism states with the learner's evidence; the copied summary
//   - the seven example cards are §11.3's, word for word; each loads a fresh card with its own question-matched audience,
//     metric and units, every required part, and three search strings
//   - the page never claims the checks establish rigour; the search links are labelled live; no production notes or guard
//     assertions in the public data file
//   - the no-JS blocks on the page equal the generated ones (write them with --write after a data edit); text budget (step
//     cards, feedback and every visible text element: at most 35 words and two sentences; option lists excepted)
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
const CORE = require(L("components/core.js"));
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
ok(/no originality judgement/i.test(D.meta.note) && D.crowding.caveats.some(c => /^Few papers is no evidence that a question is new, important or feasible\.$/.test(c)) && D.crowding.caveats.every(c => M.rich(c) && c.split(/\s+/).length <= 15), "the crowding caveat (§11.3), as short separate statements");
ok(D.crowding.caveats.every(c => BLOCKS.crowding.indexOf("<li>" + c + "</li>") >= 0) && /D\.crowding\.caveats\.forEach/.test(JS), "the caveats: one element each, on the page and in the studio");
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
ok(auto1.audience === "" && auto1.metric === "energy burden" && auto1.units === "% of household income" && auto1.scale === "S3" && auto1.type === "predictive", "card: for a predictive draft the learner names who would use the answer");
ok(M.autoCard(D, base, "prescriptive").audience === "low-income renters" && M.autoCard(D, Object.assign({}, base, { stakeholder: "councils" }), "explanatory").audience === "", "card: the audience comes only with a prescriptive draft (which names the stakeholder as the one who acts), for any stakeholder");
ok(D.pickers.stakeholder.every(x => !("decides" in x)), "stakeholders: no fixed 'decides' class that would rule affected groups out as an audience");
const mine = M.sync({ question: "My own question?", metric: "energy burden", units: "" }, auto1, null).card;
ok(mine.question === "My own question?" && mine.units === "% of household income", "card: the learner's question stays; empty fields are filled");
const auto2 = M.autoCard(D, Object.assign({}, base, { dimension: "SEC" }), "predictive"), moved = M.sync(mine, auto2, auto1).card;
ok(moved.metric === "customer-hours without power" && moved.units === "customer-hours a year (customers out × hours out)" && moved.question === "My own question?", "card: a field still holding the old automatic value follows the new picks; edits stay");
// after an example: its own fields stay when a pick changes something they do not depend on
const e4 = M.example(D, "e4"), p4 = M.examplePicks(D, e4), c4 = M.exampleCard(D, e4);
const put4 = { question: c4.question, type: c4.type, scale: c4.scale, audience: c4.audience, metric: c4.metric, units: c4.units };
const tw = Object.assign({}, p4, { twist: "heatwave" }), r4 = M.sync(c4, M.autoCard(D, tw, "descriptive"), M.autoCard(D, p4, "descriptive"), put4);
ok(r4.card.metric === c4.metric && r4.card.audience === c4.audience, "card: after loading example 4, changing the twist keeps its own metric and audience");
ok(r4.card.question !== c4.question, "card: ... while the question, which names the twist, follows the new picks");
const R = M.realism(D, { data: 0, physics: 1, institutions: 2 }, { data: "Hourly load, CC BY, 2025" });
ok(R.map(r => r.state).join() === "pass,warn,block,," && M.realismCount(R).open === 2 && R[2].text === D.realism[2].block && R[0].evidence === "Hourly load, CC BY, 2025", "realism: pass, warn, block, two open, and the evidence kept");
ok(D.realism.every(r => r.evidence && r.evidence.split(/\s+/).length <= 8) && /below/.test(D.realism[0].pass) && /below/.test(D.realism[2].pass) && !/on the card/.test(D.realism[0].pass + D.realism[2].pass), "realism: every check has a place for its evidence, and the pass notes point to it");
ok(D.realism.length === 5 && D.realism.map(r => r.label).join() === "Data exist,Physics sanity,Institutions,Scope fits the time,People and ethics", "realism: the five checks of §11.3");
ok(D.realism.every(r => r.fix.every(c => typeof c === "number" || /^[A-Z]+\d*$/.test(c))), "realism: every fix names a lesson by number or code");
// the fix links follow path.json's live status (read here, not assumed): every code a realism fix names, plus one upcoming
// module. The studio links through LX.lessonRef and LX.lessonRefHTML (components/core.js) and keeps no copy of them.
const PALL = [].concat(P.starter || [], P.more || [], P.toolbox || []);
const pentry = c => PALL.filter(l => (typeof c === "number" ? l.starter === c : l.code === c))[0];
const fixCodes = [...new Set([].concat(...D.realism.map(r => r.fix)))];
ok(fixCodes.every(c => CORE.lessonRef(P, c).ready === !!(pentry(c) || {}).ready), "fix links: lessonRef() reads the live status of every code a realism fix names, from path.json (" + fixCodes.join(", ") + "; live: " + fixCodes.filter(c => CORE.lessonRef(P, c).ready).join(", ") + ")");
const upc = PALL.filter(l => l.code && !l.ready)[0], liveR = PALL.filter(l => l.code && l.ready && l.href)[0];
ok(upc && CORE.lessonRefHTML(P, upc.code) === upc.code + " (upcoming)", "fix links: an upcoming module (" + (upc && upc.code) + ") is named, not linked");
ok(liveR && CORE.lessonRefHTML(P, liveR.code) === '<a href="' + liveR.href + '">' + liveR.code + "</a>", "fix links: a live module (" + (liveR && liveR.code) + ") links to its page");
ok(CORE.lessonRef(P, "R9").ready === !!(pentry("R9") || {}).ready && CORE.lessonRef(P, "R3").ready === !!(pentry("R3") || {}).ready, "fix links: R3 and R9 follow path.yml (live on this branch: " + ["R3", "R9"].filter(c => CORE.lessonRef(P, c).ready).join(", ") + ")");
ok(!/function ref(HTML)?\s*\(/.test(JS) && !("ref" in M) && /LX\.lessonRefHTML\(P, c\)/.test(JS) && /LX\.lessonRef\(P, map\[k\]\)/.test(JS), "fix links: the studio uses LX.lessonRef and LX.lessonRefHTML and keeps no copy");
ok(!/replaceState/.test(JS), "a shared #q- link is applied once by LX.QuestionCard itself; the studio keeps no workaround");
const sum = M.summary(D, { picks: base, realism: { data: 0 }, evidence: { data: "Hourly load, CC BY, 2025" }, papers: [{ t: "A paper", d: "other city" }, {}, {}] }, "CARD").split("\n");
ok(sum[0] === "CARD" && sum[1] === "Combination: S3 · Society and livelihoods · heat pumps · new technology · low-income renters · a heat wave" && sum[2] === "Realism, data exist: pass; evidence: Hourly load, CC BY, 2025" && sum[3] === "Realism, physics sanity: not answered" && sum.indexOf("Close paper 1: A paper (differs: other city)") > 0, "the copied summary, with the realism evidence");

// ---------------- the example cards: question-matched fields, complete picks, three search strings, a fresh card
D.examples.forEach(e => {
  const p = M.examplePicks(D, e), c = M.exampleCard(D, e), S = M.searchStrings(D, p);
  ok(M.complete(D, p) && S.length === 3 && S.every(x => M.operators(x.text) <= 5), e.id + ": every required part, and three search strings of at most five operators");
  ok(c.question === e.question && c.type === e.type && c.audience && c.metric && c.units && ["counterfactual", "boundary", "wrong", "uncertainty"].every(k => c[k] === ""), e.id + ": a fresh card with the example's own question, audience, metric and units, the rest empty");
});
ok(/water/.test(M.exampleCard(D, M.example(D, "e4")).metric) && /MW/.test(M.exampleCard(D, M.example(D, "e4")).units) && !/CO₂/.test(JSON.stringify(M.exampleCard(D, M.example(D, "e4")))), "example 4: water use and summer peak, not CO₂");
ok(!/unserved/.test(M.exampleCard(D, M.example(D, "e2")).metric) && /\$ a season/.test(M.exampleCard(D, M.example(D, "e2")).units), "example 2: pumping moved and its value, not unserved energy");
ok(/water use/.test(M.searchStrings(D, M.examplePicks(D, M.example(D, "e4")))[0].text), "example 4: its search strings look for water use");
ok(M.combo(D, M.examplePicks(D, M.example(D, "e1"))).indexOf("community solar") >= 0 && M.draft(D, M.examplePicks(D, M.example(D, "e1")), "evaluative").indexOf("community solar") >= 0, "example 1: community solar, outside the element list, comes as an extra");
ok(!M.clean(D, { element: "rooftop", extra: { element: { label: "community solar", terms: ["x"] } } }).extra, "an extra gives way to a pick of the learner's own");
const LOAD = JS.slice(JS.indexOf('lb.addEventListener("click"'), JS.indexOf('rb.addEventListener("click"'));
ok(/st\.stash = snapshot\(\)/.test(LOAD) && /st\.realism = \{\}; st\.evidence = \{\}; st\.papers = \[\{\}, \{\}, \{\}\]/.test(LOAD) && /exampleCard\(D, e\)/.test(LOAD), "loading an example: the previous work is kept to restore, realism and papers start empty, and the card is the example's own");
ok(/if \(st\.autoKey === key\(\)\) return;/.test(JS), "the card's automatic fields change only when the picks or the type do (coming back to step 3 does not overwrite a loaded example)");

// ---------------- what the checks claim; live search links; the public data file
ok(!/passes its eight checks|checks pass\./.test(PAGE) && /all eight parts of the card are filled in and rated against the rubric/.test(PAGE), "the task: parts filled in and rated by the learner, not 'passes its checks'");
ok(/of 8 parts filled in\. Rate their rigour against the rubric/.test(JS) && !/of 8 checks pass/.test(JS), "the card step: parts filled in; rigour is the learner's rubric review");
ok(/live results, new tab/.test(JS) && /current results/.test(D.search.live) && /no request/.test(D.search.noreq), "search links: labelled as OpenAlex's live results; the page sends no request");
ok(!("built_by" in D.meta) && !("scope" in D.meta), "the public data file carries no production note and no guard assertions");
ok(/Typical methods for this type: " \+ LX\.rich\(methodsMarked/.test(JS) && ["gis", "econometrics", "mcda", "monte-carlo", "difference-in-differences"].every(id => BLOCKS.task.indexOf('data-term="' + id + '"') >= 0), "method names carry glossary marks (studio and no-JS version)");
["energy-burden", "customer-hours", "net-present-value", "techno-economic-analysis", "life-cycle-assessment"].forEach(id => ok(D.terms.indexOf("[[" + id + "|") >= 0, "words line: " + id));
ok(!/Those (who decide|affected)/.test(JSON.stringify(D.exemplars)) && /no use for the answer is stated/.test(JSON.stringify(D.exemplars)), "exemplar audience: a stated use, not affected against deciding");
ok(/Realism:/.test(EX.plain(D.exemplars.answers[1])) && /Closest papers:/.test(EX.plain(D.exemplars.answers[1])) && /framing and realism/.test(D.exemplars.answers[1].level), "strong exemplar: shows the realism review and the closest-paper notes, labelled for what it rates");

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
ok(/About 40 minutes guided here, then about an hour on your own: run the three searches, skim the first twenty results of each/.test(PAGE), "guided and practice time stated (40 + 60 min), with the practice bounded to fit an hour");
ok(/2 November 2026/.test(PAGE) && /retrieved 2 November 2026/.test(D.crowding.source), "counts dated on the page and in the data");

// ---------------- text budget and scope of the page and script
const words = s => String(s).trim().split(/\s+/).length;
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n?\s*(free: true,\s*\n?\s*)?build/g)].map(m => m[1]);
ok(stepTexts.length === 6 && stepTexts.every(t => words(t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1")) <= 35), "six step cards, each at most 35 words");
const sentences = t => (t.replace(/\b(U\.S\.|e\.g\.|i\.e\.)/g, "x").match(/[.!?](\s|$)/g) || []).length;
ok(stepTexts.every(t => sentences(t) <= 2), "every step card is at most two sentences");
const sawTexts = [...JS.matchAll(/api\.saw\("([^"]+)"/g)].map(m => m[1]).concat([D.search.live, D.search.note + " Link format checked on 3 November 2026; this page sends no request itself."]);
ok(sawTexts.length >= 6 && sawTexts.every(t => words(t) <= 35 && sentences(t) <= 2), "studio feedback and notes: at most 35 words and two sentences each");
// every text element the page shows, with JavaScript off: at most 35 words and two sentences; an answer written as a card
// is checked line by line; references and the option lists of the pickers (§11.3, word for word) are left out
const VIS = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "");
const long = [];
for (const m of VIS.matchAll(/<(li|p|td|th|caption|summary|dd)\b([^>]*)>((?:(?!<\/?\1\b)[\s\S])*?)<\/\1>/g)) {
  const parts = /lx-ex-lines/.test(m[2]) ? m[3].split("\n") : [m[3]];
  parts.forEach(x => { const t = x.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, "x").replace(/\s+/g, " ").trim(); if (t && !/ · .* · /.test(t) && (words(t) > 35 || sentences(t) > 2)) long.push(t.slice(0, 60)); });
}
ok(long.length === 0, "every visible text element of the page is at most 35 words and two sentences: " + long.join(" | "));
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
const code = JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
DENY.concat([NUC, /\bClaude\b|ChatGPT|language model/i]).forEach(re => ok(!re.test(OWN) && !re.test(code), "scope: page and script free of " + re));
ok((OWN.match(/data[- ]cent[a-z]*/gi) || []).every(m => /^data[- ]centers?$/i.test(m)) && /data centers \(as a load\)/.test(BLOCKS.task) && /data-center cooling/.test(BLOCKS.exemplars), "data centers appear only as the element (a load) and in example 4 (cooling, a load)");

console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (test_r10-question-studio)");
process.exit(fails ? 1 : 0);
