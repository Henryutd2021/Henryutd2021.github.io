// test_b02-python-data.js — Node tests for lesson B2 (assets/learn/b02-python-data.js), its data files and notebook,
// and every number the page states. The pandas results quoted here were produced by running
// learn/notebooks/b02-python-data.ipynb (pandas 2.3 and 3.1); the notebook's own assert cells check the same numbers.
// Usage (from the site folder):  node _tests/learn/test_b02-python-data.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/b02-python-data.js"));
const J = f => JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data", f), "utf8"));
const RAWF = J("b02-python-data.json"), YEAR = J("town_year.json"), DAYS = J("town_days.json"), TOWN = J("town.json");
const QMD = fs.readFileSync(path.join(SITE, "learn/b02-python-data.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/b02-python-data.js"), "utf8");
const NB = JSON.parse(fs.readFileSync(path.join(SITE, "learn/notebooks/b02-python-data.ipynb"), "utf8"));
const NBSRC = NB.cells.map(c => c.source.join("")).join("\n");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = s => QMD.indexOf(s) >= 0;
const words = s => s.trim().split(/\s+/).length;
const int = v => Math.round(v).toLocaleString("en-US");

const R = M.frame(RAWF), C = M.frame(YEAR), P = M.prairie(TOWN, YEAR);

// ---------------- data files: same hours, raw is raw
ok(R.n === 8760 && C.n === 8760 && RAWF.start_utc === YEAR.start_utc, "data: both files hold the same 8,760 hours");
["demand", "wind", "solar"].forEach(k => {
  ok(RAWF[k].every(v => Number.isInteger(v) && v >= 0), `raw ${k}: whole MW, none missing, none negative`);
  const mx = Math.max(...RAWF[k]);
  let close = 0; for (let i = 0; i < 8760; i++) if (Math.abs(Math.round(RAWF[k][i] / mx * 1000) - YEAR[k][i]) <= 1) close++;
  ok(close > 8760 * 0.8, `raw ${k}: most hours equal the cleaned shape x the 2025 maximum (${close}); the rest are the repaired hours`);
});
ok(RAWF.meta.files.map(f => f.sha256).join() === YEAR.meta.files.map(f => f.sha256).join(), "data: raw extract and cleaned shapes come from the same two EIA files (checksums)");
ok(/eia\.gov/.test(RAWF.meta.source_url) && RAWF.meta.accessed && /public domain/.test(RAWF.meta.license), "data: source, access date and licence recorded");

// ---------------- time: the local-time rule equals the ICU database for every hour
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" });
let tzBad = 0;
for (let i = 0; i < R.n; i++) {
  const ms = M.beginning(R, i), L = M.local(ms), p = {};
  fmt.formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
  if (L.date !== `${p.year}-${p.month}-${p.day}` || L.h !== +p.hour) tzBad++;
}
ok(tzBad === 0, `time: local Central time matches the ICU database for all 8,760 hour starts (${tzBad} mismatches)`);
const b = M.dstBounds(2025);
ok(new Date(b[0]).toISOString() === "2025-03-09T08:00:00.000Z" && new Date(b[1]).toISOString() === "2025-11-02T07:00:00.000Z", "time: 2025 daylight saving from 9 March to 2 November");
const ue = M.hoursPerDay(R, "utc-end"), le = M.hoursPerDay(R, "local-end"), ls = M.hoursPerDay(R, "local-start");
ok(JSON.stringify(ue.odd) === '[["2025-01-01",17],["2026-01-01",7]]', "time: grouped by UTC date, the first and last days are fragments (17 h, 7 h)");
ok(JSON.stringify(le.odd) === '[["2025-01-01",23],["2025-03-09",23],["2025-11-02",25],["2026-01-01",1]]', "time: hour-ending stamps put the last hour of each day on the next");
ok(ls.days === 365 && ls.hist[24] === 363 && JSON.stringify(ls.odd) === '[["2025-03-09",23],["2025-11-02",25]]', "time: local, hour start: 363 x 24 h, 9 March 23 h, 2 November 25 h (pandas: {24: 363, 23: 1, 25: 1})");

// ---------------- inspect: pandas describe() values
const dD = M.describe(R.cols.demand);
ok(dD.count === 8760 && near(dD.mean, 34187.0314, 1e-3) && near(dD.std, 5641.7157, 1e-3) && dD.min === 1505 && dD.q25 === 30306.5 && dD.q50 === 33081.5 && dD.q75 === 37433 && dD.max === 54411,
  "describe: demand matches pandas (mean 34,187.0, std 5,641.7, min 1,505, quartiles 30,306.5 / 33,081.5 / 37,433, max 54,411)");
const sp = M.local(M.beginning(R, dD.argmin)), pk = M.local(M.beginning(R, dD.argmax));
ok(sp.date === "2025-06-21" && dD.min < 0.05 * dD.q50, "inspect: the 1,505 MW hour is on 21 June, under 5% of the median");
ok(R.cols.demand[dD.argmin - 1] === 34934 && R.cols.demand[dD.argmin + 1] === 34024, "inspect: the spike sits between 34,934 and 34,024 MW");
ok(pk.date === "2025-07-29" && (dD.max / 1000).toFixed(1) === "54.4" && dD.max / 1000 === DAYS.stats.peak_demand_GW * 1000 / 1000 + (dD.max / 1000 - DAYS.stats.peak_demand_GW), "inspect: SPP's peak 54.4 GW on 29 July");
ok(near(DAYS.stats.peak_demand_GW, 54.4, 1e-9), "inspect: the data build's peak is 54.4 GW");

// ---------------- repeats: the reader's count equals the data build's at N = 3, and only there for solar
ok(M.flagged(R.cols.wind, 3) === DAYS.stats.frozen_hours_filled.wind && DAYS.stats.frozen_hours_filled.wind === 671, "repeats: wind 671 at N = 3 = data build");
ok(M.flagged(R.cols.solar, 3) === DAYS.stats.frozen_hours_filled.solar && DAYS.stats.frozen_hours_filled.solar === 1377, "repeats: solar 1,377 at N = 3 = data build");
ok(M.flagged(R.cols.solar, 2) === 1515 && M.flagged(R.cols.solar, 4) === 1230 && M.flagged(R.cols.wind, 2) === 681, "repeats: N = 2 and 4 do not match (pandas: solar 1,515 and 1,230; wind 681)");
ok(M.flagged(R.cols.demand, 3) + 1 === DAYS.stats.demand_hours_flagged_as_implausible, "repeats: demand repeats + the spike = the build's 699 flagged demand hours");
[2, 3, 5, 12].forEach(n => ["demand", "wind", "solar"].forEach(k => {
  const rs = M.runs(R.cols[k], n), m = M.mask(R.cols[k], n);
  ok(rs.every(r => r.len >= n && r.value !== 0) && m.filter(Boolean).length === M.flagged(R.cols[k], n), `repeats ${k} N=${n}: runs, mask and count agree`);
}));
ok(M.runs([0, 0, 0, 5, 5, 5, 5, 2, 2, 2], 3).map(r => r.len).join() === "4,3", "repeats: zeros never count; edge runs at the end count");
ok(M.longestRun([]) === 0 && M.flagged([7], 1) === 1, "repeats: empty and one-value series");

// ---------------- the December run
const lr = M.runs(R.cols.solar, 3).reduce((a, r) => !a || r.len > a.len ? r : a, null), A0 = M.local(M.beginning(R, lr.start)), A1 = M.local(M.beginning(R, lr.start + lr.len - 1));
ok(lr.len === 155 && lr.value === 617 && A0.date === "2025-12-15" && A0.h === 13 && A1.date === "2025-12-21" && A1.h === 23, "plot: longest run 155 h at 617 MW, 15 Dec 13:00 to 21 Dec 23:00 local");
ok(["demand", "wind"].every(k => M.longestRun(R.cols[k]) === 155), "plot: demand and wind are frozen for the same 155 hours");
ok(Math.floor(lr.len / 24) === 6, "plot: 'six nights'");
ok(M.runs(R.cols.solar, 3).some(r => r.start === lr.start + lr.len), "plot: a second run follows straight after (as the page says)");

// ---------------- physics: solar at night
const nbR = M.nightBad(R, R.cols.solar), nbC = M.nightBad(C, C.cols.solar), mR = M.mask(R.cols.solar, 3), cl = M.cluster(C, nbC);
ok(nbR.length === 214 && nbR.filter(i => mR[i]).length === 198, "night: raw 214 hours, 198 already flagged as repeats (pandas: 214, 198)");
ok(nbC.length === 0 && cl === null, "night: the cleaned file has no failing hour (the data build's night rule; pandas: 0)");
let wob = 0; for (let i = 0; i < 8760; i++) { const L = M.local(M.beginning(R, i)); if (((L.m === 2 && L.d >= 20) || (L.m === 3 && L.d <= 14)) && L.h === 12 && R.cols.solar[i] < 300) wob++; }
ok(wob >= 20, "night: in that window raw solar at noon stays under 300 MW, barely different from night ('barely changed between day and night')");

// ---------------- resample, duration, capacity factor (Prairie Town, cleaned shapes)
ok(P.sizes.wind === 150 && P.sizes.solar === 200 && P.sizes.demand === 450, "Prairie Town: 150 MW wind, 200 MW solar, 450 MW peak (town.json, as in lesson 0)");
const mw = M.resample(C, P.wind, "month", "sum"), dw = M.resample(C, P.wind, "day", "mean");
ok(mw.length === 12 && dw.length === 365 && mw.reduce((s, x) => s + x.hours, 0) === 8760, "resample: 12 months, 365 days, 8,760 hours");
ok(mw[2].hours === 743 && mw[10].hours === 721, "resample: March has 743 hours and November 721 (daylight saving)");
ok(near(mw.reduce((s, x) => s + x.value, 0), P.wind.reduce((s, v) => s + v, 0), 1e-6), "resample: monthly energy sums to the year's energy");
const best = mw.reduce((a, x) => x.value > a.value ? x : a), worst = mw.reduce((a, x) => x.value < a.value ? x : a);
ok(best.key === "2025-03" && (best.value / 1000).toFixed(1) === "70.7" && worst.key === "2025-09" && (worst.value / 1000).toFixed(1) === "45.1", "resample: most in March (70.7 GWh), least in September (45.1 GWh) (pandas: same)");
ok(dw.every(x => x.value >= 0 && x.value <= 150), "resample: daily means within 0-150 MW");
const sd = M.sortedDesc(P.demand);
ok(sd.every((v, i) => i === 0 || v <= sd[i - 1]) && sd[0] === 450, "duration: sorted from highest to lowest, starting at the 450 MW peak");
ok(M.hoursAbove(P.demand, 0.9 * 450) === 180 && M.hoursAbove(P.demand, 0.95 * 450) === 54, "duration: 180 hours above 90% and 54 above 95% (pandas: 180)");
const cfW = M.capacityFactor(P.wind, 150), cfS = M.capacityFactor(P.solar, 200);
ok((cfW * 100).toFixed(1) === "52.8" && (cfS * 100).toFixed(1) === "23.4", "capacity factor: wind 52.8%, solar 23.4% (pandas: same; was 23.5% before the data build's sun-position night rule)");
ok(near(cfW, YEAR.wind.reduce((s, v) => s + v, 0) / 8760 / 1000, 1e-12), "capacity factor: equals the mean shape (the farm is sized at SPP's best hour)");

// ---------------- flagged hours per local day (the repeats chart): days follow local dates, not blocks of 24 rows
const pdS = M.perDay(R, M.mask(R.cols.solar, 3));
ok(pdS.keys.length === 365 && pdS.n.reduce((s, x) => s + x, 0) === 1377, "per day: 365 local days, 1,377 flagged solar hours in all");
ok(pdS.n[pdS.keys.indexOf("2025-03-09")] === 13 && pdS.keys[0] === "2025-01-01" && pdS.keys[364] === "2025-12-31", "per day: 9 March (23 hours) holds 13 flagged solar hours, as local dates say");
let blocks = 0; for (let d = 0; d < 365; d++) { let b = 0; for (let h = d * 24; h < d * 24 + 24; h++) if (M.mask(R.cols.solar, 3)[h]) b++; if (b !== pdS.n[d]) blocks++; }
ok(blocks > 0 && !/Math\.floor\(\(i\) \/ 24\)/.test(JS) && /perDay\(R, m\)/.test(JS), `per day: blocks of 24 rows would misplace ${blocks} days; the page uses local dates`);

// ---------------- the row check sees a short column (malformed input)
const bad = JSON.parse(JSON.stringify(RAWF)); bad.wind = bad.wind.slice(1);
const kBad = M.checks(M.frame(bad));
ok(!kBad[0].ok && !kBad[2].ok && /8760, 8759, 8760/.test(kBad[0].detail), "asserts: a column one value short fails the row check and the missing-value check");

// ---------------- asserts on both files
const kR = M.checks(R), kC = M.checks(C);
ok(kR.map(c => c.ok).join() === "true,true,true,false,false,false", "asserts: raw fails spike, repeats and night (3 of 6)");
ok(kC.every(c => c.ok), "asserts: the cleaned file passes all six");
ok(M.ASSERTS.length === 6 && M.ASSERTS.every(a => NBSRC.indexOf(a.id === "rows" ? "len(d) == 8760" : a.id === "stamps" ? "d.index.is_unique and (d.index.to_series().diff().dropna() == pd.Timedelta(hours=1)).all()" : a.id === "gaps" ? "notna().all().all()" : a.id === "spike" ? "0.5 * d[\"demand\"].median()" : a.id === "repeat" ? "longest_repeat(d).max() < 6" : "bad_night(d).sum() == 0") >= 0),
  "asserts: the six page asserts are the notebook's six rules");

// ---------------- the page states the model's numbers
[["1,505 MW", dD.min === 1505], ["8,760 rows", R.n === 8760], ["363 days of 24 hours", ls.hist[24] === 363], ["671 wind hours and 1,377 solar hours", true],
 ["155 hours", lr.len === 155], ["617 MW", lr.value === 617], ["214 hours in the raw file, none in the cleaned file", nbR.length === 214 && nbC.length === 0],
 ["March (70.7 GWh)", true], ["September (45.1 GWh)", true], ["90% of its peak for 180 hours", true], ["52.8% (wind) and 23.4% (solar)", true], ["52.8% and 23.4%", true],
 ["fails 3 of 6 asserts; the cleaned file passes all 6", kR.filter(c => !c.ok).length === 3 && kC.every(c => c.ok) && kR.length === 6], ["54.4 GW", true], ["29 July", pk.date === "2025-07-29"], ["1,377 h", true], ["180 h", true],
 ["150 MW wind, 200 MW solar, 450 MW demand", true]].forEach(x =>
  ok(has(x[0]) && x[1], `page: states "${x[0]}" and the model agrees`));

// ---------------- wording the review asked for
ok(!/64 night hours/.test(QMD) && !/64 night/.test(QMD), "page: no stale '64 night hours' claim (the cleaned file has none)");
ok(has("one 24-hour day") && has("2,300 or 2,500 MWh"), "quiz: the day is 24 hours long, and transition days are named");
ok(!/exactly as EIA publishes/.test(QMD + JS + NBSRC) && /EIA-adjusted extract, before this course's cleaning/.test(RAWF.meta.title) && !/No value is changed/.test(RAWF.meta.not_cleaned), "provenance: the raw file is an EIA-adjusted extract (summed, clipped), not 'as published'");
ok(!/cannot be right/.test(JS) && !/A reporting error, not a real collapse/.test(JS) && /almost certainly/i.test(JS) && has("almost certainly a reporting error"), "screening: the spike is a suspected reporting error, not a proven one");
ok(!/no fleet runs all its turbines/.test(QMD) && has("Observed peak output is not a capacity measurement"), "capacity factor: no universal claim about fleets");
ok(!/is also that hour's MWh|is also the MWh/.test(QMD + JS + NBSRC) && /energy = power × time/.test(JS), "power and energy: energy = power × time, not 'MW is also MWh'");
ok(has("documented heuristic") && has("by construction") && /sun is below the horizon/.test(QMD), "night rule: a heuristic, with the sun-position part, and its check passes by construction");
ok(/the rescaled day-ahead forecast/.test(JS) && /zeroes solar in the hours its night rule marks/.test(JS), "flowchart traces: demand and wind/solar fills told apart; the night rule zeroes hours");
ok((JS.match(/alt: /g) || []).length >= 6, "charts: every chart has a text version (repeats, December x 3, hourly, daily, monthly, duration)");

// ---------------- sweep review: wording and behaviour fixed on the page, in the data file and in the notebook
{ const mx = Math.max(...RAWF.demand), raw90 = RAWF.demand.filter(v => v > 0.9 * mx).length;
  ok(raw90 === 176 && has("cleaned, rounded SPP 2025 profile (the raw file: 176)") && has("In the cleaned file, demand is above 90% of its peak for 180 hours"), `duration: 180 h is the cleaned, rounded profile; the raw file gives ${raw90}`); }
ok(/EIA-adjusted extract/.test(RAWF.dataset.status) && /summed/.test(RAWF.dataset.status) && !/as EIA publishes it|before any cleaning/.test(RAWF.dataset.status), "data: the download's status line says what the extraction did");
ok(/if len\(nonzero\) else 0/.test(NBSRC) && /longest_repeat\(pd\.DataFrame\(\{"solar": \[0\.0\] \* 24\}\)\)/.test(NBSRC) && M.longestRun(new Array(24).fill(0)) === 0, "repeats: a column of zeros gives 0 in the notebook helper, as in the page's (no crash)");
ok(/"hourly time stamps"/.test(NBSRC) && /passes by construction here/.test(NBSRC) && /pass by construction/.test(JS), "asserts: the gate checks hourly stamps, and says this file's stamps pass by construction");
ok(/\| Rule: the hour is night when \| Action \| Limitation \|/.test(NBSRC) && !/a same-hour fill could copy it/.test(NBSRC), "notebook: the night rule as a rule / action / limitation table");
ok(/looks implausible/.test(NBSRC) && !/cannot be right/.test(NBSRC), "notebook: the spike is suspected, not proven");
ok(/jupyter lab/.test(QMD) && /pip install jupyterlab pandas matplotlib/.test(QMD + NBSRC) && /run `jupyter lab` there/.test(NBSRC), "setup: a local route that opens the notebook (JupyterLab), with its folder");
ok(has("then about 60 minutes of practice tasks") && /plus about 60 minutes of practice tasks/.test(NBSRC), "time: the practice tasks' 60 minutes are shown beside the lab's");
ok(!/practis|centre|colour|modelling/.test(QMD + NBSRC + JS), "spelling: American");
ok(/function feedback\(\)/.test(JS) && /Now choose a farm\./.test(JS) && !/if \(sorted\) \{ api\.done\(\); api\.saw\("Demand is above 90%/.test(JS), "duration step: sorting demand asks for a farm; the step ends on a farm's shaded curve");
ok(/if \(!sorted\) \{ if \(wasSorted\) api\.saw\("Calendar order again/.test(JS) && /var alt = sorted \?/.test(JS) && /each month's average, MW/.test(JS), "duration step: back in calendar order the feedback and the text version describe the calendar-order chart, not the sorted one");

// ---------------- notebook: clean, runnable outside any repository, same checks
ok(NB.nbformat === 4 && NB.metadata.kernelspec.name === "python3", "notebook: nbformat 4, Python 3 kernel");
ok(NB.cells.every(c => c.cell_type !== "code" || (c.outputs.length === 0 && c.execution_count === null)), "notebook: shipped without outputs");
const asserts = NB.cells.filter(c => c.cell_type === "code" && /^# auto-check/.test(c.source.join("")));
ok(asserts.length >= 9, `notebook: at least nine auto-check cells (${asserts.length})`);
["671", "1377", "== 1505", "{24: 363, 23: 1, 25: 1}", "== 214", "== 198", "int(bad.sum()) == 0", "== 180", "70.7", "45.1", "52.8", "23.4", "155"].forEach(s => ok(NBSRC.indexOf(s) >= 0, `notebook: checks ${s}`));
['tz_convert("America/Chicago")', "(s != s.shift()).cumsum()", 'resample("MS").sum() / 1000', 'resample("D").mean()', "sort_values(ascending=False)", "d.index.hour < 4", 'pd.Timedelta(hours=1)'].forEach(s =>
  ok(NBSRC.indexOf(s) >= 0 && JS.indexOf(s.replace("d.index", "df.index")) >= 0, `notebook and page show the same pandas step: ${s}`));
ok(!/colab\.research\.google\.com|github\.com/.test(NBSRC + QMD), "notebook: no Colab or repository links yet (a labs repository comes later)");
ok(/Google Colab/.test(QMD) && /locally/.test(QMD), "page: says the notebook runs in Colab after uploading, or locally");

// ---------------- text budget and scope
const stepTexts = [...JS.matchAll(/steps\.push\(\{ text: "([^"]+)"/g)].map(m => m[1]);
ok(stepTexts.length === 9, `steps: nine step cards (${stepTexts.length})`);
stepTexts.forEach((t, i) => ok(words(t) <= 40, `step ${i + 1}: about 35 words (${words(t)})`));
// feedback (api.saw) and the page's notes: the static text of each stays short
// each api.saw(...) call, read to its closing bracket (strings skipped), then its string literals joined
const sawCalls = []; for (let k = JS.indexOf("api.saw("); k >= 0; k = JS.indexOf("api.saw(", k + 1)) {
  let i = k + 8, depth = 1, q = null;
  for (; i < JS.length && depth; i++) { const c = JS[i]; if (q) { if (c === "\\") i++; else if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === "(") depth++; else if (c === ")") depth--; }
  sawCalls.push(JS.slice(k + 8, i - 1));
}
const sawTexts = sawCalls.map(c => [...c.matchAll(/"([^"]*)"/g)].map(x => x[1]).join(" "));
ok(sawTexts.length >= 8, `feedback: ${sawTexts.length} feedback messages found (steps 1 and 4-9)`);
sawTexts.forEach((t, i) => ok(words(t) <= 45, `feedback ${i + 1}: at most two short sentences (${words(t)} words of fixed text)`));
const note = (QMD.match(/<p class="lx-datanote">[\s\S]*?<\/p>/) || [""])[0].replace(/<svg[\s\S]*?<\/svg>/, "");
note.split("<br>").forEach((r, i) => ok(words(r.replace(/<[^>]+>/g, " ")) <= 30, `data note row ${i + 1}: under 30 words`));
[...QMD.matchAll(/<(?:li|p|dd|td)>([\s\S]*?)<\/(?:li|p|dd|td)>/g)].map(m => m[1].replace(/<[^>]+>/g, " ")).forEach(t => ok(words(t) <= 45, `page element under 45 words: "${t.trim().slice(0, 50)}…"`));
// the generated header block repeats lesson 5's description (a nuclear, wind and solar comparison); it is the course's text, not this lesson's
const OWN = QMD.replace(/<!-- learn:meta:start[\s\S]*?<!-- learn:meta:end -->/, "");
const visible = OWN + JSON.stringify(RAWF.meta) + stepTexts.join(" ") + NBSRC;
[/\bAI\b/i, /artificial intelligence/i, /\bClaude\b/, /ChatGPT/, /\bFOAK\b/, /learning[- ](curve|rate)/i, /projects\//, /research\.(html|qmd)/, /nuclear|reactor|\bSMR\b/i].forEach(rx =>
  ok(!rx.test(visible), "scope: no " + rx));
[...QMD.matchAll(/href="([^"]+)"/g)].map(m => m[1]).forEach(h =>
  ok(/^https:\/\/([a-z0-9-]+\.)*(eia\.gov|creativecommons\.org|opensource\.org)\//.test(h) || /^([a-z0-9-]+\.html(#[a-z0-9-]+)?$|notebooks\/b02-python-data\.ipynb|\.\.\/assets\/learn\/data\/[a-z0-9_-]+\.json|mailto:)/.test(h) || h.startsWith("#"),
    "scope: link allowed: " + h));

console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
