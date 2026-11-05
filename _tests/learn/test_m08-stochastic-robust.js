// test_m08-stochastic-robust.js — Node tests for M8 (assets/learn/m08-stochastic-robust.js) with the vendored HiGHS.
//   - the wind blocks: rebuilt from town_year.json and cf_targets.json (SPP 2025 shape scaled to 33.8%, method "scale"),
//     sorted, cut at the stated edges and rounded: the data file's blocks
//   - the closed form from first principles (W3 brief §2.3): surplus, the cost of a size in each branch, the critical
//     hours; every LP (wait-and-see, expected-value, stochastic, worst case, least regret, a plan priced with its size
//     fixed) equals the closed form
//   - ties (W2 finding 2): every reported size is the only best size (1 MW more or less costs more, by the closed form and
//     by re-solving the LP with the size fixed); each branch's operation is unique given the size
//   - the order WS <= RP <= EEV, VSS and EVPI >= 0; the worst-case plan is the low branch's plan because a branch's cost
//     does not rise with more wind (checked on a grid); the robust plans do not use the chances; the least-regret plan
//     equalises the low and high branches' regrets
//   - every number on the page (no-JS block, data notes, step texts, explain fallback, Go deeper, myths, quiz, numbers
//     to remember) against the model and the reference block; the excerpt sentences word for word against the register
//   - the page on a stub document with a solver that fails, then works
// Usage (from the site folder):  node _tests/learn/test_m08-stochastic-robust.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const SITE = path.resolve(__dirname, "..", "..");
const ID = "m08-stochastic-robust";
const L = p => path.join(SITE, "assets/learn", p);
const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
const { core, VERSION } = sctx.module.exports;
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const PR = pctx.module.exports;
const M = require(L(ID + ".js"));
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const DPATH = L("data/" + ID + ".json"), QPATH = path.join(SITE, "learn", ID + ".qmd");
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
let PAGE = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const NB = readOr(path.join(SITE, "learn/notebooks", ID + ".ipynb")), SIDE = readOr(path.join(SITE, "learn/_w1", ID + ".yml"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const fm = M.fm;
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\\\$/g, "$").replace(/\s+/g, " ");

(async () => {
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solve = m => core.solveWith(highs, m, { timeLimit: 60 });
  let D = J(ID + ".json");
  const S = M.scen(D), year = J("town_year.json"), T = J("cf_targets.json");
  const one = s => [Object.assign({}, s, { p: 1 })];
  const solveX = (S2, o) => { const r = solve(M.build(D, S2, o)); return { r, o: M.read(D, S2, r) }; };
  const priced = (S2, x) => { const q = solveX(S2, { fix: x }); return { per: q.o.per, exp: q.r.objective }; };

  if (process.argv.includes("--write")) {
    const R = { about: "Written by node _tests/learn/test_m08-stochastic-robust.js --write; re-solved by the same test on every run. Costs in $ a year (2025 dollars), sizes in MW.", ws: {} };
    S.forEach(s => { const q = solveX(one(s)); R.ws[s.id] = { x: q.o.x, cost: Math.round(q.r.objective) }; });
    R.wsExp = Math.round(S.reduce((a, s) => a + s.p * R.ws[s.id].cost, 0));
    const W = M.meanW(S), e = solveX([{ id: "ev", p: 1, W }]), ep = priced(S, e.o.x);
    R.ev = { W, x: e.o.x, own: Math.round(e.r.objective), per: {}, exp: Math.round(ep.exp) };
    const sp = solveX(S);
    R.sp = { x: sp.o.x, exp: Math.round(sp.r.objective), per: {}, below: M.expHoursAbove(D, S, sp.o.x - 1e-6), above: M.expHoursAbove(D, S, sp.o.x + 1e-6) };
    S.forEach(s => { R.ev.per[s.id] = Math.round(ep.per[s.id]); R.sp.per[s.id] = Math.round(sp.o.per[s.id]); });
    const ws = {}; S.forEach(s => { ws[s.id] = R.ws[s.id].cost; });
    [["rob", "worst"], ["reg", "regret"]].forEach(([k, mode]) => {
      const q = solveX(S, { mode, ws }), pp = priced(S, q.o.x);
      R[k] = { x: q.o.x, z: Math.round(q.r.objective), per: {}, exp: Math.round(pp.exp) };
      S.forEach(s => { R[k].per[s.id] = Math.round(pp.per[s.id]); });
    });
    R.vss = R.ev.exp - R.sp.exp; R.evpi = R.sp.exp - R.wsExp;
    R.presets = {};
    D.presets.forEach(p => {
      const S2 = M.presetS(D, p.id), q = solveX(S2), W2 = M.meanW(S2), ev = solveX([{ id: "ev", p: 1, W: W2 }]);
      R.presets[p.id] = { sp: q.o.x, ev: { W: W2, x: ev.o.x }, vss: Math.round(priced(S2, ev.o.x).exp - q.r.objective) };
    });
    const m0 = M.build(D, S); R.size = { cols: m0.variables.length, rows: m0.constraints.length };
    D.reference = R; fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n"); D = J(ID + ".json");
    const fb = M.staticHTML(D, D.reference);
    PAGE = PAGE.replace(/(<!-- m8-fallback:start[^>]*-->)[\s\S]*?(<!-- m8-fallback:end -->)/, (m, a, b) => a + "\n" + fb + "\n" + b);
    fs.writeFileSync(QPATH, PAGE);
    console.log("  wrote the reference block and the no-JS block");
  }
  const R = D.reference;
  ok(R && R.sp && R.ws && R.presets, "the data file has a reference block (run with --write once)");
  ok(PAGE.includes(M.staticHTML(D, R)), "the page's no-JS block is the one the model writes (run --write after a change)");

  // ---------------- the wind blocks, from the real 2025 shape
  { const p = PR.townProfile("wind", 1, { year, targets: T, method: D.blocks.method }), s = p.mw.slice().sort((a, b) => b - a);
    ok(s.length === 8760 && near(p.cf, 0.338, 1e-9) && p.clippedHours === 0 && near(s[0], 0.641, 0.0005), "the 2025 SPP shape scaled to 33.8% (method scale): 8,760 hours, no hour clipped, the windiest at 64%");
    let a = 0; D.blocks.edges.forEach((e, b) => { const seg = s.slice(a, e), mean = seg.reduce((x, y) => x + y, 0) / seg.length;
      ok(D.blocks.hours[b] === e - a && near(Math.round(mean * 1000) / 1000, D.blocks.cf[b], 1e-12), `block ${b + 1}: ${e - a} hours at ${D.blocks.cf[b]} (mean ${mean.toFixed(5)})`); a = e; });
    ok(D.blocks.hours.reduce((x, y) => x + y, 0) === 8760 && near(D.blocks.hours.reduce((x, h, b) => x + h * D.blocks.cf[b], 0) / 8760, 0.338, 0.0005), "the blocks cover 8,760 hours and average 33.8% (rounding: " + (D.blocks.hours.reduce((x, h, b) => x + h * D.blocks.cf[b], 0) / 8760).toFixed(4) + ")"); }

  // ---------------- the closed form from first principles
  const c = D.electrolyzer.costPerMWYear, v = D.hydrogen.reformerPerKg * D.electrolyzer.kgPerMWh, BASE = D.hydrogen.reformerPerKg * D.hydrogen.demandKgPerHour * 8760;
  ok(near(M.value(D), 27) && near(M.critHours(D), 80000 / 27) && near(M.base(D), BASE) && near(BASE, 709.56e6, 1), "value $27 per MWh of surplus, critical hours 80,000 ÷ 27, reformers alone $709.56M a year");
  ok(S.map(s => s.W).join() === "3000,5000,7000" && near(M.meanW(S), 5000) && near(S.reduce((a, s) => a + s.p, 0), 1), "branches: 3,000, 5,000 and 7,000 MW of wind, chances adding to 1, mean 5,000 MW");
  const sig = (W, b) => Math.max(0, W * D.blocks.cf[b] - D.zone.lineMW);
  const cost0 = (W, x) => c * x + D.hydrogen.reformerPerKg * (D.hydrogen.demandKgPerHour * 8760 - D.electrolyzer.kgPerMWh * D.blocks.hours.reduce((a, h, b) => a + h * Math.min(x, sig(W, b), D.hydrogen.demandKgPerHour / D.electrolyzer.kgPerMWh), 0));
  let cfOK = true; for (let x = 0; x <= 2500; x += 37.5) S.forEach(s => { if (!near(M.cost(D, s.W, x), cost0(s.W, x), 1e-3)) cfOK = false; });
  ok(cfOK, "the model's cost of a size equals the closed form recomputed here, on a grid of sizes");
  ok(S.every(s => D.blocks.cf.every((f, b) => near(M.surplus(D, s.W, b), sig(s.W, b), 1e-9))) && M.capMW(D) > Math.max(...S.map(s => sig(s.W, 0))), "surplus = max(0, W f − 1,000 MW); demand (3,000 MW of electrolysis) exceeds every surplus, so reformers supply some hydrogen in every hour");
  const E = x => S.reduce((a, s) => a + s.p * cost0(s.W, x), 0);
  // argmin over a fine grid plus every kink: exact for piecewise-linear costs
  const kinks = S2 => M.kinks(D, S2, 3000);
  const argmin = (f, xs) => xs.reduce((b, x) => (f(x) < b.f - 1e-6 ? { x, f: f(x) } : b), { x: null, f: Infinity });
  // ---------------- every LP against the closed form, and each size unique
  const unique = (f, x, what) => { const f0 = f(x); ok(f(x + 1) > f0 + 1 && (x < 1 || f(x - 1) > f0 + 1), `${what}: ${fm.mw(x)} is the only best size (1 MW more costs ${(f(x + 1) - f0).toFixed(0)} more${x >= 1 ? ", 1 MW less " + (f(x - 1) - f0).toFixed(0) + " more" : ""})`); };
  S.forEach(s => {
    const q = solveX(one(s)), cf = argmin(x => cost0(s.W, x), kinks([s]));
    ok(q.r.status === "optimal" && near(q.o.x, cf.x, 1e-6) && near(q.r.objective, cf.f, 0.5) && near(q.o.x, R.ws[s.id].x, 1e-6) && near(q.r.objective, R.ws[s.id].cost, 0.6), `wait and see, ${s.short}: ${fm.mw(q.o.x)}, ${fm.m(q.r.objective)} (closed form ${fm.mw(cf.x)})`);
    unique(x => cost0(s.W, x), q.o.x, "wait and see, " + s.short);
    ok(M.hoursAbove(D, s.W, q.o.x - 1e-6) === 3000 && M.hoursAbove(D, s.W, q.o.x + 1e-6) === 1500, `wait and see, ${s.short}: an extra MW runs 3,000 hours just below the plan, 1,500 just above (critical 2,963)`);
  });
  const WS = S.reduce((a, s) => a + s.p * R.ws[s.id].cost, 0);
  ok(near(WS, R.wsExp, 1), "WS = the chance-weighted wait-and-see costs");
  { const q = solveX([{ id: "ev", p: 1, W: 5000 }]), cf = argmin(x => cost0(5000, x), kinks([{ W: 5000 }]));
    ok(near(q.o.x, cf.x) && near(q.o.x, R.ev.x) && near(q.r.objective, R.ev.own, 0.6) && near(R.ev.x, R.ws.mid.x), `expected-value problem: ${fm.mw(q.o.x)} expecting ${fm.m(q.r.objective)}; the mean is the middle branch, so its plan is that branch's`);
    const pp = priced(S, q.o.x); ok(near(pp.exp, E(q.o.x), 0.5) && near(pp.exp, R.ev.exp, 0.6) && S.every(s => near(pp.per[s.id], cost0(s.W, q.o.x), 0.5) && near(pp.per[s.id], R.ev.per[s.id], 0.6)), `the average's plan priced in every branch (x fixed): ${fm.m(pp.exp)}`); }
  { const q = solveX(S), cf = argmin(E, kinks(S));
    ok(q.r.status === "optimal" && near(q.o.x, cf.x) && near(q.o.x, R.sp.x) && near(q.r.objective, cf.f, 0.5) && near(q.r.objective, R.sp.exp, 0.6) && S.every(s => near(q.o.per[s.id], cost0(s.W, q.o.x), 0.5)), `stochastic program: ${fm.mw(q.o.x)}, ${fm.m(q.r.objective)} (closed form ${fm.mw(cf.x)})`);
    unique(E, q.o.x, "stochastic program");
    const lpU = [q.o.x - 1, q.o.x + 1].map(x => solve(M.build(D, S, { fix: x })).objective);
    ok(lpU.every(f => f > q.r.objective + 1), "stochastic program: re-solved with the size 1 MW smaller or larger, the LP costs more (unique)");
    ok(R.sp.below === 3750 && R.sp.above === 2750 && R.sp.below * v > c && R.sp.above * v < c, "critical hours at the stochastic plan: 3,750 expected hours below, 2,750 above, against 2,963"); }
  ok(R.wsExp <= R.sp.exp && R.sp.exp <= R.ev.exp && R.vss === R.ev.exp - R.sp.exp && R.evpi === R.sp.exp - R.wsExp && R.vss > 0 && R.evpi > 0, `WS ${fm.m(R.wsExp)} <= RP ${fm.m(R.sp.exp)} <= EEV ${fm.m(R.ev.exp)}; VSS ${fm.m(R.vss)}, EVPI ${fm.m(R.evpi)}`);
  // robust plans
  const worst = x => Math.max(...S.map(s => cost0(s.W, x))), wsC = {}; S.forEach(s => { wsC[s.id] = R.ws[s.id].cost; });
  const regretF = x => Math.max(...S.map(s => cost0(s.W, x) - wsC[s.id]));
  { const q = solveX(S, { mode: "worst" }), cf = argmin(worst, kinks(S));
    ok(q.r.status === "optimal" && near(q.o.x, cf.x) && near(q.o.x, R.rob.x) && near(q.o.x, R.ws.low.x) && near(q.r.objective, R.ws.low.cost, 0.6), `worst case: ${fm.mw(q.o.x)}, the low branch's own plan, worst cost ${fm.m(q.r.objective)}`);
    unique(worst, q.o.x, "worst case");
    let mono = true; for (let x = 0; x <= 2500; x += 50) for (let W = 3000; W < 7000; W += 100) if (cost0(W + 100, x) > cost0(W, x) + 1e-6) mono = false;
    ok(mono, "for every size, a branch's cost does not rise with more wind (grid of 3,000 to 7,000 MW): the worst branch is the lowest build-out, so the worst case over any build-out in that range is the same plan");
    const S2 = M.presetS(D, "opt"); ok(near(solveX(S2, { mode: "worst" }).o.x, q.o.x), "the worst-case plan does not change with the chances");
    const pp = priced(S, q.o.x); ok(near(pp.exp, R.rob.exp, 0.6) && near(Math.max(...S.map(s => pp.per[s.id])), q.r.objective, 0.6), `worst case priced in every branch: expected ${fm.m(pp.exp)}`); }
  { const q = solveX(S, { mode: "regret", ws: wsC });
    // the closed-form crossing of the low branch's rising regret and the high branch's falling regret, by bisection
    let lo = R.ws.low.x, hi = R.ws.high.x; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (cost0(3000, m) - wsC.low < cost0(7000, m) - wsC.high) lo = m; else hi = m; }
    ok(q.r.status === "optimal" && near(q.o.x, lo, 1e-4) && near(q.o.x, R.reg.x, 1e-4) && near(q.r.objective, regretF(lo), 1) && near(q.r.objective, R.reg.z, 1), `least regret: ${q.o.x.toFixed(4)} MW (closed form ${lo.toFixed(4)}), largest regret ${fm.m(q.r.objective)}`);
    unique(regretF, q.o.x, "least regret");
    ok(near(cost0(3000, q.o.x) - wsC.low, cost0(7000, q.o.x) - wsC.high, 1) && cost0(5000, q.o.x) - wsC.mid < q.r.objective - 1e6, "least regret: the low and high branches' regrets are equal there; the middle branch's is smaller");
    ok(near(solveX(M.presetS(D, "pess"), { mode: "regret", ws: wsC }).o.x, q.o.x, 1e-6), "the least-regret plan does not change with the chances");
    const pp = priced(S, q.o.x); ok(near(pp.exp, R.reg.exp, 0.6), `least regret priced: expected ${fm.m(pp.exp)}`); }
  // presets
  D.presets.forEach(p => {
    const S2 = M.presetS(D, p.id), E2 = x => S2.reduce((a, s) => a + s.p * cost0(s.W, x), 0), q = solveX(S2), W2 = M.meanW(S2), ev = solveX([{ id: "ev", p: 1, W: W2 }]);
    ok(near(q.o.x, R.presets[p.id].sp) && near(q.o.x, argmin(E2, kinks(S2)).x) && near(ev.o.x, R.presets[p.id].ev.x) && near(ev.o.x, argmin(x => cost0(W2, x), kinks([{ W: W2 }])).x), `${p.label}: stochastic ${fm.mw(q.o.x)}, for the average (${W2} MW) ${fm.mw(ev.o.x)}`);
    unique(E2, q.o.x, p.label + " stochastic"); unique(x => cost0(W2, x), ev.o.x, p.label + " plan for the average");
  });
  ok(R.presets.pess.sp < R.presets.even.sp && R.presets.even.sp < R.presets.opt.sp && R.presets.pess.ev.x < R.presets.opt.ev.x, "the stochastic plan and the plan for the average grow with the chance of more wind");
  { const m0 = M.build(D, S); ok(m0.variables.length === 31 && m0.constraints.length === 30 && R.size.cols === 31 && R.size.rows === 30, "the extensive form: 31 columns and 30 rows (1 + 10 × 3)"); }
  // operation unique given the size: each MWh of surplus used saves $27 > 0, so e = min(x, surplus) in every block
  { const q = solveX(S, { fix: R.sp.x }); let u = true; S.forEach(s => D.blocks.cf.forEach((f, b) => { if (!near(q.r.values["e_" + s.id + "_" + b], Math.min(R.sp.x, sig(s.W, b)), 1e-6)) u = false; }));
    ok(u && v > 0, "given the size, each branch's operation is the only best one: the electrolyzer runs at min(size, surplus) in every block"); }

  // ---------------- numbers on the page
  const PT = text(PAGE), JT = JS;
  const has = (s, what) => ok(PT.includes(s), `page states ${what}: "${s}"`);
  has(`Wait and see, one plan per branch: ${fm.mw(R.ws.low.x)} (none built), ${fm.mw(R.ws.mid.x)} (half built), ${fm.mw(R.ws.high.x)} (all built).`, "the no-JS wait-and-see plans");
  has(`Each branch's own best plan: ${fm.int(R.ws.low.x)}, ${fm.int(R.ws.mid.x)} or ${fm.int(R.ws.high.x)} MW.`, "explain fallback: wait and see");
  has(`${fm.int(R.ev.x)} MW, sized for ${fm.int(R.ev.W)} MW of wind; it expects ${fm.m(R.ev.own)} a year but costs ${fm.m(R.ev.exp)} over the branches.`, "explain fallback: the average's plan");
  has(`${fm.int(R.sp.x)} MW, the lowest expected cost: ${fm.m(R.sp.exp)} a year.`, "explain fallback: the stochastic plan");
  has(`Value of the stochastic solution ${fm.m(R.vss)} a year; expected value of perfect information ${fm.m(R.evpi)} a year.`, "explain fallback: the two values");
  const rw = Math.max(...S.map(s => R.rob.per[s.id])), rg = Math.max(...S.map(s => R.reg.per[s.id] - wsC[s.id]));
  has(`Worst case ${fm.mw(R.rob.x)} (worst cost ${fm.m(rw)}); least regret ${fm.mw(R.reg.x)} (largest regret ${fm.m(rg)}).`, "explain fallback: robust plans");
  has(`WS ≤ RP ≤ EEV: here ${fm.m(R.wsExp)} ≤ ${fm.m(R.sp.exp)} ≤ ${fm.m(R.ev.exp)}.`, "Go deeper: the order of the costs");
  has(`31 columns and 30 rows; with $n$ branches it has $1 + 10n$ columns`, "Go deeper: the LP's size"); ok(M.build(D, M.scen(D).concat([{ id: "x4", p: 0, W: 4000 }])).variables.length === 41, "1 + 10n columns (four branches: 41)");
  has(`$80,000 ÷ $27 = 2,963 hours a year`, "Go deeper: the critical hours"); ok(Math.round(80000 / 27) === 2963, "80,000 ÷ 27 = 2,963");
  has(`Below ${fm.int(R.ws.low.x)} MW (none built), ${fm.int(R.ws.mid.x)} MW (half) or ${fm.int(R.ws.high.x)} MW (all), an extra MW runs 3,000 hours; just above, 1,500.`, "Go deeper: each branch's count");
  has(`an extra MW just below ${fm.int(R.sp.x)} MW runs ${fm.int(R.sp.below)} hours; just above, ${fm.int(R.sp.above)}.`, "Go deeper: the expected count");
  has(`Here the plan for ${fm.int(R.ev.W)} MW of wind expects ${fm.m(R.ev.own)} a year; priced in the three branches with their chances, it costs ${fm.m(R.ev.exp)}.`, "myth 1");
  has(`The worst-case plan has the lowest worst cost, ${fm.m(rw)}, but it costs ${fm.m(R.rob.exp - R.sp.exp)} a year more in expectation than the stochastic plan.`, "myth 2");
  ok(Math.abs(rw - R.rob.z) < 1 && rw < Math.min(Math.max(...S.map(s => R.sp.per[s.id])), Math.max(...S.map(s => R.reg.per[s.id])), Math.max(...S.map(s => R.ev.per[s.id]))), "myth 2: the worst-case plan's worst cost is the lowest of the four plans'");
  has(`Here it stays at ${fm.int(R.rob.x)} MW.`, "quiz 2");
  ok(50 - 48 === 2 && 48 - 45 === 3 && /<li data-value="a">VSS \$2M, EVPI \$3M<\/li>/.test(PAGE) && /data-id="values" data-answer="a"/.test(PAGE), "quiz 1: VSS 2, EVPI 3, answer a");
  has(`${fm.m(R.vss)} a year`, "numbers to remember: VSS"); has(`${fm.m(R.evpi)} a year`, "numbers to remember: EVPI");
  // data notes and step texts against the data file
  has("a fictional windy zone with 3,000 MW of wind and 4,000 MW planned; its lines take 1,000 MW", "data note: the zone");
  ok(D.wind.existingMW === 3000 && D.wind.plannedMW === 4000 && D.zone.lineMW === 1000, "the zone's numbers are the data file's");
  has("$80,000 per MW a year; 18 kg of hydrogen per MWh; it runs only on surplus wind. Industry takes 54,000 kg an hour; gas reformers supply the rest at $1.50 per kg.", "data note: the electrolyzer");
  ok(D.electrolyzer.costPerMWYear === 80000 && D.electrolyzer.kgPerMWh === 18 && D.hydrogen.demandKgPerHour === 54000 && D.hydrogen.reformerPerKg === 1.5, "the electrolyzer's numbers are the data file's");
  has("scaled to 33.8%, U.S. wind's 2025 capacity factor", "data note: the capacity factor"); ok(T.targets.wind.cf === 0.338 && T.targets.wind.year === 2025, "33.8% is cf_targets.json's 2025 wind value");
  ok(JS.includes("The windy zone has 3,000 MW of wind, 4,000 MW more is planned, and its lines carry 1,000 MW.") && JS.includes("plan for the average future, 5,000 MW of wind here") && M.meanW(S) === 5000, "step texts: the zone's numbers and the 5,000 MW mean");
  ok(JS.includes('"$" + fm.int(D.electrolyzer.costPerMWYear)') && JS.includes("its $80,000 a year") && D.electrolyzer.costPerMWYear === 80000, "step 5's $80,000 is the data file's");
  // step 2's verdict on the reader's size: true on every step of the slider (W3 brief §2.5)
  { let good = true;
    for (let x = 0; x <= D.chart.xMax; x += D.chart.step) {
      const c = S.map(s => cost0(s.W, x)), w = M.lockWords(D, S, x);
      if (x === 0) { if (!(c.every(v => near(v, BASE, 1e-6)) && w === "With no electrolyzer, every branch costs " + fm.m(BASE) + " a year: all the hydrogen comes from gas reformers.")) good = false; }
      else if (!(c[0] >= Math.max(...c) - 1e-6 && c[2] <= Math.min(...c) + 1e-6 && c[2] < c[0] && w === "Your " + fm.mw(x) + ": expected " + fm.m(E(x)) + " a year. It costs most, " + fm.m(c[0]) + ", if none of the planned wind is built, and least, " + fm.m(c[2]) + ", if all of it is.")) good = false;
      if (w.split(" ").length > 40) good = false;
    }
    ok(good, "step 2's verdict is true for every size on the slider: the none-built branch costs most, the all-built least (all equal at 0 MW)"); }
  ok(/here a size costs no more when more wind is built, so its worst cost is its cost in that branch/.test(JS), "step 8's reason is the monotonicity the test proves above");
  // the explain fallback's other numbers
  has(`Stochastic program</dt>`.replace(/<[^>]+>/g, ""), "explain fallback");
  // step texts: one or two sentences, 40 words at most (text budget)
  const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n\s*(?:build|free)/g)].map(m => m[1].replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"));
  ok(stepTexts.length === 11 && stepTexts.every(t => t.split(/\s+/).length <= 40 && t.split(/[.?!](?:\s|$)/).filter(x => x.trim()).length <= 2), "eleven step texts of 40 words and two sentences at most: " + stepTexts.filter(t => t.split(/\s+/).length > 40 || t.split(/[.?!](?:\s|$)/).filter(x => x.trim()).length > 2).map(t => t.slice(0, 50)).join(" | "));
  { const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/\$\$[\s\S]*?\$\$/g, "").replace(/<blockquote class="lx-excerpt"[\s\S]*?<\/blockquote>/g, "");
    const els = OWN.replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^\|(.*)\|$/gm, "<td>$1</td>").split(/<\/?(?:p|li|dd|dt|td|th|summary|caption|footer)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
    const long = els.filter(x => x.split(" ").length > 40);
    ok(long.length === 0, "every page element is 40 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | ")); }
  ok(!/\b(always|never)\b/i.test((JS.replace(/\/\/.*$/gm, "").match(/"[^"\n]*"/g) || []).join(" ")), "no 'always' or 'never' in the page's strings");

  // ---------------- glossary marks, sources, scope, notebook
  const gloss = J("glossary.json"), terms = gloss.terms || gloss;
  const marks = [...JS.matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]).concat([...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]));
  ok(marks.length > 8 && marks.every(m => terms[m]), "every glossary mark is a known term: " + marks.filter(m => !terms[m]).join(", "));
  ["scenario-tree", "here-and-now", "recourse", "wait-and-see", "expected-value-problem", "two-stage-stochastic-program", "value-of-stochastic-solution", "evpi", "robust-optimization", "regret", "gas-reformer"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE), "sidecar defines " + id));
  const OWNL = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
  const hrefs = [...OWNL.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  ok(hrefs.every(h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://github.com/Henryutd2021/txh2-ercot-hydrogen" || /^https:\/\/(www\.)?eia\.gov\//.test(h) || h === "https://ergo-code.github.io/HiGHS/" || /^[0-9a-z-]+\.html$/.test(h) || /^\.\.\/assets\//.test(h) || /^notebooks\//.test(h) || /^#/.test(h)),
    "links: doi.org, the allow-listed repository, EIA, HiGHS and learn pages only: " + hrefs.filter(h => !(/^https:\/\/doi\.org\/10\./.test(h) || /github\.com\/Henryutd2021\/txh2/.test(h) || /eia\.gov/.test(h) || /ergo-code/.test(h) || /^[0-9a-z-]+\.html$/.test(h) || /^\.\.\/assets\//.test(h) || /^notebooks\//.test(h) || /^#/.test(h))).join(" "));
  ok(!/projects\/|research\.html/.test(PAGE + JS), "no project page and no Research page");
  ok(!/\bSMR\b|nuclear|reactor|small modular/i.test(PAGE + JS + SIDE + NB), "no nuclear term and no reformer abbreviation anywhere (gas reformers are named in words)");
  ok(!/\bAI\b|data cent|131 tons|1,300 tons|92\.4%|310 kilotons/i.test(PAGE + JS + NB), "no AI wording, no data centers, none of the abstract's withdrawn numbers");
  ok(!/Zhang/.test(PAGE + JS + NB), "no co-author named");
  // the lessons the page links are live
  const PATHJ = J("path.json"), live = new Set(), walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (o.href && o.ready === true) live.add(o.href); Object.values(o).forEach(walk); } }; walk(PATHJ);
  hrefs.filter(h => /^[0-9a-z-]+\.html$/.test(h) && h !== "index.html").forEach(h => ok(live.has(h), "linked lesson is live: " + h));
  ok(/CF3 \(upcoming\), where hydrogen should go when nobody knows how much wind will be built\./.test(PAGE) && !/href="cf3-/.test(PAGE), "CF3 (a draft) is named as upcoming, not linked");
  if (NB) {
    ok(NB.includes(ID + ".json") && NB.includes("reference") && NB.includes("assert") && NB.includes("linprog"), "notebook: reads the reference block and asserts it with linprog");
    ok(NB.includes("town_year.json") && NB.includes("cf_targets.json"), "notebook: rebuilds the wind blocks from the 2025 shape");
  } else ok(false, "the notebook exists (learn/notebooks/" + ID + ".ipynb)");

  // ---------------- the excerpt: approved sentences, word for word (register, E10 and E11)
  const norm = s => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  function portfolio() {
    const cands = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
    try { cands.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a git checkout */ }
    return cands.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
  }
  const SNAP = {   // excerpts_for_approval.md, approved: E10 (2026-11-03), E11 (2026-11-05)
    "E10.1": "A two-stage stochastic linear program sized electrolyzers, hydrogen tanks and fuel cells once in each of ERCOT's eight weather zones, with hydrogen pipelines between neighbouring zones, then scheduled the system hour by hour over a full year in nine scenarios: three completion rates of planned renewable capacity by three electricity-demand levels.",
    "E10.4": "Inputs reflect 2022–2023 conditions; post-2023 federal hydrogen credit rules are not modeled.",
    "E11.6": "Hydrogen equipment is sized once, then operated hour by hour in nine scenarios; the sizes minimize expected cost over all nine scenarios instead of fitting a single forecast.",
    "E11.7": "The completion rate of planned renewable capacity was 0% (probability 0.1), 30% (0.7) or 80% (0.2); electricity demand was ERCOT's 2030 projection (0.5), 2% lower (0.2) or 2% higher (0.3)."
  };
  const RP = portfolio();
  let APP = SNAP;
  if (RP) {
    const md = fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"), reg = {};
    md.split("\n").forEach(line => { const m = line.match(/^\| (E1[01]\.\d+)(?: \[N\])? \| (.*?) \|/); if (m) reg[m[1]] = norm(m[2]); });
    ok(Object.keys(SNAP).every(k => reg[k] === SNAP[k]), "the snapshot in this test equals the register's rows: " + Object.keys(SNAP).filter(k => reg[k] !== SNAP[k]).join(", "));
    ok(/W4 sources[\s\S]*?approved/i.test(md.slice(md.indexOf("## W4 sources"), md.indexOf("## W4 sources") + 1500)), "the register marks the W4 sources approved");
    APP = reg;
  } else console.log("note: the register was not found (set LEARN_PORTFOLIO); excerpts checked against the snapshot in this test");
  const q = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  ok(q.length === 1 && q[0][1] === "excerpt:txh2", "one excerpt, from excerpt:txh2");
  const sents = q.length ? [...q[0][2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => norm(m[1])) : [];
  ok(sents.length === 3 && sents[0] === APP["E10.1"] && sents[1] === APP["E11.6"] && sents[2] === APP["E11.7"], "the excerpt is E10.1, E11.6 and E11.7, word for word");
  ok(/<!-- E11\.7 \(approved for M8 only; optional\): drop this paragraph to remove it --><p>/.test(PAGE), "E11.7 is marked optional, easy to drop");
  ok(q.length && norm(q[0][3]) === "Approved excerpt of: Li et al. (2025), International Journal of Hydrogen Energy." && q[0][3].includes("https://doi.org/10.1016/j.ijhydene.2025.02.303"), "the excerpt's footer and DOI (E11.18)");
  ok(PAGE.includes('</blockquote>\n<p class="lx-hint">' + APP["E10.4"] + "</p>"), "E10.4 is the note under the excerpt, word for word");
  ok(PAGE.includes("<li>Li et al. (2025). <a href=\"https://doi.org/10.1016/j.ijhydene.2025.02.303\">Hydrogen’s role in expanding renewable energy and reducing carbon emissions in Texas</a>. International Journal of Hydrogen Energy 113, 77–89.</li>") && PAGE.includes("txh2-ercot-hydrogen</a> on GitHub, version 1.0.2 (30 October 2026)."), "the citations are E11.18's");
  // nothing else on the page describes the study: sentences naming it are the excerpt, its note, the provenance line or citations
  { const OUT = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/^---[\s\S]*?\n---\n/, "").replace(/<blockquote class="lx-excerpt"[\s\S]*?<\/blockquote>/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<!--[\s\S]*?-->/g, "");
    const RX = /\b(ERCOT|Texas|Li et al|the study|weather zones|completion rate)\b/;
    const extra = OUT.split(/<\/?(?:p|li|dd|dt|td)\b[^>]*>/).map(norm).filter(s => RX.test(s) && s !== APP["E10.4"] && !/^This page's toy is one zone with round numbers, not the study's inputs, equations or results\./.test(s));
    ok(extra.length === 0, "no other sentence on the page describes the study: " + extra.map(s => s.slice(0, 70)).join(" | ")); }

  // ---------------- the page on a stub document: a solve that fails, then works
  {
    const { env, load } = require("./stubdom.js");
    const E2 = env();
    E2.LX.ready = () => {}; E2.LX.progress.guess = () => null; E2.LX.visible = E2.LX.visible || (() => false); E2.LX.onTheme = E2.LX.onTheme || (() => {}); E2.LX.reduced = E2.LX.reduced || (() => true);
    ["solver", "cards", "predict", "controls", "plot", "solvestep", "numanswer"].forEach(n => load(n, E2));
    const specs = [], P0 = E2.LX.Plot;
    E2.LX.Plot = (h, o) => { const p = P0(h, o), r0 = p.render; p.render = (sp, a) => { specs.push(sp); return r0(sp, a); }; return p; };
    let failing = true, calls = 0;
    const slv = E2.LX.solver; slv.preload = () => Promise.resolve("worker"); slv.mode = "worker";
    slv.solve = m => { calls++; if (failing) return Promise.resolve({ status: "time-limit", ok: false, values: null, ms: { roundTrip: 5000 } }); const r = solve(m); r.ms = Object.assign({ roundTrip: 1 }, r.ms); return Promise.resolve(r); };
    let init = null, demo = null;
    E2.LX.mount = (slug, f) => { if (slug === "m08") init = f; };
    E2.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
    const mctx = { window: E2.window, document: E2.document, location: E2.location, navigator: {}, console, module: undefined, performance: E2.window.performance, setTimeout: () => 0, clearTimeout: () => {} };
    vm.runInNewContext(JS, mctx);
    const root = E2.LX.H("div", { class: "lx-interactive", "data-learn": "m08" }, E2.body), live = E2.LX.H("div", { class: "lx-live" }, root);
    const unhandled = []; const onUn = e => unhandled.push(String(e && e.message || e)); process.on("unhandledRejection", onUn);
    let threw = null;
    try { init(live, { m08_stochastic_robust: D, path: J("path.json") }, root); } catch (e) { threw = e.stack || e.message; }
    ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
    ok(E2.LX.m08 && typeof E2.LX.m08.cost === "function", "the page exports its closed form as LX.m08 (CF3 reads it)");
    const flush = () => new Promise(r => setImmediate(r));
    const card = () => demo.cards.el, btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent)), next = () => btns(/Next/)[0], failBox = () => card().querySelector(".m8-fail");
    try {
      // step 1: the tree, all three branches
      demo.cards.go(0); card().querySelectorAll(".m8-br").forEach(b => b.click());
      ok(!next().disabled && /The largest surplus is 713 MW with none of the planned wind built and 2,997 MW with all of it/.test(card().textContent), "step 1: three branches seen unlock Next; the surpluses are the model's");
      // step 3: fails, then works
      demo.cards.go(2); failing = true; calls = 0;
      btns(/Solve the three branches/)[0].click(); await flush();
      ok(failBox() && failBox().getAttribute("role") === "alert" && /time limit/.test(failBox().textContent) && /Try again/.test(failBox().textContent), "step 3: a failed solve shows a plain message and Try again");
      ok(card().getAttribute("aria-busy") == null && next().disabled && !btns(/Solve the three branches/)[0].disabled, "step 3: busy cleared, the button works again, Next waits");
      failing = false; calls = 0; btns(/Try again/)[0].click(); await flush(); await flush();
      ok(!failBox() && !next().disabled && calls === 3 && /380 MW, 1,300 MW or 2,220 MW/.test(card().textContent), "step 3: Try again solves the three branches and unlocks Next (" + calls + " solves)");
      // step 4: the average's plan priced in every branch
      demo.cards.go(3); calls = 0; btns(/Solve, then price the plan/)[0].click(); await flush(); await flush();
      ok(calls === 2 && card().textContent.includes(fm.m(R.ev.exp)) && card().textContent.includes(fm.m(R.ev.own)), "step 4: two solves (the problem, then the plan priced); its costs are the reference's");
      // step 7 solves what is missing on its own, then grades EVPI
      demo.cards.go(6); await flush(); await flush();
      const box = card().querySelector("input");
      ok(box && card().textContent.includes(fm.m(R.sp.exp)), "step 7: the stochastic program solved on arrival; the box is there");
      if (box) { box.value = "10"; btns(/Check/)[0].click(); ok(next().disabled, "step 7: a wrong EVPI does not unlock Next"); box.value = (R.evpi / 1e6).toFixed(2); btns(/Check/)[0].click(); ok(!next().disabled && card().textContent.includes("EVPI = " + fm.m(R.sp.exp)), "step 7: the right EVPI unlocks Next"); }
      // step 9: least regret, then step 10 with two presets
      demo.cards.go(8); calls = 0; btns(/Solve the least-regret plan/)[0].click(); await flush(); await flush();
      ok(card().textContent.includes(fm.mw(R.reg.x)) && !next().disabled, "step 9: the least-regret plan (" + fm.mw(R.reg.x) + ")");
      demo.cards.go(9); const seg = () => card().querySelectorAll(".lx-seg button");
      failing = true; seg()[0].click(); await flush();
      ok(failBox() && next().disabled, "step 10: a failed preset solve shows the note");
      failing = false; btns(/Try again/)[0].click(); await flush(); await flush(); await flush();
      seg()[2].click(); await flush(); await flush(); await flush();
      ok(!next().disabled && card().textContent.includes(fm.mw(R.presets.pess.sp)) && card().textContent.includes(fm.mw(R.presets.opt.sp)) && /stays at 380 MW/.test(card().textContent), "step 10: two presets solved; the stochastic plan moves, the worst-case plan stays");
      // the chart: the plans found so far are marked; its text version lists every kink
      const last = specs[specs.length - 1];
      ok(last && last.marks.map(m => m.n).join("") === "WSRA" && last.text.rows.length === M.kinks(D, S, 2500).length, "the chart marks W, S, R and A after the steps and lists every kink (" + (last ? last.marks.map(m => m.n).join("") : "") + ")");
    } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
    process.removeListener("unhandledRejection", onUn);
    ok(!unhandled.length, "no unhandled promise rejection: " + unhandled.join(" | "));
  }

  console.log(`test_m08-stochastic-robust: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL: the test threw:", e && e.stack || e); process.exit(1); });
