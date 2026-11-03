// test_m02-unit-commitment.js — Node tests for M2 (assets/learn/m02-unit-commitment.js) with the vendored HiGHS, the same
// solver core the page runs in its Web Worker. What it checks, and what it does not:
//   - the day in the data file is 29 July 2025 from town_days.json, scaled as lesson 0 scales its day; the fleet's sizes
//     and running costs are town.json's; the peaker's 30 MW minimum and the $3,000/MWh penalty are lesson 11's
//   - step 1 (the dispatch LP), step 2 (the relaxation as each rule is added), step 3 (the learner's plans: rounding,
//     rule breaks, the plan with nothing unserved), step 4 (the branch-and-bound tree, node by node), step 5 (the
//     mixed-integer program: size, cost, gap, no duals), step 6 (the cost staircase at 23:00), step 7 (conditional
//     prices, their finite-difference checks and the absence of corners), step 8 (settlement and uplift)
//   - uniqueness: every LP whose solution the page draws (the relaxations, every tree node, the fixed LP) has a unique
//     optimum, checked by perturbing the costs; so another HiGHS (the notebook's SciPy) grows the same tree
//   - the reference block of the data file equals the model's numbers (the explain layer and the fallback use it)
//   - page text: chosen strings in learn/m02-unit-commitment.qmd (every number on the page), the sidecar's glossary
//     entries, the notebook's asserted numbers. The step cards' sentences are built at run time from the solver's
//     results, so they cannot drift; the page's interaction (stale-solve guards, Next locks, focus) is not exercised
//     here: check it in the browser (scripts/learn_screenshots.mjs).
// Usage (from the site folder):  node _tests/learn/test_m02-unit-commitment.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
const { core, VERSION } = ctx.module.exports;
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const M = require(L("m02-unit-commitment.js"));
const D = JSON.parse(fs.readFileSync(L("data/m02-unit-commitment.json"), "utf8"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const days = JSON.parse(fs.readFileSync(L("data/town_days.json"), "utf8"));
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const PAGE = readOr(path.join(SITE, "learn/m02-unit-commitment.qmd"));
const NB = readOr(path.join(SITE, "learn/notebooks/m02-unit-commitment.ipynb"));
const SIDE = readOr(path.join(SITE, "learn/_w1/m02-unit-commitment.yml"));
const JS = fs.readFileSync(L("m02-unit-commitment.js"), "utf8");
const L11 = readOr(L("11-solver.js")), D11 = JSON.parse(readOr(L("data/11-solver.json")) || "{}");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const has = (s, msg) => ok(PAGE.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (msg ? " (" + msg + ")" : ""));
const F = D.fleet, R = D.reference, LS = D.lesson;
const arr = (a, b) => a.length === b.length && a.every((v, i) => near(v, b[i], 1e-6));

(async () => {
  const highs = await loadHighs();
  const solve = m => core.solveWith(highs, m, { timeLimit: 20 });
  const run = o => { const r = solve(M.build(D, o)); return { r, day: M.read(D, o, r) }; };
  // perturb the costs of every variable a little (seeded) and report the largest change in the switches and outputs
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function uniqueness(model) {
    const base = solve(model); let worst = 0;
    for (let k = 0; k < 4; k++) {
      const m = { sense: model.sense, constraints: model.constraints, variables: model.variables.map(v => Object.assign({}, v, { cost: (v.cost || 0) + (rnd() - 0.5) * 2e-3 })) };
      const r = solve(m);
      Object.keys(base.values).forEach(n => { if (/^[uvwp]_|^ren_|^shed_/.test(n)) worst = Math.max(worst, Math.abs(r.values[n] - base.values[n])); });
    }
    return worst;
  }

  // ---------------- the day and the fleet
  const sc = town.scenarios.lesson0, W = M.dayOf(town, days, "summer_peak", sc.demandPeakMW, sc.step);
  ok(arr(W.demand, D.day.demand) && arr(W.wind, D.day.wind) && arr(W.solar, D.day.solar), "the day = town_days.json summer_peak, scaled as lesson 0");
  ok(D.day.date === "2025-07-29" && days.days.summer_peak.date === D.day.date && D.day.label === "29 July 2025", "date and label");
  ok(/highest hourly demand/.test(days.days.summer_peak.note), "town_days.json calls it the summer day with the highest hourly demand");
  ok(Math.max(...D.day.demand) === 452 && D.day.demand.indexOf(452) === 15, "peak demand 452 MW at 15:00");
  ok(F.nuclear.mw === town.fleet.nuclear.mw && F.nuclear.cost === town.fleet.nuclear.cost && F.wind.mw === town.fleet.wind.mw && F.solar.mw === town.fleet.solar.mw, "nuclear, wind, solar = town.json");
  ok(F.cc.mw === town.fleet.cc.mw && F.cc.cost === town.fleet.cc.cost && F.pk.mw === town.fleet.peaker.mw && F.pk.cost === town.fleet.peaker.cost, "gas plants' sizes and running costs = town.json");
  ok(/pkMin: 30/.test(L11) && F.pk.min === 30, "the peaker's 30 MW minimum is lesson 11's");
  ok(D11.penalty === 3000 && D.penalty === 3000, "the $3,000/MWh penalty is lesson 11's");
  const NEED = M.need(D);
  ok(NEED.every(v => v % 5 === 0), "the need for gas is a multiple of 5 MW every hour, as in lesson 0");
  ok(arr(NEED.slice(17, 24), [155, 170, 205, 230, 195, 170, 145]), "evening need 155, 170, 205, 230, 195, 170, 145 MW " + NEED.slice(17));

  // ---------------- step 1: M1's dispatch LP (no switches)
  const lp = run({});
  ok(lp.r.status === "optimal" && lp.r.kind === "lp" && near(lp.day.cost, 159500), "dispatch LP: $159,500");
  const pkLP = lp.day.hours.map(h => h.p.pk);
  ok(arr(pkLP.slice(17, 23), [5, 20, 55, 80, 45, 20]) && pkLP.slice(0, 17).every(v => v === 0) && pkLP[23] === 0, "dispatch LP: peaker 5, 20, 55, 80, 45, 20 MW from 17:00 to 22:00");
  ok(lp.day.hours.every(h => h.t >= 17 && h.t <= 22 ? near(h.price, 100) : near(h.price, 40)), "dispatch LP: $100 from 17:00 to 22:00, $40 otherwise");
  ok(JSON.stringify(M.belowMin(D, lp.day, "pk")) === JSON.stringify([17, 18, 22]), "dispatch LP: the peaker runs below its 30 MW minimum at 17:00, 18:00 and 22:00");
  ok(lp.day.hours.every(h => h.shed === 0), "dispatch LP: nothing unserved");
  ok(uniqueness(M.build(D, {})) < 1e-6, "dispatch LP: unique solution");

  // ---------------- step 2: the relaxation, rule by rule (start-up and no-load, then minimum output, then run times)
  const rules = [{ startup: true }, { startup: true, pmin: true }, M.ALL];
  const rx = rules.map(r => run({ onoff: true, relax: true, rules: r }));
  rx.forEach((x, i) => ok(x.r.status === "optimal" && near(x.day.cost, 168975), `relaxation after rule ${i + 1}: $168,975`));
  rx.forEach((x, i) => ok(uniqueness(M.build(D, { onoff: true, relax: true, rules: rules[i] })) < 1e-6, `relaxation after rule ${i + 1}: unique solution`));
  const X = rx[2].day;
  ok(arr(X.hours.slice(17, 23).map(h => h.u.pk), [0.05, 0.2, 0.55, 0.8, 0.45, 0.2]), "relaxation: peaker switches 0.05, 0.2, 0.55, 0.8, 0.45, 0.2");
  ok(X.hours.every(h => near(h.u.cc, 1)), "relaxation: the combined-cycle plant's switches are whole (1) every hour");
  ok(near(X.tot.starts.pk, 0.8) && M.sw2(X.tot.starts.pk) === "0.8", "relaxation: 0.8 of a peaker start");
  ok(arr(X.hours.map(h => h.p.pk), pkLP), "relaxation: the same peaker outputs as the dispatch LP (5 MW at 17:00)");
  ok(near(F.pk.min * X.hours[17].u.pk, 1.5) && M.pct(X.hours[17].u.pk) === "5%", "relaxation: 5% on needs only 5% of 30 MW = 1.5 MW, so 5 MW passes");
  ok(near(168975 - 159500, F.cc.noload * 24 + F.pk.noload * 2.25 + F.pk.startup * 0.8), "relaxation: +$9,475 = CC no-load all day + 2.25 peaker hours of no-load + 0.8 of a start");
  ok(fractionalCount(X) === 6, "relaxation: six switches between 0 and 1");
  function fractionalCount(day) { return day.hours.filter(h => Math.abs(h.u.pk - Math.round(h.u.pk)) > 1e-6 || Math.abs(h.u.cc - Math.round(h.u.cc)) > 1e-6).length; }

  // ---------------- step 3: the learner's plans
  const rd = M.rounded(D, X);
  ok(M.runs(rd) === "19:00–20:00", "rounded relaxation: peaker on 19:00–20:00 only");
  ok(M.planBreaks(D, rd).length === 0, "rounded relaxation: breaks no run or down time (2 hours each)");
  const pr = run({ onoff: true, fix: M.planFix(D, rd) });
  ok(pr.r.ok && near(pr.day.tot.shed, 90) && near(pr.day.cost, 430300), `rounded plan: 90 MWh unserved, $430,300 (${pr.day.tot.shed}, ${pr.day.cost})`);
  const off = D.day.demand.map(() => 0), offRun = run({ onoff: true, fix: M.planFix(D, off) });
  ok(offRun.r.ok && near(offRun.day.tot.shed, 225), "all off: 225 MWh unserved");
  const best = D.day.demand.map((_, t) => (t >= 17 && t <= 22 ? 1 : 0)), bestRun = run({ onoff: true, fix: M.planFix(D, best) });
  ok(bestRun.r.ok && near(bestRun.day.cost, 173200) && near(bestRun.day.tot.shed, 0), "plan on 17:00–22:00: $173,200, nothing unserved");
  const one = off.slice(); one[17] = 1;
  ok(JSON.stringify(M.planBreaks(D, one)) === JSON.stringify([{ kind: "run", from: 17, to: 17, hours: 1 }]), "on at 17:00 only breaks the 2-hour minimum run");
  ok(run({ onoff: true, fix: M.planFix(D, one) }).r.status === "infeasible", "on at 17:00 only: the solver says infeasible");
  const gap = best.slice(); gap[18] = 0;
  ok(JSON.stringify(M.planBreaks(D, gap)) === JSON.stringify([{ kind: "run", from: 17, to: 17, hours: 1 }, { kind: "down", from: 18, to: 18, hours: 1 }]), "a one-hour stop at 18:00 breaks the run and down times");
  const late = off.slice(); late[23] = 1;
  ok(M.planBreaks(D, late).length === 0 && run({ onoff: true, fix: M.planFix(D, late) }).r.ok, "a start at 23:00 is allowed (the day ends; the model looks no further)");
  ok(M.planBreaks(D, rd).length === 0 && JSON.stringify(rd.slice(17, 23)) === "[0,0,1,1,0,0]", "rounding: 0.55 and 0.8 up, 0.05, 0.2, 0.45, 0.2 down");

  // ---------------- step 4: branch and bound
  const T = M.treeRun(D, {}, solve);
  ok(T.nodes.length === 11 && T.branchings === 5 && M.treeDone(T), "tree: 5 branchings, 11 LPs");
  const wantB = [168975, 328920, 169510, 300695, 169735, 242160, 170575, 228515, 171415, 185900, 173200];
  ok(arr(T.nodes.map(n => n.bound), wantB), "tree bounds " + T.nodes.map(n => n.bound));
  ok(JSON.stringify(T.nodes.filter(n => n.on).map(n => [n.on.name, n.on.x])) === JSON.stringify([["u_pk_19", 0.55], ["u_pk_21", 0.45], ["u_pk_18", 0.2], ["u_pk_22", 0.2], ["u_pk_17", 0.05]]), "tree: branches on the peaker at 19 (0.55), 21 (0.45), 18 (0.2), 22 (0.2), 17 (0.05)");
  ok(arr(T.nodes.map(n => n.shed), [0, 55, 0, 45, 0, 25, 0, 20, 0, 5, 0]), "tree: unserved MWh in each node");
  ok(JSON.stringify(T.nodes.map(n => n.status)) === JSON.stringify(["branched", "pruned", "branched", "pruned", "branched", "pruned", "branched", "pruned", "branched", "integer", "best"]), "tree statuses " + T.nodes.map(n => n.status));
  ok(T.nodes.filter(n => n.prunedBy === 9).length === 4, "tree: the first plan ($185,900) prunes four open nodes");
  ok(T.inc.id === 10 && near(T.inc.bound, 173200) && near(M.treeGap(T), 0), "tree: best plan $173,200, gap 0");
  ok(M.runs(D.day.demand.map((_, t) => (T.inc.u["u_pk_" + t] > 0.5 ? 1 : 0))) === "17:00–22:00", "tree: best plan runs the peaker 17:00–22:00");
  T.nodes.forEach(n => ok(uniqueness(M.build(D, { onoff: true, relax: true, fix: n.fix })) < 1e-6, `tree node ${n.id}: unique LP solution`));
  // ties broken by the earlier hour: at the root 0.55 (19:00) and 0.45 (21:00) are equally far from 1/2
  ok(M.pickSwitch([{ name: "a", x: 0.45, t: 21 }, { name: "b", x: 0.55, t: 19 }].sort((a, b) => a.t - b.t)).name === "b", "tie: the earlier hour wins");
  // the step-by-step path the page takes (pending -> accept in node order) gives the same tree
  const T2 = M.tree(D, {});
  const settle2 = () => M.treePending(T2).forEach(p => M.treeAccept(T2, p.id, solve(p.model)));
  settle2(); const snaps = [M.treeBound(T2)];
  while (!M.treeDone(T2)) { M.treeBranch(T2); settle2(); snaps.push(M.treeBound(T2)); }
  ok(arr(snaps, [168975, 169510, 169735, 170575, 171415, 173200]), "tree: best bound after each branching " + snaps);
  const lay = M.treeLayout(T);
  ok(lay.cols === 2 && lay.rows === 6 && T.nodes.every(n => lay.pos[n.id][0] === (n.val === 0 ? 0 : 1)), "tree layout: two columns (on below, off to the left), six rows");
  ok(near(173200 - 168975, 4225) && (4225 / 173200 * 100).toFixed(1) === "2.4", "root gap $4,225, 2.4%");

  // ---------------- step 5: the mixed-integer program
  const mm = M.build(D, { onoff: true }), mr = solve(mm), milp = M.read(D, { onoff: true }, mr);
  const z = M.size(mm);
  ok(z.vars === 264 && z.rows === 264 && z.switches === 48, `MILP size: 264 decisions, 264 rules, 48 switches (${z.vars}, ${z.rows}, ${z.switches})`);
  ok(mr.status === "optimal" && mr.kind === "milp" && near(mr.objective, 173200) && mr.duals === null && mr.reducedCosts === null, "MILP: optimal $173,200, no duals");
  ok(mr.mipGap != null && mr.mipGap <= 1e-9, "MILP: gap 0% (" + mr.mipGap + ")");
  ok(arr(milp.hours.map(h => h.p.pk).slice(17, 23), [30, 30, 55, 80, 45, 30]) && milp.hours.every(h => (h.t >= 17 && h.t <= 22) === (h.u.pk === 1)), "MILP: peaker on 17:00–22:00 at 30, 30, 55, 80, 45, 30 MW");
  ok(milp.hours.every(h => h.u.cc === 1) && near(milp.tot.starts.pk, 1) && near(milp.tot.starts.cc, 0), "MILP: CC on all day, one peaker start");
  ok(near(milp.tot.shed, 0), "MILP: nothing unserved");
  ok(arr(milp.hours.map(h => h.u.pk), D.day.demand.map((_, t) => T.inc.u["u_pk_" + t])), "MILP = the tree's best plan");

  // ---------------- step 6: the staircase at 23:00
  const stair = []; for (let x = 0; x <= LS.stair.max; x++) stair.push(M.r6(solve(M.build(D, { onoff: true, add: { hour: LS.stair.hour, mw: x } })).objective - mr.objective));
  ok(arr(stair, [0, 40, 80, 120, 160, 200, 2340, 2380, 2420, 2460, 2500]), "staircase at 23:00 " + stair);
  ok(near(stair[6] - stair[5], 2140) && near(stair[5] - stair[4], 40) && near(stair[7] - stair[6], 40), "the 5th MWh $40, the 6th $2,140, the 7th $40");
  const s5 = M.read(D, { onoff: true }, solve(M.build(D, { onoff: true, add: { hour: 23, mw: 5 } }))), s6 = M.read(D, { onoff: true }, solve(M.build(D, { onoff: true, add: { hour: 23, mw: 6 } })));
  ok(s5.hours[23].u.pk === 0 && near(s5.hours[23].p.cc, 150) && s6.hours[23].u.pk === 1 && near(s6.hours[23].p.pk, 30) && near(s6.hours[23].p.cc, 121), "6th MWh: the peaker stays on at 30 MW, the CC falls from 150 to 121 MW");
  ok(near(F.pk.noload + 30 * F.pk.cost - 29 * F.cc.cost, 2140), "6th MWh: $300 + 30 × $100 − 29 × $40 = $2,140");

  // ---------------- step 7: conditional prices
  const fx = core.fixedModel(mm, mr.values), fr = solve(fx.model), fixed = M.read(D, { onoff: true }, fr);
  ok(fr.kind === "lp" && fr.ok && near(fr.objective, 173200), "fixed LP: $173,200");
  const P = fixed.hours.map(h => h.price);
  ok(P.every((p, t) => (t >= 19 && t <= 21 ? near(p, 100) : near(p, 40))), "conditional prices: $100 from 19:00 to 21:00, $40 otherwise " + P);
  ok(uniqueness(fx.model) < 1e-6, "fixed LP: unique solution");
  for (let t = 0; t < 24; t++) {
    const bump = d => { const m = JSON.parse(JSON.stringify(fx.model, (k, v) => (v === Infinity ? "Inf" : v)), (k, v) => (v === "Inf" ? Infinity : v)); const c = m.constraints.find(c => c.name === "bal_" + t); c.lb += d; c.ub += d; return solve(m).objective; };
    const up = (bump(0.1) - fr.objective) / 0.1, dn = (fr.objective - bump(-0.1)) / 0.1;
    ok(near(up, P[t], 1e-4) && near(dn, P[t], 1e-4), `fixed LP ${t}:00: step up ${up} = step down ${dn} = dual ${P[t]} (no corner)`);
    if (LS.check.indexOf(t) >= 0) ok(near((bump(1) - fr.objective), P[t], 1e-6), `+1 MWh at ${t}:00 with the switches fixed: +$${P[t]}`);
  }
  ok(JSON.stringify(LS.check) === "[18,20]" && near(P[18], 40) && near(P[20], 100), "the page checks 18:00 ($40) and 20:00 ($100)");
  const atMin = milp.hours.filter(h => h.u.pk === 1 && near(h.p.pk, F.pk.min)).map(h => h.t);
  ok(JSON.stringify(atMin) === "[17,18,22]", "the peaker runs at its minimum at 17:00, 18:00 and 22:00");

  // ---------------- step 8: settlement and uplift
  const st = M.settle(D, milp, P);
  ok(near(st.pk.revenue, 21600) && near(st.pk.running, 27000) && near(st.pk.noload, 1800) && near(st.pk.startup, 2000) && near(st.pk.cost, 30800), "peaker: paid $21,600; running $27,000, no-load $1,800, start-up $2,000");
  ok(near(st.pk.uplift, 9200) && near(st.pk.energyShort, 5400) && JSON.stringify(st.pk.shortHours) === "[17,18,22]" && st.pk.hoursOn === 6, "peaker: short $9,200 = $2,000 + $1,800 + $5,400 (17:00, 18:00, 22:00)");
  ok(near(st.cc.profit, 19800) && near(st.cc.uplift, 0) && near(st.cc.noload, 7200), "CC: $19,800 above its costs, no uplift");
  ok(near(90 * 40 + 180 * 100, st.pk.revenue) && near(st.pk.mwh, 270), "peaker paid: 90 MWh at $40, 180 MWh at $100 (270 MWh)");
  // quiz: the peaker's start-up cost doubled
  const D2 = JSON.parse(JSON.stringify(D)); D2.fleet.pk.startup = 4000;
  const m2 = M.build(D2, { onoff: true }), r2 = solve(m2), d2 = M.read(D2, { onoff: true }, r2), f2 = solve(core.fixedModel(m2, r2.values).model), p2 = M.read(D2, { onoff: true }, f2).hours.map(h => h.price);
  ok(arr(d2.hours.map(h => h.u.pk), milp.hours.map(h => h.u.pk)) && near(p2[20], 100) && arr(p2, P), "quiz: start-up $4,000, same switches, same prices ($100 at 20:00)");
  ok(near(M.settle(D2, d2, p2).pk.uplift, 11200), "quiz: uplift $11,200");
  ok(near(T.nodes[8].bound, 171415), "quiz: the node with bound $171,415 exists");

  // ---------------- the reference block (explain layer, fallback)
  ok(R.lp === 159500 && R.lpFocus === 5 && R.lpHigh === "17:00–22:00" && R.relax === 168975 && R.relaxFocus === "5%" && R.relaxFocusSw === "0.05" && R.relaxStarts === "0.8", "reference: dispatch LP and relaxation");
  ok(R.milp === 173200 && R.peakerOn === "17:00–22:00" && arr(R.condPrices, P) && R.condHigh === "19:00–21:00" && R.uplift === 9200, "reference: MILP, prices, uplift");
  ok(arr(R.stair, stair) && R.settle.pk.revenue === 21600 && R.settle.pk.cost === 30800 && R.settle.cc.profit === 19800, "reference: staircase and settlement");
  ok(R.tree.lps === 11 && R.tree.branchings === 5 && R.tree.rootFrac === 6 && arr(R.tree.nodes.map(n => n.bound), wantB) && R.tree.first.t === 19 && R.tree.first.x === 0.55 && R.tree.last.t === 17, "reference: tree");
  ok(R.tree.firstOff.bound === 328920 && R.tree.firstOff.shed === 55 && R.tree.firstPlan === 185900 && R.tree.firstPlanShed === 5 && R.tree.prunedByFirst === 4, "reference: tree details");
  ok(R.focus === LS.focus && LS.focus === 17, "reference: focus hour 17:00");

  // ---------------- the page states these numbers
  ["$159,500", "$168,975", "$173,200", "5 MW at 17:00, below its 30 MW minimum", "5% on at 17:00", "5 branchings and 11 LPs", "$40, and $100 from 19:00 to 21:00",
   "$9,200 short of its costs", "0.05 at 17:00, 0.2 at 18:00, 0.55 at 19:00, 0.8 at 20:00, 0.45 at 21:00 and 0.2 at 22:00", "fully on from 17:00 to 22:00",
   "each of the first 5 MWh costs $40, the 6th $2,140", "| Root | nothing | \\$168,975 |", "| 2 | on at 19:00 | \\$169,510 |", "| 4 | and 21:00 | \\$169,735 |",
   "| 6 | and 18:00 | \\$170,575 |", "| 8 | and 22:00 | \\$171,415 |", "| 10 | and 17:00: every switch whole | \\$173,200 |", "The root gap was \\$4,225, or 2.4% of the best plan",
   "| Each MWh costs | \\$40 | \\$2,140 | \\$40 |", "\\$300 no-load plus 30 MWh at \\$100, less 29 MWh of combined-cycle output at \\$40",
   "| Paid: 90 MWh at \\$40, 180 MWh at \\$100 | \\$21,600 |", "| Running cost: 270 MWh at \\$100 | \\$27,000 |", "| No-load: 6 hours at \\$300 | \\$1,800 |",
   "| One start | \\$2,000 |", "| Short: the uplift | \\$9,200 |", "on only at 19:00 and 20:00 and leaves 90 MWh unserved", "paid $21,600 against $30,800 of costs",
   "bound of $171,415", "start-up cost doubles to $4,000", "the uplift grows to $11,200", "$168,975 ≤ $173,200", "$40, then $2,140", "0.01%", "`mip_rel_gap = 0.0001`",
   "the $3,000/MWh unserved-energy penalty", "29 July 2025", "p. 55", "p. 37", "P 7", "Peaker on 17:00 to 22:00"].forEach(s => has(s));
  ok(R.settle.pk.running === 27000 && 270 * 100 === 27000 && 6 * 300 === 1800, "page tables' arithmetic");
  // wording guards: no MILP duals presented as prices, prices labelled conditional
  ["MILP prices", "mixed-integer program's prices", "shadow prices of the mixed-integer", "always optimal"].forEach(s => ok(PAGE.indexOf(s) < 0 && JS.indexOf(s) < 0, "page and script do not say " + JSON.stringify(s)));
  ok(/conditional on this commitment/.test(JS) && /Conditional on the commitment/.test(JS), "the step-7 prices are labelled conditional on the commitment");
  ok(/HiGHS returns no duals: a mixed-integer program has no \[\[shadow-price\|shadow prices\]\] to read/.test(JS), "step 5 says the MILP returns no duals");
  // fixed numbers in the step cards' script text, each backed by a check above
  [["Peaker, \" + hh(L.edit[0])", JSON.stringify(LS.edit) === "[15,16,17,18,19,20,21,22,23]"], ["2²⁴ on/off patterns", true], ["minimum output", F.pk.min === 30]].forEach(([s, c]) => ok(JS.indexOf(s) >= 0 && c, "step text " + JSON.stringify(s)));
  // sidecar glossary and notebook
  ["lp-relaxation", "lower-bound", "branch-and-bound", "minimum-stable-output", "start-up-cost", "no-load-cost", "minimum-run-time", "conditional-price", "uplift"].forEach(id => ok(SIDE.indexOf("id: " + id) >= 0, "sidecar defines " + id));
  ok(SIDE.indexOf("portion of the cost") < 0, "sidecar: uplift definition in our own words");
  ["159500", "168975", "173200", "185900", "9200", "2140", "430300", "[168975, 169510, 169735, 170575, 171415, 173200]"].forEach(s => ok(NB.indexOf(s) >= 0, "notebook asserts " + s));

  console.log(`${checks - fails} of ${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
