// m10-ml-forecasting.js — Modeler lesson M10, "Forecasting load, wind and solar with machine learning, and judging it
// honestly" (model-lab in the step-card form, statistical mode, no solver; Learn W4, 2026-11-05).
//
// Data (real, as reported; no download): the course's hourly 2025 shapes of the Southwest Power Pool (SPP) in
// assets/learn/data/town_year.json (EIA-930; demand, wind and solar, each in thousandths of its own 2025 maximum; index i
// is the hour ENDING at start_utc + i hours, UTC; cleaning rules in its meta). Demand in MW = shape / 1000 x 54,411 MW,
// SPP's 2025 peak hour (04-forecasts.json), so values are rounded to 54 MW; wind and solar stay in % of their maximum.
//
// The forecast (made at local midnight for every hour of the next local day; Central time with daylight saving, as
// people live by it: 2025's change days have 23 and 25 hours). For a target hour i of local date t, the issue hour is the
// last hour of the day before; the horizon h = i - issue (1 to 24, 25 on 2 November). A lag L may be used only if L >= h:
//   persistence           y(issue): the latest actual, held flat
//   same hour yesterday   y(i - 24 ceil(h / 24))            (lag 48 for the 25th hour of 2 November)
//   same hour last week   y(i - 168)
//   linear regression     least squares on chosen features (always same hour yesterday; optional: same hour last week,
//                         the latest actual, hour of day as 23 indicators, Saturday and Sunday indicators), in GW, with an
//                         intercept; normal equations solved by Cholesky (one Gram matrix of all columns, subsets read
//                         from it, so every mix of features is exact and quick)
//   leaks (step 5)        "the hour before" y(i - 1) (known at midnight only for the first hour) and "tomorrow's average"
//                         (the mean of the actual demand on date t): neither exists when the forecast is made
// Split by time, never shuffled: train 8 January to 30 September (the first week only feeds lag 168), validate (choose)
// on October, test once on November. Tie rule for the best mix: the lowest validation MAE; the test proves the winner
// leads by more than 1 MW.
// Scores: MAE, RMSE (MW), MAPE (%), skill = 1 - MAE / MAE of same hour yesterday. Bands: the model's October misses give
// empirical quantiles (type 7, as K5) at 5%, 10%, ..., 95%; the band is forecast + quantile, optionally times a width
// factor s (step 8); coverage of the 50, 80 and 90% central bands, mean width, and the mean pinball loss over the 19
// levels on November. Every number the page states comes from these functions (_tests/learn/test_m10-ml-forecasting.js).
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  // the local calendar of every index hour: hour ending (1-24, local clock), date, weekday (0 Sunday), month, issue, h
  function calendar(Y, C) {
    var t0 = Date.parse(Y.start_utc + "Z"), on = Date.parse(C.dstStartUTC), off = Date.parse(C.dstEndUTC), out = [], first = {}, i;
    for (i = 0; i < Y.demand.length; i++) {
      var end = t0 + i * 3600e3, offH = end > on && end <= off ? C.offsetDST : C.offsetStd, loc = new Date(end + offH * 3600e3), he = loc.getUTCHours(), dt = loc;
      if (he === 0) { he = 24; dt = new Date(loc.getTime() - 3600e3); }
      var date = dt.toISOString().slice(0, 10);
      if (!(date in first)) first[date] = i;
      out.push({ i: i, he: he, date: date, dow: dt.getUTCDay(), month: dt.getUTCMonth() + 1 });
    }
    out.forEach(function (x) { x.issue = first[x.date] - 1; x.h = x.i - x.issue; });
    return out;
  }
  function demandMW(Y, D) { return Y.demand.map(function (v) { return v / 1000 * D.peakMW; }); }
  function prepare(Y, D) {
    var cal = calendar(Y, D.clock), d = demandMW(Y, D), S = D.split, byDate = {};
    cal.forEach(function (x) { (byDate[x.date] = byDate[x.date] || []).push(x.i); });
    var dayMean = {}; Object.keys(byDate).forEach(function (k) { var s = 0; byDate[k].forEach(function (i) { s += d[i]; }); dayMean[k] = s / byDate[k].length; });
    var inR = function (x, r) { return x.date >= r[0] && x.date <= r[1]; };
    return { Y: Y, D: D, cal: cal, d: d, dayMean: dayMean, byDate: byDate,
             train: cal.filter(function (x) { return inR(x, S.train); }), val: cal.filter(function (x) { return inR(x, S.val); }), test: cal.filter(function (x) { return inR(x, S.test); }) };
  }
  function lagDay(x) { return 24 * Math.ceil(x.h / 24); }
  var RULES = {
    persist: function (P, x) { return P.d[x.issue]; },
    day: function (P, x) { return P.d[x.i - lagDay(x)]; },
    week: function (P, x) { return P.d[x.i - 168]; }
  };
  // the columns of the full design: group of each column, and its value for hour x (GW)
  var GROUPS = ["day", "week", "last", "hour", "wkend", "lag1", "oracle"];
  function columns() {
    var c = [{ g: "const" }, { g: "day" }, { g: "week" }, { g: "last" }], h;
    for (h = 2; h <= 24; h++) c.push({ g: "hour", he: h });
    c.push({ g: "wkend", dow: 6 }, { g: "wkend", dow: 0 }, { g: "lag1" }, { g: "oracle" });
    return c;
  }
  var COLS = columns();
  function row(P, x) {
    return COLS.map(function (c) {
      switch (c.g) {
        case "const": return 1;
        case "day": return P.d[x.i - lagDay(x)] / 1000;
        case "week": return P.d[x.i - 168] / 1000;
        case "last": return P.d[x.issue] / 1000;
        case "hour": return x.he === c.he ? 1 : 0;
        case "wkend": return x.dow === c.dow ? 1 : 0;
        case "lag1": return P.d[x.i - 1] / 1000;
        default: return P.dayMean[x.date] / 1000;
      }
    });
  }
  // the Gram matrix X^T X and X^T y of the training rows, once
  function gram(P) {
    if (P._gram) return P._gram;
    var p = COLS.length, A = [], b = new Float64Array(p), a, c;
    for (a = 0; a < p; a++) A.push(new Float64Array(p));
    P.train.forEach(function (x) {
      var r = row(P, x), y = P.d[x.i];
      for (a = 0; a < p; a++) { if (!r[a]) continue; b[a] += r[a] * y; for (c = 0; c < p; c++) A[a][c] += r[a] * r[c]; }
    });
    P._gram = { A: A, b: b };
    return P._gram;
  }
  function chol(A) {
    var n = A.length, L = [], i, j, k;
    for (i = 0; i < n; i++) L.push(new Float64Array(n));
    for (i = 0; i < n; i++) for (j = 0; j <= i; j++) { var s = A[i][j]; for (k = 0; k < j; k++) s -= L[i][k] * L[j][k]; if (i === j) { if (!(s > 0)) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j]; }
    return L;
  }
  function solve(L, b) {
    var n = b.length, z = new Float64Array(n), x = new Float64Array(n), i, k, s;
    for (i = 0; i < n; i++) { s = b[i]; for (k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
    for (i = n - 1; i >= 0; i--) { s = z[i]; for (k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }
  // a fitted linear model on the feature groups in `use` (an array; "day" is always in): {idx, w, f(x)}
  function fitLS(P, use) {
    var G = gram(P), idx = [];
    COLS.forEach(function (c, k) { if (c.g === "const" || c.g === "day" || use.indexOf(c.g) >= 0) idx.push(k); });
    var A = idx.map(function (a) { return idx.map(function (c) { return G.A[a][c]; }); }), b = idx.map(function (a) { return G.b[a]; });
    var w = solve(chol(A), b);
    return { use: use.slice(), idx: idx, w: w, f: function (x) { var r = row(P, x), s = 0; for (var k = 0; k < idx.length; k++) s += r[idx[k]] * w[k]; return s; } };
  }
  // scores of a forecast function over a set of hours
  function point(P, S, f) {
    var ae = 0, se = 0, pe = 0;
    S.forEach(function (x) { var e = P.d[x.i] - f(x); ae += Math.abs(e); se += e * e; pe += Math.abs(e) / P.d[x.i]; });
    return { mae: ae / S.length, rmse: Math.sqrt(se / S.length), mape: pe / S.length, n: S.length };
  }
  function rule(P, k) { return function (x) { return RULES[k](P, x); }; }
  // the 16 mixes of the optional honest groups, each fitted and scored on October and November; sorted by October MAE
  var OPT = ["week", "last", "hour", "wkend"];
  function mixes(P) {
    if (P._mixes) return P._mixes;
    var out = [];
    for (var m = 0; m < 16; m++) {
      var use = OPT.filter(function (g, j) { return m >> j & 1; }), F = fitLS(P, use);
      out.push({ use: use, key: use.join("+") || "day", val: point(P, P.val, F.f).mae, test: point(P, P.test, F.f).mae, train: point(P, P.train, F.f).mae, F: F });
    }
    out.sort(function (a, b) { return a.val - b.val; });
    P._mixes = out;
    return out;
  }
  function quantile(s, p) { var h = (s.length - 1) * p, lo = Math.floor(h); return lo + 1 < s.length ? s[lo] + (s[lo + 1] - s[lo]) * (h - lo) : s[lo]; }
  var TAU = []; for (var a19 = 1; a19 <= 19; a19++) TAU.push(a19 / 20);
  // quantiles of the model's October misses (actual - forecast) at the 19 levels
  function residualQ(P, f) { var r = P.val.map(function (x) { return P.d[x.i] - f(x); }).sort(function (a, b) { return a - b; }); return TAU.map(function (t) { return quantile(r, t); }); }
  // band scores on a set of hours: coverage of the central 50/80/90% bands, mean width of the 80% band, mean pinball loss
  // over the 19 levels; s scales the quantiles (the band's width)
  function bands(P, S, f, Q, s) {
    s = s == null ? 1 : s;
    var lvl = { 50: [4, 14], 80: [1, 17], 90: [0, 18] }, cov = { 50: 0, 80: 0, 90: 0 }, wid = 0, pb = 0;
    S.forEach(function (x) {
      var m = f(x), y = P.d[x.i];
      Object.keys(lvl).forEach(function (l) { if (y >= m + s * Q[lvl[l][0]] && y <= m + s * Q[lvl[l][1]]) cov[l]++; });
      wid += s * (Q[17] - Q[1]);
      for (var j = 0; j < 19; j++) { var q = m + s * Q[j], t = TAU[j]; pb += (y >= q ? t * (y - q) : (1 - t) * (q - y)) / 19; }
    });
    Object.keys(cov).forEach(function (l) { cov[l] /= S.length; });
    return { cov: cov, width: wid / S.length, pinball: pb / S.length };
  }
  // persistence of a series (thousandths of its maximum) at lag h over a set of hours: MAE in % of the maximum
  function persistAt(P, key, S, h) { var s = P.Y[key], e = 0; S.forEach(function (x) { e += Math.abs(s[x.i] - s[x.i - h]); }); return e / S.length / 10; }
  function zeros(P, key, S) { var s = P.Y[key]; return S.filter(function (x) { return s[x.i] === 0; }).length; }
  // daily MAE of a forecast over a set of hours, in date order
  function daily(P, S, f) {
    var by = {}, order = [];
    S.forEach(function (x) { if (!by[x.date]) { by[x.date] = []; order.push(x.date); } by[x.date].push(Math.abs(P.d[x.i] - f(x))); });
    return order.map(function (k) { var v = by[k], s = v.reduce(function (a, b) { return a + b; }, 0); return { date: k, mae: s / v.length, sum: s, n: v.length }; });
  }

  // ---------------------------------------------------------------- every number the page states, in one place
  function facts(Y, D) {
    var P = prepare(Y, D), F = { P: P };
    F.base = {}; ["persist", "day", "week"].forEach(function (k) { F.base[k] = { val: point(P, P.val, rule(P, k)), test: point(P, P.test, rule(P, k)) }; });
    F.mixes = mixes(P); F.best = F.mixes[0]; F.second = F.mixes[1];
    F.full = F.mixes.filter(function (m) { return m.use.length === 4; })[0];
    F.testBest = F.mixes.slice().sort(function (a, b) { return a.test - b.test; })[0];
    F.skillVal = 1 - F.best.val / F.base.day.val.mae; F.skillTest = 1 - F.best.test / F.base.day.test.mae;
    var bestUse = F.best.use;
    F.leak = { lag1: fitLS(P, bestUse.concat(["lag1"])), oracle: fitLS(P, bestUse.concat(["oracle"])) };
    F.leakVal = { lag1: point(P, P.val, F.leak.lag1.f).mae, oracle: point(P, P.val, F.leak.oracle.f).mae };
    F.Q = residualQ(P, F.best.F.f);
    F.band = bands(P, P.test, F.best.F.f, F.Q, 1);
    F.widths = D.widths.map(function (s) { return { s: s, b: bands(P, P.test, F.best.F.f, F.Q, s) }; });
    F.pbBest = F.widths.slice().sort(function (a, b) { return a.b.pinball - b.b.pinball || a.s - b.s; })[0];
    F.horizon = {}; ["demand", "wind", "solar"].forEach(function (k) { F.horizon[k] = D.horizons.map(function (h) { return persistAt(P, k, P.val, h); }); });
    F.solarZeros = zeros(P, "solar", P.val);
    F.daily = daily(P, P.test, F.best.F.f);
    var tot = F.daily.reduce(function (s, x) { return s + x.sum; }, 0), worst = F.daily.slice().sort(function (a, b) { return b.mae - a.mae || (a.date < b.date ? -1 : 1); });
    F.worst = worst.slice(0, 3); F.worstShare = F.worst.reduce(function (s, x) { return s + x.sum; }, 0) / tot;
    return F;
  }
  function reference(Y, D) {
    var F = facts(Y, D), P = F.P, cut = function (v) { return +v.toPrecision(10); };
    return {
      about: "Written by node _tests/learn/test_m10-ml-forecasting.js --write; recomputed by the same test on every run. MW; shares are fractions of the hours.",
      hours: { train: P.train.length, val: P.val.length, test: P.test.length },
      baselines: ["persist", "day", "week"].reduce(function (o, k) { o[k] = { val: cut(F.base[k].val.mae), test: cut(F.base[k].test.mae) }; return o; }, {}),
      mixes: F.mixes.map(function (m) { return [m.key, cut(m.val), cut(m.test)]; }),
      bestWeights: Array.prototype.map.call(F.best.F.w, cut),
      leaks: { lag1: cut(F.leakVal.lag1), oracle: cut(F.leakVal.oracle) },
      quantiles: F.Q.map(cut),
      band: { cov80: cut(F.band.cov[80]), width80: cut(F.band.width), pinball: cut(F.band.pinball) },
      worst: F.worst.map(function (w) { return [w.date, cut(w.mae)]; })
    };
  }
  function mw(v) { return Math.round(v).toLocaleString("en-US") + " MW"; }
  function pc(f, d) { return (100 * f).toFixed(d == null ? 1 : d) + "%"; }
  var NAMES = { week: "same hour last week", last: "the latest actual", hour: "hour of day", wkend: "Saturday and Sunday", day: "same hour yesterday", lag1: "the hour before", oracle: "tomorrow's average" };
  function mixName(use) { return ["same hour yesterday"].concat(use.map(function (g) { return NAMES[g]; })).join(" + "); }
  function dayLabel(date) { var t = new Date(date + "T12:00:00Z"); return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][t.getUTCDay()] + " " + t.getUTCDate() + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][t.getUTCMonth()]; }
  // the no-JS version (the test's --write puts it in the page)
  function staticFallback(Y, D) {
    var F = facts(Y, D), b = F.base, H = D.horizons;
    var li = [
      "Split by time: train on " + F.P.train.length.toLocaleString("en-US") + " hours (8 January to 30 September 2025), choose on October (" + F.P.val.length + " hours), test once on November (" + F.P.test.length + ").",
      "On October, same hour yesterday misses by " + mw(b.day.val.mae) + " on average (MAPE " + pc(b.day.val.mape) + "); same hour last week by " + mw(b.week.val.mae) + "; the latest hour held flat by " + mw(b.persist.val.mae) + ".",
      "Persistence error, in % of each series' 2025 maximum, at 1 and 12 hours ahead: demand " + F.horizon.demand[0].toFixed(1) + " and " + F.horizon.demand[3].toFixed(1) + "; wind " + F.horizon.wind[0].toFixed(1) + " and " + F.horizon.wind[3].toFixed(1) + "; solar " + F.horizon.solar[0].toFixed(1) + " and " + F.horizon.solar[3].toFixed(1) + ". Solar is zero in " + F.solarZeros + " of " + F.P.val.length + " October hours.",
      "The best of 16 feature mixes on October: " + mixName(F.best.use) + ", " + mw(F.best.val) + ", " + pc(F.skillVal) + " better than same hour yesterday.",
      "Leaks: adding the hour before scores " + mw(F.leakVal.lag1) + " on October, adding tomorrow's average " + mw(F.leakVal.oracle) + "; neither exists at midnight.",
      "November, opened once: " + mw(F.best.test) + " against " + mw(b.day.test.mae) + " for same hour yesterday (" + pc(F.skillTest) + " better).",
      "An 80% band from October's misses (" + mw(F.Q[1]).replace(/^-/, "−") + " to +" + mw(F.Q[17]) + ") holds " + pc(F.band.cov[80]) + " of November's hours; its pinball loss is " + F.band.pinball.toFixed(1) + " MW.",
      "The three worst November days (" + F.worst.map(function (w) { return dayLabel(w.date); }).join(", ") + ") hold " + pc(F.worstShare, 0) + " of the month's absolute error."
    ];
    var rows = [["Same hour yesterday, October and November", mw(b.day.val.mae) + " and " + mw(b.day.test.mae)], ["Best mix by October, October and November", mw(F.best.val) + " and " + mw(F.best.test)],
                ["Skill against same hour yesterday, November", pc(F.skillTest)], ["80% band holds, November", pc(F.band.cov[80])]];
    return '<p class="lx-eyebrow">SPP hourly demand, 2025: baselines, a learned model and a band, scored by time</p>\n<ol>\n' + li.map(function (t) { return "<li>" + t + "</li>"; }).join("\n") + "\n</ol>\n" +
      '<p class="lx-eyebrow">The summaries on this page</p>\n<div class="lx-scroll-x"><table class="lx-facts m10-fbtab">\n<thead><tr><th scope="col">Summary</th><th scope="col">MAE or share</th></tr></thead>\n<tbody>\n' +
      rows.map(function (q) { return '<tr><td>' + q[0] + '</td><td class="n">' + q[1] + '</td></tr>'; }).join("\n") + '\n</tbody></table></div>\n<p class="lx-hint">With JavaScript on, you build and score these forecasts yourself, step by step.</p>';
  }

  var model = { calendar: calendar, demandMW: demandMW, prepare: prepare, lagDay: lagDay, RULES: RULES, GROUPS: GROUPS, COLS: COLS, row: row, gram: gram, chol: chol, solve: solve,
                fitLS: fitLS, point: point, rule: rule, OPT: OPT, mixes: mixes, quantile: quantile, TAU: TAU, residualQ: residualQ, bands: bands, persistAt: persistAt, zeros: zeros,
                daily: daily, facts: facts, reference: reference, staticFallback: staticFallback, mw: mw, pc: pc, mixName: mixName, dayLabel: dayLabel, NAMES: NAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;
  // ================================================================ view
  var LX = window.LX, H = LX.H, KEY = "m10-own";
  var COL = { actual: "var(--lx-ink)", persist: "var(--lx-tier-4)", day: "var(--lx-accent)", week: "var(--lx-tier-5)", model: "var(--lx-tier-3)", band: "var(--lx-accent)", train: "var(--lx-tier-3)", val: "var(--lx-warn)", test: "var(--lx-bad)", wind: "var(--lx-wind)", solar: "var(--lx-solar)", demand: "var(--lx-ink)" };
  var RNAME = { persist: "The latest hour, held flat", day: "Same hour yesterday", week: "Same hour last week" };
  function seg(host, labels, sel, onPick, aria) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": aria || "Choose" }, host), bs = [];
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", "aria-pressed": i === sel ? "true" : "false", text: l }, g);
      b.addEventListener("click", function () { set(i); onPick(i); });
      bs.push(b);
    });
    function set(i) { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); }
    return { el: g, buttons: bs, set: set };
  }
  function rowEl(host) { return H("div", { class: "m10-row" }, host); }
  function readout(host) { return H("p", { class: "m10-out", "aria-live": "polite" }, host); }
  function table(host, head, rows) {
    host.innerHTML = "";
    var sc = H("div", { class: "lx-scroll-x" }, host), t = H("table", { class: "lx-mini-table" }, sc), hr = H("tr", null, H("thead", null, t)), bd = H("tbody", null, t);
    head.forEach(function (h) { H("th", { scope: "col", text: h }, hr); });
    rows.forEach(function (r) { var tr = H("tr", null, bd); r.forEach(function (c, i) { H(i ? "td" : "th", i ? { text: c, class: "n" } : { scope: "row", text: c }, tr); }); });
  }
  function gw(v) { return (v / 1000).toFixed(1); }
  function vs(a, b) { var f = 1 - a / b; return pc(Math.abs(f)) + (f >= 0 ? " better" : " worse"); }
  // a week of hours (local dates from..to) as a chart: actual and forecast lines, an optional band of bars
  function weekSpec(P, from, to, lines, band, aria) {
    var S = P.cal.filter(function (x) { return x.date >= from && x.date <= to; }), x0 = S[0].i, ys = [], bars = [];
    S.forEach(function (x) { ys.push(P.d[x.i]); });
    if (band) S.forEach(function (x, k) { var m = band.f(x); bars.push({ x0: k, x1: k + 1, y0: m + band.lo, y1: m + band.hi, color: COL.band, op: LX.isDark && LX.isDark() ? 0.3 : 0.16 }); });
    var all = ys.concat.apply(ys, lines.map(function (l) { return S.map(function (x) { return l.f(x); }); })), lo = Math.floor(Math.min.apply(null, all) / 5000) * 5000, hi = Math.ceil(Math.max.apply(null, all) / 5000) * 5000;
    var days = []; for (var k = 0; k < S.length; k++) if (S[k].he === 1 && (k === 0 || S[k - 1].date !== S[k].date)) days.push([k, dayLabel(S[k].date).split(" ").slice(0, 2).join(" ").slice(0, 3) + " " + S[k].date.slice(8).replace(/^0/, "")]);
    return {
      x: { min: 0, max: S.length, ticks: days.map(function (d, j) { return [d[0], d[1], j === 0 ? "start" : "middle"]; }), ticksN: days.filter(function (d, j) { return j % 2 === 0; }).map(function (d, j) { return [d[0], d[1], j === 0 ? "start" : "middle"]; }) },
      y: { min: lo, max: hi, step: 5000, fmt: function (v) { return gw(v); }, unit: "GW" }, height: 240, heightN: 210, bars: bars,
      lines: [{ values: ys, x0: 0.5, color: COL.actual, width: 2.2 }].concat(lines.map(function (l) { return { values: S.map(function (x) { return l.f(x); }), x0: 0.5, color: l.color, width: 2, dash: l.dash }; })),
      legend: [{ label: "Actual demand", color: COL.actual }].concat(lines.map(function (l) { return { label: l.label, color: l.color, dash: l.dash }; }), band ? [{ label: band.label, color: "color-mix(in srgb, var(--lx-accent) 30%, transparent)" }] : []),
      tip: function (xv) { var k = Math.max(0, Math.min(S.length - 1, Math.floor(xv))), x = S[k]; return "<div><b>" + dayLabel(x.date) + ", hour ending " + x.he + ":00</b></div><div>Actual " + mw(P.d[x.i]) + "</div>" + lines.map(function (l) { return "<div>" + l.label + ": " + mw(l.f(x)) + "</div>"; }).join(""); },
      tipStep: 1, aria: aria,
      text: { head: ["Hour", "Actual"].concat(lines.map(function (l) { return l.label; })), rows: S.map(function (x) { return [dayLabel(x.date) + " " + x.he + ":00", mw(P.d[x.i])].concat(lines.map(function (l) { return mw(l.f(x)); })); }) }
    };
  }

  LX.mount("m10", function (live, data, root) {
    var D = data.m10_ml_forecasting, Y = data.town_year, PATH = data.path, own = LX.store.get(KEY, {}) || {};
    function keep(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var F = facts(Y, D), P = F.P, B = F.base, steps = [], S = {};
    var best = F.best, fBest = best.F.f, dayRule = rule(P, "day");

    // ---- 1 the task, the split and a guess
    steps.push({
      text: "Forecast every hour of tomorrow's Plains (SPP) [[demand|demand]] at midnight, with 2025 split by time: train to September, choose on October, test once on November. Which simple rule misses least?",
      build: function (act, api) {
        var P1 = LX.Plot(act, { text: "Text version of the chart" }), dm = [], dates = Object.keys(P.dayMean).sort();
        dates.forEach(function (k) { dm.push(P.dayMean[k]); });
        var idx = function (d) { return dates.indexOf(d); };
        P1.render({ x: { min: 0, max: dates.length, ticks: [[0, "Jan", "start"], [idx("2025-04-01"), "Apr"], [idx("2025-07-01"), "Jul"], [idx("2025-10-01"), "Oct"], [dates.length, "Dec 31", "end"]] },
                    y: { min: 20000, max: 50000, step: 10000, fmt: function (v) { return gw(v); }, unit: "GW" }, height: 200, heightN: 180,
                    spans: [{ x0: idx(D.split.train[0]), x1: idx(D.split.train[1]) + 1, color: COL.train, op: 0.08, label: "Train" }, { x0: idx(D.split.val[0]), x1: idx(D.split.val[1]) + 1, color: COL.val, op: 0.16, label: "Choose" }, { x0: idx(D.split.test[0]), x1: idx(D.split.test[1]) + 1, color: COL.test, op: 0.16, label: "Test" }],
                    lines: [{ values: dm, x0: 0.5, color: COL.actual, width: 1.8 }], legend: [{ label: "Daily mean demand", color: COL.actual }],
                    aria: "SPP's daily mean demand in 2025, with the training, choosing and test periods shaded.",
                    text: { head: ["Period", "Dates", "Hours"], rows: [["Train", "8 January to 30 September", String(P.train.length)], ["Choose (validate)", "October", String(P.val.length)], ["Test", "November", String(P.test.length)]] } });
        LX.Predict(act, { id: "m10-rule", q: "Your pick:", answer: "day", fresh: true, title: false,
          options: D.guess.map(function (g) { return { value: g.value, label: g.label, color: COL[g.value] }; }),
          lockText: "Locked in. Step 2 scores all three on October.",
          onPick: function (v) { keep("guess", v); api.done(); api.saw("Train on " + P.train.length.toLocaleString("en-US") + " hours, choose on " + P.val.length + ", test on " + P.test.length + ". Hours are never shuffled across those lines: tomorrow must stay unseen."); } });
      }
    });

    // ---- 2 the baselines on October
    steps.push({
      text: "Score the three [[forecast-baseline|baselines]] on October, as [[mae|MAE]] in MW and [[mape|MAPE]]. Any learned model must beat the best of them.",
      build: function (act, api) {
        var seen = {}, keys = ["persist", "day", "week"];
        seg(rowEl(act), keys.map(function (k) { return RNAME[k]; }), -1, function (i) { seen[keys[i]] = 1; draw(keys[i]); }, "Baseline");
        var P2 = LX.Plot(act, { text: "Text version of the chart" }), tb = H("div", null, act), out = readout(act);
        function draw(k) {
          P2.render(weekSpec(P, D.weeks.val[0], D.weeks.val[1], [{ f: rule(P, k), color: COL[k], label: RNAME[k], dash: "5 3" }], null, "An October week: actual demand and " + RNAME[k].toLowerCase() + "."));
          table(tb, ["October", "MAE", "RMSE", "MAPE"], keys.filter(function (z) { return seen[z]; }).map(function (z) { var s = B[z].val; return [RNAME[z], mw(s.mae), mw(s.rmse), pc(s.mape)]; }));
          out.innerHTML = RNAME[k] + ": misses by <b>" + mw(B[k].val.mae) + "</b> on average.";
          if (Object.keys(seen).length === 3) { api.done(); api.saw("Same hour yesterday misses by " + mw(B.day.val.mae) + " (" + pc(B.day.val.mape) + "); the latest hour held flat by " + mw(B.persist.val.mae) + ". A learned model must beat " + mw(B.day.val.mae) + " on October to earn its place."); }
          else api.saw("Baselines scored: " + Object.keys(seen).length + " of 3.", true);
        }
        out.textContent = "Pick a baseline.";
      }
    });

    // ---- 3 targets and horizons
    steps.push({
      text: "Which baseline wins depends on the target and the [[forecast-horizon|horizon]]. Compare holding the latest value 1 to 24 hours ahead for demand, wind and solar, on October.",
      build: function (act, api) {
        var seen = {}, keys = ["demand", "wind", "solar"], lab = { demand: "Demand", wind: "Wind", solar: "Solar" }, Hs = D.horizons;
        seg(rowEl(act), keys.map(function (k) { return lab[k]; }), -1, function (i) { seen[keys[i]] = 1; draw(); }, "Target");
        var P3 = LX.Plot(act, { text: "Text version of the chart" }), out = readout(act);
        function draw() {
          var ks = keys.filter(function (k) { return seen[k]; });
          P3.render({ x: { min: 0, max: 24, ticks: Hs.map(function (h, j) { return [h, h + " h", j === Hs.length - 1 ? "end" : "middle"]; }) }, y: { min: 0, max: 50, step: 10, fmt: function (v) { return v + "%"; }, unit: "% of max" }, height: 210, heightN: 190,
                     lines: ks.map(function (k) { return { pts: Hs.map(function (h, j) { return [h, F.horizon[k][j]]; }), color: COL[k], dots: true }; }), legend: ks.map(function (k) { return { label: lab[k], color: COL[k] }; }),
                     aria: "Mean absolute error of holding the latest value, by hours ahead, in % of each series' 2025 maximum.",
                     text: { head: ["Hours ahead"].concat(ks.map(function (k) { return lab[k]; })), rows: Hs.map(function (h, j) { return [String(h)].concat(ks.map(function (k) { return F.horizon[k][j].toFixed(1) + "%"; })); }) } });
          out.innerHTML = ks.map(function (k) { return lab[k] + ": " + F.horizon[k][0].toFixed(1) + "% at 1 h, " + F.horizon[k][3].toFixed(1) + "% at 12 h, " + F.horizon[k][4].toFixed(1) + "% at 24 h"; }).join("; ") + ".";
          if (ks.length === 3) { api.done(); api.saw("Wind's error grows from " + F.horizon.wind[0].toFixed(1) + "% to " + F.horizon.wind[4].toFixed(1) + "% over a day; solar's falls back at 24 hours, when the sun returns. Solar is zero in " + F.solarZeros + " of " + P.val.length + " October hours, so MAPE cannot score it."); }
          else api.saw("Targets compared: " + ks.length + " of 3.", true);
        }
        out.textContent = "Pick a target.";
      }
    });

    // ---- 4 a learned model: pick features, fit on the training months, score on October
    steps.push({
      text: "Fit a [[linear-regression|linear regression]] on January to September with [[feature|features]] you pick, then score it on October. Every feature must be known at midnight.",
      build: function (act, api) {
        var use = {}, tried = {};
        H("p", { class: "lx-hint", text: "Always in: same hour yesterday. Add:" }, act);
        var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Features to add" }, act);
        OPT.forEach(function (g) { LX.Toggle(tg, { label: NAMES[g].charAt(0).toUpperCase() + NAMES[g].slice(1), on: false, onChange: function (on) { use[g] = on; } }); });
        var r = rowEl(act);
        var fb = H("button", { type: "button", class: "lx-btn small", text: "Fit and score on October" }, r), ab = H("button", { type: "button", class: "lx-btn small ghost", text: "Rank all 16 mixes" }, r);
        function key() { return OPT.filter(function (g) { return use[g]; }).join("+") || "day"; }
        fb.addEventListener("click", function () {
          var m = F.mixes.filter(function (z) { return z.key === key(); })[0]; tried[m.key] = m;
          table(tb, ["Features", "MAE, October", "Against same hour yesterday"], Object.keys(tried).map(function (k) { var z = tried[k]; return [mixName(z.use), mw(z.val), vs(z.val, B.day.val.mae)]; }));
          out.innerHTML = "This mix: <b>" + mw(m.val) + "</b> on October, " + vs(m.val, B.day.val.mae) + " than same hour yesterday.";
          keep("mix", m.key);
          if (Object.keys(tried).length >= 2) ab.removeAttribute("aria-disabled");
          api.saw(Object.keys(tried).length >= 2 ? "Now rank all 16 mixes by October." : "Try another mix.", true);
        });
        var tb = H("div", null, act), out = readout(act);
        ab.setAttribute("aria-disabled", "true");
        ab.addEventListener("click", function () {
          if (ab.getAttribute("aria-disabled") === "true") return;
          table(tb, ["Rank", "Features", "MAE, October"], F.mixes.map(function (z, j) { return [String(j + 1), mixName(z.use), mw(z.val)]; }));
          api.done(); api.saw("Best on October: " + mixName(best.use) + ", " + mw(best.val) + ", " + pc(F.skillVal) + " better than same hour yesterday. Small, but earned on hours the fit never saw.");
        });
        out.textContent = "Pick features, then fit.";
      }
    });

    // ---- 5 find the leak
    steps.push({
      text: "Two more models score far better on October. Mark each one fair or a [[data-leakage|leak]]: could you know its extra feature at midnight, for every hour of tomorrow?",
      build: function (act, api) {
        var cands = [{ k: "lag1", label: "+ the hour before", val: F.leakVal.lag1, leak: true }, { k: "oracle", label: "+ tomorrow's average demand", val: F.leakVal.oracle, leak: true }], marks = {}, out = readout(act);
        H("p", { class: "lx-hint", text: "The best mix scores " + mw(best.val) + " on October." }, act);
        cands.forEach(function (c) {
          var r = rowEl(act); H("span", { class: "m10-cand", html: "<b>" + c.label + "</b>: " + mw(c.val) }, r);
          seg(r, ["Fair", "Leak"], -1, function (i) { marks[c.k] = i === 1; check(); }, c.label);
        });
        act.appendChild(out);
        function check() {
          var n = Object.keys(marks).length, right = cands.filter(function (c) { return marks[c.k] === c.leak; }).length;
          out.innerHTML = "Marked " + n + " of 2; " + (n === 2 ? right + " right." : "");
          if (n === 2 && right === 2) { api.done(); api.saw("At midnight you know neither the hour before 18:00 tomorrow nor tomorrow's average. Scores of " + mw(F.leakVal.lag1) + " and " + mw(F.leakVal.oracle) + " are look-ahead: a score that looks too good usually is."); }
          else if (n === 2) api.saw("Not quite: ask whether each value exists at midnight for 18:00 tomorrow.", true);
        }
        out.textContent = "Mark both.";
      }
    });

    // ---- 6 open the test month once
    steps.push({
      text: "The choice is made on October, so now open November, once. Compare the chosen mix with same hour yesterday on hours nobody has looked at.",
      build: function (act, api) {
        var b = H("button", { type: "button", class: "lx-btn small", text: "Open November" }, rowEl(act)), host = H("div", null, act), out = readout(act);
        b.addEventListener("click", function () {
          host.innerHTML = "";
          LX.Plot(host, { text: "Text version of the chart" }).render(weekSpec(P, D.weeks.test[0], D.weeks.test[1], [{ f: dayRule, color: COL.day, label: "Same hour yesterday", dash: "5 3" }, { f: fBest, color: COL.model, label: "Chosen mix" }], null, "The last November week: actual demand, same hour yesterday and the chosen mix."));
          var tb = H("div", null, host);
          table(tb, ["MAE", "October (choose)", "November (test)"], [["Same hour yesterday", mw(B.day.val.mae), mw(B.day.test.mae)], ["Chosen mix", mw(best.val), mw(best.test)], ["Skill", pc(F.skillVal), pc(F.skillTest)]]);
          out.innerHTML = "November: <b>" + mw(best.test) + "</b> against " + mw(B.day.test.mae) + ".";
          api.done(); api.saw("November: " + mw(best.test) + " against " + mw(B.day.test.mae) + ", " + pc(F.skillTest) + " better. The mix best on November scores " + mw(F.testBest.test) + ", but picking it there would turn the test into training.");
        });
        out.textContent = "";
      }
    });

    // ---- 7 a band from October's misses
    steps.push({
      text: "One line hides how unsure a forecast is. Build a [[prediction-interval|band]] from the chosen model's October misses and check how often November lands inside it.",
      build: function (act, api) {
        var lv = [["50", 4, 14], ["80", 1, 17], ["90", 0, 18]], seen = {}, host = H("div", null, act), out = readout(act);
        seg(rowEl(act), lv.map(function (l) { return l[0] + "% band"; }), -1, function (i) { seen[i] = 1; draw(i); }, "Band level");
        act.appendChild(host); act.appendChild(out);
        function draw(i) {
          var l = lv[i], lo = F.Q[l[1]], hi = F.Q[l[2]];
          host.innerHTML = "";
          LX.Plot(host, { text: "Text version of the chart" }).render(weekSpec(P, D.weeks.test[0], D.weeks.test[1], [{ f: fBest, color: COL.model, label: "Chosen mix" }], { f: fBest, lo: lo, hi: hi, label: l[0] + "% band from October's misses" }, "The last November week with a " + l[0] + "% band."));
          out.innerHTML = l[0] + "% band: " + mw(lo).replace(/^-/, "−") + " to +" + mw(hi) + " around the forecast; it holds <b>" + pc(F.band.cov[l[0]]) + "</b> of November's hours.";
          if (seen[1]) { api.done(); api.saw("The 80% band holds " + pc(F.band.cov[80]) + " of November's hours, more than 80%: November's misses were smaller than October's. Hours come in runs, so a month is a small sample."); }
          else api.saw("Pick the 80% band too.", true);
        }
        out.textContent = "Pick a band.";
      }
    });

    // ---- 8 width against pinball loss
    steps.push({
      text: "A wider band holds more hours, so [[coverage|coverage]] alone rewards width; scale the band and watch [[pinball-loss|pinball loss]], which also charges for width. Look, do not tune: November is the test.",
      build: function (act, api) {
        var W = D.widths, seen = {}, tb = H("div", null, act), out = readout(act);
        var sl = S.s8 = LX.Slider(act, { label: "Band width, times October's", color: COL.band, min: 0, max: W.length - 1, step: 1, value: W.indexOf(1), fmt: function (i) { return "× " + W[i]; }, onChange: function (i) { seen[i] = 1; draw(i, true); } });
        act.appendChild(tb); act.appendChild(out);
        function draw(i, user) {
          table(tb, ["Width", "80% band holds", "Mean width", "Pinball loss"], F.widths.filter(function (w, j) { return seen[j] || j === W.indexOf(1); }).map(function (w) { return ["× " + w.s, pc(w.b.cov[80]), mw(w.b.width), w.b.pinball.toFixed(1) + " MW"]; }));
          var w = F.widths[i];
          out.innerHTML = "× " + w.s + ": holds <b>" + pc(w.b.cov[80]) + "</b>, pinball loss <b>" + w.b.pinball.toFixed(1) + " MW</b>.";
          if (user && Object.keys(seen).length >= 3) { api.done(); api.saw("Coverage keeps rising: " + pc(F.widths[W.length - 1].b.cov[80]) + " at × " + W[W.length - 1] + ". Pinball loss is lowest at × " + F.pbBest.s + " (" + F.pbBest.b.pinball.toFixed(1) + " MW) and rises on both sides: it wants bands narrow and honest."); }
          else if (user) api.saw("Try a few more widths, narrow and wide.", true);
        }
        draw(W.indexOf(1), false);
      }
    });

    // ---- 9 the worst days
    steps.push({
      text: "Averages hide bad days. Tap the November day the chosen model missed most; it has no temperature or holiday input.",
      build: function (act, api) {
        var DL = F.daily, P9 = LX.Plot(act, { text: "Text version of the chart" }), out = readout(act), sel = -1;
        function draw() {
          P9.render({ x: { min: 0, max: DL.length, ticks: [[0, "Nov 1", "start"], [9, "10"], [19, "20"], [DL.length, "30", "end"]] }, y: { min: 0, max: 3000, step: 500, fmt: function (v) { return v.toLocaleString("en-US"); }, unit: "MW" }, height: 200, heightN: 180,
                      bars: DL.map(function (x, k) { return { x0: k + 0.1, x1: k + 0.9, y0: 0, y1: x.mae, color: x.date === D.holiday.date ? COL.test : COL.model, op: k === sel ? 0.95 : 0.6 }; }),
                      pick: { n: DL.length, sel: sel, onPick: function (k) { sel = k; pick(k); } },
                      aria: "Mean absolute error of the chosen model on each day of November.",
                      text: { head: ["Day", "MAE"], rows: DL.map(function (x) { return [dayLabel(x.date), mw(x.mae)]; }) } });
        }
        S.pick9 = pick;
        function pick(k) {
          sel = k; draw();
          var x = DL[k], rank = DL.slice().sort(function (a, b) { return b.mae - a.mae; }).indexOf(x) + 1;
          out.innerHTML = dayLabel(x.date) + (x.date === D.holiday.date ? " (" + D.holiday.name + ")" : "") + ": <b>" + mw(x.mae) + "</b>, the " + (rank === 1 ? "worst" : rank + (rank === 2 ? "nd" : rank === 3 ? "rd" : "th") + " worst") + " of " + DL.length + " days.";
          api.done(); api.saw("The three worst days, " + F.worst.map(function (w) { return dayLabel(w.date); }).join(", ") + ", hold " + pc(F.worstShare, 0) + " of November's error; the 27th is " + D.holiday.name + ". Report the bad days, not only the mean.");
        }
        draw();
      }
    });

    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "m10-steps", steps: steps });
    function clickIn(sel, i) { var b = cardsHost.querySelectorAll(sel)[i || 0]; if (b) b.click(); }
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 6 : m ? Math.min(steps.length, +m[1]) : 0;
      if (!n) return null;
      cards.go(n - 1);
      if (n === 1) clickIn(".lx-step-act .lx-choice", 1);
      if (n === 2 || n === 3) [0, 1, 2].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 4) { clickIn(".lx-step-act .m10-row .lx-btn", 0); clickIn(".lx-step-act .lx-toggles button", 0); clickIn(".lx-step-act .m10-row .lx-btn", 0); clickIn(".lx-step-act .m10-row .lx-btn", 1); }
      if (n === 5) [1, 3].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 6) clickIn(".lx-step-act .m10-row .lx-btn");
      if (n === 7) clickIn(".lx-step-act .lx-seg button", 1);
      if (n === 8 && S.s8) [0, D.widths.length - 1, 1].forEach(function (i) { S.s8.set(i, true); });
      if (n === 9 && S.pick9) S.pick9(F.daily.indexOf(F.worst[0]));
      return { view: state };
    }, cards);
    explain(D, F, PATH);
  });

  // ---------------------------------------------------------------- explain layer: the pipeline as a flowchart, targets
  // and their traps as a table (prices as a card), and where the numbers hold
  function explain(D, F, PATH) {
    var x = document.getElementById("m10-explain"); if (!x) return;
    x.innerHTML = "";
    var B = F.base;
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "An honest forecast, move by move", lede: "The reference case, whatever you set above: SPP demand, made at midnight for the next day. Trace three cases.",
      nodes: {
        q: { t: "Target and horizon", tN: ["Target and", "horizon"], s: "demand, 1–24 h", sN: "1–24 h", k: "end" },
        sp: { t: "Split by time", tN: ["Split", "by time"], s: "train · choose · test", sN: "never shuffle" },
        bl: { t: "Baselines first", tN: ["Baselines", "first"], s: "same hour yesterday", sN: "yesterday" },
        ft: { t: "Known at midnight?", tN: ["Known at", "midnight?"], k: "q" },
        lk: { t: "Leak: drop it", tN: ["Leak:", "drop it"], s: "look-ahead", sN: "look-ahead", k: "end" },
        fit: { t: "Fit on train", tN: ["Fit on", "train"], s: "16 mixes", sN: "16 mixes" },
        ch: { t: "Choose on October", tN: ["Choose on", "October"], s: mw(F.best.val), sN: "October" },
        te: { t: "Test once on November", tN: ["Test once", "on November"], s: mw(F.best.test), sN: "November" },
        rp: { t: "Report scores, bands, bad days", tN: ["Report scores,", "bands, bad days"], k: "end" }
      },
      cols: 3, at: { q: [1, 0], sp: [1, 1], bl: [1, 2], ft: [1, 3], lk: [2, 3], fit: [1, 4], ch: [1, 5], te: [1, 6], rp: [1, 7] },
      colsN: 2, atN: { q: [0, 0], sp: [0, 1], bl: [0, 2], ft: [0, 3], lk: [1, 3], fit: [0, 4], ch: [0, 5], te: [0, 6], rp: [0, 7] },
      edges: [["q", "sp"], ["sp", "bl"], ["bl", "ft"], ["ft", "lk", "no"], ["ft", "fit", "yes"], ["fit", "ch"], ["ch", "te"], ["te", "rp"]],
      traces: [
        { label: "The chosen mix", path: ["q", "sp", "bl", "ft", "fit", "ch", "te", "rp"], text: "October " + mw(F.best.val) + ", November " + mw(F.best.test) + ": " + pc(F.skillTest) + " better than same hour yesterday." },
        { label: "+ the hour before", path: ["q", "sp", "bl", "ft", "lk"], text: mw(F.leakVal.lag1) + " on October, from a value nobody has at midnight." },
        { label: "Chosen on November", path: ["q", "sp", "bl", "ft", "fit", "te", "rp"], text: "Skipping October would report " + mw(F.testBest.test) + ": a test that also chose is no longer a test." }
      ], sel: 0
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Targets, baselines and traps", text: true,
      columns: [{ key: "name", label: "Target", main: true }, { key: "base", label: "Hard-to-beat baseline" }, { key: "trap", label: "Trap" }, { key: "here", label: "On this page", phoneHide: true }],
      rows: [
        { key: "load", color: "var(--lx-ink)", name: "Demand", base: "same hour yesterday or last week", trap: "holidays, daylight saving, new large loads", here: "October MAE " + mw(B.day.val.mae) + " (" + pc(B.day.val.mape) + ")" },
        { key: "wind", color: "var(--lx-wind)", name: "Wind", base: "the latest value, for the next few hours", trap: "curtailment inside the actuals, icing", here: F.horizon.wind[0].toFixed(1) + "% at 1 h, " + F.horizon.wind[4].toFixed(1) + "% at 24 h" },
        { key: "solar", color: "var(--lx-solar)", name: "Solar", base: "same hour yesterday", trap: "zero at night breaks MAPE; snow, clipping", here: F.solarZeros + " of " + F.P.val.length + " October hours at zero" }
      ],
      sorts: [{ label: "As listed", order: ["load", "wind", "solar"], note: "Score each target against its own baseline, at its own horizon." }]
    });
    var pc2 = H("div", { class: "lx-xcard" }, x);
    H("header", { class: "lx-x-head", html: "<h3>Why prices are harder</h3>" }, pc2);
    var ref = function (c) { return PATH && LX.lessonRefHTML ? LX.lessonRefHTML(PATH, c) : c + " (upcoming)"; };
    H("p", { html: "A price is set by the last plant needed (" + ref("M1") + "), so it jumps when demand nears the supply's steep end, and it changes with market rules (" + ref("A3") + "). Spikes and regime changes make yesterday a poor guide; this page builds no price model." }, pc2);
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where this lesson's numbers hold",
      holds: ["SPP's reported 2025 demand, as cleaned in the course's data (EIA-930);", "a forecast made at local midnight for every hour of the next day;", "train January to September, choose on October, test on November 2025;", "linear least squares with lags and calendar features."],
      leaves: ["weather forecasts and temperature, the strongest real inputs;", "holidays and daylight-saving days as features;", "updates during the day, as operators make them;", "other months: one test month is a small sample."],
      source: "Data: EIA-930 via the course's town_year.json; SPP's 2025 peak " + D.peakMW.toLocaleString("en-US") + " MW." });
  }
})();
