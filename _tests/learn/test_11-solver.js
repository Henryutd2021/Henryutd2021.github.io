// test_11-solver.js — Node tests for Lesson 11 (assets/learn/11-solver.js), its data (assets/learn/data/11-solver.json),
// its page (learn/11-solver.qmd) and its sidecar (learn/_w1/11-solver.yml). Solves with the vendored HiGHS, the same
// core as the page. What it covers, and what it does not:
//   - model: the day equals lesson 0's (grid-operator.js prepare()); the LP's optimum and $400 saving; every hourly
//     shadow price lies between the one-sided finite differences, equals them where they agree, and why() explains it;
//     the redispatch behind the two kinks (07:00 and 09:00); the 5 MWh quiz; the sign error; the peaker threshold;
//     the sliders' corners; the MILP (no duals, the on-or-off minimum)
//   - the editor (evalPlan): no one-hour edit that keeps every rule beats the solver; plans that break a ramp, leave a
//     surplus after all curtailment, or leave demand unserved are rejected (each with a reproducible case)
//   - the checks: they pass on the solver's plans, fail on the sign error, catch a peaker below its on-or-off minimum,
//     and keep "all demand served" apart from the accounting identity (a reproducible unserved case)
//   - text: the numbers stated in the .qmd (string matches against the model, not their meaning), the data file's
//     computed blocks, the sidecar's one-sided prices, curtailment named as wind and solar (not "sun") in the .qmd and
//     the .js, the MILP wording, every equation-card symbol defined, and the price buttons kept on tap (a source guard)
//   - not covered: the numbers composed at run time in the .js (they come from the model), layout and the browser
//     interaction itself (screenshots), and the rendered HTML unless _site/learn/11-solver.html is newer than the .qmd
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
  // what the solver changes at the two kinks (the page's table)
  const diff = (o, k) => o[k].map((v, h) => Math.abs(v - B[k][h]) > 1e-6 ? h + ":" + Math.round(v - B[k][h]) : "").filter(Boolean).join(" ");
  const dOne = (t, d) => { const a = {}; a[t] = d; return run(M.settings({ add: a })).o; };
  const u7 = dOne(7, 1), d7 = dOne(7, -1), u9 = dOne(9, 1), d9 = dOne(9, -1);
  ok(diff(u7, "pk") === "7:1" && diff(u7, "cc") === "", `kink 07:00 up: the peaker makes the MWh (cc ${diff(u7, "cc")}, pk ${diff(u7, "pk")})`);
  ok(diff(d7, "cc") === "7:-1 8:-1" && diff(d7, "pk") === "", `kink 07:00 down: 07:00 and 08:00 each fall by 1 MWh (cc ${diff(d7, "cc")})`);
  ok(diff(u9, "cc") === "9:1" && diff(u9, "pk") === "", `kink 09:00 up: the combined-cycle (cc ${diff(u9, "cc")})`);
  ok(diff(d9, "cc") === "7:-1 8:-1 9:-1" && diff(d9, "pk") === "7:1", `kink 09:00 down: 07:00-09:00 fall by 1 MWh and the peaker covers 07:00 (cc ${diff(d9, "cc")}, pk ${diff(d9, "pk")})`);
  const five = run(M.settings({ add: { 19: 5 } })).o;
  ok(near(five.totals.cost - B.totals.cost, 5 * B.duals[19]) && near(B.duals[19], 40), `quiz: 5 MWh more at 19:00 costs $${five.totals.cost - B.totals.cost} = 5 × $${B.duals[19]}`);
  // the curtailment variable holds both wind and solar (so the page names both)
  let cw = 0, cs = 0; B.sp.forEach((v, t) => { const vr = W.wind[t] + W.solar[t]; if (vr > 0) { cw += v * W.wind[t] / vr; cs += v * W.solar[t] / vr; } });
  ok(cw > 1 && cs > 1, `curtailment: ${B.totals.sp} MWh, about ${cw.toFixed(1)} of wind and ${cs.toFixed(1)} of solar in the chart's split`);
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
  // review case: 01:00 at 150 MW keeps the ramps but leaves 7 MW of surplus after all wind and solar there is curtailed
  const p1 = plan0.slice(); p1[1] = 150; const e1 = M.evalPlan(W, M.settings(), p1);
  ok(!e1.ok && e1.rampBreaks.length === 0 && e1.overHours.join() === "1" && near(e1.over[1], 7), `editor: 01:00 at 150 MW is rejected for a ${e1.over[1]} MW surplus, not for a ramp`);
  // and a plan that leaves demand unserved (19:00 at 30 MW: the peaker's 100 MW cannot fill the 115 MW gap) is rejected too
  const p19 = plan0.slice(); p19[19] = 30; const e19 = M.evalPlan(W, M.settings(), p19);
  ok(!e19.ok && e19.shortHours.includes(19) && e19.un[19] > 0, `editor: 19:00 at 30 MW leaves ${e19.un[19]} MW unserved and is rejected`);

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
  // review case: demand +20%, no wind, 10 MW/h ramps leaves 79.6 MWh unserved; the accounting check passes and says so,
  // and served() reports it apart from the checks
  const sU = M.settings({ demandPct: 20, windMW: 0, ramp: 10 }), xU = run(sU).o, cU = M.checks(W, sU, xU), vU = M.served(W, sU, xU);
  ok(near(xU.totals.un, 79.6, 1e-6) && cU[3].ok && /\+ unserved 80 = /.test(cU[3].text) && !/supply minus spill/.test(cU[3].text), `checks: the totals line reads generation after curtailment + unserved = demand (${cU[3].text})`);
  ok(!vU.ok && near(vU.un, xU.totals.un) && vU.hours > 0, `served: ${vU.un} MWh unserved in ${vU.hours} hours, reported apart from the checks`);
  ok(M.served(W, M.settings(), B).ok, "served: the day as given serves all demand");

  // ---------------- the on-or-off peaker (MILP)
  const sL = M.settings({ ramp: D.milpRamp }), sM = M.settings({ ramp: D.milpRamp, onoff: true });
  const lp30 = run(sL), mi30 = run(sM);
  ok(mi30.r.kind === "milp" && mi30.r.duals === null && mi30.o.duals === null, "milp: no duals");
  ok(mi30.r.status === "optimal" && mi30.o.totals.cost >= lp30.o.totals.cost - 1e-6, `milp: costs at least the LP (${mi30.o.totals.cost} vs ${lp30.o.totals.cost})`);
  ok(mi30.o.pk.every(v => v < 1e-6 || v >= sM.pkMin - 1e-6), "milp: the peaker is off or at least its minimum every hour");
  ok(lp30.o.totals.pk > 0 && lp30.o.pk.some(v => v > 1e-6 && v < sM.pkMin - 1e-6), "milp: the LP at this ramp runs the peaker below its minimum somewhere (so the on-or-off rule bites)");
  ok(M.checks(W, sM, mi30.o).every(c => c.ok), "milp: its plan passes the checks");
  // review case: a peaker at 10 MW, matched by extra curtailment and a recomputed cost, passes every check but the
  // limits check, and only because of the on-or-off minimum
  const h10 = mi30.o.sp.findIndex((v, t) => W.wind[t] + W.solar[t] - v >= 10 && mi30.o.pk[t] < 1e-6);
  const p10 = JSON.parse(JSON.stringify(mi30.o)); p10.pk[h10] = 10; p10.sp[h10] += 10; p10.objective += 10 * sM.pkCost;
  const c10 = M.checks(W, sM, p10), c10lp = M.checks(W, sL, Object.assign({}, p10, { objective: p10.objective - mi30.o.totals.cost + lp30.o.totals.cost }));
  ok(h10 >= 0 && !c10[1].ok && c10[0].ok && c10[2].ok && c10[3].ok, `checks: a 10 MW peaker at ${h10}:00 fails the limits check of the on-or-off model (${c10[1].text})`);
  ok(c10lp[1].ok, "checks: the same 10 MW is within the limits of the linear program (no minimum there)");
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
    const kinkRow = h => `| ${String(h).padStart(2, "0")}:00 | \\$${oneSided[h][0]} | \\$${oneSided[h][1]} | \\$${B.duals[h]} |`;
    ok(Q.includes(kinkRow(h1)) && Q.includes(kinkRow(h2)), `page: the kink table rows for ${h1}:00 (${o1}, reports ${B.duals[h1]}) and ${h2}:00 (${o2}, reports ${B.duals[h2]}) as computed`);
    ok(Q.includes("(\\$" + 3 * f.cc.cost + ")") && Q.includes("(−\\$" + f.peaker.cost + ")") && near(3 * f.cc.cost - f.peaker.cost, o2[1]), `page: the 09:00 saving is 3 × $40 − $100 = $${o2[1]}`);
    // curtailment is wind and solar, never "sun" alone; the MILP wording follows the course rule: prices come from LPs, never from MILPs
    const JS = fs.readFileSync(L("11-solver.js"), "utf8");
    [["page", Q], ["js", JS]].forEach(([k, txt]) => ok(!/spill(ed|s|ing)? (sun|solar)|of sun|sun is spilled|Spilled sun/i.test(txt), `${k}: curtailment is named as wind and solar, never spilled sun`));
    ok(!/no (single )?slope/i.test(Q + JS) && /conditional on that commitment/.test(Q) && /returns no (ordinary )?(LP )?shadow prices/.test(Q), "page: a mixed-integer solve returns no shadow prices; prices conditional on the commitment");
    ok(/July 2017/.test(Q), "page: the 5-minute dispatch fact is dated (EIA, July 2017)");
    // the simplex method in general: a move is never worse (a degenerate pivot can keep the cost); this hour's walk is
    // strictly downhill, which is what the step-through text ("to a cheaper neighbour") says
    ok(!/to a cheaper neighbouring corner/.test(Q) && /moves along an edge to a neighbouring corner that is never worse/.test(Q) && /On this hour every move is cheaper\./.test(Q),
       "page: the simplex method's moves are never worse (not always cheaper); this hour's are cheaper");
    ok(/var sol = LX\.lp2\.solve\(m10\), walk = LX\.lp2\.simplexWalk\(m10\)/.test(JS) && /to a cheaper neighbour\. /.test(JS), "peek: the step-through walks lesson 10's hour (its steps are tested downhill in test_10)");
    // every symbol button of the equation card has its words (a source check of the explain layer)
    const symIds = [...JS.matchAll(/sym\("(\w+)"/g)].map(m => m[1]), defs = new Set([...JS.matchAll(/^ {10}(\w+): \{ name: /gm)].map(m => m[1]));
    ok(symIds.length >= 15 && symIds.every(k => defs.has(k)), `equation card: all ${new Set(symIds).size} symbols have words (${symIds.filter(k => !defs.has(k))})`);
    ok(!/pricePick = t; paintPrices\(\)/.test(JS) && /pricePick = t; markPick\(\)/.test(JS), "prices: a tap marks the pressed button instead of rebuilding the buttons (keyboard focus stays)");
    // the sidecar's numerical note matches the one-sided prices
    const SC = fs.readFileSync(path.join(SITE, "learn/_w1/11-solver.yml"), "utf8");
    ok(SC.includes(`at 0${h1}:00 one more MWh costs $${o1[0]} and\n# one less saves $${o1[1]}`) && SC.includes(`at 0${h2}:00 one more costs $${o2[0]} and one less saves $${o2[1]}`) && !/\$0\/\$40/.test(SC), "sidecar: the one-sided prices at the kinks as computed");
    // the rendered page, when it is newer than the source
    const HP = path.join(SITE, "_site/learn/11-solver.html");
    if (fs.existsSync(HP) && fs.statSync(HP).mtimeMs >= fs.statSync(QPATH).mtimeMs) {
      const HT = fs.readFileSync(HP, "utf8");
      [money(B.totals.cost), money(ex.cost), money(bad.totals.cost), money(lp30.o.totals.cost), money(mi30.o.totals.cost), "18 of 24", "July 2017"].forEach(x => ok(HT.includes(x), `html: the rendered page states ${x}`));
    } else console.log("  (rendered page absent or older than the .qmd: html checks skipped)");
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
  out.push(`<title id="w11-static-title">The solver's plan for lesson 0's day: hourly supply stacked by plant, with demand as a dashed line. The combined-cycle plant covers every gap; the peaker never runs; ${fmt(B.totals.sp)} MWh of wind and solar is curtailed to keep the combined-cycle within its ramp limit.</title>`);
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
