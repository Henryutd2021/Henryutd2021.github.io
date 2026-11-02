// test_k07-spreadsheets.js — Node tests for toolbox K7 (assets/learn/k07-spreadsheets.js): the day agrees with lesson 0;
// the formula engine (arithmetic, precedence, ranges, functions, errors, cycles), fill-down with relative, absolute and
// mixed addresses, the sheet the steps build, the practice answers, and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_k07-spreadsheets.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k07-spreadsheets.js"));
const G0 = require(path.join(SITE, "assets/learn/grid-operator.js"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/k07-spreadsheets.qmd"), "utf8");
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
  const T = K.tasks(D), F = K.filled(D); F.rows = 37;
  T.forEach(t => { F.cells[t.cell] = t.hint; }); K.changed(F);
  T.forEach(t => ok(near(K.value(F, t.cell), t.answer, 1e-9), `practice ${t.cell}: the hint formula ${t.hint} gives ${t.answer}`));
  ok(T[0].answer === sum(D.demand) && T[3].answer === Math.max(...D.solar) && T[4].answer === 55 * 1965, "practice: answers from the day");
  ok(near(T[2].answer, (D.need[17] + D.need[18] + D.need[19] + D.need[20] + D.need[21]) / 5) && K.value(F, "A22") === "17:00" && K.value(F, "A26") === "21:00", "practice: E22:E26 is 17:00 to 21:00");
}

// ---------------- the page
{
  has("1,965 <small>=SUM(E5:E28)</small>"); has("78,600 <small>=SUM(F5:F28)</small>"); has("120 <small>=B5-C5-D5-$E$1</small>"); has("4,800 <small>=E5*$E$2</small>");
  has("<td>24</td><td>19:00</td><td>331</td><td>72</td><td>14</td><td>145</td><td>5,800</td>");
  has("<td>6</td><td>01:00</td><td>243</td><td>28</td><td>0</td><td>115</td><td>4,600</td>");
  has("3 September 2025"); has("$40/MWh");
  ok(JS.indexOf("=SUM(F5:F28)") > 0 && JS.indexOf("=B5-C5-D5-$E$1") > 0 && JS.indexOf("=E5*$E$2") > 0, "js: the step texts name the formulas");
}

console.log(`k07-spreadsheets: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
