// m09-surrogates-uq.js — Modeler lesson M9, "Learning from few runs: surrogates, Gaussian processes and multi-fidelity
// data" (model-lab in the step-card form, statistical mode, no solver).
//
// The model is the shared Gaussian-process component, LX.M9 (assets/learn/components/gp.js, in the learn.js bundle;
// CF8 uses it too): the toy turbine and its records, the GP fits (one and
// two sources), maximum likelihood, the normal distribution and the held-out scores. This file keeps the page's own
// pure parts (facts, the reference block, the no-JS fallback) and the page; in Node it exports the component's
// functions with them, as before. Every number the page states comes from these functions;
// _tests/learn/test_m09-surrogates-uq.js checks them, and the lab notebook asserts the data file's reference block.
(function () {
  "use strict";
  var M9 = (typeof window !== "undefined" && window.LX && window.LX.M9) || require("./components/gp.js");
  var maker = M9.maker, field = M9.field, scatter = M9.scatter, records = M9.records, fit = M9.fit, predict = M9.predict, search = M9.search,
      pinball = M9.pinball, scores = M9.scores, LEVELS = M9.LEVELS, ZL = M9.ZL, campaign = M9.campaign, heldOut = M9.heldOut, stored = M9.stored,
      fitStored = M9.fitStored, curve = M9.curve, widest = M9.widest, gaps = M9.gaps, recBin = M9.recBin;

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
      about: "Reference results, recomputed from the seeded records. kW, m/s; coverages are fractions of the 400 held-out records.",
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
      "On 400 new records the 90% band holds " + pctS(b[0].cov[90]) + " (sampling alone: about ± " + (100 * F.se90).toFixed(0) + " points): " + b[0].byRange.map(function (q) { return pctS(q.cov90, 0) + " at " + q.label; }).join(", ") + ".",
      "Adding the maker's curve as a second source cuts the RMSE from " + kwS(b[0].rmse) + " to " + kwS(b[1].rmse) + " and the band's mean width from " + kwS(b[0].width) + " to " + kwS(b[1].width) + "; the band holds " + pctS(b[1].cov[90]) + " overall but " + pctS(b[1].byRange[1].cov90, 0) + " at 8–13 m/s (one source: " + pctS(b[0].byRange[1].cov90, 0) + ").",
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
  var model = {};
  Object.keys(M9).forEach(function (k) { model[k] = M9[k]; });
  model.facts = facts; model.reference = reference; model.staticFallback = staticFallback;
  if (typeof module !== "undefined" && module.exports) module.exports = model;
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
    // records as dots only: LX.Plot skips a width-0 line's dots, so the joining path is drawn invisible (op 0)
    (o.recs || []).forEach(function (s) { lines.push({ pts: s.r.map(function (p) { return [p[0], p[1]]; }), color: s.color, width: 0.01, op: 0, dots: true }); legend.push({ label: s.label, color: s.color }); });
    curves.forEach(function (c) { lines.push({ pts: c.c.map(function (p) { return [p.v, p.m]; }), color: c.f.color, width: 2.6 }); legend.push({ label: c.f.label + ", with its 90% band", color: c.f.color }); });
    // the text version, one row per 1 m/s bin of wind speed: each set of records as its count and mean power in the bin
    // (and, beside the maker's curve, their mean gap below it), then every curve and band at the bin's centre
    var rows = binText(T, o);
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
      text: { head: rows.head, rows: rows.rows, note: "Records are counted within each 1 m/s bin; curves and bands are read at the bin's center." }
    };
  }
  function binText(T, o) {
    var head = ["Wind speed"], out = [];
    (o.recs || []).forEach(function (s) { head.push(s.label + ": count, mean power"); if (o.maker) head.push(s.label + ": mean gap below the maker's curve"); });
    if (o.maker) head.push("Maker's curve");
    if (o.field) head.push("Field curve (hidden from the fits)");
    (o.fits || []).forEach(function (f) { head.push(f.label + " (90% band)"); });
    for (var lo = T.range[0]; lo < T.range[1]; lo += 1) {
      var c = lo + 0.5, r = [lo + "–" + (lo + 1) + " m/s"];
      (o.recs || []).forEach(function (s) {
        var b = recBin(T, s.r, lo);
        r.push(b.n ? b.n + " · " + kw(b.mean) : "none");
        if (o.maker) r.push(b.n ? kw(b.gap) : "–");
      });
      if (o.maker) r.push(kw(maker(T, c)));
      if (o.field) r.push(kw(field(T, c, o.field === "reduce" ? "reduce" : null)));
      (o.fits || []).forEach(function (f) { var q = predict(f.F, c); r.push(kw(q.m) + " (" + kw(q.m - Z90 * q.sd) + " to " + kw(q.m + Z90 * q.sd) + ")"); });
      out.push(r);
    }
    return { head: head, rows: out };
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
          feedback: { knee: "Gusts inside each ten minutes smooth the curve's sharp corner at [[rated-speed|rated speed]], 11.5 m/s, where the maker's curve first reaches full power." },
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
        H("p", { class: "lx-hint", html: LX.rich("Settings fixed for now: [[length-scale|length-scale]] " + ms(D.fixed.ell) + " (how far one record's pull reaches), signal size " + kw(D.fixed.sf) + " (how far the curve may swing from its average), noise " + kw(D.fixed.sn) + ". Step 3 lets the records choose.") }, act);
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
      text: "Two settings shape the fit: the [[length-scale|length-scale]], how far one record reaches, and the noise, the scatter expected around the curve. Move them, then let the " + N0 + " records choose by [[maximum-likelihood|maximum likelihood]].",
      build: function (act, api) {
        var recs = campaign(D, N0), G = D.grid, best = null, P, out, hp;
        var ML = stored(D, null, false, N0);
        hp = { ell: G.ell[G.ell.indexOf(2)] || 2, sf: ML.sf, sn: G.sn[G.sn.indexOf(40)] || 40 };
        var sl = LX.Slider(act, { label: "Length-scale", color: COL.one, min: 0, max: G.ell.length - 1, step: 1, value: G.ell.indexOf(hp.ell), fmt: function (i) { return ms(G.ell[i]); }, onChange: function (i) { hp.ell = G.ell[i]; draw(true); } });
        var sn = LX.Slider(act, { label: "Noise", color: COL.held, min: 0, max: G.sn.length - 1, step: 1, value: G.sn.indexOf(hp.sn), fmt: function (i) { return kw(G.sn[i]); }, onChange: function (i) { hp.sn = G.sn[i]; draw(true); } });
        var r = row(act), b = H("button", { type: "button", class: "lx-btn small", text: "Let the records choose" }, r);
        H("span", { class: "m9-note", text: "Signal size, how far the curve may swing from its average, held at " + kw(ML.sf) + "." }, r);
        P = LX.Plot(act, { text: "Text version of the chart" }); out = readout(act);
        b.addEventListener("click", function () {
          if (!best) best = search(T, recs, false, G);
          hp = { ell: best.hp.ell, sf: best.hp.sf, sn: best.hp.sn };
          sl.set(G.ell.indexOf(hp.ell)); sn.set(G.sn.indexOf(hp.sn)); draw(false);
          api.done(); api.saw("The records choose a length-scale of " + ms(hp.ell) + ", noise " + kw(hp.sn) + " and signal size " + kw(hp.sf) + ": the settings giving these records the highest likelihood among " + int(G.ell.length * G.sf.length * G.sn.length) + " on a grid, searched in your browser.");
        });
        function draw(user) {
          var F = fit(T, recs, hp, false);
          if (!best) best = search(T, recs, false, G);
          P.render(fitSpec(T, { fits: [{ F: F, color: COL.one, label: "Gaussian process" }], recs: [{ r: recs, color: COL.rec, label: N0 + " records" }], aria: "A Gaussian process fitted to " + N0 + " records with the settings chosen." }));
          var gap = best.ll - F.ll;
          out.innerHTML = "Length-scale " + ms(hp.ell) + ", noise " + kw(hp.sn) + ": log-likelihood <b>" + F.ll.toFixed(1) + "</b> (how probable these records are under the settings; higher is better), " + (gap < 1e-9 ? "the best on the grid." : gap.toFixed(1) + " below the best on the grid.");
          keep("ell", hp.ell); keep("sn", hp.sn);
          if (user) api.saw("Short length-scales chase single records; long ones cannot bend at rated speed. Now let the records choose.", true);
        }
        draw(false);
      }
    });

    // ---- 4 training records flatter: score on 400 held-out records
    steps.push({
      text: "A flexible fit can look especially good on its own records, so score it on 400 records it never saw, [[held-out-data|held-out]] data, as [[rmse|RMSE]]. Try a very short and a very long length-scale too.",
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
          out.innerHTML = LEVELS[i] + "% band: holds <b>" + pct(s.cov[LEVELS[i]]) + "</b> of 400 new records; sampling alone moves this by about ± " + (200 * Math.sqrt(LEVELS[i] / 100 * (1 - LEVELS[i] / 100) / s.n)).toFixed(0) + " points (two standard errors, independent records).";
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
          table(tb, ["On 400 new records", "One source", "Two sources"], [["RMSE", kw(sa.rmse), seen[1] ? kw(sb.rmse) : "?"], ["90% band holds", pct(sa.cov[90]), seen[1] ? pct(sb.cov[90]) : "?"], ["90% band holds, 8–13 m/s (" + sa.byRange[1].n + " records)", pct(sa.byRange[1].cov90, 0), seen[1] ? pct(sb.byRange[1].cov90, 0) : "?"], ["90% band, mean width", kw(sa.width), seen[1] ? kw(sb.width) : "?"]]);
          out.innerHTML = i ? "Two sources: ρ = " + (b.beta[1] / 1000).toFixed(2) + " times the maker's curve, plus " + kw(b.beta[0]) + ", plus a learned gap." : "One source: the records alone.";
          if (seen[1]) { api.done(); api.saw("Same " + N0 + " records: two sources cut the RMSE from " + int(sa.rmse) + " to " + kw(sb.rmse) + " and the mean band width from " + int(sa.width) + " to " + kw(sb.width) + ". Yet at 8–13 m/s, the steep part, its 90% band holds only " + pct(sb.byRange[1].cov90, 0) + " (one source: " + pct(sa.byRange[1].cov90, 0) + ")."); }
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
            api.done(); api.saw("At " + SW[0] + " records two sources are " + kw(f0) + " closer; at " + n + ", " + kw(a.rmse - b.rmse) + ". In this example, the cheap curve's added benefit shrinks as records cover more wind speeds.");
          } else if (user) api.saw("Keep adding records.", true);
        }
        draw(false);
      }
    });

    // ---- 8 when the cheap curve misleads: a load-reducing mode above 12.5 m/s
    var R = T.reduce;
    steps.push({
      text: "Suppose this turbine runs a load-reducing mode above " + ms(R.from) + " that the maker's curve leaves out, and the first " + N0 + " records stop at " + ms(Math.max.apply(null, campaign(D, N0).map(function (p) { return p[0]; }))) + ". Which band would you rather use at 15 m/s?",
      build: function (act, api) {
        var a = lab.fit(N0, false, "reduce"), b = lab.fit(N0, true, "reduce"), sa = lab.sc(N0, false, "reduce"), sb = lab.sc(N0, true, "reduce"), host = H("div", null, act);
        var pr = LX.Predict(act, { id: "m9-trust", q: "Your pick:", answer: "one", fresh: true, title: false,
          options: [{ value: "one", label: "One source", color: COL.one }, { value: "two", label: "Two sources", color: COL.two }],
          feedback: { one: "The more cautious choice: its band widens where no record is. Here it covers the new records, but nothing checked it there in advance.", two: "It trusts the maker's curve where no record can correct it." },
          onPick: function (v) { keep("trust", v); draw(); pr.reveal(); } });
        act.appendChild(host);
        function draw() {
          host.innerHTML = "";
          var P = LX.Plot(host, { text: "Text version of the chart" });
          P.render(fitSpec(T, { fits: [{ F: a, color: COL.one, label: "One source" }, { F: b, color: COL.two, label: "Two sources" }], maker: true, field: "reduce",
                                recs: [{ r: testR, color: COL.held, label: "400 new records", faint: true }, { r: campaign(D, N0, "reduce"), color: COL.rec, label: N0 + " records" }],
                                aria: "Both fits in the load-reducing case, with 400 new records." }));
          H("p", { class: "lx-hint", text: "Beyond its last record the one-source curve falls back toward its average, " + kw(a.beta[0]) + ": close to this turbine by luck, far from the turbine of step 6." }, host);
          var tb = H("div", null, host);
          table(tb, ["On 400 new records", "One source", "Two sources"], [["RMSE", kw(sa.rmse), kw(sb.rmse)], ["90% band holds, all speeds", pct(sa.cov[90]), pct(sb.cov[90])], ["90% band holds, 13–20 m/s (" + sa.byRange[2].n + " records)", pct(sa.byRange[2].cov90, 0), pct(sb.byRange[2].cov90, 0)]]);
          api.done();
          api.saw("Above 13 m/s the two-source band holds " + pct(sb.byRange[2].cov90, 0) + " of new records; the wider one-source band holds " + pct(sa.byRange[2].cov90, 0) + " in this example. Neither was validated beyond its last record: cheap data mislead where they are wrong and unchecked.");
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
        H("p", { class: "lx-hint", html: LX.rich("[[pinball-loss|Pinball loss]] scores the band's percentiles: a 90th-percentile forecast should sit above about 90% of outcomes, and each miss costs by how far it misses, weighted by side. Lower is better.") }, act);
        act.appendChild(tb); act.appendChild(out);
        function draw(i) {
          table(tb, ["Load-reducing case, " + N0 + " records", "One source", "Two sources"], SC.map(function (s) { return [s.label, s.f(sa), s.f(sb)]; }), "m9-scores");
          var c = SC[i];
          out.innerHTML = c.label + ": one source <b>" + c.f(sa) + "</b>, two sources <b>" + c.f(sb) + "</b>.";
          if (c.k === "pb") { api.done(); api.saw("Averaged over all 400 records, pinball loss rates them about equal; only " + sa.byRange[2].n + " records lie above 13 m/s, where the two-source band fails. Score where the decision needs it, not only on average."); }
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
        { key: "one", color: COL.one, name: "One source (GP on the records)", base: kw(s1.rmse) + ", " + pct(s1.cov[90]) + " (" + pct(s1.byRange[1].cov90, 0) + " at 8–13 m/s)", red: pct(r1.byRange[2].cov90, 0), when: "the cheap curve may be wrong where records are missing" },
        { key: "two", color: COL.two, name: "Two sources (maker's curve + GP on the gap)", base: kw(s2.rmse) + ", " + pct(s2.cov[90]) + " (" + pct(s2.byRange[1].cov90, 0) + " at 8–13 m/s)", red: pct(r2.byRange[2].cov90, 0), when: "the cheap curve is right in shape and records are few" }
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
