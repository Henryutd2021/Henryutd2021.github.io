// test_n01-news-lens.js — Node tests for lesson N1 (assets/learn/n01-news-lens.js), its data file
// (assets/learn/data/n01-news-lens.json) and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_n01-news-lens.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/n01-news-lens.js"));
const D = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/n01-news-lens.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/n01-news-lens.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/n01-news-lens.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const words = s => s.trim().split(/\s+/).length;
const sentences = s => (s.replace(/\bU\.S\./g, "US").replace(/\bp\. (?=\d)/g, "p ").match(/[.!?](\s|$)/g) || []).length;   // "U.S." and "p. 10" are not sentence ends
const has = s => QMD.indexOf(s) >= 0;
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------- the lens
const ids = D.lens.map(l => l.id);
ok(D.lens.length === 7 && new Set(ids).size === 7, "lens: seven questions with unique ids");
ok(D.lens.every((l, i) => l.n === i + 1 && l.ask && l.trap && /^var\(--lx-/.test(l.color)), "lens: numbered 1-7, each with a question, a trap and a token colour");
const lensCovers = D.lens.map(l => (l.label + " " + l.sub).toLowerCase()).join(" ");
["scale", "time", "horizon", "physics", "units", "limits", "power or energy", "who pays", "boundary", "counterfactual", "uncertainty"].forEach(k =>
  ok(lensCovers.indexOf(k) >= 0, `lens: covers "${k}" (the brief's tags: scale, units, time horizon, physics limits, capacity vs energy, who pays, boundary, counterfactual, uncertainty)`));

// ---------------- stories: tags, notes, sources, fallback text
const ALLOWED = ["eia.gov", "energy.gov", "entsoe.eu"];
D.stories.forEach((s, k) => {
  const ph = M.phrases(s);
  ok(ph.length >= 5 && ph.length <= 6, `story ${s.id}: 5-6 tagged phrases (${ph.length})`);
  ph.forEach(p => {
    ok(ids.indexOf(p.tag) >= 0 && (p.also || []).every(a => ids.indexOf(a) >= 0 && a !== p.tag), `story ${s.id} ${p.p}: tags are lens ids`);
    ok(sentences(p.note) <= 2 && words(p.note) <= 40, `story ${s.id} ${p.p}: note is one or two sentences, at most 40 words (${words(p.note)})`);
    ok(has(esc(p.text)) && has(esc(p.note)), `story ${s.id} ${p.p}: phrase and note are in the no-JS fallback`);
  });
  ok(ids.indexOf(s.missing.answer) >= 0 && words(s.missing.note) <= 50, `story ${s.id}: the unanswered question is a lens id; note under 50 words`);
  ok(has(esc(s.headline)) && has(esc(s.take)), `story ${s.id}: headline and model take are in the fallback`);
  ok(sentences(s.take) === 3, `story ${s.id}: the model take has three sentences`);
  s.sources.forEach(src => {
    const host = new URL(src.url).hostname;
    ok(ALLOWED.some(h => host === h || host.endsWith("." + h)) && src.as_of, `story ${s.id}: source ${host} is a primary agency source with a date`);
    ok(has(src.url), `story ${s.id}: source ${src.url} is linked on the page`);
  });
  // the full story text, in order, as the fallback shows it
  const body = s.parts.map(p => typeof p === "string" ? esc(p) : "<mark>" + esc(p.text) + "</mark>").join("");
  ok(has(body), `story ${s.id}: fallback paragraph equals the data`);
});

// ---------------- judge and score
const A = D.stories[0];
const all = {}; M.phrases(A).forEach(p => all[p.p] = p.tag); all._missing = A.missing.answer;
let sc = M.score(A, all);
ok(sc.same === sc.total && sc.fair === 0 && sc.missing === "same", "score: the researcher's own tags match everywhere");
sc = M.score(A, {});
ok(sc.none === sc.total && sc.missing === "none", "score: no picks are 'none'");
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let t = 0; t < 200; t++) {
  const pk = {}; M.phrases(A).forEach(p => { if (rnd() > 0.2) pk[p.p] = ids[Math.floor(rnd() * 7)]; });
  const r = M.score(A, pk);
  ok(r.same + r.fair + r.other + r.none === r.total, "score: same + fair + other + none = phrases");
}
const p1 = M.phrases(A)[0];
ok(M.judge(p1, p1.tag) === "same" && M.judge(p1, p1.also[0]) === "fair" && M.judge(p1, "pays") === "other" && M.judge(p1, null) === "none", "judge: same, fair, other, none");

// ---------------- envelope A: energy to power, and the report's 148 GW
const eA = A.envelope, avg = M.averageGW(eA.twh, eA.hours);
ok(Math.abs(avg - 74.087) < 0.01, `envelope A: 649 TWh / 8,760 h = ${avg.toFixed(2)} GW`);
ok(eA.options[eA.answer] === Math.round(avg) + " GW", "envelope A: the right option is the rounded average");
ok(eA.options[0] === Math.round(avg / 10) + " GW" && eA.options[3] === (Math.round(eA.twh * 8.76 / 100) * 100).toLocaleString("en-US") + " GW", "envelope A: distractors are /87.6 and x8.76 slips");
ok(Math.round(M.connectionGW(eA.twh, eA.util, eA.hours)) === eA.report_gw, "envelope A: 50% use reproduces the report's 148 GW");
ok(Math.round(M.averageGW(192)) === 22 && A.parts.some(p => p.note && p.note.indexOf("about 22 GW") >= 0), "story A: 192 TWh is about 22 GW on average");
ok((843 / 521).toFixed(1) === "1.6" && A.parts.some(p => p.note && p.note.indexOf("1.6 times") >= 0), "story A: the range's top is 1.6 times its bottom");
ok(A.take.indexOf("about 50%") >= 0 && Math.round((649 / 430 - 1) * 100) >= 45 && Math.round((649 / 430 - 1) * 100) <= 55, "story A take: 649 vs about 430 TWh differ by about 50%");

// ---------------- envelope B: power to energy, minutes of U.S. use, planned vs built
const B = D.stories[1], eB = B.envelope;
ok(M.storedGWh(15, 4) === 60 && Math.abs(M.minutesOfUse(60, eB.us_twh, eB.hours) - 7.5) < 0.05, "envelope B: 15 GW x 4 h = 60 GWh = 7.5 minutes of average U.S. use");
ok(Math.round(M.averageGW(eB.us_twh, eB.hours) / 10) * 10 === 480, "story B: 4.20 trillion kWh is about 480 GW on average");
ok(Math.round(eB.gw / eB.planned_gw * 100) === 82 && B.parts.some(p => p.note && p.note.indexOf("82%") >= 0), "story B: 15 / 18.2 = 82% of the plan");
ok(eB.options[eB.answer].indexOf("depends") >= 0, "envelope B: the right answer is that it depends on the duration");

// ---------------- the evidence clock C
const C = D.stories[2], eC = C.envelope;
ok(M.days(eC.event, eC.factual) === 158 && M.days(eC.event, eC.final) === 326, "story C: 158 and 326 days to the two reports");
ok(eC.ticks[eC.answer] === Math.round(326 / 30.44) + " months", "story C: the answer tick is 11 months");
ok(C.parts.some(p => p.note && p.note.indexOf("158 days") >= 0 && p.note.indexOf("326") >= 0), "story C: note states 158 and 326 days");

// ---------------- spotter
ok(D.spotter.length === 6 && D.spotter.filter(s => s.answer === "error").length === 4, "spotter: six sentences, four errors (as the step says)");
ok(JS.indexOf("Four of these six sentences") >= 0, "spotter: step text matches the count");
const home = 10791;
ok(Math.round(13 / (home / 8760)) === 11 || Math.floor(13 / (home / 8760)) === 10, "spotter s3: 13 kWh lasts about 10 hours of average use");
ok(Math.round(10000 * home / 1e6) === 108 && Math.round(10000 * home / 8760 / 1000) === 12, "spotter s6: 10,000 homes use about 108 GWh a year, 12 MW on average");
ok(100 * 4 === 400 && D.spotter[0].fix.indexOf("400 MWh") >= 0, "spotter s1: 100 MW x 4 h = 400 MWh");
D.spotter.forEach(s => ok(words(s.fix) <= 40, `spotter ${s.id}: fix under 40 words`));

// ---------------- ladder
D.ladder.items.forEach(it => ok(it.answer.every(a => a === "projection" || D.ladder.rungs.some(r => r.id === a)), `ladder ${it.id}: answers are rungs`));
ok(M.ladderOK(D.ladder.items[0], "operating") && !M.ladderOK(D.ladder.items[0], "announced") && M.ladderOK(D.ladder.items[2], "projection"), "ladder: placements");
ok(D.ladder.rungs.map(r => r.label).join(",") === "Announced,Funded,Permitted,Under construction,Operating,At design output", "ladder: the six rungs of curriculum §16");

// ---------------- the page's numbers table and quiz
D.numbers.forEach(n => ok(has(`<td class="n">${n.n}</td><td>${esc(n.what)}</td>`) && (!n.url || has(n.url)), `numbers: "${n.n}" row matches the data file`));
ok(2 * 8760 === 17520 && has("17,520 GWh") && has("17.5 TWh"), "quiz: 2 GW for a year = 17,520 GWh = 17.5 TWh");

// ---------------- text budget and scope
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)", build:/g)].map(m => m[1]);
ok(stepTexts.length === 9, `steps: nine step cards (${stepTexts.length})`);
stepTexts.forEach((t, i) => ok(words(t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1")) <= 40, `step ${i + 1}: about 35 words (${words(t)})`));
const visible = QMD + JSON.stringify(D) + stepTexts.join(" ");
[/\bAI\b/i, /artificial intelligence/i, /\bClaude\b/, /ChatGPT/, /\bFOAK\b/, /learning[- ](curve|rate)/i, /projects\//, /research\.(html|qmd)/, /nuclear|reactor|\bSMR\b/i].forEach(rx =>
  ok(!rx.test(visible), "scope: no " + rx));
const hrefs = [...QMD.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
hrefs.forEach(h => ok(/^https:\/\/([a-z0-9-]+\.)*(eia\.gov|energy\.gov|entsoe\.eu|creativecommons\.org|opensource\.org)\//.test(h) || /^(index\.html|00-grid-operator\.html|mailto:)/.test(h) || h.startsWith("#"),
  "scope: link allowed: " + h));

console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
