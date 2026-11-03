// test_r04-data.js — Node tests for research studio R4 (assets/learn/r04-data.js, data/r04-data.json, the raw SPP file
// b02-python-data.json and the course's data-build counts in town_days.json):
//   - local time: the studio's clock equals B2's model and the ICU time-zone database (America/Chicago) for every hour
//   - the rules: spike limits and counts, frozen-run counts equal to the course's data build at 3 hours, the forced-day
//     pipeline keeps 8,760 rows, leaving hours out loses exactly the flagged ones
//   - the four reported numbers, raw and cleaned, against the course's build (annual demand, peak and its hour)
//   - every number written on the page (step texts, notes, Go deeper, exemplars) comes from the model or a dated source
//   - the no-JS blocks equal the model's (--write rewrites them); licences, coordinate systems, practice time, links
// Usage (from the site folder):  node _tests/learn/test_r04-data.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L("r04-data.js"));
const B2 = require(L("b02-python-data.js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const RAWF = JSON.parse(fs.readFileSync(L("data/b02-python-data.json"), "utf8"));
const D = JSON.parse(fs.readFileSync(L("data/r04-data.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(L("data/town_days.json"), "utf8")).stats;
const QPATH = path.join(SITE, "learn/r04-data.qmd");
const JS = fs.readFileSync(L("r04-data.js"), "utf8");
const F = M.frame(RAWF);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

const BLOCKS = {
  "r04-task": () => M.staticTask(F, D, T),
  "r04-exemplars": () => EX.staticHTML(M.exemplarsSpec(F, RAWF.meta)),
  "r04-rubric": () => RB.staticHTML(D.rubric)
};
function between(text, key) {
  const a = text.match(new RegExp("<!-- " + key + ":start[^>]*-->\\n")), b = text.indexOf("<!-- " + key + ":end -->");
  return a && b > a.index ? { from: a.index + a[0].length, to: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); if (!r) throw new Error(k + " markers missing"); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("r04 fallback blocks written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");

// ---------------- time
const BF = B2.frame(RAWF);
let same = 0, icu = 0;
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
for (let i = 0; i < F.n; i++) {
  const c = M.clock(F, i, "local"), b = B2.local(B2.beginning(BF, i));
  if (c.date === b.date && c.h === b.h) same++;
  const p = Object.fromEntries(fmt.formatToParts(new Date(F.t0 + (i - 1) * 3600000)).map(x => [x.type, x.value]));
  if (+p.hour === c.h && p.year + "-" + p.month + "-" + p.day === c.date) icu++;
}
ok(same === 8760, "local clock equals B2's model for every hour (" + same + ")");
ok(icu === 8760, "local clock equals the ICU database (America/Chicago) for every hour (" + icu + ")");
const days = M.localDays(F), odd = days.filter(d => d.hours !== 24);
ok(days.length === 365 && odd.length === 2 && odd[0].date === "2025-03-09" && odd[0].hours === 23 && odd[1].date === "2025-11-02" && odd[1].hours === 25, "365 local days; 9 March has 23 hours, 2 November 25");
ok(M.clock(F, 0, "utc").h === 6 && M.clock(F, 0, "cst").h === 0 && M.clock(F, 0, "local").zone === "CST", "row 0 is the hour starting 06:00 UTC = 00:00 CST on 1 January");

// ---------------- the rules
const d = F.cols.demand, spikeRow = d.indexOf(Math.min(...d));
ok(d[spikeRow] === 1505 && M.clock(F, spikeRow, "local").date === "2025-06-21", "the spike: 1,505 MW on 21 June (local), as the step says");
ok(/1,505 MW on 21 June/.test(JS), "step 3 states the spike as the data has it");
ok(M.f0(M.spikeLimit(d, "half")) === "16,541" && M.f0(M.spikeLimit(d, "sd3")) === "17,262", "spike limits: half the median 16,541 MW; mean − 3 SD 17,262 MW");
ok(M.spikeFlags(d, "half").filter(Boolean).length === 1 && M.spikeFlags(d, "sd3").filter(Boolean).length === 1 && M.spikeFlags(d, "half")[spikeRow], "both spike rules flag exactly the one hour");
const base = M.clean(F, M.DEFAULT), c = base.count;
ok(c.demand.frozen + c.demand.spike === T.demand_hours_flagged_as_implausible && c.wind.frozen === T.frozen_hours_filled.wind && c.solar.frozen === T.frozen_hours_filled.solar,
  "at 3 hours the counts equal the course's data build: demand 699 (698 + the spike), wind 671, solar 1,377");
ok(Math.max(...M.runs(F.cols.wind, 3).map(r => r.len)) === 155, "the December freeze lasts 155 hours (flowchart trace)");
const forced = M.clean(F, Object.assign({}, M.DEFAULT, { time: "force" }));
ok(forced.cols.demand.length === 8760 && forced.cols.wind.length === 8760, "forced 24-hour days still give 8,760 rows (a row check passes)");
ok(M.clock(F, forced.forced.added + 1, "local").date === "2025-03-09" && M.clock(F, forced.forced.dropped, "local").date === "2025-11-02" && M.clock(F, forced.forced.dropped, "local").h === 1, "the copied hour is on 9 March and the dropped one is the second 01:00 of 2 November");
const R0 = M.report(F, base), RF = M.report(F, forced);
ok(Math.abs(RF.demandTWh - R0.demandTWh) < 0.01 && RF.peakAt === R0.peakAt, "forcing barely moves the totals: only the log can show it");
const drop = M.report(F, M.clean(F, Object.assign({}, M.DEFAULT, { fill: "drop" })));
ok(drop.hours === 8760 - 699, "leaving hours out keeps 8,061 demand values");

// ---------------- the four numbers
const raw = M.report(F, M.clean(F, M.RAW));
ok(M.f2(raw.demandTWh) === "299.48" && M.f1(raw.minGW) === "1.5" && raw.peakAt === "21:00–22:00 UTC, 29 July" && M.f2(raw.windTWh) === "110.46", "raw: 299.48 TWh, 1.5 GW, 21:00 UTC on 29 July, 110.46 TWh");
ok(M.f2(R0.demandTWh) === "298.56" && M.f1(R0.minGW) === "24.4" && R0.peakAt === "16:00–17:00 CDT, 29 July" && M.f2(R0.windTWh) === "110.73", "the course's choices: 298.56 TWh, 24.4 GW, 16:00 CDT on 29 July, 110.73 TWh");
ok(M.f1(R0.demandTWh) === T.annual_demand_TWh.toFixed(1) && M.f1(R0.peakGW) === T.peak_demand_GW.toFixed(1), "annual demand and peak agree with the course's build (298.6 TWh, 54.4 GW)");
const pkRow = F.cols.demand.indexOf(Math.max(...F.cols.demand));
ok(new Date(F.t0 + pkRow * 3600000).toISOString().slice(0, 19) === T.peak_hour_utc, "the peak hour ends at the build's peak_hour_utc (" + T.peak_hour_utc + ")");
ok(M.f2(drop.demandTWh) === "275.09", "leaving the flagged hours out gives 275.09 TWh");
const S = M.sensitivity(F, M.DEFAULT), sw = M.swings(S);
ok(S.rows.length === 3 + 2 + 6 + 2, "the table varies 13 alternatives");
ok(sw.spike.minGW > 20 && sw.fill.minGW === 0 && sw.frozen.minGW === 0, "only the spike rule moves the lowest hour");
ok(sw.fill.demandTWh > 20 && sw.fill.demandTWh > sw.frozen.demandTWh && sw.fill.windTWh > 9, "the fill moves the annual totals most (leaving hours out)");
ok(sw.time.peak === 1 && sw.spike.peak === 0 && sw.fill.peak === 0, "only the time base moves the peak's clock time");
const rel = k => Math.max(...S.rows.map(r => Math.abs(r.rep[k] - S.base[k]) / S.base[k]));
ok(rel("minGW") > rel("demandTWh") && rel("minGW") > rel("windTWh") && D.predict.answer === "minGW", "the lowest hour moves most relative to its value: the prediction's answer");

// ---------------- numbers written on the page
ok(/lowest hour of 23\.7 GW/.test(PAGE) && T.min_demand_GW === 23.7, "Go deeper: the build's lowest hour 23.7 GW");
ok(new RegExp("gives " + M.f1(R0.minGW) + " GW").test(PAGE), "Go deeper: this page's lowest hour " + M.f1(R0.minGW) + " GW");
ok(/downloaded on 2 November 2026/.test(PAGE) && RAWF.meta.accessed === "2026-11-02", "data note: the download date");
const note = M.dataNote(RAWF.meta, F, base, D, { why: { spike: "Impossible for this grid." }, limits: "x", rerun: "y" });
ok(RAWF.meta.files.every(f => note.indexOf(f.sha256) >= 0) && note.indexOf("2026-11-02") >= 0 && /Why: Impossible for this grid\./.test(note), "data note: checksums, access date and the reader's reason");
const lines = M.logLines(F, base, D);
ok(lines.find(l => l.key === "spike").what.indexOf("16,541 MW") >= 0 && lines.find(l => l.key === "spike").count === "1 demand hour flagged", "log: spike rule with its limit and count");
ok(lines.find(l => l.key === "frozen").count === "demand 698 h, wind 671 h, solar 1,377 h", "log: frozen counts per column");

// ---------------- exemplars
const spec = M.exemplarsSpec(F, RAWF.meta);
ok(EX.validate(spec).length === 0, "exemplars well formed: " + EX.validate(spec).join("; "));
const good = EX.plain(spec.answers[1]).replace(/ \[\d+\]/g, ""), weak = EX.plain(spec.answers[0]).replace(/ \[\d+\]/g, "");
ok(good.indexOf("298.56 TWh (raw 299.48)") >= 0 && good.indexOf("24.4 GW (raw 1.5)") >= 0 && good.indexOf("275.09 TWh") >= 0 && good.indexOf("16,541 MW") >= 0, "strong note: the model's numbers");
ok(good.indexOf("fac4bb99") >= 0 && good.indexOf("1146158b") >= 0 && good.indexOf("2 November 2026") >= 0, "strong note: checksums and date from the file's metadata");
ok(/about 299 TWh/.test(weak) && Math.round(R0.demandTWh) === 299 && Math.round(raw.demandTWh) === 299, "weak note: both raw and cleaned round to 299 TWh, as its note says");

// ---------------- the page and the data
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(r && PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + ": the page's no-JS block equals the model's (run with --write after a change)"); });
{ const brief = PAGE.indexOf('<div class="lx-card lx-studio-brief">'), inter = PAGE.indexOf('<div class="lx-interactive');
  ok(brief >= 0 && brief < inter && /<b>Produce:<\/b>[\s\S]*<b>From:<\/b>[\s\S]*<b>Done when:<\/b>[\s\S]*About 30 minutes guided here, then about 2 hours on your own/.test(PAGE.slice(brief, inter)),
    "the task card (produce, from, done when, time) sits above the interactive, outside its fallback, so readers with JavaScript see it"); }
ok(D.licences.cards.length === 8 && D.licences.bins.every(b => D.licences.cards.some(k => k.bin === b.id)) && D.licences.cards.every(k => D.licences.bins.some(b => b.id === k.bin) && k.why), "licences: 8 cards, every bin used, a reason each");
ok(D.spatial.questions.every(q => q.options.some(o => o[0] === q.answer) && q.options.every(o => q.why[o[0]])), "spatial: answers and a reason for every option");
ok(D.practice.reduce((s, p) => s + p.min, 0) === 120, "practice adds up to 120 minutes, as path.yml says");
Object.keys(D.decisions).forEach(k => ok(D.decisions[k].options.some(o => String(o.id) === String(M.DEFAULT[k])) && D.decisions[k].options.every(o => o.log && o.note && /good|ok|bad/.test(o.verdict)), k + ": options complete, the course's choice among them"));
ok(M.OPTIONS.frozen.every(n => D.decisions.frozen.options.some(o => o.id === n)), "every frozen option has text");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const urls = (OWN + JSON.stringify(D)).match(/https?:\/\/[^\s"'<>)]+/g) || [];
const allowed = /^https:\/\/([\w-]+\.)*(eia\.gov|usgs\.gov|ember-energy\.org|iea\.org|entsoe\.eu|nlr\.gov|epa\.gov|doi\.org)\//;
ok(urls.every(u => allowed.test(u)), "every link on an allow-listed host: " + urls.filter(u => !allowed.test(u)).join(" "));
ok(!/\bAI\b|artificial intelligence|nuclear|reactor|\bSMR\b|learning[- ](curve|rate)/i.test(JSON.stringify(D) + JS + OWN), "no deny-listed or out-of-scope words");
const words = s => s.trim().split(/\s+/).length;
const stepTexts = (JS.match(/\{ text: "([^"]+)", build/g) || []).map(s => s.slice(9, -8));
ok(stepTexts.length === 9, "nine step cards");
stepTexts.forEach((t, i) => ok(words(t.replace(/\[\[[a-z-]+\|([^\]]+)\]\]/g, "$1")) <= 35, "step " + (i + 1) + ": at most 35 words (" + words(t) + ")"));
Object.keys(D.decisions).forEach(k => D.decisions[k].options.forEach(o => ok(words(o.note) <= 30, k + "/" + o.id + ": note at most 30 words")));

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
