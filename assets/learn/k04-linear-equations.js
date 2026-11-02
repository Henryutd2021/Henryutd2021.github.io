// k04-linear-equations.js — Toolbox K4, "Linear equations and inequalities" (step cards, Learn W1, 2026-11-02).
//
// Just-in-time math for B1 (From algebra to a linear program). One interactive, the rule plane: a two-variable plane
// where each rule a1·x + a2·y (≤ | = | ≥) b is a line plus a side, the plans that pass every rule are shaded, and a
// test plan (two sliders, or a tap on the plane) is checked against each rule. Six step cards, then a practice drill.
//
// Data: assets/learn/data/town.json and town_year.json (Prairie Town, as in lesson 0). townDay() cuts and scales the day
// exactly as lesson 0's prepare() does (grid-operator.js; the Node test checks they agree), so 19:00 on 3 September 2025
// reads demand 331 MW, wind 72 MW, solar 14 MW and a gas need of 145 MW. Plant limits in the rules are Prairie Town's
// (combined-cycle 150 MW, ramp 40 MW/h; peaker 100 MW); the 90 MW the combined-cycle made at 18:00 is a stated
// assumption of the story (illustrative), so this hour it can reach at most 130 MW.
//
// Pure model (exported for Node): townDay, the rule algebra (le, holds, clip, region, verticesOf), story(), drill items.
// The rule helpers are lesson-local copies shared with b01-algebra-to-lp.js (a promotion request is in the sidecar).
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
  // a rule: {a: [a1, a2], op: "<=" | ">=" | "=", b}; a half-plane: {a, b} meaning a·p <= b
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
  function clip(poly, h) {   // Sutherland–Hodgman: the part of a convex polygon with h.a·p <= h.b
    var out = [], n = poly.length, eps = 1e-9 * (1 + Math.abs(h.b));
    var f = function (p) { return h.a[0] * p[0] + h.a[1] * p[1] - h.b; };
    for (var i = 0; i < n; i++) {
      var P = poly[i], Q = poly[(i + 1) % n], fp = f(P), fq = f(Q);
      if (fp <= eps) out.push(P);
      if ((fp < -eps && fq > eps) || (fp > eps && fq < -eps)) { var t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    return dedupe(out);
  }
  function region(rules, box) {   // box [x0, x1, y0, y1]; the plans in the box that pass every rule (convex polygon)
    var poly = [[box[0], box[2]], [box[1], box[2]], [box[1], box[3]], [box[0], box[3]]];
    for (var i = 0; i < rules.length && poly.length; i++) le(rules[i]).forEach(function (h) { if (poly.length) poly = clip(poly, h); });
    return poly;
  }
  function round1(v) { return Math.round(v * 10) / 10; }
  function verticesOf(poly) { return poly.map(function (p) { return [round1(p[0]) + 0, round1(p[1]) + 0]; }); }

  // ---------------------------------------------------------------- the story numbers (19:00, 3 September 2025)
  var HOUR = 19, PREV_CC = 90;
  function story(town, year) {
    var D = townDay(town, year), f = D.fleet, t = HOUR;
    var s = { D: D, t: t, demand: D.demand[t], nuclear: f.nuclear.mw, wind: D.wind[t], solar: D.solar[t], need: D.need[t],
              ccMax: f.cc.mw, ramp: f.cc.ramp, prevCC: PREV_CC, pkMax: f.peaker.mw };
    s.reach = Math.min(f.cc.mw, PREV_CC + f.cc.ramp);
    s.cover = { a: [1, 1], op: ">=", b: s.need, key: "cover" };
    s.limits = [
      { a: [1, 0], op: "<=", b: s.reach, key: "ramp", words: "x ≤ " + s.reach },
      { a: [0, 1], op: "<=", b: s.pkMax, key: "pk", words: "y ≤ " + s.pkMax },
      { a: [1, 0], op: ">=", b: 0, key: "x0", words: "x ≥ 0" },
      { a: [0, 1], op: ">=", b: 0, key: "y0", words: "y ≥ 0" }];
    s.view = [0, 160, 0, 160];
    s.triangle = verticesOf(region([s.cover].concat(s.limits), s.view));
    return s;
  }

  // ---------------------------------------------------------------- practice drill (seeded, so tests can replay it)
  function rng(seed) { var x = seed >>> 0 || 1; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
  var KINDS = ["gap", "solve", "flip", "test", "words"];
  var WORDS = [["at most", "≤"], ["no more than", "≤"], ["at least", "≥"], ["no less than", "≥"], ["exactly", "="], ["must not fall below", "≥"], ["must not exceed", "≤"]];
  function drillItem(D, k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (n) { return Math.floor(r() * n); };
    if (kind === "gap") {
      var t = pick(24), f = D.fleet;
      return { kind: kind, q: (t < 10 ? "0" : "") + t + ":00 on " + D.dateLabel + ": demand " + D.demand[t] + " MW, nuclear " + f.nuclear.mw + ", wind " + D.wind[t] + ", solar " + D.solar[t] + ". Gas g = ? MW",
               answer: D.need[t], unit: "MW", why: "g = " + D.demand[t] + " − " + f.nuclear.mw + " − " + D.wind[t] + " − " + D.solar[t] + " = " + D.need[t] + " MW." };
    }
    if (kind === "solve") {
      var a = 2 + pick(8), x = 5 * (1 + pick(30)), m = 10 * pick(10), n = a * x + m;
      return { kind: kind, q: "Solve " + a + "x + " + m + " = " + n + ". x = ?", answer: x, why: "Subtract " + m + ", then divide by " + a + ": x = (" + n + " − " + m + ") / " + a + " = " + x + "." };
    }
    if (kind === "flip") {
      var a2 = 2 + pick(5), b2 = a2 * (1 + pick(20));
      return { kind: kind, q: "−" + a2 + "x ≤ " + b2 + " is the same as …", choices: ["x ≥ −" + (b2 / a2), "x ≤ −" + (b2 / a2), "x ≥ " + (b2 / a2), "x ≤ " + (b2 / a2)], answer: 0,
               why: "Divide both sides by −" + a2 + " and flip the sign: x ≥ −" + (b2 / a2) + "." };
    }
    if (kind === "test") {
      var px = 10 * (2 + pick(14)), py = 10 * pick(10), c = 10 * (8 + pick(12)), op = r() < 0.5 ? "≤" : "≥";
      var v = px + py, pass = op === "≤" ? v <= c : v >= c;
      return { kind: kind, q: "Does the plan x = " + px + ", y = " + py + " pass x + y " + op + " " + c + "?", choices: ["Yes", "No"], answer: pass ? 0 : 1,
               why: px + " + " + py + " = " + v + (pass ? " passes " : " fails ") + op + " " + c + "." };
    }
    var w = WORDS[pick(WORDS.length)], amt = 10 * (1 + pick(20));
    return { kind: kind, q: "“The line can carry " + w[0] + " " + amt + " MW.” Which sign?", choices: ["≤", "≥", "="], answer: ["≤", "≥", "="].indexOf(w[1]),
             why: "“" + w[0] + "” means " + w[1] + ": flow " + w[1] + " " + amt + " MW." };
  }
  function drill(D, seed, n) { var r = rng(seed), out = []; for (var k = 0; k < n; k++) out.push(drillItem(D, k, r)); return out; }

  var model = { townDay: townDay, le: le, lhs: lhs, holds: holds, clip: clip, region: region, verticesOf: verticesOf, story: story,
                drill: drill, drillItem: drillItem, rng: rng, HOUR: HOUR, PREV_CC: PREV_CC };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, S = LX.S;
  var OPS = { "<=": "≤", ">=": "≥", "=": "=" };
  function fmtRule(r, xs, ys) {
    var t = [], nm = [xs || "x", ys || "y"];
    [0, 1].forEach(function (j) {
      var c = r.a[j]; if (!c) return;
      var sgn = c < 0 ? "−" : "+", mag = Math.abs(c) === 1 ? "" : String(Math.abs(c));
      t.push((t.length ? " " + sgn + " " : (c < 0 ? "−" : "")) + mag + nm[j]);
    });
    return (t.join("") || "0") + " " + OPS[r.op] + " " + (r.b < 0 ? "−" + Math.abs(r.b) : r.b);
  }

  // the rule plane: an SVG plane with rules, the region that passes them all, and plan points
  function Plane(host, o) {
    var W = 440, Hh = 380, m = { l: 58, r: 14, t: 12, b: 56 }, box = o.view;
    var wrap = H("div", { class: "w1h-plane" }, host);
    var svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": o.aria || "A plane of plans" }, wrap);
    var sx = function (x) { return m.l + (x - box[0]) / (box[1] - box[0]) * (W - m.l - m.r); };
    var sy = function (y) { return Hh - m.b - (y - box[2]) / (box[3] - box[2]) * (Hh - m.t - m.b); };
    var defs = S("defs", null, svg), pid = LX.uid("hatch");
    var pat = S("pattern", { id: pid, width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    S("line", { x1: 0, y1: 0, x2: 0, y2: 8, class: "w1h-hatch" }, pat);
    var gGrid = S("g", null, svg);
    (o.ticks || []).forEach(function (v) {
      if (v >= box[0] && v <= box[1]) { S("line", { x1: sx(v), x2: sx(v), y1: sy(box[2]), y2: sy(box[3]), class: "w1h-grid" }, gGrid); S("text", { x: sx(v), y: Hh - m.b + 22, "text-anchor": "middle", class: "w1h-tick" }, gGrid).textContent = v; }
      if (v >= box[2] && v <= box[3]) { S("line", { x1: sx(box[0]), x2: sx(box[1]), y1: sy(v), y2: sy(v), class: "w1h-grid" }, gGrid); S("text", { x: m.l - 8, y: sy(v) + 4, "text-anchor": "end", class: "w1h-tick" }, gGrid).textContent = v; }
    });
    S("line", { x1: sx(box[0]), x2: sx(box[1]), y1: sy(box[2]), y2: sy(box[2]), class: "w1h-axis" }, gGrid);
    S("line", { x1: sx(box[0]), x2: sx(box[0]), y1: sy(box[2]), y2: sy(box[3]), class: "w1h-axis" }, gGrid);
    S("text", { x: (sx(box[0]) + sx(box[1])) / 2, y: Hh - 10, "text-anchor": "middle", class: "w1h-axlab" }, gGrid).textContent = o.xl;
    var yl = S("text", { x: 16, y: (sy(box[2]) + sy(box[3])) / 2, "text-anchor": "middle", class: "w1h-axlab", transform: "rotate(-90 16 " + (sy(box[2]) + sy(box[3])) / 2 + ")" }, gGrid);
    yl.textContent = o.yl;
    var gOut = S("g", null, svg), gReg = S("g", null, svg), gRule = S("g", null, svg), gIso = S("g", null, svg), gPt = S("g", null, svg);
    function path(P) { return P.length ? "M" + P.map(function (p) { return sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1); }).join(" L") + " Z" : ""; }
    function segment(r) {   // the rule's line inside the view
      var pts = [], a = r.a, b = r.b;
      if (Math.abs(a[1]) > 1e-12) [box[0], box[1]].forEach(function (x) { var y = (b - a[0] * x) / a[1]; if (y >= box[2] - 1e-9 && y <= box[3] + 1e-9) pts.push([x, y]); });
      if (Math.abs(a[0]) > 1e-12) [box[2], box[3]].forEach(function (y) { var x = (b - a[1] * y) / a[0]; if (x >= box[0] - 1e-9 && x <= box[1] + 1e-9) pts.push([x, y]); });
      if (pts.length < 2) return null;
      var best = [pts[0], pts[1]], d = -1;
      pts.forEach(function (p) { pts.forEach(function (q) { var dd = (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]); if (dd > d) { d = dd; best = [p, q]; } }); });
      return best;
    }
    var api = {
      svg: svg, sx: sx, sy: sy, box: box,
      clear: function () { [gOut, gReg, gRule, gIso, gPt].forEach(function (g) { g.innerHTML = ""; }); },
      region: function (rules, cls) { var P = region(rules, box); if (P.length > 2) S("path", { d: path(P), class: cls || "w1h-region" }, gReg); else if (P.length === 2) S("path", { d: path(P), class: "w1h-region-line" }, gReg); return P; },
      outside: function (r) { le(r).forEach(function (h) { var P = region([{ a: [-h.a[0], -h.a[1]], op: "<=", b: -h.b }], box); if (P.length > 2) S("path", { d: path(P), fill: "url(#" + pid + ")", class: "w1h-out" }, gOut); }); },
      rule: function (r, opt) {
        opt = opt || {}; var sg = segment(r); if (!sg) return;
        var g = S("g", { class: "w1h-rule" + (opt.cls ? " " + opt.cls : "") }, gRule);
        var A = [sx(sg[0][0]), sy(sg[0][1])], B = [sx(sg[1][0]), sy(sg[1][1])];
        S("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1] }, g);
        if (opt.label) {   // on the side the rule rules out, so the region stays clean
          if (A[1] > B[1] || (A[1] === B[1] && A[0] > B[0])) { var T = A; A = B; B = T; }   // A = top (or left) end
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
          var t1 = S("text", { x: px, y: py, "text-anchor": anchor, class: "w1h-rlab bg" }, g); t1.textContent = opt.label;
          var t2 = S("text", { x: px, y: py, "text-anchor": anchor, class: "w1h-rlab" }, g); t2.textContent = opt.label;
        }
        return g;
      },
      iso: function (c, v, label) {   // the line c·p = v (plans with the same cost)
        var sg = segment({ a: c, b: v }); if (!sg) return;
        S("line", { x1: sx(sg[0][0]), y1: sy(sg[0][1]), x2: sx(sg[1][0]), y2: sy(sg[1][1]), class: "w1h-iso" }, gIso);
        if (label) { var lo = sg[0][1] <= sg[1][1] ? sg[0] : sg[1]; var t = S("text", { x: Math.min(sx(lo[0]) + 6, W - 8), y: sy(lo[1]) - 6, class: "w1h-isolab", "text-anchor": sx(lo[0]) > W - 160 ? "end" : "start" }, gIso); t.textContent = label; }
      },
      point: function (p, opt) {
        opt = opt || {};
        var g = S("g", { class: "w1h-pt" + (opt.cls ? " " + opt.cls : "") }, gPt);
        S("circle", { cx: sx(p[0]), cy: sy(p[1]), r: opt.r || 7 }, g);
        if (opt.label) { var right = sx(p[0]) < W - 120; var t = S("text", { x: sx(p[0]) + (right ? 11 : -11), y: sy(p[1]) - 10, "text-anchor": right ? "start" : "end", class: "w1h-plab bg" }, g); t.textContent = opt.label;
          var t2 = S("text", { x: sx(p[0]) + (right ? 11 : -11), y: sy(p[1]) - 10, "text-anchor": right ? "start" : "end", class: "w1h-plab" }, g); t2.textContent = opt.label; }
        return g;
      },
      onPick: function (fn, step) {   // tap or drag on the plane: data coordinates, snapped to `step`
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
    return api;
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
  function numInput(host, o) {
    var id = LX.uid("in"), row = H("div", { class: "w1h-ans" }, host);
    H("label", { for: id, text: o.label }, row);
    var inp = H("input", { id: id, type: "text", inputmode: "decimal", autocomplete: "off", class: "w1h-num", "aria-describedby": o.unit ? null : null }, row);
    if (o.unit) H("span", { class: "w1h-unit", text: o.unit }, row);
    var btn = H("button", { type: "button", class: "lx-btn small", text: o.button || "Check" }, row);
    function go() { var v = parseFloat(String(inp.value).replace(/[−–]/g, "-").replace(/,/g, "")); o.onCheck(isNaN(v) ? null : v, inp); }
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    return { input: inp, button: btn };
  }
  function textAlt(host, title, items) {
    var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title }, d);
    var ul = H("ul", null, d); items.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    return d;
  }

  function view(live, data, root) {
    var s = story(data.town, data.town_year), D = s.D;
    var cover = s.cover, lim = s.limits;
    var steps = [];
    var hh = (s.t < 10 ? "0" : "") + s.t + ":00";
    var done = {};
    LX.store.set("k4-story", { need: s.need, reach: s.reach });

    // ---- step 1: an equation is a balance
    steps.push({
      text: "Prairie Town at " + hh + " on " + D.dateLabel + ": demand " + s.demand + " MW. Nuclear makes " + s.nuclear + " MW, wind " + s.wind + " and solar " + s.solar + ". Gas covers the rest. Solve for g.",
      build: function (act, api) {
        H("p", { class: "k4-eq", html: s.nuclear + " + " + s.wind + " + " + s.solar + " + <i>g</i> = " + s.demand }, act);
        var tries = 0;
        numInput(act, { label: "g =", unit: "MW", onCheck: function (v) {
          tries++;
          if (v === s.need) { api.done(); api.saw("g = " + s.demand + " − " + s.nuclear + " − " + s.wind + " − " + s.solar + " = " + s.need + " MW. Do the same to both sides and the balance holds."); }
          else api.saw(tries < 2 ? "Not yet. Take the known parts away from both sides." : "Subtract each known part from " + s.demand + ": " + s.demand + " − " + s.nuclear + " − " + s.wind + " − " + s.solar + ".", true);
        } });
      }
    });

    // ---- step 2: two unknowns, a line of answers
    steps.push({
      text: "Gas comes from two plants: x MW from the combined-cycle plant and y MW from the peaker, with x + y = " + s.need + ". Slide x and watch y follow.",
      build: function (act, api) {
        var pl = Plane(act, { view: s.view, ticks: [0, 40, 80, 120, 160], xl: "x: combined-cycle plant, MW", yl: "y: peaker, MW",
                              aria: "Plans x and y with x + y = " + s.need + ": every answer lies on one straight line." });
        var seen = {}, sl = LX.Slider(act, { label: "x, combined-cycle", color: "var(--lx-cc)", max: s.need, step: 5, onChange: draw });
        sl.set(60);
        function draw(x) {
          x = x == null ? sl.val() : x; var y = s.need - x; seen[x] = 1;
          pl.clear(); pl.rule({ a: [1, 1], op: "=", b: s.need }, { label: "x + y = " + s.need, cls: "on" });
          Object.keys(seen).forEach(function (k) { pl.point([+k, s.need - k], { r: 4, cls: "trail" }); });
          pl.point([x, y], { label: "x = " + x + ", y = " + y });
          if (Object.keys(seen).length >= 4) { api.done(); api.saw("One equation with two unknowns has a whole line of answers, from (0, " + s.need + ") to (" + s.need + ", 0). More rules, or a goal, must pick one."); }
        }
        draw(60);
        textAlt(act, "Text version", ["The line x + y = " + s.need + " runs from x = 0, y = " + s.need + " to x = " + s.need + ", y = 0.", "Each slider position is one answer; every answer lies on the line."]);
      }
    });

    // ---- step 3: words to signs
    var PHRASES = [
      ["The combined-cycle plant makes at most " + s.ccMax + " MW.", 0],
      ["Gas must cover at least " + s.need + " MW.", 1],
      ["It can rise no more than " + s.ramp + " MW in one hour.", 0],
      ["Nuclear runs at exactly " + s.nuclear + " MW all day.", 2],
      ["A plant's output must not fall below 0 MW.", 1]];
    steps.push({
      text: "Rules arrive as words. Pick the sign each sentence means: ≤ (at most), ≥ (at least) or = (exactly).",
      build: function (act, api) {
        var right = {}, list = H("div", { class: "k4-words" }, act);
        PHRASES.forEach(function (p, i) {
          var row = H("div", { class: "k4-word" }, list); H("p", { text: p[0] }, row);
          var mark = H("span", { class: "k4-mark", "aria-live": "polite" }, row);
          seg(row, ["≤", "≥", "="], -1, function (k) {
            right[i] = k === p[1]; mark.textContent = right[i] ? "Right" : "Not quite"; mark.className = "k4-mark " + (right[i] ? "good" : "bad");
            if (PHRASES.every(function (q, j) { return right[j]; })) { api.done(); api.saw("At most is ≤, at least is ≥, exactly is =. “Must not fall below 0” is ≥ too: a floor rather than a ceiling."); }
          }, "Sign for: " + p[0]);
        });
      }
    });

    // ---- step 4: an inequality is a half-plane
    steps.push({
      text: "An [[inequality|inequality]] keeps a whole side of its line. Switch the sign of the " + s.need + " MW rule, then move the test plan across the line.",
      build: function (act, api) {
        var op = ">=", tried = {}, moved = 0;
        var top = H("div", { class: "k4-ctl" }, act);
        H("span", { class: "k4-lab", text: "x + y" }, top);
        seg(top, ["≤", "=", "≥"], 2, function (i) { op = ["<=", "=", ">="][i]; tried[op] = 1; draw(); }, "Sign of the rule");
        H("span", { class: "k4-lab", text: String(s.need) }, top);
        var pl = Plane(act, { view: s.view, ticks: [0, 40, 80, 120, 160], xl: "x: combined-cycle plant, MW", yl: "y: peaker, MW", aria: "The rule x + y and a test plan." });
        var out = H("p", { class: "k4-test", "aria-live": "polite" }, act);
        var p = [40, 40];
        var sx = LX.Slider(act, { label: "Test plan x", color: "var(--lx-cc)", max: 160, step: 5, onChange: function (v) { p[0] = v; moved++; draw(); } });
        var sy = LX.Slider(act, { label: "Test plan y", color: "var(--lx-pk)", max: 160, step: 5, onChange: function (v) { p[1] = v; moved++; draw(); } });
        sx.set(p[0]); sy.set(p[1]);
        pl.onPick(function (q) { p = q; sx.set(q[0]); sy.set(q[1]); moved++; draw(); });
        function draw() {
          var r = { a: [1, 1], op: op, b: s.need }, ok = holds(r, p);
          pl.clear(); pl.region([r, { a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }]); pl.rule(r, { label: fmtRule(r), cls: "on" });
          pl.point(p, { cls: ok ? "good" : "bad", label: ok ? "passes" : "fails" });
          out.innerHTML = "Test plan: x + y = " + p[0] + " + " + p[1] + " = <b>" + (p[0] + p[1]) + "</b>. Is that " + OPS[op] + " " + s.need + "? <b>" + (ok ? "Yes: it passes." : "No: it fails.") + "</b>";
          if (tried["<="] && tried[">="] && moved >= 1) { api.done(); api.saw("With ≥ the plans on the far side of the line pass; with ≤ the near side; with = only the line itself. The line always belongs to ≤ and ≥."); }
        }
        draw();
        textAlt(act, "Text version", ["The line x + y = " + s.need + " splits the plane in two.", "x + y ≥ " + s.need + " keeps the side away from the origin, x + y ≤ " + s.need + " the side with the origin, and = keeps only the line."]);
      }
    });

    // ---- step 5: multiply by a negative and flip
    var FORMS = [
      { r: { a: [-1, -1], op: "<=", b: -s.need }, ok: true, why: "Multiplying by −1 flips ≥ into ≤: the same plans pass." },
      { r: { a: [-1, -1], op: ">=", b: -s.need }, ok: false, why: "The sign did not flip, so this keeps the other side." },
      { r: { a: [1, 1], op: "<=", b: s.need }, ok: false, why: "Only the sign changed: this is the opposite rule." },
      { r: { a: [-1, -1], op: "<=", b: s.need }, ok: false, why: "The right-hand side must be multiplied by −1 too." }];
    steps.push({
      text: "Solvers store every rule one way round, as ≤. Multiplying both sides by a negative number flips the sign. Which line is the same rule as x + y ≥ " + s.need + "?",
      build: function (act, api) {
        var pl = null, row = H("div", { class: "lx-choices-row k4-forms", role: "group", "aria-label": "Candidate forms" }, act), btns = [];
        FORMS.forEach(function (F, i) {
          var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: fmtRule(F.r) }, row);
          b.addEventListener("click", function () {
            btns.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); x.classList.toggle("right", j === i && F.ok); x.classList.toggle("wrong", j === i && !F.ok); });
            draw(F.r);
            if (F.ok) { api.done(); api.saw("−x − y ≤ −" + s.need + " keeps exactly the same side. Multiply by −1 again and you are back at x + y ≥ " + s.need + "."); }
            else api.saw(F.why, true);
          });
          btns.push(b);
        });
        pl = Plane(act, { view: s.view, ticks: [0, 40, 80, 120, 160], xl: "x: combined-cycle plant, MW", yl: "y: peaker, MW", aria: "The original rule and the chosen form, shaded." });
        function draw(r) {
          pl.clear();
          var nn = [{ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }];
          pl.region([cover].concat(nn), "w1h-region ghost"); pl.rule(cover, { label: "x + y ≥ " + s.need });
          if (r) { pl.region([r].concat(nn), "w1h-region pick"); }
        }
        draw(null);
      }
    });

    // ---- step 6: several rules at once
    steps.push({
      text: "A model's rules all hold at once. Switch on the plant limits: the plans that pass every rule form the [[feasible-region|feasible region]].",
      build: function (act, api) {
        var on = { cover: true };
        var chips = H("div", { class: "k4-chips", role: "group", "aria-label": "Rules" }, act);
        var LIM = [[lim[0], "x ≤ " + s.reach + " (ramp: " + s.prevCC + " + " + s.ramp + ")"], [lim[1], "y ≤ " + s.pkMax + " (peaker size)"], [lim[2], "x ≥ 0"], [lim[3], "y ≥ 0"]];
        LIM.forEach(function (L) {
          var b = H("button", { type: "button", class: "lx-chip", "aria-pressed": "false" }, chips); H("i", { style: "--c:var(--lx-accent)" }, b); H("span", { text: L[1] }, b);
          b.addEventListener("click", function () { on[L[0].key] = !on[L[0].key]; b.setAttribute("aria-pressed", on[L[0].key] ? "true" : "false"); draw(); });
        });
        var pl = Plane(act, { view: s.view, ticks: [0, 40, 80, 120, 160], xl: "x: combined-cycle plant, MW", yl: "y: peaker, MW", aria: "Rules switched on and the region that passes them all." });
        var out = H("p", { class: "k4-test", "aria-live": "polite" }, act);
        function draw() {
          var rules = [cover].concat(lim.filter(function (r) { return on[r.key]; }));
          pl.clear(); var P = pl.region(rules);
          rules.forEach(function (r) { pl.rule(r, { label: r.b === 0 ? null : fmtRule(r), cls: "on" }); });
          var all = lim.every(function (r) { return on[r.key]; });
          out.textContent = all ? "Every rule is on: the feasible region is a triangle." : (rules.length - 1) + " of " + lim.length + " limits on.";
          if (all) {
            s.triangle.forEach(function (v) { pl.point(v, { r: 5, label: "(" + v[0] + ", " + v[1] + ")" }); });
            api.done(); api.saw("The plans that pass every rule form a triangle with corners " + s.triangle.map(function (v) { return "(" + v[0] + ", " + v[1] + ")"; }).join(", ") + ". In B1 you find its cheapest corner.");
          }
          return P;
        }
        draw();
        textAlt(act, "Text version", ["Rules: x + y ≥ " + s.need + ", x ≤ " + s.reach + ", y ≤ " + s.pkMax + ", x ≥ 0, y ≥ 0.", "With all of them on, the plans that pass form a triangle with corners " + s.triangle.map(function (v) { return "(" + v[0] + ", " + v[1] + ")"; }).join(", ") + "."]);
      }
    });

    var cards = LX.StepCards(live, { id: "k4-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    root.lxDemo = function (state) {   // screenshots: "mid" = step 4 with a test plan, "region" = step 6
      var k = state === "region" ? 5 : 3; cards.go(k);
      if (state === "region") live.querySelectorAll(".k4-chips .lx-chip").forEach(function (b) { b.click(); });
      return { view: "step " + (k + 1) };
    };

    explain(s);
    drillView(D);
  }

  function explain(s) {
    var x = document.getElementById("k4-explain"); if (!x) return; x.innerHTML = "";
    LX.CompareTable(H("div", { class: "lx-xcard w1h-stack" }, x), {
      title: "Equation or inequality?",
      columns: [{ key: "name", label: "Sign", main: true }, { key: "words", label: "In words" }, { key: "pic", label: "On the plane", phoneHide: true }, { key: "model", label: "In a model" }],
      rows: [
        { key: "eq", color: "var(--lx-ink)", name: "=", note: "equation", words: "exactly", pic: "the line only", model: "balance: supply equals demand" },
        { key: "le", color: "var(--lx-accent)", name: "≤ or ≥", note: "inequality", words: "at most, at least", pic: "the line and one side", model: "limits: plant size, ramp, budgets" },
        { key: "lt", color: "var(--lx-ink-3)", name: "< or >", note: "strict", words: "less than, more than", pic: "one side, without the line", model: "avoided: a best plan may not exist" }]
    });
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "Solve a linear inequality", lede: "The same moves as an equation, with one extra question. Trace two examples.",
      nodes: {
        start: { t: "a·x + m ≤ n", s: "one unknown", k: "end" },
        move: { t: "Move m across", s: "a·x ≤ n − m" },
        q: { t: "Is a negative?", tN: ["Is a", "negative?"], k: "q" },
        flip: { t: "Divide by a, flip", s: "x ≥ (n − m) / a", sN: "x ≥ (n − m)/a" },
        keep: { t: "Divide by a", s: "x ≤ (n − m) / a", sN: "x ≤ (n − m)/a" },
        end: { t: "Check one value", k: "end" }
      },
      cols: 3, at: { start: [1, 0], move: [1, 1], q: [1, 2], flip: [0, 3], keep: [2, 3], end: [1, 4] },
      colsN: 2, atN: { start: [0.5, 0], move: [0.5, 1], q: [0.5, 2], flip: [0, 3], keep: [1, 3], end: [0.5, 4] },
      edges: [["start", "move"], ["move", "q"], ["q", "flip", "yes"], ["q", "keep", "no"], ["flip", "end", null, { v: true }], ["keep", "end", null, { v: true }]],
      traces: [{ label: "2x + 10 ≤ 50", path: ["start", "move", "q", "keep", "end"], text: "**2x ≤ 40, so x ≤ 20.** Check x = 10: 2 × 10 + 10 = 30 ≤ 50." },
               { label: "−2x ≤ 6", path: ["start", "move", "q", "flip", "end"], text: "**Divide by −2 and flip: x ≥ −3.** Check x = 0: −2 × 0 = 0 ≤ 6." }],
      sel: 1
    });
  }

  // ---- practice drill: a seeded stream of short items with instant feedback (this browser only)
  function drillView(D) {
    var host = document.getElementById("k4-drill"); if (!host) return; host.innerHTML = "";
    var seed = (Date.now() % 100000) + 1, r = rng(seed), k = 0, right = 0, done = 0;
    var card = H("div", { class: "lx-card k4-drill" }, host);
    var top = H("div", { class: "lx-x-head" }, card); H("h3", { text: "Practice drill" }, top);
    var score = H("span", { class: "lx-step-n", "aria-live": "polite", text: "0 done" }, top);
    H("p", { class: "lx-hint", text: "Five kinds of item in rotation, new numbers each time. Aim for ten in a row." }, card);
    var box = H("div", { class: "k4-drill-q" }, card);
    var next = H("button", { type: "button", class: "lx-btn ghost small", html: "Next item" + LX.icon("arrow") }, card);
    function show() {
      var it = drillItem(D, k, r); k++; box.innerHTML = "";
      H("p", { class: "lx-qtext", text: it.q }, box);
      var fb = H("div", { "aria-live": "polite" }, box), answered = false;
      function mark(ok) {
        if (answered) return; answered = true; done++; if (ok) right++;
        score.textContent = right + " of " + done + " right";
        fb.innerHTML = ""; H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + LX.esc(it.why) + "</div>" }, fb);
      }
      if (it.choices) {
        var row = H("div", { class: "lx-qbtns" }, box);
        it.choices.forEach(function (c, i) { var b = H("button", { type: "button", class: "lx-choice", text: c }, row); b.addEventListener("click", function () { if (!answered) { b.classList.add(i === it.answer ? "right" : "wrong"); mark(i === it.answer); } }); });
        box.insertBefore(row, fb);
      } else {
        var n = numInput(box, { label: "Answer", unit: it.unit || "", onCheck: function (v) { mark(v === it.answer); } });
        box.insertBefore(n.input.parentNode, fb);
      }
    }
    next.addEventListener("click", show);
    show();
  }

  LX.mount("k04", function (live, data, root) { view(live, data, root); });
})();
