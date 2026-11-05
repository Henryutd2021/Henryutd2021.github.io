// test_a17-physical-feasibility.js — Node tests for A17 (assets/learn/a17-physical-feasibility.js, its data file and the
// page learn/a17-physical-feasibility.qmd):
//   - physics from first principles, independent of the model's own formulas where possible: apparent power and current
//     (power factor form), the voltage estimate (units, sign, and the hosting capacity and evening limit found again by
//     bisection), M1's DC flows (Kirchhoff and M1's precomputed 110 / 9 / 101 MW), M1's no-ramp plan against M1's own
//     linear program solved with HiGHS (and the ramp-on plan's fixes), the starting rate of change of frequency against
//     lesson 3's rocof(), and the first-second sketch never optimistic against lesson 3's simulation
//   - feedback true for every input: each slider value's state words and the sentences that name a threshold
//   - every number on the page (fallback, step texts, Go deeper table, myths, quiz, practice, numbers to remember) from the
//     model or the data file
//   - scope: no nuclear technology on the page, in the data or the script; no "AI"; data centers only as loads; links to
//     learn pages and allowed domains only; no project or Research page
//   - text budget; path.yml entry; sidecar glossary
// Usage (from the site folder):  node _tests/learn/test_a17-physical-feasibility.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "a17-physical-feasibility";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const B3 = require(L("03-balancing.js"));
const M1m = require(L("m01-dispatch-to-lmp.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8"), A = JSON.parse(RAW);
const M1 = JSON.parse(fs.readFileSync(L("data/m01-dispatch-to-lmp.json"), "utf8"));
const G3 = JSON.parse(fs.readFileSync(L("data/03-balancing.json"), "utf8")), G = G3.grid;
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS block: write (--write) or check
const BLOCK = () => M.staticFallback(A, M1, G);
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing");
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8"); const r = between(q, "a17-fallback");
  q = q.slice(0, r.from) + BLOCK() + "\n" + q.slice(r.to); fs.writeFileSync(QPATH, q); console.log("no-JS block written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");
{ const r = between(PAGE, "a17-fallback"); ok(PAGE.slice(r.from, r.to) === BLOCK() + "\n", "a17-fallback block is up to date (run with --write)"); }
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const T = text(PAGE);
const has = (s, msg) => ok(T.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (msg ? " (" + msg + ")" : ""));

(async () => {
  // ---------------- 1 heating: apparent power and current
  const Ln = A.line, inj = M.m1Injections(M1);
  ok(inj.limit === M1.reference.limit && inj.hour === M1.reference.hour && inj.limit === 110, "the line's MW is M1's precomputed limit, 110 MW at 12:00");
  const c50 = M.lineCheck(Ln, 110, 50), c45 = M.lineCheck(Ln, 110, 45), c0 = M.lineCheck(Ln, 110, 0);
  // independent: I = P / (sqrt(3) V pf) with pf = cos(atan(Q/P))
  const pf50 = Math.cos(Math.atan(50 / 110));
  ok(near(c50.I, 110e6 / (Math.sqrt(3) * 138e3 * pf50), 1e-6) && near(c50.pf, pf50, 1e-12), "current = P / (√3 V pf): " + c50.I.toFixed(1) + " A");
  ok(near(c50.S, 120.83, 0.005) && c50.over && !c45.over && !c0.over, "110 MW + 50 Mvar = 120.8 MVA, over 120; 45 Mvar within");
  ok(near(M.amps(120, 138), 502.04, 0.01), "rating 120 MVA at 138 kV = 502 A in each wire");
  ok(near(M.qRoom(Ln, 110), Math.sqrt(2300), 1e-12) && Math.round(M.qRoom(Ln, 110)) === 48, "room for reactive power: √(120² − 110²) = 48 Mvar");
  for (let q = Ln.q.min; q <= Ln.q.max; q += Ln.q.step) {
    const c = M.lineCheck(Ln, 110, q);
    if (c.over !== (q > M.qRoom(Ln, 110))) ok(false, "the 'over' state at " + q + " Mvar agrees with the room of " + M.qRoom(Ln, 110).toFixed(2) + " Mvar");
  }
  ok(M.lineCheck(Ln, 110, Ln.q.min).over === false && M.lineCheck(Ln, 110, Ln.q.max).over === true, "the slider reaches both states");
  // DC flows: Kirchhoff, angle form, and M1's precomputed flows
  const fl = M.dcFlows(M1.buses.map(b => b.id), M1.lines, inj.inj, M.refBus(M1));
  ok(near(fl.RT, M1.reference.flow.RT, 1e-9) && near(fl.RG, M1.reference.flow.RG, 1e-9) && near(fl.GT, M1.reference.flow.GT, 1e-9), "DC flows = M1's precomputed 110 / 9 / 101 MW");
  M1.buses.forEach(b => {
    const out = M1.lines.reduce((s, l) => s + (l.from === b.id ? fl[l.id] : l.to === b.id ? -fl[l.id] : 0), 0);
    ok(near(out, inj.inj[b.id], 1e-9), "Kirchhoff at " + b.id + ": flows out = injection " + inj.inj[b.id]);
  });
  ok(near(fl.RT, fl.RG + fl.GT, 1e-9), "equal reactances: the direct path's flow = the two-line path's angle difference sum (RT = RG + GT)");
  ok(inj.ridge + inj.gas + inj.flat === inj.demand && inj.gas === 92 && inj.ridge === 119, "12:00 balances: 119 + 92 + 100 = 311 MW");
  ok(typeof M1m.ptdf === "function", "M1's model exports its PTDFs");

  // ---------------- 2 voltage: the estimate, the evening limit and hosting capacity (bisection on the voltage function)
  const F = A.feeder, Bd = A.band, z = M.ohms(F);
  ok(near(z.R, 2.0, 1e-12) && near(z.X, 3.2, 1e-12), "8 km × 0.25 and 0.40 Ω/km = 2.0 and 3.2 Ω");
  ok(near(M.tanphi(0.95), Math.tan(Math.acos(0.95)), 1e-12), "Q/P at power factor 0.95 = tan(acos(0.95)) = 0.329");
  // units: Ω × MW / kV² is dimensionless: 2 Ω × 1 MW = 2e6 W·Ω, / (12.47e3 V)² = per unit
  ok(near(2 * 1e6 / Math.pow(12.47e3, 2), 2 / (12.47 * 12.47), 1e-15), "units: Ω·MW/kV² is a per-unit number");
  const bis = (f, lo, hi) => { for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2; };
  const evL = M.eveningLimit(F, Bd.lo), evLb = bis(p => M.evening(F, p).v - Bd.lo, 0, 20);
  ok(near(evL, evLb, 1e-9) && evL.toFixed(1) === "4.1", "evening limit = bisection: " + evL.toFixed(3) + " MW");
  ok(near(M.evening(F, 4).v, 0.9515, 0.0001) && M.evening(F, 4.5).v < Bd.lo && M.evening(F, 4).v > Bd.lo, "4.0 MW: 0.951 (in); 4.5 MW: below 0.95");
  for (let p = F.evening.min; p <= F.evening.max + 1e-9; p += F.evening.step) {
    const v = M.evening(F, p).v;
    if ((v < Bd.lo) !== (p > evL)) ok(false, "the evening state at " + p + " MW agrees with the limit");
    if (v > Bd.hi) ok(false, "the evening never exceeds the band's top (" + p + " MW)");
  }
  ok(M.evening(F, F.evening.min).v > Bd.lo && M.evening(F, F.evening.max).v < Bd.lo, "the evening slider reaches both states");
  const h0 = M.hosting(F, Bd.hi, false), h1 = M.hosting(F, Bd.hi, true);
  ok(near(h0, bis(pv => M.noon(F, pv, false).v - Bd.hi, 0, 50), 1e-9) && near(h1, bis(pv => M.noon(F, pv, true).v - Bd.hi, 0, 50), 1e-9), "hosting capacity = bisection on the voltage (both inverter settings)");
  ok(h0.toFixed(1) === "3.1" && h1.toFixed(1) === "6.5" && h1 > h0, "hosting capacity 3.1 MW, 6.5 MW with absorbing inverters");
  ok(M.noon(F, 0, false).v > M.noon(F, 0, false).v - 1 && M.noon(F, 4, false).v > M.noon(F, 2, false).v, "more solar, higher voltage at the far end");
  for (let pv = F.pv.min; pv <= F.pv.max + 1e-9; pv += F.pv.step) [false, true].forEach(ab => {
    const v = M.noon(F, pv, ab).v, hc = ab ? h1 : h0;
    if ((v > Bd.hi + 1e-9) !== (pv > hc)) ok(false, "the noon state at " + pv + " MW (absorb " + ab + ") agrees with the hosting capacity");
    if (v < Bd.lo) ok(false, "noon never sags below the band (" + pv + " MW)");
  });
  ok(M.noon(F, F.pv.max, true).v > Bd.hi, "the slider passes the hosting capacity with absorbing inverters too");
  // the evening setting leaves 0.02 at noon: the substation is 1.03, the band's top 1.05
  ok(near(Bd.hi - F.vSub, 0.02, 1e-12), "headroom at the substation: 1.05 − 1.03 = 0.02");

  // ---------------- 3 ramp: M1's no-ramp plan = M1's LP; the ramp-on plan's fixes
  const plan = M.noRamp(M1), ov = M.overs(plan, A.ramp.limitMWh);
  ok(ov.length === 3 && ov[0].to === 8 && ov[0].d === -55 && ov[1].to === 14 && ov[1].d === 50 && ov[2].to === 18 && ov[2].d === 50, "three changes over 40 MW: −55 into 08:00, +50 into 14:00, +50 into 18:00");
  ok(A.ramp.limitMWh === M1.fleet.cc.ramp && A.ramp.start === ov[1].to, "the 40 MW limit is M1's (town.json); the step starts at 14:00");
  ok(plan.every(h => h.pk === 0 && h.spill === 0), "without the rule the peaker stays off and nothing is spilled on this day");
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports;
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const run = o => { const r = core.solveWith(highs, M1m.build(M1, o)); return { r, d: M1m.read(M1, o, r) }; };
  const off = run({ network: false, ramp: false }), on = run({ network: false });
  ok(off.r.status === "optimal" && on.r.status === "optimal", "M1's LP with and without the ramp rule: optimal");
  ok(off.d.hours.every((h, t) => near(h.gen.cc, plan[t].cc, 1e-6) && near(h.gen.pk, plan[t].pk, 1e-6)), "the merit-order plan = M1's LP without the ramp rule, hour by hour");
  ok(on.d.hours.every((h, t) => t === 0 || Math.abs(h.gen.cc - on.d.hours[t - 1].gen.cc) <= A.ramp.limitMWh + 1e-6), "with the rule every change is within 40 MW");
  ov.forEach(c => {
    const a = on.d.hours[c.from], b = on.d.hours[c.to];
    const earlier = c.d > 0 ? a.gen.cc > plan[c.from].cc + 1e-6 : a.gen.cc < plan[c.from].cc - 1e-6;
    const fix = earlier || b.gen.pk > 1e-6 || b.spill > 1e-6 || a.spill > 1e-6;
    ok(fix, "into " + M.hh(c.to) + ": the ramp-on plan starts earlier, runs the peaker or spills wind and sun");
  });
  // the sort card names the same number
  ok(A.sort.cards.filter(c => c.id === "ramp")[0].text.indexOf(ov[1].d + " MW") >= 0, "the sort card's 50 MW = the model");

  // ---------------- 4 inertia
  const I = A.inertia;
  for (let E = G.inertia.min; E <= G.inertia.max; E += G.inertia.step) {
    if (!near(M.rocof(G, E), B3.rocof(G, E), 1e-12)) ok(false, "starting rate of change = lesson 3's rocof at " + E + " GW·s");
    if (!near(M.startRocof(G, E, "gfm"), M.rocof(G, E) / 2, 1e-12)) ok(false, "a 50 MW grid-forming battery halves the starting fall at " + E + " GW·s");
    if (!near(M.startRocof(G, E, "gfl"), M.rocof(G, E), 1e-12)) ok(false, "a grid-following battery leaves the starting fall unchanged at " + E);
    // the sketch is never optimistic: lesson 3's simulation (load relief, governors) is at or above it after 1 s
    const sim = B3.simulate(G, { inertia: E, reserve: G.reserve.start, gov: true, tEnd: 1, sample: 0.01 });
    if (!(sim.end >= M.sketch(G, I, E, "none", 1) - 1e-9)) ok(false, "the sketch is not optimistic at " + E + " GW·s: lesson 3 " + sim.end.toFixed(3) + " ≥ sketch " + M.sketch(G, I, E, "none", 1).toFixed(3));
    const s1 = M.sketch(G, I, E, "gfl", 1), s2 = M.sketch(G, I, E, "gfm", 1), s0 = M.sketch(G, I, E, "none", 1);
    if (!(s2 > s1 && s1 > s0)) ok(false, "after 1 s the grid-forming sketch is highest, then grid-following, then none (" + E + " GW·s)");
  }
  ok(near(M.rocof(G, 16), 0.1875, 1e-12) && M.rocof(G, 6).toFixed(2) === "0.50" && M.rocof(G, 30).toFixed(2) === "0.10", "0.19, 0.50 and 0.10 Hz/s at 16, 6 and 30 GW·s");
  ok(Math.round(M.rocof(G, G.inertia.min) / M.rocof(G, G.inertia.max)) === 5 && near(M.rocof(G, G.inertia.min) / M.rocof(G, G.inertia.max), 5, 1e-12), "6 GW·s falls five times as fast as 30 GW·s");
  ok(G.ffrMW === 50 && G.tripMW === 100 && G.f0 === 60, "lesson 3's grid: 60 Hz, 100 MW trip, 50 MW battery");
  ok(near(M.sketch(G, I, 16, "gfl", 0.5), M.sketch(G, I, 16, "none", 0.5), 1e-12) && M.sketch(G, I, 16, "gfl", 0.75) > M.sketch(G, I, 16, "none", 0.75), "grid-following helps only after its 0.5 s wait");

  // ---------------- numbers on the page
  has("110 MW with 50 Mvar is 120.8 MVA, over a 120 MVA rating", "myth 1");
  ok(M.fmtN(c50.S, 1) === "120.8", "myth 1's 120.8 = the model");
  has("more than about 3.1 MW at this feeder's far end lifts its voltage above 1.05 per unit", "myth 2");
  has("a battery with 50 MW to spare halves the starting fall after a 100 MW trip", "myth 3");
  has("asks the gas plant to climb 50 MW into 14:00, though it can change by only 40 MW an hour", "myth 4");
  has("$\\sqrt{110^2 + 50^2}$ = 120.8 MVA"); has("120 MVA at 138 kV = 502 A");
  const v4 = M.evening(F, 4);
  ok(v4.Q.toFixed(2) === "1.31" && M.pu(v4.v) === "0.951" && (12.47 * 12.47).toFixed(1) === "155.5", "Go deeper: 4.0 MW, Q 1.31 Mvar, 155.5 kV², 0.951 per unit");
  has("1.03 − (2.0 × 4.0 + 3.2 × 1.31) ÷ 155.5 = 0.951 per unit");
  ok((F.noonLoadMW * M.tanphi(F.loadPF)).toFixed(2) === "0.33", "Go deeper: Q_L = 0.33 Mvar");
  has("(2.0 × 1.0 + 3.2 × 0.33 + 0.02 × 155.5) ÷ 2.0 = 3.1 MW"); has("60 × 100 ÷ (2 × 16,000) = 0.19 Hz per second");
  ok(M.tanphi(0.95).toFixed(2) === "0.33", "q = 0.33 at power factor 0.95");
  // practice
  const p1 = Math.sqrt(300 * 300 + 100 * 100);
  ok(p1.toFixed(1) === "316.2" && Math.round(100 * p1 / 320) === 99 && Math.round(M.amps(p1, 230)) === 794, "practice 1: 316.2 MVA, 99%, 794 A");
  has("√(300² + 100²) = 316.2 MVA, 99% of its rating; 316.2 MVA ÷ (√3 × 230 kV) = 794 A");
  ok((110 / c50.S).toFixed(2) === "0.91", "practice 2: 0.91"); has("110 ÷ 120.8 = 0.91");
  const F3 = { kV: 12.47, km: 1, rOhmPerKm: 1.5, xOhmPerKm: 2.4, vSub: 1.02, loadPF: 0.95 }, e3 = M.evening(F3, 3);
  ok(e3.Q.toFixed(2) === "0.99" && e3.v.toFixed(3) === "0.976" && e3.v >= Bd.lo, "practice 3: Q 0.99 Mvar, 0.976 per unit, in the band");
  has("1.02 − (1.5 × 3 + 2.4 × 0.99) ÷ 155.5 = 0.976 per unit");
  const F4 = Object.assign({}, F, { km: 16 }), h4 = M.hosting(F4, Bd.hi, false);
  ok(h4.toFixed(1) === "2.3" && near(M.ohms(F4).R, 4, 1e-12) && near(M.ohms(F4).X, 6.4, 1e-12), "practice 4: 16 km feeder hosts 2.3 MW");
  has("About 2.3 MW: (4.0 × 1.0 + 6.4 × 0.33 + 0.02 × 155.5) ÷ 4.0, less than the 3.1 MW of the 8 km feeder");
  ok(near(60 * 200 / (2 * 10000), 0.6, 1e-12) && near(M.rocof(Object.assign({}, G, { tripMW: 200 }), 10), 0.6, 1e-12), "practice 5: 0.6 Hz/s");
  ok(290 - 180 === 40 + 70 && 100 + 40 <= 150 && 70 <= 100, "practice 6: 40 + 70 = 110 MW, within both plants");
  // numbers to remember and the band
  ok(Bd.volts[0] === Bd.nominalV * Bd.lo && Bd.volts[1] === Math.round(Bd.nominalV * Bd.hi), "band: 114 and 126 V = 0.95 and 1.05 of 120 V");
  has("The normal range of service voltage, ANSI C84.1 Range A: 114 to 126 V on a 120 V service.");
  has("Data-center load that dropped off at once, across 60 load points, after a normally cleared 230 kV fault in Loudoun County, Virginia, in July 2024.");
  ok(A.real.loudoun.mw === 1500 && A.real.loudoun.points === 60 && A.real.loudoun.kV === 230 && A.real.ercotInertia.gws === 100, "real anchors = the data file (dossier row 19; ERCOT 100 GW·s)");
  ok(PAGE.indexOf(A.band.url) >= 0 && PAGE.indexOf(A.real.loudoun.url) >= 0 && PAGE.indexOf(A.real.ercotInertia.url) >= 0 && PAGE.indexOf(A.real.unifi.url) >= 0 && PAGE.indexOf(A.real.pjm5.url) >= 0, "every real source in the data file is cited on the page");
  // the fallback's sentences come from the model (checked above as a block); spot-check its threshold numbers
  const FB = text(BLOCK());
  ok(FB.indexOf("more than 48 Mvar") >= 0 && FB.indexOf("above 4.1 MW") >= 0 && FB.indexOf("above 3.1 MW") >= 0 && FB.indexOf("to 6.5 MW") >= 0 && FB.indexOf("−55 MW into 08:00, +50 MW into 14:00, +50 MW into 18:00") >= 0 && FB.indexOf("0.10 Hz per second with 30 GW·s of stored rotational energy and 0.50 with 6 GW·s") >= 0,
    "fallback: 48 Mvar, 4.1 MW, 3.1 and 6.5 MW, the three ramps, 0.10 and 0.50 Hz/s");

  // ---------------- step texts and feedback (the script's sentences, with the model's numbers)
  const S0 = M.summary(A, M1, G, {});
  ok(S0.line.Q === 0 && S0.ev.P === 2 && near(S0.host, h0) && S0.E === 16 && S0.overs.length === 3, "defaults of the explain layer");
  const S1 = M.summary(A, M1, G, { q: 55, ev: 4.5, pv: 3.5, absorb: true, E: 6 });
  ok(S1.line.over && S1.ev.v < Bd.lo && S1.noon.v < Bd.hi && near(S1.r1, 0.25, 1e-12), "the reader's numbers reach the explain layer (55 Mvar over; 4.5 MW sags; 3.5 MW with absorbing inverters within)");
  const steps = [...JS.matchAll(/\n      \{ text: (".*?"),\n        build/g)].map(m => m[1]);
  ok(steps.length === 9, "nine step cards (" + steps.length + ")");
  // a step's text, numbers filled in, stays within about 40 words
  const filled = steps.map(s => s.replace(/" \+ .+? \+ "/g, "12").replace(/^"|"$/g, ""));
  filled.forEach((s, i) => { const w = s.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).length; ok(w <= 42, "step " + (i + 1) + " text is " + w + " words (≤ 42)"); });
  ok(/Above about " \+ fmtN\(room\) \+ " Mvar it would overheat/.test(JS) && /it overheats, though the DC plan shows/.test(JS), "step 2's feedback names the threshold from the model in both states");
  ok(/Above about \*\*" \+ fmtN\(evL, 1\) \+ " MW\*\*/.test(JS), "step 3's feedback names the evening limit from the model");
  ok(/halves the starting fall/.test(JS) && /only after " \+ I\.delayS \+ " s/.test(JS), "step 8's feedback: halves (true at every E) and the wait from the data");
  ok(/times as fast as with/.test(JS) && /fmtN\(rocof\(G, G\.inertia\.min\) \/ rocof\(G, G\.inertia\.max\)\)/.test(JS), "step 7's ratio comes from the model");

  // ---------------- scope
  const MINE = PAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(MINE), "no nuclear technology on the page, in the data, the script or the sidecar");
  ok(!/\bAI\b|artificial intelligence/.test(MINE), "no 'AI'");
  ok(!/projects\/|research\.(html|qmd)/.test(PAGE + RAW), "no project page and no Research page");
  const dc = T.match(/[^.]*data[- ]cent[^.]*\./gi) || [];
  ok(dc.length >= 1 && dc.every(s => /load/.test(s) && !/\b(supply|supplies|supplied|power plant|build|generat|buyer|order|timing)/i.test(s)), "data centers appear only as loads (" + dc.length + " sentences)");
  const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN.matchAll(/\]\((https?:[^)]+)\)/g)].map(m => m[1]));
  const ALLOW = /^https:\/\/(www\.)?(eia\.gov|energy\.gov|ferc\.gov|ercot\.com|pjm\.com|docs\.nlr\.gov|docs\.pypsa\.org)\//;
  ok(hrefs.length > 10 && hrefs.every(h => ALLOW.test(h) || /^[0-9a-z-]+\.html$/.test(h)), "links: learn pages and allowed domains only: " + hrefs.filter(h => !(ALLOW.test(h) || /^[0-9a-z-]+\.html$/.test(h))).join(", "));
  ["f06-grid-and-outages.html", "m01-dispatch-to-lmp.html", "03-balancing.html"].forEach(h => ok(OWN.indexOf('href="' + h + '"') >= 0, "links " + h));
  ok(/LX\.lessonRefHTML\(P, "A6"\)/.test(JS) && !/a06-|f08-/.test(PAGE + JS.replace(/LX\.lessonRefHTML\(P, "A6"\)/, "")), "A6 is named through LX.lessonRef only (upcoming in this branch)");

  // ---------------- text budget of the page's own prose
  const prose = OWN.replace(/<!-- a17-fallback:start[\s\S]*?a17-fallback:end -->/, " ").replace(/<style>[\s\S]*?<\/style>/, " ").replace(/<table class="lx-facts">[\s\S]*?<\/table>/g, " ").replace(/^---[\s\S]*?\n---\n/, " ")
    .replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ").replace(/<!--[\s\S]*?-->/g, " ").split(/<\/?(?:p|li|dd|dt|summary|td|th)\b[^>]*>|<br>|\n\n|\n- /).map(text).filter(s => /[A-Za-z]{3}/.test(s) && !/^\|/.test(s) && !/^(:::|```)/.test(s));
  prose.forEach(s => { const w = s.split(" ").length; ok(w <= 46, "text element of " + w + " words (≤ 46): " + s.slice(0, 70)); });

  // ---------------- path.yml entry, front matter, sidecar
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(e => /\n  id: a17-physical-feasibility\n/.test(e)) || "";
  ok(/\n  code: A17\n/.test(entry) && /\n  status: active\n/.test(entry) && /\n  minutes: 30\n/.test(entry) && /\n  practice_minutes: 20/.test(entry) && /\n  after: \[F6, 3\]/.test(entry) && /\n  form: cards\n/.test(entry), "path.yml: A17, cards, 30 + 20 minutes, after F6 and lesson 3, active");
  const sub = (entry.match(/\n  subtitle: "(.*)"\n/) || [])[1];
  ok(sub && PAGE.indexOf('subtitle: "' + sub + '"') >= 0, "front matter subtitle = path.yml");
  const terms = [...SIDE.matchAll(/- id: ([a-z-]+)/g)].map(m => m[1]);
  ok(terms.join(",") === "apparent-power,power-factor,thermal-rating,hosting-capacity,per-unit,service-voltage-range", "sidecar: six new glossary terms");
  const used = new Set([...(PAGE + JS).matchAll(/data-term="([a-z0-9-]+)"|\[\[([a-z0-9-]+)\|/g)].map(m => m[1] || m[2]).filter(Boolean));
  const GL = JSON.parse(fs.readFileSync(L("data/glossary.json"), "utf8"));
  ok([...used].every(t => GL[t]), "every glossary mark is defined: " + [...used].filter(t => !GL[t]).join(", "));

  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
})();
