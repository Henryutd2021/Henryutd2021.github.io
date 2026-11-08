// test_m07-monte-carlo.js — Node tests for Modeler lesson M7 (assets/learn/m07-monte-carlo.js, its data file and the page
// learn/m07-monte-carlo.qmd), all with the page's fixed seeds (the main run seed 7, repeats with seeds 1..20):
//   - the toy equals case file CF7's model at CF7's values (12, 24 and 36 months); the five ranges centre on CF7's values
//   - the generator and the samplers: mulberry32 is reproducible and its seeds differ; a Latin hypercube puts exactly one
//     draw in each of N equal slices of every input (N = 10 and 1,000); its slice ranks equal the sorted ranks; plain
//     random sampling is reproducible too
//   - the statistics: K5's percentile rule, Spearman's rho against the no-ties formula, the Monte Carlo error as the
//     standard deviation of 20 repeats, the tie rule
//   - claims about the model as built: the developer's cost does not depend on the upgrades or the never-arrives chance
//     and rises with the other three inputs (other customers' cost does not depend on the margin or the capital); the
//     corners are the extremes of all 32 combinations; "near a corner" (the three inputs of the developer's cost in the
//     same outer tenth) has a chance of 0.1^3 per corner and its count in the main study; the guess closest to the P90 is
//     "About $200M"; the step 10 rank change; the trend of every input-account cloud (step 9's text version)
//   - every number the page states (step cards through the stub run below, the no-JS block, the data note, Go deeper,
//     myths, quiz, numbers to remember, the explain layer) matches the model; the reference block of the data file (the
//     lab notebook asserts it) is recomputed
//   - the page on a stub document (stubdom.js): every step's action unlocks Next and its result line names the model's
//     numbers; the step text (35 words) and every result line (40 words) stay within two sentences; results sit in
//     aria-live regions; step 9's scatter has a text version with its shape and a CSV of every run; step 10's rank bars
//     are a plain list; the explain layer says it shows the reference case; the demo states run
//   - scope: data centers only as loads; no nuclear term, no "AI", no deny-listed term on the page, in the
//     data, the script, the sidecar or the notebook; links only to learn pages, doi.org and the allow-listed repository
//   - research wording (the sourcing rule): every sentence about the course author's study, on the page, in the data,
//     in this lesson's script, in its path.yml entry and in the notebook, is an approved sentence of the excerpt wording
//     (E7, with its revisions), word for word; the citation is E7.14
//   - speed: the main study, its 20 repeats and step 10's re-ranking take well under the page's budget in Node
// Usage (from the site folder):  node _tests/learn/test_m07-monte-carlo.js [--write]
//   --write  rewrite the data file's reference block and the page's no-JS block first
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PRIV = require("./private_sources.js");
const ID = "m07-monte-carlo";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const CF7 = require(L("cf7-cost-of-waiting.js"));
const DPATH = L("data/" + ID + ".json"), QPATH = path.join(SITE, "learn", ID + ".qmd");
const NBPATH = path.join(SITE, "learn/notebooks", ID + ".ipynb"), SIDE = path.join(SITE, "learn/_w1", ID + ".yml");
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
let D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
const C7 = JSON.parse(fs.readFileSync(L("data/cf7-cost-of-waiting.json"), "utf8")).idea;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const rel = (a, b, r) => Math.abs(a - b) <= r * Math.max(1, Math.abs(b));
const { musd, pm, shr, pts, r2, int } = M;
const text = s => s.replace(/\\\$/g, "$").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();

// ---------------- --write: the reference block and the no-JS block
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  D.reference = M.reference(D);
  fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n");
  let q = fs.readFileSync(QPATH, "utf8"); const r = between(q, "m7-fallback");
  q = q.slice(0, r.from) + M.staticFallback(D) + "\n" + q.slice(r.to);
  fs.writeFileSync(QPATH, q);
  console.log("wrote the reference block and the no-JS block");
  D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
}
const PAGE = fs.readFileSync(QPATH, "utf8"), RAW = fs.readFileSync(DPATH, "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const NB = readOr(NBPATH), SIDEYML = readOr(SIDE);
{ const r = between(PAGE, "m7-fallback"); ok(PAGE.slice(r.from, r.to) === M.staticFallback(D) + "\n", "the no-JS block is up to date (run with --write)"); }

// ---------------- the toy against CF7
const byKey = {}; D.inputs.forEach(q => { byKey[q.key] = q; });
const CF7MAP = { margin: "marginPerMWMonth", capital: "capitalCommitted", rate: "discountPerYear", upgrade: "upgradeCost", strand: "strandPerMonth" };
D.inputs.forEach(q => {
  ok(q.base === C7[CF7MAP[q.key]], q.key + ": the base is CF7's value (" + C7[CF7MAP[q.key]] + ")");
  ok(near((q.lo + q.hi) / 2, q.base, 1e-12) && q.lo < q.base, q.key + ": the range is centred on CF7's value");
});
ok(D.toy.loadMW === C7.loadMW && D.toy.strandCap === C7.strandCap && D.toy.tariffShare === 0 && D.toy.bridge === false, "the toy: CF7's load and cap, no tariff, no bridge power");
const X0 = M.baseX(D);
D.waits.forEach(t => {
  const a = M.outputs(D.toy, X0, t), b = CF7.ledgers(C7, t, 0, false);
  ok(rel(a.dev, b.developer, 1e-12) && rel(a.rate, b.ratepayers, 1e-12), t + " months: the toy at CF7's values equals CF7's accounts (" + musd(a.dev) + ", " + musd(a.rate) + ")");
});
ok(musd(M.outputs(D.toy, X0, 24).dev) === "$171.1M" && musd(CF7.ledgers(C7, 24, 0, false).developer) === "$171.1M", "24 months: $171.1M on both pages");

// ---------------- generator and samplers
const g1 = M.rng(7), g2 = M.rng(7), g3 = M.rng(8), s1 = [], s2 = [], s3 = [];
for (let k = 0; k < 1000; k++) { s1.push(g1()); s2.push(g2()); s3.push(g3()); }
ok(s1.every((v, k) => v === s2[k]) && s1.every(v => v >= 0 && v < 1), "mulberry32: the same seed gives the same draws, all in [0, 1)");
ok(s1.filter((v, k) => v === s3[k]).length === 0 && Math.abs(M.pearson(s1, s3)) < 0.1, "mulberry32: seeds 7 and 8 give different, uncorrelated streams");
ok(near(M.mean(s1), 0.5, 0.03), "mulberry32: 1,000 draws average about 0.5 (" + M.mean(s1).toFixed(3) + ")");
// the first draws of seeds 1..20 spread over [0, 1) (an LCG's would sit within 0.01 of each other)
const firsts = M.seeds(D).map(s => M.rng(s)());
ok(Math.max(...firsts) - Math.min(...firsts) > 0.5, "the first draws of seeds 1 to 20 are spread out, so the repeats are independent studies");
[10, 1000].forEach(n => {
  const st = M.study(D, { n, seed: D.seed });
  D.inputs.forEach((q, j) => {
    ok(M.empty(st.U, j, n) === 0 && st.U[j].every(u => u >= 0 && u < 1), "Latin hypercube, " + n + " runs: one draw in each of the " + n + " slices of " + q.key);
    ok(st.R[j].every((r, a) => r === M.ranks(st.X[q.key])[a]), "Latin hypercube, " + n + " runs: the slice ranks of " + q.key + " equal its sorted ranks");
    ok(st.X[q.key].every(v => v >= q.lo && v < q.hi), q.key + ": every draw inside its range");
  });
});
{
  const a = M.study(D, { n: 50, seed: 3, method: "random" }), b = M.study(D, { n: 50, seed: 3, method: "random" });
  ok(a.dev.every((v, k) => v === b.dev[k]) && a.R === null, "plain random sampling is reproducible from its seed and ranks by sorting");
}
// the exact order of draws, which the notebook ports: Latin hypercube margin of run 0, seed 7, ten runs
{
  const r = M.rng(D.seed), n = 10, p = []; for (let a = 0; a < n; a++) p.push(a);
  for (let a = n - 1; a > 0; a--) { const b = Math.floor(r() * (a + 1)); [p[a], p[b]] = [p[b], p[a]]; }
  const u0 = (p[0] + r()) / n, st = M.study(D, { n, seed: D.seed });
  ok(near(st.U[0][0], u0, 0), "the hypercube's order of draws: the permutation first, then one jitter per run, input by input");
}

// ---------------- statistics
ok(M.quantile([1, 2, 3, 4], 0.9) === 3.7 && M.quantile([5], 0.9) === 5, "percentiles by linear interpolation at (N - 1) p (K5's rule)");
{
  const a = [3, 1, 4, 1.5, 9, 2.6], b = [2, 7, 1, 8, 2.8, 1.8], ra = M.ranks(a), rb = M.ranks(b);
  let d2 = 0; for (let k = 0; k < 6; k++) d2 += (ra[k] - rb[k]) ** 2;
  ok(near(M.spearman(a, b), 1 - 6 * d2 / (6 * 35), 1e-12), "Spearman's rho: the correlation of ranks equals 1 − 6 Σd² / (N (N² − 1)) without ties");
  ok(M.ranks([2, 1, 2]).join() === "2.5,1,2.5", "ties get their average rank");
}
ok(near(M.sd([1, 2, 3, 4]), Math.sqrt(5 / 3), 1e-12), "the standard deviation of the repeats divides by n − 1");
ok(near(1 / Math.sqrt(2 * (20 - 1)), 0.162, 0.001), "20 repeats: the relative error of a standard deviation is about 1/√(2 × 19) = 16%, as Go deeper says");

// ---------------- every number: the facts
const t0 = Date.now(), F = M.facts(D), factsMs = Date.now() - t0;
const T = D.wait, tor = F.tornado.dev, cor = F.corners.dev, e = F.err, sm = F.main.dev;
const swing = tor.rows.slice().sort((a, b) => Math.abs(b.atHi - b.atLo) - Math.abs(a.atHi - a.atLo));
ok(swing[0].key === "margin" && musd(swing[0].atLo) === "$137.8M" && musd(swing[0].atHi) === "$204.4M", "step 3: the margin swings most, $137.8M to $204.4M");
ok(["capital", "rate"].every(k => { const r = tor.rows.find(x => x.key === k); return Math.abs(Math.abs(r.atHi - r.atLo) - 28e6) < 1e6; }), "step 3: capital and the discount rate swing it by about $28M each");
ok(["upgrade", "strand"].every(k => { const r = tor.rows.find(x => x.key === k); return r.atLo === tor.base && r.atHi === tor.base; }), "step 3: the upgrades and the never-arrives chance do not move the developer's cost");
// the developer's cost rises with margin, capital and the discount rate everywhere in the box (so the corners are all-low and all-high)
{
  const st = M.study(D, { n: 200, seed: 11, method: "random" }), steps = { margin: 100, capital: 1e5, rate: 1e-5 };
  let mono = true;
  for (let a = 0; a < 200; a++) Object.keys(steps).forEach(k => { const x = {}; D.inputs.forEach(q => { x[q.key] = st.X[q.key][a]; }); const y0 = M.outputs(D.toy, x, T).dev; x[k] += steps[k]; if (!(M.outputs(D.toy, x, T).dev > y0)) mono = false; });
  ok(mono, "the developer's cost rises with the margin, the capital and the discount rate at 200 random points of the box");
  // the inputs each account depends on (M.ENTERS, used by step 4's result, step 6's corner neighbourhood and step 9's text version)
  let apart = true;
  for (let a = 0; a < 200; a++) M.OUTS.forEach(o => D.inputs.forEach(q => { if (M.ENTERS[o].includes(q.key)) return;
    const x = {}; D.inputs.forEach(z => { x[z.key] = st.X[z.key][a]; }); const y0 = M.outputs(D.toy, x, T)[o]; x[q.key] = q.key === "margin" ? q.hi : q.lo; if (M.outputs(D.toy, x, T)[o] !== y0) apart = false; }));
  ok(apart && M.ENTERS.dev.join() === "margin,capital,rate" && M.ENTERS.rate.join() === "rate,upgrade,strand", "the developer's cost depends on margin, capital and rate only; other customers' on rate, upgrades and the never-arrives chance only");
  const lo = {}, hi = {}; D.inputs.forEach(q => { lo[q.key] = q.lo; hi[q.key] = q.hi; });
  ok(rel(M.outputs(D.toy, lo, T).dev, cor.lo, 1e-12) && rel(M.outputs(D.toy, hi, T).dev, cor.hi, 1e-12), "the corners of all 32 combinations are every input low and every input high");
}
ok(musd(cor.lo) === "$111.8M" && musd(cor.hi) === "$234.7M", "step 4: corners $111.8M and $234.7M");
ok(F.main.beyond === 0 && sm.min > cor.lo && sm.max < cor.hi, "step 6: every run lies between the corners (runs " + musd(sm.min) + " to " + musd(sm.max) + ")");
{
  // near a corner: recount by hand; the chance per corner is 0.1^3 (independent uniform inputs; one run of a Latin
  // hypercube has independent uniform inputs too), so 1,000 runs expect 2 near either corner; the repeats average close to it
  const main = M.study(D, { seed: D.seed }), u = (k, a) => (main.X[k][a] - byKey[k].lo) / (byKey[k].hi - byKey[k].lo);
  let hi = 0, lo = 0; for (let a = 0; a < D.runs; a++) { const v = ["margin", "capital", "rate"].map(k => u(k, a)); if (v.every(x => x >= 0.9)) hi++; if (v.every(x => x < 0.1)) lo++; }
  ok(D.near === 0.1 && F.near.hi === hi && F.near.lo === lo && hi === 2 && lo === 0 && near(F.near.chance, 0.001, 1e-15) && F.near.expect === 2, "step 6: near a corner, 2 runs (2 high, 0 low); 0.1³ per corner predicts 2");
  const counts = M.seeds(D).map(s => M.nearCorner(M.study(D, { seed: s }), "dev", D.near).n), avg = M.mean(counts);
  ok(avg > 1 && avg < 3.5, "near a corner: seeds 1 to 20 average " + avg.toFixed(2) + " runs, close to the 2 that 0.1³ per corner predicts");
  ok(D.reference.near && D.reference.near.hi === 2 && D.reference.near.lo === 0, "the reference block carries the near-corner counts (the notebook asserts them)");
}
ok(musd(sm.p50) === "$170.3M" && musd(sm.p10) === "$140.9M" && musd(sm.p90) === "$200.1M" && musd(sm.min) === "$120.0M" && musd(sm.max) === "$230.2M", "step 6: median $170.3M, P10 $140.9M, P90 $200.1M, runs $120.0M to $230.2M");
{
  const d = D.guess.map(g => Math.abs(+g.value * 1e6 - sm.p90)), best = D.guess[d.indexOf(Math.min(...d))];
  ok(best.value === "200", "step 1: the guess closest to the P90 is 'About $200M'");
  const c = D.guess.find(g => g.value === "235"), h = D.guess.find(g => g.value === "175");
  ok(Math.round(cor.hi / 1e6) === 235 && Math.abs(175e6 - F.base[T].dev) < 5e6 && /high-cost end/.test(c.label) && /near the base/.test(h.label), "step 1: the guesses' labels agree with the model ($235M is the high-cost corner; $175M is near the base)");
}
ok(F.preview.random.margin === 4 && F.preview.random.rate === 3 && F.preview.lhs.margin === 0 && F.preview.lhs.rate === 0, "step 5: seed 7, 10 runs: plain random leaves 4 and 3 slices empty, the hypercube none");
ok(pm(2 * e.p90["1000lhs"].se) === "± $1.3M" && pm(2 * e.p90["100lhs"].se) === "± $4.7M", "step 7: P90 ± $1.3M with 1,000 runs, ± $4.7M with 100 (2 standard errors, 20 seeds)");
{ const ratio = e.p90["100lhs"].se / e.p90["1000lhs"].se; ok(ratio > 2.5 && ratio < 4.5, "ten times the runs cut the P90's scatter by " + ratio.toFixed(2) + ", close to √10 = 3.16"); }
ok(F.err.seedRow.p90 === sm.p90, "seed 7 among the repeats is the main run");
ok(musd(e.mean["1000lhs"]) === "$0.0M" && e.mean["1000lhs"] < 0.04e6 && Math.round(e.mean["1000lhs"] / 1e4) === 3 && musd(e.mean["1000random"]) === "$0.8M" && musd(e.p90["1000lhs"].se) === "$0.7M" && Math.round(e.p90["1000lhs"].se / 1e4) === 65 && Math.round(e.p90["1000random"].se / 1e4) === 80,
   "Go deeper: the mean scatters by $0.03M (hypercube) and $0.80M (random); the P90 by $0.65M and $0.80M");
ok(e.mean["1000random"] / e.mean["1000lhs"] > 10 && e.p90["1000lhs"].se < e.p90["1000random"].se, "the hypercube steadies the mean far more than the P90");
ok((100 * e.iidShare).toFixed(2) === "0.95" && (100 * e.share["1000lhs"]).toFixed(2) === "0.52" && e.share["1000lhs"] < e.iidShare, "Go deeper: K5's formula gives 0.95 points; the hypercube repeats scatter by 0.52");
const bw = F.budget.wait;
ok(bw[12].n === 0 && bw[24].n === 101 && bw[36].n === 929 && pts(2 * bw[24].se) === "1.0 points", "step 8: above $200M, 0, 101 and 929 of 1,000 runs; 10.1% ± 1.0 points at 24 months");
{ const r12 = M.repeats(D, { n: D.runs, tau: 12 }); ok(r12.every(r => M.shareSorted(r.devSorted, 200e6) === 0), "step 8: at 12 months no run in any of the 20 repeats exceeds $200M ('none in any of the 20 repeats either')"); }
// step 9: the tie rule's ranks
const Gd = F.groups.dev, Gr = F.groups.rate;
ok(Gd.groups[0].length === 1 && Gd.groups[0][0].key === "margin" && Gd.groups[1].map(x => x.key).sort().join() === "capital,rate", "step 9: the developer: margin first alone; capital and the discount rate tied next");
ok(Gr.groups[0].length === 1 && Gr.groups[0][0].key === "upgrade" && Gr.groups[1].length === 1 && Gr.groups[1][0].key === "strand", "step 9: other customers: upgrades first, then the never-arrives chance, each alone");
ok(r2(F.main.rho.dev.margin) === "0.86" && r2(F.main.rho.dev.capital) === "0.38" && r2(F.main.rho.dev.rate) === "0.31" && r2(F.main.rho.rate.upgrade) === "0.81" && r2(F.main.rho.rate.strand) === "0.54", "step 9: rho 0.86, 0.38, 0.31; 0.81, 0.54");
ok(Math.abs(F.main.rho.dev.upgrade) < 0.05 && Math.abs(F.main.rho.dev.strand) < 0.05 && Math.abs(F.main.rho.rate.margin) < 0.05 && Math.abs(F.main.rho.rate.capital) < 0.05, "inputs that do not enter an account have rho near 0 (sampling noise only)");
// step 10
const NR = F.narrow, at = h => NR.rows.find(r => r.half === h);
ok(NR.flip && NR.flip.half === 6000 && NR.flip.marginRank === "2–3" && NR.flip.first.map(x => x.key).sort().join() === "capital,rate", "step 10: at ± $6,000 capital and the discount rate tie for first and the margin ranks 2–3");
ok(NR.rows.filter(r => r.half > 6000).every(r => r.first.some(x => x.key === "margin")), "step 10: at every wider range the margin is first or tied first");
ok(r2(NR.flip.rho.capital) === "0.61" && r2(NR.flip.rho.rate) === "0.56" && r2(NR.flip.rho.margin) === "0.54", "step 10: rho 0.61, 0.56 and the margin's 0.54 at ± $6,000");
ok(at(D.marginWidth.max).marginRank === "1", "step 10 starts with the margin first");
ok(at(5000).marginRank === "3", "step 10: at ± $5,000 the margin ranks third (myth 3)");
// the tie rule tests every pair: at ± $7,000 the margin and capital are within two standard errors, and so are capital and
// the discount rate, but the margin is clearly above the discount rate; chaining neighbours would tie all three at 1–3
{
  const r7 = at(7000), rk = k => r7.order.find(x => x.key === k).rank;
  ok(rk("margin") === "1–2" && rk("capital") === "1–3" && rk("rate") === "2–3" && r7.first.map(x => x.key).join() === "margin,capital", "step 10 at ± $7,000: margin 1–2, capital 1–3, discount rate 2–3; margin and capital tied first (" + r7.order.map(x => x.key + " " + x.rank).join(", ") + ")");
  // at every slider position and in step 9: each rank range counts exactly the inputs clearly above and below, and no input
  // is called tied first with one that ranks clearly above it
  const check = (G, rh, reps, out, where) => {
    const n = G.order.length, clear = (a, b) => Math.abs(rh[a]) - Math.abs(rh[b]) > 2 * M.se(reps, r => Math.abs(r.rho[out][a]) - Math.abs(r.rho[out][b]));
    const okAll = G.order.every(x => x.lo === 1 + G.order.filter(y => y !== x && clear(y.key, x.key)).length && x.hi === n - G.order.filter(y => y !== x && clear(x.key, y.key)).length) &&
                  G.first.every(x => G.first.every(y => !clear(x.key, y.key))) && G.groups.every(g => g.every(x => g.every(y => !clear(x.key, y.key))));
    ok(okAll, "the tie rule, pair by pair: " + where);
  };
  NR.rows.forEach(r => { const ins = M.inputsOf(D, r.half), reps = M.repeats(D, { n: D.runs, ins }); check(M.rankGroups(r.rho, reps, "dev", ins), r.rho, reps, "dev", "step 10 at ± $" + int(r.half)); });
  const big = M.repeats(D, { n: D.runs, tau: T });
  M.OUTS.forEach(o => check(F.groups[o], F.main.rho[o], big, o, "step 9, " + o));
}
// step 9's text version: every input against both accounts, in ten slices of 100 runs; flat exactly when the input is
// outside the account's equation
{
  const main = M.study(D, { seed: D.seed });
  M.OUTS.forEach(o => D.inputs.forEach(q => {
    const c = M.cloud(main, q.key, o);
    ok(c.slices.length === 10 && c.slices.every(x => x.n === 100) && (c.trend === "flat") === !M.ENTERS[o].includes(q.key), "step 9 text version: " + q.key + " against " + o + ": ten slices of 100 runs, trend " + c.trend);
  }));
  const m = M.cloud(main, "margin", "dev"), r = M.cloud(main, "rate", "rate");
  ok(m.trend === "rises" && musd(m.slices[0].p50) === "$140.9M" && musd(m.slices[9].p50) === "$199.7M", "step 9 text version: the developer's cost rises with the margin, median " + musd(m.slices[0].p50) + " to " + musd(m.slices[9].p50));
  ok(r.trend === "rises" || r.trend === "weak", "step 9 text version: other customers' cost against the discount rate: " + r.trend);
  const csv = M.csvRuns(main).trim().split("\n"), row1 = csv[1].split(",");
  ok(csv.length === 1001 && csv[0].split(",").length === 8 && +row1[1] === +main.X.margin[0].toFixed(2) && +row1[6] === Math.round(main.dev[0]), "step 9's CSV: a header and 1,000 runs, five inputs and both costs");
}
// the reference block (the notebook's asserts)
{
  const ref = M.reference(D), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(same(ref, D.reference), "the data file's reference block is up to date (run with --write)");
  ok(D.reference.flip && D.reference.flip.half === 6000 && D.reference.budget["24"].n === 101, "the reference block carries step 10's change and step 8's count");
}
// the histogram axes hold every run
ok(sm.min >= 100e6 && sm.max < 250e6, "step 6's axis ($100M to $250M) holds every run");
D.waits.forEach(t => { const s = M.summary(M.study(D, { seed: D.seed, tau: t }).dev); ok(s.min >= 50e6 && s.max < 350e6, "step 8's axis ($50M to $350M) holds every run at " + t + " months"); });
ok((D.budget.start - D.budget.min) % D.budget.step === 0 && (D.marginWidth.start - D.marginWidth.min) % D.marginWidth.step === 0, "start values sit on the sliders' steps");

// ---------------- the lab notebook: the same data file, generator and checks (the notebook tools run it)
{
  ok(NB.length > 0, "the lab notebook exists (learn/notebooks/" + ID + ".ipynb; written by its notebook build step)");
  const nb = NB ? JSON.parse(NB) : { cells: [] }, src = nb.cells.map(c => c.source.join("")).join("\n");
  ok(nb.cells.every(c => c.cell_type === "markdown" || (c.outputs.length === 0 && c.execution_count === null)), "the notebook is stored without outputs");
  { const CORE = fs.readFileSync(L("components/core.js"), "utf8");   // the generator is shared (LX.mulberry32, core.js)
    ok(/0x6D2B79F5/.test(src) && /0x6D2B79F5/.test(CORE) && /t \| 61/.test(src) && /t \| 61/.test(CORE) && /LX\.mulberry32/.test(JS), "the notebook ports the page's generator (mulberry32's constants, LX.mulberry32 in core.js)"); }
  ok(/m07-monte-carlo\.json/.test(src) && /REF\["firstRuns"\]/.test(src) && /REF\["flip"\]/.test(src) && /REF\["p90se"\]/.test(src) && /REF\["budget"\]/.test(src), "the notebook asserts the reference block: first runs, percentiles, errors, chances and step 10");
  ok(/about 45 minutes, plus 60 minutes of practice/.test(src) && /15 minutes[\s\S]*10 minutes[\s\S]*15 minutes[\s\S]*10 minutes[\s\S]*10 minutes/.test(src), "the notebook's times: a 45-minute lab and five practice tasks adding up to 60 minutes");
}

// ---------------- numbers on the page (static text)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const TX = text(OWN);
const has = (s, what) => ok(TX.includes(s), "page: " + what + ": '" + s + "'");
has("A P90 of $200.1M means a 10% chance that the real wait costs more.", "myth 1 = the main run's P90");
has("Over 20 seeds, the P90 of 1,000 runs scatters by ± " + musd(2 * e.p90["1000lhs"].se) + " (2 standard errors).", "myth 2 = the repeats");
has("narrow the margin's to ± $" + int(NR.flip.half) + " and capital ranks clearly above it.", "myth 3 = step 10");
ok(NR.flip.order.find(x => x.key === "margin").lo > 1 && NR.flip.order[0].key === "capital", "myth 3: at the flip capital ranks first and clearly above the margin");
has("√(0.05 × 0.95 ÷ 1,000) = " + Math.sqrt(0.05 * 0.95 / 1000).toFixed(4) + ", about 0.7 percentage points", "quiz 1 = K5's formula");
has("the mean cost of 1,000 runs scatters by $0.03M with a Latin hypercube and $0.80M with plain random draws (one standard error); the P90, by $0.65M and $0.80M", "Go deeper = the repeats");
has("gives 0.95 points for the " + shr(bw[24].share) + " above $200M; the Latin hypercube repeats scatter by 0.52 points", "Go deeper = the share's error");
has(musd(sm.p90) + " " + pm(2 * e.p90["1000lhs"].se), "numbers to remember: the P90 and its error");
has("from ± " + musd(2 * e.p90["100lhs"].se) + " to ± " + musd(2 * e.p90["1000lhs"].se), "numbers to remember: the square-root rule");
has("ρ = " + r2(F.main.rho.dev.margin), "numbers to remember: the margin's rho");
ok(OWN.includes('<td class="n">0.1³ = 1 in 1,000</td><td>The chance, under these inputs, that the margin, capital and discount rate all land in the top tenth of their ranges: near the high-cost corner. 2 of the 1,000 runs did.</td>') && F.near.hi === 2 && near(Math.pow(D.near, 3), 0.001, 1e-15), "numbers to remember: 0.1³ = 1 in 1,000 near the high-cost corner, 2 runs");
has("$h\\tau$ = 24 × 0.5 points = 12%, capped at 50%", "Go deeper: the never-arrives chance in percentage points");
has("$h$ enters as a fraction: $h$ = 0.005 a month (0.5 percentage points), so $h\\tau$ = 0.12 and the cap is 0.5.", "Go deeper: h in the formula is a fraction");
ok(byKey.strand.base === 0.005 && D.toy.strandCap === 0.5, "h is stored as a fraction (0.005 a month) and the cap as 0.5");
has("With continuous inputs, an exact corner has zero chance.", "Go deeper: an exact corner");
has("The margin, capital and discount rate all in the same outer tenth of their ranges: 0.1³ = 0.1% per corner, so 1,000 runs expect " + int(F.near.expect) + ". Seed 7 has " + F.near.n + ", both at the high-cost end.", "Go deeper: an exact corner has zero chance; near one, 0.1³");
ok(F.near.hi === F.near.n, "Go deeper: the near-corner runs are all at the high-cost end");
ok(near(D.wait * byKey.strand.base, 0.12, 1e-12) && D.toy.strandCap === 0.5 && /24 months × 0\.5 points = 12%, at most 50%/.test(byKey.strand.why), "the never-arrives example: 24 × 0.5 points = 12%, cap 50% (data and Go deeper)");
has("Latin hypercube, seed " + D.seed + ", generator mulberry32", "data note: the seed and the generator");
has("20 repeats with seeds " + D.repeats.first + " to " + D.repeats.last, "data note: the repeats");
has("About 35 guided minutes in ten steps.", "the time line");
ok(/here the wait, 12, 24 or 36 months/.test(TX) && D.waits.join() === "12,24,36", "explain no-JS: the three waits");
// Go deeper's toy equation matches the model's: 0.5 is CF7's cap, P = 100 MW
ok(/\\min\(0\.5,\\, h\\tau\)/.test(PAGE) && D.toy.strandCap === 0.5 && /\$P\$ = 100 MW/.test(PAGE), "Go deeper: the toy's equations use the cap 0.5 and P = 100 MW");

// ---------------- the page on a stub document
const sliders = [];
(async () => {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null;
  const plotSpecs = [];
  ["cards", "predict", "tornado", "flowchart", "table", "boundary"].forEach(n => load(n, E));
  E.LX.Plot = (host, o) => { const box = E.LX.H("div", { class: "stub-plot" }, host); return { box, render: spec => { plotSpecs.push(spec); box.setAttribute("data-bars", String((spec.bars || []).length)); }, text: null }; };
  E.LX.Slider = (host, o) => { let v = o.value; const w = E.LX.H("div", { class: "stub-slider", "data-label": o.label }, host);
    const sl = { el: w, val: () => v, set: (x, fire) => { v = x; if (fire && o.onChange) o.onChange(v); }, _set(x) { v = x; if (o.onChange) o.onChange(v); } }; sliders.push(sl); return sl; };
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "m07") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance,
                 setTimeout: f => { f(); return 0; }, clearTimeout: () => {} };
  const xp = E.LX.H("div", { id: "m7-explain" }, E.body);
  vm.runInNewContext(JS, mctx);
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "m07" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { m07_monte_carlo: D }, root); } catch (err) { threw = err.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  if (threw) return finish();
  const cards = demo.cards, card = () => live.querySelector(".lx-stepcard");
  const next = () => card().querySelectorAll(".lx-step-foot button").filter(b => /Next/.test(b.textContent))[0];
  const saw = () => { const a = card().querySelectorAll(".lx-saw"); return text((a[a.length - 1] || { innerHTML: "" }).innerHTML); };
  const stepText = () => text(card().querySelector(".lx-step-text").innerHTML);
  const btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent));
  const words = s => s.split(/\s+/).filter(Boolean).length, sents = s => s.split(/(?<=[.?!])\s+(?=[A-Z0-9“"])/).length;
  // the text budget (README): one or two sentences per element; step text about 35 words, a result line at most 40
  const budget = (where, s, w) => ok(words(s) <= w && sents(s) <= 2, where + ": " + words(s) + " words, " + sents(s) + " sentences (at most " + w + " and 2): " + s.slice(0, 60));
  const sawBudget = (i) => budget("step " + i + " result", saw(), 40);
  ok(cards.count === 10, "ten step cards");
  const got = {};
  for (let i = 0; i < cards.count; i++) {
    cards.go(i);
    const st = stepText();
    budget("step " + (i + 1) + " text", st, 35);
    ok(next() && (i === cards.count - 1 || next().disabled), "step " + (i + 1) + ": Next waits for the action");
    got[i + 1] = st;
  }
  // step 1: the inputs table and the guess
  cards.go(0);
  ok(got[1].includes("**$171.1M**".replace(/\*/g, "")) || /\$171\.1M/.test(got[1]), "step 1 text: $171.1M at CF7's values");
  const rows1 = card().querySelectorAll("tbody tr");
  ok(rows1.length === 5 && text(rows1[0].innerHTML).includes("$30,000 to $60,000") && text(rows1[2].innerHTML).includes("6% to 10%") && text(rows1[4].innerHTML).includes("0.25 to 0.75 points") && text(rows1[4].innerHTML).includes("percentage points a month"), "step 1: the five inputs with their ranges (the never-arrives chance in percentage points)");
  ok(rows1.every((r, k) => { const d = r.querySelector(".m7-in-d"); return d && text(d.innerHTML) === text(E.LX.rich(D.inputs[k].why)); }) && rows1.every(r => { const d = text(r.querySelector(".m7-in-d").innerHTML); return words(d) <= 22 && sents(d) === 1; }),
     "step 1: each input shows a one-line definition (margin, carrying cost, present value, stranded, points a month)");
  ok(["margin", "carrying-cost", "present-value", "stranded-cost"].every(t => card().innerHTML.includes('data-term="' + t + '"')), "step 1: margin, carrying cost, present value and stranded are glossary terms in the table");
  card().querySelectorAll(".lx-choice")[1].click();
  ok(!next().disabled, "step 1: the guess unlocks Next");
  // step 2
  cards.go(1); card().querySelectorAll(".lx-seg button").forEach(b => b.click());
  ok(!next().disabled && saw() === "Developer: $88.8M, $171.1M, $247.3M for 12, 24, 36 months. With no probabilities attached, a scenario says what happens if, not how likely.", "step 2: the three scenarios (" + saw() + ")"); sawBudget(2);
  ok(/This lesson gives the wait no probabilities: treat 12, 24 and 36 months as separate what-if scenarios\./.test(got[2]) && !/not chance/.test(got[2]), "step 2: no probabilities is this lesson's choice, not a property of the wait");
  ok(card().innerHTML.includes('data-term="carrying-cost"') && card().innerHTML.includes('data-term="stranded-cost"'), "step 2: carrying cost and stranded cost are glossary terms in the key");
  // step 3
  cards.go(2); card().querySelectorAll(".lx-choice")[0].click();
  ok(!next().disabled && saw() === "Margin swings it most: $137.8M to $204.4M. Capital and the discount rate swing it about equally, by about $28M each; the upgrades and the never-arrives chance do not move it.", "step 3: the tornado's result (" + saw() + ")"); sawBudget(3);
  ok(/You called it\. Its range moves the lost margin by ± \$1\.5M a month\./.test(text(card().innerHTML)) && 15000 * D.toy.loadMW === 1.5e6, "step 3: the prediction is revealed, with the margin's swing a month (± $15,000 × 100 MW)");
  ok(card().querySelectorAll(".lx-torn").length === 1 && /Margin from \$30,000 to \$60,000: the developer's cost \$137\.8M to \$204\.4M\./.test(text(card().innerHTML)), "step 3: the tornado is drawn, with its text version");
  // step 4
  cards.go(3); btns(/low-cost end|high-cost end/).forEach(b => b.click());
  ok(!next().disabled && /Corners: \$111\.8M and \$234\.7M\./.test(text(card().innerHTML)), "step 4: both corners");
  ok(saw() === "Only the margin, capital and discount rate enter the developer's cost, so a corner needs all three at one end together. Only chances can say how likely that is.", "step 4: three inputs make a corner of the developer's cost (" + saw() + ")"); sawBudget(4);
  { const sp = plotSpecs[plotSpecs.length - 1]; ok(sp.text.rows.some(r => r[0] === "The margin alone, low to high" && r[1] === "$137.8M to $204.4M"), "step 4: the chart sets the corners against the margin's one-at-a-time swing"); }
  // step 5
  cards.go(4); card().querySelectorAll(".lx-seg button")[0].click();
  ok(/Seed 7, plain random: 4 of 10 margin slices and 3 of 10 discount-rate slices empty\./.test(text(card().innerHTML)), "step 5: plain random, seed 7");
  card().querySelectorAll(".lx-seg button")[1].click();
  ok(!next().disabled && /Seed 7, Latin hypercube: 0 of 10 margin slices and 0 of 10 discount-rate slices empty\./.test(text(card().innerHTML)), "step 5: the hypercube, seed 7"); sawBudget(5);
  btns(/New seed/)[0].click();
  ok(/Seed 8, Latin hypercube: 0 of 10/.test(text(card().innerHTML)), "step 5: a new seed is shown and the hypercube still fills every slice");
  ok(card().innerHTML.includes('data-term="random-seed"') && /A seed fixes the random draws: the same seed repeats them, a new seed gives new ones\./.test(text(card().innerHTML)), "step 5: the seed is explained, with its glossary mark, where the reader first changes it");
  // step 6
  cards.go(5); btns(/Run 1,000 times/)[0].click();
  ok(!next().disabled && saw() === "P90, the 90th percentile, is $200.1M: 9 runs in 10 cost less.", "step 6: the run (" + saw() + ")"); sawBudget(6);
  { const outs = card().querySelectorAll(".m7-out").map(x => text(x.innerHTML)), nl = outs.find(t => /^Near a corner/.test(t)) || "";
    ok(nl === "Near a corner (margin, capital and discount rate all in the same outer tenth of their ranges): 2 runs; a chance of 0.1³ per corner predicts 2.", "step 6: corner rarity on its own line (" + nl + ")");
    budget("step 6 corner line", nl, 35); }
  ok(/Median \$170\.3M · 80% of runs from \$140\.9M to \$200\.1M · runs from \$120\.0M to \$230\.2M\. Your guess, about \$200M, was the closest\./.test(text(card().innerHTML)), "step 6: the readout, with the guess checked");
  const hs = plotSpecs[plotSpecs.length - 1];
  ok(hs.bars.reduce((s, b) => s + b.y1, 0) === 1000 && hs.text.rows.length > 10 && hs.bars.every(b => b.y1 > 0), "step 6: the histogram counts all 1,000 runs, draws no empty bins and has a text version");
  // step 7
  cards.go(6); btns(/20 repeats of/).forEach(b => b.click());
  ok(!next().disabled && saw() === "P90 = $200.1M ± $1.3M with 1,000 runs (two standard errors, from the 20 repeats); ± $4.7M with 100. Report a Monte Carlo number with its run count and its scatter.", "step 7: the errors (" + saw() + ")"); sawBudget(7);
  ok(card().getAttribute("aria-busy") == null, "step 7: the busy state is cleared after the repeats");
  // step 8
  cards.go(7); card().querySelectorAll(".lx-seg button").forEach(b => b.click());
  ok(!next().disabled && saw() === "Above $200M: 0.0% of runs at 12 months, 10.1% of runs at 24 months, 92.9% of runs at 36 months. Each chance holds only under its scenario and these inputs.", "step 8: the chances (" + saw() + ")"); sawBudget(8);
  card().querySelectorAll(".lx-seg button")[1].click();
  ok(/Above \$200M at 24 months: 101 of 1,000 runs, 10\.1% ± 1\.0 points \(2 standard errors, 20 seeds\)\./.test(text(card().innerHTML)), "step 8: the 24-month readout");
  card().querySelectorAll(".lx-seg button")[0].click();
  ok(/0 of 1,000 runs, 0\.0% \(none in any of the 20 repeats either\)\./.test(text(card().innerHTML)), "step 8: the 12-month readout");
  // step 9
  cards.go(8); card().querySelectorAll(".lx-seg button").forEach(b => b.click());
  ok(!next().disabled && saw() === "Developer: margin (0.86) first; capital (0.38) and discount rate (0.31) tied next. Other customers: upgrades (0.81), then never arrives (0.54), so influence depends on the output.", "step 9: the ranks (" + saw() + ")"); sawBudget(9);
  ok(card().querySelectorAll(".m7-rho-row").length === 5 && /rank 2–3/.test(text(card().innerHTML)) === false, "step 9: five rank bars; other customers' ranks shown last");
  card().querySelectorAll(".lx-seg button")[0].click();
  ok(/rank 2–3/.test(text(card().innerHTML)), "step 9: capital and the discount rate shown as tied, rank 2–3");
  card().querySelectorAll(".m7-rho-row")[1].click();
  ok(card().querySelectorAll(".m7-rho-row")[1].getAttribute("aria-pressed") === "true" && plotSpecs[plotSpecs.length - 1].bars.length === 1000, "step 9: tapping an input shows its cloud of 1,000 runs");
  ok(card().querySelectorAll("button.m7-rho-row").length === 5 && card().querySelectorAll("button.m7-rho-row").every(b => /Show its cloud of runs\.$/.test(b.getAttribute("aria-label"))), "step 9: the five rank rows are buttons that show a cloud");
  {
    // the scatter's text version: its shape in a sentence and the runs in ten slices; the CSV of every run
    const sp = plotSpecs[plotSpecs.length - 1], h = text(sp.text.html || "");
    ok(/^The developer's cost rises with the idle capital\. ρ = 0\.38 over 1,000 runs\./.test(h) && (sp.text.html.match(/<tr>/g) || []).length === 11 && sp.aria.includes("rises with the idle capital") && /\$156\.5M/.test(h) && /\$184\.2M/.test(h),
       "step 9: the scatter's text version gives its shape, then ten slices (" + h.slice(0, 90) + ")");
    card().querySelectorAll(".lx-seg button")[1].click(); card().querySelectorAll(".m7-rho-row")[0].click();
    const h2 = text(plotSpecs[plotSpecs.length - 1].text.html || "");
    ok(/^Flat: other customers' cost does not depend on the margin\. ρ = /.test(h2), "step 9: an input outside the account reads as flat (" + h2.slice(0, 80) + ")");
    const a = card().querySelectorAll("a").filter(x => /CSV/.test(x.textContent))[0], href = a ? a.getAttribute("href") : "";
    const csv = href.indexOf("data:text/csv") === 0 ? decodeURIComponent(href.slice(href.indexOf(",") + 1)) : "";
    ok(a && a.getAttribute("download") === "m7-runs-seed7-24-months.csv" && csv === M.csvRuns(M.study(D, { seed: D.seed })), "step 9: a CSV download of the 1,000 runs (all five inputs, both costs)");
    card().querySelectorAll(".lx-seg button")[0].click();
  }
  // step 10: narrow step by step until the margin is no longer first
  cards.go(9);
  const sl = card().querySelector(".stub-slider"), slider = sliders.pop();
  ok(!!sl && !!slider, "step 10: the range slider");
  for (let h = D.marginWidth.max - D.marginWidth.step; h >= NR.flip.half; h -= D.marginWidth.step) slider._set(h);
  ok(saw() === "At ± $6,000 the margin ranks 2–3. Global sensitivity answers which inputs move the result within these ranges, not which matter in the world.", "step 10: the change (" + saw() + ")");
  ok(/± \$6,000: tied first: capital 0\.61 and discount rate 0\.56; the margin \(0\.54\) ranks 2–3\./.test(text(card().innerHTML)), "step 10: the readout at ± $6,000"); sawBudget(10);
  ok(card().querySelectorAll(".m7-rho-row").length === 5 && card().querySelectorAll("button.m7-rho-row").length === 0 && !/Show its cloud/.test(card().innerHTML) && card().querySelector(".m7-rho-list").getAttribute("role") === "list",
     "step 10: the rank rows are a plain list (no buttons, no promise of a cloud)");
  ok(card().querySelectorAll(".m7-rho-row .lx-sr").map(x => x.textContent)[0] === "Margin: rho 0.54, plus or minus " + r2(2 * NR.flip.se.margin) + ", rank 2 to 3.", "step 10: each plain row is read as one sentence");
  // live regions
  ok(live.querySelectorAll("[aria-live]").length >= 2, "results are announced in aria-live regions");
  // demo states
  ["mid", "step-2", "step-8", "step-10"].forEach(sname => { let r = null; try { r = demo.fn(sname); } catch (err) { r = null; } ok(r && r.view === sname, "demo state " + sname + " runs"); });
  // the explain layer: flowchart traces and the table use the model's numbers
  let XT = text(xp.innerHTML);
  try { xp.querySelectorAll(".lx-ftrace button").forEach(b => { b.click(); XT += " " + text(xp.querySelector(".lx-ftrace-out").innerHTML); }); } catch (err) { ok(false, "explain: the flowchart's trace buttons work on the stub: " + err.message); }
  ok(XT.includes("1,000 runs: P90 $200.1M ± $1.3M; the margin ranks first (ρ = 0.86).") && XT.includes("P90 ± $4.7M: if a decision turns on the P90, run more.") && XT.includes("92.9% of runs exceed $200M at 36 months"), "explain: the flowchart's traces");
  ok(XT.includes("how rare a corner is: 2 of 1,000 runs came near one (step 6)") && XT.includes(">11<".replace(/[<>]/g, "")) && XT.includes("32"), "explain: the table's run counts (3, 11, 32) and the corner note");
  ok(XT.includes("Reference case, whatever you set above: the original ranges, seed 7, a 24-month wait and a $200M budget.") && xp.querySelectorAll(".lx-ftrace button").some(b => b.textContent.trim() === "Reference case"), "explain: the layer says it shows the reference case");
  finish();
})().catch(err => { ok(false, "the stub page test threw: " + (err && err.stack || err)); finish(); });

function finish() {
  // ---------------- scope
  const ALL = [PAGE, RAW, JS, SIDEYML, NB].join("\n");
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term on the page, in the data, the script, the sidecar or the notebook");
  ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere (the paper's title is not quoted; see E7)");
  ok(!/\bFOAK\b|\bNOAK\b|first[- ]of[- ]a[- ]kind|learning[- ](curve|rate)|order[- ]book|anchor[- ](customer|buyer)|subsidy[- ]free|smr-dc|projects\/|research\.(html|qmd)/i.test(ALL), "no deny-listed term");
  ok(!/data[- ]cent\w*[^.]{0,80}\b(supply|supplies|supplied|power plant|build|generat|buyer|order)/i.test(text(PAGE) + " " + NB), "data centers appear as loads only");
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...NB.matchAll(/\]\((https?:[^)]+)\)/g)].map(m => m[1]), [...NB.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(m => m[0]));
  ok(hrefs.length > 5 && hrefs.every(h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://github.com/Henryutd2021/code-delayed-energization" || /^(\.\.\/assets\/learn\/data\/[a-z0-9-]+\.json|notebooks\/[a-z0-9-]+\.ipynb|[0-9a-z-]+\.html(#[a-z0-9-]+)?)$/.test(h)),
     "links: learn pages, the lesson's downloads, doi.org and the allow-listed repository only: " + hrefs.filter(h => !(/^https:\/\/doi\.org\/10\./.test(h) || /github\.com\/Henryutd2021\/code-delayed-energization$/.test(h) || /^(\.\.\/assets|notebooks\/|[0-9a-z-]+\.html)/.test(h))).join(" "));
  const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
  ok(keys.length === 1 && keys[0] === "excerpt:code", "the only excerpt key is excerpt:code");
  // the path.yml entry and the page's title and subtitle
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(x => new RegExp("\\n  id: " + ID + "\\n").test(x)) || "";
  ok(/\n  status: active\n/.test(entry) && /\n  minutes: 35\n/.test(entry) && /lab_minutes: 45/.test(entry) && /practice_minutes: 60/.test(entry), "path.yml: active, 35 guided minutes, a 45-minute lab and 60 minutes of practice (learn_map_v2.yml)");
  const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
  ok(fm("title") === py("title") && fm("subtitle") === py("subtitle"), "the page's title and subtitle equal path.yml's");
  // the glossary marks used by the script exist (glossary.yml or the sidecar)
  const GL = fs.readFileSync(path.join(SITE, "learn/glossary.yml"), "utf8") + "\n" + SIDEYML + "\n" + fs.readdirSync(path.join(SITE, "learn/_w1")).map(f => fs.readFileSync(path.join(SITE, "learn/_w1", f), "utf8")).join("\n");
  const marks = [...JS.matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]).concat([...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]), [...RAW.matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]));
  ok(marks.length > 8 && marks.every(m => new RegExp("id: " + m + "\\n").test(GL)), "every glossary mark has a definition: " + marks.filter(m => !new RegExp("id: " + m + "\\n").test(GL)).join(", "));
  researchWording(entry);
  // ---------------- speed (Node, this machine): the page's heaviest computations stay far under its 1 s budget at 6x
  {
    const t1 = Date.now(); M.study(D, { seed: D.seed }); const a = Date.now() - t1;
    const t2 = Date.now(); M.repeats(D, { n: D.runs, tau: 36 }); const b = Date.now() - t2;
    const t3 = Date.now(); M.narrowAt(D, 9000); const c = Date.now() - t3;
    ok(a < 60 && b < 150 && c < 150, "speed in Node: a 1,000-run study " + a + " ms, its 20 repeats " + b + " ms, step 10's re-ranking " + c + " ms (facts " + factsMs + " ms)");
  }
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
}

// ---------------- research wording (the sourcing rule), as in CF7's test: every sentence about the course author's
// study is an approved sentence of the excerpt wording (E7, with the revisions) or a clause of one where the row itself
// breaks; NOT_RESEARCH lists what may name the study without describing it.
function researchWording(entry) {
  const APPROVED_SNAPSHOT = {
    "E7.7": "The delay is treated as exogenous and parameters are illustrative; network feasibility is not modeled, and the social perspective is illustrated with a single bridge-power example.",
    "E7.11": "A present-value framework turns the delayed computing capacity into the grid MW it needs and prices the delay in three ledgers. Two measures compare cases: a delay cost per MW-month, and the largest payment worth making to shorten the wait. Inputs are screened with Latin hypercube sampling.",
    "E7.14": "Li et al. (2026). Accepted paper on the cost of delayed energization for large loads, 2026 North American Power Symposium (NAPS), presented October 2026; DOI pending."
  };
  // (this lesson says "a Monte Carlo study" in its own sense, so "study" alone does not signal; "the study" and "study's" do)
  const RX = /\b(the study|study's|paper|article|NAPS|Li et al|course author|excerpt|research|published|accepted|300 MW-IT|36-month delay|0\.7 billion|ledgers?|framework|exogenous|net-benefit test|staged (service|energization))\b/i;
  const NOT_RESEARCH = [
    [/^Where this came up in research$/, "heading"],
    [/^From: Li et al\. \(2026\), accepted paper, 2026 North American Power Symposium \(NAPS\); DOI pending\.$/, "provenance label (E7.14's citation, short), as in CF7"],
    [/^The whole case, with its accounts and a toy of its own: CF7, the cost of waiting\.$/, "navigation to the case file"],
    [/^This page's toy borrows CF7's load\.$/, "provenance of the toy"],
    [/^Illustrative round numbers, not the study's inputs, equations or results\.$/, "provenance label (the toy), as in CF7"],
    [/^code-delayed-energization: public example repository · MIT licence · illustrative inputs\.$/, "repository label, as in CF7"],
    [/^code-delayed-energization on GitHub, version 1\.0\.2 \(2 November 2026\)\.$/, "citation of the repository"],
    [/^Try it yourself with open code$/, "heading"],
    [/^Model: this page's toy, built on case file CF7's illustrative load; seed 7, 1,000 runs per scenario, 20 repeats\.$/, "provenance of the toy"]
  ];
  const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
  function register(md) {
    const out = {}; let sec = null;
    const strip = t => norm(t.replace(/^(Timeline, [^:]+|Myth answer|Citation): /, ""));
    md.split("\n").forEach(line => {
      if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
      const m = line.match(/^\| (E(\d+)\.\d+) \| (.*) \|\s*$/);
      if (!m || !sec || m[2] !== "7") return;
      const cells = m[3].split(" | ");
      if (sec === "REV") out[m[1]] = strip(cells[1]); else if (sec === "E7") out[m[1]] = strip(cells[0]);
    });
    return out;
  }
  const RP = PRIV.path("excerpts");
  let UNITS = Object.values(APPROVED_SNAPSHOT).map(norm);
  if (RP) {
    const reg = register(fs.readFileSync(RP, "utf8"));
    ok(Object.keys(APPROVED_SNAPSHOT).every(k => reg[k] === APPROVED_SNAPSHOT[k]), "the snapshot of E7.7, E7.11 and E7.14 equals the approved wording (revisions applied)");
    UNITS = Object.values(reg).map(norm);
  } else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); research wording checked against the snapshot");
  function approved(seg) {
    const s = norm(seg);
    return s.length > 0 && UNITS.some(u => {
      for (let i = u.indexOf(s); i >= 0; i = u.indexOf(s, i + 1)) {
        const pre = u.slice(0, i), post = u.slice(i + s.length);
        if ((i === 0 || /[:;.?!] $/.test(pre)) && (post === "" || /^[:;.]/.test(post) || (/^ /.test(post) && /[.;:?!]$/.test(s)))) return true;
      }
      return false;
    });
  }
  const listed = s => NOT_RESEARCH.some(r => r[0].test(norm(s)));
  const sentencesOf = s => norm(s).split(/(?<=[.?!])\s+(?=[A-Z“"])/);
  const offending = seg => (approved(seg) || listed(seg)) ? null : (sentencesOf(seg).find(x => !approved(x) && !listed(x)) || null);
  function elements(html) {
    return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|caption|details|summary|header|h[1-6]|section|nav|script|style)\b[^>]*>|```[^\n]*\n?/i)
      .map(norm).filter(s => s && !/^(:::|\{=html\})/.test(s) && /[A-Za-z]/.test(s));
  }
  const bad = [];
  const strict = (where, list) => list.forEach(s => { const o = offending(s); if (o) bad.push(where + ": " + o); });
  const signalled = (where, list) => list.forEach(s => { if (RX.test(s)) { const o = offending(s); if (o) bad.push(where + ": " + o); } });
  let REST = OWN.replace(/<!-- m7-fallback:start[\s\S]*?<!-- m7-fallback:end -->/, " ").replace(/<style>[\s\S]*?<\/style>/, " ");
  const real = (REST.match(/<div class="lx-card lx-real">[\s\S]*?\n<\/div>/) || [""])[0];
  ok(real.length > 0, "page zone found: the research card");
  strict("page, research card", elements(real)); REST = REST.replace(real, " ");
  const src = (REST.match(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/) || [""])[0];
  const lis = [...src.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => norm(m[0]));
  strict("page, sources", lis.filter(s => /Li et al|code-delayed/.test(s)));
  ok(lis.some(s => s === APPROVED_SNAPSHOT["E7.14"]), "the citation is E7.14, word for word");
  signalled("page", elements(REST.replace(/^---[\s\S]*?\n---\n/, " ")));
  const FM = (PAGE.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
  signalled("front matter", [...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].map(m => m[2]));
  signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome|lab): "(.*)"$/gm)].map(m => m[2]));
  const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
  signalled("data", strings(D).filter(x => ["about"].indexOf(x[0]) < 0).map(x => x[1]));
  const literals = JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
  signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
  if (NB) { const nb = JSON.parse(NB); signalled("notebook", nb.cells.flatMap(c => c.source.join("").split("\n")).map(s => s.replace(/^#+ |^\s*#\s?|^\s*[-*] |^\d+\. /, ""))); }
  ok(bad.length === 0, "research wording: every sentence about the study is approved:\n  " + bad.join("\n  "));
  const ex = [...PAGE.matchAll(/<blockquote class="lx-excerpt"[^>]*>([\s\S]*?)<footer>/g)].flatMap(m => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
  ok(ex.length === 3 && ex.every(approved) && ex.some(s => s === "Inputs are screened with Latin hypercube sampling."), "three excerpt sentences, each approved; E7.11's Latin hypercube sentence among them");
}
