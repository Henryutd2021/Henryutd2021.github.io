// test_a20-national-scenarios.js — Node tests for lesson A20 (assets/learn/a20-national-scenarios.js, its data file and
// learn/a20-national-scenarios.qmd):
//   - the screening accounting from first principles: 2025 reproduces Prairieland's balance (CO2, electricity made,
//     imports); the costs per MWh recomputed by hand; the sharing rule's ends; fixed costs the same in every year (costs are
//     fixed ranges the learner sets; none changes with deployment)
//   - the target-seeking solve: cumulative CO2 never rises with the carbon price (every demand case, fuel level, pace and
//     cost level); at $300 every combination is saturated, so "not reachable on this page" is true for any price; the price
//     found is the lowest whole dollar for every budget on the slider, with and without the two toggles
//   - gap tracing: every order's steps add up to the gap; the average over 24 orders adds up to it too; each line and
//     "saw" is true for every pair, result and order
//   - the page: the generated blocks equal the model's (--write rewrites them); every Prairieland number is read, never
//     retyped; the fictional line; links on the allow-list; no nuclear term; no production wording in the shipped data
//     file; text budget on every element, the practice set and the no-JS block included; the sidecar's terms
//   - the cross-page note: this page's accounting meets Prairieland's default budget, and step 7 and the no-JS
//     block say why engine E4 (M13, SB4) does not; the reader's step 7 run is carried into step 8 and the explain layer
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

// ---------------- costs per MWh by hand; one fixed set of costs
{ const T = PL.costs.technologies, r = PL.periods.discount.def / 100, crf = n => r / (1 - Math.pow(1 + r, -n));
  const C = M.costs(P, X0, 0), lw = (1712 * 0 + T.wind.capex.def * crf(T.wind.life) + T.wind.fom) / (P.cfWind * 8.76) + T.wind.vom;
  ok(near(C.wind, lw) && near(C.firm, (T.firm.capex.def * crf(T.firm.life) + T.firm.fom) / (T.firm.availability * 8.76) + T.firm.vom), "full costs: wind and the firm plant by hand");
  ok(near(C.clean, D.rule.mix.wind * C.wind + D.rule.mix.solar * C.solar + D.rule.mix.firm * C.firm + C.battery) && near(D.rule.mix.wind + D.rule.mix.solar + D.rule.mix.firm, 1), "the clean mix's weights sum to 1");
  ok(near(C.gas, (T.gasCC.capex.def * crf(T.gasCC.life) + T.gasCC.fom) / (D.rule.gasCF * 8.76) + T.gasCC.vom + 3.6 / T.gasCC.efficiency * (630 * PL.costs.fuels.gas.def + 420 * PL.costs.fuels.lng.def) / 1050), "new gas: capital, upkeep, fuel at the 2025 blend");
  ok(near(C.share, Math.max(0, Math.min(1, 0.5 + (C.gas - C.clean) / 40))), "the sharing rule at the defaults");
  // fixed costs: the same cost object serves every model year; levels stay inside Prairieland's ranges
  ok(/var C = costs\(P, X, X\.price\), Y = \{\};\s*P\.years\.forEach\(function \(t\) \{ Y\[t\] = year\(P, X, t, C\); \}\);/.test(JS), "one set of costs for every year (fixed costs, none changes with deployment)");
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
ok((JS.match(/LINE/g) || []).length + (JS.match(/notes\(act, (rule|budget)Notes\(P\)\)/g) || []).length >= 8 && M.ruleNotes(P).concat(M.budgetNotes(P)).filter(t => t === PL.about.line).length === 2, "every interactive step carries the fictional line (steps 4 and 7 in their notes)");
const ALL = OWN + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term anywhere in A20 (the firm option is generic)");
ok(!/\bAI\b|artificial intelligence/.test(ALL) && !/projects\/|research\.html/.test(PAGE + JS), "no 'AI', no project page, no Research page");
ok(!/hand-written|builder learn-|\bG-[A-Z]{2,}\b|\bguard\b/i.test(RAW), "no production wording or guard names in the shipped data file");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
const okHref = h => /^https:\/\/(www\.iea\.org|www\.eia\.gov|www\.ipcc\.ch|doi\.org)\//.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h);
ok(hrefs.every(okHref), "links: IEA, EIA, IPCC, doi.org and learn pages (" + hrefs.filter(h => !okHref(h)).join(", ") + ")");
ok(Object.values(D.sources).every(s => /^https:\/\/(www\.iea\.org|www\.eia\.gov|doi\.org)\//.test(s.url)), "the data file's sources are allow-listed");
ok(/a01-project-tea\.html/.test(OWN) && /13-capstone\.html/.test(OWN) && /m13-national-pathway\.html/.test(OWN) && /sb4-pathway-explorer\.html/.test(OWN) && !/\(upcoming\)/.test(OWN), "links back to A1 and lesson 13; M13 and SB4 linked now they are live");
ok(/not a forecast/.test(JS) && /assigns none, so its results do not tell us which scenario is more likely/.test(PAGE) && /assigns none, so it cannot say which scenario is more likely/.test(JS) && !/no scenario here is more likely/i.test(JS + PAGE), "no scenario is called a forecast; no probabilities are assigned, so none is called more or less likely");
ok(!/later date/.test(JS) && /within 2026–2050/.test(M.targetSaw(P, M.scenario(P, "budget", { budget: P.budget.lo }))), "an unreachable budget is met only by cuts within its years; changing them changes the question");

// ---------------- the practice set balances
{ const Pr = M.practice(P), num = s => Number(s.replace(/,/g, "")); ok((Pr.match(/<li>/g) || []).length === 6, "six worked exercises");
  const m1 = Pr.match(/(0\.\d\d) × ([\d.]+) \+ (0\.\d\d) × ([\d.]+) \+ (0\.\d\d) × ([\d.]+) \+ ([\d.]+) = \$([\d.]+) per MWh/);
  ok(m1 && near(num(m1[1]) * num(m1[2]) + num(m1[3]) * num(m1[4]) + num(m1[5]) * num(m1[6]) + num(m1[7]), num(m1[8]), 0.005), "exercise 1 balances as displayed");
  const m2 = Pr.match(/0\.5 \+ \(([\d.]+) − ([\d.]+)\) ÷ \(2 × (\d+)\) = 0\.5 \+ ([\d.]+) ÷ (\d+) = ([\d.]+)/);
  ok(m2 && near(num(m2[1]) - num(m2[2]), num(m2[4]), 0.005) && near(0.5 + num(m2[4]) / num(m2[5]), num(m2[6]), 0.005), "exercise 2 balances as displayed");
  const m3 = Pr.match(/([\d.]+) × ([\d.]+) ÷ 1,000 = ([\d.]+) t per MWh; × \$(\d+) = \$([\d.]+) per MWh/);
  ok(m3 && near(num(m3[1]) * num(m3[2]) / 1000, num(m3[3]), 0.0005) && near(num(m3[3]) * num(m3[4]), num(m3[5]), 0.05), "exercise 3 balances as displayed");
  const m4 = Pr.match(/((?:\d × [\d.]+ \+ )+\d × [\d.]+) = ([\d,]+) Mt/);
  ok(m4 && near(m4[1].split(" + ").reduce((s, t) => { const q = t.split(" × "); return s + num(q[0]) * num(q[1]); }, 0), num(m4[2]), 1), "exercise 4 balances as displayed");
  const m5 = Pr.match(/fuel adds ([\d.]+) − ([\d.]+) = \+([\d.]+) Mt; fuel first, ([\d.]+) − ([\d.]+) = \+([\d.]+) Mt\. Averaged over the two orders: \(([\d.]+) \+ ([\d.]+)\) ÷ 2 = ([\d.]+) Mt/);
  ok(m5 && near(num(m5[1]) - num(m5[2]), num(m5[3]), 0.05) && near(num(m5[4]) - num(m5[5]), num(m5[6]), 0.05) && near((num(m5[7]) + num(m5[8])) / 2, num(m5[9]), 0.005), "exercise 5 balances as displayed");
  // the givens sit in tables: one short question per item, the numbers beside it
  const items = [...Pr.matchAll(/<li><p><b>[^<]+<\/b> ([\s\S]*?)<\/p>([\s\S]*?)<details/g)];
  ok(items.length === 6 && items.slice(0, 5).every(x => /<table class="lx-mini-table a20-given">/.test(x[2])) && items.every(x => (x[1].match(/\?/g) || []).length === 1), "each exercise asks one question; the first five give their numbers in a table");
  // the givens tables show the numbers the answers use
  ok(/<th scope="row">Wind<\/th><td>\$[\d.]+ per MWh; weight 55%<\/td>/.test(Pr) && /Half-width, the cost gap at which all or none is clean<\/th><td>\$20 per MWh/.test(Pr) && /<th scope="row">2050<\/th><td>[\d.]+ Mt; weight 3<\/td>/.test(Pr), "the givens tables carry the costs, the half-width and the weights"); }

const lines0 = [];   // lines checked against the text budget below
// ---------------- the cross-page card: this page meets the default budget; E4 (M13, SB4) cannot: the cause is the
// timing of electrification, not build-rate or transmission
{ const Rb = M.scenario(P, "budget"), n = M.gapNote(P), nh = M.gapNote(P, true), def = M.fmtN(PL.carbon.budget.def, 0) + " Mt";
  const E4 = JSON.parse(fs.readFileSync(L("data/e4-pathways.json"), "utf8")), fl = D.pathwayModel.floorMt, y = P.years[1];
  ok(Rb.target.ok && Rb.cum <= PL.carbon.budget.def, "this accounting meets Prairieland's default budget (" + def + ")");
  ok(E4.levers.budget.def > PL.carbon.budget.def && E4.levers.budget.why.indexOf("(" + M.fmtN(PL.carbon.budget.def, 0) + " Mt) is out of reach") > 0 && E4.levers.budget.why.indexOf("about " + M.fmtN(fl, 0) + " Mt") > 0 && fl > PL.carbon.budget.def, "E4's own data: the default budget out of its reach, its floor about " + M.fmtN(fl, 0) + " Mt (this lesson's pathwayModel.floorMt)");
  // the timing: here the Budget pathway's shares jump by the most a period allows; E4's rise in a straight line to 2050
  const sh = Rb.Y[y].elShare, s0 = Rb.Y[P.base].elShare, mx = PL.demand.electrification.maxSharePerPeriod, eb = E4.levers.electrification;
  ok(near(sh.buildings - s0.buildings, mx, 1e-9) && near(sh.industry - s0.industry, mx, 1e-9), "by " + y + " the Budget pathway's buildings and industry gain the most a period allows (" + (100 * mx) + " points)");
  ok(/straight line from 2025/.test(eb.unit) && (y - P.base) / (2050 - P.base) * (1 - s0.buildings) < mx && (y - P.base) / (2050 - P.base) * (PL.demand.electrification.industry.maxShare2050 - s0.industry) < mx, "a straight line to even the most 2050 allows gains less by " + y + " (E4's rule)");
  ok(n.here.indexOf(M.pct(sh.buildings)) > 0 && n.here.indexOf(M.pct(sh.industry)) > 0 && /straight line to 2050/.test(n.there) && n.there.indexOf("about " + M.fmtN(fl, 0) + " Mt, above the " + def + " budget") > 0, "the card: early and fast here, a straight line there, the floor above the budget");
  ok(/\[\[lesson:m13-national-pathway\|M13\]\]/.test(n.there) && /\[\[lesson:sb4-pathway-explorer\|SB4\]\]/.test(n.there) && /<a href="m13-national-pathway\.html">M13<\/a>/.test(nh.lineHead), "the card links M13 and SB4; the no-JS line links M13");
  ok(M.staticFallback(P).indexOf(nh.line) > 0 && /gapNote\(P\)/.test(JS) && /gn\.here/.test(JS) && /gn\.there/.test(JS), "the card is in step 7 and its line in the no-JS block");
  ok(!/build-rate|transmission limits/i.test(JSON.stringify(n) + JSON.stringify(nh) + M.staticFallback(P) + PAGE), "the stated cause is the timing of electrification, not build-rate or transmission limits");
  [n.here, n.there, nh.lineHead + " " + nh.line].forEach(t => lines0.push(t)); }
// reference budgets: Prairieland's presets, listed (the slider has no preset buttons)
ok(PL.carbon.budget.presets.every(p => M.refBudgets(P).indexOf(M.fmtN(p.mt, 0) + " Mt") > 0) && !/slider's presets/.test(PAGE + JS), "the reference budgets are listed in step 7, not called slider presets");
// the reader's step 7 run: none while it is the Budget pathway as defined; carried into step 8 and the explain layer
{ const sc = M.scOf(P, "budget"), def = { budget: PL.carbon.budget.def, cheap: false, pace: sc.policy.elec };
  ok(M.mine(P, def) === null, "no extra column or row while step 7 keeps the defaults");
  const Y = M.mine(P, Object.assign({}, def, { budget: 4000 })), Yc = M.mine(P, Object.assign({}, def, { cheap: true, pace: "stated" }));
  ok(Y && Y.target.budget === 4000 && Y.target.ok && Y.target.price < M.scenario(P, "budget").target.price, "a 4,000 Mt run: its own, lower price (" + (Y && Y.target.price) + ")");
  ok(Yc && /low ends of their ranges/.test(M.setWords(P, Yc).fuel) && /electrification as announced/.test(M.setWords(P, Yc).policy), "the reader's run is described by its own inputs (cheap gas, the announced pace)");
  ok(/Your step 7 run/.test(JS) && /mine\(P, S\)/.test(JS) && /function paintExplain\(\)/.test(JS) && /setTimeout\(paintExplain/.test(JS), "step 8 and the explain layer show the reader's run beside the scenarios as defined"); }

// ---------------- text budget
// maths: $$...$$, and $...$ whose opening $ is followed by a letter or a backslash (currency, $40 or $ per MWh, is text)
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/(^|[^\\])\$(?=[A-Za-z\\])[^$\n]*?[^\s\\]\$(?!\d)/g, "$1x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/(\d)\.(\d)/g, "$1,$2").replace(/et al\./g, "et al").split(/(?<=[.?!])\s+(?=[A-Z“$0-9−])/).filter(x => /[A-Za-z]/.test(x)).length;
const stepTexts = [...JS.matchAll(/\{ text: "((?:[^"\\]|\\.)*)",\n\s*build/g)].map(m => m[1].replace(/\\"/g, '"'));
ok(stepTexts.length === 8, "eight step cards (" + stepTexts.length + ")");
stepTexts.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words (about 35)"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
{ const Rb = M.scenario(P, "budget"), Xc = M.inputs(P, M.scOf(P, "current"));
  const lines = lines0.concat([M.sceneSaw(P), M.ruleLine(P, Xc), M.ruleSaw(P, Xc), M.targetLine(P, Rb), M.targetSaw(P, Rb), M.readSaw(P), M.TERMS, M.targetSaw(P, M.scenario(P, "budget", { budget: P.budget.lo })), M.targetSaw(P, M.scenario(P, "budget", { budget: P.budget.hi }))])
    .concat(Object.values(M.PREDICT.feedback), M.ruleNotes(P), M.budgetNotes(P));
  D.pairs.forEach(pr => OUTS.forEach(o => lines.push(M.aloneLine(P, pr.a, pr.b, o), M.aloneSaw(P, pr.a, pr.b, o), M.orderSaw(P, pr.a, pr.b, o), M.orderLine(P, pr.a, pr.b, o, "fwd"))));
  lines.forEach(t => { ok(nWords(t) <= 36, "a line of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a line of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); }); }
// every element of the page, the no-JS block and the practice set included
const PROSE = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ").replace(/^---[\s\S]*?\n---\n/, " ")
  .replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>");
PROSE.replace(/^\|(.*)\|$/gm, (m, row) => "<tr>" + row.split("|").map(c => "<td>" + c + "</td>").join("") + "</tr>").split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 38, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 2, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls, glossary, demo hooks
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("a20"/.test(JS), "live regions; settings persist in this browser");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 8, "a demo hook for each of the eight steps");
["exploratory-scenario", "target-seeking-scenario", "implied-carbon-price"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE) && new RegExp("\\[\\[" + id + "\\||term=\"" + id + "\"").test(JS + PAGE), "the sidecar defines and the page marks " + id));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
