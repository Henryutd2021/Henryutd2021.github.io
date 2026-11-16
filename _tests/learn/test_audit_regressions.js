// test_audit_regressions.js — regressions from the November 2026 interactive audit.
// Run from the site folder: node _tests/learn/test_audit_regressions.js
"use strict";
const assert = require("assert");
const path = require("path");
const L = p => path.resolve(__dirname, "../../assets/learn", p);
const SH = require(L("components/sheet.js"));
const NA = require(L("components/numanswer.js"));
const { env, load } = require("./stubdom.js");
let checks = 0, fails = 0;
function test(name, fn) {
  checks++;
  try { fn(); } catch (e) { fails++; console.log("FAIL:", name, "—", e.message); }
}
function formula(raw) {
  return SH.value({ cells: { A1: "40", A2: "", A3: "label", B1: raw }, rows: 4, cols: 3 }, "B1");
}

test("fill shifts cell references, not scientific notation", () => {
  assert.strictEqual(SH.shift("=B5*1E3", 1, 0), "=B6*1E3");
  assert.strictEqual(SH.shift("=1e-3+$E$3+E3", 1, 0), "=1e-3+$E$3+E4");
  assert.strictEqual(SH.shift("=SUM(B5:B6)*1E+3", 1, 1), "=SUM(C6:C7)*1E+3");
});
test("aggregate references ignore blanks just as ranges do", () => {
  assert.strictEqual(formula("=AVERAGE(A1,A2)"), 40);
  assert.strictEqual(formula("=AVERAGE(A1:A2)"), 40);
  assert.strictEqual(formula("=COUNT(A1,A2,A3)"), 1);
  assert.strictEqual(formula("=MIN(A1,A2)"), 40);
  assert.strictEqual(formula("=SUM(A1,A3)"), 40);
});
test("arithmetic and scalar functions still coerce a blank reference to zero", () => {
  assert.strictEqual(formula("=A1+A2"), 40);
  assert.strictEqual(formula("=ABS(A2)"), 0);
  assert.strictEqual(formula("=AVERAGE(A1,0)"), 20);
});
test("ROUND uses symmetric half-away-from-zero rounding", () => {
  assert.strictEqual(formula("=ROUND(-1.475,2)"), -1.48);
  assert.strictEqual(formula("=ROUND(-1.5,0)"), -2);
  assert.strictEqual(formula("=ROUND(1.475,2)"), 1.48);
  assert.strictEqual(formula("=ROUND(-150,-2)"), -200);
});

test("ROUND respects decimal ties and truncates the digits argument", () => {
  assert.strictEqual(formula("=ROUND(1.005,2)"), 1.01);
  assert.strictEqual(formula("=ROUND(-1.005,2)"), -1.01);
  assert.strictEqual(formula("=ROUND(1.015,2)"), 1.02);
  assert.strictEqual(formula("=ROUND(123.456,1.5)"), 123.5);
  assert.strictEqual(formula("=ROUND(123.456,-1.5)"), 120);
});

test("numeric answers reject symbols from another dimension and case-sensitive SI prefixes", () => {
  [["450,000%", "kW"], ["$0.45", "GW"], ["145 mW", "MW"], ["15$", "rows"], ["33.8%", undefined]].forEach(([s, u]) => assert.strictEqual(NA.parse(s, u), null, s));
});
test("numeric answers retain legitimate monetary, percentage and exponent formats", () => {
  [["$120", "dollars", 120], ["$120 per kW", "$ per kW", 120], ["120 $/kW", "$ per kW", 120],
   ["$15 million", ["$ million", "million", "M", "$M"], 15], ["$1.5M", ["$M", "million", "M"], 1.5],
   ["85%", "% (back ÷ in)", 85], ["0.25%", "% of hours", 0.25], ["6.96 × 10⁹", "kWh", 6.96e9],
   ["450,000 kw", "kW", 450000]].forEach(([s, u, want]) => assert.strictEqual(NA.parse(s, u), want, s));
});
test("editing a numeric answer invalidates visible feedback without grading the edit", () => {
  const E = env(); load("numanswer", E);
  let graded = 0, changed = 0;
  const a = E.LX.NumAnswer(E.body, { unit: "MW", onChange: () => changed++, onCheck: (v, input) => {
    if (v == null) return;
    graded++; input.classList.add("right"); a.msg.textContent = "Checked answer";
  } });
  a.input.value = "15"; a.go();
  assert.strictEqual(a.msg.hidden, false);
  const before = changed;
  a.input.value = ""; a.input.fire("input");
  assert.strictEqual(graded, 1);
  assert.ok(changed > before);
  assert.strictEqual(a.input.classList.contains("right"), false);
  assert.strictEqual(a.msg.textContent, "");
  assert.strictEqual(a.msg.hidden, true);
  a.go(); assert.strictEqual(graded, 1);
});

test("a clamped slider explains the reachable range", () => {
  const E = env(); load("controls", E);
  const s = E.LX.Slider(E.body, { label: "Gas", max: 150, step: 5, value: 105 });
  s.range(65, 145); s.input.value = "50"; s.input.fire("input");
  assert.strictEqual(s.val(), 65);
  assert.ok(E.body.textContent.includes("65 MW to 145 MW"));
  assert.ok(E.body.querySelector('[aria-live="polite"]').textContent.includes("showing 65 MW"));
});
test("morning advice follows shortage, balance and curtailment", () => {
  const M = require(L("grid-operator.js"));
  assert.ok(/short 20 MW/.test(M.morningAdvice({ unserved: 20, over: 0, curtailed: 0 })));
  assert.ok(/already meets demand/.test(M.morningAdvice({ unserved: 0, over: 0, curtailed: 0 })));
  assert.ok(/curtailed/.test(M.morningAdvice({ unserved: 0, over: 0, curtailed: 15 })));
  assert.ok(/Lower gas/.test(M.morningAdvice({ unserved: 0, over: 10, curtailed: 0 })));
});
test("a method-specific rubric interpretation survives export", () => {
  const R = require(L("components/rubric.js")), c = { id: "uncertainty", reads: "Qualitative findings use triangulation" };
  assert.strictEqual(R.competence(c).reads, c.reads);
  assert.ok(R.summary([c], { uncertainty: "proficient" }).includes(c.reads));
  assert.ok(R.staticHTML([c]).includes(c.reads));
});

test("ROUND handles small representable numbers and refuses non-finite results", () => {
  assert.strictEqual(formula("=ROUND(1.5e-309,309)"), 2e-309);
  assert.strictEqual(formula("=ROUND(1e-310,309)"), 0);
  assert.strictEqual(formula("=ROUND(5e-324,323)"), 1e-323);   // decimal tie, rounded away from zero
  ["=ROUND((-1)^0.5,2)", "=ROUND(1e400,-400)", "=ROUND(1,1e400)", "=ROUND(1.5e308,-308)", "=10^400"].forEach(f => assert.strictEqual(formula(f).err, "#NUM!", f));
});

console.log(`${checks} audit regression checks, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
