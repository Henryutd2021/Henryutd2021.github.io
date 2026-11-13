/* lpplane.js — LX.LPPlane: the plane of a two-variable linear program (each rule a line plus a side, the region of plans
   that pass every rule, the cost line, the best corners or tied edge, an unbounded arrow, a simplex walk and a plan dot),
   and LX.lp2, the pure rule algebra behind it. Used by B1, K4, lesson 10 and lesson 11.

   A rule is {a: [a1, a2], op: "<=" | ">=" | "=", b, id (or key)}: a1·x + a2·y (op) b. A view (the data box) is
   [x0, x1, y0, y1] or {x: [x0, x1], y: [y0, y1]}.

   LX.lp2 (pure, no DOM; Node: require("assets/learn/components/lpplane.js") returns the same object)
     box(view)              -> [x0, x1, y0, y1]
     le(rule)               the rule as half-planes {a, b}, each meaning a·p <= b (two for "=")
     lhs(rule, p)           a·p for a plan p = [x, y];  holds(rule, p, tol): does p pass? (default tol 1e-7 × (1 + |b|))
     clip(poly, h)          Sutherland–Hodgman: the part of a convex polygon with h.a·p <= h.b
     region(rules, view)    the plans inside the view that pass every rule: a convex polygon [[x, y], ...] (empty: [])
     segment(a, b, view)    the part of the line a·p = b inside the view: [[x, y], [x, y]], left (then lower) end first; or null
     verticesOf(poly)       the polygon's corners rounded to one decimal
     bigBox(view)           the view grown by 20 view-widths on every side
     optimum(m[, view])     m = {sense: "min" | "max", c: [c1, c2], rows: [rules]}: the best plan, decided exactly for any rules a
                            learner writes, with or without a corner (B1's builder); no drawing box is used, so a best plan on
                            an open edge is not called unbounded and one far outside the view is still found (the view is
                            accepted and ignored). -> {status: "optimal", x: [x, y], ties: [the best corners], value, tied
                            (other plans tie with x: an edge, a ray or, with no corner, a whole line)} (rounded to 1e-6) |
                            {status: "infeasible"} | {status: "unbounded"}
     feasible(rows)         whether any plan passes every rule, decided exactly (no box)
     halfplanes(rows)       every rule as {id, a, b} with a·p <= b
     corners(rows)          the exact corners (pairwise line crossings that pass every rule), in order around the region:
                            [{x, y, on: [ids of the rules whose line runs through it]}]
     rays(rows[, c])        the directions (unit vectors) along which the region goes on for ever: the axes, both ways along
                            each rule's line and, given the goal c in min form, straight against it (-c); enough to tell
                            whether the goal improves for ever
     solve(m)               the exact outcome, by vertex enumeration and the region's rays: {status: "optimal" (one best
                            corner) | "tied" (a whole edge, or a ray, of equally good plans) | "infeasible" (no plan passes) |
                            "unbounded" (the goal improves for ever along a ray), corners, best (the best corners), x, y (the
                            first best corner), value (c·p there), ray (the unbounded or tied direction, else null),
                            binding: {id: true when that rule's line runs through the best corner}}. A region that is not
                            empty must have a corner (always true with x >= 0 and y >= 0); otherwise use optimum().
     simplexWalk(m)         the simplex method, drawn: start at the worst corner, step to the better neighboring corner along
                            an edge while one is better: [{x, y, value, on, along (the id of the rule whose edge was walked)}]

   LX.LPPlane(host, o) -> plane
     o.view                 the data box
     o.xLabel, o.yLabel     axis titles
     o.fluid                false (default): a 440 × 380 drawing that scales with its box, at most 520 px wide (B1, K4); grid
                            lines at o.ticks (with more than six, every other x value is labeled), centered axis titles.
                            true: drawn at the box's own width (taller on phones), redrawn on resize, grid lines every
                            o.grid units (default 40), titles at the axis ends (lessons 10 and 11).
     o.aria                 the drawing's spoken label when there is no o.describe
     o.describe(state)      one paragraph: the drawing's spoken label and a "Text version of the chart" below it (render())
     o.styles               {ruleId: {color, dash, label, short (on phones), place: "start" (below the left end, default) |
                            "top" (beside the upper end) | "end" (above the right end) | "foot" (left of the lower right end),
                            drag: true}}: how render() draws each rule. A rule without a style shapes the region and draws no line.
     o.onDrag(id, value)    a rule with drag: true, or the cost line ("cost"), dragged by pointer: value = a·p (c·p) at the pointer
     o.onDot(x, y, byKey)   the plan dot dragged, or moved by the arrow keys (o.dotStep per press, default 5)
     o.dotLabel(dot), o.dotValue(dot)   the dot's spoken label and value
     o.levelLabel(level)    the cost line's label (default "Cost $1,234")
   Drawing primitives (both drawings; B1 and K4 draw with these, and they stay until clear()):
     plane.clear()
     plane.region(rules, mod)        shade the plans that pass every rule (mod "ghost" or "pick"); returns the polygon
     plane.outside(rule)             hatch the side a rule rules out
     plane.rule(rule, {label, cls: "on" | "hot", at: 0..1})   the rule's line; its label sits on the side the rule rules out
     plane.iso(c, value, label)      the dashed line of plans with the same cost c·p = value
     plane.point([x, y], {label, cls: "good" | "bad" | "trail", r})
     plane.onPick(fn([x, y]), step)  a tap or drag on the plane, snapped to step (default 5)
     plane.sx(x), plane.sy(y), plane.svg, plane.box
   A whole scene (lessons 10 and 11; a fluid plane redraws it on resize):
     plane.render({rows, c: [c1, c2], sol (lp2.solve), showBest (default true), level (draw the cost line c·p = level),
                   dot: {x, y} (filled when it passes every row), hi (a rule id, drawn thick), walk (lp2.simplexWalk), walkAt})
     plane.focusDot()                focus the dot at the next render
   Keyboard: the plan dot is a focusable slider (arrow keys). Rule lines and the cost line are dragged by pointer; each lesson
   also gives a slider for the same number. Text version: o.describe (render), or the lesson's own list (primitives).
   Colors from --lx-* tokens only, so day and night need no redraw. */
(function () {
  "use strict";

  // ================================================================ the pure rule algebra
  function box(v) { return Array.isArray(v) ? v : [v.x[0], v.x[1], v.y[0], v.y[1]]; }
  function idOf(r, i) { return r.id != null ? r.id : r.key != null ? r.key : i; }
  function dot(a, v) { return a[0] * v[0] + a[1] * v[1]; }
  // "+ 0" turns −0 into 0, so no "−0" can reach the page
  function le(r) {
    if (r.op === "<=") return [{ a: [r.a[0], r.a[1]], b: r.b }];
    if (r.op === ">=") return [{ a: [-r.a[0] + 0, -r.a[1] + 0], b: -r.b + 0 }];
    return [{ a: [r.a[0], r.a[1]], b: r.b }, { a: [-r.a[0] + 0, -r.a[1] + 0], b: -r.b + 0 }];
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
  function region(rules, view) {
    var bx = box(view), poly = [[bx[0], bx[2]], [bx[1], bx[2]], [bx[1], bx[3]], [bx[0], bx[3]]];
    for (var i = 0; i < rules.length && poly.length; i++) le(rules[i]).forEach(function (h) { if (poly.length) poly = clip(poly, h); });
    return poly;
  }
  function segment(a, b, view) {
    var bx = box(view), pts = [];
    function add(x, y) {
      if (x >= bx[0] - 1e-9 && x <= bx[1] + 1e-9 && y >= bx[2] - 1e-9 && y <= bx[3] + 1e-9 &&
          !pts.some(function (q) { return Math.abs(q[0] - x) < 1e-6 && Math.abs(q[1] - y) < 1e-6; })) pts.push([x, y]);
    }
    if (Math.abs(a[1]) > 1e-12) [bx[0], bx[1]].forEach(function (x) { add(x, (b - a[0] * x) / a[1]); });
    if (Math.abs(a[0]) > 1e-12) [bx[2], bx[3]].forEach(function (y) { add((b - a[1] * y) / a[0], y); });
    if (pts.length < 2) return null;
    pts.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    return [pts[0], pts[pts.length - 1]];
  }
  function round1(v) { return Math.round(v * 10) / 10; }
  function verticesOf(poly) { return poly.map(function (p) { return [round1(p[0]) + 0, round1(p[1]) + 0]; }); }
  function bigBox(view) { var v = box(view), sx = v[1] - v[0], sy = v[3] - v[2]; return [v[0] - 20 * sx, v[1] + 20 * sx, v[2] - 20 * sy, v[3] + 20 * sy]; }
  function r6(v) { return Math.round(v * 1e6) / 1e6 + 0; }

  // ---- exact: corners, rays and the four outcomes
  var EPS = 1e-7;
  function halfplanes(rows) {
    var hs = [];
    rows.forEach(function (r, i) { le(r).forEach(function (h) { hs.push({ id: idOf(r, i), a: h.a, b: h.b }); }); });
    return hs;
  }
  // the half-planes with unit normals (a rule with no decision in it keeps a = [0, 0]): the corners, rays and
  // feasibility below then give the same answer however a rule is scaled (x >= 1 and 0.0000001x >= 0.0000001 alike)
  function units(rows) {
    return halfplanes(rows).map(function (h) { var n = Math.hypot(h.a[0], h.a[1]); return n > 0 ? { id: h.id, a: [h.a[0] / n + 0, h.a[1] / n + 0], b: h.b / n + 0 } : h; });
  }
  // a goal as a unit vector (null for a zero goal), for direction tests that do not depend on the goal's scale
  function unit(c) { var n = Math.hypot(c[0], c[1]); return n > 0 ? [c[0] / n, c[1] / n] : null; }
  function inside(hs, v) { return hs.every(function (h) { return dot(h.a, v) <= h.b + EPS * (1 + Math.abs(h.b)); }); }
  function active(hs, v) {
    var on = [];
    hs.forEach(function (h) { if (Math.abs(dot(h.a, v) - h.b) <= EPS * (1 + Math.abs(h.b)) && on.indexOf(h.id) < 0) on.push(h.id); });
    return on;
  }
  function corners(rows) {
    var raw = halfplanes(rows), hs = units(rows), vs = [];   // decisions on the unit half-planes; crossings from the rules as written (no rounding noise)
    for (var i = 0; i < hs.length; i++) for (var j = i + 1; j < hs.length; j++) {
      var ua = hs[i].a, ub = hs[j].a;
      if (Math.abs(ua[0] * ub[1] - ua[1] * ub[0]) < 1e-12) continue;
      var a = raw[i].a, b = raw[j].a, det = a[0] * b[1] - a[1] * b[0];
      var v = [(raw[i].b * b[1] - a[1] * raw[j].b) / det, (a[0] * raw[j].b - raw[i].b * b[0]) / det];
      if (!inside(hs, v)) continue;
      if (vs.some(function (u) { return Math.abs(u[0] - v[0]) < 1e-6 && Math.abs(u[1] - v[1]) < 1e-6; })) continue;
      vs.push(v);
    }
    if (vs.length > 2) {
      var cx = 0, cy = 0; vs.forEach(function (v) { cx += v[0]; cy += v[1]; }); cx /= vs.length; cy /= vs.length;
      vs.sort(function (u, v) { return Math.atan2(u[1] - cy, u[0] - cx) - Math.atan2(v[1] - cy, v[0] - cx); });
    }
    return vs.map(function (v) { return { x: v[0], y: v[1], on: active(hs, v) }; });
  }
  // The directions along which the region goes on for ever: the directions r with a·r <= 0 for every rule. Tried: the
  // axes, both ways along every rule's line, and, when the goal c (in min form) is given, straight against it (-c). A
  // region that runs on for ever in a direction that improves the goal always does so along one of these: along an
  // edge of the region's cone of directions, or straight against the goal when that cone is a half-plane or the whole
  // plane (minimize x with only x <= 1).
  function rays(rows, c) {
    var hs = units(rows), cand = [[1, 0], [0, 1], [-1, 0], [0, -1]], cu = c ? unit(c) : null;
    hs.forEach(function (h) { if (h.a[0] || h.a[1]) cand.push([h.a[1], -h.a[0] + 0], [-h.a[1] + 0, h.a[0]]); });
    if (cu) cand.push([-cu[0] + 0, -cu[1] + 0]);
    var out = [];
    cand.forEach(function (r) {
      if (!hs.every(function (h) { return dot(h.a, r) <= 1e-12; })) return;
      if (!out.some(function (q) { return Math.abs(q[0] - r[0]) < 1e-12 && Math.abs(q[1] - r[1]) < 1e-12; })) out.push(r);
    });
    return out;
  }
  // whether any plan passes the rules, decided exactly, with no drawing box (x >= 10000 lies far outside any drawing).
  // Rules whose lines are not all parallel: a region that is not empty has a corner. Rules that are all parallel (or
  // none): one number n·p must fit between their lower and upper limits. A rule with no decision in it (0 <= -1) is
  // simply true or false.
  function feasible(rows) {
    var hs = [], never = false;
    units(rows || []).forEach(function (h) { if (h.a[0] || h.a[1]) hs.push(h); else if (h.b < -1e-9) never = true; });
    if (never) return false;
    if (!hs.length) return true;
    var n = hs[0].a;
    if (hs.some(function (h) { return Math.abs(n[0] * h.a[1] - n[1] * h.a[0]) >= 1e-12; })) return corners(rows).length > 0;   // as corners() tells parallel lines
    var lim = parallelLimits(hs, n);
    return lim.lo <= lim.hi + EPS * (1 + Math.abs(lim.hi));
  }
  // unit half-planes all parallel to the unit normal n: the range [lo, hi] of n·p they allow
  function parallelLimits(hs, n) {
    var lo = -Infinity, hi = Infinity;
    hs.forEach(function (h) { var k = h.a[0] * n[0] + h.a[1] * n[1]; if (k > 0) hi = Math.min(hi, h.b / k); else if (k < 0) lo = Math.max(lo, h.b / k); });
    return { lo: lo, hi: hi };
  }
  // the best plan of max/min c·p for any rules, decided exactly (B1's builder: rules a learner writes, with or without a
  // corner). Unbounded only when a direction the region runs along for ever improves the goal (rays(rows, c)), so an
  // open region with a finite best (minimize x with x, y >= 0) is not called unbounded, and a best plan far outside the
  // drawing is still found. The view is not needed (older callers pass one).
  function optimum(m) {
    var rows = m.rows || [], sg = m.sense === "max" ? -1 : 1, c = [sg * m.c[0], sg * m.c[1]], cu = unit(c);
    if (!feasible(rows)) return { status: "infeasible" };
    var rs = rays(rows, c);   // directions tested with the unit goal: a tiny but nonzero goal still counts
    if (cu && rs.some(function (r) { return dot(cu, r) < -1e-9; })) return { status: "unbounded" };
    var flat = !cu || rs.some(function (r) { return Math.abs(dot(cu, r)) <= 1e-9; }), vs = corners(rows);
    if (vs.length) {
      var u = cu || [0, 0], cost = function (v) { return u[0] * v.x + u[1] * v.y; }, span = 1;
      vs.forEach(function (v) { span = Math.max(span, Math.abs(v.x), Math.abs(v.y)); });
      var lo = Math.min.apply(null, vs.map(cost)), tol = 1e-9 * span;
      var best = vs.filter(function (v) { return cost(v) <= lo + tol; }), x = best.map(function (v) { return [r6(v.x), r6(v.y)]; });
      return { status: "optimal", x: x[0], ties: x, value: r6(m.c[0] * best[0].x + m.c[1] * best[0].y), tied: x.length > 1 || flat };
    }
    // no corner, yet bounded: the rules are all parallel to a unit normal n and the goal points along n (or is zero),
    // so a whole line of plans ties for best; x is its plan nearest the origin
    var hs = units(rows).filter(function (h) { return h.a[0] || h.a[1]; });
    var n = hs.length ? hs[0].a : (cu || [1, 0]), lim = parallelLimits(hs, n);
    var k = cu ? cu[0] * n[0] + cu[1] * n[1] : 0, t = k > 1e-9 ? lim.lo : k < -1e-9 ? lim.hi : Math.max(lim.lo, Math.min(lim.hi, 0));
    if (!isFinite(t)) return { status: "unbounded" };   // cannot happen after the ray test; kept so no plan is ever non-finite
    var p = [r6(t * n[0]), r6(t * n[1])];
    return { status: "optimal", x: p, ties: [p], value: r6(sg * (c[0] * p[0] + c[1] * p[1])), tied: true };
  }
  function solve(m) {
    var sg = m.sense === "max" ? -1 : 1, c = [sg * m.c[0], sg * m.c[1]], vs = corners(m.rows);
    var res = { status: "infeasible", corners: vs, best: [], x: null, y: null, value: null, ray: null, binding: {} };
    if (!vs.length) return res;
    var cu = unit(c) || [0, 0], rs = rays(m.rows, c), down = rs.filter(function (r) { return dot(cu, r) < -1e-9; });
    if (down.length) { res.status = "unbounded"; res.ray = down[0]; return res; }
    var cost = function (v) { return c[0] * v.x + c[1] * v.y; };
    var lo = Math.min.apply(null, vs.map(cost)), tol = 1e-7 * (1 + Math.abs(lo));
    res.best = vs.filter(function (v) { return cost(v) <= lo + tol; });
    var flat = rs.filter(function (r) { return Math.abs(dot(cu, r)) <= 1e-9; });
    res.status = res.best.length > 1 || flat.length ? "tied" : "optimal";
    if (flat.length) res.ray = flat[0];
    var b = res.best[0];
    res.x = b.x; res.y = b.y; res.value = sg * lo;
    m.rows.forEach(function (r, i) { var id = idOf(r, i); res.binding[id] = b.on.indexOf(id) >= 0; });
    return res;
  }
  function simplexWalk(m) {
    var vs = corners(m.rows), n = vs.length; if (n < 2) return [];
    var sg = m.sense === "max" ? -1 : 1, val = vs.map(function (v) { return m.c[0] * v.x + m.c[1] * v.y; }), cost = val.map(function (v) { return sg * v; });
    var i = cost.indexOf(Math.max.apply(null, cost)), path = [i];
    for (var k = 0; k < n; k++) {
      var nb = [(i + n - 1) % n, (i + 1) % n].filter(function (j) { return vs[i].on.some(function (r) { return vs[j].on.indexOf(r) >= 0; }); });
      var j = nb.sort(function (a, b) { return cost[a] - cost[b]; })[0];
      if (j === undefined || cost[j] >= cost[i] - 1e-9) break;
      i = j; path.push(i);
    }
    return path.map(function (k, s) {
      var prev = s ? vs[path[s - 1]] : null, edge = prev ? vs[k].on.filter(function (r) { return prev.on.indexOf(r) >= 0; })[0] : null;
      return { x: vs[k].x, y: vs[k].y, value: val[k], on: vs[k].on, along: edge };
    });
  }

  var lp2 = { box: box, le: le, lhs: lhs, holds: holds, clip: clip, region: region, segment: segment, verticesOf: verticesOf, bigBox: bigBox,
              optimum: optimum, feasible: feasible, halfplanes: halfplanes, corners: corners, rays: rays, solve: solve, simplexWalk: simplexWalk };
  if (typeof module !== "undefined" && module.exports) module.exports = lp2;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ the plane
  var LX = window.LX, H = LX.H, S = LX.S;
  LX.lp2 = lp2;
  LX.LPPlane = function (host, o) {
    var fluid = !!o.fluid, bx = box(o.view);
    var wrap = H("div", { class: "lx-plane" + (fluid ? " fluid" : "") }, host);
    var svg = S("svg", { role: "img", "aria-label": o.aria || "A plane of plans" }, wrap);
    var altBody = null;
    if (o.describe) { var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version of the chart" }, alt); altBody = H("div", null, alt); }
    var d = {}, defs = null, pid = null, last = null, drag = null, focusDot = false;
    function size() {
      var W, Hh, m;
      if (fluid) { W = Math.max(280, wrap.clientWidth || 600); Hh = Math.round(W < 480 ? W * 0.78 : Math.min(420, W * 0.6)); m = { l: 44, r: 12, t: 26, b: 40 }; }
      else { W = 440; Hh = 380; m = { l: 58, r: 14, t: 12, b: 56 }; }
      var iw = W - m.l - m.r, ih = Hh - m.t - m.b;
      d = { W: W, H: Hh, m: m, iw: iw, ih: ih,
        sx: function (x) { return m.l + (x - bx[0]) / (bx[1] - bx[0]) * iw; },
        sy: function (y) { return Hh - m.b - (y - bx[2]) / (bx[3] - bx[2]) * ih; },
        ix: function (px) { return bx[0] + (px - m.l) / iw * (bx[1] - bx[0]); },
        iy: function (py) { return bx[2] + (Hh - m.b - py) / ih * (bx[3] - bx[2]); } };
      svg.setAttribute("viewBox", "0 0 " + W + " " + Hh);
      if (fluid) { svg.setAttribute("width", W); svg.setAttribute("height", Hh); }
    }
    var sx = function (x) { return d.sx(x); }, sy = function (y) { return d.sy(y); };
    var gGrid = S("g", null, svg), gOut = S("g", null, svg), gReg = S("g", null, svg), gRule = S("g", null, svg), gIso = S("g", null, svg), gPt = S("g", null, svg);
    function axes() {
      gGrid.innerHTML = "";
      var m = d.m, W = d.W, Hh = d.H;
      if (fluid) {
        var step = o.grid || 40;
        for (var x = bx[0]; x <= bx[1] + 1e-9; x += step) {
          S("line", { x1: sx(x), x2: sx(x), y1: sy(bx[2]), y2: sy(bx[3]), stroke: "var(--lx-line)", "stroke-width": 1 }, gGrid);
          S("text", { x: sx(x), y: Hh - 24, "text-anchor": "middle", "font-size": 11, fill: "var(--lx-ink-3)" }, gGrid).textContent = x;
        }
        for (var y = bx[2]; y <= bx[3] + 1e-9; y += step) {
          S("line", { x1: sx(bx[0]), x2: sx(bx[1]), y1: sy(y), y2: sy(y), stroke: "var(--lx-line)", "stroke-width": 1 }, gGrid);
          S("text", { x: m.l - 6, y: sy(y) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--lx-ink-3)" }, gGrid).textContent = y;
        }
        S("text", { x: sx(bx[1]), y: Hh - 6, "text-anchor": "end", class: "lbl", fill: "var(--lx-ink-2)" }, gGrid).textContent = o.xLabel || "";
        S("text", { x: m.l - 4, y: m.t - 12, class: "lbl", fill: "var(--lx-ink-2)" }, gGrid).textContent = o.yLabel || "";
        return;
      }
      var tk = o.ticks || [];
      tk.forEach(function (v, i) {
        var lab = (tk.length > 6 && i % 2) ? null : v;
        if (v >= bx[0] && v <= bx[1]) {
          S("line", { x1: sx(v), x2: sx(v), y1: sy(bx[2]), y2: sy(bx[3]), class: "lx-lp-grid" }, gGrid);
          if (lab != null) S("text", { x: sx(v), y: Hh - m.b + 22, "text-anchor": "middle", class: "lx-lp-tick" }, gGrid).textContent = v;
        }
        if (v >= bx[2] && v <= bx[3]) {
          S("line", { x1: sx(bx[0]), x2: sx(bx[1]), y1: sy(v), y2: sy(v), class: "lx-lp-grid" }, gGrid);
          if (lab != null || bx[3] - bx[2] < 0.75 * (bx[1] - bx[0])) S("text", { x: m.l - 8, y: sy(v) + 4, "text-anchor": "end", class: "lx-lp-tick" }, gGrid).textContent = v;
        }
      });
      S("line", { x1: sx(bx[0]), x2: sx(bx[1]), y1: sy(bx[2]), y2: sy(bx[2]), class: "lx-lp-axis" }, gGrid);
      S("line", { x1: sx(bx[0]), x2: sx(bx[0]), y1: sy(bx[2]), y2: sy(bx[3]), class: "lx-lp-axis" }, gGrid);
      S("text", { x: (sx(bx[0]) + sx(bx[1])) / 2, y: Hh - 10, "text-anchor": "middle", class: "lx-lp-axlab" }, gGrid).textContent = o.xLabel || "";
      var ym = (sy(bx[2]) + sy(bx[3])) / 2;
      S("text", { x: 16, y: ym, "text-anchor": "middle", class: "lx-lp-axlab", transform: "rotate(-90 16 " + ym + ")" }, gGrid).textContent = o.yLabel || "";
    }
    function path(P) { return P.length ? "M" + P.map(function (p) { return sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1); }).join(" L") + " Z" : ""; }
    function clear() { [gOut, gReg, gRule, gIso, gPt].forEach(function (g) { g.innerHTML = ""; }); }
    function bg(par, at, text) {   // a label with a halo in the surface color, so it reads over lines
      var a = {}; for (var k in at) a[k] = at[k];
      a.class = at.class + " bg"; S("text", a, par).textContent = text;
      S("text", at, par).textContent = text;
    }

    // ---- drawing primitives
    var api = {
      svg: svg, box: bx, sx: sx, sy: sy, clear: clear,
      region: function (rules, mod) {
        var P = region(rules, bx);
        if (P.length > 2) S("path", { d: path(P), class: "lx-lp-region" + (mod ? " " + mod : "") }, gReg);
        else if (P.length === 2) S("path", { d: path(P), class: "lx-lp-region-line" }, gReg);
        return P;
      },
      outside: function (r) {
        if (!defs) {
          defs = S("defs", null, svg); svg.insertBefore(defs, svg.firstChild); pid = LX.uid("lx-hatch");
          var pat = S("pattern", { id: pid, width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
          S("line", { x1: 0, y1: 0, x2: 0, y2: 8, class: "lx-lp-hatch" }, pat);
        }
        le(r).forEach(function (h) { var P = region([{ a: [-h.a[0], -h.a[1]], op: "<=", b: -h.b }], bx); if (P.length > 2) S("path", { d: path(P), fill: "url(#" + pid + ")", class: "lx-lp-out" }, gOut); });
      },
      rule: function (r, opt) {
        opt = opt || {}; if (!r || !r.a || (!r.a[0] && !r.a[1])) return; var sg = segment(r.a, r.b, bx); if (!sg) return;
        var g = S("g", { class: "lx-lp-rule" + (opt.cls ? " " + opt.cls : "") }, gRule), W = d.W, Hh = d.H, m = d.m;
        var A = [sx(sg[0][0]), sy(sg[0][1])], B = [sx(sg[1][0]), sy(sg[1][1])];
        S("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1] }, g);
        if (opt.label) {   // on the side the rule rules out, so the region stays clean
          if (A[1] > B[1] || (A[1] === B[1] && A[0] > B[0])) { var T = A; A = B; B = T; }   // A = the top (or left) end
          var diag = Math.abs(A[0] - B[0]) > 1 && Math.abs(A[1] - B[1]) > 1, f = opt.at != null ? opt.at : diag ? 0.5 : 0.1;
          var kx = d.iw / (bx[1] - bx[0]), ky = d.ih / (bx[3] - bx[2]);
          var n = [r.a[0] / kx, -r.a[1] / ky], len = Math.sqrt(n[0] * n[0] + n[1] * n[1]) || 1, sgn = r.op === ">=" ? -1 : 1;
          n = [sgn * n[0] / len, sgn * n[1] / len];
          var px = A[0] + f * (B[0] - A[0]) + 10 * n[0], py = A[1] + f * (B[1] - A[1]) + 10 * n[1];
          var anchor = n[0] > 0.3 ? "start" : n[0] < -0.3 ? "end" : "middle";
          if (n[1] > 0.3) py += 12; else if (Math.abs(n[1]) <= 0.3) py += 5;
          if (anchor === "middle") px = Math.min(Math.max(px, m.l + 60), W - m.r - 60);
          py = Math.min(Math.max(py, m.t + 14), Hh - m.b - 6);
          if (anchor === "start") px = Math.min(px, W - m.r - 90);
          if (anchor === "end") px = Math.max(px, m.l + 90);
          bg(g, { x: px, y: py, "text-anchor": anchor, class: "lx-lp-rlab" }, opt.label);
        }
        return g;
      },
      iso: function (c, v, label) {
        var sg = segment(c, v, bx); if (!sg) return;
        S("line", { x1: sx(sg[0][0]), y1: sy(sg[0][1]), x2: sx(sg[1][0]), y2: sy(sg[1][1]), class: "lx-lp-iso" }, gIso);
        if (label) {
          var lo = sg[0][1] <= sg[1][1] ? sg[0] : sg[1], X = sx(lo[0]), end = X > d.W - 160;
          bg(gIso, { x: end ? X - 6 : X + 6, y: sy(lo[1]) - 6, class: "lx-lp-isolab", "text-anchor": end ? "end" : "start" }, label);
        }
      },
      point: function (p, opt) {
        opt = opt || {};
        var g = S("g", { class: "lx-lp-pt" + (opt.cls ? " " + opt.cls : "") }, gPt);
        S("circle", { cx: sx(p[0]), cy: sy(p[1]), r: opt.r || 7 }, g);
        if (opt.label) {   // right of the point unless near the right edge; above it unless near the top
          var right = sx(p[0]) < d.W - 130, up = sy(p[1]) > d.m.t + 24, X = sx(p[0]) + (right ? 11 : -11), Y = up ? sy(p[1]) - 10 : sy(p[1]) + 22;
          bg(g, { x: X, y: Y, "text-anchor": right ? "start" : "end", class: "lx-lp-plab" }, opt.label);
        }
        return g;
      },
      onPick: function (fn, step) {
        var down = false;
        function at(ev) {
          var q = toData(ev), s = step || 5;
          fn([LX.clamp(Math.round(q[0] / s) * s, bx[0], bx[1]), LX.clamp(Math.round(q[1] / s) * s, bx[2], bx[3])]);
        }
        svg.style.touchAction = "none"; svg.classList.add("pickable");
        svg.addEventListener("pointerdown", function (ev) { down = true; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ } at(ev); });
        svg.addEventListener("pointermove", function (ev) { if (down) at(ev); });
        svg.addEventListener("pointerup", function () { down = false; });
        svg.addEventListener("pointercancel", function () { down = false; });
      },
      render: render,
      focusDot: function () { focusDot = true; },
      el: wrap
    };

    // ---- a whole scene: region, styled rules, cost line, best plans, unbounded arrow, simplex walk, plan dot
    function rayEnd(p, r) {
      var t = 1e9;
      if (r[0] > 1e-12) t = Math.min(t, (bx[1] - p[0]) / r[0]); if (r[0] < -1e-12) t = Math.min(t, (bx[0] - p[0]) / r[0]);
      if (r[1] > 1e-12) t = Math.min(t, (bx[3] - p[1]) / r[1]); if (r[1] < -1e-12) t = Math.min(t, (bx[2] - p[1]) / r[1]);
      return [p[0] + Math.max(0, t) * r[0], p[1] + Math.max(0, t) * r[1]];
    }
    function ext(a, b) { for (var k in b) a[k] = b[k]; return a; }
    function hit(a, b, id, extra, par) {   // a wide, transparent line on top of a draggable one
      var sg = segment(a, b, bx); if (!sg) return;
      S("line", ext({ x1: sx(sg[0][0]), y1: sy(sg[0][1]), x2: sx(sg[1][0]), y2: sy(sg[1][1]), class: "hit", "data-drag": id }, extra), par)
        .addEventListener("pointerdown", function (e) { start(e, id); });
    }
    function render(st) {
      last = st; if (!st) return;
      var ae = document.activeElement, keep = !!(ae && svg.contains(ae) && ae.classList && ae.classList.contains("dot"));
      if (fluid) { size(); axes(); }
      clear();
      var rows = st.rows || [], sol = st.sol, c = st.c, sty = o.styles || {}, W = d.W, m = d.m;
      // the region that passes every rule
      var poly = region(rows, bx);
      if (poly.length >= 3) S("polygon", { points: poly.map(function (v) { return sx(v[0]).toFixed(1) + "," + sy(v[1]).toFixed(1); }).join(" "), class: "lx-lp-region soft" }, gReg);
      // rule lines, each with its label and, for draggable rules, a wide hit area
      rows.forEach(function (r, i) {
        var id = idOf(r, i), stl = sty[id]; if (!stl) return;
        var sg = segment(r.a, r.b, bx); if (!sg) return;
        var hi = st.hi === id;
        S("line", { x1: sx(sg[0][0]), y1: sy(sg[0][1]), x2: sx(sg[1][0]), y2: sy(sg[1][1]), stroke: stl.color, "stroke-width": hi ? 4 : 2, "stroke-dasharray": stl.dash, class: hi ? "hi" : null }, gRule);
        var s0 = sg[0], s1 = sg[1], place = stl.place || "start", lx, ly, anchor = "start";
        if (place === "top") { var tp = s1[1] >= s0[1] ? s1 : s0; lx = sx(tp[0]) + 5; ly = sy(tp[1]) + 14; }
        else if (place === "end") { lx = sx(s1[0]) - 4; ly = sy(s1[1]) - 6; anchor = "end"; }
        else if (place === "foot") { lx = sx(s1[0]) - 8; ly = sy(s1[1]) - 7; anchor = "end"; }
        else { lx = sx(s0[0]) + 8; ly = sy(s0[1]) + 18; }
        var label = W < 480 && stl.short ? stl.short : stl.label || "";
        if (anchor === "start" && W - m.r - lx < label.length * 7) { anchor = "end"; lx -= 12; }
        if (anchor === "end" && lx - m.l < label.length * 7) { anchor = "start"; lx = m.l + 4; }
        // the label in its line's color taken toward the ink (darker by day, lighter by night): 4.5:1 on the surface
        S("text", { x: lx, y: ly, "text-anchor": anchor, class: "lbl", fill: "color-mix(in srgb, " + stl.color + " 70%, var(--lx-ink))", "paint-order": "stroke", stroke: "var(--lx-surface)", "stroke-width": 4, "stroke-linejoin": "round" }, gRule).textContent = label;
        if (o.onDrag && stl.drag) hit(r.a, r.b, id, { tabindex: "-1" }, gRule);
      });
      // the cost line
      if (st.level != null && c && (c[0] || c[1])) {
        var cl = segment(c, st.level, bx);
        if (cl) {
          S("line", { x1: sx(cl[0][0]), y1: sy(cl[0][1]), x2: sx(cl[1][0]), y2: sy(cl[1][1]), stroke: "var(--lx-accent)", "stroke-width": 2.5, "stroke-dasharray": "8 5" }, gIso);
          // the label goes below the line's right end; when that end sits on the x-axis (the label would cover its tick
          // numbers), it goes above the line's left end instead
          var onAxis = Math.abs(cl[1][1] - bx[2]) < 1e-9 * Math.max(1, bx[3] - bx[2]) + (bx[3] - bx[2]) * 0.02;
          var lab = onAxis ? { x: sx(cl[0][0]) + 6, y: sy(cl[0][1]) - 8, "text-anchor": "start" } : { x: sx(cl[1][0]) - 4, y: sy(cl[1][1]) + 16, "text-anchor": "end" };
          if (onAxis && sy(cl[0][1]) - 8 < m.t + 12) lab.y = sy(cl[0][1]) + 18;
          S("text", ext(lab, { class: "lbl", fill: "var(--lx-accent)", "paint-order": "stroke", stroke: "var(--lx-surface)", "stroke-width": 4 }), gIso)
            .textContent = o.levelLabel ? o.levelLabel(st.level) : "Cost " + LX.fmt.money(st.level);
          if (o.onDrag) hit(c, st.level, "cost", null, gIso);
        }
      }
      // the best plans: one corner, or a tied edge or ray
      if (sol && st.showBest !== false && (sol.status === "optimal" || sol.status === "tied")) {
        var thick = { stroke: "var(--lx-good)", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.85 };
        if (sol.best.length > 1) {
          var b0 = sol.best[0], b1 = sol.best[sol.best.length - 1];
          S("line", ext({ x1: sx(b0.x), y1: sy(b0.y), x2: sx(b1.x), y2: sy(b1.y) }, thick), gPt);
        } else if (sol.ray) {
          var bb = sol.best[0], e1 = rayEnd([bb.x, bb.y], sol.ray);
          S("line", ext({ x1: sx(bb.x), y1: sy(bb.y), x2: sx(e1[0]), y2: sy(e1[1]) }, thick), gPt);
        }
        sol.best.forEach(function (b) { S("circle", { cx: sx(b.x), cy: sy(b.y), r: 8, fill: "var(--lx-good)", stroke: "var(--lx-surface)", "stroke-width": 2.5 }, gPt); });
      }
      // unbounded: an arrow from the middle of the region along the direction that improves for ever
      if (sol && sol.status === "unbounded" && sol.ray) {
        var c0 = poly.length ? poly.reduce(function (a, q) { return [a[0] + q[0] / poly.length, a[1] + q[1] / poly.length]; }, [0, 0]) : [bx[0], bx[2]];
        var ax = sx(c0[0]), ay = sy(c0[1]), tx = ax + sol.ray[0] * 70, ty = ay - sol.ray[1] * 70;
        S("line", { x1: ax, y1: ay, x2: tx, y2: ty, stroke: "var(--lx-bad)", "stroke-width": 3 }, gPt);
        S("path", { d: "M" + tx + " " + ty + " l-10 -6 v12 z", fill: "var(--lx-bad)", transform: "rotate(" + (-Math.atan2(sol.ray[1], sol.ray[0]) * 180 / Math.PI) + " " + tx + " " + ty + ")" }, gPt);
      }
      // the simplex walk, up to corner walkAt
      if (st.walk && st.walk.length) {
        var wk = st.walk, upto = st.walkAt == null ? wk.length - 1 : st.walkAt;
        for (var k = 1; k <= upto; k++) S("line", { x1: sx(wk[k - 1].x), y1: sy(wk[k - 1].y), x2: sx(wk[k].x), y2: sy(wk[k].y), stroke: "var(--lx-tier-3)", "stroke-width": 4, "stroke-linecap": "round" }, gPt);
        wk.forEach(function (v, k) {
          if (k > upto) return;
          S("circle", { cx: sx(v.x), cy: sy(v.y), r: k === upto ? 9 : 6, fill: k === upto ? "var(--lx-tier-3)" : "var(--lx-surface)", stroke: "var(--lx-tier-3)", "stroke-width": 2.5 }, gPt);
          S("text", { x: sx(v.x) + 10, y: sy(v.y) - 10, "font-size": 12, fill: "var(--lx-tier-3)", "paint-order": "stroke", stroke: "var(--lx-surface)", "stroke-width": 4 }, gPt).textContent = String(k + 1);
        });
      }
      // a plan the reader moves
      if (st.dot) {
        var dt = st.dot, ok = rows.every(function (r) { return holds(r, [dt.x, dt.y], 1e-9); });
        var dg = S("g", { class: "dot", tabindex: "0", role: "slider",
          "aria-label": o.dotLabel ? o.dotLabel(dt) : "Your plan: x = " + Math.round(dt.x) + ", y = " + Math.round(dt.y) + ". Arrow keys move it.",
          "aria-valuetext": o.dotValue ? o.dotValue(dt) : Math.round(dt.x) + " and " + Math.round(dt.y) }, gPt);
        S("circle", { cx: sx(dt.x), cy: sy(dt.y), r: 16, fill: "transparent" }, dg);
        S("circle", { class: "ring", cx: sx(dt.x), cy: sy(dt.y), r: 9, fill: ok ? "var(--lx-accent)" : "var(--lx-surface)", stroke: ok ? "var(--lx-surface)" : "var(--lx-bad)", "stroke-width": 2.5 }, dg);
        dg.addEventListener("pointerdown", function (e) { start(e, "dot"); });
        dg.addEventListener("keydown", function (e) {
          var s = o.dotStep || 5, k = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key]; if (!k || !o.onDot) return;
          e.preventDefault(); o.onDot(LX.clamp(dt.x + k[0], bx[0], bx[1]), LX.clamp(dt.y + k[1], bx[2], bx[3]), true);
        });
        if (focusDot || keep) { focusDot = false; dg.focus(); }
      }
      var said = o.describe ? o.describe(st) : o.aria || "A plane of plans";
      svg.setAttribute("aria-label", said);
      if (altBody) altBody.innerHTML = "<p>" + LX.esc(said) + "</p>";
    }

    // ---- pointer: drag a rule line, the cost line or the dot
    function toData(e) {
      var M = svg.getScreenCTM && svg.getScreenCTM(), x, y;
      if (M) { var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; var q = pt.matrixTransform(M.inverse()); x = q.x; y = q.y; }
      else { var r = svg.getBoundingClientRect(), k = d.W / r.width; x = (e.clientX - r.left) * k; y = (e.clientY - r.top) * k; }
      return [d.ix(x), d.iy(y)];
    }
    function start(e, id) { drag = id; try { svg.setPointerCapture(e.pointerId); } catch (x) { /* older browsers */ } e.preventDefault(); move(e); }
    function move(e) {
      if (!drag || !last) return;
      var v = toData(e);
      if (drag === "dot") { if (o.onDot) o.onDot(LX.clamp(v[0], bx[0], bx[1]), LX.clamp(v[1], bx[2], bx[3])); return; }
      var a = drag === "cost" ? last.c : null;
      if (!a) (last.rows || []).forEach(function (r, i) { if (idOf(r, i) === drag) a = r.a; });
      if (a && o.onDrag) o.onDrag(drag, a[0] * v[0] + a[1] * v[1]);
    }
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", function () { drag = null; });
    svg.addEventListener("pointercancel", function () { drag = null; });

    size(); axes();
    if (fluid) {
      if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(wrap) && last) render(last); }).observe(wrap);
      LX.onTheme(function () { if (last) render(last); });
    }
    return api;
  };
})();
