// test_k06-vectors-matrices.js — Node tests for toolbox K6 (assets/learn/k06-vectors-matrices.js): the hour is lesson 10's
// (dayOf, the rules and the costs against assets/learn/10-write-it-down.js), lesson 11's model size is right (against
// assets/learn/11-solver.js), the vector algebra holds (A x row by row, the ≤ form passes the same plans as the original
// rules on a grid, checks agree with LX.lp2), the drill's answers are right, and every number the page states matches the
// model (statements one by one, a whitelist scan, printed calculations recomputed). The whitelist scan is supplementary:
// it shows that every number on the page is one the model makes, not that each statement is right; the statements, the
// explain layer's values (explainVals, in the ≤ form) and lesson 11's matrix in both forms are checked one by one.
// The no-JS table must equal staticBlocks().
// Usage (from the site folder):  node _tests/learn/test_k06-vectors-matrices.js [--write]   (--write rewrites the no-JS table)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k06-vectors-matrices.js"));
const L10 = require(path.join(SITE, "assets/learn/10-write-it-down.js"));
const L11 = require(path.join(SITE, "assets/learn/11-solver.js"));
const LP = require(path.join(SITE, "assets/learn/components/lpplane.js"));
const read = f => JSON.parse(fs.readFileSync(path.join(SITE, f), "utf8"));
const TOWN = read("assets/learn/data/town.json"), YEAR = read("assets/learn/data/town_year.json"), D10 = read("assets/learn/data/10-write-it-down.json");
const QPATH = path.join(SITE, "learn/k06-vectors-matrices.qmd");
const s = K.story(TOWN, YEAR, D10), M = s.M, T = K.texts(s), B = K.staticBlocks(s);
const BLOCKS = { "k6-table": "table" };
function blockRe(name) { return [new RegExp("<!-- " + name + ":start[^>]*-->\\n"), "<!-- " + name + ":end -->"]; }
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = q.match(ra), b = q.indexOf(end);
    if (!a || b < a.index) throw new Error(name + " markers missing");
    q = q.slice(0, a.index + a[0].length) + B[BLOCKS[name]] + "\n" + q.slice(b);
  });
  fs.writeFileSync(QPATH, q); console.log("no-JS table written");
}
const QMD = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/k06-vectors-matrices.js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/k06-vectors-matrices.yml"), "utf8");
const PATHY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || JSON.stringify(str)));

// ---------------- the hour is lesson 10's
{
  const day = L10.dayOf(TOWN, YEAR), p = L10.params(TOWN, day, D10), mine = K.dayOf(TOWN, YEAR);
  ok(JSON.stringify(mine.need) === JSON.stringify(day.need), "hour: dayOf gives lesson 10's 24 needs");
  ok(M.hour === 19 && M.need === p.D && M.need === 145, "hour: 19:00, gas must supply 145 MW (lesson 10's D)");
  ok(M.c[0] === p.cx && M.c[1] === p.cy && M.c.join() === "40,100", "costs: c = (40, 100), as lesson 10");
  const R = L10.rulesOf(p);
  ok(R.length === 4 && R.every((r, i) => r.a.join() === M.rows[i].a.join() && r.op === M.rows[i].op && r.b === M.rows[i].b), "rules: A, signs and b are lesson 10's rulesOf()");
  ok(D10.cap === 100 && M.rows[3].a.join() === "0.37,0.55", "rules: the CO2 row (0.37, 0.55) ≤ 100 t");
  // the best plan of lesson 10's hour, for the quiz's (145, 0)
  const sol = L10.solve2(p);
  ok(sol.status === "optimal" && sol.best[0].x === 145 && sol.best[0].y === 0 && near(sol.co2, 53.65, 1e-9) && near(K.dot(M.rows[3].a, [145, 0]), 53.65, 1e-12), "quiz: (145, 0) is lesson 10's best plan; its CO2 row is 53.65");
}

// ---------------- lesson 11's day: as its solver stores it (72 rows, 24 of them equalities, 190 non-zero entries, sizes as
// bounds) and written strictly as A x ≤ b (each equality two rows: 96 rows, 286 non-zero entries)
{
  const W = L11.dayOf(TOWN, YEAR), m = L11.buildLP(W, L11.settings(), 1000);
  let nz = 0, nzEq = 0, eq = 0; m.constraints.forEach(c => { const k = Object.keys(c.terms).filter(t => c.terms[t] !== 0).length; nz += k; if ("eq" in c) { eq++; nzEq += k; } });
  ok(m.variables.length === s.l11.cols && m.constraints.length === s.l11.rows && nz === s.l11.nz && eq === s.l11.eq, `lesson 11 as stored: ${m.constraints.length} rows (${eq} equalities) × ${m.variables.length} columns, ${nz} non-zero entries`);
  ok(m.constraints.length + eq === s.l11.leRows && nz + nzEq === s.l11.leNz && s.l11.leRows === 96 && s.l11.leNz === 286, `lesson 11 strictly as A x ≤ b: ${m.constraints.length + eq} rows, ${nz + nzEq} non-zero entries`);
  ok(m.variables.filter(v => v.ub != null).length === 72 && m.constraints.every(c => Object.keys(c.terms).length > 0), "lesson 11: plant and spill limits are variable bounds, not rows");
  ok(s.l11.cells === 6912 && (s.l11.share * 100).toFixed(1) === "2.7", "lesson 11: 6,912 entries, 2.7% not zero");
  ok(/The model has 96 decisions and 72 rules/.test(fs.readFileSync(path.join(SITE, "learn/11-solver.qmd"), "utf8")), "lesson 11's own page says 96 decisions and 72 rules");
}

// ---------------- the algebra
{
  ok(s.cost === 8500 && s.costSwap === 11800, "dot: c · (100, 45) = 8,500; c · (45, 100) = 11,800");
  ok(s.Ax.join() === "145,100,45,61.75" && K.vec(s.Ax) === "(145, 100, 45, 61.75)", "A x = (145, 100, 45, 61.75)");
  ok(s.le.A[0].join() === "-1,-1" && s.le.b[0] === -145 && s.le.A.slice(1).every((r, i) => r.join() === M.rows[i + 1].a.join()), "≤ form: only the cover row flips");
  let bad = 0;
  for (let x = 0; x <= 160; x += 2.5) for (let y = 0; y <= 120; y += 2.5) {
    const ck = K.check(M, [x, y]), le = s.le.A.map((r, i) => K.dot(r, [x, y]) <= s.le.b[i] + 1e-9), lp = M.rows.map(r => LP.holds(r, [x, y], 1e-9));
    if (ck.some((c, i) => c.pass !== le[i] || c.pass !== lp[i])) bad++;
  }
  ok(bad === 0, "checks: the original rules, the ≤ form and LX.lp2 agree on a grid of plans (" + bad + " bad)");
  ok(K.onlyFails(M, [150, 100], "co2") && near(K.dot(M.rows[3].a, [150, 100]), 110.5) && s.co2Max === 110.5, "step 6: (150, 100) fails only the CO2 row, emitting 110.5 t");
  // the cover rule lets surplus pass: step 6's example stays within the 86 MW of wind and sun lesson 10 could spill
  const d10 = L10.dayOf(TOWN, YEAR);
  ok(M.spill === 86 && M.spill === d10.wind[19] + d10.solar[19], "toy model: 86 MW of wind and sun could be spilled at 19:00, as lesson 10");
  ok(s.target.join() === "130,100" && K.onlyFails(M, s.target, "co2") && near(s.targetCo2, 103.1, 1e-9) && s.targetExtra === 85 && s.targetExtra <= M.spill, "step 6: the example (130, 100) fails only the CO2 row (103.1 t), its 85 MW extra within the spill limit");
  ok(T.fail(s.target) === "x = (130, 100) passes cover and both sizes but emits 103.1 t: only the CO₂ row fails. Its 85 MW of extra gas means [[curtailment|curtailing]], turning down, 85 MW of wind and sun (lesson 10)." && /Its 105 MW extra gas exceeds the 86 MW of wind and sun, a limit left out here\./.test(T.fail([150, 100])) && !/spill/i.test(T.fail(s.target) + T.fail([150, 100])), "step 6: the message says where a plan's extra goes, or that the toy model lets it pass");
  ok(/autos\[5\] = function \(\) \{ sl\.set\(s\.target\)/.test(JS), "step 6: the shortcut sets the example within the spill limit");
  // nonnegativity: the four rows let (150, −5) pass; the sliders stop at 0, and the page says so
  ok(K.check(M, [150, -5]).every(r => r.pass) && /min: 0, max: 160/.test(JS) && /min: 0, max: 120/.test(JS) && /Outputs cannot be negative, x₁ ≥ 0 and x₂ ≥ 0: the sliders stop at 0/.test(QMD) && /hint: T\.nonneg/.test(JS) && /text: T\.nonneg/.test(JS), "nonnegativity: stated in the data note, step 6 and the explain layer; the sliders enforce it");
  ok(K.check(M, s.plan).every(r => r.pass), "the plan (100, 45) passes every rule");
  // step 6 has a reachable target: the plans on its slider grid that fail only the CO2 row
  let n = 0; for (let x = 0; x <= 160; x += 5) for (let y = 0; y <= 120; y += 5) if (K.onlyFails(M, [x, y], "co2")) n++;
  ok(n > 5, "step 6: " + n + " plans on the sliders' 5 MW grid fail only the CO2 row");
}

// ---------------- the page: statements one by one
{
  has("x = (x₁, x₂) = (100, 45) is 100 MW from the <span class=\"lx-term\" data-term=\"combined-cycle\">combined-cycle plant</span> and 45 MW from the <span class=\"lx-term\" data-term=\"peaker\">peaker</span>; (45, 100) is a different plan.");
  has("Each output lasts one hour (100 MW × 1 h = 100 MWh), so the cost is a dot product: c · x = 40 × 100 + 100 × 45 = 8,500 dollars.");
  ok(T.hour === "Each output runs one hour: 100 MW × 1 h = 100 MWh, and dollars per MWh times MWh gives dollars for the hour." && /H\("p", \{ class: "lx-hint", text: T\.hour \}, act\)/.test(JS), "units: step 2 says each output runs one hour");
  has("A x is every row's dot product with x: (145, 100, 45, 61.75), one number per rule.");
  has("Multiplying the cover row by −1 turns x₁ + x₂ ≥ 145 into −x₁ − x₂ ≤ −145, so every row reads ≤.");
  has("(130, 100) supplies at least the 145 MW and fits both plants, but emits 103.1 t, so only the CO₂ row fails.");
  has("A is 4 × 2 here. Lesson 11's day has 4 decisions in each of 24 hours, so 96 columns.");
  has("As lesson 11's <span class=\"lx-term\" data-term=\"solver\">solver</span> stores that day, it has 72 rows, 24 of them equalities; only 190 of its 6,912 entries are not zero.");
  has("The count depends on the form. Lesson 11's day, as stored, has 72 rows, 24 of them equalities; strictly as A x ≤ b, each becomes two rows: 96 rows, 286 non-zero entries.");
  has("Lesson 11's day as its solver stores it, 24 of the rows equalities; 190 entries are not zero.");
  has("A toy model, as in lesson 10: the cover rule asks for at least 145 MW. Extra gas means <span class=\"lx-term\" data-term=\"curtailment\">curtailing</span> as much wind and sun, at most 86 MW at 19:00, a limit left out here.");
  ok(!/spilled|spilling/.test(QMD.replace(/<!--[\s\S]*?-->/g, "")) && !/spilled|spilling/.test(JS.replace(/^\s*\/\/.*$/gm, "")), "curtailment: extra gas turns wind and sun down; nothing is 'spilled as wind and sun'");
  ok(!/Solvers often want/.test(JS) && /We write every rule with ≤, so the four rows share one form/.test(JS), "step 5: ≤ is this page's chosen form, not a solver requirement (HiGHS takes row bounds)");
  ok(/their limits form a vector b\./.test(JS) && /st\.b \? "Limit b" : ""/.test(JS), "step 3: b is introduced with the matrix, and its column is labelled Limit b");
  ok(T.size === "4 decisions × 24 hours = 96 columns: one per decision in each hour, as here." && /^Rows and zeros: /.test(T.sizeRows), "step 7: the feedback counts columns; rows and zeros are their own labelled element");
  ok(/hint: T\.nonneg\n/.test(JS) && /H\("p", \{ class: "lx-hint", text: "Building these arrays in code comes later, in B2 and M1\." \}, eqHost\)/.test(JS), "explain: the nonnegativity hint and the coding pointer are separate elements");
  has("running costs ($40 and $100 per MWh, 2025 dollars)");
  has("Lessons 10 and B1 call the two outputs x and y; here they are x₁ and x₂, the entries of the plan vector x.");
  has("the first costs 8,500 dollars, the second 11,800"); has("x + y ≥ 145 and −x − y ≤ −145 pass exactly the same plans.");
  has("(145, 53.65): 1 × 145 + 1 × 0 = 145 and 0.37 × 145 + 0.55 × 0 = 53.65. (145, 79.75) uses the peaker's rate on the combined-cycle MW.");
  ok(near(0.55 * 145, 79.75, 1e-9), "quiz: 79.75 is 0.55 × 145, the named slip");
  has("48 rows × 72 columns: one row per rule (2 × 24 = 48) and one column per decision (3 × 24 = 72).");
  has("190 non-zero entries out of 6,912, about 2.7%");
  ok(/^title: "Vectors and matrices: what Ax ≤ b means"$/m.test(QMD) && /  title: "Vectors and matrices: what Ax ≤ b means"\n/.test(PATHY) && !/Ax <= b/.test(QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "")), "title: 'Ax ≤ b' with the real ≤, on the page and in path.yml");
  // every element of the no-JS fallback, the data note and Go deeper holds one idea within the budget (about 35 words)
  const elems = [].concat((QMD.match(/<li>[\s\S]*?<\/li>/g) || []).filter(t => !/data-value=/.test(t) && !/<li>(Boyd|HiGHS documentation|Where this is used)/.test(t)), QMD.match(/^- \*\*[\s\S]*?$/gm) || []);
  const words = t => t.replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/\$[^$]*\$/g, " x ").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
  const long = elems.filter(t => words(t) > 36).map(t => words(t) + ": " + t.replace(/<[^>]+>/g, "").slice(0, 50));
  ok(elems.length >= 15 && long.length === 0, "budget: " + elems.length + " fallback, data-note and Go deeper elements are 36 words or fewer: " + JSON.stringify(long));
  // the D1 explain layer stays at ordered lists, rows and matching entries: no NumPy or sparse-storage code
  ok(!/np\.|numpy|scipy|csr_matrix|A @ x/i.test(JS.replace(/\/\/.*$/gm, "")) && !/key: "code"/.test(JS) && /Building these arrays in code comes later, in B2 and M1/.test(JS) && /\[B2\]\(b02-python-data\.html\)/.test(QMD), "depth: no NumPy or sparse-storage code in the explain layer; code is B2 and M1's");
  ok(/data-id="ax" data-answer="b"[\s\S]{0,300}<li data-value="b">\(145, 53\.65\)<\/li>/.test(QMD) && /data-id="shape" data-answer="c"[\s\S]{0,300}<li data-value="c">48 rows × 72 columns<\/li>/.test(QMD), "quiz: answers point at the right options");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = QMD.match(ra), b = QMD.indexOf(end);
    ok(a && b > a.index && QMD.slice(a.index + a[0].length, b).trim() === B[BLOCKS[name]].trim(), `page: the ${name} table equals staticBlocks() (run with --write)`);
  });
  ["10-write-it-down.html", "11-solver.html", "b01-algebra-to-lp.html", "k04-linear-equations.html", "m01-dispatch-to-lmp.html"].forEach(h => ok(QMD.indexOf('href="' + h + '"') >= 0 || QMD.indexOf("](" + h + ")") >= 0, "links " + h));
  ok(/LX\.lessonRefHTML\(data\.path, c\)/.test(JS) && /\[10, 11, "B1"\]/.test(JS) && /path\.json/.test(QMD), "step 7 links lessons 10, 11 and B1 through LX.lessonRefHTML");
  ok(/\[M9\]\(m09-surrogates-uq\.html\)/.test(QMD) && !/M9, upcoming/.test(QMD), "M9 linked: it is live");
  ok(/doi\.org\/10\.1017\/9781108583664/.test(QMD) && /ergo-code\.github\.io\/HiGHS\/stable\//.test(QMD) && /EIA-930/.test(QMD) && /illustrative/.test(QMD), "sources: Boyd and Vandenberghe, HiGHS docs, EIA-930; illustrative values labelled");
  const body = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "");
  ok(!/nuclear|reactor|\bSMR\b|data cent|learning/i.test(body) && !/nuclear|reactor|data cent|learning/i.test(JS.replace(/\/\/.*$/gm, "").replace(/f\.nuclear\.mw/g, "")), "scope: no nuclear wording, no data centers, no learning wording");
}

// ---------------- every number in the visible text is one the model produces (whitelist scan)
{
  let body = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ");
  const allowed = new Set(), add = v => allowed.add(String(v));
  [100, 45, 40, 145, 150, 61.75, "8,500", "11,800", 110.5, 0.37, 0.55, 53.65, 79.75, 72, 96, 190, "6,912", "2.7", 48, 24, 3, 2, 4, 1, 0, 19, 10, 11, 5, 7, 2018, 2025, 9781108583664, "10.1017", "00", 930, 9, 130, "103.1", 86, 286].forEach(add);   // 19:00, EIA-930, M9
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "every number on the page is from the model or a structural count; unknown: " + unknown.join(" "));
  ok(found.length > 60, `the scan saw the page's numbers (${found.length})`);
}

// ---------------- messages, drill, interactive, path.yml
function normCalc(str) { let t = String(str).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/[−–]/g, "-").replace(/\$/g, ""); while (/(\d),(\d{3})/.test(t)) t = t.replace(/(\d),(\d{3})/g, "$1$2"); return t; }
function evalSide(side) { const e = side.replace(/×/g, "*").replace(/÷/g, "/"); if (!/^[\d.\s()+\-*/]+$/.test(e)) return null; try { const v = Function('"use strict"; return (' + e + ");")(); return isFinite(v) ? v : null; } catch (err) { return null; } }
{
  const msgs = { plan: T.plan, hour: T.hour, cost: T.cost, rows: T.rows, co2: T.co2, flip: T.flip, fail: T.fail(s.target), fail2: T.fail([150, 100]), nonneg: T.nonneg, size: T.size, sizeRows: T.sizeRows,
                 now1: T.now([100, 45]), now2: T.now([60, 40]), now3: T.now([130, 100]) };
  ok(T.now([100, 45]) === "x = (100, 45) passes every row, at 61.75 t of CO₂." && T.now([60, 40]) === "x = (60, 40) fails the cover row." && T.now([130, 100]) === T.fail([130, 100]) && T.now([155, 120]) === "x = (155, 120) fails the combined-cycle size and peaker size and CO₂ rows.", "step 6: the after-success message describes the current plan: " + T.now([155, 120]));
  Object.keys(msgs).forEach(k => { const w = msgs[k].replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).filter(Boolean).length; ok(w <= 36, `budget: message ${k} is ${w} words (≤ 36)`); });
  let calc = 0;
  const runCalc = (label, str) => (normCalc(str).match(/[\d.()+\-× ]+=[ \d.\-]+/g) || []).forEach(run => { const [L, R0] = run.split("="), R = R0.trim().replace(/\.$/, ""); const lv = evalSide(L.trim()); if (lv !== null && /^-?[\d.]+$/.test(R)) { calc++; ok(Math.abs(lv - +R) < 1e-6, `${label}: ${run.trim()}`); } });
  Object.keys(msgs).forEach(k => runCalc("msg " + k, msgs[k]));
  const items = K.drill(42, 600), counts = {};
  items.forEach((it, i) => {
    counts[it.kind] = (counts[it.kind] || 0) + 1;
    runCalc("drill " + i, it.why);
    if (it.kind === "dot") { const m = /c = \((\d+), (\d+)\).*x = \((\d+), (\d+)\)/.exec(it.q); ok(it.answer === m[1] * m[3] + m[2] * m[4], `drill ${i}: dot`); }
    if (it.kind === "row") { const m = /is \(([\d.]+), ([\d.]+)\).*x = \((\d+), (\d+)\)/.exec(it.q); ok(near(it.answer, m[1] * m[3] + m[2] * m[4], 1e-9), `drill ${i}: row`); }
    if (it.kind === "pass") { const m = /Rule: (\d)x₁ \+ (\d)x₂ (≥|≤) (-?\d+)\. Does the plan x = \((\d+), (\d+)\)/.exec(it.q), l = m[1] * m[5] + m[2] * m[6]; ok((it.answer === 0) === (m[3] === "≥" ? l >= +m[4] : l <= +m[4]), `drill ${i}: pass`); }
    if (it.kind === "flip") { const m = /Write (\d)x₁ \+ (\d)x₂ ≥ (\d+)/.exec(it.q); ok(it.choices[it.answer] === "(−" + m[1] + ", −" + m[2] + ") with limit −" + m[3] && new Set(it.choices).size === 4, `drill ${i}: flip`); }
    if (it.kind === "size") { const m = /has (\d) decisions and (\d) rules? in each of (\d+) hours?/.exec(it.q); ok(it.choices[it.answer] === (m[2] * m[3]).toLocaleString("en-US") + " rows × " + (m[1] * m[3]).toLocaleString("en-US") + " columns", `drill ${i}: size`); }
    if (it.kind === "matvec") { const m = /A = \[\((\d), (\d)\), \((\d), (\d)\)\].*x = \((\d+), (\d+)\)\. What is entry (\d)/.exec(it.q), r = +m[7] === 1 ? [m[1], m[2]] : [m[3], m[4]]; ok(it.answer === r[0] * m[5] + r[1] * m[6], `drill ${i}: matvec`); }
  });
  ok(Object.keys(counts).length === 6 && calc > 300, "drill: six kinds; the worked answers' arithmetic checked (" + calc + ")");
  ["vector", "dot-product", "matrix"].forEach(id => ok(new RegExp("id: " + id + "\\n").test(SIDE) && JS.indexOf("[[" + id + "|") >= 0, "glossary: " + id + " defined and marked"));
  const GLOSS = fs.readFileSync(path.join(SITE, "learn/glossary.yml"), "utf8");
  ["combined-cycle", "peaker", "solver"].forEach(id => ok(new RegExp("- id: " + id + "\\n").test(GLOSS) && JS.indexOf("[[" + id + "|") >= 0, "glossary: " + id + " (course glossary) marked at first use"));
  ok(/data-term="combined-cycle"/.test(QMD) && /data-term="peaker"/.test(QMD), "glossary: the fallback marks combined-cycle and peaker");
  // prompts: one or two sentences each, within the budget; every card reads them from prompts()
  const Q = K.prompts(s), plain = t => t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1"), sentences = t => (plain(t).match(/[.!?](?=\s+[A-Z(]|$)/g) || []).length;
  ok(Q.length === 7 && [0, 1, 2, 3, 4, 5, 6].every(i => JS.indexOf("text: Q[" + i + "]") >= 0), "steps: seven cards, each prompt from prompts()");
  Q.forEach((q, i) => { const w = plain(q).split(/\s+/).length; ok(sentences(q) <= 2 && w <= 35, `prompt ${i + 1}: ${sentences(q)} sentences, ${w} words (≤ 2, ≤ 35)`); });
  // the explain layer's values are the ≤ form the equation shows (the cover row flipped), the original named apart
  const ev = K.explainVals(s, s.plan, false), evOwn = K.explainVals(s, [130, 100], true);
  ok(ev.Ax === "The plan x = (100, 45): A x = (−145, 100, 45, 61.75) in the ≤ form. Before the flip, the cover entry is 145." && K.vec(K.matvec(s.le.A, s.plan)) === "(−145, 100, 45, 61.75)", "explain: A x in the ≤ form");
  ok(ev.b === "Lesson 10's hour: b = (−145, 150, 100, 100) in the ≤ form. Before the flip, the cover limit is 145, with ≥." && K.vec(s.le.b) === "(−145, 150, 100, 100)", "explain: b in the ≤ form");
  ok(ev.A === "Lesson 10's hour: 4 rows × 2 columns. In the ≤ form the cover row is (−1, −1), its original (1, 1) times −1." && /^Your last plan, x = \(130, 100\): A x = \(−230, 130, 100, 103\.1\) in the ≤ form/.test(evOwn.Ax) && ev.c === "The plan x = (100, 45): c · x = $8,500 for the hour.", "explain: A, the reader's plan and the cost");
  ok(/return explainVals\(s, o \|\| s\.plan, !!o\)\[kind\]/.test(JS), "explain: the equation card reads explainVals()");
  // the matrix rows are buttons whose names say every number with its column and unit
  ok(K.rowSpeech(M.rows[3], 3, { ax: s.Ax, b: true, check: K.check(M, s.plan) }) === "CO₂ cap row: 0.37 times x₁ plus 0.55 times x₂, A x = 61.75 t of CO₂, at most 100 t of CO₂, passes." &&
     K.rowSpeech(M.rows[0], 0, { ax: s.Ax, b: true, le: true }) === "Cover row: −1 times x₁ plus −1 times x₂, A x = −145 MW, at most −145 MW." &&
     K.rowSpeech(M.rows[3], 3, { ax: [145, 100, 45, null], b: true }) === "CO₂ cap row: 0.37 times x₁ plus 0.55 times x₂, not worked out yet, at most 100 t of CO₂.", "a11y: each matrix row's spoken name");
  ok(/"aria-label": rowSpeech\(r, i, st\)/.test(JS) && /class: "k6-row head", "aria-hidden": "true"/.test(JS), "a11y: row buttons carry rowSpeech(); the visual header is hidden from screen readers");
  ok(/if \(p\[0\] === s\.plan\[0\] && p\[1\] === s\.plan\[1\] && !hit\) \{ hit = true; api\.done\(\)/.test(JS) && /if \(close\(v, s\.cost, 0\.5\)\) \{ api\.done\(\)/.test(JS) && /if \(n === 4\) \{ api\.done\(\)/.test(JS) && /if \(close\(v, s\.co2, 0\.005\)\)/.test(JS) && /if \(only && !hit\) \{ hit = true; api\.done\(\)/.test(JS) && /if \(v === s\.l11\.cols\) \{ api\.done\(\)/.test(JS), "steps: each card's action is checked before Next opens");
  ok(/"aria-live": "polite"/.test(JS) && /LX\.demo\(root,/.test(JS) && /autos\[6\]/.test(JS) && /LX\.Drill\(host, \{/.test(JS) && /LX\.NumAnswer\(act/.test(JS), "live regions, demo hook, NumAnswer and Drill");
  ok(/LX\.EquationCard\(/.test(JS) && /LX\.LinkedViews\(/.test(JS) && /LX\.CompareTable\(/.test(JS), "explain: equation card, linked views, comparison table");
  ok(/id: k06-vectors-matrices\n  code: K6\n  form: cards\n  path: k06-vectors-matrices\.qmd\n  status: active\n  minutes: 25\n  practice_minutes: 30/.test(PATHY) && /after: \[K4\]\n  next: B1/.test(PATHY), "path.yml: K6 active, 25 + 30 minutes, after K4, next B1");
  const sub = (QMD.match(/^subtitle: "([^"]+)"/m) || [])[1];
  ok(PATHY.indexOf('subtitle: "' + sub + '"') >= 0, "path.yml: subtitle equals the page's");
  const desc = (QMD.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 35, `budget: the description is ${desc.split(/\s+/).length} words (≤ 35)`);
}

// ---------------- the page on a stub document: it mounts, with its explain layer; the matrix rows carry their spoken names
{
  const vm = require("vm");
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.contains) El.prototype.contains = function (n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; };   // the stub has no contains()
  const E = env();
  E.LX.ready = () => {}; E.LX.visible = () => false; E.LX.progress.guess = () => null;
  E.LX.lessonRefHTML = (p, c) => "<a>" + c + "</a>";
  ["numanswer", "drill", "cards", "controls", "lpplane", "equation", "linkedviews", "table"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "k06") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {}, IntersectionObserver: undefined };
  let threw = null;
  const xp = E.LX.H("div", { id: "k6-explain" }, E.body);
  try {
    vm.runInNewContext(JS, mctx);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "k06" }, E.body), live = E.LX.H("div", null, root);
    init(live, { town: TOWN, town_year: YEAR, "10_write_it_down": D10, path: {} }, root);
  } catch (e) { threw = e.stack || e.message; }
  ok(!threw && demo && demo.cards, "stub: the page mounts with its explain layer" + (threw ? ": " + threw : ""));
  if (!threw && demo) try {
    ok(/Outputs cannot be negative/.test(xp.textContent) && !/np\./.test(xp.textContent), "stub: the explain layer states nonnegativity and shows no NumPy");
    const card = () => demo.cards.el;
    [0, 1, 2, 3, 4, 5, 6].forEach(k => { demo.cards.go(k); ok(card().textContent.length > 0, "stub: step " + (k + 1) + " builds"); });
    demo.cards.go(3);
    const rows = card().querySelectorAll("button").filter(b => /k6-row/.test(b.getAttribute("class") || ""));
    ok(rows.length === 4 && rows[3].getAttribute("aria-label") === "CO₂ cap row: 0.37 times x₁ plus 0.55 times x₂, not worked out yet, at most 100 t of CO₂.", "stub: step 4's matrix rows carry their spoken names (" + (rows[3] && rows[3].getAttribute("aria-label")) + ")");
    // step 6: reach a CO2-only failure, then move back inside: the feedback follows the plan
    demo.cards.go(5);
    const btn = re => card().querySelectorAll("button").filter(b => re.test(b.getAttribute("aria-label") || b.textContent))[0];
    const saw = () => (card().querySelector(".lx-saw") || { textContent: "" }).textContent;
    const upX = btn(/^Raise x₁/), downX = btn(/^Lower x₁/), upY = btn(/^Raise x₂/), downY = btn(/^Lower x₂/);
    for (let i = 0; i < 6; i++) upX.click(); for (let i = 0; i < 11; i++) upY.click();   // (100, 45) → (130, 100)
    ok(/only the CO₂ row fails/.test(saw()) && /103\.1 t/.test(saw()), "stub: (130, 100) fails only the CO₂ row: " + saw());
    for (let i = 0; i < 6; i++) downX.click(); for (let i = 0; i < 11; i++) downY.click();   // back to (100, 45)
    ok(/x = \(100, 45\) passes every row, at 61\.75 t of CO₂/.test(saw()) && !/103\.1/.test(saw()), "stub: back at (100, 45), the feedback says every row passes: " + saw());
  } catch (e) { ok(false, "stub: the page test threw: " + (e && e.stack || e)); }
}

console.log(`k06-vectors-matrices: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
