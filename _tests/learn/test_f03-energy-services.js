// test_f03-energy-services.js — Node tests for F3 (assets/learn/f03-energy-services.js), its data
// (assets/learn/data/f03-energy-services.json), the lesson-local Sankey layout, and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_f03-energy-services.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
const M = require(path.join(SITE, "assets/learn/f03-energy-services.js"));
const D = JSON.parse(rd("assets/learn/data/f03-energy-services.json"));
const P4 = JSON.parse(rd("assets/learn/data/f04-power-plants.json"));
const P6 = JSON.parse(rd("assets/learn/data/f06-grid-and-outages.json"));
const QMD = rd("learn/f03-energy-services.qmd");
const JS = rd("assets/learn/f03-energy-services.js");
const PATH = rd("learn/path.yml");
const PJ = JSON.parse(rd("assets/learn/data/path.json"));
const CORE = require(path.join(SITE, "assets/learn/components/core.js"));

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const sentences = s => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;
const words = s => s.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
const f = v => Math.round(v).toLocaleString("en-US");

// Two kinds of check below. Source consistency: the page, the script and the data say the same thing (strings, tables,
// links). Model validation: every stated quantity is recomputed from its inputs (RECS million Btu, EPA miles and mpg, the
// efficiencies, the heat pump model), and every claim about the model's behaviour is proved on the model as built.

// ---------------- the Sankey layout (lesson-local component, also used by F4)
{
  const spec = { nodes: [{ id: "a", col: 0 }, { id: "b", col: 0 }, { id: "x", col: 1 }, { id: "y", col: 1 }, { id: "u", col: 2 }, { id: "l", col: 2, kind: "loss" }],
    links: [{ from: "a", to: "x", value: 60 }, { from: "b", to: "x", value: 20 }, { from: "b", to: "y", value: 20 }, { from: "x", to: "u", value: 50 }, { from: "x", to: "l", value: 30 }, { from: "y", to: "u", value: 20 }, { from: "a", to: "y", value: 0 }] };
  const L = M.sankey.layout(spec, 600, 300, { gap: 10 });
  ok(L.cols === 3 && L.links.length === 6, "layout: three columns; a zero link is dropped from the drawing");
  ok(near(L.nodes.x.v, 80) && near(L.nodes.u.v, 70) && near(L.nodes.a.v, 60), "layout: a node's value is the larger of in and out");
  L.links.forEach(l => ok(near(l.w, l.value * L.k), `layout: band ${l.key} keeps its value (w = value × k)`));
  ["a", "b", "x", "y", "u", "l"].forEach(id => {
    const n = L.nodes[id], out = L.links.filter(l => l.from === id), inn = L.links.filter(l => l.to === id);
    if (out.length) ok(near(out.reduce((s, l) => s + l.w, 0), n.h, 1e-6) && near(Math.min(...out.map(l => l.sy)), n.y, 1e-6), `layout: bands out of ${id} fill its bar from the top`);
    if (inn.length) ok(near(Math.max(...inn.map(l => l.ty + l.w)), n.y + n.h, 1e-6) || inn.reduce((s, l) => s + l.w, 0) < n.h, `layout: bands into ${id} stay inside its bar`);
  });
  ok(L.byCol.every(ids => ids.reduce((s, id) => s + L.nodes[id].h, 0) + 10 * (ids.length - 1) <= 300 - 4 + 1e-6), "layout: every column fits the height");
  const F = M.sankey.flows(spec);
  ok(F.x.vin === 80 && F.x.vout === 80 && F.u.vin === 70, "flows: in and out per node (a pass-through balances)");
  ok(/^M[\d.]+ [\d.]+C/.test(M.sankey.band(0, 0, 100, 50, 10)) && /Z$/.test(M.sankey.band(0, 0, 100, 50, 10)), "band: a closed ribbon path");
  let threw = false; try { M.sankey.layout({ nodes: [{ id: "a" }], links: [{ from: "a", to: "zz", value: 1 }] }, 100, 100); } catch (e) { threw = true; }
  ok(threw, "layout: a link to an unknown node throws");
}

// ---------------- model validation: the home's year, recomputed from the sources
const btu = D.units.btuPerKWh, B = M.bought(D), S0 = M.split(D, {}), SH = M.split(D, { heatPump: true });
const T0 = M.totals(D, {}), T1 = M.totals(D, { car: true }), T2 = M.totals(D, { car: true, heatPump: true });
{
  ok(btu === 3412 && D.units.btuPerGallon === 120214 && /3,412 Btu/.test(D.sources.eia_btu.where) && /120,214 Btu/.test(D.sources.eia_btu.where), "EIA conversion factors: 3,412 Btu per kWh, 120,214 Btu per gallon");
  const W = D.sources.recs_ce46.where;
  const want = { warmth: ["gas", 57.6, "space heating 57.6"], water: ["gas", 17.4, "water heating 17.4"], cool: ["el", 5.9, "air conditioning 5.9"] };
  Object.keys(want).forEach(k => { const s = D.services.find(x => x.key === k); ok(s.mmbtu[want[k][0]] === want[k][1] && W.indexOf(want[k][2]) >= 0, `${k}: ${want[k][1]} million Btu, as RECS CE4.6 (West North Central)`); });
  const kit = D.services.find(x => x.key === "kitchen"), dev = D.services.find(x => x.key === "devices");
  ok(kit.mmbtu.el === 3.0 && kit.mmbtu.gas === 3.8 && /refrigerators 3\.0/.test(W) && /other 3\.8/.test(W) && dev.mmbtu.el === 18.5 && /other 18\.5/.test(W), "kitchen (refrigerators 3.0, other gas 3.8) and devices (other electricity 18.5) as RECS CE4.6");
  // each flow: million Btu -> kWh, rounded to the nearest 100
  D.services.forEach(s => { if (s.car) return; Object.keys(s.mmbtu).forEach(k => ok(B[s.key][k] === Math.round(s.mmbtu[k] * 1e6 / btu / 100) * 100, `${s.key}.${k}: ${s.mmbtu[k]} million Btu = ${f(s.mmbtu[k] * 1e6 / btu)} kWh -> ${f(B[s.key][k])}`)); });
  const C = M.car(D);
  ok(near(C.gallons, 10917 / 22.8) && near(C.kwh, 10917 / 22.8 * 120214 / 3412) && B.mobility.gasoline === 16900, `car: 10,917 miles ÷ 22.8 mpg = ${C.gallons.toFixed(1)} gallons = ${f(C.kwh)} kWh -> 16,900`);
  ok(/22\.8 miles per gallon/.test(D.sources.epa_vehicle.where) && /10,917 miles per year/.test(D.sources.epa_vehicle.where), "car: EPA's 22.8 mpg and 10,917 miles (2022 data)");
  ok(Math.abs(C.kwh - M.kwhOf(D, 57.6)) / M.kwhOf(D, 57.6) < 0.01, "claim 'about as much as the furnace': the car's gasoline is within 1% of the furnace's gas");
  // useful and lost: rounded useful, and lost = bought − useful, so every split adds up
  [["warmth", "furnace"], ["water", "waterheater"], ["mobility", "car"]].forEach(([k, e]) => {
    const r = S0[k], eff = D.efficiency[e].value;
    ok(r.useful === Math.round(r.total * eff / 100) * 100 && r.useful + r.lost === r.total, `${k}: useful ${f(r.useful)} + lost ${f(r.lost)} = ${f(r.total)} at ${eff * 100}%`);
  });
  ok(D.efficiency.furnace.value === 0.8 && /80%-83%/.test(D.sources.doe_furnace.where), "furnace 80%: inside DOE's 80% to 83% for mid-efficiency furnaces");
  ok(D.efficiency.waterheater.value === 0.6 && /about 0\.60/.test(D.sources.doe_waterheater.where), "water heater about 60%: DOE's typical Energy Factor of about 0.60");
  ok(D.efficiency.car.value === 0.3 && /about 30% for a conventional gasoline vehicle/.test(D.sources.doe_fotw1360.where), "car about 30%: DOE FOTW #1360");
  ok(["cool", "kitchen", "devices"].every(k => S0[k].useful == null), "cooling, kitchen and devices are not split into useful and lost");
  // totals are sums of rounded flows
  ok(T0.gas === 23100 && T0.el === 8000 && T0.home === 31100 && T0.bought === 31100, `home: gas ${f(T0.gas)} + electricity ${f(T0.el)} = ${f(T0.home)} kWh`);
  ok(T1.bought === 48000 && T1.useful === 21700 && T1.lost === 17200 && T1.notSplit === 9100 && T1.useful + T1.lost + T1.notSplit === T1.bought, "home and car: 48,000 = 21,700 useful + 17,200 lost + 9,100 not split");
  // the heat pump: the same useful heat, the DOE challenge's seasonal COP
  const sc = M.seasonCOP(D);
  ok(near(sc, 8.5 * 1000 / 3412) && sc.toFixed(1) === "2.5" && /HSPF2 of 8\.5/.test(D.sources.doe_cchp.where), `seasonal COP = HSPF2 8.5 ÷ 3.412 = ${sc.toFixed(3)}`);
  ok(SH.warmth.useful === S0.warmth.useful && SH.warmth.bought.el === Math.round(S0.warmth.useful / sc / 100) * 100 && SH.warmth.bought.el + SH.warmth.air === SH.warmth.useful && SH.warmth.lost === 0,
    `heat pump: the same ${f(SH.warmth.useful)} kWh of heat from ${f(SH.warmth.bought.el)} kWh of electricity plus ${f(SH.warmth.air)} kWh of outdoor heat`);
  ok(T2.gas === 6200 && T2.el === 13400 && T2.air === 8100 && T2.bought === 36500 && T2.useful === T1.useful, "heat pump: gas 6,200, electricity 13,400, outdoor heat 8,100, bought 36,500, same useful energy");
  // the share of space heating, nationally (RECS CE3.1) and in this home
  ok(/space heating 4,026 trillion Btu \(42%\)/.test(D.sources.recs_ce31.where) && Math.round(4026 / 9481 * 100) === 42, "RECS CE3.1: 4,026 ÷ 9,481 = 42%");
  ok(Math.round(S0.warmth.total / T0.home * 100) === 54 && D.predict.answer === "warmth" && D.services.filter(s => !s.car).every(s => S0[s.key].total <= S0.warmth.total), "predict: warmth is the home's largest service (54%)");
  // the Sankey specs balance: every service passes on exactly what it takes in
  [{ car: false }, { car: true }, { car: true, view: "useful" }, { car: true, heatPump: true, view: "useful" }].forEach(o => {
    const sp = M.spec(D, o), Fl = M.sankey.flows(sp);
    D.services.forEach(s => { if (s.car && !o.car) return; if (o.view === "useful") ok(Fl[s.key].vin === Fl[s.key].vout, `spec ${JSON.stringify(o)}: ${s.key} passes on what it takes in (${Fl[s.key].vin})`); });
    const srcSum = sp.nodes.filter(n => n.col === 0).reduce((t, n) => t + Fl[n.id].vout, 0);
    ok(srcSum === (o.heatPump ? T2.bought + T2.air : o.car ? T1.bought : T0.bought), `spec ${JSON.stringify(o)}: the carriers add up to ${srcSum} kWh`);
  });
  ok(M.spec(D, { car: true, heatPump: true }).nodes.filter(n => n.col === 0).map(n => n.id).join() === "air,el,gas,gasoline", "heat pump view: outdoor air and electricity on top, next to warmth");
}

// ---------------- model validation: the cold day (illustrative), and every claim about its behaviour
{
  const h = D.heatpump;
  ok(near(M.cop(D, h.anchorC), 2.4) && h.anchorCOP === 2.4 && /COP at 5°F \(-15°C\) of 2\.4/.test(D.sources.doe_cchp.where), "COP 2.4 at −15 °C: DOE's challenge target (Table II-2)");
  ok(near(h.anchorCOP * (h.supplyC - h.anchorC), 144) && near(M.cop(D, 0), 144 / 45), "COP = 144 ÷ (45 − T)");
  ok(h.cutoutC === -23 && /cut-out no higher than -10°F \(-23°C\)/.test(D.sources.doe_cchp.where) && M.cop(D, -23) > 2 && M.cop(D, -24) === 1, "cut-out: the compressor runs at −23 °C (COP 2.12) and the backup heater below it (COP 1): the jump is in the model");
  // "COP falls as it gets colder": strictly increasing in T over the compressor's range
  for (let T = h.cutoutC; T < D.day.max; T++) ok(M.cop(D, T) < M.cop(D, T + 1), `COP rises from ${T} to ${T + 1} °C`);
  // "electricity climbs faster than the heat need" holds above the cut-out (and across it, where COP drops to 1); below
  // the cut-out both days run the backup heater at COP 1, so electricity grows exactly in step with heat
  for (let a = D.day.min; a <= D.day.max; a++) for (let b = a + 1; b <= D.day.max; b++) {
    const da = M.day(D, a), db = M.day(D, b);
    if (!db.backup) ok(da.el / db.el > da.Q / db.Q + 1e-9, `electricity grows strictly faster than heat from ${b} to ${a} °C (the warmer day runs the heat pump)`);
    else ok(da.backup && near(da.el / db.el, da.Q / db.Q, 1e-12), `below the cut-out, ${b} to ${a} °C: electricity grows in step with heat (COP 1 both days)`);
  }
  ok(M.day(D, h.cutoutC - 1).backup && !M.day(D, h.cutoutC).backup, "the backup heater runs only below the cut-out");
  const d5 = M.day(D, 5), d15 = M.day(D, -15);
  ok(d5.Q === 65 && d15.Q === 165 && (d15.Q / d5.Q).toFixed(1) === "2.5" && (d15.el / d5.el).toFixed(1) === "3.8", `5 → −15 °C: heat ×${(d15.Q / d5.Q).toFixed(2)}, electricity ×${(d15.el / d5.el).toFixed(2)}`);
  ok(near(M.day(D, -10).gas, 175) && near(d15.el + d15.air, d15.Q), "furnace gas = heat ÷ 0.80; heat pump: electricity + outdoor heat = heat");
  ok(M.day(D, 25).Q === 0 && M.day(D, 25).el === 0, "no heat need above 18 °C");
  // "a model that uses one average temperature underestimates the coldest days": E(T) is convex above the cut-out
  // (E = 5 (18 − T)(45 − T) / 144, a parabola opening upward), so the average of two days' electricity exceeds the
  // electricity at their average temperature
  for (let a = h.cutoutC; a <= 16; a++) for (let b = a + 2; b <= 18; b += 2) { const m = (a + b) / 2; ok((M.day(D, a).el + M.day(D, b).el) / 2 > M.day(D, m).el, `convex: days at ${a} and ${b} °C use more on average than one day at ${m} °C`); }
  ok(D.apply.answer === 90 / 3.0 && /90 ÷ 3\.0 = 30 kWh/.test(D.apply.why) && /other 60 kWh/.test(D.apply.why), "apply: 90 ÷ 3.0 = 30 kWh, 60 kWh from the air");
  // the no-JS cold-day table
  const tb = QMD.match(/The heat pump on a cold day[\s\S]*?<\/table>/)[0];
  [15, 5, -5, -15, -25].forEach(T => {
    const r = M.day(D, T), lbl = (T < 0 ? "−" : "") + Math.abs(T) + " °C";
    const re = new RegExp("<tr><td>" + lbl + "(?:(?!</td>).)*</td><td>" + r.cop.toFixed(2) + "</td><td>" + f(r.Q) + " kWh</td><td>" + f(r.el) + " kWh</td></tr>");
    ok(re.test(tb), `no-JS table, ${lbl}: COP ${r.cop.toFixed(2)}, ${f(r.Q)} kWh heat, ${f(r.el)} kWh electricity`);
  });
  ok(/COP falls from 3\.60 to 2\.40/.test(QMD) && /rises 2\.5 times, but the electricity 3\.8 times/.test(QMD), "explain fallback: 3.60 to 2.40, ×2.5 heat and ×3.8 electricity");
  // the cold-snap question holds only above the cut-out, and says so
  const snap = QMD.match(/data-id="snap"[\s\S]*?<\/div>/)[0];
  ok(/the day stays above the heat pump's cut-out/.test(snap) && /Below the cut-out, the backup heater's COP stays at 1/.test(snap), "snap question: above the cut-out; the answer names the COP-1 case");
  // the causal chain claims daily electricity only: no peak from daily data
  ok(!/set the peak/.test(JS) && /Cold days raise electricity demand/.test(JS) && /needs hourly data/.test(JS), "causal chain: daily electricity, and the peak needs hourly data");
}

// ---------------- the Go deeper box on primary energy (F4's heat rate, F6's losses)
{
  const P = M.primary(D, P4, P6);
  ok(P.heatRate === 7535 && P.lossPct === 5 && P.el === 5400, "primary: F4's combined-cycle heat rate 7,535 Btu/kWh and F6's 5% losses");
  ok(Math.round(P.sent / 100) * 100 === 5700 && Math.round(5700 * 7535 / 3412 / 100) * 100 === 12600, "primary: 5,400 ÷ 0.95 = 5,700 kWh sent out; 5,700 × 7,535 ÷ 3,412 = 12,600 kWh of gas (both lines of the box)");
  ok(Math.round(P.gas / 100) * 100 === 12600 && Math.round(P.cut * 100) === 26 && P.furnaceGas === 16900, `primary: ${f(P.gas)} kWh of gas at the plant, ${Math.round(P.cut * 100)}% less than the furnace's 16,900`);
  const box = QMD.match(/Primary energy: count the power plant too[\s\S]*?<\/details>/)[0];
  ["5{,}400", "1 - 0.05", "5{,}700", "7{,}535", "3{,}412", "12{,}600", "about 12,600 kWh", "16,900 kWh", "about 26% less gas", "EIA's 2025 full-load test heat rate, 7,535 Btu of gas per kWh", "about 5%", "U.S. average for 2018–2022"].forEach(s => ok(box.indexOf(s) >= 0, `primary box states "${s}"`));
  ok(/f04-power-plants\.html/.test(box) && /f06-grid-and-outages\.html/.test(box) && /eia\.gov\/tools\/faqs\/faq\.php\?id=105/.test(box), "primary box links F4, F6 (both live) and EIA's loss estimate");
  ok(P6.losses.real_years === "2018 through 2022" && /2018 to 2022 data/.test(P6.sources.losses.as_of) && /epa_08_02/.test(P4.sources.eia_t82.url) && /full load/.test(P4.sources.eia_t82.where), "primary box's dates: EIA losses 2018-2022 (F6's data), heat rate at full load (F4's data)");
  ok(!/primary energy\]\{[^}]*\} is larger/.test(box) && /For electricity from a gas plant, more fuel energy enters the plant than electrical energy reaches the home/.test(box), "primary energy: no universal 'larger' claim, the gas-plant case only");
  const md = QMD.match(/From services to demand[\s\S]*?<\/details>/)[0];
  ok(!/carnot|kelvin|318\.15/i.test(md) && !/carnot|kelvin/i.test(JSON.stringify(D.heatpump)), "Modeler box and data: no device thermodynamics (no Carnot derivation; the depth budget stops at D2)");
  ok(/2\.4 × 60 = 144/.test(md) && near(D.heatpump.anchorCOP * (D.heatpump.supplyC - D.heatpump.anchorC), 144) && /chosen number, not physics/.test(md), "Modeler box: 144 is the chosen curve through COP 2.4 at −15 °C");
  ok(/COP at or above the −23 °C cut-out \| 144 ÷ \(45 − \$T\$\): 3\.60 at 5 °C, 2\.40 at −15 °C/.test(md) && /COP below the cut-out \| 1:/.test(md) && M.cop(D, 5).toFixed(2) === "3.60", "Modeler box: the piecewise COP rule, with its domain");
  ok((md.match(/\$\$/g) || []).length === 0 && /Above the cut-out, \$E\(T\)\$ grows faster/.test(md) && /below it, \$E\$ grows in step with \$Q\$/.test(md), "Modeler box: a short preview (no display equations); the growth claim carries its domain");
}

// ---------------- every number with a unit on the page comes from the model or the data
{
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/https?:\/\/[^\s"')]+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ");
  const prose = strip(QMD);
  const allowed = new Set();
  const add = (v, u) => allowed.add(f(v) + " " + u);
  // flows and totals of the model
  D.services.forEach(s => { Object.values(B[s.key]).forEach(v => add(v, "kWh")); [S0[s.key].total, S0[s.key].useful, S0[s.key].lost].forEach(v => v != null && add(v, "kWh")); });
  [T0, T1, T2].forEach(t => ["gas", "el", "gasoline", "air", "bought", "useful", "lost", "notSplit", "home"].forEach(k => add(t[k], "kWh")));
  [SH.warmth.useful, SH.warmth.bought.el, SH.warmth.air].forEach(v => add(v, "kWh"));
  [15, 5, -5, -15, -25].forEach(T => { const r = M.day(D, T); add(r.Q, "kWh"); add(r.el, "kWh"); });
  const P = M.primary(D, P4, P6); add(Math.round(P.gas / 100) * 100, "kWh");
  // the practice questions' own arithmetic: 20,000 × 0.80, the 20% left; 10,000 ÷ 2.5, the rest from the air
  [20000, 20000 * 0.8, 20000 * 0.2, 20000 / 0.8, 10000, 10000 / 2.5, 10000 - 10000 / 2.5, 7500].forEach(v => add(v, "kWh"));
  ["1 kWh", "2.4 kWh"].forEach(s => allowed.add(s));   // "1 kWh of electricity delivers 2.4 kWh of heat" at COP 2.4
  allowed.add(D.day.kWhPerDegreeDay + " kWh");          // the Modeler box: "5 kWh for each °C the day is below 18 °C"
  // sourced numbers
  ["22.8 mpg", "57.6 million Btu", "3,412 Btu", "7,535 Btu", "4,026 trillion Btu", "9,481 trillion Btu"].forEach(s => allowed.add(s));
  ["42%", "80%", "60%", "30%", "26%", "5%", "45%", "54%", "87%", "91%"].forEach(s => allowed.add(s));   // 87%–91%: FOTW #1360's title
  ["15 °C", "5 °C", "−5 °C", "−15 °C", "−25 °C", "−23 °C", "18 °C", "45 °C", "20 °C", "5 °F"].forEach(s => allowed.add(s));
  ["10,917 miles", "22.8 miles"].forEach(s => allowed.add(s));   // "22.8 miles per gallon"
  const rx = /(−?\d[\d,]*(?:\.\d+)?)\s*(kWh|million Btu|trillion Btu|Btu|mpg|miles|%|°C|°F)(?![\w])/g;
  let m, n = 0;
  while ((m = rx.exec(prose))) { n++; const k = m[1] + (m[2] === "%" ? "" : " ") + m[2]; ok(allowed.has(k), `page states "${m[0]}": from the model or the data`); }
  ok(n >= 60, `${n} numbers with units on the page checked`);
  // the no-JS year table equals the model, cell by cell
  const yt = QMD.match(/<table class="lx-mini-table f3-fbt">[\s\S]*?<\/table>/)[0];
  const cells = row => [...row.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(x => x[1]);
  const rows = [...yt.matchAll(/<tr><td>(?!<b>)[\s\S]*?<\/tr>/g)].map(x => cells(x[0]));
  ok(rows.length === 6, "year table: six services");
  D.services.forEach((s, i) => {
    const r = rows[i], b = B[s.key], fmt = v => v ? f(v) : "";
    ok(r[1] === fmt(b.gas) && r[2] === fmt(b.el) && r[3] === fmt(b.gasoline), `year table, ${s.label}: ${r.slice(1, 4).join(" | ")}`);
    ok(S0[s.key].useful == null ? r[4] === "not split here" : r[4].indexOf(f(S0[s.key].useful)) === 0, `year table, ${s.label}: useful "${r[4]}"`);
  });
  ok(new RegExp("<td class=\"n\">" + f(T1.gas) + "</td><td class=\"n\">" + f(T1.el) + "</td><td class=\"n\">" + f(T1.gasoline) + "</td><td>" + f(T1.useful) + " of " + f(T1.bought) + " bought").test(yt), "year table: the totals row");
  // the script's text never hard-codes a model number; it reads them from the model and the data
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]).join("\n");
  ok(!/\b(16,900|13,500|5,400|8,100|36,500|48,000|21,700|2\.40|3\.60)\b/.test(lits), "the script's strings hard-code no model number");
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  ok((facts.match(/<tr>/g) || []).length - 1 === 6 && [/eia\.gov\/consumption\/residential/, /epa\.gov\/energy/, /fotw-1360/, /bto-cchp-tech-challenge-spec/, /british-thermal-units/].every(r => r.test(facts)), "facts table: six rows, each with its primary source");
  ok(/Table II-2, p\. 6/.test(facts) && /revised March 2024/.test(facts) && /16 September 2024/.test(facts), "facts table: table, page and dates");
}

// ---------------- page structure, path.yml, step texts and the no-JS fallback
{
  const fm = QMD.match(/^---\n([\s\S]*?)\n---/)[1];
  const blk = PATH.slice(PATH.indexOf("id: f03-energy-services"), PATH.indexOf("id: f04-power-plants"));
  const sub = (blk.match(/subtitle: "([^"]+)"/) || [])[1];
  ok(sub && fm.indexOf('subtitle: "' + sub + '"') >= 0, "front-matter subtitle = path.yml subtitle");
  ok(/code: F3/.test(blk) && /minutes: 20/.test(blk) && /practice_minutes: 10/.test(blk) && /status: active/.test(blk) && /after: \[1\]/.test(blk) && /next: F4/.test(blk) && /form: cards/.test(blk), "path.yml: F3, 20 + 10 min, active, after lesson 1, next F4");
  ok(/id="f3-explain"/.test(QMD) && /data-learn="energy-services"/.test(QMD) && /LX\.mount\("energy-services"/.test(JS), "mount points match");
  ok((QMD.match(/class="lx-qq"/g) || []).length === 8, "practice: four myths and four questions");
  const steps = [...JS.matchAll(/\{ text: "((?:[^"\\]|\\.)*)"/g)].map(x => x[1]);
  ok(steps.length >= 6, `${steps.length} literal step texts`);
  steps.forEach(t => { ok(words(t) <= 40 && sentences(t) <= 2, `step text within budget (two sentences, about 35 words): "${t.slice(0, 50)}…"`); ok(t.indexOf("**") < 0, "no ** in step text"); });
  const assembled = [D.predict.q + " Lock in a guess; the next step shows the year in kWh.", D.apply.q];
  assembled.forEach(t => ok(words(t) <= 40 && sentences(t) <= 2, `assembled step text within budget: "${t.slice(0, 50)}…"`));
  // the visible data note: one short statement; the details sit in the inputs table, a short phrase per cell
  const dn = QMD.match(/<p class="lx-datanote">[\s\S]*?<span>([\s\S]*?)<\/span><\/p>/)[1].replace(/<[^>]+>/g, "");
  ok(words(dn) <= 35 && sentences(dn) <= 2, `data note within budget (${words(dn)} words)`);
  const inp = QMD.match(/<table class="lx-mini-table f3-src">[\s\S]*?<\/table>/)[0];
  const icells = [...inp.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, ""));
  ok(icells.length === 15, "inputs table: five inputs, each with real-or-illustrative and its source");
  icells.forEach(c => ok(words(c) <= 16 && sentences(c) === 1, `inputs cell within budget: "${c.slice(0, 40)}…"`));
  // every feedback text the steps can show, in every variant (verdicts "Right." and "Not quite." are not counted)
  const fbs = [M.say.tour(), M.say.place(3), M.say.useful(D), M.say.heatPump(D), M.say.furnace(D), M.say.apply(D, true), M.say.apply(D, false), M.say.guess(D, true), M.say.guess(D, false)];
  for (let r = 0; r <= D.sort.cards.length; r++) fbs.push(M.say.sort(r, D.sort.cards.length));
  [undefined].concat(D.predict.options.map(o => o.value)).forEach(p => fbs.push(M.say.year(D, p)));
  for (let T = D.day.min; T <= D.day.goal; T++) fbs.push(M.say.cold(D, T));
  fbs.forEach(t => { const u = t.replace(/^(Right|Not quite)\. /, ""); ok(words(u) <= 35 && sentences(u) <= 2, `feedback within budget (${words(u)} words): "${t.slice(0, 50)}…"`); });
  ok(/Below the −23 °C \[\[heat-pump-cut-out\|cut-out\]\] the heat pump stops pumping heat, and a backup heater runs at COP 1: 225 kWh of electricity for 225 kWh of heat\./.test(M.say.cold(D, -27)), "feedback below the cut-out: COP 1, electricity = heat");
  ok(/At −15 °C the home needs 2\.5 times the heat of a 5 °C day, but the heat pump uses 3\.8 times the electricity: COP 2\.40\./.test(M.say.cold(D, -15)), "feedback at −15 °C: ×2.5 heat, ×3.8 electricity");
  // practice answers, explain-fallback items and the explain layer's literal texts
  [...QMD.matchAll(/<details class="lx-answer"><summary>Answer<\/summary><p>([\s\S]*?)<\/p>/g)].map(x => x[1].replace(/<[^>]+>/g, "")).forEach(t => ok(words(t) <= 35 && sentences(t) <= 3, `practice answer within budget (${words(t)} words): "${t.slice(0, 40)}…"`));
  [...QMD.match(/<dl class="lx-ideas">[\s\S]*?<\/dl>/)[0].matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(x => x[1].replace(/<[^>]+>/g, "")).forEach(t => ok(words(t) <= 35 && sentences(t) <= 2, `explain item within budget: "${t.slice(0, 40)}…"`));
  [...JS.matchAll(/(?:text|caption|note): "((?:[^"\\]|\\.)*)"/g)].map(x => x[1]).filter(t => words(t) > 3).forEach(t => ok(words(t) <= 35 && sentences(t) <= 2, `explain text within budget: "${t.slice(0, 40)}…"`));
  ok(!/\bflue\b/i.test(QMD + JS) && !/Energy bought is not energy used/.test(JS), "plain words: 'exhaust vent', not 'flue'; 'not all the energy bought becomes useful'");
  ok(/Assume no duct losses/.test(QMD) && /leaves the furnace as heat/.test(rd("learn/_w1/f03-energy-services.yml")) && /assumes no duct losses/.test(QMD), "AFUE: heat leaving the furnace; the example assumes no duct losses");
  ok(/HSPF2 8\.5, is a heating-season test rating in Btu of heat per Wh of electricity: 8\.5 ÷ 3\.412 is a seasonal COP of about 2\.5/.test(QMD) && M.seasonCOP(D).toFixed(1) === "2.5", "HSPF2 explained, with its unit, as the seasonal COP 2.5");
  ok(/A different device can change how much energy you buy, which carrier you use, or both\./.test(JS), "comparison caption: a different device, not 'a better device changes the carrier'");
  D.services.forEach(s => ok(words(s.want) <= 14 && sentences(s.want) === 1 && (!s.note || sentences(s.note) <= 1), `${s.key}: one short line of what people want`));
  D.sort.cards.forEach(c => ok(sentences(c.why) === 1 && c.why.length < 90, `sort ${c.id}: a one-sentence reason`));
  ok(D.sort.cards.filter(c => c.bin === "service").length === 3 && D.sort.cards.filter(c => c.bin === "carrier").length === 3 && D.sort.cards.filter(c => c.bin === "device").length === 3, "sort: three services, three carriers, three devices");
  ok(D.guess.ticks.indexOf(D.guess.answer) >= 0 && D.guess.answer === D.efficiency.car.value * 100, "guess: the answer is a tick and equals the car's 30%");
  const fb = QMD.match(/<div class="lx-fallback">[\s\S]*?lx-hint/)[0];
  ["23,100", "8,000", "16,900", "21,700 of 48,000 bought", "13,500", "5,400", "8,100", "36,500", "COP 2.5", "2.40"].forEach(s => ok(fb.indexOf(s) >= 0, `fallback carries "${s}"`));
  // the explain fallback states the reader-independent numbers of the live layer
  ok(/Of 48,000 kWh the home and car buy, 21,700 kWh becomes/.test(QMD) && /17,200 kWh is lost; 9,100 kWh/.test(QMD), "explain fallback: bought, useful, lost and not split");
}

// ---------------- glossary marks: every id used exists
{
  const ids = new Set();
  const yml = rd("learn/glossary.yml") + "\n" + fs.readdirSync(path.join(SITE, "learn/_w1")).map(x => rd("learn/_w1/" + x)).join("\n");
  for (const m of yml.matchAll(/^\s*-? ?id: ([a-z0-9-]+)/gm)) ids.add(m[1]);
  const used = new Set([...(JS + JSON.stringify(D)).matchAll(/\[\[([a-z0-9-]+)\|/g)].map(x => x[1]).concat([...QMD.matchAll(/(?:data-term="|term=")([a-z0-9-]+)"/g)].map(x => x[1])));
  used.forEach(id => ok(ids.has(id), `glossary id "${id}" exists`));
  ["energy-service", "energy-carrier", "useful-energy", "final-energy", "primary-energy", "coefficient-of-performance", "afue", "heat-pump-cut-out"].forEach(id => ok(used.has(id), `F3 marks its own term "${id}"`));
}

// ---------------- scope: deny-list, nuclear-plus-risk combination, data centers, links on the allow-list
{
  const deny = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
    /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/, /artificial intelligence/i, /ChatGPT|Claude/, /generated by/i];
  const page = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]);
  const vals = []; (function walk(o) { if (typeof o === "string") vals.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  const visible = [page.replace(/<[^>]+>/g, " ")].concat(lits, vals).join("\n");
  deny.forEach(r => ok(!r.test(visible), `scope: no ${r}`));
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  ok(!NUC.test(visible), "F3 names no nuclear technology at all");
  ok(!/data[- ]cent/i.test(visible), "F3 names no data centers");
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
  const ALLOW = /^(https:\/\/(www\.|www1\.eere\.)?(eia\.gov|energy\.gov|epa\.gov)\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  let nl = 0;
  for (const h of own.matchAll(/href="([^"]+)"|\]\(([^)]+)\)/g)) { const u = (h[1] || h[2]).replace(/&amp;/g, "&"); nl++; ok(ALLOW.test(u), `link on the allow-list: ${u}`); }
  Object.values(D.sources).forEach(s => ok(ALLOW.test(s.url) && s.as_of && s.where && s.title, `source ${s.title.slice(0, 40)}…: URL, where and date`));
  ok(nl >= 20, `${nl} links checked`);
  // lessons named on the page: live ones linked, the rest "(upcoming)"
  for (const h of own.matchAll(/href="([0-9a-z-]+)\.html"/g)) ok(fs.existsSync(path.join(SITE, "learn", h[1] + ".qmd")), `linked lesson ${h[1]} exists`);
  ["F4", "F6", "F10", "A15", "M12"].forEach(c => ok(CORE.lessonRef(PJ, c).ready && !new RegExp(c + " \\(upcoming\\)").test(QMD), `${c} is live and linked, never called upcoming`));
}

// ---------------- the rendered page (only when _site holds a render newer than the source; run after quarto render)
{
  const html = path.join(SITE, "_site/learn/f03-energy-services.html");
  if (fs.existsSync(html) && fs.statSync(html).mtimeMs >= fs.statSync(path.join(SITE, "learn/f03-energy-services.qmd")).mtimeMs) {
    const Hm = fs.readFileSync(html, "utf8");
    ["16,900", "21,700 of 48,000 bought", "36,500 kWh", "COP 2.4", "12,600 kWh", "2.40"].forEach(s => ok(Hm.indexOf(s) >= 0, `rendered page states "${s}"`));
    ok(/data-learn="energy-services"/.test(Hm) && /id="f3-explain"/.test(Hm) && (Hm.match(/class="lx-qq"/g) || []).length === 8, "rendered page: mount points and the eight practice items");
    ok(!/\[\[[a-z0-9-]+\|/.test(Hm.replace(/<script[\s\S]*?<\/script>/g, "")), "rendered page: no raw glossary marks outside scripts");
  } else console.log("note: rendered page not checked (no _site render newer than the source)");
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
