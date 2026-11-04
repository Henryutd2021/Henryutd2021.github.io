// k06-vectors-matrices.js — Toolbox K6, "Vectors and matrices: what Ax ≤ b means" (step cards, Learn W3, 2026-11-03).
//
// A refresher for the lessons that write a model as arrays: lesson 10 (one hour as a linear program), lesson 11 (a day
// solved by HiGHS) and B1 (the same model as A x ≤ b). Seven cards of one idea and one action each, an explain layer and
// a practice drill.
//
// Data (read through data-src, so the hour is lesson 10's exactly): assets/learn/data/10-write-it-down.json (the hour,
// 19:00, and the CO2 cap, 100 t, illustrative), town.json (Prairie Town's fleet and costs, illustrative) and
// town_year.json (real 2025 SPP shapes from EIA-930). dayOf() is lesson 10's (and lesson 0's) slicing and rounding of
// lesson 0's day, 3 September 2025; the test checks it against assets/learn/10-write-it-down.js.
//
// Model (no solver; a toy model of one hour, as lesson 10's chart):
//   decisions   x = (x₁, x₂): combined-cycle output and peaker output at 19:00, MW, each at least 0 (the sliders stop at
//               0; the four rows do not check it). Each output runs one hour, so MW × 1 h = MWh. Lessons 10 and B1 call
//               the two outputs x and y; here they are x₁ and x₂, so that x names the whole plan
//   costs       c = (40, 100) $/MWh (2025 dollars, illustrative);  cost c · x = c₁x₁ + c₂x₂  (B1 writes it cᵀx)
//   rules       A = [[1, 1], [1, 0], [0, 1], [0.37, 0.55]], with b = (145, 150, 100, 100) and the signs (≥, ≤, ≤, ≤):
//               cover the 145 MW gas must supply, each plant's size, the hour's CO2 cap (t CO2 per MWh × MWh). The cover
//               rule asks for at least 145 MW: extra gas would be spilled as wind and sun, at most 86 MW at 19:00, a limit
//               this toy model leaves out (lesson 10 says the same); step 6's example plan stays within it
//   A x         the vector of each row's dot product with x: the left-hand side of every rule at once
//   A x ≤ b     every row checked at once; the ≥ row enters as its negative, −x − y ≤ −145 (as in B1)
//   size        A has m rows (rules) and n columns (decisions): 4 × 2 here. Lesson 11's day, as its solver stores it, is
//               72 × 96 with 190 non-zero entries: 24 equality rows (balance), 48 one-sided rows (ramps), and the plants'
//               sizes as variable bounds, not rows. Written strictly as A x ≤ b, each equality becomes two rows: 96 rows
//               and 286 non-zero entries (bounds still apart). The test counts both from assets/learn/11-solver.js
// Every number the page states comes from this model or the data files; _tests/learn/test_k06-vectors-matrices.js checks
// them, and writes the no-JS table (--write).
(function () {
  "use strict";
  var NA = (typeof window !== "undefined" && window.LX && window.LX.NumAnswer) || require("./components/numanswer.js");
  var DR = (typeof window !== "undefined" && window.LX && window.LX.Drill) || require("./components/drill.js");

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var HOURS = 24;
  // lesson 0's day, cut and rounded as lessons 0 and 10 do (grid-operator.js prepare(), 10-write-it-down.js dayOf())
  function dayOf(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet, step = sc.step;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0), need = [], spill = [];
    for (var t = 0; t < HOURS; t++) {
      var w = Math.round(year.wind[i + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i + t] / 1000 * f.solar.mw);
      need.push(Math.round((year.demand[i + t] / 1000 * sc.demandPeakMW - f.nuclear.mw - w - s) / step) * step);
      spill.push(w + s);   // the wind and sun that extra gas would push out (lesson 10: 86 MW at 19:00)
    }
    return { date: sc.date, dateLabel: sc.dateLabel, need: need, spill: spill };
  }
  function dot(a, x) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * x[i]; return s; }
  function matvec(A, x) { return A.map(function (row) { return dot(row, x); }); }
  function round(v, d) { var k = Math.pow(10, d == null ? 6 : d); return Math.round(v * k) / k; }
  // the hour as arrays: rows with their names, signs and limits
  function hour(town, year, D10) {
    var f = town.fleet, day = dayOf(town, year), h = D10.hour, need = day.need[h];
    var rows = [
      { key: "cover", name: "Cover", a: [1, 1], op: ">=", b: need, words: "the gas plants supply at least " + need + " MW (any extra is spilled as wind and sun)" },
      { key: "cc", name: "Combined-cycle size", a: [1, 0], op: "<=", b: f.cc.mw, words: "the combined-cycle plant makes at most " + f.cc.mw + " MW" },
      { key: "pk", name: "Peaker size", a: [0, 1], op: "<=", b: f.peaker.mw, words: "the peaker makes at most " + f.peaker.mw + " MW" },
      { key: "co2", name: "CO₂ cap", a: [f.cc.co2, f.peaker.co2], op: "<=", b: D10.cap, words: "the hour emits at most " + D10.cap + " t of CO₂" }];
    return { hour: h, date: day.dateLabel, need: need, spill: day.spill[h], c: [f.cc.cost, f.peaker.cost], rows: rows, A: rows.map(function (r) { return r.a; }), b: rows.map(function (r) { return r.b; }), ops: rows.map(function (r) { return r.op; }) };
  }
  // A x ≤ b: the ≥ rows multiplied by −1
  function leForm(M) {
    return { A: M.rows.map(function (r) { return r.op === ">=" ? r.a.map(function (v) { return -v + 0; }) : r.a.slice(); }), b: M.rows.map(function (r) { return r.op === ">=" ? -r.b : r.b; }) };
  }
  // check a plan row by row: left side, sign, limit, pass (with a small allowance for rounding)
  function check(M, x) {
    return M.rows.map(function (r) {
      var lhs = round(dot(r.a, x), 6), pass = r.op === ">=" ? lhs >= r.b - 1e-9 : r.op === "<=" ? lhs <= r.b + 1e-9 : Math.abs(lhs - r.b) < 1e-9;
      return { key: r.key, lhs: lhs, op: r.op, b: r.b, pass: pass };
    });
  }
  function onlyFails(M, x, key) { var c = check(M, x); return c.filter(function (r) { return !r.pass; }).map(function (r) { return r.key; }).join() === key; }
  var OPS = { "<=": "≤", ">=": "≥", "=": "=" };
  function fmt(v) { return (v < 0 ? "−" : "") + Math.abs(round(v, 4)).toLocaleString("en-US", { maximumFractionDigits: 4 }); }
  function vec(v) { return "(" + v.map(fmt).join(", ") + ")"; }
  function usd(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  var X1 = "x₁", X2 = "x₂";
  // a row of A spoken in full (the matrix rows are buttons; their names carry every number the row shows and its unit)
  function rowSpeech(r, i, st) {
    var le = st.le && r.op === ">=", a = le ? r.a.map(function (v) { return -v; }) : r.a, op = st.le ? "<=" : r.op, b = le ? -r.b : r.b;
    var u = r.key === "co2" ? "t of CO₂" : "MW", t = r.name + " row: " + fmt(a[0]) + " times " + X1 + " plus " + fmt(a[1]) + " times " + X2;
    if (st.ax) t += st.ax[i] == null ? ", not worked out yet" : ", A x = " + fmt(le ? -st.ax[i] : st.ax[i]) + " " + u;
    if (st.b) t += ", " + (op === "<=" ? "at most " : op === ">=" ? "at least " : "equal to ") + fmt(b) + " " + u;
    if (st.check) t += ", " + (st.check[i].pass ? "passes" : "fails");
    return t + ".";
  }

  // the page's story numbers
  function story(town, year, D10) {
    var M = hour(town, year, D10), s = { M: M };
    s.plan = [100, 45]; s.swap = [45, 100];
    s.cost = dot(M.c, s.plan); s.costSwap = dot(M.c, s.swap);
    s.Ax = matvec(M.A, s.plan); s.co2 = s.Ax[3];
    s.le = leForm(M); s.leAx = matvec(s.le.A, s.plan);
    s.best = [M.need, 0]; s.bestCost = dot(M.c, s.best); s.bestAx = matvec(M.A, s.best);
    s.co2Max = dot(M.rows[3].a, [M.rows[1].b, M.rows[2].b]);   // the most CO2 the two plants can emit in the hour
    // step 6's example: the peaker full and the combined-cycle as high as the spill limit allows, on the 5 MW grid
    s.target = [Math.floor((M.need + M.spill - M.rows[2].b) / 5) * 5, M.rows[2].b];
    s.targetCo2 = dot(M.rows[3].a, s.target); s.targetExtra = s.target[0] + s.target[1] - M.need;
    // lesson 11's day as its solver stores it (equality rows kept, sizes as bounds), and written strictly as A x ≤ b
    s.l11 = { rows: 72, cols: 96, nz: 190, eq: 24, leRows: 96, leNz: 286 };   // checked by the test against 11-solver.js
    s.l11.cells = s.l11.rows * s.l11.cols; s.l11.share = s.l11.nz / s.l11.cells;
    return s;
  }
  // the messages the cards print (pure, so the test can recompute each calculation from the operands it shows)
  function texts(s) {
    var M = s.M, c = M.c, x = s.plan, r4 = M.rows[3].a;
    return {
      plan: "x = " + vec(x) + ": " + X1 + " = " + x[0] + " MW from the [[combined-cycle|combined-cycle plant]], " + X2 + " = " + x[1] + " from the [[peaker|peaker]]. " + vec(s.swap) + " is a different plan: in a vector, the order is the meaning.",
      hour: "Each output runs one hour: " + x[0] + " MW × 1 h = " + x[0] + " MWh, so dollars per MWh times MW gives dollars for the hour.",
      cost: "c · x = " + c[0] + " × " + x[0] + " + " + c[1] + " × " + x[1] + " = " + s.cost.toLocaleString("en-US") + " dollars for the hour: multiply in pairs, then add.",
      costHint: "Not yet. Multiply the first entries, then the second ones, and add: " + c[0] + " × " + x[0] + " + " + c[1] + " × " + x[1] + ".",
      rows: "Each row of A holds one rule's numbers, one column per decision. A 1 means the decision counts fully, a 0 that it is not in the rule.",
      co2: r4[0] + " × " + x[0] + " + " + r4[1] + " × " + x[1] + " = " + fmt(s.co2) + " t. Every row at once: A x = " + vec(s.Ax) + ", one number per rule.",
      co2Hint: "Not yet. Use the CO₂ row, (" + r4[0] + ", " + r4[1] + "), with x = " + vec(x) + ": multiply in pairs and add.",
      flip: "Multiplying by −1 turns " + X1 + " + " + X2 + " ≥ " + M.need + " into −" + X1 + " − " + X2 + " ≤ −" + M.need + ": the same plans pass, and now every row reads ≤.",
      // a plan that fails only the CO2 row always makes more than the 145 MW: say where the extra goes, or that this toy
      // model lets it pass beyond the 86 MW of wind and sun that could be spilled
      fail: function (x2) {
        var co = dot(r4, x2), extra = x2[0] + x2[1] - M.need;
        return "x = " + vec(x2) + " passes cover and both sizes but emits " + fmt(co) + " t: only the CO₂ row fails. " +
          (extra <= M.spill ? "Its " + extra + " MW extra would be spilled as wind and sun (lesson 10)." : "Its " + extra + " MW extra exceeds the " + M.spill + " MW that could be spilled, a limit left out here.");
      },
      nonneg: "Outputs cannot be negative, " + X1 + " ≥ 0 and " + X2 + " ≥ 0: the sliders stop at 0, so the four rows are the rules left to check.",
      size: "Lesson 11's day has 4 decisions in each of 24 hours, so " + s.l11.cols + " columns, and " + s.l11.rows + " rules, " + s.l11.eq + " of them equalities. In that form only " + s.l11.nz + " of its " + s.l11.cells.toLocaleString("en-US") + " entries are not zero."
    };
  }
  // the seven cards' prompts (pure, so the test can check each is one or two sentences within the text budget)
  function prompts(s) {
    var M = s.M, x = s.plan;
    return [
      "At 19:00 on lesson 0's day, Prairie Town's gas plants must supply " + M.need + " MW, and a plan is a [[vector|vector]], an ordered list x = (" + X1 + ", " + X2 + "). Set the plan (" + x[0] + ", " + x[1] + ").",
      "Costs form a vector too, c = (" + M.c[0] + ", " + M.c[1] + ") dollars per MWh. The [[dot-product|dot product]] c · x multiplies in pairs and adds: what does the plan cost for the hour?",
      "The four rules of lesson 10's hour stack into a [[matrix|matrix]] A: one row per rule, one column per decision. Tap each row to read it as a rule.",
      "A x takes every row's dot product with x, one number per rule, and three are done for x = (" + x[0] + ", " + x[1] + "). Work out the CO₂ row, in t.",
      "[[solver|Solvers]] often want every row as ≤ (lesson B1), but the cover rule says ≥. Multiply its row and its limit by −1, and the sign flips.",
      "Now A x ≤ b checks all four rules at once. Move the plan until only the CO₂ row fails: enough gas, both plants within size, too much CO₂.",
      "A has m rows (rules) and n columns (decisions), " + M.rows.length + " × " + M.c.length + " here. Lesson 11 solves a day with four decisions in each of 24 hours: how many columns has its A?"];
  }
  // the explain layer's "Your numbers" (pure): every value in the ≤ form of step 5, as the equation shows it, with the
  // original signs named apart
  function explainVals(s, p, own) {
    var M = s.M, le = leForm(M), head = own ? "Your last plan, x = " + vec(p) + ": " : "The plan x = " + vec(p) + ": ";
    return {
      x: head + X1 + " = " + p[0] + " MW and " + X2 + " = " + p[1] + " MW, each at least 0.",
      A: "Lesson 10's hour: 4 rows × 2 columns. In the ≤ form the cover row is " + vec(le.A[0]) + ", its original " + vec(M.rows[0].a) + " times −1.",
      Ax: head + "A x = " + vec(matvec(le.A, p)) + " in the ≤ form. Before the flip, the cover entry is " + fmt(matvec(M.A, p)[0]) + ".",
      b: "Lesson 10's hour: b = " + vec(le.b) + " in the ≤ form. Before the flip, the cover limit is " + fmt(M.rows[0].b) + ", with ≥.",
      c: head + "c · x = " + usd(dot(M.c, p)) + " for the hour."
    };
  }
  // the no-JS table: A, the plan's A x, and b (written into the page by the test)
  function staticBlocks(s) {
    var M = s.M, rows = M.rows.map(function (r, i) {
      return "<tr><td>" + r.name + "</td><td>" + fmt(r.a[0]) + "</td><td>" + fmt(r.a[1]) + "</td><td>" + fmt(s.Ax[i]) + "</td><td>" + OPS[r.op] + " " + fmt(r.b) + "</td><td>" + (check(M, s.plan)[i].pass ? "passes" : "fails") + "</td></tr>";
    }).join("\n");
    return { table: '<table class="k6-static" aria-label="The rules of lesson 10\'s hour as a matrix, checked for the plan x = ' + vec(s.plan) + '">\n' +
      '<thead><tr><th scope="col">Row (rule)</th><th scope="col">Column 1: ' + X1 + '</th><th scope="col">Column 2: ' + X2 + '</th><th scope="col">A x at ' + vec(s.plan) + '</th><th scope="col">Limit b</th><th scope="col">Check</th></tr></thead>\n<tbody>\n' + rows + "\n</tbody></table>" };
  }

  // ---------------------------------------------------------------- practice drill items (seeded by LX.Drill)
  var KINDS = ["dot", "row", "pass", "flip", "size", "matvec"];
  function drillItem(k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (a) { return a[Math.floor(r() * a.length)]; };
    if (kind === "dot") {
      var c = [pick([20, 30, 40, 50]), pick([60, 80, 100, 120])], x = [pick([10, 20, 50, 80, 120]), pick([0, 15, 30, 45])], v = dot(c, x);
      return { kind: kind, q: "Costs c = " + vec(c) + " $/MWh and a plan x = " + vec(x) + " MW for one hour. What is c · x, in dollars?", answer: v, tol: 0.5, unit: "$",
               why: c[0] + " × " + x[0] + " + " + c[1] + " × " + x[1] + " = " + v.toLocaleString("en-US") + "." };
    }
    if (kind === "row") {
      var a = [pick([0.3, 0.37, 0.4, 0.5]), pick([0.55, 0.6, 0.8, 1])], x2 = [pick([20, 40, 60, 100]), pick([10, 25, 50])], v2 = round(dot(a, x2), 4);
      return { kind: kind, q: "A row of A is " + vec(a) + " (t CO₂ per MWh) and x = " + vec(x2) + " MW for one hour. That row of A x, in t?", answer: v2, tol: 0.005, unit: "t",
               why: a[0] + " × " + x2[0] + " + " + a[1] + " × " + x2[1] + " = " + fmt(v2) + "." };
    }
    if (kind === "pass") {
      var a3 = [pick([1, 2, 3]), pick([1, 2, 4])], x3 = [pick([10, 20, 30]), pick([5, 15, 25])], lhs = dot(a3, x3), b3 = lhs + pick([-10, -5, 5, 10]), ge = pick([true, false]);
      var ok = ge ? lhs >= b3 : lhs <= b3;
      return { kind: kind, q: "Rule: " + a3[0] + X1 + " + " + a3[1] + X2 + " " + (ge ? "≥" : "≤") + " " + b3 + ". Does the plan x = " + vec(x3) + " pass it?", choices: ["It passes", "It fails"], answer: ok ? 0 : 1,
               why: a3[0] + " × " + x3[0] + " + " + a3[1] + " × " + x3[1] + " = " + lhs + ", which is " + (ok ? "" : "not ") + (ge ? "at least " : "at most ") + b3 + "." };
    }
    if (kind === "flip") {
      var p = pick([1, 2, 3]), q = pick([1, 2, 5]), b4 = pick([30, 60, 145]);
      var right = "(" + "−" + p + ", " + "−" + q + ") with limit −" + b4;
      var opts = [right, "(" + p + ", " + q + ") with limit " + b4, "(−" + p + ", −" + q + ") with limit " + b4, "(" + p + ", " + q + ") with limit −" + b4];
      var order = opts.map(function (o) { return [r(), o]; }).sort(function (u, w) { return u[0] - w[0]; }).map(function (z) { return z[1]; });
      return { kind: kind, q: "Write " + p + X1 + " + " + q + X2 + " ≥ " + b4 + " as a row of A x ≤ b. Which row and limit?", choices: order, answer: order.indexOf(right),
               why: "Multiply both sides by −1 and the sign flips: −" + p + X1 + " − " + q + X2 + " ≤ −" + b4 + "." };
    }
    if (kind === "size") {
      var hrs = pick([1, 24, 168]), dec = pick([2, 3, 4]), rul = pick([1, 2, 3]), rowsN = hrs * rul, colsN = hrs * dec;
      var o2 = [[rowsN, colsN], [colsN, rowsN], [rul, dec], [rowsN, colsN + hrs]].map(function (m) { return m[0].toLocaleString("en-US") + " rows × " + m[1].toLocaleString("en-US") + " columns"; });
      o2 = o2.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      var ord = o2.map(function (o) { return [r(), o]; }).sort(function (u, w) { return u[0] - w[0]; }).map(function (z) { return z[1]; }), ans = rowsN.toLocaleString("en-US") + " rows × " + colsN.toLocaleString("en-US") + " columns";
      return { kind: kind, q: "A model has " + dec + " decisions and " + rul + " rule" + (rul > 1 ? "s" : "") + " in each of " + hrs + " hour" + (hrs > 1 ? "s" : "") + ". How big is its A?", choices: ord, answer: ord.indexOf(ans),
               why: "One row per rule and one column per decision: " + hrs + " × " + rul + " = " + rowsN.toLocaleString("en-US") + " rows, " + hrs + " × " + dec + " = " + colsN.toLocaleString("en-US") + " columns." };
    }
    var A = [[pick([1, 2]), pick([0, 1, 3])], [pick([0, 1]), pick([2, 4, 5])]], x5 = [pick([2, 5, 10]), pick([1, 3, 6])], which = pick([0, 1]), v5 = dot(A[which], x5);
    return { kind: "matvec", q: "A = [" + vec(A[0]) + ", " + vec(A[1]) + "] (two rows) and x = " + vec(x5) + ". What is entry " + (which + 1) + " of A x?", answer: v5, tol: 0.001,
             why: "Row " + (which + 1) + " times x: " + A[which][0] + " × " + x5[0] + " + " + A[which][1] + " × " + x5[1] + " = " + v5 + "." };
  }
  function drill(seed, n) { return DR.series(drillItem, seed, n); }

  var model = { HOURS: HOURS, dayOf: dayOf, dot: dot, matvec: matvec, hour: hour, leForm: leForm, check: check, onlyFails: onlyFails, OPS: OPS, fmt: fmt, vec: vec, usd: usd,
                rowSpeech: rowSpeech, story: story, texts: texts, prompts: prompts, explainVals: explainVals, staticBlocks: staticBlocks, KINDS: KINDS, drillItem: drillItem, drill: drill, close: NA.close };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, VIEW = [0, 160, 0, 120], TICKS = [0, 40, 80, 120, 160];
  function readouts(host, labels) {
    var box = H("div", { class: "lx-readouts", "aria-live": "polite" }, host), out = {};
    labels.forEach(function (l) { var d = H("div", { class: "lx-readout" }, box); H("span", { text: l[1] }, d); out[l[0]] = H("b", null, d); });
    return out;
  }
  function plane(host, aria) { return LX.LPPlane(host, { view: VIEW, ticks: TICKS, xLabel: X1 + ": combined-cycle plant, MW", yLabel: X2 + ": peaker, MW", aria: aria }); }
  function sliders(host, start, onChange) {
    var p = start.slice();
    var sx = LX.Slider(host, { label: X1 + ", combined-cycle plant", color: "var(--lx-cc)", min: 0, max: 160, step: 5, value: p[0], fmt: function (v) { return v + " MW"; }, onChange: function (v) { p[0] = v; onChange(p); } });
    var sy = LX.Slider(host, { label: X2 + ", peaker", color: "var(--lx-pk)", min: 0, max: 120, step: 5, value: p[1], fmt: function (v) { return v + " MW"; }, onChange: function (v) { p[1] = v; onChange(p); } });
    return { p: p, set: function (q, fire) { p[0] = q[0]; p[1] = q[1]; sx.set(q[0]); sy.set(q[1], fire); }, sx: sx, sy: sy };
  }
  // the matrix as a grid of rows (buttons), with A x and b when asked
  function matrix(host, M, o) {
    var box = H("div", { class: "k6-mx", role: "group", "aria-label": "The matrix A, one row per rule" }, host), btn = {};
    function draw(st) {
      // the rows are rebuilt on every draw: keep keyboard focus on the row that had it
      var had = box.contains(document.activeElement) && document.activeElement.getAttribute("data-k");
      box.innerHTML = "";
      // the header is for the eye: each row button's name says every number in full (rowSpeech), so it is hidden from
      // screen readers
      var hd = H("div", { class: "k6-row head", "aria-hidden": "true" }, box);
      // always seven columns (rule, x₁, x₂, A x, sign, b, check), empty when not shown, so the rows line up with the header
      ["Rule", X1, X2, st.ax ? "A x" : "", "", st.b ? "b" : "", st.check ? "Check" : ""].forEach(function (t) { H("span", { text: t }, hd); });
      M.rows.forEach(function (r, i) {
        var a = st.le && r.op === ">=" ? r.a.map(function (v) { return -v; }) : r.a, op = st.le ? "<=" : r.op, b = st.le && r.op === ">=" ? -r.b : r.b;
        var row = H("button", { type: "button", "data-k": r.key, class: "k6-row" + (st.sel === r.key ? " sel" : "") + (st.check ? (st.check[i].pass ? " ok" : " bad") : ""), "aria-pressed": st.sel === r.key ? "true" : "false", "aria-label": rowSpeech(r, i, st) }, box);
        H("span", { class: "w", text: r.name }, row);
        H("span", { text: fmt(a[0]) }, row); H("span", { text: fmt(a[1]) }, row);
        H("span", { class: "ax", text: !st.ax ? "" : st.ax[i] == null ? "?" : fmt(st.le && r.op === ">=" ? -st.ax[i] : st.ax[i]) }, row);
        H("span", { class: "op", text: st.b ? OPS[op] : "" }, row); H("span", { text: st.b ? fmt(b) : "" }, row);
        H("span", { class: "ck", text: !st.check ? "" : st.check[i].pass ? "passes" : "fails" }, row);
        row.addEventListener("click", function () { if (o.onPick) o.onPick(r.key); });
        btn[r.key] = row;
      });
      if (had && btn[had]) btn[had].focus();
    }
    return { draw: draw, btn: btn };
  }

  function view(live, data, root) {
    var s = story(data.town, data.town_year, data["10_write_it_down"]), M = s.M, T = texts(s), Q = prompts(s), steps = [], autos = {};

    // ---- step 1: a vector is an ordered list
    steps.push({
      text: Q[0],
      build: function (act, api) {
        var pl = plane(act, "The plan as a point: x across, y up."), ro = readouts(act, [["v", "The vector x"], ["pt", "On the plane"]]);
        var sl = sliders(act, [40, 100], draw), hit = false;
        function draw(p) {
          ro.v.textContent = vec(p); ro.pt.textContent = p[0] + " across, " + p[1] + " up";
          pl.clear(); pl.point(p, { label: vec(p), cls: p[0] === s.plan[0] && p[1] === s.plan[1] ? "good" : "" });
          if (p[0] === s.plan[0] && p[1] === s.plan[1] && !hit) { hit = true; api.done(); api.saw(T.plan); }
        }
        pl.onPick(function (q) { sl.set([Math.round(q[0] / 5) * 5, Math.round(q[1] / 5) * 5]); draw(sl.p); }, 5);
        autos[0] = function () { sl.set(s.plan); draw(sl.p); };
        draw(sl.p);
      }
    });

    // ---- step 2: the dot product is the cost
    steps.push({
      text: Q[1],
      build: function (act, api) {
        H("p", { class: "lx-hint", text: T.hour }, act);
        H("p", { class: "k6-eq", html: "c · x = " + M.c[0] + " × " + s.plan[0] + " + " + M.c[1] + " × " + s.plan[1] + " = ?" }, act);
        var tries = 0, n = LX.NumAnswer(act, { label: "c · x, in dollars:", unit: "$", onCheck: function (v) {
          tries++;
          if (close(v, s.cost, 0.5)) { api.done(); api.saw(T.cost); } else api.saw(tries < 2 ? T.costHint : T.cost, true);
        } });
        autos[1] = function () { n.input.value = String(s.cost); n.go(); };
      }
    });

    // ---- step 3: a matrix is rows of rules
    steps.push({
      text: Q[2],
      build: function (act, api) {
        var seen = {}, sel = null, out = H("p", { class: "k6-out", "aria-live": "polite" }, act);
        var mx = matrix(act, M, { onPick: function (k) { sel = k; seen[k] = 1; draw(); } }), pl = plane(act, "The selected row as a line on the plane.");
        var prog = H("p", { class: "lx-hint" }, act);
        function draw() {
          mx.draw({ sel: sel, b: true });
          pl.clear(); pl.region(M.rows.concat([{ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }]), "ghost");
          M.rows.forEach(function (r) { pl.rule(r, { label: r.key === sel ? r.name : null, cls: r.key === sel ? "hot" : "on" }); });
          if (sel) { var r = M.rows.filter(function (q) { return q.key === sel; })[0]; out.textContent = "Row (" + fmt(r.a[0]) + ", " + fmt(r.a[1]) + "): " + fmt(r.a[0]) + X1 + " + " + fmt(r.a[1]) + X2 + " " + OPS[r.op] + " " + fmt(r.b) + ", " + r.words + "."; }
          var n = Object.keys(seen).length; prog.textContent = n + " of 4 rows read.";
          if (n === 4) { api.done(); api.saw(T.rows); }
        }
        autos[2] = function () { M.rows.forEach(function (r) { mx.btn[r.key].click(); }); };
        draw();
      }
    });

    // ---- step 4: A x, every row's dot product at once
    steps.push({
      text: Q[3],
      build: function (act, api) {
        var mx = matrix(act, M, {}), tries = 0, done = false;
        function draw() { mx.draw({ ax: s.Ax.map(function (v, i) { return i === 3 && !done ? null : v; }), b: true }); }
        var n = LX.NumAnswer(act, { label: "CO₂ row of A x, in t:", unit: "t", onCheck: function (v) {
          tries++;
          if (close(v, s.co2, 0.005)) { done = true; draw(); api.done(); api.saw(T.co2); } else api.saw(tries < 2 ? T.co2Hint : T.co2, true);
        } });
        draw();
        autos[3] = function () { n.input.value = String(s.co2); n.go(); };
      }
    });

    // ---- step 5: every row as ≤
    steps.push({
      text: Q[4],
      build: function (act, api) {
        var le = false, mx = matrix(act, M, {});
        var b = H("button", { type: "button", class: "lx-btn small", text: "Multiply the cover row by −1" }, act);
        b.addEventListener("click", function () { if (le) return; le = true; b.disabled = true; draw(); api.done(); api.saw(T.flip); });
        function draw() { mx.draw({ ax: s.Ax, b: true, le: le }); }
        draw();
        autos[4] = function () { b.click(); };
      }
    });

    // ---- step 6: A x ≤ b checks every rule at once
    steps.push({
      text: Q[5],
      build: function (act, api) {
        var mx = matrix(act, M, {}), pl = plane(act, "The plan and the region that passes every rule."), hit = false;
        var sl = sliders(act, s.plan, draw);
        H("p", { class: "lx-hint", text: T.nonneg }, act);
        function draw(p) {
          var ck = check(M, p);
          mx.draw({ ax: matvec(M.A, p), b: true, le: true, check: ck });
          pl.clear(); pl.region(M.rows.concat([{ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }]));
          M.rows.forEach(function (r, i) { pl.rule(r, { label: !ck[i].pass ? r.name : null, cls: !ck[i].pass ? "hot" : "on" }); });
          var only = onlyFails(M, p, "co2");
          pl.point(p, { label: only || ck.every(function (q) { return q.pass; }) ? null : vec(p), cls: ck.every(function (q) { return q.pass; }) ? "good" : "bad" });
          LX.store.set("k6-own", { x: p[0], y: p[1] });
          if (only && !hit) { hit = true; api.done(); api.saw(T.fail(p)); }
          if (refresh) refresh();
        }
        pl.onPick(function (q) { sl.set([Math.min(160, Math.round(q[0] / 5) * 5), Math.min(120, Math.round(q[1] / 5) * 5)]); draw(sl.p); }, 5);
        autos[5] = function () { sl.set(s.target); draw(sl.p); };
        draw(sl.p);
      }
    });

    // ---- step 7: sizes, and where A x ≤ b comes back
    var OPTS = [24, 72, 96, 190];
    steps.push({
      text: Q[6],
      build: function (act, api) {
        var row = H("div", { class: "lx-choices-row", role: "group", "aria-label": "Columns of lesson 11's A" }, act), bs = [];
        OPTS.forEach(function (v) {
          var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: v + " columns" }, row);
          b.addEventListener("click", function () {
            bs.forEach(function (q) { q.setAttribute("aria-pressed", q === b ? "true" : "false"); q.classList.remove("right", "wrong"); });
            b.classList.add(v === s.l11.cols ? "right" : "wrong");
            if (v === s.l11.cols) { api.done(); api.saw(T.size); } else api.saw("Not quite: count one column per decision, 4 in each of 24 hours.", true);
          });
          bs.push(b);
        });
        H("p", { class: "lx-hint", html: "Where A x ≤ b comes back: " + [10, 11, "B1"].map(function (c) { return LX.lessonRefHTML(data.path, c); }).join(", ") + "." }, act);
        autos[6] = function () { bs[OPTS.indexOf(s.l11.cols)].click(); };
      }
    });

    var refresh = null;
    var cards = LX.StepCards(live, { id: "k6-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // "mid" = step 4 answered; "step-N" = card N with its action done; "done" = the last card
      var k = state === "mid" ? 3 : state === "done" ? steps.length - 1 : /^step-(\d+)$/.test(state) ? Math.max(0, Math.min(steps.length - 1, +state.slice(5) - 1)) : -1;
      if (k < 0) return null;
      cards.go(k); if (autos[k]) autos[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    refresh = explain(s);
    drillView();
  }
  var close = NA.close;

  // ---------------------------------------------------------------- explain layer
  function explain(s) {
    var x = document.getElementById("k6-explain"); if (!x) return null; x.innerHTML = "";
    var M = s.M, T = texts(s);
    function own() { var o = LX.store.get("k6-own"); return o && typeof o.x === "number" ? [o.x, o.y] : null; }
    // every value in the ≤ form the equation shows (explainVals); the original signs are named apart
    function you(kind) { return function () { var o = own(); return explainVals(s, o || s.plan, !!o)[kind] || null; }; }
    var card = LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "A x ≤ b, symbol by symbol", lede: "Tap a symbol: what it holds, its size, and your plan from step 6, with the cover row flipped as in step 5.",
      rows: [{ parts: ["minimize", { k: "c" }, "·", { k: "x" }], say: "Minimize c dot x.", tag: "goal" },
             { parts: [{ k: "A" }, { k: "x" }, "≤", { k: "b" }], say: "A times x is at most b, row by row.", tag: "rules" }],
      symbols: {
        c: { sym: "c", name: "Costs", unit: "a vector of n numbers, $/MWh", color: "var(--lx-tier-4)", words: "One cost per decision, in 2025 dollars per MWh; c · x is the plan's cost (B1 writes cᵀx).", you: you("c") },
        x: { sym: "x", name: "The plan", unit: "a vector of n decisions, MW", color: "var(--lx-cc)", words: "The decisions in a fixed order: x₁, the combined-cycle plant's output, then x₂, the peaker's. Neither can be negative.", you: you("x") },
        A: { sym: "A", name: "The rule matrix", unit: "m rows × n columns", color: "var(--lx-tier-2)", words: "One row per rule, one column per decision. A x is every row's dot product with x.", you: you("A") },
        b: { sym: "b", name: "The limits", unit: "a vector of m numbers", color: "var(--lx-warn)", words: "One limit per rule, in that rule's unit: MW for the first three, t of CO₂ for the last.", you: you("b") } },
      fields: [{ key: "you", label: "Your numbers" }], sel: "A",
      hint: T.nonneg + " Building these arrays in code comes later, in B2 and M1."
    });
    var le = leForm(M);
    LX.LinkedViews(H("div", { class: "lx-xcard" }, x), {
      panels: [
        { title: "In words", items: M.rows.map(function (r) { return { key: r.key, html: "<b>" + r.name + ":</b> " + r.words + "." }; }) },
        { title: "As a row of A x ≤ b", items: M.rows.map(function (r, i) { return { key: r.key, html: "<span class=\"lx-lv-sym\">" + vec(le.A[i]) + " · <var>x</var> ≤ " + fmt(le.b[i]) + "</span>" }; }) }],
      table: { title: "A and b", head: ["Row", X1, X2, "b"], rows: M.rows.map(function (r, i) { return { key: r.key, cells: [r.name, fmt(le.A[i][0]), fmt(le.A[i][1]), fmt(le.b[i])] }; }) },
      hint: "Tap a line: the same rule lights up in words, as a row and in the table."
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Number, vector, matrix", text: true,
      columns: [{ key: "name", label: "Object", main: true }, { key: "is", label: "What it is" }, { key: "here", label: "Here" }],
      rows: [
        { key: "num", color: "var(--lx-ink-3)", name: "Number", note: "a scalar", is: "One value.", here: "the cap, " + M.rows[3].b + " t" },
        { key: "vec", color: "var(--lx-cc)", name: "Vector", note: "n numbers in order", is: "A list whose order carries meaning.", here: "x = " + vec(s.plan) + ", c = " + vec(M.c) },
        { key: "mat", color: "var(--lx-tier-2)", name: "Matrix", note: "m rows × n columns", is: "A table: one row per rule, one column per decision.", here: "A, 4 × 2" },
        { key: "sp", color: "var(--lx-tier-5)", name: "Sparse matrix", note: "mostly zeros", is: "A large matrix stored by its non-zero entries.", here: "lesson 11, as its solver stores it: " + s.l11.nz + " of " + s.l11.cells.toLocaleString("en-US") }]
    });
    var sec = document.getElementById("explain"), seen = !("IntersectionObserver" in window) || !sec, dirty = false;
    if (!seen) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; if (seen && dirty) { dirty = false; card.select(card.current() || "A"); } }).observe(sec);
    return function () { if (seen) card.select(card.current() || "A"); else dirty = true; };
  }

  // ---------------------------------------------------------------- practice drill (LX.Drill; this visit only)
  function drillView() {
    var host = document.getElementById("k6-drill"); if (!host) return; host.innerHTML = "";
    LX.Drill(host, { hint: "Six kinds of item in rotation: dot products, one row of A x, checking a rule, flipping ≥ to ≤, the size of A and a small matrix times a vector. Aim for eighteen, about 30 minutes.",
                     empty: "Type a number first.", item: drillItem, unit: function (it) { return it.unit === "$" ? "dollars" : it.unit || ""; } });
  }

  LX.mount("k06", function (live, data, root) { view(live, data, root); });
}());
