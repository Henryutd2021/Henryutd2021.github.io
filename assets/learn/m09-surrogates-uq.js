// m09-surrogates-uq.js — Modeler lesson M9, "Learning from few runs: surrogates, Gaussian processes and multi-fidelity
// data" (model-lab in the step-card form, statistical mode, no solver; Learn W4, 2026-11-05).
//
// The toy (illustrative; invented, seeded, not any real turbine or the course author's data): one 2,000 kW wind turbine.
//   maker's curve   f(v) = 0 below 3 m/s; 2,000 (v^3 - 3^3) / (11.5^3 - 3^3) kW from 3 to 11.5 m/s; 2,000 kW above
//   field curve     g(v) = 0.97 x the maker's curve averaged over gusts: E[f(v (1 + 0.12 Z))], Z standard normal
//                   (turbulence intensity 12%, 3% losses), by a fixed 201-point rule on z in [-5, 5]. Gusts smooth the
//                   knee, so g falls furthest below f around rated speed.
//   load-reducing   (step 8 only) the same turbine in a mode the maker's curve does not show: g(v) x (1 - 0.5 s),
//                   s = min(1, max(0, (v - 12.5) / 7.5)): from 12.5 m/s its output falls to half by 20 m/s
//   records         10-minute averages: wind speed v ~ Weibull (k 2, c 8 m/s) cut to 3-20 m/s (inverse transform);
//                   power p = max(0, g(v) + sd(v) z), sd(v) = sqrt(15^2 + (0.3 g'(v))^2) kW: 15 kW of other scatter
//                   and a 0.3 m/s error in the recorded wind speed, which matters most where the curve is steep.
//                   Generator mulberry32 (LX.mulberry32); one uniform for v, then two for z (Box-Muller, cosine branch).
//                   A campaign of 64 records (seed 9; the first n are "n records") and 400 held-out records (seed 2023);
//                   the load-reducing case reuses the same uniforms, so only the truth changes. Stored rounded in the
//                   data file (v to 0.01 m/s, p to 0.1 kW); every fit and score uses the stored values.
//
// The model: a Gaussian process with a squared-exponential kernel k(v, v') = sf^2 exp(-(v - v')^2 / (2 ell^2)) and
// noise sn^2, and a mean that is a linear combination of basis functions with coefficients beta fitted by generalized
// least squares (universal kriging):
//   one source (GP)        basis h(v) = [1]                 a constant level plus a smooth wiggle
//   two sources (MF)       basis h(v) = [1, f(v) / 1000]    the maker's curve, scaled by rho = beta_2 / 1000 and shifted,
//                                                           plus a GP for the gap: Kennedy and O'Hagan's autoregressive
//                                                           form with a cheap level that is known exactly at every speed
//   K = sf^2 C + sn^2 I = L L^T (Cholesky); beta = (H^T K^-1 H)^-1 H^T K^-1 y; r = y - H beta
//   mean m(v) = h^T beta + k^T K^-1 r
//   latent variance s2(v) = sf^2 - k^T K^-1 k + u^T (H^T K^-1 H)^-1 u, u = h - H^T K^-1 k  (the last term: beta's own
//   uncertainty); a new record's sd = sqrt(s2 + sn^2), so bands are for records, not for the curve alone.
//   log-likelihood (maximum likelihood, beta at its GLS value): -r^T K^-1 r / 2 - log|K| / 2 - n log(2 pi) / 2
//   settings by maximum likelihood over a fixed grid (data: grid.ell x grid.sf x grid.sn); tie rule: the first best in
//   grid order (ell, then sf, then sn), and the test proves every best used on the page wins by more than 1e-6.
//
// Scores on the 400 held-out records: RMSE (kW); coverage of central bands m +/- z sd (z for 50, 80, 90, 95%), overall
// and by wind-speed range (3-8, 8-13, 13-20 m/s); the mean width of the 90% band (kW); the mean pinball loss over the 19
// quantiles 5%, 10%, ..., 95% of N(m, sd^2) (kW; a proper score: lower is better, and it rewards a band that is both
// narrow and honest). Every number the page states comes from these functions; _tests/learn/test_m09-surrogates-uq.js
// checks them, and the lab notebook asserts the data file's reference block.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var rng = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) || require("./components/core.js").mulberry32;

  // the maker's curve (kW)
  function maker(T, v) {
    if (v < T.cutIn) return 0;
    if (v >= T.ratedSpeed) return T.rated;
    return T.rated * (Math.pow(v, 3) - Math.pow(T.cutIn, 3)) / (Math.pow(T.ratedSpeed, 3) - Math.pow(T.cutIn, 3));
  }
  // the fixed gust rule: 201 points on z in [-5, 5], weights exp(-z^2 / 2), normalized
  var GZ = [], GW = [];
  (function () { var s = 0, i; for (i = 0; i < 201; i++) { var z = -5 + i / 20; GZ.push(z); GW.push(Math.exp(-z * z / 2)); s += GW[i]; } for (i = 0; i < 201; i++) GW[i] /= s; })();
  function reduceShare(T, v) { var R = T.reduce; return Math.min(1, Math.max(0, (v - R.from) / (R.to - R.from))); }
  // the field curve (kW); mode "reduce" adds the load-reducing mode
  function field(T, v, mode) {
    var s = 0;
    for (var i = 0; i < GZ.length; i++) s += GW[i] * maker(T, v * (1 + T.ti * GZ[i]));
    var y = (1 - T.loss) * s;
    return mode === "reduce" ? y * (1 - T.reduce.share * reduceShare(T, v)) : y;
  }
  function slope(T, v, mode) { var h = 1e-3; return (field(T, v + h, mode) - field(T, v - h, mode)) / (2 * h); }
  function scatter(T, v, mode) { return Math.sqrt(T.powErr * T.powErr + Math.pow(T.windErr * slope(T, v, mode), 2)); }
  // Weibull cut to [lo, hi] by the inverse transform of u in [0, 1)
  function weibull(T, u) {
    var W = T.weibull, F = function (v) { return 1 - Math.exp(-Math.pow(v / W.c, W.k)); }, a = F(T.range[0]), b = F(T.range[1]);
    return W.c * Math.pow(-Math.log(1 - (a + u * (b - a))), 1 / W.k);
  }
  // n records from a seed: [[v, p]], rounded as stored (v to 0.01 m/s, p to 0.1 kW)
  function records(T, n, seed, mode) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var v = weibull(T, r()), u = r(), w = r();
      if (u < 1e-12) u = 1e-12;
      var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
      var p = Math.max(0, field(T, v, mode) + scatter(T, v, mode) * z);
      out.push([Math.round(v * 100) / 100, Math.round(p * 10) / 10]);
    }
    return out;
  }

  // ---- small dense linear algebra (n <= 64)
  function chol(A) {
    var n = A.length, L = [], i, j, k;
    for (i = 0; i < n; i++) L.push(new Float64Array(n));
    for (i = 0; i < n; i++) for (j = 0; j <= i; j++) {
      var s = A[i][j];
      for (k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (!(s > 0)) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    return L;
  }
  function fwd(L, b) { var n = b.length, z = new Float64Array(n); for (var i = 0; i < n; i++) { var s = b[i]; for (var k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; } return z; }
  function bwd(L, z) { var n = z.length, x = new Float64Array(n); for (var i = n - 1; i >= 0; i--) { var s = z[i]; for (var k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; } return x; }
  function solve(L, b) { return bwd(L, fwd(L, b)); }

  // the basis of the mean: one source [1], two sources [1, maker / 1000]
  function basis(T, v, two) { return two ? [1, maker(T, v) / 1000] : [1]; }
  function kern(a, b, hp) { var d = a - b; return hp.sf * hp.sf * Math.exp(-d * d / (2 * hp.ell * hp.ell)); }
  // a fitted GP: recs [[v, p]], hp {ell, sf, sn}, two (bool)
  function fit(T, recs, hp, two) {
    var n = recs.length, X = recs.map(function (r) { return r[0]; }), y = recs.map(function (r) { return r[1]; }), K = [], i, j;
    for (i = 0; i < n; i++) { K.push(new Float64Array(n)); for (j = 0; j < n; j++) K[i][j] = kern(X[i], X[j], hp) + (i === j ? hp.sn * hp.sn : 0); }
    var L = chol(K); if (!L) return null;
    var H = X.map(function (v) { return basis(T, v, two); }), p = H[0].length, Ki = [], a, c;
    for (c = 0; c < p; c++) Ki.push(solve(L, H.map(function (h) { return h[c]; })));
    var yi = solve(L, y), M = [], b = [];
    for (a = 0; a < p; a++) {
      M.push([]); var s = 0;
      for (c = 0; c < p; c++) { var t = 0; for (i = 0; i < n; i++) t += H[i][a] * Ki[c][i]; M[a].push(t); }
      for (i = 0; i < n; i++) s += H[i][a] * yi[i]; b.push(s);
    }
    var Lm = chol(M); if (!Lm) return null;
    var beta = Array.prototype.slice.call(solve(Lm, b));
    var r = y.map(function (v, k) { var s2 = 0; for (var q = 0; q < p; q++) s2 += H[k][q] * beta[q]; return v - s2; });
    var ri = solve(L, r), quad = 0, logdet = 0;
    for (i = 0; i < n; i++) { quad += r[i] * ri[i]; logdet += 2 * Math.log(L[i][i]); }
    return { T: T, X: X, y: y, L: L, Lm: Lm, H: H, beta: beta, ri: ri, hp: hp, two: !!two, n: n,
             ll: -0.5 * quad - 0.5 * logdet - 0.5 * n * Math.log(2 * Math.PI) };
  }
  function predict(F, v) {
    var n = F.n, k = new Float64Array(n), i;
    for (i = 0; i < n; i++) k[i] = kern(v, F.X[i], F.hp);
    var h = basis(F.T, v, F.two), m = 0, c;
    for (c = 0; c < h.length; c++) m += h[c] * F.beta[c];
    for (i = 0; i < n; i++) m += k[i] * F.ri[i];
    var w = fwd(F.L, k), q = 0;
    for (i = 0; i < n; i++) q += w[i] * w[i];
    var ki = bwd(F.L, w), u = h.map(function (hc, cc) { var s = 0; for (var j = 0; j < n; j++) s += F.H[j][cc] * ki[j]; return hc - s; });
    var uu = solve(F.Lm, u), ex = 0;
    for (c = 0; c < u.length; c++) ex += u[c] * uu[c];
    var lat = Math.max(0, F.hp.sf * F.hp.sf - q + ex);
    return { m: m, lat: lat, sd: Math.sqrt(lat + F.hp.sn * F.hp.sn) };
  }
  // the joint posterior covariance of the latent curve at speeds xs (no record noise): sf^2 C(xs, xs) - Ks^T K^-1 Ks
  // + U^T (H^T K^-1 H)^-1 U, U = H(xs)^T - H^T K^-1 Ks (case file CF8 averages the curve over a wind distribution)
  function covariance(F, xs) {
    var n = F.n, m = xs.length, W = [], KI = [], U = [], i, j, c;
    for (j = 0; j < m; j++) {
      var k = new Float64Array(n); for (i = 0; i < n; i++) k[i] = kern(xs[j], F.X[i], F.hp);
      var w = fwd(F.L, k), ki = bwd(F.L, w), h = basis(F.T, xs[j], F.two);
      W.push(w); U.push(h.map(function (hc, cc) { var s = 0; for (var q = 0; q < n; q++) s += F.H[q][cc] * ki[q]; return hc - s; }));
    }
    var out = [];
    for (j = 0; j < m; j++) {
      out.push(new Float64Array(m));
      var uu = solve(F.Lm, U[j]);
      for (var l = 0; l < m; l++) {
        var s = kern(xs[j], xs[l], F.hp); for (i = 0; i < n; i++) s -= W[j][i] * W[l][i];
        for (c = 0; c < uu.length; c++) s += U[l][c] * uu[c];
        out[j][l] = s;
      }
    }
    return out;
  }
  // maximum likelihood over the grid; the first best in grid order wins; margin = best - runner-up log-likelihood;
  // edge lists the settings that sit at an end of their grid
  function search(T, recs, two, G) {
    var best = null, second = -Infinity;
    G.ell.forEach(function (ell) { G.sf.forEach(function (sf) { G.sn.forEach(function (sn) {
      var F = fit(T, recs, { ell: ell, sf: sf, sn: sn }, two);
      if (!F) return;
      if (!best || F.ll > best.ll) { if (best) second = best.ll; best = F; } else if (F.ll > second) second = F.ll;
    }); }); });
    best.margin = best.ll - second;
    best.edge = ["ell", "sf", "sn"].filter(function (k) { var g = G[k]; return best.hp[k] === g[0] || best.hp[k] === g[g.length - 1]; });
    return best;
  }
  // the standard normal: the CDF from erf's positive-term series, erf(x) = 2x/sqrt(pi) exp(-x^2) sum (2x^2)^n / (1 3 5 ...
  // (2n+1)) (no cancellation; about 1e-15 for |x| <= 6), and its inverse (Acklam's rational approximation, then two
  // Newton steps), so the page's band edges agree with SciPy's norm.ppf in the lab to about 1e-14
  function erf(x) {
    var ax = Math.abs(x); if (ax > 6) return x > 0 ? 1 : -1;
    var t = 1, s = 1, x2 = 2 * ax * ax;
    for (var n = 0; n < 400 && t > 1e-17 * s; n++) { t *= x2 / (2 * n + 3); s += t; }
    var v = 2 * ax / Math.sqrt(Math.PI) * Math.exp(-ax * ax) * s;
    return x < 0 ? -v : v;
  }
  function Phi(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  function phi(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
  function invPhi(p) {
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
        b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
        c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
        d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00], q, r, x;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    x -= (Phi(x) - p) / phi(x); x -= (Phi(x) - p) / phi(x);   // two Newton steps
    return x;
  }
  var LEVELS = [50, 80, 90, 95], RANGES = [[3, 8, "3–8 m/s"], [8, 13, "8–13 m/s"], [13, 20, "13–20 m/s"]];
  var ZL = {}; LEVELS.forEach(function (l) { ZL[l] = invPhi(0.5 + l / 200); });
  var TAU = [], ZT = []; for (var a19 = 1; a19 <= 19; a19++) { TAU.push(a19 / 20); ZT.push(invPhi(a19 / 20)); }
  function pinball(y, m, sd) {
    var s = 0;
    for (var j = 0; j < 19; j++) { var q = m + sd * ZT[j], t = TAU[j]; s += y >= q ? t * (y - q) : (1 - t) * (q - y); }
    return s / 19;
  }
  function rangeOf(v) { for (var i = 0; i < RANGES.length; i++) if (v < RANGES[i][1] || i === RANGES.length - 1) return i; return RANGES.length - 1; }
  // every score of a fit on records (held-out or its own)
  function scores(F, recs) {
    var n = recs.length, se = 0, pb = 0, wid = 0, cov = {}, by = RANGES.map(function () { return { n: 0, in90: 0, se: 0 }; });
    LEVELS.forEach(function (l) { cov[l] = 0; });
    recs.forEach(function (rc) {
      var q = predict(F, rc[0]), e = rc[1] - q.m, R = by[rangeOf(rc[0])];
      se += e * e; pb += pinball(rc[1], q.m, q.sd); wid += 2 * ZL[90] * q.sd;
      LEVELS.forEach(function (l) { if (Math.abs(e) <= ZL[l] * q.sd) cov[l]++; });
      R.n++; R.se += e * e; if (Math.abs(e) <= ZL[90] * q.sd) R.in90++;
    });
    LEVELS.forEach(function (l) { cov[l] /= n; });
    return { n: n, rmse: Math.sqrt(se / n), pinball: pb / n, width: wid / n, cov: cov,
             byRange: by.map(function (R, i) { return { label: RANGES[i][2], n: R.n, cov90: R.n ? R.in90 / R.n : null, rmse: R.n ? Math.sqrt(R.se / R.n) : null }; }) };
  }

  // ---- the data the page uses: the stored records, cut to the first n of the campaign
  function campaign(D, n, mode) { return (mode === "reduce" ? D.records.campaignReduce : D.records.campaign).slice(0, n); }
  function heldOut(D, mode) { return mode === "reduce" ? D.records.testReduce : D.records.test; }
  // the stored maximum-likelihood settings for case/model/n (written by the test's --write from search(); checked there)
  function stored(D, mode, two, n) { return D.fits[mode || "base"][two ? "two" : "one"][String(n)]; }
  function fitStored(D, n, two, mode) { return fit(D.turbine, campaign(D, n, mode), stored(D, mode, two, n), two); }
  // the curve and band on a grid of speeds (for charts): [{v, m, sd}]
  function curve(F, from, to, step) {
    var out = [];
    for (var v = from; v <= to + 1e-9; v += step) { var q = predict(F, Math.round(v * 1000) / 1000); out.push({ v: Math.round(v * 1000) / 1000, m: q.m, sd: q.sd, lat: q.lat }); }
    return out;
  }
  // where the band is widest on 3-20 m/s (0.1 m/s grid; ties: the lowest speed) and its mean width there
  function widest(F, T) {
    var c = curve(F, T.range[0], T.range[1], 0.1), w = c[0];
    c.forEach(function (p) { if (p.sd > w.sd + 1e-9) w = p; });
    return { v: w.v, width: 2 * ZL[90] * w.sd, mean: c.reduce(function (s, p) { return s + 2 * ZL[90] * p.sd; }, 0) / c.length };
  }
  // the gap between the maker's curve and the records, by 1 m/s bin of wind speed (step 1)
  function gaps(T, recs) {
    var bins = [];
    for (var v = T.range[0]; v < T.range[1]; v++) bins.push({ lo: v, hi: v + 1, n: 0, gap: 0 });
    recs.forEach(function (r) { var b = bins[Math.min(bins.length - 1, Math.floor(r[0] - T.range[0]))]; b.n++; b.gap += maker(T, r[0]) - r[1]; });
    bins.forEach(function (b) { b.gap = b.n ? b.gap / b.n : null; });
    return bins;
  }

  // ---------------------------------------------------------------- every number the page states, in one place
  function kwS(v) { return Math.round(v).toLocaleString("en-US") + " kW"; }
  function pctS(f, d) { return (100 * f).toFixed(d == null ? 1 : d) + "%"; }
  function msS(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "") + " m/s"; }
  function facts(D) {
    var T = D.turbine, N0 = D.n0, test = heldOut(D), F = { n0: N0 };
    F.gaps = gaps(T, test);
    F.top = F.gaps.filter(function (b) { return b.gap != null; }).sort(function (a, b) { return b.gap - a.gap || a.lo - b.lo; })[0];
    F.step2 = D.steps2.map(function (n) { var r = campaign(D, n), Fi = fit(T, r, D.fixed, false); return { n: n, vmax: Math.max.apply(null, r.map(function (p) { return p[0]; })), w: widest(Fi, T) }; });
    F.ml = search(T, campaign(D, N0), false, D.grid);
    var recs = campaign(D, N0), E = D.extremes, ML = stored(D, null, false, N0);
    F.step4 = [ML, { ell: E.short.ell, sf: ML.sf, sn: E.short.sn }, { ell: E.long.ell, sf: ML.sf, sn: ML.sn }].map(function (hp) { var Fi = fit(T, recs, hp, false); return { hp: hp, own: scores(Fi, recs).rmse, held: scores(Fi, test).rmse }; });
    F.sc = {}; ["base", "reduce"].forEach(function (mode) { F.sc[mode] = {}; D.sweep.forEach(function (n) { F.sc[mode][n] = [false, true].map(function (two) { var md = mode === "reduce" ? "reduce" : null; return scores(fitStored(D, n, two, md), heldOut(D, md)); }); }); });
    F.two = fitStored(D, N0, true);
    F.rho = F.two.beta[1] / 1000;
    F.lastN0 = Math.max.apply(null, recs.map(function (p) { return p[0]; }));
    F.se90 = 2 * Math.sqrt(0.9 * 0.1 / test.length);
    return F;
  }
  // the reference block (the test's --write; the lab notebook asserts it)
  function reference(D) {
    var F = facts(D), cut = function (v) { return +v.toPrecision(10); }, sc = function (s) { return { rmse: cut(s.rmse), pinball: cut(s.pinball), width: cut(s.width), cov: LEVELS.reduce(function (o, l) { o[l] = cut(s.cov[l]); return o; }, {}), cov90ByRange: s.byRange.map(function (r) { return cut(r.cov90); }) }; };
    var one = fitStored(D, D.n0, false), two = F.two;
    return {
      about: "Written by node _tests/learn/test_m09-surrogates-uq.js --write; recomputed by the same test on every run. kW, m/s; coverages are fractions of the 400 held-out records.",
      field: [4, 8, 11.5, 15].map(function (v) { return [v, cut(field(D.turbine, v)), cut(field(D.turbine, v, "reduce"))]; }),
      ml16: { ell: F.ml.hp.ell, sf: F.ml.hp.sf, sn: F.ml.hp.sn, loglik: cut(F.ml.ll), margin: cut(F.ml.margin) },
      beta16: { one: one.beta.map(cut), two: two.beta.map(cut) },
      predict16: [6, 12, 16].map(function (v) { var a = predict(one, v), b = predict(two, v); return [v, cut(a.m), cut(a.sd), cut(b.m), cut(b.sd)]; }),
      scores: { base: { one: sc(F.sc.base[D.n0][0]), two: sc(F.sc.base[D.n0][1]) }, reduce: { one: sc(F.sc.reduce[D.n0][0]), two: sc(F.sc.reduce[D.n0][1]) } },
      sweepRMSE: D.sweep.map(function (n) { return [n, cut(F.sc.base[n][0].rmse), cut(F.sc.base[n][1].rmse)]; }),
      step4: F.step4.map(function (r) { return [cut(r.own), cut(r.held)]; })
    };
  }
  // the no-JS version (the test's --write puts it in the page): a static chart of the 16 records with the two fits'
  // 90% bands, the steps' results as a list, and a table
  function staticFallback(D) {
    var F = facts(D), T = D.turbine, N0 = D.n0, one = fitStored(D, N0, false), two = F.two, recs = campaign(D, N0);
    var X0 = 48, X1 = 428, Y0 = 228, Y1 = 14, x = function (v) { return (X0 + (v - 3) / 17 * (X1 - X0)).toFixed(1); }, y = function (p) { return (Y0 - (Math.max(-500, Math.min(2500, p)) + 500) / 3000 * (Y0 - Y1)).toFixed(1); };
    var band = function (Fi) { var c = curve(Fi, 3, 20, 0.5), up = c.map(function (p) { return x(p.v) + "," + y(p.m + Z9 * p.sd); }), lo = c.slice().reverse().map(function (p) { return x(p.v) + "," + y(p.m - Z9 * p.sd); }); return up.concat(lo).join(" "); };
    var line = function (f) { var s = []; for (var v = 3; v <= 20.001; v += 0.25) s.push(x(v) + "," + y(f(v))); return s.join(" "); };
    var s = '<svg viewBox="0 0 440 262" role="img" aria-labelledby="m9-static-title">\n<title id="m9-static-title">The first ' + N0 + ' records of the toy turbine, all below 12 m/s, with two fits and their 90% bands: one source (the records alone) and two sources (the maker\'s curve plus the records). The one-source band widens above 12 m/s; the two-source band follows the maker\'s curve there.</title>\n<g>';
    for (var g = -500; g <= 2500; g += 500) s += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + y(g) + '" y2="' + y(g) + '" class="m9-fb-grid"/><text x="42" y="' + (+y(g) + 4).toFixed(1) + '" text-anchor="end" class="m9-fb-tick">' + g.toLocaleString("en-US").replace("-", "−") + '</text>';
    [3, 6, 9, 12, 15, 18, 20].forEach(function (v) { s += '<text x="' + x(v) + '" y="244" text-anchor="' + (v === 3 ? "start" : v === 20 ? "end" : "middle") + '" class="m9-fb-tick">' + v + '</text>'; });
    s += '<text x="238.0" y="258" text-anchor="middle" class="m9-fb-tick">wind speed, m/s</text><text x="42" y="8" text-anchor="end" class="m9-fb-tick">kW</text></g>\n<g>';
    s += '<polygon points="' + band(one) + '" class="m9-fb-one"/><polygon points="' + band(two) + '" class="m9-fb-two"/>';
    s += '<polyline points="' + line(function (v) { return maker(T, v); }) + '" class="m9-fb-maker"/>';
    s += recs.map(function (r) { return '<circle cx="' + x(r[0]) + '" cy="' + y(r[1]) + '" r="3" class="m9-fb-rec"/>'; }).join("");
    s += '</g>\n</svg>';
    var s2 = F.step2, st4 = F.step4, b = F.sc.base[N0], r = F.sc.reduce[N0], SW = D.sweep, last = SW[SW.length - 1];
    var li = [
      "The records sit furthest below the maker's curve at " + F.top.lo + "–" + F.top.hi + " m/s, " + kwS(F.top.gap) + " on average: gusts smooth the curve's corner at rated speed.",
      "With fixed settings, the 90% band is widest where there are no records; records up to " + msS(s2[2].vmax) + " cut its mean width from " + kwS(s2[1].w.mean) + " (" + s2[1].n + " records) to " + kwS(s2[2].w.mean) + " (" + s2[2].n + ").",
      "The " + N0 + " records choose a length-scale of " + msS(F.ml.hp.ell) + ", noise " + kwS(F.ml.hp.sn) + " and signal size " + kwS(F.ml.hp.sf) + " (maximum likelihood on a grid of " + (D.grid.ell.length * D.grid.sf.length * D.grid.sn.length).toLocaleString("en-US") + " settings).",
      "RMSE on its own records against 400 new ones: " + kwS(st4[0].own) + " and " + kwS(st4[0].held) + " for the records' choice; " + kwS(st4[1].own) + " and " + kwS(st4[1].held) + " for a very short length-scale.",
      "On 400 new records the 90% band holds " + pctS(b[0].cov[90]) + " (± " + (100 * F.se90).toFixed(0) + " points by chance): " + b[0].byRange.map(function (q) { return pctS(q.cov90, 0) + " at " + q.label; }).join(", ") + ".",
      "Adding the maker's curve as a second source cuts the RMSE from " + kwS(b[0].rmse) + " to " + kwS(b[1].rmse) + " and the band's mean width from " + kwS(b[0].width) + " to " + kwS(b[1].width) + "; the band holds " + pctS(b[1].cov[90]) + ".",
      "Two sources are " + kwS(F.sc.base[SW[0]][0].rmse - F.sc.base[SW[0]][1].rmse) + " closer with " + SW[0] + " records and " + kwS(F.sc.base[last][0].rmse - F.sc.base[last][1].rmse) + " with " + last + ".",
      "With a load-reducing mode above " + msS(T.reduce.from) + " that the maker's curve leaves out, the two-source band holds " + pctS(r[1].byRange[2].cov90, 0) + " of new records at 13–20 m/s; the one-source band holds " + pctS(r[0].byRange[2].cov90, 0) + ".",
      "In that case pinball loss rates the two fits about equal (" + r[0].pinball.toFixed(1) + " and " + r[1].pinball.toFixed(1) + " kW), while RMSE is " + kwS(r[0].rmse) + " and " + kwS(r[1].rmse) + "."
    ];
    var rows = [["Records to fit, to score", N0 + " and 400 (illustrative, seeded)"], ["Records' choice (one source)", msS(F.ml.hp.ell) + ", " + kwS(F.ml.hp.sf) + ", " + kwS(F.ml.hp.sn)],
                ["RMSE, one and two sources", kwS(b[0].rmse) + " and " + kwS(b[1].rmse)], ["90% band holds, one and two sources", pctS(b[0].cov[90]) + " and " + pctS(b[1].cov[90])],
                ["Load-reducing mode, holds at 13–20 m/s", pctS(r[0].byRange[2].cov90, 0) + " and " + pctS(r[1].byRange[2].cov90, 0)]];
    return '<p class="lx-eyebrow">One turbine, ' + N0 + ' records, two fits (illustrative)</p>\n<div class="m9-fbfig">\n' + s + '\n</div>\n<ol>\n' + li.map(function (t) { return "<li>" + t + "</li>"; }).join("\n") + "\n</ol>\n" +
      '<p class="lx-eyebrow">The summaries on this page</p>\n<div class="lx-scroll-x"><table class="lx-facts m9-fbtab">\n<thead><tr><th scope="col">Summary</th><th scope="col">Value</th></tr></thead>\n<tbody>\n' +
      rows.map(function (q) { return '<tr><td>' + q[0] + '</td><td class="n">' + q[1] + '</td></tr>'; }).join("\n") + '\n</tbody></table></div>\n<p class="lx-hint">With JavaScript on, you fit and score these curves yourself, step by step.</p>';
  }
  var Z9 = ZL[90];

  var model = { rng: rng, maker: maker, field: field, slope: slope, scatter: scatter, weibull: weibull, records: records, reduceShare: reduceShare,
                chol: chol, fwd: fwd, bwd: bwd, solve: solve, basis: basis, kern: kern, fit: fit, predict: predict, covariance: covariance, search: search,
                erf: erf, Phi: Phi, phi: phi, invPhi: invPhi, pinball: pinball, scores: scores, LEVELS: LEVELS, RANGES: RANGES, ZL: ZL, TAU: TAU,
                campaign: campaign, heldOut: heldOut, stored: stored, fitStored: fitStored, curve: curve, widest: widest, gaps: gaps,
                facts: facts, reference: reference, staticFallback: staticFallback };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window !== "undefined" && window.LX) window.LX.M9 = model;   // case file CF8 loads this script for its GP
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;
  // ================================================================ view
  var LX = window.LX, H = LX.H, KEY = "m9-own";
  var COL = { one: "var(--lx-tier-3)", two: "var(--lx-accent)", rec: "var(--lx-ink)", held: "var(--lx-ink-3)", maker: "var(--lx-wind)", field: "var(--lx-ink-2)", bad: "var(--lx-bad)" };
  var Z90 = ZL[90];
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  function kw(v) { return int(v) + " kW"; }
  function pct(f, d) { return (100 * f).toFixed(d == null ? 1 : d) + "%"; }
  function ms(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "") + " m/s"; }
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
  function row(host) { return H("div", { class: "m9-row" }, host); }
  function readout(host) { return H("p", { class: "m9-out", "aria-live": "polite" }, host); }
  // a small table of scores: rows [[label, cells...]], head [...]
  function table(host, head, rows, cls) {
    host.innerHTML = "";
    var sc = H("div", { class: "lx-scroll-x" }, host), t = H("table", { class: "lx-mini-table " + (cls || "") }, sc), hr = H("tr", null, H("thead", null, t)), bd = H("tbody", null, t);
    head.forEach(function (h) { H("th", { scope: "col", text: h }, hr); });
    rows.forEach(function (r) { var tr = H("tr", null, bd); r.forEach(function (c, i) { H(i ? "td" : "th", i ? { text: c, class: "n" } : { scope: "row", text: c }, tr); }); });
    return t;
  }
  // ---- the fit chart (i-fitter, lesson-local, on LX.Plot): records as dots, the maker's curve dashed, each fit's mean
  // and its 90% band as columns 0.25 m/s wide (the band at each column's centre); o = {fits: [{F, color, label}],
  // recs: [{r, color, label, faint}], maker, field (mode or null), aria}
  function fitSpec(T, o) {
    var bars = [], lines = [], legend = [], X0 = T.range[0], X1 = T.range[1], step = 0.25, dark = LX.isDark && LX.isDark();
    var curves = (o.fits || []).map(function (f) { return { f: f, c: curve(f.F, X0, X1, 0.1) }; });
    (o.fits || []).forEach(function (f) {
      for (var v = X0; v < X1 - 1e-9; v += step) {
        var q = predict(f.F, v + step / 2);
        bars.push({ x0: v, x1: v + step, y0: q.m - Z90 * q.sd, y1: q.m + Z90 * q.sd, color: f.color, op: dark ? 0.26 : 0.15 });
      }
    });
    if (o.maker) { var mk = []; for (var v = X0; v <= X1 + 1e-9; v += 0.1) mk.push([v, maker(T, v)]); lines.push({ pts: mk, color: COL.maker, dash: "6 4", width: 2 }); legend.push({ label: "The maker's curve", color: COL.maker, dash: "6 4" }); }
    if (o.field) { var fd = []; for (var w = X0; w <= X1 + 1e-9; w += 0.1) fd.push([w, field(T, w, o.field === "reduce" ? "reduce" : null)]); lines.push({ pts: fd, color: COL.field, dash: "2 3", width: 1.6 }); legend.push({ label: "The field curve (hidden from the fits)", color: COL.field, dash: "2 3" }); }
    (o.recs || []).forEach(function (s) { lines.push({ pts: s.r.map(function (p) { return [p[0], p[1]]; }), color: s.color, width: 0, dots: true, op: s.faint ? 0.45 : 1 }); legend.push({ label: s.label, color: s.color }); });
    curves.forEach(function (c) { lines.push({ pts: c.c.map(function (p) { return [p.v, p.m]; }), color: c.f.color, width: 2.6 }); legend.push({ label: c.f.label + ", with its 90% band", color: c.f.color }); });
    var rows = [];
    for (var s = X0; s <= X1; s += 1) rows.push([ms(s)].concat(o.maker ? [kw(maker(T, s))] : [], (o.fits || []).map(function (f) { var q = predict(f.F, s); return kw(q.m) + " (" + kw(q.m - Z90 * q.sd) + " to " + kw(q.m + Z90 * q.sd) + ")"; })));
    return {
      x: { min: X0, max: X1, ticks: [[3, "3"], [6, "6"], [9, "9"], [12, "12"], [15, "15"], [18, "18"], [20, "20 m/s", "end"]], ticksN: [[3, "3"], [8, "8"], [13, "13"], [20, "20 m/s", "end"]] },
      y: { min: -500, max: 2500, step: 500, fmt: function (v) { return int(v); }, unit: "kW", zero: true },
      height: 300, heightN: 250, bars: bars, lines: lines, legend: legend,
      tip: function (x) {
        var t = "<div><b>" + ms(x) + "</b></div>";
        if (o.maker) t += "<div>Maker: " + kw(maker(T, x)) + "</div>";
        (o.fits || []).forEach(function (f) { var q = predict(f.F, x); t += "<div>" + f.label + ": " + kw(q.m) + ", band " + kw(q.m - Z90 * q.sd) + " to " + kw(q.m + Z90 * q.sd) + "</div>"; });
        return t;
      }, tipStep: 0.5,
      aria: o.aria || "Power against wind speed.",
      text: { head: ["Wind speed"].concat(o.maker ? ["Maker's curve"] : [], (o.fits || []).map(function (f) { return f.label + " (90% band)"; })), rows: rows,
              note: (o.recs || []).map(function (s) { return s.label + ": " + s.r.length + " records."; }).join(" ") }
    };
  }

  LX.mount("m09", function (live, data, root) {
    var D = data.m09_surrogates_uq, T = D.turbine, N0 = D.n0, own = LX.store.get(KEY, {}) || {};
    function keep(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var test = heldOut(D), testR = heldOut(D, "reduce"), cache = {};
    function get(k, f) { if (!(k in cache)) cache[k] = f(); return cache[k]; }
    var lab = {
      fit: function (n, two, mode) { return get(["fit", n, two, mode || ""].join(), function () { return fitStored(D, n, two, mode); }); },
      sc: function (n, two, mode) { return get(["sc", n, two, mode || ""].join(), function () { return scores(lab.fit(n, two, mode), heldOut(D, mode)); }); }
    };
    var steps = [], S = {};

    // ---- 1 the records and the maker's curve
    var G1 = gaps(T, test), top = G1.filter(function (b) { return b.gap != null; }).sort(function (a, b) { return b.gap - a.gap || a.lo - b.lo; })[0];
    steps.push({
      text: "One 2,000 [[kilowatt|kW]] turbine, 400 ten-minute records (illustrative): the maker's [[power-curve|power curve]] is one line, and real records scatter around it. Where do they sit furthest below it?",
      build: function (act, api) {
        var host = H("div", null, act);
        var pr = LX.Predict(act, { id: "m9-gap", q: "Your pick:", answer: "knee", fresh: true, title: false,
          options: D.guess.map(function (g) { return { value: g.value, label: g.label }; }),
          feedback: { knee: "Gusts inside each ten minutes smooth the curve's sharp corner at rated speed, 11.5 m/s." },
          onPick: function (v) { keep("gap", v); draw(); pr.reveal(); } });
        act.appendChild(host);
        function draw() {
          host.innerHTML = "";
          var P = LX.Plot(host, { text: "Text version of the chart" });
          P.render(fitSpec(T, { maker: true, recs: [{ r: test, color: COL.held, label: "400 records" }], aria: "400 records of power against wind speed, with the maker's curve." }));
          api.done();
          api.saw("Furthest below: " + top.lo + "–" + top.hi + " m/s, " + kw(top.gap) + " on average. The real curve is a band, and its shape near rated speed differs from the maker's line.");
        }
      }
    });

    // ---- 2 a Gaussian process with fixed settings, on 8, 16 and 32 records
    steps.push({
      text: "A [[gaussian-process|Gaussian process]] fits a smooth curve to a few records and draws a band around it. Fit the first 8, 16 and 32 records: where is the band widest?",
      build: function (act, api) {
        var seen = {}, P, out;
        seg(row(act), D.steps2.map(function (n) { return n + " records"; }), -1, function (i) { show(D.steps2[i]); }, "Records used");
        H("p", { class: "lx-hint", text: "Settings fixed for now: length-scale " + ms(D.fixed.ell) + ", signal size " + kw(D.fixed.sf) + ", noise " + kw(D.fixed.sn) + ". Step 3 lets the records choose." }, act);
        P = LX.Plot(act, { text: "Text version of the chart" }); out = readout(act);
        function show(n) {
          seen[n] = 1;
          var F = fit(T, campaign(D, n), D.fixed, false), w = widest(F, T), r = campaign(D, n), vmax = Math.max.apply(null, r.map(function (p) { return p[0]; }));
          P.render(fitSpec(T, { fits: [{ F: F, color: COL.one, label: "Gaussian process" }], recs: [{ r: r, color: COL.rec, label: n + " records" }], aria: "A Gaussian process fitted to " + n + " records, with its 90% band." }));
          out.innerHTML = n + " records, up to " + ms(vmax) + ": the 90% band is <b>" + kw(w.mean) + "</b> wide on average, widest at " + ms(w.v) + ".";
          if (Object.keys(seen).length >= D.steps2.length) {
            var a = widest(fit(T, campaign(D, D.steps2[1]), D.fixed, false), T), b = widest(fit(T, campaign(D, D.steps2[2]), D.fixed, false), T);
            var v1 = Math.max.apply(null, campaign(D, D.steps2[1]).map(function (p) { return p[0]; })), v2 = Math.max.apply(null, campaign(D, D.steps2[2]).map(function (p) { return p[0]; }));
            api.done(); api.saw("The band is narrow near records and widest beyond the last one: " + ms(v1) + " with " + D.steps2[1] + " records. Records up to " + ms(v2) + " cut its mean width from " + kw(a.mean) + " to " + kw(b.mean) + ".");
          } else api.saw("Seen " + Object.keys(seen).length + " of " + D.steps2.length + ".", true);
        }
        out.textContent = "Pick a number of records.";
      }
    });

    // ---- 3 the settings, then the records' own choice (maximum likelihood on the grid)
    steps.push({
      text: "Two settings shape the fit: the [[length-scale|length-scale]], how far one record reaches, and the noise, the scatter expected around the curve. Move them, then let the " + N0 + " records choose.",
      build: function (act, api) {
        var recs = campaign(D, N0), G = D.grid, best = null, P, out, hp;
        var ML = stored(D, null, false, N0);
        hp = { ell: G.ell[G.ell.indexOf(2)] || 2, sf: ML.sf, sn: G.sn[G.sn.indexOf(40)] || 40 };
        var sl = LX.Slider(act, { label: "Length-scale", color: COL.one, min: 0, max: G.ell.length - 1, step: 1, value: G.ell.indexOf(hp.ell), fmt: function (i) { return ms(G.ell[i]); }, onChange: function (i) { hp.ell = G.ell[i]; draw(true); } });
        var sn = LX.Slider(act, { label: "Noise", color: COL.held, min: 0, max: G.sn.length - 1, step: 1, value: G.sn.indexOf(hp.sn), fmt: function (i) { return kw(G.sn[i]); }, onChange: function (i) { hp.sn = G.sn[i]; draw(true); } });
        var r = row(act), b = H("button", { type: "button", class: "lx-btn small", text: "Let the records choose" }, r);
        H("span", { class: "m9-note", text: "Signal size held at " + kw(ML.sf) + "." }, r);
        P = LX.Plot(act, { text: "Text version of the chart" }); out = readout(act);
        b.addEventListener("click", function () {
          if (!best) best = search(T, recs, false, G);
          hp = { ell: best.hp.ell, sf: best.hp.sf, sn: best.hp.sn };
          sl.set(G.ell.indexOf(hp.ell)); sn.set(G.sn.indexOf(hp.sn)); draw(false);
          api.done(); api.saw("The records choose a length-scale of " + ms(hp.ell) + ", noise " + kw(hp.sn) + " and signal size " + kw(hp.sf) + ": the most likely of " + int(G.ell.length * G.sf.length * G.sn.length) + " settings on a grid, searched in your browser.");
        });
        function draw(user) {
          var F = fit(T, recs, hp, false);
          if (!best) best = search(T, recs, false, G);
          P.render(fitSpec(T, { fits: [{ F: F, color: COL.one, label: "Gaussian process" }], recs: [{ r: recs, color: COL.rec, label: N0 + " records" }], aria: "A Gaussian process fitted to " + N0 + " records with the settings chosen." }));
          var gap = best.ll - F.ll;
          out.innerHTML = "Length-scale " + ms(hp.ell) + ", noise " + kw(hp.sn) + ": log-likelihood <b>" + F.ll.toFixed(1) + "</b>, " + (gap < 1e-9 ? "the best on the grid." : gap.toFixed(1) + " below the best on the grid.");
          keep("ell", hp.ell); keep("sn", hp.sn);
          if (user) api.saw("Short length-scales chase single records; long ones cannot bend at rated speed. Now let the records choose.", true);
        }
        draw(false);
      }
    });

    // ---- 4 training records flatter: score on 400 held-out records
    steps.push({
      text: "A fit always looks good on its own records, so score it on 400 records it never saw, [[held-out-data|held-out]] data, as [[rmse|RMSE]]. Try a very short and a very long length-scale too.",
      build: function (act, api) {
        var recs = campaign(D, N0), ML = stored(D, null, false, N0), E = D.extremes, seen = {}, tb = H("div", null, act), out = readout(act);
        var cases = [{ key: "ml", label: "Records' choice", hp: ML }, { key: "short", label: "Very short: " + ms(E.short.ell) + ", noise " + kw(E.short.sn), hp: { ell: E.short.ell, sf: ML.sf, sn: E.short.sn } },
                     { key: "long", label: "Very long: " + ms(E.long.ell), hp: { ell: E.long.ell, sf: ML.sf, sn: ML.sn } }];
        var res = cases.map(function (c) { var F = fit(T, recs, c.hp, false); return { c: c, own: scores(F, recs).rmse, held: scores(F, test).rmse }; });
        seg(row(act), cases.map(function (c) { return c.label.split(":")[0]; }), -1, function (i) { seen[i] = 1; draw(i); }, "Settings");
        act.appendChild(tb); act.appendChild(out);
        function draw(i) {
          table(tb, ["Settings", "RMSE on its " + N0 + " records", "RMSE on 400 new records"], res.filter(function (x, j) { return seen[j]; }).map(function (x) { return [x.c.label, kw(x.own), kw(x.held)]; }));
          out.innerHTML = res[i].c.label + ": <b>" + kw(res[i].own) + "</b> off on its own records, <b>" + kw(res[i].held) + "</b> on new ones.";
          if (Object.keys(seen).length >= cases.length) { api.done(); api.saw("The very short length-scale threads every record: " + kw(res[1].own) + " off on its own, " + kw(res[1].held) + " on new ones. Judge a fit only on records it has not seen."); }
          else api.saw("Settings tried: " + Object.keys(seen).length + " of " + cases.length + ".", true);
        }
        out.textContent = "Pick settings.";
      }
    });

    // ---- 5 calibration on the held-out records
    steps.push({
      text: "A band is [[calibration|calibrated]] when a 90% band holds about 90% of new records. Check the records' choice at four levels, then by wind speed.",
      build: function (act, api) {
        var s = lab.sc(N0, false), seen = {}, tb = H("div", null, act), tb2 = H("div", null, act), out = readout(act);
        seg(row(act), LEVELS.map(function (l) { return l + "% band"; }), -1, function (i) { seen[i] = 1; draw(i); }, "Band level");
        act.appendChild(tb); act.appendChild(tb2); act.appendChild(out);
        function draw(i) {
          table(tb, ["Band", "Should hold", "Holds, 400 new records"], LEVELS.filter(function (l, j) { return seen[j]; }).map(function (l) { return [l + "% band", l + "%", pct(s.cov[l])]; }));
          if (seen[2]) table(tb2, ["Wind speed", "New records", "90% band holds"], s.byRange.map(function (r) { return [r.label, String(r.n), pct(r.cov90, 0)]; }));
          out.innerHTML = LEVELS[i] + "% band: holds <b>" + pct(s.cov[LEVELS[i]]) + "</b> of 400 new records; chance alone moves this by about ± " + (200 * Math.sqrt(LEVELS[i] / 100 * (1 - LEVELS[i] / 100) / s.n)).toFixed(0) + " points.";
          if (seen[2] && Object.keys(seen).length >= 2) {
            var b = s.byRange;
            api.done(); api.saw("The 90% band holds " + pct(s.cov[90]) + ": a little wide. By speed, " + pct(b[0].cov90, 0) + ", " + pct(b[1].cov90, 0) + " and " + pct(b[2].cov90, 0) + ": one noise level cannot fit scatter that grows where the curve is steep.");
          } else api.saw(seen[2] ? "Try one more level." : "Pick the 90% band too.", true);
        }
        out.textContent = "Pick a band.";
      }
    });

    // ---- 6 two sources: the maker's curve as cheap data
    steps.push({
      text: "The maker's curve is cheap: it covers every speed for free. Use it as a second source: the [[multi-fidelity|two-source]] model scales the curve and learns only the gap to the records.",
      build: function (act, api) {
        var a = lab.fit(N0, false), b = lab.fit(N0, true), sa = lab.sc(N0, false), sb = lab.sc(N0, true), recs = campaign(D, N0), P, tb, out, seen = {};
        seg(row(act), ["One source", "Two sources"], -1, function (i) { seen[i] = 1; draw(i); }, "Sources");
        P = LX.Plot(act, { text: "Text version of the chart" }); tb = H("div", null, act); out = readout(act);
        function draw(i) {
          var fits = i ? [{ F: a, color: COL.one, label: "One source" }, { F: b, color: COL.two, label: "Two sources" }] : [{ F: a, color: COL.one, label: "One source" }];
          P.render(fitSpec(T, { fits: fits, maker: !!i, recs: [{ r: recs, color: COL.rec, label: N0 + " records" }], aria: "One-source and two-source fits to " + N0 + " records." }));
          table(tb, ["On 400 new records", "One source", "Two sources"], [["RMSE", kw(sa.rmse), seen[1] ? kw(sb.rmse) : "?"], ["90% band holds", pct(sa.cov[90]), seen[1] ? pct(sb.cov[90]) : "?"], ["90% band, mean width", kw(sa.width), seen[1] ? kw(sb.width) : "?"]]);
          out.innerHTML = i ? "Two sources: ρ = " + (b.beta[1] / 1000).toFixed(2) + " times the maker's curve, plus " + kw(b.beta[0]) + ", plus a learned gap." : "One source: the records alone.";
          if (seen[1]) { api.done(); api.saw("Same " + N0 + " records: two sources cut the RMSE from " + kw(sa.rmse) + " to " + kw(sb.rmse) + " and the band's mean width from " + kw(sa.width) + " to " + kw(sb.width) + "; it still holds " + pct(sb.cov[90]) + "."); }
        }
        out.textContent = "Pick one.";
      }
    });

    // ---- 7 more records: when the cheap curve stops mattering
    steps.push({
      text: "Cheap data matter most when records are few. Add records, " + D.sweep[0] + " to " + D.sweep[D.sweep.length - 1] + ", and watch the gap between one and two sources.",
      build: function (act, api) {
        var SW = D.sweep, idx = 0, P, tb, out;
        var sl = S.s7 = LX.Slider(act, { label: "Records", color: COL.rec, min: 0, max: SW.length - 1, step: 1, value: 0, fmt: function (i) { return SW[i] + " records"; }, onChange: function (i) { idx = i; draw(true); } });
        P = LX.Plot(act, { text: "Text version of the chart" }); tb = H("div", null, act); out = readout(act);
        function draw(user) {
          var pts = SW.slice(0, idx + 1);
          P.render({ x: { min: SW[0], max: SW[SW.length - 1], ticks: SW.map(function (n, i) { return [n, String(n), i === 0 ? "start" : i === SW.length - 1 ? "end" : "middle"]; }) },
                     y: { min: 0, max: 150, step: 25, fmt: function (v) { return int(v); }, unit: "kW" }, height: 220, heightN: 200,
                     lines: [{ pts: pts.map(function (n) { return [n, lab.sc(n, false).rmse]; }), color: COL.one, dots: true }, { pts: pts.map(function (n) { return [n, lab.sc(n, true).rmse]; }), color: COL.two, dots: true }],
                     legend: [{ label: "One source", color: COL.one }, { label: "Two sources", color: COL.two }],
                     aria: "RMSE on 400 new records against the number of records, one and two sources.",
                     text: { head: ["Records", "RMSE, one source", "RMSE, two sources"], rows: pts.map(function (n) { return [String(n), kw(lab.sc(n, false).rmse), kw(lab.sc(n, true).rmse)]; }) } });
          var n = SW[idx], a = lab.sc(n, false), b = lab.sc(n, true);
          table(tb, [n + " records", "One source", "Two sources"], [["RMSE", kw(a.rmse), kw(b.rmse)], ["90% band holds", pct(a.cov[90]), pct(b.cov[90])], ["90% band, mean width", kw(a.width), kw(b.width)]]);
          out.innerHTML = n + " records: two sources are <b>" + kw(a.rmse - b.rmse) + "</b> closer on new records.";
          keep("n", n);
          if (user && idx === SW.length - 1) {
            var f0 = lab.sc(SW[0], false).rmse - lab.sc(SW[0], true).rmse;
            api.done(); api.saw("At " + SW[0] + " records two sources are " + kw(f0) + " closer; at " + n + ", " + kw(a.rmse - b.rmse) + ". Once records cover the speeds that matter, the cheap curve adds little.");
          } else if (user) api.saw("Keep adding records.", true);
        }
        draw(false);
      }
    });

    // ---- 8 when the cheap curve misleads: a load-reducing mode above 12.5 m/s
    var R = T.reduce;
    steps.push({
      text: "Suppose this turbine runs a load-reducing mode above " + ms(R.from) + " that the maker's curve leaves out, and the first " + N0 + " records stop at " + ms(Math.max.apply(null, campaign(D, N0).map(function (p) { return p[0]; }))) + ". Which band do you trust at 15 m/s?",
      build: function (act, api) {
        var a = lab.fit(N0, false, "reduce"), b = lab.fit(N0, true, "reduce"), sa = lab.sc(N0, false, "reduce"), sb = lab.sc(N0, true, "reduce"), host = H("div", null, act);
        var pr = LX.Predict(act, { id: "m9-trust", q: "Your pick:", answer: "one", fresh: true, title: false,
          options: [{ value: "one", label: "One source", color: COL.one }, { value: "two", label: "Two sources", color: COL.two }],
          feedback: { one: "Its band is wide where no record is, and that is honest.", two: "It trusts the maker's curve where no record can correct it." },
          onPick: function (v) { keep("trust", v); draw(); pr.reveal(); } });
        act.appendChild(host);
        function draw() {
          host.innerHTML = "";
          var P = LX.Plot(host, { text: "Text version of the chart" });
          P.render(fitSpec(T, { fits: [{ F: a, color: COL.one, label: "One source" }, { F: b, color: COL.two, label: "Two sources" }], maker: true, field: "reduce",
                                recs: [{ r: testR, color: COL.held, label: "400 new records", faint: true }, { r: campaign(D, N0, "reduce"), color: COL.rec, label: N0 + " records" }],
                                aria: "Both fits in the load-reducing case, with 400 new records." }));
          var tb = H("div", null, host);
          table(tb, ["On 400 new records", "One source", "Two sources"], [["RMSE", kw(sa.rmse), kw(sb.rmse)], ["90% band holds, all speeds", pct(sa.cov[90]), pct(sb.cov[90])], ["90% band holds, 13–20 m/s (" + sa.byRange[2].n + " records)", pct(sa.byRange[2].cov90, 0), pct(sb.byRange[2].cov90, 0)]]);
          api.done();
          api.saw("Above 13 m/s the two-source band holds " + pct(sb.byRange[2].cov90, 0) + " of new records; the one-source band, wide but honest, holds " + pct(sa.byRange[2].cov90, 0) + ". Cheap data mislead where they are wrong and no record can correct them.");
        }
      }
    });

    // ---- 9 which fit is better depends on the score
    steps.push({
      text: "Which fit is better depends on the score. In the load-reducing case, find the score on which the two fits look about equal, and ask what it hides.",
      build: function (act, api) {
        var sa = lab.sc(N0, false, "reduce"), sb = lab.sc(N0, true, "reduce"), tb = H("div", null, act), out = readout(act);
        var SC = [{ k: "rmse", label: "RMSE", f: function (s) { return kw(s.rmse); } }, { k: "cov", label: "90% band holds", f: function (s) { return pct(s.cov[90]); } },
                  { k: "pb", label: "Pinball loss", f: function (s) { return (Math.round(s.pinball * 10) / 10).toFixed(1) + " kW"; } }, { k: "hi", label: "Holds at 13–20 m/s", f: function (s) { return pct(s.byRange[2].cov90, 0); } }];
        seg(row(act), SC.map(function (s) { return s.label; }), -1, function (i) { draw(i); }, "Score");
        act.appendChild(tb); act.appendChild(out);
        function draw(i) {
          table(tb, ["Load-reducing case, " + N0 + " records", "One source", "Two sources"], SC.map(function (s) { return [s.label, s.f(sa), s.f(sb)]; }), "m9-scores");
          var c = SC[i];
          out.innerHTML = c.label + ": one source <b>" + c.f(sa) + "</b>, two sources <b>" + c.f(sb) + "</b>.";
          if (c.k === "pb") { api.done(); api.saw("Averaged over all 400 records, [[pinball-loss|pinball loss]] rates them about equal; only " + sa.byRange[2].n + " records lie above 13 m/s, where the two-source band fails. Score where the decision needs it, not only on average."); }
          else api.saw(c.k === "hi" ? "This one shows the failure. Find the one that hides it." : "Not equal on this score.", true);
        }
        out.textContent = "Pick a score.";
      }
    });

    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "m9-steps", steps: steps });
    function clickIn(sel, i) { var b = cardsHost.querySelectorAll(sel)[i || 0]; if (b) b.click(); }
    // demo states (core.js LX.demo): "mid" = step 6 with both sources shown; step-N opens card N with its action done
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 6 : m ? Math.min(steps.length, +m[1]) : 0;
      if (!n) return null;
      cards.go(n - 1);
      if (n === 1 || n === 8) clickIn(".lx-step-act .lx-choice", n === 1 ? 2 : 0);
      if (n === 2) [0, 1, 2].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 3) clickIn(".lx-step-act .m9-row .lx-btn");
      if (n === 4) [1, 2, 0].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 5) [0, 2].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 6) [0, 1].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 7 && S.s7) for (var k = 1; k < D.sweep.length; k++) S.s7.set(k, true);
      if (n === 9) clickIn(".lx-step-act .lx-seg button", 2);
      return { view: state };
    }, cards);
    explain(D, lab);
  });

  // ---------------------------------------------------------------- explain layer: an annotated fit, a comparison table
  // and where the numbers hold; always the reference case (the first 16 records, the records' own settings)
  function explain(D, lab) {
    var x = document.getElementById("m9-explain"); if (!x) return;
    x.innerHTML = "";
    var T = D.turbine, N0 = D.n0, a = lab.fit(N0, false), recs = campaign(D, N0), last = Math.max.apply(null, recs.map(function (r) { return r[0]; }));
    var near = recs.slice().sort(function (p, q) { return Math.abs(p[0] - 8) - Math.abs(q[0] - 8); })[0], q8 = predict(a, near[0]), q16 = predict(a, 16), w = widest(a, T);
    var card = H("div", { class: "lx-xcard" }, x);
    H("header", { class: "lx-x-head", html: "<h3>A Gaussian process fit, labelled</h3>" }, card);
    H("p", { class: "lx-hint", text: "Reference case, whatever you set above: the first " + N0 + " records and the settings they chose (step 3)." }, card);
    var P = LX.Plot(card, { text: "Text version of the chart" }), spec = fitSpec(T, { fits: [{ F: a, color: COL.one, label: "Gaussian process" }], maker: true, recs: [{ r: recs, color: COL.rec, label: N0 + " records" }], aria: "An annotated Gaussian process fit." });
    spec.marks = [{ x: near[0], y: near[1], n: "1", kind: "dot" }, { x: 6, y: predict(a, 6).m, n: "2", kind: "dot" }, { x: near[0], y: q8.m + Z90 * q8.sd, n: "3", kind: "dot" },
                  { x: 16, y: q16.m + Z90 * q16.sd > 2400 ? 2350 : q16.m + Z90 * q16.sd, n: "4", kind: "dot" }, { x: 11.5, y: 2000, n: "5", kind: "dot" }];
    P.render(spec);
    var ol = H("ol", { class: "m9-annot" }, card);
    [["A record", "one ten-minute average of wind speed and power."],
     ["The fitted curve", "the GP's best guess between and beyond the records."],
     ["Band near records", "90% band " + kw(2 * Z90 * q8.sd) + " wide at " + ms(near[0]) + ": records pin the curve down."],
     ["Band beyond the records", "the last record is at " + ms(last) + "; the band is widest at " + ms(w.v) + ", " + kw(w.width) + "."],
     ["The maker's curve", "a cheap second source: two sources borrow its shape where records are missing."]].forEach(function (t) { var li = H("li", null, ol); H("b", { text: t[0] + ": " }, li); li.appendChild(document.createTextNode(t[1])); });
    var s1 = lab.sc(N0, false), s2 = lab.sc(N0, true), r1 = lab.sc(N0, false, "reduce"), r2 = lab.sc(N0, true, "reduce");
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "One source or two? The " + N0 + " records, scored on 400 new ones", text: true,
      columns: [{ key: "name", label: "Fit", main: true }, { key: "base", label: "As built: RMSE, 90% band holds" }, { key: "red", label: "Load-reducing mode: holds at 13–20 m/s" }, { key: "when", label: "Use it when", phoneHide: true }],
      rows: [
        { key: "one", color: COL.one, name: "One source (GP on the records)", base: kw(s1.rmse) + ", " + pct(s1.cov[90]), red: pct(r1.byRange[2].cov90, 0), when: "the cheap curve may be wrong where records are missing" },
        { key: "two", color: COL.two, name: "Two sources (maker's curve + GP on the gap)", base: kw(s2.rmse) + ", " + pct(s2.cov[90]), red: pct(r2.byRange[2].cov90, 0), when: "the cheap curve is right in shape and records are few" }
      ],
      sorts: [{ label: "As built", order: ["one", "two"], note: "Neither wins on every score: say which score, and where it was measured." }]
    });
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where this lesson's numbers hold",
      holds: ["one invented 2,000 kW turbine, its records drawn from a stated recipe with fixed seeds;", "the first " + N0 + " of " + D.counts.campaign + " records to fit, 400 others to score;",
              "settings chosen by maximum likelihood on a fixed grid;", "a squared-exponential kernel and one noise level."],
      leaves: ["real records: stops, curtailment and icing, which real data need cleaned first;", "scatter that changes with wind speed, which one noise level cannot follow;",
               "other kernels and the nonlinear two-source models of the lab;", "air density, direction and turbulence as extra inputs."],
      source: "Model: this page's toy turbine; campaign seed " + D.seeds.campaign + ", check seed " + D.seeds.test + "." });
  }
})();
