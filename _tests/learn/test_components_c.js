// test_components_c.js — Node tests for the shared components lpplane.js (LX.LPPlane and the pure rule
// algebra LX.lp2), cardsort.js (LX.CardSort and its pure grade/score/reference), linkedviews.js (LX.LinkedViews) and
// toggle.js (LX.Toggle).
//   - each file defines its LX.<Name> when run with a stub window.LX, and the bundle holds it
//   - lp2: half-planes, regions, line segments, rounding (K4's cases); optimum() (B1's cases: best corners, infeasible,
//     unbounded, ties, wrong signs, max); solve() (lesson 10's cases: one best corner, a jump, binding, infeasible, a tied
//     edge, a tied ray, unbounded, lights out); solve() against HiGHS on 3,000 random problems (min and max); optimum()
//     and solve() agree where both apply; the simplex walk goes downhill along edges to the best corner
//   - CardSort: lesson 10's answer key grades 10 of 10; lesson 6's reference sort agrees on every clear cell, and a
//     "partly" cell accepts either answer
// Usage (from the site folder):  node _tests/learn/test_components_c.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);

// ---------------- the files define their components (stub window.LX) and the bundle holds them
const NAMES = { lpplane: ["LPPlane", "lp2"], cardsort: ["CardSort"], linkedviews: ["LinkedViews"], toggle: ["Toggle"] };
const bundle = fs.existsSync(L("learn.js")) ? fs.readFileSync(L("learn.js"), "utf8") : "";
Object.keys(NAMES).forEach(f => {
  const src = fs.readFileSync(L("components/" + f + ".js"), "utf8"), ctx = { window: { LX: {} }, module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  NAMES[f].forEach(n => {
    ok(ctx.window.LX[n] != null, `${f}.js defines LX.${n} with a stub window.LX`);
    ok(bundle.indexOf("LX." + n + " = ") >= 0, `learn.js holds LX.${n}`);
  });
  ok(src.split("\n")[0].indexOf(f + ".js — LX.") >= 0, `${f}.js: the header comment names the file and the component`);
  ok(fs.existsSync(L("components/" + f + ".css")), `${f}.css exists`);
});
const LP = require(L("components/lpplane.js")), CS = require(L("components/cardsort.js"));
ok(typeof LP.solve === "function" && typeof CS.grade === "function", "Node: require() returns the pure parts");

// ---------------- lp2: rules, regions, segments (K4's cases)
{
  const box = [0, 160, 0, 160];
  ok(LP.le({ a: [1, 0], op: ">=", b: 0 }).every(h => !Object.is(h.a[1], -0) && !Object.is(h.b, -0)), "le: no −0 in a flipped rule");
  ok(LP.le({ a: [1, 2], op: "=", b: 3 }).length === 2, "le: an equation is two half-planes");
  ok(JSON.stringify(LP.box({ x: [0, 240], y: [0, 160] })) === "[0,240,0,160]", "box: {x, y} view as [x0, x1, y0, y1]");
  const A = LP.region([{ a: [1, 1], op: ">=", b: 145 }], box), B = LP.region([{ a: [-1, -1], op: "<=", b: -145 }], box);
  ok(A.length === B.length && A.every((p, i) => near(p[0], B[i][0], 1e-9) && near(p[1], B[i][1], 1e-9)), "region: x + y ≥ 145 and −x − y ≤ −145 are the same");
  const C = LP.region([{ a: [1, 1], op: "<=", b: 145 }], box);
  ok(C.some(p => p[0] === 0 && p[1] === 0) && !A.some(p => p[0] === 0 && p[1] === 0), "region: ≤ keeps the origin side, ≥ the far side");
  const E = LP.region([{ a: [1, 1], op: "=", b: 145 }, { a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }], box);
  ok(E.length === 2 && E.every(p => near(p[0] + p[1], 145)), "region: an equation leaves a segment");
  ok(LP.region([{ a: [1, 0], op: "<=", b: 10 }, { a: [1, 0], op: ">=", b: 20 }], box).length === 0, "region: contradictory rules leave nothing");
  ok(JSON.stringify(LP.verticesOf(LP.region([{ a: [1, 1], op: ">=", b: 145 }, { a: [1, 0], op: "<=", b: 130 }, { a: [0, 1], op: "<=", b: 100 }], box)).sort()) ===
     JSON.stringify([[45, 100], [130, 15], [130, 100]].sort()), "verticesOf: K4's triangle (45, 100), (130, 15), (130, 100)");
  let seed = 7;
  const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let segOK = 0, regOK = 0;
  for (let k = 0; k < 2000; k++) {
    const rules = [];
    for (let j = 0; j < 4; j++) rules.push({ a: [Math.round(r() * 8 - 4), Math.round(r() * 8 - 4)], op: ["<=", ">=", "<="][Math.floor(r() * 3)], b: Math.round(r() * 300 - 100) });
    const P = LP.region(rules, box);
    if (P.every(p => rules.every(q => LP.holds(q, p, 1e-6)) && p[0] >= -1e-9 && p[0] <= 160 + 1e-9 && p[1] >= -1e-9 && p[1] <= 160 + 1e-9)) regOK++;
    const q = rules[0], s = LP.segment(q.a, q.b, box);
    if (!q.a[0] && !q.a[1]) { if (s === null) segOK++; continue; }
    if (s === null) { segOK++; continue; }   // the line misses the box (checked below for one known case)
    if (s.every(p => near(q.a[0] * p[0] + q.a[1] * p[1], q.b, 1e-6) && p[0] >= -1e-9 && p[0] <= 160 + 1e-9 && p[1] >= -1e-9 && p[1] <= 160 + 1e-9) &&
        (s[0][0] < s[1][0] || (s[0][0] === s[1][0] && s[0][1] <= s[1][1]))) segOK++;
  }
  ok(regOK === 2000, `region: on 2,000 random rule sets every corner passes every rule (${regOK})`);
  ok(segOK === 2000, `segment: on 2,000 random lines both ends lie on the line, inside the view, left end first (${segOK})`);
  ok(LP.segment([1, 1], 500, box) === null, "segment: a line outside the view is null");
  const v = LP.segment([1, 0], 50, box); ok(v[0][0] === 50 && v[0][1] === 0 && v[1][1] === 160, "segment: a vertical line runs bottom to top");
  const corner = LP.segment([1, 1], 160, box); ok(corner && near(corner[0][0], 0) && near(corner[1][0], 160), "segment: a line through two corners keeps both ends once");
}

// ---------------- lp2.optimum (B1's cases): the dispatch story at 19:00 on 3 September 2025
const dispatch = { sense: "min", c: [40, 100], rows: [
  { a: [1, 1], op: ">=", b: 145, key: "cover" }, { a: [1, 0], op: "<=", b: 130, key: "ramp" }, { a: [1, 0], op: "<=", b: 150, key: "ccMax" },
  { a: [0, 1], op: "<=", b: 100, key: "pkMax" }, { a: [1, 0], op: ">=", b: 0, key: "x0" }, { a: [0, 1], op: ">=", b: 0, key: "y0" }] };
const view1 = [0, 160, 0, 140];
{
  const o = LP.optimum(dispatch, view1);
  ok(o.status === "optimal" && o.x[0] === 130 && o.x[1] === 15 && o.value === 6700 && o.ties.length === 1, `optimum: dispatch (130, 15) at $6,700 (${JSON.stringify(o)})`);
  ok(LP.optimum({ sense: "min", c: [1, 1], rows: [{ a: [1, 0], op: "<=", b: 5 }, { a: [1, 0], op: ">=", b: 6 }] }, [0, 10, 0, 10]).status === "infeasible", "optimum: contradictory rules are infeasible");
  ok(LP.optimum({ sense: "max", c: [1, 1], rows: [{ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }] }, [0, 10, 0, 10]).status === "unbounded", "optimum: no upper limits is unbounded");
  ok(LP.optimum({ sense: "min", c: [40, 100], rows: [{ a: [1, 1], op: ">=", b: 10 }] }, [0, 10, 0, 10]).status === "unbounded", "optimum: one rule, no corner: unbounded (a learner's half-written model)");
  const t = LP.optimum({ sense: "min", c: [40, 40], rows: dispatch.rows }, view1);
  ok(t.status === "optimal" && t.ties.length === 2 && near(t.value, 5800), "optimum: equal costs tie along an edge (two corners)");
  const flip = (k, op) => ({ sense: "min", c: dispatch.c, rows: dispatch.rows.map(q => q.key === k ? { a: q.a, op: op, b: q.b } : q) });
  const cov = LP.optimum(flip("cover", "<="), view1); ok(cov.x[0] === 0 && cov.x[1] === 0 && cov.value === 0, "optimum: cover as ≤ makes nothing for $0");
  const rmp = LP.optimum(flip("ramp", ">="), view1); ok(rmp.x[0] === 145 && rmp.x[1] === 0 && rmp.value === 5800, "optimum: ramp as ≥ gives (145, 0) at $5,800");
  const eqc = LP.optimum(flip("cover", "="), view1); ok(eqc.x[0] === 130 && eqc.x[1] === 15, "optimum: cover as = gives the same best plan");
  const mx = LP.optimum({ sense: "max", c: [-40, -100], rows: dispatch.rows }, view1); ok(mx.x[0] === 130 && mx.x[1] === 15 && mx.value === -6700, "optimum: max of the negative cost is the same plan");
}

// ---------------- lp2.solve (lesson 10's cases): 19:00, gas needed 145 MW, CO2 cap 100 t
function hour(o) {
  o = Object.assign({ D: 145, cap: 100, cx: 40, cy: 100, on: {} }, o);
  const rows = [{ id: "demand", a: [1, 1], op: ">=", b: o.D }, { id: "cc", a: [1, 0], op: "<=", b: 150 }, { id: "pk", a: [0, 1], op: "<=", b: 100 },
    { id: "co2", a: [0.37, 0.55], op: "<=", b: o.cap }].filter(q => o.on[q.id] !== false);
  return { sense: "min", c: [o.cx, o.cy], rows: rows.concat([{ id: "x0", a: [1, 0], op: ">=", b: 0 }, { id: "y0", a: [0, 1], op: ">=", b: 0 }]) };
}
{
  const s = LP.solve(hour());
  ok(s.status === "optimal" && near(s.x, 145) && near(s.y, 0) && near(s.value, 5800) && s.corners.length === 5, `solve: one best corner (145, 0) at $5,800 on a pentagon (${s.status} ${s.x} ${s.y} ${s.value})`);
  ok(s.binding.demand && !s.binding.co2 && s.binding.y0, "solve: demand and y ≥ 0 bind, the CO2 cap is slack");
  const j = LP.solve(hour({ D: 200 })); ok(j.status === "optimal" && near(j.x, 150) && near(j.y, 50) && near(j.value, 11000), "solve: demand 200 jumps to (150, 50), $11,000");
  ok(LP.solve(hour({ cap: 0.37 * 145 })).binding.co2, "solve: a cap of 53.65 t binds");
  ok(LP.solve(hour({ cap: 53 })).status === "infeasible", "solve: a cap of 53 t is infeasible");
  const tie = LP.solve(hour({ cy: 40 }));
  ok(tie.status === "tied" && tie.best.length === 2 && near(tie.value, 5800) && tie.best.some(v => near(v.x, 45) && near(v.y, 100)) && tie.best.some(v => near(v.x, 145) && near(v.y, 0)),
     "solve: equal costs tie along the edge (45, 100)–(145, 0)");
  const ray = LP.solve(hour({ cx: 0, on: { cc: false, co2: false } }));
  ok(ray.status === "tied" && ray.ray && ray.ray[0] > 0 && near(ray.value, 0), "solve: a free plant with no size ties along a ray");
  const unb = LP.solve(hour({ cx: -10, on: { cc: false, co2: false } }));
  ok(unb.status === "unbounded" && unb.ray[0] > 0 && unb.x === null && unb.value === null, "solve: paid to run, no size, no cap: unbounded along +x");
  ok(LP.solve(hour({ cx: -10, on: { cc: false } })).status === "optimal", "solve: the CO2 cap alone keeps it bounded");
  const dark = LP.solve(hour({ on: { demand: false } })); ok(dark.status === "optimal" && dark.x === 0 && dark.y === 0, "solve: no demand rule, the cheapest plan makes nothing");
  const mx = LP.solve({ sense: "max", c: [-40, -100], rows: hour().rows }); ok(mx.status === "optimal" && near(mx.x, 145) && near(mx.value, -5800), "solve: max of the negative cost is the same plan");
  const d1 = LP.solve(dispatch), o1 = LP.optimum(dispatch, view1);
  ok(d1.status === "optimal" && d1.x === o1.x[0] && d1.y === o1.x[1] && near(d1.value, o1.value), "solve and optimum agree on the dispatch story");
}

// ---------------- the simplex walk
{
  const m = hour(), s = LP.solve(m), w = LP.simplexWalk(m);
  ok(w.length >= 2 && near(w[w.length - 1].value, s.value) && near(w[w.length - 1].x, s.x), `walk: ends at the best corner (${w.map(v => Math.round(v.value)).join(" > ")})`);
  ok(w.every((v, i) => !i || v.value < w[i - 1].value - 1e-9) && w.slice(1).every(v => v.along), "walk: every step is downhill along a rule's edge");
  ok(near(w[0].value, Math.max(...s.corners.map(v => 40 * v.x + 100 * v.y))), "walk: starts at the most expensive corner");
  const mw = LP.simplexWalk({ sense: "max", c: [3, 2], rows: [{ id: "a", a: [1, 1], op: "<=", b: 4 }, { id: "b", a: [1, 3], op: "<=", b: 6 }, { id: "x0", a: [1, 0], op: ">=", b: 0 }, { id: "y0", a: [0, 1], op: ">=", b: 0 }] });
  ok(mw.length >= 2 && mw.every((v, i) => !i || v.value > mw[i - 1].value) && near(mw[mw.length - 1].x, 4) && near(mw[mw.length - 1].y, 0), "walk: a max problem climbs to (4, 0)");
}

// ---------------- solve() against HiGHS, and optimum() against solve(), on random problems
(async () => {
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports, highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  let seed = 20261102;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let agree = 0, both = 0, same = 0, n = 0;
  for (let k = 0; k < 3000; k++) {
    const rows = [], nr = 1 + Math.floor(rnd() * 4);
    for (let j = 0; j < nr; j++) rows.push({ id: "r" + j, a: [Math.round(rnd() * 10 - 3), Math.round(rnd() * 10 - 3)], op: ["<=", ">=", "<=", "="][Math.floor(rnd() * (k % 5 ? 3 : 4))], b: Math.round(rnd() * 200 - 20) });
    rows.push({ id: "x0", a: [1, 0], op: ">=", b: 0 }, { id: "y0", a: [0, 1], op: ">=", b: 0 });
    const m = { sense: rnd() < 0.3 ? "max" : "min", c: [Math.round(rnd() * 12 - 4), Math.round(rnd() * 12 - 4)], rows: rows };
    const a = LP.solve(m), cons = rows.filter(q => q.id[0] === "r").map(q => ({ name: q.id, terms: { x: q.a[0], y: q.a[1] }, [{ "<=": "le", ">=": "ge", "=": "eq" }[q.op]]: q.b }));
    const b = core.solveWith(highs, { sense: m.sense, variables: [{ name: "x", cost: m.c[0] }, { name: "y", cost: m.c[1] }], constraints: cons }, {});
    n++;
    const ag = (a.status === "infeasible" && b.status === "infeasible") ||
      (a.status === "unbounded" && (b.status === "unbounded" || b.status === "infeasible-or-unbounded")) ||
      ((a.status === "optimal" || a.status === "tied") && b.status === "optimal" && near(a.value, b.objective, 1e-6 * (1 + Math.abs(b.objective))));
    if (ag) agree++; else if (n - agree <= 3) console.log("  mismatch:", JSON.stringify(m), a.status, a.value, b.status, b.objective);
    if (a.status === "optimal") {   // a unique best corner: optimum() in a view around the corners finds the same plan
      const xs = a.corners.map(v => v.x), ys = a.corners.map(v => v.y), vw = [0, Math.max(10, ...xs) * 1.2, 0, Math.max(10, ...ys) * 1.2];
      const o = LP.optimum(m, vw); both++;
      if (o.status === "optimal" && near(o.x[0], a.x, 1e-5) && near(o.x[1], a.y, 1e-5) && near(o.value, a.value, 1e-5 * (1 + Math.abs(a.value)))) same++;
      else if (both - same <= 3) console.log("  optimum differs:", JSON.stringify(m), JSON.stringify(o), a.x, a.y, a.value);
    }
  }
  ok(agree === n, `solve agrees with HiGHS on ${agree} of ${n} random problems`);
  ok(both > 300 && same === both, `optimum and solve find the same unique best corner on ${same} of ${both} problems`);

  // ---------------- CardSort: lesson 10's card sort and lesson 6's job sorter
  {
    const D10 = JSON.parse(fs.readFileSync(L("data/10-write-it-down.json"), "utf8")), key = {};
    D10.cards.forEach(c => { key[c.id] = c.bin; });
    const g = CS.grade(D10.cards, key);
    ok(g.right === 10 && g.total === 10 && g.placed === 10, "grade: lesson 10's answer key is 10 of 10");
    ok(D10.bins.some(b => b.id === "given") && D10.bins.length === 4, "lesson 10 keeps the fourth bin, Given");
    const half = {}; D10.cards.slice(0, 4).forEach(c => { half[c.id] = c.bin === "rule" ? "goal" : c.bin; });
    const h = CS.grade(D10.cards, half); ok(h.placed === 4 && h.right === D10.cards.slice(0, 4).filter(c => c.bin !== "rule").length, "grade: a half-done sort counts placed and right cards");
    ok(CS.grade(D10.cards, {}).placed === 0, "grade: an empty sort");
    // any reference value other than "yes" and "partly" is a clear "off" cell (R2 uses "not stated")
    const ns = [{ key: "p", ref: { a: "not stated", b: "yes", c: "partly" } }], nsr = CS.reference(ns, ["a", "b", "c"]);
    ok(nsr.p.a === false && nsr.p.b === true && CS.score({ p: { a: false, b: true } }, ns, ["a", "b", "c"]).agree === 2 && CS.score({ p: { a: true, b: true } }, ns, ["a", "b", "c"]).cells.p.a === "differ" &&
       CS.score({ p: {} }, ns, ["a", "b", "c"]).clear === 2, "score: \"not stated\" is a clear off cell, \"partly\" accepts either answer");
    const D6 = JSON.parse(fs.readFileSync(L("data/06-three-jobs.json"), "utf8")), J = ["energy", "firm", "flex"];
    const items = D6.tech.map(t => ({ key: t.key, ref: t.jobs }));
    const ref = CS.reference(items, J), r0 = CS.score(ref, items, J);
    ok(r0.agree === r0.clear && r0.differ === 0 && r0.clear + r0.partly === items.length * 3, `score: the reference sort agrees on all ${r0.clear} clear cells`);
    let partlyOK = true, clearOK = true;
    items.forEach(t => J.forEach(j => {
      const m = JSON.parse(JSON.stringify(ref)); m[t.key][j] = !m[t.key][j];
      const q = CS.score(m, items, J);
      if (t.ref[j] === "partly") partlyOK = partlyOK && q.agree === r0.agree && q.cells[t.key][j] === "partly";
      else clearOK = clearOK && q.agree === r0.agree - 1 && q.differ === 1 && q.cells[t.key][j] === "differ";
    }));
    ok(partlyOK, "score: a 'partly' cell accepts either answer");
    ok(clearOK, "score: flipping a clear cell makes it differ");
    const M6 = require(L("06-three-jobs.js"));
    ok(JSON.stringify(M6.score(ref, D6.tech)) === JSON.stringify(r0), "lesson 6's score() is LX.CardSort.score");
  }

  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL:", e && e.stack || e); process.exit(1); });
