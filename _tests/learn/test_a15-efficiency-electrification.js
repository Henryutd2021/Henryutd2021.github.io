// test_a15-efficiency-electrification.js — Node tests for lesson A15 (assets/learn/a15-efficiency-electrification.js, its
// data file, prairie-city.json and the page, learn/a15-efficiency-electrification.qmd):
//   - Prairie City's numbers are read from prairie-city.json, never copied: the lesson's data file holds no district,
//     price, COP or day value; the deflator's 2024 and 2025 values equal the course's (prairie-city.json, e2, 13-capstone)
//   - first principles: the capital recovery factor; F3's COP curve; the seasonal COP; each measure's units and saving
//     recomputed here from the city's homes, floor area, heat and hot water; costs from the source values and BEA's
//     deflator; CSE = cost x CRF / saving; the curve's order and widths; no ties in the order at any setting
//   - electrification: with 2025's settings each district's peak over the representative days is the file's
//     peak2025MW and its year the file's annual MWh; heat pumps, envelopes, EV rules (the timer and the valley fill
//     conserve each day's charging; the fill levels the lowest hours), the heat network (a store's size from the
//     running sum; the plant flat), the city's coincident peak never above the sum of the districts' peaks
//   - every feedback and reveal true over its whole input range (rate, rebound, carrier, every slider of every
//     district, every charging rule, the network share and mode, the industry COP); every worked exercise balances
//   - the no-JS blocks, ideas, myths, practice, facts and sources equal what the model writes (--write rewrites them)
//   - scope: no nuclear term, no data-center term, no "AI"; links on the allow-list; the fictional line on every
//     interactive; text budget of the step cards, reveals and the page's prose
// Usage (from the site folder):  node _tests/learn/test_a15-efficiency-electrification.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "a15-efficiency-electrification";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const C = require(L("data/prairie-city.json"));
const E0 = require(L("data/e0.json"));
M.link(D, E0);
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
M.setLine(C.about.line);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const rel = (a, b, t) => Math.abs(a - b) <= t * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const sum = a => a.reduce((s, v) => s + v, 0);
const range = (r) => { const out = []; for (let k = 0; ; k++) { const v = Math.round((r.min + k * r.step) * 1e9) / 1e9; if (v > r.max + 1e-9) break; out.push(v); } return out; };

// ---------------- the generated blocks: write (--write) or check
const BLOCKS = { "a15-fallback": () => M.staticFallback(C, D), "a15-ideas": () => M.ideasHTML(C, D), "a15-check": () => M.checkHTML(C, D),
  "a15-practice": () => M.practiceHTML(C, D), "a15-facts": () => M.factsHTML(D), "a15-sources": () => M.sourcesHTML(C, D) };
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
const text = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ---------------- read, never retyped
ok(!/"(substationMW|peak2025MW|households|heatedFloorM2|uaMWperC|electricityCentsPerKWh|gasPerMMBtu|evProfile|anchorCOP)"/.test(RAW), "the lesson's data file copies no Prairie City field");
ok(!/\b(250|230|60) MW\b|144\.4|111\.9|48\.8|14\.44|11\.19|14\.295|212\.8|192\.4/.test(JS.replace(/\/\/[^\n]*/g, "")), "the script retypes no Prairie City number (limits, prices, peaks)");
const e2 = require(L("data/e2-plains-grid.json")), c13 = require(L("data/13-capstone.json"));
ok(D.deflator.index["2024"] === c13.deflator.index["2024"] && D.deflator.index["2025"] === c13.deflator.index["2025"] && /2024 125\.587, 2025 128\.893/.test(e2.sources["bea-nipa-119"].text), "BEA's 2024 and 2025 deflator values equal the course's");
ok(/2008 88\.013; 2016 98\.241; 2022 118\.026; 2024 125\.587; 2025 128\.893/.test(D.sources["bea-nipa-119"].where) && D.deflator.index["2008"] === 88.013 && D.deflator.index["2022"] === 118.026, "every deflator value is in the source line (2008 and 2022 as A18 has them)");
ok(E0.home.hp.high.capex === 8620 && E0.home.hp.capexYear === 2022 && D.measures.filter(m => m.key === "hp")[0].cost2022.efficient === "e0" && !/8,?620/.test(RAW.replace(/"where": "[^"]*"/g, "")), "the heat pump's cost is read from e0.json (SB0's and A18's $8,620, 2022 dollars), not copied");
const F3 = require(L("data/f03-energy-services.json"));
ok(C.cop.anchorCOP === F3.heatpump.anchorCOP && C.cop.anchorC === F3.heatpump.anchorC && C.cop.supplyC === F3.heatpump.supplyC && C.cop.cutoutC === F3.heatpump.cutoutC, "the COP curve is F3's");

// ---------------- first principles
const crf = (r, n) => r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
[0.02, 0.06, 0.1].forEach(r => [10, 15.1, 25].forEach(n => {
  ok(near(M.crf(r, n), crf(r, n), 1e-12), "CRF(" + r + ", " + n + ")");
  let pv = 0; for (let t = 1; t <= Math.floor(n); t++) pv += M.crf(r, n) / Math.pow(1 + r, t);
  if (Number.isInteger(n)) ok(near(pv, 1, 1e-9), "CRF repays 1 over " + n + " years at " + r);
}));
ok(near(M.crf(0, 20), 0.05), "CRF at 0% is 1/n");
const COP = T => T >= C.cop.cutoutC ? C.cop.anchorCOP * (C.cop.supplyC - C.cop.anchorC) / (C.cop.supplyC - T) : 1;
[-25, -23, -18, -15, 0, 10].forEach(T => ok(near(M.cop(C, T), COP(T)), "COP at " + T + " C"));
ok(near(M.cop(C, -15), 2.4) && M.cop(C, -24) === 1, "COP 2.4 at -15 C (DOE's target), 1 below the cut-out");
let q = 0, e = 0; C.days.forEach(d => d.temp.forEach(T => { const h = Math.max(0, C.heatModel.balanceC - T); q += d.weight * h; e += d.weight * h / COP(T); }));
const SCOP = q / e;
ok(near(M.scop(C), SCOP, 1e-12) && SCOP > 3 && SCOP < 4, "seasonal COP over the days " + SCOP.toFixed(3));
const P = { res: C.prices.electricityCentsPerKWh.residential * 10, com: C.prices.electricityCentsPerKWh.commercial * 10, gas: C.prices.gasPerMMBtu.residential / C.units.mwhPerMMBtu };
ok(near(M.prices(C).residential, P.res) && near(M.prices(C).commercial, P.com) && near(M.prices(C).gas, P.gas), "prices from prairie-city.json, $ per MWh");
const defl = y => 128.893 / D.deflator.index[String(y)];
const MS = {}; D.measures.forEach(m => MS[m.key] = m);
// units and savings, recomputed here
const CUT = (C.vintages.pre1980.heatKWhPerM2 - C.vintages.y1980_2009.heatKWhPerM2) / C.vintages.pre1980.heatKWhPerM2;
ok(near(M.weatherCut(C), CUT) && near(CUT, 35 / 115), "weatherization brings a pre-1980 home from 115 to 80 kWh per m2 (prairie-city.json's vintages), as A18 does");
function mine(key) {
  let units = 0, save = 0;
  C.districts.forEach(d => {
    const H = d.households, area = d.heatedFloorM2 / H, heat = d.heat.residentialMWh / H, pre = area * C.vintages.pre1980.heatKWhPerM2 / 1000;
    let hw = 0; Object.keys(d.dwellings).forEach(k => hw += d.dwellings[k] * C.dwellingTypes[k].hotWaterFactor);
    const wh = 17.4 * C.units.mwhPerMMBtu * 0.6 * hw / H;
    let n, s;
    switch (key) {
      case "led": n = d.commercialM2 * 0.4 / 10; s = (63.1 - 27.4 * 5082 / 3686) * 3541 / 1e6; break;
      case "hpwh": n = d.heating.resistance + d.heating.heatPump; s = wh * (1 / 0.92 - 1 / 3.73); break;
      case "hp": n = d.heating.resistance; s = heat * (1 - 1 / SCOP); break;
      case "weatherEl": n = d.heating.resistance * d.envelope.pre1980; s = pre * CUT; break;
      case "condensing": n = d.heating.gas; s = heat * (1 / 0.8 - 1 / 0.99); break;
      case "weatherGas": n = d.heating.gas * d.envelope.pre1980; s = pre * CUT / 0.8; break;
    }
    units += n; save += n * s;
  });
  return { units, save };
}
ok(C.homes.recsWNC.waterHeatGasMMBtu === 17.4 && C.homes.gasWaterHeaterEfficiency === 0.6 && C.homes.furnaceEfficiency === 0.8, "the city's hot water and furnace efficiency (as recomputed here)");
const COST = { led: (22.22 + 0.4 * 66) * 5082 / 3686 * defl(2022), hpwh: (1715 - 905) * defl(2022), hp: (8620 - 1480) * defl(2022), weatherEl: 4695 * defl(2008),
  condensing: (4320 - 3690) * defl(2022), weatherGas: 4695 * defl(2008) };
const LIFE = { led: 54000 / 3541, hpwh: 15.1, hp: 15.3, weatherEl: 20, condensing: 22.5, weatherGas: 20 };
const EXTRA = { led: 0, hpwh: 0, hp: (150 - 50) * defl(2022), weatherEl: 0, condensing: (130 - 120) * defl(2022) + (725 - 386) / 1000 * P.res, weatherGas: 0 };
Object.keys(COST).forEach(k => {
  const u = M.unitsAndSave(C, D, MS[k]), m = mine(k);
  ok(rel(u.units, m.units, 1e-12) && rel(u.save, m.save, 1e-12), k + ": units and MWh saved recomputed (" + Math.round(m.units) + " units)");
  ok(rel(M.unitCost(D, MS[k]), COST[k], 1e-12) && rel(M.lifeOf(MS[k]), LIFE[k], 1e-12) && near(M.extraYear(C, D, MS[k]), EXTRA[k], 1e-9), k + ": cost " + COST[k].toFixed(2) + ", life " + LIFE[k].toFixed(2) + ", yearly extra " + EXTRA[k].toFixed(2));
});
ok(Math.round(mine("hp").units) === C.city.totals.heating.resistance && Math.round(mine("hpwh").units) === C.city.totals.heating.resistance + C.city.totals.heating.heatPump, "units equal the city's homes by heating fuel");
ok(MS.hpwh.uef === 3.73 && MS.hpwh.baseUEF === 0.92 && MS.condensing.afue === 0.99 && /\$1,715/.test(D.sources["eia-rdm-2026"].where) && /\$4,695/.test(D.sources["ornl-wap-2014"].where), "the shared measures carry A18's values and sources");
const RATES = range(D.rate), REB = range(D.rebound);
ok(RATES.length === 9 && REB.length === 7 && D.rate.start === 0.06 && /6% real/.test(D.sources["lbnl-cose-2018"].where), "rates 2-10% (LBNL's 6% the default); rebound 0-30%");
let tie = false;
RATES.forEach(r => REB.forEach(rb => ["el", "gas"].forEach(cr => {
  const list = M.curve(C, D, { rate: r, rebound: rb }, cr);
  list.forEach((b, i) => {
    const m = mine(b.key), net = m.save / m.units * (MS[b.key].household ? 1 - rb : 1), cse = (COST[b.key] * crf(r, LIFE[b.key]) + EXTRA[b.key]) / net, pr = cr === "gas" ? P.gas : MS[b.key].price === "commercial" ? P.com : P.res;
    if (!(rel(b.cse, cse, 1e-10) && near(b.price, pr) && b.pays === (cse < pr) && rel(b.mwh, m.units * net, 1e-10) && (i === 0 || b.cse >= list[i - 1].cse) && near(b.x0, i ? list[i - 1].x1 : 0, 1e-6)))
      ok(false, "curve " + cr + " at " + r + "/" + rb + ": " + b.key);
    if (i && Math.abs(b.cse - list[i - 1].cse) < 1e-6) tie = true;
  });
})));
ok(!tie, "no two blocks tie in cost per MWh at any rate and rebound (the order is unique)");
ok(M.curve(C, D, { rate: 0.06, rebound: 0 }, "el").every(b => b.m.carrier === "el") && M.curve(C, D, { rate: 0.06, rebound: 0 }, "el").length === 4 && M.curve(C, D, { rate: 0.06, rebound: 0 }, "gas").length === 2, "two curves: four electricity blocks, two gas blocks");

// ---------------- electrification against the file
const dd = M.design(C);
ok(dd.key === "winter_design" && dd.design === true && C.days.filter(d => d.design).length === 1, "one design day");
C.districts.forEach((d, k) => {
  const pk = M.yearPeak(C, D, k, {}), yr = M.yearMWh(C, D, k, {}), a = d.annualMWh;
  ok(near(pk, d.peak2025MW, 0.15), d.key + ": 2025 peak over the days " + pk.toFixed(2) + " = the file's " + d.peak2025MW);
  ok(rel(yr, a.base + a.residentialHeat + a.commercialHeat + a.ev, 2e-4), d.key + ": the year's MWh = the file's base, heat and EVs (" + Math.round(yr) + ")");
  ok(d.substationMW >= d.peak2025MW, d.key + ": the 2025 peak fits its substation");
});
// heating electricity by hand at one hour; switches move shares as stated
{
  const d = C.districts[0], sh = d.heat.share, h = 7, T = dd.temp[h], Q = dd.districts.core.heat[h];
  const r = M.districtDay(C, D, 0, dd, { gas: 0.5 }), fuel = sh.gas + sh.propane;
  ok(near(r.hel[h], Q * (sh.resistance + (sh.heatPump + 0.5 * fuel) / COP(T)), 1e-9), "heating electricity at 07:00 with half the fuel heat switched");
  const env = M.districtDay(C, D, 0, dd, { env: 1 }), pre = d.heatedFloorM2 * d.envelope.pre1980 * C.vintages.pre1980.heatKWhPerM2 / 1000;
  ok(near(env.heat[h], Q * (1 - CUT * pre / (d.heat.residentialMWh + d.heat.commercialMWh)), 1e-9), "weatherization cuts the pre-1980 homes' heat to the 1980-2009 intensity");
  const allR = M.districtDay(C, D, 0, dd, { res: 1 });
  ok(near(allR.hel[h], Q * (sh.resistance + sh.heatPump) / COP(T), 1e-9), "every resistance heater to a heat pump");
  ok(M.districtDay(C, D, 0, dd, { gas: 1 }).peak > M.districtDay(C, D, 0, dd, { gas: 1, env: 1 }).peak, "the envelope lowers the electrified peak");
}
// EV rules
C.districts.forEach((d, k) => [0, 0.3, 0.6].forEach(v => ["evening", "timer", "fill"].forEach(rule => {
  const r = M.districtDay(C, D, k, dd, { ev: v, rule }), E = d.evMWhPerDay / d.evs * d.lightDutyVehicles * v;
  if (!(near(sum(r.ev), E, 1e-6) && r.ev.every(x => x >= -1e-12))) ok(false, d.key + " " + rule + " " + v + ": charging conserved");
  if (rule === "fill" && v > 0) {
    const pre = r.tot.map((t, h) => t - r.ev[h]), on = r.ev.map(x => x > 1e-9), lvl = r.tot.filter((t, h) => on[h]);
    if (!(Math.max(...lvl) - Math.min(...lvl) < 1e-6 && pre.every((p, h) => on[h] || p >= lvl[0] - 1e-6))) ok(false, d.key + " fill " + v + ": the lowest hours raised to one level");
  }
  if (rule === "timer" && !r.ev.every((x, h) => D.electrify.managedHours.indexOf(h) >= 0 ? near(x, E / 6, 1e-9) : x === 0)) ok(false, d.key + " timer: 00:00-06:00 evenly");
})));
ok(near(M.districtDay(C, D, 1, dd, {}).evDay, C.districts[1].evMWhPerDay, 1e-9), "2025's EV share gives the file's charging");
// district heat
[0, 0.3, 0.6].forEach(share => {
  const a = M.districtDay(C, D, 0, dd, { gas: 1, dh: { share, mode: "hp" } }), g1 = M.districtDay(C, D, 0, dd, { gas: 1 });
  ok(a.tot.every((v, h) => near(v, g1.tot[h], 1e-9)), "network share " + share + " served by heat pumps = every furnace replaced");
  const b = M.districtDay(C, D, 0, dd, { gas: 1, dh: { share, mode: "plant" } }), c = M.districtDay(C, D, 0, dd, { gas: 1, dh: { share, mode: "store" } });
  const sh = C.districts[0].heat.share, fuel = sh.gas + sh.propane, sent = c.heat.map(x => x * fuel * share / 0.9), cs = COP(10);
  ok(b.dhEl.every((x, h) => near(x, sent[h] / cs, 1e-9)) && c.dhEl.every(x => near(x, sum(sent) / 24 / cs, 1e-9)), "the plant at COP(10 C) = " + cs.toFixed(2) + ", flat with a store");
  let run = 0, hi = 0, lo = 0; const mean = sum(sent) / 24; sent.forEach(x => { run += x - mean; hi = Math.max(hi, run); lo = Math.min(lo, run); });
  ok(near(c.store, hi - lo, 1e-9) && (share === 0 ? c.store === 0 : c.store > 0), "store size = max - min of the running sum (" + c.store.toFixed(1) + " MWh)");
});
ok(near(M.storeM3(D, 1), 3.6e9 / (4186 * 40 * 1000), 1e-9), "store volume: 1 MWh over 40 K is " + (3.6e9 / (4186 * 40 * 1000)).toFixed(1) + " m3 of water");
// the city
[[0, 0, 0], [1, 1, 1], [0.5, 1, 0]].forEach(g => {
  const R = M.city(C, D, { core: { gas: g[0] }, suburbs: { gas: g[1], ev: 0.6, rule: "timer" }, fringe: { gas: g[2] } });
  ok(R.peak <= R.sumPeaks + 1e-9 && R.tot.every((v, h) => near(v, sum(R.parts.map(p => p.tot[h])), 1e-9)), "the city's coincident peak is the hourly sum, never above the sum of peaks");
});
// industry
{
  const I = M.industry(C, D, 2.9), b = {}; C.industry.processHeat.forEach(x => b[x.band] = x.deliveredMWh);
  ok(near(I.heatEl, b.low / 2.9 + b.medium / 0.98 + b.high / 0.98, 1e-6) && I.h2 === C.industry.fertilizer.electrolysisEquivalentMWh && near(I.share, I.total / C.annual.electricityMWh), "industry: bands over COP and 98%, plus electrolysis, against the city's electricity");
  ok(near(C.industry.fertilizer.electrolysisEquivalentMWh, C.industry.fertilizer.hydrogenT * 1000 * C.industry.fertilizer.electrolysisKWhPerKg / 1000, 1e-6), "electrolysis equivalent = t x 57.5 kWh per kg");
}

// ---------------- every feedback and reveal true over its range
RATES.forEach(r => {
  const S = { rate: r, rebound: 0 }, b = M.measure(C, D, MS.hpwh, S), Q = M.q1(C, D, S);
  const ratio = b.cse / b.price, want = ratio < 0.8 ? "cheaper" : ratio > 1.25 ? "dearer" : "same";
  ok(Q.answer === want && Object.keys(Q.feedback).every(k => Q.feedback[k].indexOf(M.usd(b.cse, 1) + " per MWh saved") >= 0), "step 1 prediction true at " + r);
  ok(M.line1(C, D, S).indexOf("**" + M.usd(b.cse, 1) + "**, " + (b.pays ? "below" : "above")) >= 0, "step 1 line true at " + r);
  const ch = M.chain1(C, D, S); ok(ch[4].v === M.usd(b.cse, 1) && ch[2].v === M.usd(b.annual, 1), "step 1 chain at " + r);
  REB.forEach(rb => {
    const S2 = { rate: r, rebound: rb }, all = M.curve(C, D, S2, "el").concat(M.curve(C, D, S2, "gas")), above = all.filter(x => !x.pays).map(x => x.short), line = M.reboundLine(C, D, S2);
    const listed = above.length ? (line.match(/above their price: ([^.]*)\./) || ["", ""])[1].split(", ") : [];
    if (!(above.length ? listed.join("|") === above.join("|") : /every block stays below its price/.test(line))) ok(false, "rebound line at " + r + "/" + rb);
    ["el", "gas"].forEach(cr => { const l = M.curve(C, D, S2, cr), sw = M.curveSaw(l, cr); if (sw.indexOf(M.paying(l).length + " of " + l.length) !== 0) ok(false, "curve reveal at " + r + "/" + rb + " " + cr); });
    const gl = M.curve(C, D, S2, "gas"), gs = M.gasSaw(gl), no = gl.filter(x => !x.pays);
    if (!(no.length ? no.every(x => gs.indexOf(x.short.toLowerCase()) >= 0) : /clears it/.test(gs))) ok(false, "gas reveal at " + r + "/" + rb);
    M.curve(C, D, S2, "el").concat(gl).forEach(x => { const t = M.blockLine(x); if (t.indexOf(x.pays ? "below its" : "above its") < 0) ok(false, "block line " + x.key); });
  });
});
const G = range(D.electrify.gas), EVR = range(D.electrify.ev);
C.districts.forEach((d, k) => G.forEach(g => [0, 0.5, 1].forEach(env => [0, 1].forEach(res => {
  const r = M.districtDay(C, D, k, dd, { gas: g, env, res }), line = M.peakLine(r, "Design day");
  if (!(line.indexOf("**" + M.fmtN(r.peak, 1) + " MW**") >= 0 && line.indexOf(r.peak > r.limit ? " over the" : " under the") >= 0 && line.indexOf(M.hm(r.hour)) >= 0)) ok(false, "peak line " + d.key + " " + g + "/" + env + "/" + res);
  const a = M.annualVsPeak(C, D, k, { gas: g, env, res }), al = M.avpLine(a);
  if (!(g === 0 && env === 0 && res === 0 ? /Nothing switched yet/.test(al) : al.indexOf(a.dy >= 0 ? "more" : "less") >= 0 && al.indexOf(a.dp >= 0 ? "higher" : "lower") >= 0)) ok(false, "year against peak " + d.key + " " + g + "/" + env + "/" + res);
}))));
EVR.forEach(v => {
  const rs = {}; ["evening", "timer", "fill"].forEach(rule => rs[rule] = M.districtDay(C, D, 1, dd, { ev: v, rule }));
  const best = ["evening", "timer", "fill"].reduce((a, b) => rs[b].peak < rs[a].peak - 1e-12 ? b : a), sw = M.evSaw(rs);
  const names = { evening: "charging as today", timer: "the midnight timer", fill: "filling the valleys" };
  if (!(sw.indexOf("**" + names[best] + "**, " + M.fmtN(rs[best].peak, 1)) >= 0)) ok(false, "EV reveal at " + v + ": best " + best);
  if (v > 0 && !(rs.timer.peak >= rs.evening.peak - 1e-9)) ok(false, "the reveal's claim that the timer lands on the cold hours holds at " + v);
  ["evening", "timer", "fill"].forEach(rule => { if (M.evLine(rs[rule], rule).indexOf(M.fmtN(rs[rule].peak, 1) + " MW") < 0) ok(false, "EV line " + rule + " " + v); });
});
ok(/The timer puts charging on the coldest hours/.test(M.evSaw({ evening: { peak: 1 }, timer: { peak: 2 }, fill: { peak: 0.5 } })), "the EV reveal names the timer's cold hours (true at every share above zero: checked above)");
[0, 0.5, 1].forEach(gc => [0, 1].forEach(gs => [0, 1].forEach(gf => {
  const R = M.city(C, D, { core: { gas: gc }, suburbs: { gas: gs }, fringe: { gas: gf } }), cl = M.cityLine(R);
  ok(cl.indexOf(M.together(R) ? "almost the sum" : "below the sum") >= 0 && (R.over.length ? R.over.every(p => cl.indexOf(p.label.toLowerCase()) >= 0) : /Every district fits/.test(cl)), "city line " + gc + "/" + gs + "/" + gf);
})));
range(D.districtHeat.share).forEach(share => {
  const f = mode => M.districtDay(C, D, 0, dd, { gas: 1, dh: { share, mode } }), a = f("hp"), b = f("plant"), c = f("store"), sw = M.dhSaw(a, b, c);
  ok(sw.indexOf("**" + M.fmtN(c.peak, 1) + " MW**") >= 0 && (a.peak - c.peak < 0.05 ? /about the same/.test(sw) : b.peak < a.peak - 0.05 ? /steady source cuts the peak/.test(sw) : /store does the cutting/.test(sw)), "heat-network reveal at share " + share);
  ok(c.peak <= a.peak + 1e-9, "the network with a store never raises the core's peak (share " + share + ")");
  ["hp", "plant", "store"].forEach(m => { const t = M.dhLine(D, f(m), m); if (t.indexOf(M.fmtN(f(m).peak, 1)) < 0) ok(false, "network line " + m + " " + share); });
});
range(D.industry.cop).forEach(v => { const I = M.industry(C, D, v), t = M.indLine(C, D, v); if (t.indexOf("**" + M.pct(I.share) + "**") < 0 || t.indexOf(M.fmtN(I.mwFlat, 1) + " MW") < 0) ok(false, "industry line at COP " + v); });
ok(D.industry.cop.min === 1.6 && D.industry.cop.max === 5.8 && /COP from 1\.6 to 5\.8/.test(D.sources["lbnl-ihp-2022"].where), "the COP slider spans LBNL's range");

// ---------------- worked exercises balance
const PR = M.practice(C, D);
ok(PR.length === 7, "seven worked exercises");
{
  const r2 = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
  const x = PR[0].check; ok(near(x.cse, x.exact, 0.02), "exercise 1: the by-hand CSE matches the model within rounding");
  [0, 1].forEach(i => {   // every 'a × b = c' and 'c ÷ d = e' with $ amounts in the answer recomputes
    const a = PR[i].a.replace(/,/g, "");
    [...a.matchAll(/\$([0-9.]+) × ([0-9.]+) = \$([0-9.]+)/g)].forEach(m => ok(near(r2(+m[1] * +m[2], 2), +m[3], 0.005), "exercise " + (i + 1) + ": " + m[0]));
  });
  ok(near(PR[2].check.cse, r2(+PR[2].a.match(/\$([0-9.]+) ÷/)[1] / 0.8, 2), 0.005), "exercise 3: ÷ (1 - 0.20)");
  ok(near(PR[3].check.cse, r2(+PR[3].a.match(/\$([0-9.]+) ×/)[1] * +PR[3].a.match(/× ([0-9.]+) =/)[1], 2), 0.005), "exercise 4: × the seasonal COP");
  const e5 = PR[4].a.match(/([0-9.]+) × \(([0-9.]+) \+ ([0-9.]+) ÷ ([0-9.]+)\) = ([0-9.]+) MW; plus ([0-9.]+) MW base and ([0-9.]+) MW of cars: ([0-9.]+) MW/);
  ok(e5 && near(r2(+e5[1] * (+e5[2] + +e5[3] / +e5[4]), 1), +e5[5], 0.05) && near(r2(+e5[5] + +e5[6] + +e5[7], 1), +e5[8], 0.051) && near(PR[4].check.model, +e5[8], 0.15), "exercise 5 balances and matches the model");
  const e6 = PR[5].a.match(/([0-9.]+) × ([0-9.]+) = ([0-9.]+) MW/); ok(e6 && near(r2(+e6[1] * +e6[2], 1), +e6[3], 0.051) && near(PR[5].check.model, +e6[3], 0.06), "exercise 6 balances");
  ok(/140,000 ÷ 2\.5 = 56,000 MWh a year; ÷ 8,760 h = 6\.4 MW/.test(PR[6].a), "exercise 7 balances");
  ok(M.practiceHTML(C, D).indexOf("about 30 minutes") >= 0, "the practice set states its time");
}
// the page's own numbers
ok(/about \$0\.049 per kWh in 2009–2015 \(2016 dollars, LBNL\)/.test(OWN) && D.lbnl.totalCSE2016 === 0.049, "Go deeper: LBNL's total cost of saved electricity");
ok(D.facts.every(f => /^https:\/\//.test(f.url) && f.asof), "every fact has a link and a date");
ok(D.coldClimate.cop === 1.75 && /a COP of at least 1\.75 at 5 F/.test(D.sources[D.coldClimate.src].where), "the cold-climate COP and its source line");

// ---------------- scope, links, the fictional line
const ALL = PAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term");
ok(!/data[- ]cent/i.test((OWN + "\n" + RAW + "\n" + JS + "\n" + SIDE).replace(/datacenter/g, "").replace(/Alternative Fuels Data Center/g, "")), "no data-center term (A15 is buildings, transport and industry; DOE's Alternative Fuels Data Center is a source's name)");
ok(!/\(via [a-z0-9_.-]+\.json/.test(PAGE), "no internal file names in the page's source lines");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html|smr-dc/.test(ALL), "no project page and no Research page");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&")).concat([...RAW.matchAll(/"url": "([^"]+)"/g)].map(m => m[1]));
const ALLOW = /^https:\/\/([a-z0-9.-]+\.)?(eia\.gov|energy\.gov|lbl\.gov|nlr\.gov|nrel\.gov|bea\.gov|doi\.org|noaa\.gov|epa\.gov|census\.gov|dot\.gov)\//;
ok(hrefs.every(h => ALLOW.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links on the allow-list (" + hrefs.filter(h => !(ALLOW.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h))).join(", ") + ")");
ok((JS.match(/fictional\((act|res)\)/g) || []).length >= 9 && /C\.about\.line/.test(JS) && /caption: C\.about\.line/.test(JS) && /note: C\.about\.line/.test(JS), "the fictional line on every interactive, read from prairie-city.json");
ok(/Prairie City is fictional; its numbers are illustrative\./.test(PAGE), "the page's data note and fallback carry the fictional line");
ok(/LX\.lessonRefHTML\(P, "SB3"\)/.test(JS), "SB3 is named through LX.lessonRefHTML");

// ---------------- text budget
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/[0-9]\.[0-9]/g, "0").split(/(?<=[.?!])\s+(?=[A-Z“$0-9])/).filter(x => /[A-Za-z]/.test(x)).length;
const ST = M.stepTexts(C, D);
ok(ST.length === 10, "ten step cards");
ST.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 3, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const S0 = { rate: 0.06, rebound: 0 }, lines = [M.line1(C, D, S0), M.reboundLine(C, D, { rate: 0.1, rebound: 0.3 }), M.reboundLine(C, D, S0), M.curveSaw(M.curve(C, D, S0, "el"), "el"), M.gasSaw(M.curve(C, D, S0, "gas")),
  M.peakLine(M.districtDay(C, D, 0, dd, { gas: 1 }), "Design day"), M.avpLine(M.annualVsPeak(C, D, 0, { gas: 1 })), M.evSaw({ evening: M.districtDay(C, D, 1, dd, { ev: 0.3 }), timer: M.districtDay(C, D, 1, dd, { ev: 0.3, rule: "timer" }), fill: M.districtDay(C, D, 1, dd, { ev: 0.3, rule: "fill" }) }),
  M.cityLine(M.city(C, D, { core: { gas: 1 }, suburbs: { gas: 1 }, fringe: { gas: 1 } })), M.dhSaw(M.districtDay(C, D, 0, dd, { gas: 1 }), M.districtDay(C, D, 0, dd, { gas: 1, dh: { share: 0.6, mode: "plant" } }), M.districtDay(C, D, 0, dd, { gas: 1, dh: { share: 0.6, mode: "store" } })),
  M.dhLine(D, M.districtDay(C, D, 0, dd, { gas: 1, dh: { share: 0.3, mode: "store" } }), "store"), M.indLine(C, D, 2.9)].concat(M.curve(C, D, S0, "el").map(M.blockLine));
lines.forEach(t => { ok(nWords(t) <= 42, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 3, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!-- a15-(fallback|sources|practice|facts):start[\s\S]*?:end -->/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 42, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- the page's controls
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("a15"/.test(JS), "live regions; the reader's settings persist in this browser");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 10, "a demo hook with an action for each of the ten steps");
["cost-of-saved-energy", "heat-pump-water-heater", "design-day", "coincident-peak", "process-heat"].forEach(t => ok(new RegExp("id: " + t + "\\b").test(SIDE), "the sidecar defines " + t));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
