// e3_harness.js — shared setup for the tests of engine E3 and its pages (SB3, M12, C3). Not a test itself (the test
// runner runs test_*.js only).
//   load()   the engine, its prepared data (prairie-city.json and e3-city-hub.json), the solver core with the vendored
//            HiGHS, LX.ShareState's pure part; solveSync(model, opts) and solver (a Promise-returning wrapper for E3.solve)
//   face(model, r, terms, sense)   the min or max of a linear expression over the optimal face (every plan whose cost is
//            within $1 of the best): the uniqueness check of a reported number
//   between, writeBlocks, norm, excerpts, register: as in e1_harness.js (re-exported)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const X1 = require("./e1_harness.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
async function load() {
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports;
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const E3 = require(L("components/engine-e3.js"));
  const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
  const city = J("prairie-city.json"), cfg = J("e3-city-hub.json");
  const P = E3.prepare(city, cfg);
  const SS = require(L("components/sharestate.js"));
  const solveSync = (m, o) => core.solveWith(highs, m, { timeLimit: (o && o.timeLimit) || 60 });
  const solver = (m, o) => Promise.resolve(solveSync(m, o));
  return { SITE, L, E3, city, cfg, P, SS, core, highs, solveSync, solver, J };
}
// the optimal face: keep every row, add "cost <= best + slack" and optimise a linear expression over it
function face(model, r, terms, sense, solveSync, slack) {
  const cost = model.variables.filter(v => v.cost).map(v => [v.name, v.cost]);
  const m = { sense: sense, variables: model.variables.map(v => Object.assign({}, v, { cost: 0 })), constraints: model.constraints.concat([{ name: "face", terms: cost, ub: r.objective + (slack == null ? 1 : slack) }]) };
  m.objective = { terms: terms };
  const q = solveSync(m);
  return q.status === "optimal" ? q.objective : null;
}
// ---------------------------------------------------------------- the full year (engine E3's full-year check)
// yearCity(city): prairie-city.json with its eight days replaced by the 365 days of 2025, built by its fullYear rule
// (the same rule as the Prairie City data build step, which writes the rule's constants and sums; the tests check this
// recomputation against them): every local day's SPP demand, wind and solar from local midnight (town_year.json; wind and
// solar per MW by LX.townProfile with EIA's monthly factors), temperatures by the daily cosine from the day's month's NOAA
// normals (the design and heat-wave days take the teaching extremes), base = baseMWPerShape x demand, heat = UA x
// max(0, 18.3 - T), the campus at IT x PUE(T); rounded as the eight days are stored. Each day has weight 1.
const r = (x, n) => { const m = Math.pow(10, n); return Math.sign(x) * Math.floor(Math.abs(x) * m + 0.5) / m + 0; };
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dates2025() { const out = []; for (let m = 0; m < 12; m++) for (let d = 1; d <= MD[m]; d++) out.push("2025-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0")); return out; }
// local day of 2025 -> town_year.json index (index i = the hour ending start_utc + i h); Central time, daylight time from 10 March to 2 November
function dayStart(year, date) {
  const t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(date + "T00:00:00Z");
  const dst = date > "2025-03-09" && date <= "2025-11-02";
  return Math.round((d0 - t0) / 3600000) + 1 + (dst ? 5 : 6);
}
function cosineDay(tn, tx) { const mid = (tn + tx) / 2, amp = (tx - tn) / 2; return Array.from({ length: 24 }, (_, h) => r(mid + amp * Math.cos(2 * Math.PI * (h - 15) / 24), 1)); }
function yearDays(city, year, cf, PR) {
  const FY = city.fullYear, N = city.heatModel.normalsF, fc = f => (f - 32) / 1.8, bal = city.heatModel.balanceC;
  const W = PR.townProfile("wind", 1, { year, targets: cf, monthlyCF: true, method: "power" }).mw, S = PR.townProfile("solar", 1, { year, targets: cf, monthlyCF: true }).mw;
  const dc = city.dataCenter, pue = T => dc.pue.base + dc.pue.perC * Math.max(0, T - dc.pue.aboveC);
  const K = {}; FY.districts.forEach(x => { K[x.key] = x; });
  return dates2025().map(date => {
    const m = +date.slice(5, 7), i = dayStart(year, date), design = FY.designDays.includes(date), hw = FY.heatWaveDays.includes(date);
    // as the builder's temps_for([m]): the month's normal, day-weighted over one month
    const tn = design ? city.heatModel.design.tmin : hw ? city.heatModel.heatwave.tmin : fc(N.tmin[m - 1] * MD[m - 1] / MD[m - 1]);
    const tx = design ? city.heatModel.design.tmax : hw ? city.heatModel.heatwave.tmax : fc(N.tmax[m - 1] * MD[m - 1] / MD[m - 1]);
    const temp = cosineDay(tn, tx), shape = year.demand.slice(i, i + 24), districts = {};
    city.districts.forEach(x => { const k = K[x.key];
      districts[x.key] = { base: shape.map(v => r(k.baseMWPerShape * v, 1)), heat: temp.map(T => r(k.uaMWperC * Math.max(0, bal - T), 1)) }; });
    return { key: date, label: +date.slice(8, 10) + " " + MON[m - 1], date: date, weight: 1, design: design, months: [], tempFrom: design ? "design" : hw ? "heatwave" : "month",
      tmin: r(tn, 1), tmax: r(tx, 1), temp: temp, demandShape: shape, wind: W.slice(i, i + 24).map(v => r(v, 3)), solar: S.slice(i, i + 24).map(v => r(v, 3)),
      districts: districts, dataCenterMW: temp.map(T => r(dc.itDrawMW * pue(T), 1)) };
  });
}
function yearCity(city) {
  const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
  const PR = require(L("components/profiles.js"));
  return Object.assign({}, city, { days: yearDays(city, J("town_year.json"), J("cf_targets.json"), PR) });
}
// the full-year check's plans: each page's default and presets (every other setting at its default), M12's own flexible
// plan and its LP's choice under the CO2 cap, C3's reference plan (the exemplars'); `pages` say who shows each. A plan's
// key is its plan link's (LX.ShareState.encode), so a page finds the entry for the plan on its bench.
function fullPlans(E3, cfg, SS, M12, C3P) {
  const S3 = E3.sb3Schema(cfg), C3S = E3.c3Schema(cfg), d3 = E3.defaults(S3), dc = E3.defaults(C3S), out = [];
  const add = (page, id, label, S, st, o) => out.push(Object.assign({ page, id, label, schema: S === S3 ? "sb3" : "c3", state: st, key: SS.encode(S, st) }, o || {}));
  E3.presets.forEach(p => add("sb3", p.id, p.label, S3, E3.withPreset(d3, p)));
  add("m12", "flex", M12.PLANS.flex.label, S3, Object.assign({}, d3, M12.PLANS.flex.state));
  add("m12", "choose", "The LP's choice, CO₂ ≤ " + M12.CHOOSE.capDef + "% of 2025", S3, Object.assign({}, d3, M12.CHOOSE.base),
    { size: { capPct: M12.CHOOSE.capDef, retMax: M12.CHOOSE.retMax, dhMax: M12.CHOOSE.dhMax, pvMax: M12.CHOOSE.pvMax, batMax: M12.CHOOSE.batMax } });
  E3.c3presets.forEach(p => add("c3", p.id, p.label, C3S, E3.withPreset(dc, p)));
  add("c3", "ref", "The exemplars' reference plan", C3S, Object.assign({}, dc, C3P.REF_PLAN));
  return out;
}
// every plan's check: the eight days' run (as its page runs it: C3's plans with the solar farm's site from A19's map, M12's
// choice under its cap), the year's re-run with the eight days' decisions kept, and the upgrades the year would buy.
// H: load()'s result; PY: E3.prepare(yearCity(city), cfg). The entries are what data/e3-full-year.json stores.
const FULL_DATE = "7 November 2026";
async function fullEntries(H, PY, o) {
  o = o || {};
  const { E3, cfg, P, SS, solver, city } = H;
  const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
  const M12 = require(L("m12-city-model.js")), C3P = require(L("c3-prairie-city-2040.js"));
  const A19 = require(L("components/siting.js")), AD = A19.withCity(J("a19-gis-siting.json"), city), CFT = J("cf_targets.json");
  const SM = C3P.siteModel(A19, AD, { solar: CFT.targets.solar.cf, wind: CFT.targets.wind.cf });
  const withSite = st => { const x = Object.assign({}, st); if (st.farm > 0) x.siteInfo = C3P.siteInfo(SM, st.site, st.farm); return x; };
  const rd = (v, d) => { const k = Math.pow(10, d || 0), x = Math.round(v * k) / k; return x === 0 ? 0 : x; };
  const plans = fullPlans(E3, cfg, SS, M12, C3P).filter(p => !o.only || o.only.includes(p.page + "/" + p.id));
  const bases = {}, out = [];
  for (const p of plans) {
    const st = p.schema === "c3" ? withSite(p.state) : p.state;
    let opt = { solver }, cap = null;
    if (p.size) {
      const t = await E3.solve(E3.defaults(E3.sb3Schema(cfg)), P, { solver });
      cap = t.results.acc.co2Hub * p.size.capPct / 100;
      opt = { solver, size: true, cap, retMax: p.size.retMax, dhMax: p.size.dhMax, pvMax: p.size.pvMax, batMax: p.size.batMax };
    }
    const r8 = await E3.solve(st, P, opt);
    if (!r8.ok) throw new Error("full year: " + p.page + "/" + p.id + " eight days: " + r8.status);
    const fy = await E3.fullYear(st, P, PY, r8.results, { solver, base: bases[p.schema] });
    if (!fy.ok) throw new Error("full year: " + p.page + "/" + p.id + ": " + fy.status + " " + (fy.message || ""));
    bases[p.schema] = fy.base;
    out.push({ page: p.page, id: p.id, label: p.label, key: p.size ? null : p.key, cap: cap == null ? null : rd(cap), upYearly: rd(fy.results.sys.a.up),
      days: E3.fullView(r8.results, P), year: E3.fullView(fy.results, PY, fy.rebuy), model: fy.model, _R8: o.keep ? r8.results : undefined, _FY: o.keep ? fy : undefined });
  }
  return out;
}
function fullText(city, cfg, plans) {
  return JSON.stringify({ about: "Engine E3's full-year check (SB3, M12 and C3): each page's default and presets, M12's own plans and C3's reference plan, run on prairie-city.json's eight representative days and again on all 8,760 hours of 2025 built by its fullYear rule, with the same LP and constraints and what the eight days decided kept (shares, sizes, substation upgrades); load a substation cannot carry left unserved. year.dist[].upg and peak: the upgrades each district would buy on the year instead, and its busiest hour then; year.unserved and shortDays: what the eight days' upgrades leave unserved, day by day. Solved with HiGHS on " + FULL_DATE + ", each entry checked against a fresh run. Too slow for a click, so the pages read it.",
    dataset: { creator: "Honglin Li", date: "2026-11-08", status: "Illustrative: Prairie City is fictional; the year's hours are built by a stated rule from SPP's 2025 shapes and NOAA's normals (synthetic weather).",
      source: "Engine E3's linear program, solved with HiGHS for the plans named in `plans`.", license: "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), Honglin Li. Built from Prairie City's hours: SPP shapes from EIA-930 (U.S. government works in the public domain) and NOAA's 1991-2020 climate normals (listed as CC0)." },
    line: city.about.line, date: FULL_DATE, unservedPerMWh: cfg.fullYear.unservedPerMWh,
    plans: plans.map(e => { const x = Object.assign({}, e); delete x._R8; delete x._FY; return x; }) }) + "\n";
}
module.exports = { SITE, L, load, face, yearCity, yearDays, dayStart, dates2025, fullPlans, fullEntries, fullText, FULL_DATE, between: X1.between, writeBlocks: X1.writeBlocks, norm: X1.norm, excerpts: X1.excerpts, register: X1.register };
