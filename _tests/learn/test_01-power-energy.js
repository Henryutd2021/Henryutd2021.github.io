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

// ---------------- the bathtub (review 2026-11-02, point 11): it never shrinks during an experiment; growth is announced
{
  let cap = M.KWH_STEPS[0], m = M.newMeter(), lastFill = 0, grew = 0;
  const on = { ev: true, hairdryer: true };
  for (let k = 0; k < 60; k++) {
    m = M.run(m, W.devs, on, 10 / 12);
    const ts = M.tubScale(cap, m.wh);
    ok(ts.cap >= cap, `tub: size never shrinks (slice ${k})`);
    ok(near(ts.fill, Math.min(1, m.wh / 1000 / ts.cap), 1e-12), `tub: fill = energy / size (slice ${k})`);
    if (ts.cap > cap) { grew++; ok(ts.changed && ts.was === cap && ts.was / ts.cap < 1, `tub: growth ${cap} -> ${ts.cap} kWh is announced with the old brim`); }
    else { ok(!ts.changed, `tub: no announcement without growth (slice ${k})`); ok(ts.fill >= lastFill - 1e-12, `tub: water never drops without an announced bigger tub (slice ${k})`); }
    lastFill = ts.fill; cap = ts.cap;
  }
  ok(grew >= 3, "tub: a long run grows the tub several times, each announced");
  ok(M.tubScale(0.1, 0).cap === 0.1 && !M.tubScale(0.1, 0).changed && M.tubScale(0.1, 0).fill === 0, "tub: after a reset it holds 0.1 kWh, empty");
  ok(M.tubScale(0.1, 110).cap === 0.2 && M.tubScale(0.1, 110).changed, "tub: 0.11 kWh grows the 0.1 kWh tub to 0.2 kWh, announced (the review's case)");
  ok(/Bigger tub: it now holds/.test(JS) && /t1-brim/.test(JS), "tub: the view writes the announcement and draws the old brim");
}

// ---------------- the prediction (step 1, step 4, Go deeper, myth)
ok(W.predict.whA === 250 && W.predict.whB === 250 && W.predict.answer === "same", "predict: hair dryer 10 min = laptop 5 h = 250 Wh");
ok(W.byId.hairdryer.watts === 1500 && W.byId.laptop.watts === 50 && D.predict.a.minutes === 10 && D.predict.b.minutes === 300, "predict: the job sizes the page states");
ok(has("1.5 kW hair dryer for 10 minutes and a 0.05 kW laptop for 5 hours both use 0.25 kWh") && has("$1.5\\ \\text{kW} \\times \\tfrac{10}{60}\\ \\text{h} = 0.25\\ \\text{kWh}$"), "page: the two jobs, 0.25 kWh each");
ok(has("a 50 W laptop for 5 hours uses as much as a 1,500 W hair dryer for 10 minutes"), "page: myth card restates the same jobs");
// step 4 grading (review point 2): exactly the two jobs, each alone, nothing else
{
  const a = D.predict.a, b = D.predict.b, J = (steps) => {
    let m = M.newMeter(); steps.forEach(([on, min]) => { m = M.run(m, W.devs, on, min); }); return M.checkJobs(m, a, b);
  };
  const slices = n => Array.from({ length: 12 }, () => [{ hairdryer: true }, n / 12]);   // the animated run
  ok(J([[{ hairdryer: true }, 10], [{ laptop: true }, 60], [{ laptop: true }, 60], [{ laptop: true }, 60], [{ laptop: true }, 60], [{ laptop: true }, 60]]).ok, "jobs: hair dryer 10 min then laptop 5 x 1 h passes");
  ok(J(slices(10).concat([[{ laptop: true }, 300]])).ok, "jobs: the animated 12-slice run counts as 10 minutes");
  ok(J([[{ laptop: true }, 300], [{}, 60], [{ hairdryer: true }, 10]]).ok, "jobs: either order, idle time allowed");
  const both = J([[{ hairdryer: true, laptop: true }, 300]]);
  ok(!both.ok && both.state === "over" && both.mixed && near(both.aWh, 7500) && near(both.bWh, 250), "jobs: both together for 5 h (7.5 kWh and 0.25 kWh) is rejected, the review's case");
  const long = J([[{ hairdryer: true }, 60], [{ laptop: true }, 300]]);
  ok(!long.ok && long.state === "over" && near(long.aWh, 1500), "jobs: a 1-hour hair-dryer run is rejected as more than the job");
  const extra = J([[{ hairdryer: true }, 10], [{ laptop: true }, 300], [{ tv: true }, 10]]);
  ok(!extra.ok && extra.state === "over" && extra.otherWh > 0, "jobs: another appliance's energy is rejected");
  const half = J([[{ hairdryer: true }, 10], [{ laptop: true }, 120]]);
  ok(!half.ok && half.state === "partial" && near(half.bMin, 120), "jobs: part-way is 'partial', with the reader's own totals");
  ok(J([]).state === "empty" && J([[{}, 60]]).state === "empty", "jobs: an empty meter is 'empty'");
  ok(/checkJobs\(s\.meter/.test(JS) && !/a >= W\.predict\.whA/.test(JS), "jobs: the view grades with checkJobs, not 'at least 250 Wh'");
}

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
ok(W.spanText === "220 trillion" && near(W.span, 4.2e15 / 19, 1e3), "ladder: phone charge to U.S. year is about 220 trillion times (4,200 TWh / 19 Wh)");
ok(/four steps of ×1,000 from Wh to TWh/.test(JS) && !/five rungs of ×1,000/.test(JS), "ladder: five units are four steps of x1,000 (review point 6)");
// Prairie Town's day: the same slice and scale as lesson 0
const W0 = G0.prepare(town, year, "lesson0"), game = W0.demand.reduce((a, b) => a + b, 0);
ok(W.town.demand.join() === W0.demand.join() && W.town.mwh === game && game === 6957 && W.town.peakMW === Math.max(...W0.demand), `town day: lesson 0's hourly MW, ${W.town.mwh} MWh (as K1, K4 and K7)`);
ok(Math.abs(W.town.mwh - W0.rawDemand.reduce((a, b) => a + b, 0)) < 1, "town day: within 1 MWh of the unrounded shape");
ok(has("Prairie Town used about " + int(W.town.mwh) + " MWh on lesson 0's day") && has("7 GWh: one GWh is 1,000 MWh"), "page: quiz states Prairie Town's day");
ok(has("with lesson 0's hourly MW, which add up to " + int(W.town.mwh) + " MWh"), "page: the data note states the day's total");
ok(!/6,956|6956/.test(QMD + JS), "page: no trace of the unrounded 6,956 MWh");
ok(W.town.scalePeakMW === town.scenarios.lesson0.demandPeakMW, "town day: Prairie Town's 2025 peak scale is lesson 0's (450 MW)");
ok(near(W.spp.twh, 298.6) && near(W.spp.peakGW, 54.4), "SPP totals read from town_days.json stats");

// ---------------- Fermi: average and peak power of the U.S.
ok(W.fermi.answer === 2 && D.fermi.ticks_gw[2] === 500, "fermi: the right tick is 500 GW");
ok(Math.round(W.fermi.avgGW) === 479 && has("$4{,}200\\ \\text{TWh} \\div 8{,}760\\ \\text{h} \\approx 479\\ \\text{GW}$") && has("The U.S. averaged about 479 GW in 2025"), "fermi: 4,200 TWh / 8,760 h = 479 GW, as the page says");
ok(Math.round(W.fermi.peakGW) === 759 && W.fermi.ratio === undefined, "fermi: 759 GW record kept as a number; no ratio against the U.S. year (review point 4)");
ok(W.fermi.sppRatio.toFixed(1) === "1.6" && W.fermi.sppAvgGW.toFixed(1) === "34.1" && W.fermi.sppPeakGW.toFixed(1) === "54.4", "fermi: SPP's peak/average from one data set: 54.4 / 34.1 GW = 1.6");
ok(has("its peak hour needed 54.4 GW, about 1.6 times the average") && has("an average of 34.1 GW") && has("used 298.6 TWh in 2025"), "page: Go deeper states SPP's 298.6 TWh, 34.1 GW and 54.4 GW");
ok(has("the 2025 peak hour needed about 1.6 times its average") && !has("The grid is built for that peak") && !/The grid is built for that peak/.test(JS), "page and view: peak/average from SPP; no 'built for that peak'");
ok(int(W.wh.us / 1e9) === "4,200,000", "fermi: unit chain 4,200 TWh = 4,200,000 GWh");

// ---------------- the wind-farm claim
ok(W.wind.claim === 100000 && D.wind.cf.start === 100 && D.wind.home_w.start === 1000, "wind: slider start reproduces the claim, 100 MW / 1 kW = 100,000 homes");
ok(Math.round(W.wind.homeW) === 1232 && int(Math.round(W.wind.real / 100) * 100) === "27,400", `wind: EIA averages give ${W.wind.real.toFixed(0)} homes (page: about 27,400)`);
ok(has("An average home bought 10,791 kWh a year (about 1,232 W on average), so the farm's yearly energy matches what about 27,400 homes buy") && has("an average draw of about 1,232 W"), "page: wind myth numbers, as purchases");
ok(near(M.homes(100, 0.338, 10791 * 1000 / 8760), 100 * 8760 * 0.338 / 10.791, 1e-6), "wind: homes = MW x 8,760 h x CF / MWh per home");
// step 8 (review point 3): EIA's averages are reachable on the sliders, and the on-screen result there is the stated one
const onGrid = (v, o) => near((v - o.min) / o.step, Math.round((v - o.min) / o.step), 1e-6) && v >= o.min && v <= o.max;
ok(W.wind.refCF === 33.8 && W.wind.refW === 1232 && onGrid(W.wind.refCF, D.wind.cf) && onGrid(W.wind.refW, D.wind.home_w), "wind: 33.8% and 1,232 W sit on the slider steps");
ok(int(Math.round(M.homes(100, W.wind.refCF / 100, W.wind.refW) / 100) * 100) === "27,400", "wind: the sliders at EIA's averages show 27,400, as the feedback says");
ok(/Use EIA's averages/.test(JS) && /Math\.abs\(cf\.val\(\) - W\.wind\.refCF\) < 0\.05/.test(JS) && !/n <= 50000/.test(JS), "wind: a reference-values button; done only at EIA's averages");

// ---------------- sourced numbers on the page match the data file
const A = D.anchors;
ok(has(">19 Wh<") && A.phone_charge.value === 0.019 && has("(0.019 kWh)"), "page: phone charge 19 Wh = EPA 0.019 kWh");
ok(has(">10,791 kWh<") && A.home_year.value === 10791 && has("about 29.6 kWh a day"), "page: 10,791 kWh a year, 29.6 kWh a day");
ok(has(">4,200 TWh<") && A.us_year.value === 4.2e12 && has("(4.20 trillion kWh)"), "page: 4,200 TWh = 4.20 trillion kWh");
ok(has(">759 GW<") && A.us_peak.value === 759180, "page: 759 GW record");
ok(has(">33.8%<") && A.wind_cf.value === 0.338 && has("U.S. wind ran at 33.8% of its capacity in 2025"), "page: wind capacity factor 33.8%");
ok(has("a 40 W bulb used for five hours uses 200 Wh, or 0.2 kWh") && A.bulb_example.watts * A.bulb_example.hours === 200, "page: EIA bulb example");

// ---------------- review fixes in words (2026-11-02)
ok(!/it only adds up/.test(JS) && /running total of energy used/.test(JS) && /Stored energy, as in a battery, can fall/.test(JS), "running total: the energy meter never falls; stored energy can (point 5)");
ok(has("Leaving it out makes these energy-based terms four times too large") && !has("every energy, cost and emission total") && !has("C = \\sum"), "Modeler preview: energy-based terms only; no undefined C or c (point 9)");
ok((QMD.match(/\$\$/g) || []).length === 4, "Go deeper: two display equations in all (one per box), the Modeler box a one-line preview");
ok(has("[Lesson 10](10-write-it-down.qmd)") && has("[lesson 9](09-storage.qmd)") && /05-capacity-factor\.html/.test(JS), "forward links: lessons 5, 9 and 10 (live)");
ok(/\[\[log-scale\|log scale\]\]/.test(JS) && /unitKey\(act\)/.test(JS) && /\[\[kilowatt\|kW\]\]/.test(JS), "units: unit key with the power and energy ladders; log scale glossed (point 7)");
ok(/Stretch, optional: a \[\[fermi-estimate/.test(JS) && /Stretch, optional: claims often say/.test(JS) && (JS.match(/free: true/g) || []).length === 2, "depth: the national estimate and the wind claim are optional stretch steps (point 8)");
ok(/if \(moveFocus\) qp\.focus\(\)/.test(JS) && /tabindex: "-1"/.test(JS), "ladder: focus moves to the next question (point 13)");
ok(/homes whose yearly purchases it matches/.test(JS) && /illustrative equivalent/.test(JS) && has("illustrative equivalent"), "wind: purchases benchmark, an illustrative equivalent (point 12)");
Object.keys(A).forEach(k => ok(/^https:\/\/www\.(eia|epa)\.gov\//.test(A[k].url) && A[k].as_of && QMD.indexOf(A[k].url.replace(/&/g, "&amp;")) >= 0, `anchor ${k}: allow-listed URL, an as-of date, and cited on the page`));

// ---------------- scope: links and words (curriculum section 20)
// the generated header, next box and footer (scripts/build_learn.py) are checked by the coordinator's scans; here: my own text
const OWN = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
const ALLOW = /^(https:\/\/(www\.)?(eia\.gov|epa\.gov|energy\.gov|nrel\.gov|ferc\.gov|nerc\.com)\/|[0-9a-z-]+\.qmd(#[a-z0-9-]+)?$|k0\d-[a-z-]+\.html$|#)/;   // learn pages as .qmd; toolbox refreshers as .html
hrefs.forEach(h => ok(ALLOW.test(h), `scope: link ${h} is allow-listed`));
const visible = QMD + JS;
["\\bFOAK\\b", "\\bNOAK\\b", "learning[- ](curve|rate)", "order[- ]book", "anchor[- ](customer|buyer)", "subsidy[- ]free", "projects/", "research\\.(html|qmd)", "\\bAI\\b",
 "artificial intelligence", "Claude", "ChatGPT", "\\bSMR\\b", "small modular"].forEach(p => ok(!new RegExp(p).test(visible), `scope: no /${p}/ in the lesson`));

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
