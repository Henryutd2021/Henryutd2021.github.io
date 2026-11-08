// test_r08-communicating.js — Node tests for research studio R8 (assets/learn/r08-communicating.js and
// data/r08-communicating.json):
//   - the sort: nine findings, three per pile, each with a reason; every number in them recomputed
//   - the three charts from the course's data, recomputed here by independent code: the monthly capacity factors and the
//     truncated-axis ratio; SPP's daily wind means, the cherry-picked window (unique) and the year's range; the average day,
//     its P10–P90 by hour and the year's highest hour; when summer and winter days peak
//   - each chart: one diagnosis that is right, one key fix, the misleading and fixed specs draw what the text says; in all
//     eight fix combinations the title and caption describe what is drawn, and the chart counts as repaired only with its
//     key fix and its title fix; the highest-hour line is in the text version and the label
//   - the writing steps: done only when every form check passes (a draft over 150 words, or without a range, is not)
//   - the briefing says what its ranges mean, what varied, that outcomes outside them remain possible, how a constant
//     60 MW load moves each figure, and why adding separate peaks cannot show the programme's effect
//   - fromR6 equals R6's model, recomputed with R6's own module
//   - the writing checks: every example passes its own checks, an empty text passes none
//   - the no-JS blocks equal the model's (--write rewrites them); text budget; links on allow-listed hosts; scope
// Usage (from the site folder):  node _tests/learn/test_r08-communicating.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const R = require(L("r08-communicating.js"));
const R6 = require(L("r06-uncertainty-properly.js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const D = JSON.parse(fs.readFileSync(L("data/r08-communicating.json"), "utf8"));
const D6 = JSON.parse(fs.readFileSync(L("data/r06-uncertainty-properly.json"), "utf8"));
const CF = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const Y = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const QPATH = path.join(SITE, "learn/r08-communicating.qmd");
const JS = fs.readFileSync(L("r08-communicating.js"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

const C = R.prepare(D, CF, Y), F = R.facts(D, C);
const BLOCKS = {
  "r08-task": () => R.staticTask(D, C),
  "r08-exemplars": () => EX.staticHTML(R.exemplarsSpec(D, F)) + "\n" + R.chartsHTML(D, F) + "\n" + R.boundaryHTML(D),
  "r08-rubric": () => RB.staticHTML(D.rubric.competences) + '\n<p class="lx-eyebrow">Before a result leaves your desk</p>\n<ul>'
    + D.checklist.map(c => "<li><b>" + R.rich(c.label) + ":</b> " + R.rich(c.text) + "</li>").join("") + "</ul>"
};
function between(text, key) {
  const a = text.match(new RegExp("<!-- " + key + ":start[^>]*-->\\n")), b = text.indexOf("<!-- " + key + ":end -->");
  return a && b > a.index ? { from: a.index + a[0].length, to: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); if (!r) throw new Error(k + " markers missing"); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("r08 fallback blocks written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");

// ---------------- independent recomputation of the course data
const t0 = Date.parse(Y.start_utc + "Z") - 3600000, on = Date.UTC(2025, 2, 9, 8), off = Date.UTC(2025, 10, 2, 7);
const days = new Map();
Y.demand.forEach((v, i) => { const ts = t0 + i * 3600000, Lc = new Date(ts + (ts >= on && ts < off ? -5 : -6) * 3600000), k = Lc.toISOString().slice(0, 10);
  if (!days.has(k)) days.set(k, { k, m: Lc.getUTCMonth(), d: [], w: [], h: [] }); const o = days.get(k); o.d.push(v); o.w.push(Y.wind[i]); o.h.push(Lc.getUTCHours()); });
const DAYS = [...days.values()];
ok(DAYS.length === 365 && DAYS[0].k === "2025-01-01" && DAYS[364].k === "2025-12-31", "365 local days of 2025");
ok(DAYS.find(d => d.k === "2025-03-09").d.length === 23 && DAYS.find(d => d.k === "2025-11-02").d.length === 25, "daylight-saving days have 23 and 25 hours");
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
function pct7(v, p) { const s = v.slice().sort((a, b) => a - b), r = (s.length - 1) * p, lo = Math.floor(r); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (r - lo); }
// chart 1
{
  const w = CF.monthly.wind.map(x => x * 100), lo = Math.min(...w), hi = Math.max(...w);
  ok(F.cfLo === "23.1" && F.cfHi === "43.1" && F.monthLo === "September" && F.monthHi === "March" && F.cfYear === "33.8", "EIA 2025: wind from 23.1% (September) to 43.1% (March), 33.8% for the year");
  ok(F.truncRatio === ((hi - 20) / (lo - 20)).toFixed(1) && F.truncRatio === "7.5" && F.realRatio === (hi / lo).toFixed(1) && F.realRatio === "1.9", "truncated at 20%: bars 7.5 times; values 1.9 times");
  const bad = R.spec(D, C, F, "axis", {}), good = R.spec(D, C, F, "axis", { zero: true, scope: true, title: true });
  ok(bad.y.min === 20 && bad.bars.every(b => b.y0 === 20) && good.y.min === 0 && good.bars.every(b => b.y0 === 0), "misleading bars start at 20%, fixed bars at zero");
  ok(Math.abs(bad.heights[2] / bad.heights[8] - (hi - 20) / (lo - 20)) < 1e-9 && good.bars.every(b => b.y1 <= good.y.max) && bad.bars.every(b => b.y1 <= bad.y.max), "drawn heights are the stated ratio; no bar leaves the axis");
  ok(/U\.S\. utility-scale wind fleet, 2025; EIA/.test(good.caption) && good.caption.indexOf(D.charts[0].goodTitle) === 0, "fixed chart names the fleet, the year and the source");
}
// chart 2
{
  const dm = DAYS.map(d => avg(d.w) / 10);
  let best = null, second = null;
  for (let i = 0; i + 13 < dm.length; i++) { const f = dm[i + 13] / dm[i]; if (!best || f < best.f) { second = best; best = { i, f }; } else if (!second || f < second.f) second = { i, f }; }
  ok(C.win.i === best.i && second.f > best.f, "the window: the year's steepest two-week fall, and unique");
  ok(F.winStart === "12 September" && F.winEnd === "25 September" && F.winFall === String(Math.round((1 - best.f) * 100)) && F.winFall === "80", "12 to 25 September 2025: wind fell 80%");
  ok(F.winA === String(Math.round(dm[best.i])) && F.winB === String(Math.round(dm[best.i + 13])), "window's first and last days: " + F.winA + "% and " + F.winB + "%");
  ok(F.dLo === String(Math.round(Math.min(...dm))) && F.dHi === String(Math.round(Math.max(...dm))) && F.dMean === String(Math.round(avg(dm))), "year: daily means " + F.dLo + "% to " + F.dHi + "%, average " + F.dMean + "%");
  ok(Math.abs(avg(dm) - 52.8) < 0.5, "the year's average daily wind matches the shape's mean over max (0.528, cf_targets.json)");
  const bad = R.spec(D, C, F, "window", {}), good = R.spec(D, C, F, "window", { year: true, mark: true, title: true });
  ok(bad.lines[0].pts.length === 14 && good.lines[0].pts.length === 365 && good.spans.length === 1 && good.spans[0].x0 === best.i + 0.5, "misleading: 14 days; fixed: 365 days with the two weeks marked");
  // the fixed chart describes the year's spread and claims no trend either way (a fortnight cannot show one)
  ok(!/no fall|no trend across|no decline/i.test(JSON.stringify(D)) && /cannot show a trend/.test(R.fill(D.findingsStep.fields[1].example, F)) && /swung widely through 2025/.test(D.charts[1].goodTitle), "chart 2: descriptive title and finding, no claim about a year-long trend");
}
// chart 3
{
  const byH = Array.from({ length: 24 }, () => []);
  DAYS.forEach(d => d.d.forEach((v, j) => byH[d.h[j]].push(v / 1000 * 450)));
  const mean = byH.map(avg), p90 = byH.map(v => pct7(v, 0.9)), am = mean.indexOf(Math.max(...mean)), pm = p90.indexOf(Math.max(...p90));
  ok(F.avgPeak === String(Math.round(mean[am])) && F.avgHour === (am < 10 ? "0" : "") + am + ":00" && F.avgPeak === "311" && F.avgHour === "17:00", "the average day peaks at 311 MW at 17:00");
  ok(F.p90Max === String(Math.round(p90[pm])) && F.p90Hour === "16:00" && F.p90Max === "399", "1 day in 10 the 16:00 hour is above 399 MW (P90 by hour, linear interpolation)");
  ok(byH[16].filter(v => v > 398.8).length >= 36 && byH[16].filter(v => v > 398.8).length <= 37, "P90 means about 1 day in 10: " + byH[16].filter(v => v > p90[16]).length + " of 365 days above it");
  ok(F.yearPeak === "450" && F.peakHour === "16:00" && F.peakDay === "29 July", "the year's highest hour: 450 MW at 16:00 on 29 July");
  const sum = DAYS.filter(d => d.m >= 5 && d.m <= 7), win = DAYS.filter(d => d.m === 11 || d.m <= 1), pk = d => d.h[d.d.indexOf(Math.max(...d.d))];
  ok(F.sumDays === String(sum.length) && sum.every(d => pk(d) >= 12 && pk(d) < 18), "all " + sum.length + " June–August days peaked between 12:00 and 18:00");
  ok(F.winMorn === String(win.filter(d => pk(d) < 12).length) && F.winDays === String(win.length) && F.winMorn === "64" && F.winDays === "90", "winter: " + F.winMorn + " of " + F.winDays + " days peaked before noon");
  const good = R.spec(D, C, F, "average", { spread: true, max: true, title: true });
  ok(good.bars.length === 24 && good.bars.every((b, h) => Math.abs(b.y1 - p90[h]) < 1e-9) && good.refs[0].y === 450 && good.bars.every(b => b.y1 <= good.y.max && b.y0 >= good.y.min), "fixed: the P10–P90 band by hour and the 450 MW line, inside the axis");
  ok(good.text.head.join() === "Hour,Average (MW),P10 (MW),P90 (MW)", "chart 3's text version: every column with its unit");
  const top = "Highest hourly demand in 2025: 450 MW, at 16:00 on 29 July.";
  [true, false].forEach(mx => { const sp = R.spec(D, C, F, "average", { spread: true, max: mx }); ok((sp.text.note === top) === mx && (sp.aria.indexOf(top) >= 0) === mx && !/\[\[/.test(sp.aria), "the year's highest hour in the text version and the label exactly when its line is drawn (" + mx + ")"); });
  ok(R.staticTask(D, C).indexOf(top) >= 0, "no-JS chart 3: the highest hour stated beside its table");
}
// every fix combination: the title and caption describe what is drawn; repaired only with the key fix and the title fix
D.charts.forEach(c => {
  const ids = c.fixes.map(f => f.id), kf = R.keyFix(c).id;
  let honest = true, rule = true;
  for (let m = 0; m < 8; m++) {
    const fx = {}; ids.forEach((id, j) => { if (m & (1 << j)) fx[id] = true; });
    const sp = R.spec(D, C, F, c.id, fx), t = R.titleOf(D, F, c, fx);
    if (c.id === "window" && t === R.fill(c.goodTitle, F) && !fx.year) honest = false;                          // a whole-year title over 14 days
    if (c.id === "window" && /2025's windiest hour/.test(sp.caption) && !fx.title) honest = false;
    if (c.id === "average" && /P10–P90/.test(sp.caption) !== !!(fx.spread && fx.title)) honest = false;              // a band named only when drawn
    if (c.id === "average" && /spread across days/.test(t) && !fx.spread) honest = false;
    if (fx.title && t === R.fill(c.badTitle, F)) honest = false;
    if (c.id === "axis" && !!fx.scope !== /EIA, Electric Power Monthly/.test(sp.caption)) honest = false;
    c.options.forEach(o => { const cs = R.chartState(D, F, c, { pick: o.id, fx }); if (cs.done !== !!(fx[kf] && fx.title) || !cs.text || /undefined|\{/.test(cs.text)) rule = false; });
    if (R.chartState(D, F, c, { pick: null, fx }).done) rule = false;
  }
  ok(honest, c.id + ": in all eight fix combinations the title and caption say only what is drawn");
  ok(rule, c.id + ": repaired only with a diagnosis, the key fix and the title fix; feedback written for every state");
});
// every chart: one right diagnosis, one key fix, and the fixes change the drawing
D.charts.forEach(c => {
  ok(c.options.length === 3 && c.options.filter(o => o.verdict === "good").length === 1 && c.options.some(o => o.verdict === "bad"), c.id + ": three diagnoses, one right, one wrong");
  ok(c.fixes.filter(f => f.key).length === 1, c.id + ": one key fix");
  const none = JSON.stringify(R.spec(D, C, F, c.id, {})), key = {}; key[R.keyFix(c).id] = true;
  ok(none !== JSON.stringify(R.spec(D, C, F, c.id, key)), c.id + ": the key fix redraws the chart");
  c.fixes.forEach(f => { const o = {}; o[f.id] = true; ok(JSON.stringify(R.spec(D, C, F, c.id, Object.assign({ year: true }, o))) !== JSON.stringify(R.spec(D, C, F, c.id, { year: true })) || (c.id === "window" && f.id === "year"), c.id + "/" + f.id + ": a fix changes the drawing"); });
});
// ---------------- R6's numbers
{
  const M6 = R6.prepare(D6, Y), F6 = R6.facts(M6);
  ["claim", "c10", "c50", "c90", "f10", "f50", "f90", "fm50", "mHours", "newMW"].forEach(k => ok(D.fromR6[k] === F6[k], "fromR6." + k + " = R6's " + F6[k]));
  ok(String(+F6.f50 - +F6.fm50) === F6.mHours, "the programme's cut: " + F6.f50 + " − " + F6.fm50 + " = " + F6.mHours + " MW (fast uptake, hours added)");
  const pf = R6.study(M6, "fast", "peaks").end.p50, pfm = R6.study(M6, "fast", "peaks", true).end.p50, pc = R6.study(M6, "central", "peaks").end.p50, pcm = R6.study(M6, "central", "peaks", true).end.p50;
  ok(pfm > pf && pcm > pc, "“adding peaks, the same study finds it raises the peak”: true for fast and central uptake");
  const c = R6.study(M6, "central", "hours").end.p50, cm = R6.study(M6, "central", "hours", true).end.p50;
  ok(c - cm > 0 && c - cm < +F6.mHours, "“with central uptake the cut is smaller” (" + (c - cm).toFixed(1) + " MW)");
}
// ---------------- writing checks
{
  D.findingsStep.fields.forEach(f => ok(R.findingChecks(R.fill(f.example, F)).every(c => c.ok), f.id + " example finding passes its checks: " + R.findingChecks(R.fill(f.example, F)).filter(c => !c.ok).map(c => c.label).join("; ")));
  const E = R.briefExample(D, F);
  D.briefing.fields.forEach(f => ok(R.briefChecks(f.id, E[f.id]).every(c => c.ok), f.id + " example passes its checks"));
  ok(D.briefing.fields.map(f => f.id).join() === "decision,finding,programme,depends,leaves,change" && Object.keys(E).length === 6, "the briefing in six parts, the programme's effect a part of its own");
  const pub = R.fill(D.public.example, F);
  ok(R.publicChecks(D, pub).every(c => c.ok) && R.words(pub) <= 150, "public example passes its checks (" + R.words(pub) + " words)");
  // completion only when every check passes
  const fv = {}; D.findingsStep.fields.forEach(f => { fv[f.id] = R.fill(f.example, F); });
  ok(R.findingsState(D, fv).done && R.briefState(D, E).done && R.publicState(D, pub).done, "the examples complete their steps");
  const long = pub + " " + pub.split(" ").slice(0, 60).join(" ");
  ok(R.words(long) > 150 && !R.publicState(D, long).done && /at most 150 words/.test(R.publicState(D, long).open.join()), "a public summary over 150 words is not done, and says why");
  const norange = "Prairie Town's busiest hour could grow a lot by 2035 as more people drive electric cars, and these numbers leave out a large new factory, which would add more to the town's needs.";
  ok(R.words(norange) >= 30 && !R.publicState(D, norange).done && /a range/.test(R.publicState(D, norange).open.join()), "a public summary without a range is not done");
  const fv2 = Object.assign({}, fv, { average: "The average day of Prairie Town peaks at 311 MW at 17:00. On busy days it is far higher than that." });
  ok(!R.findingsState(D, fv2).done, "two sentences in a finding: not done");
  ok(!R.briefState(D, Object.assign({}, E, { finding: "The peak goes up a lot in the future years." })).done, "a briefing finding without a range: not done");
  ok(R.findingChecks("Across the Southwest Power Pool, daily wind output ranged from 13% to 91% of the windiest hour in 2025.").every(c => c.ok), "the place check reads the grid's full name");
  ok(R.findingChecks("").every(c => !c.ok) && R.publicChecks(D, "").every(c => !c.ok) && D.briefing.fields.every(f => R.briefChecks(f.id, "").every(c => !c.ok)), "an empty text passes no check");
  ok(!R.findingChecks("Wind is variable. It changes a lot by the month in 2025 at 30% in SPP.").find(c => c.id === "short").ok, "two sentences fail 'one sentence'");
  ok(!R.publicChecks(D, "The peak is 480 to 535 MW (P10 to P90 of the scenario runs).").find(c => c.id === "plain").ok, "jargon caught in the public version");
  ok(/BRIEFING FOR THE CITY COUNCIL\nThe decision: \(to write\)/.test(R.briefText(D, {}, "")), "the copied text marks empty parts");
}
{ const all = JSON.stringify(D), ex = EX.plain(R.exemplarsSpec(D, F).answers[1]), E = R.briefExample(D, F), fs = R.factsHTML(D, F);
  ok(/about 8 of 10 illustrative model runs/.test(ex) && /about 8 of 10 illustrative model runs/i.test(E.finding) && /about 8 in 10 of 1,000 runs/.test(fs), "the briefing says what its ranges mean");
  ok(/outside the ranges remain possible/.test(ex) && /outside the ranges remain possible/.test(E.leaves) && /outside the ranges remain possible/.test(fs), "outcomes outside the ranges remain possible, said beside them");
  ok(/weather/.test(E.depends) && /varied/.test(E.depends) && /Varied in the runs/.test(fs), "what the runs varied is named");
  ok(!/would add to every number|450 MW today|450 today/.test(all) && /constant 60 MW would raise each 2035 figure by 60 MW/.test(fs + E.leaves), "a constant 60 MW load raises each 2035 figure by 60 MW; the 450 MW is dated 2025");
  ok(/ignores when charging happens, so it cannot show this effect/.test(all) && /ignores timing and misses this/.test(fs), "adding separate peaks: why it cannot show the programme's effect");
  ok(/15,000 electric cars/.test(fs) && /after 23:00/.test(fs) && /\[\[median\|/.test(all) && /\[\[percentile\|/.test(all) && /\[\[capacity-factor\|/.test(all), "central uptake, managed charging, median, P10–P90 and capacity factor explained or marked where they appear");
  ok(/data-term="spp"/.test(PAGE) && /SPP, the Southwest Power Pool/.test(PAGE) && /plants of 1 MW or more/.test(PAGE), "SPP and utility-scale explained on the page");
  ok(/cleaned and normalized series/.test(PAGE) && /frozen wind readings replaced/.test(PAGE) && /cleaned and normalized/.test(D.meta.note), "the processing of the SPP series is disclosed");
  const M6 = R6.prepare(D6, Y), vc = []; const g = require(L("components/core.js")).mulberry32(6);
  for (let i = 0; i < 1000; i++) { const d = { g: 0.004 + g() * 0.012, w: 0.96 + g() * 0.08, kwh: 7 + g() * 6 }; vc.push(R6.peakAt(M6, 10, d, "central", "hours", false)); }
  const sh = vc.filter(v => v > +F.c10 && v < +F.c90).length / 1000;
  ok(Math.abs(sh - 0.8) <= 0.04, "“about 8 of 10”: " + (100 * sh).toFixed(1) + "% of R6's central runs lie between " + F.c10 + " and " + F.c90 + " MW"); }
ok(/R8 practice/.test(D.rubric.title) && /parts R8 practises/.test(D.rubric.lede + D.rubric.competences[0].look) && /six-page paper, which the capstone assesses/.test(D.rubric.lede) && /six-page paper/.test(D.rubric.note) && !D.rubric.bar && /<th scope="col">Proficient \(the bar\)<\/th>/.test(PAGE), "rubric: R8's practice rated apart from the capstone's full bar; the course's level words and 'Proficient (the bar)' kept, as every studio");
ok(D.briefing.facts.length === 4 && R.staticTask(D, C).indexOf(R.factsHTML(D, F)) >= 0 && R.factsHTML(D, F).indexOf(F.c10 + "–" + F.c90 + " MW") >= 0 && R.factsHTML(D, F).indexOf("from " + F.f50 + " to " + F.fm50 + " MW") >= 0, "R6's result sheet: the numbers the briefing needs, also in the no-JS version");
// ---------------- the findings sort
ok(D.bins.map(b => b.id).join() === "holds,missing,over" && D.findings.length === 9 && D.bins.every(b => D.findings.filter(f => f.bin === b.id).length === 3), "nine findings, three per pile");
D.findings.forEach(f => ok(f.why && !/\{/.test(R.fill(f.text, F) + R.fill(f.why, F)), f.id + ": filled, with a reason"));

// ---------------- exemplars, page, blocks
const spec = R.exemplarsSpec(D, F);
ok(EX.validate(spec).length === 0, "exemplars well formed: " + EX.validate(spec).join("; "));
const good = EX.plain(spec.answers[1]);
["Decision:", "Finding:", "Programme:", "Depends on:", "Leaves out:", "Would change it:"].forEach(k => ok(good.indexOf(k) >= 0, "strong briefing has " + k));
ok(good.indexOf(F.c10 + "–" + F.c90 + " MW") >= 0 && good.indexOf("about " + F.mHours + " MW") >= 0, "strong briefing quotes R6's numbers");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(r && PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + ": the page's no-JS block equals the model's (run with --write after a data edit)"); });
{ const brief = PAGE.indexOf('<div class="lx-card lx-studio-brief">'), inter = PAGE.indexOf('<div class="lx-interactive');
  ok(brief >= 0 && brief < inter && /<b>Produce:<\/b>[\s\S]*<b>From:<\/b>[\s\S]*<b>Done when:<\/b>[\s\S]*Communication[\s\S]*About 30 minutes guided here, then about 90 minutes on your own/.test(PAGE.slice(brief, inter)), "the task card sits above the interactive, with the time"); }
ok(/311 MW/.test(PAGE) && /16:00 hour tops 399 MW/.test(PAGE) && /1\.9 times looked like 7\.5 times/.test(PAGE) && /23\.1% to 43\.1%/.test(PAGE) && /33\.8% for the year/.test(PAGE) && /16:00 on 29 July/.test(PAGE), "the page's static numbers equal the model's");
ok(/released 23 October 2026; accessed 2 November 2026/.test(PAGE) && CF.monthly.source.indexOf("released 23 October 2026") >= 0, "EIA table dated as in cf_targets.json");
ok(!/\[\[/.test(R.staticTask(D, C) + R.chartsHTML(D, F) + R.boundaryHTML(D)), "no-JS blocks: glossary marks become term spans");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const urls = (OWN + JSON.stringify(D) + JS).match(/https?:\/\/[^\s"'<>)\\]+/g) || [];
const allowed = /^https:\/\/([\w-]+\.)*(eia\.gov|doi\.org)\//;
ok(urls.every(u => allowed.test(u)), "every link on an allow-listed host: " + urls.filter(u => !allowed.test(u)).join(" "));
ok(!/\bAI\b|artificial intelligence|nuclear|reactor|\bSMR\b|learning[- ](curve|rate)|data[- ]cent/i.test(JSON.stringify(D) + JS + OWN), "no deny-listed or out-of-scope words");
ok(!/Henryutd2021|CF7|cf7-|delay(ed)? energization|NAPS/i.test(JSON.stringify(D) + JS + OWN), "none of the course author's research");

// ---------------- text budget
const words = R.words;
EX.plain(spec.answers[1]).replace(/ \[\d+\]/g, "").split("\n").forEach((l, i) => ok(words(l) <= 35, "strong answer line " + (i + 1) + ": at most 35 words (" + words(l) + ")"));
spec.answers.forEach(a => EX.marks(a).forEach(m => ok(words(m.note) <= 25, a.key + " note " + m.n + ": at most 25 words")));
D.findings.forEach(f => { ok(words(R.fill(f.text, F)) <= 22, f.id + ": a short card"); ok(words(R.fill(f.why, F)) <= 35, f.id + ": reason at most 35 words (" + words(R.fill(f.why, F)) + ")"); });
D.charts.forEach(c => c.options.forEach(o => ok(words(R.fill(o.why, F)) <= 35 && words(o.text) <= 20, c.id + "/" + o.id + ": option and reason within budget")));
D.chartsTable.forEach(r => ["misled", "fix", "finding"].forEach(k => ok(words(R.fill(r[k], F)) <= 25, r.chart + "/" + k + ": at most 25 words")));
D.briefing.facts.forEach(f => ok(words(R.fill(f.v, F)) <= 35, "fact sheet " + f.k + ": at most 35 words (" + words(R.fill(f.v, F)) + ")"));
{ const E = R.briefExample(D, F); Object.keys(E).forEach(k => ok(words(E[k]) <= 35, "briefing example " + k + ": at most 35 words (" + words(E[k]) + ")")); }
D.findingsStep.fields.forEach(f => ok(words(R.fill(f.example, F)) <= 35, f.id + " example finding: at most 35 words"));
D.charts.forEach(c => { for (let m = 0; m < 8; m++) { const fx = {}; c.fixes.forEach((f, j) => { if (m & (1 << j)) fx[f.id] = true; }); const t = R.chartState(D, F, c, { pick: "a", fx }).text; ok(words(t) <= 40, c.id + " chart feedback (" + m + "): at most 40 words (" + words(t) + ")"); } });
(PAGE.match(/<details class="lx-answer">[\s\S]*?<\/details>/g) || []).forEach((a, i) => (a.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []).forEach(p => ok(words(p.replace(/<[^>]+>/g, " ")) <= 35, "myth answer " + (i + 1) + ": each paragraph at most 35 words (" + words(p.replace(/<[^>]+>/g, " ")) + ")")));
(PAGE.slice(PAGE.indexOf('<div class="lx-card lx-studio-brief">'), PAGE.indexOf('<div class="lx-interactive')).match(/<(li|p class="lx-hint")>[\s\S]*?<\/(li|p)>/g) || []).forEach((p, i) => ok(words(p.replace(/<[^>]+>/g, " ")) <= 40, "task card line " + (i + 1) + ": at most 40 words (" + words(p.replace(/<[^>]+>/g, " ")) + ")"));
(PAGE.match(/<div class="lx-deeper-body">[\s\S]*?<\/div>/g) || []).forEach((b, i) => (b.match(/<(li|p)>[\s\S]*?<\/(li|p)>/g) || []).forEach(l => ok(words(l.replace(/<[^>]+>/g, " ")) <= 40, "go deeper " + (i + 1) + ": each item at most 40 words (" + words(l.replace(/<[^>]+>/g, " ")) + ")")));
{ const dn = (PAGE.match(/<p class="lx-datanote">[\s\S]*?<\/p>/) || [""])[0].split(/<br>/).map(r => r.replace(/<[^>]+>/g, " "));
  ok(dn.length >= 3, "data note in labelled rows"); dn.forEach((r, i) => ok(words(r) <= 35, "data note row " + (i + 1) + ": at most 35 words (" + words(r) + ")")); }
{
  const texts = (JS.match(/text: "([^"]+)", build/g) || []).map(t => t.replace(/^text: "/, "").replace(/", build$/, ""));
  ok(texts.length === 4, "four step texts written in full, plus the chart template (" + texts.length + ")");
  ok(/text: "Chart " \+ \(i \+ 1\) \+ " of 3, drawn from the course's own data\. Say what misleads, then apply the fixes and watch it redraw\."/.test(JS), "chart step template");
  texts.concat(["Chart 1 of 3, drawn from the course's own data. Say what misleads, then apply the fixes and watch it redraw."]).forEach((t, i) => ok(words(t) <= 35, "step text " + (i + 1) + ": at most 35 words (" + words(t) + ")"));
}
// path.yml
{ const P = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), row = P.slice(P.indexOf("id: r08-communicating"), P.indexOf("id: r09-integrity-stakeholders"));
  ok(/Sort nine findings/.test(row) && D.findings.length === 9 && /three misleading charts/.test(row) && D.charts.length === 3, "path.yml says what the data hold");
  ok(/after: \[R6\]/.test(row) && /practice_minutes: 90/.test(row) && /minutes: 30/.test(row), "path.yml: prerequisites and minutes as the curriculum row"); }

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
