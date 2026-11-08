// test_r06-uncertainty-properly.js — Node tests for research studio R6 (assets/learn/r06-uncertainty-properly.js and
// data/r06-uncertainty-properly.json):
//   - the sort: twelve cards in four kinds plus the pile of choices (set apart, labelled as not an uncertainty), each with a
//     reason; five treatments, one per pile, each with one defensible option
//   - the model from first principles: the 2025 hourly maxima and peak hour from town_year.json by an independent clock;
//     "hours added" by brute force over all 8,760 hours equals the 24-hour shortcut; peaks added ≥ hours added always; the
//     claim recomputed by hand; percentiles and seeded draws reimplemented here
//   - every number the page states: facts() against an independent recomputation; differences shown beside rounded values
//     equal the difference of the rounded values; the band's feedback true in every state; Monte Carlo error below the
//     rounding step; the rank order of the inputs; the EVPI toy
//   - the rewrite checks: the examples pass their own checks, an empty text passes none, the claim fails "no bare will";
//     "about 9 in 10" and "about 8 in 10" in the examples are the runs' own shares
//   - what the page says about its own assumptions: the sampling rule (independent, equal odds) wherever it samples;
//     illustrative ranges never given a data source; the flowchart samples only with odds; the plan counts a row only
//     with the reader's own treatment; the checklist keeps scenario and bounded routes open
//   - the no-JS blocks equal the model's (--write rewrites them); text budget for every element, feedback and example line;
//     links on allow-listed hosts; no out-of-scope words
// Usage (from the site folder):  node _tests/learn/test_r06-uncertainty-properly.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const R = require(L("r06-uncertainty-properly.js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const CORE = require(L("components/core.js"));
const D = JSON.parse(fs.readFileSync(L("data/r06-uncertainty-properly.json"), "utf8"));
const Y = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const QPATH = path.join(SITE, "learn/r06-uncertainty-properly.qmd");
const JS = fs.readFileSync(L("r06-uncertainty-properly.js"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

const M = R.prepare(D, Y), F = R.facts(M);
const rich = s => CORE.rich(s);
const BLOCKS = {
  "r06-task": () => R.staticTask(D, M),
  "r06-exemplars": () => EX.staticHTML(R.exemplarsSpec(D, F)) + "\n" + R.planRowsHTML(D) + "\n" + R.kindsHTML(D) + "\n" + R.flowHTML(),
  "r06-rubric": () => RB.staticHTML(D.rubric.competences) + '\n<p class="lx-eyebrow">An uncertainty check for your own study</p>\n<ul>'
    + D.checklist.map(c => "<li><b>" + R.rich(c.label) + ":</b> " + R.rich(c.text) + "</li>").join("") + "</ul>"
};
function between(text, key) {
  const a = text.match(new RegExp("<!-- " + key + ":start[^>]*-->\\n")), b = text.indexOf("<!-- " + key + ":end -->");
  return a && b > a.index ? { from: a.index + a[0].length, to: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); if (!r) throw new Error(k + " markers missing"); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("r06 fallback blocks written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");

// ---------------- the sort and the treatments
ok(D.kinds.map(k => k.id).join() === "parameter,structural,scenario,deep,choice", "four kinds, then the pile of choices");
ok(/not an uncertainty/.test(D.kinds[4].label) && /set apart from the four kinds/.test(D.kinds[4].sub), "the choices pile is labelled as a distinction, not a fifth kind");
ok(D.cards.length === 12 && D.kinds.every(k => D.cards.filter(c => c.bin === k.id).length >= 2) && D.cards.every(c => c.why), "twelve cards, at least two per pile, each with a reason");
ok(new Set(D.cards.map(c => c.id)).size === 12, "card ids unique");
ok(D.treatments.length === 5 && D.kinds.every(k => D.treatments.filter(t => R.card(D, t.card).bin === k.id).length === 1), "one treatment step per pile");
D.treatments.forEach(t => ok(t.options.length === 3 && t.options.filter(o => o.verdict === "good").length === 1 && t.options.some(o => o.verdict === "bad") && t.options.every(o => o.why), t.id + ": three options, one defensible, one hard to defend"));
ok(D.treatments.find(t => t.card === "programme").options.find(o => o.verdict === "bad").text.match(/Sample it/), "a choice that is sampled is hard to defend");
ok(/50%/.test(D.treatments.find(t => t.card === "newload").options.find(o => o.verdict === "bad").text), "an invented 50% for the deep uncertainty is hard to defend");

// ---------------- the model from first principles
// the clock and the hourly maxima, by an independent implementation (DST 9 March 08:00 UTC to 2 November 07:00 UTC, 2025)
{
  const t0 = Date.parse(Y.start_utc + "Z") - 3600000, on = Date.UTC(2025, 2, 9, 8), off = Date.UTC(2025, 10, 2, 7), B = Array(24).fill(0);
  let top = 0, at = 0;
  Y.demand.forEach((v, i) => { const ts = t0 + i * 3600000, h = new Date(ts + (ts >= on && ts < off ? -5 : -6) * 3600000).getUTCHours(); B[h] = Math.max(B[h], v); if (v > top) { top = v; at = i; } });
  ok(B.every((v, h) => near(v / top, M.B[h])), "B_h: each local hour's 2025 maximum over the year's maximum");
  ok(Math.max(...M.B) === 1 && M.B.indexOf(1) === 16, "the year's highest hour starts at 16:00 local");
  const L0 = new Date(t0 + at * 3600000 - 5 * 3600000);
  ok(L0.getUTCMonth() === 6 && L0.getUTCDate() === 29 && L0.getUTCHours() === 16 && F.peakDate === "29 July 2025" && F.peakHour === "16:00", "peak hour: 16:00 on 29 July 2025 (Central daylight time)");
  ok(Y.demand.length === 8760 && top === 1000, "town_year: 8,760 hours in thousandths of the 2025 peak");
}
ok(D.model.profiles.unmanaged.length === 24 && D.model.profiles.managed.length === 24 && D.model.profiles.unmanaged.reduce((a, b) => a + b) === 100 && D.model.profiles.managed.reduce((a, b) => a + b) === 100, "charging profiles: 24 hourly shares, each summing to 100%");
// the claim by hand: 450 × 1.01^10 + (15,000 − 2,000) cars × 10 kWh / 1,000 × 14%
{
  const hand = 450 * Math.pow(1.01, 10) + 13000 * 10 / 1000 * 0.14;
  ok(near(R.peakAt(M, 10, R.base(M), "central", "peaks"), hand, 1e-9) && F.claim === String(Math.round(hand)) && F.claim === "515", "the claim: 450 × 1.01¹⁰ + 130 MWh × 14% = " + hand.toFixed(2) + " MW, reported as 515");
  ok(F.evA === String(Math.round(13000 * 10 / 1000 * 0.14)), "the weak answer's car term: 130 MWh × 14% = 18 MW");
  ok(R.peakAt(M, 0, { g: 0.016, w: 1.04, kwh: 13 }, "fast", "peaks") === 450, "2025 is the observed 450 MW, whatever the draw");
}
// hours added: brute force over all 8,760 hours equals the 24-hour shortcut; peaks added ≥ hours added
{
  const t0 = Date.parse(Y.start_utc + "Z") - 3600000, on = Date.UTC(2025, 2, 9, 8), off = Date.UTC(2025, 10, 2, 7);
  const hrs = Y.demand.map((v, i) => { const ts = t0 + i * 3600000; return new Date(ts + (ts >= on && ts < off ? -5 : -6) * 3600000).getUTCHours(); });
  const dr = R.draws(M, 99, 6).concat([R.base(M)]);
  let good = true, ge = true;
  dr.forEach(d => ["slow", "central", "fast"].forEach(sc => [false, true].forEach(mg => [3, 10].forEach(k => {
    const c = Math.pow(1 + d.g, k) * d.w, Dy = (M.sc[sc].cars2035 - 2000) * k / 10 * d.kwh / 1000, s = mg ? D.model.profiles.managed : D.model.profiles.unmanaged;
    let bf = -1; for (let i = 0; i < 8760; i++) bf = Math.max(bf, c * 450 * Y.demand[i] / 1000 + Dy * s[hrs[i]] / 100);
    if (!near(bf, R.peakAt(M, k, d, sc, "hours", mg), 1e-9)) good = false;
    if (R.peakAt(M, k, d, sc, "peaks", mg) < R.peakAt(M, k, d, sc, "hours", mg) - 1e-12) ge = false;
  }))));
  ok(good, "hours added: the 24-hour shortcut equals the highest of all 8,760 hours with charging added");
  ok(ge, "peaks added is never below hours added (a sum of maxima ≥ the maximum of a sum)");
}
// seeded draws and percentiles reimplemented
function pct7(v, p) { const s = v.slice().sort((a, b) => a - b), r = (s.length - 1) * p, lo = Math.floor(r); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (r - lo); }
function runs(sc, form, mg, seed) {
  const g = CORE.mulberry32(seed == null ? 6 : seed), out = [];
  for (let i = 0; i < 1000; i++) { const d = { g: 0.004 + g() * 0.012, w: 0.96 + g() * 0.08, kwh: 7 + g() * 6 }; out.push(R.peakAt(M, 10, d, sc, form, mg)); }
  return out;
}
const r5 = v => Math.round(v / 5) * 5;
const IND = {};
[["c", "central", "hours", false], ["s", "slow", "hours", false], ["f", "fast", "hours", false], ["pc", "central", "peaks", false], ["pf", "fast", "peaks", false], ["fm", "fast", "hours", true]].forEach(x => {
  const v = runs(x[1], x[2], x[3]); IND[x[0]] = { p10: pct7(v, 0.1), p50: pct7(v, 0.5), p90: pct7(v, 0.9) };
  ["10", "50", "90"].forEach(q => ok(F[x[0] + q] === String(r5(IND[x[0]]["p" + q])), x[0] + q + ": " + F[x[0] + q] + " MW recomputed"));
});
ok(D.model.growth.join() === "0.004,0.016" && D.model.weather.join() === "0.96,1.04" && D.model.kwh.join() === "7,13" && D.model.runs === 1000 && D.model.seed === 6, "the stated ranges, runs and seed are the model's");
// differences quoted beside rounded values: the difference of the rounded values, and the rounded difference, agree
["slow", "central", "fast"].forEach(sc => {
  const p = R.study(M, sc, "peaks").end.p50, h = R.study(M, sc, "hours").end.p50, t = R.bandSaw(M, { params: true, scen: sc, form: "hours", whatif: false }).text;
  const shown = r5(p) - r5(h);
  ok(p > h && (shown > 0 ? t.indexOf("reads " + shown + " MW higher") >= 0 : t.indexOf("less than 5 MW higher") >= 0), sc + ": the gap in the text is the difference of the rounded medians (" + shown + "; unrounded " + (p - h).toFixed(1) + ")");
  if (sc !== "slow") ok(r5(p - h) === shown, sc + ": rounding the gap or the medians gives the same " + shown + " MW");
});
ok(F.gap === String(r5(IND.pc.p50) - r5(IND.c.p50)), "gap: " + F.gap + " MW = " + F.pc50 + " − " + F.c50);
ok(F.mHours === String(r5(IND.f.p50) - r5(IND.fm.p50)) && F.mHours === String(r5(IND.f.p50 - IND.fm.p50)), "managed charging, fast uptake, hours added: lower median by " + F.mHours + " MW, as the rounded medians show");
{ const pfm = R.study(M, "fast", "peaks", true).end.p50; ok(F.mPeaks === String(r5(pfm) - r5(IND.pf.p50)) && pfm > IND.pf.p50, "peaks added: managed charging raises the fast median (" + F.mPeaks + " MW): the model form flips the conclusion"); }
ok(F.cNew === String(r5(IND.c.p50) + 60), "the what-if median: " + F.c50 + " + 60 = " + F.cNew);
// Monte Carlo error is below the rounding step
{
  const sd = a => { const m = a.reduce((x, y) => x + y) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };
  ["central", "fast"].forEach(sc => { const p10 = [], p90 = []; for (let s = 1; s <= 20; s++) { const v = runs(sc, "hours", false, s); p10.push(pct7(v, 0.1)); p90.push(pct7(v, 0.9)); }
    ok(2 * sd(p10) < 5 && 2 * sd(p90) < 5, sc + ": two standard errors of P10 and P90 over 20 seeds (" + (2 * sd(p10)).toFixed(1) + ", " + (2 * sd(p90)).toFixed(1) + " MW) stay under the 5 MW rounding step"); });
}
// the rank order of the inputs (Spearman, no ties among continuous draws)
{
  const S = R.study(M, "central", "hours"), rh = R.rho(S);
  ok(rh.g > rh.w && rh.w > rh.kwh && rh.kwh > 0, "rank correlation: growth > weather > a car's energy");
  ok(F.rg === rh.g.toFixed(2) && F.rw === rh.w.toFixed(2) && F.rg === "0.83" && F.rw === "0.49", "rank correlations quoted: growth " + F.rg + ", weather " + F.rw);
  ok(new Set(S.runs).size === 1000, "no ties among the 2035 runs (ranks are unique)");
}
// the band's feedback is true in every state
{
  let all = true, what = true, inside = true;
  ["slow", "central", "fast", "all"].forEach(sc => ["peaks", "hours"].forEach(f => [false, true].forEach(p => [false, true].forEach(w => {
    const S = { params: p, scen: sc, form: f, whatif: w }, t = R.bandSaw(M, S).text, V = R.bandView(M, S);
    if (!t || /undefined|NaN/.test(t)) all = false;
    if (p && w) { const e = R.study(M, sc === "all" ? "central" : sc, f).end; if (!(e.p50 + 60 > e.p90 + 5)) what = false; if (!V.what || V.what.filter(x => x != null).length !== 6) what = false; }
    if (p && !w && sc !== "all" && f === "peaks") { const e = R.study(M, sc, f).end; if (!(e.p10 < 515 && 515 < e.p90)) inside = false; }
  }))));
  ok(all, "band feedback written for all 32 states");
  ok(what, "what-if: in every scenario and form the 2035 median plus 60 MW lies above the band's top, and the line runs 2030–2035");
  ok(inside, "“one point inside it”: the single number lies inside every peaks-added band");
  const env = R.bandSaw(M, { params: true, scen: "all", form: "hours", whatif: false }).text;
  ok(env.indexOf("(" + F.s10 + " MW)") >= 0 && env.indexOf(F.f90 + " MW") >= 0, "envelope text: slow P10 to fast P90");
  const st = R.bandSaw(M, { params: true, scen: "central", form: "hours", whatif: false }).text;
  ok(st.indexOf(F.c10 + "–" + F.c90 + " MW") >= 0 && st.indexOf(F.gap + " MW higher") >= 0, "hours-added text: the central band and the gap");
}
// EVPI toy (Go deeper)
{ const e = R.evpi(D.evpi); ok(e.ea === 7 && e.eb === 6 && e.perfect === 9 && e.evpi === 2, "EVPI toy: expected 7 and 6, perfect information 9, worth 2");
  ok(/an expected 7/.test(PAGE) && /an expected 6/.test(PAGE) && /an expected 9/.test(PAGE) && /9 − 7 = 2 payoff units/.test(PAGE), "the page quotes the toy's numbers"); }

// ---------------- the rewrite checks
{
  const ex = {}; ["paper", "board", "public"].forEach(id => { ex[id] = R.exText(D, id, F); });
  ["paper", "board", "public"].forEach(id => ok(R.rwChecks(D, id, ex[id]).every(c => c.ok), id + " example passes its own checks: " + R.rwChecks(D, id, ex[id]).filter(c => !c.ok).map(c => c.label).join("; ")));
  ["paper", "board", "public"].forEach(id => ok(R.exLines(D, id, F).length >= 3 && R.exLines(D, id, F).every(x => x.k && x.v && !/\{/.test(x.v)), id + " example: labelled sentences, filled"));
  // "about 9 in 10 model runs below" the rounded P90, and "about 8 in 10" between the rounded P10 and P90
  const share = (v, lo, hi) => v.filter(x => x > lo && x < hi).length / v.length;
  const vc = runs("central", "hours", false), vf = runs("fast", "hours", false);
  ok(near(share(vc, -Infinity, +F.c90), 0.9, 0.04) && near(share(vf, -Infinity, +F.f90), 0.9, 0.04) && /about 9 in 10 model runs/.test(ex.board), "board: about 9 in 10 runs below " + F.c90 + " (" + (100 * share(vc, -Infinity, +F.c90)).toFixed(1) + "%) and below " + F.f90 + " (" + (100 * share(vf, -Infinity, +F.f90)).toFixed(1) + "%)");
  ok(near(share(vc, +F.c10, +F.c90), 0.8, 0.04) && /about 8 in 10 of our model runs/.test(ex.public), "public: about 8 in 10 central runs between " + F.c10 + " and " + F.c90 + " (" + (100 * share(vc, +F.c10, +F.c90)).toFixed(1) + "%)");
  ok(/central car uptake/.test(ex.paper) && /central car uptake/.test(ex.board) && /middle pace/.test(ex.public) && /compared with 450 in 2025/.test(ex.public) && !/today/.test(ex.public + ex.board), "each example keeps its case and dates the 450 MW to 2025");
  ok(/higher values are possible/.test(ex.public) && /reliability target and the cost of falling short/.test(ex.board) && !/^Plan for/.test(ex.board), "public: higher outcomes possible; board: a percentile is not a plan by itself");
  ok(/constant 60 MW would raise each figure by 60 MW/.test(ex.board), "board: the what-if's load shape (constant) stated with its effect");
  ok(R.words(ex.public) <= 60, "public example at most 60 words (" + R.words(ex.public) + ")");
  ["paper", "board", "public"].forEach(id => ok(R.rwChecks(D, id, "").every(c => !c.ok), id + ": an empty text passes no check"));
  const claim = R.fill(D.study.claim, F);
  ok(!R.rwChecks(D, "paper", claim).find(c => c.id === "nowill").ok && !R.rwChecks(D, "paper", claim).find(c => c.id === "range").ok, "the claim fails 'a range' and 'no bare will'");
  ok(!R.rwChecks(D, "public", "Between 480 and 535 MW: P10 to P90 of Monte Carlo runs.").find(c => c.id === "plain").ok, "jargon is caught in the public version");
  ok(R.rwChecks(D, "paper", "The 2035 peak is 480 to 535 MW").find(c => c.id === "range").ok && R.rwChecks(D, "paper", "480–535 MW").find(c => c.id === "range").ok, "ranges written with 'to' or a dash both count");
  ok(/P10–P90/.test(ex.paper) && ex.paper.indexOf(F.c10 + "–" + F.c90) >= 0 && ex.board.indexOf(F.c90 + " MW") >= 0 && ex.public.indexOf(F.c10 + " to " + F.c90) >= 0, "examples quote the model's bands");
  ok(/independently, with equal odds across each range/.test(ex.paper), "paper example states the sampling assumption");
}
// the reader's plan: a row counts only with all three parts; the pile's suggestion never enters the copied plan
ok(R.planDone([{ u: "a", kind: "deep", how: "what-if" }, { u: "b", kind: "", how: "x" }, { u: "", kind: "scenario", how: "x" }, { u: "c", kind: "choice", how: "" }, { u: "d", kind: "choice", how: "  " }]) === 1, "plan: a row counts only with an uncertainty, a pile and a treatment");
ok(R.planDone([{ u: "a", kind: "parameter" }, { u: "b", kind: "deep" }, { u: "c", kind: "choice" }]) === 0, "plan: three rows with blank treatments are not complete");
{ const t = R.planText(D, [{ u: "Growth", kind: "parameter", how: "" }]);
  ok(/1\. Growth \| Parameter \| \(treatment: to write\)/.test(t) && Object.keys(D.plan.kindHint).every(k => t.indexOf(D.plan.kindHint[k]) < 0), "plan text: an empty treatment reads '(treatment: to write)', never a suggestion"); }
ok(/Three complete rows finish here/.test(JS) && /"Suggestion: " \+ D\.plan\.kindHint/.test(JS), "plan step: complete rows finish it; the suggestion is a labelled placeholder");
ok(D.plan.examples.rows.length === 2 && D.plan.examples.rows.map(r => r.key).join() === "weak,good" && R.planRowsHTML(D).indexOf("Strong row") >= 0, "a weak and a strong plan row, as exemplars of the plan");

// ---------------- what the page says about its own assumptions
{
  const sampling = /drawn independently,? with equal odds across (its|each) range/;
  ok(sampling.test(JS) && sampling.test(PAGE) && sampling.test(EX.plain(R.exemplarsSpec(D, F).answers[1])) && sampling.test(D.meta.note) && sampling.test(R.staticTask(D, M)), "the sampling assumption is stated in the step, the data note, the strong answer, the meta note and the no-JS band");
  const whys = D.cards.map(c => c.why).join(" ") + R.FLOW.traces.map(t => t.text).join(" ");
  ok(!/meter data bound|ten years of|range from data|from driving surveys or meter data: sample/.test(whys) && /illustrative/.test(cards("growth").why + cards("kwh").why + cards("heat").why), "no invented data source for the illustrative ranges");
  ok(/Odds you can defend/.test(R.FLOW.nodes.q3.t) && /Bounds/.test(R.FLOW.nodes.q4.t) && /no odds/.test(R.FLOW.nodes.a4.s), "flowchart: sampling needs defensible odds; bounds go side by side with no odds");
  ok(/accepts three car-uptake storylines but no odds/.test(D.study.assume) && /could move pile/.test(D.study.assume) && R.staticTask(D, M).indexOf(R.rich(D.study.assume)) >= 0 && /A different pile is fair if you can give the reason/.test(R.sortSaw({ right: 12, total: 12 }).text), "the sort's assumptions stated; another pile is fair with a reason");
  ok(/constant 60 MW/.test(D.model.newLoad.label) && /constant 60 MW/.test(JS), "the what-if names its load shape (a constant 60 MW)");
  const cl = {}; D.checklist.forEach(c => { cl[c.id] = c; });
  ok(/if sampled/.test(cl.together.label) && /scenario envelope or a bounded case/.test(cl.ranges.text), "checklist: sampling lines conditional; scenario and bounded routes allowed (rubric: scenario or global sensitivity)");
  ok(!/fixed but unknown/.test(PAGE) && /assumes one constant growth rate/.test(PAGE), "go deeper: the model's constant rate, not a fixed true rate");
  ok(/with bounds only, compare low and high cases/.test(D.plan.kindHint.parameter) && /with bounds only, compare low and high cases/.test(PAGE), "bounds only: compare cases, no probabilities");
}
function cards(id) { return D.cards.find(c => c.id === id); }

// ---------------- the single number, rebuilt step by step; what the weather input is; what sampling covers
{ const W = R.worked(M);
  ok(near(W.grown, 450 * Math.pow(1.01, 10), 1e-9) && W.grown.toFixed(1) === "497.1" && W.cars === 13000 && W.day === 130 && W.add.toFixed(1) === "18.2" && Math.round(W.total) === Number(F.claim), "worked: 450 × 1.010^10 = 497.1 MW, 13,000 cars × 10 kWh = 130 MWh a day, 14% in one hour = 18.2 MW, total " + F.claim + " MW");
  ok(near(W.total, R.peakAt(M, 10, R.base(M), "central", "peaks"), 1e-9) && W.hour === D.model.profiles.unmanaged.indexOf(Math.max.apply(null, D.model.profiles.unmanaged)), "worked: the same as the model's single number, at the unmanaged pattern's busiest hour");
  const st = R.staticTask(D, M), wh = R.workedHTML(M);
  ok(st.indexOf(wh) >= 0 && JS.indexOf('H("div", { html: workedHTML(M) }, act)') >= 0 && /497\.1 MW/.test(wh) && /130 MWh/.test(wh) && /18\.2 MW/.test(wh) && /same pattern every day/.test(wh), "worked: shown under the claim, live and without JavaScript");
  ok(st.indexOf(R.rich(R.KEY)) > st.indexOf("The 2035 peak as bands, in numbers"), "no-JS band table: the percentile key beneath it"); }
ok(!/±4/.test(JSON.stringify(D) + JS) && /multiplier, 0\.96 to 1\.04/.test(cards("heat").text) && D.model.weather.join() === "0.96,1.04" && /not computed from temperature/.test(cards("heat").why), "weather: a multiplier on background demand, 0.96 to 1.04 as the model draws it, not a temperature");
ok(!/Sampling cannot/i.test(JSON.stringify(D) + JS) && /vary three numbers only/.test(JS), "sampling's limit is what these runs vary, not sampling as such");
{ const cb = D.treatments.find(t => t.id === "t-cars").options.find(o => o.id === "b");
  ok(!/more likely/.test(cb.why) && /not bounds/.test(cb.why), "car uptake: a likelier central case does not make the others extremes"); }
ok(/shifts car charging to quieter hours/.test(cards("programme").text), "managed charging defined on its card");

// ---------------- exemplars, page, blocks
const spec = R.exemplarsSpec(D, F);
ok(EX.validate(spec).length === 0, "exemplars well formed: " + EX.validate(spec).join("; "));
const good = EX.plain(spec.answers[1]);
["Varied:", "Scenarios:", "Model form:", "Result:", "Drivers:", "Not in the band:"].forEach(k => ok(good.indexOf(k) >= 0, "strong answer has " + k));
ok(good.indexOf(F.c10 + "–" + F.c90 + " MW (P10–P90)") >= 0 && good.indexOf("(rank correlation " + F.rg + ")") >= 0, "strong answer quotes the model");
ok(EX.plain(spec.answers[0]).indexOf("will reach " + F.claim + " MW") >= 0, "weak answer is the claim");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(r && PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + ": the page's no-JS block equals the model's (run with --write after a data edit)"); });
{ const brief = PAGE.indexOf('<div class="lx-card lx-studio-brief">'), inter = PAGE.indexOf('<div class="lx-interactive');
  ok(brief >= 0 && brief < inter && /<b>Produce:<\/b>[\s\S]*<b>From:<\/b>[\s\S]*<b>Done when:<\/b> the rubric's bar for Uncertainty: uncertainties classified; scenario or global sensitivity analysis; results as ranges\.[\s\S]*About 30 minutes guided here, then about an hour on your own/.test(PAGE.slice(brief, inter)),
    "the task card (produce, from, done when in the rubric's words, time) sits above the interactive"); }
ok(/1,000 runs, seed 6/.test(PAGE) && /16:00 on 29 July 2025/.test(PAGE) && /450 MW/.test(PAGE), "data note and sources: runs, seed, the peak hour and the town's scale");
ok(/33 to 66%/.test(PAGE) && /42%/.test(PAGE), "sourced numbers on the page");
ok(!/\[\[/.test(R.staticTask(D, M) + R.kindsHTML(D)), "no-JS blocks: glossary marks become term spans");
ok(D.cards.every(c => R.staticTask(D, M).indexOf(R.rich(c.text).replace(/&amp;/g, "&amp;")) >= 0), "no-JS task: every card");
ok(!/<dt>Which treatment\?<\/dt>/.test(PAGE) && PAGE.indexOf(R.flowHTML()) >= 0, "the flowchart's no-JS version is the generated question-action rows");
// links, scope, the course author's research
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const urls = (OWN + JSON.stringify(D) + JS).match(/https?:\/\/[^\s"'<>)\\]+/g) || [];
const allowed = /^https:\/\/([\w-]+\.)*(eia\.gov|doi\.org|ipcc\.ch)\//;
ok(urls.every(u => allowed.test(u)), "every link on an allow-listed host: " + urls.filter(u => !allowed.test(u)).join(" "));
ok(!/\bAI\b|artificial intelligence|nuclear|reactor|\bSMR\b|learning[- ](curve|rate)|data[- ]cent/i.test(JSON.stringify(D) + JS + OWN), "no deny-listed or out-of-scope words (and no data centers in this studio)");
ok(!/Henryutd2021|CF7|cf7-|delay(ed)? energization|NAPS/i.test(JSON.stringify(D) + JS + OWN), "none of the course author's research: no repository, case file or paper");

// ---------------- text budget
const words = R.words;
EX.plain(spec.answers[1]).replace(/ \[\d+\]/g, "").split("\n").forEach((l, i) => ok(words(l) <= 35, "strong answer line " + (i + 1) + ": at most 35 words (" + words(l) + ")"));
spec.answers.forEach(a => EX.marks(a).forEach(m => ok(words(m.note) <= 25, a.key + " note " + m.n + ": at most 25 words")));
D.cards.forEach(c => { ok(words(c.text) <= 18, c.id + ": a short card (" + words(c.text) + ")"); ok(words(c.why) <= 30, c.id + ": reason at most 30 words (" + words(c.why) + ")"); });
D.treatments.forEach(t => t.options.forEach(o => { ok(words(o.why) <= 35, t.id + "/" + o.id + ": reason at most 35 words (" + words(o.why) + ")"); ok(words(o.text) <= 30, t.id + "/" + o.id + ": option at most 30 words"); }));
D.kindsTable.forEach(r => ["what", "here", "treat", "say"].forEach(k => ok(words(r[k]) <= 25, r.kind + "/" + k + ": at most 25 words")));
R.FLOW.traces.forEach(t => ok(words(t.text) <= 35, "flowchart trace " + t.label + ": at most 35 words"));
["paper", "board", "public"].forEach(id => R.exLines(D, id, F).forEach((x, i) => ok(words(x.v) <= 35, id + " example line " + (i + 1) + ": at most 35 words (" + words(x.v) + ")")));
ok(words(R.exText(D, "public", F)) <= 60, "public example: at most 60 words in all (" + words(R.exText(D, "public", F)) + ")");
D.rewrite.fields.forEach(f => ok(words(f.hint) <= 30, f.id + " hint: at most 30 words"));
Object.keys(D.plan.kindHint).forEach(k => ok(words(D.plan.kindHint[k]) <= 30, "suggestion " + k + ": at most 30 words (" + words(D.plan.kindHint[k]) + ")"));
D.plan.examples.rows.forEach(r => ["u", "how", "note"].forEach(k => ok(words(r[k]) <= 30, "plan row " + r.key + "/" + k + ": at most 30 words")));
ok(words(D.study.assume) <= 35 && words(R.KEY) <= 35, "the sort's assumptions and the chart key: at most 35 words each");
D.checklist.forEach(c => ok(words(c.text) <= 25, "checklist " + c.id + ": at most 25 words"));
{ let all = true; const long = [];
  ["slow", "central", "fast", "all"].forEach(sc => ["peaks", "hours"].forEach(f => [false, true].forEach(p => [false, true].forEach(w => { const t = R.bandSaw(M, { params: p, scen: sc, form: f, whatif: w }).text; if (words(t.replace(/\*\*/g, "")) > 40) { all = false; long.push(words(t)); } }))));
  ok(all, "band feedback: every state at most 40 words (" + long.join(", ") + ")"); }
[0, 6, 12].forEach(n => ok(words(R.sortSaw({ right: n, total: 12 }).text.replace(/\*\*/g, "")) <= 40, "sort feedback at most 40 words"));
{ const fl = R.flowHTML().match(/<tr><th scope="row">[\s\S]*?<\/tr>/g) || [];
  ok(fl.length === 5, "flowchart fallback: four questions and 'none of these', one row each (" + fl.length + ")");
  fl.forEach((r, i) => ok(words(r.replace(/<[^>]+>/g, " ")) <= 20, "flowchart fallback row " + (i + 1) + ": at most 20 words")); }
// every paragraph of the myth answers, the task card's hints and the Go deeper bullets
(PAGE.match(/<details class="lx-answer">[\s\S]*?<\/details>/g) || []).forEach((a, i) => (a.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []).forEach(p => ok(words(p.replace(/<[^>]+>/g, " ")) <= 35, "myth answer " + (i + 1) + ": each paragraph at most 35 words (" + words(p.replace(/<[^>]+>/g, " ")) + ")")));
(PAGE.slice(PAGE.indexOf('<div class="lx-card lx-studio-brief">'), PAGE.indexOf('<div class="lx-interactive')).match(/<(li|p class="lx-hint")>[\s\S]*?<\/(li|p)>/g) || []).forEach((p, i) => ok(words(p.replace(/<[^>]+>/g, " ")) <= 40, "task card line " + (i + 1) + ": at most 40 words (" + words(p.replace(/<[^>]+>/g, " ")) + ")"));
(PAGE.match(/<div class="lx-deeper-body">[\s\S]*?<\/div>/g) || []).forEach((b, i) => (b.match(/<li>[\s\S]*?<\/li>/g) || []).forEach(l => ok(words(l.replace(/<[^>]+>/g, " ")) <= 40, "go deeper " + (i + 1) + " bullet: at most 40 words (" + words(l.replace(/<[^>]+>/g, " ")) + ")")));
{ const dn = (PAGE.match(/<p class="lx-datanote">[\s\S]*?<\/p>/) || [""])[0].split(/<br>/).map(r => r.replace(/<[^>]+>/g, " "));
  ok(dn.length >= 3, "data note in labelled rows"); dn.forEach((r, i) => ok(words(r) <= 35, "data note row " + (i + 1) + ": at most 35 words (" + words(r) + ")")); }
{
  const stepTexts = (JS.match(/steps\.push\(\{ text: "([^"]+)"/g) || []).map(t => t.replace(/^steps\.push\(\{ text: "/, "").replace(/"$/, ""))
    .concat((JS.match(/var steps = \[\{ text: "([^"]+)"/) || [])[1] || []);
  const full = stepTexts.filter(t => t !== "Treatment ");
  ok(full.length === 6, "the six step texts written in full (" + full.length + ")");
  ok(/text: "Treatment " \+ \(i \+ 1\) \+ " of 5 · " \+ kindLabel\(D, cd\.bin\) \+ "\. Choose how you would handle this one, then read why\."/.test(JS), "the treatment step template");
  full.concat(D.kinds.map(k => "Treatment 1 of 5 · " + k.label + ". Choose how you would handle this one, then read why."))
    .map(t => t.replace(/" \+ F\.runs \+ "/, "1,000").replace(/" \+ F\.seed \+ "/, "6"))
    .forEach((t, i) => ok(words(t) <= 35, "step text " + (i + 1) + ": at most 35 words (" + words(t) + ")"));
}
// path.yml says what the data hold
{ const P = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), row = P.slice(P.indexOf("id: r06-uncertainty-properly"), P.indexOf("code: R7"));
  ok(/Sort twelve uncertainties/.test(row) && D.cards.length === 12, "path.yml: 'Sort twelve uncertainties', as many as the data hold");
  ok(/after: \[M7(, M8)?\]/.test(row) && /practice_minutes: 60/.test(row) && /minutes: 30/.test(row), "path.yml: prerequisites (M7; M8 once live) and minutes as the curriculum row"); }

// ---------------- the page on a stub document: the first card shows the claim and how it is built
{
  const vm = require("vm"), { env, load } = require("./stubdom.js"), E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false);
  E.LX.lessonRef = () => ({ ready: true, href: "#", label: "R6" });
  ["cards", "cardsort", "plot", "exemplars", "comparetable", "flowchart", "rubric", "checklist"].forEach(n => { try { load(n, E); } catch (e) { /* not needed below */ } });
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "r06-uncertainty-properly") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "r06-uncertainty-properly" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { r06_uncertainty_properly: D, town_year: Y, path: { starter: [], more: [] } }, root); } catch (e) { threw = e.stack; }
  ok(!threw, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  ok(!threw && /How the single number is built/.test(live.textContent) && /497\.1 MW/.test(live.textContent) && /18\.2 MW/.test(live.textContent), "the first card: the claim, and how its 515 MW is built");
}

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
