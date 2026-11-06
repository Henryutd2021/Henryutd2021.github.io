// m14-did-it-work.js — Modeler lesson M14, "Did it work? Learning from data with regression and natural experiments"
// (model-lab in the step-card form, statistical mode, no solver; Learn W5, 2026-11-06).
//
// Every dataset here is SIMULATED, with a known true effect (curriculum §4 W5 brief: empirical methods), so the reader
// sees when an estimator recovers the truth and when confounding, selection, spillovers or anticipation move it away.
// Settings: assets/learn/data/m14-did-it-work.json. No download, no real household or region.
//
// The generator: LX.mulberry32 (core.js) with the seed in the settings, one stream per panel, draws in a fixed order;
// an approximately normal draw is the sum of 12 uniform draws minus 6 (Irwin-Hall: mean 0, standard deviation 1). Only
// + - x / are used, so the notebook's Python port (scripts/build_learn_m14_notebook.py) gives the same panel exactly.
//
// Panel 1, a time-of-use (TOU) tariff: 400 homes, 24 months, the tariff from month 13 for homes that opt in. For home i,
// in order of draws: air conditioning ac (uniform < 0.6), size s (thousand sq ft, uniform 1 to 3), engagement e (normal,
// never observed by the analyst), selection noise z (normal); then each month's noise.
//   opt in:      e - 0.6 (s - 2) + 0.6 z > 1
//   true effect: tau_i = min(0, -(0.20 + 0.08 e)) kW from month 13 in homes that opted in
//   outcome:     y_it = 1.3 + 0.6 ac + 0.35 (s - 2) - 0.25 e + season_m + ac acSeason_m cooling_year + 0.3 noise + tau_i D_it
// The truth reported is the average effect on the homes that opted in (ATT); the effect if every home were defaulted
// onto the tariff is the average of tau_i over all 400 (ATE). Threats (each re-generates the same draws with one change):
// trend (opted-in homes drift -0.012 kW a month, all 24 months, zero at month 12), anticipate (60% of tau_i in months 10
// to 12), spill (flat homes -0.08 kW from month 13), bundle (opted-in homes with e > 0.5 also -0.15 kW from month 13).
// Estimators: the naive after-period gap (TOU minus flat, months 13-24); least squares on each home's after-period mean
// with a TOU dummy and chosen controls (size, air conditioning); before-after on TOU homes; difference-in-differences
// (DiD) = mean change of TOU homes - mean change of flat homes, with the standard error of a difference of two means of
// home-level changes (equivalent to clustering by home); the event study: for each month, the DiD of that month against
// month 12, with its standard error. Intervals are estimate +- 1.96 standard errors (about 95%, as K5).
//
// Panel 2, a policy and solar investment: 30 regions, 2016-2025, the policy from 2021 in regions that adopt. For region r:
// sunshine (normal), selection noise (normal), then each year's noise. Adopt: sun + 0.7 noise > 0.3. New solar built
// y_rt = 30 + 8 sun + 3 (t - 2016) + 5 noise + 10 D_rt MW. Threats: boom (adopters +2.5 MW a year faster, all years, zero
// in 2020) and border (non-adopters -4 MW a year from 2021, projects moved to adopters: a spillover that makes the
// gross effect look larger and the net national change smaller).
// Every number the page states comes from facts() (_tests/learn/test_m14-did-it-work.js; the notebook asserts reference()).
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function mulberry32(seed) {
    if (typeof window !== "undefined" && window.LX && window.LX.mulberry32) return window.LX.mulberry32(seed);
    return require("./components/core.js").mulberry32(seed);
  }
  function gauss(r) { var s = 0; for (var k = 0; k < 12; k++) s += r(); return s - 6; }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function vari(a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return s / (a.length - 1); }
  // panel 1: the homes, with or without one threat (th: "trend" | "anticipate" | "spill" | "bundle" | null)
  function touPanel(T, th) {
    var r = mulberry32(T.seed), X = T.threats, hh = [], i, t, t0 = T.start;
    for (i = 0; i < T.n; i++) {
      var ac = r() < T.acShare ? 1 : 0, size = T.size[0] + (T.size[1] - T.size[0]) * r(), e = gauss(r), z = gauss(r);
      var on = e + T.select.size * (size - 2) + T.select.noise * z > T.select.cut ? 1 : 0;
      var tau = Math.min(0, -(T.effect.base + T.effect.engaged * e));
      var a = T.level.base + T.level.ac * ac + T.level.size * (size - 2) + T.level.engaged * e, y = [];
      for (t = 0; t < T.months; t++) {
        var m = t % 12, yr = t < 12 ? 0 : 1, v = a + T.season[m] + ac * T.acSeason[m] * T.cooling[yr] + T.noise * gauss(r);
        if (on && t >= t0) v += tau;
        if (th === "trend" && on) v += X.trend * (t - (t0 - 1));
        if (th === "anticipate" && on && t >= t0 - X.anticipateMonths && t < t0) v += X.anticipateShare * tau;
        if (th === "spill" && !on && t >= t0) v += X.spill;
        if (th === "bundle" && on && t >= t0 && e > X.bundleCut) v += X.bundle;
        y.push(v);
      }
      hh.push({ ac: ac, size: size, e: e, on: on, tau: tau, y: y });
    }
    return hh;
  }
  // least squares by the normal equations (Gauss-Jordan with partial pivoting; a few columns only)
  function ols(X, y) {
    var p = X[0].length, A = [], i, j, k;
    for (i = 0; i < p; i++) { A.push([]); for (j = 0; j <= p; j++) A[i].push(0); }
    X.forEach(function (x, n) { for (i = 0; i < p; i++) { A[i][p] += x[i] * y[n]; for (j = 0; j < p; j++) A[i][j] += x[i] * x[j]; } });
    for (i = 0; i < p; i++) {
      var piv = i; for (k = i + 1; k < p; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      var tmp = A[i]; A[i] = A[piv]; A[piv] = tmp;
      for (k = 0; k < p; k++) if (k !== i) { var f = A[k][i] / A[i][i]; for (j = i; j <= p; j++) A[k][j] -= f * A[i][j]; }
    }
    return A.map(function (row, q) { return row[p] / row[q]; });
  }
  function postMean(T, h) { return mean(h.y.slice(T.start)); }
  function preMean(T, h) { return mean(h.y.slice(0, T.start)); }
  // the regression with controls on each home's after-period mean: y = b0 + b1 TOU + controls; returns b1
  function regress(T, hh, use) {
    var X = hh.map(function (h) { var x = [1, h.on]; if (use.size) x.push(h.size); if (use.ac) x.push(h.ac); return x; });
    return ols(X, hh.map(function (h) { return postMean(T, h); }))[1];
  }
  // a DiD from per-unit changes, and its standard error (difference of two means)
  function didOf(dT, dC) { return { est: mean(dT) - mean(dC), se: Math.sqrt(vari(dT) / dT.length + vari(dC) / dC.length) }; }
  function touEstimates(T, hh) {
    var on = hh.filter(function (h) { return h.on; }), off = hh.filter(function (h) { return !h.on; }), t0 = T.start;
    var pT = on.map(function (h) { return postMean(T, h); }), pC = off.map(function (h) { return postMean(T, h); });
    var bT = on.map(function (h) { return preMean(T, h); }), bC = off.map(function (h) { return preMean(T, h); });
    var naive = didOf(pT, pC), dT = pT.map(function (v, k) { return v - bT[k]; }), dC = pC.map(function (v, k) { return v - bC[k]; });
    var ba = { est: mean(dT), se: Math.sqrt(vari(dT) / dT.length) }, did = didOf(dT, dC);
    var es = [], gm = { on: [], off: [] };
    for (var t = 0; t < T.months; t++) {
      gm.on.push(mean(on.map(function (h) { return h.y[t]; }))); gm.off.push(mean(off.map(function (h) { return h.y[t]; })));
      if (t === t0 - 1) { es.push({ k: t - t0, est: 0, se: 0, ref: true }); continue; }
      var x = didOf(on.map(function (h) { return h.y[t] - h.y[t0 - 1]; }), off.map(function (h) { return h.y[t] - h.y[t0 - 1]; }));
      es.push({ k: t - t0, est: x.est, se: x.se });
    }
    return { nOn: on.length, nOff: off.length, naive: naive, ba: ba, did: did, es: es, gm: gm,
      cells: { onPre: mean(bT), onPost: mean(pT), offPre: mean(bC), offPost: mean(pC) },
      att: mean(on.map(function (h) { return h.tau; })), ate: mean(hh.map(function (h) { return h.tau; })),
      reg: { size: regress(T, hh, { size: true }), both: regress(T, hh, { size: true, ac: true }), ac: regress(T, hh, { ac: true }) },
      share: { onSize: mean(on.map(function (h) { return h.size; })), offSize: mean(off.map(function (h) { return h.size; })),
        onE: mean(on.map(function (h) { return h.e; })), offE: mean(off.map(function (h) { return h.e; })),
        onAC: mean(on.map(function (h) { return h.ac; })), offAC: mean(off.map(function (h) { return h.ac; })) },
      preMax: Math.max.apply(null, es.filter(function (x) { return x.k < -1; }).map(function (x) { return Math.abs(x.est); })) };
  }
  // panel 2: the regions (th: "boom" | "border" | null)
  function regionPanel(R, th) {
    var r = mulberry32(R.seed), out = [];
    for (var k = 0; k < R.n; k++) {
      var sun = gauss(r), al = R.level + R.levelSun * sun, on = sun + R.select.noise * gauss(r) > R.select.cut ? 1 : 0, y = [];
      for (var t = 0; t < R.years; t++) {
        var v = al + R.growth * t + R.noise * gauss(r);
        if (on && t >= R.start) v += R.effect;
        if (th === "boom" && on) v += R.boom * (t - (R.start - 1));
        if (th === "border" && !on && t >= R.start) v += R.border;
        y.push(v);
      }
      out.push({ sun: sun, on: on, y: y });
    }
    return out;
  }
  function regionEstimates(R, rg) {
    var on = rg.filter(function (x) { return x.on; }), off = rg.filter(function (x) { return !x.on; }), s = R.start;
    var ch = function (x) { return mean(x.y.slice(s)) - mean(x.y.slice(0, s)); }, es = [], gm = { on: [], off: [] };
    for (var t = 0; t < R.years; t++) {
      gm.on.push(mean(on.map(function (x) { return x.y[t]; }))); gm.off.push(mean(off.map(function (x) { return x.y[t]; })));
      if (t === s - 1) { es.push({ k: t - s, year: R.first + t, est: 0, se: 0, ref: true }); continue; }
      var d = didOf(on.map(function (x) { return x.y[t] - x.y[s - 1]; }), off.map(function (x) { return x.y[t] - x.y[s - 1]; }));
      es.push({ k: t - s, year: R.first + t, est: d.est, se: d.se });
    }
    return { nOn: on.length, nOff: off.length, did: didOf(on.map(ch), off.map(ch)), es: es, gm: gm,
      naive: didOf(on.map(function (x) { return mean(x.y.slice(s)); }), off.map(function (x) { return mean(x.y.slice(s)); })),
      preMax: Math.max.apply(null, es.filter(function (x) { return x.k < -1; }).map(function (x) { return Math.abs(x.est); })) };
  }
  function ci(x) { return [x.est - 1.96 * x.se, x.est + 1.96 * x.se]; }
  function covers(x, truth) { var c = ci(x); return truth >= c[0] && truth <= c[1]; }

  // ---------------------------------------------------------------- every number the page states, in one place
  function facts(D) {
    var T = D.tou, R = D.regions, F = { D: D };
    F.hh = touPanel(T, null); F.E = touEstimates(T, F.hh);
    F.threat = {}; D.threats.forEach(function (x) { F.threat[x.key] = touEstimates(T, touPanel(T, x.key)); });
    F.rg = regionPanel(R, null); F.R = regionEstimates(R, F.rg);
    F.rthreat = {}; R.threats.forEach(function (x) { F.rthreat[x.key] = regionEstimates(R, regionPanel(R, x.key)); });
    var E = F.E;
    F.truth = E.att; F.flatChange = E.cells.offPost - E.cells.offPre;
    // the border threat as gross and net MW a year (adopters gain, the others lose)
    var B = F.rthreat.border;
    F.border = { claimed: B.did.est * B.nOn, gross: R.effect * B.nOn, lost: -R.border * B.nOff, net: R.effect * B.nOn + R.border * B.nOff };
    return F;
  }
  function reference(D) {
    var F = facts(D), E = F.E, cut = function (v) { return +v.toPrecision(10); };
    var pair = function (x) { return [cut(x.est), cut(x.se)]; };
    return {
      about: "Written by node _tests/learn/test_m14-did-it-work.js --write; recomputed by the same test on every run. kW for panel 1, MW a year for panel 2; [estimate, standard error].",
      tou: { nOn: E.nOn, nOff: E.nOff, att: cut(E.att), ate: cut(E.ate), naive: pair(E.naive), regSize: cut(E.reg.size), regBoth: cut(E.reg.both),
        beforeAfter: pair(E.ba), did: pair(E.did), cells: [E.cells.onPre, E.cells.onPost, E.cells.offPre, E.cells.offPost].map(cut),
        eventStudy: E.es.map(function (x) { return cut(x.est); }), firstY: cut(F.hh[0].y[0]), lastY: cut(F.hh[F.hh.length - 1].y[23]),
        threats: D.threats.reduce(function (o, x) { o[x.key] = pair(F.threat[x.key].did); return o; }, {}) },
      regions: { nOn: F.R.nOn, nOff: F.R.nOff, did: pair(F.R.did), naive: pair(F.R.naive), eventStudy: F.R.es.map(function (x) { return cut(x.est); }),
        threats: D.regions.threats.reduce(function (o, x) { o[x.key] = pair(F.rthreat[x.key].did); return o; }, {}) }
    };
  }
  // formats: kW with two decimals and a true minus sign; MW a year with one decimal
  function sgn(v, d) { var s = Math.abs(v).toFixed(d); return (v < 0 && +s !== 0 ? "−" : "") + s; }
  function kw(v) { return sgn(v, 2) + " kW"; }
  function mwy(v) { return sgn(v, 1) + " MW a year"; }
  function band(x, f) { var c = ci(x); return f(c[0]).replace(/ .*/, "") + " to " + f(c[1]); }
  // the no-JS version (the test's --write puts it in the page)
  function staticFallback(D) {
    var F = facts(D), E = F.E, T = F.threat, R = F.R, RT = F.rthreat;
    var li = [
      "Simulated: 400 homes, 24 months; " + E.nOn + " opted into a time-of-use tariff from month 13. The true effect on them is " + kw(E.att) + " on the evening peak (known because the data are simulated).",
      "After the start, TOU homes against flat homes: " + kw(E.naive.est) + ". With home size as a control: " + kw(E.reg.size) + ". Engagement, never measured, still differs.",
      "TOU homes after against before: " + kw(E.ba.est) + ", because flat homes also changed by " + kw(F.flatChange) + " (a cooler second summer).",
      "Difference-in-differences: " + kw(E.did.est) + " (about 95% interval " + band(E.did, kw) + "), against the truth " + kw(E.att) + ". Before month 13 the monthly gaps stay within " + kw(E.preMax).replace(" kW", "") + " kW of zero.",
      "Threats move it: already cutting " + kw(T.trend.did.est) + ", early cuts " + kw(T.anticipate.did.est) + ", neighbours copy " + kw(T.spill.did.est) + ", a thermostat offer " + kw(T.bundle.did.est) + ".",
      "If every home were put on the tariff by default, the average effect would be " + kw(E.ate) + ", not " + kw(E.att) + ": those who opt in respond more.",
      "Simulated regions: " + R.nOn + " of 30 adopt a policy in 2021. DiD: " + mwy(R.did.est) + " of new solar per adopting region (truth +10.0). If the policy followed a boom: " + mwy(RT.boom.did.est) + "; if projects moved across the border: " + mwy(RT.border.did.est) + "."
    ];
    return ['<p class="lx-eyebrow">Simulated panels with known effects: what each estimate says</p>', "<ol>" + li.map(function (x) { return "<li>" + x + "</li>"; }).join("\n") + "</ol>",
      '<div class="lx-scroll-x"><table class="lx-facts m14-fbtab">',
      '<thead><tr><th scope="col">Estimate of the tariff\'s effect</th><th scope="col">kW</th></tr></thead>',
      "<tbody>",
      "<tr><td>Truth (homes that opted in)</td><td class=\"n\">" + kw(E.att) + "</td></tr>",
      "<tr><td>Naive after-period gap</td><td class=\"n\">" + kw(E.naive.est) + "</td></tr>",
      "<tr><td>Regression with home size</td><td class=\"n\">" + kw(E.reg.size) + "</td></tr>",
      "<tr><td>Before against after, TOU homes only</td><td class=\"n\">" + kw(E.ba.est) + "</td></tr>",
      "<tr><td>Difference-in-differences</td><td class=\"n\">" + kw(E.did.est) + "</td></tr>",
      "</tbody></table></div>",
      '<p class="lx-hint">With JavaScript on, you build these estimates step by step and break them on purpose.</p>'].join("\n");
  }
  var model = { mulberry32: mulberry32, gauss: gauss, mean: mean, vari: vari, ols: ols, touPanel: touPanel, touEstimates: touEstimates, regress: regress,
    regionPanel: regionPanel, regionEstimates: regionEstimates, didOf: didOf, ci: ci, covers: covers, facts: facts, reference: reference,
    staticFallback: staticFallback, kw: kw, mwy: mwy, sgn: sgn, band: band };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, KEY = "m14-own";
  var COL = { on: "var(--lx-accent)", off: "var(--lx-tier-3)", truth: "var(--lx-good)", est: "var(--lx-ink)", ci: "var(--lx-accent)", bad: "var(--lx-bad)", post: "var(--lx-tier-2)" };
  function rowEl(host) { return H("div", { class: "m14-row" }, host); }
  function readout(host) { return H("p", { class: "m14-out", "aria-live": "polite" }, host); }
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
  function table(host, head, rows) {
    host.innerHTML = "";
    var sc = H("div", { class: "lx-scroll-x" }, host), t = H("table", { class: "lx-mini-table m14-tab" }, sc), hr = H("tr", null, H("thead", null, t)), bd = H("tbody", null, t);
    head.forEach(function (h) { H("th", { scope: "col", text: h }, hr); });
    rows.forEach(function (r) { var tr = H("tr", null, bd); r.forEach(function (c, i) { H(i ? "td" : "th", i ? { text: c, class: "n" } : { scope: "row", text: c }, tr); }); });
  }
  function k2(v) { return sgn(v, 2); }
  // monthly group means, months 1 to 24, the after-period shaded
  function monthsSpec(T, E, aria) {
    var lo = Math.floor(Math.min.apply(null, E.gm.on.concat(E.gm.off)) * 2) / 2, hi = Math.ceil(Math.max.apply(null, E.gm.on.concat(E.gm.off)) * 2) / 2;
    return { x: { min: 0.5, max: 24.5, ticks: [[1, "Month 1", "start"], [6, "6"], [12, "12"], [13, "13"], [18, "18"], [24, "24", "end"]], ticksN: [[1, "1", "start"], [12, "12"], [24, "24", "end"]] },
      y: { min: lo, max: hi, step: 0.5, fmt: function (v) { return v.toFixed(1); }, unit: "kW" }, height: 220, heightN: 190,
      spans: [{ x0: 12.5, x1: 24.5, color: COL.post, op: 0.08, label: "Tariff in force" }],
      lines: [{ pts: E.gm.on.map(function (v, t) { return [t + 1, v]; }), color: COL.on, dots: true }, { pts: E.gm.off.map(function (v, t) { return [t + 1, v]; }), color: COL.off, dash: "5 3", dots: true }],
      legend: [{ label: "TOU homes (" + E.nOn + ")", color: COL.on }, { label: "Flat-tariff homes (" + E.nOff + ")", color: COL.off, dash: "5 3" }],
      aria: aria, text: { head: ["Month", "TOU homes, kW", "Flat homes, kW"], rows: E.gm.on.map(function (v, t) { return ["Month " + (t + 1), v.toFixed(2), E.gm.off[t].toFixed(2)]; }) } };
  }
  // the estimate ladder: each estimate with its about-95% interval against the truth (a horizontal line)
  function ladderSpec(rows, truth, aria) {
    var vals = [truth, 0]; rows.forEach(function (r) { vals.push(r.lo != null ? r.lo : r.est, r.hi != null ? r.hi : r.est); });
    var lo = Math.floor(Math.min.apply(null, vals) * 5) / 5 - 0.2, hi = Math.min(0.2, Math.ceil(Math.max.apply(null, vals) * 5) / 5 + 0.2);
    return { x: { min: 0, max: rows.length + 0.9, ticks: rows.map(function (r, i) { return [i + 0.5, r.short]; }), ticksN: rows.map(function (r, i) { return [i + 0.5, r.shortN || r.short]; }) },
      y: { min: lo, max: hi, step: 0.2, fmt: function (v) { return sgn(v, 1); }, unit: "kW", zero: true }, height: 220, heightN: 200,
      refs: [{ y: truth, label: "Truth " + kw(truth), labelN: k2(truth), color: COL.truth, dash: "6 4", labelColor: "color-mix(in srgb, var(--lx-good) 70%, var(--lx-ink))" }],
      bars: rows.filter(function (r) { return r.lo != null; }).map(function (r) { var i = rows.indexOf(r); return { x0: i + 0.42, x1: i + 0.58, y0: r.lo, y1: r.hi, color: COL.ci, op: 0.35 }; }),
      marks: rows.map(function (r, i) { return { x: i + 0.5, y: r.est, kind: "dot", label: k2(r.est), color: r.ok === false ? COL.bad : COL.est, pos: "above" }; }),
      aria: aria, text: { head: ["Estimate", "kW", "About 95% interval"], rows: rows.map(function (r) { return [r.label, kw(r.est), r.lo != null ? k2(r.lo) + " to " + k2(r.hi) : "–"]; }), note: "Truth: " + kw(truth) + " (simulated)." } };
  }
  // an event study: each period's DiD against the last period before the start, with about-95% intervals
  function eventSpec(es, o) {
    var vals = [0]; es.forEach(function (x) { vals.push(x.est - 1.96 * x.se, x.est + 1.96 * x.se); }); if (o.truth != null) vals.push(o.truth);
    var st = o.step, lo = Math.floor(Math.min.apply(null, vals) / st) * st, hi = Math.ceil(Math.max.apply(null, vals) / st) * st;
    var x0 = es[0].k - 0.5, x1 = es[es.length - 1].k + 1.4;   // room on the right for the truth label
    return { x: { min: x0, max: x1, ticks: o.ticks, ticksN: o.ticksN || o.ticks },
      y: { min: lo, max: hi, step: st, fmt: o.fmt, unit: o.unit, zero: true }, height: 220, heightN: 200,
      spans: [{ x0: -0.5, x1: x1, color: COL.post, op: 0.08, label: o.postLabel }],
      refs: o.truth != null ? [{ y: o.truth, label: o.truthLabel, labelN: o.truthLabelN, color: COL.truth, dash: "6 4", labelColor: "color-mix(in srgb, var(--lx-good) 70%, var(--lx-ink))" }] : [],
      bars: es.filter(function (x) { return !x.ref; }).map(function (x) { return { x0: x.k - 0.12, x1: x.k + 0.12, y0: x.est - 1.96 * x.se, y1: x.est + 1.96 * x.se, color: COL.ci, op: 0.3 }; }),
      lines: [{ pts: es.map(function (x) { return [x.k, x.est]; }), color: COL.est, width: 1.6, dots: true }],
      aria: o.aria, text: { head: [o.kLabel, "Estimate", "About 95% interval"], rows: es.map(function (x) { return [o.kName(x), o.fmtV(x.est), x.ref ? "reference" : o.fmtV(x.est - 1.96 * x.se).replace(/ .*/, "") + " to " + o.fmtV(x.est + 1.96 * x.se)]; }) } };
  }
  function touEvent(T, E, aria, truth) {
    return eventSpec(E.es, { step: 0.1, unit: "kW", fmt: function (v) { return sgn(v, 1); }, truth: truth, truthLabel: "Truth " + kw(truth), truthLabelN: k2(truth), postLabel: "Tariff in force",
      ticks: [[-12, "−12", "start"], [-6, "−6"], [-1, "−1"], [0, "0"], [6, "+6"], [11, "+11", "end"]], aria: aria, kLabel: "Months from the start",
      kName: function (x) { return "Month " + (x.k + T.start + 1) + " (" + (x.k >= 0 ? "+" : "−") + Math.abs(x.k) + ")"; }, fmtV: kw });
  }
  function regionEvent(R, E, aria, truth) {
    return eventSpec(E.es, { step: 5, unit: "MW", fmt: function (v) { return sgn(v, 0); }, truth: truth, truthLabel: "Truth +10 MW", truthLabelN: "+10", postLabel: "Policy in force",
      ticks: E.es.filter(function (x, i) { return i % 2 === 0 || i === E.es.length - 1; }).map(function (x, i, a) { return [x.k, String(x.year), i === 0 ? "start" : i === a.length - 1 ? "end" : "middle"]; }),
      ticksN: [[E.es[0].k, String(E.es[0].year), "start"], [-1, String(R.first + R.start - 1)], [E.es[E.es.length - 1].k, String(E.es[E.es.length - 1].year), "end"]],
      aria: aria, kLabel: "Year", kName: function (x) { return String(x.year); }, fmtV: function (v) { return sgn(v, 1) + " MW"; } });
  }

  LX.mount("m14", function (live, data, root) {
    var D = data.m14_did_it_work, PATH = data.path, T = D.tou, R = D.regions, own = LX.store.get(KEY, {}) || {};
    function keep(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var F = facts(D), E = F.E, truth = F.truth, steps = [], S = {};
    var simLine = "Simulated data: seed " + T.seed + "; truth known by construction.";

    // ---- 1 the question and a guess
    steps.push({
      text: "Simulated: a utility offered 400 homes a [[time-of-use-tariff|time-of-use]] (TOU) tariff from month 13, and " + E.nOn + " opted in. Did it lower their evening peak, and which comparison would you trust?",
      build: function (act, api) {
        LX.Plot(act, { text: "Text version of the chart" }).render(monthsSpec(T, E, "Simulated monthly mean evening peak of TOU and flat-tariff homes, months 1 to 24, the tariff in force from month 13."));
        H("p", { class: "lx-hint", text: simLine }, act);
        LX.Predict(act, { id: "m14-pick", q: "Your pick:", answer: "did", fresh: true, title: false,
          options: [{ value: "naive", label: "TOU against flat homes, after the start" }, { value: "ba", label: "TOU homes, after against before" }, { value: "did", label: "The change in TOU homes against the change in flat homes" }],
          lockText: "Locked in. The next steps score all three against the truth.",
          onPick: function (v) { keep("pick", v); api.done(); api.saw("Every number here is simulated, so the true effect on the " + E.nOn + " homes is known: **" + kw(truth) + "**. Real studies never see this line; here it lets you score each method."); } });
      }
    });

    // ---- 2 describe: the naive gap after the start
    steps.push({
      text: "Describe first: after the start, compare the mean evening peak of TOU homes with flat-tariff homes. Is the gap the tariff's effect?",
      build: function (act, api) {
        var b = H("button", { type: "button", class: "lx-btn small", text: "Compare months 13 to 24" }, rowEl(act)), host = H("div", null, act), out = readout(act);
        b.addEventListener("click", function () {
          host.innerHTML = "";
          LX.Plot(host, { text: "Text version of the chart" }).render(ladderSpec([{ label: "Naive after-period gap", short: "Naive", est: E.naive.est, lo: ci(E.naive)[0], hi: ci(E.naive)[1], ok: covers(E.naive, truth) }], truth, "The naive estimate against the truth."));
          table(H("div", null, host), ["Before the start", "TOU homes", "Flat homes"], [["Home size, thousand sq ft", E.share.onSize.toFixed(2), E.share.offSize.toFixed(2)], ["Engagement (hidden; simulated only)", sgn(E.share.onE, 2), sgn(E.share.offE, 2)]]);
          out.innerHTML = "Gap after the start: <b>" + kw(E.naive.est) + "</b>; truth " + kw(truth) + ".";
          api.done(); api.saw("The gap is " + (E.naive.est / truth).toFixed(1) + " times the truth. Homes that opted in were smaller and more engaged before any tariff: [[selection-bias|selection]], not effect.");
        });
      }
    });

    // ---- 3 regress with controls
    steps.push({
      text: "Add controls: a [[linear-regression|regression]] of each home's after-period peak on a TOU dummy plus what the utility knows. Which controls bring it to the truth?",
      build: function (act, api) {
        var use = { size: false, ac: false }, tried = {};
        H("p", { class: "lx-hint", text: "Always in: TOU or not. Add:" }, act);
        var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Controls to add" }, act);
        LX.Toggle(tg, { label: "Home size", onChange: function (on) { use.size = on; } });
        LX.Toggle(tg, { label: "Air conditioning", onChange: function (on) { use.ac = on; } });
        var b = H("button", { type: "button", class: "lx-btn small", text: "Fit" }, rowEl(act)), tb = H("div", null, act), out = readout(act);
        function val(u) { return u.size && u.ac ? E.reg.both : u.size ? E.reg.size : u.ac ? E.reg.ac : E.naive.est; }
        function name(u) { return u.size && u.ac ? "Size and air conditioning" : u.size ? "Home size" : u.ac ? "Air conditioning" : "No controls"; }
        b.addEventListener("click", function () {
          var k = name(use); tried[k] = val(use);
          table(tb, ["Controls", "TOU coefficient", "Against the truth"], Object.keys(tried).map(function (n) { return [n, kw(tried[n]), (tried[n] / truth).toFixed(1) + " ×"]; }));
          out.innerHTML = k + ": <b>" + kw(val(use)) + "</b>.";
          if (Object.keys(tried).length >= 3 || (use.size && use.ac)) { api.done(); api.saw("Home size moves it to " + kw(E.reg.size) + "; air conditioning moves it little, since it did not drive sign-up. Engagement did, and no meter records it: you cannot control for what you cannot see."); }
          else api.saw("Try another set of controls.", true);
        });
        out.textContent = "Pick controls, then fit.";
      }
    });

    // ---- 4 before against after
    steps.push({
      text: "Use each home as its own comparison: TOU homes after the start against the same homes before. What else changed between year 1 and year 2?",
      build: function (act, api) {
        var b = H("button", { type: "button", class: "lx-btn small", text: "Compare before and after" }, rowEl(act)), host = H("div", null, act), out = readout(act);
        b.addEventListener("click", function () {
          host.innerHTML = "";
          table(H("div", null, host), ["Mean evening peak", "Months 1–12", "Months 13–24", "Change"], [["TOU homes", E.cells.onPre.toFixed(2) + " kW", E.cells.onPost.toFixed(2) + " kW", kw(E.cells.onPost - E.cells.onPre)], ["Flat-tariff homes", E.cells.offPre.toFixed(2) + " kW", E.cells.offPost.toFixed(2) + " kW", kw(F.flatChange)]]);
          out.innerHTML = "Before against after: <b>" + kw(E.ba.est) + "</b>; truth " + kw(truth) + ".";
          api.done(); api.saw("Flat homes, with no new tariff, changed by " + kw(F.flatChange) + ": the second summer was cooler (simulated). Before–after credits the tariff with the weather.");
        });
      }
    });

    // ---- 5 difference-in-differences, computed by the reader
    steps.push({
      text: "[[difference-in-differences|Difference-in-differences]]: subtract the flat homes' change from the TOU homes' change. Type the result, from the table in step 4.",
      build: function (act, api) {
        var want = Math.round(E.did.est * 100) / 100;
        H("p", { class: "lx-hint", text: "TOU change " + kw(E.cells.onPost - E.cells.onPre) + "; flat change " + kw(F.flatChange) + "." }, act);
        var host = H("div", null, act);
        LX.NumAnswer(act, { label: "TOU change − flat change", unit: "kW", width: "7em", onCheck: function (v) {
          if (Math.abs(v - want) > 0.011) { api.saw("Not quite: " + kw(E.cells.onPost - E.cells.onPre) + " − (" + kw(F.flatChange) + ") = ?", true); return; }
          host.innerHTML = "";
          LX.Plot(host, { text: "Text version of the chart" }).render(ladderSpec([
            { label: "Naive after-period gap", short: "Naive", est: E.naive.est, lo: ci(E.naive)[0], hi: ci(E.naive)[1], ok: covers(E.naive, truth) },
            { label: "Regression with home size", short: "Controls", shortN: "Reg.", est: E.reg.size },
            { label: "Before against after", short: "Before–after", shortN: "Pre–post", est: E.ba.est, lo: ci(E.ba)[0], hi: ci(E.ba)[1], ok: covers(E.ba, truth) },
            { label: "Difference-in-differences", short: "DiD", est: E.did.est, lo: ci(E.did)[0], hi: ci(E.did)[1], ok: covers(E.did, truth) }], truth, "Four estimates of the tariff's effect against the truth."));
          api.done(); api.saw("DiD: **" + kw(E.did.est) + "**, about 95% interval " + band(E.did, kw) + ", around the truth " + kw(truth) + ". It removes fixed differences between homes and changes common to both groups.");
        } });
      }
    });

    // ---- 6 parallel trends and the event study
    steps.push({
      text: "DiD assumes [[parallel-trends|parallel trends]]: without the tariff, both groups would have moved alike. An [[event-study|event study]] checks the months before: do they look parallel?",
      build: function (act, api) {
        LX.Plot(act, { text: "Text version of the chart" }).render(touEvent(T, E, "Event study: each month's difference-in-differences against month 12, with about-95% intervals.", truth));
        var out = readout(act);
        seg(rowEl(act), ["Parallel before the start", "Not parallel"], -1, function (i) {
          if (i === 0) { api.done(); api.saw("Before month 13 every monthly gap stays within " + kw(E.preMax) + " of zero, inside its interval. Plausible, never proven: the after-period counterfactual is still unseen."); }
          else api.saw("Look again: before month 13, are the dots near zero, with zero inside each interval?", true);
        }, "Are the months before parallel?");
        out.textContent = "";
      }
    });

    // ---- 7 break it
    steps.push({
      text: "Now break it: each threat re-simulates the same homes with one change, and the truth stays " + kw(truth) + ". Try at least three and watch DiD and the months before.",
      build: function (act, api) {
        var keys = [null].concat(D.threats.map(function (x) { return x.key; })), labels = ["None"].concat(D.threats.map(function (x) { return x.short; })), seen = {};
        seg(rowEl(act), labels, 0, function (i) { draw(i); }, "Threat");
        var note = H("p", { class: "lx-hint" }, act), host = H("div", null, act), tb = H("div", null, act), out = readout(act);
        function draw(i) {
          var k = keys[i], X = k ? F.threat[k] : E, th = k ? D.threats[i - 1] : null;
          if (k) seen[k] = 1;
          note.textContent = th ? th.label + ": " + th.text : "No threat: the panel of steps 1 to 6.";
          host.innerHTML = "";
          LX.Plot(host, { text: "Text version of the chart" }).render(touEvent(T, X, "Event study with " + (th ? th.label.toLowerCase() : "no threat") + ".", truth));
          table(tb, ["Threat", "DiD", "Interval", "Holds the truth?"], [["None", kw(E.did.est), band(E.did, kw), covers(E.did, truth) ? "yes" : "no"]].concat(D.threats.filter(function (x) { return seen[x.key]; }).map(function (x) { var Y = F.threat[x.key].did; return [x.short, kw(Y.est), band(Y, kw), covers(Y, truth) ? "yes" : "no"]; })));
          out.innerHTML = "DiD <b>" + kw(X.did.est) + "</b> (" + band(X.did, kw) + "); truth " + kw(truth) + ".";
          var n = Object.keys(seen).length;
          if (n >= 3) { api.done(); api.saw("None of these intervals holds the truth. Only a trend that starts before month 13 (already cutting, early cuts) shows in the months before; spillovers and a second change hide."); }
          else api.saw("Threats tried: " + n + " of at least 3.", true);
        }
        S.draw7 = draw;
        draw(0);
      }
    });

    // ---- 8 who is the effect for
    steps.push({
      text: "DiD estimates the effect on the homes that opted in. If the utility put all 400 homes on the tariff by default, what would the average cut per home be?",
      build: function (act, api) {
        LX.Predict(act, { id: "m14-default", q: "Per home, by default:", answer: "smaller", fresh: true, title: false,
          options: [{ value: "larger", label: "Larger" }, { value: "same", label: "About the same" }, { value: "smaller", label: "Smaller" }],
          onPick: function () { api.done(); api.saw("Smaller: " + kw(E.ate) + " per home on average, against " + kw(truth) + " for those who chose it; engaged owners respond more. A result holds for the group it was measured on."); } });
      }
    });

    // ---- 9 regions: a policy and investment
    steps.push({
      text: "Second panel, also simulated: " + F.R.nOn + " of 30 regions adopt a solar policy in 2021, with a true effect of +10 MW a year of new solar in each. Try DiD with each threat.",
      build: function (act, api) {
        var keys = [null].concat(R.threats.map(function (x) { return x.key; })), labels = ["None", "Followed a boom", "Moved across the border"], seen = {};
        seg(rowEl(act), labels, 0, function (i) { draw(i); }, "Threat");
        var note = H("p", { class: "lx-hint" }, act), host = H("div", null, act), out = readout(act);
        function draw(i) {
          var k = keys[i], X = k ? F.rthreat[k] : F.R, th = k ? R.threats[i - 1] : null;
          seen[i] = 1;
          note.textContent = th ? th.text : "No threat. Adopting regions are sunnier, so their levels differ; DiD removes fixed differences.";
          host.innerHTML = "";
          LX.Plot(host, { text: "Text version of the chart" }).render(regionEvent(R, X, "Event study for the regions: each year's difference-in-differences against 2020, with about-95% intervals.", R.effect));
          var t = "DiD <b>" + mwy(X.did.est) + "</b> per adopting region (" + band(X.did, mwy) + "); truth +10.0.";
          if (k === "border") t += " Claimed in all " + X.nOn + ": " + Math.round(F.border.claimed) + " MW a year; the simulation's net change across all 30 regions: " + Math.round(F.border.net) + " MW a year.";
          out.innerHTML = t;
          if (seen[0] && seen[1] && seen[2]) { api.done(); api.saw("A boom shows in the years before 2021. Projects that moved across the border do not: they shrink the comparison group, so DiD reads " + mwy(F.rthreat.border.did.est) + " where the net change was " + Math.round(F.border.net) + " MW a year in all."); }
          else api.saw("Try all three.", true);
        }
        S.draw9 = draw;
        draw(0);
      }
    });

    // ---- 10 name the threat
    steps.push({
      text: "Before trusting an estimate, list its threats to validity: [[selection-bias|selection]], [[confounding|confounding]], [[spillover-effect|spillover]], [[anticipation-effect|anticipation]]. Name the main one in each of four short cases.",
      build: function (act, api) {
        var kinds = Object.keys(D.kinds), marks = {}, out = readout(act);
        D.classify.forEach(function (c, n) {
          var w = H("div", { class: "m14-case" }, act);
          H("p", { text: (n + 1) + ". " + c.text }, w);
          seg(w, kinds.map(function (k) { return D.kinds[k]; }), -1, function (i) { marks[c.id] = kinds[i]; check(); }, "Threat in case " + (n + 1));
        });
        act.appendChild(out);
        function check() {
          var n = Object.keys(marks).length, right = D.classify.filter(function (c) { return marks[c.id] === c.answer; }).length;
          out.textContent = "Named " + n + " of " + D.classify.length + (n === D.classify.length ? "; " + right + " right." : ".");
          if (right === D.classify.length) { api.done(); api.saw("Selection, confounding, spillover, anticipation: four reasons a comparison group stops being the counterfactual. Write them down before the estimate, not after."); }
          else if (n === D.classify.length) api.saw("Not all right yet. Ask: who chose, what else changed, who else was affected, and when did people react?", true);
        }
      }
    });

    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "m14-steps", steps: steps });
    function clickIn(sel, i) { var b = cardsHost.querySelectorAll(sel)[i || 0]; if (b) b.click(); }
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 5 : m ? Math.min(steps.length, +m[1]) : 0;
      if (!n) return null;
      cards.go(n - 1);
      if (n === 1) clickIn(".lx-step-act .lx-choice", 2);
      if (n === 2 || n === 4) clickIn(".lx-step-act .m14-row .lx-btn");
      if (n === 3) { clickIn(".lx-step-act .lx-toggles button", 0); clickIn(".lx-step-act .m14-row .lx-btn"); }
      if (n === 5) { var inp = cardsHost.querySelector(".lx-step-act input"); if (inp) { inp.value = k2(E.did.est).replace("−", "-"); clickIn(".lx-step-act .lx-na button"); } }
      if (n === 6) clickIn(".lx-step-act .lx-seg button", 0);
      if (n === 7) [1, 3, 4].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 8) clickIn(".lx-step-act .lx-choice", 2);
      if (n === 9) [1, 2].forEach(function (i) { clickIn(".lx-step-act .lx-seg button", i); });
      if (n === 10) D.classify.forEach(function (c, k) { var segs = cardsHost.querySelectorAll(".lx-step-act .m14-case .lx-seg"); var b = segs[k] && segs[k].querySelectorAll("button")[Object.keys(D.kinds).indexOf(c.answer)]; if (b) b.click(); });
      return { view: state };
    }, cards);
    explain(D, F, PATH);
  });

  // ---------------------------------------------------------------- explain layer: a flowchart of the checks, the
  // designs compared, and where the numbers hold
  function explain(D, F, PATH) {
    var x = document.getElementById("m14-explain"); if (!x) return;
    x.innerHTML = "";
    var E = F.E, truth = F.truth, T = F.threat;
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "Before you trust an effect", lede: "The reference case: the simulated tariff panel. Trace three cases.",
      nodes: {
        q: { t: "Question and counterfactual", tN: ["Question and", "counterfactual"], s: "what would have happened?", sN: "without it?", k: "end" },
        d: { t: "Who is compared with whom?", tN: ["Who against", "whom?"] },
        rnd: { t: "Assigned at random?", tN: ["Assigned at", "random?"], k: "q" },
        did: { t: "Two groups, before and after", tN: ["Before and", "after"], s: "DiD", sN: "DiD" },
        pt: { t: "Parallel before?", tN: ["Parallel", "before?"], k: "q" },
        stop: { t: "Find a better comparison", tN: ["Find a better", "comparison"], k: "end" },
        thr: { t: "List the threats", tN: ["List the", "threats"], s: "selection · confounding · spillover · anticipation", sN: "four kinds" },
        rep: { t: "Report effect, interval, for whom", tN: ["Effect, interval,", "for whom"], k: "end" }
      },
      cols: 3, at: { q: [1, 0], d: [1, 1], rnd: [1, 2], did: [0, 3], pt: [0, 4], stop: [0, 5], thr: [1, 5], rep: [1, 6] },
      colsN: 2, atN: { q: [0, 0], d: [0, 1], rnd: [0, 2], did: [0, 3], pt: [0, 4], stop: [0, 5], thr: [1, 5], rep: [1, 6] },
      edges: [["q", "d"], ["d", "rnd"], ["rnd", "thr", "yes"], ["rnd", "did", "no"], ["did", "pt"], ["pt", "thr", "yes"], ["pt", "stop", "no"], ["thr", "rep"]],
      traces: [
        { label: "This tariff, as simulated", path: ["q", "d", "rnd", "did", "pt", "thr", "rep"], text: "DiD " + kw(E.did.est) + " (" + band(E.did, kw) + ") for the " + E.nOn + " homes that opted in; truth " + kw(truth) + "." },
        { label: "Already cutting", path: ["q", "d", "rnd", "did", "pt", "stop"], text: "The months before drift: DiD " + kw(T.trend.did.est) + " would overstate the cut." },
        { label: "A randomized trial", path: ["q", "d", "rnd", "thr", "rep"], text: "Chance decides who gets the tariff, so selection is gone; spillovers and drop-outs can still bias it." }
      ], sel: 0
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Five ways to estimate an effect", text: true,
      columns: [{ key: "name", label: "Design", main: true }, { key: "cmp", label: "Compares" }, { key: "asm", label: "Assumes" }, { key: "here", label: "On this page", phoneHide: true }],
      rows: [
        { key: "naive", name: "Naive comparison", cmp: "users against non-users, after", asm: "the groups were alike", here: kw(E.naive.est) },
        { key: "reg", name: "Regression with controls", cmp: "the same, holding measured traits fixed", asm: "no unmeasured differences", here: kw(E.reg.size) + " (home size)" },
        { key: "ba", name: "Before–after", cmp: "users after against before", asm: "nothing else changed", here: kw(E.ba.est) },
        { key: "did", name: "Difference-in-differences", cmp: "change against change", asm: "parallel trends, no spillover", here: kw(E.did.est) },
        { key: "rct", name: "Randomized trial", cmp: "assigned against not assigned", asm: "random assignment kept", here: "not simulated" }
      ],
      sorts: [{ label: "As listed", order: ["naive", "reg", "ba", "did", "rct"], note: "Truth on this page: " + kw(truth) + ". Each design is only as good as its assumption." }]
    });
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where this lesson's numbers hold",
      holds: ["two simulated panels with known effects (seeds " + D.tou.seed + " and " + D.regions.seed + "), generated in your browser;", "one start date for every treated unit (no staggered adoption);", "intervals of ±1.96 standard errors of home-level or region-level changes (clustered by unit)."],
      leaves: ["real households, tariffs or regions: only the DOE studies cited below are real;", "other seeds: one draw of many, so the notebook redraws 200;", "staggered start dates, which need newer estimators;", "attrition, measurement error and multiple testing."],
      source: "Data: simulated (assets/learn/data/m14-did-it-work.json); real-world evidence: DOE, November 2016." });
  }
})();
