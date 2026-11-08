// test_f10-nations-differ.js — Node tests for lesson F10 (assets/learn/f10-nations-differ.js, its data file, prairieland.json,
// regions.json and the page, learn/f10-nations-differ.qmd):
//   - the published rows: each country's primary rows add to its published total (or the gap is its stated 'other'); the
//     conversions to PJ are the UN's conventional factors; electricity rows agree with the published primary values where
//     the publisher counts them at their electricity (hydro, wind, solar), and with ÷ 0.33 for nuclear where it says so;
//     Japan's rows as METI's fiscal year 2024 balance gives them, its kWh at the table's 8.4884 MJ, and the page's
//     conversion back to physical energy content
//   - Prairieland is read from prairieland.json, never copied: the lesson's data file and script hold none of its numbers;
//     its three conventions reproduce the file's own totals and shares
//   - the conventions from first principles: physical content, substitution (× 1/η) and direct equivalent recomputed here
//   - every Sankey balances (sources = primary = uses); before-the-meter is never negative; the useful estimate uses
//     Prairieland's sector efficiencies
//   - every prediction, reveal, line and lens text true against the data (mystery country, conventions, largest sources,
//     import dependence, production shares)
//   - the no-JS block, ideas, notes, check, facts and sources equal what the model writes (--write rewrites them); every
//     number in the facts table is recomputed
//   - shares: every drawn source classed on its own (fossil, renewable, or neither; Norway's unsplit waste stays apart),
//     recomputed here from the published rows; China's and India's coverage said beside every row and line
//   - boundaries: the U.S. end-use note; U.S. non-combustion use taken from the sectors EIA assigns it to (industry, and
//     transport's lubricants, MER Tables 1.13b and 3.8c); country-specific sector names; useful energy named a what-if
//     wherever it shows, with the sector efficiencies and one worked multiplication beside it
//   - step 4 shows the predicted metric (the renewable share) first; the nuclear, hydro, wind and solar grouping second,
//     named and told apart; coverage caveats are their own element beside each step line
//   - the no-JS block carries every lens (imports, resources, climate, institutions); dated sources for the institutions
//     lens; units, heat rate and LNG explained where they appear
//   - scope (the course's scope rules, copied below; the scope scan is the canonical judge): the deny-list
//     and the nuclear-plus-risk rule over every string the page loads (its data, the regional cards, the Prairieland
//     strings it shows, the path entries it names) and its own text; links only to the allowed domains (others "no link"); the
//     fictional line wherever Prairieland is drawn; the text budget (35 words) of every note, line, preview, feedback and cell
// Usage (from the site folder):  node _tests/learn/test_f10-nations-differ.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "f10-nations-differ";
const SITE = path.resolve(__dirname, "..", "..");
const L_ = p => path.join(SITE, "assets/learn", p);
const M = require(L_(ID + ".js"));
const RAW = fs.readFileSync(L_("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const PL = require(L_("data/prairieland.json"));
const R = require(L_("data/regions.json"));
const JS = fs.readFileSync(L_(ID + ".js"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const sum = a => a.reduce((s, v) => s + v, 0);
const L = M.nations(D, PL), E = M.effs(PL), byKey = k => L.filter(n => n.key === k)[0];

// ---------------- the generated blocks
const BLOCKS = { "f10-fallback": () => M.staticFallback(D, L, E), "f10-ideas": () => M.ideasHTML(D, L, E), "f10-notes": () => M.notesHTML(D),
  "f10-check": () => M.checkHTML(D, L, E), "f10-facts": () => M.factsHTML(D), "f10-sources": () => M.sourcesHTML(D, PL), "f10-subst": () => M.substHTML(D, L),
  "f10-plfull": () => M.plFullHTML(PL) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");

// ---------------- units: the UN's conventional factors (1 quad = 1.05506 EJ, 1 tce = 29.3076 GJ, 1 toe = 41.868 GJ)
ok(near(D.units.quad.pj, 1055.06) && near(D.units.tce4.pj, 1e4 * 29.3076e-6, 1e-12) && near(D.units.ktoe.pj, 1e3 * 41.868e-6, 1e-12) && near(D.units.mtep.pj, 1e6 * 41.868e-6, 1e-9) && D.units.twh.pj === 3.6 && D.pjPerTWh === 3.6, "unit factors");
ok(D.nuclearHeatEff === 0.33 && D.subEff === 0.4, "the conventions' efficiencies: 33% for nuclear heat, 40% for substitution (set for teaching, said on the page)");

// ---------------- each country's published rows
const C = k => D.countries.filter(c => c.key === k)[0];
{
  const us = C("us"); const listed = sum(Object.values(us.primary)), other = us.total - listed;
  ok(other > 0 && other < 0.03, "US: the listed sources leave " + other.toFixed(3) + " quads (electricity and coal coke net imports, and rounding)");
  ok(us.primary.geo === 0.117 && near(us.primary.hydro + us.primary.geo + us.primary.solar + us.primary.wind + us.primary.bio, 8.835, 0.002), "US: geothermal 0.117 quads drawn as its own source; the five renewables add to EIA's 8.835 (Table 1.3, 2025)");
  ok(near(us.twh.hydro * 3412e-6, us.primary.hydro, 0.002) && near(us.twh.wind * 3412e-6, us.primary.wind, 0.002), "US: hydro and wind at 3,412 Btu per kWh (EIA's method since September 2023)");
  ok(us.primary.solar > us.twh.solar * 3412e-6, "US: solar's primary value holds its electricity (with small-scale) and a little solar heat");
  const eff = us.twh.nuclear * 3412e-6 / us.primary.nuclear; ok(eff > 0.32 && eff < 0.34, "US: nuclear at its plants' heat rate, an efficiency of " + (100 * eff).toFixed(1) + "%");
  const P = M.pubOf(us); ok(near(P.residential + P.commercial + P.industrial + P.transportation, 76.788223, 1e-6), "US: end-use sectors add to 76.788 quads");
  // MER October 2026: Table 1.13b non-combustion use 6.540 quads in 2025, all industrial except some lubricants used in
  // transportation (its note); Note 3: all lubricants are non-combustion; Table 3.8c: transportation lubricants 104 trillion Btu
  // (Table 3.8b: industrial lubricants 95; together Table 1.13b's 0.200)
  ok(near(P.nonfuel, 6.540, 0.0005) && P.lubTransport === 0.104 && near(0.104 + 0.095, 0.200, 0.0015), "US: non-combustion use 6.540 quads; transport's lubricants 0.104 (Tables 1.13b, 3.8c and 3.8b agree)");
  ok(JSON.stringify(us.final.industry) === JSON.stringify(["industrial", "-nonfuel", "lubTransport"]) && JSON.stringify(us.final.transport) === JSON.stringify(["transportation", "-lubTransport"]), "US: non-combustion use taken from industry, except transport's lubricants, taken from transport");
  const usN = M.nation(D, us);
  ok(near(usN.final.industry, (P.industrial - (P.nonfuel - 0.104)) * 1055.06, 1e-6) && near(usN.final.transport, (P.transportation - 0.104) * 1055.06, 1e-6), "US: industry " + (usN.final.industry / 1000).toFixed(2) + " EJ, transport " + (usN.final.transport / 1000).toFixed(2) + " EJ after the split");
  ok(near(usN.finalTotal, (76.788223 - P.nonfuel) * 1055.06, 1e-6) && near(usN.nonEnergy, P.nonfuel * 1055.06, 1e-9), "US: the split moves energy between sectors only: final and non-energy totals unchanged");
  ok(/0\.104 quads of lubricants taken from transport \(Table 3\.8c\), the rest from industry \(Table 1\.13b\)/.test(us.prov.adjust) && /3\.8c \(transportation-sector petroleum, with lubricants\)/.test(D.sources["eia-mer"].title) && /non-combustion use 6\.540 quads, all industrial except the transportation sector's lubricants, 0\.104/.test(D.sources["eia-mer"].where) && /Tables 1\.13b and 3\.8c on 8 November 2026/.test(D.sources["eia-mer"].date), "US: the split said in the provenance and the source note, with its tables and access date");
  ok(near(P.residential + P.commercial + P.industrial + P.transportation + 19.672147, us.total, 0.01), "US: end use plus electrical system losses (19.672 quads, Tables 2.2 to 2.5) is the primary total");
  const eu = C("eu"), el = sum(Object.values(eu.primary)), euOther = eu.total - el;
  ok(near(eu.primary.geoheat, 278962.497 + 800099.994 + 1684.076, 1e-6), "EU: geothermal, ambient heat and tide (TJ, nrg_bal_c) drawn as one renewable source");
  ok(near(euOther, 593729.585 - 44285.868 + 32313.75, 0.05), "EU: 'other' is non-renewable waste and electricity and heat trade (TJ)");
  ok(near(eu.twh.hydro * 3600, eu.primary.hydro, 1) && near(eu.twh.wind * 3600, eu.primary.wind, 1) && near(eu.twh.solar * 3600, 1094316.729, 1), "EU: hydro, wind and solar PV at their gross electricity");
  const Pe = M.pubOf(eu), fec = Pe.industry + Pe.transport + Pe.households + Pe.services + Pe.agriculture + Pe.fishing + Pe.nes;
  ok(near(fec, 36754932.777, 0.01) && Math.round(fec / 1000) === 36755, "EU: sectors add to Eurostat's 36,755 PJ of final energy consumption");
  ok(Math.round(eu.total / 1000) === 55790 && Math.round(Pe.production / 1000) === 23003, "EU: 55,790 PJ gross available energy and 23,003 PJ production, as the overview rounds them");
  const cn = C("cn"), ce = cn.coalEquivalent;
  ok(near(sum(Object.values(ce.shares)), 1, 1e-9), "China: the four shares of Table 9-2 add to 100%");
  ok(near(ce.total * 1e4 * 29.3076e-9, 167.442, 0.001), "China: 571,327 × 10,000 tce = 167.4 EJ in coal equivalent");
  const inN = C("in"); ok(near(sum(Object.values(inN.primary)) - 405, inN.total, 1e-9), "India: the sources less 405 ktoe of net electricity exports are the 903,158 ktoe total");
  ok(near(inN.twh.hydro * 1000 * 0.086, inN.primary.hydro, 1) && near(inN.twh.wso * 1000 * 0.086, inN.primary.wso, 1) && near(inN.twh.nuclear * 1000 * 0.086 / 0.33, inN.primary.nuclear, 1), "India: 0.086 ktoe per GWh, nuclear ÷ 0.33 (MoSPI's factors)");
  const Pi = M.pubOf(inN); ok(near(Pi.industry + Pi.transport + Pi.residential + Pi.commercial + Pi.agriculture + Pi.otherNs + Pi.nonEnergy, 613605, 1.5), "India: final consumption rows add to 613,605 ktoe");
  ok(near(inN.total * 0.041868, 37813.4, 0.1), "India: 903,158 ktoe = 37,813 PJ, as Table 7.7 gives");
  const br = C("br"); ok(near(sum(Object.values(br.primary)), br.total - 2.8, 1e-9), "Brazil: sources add to 325.7 Mtep; 2.8 is other non-renewables (2.7) and 0.1 of rounding");
  ok(near(52.0 + 27.1 + 29.2, br.primary.bio), "Brazil: bioenergy is sugarcane, firewood and charcoal, black liquor and other renewables");
  ok(near(br.twh.wind * 0.086, br.primary.wind, 0.05) && near(br.twh.nuclear * 0.086 / 0.33, br.primary.nuclear, 0.1), "Brazil: 860 kcal per kWh, nuclear ÷ 0.33 (EPE's manual)");
  const Pb = M.pubOf(br); ok(near(Pb.energySector + Pb.services + Pb.agriculture + Pb.industry + Pb.transport + Pb.residential, Pb.finalEnergyUse, 1e-9), "Brazil: the split of the remaining final uses closes on 275.417 Mtep");
  ok(near(Pb.energySector / Pb.services, 7.9 / 5.2, 1e-9), "Brazil: the energy sector, services and farms split by their published shares");
  const no = C("no"); ok(near(sum(Object.values(no.primary)), 326.2, 1e-9), "Norway: Table 3's rows add to 326.2 TWh (Table 2 rounds to 326)");
  ok(no.primary.bio === 19.5 && no.primary.waste === 5.2 && D.nodes.waste.unsplit && !D.nodes.waste.renewable && !D.nodes.waste.fossil, "Norway: biofuels 19.5 TWh renewable; waste 5.2 TWh kept apart, neither renewable nor fossil");
  ok(no.pub.industry + no.pub.transport + no.pub.households + no.pub.other === 211, "Norway: the sector rows (73, 50, 45, 43 TWh) add to 211; SSB's rounded total is 212");
  ok(near(no.pub.production + no.pub.imports - no.pub.exports, 337, 1e-9), "Norway: production + imports − exports = 337 TWh (bunkers and stock changes make 326)");
  // Japan: METI's Comprehensive Energy Statistics, fiscal year 2024 (final), TJ at gross calorific value (row #190000 and the rest)
  const jp = C("jp"), jl = sum(Object.values(jp.primary)), pe = jp.pubElec;
  ok(Math.abs(jp.total - jl) < 0.01 && near(jp.total, 17461344.373, 1e-6), "Japan: the ten sources add to METI's 17,461,344 TJ of domestic primary energy supply");
  ok(near(jp.primary.coal, 4300507.282 - 8243.596, 0.002) && near(jp.primary.oil, 5138145.925 + 889968.368, 0.002) && near(jp.primary.gas, 3671804.723 + 93.798, 0.002), "Japan: coal with coal products, crude oil with oil products, natural gas with city gas (TJ)");
  ok(near(jp.primary.solar, 832941.206 + 4995.959, 1e-3) && near(jp.primary.solar + jp.primary.wind + jp.primary.geo + jp.primary.bio, 1475601.837, 0.005), "Japan: solar is photovoltaic power and solar heat; solar, wind, geothermal and biomass are METI's renewables other than hydro");
  ok(near(jp.primary.hydro + jp.primary.solar + jp.primary.wind + jp.primary.geo + jp.primary.bio, 2101617.303, 0.005), "Japan: the five renewable rows add to METI's renewable energy column (2,101,617 TJ)");
  ok(near(pe.mjPerKWh, 8.4884035, 1e-6) && ["nuclear", "hydro", "wind", "geo"].every(s => near(pe.gwh[s] * pe.mjPerKWh, jp.primary[s], 1)) && near(pe.gwh.solar * pe.mjPerKWh, jp.primary.solar - 4995.959, 1), "Japan: each source's GWh × 8.4884 MJ per kWh is its published TJ (solar: its photovoltaic part)");
  ok(["nuclear", "hydro", "wind", "solar", "geo"].every(s => near(jp.twh[s] * 1000, pe.gwh[s], 1e-6)), "Japan: the conventions switch nuclear, hydro, wind, solar and geothermal");
  ok(D.geoHeatEff === 0.1 && /10% for geothermal electricity/.test(D.sources["eurostat-method"].where) && /33% advised for nuclear/.test(D.sources["eurostat-method"].where), "the heat defaults: 33% for nuclear, 10% for geothermal electricity (Eurostat)");
  ok(near(D.pjPerTWh / pe.mjPerKWh, 0.4241, 0.0001), "Japan: 8.4884 MJ per kWh is the fuel of a thermal plant at 42.4%");
  const Pj = M.pubOf(jp), jfin = Pj.agMining + Pj.manufacturing + Pj.commerce + Pj.residential + Pj.transport;
  ok(near(jfin, Pj.finalAll, 0.005) && near(Pj.agMining + Pj.manufacturing + Pj.commerce, 6844403.813, 0.005), "Japan: the five sector rows add to METI's 11,280,435 TJ of final energy consumption (industry and services 6,844,404)");
  ok(near(Pj.neAgMining + Pj.neManufacturing + Pj.neCommerce + Pj.neTransport, Pj.nonEnergy, 0.005) && near(jfin - Pj.nonEnergy, 10154062.817, 0.01), "Japan: non-energy use by sector adds to 1,126,372 TJ; energy use 10,154,063 TJ");
  ok(near(Pj.production + Pj.imports - Pj.exports - 53562.951, jp.total, 0.01), "Japan: production + imports − exports − stock building = domestic primary energy supply");
  ok(near(Pj.prodCoal + Pj.prodOil + Pj.prodGas + 793520.534 + 1968200.133 + 573930.037, Pj.production, 0.01), "Japan: production is fossil fuels, nuclear, renewables and waste and recovered energy");
}

// ---------------- Prairieland: read, never retyped
ok(!/3500|2710\.9|1805|980\.0|836\.5|0\.4184|214\.9/.test(RAW) && !/\b(3500|2710\.9|1805|836\.5|0\.4184)\b/.test(JS.replace(/\/\/[^\n]*/g, "")), "no Prairieland number copied into the lesson's data file or script");
{
  const N = byKey("pl"), cv = PL.balance.conventions;
  ok(N.fictional === PL.about.line && N.fictional === "Prairieland is fictional; its numbers are illustrative.", "Prairieland's line is read from its file");
  ["physicalContent", "substitution", "directEquivalent"].forEach((k, i) => {
    const P = M.primaryAs(D, N, ["pec", "sub", "de"][i]);
    ok(near(P.total, cv[k].primaryPJ, 0.3) && near(P.renewable, cv[k].renewablesShare, 0.0005) && near(P.v.nuclear, cv[k].nuclearPJ, 0.15), "Prairieland " + k + ": total " + P.total.toFixed(1) + " PJ and shares as its file gives them");
  });
  ok(near(N.finalTotal, PL.nation.finalPJ, 0.05) && near(M.useful(N, E).total, PL.nation.usefulPJ, 0.05), "Prairieland: final and useful energy from its balance match its nation block");
  ok(near(N.importDep, PL.nation.importDependence, 1e-12), "Prairieland: import dependence from its file");
}

// ---------------- the conventions from first principles
L.forEach(N => {
  const a = M.primaryAs(D, N, "pec"), b = M.primaryAs(D, N, "sub"), c = M.primaryAs(D, N, "de"), eta = N.subEff;
  const elecTWh = Object.keys(N.twh).reduce((s, k) => s + N.twh[k], 0);
  ok(near(b.total - c.total, elecTWh * 3.6 * (1 / eta - 1), 1e-6), N.key + ": substitution adds 3.6 × (1/η − 1) PJ per TWh over direct equivalent");
  const heat = Object.keys(N.twh).filter(s => M.heatEff(D, s)).reduce((s, k) => s + N.src[k] - N.twh[k] * 3.6, 0);
  ok(near(a.total - c.total, heat, 1e-6), N.key + ": physical content differs from direct equivalent only by the heat of nuclear (and Japan's geothermal)");
  ok(b.renewable >= a.renewable && c.elec <= a.elec + 1e-12, N.key + ": substitution raises the renewable share; direct equivalent never raises nuclear, hydro, wind and solar's share");
  ok(near(a.fossil + a.elec + (Object.keys(a.v).filter(s => !D.nodes[s].fossil && !D.nodes[s].elec).reduce((s, k) => s + a.v[k], 0) + a.other) / a.total, 1, 1e-9), N.key + ": shares add to 100%");
});
{
  const cn = byKey("cn"), P = M.primaryAs(D, cn, "pec");
  ok(near(P.elec, (434.7 * 3.6 / 0.33 + (1285.8 + 885.9 + 584.15) * 3.6) / P.total, 1e-12) && P.elec > 0.09 && P.elec < 0.1, "China by physical content: nuclear, hydro, wind and solar " + (100 * P.elec).toFixed(1) + "% (the page's estimate)");
  ok(M.cnRatio(D, cn) > 2.4 && M.cnRatio(D, cn) < 2.9, "China: NBS's coal-equivalent figure is " + M.cnRatio(D, cn).toFixed(2) + " times the four sources' electricity");
}

{
  const N = byKey("jp"), c = N.c, pe = c.pubElec, P = M.primaryAs(D, N, "pec");
  // tolerances of 1e-5 PJ: the published rows are kept to 0.001 TJ
  ok(near(N.src.nuclear, pe.gwh.nuclear * 3.6 / 1000 / 0.33, 1e-5) && near(N.src.hydro, pe.gwh.hydro * 3.6 / 1000, 1e-5) && near(N.src.solar, pe.gwh.solar * 3.6 / 1000 + 4.995959, 1e-5) && near(N.src.geo, pe.gwh.geo * 3.6 / 1000 / 0.1, 1e-5), "Japan by physical content: each kWh at 3.6 MJ, nuclear's ÷ 0.33 and geothermal's ÷ 0.10 as heat, solar heat as published");
  const back = Object.keys(pe.gwh).reduce((s, k) => s + pe.gwh[k] * (pe.mjPerKWh - (k === "nuclear" ? 3.6 / 0.33 : k === "geo" ? 3.6 / 0.1 : 3.6)) / 1000, 0);
  ok(near(N.published, c.total / 1000, 1e-9) && near(P.total, N.published - back, 1e-5) && near(P.total, 16897.2, 0.1), "Japan: METI's 17,461 PJ becomes " + P.total.toFixed(1) + " PJ by physical content");
  ok(near(N.pubRenewable, 2101617.303 / 17461344.373, 1e-6) && near(P.renewable, 0.0776, 0.0005) && near(P.fossil, 0.8281, 0.0005), "Japan: renewables 12.0% as METI counts them, 7.8% by physical content; fossil fuels 83%");
  ok(near(M.primaryAs(D, N, "de").v.geo, pe.gwh.geo * 3.6 / 1000, 1e-9) && near(M.primaryAs(D, N, "sub").v.geo, pe.gwh.geo * 3.6 / 1000 / 0.4, 1e-9), "Japan's geothermal: its electricity by direct equivalent, ÷ 0.40 by substitution");
  const jr = M.japanRule(D, L), js = M.japanResult(D, L);
  ok(jr.indexOf(M.fmtN(pe.mjPerKWh, 2) + " MJ") > 0 && jr.indexOf(M.pct(3.6 / pe.mjPerKWh, 1)) > 0 && js.indexOf(M.ej(P.total) + ", not METI's " + M.ej(N.published)) > 0 && js.indexOf(M.pct(P.renewable, 1) + ", not " + M.pct(N.pubRenewable, 1)) > 0, "Japan's official convention and the conversion, as two elements: " + jr.slice(0, 40) + " | " + js.slice(0, 40));
  ok(/text: japanRule\(D, L\)/.test(JS) && /text: japanResult\(D, L\)/.test(JS) && M.staticFallback(D, L, E).indexOf("<li><b>Japan.</b> " + jr + "</li><li><b>Japan, converted.</b> " + js + "</li>") > 0 && M.substHTML(D, L).indexOf("Japan's balance</b> is a substitution at 8.49 MJ per kWh") > 0, "the Japan rule and result in step 4, the no-JS block, and the substitution box");
  ok(M.primaryTag(N) === " (converted)" && M.primaryTag(byKey("cn")) === " (estimate)" && M.primaryTag(byKey("pl")) === "" && M.staticFallback(D, L, E).indexOf(M.ej(P.total) + " (converted)") > 0, "Japan's total labelled as the page's conversion; China's as its estimate");
  ok(c.year === "fiscal year 2024 (April 2024 to March 2025)" && M.viewLine(D, N).indexOf(c.year) > 0, "Japan: the fiscal year labelled, April to March");
}

// ---------------- every Sankey balances
L.forEach(N => {
  ["pec", "sub", "de"].forEach(cv => {
    const s = M.primarySpec(D, N, cv), b = M.balanceOf(s), P = M.primaryAs(D, N, cv);
    ok(near(b.hub.inn, b.hub.out || b.hub.inn, 1e-6) && near(b.hub.inn, P.total + Math.max(0, -P.other), 1e-6), N.key + " " + cv + ": the primary hub balances");
    ok(s.links.every(l => l.value >= 0), N.key + " " + cv + ": no negative flow");
    if (!N.noFinal) ok(M.beforeOf(N, P) > 0, N.key + " " + cv + ": before the meter is positive (" + (M.beforeOf(N, P) / 1000).toFixed(2) + " EJ)");
  });
  if (N.noFinal) { ok(M.finalSpec(D, N, E, true) === null && M.primarySpec(D, N, "pec").nodes.every(n => n.col < 2), N.key + ": primary energy only"); return; }
  const f = M.finalSpec(D, N, E, true), b = M.balanceOf(f);
  M.SECTORS.forEach(s => { if (b["s_" + s]) ok(near(b["s_" + s].inn, b["s_" + s].out, 1e-9), N.key + ": sector " + s + " balances in the useful view"); });
  const U = M.useful(N, E);
  ok(N.PL ? !U.estimate : M.SECTORS.every(s => near(U.bySector[s], N.final[s] * E[s], 1e-9)), N.key + ": useful energy = final × Prairieland's sector efficiencies" + (N.PL ? " (Prairieland: its own file)" : ""));
});
M.SECTORS.forEach(s => { const k = { industry: "industry", transport: "transport", buildings: "buildings", other: "agriculture" }[s], x = PL.balance.final[k]; ok(near(E[s], PL.balance.useful.bySector[k] / sum(Object.values(x)), 1e-12), "the " + s + " efficiency is Prairieland's useful ÷ final"); });

// ---------------- predictions, reveals and lines
{
  const Q = M.mysteryQ(D, L), no = byKey("no"), g = M.largest(D, no);
  ok(Q.answer === "no" && g.first === "hws" && Q.feedback.no.indexOf(M.pct(g.share)) > 0, "step 1: Norway, whose largest source is hydro, wind and solar electricity (" + M.pct(g.share) + ")");
  D.mystery.options.forEach(k => { const X = byKey(k), gx = M.largest(D, X); ok(k === "no" || (gx.first !== "hws" && Q.feedback[k].indexOf(M.pct(gx.share)) > 0), "step 1 feedback true for " + k); });
  const by = {}; L.forEach(N => { by[N.key] = M.largest(D, N).first; });
  ok(by.us === "oil" && by.eu === "oil" && by.cn === "coal" && by.in === "coal" && by.jp === "oil" && by.br === "oil" && by.no === "hws" && by.pl === "oil", "step 2: the largest sources");
  ok(M.largestSaw(D, L).indexOf("coal for China and India") > 0, "step 2's summary lists them");
  const cq = M.convQ(D, L), a = M.primaryAs(D, no, "pec"), b = M.primaryAs(D, no, "sub");
  ok(cq.answer === "rises" && b.renewable - a.renewable > 0.15, "step 4: Norway's renewable share rises from " + M.pct(a.renewable) + " to " + M.pct(b.renewable));
  const us = byKey("us"); ok(M.importText(us).indexOf("net exporter") === 0 && near(us.importDep, -11.099192 / 96.465716, 1e-12), "US: a net exporter (net imports −11.1 quads)");
  ok(near(byKey("cn").importDep, (145253 - 13625) / 571327, 1e-12) && M.importText(byKey("eu")) === "57% of its supply imported", "import dependence: China derived, the EU published");
  ok(M.importText(byKey("no")).indexOf("6.9 times") > 0 && M.prodText(byKey("no")).indexOf("about 8 times") > 0, "Norway: net exports 6.9 times its supply; production about 8 times");
  ok(M.importText(byKey("br")) === "not on the pages read", "Brazil: no import dependence claimed");
  const jp = byKey("jp"); ok(near(jp.importDep, (15043218.06 - 964732.721) / 17461344.373, 1e-9) && M.importText(jp) === "81% of its supply imported (both as METI publishes them)" && near(jp.prodShare, 3436421.984 / 17461344.373, 1e-9), "Japan: net imports 81% and production 20% of supply, both as METI counts them, said beside the ratio");
  ok(M.importText(byKey("cn")) === "23% of its supply imported (both in coal equivalent)" && L.filter(N => N.key !== "cn" && N.key !== "jp").every(N => !/\(both/.test(M.importText(N))), "import ratios on another basis than the drawn total say so: China's and Japan's only");
  ok(M.resourcesText(D, jp).indexOf("Produces 20% of its supply at home; electricity from nuclear and renewables counted at METI's 8.49 MJ per kWh.") > 0 && M.resourcesText(D, jp).indexOf("Coal, oil and gas: 3% of its production.") > 0, "Japan: its own production, and how little of it is fossil");
  L.forEach(N => ["imports", "resources", "climate", "institutions"].forEach(k => ok(typeof M.lensCell(D, N, k) === "string" && M.lensCell(D, N, k).length > 3, N.key + ": lens " + k)));
  ok(M.resourcesText(D, byKey("br")).indexOf("Hydro: 52% of its electricity") > 0, "Brazil: hydro 401,415 of 775,896 GWh");
  ok(M.climateText(byKey("pl")).indexOf("degree days") > 0, "Prairieland's climate lens reads its regions' degree days");
  // each country opens a card that exists
  L.forEach(N => ok(N.PL ? N.card === null : !!M.cardOf(R, N.card), N.key + " opens its regional card"));
}

// ---------------- the facts table: every number recomputed
{
  const f = D.facts;
  ok(f[0].n === M.pct(byKey("eu").importDep, 1), "fact: EU 57.3%");
  ok(f[1].n === M.fmtN(-C("us").pub.netImports, 1) + " quads" && f[1].what.indexOf(M.fmtN(C("us").pub.production, 1)) > 0 && f[1].what.indexOf(M.fmtN(C("us").total, 1)) > 0, "fact: US net exports 11.1 quads, production 107.2, consumption 96.5");
  ok(f[2].n === M.pct(C("cn").coalEquivalent.shares.coal, 1), "fact: China coal 54.8%");
  const fx = n => f.filter(x => x.n === n)[0], pe = C("jp").pubElec;
  ok(fx("1 ÷ efficiency").what.indexOf(M.fmtN(1 / D.subEff, 1) + " at " + M.pct(D.subEff)) > 0, "fact: the substitution factor 2.5 at 40%");
  ok(fx(M.fmtN(pe.mjPerKWh, 2) + " MJ per kWh") && fx(M.fmtN(pe.mjPerKWh, 2) + " MJ per kWh").what.indexOf(M.pct(D.pjPerTWh / pe.mjPerKWh, 1)) > 0 && /fiscal year 2024/.test(fx("8.49 MJ per kWh").asof), "fact: Japan's 8.49 MJ per kWh, a thermal plant at 42.4%");
}

// ---------------- shares from first principles: each source classed on its own (Eurostat keeps non-renewable waste apart)
{
  const REN = { us: ["hydro", "wind", "solar", "geo", "bio"], eu: ["hydro", "wind", "solar", "bio", "geoheat"], cn: ["hydro", "wind", "solar"], in: ["hydro", "wso"], jp: ["hydro", "wind", "solar", "geo", "bio"], br: ["hydro", "wind", "solar", "bio"], no: ["hws", "bio"] };
  Object.keys(REN).forEach(k => {
    const N = byKey(k), P = M.primaryAs(D, N, "pec");
    ok(near(P.renewable, sum(REN[k].map(s => N.src[s])) / N.total, 1e-12), k + ": renewable share " + M.pct(P.renewable, 1) + " = its renewable rows ÷ primary energy; 'other' never counted renewable");
  });
  ok(near(M.primaryAs(D, byKey("eu"), "pec").renewable, 0.2027, 0.0005), "EU: renewable share 20.3% with geothermal, ambient heat and tide (18.3% without)");
  const no = byKey("no"), a = M.primaryAs(D, no, "pec");
  ok(near(a.unsplit, 5.2 / 326.2, 1e-12) && M.unsplitNote(D, no, a.unsplit).indexOf("waste, 1.6%, not split") > 0, "Norway: waste 1.6% shown as not split");
  const jp = byKey("jp"), aj = M.primaryAs(D, jp, "pec");
  ok(near(aj.unsplit, 573.930037 / aj.total, 1e-9) && M.unsplitNote(D, jp, aj.unsplit).indexOf("waste and recovered heat, 3.4%, not split") > 0 && D.nodes.recov.unsplit && !D.nodes.recov.renewable && !D.nodes.recov.fossil, "Japan: waste and recovered heat 3.4%, kept apart, neither renewable nor fossil");
  ok(L.filter(N => N.key !== "no" && N.key !== "jp").every(N => M.primaryAs(D, N, "pec").unsplit === 0 && M.unsplitNote(D, N, 0) === ""), "no other country has an unsplit component");
  // coverage beside China and India, in every place a share or total shows
  const cov = { cn: "partial", in: "traditional biomass", no: "counted as renewable" };
  { const P = byKey("no").P; ok(byKey("no").coverage.indexOf(M.pct((P.hydroGWh + P.windGWh + P.solarGWh) / P.genGWh, 1) + " of 2025's generation") > 0, "Norway: its electricity counted as renewable; hydro, wind and solar 98.7% of generation (SSB Table 7)"); }
  Object.keys(cov).forEach(k => {
    const N = byKey(k);
    ok(N.coverage && N.coverage.indexOf(cov[k]) >= 0, k + ": coverage named");
    ok(M.covNote(N) === "**Coverage, " + M.nameOf(N) + ":** " + N.coverage + "." && [M.viewLine(D, N), M.convLine(D, N, "pec"), N.noFinal ? "" : M.accountLine(D, N, E)].every(s => s.indexOf(N.coverage) < 0), k + ": coverage its own element, not inside the step lines");
    ok(M.staticFallback(D, L, E).indexOf(N.coverage.charAt(0).toUpperCase() + N.coverage.slice(1)) > 0, k + ": coverage beside its no-JS rows");
  });
  {   // Japan's coverage carries a glossary mark: drawn as a term in the no-JS rows and the convention table, never as raw markup
    const N = byKey("jp"), fb = M.staticFallback(D, L, E);
    ok(/converted from METI's counting of electricity/.test(N.coverage) && /gross-calorific-value\|gross calorific value/.test(N.coverage) && /waste and recovered heat counted/.test(N.coverage), "jp: coverage named (conversion, gross calorific value, waste and recovered heat)");
    ok((JS.match(/setCov\(cov, N\)/g) || []).length === 3 && /ln\.innerHTML = bold\(viewLine\(D, N\)\); setCov\(cov, N\)/.test(JS) && /ln\.innerHTML = bold\(accountLine\(D, N, E\)\); setCov\(cov, N\)/.test(JS) && /ln\.innerHTML = bold\(convLine\(D, N, last\.conv\)\); setCov\(cov, N\)/.test(JS), "coverage shown beside the step 2, 3 and 4 lines, as its own element");
    ok(L.filter(n => !n.coverage).every(n => M.covNote(n) === ""), "no coverage element for a country without a caveat");
    ok(fb.indexOf("<small>Converted from METI's counting of electricity; fuels at <span class=\"lx-term\" data-term=\"gross-calorific-value\">gross calorific value</span>; waste and recovered heat counted</small>") > 0 && !/\[\[/.test(fb), "jp: coverage beside its no-JS rows, the term marked");
    const ct = M.convTableHTML(D, L, "pec", "renewable");
    ok(ct.indexOf("<small>Converted from METI's counting of electricity; fuels at <span class=\"lx-term\" data-term=\"gross-calorific-value\">gross calorific value</span>") > 0 && !/\[\[/.test(ct) && /richStatic\(N\.coverage/.test(JS) && /convTableHTML\(D, L, cv, "renewable", LX\.rich\)/.test(JS), "coverage rendered with its marks in the convention tables and the no-JS rows");
    ok(/Japan's counts waste and recovered heat/.test(M.COMPARE_NOTE), "the comparison note names Japan's coverage");
  }
  ok(M.checkHTML(D, L, E).indexOf("of the sources its balance covers (" + byKey("in").coverage + ")") > 0, "India's quiz answer: share of the sources covered");
  ok(!/ranked: true|By fossil share/.test(JS) && /Listed in the course's order, not ranked/.test(M.COMPARE_NOTE), "no ranking of countries in the comparison table");
  // boundaries and sector names
  const us = byKey("us"); ok(/lease and plant fuel in industry, pipeline fuel in transport/.test(us.finalNote) && /Table 4\.3/.test(D.sources["eia-mer"].title + D.sources["eia-mer"].where), "US: the end-use boundary named, from MER Table 4.3");
  ok(/unless the country's note says otherwise/.test(M.FINAL_NOTE) && /cnote\.textContent = N\.finalNote/.test(JS), "final energy's own-use boundary: no blanket claim; the U.S. note shown in step 3");
  ok(M.finalSpec(D, no, E, false).nodes.filter(n => n.id === "s_buildings")[0].label === "Households" && /Services/.test(M.finalSpec(D, no, E, false).nodes.filter(n => n.id === "s_other")[0].label), "Norway: households and services named as SSB splits them");
  ok(M.primarySpec(D, us, "pec").nodes.filter(n => n.id === "s_industry")[0].label === "Industry (with farms and mining)", "US: industry holds farms and mining");
  ok(M.primarySpec(D, byKey("jp"), "pec").nodes.filter(n => n.id === "s_industry")[0].label === "Industry (with farms and fishing)" && /farms and fishing sit in industry/.test(C("jp").prov.adjust), "Japan: industry holds farms and fishing, said in its provenance");
  // useful energy: a what-if for the real countries, never an 'estimate' of their own
  ok(M.finalSpec(D, us, E, true).nodes.filter(n => n.id === "useful")[0].label === "Useful energy (what-if)" && M.finalSpec(D, byKey("pl"), E, true).nodes.filter(n => n.id === "useful")[0].label === "Useful energy", "useful node: what-if for real countries, Prairieland's own");
  ok(/what-if/.test(M.USEFUL_NOTE) && /what-if/.test(M.accountLine(D, us, E)) && /what-if/.test(M.accountSaw(D, L, E)) && /in this what-if/.test(M.checkHTML(D, L, E)) && /If every country used energy at Prairieland's sector efficiencies/.test(M.checkHTML(D, L, E)), "useful energy named a what-if in the line, summary, note and myth");
  ok(!/useful[^.]*\(an estimate\)|Useful energy \(estimate\)/.test(JS + PAGE), "no useful energy called an estimate of a real country");
  // the substitution box: nuclear's share recomputed, not "barely moves"
  const sa = M.primaryAs(D, us, "pec"), sb = M.primaryAs(D, us, "sub"), sh = M.substHTML(D, L);
  ok(sh.indexOf(M.pct(sa.v.nuclear / sa.total, 1) + " by physical content, " + M.pct(sb.v.nuclear / sb.total, 1) + " by substitution") > 0 && near(sa.v.nuclear / sa.total, 0.085, 0.0005) && near(sb.v.nuclear / sb.total, 0.0665, 0.0005), "substitution box: U.S. nuclear 8.5% → 6.7%");
  ok(!/barely moves/.test(PAGE + JS) && /measured where it is reported/.test(sh), "no 'barely moves'; measured heat told apart from ÷ 0.33");
  ok(sh.indexOf("2.5 times its electricity at 40%") > 0 && sh.indexOf("about 3 times at 33%") > 0, "substitution box: 2.5 at 40%, about 3 at 33%");
  // the units: Brazil's tep
  ok(D.units.mtep.note === "1 tep = 10⁷ kcal = 41.868 GJ" && near(1e7 * 4186.8 / 1e9, 41.868, 1e-9), "1 tep = 10⁷ kcal = 41.868 GJ (1 kcal = 4,186.8 J)");
  // step 4 starts on the predicted country, with a country switch
  ok(M.convStartKey(D) === D.mystery.key && /last\.key = convStartKey\(D\)/.test(JS) && /seg\(res, "Country for the line below"/.test(JS), "step 4: the reveal starts on Norway, and the reader can switch country");
  {   // the table beside the prediction shows the predicted metric; the four-source grouping comes second, named
    const na = M.primaryAs(D, no, "pec"), nb = M.primaryAs(D, no, "sub"), t1 = M.convTableHTML(D, L, "sub", "renewable"), t2 = M.convTableHTML(D, L, "sub", "elec");
    const row = (t, name) => (t.match(new RegExp("<tr><th scope=\"row\">" + name + "[^]*?</tr>")) || [""])[0];
    ok(row(t1, "Norway").indexOf("<td>" + M.pct(na.renewable) + "</td>") > 0 && row(t1, "Norway").indexOf("<td class=\"on\">" + M.pct(nb.renewable) + "</td>") > 0 && M.convQ(D, L).feedback.rises.indexOf(M.pct(na.renewable) + " by physical energy content and " + M.pct(nb.renewable)) > 0, "step 4: the first table shows Norway's renewable share, " + M.pct(na.renewable) + " → " + M.pct(nb.renewable) + ", as the prediction's feedback does");
    ok(row(t2, "Norway").indexOf("<td>" + M.pct(na.elec) + "</td>") > 0 && /share you predicted/.test(t1) && /four sources the conventions count differently/.test(t2), "step 4: the second table, nuclear, hydro, wind and solar (" + M.pct(na.elec) + "), captioned apart");
    const en = M.elecNote(D, L); ok(en.indexOf("leaves out bioenergy") > 0 && en.indexOf(M.pct(na.elec) + " there, " + M.pct(na.renewable) + " above") > 0, "step 4: the note between the tables says why Norway reads " + M.pct(na.elec) + " there");
    ok(JS.indexOf('tbHost.innerHTML = convTableHTML(D, L, cv, "renewable", LX.rich)') > 0 && JS.indexOf('text: elecNote(D, L)') > JS.indexOf("var tbHost = ") && JS.indexOf("var tbHost2 = ") > JS.indexOf("text: elecNote(D, L)"), "step 4: renewable table, then the note, then the four-source table");
    const cl = M.convLine(D, no, "sub"); ok(cl.indexOf("renewables " + M.pct(nb.renewable)) > 0 && cl.indexOf("nuclear, hydro, wind and solar " + M.pct(nb.elec)) > 0, "step 4's line names both shares");
    ok(D.conventions.every(c => M.convUsers(c) === (c.who ? "Used by " + c.who + "." : c.note)) && /who\.textContent = C\.text; whoBy\.textContent = convUsers\(C\)/.test(JS), "step 4: a convention's rule and its users as two elements");
  }
  // step 3: primary energy defined without implying imports
  ok(!/Primary energy\]\] enters/.test(M.STEPS[2]) && /home-grown or imported, before conversion/.test(M.STEPS[2]), "step 3: primary energy is energy as found in nature, home-grown or imported");
  {   // the useful view: the efficiencies applied and one multiplication, in step 3 and the no-JS block
    const ur = M.usefulRows(D, us, E), ut = M.usefulTableHTML(D, us, E), wl = M.workedLine(D, us, E), U = M.useful(us, E);
    ok(ur.every(r => near(r.eff, E[r.s], 1e-12) && near(r.useful, r.final * E[r.s], 1e-9)) && near(sum(ur.map(r => r.useful)), U.total, 1e-9), "useful table: each sector's final × Prairieland's efficiency is its useful energy");
    ok(["85.5%", "30.7%", "89.8%"].every(x => ut.indexOf("<td>" + x + "</td>") > 0) && ut.indexOf("<td>" + M.ej(U.total) + "</td>") > 0 && /How the what-if is computed for the United States/.test(ut), "useful table: the U.S. at industry 85.5%, transport 30.7%, buildings 89.8%; total " + M.ej(U.total));
    const tr = ur.filter(r => r.s === "transport")[0]; ok(wl.indexOf(M.ej(tr.final) + " × " + M.pct(tr.eff, 1) + " ≈ " + M.ej(tr.useful)) > 0 && /a what-if/.test(wl), "worked example: " + wl.replace(/\*\*/g, ""));
    ok(near(M.effs(PL).other, PL.balance.useful.bySector.agriculture / sum(Object.values(PL.balance.final.agriculture)), 1e-12) && M.pct(E.other, 1) === "47.8%", "the farms efficiency, 47.8%, is Prairieland's own");
    ok(M.usefulTableHTML(D, byKey("pl"), E).indexOf("Prairieland's own useful energy") > 0 && !/what-if/.test(M.workedLine(D, byKey("pl"), E)) && M.usefulTableHTML(D, byKey("cn"), E) === "", "useful table: Prairieland's own, not a what-if; none for China");
    const fbu = M.staticFallback(D, L, E); ok(fbu.indexOf(ut) > 0 && fbu.indexOf(M.richStatic(wl)) > 0 && fbu.indexOf(M.EFF_NOTE) > 0 && /illustrative averages, not measurements/.test(M.EFF_NOTE), "no-JS: the efficiencies, the table and the worked example");
    ok(/how\.innerHTML = spec && last\.view === "useful" \? "<div class=\\"lx-scroll-x\\">" \+ usefulTableHTML\(D, N, E\)/.test(JS) && /bold\(workedLine\(D, N, E\)\)/.test(JS) && /LX\.esc\(EFF_NOTE\)/.test(JS), "step 3: the useful view shows the table, the worked example and the efficiencies' note");
    // Prairieland's useful note is the page's own, its numbers read from Prairieland's file; no attribution the page cannot date
    const ef = PL.balance.useful.efficiency, pn = M.plUsefulNote(PL);
    ok(pn.indexOf("engines " + M.pct(ef.transport.oil)) > 0 && pn.indexOf("EVs " + M.pct(ef.transport.el)) > 0 && pn.indexOf("75% to 80%") > 0 && /set for teaching/.test(pn) && !/DOE|\.json/.test(pn), "Prairieland's useful note: " + pn.slice(0, 70));
    ok(/N\.PL \? plUsefulNote\(N\.PL\)/.test(JS) && !/balance\.useful\.note/.test(JS), "step 3 shows the page's own Prairieland note, not the shared file's");
  }
  // step 6: Ember keeps its label as a compiler; system and number are separate short elements
  L.filter(N => M.cardOf(R, N.card)).forEach(N => {
    const cp = M.cardPreview(R, N), s = R.sources[M.cardOf(R, N.card).numbers[0].src];
    ok(!/ember/i.test(s.publisher) || cp.cite.indexOf("Ember, a compiler of official statistics") === 0, N.key + ": Ember named as a compiler in the preview");
    ok(cp.system.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).length <= 35 && ("One key number: " + cp.number).replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).length <= 35, N.key + ": preview parts within the budget");
  });
  ok(/html: "One key number: " \+ LX\.rich\(cp\.number\) \}/.test(JS) && /text: "Source: " \+ cp\.cite/.test(JS), "step 6: the key number and its source as two elements");
  // the no-JS block holds a worked flow table and the primary, final and useful table
  const fb = M.staticFallback(D, L, E), ws = M.primarySpec(D, byKey(M.FLOW_KEY), "pec");
  ok(fb.indexOf("One balance, flow by flow") > 0 && ws.links.every(l => fb.indexOf("<td>" + M.ejNum(l.value) + "</td></tr>") > 0), "no-JS: the U.S. flows, every one");
  ok(fb.indexOf("Primary, final and useful energy") > 0 && L.filter(N => !N.noFinal).every(N => fb.indexOf(M.ej(M.useful(N, E).total)) > 0) && fb.indexOf(M.USEFUL_NOTE) > 0, "no-JS: primary, final and useful for each country, with the what-if note");
  {   // the no-JS block holds every lens, as the live table does
    const fbl = M.staticFallback(D, L, E);
    ok(fbl.indexOf("Three more lenses: resources, climate and institutions") > 0 && L.every(N => M.FALLBACK_LENSES.every(k => fbl.indexOf("<td data-l=\"" + D.lenses.filter(l => l.key === k)[0].label + "\">" + M.richStatic(M.lensCell(D, N, k)) + "</td>") > 0)) && !/\[\[/.test(fbl), "no-JS: resources, climate and institutions for all " + L.length + " (imports in the first table)");
    ok(M.climateText(byKey("cn")) === "not shown: its final energy is not on the others' basis" && !/see step 3/.test(RAW + JS), "China's climate cell reads without the steps");
  }
  {   // the institutions lens: the EU's unbundling as the Commission states it; Norway's dated market change from its operator
    const eu = C("eu"), no2 = C("no"), ec = D.sources["ec-unbundling"], st = D.sources["statnett-fbmc"];
    ok(!/Separate companies make, carry and sell/.test(RAW) && /Grid operation is kept apart from power generation and sales/.test(eu.institutions) && /independently run subsidiaries/.test(eu.institutions) && eu.src.indexOf("ec-unbundling") >= 0, "EU: unbundling separates grid operation from generation and sales, by company or independent subsidiary");
    ok(/separates the operation of transmission networks from supply and generation/.test(ec.where) && /independent transmission system operator, a subsidiary/.test(ec.where) && /read 8 November 2026/.test(ec.date) && /^https:\/\/energy\.ec\.europa\.eu\//.test(ec.url), "EU: the European Commission's unbundling page, read 8 November 2026");
    ok(/since October 2024 the Nordic day-ahead market uses/.test(no2.institutions) && !/Nord Pool's/.test(no2.institutions) && no2.src.indexOf("statnett-fbmc") >= 0 && /went live on 29 October 2024/.test(st.where) && /^1 November 2024; read 8 November 2026$/.test(st.date) && /^Statnett/.test(st.publisher), "Norway: the October 2024 change dated by its operator, Statnett (1 November 2024)");
    ok(D.countries.every(c => c.src.every(k => D.sources[k])), "every country's sources are in the source list");
    const sh = M.sourcesHTML(D, PL), cut = sh.indexOf("The institutions lens, beyond the regional cards:");
    ok(cut > 0 && ["ec-unbundling", "statnett-fbmc"].every(k => sh.indexOf(D.sources[k].title) > cut) && sh.indexOf(D.sources["eia-mer"].title) < cut, "sources: the lens sources listed apart from the seven balances");
  }
  {   // units, heat rate and LNG explained where they show
    const nh = M.notesHTML(D), uk = Object.keys(D.units).filter(u => D.units[u].key);
    ok(nh.indexOf("<p class=\"lx-eyebrow\">Units as published</p>") === 0 && uk.length === 6 && uk.every(u => nh.indexOf(M.richStatic(D.units[u].key)) > 0), "the provenance box opens with a key to the six published units");
    ok(D.units.quad.key.indexOf("1 quad = 1.05506 EJ") > 0 && D.units.ktoe.key.indexOf("1 toe = 41.868 GJ") > 0 && D.units.mtep.key.indexOf("41.868 GJ") > 0 && D.units.tce4.key.indexOf("29.3076 GJ") > 0 && D.units.twh.key.indexOf("3.6 PJ") > 0, "the units key agrees with the conversion factors");
    ok(/\[\[quad\|quads\]\]/.test(C("us").prov.published) && /\[\[heat-rate\|heat rate\]\]/.test(C("us").prov.method) && /\[\[oil-equivalent\|ktoe\]\]/.test(C("in").prov.published) && /\[\[oil-equivalent\|Mtep\]\]/.test(C("br").prov.published) && !/\[\[/.test(nh), "quads, heat rate, ktoe and Mtep marked where they first show; marks rendered");
    ok(/data-term="heat-rate">heat rate<\/span> \(the U\.S\.\)/.test(M.substHTML(D, L)) && M.plFullHTML(PL).indexOf(M.richStatic(M.LNG_NOTE)) > 0 && /LX\.rich\(LNG_NOTE\)/.test(JS), "heat rate marked in the substitution box; LNG explained under Prairieland's full balance");
  }
  // provenance: one field per cell; its numbers agree with the data
  D.countries.forEach(c => ok(M.PROV_COLS.every(p => c.prov[p[0]] && c.prov[p[0]].split(/\s+/).length <= 35), c.key + ": provenance in four short fields"));
  ok(C("us").prov.published.indexOf(M.fmtN(C("us").total, 1)) === 0 && C("us").prov.adjust.indexOf(M.fmtN(C("us").pub.nonfuel, 1) + " quads") > 0, "US provenance: 96.5 and 6.5 quads");
  ok(C("eu").prov.published.indexOf(M.fmtN(C("eu").total / 1000)) === 0 && C("eu").prov.coverage.indexOf(M.fmtN(C("eu").pub.bunkers / 1000)) > 0, "EU provenance: 55,790 and 1,704 PJ");
  ok(C("cn").prov.published.indexOf(M.fmtN(C("cn").coalEquivalent.total)) === 0 && ["coal", "oil", "gas", "nonFossil"].every(s => C("cn").prov.published.indexOf(M.pct(C("cn").coalEquivalent.shares[s], 1)) > 0), "China provenance: the published total and shares");
  ok(C("in").prov.published.indexOf(M.fmtN(C("in").total)) === 0 && C("in").prov.published.indexOf(M.fmtN(C("in").total * 0.041868)) > 0, "India provenance: 903,158 ktoe = 37,813 PJ");
  ok(C("br").prov.published.indexOf(M.fmtN(C("br").total, 1)) === 0 && ["sugarcane", "firewood", "liquorOther"].every(k => C("br").prov.coverage.indexOf(M.fmtN(C("br").pub[k], 1)) > 0), "Brazil provenance: 328.5 Mtep and the bioenergy rows");
  ok(C("no").prov.coverage.indexOf(M.fmtN(C("no").primary.waste, 1) + " TWh") > 0 && C("no").prov.method.indexOf(M.pct(C("no").pub.hydroGWh / C("no").pub.genGWh, 1)) > 0, "Norway provenance: waste 5.2 TWh; hydro 89.9% of generation");
  const jc = C("jp"); ok(jc.prov.published.indexOf(M.fmtN(jc.total)) === 0 && jc.prov.coverage.indexOf(M.fmtN(jc.primary.recov) + " TJ") > 0 && jc.prov.method.indexOf(M.fmtN(jc.pubElec.mjPerKWh, 2) + " MJ per kWh") > 0 && jc.prov.method.indexOf(M.pct(3.6 / jc.pubElec.mjPerKWh, 1)) > 0 && /gross calorific value/.test(jc.prov.method), "Japan provenance: 17,461,344 TJ; 573,930 TJ of waste and recovered energy; 8.49 MJ per kWh at 42.4%; gross calorific value");
  // the source note: URL, access date, the table and rows read, the file's SHA-256
  const ms = D.sources["meti-balance"];
  ok(/^[0-9a-f]{64}$/.test(ms.file.sha256) && ms.file.url === ms.also[0].url && /stte_2024\.xlsx$/.test(ms.file.url) && /7 November 2026/.test(ms.file.accessed + ms.date) && /#190000/.test(ms.file.rows) && /14 April 2026/.test(ms.date), "METI source: file, access date, rows and SHA-256 recorded");
  ok(ms.where.indexOf(M.fmtN(jc.total)) > 0 && ms.where.indexOf(M.fmtN(Math.round(jc.pub.finalAll))) > 0 && ["nuclear", "hydro", "solar", "wind", "geo"].every(s => ms.where.indexOf(M.fmtN(jc.pubElec.gwh[s])) > 0), "METI source: its rows agree with the data");
  ok(["agMining", "manufacturing", "commerce", "residential", "transport", "production", "imports", "exports"].every(k => ms.file.rowsRead.indexOf(M.fmtN(jc.pub[k])) > 0) && ["coal", "nuclear", "hydro", "solar", "wind", "geo", "bio", "recov"].every(k => ms.file.rowsRead.indexOf(M.fmtN(jc.primary[k] + (k === "coal" ? 8243.596 : 0))) > 0), "METI file note: every row read, as the data holds it");
  // the counting rule's users: five of the seven publishers count physical energy content
  ok(D.countries.length === 7 && D.countries.filter(c => c.convention === "pec").length === 5 && /five of the seven publishers on this page \(not China's or Japan's\)/.test(D.conventions[0].who) && /Japan's balance/.test(D.conventions[1].who), "the conventions' users: five of the seven publishers; China's and Japan's are substitutions");
}

// ---------------- scope
{
  // the scope scan's deny-list and nuclear-plus-risk rule (copied; the scope scan runs the canonical copy on the rendered site)
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  const DENY = [/\bFOAK\b/, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i, /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//, /research\.(html|qmd)/, /\bAI\b/, /artificial intelligence/i];
  // every string the page loads: its own data, the regional cards, the Prairieland strings it shows, the path entries it names
  const PATHJ = require(L_("data/path.json")), named = new Set(["A20", "A21", "M13", "X3", "X2", "F4", "F3"]);
  const pathStrs = []; (function walk(x) { if (x && typeof x === "object") { if (named.has(x.code) || named.has(x.id)) pathStrs.push(x); Object.keys(x).forEach(k => walk(x[k])); } })(PATHJ);
  const plUsed = [PL.about.line, PL.balance.sankey, PL.regions.map(r => r.climate), M.PL_SRC.map(k => PL.sources[k])];
  const strs = []; (function walk(x) { if (typeof x === "string") strs.push(x); else if (x && typeof x === "object") Object.keys(x).forEach(k => walk(x[k])); })([D, R, plUsed, pathStrs]);
  ok(strs.length > 500 && pathStrs.length >= 5, "the scope scan covers " + strs.length + " strings, " + pathStrs.length + " of them path entries");
  const denied = strs.concat([JS, OWN]).filter(s => DENY.some(rx => rx.test(s))); ok(!denied.length, "no deny-listed term: " + denied.slice(0, 2).map(s => s.slice(0, 60)).join(" | "));
  const bad = strs.filter(s => NUC.test(s) && RISK.test(s)); ok(!bad.length, "no data string pairs a nuclear term with a risk term: " + bad.slice(0, 2).join(" | "));
  const sentences = OWN.replace(/<[^>]+>/g, " ").split(/(?<=[.;:?])\s+/); const badS = sentences.filter(s => NUC.test(s) && RISK.test(s));
  ok(!badS.length, "no page sentence pairs a nuclear term with a risk term: " + badS.slice(0, 2).join(" | "));
  const all = [M.staticFallback(D, L, E), M.ideasHTML(D, L, E), M.checkHTML(D, L, E), M.notesHTML(D), M.STEPS.join(" "), M.LENS_SAW, M.CONV_SAW, M.USEFUL_NOTE, M.BEFORE_NOTE].join(" ").split(/(?<=[.;:?])\s+/);
  ok(!all.filter(s => NUC.test(s) && RISK.test(s)).length, "no generated sentence pairs a nuclear term with a risk term");
  ok(!/\bAI\b|artificial intelligence|learning[- ](curve|rate)/i.test(RAW + JS + OWN), "no deny-listed term in the lesson's own files");
  ok(!/not on the course's link list|link list|allow-list/i.test(OWN.replace(/<!--[\s\S]*?-->/g, "")), "no editorial link rule shown on the page");
  // the course's allowed external domains (learn/ links are internal; the generated navbar and footer are outside the rule)
  const DOMAINS = ["eia.gov", "energy.gov", "ferc.gov", "nerc.com", "lbl.gov", "nrel.gov", "nlr.gov", "epa.gov", "usgs.gov", "bea.gov", "census.gov", "bls.gov", "noaa.gov", "weather.gov", "fema.gov", "dot.gov", "irs.gov", "energycodes.gov", "kcc.ks.gov",
    "iea.org", "irena.org", "ipcc.ch", "worldbank.org", "ec.europa.eu", "entsoe.eu", "ember-energy.org", "ourworldindata.org", "openalex.org", "iso.org", "ghgprotocol.org", "doi.org", "pjm.com", "spp.org", "ercot.com", "caiso.com", "misoenergy.org", "iso-ne.com", "nyiso.com",
    "stats.gov.cn", "nea.gov.cn", "mospi.gov.in", "epe.gov.br", "ssb.no", "cso.ie", "cer.gov.au", "aemo.com.au", "enecho.meti.go.jp", "meti.go.jp"];
  const ALLOW = { test: u => { const m = /^https:\/\/([^/]+)\//.exec(u); return !!m && DOMAINS.some(d => m[1] === d || m[1].endsWith("." + d)); } };
  const urls = (RAW + JSON.stringify(R) + JSON.stringify(plUsed) + OWN).match(/https?:\/\/[^\s"'<>)]+/g) || [];
  ok(urls.every(u => ALLOW.test(u)), "every link on the allow-list: " + urls.filter(u => !ALLOW.test(u)).slice(0, 3).join(" "));
  Object.keys(D.sources).forEach(k => ok(D.sources[k].url === "no link" || ALLOW.test(D.sources[k].url), "source " + k + " linked only if allow-listed"));
  Object.keys(D.sources).forEach(k => (D.sources[k].also || []).forEach(a => ok(a.label && ALLOW.test(a.url), "source " + k + ": its other file " + a.label + " is linked on the allow-list")));
  ok(["nbs-yearbook", "mospi-esi", "meti-balance", "epe-ben", "ssb-balance"].every(k => D.sources[k].url !== "no link"), "the national statistics publishers are linked (all on the allow-list)");
  ok(!/Japan[^.]{0,80}(left out|not included|could not|unreadable)/i.test(RAW + JS + OWN), "no note that Japan is left out");
  ok(M.staticFallback(D, L, E).indexOf("<p class=\"lx-eyebrow\">Eight energy systems") === 0 && M.sourcesHTML(D, PL).indexOf("The seven balances, as published") > 0 && M.ideasHTML(D, L, E).indexOf("no two of these eight look alike") > 0 && M.checkHTML(D, L, E).indexOf("for the six real countries drawn here") > 0 && M.checkHTML(D, L, E).indexOf("Which of the eight gets") > 0 && M.convSwitchLine(D, L).indexOf("all eight") > 0, "the counts follow the data: eight systems, seven balances, six real countries with final energy");
  // step 3: only a view drawn for the chosen country counts toward the step (China has no final or useful view)
  ok(/if \(spec\) tried\[last\.view\] = true/.test(JS) && !/last\.view = v; tried\[v\] = true/.test(JS) && /N\.noFinal \+ " " \+ NOVIEW_HINT/.test(JS), "step 3 counts only views it has drawn, and says to switch country");
  ok(/has not converted its final energy/.test(C("cn").noFinal) && !/cannot be drawn/.test(RAW), "China: no final view because this page has not converted it, not because it cannot be");
  ok(M.plFullHTML(PL).split("<tr>").length - 2 === PL.balance.sankey.links.length && M.plFullHTML(PL).indexOf(PL.about.line) > 0, "no-JS: Prairieland's full balance, every flow");
  ok(/\nsubtitle: "Draw eight national energy balances/.test(PAGE) && /the European Union, China, India, Japan, Brazil, Norway and the fictional Prairieland/.test(PAGE.split("\n---")[0]), "the subtitle and description count and name Japan");
  ok(M.staticFallback(D, L, E).indexOf(PL.about.line) >= 0 && /fictional\(host, N\)|PL\.about\.line/.test(JS), "the fictional line with every Prairieland drawing (fallback, steps, lens table, explain)");
}

// ---------------- text budget
M.STEPS.forEach((t, i) => { const w = t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).length; ok(w <= 35, "step " + (i + 1) + " text " + w + " words (≤ 35)"); });
{
  const words = t => t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).length;
  const Q = M.mysteryQ(D, L), cq = M.convQ(D, L);
  const shown = [M.LENS_SAW, M.CONV_SAW, M.CARD_SAW, M.USEFUL_NOTE, M.BEFORE_NOTE, M.FINAL_NOTE, M.COMPARE_NOTE, M.EFF_NOTE, M.LNG_NOTE, M.largestSaw(D, L), M.accountSaw(D, L, E), M.chinaLine(D, L), M.japanRule(D, L), M.japanResult(D, L), M.convSwitchLine(D, L), M.elecNote(D, L), M.plUsefulNote(PL), M.CONV_CAPTION.renewable, M.CONV_CAPTION.elec]
    .concat(D.subEffNotes, D.lenses.map(l => l.text), D.conventions.map(c => c.text), D.conventions.map(M.convUsers), Object.values(D.units).map(u => u.key || ""), L.map(N => M.covNote(N)), L.map(N => M.workedLine(D, N, E)))
    .concat([].concat(...D.countries.map(c => M.PROV_COLS.map(p => c.prov[p[0]]))), [].concat(...L.filter(N => M.cardOf(R, N.card)).map(N => { const cp = M.cardPreview(R, N); return [cp.system, "One key number: " + cp.number]; })))
    .concat(Object.values(Q.feedback), Object.values(cq.feedback))
    .concat(L.map(N => M.viewLine(D, N)), L.map(N => M.accountLine(D, N, E)), L.map(N => N.finalNote || ""), [].concat(...D.conventions.map(cv => L.map(N => M.convLine(D, N, cv.key)))))
    .concat([].concat(...L.map(N => ["imports", "resources", "climate", "institutions"].map(k => M.lensCell(D, N, k)))))
    .filter(Boolean);
  shown.forEach(t => ok(words(t) <= 35, "≤ 35 words (" + words(t) + "): " + t.slice(0, 50)));
  ok(D.subEffNotes.length === 3 && D.subEffNotes[1].indexOf(M.pct(D.subEff)) > 0, "the substitution note as rule, assumption and exception; 40% as the data's");
  const ans = M.checkHTML(D, L, E).match(/<p>[^<]*<\/p>/g) || []; ans.forEach(a => ok(words(a) <= 35, "answer ≤ 35 words: " + a.slice(3, 50)));
  ok(words(D.sources["meti-balance"].where) <= 45 && M.substHTML(D, L).match(/<li>.*?<\/li>/g).every(li => words(li) <= 40), "Japan's source entry and each line of the substitution box within the budget");
}

// ---------------- every glossary mark the page shows has an entry (the course build writes glossary.json)
{
  const G = require(L_("data/glossary.json")), ids = new Set();
  const text = [PAGE, RAW, JS].join(" ");
  (text.match(/data-term=\\?"([a-z0-9-]+)\\?"/g) || []).forEach(m => ids.add(m.replace(/^data-term=\\?"|\\?"$/g, "")));
  (text.match(/\[\[([a-z0-9-]+)\|/g) || []).forEach(m => ids.add(m.slice(2, -1)));
  ids.delete("lesson");
  const missing = [...ids].filter(i => !G[i]);
  ok(ids.size > 20 && !missing.length, "every glossary mark (" + ids.size + ") has an entry: " + missing.join(", "));
  ok(["quad", "oil-equivalent", "coal-equivalent", "heat-rate", "lng", "btu"].every(i => ids.has(i)), "the units, heat rate and LNG are marked");
}

console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
