// b01-algebra-to-lp.js — Bridge B1, "From algebra to a linear program: how do equations become a model?" (step cards,
// Learn W1, 2026-11-02).
//
// Ten cards: a ten-question readiness check that routes to the toolbox; a word problem tagged into decisions, goal,
// rules and givens; a fully worked translation; the rules on a plane; the cheapest corner; what a wrong sign does; a
// second story with one rule left to write; a third story built from scratch with staged hints; the same model as
// A x <= b with a linked view (words, rows, lines, code); and a real solver run (HiGHS in the browser, LX.solver).
// Faded worked examples: fully worked (dispatch), one step left (planning), do it yourself (battery); two more stories
// (heat, carbon cap) are practice in the Check section.
//
// Data: assets/learn/data/b01-algebra-to-lp.json (readiness items and stories), town.json and town_year.json (the
// dispatch story: 19:00 on 3 September 2025, cut and scaled exactly as lesson 0 does), cf_targets.json (energy per MW in
// the planning story), path.json (where the readiness check routes). Prices, costs and limits are illustrative.
//
// Pure model (exported for Node, no DOM): townDay, the two-variable rule algebra (le, holds, clip, region), optimum()
// (best corner by vertex enumeration, with infeasible, unbounded and tie detection), compare() (is a learner's model the
// story's model? same feasible region and the same goal direction, with per-rule diagnostics), dispatchStory(),
// planningStory(), toArrays() (A x <= b form), readiness scoring. The rule helpers and the plane are lesson-local copies
// shared with k04-linear-equations.js (promotion requested in the sidecar).
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

  // ---------------------------------------------------------------- two-variable linear rules
  function le(r) {
    if (r.op === "<=") return [{ a: [r.a[0], r.a[1]], b: r.b }];
    if (r.op === ">=") return [{ a: [-r.a[0], -r.a[1]], b: -r.b }];
    return [{ a: [r.a[0], r.a[1]], b: r.b }, { a: [-r.a[0], -r.a[1]], b: -r.b }];
  }
  function lhs(r, p) { return r.a[0] * p[0] + r.a[1] * p[1]; }
  function holds(r, p, tol) {
    var v = lhs(r, p), e = tol == null ? 1e-7 * (1 + Math.abs(r.b)) : tol;
    return r.op === "<=" ? v <= r.b + e : r.op === ">=" ? v >= r.b - e : Math.abs(v - r.b) <= e;
  }
  function dedupe(P) {
    var out = [];
    P.forEach(function (p) { var q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 1e-7) out.push(p); });
    if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) + Math.abs(out[0][1] - out[out.length - 1][1]) <= 1e-7) out.pop();
    return out;
  }
  function clip(poly, h) {
    var out = [], n = poly.length, eps = 1e-9 * (1 + Math.abs(h.b));
    var f = function (p) { return h.a[0] * p[0] + h.a[1] * p[1] - h.b; };
    for (var i = 0; i < n; i++) {
      var P = poly[i], Q = poly[(i + 1) % n], fp = f(P), fq = f(Q);
      if (fp <= eps) out.push(P);
      if ((fp < -eps && fq > eps) || (fp > eps && fq < -eps)) { var t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    return dedupe(out);
  }
  function region(rules, box) {
    var poly = [[box[0], box[2]], [box[1], box[2]], [box[1], box[3]], [box[0], box[3]]];
    for (var i = 0; i < rules.length && poly.length; i++) le(rules[i]).forEach(function (h) { if (poly.length) poly = clip(poly, h); });
    return poly;
  }
  function bigBox(view) { var sx = view[1] - view[0], sy = view[3] - view[2]; return [view[0] - 20 * sx, view[1] + 20 * sx, view[2] - 20 * sy, view[3] + 20 * sy]; }
  function r6(v) { return Math.round(v * 1e6) / 1e6 + 0; }

  // best corner of max/min c·p over the rules: "optimal" (with ties), "infeasible" or "unbounded"
  function optimum(m, view) {
    var big = bigBox(view), P = region(m.rows, big);
    if (!P.length) return { status: "infeasible" };
    var sg = m.sense === "max" ? -1 : 1, best = Infinity, arg = [], scale = 1;
    P.forEach(function (p) { scale = Math.max(scale, Math.abs(m.c[0] * p[0]) + Math.abs(m.c[1] * p[1])); });
    P.forEach(function (p) {
      var v = sg * (m.c[0] * p[0] + m.c[1] * p[1]), e = 1e-9 * scale;
      if (v < best - e) { best = v; arg = [p]; } else if (Math.abs(v - best) <= e) arg.push(p);
    });
    var span = Math.max(big[1] - big[0], big[3] - big[2]) * 1e-9;
    var far = arg.some(function (p) { return p[0] <= big[0] + span || p[0] >= big[1] - span || p[1] <= big[2] + span || p[1] >= big[3] - span; });
    if (far) return { status: "unbounded" };
    var x = arg.map(function (p) { return [r6(p[0]), r6(p[1])]; });
    return { status: "optimal", x: x[0], ties: x, value: r6(sg * best) };
  }

  // is a learner's model {sense, c, rows} the story's model? Feasible regions are compared inside a large box, with a
  // tolerance of 0.5% of the view, so 0.333h <= 10 counts as h/3 <= 10; the goal must point the same way.
  function compare(ref, mine, view) {
    var big = bigBox(view), span = Math.max(view[1] - view[0], view[3] - view[2]), tol = 0.005 * span;
    var t = function (r) { return tol * (Math.abs(r.a[0]) + Math.abs(r.a[1])); };
    var bad = (mine.rows || []).filter(function (r) { return !r || !r.a || !isFinite(r.a[0]) || !isFinite(r.a[1]) || !isFinite(r.b) || (!r.a[0] && !r.a[1]); });
    var rows = (mine.rows || []).filter(function (r) { return bad.indexOf(r) < 0; });
    var pr = region(ref.rows, big), pm = region(rows, big);
    var missing = ref.rows.filter(function (r) { return pm.some(function (p) { return !holds(r, p, t(r)); }); });
    var cuts = rows.filter(function (r) { return pr.some(function (p) { return !holds(r, p, t(r)); }); });
    var v = ref.c.map(function (x) { return ref.sense === "max" ? -x : x; }), w = (mine.c || [NaN, NaN]).map(function (x) { return mine.sense === "max" ? -x : x; });
    var nv = Math.hypot(v[0], v[1]), nw = Math.hypot(w[0], w[1]), cross = v[0] * w[1] - v[1] * w[0], dot = v[0] * w[0] + v[1] * w[1];
    var objOK = isFinite(nw) && nw > 0 && Math.abs(cross) <= 0.01 * nv * nw && dot > 0;
    var obj = { ok: objOK, factor: objOK ? nw / nv : null, reversed: isFinite(nw) && nw > 0 && Math.abs(cross) <= 0.01 * nv * nw && dot < 0 };
    return { ok: objOK && !missing.length && !cuts.length && !bad.length, missing: missing, cuts: cuts, empty: bad, obj: obj, infeasible: !pm.length };
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
  var HOUR = 19, PREV_CC = 90;
  function dispatchStory(town, year) {
    var D = townDay(town, year), f = D.fleet, t = HOUR, need = D.need[t], reach = Math.min(f.cc.mw, PREV_CC + f.cc.ramp);
    return {
      key: "dispatch", D: D, t: t, need: need, reach: reach, prevCC: PREV_CC, ramp: f.cc.ramp, ccMax: f.cc.mw, pkMax: f.peaker.mw,
      demand: D.demand[t], wind: D.wind[t], solar: D.solar[t], nuclear: f.nuclear.mw, costCC: f.cc.cost, costPK: f.peaker.cost,
      vars: [{ sym: "x", name: "combined-cycle output", unit: "MW" }, { sym: "y", name: "peaker output", unit: "MW" }],
      sense: "min", c: [f.cc.cost, f.peaker.cost], goalUnit: "$",
      rows: [
        { a: [1, 1], op: ">=", b: need, key: "cover", says: "the gas plants must cover at least " + need + " MW" },
        { a: [1, 0], op: "<=", b: reach, key: "ramp", says: "the combined-cycle plant made " + PREV_CC + " MW at 18:00 and can change by at most " + f.cc.ramp + " MW an hour" },
        { a: [1, 0], op: "<=", b: f.cc.mw, key: "ccMax", says: "the combined-cycle plant makes at most " + f.cc.mw + " MW" },
        { a: [0, 1], op: "<=", b: f.peaker.mw, key: "pkMax", says: "the peaker makes at most " + f.peaker.mw + " MW" },
        { a: [1, 0], op: ">=", b: 0, key: "x0", says: "no negative output" },
        { a: [0, 1], op: ">=", b: 0, key: "y0", says: "no negative output" }],
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

  var model = { townDay: townDay, le: le, lhs: lhs, holds: holds, clip: clip, region: region, optimum: optimum, compare: compare,
                toArrays: toArrays, dispatchStory: dispatchStory, planningStory: planningStory, withKey: withKey, readiness: readiness,
                HOUR: HOUR, PREV_CC: PREV_CC };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, S = LX.S;
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
  function parseNum(s) {
    s = String(s == null ? "" : s).trim().replace(/[−–]/g, "-").replace(/,/g, "").replace(/\s+/g, "");
    if (s === "" || s === "+") return 0; if (s === "-") return -1;
    var m = /^([+-]?\d*\.?\d+)\/(\d*\.?\d+)$/.exec(s); if (m) return parseFloat(m[1]) / parseFloat(m[2]);
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
  }

  // ---- the rule plane (lesson-local copy of K4's)
  function Plane(host, o) {
    var W = 440, Hh = 380, m = { l: 58, r: 14, t: 12, b: 56 }, box = o.view;
    var wrap = H("div", { class: "w1h-plane" }, host);
    var svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": o.aria || "A plane of plans" }, wrap);
    var sx = function (x) { return m.l + (x - box[0]) / (box[1] - box[0]) * (W - m.l - m.r); };
    var sy = function (y) { return Hh - m.b - (y - box[2]) / (box[3] - box[2]) * (Hh - m.t - m.b); };
    var gGrid = S("g", null, svg);
    (o.ticks || []).forEach(function (v, i) {
      var lab = (o.ticks.length > 6 && i % 2) ? null : v;
      if (v >= box[0] && v <= box[1]) { S("line", { x1: sx(v), x2: sx(v), y1: sy(box[2]), y2: sy(box[3]), class: "w1h-grid" }, gGrid); if (lab != null) S("text", { x: sx(v), y: Hh - m.b + 22, "text-anchor": "middle", class: "w1h-tick" }, gGrid).textContent = v; }
      if (v >= box[2] && v <= box[3]) { S("line", { x1: sx(box[0]), x2: sx(box[1]), y1: sy(v), y2: sy(v), class: "w1h-grid" }, gGrid); if (lab != null || box[3] - box[2] < 0.75 * (box[1] - box[0])) S("text", { x: m.l - 8, y: sy(v) + 4, "text-anchor": "end", class: "w1h-tick" }, gGrid).textContent = v; }
    });
    S("line", { x1: sx(box[0]), x2: sx(box[1]), y1: sy(box[2]), y2: sy(box[2]), class: "w1h-axis" }, gGrid);
    S("line", { x1: sx(box[0]), x2: sx(box[0]), y1: sy(box[2]), y2: sy(box[3]), class: "w1h-axis" }, gGrid);
    S("text", { x: (sx(box[0]) + sx(box[1])) / 2, y: Hh - 10, "text-anchor": "middle", class: "w1h-axlab" }, gGrid).textContent = o.xl;
    var ym = (sy(box[2]) + sy(box[3])) / 2;
    S("text", { x: 16, y: ym, "text-anchor": "middle", class: "w1h-axlab", transform: "rotate(-90 16 " + ym + ")" }, gGrid).textContent = o.yl;
    var gReg = S("g", null, svg), gRule = S("g", null, svg), gIso = S("g", null, svg), gPt = S("g", null, svg);
    function path(P) { return P.length ? "M" + P.map(function (p) { return sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1); }).join(" L") + " Z" : ""; }
    function segment(r) {
      var pts = [], a = r.a, b = r.b;
      if (Math.abs(a[1]) > 1e-12) [box[0], box[1]].forEach(function (x) { var y = (b - a[0] * x) / a[1]; if (y >= box[2] - 1e-9 && y <= box[3] + 1e-9) pts.push([x, y]); });
      if (Math.abs(a[0]) > 1e-12) [box[2], box[3]].forEach(function (y) { var x = (b - a[1] * y) / a[0]; if (x >= box[0] - 1e-9 && x <= box[1] + 1e-9) pts.push([x, y]); });
      if (pts.length < 2) return null;
      var best = [pts[0], pts[1]], d = -1;
      pts.forEach(function (p) { pts.forEach(function (q) { var dd = (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]); if (dd > d) { d = dd; best = [p, q]; } }); });
      return best;
    }
    return {
      svg: svg, box: box,
      clear: function () { [gReg, gRule, gIso, gPt].forEach(function (g) { g.innerHTML = ""; }); },
      region: function (rules, cls) { var P = region(rules, box); if (P.length > 2) S("path", { d: path(P), class: cls || "w1h-region" }, gReg); else if (P.length === 2) S("path", { d: path(P), class: "w1h-region-line" }, gReg); return P; },
      rule: function (r, opt) {
        opt = opt || {}; if (!r || !r.a || (!r.a[0] && !r.a[1])) return; var sg = segment(r); if (!sg) return;
        var g = S("g", { class: "w1h-rule" + (opt.cls ? " " + opt.cls : "") }, gRule);
        var A = [sx(sg[0][0]), sy(sg[0][1])], B = [sx(sg[1][0]), sy(sg[1][1])];
        S("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1] }, g);
        if (opt.label) {
          if (A[1] > B[1] || (A[1] === B[1] && A[0] > B[0])) { var T = A; A = B; B = T; }
          var diag = Math.abs(A[0] - B[0]) > 1 && Math.abs(A[1] - B[1]) > 1, f = opt.at != null ? opt.at : diag ? 0.5 : 0.1;
          var kx = (W - m.l - m.r) / (box[1] - box[0]), ky = (Hh - m.t - m.b) / (box[3] - box[2]);
          var n = [r.a[0] / kx, -r.a[1] / ky], len = Math.sqrt(n[0] * n[0] + n[1] * n[1]) || 1, sgn = r.op === ">=" ? -1 : 1;
          n = [sgn * n[0] / len, sgn * n[1] / len];
          var px = A[0] + f * (B[0] - A[0]) + 10 * n[0], py = A[1] + f * (B[1] - A[1]) + 10 * n[1];
          var anchor = n[0] > 0.3 ? "start" : n[0] < -0.3 ? "end" : "middle";
          if (n[1] > 0.3) py += 12; else if (Math.abs(n[1]) <= 0.3) py += 5;
          if (anchor === "middle") px = Math.min(Math.max(px, m.l + 60), W - m.r - 60);
          py = Math.min(Math.max(py, m.t + 14), Hh - m.b - 6);
          if (anchor === "start") px = Math.min(px, W - m.r - 90); if (anchor === "end") px = Math.max(px, m.l + 90);
          S("text", { x: px, y: py, "text-anchor": anchor, class: "w1h-rlab bg" }, g).textContent = opt.label;
          S("text", { x: px, y: py, "text-anchor": anchor, class: "w1h-rlab" }, g).textContent = opt.label;
        }
        return g;
      },
      iso: function (c, v, label) {
        var sg = segment({ a: c, b: v }); if (!sg) return;
        S("line", { x1: sx(sg[0][0]), y1: sy(sg[0][1]), x2: sx(sg[1][0]), y2: sy(sg[1][1]), class: "w1h-iso" }, gIso);
        if (label) { var lo = sg[0][1] <= sg[1][1] ? sg[0] : sg[1], X = sx(lo[0]), end = X > W - 160;
          S("text", { x: end ? X - 6 : X + 6, y: sy(lo[1]) - 6, class: "w1h-isolab bg", "text-anchor": end ? "end" : "start" }, gIso).textContent = label;
          S("text", { x: end ? X - 6 : X + 6, y: sy(lo[1]) - 6, class: "w1h-isolab", "text-anchor": end ? "end" : "start" }, gIso).textContent = label; }
      },
      point: function (p, opt) {
        opt = opt || {};
        var g = S("g", { class: "w1h-pt" + (opt.cls ? " " + opt.cls : "") }, gPt);
        S("circle", { cx: sx(p[0]), cy: sy(p[1]), r: opt.r || 7 }, g);
        if (opt.label) { var right = sx(p[0]) < W - 130, up = sy(p[1]) > m.t + 30, X = sx(p[0]) + (right ? 11 : -11), Y = up ? sy(p[1]) - 10 : sy(p[1]) + 22;
          S("text", { x: X, y: Y, "text-anchor": right ? "start" : "end", class: "w1h-plab bg" }, g).textContent = opt.label;
          S("text", { x: X, y: Y, "text-anchor": right ? "start" : "end", class: "w1h-plab" }, g).textContent = opt.label; }
        return g;
      },
      onPick: function (fn, step) {
        var down = false;
        function at(ev) {
          var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
          var q = pt.matrixTransform(svg.getScreenCTM().inverse());
          var x = box[0] + (q.x - m.l) / (W - m.l - m.r) * (box[1] - box[0]), y = box[2] + (Hh - m.b - q.y) / (Hh - m.t - m.b) * (box[3] - box[2]);
          var s = step || 5; fn([LX.clamp(Math.round(x / s) * s, box[0], box[1]), LX.clamp(Math.round(y / s) * s, box[2], box[3])]);
        }
        svg.style.touchAction = "none"; svg.classList.add("pickable");
        svg.addEventListener("pointerdown", function (ev) { down = true; try { svg.setPointerCapture(ev.pointerId); } catch (e) {} at(ev); });
        svg.addEventListener("pointermove", function (ev) { if (down) at(ev); });
        svg.addEventListener("pointerup", function () { down = false; });
        svg.addEventListener("pointercancel", function () { down = false; });
      }
    };
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
  function textAlt(host, title, items) {
    var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title }, d);
    var ul = H("ul", null, d); items.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    return d;
  }
  function storyBox(host, st) {
    var b = H("div", { class: "b1-story" }, host);
    H("p", { class: "lx-eyebrow", text: st.title }, b);
    H("p", { text: st.text.join(" ") }, b);
    return b;
  }
  function planeFor(host, st, aria) {
    var v = st.vars;
    return Plane(host, { view: st.view, ticks: st.ticks, xl: v[0].sym + ": " + v[0].name + ", " + v[0].unit, yl: v[1].sym + ": " + v[1].name + ", " + v[1].unit, aria: aria });
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
      var usable = m.rows.filter(function (r) { return r.a[0] || r.a[1]; });
      if (usable.length) pl.region(usable);
      usable.forEach(function (r) { pl.rule(r, { label: r.b === 0 && (!r.a[0] || !r.a[1]) ? null : fmtRule(r, sy), cls: "on" }); });
      if (m.sense && (m.c[0] || m.c[1]) && usable.length) {
        var opt = optimum({ sense: m.sense, c: m.c, rows: usable }, st.view);
        if (opt.status === "optimal") pl.point(opt.x, { label: "best: (" + num(opt.x[0]) + ", " + num(opt.x[1]) + ")" });
      }
    }
    function report(res) {
      out.innerHTML = "";
      if (res.ok) {
        var opt = optimum(st, st.view), v = opt.value;
        solved = true; box.classList.add("is-solved");
        var gtxt = st.goalUnit === "$k a year" ? "$" + (v / 1000).toFixed(1) + " million a year" : st.goalUnit.charAt(0) === "$" ? money(v) + st.goalUnit.slice(1) : num(v) + " " + st.goalUnit;
        H("div", { class: "lx-saw", html: LX.icon("check") + "<div><b>Your model matches the story.</b> " + LX.esc("Best plan: " + sy[0] + " = " + num(opt.x[0]) + " " + st.vars[0].unit + ", " + sy[1] + " = " + num(opt.x[1]) + " " + st.vars[1].unit + "; goal " + gtxt + ".") +
          (res.obj.factor && Math.abs(res.obj.factor - 1) > 0.01 ? " " + LX.esc("(Your goal is the story's times " + num(res.obj.factor) + ": the same best plan, a scaled value.)") : "") + "</div>" }, out);
        if (o.onSolved) o.onSolved(clean(), opt);
        return;
      }
      var msgs = [];
      if (o.mode === "all" && !mine.sense) msgs.push("Choose min or max for the goal.");
      else if (!res.obj.ok) msgs.push(res.obj.reversed ? "Your goal points the wrong way: it would chase the worst plan. Check min or max, or the signs." : "Your goal weighs " + sy[0] + " and " + sy[1] + " differently from the story. Check its two numbers.");
      res.missing.forEach(function (r) { msgs.push("Your model lets through plans that break this sentence: “" + r.says + "”."); });
      res.cuts.forEach(function (r) { msgs.push("Your rule " + fmtRule(r, sy) + " rules out plans the story allows. Check its sign, numbers or right-hand side."); });
      if (res.empty.length) msgs.push("A rule is empty or unreadable: fill in its numbers or remove it.");
      var box2 = H("div", { class: "lx-saw no", html: LX.icon("question") + "<div><b>Not yet.</b></div>" }, out), ul = H("ul", { class: "b1-msgs" }, box2.lastChild);
      msgs.slice(0, 4).forEach(function (t) { H("li", { text: t }, ul); });
    }
    check.addEventListener("click", function () {
      var m = clean(); m.rows = m.rows.filter(function (r) { return r.a[0] || r.a[1]; });
      if (o.mode === "all" && !mine.sense) m.sense = "min";
      report(compare(st, m, st.view));
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
        if (!x.ok) { var t = H("span", null, li); t.appendChild(document.createTextNode(G.advice + " ")); H("a", { href: href(G.route), text: "Go there" }, t); }
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

  // ---- equation card (explain layer): an equation whose symbols link to words, the dispatch story and code
  function EquationCard(host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var eq = H("p", { class: "b1-eqline", role: "group", "aria-label": "Symbols of the equation; select one" }, host), det = H("div", { class: "lx-cdetail", "aria-live": "polite" }, host), btns = {};
    o.tokens.forEach(function (tk) {
      if (!tk.key) { H("span", { class: "b1-eqtxt", html: tk.html }, eq); return; }
      var b = H("button", { type: "button", class: "b1-eqtok", "aria-pressed": "false", html: tk.html }, eq);
      b.addEventListener("click", function () { pick(tk.key); });
      btns[tk.key] = (btns[tk.key] || []).concat([b]);
    });
    function pick(key) {
      Object.keys(btns).forEach(function (k) { btns[k].forEach(function (b) { b.setAttribute("aria-pressed", k === key ? "true" : "false"); }); });
      var d = o.defs[key]; det.innerHTML = "";
      H("h4", { text: d.name }, det); H("p", { html: LX.rich(d.words) }, det);
      if (d.story) { var s1 = H("div", { class: "ingame" }, det); H("b", { text: "In the dispatch story" }, s1); H("span", { text: d.story }, s1); }
      if (d.code) { var s2 = H("div", { class: "ingame" }, det); H("b", { text: "In code" }, s2); H("code", { text: d.code }, s2); }
    }
    pick(o.sel || o.tokens.filter(function (t) { return t.key; })[0].key);
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version of the equation" }, alt);
    var ul = H("ul", null, alt); Object.keys(o.defs).forEach(function (k) { var d = o.defs[k]; H("li", { text: d.name + ": " + d.words.replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1") + (d.story ? " Dispatch story: " + d.story : "") }, ul); });
    return { pick: pick };
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
      ["can change by at most " + d1.ramp + " MW an hour", 2], ["can make at most " + d1.pkMax + " MW", 2]];
    var CATS = ["Decision", "Goal", "Rule", "Given"];
    steps.push({
      text: "A model starts as a story. Tag each phrase: a [[decision-variable|decision]] you choose, the [[objective|goal]], a [[constraint|rule]] you must keep, or a given number.",
      build: function (act, api) {
        var st = H("div", { class: "b1-story" }, act);
        H("p", { class: "lx-eyebrow", text: d1.title }, st);
        H("p", { text: "After nuclear, wind and solar, the gas plants " + PH[0][0] + ". The operator chooses " + PH[1][0] + " and " + PH[2][0] + ", " + PH[3][0] + ". The combined-cycle plant " + PH[4][0] + "; it " + PH[5][0] + " and " + PH[6][0] + ". The peaker costs $" + d1.costPK + " per MWh and " + PH[7][0] + "." }, st);
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
      ["Rule: ramp", d1.prevCC + " MW last hour, at most " + d1.ramp + " MW more", "x ≤ " + d1.prevCC + " + " + d1.ramp + " = " + d1.reach, "MW"],
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
          if (k >= LINES.length) { btn.hidden = true; api.done(); api.saw("That is the whole model: two decisions, one goal, five rules. Every line's units match, a first check that the translation is right."); }
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
        var out = H("p", { class: "k4-test", "aria-live": "polite" }, act);
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
          return P;
        }
        draw();
        textAlt(act, "Text version", ["Rules: " + d1.rows.map(function (r) { return fmtRule(r); }).join(", ") + ".", "Together they leave a triangle with corners " + region(d1.rows, d1.view).map(function (p) { return "(" + num(p[0]) + ", " + num(p[1]) + ")"; }).join(", ") + "."]);
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
      text: "One sign can wreck a model. Flip the cover rule to ≤, then the ramp rule to ≥, and read what the “best” plan becomes.",
      build: function (act, api) {
        var ops = { cover: ">=", ramp: "<=" }, tried = {};
        var ctl = H("div", { class: "b1-signs" }, act);
        [["cover", "x + y", d1.need], ["ramp", "x", d1.reach]].forEach(function (c) {
          var row = H("div", { class: "k4-ctl" }, ctl); H("span", { class: "k4-lab", text: c[1] }, row);
          seg(row, ["≤", "=", "≥"], OPLIST.indexOf(ops[c[0]]), function (k) { ops[c[0]] = OPLIST[k]; tried[c[0] + OPLIST[k]] = 1; draw(); }, "Sign of the " + c[0] + " rule");
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
      text: "Solvers read a model as arrays: costs c, a table A and limits b, with every rule written as ≤. Flip the cover rule into that form, then tap any row.",
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
        function run(m, names, ref, label) {
          if (!LX.solver) { out.innerHTML = ""; H("p", { class: "lx-hint", text: "The solver could not load here; its answer would be the corner (" + ref.x.join(", ") + ")." }, out); api.done(); return; }
          if (status) status.set("solving");
          LX.solver.solve(toSolver(m, names), { timeLimit: 2, key: "b1" }).then(function (r) {
            if (status) status.set(r); out.innerHTML = "";
            if (!r.ok) { H("div", { class: "lx-saw no", html: LX.icon("question") + "<div>" + LX.esc("HiGHS says: " + r.status + ".") + "</div>" }, out); return; }
            var x = r.values[names[0]], y = r.values[names[1]], same = Math.abs(x - ref.x[0]) < 1e-6 && Math.abs(y - ref.x[1]) < 1e-6;
            H("div", { class: "lx-saw", html: LX.icon("check") + "<div><b>" + LX.esc(label) + ":</b> " + LX.esc(names[0] + " = " + num(x) + ", " + names[1] + " = " + num(y) + ", goal " + money(r.objective) + (same ? ": the corner you found by hand." : ".")) + "</div>" }, out);
            if (label === "Dispatch") { api.done(); api.saw("HiGHS returns " + num(x) + " and " + num(y) + " MW, " + money(r.objective) + ": the same corner. Solvers do this for millions of decisions, where no graph can help."); }
          });
        }
        b1.addEventListener("click", function () { run(d1, ["x", "y"], best1, "Dispatch"); });
        b2.addEventListener("click", function () { run(diyModel || battery, ["c", "d"], bestB, diyModel ? "Your battery model" : "The battery model (yours is not finished yet)"); });
      }
    });

    var cards = LX.StepCards(live, { id: "b1-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    root.lxDemo = function (state) {   // screenshots: mid = the cheapest corner (step 5), diy = step 8 filled, mx = step 9 flipped
      var k = { mid: 4, diy: 7, mx: 8, signs: 5, ready: 0 }[state]; if (k == null) k = 4;
      cards.go(k);
      var btn = function (re) { return [].filter.call(live.querySelectorAll(".b1-acts button"), function (b) { return re.test(b.textContent); })[0]; };
      if (state === "diy") { for (var h = 0; h < 3; h++) { var hb = btn(/^Hint/); if (hb) hb.click(); } var sa = btn(/Show the answer/); if (sa) sa.click(); }
      if (state === "mx") { var f = live.querySelector(".b1-flip"); if (f) f.click(); var r = live.querySelectorAll(".b1-mxr:not(.head)")[1]; if (r) r.click(); }
      if (state === "signs") live.querySelectorAll(".b1-signs .lx-seg")[0].querySelector("button").click();
      return { view: "step " + (k + 1) };
    };
    explain(d1, planning, battery, best1, bestP, bestB);
    practice(J);
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
    EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "Every linear program, in one line",
      lede: "Tap a symbol: what it means, where it was in the dispatch story, and how code writes it.",
      tokens: [{ html: "minimize " }, { key: "c", html: "<i>c</i><sup>T</sup>" }, { key: "x", html: "<i>x</i>" }, { html: " subject to " },
               { key: "A", html: "<i>A</i>" }, { key: "x", html: "<i>x</i>" }, { key: "le", html: " ≤ " }, { key: "b", html: "<i>b</i>" }, { html: ", " }, { key: "x0", html: "<i>x</i> ≥ 0" }],
      defs: {
        c: { name: "c: the costs", words: "One number per decision: what one unit of it adds to the [[objective|goal]]. cᵀx multiplies pairwise and adds.", story: "c = (" + d1.c.join(", ") + ") dollars per MWh; cᵀx = " + d1.c[0] + "x + " + d1.c[1] + "y.", code: "c = [" + d1.c.join(", ") + "]" },
        x: { name: "x: the decisions", words: "The [[decision-variable|decision variables]], stacked in a column; the solver chooses them.", story: "x = (x, y): the two gas plants' output in MW.", code: "res.x  # the solver's answer" },
        A: { name: "A: the rule table", words: "One row per rule, one column per decision; each entry says how much a decision counts in that rule.", story: "Rows (−1, −1), (1, 0), (1, 0), (0, 1): cover, ramp, size, peaker.", code: "A_ub = [[-1, -1], [1, 0], [1, 0], [0, 1]]" },
        le: { name: "≤: one direction", words: "Every row reads “at most”. A ≥ rule is multiplied by −1 first; an = rule becomes two rows, or goes in separately.", story: "x + y ≥ " + d1.need + " entered as −x − y ≤ −" + d1.need + ".", code: "A_ub, b_ub  # ub: upper bound" },
        b: { name: "b: the limits", words: "The right-hand side of each row, in the row's own units.", story: "b = (−" + d1.need + ", " + d1.reach + ", " + d1.ccMax + ", " + d1.pkMax + ") MW.", code: "b_ub = [-" + d1.need + ", " + d1.reach + ", " + d1.ccMax + ", " + d1.pkMax + "]" },
        x0: { name: "x ≥ 0: the bounds", words: "The rule nobody says out loud; solvers usually take it as bounds on each decision.", story: "No plant makes negative power.", code: "bounds = [(0, None), (0, None)]" }
      }, sel: "A"
    });
  }

  // ---- practice: two more stories with the builder (Check section)
  function practice(J) {
    var host = document.getElementById("b1-practice"); if (!host) return; host.innerHTML = "";
    var card = H("div", { class: "lx-card b1-practice" }, host);
    var hd = H("div", { class: "lx-x-head" }, card); H("h3", { text: "Practice: two more stories" }, hd);
    H("p", { class: "lx-hint", text: "The same recipe, from scratch, with three staged hints each. About ten minutes per story." }, card);
    var keys = ["heat", "carbon"], cur = null, area = H("div", null, card);
    var sg = seg(hd, ["Campus heat", "Carbon cap"], 0, function (i) { open(keys[i]); }, "Choose a practice story");
    function open(k) { cur = k; area.innerHTML = ""; var st = withKey(J.stories[k], k); storyBox(area, st); Builder(area, { story: st, mode: "all" }); }
    open(keys[0]); sg.set(0);
  }

  LX.mount("b01", function (live, data, root) { view(live, data, root); });
})();
