// k05-probability-statistics.js — Toolbox K5, "Probability and statistics" (step cards).
//
// Just-in-time statistics for lesson 4 (forecasts) and the Modeler lessons on uncertainty (M7 Monte Carlo, M8 stochastic
// optimization, M9 surrogates; A5 adequacy). Eight step cards on one chart of real data, a practice drill and four data tasks.
//
// Data: assets/learn/data/04-forecasts.json `jan_apr` (lesson 4's file): the 2,716 valid hours of January-April 2025 on
// the Southwest Power Pool grid (EIA-930), each as e = (actual demand - day-ahead forecast) / forecast, stored sorted in
// tenths of a percent (so every value is a multiple of 0.1 percentage point). May-December is left out, as in lesson 4:
// from May the forecast SPP reports runs 8-15% above its reported demand in every month (monthly_forecast_ratio), cause
// unverified. assets/learn/data/town.json gives the sizes of Prairie Town's two gas plants (illustrative), called gas plants A
// (150 MW) and B (100 MW) in cards 7 and 8, where their technology plays no part.
//
// Model (statistical, no solver; every number the page states comes from these functions and is checked by
// _tests/learn/test_k05-probability-statistics.js, which also writes the no-JS fallback block with --write):
//   mean = sum / n;  sd = sqrt(sum (x - mean)^2 / n) (population; n - 1 changes it by under 0.001 point here)
//   percentile q_p: linear interpolation between sorted values at rank (n - 1) p (the common "type 7" rule); with these
//   rounded values it agrees with lesson 4's quantiles to 0.1 point
//   share above t = count(x > t) / n;  hours in [a, b] = count(a <= x <= b) (ends included; values sit on a 0.1 grid, so
//   hours tied at an interval's ends count in, and a nominal 50% interval holds a little more than 50%)
//   median check: a marker m is a median when at least half the hours are at or below m and at least half at or above
//   histogram: integer tenths t into bins floor(t / w) of w tenths (exact, no floating-point edges)
//   sampling: n independent draws with replacement from this fixed list (hours may repeat) from a seeded generator;
//   standard error of a share sqrt(p (1 - p) / n). It shows sampling scatter, not how other months or years differ.
//   two plants out independently with chances p1, p2: both p1 p2; at least one 1 - (1 - p1)(1 - p2);
//   expected MW out = sum over the four cases of MW x chance = p1 x MW1 + p2 x MW2 (true with or without independence,
//   as long as each plant's own outage chance stays p1, p2)
(function () {
  "use strict";
  // shared pieces: LX.Drill (the seeded practice drill; its rng also draws the samples here) and LX.NumAnswer (number boxes)
  var DR = (typeof window !== "undefined" && window.LX && window.LX.Drill) || require("./components/drill.js");
  var rng = DR.rng;

  // ---------------------------------------------------------------- pure model
  function tenths(fc) { return fc.jan_apr.rel_error_tenths_pct.slice().sort(function (a, b) { return a - b; }); }
  function errors(fc) { return tenths(fc).map(function (v) { return v / 10; }); }       // % (sorted)
  function sum(x) { var s = 0; for (var i = 0; i < x.length; i++) s += x[i]; return s; }
  function mean(x) { return sum(x) / x.length; }
  function sd(x, sample) { var m = mean(x), s = 0; for (var i = 0; i < x.length; i++) s += (x[i] - m) * (x[i] - m); return Math.sqrt(s / (x.length - (sample ? 1 : 0))); }
  function sorted(x) { return x.slice().sort(function (a, b) { return a - b; }); }
  function quantile(xs, p) {   // xs sorted ascending
    var h = (xs.length - 1) * p, lo = Math.floor(h), f = h - lo;
    return lo + 1 < xs.length ? xs[lo] + (xs[lo + 1] - xs[lo]) * f : xs[lo];
  }
  function median(x) { return quantile(sorted(x), 0.5); }
  function countAbove(x, t) { var n = 0; for (var i = 0; i < x.length; i++) if (x[i] > t + 1e-9) n++; return n; }
  function countBelow(x, t) { var n = 0; for (var i = 0; i < x.length; i++) if (x[i] < t - 1e-9) n++; return n; }
  function countIn(x, a, b) { var n = 0; for (var i = 0; i < x.length; i++) if (x[i] >= a - 1e-9 && x[i] <= b + 1e-9) n++; return n; }
  // histogram of integer tenths in bins of w tenths: [{lo, hi (in %), n}] covering every bin from the lowest to the highest
  function histogram(t10, w) {
    var k0 = Math.floor(t10[0] / w), k1 = Math.floor(t10[t10.length - 1] / w), bins = [];
    for (var k = k0; k <= k1; k++) bins.push({ lo: k * w / 10, hi: (k + 1) * w / 10, n: 0 });
    t10.forEach(function (t) { bins[Math.floor(t / w) - k0].n++; });
    return bins;
  }
  function draw(x, n, r) { var out = []; for (var i = 0; i < n; i++) out.push(x[Math.floor(r() * x.length)]); return out; }
  // reps samples of n hours each; each gives the share of its hours above t (a fraction)
  function sampleShares(x, n, reps, r, t) {
    var out = [];
    for (var k = 0; k < reps; k++) out.push(countAbove(draw(x, n, r), t) / n);
    return out;
  }
  function stdErr(p, n) { return Math.sqrt(p * (1 - p) / n); }
  function joint(p1, p2) { return { both: p1 * p2, one: p1 * (1 - p2) + p2 * (1 - p1), none: (1 - p1) * (1 - p2), any: 1 - (1 - p1) * (1 - p2) }; }
  // gas plants A and B (the sizes of Prairie Town's combined-cycle plant and peaker) out independently with chance p each
  function plantCases(town, p) {
    var a = town.fleet.cc.mw, b = town.fleet.peaker.mw;
    return [{ key: "none", label: "Neither out", mw: 0, p: (1 - p) * (1 - p) },
            { key: "cc", label: "Only plant A out", mw: a, p: p * (1 - p) },
            { key: "pk", label: "Only plant B out", mw: b, p: (1 - p) * p },
            { key: "both", label: "Both out", mw: a + b, p: p * p }];
  }
  // is marker m a median? at least half the hours at or below it and at least half at or above it (ties count both ways)
  function medianCheck(x, m) {
    var below = countBelow(x, m), above = countAbove(x, m), at = x.length - below - above;
    return { below: below, above: above, at: at, ok: 2 * (below + at) >= x.length && 2 * (above + at) >= x.length };
  }
  // the histogram's x axis: -10% to +10%, widened to the outer bin edges when wide bins reach past them
  function histRange(bins) { return { min: Math.min(-10, bins[0].lo), max: Math.max(10, bins[bins.length - 1].hi) }; }
  // the sampling chart's x axis, in %: 0 to 30, widened in steps of 10 so every estimate drawn sits inside, clear of the end
  function sampleMax(est) { var m = 0; est.forEach(function (e) { if (100 * e > m) m = 100 * e; }); return Math.max(30, 10 * Math.ceil((m + 1) / 10)); }
  function expected(cases) { return cases.reduce(function (s, c) { return s + c.mw * c.p; }, 0); }
  // what one wildly wrong reading does to each summary (the explain layer's table)
  function wild(x, v) {
    var y = sorted(x.concat([v])), xs = sorted(x);
    return { mean: mean(y) - mean(xs), median: quantile(y, 0.5) - quantile(xs, 0.5), sd: sd(y) - sd(xs),
             iqr: (quantile(y, 0.75) - quantile(y, 0.25)) - (quantile(xs, 0.75) - quantile(xs, 0.25)),
             above5: countAbove(y, 5) / y.length - countAbove(xs, 5) / xs.length };
  }
  var LEVELS = { "50": [0.25, 0.75], "80": [0.1, 0.9], "95": [0.025, 0.975] };
  var PLANT_P = 0.05, THRESH = 5, SIZES = [10, 100, 1000], REPS = 20, WIDTHS = [2, 10, 40], WILD = 100;
  // every number the page states, in one place
  function summary(fc, town) {
    var t10 = tenths(fc), x = t10.map(function (v) { return v / 10; }), n = x.length, m = mean(x), s = sd(x);
    var q = function (p) { return quantile(x, p); };
    var S = { n: n, mean: m, median: q(0.5), sd: s, sdSample: sd(x, true), min: x[0], max: x[n - 1],
              q25: q(0.25), q75: q(0.75), pos: countAbove(x, 0) / n, neg: countBelow(x, 0) / n, zero: countIn(x, 0, 0),
              in1sd: countIn(x, m - s, m + s) / n, lo1sd: m - s, hi1sd: m + s, absMean: mean(x.map(Math.abs)) };
    S.above = countAbove(x, THRESH); S.aboveShare = S.above / n;
    S.mid = countIn(x, -2, 2.9) / n;            // the 1-point bins from -2% up to +3%
    S.levels = {};
    Object.keys(LEVELS).forEach(function (k) { var a = q(LEVELS[k][0]), b = q(LEVELS[k][1]); S.levels[k] = { lo: a, hi: b, n: countIn(x, a, b) }; });
    S.se = SIZES.map(function (k) { return stdErr(S.aboveShare, k); });
    var J = joint(PLANT_P, PLANT_P), C = plantCases(town, PLANT_P);
    S.plants = { p: PLANT_P, both: J.both, any: J.any, hoursYear: J.both * 8760, cases: C, ev: expected(C), cc: town.fleet.cc.mw, pk: town.fleet.peaker.mw };
    S.wild = wild(x, WILD);
    var r = fc.monthly_forecast_ratio.slice(4);
    S.mayDec = [Math.min.apply(null, r), Math.max.apply(null, r)].map(function (v) { return (v - 1) * 100; });
    S.below5 = countBelow(x, -THRESH); S.within2 = countIn(x, -2, 2) / n;
    S.p99 = q(0.99);
    S.med = medianCheck(x, S.median);
    return S;
  }

  // ---------------------------------------------------------------- formats (shared by the page and the test)
  var MINUS = "−";
  function sgn(v, d) { var r = (+v).toFixed(d == null ? 1 : d); if (/^-?0(\.0+)?$/.test(r)) return r.replace("-", ""); return (v > 0 ? "+" : MINUS) + r.replace("-", ""); }
  function pct(v, d) { return sgn(v, d) + "%"; }                   // a signed error in %: "+0.8%", "−2.1%"
  function share(f, d) { return (100 * f).toFixed(d == null ? 1 : d) + "%"; }   // a share: "4.9%"
  function int(v) { return Math.round(v).toLocaleString("en-US"); }

  // ---------------------------------------------------------------- practice drill (seeded, so tests can replay it)
  var KINDS = ["mean", "count", "both", "median", "ev", "either", "sample"];
  var THRESHOLDS = [1, 2, 3, 4, 6, 7];
  function drillItem(fc, k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (a, b) { return a + Math.floor(r() * (b - a + 1)); };
    if (kind === "mean") {
      var v = [], s = 0; for (var i = 0; i < 4; i++) { v.push(pick(-4, 6)); s += v[i]; }
      var last = pick(-4, 6); while ((s + last) % 5 !== 0) last++;   // a whole-number mean
      v.push(last); s += last;
      return { kind: kind, q: "Five hourly forecast errors: " + v.map(function (u) { return sgn(u, 0) + "%"; }).join(", ") + ". Their mean, in %?", answer: s / 5, tol: 0.05, unit: "%",
               why: "Add them (" + sgn(s, 0) + ") and divide by 5: " + sgn(s / 5, 0) + "%." };
    }
    if (kind === "median") {
      var m = pick(0, 1) ? 5 : 6, w = []; for (var j = 0; j < m; j++) w.push(pick(-5, 9));
      var ws = sorted(w), med = m % 2 ? ws[(m - 1) / 2] : (ws[m / 2 - 1] + ws[m / 2]) / 2;
      return { kind: kind, q: m + " hourly errors: " + w.map(function (u) { return sgn(u, 0) + "%"; }).join(", ") + ". Their median, in %?", answer: med, tol: 0.05, unit: "%",
               why: "Sorted: " + ws.map(function (u) { return sgn(u, 0); }).join(", ") + ". " + (m % 2 ? "The middle (3rd) value is " + sgn(med, 0) + "%." : "Average the 3rd and 4th: (" + sgn(ws[2], 0) + " + " + sgn(ws[3], 0) + ") ÷ 2 = " + sgn(med, 1) + "%.") };
    }
    if (kind === "count") {
      var x = errors(fc), t = THRESHOLDS[pick(0, THRESHOLDS.length - 1)], up = r() < 0.6, c = up ? countAbove(x, t) : countBelow(x, -t), p = 100 * c / x.length;
      return { kind: kind, q: "Of the page's " + int(x.length) + " hours, " + int(c) + " had demand more than " + t + "% " + (up ? "above" : "below") + " the forecast. The chance that an hour picked at random from them is one of these, in % (one decimal)?",
               answer: Math.round(p * 10) / 10, tol: 0.06, unit: "%", why: int(c) + " ÷ " + int(x.length) + " = " + p.toFixed(1) + "%: a share of these hours, an estimate for hours like them." };
    }
    if (kind === "both" || kind === "either") {
      var p1 = pick(1, 10) * 2, p2 = pick(1, 8) * 5, both = Math.round(p1 * p2) / 100, any = Math.round(100 * (p1 + p2) - p1 * p2) / 100;
      var base = "Two machines fail independently: one in " + p1 + "% of hours, the other in " + p2 + "% (illustrative). ";
      if (kind === "both") return { kind: kind, q: base + "In what % of hours are both down?", answer: both, tol: 0.005, unit: "%",
                                    why: p1 / 100 + " × " + p2 / 100 + " = " + (both / 100).toFixed(4).replace(/0+$/, "") + ", so " + both + "% of hours; the product holds because they are independent." };
      return { kind: kind, q: base + "In what % of hours is at least one down?", answer: any, tol: 0.005, unit: "%",
               why: "1 − (1 − " + p1 / 100 + ") × (1 − " + p2 / 100 + ") = " + any + "%. Adding " + p1 + " + " + p2 + " counts the hours when both are down twice." };
    }
    if (kind === "ev") {
      var lv = [0, 10 * pick(2, 8), 10 * pick(9, 15)], pr = [pick(1, 5) * 10, 0, 0];
      pr[1] = pick(1, (100 - pr[0]) / 10 - 1) * 10; pr[2] = 100 - pr[0] - pr[1];
      var ev = Math.round(lv[0] * pr[0] + lv[1] * pr[1] + lv[2] * pr[2]) / 100;
      return { kind: kind, q: "A wind farm's output in an hour is " + lv[0] + " MW with chance " + pr[0] + "%, " + lv[1] + " MW with chance " + pr[1] + "%, or " + lv[2] + " MW with chance " + pr[2] + "% (illustrative). Its expected output, in MW?",
               answer: ev, tol: 0.05, unit: "MW", why: lv[1] + " × " + pr[1] / 100 + " + " + lv[2] + " × " + pr[2] / 100 + " = " + ev + " MW (0 MW adds nothing)." };
    }
    // a whole number of hours first, then its share, so every share shown is one a sample of that size can give
    var nA = [20, 50, 100][pick(0, 2)], nB = [500, 1000, 2000][pick(0, 2)], aFirst = r() < 0.5;
    var cA = pick(0, nA / 5), cB = nB / 100 * (4 + pick(0, 2));
    var A = { n: nA, c: cA, e: 100 * cA / nA }, B = { n: nB, c: cB, e: 100 * cB / nB }, first = aFirst ? A : B, second = aFirst ? B : A;
    var said = function (o) { return int(o.n) + " hours, " + int(o.c) + " of them above (" + o.e + "%)"; };
    return { kind: kind, q: "Two random samples of hours; the event is demand more than 5% above the forecast. Sample 1: " + said(first) + ". Sample 2: " + said(second) + ". Which share is more trustworthy?",
             choices: ["Sample 1", "Sample 2", "Equally trustworthy"], answer: aFirst ? 1 : 0,
             why: "The sample of " + int(nB) + " hours: a share from more hours scatters less (its standard error shrinks with the square root of the sample size)." };
  }
  function drill(fc, seed, n) { return DR.series(function (k, r) { return drillItem(fc, k, r); }, seed, n); }
  // the four data tasks under the drill: answers from the data, with the tolerance the check allows
  function tasks(fc) {
    var x = errors(fc), n = x.length, S = { below0: countBelow(x, 0), within2: countIn(x, -2, 2), below5: countBelow(x, -THRESH), p99: quantile(x, 0.99) };
    return [
      { key: "below0", text: "Share of hours with demand below the forecast (error below 0%), in %.", answer: Math.round(1000 * S.below0 / n) / 10, tol: 0.15, unit: "%",
        how: "From −9.0% to −0.1%: " + int(S.below0) + " hours, " + share(S.below0 / n) + "." },
      { key: "within2", text: "Share of hours within 2% of the forecast either way (from −2.0% to +2.0%), in %.", answer: Math.round(1000 * S.within2 / n) / 10, tol: 0.15, unit: "%",
        how: "From −2.0% to +2.0%: " + int(S.within2) + " hours, " + share(S.within2 / n) + "." },
      { key: "below5", text: "Number of hours with demand more than 5% below the forecast.", answer: S.below5, tol: 0.5, unit: "hours",
        how: "From −9.0% to −5.1%: " + int(S.below5) + " hours, " + share(S.below5 / n) + "." },
      { key: "p99", text: "The error that 99% of hours stay at or below (the 99th percentile), in %, to one decimal.", answer: Math.round(10 * S.p99) / 10, tol: 0.05, unit: "%",
        how: "The lowest upper end with at least 99% of hours at or below it: " + pct(Math.round(10 * S.p99) / 10) + " (" + share(countIn(x, -100, Math.round(10 * S.p99) / 10) / n, 2) + "; one step lower, " + share(countIn(x, -100, Math.round(10 * S.p99) / 10 - 0.1) / n, 2) + ")." }];
  }

  // the explain layer's flowchart traces: estimate a chance by counting, with all hours, a small sample, or the reader's threshold
  function traces(fc, own) {
    var x = errors(fc), n = x.length, c = countAbove(x, THRESH), out = [
      { label: "All " + int(n) + " hours", path: ["event", "count", "divide", "q", "report"], text: "**" + int(c) + " of " + int(n) + " hours above " + pct(THRESH, 0) + ", " + share(c / n) + ".** Report it with the period (January–April 2025) and the count." },
      { label: "A sample of 10 hours", path: ["event", "count", "divide", "q", "more"], text: "**A share above " + pct(THRESH, 0) + " from 10 hours** scatters by about " + (100 * stdErr(c / n, 10)).toFixed(1) + " points (one [[standard-error|standard error]]): say it is rough, or use more hours." }];
    if (own && own.t != null && Math.abs(own.t - THRESH) > 1e-9) {
      var k = countAbove(x, own.t);
      out.push({ label: "Your threshold, " + pct(own.t), path: ["event", "count", "divide", "q", "report"], text: "**" + int(k) + " of " + int(n) + " hours above " + pct(own.t) + ", " + share(k / n) + ".**" });
    }
    return out;
  }

  var model = { tenths: tenths, errors: errors, mean: mean, sd: sd, quantile: quantile, median: median, countAbove: countAbove, countBelow: countBelow,
                countIn: countIn, histogram: histogram, rng: rng, draw: draw, sampleShares: sampleShares, stdErr: stdErr, joint: joint,
                plantCases: plantCases, expected: expected, medianCheck: medianCheck, histRange: histRange, sampleMax: sampleMax, wild: wild, summary: summary, sgn: sgn, pct: pct, share: share, int: int,
                drill: drill, drillItem: drillItem, tasks: tasks, traces: traces,
                LEVELS: LEVELS, PLANT_P: PLANT_P, THRESH: THRESH, SIZES: SIZES, REPS: REPS, WIDTHS: WIDTHS, WILD: WILD, KINDS: KINDS };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H;
  var COL = { bar: "var(--lx-accent)", mean: "var(--lx-ink)", median: "var(--lx-tier-3)", band: "var(--lx-accent)", warn: "var(--lx-warn)", sd: "var(--lx-tier-2)", q: "var(--lx-tier-4)" };
  var XT = [[-10, MINUS + "10%"], [-5, MINUS + "5%"], [0, "0"], [5, "+5%"], [10, "+10%"]];

  function seg(host, labels, sel, onPick, aria) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": aria || "Choose" }, host), bs = [];
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", "aria-pressed": i === sel ? "true" : "false", text: l }, g);
      b.addEventListener("click", function () { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); onPick(i); });
      bs.push(b);
    });
    return { el: g, buttons: bs, set: function (i) { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); } };
  }
  // the page's number boxes (LX.NumAnswer, 7em wide)
  function numBox(host, o) { return LX.NumAnswer(host, Object.assign({ width: "7em" }, o)); }
  function miniTable(host, head, rows) {
    host.innerHTML = "";
    var sc = H("div", { class: "lx-scroll-x" }, host), tb = H("table", { class: "lx-mini-table" }, sc), hr = H("tr", null, H("thead", null, tb));
    head.forEach(function (h) { H("th", { scope: "col", text: h }, hr); });
    var b = H("tbody", null, tb);
    rows.forEach(function (r) { var tr = H("tr", null, b); r.forEach(function (c) { H("td", { text: c }, tr); }); });
  }
  function niceMax(v) { var s = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]; for (var i = 0; i < s.length; i++) if (v <= s[i] * 5) return Math.ceil(v / s[i]) * s[i]; return Math.ceil(v / 1000) * 1000; }

  // the histogram chart (LX.Plot) with optional spans and lines; the x axis reaches the outer bin edges (4-point bins run
  // from -12% to +12%), and the chart's text version lists every bin plus a note on what is marked or shaded
  function histSpec(t10, w, o) {
    o = o || {};
    var bins = histogram(t10, w), top = niceMax(Math.max.apply(null, bins.map(function (b) { return b.n; }))), xr = histRange(bins);
    var spec = {
      x: { min: xr.min, max: xr.max, ticks: [[xr.min, pct(xr.min, 0)]].concat(XT.filter(function (t) { return Math.abs(t[0]) < 10; }), [[xr.max, pct(xr.max, 0)]]) },
      y: { min: 0, max: top, step: top / 4, fmt: function (v) { return int(v); }, unit: "hours" },
      height: 240, heightN: 210,
      bars: bins.map(function (b) { return { x0: b.lo, x1: b.hi, y0: 0, y1: b.n, color: COL.bar, op: 0.75 }; }),
      spans: o.spans || [], marks: o.marks || [], legend: o.legend || [],
      tip: function (xv) {
        var k = Math.floor(Math.round(xv * 10) / w), b = bins.filter(function (bb) { return Math.round(bb.lo * 10 / w) === k; })[0];
        return b ? "<div><b>" + int(b.n) + " hours</b> with an error from " + pct(b.lo) + " up to " + pct(b.hi) + "</div>" : null;
      },
      tipStep: w / 10,
      aria: o.aria || "Histogram of the " + int(t10.length) + " hourly forecast errors, bins " + (w / 10) + (w === 10 ? " point" : " points") + " wide.",
      text: { head: ["Error, from", "up to", "Hours"], rows: bins.map(function (b) { return [pct(b.lo), pct(b.hi), int(b.n)]; }), note: o.note || null }
    };
    return { spec: spec, bins: bins };
  }

  function view(live, data, root) {
    var fc = data["04_forecasts"], town = data.town, S = summary(fc, town), t10 = tenths(fc), x = errors(fc), n = S.n;
    var own = LX.store.get("k5-own", {}) || {};
    function keep(k, v) { own[k] = v; LX.store.set("k5-own", own); if (X.flow) X.flow.update(traces(fc, own)); }
    var steps = [], N = int(n);
    var meanMark = function (lab) { return { x: S.mean, y: 0, vline: true, label: lab || "Mean " + pct(S.mean), color: COL.mean }; };

    // ---- 1 histogram and bin width
    steps.push({
      text: "Each of " + N + " hours (January–April 2025) has a [[forecast-error|forecast error]]: actual demand minus the day-ahead forecast, as a % of the forecast. Count the hours per bin, a [[histogram|histogram]], with all three bin widths.",
      build: function (act, api) {
        var tried = { 10: 1 }, w = 10;
        var ctl = H("div", { class: "k5-ctl" }, act); H("span", { class: "k5-lab", text: "Bin width, percentage points" }, ctl);
        seg(ctl, ["0.2", "1", "4"], 1, function (i) { w = WIDTHS[i]; tried[w] = 1; drawIt(); }, "Bin width");
        H("p", { class: "lx-hint", text: "A percentage point is the gap between two percentages: errors of +2% and +3% are 1 point apart." }, act);
        var P = LX.Plot(act, { text: "Text version of the chart" }), prog = H("p", { class: "k5-prog", "aria-live": "polite" }, act);
        function drawIt() {
          P.render(histSpec(t10, w, { note: "Bins " + (w / 10) + (w === 10 ? " point" : " points") + " wide; each runs from its lower edge up to, not including, its upper edge." }).spec);
          var k = Object.keys(tried).length;
          prog.textContent = k >= 3 ? "All three widths tried: Next is open." : "Bin widths tried: " + k + " of 3.";
          if (k >= 3) { api.done(); api.saw("Narrow bins look jagged; wide ones hide the shape. With 1-point bins, " + share(S.mid, 0) + " of hours lie from −2% up to +3%, and the right tail reaches further (" + pct(S.max) + ") than the left (" + pct(S.min) + ")."); }
        }
        drawIt();
      }
    });

    // ---- 2 mean and median (a median: at least half the hours at or below the marker, and at least half at or above)
    steps.push({
      text: "Two centres: the [[mean|mean]] averages all " + N + " errors; the [[median|median]] is the middle value once sorted. Place the marker so at least half the hours are at or below it, and half at or above.",
      build: function (act, api) {
        var P = LX.Plot(act, { text: "Text version of the chart" }), out = H("p", { class: "k5-test", "aria-live": "polite" }, act);
        var sl = LX.Slider(act, { label: "Your marker", color: COL.median, min: -3, max: 3, step: 0.1, value: -2, fmt: function (v) { return pct(v); }, onChange: drawIt });
        var row = H("div", { class: "k5-row" }, act), btn = H("button", { type: "button", class: "lx-btn small", text: "Check" }, row), shown = false, tries = 0;
        btn.addEventListener("click", function () {
          var v = sl.val(), M = medianCheck(x, v); keep("marker", v);
          if (M.ok) {
            shown = true; drawIt();
            api.done(); api.saw("Right: " + pct(v) + " is the median, with " + int(M.below) + " hours below, " + int(M.at) + " at it and " + int(M.above) + " above. The mean is " + pct(S.mean) + ": demand beat the forecast in " + share(S.pos, 0) + " of hours, a small [[forecast-bias|bias]].");
            return;
          }
          tries++;
          var low = 2 * (M.below + M.at) < n;
          if (tries >= 2) { shown = true; drawIt(); }
          api.saw("Not yet: only " + int(low ? M.below + M.at : M.above + M.at) + " of " + N + " hours are at or " + (low ? "below" : "above") + " " + pct(v) + ". Move the marker " + (low ? "right" : "left") + (tries >= 2 ? ", to the median line." : "."), true);
        });
        function drawIt() {
          var v = sl.val(), M = medianCheck(x, v), marks = [{ x: v, y: 0, vline: true, label: "You " + pct(v), color: COL.median }];
          if (shown) marks.push({ x: S.median, y: 0, vline: true, label: "Median", color: COL.q }, meanMark("Mean"));
          var said = "Below " + pct(v) + ": " + int(M.below) + " hours. At it: " + int(M.at) + ". Above: " + int(M.above) + ".";
          P.render(histSpec(t10, 10, { marks: marks, aria: "Histogram of the errors with your marker at " + pct(v) + ".",
                                       note: "Your marker: " + pct(v) + ". " + said + (shown ? " Median " + pct(S.median) + ", mean " + pct(S.mean) + "." : "") }).spec);
          out.innerHTML = "Below " + pct(v) + ": <b>" + int(M.below) + "</b> hours. At it: <b>" + int(M.at) + "</b>. Above: <b>" + int(M.above) + "</b>.";
        }
        drawIt();
      }
    });

    // ---- 3 spread (mean ± 1 SD shown to two decimals: its unrounded ends are what the 72% counts)
    var sdEnds = pct(S.lo1sd, 2) + " to " + pct(S.hi1sd, 2);
    steps.push({
      text: "Spread is how far the misses scatter. Show both measures: the [[standard-deviation|standard deviation]] (SD), a typical distance from the mean, and the middle half of the hours, between the [[quartile|quartiles]].",
      build: function (act, api) {
        var seen = {}, mode = -1;
        var ctl = H("div", { class: "k5-ctl" }, act);
        seg(ctl, ["Mean ± 1 SD", "Middle half (quartiles)"], -1, function (i) { mode = i; seen[i] = 1; drawIt(); }, "Measure of spread");
        var P = LX.Plot(act, { text: "Text version of the chart" }), out = H("p", { class: "k5-test", "aria-live": "polite" }, act), prog = H("p", { class: "k5-prog" }, act);
        function drawIt() {
          var spans = [], marks = [], note;
          if (mode === 0) { spans.push({ x0: S.lo1sd, x1: S.hi1sd, color: COL.sd, op: 0.16, label: "± 1 SD" }); marks.push(meanMark()); }
          if (mode === 1) { spans.push({ x0: S.q25, x1: S.q75, color: COL.q, op: 0.18, label: "Middle half" }); }
          out.innerHTML = mode === 0 ? "SD <b>" + S.sd.toFixed(2) + " points</b>: mean ± 1 SD runs from " + sdEnds + " and holds <b>" + share(S.in1sd, 0) + "</b> of hours."
            : mode === 1 ? "Quartiles <b>" + pct(S.q25) + "</b> and <b>" + pct(S.q75) + "</b>: the middle half of the hours, " + (S.q75 - S.q25).toFixed(1) + " points wide." : "Pick a measure to shade it.";
          note = mode === 0 ? "Shaded: mean ± 1 SD, " + sdEnds + ", holding " + share(S.in1sd, 0) + " of hours." : mode === 1 ? "Shaded: the middle half, " + pct(S.q25) + " to " + pct(S.q75) + "." : null;
          P.render(histSpec(t10, 10, { spans: spans, marks: marks, note: note, aria: "Histogram of the errors with a measure of spread shaded." }).spec);
          var k = Object.keys(seen).length;
          prog.textContent = k >= 2 ? "Both shown: Next is open." : "Measures shown: " + k + " of 2.";
          if (k >= 2) { api.done(); api.saw("A [[normal-distribution|normal (Gaussian) distribution]] puts about 68% of values within 1 SD of the mean; these hours put " + share(S.in1sd, 0) + " there. Rules of thumb are approximate; count the real data when you have it."); }
        }
        drawIt();
        H("p", { class: "lx-hint", html: "Spreads are in <b>percentage points</b>, the gap between two percentages: " + pct(S.mean) + " and " + pct(S.mean + 1) + " are 1 point apart." }, act);
      }
    });

    // ---- 4 probability as a frequency
    steps.push({
      text: "Pick one of these hours at random: the chance its error is above a threshold is the share of hours above it. Find a threshold that about 1 hour in 20 (about 5%) exceeds.",
      build: function (act, api) {
        var P = LX.Plot(act, { text: "Text version of the chart" }), out = H("p", { class: "k5-test", "aria-live": "polite" }, act);
        var sl = LX.Slider(act, { label: "Threshold", color: COL.warn, min: 0, max: 9, step: 0.1, value: 2, fmt: function (v) { return pct(v); }, onChange: function () { drawIt(true); } });
        function drawIt(user) {
          var t = sl.val(), c = countAbove(x, t), f = c / n;
          P.render(histSpec(t10, 10, { spans: [{ x0: t, x1: 10, color: COL.warn, op: 0.16, label: "Above" }], marks: [{ x: t, y: 0, vline: true, label: pct(t), color: COL.warn }],
                                       note: "Shaded: the " + int(c) + " hours above " + pct(t) + ", a share of " + share(f) + ".", aria: "Histogram with the hours above " + pct(t) + " shaded: " + int(c) + " hours." }).spec);
          out.innerHTML = "Above " + pct(t) + ": <b>" + int(c) + " of " + N + "</b> hours, a share of <b>" + share(f) + "</b>.";
          if (user) keep("t", t);
          if (user && f >= 0.045 && f <= 0.055) { api.done(); api.saw("Above " + pct(t) + ": " + int(c) + " of " + N + " hours, " + share(f) + ", about 1 in 20. That share estimates the chance for hours like these; other months or years may differ."); }
          else if (user) api.saw(f > 0.055 ? "More than 5% of hours lie above it: move the threshold right." : "Fewer than 5% lie above it: move it left.", true);
        }
        drawIt(false);
      }
    });

    // ---- 5 percentiles and intervals (nominal shares: hours tied at the ends count in, so each holds a little more)
    steps.push({
      text: "A [[percentile|percentile]] turns this round: 90% of hours stay at or below the 90th percentile. Two percentiles bound an interval; show the nominal 50%, 80% and 95% ones.",
      build: function (act, api) {
        var seen = {}, lv = null, keys = ["50", "80", "95"];
        var ctl = H("div", { class: "k5-ctl" }, act); H("span", { class: "k5-lab", text: "Interval" }, ctl);
        seg(ctl, ["50%", "80%", "95%"], -1, function (i) { lv = keys[i]; seen[lv] = 1; drawIt(); }, "Interval");
        var P = LX.Plot(act, { text: "Text version of the chart" }), out = H("p", { class: "k5-test", "aria-live": "polite" }, act), prog = H("p", { class: "k5-prog" }, act);
        H("p", { class: "lx-hint", text: "Many hours share each 0.1-point value, so hours tied at the ends count in: an interval holds a little more than its nominal share." }, act);
        function drawIt() {
          var L = lv && S.levels[lv], q = lv && LEVELS[lv];
          var said = L ? "Percentiles " + Math.round(q[0] * 1000) / 10 + " and " + Math.round(q[1] * 1000) / 10 + ": " + pct(L.lo) + " to " + pct(L.hi) + ", holding " + int(L.n) + " hours (" + share(L.n / n) + ", ends included)." : null;
          P.render(histSpec(t10, 10, { spans: L ? [{ x0: L.lo, x1: L.hi, color: COL.band, op: 0.18, label: lv + "%" }] : [], note: L ? "Shaded: the nominal " + lv + "% interval. " + said : null, aria: "Histogram with an interval shaded." }).spec);
          out.innerHTML = L ? "Percentiles " + Math.round(q[0] * 1000) / 10 + " and " + Math.round(q[1] * 1000) / 10 + ": <b>" + pct(L.lo) + " to " + pct(L.hi) + "</b>, holding " + int(L.n) + " hours (" + share(L.n / n) + ", ends included)." : "Pick an interval.";
          var k = Object.keys(seen).length;
          prog.textContent = k >= 3 ? "All three shown: Next is open." : "Intervals shown: " + k + " of 3.";
          if (k >= 3) { api.done(); api.saw("The 80% interval, " + pct(S.levels["80"].lo) + " to " + pct(S.levels["80"].hi) + ", is lesson 4's band. It is lopsided because the errors are, and it holds these hours by construction; other hours are untested."); }
        }
        drawIt();
      }
    });

    // ---- 6 sampling (independent draws with replacement from this list: sampling scatter, not next winter)
    var SAMPLE_SEED = 20250101;
    steps.push({
      text: "With only a sample, a share is an estimate. Draw 20 random samples of 10, 100 and 1,000 hours, and watch how far their shares above +5% scatter.",
      build: function (act, api) {
        var r = rng(SAMPLE_SEED), got = {};
        var row = H("div", { class: "k5-row" }, act);
        SIZES.forEach(function (k) { var b = H("button", { type: "button", class: "lx-btn small ghost", text: "20 samples of " + int(k) }, row); b.addEventListener("click", function () { got[k] = sampleShares(x, k, REPS, r, THRESH); drawIt(true); }); });
        H("p", { class: "lx-hint", text: "Each draw picks one of the " + N + " hours at random, so an hour can repeat. This shows how samples scatter, not how next winter will differ." }, act);
        var P = LX.Plot(act, { text: "Text version of the chart" }), out = H("p", { class: "k5-test", "aria-live": "polite" }, act);
        function drawIt(user) {
          var dots = [], rowsT = [], all = [];
          SIZES.forEach(function (k, i) {
            if (!got[k]) return;
            var jr = rng(k), d = k >= 1000 ? 1 : 0;
            got[k].forEach(function (e) { var y = i + 1 + (jr() - 0.5) * 0.4; all.push(e); dots.push({ x0: 100 * e - 0.28, x1: 100 * e + 0.28, y0: y - 0.08, y1: y + 0.08, color: COL.bar, op: 0.7, rx: 3 }); });
            var lo = Math.min.apply(null, got[k]), hi = Math.max.apply(null, got[k]);
            rowsT.push([int(k) + " hours", sorted(got[k]).map(function (e) { return share(e, d); }).join(", "), share(lo, d) + " to " + share(hi, d), share(mean(got[k]))]);
          });
          var top = sampleMax(all), xt = [[0, "0%", "middle"]];
          for (var v = 10; v <= top; v += 10) xt.push([v, v + "%", v === top ? "end" : "middle"]);
          P.render({ x: { min: -1.5, max: top, ticks: xt },
                     y: { min: 0.4, max: 3.6, ticks: [[1, "10 h"], [2, "100 h"], [3, "1,000 h"]] }, height: 200, heightN: 180, ml: 64,
                     bars: dots, marks: [{ x: 100 * S.aboveShare, y: 0.4, vline: true, color: COL.mean }], legend: [{ label: "Dots: one sample each", color: COL.bar }, { label: "All " + N + " hours: " + share(S.aboveShare), color: COL.mean, dash: true }],
                     aria: "Estimates from repeated random samples, one row per sample size, against the share in all hours.",
                     text: { head: ["Sample size", "The 20 estimates, sorted", "Range", "Average"], rows: rowsT, note: "All " + N + " hours: " + share(S.aboveShare) + " above +5%." } });
          out.textContent = rowsT.length ? rowsT.map(function (t) { return t[0] + ": " + t[2]; }).join(" · ") : "Draw some samples.";
          if (user && Object.keys(got).length >= 3) {
            keep("samples", SIZES.map(function (k) { return [Math.min.apply(null, got[k]), Math.max.apply(null, got[k])]; }));
            api.done(); api.saw("Bigger samples scatter less: the typical scatter shrinks with the square root of the sample size. Running a model on many random draws is a [[monte-carlo|Monte Carlo]] study, as Modeler lesson [[lesson:m07-monte-carlo|M7]] runs.");
          } else if (user) api.saw("Sample sizes drawn: " + Object.keys(got).length + " of 3.", true);
        }
        drawIt(false);
      }
    });

    // ---- 7 independence (gas plants A and B: Prairie Town's two gas plant sizes; the outage chances are illustrative)
    var PL = S.plants;
    function caseRows(showEv) {
      return PL.cases.map(function (c) { var hrs = Math.round(c.p * 10000); return [c.label, int(c.mw) + " MW", int(hrs)].concat(showEv ? [(c.mw * c.p).toFixed(2) + " MW"] : []); });
    }
    steps.push({
      text: "Illustrative: gas plants A (" + PL.cc + " [[megawatt|MW]]) and B (" + PL.pk + " MW) are each out of service in " + share(PL.p, 0) + " of hours. If outages are [[independent-events|independent]], the chance both are out is the product of the two chances.",
      build: function (act, api) {
        var tbl = H("div", { class: "k5-cases" }, act), tries = 0, caveat = null;
        numBox(act, { label: "Both out:", unit: "% of hours", onCheck: function (v) {
          tries++;
          if (v != null && Math.abs(v - 100 * PL.both) < 0.0051) {
            miniTable(tbl, ["Case", "MW out", "Hours in 10,000"], caseRows(false));
            if (!caveat) caveat = H("p", { class: "lx-hint", text: "Only if independent: a shared cause, such as one cold spell hitting both plants, makes joint outages more likely." }, act);
            api.done(); api.saw(share(PL.p, 0) + " × " + share(PL.p, 0) + " = " + share(PL.both, 2) + " of hours: about " + Math.round(PL.hoursYear) + " of a year's 8,760 hours.");
          } else api.saw(tries < 2 ? "Not yet. Multiply the two chances as decimals: 0.05 × 0.05." : "0.05 × 0.05 = 0.0025, which is 0.25%.", true);
        } });
      }
    });

    // ---- 8 expected value
    steps.push({
      text: "The [[expected-value|expected value]] weights each outcome by its chance. With plants A and B each out in " + share(PL.p, 0) + " of hours, independently, how many MW are out on average?",
      build: function (act, api) {
        var tbl = H("div", { class: "k5-cases" }, act), tries = 0;
        miniTable(tbl, ["Case", "MW out", "Hours in 10,000"], caseRows(false));
        numBox(act, { label: "Average MW out:", unit: "MW", onCheck: function (v) {
          tries++;
          if (v != null && Math.abs(v - PL.ev) < 0.051) {
            miniTable(tbl, ["Case", "MW out", "Hours in 10,000", "MW × chance"], caseRows(true));
            keep("ev", PL.ev);
            api.done(); api.saw(PL.ev + " MW = " + share(PL.p, 0) + " × " + PL.cc + " + " + share(PL.p, 0) + " × " + PL.pk + ". While each plant stays out " + share(PL.p, 0) + " of the time, this holds with or without independence; the chance of both out does not.");
          } else api.saw(tries < 2 ? "Not yet. Multiply each case's MW by its share of hours, then add." : "0 × 0.9025 + 150 × 0.0475 + 100 × 0.0475 + 250 × 0.0025.", true);
        } });
      }
    });

    var cards = LX.StepCards(live, { id: "k5-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {
      if (state === "mid") { cards.go(3); var s = live.querySelector(".lx-ctl input[type=range]"); if (s) { s.value = "5"; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); } return { view: "step 4" }; }
      if (state === "samples" || state === "step-6") { cards.go(5); live.querySelectorAll(".k5-row .lx-btn").forEach(function (b) { b.click(); }); return { view: "step 6" }; }
      return null;
    }, cards);

    var X = {};
    explain(fc, S, own, X);
    drillView(fc);
    tasksView(fc, S);
  }

  function explain(fc, S, own, X) {
    var x = document.getElementById("k5-explain"); if (!x) return; x.innerHTML = "";
    var W = S.wild, pts = function (v) { return (Math.abs(v) < 0.005 ? "0" : sgn(v, 2)) + " pt"; };
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Five summaries of the same " + int(S.n) + " hours", text: true,
      columns: [{ key: "name", label: "Summary", main: true }, { key: "value", label: "Here" }, { key: "asks", label: "It answers" }, { key: "wild", label: "One +" + WILD + "% reading moves it by" }],
      rows: [
        { key: "mean", color: "var(--lx-ink)", name: "Mean", value: pct(S.mean), asks: "the average miss, signed", wild: pts(W.mean) },
        { key: "median", color: "var(--lx-tier-4)", name: "Median", value: pct(S.median), asks: "the middle hour", wild: pts(W.median) },
        { key: "sd", color: "var(--lx-tier-2)", name: "Standard deviation", value: S.sd.toFixed(2) + " points", asks: "a typical distance from the mean", wild: pts(W.sd) },
        { key: "iqr", color: "var(--lx-tier-3)", name: "Middle half", value: pct(S.q25) + " to " + pct(S.q75), asks: "where the central 50% lie", wild: pts(W.iqr) + " in width" },
        { key: "above", color: "var(--lx-warn)", name: "Share above +5%", value: share(S.aboveShare), asks: "how often a big miss comes", wild: pts(100 * W.above5) }]
    });
    X.flow = LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "Estimate a chance from data", lede: "Count, divide, then ask whether there were enough hours. Each trace names its threshold; yours from step 4 joins them.",
      nodes: {
        event: { t: "Name the event", s: "error above a threshold", k: "end" },
        count: { t: "Count the hours", s: "where it happened" },
        divide: { t: "Divide by all hours", s: "a share, 0 to 1" },
        q: { t: "Enough hours?", tN: ["Enough", "hours?"], k: "q" },
        report: { t: "Report share, count, period", tN: ["Report share,", "count, period"], k: "end" },
        more: { t: "Say it is rough", s: "or get more hours", k: "end" }
      },
      cols: 3, at: { event: [1, 0], count: [1, 1], divide: [1, 2], q: [1, 3], report: [0, 4], more: [2, 4] },
      colsN: 2, atN: { event: [0.5, 0], count: [0.5, 1], divide: [0.5, 2], q: [0.5, 3], report: [0, 4], more: [1, 4] },
      edges: [["event", "count"], ["count", "divide"], ["divide", "q"], ["q", "report", "yes"], ["q", "more", "no"]],
      traces: traces(fc, own), sel: 0
    });
    LX.CausalChain(H("div", { class: "lx-xcard" }, x), {
      title: "Why a shared cause breaks the product rule",
      links: [
        { title: "One cause hits both plants", text: "Illustrative: a cold spell, or a shared fuel supply, hitting plants A and B.", value: "not independent" },
        { title: "Outages come together", text: "One plant being out makes the other more likely to be out." },
        { title: "Both out more often", text: "The joint chance rises above the product.", value: "> " + share(S.plants.both, 2) },
        { title: "A count that multiplies looks too safe", text: "Adequacy studies sample outages together when causes are shared ([[lesson:a05-adequacy|A5]])." }],
      note: "Holding each plant's outage chance at " + share(S.plants.p, 0) + ", dependence leaves expected MW out (" + S.plants.ev + " MW) unchanged; only the joint chances change."
    });
  }

  // ---- practice drill: a seeded stream of short items with instant feedback (LX.Drill; this visit only)
  function drillView(fc) {
    var host = document.getElementById("k5-drill"); if (!host) return; host.innerHTML = "";
    LX.Drill(host, { hint: "Seven kinds of item in rotation, new numbers each time (about 20 minutes). Aim for fifteen, two rounds of seven and one more.",
                     width: "7em", item: function (k, r) { return drillItem(fc, k, r); } });
  }

  // ---- four data tasks with a range explorer over the real hours
  function tasksView(fc, S) {
    var host = document.getElementById("k5-tasks"); if (!host) return; host.innerHTML = "";
    var x = errors(fc), n = x.length, T = tasks(fc), doneK = {};
    var card = H("div", { class: "lx-card k5-practice" }, host);
    var top = H("div", { class: "lx-x-head" }, card); H("h3", { text: "Data tasks with the real hours" }, top);
    var score = H("span", { class: "lx-step-n", "aria-live": "polite", text: "0 of " + T.length + " done" }, top);
    H("p", { class: "lx-hint", text: "Set the range to count the hours between two errors (ends included), then answer (about 10 minutes)." }, card);
    var lo = LX.Slider(card, { label: "From", color: "var(--lx-tier-2)", min: -9, max: 10, step: 0.1, value: -2, fmt: function (v) { return pct(v); }, onChange: upd });
    var hi = LX.Slider(card, { label: "To", color: "var(--lx-tier-3)", min: -9, max: 10, step: 0.1, value: 2, fmt: function (v) { return pct(v); }, onChange: upd });
    var out = H("p", { class: "k5-test", "aria-live": "polite" }, card);
    function upd() {
      var a = lo.val(), b = hi.val();
      if (a > b) { out.innerHTML = "“From” is above “To”: no hours in that range."; return; }
      var c = countIn(x, a, b), at = countIn(x, -100, b);
      out.innerHTML = "From " + pct(a) + " to " + pct(b) + ": <b>" + int(c) + " hours</b>, " + share(c / n) + ". At or below " + pct(b) + ": " + share(at / n, 2) + ".";   // two decimals, so +7.9% (98.97%) and +8.0% (99.01%) differ
    }
    upd();
    var ol = H("ol", { class: "k5-tasks" }, card);
    T.forEach(function (t) {
      var li = H("li", null, ol); H("p", { text: t.text }, li);
      var fb = H("div", { "aria-live": "polite" }, li);
      var ni = numBox(li, { label: "Answer", unit: t.unit, onCheck: function (v) {
        if (v == null) return;
        var ok = Math.abs(v - t.answer) <= t.tol + 1e-9;
        if (ok) { doneK[t.key] = 1; li.classList.add("done"); score.textContent = Object.keys(doneK).length + " of " + T.length + " done"; }
        fb.innerHTML = ""; H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + (ok ? LX.esc(t.how) : "Use the range above; the answer is a " + (t.unit === "hours" ? "count of hours." : "percentage with one decimal.")) + "</div>" }, fb);
      } });
      li.insertBefore(ni.row, fb);
      var d = H("details", { class: "k5-hint" }, li); H("summary", { text: "Answer" }, d); H("span", { text: t.how }, d);
    });
  }

  LX.mount("k05", function (live, data, root) { view(live, data, root); });
})();
