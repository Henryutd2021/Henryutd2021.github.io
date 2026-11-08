// test_ck-f-estimate.js — Node tests for CK-F (assets/learn/ck-f-estimate.js and assets/learn/data/ck-f-estimate.json):
//   - the two charts are real SPP shapes cut and scaled as in lesson 0 (town_year.json, town_days.json); the facts the
//     chart tasks rely on (peak, low, ratio, forecast misses)
//   - every auto-marked answer follows from its sourced inputs (cf_targets.json for capacity factors; EIA home use)
//   - the checks (choice, order, number with units, estimate) and the level rule, on made-up attempts
//   - the worked solution's numbers (two routes, homes, share of the town, daily energy) as printed on the page
//   - the copied summary carries the course's checkpoint measures (first try, tries, time to first answer, solution opened
//     first)
//   - the no-JS version of the nine tasks on the page equals staticTasks() (write it with --write after a data edit)
//   - the always-visible rubric gives no numbers from the answer; task texts stay within the text budget
// Usage (from the site folder):  node _tests/learn/test_ck-f-estimate.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const C = require(L("ck-f-estimate.js"));
const CPK = require(L("components/checkpoint.js"));
const D = JSON.parse(fs.readFileSync(L("data/ck-f-estimate.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const days = JSON.parse(fs.readFileSync(L("data/town_days.json"), "utf8"));
const cf = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const QPATH = path.join(SITE, "learn/ck-f-estimate.qmd");
const MK = [/<!-- ckf-fallback:start[^>]*-->\n/, "<!-- ckf-fallback:end -->"];
if (process.argv.includes("--write")) {
  const q = fs.readFileSync(QPATH, "utf8"), a = q.match(MK[0]), b = q.indexOf(MK[1]);
  if (!a || b < a.index) throw new Error("ckf-fallback markers missing");
  fs.writeFileSync(QPATH, q.slice(0, a.index + a[0].length) + C.staticTasks(D) + "\n" + q.slice(b));
  console.log("ckf-fallback block written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(L("ck-f-estimate.js"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const T = id => C.task(D, id);
const opt = (t, v) => t.options.find(o => o[0] === v)[1];
const num = s => parseFloat(String(s).replace(/,/g, ""));

// ---------------- charts: lesson 0's cut (index i = hour ending at start_utc + i; local = UTC + offset) and scaling
const dec = D.charts.dec, t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(dec.date + "T00:00:00Z");
const i0 = Math.round((d0 - t0) / 3600000) + 1 - dec.utcOffsetHours;
const cut = year.demand.slice(i0, i0 + 24).map(v => Math.round(v / 1000 * dec.peakMW));
ok(JSON.stringify(cut) === JSON.stringify(dec.demand), "December chart = town_year.json, 15 Dec 2025, scaled to 450 MW");
const pk = Math.max(...dec.demand), lo = Math.min(...dec.demand);
ok(pk === 347 && dec.demand.indexOf(pk) === 7 && lo === 282 && dec.demand.indexOf(lo) === 14 && dec.demand[15] === 282, "December: peak 347 MW at 07:00, low 282 MW at 14:00 and 15:00");
ok(near(pk / lo, 1.23, 0.005) && Math.max(...dec.demand.slice(17)) < pk, "December: about a quarter above the low; the evening hump is lower");
ok(lo > dec.yMin && pk < dec.yMax && near((pk - dec.yMin) / (lo - dec.yMin), 4, 0.05), "December: on the truncated axis the peak looks about 4 times the low");
const ws = days.days[D.charts.fc.day];
ok(ws.date === D.charts.fc.date, "forecast chart is the windy_spring day");
ok(JSON.stringify(ws.demand.map(v => Math.round(v / 1000 * 450))) === JSON.stringify(D.charts.fc.demand) && JSON.stringify(ws.forecast.map(v => Math.round(v / 1000 * 450))) === JSON.stringify(D.charts.fc.forecast), "forecast chart = town_days.json scaled");
const miss = D.charts.fc.demand.map((v, t) => v - D.charts.fc.forecast[t]);
ok(miss.filter(x => x > 0).length === 19 && Math.max(...miss) === 6 && miss[13] === 6 && miss[14] === 6, "forecast: actual above forecast in 19 of 24 hours, largest miss 6 MW at 13:00 and 14:00");
ok(near(6 / D.charts.fc.demand[14], 0.02, 0.002) && Math.min(...miss) >= -1, "forecast: largest miss about 2% of demand; never more than 1 MW too high");
ok(new Date(dec.date + "T12:00:00Z").getUTCDay() === 1 && new Date(D.charts.fc.date + "T12:00:00Z").getUTCDay() === 4, "labels: Monday 15 December, Thursday 17 April");

// ---------------- answers follow from the inputs
const t1 = T("t1-units"), day = t1.homeKWh / 365;
ok(Math.abs(num(opt(t1, "c")) - day * 1000 / t1.phoneWh) / num(opt(t1, "c")) < 0.02, "task 2: about 2,000 charges a day");
ok(near(num(opt(t1, "a")), Math.round(day / t1.phoneWh)) && Math.abs(num(opt(t1, "b")) - day / 24 * 1000 / t1.phoneWh) < 3 && Math.abs(num(opt(t1, "d")) - t1.homeKWh * 1000 / t1.phoneWh) / num(opt(t1, "d")) < 0.01, "task 2: the distractors are the kWh slip, one hour and one year");
ok(t1.homeKWh === 10791, "home use 10,791 kWh (EIA)");
const t5 = T("t5-cf");
ok(t5.cf === cf.targets.wind.cf && near(t5.answer.mwh, t5.mw * 8760 * t5.cf, 1e-6), "task 6: 50 MW x 8,760 h x 0.338 = 148,044 MWh, cf from cf_targets.json");
ok(C.checkNumeric(t5, 148, "GWh").right && C.checkNumeric(t5, 150000, "MWh").right && !C.checkNumeric(t5, 438000, "MWh").right && C.checkNumeric(t5, 148, "MW").power, "task 6: GWh and MWh accepted within 10%, the nameplate answer and MW rejected");
const n1 = T("n1-headline"), homes = n1.mw * 8760 * n1.cf * 1000 / n1.homeKWh;
ok(n1.cf === cf.targets.solar.cf && Math.abs(num(opt(n1, n1.answer)) - homes) / homes < 0.05, "task 8: about 20,000 homes (" + Math.round(homes) + ")");
ok(Math.round(n1.mw * 8760 / (n1.homeKWh / 1000) / 1000) === 81 && n1.why.c.indexOf("about 81,000") >= 0 && n1.solution.indexOf("about 81,000") >= 0 && n1.solution.indexOf("19,500") >= 0,
  "task 8: the headline's 100,000 exceeds even full output (about 81,000 homes); 19,500 at the capacity factor");
const t2 = T("t2-chart"), t4 = T("t4-forecast"), t6 = T("t6-jobs");
ok(!/heating|morning rush/.test(t2.solution), "task 3: the chart's peak is stated, not explained by causes the data cannot show");
const tEx = T("t0-explain");
ok(/stored energy/.test(tEx.points[0]) && /controls/.test(tEx.points[1]) && !/runs ahead/.test(tEx.points.join(" ") + tEx.solution), "task 1: frequency shows a gap; inertia covers the first seconds; controls restore balance, then 60 Hz");
ok(/available and has fuel/.test(t6.prompt) && /operating limits/.test(t6.why.b) && !/whatever the weather/.test(t6.why.b + t6.solution), "task 7: the scenario states availability and fuel; firm output still has limits");
[t1, t2, t4, t6, n1].forEach(t => ok(C.checkChoice(t, t.answer).right && t.options.every(o => o[0] === t.answer || !C.checkChoice(t, o[0]).right) && t.options.every(o => t.why[o[0]]), t.id + ": one right option, feedback for each"));
const t3 = T("t3-order");
ok(!C.checkOrder(t3, t3.start).right && C.checkOrder(t3, t3.items.map(x => x[0])).right && C.checkOrder(t3, ["fall", "gov", "back", "agc"]).n === 2, "task 4: the shuffled start is wrong, the sequence right, partial credit shown");

// ---------------- the estimate and the worked solution
const es = T("est-buses"), w = C.worked(D);
ok(near(w.A[0], 234) && near(w.A[1], 414) && near(w.B[0], 366.1840) && near(w.B[1], 647.8640), "worked: route A 234-414 MWh, route B 366-648 MWh");
ok(es.range[0] === Math.round(w.lo) && es.range[1] === Math.round(w.hi) && es.show[0] <= es.range[0] && es.show[1] >= es.range[1] - 0, "worked: range 234-648 MWh shown as about 230-650");
ok(Math.round(w.mid / 10) * 10 === 440 && Math.round(w.homes) === 41 && near(w.share * 100, 0.02, 0.005) && near(w.daily, 115, 1e-9), "worked: about 440 MWh, 41 homes, 0.02% of the town, 115 kWh a day");
const townGWh = year.demand.reduce((a, b) => a + b, 0) / 1000 * 450 / 1000;
ok(Math.round(townGWh) === D.worked.townGWh, "Prairie Town's year: about " + Math.round(townGWh) + " GWh");
ok(near(D.worked.routeB.milesPerYear * D.worked.buses, 281680) && D.worked.routeA.milesPerDay * D.worked.routeA.days * D.worked.buses === 180000, "worked: 281,680 and 180,000 miles");
ok(near(D.worked.routeB.milesPerYear / (D.worked.routeA.milesPerDay * D.worked.routeA.days), 1.6, 0.05), "worked: route B's miles about 1.6 times route A's");
let e = C.checkEstimate(es, 300, 600, "MWh per year");
ok(e.unitsOk && e.overlaps && e.ordered, "estimate: 300-600 MWh a year overlaps");
e = C.checkEstimate(es, 300, 600, "kW"); ok(!e.unitsOk && /power/.test(e.unitMsg), "estimate: kW flagged as power");
e = C.checkEstimate(es, 3, 6, "GWh per year"); ok(e.unitsOk && !e.overlaps && /above/.test(e.rangeMsg), "estimate: 3-6 GWh lies above");
e = C.checkEstimate(es, 20, 40, "MWh per year"); ok(!e.overlaps && /below/.test(e.rangeMsg), "estimate: 20-40 MWh lies below");
e = C.checkEstimate(es, 50, 900, "MWh per year"); ok(e.overlaps && /ten times/.test(e.rangeMsg), "estimate: a very wide range is flagged");
e = C.checkEstimate(es, 600, 300, "MWh per year"); ok(!e.ordered, "estimate: low above high is flagged");
ok(PAGE.indexOf("440 MWh = 440,000 kWh; 440,000 ÷ 10,791") >= 0 && PAGE.indexOf("usable energy") >= 0 && PAGE.indexOf("on sale") < 0, "worked: the kWh conversion is shown; battery size is a plausibility check, not route feasibility");
ok(PAGE.indexOf("so their overlap does not check it") >= 0 && PAGE.indexOf("Two independent routes") < 0, "worked: the two routes share energy per mile, and the page says so");
["234,000 to 414,000 kWh", "366,000 to 648,000 kWh", "281,680 miles", "180,000 miles", "230 to 650 MWh", "440 MWh", "41 average", "2,470 GWh", "0.02%", "115 kWh", "14,084", "10,791", "1.26–1.58", "2.3 kWh", "1.6 times"].forEach(s => ok(PAGE.indexOf(s) >= 0, "page states " + s));

// ---------------- level rule and summary
const autoIds = D.tasks.filter(t => ["choice", "order", "numeric"].indexOf(t.kind) >= 0).map(t => t.id);
ok(autoIds.length === D.rule.auto && D.tasks.length === 9, "7 auto-marked tasks, 9 in all");
function state(k, rating, pts) {
  const s = { version: D.version, started: "2026-11-03T10:00:00Z", finished: "2026-11-03 10:40", cur: 8, tasks: {} };
  autoIds.forEach((id, i) => { s.tasks[id] = { ms: 60000, msFirst: 45000, tries: i < k ? 1 : 2, first: i < k, solFirst: false }; });
  s.tasks["t0-explain"] = { ms: 90000, msFirst: 80000, tries: 1, first: pts, points: [pts, pts], answer: "The grid stores almost nothing; frequency shows a gap." };
  s.tasks["est-buses"] = { ms: 900000, msFirst: 700000, tries: 1, first: true, answer: { low: 300, high: 600, unit: "MWh per year", reasoning: "20 x 60 mi x 180 d x 1.5", uncertainty: "kWh per mile", check: "homes" }, check: { overlaps: true }, rating: rating };
  return s;
}
const P = { units: "Proficient", range: "Proficient", uncertainty: "Proficient", check: "Proficient" };
ok(C.level(D, state(5, P, true)).level === "Proficient", "level: 5 of 7, all Proficient, both points -> Proficient");
ok(C.level(D, state(4, P, true)).level === "Developing", "level: 4 of 7 -> Developing");
ok(C.level(D, state(7, P, false)).level === "Developing", "level: explanation missing a point -> Developing");
ok(C.level(D, state(6, { units: "Strong", range: "Strong", uncertainty: "Proficient", check: "Proficient" }, true)).level === "Strong", "level: 6 of 7 and two Strong -> Strong");
ok(C.level(D, state(7, { units: "Proficient", range: "Developing", uncertainty: "Proficient", check: "Proficient" }, true)).level === "Developing", "level: one criterion Developing -> Developing");
ok(C.level(D, state(2, P, true)).level === "Not yet", "level: 2 of 7 -> Not yet");
ok(!C.level(D, { version: D.version, tasks: {} }).complete && C.level(D, { version: D.version, tasks: {} }).level === "Not yet", "level: an empty attempt is Not yet and incomplete");
const sum = C.summary(D, state(5, P, true), { width: 375 });
ok(/Level by the published rule: Proficient/.test(sum) && /5 of 7/.test(sum), "summary: level and count");
ok(sum.split("\n").filter(l => /^\d \| /.test(l)).length === 9 && /\| 45 s \| 1 min 00 s \| no$/m.test(sum), "summary: one row per task with time to first answer, time on task and solution-first");
ok(/Estimate: 300 to 600 MWh per year · overlaps/.test(sum) && /Self-rating: units Proficient/.test(sum) && /Screen width 375 px/.test(sum), "summary: the estimate, the self-rating and the screen width");
ok(C.fmtMs(45000) === "45 s" && C.fmtMs(125000) === "2 min 05 s" && C.fmtMs(null) === "–", "time format");
ok(/version/.test(D.version) === false && /ck-f v1/.test(D.version), "results carry the checkpoint version");

// ---------------- the rubric is answer-independent before submission; the no-JS tasks; text budget; the copied summary
{
  const rub = PAGE.slice(PAGE.indexOf('<table id="ckf-rubric"'), PAGE.indexOf("</table>", PAGE.indexOf('<table id="ckf-rubric"')));
  ok(rub.length > 100 && !/\b(230|650|234|648|440)\b/.test(rub), "rubric: no numbers from the worked answer in the always-visible rubric");
  const a = PAGE.match(MK[0]), b = PAGE.indexOf(MK[1]);
  ok(a && b > a.index && PAGE.slice(a.index + a[0].length, b) === C.staticTasks(D) + "\n", "fallback: the page's no-JS tasks equal staticTasks() (run with --write after a data edit)");
  const st = C.staticTasks(D);
  ok(D.tasks.every(t => st.indexOf(t.prompt.replace(/&/g, "&amp;")) >= 0) && (st.match(/<summary>Worked solution, task/g) || []).length === 8 && (st.match(/<tr><td>\d\d:00<\/td>/g) || []).length === 48, "fallback: nine prompts, eight closed solutions, two 24-hour chart tables");
  const words = s => s.trim().split(/\s+/).length, sents = s => (s.match(/[.!?](\s|$)/g) || []).length;
  D.tasks.forEach(t => {
    ok(words(t.prompt) <= 40, t.id + ": prompt at most 40 words (" + words(t.prompt) + ")");
    if (t.solution) ok(words(t.solution) <= 40 && sents(t.solution) <= 2, t.id + ": solution at most two sentences and 40 words (" + words(t.solution) + ")");
  });
  ok(/includes what you typed/.test(JS) && /includes what you typed/.test(PAGE), "summary: the intro and the data note tell testers the copied summary includes what they typed");
  ok(!/forms\.|docs\.google|typeform|<a [^>]*form/i.test(PAGE + JS), "summary: no form link on the page");
}

// ---------------- the pass rule before the tasks; early opening; first submissions; scale against checks; purchases
{
  const before = PAGE.slice(0, PAGE.indexOf('<div class="lx-interactive"'));
  ok(/How it is marked, before you start/.test(before) && /<b>Proficient:<\/b> at least 5 of the 7 auto-marked tasks right on the first try, both points of task 1, and Proficient or better on all four estimate criteria\./.test(before) &&
    /Opening a solution early:<\/b> that task counts as not right/.test(before), "the pass rule and the early-opening rule are stated before the tasks, with and without JavaScript");
  ok(D.rule.openFirst === "not-right", "rule: a task whose worked solution was opened first counts as not right");
  const early = state(7, { units: "Strong", range: "Strong", uncertainty: "Strong", check: "Strong" }, true);
  early.tasks["t5-cf"].solFirst = true; early.tasks["t0-explain"].solFirst = true;
  const LE = C.level(D, early);
  ok(LE.auto === 6 && !LE.explainOk && LE.level === "Developing", "solution opened first: that auto task not right, task 1 no points (" + LE.level + ")");
  early.tasks["t0-explain"].solFirst = false; early.tasks["est-buses"].solFirst = true;
  ok(C.level(D, early).estMin === -1 && C.level(D, early).level === "Not yet", "the estimate opened first: its self-ratings do not count");
  ok(T("t0-explain").freeze === true && T("est-buses").freeze === true && D.tasks.filter(t => t.freeze).length === 2, "the two written tasks keep their first submission");
  const sum2 = C.summary(D, Object.assign(state(5, P, true), {}), {}), long = state(5, P, true);
  long.tasks["est-buses"].answer.reasoning = "x ".repeat(700) + "END"; long.tasks["t0-explain"].answer = "y ".repeat(500) + "LAST";
  const s3 = C.summary(D, long, {});
  ok(/END$/m.test(s3) && /LAST$/m.test(s3) && /a comparison, not a mark/.test(sum2), "the copied summary keeps the texts in full, and calls the range comparison what it is");
  ok(CPK.solLeaks(D).length === 0 && CPK.openProblems(D).length === 0, "no worked solution names another task's answer");
  const visible = PAGE.slice(PAGE.indexOf("::: {#sources"));
  ok(!/14,084|1\.26–1\.58|under 100 to over 300/.test(visible) && /14,084 miles/.test(PAGE.slice(PAGE.indexOf('id="ckf-solution-body"'), PAGE.indexOf("::: {#rubric"))),
    "the bus inputs (miles, energy per mile, battery sizes) are in the gated worked solution, not the always-visible sources table");
  ok(/Scale, not a check: homes/.test(PAGE) && /Scale, not a check: the town/.test(PAGE) && !/Check with homes|Check with the town/.test(PAGE) && /gives scale, not a check/.test(PAGE), "comparisons with homes and the town are scale, not independent checks");
  ok(!/only the spinning machines/.test(JSON.stringify(D)) && /a fast reserve such as a battery/.test(T("t0-explain").points[0]), "task 1 accepts other fast responses, not only spinning machines");
  ok(/buys about 10,800 kWh/.test(T("t1-units").prompt) && /yearly purchases does it equal/.test(T("n1-headline").prompt) && !/home's use|yearly use/.test(JSON.stringify(D.tasks)), "home figures are purchases, as EIA defines them");
  ok(/\[\[capacity-factor\|/.test(T("t5-cf").solution) && /\[\[firm-capacity\|/.test(T("t6-jobs").solution) && /\[\[peaker\|/.test(T("t6-jobs").solution) && !/\[\[/.test(C.staticTasks(D)), "the feedback marks its terms; the no-JS list shows them as terms, not raw marks");
  const words = x => x.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const notes = [...PAGE.matchAll(/<p class="lx-datanote">[\s\S]*?<span>([\s\S]*?)<\/span><\/p>/g)].map(m => m[1]);
  const bullets = [...PAGE.slice(PAGE.indexOf('id="ckf-solution-body"'), PAGE.indexOf("::: {#rubric")).matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]);
  ok(notes.length === 3 && notes.every(x => words(x) <= 35) && bullets.every(x => words(x) <= 40), "the data notes and the worked solution's bullets stay within the text budget: " + notes.map(words).join(", ") + " / max " + Math.max(...bullets.map(words)));
}

// ---------------- sources: every source URL is on the allow-list hosts used by Learn
Object.values(D.sources).forEach(s => ok(/^https:\/\/(www\.)?(eia\.gov|afdc\.energy\.gov|epa\.gov)\//.test(s.url) && s.asOf, "source " + s.url));

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
