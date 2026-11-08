// test_prairieland.js — Node tests for Prairieland's shared data, assets/learn/data/prairieland.json (scale S4),
// written by its data build step. Read by F10, A20, A21, M13, SB4 (engine E4) and C4; pages read these numbers and
// never retype them.
//   - the card: shares sum to 1, primary energy 3.5 EJ, oil 80% imported, LNG 40% of gas, all coal from Ridge County,
//     CO2 214.9 Mt recomputed from the IPCC factors
//   - balances close: every Sankey node balances, the balance table equals the Sankey, regions add up to the nation
//     (people, final energy by sector and carrier, generation, grid losses, net exports, CO2), the fleet adds up
//   - Ridge County equals A13's block, field for field; Ridge Station's size is A13's
//   - cost ranges: each default inside its range, each range inside its source's range; defaults equal lesson 13's and
//     lesson 7's EIA values; fuel defaults converted from e2-plains-grid.json
//   - time slices recomputed from town_year.json (hour rule, extremes, means, weights summing to 8,760 hours)
//   - imports, minerals (HHI), shocks, carbon accounting weights, conventions (substitution efficiency)
//   - scope: no reactor technology named, no deny-listed term, no nuclear-plus-risk sentence; the firm option is generic
//     with no timeline; every link on the allow-list; the README section documents every field
// Usage (from the site folder):  node _tests/learn/test_prairieland.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const RAW = fs.readFileSync(L("data/prairieland.json"), "utf8");
const D = JSON.parse(RAW);
const a13 = require(L("data/a13-fairness-jobs.json")), e2 = require(L("data/e2-plains-grid.json"));
const c13 = require(L("data/13-capstone.json")), l07 = require(L("data/07-cost.json")), pc = require(L("data/prairie-city.json"));
const year = require(L("data/town_year.json")), y24 = require(L("data/m03-capacity-expansion-2024.json"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const rel = (a, b, t) => Math.abs(a - b) <= t * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const sum = a => a.reduce((s, v) => s + v, 0);
const tenths = x => Math.round(x * 10);
const RK = ["highlands", "ridge", "plains", "capital", "coast"];
const SECT = ["industry", "buildings", "transport", "agriculture"];

// ---------------- the frame
ok(D.about.line === "Prairieland is fictional; its numbers are illustrative.", "the fictional line, word for word");
ok(D.dollarYear === 2025 && D.about.dollarYear === 2025 && D.costs.dollarYear === 2025, "2025 dollars");
ok(/^Built for the course from the Prairieland card/.test(D.about.builtBy) && !/_tests\/|\.js\b|by hand|build step|written by/i.test(D.about.builtBy), "about says how the data were built, with no maintenance wording");
ok(Object.keys(D)[1] === "dataset" && Object.keys(D.dataset).join() === "creator,date,status,source,license" && D.dataset.date === D.about.built && /^Illustrative: Prairieland is fictional\./.test(D.dataset.status),
  "the download's dataset block: creator, date (the build date), status, source, license");
ok(RAW.length < 100 * 1024, "the file is under 100 KB (" + (RAW.length / 1024).toFixed(1) + " KB)");
ok(JSON.stringify(D.regions.map(r => r.key)) === JSON.stringify(RK), "five regions");

// ---------------- the card
const N = D.nation, B = D.balance;
ok(near(sum(Object.values(N.primaryShares)), 1, 1e-12), "primary shares sum to 1");
ok(N.primaryPJ === 3500 && N.people === 20000000 && N.gdpBillionUSD === 1200, "card: 3.5 EJ, 20 million people, $1.2 trillion");
const pr = B.primary;
const primTot = pr.oil.imported + pr.oil.domestic + pr.gas.lng + pr.gas.domestic + pr.coal + pr.nuclear + pr.hydro + pr.wind + pr.solar;
ok(near(primTot, 3500, 1e-6), "primary energy adds up to 3,500 PJ");
ok(near(pr.oil.imported + pr.oil.domestic, 3500 * 0.35, 1e-6) && near(pr.oil.imported / (pr.oil.imported + pr.oil.domestic), 0.8, 1e-9), "oil 35%, 80% of it imported");
ok(near(pr.gas.lng + pr.gas.domestic, 1050, 1e-6) && near(pr.gas.lng / 1050, 0.4, 1e-9), "gas 30%, LNG 40% of it");
ok(near(pr.coal, 700, 1e-9) && near(pr.nuclear, 175, 1e-9) && near(pr.hydro + pr.wind + pr.solar, 350, 1e-6), "coal 20%, nuclear 5%, wind, solar and hydro 10%");
ok(D.regions.filter(r => r.resources.coalPJ > 0).length === 1 && D.regions[1].resources.coalPJ === 700, "all coal is mined in the Ridge region (Ridge County)");
const F = D.carbon.factors.tPerTJ;
const co2 = (1225 * F.oil + 1050 * F.gas + 700 * F.coal) / 1000;
ok(near(co2, 214.9175, 1e-9) && D.carbon.base2025Mt === 214.9 && N.co2Mt === 214.9, "CO2 214.9 Mt: IPCC factors 73.3, 56.1, 94.6 t per TJ x primary fossil (" + co2.toFixed(3) + ")");
ok(F.oil === 73.3 && F.gas === 56.1 && F.coal === 94.6, "IPCC 2006 default factors on net calorific values");
ok(near(sum(Object.values(D.carbon.bySectorMt)), co2, 0.02), "CO2 by sector adds up to the total");
ok(N.workforce === a13.ridgeCounty.prairielandWorkforce, "the workforce is A13's");

// ---------------- the Sankey: every node balances
const SK = B.sankey, nodeIds = SK.nodes.map(n => n.id);
ok(SK.links.every(l => nodeIds.includes(l.from) && nodeIds.includes(l.to) && l.value > 0), "every link joins known nodes with a positive value");
const vin = id => tenths(sum(SK.links.filter(l => l.to === id).map(l => l.value)));
const vout = id => tenths(sum(SK.links.filter(l => l.from === id).map(l => l.value)));
SK.nodes.forEach(n => {
  if (n.kind === "source" || n.kind === "import") ok(vin(n.id) === 0 && vout(n.id) > 0, "source " + n.id + " has outflow only");
  else if (n.kind === "useful" || n.kind === "loss") ok(vout(n.id) === 0, "sink " + n.id + " has inflow only");
  else ok(vin(n.id) === vout(n.id), "node " + n.id + " balances: in " + vin(n.id) / 10 + ", out " + vout(n.id) / 10);
  ok(SK.links.filter(l => l.from === n.id).every(l => SK.nodes.find(m => m.id === l.to).col > n.col), "links from " + n.id + " run left to right");
});
ok(sum(SK.nodes.filter(n => n.col === 0).map(n => vout(n.id))) === 35000, "the Sankey's sources add up to 3,500 PJ");
ok(sum(SK.nodes.filter(n => n.col === 5).map(n => vin(n.id))) === 35000, "useful energy plus losses add up to 3,500 PJ");
const link = (a, b) => (SK.links.find(l => l.from === a && l.to === b) || { value: 0 }).value;
const cnode = { oil: "oilp", gas: "gas", coal: "coal", el: "el" };
SECT.forEach(s => Object.entries(B.final[s]).forEach(([c, v]) => ok(near(link(cnode[c], s), v, 1e-9), "Sankey " + c + " to " + s + " = balance.final")));
Object.entries(B.finalByCarrier).forEach(([c, v]) => ok(tenths(v) === tenths(sum(SECT.map(s => B.final[s][c] || 0))), "finalByCarrier " + c + " is the sum of the sectors"));
SECT.forEach(s => {
  const u = sum(Object.entries(B.final[s]).map(([c, v]) => v * B.useful.efficiency[s][c]));
  ok(tenths(u) === tenths(B.useful.bySector[s]) && near(link(s, "useful"), B.useful.bySector[s], 1e-9), "useful energy of " + s + " = final x efficiency");
});
ok(B.useful.efficiency.transport.oil === pc.transport.engineEfficiency && B.useful.efficiency.transport.el === pc.transport.evEfficiency, "engine and EV efficiencies read from prairie-city.json");
const tr = B.transformation;
ok(near(tr.power.out, link("power", "el")) && near(tr.grid.out + tr.grid.loss, tr.grid.in, 1e-9) && near(tr.grid.loss, link("el", "grid_loss")), "transformation table = Sankey");
ok(near(tr.power.in.nuclearHeat * 0.33, D.fleet.units.filter(u => u.tech === "nuclear").reduce((s, u) => s + u.gen2025GWh, 0) * 0.0036, 0.01), "physical content: nuclear electricity = reactor heat x 0.33");
ok(near(tr.refinery.out, Math.round(tr.refinery.in * 10 * (1 - tr.refinery.lossShare)) / 10, 1e-9), "refinery out = in x (1 - 5.5%)");
ok(rel(tr.grid.loss, tr.grid.in * tr.grid.lossShare, 2e-3), "grid losses 6% of generation");

// ---------------- conventions (F10's switch)
const C = B.conventions, fos = 3500 * 0.85;
const fosIn = tr.power.in.oil + tr.power.in.gas + tr.power.in.coal;
const fosOut = D.fleet.units.filter(u => u.efficiency).reduce((s, u) => s + u.gen2025GWh, 0) * 0.0036;
ok(near(C.substitutionEfficiency, fosOut / fosIn, 2e-4), "substitution efficiency = the fossil fleet's output / input (" + C.substitutionEfficiency + ")");
const renEl = pr.hydro + pr.wind + pr.solar, nucEl = pr.nuclear * 0.33;
ok(near(C.physicalContent.primaryPJ, 3500, 0.05) && near(C.physicalContent.renewablesShare, 0.1, 1e-4), "physical content: 3,500 PJ, renewables 10%");
ok(near(C.substitution.primaryPJ, fos + (renEl + nucEl) / C.substitutionEfficiency, 0.2) && C.substitution.renewablesShare > 0.2, "substitution: renewables' share doubles (" + C.substitution.renewablesShare + ")");
ok(near(C.directEquivalent.primaryPJ, fos + renEl + nucEl, 0.1), "direct equivalent: nuclear at its electricity");
["physicalContent", "substitution", "directEquivalent"].forEach(k => ok(near(C[k].renewablesShare + C[k].nuclearShare + C[k].fossilShare, 1, 2e-4), k + ": shares sum to 1"));

// ---------------- regions add up to the nation
ok(sum(D.regions.map(r => r.people)) === N.people, "regions' people add up to 20 million");
ok(near(sum(D.regions.map(r => r.peopleShare)), 1, 1e-3), "people shares sum to 1");
SECT.forEach(s => Object.keys(B.final[s]).forEach(c => ok(tenths(sum(D.regions.map(r => r.final[s][c] || 0))) === tenths(B.final[s][c]), "regions add up: " + s + " " + c)));
D.regions.forEach(r => ok(tenths(r.finalPJ) === tenths(sum(SECT.map(s => sum(Object.values(r.final[s]))))), r.key + ": finalPJ is the sum of its sectors"));
const E = k => sum(D.regions.map(r => r.electricity[k]));
ok(tenths(E("generationPJ")) === tenths(tr.power.out) && tenths(E("gridLossPJ")) === tenths(tr.grid.loss) && tenths(E("finalPJ")) === tenths(tr.grid.out), "regions' generation, grid losses and final electricity add up to the nation");
ok(near(E("netExportPJ"), 0, 1e-6), "net exports sum to zero");
D.regions.forEach(r => ok(near(r.electricity.netExportPJ, r.electricity.generationPJ - r.electricity.finalPJ - r.electricity.gridLossPJ, 1e-6), r.key + ": net export = generation - final - grid losses"));
ok(near(sum(D.regions.map(r => r.co2Mt)), co2, 0.01), "regions' CO2 adds up to 214.9 Mt");
D.regions.forEach(r => {
  const gw = sum(D.fleet.units.filter(u => u.region === r.key).map(u => u.gen2025GWh || 0)) * 0.0036;
  ok(Math.abs(gw - r.electricity.generationPJ) < 0.15, r.key + ": generation = its units' output (" + gw.toFixed(2) + " PJ)");
  Object.entries(r.capacityMW).forEach(([t, mw]) => ok(mw === sum(D.fleet.units.filter(u => u.region === r.key && u.tech === t).map(u => u.mw)), r.key + ": capacity of " + t + " = its units"));
  ok(r.resources.windCF > 0 && r.resources.windCF < 0.5 && r.resources.solarCF > 0 && r.resources.solarCF < 0.3 && r.climate.hdd > 0, r.key + ": resources and climate set");
});
ok(D.regions[3].climate.hdd === Math.round(pc.heatModel.hddNoaa / 1.8) && D.regions[3].climate.cdd === Math.round(pc.heatModel.cddNoaa / 1.8), "Capital Valley's degree days are Prairie City's NOAA normals in C-days");
const linkCap = k => sum(D.transmission.links.filter(l => l.from === k || l.to === k).map(l => l.mw));
D.regions.forEach(r => ok(Math.abs(r.electricity.netExportTWh) * 1000 / 8.76 < linkCap(r.key), r.key + ": its average net flow fits its links"));

// ---------------- the fleet
const U = D.fleet.units;
ok(new Set(U.map(u => u.id)).size === U.length && U.every(u => RK.includes(u.region) && D.fleet.techs[u.tech]), "unique units in known regions and technologies");
ok(U.every(u => u.retire > u.built && u.built >= 1950 && u.built <= 2025 && u.mw > 0), "every unit has a size, a year built and a later retirement year");
const ridgeSt = U.find(u => u.name === "Ridge Station");
ok(ridgeSt && ridgeSt.mw === a13.ridgeCounty.plant.mw && ridgeSt.region === "ridge" && ridgeSt.tech === "coal", "Ridge Station is A13's 2,400 MW coal plant, in the Ridge region");
U.filter(u => u.efficiency).forEach(u => ok(near(u.fuel2025PJ, u.gen2025GWh * 0.0036 / u.efficiency, 0.01), u.id + ": fuel = output / efficiency"));
["oil", "gas", "coal"].forEach(f => {
  const t = { oil: ["oil"], gas: ["gasCC", "gasCT"], coal: ["coal"] }[f];
  ok(Math.abs(sum(U.filter(u => t.includes(u.tech)).map(u => u.fuel2025PJ)) - tr.power.in[f]) < 0.1, "fleet fuel = power plants' " + f + " in the balance");
});
U.filter(u => u.cf2025 != null).forEach(u => ok(u.cf2025 > 0 && u.cf2025 < 0.95, u.id + ": capacity factor plausible (" + u.cf2025 + ")"));
Object.entries(D.fleet.capacityByYearMW).forEach(([y, caps]) => Object.entries(caps).forEach(([t, mw]) =>
  ok(mw === sum(U.filter(u => u.tech === t && u.built <= +y && +y < u.retire).map(u => u.mw)), "capacity by year " + y + " " + t)));

// ---------------- Ridge County is A13's
ok(JSON.stringify(D.ridgeCounty.a13) === JSON.stringify(a13.ridgeCounty), "ridgeCounty.a13 equals A13's block field for field");
ok(D.ridgeCounty.region === "ridge" && near(D.ridgeCounty.coalMt, Math.round(700 / 25.8 * 100) / 100, 1e-9), "Ridge County: in the Ridge region; coal tonnes = 700 PJ / 25.8 TJ per kt");
ok(D.ridgeCounty.workers === a13.ridgeCounty.prairielandWorkforce * a13.ridgeCounty.workforceShare, "Ridge County's workers = 3% of the workforce");
ok(near(D.ridgeCounty.ridgeStationFuel2025PJ, ridgeSt.fuel2025PJ, 1e-9), "Ridge Station's fuel matches the fleet");

// ---------------- costs: fixed ranges inside their sources' ranges
const TC = D.costs.technologies;
Object.entries(TC).forEach(([k, t]) => {
  ok(t.capex.lo <= t.capex.def && t.capex.def <= t.capex.hi, k + ": default capital cost inside its range");
  ok(t.source && t.source.lo <= t.capex.lo && t.capex.hi <= t.source.hi, k + ": range " + t.capex.lo + "-" + t.capex.hi + " inside its source's " + t.source.lo + "-" + t.source.hi);
  ok(t.src.length > 0 && t.life > 0 && t.fom >= 0 && t.vom >= 0, k + ": sourced, with life and O&M");
  ok(!("leadTime" in t) && !("firstYear" in t) && !("learning" in t), k + ": no timeline and no cost change with deployment");
});
ok(TC.wind.capex.def === c13.techs.wind.capex && TC.solar.capex.def === c13.techs.solar.capex && TC.gasCT.capex.def === c13.techs.pk.capex, "wind, solar and peaker defaults are lesson 13's EIA values");
ok(TC.gasCC.capex.def === l07.techs.cc.capex && TC.gasCC.fom === l07.techs.cc.fom && TC.gasCC.vom === l07.techs.cc.vom, "combined cycle is lesson 7's EIA multi-shaft plant");
const b = c13.techs.battery.source, nrel4 = Math.round((b.energyCapex * 4 + b.powerCapex) * 128.893 / 125.587 * 10) / 10;
ok(TC.battery.source.lo === nrel4 && TC.battery.hours === 4, "battery source range starts at NREL's 4-hour cost from lesson 13 ($" + nrel4 + " per kW)");
ok(TC.firm.fomSource.lo <= TC.firm.fom && TC.firm.fom <= TC.firm.fomSource.hi && TC.firm.co2 === 0 && TC.firm.availability <= 1, "firm option: fixed O&M inside its source, no CO2");
ok(near(TC.gasCC.efficiency, 3412 / (6226 * 0.9), 1e-4) && near(TC.gasCT.efficiency, 3412 / (9142 * 0.9), 1e-4), "new gas plants' efficiencies from EIA's heat rates on net values");
const FU = D.costs.fuels;
ok(near(FU.gas.def, Math.round(e2.fuels.gas.price / 1.055056 / 0.9 * 100) / 100) && near(FU.coal.def, Math.round(e2.fuels.coal.price / 1.055056 / 0.95 * 100) / 100), "gas and coal defaults are e2's EIA prices per net GJ");
["gas", "lng", "coal", "oil"].forEach(k => ok(FU[k].lo <= FU[k].def && FU[k].def <= FU[k].hi, "fuel " + k + ": default inside its range"));
ok(D.transmission.expansion.costPerMWkm.lo <= D.transmission.expansion.costPerMWkm.def && D.transmission.expansion.costPerMWkm.def <= D.transmission.expansion.costPerMWkm.hi, "transmission cost default inside its range");
ok(Object.keys(D.costs.buildLimits.gwPerRegionPerPeriod).every(k => TC[k]), "build limits for every new technology (one generic rule)");

// ---------------- carbon budget and periods
const CB = D.carbon;
ok(sum(Object.values(CB.accounting.linearWeights)) === 25 && sum(Object.values(CB.accounting.stepWeights)) === 25, "accounting weights sum to 25 years (2026-2050)");
ok(JSON.stringify(Object.keys(CB.accounting.linearWeights)) === JSON.stringify(["2025"].concat(D.periods.years.map(String))), "weights for 2025 and every model year");
// linear: years 2026-2030 lie on a line from 2025 to 2030: sum over k = 1..5 of (E25 + (E30 - E25) k / 5) = 2 E25 + 3 E30
ok(CB.accounting.linearWeights["2025"] === 2 && CB.accounting.linearWeights["2050"] === 3, "linear weights recomputed (2 E2025 + 3 E2030 for 2026-2030)");
const E25 = co2;
const presetMt = { flat: 25 * E25, line2050: 12 * E25, line2040: 7 * E25 };
CB.budget.presets.forEach(p => ok(p.mt === Math.round(presetMt[p.key]), "budget preset " + p.key + " recomputed (" + p.mt + " Mt)"));
ok(CB.budget.lo <= CB.budget.def && CB.budget.def <= CB.budget.hi, "default budget inside its range");
ok(near(sum(D.periods.years.map(() => D.periods.yearsEach)), 25, 0) && D.periods.horizonEnd === 2050, "five periods of five years to 2050");

// ---------------- time slices, recomputed from town_year.json
const TS = D.timeSlices, SL = TS.slices;
ok(sum(SL.map(s => s.hours)) === 8760, "slice weights sum to 8,760 hours");
ok(SL.every(s => s.days * 12 === s.hours), "each slice is a whole number of 12-hour halves");
ok(["winter", "spring", "summer", "autumn"].every(se => SL.some(s => s.season === se && s.part === "day") && SL.some(s => s.season === se && s.part === "night")), "four seasons, day and night");
ok(SL.filter(s => s.extreme).length === 4 && SL.find(s => s.key === "lowwind_day").days === 7, "the peak day and the scarce-wind winter week kept as their own slices");
const W = year.wind, S = year.solar, Dm = year.demand, NH = W.length, meanD = sum(Dm) / NH;
const windR = (k, i, Wy) => TS.windScale[k] * (Wy || W)[((i - TS.windLagHours[k]) % NH + NH) % NH] / 1000;
const solarR = (k, i) => TS.solarScale[k] * S[i] / 1000;
D.regions.forEach(r => {
  ok(near(TS.windScale[r.key], Math.round(r.resources.windCF * NH * 1000 / sum(W) * 1e6) / 1e6, 1e-12) && TS.windLagHours[r.key] === r.resources.windLagHours, r.key + ": wind scale and lag from its capacity factor");
  const cfw = sum(SL.map(s => s.hours * s.wind[r.key])) / 8760, cfs = sum(SL.map(s => s.hours * s.solar[r.key])) / 8760;
  ok(near(cfw, r.resources.windCF, 1e-3) && near(cfs, r.resources.solarCF, 1e-3), r.key + ": slices give back the year's wind and solar capacity factors (" + cfw.toFixed(4) + ", " + cfs.toFixed(4) + ")");
});
ok(near(sum(SL.map(s => s.hours * s.demand)) / 8760, 1, 1e-3), "slices' demand factors average 1 over the year");
ok(near(sum(SL.map(s => s.hours * s.hydro)) / 8760, 1, 1e-3), "hydro factors average 1 over the year");
// extremes: the week and the peak day
const month = d => new Date(Date.UTC(2025, 0, 1 + d)).getUTCMonth() + 1;
const iso = d => new Date(Date.UTC(2025, 0, 1 + d)).toISOString().slice(0, 10);
const wcap = k => sum(U.filter(u => u.region === k && u.tech === "wind").map(u => u.mw));
const scap = k => sum(U.filter(u => u.region === k && u.tech === "solar").map(u => u.mw));
const natW = Array.from({ length: NH }, (_, i) => sum(RK.map(k => wcap(k) * windR(k, i))));
const busbar = k => { const e = D.regions.find(r => r.key === k).electricity; return (e.finalPJ + e.gridLossPJ) / 3.6 * 1e6 / NH; };
const natNet = Array.from({ length: NH }, (_, i) => sum(RK.map(k => busbar(k) * Dm[i] / meanD)) - natW[i] - sum(RK.map(k => scap(k) * solarR(k, i))));
const cands = [];
for (let d = 0; d <= 52; d++) cands.push(d);
for (let d = 334; d <= 358; d++) cands.push(d);
const wk = d => sum(natW.slice(d * 24, (d + 7) * 24)) / 168;
const w0 = cands.reduce((a, d) => (wk(d) < wk(a) ? d : a), cands[0]);
ok(TS.extremes.scarceWindWeek.start === iso(w0) && TS.extremes.scarceWindWeek.end === iso(w0 + 6), "the scarce-wind week recomputed (" + iso(w0) + ")");
ok(near(TS.extremes.scarceWindWeek.nationalWindCF, wk(w0) / sum(RK.map(wcap)), 1e-4) && TS.extremes.scarceWindWeek.nationalWindCF < TS.extremes.scarceWindWeek.yearWindCF, "the week's wind is below the year's");
let ph = -1;
for (let i = 0; i < NH; i++) { const d = Math.floor(i / 24); if (d >= w0 && d < w0 + 7) continue; if (ph < 0 || natNet[i] > natNet[ph]) ph = i; }
const pday = Math.floor(ph / 24);
ok(TS.extremes.peakNetLoadDay.date === iso(pday) && TS.extremes.peakNetLoadDay.hour === ph % 24 && near(TS.extremes.peakNetLoadDay.netLoadGW, natNet[ph] / 1000, 0.006), "the peak net-load day recomputed (" + iso(pday) + ")");
// every slice's means from the hour rule
const SEAS = { 12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring", 6: "summer", 7: "summer", 8: "summer", 9: "autumn", 10: "autumn", 11: "autumn" };
const sliceOf = i => { const d = Math.floor(i / 24), h = i % 24, part = h >= 8 && h <= 19 ? "day" : "night";
  if (d >= w0 && d < w0 + 7) return "lowwind_" + part; if (d === pday) return "peak_" + part; return SEAS[month(d)] + "_" + part; };
const H = {};
for (let i = 0; i < NH; i++) (H[sliceOf(i)] = H[sliceOf(i)] || []).push(i);
SL.forEach(s => {
  const hs = H[s.key] || [];
  ok(hs.length === s.hours, s.key + ": " + s.hours + " hours by the hour rule");
  ok(near(s.demand, sum(hs.map(i => Dm[i])) / hs.length / meanD, 6e-5), s.key + ": demand factor = mean of its hours");
  ok(RK.every(k => near(s.wind[k], sum(hs.map(i => windR(k, i))) / hs.length, 6e-5) && near(s.solar[k], sum(hs.map(i => solarR(k, i))) / hs.length, 6e-5)), s.key + ": wind and solar = means of its hours, every region");
});
ok(RK.every(k => near(TS.fullYearCheck.weatherYears[1].windCF[k], sum(Array.from({ length: NH }, (_, i) => windR(k, i, y24.wind))) / NH, 6e-5)), "2024 weather year: its wind capacity factors by the same rule");
ok(JSON.stringify(TS.fullYearCheck.periods) === JSON.stringify([2030, 2050]) && TS.fullYearCheck.weatherYears.length === 2, "full-year check: selected years and two weather years");

// ---------------- imports, minerals, factory, shocks, demand
const I = D.imports;
ok(near(I.dependence.share, (pr.oil.imported + pr.gas.lng) / 3500, 1e-4) && near(N.importDependence, I.dependence.share, 1e-9), "import dependence = (oil imports + LNG) / primary = 40%");
ok(near(I.oil.stocksPJ, I.oil.importPJ / 365 * I.oil.stocksDays, 0.05) && I.oil.benchmarkDays === 90 && I.oil.throughStraitShare === 1, "oil stocks in days of net imports against the 90-day benchmark; all crude through the strait");
ok(near(I.dependence.throughStraitPJ, I.oil.importPJ + I.lng.throughStraitShare * I.lng.importPJ, 0.05), "energy through the strait");
Object.entries(I.minerals.items).forEach(([k, m]) => {
  ok(near(sum(m.shares), 1, 1e-12) && m.shares.length === I.minerals.suppliers.length, k + ": refining shares sum to 1");
  ok(m.hhi === Math.round(sum(m.shares.map(s => (100 * s) ** 2))), k + ": HHI recomputed (" + m.hhi + ")");
  ok(m.shares[0] === Math.max(...m.shares), k + ": Country R leads");
});
ok(near(I.minerals.leadingShareAverage, sum(Object.values(I.minerals.items).map(m => m.shares[0])) / 4, 1e-4) && Math.abs(I.minerals.leadingShareAverage - 0.7) < 0.05, "the leading refiner's average share is near 70%");
const fac = D.factories.battery;
ok(fac.electricity2025GWh === fac.output2025GWh * fac.electricityKWhPerKWh && Object.entries(fac.mineralsT).every(([k, t]) => t === I.minerals.items[k].tPerGWh * fac.output2025GWh), "factory: electricity and minerals = output x intensities");
ok(fac.output2025GWh <= fac.capacityGWh && RK.includes(fac.region), "factory output within capacity, in a region");
const SH = D.shocks.map(s => s.key);
["gasSpike", "drought", "mineralBan", "demandSurprise"].forEach(k => ok(SH.includes(k) && D.shocks.find(s => s.key === k).in.includes("C4"), "C4 shock " + k + " defined"));
const sc = D.shocks.find(s => s.key === "straitClosure");
ok(near(sc.lostPJ, (I.oil.importPJ + 0.25 * I.lng.importPJ) * 8 * 7 / 365, 0.05), "strait closure: energy lost recomputed");
ok(JSON.stringify(D.demand.scenarios.map(s => s.key)) === JSON.stringify(["low", "central", "high"]) && D.demand.scenarios.every(s => SECT.every(k => typeof s.growth[k] === "number")), "three demand scenarios, every sector");
ok(D.demand.electrification.transport.ratio === pc.transport.evEfficiency, "EV efficiency read from prairie-city.json");

// ---------------- scope (the course's scope rules: fixed cost ranges, the nuclear scope, the siting examples)
const strings = [];
(function walk(x, k) {
  if (Array.isArray(x)) x.forEach(v => walk(v, k));
  else if (x && typeof x === "object") Object.entries(x).forEach(([kk, v]) => { strings.push(kk); walk(v, kk); });
  else if (typeof x === "string") strings.push(x);
})(D, "");
const DENY = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i,
  /anchor[- ](customer|buyer)/i, /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /projects\//i, /research\.(html|qmd)/i,
  /\bAI\b/, /artificial intelligence/i, /\blearning\b/i];
DENY.forEach(re => ok(!strings.some(s => re.test(s)), "no " + re + " anywhere"));
ok(!strings.some(s => /light[- ]water|small modular|\bSMR\b|\bPWR\b|\bBWR\b|micro ?reactor|fast reactor|advanced reactor|molten salt|high[- ]temperature gas/i.test(s)), "no reactor technology is named");
const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
const RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
const bad = strings.flatMap(s => s.replace(/U\.S\./g, "US").split(/(?<=[.;:!?])\s+/)).filter(x => NUC.test(x) && RISK.test(x.replace(/merit[- ]order|orders? of magnitude|in order to/gi, "")));
ok(bad.length === 0, "no sentence puts a nuclear term with a risk term" + (bad.length ? ": " + bad[0] : ""));
ok(!NUC.test(TC.firm.label) && !NUC.test(TC.firm.what) && /generic/.test(TC.firm.label), "the firm option is generic and names no nuclear technology");
ok(D.costs.buildLimits.gwPerRegionPerPeriod.firm > 0 && D.costs.buildLimits.availableFrom === 2030, "the firm option has the generic build limits and start year of every technology");
const ALLOW = ["eia.gov", "iea.org", "ipcc.ch", "ourworldindata.org", "ec.europa.eu", "noaa.gov", "nlr.gov", "nrel.gov", "energy.gov"];
Object.entries(D.sources).forEach(([k, s]) => {
  ok(s.title && s.publisher && s.date && s.url && s.where, "source " + k + " has title, publisher, date, url and where");
  if (s.url !== "no link") { const h = new URL(s.url).hostname; ok(ALLOW.some(a => h === a || h.endsWith("." + a)), "source " + k + " links an allow-listed host (" + h + ")"); }
});
const refs = [];
(function walk(x, k) {
  if (Array.isArray(x)) x.forEach(v => walk(v, k));
  else if (x && typeof x === "object") Object.entries(x).forEach(([kk, v]) => walk(v, kk));
  else if (typeof x === "string" && k === "src") refs.push(x);
})(D, "");
ok(refs.length >= 10 && refs.every(s => D.sources[s]), "every src names a source in the file (" + refs.filter(s => !D.sources[s]).join(", ") + ")");
ok(!/https?:\/\//.test(JSON.stringify(Object.assign({}, D, { sources: null, dataset: Object.assign({}, D.dataset, { license: null }) }))), "links appear only in sources (and the license's address)");

// ---------------- the README section
const README = fs.readFileSync(L("README.md"), "utf8");
const sec = (README.split(/\n(?=## )/).find(s => /^## Prairieland data\n/.test(s)) || "");
ok(sec.length > 0, "README has its Prairieland data section");
ok(/never retype/i.test(sec) && /Prairieland data build step/.test(sec) && /test_prairieland\.js/.test(sec), "README: read, never retype; the build step and the test named");
["F10", "A20", "A21", "M13", "SB4", "C4", "E4"].forEach(k => ok(new RegExp("\\b" + k + "\\b").test(sec), "README names reader " + k));
Object.keys(D).forEach(k => ok(sec.includes("`" + k + "`"), "README documents the field `" + k + "`"));


// public wording: no editorial guard codes, no build or internal notes in the published data
{
  const raw = require("fs").readFileSync(require("path").join(__dirname, "../../assets/learn/data/prairieland.json"), "utf8");
  ok(!/\bG-(COST|NUC|DC|GIS|POL|SRC|FIN)\b/.test(raw), "no guard codes in the public data");
  const strings = []; (function walk(v) { if (typeof v === "string") strings.push(v); else if (v && typeof v === "object") Object.values(v).forEach(walk); })(JSON.parse(raw));
  ok(!strings.some(t => /\bnuclear|reactor/i.test(t) && /per kW|cost/i.test(t)), "no string names nuclear technology together with a cost");
}

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (prairieland)");
process.exit(fails ? 1 : 0);
