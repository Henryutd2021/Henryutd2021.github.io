// test_05-capacity-factor.js — Node tests for Lesson 5 (assets/learn/05-capacity-factor.js), its data
// (assets/learn/data/05-capacity-factor.json + town_year.json) and every number the lesson page states.
// Usage (from the site folder):  node _tests/learn/test_05-capacity-factor.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/05-capacity-factor.js"));
const year = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"));
const D = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/05-capacity-factor.json"), "utf8"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/05-capacity-factor.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/05-capacity-factor.js"), "utf8");
const CT = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/cf_targets.json"), "utf8"));
const PR = require(path.join(SITE, "assets/learn/components/profiles.js"));
const W = M.world(year, D, CT), H = M.HOURS, P = D.plantMW, T = W.T, tb = D.turbine;

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const int = v => Math.round(v).toLocaleString("en-US");
const pct = (x, d) => (x * 100).toFixed(d === undefined ? 1 : d) + "%";
const KEYS = ["nuclear", "wind", "solar"];

// ---------------- data file: sources, targets transcribed from EIA Table 6.07.B (2025, final; read 2026-11-02)
{
  Object.keys(D.sources).forEach(k => ok(/^https:\/\//.test(D.sources[k].url) && D.sources[k].as_of, `source ${k} has a URL and an as-of date`));
  const EIA2025 = { nuclear: 0.911, wind: 0.338, solar: 0.240 };   // second entry of the same table, by hand
  KEYS.forEach(k => ok(T[k] === EIA2025[k], `target ${k} (shared cf_targets.json) = EIA 2025 annual ${EIA2025[k]}`));
  ok(/6\.07\.B/.test(CT.source.short) && /released 23 October 2026/.test(CT.source.issue), "shared targets cite Table 6.07.B, released 23 October 2026");
  ok(QMD.indexOf("cf_targets.json") >= 0 && !D.targets_2025, "the page loads the shared cf_targets.json; no second copy of the targets");
  KEYS.forEach(k => ok(CT.monthly[k].length === 12 && CT.monthly[k].every(v => v > 0 && v < 1), `monthly ${k}: 12 values`));
  // the 2025 annual value is the hour-weighted mean of the monthly values, within EIA's rounding and capacity weighting
  KEYS.forEach(k => {
    const m = CT.monthly[k].reduce((s, v, i) => s + v * D.year.monthDays[i] * 24, 0) / H;
    ok(near(m, T[k], 0.003), `monthly ${k} average ${m.toFixed(4)} is close to the annual ${T[k]}`);
  });
  ok(D.year.monthDays.reduce((a, b) => a + b) * 24 === H && year.demand.length === H, "2025: 365 days, 8,760 hours in the year file");
  ok(year.start_utc === "2025-01-01T07:00:00" && D.year.utcOffsetHours === -6, "year file index 0 = 00:00-01:00 Central standard time on 1 January");
  ok(D.apply.mw === town.fleet.wind.mw, "step 8 uses Prairie Town's wind farm size from town.json");
}

// ---------------- profiles: the data rule (rescaled shapes, clipped at the size, annual CF = target)
{
  // the raw shapes are not capacity factors: their mean is far from the targets
  const mean = k => year[k].reduce((a, b) => a + b) / year[k].length / 1000;
  ok(Math.abs(mean("wind") - T.wind) > 0.1 && Math.abs(mean("solar") - T.solar) < 0.01, `raw shape means: wind ${mean("wind").toFixed(3)}, solar ${mean("solar").toFixed(3)} (not capacity factors)`);
  KEYS.forEach(k => {
    const w = W[k];
    ok(w.out.length === H, `${k}: 8,760 hourly outputs`);
    ok(w.out.every(v => v >= 0 && v <= P + 1e-9), `${k}: every hour between 0 and the plant's size`);
    ok(near(w.energy, M.sum(w.out)) && near(w.cf, M.capacityFactor(w.out, P)), `${k}: energy and capacity factor identities`);
    ok(pct(w.cf) === pct(T[k]), `${k}: annual capacity factor ${pct(w.cf)} matches the EIA target ${pct(T[k])}`);
  });
  ok(near(W.wind.cf, T.wind, 1e-6) && near(W.solar.cf, T.solar, 1e-6), "wind and solar: annual capacity factor equals the target exactly (bisection)");
  ok(W.nuclear.energy === (H - D.nuclear.outageHours) * P && D.nuclear.outageHours / 24 === 32.5, "nuclear: full size except a 780-hour (32.5-day) outage");
  ["wind", "solar"].forEach(k => W[k].monthly.forEach((v, i) => ok(near(v, CT.monthly[k][i], 0.0035), `${k} month ${i + 1}: ${pct(v)} close to EIA ${pct(CT.monthly[k][i])}`)));
  const a = D.nuclear.outageStartDay * 24, b = a + D.nuclear.outageHours, md = D.year.monthDays;
  ok(a >= (md[0] + md[1]) * 24 && b <= (md[0] + md[1] + md[2] + md[3]) * 24, "nuclear outage lies in March and April (spring)");
  // the shared helper does the scaling, method "power": the best hours reach the plant's size (why: see the JS header)
  ["wind", "solar"].forEach(k => ok(near(W[k].max, P, 1e-6), `${k}: the best hour reaches the full ${P} MW (power method)`));
  const plain = PR.townProfile("wind", P, { year: year, targets: CT, method: "scale" });
  ok(plain.peakFrac < 0.66 && near(plain.cf, T.wind, 1e-9), `the "scale" method would cap wind at ${Math.round(plain.peakFrac * 100)}% of its size, which this lesson avoids`);
  ok(JS.indexOf('method: "power", monthlyCF: monthlyCF') >= 0, "profile() calls the shared helper (townProfile with its monthlyCF option)");
  ok(CT.monthly.year === 2025 && /6\.07\.B/.test(CT.monthly.source) && CT.monthly.accessed && CT.monthly.url === CT.source.url, "monthly capacity factors: the shared file names EIA's table, the year and the access date");
  // the shared helper's monthly option on its own: each month at EIA's value, then the year at the annual target
  const viaHelper = PR.townProfile("wind", P, { year: year, targets: CT, method: "power", monthlyCF: true });
  ok(viaHelper.mw.every((x, i) => near(x, W.wind.out[i], 1e-9)) && viaHelper.monthly.length === 12, "townProfile(..., {monthlyCF: true}) gives the lesson's wind year");
  const again = M.profile(year, "wind", P, T.wind, D, CT.monthly.wind);
  ok(again.every((x, i) => near(x, W.wind.out[i], 1e-9)), "profile() is deterministic");
  // night-time solar is zero in the data itself (the town data build step); the lesson keeps zero hours at zero
  ok(year.solar.every((x, i) => x > 0 || W.solar.out[i] === 0), "solar: hours that are zero in town_year.json stay zero");
  ok(JS.indexOf("sunUp") < 0 && !D.solarClean, "no lesson-local night cleaning (the data build does it)");
  console.log(`year: nuclear ${int(W.nuclear.energy)} MWh (${pct(W.nuclear.cf)}), wind ${int(W.wind.energy)} MWh (${pct(W.wind.cf)}, best hour ${W.wind.max.toFixed(1)} MW), solar ${int(W.solar.energy)} MWh (${pct(W.solar.cf)})`);
}

// ---------------- the solar day and the flat line
{
  const i0 = M.dayIndex(year, D.day.date, D.day.utcOffsetHours);
  ok(W.dayCut.length === 24 && W.dayCut.every((b, t) => b === Math.round(W.solar.out[i0 + t])), "day: the year profile's day, 24 rounded hourly outputs");
  // the stored day (data file) is the year profile's day after the 2026-11-02 night-time refresh of town_year.json; with the
  // file before that refresh a few hours differ by 1 MW, never more
  const dmax = Math.max(...W.dayBars.map((b, t) => Math.abs(b - W.dayCut[t])));
  ok(D.day.bars.length === 24 && W.dayBars.every((b, t) => b === D.day.bars[t]) && dmax <= 1, `day: stored day within 1 MW of the year profile every hour (largest gap ${dmax} MW)`);
  ok(/illustrative solar day based on SPP observations/i.test(D.day.about), "day: labelled illustrative, based on SPP observations");
  // the static table on the page (no JavaScript) lists the same 24 numbers and the worked calculation
  const fb = (QMD.match(/<div class="lx-fallback">[\s\S]*?<p class="lx-hint">/) || [""])[0];
  const cells = [...fb.matchAll(/<tr><td>(\d\d):00<\/td><td>(\d+)<\/td><td>(\d\d):00<\/td><td>(\d+)<\/td><\/tr>/g)];
  ok(cells.length === 12 && cells.every(c => +c[2] === W.dayBars[+c[1]] && +c[4] === W.dayBars[+c[3]]), "fallback: the static hourly table matches the solar day");
  ok(fb.indexOf(`add up to ${int(W.dayEnergy)} MWh`) >= 0 && fb.indexOf(`${int(W.dayEnergy)} ÷ (100 × 24) = ${pct(W.dayCF)}`) >= 0, `fallback: ${int(W.dayEnergy)} ÷ (100 × 24) = ${pct(W.dayCF)}`);
  ok(fb.indexOf(`<b>Below ${tb.cutIn} m/s</b>`) >= 0 && fb.indexOf(`<b>${tb.cutIn} to ${tb.ratedSpeed} m/s</b>`) >= 0 && fb.indexOf(`<b>${tb.ratedSpeed} to ${tb.cutOut} m/s</b>`) >= 0 &&
     fb.indexOf(`holds at ${int(tb.ratedKW)} kW`) >= 0 && fb.indexOf(`<b>Above ${tb.cutOut} m/s</b>`) >= 0, "fallback: the turbine's four operating regions");
  ok(D.day.date === "2025-09-03" && D.day.utcOffsetHours === town.scenarios.lesson0.utcOffsetHours && D.day.date === town.scenarios.lesson0.date, "day: the lesson-0 day, in the same local time");
  ok(W.dayBars.slice(0, 6).every(b => b === 0) && W.dayBars.slice(21).every(b => b === 0), "day: dark at night");
  ok(near(W.dayCF, W.dayEnergy / (P * 24)) && near(W.dayAvg / P, W.dayCF), "day: CF = E / (P x 24) = average / P");
  for (let L = 0; L <= P; L++) {
    const z = M.levels(W.dayBars, L);
    ok(near(z.above - z.below, z.total - z.line), `levels L=${L}: above - below = bars - line`);
    ok(M.levelled(W.dayBars, L, 1) === (Math.abs(L - W.dayAvg) <= 0.5 + 1e-9), `levelled L=${L} iff within half a 1 MW step of the average`);
  }
  const ok2 = [];
  for (let L = 0; L <= P; L++) if (M.levelled(W.dayBars, L, 1)) ok2.push(L);
  ok(ok2.length === 1 && ok2[0] === Math.round(W.dayAvg), `the slider (1 MW steps) passes exactly one line, ${ok2.join(",")} MW (the nearest MW to ${W.dayAvg.toFixed(2)})`);
  ok(!M.levelled(W.dayBars, Math.floor(W.dayAvg), 1) || Math.abs(W.dayAvg - Math.floor(W.dayAvg)) <= 0.5, "the MW below the average does not pass when it is further than half a step");
  ok(JS.indexOf("Level to the nearest MW") >= 0 && JS.indexOf("Exactly level is") >= 0, "step 3 feedback says level to the nearest MW and gives the exact level");
  ok(JS.indexOf("the day from lesson 0. Slide") < 0 && JS.indexOf("reshaped to U.S. averages") >= 0, "step 3 calls the day reshaped, not real");
  console.log(`day ${D.day.date}: ${W.dayBars.join(",")} = ${W.dayEnergy} MWh, average ${W.dayAvg.toFixed(2)} MW, CF ${pct(W.dayCF)}, sunlit-only ${pct(W.dayLitCF)}, best ${W.dayBest} MW`);
}

// ---------------- the power curve
{
  for (let v = tb.cutIn; v * 2 <= tb.ratedSpeed + 1e-9; v += 0.5) ok(near(M.power(2 * v, tb), 8 * M.power(v, tb), 1e-6), `cube law: P(${2 * v}) = 8 P(${v})`);
  for (let v = tb.ratedSpeed; v <= tb.cutOut; v += 0.5) ok(M.power(v, tb) === tb.ratedKW, `rated: P(${v}) = ${tb.ratedKW} kW`);
  [0, 1, 2.9, 25.5, 26].forEach(v => ok(M.power(v, tb) === 0, `no output at ${v} m/s`));
  ok(near(M.power(tb.ratedSpeed - 1e-9, tb), tb.ratedKW, 1e-3), "continuous at the rated speed");
  for (let v = tb.cutIn; v <= tb.cutOut; v += 0.5) ok(M.power(v, tb) <= 16 / 27 * M.windPower(v, tb), `below the Betz limit at ${v} m/s`);
  ok(Math.round(M.windPower(12, tb)) === 8313 && (M.power(12, tb) / M.windPower(12, tb)).toFixed(2) === "0.36", "Go deeper: 8,313 kW through the rotor, Cp 0.36 at 12 m/s");
  ok(Math.round(M.power(5, tb)) === 217 && Math.round(M.power(10, tb)) === 1736 && Math.round(M.power(8, tb)) === 889, "cube step: 217 -> 1,736 kW; rated step from 889 kW");
  ok(tb.cutIn === 3 && tb.ratedSpeed / 2 === 6 && 8 * 2 > tb.ratedSpeed && 8 * 2 < tb.cutOut, "step texts: 'between 3 and 6 m/s' stays on the cube law; 'start at 8 m/s' passes the rated speed");
  ok(JS.indexOf("Set a speed between 3 and 6 m/s") >= 0 && JS.indexOf("Now start at 8 m/s") >= 0, "step texts present");
  // feedback after a double, for every reachable start (0.5 m/s slider steps, double allowed while 2v <= maxSlider)
  for (let v = 0.5; 2 * v <= tb.maxSlider + 1e-9; v += 0.5) {
    ["cube", "rated"].forEach(mode => {
      const f = M.windFeedback(mode, v, 2 * v, tb), p0 = M.power(v, tb), p1 = M.power(2 * v, tb);
      const eight = p0 > 0 && near(p1 / p0, 8, 1e-9);
      if (/eight times/i.test(f.text)) ok(eight, `${mode} ${v} -> ${2 * v}: says "eight times" only when output really multiplies by 8 (${p0.toFixed(0)} -> ${p1.toFixed(0)} kW)`);
      if (/only × ([\d.]+)/.test(f.text)) ok(f.text.indexOf("× " + (p1 / p0).toFixed(1)) >= 0, `${mode} ${v}: the ratio shown is the model's`);
      ok(!/do not turn/.test(f.text), `${mode} ${v}: no claim that the blades stand still`);
      if (v < tb.cutIn) ok(!f.ok && /no electricity/.test(f.text), `${mode} ${v}: below cut-in, no electricity and no pass`);
      if (mode === "cube") ok(f.ok === (v >= tb.cutIn && 2 * v <= tb.ratedSpeed), `cube ${v}: passes iff both speeds lie between cut-in and rated`);
      else ok(f.ok === (v >= tb.cutIn && 2 * v > tb.ratedSpeed && 2 * v <= tb.cutOut), `rated ${v}: passes iff the double crosses the rated speed and stays below cut-out`);
    });
  }
  ok(M.windFeedback("rated", 2, 4, tb).text.indexOf("eight times") < 0 && Math.round(M.power(4, tb)) === 111, "rated step from 2 m/s: 0 -> 111 kW, no 'eight times again'");
}

// ---------------- 1 MW in a year and the apply step
{
  KEYS.forEach(k => ok(near(W[k].perMW, 8760 * T[k]) && near(W[k].homesPerMW, 8760 * T[k] * 1000 / D.homes.kwhPerHomeYear), `1 MW of ${k}: ${int(W[k].perMW)} MWh, ${int(W[k].homesPerMW)} homes`));
  ok(int(W.nuclear.perMW) === "7,980" && int(W.wind.perMW) === "2,961" && int(W.solar.perMW) === "2,102", "1 MW: 7,980 / 2,961 / 2,102 MWh");
  ok(int(W.nuclear.homesPerMW) === "740" && int(W.wind.homesPerMW) === "274" && int(W.solar.homesPerMW) === "195", "homes: 740 / 274 / 195");
  ok(int(W.applyMWh) === "444,132", "apply: 150 MW x 8,760 h x 0.338 = 444,132 MWh");
  ok(JS.indexOf("8,760 hours of 2025, 1 MW would make 8,760 MWh in the year") >= 0, "step 7 text: 8,760 h and MWh");
  ok(JS.indexOf("32.5 days in spring") >= 0, "year step note: the 32.5-day outage");
  ok(JS.indexOf("enough for about") < 0 && JS.indexOf("yearly electricity purchases of about") >= 0 && JS.indexOf("not supply in every hour") >= 0, "homes: a yearly energy match, not hourly supply");
  ok(/residential utility customer/.test(D.sources.eia_homes.as_of) && /residential customer/.test(QMD), "homes: EIA's denominator is a residential customer");
  // the explain layer's Python: separate variables, and the comments are the model's numbers
  const py = M.pyCode(W, D);
  ok(/^solar_day_mw = \[/.test(py) && py.indexOf("solar_day_cf = energy_mwh / (100 * 24)") >= 0 && py.indexOf("wind_year_mwh = wind_mw * 8760 * wind_cf") >= 0, "python: solar day and wind year in separate variables");
  ok(!/\bcf\b/.test(py.replace(/_cf\b/g, "")) && py.indexOf("wind_cf = 0.338") >= 0 && py.indexOf("wind_mw = 150") >= 0, "python: no shared cf variable; wind_cf = 0.338 and wind_mw = 150 are explicit");
  const pyList = JSON.parse(py.match(/solar_day_mw = (\[[^\]]*\])/)[1]);
  ok(pyList.join() === W.dayBars.join() && py.indexOf(W.dayCF.toFixed(3)) >= 0 && py.indexOf(int(W.dayEnergy) + " MWh") >= 0 && py.indexOf(int(150 * 8760 * 0.338) + " MWh") >= 0,
     `python: the list, ${int(W.dayEnergy)} MWh, ${W.dayCF.toFixed(3)} and ${int(150 * 8760 * 0.338)} MWh match the model`);
  ok(JS.indexOf("code: pyCode(W, D)") >= 0, "the equation card shows pyCode");
  ok(JS.indexOf('unit: "a fraction, often shown as %"') >= 0 && JS.indexOf("24% = 0.24") >= 0, "equation: CF is a fraction, 24% = 0.24");
  ok(JS.indexOf("ranks the energy job") < 0, "explain: capacity factor ranks energy per MW, not the 'energy job'");
}

// ---------------- Go deeper: the measured power curve (NREL/TP-5000-63684, Table 6)
{
  const MS = D.measured, rows = M.measured(D);
  ok(D.sources[MS.source] && /docs\.nlr\.gov\/docs\/fy15osti\/63684\.pdf$/.test(D.sources[MS.source].url) && D.sources[MS.source].accessed, "measured: source NREL/TP-5000-63684 with URL and access date");
  ok(MS.bins.length === 42 && MS.bins.every(b => b.length === 4), "measured: 42 bins of [m/s, kW, N, Category A kW]");
  ok(near(MS.bins.reduce((a, b) => a + b[2], 0) * 10 / 60, MS.hoursValid, 0.5), `measured: ${MS.bins.reduce((a, b) => a + b[2], 0)} ten-minute averages = ${MS.hoursValid} hours, as the report states`);
  ok(MS.bins.every((b, i) => i === 0 || b[0] > MS.bins[i - 1][0]), "measured: wind speeds increase bin by bin");
  rows.forEach(r => ok(near(r.sd, MS.bins.find(b => b[0] === r.v)[3] * Math.sqrt(r.n)), `measured ${r.v}: spread = Category A x sqrt(N)`));
  const A = Math.PI * Math.pow(MS.rotorM / 2, 2);
  const cps = MS.bins.filter(b => b[0] > MS.cutIn).map(b => b[1] * 1000 / (0.5 * MS.airDensity * A * Math.pow(b[0], 3)));
  ok(Math.max(...cps).toFixed(2) === MS.cpBest.toFixed(2), `measured: best power coefficient ${Math.max(...cps).toFixed(4)} rounds to ${MS.cpBest}`);
  rows.filter(r => r.v >= 5.9 && r.v <= 8.1).forEach(r => ok(Math.abs(r.kw / r.clean - 1) <= 0.05, `"6 to 8 m/s follow the cube law closely": ${r.v} m/s within 5% (${(r.kw / r.clean).toFixed(3)})`));
  const knee = Math.pow(MS.ratedKW * 1000 / (0.5 * MS.airDensity * A * MS.cpBest), 1 / 3);
  ok(Math.round(knee) === 10, `"a sharp corner near 10 m/s": the clean curve reaches ${MS.ratedKW} kW at ${knee.toFixed(2)} m/s`);
  const at14 = rows.find(r => r.v === 13.97), at10 = rows.find(r => r.v === 10.03);
  ok(at14.kw / MS.ratedKW > 0.98 && at10.kw / MS.ratedKW < 0.85 && MS.ratedSpeed === 14, "\"full power near 14 m/s\": 99% at 13.97 m/s, 80% at 10.03 m/s; rated speed 14 m/s (Table 1)");
  ok(MS.bins.filter(b => b[0] < 2.9).every(b => b[1] < 0 && b[1] > -6), "measured: below 3 m/s the idle turbine draws about 5 kW");
  // the static table in the Go deeper box matches the model
  const tb6 = (QMD.match(/<div id="t5-measured"[\s\S]*?<\/table>/) || [""])[0];
  const trs = [...tb6.matchAll(/<tr><td>([\d.]+)<\/td><td>([\d,]+)<\/td><td>([\d,]+)<\/td><td>([\d,]+)<\/td><\/tr>/g)];
  ok(trs.length === 7, "measured: 7 rows in the static table");
  trs.forEach(t => {
    const r = rows.find(x => x.v.toFixed(2) === t[1]);
    ok(r && int(r.kw) === t[2] && int(r.sd) === t[3] && int(r.clean) === t[4], `measured static row ${t[1]} m/s: ${t[2]} kW ± ${t[3]}, clean ${t[4]} kW`);
  });
  ok(QMD.indexOf("best $C_p$, 0.52") >= 0 && QMD.indexOf("capped at 1,500 kW") >= 0 && MS.ratedKW === 1500, "measured: page states Cp 0.52 and 1,500 kW");
  ok(Math.round(Math.PI * 50 * 50) === 7854, "Go deeper: a 100 m rotor sweeps 7,854 m²");
  // the wind-power formula gives watts; the page says so and converts to kW
  ok(Math.round(M.windPower(12, tb) * 1000 / 1000) === 8313 && QMD.indexOf("With the units below this gives watts; divide by 1,000 for kilowatts.") >= 0 && QMD.indexOf("about 8,313,000 W, or 8,313 kW") >= 0, "Go deeper: ½ρAv³ in watts, divided by 1,000 for kW");
  // the measured curve's vocabulary: bins and one standard deviation of the records, not an error bar on the mean
  ok(QMD.indexOf("(a 0.5 m/s bin)") >= 0 && /term="standard-deviation"/.test(QMD) && QMD.indexOf("not an error bar on the average") >= 0 && !/±1 SD/.test(QMD + JS), "measured curve: bin and standard deviation explained; no bare 'SD'");
  ok(/two stated exceptions, for which it added uncertainty/.test(MS.about) && /section 8\.1/.test(MS.about) && !/The test met the IEC/.test(MS.about), "measured: the data file states the report's two exceptions to IEC 61400-12-1");
}

// ---------------- every number with a unit in the page's prose matches the model, the data file or a quiz option
{
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "")
    .replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<!-- learn:next:start[\s\S]*?learn:next:end -->/, "")
    .replace(/<!-- learn:footer:start[\s\S]*?learn:footer:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<table class="lx-facts">[\s\S]*?<\/table>/, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "")
    .replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/https?:\/\/[^\s"')]+/g, " ");
  const prose = strip(QMD);
  const m12 = k => CT.monthly[k].map(v => +(v * 100).toFixed(1));
  const allowed = {
    "MWh": new Set([798000, 296088, 210240, 876000, 105120, 8760, 7980, 911, 91.1, W.dayEnergy].map(Number)),
    "%": new Set([91.1, 33.8, 24.0, 100, 48.0, 12.0, +(W.dayCF * 100).toFixed(1)].concat(
      [Math.min(...m12("wind")), Math.max(...m12("wind")), Math.min(...m12("solar")), Math.max(...m12("solar")), Math.min(...m12("nuclear")), Math.max(...m12("nuclear"))])),
    "MW": new Set([3, 50, 1, 100, D.measured.ratedKW / 1000]), "kW": new Set([8313, tb.ratedKW, D.measured.ratedKW]),
    "m/s": new Set([tb.cutIn, tb.ratedSpeed, tb.cutOut, 8, 10, D.measured.ratedSpeed, /Bins of 0\.5 m\/s/.test(D.measured.about) ? 0.5 : NaN]), "h": new Set([8760]), "hours": new Set([8760])
  };
  ok(+(105120 / (50 * 8760) * 100).toFixed(1) === 24.0 && near(7980, Math.round(8760 * T.nuclear)), "quiz answers: 24.0% and 7,980 MWh");
  ok(int(W.nuclear.energy) === "798,000" && int(W.wind.energy) === "296,088" && int(W.solar.energy) === "210,240" && int(P * H) === "876,000", "fallback table energies from the model");
  ok(m12("wind")[8] === 23.1 && m12("wind")[2] === 43.1 && m12("solar")[11] === 13.1 && m12("solar")[5] === 31.9 && m12("solar")[6] === 31.9 && m12("nuclear")[9] === 81.0 && m12("nuclear")[11] === 99.2,
     "Go deeper months: wind Sep 23.1 / Mar 43.1, solar Dec 13.1 / Jun-Jul 31.9, nuclear Oct 81.0 / Dec 99.2");
  const rx = /(\d[\d,]*(?:\.\d+)?)\s*(MWh|MW|kW|m\/s|%|hours\b|h\b)/g;
  let m, seen = 0;
  while ((m = rx.exec(prose))) {
    const v = +m[1].replace(/,/g, ""), unit = m[2];
    seen++;
    ok(allowed[unit] && allowed[unit].has(v), `page states "${m[0].trim()}" — matches the model, the data file or a quiz option`);
  }
  ok(seen >= 30, `page: ${seen} numbers with units checked`);
  ok(QMD.indexOf("3000 \\times (v/12)^3") >= 0 && QMD.indexOf("3 \\le v < 12") >= 0 && QMD.indexOf("12 \\le v \\le 25") >= 0, "Go deeper: the power-curve formula uses the turbine's numbers");
  ok(QMD.indexOf("8,313 kW") >= 0 && QMD.indexOf("C_p = 3{,}000 / 8{,}313 = 0.36") >= 0 && QMD.indexOf("| $\\rho$ | air density, kg/m³ | 1.225 kg/m³") >= 0 && QMD.indexOf("7,854 m², a 100 m rotor") >= 0 && tb.airDensity === 1.225 && tb.rotorM === 100, "Go deeper: rotor, density, Cp (symbol table)");
  // sourced facts keep their source and date
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  [pct(T.nuclear), pct(T.wind), pct(T.solar), "18–24 months", int(D.homes.kwhPerHomeYear) + " kWh"].forEach(s => ok(facts.indexOf(s) >= 0, `facts table: ${s}`));
  ok((facts.match(/<tr>/g) || []).length - 1 === (facts.match(/eia\.gov/g) || []).length, "facts table: every row links an EIA source");
  ok(/18 to 24 months/.test(D.sources.eia_refuel.as_of) && /10,791/.test(D.sources.eia_homes.as_of), "facts table numbers are in the data file's source notes");
}

// ---------------- scope: deny-list, the nuclear-plus-risk combination (sentence level), links on the allow-list
{
  const text = QMD + "\n" + JS + "\n" + JSON.stringify(D);
  const deny = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
    /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/, /artificial intelligence/i, /ChatGPT|Claude/];
  deny.forEach(r => ok(!r.test(text), `scope: no ${r}`));
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  const RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  // what a reader can see: the page without its generated blocks, every string literal of the lesson JS, every string in the data file
  const page = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]);
  const vals = []; (function walk(o) { if (typeof o === "string") vals.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  const sentences = [page.replace(/<[^>]+>/g, " ")].concat(lits, vals).join("\n").split(/(?<=[.!?])\s+|\n+/);
  sentences.forEach(s => ok(!(NUC.test(s) && RISK.test(s)), `scope: nuclear term with a risk term in "${s.slice(0, 90)}"`));
  // the lesson's own links (the course's allowed link destinations). The generated meta, next and footer blocks are left
  // out: the course build step writes them for every lesson (the footer's licence links are a documented allowance of the
  // scope scan, SCANNER_ALLOW), and the scope scan checks the rendered page as a whole.
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
  const ALLOW = /^(https:\/\/(www\.|docs\.)?(eia\.gov|energy\.gov|ferc\.gov|nerc\.com|nrel\.gov|nlr\.gov|doi\.org)\/|https:\/\/github\.com\/Henryutd2021\/mfgpr-wind-power-curve|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  let nl = 0;
  for (const h of own.matchAll(/href="([^"]+)"|\]\(([^)]+)\)/g)) { const u = h[1] || h[2]; nl++; ok(u === "../files/papers/li2023multi.html" || ALLOW.test(u), `link on the allow-list: ${u}`); }
  ok(nl >= 10 && !/creativecommons|opensource/.test(own), `${nl} lesson links checked; no licence domains in the lesson's own content`);
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
