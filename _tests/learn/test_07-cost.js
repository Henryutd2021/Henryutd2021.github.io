// test_07-cost.js — Node tests for Lesson 7 (assets/learn/07-cost.js): the model's identities and edge cases, its data
// (assets/learn/data/07-cost.json with town.json and town_days.json), every number the page states, and the text budget.
// Usage (from the site folder):  node _tests/learn/test_07-cost.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/07-cost.js"));
const J = p => JSON.parse(fs.readFileSync(path.join(SITE, p), "utf8"));
const D = J("assets/learn/data/07-cost.json"), town = J("assets/learn/data/town.json"), days = J("assets/learn/data/town_days.json");
const QMD = fs.readFileSync(path.join(SITE, "learn/07-cost.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/07-cost.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const money = (v, d = 2) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, `page states ${s}${msg ? " (" + msg + ")" : ""}`);
let seed = 7;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

// ---------------- the capital recovery factor and discounting
for (const n of [1, 5, 20, 30, 40]) {
  ok(near(M.crf(0, n), 1 / n), `crf(0, ${n}) = 1/n`);
  ok(near(M.crf(1e-9, n), 1 / n, 1e-6), `crf tends to 1/n as r -> 0 (n = ${n})`);
  for (const r of [0.01, 0.04, 0.07, 0.12]) {
    let annuity = 0; for (let t = 1; t <= n; t++) annuity += M.pv(1, r, t);
    ok(near(M.crf(r, n) * annuity, 1, 1e-12), `crf(${r}, ${n}) repays 1 in present value`);
  }
}
ok(near(M.crf(0.05, 1), 1.05), "crf over one year = 1 + r");
ok(near(M.pv(100, 0.07, 0), 100) && near(M.pv(100, 0, 30), 100), "pv: no wait or no rate leaves $100");
ok(near(M.realRate(0.069, 0.025) * 100, 4.29, 0.005) && near(M.realRate(0.056, 0.025) * 100, 3.02, 0.005), "ATB 2025: 5.6-6.9% nominal is about 3.0-4.3% real");
ok(D.finance.wacc >= 3.0 && D.finance.wacc <= 4.3, "default real WACC lies inside the ATB's real range");
const b60 = M.blend(D.finance, 60), b0 = M.blend(D.finance, 0);
ok(near(b60.nominal, 7) && near(b0.nominal, 10), "blend: 60% loans at 5% and 40% equity at 10% = 7%; all equity = 10%");
ok(near(b60.real, (1.07 / 1.025 - 1) * 100), "blend: real = (1 + nominal) / (1 + inflation) - 1");

// ---------------- LCOE: parts add up, NPV is zero at the LCOE, monotonic responses
for (const k of M.TECHS) {
  const p = M.inputs(D, k), L = M.lcoe(p);
  ok(near(L.total, L.capital + L.fom + L.fuel + L.vom), `${k}: parts add up to the total`);
  ok(near(M.npv(p, L.total).npv, 0, 1e-6), `${k}: NPV is zero at the LCOE`);
  ok(M.npv(p, L.total + 1).npv > 0 && M.npv(p, L.total - 1).npv < 0, `${k}: NPV rises with the price`);
  ok(near(L.E, D.techs[k].cf / 100 * 8.76), `${k}: MWh per kW-yr = CF x 8.76`);
  ok(near(L.fuel, D.techs[k].heatRate * D.fuel.gas), `${k}: fuel = heat rate x gas price`);
  ok((D.techs[k].heatRate > 0) === (L.fuel > 0), `${k}: only gas plants have a fuel cost`);
  const N = M.npv(p, L.total);
  ok(near(N.costs, N.revenue, 1e-6), `${k}: discounted costs = discounted sales at the LCOE`);
  ok(M.lcoe(M.inputs(D, k, { cf: D.techs[k].cf + 5 })).total < L.total, `${k}: a higher capacity factor lowers LCOE`);
  ok(M.lcoe(M.inputs(D, k, { wacc: D.finance.wacc + 1 })).total > L.total, `${k}: a higher rate raises LCOE`);
  ok(M.lcoe(M.inputs(D, k, { capex: D.techs[k].capex * 1.1 })).total > L.total, `${k}: a higher building cost raises LCOE`);
  ok(near(M.lcoe(M.inputs(D, k, { wacc: 0 })).capital, D.techs[k].capex / D.finance.life / L.E), `${k}: at r = 0 capital per MWh = capex / life / E`);
}
for (let i = 0; i < 400; i++) {
  const k = M.TECHS[Math.floor(rnd() * 4)], o = { capex: 500 + rnd() * 2500, cf: 5 + rnd() * 90, wacc: rnd() * 12, life: 10 + Math.floor(rnd() * 31), gas: 1.5 + rnd() * 10 };
  const p = M.inputs(D, k, o), L = M.lcoe(p);
  ok(near(M.npv(p, L.total).npv, 0, 1e-6), `random ${i} (${k}): NPV zero at the LCOE`);
  ok(L.total > 0 && isFinite(L.total), `random ${i}: LCOE positive and finite`);
}

// ---------------- tornado
for (const k of M.TECHS) {
  const t = M.tornado(D, k);
  ok(near(t.base, M.lcoe(M.inputs(D, k)).total), `${k} tornado: base = default LCOE`);
  ok(t.rows.every((r, i) => i === 0 || t.rows[i - 1].swing >= r.swing), `${k} tornado: rows sorted by swing`);
  ok(t.rows.every(r => r.min <= t.base + 1e-9 && r.max >= t.base - 1e-9), `${k} tornado: every bar straddles the base`);
  ok(t.rows.length === (D.techs[k].heatRate > 0 ? 6 : 5), `${k} tornado: gas price row only for gas plants`);
}
ok(M.tornado(D, "wind").rows[0].name === "cf", "wind tornado: the capacity factor leads (the predict answer)");
ok(M.tornado(D, "cc").rows[0].name === "gas", "combined-cycle tornado: the gas price leads (the step's hint)");

// ---------------- when the energy arrives
const B = D.blindspot, sp = days.days[B.day];
ok(sp.date === "2025-07-29" && B.dateLabel === "29 July 2025", "arrival: the day is 29 July 2025, as the page says");
for (let s = B.solarMW; s <= B.solarMax; s += B.solarStep) {
  const A = M.arrival(town, days, D, s);
  ok(A.hours.every(h => h.setBy !== "short"), `arrival ${s} MW: the fleet meets demand every hour`);
  ok(A.hours.every(h => [0, town.fleet.cc.cost, town.fleet.peaker.cost].indexOf(h.value) >= 0), `arrival ${s} MW: each hour saves $0, $40 or $100`);
  A.hours.forEach(h => ok(h.value === 0 ? h.residual <= 0 : h.residual > 0, `arrival ${s} MW h${h.t}: $0 exactly when wind and sun are spilled`));
  if (s > B.solarMW) ok(A.value.solar <= M.arrival(town, days, D, s - B.solarStep).value.solar + 1e-9, `arrival ${s} MW: a solar MWh is worth no more than with less solar`);
}
const A200 = M.arrival(town, days, D), A400 = M.arrival(town, days, D, 400);
ok(Math.max(...A200.hours.map(h => h.demand)) === B.demandPeakMW, "arrival: the hottest day peaks at lesson 0's 450 MW scale");

// ---------------- every number the page states
const L = k => M.lcoe(M.inputs(D, k));
const rows = [...QMD.matchAll(/<tr><td>([^<]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><\/tr>/g)];
ok(rows.length === 4, "fallback table: four plants");
rows.forEach((r, i) => {
  const x = L(M.TECHS[i]);
  ["capital", "fom", "fuel", "vom", "total"].forEach((c, j) => ok(r[j + 2] === x[c].toFixed(2), `fallback ${M.TECHS[i]} ${c}: ${r[j + 2]} = ${x[c].toFixed(2)}`));
});
has(money(A200.value.wind) + " and a solar MWh " + money(A200.value.solar), "myth: hottest-day values");
const w7 = M.lcoe(M.inputs(D, "wind", { wacc: 7 })).total;
has(money(L("wind").total) + " to " + money(w7) + " per MWh, by " + ((w7 / L("wind").total - 1) * 100).toFixed(1) + "%", "myth: 4% -> 7%");
has("at a 43% capacity factor instead of 33.8%, wind's LCOE falls from " + money(L("wind").total) + " to " + money(M.lcoe(M.inputs(D, "wind", { cf: 43 })).total), "myth: capacity factor");
has(money(130 / (0.30 * 8.76)) + "/MWh: 130 ÷ 2.628 = " + (130 / 2.628).toFixed(2), "quiz: LCOE from yearly cost");
ok((0.30 * 8.76).toFixed(3) === "2.628", "quiz: 30% capacity factor = 2.628 MWh per kW-yr");
has(money(M.pv(100, 0.07, 10)) + ": 100 ÷ 1.07¹⁰ = " + M.pv(100, 0.07, 10).toFixed(2), "quiz: present value");
const cw = M.crf(D.finance.wacc / 100, D.finance.life), Lw = L("wind");
has("= " + cw.toFixed(5) + "$", "Go deeper: CRF(4%, 30)");
has("\\times 1{,}712 + 34.57 = " + (cw * 1712 + 34.57).toFixed(2), "Go deeper: yearly cost per kW");
has("0.338 \\times 8.76 = " + Lw.E.toFixed(3), "Go deeper: MWh per kW");
has("= \\$" + Lw.total.toFixed(2) + "$ per MWh", "Go deeper: wind LCOE");
ok(near((cw * 1712 + 34.57) / Lw.E, Lw.total), "Go deeper: the worked example is the model's LCOE");
has("$" + D.techs.wind.capex.toLocaleString("en-US") + "/kW", "numbers: wind building cost");
has("$" + D.techs.cc.capex.toLocaleString("en-US") + "/kW", "numbers: combined-cycle building cost");
has(D.techs.wind.cf.toFixed(1) + "% · " + D.techs.solar.cf.toFixed(1) + "%", "numbers: 2025 capacity factors");
has("$" + D.fuel.gas.toFixed(2) + "/MMBtu", "numbers: 2025 gas cost");
has("$" + D.fuel.gasRange[1].toFixed(2) + " in 2022", "numbers: 2022 gas cost");
has(D.finance.life + " years", "numbers: cost recovery period");
ok(D.fuel.gasRange[0] === 2.40 && D.fuel.gasRange[1] === 7.21, "data: gas range = EIA Table 7.4 lowest (2020) and highest (2022) of 2015-2025");

// ---------------- data: sources and dates
const SRC = D.sources;
Object.keys(D.techs).forEach(k => (D.techs[k].src || []).forEach(s => ok(SRC[s], `data: ${k} source ${s} is listed`)));
(D.finance.src || []).concat(D.fuel.src || []).forEach(s => ok(SRC[s], `data: source ${s} is listed`));
Object.keys(SRC).forEach(s => ok(/^https:\/\/(www\.eia\.gov|atb\.nlr\.gov)\//.test(SRC[s].url) && SRC[s].asOf, `data: source ${s} has an allowed URL and an as-of date`));
[...QMD.replace(/<!-- learn:(meta|footer):start[\s\S]*?learn:\1:end -->/g, "").matchAll(/href="(https?:[^"]+)"/g)].forEach(m => ok(/^https:\/\/(www\.eia\.gov|atb\.nlr\.gov|docs\.nlr\.gov|doi\.org)\//.test(m[1].replace(/&amp;/g, "&")), `page link ${m[1]} is on the allow-list`));

// ---------------- text budget and scope (also enforced by scripts/learn_scope_scan.py)
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n?\s*build/g)].map(m => m[1]);
ok(stepTexts.length === 8, `eight step cards (${stepTexts.length})`);
stepTexts.forEach((t, i) => { const n = t.split(/\s+/).length; ok(n >= 20 && n <= 42, `step ${i + 1}: ${n} words (about 35)`); });
const all = (QMD + JS + JSON.stringify(D)).toLowerCase();
["learning curve", "learning rate", "foak", "noak", "first-of-a-kind", "subsidy-free", "break-even capital", "order book", "projects/", "research.html", "smr"]
  .forEach(w => ok(all.indexOf(w) < 0, `scope: no "${w}"`));
ok(!/\bai\b/i.test(QMD + JS), "scope: no AI wording");
const strings = [...JS.replace(/^\s*\/\/.*$/gm, "").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).join(" ");
ok(!/nuclear|reactor/i.test(QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "") + strings), "scope: lesson 7's text names no nuclear technology (the calculator covers wind, solar and gas only)");

console.log(`wind ${money(L("wind").total)}, solar ${money(L("solar").total)}, gas CC ${money(L("cc").total)}, peaker ${money(L("peaker").total)}; hottest day: solar ${money(A200.value.solar)} -> ${money(A400.value.solar)} at 400 MW`);
console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
