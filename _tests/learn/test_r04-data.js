// test_r04-data.js — Node tests for research studio R4 (assets/learn/r04-data.js, data/r04-data.json, the raw SPP file
// b02-python-data.json and the course's data-build counts in town_days.json):
//   - local time: the studio's clock equals B2's model and the ICU time-zone database (America/Chicago) for every hour
//   - the rules: spike limits and counts, frozen-run counts equal to the course's data build at 3 hours, the forced-day
//     pipeline keeps 8,760 rows, leaving hours out loses exactly the flagged ones
//   - the four reported numbers, raw and cleaned, against the course's build (annual demand, peak and its hour)
//   - every number written on the page (step texts, notes, Go deeper, exemplars) comes from the model or a dated source
//   - the no-JS blocks equal the model's (--write rewrites them); licences, coordinate systems, practice time, links
//   - the details: the prediction is graded against the raw file in percent; the fill contrast
//     names both cases for any fill; the night check on solar and its count; each log line's effect; the spatial log
//     records proposed systems only; flags are provisional; the chart's text version; the starter notebook's asserts
//     carry the model's numbers; text budget of the exemplar lines, notes, data note and Go deeper
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
const words0 = s => M.plain(s).trim().split(/\s+/).length, strip0 = h => h.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, "x");
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

const BLOCKS = {
  "r04-task": () => M.staticTask(F, D, T),
  "r04-exemplars": () => EX.staticHTML(M.exemplarsSpec(F, RAWF.meta, D)),
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
// the prediction: compared with the raw file, in percent
const VR = M.vsRaw(R0, raw);
ok(VR.most === "minGW" && D.predict.answer === "minGW" && VR.peakMoved && Math.abs(VR.pct.demandTWh) < 1, "with the course's choices the lowest hour moves most against the raw file (" + M.f0(VR.pct.minGW) + "%): the stored answer");
{ const noop = M.vsRaw(M.report(F, M.clean(F, { time: "utc", spike: "keep", frozen: 0, fill: "drop" })), raw);
  ok(noop.most === null && !noop.peakMoved, "UTC, every value kept, frozen rule off: nothing moves against raw, so no number is 'most'"); }
ok(!/peakAt/.test(JSON.stringify(D.predict)) && /label/.test(D.predict.q) && /n\.unit/.test(JS), "the clock time is checked apart: the prediction offers the three quantities only");
// the fill contrast names both cases whatever fill is selected
["same", "linear", "drop"].forEach(f => { const fc = M.fillContrast(F, Object.assign({}, M.DEFAULT, { fill: f }));
  ok(M.f2(fc.drop) === "275.09" && M.f2(fc.same) === "298.56" && M.f2(fc.diff) === "23.47", "fill " + f + " selected: left out 275.09 TWh, same-hour fill 298.56 TWh, 23.47 apart"); });
ok(Math.abs(M.fillContrast(F, { spike: "keep", frozen: 0 }).diff) < 1e-9, "nothing flagged: the fill changes nothing");
ok(!/cuts the year's demand by/.test(JS), "no fixed 'cuts by' sentence");
// the night check on solar: the same rule as B2's notebook
{ const ns = f => M.nightSolar(F, M.clean(F, Object.assign({}, M.DEFAULT, { fill: f })));
  ok(ns("same").hours === 65 && ns("same").filled === 49, "course's choices: 65 night hours with solar above 5% of its peak, 49 of them filled");
  ok(ns("linear").hours === 220 && ns("drop").hours === 16 && ns("drop").filled === 0, "straight-line fill 220, left out 16");
  ok(M.nightSolar(F, M.clean(F, M.RAW)).hours === 214, "raw: 214 night hours fail, as B2's notebook asserts"); }
ok(/same UTC hour \(rows 24 apart\)/.test(D.decisions.fill.options.find(o => o.id === "same").log) && /give or take an hour/.test(D.decisions.fill.options.find(o => o.id === "same").note), "the same-hour fill names its clock (UTC rows) and its daylight-saving offset");
// each log line's effect against the alternative
{ const L = M.logLines(F, base, D), E = k => L.find(l => l.key === k).effect;
  ok(E("spike") === "lowest hour 24.4 GW (1.5 GW with every value kept)", "log effect, spike: " + E("spike"));
  ok(E("fill") === "demand 298.56 TWh (left out: 275.09; straight line: 297.72)", "log effect, fill: " + E("fill"));
  ok(E("frozen") === "demand 298.56 TWh, wind 110.73 TWh (299.51 and 110.46 with the rule off)", "log effect, frozen: " + E("frozen"));
  ok(E("time") === "peak hour labeled 16:00–17:00 CDT, 29 July (21:00–22:00 UTC, 29 July in UTC)", "log effect, time: " + E("time"));
  ok(L.find(l => l.key === "check").count === "65 hours, 49 of them filled", "the log reports the night check that fails"); }
{ const t = M.sensitivity(F, M.DEFAULT).rows; ok(M.f2(t.find(r => r.key === "frozen" && r.option === 0).rep.demandTWh) === "299.51", "the log's 'rule off' figure equals the table's frozen-off row (299.51 TWh)"); }
// the spatial log: what the reader chose, as proposed
{ const sl = M.spatialLine(D, { buffer: "web", area: "deg" });
  ok(/proposed, not yet processed/.test(sl) && /Web Mercator \(EPSG:3857\) for the 1 km buffers/.test(sl) && /EPSG:4326 \(degrees\) for areas/.test(sl) && !/reprojected/.test(sl), "spatial log: the reader's own picks, marked proposed, never 'reprojected'");
  ok(M.spatialLine(D, { buffer: "utm" }) === "" && !/reprojected/.test(JSON.stringify(D.spatial)), "spatial log: nothing until both are chosen");
  const n2 = M.dataNote(RAWF.meta, F, base, D, {}, { buffer: "utm", area: "alb" });
  ok(/the local UTM zone \(meters\) for the 1 km buffers/.test(n2) && M.dataNote(RAWF.meta, F, base, D, {}).indexOf("Spatial layer") < 0, "data note: the spatial line only when chosen"); }
// provenance: the extraction's changes are in the note and on the page
ok(/Extraction \(before this note's cleaning\): .*negative values set to 0/.test(M.dataNote(RAWF.meta, F, base, D, {})) && /negative values set to 0/.test(PAGE) && !/not cleaned before this page/.test(PAGE), "provenance: summed columns and clipped negatives stated");
// flags are provisional, and the 12-hour rule's boundary (#13)
ok(!/impossible|not possible|Physically possible/.test(JSON.stringify(D) + JS) && /implausible/.test(JSON.stringify(D.decisions.spike)) && /suspected frozen telemetry/.test(JSON.stringify(D.decisions.frozen)), "flags are 'implausible' and 'suspected', not proof");
ok(d[spikeRow - 1] > 10 * d[spikeRow] && d[spikeRow + 1] > 10 * d[spikeRow], "the spike is under a tenth of the hours around it, as its note says");
{ const a = [5, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 5]; ok(M.runFlags(a, 12).filter(Boolean).length === 12 && M.runFlags(a, 13).filter(Boolean).length === 0, "a run of exactly 12 is flagged by the 12-hour rule");
  const o12 = D.decisions.frozen.options.find(o => o.id === 12), o24 = D.decisions.frozen.options.find(o => o.id === 24);
  ok(/runs shorter than 12 hours stay unflagged/.test(o12.note) && /trade-off, not a verdict/.test(o12.note) && o12.verdict === "ok" && o24.verdict === "ok",
    "the 12- and 24-hour rules are trade-offs (fewer false alarms, more missed freezes), not errors: no independent check says otherwise");
  ok(!/slip through|bad hour/.test(JSON.stringify(D.decisions)) && /suspect hour/.test(D.decisions.spike.options.find(o => o.id === "keep").note), "flags stay suspicions in the feedback: a suspect hour, unflagged runs"); }
// licences: database against produced work
ok(!/travel with/.test(JSON.stringify(D) + JS + PAGE) && /produced work/.test(JS) && /map made from it/.test(D.licences.cards.find(k => k.id === "osm").why), "share-alike: a derived database and a map are told apart");
// the chart's text version
{ const W = M.week(F, base, "2025-12-12", "2025-12-24"), T = M.weekText(F, W), long = T.runs.find(r => r.hours === 155);
  ok(T.days.length === 13 && long && long.value != null && long.filled != null, "chart text: 13 days and the 155-hour run, with its repeated value and its filled mean");
  ok(M.weekHTML(F, W, "same").indexOf("155") >= 0 && /repeated/.test(M.weekHTML(F, W, "same")) && /left out/.test(M.weekHTML(F, M.week(F, M.clean(F, Object.assign({}, M.DEFAULT, { fill: "drop" })), "2025-12-12", "2025-12-24"), "drop")), "chart text: the runs table, and 'left out' for left-out hours"); }
// the starter notebook
{ const NB = fs.readFileSync(path.join(SITE, "learn/notebooks/r04-data.ipynb"), "utf8"), nb = JSON.parse(NB), src = nb.cells.map(c => c.source.join("")).join("\n");
  ok(nb.nbformat === 4 && nb.cells.every(c => c.cell_type !== "code" || (c.outputs.length === 0 && c.execution_count === null)), "starter notebook: nbformat 4, no outputs");
  ok(/"demand TWh": "298\.56", "lowest hour GW": "24\.4", "peak hour": "16:00–17:00 CDT, 29 July", "wind TWh": "110\.73"/.test(src) && /"demand TWh": "299\.48", "lowest hour GW": "1\.5", "peak hour": "21:00–22:00 UTC, 29 July", "wind TWh": "110\.46"/.test(src),
    "starter notebook: asserts the page's four numbers, raw and cleaned");
  ok(/== "275\.09"/.test(src) && /== \(65, 49\)/.test(src) && /\(699, 671, 1377\)/.test(src) && /1 \+ 13/.test(src), "starter notebook: 275.09 TWh, 65 and 49 night hours, the build's counts, 13 alternatives");
  ok(/Ford County/.test(src) && /EPSG:32614/.test(src) && /EPSG:5070/.test(src) && /b02-python-data\.json/.test(src) && !/town_year/.test(src.replace(/town_year\.json come from/, "")), "starter notebook: the named county, the systems, and only the raw file");
  ok(/href="notebooks\/r04-data\.ipynb"/.test(PAGE) && /notebooks\/r04-data\.ipynb/.test(JS) && /town_year\.json/.test(PAGE), "the page links the starter notebook and B2's second file"); }

// ---------------- numbers written on the page
ok(/lowest hour of 23\.7 GW/.test(PAGE) && T.min_demand_GW === 23.7, "Go deeper: the build's lowest hour 23.7 GW");
ok(new RegExp("gives " + M.f1(R0.minGW) + " GW").test(PAGE), "Go deeper: this page's lowest hour " + M.f1(R0.minGW) + " GW");
ok(/downloaded on 2 November 2026/.test(PAGE) && RAWF.meta.accessed === "2026-11-02", "data note: the download date");
ok(/R4's part/.test(PAGE) && /Proficient \(audit trail\)/.test(JS) && /R5 adds the verification log/.test(JS), "R4's share of the rubric is named; the verification log and validation are left to R5");
const note = M.dataNote(RAWF.meta, F, base, D, { why: { spike: "Impossible for this grid." }, limits: "x", rerun: "y" });
ok(RAWF.meta.files.every(f => note.indexOf(f.sha256) >= 0) && note.indexOf("2026-11-02") >= 0 && /Why: Impossible for this grid\./.test(note), "data note: checksums, access date and the reader's reason");
const lines = M.logLines(F, base, D);
ok(lines.find(l => l.key === "spike").what.indexOf("16,541 MW") >= 0 && lines.find(l => l.key === "spike").count === "1 demand hour flagged", "log: spike rule with its limit and count");
ok(lines.find(l => l.key === "frozen").count === "demand 698 h, wind 671 h, solar 1,377 h", "log: frozen counts per column");

// the input file by its own checksum, and the cleaning code's version (the upstream CSVs' checksums cannot verify it)
{ const sha = require("crypto").createHash("sha256").update(fs.readFileSync(L("data/b02-python-data.json"))).digest("hex");
  ok(D.input && D.input.name === "b02-python-data.json" && D.input.sha256 === sha, "the note's input checksum is the extract's own SHA-256 (" + sha.slice(0, 12) + "…)");
  ok(note.indexOf("Input file: b02-python-data.json, SHA-256 " + sha) >= 0 && note.indexOf("Cleaning code: " + D.input.code) >= 0 && /Upstream files and SHA-256/.test(note), "data note: upstream checksums, the input file's own, and the cleaning code");
  const NB = fs.readFileSync(path.join(SITE, "learn/notebooks/r04-data.ipynb"), "utf8"), src = JSON.parse(NB).cells.map(c => c.source.join("")).join("\n");
  ok(src.indexOf('NOTEBOOK = "' + D.input.code + '"') >= 0 && /hashlib\.sha256\(raw_bytes\)/.test(src) && /"Input file: b02-python-data\.json, SHA-256 " \+ INPUT_SHA256/.test(src), "notebook: the same edition, and the input file's checksum computed from its bytes");
  ok(/def rule_text\(ch\)/.test(src) && /def step_effects\(ch\)/.test(src) && /"Units: " \+ meta\["units"\]/.test(src) && /lines \+= \["Spatial log:"\]/.test(src) && /data_note\(MINE, REASONS, LIMITS, RERUN, SPATIAL_LOG\)/.test(src),
    "notebook: the exported note states rules in words with thresholds, units, each step's effect and the spatial log");
  ok(/area\(\$geometry\) \/ 1e6/.test(src) && !/`\$area \/ 1e6`/.test(src) && /reprojecting recalculates every coordinate/.test(src) && /dissolved \(overlapping buffers merged/.test(src), "notebook: planar area() in each layer's metres, not $area; reproject and dissolve explained");
  ok(!/buildable/.test(JSON.stringify(D) + src) && /the area the 1 km buffers cover/.test(D.spatial.questions[1].q), "the spatial exercise measures the buffers' area, not buildable land"); }
// the licence of the underlying data and of the course's extract, told apart
ok(/as EIA publishes it/.test(D.licences.cards.find(k => k.id === "eia").text) && /extract of it is shared under CC BY 4\.0/.test(D.licences.cards.find(k => k.id === "eia").why) && /the course's extract CC BY 4\.0/.test(JS) && /the course's extract is CC BY 4\.0/.test(PAGE) && !/this studio's file\)/.test(JSON.stringify(D)),
  "licences: EIA's data public domain, the course's extract CC BY 4.0, in the sort, the exemplar and the task");
ok(/\[\[utm\|UTM\]\]/.test(D.spatial.systems) && /\[\[web-mercator\|/.test(D.spatial.systems) && /\[\[equal-area-projection\|/.test(D.spatial.systems) && /H\("p", \{ class: "lx-hint", html: LX\.rich\(Sp\.systems\) \}, act\);/.test(JS), "spatial: the three systems explained, with glossary help, before the picks");
ok(/var Sp = D\.spatial, st0 = LX\.store\.get\("r4-spatial", null\)/.test(JS) && /answered\[q\.id\] = o\[0\]; LX\.store\.set\("r4-spatial", answered\)/.test(JS), "spatial: saved picks restored on a revisit, and each pick saved at once");
ok(/rob: \{ t: "Insensitive to this choice"/.test(JS) && !/Say it is robust/.test(JS), "flowchart: an unchanged result is insensitive to the tested choice, not 'robust'");
ok(/The straight-line fill removes the within-gap fluctuations/.test(JS) && !/runs flat through/.test(JS), "the linear fill's caption matches the interpolation");
{ const r = between(PAGE, "r04-task"), blk = r ? PAGE.slice(r.from, r.to) : "";
  ok(/<li><b>Rule:<\/b>/.test(blk) && /<li><b>Result:<\/b>/.test(blk) && /<li><b>Next action:<\/b>/.test(blk), "no-JS night check in rule, result and next action");
  (blk.slice(blk.indexOf("Licenses: what each source")).match(/<(li|td|p)>[\s\S]*?<\/\1>/g) || []).map(strip0).forEach(b => ok(words0(b) <= 35, "no-JS task element at most 35 words (" + words0(b) + "): " + b.slice(0, 40))); }

// ---------------- exemplars
const spec = M.exemplarsSpec(F, RAWF.meta, D);
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
const allowed = /^https:\/\/([\w-]+\.)*(eia\.gov|usgs\.gov|ember-energy\.org|iea\.org|entsoe\.eu|nlr\.gov|epa\.gov|doi\.org|qgis\.org)\//;
ok(urls.every(u => allowed.test(u)), "every link on an allow-listed host: " + urls.filter(u => !allowed.test(u)).join(" "));
ok(!/\bAI\b|artificial intelligence|nuclear|reactor|\bSMR\b|learning[- ](curve|rate)/i.test(JSON.stringify(D) + JS + OWN), "no deny-listed or out-of-scope words");
const words = s => M.plain(s).trim().split(/\s+/).length;
const strip = h => h.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, "x");
EX.plain(spec.answers[1]).replace(/ \[\d+\]/g, "").split("\n").forEach((l, i) => ok(words(l) <= 35, "strong note line " + (i + 1) + ": at most 35 words (" + words(l) + ")"));
ok(EX.plain(spec.answers[1]).split("\n").length >= 10, "strong note in labelled lines, one field each");
spec.answers.forEach(a => EX.marks(a).forEach(m => ok(words(m.note) <= 25, a.key + " note " + m.n + ": at most 25 words")));
D.licences.cards.forEach(k => ok(words(k.why) <= 35, "licence " + k.id + ": reason at most 35 words (" + words(k.why) + ")"));
D.spatial.questions.forEach(q => Object.keys(q.why).forEach(k => ok(words(q.why[k]) <= 30, "spatial " + q.id + "/" + k + ": reason at most 30 words")));
D.practice.forEach(p => ok(words(p.task) <= 30, "practice task at most 30 words (" + words(p.task) + ")"));
{ const dn = (PAGE.match(/<p class="lx-datanote">[\s\S]*?<\/p>/) || [""])[0].split(/<br>/).map(strip);
  ok(dn.length >= 3, "data note in labelled rows");
  dn.forEach((r, i) => ok(words(r) <= 35, "data note row " + (i + 1) + ": at most 35 words (" + words(r) + ")"));
  const bits = ((PAGE.match(/<div class="lx-deeper-body">[\s\S]*?<\/div>\n<\/details>/g) || []).join("").match(/<(p|li)>[\s\S]*?<\/\1>/g) || []).map(strip);
  ok(bits.length >= 5, "Go deeper in short paragraphs and items");
  bits.forEach(b => ok(words(b) <= 35, "Go deeper element at most 35 words (" + words(b) + "): " + b.slice(0, 40)));
  ((PAGE.match(/<dl class="lx-ideas">[\s\S]*?<\/dl>/) || [""])[0].match(/<dd>[\s\S]*?<\/dd>/g) || []).map(strip).forEach(b => ok(words(b) <= 35, "idea at most 35 words: " + b.slice(0, 30))); }
const stepTexts = (JS.match(/\{ text: "([^"]+)", build/g) || []).map(s => s.slice(9, -8));
ok(stepTexts.length === 9, "nine step cards");
stepTexts.forEach((t, i) => ok(words(t.replace(/\[\[[a-z-]+\|([^\]]+)\]\]/g, "$1")) <= 35, "step " + (i + 1) + ": at most 35 words (" + words(t) + ")"));
Object.keys(D.decisions).forEach(k => D.decisions[k].options.forEach(o => ok(words(o.note) <= 30, k + "/" + o.id + ": note at most 30 words")));

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
