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
  // night-time solar is zero in the data itself (scripts/build_learn_town_data.py); the lesson keeps zero hours at zero
  ok(year.solar.every((x, i) => x > 0 || W.solar.out[i] === 0), "solar: hours that are zero in town_year.json stay zero");
  ok(JS.indexOf("sunUp") < 0 && !D.solarClean, "no lesson-local night cleaning (the data build does it)");
  console.log(`year: nuclear ${int(W.nuclear.energy)} MWh (${pct(W.nuclear.cf)}), wind ${int(W.wind.energy)} MWh (${pct(W.wind.cf)}, best hour ${W.wind.max.toFixed(1)} MW), solar ${int(W.solar.energy)} MWh (${pct(W.solar.cf)})`);
}

// ---------------- the solar day and the flat line
{
  const i0 = M.dayIndex(year, D.day.date, D.day.utcOffsetHours);
  ok(W.dayBars.length === 24 && W.dayBars.every((b, t) => b === Math.round(W.solar.out[i0 + t])), "day: 24 rounded hourly outputs cut from the year profile");
  ok(D.day.date === "2025-09-03" && D.day.utcOffsetHours === town.scenarios.lesson0.utcOffsetHours && D.day.date === town.scenarios.lesson0.date, "day: the lesson-0 day, in the same local time");
  ok(W.dayBars.slice(0, 6).every(b => b === 0) && W.dayBars.slice(21).every(b => b === 0), "day: dark at night");
  ok(near(W.dayCF, W.dayEnergy / (P * 24)) && near(W.dayAvg / P, W.dayCF), "day: CF = E / (P x 24) = average / P");
  for (let L = 0; L <= P; L++) {
    const z = M.levels(W.dayBars, L);
    ok(near(z.above - z.below, z.total - z.line), `levels L=${L}: above - below = bars - line`);
    ok(M.levelled(W.dayBars, L) === (Math.abs(L - W.dayAvg) <= 1 + 1e-9), `levelled L=${L} iff within 1 MW of the average`);
  }
  const ok2 = [Math.floor(W.dayAvg), Math.ceil(W.dayAvg)].filter(L => M.levelled(W.dayBars, L));
  ok(ok2.length >= 1 && !M.levelled(W.dayBars, Math.round(W.dayAvg) + 2), "the slider (1 MW steps) can reach a levelled line");
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
}

// ---------------- 1 MW in a year and the apply step
{
  KEYS.forEach(k => ok(near(W[k].perMW, 8760 * T[k]) && near(W[k].homesPerMW, 8760 * T[k] * 1000 / D.homes.kwhPerHomeYear), `1 MW of ${k}: ${int(W[k].perMW)} MWh, ${int(W[k].homesPerMW)} homes`));
  ok(int(W.nuclear.perMW) === "7,980" && int(W.wind.perMW) === "2,961" && int(W.solar.perMW) === "2,102", "1 MW: 7,980 / 2,961 / 2,102 MWh");
  ok(int(W.nuclear.homesPerMW) === "740" && int(W.wind.homesPerMW) === "274" && int(W.solar.homesPerMW) === "195", "homes: 740 / 274 / 195");
  ok(int(W.applyMWh) === "444,132", "apply: 150 MW x 8,760 h x 0.338 = 444,132 MWh");
  ok(JS.indexOf("8,760 hours of 2025, it would make 8,760 MWh") >= 0, "step 7 text: 8,760 h and MWh");
  ok(JS.indexOf("32.5 days in spring") >= 0, "year step note: the 32.5-day outage");
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
    "MWh": new Set([798000, 296088, 210240, 876000, 105120, 8760, 7980, 911, 91.1].map(Number)),
    "%": new Set([91.1, 33.8, 24.0, 100, 48.0, 12.0].concat(
      [Math.min(...m12("wind")), Math.max(...m12("wind")), Math.min(...m12("solar")), Math.max(...m12("solar")), Math.min(...m12("nuclear")), Math.max(...m12("nuclear"))])),
    "MW": new Set([3, 50, 1, 100]), "kW": new Set([8313, 3000]), "m/s": new Set([12]), "h": new Set([8760]), "hours": new Set([8760])
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
  ok(QMD.indexOf("8,313 kW") >= 0 && QMD.indexOf("C_p = 0.36") >= 0 && QMD.indexOf("\\rho = 1.225") >= 0 && tb.airDensity === 1.225 && tb.rotorM === 100, "Go deeper: rotor, density, Cp");
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
  const ALLOW = /^(https:\/\/(www\.)?(eia\.gov|energy\.gov|ferc\.gov|nerc\.com|doi\.org|creativecommons\.org|opensource\.org)\/|https:\/\/github\.com\/Henryutd2021\/mfgpr-wind-power-curve|mailto:|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  for (const h of QMD.matchAll(/href="([^"]+)"|\]\(([^)]+)\)/g)) { const u = h[1] || h[2]; ok(ALLOW.test(u), `link on the allow-list: ${u}`); }
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
