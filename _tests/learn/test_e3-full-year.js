// test_e3-full-year.js — Node tests for engine E3's full-year check (assets/learn/components/engine-e3.js: fullYear,
// fixedSys, fullView and the words; data/e3-full-year.json), 2026-11-07. What it checks:
//   - the year: prairie-city.json's fullYear rule rebuilt here from town_year.json and cf_targets.json (_tests/learn/
//     e3_harness.js yearCity) gives the builder's constants and sums: 365 days of 24 hours; the design and heat-wave days
//     (the 3 days of December to February and the 10 of July and August with SPP's highest 2025 hourly demand, the named
//     days among them); the eight representative days are days of this year, their demand, wind and solar unchanged;
//     degree-hours, heating degree days, the shape's sum, wind and solar capacity factors, the campus's energy; per
//     district UA x degree-hours = the annual heat need and the base scale x the shape's sum = the annual base energy, the
//     year's sums at 2025's buildings, and the 2025 load's busiest hour and its time
//   - the claims the words make: the three design-temperature days have the same temperatures and heat, so only their
//     base load differs; the year's 21 January is the eight days' design day within 0.5 MW in every hour (the scaling
//     nearly cancels); rooftop solar keeps its 17.6% capacity factor on both time sets
//   - the model: without the new options build() is the eight days' model (no unserved column, upgrades free); with them
//     the upgrades are fixed and the balances hold with the unserved energy, hour by hour on a winter week; a sized plan
//     keeps its shares and sizes (fixedSys); each plan's year never buys less upgrade than its eight days
//   - the reported numbers are the LP's own: with the tie costs x2 and x0.1 every number of the view is the same (three
//     plans); for M12's flexible plan, the largest short day's unserved energy and the suburbs' re-bought upgrade are the
//     same over every plan within $1 of the best cost (the optimal face; --face: every short day and every district)
//   - the data file: every entry equals a fresh run, byte for byte; the plans are the pages' (SB3's presets, M12's
//     own two, C3's presets and its reference plan); the words read their numbers from it; under 30 KB; site files only
//   - no full-year solve in a page: the pages read the data file and never call fullYear
// --write: recomputes data/e3-full-year.json (about half a minute of solving; the whole test takes about two minutes).
// Usage (from the site folder):  node _tests/learn/test_e3-full-year.js [--write] [--face]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e3_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const rel = (a, b, t) => Math.abs(a - b) <= t * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const sum = a => a.reduce((s, v) => s + v, 0);
const WRITE = process.argv.includes("--write"), FACE = process.argv.includes("--face");
const FPATH = X.L("data/e3-full-year.json");

(async () => {
  const H = await X.load();
  const { E3, city, cfg, P, SS, solveSync, solver, L } = H;
  const FYc = city.fullYear, year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
  const CY = X.yearCity(city), YD = CY.days, PY = E3.prepare(CY, cfg);

  // ---------------- the year, by the rule
  ok(YD.length === 365 && YD.every(d => d.weight === 1 && ["temp", "demandShape", "wind", "solar", "dataCenterMW"].every(k => d[k].length === 24)) && PY.hours === 8760, "365 days of 24 hours, weight 1 each (8,760 hours)");
  const dmax = d => Math.max(...d.demandShape), top = (ms, n) => YD.filter(d => ms.includes(+d.date.slice(5, 7))).sort((a, b) => dmax(b) - dmax(a) || (a.date < b.date ? -1 : 1)).slice(0, n).map(d => d.date).sort();
  const W = {}; city.days.forEach(d => { W[d.key] = d.weight; });
  ok(JSON.stringify(top([12, 1, 2], W.winter_design)) === JSON.stringify(FYc.designDays) && JSON.stringify(top([7, 8], W.summer_peak)) === JSON.stringify(FYc.heatWaveDays),
    "the design days (" + FYc.designDays.join(", ") + ") and heat-wave days: SPP's highest 2025 hourly demand in their months, as many as the extreme days' weights");
  ok(FYc.designDays.includes(city.days.find(d => d.design).date) && FYc.heatWaveDays.includes(city.days.find(d => d.key === "summer_peak").date), "the named extreme days are among them");
  city.days.forEach(d => { const y = YD.find(x => x.date === d.date);
    ok(y && JSON.stringify(y.demandShape) === JSON.stringify(d.demandShape) && JSON.stringify(y.wind) === JSON.stringify(d.wind) && JSON.stringify(y.solar) === JSON.stringify(d.solar), d.key + " (" + d.date + "): a day of the year, its demand, wind and solar unchanged"); });
  ok(city.days.filter(d => d.tempFrom === "teaching").every(d => JSON.stringify(YD.find(x => x.date === d.date).temp) === JSON.stringify(d.temp)), "the two extreme days keep their temperatures in the year");
  const bal = city.heatModel.balanceC;
  const DH = sum(YD.map(d => sum(d.temp.map(t => Math.max(0, bal - t))))), hdd = sum(YD.map(d => Math.max(0, 65 - (sum(d.temp) / 24 * 1.8 + 32))));
  ok(near(DH, FYc.degreeHours, 0.06) && near(hdd, FYc.hdd, 0.06) && FYc.degreeHours > FYc.degreeHoursDays, "degree-hours " + DH.toFixed(1) + " (eight days " + FYc.degreeHoursDays + ") and heating degree days " + hdd.toFixed(1) + " (NOAA " + FYc.hddNoaa + ")");
  ok(sum(YD.map(d => sum(d.demandShape))) === FYc.shapeSum && sum(city.days.map(d => d.weight * sum(d.demandShape))) === FYc.shapeSumDays, "the demand shape's sum over the year and over the weighted days");
  const cfY = k => sum(YD.map(d => sum(d[k]))) / 8760, cfD = k => sum(city.days.map(d => d.weight * sum(d[k]))) / 8760;
  ok(near(cfY("wind"), FYc.windCF.year, 6e-5) && near(cfY("solar"), FYc.solarCF.year, 6e-5) && near(cfD("wind"), FYc.windCF.days, 6e-5) && near(cfD("solar"), FYc.solarCF.days, 6e-5),
    "capacity factors: wind " + cfY("wind").toFixed(4) + " in the year, " + cfD("wind").toFixed(4) + " on the days; solar " + cfY("solar").toFixed(4) + " and " + cfD("solar").toFixed(4));
  ok(near(sum(YD.map(d => sum(d.dataCenterMW))), FYc.dataCenterMWh.year, 0.6) && near(sum(city.days.map(d => d.weight * sum(d.dataCenterMW))), FYc.dataCenterMWh.days, 0.6), "the campus's energy, year and days");
  const COP = T => E3.copAt(city.cop, T);
  FYc.districts.forEach((F, i) => {
    const x = city.districts[i], sh = x.heat.share;
    ok(F.key === x.key && rel(F.uaMWperC * FYc.degreeHours, x.heat.residentialMWh + x.heat.commercialMWh, 2e-6), x.key + ": UA x the year's degree-hours = the annual heat need");
    ok(near(F.baseMWPerShape * FYc.shapeSum, x.annualMWh.base, 0.6), x.key + ": base scale x the year's shape = the annual base energy (to the MWh it is stored in)");
    let hs = 0, bs = 0, he = 0, pk = -1, at = null, over = 0;
    YD.forEach(d => { const q = d.districts[x.key]; for (let h = 0; h < 24; h++) {
      hs += q.heat[h]; bs += q.base[h]; const e = q.heat[h] * (sh.resistance + sh.heatPump / COP(d.temp[h])); he += e;
      const ld = q.base[h] + e + x.evMWhPerDay * city.transport.evProfile[h]; if (ld > pk + 1e-9) { pk = ld; at = { date: d.date, hour: h }; } if (ld > x.substationMW) over++; } });
    ok(near(hs, F.heatMWh, 0.6) && near(bs, F.baseMWh, 0.6) && near(he, F.heatingElectricityMWh, 0.6) && rel(F.heatMWh, F.heatNeedMWh, 1e-4) && rel(F.baseMWh, F.baseNeedMWh, 1e-4), x.key + ": the year's heat, base and heating electricity (" + Math.round(he) + " MWh; eight days " + F.heatingElectricityDaysMWh + ")");
    ok(near(pk, F.peak2025MW, 0.051) && at.date === F.peakAt.date && at.hour === F.peakAt.hour && F.peak2025DaysMW === x.peak2025MW && over === F.hoursOverLimit2025, x.key + ": the 2025 load's busiest hour in the year, " + pk.toFixed(1) + " MW on " + at.date + " " + at.hour + ":00 (eight days " + x.peak2025MW + ")");
  });
  // the claims of the words
  const dd = FYc.designDays.map(t => YD.find(d => d.date === t));
  ok(dd.every(d => JSON.stringify(d.temp) === JSON.stringify(dd[0].temp) && city.districts.every(x => JSON.stringify(d.districts[x.key].heat) === JSON.stringify(dd[0].districts[x.key].heat))), "the three design days have the same temperatures and heat: only their base load differs");
  const j21 = YD.find(d => d.date === city.days[0].date);
  let j21gap = 0;
  city.districts.forEach(x => { const sh = x.heat.share, ld = (d, h) => d.districts[x.key].base[h] + d.districts[x.key].heat[h] * (sh.resistance + sh.heatPump / COP(d.temp[h]));
    for (let h = 0; h < 24; h++) j21gap = Math.max(j21gap, Math.abs(ld(j21, h) / ld(city.days[0], h) - 1)); });
  ok(city.days[0].design && j21gap < 0.005, "the year's 21 January is the eight days' design day within 0.5% in every hour, " + (100 * j21gap).toFixed(2) + "% at most (the base and heat scaling nearly cancel)");
  const roofCF = Q => sum(Q.sun.map((s, k) => Q.w[k] * sum(s))) / Q.hours;
  ok(near(roofCF(P), city.supply.rooftopCF, 1e-9) && near(roofCF(PY), city.supply.rooftopCF, 1e-9), "rooftop solar at its 17.6% capacity factor on the eight days and on the year");

  // ---------------- the model
  const S3 = E3.sb3Schema(cfg), d3 = E3.defaults(S3), el = E3.withPreset(d3, E3.presets.find(p => p.id === "electrify"));
  const m0 = E3.build(P, E3.sysOf(el, P), {});
  ok(!m0.variables.some(v => /^u\d/.test(v.name)) && m0.variables.filter(v => /^upg/.test(v.name)).every(v => v.lb === 0 && v.ub === Infinity) && m0.meta.unserved === false, "without the new options the model is the eight days' (no unserved column, upgrades free)");
  const r8 = await E3.solve(el, P, { solver }), Sy = E3.sysOf(el, PY);
  const my = E3.build(PY, Sy, { upFixed: r8.results.raw.upg, unserved: cfg.fullYear.unservedPerMWh }), ry = solveSync(my, { timeLimit: 600 });
  ok(ry.status === "optimal" && my.variables.filter(v => /^upg/.test(v.name)).every((v, i) => v.lb === r8.results.raw.upg[i] && v.ub === v.lb), "the year's model keeps the eight days' upgrades (" + r8.results.raw.upg.map(v => v.toFixed(1)).join(", ") + " MW)");
  const rawY = E3.read(PY, Sy, my, ry);
  let worst = 0;
  for (let k = 14; k < 21; k++) PY.D.forEach((D, i) => { const o = rawY.days[k].d[i]; for (let h = 0; h < 24; h++) worst = Math.max(worst, Math.abs(o.imp[h] + o.pv[h] + o.bd[h] - o.bc[h] - o.ev[h] - o.plant[h] - o.heat[h] + o.un[h] - o.base[h])); });
  ok(worst < 1e-5, "every district-hour of a January week balances with the unserved energy (worst " + worst.toExponential(1) + " MW)");
  ok(rawY.days.every((d, k) => d.d.every((o, i) => o.imp.every(v => v <= PY.D[i].L + rawY.upg[i] + 1e-6))), "every hour's purchase within the limit plus the eight days' upgrade");

  // ---------------- the entries: fresh runs (all plans, about half a minute)
  const E = await X.fullEntries(H, PY, { keep: true });
  const text = X.fullText(city, cfg, E);
  if (WRITE) fs.writeFileSync(FPATH, text);
  const FY = fs.existsSync(FPATH) ? JSON.parse(fs.readFileSync(FPATH, "utf8")) : null;
  ok(FY && fs.readFileSync(FPATH, "utf8") === text, "data/e3-full-year.json equals fresh runs, byte for byte (" + E.length + " plans; --write after a change)");
  ok(text.length < 30 * 1024, "the data file is small: " + (text.length / 1024).toFixed(1) + " KB (results only, no hourly series)");
  const ids = E.map(e => e.page + "/" + e.id).join(" ");
  ok(ids === "sb3/today sb3/electrify sb3/flex sb3/network m12/flex m12/choose c3/today c3/buildings c3/supply c3/ref", "the plans: SB3's presets, M12's flexible plan and its LP's choice, C3's presets and its reference plan (" + ids + ")");
  ok(FY && FY.line === city.about.line && FY.date === X.FULL_DATE && FY.unservedPerMWh === 10000, "the fictional line, the date, the penalty");
  const fsz = E.find(e => e.id === "choose"), fz = fsz._FY.results.raw, z8 = fsz._R8.raw;
  ok(z8.meta.size && JSON.stringify(fz.y) === JSON.stringify(z8.y) && ["pvAdd", "batAdd", "dhp", "sto"].every(k => near(fz.sizes[k], z8.sizes[k], 1e-9)), "M12's sized plan keeps its chosen shares and sizes on the year (fixedSys)");
  ok(E.every(e => e.year.dist.every((y, i) => y.upg >= e.days.dist[i].upg - 0.05)), "no plan's year buys less upgrade than its eight days");
  ok(E.every(e => e.days.unserved === 0 && e.year.shortDays.every(s => FYc.designDays.includes(s.day) && s.day !== city.days[0].date)), "unserved energy only in the year, only on February's design days (" + [...new Set(E.flatMap(e => e.year.shortDays.map(s => s.day)))].join(", ") + ")");
  ok(E.every(e => near(sum(e.year.shortDays.map(s => s.mwh)), e.year.unserved, 0.6) && near(sum(e.year.dist.map(d => d.unserved)), e.year.unserved, 1.6)), "the short days and the districts add up to the year's unserved energy");
  ok(E.every(e => Math.abs(e.year.cost / e.days.cost - 1) < 0.005 && Math.abs(e.year.co2 / e.days.co2 - 1) < 0.005), "every plan's yearly cost and CO2 within 0.5% of its eight days'");
  // ties: the view's numbers do not move with the tie costs (three plans)
  for (const id of ["sb3/electrify", "m12/flex", "c3/ref"]) {
    const e = E.find(x => x.page + "/" + x.id === id), R8 = e._R8, Sx = R8.raw.meta.size ? E3.fixedSys(R8.state, PY, R8.raw) : E3.sysOf(R8.state, PY);
    const vs = [2, 0.1].map(t => { const m = E3.build(PY, Sx, { upFixed: R8.raw.upg, unserved: cfg.fullYear.unservedPerMWh, tie: t }), r = solveSync(m, { timeLimit: 600 });
      if (r.status !== "optimal") return null; const raw = E3.read(PY, Sx, m, r); return E3.fullView(E3.summarize(R8.state, PY, raw, e._FY.base), PY, e._FY.rebuy); });
    const diff = vs.map(v => v ? Object.keys(v).filter(k => JSON.stringify(v[k]) !== JSON.stringify(e.year[k])) : ["status"]);
    ok(diff.every(d => !d.length), id + ": the year's view is the same with the tie costs x2 and x0.1" + (diff.some(d => d.length) ? " (differs: " + diff.map(d => d.join(",")).join(" | ") + ")" : ""));
  }
  // the optimal face: M12's flexible plan, each short day's unserved energy and each district's re-bought upgrade
  {
    const e = E.find(x => x.page === "m12" && x.id === "flex"), R8 = e._R8, Sx = E3.sysOf(R8.state, PY);
    const m = E3.build(PY, Sx, { upFixed: R8.raw.upg, unserved: cfg.fullYear.unservedPerMWh }), r = solveSync(m, { timeLimit: 600 });
    const dayU = k => { const t = []; PY.D.forEach((D, i) => { for (let h = 0; h < 24; h++) t.push(["u" + i + "_" + k + "_" + h, 1]); }); return t; };
    const bad = [];
    const days = FACE ? e.year.shortDays : [e.year.shortDays.reduce((a, b) => b.mwh > a.mwh ? b : a)];
    days.forEach(s => { const k = YD.findIndex(d => d.date === s.day), lo = X.face(m, r, dayU(k), "min", solveSync), hi = X.face(m, r, dayU(k), "max", solveSync); if (lo == null || hi == null || hi - lo > 0.1) bad.push(s.day + " " + lo + "–" + hi); });
    const mb = E3.build(PY, Sx, {}), rb = solveSync(mb, { timeLimit: 600 });
    PY.D.forEach((D, i) => { if (!FACE && D.key !== "suburbs") return; const lo = X.face(mb, rb, [["upg" + i, 1]], "min", solveSync), hi = X.face(mb, rb, [["upg" + i, 1]], "max", solveSync); if (lo == null || hi == null || hi - lo > 0.1) bad.push(D.key + " upgrade " + lo + "–" + hi); });
    ok(!bad.length, "M12's flexible plan: " + (FACE ? "each short day's unserved energy and each district's re-bought upgrade are" : "the largest short day's unserved energy and the suburbs' re-bought upgrade are") + " the same over every plan within $1 of the best cost" + (bad.length ? ": " + bad.join("; ") : ""));
  }

  // ---------------- the words read their numbers from the data
  if (FY) {
    const el8 = FY.plans.find(e => e.page === "sb3" && e.id === "electrify"), why = E3.fullWhy(el8, FYc, FY.date).map(x => x[1]).join(" "), rows = E3.fullRows(el8, P);
    const extra = sum(el8.year.dist.map((d, i) => d.upg - el8.days.dist[i].upg));
    ok(why.indexOf(extra.toFixed(1) + " MW more") >= 0 && why.indexOf(E3.kilo(el8.year.unserved) + " MWh unserved on " + E3.dateList(el8.year.shortDays.map(s => s.day))) >= 0 && why.indexOf(FY.date) >= 0, "the words for 'Electrify heat and cars': " + extra.toFixed(1) + " MW more, its unserved MWh and days, the date");
    ok(rows.length === 6 && rows.every(r => r.length === 4) && rows[2][2].indexOf(E3.kilo(el8.year.dist[0].peak) + " of 250 + " + E3.kilo(el8.year.dist[0].upg) + " MW of upgrade") === 0, "the card's rows: cost, CO2, three districts, unserved, each with eight days, year and gap (" + rows[2].slice(1).join(" | ") + ")");
    ok(FY.plans.every(e => E3.fullWhy(e, FYc, FY.date).length >= 5 && E3.fullRows(e, P).every(r => r.every(c => typeof c === "string"))), "words for every plan");
    const c3r = FY.plans.find(e => e.page === "c3" && e.id === "ref"), w3 = E3.fullWhy(c3r, FYc, FY.date).map(x => x.join(": ")).join(" ");
    ok(/Wind and sun/.test(w3) && w3.indexOf(E3.pct(FYc.windCF.days, 1)) >= 0 && w3.indexOf(E3.pct(FYc.solarCF.year, 1)) >= 0, "C3's words name the days' and the year's wind and solar capacity factors");
    const SSm = require(L("components/sharestate.js")), C3S = E3.c3Schema(cfg);
    ok(E3.fullFind(FY, "sb3", S3, Object.assign({}, el, { rule: "low", rec: "income" }), SSm) === el8 && E3.fullFind(FY, "sb3", S3, Object.assign({}, el, { hp: 75 }), SSm) === null
      && E3.fullFind(FY, "c3", C3S, E3.defaults(C3S), SSm) === FY.plans.find(e => e.page === "c3" && e.id === "today"), "a page finds its plan's entry (the household table's two choices ignored), and none for another plan");
    const blob = JSON.stringify(FY);
    ok(!/\bAI\b|ChatGPT|Claude|\bG-[A-Z]{2,}\b|\.py\b|\.md\b/.test(blob) && !/nuclear|reactor/i.test(blob), "the data file names only site files: no AI wording, no editorial codes, no files from outside the site; no nuclear term");
  }

  // ---------------- no full-year solve in a page
  const pages = ["sb3-city-planner.js", "m12-city-model.js", "c3-prairie-city-2040.js"].map(f => fs.readFileSync(L(f), "utf8"));
  ok(pages.every(t => !/fullYear\s*\(/.test(t)) && ["sb3-city-planner", "m12-city-model", "c3-prairie-city-2040"].every(id => /data\/e3-full-year\.json/.test(fs.readFileSync(path.join(X.SITE, "learn/" + id + ".qmd"), "utf8"))), "the pages read data/e3-full-year.json and never solve the year");

  console.log(fails ? fails + " of " + checks + " checks FAILED" : "test_e3-full-year: all " + checks + " checks pass");
  process.exit(fails ? 1 : 0);
})();
