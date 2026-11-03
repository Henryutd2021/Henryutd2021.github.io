// test_b01-algebra-to-lp.js — Node tests for bridge B1 (assets/learn/b01-algebra-to-lp.js) and its data
// (assets/learn/data/b01-algebra-to-lp.json): the dispatch story agrees with lesson 0's day; every story's best corner
// (vertex enumeration) agrees with HiGHS, the solver the page uses; compare() accepts equivalent models and rejects each
// planted mistake with the right diagnosis; the A x <= b arrays reproduce the model; the readiness items are consistent;
// and every number the page states matches the model. The practice set (Check section): the new stories and hours are
// solved by HiGHS too; each exercise's answer, hints and check reasons come from the model, right answers pass and typical
// wrong answers get the reason the data file names. With --fallback it prints the static figure for the page.
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
const isBoundLike = r => r.op === ">=" && r.b === 0;

const d1 = B.dispatchStory(town, year);
const planning = B.planningStory(J.stories.planning, cf);
const PI = J.practice.items;
const stories = { dispatch: d1, planning: planning, battery: B.withKey(J.stories.battery, "battery"), heat: B.withKey(J.stories.heat, "heat"), carbon: B.withKey(J.stories.carbon, "carbon"),
  imports: B.withKey(J.stories.imports, "imports"), bus: B.withKey(J.stories.bus, "bus"),
  d14: B.dispatchStory(town, year, PI.c14.hour, PI.c14.prev), d18: B.dispatchStory(town, year, PI.c18.hour, PI.c18.prev) };
const EXPECT = { dispatch: [[130, 15], 6700], planning: [[50, 65], 17700], battery: [[80, 72], 6240], heat: [[30, 10], 900], carbon: [[80, 70], 5360],
  imports: [[48, 52], 4040], bus: [[1, 5], 170], d14: [[85, 10], 4400], d18: [[105, 10], 5200] };

function fallbackSVG() {
  const W = 440, Hh = 380, m = { l: 58, r: 14, t: 12, b: 56 }, box = d1.view;
  const sx = x => m.l + (x - box[0]) / (box[1] - box[0]) * (W - m.l - m.r), sy = y => Hh - m.b - (y - box[2]) / (box[3] - box[2]) * (Hh - m.t - m.b);
  const f = v => v.toFixed(1), best = B.optimum(d1, d1.view), P = B.region(d1.rows, box);
  let o = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-labelledby="b1-static-title">\n<title id="b1-static-title">The dispatch model on a plane: x (combined-cycle, MW) across, y (peaker, MW) up. The rules leave a triangle of allowed plans with corners ${P.map(p => "(" + Math.round(p[0]) + ", " + Math.round(p[1]) + ")").join(", ")}. The cheapest is (${best.x.join(", ")}), at $${best.value.toLocaleString("en-US")}.</title>\n<g>`;
  d1.ticks.forEach((v, i) => {
    if (v <= box[1]) o += `<line x1="${f(sx(v))}" x2="${f(sx(v))}" y1="${f(sy(box[2]))}" y2="${f(sy(box[3]))}" class="lx-lp-grid"/>` + (i % 2 ? "" : `<text x="${f(sx(v))}" y="${Hh - m.b + 22}" text-anchor="middle" class="lx-lp-tick">${v}</text>`);
    if (v <= box[3]) o += `<line x1="${f(sx(box[0]))}" x2="${f(sx(box[1]))}" y1="${f(sy(v))}" y2="${f(sy(v))}" class="lx-lp-grid"/><text x="${m.l - 8}" y="${f(sy(v) + 4)}" text-anchor="end" class="lx-lp-tick">${v}</text>`;
  });
  o += `<text x="${f((sx(box[0]) + sx(box[1])) / 2)}" y="${Hh - 10}" text-anchor="middle" class="lx-lp-axlab">x: combined-cycle output, MW</text>`;
  o += `<text x="16" y="${f((sy(box[2]) + sy(box[3])) / 2)}" text-anchor="middle" class="lx-lp-axlab" transform="rotate(-90 16 ${f((sy(box[2]) + sy(box[3])) / 2)})">y: peaker output, MW</text></g>\n`;
  o += `<path d="M${P.map(p => f(sx(p[0])) + " " + f(sy(p[1]))).join(" L")} Z" class="lx-lp-region"/>\n`;
  const iso = [[box[0], best.value / d1.c[1]], [best.value / d1.c[0], box[2]]].map(p => p[1] > box[3] ? [(best.value - d1.c[1] * box[3]) / d1.c[0], box[3]] : p);
  o += `<line x1="${f(sx(iso[0][0]))}" y1="${f(sy(iso[0][1]))}" x2="${f(sx(iso[1][0]))}" y2="${f(sy(iso[1][1]))}" class="lx-lp-iso"/>\n`;
  o += `<circle cx="${f(sx(best.x[0]))}" cy="${f(sy(best.x[1]))}" r="6" class="lx-lp-fbpt"/><text x="${f(sx(best.x[0]) - 10)}" y="${f(sy(best.x[1]) - 10)}" text-anchor="end" class="lx-lp-plab">cheapest: (${best.x.join(", ")}), $${best.value.toLocaleString("en-US")}</text>\n</svg>`;
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
    // the allowance is for rounding, not for changed requirements (review 2026-11-02)
    const r8 = eq(base.map(r => r.b === 40 ? { a: r.a, op: r.op, b: 39.5 } : r)); ok(!r8.ok && r8.missing.some(m => m.key === "heat"), "compare: 39.5 MWh of heat instead of 40 is rejected");
    ok(!eq([{ a: [0.33, 0], op: "<=", b: 10 }].concat(base.filter(r => r.b !== 30))).ok, "compare: 0.33h ≤ 10 (1% off) is rejected; 0.333h passes above");
    const car = stories.carbon, cm = car.rows.map(r => ({ a: r.a.slice(), op: r.op, b: r.b }));
    ok(!B.compare(car, { sense: "min", c: [32, 40], rows: cm.map(r => r.op === "=" ? { a: r.a, op: ">=", b: r.b } : r) }, car.view).ok, "compare: “at least 150” is not “exactly 150”");
  }

  // ---------------- optimum(): infeasible, unbounded and ties
  {
    ok(B.optimum({ sense: "min", c: [1, 1], rows: [{ a: [1, 0], op: "<=", b: 5 }, { a: [1, 0], op: ">=", b: 6 }] }, [0, 10, 0, 10]).status === "infeasible", "optimum: contradictory rules are infeasible");
    ok(B.optimum({ sense: "max", c: [1, 1], rows: [{ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }] }, [0, 10, 0, 10]).status === "unbounded", "optimum: no upper limits is unbounded");
    const t = B.optimum({ sense: "min", c: [40, 40], rows: d1.rows }, d1.view);
    ok(t.status === "optimal" && t.ties.length === 2 && near(t.value, 40 * 145), "optimum: equal costs tie along an edge (two corners, " + JSON.stringify(t.ties) + ")");
    ok(JSON.stringify(t.ties.slice().sort()) === JSON.stringify([[45, 100], [130, 15]].sort()) && t.value === 5800, "optimum: the tie runs from (45, 100) to (130, 15), $5,800 (the Analyst box's worked comparison)");
    has("the corners $(45, 100)$ and $(130, 15)$ both cost \\$5,800", "the equal-cost worked comparison");
    const cov = B.optimum({ sense: "min", c: d1.c, rows: d1.rows.map(r => r.key === "cover" ? { a: r.a, op: "<=", b: r.b } : r) }, d1.view);
    ok(cov.status === "optimal" && cov.x[0] === 0 && cov.x[1] === 0 && cov.value === 0, "signs: cover as ≤ makes nothing for $0");
    const rmp = B.optimum({ sense: "min", c: d1.c, rows: d1.rows.map(r => r.key === "ramp" ? { a: r.a, op: ">=", b: r.b } : r) }, d1.view);
    ok(rmp.status === "optimal" && rmp.x[0] === 145 && rmp.x[1] === 0 && rmp.value === 5800, "signs: ramp as ≥ gives (145, 0) at $5,800");
    const both = B.optimum({ sense: "min", c: d1.c, rows: d1.rows.map(r => r.key === "cover" ? { a: r.a, op: "<=", b: r.b } : r.key === "ramp" ? { a: r.a, op: ">=", b: r.b } : r) }, d1.view);
    ok(both.x.join() === "130,0" && both.value === 5200 && /ORIG\[o\]/.test(JS), "signs: both flipped at once would give (130, 0), $5,200, so step 6 puts the other rule back (one experiment at a time)");
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
    ok(d1.rows.length === 6 && JS.indexOf('d1.rows.length + " rules.') > 0 && JS.indexOf("Six rules leave a triangle") > 0, "js: step 3 counts the rules from the model (6), as step 4 says");
    has("Linear programs use ≤, ≥ and =", "the strict-inequality answer allows equalities");
    has("can climb by at most 40 MW an hour", "the fallback: the ramp limits the climb");
    ok(d1.rows[1].says.indexOf("can climb by at most 40 MW") > 0 && JS.indexOf("(the drop is left out)") > 0 && QMD.indexOf("limits only the climb") > 0, "ramp: upward only, said in the story, the worked line and the limits box");
    // gas above the need is matched by spilling wind or sun: every plan in each dispatch region has enough to spill
    [["dispatch", d1], ["d14", stories.d14], ["d18", stories.d18]].forEach(([k, st]) => {
      const P = B.region(st.rows, st.view), most = Math.max(...P.map(p => p[0] + p[1])) - st.need;
      ok(near(most, st.maxSurplus) && st.maxSurplus <= st.spillable && st.spillable === st.wind + st.solar, `${k}: the most surplus gas, ${most} MW, fits the ${st.spillable} MW of wind and sun that can be spilled`);
    });
    ok(d1.spillable === 86 && d1.maxSurplus === 85, "dispatch: 85 MW of surplus at most, 86 MW of wind and sun");
    // story rows: one label per sentence
    Object.keys(J.stories).forEach(k => { const s = J.stories[k]; ok(!s.labels || s.labels.length === s.text.length, `story ${k}: a label for every row`); });
    ["c14", "c18"].forEach(k => ok(PI[k].labels.length === PI[k].text.length, `${k}: a label for every row`));
    // the battery's conventions and the heat pump's energy, stated
    { const t = J.stories.battery.text.join(" "); ok(/starts empty/.test(t) && /Charging loses nothing/.test(t) && /delivers 90% of the energy stored/.test(t) && stories.battery.rows.find(r => r.key === "store").b === 80, "battery: starts empty, lossless charging, 90% out on discharge; c ≤ 80 is the store"); }
    { const t = J.stories.heat.text.join(" "); ok(/uses 1 MWh of electricity to move 2 MWh of heat/.test(t) && /delivering 3 MWh/.test(t) && 1 + 2 === 3 && 60 / 3 === 20 && near(27 / 0.9, 30) && !/feeder/.test(t), "heat: 1 MWh of electricity moves 2 MWh, delivers 3; $60/3 = $20, $27/0.9 = $30; no 'feeder'"); }
  }

  // ---------------- the practice set
  {
    const PJ = J.practice, keys = Object.keys(PI), SP = B.practiceSpecs(J, town, year, cf);
    ok(d1.rows[1].says.indexOf("made 90 MW at 18:00") >= 0, "dispatch: the default story still starts from 90 MW at 18:00");
    // sets: Formulate (from scratch twice: steps 3, 7 and 8 did its fade), then two worked -> partly worked -> from scratch sets
    ok(PJ.tracks.map(t => t.items.map(k => PI[k].kind).join()).join("|") === "scratch,scratch|worked,partly,scratch|worked,partly,scratch", "practice: Formulate from scratch; Best corner and A x ≤ b fade worked -> partly -> scratch");
    ok(keys.length === 8 && /eight exercises in three sets/.test(PJ.title), "practice: eight exercises, as the title says");
    const minutes = keys.reduce((a, k) => a + PI[k].minutes, 0);
    ok(minutes === 43, `practice: the exercises take about ${minutes} min (report: 43 + 4 for the quick questions = 47, target 45)`);
    keys.forEach(k => { const h = SP[k] ? SP[k].hints : J.stories[PI[k].story].hints; ok(h.length >= 2 && h.length <= 3, `practice ${k}: two or three staged hints`); });
    // the hours come from lesson 0's day and its cheapest-first plan
    const plan = G0.expertPlan(G0.prepare(town, year, "lesson0"));
    ["c14", "c18"].forEach(k => ok(plan[PI[k].hour - 1].cc === PI[k].prev, `${k}: the combined-cycle plant made ${PI[k].prev} MW at ${PI[k].hour - 1}:00 in lesson 0's cheapest-first plan`));
    ok(PJ.foot.indexOf(`the gas needs at ${PI.c14.hour}:00 and ${PI.c18.hour}:00 follow the real day of ${d1.D.dateLabel}`) > 0 && /illustrative/.test(PJ.foot), "practice foot: the real hours and the illustrative numbers");
    ok(SP.c14.st.need === 95 && SP.c14.st.reach === 85 && SP.c18.st.need === 115 && SP.c18.st.reach === 105, "c14, c18: gas needs 95 and 115 MW (lesson 0's day), reach 85 and 105 MW");
    ok(plan[18].cc === 105 && plan[18].pk === 10 && B.optimum(SP.c18.st, SP.c18.st.view).x.join() === "105,10", "c18: the best corner is lesson 0's cheapest-first plan for 18:00 (the right reason says so)");
    // c14: the worked corner table and the what-if price
    ok(JSON.stringify(SP.c14.table.map(r => [r.x, r.value])) === JSON.stringify([[[0, 95], 9500], [[0, 100], 10000], [[85, 10], 4400], [[85, 100], 13400]]), "c14: four corners and their costs");
    ok(SP.c14.table.every(r => SP.c14.st.rows.every(q => B.holds(q, r.x, 1e-6))) && SP.c14.table.length === B.region(SP.c14.st.rows, SP.c14.st.view).length, "c14: every corner keeps every rule, and they are the region's corners");
    ok(SP.c14.alt.best.x.join() === "0,95" && SP.c14.alt.best.value === 3325 && SP.c14.alt.best.ties.length === 1 && SP.c14.alt.index === 0, "c14: with the peaker at $35, (0, 95) at $3,325 wins alone");
    ok(SP.c14.check(0).ok && [1, 2, 3].every(i => !SP.c14.check(i).ok && SP.c14.check(i).why.indexOf(B.money(SP.c14.alt.table[i].value)) > 0), "c14: the right corner passes; each other states its own cost");
    // c18: the hidden corner
    ok(SP.c18.hidden === 1 && SP.c18.table[1].x.join() === "105,10" && SP.c18.table[1].value === 5200 && SP.c18.table[1].keys.sort().join() === "cover,ramp", "c18: the hidden corner (105, 10), $5,200, on the cover and ramp lines");
    ok(SP.c18.check({ x: 105, y: 10, cost: 5200 }).ok && SP.c18.check({ x: 100, y: 15, cost: 5500 }).why === B.fill(PI.c18.offLine, Object.assign({ x: "100", y: "15" }, SP.c18.vars)) &&
       SP.c18.check({ x: 105, y: 10, cost: 5000 }).why === B.fill(PI.c18.badCost, SP.c18.vars) && SP.c18.check({ x: 105, y: NaN, cost: 5200 }) === null, "c18: right passes; off the lines and a wrong cost get their reasons; a blank waits");
    // imports: from scratch
    ok(JSON.stringify(SP.imports.table.map(r => r.x)) === "[[0,100],[0,160],[48,52]]" && SP.imports.vars.nAxis === 2 && SP.imports.vars.k === "0.5" && SP.imports.vars.rhs === "24", "imports: corners (0, 100), (0, 160), (48, 52); 0.5x = 24");
    ok(SP.imports.table.every(r => r.keys.indexOf("north") < 0), "imports: the north line touches no corner (the right reason calls it redundant)");
    ok(SP.imports.check({ x: 48, y: 52, cost: 4040 }).ok && /breaks a rule: “at most 64 t/.test(SP.imports.check({ x: 60, y: 40, cost: 3800 }).why) && /costs \$5,000/.test(SP.imports.check({ x: 0, y: 100, cost: 5000 }).why) && /recompute/.test(SP.imports.check({ x: 48, y: 52, cost: 4000 }).why), "imports: right passes; a plan over the cap, a dearer corner and a wrong cost get their reasons");
    // aplan: worked arrays and the what-if goal
    ok(JSON.stringify(SP.aplan.arrays.A) === "[[-2.1,-3],[1,1]]" && JSON.stringify(SP.aplan.arrays.b) === "[-300,115]" && JSON.stringify(SP.aplan.changed.b) === "[-330,115]" && JSON.stringify(SP.aplan.changed.A) === JSON.stringify(SP.aplan.arrays.A), "aplan: a 330 GWh goal changes only b₁, to −330");
    ok(SP.aplan.check(0).ok && [1, 2, 3].every(i => !SP.aplan.check(i).ok) && SP.aplan.why.join("|") === [PI.aplan.why.energy, PI.aplan.why.connect].join("|"), "aplan: only choice 0 passes; each row's reason follows its rule");
    // abat: partly worked arrays
    ok(SP.abat.given.map(r => r.key).join() === "chargeHours,store,sellHours" && SP.abat.left.length === 1 && JSON.stringify(SP.abat.answer) === '{"c":[30,-120],"rows":[{"a":[-0.9,1],"b":0}]}', "abat: three rows given; c = (30, −120) and the losses row left");
    ok(/\(80, 72\), \$6,240/.test(SP.abat.check(SP.abat.answer).why) && /\(1, 5\), \$170/.test(SP.abus.check({ c: [4.5, 2.5], rows: SP.abus.answer.rows }).why), "abat, abus: the accepted answer reports its own best plan, valued with the story's goal");
    ok(!SP.abus.check({ c: [45, 25], rows: SP.abus.answer.rows.map(r => r.a[0] === -1 && r.a[1] === 0 ? { a: r.a, b: -0.95 } : r) }).ok, "abus: 0.95 MWh for the shuttle instead of 1 is rejected");
    ok(SP.abat.check(SP.abat.answer).ok && SP.abat.check({ c: [-30, 120], rows: SP.abat.answer.rows }).why === PJ.checks.reversed && /Row 4 rules out/.test(SP.abat.check({ c: [30, -120], rows: [{ a: [0, 1], b: 0.9 }] }).why) && SP.abat.check({ c: [30, NaN], rows: SP.abat.answer.rows }) === null, "abat: right passes; a max-form c, d ≤ 0.9 and a blank get their reasons");
    // abus: from scratch
    ok(SP.abus.check(SP.abus.answer).ok && SP.abus.check({ c: [45, 25], rows: [{ a: [1, 1], b: 6 }, { a: [1, 0], b: 4 }, { a: [0, 1], b: 12 }, { a: [-1, 0], b: -1 }] }).why === B.fill(PJ.checks.copied, { k: 1 }) &&
       /“at least 1 MWh before midnight/.test(SP.abus.check({ c: [45, 25], rows: [{ a: [-1, -1], b: -6 }, { a: [1, 0], b: 4 }, { a: [0, 1], b: 12 }] }).why) && SP.abus.check({ c: [4.5, 2.5], rows: SP.abus.answer.rows }).ok, "abus: right (and a scaled c) passes; a copied ≥ row and a missing rule get their reasons");
    ok(SP.abus.vars.rows === "(−1, −1) ≤ −6, (1, 0) ≤ 4, (0, 1) ≤ 12 and (−1, 0) ≤ −1", "abus: the last hint lists the rows: " + SP.abus.vars.rows);
    // every number in an exercise's texts comes from its model (or the story it shows)
    const nums = t => (String(t).match(/\d[\d,]*(\.\d+)?/g) || []).map(x => +x.replace(/,/g, ""));
    Object.keys(SP).forEach(k => {
      const it = PI[k], sp = SP[k], v = sp.vars, st = sp.st;
      const tx = [].concat(sp.hints, sp.q || [], sp.worked || [], sp.ask || [], sp.choices || [], st.text || [], ["right", "wrong", "offLine", "badCost", "breaks", "notBest"].filter(x => it[x]).map(x => B.fill(it[x], v)), (it.reasons || []).map(r => B.fill(r, v)));
      // placeholders filled at check time from the reader's answer: pick, pickCost, x, y, cost, says (tested with check() above)
      ok(tx.every(t => !/\{(?!(pick|pickCost|x|y|cost|says)\})\w+\}/.test(t)), `practice ${k}: every placeholder filled`);
      const A = new Set([0, 1, 2]);
      Object.keys(v).forEach(x => nums(v[x]).forEach(n => A.add(n)));
      st.rows.forEach(r => { [r.b, ...r.a].forEach(n => A.add(Math.abs(n))); nums(r.says || "").forEach(n => A.add(n)); }); st.c.forEach(n => A.add(Math.abs(n)));
      if (k === "c14" || k === "c18") [2025, 3, ...SP[k].table.map(r => r.value)].forEach(n => A.add(n));
      if (k === "aplan") A.add(cf.targets.solar.year);
      if (k === "abus") [22, 6].forEach(n => A.add(n));   // the clock times of the night, 22:00 to 6:00
      if (k === "aplan") [st.fill.solarCF, st.fill.windCF].forEach(x => A.add(parseFloat(x)));
      const stray = [].concat(...tx.map(nums)).filter(n => !A.has(n));
      ok(!stray.length, `practice ${k}: every number in its texts comes from the model (stray: ${stray.join(", ")})`);
    });
    // the bus story's text matches its rows (2 MW × 2 h and × 6 h)
    { const bs = J.stories.bus, R = {}; bs.rows.forEach(r => { R[r.key] = r; }); const t = bs.text.join(" ");
      ok(R.early.b === 2 * 2 && R.late.b === 2 * 6 && t.indexOf("at least " + R.need.b + " MWh") > 0 && t.indexOf("$" + bs.c[0]) > 0 && t.indexOf("$" + bs.c[1]) > 0 && t.indexOf("at least " + R.shuttle.b + " MWh") > 0, "bus: text and rows agree"); }
    { const is = J.stories.imports, t = is.text.join(" ");
      ok(is.rows.every(r => isBoundLike(r) || t.indexOf(String(r.b)) >= 0) && t.indexOf("$" + is.c[0]) > 0 && t.indexOf("$" + is.c[1]) > 0 && t.indexOf(is.rows[1].a[0] + " t") > 0 && t.indexOf(is.rows[1].a[1] + " t") > 0, "imports: text and rows agree"); }
    // text versions: the imports plane described without its answer; a builder's region in words
    { const st = SP.imports.st, w = st.rows.filter(r => !(r.op === ">=" && r.b === 0)).map(r => B.ruleWords(r, ["x", "y"], st.view));
      ok(w[0] === "The line x + y = 100 runs from (0, 100) to (100, 0); plans above it pass." && /0\.9x \+ 0\.4y = 64 runs from \(0, 160\) to \(71\.111, 0\); plans below it pass/.test(w[1]) && /x = 80 runs from \(80, 0\) to \(80, 180\); plans left of it pass/.test(w[2]), "imports: the text version names each line and its side: " + w.join(" | "));
      ok(w.every(t => t.indexOf("48") < 0 && t.indexOf("52") < 0) && /ruleWords\(r, syms\(st\), st\.view\)/.test(JS), "imports: the text version does not give the answer away"); }
    { const bt = stories.battery, d = B.describeModel({ sense: "max", c: bt.c, rows: bt.rows }, ["c", "d"], bt.view);
      ok(/corners/.test(d[1]) && d[1].indexOf("(80, 72)") > 0 && d[2] === "Best plan for your goal: (80, 72).", "builder text: the battery's corners and best plan in words: " + d.join(" | "));
      ok(B.describeModel({ sense: null, c: [NaN, NaN], rows: [] }, ["c", "d"], bt.view)[0] === "No rules yet: every plan passes." && /No plan passes/.test(B.describeModel({ rows: [{ a: [1, 0], op: "<=", b: 5 }, { a: [1, 0], op: ">=", b: 6 }] }, ["x", "y"], bt.view).join(" ")), "builder text: no rules, and contradictory rules"); }
    ok(/Choose min or max for the goal first/.test(JS) && !/m\.sense = "min"/.test(JS), "builder: min or max must be chosen; nothing is filled in silently");
    // the page hosts the set; the view builds every exercise
    ok(QMD.indexOf('<div id="b1-practice"></div>') > 0, "page: the practice host in the Check section");
    ["c14", "c18", "imports", "aplan", "abat", "abus"].forEach(k => ok(JS.indexOf(k + ": function") > 0, `js: the view builds exercise ${k}`));
    ok(/heat: formulate, carbon: formulate/.test(JS), "js: heat and carbon use the Builder");
  }

  console.log(`b01-algebra-to-lp: ${checks - fails} of ${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
