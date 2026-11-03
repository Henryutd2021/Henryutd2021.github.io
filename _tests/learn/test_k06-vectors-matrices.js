// test_k06-vectors-matrices.js — Node tests for toolbox K6 (assets/learn/k06-vectors-matrices.js): the hour is lesson 10's
// (dayOf, the rules and the costs against assets/learn/10-write-it-down.js), lesson 11's model size is right (against
// assets/learn/11-solver.js), the vector algebra holds (A x row by row, the ≤ form passes the same plans as the original
// rules on a grid, checks agree with LX.lp2), the drill's answers are right, and every number the page states matches the
// model (statements one by one, a whitelist scan, printed calculations recomputed). The no-JS table must equal staticBlocks().
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

// ---------------- lesson 11's day as A x ≤ b: 72 rows, 96 columns, 190 non-zero entries
{
  const W = L11.dayOf(TOWN, YEAR), m = L11.buildLP(W, L11.settings(), 1000);
  let nz = 0; m.constraints.forEach(c => { nz += Object.keys(c.terms).filter(k => c.terms[k] !== 0).length; });
  ok(m.variables.length === s.l11.cols && m.constraints.length === s.l11.rows && nz === s.l11.nz, `lesson 11: ${m.constraints.length} rows × ${m.variables.length} columns, ${nz} non-zero entries`);
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
  ok(K.check(M, s.plan).every(r => r.pass), "the plan (100, 45) passes every rule");
  // step 6 has a reachable target: the plans on its slider grid that fail only the CO2 row
  let n = 0; for (let x = 0; x <= 160; x += 5) for (let y = 0; y <= 120; y += 5) if (K.onlyFails(M, [x, y], "co2")) n++;
  ok(n > 5, "step 6: " + n + " plans on the sliders' 5 MW grid fail only the CO2 row");
}

// ---------------- the page: statements one by one
{
  has("x = (100, 45) is 100 MW from the combined-cycle plant and 45 MW from the peaker; (45, 100) is a different plan.");
  has("c · x = 40 × 100 + 100 × 45 = 8,500 dollars for the hour.");
  has("A x is every row's dot product with x: (145, 100, 45, 61.75), one number per rule.");
  has("Multiplying the cover row by −1 turns x + y ≥ 145 into −x − y ≤ −145, so every row reads ≤.");
  has("(150, 100) covers the 145 MW and fits both plants, but emits 110.5 t, so only the CO₂ row fails.");
  has("lesson 11's day is 72 rows × 96 columns, with only 190 of its 6,912 entries not zero.");
  has("the first costs 8,500 dollars, the second 11,800"); has("x + y ≥ 145 and −x − y ≤ −145 pass exactly the same plans.");
  has("(145, 53.65): 1 × 145 + 1 × 0 = 145 and 0.37 × 145 + 0.55 × 0 = 53.65. (145, 79.75) uses the peaker's rate on the combined-cycle MW.");
  ok(near(0.55 * 145, 79.75, 1e-9), "quiz: 79.75 is 0.55 × 145, the named slip");
  has("48 rows × 72 columns: one row per rule (2 × 24 = 48) and one column per decision (3 × 24 = 72).");
  has("190 non-zero entries out of 6,912, about 2.7%");
  ok(/data-id="ax" data-answer="b"[\s\S]{0,300}<li data-value="b">\(145, 53\.65\)<\/li>/.test(QMD) && /data-id="shape" data-answer="c"[\s\S]{0,300}<li data-value="c">48 rows × 72 columns<\/li>/.test(QMD), "quiz: answers point at the right options");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = QMD.match(ra), b = QMD.indexOf(end);
    ok(a && b > a.index && QMD.slice(a.index + a[0].length, b).trim() === B[BLOCKS[name]].trim(), `page: the ${name} table equals staticBlocks() (run with --write)`);
  });
  ["10-write-it-down.html", "11-solver.html", "b01-algebra-to-lp.html", "k04-linear-equations.html", "m01-dispatch-to-lmp.html"].forEach(h => ok(QMD.indexOf('href="' + h + '"') >= 0 || QMD.indexOf("](" + h + ")") >= 0, "links " + h));
  ok(/LX\.lessonRefHTML\(data\.path, c\)/.test(JS) && /\[10, 11, "B1"\]/.test(JS) && /path\.json/.test(QMD), "step 7 links lessons 10, 11 and B1 through LX.lessonRefHTML");
  ok(!/href="[^"]*m09/.test(QMD) && /M9, upcoming/.test(QMD), "M9 is named as upcoming, not linked");
  ok(/doi\.org\/10\.1017\/9781108583664/.test(QMD) && /ergo-code\.github\.io\/HiGHS\/stable\//.test(QMD) && /EIA-930/.test(QMD) && /illustrative/.test(QMD), "sources: Boyd and Vandenberghe, HiGHS docs, EIA-930; illustrative values labelled");
  const body = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "");
  ok(!/nuclear|reactor|\bSMR\b|data cent|learning/i.test(body) && !/nuclear|reactor|data cent|learning/i.test(JS.replace(/\/\/.*$/gm, "").replace(/f\.nuclear\.mw/g, "")), "scope: no nuclear wording, no data centers, no learning wording");
}

// ---------------- every number in the visible text is one the model produces (whitelist scan)
{
  let body = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ");
  const allowed = new Set(), add = v => allowed.add(String(v));
  [100, 45, 40, 145, 150, 61.75, "8,500", "11,800", 110.5, 0.37, 0.55, 53.65, 79.75, 72, 96, 190, "6,912", "2.7", 48, 24, 3, 2, 4, 1, 0, 19, 10, 11, 5, 7, 2018, 2025, 9781108583664, "10.1017", "00", 930, 9].forEach(add);   // 19:00, EIA-930, M9
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "every number on the page is from the model or a structural count; unknown: " + unknown.join(" "));
  ok(found.length > 60, `the scan saw the page's numbers (${found.length})`);
}

// ---------------- messages, drill, interactive, path.yml
function normCalc(str) { let t = String(str).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/[−–]/g, "-").replace(/\$/g, ""); while (/(\d),(\d{3})/.test(t)) t = t.replace(/(\d),(\d{3})/g, "$1$2"); return t; }
function evalSide(side) { const e = side.replace(/×/g, "*").replace(/÷/g, "/"); if (!/^[\d.\s()+\-*/]+$/.test(e)) return null; try { const v = Function('"use strict"; return (' + e + ");")(); return isFinite(v) ? v : null; } catch (err) { return null; } }
{
  const msgs = { plan: T.plan, cost: T.cost, rows: T.rows, co2: T.co2, flip: T.flip, fail: T.fail([150, 100]), size: T.size };
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
    if (it.kind === "pass") { const m = /Rule: (\d)x \+ (\d)y (≥|≤) (-?\d+)\. Does the plan x = \((\d+), (\d+)\)/.exec(it.q), l = m[1] * m[5] + m[2] * m[6]; ok((it.answer === 0) === (m[3] === "≥" ? l >= +m[4] : l <= +m[4]), `drill ${i}: pass`); }
    if (it.kind === "flip") { const m = /Write (\d)x \+ (\d)y ≥ (\d+)/.exec(it.q); ok(it.choices[it.answer] === "(−" + m[1] + ", −" + m[2] + ") with limit −" + m[3] && new Set(it.choices).size === 4, `drill ${i}: flip`); }
    if (it.kind === "size") { const m = /has (\d) decisions and (\d) rules? in each of (\d+) hours?/.exec(it.q); ok(it.choices[it.answer] === (m[2] * m[3]).toLocaleString("en-US") + " rows × " + (m[1] * m[3]).toLocaleString("en-US") + " columns", `drill ${i}: size`); }
    if (it.kind === "matvec") { const m = /A = \[\((\d), (\d)\), \((\d), (\d)\)\].*x = \((\d+), (\d+)\)\. What is entry (\d)/.exec(it.q), r = +m[7] === 1 ? [m[1], m[2]] : [m[3], m[4]]; ok(it.answer === r[0] * m[5] + r[1] * m[6], `drill ${i}: matvec`); }
  });
  ok(Object.keys(counts).length === 6 && calc > 300, "drill: six kinds; the worked answers' arithmetic checked (" + calc + ")");
  ["vector", "dot-product", "matrix"].forEach(id => ok(new RegExp("id: " + id + "\\n").test(SIDE) && JS.indexOf("[[" + id + "|") >= 0, "glossary: " + id + " defined and marked"));
  ok(/if \(p\[0\] === s\.plan\[0\] && p\[1\] === s\.plan\[1\] && !hit\) \{ hit = true; api\.done\(\)/.test(JS) && /if \(close\(v, s\.cost, 0\.5\)\) \{ api\.done\(\)/.test(JS) && /if \(n === 4\) \{ api\.done\(\)/.test(JS) && /if \(close\(v, s\.co2, 0\.005\)\)/.test(JS) && /if \(only && !hit\) \{ hit = true; api\.done\(\)/.test(JS) && /if \(v === s\.l11\.cols\) \{ api\.done\(\)/.test(JS), "steps: each card's action is checked before Next opens");
  ok(/"aria-live": "polite"/.test(JS) && /LX\.demo\(root,/.test(JS) && /autos\[6\]/.test(JS) && /LX\.Drill\(host, \{/.test(JS) && /LX\.NumAnswer\(act/.test(JS), "live regions, demo hook, NumAnswer and Drill");
  ok(/LX\.EquationCard\(/.test(JS) && /LX\.LinkedViews\(/.test(JS) && /LX\.CompareTable\(/.test(JS), "explain: equation card, linked views, comparison table");
  ok(/id: k06-vectors-matrices\n  code: K6\n  form: cards\n  path: k06-vectors-matrices\.qmd\n  status: active\n  minutes: 25\n  practice_minutes: 30/.test(PATHY) && /after: \[K4\]\n  next: B1/.test(PATHY), "path.yml: K6 active, 25 + 30 minutes, after K4, next B1");
  const sub = (QMD.match(/^subtitle: "([^"]+)"/m) || [])[1];
  ok(PATHY.indexOf('subtitle: "' + sub + '"') >= 0, "path.yml: subtitle equals the page's");
  const desc = (QMD.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 35, `budget: the description is ${desc.split(/\s+/).length} words (≤ 35)`);
}

console.log(`k06-vectors-matrices: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
