// test_m09-surrogates-uq.js — Node tests for Modeler lesson M9 (assets/learn/m09-surrogates-uq.js, its data file and the
// page learn/m09-surrogates-uq.qmd):
//   - the toy from first principles: the maker's curve, the gust-averaged field curve (its largest gap to the maker's
//     curve sits at rated speed), the load-reducing mode, the scatter formula; the stored records equal the generator's
//     (seeds 9 and 2023, mulberry32), with the load-reducing case on the same draws
//   - the linear algebra: Cholesky against the matrix, the GP's mean and band against a direct solve with an explicit
//     inverse, generalized least squares against the normal equations, the inverse normal against known values, the
//     pinball loss against its definition
//   - the stored maximum-likelihood settings equal a fresh grid search for every case, model and record count, each
//     unique (the best beats the runner-up by more than 1e-6) and inside the grid (tie rule: first best in grid order)
//   - claims about the model as built: steps 1 to 9's results; "a little wide" (95.5% beyond the 3-point chance band);
//     "about equal" pinball losses (within 2%); the cheap curve's gain shrinks with records
//   - every number the page states (step cards through the stub run below, the no-JS block, Go deeper, myths, quiz,
//     numbers to remember, the explain layer) matches the model; the data file's reference block (the notebook asserts
//     it) is recomputed
//   - the page on a stub document: each step's action unlocks Next; step text (35 words) and results (40 words) within
//     two sentences; results in aria-live regions; the demo states run
//   - scope: no nuclear term, no "AI", no deny-listed term; links only to learn pages, the downloads, doi.org,
//     gaussianprocess.org and the two allow-listed repositories; excerpt keys uq-mfgpr and wind-uq only
//   - research wording (the sourcing rule): every sentence about the course author's studies, on the page, in the data,
//     the script, the path.yml entry and the notebook, is an approved sentence of the excerpt wording (E1, E12, E13),
//     word for word; every E13 block ends with the acknowledgement
//   - speed: the step 3 grid search and the facts in Node
// Usage (from the site folder):  node _tests/learn/test_m09-surrogates-uq.js [--write]
//   --write  rewrite the data file's records, stored fits and reference block, and the page's no-JS block, first
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "m09-surrogates-uq";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const X = require("./excerpt_check.js");
const PRIV = require("./private_sources.js");
const DPATH = L("data/" + ID + ".json"), QPATH = path.join(SITE, "learn", ID + ".qmd");
const NBPATH = path.join(SITE, "learn/notebooks", ID + ".ipynb"), SIDE = path.join(SITE, "learn/_w1", ID + ".yml");
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
let D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const text = s => s.replace(/\\\$/g, "$").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();
const kw = v => Math.round(v).toLocaleString("en-US") + " kW", pct = (f, d) => (100 * f).toFixed(d == null ? 1 : d) + "%";

// ---------------- --write: records, stored fits, reference block, no-JS block
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
function buildData(D) {
  const T = D.turbine, out = JSON.parse(JSON.stringify(D));
  out.records = { campaign: M.records(T, D.counts.campaign, D.seeds.campaign), test: M.records(T, D.counts.test, D.seeds.test),
                  campaignReduce: M.records(T, D.counts.campaign, D.seeds.campaign, "reduce"), testReduce: M.records(T, D.counts.test, D.seeds.test, "reduce") };
  out.fits = {};
  ["base", "reduce"].forEach(mode => { out.fits[mode] = { one: {}, two: {} }; D.sweep.forEach(n => [false, true].forEach(two => {
    const b = M.search(T, M.campaign(out, n, mode === "reduce" ? "reduce" : null), two, D.grid);
    out.fits[mode][two ? "two" : "one"][n] = { ell: b.hp.ell, sf: b.hp.sf, sn: b.hp.sn };
  })); });
  return out;
}
if (process.argv.includes("--write")) {
  D = buildData(D); D.reference = M.reference(D);
  fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n");
  let q = fs.readFileSync(QPATH, "utf8"); const r = between(q, "m9-fallback");
  q = q.slice(0, r.from) + M.staticFallback(D) + "\n" + q.slice(r.to);
  fs.writeFileSync(QPATH, q);
  console.log("wrote the records, fits, reference block and the no-JS block");
  D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
}
const PAGE = fs.readFileSync(QPATH, "utf8"), RAW = fs.readFileSync(DPATH, "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const NB = readOr(NBPATH), SIDEYML = readOr(SIDE), T = D.turbine;
{ const r = between(PAGE, "m9-fallback"); ok(PAGE.slice(r.from, r.to) === M.staticFallback(D) + "\n", "the no-JS block is up to date (run with --write)"); }

// ---------------- the toy from first principles
ok(M.maker(T, 2.9) === 0 && M.maker(T, 3) === 0 && near(M.maker(T, 11.49), 2000 * (11.49 ** 3 - 27) / (11.5 ** 3 - 27)) && M.maker(T, 11.5) === 2000 && M.maker(T, 19) === 2000, "the maker's curve: 0 below 3 m/s, cubic to 2,000 kW at 11.5 m/s, flat above");
{
  // the gust rule against a direct integral of the maker's curve over a normal density (trapezoid, 20,001 points)
  const direct = v => { let s = 0, w = 0; for (let i = 0; i <= 20000; i++) { const z = -8 + 16 * i / 20000, f = Math.exp(-z * z / 2); s += f * M.maker(T, v * (1 + T.ti * z)); w += f; } return (1 - T.loss) * s / w; };
  ok([5, 8, 11.5, 14].every(v => near(M.field(T, v), direct(v), 0.5)), "the field curve = 0.97 x the maker's curve averaged over N(0, 0.12) gusts (within 0.5 kW of a fine integral)");
  let vmax = 3, gmax = 0; for (let v = 3; v <= 20.0001; v += 0.01) { const g = M.maker(T, v) - M.field(T, v); if (g > gmax) { gmax = g; vmax = v; } }
  ok(near(vmax, 11.5, 0.011) && gmax > 250, "the field curve sits furthest below the maker's curve at rated speed, 11.5 m/s (" + gmax.toFixed(0) + " kW)");
  ok(near(M.field(T, 10, "reduce"), M.field(T, 10), 1e-12) && near(M.field(T, 20, "reduce"), 0.5 * M.field(T, 20), 1e-9) && near(M.field(T, 16.25, "reduce"), 0.75 * M.field(T, 16.25), 1e-9), "the load-reducing mode: unchanged below 12.5 m/s, three quarters at 16.25 m/s, half at 20 m/s");
  ok(near(M.scatter(T, 15), Math.sqrt(15 * 15 + (0.3 * M.slope(T, 15)) ** 2), 1e-12) && M.scatter(T, 9) > 80 && M.scatter(T, 4) < 40, "the scatter: 15 kW plus 0.3 m/s times the slope, largest on the steep part");
}
{
  const B = buildData(D), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(same(B.records, D.records), "the stored records equal the generator's (seeds " + D.seeds.campaign + " and " + D.seeds.test + ", mulberry32, rounded)");
  ok(same(B.fits, D.fits), "the stored maximum-likelihood settings equal a fresh grid search for every case, model and record count");
  ok(D.records.campaign.every((r, i) => r[0] === D.records.campaignReduce[i][0]) && D.records.test.every((r, i) => r[0] === D.records.testReduce[i][0] && (r[0] < 12.5 ? r[1] === D.records.testReduce[i][1] : true)), "the load-reducing case: the same wind speeds, the same power below 12.5 m/s");
  const all = D.records.campaign.concat(D.records.test);
  ok(all.every(r => r[0] >= 3 && r[0] <= 20 && r[1] >= 0), "every record between 3 and 20 m/s, power at or above 0");
  ok(D.records.campaign.length === 64 && D.records.test.length === 400, "64 records to fit, 400 to score");
}
// ---------------- the linear algebra
{
  const A = [[4, 2, 0.6], [2, 5, 1], [0.6, 1, 3]], Lc = M.chol(A);
  let e = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += Lc[i][k] * Lc[j][k]; e = Math.max(e, Math.abs(s - A[i][j])); }
  ok(e < 1e-12 && M.chol([[1, 2], [2, 1]]) === null, "Cholesky: L L^T = A; an indefinite matrix gives null");
  // a GP prediction against an explicit inverse (Gauss-Jordan), one and two sources
  const inv = Mx => { const n = Mx.length, a = Mx.map((r, i) => r.concat(r.map((_, j) => (i === j ? 1 : 0)))); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; [a[c], a[p]] = [a[p], a[c]]; const d = a[c][c]; for (let k = 0; k < 2 * n; k++) a[c][k] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]; } } return a.map(r => r.slice(n)); };
  const mul = (P, Q) => P.map(r => Q[0].map((_, j) => r.reduce((s, x, k) => s + x * Q[k][j], 0))), tr = P => P[0].map((_, j) => P.map(r => r[j]));
  [false, true].forEach(two => {
    const recs = D.records.campaign.slice(0, 7), hp = { ell: 2.5, sf: 700, sn: 50 }, F = M.fit(T, recs, hp, two);
    const Xv = recs.map(r => r[0]), y = recs.map(r => [r[1]]), K = Xv.map(a => Xv.map(b => M.kern(a, b, hp))).map((r, i) => r.map((v, j) => v + (i === j ? hp.sn ** 2 : 0)));
    const Ki = inv(K), H = Xv.map(v => M.basis(T, v, two)), A2 = mul(mul(tr(H), Ki), H), beta = mul(mul(mul(inv(A2), tr(H)), Ki), y).map(r => r[0]);
    const v = 9.3, k = Xv.map(a => [M.kern(v, a, hp)]), h = [M.basis(T, v, two)], res = y.map((r, i) => [r[0] - H[i].reduce((s, x, c) => s + x * beta[c], 0)]);
    const m = h[0].reduce((s, x, c) => s + x * beta[c], 0) + mul(mul(tr(k), Ki), res)[0][0];
    const u = h[0].map((x, c) => x - mul(mul(tr(H), Ki), k)[c][0]), lat = hp.sf ** 2 - mul(mul(tr(k), Ki), k)[0][0] + mul(mul([u], inv(A2)), u.map(z => [z]))[0][0];
    const q = M.predict(F, v);
    ok(near(q.m, m, 1e-6) && near(q.lat, lat, 1e-6) && near(q.sd, Math.sqrt(lat + hp.sn ** 2), 1e-8) && F.beta.every((b, c) => near(b, beta[c], 1e-6)), (two ? "two" : "one") + " source(s): mean, band and generalized least squares equal a direct solve with explicit inverses");
    const ll = -0.5 * mul(mul(tr(res), Ki), res)[0][0] - 0.5 * Math.log(K.length === 7 ? (() => { const Lk = M.chol(K); let d = 0; for (let i = 0; i < 7; i++) d += 2 * Math.log(Lk[i][i]); return Math.exp(d); })() : 1) - 3.5 * Math.log(2 * Math.PI);
    ok(near(F.ll, ll, 1e-6), (two ? "two" : "one") + " source(s): the log-likelihood");
  });
  ok(near(M.invPhi(0.95), 1.6448536269514722, 1e-13) && near(M.invPhi(0.975), 1.959963984540054, 1e-13) && near(M.invPhi(0.05), -1.6448536269514722, 1e-13) && near(M.invPhi(0.75), 0.6744897501960817, 1e-13), "the inverse normal equals SciPy's norm.ppf to 1e-13 at 5, 75, 95 and 97.5%");
  // pinball: the definition, and its minimum at the true quantile for a large normal sample
  ok(near(M.pinball(10, 10, 1), (() => { let s = 0; M.TAU.forEach(t => { const q = 10 + M.invPhi(t); s += 10 >= q ? t * (10 - q) : (1 - t) * (q - 10); }); return s / 19; })(), 1e-12), "pinball loss: the mean over 19 levels of tau (y - q) above q and (1 - tau)(q - y) below");
}
// ---------------- the stored fits: unique and inside the grid
const STORED = [];
["base", "reduce"].forEach(mode => D.sweep.forEach(n => [false, true].forEach(two => {
  const b = M.search(T, M.campaign(D, n, mode === "reduce" ? "reduce" : null), two, D.grid);
  STORED.push({ mode, n, two, margin: b.margin, edge: b.edge });
})));
ok(STORED.every(s => s.margin > 1e-6), "every stored choice wins by more than 1e-6 in log-likelihood (smallest " + Math.min(...STORED.map(s => s.margin)).toFixed(4) + ")");
ok(STORED.every(s => s.edge.length === 0), "no stored choice sits at an end of its grid: " + STORED.filter(s => s.edge.length).map(s => s.mode + " " + s.n + " " + s.two + " " + s.edge).join("; "));

// ---------------- every number: the facts
const t0 = Date.now(), F = M.facts(D), factsMs = Date.now() - t0, N0 = D.n0, SW = D.sweep;
const b = F.sc.base[N0], r = F.sc.reduce[N0];
ok(F.top.lo === 11 && near(F.top.gap, 239, 0.5) && D.guess.find(g => g.value === "knee").label === "10 to 13 m/s, around rated speed", "step 1: records furthest below the maker's curve at 11–12 m/s, inside the answer's range");
ok(F.step2[1].vmax === 11.91 && near(F.step2[2].vmax, 15.47, 0) && F.step2.every(s => s.w.v === 20), "step 2: 16 records stop at 11.9 m/s, 32 reach 15.5 m/s; the band is widest at 20 m/s each time");
ok(F.ml.hp.ell === 4.6 && F.ml.hp.sf === 780 && F.ml.hp.sn === 80 && JSON.stringify(D.fits.base.one[N0]) === JSON.stringify({ ell: 4.6, sf: 780, sn: 80 }) && D.grid.ell.length * D.grid.sf.length * D.grid.sn.length === 3808, "step 3: the records choose 4.6 m/s, 780 kW, 80 kW on a grid of 3,808 settings (the stored choice)");
ok(kw(F.step4[0].own) === "75 kW" && kw(F.step4[0].held) === "126 kW" && kw(F.step4[1].own) === "2 kW" && kw(F.step4[1].held) === "506 kW" && F.step4[2].held > F.step4[0].held, "step 4: own records against new ones: 75 and 126 kW; very short 2 and 506 kW; very long worse than the choice");
ok(pct(b[0].cov[90]) === "95.5%" && b[0].cov[90] > 0.9 + F.se90 && near(F.se90, 0.03, 1e-9) && b[0].byRange.map(x => pct(x.cov90, 0)).join() === "99%,88%,100%", "step 5: 95.5% overall, beyond 90% ± 3 points ('a little wide'); 99, 88 and 100% by range");
ok(kw(b[0].rmse) === "126 kW" && kw(b[1].rmse) === "85 kW" && kw(b[0].width) === "391 kW" && kw(b[1].width) === "287 kW" && pct(b[1].cov[90]) === "92.0%" && Math.abs(b[1].cov[90] - 0.9) <= F.se90, "step 6: RMSE 126 → 85 kW, width 391 → 287 kW, the two-source band holds 92.0% (within chance of 90%)");
{
  const g = SW.map(n => F.sc.base[n][0].rmse - F.sc.base[n][1].rmse);
  ok(kw(g[0]) === "41 kW" && kw(g[g.length - 1]) === "5 kW" && g[g.length - 1] < 0.1 * F.sc.base[SW[SW.length - 1]][1].rmse && g.every(x => x > 0), "step 7: two sources 41 kW closer at 16 records, 5 kW at 64 (under 10% of the RMSE), closer at every count");
}
ok(pct(r[1].byRange[2].cov90, 0) === "58%" && pct(r[0].byRange[2].cov90, 0) === "100%" && r[0].byRange[2].n === 26, "step 8: load-reducing mode, 13–20 m/s: two sources hold 58%, one source 100% (26 records)");
ok(Math.abs(r[0].pinball - r[1].pinball) / Math.min(r[0].pinball, r[1].pinball) < 0.02 && r[0].rmse < r[1].rmse && Math.abs(r[0].rmse - r[1].rmse) > 10, "step 9: pinball losses within 2% ('about equal'), while RMSE and high-wind coverage differ clearly");
{ const two = F.two; ok(near(F.rho, two.beta[1] / 1000, 0) && F.rho > 0.8 && F.rho < 0.9, "step 6: rho = " + F.rho.toFixed(2)); }
{ const ref = M.reference(D); ok(JSON.stringify(ref) === JSON.stringify(D.reference), "the data file's reference block is up to date (run with --write)"); }

// ---------------- numbers on the page (static text)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const TX = text(OWN);
const has = (s, what) => ok(TX.includes(s), "page: " + what + ": '" + s + "'");
has("In step 5 it held " + pct(b[0].byRange[0].cov90, 0) + " at 3–8 m/s but " + pct(b[0].byRange[1].cov90, 0) + " at 8–13 m/s.", "myth 1 = step 5");
has("the two-source band held " + pct(r[1].byRange[2].cov90, 0) + " of new records at 13–20 m/s against the one-source band's " + pct(r[0].byRange[2].cov90, 0), "myth 2 = step 8");
has("missed its own records by " + kw(F.step4[1].own) + " and new ones by " + kw(F.step4[1].held), "myth 3 = step 4");
ok(near(2 * Math.sqrt(0.9 * 0.1 / 400), 0.03, 1e-12) && TX.includes("√(0.9 × 0.1 ÷ 400) × 2 = 3 points"), "quiz 1: two standard errors of 90% over 400 records = 3 points");
has(kw(b[0].rmse).replace(" kW", "") + " → " + kw(b[1].rmse), "numbers to remember: RMSE one to two sources");
has(pct(r[1].byRange[2].cov90, 0) + " against " + pct(r[0].byRange[2].cov90, 0), "numbers to remember: high-wind coverage");
ok(Math.round(16 ** 3 / 3) === 1365 && Math.round(1000 ** 3 / 3 / 1e6) === 333 && TX.includes("about 1,400 for 16 records, about 330 million for 1,000"), "numbers to remember: n³/3 for 16 and 1,000 records");
has("the page's grid has " + (D.grid.ell.length * D.grid.sf.length * D.grid.sn.length).toLocaleString("en-US") + " settings", "Go deeper: the grid's size");
has("About 40 guided minutes in nine steps.", "the time line");
has("outside the approximate 95% sampling range of ± 3 points for independent records, so sampling alone is unlikely to explain it.", "quiz 1: a sampling range, not a boundary of chance");
has("Approximate 95% sampling range of the share of 400 independent new records inside a 90% band (two standard errors).", "numbers to remember: the sampling range");
ok(!/beyond chance|chance alone|by chance|wide but honest|the most likely of/.test(TX + JS), "no 'beyond chance', 'wide but honest' or 'most likely settings'");
has("$H$ stacks $h$ at every record, one row each.", "Go deeper: H defined");
ok(/\*\*Symbols\.\*\* \$v\$ wind speed/.test(PAGE), "Go deeper: a symbol key before the formulas");
has("64 to fit (seed 9, used in order) and 400 others to score (seed 2023)", "data note: counts and seeds");
ok(/12% turbulence\) and 3% lower\./.test(TX) && /power scatter combines 15 kW of background noise with an approximate wind-error term, 0\.3 m\/s times the curve's slope/.test(TX) && T.ti === 0.12 && T.loss === 0.03 && T.powErr === 15 && T.windErr === 0.3, "data note: the toy's recipe");
ok(/k = 2, c = 8 m\/s\) between 3 and 20 m\/s/.test(TX) && T.weibull.k === 2 && T.weibull.c === 8, "data note: the Weibull wind speeds");
ok(/1\.645/.test(PAGE) && near(M.ZL[90], 1.6448536269514722, 1e-12), "Go deeper: the 90% band is m ± 1.645 σ");

// ---------------- the page on a stub document
const sliders = [];
(async () => {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.isDark = () => false;
  const plotSpecs = [];
  ["cards", "predict", "table", "boundary", "gp"].forEach(n => load(n, E));
  E.LX.Plot = (host, o) => { const box = E.LX.H("div", { class: "stub-plot" }, host); return { box, render: spec => { plotSpecs.push(spec); box.setAttribute("data-bars", String((spec.bars || []).length)); }, text: null }; };
  E.LX.Slider = (host, o) => { let v = o.value; const w = E.LX.H("div", { class: "stub-slider", "data-label": o.label }, host);
    const sl = { el: w, label: o.label, val: () => v, set: (x, fire) => { v = x; if (fire && o.onChange) o.onChange(v); }, _set(x) { v = x; if (o.onChange) o.onChange(v); } }; sliders.push(sl); return sl; };
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "m09") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance,
                 setTimeout: f => { f(); return 0; }, clearTimeout: () => {}, Event: function (t) { this.type = t; } };
  const xp = E.LX.H("div", { id: "m9-explain" }, E.body);
  vm.runInNewContext(JS, mctx);
  ok(E.LX.M9 && typeof E.LX.M9.fit === "function", "LX.M9 (components/gp.js, shared with CF8) is on the page");
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "m09" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { m09_surrogates_uq: D }, root); } catch (err) { threw = err.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  if (threw) return finish();
  const cards = demo.cards, card = () => live.querySelector(".lx-stepcard");
  const next = () => card().querySelectorAll(".lx-step-foot button").filter(x => /Next/.test(x.textContent))[0];
  const saw = () => { const a = card().querySelectorAll(".lx-saw"); return text((a[a.length - 1] || { innerHTML: "" }).innerHTML); };
  const stepText = () => text(card().querySelector(".lx-step-text").innerHTML);
  const btns = re => card().querySelectorAll("button").filter(x => re.test(x.textContent));
  const words = s => s.split(/\s+/).filter(Boolean).length, sents = s => s.split(/(?<=[.?!])\s+(?=[A-Z0-9“"])/).length;
  const budget = (where, s, w) => ok(words(s) <= w && sents(s) <= 2, where + ": " + words(s) + " words, " + sents(s) + " sentences (at most " + w + " and 2): " + s.slice(0, 70));
  const sawBudget = i => budget("step " + i + " result", saw(), 40);
  ok(cards.count === 9, "nine step cards");
  for (let i = 0; i < cards.count; i++) { cards.go(i); budget("step " + (i + 1) + " text", stepText(), 35); ok(next() && (i === cards.count - 1 || next().disabled), "step " + (i + 1) + ": Next waits for the action"); }
  // 1
  cards.go(0); card().querySelectorAll(".lx-choice")[2].click();
  ok(!next().disabled && saw() === "Furthest below: 11–12 m/s, 239 kW on average. The real curve is a band, and its shape near rated speed differs from the maker's line.", "step 1 (" + saw() + ")"); sawBudget(1);
  ok(plotSpecs[plotSpecs.length - 1].lines.some(l => l.dots && l.pts.length === 400), "step 1: the chart shows the 400 records");
  { // the text version of step 1: the records by 1 m/s bin, with count, mean power and mean gap below the maker's curve
    const sp = plotSpecs[plotSpecs.length - 1], h = sp.text.head, rows = sp.text.rows, test = M.heldOut(D), G1 = M.gaps(T, test);
    const gi = h.indexOf("400 records: mean gap below the maker's curve"), ci = h.indexOf("400 records: count, mean power");
    ok(rows.length === 17 && gi > 0 && ci > 0 && rows.every((r, k) => r[0] === (3 + k) + "–" + (4 + k) + " m/s" && (G1[k].n ? r[gi] === kw(G1[k].gap) && r[ci].startsWith(G1[k].n + " · ") : r[ci] === "none")), "step 1: the text version gives every bin's record count, mean power and gap (the gaps of step 1)");
    ok(rows[8][0] === "11–12 m/s" && rows[8][gi] === "239 kW" && rows.reduce((s, r) => s + (r[ci] === "none" ? 0 : +r[ci].split(" · ")[0]), 0) === 400, "step 1: the text version shows 239 kW at 11–12 m/s and counts all 400 records");
    const b9 = M.recBin(T, test, 9), raw = test.filter(r => r[0] >= 9 && r[0] < 10); ok(b9.n === raw.length && near(b9.mean, raw.reduce((s, r) => s + r[1], 0) / raw.length, 1e-9), "recBin: count and mean power of a bin by hand"); }
  // 2
  cards.go(1); card().querySelectorAll(".lx-seg button").forEach(x => x.click());
  ok(!next().disabled && saw() === "The band is narrow near records and widest beyond the last one: 11.9 m/s with 16 records. Records up to 15.5 m/s cut its mean width from " + kw(F.step2[1].w.mean) + " to " + kw(F.step2[2].w.mean) + ".", "step 2 (" + saw() + ")"); sawBudget(2);
  ok(/32 records, up to 15\.5 m\/s: the 90% band is 576 kW wide on average, widest at 20 m\/s\./.test(text(card().innerHTML)), "step 2: the readout");
  // 3
  cards.go(2);
  ok(/below the best on the grid/.test(text(card().innerHTML)), "step 3: the start settings are below the best");
  btns(/Let the records choose/)[0].click();
  ok(!next().disabled && saw() === "The records choose a length-scale of 4.6 m/s, noise 80 kW and signal size 780 kW: the settings giving these records the highest likelihood among 3,808 on a grid, searched in your browser.", "step 3 (" + saw() + ")"); sawBudget(3);
  ok(/the best on the grid\./.test(text(card().innerHTML)) && /Signal size, how far the curve may swing from its average, held at 780 kW\./.test(text(card().innerHTML)) && /log-likelihood -?[0-9.]+ \(how probable these records are under the settings; higher is better\)/.test(text(card().innerHTML)), "step 3: the readout says best and explains the log-likelihood; the signal size is stated and explained");
  ok(/by maximum likelihood\.$/.test(stepText()) && /\[\[maximum-likelihood\|maximum likelihood\]\]/.test(JS), "step 3 text: maximum likelihood, marked in the glossary");
  // 4
  cards.go(3); card().querySelectorAll(".lx-seg button").forEach(x => x.click());
  ok(!next().disabled && saw() === "The very short length-scale threads every record: 2 kW off on its own, 506 kW on new ones. Judge a fit only on records it has not seen.", "step 4 (" + saw() + ")"); sawBudget(4);
  // 5
  cards.go(4); card().querySelectorAll(".lx-seg button")[0].click();
  ok(/50% band: holds 52\.0% of 400 new records; sampling alone moves this by about ± 5 points \(two standard errors, independent records\)\./.test(text(card().innerHTML)) && pct(b[0].cov[50]) === "52.0%" && (200 * Math.sqrt(0.25 / 400)).toFixed(0) === "5", "step 5: the 50% readout with its chance band");
  card().querySelectorAll(".lx-seg button")[2].click();
  ok(!next().disabled && saw() === "The 90% band holds 95.5%: a little wide. By speed, 99%, 88% and 100%: one noise level cannot fit scatter that grows where the curve is steep.", "step 5 (" + saw() + ")"); sawBudget(5);
  // 6
  cards.go(5); card().querySelectorAll(".lx-seg button")[1].click();
  ok(!next().disabled && saw() === "Same 16 records: two sources cut the RMSE from 126 to 85 kW and the mean band width from 391 to 287 kW. Yet at 8–13 m/s, the steep part, its 90% band holds only 82% (one source: 88%).", "step 6 (" + saw() + ")"); sawBudget(6);
  ok(/90% band holds, 8–13 m\/s \(131 records\)88%82%/.test(text(card().innerHTML)) && b[1].byRange[1].n === 131 && pct(b[1].byRange[1].cov90) === "81.7%" && pct(b[0].byRange[1].cov90) === "87.8%", "step 6: the table shows both fits' coverage at 8–13 m/s, 88% and 82% of 131 records");
  ok(new RegExp("ρ = " + F.rho.toFixed(2) + " times the maker's curve, plus " + kw(F.two.beta[0])).test(text(card().innerHTML)), "step 6: rho and the shift");
  // 7
  cards.go(6); const sl7 = sliders[sliders.length - 1];
  for (let i = 1; i < SW.length; i++) sl7._set(i);
  ok(!next().disabled && saw() === "At 16 records two sources are 41 kW closer; at 64, 5 kW. Once records cover the speeds that matter, the cheap curve adds little.", "step 7 (" + saw() + ")"); sawBudget(7);
  // 8
  cards.go(7); card().querySelectorAll(".lx-choice")[0].click();
  ok(!next().disabled && saw() === "Above 13 m/s the two-source band holds 58% of new records; the wider one-source band holds 100% in this example. Neither was validated beyond its last record: cheap data mislead where they are wrong and unchecked.", "step 8 (" + saw() + ")"); sawBudget(8);
  { const sp = plotSpecs[plotSpecs.length - 1], h = sp.text.head, r15 = sp.text.rows.find(x => x[0] === "15–16 m/s");
    ok(h.includes("Field curve (hidden from the fits)") && h.includes("400 new records: count, mean power") && h.includes("16 records: mean gap below the maker's curve") && r15 && r15[h.indexOf("Field curve (hidden from the fits)")] === kw(M.field(T, 15.5, "reduce")), "step 8: the text version lists the hidden field curve and both sets of records by bin"); }
  ok(/the first 16 records stop at 11\.9 m\/s\./.test(stepText()), "step 8 text: where the records stop");
  { const a8 = M.fitStored(D, N0, false, "reduce"); ok(new RegExp("falls back toward its average, " + kw(a8.beta[0]).replace(",", ",") + ": close to this turbine by luck").test(text(card().innerHTML)) && a8.beta[0] > 900 && a8.beta[0] < 1000 && M.predict(a8, 20).m < 1200 && M.predict(M.fitStored(D, N0, false), 20).m < 1200 && M.field(T, 20) > 1900, "step 8: the one-source curve falls toward its average beyond the records in both cases (" + kw(a8.beta[0]) + ")"); }
  // 9
  cards.go(8); card().querySelectorAll(".lx-seg button")[3].click();
  ok(next().disabled && /This one shows the failure/.test(saw()), "step 9: high-wind coverage shows the failure, Next still waits");
  card().querySelectorAll(".lx-seg button")[2].click();
  ok(!next().disabled && saw() === "Averaged over all 400 records, pinball loss rates them about equal; only 26 records lie above 13 m/s, where the two-source band fails. Score where the decision needs it, not only on average.", "step 9 (" + saw() + ")"); sawBudget(9);
  ok(live.querySelectorAll("[aria-live]").length >= 2, "results are announced in aria-live regions");
  ["mid", "step-2", "step-7", "step-9"].forEach(sname => { let q = null; try { q = demo.fn(sname); } catch (err) { q = null; } ok(q && q.view === sname, "demo state " + sname + " runs"); });
  // the explain layer
  const XT = text(xp.innerHTML);
  ok(XT.includes("Reference case, whatever you set above: the first 16 records and the settings they chose (step 3).") && XT.includes("the last record is at 11.9 m/s; the band is widest at 20 m/s"), "explain: the annotated fit states the reference case and its numbers");
  ok(XT.includes("126 kW, 95.5% (88% at 8–13 m/s)") && XT.includes("85 kW, 92.0% (82% at 8–13 m/s)") && XT.includes("100%") && XT.includes("58%"), "explain: the comparison table");
  finish();
})().catch(err => { ok(false, "the stub page test threw: " + (err && err.stack || err)); finish(); });

function finish() {
  // ---------------- the lab notebook
  ok(NB.length > 0, "the lab notebook exists (learn/notebooks/" + ID + ".ipynb; written by its notebook build step)");
  if (NB) {
    const nb = JSON.parse(NB), src = nb.cells.map(c => c.source.join("")).join("\n");
    ok(nb.cells.every(c => c.cell_type === "markdown" || (c.outputs.length === 0 && c.execution_count === null)), "the notebook is stored without outputs");
    ok(/m09-surrogates-uq\.json/.test(src) && /REF\["ml16"\]/.test(src) && /REF\["scores"\]/.test(src) && /REF\["predict16"\]/.test(src) && /REF\["sweepRMSE"\]/.test(src), "the notebook asserts the reference block");
    ok(/about 45 minutes, plus 60 minutes of practice/.test(src), "the notebook's times");
  }
  // ---------------- scope
  const ALL = [PAGE, RAW, JS, SIDEYML, NB].join("\n");
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term on the page, in the data, the script, the sidecar or the notebook");
  ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere");
  ok(!/\bFOAK\b|\bNOAK\b|first[- ]of[- ]a[- ]kind|learning[- ](curve|rate)|order[- ]book|anchor[- ](customer|buyer)|subsidy[- ]free|smr-dc|projects\/|research\.(html|qmd)/i.test(ALL), "no deny-listed term");
  const OKH = h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://gaussianprocess.org/gpml/" || /^https:\/\/github\.com\/Henryutd2021\/(mfgpr-wind-power-curve|wind-uq-surrogate)$/.test(h) || /^(\.\.\/assets\/learn\/data\/[a-z0-9-]+\.json|notebooks\/[a-z0-9-]+\.ipynb|[0-9a-z-]+\.html(#[a-z0-9-]+)?)$/.test(h);
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...NB.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(m => m[0]), [...PAGE.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
  ok(hrefs.length > 5 && hrefs.every(OKH), "links: learn pages, downloads, doi.org, gaussianprocess.org and the two repositories only: " + hrefs.filter(h => !OKH(h)).join(" "));
  const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
  ok(keys.length === 3 && keys.filter(k => k === "excerpt:uq-mfgpr").length === 2 && keys.filter(k => k === "excerpt:wind-uq").length === 1, "excerpt keys: uq-mfgpr twice, wind-uq once");
  ok(!/Feng|Zhang|Sun, M|Chartan|Hodge/.test(ALL), "no collaborator names from the repositories' READMEs");
  // ---------------- path.yml, title, glossary
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(x => new RegExp("\\n  id: " + ID + "\\n").test(x)) || "";
  ok(/\n  status: active\n/.test(entry) && /\n  minutes: 40\n/.test(entry) && /lab_minutes: 45/.test(entry) && /practice_minutes: 60/.test(entry) && /after: \[M7, K6\]/.test(entry), "path.yml: active, 40 + 45 + 60 minutes, after M7 and K6 (learn_map_v2.yml)");
  const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
  ok(fm("title") === py("title") && fm("subtitle") === py("subtitle"), "the page's title and subtitle equal path.yml's");
  const GL = fs.readFileSync(path.join(SITE, "learn/glossary.yml"), "utf8") + "\n" + fs.readdirSync(path.join(SITE, "learn/_w1")).map(f => fs.readFileSync(path.join(SITE, "learn/_w1", f), "utf8")).join("\n");
  const marks = [...JS.matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]).concat([...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]));
  ok(marks.length >= 8 && marks.every(m => new RegExp("id: " + m + "\\n").test(GL)), "every glossary mark has a definition: " + marks.filter(m => !new RegExp("id: " + m + "\\n").test(GL)).join(", "));
  researchWording(entry);
  // ---------------- speed
  { const t1 = Date.now(); M.search(T, M.campaign(D, N0), false, D.grid); const a = Date.now() - t1; ok(a < 400, "speed in Node: step 3's grid search " + a + " ms (facts " + factsMs + " ms)"); }
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
}

// ---------------- research wording: approved excerpts only
function researchWording(entry) {
  const R = X.register(["E1", "E12", "E13"]);
  if (!R) { console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); research wording not checked"); return; }
  ok(R.ack, "the acknowledgement sentence is in the approved wording");
  const RX = /\b(the study|study's|paper|article|IDETC|Li et al|course author|excerpt|research project|SDWPF|SCADA|kernel density|nine test turbines|DOE|funding|plants? (with|without) (power )?measurements|held-out plants)\b/i;
  const NOT_RESEARCH = [
    [/^Where this came up in research$/, "heading"],
    [/^Approved excerpt of: Li et al\., ASME IDETC 2023\.$/, "provenance label (E12.16's short citation, as E1's)"],
    [/^This page's turbine is a toy: invented round numbers, not the studies' data, equations or results\.$/, "provenance of the toy"],
    [/^Case file CF8: learning a wind turbine's power curve from scarce data\.$/, "navigation (the case file's title)"],
    [/^(mfgpr-wind-power-curve|wind-uq-surrogate): public example repository · MIT licence · synthetic data\.$/, "repository label"],
    [/^Try it yourself with open code$/, "heading"],
    [/^Optional, about 30 minutes each; needs Python 3\.10 or later \(lesson B2\)\.$/, "time"]
  ];
  const bad = [], strict = (w, l) => l.forEach(s => { const o = X.offending(R, NOT_RESEARCH, s); if (o) bad.push(w + ": " + o); }), signalled = (w, l) => l.forEach(s => { if (RX.test(s)) { const o = X.offending(R, NOT_RESEARCH, s); if (o) bad.push(w + ": " + o); } });
  const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
  let REST = OWN.replace(/<!-- m9-fallback:start[\s\S]*?<!-- m9-fallback:end -->/, " ").replace(/<style>[\s\S]*?<\/style>/, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const real = (REST.match(/<div class="lx-card lx-real">[\s\S]*?\n<\/div>/) || [""])[0];
  ok(real.length > 0, "page zone found: the research card");
  strict("page, research card", X.elements(real)); REST = REST.replace(real, " ");
  const tri = (REST.match(/<div class="lx-card lx-case-try">[\s\S]*?\n<\/div>/) || [""])[0];
  ok(tri.length > 0, "page zone found: try it yourself");
  [...tri.matchAll(/<p><b>Try it yourself:<\/b> ([\s\S]*?)<\/p>/g)].forEach(m => strict("page, try it yourself", ["Try it yourself: " + X.norm(m[1])]));
  ok([...tri.matchAll(/<p><b>Try it yourself:<\/b>/g)].length === 2, "try it yourself: E12.15 and E13.9");
  const src = (REST.match(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/) || [""])[0], lis = [...src.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => X.norm(m[0]));
  strict("page, sources", lis.filter(s => /Li et al|mfgpr|wind-uq/.test(s)));
  signalled("page", X.elements(REST.replace(/^---[\s\S]*?\n---\n/, " ")));
  const FM = (PAGE.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
  signalled("front matter", [...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].map(m => m[2]));
  signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome|lab): "(.*)"$/gm)].map(m => m[2]));
  const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
  signalled("data", strings(D).filter(x => ["about"].indexOf(x[0]) < 0).map(x => x[1]));
  const literals = JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
  signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
  if (NB) { const nb = JSON.parse(NB); signalled("notebook", nb.cells.flatMap(c => c.source.join("").split("\n")).map(s => s.replace(/^#+ |^\s*#\s?|^\s*[-*] |^\d+\. /, ""))); }
  ok(bad.length === 0, "research wording: every sentence about the studies is approved:\n  " + bad.join("\n  "));
  // the excerpt blocks: each sentence approved; E1 whole; E12.5, E12.6; E13.1-E13.8 in order, then the acknowledgement
  const blocks = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<\/blockquote>/g)];
  const paras = q => [...q.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => X.norm(x[1]));
  ok(blocks.length === 3 && blocks.every(m => paras(m[2].replace(/<footer>[\s\S]*<\/footer>/, "")).every(s => X.approved(R, s))), "three excerpt blocks, every sentence approved");
  const e13 = blocks.find(m => m[1] === "excerpt:wind-uq");
  ok(e13 && paras(e13[2]).join(" ") === ["E13.1", "E13.2", "E13.3", "E13.4", "E13.5", "E13.6", "E13.7", "E13.8"].map(k => X.norm(R.raw[k])).join(" ") && X.norm((e13[2].match(/<footer>([\s\S]*?)<\/footer>/) || [])[1] || "") === X.ACK, "the E13 block: E13.1-E13.8 in order, and the acknowledgement word for word as its footer");
  ok(blocks.filter(m => m[1] === "excerpt:uq-mfgpr").map(m => paras(m[2].replace(/<footer>[\s\S]*<\/footer>/, "")).join(" ")).join(" | ") === X.norm(R.raw.E1) + " | " + X.norm(R.raw["E12.5"] + " " + R.raw["E12.6"]), "the E1 block (with its citation) and the E12.5-E12.6 block, word for word");
}
