// test_k05-probability-statistics.js — Node tests for toolbox K5 (assets/learn/k05-probability-statistics.js): the data
// agree with lesson 4's file and quantiles; the statistics behave (identities, edge cases, a dependent case for expected
// values, sampling scatter against the standard error); the drill and the data tasks are right over many seeds; and every
// number the page states (the .qmd and the strings of the view) matches the model.
// With --write it rewrites the page's no-JS fallback block (k5-fallback markers) from the model; without, it checks it.
// Usage (from the site folder):  node _tests/learn/test_k05-probability-statistics.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k05-probability-statistics.js"));
const fc = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/04-forecasts.json"), "utf8"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const QPATH = path.join(SITE, "learn/k05-probability-statistics.qmd");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/k05-probability-statistics.js"), "utf8");
const S = K.summary(fc, town), pct = K.pct, share = K.share, int = K.int;

// ---------------- the no-JS fallback (static histogram, the eight facts, the summary table, the bins)
function fallback() {
  const W = 440, Hh = 258, m = { l: 48, r: 12, t: 22, b: 40 }, bins = K.histogram(K.tenths(fc), 10), top = 500;
  const sx = v => m.l + (v + 10) / 20 * (W - m.l - m.r), sy = v => Hh - m.b - v / top * (Hh - m.t - m.b), f = v => v.toFixed(1);
  let o = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-labelledby="k5-static-title">\n<title id="k5-static-title">Histogram of ${int(S.n)} hourly day-ahead forecast errors, Southwest Power Pool, January to April 2025, in 1-point bins: most hours lie from −2% up to +3%; mean ${pct(S.mean)}, median ${pct(S.median)}.</title>\n<g>`;
  [0, 100, 200, 300, 400, 500].forEach(v => { o += `<line x1="${m.l}" x2="${W - m.r}" y1="${f(sy(v))}" y2="${f(sy(v))}" class="k5-fb-grid"/><text x="${m.l - 6}" y="${f(sy(v) + 4)}" text-anchor="end" class="k5-fb-tick">${v}</text>`; });
  [[-10, "−10%"], [-5, "−5%"], [0, "0"], [5, "+5%"], [10, "+10%"]].forEach(t => { o += `<text x="${f(sx(t[0]))}" y="${Hh - m.b + 16}" text-anchor="${t[0] === -10 ? "start" : t[0] === 10 ? "end" : "middle"}" class="k5-fb-tick">${t[1]}</text>`; });
  o += `<text x="${f((sx(-10) + sx(10)) / 2)}" y="${Hh - 6}" text-anchor="middle" class="k5-fb-tick">error: actual minus forecast, % of the forecast</text><text x="${m.l - 6}" y="10" text-anchor="end" class="k5-fb-tick">hours</text></g>\n<g>`;
  bins.forEach(b => { o += `<rect x="${f(sx(b.lo) + 0.5)}" y="${f(sy(b.n))}" width="${f(sx(b.hi) - sx(b.lo) - 1)}" height="${f(sy(0) - sy(b.n))}" class="k5-fb-bar"/>`; });
  o += `<line x1="${f(sx(S.mean))}" x2="${f(sx(S.mean))}" y1="${m.t}" y2="${f(sy(0))}" class="k5-fb-mean"/><text x="${f(sx(S.mean) + 5)}" y="${m.t + 8}" class="k5-fb-tick">mean ${pct(S.mean)}</text></g>\n</svg>`;
  const L = S.levels;
  const facts = [
    `A histogram counts hours per bin: with 1-point bins, ${share(S.mid, 0)} of the ${int(S.n)} hours lie from −2% up to +3%; the errors run from ${pct(S.min)} to ${pct(S.max)}.`,
    `Centre: mean ${pct(S.mean)}, median ${pct(S.median)}. Demand came in above the forecast in ${share(S.pos, 0)} of hours.`,
    `Spread: standard deviation ${S.sd.toFixed(2)} points; mean ± 1 SD, from ${pct(S.lo1sd, 2)} to ${pct(S.hi1sd, 2)}, holds ${share(S.in1sd, 0)} of hours; the quartiles are ${pct(S.q25)} and ${pct(S.q75)}.`,
    `Chance by counting: ${int(S.above)} of ${int(S.n)} hours, ${share(S.aboveShare)}, had demand more than 5% above the forecast.`,
    `Nominal intervals from percentiles: 50% from ${pct(L["50"].lo)} to ${pct(L["50"].hi)}; 80% from ${pct(L["80"].lo)} to ${pct(L["80"].hi)} (lesson 4's band); 95% from ${pct(L["95"].lo)} to ${pct(L["95"].hi)}. Hours tied at the ends make them hold ${share(L["50"].n / S.n)}, ${share(L["80"].n / S.n)} and ${share(L["95"].n / S.n)}.`,
    `Samples scatter: the standard error of that share is ${(100 * S.se[0]).toFixed(1)} points for 10 random hours, ${(100 * S.se[1]).toFixed(1)} for 100 and ${(100 * S.se[2]).toFixed(1)} for 1,000.`,
    `Independence (illustrative): gas plants A and B, each out in ${share(S.plants.p, 0)} of hours, are both out in ${share(S.plants.both, 2)} of hours, about ${Math.round(S.plants.hoursYear)} a year, only if their outages are independent.`,
    `Expected value: with plants A (${S.plants.cc} MW) and B (${S.plants.pk} MW) each out ${share(S.plants.p, 0)} of the time, ${S.plants.ev} MW are out on average.`];
  let h = `<p class="lx-eyebrow">${int(S.n)} hourly forecast errors, January–April 2025</p>\n<div class="k5-fbfig">\n${o}\n</div>\n<ol>\n` + facts.map(t => `<li>${t}</li>`).join("\n") + `\n</ol>\n`;
  h += `<p class="lx-eyebrow">The summaries on this page</p>\n<div class="lx-scroll-x"><table class="lx-facts k5-fbtab">\n<thead><tr><th scope="col">Summary</th><th scope="col">Value</th></tr></thead>\n<tbody>\n`;
  [["Hours", int(S.n)], ["Mean", pct(S.mean)], ["Median", pct(S.median)], ["Standard deviation", S.sd.toFixed(2) + " points"], ["Quartiles", pct(S.q25) + " and " + pct(S.q75)],
   ["Share above +5%", share(S.aboveShare) + " (" + int(S.above) + " hours)"], ["80% interval (nominal)", pct(L["80"].lo) + " to " + pct(L["80"].hi)], ["95% interval (nominal)", pct(L["95"].lo) + " to " + pct(L["95"].hi)]]
    .forEach(r => { h += `<tr><td>${r[0]}</td><td class="n">${r[1]}</td></tr>\n`; });
  h += `</tbody></table></div>\n<details class="lx-textalt"><summary>Text version of the histogram</summary>\n<div class="lx-scroll-x"><table class="lx-mini-table"><thead><tr><th scope="col">Error, from</th><th scope="col">up to</th><th scope="col">Hours</th></tr></thead><tbody>\n`;
  bins.forEach(b => { h += `<tr><td>${pct(b.lo)}</td><td>${pct(b.hi)}</td><td>${int(b.n)}</td></tr>\n`; });
  h += `</tbody></table></div></details>\n<p class="lx-hint">With JavaScript on, you work through this step by step on the live chart.</p>`;
  return h;
}
const START = /<!-- k5-fallback:start[^>]*-->\n/, END = "<!-- k5-fallback:end -->";
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8"); const a = q.match(START), b = q.indexOf(END);
  if (!a || b < a.index) throw new Error("k5-fallback markers missing");
  q = q.slice(0, a.index + a[0].length) + fallback() + "\n" + q.slice(b); fs.writeFileSync(QPATH, q); console.log("fallback written");
}
const QMD = fs.readFileSync(QPATH, "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));
const inJS = (s, msg) => ok(JS.indexOf(s) >= 0, "view states " + (msg || JSON.stringify(s)));

// ---------------- data: lesson 4's file
{
  const t = K.tenths(fc), x = K.errors(fc);
  ok(t.length === 2716 && fc.jan_apr.hours === 2716 && S.n === 2716, "data: 2,716 hours, as in lesson 4");
  ok(t.every(Number.isInteger), "data: every value is a whole number of tenths of a percent");
  ok(t.every((v, i) => i === 0 || v >= t[i - 1]), "data: sorted");
  Object.keys(fc.jan_apr.quantiles).forEach(p => {
    const mine = K.quantile(x, +p), l4 = 100 * fc.jan_apr.quantiles[p];
    ok(Math.abs(mine - l4) <= 0.051, `data: percentile ${p} from the rounded values (${mine.toFixed(3)}) agrees with lesson 4's ${l4.toFixed(2)} to 0.05 point`);
  });
  ["0.1", "0.9", "0.025", "0.975", "0.25", "0.75"].forEach(p => ok(pct(K.quantile(x, +p)) === pct(100 * fc.jan_apr.quantiles[p]), `data: percentile ${p} prints the same as lesson 4 (${pct(100 * fc.jan_apr.quantiles[p])})`));
  ok(near(S.mayDec[0], 8.03, 1e-6) && near(S.mayDec[1], 14.71, 1e-6) && Math.round(S.mayDec[0]) === 8 && Math.round(S.mayDec[1]) === 15, "data: May–December forecast 8–15% above demand");
  ok(town.fleet.cc.mw === 150 && town.fleet.peaker.mw === 100, "data: Prairie Town's gas plants are 150 MW and 100 MW");
}

// ---------------- statistics: identities and edge cases
{
  const x = K.errors(fc);
  K.WIDTHS.forEach(w => {
    const B = K.histogram(K.tenths(fc), w);
    ok(B.reduce((a, b) => a + b.n, 0) === S.n, `histogram ${w}: counts add up to every hour`);
    ok(B.every((b, i) => i === 0 || near(b.lo, B[i - 1].hi)), `histogram ${w}: bins are contiguous`);
    ok(B.every(b => b.n === K.countIn(x, b.lo, b.hi - 0.1)), `histogram ${w}: each bin holds the values from its lower edge up to (not including) its upper edge`);
  });
  ok(K.histogram([-1, 0, 9, 10], 10).map(b => b.n).join() === "1,2,1", "histogram: floor bins for negatives and edges (−0.1 is below 0; 1.0 starts the next bin)");
  ok(K.mean([1, 2, 3, 10]) === 4 && K.median([1, 2, 3, 10]) === 2.5 && K.median([5, 1, 3]) === 3, "mean and median of small lists");
  ok(K.sd([2, 4, 4, 4, 5, 5, 7, 9]) === 2 && near(K.sd([2, 4, 4, 4, 5, 5, 7, 9], true), Math.sqrt(32 / 7)), "sd: the textbook example (2), and the n − 1 version");
  ok(Math.abs(S.sd - S.sdSample) < 0.001, "sd: n or n − 1 differ by under 0.001 point here");
  ok(K.quantile([1, 2, 3, 4], 0) === 1 && K.quantile([1, 2, 3, 4], 1) === 4 && K.quantile([1, 2, 3, 4], 0.5) === 2.5 && K.quantile([7], 0.3) === 7, "quantile: ends, interpolation, a single value");
  let mono = true; for (let p = 0; p <= 1.0001; p += 0.01) if (K.quantile(x, Math.min(1, p + 0.01)) < K.quantile(x, Math.min(1, p)) - 1e-12) mono = false;
  ok(mono, "quantile: never decreases with p");
  [-9, -2.3, 0, 0.7, 5, 9.8].forEach(t => ok(K.countBelow(x, t) + K.countAbove(x, t) + K.countIn(x, t, t) === S.n, `counts: below + above + at ${t} = all hours`));
  ok(S.zero + K.countAbove(x, 0) + K.countBelow(x, 0) === S.n && near(S.pos + S.neg + S.zero / S.n, 1), "counts: positive, zero and negative errors cover every hour");
  ok(near(S.median, K.quantile(x, 0.5)) && S.median === 0.7, "median = 50th percentile = +0.7%");
  Object.keys(K.LEVELS).forEach(k => { const L = S.levels[k], want = K.LEVELS[k][1] - K.LEVELS[k][0]; ok(L.n / S.n >= want - 0.001 && L.n / S.n <= want + 0.02, `interval ${k}%: holds ${share(L.n / S.n)} of hours (ties at the ends add a little)`); });
  // joint chances and expected values
  [[0.05, 0.05], [0.1, 0.3], [0, 0.4], [1, 0.2]].forEach(([a, b]) => { const J = K.joint(a, b); ok(near(J.none + J.one + J.both, 1) && near(J.any, 1 - J.none) && near(J.both, a * b), `joint ${a}, ${b}: cases add to 1`); });
  const C = K.plantCases(town, 0.05);
  ok(near(C.reduce((s, c) => s + c.p, 0), 1) && near(K.expected(C), 0.05 * 150 + 0.05 * 100) && S.plants.ev === 12.5, "expected MW out: 12.5 = 5% × 150 + 5% × 100");
  // a dependent case (illustrative): both out 3% of hours, each still out 5% overall -> the same expected MW, a larger joint chance
  const dep = [{ mw: 0, p: 0.93 }, { mw: 150, p: 0.02 }, { mw: 100, p: 0.02 }, { mw: 250, p: 0.03 }];
  ok(near(dep.reduce((s, c) => s + c.p, 0), 1) && near(K.expected(dep), 12.5) && 0.03 > S.plants.both, "dependence: the expected value is unchanged while the joint chance rises (the explain layer's note)");
  ok(near(S.plants.hoursYear, 21.9, 1e-9) && Math.round(S.plants.hoursYear) === 22, "both out: 0.25% of 8,760 h = 21.9 h, about 22");
  // one wild reading
  const Wd = S.wild;
  ok(sgn2(Wd.mean) === "+0.04" && Wd.median === 0 && sgn2(Wd.sd) === "+0.65" && Wd.iqr === 0 && sgn2(100 * Wd.above5) === "+0.03", `wild reading: mean +0.04, median 0, SD +0.65, middle half 0, share +0.03 point (${JSON.stringify(Wd)})`);
}
function sgn2(v) { return K.sgn(v, 2); }

// ---------------- sampling: the scatter of shares matches the standard error
{
  const x = K.errors(fc), r = K.rng(7);
  [10, 100, 1000].forEach((n, i) => {
    const est = K.sampleShares(x, n, 3000, r, K.THRESH), m = K.mean(est), s = K.sd(est);
    ok(Math.abs(m - S.aboveShare) < 3 * S.se[i] / Math.sqrt(3000) + 0.002, `sampling ${n}: estimates centre on ${share(S.aboveShare)} (got ${share(m, 2)})`);
    ok(Math.abs(s / S.se[i] - 1) < 0.08, `sampling ${n}: their spread matches the standard error ${(100 * S.se[i]).toFixed(2)} points (got ${(100 * s).toFixed(2)})`);
  });
  const a = K.sampleShares(x, 10, 5, K.rng(3), 5), b = K.sampleShares(x, 10, 5, K.rng(3), 5);
  ok(a.join() === b.join(), "sampling: seeded draws repeat");
  ok(K.draw(x, 50, K.rng(9)).every(v => x.indexOf(v) >= 0), "sampling: draws come from the hours");
}

// ---------------- every number the page and the view state
{
  const L = S.levels;
  ok(near(S.mean, 0.8, 0.005) && pct(S.mean) === "+0.8%" && pct(S.median) === "+0.7%", "centre: mean +0.8%, median +0.7%");
  ok(S.sd.toFixed(2) === "2.45" && pct(S.lo1sd, 2) === "−1.65%" && pct(S.hi1sd, 2) === "+3.25%" && share(S.in1sd, 0) === "72%", "spread: SD 2.45, mean ± 1 SD from −1.65% to +3.25% holds 72%");
  {
    const x = K.errors(fc);
    // the 72% counts the unrounded ends; on the 0.1 grid that is the hours from −1.6% to +3.2%. The page shows the ends to
    // two decimals because ends rounded to one decimal (−1.7%, +3.3%) would hold more (ties at those values)
    ok(K.countIn(x, -1.6, 3.2) === K.countIn(x, S.lo1sd, S.hi1sd) && share(K.countIn(x, -1.7, 3.3) / S.n, 0) === "74%", "spread: the 72% is the hours from −1.6% to +3.2%; the one-decimal ends would hold 74%");
    // the percentile intervals: nominal shares, and what they hold with ties at the ends, as the page says
    ok(share(S.levels["50"].n / S.n) === "51.3%" && share(S.levels["80"].n / S.n) === "81.1%" && share(S.levels["95"].n / S.n) === "95.0%", "intervals: the nominal 50, 80 and 95% hold 51.3%, 81.1% and 95.0%");
    Object.keys(K.LEVELS).forEach(k => { const L = S.levels[k]; ok(K.countIn(x, +pct(L.lo).replace("−", "-").replace("%", ""), +pct(L.hi).replace("−", "-").replace("%", "")) === L.n, `interval ${k}%: the displayed ends hold the same hours as the unrounded ones`); });
    // the median task: a marker is a median when at least half the hours are at or below it and at least half at or above
    const M = S.med;
    ok(M.ok && M.below === 1332 && M.at === 51 && M.above === 1333, "median task: at +0.7%, 1,332 below, 51 at, 1,333 above: a median");
    let meds = []; for (let v = -30; v <= 30; v++) if (K.medianCheck(x, v / 10).ok) meds.push(v / 10);
    ok(meds.join() === "0.7", "median task: on the slider (−3% to +3%, steps of 0.1) only +0.7% passes: " + meds.join());
    ok(K.medianCheck([1, 2, 3, 4], 2.5).ok && K.medianCheck([1, 2, 3, 4], 2).ok && !K.medianCheck([1, 2, 3, 4], 1).ok && K.medianCheck([5, 5, 5], 5).ok, "median check: even counts, ties");
    // chart limits: the histogram's axis holds every bin; the sampling axis holds every estimate
    K.WIDTHS.forEach(w => { const B = K.histogram(K.tenths(fc), w), R = K.histRange(B); ok(R.min <= B[0].lo && R.max >= B[B.length - 1].hi && R.min <= -10 && R.max >= 10, `chart: ${w / 10}-point bins fit the axis ${R.min}..${R.max}`); });
    ok(K.histRange(K.histogram(K.tenths(fc), 40)).min === -12 && K.histRange(K.histogram(K.tenths(fc), 40)).max === 12, "chart: 4-point bins widen the axis to −12%..+12%");
    ok(K.sampleMax([]) === 30 && K.sampleMax([0.2, 0.28]) === 30 && K.sampleMax([0.3]) === 40 && K.sampleMax([0.4]) === 50, "chart: the sampling axis widens past the largest estimate");
    // 50 rounds of the 10-hour button from the page's seed: every estimate stays inside the axis drawn for it
    const r = K.rng(20250101); let all = [], worst = 0;
    for (let i = 0; i < 50; i++) { all = all.concat(K.sampleShares(x, 10, K.REPS, r, K.THRESH)); worst = Math.max(worst, ...all); }
    ok(100 * worst + 0.28 < K.sampleMax(all) && worst >= 0.4, `chart: after 50 rounds of 10-hour samples the largest estimate (${share(worst, 0)}) sits inside the axis (${K.sampleMax(all)}%)`);
  }
  ok(pct(S.q25) === "−0.8%" && pct(S.q75) === "+2.2%" && (S.q75 - S.q25).toFixed(1) === "3.0", "spread: quartiles −0.8% and +2.2%, 3.0 points apart");
  ok(S.above === 134 && share(S.aboveShare) === "4.9%", "chance: 134 hours, 4.9%");
  ok(pct(L["50"].lo) === "−0.8%" && pct(L["50"].hi) === "+2.2%" && pct(L["80"].lo) === "−2.1%" && pct(L["80"].hi) === "+3.8%" && pct(L["95"].lo) === "−3.5%" && pct(L["95"].hi) === "+6.2%", "intervals: 50, 80, 95%");
  ok(share(S.mid, 0) === "74%" && pct(S.min) === "−8.3%" && pct(S.max) === "+9.8%" && share(S.pos, 0) === "61%", "shape: 74% from −2% up to +3%; −8.3% to +9.8%; 61% above");
  ok(S.se.map(v => (100 * v).toFixed(1)).join() === "6.8,2.2,0.7", "standard errors 6.8, 2.2, 0.7 points");
  // the page (fallback, datanote, explain, Go deeper, check, numbers to remember)
  ["+0.8%", "+0.7%", "2.45 points", "−1.65%", "+3.25%", "72%", "51.3%", "81.1%", "95.0%", "−0.8%", "+2.2%", "4.9%", "134", "−2.1%", "+3.8%", "−3.5%", "+6.2%", "74%", "61%", "−8.3%", "+9.8%",
   "6.8", "2.2 for 100", "0.7 for 1,000", "0.25%", "about 22", "12.5 MW", "2,716"].forEach(s => has(s));
  has("8–15%", "the May–December gap"); has("cause unverified", "the gap's cause is unverified");
  has('href="04-forecasts.html"', "the link back to lesson 4");
  has("are illustrative", "the plants' outage chances are labelled illustrative");
  // Go deeper: the formulas use the model's numbers
  has("$n = 2716$"); has("gives " + S.sdSample.toFixed(4) + " points against " + S.sd.toFixed(4), "sd n − 1 against n");
  has("4.9% + 2 × 2.2 ≈ 9.3%", "the quick question's two-standard-error reach (100 hours)");
  ok((100 * S.aboveShare + 2 * 100 * S.se[1]).toFixed(1) === "9.3" && (4.9 + 2 * 2.2).toFixed(1) === "9.3", "two standard errors above 4.9% at 100 hours: 9.3 from the unrounded parts and from the rounded ones");
  has("($p = 0.9$ for the 90th percentile). The percentile sits at position $(n - 1)\\,p$", "the percentile rank uses p as a fraction");
  ok(K.quantile(K.errors(fc), 0.9) === S.levels["80"].hi, "the percentile rule with p = 0.9 gives the 80% interval's upper end");
  inJS("Each draw picks one of the \" + N + \" hours at random, so an hour can repeat. This shows how samples scatter, not how next winter will differ.", "the sampling card says draws repeat and what the scatter is not");
  has("A stochastic program is an optimization model"); has("A surrogate is a fast stand-in"); has("where p and q are their separate chances");
  // the view's strings
  inJS("Mean ± 1 SD"); inJS("Find the threshold that only 1 hour in 20 (5%) exceeds"); inJS("Draw 20 random samples of 10, 100 and 1,000 hours");
  ok(K.SIZES.join() === "10,100,1000" && K.REPS === 20 && K.THRESH === 5 && K.PLANT_P === 0.05 && K.WILD === 100, "view constants: sample sizes, 20 samples, +5%, 5%, +100%");
  inJS("[[normal-distribution|normal (Gaussian) distribution]] puts about 68% of values within 1 SD");
  ok(!/bell-shaped curve would/.test(JS), "the 68% rule names the normal distribution");
  // point 9, 10, 14: the event node is generic, the plants are A and B, the expected-value claims carry their condition
  inJS('event: { t: "Name the event", s: "error above a threshold"'); inJS('"Illustrative: gas plants A (" + PL.cc + " [[megawatt|MW]]) and B (" + PL.pk + " MW)'); 
  inJS("Only plant A out"); inJS("Only plant B out"); inJS("[[megawatt|MW]]");
  ok(!/combined-cycle|peaker/i.test(JS.replace(/^\s*\/\/.*$/gm, "").replace(/town\.fleet\.(cc|peaker)/g, "")) && !/combined-cycle|peaker/i.test(QMD.replace(/<!--[\s\S]*?-->/g, "")), "plants: named A and B, not by technology");
  inJS("Holding each plant's outage chance at"); inJS("While each plant stays out");
  inJS("Only if independent: a shared cause");
  // point 7: every chart has a text version (the histogram's bins plus what is marked; all 20 estimates per sample size)
  ok((JS.match(/LX\.Plot\(act, \{ text: "Text version of the chart" \}\)/g) || []).length === 6, "charts: all six step charts carry a text version");
  ok(/text: \{ head: \["Error, from", "up to", "Hours"\], rows: bins\.map/.test(JS) && /"The 20 estimates, sorted"/.test(JS), "charts: histogram bins and every sample estimate in the text versions");
  inJS("is lesson 4's band");
  // the quick questions
  ok(K.mean([-1, 0, 1, 2, 8]) === 2 && K.median([-1, 0, 1, 2, 8]) === 1, "quiz: mean 2%, median 1%");
  ok(9 <= 100 * S.aboveShare + 2 * 100 * S.se[1], "quiz: 9% in a sample of 100 lies within two standard errors of 4.9%");
  // the myths
  has("moves the mean by +0.04 points and the median by 0", "the wild-reading myth");
  // scope
  ok(!/nuclear|reactor|\bSMR\b/i.test(QMD + JS), "scope: no nuclear wording");
  ok(!/data[- ]cent/i.test(QMD + JS), "scope: no data centers");
  const links = (QMD.match(/href="https?:\/\/[^"]+"/g) || []).concat(QMD.match(/\]\(https?:\/\/[^)]+\)/g) || []);
  ok(links.every(l => /eia\.gov|otexts\.com|creativecommons\.org|opensource\.org|schema\.org|henryutd2021\.github\.io/.test(l)), "scope: external links only to allow-listed domains: " + links.join(" "));
  // fallback block
  const a = QMD.match(START), b = QMD.indexOf(END);
  ok(a && b > a.index && QMD.slice(a.index + a[0].length, b).trim() === fallback().trim(), "page: the fallback block is the generated one (run with --write)");
}

// ---------------- the explain layer's traces
{
  const T = K.traces(fc, {});
  ok(T.length === 2 && T[0].text.indexOf("134 of 2,716 hours above +5%, 4.9%") > 0 && T[1].text.indexOf("above +5% from 10 hours") > 0 && T[1].text.indexOf("6.8 points") > 0, "traces: all hours and a sample of 10, each naming its threshold");
  const T2 = K.traces(fc, { t: 3 });
  ok(T2.length === 3 && T2[2].text.indexOf("418 of 2,716 hours above +3.0%, 15.4%") > 0, "traces: the reader's threshold");
  ok(K.traces(fc, { t: 5 }).length === 2, "traces: the reader's threshold at +5% adds nothing new");
}

// ---------------- drill items over many seeds
{
  const x = K.errors(fc), kinds = new Set();
  [1, 42, 999, 31337, 77777].forEach(seed => K.drill(fc, seed, 140).forEach((it, i) => {
    kinds.add(it.kind);
    const nums = s => (s.match(/[−-]?\d+(\.\d+)?/g) || []).map(v => +v.replace("−", "-"));
    if (it.kind === "mean") { const v = nums(it.q.split(":")[1]); ok(v.length === 5 && near(K.mean(v), it.answer) && Number.isInteger(it.answer), `drill ${seed}/${i}: mean ${it.q}`); }
    if (it.kind === "median") { const v = nums(it.q.split(":")[1]); ok(near(K.median(v), it.answer), `drill ${seed}/${i}: median ${it.q}`); }
    if (it.kind === "count") {
      const m = /, ([\d,]+) had demand more than (\d) % (above|below)/.exec(it.q.replace(/(\d)% /, "$1 % ")), c = +m[1].replace(/,/g, ""), t = +m[2];
      ok(c === (m[3] === "above" ? K.countAbove(x, t) : K.countBelow(x, -t)) && near(it.answer, Math.round(1000 * c / x.length) / 10), `drill ${seed}/${i}: count ${it.q}`);
    }
    if (it.kind === "both" || it.kind === "either") {
      const m = /one in (\d+)% of hours, the other in (\d+)%/.exec(it.q), a = +m[1] / 100, b = +m[2] / 100, J = K.joint(a, b);
      ok(near(it.answer, 100 * (it.kind === "both" ? J.both : J.any), 1e-9) && near(it.answer * 100, Math.round(it.answer * 100), 1e-6), `drill ${seed}/${i}: ${it.kind} ${it.q} -> ${it.answer}`);
      ok(it.why.indexOf(String(it.answer)) >= 0, `drill ${seed}/${i}: the reason states the answer ${it.answer}: ${it.why}`);
    }
    if (it.kind === "ev") {
      const m = /is (\d+) MW with chance (\d+)%, (\d+) MW with chance (\d+)%, or (\d+) MW with chance (\d+)%/.exec(it.q), v = m.slice(1).map(Number);
      ok(v[1] + v[3] + v[5] === 100 && v[1] > 0 && v[3] > 0 && v[5] > 0 && near(it.answer, (v[0] * v[1] + v[2] * v[3] + v[4] * v[5]) / 100, 1e-9) && it.why.indexOf(String(it.answer) + " MW") >= 0, `drill ${seed}/${i}: ev ${it.q} -> ${it.answer}`);
    }
    if (it.kind === "sample") {
      const m = /Sample 1: ([\d,]+) hours, ([\d,]+) of them above \(([\d.]+)%\)\. Sample 2: ([\d,]+) hours, ([\d,]+) of them above \(([\d.]+)%\)/.exec(it.q);
      const v = m ? m.slice(1).map(t => +t.replace(/,/g, "")) : [];
      ok(m && it.answer === (v[0] > v[3] ? 0 : 1), `drill ${seed}/${i}: the bigger sample`);
      ok(m && [0, 3].every(j => Number.isInteger(v[j + 1]) && v[j + 1] >= 0 && v[j + 1] <= v[j] && near(100 * v[j + 1] / v[j], v[j + 2], 1e-9)), `drill ${seed}/${i}: each share is a whole number of hours out of its sample: ${it.q}`);
    }
    ok(it.choices || (typeof it.answer === "number" && isFinite(it.answer) && it.tol > 0), `drill ${seed}/${i}: a numeric answer with a tolerance`);
  }));
  ok(kinds.size === 7, "drill: all seven kinds appear");
}

// ---------------- data tasks
{
  const T = K.tasks(fc), x = K.errors(fc), by = {}; T.forEach(t => by[t.key] = t);
  ok(by.below0.answer === 36.9 && K.countBelow(x, 0) === K.countIn(x, -9, -0.1), "task 1: below 0% = 36.9%, the range −9.0% to −0.1%");
  ok(by.within2.answer === 63 && by.within2.how.indexOf("63.0%") > 0, "task 2: within ±2% = 63.0%");
  ok(by.below5.answer === 27 && K.countIn(x, -9, -5.1) === 27 && x[0] >= -9, "task 3: 27 hours more than 5% below; the explorer's −9.0% floor holds every hour");
  ok(by.p99.answer === 8 && K.countIn(x, -100, 8.0) / x.length >= 0.99 && K.countIn(x, -100, 7.7) / x.length < 0.99, "task 4: the 99th percentile +8.0% (the explorer reaches 99% at +8.0%, not at +7.7%)");
  ok(x[x.length - 1] <= 10, "explorer: its +10% ceiling holds every hour");
}

console.log(`k05-probability-statistics: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
