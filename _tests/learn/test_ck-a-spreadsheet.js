// test_ck-a-spreadsheet.js — Node tests for CK-A, the Analyst checkpoint (assets/learn/ck-a-spreadsheet.js, its data file,
// the two workbooks and the page learn/ck-a-spreadsheet.qmd):
//   - the model: the page's JS recomputes every worked number of the checkpoint's data build step (Python);
//     identities from first principles (the tariff gives EIA's average, the annuity factor is a sum of discount factors,
//     the year-by-year cash flow equals the closed form, the parties add up to the resource view); cross-page inputs read
//     from the course's data (e0.json: price index, rate, CO2 factor; A4: capacity cost)
//   - the worked workbook: unzipped here; every formula evaluated with the course's own engine (components/sheet.js, the
//     sheets laid end to end) equals its cached value and the model; the starter has no formulas and no worked values
//   - the tasks: answers equal the model; the level rule on sample attempts, including answers given after the full
//     worked solution opened (pure: practice; on the real runner, gateAll: task 9 first opens nothing, the solution opens
//     with the ninth answer, in any order; opened early with the lock's button, the later answers are practice); the
//     shared late-answer rule said before the tasks; the demo opens the solution only through the recorded path; the sensitivity's
//     claims (no sign change, the largest swing, a higher demand charge lowering the result); the conventions the answers
//     rest on (residual value, the battery's energy basis, the rate reset, the demand-charge scenario) stated before
//     the tasks; units in the sensitivity
//   - every number on the page (static blocks, numbers used, the rubric in the course's words) and the page on a stub
//   - scope: no nuclear term, no "AI", no deny-listed term; links only to allow-listed domains, learn pages and downloads
// Usage (from the site folder):  node _tests/learn/test_ck-a-spreadsheet.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const vm = require("vm");
const PRIV = require("./private_sources.js");
const ID = "ck-a-spreadsheet";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RB = require(L("components/rubric.js"));
const ENG = require(L("components/sheet.js"));
const DPATH = L("data/" + ID + ".json"), QPATH = path.join(SITE, "learn", ID + ".qmd"), SIDE = path.join(SITE, "learn/_w1", ID + ".yml");
const D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const rel = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t) * Math.max(1, Math.abs(b));
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
const BLOCKS = { "cka-brief": () => M.staticBrief(D), "cka-tasks": () => M.staticTasks(D), "cka-solution": () => M.staticSolution(D), "cka-course-rubric": () => RB.staticHTML(M.RUBRIC) };
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("wrote the page's static blocks");
}
const PAGE = fs.readFileSync(QPATH, "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8"), RAW = fs.readFileSync(DPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", "block " + k + " is up to date (run with --write)"); });

// ---------------- the model against the data build step's numbers, and from first principles
const F = M.facts(D), b = F.base, r = F.res;
Object.keys(D.worked).forEach(k => ok(rel(r[k], D.worked[k], 1e-6), "the page's model equals the data build step's: " + k + " " + r[k] + " / " + D.worked[k]));
Object.keys(D.base).forEach(k => ok(rel(b[k], D.base[k], 1e-6), "derived input " + k));
{
  const e0 = JSON.parse(fs.readFileSync(L("data/e0.json"), "utf8")), a04 = JSON.parse(fs.readFileSync(L("data/a04-retail-tariffs.json"), "utf8"));
  ok(b.i2022 === e0.deflator.index["2022"] && b.i2023 === e0.deflator.index["2023"] && b.i2025 === e0.deflator.index["2025"], "price index read from the course's e0.json");
  ok(b.rate === e0.finance.rate / 100 && b.co2lb === e0.home.grid.lbPerMWh && b.capCost === a04.costs.capacityPerKW * 12, "discount rate, CO2 factor (e0.json) and capacity cost (A4: $15 per kW-month × 12) read from course data");
}
ok(rel(r.energyCharge * b.use + b.demand * b.peak * 12, b.price * b.use, 1e-12), "the tariff gives the school EIA's average price before the project");
ok(rel(b.capital, 3170 * 250 * 128.989 / 118.035, 1e-12) && Math.round(b.capital) === 866046, "up-front cost: $3,170 × 250 × 128.989 / 118.035 = $866,046 (2025 dollars)");
ok(rel(b.omPV, 17.63 * 250 * 128.989 / 122.389, 1e-12) && rel(b.omBat, 63 * 150 * 128.989 / 118.035, 1e-12), "upkeep converted from 2023 and 2022 dollars");
ok(rel(r.solar, 250 * 0.178 * 8760, 1e-12) && Math.round(r.solar) === 389820, "solar output 389,820 kWh");
{ let s = 0; for (let y = 1; y <= 25; y++) s += Math.pow(1.04, -y); ok(rel(r.af, s, 1e-12), "the annuity factor is the sum of 25 discount factors (" + s.toFixed(4) + ")"); }
ok(rel(F.pvSum, r.npvSchool, 1e-9) && F.minCum < 0, "the year-by-year cash flow equals the closed form; cumulative cash never turns positive");
ok(Math.abs(r.check) < 1e-6 && rel(r.npvSchool + r.npvOthers, r.npvSociety, 1e-12), "school + other customers = the resource view (transfers cancel)");
ok(rel(r.shift + r.avoided, r.billSave, 1e-12) && r.shift > 0 && r.avoided > 0, "the bill saving = real cost avoided + transfer");
ok(b.coloc > 0.06 && b.coloc < 0.075 && M.pct(b.coloc) === "7%", "Figure 3-5 read per kW-DC of solar is 7% below the separate systems (1,903 × 250 + 2,492 × 150)");
ok(rel(b.co2, 680 * 0.45359237 / 1000, 1e-12) && Math.round(r.co2t) === 118, "CO2: 680 lb/MWh in tonnes; about 118 t a year");
// the sensitivity
ok(F.sens.length === 8 && F.sens.every(s => s.atLo < 0 && s.atHi < 0), "no single swing changes the sign of the school's NPV");
ok(F.sens[0].key === "capital" && D.top === "capital" && F.sens.every((s, i) => i === 0 || s.swing <= F.sens[i - 1].swing), "sorted by swing; the up-front cost first");
{ const dm = F.sens.find(s => s.key === "demand"); ok(dm.atHi < r.npvSchool && dm.atLo > r.npvSchool, "a higher demand charge lowers the school's NPV (the energy charge falls)"); }
ok(D.sens.every(p => { const s = F.sens.find(x => x.key === p.key); return rel(s.atLo, p.atLo, 1e-6) && rel(s.atHi, p.atHi, 1e-6) && rel(s.lo, p.lo, 1e-6) && rel(s.hi, p.hi, 1e-6); }), "the sensitivity equals the builder's");

// ---------------- the workbooks
function unzip(file) {
  const buf = fs.readFileSync(file), out = {};
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28), data = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    out[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
function book(file) {
  const z = unzip(file), names = [...z["xl/workbook.xml"].matchAll(/<sheet name="([^"]+)" sheetId="(\d+)"/g)].map(m => m[1]), S = {};
  names.forEach((nm, i) => {
    const x = z["xl/worksheets/sheet" + (i + 1) + ".xml"], cells = {};
    for (const m of x.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = m[2] || "", f = /<f>([\s\S]*?)<\/f>/.exec(body), v = /<v>([^<]*)<\/v>/.exec(body), t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
      const un = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      cells[m[1]] = { f: f ? un(f[1]) : null, v: v ? Number(v[1]) : null, t: t ? un(t[1]) : null };
    }
    S[nm] = cells;
  });
  return { z, names, S };
}
const WB = book(L("data/ck-a-worked.xlsx")), SB = book(L("data/ck-a-starter.xlsx"));
ok(WB.names.join() === "ReadMe,AssumptionsLog,Model,CashFlow,WhoPays,Sensitivity" && SB.names.join() === WB.names.join(), "both workbooks: ReadMe, AssumptionsLog, Model, CashFlow, WhoPays, Sensitivity");
ok(/fullCalcOnLoad="1"/.test(WB.z["xl/workbook.xml"]), "the worked workbook recalculates on opening");
// evaluate every formula with the course's engine: sheet k's row R becomes virtual row k * 1000 + R
const OFF = {}; WB.names.forEach((n, k) => { OFF[n] = k * 1000; });
function translate(f, sheet) {
  return f.replace(/(?:([A-Za-z]+)!)?(\$?)([A-Z]{1,2})(\$?)(\d+)/g, (m, sh, d1, c, d2, row) => d1 + c + d2 + (Number(row) + OFF[sh || sheet]));
}
const V = { cells: {}, rows: 1000 * WB.names.length, cols: 26 };
let nF = 0;
WB.names.forEach(n => Object.entries(WB.S[n]).forEach(([ref, c]) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref), key = m[1] + (Number(m[2]) + OFF[n]);
  if (c.f) { V.cells[key] = "=" + translate(c.f, n); nF++; } else if (c.v != null) V.cells[key] = String(c.v); else if (c.t != null) V.cells[key] = c.t;
}));
const val = (sheet, ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return ENG.value(V, m[1] + (Number(m[2]) + OFF[sheet])); };
{
  const bad = [];
  WB.names.forEach(n => Object.entries(WB.S[n]).forEach(([ref, c]) => { if (!c.f) return; const x = val(n, ref); if (!(typeof x === "number" && rel(x, c.v, 1e-9))) bad.push(n + "!" + ref + " =" + c.f + " → " + JSON.stringify(x) + " (cached " + c.v + ")"); }));
  ok(nF > 500 && bad.length === 0, "every formula of the worked workbook (" + nF + ") evaluates with the course's engine to its cached value: " + bad.slice(0, 5).join("; "));
}
{
  const MR = D.sheets.modelRow, LR = D.sheets.logRow;
  ["energyCharge", "solar", "billSave", "upkeep", "net", "af", "pvRepl", "pvResidual", "npvSchool", "avoided", "shift", "npvOthers", "npvSociety"].forEach(k => ok(rel(val("Model", "C" + MR[k]), r[k], 1e-9), "workbook Model!C" + MR[k] + " (" + k + ") equals the page's model"));
  ["capital", "repl", "omPV", "omBat", "defl22", "defl23", "co2", "coloc"].forEach(k => ok(rel(val("AssumptionsLog", "C" + LR[k]), b[k], 1e-12) && WB.S.AssumptionsLog["C" + LR[k]].f, "workbook log: " + k + " is a formula equal to the page's"));
  ok(Math.abs(val("Model", "C" + MR.check)) < 1e-6 && Math.abs(val("WhoPays", "C10")) < 1e-6, "the workbook's two checks are zero (Model and WhoPays)");
  const cfRows = Object.keys(WB.S.CashFlow).filter(x => /^H\d+$/.test(x) && WB.S.CashFlow[x].f && /^SUM/.test(WB.S.CashFlow[x].f));
  ok(cfRows.length === 1 && rel(val("CashFlow", cfRows[0]), r.npvSchool, 1e-9), "the workbook's cash flow sums to the closed form");
  // the scenario columns each change only their own input rows
  const inRows = Object.values(MR).filter(x => x < MR.energyCharge);
  ok("DEFGHIJKLMNOPQRS".split("").every(c => inRows.filter(row => !/^\$C\d+$/.test(WB.S.Model[c + row].f)).every(row => /^AssumptionsLog!(I|J)\d+$/.test(WB.S.Model[c + row].f))), "scenario columns: every input row is the base ($C) or a low/high from the log");
  ok(F.sens.every(s => Object.values(WB.S.Sensitivity).some(c => c.t === s.label || c.t === s.label + " ($ a year)")), "the workbook's Sensitivity sheet lists every swing");
}
{
  const allF = SB.names.flatMap(n => Object.values(SB.S[n]).filter(c => c.f));
  const lg = SB.S.AssumptionsLog, ids = Object.entries(lg).filter(([ref]) => /^A\d+$/.test(ref) && Number(ref.slice(1)) >= 5).map(([, c]) => c.t);
  ok(allF.length === 0, "the starter has no formulas");
  ok(!ids.some(i => ["capital", "repl", "omPV", "omBat", "defl22", "defl23", "co2", "coloc"].includes(i)) && ids.length === D.log.filter(x => x.type !== "Derived").length, "the starter's log gives the case's facts only, no derived values (" + ids.length + " rows)");
  const nums = Object.values(SB.S.Model).concat(Object.values(SB.S.WhoPays), Object.values(SB.S.Sensitivity)).filter(c => c.v != null && c.v !== 0);
  ok(nums.length === 0, "the starter's Model, WhoPays and Sensitivity hold no numbers");
  ok(Object.entries(lg).filter(([ref]) => /^[IJ]\d+$/.test(ref) && Number(ref.slice(1)) >= 5).every(([, c]) => c.v == null && !c.t), "the starter leaves low and high blank");
}

// ---------------- the tasks and the level rule
const T = D.tasks, task = id => T.find(t => t.id === id);
ok(T.length === 9 && T.filter(t => ["choice", "numeric"].includes(t.kind)).length === 7 && T.filter(t => t.kind === "open-short").length === 2 && T[T.length - 1].id === "log", "nine tasks: seven auto-marked, two written, the log last");
ok(rel(task("solar").answer.value, r.solar / 1000, 1e-6) && rel(task("upfront").answer.value, b.capital, 1e-6) && rel(task("billsave").answer.value, r.billSave, 1e-6) && rel(task("npc").answer.value, -r.npvSchool, 1e-6) && rel(task("shift").answer.value, r.shift, 1e-6), "numeric answers equal the model");
ok(task("tornado").answer === "a" && task("transfer").answer === "b", "choice answers: the up-front cost; the other customers");
ok(M.checkNumeric(task("npc"), 0.78, "million $").right && !M.checkNumeric(task("npc"), 0.70, "million $").right && M.checkNumeric(task("solar"), 389.8, "MWh per year").right && !M.checkNumeric(task("solar"), 250, "kW").right, "numeric checks: units and tolerances");
ok(task("solar").units.filter(u => u[1] === null).length === 2, "the solar task flags kW and MW as the wrong kind of unit");
{
  const rec = (first, extra) => Object.assign({ first, tries: 1, at: "2026-11-06T10:00:00Z" }, extra || {});
  const st = (k, pa, pb, o) => { const s = { tasks: {} }; T.forEach(t => { if (t.kind === "open-short") s.tasks[t.id] = rec(false, { answer: "text", points: t.points.map((_, i) => i < (t.id === "boundary" ? pa : pb)) }); }); T.filter(t => t.kind !== "open-short").forEach((t, i) => { s.tasks[t.id] = rec(i < k); }); return Object.assign(s, o || {}); };
  const R = d => M.level(Object.assign({}, D), d).level;
  ok(R(st(7, 4, 4)) === "Strong" && R(st(6, 4, 4)) === "Strong" && R(st(6, 3, 4)) === "Proficient" && R(st(5, 3, 3)) === "Proficient" && R(st(5, 2, 4)) === "Developing" && R(st(3, 0, 0)) === "Developing" && R(st(2, 4, 4)) === "Not yet", "the level rule on sample attempts");
  const early = st(7, 4, 4, { solEarly: "2026-11-06T09:00:00Z" });
  ok(M.level(D, early).level === "Practice (no level)", "the worked solution opened early by this attempt (the lock's button, before every task was answered): practice");
  const own9 = st(7, 4, 4); own9.tasks.log.solFirst = true;
  const L9 = M.level(D, own9);
  ok(L9.level === "Developing" && !L9.assisted && L9.pointsB === 0 && L9.writtenEarly === 1 && /1 written task with the solution opened first: no points/.test(M.describe(D, L9)),
    "task 9's own early solution opens only its own answer (gateAll, no practice), and its points do not count (opened before answering): " + L9.level);
  const seen = st(7, 4, 4); ok(M.level(Object.assign({ solOpen: "2026-11-05T00:00:00Z" }, D), seen).level === "Practice (no level)" && M.level(Object.assign({ solOpen: "2026-11-06T10:00:00Z" }, D), seen).level === "Strong", "opened by an earlier attempt: practice; opened by submitting task 9: counts");
  const opened = st(7, 4, 4); opened.tasks.solar.solFirst = true; ok(M.level(D, opened).auto === 6, "a task opened before answering counts as not right");
  // answers given after the full worked solution opened (with gateAll it opens only once all nine are
  // answered, so this needs an earlier opening): each is late under the shared rule, and the attempt is practice
  const late = st(7, 4, 4); T.forEach(t => { late.tasks[t.id].at = t.id === "log" ? "2026-11-06T10:00:00.000Z" : "2026-11-06T10:05:00.000Z"; });
  const LL = M.level(Object.assign({ solOpen: "2026-11-06T10:00:00.000Z" }, D), late);
  ok(LL.level === "Practice (no level)" && LL.auto === 0 && LL.pointsA === 0 && LL.pointsB === 4 && LL.late === 8, "answers given after the solution opened earn no level: " + LL.level + ", " + LL.auto + " of 7, boundary points " + LL.pointsA + ", " + LL.late + " late");
  ok(/so this attempt is practice and gets no level/.test(M.describe(D, LL)) && /counted as practice \(not right, no points\): 8 tasks/.test(M.describe(D, Object.assign({}, LL, { assisted: null }))), "the results sentence says why");
  ok(/yes \(the full worked solution\)/.test(M.summary(Object.assign({ solOpen: "2026-11-06T10:00:00.000Z" }, D), late, {})), "the copied summary marks the late answers");
  const inOrder = st(7, 4, 4); T.forEach(t => { inOrder.tasks[t.id].at = t.id === "log" ? "2026-11-06T10:05:00.000Z" : "2026-11-06T10:00:00.000Z"; });
  ok(M.level(Object.assign({ solOpen: "2026-11-06T10:05:00.000Z" }, D), inOrder).level === "Strong", "the same answers, the solution opened by the ninth: Strong");
  const any = st(7, 4, 4); T.forEach((t, i) => { any.tasks[t.id].at = t.id === "solar" ? "2026-11-06T10:05:00.000Z" : "2026-11-06T10:0" + (i % 5) + ":00.000Z"; });
  ok(M.level(Object.assign({ solOpen: "2026-11-06T10:05:00.000Z" }, D), any).level === "Strong", "in any order: the ninth answer (here task 2) opens it, and none is late");
  ok(/^Learn · CK-A results \(ck-a v1 \(6 Nov 2026\)\)\n/.test(M.summary(D, st(7, 4, 4), { width: 375 })), "the copied summary's first line");
}

// ---------------- the page's own text
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, ""), TX = text(OWN);
const has = (s, what) => ok(TX.includes(s), "page: " + what + ": '" + s + "'");
has("Net present value to the school: −$776,324 (2025 dollars, 25 years, 4% real). In present value the district pays $776,000 more than it saves.", "the answer in one line");
has("One-at-a-time swings put it between −$993,000 and −$560,000: no single swing changes its sign.", "the range");
has("of the school's $31,965 gross bill saving a year, $19,615 is a real cost the utility avoids; $12,351 is a transfer from its other customers.", "gross against net");
has("school −$776,324 + other customers −$192,941 = resource view −$969,265.", "the parties add up");
ok(rel(-776324 - 192941, -969265, 1e-6), "and they do (rounded)");
{ const v = {}; D.log.forEach(x => { v[x.id] = x.value; });
  ok(v.price === 0.1117 && v.capKW === 3170 && v.pvCF === 0.178 && v.batOM === 63 && v.pvOM === 17.63 && v.co2lb === 680 && v.rte === 0.9 && v.batLife === 15, "the numbers-used table matches the log");
  ["11.17¢/kWh", "$3,170/kW-DC", "17.8%", "$63/kW a year", "$17.63/kW-DC a year", "680 lb/MWh"].forEach(s => ok(OWN.includes('<td class="n">' + s + "</td>"), "numbers used: " + s)); }
{ const mins = [...OWN.matchAll(/\(about (\d+) min\)/g)].map(m => +m[1]); ok(mins.length === 5 && mins.reduce((a, x) => a + x, 0) === 150, "the parts add up to about 150 minutes: " + mins.join(" + ")); }
has("Enter your results in the nine tasks below, in any order: the worked workbook opens once all nine are answered.", "nine tasks, any order (gateAll)");
has("After the worked workbook opens: an answer given after that counts as practice, not as right, and a written task then earns no points.", "the late-answer rule, before the tasks");
has("Answered late: an answer given after the worked workbook opened counts as practice, not as right; a written task submitted after it earns no points.", "the late-answer rule, in the rubric");
has("Opens once all nine tasks are answered.", "the lock box: gateAll");
ok(!/task 9 last|submit task 9|Submit this task last/i.test(TX + JSON.stringify(D.tasks)), "no text still says task 9 opens the solution");
ok(/gateAll: true, late: "practice"/.test(JS) && !/submitTask/.test(JS.slice(JS.indexOf("LX.Checkpoint(live"))), "the runner: gateAll and the shared late-answer rule, no submit task");
// the conventions the answers depend on, stated before the tasks
{ const BR = text(PAGE.slice(between(PAGE, "cka-brief").from, between(PAGE, "cka-brief").to));
  ok(BR.includes("End value: at year 25 the replacement battery has 5 of its 15 years left: count 5/15 of its cost as its residual value (straight line)") && rel(r.residual, b.repl * 5 / 15, 1e-12), "the brief states the straight-line residual value the answer uses (5/15 of the replacement)");
  ok(BR.includes("about 200 full cycles a year, each taking in 300 kWh from the school's supply and returning 90%; the 10% lost is bought at the energy charge") && rel(r.lossKWh, 200 * 300 * 0.1, 1e-12) && rel(r.sLoss, -r.lossKWh * r.energyCharge, 1e-12), "the brief defines the battery's energy basis: 300 kWh taken in per full cycle, 10% lost, bought at the energy charge (6,000 kWh)");
  ok(BR.includes("Rate reset: assume the utility recovers its whole remaining revenue shortfall from its other customers at the next rate reset"), "the brief gives the rate-reset assumption the cost shift needs");
  ok(BR.includes("Situation:") && BR.includes("Deliverable:") && BR.includes("Inputs, illustrative where marked"), "the case in three parts: situation, deliverable, inputs");
  const words = x => x.split(/\s+/).filter(Boolean).length;
  ok([D.case.situation, D.case.deliverable].concat(D.case.facts.map(f => f[1].replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1")))
    .every(x => words(x) <= 35), "every part of the brief is at most 35 words"); }
ok(task("tornado").options.find(o => o[0] === "c")[1].includes("with the energy charge re-set so the pre-project bill is unchanged") && /pre-project bill held/.test(F.sens.find(x => x.key === "demand").label), "the demand-charge swing is named as a rebalancing (pre-project bill held), before and after");
ok(/Under the brief's rate-reset assumption, who pays it\?$/.test(task("transfer").prompt) && /^Under the same assumption/.test(task("shift").prompt) && /including its residual value/.test(task("npc").prompt) && !/recheck|savings are larger/.test(task("npc").prompt), "tasks 5 to 7 say which given convention they rest on; task 5 gives no hint of the sign");
// no task's worked solution, points or feedback names another task's answer before that task is submitted (solAfter), and
// the written tasks keep their first submission (freeze)
{ const RD = M.runnerData(D), CPK = require(path.join(SITE, "assets/learn/components/checkpoint.js"));
  ok(CPK.solLeaks(RD).length === 0, "no solution leaks an unanswered task's answer: " + JSON.stringify(CPK.solLeaks(RD)));
  ok(task("npc").solAfter.join() === "upfront,billsave" && task("shift").solAfter.join() === "billsave" && CPK.openProblems(RD).length === 0, "the main result's solution waits for tasks 3 and 4, the cost shift's for task 4");
  ok(T.filter(t => t.kind === "open-short").every(t => t.freeze === true) && T.filter(t => t.kind !== "open-short").every(t => !t.freeze), "the two written tasks keep their first submission; the marked ones allow retries");
  ok(/Across the worked ranges, the up-front cost swings the NPV by about \$433,000; the next largest, the average electricity price, by about \$200,000\./.test(task("tornado").why.a), "the sensitivity feedback gives the swings, not the size of one number"); }
ok(/the input that moves it most\)\.$/.test(task("log").prompt), "task 9 no longer asks to be submitted last (gateAll)");
// units in the sensitivity
{ const SO = text(M.staticSolution(D));
  ok(SO.includes("$0.0894 to $0.134 per kWh") && SO.includes("$5 to $20 per kW-month") && SO.includes("$11,229 to $18,715 a year"), "the sensitivity table keeps its units");
  const tr = M.tornadoRows(D, F), pr = tr.find(x => /price/.test(x.label)), dm = tr.find(x => /Demand/.test(x.label));
  ok(pr.loText === "$0.0894/kWh" && pr.hiText === "$0.134/kWh" && dm.loText === "$5/kW-month" && dm.hiText === "$20/kW-month", "the tornado's labels keep their units");
  ok(["kw-dc", "residual-value", "annuity-factor", "real-rate", "islanding", "elective-pay", "full-cycle"].every(k => PAGE.includes('data-term="' + k + '"')), "kW-DC, residual value, annuity factor, real rate, islanding, elective pay and full cycles are glossary terms on the page"); }
has("Prairie Town is fictional; its numbers are illustrative where the log says so.", "the fictional line");
// the task section's notes: one idea each, within the text budget (the workbook, the refreshers, the data, privacy)
{ const sec = OWN.slice(OWN.indexOf('<div class="lx-card cka-intro">'), OWN.indexOf("::: {#solution"));
  const notes = [...sec.matchAll(/<p class="lx-(?:hint|datanote)">([\s\S]*?)<\/p>/g)].map(m => text(m[1])).filter(x => !/^Without JavaScript/.test(x));
  const wc = x => x.split(/\s+/).filter(Boolean).length;
  ok(notes.length >= 4 && notes.every(x => wc(x) <= 35), "the task section's notes are within about 35 words each: " + notes.map(wc).join(", ")); }
ok(OWN.includes('href="../assets/learn/data/ck-a-starter.xlsx" download') && M.staticSolution(D).includes('href="../assets/learn/data/ck-a-worked.xlsx" download'), "the starter downloads from the task; the worked workbook from the (gated) solution only");
ok(!between(PAGE, "cka-tasks") || !PAGE.slice(between(PAGE, "cka-tasks").from, between(PAGE, "cka-tasks").to).includes("ck-a-worked.xlsx"), "the task list does not link the worked workbook");
// the rubric: the course's words, never reworded
{
  const comp = RB.COMPETENCES, ids = M.RUBRIC.map(x => x.id);
  ok(ids.join() === "accounting,uncertainty,trust,realism" && M.RUBRIC.every(x => !x.levels && x.look), "rubric: accounting, uncertainty, trust and realism, with look lines and no reworded levels");
  const CUR = PRIV.path("curriculum");
  if (CUR && fs.existsSync(CUR)) { const c = fs.readFileSync(CUR, "utf8"); ok(ids.every(id => { const x = comp.find(y => y.id === id); return ["developing", "proficient", "strong"].every(l => c.includes(x[l])); }), "rubric words are the course rubric's, word for word"); }
}

// ---------------- the page on a stub document
(async () => {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env();
  E.LX.ready = () => {}; E.LX.reduced = () => true; E.window.innerWidth = 1280;
  ["checkpoint", "rubric", "tornado"].forEach(n => load(n, E));
  let init = null, demo = null, tornado = null;
  { const TO = E.LX.Tornado; E.LX.Tornado = (h, o) => { const t = TO(h, o); return { draw: d => { tornado = d; return t.draw(d); } }; }; }
  E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
  E.LX.demo = (root, fn) => { demo = fn; return () => null; };
  const lock = E.LX.H("div", { id: "cka-lock", hidden: "" }, E.body); E.LX.H("button", { type: "button" }, lock);
  E.LX.H("div", { id: "cka-solution-body", class: "lx-ck-gated" }, E.body);
  E.LX.H("div", { id: "cka-tornado" }, E.body); const cr = E.LX.H("div", { id: "cka-course-rubric" }, E.body);
  const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, setTimeout: f => { f(); return 0; }, clearTimeout: () => {}, require };
  vm.runInNewContext(JS, mctx);
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { ck_a_spreadsheet: D }, root); } catch (err) { threw = err.stack; }
  ok(!threw && typeof demo === "function", "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  if (threw) return finish();
  ok(tornado && tornado.rows.length === 8 && rel(tornado.base, r.npvSchool, 1e-12) && tornado.rows.every((x, i) => rel(x.atLo, F.sens[i].atLo, 1e-12)), "the tornado draws the eight swings around the base NPV");
  ok(cr.querySelectorAll("fieldset").length === 4 || /Consistent accounting/.test(cr.innerHTML), "the course rubric draws its four competences");
  ["mid", "done", "solution"].forEach(s => { let q = null; try { q = demo(s); } catch (err) { q = null; } ok(q && q.view, "demo state " + s + " runs"); });
  ok(E.LX.store.get(M.KEY + "-sol-open", null) && E.body.querySelector("#cka-solution-body").classList.contains("is-open") && E.body.querySelector("#cka-lock").hidden, "the solution demo opens the worked solution through the runner, recorded");
  { const st9 = E.LX.store.get(M.KEY, {}); ok(st9.solEarly && M.level(Object.assign({ solOpen: E.LX.store.get(M.KEY + "-sol-open") }, D), st9).level === "Practice (no level)", "opening it by the demo is recorded on the attempt and makes it practice"); }
  await reviewersSequence();
  await earlySequence();
  await inOrderSequence();
  introSays();
  finish();
})().catch(err => { ok(false, "the stub page test threw: " + (err && err.stack || err)); finish(); });

// mount the page on a fresh stub document (a fresh browser)
function mountFresh() {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env(); E.LX.ready = () => {}; E.LX.reduced = () => true; E.window.innerWidth = 1280;
  ["checkpoint", "rubric", "tornado"].forEach(n => load(n, E));
  let init = null; E.LX.mount = (slug, f) => { if (slug === ID) init = f; }; E.LX.demo = () => () => null;
  const lock = E.LX.H("div", { id: "cka-lock", hidden: "" }, E.body); E.LX.H("button", { type: "button" }, lock);
  E.LX.H("div", { id: "cka-solution-body", class: "lx-ck-gated" }, E.body); E.LX.H("div", { id: "cka-tornado" }, E.body); E.LX.H("div", { id: "cka-course-rubric" }, E.body);
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, setTimeout: f => { f(); return 0; }, clearTimeout: () => {}, require });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  init(live, { ck_a_spreadsheet: D }, root);
  const btn = re => live.querySelectorAll("button").filter(x => re.test(x.textContent))[0];
  const goTo = i => { for (let k = 0; k < 12; k++) { const tag = live.querySelector(".lx-ck-tag"); const cur = tag ? +/Task (\d+)/.exec(tag.textContent)[1] - 1 : -1; if (cur === i) return; (cur < i ? btn(/Next task|Start the checkpoint|Resume/) : btn(/^Back$/)).click(); } };
  // answer task i right on its first try (written tasks: submit a text, then tick every point)
  const answer = i => {
    goTo(i); const t = D.tasks[i];
    if (t.kind === "numeric") { live.querySelector("input").value = String(t.answer.value); live.querySelector("select").value = t.units.find(u => u[1] === 1)[0]; btn(/^Check$/).click(); }
    if (t.kind === "choice") live.querySelectorAll(".lx-choice").filter(b => b.textContent === t.options.find(o => o[0] === t.answer)[1])[0].click();
    if (t.kind === "open-short") { live.querySelector("textarea").value = "My own text for " + t.id + "."; btn(/Submit my explanation/).click();
      live.querySelectorAll(".lx-ck-points input").forEach(cb => { cb.checked = true; cb.fire("change"); }); }
  };
  const level = () => { btn(/See my results|Next task/) && goTo(8); btn(/See my results/).click(); return text(live.querySelector(".lx-ck-level").textContent); };
  return { E, live, answer, level };
}
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
// the same case on the runner with gateAll: task 9 submitted first opens nothing; the other answers, given
// before the solution opens, count; the ninth answer opens it
async function reviewersSequence() {
  const P = mountFresh();
  P.answer(8);
  ok(!P.E.body.querySelector("#cka-solution-body").classList.contains("is-open") && !P.E.LX.store.get(M.KEY + "-sol-open", null), "runner: submitting task 9 first opens nothing (gateAll)");
  await sleep(5);
  for (let i = 0; i < 7; i++) P.answer(i);
  ok(!P.E.body.querySelector("#cka-solution-body").classList.contains("is-open"), "runner: eight of nine answered, still shut");
  P.answer(7);
  const st = P.E.LX.store.get(M.KEY, {}), so = P.E.LX.store.get(M.KEY + "-sol-open", null);
  ok(P.E.body.querySelector("#cka-solution-body").classList.contains("is-open") && so === st.tasks[D.tasks[7].id].at, "runner: the ninth answer opens the worked solution, recorded at its time");
  const lv = P.level();
  ok(lv === "Level: Strong", "runner: every answer given before the solution opened counts, in any order: " + lv);
}
// opened early with the lock's button: the answers after it are late (practice), and the attempt gets no level
async function earlySequence() {
  const P = mountFresh();
  P.answer(0);
  await sleep(5);
  P.E.body.querySelector("#cka-lock button").click();
  ok(P.E.body.querySelector("#cka-solution-body").classList.contains("is-open") && P.E.LX.store.get(M.KEY, {}).solEarly, "runner: the lock's button opens it early, recorded on the attempt");
  await sleep(5);
  for (let i = 1; i < 9; i++) P.answer(i);
  const lv = P.level(), d = text(P.live.querySelector(".lx-ck-describe").textContent);
  ok(lv === "Level: Practice (no level)" && /opened before all 9 tasks were answered/.test(d), "runner: opened early: practice, said why: " + lv);
}
// the intro says the shared late-answer rule up front
function introSays() {
  const P = mountFresh();
  ok(text(P.live.textContent).includes("The worked solution section opens once all nine tasks are answered, in any order; opening it earlier is recorded. An answer given after it opens counts as practice, not as right, and a written task then earns no points."), "runner: the intro states the gate and the late-answer rule");
}
// the same answers in the published order earn Strong
async function inOrderSequence() {
  const P = mountFresh();
  for (let i = 0; i < 9; i++) P.answer(i);
  const lv = P.level();
  ok(lv === "Level: Strong", "runner: every task right, task 9 last: " + lv);
}

function finish() {
  const ALL = [PAGE, RAW, JS, fs.existsSync(SIDE) ? fs.readFileSync(SIDE, "utf8") : ""].concat(WB.names.map((n, i) => WB.z["xl/worksheets/sheet" + (i + 1) + ".xml"]), SB.names.map((n, i) => SB.z["xl/worksheets/sheet" + (i + 1) + ".xml"])).join("\n");
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term (page, data, script, workbooks)");
  ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere");
  ok(!/\bFOAK\b|\bNOAK\b|first[- ]of[- ]a[- ]kind|learning[- ](curve|rate)|order[- ]book|anchor[- ](customer|buyer)|subsidy[- ]free|break[- ]even capital|smr-dc|projects\/|research\.(html|qmd)/i.test(ALL), "no deny-listed term");
  ok(!/break[- ]even/i.test(ALL), "no break-even search (no credit or threshold sweep)");
  const OKH = h => /^https:\/\/www\.eia\.gov\//.test(h) || /^https:\/\/atb\.nlr\.gov\//.test(h) || /^https:\/\/www\.irs\.gov\//.test(h) || /^(\.\.\/assets\/learn\/data\/[a-z0-9_-]+\.(json|xlsx)|[0-9a-z-]+\.html(#[a-z0-9-]+)?)$/.test(h);
  const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...ALL.replace(PAGE, OWN).matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(m => m[0]).filter(h => !/schemas\.openxmlformats|purl\.org|www\.w3\.org/.test(h)));
  ok(hrefs.length > 5 && hrefs.every(OKH), "links: eia.gov, atb.nlr.gov, irs.gov, learn pages and downloads only: " + [...new Set(hrefs.filter(h => !OKH(h)))].join(" "));
  ok(!/data-source="excerpt:/.test(PAGE), "no excerpt of the course author's research");
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(x => new RegExp("\\n  id: " + ID + "\\n").test(x)) || "";
  ok(/\n  status: active\n/.test(entry) && /\n  minutes: 150\n/.test(entry) && /\n  form: checkpoint\n/.test(entry) && /after: \[A1, A4(, A13(, A15)?)?\]/.test(entry), "path.yml: active checkpoint, 150 minutes, after A1 and A4 (and A13, A15 when listed)");
  const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
  ok(fm("title") === py("title") && fm("subtitle") === py("subtitle"), "the page's title and subtitle equal path.yml's");
  const GJ = JSON.parse(fs.readFileSync(L("data/glossary.json"), "utf8")), marks = [...(JS + RAW).matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]).concat([...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]));
  ok(marks.length >= 2 && marks.every(m => GJ[m]), "every glossary mark has a definition: " + marks.filter(m => !GJ[m]).join(", "));
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
}
