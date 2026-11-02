// test_01-power-energy.js — Node tests for Lesson 1 (assets/learn/01-power-energy.js), its data
// (assets/learn/data/01-power-energy.json + town.json, town_year.json, town_days.json) and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_01-power-energy.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const J = p => JSON.parse(fs.readFileSync(path.join(SITE, p), "utf8"));
const M = require(path.join(SITE, "assets/learn/01-power-energy.js"));
const G0 = require(path.join(SITE, "assets/learn/grid-operator.js"));
const D = J("assets/learn/data/01-power-energy.json"), town = J("assets/learn/data/town.json");
const year = J("assets/learn/data/town_year.json"), days = J("assets/learn/data/town_days.json");
const QMD = fs.readFileSync(path.join(SITE, "learn/01-power-energy.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/01-power-energy.js"), "utf8");
const W = M.world(D, town, year, days);

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = s => QMD.indexOf(s) >= 0;
const int = v => Math.round(v).toLocaleString("en-US");
let seed = 4242;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

// ---------------- the board: energy = power x time, kept three ways (total, per appliance, per segment)
for (let trial = 0; trial < 400; trial++) {
  let m = M.newMeter(), on = {}, tSum = 0;
  for (let k = 0; k < 12; k++) {
    W.devs.forEach(d => { if (rnd() < 0.3) on[d.id] = !on[d.id]; });
    const mins = [10, 60, 10 / 12, 0.5, 7][Math.floor(rnd() * 5)], p = M.power(W.devs, on), before = m.wh;
    m = M.run(m, W.devs, on, mins); tSum += mins;
    ok(near(m.wh - before, p * mins / 60, 1e-9), `board trial ${trial}: energy added = power x time`);
  }
  ok(near(m.t, tSum, 1e-9), `board trial ${trial}: clock = sum of runs`);
  ok(near(M.logEnergy(m), m.wh, 1e-6), `board trial ${trial}: energy = sum over segments of power x duration`);
  ok(near(Object.values(m.by).reduce((a, b) => a + b, 0), m.wh, 1e-6), `board trial ${trial}: energy = sum over appliances`);
  ok(m.log.every((g, i) => i === 0 ? g.t0 === 0 : near(g.t0, m.log[i - 1].t1)), `board trial ${trial}: segments are contiguous`);
  ok(m.log.every((g, i) => i === 0 || g.ids !== m.log[i - 1].ids || g.w !== m.log[i - 1].w), `board trial ${trial}: equal neighbouring segments are merged`);
}
{ // switching off never lowers the energy; the old meter is not changed by run()
  const m0 = M.run(M.newMeter(), W.devs, { hairdryer: true }, 10), m1 = M.run(m0, W.devs, {}, 60);
  ok(m1.wh === m0.wh && M.power(W.devs, {}) === 0 && near(m0.wh, 250), "board: all off -> power 0, energy stays at 250 Wh");
  ok(m0.t === 10 && m0.log.length === 1, "board: run() leaves the earlier meter unchanged");
  // the animation runs 12 slices; it must give the same totals as one run
  let a = M.newMeter(); for (let k = 0; k < 12; k++) a = M.run(a, W.devs, { hairdryer: true }, 10 / 12);
  ok(near(a.wh, 250, 1e-9) && a.log.length === 1 && near(a.t, 10, 1e-9), "board: 12 animation slices = one 10-minute run");
}

// ---------------- the prediction (step 1, step 4, Go deeper, myth)
ok(W.predict.whA === 250 && W.predict.whB === 250 && W.predict.answer === "same", "predict: hair dryer 10 min = laptop 5 h = 250 Wh");
ok(W.byId.hairdryer.watts === 1500 && W.byId.laptop.watts === 50 && D.predict.a.minutes === 10 && D.predict.b.minutes === 300, "predict: the job sizes the page states");
ok(has("1.5 kW hair dryer for 10 minutes and a 0.05 kW laptop for 5 hours both use 0.25 kWh") && has("$1.5\\ \\text{kW} \\times \\tfrac{10}{60}\\ \\text{h} = 0.25\\ \\text{kWh}$"), "page: the two jobs, 0.25 kWh each");
ok(has("a 50 W laptop for 5 hours uses as much as a 1,500 W hair dryer for 10 minutes"), "page: myth card restates the same jobs");

// ---------------- time to use 1 kWh
const T1 = { led: "100 h", laptop: "20 h", tv: "10 h", microwave: "1 h", hairdryer: "40 min", ev: "8 min 20 s" };
W.devs.forEach(d => {
  ok(near(M.minutesPerKWh(d.watts) * d.watts / 60, 1000), `1 kWh: ${d.label} power x time = 1 kWh`);
  ok(M.fmtDur(M.minutesPerKWh(d.watts)) === T1[d.id], `1 kWh: ${d.label} takes ${T1[d.id]} (got ${M.fmtDur(M.minutesPerKWh(d.watts))})`);
});
ok(M.fmtDur(310) === "5 h 10 min" && M.fmtDur(60) === "1 h" && M.fmtDur(10) === "10 min", "fmtDur: board clock labels");

// ---------------- the ladder
ok(M.rung(999.999) === 0 && M.rung(1000) === 1 && M.rung(1e6) === 2 && M.rung(1e9) === 3 && M.rung(1e12) === 4 && M.rung(4.2e15) === 4, "ladder: rung boundaries, capped at TWh");
const LADDER = { phone: ["19 Wh", "Wh"], homeday: ["29.6 kWh", "kWh"], homeyear: ["10.8 MWh", "MWh"], town: ["7.0 GWh", "GWh"], spp: ["299 TWh", "TWh"], us: ["4,200 TWh", "TWh"] };
W.items.forEach(it => {
  const want = LADDER[it.id];
  ok(it.text === want[0] && M.RUNGS[it.rung] === want[1], `ladder: ${it.label} = ${want[0]} on the ${want[1]} rung (got ${it.text}, ${M.RUNGS[it.rung]})`);
  ok(has(`<tr><td class="n">${want[0]}</td><td>${want[1]}</td><td>${it.label}</td></tr>`), `page: fallback table row for ${it.label}`);
});
ok(Math.round(W.span / 1e14) * 100 === 200, "ladder: phone charge to U.S. year is about 200 trillion times");
// Prairie Town's day: the same slice and scale as lesson 0
const W0 = G0.prepare(town, year, "lesson0"), game = W0.demand.reduce((a, b) => a + b, 0);
ok(Math.abs(W.town.mwh - game) <= 24 * W0.game.step / 2 && near(W.town.mwh, W0.rawDemand.reduce((a, b) => a + b, 0), 1e-6), `town day: ${W.town.mwh.toFixed(1)} MWh matches lesson 0 (${game} MWh after its 5 MW rounding)`);
ok(has("Prairie Town used about " + int(W.town.mwh) + " MWh on lesson 0's day") && has("7 GWh: one GWh is 1,000 MWh"), "page: quiz states Prairie Town's day");
ok(W.town.scalePeakMW === town.scenarios.lesson0.demandPeakMW, "town day: Prairie Town's 2025 peak scale is lesson 0's (450 MW)");
ok(near(W.spp.twh, 298.6) && near(W.spp.peakGW, 54.4), "SPP totals read from town_days.json stats");

// ---------------- Fermi: average and peak power of the U.S.
ok(W.fermi.answer === 2 && D.fermi.ticks_gw[2] === 500, "fermi: the right tick is 500 GW");
ok(Math.round(W.fermi.avgGW) === 479 && has("$4{,}200\\ \\text{TWh} \\div 8{,}760\\ \\text{h} \\approx 479\\ \\text{GW}$") && has("The U.S. averaged about 479 GW in 2025"), "fermi: 4,200 TWh / 8,760 h = 479 GW, as the page says");
ok(Math.round(W.fermi.peakGW) === 759 && W.fermi.ratio.toFixed(1) === "1.6" && has("ratio of about 1.6"), "fermi: 759 GW record is about 1.6 times the average");
ok(near(W.fermi.sppPeakGW / W.fermi.sppAvgGW, 1.6, 0.01), "fermi: SPP's own peak/average from one data set is also about 1.6");

// ---------------- the wind-farm claim
ok(W.wind.claim === 100000 && D.wind.cf.start === 100 && D.wind.home_w.start === 1000, "wind: slider start reproduces the claim, 100 MW / 1 kW = 100,000 homes");
ok(Math.round(W.wind.homeW) === 1232 && int(Math.round(W.wind.real / 100) * 100) === "27,400", `wind: EIA averages give ${W.wind.real.toFixed(0)} homes (page: about 27,400)`);
ok(has("an average home draws about 1,232 W, so the farm's yearly energy matches about 27,400 homes") && has("an average draw of about 1,232 W"), "page: wind myth numbers");
ok(near(M.homes(100, 0.338, 10791 * 1000 / 8760), 100 * 8760 * 0.338 / 10.791, 1e-6), "wind: homes = MW x 8,760 h x CF / MWh per home");
ok(M.homes(100, D.wind.cf.min / 100, D.wind.home_w.max) <= 50000 && M.homes(100, 1, 1000) > 50000, "wind: step 8 can be completed and starts above the threshold");

// ---------------- sourced numbers on the page match the data file
const A = D.anchors;
ok(has(">19 Wh<") && A.phone_charge.value === 0.019 && has("(0.019 kWh)"), "page: phone charge 19 Wh = EPA 0.019 kWh");
ok(has(">10,791 kWh<") && A.home_year.value === 10791 && has("about 29.6 kWh a day"), "page: 10,791 kWh a year, 29.6 kWh a day");
ok(has(">4,200 TWh<") && A.us_year.value === 4.2e12 && has("(4.20 trillion kWh)"), "page: 4,200 TWh = 4.20 trillion kWh");
ok(has(">759 GW<") && A.us_peak.value === 759180, "page: 759 GW record");
ok(has(">33.8%<") && A.wind_cf.value === 0.338 && has("U.S. wind ran at 33.8% of its capacity in 2025"), "page: wind capacity factor 33.8%");
ok(has("a 40 W bulb used for five hours uses 200 Wh, or 0.2 kWh") && A.bulb_example.watts * A.bulb_example.hours === 200, "page: EIA bulb example");
Object.keys(A).forEach(k => ok(/^https:\/\/www\.(eia|epa)\.gov\//.test(A[k].url) && A[k].as_of && QMD.indexOf(A[k].url.replace(/&/g, "&amp;")) >= 0, `anchor ${k}: allow-listed URL, an as-of date, and cited on the page`));

// ---------------- scope: links and words (curriculum section 20)
// the generated header, next box and footer (scripts/build_learn.py) are checked by the coordinator's scans; here: my own text
const OWN = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
const ALLOW = /^(https:\/\/(www\.)?(eia\.gov|epa\.gov|energy\.gov|nrel\.gov|ferc\.gov|nerc\.com)\/|[0-9a-z-]+\.qmd(#[a-z0-9-]+)?$|#)/;
hrefs.forEach(h => ok(ALLOW.test(h), `scope: link ${h} is allow-listed`));
const visible = QMD + JS;
["\\bFOAK\\b", "\\bNOAK\\b", "learning[- ](curve|rate)", "order[- ]book", "anchor[- ](customer|buyer)", "subsidy[- ]free", "projects/", "research\\.(html|qmd)", "\\bAI\\b",
 "artificial intelligence", "Claude", "ChatGPT", "\\bSMR\\b", "small modular"].forEach(p => ok(!new RegExp(p).test(visible), `scope: no /${p}/ in the lesson`));

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
