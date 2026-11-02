// test_ck-f-estimate.js — Node tests for CK-F (assets/learn/ck-f-estimate.js and assets/learn/data/ck-f-estimate.json):
//   - the two charts are real SPP shapes cut and scaled as in lesson 0 (town_year.json, town_days.json); the facts the
//     chart tasks rely on (peak, low, ratio, forecast misses)
//   - every auto-marked answer follows from its sourced inputs (cf_targets.json for capacity factors; EIA home use)
//   - the checks (choice, order, number with units, estimate) and the level rule, on made-up attempts
//   - the worked solution's numbers (two routes, homes, share of the town, daily energy) as printed on the page
//   - the copied summary carries the W1 measures (first try, tries, time to first answer, solution opened first)
// Usage (from the site folder):  node _tests/learn/test_ck-f-estimate.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const C = require(L("ck-f-estimate.js"));
const D = JSON.parse(fs.readFileSync(L("data/ck-f-estimate.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const days = JSON.parse(fs.readFileSync(L("data/town_days.json"), "utf8"));
const cf = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const PAGE = fs.readFileSync(path.join(SITE, "learn/ck-f-estimate.qmd"), "utf8");
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
const t2 = T("t2-chart"), t4 = T("t4-forecast"), t6 = T("t6-jobs");
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

// ---------------- sources: every source URL is on the allow-list hosts used by Learn
Object.values(D.sources).forEach(s => ok(/^https:\/\/(www\.)?(eia\.gov|afdc\.energy\.gov|epa\.gov)\//.test(s.url) && s.asOf, "source " + s.url));

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
