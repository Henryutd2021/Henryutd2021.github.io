// test_a20-national-scenarios.js — Node tests for lesson A20 (assets/learn/a20-national-scenarios.js, its data file and
// learn/a20-national-scenarios.qmd):
//   - the screening accounting from first principles: 2025 reproduces Prairieland's balance (CO2, electricity made,
//     imports); the costs per MWh recomputed by hand; the sharing rule's ends; fixed costs the same in every year (G-COST)
//   - the target-seeking solve: cumulative CO2 never rises with the carbon price (every demand case, fuel level, pace and
//     cost level); at $300 every combination is saturated, so "not reachable on this page" is true for any price; the price
//     found is the lowest whole dollar for every budget on the slider, with and without the two toggles
//   - gap tracing: every order's steps add up to the gap; the average over 24 orders adds up to it too; each line and
//     "saw" is true for every pair, result and order
//   - the page: the generated blocks equal the model's (--write rewrites them); every Prairieland number is read, never
//     retyped; the fictional line; links on the allow-list; no nuclear term; text budget; the sidecar's terms
// Usage (from the site folder):  node _tests/learn/test_a20-national-scenarios.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "a20-national-scenarios";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const PL = require(L("data/prairieland.json"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
const P = M.prepare(PL, D);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the generated blocks
const BLOCKS = { "a20-fallback": () => M.staticFallback(P), "a20-ideas": () => M.ideas(P), "a20-myths": () => M.myths(P), "a20-practice": () => M.practice(P) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q); console.log("blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");

// ---------------- 2025 reproduces Prairieland's balance
const X0 = M.inputs(P, M.scOf(P, "current")), R0 = M.run(P, X0), Y0 = R0.Y[2025], B = PL.balance;
ok(near(Y0.co2, PL.carbon.base2025Mt, 0.05) && near(Y0.co2, PL.nation.co2Mt, 0.05), "2025: CO2 " + Y0.co2.toFixed(3) + " Mt = Prairieland's 214.9");
ok(near(Y0.G, PL.nation.electricityTWh.generation, 0.05) && near(Y0.finEl, B.finalByCarrier.el, 1e-6), "2025: electricity made 216.5 TWh; final electricity 732.6 PJ");
ok(near(Y0.oilImp, PL.imports.oil.importPJ, 0.1) && near(Y0.lng, PL.imports.lng.importPJ, 0.1) && near(Y0.imp, PL.imports.dependence.netImportsPJ, 0.2), "2025: oil 980 PJ and LNG 420 PJ imported");
ok(near(Y0.crude, B.primary.oil.imported + B.primary.oil.domestic, 0.1) && near(Y0.gasP, B.primary.gas.lng + B.primary.gas.domestic, 0.1) && near(Y0.coalP, B.primary.coal, 0.1), "2025: primary oil, gas and coal");
ok(near(P.units.reduce((s, u) => s + u.gen2025GWh, 0) / 1000, PL.nation.electricityTWh.generation, 0.05), "the fleet's 2025 output is the nation's generation");
ok(near(Object.values(PL.carbon.accounting.linearWeights).reduce((a, b) => a + b, 0), 25), "linear weights cover 25 years");
// useful energy and electric shares match the balance
M.prepare(PL, D) && Object.keys(P.sect).forEach(s => ok(near(P.sect[s].U, B.useful.bySector[s], 0.1), "useful energy of " + s));

// ---------------- costs per MWh by hand; G-COST
{ const T = PL.costs.technologies, r = PL.periods.discount.def / 100, crf = n => r / (1 - Math.pow(1 + r, -n));
  const C = M.costs(P, X0, 0), lw = (1712 * 0 + T.wind.capex.def * crf(T.wind.life) + T.wind.fom) / (P.cfWind * 8.76) + T.wind.vom;
  ok(near(C.wind, lw) && near(C.firm, (T.firm.capex.def * crf(T.firm.life) + T.firm.fom) / (T.firm.availability * 8.76) + T.firm.vom), "full costs: wind and the firm plant by hand");
  ok(near(C.clean, D.rule.mix.wind * C.wind + D.rule.mix.solar * C.solar + D.rule.mix.firm * C.firm + C.battery) && near(D.rule.mix.wind + D.rule.mix.solar + D.rule.mix.firm, 1), "the clean mix's weights sum to 1");
  ok(near(C.gas, (T.gasCC.capex.def * crf(T.gasCC.life) + T.gasCC.fom) / (D.rule.gasCF * 8.76) + T.gasCC.vom + 3.6 / T.gasCC.efficiency * (630 * PL.costs.fuels.gas.def + 420 * PL.costs.fuels.lng.def) / 1050), "new gas: capital, upkeep, fuel at the 2025 blend");
  ok(near(C.share, Math.max(0, Math.min(1, 0.5 + (C.gas - C.clean) / 40))), "the sharing rule at the defaults");
  // fixed costs: the same cost object serves every model year; levels stay inside Prairieland's ranges
  ok(/var C = costs\(P, X, X\.price\), Y = \{\};\s*P\.years\.forEach\(function \(t\) \{ Y\[t\] = year\(P, X, t, C\); \}\);/.test(JS), "one set of costs for every year (G-COST)");
  D.scenarios.forEach(s => M.CLEAN_TECH.forEach(k => { const v = T[k].capex[s.costs[k]]; ok(v >= T[k].capex.lo && v <= T[k].capex.hi, s.key + ": " + k + " inside its range"); }));
  D.scenarios.forEach(s => ["gas", "lng"].forEach(k => ok(["lo", "def", "hi"].indexOf(s.fuel[k]) >= 0, s.key + ": fuel level " + k)));
  ok(T.firm.label === "Firm clean plant (generic)" && !/learning|first[- ]of|nth[- ]of|FOAK|NOAK/i.test(JS + RAW + OWN), "the generic firm option; no learning or first-of-a-kind wording");
  ["slow", "stated"].forEach(k => ok(D.elec[k].perPeriod > 0 && D.elec[k].perPeriod <= PL.demand.electrification.maxSharePerPeriod, "pace " + k + " within Prairieland's limit"));
  ok(D.elec.fast.perPeriod === "max" && M.paceOf(P, "fast") === PL.demand.electrification.maxSharePerPeriod, "the fastest pace is read from Prairieland"); }
// electric shares stay within their caps in every year and pace
["slow", "stated", "fast"].forEach(e => { const X = Object.assign({}, X0, { pace: M.paceOf(P, e) }), R = M.run(P, X);
  P.years.forEach(t => Object.keys(P.sect).forEach(s => { const b = P.sect[s], v = R.Y[t].elShare[s]; if (v < b.b - 1e-12 || (b.cap != null && v > Math.max(b.b, b.cap) + 1e-12) || v > 1 + 1e-12) ok(false, "electric share of " + s + " in " + t + " at " + e); })); });
ok(true, "electric shares within their caps");

// ---------------- the target-seeking solve: monotone, saturated at $300, minimal
const DEM = PL.demand.scenarios.map(d => d.key), LV = ["lo", "def", "hi"], PACES = ["slow", "stated", "fast"];
let combos = 0, mono = true, sat = true;
DEM.forEach(dm => LV.forEach(fl => PACES.forEach(pc => LV.forEach(cl => {
  const X = JSON.parse(JSON.stringify(X0)); X.demand = dm; X.gas = PL.costs.fuels.gas[fl]; X.lng = PL.costs.fuels.lng[fl]; X.pace = M.paceOf(P, pc); X.elec = pc;
  M.CLEAN_TECH.forEach(k => { X.capex[k] = PL.costs.technologies[k].capex[cl]; }); combos++;
  let prev = Infinity;
  for (let p = 0; p <= D.rule.priceMax; p += 5) { const c = M.run(P, Object.assign({}, X, { price: p })).cum; if (c > prev + 1e-9) mono = false; prev = c; }
  const top = M.run(P, Object.assign({}, X, { price: D.rule.priceMax })), more = M.run(P, Object.assign({}, X, { price: 10 * D.rule.priceMax }));
  const elig = P.units.filter(u => D.rule.earlyClose.indexOf(u.tech) >= 0);
  if (top.C.share !== 1 || !P.years.slice(1).every(t => elig.filter(u => u.retire >= t).every(u => top.Y[t].closed.indexOf(u.id) >= 0)) || !near(top.cum, more.cum, 1e-9)) sat = false;
}))));
ok(combos === 81 && mono, "cumulative CO2 never rises with the carbon price (81 combinations, $0 to $300 by $5)");
ok(sat, "at $300 every combination is saturated: all new power clean, every coal and combined-cycle plant closed; a higher price changes nothing");
{ const base = M.inputs(P, M.scOf(P, "budget")), gb = M.inputs(P, M.scOf(P, "gasboom")); let n = 0, minimal = true, words = true;
  [false, true].forEach(cheap => ["fast", "stated"].forEach(pc => { for (let b = P.budget.lo; b <= P.budget.hi; b += P.budget.step) {
    const X = JSON.parse(JSON.stringify(base)); if (cheap) { X.gas = gb.gas; X.lng = gb.lng; } X.pace = M.paceOf(P, pc); X.elec = pc;
    const R = M.scenario(P, "budget", { budget: b, X: X }), t = R.target; n++;
    if (t.ok) { const c = M.run(P, Object.assign({}, X, { price: t.price })).cum; if (c > b + 1e-9 || (t.price > 0 && M.run(P, Object.assign({}, X, { price: t.price - 1 })).cum <= b + 1e-9)) minimal = false; if (!near(R.cum, c)) minimal = false; }
    else if (!(t.floor > b) || !near(t.floor, M.run(P, Object.assign({}, X, { price: D.rule.priceMax })).cum)) minimal = false;
    const ln = M.targetLine(P, R), sw = M.targetSaw(P, R);
    if (t.ok !== /lowest carbon price/.test(ln) || (!t.ok && !/Not reachable/.test(ln)) || (t.ok && t.price === 0) !== /needs no carbon price/.test(sw)) words = false;
  } }));
  ok(n === 4 * 50 && minimal, "the price found is the lowest whole dollar for every budget, toggle and pace (" + n + " cases)");
  ok(words, "the target lines and 'saw' are true for every case");
  const Rb = M.scenario(P, "budget"); ok(Rb.target.ok && Rb.target.budget === PL.carbon.budget.def && Rb.cum <= PL.carbon.budget.def, "the Budget pathway meets Prairieland's default budget"); }

// ---------------- gap tracing
const G = M.GROUPS, OUTS = D.outputs.map(o => o.key);
{ let sums = true, avg = true, lines = true;
  const perms = M.perms(G); ok(perms.length === 24 && new Set(perms.map(p => p.join())).size === 24, "24 distinct orders");
  D.pairs.forEach(pr => OUTS.forEach(o => {
    perms.forEach(ord => { const w = M.waterfall(P, pr.a, pr.b, o, ord); if (!near(w.steps.reduce((s, x) => s + x.d, 0), w.gap, 1e-6) || !near(w.steps[w.steps.length - 1].to, w.b, 1e-6)) sums = false; });
    const av = M.average(P, pr.a, pr.b, o), gap = M.waterfall(P, pr.a, pr.b, o, G).gap;
    if (!near(G.reduce((s, g) => s + av.avg[g], 0), gap, 1e-6)) avg = false;
    // groups that do not differ add nothing in any order
    const dif = M.differs(P, pr.a, pr.b); G.filter(g => dif.indexOf(g) < 0).forEach(g => { if (Math.abs(av.lo[g]) > 1e-9 || Math.abs(av.hi[g]) > 1e-9) avg = false; });
    const al = M.alone(P, pr.a, pr.b, o), dec = D.outputs.find(x => x.key === o).dec, eq = Number(Math.abs(al.sum - al.gap).toFixed(dec)) === 0;
    if (eq !== /add up to the gap/.test(M.aloneSaw(P, pr.a, pr.b, o))) lines = false;
    const moved = G.some(g => Number((av.hi[g] - av.lo[g]).toFixed(dec)) > 0);
    if (moved !== /depending on the order/.test(M.orderSaw(P, pr.a, pr.b, o))) lines = false;
    ["fwd", "rev", "avg"].forEach(m => { if (!/[0-9]/.test(M.orderLine(P, pr.a, pr.b, o, m))) lines = false; });
  }));
  ok(sums, "every order's steps add up to the gap and end at B (4 pairs × 3 results × 24 orders)");
  ok(avg, "the average over every order adds up to the gap; a group that does not differ adds nothing");
  ok(lines, "the alone and order lines are true for every pair and result");
  ok(M.differs(P, "announced", "gasboom").length === 4 && M.differs(P, "current", "budget").join() === "policy", "Announced plans and Gas boom differ in all four groups; Current policies and the Budget pathway only in policy"); }
// the sharing rule's words over its sliders
{ const F = PL.costs.fuels; let good = true;
  for (let g = F.gas.lo; g <= F.gas.hi + 1e-9; g += 1) for (let l = F.lng.lo; l <= F.lng.hi + 1e-9; l += 4) for (let p = 0; p <= D.rule.priceMax; p += 25) LV.forEach(cl => {
    const X = JSON.parse(JSON.stringify(X0)); X.gas = g; X.lng = l; X.price = p; M.CLEAN_TECH.forEach(k => { X.capex[k] = PL.costs.technologies[k].capex[cl]; });
    const C = M.costs(P, X, p), w = M.ruleSaw(P, X);
    if ((C.share >= 1) !== /all new power is clean/.test(w) || (C.share <= 0) !== /no new power is clean/.test(w)) good = false;
    if (C.share >= 1 && C.gap < D.rule.halfWidth - 1e-9) good = false;
  });
  ok(good, "the sharing rule's 'saw' is true over the sliders"); }
// the scene's predicted spread and the story words
{ const sp = M.spread(P); ok(near(sp.lo, M.scenario(P, "budget").out.co2) && near(sp.hi, M.scenario(P, "gasboom").out.co2), "the spread runs from the Budget pathway to Gas boom");
  ok(M.PREDICT.options.some(o => o.value === M.PREDICT.answer) && Object.keys(M.PREDICT.feedback).length === 4, "the prediction has its answer and four feedbacks"); }

// ---------------- the sort and the real-world families
{ const bins = D.sort.bins.map(b => b.id); ok(D.sort.cards.every(c => bins.indexOf(c.bin) >= 0), "every card's bin exists");
  D.scenarios.forEach(s => { const c = D.sort.cards.find(x => x.id === s.key); ok(c && c.bin === (s.kind === "target" ? "target" : "exploratory"), "the sort agrees with " + s.key + "'s kind"); });
  ok(D.sort.cards.filter(c => /^iea-|^eia-/.test(c.id)).length === 4 && /normative/i.test(D.sort.cards.find(c => c.id === "iea-nze").why) && /not predictions/.test(D.sort.cards.find(c => c.id === "eia-base").why), "four real outlooks, worded as their authors describe them");
  ok(D.realWorld.every(r => D.sources[r.src] && /^https:\/\/www\.(iea\.org|eia\.gov)\//.test(D.sources[r.src].url)), "real-world families cite IEA and EIA pages"); }

// ---------------- the page: numbers read, not retyped; labels; links; scope
ok(!/(?<![\d.,$])(214\.9|3,?500|2,?600|1,?712|1,?484|1,?521|7,?000|4\.05|216\.5|980|420|630)(?![\d,])/.test(RAW + JS.replace(/\/\/[^\n]*/g, "")), "no Prairieland number is retyped in the data file or the script");
ok(OWN.indexOf("<b>" + PL.about.line + "</b>") >= 0 && /var PL = data\.prairieland[^\n]*LINE = PL\.about\.line/.test(JS) && M.staticFallback(P).indexOf(PL.about.line) >= 0 && M.practice(P).indexOf(PL.about.line) >= 0, "the fictional line, read from Prairieland, on the page, the fallback and the practice set");
ok((JS.match(/LINE/g) || []).length >= 8, "every interactive step carries the fictional line");
const ALL = OWN + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term anywhere in A20 (the firm option is generic)");
ok(!/\bAI\b|artificial intelligence/.test(ALL) && !/projects\/|research\.html/.test(PAGE + JS), "no 'AI', no project page, no Research page");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
const okHref = h => /^https:\/\/(www\.iea\.org|www\.eia\.gov|www\.ipcc\.ch|doi\.org)\//.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h);
ok(hrefs.every(okHref), "links: IEA, EIA, IPCC, doi.org and learn pages (" + hrefs.filter(h => !okHref(h)).join(", ") + ")");
ok(Object.values(D.sources).every(s => /^https:\/\/(www\.iea\.org|www\.eia\.gov|doi\.org)\//.test(s.url)), "the data file's sources are allow-listed");
ok(/a01-project-tea\.html/.test(OWN) && /13-capstone\.html/.test(OWN) && /M13 \(upcoming\)/.test(OWN) && /SB4 \(upcoming\)/.test(OWN), "links back to A1 and lesson 13; M13 and SB4 named as upcoming");
ok(/not a forecast/.test(JS) && /no scenario here is more likely/i.test(JS + PAGE), "no scenario is called a forecast or more likely");

// ---------------- the practice set balances (W4 finding 6, W5 finding 6)
{ const Pr = M.practice(P), num = s => Number(s.replace(/,/g, "")); ok((Pr.match(/<li>/g) || []).length === 6, "six worked exercises");
  const m1 = Pr.match(/(0\.\d\d) × ([\d.]+) \+ (0\.\d\d) × ([\d.]+) \+ (0\.\d\d) × ([\d.]+) \+ ([\d.]+) = \$([\d.]+) per MWh/);
  ok(m1 && near(num(m1[1]) * num(m1[2]) + num(m1[3]) * num(m1[4]) + num(m1[5]) * num(m1[6]) + num(m1[7]), num(m1[8]), 0.005), "exercise 1 balances as displayed");
  const m2 = Pr.match(/0\.5 \+ \(([\d.]+) − ([\d.]+)\) ÷ \(2 × (\d+)\) = 0\.5 \+ ([\d.]+) ÷ (\d+) = ([\d.]+)/);
  ok(m2 && near(num(m2[1]) - num(m2[2]), num(m2[4]), 0.005) && near(0.5 + num(m2[4]) / num(m2[5]), num(m2[6]), 0.005), "exercise 2 balances as displayed");
  const m3 = Pr.match(/([\d.]+) × ([\d.]+) ÷ 1,000 = ([\d.]+) t per MWh; × \$(\d+) = \$([\d.]+) per MWh/);
  ok(m3 && near(num(m3[1]) * num(m3[2]) / 1000, num(m3[3]), 0.0005) && near(num(m3[3]) * num(m3[4]), num(m3[5]), 0.05), "exercise 3 balances as displayed");
  const m4 = Pr.match(/((?:\d × [\d.]+ \+ )+\d × [\d.]+) = ([\d,]+) Mt/);
  ok(m4 && near(m4[1].split(" + ").reduce((s, t) => { const q = t.split(" × "); return s + num(q[0]) * num(q[1]); }, 0), num(m4[2]), 1), "exercise 4 balances as displayed");
  const m5 = Pr.match(/fuel adds ([\d.]+) − ([\d.]+) = \+([\d.]+) Mt\. Fuel first: ([\d.]+) − ([\d.]+) = \+([\d.]+) Mt\. The average of the two orders: \(([\d.]+) \+ ([\d.]+)\) ÷ 2 = ([\d.]+) Mt/);
  ok(m5 && near(num(m5[1]) - num(m5[2]), num(m5[3]), 0.05) && near(num(m5[4]) - num(m5[5]), num(m5[6]), 0.05) && near((num(m5[7]) + num(m5[8])) / 2, num(m5[9]), 0.005), "exercise 5 balances as displayed"); }

// ---------------- text budget
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/(\d)\.(\d)/g, "$1,$2").replace(/et al\./g, "et al").split(/(?<=[.?!])\s+(?=[A-Z“$0-9−])/).filter(x => /[A-Za-z]/.test(x)).length;
const stepTexts = [...JS.matchAll(/\{ text: "((?:[^"\\]|\\.)*)",\n\s*build/g)].map(m => m[1].replace(/\\"/g, '"'));
ok(stepTexts.length === 8, "eight step cards (" + stepTexts.length + ")");
stepTexts.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words (about 35)"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
{ const Rb = M.scenario(P, "budget"), Xc = M.inputs(P, M.scOf(P, "current"));
  const lines = [M.sceneSaw(P), M.ruleLine(P, Xc), M.ruleSaw(P, Xc), M.targetLine(P, Rb), M.targetSaw(P, Rb), M.readSaw(P)].concat(Object.values(M.PREDICT.feedback));
  D.pairs.forEach(pr => OUTS.forEach(o => lines.push(M.aloneLine(P, pr.a, pr.b, o), M.aloneSaw(P, pr.a, pr.b, o), M.orderSaw(P, pr.a, pr.b, o), M.orderLine(P, pr.a, pr.b, o, "fwd"))));
  lines.forEach(t => { ok(nWords(t) <= 36, "a line of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a line of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); }); }
const PROSE = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ").replace(/<!-- a20-(fallback|practice):start[\s\S]*?<!-- a20-\1:end -->/g, " ").replace(/^---[\s\S]*?\n---\n/, " ")
  .replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 38, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 2, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls, glossary, demo hooks
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("a20"/.test(JS), "live regions; settings persist in this browser");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 8, "a demo hook for each of the eight steps");
["exploratory-scenario", "target-seeking-scenario", "implied-carbon-price"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE) && new RegExp("\\[\\[" + id + "\\||term=\"" + id + "\"").test(JS + PAGE), "the sidecar defines and the page marks " + id));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
