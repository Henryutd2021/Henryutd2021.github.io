/* scenario.js — LX.m08: a two-stage decision under scenarios, on M8's toy (one electrolyzer sized before anyone knows
   how much planned wind gets built): the branches and their chances, the closed form of each branch's cost, the
   extensive-form LP and its readout, the wait-and-see, expected-value, worst-case and least-regret variants, and the
   formats. Promoted at the W4 integration (2026-11-05) from Modeler lesson M8 (assets/learn/m08-stochastic-robust.js),
   whose code it is, unchanged; case file CF3 prices a reader's size in each build-out with the closed form. Pure: no
   DOM; the page passes in its data (assets/learn/data/m08-stochastic-robust.json) and solves the LPs with LX.solver.
   Each page keeps its own text (M8: lockWords, staticHTML). Node: require("assets/learn/components/scenario.js");
   tests: _tests/learn/test_m08-stochastic-robust.js, test_cf3-hydrogen-under-uncertainty.js (every number),
   test_components_w4_int.js (the promotion).

   Data: assets/learn/data/m08-stochastic-robust.json (the windy zone, the three build-outs, the five wind blocks, the
   electrolyzer and the hydrogen, and a reference block written by the test).

   The toy (illustrative round numbers in 2025 dollars, not any study's inputs or results). A windy zone has W MW of wind;
   its lines take at most A = 1,000 MW, so in wind block b (h_b hours a year at capacity factor f_b) the surplus is
     sigma_{s,b} = max(0, W_s f_b - A)                                       MW, curtailed unless an electrolyzer uses it
   Here and now: the electrolyzer's size x (MW), at c = $80,000 per MW a year. Later, in each build-out s (none, half or
   all of the 4,000 MW of planned wind; chances 25%, 50%, 25%) and each block b: the electrolyzer's power e_{s,b} (MW) and
   the hydrogen bought from gas reformers r_{s,b} (kg an hour) at $1.50 per kg. The extensive form (one linear program):
     min  c x + sum_s p_s sum_b h_b 1.50 r_{s,b}
     s.t. 18 e_{s,b} + r_{s,b} = 54,000      ("h2_<s>_<b>": industry's hydrogen every hour; 18 kg per MWh)
          e_{s,b} - x <= 0                   ("cap_<s>_<b>": no more than the electrolyzer's size)
          0 <= e_{s,b} <= sigma_{s,b},  r >= 0, x >= 0
   31 columns and 30 rows. The same builder gives the wait-and-see problems (one build-out, chance 1), the expected-value
   problem (one build-out at the mean wind), a plan priced in every branch (x fixed), the worst-case robust plan
   (min z, z >= each branch's cost) and the least-regret plan (z >= each branch's cost minus its wait-and-see cost).
   Closed form (for the test and the chart): with one size and no storage, the cost of size x in branch s is
     cost_s(x) = c x + 1.50 (54,000 x 8,760 - 18 sum_b h_b min(x, sigma_{s,b}))
   piecewise linear in x; an extra MW pays while it runs more than c / (1.50 x 18) = 2,963 hours a year (the critical
   hours; on average over the branches for the stochastic plan).
   Ties (W2 review finding 2): every size the page reports is the only best size. Given a size, each branch's operation is
   unique (every MWh of surplus used saves $27), so every cost shown is unique. The robust LPs fix only the size; each
   plan's branch costs come from re-solving with the size fixed. _tests/learn/test_m08-stochastic-robust.js proves each
   size unique (a size 1 MW larger or smaller costs more) and recomputes every number from the closed form.
*/
(function () {
  "use strict";
  var HOURS = 8760;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  // the branches, with their wind; p: optional chances (a preset) in the data's order
  function scen(D, p) {
    return D.scenarios.map(function (s, i) {
      return { id: s.id, label: s.label, short: s.short, completion: s.completion, p: p ? p[i] : s.p, W: D.wind.existingMW + s.completion * D.wind.plannedMW };
    });
  }
  function meanW(S) { return r6(S.reduce(function (a, s) { return a + s.p * s.W; }, 0)); }
  function surplus(D, W, b) { return Math.max(0, r6(W * D.blocks.cf[b] - D.zone.lineMW)); }
  function capMW(D) { return D.hydrogen.demandKgPerHour / D.electrolyzer.kgPerMWh; }
  function value(D) { return D.hydrogen.reformerPerKg * D.electrolyzer.kgPerMWh; }           // $ saved per MWh of surplus used
  function critHours(D) { return D.electrolyzer.costPerMWYear / value(D); }
  function base(D) { return D.hydrogen.reformerPerKg * D.hydrogen.demandKgPerHour * HOURS; }  // reformers only, a year
  function used(D, W, x) { var e = 0; for (var b = 0; b < D.blocks.hours.length; b++) e += D.blocks.hours[b] * Math.min(x, surplus(D, W, b), capMW(D)); return e; }
  function cost(D, W, x) { return D.electrolyzer.costPerMWYear * x + D.hydrogen.reformerPerKg * (D.hydrogen.demandKgPerHour * HOURS - D.electrolyzer.kgPerMWh * used(D, W, x)); }
  function expected(D, S, x) { return S.reduce(function (a, s) { return a + s.p * cost(D, s.W, x); }, 0); }
  function worst(D, S, x) { return Math.max.apply(null, S.map(function (s) { return cost(D, s.W, x); })); }
  function regret(D, S, x, ws) { return Math.max.apply(null, S.map(function (s) { return cost(D, s.W, x) - ws[s.id]; })); }
  function hoursAbove(D, W, x) { var h = 0; for (var b = 0; b < D.blocks.hours.length; b++) if (surplus(D, W, b) > x + 1e-9 && x < capMW(D)) h += D.blocks.hours[b]; return h; }
  function expHoursAbove(D, S, x) { return S.reduce(function (a, s) { return a + s.p * hoursAbove(D, s.W, x); }, 0); }
  // every kink of the branches' cost curves up to xMax, with 0 and xMax
  function kinks(D, S, xMax) {
    var k = [0, xMax];
    S.forEach(function (s) { for (var b = 0; b < D.blocks.cf.length; b++) { var v = surplus(D, s.W, b); if (v > 0 && v < xMax) k.push(v); } });
    return k.sort(function (a, b) { return a - b; }).filter(function (v, i, a) { return i === 0 || v - a[i - 1] > 1e-9; });
  }
  // the closed-form best size of the expected cost (any tree, or one branch with chance 1), with the expected hours an
  // extra MW would run just below and just above it; none of these numbers is shown before the solver gives its own
  function closedBest(D, S) {
    var best = null;
    kinks(D, S, capMW(D)).forEach(function (x) { var f = expected(D, S, x); if (!best || f < best.cost - 1e-6) best = { x: x, cost: f }; });
    best.below = best.x > 0 ? expHoursAbove(D, S, best.x - 1e-6) : null; best.above = expHoursAbove(D, S, best.x + 1e-6);
    return best;
  }
  // the linear program. o.mode: "expected" (default; the stochastic program, or a wait-and-see or expected-value problem
  // when S holds one branch with chance 1), "worst" (min z, z >= every branch's cost) or "regret" (z >= cost - o.ws[id]);
  // o.fix: the size fixed (a plan priced in every branch)
  function build(D, S, o) {
    o = o || {};
    var mode = o.mode || "expected", B = D.blocks.hours.length, k = D.electrolyzer.kgPerMWh, Dh = D.hydrogen.demandKgPerHour, cr = D.hydrogen.reformerPerKg, cx = D.electrolyzer.costPerMWYear;
    var vars = [{ name: "x", lb: o.fix != null ? o.fix : 0, ub: o.fix != null ? o.fix : Infinity, cost: mode === "expected" ? cx : 0 }], cons = [];
    if (mode !== "expected") vars.push({ name: "z", lb: -Infinity, cost: 1 });
    S.forEach(function (s) {
      var row = { x: cx };
      for (var b = 0; b < B; b++) {
        var e = "e_" + s.id + "_" + b, r = "r_" + s.id + "_" + b, c1 = {}, c2 = {};
        vars.push({ name: e, ub: surplus(D, s.W, b) }, { name: r, cost: mode === "expected" ? s.p * D.blocks.hours[b] * cr : 0 });
        c1[e] = 1; c1.x = -1; cons.push({ name: "cap_" + s.id + "_" + b, terms: c1, le: 0 });
        c2[e] = k; c2[r] = 1; cons.push({ name: "h2_" + s.id + "_" + b, terms: c2, eq: Dh });
        row[r] = D.blocks.hours[b] * cr;
      }
      if (mode !== "expected") { row.z = -1; cons.push({ name: "z_" + s.id, terms: row, le: mode === "regret" ? o.ws[s.id] : 0 }); }
    });
    return { sense: "min", variables: vars, constraints: cons };
  }
  // a solved LP: the size and, for each branch, its cost from the solution (meaningful in "expected" mode, where every
  // branch's operation is priced; the robust modes are re-solved with the size fixed)
  function read(D, S, r) {
    if (!r || !r.ok || !r.values) return null;
    var x = r.values.x; x = Math.abs(x) < 1e-7 ? 0 : r6(x);
    var per = {};
    S.forEach(function (s) {
      var c = D.electrolyzer.costPerMWYear * x;
      for (var b = 0; b < D.blocks.hours.length; b++) c += D.blocks.hours[b] * D.hydrogen.reformerPerKg * r.values["r_" + s.id + "_" + b];
      per[s.id] = c;
    });
    return { x: x, obj: r.objective, per: per };
  }
  function presetS(D, id) { var p = D.presets.filter(function (q) { return q.id === id; })[0]; return scen(D, p ? p.p : null); }
  var fm = {
    m: function (v) { return (v < -5e3 ? "−$" : "$") + (Math.abs(v) / 1e6).toFixed(2) + "M"; },
    mw: function (x) { var r = Math.round(x * 10) / 10; return (Math.abs(r - Math.round(r)) < 1e-9 ? Math.round(r).toLocaleString("en-US") : r.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })) + " MW"; },
    pct: function (p) { return Math.round(p * 100) + "%"; },
    int: function (v) { return Math.round(v).toLocaleString("en-US"); }
  };

  var model = { HOURS: HOURS, scen: scen, meanW: meanW, surplus: surplus, capMW: capMW, value: value, critHours: critHours, base: base, used: used, cost: cost,
    expected: expected, worst: worst, regret: regret, hoursAbove: hoursAbove, expHoursAbove: expHoursAbove, kinks: kinks, closedBest: closedBest,
    build: build, read: read, presetS: presetS, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window !== "undefined" && window.LX) window.LX.m08 = model;
})();
