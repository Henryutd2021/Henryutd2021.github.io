// test_e3-engine.js — Node tests for engine E3 (assets/learn/components/engine-e3.js, LX.E3) with the vendored HiGHS, the
// solver core the pages run in a Web Worker. What it checks:
//   - the data: e3-city-hub.json's costs read from other course files (e0.json, e2-plains-grid.json, 13-capstone.json)
//     and converted as those lessons convert them; the fictional line is prairie-city.json's; no nuclear term
//   - the plan links: SB3's and C3's schemas valid; defaults and presets valid and round-trip
//   - 2025 as it is: each district buys its 2025 electricity less the rooftop solar it uses; its busiest hour is
//     prairie-city.json's peak2025MW; the city's CO2 agrees with the 2025 inventory (both count grid-supplied
//     electricity): row by row except distribution losses, within the rounding of the hourly data; the losses row
//     differs by 5% of the rooftop MWh at the grid rate (the inventory takes losses on all electricity used, E3 on
//     electricity bought), about 600 t
//   - the model as built, for every preset of SB3 and C3: every district-hour balances; imports within the limit plus the
//     upgrade; batteries and the heat store follow their state equations, cyclic in each day; managed charging moves
//     each day's energy within the day; the network's heat balances; the farms never exceed their output or the city's load
//   - prices and duals only from the LP, never from a MILP: each district's summed substation duals equal the upgrade's yearly cost
//     when an upgrade is bought; the summed value equals the cost slope when the limit moves 0.1 MW up and down; the
//     balance dual of a district-hour is its retail price plus the substation's value that hour; the CO2 cap's dual equals
//     the cost slope when the cap moves 100 t
//   - ties: every reported number (cost, CO2, busiest hours, upgrades, the city's busiest hour, the
//     household table) is the same with the tie costs x2 and x0.1, and the min and max of each over the optimal face
//     agree (within half a MW, 0.05 MW, 1 t, $1,000); the tie costs trade less than $30 a year of economic cost (the
//     economic optimum: ties x0) on every preset and on a heavy SB3 plan, where the ties cost most
//   - location-based CO2: contract wind and solar never change it; the market-based claim is
//     reported apart; hours at the limit are weighted by the days
//   - the household layer (kept apart from the model's costs): 2025 as it is reproduces prairie-city.json's group bills
//     and burdens; each measure's changes add up to the engine's district changes; no group's use goes below zero for
//     any preset, rule or slider end; the fitted gasoline table adds up both ways; the charging the plan adds is
//     transport, not home energy; lower incomes first puts the first adopters in the lowest group
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
  ok(near(E3.copAt(city.cop, -15), 2.4, 1e-9) && near(E3.copAt(city.cop, 0), 3.2, 1e-9) && city.cop.cutoutC === -23 && E3.copAt(city.cop, -23.5) === 1, "the COP the inputs table states: 2.4 at -15 C, 3.2 at 0 C, 1 below -23 C");
  const inp = E3.inputsHTML(P), inpF = E3.inputsHTML(P, { fixed: true }), inpC = E3.inputsHTML(P, { c3: true });
  ok(/an illustrative curve/.test(inp) && /anchored to DOE&#39;s|anchored to DOE's/.test(inp) && /resistance backup assumed below −23 °C/.test(inp) && /24 Sep 2021/.test(inp), "COP: an illustrative curve anchored to DOE's dated target, backup assumed");
  const hr = city.districts.map(x => Math.round((x.substationMW / x.peak2025MW - 1) * 100) + "%");
  ok(inp.indexOf("× 1.15, rounded up to the next 10 MW (" + hr[0] + ", " + hr[1] + " and " + hr[2] + " above it") >= 0 && hr.join() === "17%,20%,25%", "the limits: 2025 peak x 1.15 rounded up to 10 MW, " + hr.join(", ") + " above it");
  ok(!/ranges you set/.test(inp + inpF) && inpF.indexOf(E3.money(cfg.retrofit.cost.def) + " · " + cfg.retrofit.save.def + "% · ") >= 0 && inpF.indexOf(E3.money(cfg.upgrade.capex.def) + " per kW") >= 0 && /fixed here at the defaults/.test(inpF) && /which you change on the bench/.test(inp), "the teaching costs shown with their defaults and lives, and where they can be changed");
  ok(/assumed to exist already: its fuel is counted, not its construction/.test(inp) && /plugged in at home or work/.test(inp), "the boiler and managed-charging assumptions are stated");
  ok(inpC.indexOf("$" + city.prices.gasPerMcf.industrial.toFixed(2) + " per thousand cubic feet") >= 0 && /EIA publishes no 2025 Kansas industrial price/.test(inpC), "C3: the park's gas price, its derivation and source");
  ok(inp.indexOf(P.D.map(D => E3.kilo(D.L)).join(" · ") + " MW") >= 0 && inp.indexOf(E3.kilo(city.emissions.gridLbPerMWh.sppNorth) + " lb per MWh") >= 0 && inp.indexOf(E3.money(cfg.heatPump.capex)) >= 0, "the inputs table reads the data");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(SRC + DATA), "no nuclear term in the engine or its data");
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
  // E3 and the 2025 inventory: both count grid-supplied electricity (rooftop solar used on site is not bought). Without
  // the losses row they agree within the rounding of the hourly data (0.1 MW) and of the file's yearly figures; the
  // losses row differs by 5% of the rooftop MWh at the grid rate, because the inventory takes distribution losses on all
  // the electricity used (rooftop solar too) and E3 on what is bought through the substations
  const inv = city.inventory2025, pvUsed0 = R0.acc.d.reduce((s, o) => s + o.pvUsed, 0);
  const lossE3 = (A0c.d.reduce((s, o) => s + o.imp, 0) + A0c.outside.el) * P.ef.grid * P.ef.loss, roofLoss = pvUsed0 * P.ef.grid * P.ef.loss;
  ok(near(pvUsed0, city.supply.rooftopMWh, 1), "2025: the rooftop solar used is prairie-city.json's rooftop MWh (" + Math.round(pvUsed0) + ")");
  ok(near(A0c.city.co2 - lossE3, inv.total - inv.sectors.grid_losses, 100), "the city's CO2 without the losses row = the inventory's (" + Math.round(A0c.city.co2 - lossE3) + " vs " + (inv.total - inv.sectors.grid_losses) + ")");
  ok(near(inv.sectors.grid_losses - lossE3, roofLoss, 30), "the losses rows differ by 5% of the rooftop MWh at the grid rate (" + Math.round(inv.sectors.grid_losses - lossE3) + " vs " + Math.round(roofLoss) + " t)");
  ok(near(inv.total - A0c.city.co2, 665, 100) && Math.abs(inv.total - A0c.city.co2) / inv.total < 5e-4, "E3's 2025 city CO2 is within 0.05% of the inventory, about 600 t lower, as the README says (" + Math.round(inv.total - A0c.city.co2) + " t)");
  const g0 = R0.hh;
  g0.rows.forEach((x, j) => ok(near(x.home0, city.groups[j].homeEnergy, 0.01) && near(x.home, x.home0, 1e-6) && near(x.fuel, x.fuel0, 1e-6) && near(x.burden, city.groups[j].burden, 1e-4), "households " + x.key + ": 2025 bills and burden as prairie-city.json (" + Math.round(x.home) + ")"));
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

  // the tie costs' price in economic cost: the economic optimum (ties x0) against the economic cost of the tie rule's
  // schedule, on every preset and a heavy SB3 plan (50% district heat, a 250 MW heat pump, a 2,000 MWh store, 200 MW
  // of batteries, managed charging): under $30 a year, the bound the pages state
  {
    const extra = [["sb3 heavy", Object.assign({}, def, { dh: 50, dhp: 250, sto: 2000, bat: 200, evm: "managed" })], ["sb3 heavy, half EVs", Object.assign({}, def, { dh: 50, dhp: 250, sto: 2000, bat: 200, evm: "managed", ev: 50 })]];
    let worstGap = 0;
    for (const [id, S, m, r] of Object.keys(runs).map(k => [k, runs[k].S, runs[k].m, runs[k].r]).concat(extra.map(([id, st]) => { const S = E3.sysOf(st, P), m = E3.build(P, S); return [id, S, m, solveSync(m)]; }))) {
      const m0 = E3.build(P, S, { tie: 0 }), r0 = solveSync(m0);
      const econ = m0.variables.reduce((t, v) => t + v.cost * (r.values[v.name] || 0), 0), gap = econ - r0.objective;
      worstGap = Math.max(worstGap, gap);
      ok(r0.status === "optimal" && gap > -1e-3 && gap < 30, id + ": the tie rule costs $" + gap.toFixed(2) + " a year of economic cost (under $30)");
    }
    ok(worstGap > 20, "the heavy SB3 plan is the one where the ties cost most ($" + worstGap.toFixed(2) + " a year; the pages say under $30)");
  }

  // ---------------- hours at the limit: weighted by the days, from the slack
  {
    const { S, raw } = runs["sb3 flex"], A = E3.account(P, S, raw), R = E3.summarize(E3.withPreset(def, E3.presets[2]), P, raw, { raw: R0.raw, acc: R0.acc });
    R.dist.forEach((d, i) => {
      let hrs = 0, slots = 0; raw.days.forEach((day, k) => day.d[i].imp.forEach((v, h) => { if (v >= P.D[i].L + raw.upg[i] - 1e-3) hrs += P.w[k]; if (day.d[i].lim[h] > 1e-6) slots++; }));
      ok(near(d.bindHours, hrs) && d.bindSlots === slots && (d.bindHours === 0 || d.bindHours >= d.bindSlots), "flex " + d.key + ": " + d.bindHours + " hours a year at the limit (weighted, from the slack); " + slots + " representative hours with a positive dual");
    });
    ok(R.dist[0].bindHours === 36 && R.dist[0].bindSlots === 9, "flex, the core: 36 hours a year at its limit, 9 representative hours with a positive dual");
  }

  // ---------------- C3: location-based CO2; the contract's market-based claim apart
  {
    const wind = Object.assign({}, c3d, { wind: 400, farm: 150 }), rw = await E3.solve(wind, P, { solver }), Rw = rw.results;
    ok(rw.ok && near(Rw.acc.city.co2, A0c.city.co2, 1e-6) && Rw.acc.contract.mwh > 1e5, "contract wind and solar alone leave the city's location-based CO2 as in 2025 (" + Math.round(Rw.acc.city.co2) + ")");
    ok(near(Rw.acc.contract.t, Rw.acc.contract.mwh * P.ef.grid, 1e-6) && Rw.acc.contract.mwh <= Rw.acc.contract.gen + 1e-6, "the market-based claim is the contract MWh used at the grid's average rate, reported apart");
    const n = E3.note(wind, Rw, P);
    ok(n.results.some(x => /Contract wind and solar the city used/.test(x.label) && /not deducted/.test(x.note)) && n.assumptions.some(x => /does not lower the location-based CO₂/.test(x)), "the note keeps the contract apart from the location-based CO2");
    ok(JSON.stringify(E3.c3presets[0].state) === JSON.stringify({ hp: 0, ret: 0, dh: 0, dhp: 0, sto: 0, ev: 1, evm: "home", pv: 0, bat: 0, up: "yes", ihp: 0, ely: 0, wind: 0, farm: 0 }), "C3's \"2025 as it is\" resets every lever of the plan");
    const back = E3.withPreset(Object.assign({}, c3d, { hp: 70, ihp: 100, ely: 50, wind: 200, farm: 100 }), E3.c3presets[0]), rb = await E3.solve(back, P, { solver });
    ok(rb.ok && near(rb.results.acc.upfrontTotal, 0, 1e-6) && near(rb.results.acc.city.co2, A0c.city.co2, 1e-6), "after a plan, \"2025 as it is\" brings back 2025: no spending, 2025's CO2");
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
    const dGas = h.rows.reduce((s, x) => s + x.households * x.d.gas, 0);
    let eng = 0; P.D.forEach((D, i) => { eng += D.rho * ((A.d[i].gas - D.otherGas) - (R0.acc.d[i].gas - D.otherGas)); });
    ok(near(dGas, eng, Math.abs(eng) * 1e-6 + 1), "electrify: the groups' gas change adds up to the homes' change in the engine (" + Math.round(dGas) + " vs " + Math.round(eng) + " MWh)");
    // the money and the burden are lesson A13's (LX.A13.allocate): bills = 2025's + the energy changes at 2025 prices +
    // the households' share of the shared costs by the plan's design; the designs move the same cost (a transfer)
    const A13 = require(L("components/whopays.js"));
    ok(E3.a13() === A13 && h.a13 && h.a13.design === "kwh", "the household layer's money is A13's allocate (per kWh by default)");
    ok(h.rows.every((x, j) => near(x.home, city.groups[j].homeEnergy + h.a13.rows[j].spendAfter - h.a13.rows[j].spend, 1e-6)) && near(h.a13.total, h.cost, 1e-6), "bills = 2025's + the changes + the shared-cost charge; the charges add to the cost recovered");
    const meter = A.d.reduce((t, o) => t + o.imp + o.pvUsed, 0), adder = (A.money.up + A.money.bat) / meter;
    ok(h.rows.every((x, j) => near(x.charge, adder * h.a13.rows[j].kWhAfter / 1000, 1e-6)), "per kWh: every household pays the shared costs' rate on each kWh, as the districts' customers do");
    const others = ["fixed", "income"].map(rec => E3.households(P, Object.assign({}, S, { rec }), A, R0.acc));
    others.forEach(o => { const t = A13.transfers(h.a13, o.a13); ok(Math.abs(t.sum) < 1e-6 && near(o.cost, h.cost, 1e-9), o.design + ": the same cost moved between groups (a transfer, sum " + t.sum.toExponential(1) + ")"); });
    ok(others[1].rows[0].charge < h.rows[0].charge && others[0].rows[0].charge > others[1].rows[0].charge, "by income the lowest group pays least; a fixed charge more than by income");
    // the fitted gasoline table: rows are the districts' non-electric cars' gasoline, columns the groups' (prairie-city.json)
    const FM = E3.fuelMatrix(P), colSum = j => FM.M.reduce((t, r) => t + r[j], 0);
    ok(FM.M.every((r, i) => near(r.reduce((a, b) => a + b, 0), (P.D[i].ldv - P.D[i].evs0) * P.galPerCar, 1e-3)) && city.groups.every((g, j) => near(colSum(j), g.households * g.use.gasolineGal, 0.01 * g.households)) && FM.M.every(r => r.every(x => x > 0)),
      "the gasoline table adds up to each district's cars and to each group's gasoline (within the file's rounding)");
    // charging is transport: a plan that changes only the cars leaves home bills as in 2025 except
    // the shared costs' charge; the charging added equals the engine's EVs x a car's charging
    for (const evm of ["home", "managed"]) {
      const st = Object.assign({}, def, { ev: 50, evm }), r = await E3.solve(st, P, { solver }), hc = r.results.hh;
      ok(hc.rows.every(x => near(x.home - x.home0, x.charge, 1e-6)) && near(hc.evMWh, P.D.reduce((t, D, i) => t + (r.results.sys.d[i].evs - D.evs0), 0) * P.evDay * 365, 1e-6),
        "cars only (" + evm + "): home bills change by the shared-cost charge alone; the added charging (" + Math.round(hc.evMWh) + " MWh) is transport");
      ok(hc.rows.every(x => near(x.tr, x.fuel + x.charging, 1e-9) && x.charging > 0 && x.fuel < x.fuel0) && near(hc.costAll, hc.cost + hc.evCost, 1e-9) && hc.costAll <= hc.shared + 1e-6, "cars only (" + evm + "): transport = motor fuel + charging; households and charging pay no more than the shared costs");
      if (evm === "home") { const b1 = hc.low.burden - hc.low.burden0; ok(b1 >= -1e-9 && b1 < 0.002, "cars only: the low-income burden moves by the shared-cost charge only (" + (b1 * 100).toFixed(2) + " points)"); }
    }
    // every slider end, alone and together, with each rule: no group's use below zero, motor fuel never negative
    const ends = [{ ev: 100 }, { hp: 100 }, { ret: 100 }, { pv: 400 }, { ev: 100, evm: "managed" }, { hp: 100, ret: 100, ev: 100, pv: 400, dh: 50, dhp: 250, sto: 2000, bat: 200 }];
    for (const e of ends) for (const rule of ["even", "low", "high"]) {
      const r = await E3.solve(Object.assign({}, def, e, { rule }), P, { solver }), hx = r.results.hh;
      ok(r.ok && !hx.clamped && hx.rows.every(x => x.fuel >= 0 && x.home > 0 && x.tr >= 0), JSON.stringify(e) + " " + rule + ": every group's use stays at or above zero (motor fuel " + hx.rows.map(x => Math.round(x.fuel)).join(", ") + ")");
      if (e.ev === 100 && !e.hp) ok(hx.rows.every(x => near(x.fuel, 0, 0.5)), "every car electric: no group buys motor fuel");
    }
    const rf = await E3.solve(Object.assign({}, def, { ev: 100 }), P, { solver }), af = E3.hhAssume(rf.results);
    ok(af.some(x => /every group alike/.test(x) && /average household/.test(x)) && af.some(x => /substation upgrades and batteries/.test(x) && /per kWh/.test(x) && /rest of the plan's cost is not in their bills/.test(x)) && af.some(x => /equipment households buy is left out/.test(x) && /transport/.test(x)),
      "the household table's assumptions name the rule, what households pay and how, what is left out and how cars count");
    const n = E3.spread([50, 50, 50], 60, "low");
    ok(n[0] === 50 && n[1] === 10 && n[2] === 0, "lower incomes first: the lowest group's potential fills first");
    const e = E3.spread([100, 300, 100], 100, "even");
    ok(near(e[0], 20) && near(e[1], 60) && near(e[2], 20), "every group alike: in proportion to each group's potential");
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
    // the LP's own plans (M12's caps) under every rule: no group's use below zero; the settling step keeps each carrier's
    // total and moves cuts only along the rule's order (M12 step 7)
    const G = city.groups, mm = city.units.mwhPerMMBtu;
    for (const cp of [1, 0.8, 0.65]) {
      const Sx = E3.sysOf(st, P), mx = E3.build(P, Sx, Object.assign({ cap: cp * R0.acc.co2Hub }, o, { pvMax: 400, batMax: 200 })), rx = solveSync(mx), rw = E3.read(P, Sx, mx, rx), Ax = E3.account(P, Sx, rw);
      for (const rule of ["even", "low", "high"]) {
        const hx = E3.households(P, Object.assign({}, Sx, { rule }), Ax, R0.acc);
        const left = hx.rows.map((x, g) => [G[g].use.electricityKWh / 1000 + x.d.el, G[g].use.gasMMBtu * mm + x.d.gas, G[g].use.propaneGal / P.galPerMWh + x.d.prop]);
        ok(rx.status === "optimal" && !hx.clamped && left.every(v => v.every(q => q >= -1e-9)), "the LP's plan at " + Math.round(cp * 100) + "%, " + rule + ": every group's electricity, gas and propane at or above zero" + (hx.settled.el > 0.5 ? " (" + Math.round(hx.settled.el) + " MWh of the cut moved on)" : ""));
      }
    }
    const dd = [-5, 1, 2], moved = E3.settle([3, 4, 5], dd, "low");
    ok(moved === 2 && dd[0] === -3 && dd[1] === -1 && dd[2] === 2 && E3.settle([1, 1], [-3, 0], "even") === -1, "settle: the cut a group cannot take passes to the next in the rule's order; a cut larger than all use cannot be spread");
  }

  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (engine E3)");
  process.exit(fails ? 1 : 0);
})();
