// cf8-power-curves-from-scarce-data.js — Case file CF8, "Learning a wind turbine's power curve from scarce data" (case
// form, wave W4, 2026-11-05; a draft in learn/_drafts/ until its review fixes are done).
//
// Data: assets/learn/data/cf8-power-curves-from-scarce-data.json: the studies' dated steps (LX.Timeline), where the
// conference result holds (LX.Boundary) and the toy's settings. The research text in the data file is approved excerpt
// wording (reports/learn/excerpts_for_approval.md, E12 and E13); this script adds none of its own.
//
// The idea (illustrative; lesson M9's invented turbine and records, assets/learn/data/m09-surrogates-uq.json, not the
// study's data): a band on a power curve becomes a band on the turbine's capacity factor. Lesson M9's Gaussian-process
// fits (LX.M9, from m09-surrogates-uq.js, which the page loads first: one source, the records alone; two sources, the
// maker's curve plus a GP for the gap; settings stored by M9) are averaged over a Weibull wind distribution
// (k 2, c 8 m/s) on 3-20 m/s in 0.1 m/s steps (trapezoid weights w_j = pdf(v_j) x 0.1, halved at the ends):
//   capacity factor   CF = sum_j w_j m(v_j) / 2,000 kW                (below 3 m/s the turbine makes nothing; hours above
//                                                                      20 m/s, 0.2% of the year, count as nothing too)
//   its uncertainty   var(CF) = w^T Sigma w / 2,000^2, Sigma the posterior covariance of the curve (not of single records:
//                     the capacity factor averages the curve); 90% band CF +/- 1.645 sd
//   for reference     the maker's curve and the field curve (hidden from the fits) averaged the same way
// Every number on the page is checked by _tests/learn/test_cf8-power-curves-from-scarce-data.js.
(function () {
  "use strict";
  var M9 = (typeof window !== "undefined" && window.LX && window.LX.M9) || require("./m09-surrogates-uq.js");

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function grid(I) { var xs = [], n = Math.round((I.grid.to - I.grid.from) / I.grid.step); for (var j = 0; j <= n; j++) xs.push(Math.round((I.grid.from + j * I.grid.step) * 1000) / 1000); return xs; }
  function weibullPdf(W, v) { return W.k / W.c * Math.pow(v / W.c, W.k - 1) * Math.exp(-Math.pow(v / W.c, W.k)); }
  function weights(I) { var xs = grid(I); return xs.map(function (v, j) { return weibullPdf(I.weibull, v) * I.grid.step * (j === 0 || j === xs.length - 1 ? 0.5 : 1); }); }
  // a curve function's capacity factor
  function cfOf(I, rated, f) { var xs = grid(I), w = weights(I), s = 0; xs.forEach(function (v, j) { s += w[j] * f(v); }); return s / rated; }
  // a fit's capacity factor and its 90% band (fraction of a year)
  function cfFit(I, M9D, n, two) {
    var F = M9.fitStored(M9D, n, two), xs = grid(I), w = weights(I), Sg = M9.covariance(F, xs), m = 0, v = 0, a, b;
    xs.forEach(function (x, j) { m += w[j] * M9.predict(F, x).m; });
    for (a = 0; a < xs.length; a++) for (b = 0; b < xs.length; b++) v += w[a] * w[b] * Sg[a][b];
    var R = M9D.turbine.rated, sd = Math.sqrt(Math.max(0, v)) / R, z = M9.ZL[I.level];
    return { n: n, two: !!two, cf: m / R, sd: sd, lo: m / R - z * sd, hi: m / R + z * sd };
  }
  function all(I, M9D) {
    var T = M9D.turbine, out = { maker: cfOf(I, T.rated, function (v) { return M9.maker(T, v); }), field: cfOf(I, T.rated, function (v) { return M9.field(T, v); }), fits: {} };
    I.sweep.forEach(function (n) { out.fits[n] = [cfFit(I, M9D, n, false), cfFit(I, M9D, n, true)]; });
    out.massAbove = Math.exp(-Math.pow(I.grid.to / I.weibull.c, I.weibull.k));
    return out;
  }
  function pts(f) { return (100 * f).toFixed(1); }
  function staticBoundary(b) {
    var ul = function (a) { return "<ul>" + a.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>"; };
    return "<p class=\"lx-eyebrow\">" + b.title + "</p><dl class=\"lx-ideas\"><dt>It holds when</dt><dd>" + ul(b.holds) + "</dd><dt>It leaves out</dt><dd>" + ul(b.leaves) + "</dd></dl><p class=\"lx-hint\">" + b.source + "</p>";
  }
  // the no-JS version of the idea
  function staticIdea(I, M9D) {
    var A = all(I, M9D);
    var rows = I.sweep.map(function (n) { var f = A.fits[n]; return "<tr><td>" + n + "</td><td class=\"n\">" + pts(f[0].cf) + "% ± " + pts(f[0].hi - f[0].cf) + "</td><td class=\"n\">" + pts(f[1].cf) + "% ± " + pts(f[1].hi - f[1].cf) + "</td></tr>"; }).join("");
    return "<p class=\"lx-eyebrow\">" + I.title + "</p><p>" + I.note + " The maker's curve gives a capacity factor of " + pts(A.maker) + "%; the field curve, hidden from the fits, " + pts(A.field) + "%.</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table cf8-res\"><caption class=\"lx-hint\">Capacity factor with its 90% band, in percentage points</caption><thead><tr><th scope=\"col\">Records</th><th scope=\"col\">One source</th><th scope=\"col\">Two sources</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  }
  var model = { grid: grid, weibullPdf: weibullPdf, weights: weights, cfOf: cfOf, cfFit: cfFit, all: all, pts: pts, staticBoundary: staticBoundary, staticIdea: staticIdea };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, KEY = "cf8_power_curves_from_scarce_data";
  LX.mount("cf8", function (live, data) {
    var D = data[KEY];
    LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline);
    var x = document.getElementById("cf8-explain");
    if (x) { x.innerHTML = ""; x.classList.add("is-live"); LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary); }
  });
  LX.mount("cf8-idea", function (live, data, root) {
    var I = data[KEY].idea, M9D = data.m09_surrogates_uq, A = all(I, M9D), St = { i: 0, two: false }, acted = 0;
    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: I.title }, H("div", { class: "lx-stage-head" }, stage));
    H("p", { class: "lx-hint", text: I.note }, stage);
    var ctl = H("div", { class: "lx-ctls" }, stage);
    var sl = LX.Slider(H("div", null, ctl), { label: "Records", color: "var(--lx-ink)", min: 0, max: I.sweep.length - 1, step: 1, value: 0, fmt: function (i) { return I.sweep[i] + " records"; }, onChange: function (i) { St.i = i; acted++; paint(); } });
    var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Sources" }, ctl), { label: "Add the maker's curve as a second source", on: false, onChange: function (on) { St.two = on; acted++; paint(); } });
    var P = LX.Plot(stage, { text: "Text version of the chart" }), status = H("div", { class: "lx-stage-status", "aria-live": "polite" }, stage);
    function paint() {
      var n = I.sweep[St.i], f = A.fits[n], show = St.two ? [0, 1] : [0], col = ["var(--lx-tier-3)", "var(--lx-accent)"], lab = ["One source", "Two sources"];
      P.render({ x: { min: 28, max: 36, ticks: [[28, "28%", "start"], [30, "30%"], [32, "32%"], [34, "34%"], [36, "36%", "end"]] }, y: { min: 0, max: 2, ticks: [] }, height: 140, heightN: 140, ml: 14,
                 bars: show.map(function (k) { return { x0: 100 * f[k].lo, x1: 100 * f[k].hi, y0: 1.35 - 0.6 * k, y1: 1.65 - 0.6 * k, color: col[k], op: 0.55, rx: 3 }; })
                   .concat([[A.maker, "var(--lx-wind)"], [A.field, "var(--lx-ink)"]].map(function (r) { return { x0: 100 * r[0] - 0.025, x1: 100 * r[0] + 0.025, y0: 0, y1: 2, color: r[1], op: 0.9 }; })),   // the two reference values as thin vertical bars
                 marks: show.map(function (k) { return { x: 100 * f[k].cf, y: 1.5 - 0.6 * k, kind: "dot", color: col[k] }; }),
                 legend: show.map(function (k) { return { label: lab[k] + ", 90% band", color: col[k] }; }).concat([{ label: "Maker's curve, " + pts(A.maker) + "%", color: "var(--lx-wind)" }, { label: "Field curve (hidden), " + pts(A.field) + "%", color: "var(--lx-ink)" }]),
                 aria: "The capacity factor estimated from " + n + " records with its 90% band, against the maker's and the field curve's.",
                 text: { head: ["Estimate", "Capacity factor", "90% band"], rows: [["Maker's curve", pts(A.maker) + "%", "–"], ["Field curve (hidden)", pts(A.field) + "%", "–"]].concat(show.map(function (k) { return [lab[k] + ", " + n + " records", pts(f[k].cf) + "%", pts(f[k].lo) + "% to " + pts(f[k].hi) + "%"]; })) } });
      status.innerHTML = show.map(function (k) { return "<p>" + lab[k] + ", " + n + " records: <b>" + pts(f[k].cf) + "% ± " + pts(f[k].hi - f[k].cf) + " points</b>.</p>"; }).join("") +
        (St.two ? "<p>The maker's curve narrows the band by " + Math.round(100 * (1 - (f[1].hi - f[1].lo) / (f[0].hi - f[0].lo))) + "% here; the field curve's " + pts(A.field) + "% lies inside both.</p>" : "<p>A band on the curve is a band on the year's energy.</p>");
    }
    paint();
    LX.demo(root, function (state) {
      if (state === "mid") { St.two = true; tg.set(true); sl.set(0); St.i = 0; paint(); return { view: "two sources, 16 records" }; }
      return null;
    });
  });
})();
