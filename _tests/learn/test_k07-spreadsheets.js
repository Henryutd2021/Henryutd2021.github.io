// test_k07-spreadsheets.js — Node tests for toolbox K7 (assets/learn/k07-spreadsheets.js): the day agrees with lesson 0;
// the formula engine (arithmetic, precedence, ranges, functions, errors, cycles), fill-down with relative, absolute and
// mixed addresses, the sheet the steps build, the practice answers, and every number the page states.
// Also: grading rejects typed constants (a formula must follow the inputs); the page's no-JS table and practice equal
// staticSheet(); units on the total rows; no sentence pairs the nuclear input with a cost.
// Usage (from the site folder):  node _tests/learn/test_k07-spreadsheets.js [--write]   (--write rewrites the no-JS blocks)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k07-spreadsheets.js"));
const G0 = require(path.join(SITE, "assets/learn/grid-operator.js"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"));
const QPATH = path.join(SITE, "learn/k07-spreadsheets.qmd");
const BLOCKS = { "k7-table": "table", "k7-practice": "practice", "k7-addr": "addr" };
function blockRe(name) { return [new RegExp("<!-- " + name + ":start[^>]*-->\\n"), "<!-- " + name + ":end -->"]; }
if (process.argv.includes("--write")) {
  const S0 = K.staticSheet(K.townDay(JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8")), JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"))));
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = q.match(ra), b = q.indexOf(end);
    if (!a || b < a.index) throw new Error(name + " markers missing");
    q = q.slice(0, a.index + a[0].length) + S0[BLOCKS[name]] + "\n" + q.slice(b);
  });
  fs.writeFileSync(QPATH, q); console.log("no-JS blocks written");
}
const QMD = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/k07-spreadsheets.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));
const D = K.townDay(town, year), sum = a => a.reduce((x, y) => x + y, 0), fmt = v => Math.round(v).toLocaleString("en-US");

// ---------------- the day
{
  const W = G0.prepare(town, year, "lesson0");
  ["demand", "wind", "solar", "need"].forEach(k => ok(D[k].join() === W[k].join(), `data: ${k} equals lesson 0's prepare()`));
}

// ---------------- the engine
{
  const S = { cells: { A1: "2", A2: "3", A3: "4", B1: "text", B2: "", C1: "=A1+A2*A3", C2: "=(A1+A2)*A3", C3: "=-A1^2", C4: "=2^3^2", C5: "=A1/A2",
    D1: "=SUM(A1:A3)", D2: "=AVERAGE(A1:B3)", D3: "=MAX(A1:A3)-MIN(A1:A3)", D4: "=ROUND(A1/A2,2)", D5: "=ABS(-A3)", D6: "=COUNT(A1:B3)", D7: "=sum(a1:a3)",
    E1: "=A1/0", E2: "=B1*2", E3: "=E3+1", E4: "=E5", E5: "=E4", E6: "=NOPE(1)", E7: "=SUM(", E8: "=Z99", E9: "=B2+1", E10: "=SUM(A1:A3,10)", E11: "=1−A1" }, rows: 20, cols: 6 };
  const v = n => K.value(S, n);
  ok(v("C1") === 14 && v("C2") === 20, "engine: * before +, parentheses");
  ok(v("C3") === 4 && v("C4") === 64, "engine: as in Excel, unary minus binds before ^ (−2^2 = 4) and ^ runs left to right (2^3^2 = 64)");
  ok(near(v("C5"), 2 / 3), "engine: division");
  ok(v("D1") === 9 && v("D2") === 3 && v("D3") === 2 && v("D4") === 0.67 && v("D5") === 4 && v("D6") === 3 && v("D7") === 9, "engine: SUM, AVERAGE (text and blanks skipped), MAX−MIN, ROUND, ABS, COUNT, lower case");
  ok(v("E1").err === "#DIV/0!" && v("E2").err === "#VALUE!" && v("E3").err === "#CYCLE!" && (v("E4").err === "#CYCLE!") && v("E6").err === "#NAME?" && v("E7").err === "#NAME?" && v("E8").err === "#REF!", "engine: errors");
  ok(v("E9") === 1 && v("E10") === 19 && v("E11") === -1, "engine: blank is 0; extra arguments; the minus sign −");
  ok(v("B1") === "text" && v("B2") === "" && v("A1") === 2, "engine: plain values");
}

// ---------------- fill-down
{
  ok(K.shift("=B5-C5-D5-E1", 1, 0) === "=B6-C6-D6-E2", "shift: relative addresses move down");
  ok(K.shift("=B5-C5-D5-$E$1", 3, 0) === "=B8-C8-D8-$E$1", "shift: absolute address stays");
  ok(K.shift("=E$1+$E1", 2, 0) === "=E$1+$E3", "shift: mixed addresses down");
  ok(K.shift("=B5*$A10", 0, 1) === "=C5*$A10" && K.shift("=E$1", 0, 1) === "=F$1", "shift: mixed addresses right (the quiz and the table)");
  ok(K.shift("=SUM(E5:E28)", 1, 0) === "=SUM(E6:E29)" && K.shift("=ROUND(E5,0)", 1, 0) === "=ROUND(E6,0)", "shift: ranges move, function names are left alone");
  ok(K.shift("=A1", -1, 0) === "=#REF!", "shift: off the sheet gives #REF!");
  ok(K.shift("120", 1, 0) === "120", "shift: plain values are copied as they are");
}

// ---------------- the sheet the steps build
{
  const L = K.layout(D), R0 = K.R0;
  ok(L.cells.E1 === "100" && L.cells.E2 === "40" && R0 === 5 && L.cells.B24 === String(D.demand[19]) && L.cells.A24 === "19:00", "sheet: inputs in E1 and E2; B24 is demand at 19:00");
  L.cells.E5 = "=B5-C5-D5-E1"; K.changed(L);
  ok(K.value(L, "E5") === D.need[0] && D.need[0] === 120, "step 2: E5 = 120");
  for (let r = 6; r < 29; r++) L.cells["E" + r] = K.shift(L.cells.E5, r - 5, 0); K.changed(L);
  ok(K.value(L, "E6") === D.demand[1] - D.wind[1] - D.solar[1] - 40 && K.value(L, "E6") === 175 && K.value(L, "E6") !== D.need[1], "step 3: E6 subtracts the price (E2): 175, not 115");
  ok(K.refsIn(L.cells.E5).indexOf("E1") >= 0 && K.refsIn("=B5-$E$1").indexOf("E1") < 0, "step 3: the relative E1 is detected");
  const F = K.filled(D);
  for (let t = 0; t < 24; t++) { ok(K.value(F, "E" + (R0 + t)) === D.need[t], `step 4: hour ${t} gas need = lesson 0's`); ok(K.value(F, "F" + (R0 + t)) === D.need[t] * 40, `step 5: hour ${t} cost`); }
  ok(K.value(F, "E30") === sum(D.need) && sum(D.need) === 1965, "step 6: E30 = 1,965 MWh");
  ok(K.value(F, "F30") === 78600 && K.value(F, "E31") === 145, "step 6: F30 = $78,600; peak 145 MW");
  F.cells.E2 = "60"; K.changed(F);
  ok(K.value(F, "F30") === 1965 * 60 && K.value(F, "F30") === K.value(F, "E30") * K.value(F, "E2"), "step 7: at $60 the check cell agrees ($117,900)");
  ok(D.demand[0] === 250 && D.wind[0] === 30 && D.solar[0] === 0 && D.demand[1] === 243 && D.wind[1] === 28 && D.need[1] === 115, "fallback rows 5 and 6");
  ok(D.demand[19] === 331 && D.wind[19] === 72 && D.solar[19] === 14 && D.need[19] === 145, "fallback row 24");
}

// ---------------- practice tasks
{
  const T = K.tasks(D), F = K.practiceSheet(D);
  ok(F.rows === 37 && F.cells.E32 === "55" && /Alternative gas cost, \$\/MWh/.test(F.cells.A32) && T[4].hint === "=E30*E32" && !/\*55|55\*/.test(T.map(t => t.hint).join(" ")), "practice: the $55 assumption is a labelled input cell (E32), and no hint types a changeable number");
  T.forEach(t => { F.cells[t.cell] = t.hint; }); K.changed(F);
  T.forEach(t => ok(near(K.value(F, t.cell), t.answer, 1e-9), `practice ${t.cell}: the hint formula ${t.hint} gives ${t.answer}`));
  ok(T[0].answer === sum(D.demand) && T[3].answer === Math.max(...D.solar) && T[4].answer === 55 * 1965, "practice: answers from the day");
  ok(near(T[2].answer, (D.need[17] + D.need[18] + D.need[19] + D.need[20] + D.need[21]) / 5) && K.value(F, "A22") === "17:00" && K.value(F, "A26") === "21:00", "practice: E22:E26 is 17:00 to 21:00");
  ok(/five hourly rows labeled 17:00 to 21:00/.test(T[2].ask), "practice: the evening average names its five hourly rows");
  ok(K.graded(F, D).every(Boolean), "practice: the hint formulas pass, values and dependencies");
  // typed constants, even after =, do not pass; alternative formulas that point at the cells do
  const G = K.practiceSheet(D);
  T.forEach(t => { G.cells[t.cell] = "=" + t.answer; }); K.changed(G);
  ok(K.graded(G, D).every(g => !g), "practice: =<the number> fails every task (it does not follow the inputs)");
  G.cells.E33 = "=SUM(B5:B28)"; G.cells.E34 = "=(SUM(C5:C28)+SUM(D5:D28))/E33*100"; G.cells.E35 = "=(E22+E23+E24+E25+E26)/5"; G.cells.E36 = "=MAX(D5:D28)+0*B5"; G.cells.E37 = "=F30/E2*E32"; K.changed(G);
  ok(K.graded(G, D).every(Boolean), "practice: equivalent formulas pass");
  G.cells.E36 = "=161+0*D5"; G.cells.E33 = "=SUM(B5:B27)+B28*1"; K.changed(G);
  const g2 = K.graded(G, D); ok(!g2[3] && g2[0], "practice: a constant hidden in a formula fails; a split range passes");
  G.cells.E37 = "=E30*55"; K.changed(G); ok(K.value(G, "E37") === T[4].answer && !K.graded(G, D)[4], "practice: =E30*55 has the right value but types the assumption E32 holds, so it does not pass");
  G.cells.E37 = "=SUM(F5:F28)/E2*E32"; K.changed(G); ok(K.graded(G, D)[4], "practice: another route through E32 passes");
}
// ---------------- step 6: F30 must follow the inputs too; step 7: the nudge keeps the E column honest
{
  const F = K.filled(D), want = N => N.need.reduce((a, b) => a + b, 0) * N.price;
  ok(K.follows(F, "F30", want, D), "step 6: =SUM(F5:F28) follows the inputs");
  ok(K.sumsHours(F), "step 6: =SUM(F5:F28) adds the hourly costs (one changed hour moves it)");
  F.cells.F30 = "=E30*E2"; K.changed(F); ok(K.follows(F, "F30", want, D) && !K.sumsHours(F), "step 6: =E30*E2 follows the inputs but does not add the hours, so step 6 refuses it (step 7 would compare it with itself)");
  F.cells.F30 = "=F5+F6+F7+F8+F9+F10+F11+F12+F13+F14+F15+F16+F17+F18+F19+F20+F21+F22+F23+F24+F25+F26+F27+F28"; K.changed(F); ok(K.sumsHours(F) && K.follows(F, "F30", want, D), "step 6: adding the 24 cells one by one is another valid route");
  ok(/!sumsHours\(S\)\) \{ api\.saw\("Right number, but F30 does not add the hourly costs/.test(JS), "step 6: the page refuses a total that does not add the hours");
  F.cells.F30 = "=78600"; K.changed(F); ok(!K.follows(F, "F30", want, D) && K.value(F, "F30") === 78600, "step 6: =78600 has the right value but does not follow");
  const N = K.nudge(D); ok(N.need.every((v, t) => v === D.need[t] + 7 + (t % 3) - 2 - 3) && N.price !== 40, "nudge: demand, wind, solar and the gas cost all move");
}

// ---------------- the nuclear input: E1 by address, never a typed 100 (steps 2 to 4)
{
  const L = K.layout(D);
  L.cells.E5 = "=B5-C5-D5-100"; K.changed(L);
  ok(K.value(L, "E5") === D.need[0] && !K.followsE1(L, D), "step 2: =B5-C5-D5-100 has the right value but does not follow E1");
  L.cells.E5 = "=B5-C5-D5-E1"; K.changed(L); ok(K.followsE1(L, D), "step 2: =B5-C5-D5-E1 follows E1");
  const H = K.layout(D); for (let r = 5; r < 29; r++) H.cells["E" + r] = K.shift("=B5-C5-D5-100", r - 5, 0); K.changed(H);
  const all = [...Array(24).keys()];
  ok(all.every(t => K.value(H, "E" + (5 + t)) === D.need[t]) && !K.followsE1(H, D, all), "steps 3 and 4: a hard-coded 100 filled down matches every hour but fails the E1 check");
  const P = K.filled(D); ok(K.followsE1(P, D, all), "step 4: =B5-C5-D5-$E$1 filled down follows E1 in every row");
  ok(/if \(v === need\[0\] && \["B5", "C5", "D5", "E1"\]\.every/.test(JS) && /followsE1\(S, D, \[0, 1, 19\]\)\) \{ api\.done\(\); api\.saw\("You pinned E1 already/.test(JS) && /!followsE1\(S, D, HOURS24\)\) \{ api\.saw/.test(JS), "steps 2 to 4 check E1 by address before they open Next");
}

// ---------------- the page
{
  has("1,965 MWh <small>=SUM(E5:E28)</small>"); has("$78,600 <small>=SUM(F5:F28)</small>"); has("145 MW <small>=MAX(E5:E28)</small>"); has("120 <small>=B5-C5-D5-$E$1</small>"); has("4,800 <small>=E5*$E$2</small>");
  const S0 = K.staticSheet(D);
  Object.keys(BLOCKS).forEach(name => { const [ra, end] = blockRe(name), a = QMD.match(ra), b = QMD.indexOf(end);
    ok(a && b > a.index && QMD.slice(a.index + a[0].length, b) === S0[BLOCKS[name]] + "\n", "page: the no-JS " + name + " block equals staticSheet() (run with --write)"); });
  ok((S0.table.match(/<tr><td>\d+<\/td><td>\d\d:00<\/td>/g) || []).length === 24, "page: all 24 hours in the no-JS table");
  ["6,957 MWh", "37.3%", "112 MW", "161 MW", "$108,075"].forEach(s => ok(S0.practice.indexOf(s) >= 0, "page: practice answer " + s));
  const L0 = K.layout(D);
  ok(/MWh/.test(L0.cells.A30) && /\$/.test(L0.cells.A30) && /MW/.test(L0.cells.A31) && L0.cells.A2 === "Gas cost, $/MWh", "sheet: the total and peak rows carry their units; E2 is a cost");
  ok(JS.indexOf('|| n === "E1"') > 0 && JS.indexOf("A cost below zero") > 0, "sheet: E1 is locked in the steps, and a negative gas cost is refused in step 7");
  ok(JS.indexOf("a sheet you can trust.\")") < 0 && /consistent/.test(JS) && /not that its inputs are right/.test(QMD), "check cell: agreement is consistency, not correctness");
  // no sentence (or code line) pairs the nuclear input with a cost or price
  QMD.replace(/<[^>]+>/g, " ").split(/(?<=[.!?])\s+|\n/).concat(JS.split(/\n/)).forEach(s => { if (/nuclear/i.test(s) && /(cost|price|(^|[^A-Z])\$\d)/i.test(s) && !/^\s*(\/\/|var cells|A1:)/.test(s) && !/Nuclear output, MW", E1/.test(s)) ok(false, "scope: nuclear and cost in one sentence: " + s.trim().slice(0, 90)); });
  has("<td>24</td><td>19:00</td><td>331</td><td>72</td><td>14</td><td>145</td><td>5,800</td>");
  has("<td>6</td><td>01:00</td><td>243</td><td>28</td><td>0</td><td>115</td><td>4,600</td>");
  has("3 September 2025"); has("$40/MWh");
  // the units quiz asks for the energy the sum stands for, not the unit of a sum of MW
  has("In what unit is the day's gas energy that =SUM(E5:E28) stands for?"); has("A sum of MW values is still in MW; energy is power × duration, each row's MW × 1 h.");
  ok(!/What unit does =SUM\(E5:E28\) have/.test(QMD), "quiz: no claim that summing MW changes the unit");
  // the no-JS explain teaches all four address forms the quiz uses ($A10 is column fixed)
  ok(K.staticSheet(D).addr.indexOf("<tr><td>$E1</td><td>column fixed</td><td>$E2</td><td>$E1</td>") > 0 && K.ADDR.length === 4 && /rows: ADDR\.map/.test(JS), "explain: the four address forms come from one list, in the page and in the no-JS version");
  ok(K.shift("=" + K.ADDR[3].name, 1, 0) === "=" + K.ADDR[3].down && K.shift("=" + K.ADDR[3].name, 0, 1) === "=" + K.ADDR[3].right && K.ADDR.every(a => K.shift("=" + a.name, 1, 0) === "=" + a.down && K.shift("=" + a.name, 0, 1) === "=" + a.right), "explain: every row of the address table is what fill-down and fill-right do");
  // words and wording
  has("Here pandas, a Python tool for tables, holds the day in a table named `df`"); has("A preview: [bridge B2](b02-python-data.html) loads and runs code like this.");
  has("for larger optimization problems, use a solver, through a spreadsheet add-in or code (bridge B1)"); ok(!/choosing the best plan needs a solver/.test(QMD), "Modeler box: a solver is not the only way to compare plans");
  ok(/\["Assumptions in input cells", "Formulas point at input cells, not at typed numbers/.test(JS) && !/No numbers inside formulas/.test(JS), "habits: changeable assumptions in input cells (the practice uses E32)");
  const desc = (QMD.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 30, `budget: the description is ${desc.split(/\s+/).length} words (≤ 30)`);
  ok(/"Practice sheet · about 30 minutes"/.test(JS) && /text: "Type each answer in its yellow cell \(E33 to E37\) as a formula that points at the cells; a typed number, even after =, does not count\."/.test(JS), "practice: the time is in the heading; the instruction is one sentence");
  ok(/text: "Functions work on whole ranges of cells, such as E5:E28\. In F30, use one to add up the day's hourly gas costs\."/.test(JS) && /<b>SUM<\/b>\(E5:E28\) adds the cells from E5 to E28; <b>MAX<\/b>\(E5:E28\) finds the largest/.test(JS), "step 6: two-sentence prompt; SUM and MAX in a reference line beside it");
  ok(JS.indexOf("=SUM(F5:F28)") > 0 && JS.indexOf("=B5-C5-D5-$E$1") > 0 && JS.indexOf("=E5*$E$2") > 0, "js: the step texts name the formulas");
}

console.log(`k07-spreadsheets: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
