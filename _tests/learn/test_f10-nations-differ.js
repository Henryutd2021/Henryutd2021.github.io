// test_f10-nations-differ.js — Node tests for lesson F10 (assets/learn/f10-nations-differ.js, its data file, prairieland.json,
// regions.json and the page, learn/f10-nations-differ.qmd):
//   - the published rows: each country's primary rows add to its published total (or the gap is its stated 'other'); the
//     conversions to PJ are the UN's conventional factors; electricity rows agree with the published primary values where
//     the publisher counts them at their electricity (hydro, wind, solar), and with ÷ 0.33 for nuclear where it says so
//   - Prairieland is read from prairieland.json, never copied: the lesson's data file and script hold none of its numbers;
//     its three conventions reproduce the file's own totals and shares
//   - the conventions from first principles: physical content, substitution (× 1/η) and direct equivalent recomputed here
//   - every Sankey balances (sources = primary = uses); before-the-meter is never negative; the useful estimate uses
//     Prairieland's sector efficiencies
//   - every prediction, reveal, line and lens text true against the data (mystery country, conventions, largest sources,
//     import dependence, production shares)
//   - the no-JS block, ideas, notes, check, facts and sources equal what the model writes (--write rewrites them); every
//     number in the facts table is recomputed
//   - scope: no nuclear term with a risk term in any string; no "AI"; links on the allow-list (others "no link"); the
//     fictional line wherever Prairieland is drawn; text budget of the step cards
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
  "f10-check": () => M.checkHTML(D, L, E), "f10-facts": () => M.factsHTML(D), "f10-sources": () => M.sourcesHTML(D, PL) };
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
  ok(other > 0 && other < 0.15, "US: the listed sources leave " + other.toFixed(3) + " quads (geothermal 0.117 and the rest of EIA's total)");
  ok(near(us.twh.hydro * 3412e-6, us.primary.hydro, 0.002) && near(us.twh.wind * 3412e-6, us.primary.wind, 0.002), "US: hydro and wind at 3,412 Btu per kWh (EIA's method since September 2023)");
  ok(us.primary.solar > us.twh.solar * 3412e-6, "US: solar's primary value holds its electricity (with small-scale) and a little solar heat");
  const eff = us.twh.nuclear * 3412e-6 / us.primary.nuclear; ok(eff > 0.32 && eff < 0.34, "US: nuclear at its plants' heat rate, an efficiency of " + (100 * eff).toFixed(1) + "%");
  const P = M.pubOf(us); ok(near(P.residential + P.commercial + P.industrial + P.transportation, 76.788223, 1e-6), "US: end-use sectors add to 76.788 quads");
  ok(near(P.residential + P.commercial + P.industrial + P.transportation + 19.672147, us.total, 0.01), "US: end use plus electrical system losses (19.672 quads, Tables 2.2 to 2.5) is the primary total");
  const eu = C("eu"), el = sum(Object.values(eu.primary)), euOther = eu.total - el;
  ok(near(euOther, 278962.497 + 800099.994 + 1684.076 + 593729.585 - 44285.868 + 32313.75, 0.05), "EU: 'other' is geothermal, ambient heat, tide, non-renewable waste and electricity and heat trade (TJ)");
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
  ok(no.pub.industry + no.pub.transport + no.pub.households + no.pub.other === 211, "Norway: the sector rows (73, 50, 45, 43 TWh) add to 211; SSB's rounded total is 212");
  ok(near(no.pub.production + no.pub.imports - no.pub.exports, 337, 1e-9), "Norway: production + imports − exports = 337 TWh (bunkers and stock changes make 326)");
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
  ok(near(a.total - c.total, N.src.nuclear ? N.src.nuclear - N.twh.nuclear * 3.6 : 0, 1e-6), N.key + ": physical content differs from direct equivalent only by nuclear's heat");
  ok(b.renewable >= a.renewable && c.elec <= a.elec + 1e-12, N.key + ": substitution raises the renewable share; direct equivalent never raises nuclear, hydro, wind and solar's share");
  ok(near(a.fossil + a.elec + (Object.keys(a.v).filter(s => !D.nodes[s].fossil && !D.nodes[s].elec).reduce((s, k) => s + a.v[k], 0) + a.other) / a.total, 1, 1e-9), N.key + ": shares add to 100%");
});
{
  const cn = byKey("cn"), P = M.primaryAs(D, cn, "pec");
  ok(near(P.elec, (434.7 * 3.6 / 0.33 + (1285.8 + 885.9 + 584.15) * 3.6) / P.total, 1e-12) && P.elec > 0.09 && P.elec < 0.1, "China by physical content: nuclear, hydro, wind and solar " + (100 * P.elec).toFixed(1) + "% (the page's estimate)");
  ok(M.cnRatio(D, cn) > 2.4 && M.cnRatio(D, cn) < 2.9, "China: NBS's coal-equivalent figure is " + M.cnRatio(D, cn).toFixed(2) + " times the four sources' electricity");
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
  ok(by.us === "oil" && by.eu === "oil" && by.cn === "coal" && by.in === "coal" && by.br === "oil" && by.no === "hws" && by.pl === "oil", "step 2: the largest sources");
  ok(M.largestSaw(D, L).indexOf("coal for China and India") > 0, "step 2's summary lists them");
  const cq = M.convQ(D, L), a = M.primaryAs(D, no, "pec"), b = M.primaryAs(D, no, "sub");
  ok(cq.answer === "rises" && b.renewable - a.renewable > 0.15, "step 4: Norway's renewable share rises from " + M.pct(a.renewable) + " to " + M.pct(b.renewable));
  const us = byKey("us"); ok(M.importText(us).indexOf("net exporter") === 0 && near(us.importDep, -11.099192 / 96.465716, 1e-12), "US: a net exporter (net imports −11.1 quads)");
  ok(near(byKey("cn").importDep, (145253 - 13625) / 571327, 1e-12) && M.importText(byKey("eu")) === "57% of its supply imported", "import dependence: China derived, the EU published");
  ok(M.importText(byKey("no")).indexOf("6.9 times") > 0 && M.prodText(byKey("no")).indexOf("about 8 times") > 0, "Norway: net exports 6.9 times its supply; production about 8 times");
  ok(M.importText(byKey("br")) === "not on the pages read", "Brazil: no import dependence claimed");
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
  ok(f[3].what.indexOf(M.fmtN(1 / D.subEff, 1) + " at " + M.pct(D.subEff)) > 0, "fact: the substitution factor 2.5 at 40%");
}

// ---------------- scope
{
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  const strs = []; (function walk(x) { if (typeof x === "string") strs.push(x); else if (x && typeof x === "object") Object.keys(x).forEach(k => walk(x[k])); })([D, R]);
  const bad = strs.filter(s => NUC.test(s) && RISK.test(s)); ok(!bad.length, "no data string pairs a nuclear term with a risk term: " + bad.slice(0, 2).join(" | "));
  const sentences = OWN.replace(/<[^>]+>/g, " ").split(/(?<=[.;:?])\s+/); const badS = sentences.filter(s => NUC.test(s) && RISK.test(s));
  ok(!badS.length, "no page sentence pairs a nuclear term with a risk term: " + badS.slice(0, 2).join(" | "));
  const all = [M.staticFallback(D, L, E), M.ideasHTML(D, L, E), M.checkHTML(D, L, E), M.notesHTML(D), M.STEPS.join(" "), M.LENS_SAW, M.CONV_SAW, M.USEFUL_NOTE, M.BEFORE_NOTE].join(" ").split(/(?<=[.;:?])\s+/);
  ok(!all.filter(s => NUC.test(s) && RISK.test(s)).length, "no generated sentence pairs a nuclear term with a risk term");
  ok(!/\bAI\b|artificial intelligence|learning[- ](curve|rate)/i.test(RAW + JS + OWN), "no deny-listed term");
  const ALLOW = /^https:\/\/(www\.)?(eia\.gov|ec\.europa\.eu|ember-energy\.org|eta-publications\.lbl\.gov|energy\.gov|worldbank\.org|spp\.org|iea\.org|ourworldindata\.org|stats\.gov\.cn|mospi\.gov\.in|epe\.gov\.br|ssb\.no|cso\.ie|nea\.gov\.cn|aemo\.com\.au|cer\.gov\.au)\//;   // + the statistics offices and regulators named on F10 and the regional cards (W6 integration)
  const urls = (RAW + JSON.stringify(R) + OWN).match(/https?:\/\/[^\s"'<>)]+/g) || [];
  ok(urls.every(u => ALLOW.test(u)), "every link on the allow-list: " + urls.filter(u => !ALLOW.test(u)).slice(0, 3).join(" "));
  Object.keys(D.sources).forEach(k => ok(D.sources[k].url === "no link" || ALLOW.test(D.sources[k].url), "source " + k + " linked only if allow-listed"));
  Object.keys(D.sources).forEach(k => (D.sources[k].also || []).forEach(a => ok(a.label && ALLOW.test(a.url), "source " + k + ": its other file " + a.label + " is linked on the allow-list")));
  ok(["nbs-yearbook", "mospi-esi", "epe-ben", "ssb-balance"].every(k => D.sources[k].url !== "no link"), "the national statistics offices are linked (allow-listed since W6)");
  ok(M.staticFallback(D, L, E).indexOf(PL.about.line) >= 0 && /fictional\(host, N\)|PL\.about\.line/.test(JS), "the fictional line with every Prairieland drawing (fallback, steps, lens table, explain)");
}

// ---------------- text budget
M.STEPS.forEach((t, i) => { const w = t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).length; ok(w <= 40, "step " + (i + 1) + " text " + w + " words (≤ 40)"); });
[M.LENS_SAW, M.CONV_SAW, M.USEFUL_NOTE, M.BEFORE_NOTE].forEach(t => ok(t.split(/\s+/).length <= 40, "a line of ≤ 40 words: " + t.slice(0, 40)));

console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
