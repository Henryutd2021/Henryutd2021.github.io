// test_n01-news-lens.js — Node tests for lesson N1 (assets/learn/n01-news-lens.js), its data file
// (assets/learn/data/n01-news-lens.json) and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_n01-news-lens.js
//        node _tests/learn/test_n01-news-lens.js --write   first rewrites the page's no-JS checks block (between the
//        fallback-checks markers) from staticChecks(); the stories' fallback comes from N1's fallback build step
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/n01-news-lens.js"));
const D = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/n01-news-lens.json"), "utf8"));
const QPATH = path.join(SITE, "learn/n01-news-lens.qmd");
const MK = [/<!-- fallback-checks:start[^>]*-->\n/, "<!-- fallback-checks:end -->"];
if (process.argv.includes("--write")) {
  const q = fs.readFileSync(QPATH, "utf8"), a = q.match(MK[0]), b = q.indexOf(MK[1]);
  if (!a || b < a.index) throw new Error("fallback-checks markers missing");
  fs.writeFileSync(QPATH, q.slice(0, a.index + a[0].length) + M.staticChecks(D) + "\n" + q.slice(b));
  console.log("fallback-checks block written");
}
const QMD = fs.readFileSync(QPATH, "utf8");
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
  ok(lensCovers.indexOf(k) >= 0, `lens: covers "${k}" (the news lens's tags: scale, units, time horizon, physics limits, capacity vs energy, who pays, boundary, counterfactual, uncertainty)`));

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
  const tp = M.takeParts(s.take);
  ok(tp.length === 3 && tp.every(x => x.v && words(x.v) <= 20) && !/^Confidence/.test(tp[2].v), `story ${s.id}: the take shows as three labelled lines of at most 20 words`);
  const text = s.parts.map(p => typeof p === "string" ? p : p.text).join("");
  text.split("\n").forEach((l, i) => ok(words(l) <= 20, `story ${s.id}: line ${i + 1} is at most 20 words (${words(l)})`));
  s.sources.forEach(src => {
    const host = new URL(src.url).hostname;
    ok(ALLOWED.some(h => host === h || host.endsWith("." + h)) && src.as_of, `story ${s.id}: source ${host} is a primary agency source with a date`);
    ok(has(src.url), `story ${s.id}: source ${src.url} is linked on the page`);
  });
  // the full story text, in order, as the fallback shows it
  const body = s.parts.map(p => typeof p === "string" ? esc(p) : "<mark>" + esc(p.text) + "</mark>").join("").split("\n").map(l => "<p>" + l + "</p>").join("\n");
  ok(has(body), `story ${s.id}: the fallback holds the story one line per paragraph, as the data`);
  if (s.intro) ok(words(s.intro.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1")) <= 36 && JS.indexOf("if (story.intro) H(\"p\"") > 0, `story ${s.id}: its terms are an element of their own before the story, in the page and the fallback`);
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
ok(Math.round(M.averageGW(192, 8784)) === 22 && A.parts.some(p => p.note && p.note.indexOf("2024's 8,784 hours (a leap year) it is about 22 GW") >= 0), "story A: 192 TWh over 2024's 8,784 hours is about 22 GW on average");
ok((843 / 521).toFixed(1) === "1.6" && A.parts.some(p => p.note && p.note.indexOf("1.6 times") >= 0), "story A: the range's top is 1.6 times its bottom");
ok(A.take.indexOf("about 50%") >= 0 && Math.round((649 / 430 - 1) * 100) >= 45 && Math.round((649 / 430 - 1) * 100) <= 55, "story A take: 649 vs about 430 TWh differ by about 50%");

// ---------------- envelope B: power to energy, minutes of U.S. use, planned vs built
const B = D.stories[1], eB = B.envelope;
ok(M.storedGWh(15, 4) === 60 && Math.abs(M.minutesOfUse(60, eB.us_twh, eB.hours) - 7.5) < 0.05, "envelope B: 15 GW x 4 h = 60 GWh = 7.5 minutes of average U.S. use");
ok(Math.round(M.averageGW(eB.us_twh, eB.hours) / 10) * 10 === 480, "story B: 4.20 trillion kWh is about 480 GW on average");
ok(Math.round(eB.gw / eB.planned_gw * 100) === 82 && B.parts.some(p => p.note && p.note.indexOf("82%") >= 0), "story B: 15 / 18.2 = 82% of the plan");
ok(Math.round(eB.gw / M.averageGW(eB.us_twh, eB.hours) * 100) === 3, "envelope B: 15 GW is about 3% of the 2025 average U.S. demand");
ok(JS.indexOf("run the whole") < 0 && JS.indexOf("only about **") > 0 && JS.indexOf("cover hours, not seasons") > 0, "envelope B: energy equivalence is not read as deliverable power");
ok(!/planned battery capacity arrived/.test(JSON.stringify(D) + JS) && /actual additions were about 82%/i.test(JSON.stringify(D)), "story B: 82% compares totals (actual additions against the amount first planned), not projects");
ok(eB.options[eB.answer].indexOf("depends") >= 0, "envelope B: the right answer is that it depends on the duration");

// ---------------- the evidence clock C
const C = D.stories[2], eC = C.envelope;
ok(M.days(eC.event, eC.factual) === 158 && M.days(eC.event, eC.final) === 326, "story C: 158 and 326 days to the two reports");
ok(eC.ticks[eC.answer] === Math.round(326 / 30.44) + " months", "story C: the answer tick is 11 months");
ok(C.parts.some(p => p.note && p.note.indexOf("158 days") >= 0 && p.note.indexOf("326") >= 0), "story C: note states 158 and 326 days");
ok(!/within a day|one-cause claim/i.test(JSON.stringify(D) + JS), "story C: the early claims are described, not dated or plotted");
ok(C.parts[0].indexOf("12:33 CEST (11:33 in Portugal)") >= 0 && C.parts[1].text.indexOf("the continental power systems") === 0, "story C: time zone and the continental systems stated");
ok(C.missing.q && /claim of a cause/.test(C.missing.q) && JS.indexOf("missingQ: story.missing.q") > 0, "story C: the unanswered-question prompt targets the causal claim");

// ---------------- spotter
ok(D.spotter.length === 6 && D.spotter.filter(s => s.answer === "error").length === 4, "spotter: six sentences, four errors (as the step says)");
ok(JS.indexOf("Four of these six sentences") >= 0, "spotter: step text matches the count");
ok(/\["error", "Error or unsupported assumption"\]/.test(JS) && D.spotter.find(x => x.id === "s4").kind === "assumption" && M.verdict(D.spotter.find(x => x.id === "s4")) === "An unsupported assumption." && /a year's energy depends on hours and output/.test(D.spotter.find(x => x.id === "s4").fix), "spotter s4: constant rated output is an unsupported assumption, and the choice names it");
ok(D.spotter.filter(x => x.answer === "error").every(x => ["unit", "scale", "assumption"].indexOf(x.kind) >= 0), "spotter: every error is a unit error, a scale error or an unsupported assumption");
const home = 10791;
ok(Math.round(13 / (home / 8760)) === 11 || Math.floor(13 / (home / 8760)) === 10, "spotter s3: 13 kWh lasts about 10 hours of average use");
ok(Math.round(10000 * home / 1e6) === 108 && Math.round(10000 * home / 8760 / 1000) === 12, "spotter s6: 10,000 homes use about 108 GWh a year, 12 MW on average");
ok(100 * 4 === 400 && D.spotter[0].fix.indexOf("400 MWh") >= 0, "spotter s1: 100 MW x 4 h = 400 MWh");
D.spotter.forEach(s => ok(words(s.fix) <= 40, `spotter ${s.id}: fix under 40 words`));

// ---------------- ladder
D.ladder.items.forEach(it => ok(it.answer.every(a => a === "projection" || D.ladder.rungs.some(r => r.id === a)), `ladder ${it.id}: answers are rungs`));
ok(M.ladderOK(D.ladder.items[0], "operating") && !M.ladderOK(D.ladder.items[0], "announced") && M.ladderOK(D.ladder.items[2], "projection"), "ladder: placements");
ok(M.ladderOK(D.ladder.items[1], "announced") && ["funded", "permitted", "construction", "operating"].every(r => !M.ladderOK(D.ladder.items[1], r)) && /Funding, permits and building each need their own evidence/.test(D.ladder.items[1].note), "ladder l2: 'planned' establishes only announced; funding, permits and construction need their own evidence");
ok(/funding and permits can come in either order/.test(JS), "ladder: the explain lede says the middle rungs need not come in order");
ok(D.ladder.rungs.map(r => r.label).join(",") === "Announced,Funded,Permitted,Under construction,Operating,At design output", "ladder: the six rungs of the news lens's ladder");

// ---------------- the Steelman box's sensitivity scenarios, the explain fallback and the citation
const SN = D.sensitivity;
SN.lower.concat(SN.higher).forEach(x => ok(has(`${x.what} (${x.twh} TWh`), `steelman: "${x.what}" at ${x.twh} TWh as in the data`));
ok(SN.lower.every(x => x.twh < SN.reference_twh) && SN.higher.every(x => x.twh > SN.reference_twh) && has(`${SN.bounds[0]}–${SN.bounds[1]} TWh`) && has(SN.url), "steelman: lower below and higher above the 649 TWh Reference Case; bounds stated");
ok(has("Multiply a year's TWh by 1,000 to get GWh, then divide by 8,760 hours"), "explain: TWh to average GW keeps the factor of 1,000");
ok(has("Smith, S. J. et al. (2026)") && !has("Shehabi, A. et al."), "sources: the 2025 Update's first author");
// ---------------- the no-JS checks, spotter and ladder: the page holds staticChecks() exactly
{
  const a = QMD.match(MK[0]), b = QMD.indexOf(MK[1]);
  ok(a && b > a.index && QMD.slice(a.index + a[0].length, b) === M.staticChecks(D) + "\n", "fallback: the checks, spotter answers and ladder placements match the data (run with --write after a data edit)");
  const st = M.staticChecks(D);
  ok(st.indexOf("74.1 GW") > 0 && st.indexOf("148 GW") > 0 && st.indexOf("7.5 minutes") > 0 && st.indexOf("about 3%") > 0 && st.indexOf("82%") > 0 && st.indexOf("326 days") > 0, "fallback: the worked checks state 74.1 GW, 148 GW, 7.5 minutes, 3%, 82% and 326 days");
  ok(D.spotter.every(s => st.indexOf(esc(s.fix)) > 0) && D.ladder.items.every(it => st.indexOf(esc(it.note)) > 0), "fallback: every spotter answer and ladder note");
}

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
hrefs.forEach(h => ok(/^https:\/\/([a-z0-9-]+\.)*(eia\.gov|energy\.gov|entsoe\.eu|creativecommons\.org|opensource\.org)\//.test(h) || /^(index\.html|[a-z0-9-]+\.html(#[a-z0-9-]+)?|mailto:)$/.test(h) || /^mailto:/.test(h) || h.startsWith("#"),
  "scope: link allowed: " + h));

// ---------------- wording: what each model can test; a fleet's energy; reactive power; terms; time; element budget
{
  const mod = QMD.slice(QMD.indexOf("Which model would test each claim?"), QMD.indexOf("</details>", QMD.indexOf("Which model would test each claim?")));
  ok(/an estimate built up from equipment/.test(mod) && /A planning model takes that load as an input/.test(mod) && /a matter of records: each battery's commissioning date and its power and energy ratings/.test(mod), "Modeler box: demand from an equipment-based estimate, capacity expansion takes it as input; what entered service from records");
  ok(!/Only if every battery lasts exactly one hour/.test(QMD + JSON.stringify(D)) && /15 GWh would mean an average duration of one hour at full power/.test(QMD) && /15 GWh would mean the fleet averages one hour at full power/.test(D.stories[1].envelope.feedback[0]), "batteries: 15 GWh means a one-hour average, not that every battery lasts one hour (myth and feedback)");
  const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/n01-news-lens.yml"), "utf8");
  ok(!/holds voltage up|held up locally/.test(SIDE + JS + JSON.stringify(D)) && /supplying or absorbing it locally helps keep voltage within safe limits/.test(SIDE) && /Supplying or absorbing \[\[reactive-power\|reactive power\]\] helps keep local voltage within safe limits, neither too low nor too high/.test(D.stories[2].intro), "reactive power: keeps voltage within limits both ways");
  ok(/Its main scenario, the Reference Case, puts/.test(JSON.stringify(D)) && /\[\[tariff\|tariff\]\], its rules for what customers pay/.test(D.stories[0].missing.note), "terms: the Reference Case and tariff are explained where they first appear");
  ok(/Practise on real news · about 15 minutes/.test(QMD), "practice: the independent exercise shows its time");
  // every element of the worked checks and of the step prompts within about 35 words
  const st = M.staticChecks(D), lis = (st.match(/<li>[\s\S]*?<\/li>/g) || []).map(t => words(t.replace(/<[^>]+>/g, " ")));
  ok(lis.length >= 10 && lis.every(n => n <= 36), "fallback: each worked check and ladder element is at most 36 words: " + lis.join(", "));
  ok(/<th scope="col">Sentence<\/th><th scope="col">Verdict<\/th><th scope="col">Why<\/th>/.test(st), "fallback: the spotter answers are a table (sentence, verdict, why), not one long line each");
  stepTexts.forEach((t, i) => ok(words(t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1")) <= 35, `step ${i + 1}: at most 35 words (${words(t)})`));
}

console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
