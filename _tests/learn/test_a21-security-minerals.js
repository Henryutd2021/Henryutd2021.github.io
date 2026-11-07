// test_a21-security-minerals.js — Node tests for lesson A21 (assets/learn/a21-security-minerals.js, its data file and
// learn/a21-security-minerals.qmd):
//   - the measures from first principles: import dependence (both conventions) and the strait's share against
//     Prairieland's own figures; each HHI against Prairieland's; a cap keeps shares summing to 1, none above the cap
//   - the stress tests by hand at the defaults and over every lever: the price spike's money (abroad and at home), the
//     closure against the shock's lost PJ, the restriction's scarcest mineral, the fire with a second site; every line and
//     "saw" true over the levers' whole ranges; combined shocks: a restriction and a fire counted month by month (W6 fix):
//     with no fire inside it the monthly count equals the restriction's closed form, and together the loss lies between
//     the larger single loss and the two added, and depends on when the fire comes
//   - the lever sort agrees with the model where the model can show it (each "yes" lever improves its shock)
//   - the excerpt: E8.3 word for word against the register, E8.7 under it, the AMM citation; no other research wording
//   - the page: generated blocks up to date (--write rewrites them); no Prairieland number retyped; the fictional line;
//     links on the allow-list; no nuclear term; text budget; the sidecar's terms
// Usage (from the site folder):  node _tests/learn/test_a21-security-minerals.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./excerpt_check.js");
const ID = "a21-security-minerals";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const PL = require(L("data/prairieland.json"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const range = r => { const out = []; for (let v = r.min; v <= r.max + 1e-9; v += r.step) out.push(+v.toFixed(6)); return out; };

// ---------------- the generated blocks
const BLOCKS = { "a21-fallback": () => M.staticFallback(PL, D), "a21-ideas": () => M.ideas(PL, D), "a21-myths": () => M.myths(PL, D), "a21-practice": () => M.practice(PL, D),
  "a21-facts": () => M.facts(PL, D), "a21-real": () => M.real(PL, D) };
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

// ---------------- the measures
const I = PL.imports, S0 = M.defaults(PL, D);
{ const d = M.dependence(PL), s = M.dependence(PL, "substitution");
  ok(near(d.total, I.dependence.share) && near(d.total, PL.nation.importDependence) && near(d.straitPJ, I.dependence.throughStraitPJ) && near(d.oil, I.oil.importShare) && near(d.gas, I.lng.shareOfGas) && d.coal === 0, "dependence: 40%, oil 80%, gas 40%, coal 0%; 1,085 PJ through the strait");
  ok(near(s.total, I.dependence.netImportsPJ / PL.balance.conventions.substitution.primaryPJ) && s.total < d.total, "dependence by the substitution method uses Prairieland's substitution total");
  ok(near(M.straitAnswer(PL), Math.round(1000 * I.dependence.throughStraitPJ / I.dependence.primaryPJ) / 10), "the strait answer: " + M.straitAnswer(PL) + "%"); }
{ const Mn = M.minerals(PL); ok(Mn.every(m => near(m.hhi, I.minerals.items[m.key].hhi, 0.5)), "each HHI equals Prairieland's");
  ok(near(Mn.reduce((s, m) => s + m.shares[0], 0) / Mn.length, I.minerals.leadingShareAverage), "Country R's average share is Prairieland's leadingShareAverage");
  let good = true, prev = null;
  range(D.levers.cap).slice().reverse().forEach(cap => { const R = M.minerals(PL, cap);
    R.forEach(m => { if (!near(m.shares.reduce((a, b) => a + b, 0), 1, 1e-9) || Math.max.apply(null, m.shares) > cap / 100 + 1e-9 || m.hhi < 10000 / m.shares.length - 1e-6) good = false; });
    if (prev) R.forEach((m, i) => { if (m.hhi > prev[i].hhi + 1e-9) good = false; }); prev = R; });
  ok(good, "a cap keeps shares summing to 1, none above the cap; the HHI never rises as the cap tightens and never falls below 10,000 / n"); }

// ---------------- the stress tests by hand
{ const s = M.spike(PL, 0), F = PL.costs.fuels, sh = M.shockOf(PL, "gasSpike").params;
  ok(near(s.abroad, I.lng.importPJ * F.lng.def * (sh.lngX - 1) / 1000) && near(s.home, I.lng.domesticPJ * F.gas.def * (sh.gasX - 1) / 1000) && near(s.gdp, (s.abroad + s.home) / PL.nation.gdpBillionUSD), "spike: $8.40bn abroad and $1.28bn at home, by hand");
  let good = true; range(D.levers.gasCut).forEach(c => { const x = M.spike(PL, c); if (x.lng < -1e-9 || x.dom > I.lng.domesticPJ + 1e-9 || (c > 0 && x.abroad > s.abroad + 1e-9) || (x.lng <= 1e-9) !== /no LNG is bought/.test(M.spikeSaw(PL, c))) good = false; });
  ok(good, "spike: a cut comes off LNG first; the money abroad never rises; the 'saw' is true for every cut"); }
{ const c = M.closure(PL, D, S0), sh = M.shockOf(PL, "straitClosure");
  ok(S0.weeks === sh.params.weeks && near(c.lost, sh.lostPJ, 0.05) && near(c.stocks, I.oil.stocksPJ, 0.05) && S0.stockDays === I.oil.stocksDays, "closure: the shock's 166.5 PJ lost; 60 days = 161.1 PJ of stocks");
  let good = true, n = 0;
  range(D.levers.weeks).forEach(w => range(D.levers.stockDays).forEach(dd => range(D.levers.restraint).forEach(r => {
    const o = Object.assign({}, S0, { weeks: w, stockDays: dd, restraint: r }), x = M.closure(PL, D, o), ln = M.closureLine(PL, D, o), sw = M.closureSaw(PL, D, o); n++;
    if (!near(x.gap - x.left, x.oilLost - x.stocks - x.saving, 1e-9) || x.covered !== /covered/.test(ln) || x.covered !== /bridge/.test(sw)) good = false;
    if (!x.covered && isFinite(x.lastDays) && !(x.lastDays < x.days)) good = false;
    if ((x.gasGap > 1e-9) !== /falls .* short of the lost LNG/.test(sw)) good = false;
  })));
  ok(good && n === 26 * 25 * 5, "closure: lines and 'saw' true for every closure, stock and restraint (" + n + " cases)"); }
{ const b = M.ban(PL, S0), g = b.rows.find(r => r.key === "graphite"), sh = M.shockOf(PL, "mineralBan").params, Fb = PL.factories.battery;
  const a = Fb.recycledShare + (1 - Fb.recycledShare) * (1 - I.minerals.items.graphite.shares[0]), q = (sh.years * a + Fb.mineralStockDays / 365) / sh.years;
  ok(near(g.a, a) && near(b.q, q) && b.bind.key === "graphite" && near(b.lost, Fb.output2025GWh * sh.years * (1 - q)), "restriction: graphite binds at " + (100 * q).toFixed(1) + "% of output, by hand");
  let good = true, prevQ = {};
  range(D.levers.cap).forEach(cap => range(D.levers.recycled).forEach(r => range(D.levers.mineralDays).forEach(md => {
    const o = Object.assign({}, S0, { cap: cap, recycled: r, mineralDays: md }), x = M.ban(PL, o), ln = M.banLine(PL, o), sw = M.banSaw(PL, o);
    if (x.q < 0 || x.q > 1 + 1e-12 || !near(x.made + x.lost, x.output, 1e-9) || (x.q >= 1) !== /no mineral runs short/.test(ln) || (x.q >= 1) !== /runs at its 2025 output/.test(sw)) good = false;
    if (x.q < 1 && (x.bind.q !== Math.min.apply(null, x.rows.map(y => y.q)) || x.binds.length !== x.rows.filter(y => y.q <= x.q + 1e-12).length || (x.binds.length > 1) !== /run short together/.test(ln) || !x.binds.every(y => ln.indexOf(y.label.toLowerCase()) >= 0))) good = false;
  })));
  ok(good, "restriction: output share in [0, 1], made + lost = output, every tied scarcest mineral named, lines true for every lever"); }
{ const f = M.fire(PL, S0), Fb = PL.factories.battery, sh = M.shockOf(PL, "factoryFire").params;
  ok(near(f.lost, sh.months / 12 * Fb.output2025GWh) && near(f.jobYears, Fb.jobs * sh.months / 12), "fire: 6.0 GWh and 1,250 job-years with no second site");
  let good = true; range(D.levers.split).forEach(s => { const x = M.fire(PL, Object.assign({}, S0, { split: s })); if (!near(x.lost, sh.months / 12 * Math.max(0, Fb.output2025GWh - Fb.capacityGWh * s / 100)) || (x.lost <= 1e-9) !== /covers the whole loss/.test(M.fireSaw(PL, Object.assign({}, S0, { split: s })))) good = false; });
  ok(good, "fire: the second site runs up to its capacity; the 'saw' is true for every split"); }
// combined shocks, month by month (W6 review, high): the restriction alone, the fire's timing, the bounds
{ const AT = D.fireTiming.map(x => x.key), sh = M.shockOf(PL, "mineralBan").params, fm = M.shockOf(PL, "factoryFire").params.months, Fb = PL.factories.battery;
  ok(AT.join() === "start,middle,end" && M.fireStart(PL, "start") === 0 && M.fireStart(PL, "end") === sh.years * 12 - fm && M.fireStart(PL, "middle") > 0 && M.fireStart(PL, "middle") < M.fireStart(PL, "end"), "the fire starts at month 0, in the middle, or in the restriction's last months");
  let alone = true, bounds = true, n = 0;
  range(D.levers.cap).forEach(c => range(D.levers.recycled).forEach(r => range(D.levers.mineralDays).forEach(md => range(D.levers.split).forEach(sp => {
    const o = Object.assign({}, S0, { cap: c, recycled: r, mineralDays: md, split: sp }), b = M.ban(PL, o), f = M.fire(PL, o); n++;
    if (!near(M.together(PL, o, null).lost, b.lost, 1e-9)) alone = false;
    AT.forEach(a => { const t = M.together(PL, o, a); if (t.lost < Math.max(b.lost, f.lost) - 1e-9 || t.lost > b.lost + f.lost + 1e-9 || !near(t.made + t.lost, t.output, 1e-9) || t.perMonth.some(q => q < -1e-12)) bounds = false; });
  }))));
  ok(alone && n === 13 * 9 * 13 * 6, "with no fire inside the restriction, the monthly count equals the closed form (" + n + " lever cases)");
  ok(bounds, "together: never below the larger single loss, never above the two added, made + lost = output, every timing and lever");
  // by hand at 2025's settings: the fire at the start loses nothing more (what arrives while the site is shut is used
  // later); in the last months, what arrives during the fire is unused when the restriction ends
  const g = M.ban(PL, S0).rows.find(x => x.key === "graphite"), need = Fb.output2025GWh, stock = S0.mineralDays / 365 * need;
  const tS = M.together(PL, S0, "start"), tE = M.together(PL, S0, "end"), madeEnd = stock + g.a * need * (sh.years - fm / 12);
  ok(near(tS.lost, M.ban(PL, S0).lost, 1e-9) && near(tE.made, madeEnd, 1e-9) && tE.lost > tS.lost + 0.5, "by hand: the fire at the start adds nothing; in the last " + fm + " months the loss is " + tE.lost.toFixed(2) + " GWh, not " + tS.lost.toFixed(2));
  let good = true, m2 = 0; const keys = ["spike", "closure", "ban", "fire"];
  for (let m = 0; m < 16; m++) { const on = {}; keys.forEach((k, i) => { on[k] = !!(m & (1 << i)); });
    [S0, Object.assign({}, S0, { cap: 60, recycled: 20, mineralDays: 180, split: 30, stockDays: 90, gasCut: 10 })].forEach(S => AT.forEach(a => { const b = M.board(PL, D, on, S, a); m2++;
      const bl = on.ban ? M.ban(PL, S).lost : 0, fl = on.fire ? M.fire(PL, S).lost : 0, both = on.ban && on.fire;
      if (!near(b.cellsLost, both ? M.together(PL, S, a).lost : Math.max(bl, fl)) || !near(b.cellsSum, bl + fl) || (!on.closure && (b.oilGap || b.gasGap)) || (!on.spike && b.abroad) || (!on.fire && b.jobYears)) good = false;
      const sw = M.boardSaw(PL, D, on, S, a), shared = both && bl + fl - b.cellsLost > 1e-9;
      if (shared !== /depend on timing and shared bottlenecks/.test(sw) || (shared && sw.indexOf(M.atWords(PL, a)) < 0) || (shared && (b.cellsLost - bl > 1e-9) !== /unused when it ends/.test(sw))) good = false;
      if (!Object.values(on).some(Boolean) !== /Switch on/.test(M.boardLine(PL, D, on, S, a))) good = false; })); }
  ok(good && m2 === 96, "the board: cells lost from the monthly count when both are on; its words name the timing and say why; all 16 combinations x 3 timings");
  ok(!/larger of the two|not simply added|the larger, not/i.test(JS + RAW + PAGE), "no general 'the larger, not the sum' rule left"); }

// ---------------- the lever sort agrees with the model where it can
{ const it = k => D.sort.items.find(x => x.key === k);
  ok(it("stocks").ref.closure === "yes" && M.closure(PL, D, Object.assign({}, S0, { weeks: 12, stockDays: 90 })).gap < M.closure(PL, D, Object.assign({}, S0, { weeks: 12 })).gap, "stocks help against a closure");
  ok(it("stocks").ref.ban === "yes" && M.ban(PL, Object.assign({}, S0, { mineralDays: 180 })).q > M.ban(PL, S0).q, "mineral stocks help against a restriction");
  ok(it("diversify").ref.ban === "yes" && M.ban(PL, Object.assign({}, S0, { cap: 60 })).q > M.ban(PL, S0).q, "more suppliers help against a restriction");
  ok(it("recycle").ref.ban === "partly" && M.ban(PL, Object.assign({}, S0, { recycled: 40 })).q > M.ban(PL, S0).q && M.ban(PL, Object.assign({}, S0, { recycled: 40, mineralDays: 0, cap: 90 })).q < 1, "recycling helps in part against a restriction");
  ok(it("factory").ref.fire === "yes" && M.fire(PL, Object.assign({}, S0, { split: 30 })).lost < M.fire(PL, S0).lost, "a second site helps against a fire");
  ok(it("less").ref.spike === "yes" && it("less").ref.closure === "yes" && M.spike(PL, 10).abroad < M.spike(PL, 0).abroad && M.closure(PL, D, Object.assign({}, S0, { weeks: 12, restraint: 10 })).gap < M.closure(PL, D, Object.assign({}, S0, { weeks: 12 })).gap, "using less helps against a price spike and a closure");
  ok(D.sort.items.every(x => D.sort.bins.every(b => ["yes", "no", "partly"].indexOf(x.ref[b.key]) >= 0 && x.why[b.key])), "every cell has a reference and a reason"); }

// ---------------- the excerpt (excerpt:supply-chain-mg; register E8.3 and E8.7)
const R = X.register(["E8"]);
ok(R && R.raw["E8.3"] && R.raw["E8.7"], "the register is found with E8.3 and E8.7");
const quotes = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<\/blockquote>/g)];
ok(quotes.length === 1 && quotes[0][1] === "excerpt:supply-chain-mg", "one excerpt block, keyed excerpt:supply-chain-mg");
if (R && quotes.length) {
  const sents = [...quotes[0][2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => X.norm(x[1]));
  ok(sents.length === 1 && sents[0] === X.norm(R.raw["E8.3"]), "the excerpt is E8.3, word for word");
  const E87 = R.raw["E8.7"].split(/(?<=\.) (?=Leaves out:)/);
  ok(E87.length === 2 && X.norm(OWN).indexOf(X.norm("<li>" + E87[0] + "</li><li>" + E87[1] + "</li>")) >= 0, "E8.7 sits under the excerpt, word for word, as two lines");
  ok(/<footer>Approved excerpt of: Li et al\. \(2023\), <a href="https:\/\/doi\.org\/10\.1016\/j\.apm\.2023\.02\.014">Applied Mathematical Modelling<\/a>\.<\/footer>/.test(quotes[0][2]), "the footer names the AMM paper with its DOI");
  ok(/Li et al\. \(2023\)\. <a href="https:\/\/doi\.org\/10\.1016\/j\.apm\.2023\.02\.014">Facility and microgrid location-allocation for integrated supply chain and transactive energy operations<\/a>\. Applied Mathematical Modelling 119, 119–136\./.test(OWN), "the citation as published (E8.17)");
  ok(!/(study|studies|author|research|paper)/i.test((OWN.match(/<p class="a21-bridge">([\s\S]*?)<\/p>/) || [])[1] || "x") && !/supply-chain|microgrid|transactive/i.test(JS + RAW), "no research wording outside the excerpt and its approved lines");
}

// ---------------- the page: numbers read, labels, links, scope
ok(!/(?<![\d.,$])(980|420|630|3,?500|1,?400|1,?085|161\.1|166\.5|8,?138|4,?658|3,?150|5,?850|7,?200|12,?000|2,?500 jobs|57\.3|21\.6)(?![\d,])/.test(RAW + JS.replace(/\/\/[^\n]*/g, "")), "no Prairieland number is retyped in the data file or the script");
ok(OWN.indexOf("<b>" + PL.about.line + "</b>") >= 0 && /LINE = PL\.about\.line/.test(JS) && M.staticFallback(PL, D).indexOf(PL.about.line) >= 0 && M.practice(PL, D).indexOf(PL.about.line) >= 0, "the fictional line, read from Prairieland, on the page, the fallback and the practice set");
ok((JS.match(/LINE/g) || []).length >= 9, "the interactive steps carry the fictional line");
const ALL = OWN + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term anywhere in A21");
ok(!/\bAI\b|artificial intelligence/.test(ALL) && !/projects\/|research\.html/.test(OWN + JS), "no 'AI', no project page, no Research page");
ok(!/\b(threat|hostile|weaponi[sz]|coerc|blackmail|unreliable|aggress)/i.test(ALL), "no verdicts on countries");
ok(!/hand-written|builder learn-|\bG-[A-Z]{2,}\b|\bguard\b/i.test(RAW), "no production wording or guard names in the shipped data file");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
const okHref = h => /^https:\/\/(www\.iea\.org|www\.eia\.gov|ec\.europa\.eu|single-market-economy\.ec\.europa\.eu|www\.usgs\.gov|doi\.org)\//.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h);
ok(hrefs.every(okHref), "links: IEA, EIA, the European Commission, USGS, doi.org and learn pages (" + hrefs.filter(h => !okHref(h)).join(", ") + ")");
ok(Object.values(D.sources).every(s => s.url === "no link" || okHref(s.url)), "the data file's sources are allow-listed or cited without a link");
ok(/f10-nations-differ\.html/.test(OWN) && /m13-national-pathway\.html/.test(OWN) && /c4-prairieland-2050\.html/.test(OWN) && !/\(upcoming\)/.test(OWN) && /cf1-supply-chain-microgrids\.html/.test(OWN), "F10, M13 and C4 linked now they are live (W6 integration); CF1 linked");

// ---------------- the practice set balances as displayed
{ const P = M.practice(PL, D), num = s => Number(s.replace(/,/g, "")); ok((P.match(/<li>/g) || []).length === 6, "six worked exercises");
  const m1 = P.match(/([\d,]+) \+ ([\d,]+) × ([\d.]+) = ([\d,]+) PJ; ÷ ([\d,]+) = ([\d.]+)%/); ok(m1 && near(num(m1[1]) + num(m1[2]) * num(m1[3]), num(m1[4]), 0.5) && near(100 * num(m1[4]) / num(m1[5]), num(m1[6]), 0.05), "exercise 1 balances");
  const m2 = P.match(/((?:\d+² \+ )+\d+²) = ((?:[\d,]+ \+ )+[\d,]+) = ([\d,]+)\./); ok(m2 && m2[1].split(" + ").reduce((s, t) => s + Math.pow(num(t.replace("²", "")), 2), 0) === num(m2[3]) && m2[2].split(" + ").reduce((s, t) => s + num(t), 0) === num(m2[3]), "exercise 2 balances");
  const m3 = P.match(/([\d,]+) PJ × \$([\d.]+) × \((\d) − 1\) = \$([\d,]+) million/); ok(m3 && near(num(m3[1]) * num(m3[2]) * (num(m3[3]) - 1), num(m3[4]), 0.5), "exercise 3 balances");
  const m4 = P.match(/Lost: ([\d,]+) × 63 ÷ 365 = ([\d.]+) PJ; stocks: ([\d,]+) × (\d+) ÷ 365 = ([\d.]+) PJ; short by ([\d.]+) PJ/); ok(m4 && near(num(m4[1]) * 63 / 365, num(m4[2]), 0.05) && near(num(m4[3]) * num(m4[4]) / 365, num(m4[5]), 0.05) && near(num(m4[2]) - num(m4[5]), num(m4[6]), 0.05), "exercise 4 balances as displayed");
  const m5 = P.match(/(\d+)% \+ (\d+)% × (\d+)% = ([\d.]+)% a year; \((\d) × ([\d.]+) \+ (\d+)\/365\) ÷ (\d) = ([\d.]+)/); ok(m5 && near(num(m5[1]) + num(m5[2]) * num(m5[3]) / 100, num(m5[4]), 0.05) && near((num(m5[5]) * num(m5[6]) + num(m5[7]) / 365) / num(m5[8]), num(m5[9]), 0.0006), "exercise 5 balances");
  const m6 = P.match(/(\d+)\/12 × \((\d+) − (\d+) × 0\.3\) = ([\d.]+) GWh, against (\d+)\/12 × (\d+) = ([\d.]+) GWh with one site/); ok(m6 && near(num(m6[1]) / 12 * (num(m6[2]) - num(m6[3]) * 0.3), num(m6[4]), 0.05) && near(num(m6[5]) / 12 * num(m6[6]), num(m6[7]), 0.05), "exercise 6 balances");
  // one short question per item, its numbers in a table beside it (W6 finding)
  const items = [...P.matchAll(/<li><p><b>[^<]+<\/b> ([\s\S]*?)<\/p>([\s\S]*?)<details/g)];
  ok(items.length === 6 && items.every(x => /<table class="lx-mini-table a21-given">/.test(x[2]) && (x[1].match(/\?/g) || []).length === 1), "each exercise asks one question, with its numbers in a table");
  ok(/<th scope="row">Crude oil imports<\/th><td>[\d,]+ PJ a year, all through the strait/.test(P) && /1 PJ is a million GJ/.test(P), "the givens carry the volumes and the PJ-to-GJ conversion"); }

// ---------------- text budget
// maths: $$...$$, and $...$ whose opening $ is followed by a letter or a backslash (currency, $8.40 or $ per GJ, is text)
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/(^|[^\\])\$(?=[A-Za-z\\])[^$\n]*?[^\s\\]\$(?!\d)/g, "$1x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/(\d)\.(\d)/g, "$1,$2").replace(/et al\./g, "et al").split(/(?<=[.?!])\s+(?=[A-Z“$0-9−])/).filter(x => /[A-Za-z]/.test(x)).length;
const stepTexts = [...JS.matchAll(/\{ text: "((?:[^"\\]|\\.)*)",\n\s*build/g)].map(m => m[1].replace(/\\"/g, '"'));
ok(stepTexts.length === 10, "ten step cards (" + stepTexts.length + ")");
stepTexts.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words (about 35)"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
{ const S = S0, on = { spike: true, closure: true, ban: true, fire: true };
  const lines = [M.depLine(PL), M.depLine(PL, "substitution"), M.depSaw(PL), M.straitSaw(PL), M.hhiLine(PL, D, 90), M.hhiLine(PL, D, 30), M.hhiSaw(PL, D, 90), M.spikeLine(PL, 0), M.spikeSaw(PL, 0), M.spikeSaw(PL, 30),
    M.closureLine(PL, D, S), M.closureSaw(PL, D, S), M.closureLine(PL, D, Object.assign({}, S, { weeks: 26, restraint: 20 })), M.closureSaw(PL, D, Object.assign({}, S, { weeks: 26, stockDays: 0 })),
    M.banLine(PL, S), M.banSaw(PL, S), M.fireLine(PL, S), M.fireLine(PL, Object.assign({}, S, { split: 50 })), M.fireSaw(PL, S), M.boardLine(PL, D, on, S), M.boardSaw(PL, D, on, S)].concat(Object.values(M.PREDICT.feedback), [D.thresholds.hhiWhat, D.thresholds.oneCountryWhat]);
  ["dep", "strait", "hhi", "spike", "closure", "ban", "fire", "board"].forEach(k => lines.push(...M.notesFor(PL, D, k)));
  D.fireTiming.forEach(x => lines.push(M.boardSaw(PL, D, on, S, x.key), M.boardSaw(PL, D, { spike: false, closure: false, ban: true, fire: true }, S, x.key)));
  lines.push(M.hhiSaw(PL, D, 30), M.fireLine(PL, Object.assign({}, S, { split: 30 })));
  lines.forEach(t => { ok(nWords(t) <= 40, "a line of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a line of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); }); }
// every step's notes are on the page through notes(act, key); the assumptions behind each stress test are listed there
ok(["dep", "strait", "hhi", "spike", "closure", "ban", "fire", "board"].every(k => new RegExp("notes\\(act, \"" + k + "\"\\)").test(JS)) && M.notesFor(PL, D, "board").indexOf(D.assume.overlap) >= 0 && M.notesFor(PL, D, "spike").indexOf(D.assume.spikeStocks) >= 0, "each step lists its notes, one idea per line; the combined count and the stocks caveat among them");
// every element of the page, the no-JS block and the practice set included (W6 finding: they were left out); the
// approved excerpt and its two approved lines are word for word and checked above
const PROSE = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ").replace(/<blockquote[\s\S]*?<\/blockquote>/, " ").replace(/<ul class="lx-hint a21-holds">[\s\S]*?<\/ul>/, " ").replace(/^---[\s\S]*?\n---\n/, " ")
  .replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 38, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 2, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls, glossary, demo hooks
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("a21"/.test(JS), "live regions; levers persist in this browser");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 10, "a demo hook for each of the ten steps");
ok(/id: hhi\b/.test(SIDE) && /\[\[hhi\||term="hhi"/.test(JS + PAGE), "the sidecar defines and the page marks hhi");
["gdp", "petajoule"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE) && new RegExp("\\[\\[" + id + "\\|").test(JS), "the sidecar defines and the page marks " + id));
["lng", "primary-energy", "substitution-method", "job-year", "transfer-payment", "shadow-price"].forEach(id => ok(new RegExp("\\[\\[" + id + "\\||term=\"" + id + "\"").test(JS + PAGE), "the page marks " + id + " (W6 finding: terms at first use)"));

// ---------------- W6 review fixes, one check each
{ const sp = M.spikeSaw(PL, 0), my = M.myths(PL, D);
  ok(!/do not help|only using less gas helps/.test(sp + my + JS) && /cushions? .*while it lasts/.test(my) && /stored gas can cushion purchases while it lasts/.test(D.assume.spikeStocks) && D.sort.items.find(x => x.key === "stocks").ref.spike === "partly", "stocks against a price spike: partly, in the step, the myth and the sort alike");
  ok(/supply groups/.test(M.hhiSaw(PL, D, 90)) && /upper bound/.test(M.hhiSaw(PL, D, 90)) && /upper bound/.test(PAGE) && !/four refiners/.test(PAGE + JS), "the four suppliers are supply groups; the HHI shown is an upper bound");
  ok(PL.imports.minerals.hhiMethod.indexOf(M.fmtN(D.thresholds.hhiHigh)) >= 0 && /2023/.test(PL.imports.minerals.hhiMethod), "the shared data's HHI reading is the 2023 guidelines' " + M.fmtN(D.thresholds.hhiHigh) + ", as the page says");
  const si = M.straitInputs(PL); ok(si.length === 3 && si[0][1] === M.fmtN(I.oil.importPJ) && si[1][1] === M.fmtN(I.lng.importPJ) && si[2][1] === M.fmtN(M.dependence(PL).primary) && /straitInputs\(PL\)/.test(JS), "step 3 shows the inputs its question needs");
  ok(/function paintExplain\(\)/.test(JS) && /setTimeout\(paintExplain/.test(JS) && /ban\(PL, S\)/.test(JS) && /with your levers/.test(JS) && /with 2025's settings/.test(JS), "the explain layer is drawn from the reader's levers and says whose numbers they are");
  ok(/IEA report of 2025 \(latest year available for each mineral; years vary\)/.test(M.facts(PL, D)) && !/Leading refiner of strategic minerals, 2025</.test(M.facts(PL, D)), "the IEA minerals figure is labelled by its report year, its observation years varying");
  ok(!/its dual value prices/.test(PAGE) && /not the value of security/.test(PAGE), "a shadow price is a modelled cost change, not the value of security"); }
// import-dependence: one definition for the course, in F10's sidecar since the W6 integration (F10 teaches it first)
const F10SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/f10-nations-differ.yml"), "utf8");
ok(/id: import-dependence\b/.test(F10SIDE) && !/id: import-dependence\b/.test(SIDE) && /\[\[import-dependence\||term="import-dependence"/.test(JS + PAGE), "F10's sidecar defines import-dependence (one definition); the page marks it");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
