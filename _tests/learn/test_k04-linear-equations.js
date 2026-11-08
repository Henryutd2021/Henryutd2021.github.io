// test_k04-linear-equations.js — Node tests for toolbox K4 (assets/learn/k04-linear-equations.js): the day agrees with
// lesson 0's model, the rule algebra (half-planes, clipping, regions) behaves, the drill items are right, and every number
// the page states matches the model. With --fallback it prints the static figure for the page's fallback block; without,
// it also checks that the page holds exactly that figure.
// Usage (from the site folder):  node _tests/learn/test_k04-linear-equations.js [--fallback]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k04-linear-equations.js"));
const G0 = require(path.join(SITE, "assets/learn/grid-operator.js"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/k04-linear-equations.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/k04-linear-equations.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));

// ---------------- the static figure (also used by --fallback)
function fallbackSVG(s) {
  const W = 440, Hh = 380, m = { l: 58, r: 14, t: 12, b: 56 }, box = s.view;
  const sx = x => m.l + (x - box[0]) / (box[1] - box[0]) * (W - m.l - m.r), sy = y => Hh - m.b - (y - box[2]) / (box[3] - box[2]) * (Hh - m.t - m.b);
  const f = v => v.toFixed(1);
  const rules = [s.cover].concat(s.limits.slice(0, 2));
  const P = K.region([s.cover].concat(s.limits), box);
  let o = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-labelledby="k4-static-title">\n<title id="k4-static-title">The plans x (combined-cycle, MW) and y (peaker, MW) that pass x + y ≥ ${s.need}, x ≤ ${s.reach}, y ≤ ${s.pkMax}, x ≥ 0 and y ≥ 0 form a triangle with corners ${s.triangle.map(v => "(" + v[0] + ", " + v[1] + ")").join(", ")}.</title>\n<g>`;
  [0, 40, 80, 120, 160].forEach(v => {
    o += `<line x1="${f(sx(v))}" x2="${f(sx(v))}" y1="${f(sy(box[2]))}" y2="${f(sy(box[3]))}" class="lx-lp-grid"/><text x="${f(sx(v))}" y="${Hh - m.b + 22}" text-anchor="middle" class="lx-lp-tick">${v}</text>`;
    o += `<line x1="${f(sx(box[0]))}" x2="${f(sx(box[1]))}" y1="${f(sy(v))}" y2="${f(sy(v))}" class="lx-lp-grid"/><text x="${m.l - 8}" y="${f(sy(v) + 4)}" text-anchor="end" class="lx-lp-tick">${v}</text>`;
  });
  o += `<text x="${f((sx(box[0]) + sx(box[1])) / 2)}" y="${Hh - 10}" text-anchor="middle" class="lx-lp-axlab">x: combined-cycle plant, MW</text>`;
  o += `<text x="16" y="${f((sy(box[2]) + sy(box[3])) / 2)}" text-anchor="middle" class="lx-lp-axlab" transform="rotate(-90 16 ${f((sy(box[2]) + sy(box[3])) / 2)})">y: peaker, MW</text></g>\n`;
  o += `<path d="M${P.map(p => f(sx(p[0])) + " " + f(sy(p[1]))).join(" L")} Z" class="lx-lp-region"/>\n<g class="lx-lp-rule on">`;
  rules.forEach(r => {
    let a, b;
    if (r.a[1] === 0) { a = [r.b / r.a[0], box[2]]; b = [r.b / r.a[0], box[3]]; }
    else if (r.a[0] === 0) { a = [box[0], r.b / r.a[1]]; b = [box[1], r.b / r.a[1]]; }
    else { a = [box[0], r.b - box[0]]; b = [r.b - box[2], box[2]]; if (a[1] > box[3]) a = [r.b - box[3], box[3]]; }
    o += `<line x1="${f(sx(a[0]))}" y1="${f(sy(a[1]))}" x2="${f(sx(b[0]))}" y2="${f(sy(b[1]))}"/>`;
  });
  o += `</g>\n<g>`;
  s.triangle.forEach(v => {
    const right = sx(v[0]) < W - 120;
    o += `<circle cx="${f(sx(v[0]))}" cy="${f(sy(v[1]))}" r="5" class="lx-lp-fbpt"/><text x="${f(sx(v[0]) + (right ? 10 : -10))}" y="${f(sy(v[1]) - 9)}" text-anchor="${right ? "start" : "end"}" class="lx-lp-plab">(${v[0]}, ${v[1]})</text>`;
  });
  o += `</g>\n</svg>`;
  return o;
}

const s = K.story(town, year);
if (process.argv.includes("--fallback")) { console.log(fallbackSVG(s)); process.exit(0); }

// ---------------- data: the same day and scaling as lesson 0
{
  const W = G0.prepare(town, year, "lesson0"), D = K.townDay(town, year);
  ["demand", "wind", "solar", "need"].forEach(k => ok(D[k].join() === W[k].join(), `data: ${k} equals lesson 0's prepare()`));
  ok(D.dateLabel === "3 September 2025", "data: the named day is 3 September 2025");
  ok(s.t === 19 && s.demand === 331 && s.wind === 72 && s.solar === 14 && s.nuclear === 100 && s.need === 145, `story: 19:00 reads 331 / 100 / 72 / 14, gas 145 (got ${s.demand} ${s.nuclear} ${s.wind} ${s.solar} ${s.need})`);
  ok(s.demand - s.nuclear - s.wind - s.solar === s.need, "story: balance identity at 19:00");
  ok(s.reach === 130 && s.reach === Math.min(town.fleet.cc.mw, K.PREV_CC + town.fleet.cc.ramp), "story: ramp reach 90 + 40 = 130 MW (below the 150 MW size)");
}

// ---------------- rule algebra
{
  const box = [0, 160, 0, 160];
  ok(K.region([{ a: [1, 1], op: ">=", b: 145 }, { a: [-1, -1], op: "<=", b: -145 }], box).length > 2, "algebra: a rule and its flipped form are consistent");
  const A = K.region([{ a: [1, 1], op: ">=", b: 145 }], box), B = K.region([{ a: [-1, -1], op: "<=", b: -145 }], box);
  ok(A.length === B.length && A.every((p, i) => near(p[0], B[i][0], 1e-9) && near(p[1], B[i][1], 1e-9)), "algebra: x + y ≥ 145 and −x − y ≤ −145 give the same region");
  const C = K.region([{ a: [1, 1], op: "<=", b: 145 }], box);
  ok(C.some(p => p[0] === 0 && p[1] === 0) && !A.some(p => p[0] === 0 && p[1] === 0), "algebra: ≤ keeps the origin side, ≥ the far side");
  const L = K.region([{ a: [1, 1], op: "=", b: 145 }, { a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }], box);
  ok(L.length === 2 && L.every(p => near(p[0] + p[1], 145, 1e-6)), "algebra: an equation leaves a segment on its line");
  ok(K.region([{ a: [1, 0], op: "<=", b: 10 }, { a: [1, 0], op: ">=", b: 20 }], box).length === 0, "algebra: contradictory rules leave nothing");
  for (let k = 0; k < 2000; k++) {   // random rules: every vertex passes every rule; random points inside pass
    const rules = []; let seed = k * 7919 + 1; const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let j = 0; j < 4; j++) rules.push({ a: [Math.round(r() * 8 - 4), Math.round(r() * 8 - 4)], op: ["<=", ">=", "<="][Math.floor(r() * 3)], b: Math.round(r() * 300 - 100) });
    const P = K.region(rules, box);
    ok(P.every(p => rules.every(q => K.holds(q, p, 1e-6)) && p[0] >= -1e-9 && p[0] <= 160 + 1e-9 && p[1] >= -1e-9 && p[1] <= 160 + 1e-9), `algebra: random case ${k}: vertices pass every rule`);
    if (P.length > 2) { const c = [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length]; ok(rules.every(q => K.holds(q, c, 1e-6)), `algebra: random case ${k}: the centroid passes`); }
  }
}

// ---------------- the page's triangle and statements
{
  ok(JSON.stringify(s.triangle.slice().sort()) === JSON.stringify([[45, 100], [130, 15], [130, 100]].sort()), "story: the triangle's corners are (45, 100), (130, 15), (130, 100): " + JSON.stringify(s.triangle));
  has("100 + 72 + 14 + g = 331 gives g = 145 MW", "the balance at 19:00");
  has("x + y = 145, has a whole line", "the line of answers");
  has("−x − y ≤ −145", "the flipped form");
  has("x ≤ 130, y ≤ 100, x ≥ 0 and y ≥ 0", "the limits");
  has("x ≤ 130: the ramp limit", "the ramp row");
  has("90 MW the combined-cycle plant made at 18:00 are illustrative", "the illustrative label on the 18:00 assumption");
  has("3 September 2025", "the named day");
  // Go deeper: A x <= b is a short preview with one symbolic line and a link to B1 (curriculum 4.6); K6 is upcoming
  has("the rows stack into $A\\mathbf{z} \\le b$", "the one symbolic line of the preview"); has("collect both outputs in a vector $\\mathbf{z} = (x, y)$", "the vector of both outputs is named, so x stays one plant's output");
  has("Why a linear equation in two unknowns draws a straight line", "the Analyst heading says it is about a linear equation"); has("[Bridge B1](b01-algebra-to-lp.html)", "the forward link to B1");
  ok(QMD.indexOf("pmatrix") < 0, "the preview shows no full matrix");
  has("keeps the line $x = 130$ and everything to its left", "an inequality is not a line: its boundary is");
  has("with $a_1$ and $a_2$ not both 0", "the general rule excludes both coefficients zero");
  // the surplus: every plan in the triangle has its extra gas matched by spilling wind or sun
  { const P = K.region([s.cover].concat(s.limits), s.view), most = Math.max(...P.map(p => p[0] + p[1])) - s.need;
    ok(most === 85 && s.maxSurplus === 85 && s.spillable === 86 && s.maxSurplus <= s.spillable, `surplus: at most ${most} MW of extra gas, ${s.spillable} MW of wind and sun to spill`); }
  has("the extra is matched by spilling wind or sun", "the fallback states the spill");
  ok(JS.indexOf("how fast the plant can drop is left out here") > 0 && QMD.indexOf("The ramp rule limits only the climb from 90 MW") > 0, "ramp: upward only, said in the text version and the fallback");
  // interaction: the displayed sign counts, the counts are shown, x >= 0 and y >= 0 are fixed
  ok(/sides\.above && sides\.below \? null : "move the test plan to the other side of the line/.test(JS) && !/moved >= 1/.test(JS), "step 4: Next waits for the test plan on both sides of the line, not any move");
  ok(/<b>Why “at least”\.<\/b> Wind and solar can be turned down, so gas may make more than " \+ s\.need/.test(JS) && /Why “at least”[^\n]+\n\s+var right = \{\}, list = H\("div", \{ class: "k4-words" \}/.test(JS), "step 3: extra gas is explained above the sentences, before the first ≥ rule");
  ok(/Some \[\[solver\|solvers\]\], the programs that find a model's best plan, take every inequality as ≤/.test(JS) && !/\(B1 uses it\)/.test(JS), "step 5: solver is defined and marked at its first use");
  ok(/tried = \{ ">=": 1 \}/.test(JS) && /Still to do: /.test(JS) && /Positions tried: /.test(JS) && /Slide x to four positions/.test(JS), "steps 2 and 4: what Next waits for is said and counted");
  ok(/Always on: x ≥ 0, y ≥ 0/.test(JS) && !/\[lim\[2\], "x ≥ 0"\]/.test(JS), "step 6: x ≥ 0 and y ≥ 0 are fixed, not switches");
  ok(/start: \{ t: "a·x \+ m ≤ n", s: "a ≠ 0"/.test(JS) && /Spot-check one value/.test(JS) && /a is not 0/.test(JS), "flowchart: a ≠ 0, and one value is a spot-check");
  ok(/Some \[\[solver\|solvers\]\]/.test(JS) && !/Solvers store every rule/.test(JS), "step 5: ≤ is what some solvers take, not how every solver stores rules");
  // quick questions
  const pass = (x, y) => x <= 130 && x + y >= 145;
  ok(!pass(120, 20) && pass(130, 15) && !pass(140, 10) && !pass(100, 40), "quiz: only (130, 15) passes both rules");
  ok(3 * 20 - 20 >= 40 && !(3 * 19.9 - 20 >= 40), "quiz: 3x − 20 ≥ 40 means x ≥ 20");
  const fb = fallbackSVG(s), a = QMD.indexOf("<!-- fallback-svg:start -->"), b = QMD.indexOf("<!-- fallback-svg:end -->");
  ok(a > 0 && b > a && QMD.slice(a + "<!-- fallback-svg:start -->".length, b).trim() === fb.trim(), "page: the fallback figure is the generated one (run with --fallback and paste)");
}

// ---------------- the explain layer's worked inequalities (flowchart traces), from the model
{
  const T = K.traces();
  ok(T.length === 2 && T[0].text === "**2x ≤ 40, so x ≤ 20.** Spot-check x = 10: 2 × 10 + 10 = 30 ≤ 50." && T[1].text === "**Divide by −2 and flip: x ≥ −3.** Spot-check x = 0: −2 × 0 = 0 ≤ 6.", "traces: the two worked examples: " + T.map(t => t.text).join(" | "));
  T.forEach(t => {
    const e = t.e, f = x => e.a * x + e.m <= e.n, inSet = x => t.op === "<=" ? x <= t.bound : x >= t.bound;
    ok(e.a !== 0 && near(e.a * t.bound + e.m, e.n), `trace ${t.label}: the boundary ${t.bound} meets the rule with equality`);
    ok([-50, -10, -3.5, -3, -2.5, 0, 10, 19.5, 20, 20.5, 50].every(x => f(x) === inSet(x)), `trace ${t.label}: x ${t.op} ${t.bound} is exactly the solution set`);
    ok(t.spotValue === e.a * e.spot + e.m && t.spotValue <= e.n && inSet(e.spot), `trace ${t.label}: the spot-check value ${e.spot} gives ${t.spotValue} ≤ ${e.n}`);
    ok(t.path[3] === (e.a < 0 ? "flip" : "keep"), `trace ${t.label}: the flowchart path flips only for a negative a`);
  });
  ok(/traces\(\)\.map/.test(JS), "explain: the flowchart's traces come from traces()");
  // the no-JS explain carries the same procedure and the same two worked examples
  const a = QMD.indexOf("<!-- k4-traces:start"), b = QMD.indexOf("<!-- k4-traces:end -->"), lis = (QMD.slice(a, b).match(/<li>[^<]*<\/li>/g) || []).map(l => l.slice(4, -5));
  ok(a > 0 && b > a && lis.length === 2 && lis.every((l, i) => l === T[i].label + ": " + T[i].text.replace(/\*\*/g, "")), "fallback: the two worked examples equal traces(): " + lis.join(" | "));
  ok(/Move m across: a·x ≤ n − m\./.test(QMD) && /Then divide by a and flip the sign: x ≥ \(n − m\) \/ a\. If not, divide by a: x ≤ \(n − m\) \/ a\./.test(QMD), "fallback: the procedure of the flowchart, in order");
}

// ---------------- drill items
{
  const D = K.townDay(town, year), items = K.drill(D, 42, 400);
  items.forEach((it, i) => {
    if (it.kind === "gap") { const m = /^(\d\d):00/.exec(it.q), t = +m[1]; ok(it.answer === D.need[t] && it.answer === D.demand[t] - 100 - D.wind[t] - D.solar[t], `drill ${i}: gap answer`); }
    if (it.kind === "solve") { const m = /Solve (\d+)x \+ (\d+) = (\d+)/.exec(it.q); ok(+m[1] * it.answer + +m[2] === +m[3], `drill ${i}: solve answer`); }
    if (it.kind === "flip") { const m = /−(\d+)x ≤ (\d+)/.exec(it.q), a = +m[1], b = +m[2]; ok(it.choices[it.answer] === "x ≥ −" + (b / a), `drill ${i}: flip answer`); ok(-a * (-b / a) <= b + 1e-9 && -a * (-b / a - 1) > b, `drill ${i}: flip boundary`); }
    if (it.kind === "test") { const m = /x = (\d+), y = (\d+) pass x \+ y (≤|≥) (\d+)/.exec(it.q), v = +m[1] + +m[2], c = +m[4]; ok((it.answer === 0) === (m[3] === "≤" ? v <= c : v >= c), `drill ${i}: test answer`); }
    if (it.kind === "words") {
      const sign = ["≤", "≥", "="][it.answer], m = /^“(.+) (\d+) MW\.” Which sign\?$/.exec(it.q);
      ok(sign && it.why.indexOf(sign) > 0 && m, `drill ${i}: words answer`);
      // the sentence says what it means: a cap on a flow or output is ≤, a floor or a need is ≥; never "can carry"
      const exp = /at most|no more than|must not exceed/.test(m[1]) ? "≤" : /at least|no less than|must not fall below/.test(m[1]) ? "≥" : /exactly/.test(m[1]) ? "=" : null;
      ok(exp === sign && !/can carry/.test(m[1]) && !/carry must|can carry must/.test(it.q), `drill ${i}: the sentence reads as its sign: ${it.q} → ${sign}`);
    }
  });
  ok(new Set(items.map(i => i.kind)).size === 5, "drill: all five kinds appear");
}

console.log(`k04-linear-equations: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
