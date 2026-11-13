// explainers/uq-mfgpr.js — interactive explainer for the uq-mfgpr project page.
//
// Method (ASME IDETC 2023, doi:10.1115/DETC2023-114762, Sections 2.2-2.3; framework docs staging/mfgpr-framework/docs/method.md):
// Gaussian process regression (Eqs. 4-5) on measured points alone, versus linear autoregressive multi-fidelity regression
// (Eq. 6), g_high(x) = rho * g_low(x) + delta(x), where the low-fidelity level is the turbine type's theoretical power curve
// and delta is an independent GP. Both levels form one joint GP. Where measurements are missing, the multi-fidelity model
// borrows the shape of the theoretical curve, so with few measured points its uncertainty band is narrower than that of a
// GP trained on the points alone. The paper's own results were mixed across turbines and metrics; this toy shows only the
// mechanism, on synthetic data.
//
// Toy model (all synthetic, kW and m/s; fixed seed, so every visitor sees the same data):
//   theoretical curve  P_low(v)  = 2000 / (1 + exp(-0.85 (v - 8.5)))
//   true curve         P_true(v) = 0.94 * 2000 / (1 + exp(-0.80 (v - 9.3)))      (hidden from both models)
//   measured points    v_i = 1 + 18 * vdc(i) + U(-0.3, 0.3),  P_i = P_true(v_i) + N(0, 60^2), i = 1..25
//                      (vdc = van der Corput sequence: points are added in a fixed, well-spread order)
//   low-fidelity input 15 evenly spaced points of P_low on 0-20 m/s
//   kernels            squared exponential k(x,x') = s^2 exp(-(x-x')^2 / (2 l^2)); zero prior mean (as in the framework)
//   hyperparameters    estimated once by maximum likelihood on a grid using all 25 points, then held fixed, so the band
//                      changes only because of the data: GP s = 1500, l = 5; multi-fidelity s0 = 1000, l0 = 3, rho = 0.9,
//                      s1 = 150, l1 = 3; noise sd 60 kW (measured) and 1 kW (theoretical points).
// The band is the 95% interval of the latent curve (Eq. 5, without measurement noise). Illustrative only.
//
// Host pages: on every update the explainer sends an "explainer-update" event (bubbling from its container) with what it
// shows: {slug, n, mode, model: model({n}), api: {model, truth, theoretical}}; nothing on the explainer's own page changes.
// Learn's case file CF8 writes its text version (a table by wind-speed region) from it, so that version follows the slider.
(function () {
  "use strict";

  var PR = 2000, NMAX = 25, NLOW = 15, V_MAX = 20, SEED = 20230820;
  var HYP = { sf: { s: 1500, l: 5 }, mf: { s0: 1000, l0: 3, rho: 0.9, s1: 150, l1: 3 }, noise: 60, lowNoise: 1 };

  function theoretical(v) { return PR / (1 + Math.exp(-0.85 * (v - 8.5))); }
  function truth(v) { return 0.94 * PR / (1 + Math.exp(-0.8 * (v - 9.3))); }

  // small seeded random generator (mulberry32) and the van der Corput sequence in base 2
  function rng32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function vdc(i) { var x = 0, f = 0.5; while (i > 0) { x += f * (i & 1); i >>= 1; f /= 2; } return x; }

  function makeData() {
    var r = rng32(SEED), hx = [], hy = [], lx = [], ly = [], i;
    var gauss = function () { var u = 1 - r(), w = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
    for (i = 1; i <= NMAX; i++) {
      var v = 1 + 18 * vdc(i) + 0.6 * (r() - 0.5);
      hx.push(v); hy.push(truth(v) + HYP.noise * gauss());
    }
    for (i = 0; i < NLOW; i++) { var u = V_MAX * i / (NLOW - 1); lx.push(u); ly.push(theoretical(u)); }
    return { hx: hx, hy: hy, lx: lx, ly: ly };
  }
  var DATA = makeData();

  // ---- linear algebra for small dense systems (n <= 40) ----
  function se(a, b, s, l) { var d = a - b; return s * s * Math.exp(-d * d / (2 * l * l)); }
  function cholesky(A) {           // A = L L^T; adds a tiny jitter if needed
    var n = A.length, jitter = 0;
    for (var attempt = 0; attempt < 5; attempt++) {
      var L = [], ok = true, i, j, k;
      for (i = 0; i < n; i++) L.push(new Float64Array(n));
      for (i = 0; i < n && ok; i++) {
        for (j = 0; j <= i; j++) {
          var s = A[i][j] + (i === j ? jitter : 0);
          for (k = 0; k < j; k++) s -= L[i][k] * L[j][k];
          if (i === j) { if (s <= 0) { ok = false; break; } L[i][i] = Math.sqrt(s); }
          else L[i][j] = s / L[j][j];
        }
      }
      if (ok) return L;
      jitter = jitter ? jitter * 10 : 1e-6 * (A[0][0] || 1);
    }
    throw new Error("covariance matrix is not positive definite");
  }
  function forward(L, b) {         // solve L z = b
    var n = b.length, z = new Float64Array(n);
    for (var i = 0; i < n; i++) { var s = b[i]; for (var k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
    return z;
  }
  function backward(L, z) {        // solve L^T x = z
    var n = z.length, x = new Float64Array(n);
    for (var i = n - 1; i >= 0; i--) { var s = z[i]; for (var k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }

  // GP posterior of the latent function (Eqs. 4-5): cov(i, j) over training items, kStar(item, x*) and kss(x*)
  function posterior(items, y, cov, noise, kStar, kss, xs) {
    var n = items.length, K = [], i, j;
    for (i = 0; i < n; i++) { K.push(new Float64Array(n)); for (j = 0; j < n; j++) K[i][j] = cov(items[i], items[j]) + (i === j ? noise[i] : 0); }
    var L = cholesky(K), alpha = backward(L, forward(L, y));
    var mean = [], sd = [];
    xs.forEach(function (x) {
      var k = new Float64Array(n), m = 0, q = 0;
      for (i = 0; i < n; i++) { k[i] = kStar(items[i], x); m += k[i] * alpha[i]; }
      var w = forward(L, k);
      for (i = 0; i < n; i++) q += w[i] * w[i];
      mean.push(m); sd.push(Math.sqrt(Math.max(0, kss(x) - q)));
    });
    return { mean: mean, sd: sd };
  }

  // single-fidelity GP on the first n measured points
  function predictSF(n, xs) {
    var p = HYP.sf, items = DATA.hx.slice(0, n), y = DATA.hy.slice(0, n);
    var noise = items.map(function () { return HYP.noise * HYP.noise; });
    return posterior(items, y, function (a, b) { return se(a, b, p.s, p.l); }, noise,
      function (a, x) { return se(a, x, p.s, p.l); }, function () { return p.s * p.s; }, xs);
  }

  // linear autoregressive multi-fidelity GP (Eq. 6): theoretical points (level 0) + first n measured points (level 1);
  // cov(g0, g0) = c0, cov(g0, g1) = rho c0, cov(g1, g1) = rho^2 c0 + c1; prediction at level 1
  function predictMF(n, xs) {
    var p = HYP.mf, items = [], y = [], noise = [], i;
    for (i = 0; i < DATA.lx.length; i++) { items.push({ x: DATA.lx[i], lev: 0 }); y.push(DATA.ly[i]); noise.push(HYP.lowNoise * HYP.lowNoise); }
    for (i = 0; i < n; i++) { items.push({ x: DATA.hx[i], lev: 1 }); y.push(DATA.hy[i]); noise.push(HYP.noise * HYP.noise); }
    var cov = function (a, b) {
      var c0 = se(a.x, b.x, p.s0, p.l0);
      if (a.lev === 0 && b.lev === 0) return c0;
      if (a.lev !== b.lev) return p.rho * c0;
      return p.rho * p.rho * c0 + se(a.x, b.x, p.s1, p.l1);
    };
    return posterior(items, y, cov, noise, function (a, x) { return cov(a, { x: x, lev: 1 }); },
      function () { return p.rho * p.rho * p.s0 * p.s0 + p.s1 * p.s1; }, xs);
  }

  var GRID = [];
  for (var g = 0; g <= 100; g++) GRID.push(V_MAX * g / 100);

  // pure model: p = {n: number of measured points, 1-25}; returns both estimates on a 0-20 m/s grid and summary numbers
  function model(p) {
    var n = Math.max(1, Math.min(NMAX, Math.round(p.n)));
    var xs = p.xs || GRID, sf = predictSF(n, xs), mf = predictMF(n, xs);
    var avg = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; };
    var rmse = function (m) { return Math.sqrt(avg(m.map(function (v, i) { return (v - truth(xs[i])) * (v - truth(xs[i])); }))); };
    var bandSF = 1.96 * avg(sf.sd), bandMF = 1.96 * avg(mf.sd);   // average half-width of the 95% band, kW
    return { n: n, xs: xs, sf: sf, mf: mf, points: { x: DATA.hx.slice(0, n), y: DATA.hy.slice(0, n) },
             bandSF: bandSF, bandMF: bandMF, narrowerPct: 100 * (1 - bandMF / bandSF),
             rmseSF: rmse(sf.mean), rmseMF: rmse(mf.mean) };
  }

  var P_MAX = 2500;
  var API = { model: model, truth: truth, theoretical: theoretical };   // the pure model, for a host page's text version

  function view(root, h) {
    var state = { n: 5, mode: "both" };
    var ui = h.scaffold(root, { title: "How does the uncertainty band change as measured points are added?" });

    h.slider(ui.controls, { label: "Measured points", min: 2, max: NMAX, step: 1, value: state.n,
      hint: "synthetic turbine data, added in a fixed order", onInput: function (v) { state.n = v; update(); } });
    h.toggle(ui.controls, { label: "Show", value: state.mode,
      options: [{ value: "both", label: "Both" }, { value: "sf", label: "Data only" }, { value: "mf", label: "Curve + data" }],
      onChange: function (v) { state.mode = v; update(); } });

    var chart = h.el("div", { class: "ex-chart" }, ui.figure);
    var legend = h.el("div", { class: "ex-legend", style: "display:flex;flex-wrap:wrap;gap:.3rem 1.1rem;margin-top:.45rem;font-size:.8rem;color:var(--ink-2)" }, ui.figure);
    h.el("p", { class: "ex-hint", style: "margin:.4rem 0 0", text: "Synthetic turbine; model settings fixed in advance. " +
      "The theoretical curve helps only as far as it resembles the turbine's real behavior." }, ui.figure);
    var read = h.readouts(ui.side, [
      { key: "sf", label: "95% band, data only (average)" },
      { key: "mf", label: "95% band, curve + data (average)" },
      { key: "pct", label: "Band narrower by" }]);
    var say = h.sentence(ui.side);

    function item(parent, draw, text) {
      var it = h.el("span", { style: "display:inline-flex;align-items:center;gap:.4rem" }, parent);
      var s = h.el("svg", { width: 22, height: 12, "aria-hidden": "true" }, it);
      draw(s);
      h.el("span", { text: text }, it);
    }
    function drawLegend() {
      var tc = h.color("t"), mu = h.color("muted"), ink = h.color("ink");
      while (legend.firstChild) legend.removeChild(legend.firstChild);
      item(legend, function (s) { h.el("circle", { cx: 11, cy: 6, r: 3.5, fill: ink }, s); }, "Measured points");
      item(legend, function (s) { h.el("line", { x1: 1, x2: 21, y1: 6, y2: 6, stroke: tc, "stroke-width": 2, "stroke-dasharray": "5 3", "stroke-opacity": 0.8 }, s); }, "Theoretical curve");
      item(legend, function (s) { h.el("rect", { x: 1, y: 1, width: 20, height: 10, fill: tc, "fill-opacity": 0.2 }, s); h.el("line", { x1: 1, x2: 21, y1: 6, y2: 6, stroke: tc, "stroke-width": 2.5 }, s); }, "Curve + data");
      item(legend, function (s) { h.el("rect", { x: 1, y: 1, width: 20, height: 10, fill: mu, "fill-opacity": 0.16 }, s); h.el("line", { x1: 1, x2: 21, y1: 6, y2: 6, stroke: mu, "stroke-width": 2 }, s); }, "Data only");
      item(legend, function (s) { h.el("line", { x1: 1, x2: 21, y1: 6, y2: 6, stroke: ink, "stroke-width": 1.5, "stroke-dasharray": "1.5 3", "stroke-linecap": "round" }, s); }, "True curve (hidden from the models)");
    }

    function label(g, x, y, s, o) {
      o = o || {};
      return h.el("text", { x: x, y: y, "text-anchor": o.anchor || "start", class: o.cls || null, text: s }, g);
    }

    var clipId = "ex-uq-clip-" + Math.random().toString(36).slice(2, 8);

    function draw(w) {
      var m = model({ n: state.n });
      var H = Math.max(250, Math.min(330, Math.round(w * 0.6)));
      var M = { l: 52, r: 10, t: 12, b: 40 };
      var pw = w - M.l - M.r, ph = H - M.t - M.b;
      var x = h.scale(0, V_MAX, M.l, M.l + pw), y = h.scale(0, P_MAX, M.t + ph, M.t);
      var tc = h.color("t"), mu = h.color("muted"), ink = h.color("ink"), surface = h.color("surface");
      while (chart.firstChild) chart.removeChild(chart.firstChild);
      var svg = h.svg(chart, { width: w, height: H, label: "Power curve estimates against wind speed from " + m.n +
        " measured points. Average 95% band: measured data only ±" + h.fmt(m.bandSF, 0) + " kW; theoretical curve plus data ±" +
        h.fmt(m.bandMF, 0) + " kW." });
      var defs = h.el("defs", {}, svg), cp = h.el("clipPath", { id: clipId }, defs);
      h.el("rect", { x: M.l, y: M.t, width: pw, height: ph }, cp);

      var grid = h.el("g", { class: "ex-grid" }, svg), axis = h.el("g", { class: "ex-axis" }, svg);
      h.ticks(0, P_MAX, 5).forEach(function (v) {
        h.el("line", { x1: M.l, x2: M.l + pw, y1: y(v), y2: y(v) }, grid);
        label(axis, M.l - 6, y(v) + 4, h.fmt(v, 0), { anchor: "end" });
      });
      h.ticks(0, V_MAX, 4).forEach(function (v) {
        h.el("line", { x1: x(v), x2: x(v), y1: M.t + ph, y2: M.t + ph + 4 }, axis);
        label(axis, x(v), M.t + ph + 16, v, { anchor: "middle" });
      });
      h.el("line", { x1: M.l, x2: M.l + pw, y1: M.t + ph, y2: M.t + ph }, axis);
      label(axis, M.l + pw / 2, H - 6, "Wind speed (m/s)", { anchor: "middle" });
      var yl = label(axis, 0, 0, "Power (kW)", { anchor: "middle" });
      yl.setAttribute("transform", "translate(12," + (M.t + ph / 2) + ") rotate(-90)");

      var plot = h.el("g", { "clip-path": "url(#" + clipId + ")" }, svg);
      var path = function (ys) { return m.xs.map(function (v, i) { return (i ? "L" : "M") + x(v).toFixed(1) + "," + y(ys[i]).toFixed(1); }).join(""); };
      var band = function (est) {
        var up = est.mean.map(function (v, i) { return v + 1.96 * est.sd[i]; });
        var lo = est.mean.map(function (v, i) { return v - 1.96 * est.sd[i]; });
        var d = path(up);
        for (var i = m.xs.length - 1; i >= 0; i--) d += "L" + x(m.xs[i]).toFixed(1) + "," + y(lo[i]).toFixed(1);
        return d + "Z";
      };
      var showSF = state.mode !== "mf", showMF = state.mode !== "sf";
      if (showSF) h.el("path", { d: band(m.sf), fill: mu, "fill-opacity": 0.16, stroke: mu, "stroke-opacity": 0.5, "stroke-dasharray": "3 3" }, plot);
      if (showMF) h.el("path", { d: band(m.mf), fill: tc, "fill-opacity": 0.2 }, plot);
      h.el("path", { d: path(m.xs.map(truth)), fill: "none", stroke: ink, "stroke-width": 1.5, "stroke-dasharray": "1.5 3", "stroke-linecap": "round" }, plot);
      if (showMF) h.el("path", { d: path(m.xs.map(theoretical)), fill: "none", stroke: tc, "stroke-width": 2, "stroke-dasharray": "5 3", "stroke-opacity": 0.8 }, plot);
      if (showSF) h.el("path", { d: path(m.sf.mean), fill: "none", stroke: mu, "stroke-width": 2 }, plot);
      if (showMF) h.el("path", { d: path(m.mf.mean), fill: "none", stroke: tc, "stroke-width": 2.5 }, plot);
      m.points.x.forEach(function (v, i) {
        h.el("circle", { cx: x(v), cy: y(m.points.y[i]), r: 4, fill: ink, stroke: surface, "stroke-width": 1.5 }, plot);
      });
    }

    function update() {
      var m = model({ n: state.n });
      // tell the host page what is shown, for its own text version (Learn's case file CF8 writes the table by region)
      if (root.dispatchEvent && typeof CustomEvent === "function")
        root.dispatchEvent(new CustomEvent("explainer-update", { bubbles: true, detail: { slug: "uq-mfgpr", n: m.n, mode: state.mode, model: m, api: API } }));
      read({ sf: "±" + h.fmt(m.bandSF, 0) + " kW", mf: "±" + h.fmt(m.bandMF, 0) + " kW", pct: h.fmt(m.narrowerPct, 0) + "%" });
      var s;
      var ratio = m.bandMF / m.bandSF, sf = "±" + h.fmt(m.bandSF, 0), mf = "<strong>±" + h.fmt(m.bandMF, 0) + " kW</strong>";
      if (ratio < 0.5) {
        s = "With <strong>" + m.n + "</strong> measured points, the data-only estimate is uncertain wherever measurements " +
          "are missing (average band " + sf + " kW). Borrowing the shape of the theoretical curve narrows the band to " + mf +
          (m.rmseMF < m.rmseSF ? ", and the estimate stays closer to the true curve." : ".");
      } else if (ratio < 0.8) {
        s = "With <strong>" + m.n + "</strong> measured points the gaps are smaller, but the theoretical curve still narrows " +
          "the band from " + sf + " to " + mf + ", mostly where points are sparse.";
      } else {
        s = "With <strong>" + m.n + "</strong> measured points, the measurements carry most of the information: the " +
          "theoretical curve narrows the band only from " + sf + " to " + mf + ".";
      }
      say(s);
      redraw();
    }

    var redraw = h.responsive(chart, draw);
    h.onTheme(function () { drawLegend(); redraw(); });
    drawLegend();
    update();
  }

  if (typeof window !== "undefined" && window.Explainer) window.Explainer.register("uq-mfgpr", view);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { model: model, view: view, predictSF: predictSF, predictMF: predictMF, cholesky: cholesky, DATA: DATA, HYP: HYP,
                       theoretical: theoretical, truth: truth, se: se };
  }
})();
