// test_e4-engine.js — Node tests for engine E4 (assets/learn/components/engine-e4.js, LX.E4) with the vendored HiGHS, the
// solver core the pages run in a Web Worker (wave W6, 2026-11-07). What it checks:
//   - the data: the fictional line is prairieland.json's; the stress hours of the reserve rule recomputed from
//     town_year.json by prairieland.json's hour rule (written by --write); the fleet online in each model year equals
//     prairieland.json's capacityByYearMW; the slices' hours sum to 8,760; the 2025 electricity shares of useful energy
//     and the levers' ranges follow prairieland.json's electrification rule
//   - G-COST: every cost is a plan field inside prairieland.json's range, the same in every period (only a shock changes
//     one, for its year); the LP's cost per MW built does not depend on how much is built; the generic firm option has
//     no location (one national build per period, shared by demand) and the generic build limit
//   - the plan links: the schema is valid; defaults and presets are valid and round-trip
//   - the model as built, for the presets: every region-slice balances; plants within their availability; wind and solar
//     within the hour's output; batteries cyclic within each representative day, the scarce-wind week within its store;
//     flows within the links; the fuel rows; CO2 = fuels x IPCC factors; the cumulative budget with its weights; imports
//     within the cap; the stress-hour rule; kept-open capacity never rises
//   - money: the present value from each year's cost equals the LP's economic objective (penalties and the tie rule left
//     out); a plant built late pays only up to 2050 (residual value)
//   - prices and duals only from the LP (§9.2): the budget's dual equals the cost slope when the budget moves 20 Mt; a
//     region's marginal cost equals the slope of one more MW in that slice
//   - ties (W2 review finding 2): every national number of the view is the same with the tie costs x10 and x0.1; built
//     GW by technology and period, CO2 per year and imports per year: the min and max over the optimal face agree
//   - foresight: decade by decade gives each window its share of the budget left; its pathway costs at least the
//     perfect-foresight one (which could have chosen it)
//   - shocks: the plan's decisions up to the shock's year are kept; earlier years unchanged; each shock moves what it
//     names (LNG and gas prices, hydro and summer capacity, battery capital, demand)
//   - the full-year check: its hourly balances (recomputed on a week), CO2 within 10% for the default plan; with no
//     peak-hour rule, demand goes unserved in the full year
//   - the library (data/e4-library.json): every preset, perfect and decade by decade; entries equal fresh runs byte for
//     byte (the default and one more by default, every entry with --library), written exactly as --write writes it
//   - limits first (SB4 and M13 reviews, 2026-11-07): the reviewer's 2,800 Mt plan without the firm option meets its budget
//     (the hard-limit LP's cost and a dual above the $1,000 penalty); the straight line to zero is out of reach, and the
//     closest pathway is the least-CO2 plan that serves every slice and stress hour; an out-of-reach window has no duals
//   - the reviews' other engine findings: a unit retired in an earlier window stays at 0 (no reopening); a drought derates
//     the summer stress hour as it derates the summer slices; the mineral restriction keeps decisions through the year
//     before it and never reprices plants already decided; the stress shortfall is the worse hour's, never the sum of the
//     two; the budget's price in a model year is dual x w / D (the gas row's dual says the same); the plan's rows keep each
//     field's precision (5.5%); a plan without the peak-hour rule has rule null; e4-pathways.json never puts a nuclear term
//     beside a cost in one string; the done words say what decade by decade does not prove
//   - failure states: solve never rejects; a solver that errors gives "error"; a time limit is reported as such
//   - scope: no reactor technology named in the engine or its data; the firm option is never called nuclear
// --write: recomputes the stress hours into e4-pathways.json and rebuilds the library (about two minutes).
// Usage (from the site folder):  node _tests/learn/test_e4-engine.js [--write] [--library]
"use strict";
const fs = require("fs");
const X = require("./e4_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const WRITE = process.argv.includes("--write"), FULLLIB = process.argv.includes("--library");

(async () => {
  let H = await X.load();
  const { E4, PL, L, J, SS, solveSync, solver } = H;
  // ---------------- the stress hours (written by --write, from town_year.json)
  const y25 = J("town_year.json"), y24 = J("m03-capacity-expansion-2024.json");
  const stress = E4.stressHours(H.P, y25);
  if (WRITE) { const d = J("e4-pathways.json"); d.stress = stress; fs.writeFileSync(L("data/e4-pathways.json"), JSON.stringify(d, null, 1) + "\n"); H = await X.load(); }
  const { P, S, cfg } = H;
  ok(JSON.stringify(cfg.stress) === JSON.stringify(stress), "the stress hours in e4-pathways.json equal a fresh computation from town_year.json (--write after a change)");
  ok(stress[0].when === "20 Aug 2025, 19:00" && stress[0].netLoad2025GW === PL.timeSlices.extremes.peakNetLoadDay.netLoadGW, "the peak net-load hour is prairieland.json's (20 Aug 2025, 19:00; " + stress[0].netLoad2025GW + " GW)");
  ok(stress[1].i >= 0 && stress[1].i < 7 * 24 && /Jan 2025/.test(stress[1].when), "the winter stress hour lies inside the scarce-wind week (" + stress[1].when + ")");

  // ---------------- data
  ok(P.line === PL.about.line && cfg.about.line === PL.about.line && P.line === "Prairieland is fictional; its numbers are illustrative.", "the fictional line, word for word");
  ok(E4.sum(P.S.map(s => s.h)) === 8760, "the twelve slices' hours sum to 8,760");
  ok(P.days.length === 6 && P.days.every(d => P.S[d.d].h + P.S[d.n].h === d.days * 24) && P.days.filter(d => d.week).length === 1, "six representative days of day and night slices, one the scarce-wind week");
  const cb = PL.fleet.capacityByYearMW;
  P.Y.forEach(y => ["coal", "gasCC", "gasCT", "oil", "nuclear", "hydro", "wind", "solar", "battery"].forEach(t => {
    const mine = E4.sum(P.R.map((R, r) => P.exist(t, r, y)));
    ok(mine === cb[String(y)][t], "online in " + y + ", " + t + ": " + mine + " MW = capacityByYearMW " + cb[String(y)][t]);
  }));
  // the electrification rule: 2025's shares, the ranges (at most 15 points a period, 100%, industry 60%)
  const FB = PL.balance.final, EF = PL.balance.useful.efficiency;
  ["buildings", "transport", "industry"].forEach(k => {
    let u = 0; for (const c in FB[k]) u += FB[k][c] * EF[k][c];
    const s0 = FB[k].el * EF[k].el / u, r = P.elRange[k];
    ok(near(P.sigma0[k], s0, 1e-12) && r.lo === Math.floor(s0 * 100) && r.hi === Math.min(100, Math.floor(s0 * 100 + 75), PL.demand.electrification[k].maxShare2050 ? 60 : 100), k + ": 2025 share " + (100 * s0).toFixed(1) + "%, range " + r.lo + "-" + r.hi + "%");
  });
  ok(near(E4.sum(Object.values(PL.balance.useful.bySector)), PL.nation.usefulPJ, 0.2), "useful energy by sector adds to the nation's");

  // ---------------- G-COST
  const def = E4.defaults(S), T = PL.costs.technologies, F = PL.costs.fuels;
  const fld = id => S.fields.find(f => f.id === id);
  [["cw", T.wind.capex], ["cs", T.solar.capex], ["cb", T.battery.capex], ["cc", T.gasCC.capex], ["ct", T.gasCT.capex], ["cf", T.firm.capex], ["cx", PL.transmission.expansion.costPerMWkm],
   ["pg", F.gas], ["pl", F.lng], ["pc", F.coal], ["po", F.oil], ["dr", PL.periods.discount]].forEach(([id, r]) => {
    const f = fld(id); ok(f.min === r.lo && f.max === r.hi && f.def === r.def, "G-COST: " + id + " is the learner-set range from prairieland.json (" + r.lo + "-" + r.hi + ", default " + r.def + ")");
  });
  ok(fld("bud").min === PL.carbon.budget.lo && fld("bud").max === PL.carbon.budget.hi && fld("bud").def === cfg.levers.budget.def, "the budget's range is prairieland.json's; the default plan's budget is E4's (" + cfg.levers.budget.def + " Mt)");
  const S0 = E4.sysOf(def, P);
  ok(S0.capex.every(c => JSON.stringify(c) === JSON.stringify(S0.capex[0])) && S0.price.every(c => JSON.stringify(c) === JSON.stringify(S0.price[0])), "G-COST: the same costs and fuel prices in every period");
  const m0 = E4.build(P, S0), byName = {}; m0.variables.forEach(v => { byName[v.name] = v; });
  ok(byName.n_firm0 && !Object.keys(byName).some(n => /^n_\dfirm/.test(n)) && byName.n_firm0.ub === PL.costs.buildLimits.gwPerRegionPerPeriod.firm * 1000 * 5, "the firm option is one national build per period (no location), within the generic limit for the five regions (10 GW)");
  ok(m0.constraints.every(c => !/^n_|^a_/.test(c.name)), "no row prices a build by its quantity (constant cost per MW: the cost sits on the variable)");
  ["wind", "solar", "battery", "gasCC", "gasCT"].forEach(t => ok(byName["n_0" + t + "0"].ub === PL.costs.buildLimits.gwPerRegionPerPeriod[t] * 1000, "generic build limit for " + t + ": " + PL.costs.buildLimits.gwPerRegionPerPeriod[t] + " GW a region a period"));

  // ---------------- plan links
  let schemaOk = true; try { SS.checkSchema(S); } catch (e) { schemaOk = false; console.log(e.message); }
  ok(schemaOk, "the plan's schema is valid");
  ok(SS.validate(S, def).length === 0, "the defaults are a valid plan");
  E4.presetsOf(P).forEach(pr => { const st = E4.withPreset(def, pr); ok(SS.validate(S, st).length === 0, "preset " + pr.id + " is a valid plan"); const dec = SS.decode(S, SS.encode(S, st)); ok(dec.status === "ok" && SS.same(S, dec.state, st), "preset " + pr.id + " round-trips its link"); });

  // ---------------- the model as built
  const val = (x, n) => x[n] || 0;
  async function run(st, o) { const r = await E4.solve(st, P, Object.assign({ solver, timeLimit: 120 }, o || {})); return r; }
  for (const pr of E4.presetsOf(P)) {
    const st = E4.withPreset(def, pr), Sx = E4.sysOf(st, P), m = E4.build(P, Sx), r = solveSync(m);
    ok(r.status === "optimal", pr.id + ": optimal");
    const x = r.values;
    // each balance row: its terms sum to the load
    let worst = 0;
    m.constraints.filter(c => /^bal_/.test(c.name)).forEach(c => { const t = c.terms.reduce((a, q) => a + val(x, q[0]) * q[1], 0); worst = Math.max(worst, Math.abs(t - c.eq)); });
    ok(worst < 1e-3, pr.id + ": every region-slice balances (worst " + worst.toExponential(1) + " MW)");
    // every row holds
    let viol = 0;
    m.constraints.forEach(c => { const t = c.terms.reduce((a, q) => a + val(x, q[0]) * q[1], 0); if (c.eq != null) viol = Math.max(viol, Math.abs(t - c.eq)); if (c.ub != null) viol = Math.max(viol, t - c.ub); if (c.lb != null) viol = Math.max(viol, c.lb - t); });
    ok(viol < 1e-3, pr.id + ": every row holds (worst " + viol.toExponential(1) + ")");
    const raw = E4.read(P, Sx, m, r), R = E4.summarize(st, P, Sx, raw);
    // CO2 from the fuels and the IPCC factors; the cumulative budget
    P.Y.forEach((y, p) => { const f = raw.per[p].fuel, c = ((f.crudeDom + f.crudeImp) * 73.3 + (f.gasDom + f.lng) * 56.1 + f.coal * 94.6) / 1000; ok(near(c, raw.per[p].co2, 1e-6), pr.id + " " + y + ": CO2 = fuels x IPCC factors (" + c.toFixed(2) + " Mt)"); });
    ok(near(R.cum, 2 * 214.9 + E4.sum(P.Y.map((y, p) => [5, 5, 5, 5, 3][p] * R.co2[p])), 1e-6) && R.cum <= st.bud + raw.over + 1e-4, pr.id + ": cumulative CO2 = 2 x 214.9 + 5, 5, 5, 5, 3 x each model year's, within the budget plus any overshoot");
    P.Y.forEach((y, p) => ok(R.importShare[p] <= Sx.cap + raw.per[p].importOver / raw.per[p].primary + 1e-6, pr.id + " " + y + ": imports within the cap (" + (100 * R.importShare[p]).toFixed(1) + "%)"));
    // the money: present value from each year's cost = the LP's economic objective
    const econ = m.variables.reduce((a, v) => a + val(x, v.name) * (m.meta.cat[v.name] === "penalty" ? 0 : v.cost - (m.meta.tieC[v.name] || 0)), 0);
    ok(near(R.pv.total, econ, 1e-3 * Math.abs(econ) + 1), pr.id + ": the present value of each year's cost ($" + (R.pv.total / 1000).toFixed(1) + "bn) equals the LP's economic objective ($" + (econ / 1000).toFixed(1) + "bn)");
    // kept-open capacity never rises
    ok(P.units.every(u => P.Y.every((y, p) => p === 0 || !raw.k[u.j][p] || raw.k[u.j][p] <= raw.k[u.j][p - 1] + 1e-6 || !P.on(u, P.Y[p - 1]))), pr.id + ": a plant retired early stays retired");
  }
  // residual value: a wind farm built in 2045 pays 2041-2050 only (two model years of five, each discounted)
  {
    const Sx = E4.sysOf(def, P), lifeW = T.wind.life, ann = def.cw * E4.crf(def.dr / 100, lifeW) + T.wind.fom, m = E4.build(P, Sx);
    const v45 = m.variables.find(v => v.name === "n_0wind3"), v30 = m.variables.find(v => v.name === "n_0wind0");
    ok(near(v45.cost, ann * (Sx.D[3] + Sx.D[4]) / 1000, 1e-9) && near(v30.cost, ann * E4.sum(Sx.D) / 1000, 1e-9), "residual value: a wind farm built in 2045 pays for 2041-2050 only; one built in 2030 for all 25 years");
    const vb = m.variables.find(v => v.name === "n_0battery1"), annB = def.cb * E4.crf(def.dr / 100, 15) + T.battery.fom;
    ok(near(vb.cost, annB * (Sx.D[1] + Sx.D[2] + Sx.D[3]) / 1000, 1e-9), "vintages: a battery built in 2035 runs (and pays) in 2035, 2040 and 2045, its 15-year life");
  }

  // ---------------- duals as cost slopes
  {
    const Sx = E4.sysOf(def, P), m = E4.build(P, Sx), r = solveSync(m), dual = r.duals.budget;
    const at = b => { const s2 = E4.sysOf(Object.assign({}, def, { bud: b }), P); return solveSync(E4.build(P, s2)).objective; };
    const slope = (at(def.bud + 10) - at(def.bud - 10)) / 20;
    ok(dual < 0 && near(slope, dual, 0.02 * Math.abs(dual) + 0.05), "the budget's dual ($" + (-dual).toFixed(2) + "/t, present value) equals the cost slope over ±10 Mt ($" + (-slope).toFixed(2) + "/t)");
    const R = E4.summarize(def, P, Sx, E4.read(P, Sx, m, r)), d = r.duals["bal_3_0_2"], row = m.constraints.find(c => c.name === "bal_3_0_2");
    const m2 = JSON.parse(JSON.stringify(m)); const r2c = m2.constraints.find(c => c.name === "bal_3_0_2"); r2c.eq += 1; const up = solveSync(m2).objective;
    const m3 = JSON.parse(JSON.stringify(m)); const r3c = m3.constraints.find(c => c.name === "bal_3_0_2"); r3c.eq -= 1; const dn = solveSync(m3).objective;
    ok(row && near((up - dn) / 2, d, 0.02 * Math.abs(d) + 1e-4), "Capital Valley's marginal cost in winter days of 2040 equals the slope of 1 MW more load ($" + (d * 1e6 / (P.S[0].h * Sx.D[2])).toFixed(1) + "/MWh)");
    ok(R.price[2][3] > 0 && R.price[2][3] < 300, "Capital Valley's load-weighted marginal cost in 2040: about $" + R.price[2][3].toFixed(1) + "/MWh");
  }

  // ---------------- ties: the national numbers with the tie costs x10 and x0.1, and the optimal face
  {
    const V1 = E4.view((await run(def)).results.plan, P);
    const nat = V => JSON.stringify({ cum: V.cum, co2: V.co2, imp: V.imp, built: V.built, capGW: V.capGW, clean: V.clean, early: V.early });
    for (const k of [2, 0.1]) {
      const V2 = E4.view((await run(def, { build: { tie: k } })).results.plan, P);
      const a = JSON.parse(nat(V1)), b = JSON.parse(nat(V2));
      let d = 0; const walk = (u, w) => { if (typeof u === "number") d = Math.max(d, Math.abs(u - w)); else if (u && typeof u === "object") for (const q in u) walk(u[q], w[q]); };
      walk(a, b);
      ok(d <= 1 && Math.abs(V1.pv.total - V2.pv.total) <= 5, "ties x" + k + ": every national number the same within the view's rounding (largest difference " + d + " GW, Mt or share; cost " + V1.pv.total + " against " + V2.pv.total + " $M)");
    }
    const Sx = E4.sysOf(def, P), m = E4.build(P, Sx), r = solveSync(m);
    const checksF = [];
    ["wind", "solar", "gasCC", "gasCT", "firm"].forEach(t => [0, 2, 4].forEach(q => checksF.push([t + " built " + P.Y[q], t === "firm" ? [["n_firm" + q, 1]] : [0, 1, 2, 3, 4].map(rr => ["n_" + rr + t + q, 1])])));
    [0, 4].forEach(p => checksF.push(["CO2 " + P.Y[p], m.meta.CO2[p]]));
    [0, 4].forEach(p => checksF.push(["imports " + P.Y[p], m.meta.IMP[p]]));
    checksF.forEach(([lab, terms]) => {
      const t = {}; terms.forEach(q => { t[q[0]] = (t[q[0]] || 0) + q[1]; });
      const lo = X.face(m, r, t, "min", solveSync, 0.001), hi = X.face(m, r, t, "max", solveSync, 0.001), tol = /^CO2/.test(lab) ? 0.05 : /^imports/.test(lab) ? 1 : 10;
      ok(lo != null && hi != null && hi - lo <= tol, "the optimal face (cost within $1,000 of $" + (r.objective / 1000).toFixed(0) + " billion): " + lab + " from " + (lo == null ? "?" : lo.toFixed(1)) + " to " + (hi == null ? "?" : hi.toFixed(1)) + (/^CO2/.test(lab) ? " Mt" : /^imports/.test(lab) ? " PJ" : " MW"));
    });
  }

  // ---------------- foresight
  {
    const per = await run(def), myo = await run(Object.assign({}, def, { fs: "myopic" }));
    ok(per.ok && myo.ok, "perfect and decade by decade both optimal");
    const Vp = E4.view(per.results.plan, P), Vm = E4.view(myo.results.plan, P);
    ok(Vm.pv.total >= Vp.pv.total - 1, "decade by decade costs at least perfect foresight ($" + (Vm.pv.total / 1000).toFixed(1) + "bn against $" + (Vp.pv.total / 1000).toFixed(1) + "bn): perfect foresight could have chosen its pathway");
    ok(E4.windowsOf({ fs: "myopic" }, 0).join("|") === "0,1|2,3|4" && E4.windowsOf({ fs: "perfect" }, 0).join("|") === "0,1,2,3,4", "windows: 2030-2035, 2040-2045, 2050; perfect foresight one window");
    const w = E4.sysOf(def, P).w, left = def.bud - 2 * 214.9, w1 = (w[0] + w[1]) / E4.sum(w);
    ok(near(myo.results.plan.raw.windows.length, 3) && Vm.cum <= def.bud + 0.5 + Vm.over, "decade by decade: three windows; the pathway within the budget (" + Vm.cum + " Mt)");
    const co2w1 = w[0] * Vm.co2[0] + w[1] * Vm.co2[1];
    ok(co2w1 <= left * w1 + 0.6, "the first window emits at most its share of the budget left (" + co2w1.toFixed(0) + " of " + (left * w1).toFixed(0) + " Mt)");
  }

  // ---------------- shocks
  {
    const base = await run(def);
    for (const k of E4.c4Shocks(P)) {
      const r = await run(Object.assign({}, def, { sh: k }));
      ok(r.ok && r.results.shock && r.results.shock.key === k, k + ": re-planned");
      const Ss = E4.sysOf(def, P, { shock: k }), sp = Ss.shockP, a = base.results.plan.raw, b = r.results.shock.raw;
      let same = true;
      const kt = E4.keptThrough(P, k, sp);
      ok(k === "mineralBan" ? kt === sp - 1 : kt === sp, k + ": decisions kept through " + P.Y[kt] + (k === "mineralBan" ? " (the year before: its batteries were not yet bought)" : " (the shock's year)"));
      same = true;
      for (let q = 0; q <= kt; q++) { P.R.forEach((R, rr) => E4.NEW.forEach(t => { if (Math.abs(a.n[rr][t][q] - b.n[rr][t][q]) > 1e-6) same = false; })); if (Math.abs(a.firm[q] - b.firm[q]) > 1e-6) same = false; P.units.forEach(u => { if (Math.abs(a.k[u.j][q] - b.k[u.j][q]) > 1e-6) same = false; }); }
      ok(same, k + ": builds and retirements up to " + P.Y[kt] + " stay as planned");
      ok(Array.from({ length: sp }, (x, p) => p).every(p => b.per[p] === a.per[p] || JSON.stringify(b.per[p]) === JSON.stringify(a.per[p])), k + ": the years before the shock are the plan's");
      const q = P.shocks[k].params;
      if (k === "gasSpike") ok(near(Ss.price[sp].lng, def.pl * q.lngX) && near(Ss.price[sp].gas, def.pg * q.gasX) && Ss.price[sp + 1].lng === def.pl, k + ": LNG x" + q.lngX + " and gas x" + q.gasX + " in " + Ss.shockYear + " only");
      if (k === "drought") ok(Ss.hydroX[sp] === q.hydroX && Ss.summerX[sp] === q.thermalSummerX && Ss.hydroX[sp + 1] === 1, k + ": hydro x" + q.hydroX + ", steam plants x" + q.thermalSummerX + " in summer, " + Ss.shockYear + " only");
      if (k === "mineralBan") ok(near(Ss.capex[sp].battery, def.cb * q.batteryCapexX) && Ss.capex[sp + 1].battery === def.cb, k + ": new batteries x" + q.batteryCapexX + " in " + Ss.shockYear);
      if (k === "demandSurprise") ok(Ss.elPJ.every((e, p) => near(E4.sum(e), E4.sum(E4.sysOf(def, P).elPJ[p]) * (P.Y[p] >= q.from ? q.elX : 1), 1e-9)), k + ": electricity x" + q.elX + " from " + q.from);
    }
  }

  // ---------------- limits first, and the other engine findings of the reviews (2026-11-07)
  {
    // SB4 review 1: the reviewer's plan (buildings, transport, industry at 100%, 78%, 60%; no firm option; 2,800 Mt)
    const st = Object.assign({}, def, { eb: 100, et: 78, ei: 60, fm: 0, bud: 2800 }), r = await run(st), V = E4.view(r.results.plan, P);
    const Sx = E4.sysOf(st, P), hard = solveSync(E4.build(P, Sx, { noPenalty: true }));
    const raw = E4.read(P, Sx, E4.build(P, Sx, { noPenalty: true }), hard), Rh = E4.summarize(st, P, Sx, raw);
    ok(r.ok && V.over === 0 && V.cum <= 2800 && hard.status === "optimal" && Math.abs(V.pv.total - Math.round(Rh.pv.total)) <= 1 && V.carbonValue[0] > cfg.penalties.budgetPerT && V.reach,
      "limits first: the reviewer's 2,800 Mt plan meets its budget (" + V.cum + " Mt, $" + (V.pv.total / 1000).toFixed(3) + " bn = the hard-limit LP's; dual $" + V.carbonValue[0] + " a tonne, above the $1,000 penalty)");
    ok(r.results.models[0].stages === 3 && /least-cost pathway/.test(r.message) && !/out of reach/.test(r.message), "it took the two extra LPs, and the status line does not call it out of reach");
    // M13 review 2: the straight line to zero at the most electrification: out of reach; the closest is the least-CO2 plan
    const st2 = Object.assign({}, E4.withPreset(def, cfg.presets.find(x => x.id === "deep")), { bud: PL.carbon.budget.presets.find(x => x.key === "line2050").mt });
    const r2 = await run(st2), V2 = E4.view(r2.results.plan, P), S2 = E4.sysOf(st2, P), m2 = E4.build(P, S2);
    const min = { sense: "min", variables: m2.variables.map(v => Object.assign({}, v, { cost: 0, ub: /^(us|ss|oimp)_/.test(v.name) ? 0 : v.ub })), constraints: m2.constraints, objective: { terms: m2.meta.CO2 ? [].concat(...S2.only.map(p => m2.meta.CO2[p].map(x => [x[0], x[1] * S2.w[p]]))) : [] } };
    const rm = solveSync(min), least = rm.objective + S2.w0 * P.carbon.base2025Mt;
    ok(r2.ok && V2.over > 0.5 && !V2.reach && V2.carbonValue[0] === null && Math.abs(V2.cum - least) <= 0.5 && /out of reach/.test(r2.message),
      "the straight line to zero is out of reach: the closest pathway emits " + V2.cum + " Mt, the least any plan serving every slice and stress hour emits (" + least.toFixed(1) + " Mt); no dual reported");
    ok(Math.round(V2.cum / 100) * 100 === 2700 && E4.GAP[0].indexOf("about 2,700 Mt") >= 0, "the pages' 'about 2,700 Mt' floor is this run's (" + V2.cum + " Mt)");
    // an out-of-reach window has no duals; decade by decade names the window
    const r3 = await run(Object.assign({}, E4.withPreset(def, cfg.presets.find(x => x.id === "secure")), { fs: "myopic" })), V3 = E4.view(r3.results.plan, P);
    ok(V3.windowReach[0] === false && V3.carbonValue[0] === null && V3.importValue[0] === null && V3.carbonPrice[0] === null && /window 2030–2035 cannot meet its share/.test(r3.message) && /not guaranteed the cheapest/.test(r3.message),
      "security first, decade by decade: the first window cannot meet its share of the limits; its duals are null and the status line says so");
    // M13 review 4: a unit fully retired in an earlier window stays retired
    const coal = P.units.find(u => u.tech === "coal" && P.on(u, 2045)), base = solveSync(E4.build(P, E4.sysOf(def, P))), rawB = E4.read(P, E4.sysOf(def, P), E4.build(P, E4.sysOf(def, P)), base);
    const fx = E4.fixedOf(P, rawB, 1); fx.k["k_" + coal.j + "_1"] = 0; fx.k["k_" + coal.j + "_0"] = 0;
    const Sw = E4.sysOf(def, P, { only: [2, 3], fixed: fx, fixedThrough: 1, budgetLeft: 5000 }), mw = E4.build(P, Sw), rw = solveSync(mw);
    ok(rw.status === "optimal" && (rw.values["k_" + coal.j + "_2"] || 0) < 1e-6 && (rw.values["k_" + coal.j + "_3"] || 0) < 1e-6 && mw.constraints.some(c => c.name === "kr_" + coal.j + "_2" && c.ub === 0),
      "a unit fixed at 0 in 2035 (" + coal.name + ") stays at 0 in the next window, even when it would pay to reopen it");
    // C4 review 1: the drought derates the summer stress hour as the summer slices
    const Sd = E4.sysOf(def, P, { shock: "drought" }), md = E4.build(P, Sd), sp = Sd.shockP, hiS = P.stressSummer.indexOf(true), hiW = P.stressSummer.indexOf(false);
    const cc = P.units.find(u => u.tech === "gasCC" && P.on(u, P.Y[sp])), rowS = md.constraints.find(c => c.name === "st_" + hiS + "_" + cc.r + "_" + sp), rowW = md.constraints.find(c => c.name === "st_" + hiW + "_" + cc.r + "_" + sp);
    const coefS = rowS.terms.find(t => t[0] === "k_" + cc.j + "_" + sp), coefW = rowW.terms.find(t => t[0] === "k_" + cc.j + "_" + sp);
    ok(P.stressSummer[hiS] && cfg.stress[hiS].season === "summer" && coefS && Math.abs(coefS[1] - cc.av * P.shocks.drought.params.thermalSummerX) < 1e-12 && Math.abs(coefW[1] - cc.av) < 1e-12,
      "drought: " + cc.name + " counts " + coefS[1].toFixed(3) + " of its MW at the summer stress hour (availability x " + P.shocks.drought.params.thermalSummerX + "), " + coefW[1] + " at the winter hour");
    // SB4 review 2: the mineral restriction never reprices plants already decided. The reviewer's plan (central without
    // the firm option, decade by decade) planned batteries for 2035; under the shock their purchase is re-decided at the
    // higher price (the 2035 builds are variables of the re-plan), and the years before keep the plan's cost exactly
    const myo = Object.assign({}, def, { fs: "myopic", fm: 0 }), rm0 = await run(myo), rmB = await run(Object.assign({}, myo, { sh: "mineralBan" }));
    const Pl = rm0.results.plan, Sh = rmB.results.shock, b35 = E4.view(Pl, P).built.battery[1];
    const mS = E4.build(P, E4.sysOf(myo, P, { shock: "mineralBan", only: [1], fixed: E4.fixedOf(P, Pl.raw, 0), fixedThrough: 0, budgetLeft: 1e4, horizonEnd: 1 }));
    ok(b35 > 1 && mS.variables.some(v => v.name === "n_3battery1") && !mS.variables.some(v => /^n_\dbattery0$/.test(v.name)) && Math.abs(Sh.money.yearly[0].total - Pl.money.yearly[0].total) < 1e-6,
      "mineral restriction on the reviewer's plan (" + b35 + " GW of batteries planned for 2035): 2035's batteries are bought in the re-plan, at the higher price, knowing it; 2030's cost is the plan's; the re-plan costs $" + (E4.shockView(Sh, E4.view(Pl, P), P).dPV / 1000).toFixed(2) + " bn more");
    // M13 review 7: the shortfall is the worse stress hour's, regions summed within it
    const rd2 = await run(Object.assign({}, def, { sh: "demandSurprise" })), Q = rd2.results.shock, Xd = E4.shockView(Q, E4.view(rd2.results.plan, P), P), ps = E4.sysOf(def, P, { shock: "demandSurprise" }).shockP;
    const byHour = cfg.stress.map((H, hi) => E4.sum(P.R.map((R, r) => Q.raw.per[ps].stressShort[hi + "_" + r] || 0)));
    ok(Math.abs(Xd.reserveShort[ps] - Math.round(Math.max(...byHour))) <= 1 && Xd.reserveShort[ps] < E4.sum(byHour) - 1, "demand surprise in " + P.Y[ps] + ": short " + Xd.reserveShort[ps] + " MW at the worse stress hour (hours " + byHour.map(x => Math.round(x)).join(" and ") + " MW, never their sum)");
    // M13 review 1: the budget's price in model year p is dual x w_p / D_p; the gas row's dual (LNG at the margin) agrees
    const Vc = E4.view((await run(def)).results.plan, P), Sc = E4.sysOf(def, P), mc = E4.build(P, Sc), rc = solveSync(mc), rawc = E4.read(P, Sc, mc, rc);
    const fromGas = P.Y.map((y, p) => rawc.per[p].fuel.lng > 1 && Vc.imp[p] < Vc.cap - 0.01 ? (rawc.per[p].fuelValue.gas - def.pl) * 1000 / P.f.gas : null);
    ok(fromGas.every((g, p) => g == null || Math.abs(g - Vc.carbonPrice[p]) <= 0.01 * Vc.carbonPrice[p] + 0.2) && fromGas.filter(g => g != null).length >= 3 && P.Y.every((y, p) => Math.abs(Vc.carbonPrice[p] - Vc.carbonValue[0] * Sc.w[p] / Sc.D[p]) <= 0.05 * Sc.w[p] / Sc.D[p] + 0.06),
      "the budget's price by model year, dual x w / D: $" + Vc.carbonPrice.join(", $") + "; from the gas row's dual: $" + fromGas.map(g => g == null ? "-" : g.toFixed(1)).join(", $"));
    // C4 review 5: the plan's rows keep each field's precision
    const pr = E4.planRows(Object.assign({}, def, { dr: 5.5 }), P), drRow = pr.find(x => /Discount rate/.test(x[0]));
    ok(drRow[1] === "5.5%" && E4.planRows(def, P).find(x => /Discount rate/.test(x[0]))[1] === "5%", "a 5.5% discount rate is copied as 5.5% (5% as 5%)");
    // SB4 review 4 / C4 review 8: no peak-hour rule is "not tested", never "served"
    const Voff = E4.view((await run(Object.assign({}, def, { rm: "off" }))).results.plan, P);
    ok(Voff.rule === null && Vc.rule === 0.1 && Voff.reserve.every(x => x.shortMW === 0) && Voff.reserve[4].margin < 0, "without the rule the view says rule null (pages: not tested), though its stress-hour spare is " + (100 * Voff.reserve[4].margin).toFixed(1) + "% in 2050");
    // M13 review 3 / SB4 review 6: no string of e4-pathways.json puts a nuclear term beside a cost
    const strs = []; (function walk(o) { if (typeof o === "string") strs.push(o); else if (o && typeof o === "object") for (const k in o) walk(o[k]); })(cfg);
    ok(!strs.some(t => /nuclear|reactor/i.test(t) && /\$|cost|price|O&M|capital/i.test(t)) && !strs.some(t => /G-COST|G-NUC|G-GIS/.test(t)), "e4-pathways.json: no string pairs a nuclear term with a cost, and no editorial guard code");
    ok(E4.doneWords({ fs: "perfect" }, { reach: true }).indexOf("perfect foresight") >= 0 && /not guaranteed the cheapest over 2026–2050/.test(E4.doneWords({ fs: "myopic" }, { reach: true })), "the status line: least cost with perfect foresight; decade by decade, each window optimal, the whole not guaranteed");
  }

  // ---------------- the full-year check
  const H25 = E4.hourly(P, y25), H24 = E4.hourly(P, y24);
  ok(P.R.every((R, r) => near(E4.sum(H25.wind[r]) / 8760, R.res.windCF, 0.002) && near(E4.sum(H25.solar[r]) / 8760, R.res.solarCF, 0.002)), "the hourly year by the hour rule: each region's 2025 wind and solar capacity factors are prairieland.json's");
  ok(near(E4.sum(H25.demand) / 8760, 1, 1e-9) && near(E4.sum(H24.demand) / 8760, 1, 1e-9), "the hourly demand shapes average 1 (each region's yearly electricity is kept)");
  {
    const r = await run(def), R = r.results.plan, Sx = E4.sysOf(def, P);
    const c = await E4.fullYear(P, Sx, R.raw, 4, H24, { solver });
    ok(c.status === "optimal" && c.solves === 53, "the full-year check of 2050 in 2024's weather: 53 LPs, all optimal");
    ok(c.unservedMWh < 1 && Math.abs(c.co2Gap) <= 0.1, "the default plan survives in 2050, 2024 weather: nothing unserved, CO2 " + c.co2.toFixed(1) + " Mt against the slices' " + c.co2Slices.toFixed(1) + " (" + (100 * c.co2Gap).toFixed(1) + "%)");
    const off = await run(Object.assign({}, def, { rm: "off" })), c2 = await E4.fullYear(P, E4.sysOf(Object.assign({}, def, { rm: "off" }), P), off.results.plan.raw, 4, H24, { solver });
    ok(c2.unservedMWh > 1e4, "without the peak-hour rule, 2050 in 2024's weather leaves " + Math.round(c2.unservedMWh) + " MWh unserved over " + c2.unservedHours + " hours (the slices alone hid it)");
  }

  // ---------------- the library
  {
    const GRID = X.grid(E4, P, S), LPATH = L("data/e4-library.json");
    if (WRITE) {
      const plans = []; for (const g of GRID) { plans.push(await X.libEntry(H, g, H25, H24)); console.log("library: " + plans.length + " of " + GRID.length); }
      fs.writeFileSync(LPATH, X.libText(plans) + "\n");
    }
    const LIB = fs.existsSync(LPATH) ? JSON.parse(fs.readFileSync(LPATH, "utf8")) : null;
    ok(LIB && LIB.plans.length === GRID.length && LIB.plans.every((e, i) => e.key === SS.encode(S, GRID[i].state)), "the library holds every preset, perfect and decade by decade, and the central plan without the peak-hour rule (" + GRID.length + "), in order");
    const nr = LIB && LIB.plans.find(e => e.preset === "central-norule");
    ok(LIB && LIB.plans.every(e => { const sp = P.Y.indexOf(cfg.levers.shockYear.mineralBan); return e.view.built.battery[sp] > 0.005 || Math.abs(e.shocks.mineralBan.dPV) <= 1; }), "a shock that touches nothing the plan uses changes nothing: the mineral restriction with no new batteries in its year leaves the cost as it was (perfect and decade by decade)");
    ok(nr && nr.full.some(c => c.unservedMWh > 1e4), "the central plan without the peak-hour rule fails the full-year check (" + (nr ? nr.full.map(c => c.unservedHours + " h").join(", ") : "?") + ")");
    ok(LIB && fs.readFileSync(LPATH, "utf8") === X.libText(LIB.plans) + "\n", "the library file is written exactly as the test writes it");
    ok(LIB && LIB.date === X.LIB_DATE && LIB.plans.every(e => e.status === "optimal" && e.full.length === 4 && e.full.every(c => c.status === "optimal" && c.solves === 53)), "every library run optimal; four full-year checks each, 53 LPs each");
    const idx = FULLLIB ? GRID.map((g, i) => i) : [2, 5];
    const bad = [];
    for (const i of idx) { const e = await X.libEntry(H, GRID[i], H25, H24, { full: FULLLIB || i === 2 }); const lib = LIB.plans[i];
      const cmp = FULLLIB || i === 2 ? JSON.stringify(e) === JSON.stringify(lib) : JSON.stringify(Object.assign({}, e, { full: lib.full })) === JSON.stringify(lib);
      if (!cmp) bad.push(GRID[i].preset + "/" + GRID[i].state.fs); }
    ok(!bad.length, "library entries equal fresh runs, byte for byte, for " + idx.length + " plans" + (FULLLIB ? " (all)" : " (the default, with its full-year checks, and one more)") + (bad.length ? ": " + bad.join(", ") : ""));
  }

  // ---------------- failure states
  {
    const err = await E4.solve(def, P, { solver: () => Promise.resolve({ status: "error", ok: false, message: "boom" }) });
    ok(err.status === "error" && !err.ok && typeof err.message === "string", "a solver error: status error, a message");
    const tl = await E4.solve(def, P, { solver: () => Promise.resolve({ status: "time-limit", ok: false }) });
    ok(tl.status === "time-limit" && /time limit/.test(tl.message), "a time limit: status time-limit, said so");
    const thr = await E4.solve(def, P, { solver: () => { throw new Error("thrown"); } });
    ok(thr.status === "error" && /thrown/.test(thr.message), "a solver that throws: status error (solve never rejects)");
    const st = await E4.shockTest(def, P, { solver: () => Promise.resolve({ status: "infeasible", ok: false }) });
    ok(st.status === "infeasible" && !st.ok, "the shock test reports a failed run");
  }

  // ---------------- scope
  {
    const SRC = fs.readFileSync(L("components/engine-e4.js"), "utf8"), DATA = fs.readFileSync(L("data/e4-pathways.json"), "utf8");
    const reactor = /\bSMR\b|small modular|light[- ]water|pressuri[sz]ed water|boiling water|fast reactor|molten salt|high[- ]temperature gas|AP1000|NuScale|reactor/i;
    ok(!reactor.test(SRC.replace(/\/\*[\s\S]*?\*\//, "")) && !reactor.test(DATA), "no reactor technology named in the engine or its data");
    ok(!/firm[^.;\n]{0,60}nuclear|nuclear[^.;\n]{0,60}firm/i.test(DATA) && !/"firm"[^}]*nuclear/i.test(SRC), "the generic firm option is never called nuclear");
    ok(!/learning|first[- ]of[- ]a[- ]kind|FOAK|NOAK/i.test(SRC + DATA), "no learning curves or first-of-a-kind wording");
  }

  console.log(fails ? fails + " of " + checks + " checks FAILED" : "test_e4-engine: all " + checks + " checks pass");
  process.exit(fails ? 1 : 0);
})();
