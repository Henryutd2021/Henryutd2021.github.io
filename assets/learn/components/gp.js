/* gp.js — LX.M9: Gaussian processes on small data (one source, or two with a cheap level: multi-fidelity), their
   covariance, maximum likelihood on a grid, the normal distribution and held-out scores (coverage, RMSE, pinball loss),
   with the toy wind turbine they are taught on. Shared by Modeler lesson M9 (whose page script is
   assets/learn/m09-surrogates-uq.js) and case file CF8, which turns its fits into a capacity-factor band. Pure: no DOM; the page passes in its data (assets/learn/data/m09-surrogates-uq.json: the turbine, the stored
   records and the stored maximum-likelihood settings). Each page keeps its own text and view (M9: facts, reference,
   staticFallback). Node: require("assets/learn/components/gp.js"); tests: _tests/learn/test_m09-surrogates-uq.js,
   test_cf8-power-curves-from-scarce-data.js (every number), test_components_w4_int.js (the shared component in the bundle).

   The toy (illustrative; invented, seeded, not any real turbine or the course author's data): one 2,000 kW wind turbine.
     maker's curve   f(v) = 0 below 3 m/s; 2,000 (v^3 - 3^3) / (11.5^3 - 3^3) kW from 3 to 11.5 m/s; 2,000 kW above
     field curve     g(v) = 0.97 x the maker's curve averaged over gusts: E[f(v (1 + 0.12 Z))], Z standard normal
                     (turbulence intensity 12%, 3% losses), by a fixed 201-point rule on z in [-5, 5]. Gusts smooth the
                     knee, so g falls furthest below f around rated speed.
     load-reducing   (step 8 only) the same turbine in a mode the maker's curve does not show: g(v) x (1 - 0.5 s),
                     s = min(1, max(0, (v - 12.5) / 7.5)): from 12.5 m/s its output falls to half by 20 m/s
     records         10-minute averages: wind speed v ~ Weibull (k 2, c 8 m/s) cut to 3-20 m/s (inverse transform);
                     power p = max(0, g(v) + sd(v) z), sd(v) = sqrt(15^2 + (0.3 g'(v))^2) kW: 15 kW of background
                     noise combined with an approximate wind-error term, 0.3 m/s times the curve's slope. The recorded
                     wind speed itself is never perturbed; this vertical term stands in for a 0.3 m/s error in it, so
                     the scatter grows where the curve is steep.
                     Generator mulberry32 (LX.mulberry32); one uniform for v, then two for z (Box-Muller, cosine branch).
                     A campaign of 64 records (seed 9; the first n are "n records") and 400 held-out records (seed 2023);
                     the load-reducing case reuses the same uniforms, so only the truth changes. Stored rounded in the
                     data file (v to 0.01 m/s, p to 0.1 kW); every fit and score uses the stored values.

   The model: a Gaussian process with a squared-exponential kernel k(v, v') = sf^2 exp(-(v - v')^2 / (2 ell^2)) and
   noise sn^2, and a mean that is a linear combination of basis functions with coefficients beta fitted by generalized
   least squares (universal kriging):
     one source (GP)        basis h(v) = [1]                 a constant level plus a smooth wiggle
     two sources (MF)       basis h(v) = [1, f(v) / 1000]    the maker's curve, scaled by rho = beta_2 / 1000 and shifted,
                                                             plus a GP for the gap: Kennedy and O'Hagan's autoregressive
                                                             form with a cheap level that is known exactly at every speed
     K = sf^2 C + sn^2 I = L L^T (Cholesky); beta = (H^T K^-1 H)^-1 H^T K^-1 y; r = y - H beta
     mean m(v) = h^T beta + k^T K^-1 r
     latent variance s2(v) = sf^2 - k^T K^-1 k + u^T (H^T K^-1 H)^-1 u, u = h - H^T K^-1 k  (the last term: beta's own
     uncertainty); a new record's sd = sqrt(s2 + sn^2), so bands are for records, not for the curve alone.
     log-likelihood (maximum likelihood, beta at its GLS value): -r^T K^-1 r / 2 - log|K| / 2 - n log(2 pi) / 2
     settings by maximum likelihood over a fixed grid (data: grid.ell x grid.sf x grid.sn); tie rule: the first best in
     grid order (ell, then sf, then sn), and the test proves every best used on the page wins by more than 1e-6.

   Scores on the 400 held-out records: RMSE (kW); coverage of central bands m +/- z sd (z for 50, 80, 90, 95%), overall
   and by wind-speed range (3-8, 8-13, 13-20 m/s); the mean width of the 90% band (kW); the mean pinball loss over the 19
   quantiles 5%, 10%, ..., 95% of N(m, sd^2) (kW; a proper score: lower is better, and it rewards a band that is both
   narrow and honest). Every number M9 and CF8 state comes from these functions; their tests check them, and M9's lab
   notebook asserts the data file's reference block.
*/
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var rng = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) || require("./core.js").mulberry32;

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
  // the records in the 1 m/s bin starting at lo (the bins of gaps(): the last one, 19-20 m/s, includes 20): count, mean
  // power and mean gap below the maker's curve (M9's chart text versions)
  function recBin(T, recs, lo) {
    var last = T.range[1] - T.range[0] - 1, n = 0, sp = 0, sg = 0;
    recs.forEach(function (r) { if (Math.min(last, Math.floor(r[0] - T.range[0])) === lo - T.range[0]) { n++; sp += r[1]; sg += maker(T, r[0]) - r[1]; } });
    return { n: n, mean: n ? sp / n : null, gap: n ? sg / n : null };
  }

  var model = { rng: rng, maker: maker, field: field, slope: slope, scatter: scatter, weibull: weibull, records: records, reduceShare: reduceShare,
                chol: chol, fwd: fwd, bwd: bwd, solve: solve, basis: basis, kern: kern, fit: fit, predict: predict, covariance: covariance, search: search,
                erf: erf, Phi: Phi, phi: phi, invPhi: invPhi, pinball: pinball, scores: scores, LEVELS: LEVELS, RANGES: RANGES, ZL: ZL, TAU: TAU,
                campaign: campaign, heldOut: heldOut, stored: stored, fitStored: fitStored, curve: curve, widest: widest, gaps: gaps, recBin: recBin };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window !== "undefined" && window.LX) window.LX.M9 = model;
})();
