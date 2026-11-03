// 10-write-it-down.js — Lesson 10, "Write it down: what are the decisions, the goal and the rules?" (step cards,
// Analyst tier; W1, 2026-11-02).
//
// Data: assets/learn/data/10-write-it-down.json (the hour, the CO2 cap, slider ranges, the ten formulation cards),
// assets/learn/data/town.json (Prairie Town's fleet; illustrative) and town_year.json (real 2025 SPP shapes).
//
// The day is lesson 0's (3 September 2025), cut and rounded exactly as grid-operator.js prepare() does. The lesson's
// two-variable linear program is one hour of it, 19:00, when gas must supply the gap left by nuclear, wind and sun:
//   decisions  x = combined-cycle output (MW), y = peaker output (MW), for one hour
//   goal       minimise cx*x + cy*y  (running cost in $, one hour: MW x 1 h x $/MWh)
//   rules      demand   x + y >= D        (gas covers the gap; any extra would be spilled)
//              cc size  x <= 150,  peaker size  y <= 100
//              CO2 cap  0.37 x + 0.55 y <= cap   (t of CO2 in the hour)
//              x, y >= 0 (always)
// solve2() is exact for two variables: it lists the corners (intersections of rule lines that meet every rule), tests
// the region's directions of recession for an unbounded goal, and reports one of four outcomes: optimal (one best
// corner), tied (a whole edge or ray is best), infeasible (no corner: no plan meets every rule) or unbounded (the goal
// improves without limit along a feasible direction). _tests/learn/test_10-write-it-down.js checks it against HiGHS on
// random cases, and every number the page states against this model.
//
// Lesson-local components (wave W1; the coordinator may promote them to assets/learn/components/): W1F.Ctl (a slider
// with a number formatter), W1F.CardSort (i-formulation: sort cards into bins), W1F.LPPlot (i-lp-playground: the
// two-variable region, rule lines that can be dragged, the cost line, best corners and a simplex walk), W1F.Views
// (words, symbols and a table linked to each other and to the plot), W1F.EquationCard (e-equation: symbols that open
// their words and their code) and W1F.FormulateBox (e-formulate). Lesson 11 loads this file for the plot, the walk and
// the equation card. Their CSS is injected once (id "w1f-css").
(function () {
  "use strict";
  var HOURS = 24;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  // lesson 0's day: the same slicing and rounding as grid-operator.js prepare()
  function dayOf(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet, step = sc.step;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    var out = { date: sc.date, dateLabel: sc.dateLabel, fleet: f, startCC: sc.startCC, demand: [], wind: [], solar: [], need: [] };
    for (var t = 0; t < HOURS; t++) {
      var w = Math.round(year.wind[i + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i + t] / 1000 * f.solar.mw);
      var n = Math.round((year.demand[i + t] / 1000 * sc.demandPeakMW - f.nuclear.mw - w - s) / step) * step;
      out.wind.push(w); out.solar.push(s); out.need.push(n); out.demand.push(n + f.nuclear.mw + w + s);
    }
    return out;
  }
  // the lesson's default parameters for hour h of the day
  function params(town, day, D, over) {
    var f = town.fleet, h = D.hour, p = {
      hour: h, D: day.need[h], cap: D.cap, cx: f.cc.cost, cy: f.peaker.cost, ex: f.cc.co2, ey: f.peaker.co2, X: f.cc.mw, Y: f.peaker.mw,
      on: { demand: true, cc: true, pk: true, co2: true }
    };
    if (over) for (var k in over) { if (k === "on") { for (var r in over.on) p.on[r] = over.on[r]; } else p[k] = over[k]; }
    return p;
  }
  var RULES = ["demand", "cc", "pk", "co2"];
  // the rules that are switched on, each as a.v (op) b
  function rulesOf(p) {
    var all = {
      demand: { id: "demand", a: [1, 1], op: ">=", b: p.D },
      cc: { id: "cc", a: [1, 0], op: "<=", b: p.X },
      pk: { id: "pk", a: [0, 1], op: "<=", b: p.Y },
      co2: { id: "co2", a: [p.ex, p.ey], op: "<=", b: p.cap }
    };
    return RULES.filter(function (k) { return p.on[k] !== false; }).map(function (k) { return all[k]; });
  }
  // every rule (and x >= 0, y >= 0) as a half-plane a.v <= b
  function halfplanes(p) {
    var hs = rulesOf(p).map(function (r) { return r.op === ">=" ? { id: r.id, a: [-r.a[0], -r.a[1]], b: -r.b } : { id: r.id, a: r.a.slice(), b: r.b }; });
    hs.push({ id: "x0", a: [-1, 0], b: 0 }, { id: "y0", a: [0, -1], b: 0 });
    return hs;
  }
  function dot(a, v) { return a[0] * v[0] + a[1] * v[1]; }
  var EPS = 1e-7;
  function inside(hs, v) { return hs.every(function (h) { return dot(h.a, v) <= h.b + EPS * (1 + Math.abs(h.b)); }); }
  function active(hs, v) { return hs.filter(function (h) { return Math.abs(dot(h.a, v) - h.b) <= EPS * (1 + Math.abs(h.b)); }).map(function (h) { return h.id; }); }
  // the feasible corners, in order around the region
  function corners(p) {
    var hs = halfplanes(p), vs = [];
    for (var i = 0; i < hs.length; i++) for (var j = i + 1; j < hs.length; j++) {
      var a = hs[i].a, b = hs[j].a, det = a[0] * b[1] - a[1] * b[0];
      if (Math.abs(det) < 1e-12) continue;
      var v = [(hs[i].b * b[1] - a[1] * hs[j].b) / det, (a[0] * hs[j].b - hs[i].b * b[0]) / det];
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
  // directions along which the region goes on for ever (unit vectors)
  function rays(p) {
    var hs = halfplanes(p), cand = [[1, 0], [0, 1]];
    hs.forEach(function (h) { var n = Math.hypot(h.a[0], h.a[1]); if (n > 0) cand.push([h.a[1] / n, -h.a[0] / n], [-h.a[1] / n, h.a[0] / n]); });
    return cand.filter(function (r) { return hs.every(function (h) { return dot(h.a, r) <= 1e-12; }); });
  }
  function costOf(p, v) { return p.cx * v.x + p.cy * v.y; }
  function co2Of(p, v) { return p.ex * v.x + p.ey * v.y; }
  // the four outcomes of a linear program, for two variables
  function solve2(p) {
    var vs = corners(p), res = { status: "infeasible", corners: vs, best: [], x: null, y: null, cost: null, co2: null, binding: {}, ray: null };
    if (!vs.length) return res;
    var c = [p.cx, p.cy], rs = rays(p);
    var down = rs.filter(function (r) { return dot(c, r) < -1e-9; });
    if (down.length) { res.status = "unbounded"; res.ray = down[0]; return res; }
    var m = Math.min.apply(null, vs.map(function (v) { return costOf(p, v); })), tol = 1e-7 * (1 + Math.abs(m));
    res.best = vs.filter(function (v) { return costOf(p, v) <= m + tol; });
    var flat = rs.filter(function (r) { return Math.abs(dot(c, r)) <= 1e-9; });
    res.status = res.best.length > 1 || flat.length ? "tied" : "optimal";
    if (flat.length) res.ray = flat[0];
    var b = res.best[0];
    res.x = b.x; res.y = b.y; res.cost = m; res.co2 = co2Of(p, b);
    RULES.forEach(function (k) { res.binding[k] = b.on.indexOf(k) >= 0; });
    return res;
  }
  // does a plan meet every rule? (for the draggable plan dot)
  function check(p, v) {
    var broken = rulesOf(p).filter(function (r) { var s = dot(r.a, [v.x, v.y]); return r.op === ">=" ? s < r.b - 1e-9 : s > r.b + 1e-9; }).map(function (r) { return r.id; });
    if (v.x < -1e-9 || v.y < -1e-9) broken.push("sign");
    return { ok: !broken.length, broken: broken, cost: costOf(p, v), co2: co2Of(p, v) };
  }
  // the region clipped to a view box [x0, x1] x [y0, y1], for drawing (Sutherland-Hodgman)
  function clipPolygon(p, view) {
    var poly = [[view.x[0], view.y[0]], [view.x[1], view.y[0]], [view.x[1], view.y[1]], [view.x[0], view.y[1]]];
    halfplanes(p).forEach(function (h) {
      if (!poly.length) return;
      var out = [];
      for (var i = 0; i < poly.length; i++) {
        var A = poly[i], B = poly[(i + 1) % poly.length], fa = dot(h.a, A) - h.b, fb = dot(h.a, B) - h.b;
        if (fa <= 1e-12) out.push(A);
        if ((fa < -1e-12 && fb > 1e-12) || (fa > 1e-12 && fb < -1e-12)) { var t = fa / (fa - fb); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
      }
      poly = out;
    });
    return poly;
  }
  // the part of the line a.v = b inside the view box (two end points, or null)
  function clipLine(a, b, view) {
    var pts = [];
    function add(x, y) { if (x >= view.x[0] - 1e-9 && x <= view.x[1] + 1e-9 && y >= view.y[0] - 1e-9 && y <= view.y[1] + 1e-9 && !pts.some(function (q) { return Math.abs(q[0] - x) < 1e-6 && Math.abs(q[1] - y) < 1e-6; })) pts.push([x, y]); }
    if (Math.abs(a[1]) > 1e-12) { view.x.forEach(function (x) { add(x, (b - a[0] * x) / a[1]); }); }
    if (Math.abs(a[0]) > 1e-12) { view.y.forEach(function (y) { add((b - a[1] * y) / a[0], y); }); }
    if (pts.length < 2) return null;
    pts.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });   // left to right (bottom to top when vertical)
    return [pts[0], pts[pts.length - 1]];
  }
  // simplex, drawn: start at the most expensive corner and step to the cheapest neighbouring corner while one is cheaper
  function simplexWalk(p) {
    var vs = corners(p), n = vs.length; if (n < 2) return [];
    var cost = vs.map(function (v) { return costOf(p, v); }), i = cost.indexOf(Math.max.apply(null, cost)), path = [i];
    for (var k = 0; k < n; k++) {
      var nb = [(i + n - 1) % n, (i + 1) % n].filter(function (j) { return vs[i].on.some(function (r) { return vs[j].on.indexOf(r) >= 0; }); });
      var j = nb.sort(function (a, b) { return cost[a] - cost[b]; })[0];
      if (j === undefined || cost[j] >= cost[i] - 1e-9) break;
      i = j; path.push(i);
    }
    return path.map(function (k, s) {
      var prev = s ? vs[path[s - 1]] : null, edge = prev ? vs[k].on.filter(function (r) { return prev.on.indexOf(r) >= 0; })[0] : null;
      return { x: vs[k].x, y: vs[k].y, cost: cost[k], on: vs[k].on, along: edge };
    });
  }
  // the card sort: data cards [{id, text, bin, why}] against a placement {cardId: bin}
  function grade(cards, placed) {
    var res = cards.map(function (c) { return { id: c.id, placed: placed[c.id] || null, ok: placed[c.id] === c.bin }; });
    return { items: res, right: res.filter(function (r) { return r.ok; }).length, placed: res.filter(function (r) { return r.placed; }).length, total: cards.length };
  }

  var model = { HOURS: HOURS, dayOf: dayOf, params: params, RULES: RULES, rulesOf: rulesOf, halfplanes: halfplanes, corners: corners, rays: rays,
    solve2: solve2, check: check, costOf: costOf, co2Of: co2Of, clipPolygon: clipPolygon, clipLine: clipLine, simplexWalk: simplexWalk, grade: grade };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ lesson-local components
  var LX = window.LX, H = LX.H, S = LX.S;
  var W1F = window.W1F = window.W1F || {};
  W1F.lp2 = model;
  var CSS = [
    ".w1f-stage{display:grid;gap:10px;background:var(--lx-surface);border:1px solid var(--lx-line);border-radius:var(--lx-r-lg);padding:14px 16px;box-shadow:var(--lx-shadow)}",
    ".w1f-stage[hidden]{display:none}",
    ".w1f-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px 12px;flex-wrap:wrap}",
    ".page-learn .w1f-head h3{font-size:16px;margin:0}",
    ".w1f-chips{display:flex;flex-wrap:wrap;gap:8px}",
    ".w1f-chip{display:grid;gap:1px;padding:5px 10px;border-radius:10px;background:var(--lx-surface-2);min-width:0}",
    ".w1f-chip span{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3)}",
    ".w1f-chip b{font-family:var(--lx-f-mono);font-size:15.5px;font-weight:600;color:var(--lx-ink);font-variant-numeric:tabular-nums}",
    ".w1f-chip.good b{color:var(--lx-good)}.w1f-chip.bad b{color:var(--lx-bad)}.w1f-chip.warn b{color:var(--lx-warn)}",
    ".w1f-plot{position:relative;touch-action:none}",
    ".w1f-plot svg{display:block;width:100%;height:auto;overflow:visible}",
    ".w1f-plot text{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}",
    ".w1f-plot .lbl{font-family:var(--lx-f-display);font-size:12.5px;font-weight:500}",
    ".w1f-plot .hit{stroke:transparent;stroke-width:22;fill:none;cursor:grab}",
    ".w1f-plot .hit:focus{outline:none}",
    ".w1f-plot .hit:focus-visible{stroke:var(--lx-accent);stroke-opacity:.25}",
    ".w1f-plot .dot{cursor:grab}.w1f-plot .dot:focus{outline:none}.w1f-plot .dot:focus-visible circle.ring{stroke:var(--lx-accent);stroke-width:3}",
    ".w1f-plot .hi{stroke-width:5 !important}",
    ".w1f-status{font-size:14.5px;color:var(--lx-ink-2);min-height:1.3em}",
    ".w1f-status b{font-family:var(--lx-f-display);font-weight:600}",
    ".w1f-ctls{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 18px}",
    ".w1f-toggles{display:flex;flex-wrap:wrap;gap:8px}",
    ".w1f-toggle{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:4px 12px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font-family:var(--lx-f-display);font-size:14px;cursor:pointer}",
    ".w1f-toggle i{width:28px;height:16px;border-radius:8px;background:var(--lx-surface-3);position:relative;flex:none;transition:background .15s}",
    ".w1f-toggle i::after{content:'';position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:var(--lx-surface);box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .15s}",
    ".w1f-toggle[aria-pressed=true] i{background:var(--lx-good)}.w1f-toggle[aria-pressed=true] i::after{left:14px}",
    ".w1f-missions{display:grid;gap:6px}",
    ".w1f-mission{display:flex;gap:8px;align-items:flex-start;font-size:14.5px;color:var(--lx-ink-2)}",
    ".w1f-mission .lx-ic{width:18px;height:18px;margin-top:2px;color:var(--lx-ink-3)}.w1f-mission.won .lx-ic{color:var(--lx-good)}.w1f-mission.won{color:var(--lx-ink)}",
    // card sort
    ".w1f-sort{display:grid;gap:12px}",
    ".w1f-pool{display:flex;flex-wrap:wrap;gap:8px;min-height:48px;padding:10px;border-radius:12px;border:1px dashed var(--lx-line-2);background:var(--lx-surface-2)}",
    ".w1f-pool:empty::before{content:attr(data-empty);font-size:13.5px;color:var(--lx-ink-3)}",
    ".w1f-card{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:6px 12px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font-family:var(--lx-f-body);font-size:14.5px;line-height:1.25;cursor:pointer;text-align:left}",
    ".w1f-card[aria-pressed=true]{border-color:var(--lx-accent);box-shadow:inset 0 0 0 2px var(--lx-accent)}",
    ".w1f-card.ok{border-color:var(--lx-good)}.w1f-card.no{border-color:var(--lx-bad);box-shadow:inset 0 0 0 1px var(--lx-bad)}",
    ".w1f-card .lx-ic{width:15px;height:15px}.w1f-card.ok .lx-ic{color:var(--lx-good)}.w1f-card.no .lx-ic{color:var(--lx-bad)}",
    ".w1f-bins{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}",
    "@media(max-width:700px){.w1f-bins{grid-template-columns:repeat(2,minmax(0,1fr))}}",
    ".w1f-bin{display:grid;gap:8px;align-content:start;padding:10px;border-radius:12px;border:1px solid var(--lx-line);border-top:4px solid var(--c);background:var(--lx-surface);min-height:120px;min-width:0}",
    ".w1f-bin>button.w1f-binbtn{display:grid;gap:2px;text-align:left;background:none;border:0;padding:0;cursor:pointer;color:var(--lx-ink)}",
    ".w1f-bin>button.w1f-binbtn b{font-family:var(--lx-f-display);font-weight:600;font-size:15px}",
    ".w1f-bin>button.w1f-binbtn small{font-size:12.5px;color:var(--lx-ink-3)}",
    ".w1f-bin.armed{background:var(--lx-accent-soft)}",
    ".w1f-bin .w1f-card{width:100%;font-size:13.5px}",
    ".w1f-why{font-size:14px;color:var(--lx-ink-2);display:grid;gap:4px;margin:0;padding-left:1.1rem}",
    // linked views
    ".w1f-views{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.w1f-view.tbl{grid-column:1/-1}",
    "@media(max-width:640px){.w1f-views{grid-template-columns:minmax(0,1fr)}}",
    ".lx-step-act>.lx-btn,.lx-step-act>a.lx-btn{justify-self:start}",
    ".w1f-view{display:grid;gap:4px;align-content:start;padding:10px;border-radius:12px;border:1px solid var(--lx-line);background:var(--lx-surface);min-width:0}",
    ".w1f-view h4{font-family:var(--lx-f-display);font-size:12px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--lx-ink-3);margin:0 0 2px}",
    ".w1f-vrow{display:block;width:100%;text-align:left;background:none;border:1px solid transparent;border-radius:8px;padding:5px 7px;font-size:14px;line-height:1.35;color:var(--lx-ink);cursor:pointer}",
    ".w1f-vrow:hover{border-color:var(--lx-line-2)}",
    ".w1f-vrow.on{background:var(--lx-accent-soft);border-color:var(--lx-accent)}",
    ".w1f-vrow.static{cursor:default;color:var(--lx-ink-3)}",
    ".w1f-sym{font-family:var(--lx-f-mono);font-size:14px;white-space:nowrap}",
    ".w1f-sym var,.w1f-eq var{font-style:italic;font-family:Georgia,'Times New Roman',serif;font-size:1.08em}",
    ".w1f-tbl{width:100%;border-collapse:collapse;font-size:13px;font-family:var(--lx-f-mono)}",
    ".w1f-tbl th{font-family:var(--lx-f-display);font-weight:500;font-size:11.5px;color:var(--lx-ink-3);text-align:right;padding:3px 4px;border-bottom:1px solid var(--lx-line-2)}",
    ".w1f-tbl th:first-child,.w1f-tbl td:first-child{text-align:left}",
    ".w1f-tbl td{padding:4px;text-align:right;border-bottom:1px solid var(--lx-line);white-space:nowrap}",
    ".w1f-tblwrap{overflow-x:auto;max-width:100%}",
    ".w1f-tbl tr{cursor:pointer}.w1f-tbl tr.on td{background:var(--lx-accent-soft)}",
    ".w1f-tbl tr:focus{outline:none}.w1f-tbl tr:focus-visible td{box-shadow:inset 0 0 0 2px var(--lx-accent)}",
    // formulate box and equation card
    ".w1f-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}",
    "@media(max-width:860px){.w1f-form{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.w1f-form{grid-template-columns:minmax(0,1fr)}}",
    ".w1f-form>div{border:1px solid var(--lx-line);border-top:4px solid var(--c);border-radius:12px;padding:10px 12px;display:grid;gap:4px;align-content:start;background:var(--lx-surface)}",
    ".w1f-form h4{font-family:var(--lx-f-display);font-weight:600;font-size:15px;margin:0;color:var(--lx-ink)}",
    ".w1f-form p{font-size:14.5px;color:var(--lx-ink-2);margin:0}",
    ".w1f-eq{display:grid;gap:6px;padding:12px;border-radius:12px;background:var(--lx-surface-2);overflow-x:auto;font-size:16px;line-height:1.7;color:var(--lx-ink)}",
    ".w1f-eq .ln{white-space:nowrap}.w1f-eq .tag{font-family:var(--lx-f-body);font-size:13px;color:var(--lx-ink-3);margin-left:10px}",
    ".w1f-eq button.s{border:0;border-bottom:2px dotted var(--lx-ink-3);background:none;padding:0 1px;margin:0;cursor:pointer;color:inherit;font:inherit;line-height:1.2}",
    ".w1f-eq button.s.on{background:var(--lx-accent-soft);border-bottom-color:var(--lx-accent);border-radius:4px 4px 0 0}",
    ".w1f-eqd{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}@media(max-width:640px){.w1f-eqd{grid-template-columns:minmax(0,1fr)}}",
    ".w1f-eqd>div{border:1px solid var(--lx-line);border-radius:10px;padding:10px 12px;display:grid;gap:4px;align-content:start}",
    ".w1f-eqd h4{font-family:var(--lx-f-display);font-size:12px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--lx-ink-3);margin:0}",
    ".w1f-eqd p{font-size:14.5px;margin:0;color:var(--lx-ink)}",
    ".w1f-eqd pre{margin:0;font-family:var(--lx-f-mono);font-size:12.5px;white-space:pre-wrap;word-break:break-word;color:var(--lx-ink);background:none;border:0;padding:0}",
    ".w1f-walk{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
    ".w1f-walk-out{font-size:14.5px;color:var(--lx-ink)}"
  ].join("\n");
  W1F.css = function () { if (!document.getElementById("w1f-css")) H("style", { id: "w1f-css", text: CSS }, document.head); };

  // a slider in the look of LX.Slider, with min, a number formatter and keyboard steps
  W1F.Ctl = function (host, o) {
    var id = LX.uid("ctl"), step = o.step || 1, min = o.min || 0, max = o.max, fmt = o.fmt || function (v) { return String(v); };
    var w = H("div", { class: "lx-ctl", style: "--c:" + (o.color || "var(--lx-ink)") }, host);
    var top = H("div", { class: "lx-ctl-top" }, w), lab = H("label", { for: id }, top); H("i", null, lab); H("span", { text: o.label }, lab);
    var out = H("output", { for: id }, top), row = H("div", { class: "lx-ctl-row" }, w);
    var minus = H("button", { type: "button", "aria-label": (o.downLabel || "Lower") + " " + o.label, text: "−" }, row);
    var tr = H("div", { class: "lx-ctl-track" }, row); H("div", { class: "lx-ctl-rail" }, tr); var fill = H("div", { class: "lx-ctl-fill" }, tr);
    var inp = H("input", { type: "range", id: id, min: min, max: max, step: step }, tr);
    var plus = H("button", { type: "button", "aria-label": (o.upLabel || "Raise") + " " + o.label, text: "+" }, row);
    var val = o.value == null ? min : o.value;
    function pos(v) { return (13 + ((v - min) / (max - min)) * (tr.clientWidth - 26)) / Math.max(1, tr.clientWidth) * 100; }
    function paint() { inp.value = val; out.textContent = fmt(val); inp.setAttribute("aria-valuetext", fmt(val)); fill.style.width = pos(val) + "%"; }
    function setV(v, user) {
      var c = LX.clamp(Math.round((v - min) / step) * step + min, min, max); c = Math.round(c * 1e6) / 1e6;
      var ch = c !== val; val = c; paint(); if (user && ch && o.onChange) o.onChange(val);
    }
    inp.addEventListener("input", function () { setV(+inp.value, true); });
    minus.addEventListener("click", function () { setV(val - step, true); });
    plus.addEventListener("click", function () { setV(val + step, true); });
    if (window.ResizeObserver) new ResizeObserver(paint).observe(tr);
    paint();
    return { el: w, set: function (v) { setV(v, false); }, val: function () { return val; }, input: inp };
  };

  // an on/off switch button
  W1F.Toggle = function (host, label, on, onChange) {
    var b = H("button", { type: "button", class: "w1f-toggle", "aria-pressed": on ? "true" : "false" }, host);
    H("i", { "aria-hidden": "true" }, b); H("span", { text: label }, b);
    b.addEventListener("click", function () { on = !on; b.setAttribute("aria-pressed", on ? "true" : "false"); onChange(on); });
    return { el: b, set: function (v) { on = !!v; b.setAttribute("aria-pressed", on ? "true" : "false"); } };
  };

  // card sort (i-formulation): tap a card, then tap a box; Check marks each card and says why
  W1F.CardSort = function (host, o) {
    var w = H("div", { class: "w1f-sort" }, host), placed = {}, armed = null;
    H("p", { class: "lx-hint", text: o.hint || "Tap a card, then tap the box it belongs in. Tap a placed card to move it." }, w);
    var pool = H("div", { class: "w1f-pool", "data-empty": "All cards placed.", role: "group", "aria-label": "Cards to sort" }, w);
    var bins = H("div", { class: "w1f-bins" }, w), binEls = {};
    o.bins.forEach(function (b) {
      var el = H("div", { class: "w1f-bin", style: "--c:" + b.color }, bins);
      var bt = H("button", { type: "button", class: "w1f-binbtn", "aria-label": "Put the chosen card in " + b.label }, el);
      H("b", { text: b.label }, bt); H("small", { text: b.sub }, bt);
      var list = H("div", { style: "display:grid;gap:6px" }, el);
      bt.addEventListener("click", function () { if (armed) { placed[armed] = b.id; armed = null; checked = false; feedback.innerHTML = ""; score.textContent = ""; paint(); } });
      binEls[b.id] = { el: el, list: list };
    });
    var foot = H("div", { class: "lx-step-foot" }, w);
    var chk = H("button", { type: "button", class: "lx-btn small", text: "Check" }, foot);
    var score = H("span", { class: "lx-hint", "aria-live": "polite" }, foot);
    var feedback = H("div", { "aria-live": "polite" }, w), checked = false;
    var cards = {};
    o.cards.forEach(function (c) {
      var b = H("button", { type: "button", class: "w1f-card", "aria-pressed": "false" }, null);
      H("span", { text: c.text }, b);
      b.addEventListener("click", function () { armed = armed === c.id ? null : c.id; paint(); });
      cards[c.id] = b;
    });
    function paint() {
      o.cards.forEach(function (c) {
        var b = cards[c.id], where = placed[c.id], par = where ? binEls[where].list : pool;
        if (b.parentNode !== par) par.appendChild(b);
        b.setAttribute("aria-pressed", armed === c.id ? "true" : "false");
        var g = checked && where ? (where === c.bin ? "ok" : "no") : "";
        b.className = "w1f-card" + (g ? " " + g : "");
        var ic = b.querySelector(".lx-ic"); if (ic) ic.remove();
        if (g) b.insertAdjacentHTML("afterbegin", LX.icon(g === "ok" ? "check" : "cross"));
        b.setAttribute("aria-label", c.text + (where ? ", in " + labelOf(where) : ", not placed") + (g === "ok" ? ", right" : g === "no" ? ", not right" : "") + (armed === c.id ? ", chosen: now tap a box" : ""));
      });
      o.bins.forEach(function (b) { binEls[b.id].el.classList.toggle("armed", !!armed); });
    }
    function labelOf(id) { return o.bins.filter(function (b) { return b.id === id; })[0].label; }
    chk.addEventListener("click", function () {
      checked = true; paint();
      var g = model.grade(o.cards, placed);
      score.textContent = g.right + " of " + g.total + " right" + (g.placed < g.total ? " (" + (g.total - g.placed) + " not placed yet)" : "");
      feedback.innerHTML = "";
      var wrong = o.cards.filter(function (c) { return placed[c.id] && placed[c.id] !== c.bin; });
      if (wrong.length) {
        var ul = H("ul", { class: "w1f-why" }, feedback);
        wrong.slice(0, 3).forEach(function (c) { H("li", { html: "<b>" + LX.esc(c.text) + "</b>: " + LX.rich(c.why) }, ul); });
      }
      if (o.onCheck) o.onCheck(g);
    });
    paint();
    return { el: w, placed: function () { return placed; }, place: function (m) { placed = m; checked = false; paint(); }, check: function () { chk.click(); } };
  };

  // the two-variable plot (i-lp-playground). o: {view, xLabel, yLabel, onDrag(id, value), onDot(x, y)}
  // state for render(): {p, sol, level (cost line, or null), dot ({x, y} or null), hi (rule id), walk ([...]), walkAt}
  var RULE_STYLE = {
    demand: { color: "var(--lx-ink)", dash: null, label: "Demand" },
    cc: { color: "var(--lx-cc)", dash: "6 4", label: "Combined-cycle size", short: "CC size" },
    pk: { color: "var(--lx-pk)", dash: "6 4", label: "Peaker size" },
    co2: { color: "var(--lx-warn)", dash: null, label: "CO₂ cap" }
  };
  W1F.RULE_STYLE = RULE_STYLE;
  W1F.LPPlot = function (host, o) {
    var view = o.view, w = H("div", { class: "w1f-plot" }, host);
    var svg = S("svg", { role: "img" }, w), g = S("g", null, svg);
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version of the chart" }, alt);
    var altBody = H("div", null, alt);
    var dims = null, drag = null, last = null;
    function size() {
      var W = Math.max(280, w.clientWidth || 600), Hh = Math.round(W < 480 ? W * 0.78 : Math.min(420, W * 0.6));
      var m = { l: 44, r: 12, t: 26, b: 40 }, iw = W - m.l - m.r, ih = Hh - m.t - m.b;
      dims = { W: W, H: Hh, m: m, iw: iw, ih: ih,
        sx: function (x) { return m.l + (x - view.x[0]) / (view.x[1] - view.x[0]) * iw; },
        sy: function (y) { return m.t + ih - (y - view.y[0]) / (view.y[1] - view.y[0]) * ih; },
        ix: function (px) { return view.x[0] + (px - m.l) / iw * (view.x[1] - view.x[0]); },
        iy: function (py) { return view.y[0] + (m.t + ih - py) / ih * (view.y[1] - view.y[0]); } };
      svg.setAttribute("viewBox", "0 0 " + W + " " + Hh); svg.setAttribute("width", W); svg.setAttribute("height", Hh);
    }
    function pt(v) { return dims.sx(v[0]).toFixed(1) + "," + dims.sy(v[1]).toFixed(1); }
    function line(a, b, attrs, par) {
      var seg = model.clipLine(a, b, view); if (!seg) return null;
      var at = { x1: dims.sx(seg[0][0]), y1: dims.sy(seg[0][1]), x2: dims.sx(seg[1][0]), y2: dims.sy(seg[1][1]) };
      for (var k in attrs) at[k] = attrs[k];
      return { el: S("line", at, par || g), seg: seg };
    }
    function rayEnd(b, r, vw) {
      var t = 1e9;
      if (r[0] > 1e-12) t = Math.min(t, (vw.x[1] - b[0]) / r[0]); if (r[0] < -1e-12) t = Math.min(t, (vw.x[0] - b[0]) / r[0]);
      if (r[1] > 1e-12) t = Math.min(t, (vw.y[1] - b[1]) / r[1]); if (r[1] < -1e-12) t = Math.min(t, (vw.y[0] - b[1]) / r[1]);
      return [b[0] + Math.max(0, t) * r[0], b[1] + Math.max(0, t) * r[1]];
    }
    function render(st) {
      last = st; if (!st) return;
      var ae = document.activeElement, keep = !!(ae && g.contains(ae) && ae.classList && ae.classList.contains("dot"));
      size(); g.innerHTML = "";
      var d = dims, p = st.p, sol = st.sol;
      // grid and axes
      var gx = 40, gy = 40;
      for (var x = view.x[0]; x <= view.x[1] + 1e-9; x += gx) {
        S("line", { x1: d.sx(x), x2: d.sx(x), y1: d.sy(view.y[0]), y2: d.sy(view.y[1]), stroke: "var(--lx-line)", "stroke-width": 1 }, g);
        S("text", { x: d.sx(x), y: d.H - 24, "text-anchor": "middle", "font-size": 11, fill: "var(--lx-ink-3)" }, g).textContent = x;
      }
      for (var y = view.y[0]; y <= view.y[1] + 1e-9; y += gy) {
        S("line", { x1: d.sx(view.x[0]), x2: d.sx(view.x[1]), y1: d.sy(y), y2: d.sy(y), stroke: "var(--lx-line)", "stroke-width": 1 }, g);
        S("text", { x: d.m.l - 6, y: d.sy(y) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--lx-ink-3)" }, g).textContent = y;
      }
      S("text", { x: d.sx(view.x[1]), y: d.H - 6, "text-anchor": "end", class: "lbl", fill: "var(--lx-ink-2)" }, g).textContent = o.xLabel;
      S("text", { x: d.m.l - 4, y: d.m.t - 12, class: "lbl", fill: "var(--lx-ink-2)" }, g).textContent = o.yLabel;
      // the region that meets every rule
      var poly = model.clipPolygon(p, view);
      if (poly.length >= 3) S("polygon", { points: poly.map(pt).join(" "), fill: "color-mix(in srgb, var(--lx-accent) 16%, transparent)", stroke: "none" }, g);
      // rule lines (a hit area for dragging the demand and CO2 lines)
      model.rulesOf(p).forEach(function (r) {
        var stl = RULE_STYLE[r.id], hi = st.hi === r.id;
        var L = line(r.a, r.b, { stroke: stl.color, "stroke-width": hi ? 4 : 2, "stroke-dasharray": stl.dash, class: hi ? "hi" : null });
        if (!L) return;
        // label places: demand low on its line, the sizes at the top and right ends, the CO2 cap low on the right
        var s0 = L.seg[0], s1 = L.seg[1], narrow = d.W < 480, lx, ly, anchor = "start";
        if (r.id === "cc") { lx = d.sx(r.b) + 5; ly = d.sy(view.y[1]) + 14; }
        else if (r.id === "pk") { lx = d.sx(view.x[1]) - 4; ly = d.sy(r.b) - 6; anchor = "end"; }
        else if (r.id === "demand") { lx = d.sx(s1[0]) - 8; ly = d.sy(s1[1]) - 7; anchor = "end"; }   // just above the x-axis, left of the line's foot
        else { lx = d.sx(s0[0]) + 8; ly = d.sy(s0[1]) + 18; }                                       // the CO2 cap: under its left end
        var label = narrow && stl.short ? stl.short : stl.label;
        if (anchor === "start" && d.W - d.m.r - lx < label.length * 7) { anchor = "end"; lx -= 12; }
        if (anchor === "end" && lx - d.m.l < label.length * 7) { anchor = "start"; lx = d.m.l + 4; }
        var tx = S("text", { x: lx, y: ly, "text-anchor": anchor, class: "lbl", fill: stl.color, "paint-order": "stroke", stroke: "var(--lx-surface)", "stroke-width": 4, "stroke-linejoin": "round" }, g);
        tx.textContent = label;
        if (o.onDrag && (r.id === "demand" || r.id === "co2")) {
          var h = line(r.a, r.b, { class: "hit", tabindex: "-1", "data-drag": r.id });
          if (h) h.el.addEventListener("pointerdown", function (e) { start(e, r.id); });
        }
      });
      // cost line
      if (st.level != null && (p.cx || p.cy)) {
        var cl = line([p.cx, p.cy], st.level, { stroke: "var(--lx-accent)", "stroke-width": 2.5, "stroke-dasharray": "8 5" });
        if (cl) {
          var e0 = cl.seg[1];
          var ct = S("text", { x: d.sx(e0[0]) - 4, y: d.sy(e0[1]) + 16, "text-anchor": "end", class: "lbl", fill: "var(--lx-accent)", "paint-order": "stroke", stroke: "var(--lx-surface)", "stroke-width": 4 }, g);
          ct.textContent = "Cost " + LX.fmt.money(st.level);
          if (o.onDrag) { var hc = line([p.cx, p.cy], st.level, { class: "hit", "data-drag": "cost" }); if (hc) hc.el.addEventListener("pointerdown", function (e) { start(e, "cost"); }); }
        }
      }
      // best plans
      if (sol && st.showBest !== false && (sol.status === "optimal" || sol.status === "tied")) {
        if (sol.best.length > 1) {
          var b0 = sol.best[0], b1 = sol.best[sol.best.length - 1];
          S("line", { x1: d.sx(b0.x), y1: d.sy(b0.y), x2: d.sx(b1.x), y2: d.sy(b1.y), stroke: "var(--lx-good)", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.85 }, g);
        } else if (sol.ray) {
          var bb = sol.best[0], e1 = rayEnd([bb.x, bb.y], sol.ray, view);
          S("line", { x1: d.sx(bb.x), y1: d.sy(bb.y), x2: d.sx(e1[0]), y2: d.sy(e1[1]), stroke: "var(--lx-good)", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.85 }, g);
        }
        sol.best.forEach(function (b) {
          S("circle", { cx: d.sx(b.x), cy: d.sy(b.y), r: 8, fill: "var(--lx-good)", stroke: "var(--lx-surface)", "stroke-width": 2.5 }, g);
        });
      }
      if (sol && sol.status === "unbounded" && sol.ray) {
        var c0 = poly.length ? poly.reduce(function (a, q) { return [a[0] + q[0] / poly.length, a[1] + q[1] / poly.length]; }, [0, 0]) : [view.x[0], view.y[0]];
        var ax = d.sx(c0[0]), ay = d.sy(c0[1]), bx = ax + sol.ray[0] * 70, by = ay - sol.ray[1] * 70;
        S("line", { x1: ax, y1: ay, x2: bx, y2: by, stroke: "var(--lx-bad)", "stroke-width": 3 }, g);
        S("path", { d: "M" + bx + " " + by + " l-10 -6 v12 z", fill: "var(--lx-bad)", transform: "rotate(" + (-Math.atan2(sol.ray[1], sol.ray[0]) * 180 / Math.PI) + " " + bx + " " + by + ")" }, g);
      }
      // simplex walk
      if (st.walk && st.walk.length) {
        var upto = st.walkAt == null ? st.walk.length - 1 : st.walkAt;
        for (var k = 1; k <= upto; k++) S("line", { x1: d.sx(st.walk[k - 1].x), y1: d.sy(st.walk[k - 1].y), x2: d.sx(st.walk[k].x), y2: d.sy(st.walk[k].y), stroke: "var(--lx-tier-3)", "stroke-width": 4, "stroke-linecap": "round" }, g);
        st.walk.forEach(function (v, k) {
          if (k > upto) return;
          S("circle", { cx: d.sx(v.x), cy: d.sy(v.y), r: k === upto ? 9 : 6, fill: k === upto ? "var(--lx-tier-3)" : "var(--lx-surface)", stroke: "var(--lx-tier-3)", "stroke-width": 2.5 }, g);
          S("text", { x: d.sx(v.x) + 10, y: d.sy(v.y) - 10, "font-size": 12, fill: "var(--lx-tier-3)", "paint-order": "stroke", stroke: "var(--lx-surface)", "stroke-width": 4 }, g).textContent = String(k + 1);
        });
      }
      // a plan the reader moves
      if (st.dot) {
        var ok = model.check(p, st.dot).ok, dg = S("g", { class: "dot", tabindex: "0", role: "slider", "aria-label": "Your plan: combined-cycle " + Math.round(st.dot.x) + " MW, peaker " + Math.round(st.dot.y) + " MW. Arrow keys move it.",
          "aria-valuetext": Math.round(st.dot.x) + " and " + Math.round(st.dot.y) + " MW" }, g);
        S("circle", { cx: d.sx(st.dot.x), cy: d.sy(st.dot.y), r: 16, fill: "transparent" }, dg);
        S("circle", { class: "ring", cx: d.sx(st.dot.x), cy: d.sy(st.dot.y), r: 9, fill: ok ? "var(--lx-accent)" : "var(--lx-surface)", stroke: ok ? "var(--lx-surface)" : "var(--lx-bad)", "stroke-width": 2.5 }, dg);
        dg.addEventListener("pointerdown", function (e) { start(e, "dot"); });
        dg.addEventListener("keydown", function (e) {
          var k = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[e.key]; if (!k || !o.onDot) return;
          e.preventDefault(); o.onDot(LX.clamp(st.dot.x + k[0], view.x[0], view.x[1]), LX.clamp(st.dot.y + k[1], view.y[0], view.y[1]), true);
        });
        if (o.focusDot || keep) { o.focusDot = false; dg.focus(); }
      }
      svg.setAttribute("aria-label", o.describe ? o.describe(st) : "Plans as points: combined-cycle output across, peaker output up.");
      altBody.innerHTML = o.describe ? "<p>" + LX.esc(o.describe(st)) + "</p>" : "";
    }
    function toData(e) { var r = svg.getBoundingClientRect(), sc = dims.W / r.width; return [dims.ix((e.clientX - r.left) * sc), dims.iy((e.clientY - r.top) * sc)]; }
    function start(e, id) { drag = id; try { svg.setPointerCapture(e.pointerId); } catch (x) { /* older browsers */ } e.preventDefault(); move(e); }
    function move(e) {
      if (!drag || !last) return;
      var v = toData(e), p = last.p;
      if (drag === "dot") { if (o.onDot) o.onDot(LX.clamp(v[0], view.x[0], view.x[1]), LX.clamp(v[1], view.y[0], view.y[1])); return; }
      var val = drag === "demand" ? v[0] + v[1] : drag === "co2" ? p.ex * v[0] + p.ey * v[1] : p.cx * v[0] + p.cy * v[1];
      if (o.onDrag) o.onDrag(drag, val);
    }
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", function () { drag = null; });
    svg.addEventListener("pointercancel", function () { drag = null; });
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(w) && last) render(last); }).observe(w);
    LX.onTheme(function () { if (last) render(last); });
    return { render: render, el: w, focusDot: function () { o.focusDot = true; } };
  };

  // formulate-it box (e-formulate): the parts of a model in words, and the symbols on request
  W1F.FormulateBox = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var g = H("div", { class: "w1f-form" }, host);
    o.parts.forEach(function (pt) { var d = H("div", { style: "--c:" + pt.color }, g); H("h4", { text: pt.k }, d); H("p", { html: LX.rich(pt.text) }, d); });
    if (o.symbols) { var det = H("details", { class: "lx-textalt" }, host); H("summary", { text: o.symbolsLabel || "Show it in symbols" }, det); H("div", { class: "w1f-eq", html: o.symbols }, det); }
    return { el: g };
  };

  // equation card (e-equation): each symbol is a button that opens its words and its code
  // o: {title, lede, lines: [html with <button class="s" data-s="id">...</button>], symbols: {id: {name, words, code}}, sel}
  W1F.EquationCard = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var eq = H("div", { class: "w1f-eq", role: "group", "aria-label": "The model; each symbol is a button" }, host);
    o.lines.forEach(function (l) { H("div", { class: "ln", html: l }, eq); });
    var dt = H("div", { class: "w1f-eqd", "aria-live": "polite" }, host);
    var dw = H("div", null, dt), dc = H("div", null, dt);
    H("h4", { text: "In words" }, dw); var pw = H("p", null, dw);
    H("h4", { text: "In code" }, dc); var pc = H("pre", null, dc);
    function sel(id) {
      var s = o.symbols[id]; if (!s) return;
      eq.querySelectorAll("button.s").forEach(function (b) { var on = b.getAttribute("data-s") === id; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
      pw.innerHTML = "<b>" + s.name + "</b>: " + LX.rich(s.words); pc.textContent = s.code;
    }
    eq.querySelectorAll("button.s").forEach(function (b) {
      var s = o.symbols[b.getAttribute("data-s")]; b.setAttribute("type", "button");
      if (s) b.setAttribute("aria-label", s.label || s.name);
      b.addEventListener("click", function () { sel(b.getAttribute("data-s")); });
    });
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version: every symbol" }, alt);
    var ul = H("ul", null, alt);
    Object.keys(o.symbols).forEach(function (k) { var s = o.symbols[k]; H("li", { html: "<b>" + s.name + "</b>: " + LX.rich(s.words) }, ul); });
    sel(o.sel || Object.keys(o.symbols)[0]);
    return { select: sel };
  };

  // ================================================================ the lesson
  var fmt1 = function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }); };
  var MW = function (v) { return fmt1(v) + " MW"; };
  var usd = function (v) { return (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US"); };
  W1F.fmt1 = fmt1; W1F.usd = usd;

  // api.saw with **bold** marks (LX.rich keeps the asterisks; they become <b> here)
  W1F.saw = function (api, t, bad) {
    api.saw(t, bad);
    var b = api.card.querySelector(":scope > div[aria-live] > .lx-saw > div"); if (b) b.innerHTML = b.innerHTML.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  };
  var saw = W1F.saw;

  function view(live, data, root) {
    W1F.css();
    var town = data.town, D = data["10_write_it_down"], day = dayOf(town, data.town_year), h = D.hour;
    var base = params(town, day, D), p = params(town, day, D), level = null, dot = null, hi = null, hook = null, onDotMove = null, ctl = {};
    var hh = LX.fmt.hh(h), sol = solve2(p);
    var NAME = { demand: "demand rule", cc: "combined-cycle size", pk: "peaker size", co2: "CO₂ cap", x0: "x = 0", y0: "y = 0" };

    // ---------- the stage: chips, plot, status
    var stage = H("div", { class: "w1f-stage" }, live);
    H("h3", { text: hh + " on " + day.dateLabel + ": two gas plants, one hour" }, H("div", { class: "w1f-head" }, stage));
    var chips = H("div", { class: "w1f-chips", "aria-live": "polite" }, stage);
    var plot = W1F.LPPlot(stage, {
      view: D.view, xLabel: "Combined-cycle x (MW)", yLabel: "Peaker y (MW)",
      onDrag: function (id, v) {
        if (id === "demand" && ctl.D) { ctl.D.set(v); upd({ D: ctl.D.val() }); }
        else if (id === "co2" && ctl.cap) { ctl.cap.set(v); upd({ cap: ctl.cap.val() }); }
        else if (id === "cost" && ctl.level) { ctl.level.set(v); setLevel(ctl.level.val()); }
      },
      onDot: function (x, y) { dot = { x: Math.round(x / 5) * 5, y: Math.round(y / 5) * 5 }; paint(); if (onDotMove) onDotMove(); },
      describe: describe
    });
    var status = H("p", { class: "w1f-status", "aria-live": "polite" }, stage);

    function describe() {
      var s = sol, t = "Plans as points: combined-cycle output x across, peaker output y up. The region of plans that meet every rule " +
        (s.status === "infeasible" ? "is empty. " : "has corners at " + s.corners.map(function (v) { return "(" + fmt1(v.x) + ", " + fmt1(v.y) + ")"; }).join(", ") + ". ");
      if (s.status === "optimal") t += "The best plan is the corner x = " + fmt1(s.x) + " MW, y = " + fmt1(s.y) + " MW, costing " + usd(s.cost) + ".";
      if (s.status === "tied") t += "Several plans tie for best at " + usd(s.cost) + ".";
      if (s.status === "unbounded") t += "The cost falls without limit.";
      if (dot) t += " Your plan: x = " + dot.x + ", y = " + dot.y + ".";
      return t;
    }
    function chip(label, value, cls) { var c = H("div", { class: "w1f-chip" + (cls ? " " + cls : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function paint() {
      sol = solve2(p);
      plot.render({ p: p, sol: sol, level: level, dot: dot, hi: hi, showBest: level == null || level <= sol.cost + 1 });
      chips.innerHTML = "";
      if (dot) {
        var c = check(p, dot);
        chip("Your plan", "x " + dot.x + ", y " + dot.y);
        chip("Its cost", usd(c.cost));
        chip("Rules", c.ok ? "all met" : "one broken", c.ok ? "good" : "bad");
      } else {
        chip("Gas needed", p.D + " MW");
        if (sol.status === "optimal" || sol.status === "tied") {
          if (level == null || level <= sol.cost + 1) { chip("Best cost", usd(sol.cost), "good"); chip("Best plan", "x " + fmt1(sol.x) + ", y " + fmt1(sol.y)); }
          if (level == null || level <= sol.cost + 1) chip("CO₂ at best", fmt1(sol.co2) + " t");
        } else chip("Outcome", sol.status, "bad");
      }
      status.innerHTML = statusText();
    }
    function statusText() {
      var s = sol;
      if (s.status === "infeasible") return "<b>Infeasible.</b> No plan meets every rule: the shaded region is gone.";
      if (s.status === "unbounded") return "<b>Unbounded.</b> The cost falls without limit along the red arrow: a rule is missing.";
      if (s.status === "tied") return "<b>Tied.</b> Every plan on the green " + (s.best.length > 1 ? "edge" : "line") + " costs " + usd(s.cost) + ".";
      if (level != null && level > s.cost + 1) return "Every plan on the dashed line costs " + usd(level) + ".";
      var on = s.best[0].on.map(function (k) { return NAME[k]; });
      return "<b>One best corner,</b> where " + on.join(" and ") + " meet." + (p.on.co2 ? " CO₂ cap: " + (s.binding.co2 ? "binding." : "slack, " + fmt1(p.cap - s.co2) + " t to spare.") : "");
    }
    function upd(o) { for (var k in o) p[k] = o[k]; paint(); if (hook) hook(); }
    function setLevel(v) { level = v; paint(); if (hook) hook(); }
    function reset(o) { p = params(town, day, D, o); level = null; dot = null; hi = null; onDotMove = null; hook = null; ctl = {}; stage.hidden = false; }
    function costCtl(host, key, label, color) {
      return W1F.Ctl(host, { label: label, color: color, min: D.ranges.cost[0], max: D.ranges.cost[1], step: 5, value: p[key], fmt: function (v) { return usd(v) + "/MWh"; },
        onChange: function (v) { var o = {}; o[key] = v; upd(o); } });
    }

    // ---------- step cards
    var steps = [
      { text: "Lesson 0's day was an optimization problem. Each has [[decision-variable|decisions]] (what you choose), a [[objective|goal]] (what you make smallest), [[constraint|rules]] (what must hold) and givens (data). Sort the ten cards.",
        build: function (act, api) {
          stage.hidden = true; hook = null;
          W1F.CardSort(act, { bins: D.bins, cards: D.cards, onCheck: function (g) {
            if (g.right === g.total) { api.done(); saw(api, "All ten right. Demand, weather and costs are **given**; the model chooses only the gas outputs, the spill and any unserved demand."); }
            else saw(api, g.right + " of " + g.total + " right. A decision is something the operator can change; a given is something the model must take as it is.", true);
          } });
        } },
      { text: "Now one hour: " + hh + " on " + day.dateLabel + ". Gas must supply " + base.D + " MW. Each point is a plan: x MW from the combined-cycle, y MW from the peaker. Drag the dot.",
        build: function (act, api) {
          reset(); dot = { x: D.dot[0], y: D.dot[1] }; var moves = 0;
          H("p", { class: "lx-hint", text: "The shaded area holds every plan that meets all the rules. On a keyboard, focus the dot and use the arrow keys (5 MW a step)." }, act);
          var b = H("button", { type: "button", class: "lx-btn ghost small", text: "Focus the dot" }, act);
          b.addEventListener("click", function () { plot.focusDot(); paint(); });
          onDotMove = function () {
            moves++; var c = check(p, dot);
            if (moves >= 2) api.done();
            if (c.ok) saw(api, "This plan meets every rule and costs **" + usd(c.cost) + "** for the hour. Can you find a cheaper one inside the shaded area?");
            else saw(api, "Outside the shaded area: it breaks the " + c.broken.map(function (k) { return k === "sign" ? "rule x, y ≥ 0" : NAME[k]; }).join(" and ") + ".", true);
          };
          paint();
        } },
      { text: "Every plan on the dashed line costs the same. Slide the line down to lower the cost. Where does it last touch the shaded area?",
        build: function (act, api) {
          reset(); level = D.level0;
          ctl.level = W1F.Ctl(act, { label: "Cost of the plans on the line", color: "var(--lx-accent)", min: 0, max: D.ranges.level[1], step: 100, value: level, fmt: usd,
            onChange: function (v) { setLevel(v); } });
          H("p", { class: "lx-hint", text: "You can also drag the dashed line itself." }, act);
          hook = function () {
            if (level != null && level <= sol.cost + 50) {
              if (level !== sol.cost) { level = sol.cost; ctl.level.set(sol.cost); paint(); }
              api.done(); saw(api, "It last touches a **corner**: " + fmt1(sol.x) + " MW from the combined-cycle, " + fmt1(sol.y) + " from the peaker, " + usd(sol.cost) + ". Any lower, and no plan on the line meets every rule.");
            }
          };
          paint();
        } },
      { text: "A hotter evening needs more gas. Drag the demand line past " + base.X + " MW, or use the slider, and watch the best corner jump.",
        build: function (act, api) {
          reset();
          ctl.D = W1F.Ctl(act, { label: "Gas needed this hour", color: "var(--lx-ink)", min: D.ranges.D[0], max: D.ranges.D[1], step: 5, value: p.D, fmt: function (v) { return v + " MW"; },
            onChange: function (v) { upd({ D: v }); } });
          hook = function () {
            if (sol.status === "infeasible") { saw(api, "**Infeasible** at " + p.D + " MW: even the cleanest plan would break the CO₂ cap. Step back a little.", true); return; }
            if (sol.status !== "optimal") return;
            if (p.D > p.X) { api.done(); saw(api, "The best corner jumped: the combined-cycle runs at its size, x = " + fmt1(sol.x) + " MW, and the dearer peaker makes the rest, y = " + fmt1(sol.y) + " MW, for " + usd(sol.cost) + "."); }
            else saw(api, "Still the corner on the x-axis: the combined-cycle alone, x = " + fmt1(sol.x) + " MW.");
          };
          paint();
        } },
      { text: "Now tighten the CO₂ cap. First it changes nothing (slack), then it touches the best plan ([[binding-constraint|binding]]), then no plan is left ([[infeasible|infeasible]]).",
        build: function (act, api) {
          reset();
          ctl.cap = W1F.Ctl(act, { label: "CO₂ cap this hour", color: "var(--lx-warn)", min: D.ranges.cap[0], max: D.ranges.cap[1], step: 1, value: p.cap, fmt: function (v) { return v + " t"; },
            onChange: function (v) { upd({ cap: v }); } });
          hook = function () {
            if (sol.status === "infeasible") { api.done(); saw(api, "**Infeasible.** Even the cleanest plan emits " + fmt1(base.ex * base.D) + " t, so a lower cap leaves no plan. A solver reports this; it cannot repair the rules."); }
            else if (sol.binding.co2) saw(api, "**Binding:** the cap now passes through the best plan. Any tighter and the region vanishes.");
            else saw(api, "**Slack:** the best plan emits " + fmt1(sol.co2) + " t, under the " + p.cap + " t cap, so the cap changes nothing yet.");
          };
          paint(); hook();
        } },
      { text: "Make it tied: give both plants the same running cost. The cost line turns parallel to the demand line. What happens to the best plan?",
        build: function (act, api) {
          reset();
          var c = H("div", { class: "w1f-ctls" }, act);
          ctl.cy = costCtl(c, "cy", "Peaker running cost", "var(--lx-pk)");
          ctl.cx = costCtl(c, "cx", "Combined-cycle running cost", "var(--lx-cc)");
          hook = function () {
            if (sol.status === "tied") { api.done(); saw(api, "**Tied.** Any split along the green edge costs " + usd(sol.cost) + ": not two best plans but infinitely many. A solver returns one of them."); }
            else if (sol.status === "optimal") saw(api, "Still one best corner, at x = " + fmt1(sol.x) + ", y = " + fmt1(sol.y) + ".");
          };
          paint();
        } },
      { text: "Make it [[unbounded|unbounded]]: pay the combined-cycle to run (a cost below $0), then switch off its size rule and the CO₂ cap. Watch the cost.",
        build: function (act, api) {
          reset();
          ctl.cx = costCtl(act, "cx", "Combined-cycle running cost", "var(--lx-cc)");
          var tg = H("div", { class: "w1f-toggles", role: "group", "aria-label": "Rules on or off" }, act);
          [["cc", "Combined-cycle size"], ["co2", "CO₂ cap"], ["pk", "Peaker size"], ["demand", "Demand rule"]].forEach(function (r) {
            W1F.Toggle(tg, r[1], true, function (on) { p.on[r[0]] = on; paint(); hook(); });
          });
          hook = function () {
            if (sol.status === "unbounded") { api.done(); saw(api, "**Unbounded.** Every extra MWh lowers the cost and no rule stops it. Real plants have sizes: an unbounded answer means a rule is missing."); }
            else if (!p.on.demand && sol.status === "optimal" && sol.x === 0 && sol.y === 0) saw(api, "Without the demand rule, the cheapest plan makes nothing: the lights go out at no cost. Another rule a model must not lose.", true);
            else if (p.cx < 0) saw(api, "Each MWh from the combined-cycle now earns money. Which rules still stop it from running more?");
            else saw(api, "First make the combined-cycle's cost negative.", true);
          };
          paint();
        } },
      { text: "The same problem in words, in symbols and as a table. Tap any line: the same rule lights up in all three and on the chart.",
        build: function (act, api) {
          reset();
          var vw = W1F.Views(act, { p: p, sol: sol, onPick: function (k) {
            hi = k === "goal" ? null : k; level = k === "goal" ? sol.cost : null; paint(); api.done();
            saw(api, k === "goal" ? "The goal is the cost line; here it passes through the best corner at " + usd(sol.cost) + "." : "The " + NAME[k] + ": " + (sol.binding[k] ? "**binding** at the best plan (the corner sits on its line)." : "**slack** at the best plan (room to spare)."));
          } });
          paint(); vw.update(p, sol);
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });
    // hooks for the screenshot script (lxDemo) and for curious readers in the console
    LX.demo(root, function (state) {   // standard states (core.js LX.demo) plus corner, jump, tied, views and sort
      if (state === "mid") { cards.go(2); ctl.level.set(sol.cost + 2400); setLevel(sol.cost + 2400); return { view: "cost line" }; }
      if (state === "corner") { cards.go(2); ctl.level.set(0); setLevel(0); return { view: "best corner" }; }
      if (state === "jump") { cards.go(3); ctl.D.set(200); upd({ D: 200 }); return { view: "corner jumps" }; }
      if (state === "tied") { cards.go(5); ctl.cy.set(p.cx); upd({ cy: p.cx }); return { view: "tied" }; }
      if (state === "views") { cards.go(7); var b = live.querySelector(".w1f-vrow[data-k=co2]"); if (b) b.click(); return { view: "linked views" }; }
      if (state === "sort") { cards.go(0); return { view: "card sort" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, params: function () { return p; }, sol: function () { return sol; }, cards: cards };
    buildExplain(town, day, D);
  }

  // words, symbols and a table, linked (step 8)
  W1F.Views = function (host, o) {
    var w = H("div", { class: "w1f-views" }, host), rows = {}, p = o.p, sol = o.sol;
    var vw = H("div", { class: "w1f-view" }, w); H("h4", { text: "In words" }, vw);
    var vs = H("div", { class: "w1f-view" }, w); H("h4", { text: "In symbols" }, vs);
    var vt = H("div", { class: "w1f-view tbl" }, w); H("h4", { text: "As a table" }, vt);
    var tb = H("table", { class: "w1f-tbl" }, H("div", { class: "w1f-tblwrap" }, vt)), thr = H("tr", null, H("thead", null, tb));
    ["Rule", "x", "y", "Limit", "At the best plan"].forEach(function (t) { H("th", { scope: "col", text: t }, thr); });
    var tbody = H("tbody", null, tb);
    var KEYS = ["goal", "demand", "cc", "pk", "co2"];
    function pick(k) { KEYS.forEach(function (q) { (rows[q] || []).forEach(function (e) { e.classList.toggle("on", q === k); if (e.tagName === "BUTTON") e.setAttribute("aria-pressed", q === k ? "true" : "false"); }); }); if (o.onPick) o.onPick(k); }
    function mk(par, k, html) { var b = H("button", { type: "button", class: "w1f-vrow", "data-k": k, "aria-pressed": "false", html: html }, par); b.addEventListener("click", function () { pick(k); }); (rows[k] = rows[k] || []).push(b); return b; }
    function update(p2, s2) {
      p = p2; sol = s2; rows = {};
      vw.querySelectorAll(".w1f-vrow").forEach(function (e) { e.remove(); }); vs.querySelectorAll(".w1f-vrow").forEach(function (e) { e.remove(); }); tbody.innerHTML = "";
      mk(vw, "goal", "<b>Goal:</b> make the hour's running cost as small as possible: " + usd(p.cx) + " per MWh from the combined-cycle, " + usd(p.cy) + " from the peaker.");
      mk(vw, "demand", "<b>Demand:</b> together they supply at least " + p.D + " MW.");
      mk(vw, "cc", "<b>Combined-cycle size:</b> at most " + p.X + " MW.");
      mk(vw, "pk", "<b>Peaker size:</b> at most " + p.Y + " MW.");
      mk(vw, "co2", "<b>CO₂ cap:</b> at most " + p.cap + " t this hour, at " + p.ex + " and " + p.ey + " t per MWh.");
      H("p", { class: "w1f-vrow static", text: "Neither plant runs below zero." }, vw);
      mk(vs, "goal", '<span class="w1f-sym">min ' + p.cx + "<var>x</var> + " + p.cy + "<var>y</var></span>");
      mk(vs, "demand", '<span class="w1f-sym"><var>x</var> + <var>y</var> ≥ ' + p.D + "</span>");
      mk(vs, "cc", '<span class="w1f-sym"><var>x</var> ≤ ' + p.X + "</span>");
      mk(vs, "pk", '<span class="w1f-sym"><var>y</var> ≤ ' + p.Y + "</span>");
      mk(vs, "co2", '<span class="w1f-sym">' + p.ex + "<var>x</var> + " + p.ey + "<var>y</var> ≤ " + p.cap + "</span>");
      H("p", { class: "w1f-vrow static", html: '<span class="w1f-sym"><var>x</var>, <var>y</var> ≥ 0</span>' }, vs);
      var at = function (a) { return fmt1(a[0] * sol.x + a[1] * sol.y); };
      [["goal", "Cost", p.cx, p.cy, "min", usd(sol.cost)], ["demand", "Demand", 1, 1, "≥ " + p.D, at([1, 1]) + (sol.binding.demand ? ", binding" : ", slack")],
       ["cc", "Combined-cycle size", 1, 0, "≤ " + p.X, at([1, 0]) + (sol.binding.cc ? ", binding" : ", slack")], ["pk", "Peaker size", 0, 1, "≤ " + p.Y, at([0, 1]) + (sol.binding.pk ? ", binding" : ", slack")],
       ["co2", "CO₂ cap", p.ex, p.ey, "≤ " + p.cap, at([p.ex, p.ey]) + (sol.binding.co2 ? ", binding" : ", slack")]].forEach(function (r) {
        var tr = H("tr", { tabindex: "0", "data-k": r[0], "aria-label": r[1] + " row" }, tbody);
        r.slice(1).forEach(function (c) { H("td", { text: String(c) }, tr); });
        tr.addEventListener("click", function () { pick(r[0]); });
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(r[0]); } });
        (rows[r[0]] = rows[r[0]] || []).push(tr);
      });
    }
    H("p", { class: "lx-hint", text: "Binding: the rule holds with no room to spare at the best plan. Slack: it has room to spare." }, host);
    update(p, sol);
    return { update: update, pick: pick };
  };

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(town, day, D) {
    var host = document.getElementById("w10-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var f = town.fleet, nPk = f.peaker.mw;
    // 1 formulate it
    W1F.FormulateBox(H("div", { class: "lx-xcard" }, host), {
      title: "Formulate it: lesson 0's day in words",
      lede: "The ten cards, put together. This is the whole model a solver needs; lesson 11 hands it to one.",
      parts: [
        { k: "Decisions", color: "var(--lx-tier-2)", text: "For each of the 24 hours: the combined-cycle's and the peaker's output, spilled wind and sun, and any unserved demand. 96 numbers." },
        { k: "Goal", color: "var(--lx-good)", text: "Make the day's running cost as small as possible: $" + f.cc.cost + " per MWh from the combined-cycle, $" + f.peaker.cost + " from the peaker, a large penalty per MWh unserved." },
        { k: "Rules", color: "var(--lx-warn)", text: "Every hour, supply equals demand. Each plant between 0 and its size. The combined-cycle changes at most " + f.cc.ramp + " MW an hour. Spill no more than the wind and sun there is." },
        { k: "Given", color: "var(--lx-ink-3)", text: "Demand, wind and sun for each hour of " + day.dateLabel + "; plant sizes, running costs and the ramp limit. The model takes these as they are ([[parameter|parameters]])." }
      ]
    });
    // 2 equation card
    var sym = function (id, html) { return '<button class="s" data-s="' + id + '">' + html + "</button>"; };
    W1F.EquationCard(H("div", { class: "lx-xcard" }, host), {
      title: "The same model in symbols",
      lede: "Tap a symbol to see what it means and how it looks in code (the model format this site's solver reads).",
      lines: [
        "min&nbsp; Σ<sub><var>t</var></sub> ( " + sym("c", "40") + " " + sym("pcc", "<var>p</var><sub>cc</sub>(<var>t</var>)") + " + " + sym("cpk", f.peaker.cost) + " " + sym("ppk", "<var>p</var><sub>pk</sub>(<var>t</var>)") + " + " + sym("V", "<var>V</var>") + " " + sym("u", "<var>u</var>(<var>t</var>)") + " )<span class=\"tag\">goal</span>",
        sym("n", "100") + " + " + sym("wv", "<var>w</var>(<var>t</var>) + <var>v</var>(<var>t</var>)") + " + <var>p</var><sub>cc</sub>(<var>t</var>) + <var>p</var><sub>pk</sub>(<var>t</var>) + <var>u</var>(<var>t</var>) − " + sym("s", "<var>s</var>(<var>t</var>)") + " = " + sym("d", "<var>d</var>(<var>t</var>)") + "<span class=\"tag\">balance, every hour</span>",
        "0 ≤ <var>p</var><sub>cc</sub>(<var>t</var>) ≤ 150, &nbsp;0 ≤ <var>p</var><sub>pk</sub>(<var>t</var>) ≤ " + nPk + "<span class=\"tag\">sizes</span>",
        "−" + sym("R", "40") + " ≤ <var>p</var><sub>cc</sub>(<var>t</var>) − <var>p</var><sub>cc</sub>(<var>t</var>−1) ≤ 40<span class=\"tag\">ramp limit</span>",
        "0 ≤ <var>s</var>(<var>t</var>) ≤ <var>w</var>(<var>t</var>) + <var>v</var>(<var>t</var>), &nbsp;<var>u</var>(<var>t</var>) ≥ 0<span class=\"tag\">spill and unserved</span>"
      ],
      symbols: {
        pcc: { name: "p_cc(t)", label: "p cc of t", words: "The combined-cycle's output in hour t, in MW: a [[decision-variable|decision]], one for each of the 24 hours.", code: '{ name: "cc_19", lb: 0, ub: 150, cost: 40 }' },
        ppk: { name: "p_pk(t)", label: "p pk of t", words: "The peaker's output in hour t, in MW: a decision.", code: '{ name: "pk_19", lb: 0, ub: ' + nPk + ", cost: " + f.peaker.cost + " }" },
        c: { name: "40", label: "40 dollars per MWh", words: "The combined-cycle's running cost in $/MWh: given. Times MW for one hour, it gives dollars.", code: "cost: 40   // in the variable's entry" },
        cpk: { name: String(f.peaker.cost), label: f.peaker.cost + " dollars per MWh", words: "The peaker's running cost in $/MWh: given.", code: "cost: " + f.peaker.cost },
        V: { name: "V", label: "V, the unserved penalty", words: "A large penalty per MWh of unserved demand, so the solver keeps the lights on whenever it can. Illustrative.", code: '{ name: "un_19", lb: 0, cost: 3000 }' },
        u: { name: "u(t)", label: "u of t", words: "Unserved demand in hour t, in MW: a decision the solver avoids because of its penalty.", code: '"un_19"' },
        n: { name: "100", label: "100 megawatts of nuclear", words: "The nuclear plant runs flat at 100 MW: given, so it moves to the right-hand side.", code: "eq: d - 100 - w - v   // the balance row's right-hand side" },
        wv: { name: "w(t) + v(t)", label: "w of t plus v of t", words: "The wind and sun available in hour t, from the real shapes of " + day.dateLabel + ": given.", code: "ub: w + v   // the spill variable's upper bound" },
        s: { name: "s(t)", label: "s of t", words: "Spilled wind and sun in hour t: a decision. It enters the balance with a minus sign.", code: '{ name: "sp_19", lb: 0, ub: ' + (day.wind[D.hour] + day.solar[D.hour]) + " }" },
        d: { name: "d(t)", label: "d of t", words: "Demand in hour t, in MW: given. At " + LX.fmt.hh(D.hour) + " it is " + day.demand[D.hour] + " MW.", code: '{ name: "balance_19", terms: { cc_19: 1, pk_19: 1, sp_19: -1, un_19: 1 }, eq: ' + day.need[D.hour] + " }" },
        R: { name: "40 (ramp)", label: "40 megawatts per hour ramp limit", words: "The combined-cycle's ramp limit, MW per hour: given. Two rules per hour, one up and one down.", code: '{ name: "ramp_up_19", terms: { cc_19: 1, cc_18: -1 }, le: 40 }' }
      },
      sel: "pcc"
    });
    // 3 flowchart: the four outcomes
    var p0 = params(town, day, D), s0 = solve2(p0), pInf = params(town, day, D, { cap: Math.floor(p0.ex * p0.D) - 4 }), pTie = params(town, day, D, { cy: p0.cx }),
        pUnb = params(town, day, D, { cx: -10, on: { cc: false, co2: false } });
    LX.Flowchart(H("div", { class: "lx-xcard" }, host), {
      title: "Four ways a linear program can end",
      lede: "Every solver run ends in one of these. Trace the cases you made on the chart.",
      nodes: {
        start: { t: "Solve", s: "rules and goal written down", sN: "rules and goal", k: "end" },
        q1: { t: "Any plan meets every rule?", tN: ["Any plan meets", "every rule?"], k: "q" },
        inf: { t: "Infeasible", s: "fix a rule or the data", sN: "fix a rule", k: "end" },
        q2: { t: "Goal improves for ever?", tN: ["Goal improves", "for ever?"], k: "q" },
        unb: { t: "Unbounded", s: "a rule is missing", k: "end" },
        q3: { t: "Cost line parallel to an edge?", tN: ["Cost line", "parallel to edge?"], k: "q" },
        tie: { t: "Tied", s: "a whole edge is best", k: "end" },
        one: { t: "One best corner", s: "the usual answer", k: "end" }
      },
      cols: 3, at: { start: [1, 0], q1: [1, 1], inf: [2, 1.9], q2: [1, 2.4], unb: [2, 3.3], q3: [1, 3.8], tie: [2, 4.7], one: [0.2, 4.7] },
      colsN: 2, atN: { start: [0, 0], q1: [0, 1], inf: [1, 1.9], q2: [0, 2.4], unb: [1, 3.3], q3: [0, 3.8], tie: [1, 4.7], one: [0, 5.2] },
      edges: [["start", "q1"], ["q1", "inf", "no"], ["q1", "q2", "yes"], ["q2", "unb", "yes"], ["q2", "q3", "no"], ["q3", "tie", "yes"], ["q3", "one", "no"]],
      traces: [
        { label: LX.fmt.hh(D.hour) + " as given", path: ["start", "q1", "q2", "q3", "one"], text: "One best corner: x = " + fmt1(s0.x) + ", y = " + fmt1(s0.y) + ", " + usd(s0.cost) + "." },
        { label: "CO₂ cap " + pInf.cap + " t", path: ["start", "q1", "inf"], text: "Even the cleanest plan emits " + fmt1(p0.ex * p0.D) + " t: " + solve2(pInf).status + "." },
        { label: "Equal costs", path: ["start", "q1", "q2", "q3", "tie"], text: "Both at $" + p0.cx + "/MWh: every split of " + p0.D + " MW costs " + usd(solve2(pTie).cost) + " (" + solve2(pTie).status + ")." },
        { label: "Paid to run, no size", path: ["start", "q1", "q2", "unb"], text: "At −$10/MWh with no size rule and no CO₂ cap: " + solve2(pUnb).status + "." }
      ],
      sel: 0
    });
  }

  LX.mount("write-it-down", function (live, data, root) { view(live, data, root); });
})();
