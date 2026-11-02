// test_02-demand.js — Node tests for Lesson 2 (assets/learn/02-demand.js), its data (assets/learn/data/02-demand.json,
// town_days.json, town_year.json, town.json) and every number the page states, plus the static fallback figure.
// Usage (from the site folder):  node _tests/learn/test_02-demand.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const J = p => JSON.parse(fs.readFileSync(path.join(SITE, p), "utf8"));
const M = require(path.join(SITE, "assets/learn/02-demand.js"));
const D = J("assets/learn/data/02-demand.json"), town = J("assets/learn/data/town.json");
const year = J("assets/learn/data/town_year.json"), days = J("assets/learn/data/town_days.json");
const QMD = fs.readFileSync(path.join(SITE, "learn/02-demand.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/02-demand.js"), "utf8");
const W = M.prepare(D, days, year);

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = s => QMD.indexOf(s) >= 0;
const n0 = v => M.num(v);

// ---------------- the clock: local Central time with daylight saving, checked against the separately stored days
{
  const C = W.C, per = {};
  C.date.forEach(d => { per[d] = (per[d] || 0) + 1; });
  ok(C.days === 365 && C.date[0] === "2025-01-01" && C.hour[0] === 0 && C.date[8759] === "2025-12-31" && C.hour[8759] === 23, "clock: 365 local days, 00:00 on 1 January to 23:00 on 31 December");
  ok(per["2025-03-09"] === 23 && per["2025-11-02"] === 25 && Object.keys(per).filter(d => per[d] !== 24).length === 2, "clock: 23 hours on 9 March, 25 on 2 November, 24 elsewhere");
  Object.entries(days.days).forEach(([k, d]) => {
    const ix = []; C.date.forEach((x, i) => { if (x === d.date) ix.push(i); });
    ok(ix.length === 24 && ix.map(i => year.demand[i]).join() === d.demand.join() && ix.map(i => year.solar[i]).join() === d.solar.join() && ix.every((i, h) => C.hour[i] === h),
       `clock: the year sliced at ${d.date} equals town_days.json ${k}`);
  });
  ok(C.dow[C.date.indexOf("2025-04-07")] === 0 && C.dow[C.date.indexOf("2025-01-01")] === 2, "clock: 7 April 2025 is a Monday, 1 January a Wednesday");
  // lesson 0 cuts its day with UTC-5 from the same file: same hours
  const G0 = require(path.join(SITE, "assets/learn/grid-operator.js")), W0 = G0.prepare(town, year, "lesson0");
  const ix = []; C.date.forEach((x, i) => { if (x === town.scenarios.lesson0.date) ix.push(i); });
  ok(W0.rawDemand.every((v, t) => near(v, year.demand[ix[t]] / 1000 * town.scenarios.lesson0.demandPeakMW)), "clock: agrees with lesson 0's day slice");
}

// ---------------- scale: Prairie Town's 2025 peak is lesson 0's
ok(D.town_peak_mw === town.scenarios.lesson0.demandPeakMW && W.peak === 450 && Math.max(...year.demand) === 1000, "scale: the year's top hour is 450 MW, as in lesson 0");

// ---------------- step 1-2: the hot day and the cold day
const s = W.s, w = W.w;
ok(M.predictAnswer(D, W) === 16 && s.tmax === 16 && s.max === 450, "day: the summer peak is the hour from 16:00 (answer: around 16:00)");
ok(Math.round(s.min) === 298 && s.tmin === 4 && Math.round(w.am) === 389 && w.tam === 7 && Math.round(w.pm) === 359 && w.tpm === 19 && w.low < w.am && w.low < w.pm, "day: summer 298 MW at 04:00; winter humps 389 at 07:00 and 359 at 19:00");
ok(has("from 298 MW at 04:00 to 450 MW at 16:00") && has("on 21 January it had two humps, at 07:00 and 19:00"), "page: the two days as stated");
ok(QMD.indexOf(M.fallbackSVG(W)) >= 0, "page: the fallback figure is exactly model.fallbackSVG()");
ok(D.days.summer.label === "29 July 2025" && days.days.summer_peak.date === "2025-07-29" && days.stats.peak_hour_utc === "2025-07-29T22:00:00", "day: SPP's 2025 peak hour is 16:00-17:00 CDT on 29 July");

// ---------------- step 3: weeks
ok(W.weeks.length === 51 && W.weeks.every(x => W.C.dow[x.idx[0]] === 0 && W.C.hour[x.idx[0]] === 0 && x.idx.length >= 167 && x.idx.length <= 169), "week: 51 complete Monday-to-Sunday weeks");
ok(W.weeks[D.week.start - 1].start === "2025-04-07" && M.weekLabel(W, D.week.start - 1) === "7–13 April", "week: the slider starts on 7-13 April");
ok(M.weekLabel(W, W.weeks.findIndex(x => x.start === "2025-03-31")) === "31 March–6 April", "week: labels across a month boundary");
ok(Math.round(W.week.gapMean * 100) === 4 && Math.round(W.week.gapMax * 100) === 9 && W.week.gapH === 7, "week: weekends 4% lower, up to 9% at 07:00");
ok(has("Weekend hours ran 4% below weekdays on average in 2025, and up to 9% lower around 07:00"), "page: weekly numbers");

// ---------------- step 4: seasons
ok(W.months.peak === 6 && W.C.date[W.months.top[6]] === "2025-07-29" && W.months.quiet === 3 && n0(W.months.max[3]) === "301", "season: July holds the top hour; April is quietest at 301 MW");
ok(n0(Math.max(W.months.max[0], W.months.max[1], W.months.max[11])) === "396", "season: winter's highest hour 396 MW");
ok(W.daily.min.length === 365 && W.daily.max.every((v, d) => v >= W.daily.min[d]), "season: one lowest and highest hour per day");
ok(has("July held the top hour; winter cold snaps made a second, lower season; April was the quietest month"), "page: seasons");

// ---------------- steps 5-6: the load-duration curve
ok(W.sorted.every((v, i) => i === 0 || v <= W.sorted[i - 1]) && near(W.sorted.reduce((a, b) => a + b, 0), W.totalMWh, 1e-3), "ldc: sorted non-increasing, same energy");
ok(W.order.every((k, r) => W.rank[k] === r) && new Set(W.order).size === W.n, "ldc: rank is a permutation");
ok(M.hoursAbove(W, W.peak) === 0 && M.hoursAbove(W, -1) === W.n && near(M.energyAbove(W, 0), 1, 1e-12), "ldc: edge cases");
let prev = Infinity;
for (let f = 50; f <= 100; f++) { const h = M.hoursAbove(W, W.peak * f / 100); ok(h <= prev, `ldc: hours above the line fall as the line rises (${f}%)`); prev = h; }
const h90 = M.hoursAbove(W, 405), e90 = M.energyAbove(W, 405);
ok(h90 === 180 && (h90 / W.n * 100).toFixed(1) === "2.1" && (e90 * 100).toFixed(2) === "0.12", "ldc: 180 hours above 405 MW, 2.1% of the year, 0.12% of the energy");
ok(has("only 180 of 8,760 hours needed more than 90% of the peak") && has("180 of the year's 8,760 hours need more than 405 MW") && has("2.1%: 180 ÷ 8,760 = 0.021") && has(">180 hours<") && has("which for $L = 405$ MW is only 0.12%"), "page: load-duration numbers");
ok(n0(W.mean) === "282" && W.loadFactor.toFixed(2) === "0.63" && near(W.loadFactor, W.mean / W.peak) && n0(W.totalMWh / 1000) === "2,469", "ldc: mean 282 MW, load factor 0.63, 2,469 GWh");
ok(has("\\frac{282\\ \\text{MW}}{450\\ \\text{MW}} = 0.63") && has("\\approx 2{,}469$ GWh") && has("Prairie Town averages 282 MW but peaks at 450 MW"), "page: load factor numbers");

// ---------------- step 7: the duck curve
for (let S = 0; S <= D.solar.max; S += D.solar.step) {
  const k = M.duck(W, S);
  ok(k.net.every((v, t) => near(v + k.solar[t], W.duckDay.demand[t], 1e-9)), `duck S=${S}: net + solar = demand`);
  if (S) ok(k.min <= M.duck(W, S - D.solar.step).min + 1e-9, `duck S=${S}: a bigger farm digs a deeper belly`);
}
ok(M.duck(W, 0).net.join() === W.duckDay.demand.join(), "duck: no solar, net demand = demand");
const d0 = M.duck(W, 0), d200 = M.duck(W, D.solar.target);
ok(Math.round(d200.ramp) === 114 && Math.round(d0.ramp) === 20 && D.solar.target === town.fleet.solar.mw, "duck: with lesson 0's 200 MW farm the 3-hour climb is 114 MW, against 20 MW without");
ok(has("with 200 MW of solar, net demand rises 114 MW in three hours, against 20 MW without it"), "page: duck myth numbers");
ok(M.duck(W, D.solar.max).min < 0 && M.duck(W, D.solar.target).neg === 0, "duck: the slider range reaches below zero; 200 MW does not");

// ---------------- SPP and U.S. numbers on the page
const st = days.stats;
ok(has(">54.4 GW<") && st.peak_demand_GW === 54.4, "page: SPP peak 54.4 GW");
ok(has(">299 TWh<") && Math.round(st.annual_demand_TWh) === 299 && Math.round(st.annual_demand_TWh * 1000 / 8760) === 34 && has("an average of 34 GW, so a load factor of 0.63"), "page: SPP 299 TWh, 34 GW average");
ok(near(st.annual_demand_TWh * 1000 / 8760 / st.peak_demand_GW, W.loadFactor, 0.005), "SPP load factor equals the shape's");
ok(has(">0.8%<") && st.share_of_net_generation.solar === 0.008 && has("SPP has little solar (0.8% of its 2025 generation)"), "page: SPP solar share 0.8%");
ok(has(">759 GW<") && D.anchors.us_peak.value === 759180, "page: 759 GW");
ok(st.demand_hours_flagged_as_implausible === 699 && has("For 699 hours of 2025 (about 8%)") && Math.round(699 / 8760 * 100) === 8, "page: 699 rebuilt hours, about 8%");
Object.keys(D.anchors).forEach(k => ok(/^https:\/\/www\.eia\.gov\//.test(D.anchors[k].url) && D.anchors[k].as_of && QMD.indexOf(D.anchors[k].url) >= 0, `anchor ${k}: EIA URL, as-of date, cited on the page`));

// ---------------- scope: links and words (curriculum section 20)
const OWN = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
const ALLOW = /^(https:\/\/(www\.)?(eia\.gov|epa\.gov|energy\.gov|nrel\.gov|ferc\.gov|nerc\.com)\/|[0-9a-z-]+\.qmd(#[a-z0-9-]+)?$|#)/;
hrefs.forEach(h => ok(ALLOW.test(h), `scope: link ${h} is allow-listed`));
["\\bFOAK\\b", "\\bNOAK\\b", "learning[- ](curve|rate)", "order[- ]book", "anchor[- ](customer|buyer)", "subsidy[- ]free", "projects/", "research\\.(html|qmd)", "\\bAI\\b",
 "artificial intelligence", "Claude", "ChatGPT", "\\bSMR\\b", "small modular", "nuclear"].forEach(p => ok(!new RegExp(p).test(QMD + JS), `scope: no /${p}/ in the lesson`));

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
