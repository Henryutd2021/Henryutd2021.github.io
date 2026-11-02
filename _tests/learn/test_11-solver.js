// test_11-solver.js — Node tests for Lesson 11 (assets/learn/11-solver.js), its data (assets/learn/data/11-solver.json)
// and every number the page (learn/11-solver.qmd) states. Solves with the vendored HiGHS, the same core as the page.
//   - the day equals lesson 0's (grid-operator.js prepare()); the LP's optimum equals lesson 0's full-day optimum
//   - every hourly shadow price equals the finite difference of the best cost (one more MWh), and why() explains it
//   - the solver's plan cannot be beaten by any one-hour edit that keeps the ramp rule; its checks pass
//   - the planted sign error solves "optimal" at a lower cost and fails the balance and totals checks
//   - the peaker starts below the threshold price; the MILP has no duals and respects the on-or-off minimum
// Usage (from the site folder):  node _tests/learn/test_11-solver.js            run the checks
//                                node _tests/learn/test_11-solver.js --write    rewrite the data file's computed blocks and
//                                                                               the page's static fallback figure
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const WRITE = process.argv.includes("--write");
const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
const { core, VERSION } = ctx.module.exports;
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const M = require(L("11-solver.js"));
const M0 = require(L("grid-operator.js"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const DPATH = L("data/11-solver.json"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
const QPATH = path.join(SITE, "learn/11-solver.qmd");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const money = v => "$" + Math.round(v).toLocaleString("en-US");
const sum = a => a.reduce((x, y) => x + y, 0);

(async () => {
  const highs = await loadHighs();
  const W = M.dayOf(town, year), W0 = M0.prepare(town, year, "lesson0"), f = town.fleet, V = D.penalty;
  const run = s => { const r = core.solveWith(highs, M.buildLP(W, s, V), { timeLimit: 10 }); const o = M.parse(W, s, r, V); if (o) o.penalty = V * o.totals.un; return { r, o }; };

  // ---------------- the day is lesson 0's
  ["demand", "wind", "solar", "need"].forEach(k => ok(W[k].join() === W0[k].join(), `day: ${k} equals lesson 0's`));
  ok(W.startCC === W0.game.startCC, "day: the combined-cycle starts at lesson 0's level");
  const hs = M.hours(W, M.settings());
  ok(hs.every((x, t) => near(x.need, W.need[t]) && near(x.demand, W.demand[t])), "hours(): defaults reproduce the day");
  ok(near(sum(hs.map(x => x.demand)), sum(W.demand)), "hours(): total demand");

  // ---------------- the base LP
  const base = run(M.settings()), B = base.o;
  const LPm = M.buildLP(W, M.settings(), V);
  ok(LPm.variables.length === 96 && LPm.constraints.length === 72, `size: 96 decisions and 72 rules (${LPm.variables.length}, ${LPm.constraints.length})`);
  ok(base.r.status === "optimal" && base.r.kind === "lp", "base: optimal LP");
  const ex = M0.expert(W0).totals;
  ok(near(B.totals.cost, base.r.objective) && B.totals.un === 0, `base: running cost ${B.totals.cost} = objective, nothing unserved`);
  ok(near(ex.cost - B.totals.cost, 400), `base: the solver beats lesson 0's cheapest-first rule by $400 (${ex.cost} vs ${B.totals.cost})`);
  ok(near(B.totals.pk, 0) && near(ex.pk, 20), "base: the peaker runs 0 MWh (the rule used 20 MWh), as lesson 0's Go deeper says");
  ok(M.checks(W, M.settings(), B).every(c => c.ok), "base: all four checks pass");
  const maxRamp = Math.max(...B.cc.map((c, t) => Math.abs(c - (t ? B.cc[t - 1] : W.startCC))));
  ok(near(maxRamp, f.cc.ramp), `base: the ramp rule binds somewhere (largest change ${maxRamp} MW)`);
  ok(near(sum(B.cc) + sum(W.wind) + sum(W.solar) + 24 * f.nuclear.mw - B.totals.sp, sum(W.demand)), "base: energy adds up (supply minus spill = demand)");

  // ---------------- shadow prices = finite differences, and their explanations
  const counts = {}, degenerate = [], oneSided = {};
  for (let t = 0; t < 24; t++) {
    const add = {}; add[t] = 1;
    const up = run(M.settings({ add })).o, fdUp = up.totals.cost + up.penalty - B.totals.cost;
    add[t] = -1; const dn = run(M.settings({ add })).o, fdDn = B.totals.cost - (dn.totals.cost + dn.penalty);
    ok(B.duals[t] >= fdDn - 1e-6 && B.duals[t] <= fdUp + 1e-6, `dual: hour ${t} shadow price ${B.duals[t]} lies between the saving from one MWh less (${fdDn}) and the cost of one more (${fdUp})`);
    if (!near(fdUp, fdDn)) { degenerate.push(t); oneSided[t] = [fdUp, fdDn]; } else ok(near(fdUp, B.duals[t]), `dual: hour ${t} shadow price ${B.duals[t]} = finite difference ${fdUp}`);
    const w = M.why(W, M.settings(), B, t, { up: fdUp, down: fdDn }); counts[Math.round(B.duals[t])] = (counts[Math.round(B.duals[t])] || 0) + 1;
    ok(!!w.degenerate === !near(fdUp, fdDn) && (!w.degenerate || (w.text.includes("$" + Math.round(fdUp)) && w.text.includes("$" + Math.round(fdDn)))), `why: hour ${t} flags a non-unique price exactly when the two differences differ`);
    if (near(B.duals[t], f.cc.cost)) ok(w.kind === "marginal", `why: hour ${t} at $40 is the marginal plant`);
    else ok(w.kind === "ramp", `why: hour ${t} at $${B.duals[t]} is explained by a ramp rule (${w.kind}: ${w.text})`);
    if (near(B.duals[t], 2 * f.cc.cost)) ok(/\$40 \+ \$40/.test(w.text) && w.link != null && B.sp[w.link] > 0, `why: hour ${t} names the linked hour where the extra MWh is spilled`);
  }
  ok(counts[40] === 18 && counts[0] === 3 && counts[80] === 3, `duals: 18 hours at $40, 3 at $0, 3 at $80 (${JSON.stringify(counts)})`);
  ok(degenerate.join() === D.degenerateHours.join(), `duals: the hours with a non-unique price are ${D.degenerateHours} (${degenerate})`);
  ok(near(B.duals[D.probe.hour], D.probe.answer), `probe: the shadow price at ${D.probe.hour}:00 is the predicted answer $${D.probe.answer}`);
  const oddHours = B.duals.map((y, t) => near(y, 40) ? -1 : t).filter(t => t >= 0);
  console.log(`  shadow prices: ${B.duals.join(" ")}; odd hours ${oddHours.join(", ")}`);

  // ---------------- try to beat it: one-hour edits on the 5 MW grid never win while the ramp rule holds
  let wins = 0, tried = 0, rampOK = 0;
  const plan0 = B.cc.map(Math.round);
  ok(plan0.every((v, t) => near(v, B.cc[t])), "editor: the solver's plan is whole MW");
  const e0 = M.evalPlan(W, M.settings(), plan0);
  ok(e0.ok && near(e0.cost, B.totals.cost) && e0.rampBreaks.length === 0, `editor: the solver's own plan evaluates to ${e0.cost}`);
  for (let t = 0; t < 24; t++) for (let v = 0; v <= f.cc.mw; v += 5) {
    const p = plan0.slice(); p[t] = v; const e = M.evalPlan(W, M.settings(), p); tried++;
    if (e.ok) { rampOK++; if (e.cost < B.totals.cost - 1e-6) wins++; }
  }
  ok(wins === 0 && rampOK > 24, `editor: no one-hour edit that keeps the rules beats the solver (${tried} tried, ${rampOK} keep the rules)`);
  const p13 = plan0.slice(); p13[D.editHour] -= 5; const e13 = M.evalPlan(W, M.settings(), p13);
  ok(e13.cost < B.totals.cost && e13.rampBreaks.length > 0, `editor: lowering ${D.editHour}:00 by 5 MW looks cheaper (${e13.cost}) but breaks a ramp at ${e13.rampBreaks}`);

  // ---------------- the planted sign error
  const bad = run(M.settings({ signError: true })).o, cb = M.checks(W, M.settings({ signError: true }), bad);
  ok(bad.status === "optimal" && bad.totals.cost < B.totals.cost - 1000, `sign error: "optimal" at ${bad.totals.cost}, below ${B.totals.cost}`);
  ok(!cb[0].ok && !cb[3].ok && cb[1].ok && cb[2].ok, "sign error: balance and totals checks fail; limits and ramps pass");
  ok(near(-cb[3].value, 2 * bad.totals.sp, 1e-6), `sign error: the model invents ${-cb[3].value} MWh (twice the 'spill')`);

  // ---------------- sensitivity: when does the peaker start?
  const thr = Math.max(...B.duals);
  const under = run(M.settings({ pkCost: thr - 5 })).o, over = run(M.settings({ pkCost: thr + 5 })).o;
  ok(under.totals.pk > 0 && near(over.totals.pk, 0), `threshold: the peaker runs at $${thr - 5} (${under.totals.pk} MWh) and not at $${thr + 5}`);
  [[{ ramp: 30 }, "ramp 30"], [{ demandPct: 10 }, "demand +10%"], [{ windMW: 0 }, "no wind"], [{ ramp: D.ranges.ramp[0] }, "ramp min"], [{ demandPct: D.ranges.demandPct[1], windMW: 0, ramp: D.ranges.ramp[0] }, "worst corner of the sliders"]].forEach(([s, lab]) => {
    const x = run(M.settings(s)); ok(x.r.status === "optimal" && M.checks(W, M.settings(s), x.o).every(c => c.ok), `sliders: ${lab} solves and passes the checks (${x.o.totals.cost}, unserved ${x.o.totals.un})`);
  });

  // ---------------- the on-or-off peaker (MILP)
  const sL = M.settings({ ramp: D.milpRamp }), sM = M.settings({ ramp: D.milpRamp, onoff: true });
  const lp30 = run(sL), mi30 = run(sM);
  ok(mi30.r.kind === "milp" && mi30.r.duals === null && mi30.o.duals === null, "milp: no duals");
  ok(mi30.r.status === "optimal" && mi30.o.totals.cost >= lp30.o.totals.cost - 1e-6, `milp: costs at least the LP (${mi30.o.totals.cost} vs ${lp30.o.totals.cost})`);
  ok(mi30.o.pk.every(v => v < 1e-6 || v >= sM.pkMin - 1e-6), "milp: the peaker is off or at least its minimum every hour");
  ok(lp30.o.totals.pk > 0 && lp30.o.pk.some(v => v > 1e-6 && v < sM.pkMin - 1e-6), "milp: the LP at this ramp runs the peaker below its minimum somewhere (so the on-or-off rule bites)");
  ok(M.checks(W, sM, mi30.o).every(c => c.ok), "milp: its plan passes the checks");
  console.log(`  ramp ${D.milpRamp}: LP ${lp30.o.totals.cost} (peaker ${lp30.o.totals.pk} MWh), MILP ${mi30.o.totals.cost} (peaker ${mi30.o.totals.pk} MWh)`);

  // ---------------- the data file's computed blocks
  const want = {
    rule: { cost: ex.cost, pk: ex.pk, sp: ex.curtailed, co2: Math.round(ex.co2 * 10) / 10 },
    signError: { cost: bad.totals.cost },
    threshold: thr,
    precomputed: { cost: B.totals.cost, cc: B.cc, pk: B.pk, sp: B.sp, duals: B.duals },
    milp: { lpCost: lp30.o.totals.cost, lpPk: lp30.o.totals.pk, cost: mi30.o.totals.cost, pk: mi30.o.totals.pk }
  };
  if (WRITE) { Object.assign(D, want); fs.writeFileSync(DPATH, JSON.stringify(D, null, 2) + "\n"); console.log("wrote", path.relative(SITE, DPATH)); }
  Object.keys(want).forEach(k => ok(JSON.stringify(D[k]) === JSON.stringify(want[k]), `data: ${k} matches a fresh computation`));

  // ---------------- the page
  if (fs.existsSync(QPATH)) {
    let Q = fs.readFileSync(QPATH, "utf8");
    const svg = fallbackSVG(W, B);
    if (WRITE) { Q = Q.replace(/<!-- fallback-svg:start -->[\s\S]*?<!-- fallback-svg:end -->/, "<!-- fallback-svg:start -->\n" + svg + "\n<!-- fallback-svg:end -->"); fs.writeFileSync(QPATH, Q); console.log("wrote the fallback figure"); }
    ok(Q.includes(svg), "page: the static fallback figure matches the model");
    const must = [money(B.totals.cost), money(ex.cost), money(ex.cost - B.totals.cost), money(bad.totals.cost), "$" + thr, "96 decisions", "72 rules",
      `${counts[40]} of 24`, money(lp30.o.totals.cost), money(mi30.o.totals.cost)];
    must.forEach(s => ok(Q.includes(s), `page: states ${s}`));
    const [h1, h2] = D.degenerateHours, o1 = oneSided[h1], o2 = oneSided[h2];
    ok(Q.includes(`At 0${h1}:00 one more MWh of demand costs \\$${o1[0]}`) && Q.includes(`One MWh *less* saves only \\$${o1[1]}`) && Q.includes(`HiGHS reports \\$${B.duals[h1]}`) &&
       Q.includes(`At 0${h2}:00 the two sides are \\$${o2[0]} and \\$${o2[1]}`), `page: the non-unique prices at ${h1}:00 (${o1}) and ${h2}:00 (${o2}) as computed`);
    ok(!/learning[- ]curve|FOAK|NOAK/i.test(Q), "page: no excluded terms");
    D.facts.forEach(fc => ok(Q.includes(fc.url) && Q.includes(fc.n), `page: number to remember ${fc.n} with its source`));
  } else ok(false, "page: learn/11-solver.qmd missing");

  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL:", e && e.stack || e); process.exit(1); });

// the static figure for readers without JavaScript: the solver's day stacked by plant, demand dashed
function fallbackSVG(W, B) {
  const Wd = 720, Hh = 280, m = { l: 46, r: 8, t: 14, b: 28 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b, ymax = 400;
  const y = v => (m.t + ih - v / ymax * ih).toFixed(1), bw = iw / 24, out = [];
  out.push(`<svg viewBox="0 0 ${Wd} ${Hh}" role="img" aria-labelledby="w11-static-title">`);
  out.push(`<title id="w11-static-title">The solver's plan for lesson 0's day: hourly supply stacked by plant, with demand as a dashed line. The combined-cycle plant covers every gap; the peaker never runs; ${fmt(B.totals.sp)} MWh of sun is spilled to keep the combined-cycle warm.</title>`);
  let g = "<g>";
  for (let v = 0; v <= ymax; v += 100) g += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--lx-line)"/><text x="${m.l - 6}" y="${(+y(v) + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--lx-ink-3)">${v}</text>`;
  [0, 6, 12, 18, 24].forEach(h => { g += `<text x="${(m.l + h * bw).toFixed(1)}" y="${Hh - 8}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}" font-size="13" fill="var(--lx-ink-3)">${String(h).padStart(2, "0")}:00</text>`; });
  out.push(g + "</g>");
  let bars = "<g>";
  for (let t = 0; t < 24; t++) {
    const vr = W.wind[t] + W.solar[t], ws = vr > 0 ? B.sp[t] * W.wind[t] / vr : 0;
    const parts = [["var(--lx-nuc)", 100], ["var(--lx-wind)", W.wind[t] - ws], ["var(--lx-solar)", W.solar[t] - (B.sp[t] - ws)], ["var(--lx-cc)", B.cc[t]], ["var(--lx-pk)", B.pk[t]]];
    let acc = 0; const x = (m.l + t * bw + 1).toFixed(1), w = (bw - 2).toFixed(1);
    parts.forEach(([c, v]) => { if (v < 0.5) return; bars += `<rect x="${x}" y="${y(acc + v)}" width="${w}" height="${(+y(acc) - +y(acc + v)).toFixed(1)}" fill="${c}"/>`; acc += v; });
  }
  out.push(bars + "</g>");
  let d = ""; W.demand.forEach((v, t) => { d += (t ? "H" : "M" + m.l + "," + y(v) + "H") + (m.l + (t + 1) * bw).toFixed(1) + (t < 23 ? "V" + y(W.demand[t + 1]) : ""); });
  out.push(`<path d="${d}" fill="none" stroke="var(--lx-ink)" stroke-width="2" stroke-dasharray="5 3"/>`);
  out.push("</svg>");
  out.push('<div class="lx-legend" aria-hidden="true"><span><i style="--c:var(--lx-nuc)"></i>Nuclear</span><span><i style="--c:var(--lx-wind)"></i>Wind</span><span><i style="--c:var(--lx-solar)"></i>Solar</span><span><i style="--c:var(--lx-cc)"></i>Gas combined-cycle</span><span><i style="--c:var(--lx-pk)"></i>Gas peaker</span><span><i class="line"></i>Demand</span></div>');
  return out.join("\n");
}
function fmt(v) { return (Math.round(v * 10) / 10).toLocaleString("en-US"); }
