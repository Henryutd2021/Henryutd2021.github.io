// test_a02-contracts-risk.js — Node tests for Analyst lesson A2 (assets/learn/a02-contracts-risk.js): the simulation is
// seeded and reproducible; on a large sample the drivers match their stated distributions; each contract's settlement
// identities hold year by year; the fair prices give an expected settlement of zero; the "who carries which risk" table
// follows from the formulas; the drill's answers are right; and every number the page states matches the model at seed
// 2025 (statements one by one, a whitelist scan of the visible text, printed calculations recomputed). Every risk number
// on the page is a named statistic (P10, median, P90, mean) of the simulated years.
// Usage (from the site folder):  node _tests/learn/test_a02-contracts-risk.js [--write]   (--write rewrites the no-JS table)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/a02-contracts-risk.js"));
const K5 = require(path.join(SITE, "assets/learn/k05-probability-statistics.js"));
const read = f => JSON.parse(fs.readFileSync(path.join(SITE, f), "utf8"));
const D7 = read("assets/learn/data/07-cost.json"), DA = read("assets/learn/data/a02-contracts-risk.json"), CF = read("assets/learn/data/cf_targets.json");
const QPATH = path.join(SITE, "learn/a02-contracts-risk.qmd");
const sm = M.summary(D7, DA), T = M.texts(sm), B = M.staticBlocks(sm), P0 = sm.P0, F = sm.F;
const BLOCKS = { "a2-table": "table" };
function blockRe(name) { return [new RegExp("<!-- " + name + ":start[^>]*-->\\n"), "<!-- " + name + ":end -->"]; }
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = q.match(ra), b = q.indexOf(end);
    if (!a || b < a.index) throw new Error(name + " markers missing");
    q = q.slice(0, a.index + a[0].length) + B[BLOCKS[name]] + "\n" + q.slice(b);
  });
  fs.writeFileSync(QPATH, q); console.log("no-JS table written");
}
const QMD = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/a02-contracts-risk.js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/a02-contracts-risk.yml"), "utf8");
const PATHY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || JSON.stringify(str)));
const { musd, mrange, usd, pct } = M;
const S = sm.solar;

// ---------------- inputs
{
  ok(P0.cf === 24 && D7.techs.solar.cf === 24 && near(CF.targets.solar.cf, 0.24, 1e-9), "inputs: solar capacity factor 24.0%, as lesson 7 and cf_targets.json (EIA 2025)");
  ok(P0.E0 === 210240 && P0.L === 210240 && P0.D === 73000 && P0.kW === 50000, "inputs: typical output 210,240 MWh, the buyer's flat 210,240 MWh, 73,000 MWh discharged, 50,000 kW");
  ok(DA.sim.years === 200 && DA.sim.seed === 2025 && sm.seed === 2025, "simulation: 200 price years, seed 2025 by default");
  ok(DA.priceYear === 2025 && /real 2025 dollars/.test(DA.about) && /illustrative/.test(DA.about) && /drawn independently/.test(DA.about), "data: one price year, illustrative and independent drivers, stated");
  ok(/data-src="\.\.\/assets\/learn\/data\/07-cost\.json \.\.\/assets\/learn\/data\/a02-contracts-risk\.json"/.test(QMD) && /data\["a02_contracts_risk"\]/.test(JS), "inputs: the page reads both data files");
}

// ---------------- the simulation: seeded, reproducible, as stated
{
  const a = M.simulate(DA, 2025), b = M.simulate(DA, 2025), c = M.simulate(DA, 2026);
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && a.length === 200, "seed: the same seed gives the same 200 years, another seed others");
  const big = M.simulate(DA, 99, 200000), st = k => M.stats(big.map(y => y[k])), e = M.expected(DA);
  ok(near(st("P").mean, e.P, 0.1) && near(st("P").p50, DA.sim.hub.median, 0.15), "draws: hub price mean and median as stated (large sample)");
  ok(near(st("c").mean, 0.85, 0.002) && st("c").min >= 0.65 && st("c").max <= 1.05, "draws: capture ratio mean 0.85, cut at 0.65 and 1.05");
  ok(near(st("v").mean, 1, 0.002) && st("v").min >= 0.88 && st("v").max <= 1.12, "draws: output mean 1, cut at 0.88 and 1.12");
  ok(near(st("b").mean, -2, 0.03) && near(Math.sqrt(big.reduce((q, y) => q + (y.b + 2) * (y.b + 2), 0) / big.length), 2.5, 0.03), "draws: basis mean −$2, standard deviation $2.50");
  ok(near(st("s").p50, 40, 0.3) && near(st("s").mean, e.s, 0.3), "draws: battery margin median $40");
  // the drivers are drawn independently: their sample correlations are near zero
  const corr = (k, j) => { const x = big.map(y => y[k]), z = big.map(y => y[j]), mx = x.reduce((p, q) => p + q, 0) / x.length, mz = z.reduce((p, q) => p + q, 0) / z.length;
    let sxz = 0, sx = 0, sz = 0; x.forEach((v, i) => { sxz += (v - mx) * (z[i] - mz); sx += (v - mx) ** 2; sz += (z[i] - mz) ** 2; }); return sxz / Math.sqrt(sx * sz); };
  let maxc = 0; M.DRIVERS.forEach((k, i) => M.DRIVERS.slice(i + 1).forEach(j => { maxc = Math.max(maxc, Math.abs(corr(k, j))); }));
  ok(maxc < 0.01, "draws: independent (largest sample correlation " + maxc.toFixed(4) + ")");
  // percentiles as K5's (type 7)
  const xs = a.map(y => y.P).sort((p, q) => p - q);
  ok(near(M.quantile(xs, 0.1), K5.quantile(xs, 0.1), 1e-12) && near(M.quantile(xs, 0.9), K5.quantile(xs, 0.9), 1e-12), "statistics: percentiles as toolbox K5");
}

// ---------------- the contracts: identities year by year; fair prices
{
  let bad = 0;
  sm.years.forEach(y => {
    const E = y.v * P0.E0;
    const m = M.year(P0, y, "merchant", "none"), n = M.year(P0, y, "node", "none", F.node), h = M.year(P0, y, "hub", "none", F.hub), bl = M.year(P0, y, "block", "none", F.block);
    if (!near(m.R, E * (y.c * y.P + y.b), 1e-6) || !near(m.Y, P0.L * y.P, 1e-6)) bad++;
    if (!near(n.R, E * F.node, 1e-6) || !near(n.R - n.Y, m.R - m.Y, 1e-6)) bad++;            // the settlement only moves money: what the seller gains, the buyer pays
    if (!near(h.R, E * (F.hub + y.b), 1e-6) || !near(h.R - h.Y, m.R - m.Y, 1e-6)) bad++;
    if (!near(bl.Y, P0.L * F.block, 1e-6) || !near(bl.R - bl.Y, m.R - m.Y, 1e-6)) bad++;
    const own = M.year(P0, y, "merchant", "merchant", null, F.toll), toll = M.year(P0, y, "merchant", "toll", null, F.toll);
    if (!near(own.bat, y.s * P0.D, 1e-6) || !near(toll.bat, F.toll * P0.kW, 1e-6) || !near(toll.R - toll.Y, own.R - own.Y, 1e-6)) bad++;
  });
  ok(bad === 0, "contracts: settlement identities hold in all 200 years, and each settlement only moves money between the two (" + bad + " bad)");
  const e = M.expected(DA);
  ok(near(F.node, e.c * e.P + e.b) && near(F.hub, e.c * e.P) && near(F.block, e.P) && near(F.toll, e.s * P0.D / P0.kW), "fair prices: from the drivers' expected values");
  ok(usd(F.node) === "$28.69" && usd(F.hub) === "$30.69" && usd(F.block) === "$36.11" && (F.toll / 12).toFixed(2) === "5.17" && musd(sm.tollY, 2) === "$3.10M", "fair prices: $28.69, $30.69, $36.11/MWh and $5.17 per kW a month");
  // at the fair price the expected settlement is zero: on a large sample its mean is near zero
  const big = M.simulate(DA, 77, 100000);
  ["node", "hub", "block"].forEach(c => { const r = M.run(P0, big, c, "none", null, null, F), mx = M.stats(r.X).mean; ok(Math.abs(mx) < 0.01 * M.stats(r.R).mean, `fair: ${c}'s mean settlement on 100,000 years is ${(mx / 1e6).toFixed(3)} $M, near zero`); });
  // the seed's own averages differ from the expected values by sampling noise only
  ok(Math.abs(S.hub.sR.mean - S.merchant.sR.mean) < 0.2e6 && Math.abs(S.node.sR.mean - S.merchant.sR.mean) < 0.2e6, "fair: at seed 2025 the seller's averages agree within sampling noise");
}

// ---------------- who carries which risk: from the formulas
{
  const ex = (c, b) => { const e = M.exposure(P0, DA, c, b), o = {}; Object.keys(e).forEach(k => { o[k] = (e[k].seller ? "S" : "") + (e[k].buyer ? "B" : ""); }); return o; };
  const m = ex("merchant", "none"), n = ex("node", "none"), h = ex("hub", "none"), b = ex("block", "none");
  ok(m.P === "SB" && m.c === "S" && m.v === "S" && m.b === "S", "risk: no contract: the seller carries everything, the buyer the hub price through its bill");
  ok(n.P === "B" && n.c === "B" && n.v === "S" && n.b === "B", "risk: settled at the node: seller output only; buyer price, shape, basis");
  ok(h.P === "B" && h.c === "B" && h.v === "S" && h.b === "S", "risk: settled at the hub: the basis moves to the seller");
  ok(b.P === "S" && b.c === "S" && b.v === "S" && b.b === "S", "risk: a flat block: the seller carries all four, the buyer none");
  ok(ex("merchant", "merchant").s === "S" && ex("merchant", "toll").s === "B", "risk: the battery's margin: the owner, or the buyer under a toll");
  // and the simulated widths agree: the buyer's range is zero under the block, the seller's narrowest at the node
  ok(S.block.sY.width < 1 && S.node.sR.width < S.hub.sR.width && S.hub.sR.width < S.block.sR.width && S.block.sR.width < S.merchant.sR.width, "risk: the simulated P10 to P90 widths follow the table");
  ok(sm.plant.hub.toll.sR.width < sm.plant.hub.merchant.sR.width && sm.plant.hub.toll.sY.width > sm.plant.hub.merchant.sY.width, "risk: a toll narrows the seller's range and widens the buyer's");
}

// ---------------- the page at seed 2025: statements one by one
{
  ok(mrange(S.merchant.sR) === "$3.9M to $8.2M" && mrange(S.merchant.sY) === "$5.2M to $10.2M", "seed 2025: no contract");
  ok(mrange(S.node.sR) === "$5.8M to $6.3M" && mrange(S.node.sY) === "$6.8M to $8.6M", "seed 2025: node");
  ok(mrange(S.hub.sR) === "$5.3M to $6.7M" && mrange(S.hub.sY) === "$7.0M to $8.3M", "seed 2025: hub");
  ok(mrange(S.block.sR) === "$5.0M to $6.9M" && musd(S.block.sY.p50, 2) === "$7.59M" && S.block.sY.width < 1, "seed 2025: block");
  ok(mrange(sm.batM) === "$1.9M to $4.5M", "seed 2025: battery margin");
  has("Five things change each year: the hub price, the shape (how much of it solar hours catch), output, basis (node minus hub) and the battery's margin.");
  has("With no contract, the solar farm's sales run from $3.9M (P10) to $8.2M (P90) a year, and the buyer's bill from $5.2M to $10.2M.");
  has("leaves the seller only output risk ($5.8M to $6.3M); the buyer carries price, shape and basis ($6.8M to $8.6M)");
  has("Settled at the hub, the basis moves to the seller ($5.3M to $6.7M); the buyer's range narrows ($7.0M to $8.3M).");
  has("fixes the buyer's bill at $7.59M; the seller buys the hours its panels miss ($5.0M to $6.9M)");
  has("Tolled at $5.17 per kW a month, the battery pays its owner a fixed $3.10M a year, and its margin ($1.9M to $4.5M) moves to the buyer.");
  const z = sm.at("hub", "none", 5), a0 = sm.at("hub", "none", 0), zb = sm.at("block", "none", 5), a0b = sm.at("block", "none", 0);
  ok(musd(z.sR.mean - a0.sR.mean, 2) === "$1.05M" && musd(zb.sR.mean - a0b.sR.mean, 2) === "$1.05M" && near(zb.sR.mean - a0b.sR.mean, 5 * P0.L, 1e-3) && near(zb.sY.mean - a0b.sY.mean, 5 * P0.L, 1e-3) && near(z.sY.mean - a0.sY.mean, z.sR.mean - a0.sR.mean, 1e-3), "price: +$5 moves $1.05M a year from the buyer to the seller (block: exactly L × $5; hub: this seed's output)");
  has("A price $5.00 above fair moves $1.05M a year from the buyer to the seller; who carries which risk stays the same.");
  has("over the 200 years the solar farm averaged $5.92M a year with no contract and $6.01M settled at the hub");
  ok(musd(S.merchant.sR.mean, 2) === "$5.92M" && musd(S.hub.sR.mean, 2) === "$6.01M", "myth: the two averages");
  has("its sales still run from $5.3M to $6.7M (P10 to P90)"); has("the buyer pays $7.59M every year");
  const below = S.merchant.R.filter(v => v < S.merchant.sR.p10).length;
  ok(below === 20 && musd(S.merchant.sR.min) === "$2.4M", "myth: 20 years below the P10, the lowest $2.4M");
  has("With no contract, 20 of the 200 years fell below the P10 of $3.9M; the lowest was $2.4M.");
  const y1 = sm.years[0], hi = Math.max.apply(null, sm.years.map(y => y.P)), o1 = M.year(P0, y1, "hub", "none", F.hub);
  ok(y1.P === hi && usd(y1.P) === "$68.14" && musd(-o1.settle, 2) === "$5.00M" && o1.settle < 0, "quiz: year 1 is the highest hub price, $68.14, and the seller pays $5.00M");
  has("In price year 1 the hub averaged $68.14/MWh, the highest of the 200. Under the hub-settled fixed price of $30.69/MWh");
  ok(/data-id="highyear" data-answer="c"[\s\S]{0,500}<li data-value="c">The seller pays the buyer \$5\.00M<\/li>/.test(QMD) && /data-id="whichfixed" data-answer="d"[\s\S]{0,400}<li data-value="d">A flat block at a fixed price<\/li>/.test(QMD), "quiz: answers point at the right options");
  ok(/data-id="richer" data-answer="myth"/.test(QMD) && /data-id="hubsafe" data-answer="myth"/.test(QMD) && /data-id="block" data-answer="fact"/.test(QMD) && /data-id="worst" data-answer="myth"/.test(QMD), "myths: three myths, one fact");
  has("<td class=\"n\">$3.9M to $8.2M</td>"); has("<td class=\"n\">$5.3M to $6.7M</td>"); has("<td class=\"n\">$7.59M</td>");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = QMD.match(ra), b = QMD.indexOf(end);
    ok(a && b > a.index && QMD.slice(a.index + a[0].length, b).trim() === B[BLOCKS[name]].trim(), `page: the ${name} table equals staticBlocks() (run with --write)`);
  });
  // the seed is shown, and every spread is named as a statistic of the simulated years
  ok(/seed 2025/.test(QMD) && /"Seed " \+ ST\.seed \+ " · " \+ DA\.sim\.years \+ " price years"/.test(JS) && /"New seed"/.test(JS), "seed: shown on the page and in the interactive, with New seed");
  ok(/P10 and P90 are statistics of the 200 simulated years/.test(QMD) && /not the worst or best case/.test(QMD) && /not a forecast/.test(QMD), "statistics: P10 and P90 are named as statistics of the simulation, not forecasts or extremes");
  const vis = QMD.replace(/<!--[\s\S]*?-->/g, "");
  ok(!/\bthe risk is \$|\brisk of \$|\bwill (earn|pay)\b/i.test(vis), "statistics: no risk number is stated as the outcome");
  ["a01-project-tea.html", "k05-probability-statistics.html", "07-cost.html"].forEach(h => ok(QMD.indexOf('href="' + h + '"') >= 0, "links " + h));
  ok(!/href="[^"]*(m07|x05|projects\/|research\.)/i.test(QMD) && /M7 \(upcoming\)/.test(QMD) && /X5 \(upcoming\)/.test(QMD), "upcoming lessons are named, not linked");
  ok(/68227\.pdf">Wind Energy Finance[\s\S]*pp\. 27–28/.test(QMD) && /Physical PPA<\/a> \(updated 10 July 2026\)/.test(QMD) && /Financial PPA<\/a> \(updated 14 July 2026\)/.test(QMD) && /pp\. 121–122/.test(QMD) && /p\. 5 \(Table 1 note\) and p\. 34/.test(QMD) && /From the abstract/.test(QMD), "sources: primary, with pages or dates; the Joule paper read from its abstract");
}

// ---------------- scope: generic contract names, solar and storage only (G-FIN), no companies, no data centers or nuclear
{
  const body = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<li>Schwabe[\s\S]*?<\/li>/, "");
  ok(!/nuclear|reactor|\bSMR\b|data cent|learning/i.test(body + JS.replace(/\/\/.*$/gm, "")), "scope: no nuclear, data centers or learning wording");
  ok(!/\bwind\b|\bgas\b|coal|hydrogen/i.test(body.replace(/<li>(EPA|FERC|Kahrl|Millstein)[\s\S]*?<\/li>/g, "")) , "G-FIN: the contracts are for solar and a battery only (outside the source titles)");
  ok(!/\b(Inc|LLC|Corp|Ltd)\b|Google|Amazon|Microsoft|Meta\b|Apple|NextEra|Tesla|Fluence/.test(body + JS), "scope: no company names");
  ["fixed price", "as generated", "shaped", "hub"].forEach(t => ok(new RegExp(t, "i").test(body), "contract named generically: " + t));
}

// ---------------- every number in the visible text is one the model produces (whitelist scan)
{
  let body = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ");
  const allowed = new Set(), add = v => allowed.add(String(v));
  B.table.replace(/<[^>]+>/g, " ").match(/\d[\d,]*(?:\.\d+)?/g).forEach(add);
  [S.merchant.sR.mean, S.hub.sR.mean].forEach(v => add((v / 1e6).toFixed(2)));
  ["210,240", "68.14", "30.69", "5.17", "3.10", "1.9", "4.5", "2.4", "5.00", "1.05", "1.06", "24.0", "7.59"].forEach(add);
  [1, 2, 3, 4, 5, 7, 10, 14, 20, 27, 28, 34, 50, 70, 80, 90, 100, 121, 122, 200, 1749, 1775, 2017, 2021, 2024, 2025, 2026, "4.08", 6, "68227", "0.1"].forEach(add);
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "every number on the page is from the model or a structural count; unknown: " + unknown.join(" "));
  ok(found.length > 80, `the scan saw the page's numbers (${found.length})`);
}

// ---------------- messages: budgets and wording; the drill's arithmetic
function normCalc(str) { let t = String(str).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/[−–]/g, "-").replace(/\$/g, ""); while (/(\d),(\d{3})/.test(t)) t = t.replace(/(\d),(\d{3})/g, "$1$2"); return t; }
function evalSide(side) { const e = side.replace(/×/g, "*").replace(/÷/g, "/"); if (!/^[\d.\s()+\-*/]+$/.test(e)) return null; try { const v = Function('"use strict"; return (' + e + ");")(); return isFinite(v) ? v : null; } catch (err) { return null; } }
{
  const msgs = { year: T.year(sm.years[0], 1), run: T.run, node: T.node, hub: T.hub, block: T.block, toll: T.toll, price0: T.price("hub", 0), price5: T.price("hub", 5), priceM: T.price("block", -5) };
  Object.keys(msgs).forEach(k => { const w = msgs[k].replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).filter(Boolean).length; ok(w <= 36, `budget: message ${k} is ${w} words (≤ 36)`); });
  ok(/^\$5\.00 above the fair price: the seller averages \$1\.05M a year more and the buyer pays \$1\.05M more\./.test(T.price("hub", 5)) && /less/.test(T.price("block", -5)), "messages: the price message says who gains, both ways");
  const stepTexts = (JS.match(/^      text: "[^\n]*|steps\.push\(contractStep\("[a-z]+", \d, "[^\n]*/gm) || []);
  ok(stepTexts.length === 7, "steps: seven cards (" + stepTexts.length + ")");
  ["power-purchase-agreement", "trading-hub", "basis-risk", "capture-ratio", "tolling-agreement"].forEach(id => ok(new RegExp("id: " + id + "\\n").test(SIDE) && JS.indexOf("[[" + id + "|") >= 0, "glossary: " + id + " defined in the sidecar and marked"));
  const items = M.drill(42, 600), counts = {};
  let calc = 0;
  items.forEach((it, i) => {
    counts[it.kind] = (counts[it.kind] || 0) + 1;
    if (it.kind === "settle") { const m = /at \$(\d+)\/MWh\. Over the plant's ([\d,]+) MWh the hub averaged \$(\d+)/.exec(it.q); ok(near(it.answer, Math.round(+m[2].replace(/,/g, "") * (m[1] - m[3]) / 1e4) / 100), `drill ${i}: settle`); }
    if (it.kind === "block") { const m = /block of ([\d,]+) MWh at \$(\d+)\/MWh/.exec(it.q); ok(near(it.answer, Math.round(+m[1].replace(/,/g, "") * m[2] / 1e4) / 100), `drill ${i}: block`); }
    if (it.kind === "p10") { const xs = /sorted \(\$M\): ([\d., ]+)\. What/.exec(it.q)[1].split(", ").map(Number); ok(near(it.answer, Math.round(K5.quantile(xs, 0.1) * 100) / 100, 1e-9), `drill ${i}: p10`); }
    if (it.kind === "fair") { const m = /expected \$(\d+)\/MWh, solar capture ratio ([\d.]+), basis −\$(\d)\/MWh.*settled at the (node|hub)/.exec(it.q); ok(m && near(it.answer, Math.round((m[2] * m[1] - (m[4] === "node" ? +m[3] : 0)) * 100) / 100), `drill ${i}: fair`); }
    if (it.kind === "toll") { const m = /pays \$(\d+) per kW a year for ([\d,]+) kW and earns \$(\d+) per MWh on ([\d,]+) MWh/.exec(it.q); ok(near(it.answer, Math.round((m[3] * +m[4].replace(/,/g, "") - m[1] * +m[2].replace(/,/g, "")) / 1e4) / 100), `drill ${i}: toll`); }
    if (it.kind === "who") ok(it.choices.length === 2 && (it.answer === 0 || it.answer === 1), `drill ${i}: who`);
    // the worked answer's arithmetic: "a × (b − c) = d" style chains reproduce
    (normCalc(it.why).match(/[\d.()+\-× ]+=[ \d.\-]+/g) || []).forEach(run => { const [L, R] = run.split("="); const lv = evalSide(L.trim()); if (lv !== null && /^-?[\d.]+$/.test(R.trim())) { calc++; ok(Math.abs(lv - +R.trim()) < 0.006, `drill ${i}: ${run.trim()}`); } });
  });
  ok(Object.keys(counts).length === 6 && calc > 300, "drill: six kinds, and the worked answers' arithmetic checked (" + calc + ")");
  // the who items agree with the exposure table
  const ex = (c, b) => M.exposure(P0, DA, c, b);
  ok(ex("node", "none").b.buyer && ex("hub", "none").b.seller && ex("hub", "none").P.buyer && ex("node", "none").v.seller && ex("block", "none").c.seller && ex("block", "none").P.seller && ex("merchant", "toll").s.buyer, "drill: the who items' answers agree with exposure()");
}

// ---------------- the interactive: actions, live regions, demo, path.yml
{
  ok(/btn\.addEventListener\("click", function \(\) \{ k\+\+;[^\n]*show\(\); \}\)/.test(JS) && /api\.done\(\); api\.saw\(T\.year\(y, k\)\)/.test(JS), "step 1: a draw opens Next");
  ok(/seedRow\(host\); pair\(host, "none"\); api\.done\(\); api\.saw\(T\.run\)/.test(JS) && /function say\(k\) \{ if \(k === target\) api\.done\(\)/.test(JS) && /if \(on\) \{ api\.done\(\); api\.saw\(T\.toll\); \}/.test(JS) && /if \(user && ST\.off !== 0\) api\.done\(\)/.test(JS), "steps: each card's action is checked before Next opens");
  ok(/"aria-live": "polite"/.test(JS) && /class: "a2-seed-l", "aria-live": "polite"/.test(JS), "steps: readouts and the seed line are live regions");
  ok(/LX\.demo\(root,/.test(JS) && /state === "mid" \? 1/.test(JS) && /autos\[6\]/.test(JS) && /autos\[idx\]/.test(JS), "demo: mid, step-N and done");
  ok(/redraws\.length = 0; return b0\(act, api\)/.test(JS), "seed: a card's redraw hooks are dropped when another card is built");
  ok(/id: a02-contracts-risk\n  code: A2\n  tier: analyst\n  form: cards\n  icon: scale\n  status: active\n  minutes: 25\n  practice_minutes: 30/.test(PATHY) && /after: \[A1\]/.test(PATHY), "path.yml: A2 active, 25 + 30 minutes, after A1");
  const sub = (QMD.match(/^subtitle: "([^"]+)"/m) || [])[1];
  ok(PATHY.indexOf('subtitle: "' + sub + '"') >= 0, "path.yml: subtitle equals the page's");
  const desc = (QMD.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 35, `budget: the description is ${desc.split(/\s+/).length} words (≤ 35)`);
}

console.log(`a02-contracts-risk: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
