// test_08-merit-order.js — Node tests for Lesson 8 (assets/learn/08-merit-order.js): the hour cut from lesson 0's day,
// the stack and clearing identities (balance, marginal plant, uniform price, shadow price), the wind and below-zero
// cases, the line teaser, every number the page states, the text budget and the scope rules.
// Usage (from the site folder):  node _tests/learn/test_08-merit-order.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/08-merit-order.js"));
const G = require(path.join(SITE, "assets/learn/grid-operator.js"));
const J = p => JSON.parse(fs.readFileSync(path.join(SITE, p), "utf8"));
const D = J("assets/learn/data/08-merit-order.json"), town = J("assets/learn/data/town.json"), year = J("assets/learn/data/town_year.json");
const C7 = J("assets/learn/data/07-cost.json");
const QMD = fs.readFileSync(path.join(SITE, "learn/08-merit-order.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/08-merit-order.js"), "utf8");
const BODY = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const money = (v, d = 2) => (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const has = (s, msg) => ok(BODY.indexOf(s) >= 0, `page states ${s}${msg ? " (" + msg + ")" : ""}`);
let seed = 8;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
const F = town.fleet;

// ---------------- the hour: the same numbers as lesson 0
const h = M.hourOf(town, year, D), W0 = G.prepare(town, year, "lesson0");
ok(h.demand === W0.demand[D.hour] && h.wind === W0.wind[D.hour] && h.solar === W0.solar[D.hour], `hour ${D.hour}: demand, wind and solar equal lesson 0's (${h.demand}, ${h.wind}, ${h.solar})`);
ok(D.hourLabel === (D.hour < 10 ? "0" : "") + D.hour + ":00", "hour label matches the hour");
ok(near(M.gasOffer(D, "cc", D.gas.ref), F.cc.cost) && near(M.gasOffer(D, "peaker", D.gas.ref), F.peaker.cost), "reference gas price gives lesson 0's $40 and $100");

// ---------------- clearing identities over random states and demands
function check(st, d, tag) {
  const blocks = M.stack(town, D, h, st), r = M.clear(blocks, d);
  ok(blocks.every((b, i) => i === 0 || blocks[i - 1].offer <= b.offer), `${tag}: stack sorted cheapest first`);
  const served = Object.values(r.plants).reduce((a, p) => a + p.run, 0);
  ok(near(served + r.short, d), `${tag}: served + short = demand`);
  if (d <= r.total) {
    ok(r.short === 0, `${tag}: no shortfall when demand fits`);
    Object.values(r.plants).forEach(p => {
      ok(p.run >= -1e-9 && p.run <= p.mw + 1e-9, `${tag} ${p.key}: within 0 and its MW`);
      if (p.offer < r.price - 1e-9) ok(near(p.run, p.mw), `${tag} ${p.key}: offers below the price run in full`);
      if (p.offer > r.price + 1e-9) ok(p.run === 0, `${tag} ${p.key}: offers above the price stay off`);
    });
    ok(near(r.plants[r.marginal].offer, r.price) && r.plants[r.marginal].run > 0, `${tag}: the marginal plant runs and sets the price`);
    ok(near(r.cost, Object.values(r.plants).reduce((a, p) => a + p.run * p.offer, 0)), `${tag}: cost = sum of offer x MW`);
    const r1 = M.clear(blocks, d + 1), edge = blocks.some((b, i) => near(blocks.slice(0, i + 1).reduce((a, x) => a + x.mw, 0), d));
    if (d + 1 <= r.total && !edge) ok(near(r1.cost - r.cost, r.price, 1e-6), `${tag}: one more MW costs the price (shadow price)`);
  }
  return r;
}
for (let i = 0; i < 600; i++) {
  const st = { gas: D.gas.min + rnd() * (D.gas.max - D.gas.min), windMW: D.wind.min + Math.floor(rnd() * 25) * 25, credit: rnd() < 0.3, inflexible: rnd() < 0.3 };
  check(st, 20 + Math.floor(rnd() * 500), `random ${i}`);
}
const r0 = check({}, h.demand, "19:00 default");
ok(r0.price === 40 && r0.marginal === "cc" && r0.cost === 6800 && r0.total === 436, "19:00: $40 set by the combined-cycle plant, $6,800, 436 MW on offer");
ok(M.run(town, D, h, {}, h.demand + 1).cost === 6840, "19:00: one more MW -> $6,840");
const edges = [[86, 0], [87, 10], [186, 10], [187, 40], [336, 40], [337, 100]];
edges.forEach(([d, p]) => ok(M.run(town, D, h, {}, d).price === p, `demand ${d} MW -> $${p} (at an exact block edge the lower block is marginal)`));

// ---------------- gas, wind and below zero
ok(near(M.run(town, D, h, { gas: 3.85 }).price, 6 * 3.85 + 4), "gas $3.85 -> 6 x 3.85 + 4");
let first10 = null, first0 = null;
for (let w = D.wind.min; w <= D.wind.max; w += D.wind.step) {
  const r = M.run(town, D, h, { windMW: w }), prev = w > D.wind.min ? M.run(town, D, h, { windMW: w - D.wind.step }).price : Infinity;
  ok(r.price <= prev, `wind ${w} MW: the price never rises as wind grows`);
  if (r.price <= 10 && first10 === null) first10 = w;
  if (r.price <= 0 && first0 === null) first0 = w;
}
ok(first10 === 475 && M.run(town, D, h, { windMW: 475 }).price === 10, `wind: the price first reaches $10.00 at 475 MW (${first10})`);
ok(first0 !== null && first0 <= D.wind.big, `wind: the price reaches $0 within the slider (${first0} MW)`);
const big = { windMW: D.wind.big };
const rB = M.run(town, D, h, big), rC = M.run(town, D, h, Object.assign({ credit: true }, big)), rI = M.run(town, D, h, Object.assign({ inflexible: true }, big)), rCI = M.run(town, D, h, Object.assign({ credit: true, inflexible: true }, big));
ok(rB.price === 0 && rB.plants.nuclear.run === 0, "750 MW of wind: $0, and the flexible nuclear plant is not needed");
ok(rC.price === -D.credit.value && rC.marginal === "wind", "credit on: the wind farm sets -$25");
ok(rI.price === 0 && rI.plants.nuclear.run === F.nuclear.mw, "stop-and-restart offer alone: the plant runs, the price stays $0");
ok(rCI.price === -D.credit.value && rCI.plants.nuclear.run === F.nuclear.mw, "both: -$25 and the plant stays on");
ok(rCI.spilled > 0 && rC.spilled > 0, "below zero comes with spilled wind");
const LC = M.lineCase(town, D, h, big, D.teaser.lineMW);
ok(LC.windToTown === D.teaser.lineMW && LC.stranded === LC.windAvail - D.teaser.lineMW && LC.town.price === 40, "teaser: 200 MW reaches town; the town price stays $40.00");

// ---------------- every number the page states
const rows = [...BODY.matchAll(/<tr><td>(\d)<\/td><td>([^<]+)<\/td><td>([\d.]+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)];
const bl = M.stack(town, D, h, {});
ok(rows.length === 5, "fallback table: five plants");
rows.forEach((r, i) => ok(r[3] === bl[i].offer.toFixed(2) && +r[4] === bl[i].mw && +r[5] === Math.round(r0.plants[bl[i].key].run), `fallback row ${i + 1}: ${bl[i].key}`));
has("Demand is " + h.demand + " MW", "fallback"); has("its offer, " + money(r0.price) + " per MWh", "fallback");
has("19:00 on 3 September 2025", "the hour"); ok(h.dateLabel === "3 September 2025", "date label from town.json");
has("solar farm offers " + money(0) + " and is paid " + money(r0.price), "myth: uniform price");
has("a 475 MW wind farm pushes the combined-cycle plant out of the stack, and the price falls from $40.00 to $10.00", "myth: wind");
has("$c = (0, 0, 10, 40, 100)$, $\\bar P = (72, 14, 100, 150, 100)$ and $D = 331$", "Go deeper: data");
has("$p = (72, 14, 100, 145, 0)$", "Go deeper: dispatch");
has("$100 \\times 10 + 145 \\times 40 = \\$6{,}800$", "Go deeper: cost"); has("With $D = 332$ it is \\$6,840", "Go deeper: shadow price");
// quick questions, recomputed independently
const q = M.clear([{ key: "wind", mw: 80, offer: 0 }, { key: "solar", mw: 0, offer: 0 }, { key: "nuclear", mw: 100, offer: 10 }, { key: "cc", mw: 150, offer: 40 }, { key: "peaker", mw: 100, offer: 100 }], 250);
ok(q.price === 40 && q.plants.cc.run === 70, "quiz 1: $40, the $40 plant serves 70 MW"); has("the first two offers cover 180 MW, so the $40 plant serves the last 70 MW");
ok(6 * (8 - 6) === 12, "quiz 2: 6 MMBtu x $2 = $12"); has("$12 per MWh: 6 MMBtu × $2 more per MMBtu");
// numbers to remember come from the data files
has("$" + C7.fuel.gas.toFixed(2) + " · $" + C7.fuel.gasRange[1].toFixed(2), "numbers: gas costs");
ok(D.gas.marks[0].value === C7.fuel.gas && D.gas.marks[1].value === C7.fuel.gasRange[1], "gas marks = lesson 7's EIA values");
has((C7.techs.cc.heatRate).toFixed(1) + " · " + (C7.techs.peaker.heatRate).toFixed(1), "numbers: heat rates 6.2 and 9.1");
has("about $" + Math.round(C7.techs.cc.heatRate) + " or $" + Math.round(C7.techs.peaker.heatRate), "numbers: $ per MWh per $1 of gas");

// ---------------- sources, links, text budget, scope
Object.keys(D.sources).forEach(s => ok(/^https:\/\/www\.eia\.gov\//.test(D.sources[s].url) && D.sources[s].asOf, `data: source ${s} has an EIA URL and an as-of date`));
[...BODY.matchAll(/href="([^"]+)"/g)].forEach(m => ok(/^https:\/\/www\.eia\.gov\//.test(m[1]) || /^[a-z0-9-]+\.html(#[a-z0-9-]+)?$/.test(m[1]), `page link ${m[1]} is allowed`));
ok(BODY.indexOf('href="00-grid-operator.html"') >= 0 && BODY.indexOf('href="07-cost.html"') >= 0, "links back to lessons 0 and 7");
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n?\s*(?:free: true,\s*\n?\s*)?build/g)].map(m => m[1]);
ok(stepTexts.length === 8, `eight step cards (${stepTexts.length})`);
stepTexts.forEach((t, i) => { const n = t.split(/\s+/).length; ok(n >= 20 && n <= 42, `step ${i + 1}: ${n} words (about 35)`); });
const strings = [...JS.replace(/^\s*\/\/.*$/gm, "").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
const texts = strings.concat(BODY.replace(/<[^>]+>/g, " ").split(/\n+/), Object.values(D).filter(v => typeof v === "string"), [D.credit.note, D.inflexible.note]);
const NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
texts.forEach(t => t.split(/(?<=[.!?:])\s+/).forEach(sen => ok(!(NUC.test(sen) && RISK.test(sen)), `scope: no sentence pairs a nuclear term with a risk term: "${sen.slice(0, 90)}"`)));
const all = (BODY + JS + JSON.stringify(D)).toLowerCase();
["learning curve", "learning rate", "foak", "noak", "subsidy-free", "break-even capital", "order book", "projects/", "research.html"].forEach(w => ok(all.indexOf(w) < 0, `scope: no "${w}"`));
ok(!/\bai\b/i.test(BODY + JS), "scope: no AI wording");

// ---------------- the stack is the LP's solution: HiGHS (vendored, the same core the page's worker runs) agrees
const vm = require("vm");
const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(path.join(SITE, "assets/learn/components/solver.js"), "utf8"), ctx);
const { core, VERSION } = ctx.module.exports;
require(path.join(SITE, `assets/learn/vendor/highs-${VERSION}/highs.js`))().then(highs => {
  const solve = m => core.solveWith(highs, m, {});
  const r = solve(M.lp(M.stack(town, D, h, {}), h.demand));
  ok(r.ok && r.kind === "lp", "solver: the 19:00 dispatch is an optimal LP");
  ok(near(r.objective, 6800, 1e-6) && near(r.duals.demand, 40, 1e-6), `solver: cost ${r.objective} = $6,800 and demand dual ${r.duals.demand} = $40`);
  M.ORDER.forEach(k => ok(near(r.values[k], r0.plants[k].run, 1e-6), `solver: ${k} runs ${r.values[k]} MW, as in the stack`));
  for (let i = 0; i < 200; i++) {
    const st = { gas: D.gas.min + rnd() * (D.gas.max - D.gas.min), windMW: D.wind.min + Math.floor(rnd() * 25) * 25, credit: rnd() < 0.3, inflexible: rnd() < 0.3 };
    const blocks = M.stack(town, D, h, st), tot = blocks.reduce((a, b) => a + b.mw, 0), d = 20 + Math.floor(rnd() * (tot - 21)) + 0.5;
    const c = M.clear(blocks, d), x = solve(M.lp(blocks, d));
    ok(x.ok && near(x.objective, c.cost, 1e-6), `solver random ${i}: optimal cost = the stack's cost`);
    ok(near(x.duals.demand, c.price, 1e-6), `solver random ${i}: demand dual ${x.duals.demand} = clearing price ${c.price}`);
  }
  console.log(`19:00: demand ${h.demand} MW, wind ${h.wind}, solar ${h.solar}; price ${money(r0.price)}; $10 from ${first10} MW of wind, $0 from ${first0} MW; credit ${money(rC.price)}`);
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
});
