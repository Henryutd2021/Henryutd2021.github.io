// test_f04-power-plants.js — Node tests for F4 (assets/learn/f04-power-plants.js), its data
// (assets/learn/data/f04-power-plants.json with town.json and town_year.json), the Sankey it shares with F3
// (assets/learn/components/sankey.js, shared by F3 and F4) and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_f04-power-plants.js
"use strict";
const fs = require("fs");
const path = require("path");
const PRIV = require("./private_sources.js");
const SITE = path.resolve(__dirname, "..", "..");
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
const M = require(path.join(SITE, "assets/learn/f04-power-plants.js"));
const SK = require(path.join(SITE, "assets/learn/components/sankey.js"));
const G0 = require(path.join(SITE, "assets/learn/grid-operator.js"));
const CS = require(path.join(SITE, "assets/learn/components/cardsort.js"));
const D = JSON.parse(rd("assets/learn/data/f04-power-plants.json"));
const TOWN = JSON.parse(rd("assets/learn/data/town.json"));
const Y = JSON.parse(rd("assets/learn/data/town_year.json"));
const L5 = JSON.parse(rd("assets/learn/data/05-capacity-factor.json"));
const QMD = rd("learn/f04-power-plants.qmd");
const JS = rd("assets/learn/f04-power-plants.js");
const PATH = rd("learn/path.yml");
const SIDE = rd("learn/_w1/f04-power-plants.yml");
const BTU = D.meta.btuPerKWh;

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);
const sentences = s => s.split(/(?<=[.!?])\s+(?=[A-Z*“"(])/).filter(Boolean).length;
const words = s => s.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
const fmt = v => v.toLocaleString("en-US");
const P = k => M.plantByKey(D, k);

// Two kinds of check below. Source consistency: page, script and data say the same thing, and every real number has a
// source with a date. Model validation: shares, the Sankey's balance, the solar days (recomputed here from town_year.json
// without the lesson's code), the hydro formula, the evening ramp and lesson 0's day, each recomputed from its inputs.

// ---------------- sources
{
  const S = D.sources;
  Object.keys(S).forEach(k => {
    const s = S[k];
    ok(s.publisher && s.title && s.where && s.as_of && s.read === "2026-11-03", `source ${k}: publisher, title, place, as-of and read date`);
    ok(/^https:\/\/(www\.eia\.gov|www\.energy\.gov|docs\.nlr\.gov)\//.test(s.url), `source ${k}: URL on eia.gov, energy.gov or nlr.gov (${s.url})`);
    ok(QMD.indexOf(s.url.replace(/&/g, "&amp;")) >= 0 || QMD.indexOf(s.url) >= 0, `source ${k}: its URL is on the page`);
  });
  D.plants.forEach(p => ok(S[p.src], `plant ${p.key}: source ${p.src} exists`));
  D.scenes.forEach(s => ok(S[s.src], `scene ${s.key}: source ${s.src} exists`));
  Object.keys(D.facts).forEach(k => { if (D.facts[k].src) ok(S[D.facts[k].src], `fact ${k}: source exists`); });
  ok(!/usgs\.gov|ferc\.gov|usbr\.gov|sciencedirect/.test(JSON.stringify(D) + JS + QMD.replace(/<!--[\s\S]*?-->/g, "")), "no link to a source page that could not be read and checked");
}

// ---------------- model validation: shares and heat rates (EIA Table 8.2, 2025; AER 2010 Table F1; EIA PV page)
{
  const HR = { cc: 7535, ct: 10975, coal: 10040 }, NOTIONAL = { geo: 16, hydro: 90, wind: 26, pv: 25 };
  Object.keys(HR).forEach(k => { ok(P(k).heatRate === HR[k] && P(k).kind === "thermal", `${k}: EIA 2025 tested heat rate ${HR[k]} Btu/kWh`); ok(M.share(P(k), BTU) === Math.round(1000 * BTU / HR[k]) / 10, `${k}: share = 3,412 / heat rate`); });
  Object.keys(NOTIONAL).forEach(k => ok(M.share(P(k), BTU) === NOTIONAL[k] && P(k).kind === "notional", `${k}: notional share ${NOTIONAL[k]}`));
  ok(M.share(P("cc"), BTU) === 45.3 && M.share(P("ct"), BTU) === 31.1 && M.share(P("coal"), BTU) === 34, "shares 45.3, 31.1, 34.0");
  ok(near(BTU / 21017 * 100, 16.2, 0.05) && D.facts.geoHeatRate2010.value === 21017, "geothermal: EIA's 2010 heat rate 21,017 Btu/kWh gives 16.2%, consistent with Table F1's 16%");
  ok(near(BTU / 10500 * 100, 32.5, 0.05) && near(BTU / 7500 * 100, 45.5, 0.05), "EIA FAQ's two examples (33% and 45%) follow from 3,412 / heat rate");
  ok(D.plants.map(p => M.shareText(p, BTU)).join() === "45.3,31.1,34.0,16,90,26,25", "shares as printed: thermal to one decimal, typical values whole");
  ok(M.unitsFmt(P("coal"))(66) === "66.0" && M.unitsFmt(P("coal"))(100) === "100" && M.unitsFmt(P("geo"))(84) === "84", "Sankey labels: 66.0 for coal, 100 in, 84 for geothermal");
  ok(M.lost(P("cc"), BTU) === 54.7 && M.lost(P("ct"), BTU) === 68.9 && M.lost(P("coal"), BTU) === 66, "losses 54.7, 68.9, 66.0");
  ok(Math.round((P("ct").heatRate / P("cc").heatRate - 1) * 100) === 46, "a peaker burns about 46% more gas per kWh than a combined cycle");
  // the prediction: geothermal sends the fewest units of the four options
  const opts = D.predict.options.map(o => o.value), least = opts.slice().sort((a, b) => M.share(P(a), BTU) - M.share(P(b), BTU))[0];
  ok(least === D.predict.answer && least === "geo", "the predict question's answer (geothermal) has the smallest share of its options");
  ok(D.facts.cpBest.value === L5.measured.cpBest && L5.measured.cpBest === 0.52, "NREL test turbine's best power coefficient 0.52 (lesson 5's data)");
  ok(near(16 / 27 * 100, 59.26, 0.01), "Betz limit 16/27 = 59.3%");
  // Go deeper stays at the next tier's view (a preview, not a way past the depth budget): no device thermodynamics (Carnot, kelvin) in F4, and the
  // Analyst box's plain table reads its numbers from the data file
  ok(!/carnot|kelvin|T_\\text\{(hot|cold)\}/i.test(QMD.replace(/<!--[\s\S]*?-->/g, "")), "no Carnot formula or kelvin table on the page");
  const F = D.facts;
  ok(QMD.indexOf(`| Geothermal water | ${F.geoTempF.lo} to ${F.geoTempF.hi} °F (EIA) | about ${M.shareText(P("geo"), BTU)} (EIA, typical) |`) >= 0, "Analyst table: geothermal 300 to 700 °F, about 16");
  ok(QMD.indexOf(`| Gas in a gas turbine | above ${fmt(F.gasTempF.value)} °F (DOE) | ${F.simpleCycle.lo} to ${F.simpleCycle.hi} alone (DOE) |`) >= 0, "Analyst table: gas above 2,000 °F, 20 to 35 alone");
  // the Modeler box's one symbolic line is dimensionally right: Btu = 1,000 kW/MW x Btu/kWh x MW x h
  ok(M.fuelBtu(7535, 150, 1) === 1130250000 && near(M.fuelBtu(7535, 150, 0.5), M.fuelBtu(7535, 150, 1) / 2), "fuel: 150 MW for an hour at 7,535 Btu/kWh = 1,130,250,000 Btu; half the hour, half the fuel");
  ok(QMD.indexOf(`about ${(M.fuelBtu(P("cc").heatRate, TOWN.fleet.cc.mw, 1) / 1e9).toFixed(2)} billion Btu`) >= 0 && /F_t = 1\{,\}000 \\cdot HR \\cdot p_t\\,\\Delta t/.test(QMD), "the Modeler box's line has the 1,000 and the duration, and its example matches");
  ok((QMD.match(/\$\$/g) || []).length === 4, "two displayed equations in the Go deeper boxes, no more (at most one symbolic line per preview)");
  ok(/m01-dispatch-to-lmp\.html/.test(QMD) && !/\\sum_t|\\le R|E\^\\text\{water\}/.test(QMD), "the Modeler box links M1 and gives the rules in words, not a formulation");
}

// ---------------- the Sankey: every plant's 100 units balance, laid out by F3's component
{
  D.plants.forEach(p => {
    const s = M.sankeySpec(p, D), F = SK.flows(s);
    ok(near(F.in.vout, 100, 1e-9) && near(F.elec.vin + F.loss.vin, 100, 1e-9), `${p.key}: 100 in = electricity + losses`);
    const L = SK.layout(s, 600, 200);
    ok(near(L.nodes.in.h, L.nodes.elec.h + L.nodes.loss.h, 1e-6), `${p.key}: the bands' widths add up (layout)`);
    ok(s.links[0].color === "var(--lx-good)" && s.nodes[2].kind === "loss", `${p.key}: electricity band green, losses pale`);
  });
}

// ---------------- the solar days: recomputed from town_year.json, without the lesson's code
{
  const t0 = Date.parse(Y.start_utc + "Z");
  const shape = date => { const i = Math.round((Date.parse(date + "T00:00:00Z") - t0) / 3600e3) + 1 + 5; return Y.solar.slice(i, i + 24); };
  const days = M.solarDays(Y, D);
  ok(days.map(d => d.date).join() === "2025-09-11,2025-09-03,2025-09-05", "days: 11, 3 and 5 September 2025");
  days.forEach(d => {
    const mw = shape(d.date).map(v => Math.round(v / 1000 * 200));
    ok(mw.join() === d.mw.join(), `${d.date}: MW = round(shape × 200)`);
    ok(d.energy === mw.reduce((a, b) => a + b, 0) && near(d.cf, d.energy / 4800), `${d.date}: energy and the day's capacity factor`);
  });
  const [c, k, o] = days;
  ok(c.energy === 1666 && near(c.cf * 100, 34.7, 0.05) && c.peak === 173, "clear: 1,666 MWh, 34.7%, 173 MW");
  ok(k.energy === 1411 && near(k.cf * 100, 29.4, 0.05) && k.peak === 161 && k.drop.mw === 37 && k.drop.hour === 14, "passing clouds: 1,411 MWh, 29.4%, 161 MW, a 37 MW fall into 14:00");
  ok(o.energy === 776 && near(o.cf * 100, 16.2, 0.05) && o.peak === 93, "overcast: 776 MWh, 16.2%, 93 MW");
  ok(Math.round(o.energy / c.energy * 100) === 47, "overcast = 47% of the clear day");
  ok(c.drop.mw < 20 && o.drop.mw < 20 && k.drop.mw >= 20, "only the passing-clouds day has a large midday fall");
  ok(k.date === TOWN.scenarios.lesson0.date, "the passing-clouds day is lesson 0's day");
  // the picks, as the data file states them
  const S = D.solar, inWin = [];
  for (let t = Date.parse(S.pickWindow[0] + "T00:00:00Z"); t <= Date.parse(S.pickWindow[1] + "T00:00:00Z"); t += 86400e3) inWin.push(new Date(t).toISOString().slice(0, 10));
  const normal = inWin.filter(d => { const s = shape(d), pk = Math.max(...s); return s[S.eveningHour] <= S.eveningMax * pk; });
  const sum = d => shape(d).reduce((a, b) => a + b, 0);
  ok(normal.slice().sort((a, b) => sum(b) - sum(a))[0] === "2025-09-11", "11 September: the most solar of the window's days with a normal evening");
  ok(inWin.indexOf("2025-09-12") >= 0 && normal.indexOf("2025-09-12") < 0 && sum("2025-09-12") > sum("2025-09-11"), "12 September (left out) has more energy but holds its peak into the evening");
  const summer = []; for (let t = Date.parse("2025-06-01T00:00:00Z"); t < Date.parse("2025-10-01T00:00:00Z"); t += 86400e3) summer.push(new Date(t).toISOString().slice(0, 10));
  ok(summer.slice().sort((a, b) => sum(a) - sum(b))[0] === "2025-09-05", "5 September: the least solar energy of June to September 2025");
}

// ---------------- hydro: power from head and flow, the reservoir's hours
{
  const h = D.hydro;
  ok(h.rho === 1000 && h.g === 9.81 && h.eta === 0.9 && P("hydro").share === 90, "hydro: 1,000 kg/m³, 9.81 m/s², 0.9 = EIA's notional 90%");
  ok(M.hydroMW(120, 100, h).toFixed(1) === "105.9" && M.reservoirHours(h.volumeM3, 100).toFixed(1) === "55.6", "120 m × 100 m³/s = 105.9 MW; 20 million m³ last 55.6 h");
  ok(M.hydroMW(h.head.start, h.flow.start, h) < h.goalMW && M.hydroMW(h.head.max, h.flow.max, h) >= h.goalMW, "the start is below 100 MW and the sliders can reach it");
  ok(near(M.hydroMW(80, 100, h), 2 * M.hydroMW(40, 100, h)) && near(M.hydroMW(40, 200, h), 2 * M.hydroMW(40, 100, h)), "twice the head or twice the flow doubles the power");
  ok(h.volumeM3 === 20e6, "reservoir 20 million m³ (illustrative)");
  [20, 100, 300].forEach(Q => ok(near(M.reservoirMWh(h.volumeM3, 120, h), M.hydroMW(120, Q, h) * M.reservoirHours(h.volumeM3, Q), 1e-6), `reservoir energy (no inflow, constant head) is the same at ${Q} m³/s`));
  ok(Math.round(M.reservoirMWh(h.volumeM3, 120, h)) === 5886, "120 m, 20 million m³: about 5,886 MWh");
  ok(/no inflow, all the water usable, head and efficiency held constant/.test(JS) && /no water flowing in/.test(h.about), "the toy reservoir's assumptions are stated");
}

// ---------------- the evening ramp: lesson 0's day and the greedy follow
{
  const need = M.gasNeed(TOWN, Y), W0 = G0.prepare(TOWN, Y);
  ok(need.join() === W0.need.join(), "gas need equals lesson 0's prepare() for 3 September 2025");
  const R = D.ramp, base = { from: R.from, to: R.to, ccStart: R.ccStart, ccMax: TOWN.fleet.cc.mw, pkMax: TOWN.fleet.peaker.mw };
  ok(R.ccStart === need[R.from] && TOWN.fleet.cc.ramp === 40 && TOWN.fleet.cc.mw === 150 && TOWN.fleet.peaker.mw === 100, "start at the 15:00 need; 40 MW/h, 150 MW combined cycle, 100 MW peaker (town.json)");
  const r40 = M.rampRun(need, Object.assign({ ramp: 40, peaker: false }, base));
  ok(r40.tot.short === 10 && r40.tot.firstShort === 18 && r40.short.filter(v => v > 0).length === 1, "at 40 MW/h: 10 MWh short, only at 18:00");
  ok(M.rampNeeded(need, Object.assign({ rampMin: R.rampMin, rampMax: R.rampMax, rampStep: R.rampStep }, base)) === 50, "50 MW/h is the smallest slider value with nothing short");
  for (let r = R.rampMin; r <= R.rampMax; r += R.rampStep) {
    const x = M.rampRun(need, Object.assign({ ramp: r, peaker: true }, base)), y = M.rampRun(need, Object.assign({ ramp: r, peaker: false }, base));
    ok(x.tot.short === 0 && x.tot.pk === y.tot.short, `ramp ${r}: the peaker closes the gap (fills ${y.tot.short} MWh)`);
    x.cc.forEach((c, i) => { if (i) ok(Math.abs(c - x.cc[i - 1]) <= r && c <= base.ccMax && c >= 0, `ramp ${r}: hour ${R.from + i} within the ramp and size`); });
  }
  const pk40 = M.rampRun(need, Object.assign({ ramp: 40, peaker: true }, base));
  ok(pk40.tot.pk === 10 && pk40.tot.balanced, "with the peaker at 40 MW/h it fills 10 MWh and every hour balances");
  // surplus: at 10 MW/h the plant cannot turn down as fast as the need falls into 16:00
  const r10p = M.rampRun(need, Object.assign({ ramp: 10, peaker: true }, base)), r10 = M.rampRun(need, Object.assign({ ramp: 10, peaker: false }, base));
  ok(r10p.tot.short === 0 && r10p.tot.over === 5 && r10p.tot.firstOver === 16 && r10p.over.filter(v => v > 0).length === 1 && !r10p.tot.balanced, "10 MW/h with the peaker: nothing short, 5 MWh over at 16:00, not balanced");
  ok(r10.tot.short === 160 && r10.tot.over === 5 && !r10.tot.balanced, "10 MW/h alone: 160 MWh short and 5 MWh over");
  for (let r = R.rampMin; r <= R.rampMax; r += R.rampStep) {
    const x = M.rampRun(need, Object.assign({ ramp: r, peaker: true }, base)), y = M.rampRun(need, Object.assign({ ramp: r, peaker: false }, base));
    ok(x.tot.balanced === (r >= 20) && y.tot.balanced === (r >= 50), `ramp ${r}: balanced with the peaker from 20 MW/h, alone from 50 MW/h`);
    x.need.forEach((v, i) => ok(x.cc[i] + x.pk[i] + x.short[i] - x.over[i] === v, `ramp ${r}, hour ${x.hours[i]}: made + short - over = need`));
    const fb = x.tot.balanced ? M.rampText({ r, pk: true }, x, D, TOWN) : M.rampFeedback({ r, pk: true }, x), fb2 = y.tot.balanced ? M.rampText({ r, pk: false }, y, D, TOWN) : M.rampFeedback({ r, pk: false }, y);
    [fb, fb2].forEach(t => ok(words(t) <= 40 && sentences(t) <= 2, `ramp ${r} feedback within budget (${words(t)} words): ${t.slice(0, 60)}…`));
  }
  ok(M.rampFeedback({ r: 10, pk: true }, r10p) === "Nothing short, but **5 MWh** too much, first at 16:00: at 10 MW per hour the combined-cycle plant cannot turn down as fast as the need falls. Raise the ramp limit.", "feedback names the 5 MWh surplus at 16:00");
  ok(/^Short by \*\*10 MWh\*\*, first at 18:00/.test(M.rampFeedback({ r: 40, pk: false }, r40)), "feedback at 40 MW/h alone: 10 MWh short, first at 18:00");
  ok(/^Short by \*\*160 MWh\*\* \(first at 17:00\) and \*\*5 MWh\*\* too much \(first at 16:00\)/.test(M.rampFeedback({ r: 10, pk: false }, r10)), "feedback at 10 MW/h alone names both");
  ok(/the peaker filled \*\*10 MWh\*\*/.test(M.rampText({ r: 40, pk: true }, pk40, D, TOWN)) && /about 46% more gas per kWh/.test(M.rampText({ r: 40, pk: true }, pk40, D, TOWN)), "balanced feedback with the peaker: 10 MWh, 46% more gas");
  ok(/"Energy short", int\(x\.tot\.short\) \+ " MWh"/.test(JS) && /"Energy over", int\(x\.tot\.over\) \+ " MWh"/.test(JS) && !/"MW short"/.test(JS), "chips say energy short and energy over, in MWh");
  ok(/"Short, MW", "Over, MW"\]/.test(JS) && /if \(x\.tot\.balanced\) \{ api\.done\(\)/.test(JS), "the text table shows the surplus, and the step completes only when every hour balances");
}

// ---------------- the card sort and the explorer data
{
  const L = D.limits, ref = {}; L.cards.forEach(c => { ref[c.id] = c.bin; });
  const g = CS.grade(L.cards, ref); ok(g.right === 5 && g.total === 5, "card sort: the reference sort scores 5 of 5");
  ok(new Set(L.cards.map(c => c.bin)).size === 4 && L.bins.length === 4, "every bin has a card");
  L.cards.forEach(c => ok(sentences(c.why) <= 2 && words(c.why) <= 20, `card ${c.id}: one short reason`));
  ok(D.scenes.length === 6 && D.scenes.map(s => s.key).join() === "gas,steam,hydro,geo,wind,pv", "six plants in the explorer");
  ok(D.scenes.filter(s => /^Nothing/.test(s.spins)).map(s => s.key).join() === "pv", "only solar PV has nothing spinning");
  D.scenes.forEach(s => { ok(s.chain.length === 4 && s.chain[3] === "Electricity", `${s.key}: a four-stop energy chain to electricity`); ok(words(s.text) <= 40 && sentences(s.text) <= 2, `${s.key}: text within budget`); });
  ok(/2,000 °F/.test(D.scenes[0].chain[1]) && D.facts.gasTempF.value === 2000, "gas: burned above 2,000 °F (DOE)");
  ok(/300 to 700 °F/.test(D.scenes[3].energy) && D.facts.geoTempF.lo === 300 && D.facts.geoTempF.hi === 700, "geothermal: 300 to 700 °F (EIA)");
  ok(/^Flash-steam/.test(D.scenes[3].name) && /binary/.test(D.scenes[3].text) && /flash steam \(the most common\)/.test(D.sources.eia_geo.where), "geothermal: named as the flash-steam example, binary plants noted");
  ok(/exhaust-heated boiler \(\[\[hrsg\|HRSG\]\]\)/.test(D.scenes[0].text) && /exhaust-heated<\/text>/.test(JS) && /\[\[nacelle\|nacelle\]\], the equipment housing/.test(D.scenes[4].text) && /direct current \(DC\), which flows one way/.test(D.scenes[5].text) && /alternating current \(AC\), which reverses/.test(D.scenes[5].text), "HRSG, nacelle, DC and AC are explained where they first appear");
  ok(P("pv").outLabel && /DC electricity at the module/.test(M.sankeySpec(P("pv"), D).nodes[1].label) && M.sankeySpec(P("cc"), D).nodes[1].label === "Electricity to the wire", "solar's 25 is DC at the module; the other plants reach the wire");
}

// ---------------- every number with a unit on the page, against the model and the data
{
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/https?:\/\/[^\s"')]+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&");
  const prose = strip(QMD);
  const days = M.solarDays(Y, D), sh = k => M.fmtShare(M.share(P(k), BTU));
  const allowed = new Set([
    // shares and heat rates
    "45.3%", "34.0%", "31.1%", "68.9%", "54.7%", "321.7%", "16%", "59.3%", "25%", "10%", "20 to 35 percent", "60 percent", "90%",
    "7,535 Btu", "10,975 Btu", "10,040 Btu", "3,412 Btu",
    // solar
    "200 MW", "1,666 MWh", "1,411 MWh", "776 MWh", "34.7%", "29.4%", "16.2%", "173 MW", "161 MW", "93 MW", "37 MW", "388%", "32.3%", "47%", "12 daylight hours",
    // hydro and ramp
    "105.9 MW", "55.6 hours", "100 m", "150 MW", "40 MW", "10 MWh", "50 MW", "100 MW", "120 m", "100 m³/s", "20 million m³",
    // temperatures and shares of generation
    "300 °F", "700 °F", "2,000 °F", "42%", "34%", "6%", "3%", "10 minutes", "12 hours"
  ]);
  ok(sh("cc") === "45.3" && sh("geo") === "16" && sh("pv") === "25", "share strings");
  ok((P("ct").heatRate / BTU * 100).toFixed(1) === "321.7", "the quiz distractor 321.7% is the heat rate divided the wrong way");
  ok(M.fmt1(days[0].cf * 100) + "%" === "34.7%" && M.fmt1(days[2].cf * 100) + "%" === "16.2%", "day capacity factors as printed");
  ok((776 / 200 / 24 * 100).toFixed(1) === "16.2" && Math.round(776 / 200 * 100) === 388 && (776 / 200 / 12 * 100).toFixed(1) === "32.3" && Math.round(776 / 1666 * 100) === 47, "quiz: 16.2% right; 388% (no hours), 32.3% (daylight only) and 47% (against the clear day) are the usual slips");
  const rx = /(\d[\d,]*(?:\.\d+)?)\s*(%|percent|Btu|MWh|MW|m³\/s|million m³|m\b|hours|minutes|°F|°C|K\b)/g;
  let m, n = 0;
  while ((m = rx.exec(prose))) {
    n++; const t = m[1] + (m[2] === "%" ? "" : " ") + m[2];
    const ctx = prose.slice(Math.max(0, m.index - 12), m.index + m[0].length + 4);
    const fine = allowed.has(t) || /\d+ to \d+ (percent|hours)/.test(prose.slice(m.index - 6, m.index + m[0].length)) || /^(1|20|35|2|12|6|9|0|8)\b/.test(m[1]) && /(m³|times|20 to|1 to|1 kWh|9\.81|1,000 kg)/.test(ctx);
    ok(fine, `page states "${m[0]}" (…${ctx.replace(/\s+/g, " ")}…): from the model or the data`);
  }
  ok(n >= 50, `${n} numbers with units on the page checked`);
  // the fallback table carries the key numbers, and they match the model
  const fb = (QMD.match(/<div class="lx-fallback">[\s\S]*?lx-hint/) || [""])[0];
  ["45.3", "31.1", "34.0", "about 16", "about 90", "about 26", "nearly 25", "7,535", "10,975", "10,040", "1,666 MWh", "1,411 MWh", "776 MWh", "105.9 MW", "55.6 hours", "10 MWh"].forEach(x => ok(fb.indexOf(x) >= 0, `fallback states ${x}`));
  ok((fb.match(/<tr>/g) || []).length === 12, "fallback tables: seven plants and three days (plus two header rows)");
  // the script's text never hard-codes a model number
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]).join("\n");
  ok(!/\b(45\.3|31\.1|34\.0|1,666|1,411|776|105\.9|55\.6)\b/.test(lits), "the script's strings never hard-code a model number");
  // facts table
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  ok((facts.match(/<tr>/g) || []).length - 1 === 6 && /epa_08_02/.test(facts) && /id=45956/.test(facts) && /how-electricity-is-generated/.test(facts), "facts table: six rows with their EIA sources");
  ok(D.facts.shares2022.steam === 42 && D.facts.shares2022.cc === 34 && D.facts.shares2022.wind === 10 && D.facts.shares2022.hydro === 6 && D.facts.shares2022.pv === 3, "2022 shares by turbine type (EIA)");
  ok(D.facts.startup.hydroMin === 10 && D.facts.startup.ccLoH === 1 && D.facts.startup.ccHiH === 12, "start-up times (EIA, 2020)");
}

// ---------------- the approved excerpt E1, word for word against the approved wording
{
  const E1 = "From the course author's research: a wind turbine's real power curve is a band, not a line. Adding the turbine's theoretical curve to about two hundred measurements can narrow that band, but whether it helps depends on how the fit is scored.";
  const ex = QMD.match(/<blockquote class="lx-excerpt" data-source="excerpt:uq-mfgpr"><p>([\s\S]*?)<\/p><\/blockquote>/);
  ok(ex && ex[1].startsWith(E1) && /href="https:\/\/doi\.org\/10\.1115\/detc2023-114762"/.test(ex[1]), "the approved excerpt E1, word for word, with its DOI");
  ok((QMD.match(/lx-excerpt/g) || []).length === 1 && !/excerpt:solar-hydrogen/.test(QMD), "one excerpt only; E4 (solar-hydrogen) is not used");
  const RP = PRIV.path("excerpts");
  if (RP) {
    const reg = fs.readFileSync(RP, "utf8");
    const sec = reg.slice(reg.indexOf("## E1."), reg.indexOf("## E2."));
    ok(sec.indexOf("> " + E1 + " ([Li et al., ASME IDETC 2023](https://doi.org/10.1115/detc2023-114762))") >= 0, "the approved E1 is the sentence on the page, word for word");
  } else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); E1 checked against the copy in this test");
  // no other sentence about the author's research
  const own = QMD.replace(/<blockquote class="lx-excerpt"[\s\S]*?<\/blockquote>/, "").replace(/<!--[\s\S]*?-->/g, "");
  ok(!/course author|my study|my research|our study/i.test(own + JS), "no other sentence about the course author's research");
}

// ---------------- page structure, path.yml and step budgets
{
  const fm = QMD.match(/^---\n([\s\S]*?)\n---/)[1];
  const blk = PATH.slice(PATH.indexOf("id: f04-power-plants"), PATH.indexOf("id: f05-nuclear-basics"));
  const sub = (blk.match(/subtitle: "([^"]+)"/) || [])[1];
  ok(sub && fm.indexOf('subtitle: "' + sub + '"') >= 0, "front-matter subtitle = path.yml subtitle");
  ok(/code: F4/.test(blk) && /minutes: 20/.test(blk) && /practice_minutes: 10/.test(blk) && /status: active/.test(blk) && /after: \[5\]/.test(blk) && /next: F5/.test(blk), "path.yml: F4, 20 + 10 min, active, after lesson 5, next F5");
  ok(/data-learn="power-plants"/.test(QMD) && /LX\.mount\("power-plants"/.test(JS) && /id="f4-explain"/.test(QMD), "mount points match");
  ok(QMD.indexOf('f03-energy-services.js') < 0 && QMD.indexOf('learn.js" defer') > 0 && QMD.indexOf('learn.js" defer') < QMD.indexOf('f04-power-plants.js" defer'), "the page takes LX.Sankey from the bundle (learn.js, before its own script), not from F3's script");
  ok((QMD.match(/class="lx-qq"/g) || []).length === 8, "practice: four myths and four questions");
  const steps = [...JS.matchAll(/^      \{ text: "((?:[^"\\]|\\.)*)"/gm)].map(x => x[1]);
  ok(steps.length === 8, `${steps.length} step texts`);
  steps.forEach(t => { ok(words(t) <= 35 && sentences(t) <= 2, `step text within budget (${words(t)} words): "${t.slice(0, 50)}…"`); ok(t.indexOf("**") < 0, "no ** in step text"); });
  ok(/10,040 Btu/.test(steps[3]) && /full-load/.test(steps[3]) && P("coal").heatRate === 10040, "step 4 states the coal heat rate from the data, as a full-load test value");
  ok(/"1 kWh of electricity = " \+ int\(btu\) \+ " Btu \(British thermal units/.test(JS), "step 4's unit fact stands apart from its question");
  ok(/200 MW/.test(steps[4]) && D.solar.farmMW === 200 && TOWN.fleet.solar.mw === 200, "step 5: the 200 MW farm (town.json)");
  ok(/100 MW/.test(steps[5]) && D.hydro.goalMW === 100, "step 6: the 100 MW goal");
  const gl = (SIDE.match(/  - id: ([a-z0-9-]+)/g) || []).map(x => x.slice(8));
  ["turbine", "generator", "heat-engine", "waste-heat", "gas-turbine", "steam-turbine", "condenser", "hydraulic-head", "reservoir", "geothermal", "run-of-river", "hrsg", "nacelle"].forEach(id => ok(gl.indexOf(id) >= 0, `sidecar defines ${id}`));
}

// ---------------- scope: deny-list, nuclear-plus-risk sentences, data centers, links
{
  const deny = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
    /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/, /artificial intelligence/i, /ChatGPT|Claude/, /generated by/i];
  const page = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const lits = [...JS.replace(/^\s*\/\/.*$/gm, "").matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]);
  const vals = []; (function walk(o) { if (typeof o === "string") vals.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  const visible = [page.replace(/<[^>]+>/g, " ")].concat(lits, vals, SIDE.split("\n")).join("\n");
  deny.forEach(r => ok(!r.test(visible), `scope: no ${r}`));
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  const RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  const BENIGN = /merit[- ]order|orders? of magnitude|in order to/gi;
  visible.split(/(?<=[.!?])\s+|\n+/).forEach(s => { ok(!(NUC.test(s) && RISK.test(s.replace(BENIGN, ""))), `scope: nuclear term with a risk term in "${s.slice(0, 90)}"`); });
  const ownText = [QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "")].concat(lits, vals).join("\n");
  ok(!NUC.test(ownText), "F4's own text names no nuclear technology; fission appears only as a heat source pointing to F5 (the generated next box carries F5's title)");
  ok(!/data[- ]cent/i.test(visible), "F4 mentions no data centers");
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
  const ALLOW = /^(https:\/\/(www\.|docs\.)?(eia\.gov|energy\.gov|nlr\.gov|doi\.org)\/|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  let nl = 0;
  for (const h of own.matchAll(/href="([^"]+)"|\]\(([^)]+)\)/g)) { const u = (h[1] || h[2]).replace(/&amp;/g, "&"); nl++; ok(ALLOW.test(u), `link on the allow-list: ${u}`); if (/^[0-9a-z-]+\.html/.test(u)) ok(fs.existsSync(path.join(SITE, "learn", u.replace(/\.html.*$/, ".qmd"))), `internal link ${u} is a live page`); }
  ok(nl >= 25, `${nl} links checked`);
  ok(/LX\.lessonRefHTML\(data\.path, "F5"\)/.test(JS) && /data\/path\.json/.test((QMD.match(/data-learn="power-plants"[^>]*/) || [""])[0]), "F5 is linked through path.json (LX.lessonRefHTML)");
  ok(!/\bF3\b/.test(own.replace(/<!--[\s\S]*?-->/g, "")), "the page makes no static claim about F3's status");
}

// ---------------- each stated number with its claim, against the model
{
  const strip = h => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const fb = (QMD.match(/<div class="lx-fallback">[\s\S]*?lx-hint/) || [""])[0];
  ["cc", "ct", "coal"].forEach(k => ok(fb.indexOf(`<td>${M.shareText(P(k), BTU)} (heat rate ${fmt(P(k).heatRate)} Btu per kWh)</td>`) >= 0, `fallback: ${k}'s share and heat rate in one cell`));
  const days = M.solarDays(Y, D), dm = d => +d.date.slice(8) + " September 2025";
  days.forEach(d => ok(new RegExp(`<tr><td>${d.label}, ${dm(d)}</td><td>${fmt(d.energy)} MWh</td><td>${M.fmt1(d.cf * 100)}%</td><td>${d.peak} MW`).test(fb), `fallback row ${d.key}: label, energy, capacity factor and peak`));
  ok(fb.indexOf(`(it fell ${days[1].drop.mw} MW into ${M.hh(days[1].drop.hour)})`) >= 0, "fallback: the afternoon dip's fall and hour");
  ok(days.map(d => d.label).join() === "High output,Afternoon dip,Low output" && !/cloud|overcast|clear/i.test(days.map(d => d.label + d.note).join()), "the days are named by their output, not a weather cause");
  const h = D.hydro, need = M.gasNeed(TOWN, Y), R = D.ramp, base = { from: R.from, to: R.to, ccStart: R.ccStart, ccMax: TOWN.fleet.cc.mw, pkMax: TOWN.fleet.peaker.mw };
  const r40 = M.rampRun(need, Object.assign({ ramp: TOWN.fleet.cc.ramp, peaker: false }, base));
  ok(fb.indexOf(`head of 120 m and a flow of 100 m³/s: ${M.hydroMW(120, 100, h).toFixed(1)} MW`) >= 0 && fb.indexOf(`lasts ${M.reservoirHours(h.volumeM3, 100).toFixed(1)} hours at that flow`) >= 0, "fallback hydro: power and hours from the model");
  ok(fb.indexOf(`can add ${TOWN.fleet.cc.ramp} MW per hour falls ${r40.tot.short} MWh short at ${M.hh(r40.tot.firstShort)}`) >= 0 && fb.indexOf(`or ${M.rampNeeded(need, Object.assign({ rampMin: R.rampMin, rampMax: R.rampMax, rampStep: R.rampStep }, base))} MW per hour, closes the gap`) >= 0, "fallback ramp: 10 MWh short at 18:00, 50 MW per hour closes it");
  const ans = id => strip((QMD.match(new RegExp(`data-id="${id}"[\\s\\S]*?<details class="lx-answer"><summary>Answer</summary><p>([\\s\\S]*?)</p>`)) || [])[1] || "");
  ok(ans("all").indexOf(`about ${M.shareText(P("cc"), BTU)}% for U.S. combined-cycle gas plants and ${M.shareText(P("coal"), BTU)}% for coal`) >= 0 && /full-load/.test(ans("all")), "myth 1: full-load shares from the model");
  ok(ans("peaker").indexOf(`about ${M.shareText(P("ct"), BTU)}% of its fuel energy to the wire and a combined cycle about ${M.shareText(P("cc"), BTU)}%`) >= 0 && /At full load/.test(ans("peaker")), "myth 4: peaker and combined cycle at full load");
  ok(ans("dam").indexOf(`with no inflow, the lesson's 20 million m³ last ${M.reservoirHours(h.volumeM3, 100).toFixed(1)} hours at 100 m³/s`) >= 0, "myth 3: hours from the model, with no inflow");
  ok(ans("hr").indexOf(`${M.shareText(P("ct"), BTU)}%: 3,412 ÷ ${fmt(P("ct").heatRate)} = ${(BTU / P("ct").heatRate).toFixed(3)}. The other ${M.fmt1(M.lost(P("ct"), BTU))}%`) >= 0, "quiz 1: the peaker's share and loss");
  ok(ans("cf").indexOf(`${M.fmt1(days[2].cf * 100)}%: ${days[2].energy} ÷ (${D.solar.farmMW} × 24)`) >= 0 && ans("cf").indexOf(`reached ${M.fmt1(days[0].cf * 100)}%`) >= 0, "quiz 3: the low-output day's capacity factor, and the high-output day's");
  const dd = (QMD.match(/<dl class="lx-ideas">[\s\S]*?<\/dl>/) || [""])[0];
  ok(strip(dd).indexOf(`send about ${M.shareText(P("cc"), BTU)} of every 100 units of fuel energy to the wire, coal steam plants ${M.shareText(P("coal"), BTU)}`) >= 0 && strip(dd).indexOf(`made ${fmt(days[2].energy)} MWh on 5 September 2025 and ${fmt(days[0].energy)} MWh on 11 September`) >= 0, "explain fallback: shares and the two days from the model");
  ok(!/(sent|averaged) 45\.3|in 2025, U\.S\. combined/.test(QMD), "no annual-operation wording for a full-load test value");
  // the feedback sentences carry the model's numbers
  D.plants.forEach(p => ok(M.plantNote(p, D).indexOf(M.shareText(p, BTU) + " of 100 units") >= 0, `plant note ${p.key} states its share`));
  ok(/leave the module as direct current/.test(M.plantNote(P("pv"), D)) && !/reach the wire/.test(M.plantNote(P("pv"), D)), "solar's note: DC at the module, not the wire");
  ok(/At some lower speeds, NREL's test turbine converted a larger share, up to 52%, while making less power/.test(M.plantNote(P("wind"), D)) && D.facts.cpBest.value === 0.52, "wind's note: a larger share at some lower speeds, less power");
  ok(M.dayText(days).indexOf(`**${fmt(days[2].energy)} MWh**, ${Math.round(days[2].energy / days[0].energy * 100)}% of the high-output day's ${fmt(days[0].energy)} MWh`) >= 0 && /cannot show the cause/.test(M.dayText(days)) && !/Clouds, not the panels/.test(JS), "day feedback: 776 MWh, 47%, no causal claim");
}

// ---------------- the text budget of every text element, not only the step prompts
{
  const strip = h => h.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  // a data note's bold label ("Real data, solar days.") and an answer's "Myth." or "Fact." are labels, not sentences
  const notes = [...QMD.matchAll(/<p class="lx-datanote">([\s\S]*?)<\/p>/g)].map(m => strip(m[1].replace(/<b>[^<]*<\/b>/, "")));
  ok(notes.length === 4, `${notes.length} data notes (thermal and solar provenance apart)`);
  notes.forEach(n => ok(words(n) <= 35 && sentences(n) <= 2, `data note within budget (${words(n)} words): ${n.slice(0, 50)}…`));
  const hint = strip((QMD.match(/<p class="lx-hint">With JavaScript on[\s\S]*?<\/p>/) || [""])[0]);
  ok(hint && words(hint) <= 20, `fallback hint is one short instruction (${words(hint)} words)`);
  [...QMD.matchAll(/<details class="lx-answer"><summary>Answer<\/summary><p>([\s\S]*?)<\/p>/g)].map(m => strip(m[1]).replace(/^(Myth|Fact)\. /, "")).forEach(a => ok(words(a) <= 40 && sentences(a) <= 2, `answer within budget (${words(a)} words): ${a.slice(0, 50)}…`));
  [...QMD.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(m => strip(m[1])).forEach(a => ok(words(a) <= 40 && sentences(a) <= 2, `explain idea within budget (${words(a)} words): ${a.slice(0, 50)}…`));
  const fbx = [];
  D.plants.forEach(p => fbx.push(strip(M.plantNote(p, D))));
  D.predict.options.forEach(o => fbx.push(M.predictText(o.value, D)));
  fbx.push(M.compareText(["cc", "geo", "pv"], D), M.dayText(M.solarDays(Y, D)));
  [...JS.matchAll(/api\.saw\("((?:[^"\\]|\\.)*)"/g)].forEach(m => fbx.push(m[1]));
  fbx.forEach(t => ok(words(t) <= 40 && sentences(t) <= 2, `feedback within budget (${words(t)} words): ${t.slice(0, 60)}…`));
  ok(fbx.length >= 15, `${fbx.length} feedback texts checked`);
}

// ---------------- the rendered page (only when _site holds a render newer than the source; run after quarto render)
{
  const html = path.join(SITE, "_site/learn/f04-power-plants.html");
  if (fs.existsSync(html) && fs.statSync(html).mtimeMs >= fs.statSync(path.join(SITE, "learn/f04-power-plants.qmd")).mtimeMs) {
    const Hh = fs.readFileSync(html, "utf8");
    ["45.3 (heat rate 7,535 Btu per kWh)", "1,666 MWh", "776 MWh", "105.9 MW", "55.6 hours", "10 MWh short at 18:00"].forEach(s => ok(Hh.indexOf(s) >= 0, `rendered page states "${s}"`));
    ok(/data-learn="power-plants"/.test(Hh) && /id="f4-explain"/.test(Hh) && (Hh.match(/class="lx-qq"/g) || []).length === 8 && /lx-excerpt/.test(Hh), "rendered page: mount points, practice items and the excerpt");
    ok(!/\[\[[a-z0-9-]+\|/.test(Hh.replace(/<script[\s\S]*?<\/script>/g, "")), "rendered page: no raw glossary marks");
  } else console.log("note: rendered page not checked (no _site render newer than the source)");
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
