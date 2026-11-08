// m07-monte-carlo.js — Modeler lesson M7, "What could happen? Scenarios, Monte Carlo and global sensitivity" (model-lab
// in the step-card form, simulation mode).
//
// The toy (illustrative; CF7's waiting load, assets/learn/data/cf7-cost-of-waiting.json `idea`): a 100 MW load, such as a
// factory or a data center, waits tau months for its grid connection. Other customers pay the utility's costs (no
// large-load tariff) and there is no bridge power, so two accounts remain (CF7's formulas):
//   i = (1 + r)^(1/12) - 1,   A(tau) = (1 - (1 + i)^-tau) / i
//   developer         D = (m x P + K x i) x A(tau)                        lost margin and the carrying cost of idle capital
//   other customers   R = U x i x A(tau) + min(cap, h x tau) x U x (1 + i)^-tau   carrying cost of the upgrades, and their
//                                                                          expected stranding at the end of the wait
// with m the margin per MW a month, P = 100 MW, K the idle capital, r the yearly discount rate, U the upgrade cost and h
// the chance that the load never arrives, in percentage points added per month of waiting (simple, not compounded:
// h tau, at most 50%). Each run discounts at its own r. The developer's cost depends on m, K and r only.
//
// Uncertainty (data/m07-monte-carlo.json): the wait is a scenario (12, 24 or 36 months; this lesson gives it no
// probabilities, a modelling choice); the five inputs are uniform on invented ranges around CF7's values (base = the
// midpoint = CF7's value), drawn independently.
//
// Methods (every number the page states comes from these functions; _tests/learn/test_m07-monte-carlo.js checks them):
//   generator   mulberry32 (a 32-bit generator; seed shown on the page): the same seed gives the same runs, here and in
//               the lab notebook, which ports it. K5's drill generator (an LCG) is not used for studies: its first draws
//               from nearby seeds are nearly equal, so repeats with seeds 1..20 would not be independent.
//   Latin hypercube  for each input in order (margin, capital, rate, upgrade, strand): a Fisher-Yates permutation p of
//               0..N-1 (for a = N-1 down to 1: b = floor(u x (a + 1)), swap p[a], p[b]), then u_a = (p[a] + u) / N for
//               a = 0..N-1; value = lo + u_a (hi - lo). Exactly one draw in each of N equal slices of every range.
//   plain random  for each run a, for each input in order: u = the next draw.
//   percentiles  linear interpolation at rank (N - 1) p of the sorted results (K5's rule, "type 7")
//   share above a budget  count(result > budget) / N
//   Spearman's rank correlation  the Pearson correlation of the ranks (ties get their average rank)
//   Monte Carlo error  the same study repeated with seeds 1..20 (seed 7 is the page's run); the standard error of one
//               run's estimate is the standard deviation (n - 1) of the 20 estimates; the page shows +/- 2 standard
//               errors. With 20 repeats this error is itself rough (about +/- 16%).
//   corners     every one of the 2^5 combinations of range ends; the lowest and highest result. An exact corner has
//               zero probability under continuous inputs, so rarity is read from a stated neighbourhood: "near a corner"
//               = the three inputs of the developer's cost (m, K, r) all in the outer tenth of their ranges at the same
//               end, a chance of 0.1^3 per corner under independent uniform inputs (also per run of a Latin hypercube)
// Probabilities are shares of runs: statements about the model under its assumed inputs, not about the world.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  // the seeded generator: mulberry32, shared with engine E1 (LX.mulberry32, components/core.js)
  var rng = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) || require("./components/core.js").mulberry32;
  function monthly(r) { return Math.pow(1 + r, 1 / 12) - 1; }
  function annuity(i, tau) { return tau > 0 ? (1 - Math.pow(1 + i, -tau)) / i : 0; }
  // the two accounts (present values, $) for inputs x at a wait of tau months
  function outputs(T, x, tau) {
    var i = monthly(x.rate), A = annuity(i, tau), disc = Math.pow(1 + i, -tau);
    return { dev: (x.margin * T.loadMW + x.capital * i) * A,
             rate: x.upgrade * i * A + Math.min(T.strandCap, x.strand * tau) * x.upgrade * disc };
  }
  var OUTS = ["dev", "rate"];
  // the five inputs, optionally with the margin's range narrowed to base +/- half (step 10)
  function inputsOf(D, marginHalf) {
    return D.inputs.map(function (q) {
      var c = {}; for (var k in q) c[k] = q[k];
      if (q.key === "margin" && marginHalf != null) { c.lo = q.base - marginHalf; c.hi = q.base + marginHalf; }
      return c;
    });
  }
  function baseX(D) { var x = {}; D.inputs.forEach(function (q) { x[q.key] = q.base; }); return x; }
  // unit draws U[j][a] in [0, 1) for input j and run a
  // (a Latin hypercube also returns its permutations: run a's draw of input j lies in slice P[j][a], so the ranks of an
  // input across the runs are P[j][a] + 1 exactly, with no sort)
  function units(n, k, seed, method) {
    var r = rng(seed), U = [], P = [], j, a;
    if (method === "random") {
      for (j = 0; j < k; j++) U.push(new Array(n));
      for (a = 0; a < n; a++) for (j = 0; j < k; j++) U[j][a] = r();
      U.perm = null;
      return U;
    }
    for (j = 0; j < k; j++) {
      var p = new Array(n), u = new Array(n);
      for (a = 0; a < n; a++) p[a] = a;
      for (a = n - 1; a > 0; a--) { var b = Math.floor(r() * (a + 1)), t = p[a]; p[a] = p[b]; p[b] = t; }
      for (a = 0; a < n; a++) u[a] = (p[a] + r()) / n;
      U.push(u); P.push(p);
    }
    U.perm = P;
    return U;
  }
  // one Monte Carlo study: o = {n, seed, tau, method ("lhs" | "random"), ins (inputsOf)}
  function study(D, o) {
    var ins = o.ins || D.inputs, n = o.n || D.runs, tau = o.tau == null ? D.wait : o.tau, method = o.method || "lhs";
    var U = units(n, ins.length, o.seed, method), X = {}, dev = new Array(n), rate = new Array(n), x = {};
    ins.forEach(function (q, j) { X[q.key] = U[j].map(function (u) { return q.lo + u * (q.hi - q.lo); }); });
    for (var a = 0; a < n; a++) {
      ins.forEach(function (q) { x[q.key] = X[q.key][a]; });
      var y = outputs(D.toy, x, tau); dev[a] = y.dev; rate[a] = y.rate;
    }
    var R = U.perm ? U.perm.map(function (p) { return p.map(function (v) { return v + 1; }); }) : null;
    return { n: n, seed: o.seed, tau: tau, method: method, ins: ins, U: U, X: X, R: R, dev: dev, rate: rate };
  }
  function sorted(v) { return v.slice().sort(function (a, b) { return a - b; }); }
  function quantile(s, p) { var h = (s.length - 1) * p, lo = Math.floor(h); return lo + 1 < s.length ? s[lo] + (s[lo + 1] - s[lo]) * (h - lo) : s[lo]; }
  function mean(v) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s / v.length; }
  function sd(v) { var m = mean(v), s = 0; for (var i = 0; i < v.length; i++) s += (v[i] - m) * (v[i] - m); return Math.sqrt(s / (v.length - 1)); }
  function ranks(v) {
    var idx = v.map(function (x, i) { return i; }).sort(function (a, b) { return v[a] - v[b]; }), r = new Array(v.length), i = 0;
    while (i < idx.length) {
      var j = i; while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
      for (var k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  }
  function pearson(a, b) {
    var n = a.length, ma = mean(a), mb = mean(b), sab = 0, saa = 0, sbb = 0;
    for (var i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) * (a[i] - ma); sbb += (b[i] - mb) * (b[i] - mb); }
    return sab / Math.sqrt(saa * sbb);
  }
  function spearman(a, b) { return pearson(ranks(a), ranks(b)); }
  function countAbove(v, t) { var c = 0; for (var i = 0; i < v.length; i++) if (v[i] > t) c++; return c; }
  function summary(v) { var s = sorted(v); return { p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), mean: mean(v), min: s[0], max: s[s.length - 1] }; }
  // Spearman's rho of each input with an output of a study
  // (a Latin hypercube's input ranks come from its slices; the output is ranked once)
  function rhos(st, out) {
    var r = {}, ro = ranks(st[out]);
    st.ins.forEach(function (q, j) { r[q.key] = pearson(st.R ? st.R[j] : ranks(st.X[q.key]), ro); });
    return r;
  }
  // inputs ordered by |rho|, largest first (stable)
  function order(rh, ins) { return ins.map(function (q, i) { return { key: q.key, rho: rh[q.key], i: i }; }).sort(function (a, b) { return Math.abs(b.rho) - Math.abs(a.rho) || a.i - b.i; }); }
  // the tie rule, stated in advance: inputs are ranked by |rho|; the next input joins the same rank when its gap to the
  // input before it is within two standard errors of that gap (the 20 repeats); every group is a rank ("1", "2-3", ...)
  function rankGroups(rh, reps, out, ins) {
    var ord = order(rh, ins), groups = [[ord[0]]];
    for (var i = 1; i < ord.length; i++) {
      var a = ord[i - 1].key, b = ord[i].key;
      var gap = Math.abs(rh[a]) - Math.abs(rh[b]), e = se(reps, function (r) { return Math.abs(r.rho[out][a]) - Math.abs(r.rho[out][b]); });
      ord[i].gap = gap; ord[i].gapSE = e;
      if (gap <= 2 * e) groups[groups.length - 1].push(ord[i]); else groups.push([ord[i]]);
    }
    var pos = 1;
    groups.forEach(function (g) { var lab = g.length > 1 ? pos + "–" + (pos + g.length - 1) : String(pos); g.forEach(function (r) { r.rank = lab; r.tied = g.length > 1; }); pos += g.length; });
    return { order: ord, groups: groups };
  }
  // one at a time: each input at its low and its high end, the others at base
  function tornado(D, tau, out) {
    var b = baseX(D), base = outputs(D.toy, b, tau)[out];
    return { base: base, rows: D.inputs.map(function (q) {
      var lo = Object.assign({}, b), hi = Object.assign({}, b); lo[q.key] = q.lo; hi[q.key] = q.hi;
      return { key: q.key, label: q.label, atLo: outputs(D.toy, lo, tau)[out], atHi: outputs(D.toy, hi, tau)[out] };
    }) };
  }
  // the corners of the five ranges: the lowest and highest result over all 2^k combinations of range ends
  function corners(D, tau, out) {
    var k = D.inputs.length, lo = Infinity, hi = -Infinity, loX = null, hiX = null;
    for (var c = 0; c < (1 << k); c++) {
      var x = {}; D.inputs.forEach(function (q, j) { x[q.key] = (c >> j) & 1 ? q.hi : q.lo; });
      var y = outputs(D.toy, x, tau)[out];
      if (y < lo) { lo = y; loX = x; } if (y > hi) { hi = y; hiX = x; }
    }
    return { lo: lo, hi: hi, loX: loX, hiX: hiX };
  }
  // the inputs each account depends on (the toy's equations); an input outside an account leaves it flat
  var ENTERS = { dev: ["margin", "capital", "rate"], rate: ["rate", "upgrade", "strand"] };
  // runs near a corner of an account: every input it depends on in the outer share f of its range, all at the low or all
  // at the high end (the developer's cost rises with each of its three inputs, so these are its low- and high-cost
  // corners); the chance of each, under independent uniform inputs, is f^k
  function nearCorner(st, out, f) {
    var ks = ENTERS[out], byK = {}, lo = 0, hi = 0;
    st.ins.forEach(function (q) { byK[q.key] = q; });
    for (var a = 0; a < st.n; a++) {
      var u = ks.map(function (k) { var q = byK[k]; return (st.X[k][a] - q.lo) / (q.hi - q.lo); });
      if (u.every(function (v) { return v >= 1 - f; })) hi++;
      if (u.every(function (v) { return v < f; })) lo++;
    }
    var p = Math.pow(f, ks.length);
    return { lo: lo, hi: hi, n: lo + hi, share: f, chance: p, expect: Math.round(2 * p * st.n * 1e6) / 1e6, inputs: ks.length };
  }
  // the cloud of runs of one input against one account (step 9's scatter, for its text version): the runs in k equal
  // slices of the input's range with their P10, median and P90; the trend is "flat" when the input does not enter the
  // account, "weak" when the medians move by less than a quarter of the typical P10-P90 width within a slice
  function cloud(st, key, out, k) {
    k = k || 10;
    var q = st.ins.filter(function (z) { return z.key === key; })[0], S = [], a, j;
    for (j = 0; j < k; j++) S.push([]);
    for (a = 0; a < st.n; a++) S[Math.min(k - 1, Math.floor((st.X[key][a] - q.lo) / (q.hi - q.lo) * k))].push(st[out][a]);
    var slices = S.map(function (v, b) { var s = sorted(v); return { lo: q.lo + b * (q.hi - q.lo) / k, hi: q.lo + (b + 1) * (q.hi - q.lo) / k, n: v.length, p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9) }; });
    var width = mean(slices.map(function (x) { return x.p90 - x.p10; })), change = slices[k - 1].p50 - slices[0].p50, enters = ENTERS[out].indexOf(key) >= 0;
    var meds = slices.map(function (x) { return x.p50; });
    return { slices: slices, enters: enters, change: change, width: width, medLo: Math.min.apply(null, meds), medHi: Math.max.apply(null, meds),
             trend: !enters ? "flat" : Math.abs(change) < width / 4 ? "weak" : change > 0 ? "rises" : "falls" };
  }
  // every run of a study as CSV: the five inputs and both accounts (step 9's download)
  function csvRuns(st) {
    var L = ["run,margin_usd_per_mw_month,capital_usd,discount_rate_per_year,upgrades_usd,never_arrives_points_per_month,developer_cost_usd,other_customers_cost_usd"];
    for (var a = 0; a < st.n; a++) L.push([a + 1, st.X.margin[a].toFixed(2), st.X.capital[a].toFixed(0), st.X.rate[a].toFixed(6), st.X.upgrade[a].toFixed(0), (100 * st.X.strand[a]).toFixed(6), st.dev[a].toFixed(0), st.rate[a].toFixed(0)].join(","));
    return L.join("\n") + "\n";
  }
  // empty slices: how many of the n equal slices of input j hold no draw
  function empty(U, j, n) { var seen = {}; U[j].forEach(function (u) { seen[Math.floor(u * n)] = 1; }); return n - Object.keys(seen).length; }
  function seeds(D) { var s = []; for (var k = D.repeats.first; k <= D.repeats.last; k++) s.push(k); return s; }
  // the 20 repeats of a study (seeds 1..20) and what each estimates: P10, P50, P90, mean, rho of every input with both
  // outputs, and the sorted results (for shares above any budget)
  function repeats(D, o) {
    return seeds(D).map(function (s) {
      var st = study(D, { n: o.n, seed: s, tau: o.tau, method: o.method, ins: o.ins }), ds = sorted(st.dev);
      return { seed: s, p10: quantile(ds, 0.1), p50: quantile(ds, 0.5), p90: quantile(ds, 0.9), mean: mean(st.dev), rho: { dev: rhos(st, "dev"), rate: rhos(st, "rate") }, devSorted: ds };
    });
  }
  // share above t of a sorted array (binary search; strictly above)
  function shareSorted(s, t) { var lo = 0, hi = s.length; while (lo < hi) { var m = (lo + hi) >> 1; if (s[m] > t) hi = m; else lo = m + 1; } return (s.length - lo) / s.length; }
  // the standard error of one run's estimate: the standard deviation of the repeats' estimates
  function se(reps, f) { return sd(reps.map(f)); }
  // a histogram of v in bins of width w from lo (bins [lo + k w, lo + (k + 1) w))
  function hist(v, w, lo, hi) {
    var k = Math.round((hi - lo) / w), bins = [];
    for (var b = 0; b < k; b++) bins.push({ lo: lo + b * w, hi: lo + (b + 1) * w, n: 0 });
    v.forEach(function (y) { var b = Math.floor((y - lo) / w); if (b >= 0 && b < k) bins[b].n++; });
    return bins;
  }

  // ---------------------------------------------------------------- formats (shared by the page and the test)
  var MINUS = "−";
  function musd(v) { return (v < 0 ? MINUS : "") + "$" + (Math.round(Math.abs(v) / 1e5) / 10).toFixed(1) + "M"; }
  function pm(v) { return "± " + musd(v); }                             // "± $1.3M"
  function shr(f, d) { return (100 * f).toFixed(d == null ? 1 : d) + "%"; }
  function pts(f) { return (100 * f).toFixed(1) + " points"; }
  function r2(v) { var s = (Math.round(v * 100) / 100).toFixed(2); if (s === "-0.00") s = "0.00"; return s.replace("-", MINUS); }
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  // an input's value as the page writes it
  function val(q, v) {
    if (q.key === "margin") return "$" + int(v);
    if (q.key === "capital" || q.key === "upgrade") return "$" + int(v / 1e6) + "M";
    if (q.key === "rate") return (100 * v).toFixed(v * 100 % 1 ? 1 : 0) + "%";
    return (100 * v).toFixed(2) + " points";          // the never-arrives chance: percentage points added a month
  }
  // "Near a corner (...): 2 runs; a chance of 0.1³ per corner predicts 2" (the outer share is a tenth: data, near)
  function cube(n) { return { 2: "²", 3: "³" }[n] || "^" + n; }
  function nearText(N) {
    return "Near a corner (margin, capital and discount rate all in the same outer tenth of their ranges): " + int(N.n) + (N.n === 1 ? " run" : " runs") + "; a chance of " + N.share + cube(N.inputs) + " per corner predicts " + int(N.expect);
  }
  function range(q) { return q.key === "strand" ? (100 * q.lo).toFixed(2) + " to " + val(q, q.hi) : val(q, q.lo) + " to " + val(q, q.hi); }

  // ---------------------------------------------------------------- every number the page states, in one place
  function facts(D) {
    var T = D.wait, b = baseX(D), F = { wait: T, seed: D.seed, runs: D.runs };
    F.base = {}; D.waits.forEach(function (t) { F.base[t] = outputs(D.toy, b, t); });
    F.tornado = { dev: tornado(D, T, "dev"), rate: tornado(D, T, "rate") };
    F.corners = { dev: corners(D, T, "dev"), rate: corners(D, T, "rate") };
    var main = study(D, { seed: D.seed, tau: T });
    F.main = { dev: summary(main.dev), rate: summary(main.rate), rho: { dev: rhos(main, "dev"), rate: rhos(main, "rate") } };
    F.main.beyond = countAbove(main.dev, F.corners.dev.hi) + main.dev.filter(function (y) { return y < F.corners.dev.lo; }).length;
    F.near = nearCorner(main, "dev", D.near);
    var pv = { lhs: study(D, { n: D.preview, seed: D.seed, tau: T }), random: study(D, { n: D.preview, seed: D.seed, tau: T, method: "random" }) };
    F.preview = {}; Object.keys(pv).forEach(function (m) { F.preview[m] = { margin: empty(pv[m].U, 0, D.preview), rate: empty(pv[m].U, 2, D.preview) }; });
    var B = D.budget.start * 1e6;
    F.budget = { at: B, wait: {} };
    D.waits.forEach(function (t) {
      var st = t === T ? main : study(D, { seed: D.seed, tau: t }), reps = repeats(D, { n: D.runs, tau: t });
      F.budget.wait[t] = { n: countAbove(st.dev, B), share: countAbove(st.dev, B) / D.runs, se: se(reps, function (r) { return shareSorted(r.devSorted, B); }) };
    });
    var R = {};
    D.repeats.sizes.forEach(function (n) { R[n] = { lhs: repeats(D, { n: n, tau: T }), random: repeats(D, { n: n, tau: T, method: "random" }) }; });
    var N = D.runs, big = R[N].lhs;
    F.err = {
      p90: {}, mean: {}, share: {},
      rho: { dev: {}, rate: {} }
    };
    D.repeats.sizes.forEach(function (n) {
      ["lhs", "random"].forEach(function (m) {
        F.err.p90[n + m] = { se: se(R[n][m], function (r) { return r.p90; }), lo: Math.min.apply(null, R[n][m].map(function (r) { return r.p90; })), hi: Math.max.apply(null, R[n][m].map(function (r) { return r.p90; })) };
        F.err.mean[n + m] = se(R[n][m], function (r) { return r.mean; });
        F.err.share[n + m] = se(R[n][m], function (r) { return shareSorted(r.devSorted, B); });
      });
    });
    OUTS.forEach(function (o) { D.inputs.forEach(function (q) { F.err.rho[o][q.key] = se(big, function (r) { return r.rho[o][q.key]; }); }); });
    F.err.iidShare = Math.sqrt(F.budget.wait[T].share * (1 - F.budget.wait[T].share) / N);
    F.err.seedRow = big.filter(function (r) { return r.seed === D.seed; })[0];
    F.groups = { dev: rankGroups(F.main.rho.dev, big, "dev", D.inputs), rate: rankGroups(F.main.rho.rate, big, "rate", D.inputs) };
    // step 10: the margin's range narrowed (see narrowing)
    F.narrow = narrowing(D);
    return F;
  }
  // step 10 at one half-width of the slider: rho of each input, its error and the ranks by the tie rule, with the margin's range at base +/- half
  function narrowAt(D, half) {
    var ins = inputsOf(D, half), st = study(D, { seed: D.seed, ins: ins }), rh = rhos(st, "dev");
    var reps = repeats(D, { n: D.runs, ins: ins }), G = rankGroups(rh, reps, "dev", ins);
    var e = {}; ins.forEach(function (q) { e[q.key] = se(reps, function (r) { return r.rho.dev[q.key]; }); });
    var best = G.order.filter(function (r) { return r.key !== "margin"; })[0];
    var mrank = G.order.filter(function (r) { return r.key === "margin"; })[0].rank;
    return { half: half, rho: rh, se: e, order: G.order, groups: G.groups, top: G.order[0].key, best: best.key, marginRank: mrank };
  }
  // the widest half-width at which the margin is no longer alone in first place, and the widest at which, by the tie rule,
  // another input ranks clearly above it (step 10's goal)
  function narrowing(D) {
    var W = D.marginWidth, rows = [];
    for (var h = W.max; h >= W.min; h -= W.step) rows.push(narrowAt(D, h));
    var first = function (r) { return r.groups[0].length === 1 && r.groups[0][0].key === "margin"; };
    return { rows: rows, tie: rows.filter(function (r) { return !first(r); })[0] || null, flip: rows.filter(function (r) { return r.groups[0].every(function (x) { return x.key !== "margin"; }); })[0] || null };
  }

  // ---------------------------------------------------------------- the reference block (the test's --write; the lab asserts it)
  function reference(D) {
    var F = facts(D), main = study(D, { seed: D.seed });
    var cut = function (o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = typeof o[k] === "number" ? +o[k].toPrecision(12) : o[k]; }); return c; };
    return {
      about: "Reference results, computed from the seeded runs. Dollars are present values; shares are fractions of the runs.",
      firstRuns: [0, 1, 2].map(function (a) { var x = {}; D.inputs.forEach(function (q) { x[q.key] = +main.X[q.key][a].toPrecision(15); }); return x; }),
      base: D.waits.reduce(function (o, t) { o[t] = cut(F.base[t]); return o; }, {}),
      main: { dev: cut(F.main.dev), rate: cut(F.main.rate), rhoDev: cut(F.main.rho.dev), rhoRate: cut(F.main.rho.rate) },
      corners: { dev: [+F.corners.dev.lo.toPrecision(12), +F.corners.dev.hi.toPrecision(12)], rate: [+F.corners.rate.lo.toPrecision(12), +F.corners.rate.hi.toPrecision(12)] },
      preview: F.preview,
      budget: D.waits.reduce(function (o, t) { o[t] = { n: F.budget.wait[t].n, se: +F.budget.wait[t].se.toPrecision(6) }; return o; }, {}),
      p90se: { "100": +F.err.p90["100lhs"].se.toPrecision(6), "1000": +F.err.p90["1000lhs"].se.toPrecision(6), "1000random": +F.err.p90["1000random"].se.toPrecision(6) },
      meanse: { lhs: +F.err.mean["1000lhs"].toPrecision(6), random: +F.err.mean["1000random"].toPrecision(6) },
      flip: F.narrow.flip ? { half: F.narrow.flip.half, top: F.narrow.flip.top, rho: cut(F.narrow.flip.rho) } : null,
      near: { share: D.near, lo: F.near.lo, hi: F.near.hi }
    };
  }

  // ---------------------------------------------------------------- the no-JS version (the test's --write puts it in the page)
  function staticHist(D, F, st) {
    var lo = 100e6, hi = 250e6, w = D.binWidth, bins = hist(st.dev, w, lo, hi), top = 0;
    bins.forEach(function (b) { if (b.n > top) top = b.n; });
    var ymax = Math.ceil(top / 25) * 25, X0 = 48, X1 = 428, Y0 = 218, Y1 = 22;
    var x = function (v) { return (X0 + (v - lo) / (hi - lo) * (X1 - X0)).toFixed(1); }, y = function (n) { return (Y0 - n / ymax * (Y0 - Y1)).toFixed(1); };
    var s = '<svg viewBox="0 0 440 258" role="img" aria-labelledby="m7-static-title">\n<title id="m7-static-title">Histogram of the developer\'s cost in 1,000 Latin hypercube runs (seed ' + D.seed + '), a ' + D.wait + '-month wait, in $5M bins: median ' + musd(F.main.dev.p50) + ', 80% of runs from ' + musd(F.main.dev.p10) + ' to ' + musd(F.main.dev.p90) + '.</title>\n<g>';
    for (var g = 0; g <= ymax; g += ymax / 5) s += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + y(g) + '" y2="' + y(g) + '" class="m7-fb-grid"/><text x="42" y="' + (+y(g) + 4).toFixed(1) + '" text-anchor="end" class="m7-fb-tick">' + g + '</text>';
    for (var t = lo; t <= hi; t += 50e6) s += '<text x="' + x(t) + '" y="234" text-anchor="' + (t === lo ? "start" : t === hi ? "end" : "middle") + '" class="m7-fb-tick">$' + t / 1e6 + 'M</text>';
    s += '<text x="238.0" y="252" text-anchor="middle" class="m7-fb-tick">developer\'s cost, present value</text><text x="42" y="10" text-anchor="end" class="m7-fb-tick">runs</text></g>\n<g>';
    s += '<rect x="' + x(F.main.dev.p10) + '" y="' + Y1 + '" width="' + (x(F.main.dev.p90) - x(F.main.dev.p10)).toFixed(1) + '" height="' + (Y0 - Y1) + '" class="m7-fb-band"/>';
    bins.forEach(function (b) { if (b.n) s += '<rect x="' + (+x(b.lo) + 0.5).toFixed(1) + '" y="' + y(b.n) + '" width="' + (x(b.hi) - x(b.lo) - 1).toFixed(1) + '" height="' + (Y0 - y(b.n)).toFixed(1) + '" class="m7-fb-bar"/>'; });
    s += '<line x1="' + x(F.main.dev.p50) + '" x2="' + x(F.main.dev.p50) + '" y1="' + Y1 + '" y2="' + Y0 + '" class="m7-fb-mid"/><text x="' + (+x(F.main.dev.p50) + 5).toFixed(1) + '" y="30" class="m7-fb-tick">median ' + musd(F.main.dev.p50) + '</text>';
    return { svg: s + '</g>\n</svg>', bins: bins };
  }
  function staticFallback(D) {
    var F = facts(D), main = study(D, { seed: D.seed }), H = staticHist(D, F, main), T = D.wait, tor = F.tornado.dev, c = F.corners.dev, e = F.err;
    var G = F.groups, fl = F.narrow.flip, name = function (k) { return D.inputs.filter(function (q) { return q.key === k; })[0].short.toLowerCase(); };
    var grp = function (g) { return g.map(function (r) { return name(r.key) + " " + r2(r.rho); }).join(" and ") + (g.length > 1 ? " (tied, rank " + g[0].rank + ")" : " (rank " + g[0].rank + ")"); };
    var swing = tor.rows.slice().sort(function (a, b) { return Math.abs(b.atHi - b.atLo) - Math.abs(a.atHi - a.atLo); });
    var bw = F.budget.wait, Bs = "$" + D.budget.start + "M";
    var li = [
      "One number: at the base inputs, a " + T + "-month wait costs the developer " + musd(F.base[T].dev) + " in present value, and other customers " + musd(F.base[T].rate) + ".",
      "Scenarios, with no chance attached: the developer's cost is " + D.waits.map(function (t) { return musd(F.base[t].dev); }).join(", ").replace(/, ([^,]*)$/, " and $1") + " for waits of " + D.waits.join(", ").replace(/, ([^,]*)$/, " and $1") + " months.",
      "One at a time: the margin swings the developer's cost most, from " + musd(swing[0].atLo) + " to " + musd(swing[0].atHi) + "; capital and the discount rate swing it by " + musd(Math.abs(swing[1].atHi - swing[1].atLo)) + " and " + musd(Math.abs(swing[2].atHi - swing[2].atLo)) + ".",
      "Stacked corners: every input at its low-cost end gives " + musd(c.lo) + "; at its high-cost end, " + musd(c.hi) + ".",
      "Sampling 10 runs with seed " + D.seed + ": plain random leaves " + F.preview.random.margin + " of 10 margin slices and " + F.preview.random.rate + " of 10 discount-rate slices empty; a Latin hypercube leaves none.",
      "1,000 Latin hypercube runs: median " + musd(F.main.dev.p50) + "; 80% of runs from " + musd(F.main.dev.p10) + " to " + musd(F.main.dev.p90) + "; the runs span " + musd(F.main.dev.min) + " to " + musd(F.main.dev.max) + ".",
      nearText(F.near) + ".",
      "Monte Carlo error over 20 seeds: P90 " + musd(F.main.dev.p90) + " " + pm(2 * e.p90["1000lhs"].se) + " (two standard errors) with 1,000 runs, " + pm(2 * e.p90["100lhs"].se) + " with 100.",
      "A chance under these inputs: above " + Bs + ", " + shr(bw[12].share) + " of runs at 12 months, " + shr(bw[24].share) + " at 24 and " + shr(bw[36].share) + " at 36.",
      "Spearman's rank correlation with the developer's cost: " + G.dev.groups.slice(0, 2).map(grp).join("; then ") + "; with other customers' cost: " + G.rate.groups.slice(0, 2).map(grp).join("; then ") + ".",
      fl ? "Narrow the margin's range to ± $" + int(fl.half) + ": " + grp(fl.groups[0]) + ", and the margin (" + r2(fl.rho.margin) + ") ranks " + fl.marginRank + "." : "Narrowing the margin's range does not change the top input."
    ];
    var rows = [["Runs", "1,000 (Latin hypercube, seed " + D.seed + ")"], ["Median", musd(F.main.dev.p50)], ["P10 and P90", musd(F.main.dev.p10) + " and " + musd(F.main.dev.p90)],
                ["P90, Monte Carlo error", pm(2 * e.p90["1000lhs"].se) + " (2 standard errors, 20 seeds)"], ["Share above " + Bs + ", " + T + " months", shr(bw[T].share) + " ± " + pts(2 * bw[T].se) + " (2 standard errors)"],
                ["Corners", musd(c.lo) + " and " + musd(c.hi)]];
    return '<p class="lx-eyebrow">The developer\'s cost of a ' + T + '-month wait, 1,000 runs (illustrative)</p>\n<div class="m7-fbfig">\n' + H.svg + '\n</div>\n<ol>\n' +
      li.map(function (t) { return "<li>" + t + "</li>"; }).join("\n") + "\n</ol>\n" +
      '<p class="lx-eyebrow">The summaries on this page</p>\n<div class="lx-scroll-x"><table class="lx-facts m7-fbtab">\n<thead><tr><th scope="col">Summary</th><th scope="col">Value</th></tr></thead>\n<tbody>\n' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="n">' + r[1] + '</td></tr>'; }).join("\n") + '\n</tbody></table></div>\n' +
      '<details class="lx-textalt"><summary>Text version of the histogram</summary>\n<div class="lx-scroll-x"><table class="lx-mini-table"><thead><tr><th scope="col">Cost, from</th><th scope="col">up to</th><th scope="col">Runs</th></tr></thead><tbody>\n' +
      H.bins.filter(function (b) { return b.n; }).map(function (b) { return "<tr><td>" + musd(b.lo) + "</td><td>" + musd(b.hi) + "</td><td>" + b.n + "</td></tr>"; }).join("\n") + "\n</tbody></table></div></details>\n" +
      '<p class="lx-hint">With JavaScript on, you run these studies yourself, step by step.</p>';
  }

  var model = { rng: rng, monthly: monthly, annuity: annuity, outputs: outputs, inputsOf: inputsOf, baseX: baseX, units: units, study: study,
                sorted: sorted, quantile: quantile, mean: mean, sd: sd, ranks: ranks, pearson: pearson, spearman: spearman, countAbove: countAbove,
                summary: summary, rhos: rhos, order: order, tornado: tornado, corners: corners, nearCorner: nearCorner, ENTERS: ENTERS, cloud: cloud, csvRuns: csvRuns, empty: empty, seeds: seeds, repeats: repeats,
                shareSorted: shareSorted, se: se, rankGroups: rankGroups, hist: hist, facts: facts, narrowAt: narrowAt, narrowing: narrowing, reference: reference,
                staticFallback: staticFallback, nearText: nearText, musd: musd, pm: pm, shr: shr, pts: pts, r2: r2, int: int, val: val, range: range, OUTS: OUTS };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, KEY = "m7-own";
  var COL = { dev: "var(--lx-accent)", rate: "var(--lx-tier-3)", mid: "var(--lx-ink)", corner: "var(--lx-bad)", tail: "var(--lx-warn)", empty: "var(--lx-warn)", line: "var(--lx-line)", dot: "var(--lx-accent)" };
  var INCOL = { margin: "var(--lx-accent)", capital: "var(--lx-tier-5)", rate: "var(--lx-tier-4)", upgrade: "var(--lx-tier-3)", strand: "var(--lx-warn)" };
  var ACC = { dev: "developer", rate: "other customers" }, ACCN = { dev: "The developer", rate: "Other customers" };
  var COST = { dev: "the developer's cost", rate: "other customers' cost" };   // the possessive, right for both accounts
  var NOUN = { margin: "the margin", capital: "the idle capital", rate: "the discount rate", upgrade: "the upgrades", strand: "the never-arrives chance" };

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
  function row(host) { return H("div", { class: "m7-row" }, host); }
  function readout(host) { return H("p", { class: "m7-out", "aria-live": "polite" }, host); }
  // an axis from 0 (or lo) to a round top in at most five steps of 1, 2, 5, 10, 20, 25, 50, ...
  function niceAxis(top, lo) {
    lo = lo || 0; var st = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    for (var i = 0; i < st.length; i++) { var a = Math.floor(lo / st[i]) * st[i], b = Math.max(a + st[i], Math.ceil(top / st[i]) * st[i]); if ((b - a) / st[i] <= 5) return { min: a, max: b, step: st[i] }; }
    return { min: 0, max: Math.ceil(top / 1000) * 1000, step: 1000 };
  }
  function money(v) { return musd(v); }
  // run a computation after the card has painted its busy state (api.busy keeps Next shut meanwhile)
  function soon(api, status, fn) {
    api.busy(true); status.textContent = "Running…";
    setTimeout(function () { try { fn(); } finally { api.busy(false); } }, 20);
  }

  // ---- the histogram (LX.Plot): bins of $5M, an optional band (P10-P90), a shaded tail and marks
  function histSpec(D, v, o) {
    o = o || {};
    var lo = o.lo, hi = o.hi, bins = hist(v, D.binWidth, lo, hi), top = 0;
    bins.forEach(function (b) { if (b.n > top) top = b.n; });
    var ya = niceAxis(Math.max(top, 10)), ticks = [];
    for (var t = lo; t <= hi + 1; t += 50e6) ticks.push([t / 1e6, "$" + t / 1e6 + "M", t === lo ? "start" : t >= hi ? "end" : "middle"]);
    var mw = function (x) { return x / 1e6; };
    return {
      x: { min: mw(lo), max: mw(hi), ticks: ticks, ticksN: ticks.filter(function (t, i) { return i % 2 === 0 || i === ticks.length - 1; }) },
      y: { min: 0, max: ya.max, step: ya.step, fmt: function (n) { return int(n); }, unit: "runs" },
      height: 230, heightN: 200,
      spans: (o.spans || []).map(function (sp) { return { x0: mw(sp.x0), x1: mw(sp.x1), color: sp.color, op: sp.op || 0.14, label: sp.label }; }),
      bars: bins.filter(function (b) { return b.n > 0; }).map(function (b) { return { x0: mw(b.lo) + 0.25, x1: mw(b.hi) - 0.25, y0: 0, y1: b.n, color: o.color || COL.dev, op: 0.78 }; }),
      marks: (o.marks || []).map(function (m) { return { x: mw(m.x), y: 0, vline: true, label: m.label, color: m.color || COL.mid }; }),
      legend: o.legend || [],
      tip: function (xv) { var b = bins.filter(function (bb) { return xv * 1e6 >= bb.lo && xv * 1e6 < bb.hi; })[0]; return b ? "<div><b>" + b.n + " runs</b> from " + musd(b.lo) + " up to " + musd(b.hi) + "</div>" : null; },
      tipStep: D.binWidth / 1e6,
      aria: o.aria || "Histogram of 1,000 runs.",
      text: { head: ["Cost, from", "up to", "Runs"], rows: bins.filter(function (b) { return b.n; }).map(function (b) { return [musd(b.lo), musd(b.hi), String(b.n)]; }), note: o.note || null }
    };
  }

  // ---- rank-correlation bars (lesson-local i-montecarlo piece): one row per input, rho from -1 to 1 with a +/- 2 SE
  // whisker and its rank by the tie rule; with onPick (step 9) each row is a button that picks the input for the scatter
  // below, without it (step 10) the rows are a plain list
  function RhoBars(host, o) {
    var w = H("div", { class: "m7-rho" }, host), rows = {}, sel = null, pickable = !!o.onPick;
    var head = H("div", { class: "m7-rho-axis", "aria-hidden": "true" }, w);
    H("span", null, head); var ax = H("span", { class: "m7-rho-ax" }, head);
    ["−1", "0", "+1"].forEach(function (t) { H("span", { text: t }, ax); });
    var list = H("div", { class: "m7-rho-list", role: pickable ? "group" : "list", "aria-label": o.aria || "Rank correlation of each input with the cost" }, w);
    o.inputs.forEach(function (q) {
      var b = pickable ? H("button", { type: "button", class: "m7-rho-row", "aria-pressed": "false", style: "--c:" + INCOL[q.key] }, list)
                       : H("div", { class: "m7-rho-row m7-rho-static", role: "listitem", style: "--c:" + INCOL[q.key] }, list);
      var hid = pickable ? {} : { "aria-hidden": "true" };   // a plain row is read from its sentence (sr), not its parts
      var lab = H("span", Object.assign({ class: "m7-rho-l" }, hid), b); H("i", null, lab); H("span", { text: q.short }, lab);
      var tr = H("span", { class: "m7-rho-t", "aria-hidden": "true" }, b), bar = H("span", { class: "m7-rho-b" }, tr), wh = H("span", { class: "m7-rho-w" }, tr);
      var v = H("span", Object.assign({ class: "m7-rho-v" }, hid), b), rk = H("span", Object.assign({ class: "m7-rho-k" }, hid), b);
      var sr = pickable ? null : H("span", { class: "lx-sr" }, b);
      if (pickable) b.addEventListener("click", function () { pick(q.key); o.onPick(q.key); });
      rows[q.key] = { b: b, bar: bar, wh: wh, v: v, rk: rk, sr: sr, q: q };
    });
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the bars" }, alt);
    var altBody = H("div", null, alt);
    function pick(k) { if (!pickable) return; sel = k; Object.keys(rows).forEach(function (j) { rows[j].b.setAttribute("aria-pressed", j === k ? "true" : "false"); }); }
    var x = function (r) { return (r + 1) / 2 * 100; };
    return {
      el: w, pick: pick,
      // data: {rho: {key: value}, se: {key: value}, ranks: {key: "1" | "2–3"}}
      set: function (d) {
        var lines = [];
        o.inputs.forEach(function (q) {
          var R = rows[q.key], r = d.rho[q.key], e = 2 * d.se[q.key];
          R.bar.style.left = Math.min(x(0), x(r)) + "%"; R.bar.style.width = Math.abs(x(r) - x(0)) + "%";
          R.wh.style.left = x(Math.max(-1, r - e)) + "%"; R.wh.style.width = (x(Math.min(1, r + e)) - x(Math.max(-1, r - e))) + "%";
          R.v.textContent = "ρ " + r2(r); R.rk.textContent = "rank " + d.ranks[q.key];
          var said = q.short + ": rho " + r2(r) + ", plus or minus " + r2(e) + ", rank " + d.ranks[q.key].replace("–", " to ") + ".";
          if (pickable) R.b.setAttribute("aria-label", said + " Show its cloud of runs."); else R.sr.textContent = said;
          lines.push(q.label + ": ρ = " + r2(r) + " ± " + r2(e) + " (2 standard errors), rank " + d.ranks[q.key] + ".");
        });
        altBody.innerHTML = ""; var ul = H("ul", null, altBody); lines.forEach(function (t) { H("li", { text: t }, ul); });
      }
    };
  }
  function ranksOf(G) { var r = {}; G.order.forEach(function (x) { r[x.key] = x.rank; }); return r; }
  function seOf(reps, out, ins) { var e = {}; ins.forEach(function (q) { e[q.key] = se(reps, function (r) { return r.rho[out][q.key]; }); }); return e; }

  LX.mount("m07", function (live, data, root) {
    var D = data.m07_monte_carlo, T = D.wait, B0 = baseX(D), own = LX.store.get(KEY, {}) || {};
    function keep(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var cache = {};
    function get(k, f) { if (!(k in cache)) cache[k] = f(); return cache[k]; }
    var lab = {
      main: function (tau) { return get("main" + tau, function () { return study(D, { seed: D.seed, tau: tau }); }); },
      reps: function (n, tau, method) { return get(["reps", n, tau, method || "lhs"].join(), function () { return repeats(D, { n: n, tau: tau, method: method }); }); },
      narrow: function (half) { return get("nar" + half, function () { return narrowAt(D, half); }); }
    };
    var base = {}; D.waits.forEach(function (t) { base[t] = outputs(D.toy, B0, t); });
    var tor = tornado(D, T, "dev"), cor = corners(D, T, "dev"), byKey = function (k) { return D.inputs.filter(function (q) { return q.key === k; })[0]; }, short = function (k) { return byKey(k).short; };
    var steps = [], S10 = null;

    // ---- 1 one number, five guesses
    steps.push({
      text: "A 100 [[megawatt|MW]] load, a factory or a data center, waits " + T + " months for the grid (CF7's toy). At CF7's values the wait costs its [[developer|developer]] " + money(base[T].dev) + " in [[present-value|present value]]; each input is a guess.",
      build: function (act, api) {
        var sc = H("div", { class: "lx-scroll-x" }, act), tb = H("table", { class: "lx-mini-table m7-ins" }, sc), hr = H("tr", null, H("thead", null, tb));
        ["Input", "CF7's value", "Range here"].forEach(function (h) { H("th", { scope: "col", text: h }, hr); });
        var bd = H("tbody", null, tb);
        // each input with its unit and a one-line definition (data: why, with glossary marks)
        D.inputs.forEach(function (q) {
          var tr = H("tr", null, bd), c = H("td", null, tr);
          H("span", { class: "m7-in-l", text: q.label + " (" + q.unit + ")" }, c); H("span", { class: "m7-in-d", html: LX.rich(q.why) }, c);
          H("td", { text: val(q, q.base) }, tr); H("td", { text: range(q) }, tr);
        });
        LX.Predict(act, { id: "m7-p90", q: "Let all five vary within their ranges. 9 runs in 10 will cost less than…", answer: "200", fresh: true,
          options: D.guess.map(function (g) { return { value: g.value, label: g.label }; }),
          lockText: "Locked in. Step 6 runs the model 1,000 times and checks your guess.",
          onPick: function (v) { keep("guess", v); api.done(); } });
      }
    });

    // ---- 2 scenarios: the wait, with no chance attached
    steps.push({
      text: "This lesson gives the wait no probabilities: treat " + D.waits.join(", ").replace(/, ([^,]*)$/, " and $1") + " months as separate what-if [[scenario|scenarios]]. Compare them, every input at CF7's value.",
      build: function (act, api) {
        var seen = {}, top = base[D.waits[D.waits.length - 1]].dev;
        seg(row(act), D.waits.map(function (t) { return t + " months"; }), -1, function (i) { show(D.waits[i]); }, "Wait scenario");
        var bars = H("div", { class: "m7-scen" }, act), out = readout(act);
        var rowsEl = D.waits.map(function (t) {
          var r = H("div", { class: "m7-scen-r" }, bars); H("span", { class: "m7-scen-t", text: t + " months" }, r);
          var cells = ["dev", "rate"].map(function (k) { var c = H("span", { class: "m7-scen-c" }, r); var tr = H("span", { class: "m7-scen-tr", "aria-hidden": "true" }, c); var b = H("span", { class: "m7-scen-b", style: "--c:" + COL[k] }, tr); var v = H("span", { class: "m7-scen-v", text: "?" }, c); return { b: b, v: v, k: k }; });
          return { t: t, cells: cells, el: r };
        });
        H("p", { class: "lx-hint", html: '<span class="m7-key" style="--c:' + COL.dev + '"></span> The developer <span class="m7-key" style="--c:' + COL.rate + '"></span> Other customers: the utility\'s ' + LX.rich("[[carrying-cost|carrying cost]] of the upgrades, and the expected [[stranded-cost|stranded cost]] if the load never arrives") }, act);
        function show(t) {
          seen[t] = 1;
          rowsEl.forEach(function (r) {
            r.el.classList.toggle("on", r.t === t);
            r.cells.forEach(function (c) { if (!seen[r.t]) return; var v = base[r.t][c.k]; c.b.style.width = (v / top * 100) + "%"; c.v.textContent = money(v); });
          });
          out.innerHTML = "A " + t + "-month wait: developer <b>" + money(base[t].dev) + "</b>, other customers <b>" + money(base[t].rate) + "</b>.";
          var k = Object.keys(seen).length;
          if (k >= D.waits.length) { api.done(); api.saw("Developer: " + D.waits.map(function (w) { return money(base[w].dev); }).join(", ") + " for " + D.waits.join(", ") + " months. With no probabilities attached, a scenario says what happens if, not how likely."); }
          else api.saw("Scenarios seen: " + k + " of " + D.waits.length + ".", true);
        }
        out.textContent = "Pick a wait.";
      }
    });

    // ---- 3 one at a time (tornado)
    var swing = tor.rows.slice().sort(function (a, b) { return Math.abs(b.atHi - b.atLo) - Math.abs(a.atHi - a.atLo); });
    steps.push({
      text: "Back at " + T + " months, swing one input at a time across its range, the others at CF7's values: a [[tornado-chart|tornado chart]] (lesson 7). Which swings the developer's cost most?",
      build: function (act, api) {
        var host = H("div", null, act);
        var pr = LX.Predict(act, { id: "m7-oat", q: "Your pick:", answer: swing[0].key, fresh: true, title: false,
          options: D.inputs.map(function (q) { return { value: q.key, label: q.short, color: INCOL[q.key] }; }),
          feedback: (function () { var f = {}, q0 = byKey(swing[0].key); f[swing[0].key] = "Its range moves the lost margin by ± " + money((q0.hi - q0.lo) / 2 * D.toy.loadMW) + " a month."; return f; })(),
          onPick: function () { draw(); pr.reveal(); } });
        act.appendChild(host);
        function draw() {
          host.innerHTML = "";
          LX.Tornado(host, { fmt: money, measure: "the developer's cost" }).draw({ base: tor.base,
            rows: tor.rows.map(function (r) { var q = D.inputs.filter(function (z) { return z.key === r.key; })[0]; return { label: q.short, loText: val(q, q.lo), hiText: val(q, q.hi), atLo: r.atLo, atHi: r.atHi }; }),
            lede: "**The developer, " + T + " months**: " + money(tor.base) + " at CF7's values (black line).", note: "Each bar: one input from its low to its high end, the other four at CF7's values." });
          api.done();
          api.saw(short(swing[0].key) + " swings it most: " + money(swing[0].atLo) + " to " + money(swing[0].atHi) + ". Capital and the discount rate swing it about equally, by about " + money(Math.abs(swing[1].atHi - swing[1].atLo)).replace(/\.\dM$/, "M") + " each; the upgrades and the never-arrives chance do not move it.");
        }
      }
    });

    // ---- 4 stacked corners
    steps.push({
      text: "A cautious plan might stack every input at its high-cost end at once, an optimistic one every input at its low-cost end. Try both corners of the five ranges.",
      build: function (act, api) {
        var got = {}, r = row(act), P = LX.Plot(act, { text: "Text version of the chart" }), out = readout(act);
        [["lo", "All at the low-cost end"], ["hi", "All at the high-cost end"]].forEach(function (c) {
          var b = H("button", { type: "button", class: "lx-btn small ghost", text: c[1] }, r);
          b.addEventListener("click", function () { got[c[0]] = 1; draw(); });
        });
        function draw() {
          var marks = [{ x: tor.base / 1e6, y: 0.5, label: "CF7's values " + money(tor.base), kind: "dot", pos: "above", color: COL.mid }];
          if (got.lo) marks.push({ x: cor.lo / 1e6, y: 0.5, label: money(cor.lo), kind: "dot", pos: "below", color: COL.corner });
          if (got.hi) marks.push({ x: cor.hi / 1e6, y: 0.5, label: money(cor.hi), kind: "dot", pos: "below", color: COL.corner });
          var sw = swing[0];
          P.render({ x: { min: 100, max: 250, ticks: [[100, "$100M", "start"], [150, "$150M"], [200, "$200M"], [250, "$250M", "end"]] }, y: { min: 0, max: 1, ticks: [] }, height: 130, heightN: 130, ml: 14,
                     spans: got.lo && got.hi ? [{ x0: cor.lo / 1e6, x1: cor.hi / 1e6, color: COL.corner, op: 0.08 }] : [],
                     bars: [{ x0: Math.min(sw.atLo, sw.atHi) / 1e6, x1: Math.max(sw.atLo, sw.atHi) / 1e6, y0: 0.14, y1: 0.24, color: INCOL[sw.key], op: 0.55, rx: 3 }], marks: marks,
                     legend: [{ label: "The margin alone, one at a time", color: INCOL[sw.key] }].concat(got.lo && got.hi ? [{ label: "Between the corners", color: COL.corner }] : []),
                     aria: "The developer's cost at CF7's values and at the corners of the five ranges.",
                     text: { head: ["Case", "Developer's cost"], rows: [["CF7's values", money(tor.base)], ["The margin alone, low to high", money(sw.atLo) + " to " + money(sw.atHi)]].concat(got.lo ? [["Every input at its low-cost end", money(cor.lo)]] : [], got.hi ? [["Every input at its high-cost end", money(cor.hi)]] : []) } });
          out.innerHTML = got.lo && got.hi ? "Corners: <b>" + money(cor.lo) + "</b> and <b>" + money(cor.hi) + "</b>." : "Corners tried: " + Object.keys(got).length + " of 2.";
          if (got.lo && got.hi) { api.done(); api.saw("Only the margin, capital and discount rate enter the developer's cost, so a corner needs all three at one end together. Only chances can say how likely that is."); }
        }
        draw();
      }
    });

    // ---- 5 distributions and the Latin hypercube (10 runs, margin against discount rate)
    steps.push({
      text: "Chances need a [[probability-distribution|distribution]] for each input; here each is uniform, every value in its range equally likely. Draw 10 runs by plain random sampling, then by [[latin-hypercube|Latin hypercube]], and compare the gaps.",
      build: function (act, api) {
        var seen = {}, method = null, sd0 = D.seed, n = D.preview, qm = D.inputs[0], qr = D.inputs[2];
        var ctl = row(act);
        seg(ctl, ["Plain random", "Latin hypercube"], -1, function (i) { method = i ? "lhs" : "random"; seen[method] = 1; draw(); }, "Sampling method");
        var nb = H("button", { type: "button", class: "lx-btn small ghost", text: "New seed" }, ctl), sl = H("span", { class: "m7-seed", text: "Seed " + sd0 }, ctl);
        nb.addEventListener("click", function () { sd0++; sl.textContent = "Seed " + sd0; draw(); });
        var P = LX.Plot(act, { text: "Text version of the chart" }), out = readout(act);
        function draw() {
          if (!method) { out.textContent = "Pick a method."; P.render({ x: { min: 0, max: 1, ticks: [] }, y: { min: 0, max: 1, ticks: [] }, height: 60, heightN: 60, aria: "Empty until a method is picked.", text: { head: ["Run"], rows: [] } }); return; }
          var st = study(D, { n: n, seed: sd0, method: method }), em = empty(st.U, 0, n), er = empty(st.U, 2, n);
          var dx = (qm.hi - qm.lo) / n, dy = (qr.hi - qr.lo) / n, bars = [], usedC = {}, usedR = {};
          st.U[0].forEach(function (u) { usedC[Math.floor(u * n)] = 1; }); st.U[2].forEach(function (u) { usedR[Math.floor(u * n)] = 1; });
          for (var k = 0; k < n; k++) {
            if (!usedC[k]) bars.push({ x0: (qm.lo + k * dx) / 1e3, x1: (qm.lo + (k + 1) * dx) / 1e3, y0: qr.lo * 100, y1: qr.hi * 100, color: COL.empty, op: 0.13 });
            if (!usedR[k]) bars.push({ x0: qm.lo / 1e3, x1: qm.hi / 1e3, y0: (qr.lo + k * dy) * 100, y1: (qr.lo + (k + 1) * dy) * 100, color: COL.empty, op: 0.13 });
          }
          for (k = 1; k < n; k++) {
            bars.push({ x0: (qm.lo + k * dx) / 1e3 - 0.04, x1: (qm.lo + k * dx) / 1e3 + 0.04, y0: qr.lo * 100, y1: qr.hi * 100, color: COL.line, op: 1 });
            bars.push({ x0: qm.lo / 1e3, x1: qm.hi / 1e3, y0: (qr.lo + k * dy) * 100 - 0.006, y1: (qr.lo + k * dy) * 100 + 0.006, color: COL.line, op: 1 });
          }
          var pts = st.X.margin.map(function (m, a) { return [m / 1e3, st.X.rate[a] * 100]; });
          var dots = pts.map(function (p) { return { x: p[0], y: p[1], kind: "dot", color: COL.dot }; });
          P.render({ x: { min: qm.lo / 1e3, max: qm.hi / 1e3, ticks: [[30, "$30k", "start"], [45, "$45k"], [60, "$60k", "end"]] },
                     y: { min: qr.lo * 100, max: qr.hi * 100, ticks: [[6, "6%"], [8, "8%"], [10, "10%"]], unit: "discount rate" }, height: 250, heightN: 230, ml: 40,
                     bars: bars, marks: dots, legend: [{ label: "One run", color: COL.dot }, { label: "Slice with no run", color: COL.empty }],
                     aria: n + " runs drawn by " + (method === "lhs" ? "Latin hypercube" : "plain random sampling") + ", seed " + sd0 + ": margin across, discount rate up; " + em + " of " + n + " margin slices and " + er + " of " + n + " discount-rate slices are empty.",
                     text: { head: ["Run", "Margin ($ per MW a month)", "Discount rate"], rows: pts.map(function (p, a) { return [String(a + 1), "$" + int(p[0] * 1e3), (p[1]).toFixed(2) + "%"]; }), note: "Empty slices: " + em + " of " + n + " for the margin, " + er + " of " + n + " for the discount rate." } });
          out.innerHTML = "Seed " + sd0 + ", " + (method === "lhs" ? "Latin hypercube" : "plain random") + ": <b>" + em + " of " + n + "</b> margin slices and <b>" + er + " of " + n + "</b> discount-rate slices empty.";
          if (seen.lhs && seen.random) { api.done(); api.saw("A Latin hypercube cuts every range into " + n + " equal slices and puts exactly one draw in each, for all five inputs at once. Plain random draws clump and leave gaps."); }
          else api.saw("Methods tried: " + Object.keys(seen).length + " of 2.", true);
        }
        draw();
      }
    });

    // ---- 6 run it 1,000 times
    var M0 = function () { return lab.main(T); };
    function mainSpec(st, extra) {
      var sm = summary(st.dev);
      // (marks without labels: a label on the tallest bars would be hard to read; the legend names them)
      return histSpec(D, st.dev, Object.assign({ lo: 100e6, hi: 250e6, spans: [{ x0: sm.p10, x1: sm.p90, color: COL.dev, op: 0.12 }],
        marks: [{ x: sm.p50 }, { x: cor.lo }, { x: cor.hi }],
        legend: [{ label: "Shaded: 80% of runs, P10 to P90", color: COL.dev }, { label: "Dashed: the two corners and, between them, the median", color: "var(--lx-ink-3)", dash: true }],
        aria: "Histogram of the developer's cost in 1,000 runs, seed " + D.seed + ", a " + T + "-month wait.",
        note: "Shaded: P10 " + money(sm.p10) + " to P90 " + money(sm.p90) + ". Median " + money(sm.p50) + ". Corners " + money(cor.lo) + " and " + money(cor.hi) + "." }, extra || {}));
    }
    steps.push({
      text: "Now run the model 1,000 times on a Latin hypercube, [[random-seed|seed]] " + D.seed + ": each run draws all five inputs and gives one present value. Read the [[histogram|histogram]], not one number.",
      build: function (act, api) {
        var r = row(act), b = H("button", { type: "button", class: "lx-btn small", text: "Run 1,000 times" }, r);
        var P = LX.Plot(act, { text: "Text version of the chart" }), out = readout(act);
        P.render({ x: { min: 100, max: 250, ticks: [[100, "$100M", "start"], [150, "$150M"], [200, "$200M"], [250, "$250M", "end"]] }, y: { min: 0, max: 100, step: 20, fmt: function (n) { return String(n); }, unit: "runs" }, height: 230, heightN: 200, aria: "Empty histogram: press Run.", text: { head: ["Cost, from", "up to", "Runs"], rows: [] } });
        b.addEventListener("click", function () {
          var st = M0(), sm = summary(st.dev), g = own.guess || LX.progress.guess("m7-p90"), N = nearCorner(st, "dev", D.near);
          P.render(mainSpec(st));
          var gl = D.guess.filter(function (x) { return x.value === g; })[0], right = gl && Math.abs(+g * 1e6 - sm.p90) === Math.min.apply(null, D.guess.map(function (x) { return Math.abs(+x.value * 1e6 - sm.p90); }));
          out.innerHTML = "Median <b>" + money(sm.p50) + "</b> · 80% of runs from <b>" + money(sm.p10) + "</b> to <b>" + money(sm.p90) + "</b> · runs from " + money(sm.min) + " to " + money(sm.max) + "." +
                          (gl ? (right ? " Your guess, about $" + g + "M, was the closest." : " You guessed about $" + g + "M.") : "");
          keep("run", true);
          api.done();
          // an exact corner has zero chance under continuous inputs: count runs in a stated neighbourhood instead
          api.saw("P90, the 90th [[percentile|percentile]], is **" + money(sm.p90) + "**: 9 runs in 10 cost less. " + nearText(N) + ".");
        });
      }
    });

    // ---- 7 Monte Carlo error: 20 repeats at 100 and 1,000 runs
    steps.push({
      text: "Another seed gives a slightly different P90. Repeat the whole run with seeds " + D.repeats.first + " to " + D.repeats.last + " (seed " + D.seed + " is your run), at 100 and at 1,000 runs, and watch the estimates scatter.",
      build: function (act, api) {
        var got = {}, r = row(act), status = readout(act), P = LX.Plot(act, { text: "Text version of the chart" }), out = readout(act);
        D.repeats.sizes.forEach(function (n) {
          var b = H("button", { type: "button", class: "lx-btn small ghost", text: "20 repeats of " + int(n) + " runs" }, r);
          b.addEventListener("click", function () { soon(api, status, function () { got[n] = lab.reps(n, T); status.textContent = ""; draw(true); }); });
        });
        function draw(user) {
          var bars = [], dots = [], rowsT = [], lines = [];
          D.repeats.sizes.forEach(function (n, i) {
            if (!got[n]) return;
            var jr = rng(1000 + n), v = got[n].map(function (x) { return x.p90; }), e = se(got[n], function (x) { return x.p90; });
            var me = got[n].filter(function (x) { return x.seed === D.seed; })[0];
            bars.push({ x0: Math.max(190, (me.p90 - 2 * e) / 1e6), x1: Math.min(210, (me.p90 + 2 * e) / 1e6), y0: i + 0.7, y1: i + 1.3, color: COL.dot, op: 0.12 });
            got[n].forEach(function (x) { var mine = x.seed === D.seed; dots.push({ x: x.p90 / 1e6, y: i + 1 + (jr() - 0.5) * 0.4, kind: "dot", color: mine ? COL.mid : COL.dot }); });
            rowsT.push([int(n) + " runs", sorted(v).map(money).join(", "), pm(2 * e)]);
            lines.push(int(n) + " runs: P90 " + pm(2 * e) + " (2 standard errors)");
          });
          P.render({ x: { min: 190, max: 210, ticks: [[190, "$190M", "start"], [195, "$195M"], [200, "$200M"], [205, "$205M"], [210, "$210M", "end"]], ticksN: [[190, "$190M", "start"], [200, "$200M"], [210, "$210M", "end"]] },
                     y: { min: 0.4, max: 2.6, ticks: [[1, "100"], [2, "1,000"]], unit: "runs" }, height: 170, heightN: 160, ml: 50, bars: bars, marks: dots,
                     legend: [{ label: "One repeat's P90", color: COL.dot }, { label: "Seed " + D.seed + " (your run)", color: COL.mid }, { label: "Its P90 ± 2 standard errors", color: COL.dot }],
                     aria: "P90 estimates from 20 repeats, one row per run count.", text: { head: ["Runs per repeat", "The 20 P90 estimates, sorted", "Scatter (2 standard errors)"], rows: rowsT } });
          out.textContent = lines.length ? lines.join(" · ") : "Run the repeats.";
          if (user && got[D.repeats.sizes[0]] && got[D.repeats.sizes[1]]) {
            var e1 = se(got[D.runs], function (x) { return x.p90; }), e0 = se(got[D.repeats.sizes[0]], function (x) { return x.p90; }), mine = got[D.runs].filter(function (x) { return x.seed === D.seed; })[0];
            api.done(); api.saw("P90 = **" + money(mine.p90) + " " + pm(2 * e1) + "** with 1,000 runs (two [[standard-error|standard errors]], from the 20 repeats); " + pm(2 * e0) + " with 100. Report a [[monte-carlo-error|Monte Carlo]] number with its run count and its scatter.");
          } else if (user) api.saw("Run counts tried: " + Object.keys(got).length + " of 2.", true);
        }
        draw(false);
      }
    });

    // ---- 8 a chance under the model's inputs, by scenario
    steps.push({
      text: "The share of runs above a budget is a chance under the model's inputs (these ranges, uniform shapes, independent draws), not a forecast. Pick a budget and compare the three wait scenarios.",
      build: function (act, api) {
        var seen = {}, tau = T, Bd = D.budget;
        seg(row(act), D.waits.map(function (t) { return t + " months"; }), D.waits.indexOf(T), function (i) { tau = D.waits[i]; draw(true); }, "Wait scenario");
        var sl = LX.Slider(act, { label: "Budget", color: COL.tail, min: Bd.min, max: Bd.max, step: Bd.step, value: Bd.start, fmt: function (v) { return "$" + v + "M"; }, onChange: function () { draw(true); } });
        var status = readout(act), P = LX.Plot(act, { text: "Text version of the chart" }), out = readout(act);
        function draw(user) {
          var st = lab.main(tau), B = sl.val() * 1e6, n = countAbove(st.dev, B), reps = lab.reps(D.runs, tau);
          var e = se(reps, function (r) { return shareSorted(r.devSorted, B); }), none = reps.every(function (r) { return shareSorted(r.devSorted, B) === 0; });
          seen[tau] = 1;
          P.render(histSpec(D, st.dev, { lo: 50e6, hi: 350e6, spans: [{ x0: B, x1: 350e6, color: COL.tail, op: 0.14 }], marks: [{ x: B }],
            legend: [{ label: "Shaded: runs above the budget, $" + sl.val() + "M", color: COL.tail }],
            aria: "Histogram of the developer's cost in 1,000 runs at a " + tau + "-month wait, with the runs above $" + sl.val() + "M shaded: " + n + " runs.", note: n + " of 1,000 runs above $" + sl.val() + "M." }));
          out.innerHTML = "Above $" + sl.val() + "M at " + tau + " months: <b>" + n + " of 1,000</b> runs, <b>" + shr(n / D.runs) + "</b> " + (none ? "(none in any of the 20 repeats either)." : "± " + pts(2 * e) + " (2 standard errors, 20 seeds).");
          keep("budget", sl.val());
          if (Object.keys(seen).length >= D.waits.length) {
            var Bs = sl.val() * 1e6;
            api.done(); api.saw("Above $" + sl.val() + "M: " + D.waits.map(function (t) { return shr(countAbove(lab.main(t).dev, Bs) / D.runs) + " of runs at " + t + " months"; }).join(", ") + ". Each chance holds only under its scenario and these inputs.");
          } else if (user) api.saw("Scenarios tried: " + Object.keys(seen).length + " of " + D.waits.length + ".", true);
        }
        status.textContent = "";
        draw(false);
      }
    });

    // ---- 9 global sensitivity: Spearman's rank correlation, both accounts, the tie rule
    function scatterSpec(st, key, out) {
      var q = D.inputs.filter(function (z) { return z.key === key; })[0], sc = q.key === "rate" || q.key === "strand" ? 100 : q.key === "margin" ? 1e-3 : 1e-6;
      var ys = st[out], ya = niceAxis(Math.max.apply(null, ys) / 1e6, Math.min.apply(null, ys) / 1e6), bars = [], dxs = (q.hi - q.lo) * sc / (window.innerWidth < 560 ? 130 : 280), dys = (ya.max - ya.min) / 90;   // about 5 px either way
      for (var a = 0; a < st.n; a++) { var xv = st.X[key][a] * sc, yv = ys[a] / 1e6; bars.push({ x0: xv - dxs, x1: xv + dxs, y0: yv - dys, y1: yv + dys, color: INCOL[key], op: 0.45, rx: 2 }); }
      var ft = function (v) { return q.key === "margin" ? "$" + Math.round(v) + "k" : q.key === "rate" ? Math.round(v) + "%" : q.key === "strand" ? v.toFixed(2) + " pts" : "$" + Math.round(v) + "M"; };
      var lo = q.lo * sc, hi = q.hi * sc, mid = (lo + hi) / 2;
      return { x: { min: lo, max: hi, ticks: [[lo, ft(lo), "start"], [mid, ft(mid)], [hi, ft(hi), "end"]] }, y: { min: ya.min, max: ya.max, step: ya.step, fmt: function (v) { return "$" + v + "M"; }, unit: COST[out].replace(/^the /, "") }, height: 210, heightN: 190, ml: 56,
               bars: bars, aria: "1,000 runs: " + q.label + " across, " + COST[out] + " up. " + cloudSentence(st, key, out),
               text: { html: cloudHTML(st, key, out) } };
    }
    // the text version of the scatter: its shape in one sentence, then the runs in ten slices of the input's range
    function cloudSentence(st, key, out) {
      var c = cloud(st, key, out), nm = NOUN[key], acc = COST[out].charAt(0).toUpperCase() + COST[out].slice(1);
      if (c.trend === "flat") return "Flat: " + COST[out] + " does not depend on " + nm + ", so the median run stays between " + money(c.medLo) + " and " + money(c.medHi) + " in every tenth of its range.";
      return acc + " " + (c.trend === "weak" ? "barely moves" : c.trend) + " with " + nm + ": the median run goes from " + money(c.slices[0].p50) + " in the lowest tenth of its range to " + money(c.slices[c.slices.length - 1].p50) + " in the highest; within a tenth, the middle 80% of runs spans about " + money(c.width) + ".";
    }
    function cloudHTML(st, key, out) {
      var c = cloud(st, key, out), q = byKey(key), esc = LX.esc;
      var h = '<p class="lx-hint">' + esc(cloudSentence(st, key, out)) + " ρ = " + r2(rhos(st, out)[key]) + " over 1,000 runs.</p>";
      h += '<div class="lx-scroll-x"><table class="lx-mini-table"><thead><tr><th scope="col">' + esc(q.short) + ' from</th><th scope="col">up to</th><th scope="col">Runs</th><th scope="col">Median cost</th><th scope="col">Middle 80% of runs</th></tr></thead><tbody>';
      c.slices.forEach(function (x) { h += "<tr><td>" + esc(val(q, x.lo)) + "</td><td>" + esc(val(q, x.hi)) + "</td><td>" + x.n + "</td><td>" + money(x.p50) + "</td><td>" + money(x.p10) + " to " + money(x.p90) + "</td></tr>"; });
      return h + '</tbody></table></div><p class="lx-hint">Every run, with all five inputs and both costs: the CSV download under the chart.</p>';
    }
    steps.push({
      text: "Which input matters most when all five vary together? Correlate each input's ranks with the cost's ranks over the 1,000 runs, for both accounts: [[rank-correlation|Spearman's rank correlation]] ρ, from −1 to 1.",
      build: function (act, api) {
        var seen = {}, out = "dev", pick = "margin", st = M0();
        var ctl = row(act); seg(ctl, ["The developer", "Other customers"], -1, function (i) { out = i ? "rate" : "dev"; seen[out] = 1; draw(true); }, "Account");
        var status = readout(act);
        var bars = RhoBars(act, { inputs: D.inputs, onPick: function (k) { pick = k; drawCloud(); } });
        H("p", { class: "lx-hint", text: "Whiskers: ± 2 standard errors over 20 seeds. Tie rule: two inputs share a rank when their gap is within two standard errors of that gap." }, act);
        var P = LX.Plot(act, { text: "Text version of the chart" }), res = readout(act);
        var csv = csvRuns(st), W = window, dl = H("p", { class: "m7-dl" }, act);
        H("a", { class: "lx-btn small ghost", download: "m7-runs-seed" + D.seed + "-" + T + "-months.csv", text: "Download the 1,000 runs (CSV)",
                 href: W.Blob && W.URL && W.URL.createObjectURL ? W.URL.createObjectURL(new W.Blob([csv], { type: "text/csv" })) : "data:text/csv;charset=utf-8," + encodeURIComponent(csv) }, dl);
        function drawCloud() { P.render(scatterSpec(st, pick, out)); }
        function draw(user) {
          var reps = lab.reps(D.runs, T), rh = rhos(st, out), G = rankGroups(rh, reps, out, D.inputs);
          bars.set({ rho: rh, se: seOf(reps, out, D.inputs), ranks: ranksOf(G) }); bars.pick(pick); drawCloud();
          res.innerHTML = ACCN[out] + ": " + G.groups.slice(0, 2).map(function (g) { return g.map(function (x) { return short(x.key).toLowerCase() + " " + r2(x.rho); }).join(" and ") + (g.length > 1 ? " (tied, rank " + g[0].rank + ")" : " (rank " + g[0].rank + ")"); }).join("; then ") + ".";
          if (seen.dev && seen.rate) {
            var Gd = rankGroups(rhos(st, "dev"), reps, "dev", D.inputs), Gr = rankGroups(rhos(st, "rate"), reps, "rate", D.inputs), w = function (x) { return short(x.key).toLowerCase() + " (" + r2(x.rho) + ")"; };
            api.done(); api.saw("Developer: " + w(Gd.groups[0][0]) + " first; " + Gd.groups[1].map(w).join(" and ") + " tied next. Other customers: " + w(Gr.groups[0][0]) + ", then " + w(Gr.groups[1][0]) + ", so influence depends on the output.");
          } else if (user) api.saw("Accounts seen: " + Object.keys(seen).length + " of 2. Tap an input to see its cloud of runs.", true);
        }
        status.textContent = "";
        draw(false);
      }
    });

    // ---- 10 ranges set the ranking: narrow the margin's range
    steps.push({
      text: "A rank correlation ranks inputs only within the ranges you assumed. Suppose a market study pins the margin down: narrow its range until the margin is no longer first.",
      build: function (act, api) {
        var MW = D.marginWidth, status = readout(act);
        var sl = S10 = LX.Slider(act, { label: "The margin's range", color: INCOL.margin, min: MW.min, max: MW.max, step: MW.step, value: MW.start, fmt: function (v) { return "$45,000 ± $" + int(v); }, downLabel: "Narrow", upLabel: "Widen", onChange: function () { later(); } });
        var bars = RhoBars(act, { inputs: D.inputs, aria: "Rank correlation of each input with the developer's cost" }), res = readout(act), timer = null;
        function later() { clearTimeout(timer); timer = setTimeout(function () { draw(true); }, 60); }
        function draw(user) {
          var h = sl.val(), N = lab.narrow(h), first = N.groups[0];
          bars.set({ rho: N.rho, se: N.se, ranks: ranksOf(N) });
          var fw = first.map(function (x) { return short(x.key).toLowerCase() + " " + r2(x.rho); }).join(" and ");
          res.innerHTML = "± $" + int(h) + ": " + (first.length > 1 ? "tied first: <b>" + fw + "</b>" : "first: <b>" + fw + "</b>") + (first.some(function (x) { return x.key === "margin"; }) ? "." : "; the margin (" + r2(N.rho.margin) + ") ranks " + N.marginRank + ".");
          keep("half", h);
          if (user && first.every(function (x) { return x.key !== "margin"; })) {
            api.done(); api.saw("At ± $" + int(h) + " the margin ranks " + N.marginRank + ". [[global-sensitivity-analysis|Global sensitivity]] answers which inputs move the result within these ranges, not which matter in the world.");
          } else if (user) api.saw(first.length > 1 ? "Tied within Monte Carlo error: narrow it further." : "The margin still leads: narrow it further.", true);
        }
        status.textContent = "";
        draw(false);
      }
    });

    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "m7-steps", steps: steps });
    function clickIn(sel, i) { var b = cardsHost.querySelectorAll(sel)[i || 0]; if (b) b.click(); }
    // demo states (core.js LX.demo): "mid" = step 6 with the 1,000 runs drawn; step-N opens card N with its action done;
    // "gloss" = step 9 with its rank-correlation term's popover open (for the layout check of popovers on phones)
    LX.demo(root, function (state) {
      if (state === "gloss") {
        cards.go(8);
        var tries = 0;
        (function open() {   // once the glossary has made the term a button
          var t = cardsHost.querySelector(".lx-step-text .lx-term");
          if (t && t.classList.contains("on")) t.click(); else if (tries++ < 60) setTimeout(open, 50);
        })();
        return { view: state };
      }
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 6 : m ? Math.min(steps.length, +m[1]) : 0;
      if (!n) return null;
      cards.go(n - 1);
      if (n === 1) clickIn(".lx-step-act .lx-choice", 1);
      if (n === 2) [0, 1, 2].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 3) clickIn(".lx-step-act .lx-choice", 0);
      if (n === 4) [0, 1].forEach(function (i) { clickIn(".lx-step-act .m7-row .lx-btn", i); });
      if (n === 5) [0, 1].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 6) clickIn(".lx-step-act .m7-row .lx-btn");
      if (n === 7) { lab.reps(100, T); lab.reps(D.runs, T); [0, 1].forEach(function (i) { clickIn(".lx-step-act .m7-row .lx-btn", i); }); }
      if (n === 8) [0, 1, 2].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 9) [1, 0].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 10 && S10) { var W = D.marginWidth; for (var h = W.max - W.step; h >= W.min; h -= W.step) { S10.set(h, true); if (lab.narrow(h).groups[0].every(function (x) { return x.key !== "margin"; })) break; } }
      return { view: state };
    }, cards);
    explain(D, lab);
  });

  // ---------------------------------------------------------------- explain layer: the study as a flowchart, four ways
  // of asking "what could happen?" as a table, and where the numbers hold. It always shows the reference case (the
  // original ranges, seed 7, a 24-month wait, a $200M budget), whatever the reader set in the steps, and says so
  function explain(D, lab) {
    var x = document.getElementById("m7-explain"); if (!x) return;
    x.innerHTML = "";
    var T = D.wait, st = lab.main(T), sm = summary(st.dev), reps = lab.reps(D.runs, T), r100 = lab.reps(100, T);
    var e1 = se(reps, function (r) { return r.p90; }), e0 = se(r100, function (r) { return r.p90; }), rh = rhos(st, "dev");
    var B = D.budget.start * 1e6, s36 = countAbove(lab.main(36).dev, B) / D.runs, near = nearCorner(st, "dev", D.near);
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "A Monte Carlo study, move by move", lede: "Reference case, whatever you set above: the original ranges, seed " + D.seed + ", a " + T + "-month wait and a $" + D.budget.start + "M budget. Trace three cases.",
      nodes: {
        q: { t: "Question and output", tN: ["Question", "and output"], s: "the developer's cost", sN: "developer's cost", k: "end" },
        sc: { t: "Fix a scenario", tN: ["Fix a", "scenario"], s: "a " + T + "-month wait", sN: T + " months" },
        inp: { t: "Ranges and shapes", tN: ["Ranges and", "shapes"], s: "five uniform inputs", sN: "five uniform" },
        smp: { t: "Sample the inputs", tN: ["Sample the", "inputs"], s: "Latin hypercube, seed " + D.seed, sN: "seed " + D.seed },
        run: { t: "Run the model N times", tN: ["Run the", "model N times"], s: "1,000 runs", sN: "1,000 runs" },
        err: { t: "Scatter small enough?", tN: ["Scatter small", "enough?"], k: "q" },
        more: { t: "More runs", tN: ["More", "runs"], s: "start again", sN: "start again", k: "end" },
        read: { t: "Percentiles and chances", tN: ["Percentiles", "and chances"], s: "P90 " + money(sm.p90), sN: "P90" },
        rank: { t: "Rank the inputs", tN: ["Rank the", "inputs"], s: "Spearman's ρ", sN: "Spearman's ρ" },
        rep: { t: "Report N, seed, ranges, scatter", tN: ["Report N, seed,", "ranges, scatter"], k: "end" }
      },
      cols: 3, at: { q: [1, 0], sc: [1, 1], inp: [1, 2], smp: [1, 3], run: [1, 4], err: [1, 5], more: [2, 5], read: [1, 6], rank: [1, 7], rep: [1, 8] },
      colsN: 2, atN: { q: [0, 0], sc: [0, 1], inp: [0, 2], smp: [0, 3], run: [0, 4], err: [0, 5], more: [1, 5], read: [0, 6], rank: [0, 7], rep: [0, 8] },
      edges: [["q", "sc"], ["sc", "inp"], ["inp", "smp"], ["smp", "run"], ["run", "err"], ["err", "more", "no"], ["err", "read", "yes"], ["read", "rank"], ["rank", "rep"]],
      traces: [
        { label: "Reference case", path: ["q", "sc", "inp", "smp", "run", "err", "read", "rank", "rep"], text: "1,000 runs: P90 " + money(sm.p90) + " " + pm(2 * e1) + "; the margin ranks first (ρ = " + r2(rh.margin) + ")." },
        { label: "Only 100 runs", path: ["q", "sc", "inp", "smp", "run", "err", "more"], text: "P90 " + pm(2 * e0) + ": if a decision turns on the P90, run more." },
        { label: "A 36-month wait", path: ["q", "sc", "inp", "smp", "run", "err", "read", "rank", "rep"], text: shr(s36) + " of runs exceed $" + D.budget.start + "M at 36 months: a chance holds within its scenario." }
      ], sel: 0
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Four ways to ask what could happen", text: true,
      columns: [{ key: "name", label: "Method", main: true }, { key: "asks", label: "It answers" }, { key: "runs", label: "Runs here", num: true, phone: "Runs" }, { key: "chance", label: "A chance?" }, { key: "misses", label: "It misses", phoneHide: true }],
      rows: [
        { key: "scen", color: "var(--lx-ink-3)", name: "Scenarios", note: "the wait: " + D.waits.join(", ") + " months", asks: "What if?", runs: String(D.waits.length), chance: "No", misses: "how likely each scenario is" },
        { key: "oat", color: "var(--lx-tier-2)", name: "One at a time", note: "the tornado chart", asks: "Which input moves the result on its own?", runs: String(1 + 2 * D.inputs.length), chance: "No", misses: "inputs moving together" },
        { key: "corner", color: COL.corner, name: "Stacked corners", note: "every end of every range", asks: "How far can it go inside the ranges?", runs: String(Math.pow(2, D.inputs.length)), chance: "No", misses: "how rare a corner is: " + int(near.n) + " of 1,000 runs came near one (step 6)" },
        { key: "mc", color: COL.dev, name: "Monte Carlo and rank correlation", note: "Latin hypercube, seed " + D.seed + "; 20 repeats for the error", asks: "How likely is each result, and which inputs drive its spread?", runs: "1,000 a scenario", chance: "Yes, under the assumed inputs", misses: "links between inputs; wrong ranges" }
      ],
      sorts: [{ label: "As built", order: ["scen", "oat", "corner", "mc"], note: "Only the last gives chances, and only under its inputs." }]
    });
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where this lesson's numbers hold",
      holds: ["the five ranges and their uniform shapes are fair guesses;", "the inputs vary independently of each other;", "the wait is one of three scenarios, each studied on its own;",
              "CF7's toy: illustrative round numbers, one price level, no large-load tariff and no bridge power."],
      leaves: ["links between inputs: here each is drawn on its own;", "uncertainty in the wait within a scenario;", "real project data: these ranges are invented;",
               "effects a rank correlation misses: interactions and up-and-down responses."],
      source: "Model: this page's toy, built on case file CF7's illustrative load; seed " + D.seed + ", 1,000 runs per scenario, 20 repeats." });
  }
})();
