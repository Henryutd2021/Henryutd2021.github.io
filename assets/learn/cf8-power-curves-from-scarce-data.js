// cf8-power-curves-from-scarce-data.js — Case file CF8, "Learning a wind turbine's power curve from scarce data" (case
// form, wave W4, 2026-11-05; live after its review fixes, learn-w4-fix-e).
//
// Data: assets/learn/data/cf8-power-curves-from-scarce-data.json: the studies' dated steps (LX.Timeline), where the
// conference result holds (LX.Boundary) and the toy's settings and words. The research text in the data file is approved
// excerpt wording (reports/learn/excerpts_for_approval.md, E12 and E13); this script adds none of its own. Each timeline
// event of the related project (E13) carries the approved acknowledgement as its `footer`, drawn visibly under the event
// in the live timeline and in the no-JS list (LX.Timeline itself has no footer field, so this script adds it).
//
// The idea (illustrative; lesson M9's invented turbine and records, assets/learn/data/m09-surrogates-uq.json, not the
// study's data): a band on a power curve becomes a band on the turbine's expected capacity factor. Lesson M9's
// Gaussian-process fits (LX.M9: components/gp.js in the learn.js bundle; one source, the records alone; two sources, the
// maker's curve plus a GP for the gap; settings stored by M9) are averaged over a Weibull wind distribution (k 2,
// c 8 m/s) on 3-20 m/s in 0.1 m/s steps (trapezoid weights w_j = pdf(v_j) x 0.1, halved at the ends):
//   capacity factor   CF = sum_j w_j m(v_j) / 2,000 kW                (below 3 m/s the turbine makes nothing; hours above
//                                                                      20 m/s, 0.2% of the year, count as nothing too)
//   its uncertainty   var(CF) = w^T Sigma w / 2,000^2, Sigma the posterior covariance of the curve (not of single records:
//                     the capacity factor averages the curve); 90% band CF +/- 1.645 sd. So the band is the fitted curve's
//                     uncertainty only, with the wind mix and the fit's settings held fixed (review CF8 #1): it is not a
//                     band for next year's energy, which weather and operation also move.
//   for reference     the maker's curve and the field curve (hidden from the fits) averaged the same way
//   the averaging     bins(): the same weights grouped into wind-speed bins, with the maker's mean power in each, so the
//                     contributions add up to the maker's capacity factor (review CF8 #3)
// The explainer's text version (review CF8 #7): explainerRows() reads explainer:uq-mfgpr's own exported model (its
// synthetic data) at three slider settings, by wind-speed region; the test writes it into the page.
// Every number on the page is checked by _tests/learn/test_cf8-power-curves-from-scarce-data.js.
(function () {
  "use strict";
  var M9 = (typeof window !== "undefined" && window.LX && window.LX.M9) || require("./components/gp.js");

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function grid(I) { var xs = [], n = Math.round((I.grid.to - I.grid.from) / I.grid.step); for (var j = 0; j <= n; j++) xs.push(Math.round((I.grid.from + j * I.grid.step) * 1000) / 1000); return xs; }
  function weibullPdf(W, v) { return W.k / W.c * Math.pow(v / W.c, W.k - 1) * Math.exp(-Math.pow(v / W.c, W.k)); }
  function weibullCdf(W, v) { return 1 - Math.exp(-Math.pow(v / W.c, W.k)); }
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
    out.massAbove = 1 - weibullCdf(I.weibull, I.grid.to);
    return out;
  }
  function pts(f) { return (100 * f).toFixed(1); }
  function kw(v) { return Math.round(v).toLocaleString("en-US") + " kW"; }
  // the averaging step: the year's hours in wind-speed bins (I.bins edges; the last bin includes its upper edge), each
  // with its share of hours and the maker's mean power there; contrib = share x power / rated, in fractions of a year
  function bins(I, M9D) {
    var T = M9D.turbine, xs = grid(I), w = weights(I), E = I.bins, out = [];
    out.push({ label: "below " + I.grid.from + " m/s", share: weibullCdf(I.weibull, I.grid.from), power: 0, contrib: 0 });
    for (var b = 0; b < E.length - 1; b++) {
      var sw = 0, sp = 0;
      xs.forEach(function (v, j) { if (v >= E[b] && (v < E[b + 1] || (b === E.length - 2 && v <= E[b + 1]))) { sw += w[j]; sp += w[j] * M9.maker(T, v); } });
      out.push({ label: E[b] + "–" + E[b + 1] + " m/s", share: sw, power: sp / sw, contrib: sp / T.rated });
    }
    out.push({ label: "above " + I.grid.to + " m/s", share: 1 - weibullCdf(I.weibull, I.grid.to), power: null, contrib: 0 });
    return out;
  }
  // the words around the averaging table (from the data file, with the numbers filled in)
  function binsWords(I, M9D) {
    var A = all(I, M9D);
    return { how: I.how, mix: I.mix.replace("{above}", pts(A.massAbove) + "%"), caption: I.binsCaption };
  }
  function binsHTML(I, M9D) {
    var A = all(I, M9D), B = bins(I, M9D), Wd = binsWords(I, M9D);
    var rows = B.map(function (r) {
      return "<tr><th scope=\"row\">" + esc(r.label) + "</th><td class=\"n\">" + pts(r.share) + "%</td><td class=\"n\">" + (r.power == null ? "counted as 0" : kw(r.power)) + "</td><td class=\"n\">" + pts(r.contrib) + "</td></tr>";
    }).join("");
    return "<p class=\"lx-hint\">" + esc(Wd.how) + "</p><p class=\"lx-hint\">" + esc(Wd.mix) + "</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table cf8-bins\"><caption class=\"lx-hint\">" + esc(Wd.caption) + "</caption><thead><tr><th scope=\"col\">Wind speed</th><th scope=\"col\">Share of the year's hours</th><th scope=\"col\">Maker's curve, mean power</th><th scope=\"col\">Adds to the capacity factor, points</th></tr></thead><tbody>" +
      rows + "<tr><th scope=\"row\">All hours</th><td class=\"n\">100%</td><td></td><td class=\"n\">" + pts(A.maker) + "</td></tr></tbody></table></div>";
  }
  function staticBoundary(b) {
    var ul = function (a) { return "<ul>" + a.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>"; };
    return "<p class=\"lx-eyebrow\">" + b.title + "</p><dl class=\"lx-ideas\"><dt>It holds when</dt><dd>" + ul(b.holds) + "</dd><dt>It leaves out</dt><dd>" + ul(b.leaves) + "</dd></dl><p class=\"lx-hint\">" + b.source + "</p>";
  }
  // the no-JS timeline: LX.Timeline's own static list, with each event's footer (the E13 acknowledgement) under it
  function staticTimeline(TL, events) {
    return "<ol class=\"lx-tl-static\">" + TL.sortEvents(events).map(function (e) {
      var li = TL.staticHTML([e]).replace(/^<ol class="lx-tl-static">/, "").replace(/<\/ol>$/, "");
      return e.footer ? li.replace(/<\/li>$/, "<p class=\"lx-hint lx-tl-foot\">" + esc(e.footer) + "</p></li>") : li;
    }).join("") + "</ol>";
  }
  // the no-JS version of the idea
  function staticIdea(I, M9D) {
    var A = all(I, M9D);
    var rows = I.sweep.map(function (n) { var f = A.fits[n]; return "<tr><td>" + n + "</td><td class=\"n\">" + pts(f[0].cf) + "% ± " + pts(f[0].hi - f[0].cf) + "</td><td class=\"n\">" + pts(f[1].cf) + "% ± " + pts(f[1].hi - f[1].cf) + "</td></tr>"; }).join("");
    return "<p class=\"lx-eyebrow\">" + I.title + "</p><p>" + I.note + " The maker's curve gives a capacity factor of " + pts(A.maker) + "%; the field curve, hidden from the fits, " + pts(A.field) + "%.</p>" +
      "<p class=\"lx-hint\">" + esc(I.scope) + "</p><p class=\"lx-hint\">" + esc(I.levelNote) + "</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table cf8-res\"><caption class=\"lx-hint\">" + esc(I.caption) + "</caption><thead><tr><th scope=\"col\">Records</th><th scope=\"col\">One source</th><th scope=\"col\">Two sources</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      "<p class=\"lx-eyebrow\">" + esc(I.binsTitle) + "</p>" + binsHTML(I, M9D);
  }
  // the explainer's text version: explainer:uq-mfgpr's model (its own synthetic turbine, 95% band of the curve) at the
  // slider settings I.explainer.n, by wind-speed region I.explainer.regions: measured points there, then the true curve
  // (hidden from both models), the data-only and the curve-plus-data estimates with their band, at the region's centre
  function explainerRows(EXM, X) {
    var out = [];
    X.n.forEach(function (n) {
      var cs = X.regions.map(function (r) { return (r[0] + r[1]) / 2; }), m = EXM.model({ n: n, xs: cs });
      X.regions.forEach(function (r, k) {
        var last = k === X.regions.length - 1, c = m.points.x.filter(function (v) { return v >= r[0] && (v < r[1] || (last && v <= r[1])); }).length;
        out.push([String(n), r[0] + "–" + r[1] + " m/s", String(c), kw(EXM.truth(cs[k])), kw(m.sf.mean[k]) + " ± " + Math.round(1.96 * m.sf.sd[k]), kw(m.mf.mean[k]) + " ± " + Math.round(1.96 * m.mf.sd[k])]);
      });
    });
    return out;
  }
  function explainerHTML(EXM, X) {
    var head = ["Measured points", "Wind speed", "Points there", "True curve (hidden)", "Data only, 95% band", "Curve + data, 95% band"];
    return "<details class=\"lx-textalt\"><summary>" + esc(X.summary) + "</summary><div><p class=\"lx-hint\">" + esc(X.note) + "</p><div class=\"lx-scroll-x\"><table class=\"lx-mini-table cf8-ex\"><thead><tr>" +
      head.map(function (h) { return "<th scope=\"col\">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      explainerRows(EXM, X).map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></div></details>";
  }
  var model = { grid: grid, weibullPdf: weibullPdf, weibullCdf: weibullCdf, weights: weights, cfOf: cfOf, cfFit: cfFit, all: all, pts: pts, bins: bins, binsWords: binsWords, binsHTML: binsHTML,
                staticBoundary: staticBoundary, staticTimeline: staticTimeline, staticIdea: staticIdea, explainerRows: explainerRows, explainerHTML: explainerHTML };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, KEY = "cf8_power_curves_from_scarce_data";
  LX.mount("cf8", function (live, data) {
    var D = data[KEY];
    var tl = LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline), lis = tl.el.querySelectorAll(".lx-tl-ev");
    // each event's footer (the E13 acknowledgement), visible under the event, after its source line (review CF8 #6)
    tl.events.forEach(function (e, k) { if (e.footer && lis[k]) H("p", { class: "lx-hint lx-tl-foot", text: e.footer }, lis[k].querySelector(".lx-tl-body") || lis[k]); });
    var x = document.getElementById("cf8-explain");
    if (x) { x.innerHTML = ""; x.classList.add("is-live"); LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary); }
  });
  LX.mount("cf8-idea", function (live, data, root) {
    var I = data[KEY].idea, M9D = data.m09_surrogates_uq, A = all(I, M9D), St = { i: 0, two: false };
    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: I.title }, H("div", { class: "lx-stage-head" }, stage));
    H("p", { class: "lx-hint", text: I.note }, stage);
    H("p", { class: "lx-hint", text: I.scope }, stage);
    var ctl = H("div", { class: "lx-ctls" }, stage);
    var sl = LX.Slider(H("div", null, ctl), { label: "Records", color: "var(--lx-ink)", min: 0, max: I.sweep.length - 1, step: 1, value: 0, fmt: function (i) { return I.sweep[i] + " records"; }, onChange: function (i) { St.i = i; paint(); } });
    var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Sources" }, ctl), { label: "Add the maker's curve as a second source", on: false, onChange: function (on) { St.two = on; paint(); } });
    var P = LX.Plot(stage, { text: "Text version of the chart" }), status = H("div", { class: "lx-stage-status", "aria-live": "polite" }, stage);
    H("p", { class: "lx-hint", text: I.levelNote }, stage);
    var how = H("div", { class: "cf8-how" }, stage);
    H("p", { class: "lx-eyebrow", text: I.binsTitle }, how);
    H("div", { html: binsHTML(I, M9D) }, how);
    function paint() {
      var n = I.sweep[St.i], f = A.fits[n], show = St.two ? [0, 1] : [0], col = ["var(--lx-tier-3)", "var(--lx-accent)"], lab = ["One source", "Two sources"];
      P.render({ x: { min: 28, max: 36, ticks: [[28, "28%", "start"], [30, "30%"], [32, "32%"], [34, "34%"], [36, "36%", "end"]] }, y: { min: 0, max: 2, ticks: [] }, height: 140, heightN: 140, ml: 14,
                 bars: show.map(function (k) { return { x0: 100 * f[k].lo, x1: 100 * f[k].hi, y0: 1.35 - 0.6 * k, y1: 1.65 - 0.6 * k, color: col[k], op: 0.55, rx: 3 }; })
                   .concat([[A.maker, "var(--lx-wind)"], [A.field, "var(--lx-ink)"]].map(function (r) { return { x0: 100 * r[0] - 0.025, x1: 100 * r[0] + 0.025, y0: 0, y1: 2, color: r[1], op: 0.9 }; })),   // the two reference values as thin vertical bars
                 marks: show.map(function (k) { return { x: 100 * f[k].cf, y: 1.5 - 0.6 * k, kind: "dot", color: col[k] }; }),
                 legend: show.map(function (k) { return { label: lab[k] + ", 90% band", color: col[k] }; }).concat([{ label: "Maker's curve, " + pts(A.maker) + "%", color: "var(--lx-wind)" }, { label: "Field curve (hidden), " + pts(A.field) + "%", color: "var(--lx-ink)" }]),
                 aria: "The expected capacity factor estimated from " + n + " records with its 90% band from the fitted curve, against the maker's and the field curve's.",
                 text: { head: ["Estimate", "Expected capacity factor", "90% band (fitted curve only)"], rows: [["Maker's curve", pts(A.maker) + "%", "–"], ["Field curve (hidden)", pts(A.field) + "%", "–"]].concat(show.map(function (k) { return [lab[k] + ", " + n + " records", pts(f[k].cf) + "%", pts(f[k].lo) + "% to " + pts(f[k].hi) + "%"]; })) } });
      status.innerHTML = show.map(function (k) { return "<p>" + lab[k] + ", " + n + " records: <b>" + pts(f[k].cf) + "% ± " + pts(f[k].hi - f[k].cf) + " points</b>.</p>"; }).join("") +
        (St.two ? "<p>The maker's curve narrows the band by " + Math.round(100 * (1 - (f[1].hi - f[1].lo) / (f[0].hi - f[0].lo))) + "% here; the field curve's " + pts(A.field) + "% lies inside both.</p>" : "<p>" + esc(I.oneNote) + "</p>");
    }
    paint();
    LX.demo(root, function (state) {
      if (state === "mid") { St.two = true; tg.set(true); sl.set(0); St.i = 0; paint(); return { view: "two sources, 16 records" }; }
      return null;
    });
  });
})();
