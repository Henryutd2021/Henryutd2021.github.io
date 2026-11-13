// test_components_e.js — Node tests for the shared components
//   checklist.js (LX.Checklist), evidence.js (LX.EvidenceLadder), tagger.js (LX.PhraseTagger), unitchain.js
//   (LX.UnitChain, LX.EvidenceClock), checkpoint.js (LX.Checkpoint) and sheet.js (LX.Sheet).
//   - each file defines its LX.<Name> when run with a stub window.LX, and exports its pure part to Node
//   - the pure parts: the checklist count line, the ladder check, the tagger's verdicts and score, the checkpoint's checks,
//     level rule and summary (on CK-F's data and on a made-up checkpoint), and the spreadsheet engine (arithmetic,
//     precedence, ranges, functions, errors, cycles, fill-down, references, display)
//   - the lessons that used lesson-local copies now call the shared components, and define no copy of their own
// Usage (from the site folder):  node _tests/learn/test_components_e.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- each component defines LX.<Name> with a stub window.LX, and exports its pure part
const NAMES = { checklist: ["Checklist"], evidence: ["EvidenceLadder"], tagger: ["PhraseTagger"], unitchain: ["UnitChain", "EvidenceClock"],
  checkpoint: ["Checkpoint"], sheet: ["Sheet"] };
Object.keys(NAMES).forEach(f => {
  const src = fs.readFileSync(L("components/" + f + ".js"), "utf8"), css = fs.readFileSync(L("components/" + f + ".css"), "utf8");
  ok(src.split("\n")[0].indexOf("/* " + f + ".js — LX.") === 0, `${f}.js: header comment names the file and the component`);
  ok(css.split("\n")[0].indexOf("/* " + f + ".css — ") === 0, `${f}.css: header comment names the file`);
  ok(!/#[0-9a-fA-F]{3,6}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && !/#[0-9a-fA-F]{6}\b|rgba?\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), `${f}: colours from --lx-* tokens only`);
  const ctx = { window: { LX: {} }, module: { exports: {} }, document: {} };
  try { vm.runInNewContext(src, ctx); } catch (e) { ok(false, `${f}.js runs with a stub window.LX: ${e.message}`); return; }
  NAMES[f].forEach(n => {
    ok(typeof ctx.window.LX[n] === "function", `${f}.js defines LX.${n}`);
    ok(new RegExp("LX\\." + n + " = ").test(src), `${f}.js assigns LX.${n} = `);
  });
});
const CL = require(L("components/checklist.js")), EV = require(L("components/evidence.js")), TG = require(L("components/tagger.js"));
const CP = require(L("components/checkpoint.js")), SH = require(L("components/sheet.js"));

// ---------------- checklist: the count line (foot: N1 and B2; head: B3 and K7)
ok(CL.countText(3, 9, {}) === "3 of 9 checked." && CL.countText(9, 9, { doneText: "Write what you found in a data note." }) === "9 of 9 checked. Write what you found in a data note.", "checklist: foot count, with the done text when all are ticked");
ok(CL.countText(8, 9, { doneText: "x" }) === "8 of 9 checked.", "checklist: no done text before the last tick");
ok(CL.countText(2, 8, { count: "head" }) === "2 of 8 ticked" && CL.countText(0, 6, { count: "head" }) === "0 of 6 ticked", "checklist: head count as in B3 and K7");

// ---------------- evidence ladder
ok(EV.check({ answer: ["operating", "design"] }, "operating") && EV.check({ answer: ["projection"] }, "projection") && !EV.check({ answer: ["operating"] }, "announced") && !EV.check({ answer: ["operating"] }, ""), "ladder: any listed rung is right");

// ---------------- phrase tagger
const text = { parts: ["A ", { p: "a", text: "big number", tag: "scale", also: ["time"] }, " and ", { p: "b", text: "a date", tag: "time" }, "."],
  missing: { answer: "pays", also: ["boundary"] } };
ok(TG.phrases(text).map(x => x.p).join() === "a,b", "tagger: phrases in reading order");
ok(TG.judge(text.parts[1], "scale") === "same" && TG.judge(text.parts[1], "time") === "fair" && TG.judge(text.parts[1], "pays") === "other" && TG.judge(text.parts[1], null) === "none", "tagger: same, fair, other, none");
let sc = TG.score(text, { a: "time", b: "time", _missing: "boundary" });
ok(sc.same === 1 && sc.fair === 1 && sc.total === 2 && sc.missing === "fair", "tagger: score counts verdicts and judges the unanswered question");
sc = TG.score({ parts: text.parts }, {});
ok(sc.none === 2 && sc.missing === undefined, "tagger: a text without a missing question has no missing verdict");
ok(TG.badge({ n: 3, label: "Physics & <limits>", sub: "units", color: "var(--lx-tier-3)" }, true, true) ===
  '<span class="lx-tag-n" style="--c:var(--lx-tier-3)" aria-hidden="true">3</span>Physics &amp; &lt;limits&gt; <small>units</small>', "tagger: badge HTML is escaped and carries the number");

// ---------------- checkpoint: CK-F's data
const D = JSON.parse(fs.readFileSync(L("data/ck-f-estimate.json"), "utf8"));
const t5 = CP.task(D, "t5-cf"), es = CP.task(D, "est-buses"), t3 = CP.task(D, "t3-order");
ok(CP.checkNumeric(t5, 148, "GWh").right && CP.checkNumeric(t5, 148, "MW").power && /positive/.test(CP.checkNumeric(t5, -1, "MWh").msg), "checkpoint: numeric task (units, power units, sign)");
ok(CP.checkOrder(t3, t3.items.map(x => x[0])).right && !CP.checkOrder(t3, t3.start).right, "checkpoint: order task");
ok(CP.checkEstimate(es, 300, 600, "MWh per year").overlaps && !CP.checkEstimate(es, 300, 600, "kW").unitsOk, "checkpoint: estimate task");
ok(CP.fmtMs(45000) === "45 s" && CP.fmtMs(125000) === "2 min 05 s" && CP.fmtMs(null) === "–", "checkpoint: time format");
const autoIds = D.tasks.filter(t => ["choice", "order", "numeric"].indexOf(t.kind) >= 0).map(t => t.id);
function state(k, rating, pts) {
  const s = { version: D.version, started: "2026-11-03T10:00:00Z", finished: "2026-11-03 10:40", cur: 8, tasks: {} };
  autoIds.forEach((id, i) => { s.tasks[id] = { ms: 60000, msFirst: 45000, tries: i < k ? 1 : 2, first: i < k, solFirst: false }; });
  s.tasks["t0-explain"] = { ms: 90000, msFirst: 80000, tries: 1, first: pts, points: [pts, pts], answer: "The grid stores almost nothing." };
  s.tasks["est-buses"] = { ms: 900000, msFirst: 700000, tries: 1, first: true, answer: { low: 300, high: 600, unit: "MWh per year" }, check: { overlaps: true }, rating: rating };
  return s;
}
const P = { units: "Proficient", range: "Proficient", uncertainty: "Proficient", check: "Proficient" }, Sg = { units: "Strong", range: "Strong", uncertainty: "Proficient", check: "Proficient" };
ok(CP.level(D, state(5, P, true)).level === "Proficient" && CP.level(D, state(6, Sg, true)).level === "Strong" && CP.level(D, state(4, P, true)).level === "Developing" &&
   CP.level(D, state(2, P, true)).level === "Not yet" && CP.level(D, state(7, P, false)).level === "Developing", "checkpoint: the published level rule on CK-F");
const sum = CP.summary(D, state(5, P, true), { width: 390 }, { code: "CK-F" });
const lines = sum.split("\n");
ok(lines[0] === "Learn · CK-F results (" + D.version + ")" && lines[1] === "Finished: 2026-11-03 10:40 (this device's clock) · active time 23 min 30 s", "checkpoint: summary head (code, version, finish, active time)");
ok(lines[4] === "# | Task | Draws on | First answer | Tries | Time to first answer | Time on task | Solution opened before answering", "checkpoint: summary table header unchanged");
ok(lines.indexOf("1 | " + D.tasks[0].title + " | " + D.tasks[0].lesson + " | 2 of 2 points (self) | 1 | 1 min 20 s | 1 min 30 s | no") >= 0, "checkpoint: explanation row");
ok(/^Your explanation \(task 1\): The grid stores almost nothing\.$/m.test(sum) && /^Screen width 390 px\. Kept in this browser only; copied by you\.$/m.test(sum), "checkpoint: explanation and screen lines");
ok(CP.firstWord(D, D.tasks[1], { first: null, skipped: true }) === "skipped" && CP.firstWord(D, D.tasks[1], {}) === "not answered" && CP.firstWord(D, es, { first: true }) === "submitted", "checkpoint: first-answer words");
// a written task whose worked solution was opened before it was submitted: the table and the summary say 0 points, as
// the level counts them, under openFirst "not-right" (CK-F's data rule); its ticks are still named
{
  const opened = state(5, P, true); opened.tasks["t0-explain"].solFirst = true;
  const ex = D.tasks[0], r = opened.tasks["t0-explain"];
  ok(D.rule.openFirst === "not-right" && CP.firstWord(D, ex, r) === "solution opened first: 0 points (2 of 2 ticked)" && CP.firstWord(D, ex, r, "counts") === "2 of 2 points (self)",
     "checkpoint: a written task opened first reads 0 points (" + CP.firstWord(D, ex, r) + ")");
  ok(CP.summary(D, opened, {}, { code: "CK-F" }).split("\n").indexOf("1 | " + ex.title + " | " + ex.lesson + " | solution opened first: 0 points (2 of 2 ticked) | 1 | 1 min 20 s | 1 min 30 s | yes") >= 0 &&
     !CP.level(D, opened).explainOk, "checkpoint: the summary's row and the level agree: no points");
  ok(CP.pointsWord(ex, 1, { solFirst: true }, "not-right") === "solution opened first: 0 points (1 of 2 ticked)" && CP.pointsWord(ex, 1, { solFirst: false }, "not-right") === "1 of 2 points (self)", "checkpoint: pointsWord");
}
// a made-up checkpoint: the explanation and estimate are found by kind, wherever they sit, and the code is the option's
const X = { version: "ck-x v0", rule: D.rule, tasks: [
  { id: "q1", kind: "choice", title: "One", lesson: "T1", options: [["a", "A"], ["b", "B"]], answer: "a" },
  { id: "e1", kind: "estimate", title: "Est", lesson: "T2", units: es.units, range: es.range, show: es.show },
  { id: "o1", kind: "open-short", title: "Explain", lesson: "T3", points: ["p1", "p2", "p3"] }] };
const xs = { version: X.version, tasks: { q1: { first: true, tries: 1, ms: 1000, msFirst: 900 }, o1: { first: true, points: [true, true, true], answer: "Because." },
  e1: { first: true, answer: { low: 1, high: 2, unit: "GWh per year" }, rating: { units: "Strong", range: "Strong", uncertainty: "Strong", check: "Proficient" } } } };
const xr = Object.assign({}, X.rule, { autoStrong: 1, autoProficient: 1, autoDeveloping: 1 }); X.rule = xr;
ok(CP.level(X, xs).level === "Strong" && CP.level(X, xs).autoOf === 1, "checkpoint: a made-up checkpoint finds its tasks by kind (three points, one auto task)");
xs.tasks.o1.points = [true, false, true];
ok(CP.level(X, xs).level === "Developing" && !CP.level(X, xs).explainOk, "checkpoint: a missing point blocks Proficient (rule.autoDeveloping: 1)");
const xsum = CP.summary(X, xs, {}, { code: "CK-X" });
ok(/^Learn · CK-X results \(ck-x v0\)$/m.test(xsum) && /^Your explanation \(task 3\): Because\.$/m.test(xsum) && /^3 \| Explain \| T3 \| 2 of 3 points \(self\)/m.test(xsum), "checkpoint: code, task number and point count follow the data");

// ---------------- sheet engine
const S = { cells: { A1: "2", A2: "3", A3: "4", B1: "text", C1: "=A1+A2*A3", C2: "=-A1^2", C3: "=2^3^2", D1: "=SUM(A1:A3)", D2: "=AVERAGE(A1:B3)", D3: "=ROUND(A1/A2,2)",
  D4: "=COUNT(A1:B3)", D5: "=max(a1:a3)", E1: "=A1/0", E2: "=B1*2", E3: "=E3+1", E4: "=E5", E5: "=E4", E6: "=NOPE(1)", E7: "=SUM(", E8: "=Z99", E9: "=1−A1", E10: "=ABS(-A3)" }, rows: 20, cols: 6 };
const v = n => SH.value(S, n);
ok(v("C1") === 14 && v("C2") === 4 && v("C3") === 64, "sheet: precedence as in Excel");
ok(v("D1") === 9 && v("D2") === 3 && v("D3") === 0.67 && v("D4") === 3 && v("D5") === 4 && v("E9") === -1 && v("E10") === 4, "sheet: functions, lower case, the minus sign −");
ok(v("E1").err === "#DIV/0!" && v("E2").err === "#VALUE!" && v("E3").err === "#CYCLE!" && v("E4").err === "#CYCLE!" && v("E6").err === "#NAME?" && v("E7").err === "#NAME?" && v("E8").err === "#REF!", "sheet: errors and cycles");
S.cells.A1 = "10"; ok(v("C1") === 14, "sheet: values are cached until changed()"); SH.changed(S); ok(v("C1") === 22, "sheet: changed() clears the cache");
ok(SH.shift("=B5-C5-$E$1", 2, 0) === "=B7-C7-$E$1" && SH.shift("=E$1+$E1", 1, 1) === "=F$1+$E2" && SH.shift("=SUM(E5:E28)", 1, 0) === "=SUM(E6:E29)" && SH.shift("=A1", -1, 0) === "=#REF!" && SH.shift("12", 3, 0) === "12", "sheet: fill-down and fill-right");
ok(SH.refsIn("=SUM(B5:$C$7)+D1").join() === "B5,$C$7,D1" && SH.colName(28) === "AB" && SH.colNum("AB") === 28, "sheet: references and column names");
ok(SH.show(1234.5) === "1,234.5" && SH.show(78600, "$") === "$78,600" && SH.show({ err: "#REF!" }) === "#REF!" && SH.show("") === "" && SH.show(2 / 3) === "0.67", "sheet: display");
ok(SH.tokenize("1 + ?") === null && SH.parse("(1+2") === null && JSON.stringify(SH.parse("A1:B2")) === '{"rg":["A1","B2"]}', "sheet: bad input parses to null");

// ---------------- the lessons call the shared components and keep no copy
const src = f => fs.readFileSync(L(f), "utf8"), page = f => fs.readFileSync(path.join(SITE, "learn", f), "utf8");
const n1 = src("n01-news-lens.js"), b2 = src("b02-python-data.js"), b3 = src("b03-read-check-formulation.js"), k7 = src("k07-spreadsheets.js"), ckf = src("ck-f-estimate.js");
[n1, b2].forEach((s, i) => ok(!/LX\.Checklist\s*=/.test(s) && !/\.lx-checklist\{/.test(s) && /LX\.Checklist\(/.test(s), ["N1", "B2"][i] + ": calls LX.Checklist, defines no copy"));
[b3, k7].forEach((s, i) => ok(!/b3-list/.test(s) && /LX\.Checklist\(/.test(s), ["B3", "K7"][i] + ": tick list is LX.Checklist"));
ok(!/b3-list/.test(page("b03-read-check-formulation.qmd")) && !/b3-list|\.k7-grid|\.k7-sheet|\.k7-fx/.test(page("k07-spreadsheets.qmd")), "B3, K7 pages: no lesson-local copy of the shared CSS");
ok(/LX\.PhraseTagger\(/.test(n1) && /LX\.UnitChain\(/.test(n1) && /LX\.EvidenceClock\(/.test(n1) && /LX\.EvidenceLadder\(/.test(n1) &&
   !/function chainInto|n1-chain|n1-rungs|n1-cmp|n1-ph\b|function judge\(ph, tag\) \{\s*if/.test(n1), "N1: tagger, unit chain, clock and ladder are the shared ones");
ok(/LX\.Sheet\(/.test(k7) && !/function tokenize|function parse\(|var FUN = /.test(k7), "K7: the sheet and engine are LX.Sheet");
ok(/LX\.Checkpoint\(/.test(ckf) && !/function checkNumeric|function level\(|function summary\(|ckf-css/.test(ckf) && /"ckf-v1"/.test(ckf), "CK-F: the runner is LX.Checkpoint; key ckf-v1 kept");
ok(/lx-ck-gated/.test(page("ck-f-estimate.qmd")) && /class="lx-ck-lock"/.test(page("ck-f-estimate.qmd")) && !/ckf-open/.test(page("ck-f-estimate.qmd")), "CK-F page: gated solution and lock use the component's classes");

console.log(`components (group E): ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
