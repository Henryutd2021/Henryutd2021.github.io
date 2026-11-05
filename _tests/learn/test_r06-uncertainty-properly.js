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
//   - the rewrite checks: the examples pass their own checks, an empty text passes none, the claim fails "no bare will"
//   - the no-JS blocks equal the model's (--write rewrites them); text budget; links on allow-listed hosts; no out-of-scope words
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
  "r06-exemplars": () => EX.staticHTML(R.exemplarsSpec(D, F)) + "\n" + R.kindsHTML(D),
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
  const ex = R.fillDeep(D.rewrite.examples, F);
  ["paper", "board", "public"].forEach(id => ok(R.rwChecks(D, id, ex[id]).every(c => c.ok), id + " example passes its own checks: " + R.rwChecks(D, id, ex[id]).filter(c => !c.ok).map(c => c.label).join("; ")));
  ok(R.words(ex.public) <= 60, "public example at most 60 words (" + R.words(ex.public) + ")");
  ["paper", "board", "public"].forEach(id => ok(R.rwChecks(D, id, "").every(c => !c.ok), id + ": an empty text passes no check"));
  const claim = R.fill(D.study.claim, F);
  ok(!R.rwChecks(D, "paper", claim).find(c => c.id === "nowill").ok && !R.rwChecks(D, "paper", claim).find(c => c.id === "range").ok, "the claim fails 'a range' and 'no bare will'");
  ok(!R.rwChecks(D, "public", "Between 480 and 535 MW: P10 to P90 of Monte Carlo runs.").find(c => c.id === "plain").ok, "jargon is caught in the public version");
  ok(R.rwChecks(D, "paper", "The 2035 peak is 480 to 535 MW").find(c => c.id === "range").ok && R.rwChecks(D, "paper", "480–535 MW").find(c => c.id === "range").ok, "ranges written with 'to' or a dash both count");
  ok(/P10–P90/.test(ex.paper) && ex.paper.indexOf(F.c10 + "–" + F.c90) >= 0 && ex.board.indexOf(F.c90 + " MW") >= 0 && ex.public.indexOf(F.c10 + " to " + F.c90) >= 0, "examples quote the model's bands");
}
// the reader's plan
ok(R.planDone([{ u: "a", kind: "deep" }, { u: "b", kind: "" }, { u: "", kind: "scenario" }, { u: "c", kind: "choice" }]) === 2, "plan: a row counts when it has an uncertainty and a pile");
ok(/1\. Growth \| Parameter \| Range from data/.test(R.planText(D, [{ u: "Growth", kind: "parameter", how: "" }])), "plan text: the pile's treatment fills an empty treatment");

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
// links, scope, Henry's research
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const urls = (OWN + JSON.stringify(D) + JS).match(/https?:\/\/[^\s"'<>)\\]+/g) || [];
const allowed = /^https:\/\/([\w-]+\.)*(eia\.gov|doi\.org|ipcc\.ch)\//;
ok(urls.every(u => allowed.test(u)), "every link on an allow-listed host: " + urls.filter(u => !allowed.test(u)).join(" "));
ok(!/\bAI\b|artificial intelligence|nuclear|reactor|\bSMR\b|learning[- ](curve|rate)|data[- ]cent/i.test(JSON.stringify(D) + JS + OWN), "no deny-listed or out-of-scope words (and no data centers in this studio)");
ok(!/Henryutd2021|CF7|cf7-|delay(ed)? energization|NAPS/i.test(JSON.stringify(D) + JS + OWN), "no Henry research: no repository, case file or paper of his");

// ---------------- text budget
const words = R.words;
EX.plain(spec.answers[1]).replace(/ \[\d+\]/g, "").split("\n").forEach((l, i) => ok(words(l) <= 35, "strong answer line " + (i + 1) + ": at most 35 words (" + words(l) + ")"));
spec.answers.forEach(a => EX.marks(a).forEach(m => ok(words(m.note) <= 25, a.key + " note " + m.n + ": at most 25 words")));
D.cards.forEach(c => { ok(words(c.text) <= 18, c.id + ": a short card (" + words(c.text) + ")"); ok(words(c.why) <= 30, c.id + ": reason at most 30 words (" + words(c.why) + ")"); });
D.treatments.forEach(t => t.options.forEach(o => { ok(words(o.why) <= 35, t.id + "/" + o.id + ": reason at most 35 words (" + words(o.why) + ")"); ok(words(o.text) <= 30, t.id + "/" + o.id + ": option at most 30 words"); }));
D.kindsTable.forEach(r => ["what", "here", "treat", "say"].forEach(k => ok(words(r[k]) <= 25, r.kind + "/" + k + ": at most 25 words")));
R.FLOW.traces.forEach(t => ok(words(t.text) <= 35, "flowchart trace " + t.label + ": at most 35 words"));
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

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
