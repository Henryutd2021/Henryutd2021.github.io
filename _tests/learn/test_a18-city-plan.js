// test_a18-city-plan.js — Node tests for A18 (assets/learn/a18-city-plan.js, its data file and page).
//   - sources and units: the deflator (BEA, 2025 = prairie-city.json's), the costs read from e0.json, every measure's
//     source key and teaching label; nothing of Prairie City retyped (the page's numbers are recomputed here)
//   - physics and arithmetic from first principles: the COP curve and the seasonal COP, the capital recovery factor, each
//     bar's tonnes and cost per tonne recomputed by hand for two measures, the 2025 district peaks reproduced exactly
//   - the inventory: scope 1 from fuels in their own units, scope 2 = grid-supplied electricity x eGRID's rate (within
//     1 t; rooftop solar used on site comes off homes' and businesses' electricity, as prairie-city.json does), scope 3 =
//     losses; every row and the totals add up; the page calls them CO2-only teaching subtotals, never BASIC or BASIC+
//   - the baseline: A18's no-plan homes reproduce prairie-city.json's residential gas and heating electricity by district
//     (same heat per home within a district, as its builder derives them); the target counts the grid's own change
//   - the programme: rebates are 40% of positive extra up-front costs only, charges never below zero (heat pumps with the
//     air conditioner due: no rebate, no charge, no double minus sign)
//   - interactions: furnaces and heat pumps compete (both = heat pumps alone), the joint plan is below the sum of the bars,
//     the bars in order add exactly to the joint plan (telescoping)
//   - ties: the order of the bars is unique for every setting (36 combinations), the tie rule tested on a constructed tie;
//     every bar avoids CO2 for every setting
//   - feedback lines true for every input: all 64 plans x 36 settings (and targets, budgets, participation), each line
//     45 words and three sentences at most, and its verdict equal to the model's (reaches, fits, over); explain-layer
//     texts (the plan trace, the who-decides rows, the boundary, the fallback) and data notes one or two sentences
//   - every number on the page (fallback, Go deeper, myths, quiz, facts) against the model; scope, links, text, glossary
//   - the page on a stub document: every step, the shortcut continues from the reader's plan
// Usage (from the site folder):  node _tests/learn/test_a18-city-plan.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "a18-city-plan";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const A = J(ID + ".json"), PC = J("prairie-city.json"), E0 = J("e0.json"), PATH = J("path.json");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const PAGE = fs.readFileSync(path.join(SITE, "learn", ID + ".qmd"), "utf8"), SIDE = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const PAGE0 = PAGE.replace(/ data-label="[^"]*"/g, "");
const onPage = (s, what) => ok(PAGE0.includes(s), `page states ${what}: "${s}"`);
const fm = M.fm, W = M.prepare(A, PC, E0), IDS = M.IDS;
const DEF = { plan: {}, target: A.target.def, budget: A.budget.def, grid: "egrid", gas: "y2025", solar: "y2020", ac: false };
const o0 = M.settings(W, DEF);
const words = s => String(s).replace(/\*\*/g, "").trim().split(/\s+/).length;
const sentences = t => String(t).replace(/\*\*/g, "").split(/(?<=[.?!])\s+(?=[A-Z0-9“"])/).filter(x => /[A-Za-z]/.test(x)).length;

// ---------------- sources and units
ok(A.deflator.index["2025"] === PC.city.anchors.gdpDeflator["2025"] && A.deflator.index["2025"] === 128.893, "deflator: 2025 = 128.893, the value prairie-city.json and lesson 13 use");
ok(near(W.defl(2022), 128.893 / 118.026) && W.defl(2022).toFixed(3) === "1.092", "a 2022 dollar is 1.092 2025 dollars");
ok(W.r === 0.04 && E0.finance.rate === 4, "the 4% real rate is read from e0.json (lessons 7, 13, SB0)");
ok(E0.home.hp.high.capex === 8620 && E0.home.hp.capexYear === 2022 && E0.home.pv.capex === 4336 && E0.home.pv.life === 25 && E0.home.pv.fom === 20, "the heat pump's and rooftop solar's costs are e0.json's (EIA AEO2026)");
ok(!/8620|4336/.test(JSON.stringify(A).replace(/\$8,620|\$4,336/g, "")), "A18's data file does not retype e0.json's costs as numbers");
A.measures.forEach(m => ok(m.src.length > 0 && m.note.length > 40 && m.whoText && m.bar && m.color && /var\(--lx-/.test(m.color), "measure " + m.id + ": sources, note, who decides, colour token"));
["weather", "comm", "solar"].forEach(id => ok(/Set for teaching/.test(W.M[id].note), id + ": what is set for teaching says so"));
ok(/ORNL\/TM-2014\/338/.test(W.M.weather.note) && W.M.weather.costPerHome === 4695 && W.M.weather.costYear === 2008, "weatherization: ORNL's $4,695 (PY2008)");
ok(W.M.comm.cse === 0.045 && W.M.comm.cseYear === 2012 && W.M.comm.cseRate === 0.06, "shops and offices: LBNL's $0.045 per kWh, 2012 dollars, 6% real");
ok(W.M.furnace.life === 22.5 && W.M.hp.life === 15.3 && W.M.hpwh.life === 15.1, "average lives from EIA's equipment report (22.5, 15.3, 15.1 years)");
ok(W.M.hpwh.baseCost === 905 && W.M.hpwh.newCost === 1715 && W.M.furnace.baseCost === 3690 && W.M.furnace.newCost === 4320 && W.M.hp.acCost === 5250, "EIA AEO2026 RDM Table 2 costs");
ok(PC.about.line === "Prairie City is fictional; its numbers are illustrative.", "the fictional line, from prairie-city.json");
ok(/PC\.about\.line/.test(JS) && PAGE.includes("<b>" + PC.about.line + "</b>"), "the interactive and the data note carry the fictional line");

// ---------------- physics and arithmetic from first principles
ok(near(W.COP(-15), 2.4) && near(W.COP(0), 144 / 45) && W.COP(-25) === 1, "COP curve: 2.4 at -15 C, 144/45 at 0 C, 1 below the cut-out (F3's curve)");
{ let q = 0, e = 0; PC.days.forEach(d => d.temp.forEach(T => { const x = d.weight * Math.max(0, 18.3 - T); q += x; e += x / W.COP(T); }));
  ok(near(W.scop, q / e, 1e-12) && W.scop > 3 && W.scop < 3.6, "seasonal COP = heat over electricity on the eight days: " + W.scop.toFixed(3)); }
ok(near(M.crf(0.04, 15), 0.04 / (1 - Math.pow(1.04, -15)), 1e-15) && near(M.crf(0, 10), 0.1), "capital recovery factor");
ok(near(W.grid23, 861.999 * 0.45359237 / 1000, 1e-12) && W.grid23.toFixed(3) === "0.391", "grid factor: eGRID2023 SPP North, 0.391 t per MWh");
// the 2025 peaks reproduced exactly (prairie-city.json's peak2025MW, rounded to 0.1 MW)
const P0 = M.peaks(W, null);
P0.forEach((x, i) => ok(Math.round(x.mw * 10) / 10 === PC.districts[i].peak2025MW && x.day === "winter_design" && x.h === 7, "2025 peak of " + x.key + " reproduced: " + x.mw.toFixed(2)));
// the water-heater bar by hand
{ let homes = 0, mwh = 0; PC.districts.forEach(d => { let hw = 0; Object.keys(d.dwellings).forEach(k => { hw += d.dwellings[k] * PC.dwellingTypes[k].hotWaterFactor; });
    const n = (d.heating.resistance + d.heating.heatPump) * 10 / 15.1, del = 17.4 * 0.293083 * 0.6 * hw / d.households; homes += n; mwh += n * del * (1 / 0.92 - 1 / 3.73); });
  const up = homes * 810 * 128.893 / 118.026, ann = up * M.crf(0.04, 15.1), bill = mwh * 144.4, t = mwh * W.grid23 * 1.05, R = M.evaluate(W, ["hpwh"], o0);
  ok(near(R.units.hpwh, homes, 1e-6) && near(R.up.hpwh, up, 1e-3) && near(-R.elRes, mwh, 1e-6) && near(R.t, t, 1e-6) && near(R.per, (ann - bill) / t, 1e-6), "water heaters by hand: homes, up front, MWh, tonnes, cost per tonne");
  onPage(`By 2035, ${Math.round(homes).toLocaleString("en-US")} homes heated with electricity replace theirs: ${fm.musd(up)} up front.`, "Go deeper: homes and up front");
  onPage(`$${(810 * 128.893 / 118.026).toFixed(2)} in 2025 dollars`, "Go deeper: the cost in 2025 dollars");
  onPage(`That capital × CRF (4%, 15.1 years) = ${fm.usd(ann)}. The homes save ${fm.t(mwh).replace(" t", "")} MWh, ${fm.usd(bill)} at 14.44¢ per kWh, and avoid ${fm.t(mwh).replace(" t", "")} × 0.391 × 1.05 = ${fm.t(t)}.`, "Go deeper: a year");
  onPage(`(${Math.round(ann).toLocaleString("en-US")} − ${Math.round(bill).toLocaleString("en-US")}) ÷ ${Math.round(t).toLocaleString("en-US")} = ${fm.per(R.per)}`, "Go deeper: the bar"); }
// the heat-pump bar by hand (furnace only; air conditioner due)
for (const ac of [false, true]) {
  let g = 0, gas = 0, el = 0; PC.districts.forEach(d => { const q = d.heat.residentialMWh / d.households, n = d.heating.gas * 10 / 22.5; g += n; gas += n * q / 0.8 / 0.293083; el += n * q / W.scop - n * 0.386; });
  const k = 128.893 / 118.026, ann = g * k * (8620 * M.crf(0.04, 15.3) - 3690 * M.crf(0.04, 22.5) - (ac ? 5250 * M.crf(0.04, 15.3) : 0)), keep = g * k * (150 - 120 - (ac ? 150 : 0));
  const bill = el * 144.4 - gas * PC.prices.gasPerMMBtu.residential, t = gas * 0.05291 - el * W.grid23 * 1.05, R = M.evaluate(W, ["hp"], Object.assign({}, o0, { ac }));
  ok(near(R.t, t, 1e-6) && near(R.net, ann + keep + bill, 1e-3), "heat pumps by hand" + (ac ? ", air conditioner due" : "") + ": tonnes " + Math.round(t) + ", cost per tonne " + Math.round(R.per));
}
// the no-plan homes are prairie-city.json's homes: same heat per home within a district, as its builder derives the gas,
// propane and heating electricity (district heat.share mixes homes with businesses, 80% of whose heat is gas)
{ const mm = PC.units.mwhPerMMBtu, R0 = M.evaluate(W, [], o0);
  W.D.forEach((d, i) => { const src = PC.districts[i], H = src.households; let hw = 0; Object.keys(src.dwellings).forEach(k => { hw += src.dwellings[k] * PC.dwellingTypes[k].hotWaterFactor; });
    const wh = mm * PC.homes.recsWNC.waterHeatGasMMBtu * PC.homes.gasWaterHeaterEfficiency * hw / H, other = mm * PC.homes.recsWNC.otherGasMMBtu;
    const gas = d.gasHomes * (d.q / 0.8 + wh / 0.6 + other) / mm;
    ok(near(gas, src.gasMMBtu.residential, 3), d.key + ": A18's homes reproduce the district's residential gas: " + Math.round(gas) + " MMBtu");
    ok(near(d.resHomes * d.q + d.hpHomes * d.q / W.scop, src.annualMWh.residentialHeat, 2), d.key + ": and its heating electricity: " + Math.round(d.resHomes * d.q + d.hpHomes * d.q / W.scop) + " MWh");
    const mix = (src.heat.residentialMWh * d.gasHomes / H + src.heat.commercialMWh * PC.commercial.heating.gas) / (src.heat.residentialMWh + src.heat.commercialMWh);
    ok(near(mix, src.heat.share.gas, 1e-6), d.key + ": heat.share.gas mixes homes and businesses (" + mix.toFixed(6) + "), so A18 does not use it for homes"); });
  ok(near(R0.t, 0, 1e-6) && R0.gridCut === 0 && near(R0.total, 0, 1e-6), "no plan at 2023's rate: no cut"); }

// ---------------- the inventory by scope
const I = M.inventory(W), F = M.fuelsOf(PC), EL = M.elOf(PC), GE = M.gridElOf(PC);
ok(I.tot.total === W.I.tot.total && W.gridT === I.tot.s2 + I.tot.s3, "prepare keeps the inventory and the grid's rows (scope 2 and losses)");
I.rows.forEach(r => {
  ok(r.s1 + r.s2 + r.s3 === r.total && r.total === PC.inventory2025.sectors[r.key], r.key + ": scopes add to the inventory");
  if (r.key !== "grid_losses") ok(Math.abs(r.s2 - GE[r.key] * W.grid23) <= 2 && r.s1 === Math.round(F[r.key]), r.key + ": scope 1 from fuels, scope 2 = grid-supplied electricity x 0.391 within 2 t (the inventory's, scope 1's and the balance's roundings)");
});
{ const B0 = PC.balance.sectors, roof = k => PC.supply.rooftopMWh * B0[k].el / (B0.homes.el + B0.commercial.el);
  ok(["homes", "commercial"].every(k => near(EL[k] - GE[k], roof(k), 1e-6)) && Object.keys(EL).filter(k => k !== "homes" && k !== "commercial").every(k => GE[k] === EL[k]), "grid-supplied electricity: rooftop solar used on site comes off homes and businesses only, by their use");
  ok(near(Object.keys(EL).reduce((s, k) => s + EL[k] - GE[k], 0), PC.supply.rooftopMWh, 1e-6), "the rooftop deductions add up to the rooftop MWh: " + PC.supply.rooftopMWh); }
ok(I.rows.find(r => r.key === "datacenter").s1 === 0 && I.rows.find(r => r.key === "grid_losses").s3 === PC.inventory2025.sectors.grid_losses, "the campus has no scope 1 (a load only); losses are scope 3");
ok(I.tot.s1 + I.tot.s2 + I.tot.s3 === PC.inventory2025.total && I.s12 === I.tot.s1 + I.tot.s2, "totals add up; the scopes 1 and 2 subtotal");
onPage(`The inventory: ${fm.t(I.tot.total)} of CO₂ in 2025; scope 1 (burned in the city) ${fm.t(I.tot.s1)}, scope 2 (grid electricity, not rooftop solar used on site) ${fm.t(I.tot.s2)}, scope 3 (losses on the wires) ${fm.t(I.tot.s3)}.`, "fallback: inventory");
onPage(`Scopes 1 and 2: ${fm.t(I.s12)}. With the losses (scope 3): ${fm.t(I.tot.total)}, the inventory the targets use.`, "Go deeper: the subtotals");
onPage("teaching subtotals, not GPC reporting totals", "Go deeper: the subtotals are not BASIC or BASIC+");
ok(!/\d t in BASIC|BASIC is|BASIC\+ \d/.test(PAGE + JS) && !/BASIC/.test(M.lineInventory(I)), "no total is labelled BASIC or BASIC+");
onPage("Prairie City's scope 2 leaves it out", "Go deeper: scope 2 is grid-supplied electricity, net of rooftop solar used on site");
onPage(`Prairie City's ${fm.t(I.tot.s2)} of scope 2`, "myth 1: scope 2");
{ const sh = PC.inventory2025.sectors.transport / PC.inventory2025.total; ok(PAGE.includes(`Transport, ${Math.round(sh * 100)}% of the inventory`), "leaves out: transport's share of the inventory, " + (sh * 100).toFixed(1) + "%"); }
ok(A.scopeSort.cards.length === 8 && A.scopeSort.cards.every(c => ["s1", "s2", "s3"].indexOf(c.bin) >= 0 && words(c.why) <= 30), "scope sort: eight cards with short reasons");
ok(A.barrierSort.cards.length === 8 && A.barrierSort.cards.every(c => ["in", "out"].indexOf(c.bin) >= 0 && words(c.why) <= 30), "barrier sort: eight cards with short reasons");

// ---------------- the curve at the default settings, interactions and order
const B = M.bars(W, o0), all = M.evaluate(W, IDS, o0), alone = B.reduce((s, b) => s + b.t, 0);
ok(B.map(b => b.id).join() === "hpwh,comm,furnace,weather,solar,hp" && B.every((b, i) => b.m.n === i + 1) && IDS.join() === A.measures.map(m => m.id).join(), "default order: " + B.map(b => b.id).join() + "; numbered 1 to 6 in that order, as in the data file");
ok(B.filter(b => b.per < 0).length === 3 && B.filter(b => b.per < 0).every(b => ["hpwh", "comm", "furnace"].indexOf(b.id) >= 0), "three efficiency measures below zero");
{ const rows = [...PAGE0.matchAll(/<tr><td>(\d) · ([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
  ok(rows.length === 6 && rows.every((m, i) => +m[1] === i + 1 && m[2] === B[i].m.label && m[3] === fm.t(B[i].t) && m[4] === fm.per(B[i].per) && m[5] === fm.musd(B[i].up)), "fallback table: the six bars in order with tonnes, cost per tonne and up front"); }
onPage(`Alone, the six bars add to ${fm.t(alone)}; together they cut ${fm.t(all.t)} (${fm.pct(all.t / PC.inventory2025.total)} of 2025)`, "fallback: alone against together");
onPage(`Alone, the six bars add to ${fm.t(alone)}; together they cut ${fm.t(all.t)}. Heat pumps and condensing furnaces compete`, "myth 3");
{ const fh = M.evaluate(W, ["furnace", "hp"], o0), h = M.evaluate(W, ["hp"], o0);
  ok(near(fh.t, h.t, 1e-6) && near(fh.net, h.net, 1e-6) && near(fh.upfront, h.upfront, 1e-6), "furnaces and heat pumps compete: both = heat pumps alone"); }
ok(all.t < alone - 1000, "together less than the sum of the bars alone");
{ const wh = M.evaluate(W, ["weather", "hp"], o0).t - M.evaluate(W, ["weather"], o0).t, h = M.evaluate(W, ["hp"], o0).t; ok(wh < h, "a heat pump in weatherized homes saves less: " + Math.round(wh) + " < " + Math.round(h)); }

// ---------------- every setting: positive tonnes, a unique order, the in-order telescope
const COMBOS = [];
A.options.grid.forEach(g => A.options.gas.forEach(x => A.options.solar.forEach(s => [false, true].forEach(ac => COMBOS.push({ grid: g.key, gas: x.key, solar: s.key, ac })))));
ok(COMBOS.length === 36, "36 settings");
let ties = 0;
COMBOS.forEach(c => {
  const o = M.settings(W, Object.assign({}, DEF, c)), b = M.bars(W, o), io = M.inOrder(W, b.map(x => x.id), o), j = M.evaluate(W, IDS, o);
  ok(b.every(x => x.t > 1000 && x.per != null), "every bar avoids CO2: " + JSON.stringify(c));
  for (let i = 1; i < b.length; i++) if (M.round2(b[i].per) === M.round2(b[i - 1].per)) ties++;
  ok(near(io.reduce((s, x) => s + x.t, 0), j.t, 1e-6) && near(io.reduce((s, x) => s + x.net, 0), j.net, 1e-3), "bars in order add exactly to the joint plan: " + JSON.stringify(c));
});
ok(ties === 0, "no two bars tie to the cent at any setting (the tie rule never decides)");
{ const t = M.sortBars([{ id: "b", i: 1, per: 10.001 }, { id: "a", i: 0, per: 10.004 }, { id: "c", i: 2, per: -5 }]); ok(t.map(x => x.id).join() === "c,a,b", "tie rule: equal to the cent keeps the data order"); }
// the baseline and static-cost steps move the bars as the page says
{ const clean = M.settings(W, Object.assign({}, DEF, { grid: "clean" })), bc = M.bars(W, clean), b0 = M.bars(W, o0), byId = l => Object.fromEntries(l.map(x => [x.id, x]));
  ok(byId(bc).hp.t > byId(b0).hp.t && byId(bc).hpwh.t < byId(b0).hpwh.t && byId(bc).solar.t < byId(b0).solar.t, "a cleaner grid: heat pumps avoid more, electricity savers less");
  const drop = (I.tot.s2 + I.tot.s3) * (1 - 0.15 / W.grid23), r0 = M.evaluate(W, [], clean);
  ok(near(r0.gridCut, drop, 1e-6) && near(r0.t, 0, 1e-6) && near(r0.total, drop, 1e-6), "much cleaner grid, no measure: the inventory's scope 2 and losses at 0.15 t/MWh: " + Math.round(drop));
  onPage(`the much cleaner grid alone cuts ${fm.t(drop)} a year of scope 2 and the losses' scope 3`, "myth 1: the cleaner grid's drop, scopes named");
  ok(r0.gridCut > M.targetT(W, A.target.max) && /enough for the 8% target/.test(M.linePlan(W, r0, 8)), "much cleaner grid: it meets every target alone, and the plan line says so");
  ok(/counts toward the target/.test(M.lineBaseline(W, clean)) && /cuts nothing by itself/.test(M.lineBaseline(W, o0)), "the baseline line counts the grid's change toward the target");
  const ac = M.bars(W, M.settings(W, Object.assign({}, DEF, { ac: true }))); ok(byId(ac).hp.per < 0 && byId(b0).hp.per > 0, "with the air conditioner due, heat pumps cross zero");
  const lo = M.bars(W, M.settings(W, Object.assign({}, DEF, { gas: "low" }))); ok(byId(lo).furnace.per > 0 && byId(b0).furnace.per < 0, "lower gas prices lift condensing furnaces above zero");
  const s30 = M.bars(W, M.settings(W, Object.assign({}, DEF, { solar: "y2030" }))); ok(byId(s30).solar.per < byId(b0).solar.per / 2, "EIA's 2030 solar cost more than halves its cost per tonne"); }

// ---------------- feedback lines, true for every input
const subsets = []; for (let m = 0; m < 64; m++) subsets.push(IDS.filter((k, i) => m & (1 << i)));
let lines = 0, expl = 0; const over = [], explOver = [];
const LONG = (t, w, s) => { lines++; if (words(t) > (w || 45) || sentences(t) > (s || 3)) over.push(t.slice(0, 80) + " (" + words(t) + "/" + sentences(t) + ")"); };
const EXPL = t => { expl++; if (words(t) > 45 || sentences(t) > 2) explOver.push(t.slice(0, 80) + " (" + words(t) + "/" + sentences(t) + ")"); };
COMBOS.forEach(c => {
  const o = M.settings(W, Object.assign({}, DEF, c));
  LONG(M.lineOrder(W, o)); LONG(M.lineBaseline(W, o)); LONG(M.lineStatic(W, o));
  subsets.forEach(ids => {
    const R = M.evaluate(W, ids, o), P = M.peaks(W, R), lp = M.linePeak(P), overN = P.filter(x => x.over > 1e-9).length;
    LONG(lp); ok((overN > 0) === /Over the limit: /.test(lp), "peak line's verdict equals the model's");
    ok(near(R.total, R.t + R.gridCut, 1e-9) && near(R.gridCut, W.gridT * (1 - o.grid / W.grid23), 1e-9), "the cut from 2025 = the measures' + the grid's own change");
    [1, 4, 8].forEach(pct => { const l = M.linePlan(W, R, pct); LONG(l); ok(ids.length ? (R.total >= M.targetT(W, pct)) === /reaches/.test(l) : (R.gridCut >= M.targetT(W, pct)) === /enough for/.test(l), "plan line's verdict (the whole cut): " + ids.join("+") + " at " + pct + "% " + c.grid);
      [0, 250, 700].forEach(bm => { const t = M.tracePlan(W, R, P, { target: pct, budget: bm }), pass = ids.length > 0 && R.total >= M.targetT(W, pct) && R.upfront <= bm * 1e6 && overN === 0;
        ok(t.pass === pass && (!pass || /not pass or fail/.test(t.text)), "plan trace: adoption needs target, budget and peaks; fairness is weighed");
        EXPL(t.text); }); });
    [0, 250, 700].forEach(bm => { const l = M.lineBudget(R, bm); LONG(l); ok(!ids.length || (R.upfront <= bm * 1e6) === /fits/.test(l), "budget line's verdict: " + ids.join("+") + " $" + bm + "M"); });
    ["first", "low"].forEach(k => { const G = M.groups(W, R, k), l = M.lineGroups(W, G, R); LONG(l);
      ok(near(G.reduce((s, g) => s + g.share, 0), 1, 1e-12), "group shares add to one");
      ok(near(G.reduce((s, g) => s + g.charge * g.hh, 0), R.rebate, 1e-3) && G.every(g => g.charge >= 0), "the programme's charges recover its rebates and are never below zero");
      ok(!/−\$|−−/.test(l) && (R.rebate > 0) === /pays \$/.test(l), "the groups line signs once and names a charge only when there are rebates");
      ok(near(G.reduce((s, g) => s + g.avg * g.hh, 0), -R.billHome - R.homeCost, 1e-3), "groups' net = home bills saved - home measures' full cost (a transfer nets out)"); });
  });
});
ok(over.length === 0 && lines > 10000, "every assembled line (" + lines + ") is 45 words and three sentences at most: " + over.slice(0, 4).join(" | "));
ok(explOver.length === 0 && expl > 10000, "every explain-layer trace (" + expl + ") is 45 words and two sentences at most: " + explOver.slice(0, 3).join(" | "));
LONG("You placed 8 of 8 as the GPC does. " + M.lineInventory(I)); COMBOS.forEach(c => LONG(M.lineTarget(W, 4, M.evaluate(W, IDS, M.settings(W, Object.assign({}, DEF, c))))));
ok(over.length === 0, "inventory and target lines are short: " + over.join(" | "));
// what the page's static text says about peaks
{ const hp = M.peaks(W, M.evaluate(W, ["hp"], o0)), sub = hp.find(x => x.key === "suburbs");
  onPage(`Heat pumps alone put the suburbs ${fm.mw(sub.over)} over their ${sub.limit} MW substation limit on the cold design day`, "fallback: heat pumps and the suburbs");
  ok(sub.day === "winter_design" && hp.filter(x => x.over > 0).length === 1, "heat pumps alone: only the suburbs go over, on the design day");
  ok(M.peaks(W, all).every(x => x.over < 0), "all six measures: every district within its limit");
  const sol = M.peaks(W, M.evaluate(W, ["solar"], o0)); ok(sol.every((x, i) => P0[i].mw - x.mw < 0.1 && P0[i].mw - x.mw >= 0 && x.h === 7 && x.day === "winter_design"), "myth 4: 60 MW of panels lower each highest hour (07:00, design day) by under 0.1 MW");
  onPage("Each district's highest hour is 07:00 on the cold design day, before the sun is up enough: 60 MW of new panels lower it by under 0.1 MW.", "myth 4"); }
ok(W.M.solar.addMW === 60 && W.M.weather.share === 0.4 && A.programme.share === 0.4 && JS.includes("a programme paying 40% of the extra cost up front") && /60 MW of rooftop panels/.test(W.M.solar.what) && /40% of the homes built before 1980/.test(W.M.weather.what), "teaching settings named on the page: 60 MW, 40%, 40%");
// the programme's rebates by hand: 40% of each home measure's positive extra up-front cost, over the item's life
{ const lifeOf = { hpwh: 15.1, furnace: 22.5, weather: 20, solar: E0.home.pv.life, hp: 15.3 };
  for (const ac of [false, true]) {
    const o = Object.assign({}, o0, { ac }), R = M.evaluate(W, Object.keys(lifeOf), o), rb = Object.keys(lifeOf).reduce((s, k) => s + 0.4 * Math.max(0, R.up[k]) * M.crf(0.04, lifeOf[k]), 0);
    ok(near(R.rebate, rb, 1e-6), "rebates by hand" + (ac ? ", air conditioner due" : "") + ": $" + Math.round(rb)); }
  // regression (review): heat pumps alone with the air conditioner due cost less up front and over their life than the usual
  // replacements; the programme then pays no rebate and charges nobody, and nothing shows a double minus
  const o = Object.assign({}, o0, { ac: true }), R = M.evaluate(W, ["hp"], o);
  ok(R.up.hp < 0 && R.homeCost < 0 && R.rebate === 0, "heat pumps with the air conditioner due: cheaper up front (" + fm.musd(R.up.hp) + ") and a year; no rebate");
  ["first", "low"].forEach(k => { const G = M.groups(W, R, k), l = M.lineGroups(W, G, R);
    ok(G.every(g => g.charge === 0) && /pays no rebate/.test(l) && !/−/.test(l), "no rebate, no charge, line without a minus sign: " + k);
    ok(near(G.reduce((s, g) => s + g.avg * g.hh, 0), -R.billHome - R.homeCost, 1e-3), "the groups still add to bills saved less the full cost: " + k); }); }
onPage("A measure costs $300 a year more to own and saves $100 a year of energy. It avoids 2 t of CO₂ a year.", "quiz"); ok((300 - 100) / 2 === 100, "quiz: (300 - 100) / 2 = 100");
// facts
onPage("<td class=\"n\">$8,620 and $3,690</td>", "fact: heat pump and furnace"); ok(E0.home.hp.high.capex === 8620 && W.M.furnace.baseCost === 3690, "fact numbers are the data's");
onPage("<td class=\"n\">22.5 years</td>", "fact: furnace life"); ok(2026 + W.M.furnace.life > 2045, "a furnace of 2026 runs past 2045");
ok(JS.includes('"Lock-in: a furnace bought in 2026 lasts " + W.M.furnace.life + " years on average, past 2045'), "lock-in hint reads the life from the data");

// ---------------- scope, links, text, glossary
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "");
ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(OWN + JS + JSON.stringify(A) + SIDE), "no nuclear term in the lesson's own files");
ok(!/\bAI\b|artificial intelligence/.test(OWN + JS + JSON.stringify(A)), "no AI wording");
{ const dc = (OWN + JS + JSON.stringify(A)).match(/[^.;:!?"]*data[- ]cent[^.;:!?"]*/gi) || [];
  ok(dc.every(s => /uses|load|electricity|campus/i.test(s)), "data centers appear only as a load: " + dc.join(" | ")); }
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
const ALLOW = /^(https:\/\/(www\.eia\.gov|apps\.bea\.gov|www\.energy\.gov|ghgprotocol\.org|eta-publications\.lbl\.gov|docs\.nlr\.gov)\/|[0-9a-z-]+\.html|#)/;
ok(hrefs.length >= 10 && hrefs.every(h => ALLOW.test(h)), "links only to allowed domains and learn pages: " + hrefs.filter(h => !ALLOW.test(h)).join(", "));
ok(!/nyc\.gov|fred\.stlouisfed/.test(OWN.replace(/\(nyc\.gov; no link\)/, "")), "sources off the allow-list are named without a link");
{ const core = require(path.join(SITE, "assets/learn/components/core.js"));
  [["A1", "a01-project-tea.html"], ["A10", "a10-emissions-questions.html"], [12, "12-trade-offs.html"]].forEach(([c, h]) => { const r = core.lessonRef(PATH, c); ok(r.ready && r.href === h && OWN.includes('href="' + h + '"'), "a static link only to a live lesson: " + h); });
  ["A13", "M12", "SB3", "C3", "F9"].forEach(c => ok(new RegExp('class="a18-ref" data-code="' + c + '">' + c + ' \\(upcoming\\)</span>').test(OWN) || core.lessonRef(PATH, c).ready, c + ": named through LX.lessonRef, '(upcoming)' until live"));
  ok(!/\bA13\b/.test(JS.replace(/refText\("A13"\)|refRich\("A13"\)|lessonRefHTML\(PATH, "A13"\)/g, "")), "A13 is named only through LX.lessonRef in the script"); }
const stepTexts = [...JS.matchAll(/\{ text: "([^\n]+)",\n\s+build:/g)].map(m => m[1].replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1"));
ok(stepTexts.length === 10 && stepTexts.every(t => words(t) <= 40 && sentences(t) <= 3), "ten step texts of 40 words and three sentences at most: " + stepTexts.map(t => words(t) + "/" + sentences(t)).join(","));
ok(/scopes of the \[\[gpc\|GPC\]\]/.test(JS) && JS.indexOf("Global Protocol for Community-Scale") < JS.indexOf("LX.CardSort(act, { bins: A.scopeSort") && /\[\[scope-1\|scope 1\]\]/.test(JS), "step 1: GPC spelled out before the sort; each scope label carries its own definition");
ok(/1 kt = 1,000 t/.test(JS) && /1 kt is 1,000 t/.test(M.lineInventory(I)), "kt is converted to tonnes where it first appears");
ok(/The grid's CO₂ per MWh in 2035 changes the tonnes; whether the old air conditioner is due too changes the heat pump's cost/.test(JS), "step 8: the grid moves tonnes, the air conditioner moves cost");
ok(/must represent such overlaps explicitly/.test(PAGE) && !/linear program handles/.test(PAGE), "Go deeper: no claim that an LP handles a product of decisions");
ok(!/a choice of the utility and the state regulator, not the city/.test(PAGE) && /Cities influence demand, and some run their own utility/.test(PAGE), "myth 1: who shapes electricity emissions, without overstating");
{ const O2 = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/\$\$[\s\S]*?\$\$/g, "");
  const els = O2.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|dd|dt|td|th|summary|footer)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
  const long = els.filter(x => x.split(" ").length > 45);
  ok(long.length === 0, "every page element is 45 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | ")); }
// explain elements and data notes: one or two sentences each (w1_builder_brief §3), one idea per row
{ const plain = h => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const notes = [...PAGE.matchAll(/<p class="lx-datanote">[\s\S]*?<b>[^<]*<\/b>([\s\S]*?)<\/span><\/p>/g)].map(m => plain(m[1]));
  ok(notes.length === 4 && notes.every(t => sentences(t) <= 2 && words(t) <= 35), "four data notes, each two sentences and 35 words at most after its heading: " + notes.map(t => words(t) + "/" + sentences(t)).join(","));
  const dd = [...PAGE.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(m => plain(m[1]));
  ok(dd.length === 5 && dd.every(t => sentences(t) <= 2 && words(t) <= 35), "explain fallback: five ideas, two sentences each at most");
  const steps = A.flow.steps.filter(x => x.who);
  ok(steps.length === 7 && steps.every(x => sentences(x.who) === 1 && words(x.who) <= 25 && x.s), "who decides: one row per step, one sentence of 25 words at most each");
  const F = Object.fromEntries(A.flow.steps.map(x => [x.id, x])); EXPL(F.irp.who + " " + F.plan.who); EXPL(A.flow.note);
  ok(explOver.length === 0, "the utility trace and the flowchart's note: two sentences at most");
  ok(/fs\.forEach|A\.flow\.steps\.filter\(function \(s\) \{ return s\.who; \}\)/.test(JS) && !/\[F\.inv\.who, F\.tgt\.who/.test(JS), "the explain layer no longer runs five explanations together");
  const ml = M.measureLines(W);
  ok(ml.length === 6 && ml.every(x => words(x.head + " " + x.text) <= 45 && sentences(x.text) <= 2), "each measure's line: its replacement and how many by 2035, 45 words at most");
  ok(ml[0].text.endsWith(`By 2035: ${Math.round(M.evaluate(W, ["hpwh"]).units.hpwh).toLocaleString("en-US")} homes.`) && ml[4].text.endsWith("8,955 systems of 6.7 kW."), "measure lines read their counts from the model"); }
["scope-1", "scope-3", "marginal-abatement-cost-curve", "abatement-cost", "design-day", "gpc", "weatherization", "condensing-furnace", "gdp-deflator"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE) && new RegExp("\\[\\[" + id + "\\||term=\"" + id + "\"").test(JS + PAGE + JSON.stringify(A)), "sidecar defines and the page marks " + id));
["emissions-inventory", "substation", "counterfactual", "capital-recovery-factor", "scope-2"].forEach(id => ok(new RegExp("\\[\\[" + id + "\\||term=\"" + id + "\"").test(JS + PAGE), "the page marks the course glossary's " + id));
ok(!/\b(always|never)\b/i.test(JS.replace(/\/\/[^\n]*/g, "") + OWN), "no 'always' or 'never' on the page");
{ const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), r = PY.slice(PY.indexOf("id: " + ID), PY.indexOf("id: " + ID) + 2000).split("- kind:")[0];
  ok(/status: active/.test(r) && /after: \[A1\]/.test(r) && /minutes: 30/.test(r) && PAGE.includes('subtitle: "' + (r.match(/subtitle: "([^"]+)"/) || [])[1] + '"'), "path.yml: active, after A1, 30 minutes, subtitle equal to the page's"); }

// ---------------- the page on a stub document
{
  const { env, load } = require("./stubdom.js");
  const E = env();
  const core = require(path.join(SITE, "assets/learn/components/core.js")); E.LX.lessonRefHTML = core.lessonRefHTML; E.LX.lessonRef = core.lessonRef;
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
  ["cards", "controls", "plot", "cardsort", "toggle", "ledger", "table", "boundary", "costsplit", "flowchart"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const xp = E.LX.H("div", { id: "a18-explain" }, E.body);
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { a18_city_plan: A, prairie_city: PC, e0: E0, path: PATH }, root); } catch (e) { threw = e.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  try {
    const card = () => demo.cards.el, btns = (re, host) => (host || card()).querySelectorAll("button").filter(b => re.test(b.textContent));
    ok(live.textContent.includes(PC.about.line), "the stage carries the fictional line");
    ok(A.measures.every(m => live.textContent.includes(m.n + " · " + m.label)), "the toggles carry the full measure names");
    ok(live.textContent.includes("What each measure is") && M.measureLines(W).every(x => live.textContent.includes(x.text.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1"))), "each measure's replacement and count are on the stage");
    ok(live.textContent.includes(fm.kt(I.tot.total)), "step 1: the inventory total");
    demo.cards.go(2);
    btns(/^Cheapest first$/)[0].click();
    const S = root.lxLesson.S, R = M.evaluate(W, S.plan, o0);
    ok(M.planIds(S).join() === "hpwh,comm,furnace,weather,solar" && R.t >= M.targetT(W, A.target.def), "step 3: cheapest first reaches the 4% target from an empty plan");
    ok(card().textContent.includes(M.linePlan(W, R, A.target.def).replace(/\*\*/g, "")), "step 3: the plan line");
    // the shortcut continues from the reader's plan: start with heat pumps on
    IDS.forEach(k => { S.plan[k] = k === "hp"; }); btns(/^Cheapest first$/)[0].click();
    ok(S.plan.hp && M.evaluate(W, S.plan, o0).t >= M.targetT(W, A.target.def), "step 3: cheapest first keeps the reader's heat pumps and adds the cheapest bars");
    demo.cards.go(4); btns(/^Check the peaks$/)[0].click();
    const Rp = M.evaluate(W, S.plan, o0); ok(card().textContent.includes(M.linePeak(M.peaks(W, Rp))), "step 5: the peak line with the reader's plan");
    demo.cards.go(5); btns(/^Low-income homes first$/)[0].click();
    ok(card().textContent.includes(M.lineGroups(W, M.groups(W, Rp, "low"), Rp)) && /A13/.test(card().textContent), "step 6: the groups line; A13 named");
    demo.cards.go(6); card().querySelectorAll("button").filter(b => /Bars in order/.test(b.textContent))[0].click();
    ok(card().textContent.includes(M.lineOrder(W, o0)), "step 7: the order line");
    ok(xp.textContent.includes("How a U.S. city plan is made") && xp.textContent.includes("The curve and the tests") && xp.textContent.includes("Who decides each step"), "explain: the flowchart, the comparison table and the who-decides rows");
    // regression (review): heat pumps alone, air conditioner due: no "−−" and no negative charge in the groups ledger
    IDS.forEach(k => { S.plan[k] = k === "hp"; }); S.ac = true; demo.cards.go(5); btns(/^First come$/)[0].click();
    ok(!/−−/.test(card().textContent) && card().textContent.includes("pays no rebate"), "step 6: heat pumps with the air conditioner due show no double minus and no rebate");
    S.ac = false;
    demo.cards.go(7); btns(/^Much cleaner/)[0].click();
    ok(card().textContent.includes(M.lineBaseline(W, M.settings(W, Object.assign({}, DEF, { grid: "clean" })))), "step 8: the baseline line");
  } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
}

console.log(`test_a18-city-plan: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
