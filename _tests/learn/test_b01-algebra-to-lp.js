// test_b01-algebra-to-lp.js — Node tests for bridge B1 (assets/learn/b01-algebra-to-lp.js) and its data
// (assets/learn/data/b01-algebra-to-lp.json): the dispatch story agrees with lesson 0's day; every story's best corner
// (vertex enumeration) agrees with HiGHS, the solver the page uses; compare() accepts equivalent models and rejects each
// planted mistake with the right diagnosis; the A x <= b arrays reproduce the model; the readiness items are consistent;
// and every number the page states matches the model. With --fallback it prints the static figure for the page.
// Usage (from the site folder):  node _tests/learn/test_b01-algebra-to-lp.js [--fallback]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const B = require(L("b01-algebra-to-lp.js"));
const G0 = require(L("grid-operator.js"));
const J = JSON.parse(fs.readFileSync(L("data/b01-algebra-to-lp.json"), "utf8"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const cf = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/b01-algebra-to-lp.qmd"), "utf8");
const JS = fs.readFileSync(L("b01-algebra-to-lp.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));

const d1 = B.dispatchStory(town, year);
const planning = B.planningStory(J.stories.planning, cf);
const stories = { dispatch: d1, planning: planning, battery: B.withKey(J.stories.battery, "battery"), heat: B.withKey(J.stories.heat, "heat"), carbon: B.withKey(J.stories.carbon, "carbon") };
const EXPECT = { dispatch: [[130, 15], 6700], planning: [[50, 65], 17700], battery: [[80, 72], 6240], heat: [[30, 10], 900], carbon: [[80, 70], 5360] };

function fallbackSVG() {
  const W = 440, Hh = 380, m = { l: 58, r: 14, t: 12, b: 56 }, box = d1.view;
  const sx = x => m.l + (x - box[0]) / (box[1] - box[0]) * (W - m.l - m.r), sy = y => Hh - m.b - (y - box[2]) / (box[3] - box[2]) * (Hh - m.t - m.b);
  const f = v => v.toFixed(1), best = B.optimum(d1, d1.view), P = B.region(d1.rows, box);
  let o = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-labelledby="b1-static-title">\n<title id="b1-static-title">The dispatch model on a plane: x (combined-cycle, MW) across, y (peaker, MW) up. The rules leave a triangle of allowed plans with corners ${P.map(p => "(" + Math.round(p[0]) + ", " + Math.round(p[1]) + ")").join(", ")}. The cheapest is (${best.x.join(", ")}), at $${best.value.toLocaleString("en-US")}.</title>\n<g>`;
  d1.ticks.forEach((v, i) => {
    if (v <= box[1]) o += `<line x1="${f(sx(v))}" x2="${f(sx(v))}" y1="${f(sy(box[2]))}" y2="${f(sy(box[3]))}" class="w1h-grid"/>` + (i % 2 ? "" : `<text x="${f(sx(v))}" y="${Hh - m.b + 22}" text-anchor="middle" class="w1h-tick">${v}</text>`);
    if (v <= box[3]) o += `<line x1="${f(sx(box[0]))}" x2="${f(sx(box[1]))}" y1="${f(sy(v))}" y2="${f(sy(v))}" class="w1h-grid"/><text x="${m.l - 8}" y="${f(sy(v) + 4)}" text-anchor="end" class="w1h-tick">${v}</text>`;
  });
  o += `<text x="${f((sx(box[0]) + sx(box[1])) / 2)}" y="${Hh - 10}" text-anchor="middle" class="w1h-axlab">x: combined-cycle output, MW</text>`;
  o += `<text x="16" y="${f((sy(box[2]) + sy(box[3])) / 2)}" text-anchor="middle" class="w1h-axlab" transform="rotate(-90 16 ${f((sy(box[2]) + sy(box[3])) / 2)})">y: peaker output, MW</text></g>\n`;
  o += `<path d="M${P.map(p => f(sx(p[0])) + " " + f(sy(p[1]))).join(" L")} Z" class="w1h-region"/>\n`;
  const iso = [[box[0], best.value / d1.c[1]], [best.value / d1.c[0], box[2]]].map(p => p[1] > box[3] ? [(best.value - d1.c[1] * box[3]) / d1.c[0], box[3]] : p);
  o += `<line x1="${f(sx(iso[0][0]))}" y1="${f(sy(iso[0][1]))}" x2="${f(sx(iso[1][0]))}" y2="${f(sy(iso[1][1]))}" class="w1h-iso"/>\n`;
  o += `<circle cx="${f(sx(best.x[0]))}" cy="${f(sy(best.x[1]))}" r="6" class="w1h-fbpt"/><text x="${f(sx(best.x[0]) - 10)}" y="${f(sy(best.x[1]) - 10)}" text-anchor="end" class="w1h-plab">cheapest: (${best.x.join(", ")}), $${best.value.toLocaleString("en-US")}</text>\n</svg>`;
  return o;
}
if (process.argv.includes("--fallback")) { console.log(fallbackSVG()); process.exit(0); }

(async () => {
  // ---------------- the dispatch story is lesson 0's day
  {
    const W = G0.prepare(town, year, "lesson0"), D = d1.D;
    ["demand", "wind", "solar", "need"].forEach(k => ok(D[k].join() === W[k].join(), `data: ${k} equals lesson 0's prepare()`));
    ok(d1.t === 19 && d1.need === 145 && d1.demand - d1.nuclear - d1.wind - d1.solar === d1.need, "dispatch: 19:00 gas need 145 MW = demand − nuclear − wind − solar");
    ok(d1.reach === 130 && d1.prevCC + d1.ramp === 130 && d1.ccMax === 150 && d1.pkMax === 100, "dispatch: ramp reach 90 + 40 = 130 MW, sizes 150 and 100");
    ok(d1.c[0] === town.fleet.cc.cost && d1.c[1] === town.fleet.peaker.cost, "dispatch: running costs are Prairie Town's ($40, $100)");
  }

  // ---------------- planning coefficients from the EIA capacity factors
  {
    ok(near(planning.exact.solar, 2.1024, 1e-4) && near(planning.exact.wind, 2.96088, 1e-5), "planning: 8,760 h × 24.0% = 2.10, × 33.8% = 2.96 GWh per MW-year");
    ok(planning.rows[0].a[0] === 2.1 && planning.rows[0].a[1] === 3.0, "planning: rounded to 2.1 and 3.0");
    ok(Math.abs(planning.rows[0].a[1] / planning.exact.wind - 1) < 0.015, "planning: wind's rounding is under 1.5%");
    ok(planning.text[1].indexOf("24.0% and 33.8%") > 0 && planning.text[1].indexOf("2.1 GWh") > 0 && planning.text[1].indexOf("3.0 GWh") > 0, "planning: the story text carries the sourced numbers");
  }

  // ---------------- best corners, against HiGHS
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports, highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const toSolver = (m, n) => ({ sense: m.sense, variables: [{ name: n[0], cost: m.c[0] }, { name: n[1], cost: m.c[1] }],
    constraints: m.rows.filter(r => !(r.op === ">=" && r.b === 0 && (r.a[0] === 0 || r.a[1] === 0))).map((r, i) => ({ name: "r" + i, terms: { [n[0]]: r.a[0], [n[1]]: r.a[1] }, [{ "<=": "le", ">=": "ge", "=": "eq" }[r.op]]: r.b })) });
  for (const k of Object.keys(stories)) {
    const st = stories[k], o = B.optimum(st, st.view), e = EXPECT[k];
    ok(o.status === "optimal" && o.ties.length === 1, `${k}: a unique best corner`);
    ok(near(o.x[0], e[0][0]) && near(o.x[1], e[0][1]) && near(o.value, e[1]), `${k}: best corner (${o.x}) value ${o.value}, expected (${e[0]}) ${e[1]}`);
    const r = core.solveWith(highs, toSolver(st, ["p", "q"]));
    ok(r.status === "optimal" && near(r.values.p, o.x[0]) && near(r.values.q, o.x[1]) && near(r.objective, o.value), `${k}: HiGHS agrees (${r.values.p}, ${r.values.q}, ${r.objective})`);
    ok(B.compare(st, { sense: st.sense, c: st.c, rows: st.rows }, st.view).ok, `${k}: the story's own model passes compare()`);
    // every vertex passes every rule, and the best corner is no worse than any vertex
    const P = B.region(st.rows, st.view), sg = st.sense === "max" ? -1 : 1;
    ok(P.every(p => st.rows.every(r => B.holds(r, p, 1e-6)) && sg * (st.c[0] * p[0] + st.c[1] * p[1]) >= sg * o.value - 1e-6), `${k}: the best corner beats every vertex`);
    // the arrays reproduce the model: same feasible set and goal
    const A = B.toArrays(st);
    const rows = A.A.map((a, i) => ({ a: a, op: "<=", b: A.b[i] })).concat(A.bounds.map(i => st.rows[i]));
    ok(B.compare(st, { sense: "min", c: A.c, rows: rows }, st.view).ok, `${k}: A x <= b with c (min form) is the same model`);
    ok(A.A.length + A.bounds.length === st.rows.length + st.rows.filter(r => r.op === "=").length, `${k}: one row per <= or >= rule, two per = rule`);
  }
  {
    const A = B.toArrays(d1);
    ok(JSON.stringify(A.A) === JSON.stringify([[-1, -1], [1, 0], [1, 0], [0, 1]]) && JSON.stringify(A.b) === JSON.stringify([-145, 130, 150, 100]), "dispatch: A and b as the page's code shows them: " + JSON.stringify(A));
    ok(JS.indexOf('"Multiply by −1"') > 0, "page: the cover row is flipped by the learner");
  }

  // ---------------- compare(): equivalent models pass, planted mistakes fail with the right diagnosis
  {
    const st = stories.heat, v = st.view;
    const eq = (rows, extra) => B.compare(st, Object.assign({ sense: "min", c: [20, 30], rows: rows }, extra || {}), v);
    const base = st.rows.map(r => ({ a: r.a.slice(), op: r.op, b: r.b }));
    ok(eq([{ a: [1 / 3, 0], op: "<=", b: 10 }].concat(base.filter(r => r.b !== 30))).ok, "compare: h/3 ≤ 10 equals h ≤ 30");
    ok(eq([{ a: [0.333, 0], op: "<=", b: 10 }].concat(base.filter(r => r.b !== 30))).ok, "compare: 0.333h ≤ 10 is close enough");
    ok(eq([{ a: [-1, -1], op: "<=", b: -40 }].concat(base.filter(r => r.b !== 40))).ok, "compare: −h − b ≤ −40 equals h + b ≥ 40");
    ok(eq(base, { c: [60 / 3, 27 / 0.9] }).ok, "compare: unsimplified costs pass");
    ok(eq(base, { c: [2, 3] }).ok && near(eq(base, { c: [2, 3] }).obj.factor, 0.1, 1e-9), "compare: a scaled goal passes and reports its factor");
    ok(eq(base, { sense: "max", c: [-20, -30] }).ok, "compare: max of the negative cost passes");
    const r1 = eq(base, { sense: "max" }); ok(!r1.ok && r1.obj.reversed, "compare: a max of the cost is flagged as reversed");
    const r2 = eq(base.filter(r => r.b !== 30)); ok(!r2.ok && r2.missing.length === 1 && r2.missing[0].key === "feeder", "compare: a missing rule is named by its sentence");
    const r3 = eq(base.map(r => r.b === 40 ? { a: r.a, op: "<=", b: 40 } : r)); ok(!r3.ok && r3.cuts.length >= 1 && r3.missing.some(m => m.key === "heat"), "compare: a flipped sign shows as a cut and a missing rule");
    const r4 = eq(base.map(r => r.b === 30 ? { a: r.a, op: "<=", b: 25 } : r)); ok(!r4.ok && r4.cuts.length === 1 && !r4.missing.length, "compare: a too-tight limit cuts allowed plans");
    const r5 = eq(base.concat([{ a: [1, 0], op: "<=", b: 50 }])); ok(r5.ok, "compare: a redundant extra rule is fine");
    const r6 = eq(base, { c: [30, 20] }); ok(!r6.ok && !r6.obj.ok && !r6.obj.reversed, "compare: swapped costs are flagged");
    const r7 = eq([]); ok(!r7.ok && r7.missing.length === st.rows.length - 0 || r7.missing.length > 0, "compare: an empty model misses rules");
    const bat = stories.battery, bm = bat.rows.map(r => ({ a: r.a.slice(), op: r.op, b: r.b }));
    ok(B.compare(bat, { sense: "max", c: [-30, 120], rows: bm.filter(r => r.b !== 120 && !(r.key === "sellHours")).filter(r => !(r.a[0] === 0 && r.a[1] === 1 && r.b === 80)) }, bat.view).ok, "compare: battery without its two redundant power rules is the same model");
    ok(!B.compare(bat, { sense: "max", c: [-30, 120], rows: bm.map(r => r.b === 0 && r.a[0] === -0.9 ? { a: [0, 1], op: "<=", b: 0.9 } : r) }, bat.view).ok, "compare: d ≤ 0.9 instead of d ≤ 0.9c is caught");
    ok(B.compare(bat, { sense: "max", c: [-30, 120], rows: bm.map(r => r.a[0] === -0.9 ? { a: [0.9, -1], op: ">=", b: 0 } : r) }, bat.view).ok, "compare: 0.9c − d ≥ 0 is the losses rule too");
    const car = stories.carbon, cm = car.rows.map(r => ({ a: r.a.slice(), op: r.op, b: r.b }));
    ok(!B.compare(car, { sense: "min", c: [32, 40], rows: cm.map(r => r.op === "=" ? { a: r.a, op: ">=", b: r.b } : r) }, car.view).ok, "compare: “at least 150” is not “exactly 150”");
  }

  // ---------------- optimum(): infeasible, unbounded and ties
  {
    ok(B.optimum({ sense: "min", c: [1, 1], rows: [{ a: [1, 0], op: "<=", b: 5 }, { a: [1, 0], op: ">=", b: 6 }] }, [0, 10, 0, 10]).status === "infeasible", "optimum: contradictory rules are infeasible");
    ok(B.optimum({ sense: "max", c: [1, 1], rows: [{ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }] }, [0, 10, 0, 10]).status === "unbounded", "optimum: no upper limits is unbounded");
    const t = B.optimum({ sense: "min", c: [40, 40], rows: d1.rows }, d1.view);
    ok(t.status === "optimal" && t.ties.length === 2 && near(t.value, 40 * 145), "optimum: equal costs tie along an edge (two corners, " + JSON.stringify(t.ties) + ")");
    const cov = B.optimum({ sense: "min", c: d1.c, rows: d1.rows.map(r => r.key === "cover" ? { a: r.a, op: "<=", b: r.b } : r) }, d1.view);
    ok(cov.status === "optimal" && cov.x[0] === 0 && cov.x[1] === 0 && cov.value === 0, "signs: cover as ≤ makes nothing for $0");
    const rmp = B.optimum({ sense: "min", c: d1.c, rows: d1.rows.map(r => r.key === "ramp" ? { a: r.a, op: ">=", b: r.b } : r) }, d1.view);
    ok(rmp.status === "optimal" && rmp.x[0] === 145 && rmp.x[1] === 0 && rmp.value === 5800, "signs: ramp as ≥ gives (145, 0) at $5,800");
    const eqc = B.optimum({ sense: "min", c: d1.c, rows: d1.rows.map(r => r.key === "cover" ? { a: r.a, op: "=", b: r.b } : r) }, d1.view);
    ok(eqc.x[0] === 130 && eqc.x[1] === 15, "signs: cover as = gives the same best plan");
  }

  // ---------------- readiness items
  {
    const R = J.ready;
    ok(R.items.length === 10, "ready: ten questions");
    ok(R.items.every(it => R.groups[it.group] && it.answer >= 0 && it.answer < it.choices.length), "ready: groups and answers are valid");
    ok(new Set(R.items.map(it => it.id)).size === 10, "ready: ids unique");
    const A = id => R.items.find(it => it.id === id), c = id => A(id).choices[A(id).answer];
    ok(c("r1") === "240 MWh" && 40 * 6 === 240, "ready r1: 40 MW × 6 h = 240 MWh");
    ok(c("r2") === "1,000", "ready r2");
    ok(c("r3") === "90 MWh of heat", "ready r3");
    ok(c("r4") === "$1,000" && 40 * 25 === 1000, "ready r4");
    ok(c("r5") === "105" && 303 - 100 - 98 === 105, "ready r5");
    ok(c("r6") === "20" && 2 * 20 + 10 === 50, "ready r6");
    ok(c("r7") === "x ≤ 150", "ready r7");
    ok(c("r8") === "x ≥ −3", "ready r8");
    const pass = (x, y) => x <= 100 && x + y >= 120; ok(c("r9") === "x = 100, y = 20" && pass(100, 20) && !pass(110, 20) && !pass(90, 20) && !pass(60, 50), "ready r9: only (100, 20) passes");
    ok(c("r10") === "$5,000" && 10 * 100 + 40 * 50 + 100 * 20 === 5000, "ready r10");
    const all = {}; R.items.forEach(it => { all[it.id] = it.answer; });
    const g = B.readiness(R.items, all); ok(Object.keys(g).every(k => g[k].ok), "ready: all right routes nowhere");
    const one = Object.assign({}, all, { r8: 0 }); ok(B.readiness(R.items, one).linear.ok, "ready: one slip in the linear group still passes");
    const two = Object.assign({}, one, { r6: 0 }); ok(!B.readiness(R.items, two).linear.ok, "ready: two slips route to K4");
  }

  // ---------------- what the page says
  {
    has("cheapest: (130, 15), $6,700", "the fallback's best corner");
    has("x + y ≥ 145", "the cover rule"); has("x ≤ 130", "the ramp rule");
    has("−x − y ≤ −145", "the flipped cover row");
    has("$6,700");
    has("24.0%"); has("33.8%"); has("Table 6.07.B");
    has("3 September 2025"); has("illustrative");
    const fb = fallbackSVG(), a = QMD.indexOf("<!-- fallback-svg:start -->"), b = QMD.indexOf("<!-- fallback-svg:end -->");
    ok(a > 0 && b > a && QMD.slice(a + "<!-- fallback-svg:start -->".length, b).trim() === fb.trim(), "page: the fallback figure is the generated one (run with --fallback and paste)");
    // the explain table and saw texts compute from the model; check the strings the JS writes around them
    ok(JS.indexOf("S + W ≤ 115") > 0 && JS.indexOf("d ≤ 0.9c") > 0, "js: the step texts name the rules");
  }

  console.log(`b01-algebra-to-lp: ${checks - fails} of ${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
