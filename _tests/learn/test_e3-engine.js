// test_e3-engine.js — Node tests for engine E3 (assets/learn/components/engine-e3.js, LX.E3) with the vendored HiGHS, the
// solver core the pages run in a Web Worker (wave W5, 2026-11-06). What it checks:
//   - the data: e3-city-hub.json's costs read from other course files (e0.json, e2-plains-grid.json, 13-capstone.json)
//     and converted as those lessons convert them; the fictional line is prairie-city.json's; no nuclear term
//   - the plan links: SB3's and C3's schemas valid; defaults and presets valid and round-trip
//   - 2025 as it is: each district buys its 2025 electricity less the rooftop solar it uses; its busiest hour is
//     prairie-city.json's peak2025MW; the city's CO2 equals the 2025 inventory less the rooftop solar the inventory counts
//     at the grid rate (E3 counts what is bought; the gap is stated on the pages)
//   - the model as built, for every preset of SB3 and C3: every district-hour balances; imports within the limit plus the
//     upgrade; batteries and the heat store follow their state equations, cyclic in each day; managed charging moves
//     each day's energy within the day; the network's heat balances; the farms never exceed their output or the city's load
//   - prices and duals only from the LP (§9.2): each district's summed substation duals equal the upgrade's yearly cost
//     when an upgrade is bought; the summed value equals the cost slope when the limit moves 0.1 MW up and down; the
//     balance dual of a district-hour is its retail price plus the substation's value that hour; the CO2 cap's dual equals
//     the cost slope when the cap moves 100 t
//   - ties (W2 review finding 2): every reported number (cost, CO2, busiest hours, upgrades, the city's busiest hour, the
//     household table) is the same with the tie costs x10 and x0.1, and the min and max of each over the optimal face
//     agree (within half a MW, 0.05 MW, 1 t, $1,000)
//   - the household layer (§9.6): 2025 as it is reproduces prairie-city.json's group bills and burdens; each measure's
//     changes add up to the engine's district changes; no group's use goes below zero for any preset or rule; lower
//     incomes first puts the first adopters in the lowest group
//   - failure states: solve never rejects; a solver that errors gives "error"; a plan that needs upgrades when they are
//     not allowed is infeasible with a hint naming each district's shortfall (equal to the upgrade it would buy); a cap
//     no plan meets is infeasible with a hint
// Usage (from the site folder):  node _tests/learn/test_e3-engine.js
"use strict";
const fs = require("fs");
const X = require("./e3_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);

(async () => {
  const { E3, city, cfg, P, SS, solveSync, solver, L, J } = await X.load();
  const SRC = fs.readFileSync(L("components/engine-e3.js"), "utf8"), DATA = fs.readFileSync(L("data/e3-city-hub.json"), "utf8");
  const S3 = E3.sb3Schema(cfg), C3S = E3.c3Schema(cfg), def = E3.defaults(S3), c3d = E3.defaults(C3S);

  // ---------------- data read from other course files
  const e0 = J("e0.json"), e2 = J("e2-plains-grid.json"), t13 = J("13-capstone.json");
  const k22 = e0.deflator.index["2025"] / e0.deflator.index["2022"], k24 = e2.c2.deflator["2025"] / e2.c2.deflator["2024"];
  ok(cfg.heatPump.capex === Math.round(e0.home.hp.standard.capex * k22), "heat pump: E0's 2022 cost x EIA's deflator");
  ok(cfg.rooftop.capex === Math.round(e0.home.pv.capex * k22) && cfg.rooftop.fom === e0.home.pv.fom && cfg.rooftop.life === e0.home.pv.life, "rooftop solar: E0's");
  const b2 = e2.c2.costs.bat;
  ok(cfg.battery.capex === Math.round((b2.powerCapex + b2.energyCapex * b2.hours) * k24) && cfg.battery.life === b2.life && cfg.battery.fomShare === b2.fomShare, "battery: C2's NREL cost x BEA's deflator");
  ok(near(E3.yearly(cfg.battery.capex, cfg.battery.life, cfg.finance.rate, cfg.battery.fomShare), b2.def, 0.6), "battery's yearly cost is C2's $" + b2.def + "/kW-year (rounded)");
  ok(cfg.c3.wind.capex === t13.techs.wind.capex && cfg.c3.solarFarm.capex === t13.techs.solar.capex && cfg.finance.rate === t13.finance.wacc / 100, "wind, solar farm and the rate: lesson 13's");
  ok(cfg.c3.electrolyzer.capex === Math.round(e0.farm.electrolyzer.capex * k22), "electrolyzer: E0's DOE cost x EIA's deflator");
  ok(cfg.about.line === city.about.line && cfg.about.line === "Prairie City is fictional; its numbers are illustrative.", "the fictional line, word for word");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(SRC + DATA), "no nuclear term in the engine or its data (guard G-DC)");
  ok(!/\bAI\b|artificial intelligence/.test(SRC + DATA), "no AI wording");

  // ---------------- plan links
  [S3, C3S].forEach(S => {
    let threw = null; try { SS.checkSchema(S); } catch (e) { threw = e.message; }
    ok(!threw, S.key + ": schema valid " + (threw || ""));
    const d = SS.defaults(S);
    ok(!SS.validate(S, d).length && SS.same(S, SS.decode(S, SS.encode(S, d)).state, d), S.key + ": defaults round-trip");
    (S.key === "sb3" ? E3.presets : E3.c3presets).forEach(p => { const st = Object.assign({}, d, p.state); ok(!SS.validate(S, st).length && SS.same(S, SS.decode(S, SS.encode(S, st)).state, st), S.key + ": preset " + p.id + " valid and round-trips"); });
  });

  // ---------------- 2025 as it is
  const r0 = await E3.solve(def, P, { solver });
  ok(r0.ok, "2025 as it is: optimal");
  const R0 = r0.results;
  city.districts.forEach((x, i) => {
    const am = x.annualMWh, el = am.base + am.residentialHeat + am.commercialHeat + am.ev, o = R0.acc.d[i];
    ok(near(o.imp + o.pvUsed, el, el * 2e-4), x.key + ": bought + rooftop used = 2025 electricity (" + Math.round(o.imp + o.pvUsed) + " vs " + el + "; hourly data rounded to 0.1 MW)");
    ok(near(o.pvUsed, o.pvAvail, 1e-3), x.key + ": all 2025 rooftop solar is used");
    ok(near(R0.dist[i].peak, x.peak2025MW, 0.06), x.key + ": busiest hour " + R0.dist[i].peak.toFixed(2) + " = peak2025MW " + x.peak2025MW);
    ok(R0.dist[i].upg < 1e-6, x.key + ": no upgrade in 2025");
  });
  const rc0 = await E3.solve(c3d, P, { solver }), A0c = rc0.results.acc;
  const roofCO2 = R0.acc.d.reduce((s, o) => s + o.pvUsed, 0) * P.ef.grid * (1 + P.ef.loss);
  ok(near(A0c.city.co2 + roofCO2, city.inventory2025.total, 100), "city CO2 + rooftop solar at the grid rate = the 2025 inventory (" + Math.round(A0c.city.co2) + " + " + Math.round(roofCO2) + " vs " + city.inventory2025.total + ")");
  ok(near(roofCO2, 12700, 50), "the stated gap is about 12,700 t (" + Math.round(roofCO2) + ")");
  const g0 = R0.hh;
  g0.rows.forEach((x, j) => ok(near(x.home0, city.groups[j].homeEnergy, 0.01) && near(x.home, x.home0, 2) && near(x.burden, city.groups[j].burden, 1e-4), "households " + x.key + ": 2025 bills and burden as prairie-city.json (" + Math.round(x.home) + ")"));
  ok(near(g0.low.burden0, city.groupsNote.lowIncomeBurden, 1e-4) && near(g0.other.burden0, city.groupsNote.otherBurden, 1e-4), "0-80% and other groups' burden as prairie-city.json");

  // ---------------- the model as built, every preset
  const plans = E3.presets.map(p => ({ id: "sb3 " + p.id, st: E3.withPreset(def, p) }))
    .concat(E3.c3presets.map(p => ({ id: "c3 " + p.id, st: E3.withPreset(c3d, p) })))
    .concat([{ id: "sb3 managed low", st: Object.assign({}, E3.withPreset(def, E3.presets[2]), { rule: "low" }) }, { id: "sb3 high", st: Object.assign({}, E3.withPreset(def, E3.presets[3]), { rule: "high" }) }]);
  const runs = {};
  for (const pl of plans) {
    const S = E3.sysOf(pl.st, P), m = E3.build(P, S), r = solveSync(m);
    ok(r.status === "optimal", pl.id + ": optimal");
    if (r.status !== "optimal") continue;
    const raw = E3.read(P, S, m, r);
    runs[pl.id] = { S, m, r, raw };
    let worst = 0, over = 0, soc = 0, evd = 0, dhb = 0, farm = 0;
    raw.days.forEach((day, k) => {
      day.d.forEach((o, i) => {
        for (let h = 0; h < 24; h++) {
          const lhs = o.imp[h] + o.pv[h] + o.bd[h] - o.bc[h] - o.ev[h] - o.plant[h] - o.heat[h];
          worst = Math.max(worst, Math.abs(lhs - o.base[h]));
          over = Math.max(over, o.imp[h] - P.D[i].L - raw.upg[i]);
          const prev = o.bq[(h + 23) % 24];
          soc = Math.max(soc, Math.abs(o.bq[h] - prev - cfg.battery.rte * o.bc[h] + o.bd[h]));
          if (o.pv[h] > o.pvAvail[h] + 1e-6) over = Math.max(over, 1);
        }
        evd = Math.max(evd, Math.abs(o.ev.reduce((a, b) => a + b, 0) - S.d[i].E));
      });
      if (day.dh) for (let h = 0; h < 24; h++) {
        dhb = Math.max(dhb, Math.abs(day.dh.hp[h] + day.dh.boil[h] + day.dh.so[h] - day.dh.si[h] - day.dh.load[h] / (1 - cfg.dh.loss)));
        dhb = Math.max(dhb, Math.abs(day.dh.sq[h] - (1 - cfg.dh.store.lossPerHour) * day.dh.sq[(h + 23) % 24] - day.dh.si[h] + day.dh.so[h]));
      }
      if (day.farm) for (let h = 0; h < 24; h++) { const meter = day.d.reduce((s, o) => s + o.imp[h], 0) + P.dc[k][h] + E3.parkMW(P, S); farm = Math.max(farm, day.farm.use[h] - day.farm.gen[h], day.farm.use[h] - meter); }
    });
    ok(worst < 1e-5, pl.id + ": every district-hour balances (worst " + worst.toExponential(1) + ")");
    ok(over < 1e-6, pl.id + ": imports within limit + upgrade; rooftop use within its output");
    ok(soc < 1e-6 && dhb < 1e-5, pl.id + ": batteries and the heat store follow their state equations (cyclic in each day)");
    ok(evd < 1e-6, pl.id + ": each day's EV charge is charged that day");
    ok(farm < 1e-6, pl.id + ": the farms within their output and the city's load");
    // the duals
    raw.upg.forEach((u, i) => {
      let val = 0; raw.days.forEach(d => d.d[i].lim.forEach(v => { val += v; }));
      if (u > 1e-4) ok(near(val, S.a.up, 1e-3 * S.a.up), pl.id + " " + P.D[i].key + ": summed substation duals = the upgrade's yearly cost (" + Math.round(val) + ")");
      raw.days.forEach((d, k) => d.d[i].bal.forEach((b, h) => { if (Math.abs(b - (P.D[i].pEl + (d.d[i].lim[h] + d.d[i].tie[h]) / P.w[k])) > 1e-3) { ok(false, pl.id + " balance dual " + i + " " + k + " " + h + " " + b); } }));
    });
    checks++;
  }
  ok(Object.keys(runs).length === plans.length, "every plan solved");

  // the substation value as a cost slope (no corner: equal slopes up and down), on the flex preset's dense core
  {
    const st = E3.withPreset(def, E3.presets[2]), S = E3.sysOf(st, P);
    const base = runs["sb3 flex"], lim = P.D.map(D => D.L);
    for (let i = 0; i < 3; i++) {
      const up = lim.slice(), dn = lim.slice(); up[i] += 0.1; dn[i] -= 0.1;
      const zu = solveSync(E3.build(P, S, { limits: up })).objective, zd = solveSync(E3.build(P, S, { limits: dn })).objective;
      let val = 0; base.raw.days.forEach(d => d.d[i].lim.forEach(v => { val += v; }));
      const su = (base.r.objective - zu) / 0.1, sd = (zd - base.r.objective) / 0.1;
      ok(near(su, val, Math.max(5, 1e-3 * val)) && near(sd, val, Math.max(5, 1e-3 * val)), "flex " + P.D[i].key + ": the summed substation value ($" + Math.round(val) + " per MW a year) is the cost slope both ways ($" + Math.round(su) + ", $" + Math.round(sd) + ")");
    }
  }

  // ---------------- ties: x10, x0.1 and the optimal face
  const report = (S, raw) => { const A = E3.account(P, S, raw); return { cost: A.total, co2: A.co2Hub, city: A.city.co2, pk: raw.pk.slice(), upg: raw.upg.slice(), pkC: raw.pkC, hh: E3.households(P, S, A, A).rows.map(x => x.home) }; };
  for (const id of Object.keys(runs)) {
    const { S, m, r, raw } = runs[id], a = report(S, raw);
    [2, 0.1].forEach(t => {
      const m2 = E3.build(P, S, { tie: t }), r2 = solveSync(m2), b = report(S, E3.read(P, S, m2, r2));
      ok(near(a.cost, b.cost, 1000) && near(a.co2, b.co2, 1) && near(a.city, b.city, 1) && a.pk.every((v, i) => near(v, b.pk[i], 0.5)) && a.upg.every((v, i) => near(v, b.upg[i], 0.05)) && near(a.pkC, b.pkC, 0.5) && a.hh.every((v, i) => near(v, b.hh[i], 1)),
        id + ": every reported number the same with the tie costs x" + t + " (pk " + a.pk.map(v => v.toFixed(1)) + " vs " + b.pk.map(v => v.toFixed(1)) + "; city " + a.pkC.toFixed(1) + " vs " + b.pkC.toFixed(1) + ")");
    });
    // the face: min and max of each district's busiest hour, the city's, each upgrade and the hub's purchases
    const imps = m.variables.filter(v => /^i\d_/.test(v.name)).map(v => { const k = +v.name.split("_")[1]; return [v.name, P.w[k]]; });
    const items = P.D.map((D, i) => ["pk" + i, [["pk" + i, 1]], 0.5]).concat(P.D.map((D, i) => ["upg" + i, [["upg" + i, 1]], 0.05])).concat([["pkC", [["pkC", 1]], 0.5], ["purchases (MWh)", imps, 5]]);
    items.forEach(([nm, terms, tol]) => {
      const lo = X.face(m, r, terms, "min", solveSync), hi = X.face(m, r, terms, "max", solveSync);
      ok(lo != null && hi != null && hi - lo <= tol, id + ": " + nm + " is the same on the whole optimal face (" + (lo == null ? "?" : lo.toFixed(2)) + " to " + (hi == null ? "?" : hi.toFixed(2)) + ")");
    });
  }

  // ---------------- the household layer
  for (const id of Object.keys(runs)) {
    const { S, raw } = runs[id], A = E3.account(P, S, raw), h = E3.households(P, S, A, R0.acc);
    ok(!h.clamped, id + ": no group's use goes below zero");
    ok(h.rows.every(x => isFinite(x.home) && x.home > 0 && x.burden > 0), id + ": every group has bills and a burden");
  }
  {
    // the measures' changes add up to the engine's: electricity, gas and propane of the homes, summed over the groups
    const { S, raw } = runs["sb3 electrify"], A = E3.account(P, S, raw), h = E3.households(P, S, A, R0.acc);
    const G = city.groups, mm = city.units.mwhPerMMBtu;
    const dGas = h.rows.reduce((s, x, j) => s + x.households * (x.bill.gas / P.price.gasRes - G[j].use.gasMMBtu * mm), 0);
    let eng = 0; P.D.forEach((D, i) => { eng += D.rho * ((A.d[i].gas - D.otherGas) - (R0.acc.d[i].gas - D.otherGas)); });
    ok(near(dGas, eng, Math.abs(eng) * 1e-6 + 1), "electrify: the groups' gas change adds up to the homes' change in the engine (" + Math.round(dGas) + " vs " + Math.round(eng) + " MWh)");
    const n = E3.spread([100, 100, 100], 0.5, 60, "low");
    ok(n[0] === 50 && n[1] === 10 && n[2] === 0, "lower incomes first: the lowest group's eligible homes fill first");
    const e = E3.spread([100, 300, 100], 1, 100, "even");
    ok(near(e[0], 20) && near(e[1], 60) && near(e[2], 20), "every group alike: in proportion to eligible homes");
  }

  // ---------------- failure states and hints
  {
    const st = E3.withPreset(def, E3.presets[1]); st.up = "no";
    const r = await E3.solve(st, P, { solver });
    ok(!r.ok && r.status === "infeasible" && /Short by/.test(r.hint), "no upgrades allowed: infeasible, with a hint (" + r.hint + ")");
    const ups = runs["sb3 electrify"].raw.upg;
    P.D.forEach((D, i) => { if (ups[i] > 0.05) ok(r.hint.indexOf(E3.kilo(Math.ceil(ups[i])) + " MW in the " + D.label.toLowerCase()) >= 0, "the hint names " + D.key + "'s shortfall, the upgrade it would buy"); });
    const re = await E3.solve(def, P, { solver: () => Promise.resolve({ status: "error", ok: false, message: "stub" }) });
    ok(!re.ok && re.status === "error", "a solver error gives status error");
    const rt = await E3.solve(def, P, { solver: () => Promise.reject(new Error("boom")) });
    ok(!rt.ok && rt.status === "error" && /boom/.test(rt.message), "a rejected solve gives status error, never a rejection");
    const rc = await E3.solve(Object.assign({}, def, { ev: 50, evm: "managed" }), P, { solver, size: true, cap: 0.3 * R0.acc.co2Hub, retMax: 0.6, dhMax: 0.4 });
    ok(!rc.ok && rc.status === "infeasible" && /cap/.test(rc.hint), "a cap no plan meets: infeasible, with a hint");
  }

  // ---------------- sizing (M12): the cap's dual is the cost slope
  {
    const st = Object.assign({}, def, { ev: 50, evm: "managed" }), cap = 0.7 * R0.acc.co2Hub, o = { size: true, retMax: 0.6, dhMax: 0.4 };
    const S = E3.sysOf(st, P), m = E3.build(P, S, Object.assign({ cap }, o)), r = solveSync(m), raw = E3.read(P, S, m, r);
    ok(r.status === "optimal" && raw.capDual > 1, "sizing under a cap at 70% of 2025: optimal, the cap binds ($" + Math.round(raw.capDual) + " a tonne)");
    const zu = solveSync(E3.build(P, S, Object.assign({ cap: cap + 100 }, o))).objective, zd = solveSync(E3.build(P, S, Object.assign({ cap: cap - 100 }, o))).objective;
    ok(near((r.objective - zu) / 100, raw.capDual, 0.01 * raw.capDual) && near((zd - r.objective) / 100, raw.capDual, 0.01 * raw.capDual), "the cap's dual is the cost slope both ways (" + ((r.objective - zu) / 100).toFixed(1) + ", " + ((zd - r.objective) / 100).toFixed(1) + ")");
    const A = E3.account(P, S, raw);
    ok(near(A.co2Hub, cap, 1), "the hub's CO2 sits on the cap (" + Math.round(A.co2Hub) + ")");
  }

  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (engine E3)");
  process.exit(fails ? 1 : 0);
})();
