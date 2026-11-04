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

// ---------------- the explain equation follows the calculator (regression: it read the store once, at mounting)
ok(M.explainInputs(D, null).tech === "wind" && !M.explainInputs(D, null).own, "explain: wind defaults before the calculator is used");
for (const [k, o] of [["wind", { cf: 40, capex: 1500 }], ["cc", { gas: 7.2, wacc: 6 }], ["solar", { cf: 28 }], ["peaker", { cf: 20, gas: 3 }]]) {
  const p = M.inputs(D, k, o), stored = JSON.parse(JSON.stringify({ tech: k, inputs: p, L: M.lcoe(p) }));   // as LX.store keeps it
  const X = M.explainInputs(D, stored), Lx = M.lcoe(X.p);
  ok(X.own && X.tech === k && near(Lx.total, stored.L.total, 1e-9) && near(Lx.E, stored.L.E, 1e-12) && near(Lx.crf, stored.L.crf, 1e-12), `explain: after changing ${k}'s inputs the equation shows the calculator's LCOE`);
}
ok(/if \(user \|\| acted\) \{ LX\.store\.set\("c7-calc"[^\n]*refreshExplain\(\)/.test(JS) && /return drawEq;/.test(JS) && /refreshExplain = buildExplain\(/.test(JS), "explain: every calculator change redraws the equation card");

// ---------------- the cash-flow chart's axis holds the whole path (no silent clipping)
for (let price = 20; price <= 80; price += 0.5) {
  const path = M.npv(M.inputs(D, "wind"), price).path, ax = M.cashAxis(path);
  ok(ax.lo <= Math.min(...path) && ax.hi >= Math.max(...path), `cash axis at $${price}: holds the path`);
  ok(ax.ticks.length >= 3 && ax.ticks.length <= 8 && ax.ticks.indexOf(0) >= 0, `cash axis at $${price}: 3-8 ticks including zero`);
}
ok(M.npv(M.inputs(D, "wind"), 80).path[30] > 1000, "cash axis: at $80/MWh the wind farm ends above $1,000 per kW (the old axis stopped there)");

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
ok(Math.max(...A200.hours.map(h => h.demand)) === B.demandPeakMW, "arrival: the summer peak-demand day peaks at lesson 0's 450 MW scale");
// the hourly value is a marginal value; what a whole farm saves is the change in the day's running cost (Go deeper states both)
const cut = M.runCost(town, A200) - M.runCost(town, A400), added = A400.hours.reduce((a, h) => a + h.solar, 0) - A200.hours.reduce((a, h) => a + h.solar, 0);
ok(cut > 0 && added > 0, "arrival: growing solar 200 -> 400 MW cuts the day's running cost");
ok(M.runCost(town, A200) === A200.hours.reduce((a, h) => { const r = Math.max(0, h.residual), cc = Math.min(r, town.fleet.cc.mw); return a + cc * town.fleet.cc.cost + (r - cc) * town.fleet.peaker.cost; }, 0), "runCost: combined-cycle first, then the peaker");
ok(A200.spilled === 0 && A400.spilled > 0, "arrival: nothing spilled at 200 MW; some sun spilled at 400 MW");
ok(Math.abs(cut / added - A400.value.solar) > 1, "arrival: the average marginal value at 400 MW differs from the day's saving per added MWh (the page explains why)");

// ---------------- every number the page states
const L = k => M.lcoe(M.inputs(D, k));
const rows = [...QMD.matchAll(/<tr><td>([^<]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><\/tr>/g)];
ok(rows.length === 4, "fallback table: four plants");
rows.forEach((r, i) => {
  const x = L(M.TECHS[i]);
  ["capital", "fom", "fuel", "vom", "total"].forEach((c, j) => ok(r[j + 2] === x[c].toFixed(2), `fallback ${M.TECHS[i]} ${c}: ${r[j + 2]} = ${x[c].toFixed(2)}`));
});
has(money(A200.value.wind) + " on average and a solar MWh " + money(A200.value.solar), "myth: peak-demand-day values");
has("growing solar from " + B.solarMW + " to 400 MW cuts the day's running cost by " + money(cut, 0) + ", or " + money(cut / added) + " per added MWh", "Go deeper: total saving against the hourly value");
has("With no fuel and zero upkeep per MWh", "quiz: the calculation question fixes fuel and upkeep per MWh");
ok(!/hottest/i.test(QMD + JS + JSON.stringify(D)), "the day is named by its demand (no temperature data): no 'hottest'");
const w7 = M.lcoe(M.inputs(D, "wind", { wacc: 7 })).total;
has(money(L("wind").total) + " to " + money(w7) + " per MWh, by " + ((w7 / L("wind").total - 1) * 100).toFixed(1) + "%", "myth: 4% -> 7%");
has("at a 43% capacity factor instead of 33.8%, wind's LCOE falls from " + money(L("wind").total) + " to " + money(M.lcoe(M.inputs(D, "wind", { cf: 43 })).total), "myth: capacity factor");
has(money(130 / (0.30 * 8.76)) + "/MWh: 130 ÷ 2.628 = " + (130 / 2.628).toFixed(2), "quiz: LCOE from yearly cost");
ok((0.30 * 8.76).toFixed(3) === "2.628", "quiz: 30% capacity factor = 2.628 MWh per kW-yr");
has(money(M.pv(100, 0.07, 10)) + ": 100 ÷ 1.07¹⁰ = " + M.pv(100, 0.07, 10).toFixed(2), "quiz: present value");
const cw = M.crf(D.finance.wacc / 100, D.finance.life), Lw = L("wind");
has("= " + cw.toFixed(7) + "$", "Go deeper: CRF(4%, 30)");
ok((+cw.toFixed(7) * 1712 + 34.57).toFixed(2) === (cw * 1712 + 34.57).toFixed(2) && QMD.indexOf("$" + cw.toFixed(7) + " \\times 1{,}712 + 34.57 = " + (+cw.toFixed(7) * 1712 + 34.57).toFixed(2) + "$") >= 0, "Go deeper: the printed factor reproduces the printed yearly cost (shared fix 11, K3)");
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

// ---------------- the real-world box: the approved excerpt E3.14 (Henry, 2026-11-03; reports/learn/excerpts_for_approval.md),
// word for word (glossary marks aside), with CF2's citation footer, and no other sentence about the study
const E314 = "A higher hydrogen price makes each kilogram worth more, so the optimizer builds a larger electrolyzer to capture more surplus wind. The extra capacity runs fewer full-load hours, so the cost per kilogram, the levelized cost of hydrogen, goes up. Yet the added hydrogen revenue lowers the net cost of the whole system. The cost per kilogram and the system's cost move in opposite directions.";
{
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const real = (own.match(/<div class="lx-card lx-real">([\s\S]*?)<\/div>/) || ["", ""])[1];
  const bq = real.match(/<blockquote class="lx-excerpt" data-source="excerpt:wind-hydrogen">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/);
  const words = h => h.replace(/<\/p><p>/g, " ").replace(/<[^>]+>/g, "").trim();
  ok(bq && words(bq[1]) === E314, "real world: the approved excerpt E3.14, word for word");
  ok(bq && bq[2] === 'Approved excerpt of: Li et al. (2024), <a href="https://doi.org/10.1115/1.4063971">Journal of Mechanical Design</a>.', "real world: the excerpt's citation footer is CF2's, with the DOI");
  ok((own.match(/lx-excerpt/g) || []).length === 1, "page: one excerpt only");
  const rest = real.replace(/<blockquote[\s\S]*?<\/blockquote>/, "");
  ok(/<p>A levelized cost and a system's cost can move in opposite directions\.<\/p>/.test(rest), "real world: the box's own first sentence stays");
  ok(/<a href="cf2-cost-per-kg-vs-system-cost\.html">CF2<\/a>/.test(rest), "real world: links case file CF2 for the full case");
  ok(!/\b(my|our) study|In my|electrolyzer|optimizer|kilogram/i.test(rest.replace(/<a [^>]*>[^<]*<\/a> \([^)]*\)/g, "")), "real world: no wording about the study outside the excerpt");
}

// ---------------- text budget: about 35 words per element (42 at most), one or two sentences; also enforced by review
const plain = t => t.replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "x")
  .replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => (plain(t).replace(/^(Myth|Fact)\.\s+/, "").replace(/\b(e\.g|i\.e|et al|U\.S)\./g, "$1").match(/[.?!](\s|$)/g) || []).length;
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n?\s*build/g)].map(m => m[1]);
ok(stepTexts.length === 8, `eight step cards (${stepTexts.length})`);
stepTexts.forEach((t, i) => { const n = nWords(t); ok(n >= 20 && n <= 42, `step ${i + 1}: ${n} words (about 35)`); ok(nSent(t) <= 3, `step ${i + 1}: at most three short sentences`); });
// the page: every paragraph, list item, definition, table cell and summary outside the generated blocks, and the Markdown
// paragraphs and list items of the Go deeper boxes (display math does not count)
const BODY = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
const srcCard = (BODY.match(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/) || [""])[0];
const htmlEls = [...BODY.matchAll(/<(p|li|dd|td|summary)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => ({ t: m[2], cite: srcCard.indexOf(m[0]) >= 0 }));
const mdEls = BODY.replace(/```\{=html\}[\s\S]*?```/g, "\n\n").split(/\n\s*\n/).map(x => x.trim()).filter(x => x && !/^(:::|\$\$)/.test(x))
  .flatMap(x => x.split(/\n(?=- )/)).map(t => ({ t: t.replace(/^- /, ""), cite: false }));
htmlEls.concat(mdEls).forEach(e => {
  const n = nWords(e.t);
  ok(n <= 42, `page element of ${n} words (about 35): "${plain(e.t).slice(0, 70)}..."`);
  if (!e.cite) ok(nSent(e.t) <= 2, `page element in one or two sentences (${nSent(e.t)}): "${plain(e.t).slice(0, 70)}..."`);
});
ok(htmlEls.length > 40 && mdEls.length > 10, `budget check sees the page (${htmlEls.length} html elements, ${mdEls.length} Markdown)`);
// the script: every learner-facing literal, and each composed sentence (a literal + value + literal line counts the values as one word each)
const code = JS.slice(JS.indexOf("// ---------------------------------------------------------------- view")).replace(/^\s*\/\/.*$/gm, "");
[...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).filter(t => / \S+ \S+ \S+ /.test(t) && !/[{};]|^\.|var\(/.test(t))
  .forEach(t => { ok(nWords(t) <= 42, `script text of ${nWords(t)} words: "${t.slice(0, 70)}..."`); ok(nSent(t) <= 3, `script text in short sentences: "${t.slice(0, 70)}..."`); });
let composed = 0;
code.split("\n").filter(l => /api\.saw\(|\.reveal\(|hint: function|textContent = |note: "|lede: "/.test(l)).forEach(l => {
  const lits = [...l.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).join(" "), vals = (l.match(/"\s*\+\s*[^"+]+?\s*\+\s*"/g) || []).length;
  const n = nWords(lits) + vals;
  if (/api\.saw\(|\.reveal\(/.test(l)) composed++, ok(n <= 42, `composed text of about ${n} words: ${l.trim().slice(0, 80)}...`);
});
ok(composed >= 8, `budget check sees the composed feedback (${composed} lines)`);
// notes from the data file shown on the page (slider hints and the tornado note)
Object.keys(D.techs).forEach(k => ok(nWords(D.techs[k].cfNote) <= 35, `${k} cfNote: ${nWords(D.techs[k].cfNote)} words`));
[D.finance.waccNote, D.fuel.gasNote].forEach(t => ok(nWords(t) <= 35, `hint note: ${nWords(t)} words`));
Object.keys(D.techs).forEach(k => { const t = D.techs[k].cfNote + " " + D.tornadoRanges.note + (D.techs[k].heatRate ? " " + D.tornadoRanges.gasNote : ""); ok(nWords(t) <= 42, `${k} tornado note: ${nWords(t)} words`); });
ok(/illustrative bounds in 2025 dollars/.test(D.fuel.gasNote) && /illustrative bounds in 2025 dollars/.test(D.tornadoRanges.gasNote), "gas range: labelled illustrative 2025-dollar bounds (the 2020 and 2022 averages are in their own years' dollars)");
Object.keys(D.techs).forEach(k => ok(D.techs[k].design, `${k}: the EIA design behind the inputs is named`));
ok(/U\.S\. utility-scale solar photovoltaic generators in 2025/.test(D.techs.solar.cfNote) && /U\.S\. utility-scale wind and solar photovoltaic generators in 2025/.test(QMD) && !/photovoltaic plants/.test(QMD + JSON.stringify(D)),
   "solar 24.0%: EIA Table 4.08.B's population, utility-scale generators (W3 shared fix 2; as A2 says it)");
const all = (QMD + JS + JSON.stringify(D)).toLowerCase();
["learning curve", "learning rate", "foak", "noak", "first-of-a-kind", "subsidy-free", "break-even capital", "order book", "projects/", "research.html", "smr"]
  .forEach(w => ok(all.indexOf(w) < 0, `scope: no "${w}"`));
ok(!/\bai\b/i.test(QMD + JS), "scope: no AI wording");
const strings = [...JS.replace(/^\s*\/\/.*$/gm, "").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).join(" ");
ok(!/nuclear|reactor/i.test(QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "") + strings), "scope: lesson 7's text names no nuclear technology (the calculator covers wind, solar and gas only)");

console.log(`wind ${money(L("wind").total)}, solar ${money(L("solar").total)}, gas CC ${money(L("cc").total)}, peaker ${money(L("peaker").total)}; peak-demand day: solar ${money(A200.value.solar)} -> ${money(A400.value.solar)} at 400 MW`);
console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
