// test_e2-engine.js — Node tests for engine E2 (assets/learn/components/engine-e2.js, LX.E2) with the vendored HiGHS, the
// solver core the pages run in a Web Worker (wave W4, 2026-11-05). What it checks:
//   - the data: shapes from town_year.json (2025) and the 2024 year scaled to 2025's demand energy; wind and sun per MW
//     from LX.townProfile at EIA's monthly capacity factors; the periods are what the pages say (the town_days.json days,
//     the week with the highest average daily peak, one of the two calmest winter weeks); C2's representative days are the
//     monthly medoids; EIA's fuel prices and CO2 coefficients; the region's 4,000 MW peak
//   - the plan links: SB2's and C2's schemas valid; defaults, presets and 300 seeded random plans round-trip; a damaged
//     link is refused
//   - the models as built: every hour balances in every zone; links within limits; units within pmin x n and pmax x n,
//     reserve within rcap x n and the headroom; minimum up and down times across days; the dispatch LP's objective equals
//     the MILP's; the production cost's parts add up; the battery's charge and its daily start and end
//   - no prices from the MILP (§9.2): every MILP result has duals null; prices come only from the fixed LP
//   - uniqueness (W2 review finding 2; brief §2 item 7): each shown price (zones and reserve) equals the cost slope when
//     its row moves 0.001 MWh up and down (no corner); every number the pages show is the same with the tie weights
//     x10 and x0.1; the commitment is the MILP's unique optimum (a second solve that must differ costs more)
//   - failure states: solve never rejects; a solver that throws, rejects, returns nothing or an error gives "error"; a
//     stubbed time limit with a plan gives "time-limit", the plan, its gap and "not proven optimal"; a real 1 ms limit
//     never says optimal; BenchRun.classify offers Try again and never says optimal
//   - adequacy: the max-flow deficit equals an LP max-flow on 300 seeded instances; Town's slack too; the seeded Monte
//     Carlo repeats exactly; C2's reference numbers (today's grid within 0.1 days a year; the 300 MW load alone far above)
// Usage (from the site folder):  node _tests/learn/test_e2-engine.js
"use strict";
const fs = require("fs");
const X = require("./e2_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);

(async () => {
  const { E2, cfg, D, P, PR, SS, solveSync, solver, L, J } = await X.load();
  const BR = require(L("components/benchrun.js"));
  const SRC = fs.readFileSync(L("components/engine-e2.js"), "utf8");
  const def = SS.defaults(E2.schema), C2S = E2.c2Schema(cfg), c2d = SS.defaults(C2S);

  // ---------------- data
  const Y = P.years["2025"], Y4 = P.years["2024"];
  ok(Y.demand.length === 8760 && Y.demand.every((v, i) => v === D.y2025.demand[i] / 1000) && Math.max(...Y.demand) === 1, "2025 demand = town_year.json / 1000; its peak hour is 1 (the zones' peaks)");
  const o = { year: D.y2025, targets: D.targets, monthlyCF: true, monthDays: E2.MD };
  ok(Y.wind.every((v, i) => v === PR.townProfile("wind", 1, o).mw[i]) && Y.solar.every((v, i) => v === PR.townProfile("solar", 1, o).mw[i]), "wind and sun per MW = LX.townProfile (monthly capacity factors)");
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  ok(near(mean(Y.wind), D.targets.targets.wind.cf, 1e-9) && near(mean(Y.solar), D.targets.targets.solar.cf, 1e-9) && cfg.cf.wind === D.targets.targets.wind.cf && cfg.cf.solar === D.targets.targets.solar.cf, "annual capacity factors 33.8% and 24.0% (EIA 2025), as the inputs table says");
  ok(Y4 && near(Y4.demand.reduce((s, v) => s + v, 0), Y.demand.reduce((s, v) => s + v, 0), 1e-6) && Y4.hours === 8760, "2024: scaled to 2025's yearly demand energy (k = " + Y4.scale.toFixed(4) + "), 8,760 hours");
  ok(cfg.zones.reduce((s, z) => s + z.peak, 0) === 4000 && cfg.zones.map(z => z.peak).join() === "300,450,3250", "zone peaks 300, 450, 3,250 MW: 4,000 MW in all");
  ok(cfg.fuels.gas.price === 3.85 && cfg.fuels.coal.price === 2.42 && cfg.fuels.gas.co2 === 52.91 && cfg.fuels.coal.co2 === 97.13, "EIA: gas $3.85 and coal $2.42 per MMBtu (EPA Table 7.4, 2025); CO2 52.91 and 97.13 kg/MMBtu");
  const hrs = cfg.units.map(u => u.hr);
  ok(Math.min(...hrs) === 6.4 && Math.max(...hrs) === 11.2, "heat rates 6.4 to 11.2 MMBtu/MWh, as the inputs table says");
  const days = J("town_days.json").days;
  ok(P.periods.peak.start === days.summer_peak.date && P.periods.winter.start === days.winter_peak.date && P.periods.windy.start === days.windy_spring.date, "the three named days are town_days.json's summer peak, winter peak and windy spring days");
  const dPeak = []; for (let d = 0; d < 365; d++) dPeak.push(Math.max(...D.y2025.demand.slice(d * 24, d * 24 + 24)));
  const dWind = []; for (let d = 0; d < 365; d++) dWind.push(mean(D.y2025.wind.slice(d * 24, d * 24 + 24)));
  let bestW = -1, bv = -Infinity; for (let d = 0; d + 7 <= 365; d++) { const v = mean(dPeak.slice(d, d + 7)); if (v > bv) { bv = v; bestW = d; } }
  ok(bestW === P.periods.hot.day0 && P.periods.hot.days === 7, "the peak-demand week (14–20 August 2025) has the highest average daily peak of any 7-day window");
  const winter = []; for (let d = 0; d + 7 <= 365; d++) { const m0 = E2.dateOf(d).m, m1 = E2.dateOf(d + 6).m; if ([0, 1, 11].includes(m0) && [0, 1, 11].includes(m1)) winter.push([mean(dWind.slice(d, d + 7)), d]); }
  winter.sort((a, b) => a[0] - b[0]);
  ok(winter.slice(0, 2).map(x => x[1]).includes(P.periods.calm.day0), "the low-wind winter week (2–8 January 2025) is one of the two calmest 7-day windows of winter 2025 by mean wind");
  ok(J("a08-storage-duration.json").week.date === P.periods.calm.start, "it is lesson A8's week");
  // C2's representative days: each month's medoid of hourly demand, wind and sun (system MW)
  const wT = cfg.zones.reduce((a, z) => a + z.wind, 0), sT = cfg.zones.reduce((a, z) => a + z.solar, 0);
  const feat = d => { const f = []; for (let h = 0; h < 24; h++) { const i = d * 24 + h; f.push(Y.demand[i] * 4000, Y.wind[i] * wT, Y.solar[i] * sT); } return f; };
  const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
  let d0 = 0, med = true;
  E2.MD.forEach((nd, m) => { const ds = []; for (let k = 0; k < nd; k++) ds.push(d0 + k); const F = ds.map(feat); let best = null, bs = Infinity; ds.forEach((d, i) => { const s = F.reduce((a, f) => a + dist(F[i], f), 0); if (s < bs) { bs = s; best = d; } }); if (P.rep[m].day !== best) med = false; d0 += nd; });
  ok(med && P.rep.length === 12 && P.rep.reduce((s, r) => s + r.weight, 0) === 365, "C2's 12 representative days are the monthly medoids, weighted by each month's days (365)");

  // ---------------- the plan links
  [E2.schema, C2S].forEach(S => {
    let threw = null; try { SS.checkSchema(S); } catch (e) { threw = e.message; }
    ok(!threw, S.key + ": the schema is valid " + (threw || ""));
    const d = SS.defaults(S);
    (S.key === "sb2" ? E2.presets : E2.c2presets).forEach(p => { const st = Object.assign({}, d, p.state); ok(!SS.validate(S, st).length && SS.same(S, SS.decode(S, SS.encode(S, st)).state, st), S.key + ": preset " + p.id + " is valid and round-trips"); });
    let seed = 13; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, bad = [];
    for (let k = 0; k < 300; k++) {
      const st = {};
      S.fields.forEach(f => {
        if (f.type === "int" || f.type === "num") { const n = Math.round((f.max - f.min) / f.step); st[f.id] = +(f.min + Math.round(rnd() * n) * f.step).toFixed(6); }
        else if (f.type === "enum") st[f.id] = f.values[Math.floor(rnd() * f.values.length)];
      });
      const h = SS.encode(S, st), back = SS.decode(S, h);
      if (back.status !== "ok" || !SS.same(S, back.state, st) || !/^[a-z0-9_-]+$/i.test(h)) bad.push(h);
    }
    ok(!bad.length, S.key + ": 300 seeded random plans round-trip (" + bad.slice(0, 2).join(" ") + ")");
    ok(SS.decode(S, "#" + S.key + "-v1-p99").status === "bad", S.key + ": a damaged link is refused");
  });
  ok(C2S.fields.filter(f => /^c/.test(f.id) && f.id !== "conn").every(f => { const r = cfg.c2.costs[f.id.slice(1)]; return f.min === r.lo && f.max === r.hi && f.def === r.def; }), "C2's cost ranges are fixed ranges the reader sets, from the data file (guard G-COST)");

  // ---------------- one run, checked hour by hour (the 300 MW load on the peak-demand week: unserved hours, congestion)
  const stHot = Object.assign({}, def, { per: "hot", ll: 400, llz: "T", flex: 20, bid: 300 });
  const rHot = await E2.solve(stHot, P, { solver });
  ok(rHot.ok && rHot.results.days.length === 7, "the peak-demand week with a 400 MW load, 20% flexible: seven days, each optimal");
  const sysH = E2.sysOf(stHot, P);
  let balOk = true, unitOk = true, linkOk = true, resOk = true;
  rHot.results.days.forEach(d => d.hours.forEach(h => {
    P.zones.forEach((z, i) => {
      let s = h.z[i].used + h.z[i].shed;
      E2.fleet(P, sysH).filter(u => u.zone === z.id).forEach(u => { s += h.p[u.id]; });
      P.links.forEach(l => { if (l.to === z.id) s += h.f[l.id]; if (l.from === z.id) s -= h.f[l.id]; });
      if (z.id === sysH.llz) s += h.cl;
      if (!near(s, h.z[i].load, 1e-5)) balOk = false;
    });
    P.links.forEach(l => { if (Math.abs(h.f[l.id]) > sysH.caps[l.id] + 1e-6) linkOk = false; });
    let r = h.rshort;
    E2.fleet(P, sysH).forEach(u => {
      const n = u.fast ? u.n : h.u[u.id];
      if (h.p[u.id] < (u.fast ? 0 : u.pmin * n) - 1e-6 || h.p[u.id] + h.r[u.id] > u.pmax * n + 1e-6 || h.r[u.id] > u.rcap * n + 1e-6) unitOk = false;
      r += h.r[u.id];
    });
    if (r < sysH.res - 1e-5) resOk = false;
  }));
  ok(balOk, "every hour of the week balances in every zone (plants + wind and sun used + flows in − out + unserved + curtailed = load)");
  ok(linkOk && unitOk && resOk, "links within their limits; each group between pmin × units on and pmax × units on, its reserve within rcap and the headroom; reserve + shortfall ≥ the requirement");
  // minimum up and down times, across the days of the week
  let upOk = true;
  E2.fleet(P, sysH).filter(u => !u.fast).forEach(u => {
    const U = [], V = [], W = [];
    rHot.results.days.forEach(d => { U.push(...d.com.u[u.id]); V.push(...d.com.v[u.id]); W.push(...d.com.w[u.id]); });
    for (let t = 0; t < U.length; t++) {
      if (t > 0 && U[t] - U[t - 1] !== V[t] - W[t]) upOk = false;
      let sv = 0, sw = 0; for (let s = Math.max(0, t - u.ut + 1); s <= t; s++) sv += V[s]; for (let s = Math.max(0, t - u.dt + 1); s <= t; s++) sw += W[s];
      if (u.ut > 1 && sv > U[t]) upOk = false; if (u.dt > 1 && sw > u.n - U[t]) upOk = false;
    }
  });
  ok(upOk, "on, start and stop agree hour by hour across the week, and every minimum up and down time holds across midnight");
  // the dispatch LP's objective equals the MILP's, and the production cost's parts add up
  let objOk = true, partsOk = true;
  rHot.results.days.forEach(d => {
    if (!near(d.objective, d.milp.objective, 1e-6 * Math.abs(d.milp.objective) + 1e-3)) objOk = false;
    const T = d.tot, pen = T.shedZ.reduce((s, v, i) => s + v * (P.cfg.voll + P.cfg.tie.shed[i]), 0) + T.rshort * P.cfg.reserveShort + T.curtail * sysH.bid;
    if (Math.abs(d.objective - (T.prod + pen)) > 2) partsOk = false;   // the tie costs add a few dollars at most
  });
  ok(objOk, "each day: the dispatch LP with the commitment fixed has the MILP's objective");
  ok(partsOk, "each day: objective = running + no-load + start-up + penalties (+ the other ties, under $2)");
  ok(rHot.results.tot.shed > 1 && rHot.results.tot.cong.TM > 0, "the week has unserved hours and Town–Metro congestion (" + E2.kilo(rHot.results.tot.shed) + " MWh, " + rHot.results.tot.cong.TM + " h)");

  // ---------------- no prices from the MILP (§9.2)
  const m0 = E2.dayModel(P, E2.sysOf(def, P), "2025", P.periods.peak.day0, null), r0 = solveSync(m0, { gap: 1e-6 });
  ok(r0.kind === "milp" && r0.duals === null && r0.reducedCosts === null, "the commitment MILP returns no duals");
  const fx = E2.dayModel(P, E2.sysOf(def, P), "2025", P.periods.peak.day0, null, { fix: E2.commitment(P, E2.sysOf(def, P), r0) });
  ok(fx.variables.every(v => v.type !== "integer") && solveSync(fx).duals, "the pricing model has no integers and returns duals");
  ok((SRC.match(/\.duals\[/g) || []).length === 2 && /lp\.duals\["res_" \+ t\]/.test(SRC) && /lp\.duals\["bal" \+ q\]/.test(SRC), "the engine reads duals only from the dispatch LP (lp.duals), twice: the zones' balances and the reserve");

  // ---------------- uniqueness: price slopes, tie weights, the commitment
  function slopes(sys, d, st, com) {
    const base = solveSync(E2.dayModel(P, sys, d.y, d.day, st, { fix: com })).objective, bad = [];
    const rows = []; for (let t = 0; t < 24; t++) { P.zones.forEach(z => rows.push(["bal_" + z.id + "_" + t, d.hours[t].z[P.zix[z.id]].price])); rows.push(["res_" + t, d.hours[t].rho]); }
    rows.forEach(([row, lam]) => {
      const up = (solveSync(E2.dayModel(P, sys, d.y, d.day, st, { fix: com, bump: { row, d: 1e-3 } })).objective - base) / 1e-3;
      const dn = (base - solveSync(E2.dayModel(P, sys, d.y, d.day, st, { fix: com, bump: { row, d: -1e-3 } })).objective) / 1e-3;
      if (Math.abs(up - dn) > 0.02 || Math.abs(up - lam) > 0.02) bad.push(row + " up " + up.toFixed(3) + " down " + dn.toFixed(3) + " dual " + lam.toFixed(3));
    });
    return bad;
  }
  function noGood(sys, d, st, com) {   // the best commitment that differs from com in at least one group-hour
    const m = E2.dayModel(P, sys, d.y, d.day, st), V = m.variables, C = m.constraints, all = [];
    E2.fleet(P, sys).filter(u => !u.fast).forEach(u => { for (let t = 0; t < 24; t++) {
      const k = u.id + "_" + t, c = com.u[u.id][t];
      V.push({ name: "dp" + k, ub: u.n }, { name: "dn" + k, ub: u.n }, { name: "z" + k, type: "binary" });
      C.push({ name: "ng" + k, terms: [["u" + k, 1], ["dp" + k, -1], ["dn" + k, 1]], eq: c }, { name: "zp" + k, terms: [["dp" + k, 1], ["z" + k, -u.n]], le: 0 }, { name: "zn" + k, terms: [["dn" + k, 1], ["z" + k, u.n]], le: u.n });
      all.push(["dp" + k, 1], ["dn" + k, 1]); } });
    C.push({ name: "differ", terms: all, ge: 1 });
    return solveSync(m, { gap: 1e-6, timeLimit: 120 });
  }
  const cases = [["SB2 default, summer peak day", def, "period"], ["SB2 300 MW load, summer peak day", Object.assign({}, def, { ll: 300 }), "period"],
    ["SB2 300 MW load, low-wind week", Object.assign({}, def, { per: "calm", ll: 300 }), "period"], ["SB2 flexible 400 MW load, peak-demand week", stHot, "period"],
    ["SB2 windy day, Metro load", Object.assign({}, def, { per: "windy", ll: 600, llz: "M", gas: 6 }), "period"],
    ["C2 default year", c2d, "year"], ["C2 peakers and uprate, hard weeks", Object.assign({}, c2d, E2.c2presets[1].state), "weeks"]];
  const shown = (R, bat) => { const q = R.task === "year" ? 1e5 : 1000; return { prod: Math.round(R.tot.prod / q), up: Math.round(R.tot.upliftAll / q), avg: R.avgPrice.map(v => Math.round(v)).join(), max: R.maxPrice.map(v => Math.round(v)).join(),
    shed: Math.round(R.tot.shed), rs: Math.round(R.tot.rshort), spill: Math.round(R.tot.spill), co2: Math.round(R.tot.co2), cong: JSON.stringify(R.tot.cong), rent: Math.round(R.tot.rent / q),
    gen: Object.values(R.tot.gen).map(v => Math.round(v)).join(), ll: Math.round(R.tot.llPay / q), com: R.days.map(d => JSON.stringify(d.com.u)).join("|"),
    hours: R.days.map(d => d.hours.map(h => h.z.map(x => Math.round(x.price)).join(",") + ";" + Math.round(h.rho) + (bat ? "" : ";" + Math.round(h.f.WT) + "," + Math.round(h.f.TM))).join(" ")).join("|") }; };
  for (const [name, st, task] of cases) {
    const r = await E2.solve(st, P, { solver, task });
    if (!r.ok) { ok(false, name + ": run optimal (" + r.status + ")"); continue; }
    const sys = E2.sysOf(st, P), R = r.results;
    let prev = null, bad = [], ngOk = true, margin = Infinity;
    R.days.forEach((d, i) => {
      const st0 = d.spec.carry ? prev : null;
      bad = bad.concat(slopes(sys, d, st0, d.com).map(b => d.spec.label + " " + b));
      if (i < 3) { const ng = noGood(sys, d, st0, d.com); const m = ng.values ? ng.objective - d.milp.objective : Infinity; margin = Math.min(margin, m); if (!(m > 1)) ngOk = false; }
      prev = E2.carry(P, sys, d.com);
    });
    ok(!bad.length, name + ": every zone and reserve price equals the cost slope 0.001 MWh up and down (" + bad.length + " corners" + (bad.length ? ": " + bad.slice(0, 2).join("; ") : "") + ")");
    ok(ngOk, name + ": the commitment is the unique optimum of its first days (the next best costs $" + (isFinite(margin) ? margin.toFixed(2) : "∞") + " more)");
    const base = shown(R, !!sys.bat), diff = [];
    for (const k of [10, 0.1]) {
      const T = P.cfg.tie, save = JSON.stringify(T);
      P.cfg.tie = { spill: T.spill.map(x => x * k), shed: T.shed.map(x => x * k), reserve: T.reserve * k, battery: T.battery * k, batteryHour: T.batteryHour * k };
      const r2 = await E2.solve(st, P, { solver, task }); P.cfg.tie = JSON.parse(save);
      const s2 = shown(r2.results, !!sys.bat); Object.keys(base).forEach(q => { if (s2[q] !== base[q]) diff.push(k + ":" + q); });
    }
    ok(!diff.length, name + ": every shown number is the same with the tie weights ×10 and ×0.1 (" + diff.join(", ") + ")");
  }

  // ---------------- failure states
  const bad = [["throws", () => { throw new Error("boom"); }], ["rejects", () => Promise.reject(new Error("nope"))], ["nothing", () => undefined], ["error", () => ({ status: "error", ok: false })]];
  for (const [nm, f] of bad) { const r = await E2.solve(def, P, { solver: f }); ok(r.status === "error" && !r.ok && !r.results && /failed/.test(r.message), "a solver that " + nm + ": status error, no results, a message"); }
  const tl = await E2.solve(Object.assign({}, def, { per: "hot" }), P, { solver: (m, o) => { const r = solveSync(m, o); if (r.values && m.variables.some(v => v.type === "integer")) { r.status = "time-limit"; r.ok = false; r.mipGap = 0.0123; } return Promise.resolve(r); } });
  ok(tl.status === "time-limit" && !tl.ok && tl.results && tl.results.days.length === 7 && /not proven optimal/.test(tl.message) && /1\.23%/.test(tl.message) && /conditional/.test(tl.message), "a time limit with a plan: status time-limit, the results kept, its gap and 'not proven optimal': " + tl.message);
  const c1 = BR.classify(tl, null, true);
  ok(c1.kind === "early" && c1.draw && c1.retry && !/optimal\b(?! )/i.test(c1.text.replace(/not proven optimal/, "")), "BenchRun: a time-limited run is drawn, offers Try again and never says optimal");
  const real = await E2.solve(def, P, { solver: (m, o) => Promise.resolve(X && solveSync(m, Object.assign({}, o, { timeLimit: 0.001 }))) });
  ok(real.status !== "optimal" && !real.ok, "a real 1 ms time limit never reports optimal (" + real.status + ")");
  ok(BR.classify(real, null, true).retry, "and offers Try again");
  const none = await E2.solve(def, P, {});
  ok(none.status === "error" && /no solver/.test(none.message), "no solver: status error");

  // ---------------- adequacy
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, flowBad = [];
  for (let k = 0; k < 300; k++) {
    const dz = [0, 1, 2].map(() => (rnd() - 0.5) * 1200), cWT = Math.round(rnd() * 900), cTM = Math.round(rnd() * 900);
    // LP: serve as much load as possible; supply A_z = max(0, -d_z), load D_z = max(0, d_z)
    const A = dz.map(v => Math.max(0, -v)), Dz = dz.map(v => Math.max(0, v));
    const m = { sense: "max", variables: [{ name: "g0", ub: A[0] }, { name: "g1", ub: A[1] }, { name: "g2", ub: A[2] }, { name: "s0", ub: Dz[0], cost: 1 }, { name: "s1", ub: Dz[1], cost: 1 }, { name: "s2", ub: Dz[2], cost: 1 }, { name: "f1", lb: -cWT, ub: cWT }, { name: "f2", lb: -cTM, ub: cTM }],
      constraints: [{ name: "b0", terms: [["g0", 1], ["f1", -1], ["s0", -1]], eq: 0 }, { name: "b1", terms: [["g1", 1], ["f1", 1], ["f2", -1], ["s1", -1]], eq: 0 }, { name: "b2", terms: [["g2", 1], ["f2", 1], ["s2", -1]], eq: 0 }] };
    const r = solveSync(m), lpShort = Dz.reduce((s, v) => s + v, 0) - r.objective;
    if (!near(E2.deficit(dz[0], dz[1], dz[2], cWT, cTM), lpShort, 1e-6)) flowBad.push(k);
  }
  ok(!flowBad.length, "the deficit formula equals an LP max-flow on 300 seeded instances (" + flowBad.slice(0, 3) + ")");
  const sys0 = E2.sysOf(Object.assign({}, c2d, { conn: 0 }), P);
  const a1 = E2.adequacy(P, sys0, { sync: true }), a2 = E2.adequacy(P, sys0, { sync: true });
  ok(JSON.stringify(a1) === JSON.stringify(a2) && a1.years === cfg.c2.adequacy.years && a1.seed === cfg.c2.adequacy.seed, "adequacy: the seeded Monte Carlo repeats exactly (" + a1.years + " draw years, seed " + a1.seed + ")");
  ok(a1.lole < cfg.c2.adequacy.criterion && a1.ci[1] < 0.11, "today's grid: LOLE " + a1.lole.toFixed(3) + " days a year (90% interval " + a1.ci.map(x => x.toFixed(3)).join("–") + "), within the 0.1 criterion");
  const aL = E2.adequacy(P, E2.sysOf(c2d, P), { sync: true });
  ok(aL.lole > 5, "the 300 MW load on today's grid: LOLE " + aL.lole.toFixed(2) + " days a year, far above 0.1");
  const aB = E2.adequacy(P, E2.sysOf(Object.assign({}, c2d, { bat: 200 }), P), { sync: true });
  ok(aB.lole < aL.lole && aB.eue < aL.eue, "a 200 MW battery at Town lowers LOLE and EUE (same seed): " + aB.lole.toFixed(2));
  const aF = E2.adequacy(P, E2.sysOf(Object.assign({}, c2d, { flex: 20 }), P), { sync: true });
  ok(aF.curtailHours > 0 && aF.lole < aL.lole, "a 20% flexible share is curtailed first (" + aF.curtailHours.toFixed(1) + " h a year) and lowers LOLE");

  console.log(`test_e2-engine: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
