// test_profiles.js — Node tests for the capacity-factor helper (assets/learn/components/profiles.js) and its sourced
// targets (assets/learn/data/cf_targets.json), on the real SPP 2025 shapes in town_year.json.
//   - the convention: the shapes are normalised to their own maximum hour, so mean/max is not the capacity factor
//   - both methods hit the target annual capacity factor; "scale" clips at capacity, "power" keeps the best hour at capacity
//   - zero hours stay zero; output never exceeds capacity; a day shape scales the same way as the year
//   - the targets carry a primary source (EIA Electric Power Monthly Table 6.07.B) with a URL, an issue and an access date
// Usage (from the site folder):  node _tests/learn/test_profiles.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const ctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), ctx);
const P = ctx.module.exports;
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const days = JSON.parse(fs.readFileSync(L("data/town_days.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

// ---------------- the targets and their source
ok(T.targets.wind.cf === 0.338 && T.targets.solar.cf === 0.240 && T.targets.wind.year === 2025, "cf_targets: wind 33.8%, solar PV 24.0% (2025)");
ok(/eia\.gov\/electricity\/monthly\/epm_table_grapher\.php\?t=epmt_6_07_b/.test(T.source.url) && /6\.07\.B/.test(T.source.title) && /^\d{4}-\d\d-\d\d$/.test(T.source.accessed) && T.source.issue,
   "cf_targets: primary source with URL, table, issue and access date");
["wind", "solar"].forEach(k => ok(near(mean(year[k]) / 1000, days.stats[k + "_mean_over_max"], 0.0006), `convention: ${k} mean/max ${(mean(year[k]) / 1000).toFixed(3)} matches town_days stats, and is not the target ${T.targets[k].cf}`));

// ---------------- both methods, both technologies
["wind", "solar"].forEach(tech => ["scale", "power"].forEach(method => {
  const p = P.townProfile(tech, 150, { year, targets: T, method }), cf = T.targets[tech].cf;
  ok(p.mw.length === 8760 && near(mean(p.mw) / 150, cf, 1e-9), `${tech} ${method}: annual capacity factor ${(mean(p.mw) / 150).toFixed(6)} = target ${cf}`);
  ok(near(p.cf, cf, 1e-9), `${tech} ${method}: reported cf equals the target`);
  ok(p.mw.every(v => v >= 0 && v <= 150 + 1e-9), `${tech} ${method}: output between 0 and capacity`);
  ok(year[tech].every((v, i) => v > 0 || p.mw[i] === 0), `${tech} ${method}: zero hours stay zero`);
  if (method === "power") ok(near(p.peakFrac, 1) && p.clippedHours === 0 && p.gamma > 0, `${tech} power: best hour at capacity, no clipping (gamma ${p.gamma.toFixed(3)})`);
  else ok(near(p.peakFrac, Math.min(1, p.k)) && (p.k > 1) === (p.clippedHours > 0), `${tech} scale: k ${p.k.toFixed(3)}, peak ${(100 * p.peakFrac).toFixed(0)}% of capacity, ${p.clippedHours} clipped hours`);
  const day = days.days.summer_peak[tech], scaled = p.scaleDay(day);
  ok(scaled.length === 24 && scaled.every((v, i) => near(v, method === "power" ? (day[i] > 0 ? 150 * Math.pow(day[i] / 1000, p.gamma) : 0) : 150 * Math.min(1, p.k * day[i] / 1000))), `${tech} ${method}: scaleDay applies the same scaling to a day`);
}));
const ws = P.townProfile("wind", 150, { year, targets: T });
ok(ws.k < 1 && ws.peakFrac < 0.7, `wind scale: the documented consequence holds (windiest hour ${(100 * ws.peakFrac).toFixed(0)}% of capacity)`);
// a higher target forces clipping with "scale"
const hi = P.townProfile("solar", 100, { year, annualCF: 0.3 });
ok(hi.k > 1 && hi.clippedHours > 0 && near(mean(hi.mw) / 100, 0.3), `solar scale to 30%: clipped ${hi.clippedHours} hours, capacity factor exact`);
// monthlyCF: each month first brought to EIA's monthly value, then the year to the annual target (both methods)
["power", "scale"].forEach(method => ["wind", "solar"].forEach(tech => {
  const mp = P.townProfile(tech, 100, { year, targets: T, method, monthlyCF: true });
  ok(near(mean(mp.mw) / 100, T.targets[tech].cf) && mp.monthly.length === 12 && mp.monthlyTargets.join() === T.monthly[tech].join(),
     `monthlyCF ${tech} (${method}): annual ${(100 * mean(mp.mw) / 100).toFixed(1)}% exact; 12 monthly values reported`);
  const worst = Math.max(...mp.monthly.map((v, i) => Math.abs(v - T.monthly[tech][i])));
  ok(worst < 0.01, `monthlyCF ${tech} (${method}): every month within 1 point of EIA's (worst ${(100 * worst).toFixed(2)})`);
}));
ok(P.monthDays({ start_utc: "2024-01-01T06:00:00" })[1] === 29 && P.monthDays(year)[1] === 28, "monthDays: leap years");
// errors
const bad = (f, rx, m) => { let e = null; try { f(); } catch (x) { e = x; } ok(e && rx.test(e.message), m); };
bad(() => P.townProfile("solar", 100, { year, annualCF: 0.7 }), /out of reach/, "error: a solar target above the share of daylight hours");
bad(() => P.townProfile("coal", 100, { year, annualCF: 0.3 }), /tech/, "error: unknown technology");
bad(() => P.townProfile("wind", 100, { annualCF: 0.3 }), /opts\.year/, "error: no year data");
bad(() => P.townProfile("wind", 100, { year }), /annualCF/, "error: no target");
bad(() => P.townProfile("wind", 100, { year, annualCF: 0.3, monthlyCF: [0.3] }), /12 values/, "error: monthlyCF with the wrong length");
console.log(`  wind scale k ${ws.k.toFixed(4)} (peak ${(100 * ws.peakFrac).toFixed(1)}%), wind power gamma ${P.townProfile("wind", 1, { year, targets: T, method: "power" }).gamma.toFixed(3)}, solar scale k ${P.townProfile("solar", 1, { year, targets: T }).k.toFixed(4)}`);
console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
