// test_prairie_city.js — Node tests for Prairie City's shared data, assets/learn/data/prairie-city.json (scale S3),
// written by its data build step. Read by F9, F11, A13, A15, A18, SB3 (engine E3), M12, C3 and CK-A; pages read these numbers and never retype them.
//   - internal consistency: shares sum to 1, day weights sum to 365, every array has 24 hours, the Sankey's every node
//     balances, the carrier totals equal the balance table, burden = home energy spending / income per group, district
//     sums equal the city's totals, the district-by-group table's rows and columns match
//   - recomputed from the builder's inputs: the representative days against town_year.json and town_days.json (local
//     time, daylight saving included), wind and solar per unit against components/profiles.js (LX.townProfile with EIA's
//     monthly capacity factors), NOAA-based temperatures, the heat model (annual heat need, heating electricity, COP from
//     lesson F3's curve), base load, EVs, the data-center campus, the industry, transport, prices, emission factors and the
//     inventory; cross-file numbers read from f03, e0, e2, f08 and cf_targets, never retyped
//   - scope: no nuclear term, no "SMR" acronym, no "AI"; hydrogen is "made in gas reformers"; every link on the allow-list
//     (the course's allowed destinations); the README documents the data and the read-never-retype rule
// Usage (from the site folder):  node _tests/learn/test_prairie_city.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const RAW = fs.readFileSync(L("data/prairie-city.json"), "utf8");
const D = JSON.parse(RAW);
const year = require(L("data/town_year.json")), tdays = require(L("data/town_days.json")), cf = require(L("data/cf_targets.json"));
const f03 = require(L("data/f03-energy-services.json")), e0 = require(L("data/e0.json")), e2 = require(L("data/e2-plains-grid.json"));
const f08 = require(L("data/f08-large-loads.json"));
const PR = require(L("components/profiles.js"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const rel = (a, b, t) => Math.abs(a - b) <= t * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const sum = a => a.reduce((s, v) => s + v, 0);
const r = (x, n) => { const m = Math.pow(10, n); return Math.sign(x) * Math.floor(Math.abs(x) * m + 0.5) / m; };

// ---------------- the frame
ok(D.about.line === "Prairie City is fictional; its numbers are illustrative.", "the fictional line, word for word");
ok(D.dollarYear === 2025 && D.about.dollarYear === 2025, "2025 dollars");
ok(!D.about.builtBy && D.dataset && D.dataset.creator === "Honglin Li" && D.dataset.date === D.about.built && /^Illustrative: Prairie City is fictional/.test(D.dataset.status) && /^CC BY 4\.0/.test(D.dataset.license) && /`sources`/.test(D.dataset.source),
  "a reader's block: creator, date, status (fictional, illustrative), source and licence; no maintenance notes");
ok(RAW.length < 100 * 1024, "the file is under 100 KB (" + (RAW.length / 1024).toFixed(1) + " KB)");
const DIST = D.districts.map(d => d.key);
ok(JSON.stringify(DIST) === JSON.stringify(["core", "suburbs", "fringe"]), "three districts: dense core, suburbs, rural fringe");
ok(/one substation per district is a teaching simplification/i.test(D.about.simplifications.join(" ")) && /teaching simplification/.test(D.districtsNote), "one substation per district is said to be a teaching simplification");

// ---------------- sources: complete, allow-listed, every reference resolves
const ALLOW = ["eia.gov", "energy.gov", "nrel.gov", "nlr.gov", "epa.gov", "bea.gov", "census.gov", "bls.gov", "noaa.gov", "weather.gov",
  "fema.gov", "dot.gov", "irs.gov", "ferc.gov", "lbl.gov", "spp.org"];
const LICENCE_HOST = ["creativecommons.org"];   // the licence's own URL in dataset.license, not a source
Object.entries(D.sources).forEach(([k, s]) => {
  ok(s.title && s.publisher && s.date && s.url && s.where, "source " + k + " has title, publisher, date, url and where");
  if (s.url !== "no link") {
    const host = new URL(s.url).hostname;
    ok(ALLOW.some(a => host === a || host.endsWith("." + a)), "source " + k + " links an allow-listed host (" + host + ")");
  }
});
const srcRefs = [];
(function walk(x, k) {
  if (Array.isArray(x)) x.forEach(v => walk(v, k));
  else if (x && typeof x === "object") Object.entries(x).forEach(([kk, v]) => walk(v, kk));
  else if (typeof x === "string" && (k === "src" || /Src$/.test(k))) srcRefs.push(x);
})(D, "");
ok(srcRefs.length > 15 && srcRefs.every(s => D.sources[s]), "every src names a source in the file (" + srcRefs.filter(s => !D.sources[s]).join(", ") + ")");
(function urls(x) {
  if (Array.isArray(x)) x.forEach(urls);
  else if (x && typeof x === "object") Object.values(x).forEach(urls);
  else if (typeof x === "string") (x.match(/https?:\/\/[^\s"),;]+/g) || []).forEach(u => {
    const h = new URL(u).hostname; ok(ALLOW.concat(LICENCE_HOST).some(a => h === a || h.endsWith("." + a)), "link on the allow-list: " + u); });
})(D);

// ---------------- scope (the scope scan's deny-list; data centers appear as loads only)
ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(RAW), "no nuclear term and no 'SMR' acronym anywhere in the file");
ok(!/\bAI\b|artificial intelligence/.test(RAW), "no 'AI'");
ok(!/projects\/|research\.(html|qmd)|smr-dc/i.test(RAW), "no project page, no Research page");
ok(/gas reformers/.test(D.industry.fertilizer.note) && /gas reformers/.test(D.flows.nodes.find(n => n.id === "h2").label), "hydrogen is 'made in gas reformers'");
ok(/^A load only: its size, its shape over the day and the year, and its cooling\.$/.test(D.dataCenter.what) && DC_KEYS_OK(D.dataCenter), "the data-center campus is a load only: size, shape, cooling");

function DC_KEYS_OK(dc) {   // only size, shape, cooling and connection fields: no buyers, timing or technology
  return Object.keys(dc).every(k => ["what", "contractMW", "itMW", "itUtilization", "itDrawMW", "pue", "peakMW", "annualMWh", "averagePUE", "cooling",
    "connection", "sizeReason", "shape", "set", "src"].includes(k));
}

// ---------------- representative days
ok(D.days.length >= 4 && D.days.length <= 8, "4 to 8 representative days (" + D.days.length + ")");
ok(sum(D.days.map(d => d.weight)) === 365, "day weights sum to 365");
const design = D.days.filter(d => d.design);
ok(design.length === 1 && /design/i.test(design[0].label) && design[0].tempFrom === "teaching", "one cold winter design day, labelled, its temperatures set for teaching");
ok(D.days.every(d => ["temp", "demandShape", "wind", "solar", "dataCenterMW"].every(k => d[k].length === 24)
  && DIST.every(k => d.districts[k].base.length === 24 && d.districts[k].heat.length === 24)), "every hourly array has 24 values");
ok(new Set(D.days.map(d => d.date)).size === D.days.length, "eight different dates");
// local day of 2025 -> town_year.json index (index i = the hour ending start_utc + i h); Central time, daylight saving 9 Mar - 2 Nov
function dayStart(date) {
  const t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(date + "T00:00:00Z");
  const dst = date > "2025-03-09" && date <= "2025-11-02";   // 00:00 is standard time on 9 March, daylight time on 2 November
  return Math.round((d0 - t0) / 3600000) + 1 + (dst ? 5 : 6);
}
ok(dayStart("2025-07-29") === 208 * 24 + 23 && dayStart("2025-01-21") === 20 * 24, "the local-day index rule (standard and daylight time)");
D.days.forEach(d => {
  const i = dayStart(d.date);
  ok(JSON.stringify(year.demand.slice(i, i + 24)) === JSON.stringify(d.demandShape), d.key + ": demand shape is SPP's 2025 local day " + d.date);
});
ok(D.days.find(d => d.key === "winter_design").date === tdays.days.winter_peak.date
  && JSON.stringify(D.days.find(d => d.key === "winter_design").demandShape) === JSON.stringify(tdays.days.winter_peak.demand), "the design day is town_days' winter peak day");
ok(D.days.find(d => d.key === "summer_peak").date === tdays.days.summer_peak.date
  && JSON.stringify(D.days.find(d => d.key === "summer_peak").demandShape) === JSON.stringify(tdays.days.summer_peak.demand), "the summer peak day is town_days' summer peak day");
ok(D.days.every(d => d.months.length === 0 || d.months.every(m => +d.date.slice(5, 7) === m || d.months.includes(+d.date.slice(5, 7)))), "each typical day falls in the months it stands for");
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
ok(sum(D.days.filter(d => d.months.length).map(d => d.months.reduce((s, m) => s + MD[m - 1], 0))) === 365, "the typical days' month groups cover the year once");
D.days.filter(d => d.months.length).forEach(d => {
  const k = d.months.join(","), days = d.months.reduce((s, m) => s + MD[m - 1], 0);
  const extra = d.key === "winter" ? 3 : d.key === "summer" ? 10 : 0;   // the two named extreme days stand inside these groups
  ok(d.weight + extra === days, d.key + ": weight + the extreme day inside its months = days in its months (" + days + ")");
});
// wind and solar per unit, recomputed with the course's own component
const W = PR.townProfile("wind", 1, { year, targets: cf, monthlyCF: true, method: "power" });
const S = PR.townProfile("solar", 1, { year, targets: cf, monthlyCF: true });
ok(near(W.cf, cf.targets.wind.cf, 1e-6) && near(S.cf, cf.targets.solar.cf, 1e-6), "the year's per-unit profiles hit EIA's 2025 capacity factors");
D.days.forEach(d => {
  const i = dayStart(d.date);
  ok(d.wind.every((v, h) => near(v, W.mw[i + h], 0.0006)) && d.solar.every((v, h) => near(v, S.mw[i + h], 0.0006)), d.key + ": wind and solar per unit equal LX.townProfile's hours");
});
ok(D.days.every(d => d.solar.every(v => v >= 0 && v <= 1) && d.wind.every(v => v >= 0 && v <= 1)), "per-unit output between 0 and 1");
// temperatures: NOAA normals for the months (day-weighted), or the teaching extremes; a cosine from 03:00 to 15:00
const N = D.heatModel.normalsF, fc = f => (f - 32) / 1.8;
D.days.forEach(d => {
  let tn, tx;
  if (d.tempFrom === "noaa") {
    const w = d.months.reduce((s, m) => s + MD[m - 1], 0);
    tx = fc(d.months.reduce((s, m) => s + N.tmax[m - 1] * MD[m - 1], 0) / w); tn = fc(d.months.reduce((s, m) => s + N.tmin[m - 1] * MD[m - 1], 0) / w);
  } else { const X = d.design ? D.heatModel.design : D.heatModel.heatwave; tn = X.tmin; tx = X.tmax; }
  ok(near(d.tmin, r(tn, 1), 1e-9) && near(d.tmax, r(tx, 1), 1e-9), d.key + ": tmin and tmax from " + d.tempFrom);
  const T = Array.from({ length: 24 }, (_, h) => r((tn + tx) / 2 + (tx - tn) / 2 * Math.cos(2 * Math.PI * (h - 15) / 24), 1));
  ok(T.every((v, h) => near(v, d.temp[h], 1e-9)), d.key + ": hourly temperatures follow the cosine");
  ok(d.temp.indexOf(Math.min(...d.temp)) === 3 && d.temp.indexOf(Math.max(...d.temp)) === 15, d.key + ": coldest at 03:00, warmest at 15:00");
});
ok(N.tmax.length === 12 && N.tmin.length === 12 && N.tmax.every((v, m) => v > N.tmin[m]), "NOAA monthly normals: 12 maxima above 12 minima");
const meanF = sum(N.tmax.map((v, m) => (v + N.tmin[m]) / 2 * MD[m])) / 365;
ok(near(meanF, N.annualMean, 0.2), "the monthly normals give NOAA's annual mean, " + N.annualMean + " F (" + meanF.toFixed(2) + ")");
const hddRep = sum(D.days.map(d => d.weight * Math.max(0, 65 - (sum(d.temp) / 24 * 1.8 + 32))));
ok(near(hddRep, D.heatModel.hddRepresentative, 0.05) && rel(hddRep, D.heatModel.hddNoaa, 0.10), "representative-day heating degree days within 10% of NOAA's 4,413.6 (" + hddRep.toFixed(0) + ")");
ok(near(D.heatModel.balanceC, 18.3) && near((65 - 32) / 1.8, 18.33, 0.01), "balance point 65 F = 18.3 C");

// ---------------- the heat model and the COP curve (lesson F3's)
const HP = f03.heatpump;
ok(D.cop.supplyC === HP.supplyC && D.cop.anchorC === HP.anchorC && D.cop.anchorCOP === HP.anchorCOP && D.cop.cutoutC === HP.cutoutC, "the COP curve is F3's (read from f03-energy-services.json)");
const COP = T => T >= HP.cutoutC ? HP.anchorCOP * (HP.supplyC - HP.anchorC) / (HP.supplyC - T) : 1;
ok(near(COP(-15), 2.4, 1e-12) && near(COP(-15), 144 / 60, 1e-12) && COP(-24) === 1, "COP 2.4 at -15 C (DOE's target), 1 below the cut-out");
ok(D.cop.table.every(x => near(x.cop, r(COP(x.c), 2), 1e-9)), "the COP table equals the curve");
const DH = sum(D.days.map(d => d.weight * sum(d.temp.map(t => Math.max(0, D.heatModel.balanceC - t)))));
ok(near(DH, D.heatModel.degreeHours, 0.05), "degree-hours of the weighted days");
const sumHours = (f) => sum(D.days.map(d => d.weight * sum(Array.from({ length: 24 }, (_, h) => f(d, h)))));
D.districts.forEach(x => {
  const ua = x.heat.uaMWperC, sh = x.heat.share;
  ok(near(sum(Object.values(sh)), 1, 1e-5), x.key + ": heat shares by fuel sum to 1");
  ok(rel(ua * DH, x.heat.residentialMWh + x.heat.commercialMWh, 1e-5), x.key + ": UA x degree-hours = the annual heat need (" + (x.heat.residentialMWh + x.heat.commercialMWh) + " MWh)");
  ok(D.days.every(d => d.districts[x.key].heat.every((v, h) => near(v, r(ua * Math.max(0, D.heatModel.balanceC - d.temp[h]), 1), 0.051))), x.key + ": hourly heat = UA x max(0, 18.3 - T)");
  const hel = sumHours((d, h) => ua * Math.max(0, D.heatModel.balanceC - d.temp[h]) * (sh.resistance + sh.heatPump / COP(d.temp[h])));
  ok(rel(hel, x.annualMWh.residentialHeat + x.annualMWh.commercialHeat, 2e-4), x.key + ": heating electricity over the year from heat, shares and COP");
  const base = sumHours((d, h) => d.districts[x.key].base[h]);
  ok(rel(base, x.annualMWh.base, 5e-4), x.key + ": the hourly base load adds up to the annual base energy");
  const shp = sum(D.days.map(d => d.weight * sum(d.demandShape)));
  ok(D.days.every(d => d.districts[x.key].base.every((v, h) => near(v, r(x.annualMWh.base * d.demandShape[h] / shp, 1), 0.051 + 1e-9 * x.annualMWh.base))), x.key + ": base load follows SPP's demand shape");
  ok(near(x.annualMWh.base, x.annualMWh.residentialBase + x.annualMWh.commercialBase + x.annualMWh.farm, 1.01), x.key + ": base = homes + commercial + farms");
  // households, dwellings, heating fuel
  ok(sum(Object.values(x.dwellings)) === x.households && sum(Object.values(x.heating)) === x.households, x.key + ": dwellings and heating fuels each sum to the households");
  ok(near(sum(Object.values(x.envelope)), 1, 1e-9), x.key + ": envelope vintage shares sum to 1");
  ok(near(x.heatIntensity, r(sum(Object.keys(D.vintages).map(k => x.envelope[k] * D.vintages[k].heatKWhPerM2)), 2), 1e-9), x.key + ": heat intensity from the vintages");
  ok(x.households === Math.round(x.people / x.personsPerHousehold), x.key + ": households = people / persons per household");
  ok(near(x.heatedFloorM2, sum(Object.keys(x.dwellings).map(k => x.dwellings[k] * D.dwellingTypes[k].heatedM2)), 0.5), x.key + ": heated floor area from the dwellings");
  ok(rel(x.heat.residentialMWh, x.heatedFloorM2 * x.heatIntensity / 1000, 1e-4) && rel(x.heat.commercialMWh, x.commercialM2 * D.commercial.heatKWhPerM2 / 1000, 1e-9), x.key + ": heat need = floor area x intensity");
  // EVs and the peak
  ok(x.evs === Math.round(x.lightDutyVehicles * D.transport.evShare2025), x.key + ": EVs = vehicles x the 2025 share");
  ok(near(x.evMWhPerDay * 365, x.annualMWh.ev, 0.6) && near(x.annualMWh.ev, x.evs * D.transport.milesPerVehicle * D.transport.evKWhPerMile / 1000, 0.6), x.key + ": EV energy = EVs x miles x kWh per mile");
  let pk = 0;
  D.days.forEach(d => { for (let h = 0; h < 24; h++) pk = Math.max(pk, d.districts[x.key].base[h] + d.districts[x.key].heat[h] * (sh.resistance + sh.heatPump / COP(d.temp[h])) + x.evMWhPerDay * D.transport.evProfile[h]); });
  ok(near(pk, x.peak2025MW, 0.3), x.key + ": 2025 peak from base, heating electricity and EVs (" + pk.toFixed(1) + " MW)");
  ok(x.substationMW === Math.ceil(x.peak2025MW * 1.15 / 10) * 10 && x.substationMW >= x.peak2025MW * 1.1, x.key + ": substation limit 15% above the peak, rounded up to 10 MW");
});
ok(near(sum(D.transport.evProfile), 1, 1e-12) && D.transport.evProfile.length === 24, "the EV charging profile sums to 1 over 24 hours");
ok(near(sum(Object.values(D.commercial.heating)), 1, 1e-12), "commercial heating shares sum to 1");

// ---------------- district sums equal the city's totals
const C = D.city, T = C.totals;
const sd = f => sum(D.districts.map(f));
ok(T.people === sd(x => x.people) && C.people === T.people && T.people === 250000, "people: districts sum to the city's 250,000");
ok(T.households === sd(x => x.households) && C.households === T.households, "households: districts sum to the city");
ok(near(C.personsPerHousehold, r(C.people / C.households, 3)) && near(C.personsPerHousehold, C.anchors.wichitaPersonsPerHousehold, 0.03), "persons per household near Wichita's 2.47");
Object.keys(T.dwellings).forEach(k => ok(T.dwellings[k] === sd(x => x.dwellings[k]), "dwellings " + k + ": districts sum to the city"));
Object.keys(T.heating).forEach(k => ok(T.heating[k] === sd(x => x.heating[k]), "heating " + k + ": districts sum to the city"));
["heatedFloorM2", "commercialM2", "lightDutyVehicles", "evs", "rooftopSolarMW", "propaneGal", "substationMW"].forEach(k => ok(near(T[k], sd(x => x[k]), 1e-6), k + ": districts sum to the city"));
Object.keys(T.annualMWh).forEach(k => ok(near(T.annualMWh[k], sd(x => x.annualMWh[k]), 1e-6), "annual " + k + ": districts sum to the city"));
ok(T.lightDutyVehicles === D.transport.lightDutyVehicles && T.evs === D.transport.evs && T.rooftopSolarMW === D.supply.rooftopSolarMW, "transport and supply totals are the districts'");
ok(near(T.annualMWh.ev, D.transport.evMWh, 1.01), "EV electricity: districts sum to the transport block");
const HG = D.householdsByGroup;
ok(HG.households.every((row, i) => sum(row) === D.districts[i].households), "district-by-group table: each row sums to the district's households");
ok(D.groups.every((g, j) => g.households === sum(HG.households.map(row => row[j]))), "district-by-group table: each column sums to the group's households");
ok(sum(D.groups.map(g => g.households)) === C.households, "groups sum to the city's households");

// ---------------- household groups: burden = spending / income
const P = D.prices, pel = P.electricityCentsPerKWh.residential / 100, pgas = P.gasPerMcf.residential / (D.units.btuPerCf / 1000);
D.groups.forEach(g => {
  ok(near(g.spending.electricity, Math.round(g.use.electricityKWh * pel), 1) && near(g.spending.gas, Math.round(g.use.gasMMBtu * pgas), 1)
    && near(g.spending.propane, Math.round(g.use.propaneGal * P.propanePerGal), 1) && near(g.spending.motorFuel, Math.round(g.use.gasolineGal * P.gasolinePerGal), 1),
    g.key + ": spending = use x 2025 Kansas prices");
  ok(g.homeEnergy === g.spending.electricity + g.spending.gas + g.spending.propane, g.key + ": home energy = electricity + gas + propane");
  ok(near(g.burden, r(g.homeEnergy / g.income, 4), 1e-9) && near(g.transportBurden, r(g.spending.motorFuel / g.income, 4), 1e-9), g.key + ": burden = home energy / income; transport burden apart");
  const [lo, hi] = g.incomeRange;
  ok(lo === Math.round(g.amiPct[0] / 100 * C.ami) && (hi === null ? g.amiPct[1] === null : hi === Math.round(g.amiPct[1] / 100 * C.ami)) && g.income >= lo && (hi === null || g.income <= hi),
    g.key + ": mean income inside its AMI band");
});
ok(D.groups.every((g, j) => j === 0 || g.burden < D.groups[j - 1].burden), "burden falls as income rises");
const agg = gs => sum(gs.map(g => g.households * g.homeEnergy)) / sum(gs.map(g => g.households * g.income));
ok(near(agg(D.groups.slice(0, 3)), D.groupsNote.lowIncomeBurden, 1e-4) && near(agg(D.groups.slice(3)), D.groupsNote.otherBurden, 1e-4), "the groups' aggregate burdens are stated");
ok(near(D.groupsNote.lowIncomeBurden, D.groupsNote.leadLow, 0.01) && near(D.groupsNote.otherBurden, D.groupsNote.leadOther, 0.005), "near LEAD's 6% (0-80% AMI) and 2% (others)");
const totals = (k) => sum(D.groups.map(g => g.households * g.use[k]));
ok(rel(totals("electricityKWh"), (T.annualMWh.residentialBase + T.annualMWh.residentialHeat + T.annualMWh.ev) * 1000, 1e-4), "groups' electricity = homes' electricity + home EV charging");
ok(rel(totals("gasMMBtu"), T.gasMMBtu.residential, 1e-4) && rel(totals("propaneGal"), T.propaneGal, 1e-3) && rel(totals("gasolineGal"), D.transport.gasolineGal, 1e-4), "groups' gas, propane and gasoline = the city's household totals");
let cum = 0, med = null;
D.groups.forEach(g => { const f = g.households / C.households; if (med === null && cum + f >= 0.5) med = g.incomeRange[0] + (0.5 - cum) / f * (g.incomeRange[1] - g.incomeRange[0]); cum += f; });
ok(near(med, D.groupsNote.medianFromBands, 1) && rel(med, C.medianIncome, 0.05), "median household income from the bands within 5% of the anchor ($" + Math.round(med) + " vs $" + C.medianIncome + ")");
ok(C.medianIncome === Math.round(C.anchors.wichitaMedianIncome2024USD * C.anchors.gdpDeflator["2025"] / C.anchors.gdpDeflator["2024"])
  && e2.sources["bea-nipa-119"].text.includes("2024 125.587") && e2.sources["bea-nipa-119"].text.includes("2025 128.893")
  && C.anchors.gdpDeflator["2024"] === 125.587 && C.anchors.gdpDeflator["2025"] === 128.893, "median income in 2025 dollars with BEA's deflator (as e2-plains-grid.json)");

// ---------------- transport, industry, data center
const TR = D.transport;
ok(TR.mpg === f03.car.mpg && TR.milesPerVehicle === f03.car.miles, "car miles and mpg are F3's (EPA/FHWA)");
ok(TR.engineEfficiency === f03.efficiency.car.value && TR.evEfficiency === 0.89, "engine 30% (F3, DOE) and EV 89% (DOE's 87-91%)");
const ei = TR.evShareInputs;
ok(TR.evShare2025 === r((ei.ksEv2025 + ei.ksPhev2025) / (ei.ksAutos2023 + ei.ksTrucks2023), 4) && near(TR.evShare2025, 0.011, 0.001), "EV share 2025 = Kansas plug-ins (AFDC) / Kansas autos and trucks (FHWA), about 1.1%");
ok(near(TR.gasolineGal, (TR.lightDutyVehicles - TR.evs) * TR.milesPerVehicle / TR.mpg, 0.6), "gasoline = (vehicles - EVs) x miles / mpg");
ok(near(TR.buses.dieselGal, TR.buses.count * TR.buses.milesEach / TR.buses.mpg, 0.6), "bus diesel = buses x miles / mpg");
const FE = D.industry.fertilizer;
ok(FE.gasPerKgH2MMBtu === e0.farm.h2.gasMMBtuPerKg && FE.electrolysisKWhPerKg === e0.farm.electrolyzer.kWhPerKg, "gas per kg (EIA) and electrolysis kWh per kg (DOE) read from e0.json");
ok(near(FE.gasMMBtu, FE.hydrogenT * 1000 * FE.gasPerKgH2MMBtu, 0.6) && near(FE.hydrogenMWh, FE.hydrogenT * 39.4, 0.6)
  && FE.ammoniaT === Math.round(FE.hydrogenT / (3 * 1.008 / 17.031)) && near(FE.electrolysisEquivalentMWh, FE.hydrogenT * FE.electrolysisKWhPerKg, 0.6), "fertilizer: gas, hydrogen energy, ammonia and the electrolysis equivalent");
const FO = D.industry.food;
ok(near(FO.heatMWh, sum(D.industry.processHeat.map(b => b.deliveredMWh)), 1e-9) && near(FO.gasMMBtu, FO.heatMWh / FO.burnerEfficiency / D.units.mwhPerMMBtu, 1), "food processing: heat by band sums to its heat; gas = heat / 80%");
ok(D.industry.processHeat.map(b => b.band).join() === "low,medium,high", "process heat in three temperature bands");
const DC = D.dataCenter, PUE = t => DC.pue.base + DC.pue.perC * Math.max(0, t - DC.pue.aboveC);
ok(near(DC.itDrawMW, DC.itMW * DC.itUtilization, 1e-9), "IT draw = IT capacity x utilization");
ok(D.days.every(d => d.dataCenterMW.every((v, h) => near(v, r(DC.itDrawMW * PUE(d.temp[h]), 1), 1e-9))), "facility power = IT x PUE(T) in every hour");
const dcYear = sumHours((d, h) => DC.itDrawMW * PUE(d.temp[h]));
ok(rel(dcYear, DC.annualMWh, 1e-6) && near(DC.averagePUE, r(dcYear / (DC.itDrawMW * 8760), 3), 1e-9), "data-center energy over the year and its average PUE");
const dcPk = Math.max(...D.days.map(d => Math.max(...d.dataCenterMW)));
ok(dcPk === DC.peakMW && dcPk <= DC.contractMW, "the campus's peak stays within its contract");
ok(DC.contractMW !== f08.campus.contractMW && /300 MW/.test(DC.sizeReason) && f08.campus.contractMW === 300, "Prairie City's campus differs from F8's 300 MW on purpose, and says so");
const pk = k => D.districts.find(x => x.key === k).peak2025MW;
ok(dcPk > pk("fringe") && dcPk < pk("core") && dcPk < pk("suburbs"), "size reason holds: the campus peaks above the fringe, below the core and the suburbs");

// ---------------- prices and emission factors, recomputed or read from their files
ok(P.gasPerMcf.residential === e0.home.gas.pricePerMcf && D.units.btuPerCf === e0.home.gas.btuPerCf, "Kansas residential gas $14.81 per Mcf and 1,036 Btu per cubic foot, as e0.json");
ok(near(P.gasPerMMBtu.residential, r(P.gasPerMcf.residential / 1.036, 3)), "gas $ per MMBtu = $ per Mcf / 1.036");
const gi = P.gasIndustrialInputs;
ok(near(P.gasPerMcf.industrial, Math.round(gi.citygate2025 * gi.industrial2024 / gi.citygate2024 * 20) / 20), "the park's gas price from the citygate price and 2024's ratio");
ok(P.propanePerGal === r(P.propaneInputs.weeksSum / P.propaneInputs.weeks, 2), "propane: the mean of EIA's 26 weekly prices");
ok(P.electricityCentsPerKWh.residential > P.electricityCentsPerKWh.commercial && P.electricityCentsPerKWh.commercial > P.electricityCentsPerKWh.industrial, "Kansas 2025: residential > commercial > industrial cents per kWh");
const E = D.emissions;
ok(near(E.gridTPerMWh, r(E.gridLbPerMWh.sppNorth * 0.45359237 / 1000, 4)) && E.gridLbPerMWh.year === 2023, "SPP North rate in t per MWh (eGRID2023)");
ok(E.kansasInStateLbPerMWh === e0.home.grid.lbPerMWh && E.kgCO2.gasPerMMBtu === e0.home.gas.co2PerMMBtu, "Kansas in-state rate and gas factor read from e0.json");
ok(E.kgCO2.dieselPerGal === require(L("data/e1-prairie-campus.json")).fuel.co2, "diesel 10.19 kg per gallon (EIA), as e1-prairie-campus.json");
ok(near(D.units.mwhPerMMBtu, r(1e6 / 3412 / 1000, 6)), "MWh per MMBtu");

// ---------------- the Sankey: every node balances; carrier totals; the balance table
const F = D.flows, ids = F.nodes.map(n => n.id);
ok(new Set(ids).size === ids.length && F.links.every(l => ids.includes(l.from) && ids.includes(l.to) && l.value > 0), "Sankey: unique nodes, links between known nodes, positive values");
ok(F.nodes.every(n => [0, 1, 2, 3].includes(n.col)) && F.links.every(l => F.nodes.find(n => n.id === l.from).col < F.nodes.find(n => n.id === l.to).col), "Sankey: four columns, flows run left to right (primary -> carriers -> end uses -> losses)");
const vin = id => sum(F.links.filter(l => l.to === id).map(l => l.value)), vout = id => sum(F.links.filter(l => l.from === id).map(l => l.value));
F.nodes.forEach(n => { if (vin(n.id) > 0 && vout(n.id) > 0) ok(near(vin(n.id), vout(n.id), 1e-6), "Sankey node " + n.id + " balances (" + vin(n.id).toFixed(1) + " in, " + vout(n.id).toFixed(1) + " out)"); });
ok(near(sum(F.nodes.filter(n => n.col === 0).map(n => vout(n.id))) + vout("air"), sum(F.nodes.filter(n => n.col === 3).map(n => vin(n.id))), 1e-6), "Sankey: what enters equals what leaves (sources and outdoor air = useful + products + losses)");
const B = D.balance;
Object.entries(B.sectors).forEach(([s, cs]) => Object.entries(cs).forEach(([c, v]) => ok(near(v, (F.links.find(l => l.from === c && l.to === s) || { value: 0 }).value, 1e-9), "balance " + s + "/" + c + " is the Sankey's link")));
Object.entries(B.totals).forEach(([c, v]) => ok(near(v, sum(Object.values(B.sectors).map(cs => cs[c] || 0)), 1e-6), "balance total " + c));
const gwh = (gal, btu) => gal * btu / 3412 / 1e6;
ok(near(B.sectors.transport.gasoline, gwh(TR.gasolineGal, D.units.btuPerGal.gasoline), 0.06), "transport gasoline GWh = gallons x 120,214 Btu");
ok(near(B.sectors.datacenter.el, DC.annualMWh / 1000, 0.06) && near(B.sectors.fertilizer.gas, FE.gasMMBtu * D.units.mwhPerMMBtu / 1000, 0.06), "data center and fertilizer flows are their blocks'");
ok(near(B.sectors.homes.el, (T.annualMWh.residentialBase + T.annualMWh.residentialHeat) / 1000, 0.06) && near(B.sectors.commercial.el, (T.annualMWh.commercialBase + T.annualMWh.commercialHeat) / 1000, 0.06), "homes' and commercial electricity are the districts'");
ok(near(B.sectors.homes.gas, T.gasMMBtu.residential * D.units.mwhPerMMBtu / 1000, 0.06) && near(B.sectors.commercial.gas, T.gasMMBtu.commercial * D.units.mwhPerMMBtu / 1000, 0.06), "homes' and commercial gas are the districts'");
ok(near(vin("grid_losses"), r((B.totals.el - D.supply.rooftopMWh / 1000) * D.supply.gridLossShare, 1), 0.051) && near(F.links.find(l => l.from === "src_solar").value, r(D.supply.rooftopMWh / 1000, 1), 0.051), "grid losses 5% of grid-supplied electricity (delivered less rooftop solar used on site); rooftop solar = MW x 8,760 h x 17.6%");
ok(near(D.supply.rooftopMWh, D.supply.rooftopSolarMW * 8760 * e0.home.solar.cf, 0.6) && D.supply.rooftopCF === e0.home.solar.cf, "rooftop solar's capacity factor is e0.json's (EIA)");
ok(near(vin("h2"), r(FE.hydrogenMWh / 1000, 1), 1e-9), "the hydrogen node carries the hydrogen's energy");
ok(near(D.annual.electricityMWh, B.totals.el * 1000, 1e-6), "the city's electricity is the balance's");
ok(near(vout("air"), B.totals.air, 1e-6) && vin("air") === 0, "outdoor air enters the Sankey as its own carrier (no source)");
// heat pumps deliver COP times their electricity: the outdoor air's share is (COP - 1) / COP of their heat
const hpEl = sumHours((d, h) => sum(D.districts.map(x => x.heat.uaMWperC * Math.max(0, D.heatModel.balanceC - d.temp[h]) * x.heat.share.heatPump / COP(d.temp[h]))));
const hpHeat = sumHours((d, h) => sum(D.districts.map(x => x.heat.uaMWperC * Math.max(0, D.heatModel.balanceC - d.temp[h]) * x.heat.share.heatPump)));
ok(rel(hpHeat - hpEl, B.totals.air * 1000, 2e-3), "outdoor air = heat-pump heat - heat-pump electricity (seasonal COP " + (hpHeat / hpEl).toFixed(2) + ")");

// ---------------- the inventory
const tPerMWh = E.gridTPerMWh;
const invEl = s => (B.sectors[s].el || 0) * 1000 * tPerMWh, invGas = s => (B.sectors[s].gas || 0) * 1000 / D.units.mwhPerMMBtu * E.kgCO2.gasPerMMBtu / 1000;
ok(rel(D.inventory2025.sectors.datacenter, invEl("datacenter"), 1e-3), "inventory: data center = MWh x SPP North rate");
ok(rel(D.inventory2025.sectors.fertilizer, invEl("fertilizer") + invGas("fertilizer"), 1e-3), "inventory: fertilizer = electricity + gas (all carbon counted)");
ok(rel(D.inventory2025.sectors.transport, invEl("transport") + TR.gasolineGal * E.kgCO2.gasolinePerGal / 1000 + (TR.buses.dieselGal + TR.trucksDieselGal) * E.kgCO2.dieselPerGal / 1000, 1e-3), "inventory: transport = EVs + gasoline + diesel");
// rooftop solar used on site is not grid-supplied (GPC scope 2): its MWh come off homes' and businesses' electricity, in
// proportion to their use (engine E3 counts electricity bought, so the two agree)
const roofT = s => D.supply.rooftopMWh * B.sectors[s].el / (B.sectors.homes.el + B.sectors.commercial.el) * tPerMWh;
ok(rel(D.inventory2025.sectors.homes, invEl("homes") - roofT("homes") + invGas("homes") + T.propaneGal * E.kgCO2.propanePerGal / 1000, 1e-3), "inventory: homes = grid electricity (less its rooftop share) + gas + propane");
ok(rel(D.inventory2025.sectors.commercial, invEl("commercial") - roofT("commercial") + invGas("commercial"), 1e-3), "inventory: commercial = grid electricity (less its rooftop share) + gas");
ok(near(roofT("homes") + roofT("commercial"), D.supply.rooftopMWh * tPerMWh, 0.5), "the rooftop deductions add up to the rooftop MWh at the grid rate");
ok(D.inventory2025.total === sum(Object.values(D.inventory2025.sectors)), "inventory total is the sum of its rows");

// ---------------- the README section
const README = fs.readFileSync(L("README.md"), "utf8");
const sec = (README.split(/\n(?=## )/).find(s => /^## Prairie City data/.test(s)) || "");
ok(sec.length > 0, "README has a 'Prairie City data' section");
ok(/never retype/i.test(sec) && /Prairie City data build step/.test(sec) && /test_prairie_city\.js/.test(sec), "README: read, never retype; the build step and the test named");
["F9", "A13", "A15", "A18", "SB3", "M12", "C3", "CK-A"].forEach(k => ok(new RegExp("\\b" + k + "\\b").test(sec), "README names reader " + k));
Object.keys(D).forEach(k => ok(sec.includes("`" + k + "`"), "README documents the field `" + k + "`"));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (prairie-city)");
process.exit(fails ? 1 : 0);
