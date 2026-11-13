// test_m10-ml-forecasting.js — Node tests for Modeler lesson M10 (assets/learn/m10-ml-forecasting.js, its settings file,
// the course's town_year.json and the page learn/m10-ml-forecasting.qmd):
//   - the clock: Central time with daylight saving (2025: 9 March 23 hours, 2 November 25), every hour ending once, the
//     issue hour the last hour of the day before, horizons 1 to 24 (25 once); "same hour" is the same clock hour (a
//     repeated one read as the later, a missing one as the hour before), always known at the issue hour (no look-ahead),
//     except the two leaks of step 5, which are proved to look ahead
//   - the split: train 8 January to 30 September, validate October, test November; disjoint, in time order
//   - the regression from first principles: the Gram-matrix fit equals a direct least-squares solve on its own design;
//     the residuals are orthogonal to every column; the best mix wins by more than 1 MW (tie rule)
//   - the scores: MAE, RMSE, MAPE, skill, quantiles (type 7), coverage, width, pinball loss, recomputed by hand
//   - every number the page states (step cards on a stub document, the no-JS block, myths, quiz, numbers to remember,
//     the explain layer) matches the model; the settings file's reference block (the notebook asserts it) is recomputed
//   - claims: the latest hour held flat is the worst baseline and same hour yesterday the best on October; wind's
//     persistence error grows with the horizon and solar's falls back at 24 hours; both leaks beat every fair mix; the
//     80% band over-covers November; pinball loss is lowest inside the tried widths, not at the widest; the worst days
//   - scope: no nuclear term, no "AI", no deny-listed term; links: learn pages, downloads, doi.org, eia.gov, otexts.com
//   - research wording (the sourcing rule): every sentence about the course author's studies is approved (E1, E12)
//   - speed: the facts in Node
// Usage (from the site folder):  node _tests/learn/test_m10-ml-forecasting.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "m10-ml-forecasting";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const X = require("./excerpt_check.js");
const DPATH = L("data/" + ID + ".json"), QPATH = path.join(SITE, "learn", ID + ".qmd");
const NBPATH = path.join(SITE, "learn/notebooks", ID + ".ipynb"), SIDE = path.join(SITE, "learn/_w1", ID + ".yml");
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const Y = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8")), F4 = JSON.parse(fs.readFileSync(L("data/04-forecasts.json"), "utf8"));
let D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const text = s => s.replace(/\\\$/g, "$").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();
const { mw, pc } = M;
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  D.reference = M.reference(Y, D);
  fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n");
  let q = fs.readFileSync(QPATH, "utf8"); const r = between(q, "m10-fallback");
  q = q.slice(0, r.from) + M.staticFallback(Y, D) + "\n" + q.slice(r.to);
  fs.writeFileSync(QPATH, q);
  console.log("wrote the reference block and the no-JS block");
  D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
}
const PAGE = fs.readFileSync(QPATH, "utf8"), RAW = fs.readFileSync(DPATH, "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const NB = readOr(NBPATH), SIDEYML = readOr(SIDE);
{ const r = between(PAGE, "m10-fallback"); ok(PAGE.slice(r.from, r.to) === M.staticFallback(Y, D) + "\n", "the no-JS block is up to date (run with --write)"); }

// ---------------- the clock and the split
const t0 = Date.now(), F = M.facts(Y, D), factsMs = Date.now() - t0, P = F.P, cal = P.cal;
ok(D.peakMW === F4.spp_peak_demand_mw && near(Math.max(...P.d), 54411, 1e-9), "demand scale: SPP's 2025 peak, 54,411 MW (04-forecasts.json), at the shape's maximum");
{
  const per = {}; cal.forEach(x => { per[x.date] = (per[x.date] || 0) + 1; });
  const days = Object.keys(per);
  ok(days.length === 365 && per["2025-03-09"] === 23 && per["2025-11-02"] === 25 && days.filter(k => per[k] === 24).length === 363, "the clock: 365 local days, 23 hours on 9 March, 25 on 2 November, 24 on every other day");
  ok(cal[0].date === "2025-01-01" && cal[0].he === 1 && cal[cal.length - 1].date === "2025-12-31" && cal[cal.length - 1].he === 24, "index 0 ends at 01:00 on 1 January; the last ends at midnight on 31 December");
  ok(cal.every(x => x.h >= 1 && x.h <= 25) && cal.filter(x => x.h === 25).length === 1, "horizons 1 to 24, and 25 once (2 November)");
  ok(cal.every(x => x.i === 0 || x.issue === x.i - x.h) && cal.filter(x => x.date >= "2025-01-02").every(x => cal[x.issue].date < x.date && (x.issue + 1 >= cal.length || cal[x.issue + 1].date === x.date)), "the issue hour is the last hour of the day before");
}
ok(P.train[0].date === "2025-01-08" && P.train[P.train.length - 1].date === "2025-09-30" && P.val.every(x => x.month === 10) && P.test.every(x => x.month === 11) && P.train.length === 6383 && P.val.length === 744 && P.test.length === 721, "the split: 6,383 training hours, 744 October, 721 November");
ok(P.train[P.train.length - 1].i < P.val[0].i && P.val[P.val.length - 1].i < P.test[0].i, "train, choose, test: in time order and disjoint");
// no look-ahead: every honest input is older than the issue hour (or is the issue hour); the leaks are not
{
  const S = P.train.concat(P.val, P.test);
  ok(S.every(x => x.yday >= 0 && x.wk >= 0 && x.yday <= x.issue && x.wk <= x.issue && x.issue >= 0), "every honest input (yesterday, last week, the latest actual) is known at the issue hour");
  ok(S.some(x => x.i - 1 > x.issue) && S.filter(x => x.h > 1).every(x => x.i - 1 > x.issue), "the hour before looks ahead for every hour after the first");
  // same clock hour: the day before and seven days before, by the stated rule
  const dayBefore = (d, n) => new Date(Date.parse(d + "T00:00:00Z") - n * 864e5).toISOString().slice(0, 10);
  const odd = cal.filter(x => x.yday >= 0 && (cal[x.yday].he !== x.he || cal[x.yday].date !== dayBefore(x.date, 1)));
  ok(odd.length === 1 && odd[0].date === "2025-03-10" && odd[0].he === 3 && cal[odd[0].yday].he === 2, "same hour yesterday is the same clock hour the day before, except 10 March's hour ending 3 (none on 9 March: the hour before it, ending 2)");
  ok(cal.filter(x => x.wk >= 0 && (cal[x.wk].he !== x.he || cal[x.wk].date !== dayBefore(x.date, 7))).map(x => x.date + " " + x.he).join() === "2025-03-16 3", "same hour last week: the same clock hour seven days before, except 16 March's hour ending 3");
  const n2 = cal.filter(x => x.date === "2025-11-02"), n3 = cal.filter(x => x.date === "2025-11-03");
  ok(n2.length === 25 && n2[24].he === 24 && n2[24].yday === n2[24].issue && n2[24].h === 25 && n2.filter(x => x.he === 2).every(x => cal[x.yday].date === "2025-11-01" && cal[x.yday].he === 2), "2 November: hour ending 24 uses 1 November's hour ending 24 (the issue hour, 25 hours earlier); both hours ending 2 use 1 November's");
  ok(n3[1].he === 2 && n3[1].yday === n2.filter(x => x.he === 2)[1].i && n3[1].i - n3[1].yday === 24, "3 November's hour ending 2 uses the later of 2 November's two (24 hours earlier)");
}
// ---------------- the regression from first principles
{
  const m = F.best, G = M.gram(P);
  const Xr = P.train.map(x => m.F.idx.map(k => M.row(P, x)[k])), y = P.train.map(x => P.d[x.i]);
  // residuals orthogonal to every column of the design (normal equations)
  const res = Xr.map((r, k) => y[k] - r.reduce((s, v, j) => s + v * m.F.w[j], 0));
  const orth = m.F.idx.map((_, j) => Math.abs(res.reduce((s, e, k) => s + e * Xr[k][j], 0)));
  ok(Math.max(...orth) < 1e-3, "the best mix: residuals orthogonal to every column (max " + Math.max(...orth).toExponential(1) + ")");
  ok(near(G.A[0][0], P.train.length, 0), "the Gram matrix counts the training hours");
}
ok(F.mixes.length === 16 && F.mixes[1].val - F.mixes[0].val > 1 && F.best.key === "week+last+wkend", "16 mixes; the best on October (" + F.best.key + ") leads by " + (F.mixes[1].val - F.mixes[0].val).toFixed(2) + " MW (tie rule: more than 1 MW)");
// ---------------- the scores by hand
{
  // same hour yesterday by hand: October has no clock change, so the same clock hour is exactly 24 hours earlier
  const f = M.rule(P, "day"); let ae = 0, se = 0, pe = 0; P.val.forEach(x => { const e = P.d[x.i] - P.d[x.i - 24]; ae += Math.abs(e); se += e * e; pe += Math.abs(e) / P.d[x.i]; });
  const s = M.point(P, P.val, f);
  ok(near(s.mae, ae / 744, 1e-9) && near(s.rmse, Math.sqrt(se / 744), 1e-9) && near(s.mape, pe / 744, 1e-12), "MAE, RMSE and MAPE of same hour yesterday by hand");
  ok(M.quantile([1, 2, 3, 4], 0.9) === 3.7, "quantiles by linear interpolation at (N - 1) p (K5's rule)");
  const r = P.val.map(x => P.d[x.i] - F.best.F.f(x)).sort((a, b) => a - b);
  ok(near(F.Q[1], M.quantile(r, 0.1), 1e-9) && near(F.Q[17], M.quantile(r, 0.9), 1e-9) && F.Q.every((q, j) => j === 0 || q >= F.Q[j - 1]), "the band's quantiles come from October's misses, in order");
  let c80 = 0, pb = 0; P.test.forEach(x => { const m = F.best.F.f(x), y = P.d[x.i]; if (y >= m + F.Q[1] && y <= m + F.Q[17]) c80++; M.TAU.forEach((t, j) => { const q = m + F.Q[j]; pb += (y >= q ? t * (y - q) : (1 - t) * (q - y)) / 19; }); });
  ok(near(F.band.cov[80], c80 / 721, 1e-12) && near(F.band.pinball, pb / 721, 1e-9) && near(F.band.width, F.Q[17] - F.Q[1], 1e-9), "coverage, width and pinball loss by hand");
}
// ---------------- claims and the page's numbers
const B = F.base;
ok(B.persist.val.mae > B.week.val.mae && B.week.val.mae > B.day.val.mae, "October: the latest hour held flat is the worst baseline, same hour yesterday the best");
ok(mw(B.day.val.mae) === "1,126 MW" && pc(B.day.val.mape) === "3.6%" && mw(B.persist.val.mae) === "3,186 MW" && mw(B.week.val.mae) === "2,232 MW" && mw(B.day.test.mae) === "1,070 MW", "baselines: 1,126 (3.6%), 3,186, 2,232 on October; 1,070 on November");
ok(F.horizon.wind.every((v, j) => j === 0 || v > F.horizon.wind[j - 1]) && F.horizon.solar[4] < F.horizon.solar[3] / 4 && F.horizon.wind[0].toFixed(1) === "2.8" && F.horizon.wind[4].toFixed(1) === "18.3" && F.solarZeros === 377, "horizons: wind's error rises 2.8% to 18.3%; solar's falls back at 24 h; 377 solar zeros");
ok(F.horizon.demand[4] < F.horizon.demand[3] && near(F.horizon.demand[4], 100 * B.day.val.mae / 54411, 0.05), "demand's 24-hour persistence equals same hour yesterday (in % of the peak, rounding aside)");
ok(mw(F.best.val) === "1,083 MW" && pc(F.skillVal) === "3.8%" && mw(F.best.test) === "981 MW" && pc(F.skillTest) === "8.3%" && mw(F.testBest.test) === "948 MW" && F.testBest.key !== F.best.key, "the chosen mix: 1,083 MW on October (3.8%), 981 MW on November (8.3%); November's own best (948 MW) is another mix");
ok(F.leakVal.lag1 < F.mixes[F.mixes.length - 1].val && F.leakVal.oracle < F.mixes[0].val && mw(F.leakVal.lag1) === "670 MW" && mw(F.leakVal.oracle) === "822 MW", "both leaks beat every fair mix on October (670 and 822 MW)");
ok(F.band.cov[80] > 0.8 && pc(F.band.cov[80]) === "83.1%" && mw(F.Q[1]) === "-1,801 MW" && mw(F.Q[17]) === "1,861 MW", "the 80% band: −1,801 to +1,861 MW, holds 83.1% of November (over-covers)");
ok(F.widths.every((w, j) => j === 0 || w.b.cov[80] >= F.widths[j - 1].b.cov[80]) && F.pbBest.s === 0.75 && F.pbBest.b.pinball < F.widths[F.widths.length - 1].b.pinball && F.pbBest.b.pinball < F.widths[0].b.pinball && pc(F.widths[F.widths.length - 1].b.cov[80]) === "98.6%", "widths: coverage rises with width (98.6% at × 2); pinball loss lowest at × 0.75, higher at both ends");
ok(F.worst.map(w => w.date).join() === "2025-11-30,2025-11-10,2025-11-27" && pc(F.worstShare, 0) === "25%" && D.holiday.date === "2025-11-27", "the three worst November days hold 25% of the error; the 27th is Thanksgiving");
{ const ref = M.reference(Y, D); ok(JSON.stringify(ref) === JSON.stringify(D.reference), "the settings file's reference block is up to date (run with --write)"); }
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, ""), TX = text(OWN);
const has = (s, what) => ok(TX.includes(s), "page: " + what + ": '" + s + "'");
has("the cleaned series sets it to zero for hours ending 23 to 5, hours whose monthly median is zero, and hours with the sun below the horizon", "data note: the night solar zeros are a processing rule");
ok(/solar set to zero at night \(hours whose monthly median is zero, hours ending 23-24 and 1-5 local, and hours when the sun is below the horizon/.test(Y.meta.normalisation), "data note: the night-zero rule matches the data's own processing note");
has("Check coverage and quantile scores together; choose a band on validation data, then report the test.", "myth 3: no tuning of a band to match coverage");
has("Many small if-then trees, each fitted to the misses of those before it, then added up.", "Go deeper: gradient boosting explained");
has("The best of 16 linear mixes beat same hour yesterday by " + pc(F.skillVal) + " on October and " + pc(F.skillTest) + " on November.", "myth 1");
has("A model that scores " + mw(F.leakVal.lag1) + " where the best fair one scores " + mw(F.best.val) + " is simply better.", "myth 2");
has("At twice October's width the 80% band held " + pc(F.widths[F.widths.length - 1].b.cov[80]) + " of November's hours, but its pinball loss was the worst of the widths tried.", "myth 3");
ok(F.widths[F.widths.length - 1].b.pinball === Math.max(...F.widths.map(w => w.b.pinball)), "myth 3: × 2 has the worst pinball loss of the widths tried");
has("1 − 950 ÷ 1,000 = 0.05", "quiz 1");
has("SPP's demand, October 2025: the average miss of same hour yesterday, issued at 00:00 (" + pc(B.day.val.mape) + " MAPE).", "numbers to remember 1");
ok(["<td class=\"n\">" + mw(B.day.val.mae) + "</td>", "<td class=\"n\">" + pc(F.skillTest) + "</td><td>Skill of the mix chosen on October", "<td class=\"n\">" + pc(F.band.cov[80]) + "</td><td>Share of November's hours", "<td class=\"n\">" + F.solarZeros + " of " + P.val.length + "</td><td>October 2025 hours"].every(x => OWN.includes(x)), "numbers to remember: 1,126 MW, 7.9%, 83.4%, 377 of 744");
has("About 40 guided minutes in nine steps.", "the time line");
has("54,411 MW, so values are rounded to about 54 MW", "data note: the scale");
has("9 March has 23 hours and 2 November 25.", "data note: the clock");
{ const st = JSON.parse(fs.readFileSync(L("data/town_days.json"), "utf8")).stats;
  ok(st.demand_hours_flagged_as_implausible === 699 && st.missing_hours_filled.demand === 699 && TX.includes("699 of 2025's 8,760 demand hours were repaired from the day-ahead forecast scaled to actuals on both sides") && Y.demand.length === 8760, "data note: 699 of 8,760 demand hours repaired (town_days.json stats), using actuals on both sides"); }
has("a demonstration on cleaned data, not an operational backtest.", "data note: retrospective cleaning, said");
has("A clock hour that occurs twice (2 November) is read as the later one; a missing one (9 March), as the hour before it.", "data note: the same-hour rule");
has("A forecast issued at 00:00 on 14 October for the hour ending 18:00 on 14 October. Which input is allowed?", "quiz 2: a dated issue time");
has("Demand at 18:00 on 13 October: 24 hours before the target, and already known at 00:00 on 14 October.", "quiz 2: the answer");
has("known at 00:00 for the day's first hour, unavailable for every later one. An unexpectedly good score is a reason to check for leakage.", "myth 2");
ok(2 + 0.6 * 40 + 0.3 * 38 === 37.4 && TX.includes("2 + 0.6 × 40 + 0.3 × 38 = 37.4") === false && /\$\\hat y_t = 2 \+ 0\.6 \\times 40 \+ 0\.3 \\times 38 = 37\.4\$ GW/.test(PAGE), "Go deeper: the worked weighted sum, 37.4 GW");
ok(/a 100 MW miss above the forecast quantile costs 90 MW; the same miss below it costs 10 MW/.test(PAGE) && 0.9 * 100 === 90 && Math.round(0.1 * 100) === 10, "Go deeper: the pinball example at the 90th percentile");
ok(/\*\*Symbols\.\*\* \$t\$ an hour/.test(PAGE), "Go deeper: a symbol key before the formulas");
ok(!/midnight|tomorrow's average/.test(TX + JS.replace(/\/\/[^\n]*/g, "")), "the issue time is 00:00 everywhere on the page and in the script");

// ---------------- the page on a stub document
(async () => {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.isDark = () => false;
  E.LX.lessonRefHTML = require(L("components/core.js")).lessonRefHTML;
  const plotSpecs = [], sliders = [];
  ["cards", "predict", "table", "boundary", "flowchart", "toggle"].forEach(n => load(n, E));
  E.LX.Plot = (host, o) => { const box = E.LX.H("div", { class: "stub-plot" }, host); return { box, render: spec => { plotSpecs.push(spec); }, text: null }; };
  E.LX.Slider = (host, o) => { let v = o.value; const w = E.LX.H("div", { class: "stub-slider" }, host); const sl = { el: w, val: () => v, set: (x, fire) => { v = x; if (fire && o.onChange) o.onChange(v); }, _set(x) { v = x; if (o.onChange) o.onChange(v); } }; sliders.push(sl); return sl; };
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "m10") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: f => { f(); return 0; }, clearTimeout: () => {} };
  const xp = E.LX.H("div", { id: "m10-explain" }, E.body);
  vm.runInNewContext(JS, mctx);
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "m10" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  const PATHJ = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
  let threw = null;
  try { init(live, { m10_ml_forecasting: D, town_year: Y, path: PATHJ }, root); } catch (err) { threw = err.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  if (threw) return finish();
  const cards = demo.cards, card = () => live.querySelector(".lx-stepcard");
  const next = () => card().querySelectorAll(".lx-step-foot button").filter(x => /Next/.test(x.textContent))[0];
  const saw = () => { const a = card().querySelectorAll(".lx-saw"); return text((a[a.length - 1] || { innerHTML: "" }).innerHTML); };
  const stepText = () => text(card().querySelector(".lx-step-text").innerHTML);
  const btns = re => card().querySelectorAll("button").filter(x => re.test(x.textContent));
  const words = s => s.split(/\s+/).filter(Boolean).length, sents = s => s.split(/(?<=[.?!])\s+(?=[A-Z0-9“"])/).length;
  const budget = (where, s, w) => ok(words(s) <= w && sents(s) <= 2, where + ": " + words(s) + " words, " + sents(s) + " sentences (at most " + w + " and 2): " + s.slice(0, 70));
  ok(cards.count === 9, "nine step cards");
  for (let i = 0; i < cards.count; i++) { cards.go(i); budget("step " + (i + 1) + " text", stepText(), 35); ok(next() && (i === cards.count - 1 || next().disabled), "step " + (i + 1) + ": Next waits for the action"); }
  const sawIs = (i, s) => { ok(!next().disabled && saw() === s, "step " + i + " (" + saw() + ")"); budget("step " + i + " result", saw(), 40); };
  cards.go(0); card().querySelectorAll(".lx-choice")[1].click();
  sawIs(1, "Train on 6,383 hours, choose on 744, test on 721. Hours are never shuffled across those lines: tomorrow must stay unseen.");
  { const sp = plotSpecs.find(x => x.text && x.text.head[0] === "Date"), dates = Object.keys(P.dayMean).sort();
    ok(sp && sp.text.rows.length === 365 && sp.text.rows.every((r, k) => r[1] === mw(P.dayMean[dates[k]])) && sp.text.rows.filter(r => r[2] === "test").length === 30 && sp.text.rows.filter(r => r[2] === "choose").length === 31, "step 1: the text version lists every day's mean demand and its period"); }
  cards.go(1); card().querySelectorAll(".lx-seg button").forEach(x => x.click());
  sawIs(2, "Same hour yesterday misses by 1,126 MW (3.6%); the latest hour held flat by 3,186 MW. A learned model must beat 1,126 MW on October to earn its place.");
  cards.go(2); card().querySelectorAll(".lx-seg button").forEach(x => x.click());
  sawIs(3, "Wind's error grows from 2.8% to 18.3% over a day; solar's falls back at 24 hours, when the sun returns. Solar is zero in 377 of 744 October hours, so MAPE cannot score it.");
  ok(/Solar's zeros: the cleaned series sets night hours to zero \(data note\)\./.test(text(card().innerHTML)), "step 3: the night zeros are named as a cleaning rule beside the solar result");
  { const sp = plotSpecs.filter(x => x.text && /Hours ahead/.test(x.text.head[0])).pop();
    ok(sp && sp.text.note === "October MAE as a percentage of each series' 2025 maximum; this is not MAPE.", "step 3: the chart's text version names its denominator"); }
  cards.go(3);
  btns(/Fit and score/)[0].click();
  ok(next().disabled && /This mix: 1,144 MW on October, 1\.6% worse than same hour yesterday\./.test(text(card().innerHTML)), "step 4: yesterday alone in a regression is 1.6% worse (" + text(card().querySelector(".m10-out").innerHTML) + ")");
  btns(/Rank all 16/)[0].click();
  ok(next().disabled, "step 4: ranking waits for a second fit");
  card().querySelectorAll(".lx-toggle")[0].click(); btns(/Fit and score/)[0].click(); btns(/Rank all 16/)[0].click();
  sawIs(4, "Best on October: same hour yesterday + same hour last week + the latest actual + Saturday and Sunday, 1,083 MW, 3.8% better than same hour yesterday. Small, but earned on hours the fit never saw.");
  ok(card().querySelectorAll("tbody tr").length === 16, "step 4: all 16 mixes ranked");
  cards.go(4); const sg = card().querySelectorAll(".lx-seg button");
  sg[0].click(); sg[3].click();
  ok(next().disabled && /Not quite/.test(saw()), "step 5: a wrong mark is not accepted");
  sg[1].click(); sg[3].click();
  sawIs(5, "At 00:00 the hour before is known only for the day's first hour, and the day's average not at all. Scores of 670 and 822 MW use look-ahead: a score this good is a reason to check for leakage.");
  cards.go(5); btns(/Open November/)[0].click();
  sawIs(6, "November: 981 MW against 1,070 MW, 8.3% better. The mix best on November scores 948 MW, but picking it there would turn the test into training.");
  cards.go(6); card().querySelectorAll(".lx-seg button")[0].click();
  ok(next().disabled, "step 7: the 50% band alone does not finish the step");
  card().querySelectorAll(".lx-seg button")[1].click();
  sawIs(7, "The 80% band holds 83.1% of November's hours. It pools October's misses across all hours; coverage can differ by hour and horizon, and a month is a small sample.");
  { const sp = plotSpecs[plotSpecs.length - 1], h = sp.text.head, rows = sp.text.rows;
    ok(sp.bars.length === 168, "step 7: the band over the last November week (168 hours)");
    const lo = h.indexOf("Band, low"), hi = h.indexOf("Band, high"), io = h.indexOf("Inside the band?"), inside = rows.filter(r => r[io] === "yes").length;
    const wk = P.cal.filter(x => x.date >= D.weeks.test[0] && x.date <= D.weeks.test[1]), byHand = wk.filter(x => { const m = F.best.F.f(x); return P.d[x.i] >= m + F.Q[1] && P.d[x.i] <= m + F.Q[17]; }).length;
    ok(lo > 0 && hi > 0 && io > 0 && rows.length === 168 && rows.every((r, k) => r[lo] === mw(F.best.F.f(wk[k]) + F.Q[1]) && r[hi] === mw(F.best.F.f(wk[k]) + F.Q[17])) && inside === byHand && sp.text.note === "Inside the band: " + byHand + " of these 168 hours.", "step 7: the text version gives both band edges and whether each hour is inside (" + byHand + " of 168)"); }
  cards.go(7); const s8 = sliders[sliders.length - 1]; [0, 5, 1].forEach(i => s8._set(i));
  sawIs(8, "Coverage keeps rising: 98.6% at × 2. Pinball loss is lowest at × 0.75 (397.3 MW), where the 80% band holds only 73.5%: check coverage and pinball loss together.");
  cards.go(8);
  { const sp = plotSpecs[plotSpecs.length - 1], k = F.daily.findIndex(x => x.date !== F.worst[0].date); sp.pick.onPick(k);
    ok(next().disabled && /Not the worst day yet/.test(saw()), "step 9: another day does not complete the step"); }
  demo.fn("step-9");
  sawIs(9, "The three worst days, Sunday 30 November, Monday 10 November, Thursday 27 November, hold 25% of November's error; the 27th is Thanksgiving Day. Report the bad days, not only the mean.");
  ok(/Sunday 30 November: 2,726 MW, the worst of 30 days\./.test(text(card().innerHTML)), "step 9: the readout of the worst day");
  ok(live.querySelectorAll("[aria-live]").length >= 2, "results are announced in aria-live regions");
  ["mid", "step-2", "step-4", "step-5", "step-8"].forEach(sname => { let q = null; try { q = demo.fn(sname); } catch (err) { q = null; } ok(q && q.view === sname, "demo state " + sname + " runs"); });
  const XT = text(xp.innerHTML);
  ok(/1,083 MW/.test(XT) && /981 MW/.test(XT), "explain: the flowchart's numbers (choose 1,083 MW, test 981 MW)");
  ok(/M1/.test(XT) && /A3/.test(XT) && /this page builds no price model/.test(XT) && XT.includes("In a simple supply-stack model, the marginal plant sets the energy price") && XT.includes("Actual prices also reflect network limits, operating constraints and market rules"), "explain: the price card (a simple supply-stack model; network limits, operating constraints and market rules) links M1 and A3");
  ok(XT.includes("cleaned afterwards for the course (EIA-930): a demonstration, not an operational backtest") && XT.includes("data as known at 00:00: the cleaning used later actuals, and repaired hours are scored with the rest"), "explain: the boundary says the data were cleaned afterwards");
  ok(XT.includes("377 of 744 October hours at zero") && XT.includes("2.8% at 1 h, 18.3% at 24 h"), "explain: the targets table");
  finish();
})().catch(err => { ok(false, "the stub page test threw: " + (err && err.stack || err)); finish(); });

function finish() {
  ok(NB.length > 0, "the lab notebook exists (learn/notebooks/" + ID + ".ipynb; written by its notebook build step)");
  if (NB) {
    const nb = JSON.parse(NB), src = nb.cells.map(c => c.source.join("")).join("\n");
    ok(nb.cells.every(c => c.cell_type === "markdown" || (c.outputs.length === 0 && c.execution_count === null)), "the notebook is stored without outputs");
    { // the notebook tests once: no cell before "November, opened once" scores the test month, and the weekly baseline's rows
      // are never overwritten by another variable
      const heads = nb.cells.map(c => c.source.join("")), at = heads.findIndex(h => /^## 6\. November, opened once/m.test(h));
      const before = heads.slice(0, at).filter((h, k) => nb.cells[k].cell_type === "code").join("\n");
      ok(at > 0 && !/(?<!len)\(test\)|test\.index/.test(before), "notebook: November is not scored before section 6, after every choice on October");
      ok(!/^wk = \{/m.test(src) && /RULES\.items\(\)/.test(heads.slice(at).join("\n")), "notebook: the weekend indicators no longer overwrite the week lag's rows; all three baselines are rechecked after the test");
    }
    ok(/m10-ml-forecasting\.json/.test(src) && /town_year\.json/.test(src) && /REF\["baselines"\]/.test(src) && /REF\["mixes"\]/.test(src) && /REF\["band"\]/.test(src), "the notebook asserts the reference block");
    ok(/about 60 minutes, plus 90 minutes of practice/.test(src) && /HistGradientBoostingRegressor/.test(src) && /MLPRegressor/.test(src), "the notebook's times; gradient boosting and a small neural network");
  }
  const ALL = [PAGE, RAW, JS, SIDEYML, NB].join("\n");
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term");
  ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere");
  ok(!/\bFOAK\b|\bNOAK\b|first[- ]of[- ]a[- ]kind|learning[- ](curve|rate)|order[- ]book|anchor[- ](customer|buyer)|subsidy[- ]free|smr-dc|projects\/|research\.(html|qmd)/i.test(ALL), "no deny-listed term");
  const OKH = h => /^https:\/\/doi\.org\/10\./.test(h) || /^https:\/\/www\.eia\.gov\//.test(h) || /^https:\/\/otexts\.com\/fpp3\//.test(h) || /^(\.\.\/assets\/learn\/data\/[a-z0-9_-]+\.json|notebooks\/[a-z0-9-]+\.ipynb|[0-9a-z-]+\.html(#[a-z0-9-]+)?)$/.test(h);
  const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...NB.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(m => m[0]), [...PAGE.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
  ok(hrefs.length > 5 && hrefs.every(OKH), "links: learn pages, downloads, doi.org, eia.gov and otexts.com only: " + hrefs.filter(h => !OKH(h)).join(" "));
  const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
  ok(keys.length === 2 && keys.every(k => k === "excerpt:uq-mfgpr"), "excerpt keys: uq-mfgpr only (E13 is not placed in M10)");
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(x => new RegExp("\\n  id: " + ID + "\\n").test(x)) || "";
  ok(/\n  status: active\n/.test(entry) && /\n  minutes: 40\n/.test(entry) && /lab_minutes: 60/.test(entry) && /practice_minutes: 90/.test(entry) && /after: \[4, M7\]/.test(entry), "path.yml: active, 40 + 60 + 90 minutes, after lesson 4 and M7");
  const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
  ok(fm("title") === py("title") && fm("subtitle") === py("subtitle") && fm("title") === "Forecasting load, wind and solar with machine learning, and judging it honestly", "the page's title (no price model) and subtitle equal path.yml's");
  const GL = fs.readFileSync(path.join(SITE, "learn/glossary.yml"), "utf8") + "\n" + fs.readdirSync(path.join(SITE, "learn/_w1")).map(f => fs.readFileSync(path.join(SITE, "learn/_w1", f), "utf8")).join("\n");
  const marks = [...JS.matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]);
  ok(marks.length >= 8 && marks.every(m => new RegExp("id: " + m + "\\n").test(GL)), "every glossary mark has a definition: " + marks.filter(m => !new RegExp("id: " + m + "\\n").test(GL)).join(", "));
  researchWording(entry, OWN);
  ok(factsMs < 800, "speed in Node: the facts (16 fits, bands, days) take " + factsMs + " ms");
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
}
function researchWording(entry, OWN) {
  const R = X.register(["E1", "E12"]);
  if (!R) { console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); research wording not checked"); return; }
  const RX = /\b(the study|study's|paper|article|IDETC|Li et al|course author|excerpt|nine-turbine|multi-fidelity regression)\b/i;
  const NOT = [[/^Where this came up in research$/, "heading"], [/^From: Li et al\., ASME IDETC 2023\.$/, "provenance label"],
               [/^The same lesson as this page: say which score, on which held-out data\.$/, "the page's own link line"], [/^The method is in M9\.$/, "navigation"],
               [/^Case file CF8: learning a wind turbine's power curve from scarce data\.$/, "navigation (the case file's title)"]];
  const bad = [], strict = (w, l) => l.forEach(s => { const o = X.offending(R, NOT, s); if (o) bad.push(w + ": " + o); }), signalled = (w, l) => l.forEach(s => { if (RX.test(s)) { const o = X.offending(R, NOT, s); if (o) bad.push(w + ": " + o); } });
  let REST = OWN.replace(/<!-- m10-fallback:start[\s\S]*?<!-- m10-fallback:end -->/, " ").replace(/<style>[\s\S]*?<\/style>/, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const real = (REST.match(/<div class="lx-card lx-real">[\s\S]*?\n<\/div>/) || [""])[0];
  ok(real.length > 0, "page zone found: the research card");
  strict("research card", X.elements(real)); REST = REST.replace(real, " ");
  const src = (REST.match(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/) || [""])[0];
  strict("sources", [...src.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => X.norm(m[0])).filter(s => /Li et al/.test(s)));
  signalled("page", X.elements(REST));
  signalled("front matter", X.frontmatter(PAGE));
  const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
  signalled("data", strings(D).filter(x => x[0] !== "about").map(x => x[1]));
  const literals = JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
  signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
  signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome|lab): "(.*)"$/gm)].map(m => m[2]));
  if (NB) { const nb = JSON.parse(NB); signalled("notebook", nb.cells.flatMap(c => c.source.join("").split("\n"))); }
  ok(bad.length === 0, "research wording: every sentence about the studies is approved:\n  " + bad.join("\n  "));
  const blocks = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<\/blockquote>/g)].map(m => [...m[2].replace(/<footer>[\s\S]*<\/footer>/, "").matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => X.norm(x[1])).join(" "));
  ok(blocks.join(" | ") === X.norm(R.raw.E1) + " | " + X.norm(R.raw["E12.7"] + " " + R.raw["E12.10"]), "the excerpt blocks: E1, then E12.7 and E12.10, word for word");
}
