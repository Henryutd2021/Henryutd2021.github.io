// test_f11-air-climate-people.js — Node tests for lesson F11 (assets/learn/f11-air-climate-people.js, its data file and
// the page, learn/f11-air-climate-people.qmd):
//   - the model from first principles: a tonne's heat and CO2 from the IPCC defaults (CO2 = carbon x 44/12), CO2 per MWh
//     of heat, leaked methane L/(1-L) x GWP, AP-42's factors in kg per tonne (lb per short ton x 0.5; the gas density; the
//     oil density), the controls, EPA's benefit per ton per short ton, the spreading toy (shares and doses), Prairie
//     City's burdens recomputed from prairie-city.json (never retyped)
//   - every reveal and feedback line is true over its whole input range (the leak slider, the fuel and controls, every
//     distance, every income on the slider, every prediction); rounded numbers agree with the unrounded ones
//   - every number stated on the page (ideas, Go deeper, myths, questions, numbers to remember) matches the model or the
//     data file; the no-JS block equals what the model writes (--write rewrites it)
//   - sources: the burden lines are called conventions; estimates are called estimates; the toy is called illustrative;
//     "Prairie City is fictional" appears with every Prairie City interactive; WHO is cited by name without a link
//   - scope: no nuclear term, no "AI", no named people or companies blamed, links on the allow-list
//   - text budget of the step cards, the reveals and the page's own prose
// Usage (from the site folder):  node _tests/learn/test_f11-air-climate-people.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "f11-air-climate-people";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const PC = require(L("data/prairie-city.json"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS block: write (--write) or check
const BLOCKS = { "f11-fallback": () => M.staticFallback(D, PC) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("no-JS block written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const text = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const T_PAGE = text(OWN);
const has = (s, msg) => ok(T_PAGE.indexOf(s) >= 0, msg + ": '" + s + "'");

// ---------------- a tonne, from first principles (IPCC 2006 Tables 1.2 and 1.4)
const IP = { coal: [25.8, 94600], gas: [48.0, 56100], oil: [43.0, 74100] };
Object.keys(IP).forEach(k => { const f = M.fuel(D, k); ok(f.ncvGJperT === IP[k][0] && f.co2KgPerTJ === IP[k][1], k + ": the IPCC default NCV and CO2 factor"); });
const T = M.tonnes(D), byK = {}; T.forEach(t => { byK[t.key] = t; });
T.forEach(t => {
  ok(near(t.co2Kg, t.gj * M.fuel(D, t.key).co2KgPerTJ / 1000) && near(t.mwh, t.gj / 3.6) && near(t.perMWh, t.co2Kg / t.mwh), t.key + ": CO2 = NCV x factor; MWh = GJ / 3.6; per MWh");
  ok(near(t.carbonKg * 44 / 12, t.co2Kg, 1e-6), t.key + ": carbon x 44/12 = CO2 (the factor's own carbon basis)");
});
ok(byK.coal.co2T.toFixed(2) === "2.44" && byK.gas.co2T.toFixed(2) === "2.69" && byK.oil.co2T.toFixed(2) === "3.19", "per tonne: coal 2.44, gas 2.69, oil 3.19 t");
ok(Math.round(byK.coal.perMWh) === 341 && Math.round(byK.gas.perMWh) === 202 && Math.round(byK.oil.perMWh) === 267, "per MWh of heat: 341, 202, 267 kg");
ok(byK.oil.co2T > byK.gas.co2T && byK.gas.co2T > byK.coal.co2T && byK.coal.perMWh > byK.oil.perMWh && byK.oil.perMWh > byK.gas.perMWh, "the order flips: per tonne oil > gas > coal; per MWh coal > oil > gas");
ok(Math.round(byK.oil.carbonKg) === 869 && Math.round(byK.gas.carbonKg) === 734 && Math.round(byK.coal.carbonKg) === 666, "carbon per tonne: oil 869, gas 734, coal 666 kg (feedback: oil holds the most)");
ok((byK.coal.perMWh / byK.gas.perMWh).toFixed(1) === "1.7", "coal about 1.7 times gas per MWh of heat");
ok(near(D.carbon.co2PerC, 44 / 12, 1e-4) && M.fmtN(D.carbon.co2PerC, 2) === "3.67", "3.67 t of CO2 per tonne of carbon");
{ const sb = D.fuelsAlso[0]; ok(Math.round(sb.ncvGJperT * sb.co2KgPerTJ / 1000) === 1816 && (sb.ncvGJperT * sb.co2KgPerTJ / 1e6).toFixed(2) === "1.82" && Math.round(sb.co2KgPerTJ * 3.6 / 1000) === 346, "sub-bituminous: 1.82 t a tonne, 346 kg per MWh of heat"); }

// ---------------- methane
ok(D.methane.gwp100 === 29.8, "GWP100 of fossil methane 29.8 (AR6 via the GHG Protocol)");
const m23 = M.methane(D, 2.3);
ok(near(m23.ch4T, 0.023 / 0.977) && near(m23.co2eT, 0.023 / 0.977 * 29.8) && M.fmtN(m23.ch4Kg, 1) === "23.5" && m23.co2eT.toFixed(2) === "0.70" && M.pct(m23.share) === "26%", "2.3%: 23.5 kg of methane, 0.70 t CO2e, 26% on top");
ok((23.5 * 29.8 / 1000).toFixed(2) === "0.70", "the chain's rounded numbers agree: 23.5 kg x 29.8 = 0.70 t");
for (let k = Math.round(D.methane.leak.min * 10); k <= Math.round(D.methane.leak.max * 10); k++) {
  const p = k / 10, m = M.methane(D, p), line = M.leakLine(D, p), ch = M.leakChain(D, p);
  const good = p === 0 ? /With no leak/.test(line) : line.indexOf(M.fmtN(m.ch4Kg, 1) + " kg of methane") >= 0 && line.indexOf("**" + M.fmtN(m.co2eT, 2) + " t**") >= 0 && line.indexOf(M.pct(m.share) + " on top") >= 0;
  if (!good) ok(false, "leak line at " + p + "%");
  if (!(ch[2].v === M.fmtN(m.ch4Kg, 1) + " kg" && ch[4].v === M.fmtN(m.co2eT, 2) + " t")) ok(false, "leak chain at " + p + "%");
  if (p > 0 && Math.abs(Number(M.fmtN(m.ch4Kg, 1).replace(/,/g, "")) * 29.8 / 1000 - m.co2eT) > 0.006) ok(false, "leak chain's rounded kg x 29.8 within rounding of the t shown at " + p + "%");
}
ok(D.methane.studies[0].pct === 2.3 && /abstract/.test(D.methane.studies[0].what) && D.methane.studies[1].lo === 0.75 && D.methane.studies[1].hi === 9.63, "leak studies: 2.3% (Alvarez, abstract); 0.75-9.63% (Sherwin, abstract)");
ok(/2\.3% of gas production in 2015 \(Alvarez et al\., 2018\), and from 0\.75% to 9\.63% across six regions \(Sherwin et al\., 2024\)/.test(M.LEAK_NOTE), "the leak range is labelled with its sources");
has("0.02 ÷ 0.98 = 0.0204 t of methane per tonne burned, × 29.8 = 0.608 t", "question: 2% leak"); ok((0.02 / 0.98).toFixed(4) === "0.0204" && (0.02 / 0.98 * 29.8).toFixed(3) === "0.608" && M.methane(D, 2).co2eT.toFixed(3) === "0.608", "2% leak arithmetic");

// ---------------- pollutants (AP-42)
const half = D.units.kgPerLb / (D.units.kgPerShortTon / 1000);
ok(near(half, 0.5, 1e-12), "lb per short ton x 0.5 = kg per tonne (AP-42 footnote)");
const cu = M.pollutants(D, "coal", false), cc = M.pollutants(D, "coal", true);
ok(near(cu.so2, 38 * 2 * 0.5) && near(cu.nox, 22 * 0.5) && near(cu.pm25, 0.6 * 10 * 0.5 + (0.1 * 2 - 0.03) * 26 * 0.5), "coal before controls: SO2 38S, NOx 22, PM2.5 0.6A + condensable (0.1S - 0.03) x 26 MMBtu, per short ton x 0.5");
ok(near(cc.so2, 38 * (1 - 0.9), 1e-12) && near(cc.nox, 11 * 0.5) && near(cc.pm25, 0.024 * 10 * 0.5 + 0.02 * 26 * 0.5), "coal with controls: 90% scrubber, low-NOx burners, ESP and AP-42's condensable factor with FGD");
ok(cu.so2 === 38 && near(cc.so2, 3.8, 1e-12) && near(cu.pm25, 5.21) && near(cc.pm25, 0.38), "coal: SO2 38 -> 3.8 kg, PM2.5 5.21 -> 0.38 kg a tonne");
const gu = M.pollutants(D, "gas", false), mmscf = 1000 / D.units.kgPerLb / 42000;
ok(near(gu.nox, 190 * mmscf * D.units.kgPerLb) && near(gu.nox, 190 * 1000 / 42000) && near(gu.so2, 0.6 * 1000 / 42000) && near(gu.pm25, 7.6 * 1000 / 42000), "gas: per million scf at 42,000 lb per million scf (so kg per tonne = factor x 1000 / 42000)");
ok(near(M.pollutants(D, "gas", true).nox, 140 * 1000 / 42000) && M.pollutants(D, "gas", true).so2 === gu.so2, "gas controls: low-NOx burners only");
const ou = M.pollutants(D, "oil", false), kgal = 1000 / 845 * 1000 / 3.785411784 / 1000;
ok(near(ou.so2, 142 * 0.2 * kgal * D.units.kgPerLb) && near(ou.nox, 24 * kgal * D.units.kgPerLb) && near(ou.pm25, 1.55 * kgal * D.units.kgPerLb), "oil: per 1,000 gal at 845 kg per cubic metre");
ok(near(M.pollutants(D, "oil", true).nox, 10 * kgal * D.units.kgPerLb) && M.pollutants(D, "oil", true).so2 === ou.so2, "oil controls: low-NOx burners with flue gas recirculation; no scrubber");
["coal", "gas", "oil"].forEach(k => ok(M.pollutants(D, k, true).co2T === M.pollutants(D, k, false).co2T, k + ": controls do not change CO2"));
[true, false].forEach(c => ["coal", "gas", "oil"].forEach(k => {
  const p = M.pollutants(D, k, c), line = M.pollLine(D, k, c);
  ok(line.indexOf(M.fmtN(p.so2, p.so2 < 1 ? 2 : 1) + " kg of SO₂") >= 0 && line.indexOf(M.fmtN(p.nox, 1) + " kg of NOx") >= 0 && line.indexOf(M.fmtN(p.pm25, 2) + " kg of fine particles") >= 0 && line.indexOf("CO₂ stays " + M.fmtN(p.co2T, 2) + " t") >= 0, "pollutant line true: " + k + (c ? " with" : " before") + " controls");
}));
ok(M.pollSaw(D) === "For coal, controls cut SO₂ from 38 to 3.8 kg a tonne and fine particles from 5.2 to 0.4 kg, but leave its **2.44 t** of CO₂ untouched.", "step 4 reveal");

// ---------------- health (EPA benefit per ton, 2025, 2019 $)
ok(D.bpt.egu.pm25 === 113000 && D.bpt.egu.so2 === 57000 && D.bpt.egu.nox === 7710 && D.bpt.woodstovePm25 === 479000 && D.bpt.dollarYear === 2019 && D.bpt.discount === 2, "EPA BPT Table 8: EGU 113,000 / 57,000 / 7,710; wood stoves 479,000; 2019 $, 2%");
const hu = M.health(D, cu), hc = M.health(D, cc);
ok(near(hu.total, 38 / 907.18474 * 57000 + 11 / 907.18474 * 7710 + 5.21 / 907.18474 * 113000) && Math.round(hu.total / 10) * 10 === 3130 && Math.round(hc.total / 10) * 10 === 330, "coal: about $3,130 before controls, about $330 with (kg / 907.18 x $ per short ton)");
[true, false].forEach(c => ["coal", "gas", "oil"].forEach(k => {
  const h = M.health(D, M.pollutants(D, k, c)), line = M.healthLine(D, k, c);
  ok(line.indexOf("**$" + M.fmtN(Math.round(h.total / 10) * 10) + "**") >= 0 && /an estimate/.test(line) && (c ? / with controls/ : / before controls/).test(line), "health line true: " + k + (c ? " with" : " before"));
  ok(h.parts.so2 <= 2500 && h.parts.nox <= 2500 && h.parts.pm25 <= 2500, "health bars fit the 2,500 scale: " + k);
}));
ok(Math.round(38 / 907.18474 * 57000) === 2388, "question: 38 kg of SO2 = $2,388"); has("38 ÷ 907.18 × 57,000 = $2,388", "question: dollars");
ok(/\$479,000 from home wood stoves, against \$113,000 from power plants/.test(M.woodLine(D)), "the wood stove comparison reads the data");
ok(/estimates?/.test(M.healthSaw(D) + M.healthLine(D, "coal", false)) && /Estimates, not prices/.test(JS), "health dollars are labelled estimates");
ok(M.healthSaw(D) === "For a tonne of coal, controls cut EPA's estimate of the harm from about $3,130 to about $330. WHO counts 4.2 million early deaths from outdoor air pollution in 2019.", "step 6 reveal");
ok(D.who.deathsM === 4.2 && D.who.deathsYear === 2019 && D.who.lmicPct === 89 && D.who.popPct === 99, "WHO 2024 fact sheet numbers");

// ---------------- the spreading toy
const SP = D.spread;
ok(SP.r0km === 10 && SP.reachKm === 300 && /illustrative/.test(SP.set), "toy: r0 10 km, illustrative reach 300 km");
SP.stops.forEach(r => {
  ok(near(M.perPerson(D, r), SP.r0km / r * Math.exp(-(r - SP.r0km) / SP.reachKm)) && near(M.within(D, r), 1 - Math.exp(-(r - SP.r0km) / SP.reachKm)), "toy formulas at " + r + " km");
  const line = M.spreadLine(D, r);
  ok(line.indexOf("**" + M.pct(M.within(D, r)) + "**") >= 0 && (r === SP.r0km ? /reference dose/.test(line) : line.indexOf(M.pct(M.perPerson(D, r), M.perPerson(D, r) < 0.01 ? 2 : 1) + " of the dose") >= 0), "spread line true at " + r + " km");
});
// the share within R equals the integral of people x dose: numerically, over evenly spread people
{ let num = 0, den = 0; const dr = 0.05; for (let r = SP.r0km + dr / 2; r < 20000; r += dr) { const w = 2 * Math.PI * r * M.perPerson(D, r) * dr; den += w; if (r <= 100) num += w; } ok(Math.abs(num / den - M.within(D, 100)) < 1e-3, "share within 100 km = integral of 2 pi r c(r) (people spread evenly)"); }
ok(M.pct(1 - M.within(D, 100)) === "74%" && M.pct(M.perPerson(D, 100), 1) === "7.4%" && M.pct(M.within(D, 300)) === "62%" && M.pct(M.perPerson(D, 300), 1) === "1.3%", "toy: 74% beyond 100 km; 7.4% dose at 100 km; 62% within 300 km");
for (let i = 1; i < SP.stops.length; i++) ok(M.perPerson(D, SP.stops[i]) < M.perPerson(D, SP.stops[i - 1]) && M.within(D, SP.stops[i]) > M.within(D, SP.stops[i - 1]), "dose falls and the share closer rises with distance (" + SP.stops[i] + " km)");
has("$c$ = 7.4% of the dose at 10 km, and 74% of all the breathing happens farther out", "Go deeper: the toy at 100 km");
ok(/A spreading toy, not an air-quality model/.test(JS) && /illustrative/.test(M.staticFallback(D, PC)), "the toy is labelled a toy and illustrative");

// ---------------- Prairie City's groups (read from prairie-city.json, never retyped)
const G = M.groups(PC);
ok(G.length === 5 && G.every((g, i) => g.key === PC.groups[i].key && g.spend === PC.groups[i].homeEnergy && g.income === PC.groups[i].income), "groups read from prairie-city.json");
G.forEach(g => ok(near(g.burden, g.spend / g.income) && Math.abs(g.burden - g.data) < 5e-5, g.key + ": burden = home energy / income, as the shared data says (" + M.pct(g.burden, 1) + ")"));
ok(!/(?<![\d,$])(1,?940|2,?702|13,?000|145,?000|16,?225|101,?410)(?![\d,])/.test(JS + RAW), "no Prairie City number is retyped in the script or the data file");
const A6 = M.above(G, 0.06);
ok(A6.groups === 2 && A6.households === PC.groups[0].households + PC.groups[1].households && A6.total === PC.city.households && M.pct(A6.share) === "29%", "two groups above 6%: 29,409 of 101,410 households (29%)");
ok(M.HOWMANY.answer === String(A6.groups) && M.HOWMANY.options.every(o => M.HOWMANY.feedback[o.value]), "step 8: the answer is the count; feedback for every choice");
ok(/the poorest group pays about 15%, the next about 6\.5%/.test(M.HOWMANY.feedback["1"]) && M.pct(G[0].burden) === "15%" && M.pct(G[1].burden, 1) === "6.5%", "step 8 feedback numbers");
ok(/the 50-80% group averages just over 4%/.test(M.HOWMANY.feedback["3"]) && G[2].burden > 0.04 && G[2].burden < 0.045, "step 8 feedback: 50-80% just over 4%");
ok(G[0].burden > G[1].burden && PC.groups[0].use.electricityKWh < PC.groups[4].use.electricityKWh, "feedback: the lowest-income groups use less energy than richer homes");
const IN = D.burden.income;
for (let inc = IN.min; inc <= IN.max; inc += IN.step) {
  const r = M.burdenAt(G, inc), v = M.verdict(D, r.burden), line = M.burdenLine(D, G, inc), shown = M.pct(r.burden, 1);
  const g = G.find(x => inc >= x.lo && (x.hi == null || inc < x.hi));
  if (r.group !== g) ok(false, "income " + inc + " falls in " + g.key);
  if (line.indexOf("**" + shown + "**") < 0 || line.indexOf("home energy $" + M.fmtN(r.spend)) < 0) ok(false, "burden line numbers at $" + inc);
  // the verdict agrees with the unrounded burden and with the number shown
  const sv = parseFloat(shown) / 100;
  if ((v === "severe") !== (r.burden > 0.10) || (v === "high") !== (r.burden > 0.06 && r.burden <= 0.10) || (v === "below") !== (r.burden < 0.06)) ok(false, "verdict at $" + inc);
  if ((v === "severe" && !(sv > 0.10)) || (v === "high" && !(sv > 0.06)) || (v === "below" && !(sv < 0.06))) ok(false, "the rounded burden shown agrees with the verdict at $" + inc + " (" + shown + ")");
}
ok(M.burdenLine(D, G, 33000) === "Income $33,000 a year, home energy $2,131: a burden of **6.5%**, above the 6% line ACEEE calls high.", "step 7 at the default income");
ok(/conventions/.test(M.LINES_NOTE) && /LEAD tool calls 6% or more high/.test(M.LINES_NOTE) && /ACEEE/.test(M.LINES_NOTE), "the 6% and 10% lines are called conventions, with ACEEE and LEAD");
ok(D.burden.high === 0.06 && D.burden.severe === 0.10, "lines at 6% and 10%");
ok(M.groupsSaw(D, G) === "**29,409** of Prairie City's 101,410 households (29%) are in groups whose average burden is above 6%. Group averages can hide households above the line in the other groups.", "step 8 reveal");
// "Prairie City is fictional" with every Prairie City interactive (steps 7 and 8, the fallback, the data note)
ok(M.FICTION === PC.about.line && (JS.match(/FICTION/g) || []).length >= 4 && M.staticFallback(D, PC).indexOf(PC.about.line) >= 0 && PAGE.indexOf("<b>" + PC.about.line + "</b>") >= 0, "the fictional line, word for word, on the steps, the fallback and the data note");

// ---------------- numbers on the page
has("a tonne of oil makes 3.19 t, gas 2.69 t and coal 2.44 t", "ideas: per tonne");
has("Per MWh of heat coal sends 341 kg of CO₂ and gas 202 kg", "ideas: per MWh");
has("A 2.3% leak adds about 0.70 t of CO₂e to a tonne of gas over 100 years", "ideas: leak");
has("Controls cut coal's SO₂ from 38 to 3.8 kg a tonne", "ideas: controls");
has("Prairie City's lowest-income group spends less than the highest, yet carries 14.9% against 1.9%", "ideas: burden");
ok(M.pct(G[0].burden, 1) === "14.9%" && M.pct(G[4].burden, 1) === "1.9%", "14.9% and 1.9%");
has("Sub-bituminous coal holds only 18.9 GJ a tonne: 1.82 t of CO₂ a tonne, yet 346 kg per MWh of heat, close to bituminous coal's 341 kg", "Go deeper: sub-bituminous");
has("A tonne of oil makes 3.19 t and gas 2.69 t against coal's 2.44 t; per MWh of heat, coal's 341 kg is the most", "myth: coal");
has("They cut SO₂ from 38 to 3.8 kg and fine particles from 5.2 to 0.4 kg a tonne, but the 2.44 t of CO₂ is unchanged", "myth: scrubber");
has("in the spreading toy 74% of all the breathing happens beyond 100 km", "myth: near");
has("Prairie City's lowest-income group spends $1,940 a year, less than the highest group's $2,702, yet its burden is 14.9% against 1.9%", "myth: bill");
ok(PC.groups[0].homeEnergy === 1940 && PC.groups[4].homeEnergy === 2702, "myth: $1,940 and $2,702 are the shared data's");
has("7.0%: 2,100 ÷ 30,000 = 0.070", "question: burden"); ok((2100 / 30000).toFixed(3) === "0.070", "question: burden arithmetic");
has("2 × 44 ÷ 12 = 7.33", "question: carbon"); ok((2 * 44 / 12).toFixed(2) === "7.33", "question: carbon arithmetic");
// numbers to remember: each row matches the data file and carries its source
D.facts.forEach(fc => {
  const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
});
ok(D.facts[0].n === [byK.coal, byK.gas, byK.oil].map(t => t.co2T.toFixed(2)).join(" · ") + " t", "the first fact is the model's three tonnes");
ok(D.facts[1].n === String(D.methane.gwp100) && D.facts[2].n === D.methane.studies[0].pct + "%" && D.facts[3].n === "$" + M.fmtN(D.bpt.egu.so2) && D.facts[4].n === D.who.deathsM + " million", "facts read the data's values");
// WHO by name and date, without a link; links on the allow-list
ok(/World Health Organization, fact sheet “Ambient \(outdoor\) air pollution” · 24 Oct 2024/.test(PAGE) && !/who\.int/.test(PAGE + RAW + JS), "WHO cited by name and date, no link");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
const okHref = h => /^https:\/\/(www\.ipcc\.ch|ghgprotocol\.org|doi\.org|www\.epa\.gov|www\.energy\.gov)\//.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h);
ok(hrefs.every(okHref), "links: IPCC, GHG Protocol, doi.org, EPA, DOE and learn pages only (" + hrefs.filter(h => !okHref(h)).join(", ") + ")");
["coal", "oil", "gas", "appA"].forEach(k => ok(OWN.indexOf(D.pollutants.source.urls[k]) >= 0, "AP-42 " + k + " linked in the sources"));
ok(OWN.indexOf(D.bpt.url) >= 0 && OWN.indexOf(D.ipcc2006.url) >= 0 && OWN.indexOf(D.methane.gwpSource.url) >= 0 && OWN.indexOf(D.burden.aceee.url) >= 0 && OWN.indexOf(D.burden.lead.url) >= 0, "every data-file source is in the sources list");
ok(/\(abstract\)/.test(OWN.match(/Alvarez, R\. A\.[^<]*<a[^>]*>[^<]*<\/a>[^<]*/)[0]) && /\(abstract\)/.test(OWN.match(/Sherwin, E\. D\.[^<]*<a[^>]*>[^<]*<\/a>[^<]*/)[0]), "the two leak studies say 'abstract' in their source lines");

// ---------------- predictions and reveals true for every choice
ok(M.MOST.answer === "oil" && byK.oil.co2T === Math.max(...T.map(t => t.co2T)) && ["coal", "gas", "oil"].every(k => M.MOST.feedback[k]), "step 1: oil is the answer; feedback for every fuel");
ok(/a quarter of whose mass is hydrogen/.test(M.MOST.feedback.gas) && near(4 * 1.008 / (12.011 + 4 * 1.008), 0.25, 0.01), "step 1: methane is about a quarter hydrogen by mass");
ok(M.mostSaw(D) === "Per tonne: oil **3.19 t**, gas **2.69 t**, coal **2.44 t** of CO₂. Each tonne of carbon burned makes 3.67 t of CO₂.", "step 1 reveal");
ok(M.heatSaw(D) === "Per MWh of heat, coal sends **341 kg** of CO₂, oil 267 kg and gas 202 kg: coal about 1.7 times gas.", "step 2 reveal");

// ---------------- scope
const ALL = PAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term on the page, in the data, the script or the sidecar");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html/.test(PAGE + JS), "no project page and no Research page");
ok(/not a ranking of blame/.test(JS) && !/\b(Exxon|Chevron|Shell|BP|Duke|Evergy|Peabody)\b/.test(ALL), "no named companies; roles are not blame");
{ const dl = OWN.match(/<div class="lx-datanote[\s\S]*?<\/div>/); ok(dl && /Illustrative\./.test(dl[0]) && /Real values\./.test(dl[0]), "the data note says what is illustrative and what is real"); }
ok(!/Go deeper · Modeler/.test(PAGE) && (PAGE.match(/Go deeper · Analyst/g) || []).length === 3, "a Foundations lesson's deeper boxes are Analyst tier");
ok(/a13-fairness-jobs\.html/.test(OWN), "the leaves-out list links A13 (same branch)");

// ---------------- text budget
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/et al\./g, "et al").replace(/(\d)\.(\d)/g, "$1,$2").split(/(?<=[.?!])\s+(?=[A-Z“$0-9])/).filter(x => /[A-Za-z]/.test(x)).length;
const stepTexts = [...JS.matchAll(/\{ text: "((?:[^"\\]|\\.)*)",\n\s*build/g)].map(m => m[1].replace(/\\"/g, '"'));
ok(stepTexts.length === 8, "eight step cards (" + stepTexts.length + ")");
stepTexts.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 37, "step " + (i + 1) + ": " + n + " words (about 35)"); ok(nSent(t) <= 3, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.mostSaw(D), M.heatSaw(D), M.LEAK_NOTE, M.pollSaw(D), M.spreadSaw(D), M.woodLine(D), M.healthSaw(D), M.BURDEN_NOTE + " " + M.FICTION, M.LINES_NOTE, M.groupsSaw(D, G)]
  .concat([0, 0.5, 2.3, 4].map(p => M.leakLine(D, p)), ["coal", "gas", "oil"].map(k => M.pollLine(D, k, false)), ["coal", "gas", "oil"].map(k => M.healthLine(D, k, true)), SP.stops.map(r => M.spreadLine(D, r)), [5000, 20000, 33000, 150000].map(i => M.burdenLine(D, G, i)));
lines.forEach(t => { ok(nWords(t) <= 36, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
[[M.MOST, "MOST"], [M.HOWMANY, "HOWMANY"]].forEach(([P, k]) => Object.keys(P.feedback).forEach(v => {
  const t = (v === P.answer ? "You called it. " : "Not quite. ") + P.feedback[v];
  ok(nWords(t) <= 35 && nSent(t) <= 2, k + " feedback as shown for '" + v + "': " + nWords(t) + " words, " + nSent(t) + " sentences");
}));
const PROSE = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ").replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^\|(.*)\|$/gm, "<td>$1</td>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 45, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- the page's controls
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("f11"/.test(JS), "live regions; the reader's settings persist in this browser");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && /"mid"/.test(JS) && (JS.match(/demo\[\d\] = function/g) || []).length === 8, "a demo hook: mid and an action for each of the eight steps");
["global-warming-potential", "methane-leak", "emission-factor", "fine-particles", "scrubber", "benefit-per-ton", "net-calorific-value"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE), "the sidecar defines " + id));
ok(!/id: (energy-burden|transfer|job-year)\b/.test(SIDE), "no term already in the glossary is redefined");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
