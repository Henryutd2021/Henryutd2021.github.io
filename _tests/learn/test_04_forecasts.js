// test_04_forecasts.js — Node tests for Lesson 4 (assets/learn/04-forecasts.js): the data (real SPP 2025, EIA-930), the
// scoring, band and margin functions, and every number the lesson page states.
// Usage (from the site folder):  node _tests/learn/test_04_forecasts.js            run the checks
//                                node _tests/learn/test_04_forecasts.js --fallback  also rewrite the page's static figure
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/04-forecasts.js"));
const J = p => JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data", p), "utf8"));
const days = J("town_days.json"), year = J("town_year.json"), fc = J("04-forecasts.json");
const QMD_PATH = path.join(SITE, "learn/04-forecasts.qmd");
let QMD = fs.readFileSync(QMD_PATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/04-forecasts.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));
const pct = (x, d) => (100 * x).toFixed(d == null ? 1 : d) + "%";

// ---------------- data
const T = M.prepare(days, year, fc, "typical_forecast"), X = M.prepare(days, year, fc, "big_forecast_miss");
[T, X].forEach(d => {
  ok(d.A.length === 24 && d.F.length === 24 && d.Y.length === 24 && d.Wk.length === 24 && d.S.length === 24 && d.Sy.length === 24, d.date + ": 24 hours in every series");
  ok(+d.date.slice(5, 7) <= 4, d.date + ": a January-April forecast day (later months report a forecast series that does not match demand)");
  // the year file's hour convention, checked on the day itself (town_days.json is cut separately)
  const self = M.prepare({ days: { s: Object.assign({}, days.days[d.key], { date: M.shift(d.yDate, 1) }) } }, year, fc, "s");
  const raw = year.demand, t0 = Date.parse(year.start_utc + "Z"), i0 = Math.round((Date.parse(d.date + "T00:00:00Z") - t0) / 3600000) + 7;
  ok(raw.slice(i0, i0 + 24).join() === days.days[d.key].demand.join(), d.date + ": town_year slice (UTC-6, hour ending) equals town_days demand");
  ok(raw.slice(i0 - 24, i0).every((v, k) => near(v * fc.spp_peak_demand_mw / 1000, d.Y[k], 1e-6)), d.date + ": the yesterday baseline is the 24 hours before the day");
  ok(raw.slice(i0 - 168, i0 - 144).every((v, k) => near(v * fc.spp_peak_demand_mw / 1000, d.Wk[k], 1e-6)), d.date + ": the last-week baseline is the same hours 7 days before");
  ok(self.A.join() === d.A.join(), d.date + ": prepare is consistent");
  [d.date, d.yDate, d.wDate].forEach(x => ok(fc.neighbours_valid[x] === true, x + ": a day with no repaired demand, wind or solar hours"));
});
ok(X.A.every((v, t) => v > X.F[t]), "4 Feb: demand came in above the forecast in every hour (the step text says so)");
ok(T.label.weekday === "Monday" && T.yLabel.weekday === "Sunday" && X.label.weekday === "Tuesday", "labels: Monday 10 Feb (yesterday a Sunday), Tuesday 4 Feb");
const q = fc.jan_apr.quantiles, errs = M.errors(fc), n = errs.length;
ok(n === fc.jan_apr.hours && errs.every((e, i) => i === 0 || e >= errs[i - 1]), "errors: one sorted value per scored hour");
function quant(p) { const pos = p * (n - 1), lo = Math.floor(pos), hi = Math.min(lo + 1, n - 1); return errs[lo] + (errs[hi] - errs[lo]) * (pos - lo); }
Object.keys(q).forEach(p => ok(near(quant(+p), q[p], 0.00051), `quantile ${p}: stored ${q[p]} matches the stored errors (${quant(+p).toFixed(4)})`));
ok(Object.keys(q).map(Number).sort((a, b) => a - b).every((p, i, a) => i === 0 || q[String(p)] >= q[String(a[i - 1])]), "quantiles increase");
const r = fc.monthly_forecast_ratio;
ok(r.slice(0, 4).every(v => v > 0.98 && v < 1.01) && r.slice(4).every(v => v > 1.07 && v < 1.16), "monthly ratio: Jan-Apr within 2%, May-Dec 8-15% above");

// ---------------- scoring identities
[T, X].forEach(d => {
  ok(near(M.mae(d.A, d.A), 0, 1e-12) && near(M.mape(d.A, d.A).value, 0, 1e-12), d.date + ": a perfect forecast scores zero");
  const up = d.F.map(v => v + 1000);
  ok(near(M.bias(d.A, up), M.bias(d.A, d.F) - 1000, 1e-6), d.date + ": bias shifts by the offset");
  ok(M.mae(d.A, d.F) >= Math.abs(M.bias(d.A, d.F)) - 1e-9, d.date + ": MAE is at least |bias|");
  const w = M.worst(d.A, d.F); ok(d.A.every((v, t) => Math.abs(v - d.F[t]) <= Math.abs(w.mw) + 1e-9), d.date + ": worst hour is the largest miss");
  ["50", "80", "95"].forEach(L => { const b = M.band(fc, d.F, L); ok(b.lo.every((v, t) => v < d.F[t] && b.hi[t] > d.F[t]), `${d.date}: the ${L}% band brackets the forecast`); });
  const o = ["50", "80", "95"].map(L => M.outside(d.A, M.band(fc, d.F, L)));
  ok(o[0] >= o[1] && o[1] >= o[2], `${d.date}: wider bands leave fewer hours outside (${o.join(", ")})`);
  const s = M.mape(d.S, d.Sy); ok(s.hours + s.skipped === 24 && s.skipped > 0, d.date + ": solar MAPE skips the night hours");
});
ok(M.mape([0, 0], [1, 2]).hours === 0 && isNaN(M.mape([0, 0], [1, 2]).value), "edge: MAPE is undefined when every actual is zero");
// the in-sample band holds its share of January-April hours
["50", "80", "95"].forEach(L => {
  const b = M.BANDS[L], inside = errs.filter(e => e >= q[b[0]] - 1e-9 && e <= q[b[1]] + 1e-9).length / n;
  ok(near(inside, +L / 100, 0.015), `the ${L}% band holds ${pct(inside)} of January-April hours`);
});

// ---------------- the margin game
const GRID = M.marginGrid(0, 0.10, 0.005), BEST = M.bestMargin(fc, errs, GRID), C = M.COSTS, crit = C.under / (C.under + C.over);
GRID.forEach(x => {
  const m = M.marginCost(fc, x, errs);
  ok(near(m.total, m.overCost + m.underCost, 1e-6) && near(m.overCost - m.underCost * C.over / C.under, C.over * fc.jan_apr.mean_forecast_mw * errs.reduce((s, e) => s + (x - e), 0) / n, 1e-3),
     `margin ${x}: total = unused + emergency, and unused - emergency (in MWh) = mean (r - e) x F`);
});
const below = errs.filter(e => e <= BEST.r + 1e-12).length / n, belowPrev = errs.filter(e => e <= BEST.r - 0.005 + 1e-12).length / n;
ok(below >= crit - 0.01 && belowPrev <= crit + 0.01, `cheapest margin ${BEST.r} sits at the critical ratio ${crit.toFixed(3)} (P(e<=r) = ${below.toFixed(3)}; one step lower ${belowPrev.toFixed(3)})`);
ok(near(BEST.shortShare, 1 - below, 1e-9), "short share = 1 - P(e <= r)");
const totals = GRID.map(x => M.marginCost(fc, x, errs).total), k = GRID.indexOf(BEST.r);
ok(totals.every((v, i) => (i <= k ? i === 0 || v <= totals[i - 1] + 1e-6 : v >= totals[i - 1] - 1e-6)), "cost falls to the cheapest margin, then rises (convex)");

// ---------------- numbers the page states
const PM = fc.jan_apr.persistence_mae_mw, skill = 1 - PM.spp_same_hours_yesterday / PM.yesterday;
has(`<td class="n">${pct(fc.jan_apr.mape)}</td>`, "MAPE " + pct(fc.jan_apr.mape)); ok(pct(fc.jan_apr.mape) === "1.9%", "MAPE is 1.9%");
has(`over ${fc.jan_apr.hours.toLocaleString("en-US")} hours: about ${(fc.jan_apr.mae_mw / 1000).toFixed(2)} GW`);
has(`<td class="n">${pct(skill, 0)}</td>`); has(`was ${pct(skill, 0)} smaller than that of “same hour yesterday”`);
has(`$1 - ${PM.spp_same_hours_yesterday}/${PM.yesterday.toLocaleString("en-US").replace(",", "{,}")} \\approx ${skill.toFixed(2)}$`);
const sp = x => (x >= 0 ? "+" : "−") + Math.abs(100 * x).toFixed(1) + "%";
has(`<td class="n">${sp(q["0.1"])} to ${sp(q["0.9"])}</td>`);
has(`$q_{0.1} = ${(100 * q["0.1"]).toFixed(1)}\\%$ and $q_{0.9} = +${(100 * q["0.9"]).toFixed(1)}\\%$`);
const W = fc.wind_persistence;
has(`<td class="n">${Math.round(W.mae_pct_of_max[0])}% → ${Math.round(W.mae_pct_of_max[W.lead_hours.indexOf(24)])}%</td>`);
has(`(${(W.max_wind_mw / 1000).toFixed(1)} GW)`);
has(`\\frac{${C.under}}{${C.under} + ${C.over}} \\approx ${crit.toFixed(2)}`);
ok(sp(BEST.r) === "+6.0%", "the cheapest slider setting on the page is +6.0%"); has("the cheapest available slider setting is " + sp(BEST.r));
// the exact rule on the errors' own 0.1-point grid gives +5.9%; +6.0% is the slider's cheapest 0.5-point step
const FINE = M.bestMargin(fc, errs, M.marginGrid(0, 0.10, 0.001));
ok(sp(FINE.r) === "+5.9%", "exact cheapest cushion (0.1-point grid) is +5.9%: " + sp(FINE.r));
ok(M.marginCost(fc, 0.059, errs).total < M.marginCost(fc, 0.058, errs).total && M.marginCost(fc, 0.059, errs).total < M.marginCost(fc, 0.060, errs).total, "+5.9% is cheaper than its neighbours +5.8% and +6.0%");
ok(errs.filter(e => e <= FINE.r + 1e-12).length / n >= crit && errs.filter(e => e < FINE.r - 1e-12).length / n <= crit, "+5.9% is the empirical quantile at the critical ratio");
has("the rule gives a cushion of " + sp(FINE.r));
has(`on 4 February 2025, ${M.outside(X.A, M.band(fc, X.F, "80"))} of 24 hours fell outside the 80% band`);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
MONTHS.forEach((mo, i) => has(`<td>${mo}</td><td>${r[i].toFixed(3)}</td>`, "monthly ratio table: " + mo + " " + r[i].toFixed(3)));
has(`ran above demand in ${pct(fc.may_dec_share_of_hours_forecast_above_demand, 0)} of hours`);
has("runs 8–15% above"); ok(Math.round(100 * (Math.min(...r.slice(4)) - 1)) === 8 && Math.round(100 * (Math.max(...r.slice(4)) - 1)) === 15, "8-15% matches the monthly ratios");
ok(((1 + 1 + 3) / 3).toFixed(2) === "1.67", "quiz: MAE of 1, 1, 3 = 1.67"); has("(1 + 1 + 3) ÷ 3 ≈ 1.67");
ok(Math.round(100 * crit) === 97, "quiz: 300/(300+10) = 97%"); has("300 ÷ (300 + 10) ≈ 0.97");
ok(T.label.long === "10 February 2025" && X.label.long === "4 February 2025", "page dates match the data");

// ---------------- wording checks: the Analyst and Modeler boxes, forward pointers, claims
const code = JS.replace(/\/\/.*$/gm, "");
ok(!/59\.3/.test(code) && !/59\.3/.test(QMD), "#1: no unsupported 59.3 Hz threshold on the page or in the script");
ok(/cannot restore balance/.test(code), "#1: the last-resort link says customers are cut only if response cannot restore balance");
ok(/used to build it; how well it covers future days is untested/.test(code), "#2: the in-sample note sits beside the band selector");
has("not each day", "#2: the band myth says the 80% counts the construction hours, not each day");
ok(/does not mean a blackout/.test(code) && /illustrative scheduling cushion/.test(code) && /under these assumed prices/.test(code), "#3: the cushion is illustrative, short is not a blackout, the optimum holds under assumed prices");
ok(!/why reserves exist/i.test(code) && !/caught short/i.test(code), "#3: no reserve-requirement framing in the game");
has("so its answer is not a reserve requirement", "#3: the limits list says the game is not a reserve requirement");
const L0 = M.scoreLabels(false), L1 = M.scoreLabels(true);
ok(!/MAE|MAPE/.test(L0.pct + L0.abs) && /MAPE/.test(L1.pct) && /MAE/.test(L1.abs), "#4: chips use plain words until MAE and MAPE are defined");
const stepSrc = code.slice(code.indexOf("var steps = ["), code.indexOf("LX.StepCards(")).split(/\{ text: "/).slice(1);   // the seven step cards
ok(stepSrc.length === 7, "seven step cards");
const defIdx = stepSrc.findIndex(t => /\[\[mae\|/.test(t));
ok(defIdx === 3 && /named: true/.test(stepSrc[defIdx]) && stepSrc.slice(0, defIdx).every(t => !/named: true/.test(t)) && /named: false/.test(stepSrc[1]), "#4: step 4 defines and names the scores; earlier steps do not");
ok((code.match(/Signed error, % of forecast/g) || []).length === 2, "#5: the tooltip and the table label the signed error as % of forecast");
ok(/percentage of the forecast/.test(stepSrc[4]) && /in percent of actual/.test(stepSrc[3]), "#5: the band step names its denominator (forecast), MAPE names its own (actual)");
has("MAPE divides each miss by the actual value", "#5: the Analyst box contrasts the two denominators");
ok(!/newsvendor|pinball|P\(e \\le/i.test(QMD), "#7: the Modeler box is a preview without the newsvendor formulation or pinball loss");
has("Lesson [M10](m10-ml-forecasting.qmd) builds forecasts", "#7: forward pointer to M10 (live: a link)");
ok(!/Wind is harder/.test(code) && /later lessons compare forecasting methods/.test(code), "#8: no unsupported 'wind is harder' claim");
ok(/cause is unverified/.test(fc.meta.method) && !/rather than a measure of forecast skill/.test(fc.meta.method), "#9: the data file calls the May-December gap unverified");
has("the cause is unverified", "#9: the data note calls the May-December gap unverified"); has("an editorial choice, pending validation");
const rows = M.costRows(fc, errs, GRID, 0.055);
ok(rows.length === GRID.length && GRID.length === 21, "#11: the cost table lists all 21 slider settings");
ok(rows.filter(x => /\(yours\)/.test(x[0])).length === 1 && rows[GRID.indexOf(0.055)][0] === "+5.5% (yours)", "#11: the reader's half-step setting is marked in the table");
ok(rows.every((x, i) => x[3] === "$" + Math.round(M.marginCost(fc, GRID[i], errs).total).toLocaleString("en-US")), "#11: table totals match the model");

// ---------------- scope and wording
const DENY = [/\bFOAK\b/, /\bNOAK\b/, /first[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i, /subsidy[- ]free/i,
  /smr-dc/i, /projects\//, /research\.(html|qmd)/, /\bAI\b/, /artificial intelligence/i, /\bnuclear\b/i, /\bSMR\b/, /ChatGPT|Claude/];
const visible = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");   // own text only: the generated blocks come from path.yml
DENY.forEach(rx => { ok(!rx.test(visible), "page: no " + rx); ok(!rx.test(JS.replace(/\/\/.*$/gm, "")), "script: no " + rx); });
(visible.match(/href="([^"]+)"/g) || []).forEach(h => {
  const u = h.slice(6, -1);
  ok(/^(https:\/\/(www\.)?(eia\.gov|otexts\.com|doi\.org|creativecommons\.org\/licenses|opensource\.org\/license)\/|#|\.\.\/assets\/|index\.html|0\d-[a-z-]+\.html|k0\d-[a-z-]+\.html|cf8-power-curves-from-scarce-data\.html|mailto:)/.test(u), "page: allowed link " + u);
});
// the approved research excerpt (E1): word for word in the Real-world box, with its DOI, in no other lesson part
const E1 = "From the course author's research: a wind turbine's real power curve is a band, not a line. Adding the turbine's theoretical curve to about two hundred measurements can narrow that band, but whether it helps depends on how the fit is scored.";
const ex = visible.match(/<blockquote class="lx-excerpt" data-source="excerpt:uq-mfgpr"><p>([\s\S]*?)<\/p><\/blockquote>/);
ok(ex && ex[1].startsWith(E1) && /href="https:\/\/doi\.org\/10\.1115\/detc2023-114762"/.test(ex[1]), "page: the approved excerpt E1, word for word, with its DOI");
ok((visible.match(/lx-excerpt/g) || []).length === 1, "page: one excerpt only");

// ---------------- the static figure: the typical day, forecast against actual
function fallbackSvg() {
  const d = T, Wd = 720, Hh = 280, m = { l: 44, r: 14, t: 14, b: 30 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b;
  const all = d.A.concat(d.F), lo = Math.floor(Math.min(...all) / 2000) * 2, hi = Math.ceil(Math.max(...all) / 2000) * 2;
  const Xp = t => (m.l + t / 24 * iw).toFixed(1), Yp = v => (m.t + ih - (v / 1000 - lo) / (hi - lo) * ih).toFixed(1);
  const path = a => a.map((v, t) => (t ? "L" : "M") + Xp(t + 0.5) + " " + Yp(v)).join(" ");
  const mp = M.mape(d.A, d.F).value, w = M.worst(d.A, d.F);
  let s = `<svg viewBox="0 0 ${Wd} ${Hh}" role="img" aria-labelledby="l4-static-title">\n<title id="l4-static-title">Southwest Power Pool demand on ${d.label.weekday} ${d.label.long}, hour by hour, against the day-ahead forecast: the forecast missed by ${pct(mp)} on average; the largest miss was ${(w.mw / 1000).toFixed(1)} GW at ${String(w.t).padStart(2, "0")}:00.</title>\n<g>`;
  for (let v = lo; v <= hi; v += 2) s += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${Yp(v * 1000)}" y2="${Yp(v * 1000)}" stroke="var(--lx-line)"/><text x="${m.l - 6}" y="${(+Yp(v * 1000) + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--lx-ink-3)">${v}</text>`;
  [0, 6, 12, 18, 24].forEach((h, i) => { s += `<text x="${Xp(h)}" y="${Hh - 8}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}" font-size="13" fill="var(--lx-ink-3)">${String(h).padStart(2, "0")}:00</text>`; });
  s += `<text x="${m.l}" y="${m.t - 2}" font-size="12" fill="var(--lx-ink-3)">GW</text></g>\n<g>`;
  d.A.forEach((v, t) => { const a = +Yp(Math.max(v, d.F[t])), b = +Yp(Math.min(v, d.F[t])); if (b - a > 0.5) s += `<rect x="${(+Xp(t + 0.2)).toFixed(1)}" y="${a.toFixed(1)}" width="${(iw / 24 * 0.6).toFixed(1)}" height="${(b - a).toFixed(1)}" fill="${v > d.F[t] ? "var(--lx-warn)" : "var(--lx-tier-3)"}" opacity="0.4"/>`; });
  s += `</g>\n<path d="${path(d.F)}" fill="none" stroke="var(--lx-accent)" stroke-width="2.4"/>\n<path d="${path(d.A)}" fill="none" stroke="var(--lx-ink)" stroke-width="2.8"/>\n</svg>\n`;
  s += `<div class="lx-legend" aria-hidden="true"><span><i style="--c:var(--lx-ink)"></i>Actual demand</span><span><i style="--c:var(--lx-accent)"></i>SPP day-ahead forecast</span><span><i style="--c:var(--lx-warn)"></i>Demand above forecast</span><span><i style="--c:var(--lx-tier-3)"></i>Below forecast</span></div>`;
  return s;
}
const FB = fallbackSvg(), re = /(<!-- fallback-svg:start -->\n)([\s\S]*?)(<!-- fallback-svg:end -->)/;
if (process.argv.includes("--fallback")) { QMD = QMD.replace(re, (m0, a, b, c) => a + FB + "\n" + c); fs.writeFileSync(QMD_PATH, QMD); console.log("wrote the static figure into learn/04-forecasts.qmd"); }
const cur = re.exec(QMD);
ok(cur && cur[2].trim() === FB.trim(), "page: the static figure matches the data (run with --fallback to rewrite it)");

console.log(`typical ${T.date}: MAPE ${pct(M.mape(T.A, T.F).value, 2)}, MAE ${(M.mae(T.A, T.F) / 1000).toFixed(2)} GW; miss ${X.date}: MAPE ${pct(M.mape(X.A, X.F).value, 2)}; cheapest margin ${BEST.r} (short ${pct(BEST.shortShare)})`);
console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
