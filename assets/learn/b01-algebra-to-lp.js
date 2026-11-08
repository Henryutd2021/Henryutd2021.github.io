// b01-algebra-to-lp.js — Bridge B1, "From algebra to a linear program: how do equations become a model?" (step cards).
//
// Ten cards: a ten-question readiness check that routes to the toolbox; a word problem tagged into decisions, goal,
// rules and givens; a fully worked translation; the rules on a plane; the cheapest corner; what a wrong sign does; a
// second story with one rule left to write; a third story built from scratch with staged hints; the same model as
// A x <= b with a linked view (words, rows, lines, code); and a real solver run (HiGHS in the browser, LX.solver).
// Faded worked examples: fully worked (dispatch), one step left (planning), do it yourself (battery). The Check section ends
// with the practice set (practice(), the Practice runner): Formulate (heat, carbon cap; from scratch with the Builder), Best
// corner (14:00 worked, 18:00 partly worked, tonight's imports from scratch) and A x <= b (planning worked, battery partly
// worked, bus depot from scratch), each with staged hints and a checked answer from practiceSpecs().
//
// Data: assets/learn/data/b01-algebra-to-lp.json (readiness items and stories), town.json and town_year.json (the
// dispatch story: 19:00 on 3 September 2025, cut and scaled exactly as lesson 0 does), cf_targets.json (energy per MW in
// the planning story), path.json (where the readiness check routes). Prices, costs and limits are illustrative.
//
// Pure model (exported for Node, no DOM): townDay, compare() (is a learner's model the story's model? same feasible
// region and the same goal direction, with per-rule diagnostics), dispatchStory(), planningStory(), toArrays() (A x <= b
// form), readiness scoring. The two-variable rule algebra (le, holds, clip, region) and optimum() (best corner by vertex
// enumeration, with infeasible, unbounded and tie detection) are the shared LX.lp2, and the plane is LX.LPPlane
// (components/lpplane.js); the model re-exports the algebra under its old names.
(function () {
  "use strict";

  // ---------------------------------------------------------------- the real day, scaled as in lesson 0
  function townDay(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    var cut = function (a) { return a.slice(i, i + 24); };
    var wind = cut(year.wind).map(function (v) { return Math.round(v / 1000 * f.wind.mw); });
    var solar = cut(year.solar).map(function (v) { return Math.round(v / 1000 * f.solar.mw); });
    var raw = cut(year.demand).map(function (v) { return v / 1000 * sc.demandPeakMW; });
    var need = raw.map(function (v, t) { return Math.round((v - f.nuclear.mw - wind[t] - solar[t]) / sc.step) * sc.step; });
    var demand = need.map(function (n, t) { return n + f.nuclear.mw + wind[t] + solar[t]; });
    return { date: sc.date, dateLabel: sc.dateLabel, fleet: f, demand: demand, wind: wind, solar: solar, need: need };
  }

  // ---------------------------------------------------------------- two-variable linear rules: LX.lp2 (components/lpplane.js)
  var LP = (typeof window !== "undefined" && window.LX && window.LX.lp2) || require("./components/lpplane.js");
  var le = LP.le, holds = LP.holds, region = LP.region, bigBox = LP.bigBox, optimum = LP.optimum;

  // is a learner's model {sense, c, rows} the story's model? Feasible regions are compared inside a large box. Each rule is
  // checked at each corner with a small relative allowance, 0.2% of the size of its terms there: enough for a rounded
  // coefficient (0.333h <= 10 counts as h/3 <= 10), too small for a changed requirement (39.5 for 40 MWh of heat, or
  // 0.95 for the shuttle's 1 MWh, fail). The goal must point the same way. A rule with no decision in it (0x + 0y op b)
  // is either always true (harmless, listed in `idle`) or never true (`never`: the model has no plan at all).
  var REL = 2e-3;
  function tolAt(r, p) { return REL * (Math.abs(r.b) + Math.abs(r.a[0] * p[0]) + Math.abs(r.a[1] * p[1])) + 1e-9; }
  function compare(ref, mine, view) {
    var big = bigBox(view), all = mine.rows || [];
    var bad = all.filter(function (r) { return !r || !r.a || !isFinite(r.a[0]) || !isFinite(r.a[1]) || !isFinite(r.b); });
    var flat = all.filter(function (r) { return bad.indexOf(r) < 0 && !r.a[0] && !r.a[1]; });
    var never = flat.filter(function (r) { return !holds(r, [0, 0], 1e-9); }), idle = flat.filter(function (r) { return never.indexOf(r) < 0; });
    var rows = all.filter(function (r) { return bad.indexOf(r) < 0 && flat.indexOf(r) < 0; });
    var pr = region(ref.rows, big), pm = region(rows, big);
    var missing = ref.rows.filter(function (r) { return pm.some(function (p) { return !holds(r, p, tolAt(r, p)); }); });
    var cuts = rows.filter(function (r) { return pr.some(function (p) { return !holds(r, p, tolAt(r, p)); }); });
    var v = ref.c.map(function (x) { return ref.sense === "max" ? -x : x; }), w = (mine.c || [NaN, NaN]).map(function (x) { return mine.sense === "max" ? -x : x; });
    var nv = Math.hypot(v[0], v[1]), nw = Math.hypot(w[0], w[1]), cross = v[0] * w[1] - v[1] * w[0], dot = v[0] * w[0] + v[1] * w[1];
    var objOK = isFinite(nw) && nw > 0 && Math.abs(cross) <= 0.01 * nv * nw && dot > 0;
    var obj = { ok: objOK, factor: objOK ? nw / nv : null, reversed: isFinite(nw) && nw > 0 && Math.abs(cross) <= 0.01 * nv * nw && dot < 0 };
    return { ok: objOK && !missing.length && !cuts.length && !bad.length && !never.length, missing: missing, cuts: cuts, empty: bad, never: never, idle: idle,
             obj: obj, infeasible: !pm.length || never.length > 0 };
  }

  // the rows as A x <= b (>= rows flipped, = rows split), keeping the sign rows x >= 0 as bounds
  function toArrays(m) {
    var A = [], b = [], src = [], bounds = [];
    m.rows.forEach(function (r, i) {
      var nonneg = r.op === ">=" && r.b === 0 && ((r.a[0] === 1 && r.a[1] === 0) || (r.a[0] === 0 && r.a[1] === 1));
      if (nonneg) { bounds.push(i); return; }
      le(r).forEach(function (h) { A.push([h.a[0] + 0, h.a[1] + 0]); b.push(h.b + 0); src.push(i); });
    });
    return { c: m.sense === "max" ? m.c.map(function (x) { return -x; }) : m.c.slice(), A: A, b: b, src: src, bounds: bounds, flippedGoal: m.sense === "max" };
  }

  // ---------------------------------------------------------------- the stories
  // the dispatch story at hour `hour` (default 19:00), with the combined-cycle plant's output the hour before `prev` (default
  // 90 MW, illustrative; the practice set uses lesson 0's cheapest-first plan, checked by the Node test)
  var HOUR = 19, PREV_CC = 90;
  function dispatchStory(town, year, hour, prev) {
    var t = hour == null ? HOUR : hour, p0 = prev == null ? PREV_CC : prev;
    var D = townDay(town, year), f = D.fleet, need = D.need[t], reach = Math.min(f.cc.mw, p0 + f.cc.ramp);
    return {
      key: "dispatch", D: D, t: t, need: need, reach: reach, prevCC: p0, ramp: f.cc.ramp, ccMax: f.cc.mw, pkMax: f.peaker.mw,
      demand: D.demand[t], wind: D.wind[t], solar: D.solar[t], nuclear: f.nuclear.mw, costCC: f.cc.cost, costPK: f.peaker.cost,
      spillable: D.wind[t] + D.solar[t], maxSurplus: reach + f.peaker.mw - need,
      vars: [{ sym: "x", name: "combined-cycle output", unit: "MW" }, { sym: "y", name: "peaker output", unit: "MW" }],
      sense: "min", c: [f.cc.cost, f.peaker.cost], goalUnit: "$",
      rows: [
        { a: [1, 1], op: ">=", b: need, key: "cover", name: "cover", says: "the gas plants must cover at least " + need + " MW" },
        { a: [1, 0], op: "<=", b: reach, key: "ramp", name: "ramp", says: "the combined-cycle plant made " + p0 + " MW at " + (t - 1) + ":00 and can climb by at most " + f.cc.ramp + " MW an hour" },
        { a: [1, 0], op: "<=", b: f.cc.mw, key: "ccMax", name: "size", says: "the combined-cycle plant makes at most " + f.cc.mw + " MW" },
        { a: [0, 1], op: "<=", b: f.peaker.mw, key: "pkMax", name: "peaker size", says: "the peaker makes at most " + f.peaker.mw + " MW" },
        { a: [1, 0], op: ">=", b: 0, key: "x0", name: "x ≥ 0", says: "no negative output" },
        { a: [0, 1], op: ">=", b: 0, key: "y0", name: "y ≥ 0", says: "no negative output" }],
      view: [0, 160, 0, 140], ticks: [0, 20, 40, 60, 80, 100, 120, 140, 160]
    };
  }
  function planningStory(st, cf) {   // energy per MW from capacity factors, rounded to one decimal (GWh per MW-year)
    var s = JSON.parse(JSON.stringify(st)), sol = cf.targets.solar.cf, win = cf.targets.wind.cf;
    s.key = "planning"; s.exact = { solar: 8.76 * sol, wind: 8.76 * win };
    s.fill = { solarGWh: (Math.round(87.6 * sol) / 10).toFixed(1), windGWh: (Math.round(87.6 * win) / 10).toFixed(1),
               solarCF: (100 * sol).toFixed(1) + "%", windCF: (100 * win).toFixed(1) + "%" };
    s.rows[0].a = [Math.round(87.6 * sol) / 10, Math.round(87.6 * win) / 10];
    s.text = s.text.map(function (t) { return t.replace(/\{(\w+)\}/g, function (m, k) { return s.fill[k]; }); });
    return s;
  }
  function withKey(st, key) { var s = JSON.parse(JSON.stringify(st)); s.key = key; return s; }

  // readiness: right answers per group, and where each group routes
  function readiness(items, answers) {
    var g = {};
    items.forEach(function (it) { var x = g[it.group] = g[it.group] || { n: 0, right: 0 }; x.n++; if (answers[it.id] === it.answer) x.right++; });
    Object.keys(g).forEach(function (k) { var x = g[k]; x.ok = k === "linear" ? x.right >= x.n - 1 : x.right === x.n; });
    return g;
  }
  // a group's advice: `advice` once its toolbox page is live in path.json (P), `soon` (when the data gives one) while it is
  // not, so the text is right before and after the page goes live; ref is LX.lessonRef (core.js)
  function adviceFor(G, P, ref) {
    var p = String(G.route).split(":");
    return G.soon && p[0] === "tool" && !ref(P, p[1]).ready ? G.soon : G.advice;
  }

  // ---------------------------------------------------------------- numbers and rules as text (pure; the page and the test share them)
  var OPS = { "<=": "≤", ">=": "≥", "=": "=" }, OPLIST = ["<=", "=", ">="];
  function num(v) { if (v == null || !isFinite(v)) return "?"; var r = Math.round(v * 1000) / 1000; return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 3 }); }
  function money(v) { return (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US"); }
  function term(c, sym, first) {
    if (!c) return "";
    var sgn = c < 0 ? "−" : "+", mag = Math.abs(c) === 1 ? "" : num(Math.abs(c));
    return (first ? (c < 0 ? "−" : "") : " " + sgn + " ") + mag + sym;
  }
  function fmtLin(a, syms) { var s = term(a[0], syms[0], true); s += term(a[1], syms[1], !s); return s || "0"; }
  function fmtRule(r, syms) { return fmtLin(r.a, syms || ["x", "y"]) + " " + OPS[r.op] + " " + num(r.b); }
  function fmtGoal(m) { return (m.sense === "max" ? "maximize " : "minimize ") + fmtLin(m.c, m.vars.map(function (v) { return v.sym; })); }
  function syms(st) { return st.vars.map(function (v) { return v.sym; }); }
  function pt(x) { return "(" + num(x[0]) + ", " + num(x[1]) + ")"; }
  function r6(v) { return Math.round(v * 1e6) / 1e6 + 0; }
  // fill "{name}" placeholders of the data file's texts from the model; a missing value stays visible as {name} (the test fails)
  function fill(t, v) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return v[k] == null ? m : String(v[k]); }); }

  // ---------------------------------------------------------------- the practice set (Check section), pure parts
  // The corners of a story's allowed region (exact, LX.lp2.corners), left to right, each with the rules whose lines run
  // through it and the goal's value there (with costs c, default the story's).
  function cornerTable(st, c) {
    c = c || st.c;
    var name = {}; st.rows.forEach(function (r, i) { name[r.key != null ? r.key : i] = r.name || r.key; });
    return LP.corners(st.rows).map(function (p) {
      var x = [r6(p.x), r6(p.y)];
      return { x: x, keys: p.on, on: p.on.map(function (k) { return name[k]; }), value: r6(c[0] * x[0] + c[1] * x[1]) };
    }).sort(function (a, b) { return a.x[0] - b.x[0] || a.x[1] - b.x[1]; });
  }
  function samePt(a, b, tol) { return Math.abs(a[0] - b[0]) <= (tol || 1e-6) && Math.abs(a[1] - b[1]) <= (tol || 1e-6); }
  function bounds() { return [{ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }]; }
  function isBound(r) { return r.op === ">=" && r.b === 0 && ((r.a[0] === 1 && r.a[1] === 0) || (r.a[0] === 0 && r.a[1] === 1)); }
  // two rows {a, b} that say the same a·x <= b (one a positive multiple of the other)
  function sameRow(r, s) {
    var u = [r.a[0], r.a[1], r.b], v = [s.a[0], s.a[1], s.b], k = 0, dot = 0;
    for (var i = 0; i < 3; i++) { dot += u[i] * v[i]; for (var j = i + 1; j < 3; j++) k = Math.max(k, Math.abs(u[i] * v[j] - u[j] * v[i])); }
    return dot > 0 && k <= 1e-6 * (1 + Math.abs(dot));
  }
  // A x <= b written by a learner: ans = {c: [c1, c2] (min form), rows: [{a, b}] (each a row of A x <= b)}. Returns
  // {ok, why}: one line from C (the data file's practice.checks), or null while a box is empty.
  function checkArrays(st, ans, C) {
    var blank = function (v) { return v == null || !isFinite(v); };
    if (blank(ans.c[0]) || blank(ans.c[1]) || ans.rows.some(function (r) { return blank(r.a[0]) || blank(r.a[1]) || blank(r.b); })) return null;
    var rows = ans.rows.map(function (r) { return { a: [r.a[0], r.a[1]], op: "<=", b: r.b }; }), all = rows.concat(bounds());
    var res = compare(st, { sense: "min", c: ans.c, rows: all }, st.view);
    if (res.ok) {   // the best plan of the learner's own rows, valued with the story's goal
      var o = optimum({ sense: "min", c: ans.c, rows: all }, st.view);
      return { ok: true, why: fill(C.ok, { best: pt(o.x), value: money(r6(st.c[0] * o.x[0] + st.c[1] * o.x[1])) }) };
    }
    if (!res.obj.ok) return { ok: false, why: res.obj.reversed ? C.reversed : C.weights };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (st.rows.some(function (s) { return s.op === ">=" && !isBound(s) && sameRow(r, { a: s.a, b: s.b }); })) return { ok: false, why: fill(C.copied, { k: i + 1 }) };
    }
    if (res.empty.length) return { ok: false, why: C.blank };
    if (res.never.length) return { ok: false, why: fill(C.never, { k: rows.indexOf(res.never[0]) + 1, b: num(res.never[0].b) }) };
    if (res.cuts.length) return { ok: false, why: fill(C.cuts, { k: rows.indexOf(res.cuts[0]) + 1 }) };
    if (res.missing.length) return { ok: false, why: fill(C.missing, { says: res.missing[0].says }) };
    return { ok: false, why: C.weights };
  }

  // Every practice exercise's numbers, texts and check, from the model. J = the data file, town/year = the real day,
  // cf = cf_targets.json. Each spec: {st (the story), vars (the numbers its texts use), the filled texts, hints, and
  // check(answer) -> {ok, why} | null}.
  function practiceSpecs(J, town, year, cf) {
    var P = J.practice.items, C = J.practice.checks, out = {};
    var f = function (v) { return function (t) { return fill(t, v); }; };
    function dvars(st) {
      return { hh: st.t + ":00", hhPrev: (st.t - 1) + ":00", date: st.D.dateLabel, need: st.need, prev: st.prevCC, ramp: st.ramp,
               pkMax: st.pkMax, reach: st.reach, costCC: st.costCC, costPK: st.costPK, goal: fmtLin(st.c, syms(st)) };
    }
    function titled(st, it) { st.title = "Prairie Town at " + st.t + ":00, " + st.D.dateLabel; st.text = [].concat(it.text).map(f(dvars(st))); st.labels = it.labels; return st; }

    // ---- best corner, worked (14:00): every corner costed; then a what-if peaker price
    (function () {
      var it = P.c14, st = titled(dispatchStory(town, year, it.hour, it.prev), it), T = cornerTable(st), best = optimum(st, st.view);
      var c2 = [st.c[0], it.whatIfPK], T2 = cornerTable(st, c2), alt = optimum({ sense: "min", c: c2, rows: st.rows }, st.view);
      var v = dvars(st); v.nCorners = T.length; v.best = pt(best.x) + " at " + money(best.value); v.alt = it.whatIfPK; v.altBest = pt(alt.x); v.altBestCost = money(alt.value);
      out.c14 = { st: st, vars: v, table: T, best: best, alt: { c: c2, table: T2, best: alt, index: T2.map(function (r) { return samePt(r.x, alt.x); }).indexOf(true) },
        worked: fill(it.worked, v), q: fill(it.q, v), hints: it.hints.map(f(v)),
        check: function (i) {
          var r = T2[i]; if (!r) return null; var ok = samePt(r.x, alt.x);
          return { ok: ok, why: fill(ok ? it.right : it.wrong, Object.assign({ pick: pt(r.x), pickCost: money(r.value) }, v)) };
        } };
    })();

    // ---- best corner, partly worked (18:00): the corner where the cover line meets the ramp line is left to find
    (function () {
      var it = P.c18, st = titled(dispatchStory(town, year, it.hour, it.prev), it), T = cornerTable(st), best = optimum(st, st.view);
      var hid = T.map(function (r) { return r.keys.indexOf("cover") >= 0 && r.keys.indexOf("ramp") >= 0; }).indexOf(true), H0 = T[hid];
      var v = dvars(st); v.bx = H0.x[0]; v.by = H0.x[1]; v.bestCost = money(H0.value);
      out.c18 = { st: st, vars: v, table: T, best: best, hidden: hid, ask: it.ask, hints: it.hints.map(f(v)),
        check: function (a) {
          if (![a.x, a.y, a.cost].every(isFinite)) return null;
          var w = Object.assign({ x: num(a.x), y: num(a.y) }, v);
          if (Math.abs(a.x - st.reach) > 1e-6 || Math.abs(a.x + a.y - st.need) > 1e-6) return { ok: false, why: fill(it.offLine, w) };
          if (Math.abs(a.cost - H0.value) > 0.5) return { ok: false, why: fill(it.badCost, w) };
          return { ok: true, why: fill(it.right, w) };
        } };
    })();

    // ---- best corner, from scratch (tonight's imports)
    (function () {
      var it = P.imports, st = withKey(J.stories.imports, "imports"), T = cornerTable(st), best = optimum(st, st.view);
      var R = {}; st.rows.forEach(function (r) { R[r.key] = r; });
      var v = { need: R.cover.b, capA: num(R.cap.a[0]), capB: num(R.cap.a[1]), cap: R.cap.b, k: num(r6(R.cap.a[0] - R.cap.a[1])),
                rhs: num(r6(R.cap.b - R.cap.a[1] * R.cover.b)), bx: num(best.x[0]), by: num(best.x[1]), bestCost: money(best.value),
                north: R.north.b, nCorners: T.length, nAxis: T.filter(function (r) { return r.x[0] === 0; }).length, cN: st.c[0], cS: st.c[1] };
      out.imports = { st: st, vars: v, table: T, best: best, ask: it.ask, hints: it.hints.map(f(v)),
        check: function (a) {
          if (![a.x, a.y, a.cost].every(isFinite)) return null;
          var p = [a.x, a.y], w = Object.assign({ x: num(a.x), y: num(a.y), cost: money(st.c[0] * a.x + st.c[1] * a.y) }, v);
          var broken = st.rows.filter(function (r) { return !holds(r, p, 1e-6); });
          if (broken.length) return { ok: false, why: fill(it.breaks, Object.assign({ says: broken[0].says }, w)) };
          if (!samePt(p, best.x, 1e-6)) return { ok: false, why: fill(it.notBest, w) };
          if (Math.abs(a.cost - best.value) > 0.5) return { ok: false, why: fill(it.badCost, w) };
          return { ok: true, why: fill(it.right, w) };
        } };
    })();

    // ---- A x <= b, worked (the planning model of step 7), with a what-if goal
    (function () {
      var it = P.aplan, st = planningStory(J.stories.planning, cf), A = toArrays(st);
      var st2 = JSON.parse(JSON.stringify(st)); st2.rows[0].b = it.newGoal; var A2 = toArrays(st2);
      var v = { newGoal: it.newGoal, b1: num(A.b[0]), s: st.fill.solarGWh, w: st.fill.windGWh, conn: A.b[1] };
      out.aplan = { st: st, vars: v, arrays: A, changed: A2, q: fill(it.q, v), choices: it.choices.map(f(v)), answer: it.answer, hints: it.hints.map(f(v)),
        why: A.src.map(function (i) { return it.why[st.rows[i].key]; }),
        check: function (i) { if (i == null || !it.choices[i]) return null; return { ok: i === it.answer, why: fill(it.reasons[i], v) }; } };
    })();

    // ---- A x <= b, partly worked (the battery of step 8): three rows given; c in min form and the losses row left
    (function () {
      var it = P.abat, st = withKey(J.stories.battery, "battery"), A = toArrays(st), sy = syms(st);
      var given = [], left = [];
      A.src.forEach(function (i, k) { var row = { a: A.A[k], b: A.b[k], key: st.rows[i].key }; (it.locked.indexOf(row.key) >= 0 ? given : left).push(row); });
      var loss = left[0];
      var v = { gmax: fmtLin(st.c, sy), gmin: fmtLin(A.c, sy), lossRule: sy[1] + " ≤ " + num(-loss.a[0]) + sy[0], lossLe: fmtRule({ a: loss.a, op: "<=", b: loss.b }, sy),
                c1: num(A.c[0]), c2: num(A.c[1]), l1: num(loss.a[0]), l2: num(loss.a[1]), lb: num(loss.b) };
      out.abat = { st: st, vars: v, arrays: A, given: given, left: left, ask: it.ask, hints: it.hints.map(f(v)),
        answer: { c: A.c.slice(), rows: left.map(function (r) { return { a: r.a.slice(), b: r.b }; }) },
        check: function (a) { return checkArrays(st, { c: a.c, rows: given.concat(a.rows) }, C); } };
    })();

    // ---- A x <= b, from scratch (the bus depot)
    (function () {
      var it = P.abus, st = withKey(J.stories.bus, "bus"), A = toArrays(st), R = {}; st.rows.forEach(function (r) { R[r.key] = r; });
      var rows = A.A.map(function (a, k) { return { a: a, b: A.b[k] }; });
      var v = { need: R.need.b, shuttle: R.shuttle.b, c1: num(A.c[0]), c2: num(A.c[1]),
                rows: rows.map(function (r) { return pt(r.a) + " ≤ " + num(r.b); }).reduce(function (s, t, k, all) { return s + (k ? (k === all.length - 1 ? " and " : ", ") : "") + t; }, "") };
      out.abus = { st: st, vars: v, arrays: A, ask: it.ask, hints: it.hints.map(f(v)), answer: { c: A.c.slice(), rows: rows },
        check: function (a) { return checkArrays(st, a, C); } };
    })();
    return out;
  }

  // ---------------------------------------------------------------- text versions of a plane (pure; the page and the test share them)
  // where a rule's line runs inside the view, and which side of it passes
  function sideWords(r) {
    if (r.op === "=") return "only plans on it pass";
    var below = r.op === "<=";
    if (r.a[1]) return "plans " + ((r.a[1] > 0) === below ? "below" : "above") + " it pass";
    return "plans " + ((r.a[0] > 0) === below ? "left of" : "right of") + " it pass";
  }
  function ruleWords(r, sy, view) {
    var sg = LP.segment(r.a, r.b, view);
    return "The line " + fmtLin(r.a, sy || ["x", "y"]) + " = " + num(r.b) + (sg ? " runs from " + pt(sg[0]) + " to " + pt(sg[1]) : " lies outside the drawing") + "; " + sideWords(r) + ".";
  }
  // the best plan of any rules a learner writes (rules with a decision in them): unbounded only when a direction the
  // region runs along forever improves the goal (LX.lp2.rays), so an open region with a finite best (minimize x with
  // x, y >= 0) is not called unbounded; exact corners (LX.lp2.solve) when the region has one, which x >= 0 and y >= 0
  // guarantee. -> {status: "optimal" | "tied" | "unbounded" | "infeasible", x: [x, y] or null}
  function bestPlan(m, view) {
    var rows = m.rows, sg = m.sense === "max" ? -1 : 1, c = [sg * m.c[0], sg * m.c[1]];
    if (!region(rows, bigBox(view)).length) return { status: "infeasible", x: null };
    if (LP.rays(rows).some(function (r) { return c[0] * r[0] + c[1] * r[1] < -1e-9; })) return { status: "unbounded", x: null };
    if (LP.corners(rows).length) { var e = LP.solve(m); return { status: e.status, x: [r6(e.x), r6(e.y)] }; }
    return { status: "tied", x: null };   // no corner: the best plans fill a whole line
  }
  // a learner's rules (and goal, once chosen) in words: the region's corners, whether it is open, and the best plan;
  // lead names the rules (default "Your rules: ")
  function describeModel(m, sy, view, lead) {
    var all = m.rows || [], rows = all.filter(function (r) { return r.a[0] || r.a[1]; });
    if (!all.length) return ["No rules yet: every plan passes."];
    var out = [(lead || "Your rules: ") + all.map(function (r) { return fmtRule(r, sy); }).join(", ") + "."];
    var never = all.filter(function (r) { return !r.a[0] && !r.a[1] && !holds(r, [0, 0], 1e-9); });
    if (never.length) { out.push(fmtRule(never[0], sy) + " has no decision in it and is never true: no plan passes."); return out; }
    if (!rows.length) { out.push("None of them has a decision in it: every plan passes."); return out; }
    if (!region(rows, bigBox(view)).length) { out.push("No plan passes all of them."); return out; }
    var C = LP.corners(rows), open = LP.rays(rows).length > 0;
    out.push(C.length ? "The plans that pass them all form a region with corners " + C.map(function (p) { return pt([r6(p.x), r6(p.y)]); }).join(", ") + (open ? "; it goes on forever in some direction." : ".")
                      : "The plans that pass them all form a region without corners" + (open ? " that goes on forever." : "."));
    if (m.sense && (m.c[0] || m.c[1])) {
      var o = bestPlan({ sense: m.sense, c: m.c, rows: rows }, view);
      if (o.status === "optimal") out.push("Best plan for your goal: " + pt(o.x) + ".");
      else if (o.status === "tied" && o.x) out.push("Best plan for your goal: " + pt(o.x) + "; other plans tie with it.");
      else if (o.status === "tied") out.push("Many plans tie for best: a whole line of them.");
      else if (o.status === "unbounded") out.push("Your goal improves forever: the model is unbounded.");
    }
    return out;
  }
  // the solver's answer in words, valued with the story's own goal; when the learner's goal is a scaled or sign-flipped
  // copy (min 30c − 120d for max 120d − 30c), its own value is named as well, so −6,240 is not read as a loss
  function solverLine(story, names, x, y, objective) {
    var v = r6(story.c[0] * x + story.c[1] * y), own = Math.abs(objective - v) > 1e-6 * (1 + Math.abs(v));
    return names[0] + " = " + num(x) + ", " + names[1] + " = " + num(y) + ", " + (story.sense === "max" ? "earns " : "costs ") + money(v) +
      (own ? "; your goal's own value is " + num(objective) + ", the same plan on your goal's scale" : "");
  }

  var model = { townDay: townDay, le: le, lhs: LP.lhs, holds: holds, clip: LP.clip, region: region, optimum: optimum, compare: compare,
                toArrays: toArrays, dispatchStory: dispatchStory, planningStory: planningStory, withKey: withKey, readiness: readiness, adviceFor: adviceFor,
                cornerTable: cornerTable, checkArrays: checkArrays, practiceSpecs: practiceSpecs, fill: fill, num: num, money: money, pt: pt,
                fmtRule: fmtRule, ruleWords: ruleWords, describeModel: describeModel, bestPlan: bestPlan, solverLine: solverLine, tolAt: tolAt, HOUR: HOUR, PREV_CC: PREV_CC };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, S = LX.S;
  function parseNum(s) {
    s = String(s == null ? "" : s).trim().replace(/[−–]/g, "-").replace(/,/g, "").replace(/\s+/g, "");
    if (s === "" || s === "+") return 0; if (s === "-") return -1;
    var m = /^([+-]?\d*\.?\d+)\/(\d*\.?\d+)$/.exec(s); if (m) return parseFloat(m[1]) / parseFloat(m[2]);
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
  }

  function seg(host, labels, sel, onPick, aria) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": aria || "Choose" }, host), bs = [];
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", "aria-pressed": i === sel ? "true" : "false", text: l }, g);
      b.addEventListener("click", function () { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); onPick(i); });
      bs.push(b);
    });
    return { el: g, set: function (i) { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); } };
  }
  function liveAlt(host, title) { var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title }, d); return H("ul", null, d); }
  function setItems(ul, items) { ul.innerHTML = ""; items.forEach(function (t) { H("li", { text: t }, ul); }); }
  function textAlt(host, title, items) {
    var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title }, d);
    var ul = H("ul", null, d); items.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    return d;
  }
  function storyBox(host, st, bare) {   // bare: no title line (the practice exercise's heading already names the story)
    var b = H("div", { class: "b1-story" }, host);
    if (!bare) H("p", { class: "lx-eyebrow", text: st.title }, b);
    var ul = H("ul", { class: "b1-story-rows" }, b);
    st.text.forEach(function (t, i) {
      var li = H("li", null, ul), k = st.labels && st.labels[i];
      if (k) H("span", { class: "b1-story-k", text: k }, li);
      H("span", { html: LX.rich(t) }, li);
    });
    return b;
  }
  function planeFor(host, st, aria) {
    var v = st.vars;
    return LX.LPPlane(host, { view: st.view, ticks: st.ticks, xLabel: v[0].sym + ": " + v[0].name + ", " + v[0].unit, yLabel: v[1].sym + ": " + v[1].name + ", " + v[1].unit, aria: aria });
  }

  // ---- the model builder: the goal and the rules as editable rows, drawn live on a plane, checked against the story
  // o: {story, mode: "one" (one rule to write; the rest given) | "all" (everything from scratch), id, onSolved(model)}
  function Builder(host, o) {
    var st = o.story, sy = syms(st), box = H("div", { class: "b1-builder" }, host);
    var mine = { sense: o.mode === "one" ? st.sense : null, c: o.mode === "one" ? st.c.slice() : [NaN, NaN], rows: [] };
    if (o.mode === "one") st.rows.forEach(function (r) { if (r.given !== false) mine.rows.push({ a: r.a.slice(), op: r.op, b: r.b, locked: true }); });
    mine.rows.push({ a: [NaN, NaN], op: "<=", b: NaN });
    if (o.mode === "all") mine.rows.push({ a: [NaN, NaN], op: "<=", b: NaN });
    var goal = H("div", { class: "b1-goal" }, box), list = H("div", { class: "b1-rows" }, box), tools = H("div", { class: "b1-tools" }, box);
    var pl = planeFor(box, st, "Your rules for " + st.title + ", and the plans that pass them all.");
    var alt = H("details", { class: "lx-textalt" }, box); H("summary", { text: "Text version" }, alt); var altList = H("ul", null, alt);
    var out = H("div", { "aria-live": "polite" }, box), hintBox = H("div", { class: "b1-hints", "aria-live": "polite" }, box);
    var acts = H("div", { class: "b1-acts" }, box), hints = 0, solved = false;
    var check = H("button", { type: "button", class: "lx-btn small", html: LX.icon("check") + "Check my model" }, acts);
    var hint = H("button", { type: "button", class: "lx-btn ghost small", text: "Hint 1 of 3" }, acts);
    var show = H("button", { type: "button", class: "lx-btn ghost small", text: "Show the answer", hidden: true }, acts);
    function inp(val, label, onIn, cls) {
      var i = H("input", { type: "text", inputmode: "decimal", autocomplete: "off", class: "b1-in " + (cls || ""), "aria-label": label, placeholder: "0", value: isFinite(val) ? num(val).replace("−", "-") : "" }, null);
      i.addEventListener("input", function () { onIn(parseNum(i.value)); i.classList.toggle("bad", isNaN(parseNum(i.value))); draw(); });
      return i;
    }
    function renderGoal() {
      goal.innerHTML = "";
      H("span", { class: "b1-k", text: "Goal" }, goal);
      if (o.mode === "one") { H("span", { class: "b1-fixed", text: fmtGoal({ sense: st.sense, c: st.c, vars: st.vars }) + " (" + st.goalUnit + ")" }, goal); return; }
      var sg = seg(goal, ["min", "max"], mine.sense === "min" ? 0 : mine.sense === "max" ? 1 : -1, function (i) { mine.sense = i ? "max" : "min"; draw(); }, "Minimize or maximize");
      sg.el.classList.add("b1-sense");
      var w = H("span", { class: "b1-lin" }, goal);
      w.appendChild(inp(mine.c[0], "Goal coefficient of " + sy[0], function (v) { mine.c[0] = v; })); H("span", { class: "b1-sym", text: sy[0] + " +" }, w);
      w.appendChild(inp(mine.c[1], "Goal coefficient of " + sy[1], function (v) { mine.c[1] = v; })); H("span", { class: "b1-sym", text: sy[1] }, w);
    }
    function renderRows() {
      list.innerHTML = "";
      mine.rows.forEach(function (r, i) {
        var row = H("div", { class: "b1-row" + (r.locked ? " locked" : "") }, list);
        if (r.locked) { H("span", { class: "b1-fixed", text: fmtRule(r, sy) }, row); H("span", { class: "b1-tag", text: "given" }, row); return; }
        var w = H("span", { class: "b1-lin" }, row);
        w.appendChild(inp(r.a[0], "Rule " + (i + 1) + ": coefficient of " + sy[0], function (v) { r.a[0] = v; })); H("span", { class: "b1-sym", text: sy[0] + " +" }, w);
        w.appendChild(inp(r.a[1], "Rule " + (i + 1) + ": coefficient of " + sy[1], function (v) { r.a[1] = v; })); H("span", { class: "b1-sym", text: sy[1] }, w);
        var sg = seg(row, ["≤", "=", "≥"], OPLIST.indexOf(r.op), function (k) { r.op = OPLIST[k]; draw(); }, "Sign of rule " + (i + 1));
        sg.el.classList.add("b1-op");
        row.appendChild(inp(r.b, "Rule " + (i + 1) + ": right-hand side", function (v) { r.b = v; }, "rhs"));
        if (o.mode === "all") { var del = H("button", { type: "button", class: "b1-del", "aria-label": "Remove rule " + (i + 1), html: LX.icon("cross") }, row);
          del.addEventListener("click", function () { mine.rows.splice(i, 1); renderRows(); draw(); }); }
      });
    }
    if (o.mode === "all") {
      var add = H("button", { type: "button", class: "lx-btn ghost small", text: "Add a rule" }, tools);
      add.addEventListener("click", function () { mine.rows.push({ a: [NaN, NaN], op: "<=", b: NaN }); renderRows(); draw(); var ins = list.querySelectorAll("input"); if (ins.length) ins[ins.length - 3].focus(); });
      var nn = H("button", { type: "button", class: "lx-btn ghost small", text: "Add " + sy[0] + " ≥ 0 and " + sy[1] + " ≥ 0" }, tools);
      nn.addEventListener("click", function () { mine.rows.push({ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }); renderRows(); draw(); });
    }
    function clean() { return { sense: mine.sense, c: mine.c.map(function (x) { return isFinite(x) ? x : 0; }),
      rows: mine.rows.filter(function (r) { return isFinite(r.b) && (isFinite(r.a[0]) || isFinite(r.a[1])); }).map(function (r) { return { a: [isFinite(r.a[0]) ? r.a[0] : 0, isFinite(r.a[1]) ? r.a[1] : 0], op: r.op, b: r.b }; }) }; }
    function draw() {
      var m = clean(); pl.clear();
      var usable = m.rows.filter(function (r) { return r.a[0] || r.a[1]; });   // rules with no decision draw no line but still count
      if (m.rows.length) pl.region(m.rows);
      usable.forEach(function (r) { pl.rule(r, { label: r.b === 0 && (!r.a[0] || !r.a[1]) ? null : fmtRule(r, sy), cls: "on" }); });
      var never = m.rows.some(function (r) { return !r.a[0] && !r.a[1] && !holds(r, [0, 0], 1e-9); });
      if (m.sense && (m.c[0] || m.c[1]) && usable.length && !never) {
        var opt = bestPlan({ sense: m.sense, c: m.c, rows: usable }, st.view);
        if (opt.x && (opt.status === "optimal" || opt.status === "tied")) pl.point(opt.x, { label: "best: (" + num(opt.x[0]) + ", " + num(opt.x[1]) + ")" });
      }
      setItems(altList, describeModel(m, sy, st.view));
    }
    function report(res, m) {
      out.innerHTML = "";
      if (res.ok) {
        var opt = optimum(m, st.view), v = r6(st.c[0] * opt.x[0] + st.c[1] * opt.x[1]);
        solved = true; box.classList.add("is-solved");
        var gtxt = st.goalUnit === "$k a year" ? "$" + (v / 1000).toFixed(1) + " million a year" : st.goalUnit.charAt(0) === "$" ? money(v) + st.goalUnit.slice(1) : num(v) + " " + st.goalUnit;
        H("div", { class: "lx-saw", html: LX.icon("check") + "<div><b>Your model matches the story.</b> " + LX.esc("Best plan: " + sy[0] + " = " + num(opt.x[0]) + " " + st.vars[0].unit + ", " + sy[1] + " = " + num(opt.x[1]) + " " + st.vars[1].unit + "; goal " + gtxt + ".") +
          (res.obj.factor && Math.abs(res.obj.factor - 1) > 0.01 ? " " + LX.esc("(Your goal is the story's times " + num(res.obj.factor) + ": the same best plan, a scaled value.)") : "") +
          (res.idle.length ? " " + LX.esc("(" + fmtRule(res.idle[0], sy) + " has no decision in it: always true, so it changes nothing.)") : "") + "</div>" }, out);
        if (o.onSolved) o.onSolved(clean(), opt);
        return;
      }
      var msgs = [];
      if (o.mode === "all" && !mine.sense) msgs.push("Choose min or max for the goal.");
      else if (!res.obj.ok) msgs.push(res.obj.reversed ? "Your goal points the wrong way: it would chase the worst plan. Check min or max, or the signs." : "Your goal weighs " + sy[0] + " and " + sy[1] + " differently from the story. Check its two numbers.");
      res.missing.forEach(function (r) { msgs.push("Your model lets through plans that break this sentence: “" + r.says + "”."); });
      res.never.forEach(function (r) { msgs.push("Your rule " + fmtRule(r, sy) + " has no decision in it and is never true, so no plan passes. Remove it or fill in its numbers."); });
      res.cuts.forEach(function (r) { msgs.push("Your rule " + fmtRule(r, sy) + " rules out plans the story allows. Check its sign, numbers or right-hand side."); });
      if (res.empty.length) msgs.push("A rule is empty or unreadable: fill in its numbers or remove it.");
      var box2 = H("div", { class: "lx-saw no", html: LX.icon("question") + "<div><b>Not yet.</b></div>" }, out), ul = H("ul", { class: "b1-msgs" }, box2.lastChild);
      msgs.slice(0, 4).forEach(function (t) { H("li", { text: t }, ul); });
    }
    check.addEventListener("click", function () {
      var m = clean();   // a rule with no decision in it stays: 0 ≤ −1 makes the model infeasible, 0 ≤ 1 changes nothing
      if (!m.sense) { out.innerHTML = ""; H("div", { class: "lx-saw no", html: LX.icon("question") + "<div><b>Not yet.</b> Choose min or max for the goal first.</div>" }, out); return; }
      report(compare(st, m, st.view), m);
    });
    hint.addEventListener("click", function () {
      if (hints >= st.hints.length) return;
      H("p", { class: "b1-hint", html: "<b>Hint " + (hints + 1) + ".</b> " + LX.esc(st.hints[hints]) }, hintBox); hints++;
      hint.textContent = hints < st.hints.length ? "Hint " + (hints + 1) + " of " + st.hints.length : "No more hints";
      hint.disabled = hints >= st.hints.length; show.hidden = hints < st.hints.length;
    });
    show.addEventListener("click", function () { fill(); check.click(); });
    function fill() {
      if (o.mode === "one") { mine.rows = mine.rows.filter(function (r) { return r.locked; }); st.rows.forEach(function (r) { if (r.given === false) mine.rows.push({ a: r.a.slice(), op: r.op, b: r.b }); }); }
      else { mine.sense = st.sense; mine.c = st.c.slice(); mine.rows = st.rows.map(function (r) { return { a: r.a.slice(), op: r.op, b: r.b }; }); }
      renderGoal(); renderRows(); draw();
    }
    renderGoal(); renderRows(); draw();
    return { fill: fill, check: function () { check.click(); }, solved: function () { return solved; }, model: clean };
  }

  // ---- readiness check: one question at a time, then a result per group with where to go
  function Readiness(host, R, P, api) {
    var box = H("div", { class: "b1-ready" }, host), k = 0, ans = LX.store.get("b1-ready", {}) || {};
    var head = H("div", { class: "b1-ready-top" }, box), bar = H("div", { class: "lx-dots", "aria-hidden": "true" }, head);
    var cnt = H("span", { class: "lx-step-n" }, head), body = H("div", { class: "b1-ready-q" }, box);
    R.items.forEach(function () { H("i", null, bar); });
    function href(route) {
      var p = route.split(":"), it = null;
      if (p[0] === "starter") it = (P.starter || []).filter(function (s) { return String(s.starter) === p[1]; })[0];
      else (P.toolbox || []).forEach(function (t) { if (t.code === p[1]) it = t; });
      return it && it.href ? it.href : "index.html#toolbox";
    }
    function result() {
      body.innerHTML = ""; cnt.textContent = "Done";
      var g = readiness(R.items, ans), right = R.items.filter(function (it) { return ans[it.id] === it.answer; }).length;
      H("p", { class: "lx-qtext", text: right + " of " + R.items.length + " right." }, body);
      var ul = H("ul", { class: "b1-route" }, body);
      Object.keys(R.groups).forEach(function (key) {
        var G = R.groups[key], x = g[key] || { right: 0, n: 0, ok: true }, li = H("li", { class: x.ok ? "ok" : "go" }, ul);
        H("span", { class: "b1-route-k", html: LX.icon(x.ok ? "check" : "arrow") + LX.esc(G.label) + " · " + x.right + "/" + x.n }, li);
        if (!x.ok) { var t = H("span", null, li); t.appendChild(document.createTextNode(adviceFor(G, P, LX.lessonRef) + " ")); H("a", { href: href(G.route), text: "Go there" }, t); }
      });
      var lin = g.linear || { ok: true };
      H("p", { class: "lx-hint", text: lin.ok ? "You are ready for this lesson. Press Next." : "You can still go on: the toolbox page will be one tap away in every step." }, body);
      api.saw(lin.ok ? "Ready: carry on with the story below." : "Toolbox K4 first is the faster route; the lesson stays here.", !lin.ok);
    }
    function show() {
      [].forEach.call(bar.children, function (d, j) { d.className = j < k ? "done" : j === k ? "cur" : ""; });
      if (k >= R.items.length) { LX.store.set("b1-ready", ans); return result(); }
      var it = R.items[k]; body.innerHTML = ""; cnt.textContent = "Question " + (k + 1) + " of " + R.items.length;
      var qid = LX.uid("rq");
      H("p", { class: "lx-qtext", id: qid, text: it.q }, body);
      var row = H("div", { class: "lx-qbtns b1-ready-btns", role: "group", "aria-labelledby": qid }, body), fb = H("div", { "aria-live": "polite" }, body), nx;
      it.choices.forEach(function (c, i) {
        var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: c }, row);
        b.addEventListener("click", function () {
          if (ans[it.id] != null && nx) return;
          ans[it.id] = i; b.setAttribute("aria-pressed", "true"); b.classList.add(i === it.answer ? "right" : "wrong");
          H("div", { class: "lx-saw" + (i === it.answer ? "" : " no"), html: LX.icon(i === it.answer ? "check" : "question") + "<div><b>" + (i === it.answer ? "Right." : "Not quite.") + "</b> " + LX.esc(it.why) + "</div>" }, fb);
          nx = H("button", { type: "button", class: "lx-btn small", html: (k + 1 < R.items.length ? "Next question" : "See my result") + LX.icon("arrow") }, fb);
          nx.addEventListener("click", function () { k++; show(); var f = box.querySelector("button"); if (f) f.focus(); });
          nx.focus();
        });
      });
    }
    if (Object.keys(ans).length >= R.items.length) { k = R.items.length; show(); } else { ans = {}; show(); }
    return { result: function () { R.items.forEach(function (it) { if (ans[it.id] == null) ans[it.id] = it.answer; }); k = R.items.length; show(); } };
  }

  // ================================================================ the lesson
  function view(live, data, root) {
    var J = data.b01_algebra_to_lp, P = data.path || {};
    var d1 = dispatchStory(data.town, data.town_year), d1s = syms(d1);
    d1.title = "Prairie Town at " + d1.t + ":00, " + d1.D.dateLabel;
    var planning = planningStory(J.stories.planning, data.cf_targets), battery = withKey(J.stories.battery, "battery");
    var best1 = optimum(d1, d1.view), bestP = optimum(planning, planning.view), bestB = optimum(battery, battery.view);
    var hh = d1.t + ":00";
    var steps = [], diyModel = null;

    // 1 readiness
    steps.push({
      text: "Ten quick questions, about three minutes. They show whether to start here or take a short toolbox detour first. Skip them if you are sure.",
      free: true, build: function (act, api) { Readiness(act, J.ready, P, api); }
    });

    // 2 tag the story
    var PH = [
      ["must cover at least " + d1.need + " MW", 2], ["how much the combined-cycle plant makes (x MW)", 0], ["how much the peaker makes (y MW)", 0],
      ["at the lowest running cost", 1], ["costs $" + d1.costCC + " per MWh", 3], ["made " + d1.prevCC + " MW at 18:00", 3],
      ["can climb by at most " + d1.ramp + " MW an hour", 2], ["can make at most " + d1.pkMax + " MW", 2]];
    var CATS = ["Decision", "Goal", "Rule", "Given"];
    steps.push({
      text: "A model starts as a story. Tag each phrase: a [[decision-variable|decision]] you choose, the [[objective|goal]], a [[constraint|rule]] you must keep, or a given number.",
      build: function (act, api) {
        storyBox(act, { title: d1.title, labels: ["Need", "Choose", "Combined-cycle", "Peaker"], text: [
          "After nuclear, wind and solar, the gas plants " + PH[0][0] + ".",
          "The operator chooses " + PH[1][0] + " and " + PH[2][0] + ", " + PH[3][0] + ".",
          "The [[combined-cycle|combined-cycle plant]] " + PH[4][0] + "; it " + PH[5][0] + " and " + PH[6][0] + ".",
          "The [[peaker|peaker]] costs $" + d1.costPK + " per MWh and " + PH[7][0] + "."] });
        var list = H("div", { class: "b1-tags" }, act), right = {};
        PH.forEach(function (p, i) {
          var row = H("div", { class: "b1-tagrow" }, list); H("p", { text: "“" + p[0] + "”" }, row);
          var mark = H("span", { class: "k4-mark", "aria-live": "polite" }, row);
          seg(row, CATS, -1, function (k) {
            right[i] = k === p[1]; mark.textContent = right[i] ? CATS[k] : "Not quite"; mark.className = "k4-mark " + (right[i] ? "good" : "bad");
            if (PH.every(function (q, j) { return right[j]; })) { api.done(); api.saw("Decisions: x and y. Goal: the lowest running cost. Rules: cover " + d1.need + " MW, the ramp, the peaker's size. Givens, like prices and last hour's " + d1.prevCC + " MW, feed the goal and the rules."); }
          }, "Tag for: " + p[0]);
        });
      }
    });

    // 3 worked example, one line at a time
    var LINES = [
      ["Decisions", "x = combined-cycle output at " + hh + "; y = peaker output", "x, y", "MW"],
      ["Goal", "the lowest running cost this hour", "minimize " + d1.costCC + "x + " + d1.costPK + "y", "$/MWh × MW × 1 h = $"],
      ["Rule: cover the gap", "at least " + d1.need + " MW from gas", "x + y ≥ " + d1.need, "MW"],
      ["Why ≥, not =", "gas above " + d1.need + " MW is matched by spilling wind or sun (" + d1.spillable + " MW of it this hour)", "x + y may exceed " + d1.need, "MW"],
      ["Rule: ramp", d1.prevCC + " MW last hour, at most " + d1.ramp + " MW more (the drop is left out)", "x ≤ " + d1.prevCC + " + " + d1.ramp + " = " + d1.reach, "MW"],
      ["Rule: plant sizes", "at most " + d1.ccMax + " and " + d1.pkMax + " MW", "x ≤ " + d1.ccMax + ", y ≤ " + d1.pkMax, "MW"],
      ["Rule nobody says", "a plant cannot make negative power", "x ≥ 0, y ≥ 0", "MW"]];
    steps.push({
      text: "Now translate, one line at a time: decisions get letters, the goal becomes a sum to minimize, each rule an inequality. Reveal each line and check its units.",
      build: function (act, api) {
        var tb = H("div", { class: "b1-worked", role: "list" }, act), k = 0;
        var btn = H("button", { type: "button", class: "lx-btn small", html: "Next line" + LX.icon("arrow") }, act);
        function add() {
          var L = LINES[k], row = H("div", { class: "b1-wline", role: "listitem" }, tb);
          H("span", { class: "b1-wk", text: L[0] }, row); H("span", { class: "b1-ww", text: L[1] }, row); H("span", { class: "b1-wm", text: L[2] }, row); H("span", { class: "b1-wu", text: L[3] }, row);
          k++;
          if (k >= LINES.length) { btn.hidden = true; api.done(); api.saw("That is the whole model: two decisions, one goal, " + d1.rows.length + " rules. Every line's units match, a first check that the translation is right."); }
        }
        btn.addEventListener("click", add); add();
      }
    });

    // 4 the rules on the plane
    steps.push({
      text: "Each [[inequality|inequality]] is a line plus a side. Switch the rules on one at a time and watch the allowed plans shrink.",
      build: function (act, api) {
        var on = {}, chips = H("div", { class: "k4-chips", role: "group", "aria-label": "Rules" }, act);
        var pl = planeFor(act, d1, "The dispatch rules switched on, and the plans that pass them all.");
        var out = H("p", { class: "k4-test", "aria-live": "polite" }, act), alt4 = null;
        d1.rows.forEach(function (r) {
          var b = H("button", { type: "button", class: "lx-chip", "aria-pressed": "false" }, chips); H("i", { style: "--c:var(--lx-accent)" }, b); H("span", { text: fmtRule(r) }, b);
          b.addEventListener("click", function () { on[r.key] = !on[r.key]; b.setAttribute("aria-pressed", on[r.key] ? "true" : "false"); draw(r.key); });
        });
        function draw(last) {
          var rules = d1.rows.filter(function (r) { return on[r.key]; });
          pl.clear(); var P = rules.length ? pl.region(rules) : [];
          rules.forEach(function (r) { pl.rule(r, { label: r.b === 0 ? null : fmtRule(r), cls: r.key === last ? "hot" : "on" }); });
          var all = rules.length === d1.rows.length;
          if (last === "ccMax" && on.ccMax && on.ramp) out.textContent = "x ≤ " + d1.ccMax + " changes nothing while x ≤ " + d1.reach + " is on: it is redundant this hour.";
          else out.textContent = all ? "All six rules: a triangle of allowed plans." : rules.length + " of " + d1.rows.length + " rules on.";
          if (all) { api.done(); api.saw("Six rules leave a triangle of allowed plans, the [[feasible-region|feasible region]]. x ≤ " + d1.ccMax + " changes nothing, because x ≤ " + d1.reach + " is tighter: a redundant rule."); }
          if (alt4) setItems(alt4, describeModel({ rows: rules }, ["x", "y"], d1.view, "Rules on: ").map(function (t) { return t.replace("No rules yet: every plan passes.", "No rules on: every plan passes."); })
            .concat(all ? ["Plans above the cover line make more than " + d1.need + " MW of gas; the extra, at most " + d1.maxSurplus + " MW, is matched by spilling some of the " + d1.spillable + " MW of wind and sun."] : []));
          return P;
        }
        alt4 = liveAlt(act, "Text version");
        draw();
      }
    });

    // 5 the cheapest corner
    steps.push({
      text: "Every point is a plan. Move it to the cheapest plan that keeps every rule; the dashed line joins all plans with the same cost.",
      build: function (act, api) {
        var p = [60, 100], moves = 0, bestSeen = null;
        var pl = planeFor(act, d1, "Your plan, the allowed region, and the line of plans with your plan's cost.");
        var out = H("p", { class: "k4-test", "aria-live": "polite" }, act);
        var sxl = LX.Slider(act, { label: "x, combined-cycle", color: "var(--lx-cc)", max: d1.ccMax, step: 5, onChange: function (v) { p[0] = v; moves++; draw(); } });
        var syl = LX.Slider(act, { label: "y, peaker", color: "var(--lx-pk)", max: d1.pkMax, step: 5, onChange: function (v) { p[1] = v; moves++; draw(); } });
        sxl.set(p[0]); syl.set(p[1]);
        pl.onPick(function (q) { p = [Math.min(q[0], d1.ccMax), Math.min(q[1], d1.pkMax)]; sxl.set(p[0]); syl.set(p[1]); moves++; draw(); });
        var help = H("button", { type: "button", class: "lx-btn ghost small", text: "Show me the cheapest plan", hidden: true }, act);
        help.addEventListener("click", function () { p = best1.x.slice(); sxl.set(p[0]); syl.set(p[1]); draw(); });
        function draw() {
          var cost = d1.c[0] * p[0] + d1.c[1] * p[1], broken = d1.rows.filter(function (r) { return !holds(r, p); });
          pl.clear(); pl.region(d1.rows); d1.rows.forEach(function (r) { if (r.b !== 0) pl.rule(r, { label: r.key === "ccMax" ? null : fmtRule(r) }); });
          pl.iso(d1.c, cost, money(cost));
          pl.point(p, { cls: broken.length ? "bad" : "good", label: "(" + p[0] + ", " + p[1] + ")" });
          if (!broken.length && (bestSeen == null || cost < bestSeen)) bestSeen = cost;
          out.innerHTML = "Plan: x = " + p[0] + ", y = " + p[1] + " MW · cost <b>" + money(cost) + "</b> · " + (broken.length ? "breaks: <b>" + LX.esc(broken.map(function (r) { return fmtRule(r); }).join(", ")) + "</b>" : "<b>keeps every rule</b>") +
            (bestSeen != null ? " · cheapest allowed so far " + money(bestSeen) : "");
          if (moves >= 8) help.hidden = false;
          if (p[0] === best1.x[0] && p[1] === best1.x[1]) { api.done(); api.saw("The cheapest allowed plan sits at a corner: " + best1.x[0] + " MW from the combined-cycle plant, " + best1.x[1] + " MW from the peaker, " + money(best1.value) + ". Slide the cost line down: it leaves the region there last."); }
        }
        draw();
        textAlt(act, "Text version", ["Cost = " + d1.c[0] + "x + " + d1.c[1] + "y dollars. The allowed region is a triangle with corners " + region(d1.rows, d1.view).map(function (q) { return "(" + num(q[0]) + ", " + num(q[1]) + "), " + money(d1.c[0] * q[0] + d1.c[1] * q[1]); }).join("; ") + ".", "The cheapest corner is (" + best1.x.join(", ") + ")."]);
      }
    });

    // 6 why the sign matters
    steps.push({
      text: "One sign can wreck a model. Flip the cover rule to ≤ and read the “best” plan; then flip the ramp rule to ≥. One rule changes at a time: the other goes back.",
      build: function (act, api) {
        var ops = { cover: ">=", ramp: "<=" }, ORIG = { cover: ">=", ramp: "<=" }, tried = {}, segs = {};
        var ctl = H("div", { class: "b1-signs" }, act);
        [["cover", "x + y", d1.need], ["ramp", "x", d1.reach]].forEach(function (c) {
          var row = H("div", { class: "k4-ctl" }, ctl); H("span", { class: "k4-lab", text: c[1] }, row);
          segs[c[0]] = seg(row, ["≤", "=", "≥"], OPLIST.indexOf(ops[c[0]]), function (k) {
            ops[c[0]] = OPLIST[k]; tried[c[0] + OPLIST[k]] = 1;
            Object.keys(ORIG).forEach(function (o) { if (o !== c[0]) { ops[o] = ORIG[o]; segs[o].set(OPLIST.indexOf(ORIG[o])); } });
            draw();
          }, "Sign of the " + c[0] + " rule");
          H("span", { class: "k4-lab", text: String(c[2]) }, row);
        });
        var pl = planeFor(act, d1, "The dispatch rules with the signs you chose, and the best plan they give.");
        var out = H("div", { "aria-live": "polite" }, act);
        function draw() {
          var rows = d1.rows.map(function (r) { return ops[r.key] ? { a: r.a, op: ops[r.key], b: r.b, key: r.key } : r; });
          var o = optimum({ sense: "min", c: d1.c, rows: rows }, d1.view);
          pl.clear(); pl.region(rows); rows.forEach(function (r) { if (r.b !== 0 && r.key !== "ccMax") pl.rule(r, { label: fmtRule(r), cls: ops[r.key] ? "hot" : "on" }); });
          out.innerHTML = "";
          var bad = ops.cover !== ">=" && ops.cover !== "=" || ops.ramp === ">=", txt;
          if (o.status !== "optimal") txt = "The solver would report: " + o.status + ".";
          else {
            pl.point(o.x, { label: "best: (" + o.x[0] + ", " + o.x[1] + ")" });
            txt = "Best plan: x = " + o.x[0] + ", y = " + o.x[1] + " MW, " + money(o.value) + ". ";
            if (ops.cover === "<=") txt += "The cover rule now only caps output, so making nothing passes it: demand goes unmet.";
            else if (ops.ramp === ">=") txt += "Cheaper than the true " + money(best1.value) + ", but the plant cannot climb from " + d1.prevCC + " to " + o.x[0] + " MW in one hour.";
            else if (ops.cover === "=" && ops.ramp === "<=") txt += "With = the plans shrink to a segment of the line; extra output only costs money, so the best plan is the same.";
            else if (ops.ramp === "=") txt += "The ramp now forces exactly " + d1.reach + " MW; here that happens to be the best plan anyway.";
            else txt += "The story's model: the right signs.";
          }
          H("div", { class: "lx-saw" + (bad ? " no" : ""), html: LX.icon(bad ? "question" : "check") + "<div>" + LX.esc(txt) + "</div>" }, out);
          if (tried["cover<="] && tried["ramp>="]) {
            api.done(); var a = optimum({ sense: "min", c: d1.c, rows: d1.rows.map(function (r) { return r.key === "cover" ? { a: r.a, op: "<=", b: r.b } : r; }) }, d1.view);
            var b = optimum({ sense: "min", c: d1.c, rows: d1.rows.map(function (r) { return r.key === "ramp" ? { a: r.a, op: ">=", b: r.b } : r; }) }, d1.view);
            api.saw("With ≤ " + d1.need + " the best plan makes nothing and costs " + money(a.value) + "; with the ramp as ≥ " + d1.reach + " it costs " + money(b.value) + " by ignoring the ramp. Both look optimal to a solver, and both are wrong.");
          }
        }
        draw();
      }
    });

    // 7 one step left: planning
    steps.push({
      text: "A new story, mostly written for you: one rule is missing. Find the sentence the model ignores and write that rule.",
      build: function (act, api) {
        storyBox(act, planning);
        Builder(act, { story: planning, mode: "one", onSolved: function () {
          api.done(); api.saw("Right: S + W ≤ 115. The cheapest mix is " + bestP.x[0] + " MW of solar and " + bestP.x[1] + " MW of wind, $" + (bestP.value / 1000).toFixed(1) + " million a year. Solar is cheaper per GWh; wind gets more out of each MW of connection.");
        } });
      }
    });

    // 8 do it yourself: battery
    steps.push({
      text: "Your turn, from scratch: the battery story. Choose the goal, write the rules, and check. Hints come in three steps if you need them.",
      build: function (act, api) {
        storyBox(act, battery);
        Builder(act, { story: battery, mode: "all", onSolved: function (m) {
          diyModel = m; api.done(); api.saw("The best plan buys " + bestB.x[0] + " MWh and sells " + bestB.x[1] + " MWh: " + money(bestB.value) + ". The losses rule d ≤ 0.9c has a zero on the right once written as −0.9c + d ≤ 0.");
        } });
      }
    });

    // 9 the same model as A x <= b
    steps.push({
      text: "Solvers read a model as [[array|arrays]]: costs c, a table A and limits b, with every rule written as ≤. Flip the cover rule into that form, then tap a row.",
      build: function (act, api) {
        var flipped = false, sel = null, rows = d1.rows.filter(function (r) { return r.b !== 0; });
        var grid = H("div", { class: "b1-mx", role: "group", "aria-label": "The rows of A x ≤ b" }, act);
        var right = H("div", { class: "b1-mx-side" }, act);
        var pl = planeFor(right, d1, "The selected row of A x ≤ b as a line.");
        var code = H("pre", { class: "b1-code", "aria-label": "The same arrays in Python" }, act);
        var out = H("p", { class: "k4-test", "aria-live": "polite" }, act);
        function rowOf(r) { return r.key === "cover" && flipped ? { a: [-1, -1], op: "<=", b: -d1.need, key: "cover" } : r; }
        function draw() {
          grid.innerHTML = "";
          var hd = H("div", { class: "b1-mxr head" }, grid); ["Rule", "x", "y", "", "b"].forEach(function (t) { H("span", { text: t }, hd); });
          rows.forEach(function (r0) {
            var r = rowOf(r0), b = H("button", { type: "button", class: "b1-mxr" + (sel === r0.key ? " sel" : "") + (r.op !== "<=" ? " warn" : ""), "aria-pressed": sel === r0.key ? "true" : "false" }, grid);
            H("span", { class: "w", text: { cover: "cover", ramp: "ramp", ccMax: "size", pkMax: "peaker" }[r0.key] }, b);
            H("span", { text: num(r.a[0]) }, b); H("span", { text: num(r.a[1]) }, b); H("span", { class: "op", text: OPS[r.op] }, b); H("span", { text: num(r.b) }, b);
            b.addEventListener("click", function () { sel = r0.key; draw(); });
            if (r0.key === "cover" && !flipped) {
              var f = H("button", { type: "button", class: "lx-btn ghost small b1-flip", text: "Multiply by −1" }, grid);
              f.addEventListener("click", function () { flipped = true; sel = "cover"; draw(); f.remove(); });
            }
          });
          H("p", { class: "b1-mxnote", text: "c = (" + d1.c.join(", ") + ") · bounds: x ≥ 0, y ≥ 0" }, grid);
          pl.clear(); pl.region(d1.rows);
          rows.forEach(function (r0) { var r = rowOf(r0); pl.rule(r, { label: sel === r0.key ? fmtRule(r) : null, cls: sel === r0.key ? "hot" : "on" }); });
          var A = rows.map(rowOf), names = { cover: "cover " + d1.need + " MW", ramp: "ramp", ccMax: "combined-cycle size", pkMax: "peaker size" };
          code.innerHTML = "";
          var lines = ["from scipy.optimize import linprog", "c    = [" + d1.c.join(", ") + "]"].concat(A.map(function (r, i) {
            var ok = r.op === "<="; return (i ? "        " : "A_ub = [") + (ok ? "[" + r.a.map(function (v) { return (v < 0 ? "" : " ") + v; }).join(", ") + "]" : "[  ?,  ?]") + (i < A.length - 1 ? "," : "]") + "   # " + names[rows[i].key] + (ok ? "" : ": not ≤ yet");
          })).concat(["b_ub = [" + A.map(function (r) { return r.op === "<=" ? r.b : "?"; }).join(", ") + "]", "res  = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=[(0, None), (0, None)])"]);
          lines.forEach(function (l, i) { var sp = H("span", { class: "b1-cl" + (i >= 2 && i < 2 + A.length && rows[i - 2].key === sel ? " sel" : ""), text: l }, code); code.appendChild(document.createTextNode("\n")); return sp; });
          if (sel) { var r0 = rows.filter(function (r) { return r.key === sel; })[0], r = rowOf(r0); out.textContent = "Row “" + names[sel] + "”: " + fmtRule(r) + ". In words: " + r0.says + "."; }
          if (flipped) { api.done(); api.saw("Every rule is now a row of A x ≤ b: a ≥ rule enters with all its signs flipped. The bounds x, y ≥ 0 go in separately, and the costs c set the goal."); }
        }
        draw();
      }
    });

    // 10 the solver
    steps.push({
      text: "Hand the arrays to HiGHS, an open-source [[solver|solver]], running here in your browser. Does it agree with the corner you found by hand?",
      build: function (act, api) {
        if (LX.solver && LX.solver.preload) LX.solver.preload();
        var row = H("div", { class: "b1-acts" }, act);
        var b1 = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the dispatch model" }, row);
        var b2 = H("button", { type: "button", class: "lx-btn ghost small", text: "Solve your battery model" }, row);
        var stHost = H("div", null, act), status = LX.SolverStatus ? LX.SolverStatus(stHost) : null, out = H("div", { "aria-live": "polite" }, act);
        function toSolver(m, names) {
          return { sense: m.sense, variables: [{ name: names[0], cost: m.c[0] }, { name: names[1], cost: m.c[1] }],
                   constraints: m.rows.filter(function (r) { return !(r.op === ">=" && r.b === 0 && (r.a[0] === 0 || r.a[1] === 0)); })
                     .map(function (r, i) { var c = { name: "r" + (i + 1), terms: {} }; c.terms[names[0]] = r.a[0]; c.terms[names[1]] = r.a[1]; c[{ "<=": "le", ">=": "ge", "=": "eq" }[r.op]] = r.b; return c; }) };
        }
        function run(m, names, ref, label, story) {
          if (!LX.solver) { out.innerHTML = ""; H("p", { class: "lx-hint", text: "The solver could not load here; its answer would be the corner (" + ref.x.join(", ") + ")." }, out); api.done(); return; }
          if (status) status.set("solving");
          LX.solver.solve(toSolver(m, names), { timeLimit: 2, key: "b1" }).then(function (r) {
            if (status) status.set(r); out.innerHTML = "";
            if (!r.ok) { H("div", { class: "lx-saw no", html: LX.icon("question") + "<div>" + LX.esc("HiGHS says: " + r.status + ".") + "</div>" }, out); return; }
            var x = r.values[names[0]], y = r.values[names[1]], same = Math.abs(x - ref.x[0]) < 1e-6 && Math.abs(y - ref.x[1]) < 1e-6;
            H("div", { class: "lx-saw", html: LX.icon("check") + "<div><b>" + LX.esc(label) + ":</b> " + LX.esc(solverLine(story, names, x, y, r.objective) + (same ? ": the corner you found by hand." : ".")) + "</div>" }, out);
            if (label === "Dispatch") { api.done(); api.saw("HiGHS returns " + num(x) + " and " + num(y) + " MW, " + money(r.objective) + ": the same corner. Solvers do this for millions of decisions, where no graph can help."); }
          });
        }
        b1.addEventListener("click", function () { run(d1, ["x", "y"], best1, "Dispatch", d1); });
        b2.addEventListener("click", function () { run(diyModel || battery, ["c", "d"], bestB, diyModel ? "Your battery model" : "The battery model (yours is not finished yet)", battery); });
      }
    });

    var cards = LX.StepCards(live, { id: "b1-steps", steps: steps, onStep: function () { LX.emit("layout"); } }), PR = null;
    LX.demo(root, function (state) {   // core.js LX.demo: mid = the cheapest corner (step 5), diy = step 8 filled, mx = step 9 flipped
      // pr-<exercise key>: that practice exercise open, its hints shown and its answer checked; pr-<key>-open: just opened
      var m = /^pr-(\w+?)(-open)?$/.exec(state);
      if (m && PR) {
        var at = PR.find(m[1]); if (!at) return null;
        PR.go(at[0], at[1], false);
        if (!m[2]) { var c = PR.cur(); for (var h = 0; h < 3; h++) c.hint(); c.show(); }
        return { view: "practice " + m[1] };
      }
      var k = { mid: 4, diy: 7, mx: 8, signs: 5, ready: 0 }[state]; if (k == null) return null;
      cards.go(k);
      var btn = function (re) { return [].filter.call(live.querySelectorAll(".b1-acts button"), function (b) { return re.test(b.textContent); })[0]; };
      if (state === "diy") { for (var h = 0; h < 3; h++) { var hb = btn(/^Hint/); if (hb) hb.click(); } var sa = btn(/Show the answer/); if (sa) sa.click(); }
      if (state === "mx") { var f = live.querySelector(".b1-flip"); if (f) f.click(); var r = live.querySelectorAll(".b1-mxr:not(.head)")[1]; if (r) r.click(); }
      if (state === "signs") live.querySelectorAll(".b1-signs .lx-seg")[0].querySelector("button").click();
      return { view: "step " + (k + 1) };
    }, cards);
    explain(d1, planning, battery, best1, bestP, bestB);
    PR = practice(J, data);
  }

  function explain(d1, planning, battery, best1, bestP, bestB) {
    var x = document.getElementById("b1-explain"); if (!x) return; x.innerHTML = "";
    LX.CompareTable(H("div", { class: "lx-xcard w1h-stack" }, x), {
      title: "Formulate it: three stories, one recipe",
      columns: [{ key: "name", label: "Story", main: true }, { key: "dec", label: "Decisions" }, { key: "goal", label: "Goal", phoneHide: true }, { key: "rules", label: "Rules" }, { key: "best", label: "Best plan", phoneHide: true }],
      rows: [
        { key: "d", color: "var(--lx-cc)", name: "Dispatch", note: "fully worked", dec: "x, y in MW", goal: "min " + d1.c[0] + "x + " + d1.c[1] + "y", rules: "cover, ramp, sizes, x, y ≥ 0", best: "(" + best1.x.join(", ") + "), " + money(best1.value) },
        { key: "p", color: "var(--lx-solar)", name: "Planning", note: "one rule left", dec: "S, W in MW", goal: "min " + planning.c[0] + "S + " + planning.c[1] + "W", rules: "energy, connection, S, W ≥ 0", best: "(" + bestP.x.join(", ") + "), $" + (bestP.value / 1000).toFixed(1) + "M/yr" },
        { key: "b", color: "var(--lx-wind)", name: "Battery", note: "your own", dec: "c, d in MWh", goal: "max 120d − 30c", rules: "charging, storage, selling, losses, c, d ≥ 0", best: "(" + bestB.x.join(", ") + "), " + money(bestB.value) }]
    });
    LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "Every linear program, in one line",
      lede: "Tap a symbol: what it means, where it was in the dispatch story, and how code writes it.",
      rows: [{ parts: [{ html: "minimize " }, { k: "c", html: "<i>c</i><sup>T</sup>" }, { k: "x", html: "<i>x</i>" }, { html: " subject to " },
               { k: "A", html: "<i>A</i>" }, { k: "x", html: "<i>x</i>" }, { k: "le", html: " ≤ " }, { k: "b", html: "<i>b</i>" }, { html: ", " }, { k: "x0", html: "<i>x</i> ≥ 0" }] }],
      textLabel: "Text version of the equation",
      fields: [{ key: "story", label: "In the dispatch story", alt: "Dispatch story" }, { key: "code", label: "In code", code: true }],
      symbols: {
        c: { name: "c: the costs", words: "One number per decision: what one unit of it adds to the [[objective|goal]]. The small T (transpose) lays the column c on its side, so cᵀx means: multiply pairwise and add.", story: "c = (" + d1.c.join(", ") + ") dollars per MWh; cᵀx = " + d1.c[0] + "x + " + d1.c[1] + "y.", code: "c = [" + d1.c.join(", ") + "]" },
        x: { name: "x: the decisions", words: "The [[decision-variable|decision variables]], stacked in a column; the solver chooses them.", story: "x = (x, y): the two gas plants' output in MW.", code: "res.x  # the solver's answer" },
        A: { name: "A: the rule table", words: "One row per rule, one column per decision; each entry says how much a decision counts in that rule.", story: "Rows (−1, −1), (1, 0), (1, 0), (0, 1): cover, ramp, size, peaker.", code: "A_ub = [[-1, -1], [1, 0], [1, 0], [0, 1]]" },
        le: { name: "≤: one direction", words: "Every row reads “at most”. A ≥ rule is multiplied by −1 first; an = rule becomes two rows, or goes in separately.", story: "x + y ≥ " + d1.need + " entered as −x − y ≤ −" + d1.need + ".", code: "A_ub, b_ub  # ub: upper bound" },
        b: { name: "b: the limits", words: "The right-hand side of each row, in the row's own units.", story: "b = (−" + d1.need + ", " + d1.reach + ", " + d1.ccMax + ", " + d1.pkMax + ") MW.", code: "b_ub = [-" + d1.need + ", " + d1.reach + ", " + d1.ccMax + ", " + d1.pkMax + "]" },
        x0: { name: "x ≥ 0: the bounds", words: "The rule nobody says out loud; solvers usually take it as bounds on each decision.", story: "No plant makes negative power.", code: "bounds = [(0, None), (0, None)]" }
      }, sel: "A"
    });
  }

  // ================================================================ practice (Check section)
  // the faded-practice runner is LX.Practice (components/practice.js)
  var Practice = LX.Practice;

  // ---- exercise pieces
  function numIn(host, val, label, onIn, cls) {
    var i = H("input", { type: "text", inputmode: "decimal", autocomplete: "off", class: "b1-in " + (cls || ""), "aria-label": label,
      value: val != null && isFinite(val) ? num(val).replace("−", "-").replace(/,/g, "") : "" }, host);
    i.addEventListener("input", function () { var v = parseNum(i.value); i.classList.toggle("bad", i.value.trim() !== "" && isNaN(v)); if (onIn) onIn(v); });
    return i;
  }
  function valOf(i) { return i.value.trim() === "" ? NaN : parseNum(i.value); }
  function setVal(i, v) { i.value = num(v).replace("−", "-").replace(/,/g, ""); i.classList.remove("bad"); i.dispatchEvent(new Event("input")); }
  function modelList(host, st) {   // the model in symbols: the goal, then each rule (sign rules folded into one line)
    var sy = syms(st), ul = H("ul", { class: "lx-fp-model", "aria-label": "The model" }, host);
    H("li", { text: fmtGoal(st) }, ul);
    st.rows.forEach(function (r) { if (!isBound(r)) H("li", { text: fmtRule(r, sy) }, ul); });
    H("li", { text: sy[0] + ", " + sy[1] + " ≥ 0" }, ul);
  }
  // rule lines with their labels placed along each line where they keep furthest from the corners and from each other
  // (positions in view units scaled to 0..1; "at" runs from the line's top, or left, end as LX.LPPlane draws it)
  function ruleLines(pl, rows, view, label, cls, corners) {
    var W = view[1] - view[0], Hv = view[3] - view[2], nrm = function (p) { return [(p[0] - view[0]) / W, (p[1] - view[2]) / Hv]; };
    var taken = (corners || []).map(nrm);
    rows.forEach(function (r) {
      var l = label(r), sg = l ? LP.segment(r.a, r.b, view) : null;
      if (!sg) { pl.rule(r, { label: l, cls: cls }); return; }
      var A = sg[0], B = sg[1];
      if (A[1] < B[1] || (A[1] === B[1] && A[0] > B[0])) { var t0 = A; A = B; B = t0; }
      var best = 0.5, bd = -1, bp = null;
      [0.1, 0.25, 0.4, 0.55, 0.7, 0.85].forEach(function (f) {
        var q = nrm([A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1])]);
        var dmin = taken.reduce(function (m, u) { return Math.min(m, Math.hypot((q[0] - u[0]) / 3, q[1] - u[1])); }, 9);   // labels are wide: side by side counts as close
        if (dmin > bd + 1e-9) { bd = dmin; best = f; bp = q; }
      });
      taken.push(bp); pl.rule(r, { label: l, cls: cls, at: best });
    });
  }
  // corner labels: letters A, B, ...; a label that would sit on another (close above it) moves below its point
  var ABC = "ABCDEFGH";
  function cornerPlane(host, st, T, label) {   // the region, the rule lines that reach a corner, and the corners label(i) names
    var sy = syms(st), on = {}, pl = planeFor(host, st, "The allowed region of the model, with its corners.");
    T.forEach(function (r) { r.keys.forEach(function (k) { on[k] = 1; }); });
    pl.region(st.rows);
    ruleLines(pl, st.rows.filter(function (r) { return !isBound(r); }), st.view, function (r) { return on[r.key] ? fmtRule(r, sy) : null; }, null, T.map(function (r) { return r.x; }));
    var order = T.map(function (r, i) { return i; }).sort(function (a, b) { return T[b].x[1] - T[a].x[1]; }), placed = [];
    order.forEach(function (i) {
      var l = label ? label(i) : null; if (!l) return;
      var g = pl.point(T[i].x, { label: l.text, cls: l.cls }), X = pl.sx(T[i].x[0]), Y = pl.sy(T[i].x[1]);
      if (placed.some(function (q) { return Math.abs(q[0] - X) < 70 && Math.abs(q[1] - Y) < 20; }))
        [].forEach.call(g.childNodes, function (n) { if (n.tagName !== "circle") n.setAttribute("transform", "translate(0 30)"); });
      placed.push([X, Y]);
    });
    return pl;
  }
  function cornerRows(T, best) {
    return T.map(function (r, i) { return { cls: best && samePt(r.x, best) ? "best" : null, cells: [ABC[i] + " " + pt(r.x), r.on.map(function (n) { return n.replace(/ ([≥≤=]) /g, "\u00a0$1\u00a0"); }).join(" and "), money(r.value)] }; });
  }
  function cornerAlt(T) { return T.map(function (r, i) { return "Corner " + ABC[i] + ": " + pt(r.x) + ", on the lines " + r.on.join(" and ") + "."; }); }
  function tableEl(host, head, rows, cap, nums) {   // nums: the indices of the columns that hold numbers (monospace)
    var t = H("table", { class: "lx-fp-tab" }, H("div", { class: "lx-fp-tabw" }, host));
    if (cap) H("caption", { class: "lx-sr", text: cap }, t);
    var tr = H("tr", null, H("thead", null, t)); head.forEach(function (x) { H("th", { scope: "col", text: x }, tr); });
    var tb = H("tbody", null, t);
    rows.forEach(function (r) {
      var row = H("tr", { class: r.cls }, tb);
      r.cells.forEach(function (c, j) { var td = H("td", { class: (nums || [0, 2]).indexOf(j) >= 0 ? "n" : null }, row); if (c && c.nodeType) td.appendChild(c); else td.textContent = c; });
    });
    return t;
  }
  function choices(host, labels, q, onPick) {   // a question answered by tapping one of its choices
    var qid = LX.uid("fq"); H("p", { class: "lx-qtext", id: qid, text: q }, host);
    var row = H("div", { class: "lx-qbtns lx-fp-choices", role: "group", "aria-labelledby": qid }, host), bs = [], sel = null;
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: l }, row); bs.push(b);
      b.addEventListener("click", function () { sel = i; bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); x.classList.remove("right", "wrong"); }); onPick(i); });
    });
    return { val: function () { return sel; }, pick: function (i) { bs[i].click(); }, mark: function (ok) { if (sel != null) bs[sel].classList.add(ok ? "right" : "wrong"); } };
  }

  // A x <= b typed by the learner: c (min form), given rows (shown) and rows to write, drawn live on a plane
  function ArraysEx(host, st, o) {
    var sy = syms(st), box = H("div", { class: "b1-builder lx-fp-arr" }, host), c = [NaN, NaN], mine = [];
    var goal = H("div", { class: "b1-goal" }, box); H("span", { class: "b1-k", text: "Costs" }, goal); H("span", { class: "b1-fixed", text: "minimize" }, goal);
    var w = H("span", { class: "b1-lin" }, goal), ci = [];
    ci.push(numIn(w, null, "Cost of " + sy[0] + ", min form", function (v) { c[0] = v; draw(); })); H("span", { class: "b1-sym", text: sy[0] + " +" }, w);
    ci.push(numIn(w, null, "Cost of " + sy[1] + ", min form", function (v) { c[1] = v; draw(); })); H("span", { class: "b1-sym", text: sy[1] }, w);
    var list = H("div", { class: "b1-rows" }, box), tools = H("div", { class: "b1-tools" }, box);
    H("p", { class: "b1-mxnote", text: "Bounds " + sy[0] + " ≥ 0 and " + sy[1] + " ≥ 0 go in separately, as in step 9." }, box);
    var pl = planeFor(box, st, "The plans that pass your rows of A x ≤ b and the bounds."), altUl = liveAlt(box, "Text version");
    function blank() { return { a: [NaN, NaN], b: NaN }; }
    for (var k = 0; k < (o.blanks || 1); k++) mine.push(blank());
    function rows() { return (o.given || []).concat(mine); }
    function render() {
      list.innerHTML = "";
      (o.given || []).forEach(function (r, i) {
        var row = H("div", { class: "b1-row locked" }, list); H("span", { class: "b1-k", text: "Row " + (i + 1) }, row);
        H("span", { class: "b1-fixed", text: fmtRule({ a: r.a, op: "<=", b: r.b }, sy) }, row); H("span", { class: "b1-tag", text: "given" }, row);
      });
      mine.forEach(function (r, j) {
        var n = (o.given || []).length + j + 1, row = H("div", { class: "b1-row" }, list);
        H("span", { class: "b1-k", text: "Row " + n }, row); var lw = H("span", { class: "b1-lin" }, row);
        numIn(lw, r.a[0], "Row " + n + ": coefficient of " + sy[0], function (v) { r.a[0] = v; draw(); }); H("span", { class: "b1-sym", text: sy[0] + " +" }, lw);
        numIn(lw, r.a[1], "Row " + n + ": coefficient of " + sy[1], function (v) { r.a[1] = v; draw(); }); H("span", { class: "b1-sym", text: sy[1] }, lw);
        H("span", { class: "b1-sym", text: "≤" }, row);
        numIn(row, r.b, "Row " + n + ": limit b", function (v) { r.b = v; draw(); }, "rhs");
        if (o.add) { var del = H("button", { type: "button", class: "b1-del", "aria-label": "Remove row " + n, html: LX.icon("cross") }, row);
          del.addEventListener("click", function () { mine.splice(j, 1); render(); draw(); }); }
      });
    }
    if (o.add) {
      var add = H("button", { type: "button", class: "lx-btn ghost small", text: "Add a row" }, tools);
      add.addEventListener("click", function () { mine.push(blank()); render(); draw(); var ins = list.querySelectorAll("input"); if (ins.length) ins[ins.length - 3].focus(); });
    }
    function draw() {
      pl.clear();
      var all = rows().filter(function (r) { return isFinite(r.a[0]) && isFinite(r.a[1]) && isFinite(r.b); }).map(function (r) { return { a: r.a, op: "<=", b: r.b }; });
      var use = all.filter(function (r) { return r.a[0] || r.a[1]; }), rs = all.concat(bounds()), P = pl.region(rs);
      ruleLines(pl, use, st.view, function (r) { return fmtRule(r, sy); }, "on", P);
      setItems(altUl, describeModel({ rows: rs }, sy, st.view, "Your rows and the bounds: "));
    }
    render(); draw();
    return {
      value: function () { return { c: c.slice(), rows: mine.map(function (r) { return { a: r.a.slice(), b: r.b }; }) }; },
      fill: function (ans) { mine = ans.rows.map(function (r) { return { a: r.a.slice(), b: r.b }; }); render(); setVal(ci[0], ans.c[0]); setVal(ci[1], ans.c[1]); draw(); }
    };
  }

  // the eight exercises; PS = practiceSpecs(...)
  function practice(J, data) {
    var host = document.getElementById("b1-practice"); if (!host) return null; host.innerHTML = "";
    var P = J.practice, PS = practiceSpecs(J, data.town, data.town_year, data.cf_targets);
    var B = {
      heat: formulate, carbon: formulate,
      c14: function (area, api) {
        var s = PS.c14, st = s.st;
        storyBox(area, st); modelList(area, st);
        cornerPlane(area, st, s.table, function (i) { var b = samePt(s.table[i].x, s.best.x); return { text: ABC[i] + (b ? ", best" : ""), cls: b ? "good" : null }; });
        textAlt(area, "Text version", cornerAlt(s.table));
        tableEl(area, ["Corner", "On the lines", "Cost"], cornerRows(s.table, s.best.x), "The corners and their costs");
        H("p", { class: "lx-fp-worked", html: LX.icon("check") + "<span>" + LX.esc(s.worked) + "</span>" }, area);
        var ch = choices(area, s.alt.table.map(function (r, i) { return ABC[i] + " " + pt(r.x); }), s.q, function () { api.run(); });
        api.hints(s.hints); api.check(function () { var r = s.check(ch.val()); if (r) ch.mark(r.ok); return r; }, { button: false });
        api.answer(function () { ch.pick(s.alt.index); });
      },
      c18: function (area, api) {
        var s = PS.c18, st = s.st, ins = {};
        storyBox(area, st); modelList(area, st);
        cornerPlane(area, st, s.table, function (i) { return { text: ABC[i] + (i === s.hidden ? " ?" : "") }; });
        textAlt(area, "Text version", cornerAlt(s.table).map(function (t, i) { return i === s.hidden ? "Corner " + ABC[i] + ": where the cover line meets the ramp line (to find)." : t; }));
        H("p", { class: "lx-fp-ask", text: s.ask }, area);
        var rows = cornerRows(s.table, null), r = rows[s.hidden], cell = H("span", { class: "lx-fp-pt" }), cost = H("span", { class: "lx-fp-pt" });
        cell.appendChild(document.createTextNode(ABC[s.hidden] + " (")); ins.x = numIn(cell, null, "Corner " + ABC[s.hidden] + ": x", null, "sm"); cell.appendChild(document.createTextNode(","));
        ins.y = numIn(cell, null, "Corner " + ABC[s.hidden] + ": y", null, "sm"); cell.appendChild(document.createTextNode(")"));
        cost.appendChild(document.createTextNode("$")); ins.cost = numIn(cost, null, "Cost of the corner, dollars", null, "rhs");
        r.cells = [cell, r.cells[1], cost]; r.cls = "ask";
        tableEl(area, ["Corner", "On the lines", "Cost"], rows, "The corners and their costs; one is left to find");
        api.hints(s.hints);
        api.check(function () { return s.check({ x: valOf(ins.x), y: valOf(ins.y), cost: valOf(ins.cost) }); });
        api.answer(function () { var h = s.table[s.hidden]; setVal(ins.x, h.x[0]); setVal(ins.y, h.x[1]); setVal(ins.cost, h.value); });
      },
      imports: function (area, api) {
        var s = PS.imports, st = s.st, ins = {};
        storyBox(area, st, true); modelList(area, st);
        cornerPlane(area, st, s.table, null);
        textAlt(area, "Text version", st.rows.filter(function (r) { return !isBound(r); }).map(function (r) { return ruleWords(r, syms(st), st.view); })
          .concat(["The axes are x ≥ 0 and y ≥ 0. The shaded region holds the plans that pass every rule; its corners are yours to find."]));
        H("p", { class: "lx-fp-ask", text: s.ask }, area);
        var row = H("div", { class: "lx-fp-ans" }, area); H("span", { class: "b1-k", text: "Cheapest" }, row);
        var w = H("span", { class: "lx-fp-pt" }, row);
        w.appendChild(document.createTextNode("x =")); ins.x = numIn(w, null, "Cheapest corner: x, MWh"); w.appendChild(document.createTextNode("y =")); ins.y = numIn(w, null, "Cheapest corner: y, MWh");
        var w2 = H("span", { class: "lx-fp-pt" }, row); w2.appendChild(document.createTextNode("cost $")); ins.cost = numIn(w2, null, "Its cost, dollars", null, "rhs");
        api.hints(s.hints);
        api.check(function () { return s.check({ x: valOf(ins.x), y: valOf(ins.y), cost: valOf(ins.cost) }); });
        api.answer(function () { setVal(ins.x, s.best.x[0]); setVal(ins.y, s.best.x[1]); setVal(ins.cost, s.best.value); });
      },
      aplan: function (area, api) {
        var s = PS.aplan, st = s.st, A = s.arrays, sy = syms(st);
        H("p", { class: "lx-eyebrow", text: "The planning model of step 7" }, area); modelList(area, st);
        tableEl(area, ["Row", sy[0], sy[1], "", "b"], A.A.map(function (a, k) {
          return { cells: [String(k + 1), num(a[0]), num(a[1]), "≤", num(A.b[k])] };
        }), "The rows of A x ≤ b", [0, 1, 2, 3, 4]);
        var why = H("ul", { class: "lx-fp-why-rows" }, area);
        s.why.forEach(function (w, k) { H("li", { html: "<b>Row " + (k + 1) + "</b>: " + LX.esc(w) + "." }, why); });
        H("p", { class: "b1-mxnote", text: "c = (" + A.c.map(num).join(", ") + ") · bounds " + sy[0] + " ≥ 0, " + sy[1] + " ≥ 0" }, area);
        var code = H("pre", { class: "b1-code", "aria-label": "The same arrays in Python" }, area);
        code.textContent = ["c    = [" + A.c.join(", ") + "]", "A_ub = [" + A.A.map(function (a) { return "[" + a.join(", ") + "]"; }).join(", ") + "]",
          "b_ub = [" + A.b.join(", ") + "]", "res  = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=[(0, None), (0, None)])"].join("\n");
        var ch = choices(area, s.choices, s.q, function () { api.run(); });
        api.hints(s.hints); api.check(function () { var r = s.check(ch.val()); if (r) ch.mark(r.ok); return r; }, { button: false });
        api.answer(function () { ch.pick(s.answer); });
      },
      abat: function (area, api) {
        var s = PS.abat; storyBox(area, s.st); H("p", { class: "lx-fp-ask", text: s.ask }, area);
        var E = ArraysEx(area, s.st, { given: s.given, blanks: 1 });
        api.hints(s.hints); api.check(function () { return s.check(E.value()); }); api.answer(function () { E.fill(s.answer); });
      },
      abus: function (area, api) {
        var s = PS.abus; storyBox(area, s.st); H("p", { class: "lx-fp-ask", text: s.ask }, area);
        var E = ArraysEx(area, s.st, { blanks: 2, add: true });
        api.hints(s.hints); api.check(function () { return s.check(E.value()); }); api.answer(function () { E.fill(s.answer); });
      }
    };
    function formulate(area, api, key) {
      var st = withKey(J.stories[key], key); storyBox(area, st, true);
      Builder(area, { story: st, mode: "all", onSolved: function () { api.done(); } });
    }
    var tracks = P.tracks.map(function (t) {
      return { label: t.label, intro: t.intro, items: t.items.map(function (k) {
        var it = P.items[k];
        return { key: k, kind: it.kind, minutes: it.minutes, title: it.title || J.stories[it.story].title,
                 build: function (area, api) { B[k](area, api, k); } };
      }) };
    });
    return Practice(host, { id: "b1-practice", title: P.title, lede: P.lede, foot: P.foot, blank: J.practice.checks.blank, tracks: tracks });
  }

  LX.mount("b01", function (live, data, root) { view(live, data, root); });
})();
