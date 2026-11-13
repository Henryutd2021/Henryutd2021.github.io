// test_m06-carbon-in-models.js — Node tests for M6 (assets/learn/m06-carbon-in-models.js: the Plains Grid's planning LP
// and M6's page) with the vendored HiGHS.
//   - the representative days: each season's medoid and the two extreme days are what medoids() picks from 2025; the
//     weights add to 365; the capital costs from first principles (capex x CRF + upkeep; the battery moved to 2025 dollars)
//   - the LP: every hour balances in the solved plans; the battery's energy balances and stays within 4 hours of its size
//   - caps: each binds (CO2 = cap) with a positive dual; the dual equals both one-sided changes of the cost (unique);
//     the frontier's slopes rise as the cap tightens (convex); every shown number is the same for every best plan
//   - prices: at every slider price the range of CO2 among the best plans is narrower than the page's rounding; at a cap's
//     dual the tied stretch contains the cap's CO2 (the page's tie claim); a plan of the cap scores the price's optimum
//   - procurement: the hourly rule holds every hour of the six days, the buyer's battery charges only from its own wind
//     and sun; claims are 0; certificates from existing wind change nothing (the annual rule is met by the existing
//     fleet's wind); every shown number is unique; the full-year checks in Go deeper (annual energy, unmatched hours)
//   - the page's blocks (fallback, explain, check, full year, reference block) are written from the model (--write)
//   - research wording: every excerpt sentence is approved (E6, E10) word for word in the approved wording (E11.10 left
//     out: nothing public says total demand stays constant); the repository
//     commands are the README's; scope; links; text budget; the notebook reads the same data and asserts the reference;
//     the page on a stub document with a failing, then working, solver
//   - claims: each 0 t claim is labelled as holding on the six days under the market-based method, with the full year's
//     result beside it; the cost of a purchase is the added system cost, and the buyer's bill is said not to be modeled
//   - practice task 2 (the notebook's check_task2): at the 50% cap the total curtailed energy is the same for every best
//     plan, while the share of it at the existing wind farms is not (reference block "practice", from a fresh solve)
//   - the details: the printed (rounded) dual does not tie, the unrounded one does; the full-year check
//     reports only the unmatched energy (the optimum; which hours carry it can differ); the no-rule purchase is counted
//     at average factors, not 0 t; the dual is the magnitude of the frontier's downward slope; the stage switches to the
//     year with the data center in steps 5-7; the explain layer follows the reader's cap; a solve that ends after the
//     reader left its step paints nothing; every line the page assembles, at every setting, within the text budget
// Usage (from the site folder):  node _tests/learn/test_m06-carbon-in-models.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PRIV = require("./private_sources.js");
const ID = "m06-carbon-in-models";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const QMD = path.join(SITE, "learn", ID + ".qmd"), DPATH = L("data/" + ID + ".json");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
let PAGE = fs.readFileSync(QMD, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
const NB = readOr(path.join(SITE, "learn/notebooks", ID + ".ipynb")), SIDE = readOr(path.join(SITE, "learn/_w1", ID + ".yml"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const f2 = v => "$" + v.toFixed(2);
function dm(v) { const r = Math.round(v / 1e5) / 10; return (r < 0 ? "−$" : r > 0 ? "+$" : "$") + Math.abs(r).toFixed(1) + "M"; }
function dmt(v) { const r = Math.round(v / 1e4) / 100; return (r < 0 ? "−" : r > 0 ? "+" : "") + Math.abs(r).toFixed(2) + " Mt"; }

(async () => {
  const F = await require("./plains_face.js")(), PP = F.PP, Y = F.Y, fm = PP.fm, mt = fm.mt, musd = fm.musd, mw = fm.gw;
  // ---------------- days and costs
  { const md = PP.medoids(F.A.plains, F.M, F.year, PP.profiles(F.A.plains, F.year, F.T, F.PR.townProfile));
    ok(JSON.stringify(md.map(x => [x.date, x.season, x.kind, x.weight])) === JSON.stringify(D.days.map(x => [x.date, x.season, x.kind, x.weight])), "the six days in the data file are medoids() of 2025: " + md.map(x => x.date).join(", "));
    ok(D.days.reduce((s, x) => s + x.weight, 0) === 365, "weights add to 365 days");
    ok(D.days.every(x => x.dateLabel === new Date(x.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })), "date labels"); }
  { const crf = (r, n) => r / (1 - Math.pow(1 + r, -n)), defl = 128.989 / 125.43;
    ok(near(Y.cost.wind.cap, 1712e3 * crf(0.04, 30)) && near(Y.cost.solar.cap, 1484e3 * crf(0.04, 30)) && near(Y.cost.battery.kW, (372 + 4 * 241) * defl, 1e-9), "annual capital from first principles; battery in 2025 dollars"); }
  const base = F.run({}), E0 = base.R.co2;
  function balanced(run, L) {
    const v = k => run.r.values[k] || 0;
    return Y.days.every((d, k) => [...Array(24).keys()].every(t => { const j = k * 24 + t;
      const sup = ["we", "se", "wn", "sn", "wb", "sb", "cc", "ct", "dc", "dcb", "un"].reduce((s, n) => s + v(n + j), 0) - v("ch" + j) - v("chb" + j);
      const pj = k * 24 + (t + 23) % 24, sb = v("soc" + j) - v("soc" + pj) - 0.85 * v("ch" + j) + v("dc" + j);
      return near(sup, d.demand[t] + (L || 0), 1e-4) && near(sb, 0, 1e-4) && v("soc" + j) <= 4 * run.R.Bn + 1e-4; }));
  }
  ok(base.R.ok && balanced(base) && base.R.Wn === 0 && base.R.Sn === 0 && base.R.Bn === 0, "no carbon rule: optimal, balanced, nothing new built");
  // ---------------- caps
  const caps = D.caps.map(c => { const o = { cap: c / 100 * E0 }, x = F.run(o), d = 1000;
    const up = F.solve(PP.build(Y, Object.assign({}, o, { delta: { cap: d } }))).objective, dn = F.solve(PP.build(Y, Object.assign({}, o, { delta: { cap: -d } }))).objective;
    return { c, o, x, s1: (x.r.objective - up) / d, s2: (dn - x.r.objective) / d }; });
  caps.forEach(z => {
    ok(z.x.R.ok && balanced(z.x) && near(z.x.R.co2, z.o.cap, 1) && z.x.R.capPrice > 0, `cap ${z.c}%: optimal, binding, positive dual`);
    ok(near(z.s1, z.x.R.capPrice, 1e-3) && near(z.s2, z.x.R.capPrice, 1e-3), `cap ${z.c}%: the dual ${f2(z.x.R.capPrice)} equals both one-sided changes (${z.s1.toFixed(3)}, ${z.s2.toFixed(3)}): unique`);
    ok(near(z.x.r.objective, z.x.R.resource, 1e-3), `cap ${z.c}%: the LP's cost is the resource cost (no transfers under a cap)`);
  });
  ok(caps.every((z, i) => i === 0 || z.x.R.capPrice >= caps[i - 1].x.R.capPrice - 1e-6), "the dual rises as the cap tightens (a convex frontier)");
  ok(caps[2].x.R.capPrice - caps[0].x.R.capPrice < 1.5 && caps[6].x.R.capPrice > 5 * caps[0].x.R.capPrice, "a nearly straight stretch from 90% to 70% (duals within $1.50), then a steep rise");
  // uniqueness of every shown number at every cap
  const SHOWN = { co2: mt, Wn: mw, Sn: mw, Bn: mw };
  let bad = [];
  [{ o: {}, r: base.R, tag: "base" }].concat(caps.map(z => ({ o: z.o, r: z.x.R, tag: "cap" + z.c }))).forEach(z => {
    const fc = F.face(z.o, Object.keys(SHOWN), 0.01);
    Object.keys(SHOWN).forEach(n => { const s = SHOWN[n]; if (!(s(fc[n][0]) === s(fc[n][1]) && s(fc[n][0]) === s(z.r[n]))) bad.push(z.tag + " " + n + " " + s(fc[n][0]) + ".." + s(fc[n][1])); });
  });
  ok(bad.length === 0, "every shown number under a cap is the same for every best plan: " + bad.join("; "));
  // ---------------- prices
  const prices = [], ties = [];
  for (let tau = 0; tau <= 140; tau += 10) {
    const r = F.solve(PP.build(Y, { tau })), lo = F.solve(PP.faceModel(Y, { tau }, r.objective, 1)), hi = F.solve(PP.faceModel(Y, { tau }, r.objective, -1));
    prices.push({ tau, R: PP.read(Y, { tau }, r), lo: lo.objective, hi: -hi.objective });
  }
  ok(prices.every(p => p.hi - p.lo < 5000 && mt(p.lo) === mt(p.hi)), "every slider price picks one CO2 outcome (the CO2 range among best plans is under 5 kt and prints the same); schedules may still differ");
  caps.forEach(z => {
    const tau = z.x.R.capPrice, r = F.solve(PP.build(Y, { tau })), lo = F.solve(PP.faceModel(Y, { tau }, r.objective, 1)).objective, hi = -F.solve(PP.faceModel(Y, { tau }, r.objective, -1)).objective;
    ties.push({ c: z.c, tau, lo, hi, co2: z.x.R.co2 });
    ok(lo <= z.x.R.co2 + 1 && hi >= z.x.R.co2 - 1, `cap ${z.c}%: at its dual the tied stretch ${mt(lo)}..${mt(hi)} contains the cap's ${mt(z.x.R.co2)}`);
    ok(near(z.x.R.resource + tau * z.x.R.co2, r.objective, 1), `cap ${z.c}%: the cap's plan scores the price's optimum (cost + price x CO2)`);
  });
  ok(ties.filter(t => t.c >= 70).every(t => t.hi - t.lo > 0.3e6), "on the straight stretch (90% to 70%) the cap's dual ties plans spread over more than 0.3 Mt");
  { const t70r = +ties.find(t => t.c === 70).tau.toFixed(2), r = F.solve(PP.build(Y, { tau: t70r })), lo = F.solve(PP.faceModel(Y, { tau: t70r }, r.objective, 1)).objective, hi = -F.solve(PP.faceModel(Y, { tau: t70r }, r.objective, -1)).objective;
    ok(t70r === 22.81 && hi - lo < 5000, `the printed dual, $${t70r.toFixed(2)}, does not tie (best plans ${mt(lo)}..${mt(hi)}): the tie needs the dual's full precision, as the page says`); }
  // ---------------- procurement
  const L0 = D.load.mw, cases = { none: F.run({ load: L0 }), annual: F.run({ load: L0, buy: "annual" }), hourly: F.run({ load: L0, buy: "hourly" }) };
  Object.keys(cases).forEach(k => ok(cases[k].R.ok && balanced(cases[k], L0) && cases[k].R.unMWh < 1e-6, k + ": optimal, balanced with the load, nothing unserved"));
  { const h = cases.hourly, v = n => h.r.values[n] || 0;
    ok(Y.days.every((d, k) => [...Array(24).keys()].every(t => { const j = k * 24 + t; return v("wb" + j) + v("sb" + j) + v("dcb" + j) - v("chb" + j) >= L0 - 1e-4 && v("chb" + j) <= v("wb" + j) + v("sb" + j) + 1e-4; })), "hourly: every hour of the six days matched; the buyer's battery charges only from its own wind and sun"); }
  ok(cases.annual.R.newClean >= L0 * 24 * 365 - 1, "annual: the buyer's new wind and sun make the year's load on the six weighted days");
  { const ex = Y.days.reduce((s, d) => s + d.weight * PP.sum(d.we.map((x, t) => x + d.se[t])), 0); ok(ex > L0 * 24 * 365, "certificates from existing wind: the existing fleet makes more than the load's year, so the rule binds nothing and the plan equals no rule"); }
  ok(cases.none.R.Wn === 0 && cases.none.R.Sn === 0 && cases.none.R.co2 > E0, "no rule: nothing built for the data center; gas serves it");
  ok(cases.hourly.R.co2 < E0 && cases.annual.R.co2 > E0 && cases.annual.R.co2 < cases.none.R.co2, "same claim, different consequences: hourly below the grid without the load, annual just above it, no rule far above");
  const PSHOW = { co2: mt, Wn: mw, Sn: mw, Bn: mw, Wb: mw, Sb: mw, Bb: mw };
  bad = [];
  [["none", { load: L0 }], ["annual", { load: L0, buy: "annual" }], ["hourly", { load: L0, buy: "hourly" }]].forEach(([k, o]) => {
    const names = Object.keys(PSHOW).filter(n => o.buy || !/b$/.test(n)), fc = F.face(o, names, 0.01);
    names.forEach(n => { const s = PSHOW[n]; if (!(s(fc[n][0]) === s(fc[n][1]) && s(fc[n][0]) === s(cases[k].R[n]))) bad.push(k + " " + n + " " + s(fc[n][0]) + ".." + s(fc[n][1])); });
  });
  ok(bad.length === 0, "every shown number under each purchase is the same for every best plan: " + bad.join("; "));
  // ---------------- the full-year checks (Go deeper): the six days against all 8,760 hours of 2025
  const PF = Y.PF, H8 = PF.w.length;
  const annualTWh = PF.w.reduce((s, x) => s + x, 0) * cases.annual.R.Wb, loadYear = L0 * H8;
  const hr = cases.hourly.R, vars = [], cons = [];
  for (let i = 0; i < H8; i++) {
    const p = (i + H8 - 1) % H8;
    vars.push({ name: "w" + i, ub: PF.w[i] * hr.Wb }, { name: "s" + i, ub: PF.s[i] * hr.Sb }, { name: "c" + i, ub: hr.Bb }, { name: "d" + i, ub: hr.Bb }, { name: "e" + i, ub: 4 * hr.Bb }, { name: "u" + i, cost: 1 });
    cons.push({ name: "m" + i, terms: { ["w" + i]: 1, ["s" + i]: 1, ["d" + i]: 1, ["c" + i]: -1, ["u" + i]: 1 }, ge: L0 },
      { name: "q" + i, terms: { ["c" + i]: 1, ["w" + i]: -1, ["s" + i]: -1 }, le: 0 },
      { name: "b" + i, terms: { ["e" + i]: 1, ["e" + p]: -1, ["c" + i]: -0.85, ["d" + i]: 1 }, eq: 0 });
  }
  const fy = F.solve({ sense: "min", variables: vars, constraints: cons }), shortI = [...Array(H8).keys()].filter(i => (fy.values["u" + i] || 0) > 1e-6);
  ok(fy.ok, "full-year check of the hourly portfolio: optimal (least unmatched energy, the battery cyclic over the year)");
  const FY = { annualShare: annualTWh / loadYear, shortMWh: fy.objective, matched: 1 - fy.objective / loadYear };
  { const six = Y.days.reduce((s, d) => s + d.weight * PP.sum(d.cfw), 0) / (365 * 24);
    ok(FY.annualShare < 1 && FY.shortMWh > 1 && six > 0.338 && near(FY.annualShare, 0.338 / six, 1e-9), `the full year shows what six days miss: the six weighted days' wind (${(six * 100).toFixed(1)}%) is above the year's 33.8%, so annual matching falls short; some energy goes unmatched`); }
  ok(shortI.length > 0 && shortI.every(i => PF.w[i] * hr.Wb + PF.s[i] * hr.Sb < L0), "the unmatched energy falls in hours of low wind and sun (the portfolio's own output below 300 MW) in the solved schedule: " + shortI.map(i => (PF.w[i] * hr.Wb + PF.s[i] * hr.Sb).toFixed(0) + " MW").join(", "));
  { const ew = PF.w.reduce((s, x) => s + x, 0) * F.A.plains.windMW; ok(ew > loadYear, `certificates from existing wind hold on the full year too: existing wind makes ${(ew / 1e6).toFixed(2)} TWh against the load's ${(loadYear / 1e6).toFixed(2)} TWh`); }
  ok(Math.round(FY.shortMWh) === 290 && (FY.shortMWh / loadYear * 100).toFixed(2) === "0.01", "the full year: about 290 MWh unmatched, 0.01% of the load's year (the least possible: the optimum, the same for every best schedule)");

  // ---------------- practice task 2: what can differ between the best plans at the 50% cap
  // min and max of a linear quantity (terms over the LP's variables, plus a constant) over the optimal face, the cost held
  // within the page's tolerance (a cent plus 1e-9 of the cost, as faceModel and the notebook's section 4)
  function faceRange(o, terms, k0) {
    const m0 = PP.build(Y, Object.assign({}, o, { tie: false })), r0 = F.solve(m0), cost = {};
    m0.variables.forEach(v => { if (v.cost) cost[v.name] = v.cost; });
    return [1, -1].map(sg => { const r = F.solve({ sense: "min", variables: m0.variables.map(v => Object.assign({}, v, { cost: sg * (terms[v.name] || 0) })),
      constraints: m0.constraints.concat([{ name: "face", terms: cost, le: r0.objective + 0.01 + 1e-9 * Math.abs(r0.objective) }]) }); return r.ok ? k0 + sg * r.objective : NaN; });
  }
  const PRACTICE = (() => {
    const o = { cap: 0.5 * E0 }, curt = {}, wcur = {}; let kAll = 0, kW = 0, cfw = 0, cfs = 0;
    Y.days.forEach((d, k) => { for (let t = 0; t < 24; t++) { const j = k * 24 + t, w = d.weight;
      ["we", "se", "wn", "sn"].forEach(v => { curt[v + j] = -w; }); wcur["we" + j] = -w;
      kAll += w * (d.we[t] + d.se[t]); kW += w * d.we[t]; cfw += w * d.cfw[t]; cfs += w * d.cfs[t]; } });
    curt.Wn = cfw; curt.Sn = cfs;   // curtailed = what the weather gives (existing, plus new sizes x capacity factor) - what is used
    return { cap: 50, curtailed: faceRange(o, curt, kAll), existingWindCurtailed: faceRange(o, wcur, kW) };
  })();
  ok(PRACTICE.curtailed.every(Number.isFinite) && PRACTICE.curtailed[1] - PRACTICE.curtailed[0] < 1 && PRACTICE.curtailed[0] > 1e5,
    `practice task 2: at the 50% cap every best plan curtails the same energy, ${PRACTICE.curtailed.map(v => v.toFixed(1)).join(" to ")} MWh a year`);
  ok(PRACTICE.existingWindCurtailed[0] < 1 && PRACTICE.existingWindCurtailed[1] > PRACTICE.curtailed[0] - 1,
    `practice task 2: the existing wind farms' share of it can be anything from ${PRACTICE.existingWindCurtailed[0].toFixed(1)} to ${PRACTICE.existingWindCurtailed[1].toFixed(1)} MWh: a tie in the schedule`);

  // ---------------- the reference block and the page's generated blocks
  const ref = { about: "Reference results, solved with the lesson's LP in HiGHS. CO2 in t, money in $ a year (2025 dollars).",
    size: { cols: base.m.variables.length, rows: base.m.constraints.length }, E0: E0, base: { cost: base.R.resource },
    caps: caps.map(z => ({ cap: z.c, co2: z.x.R.co2, cost: z.x.R.resource, dual: z.x.R.capPrice, Wn: z.x.R.Wn, Sn: z.x.R.Sn })),
    ties: ties.map(t => ({ cap: t.c, tau: t.tau, lo: t.lo, hi: t.hi })),
    prices: prices.map(p => ({ tau: p.tau, co2: p.R.co2, cost: p.R.resource })),
    buy: Object.fromEntries(Object.keys(cases).map(k => [k, { co2: cases[k].R.co2, cost: cases[k].R.resource, Wb: cases[k].R.Wb, Sb: cases[k].R.Sb, Bb: cases[k].R.Bb }])),
    fullYear: FY, practice: { cap50: PRACTICE } };
  const c70 = caps.find(z => z.c === 70), t70 = ties.find(t => t.c === 70), N = cases.none.R, An = cases.annual.R, Hr = cases.hourly.R;
  const buyRow = (lab, R, claim, yr, built) => `<tr><td>${lab}</td><td data-label="May claim, six days">${claim}</td><td data-label="On all of 2025">${yr}</td><td data-label="The plants emit">${dmt(R.co2 - E0)}</td><td data-label="Added system cost">${dm(R.resource - N.resource)}</td><td data-label="Built for it">${built}</td></tr>`;
  const YR = { annual: `${Math.round(FY.annualShare * 100)}% of the load matched`, hourly: `${Math.round(FY.shortMWh).toLocaleString("en-US")} MWh unmatched` };
  const FALLBACK = `<p class="lx-eyebrow">The Plains Grid's planning LP: caps, their duals, and four purchases for a data center</p>
<p class="lx-hint">Mt = million tonnes of CO₂; costs a year in 2025 dollars.</p>
<table class="lx-facts m6-fb">
<thead><tr><th scope="col">Cap, share of ${mt(E0)}</th><th scope="col">CO₂</th><th scope="col">Cost</th><th scope="col">Dual, $ per t</th></tr></thead>
<tbody>
<tr><td>No carbon rule</td><td data-label="CO₂">${mt(E0)}</td><td data-label="Cost">${musd(base.R.resource)}</td><td data-label="Dual">–</td></tr>
${caps.map(z => `<tr><td>${z.c}%</td><td data-label="CO₂">${mt(z.x.R.co2)}</td><td data-label="Cost">${musd(z.x.R.resource)}</td><td data-label="Dual">${f2(z.x.R.capPrice)}</td></tr>`).join("\n")}
</tbody>
</table>
<p class="lx-hint">At the 70% cap's dual, ${f2(t70.tau)} per t rounded (the tie needs its full precision), every plan from ${mt(t70.lo)} to ${mt(t70.hi)} scores the same: a price there picks no single plan.</p>
<table class="lx-facts m6-fb">
<thead><tr><th scope="col">The 300 MW data center buys</th><th scope="col">May claim, six days</th><th scope="col">On all of 2025</th><th scope="col">The plants emit</th><th scope="col">Added system cost</th><th scope="col">Built for it</th></tr></thead>
<tbody>
${buyRow("No rule on what it buys", N, "its share at average factors", "–", "nothing")}
${buyRow("Certificates from existing wind", N, "0 t", "the load's year covered", "nothing")}
${buyRow("New wind and sun, matched over the year", An, "0 t", YR.annual, `${mw(An.Wb)} wind`)}
${buyRow("New wind, sun and batteries, matched hour by hour", Hr, "0 t", YR.hourly, `${mw(Hr.Wb)} wind, ${mw(Hr.Sb)} solar, ${mw(Hr.Bb)} battery`)}
</tbody>
</table>
<p class="lx-hint">Claims follow the <span class="lx-term" data-term="market-based">market-based method</span>: each certificate counted once and retired for this buyer alone. They hold on the six days; the full year is checked apart.</p>
<p class="lx-hint">The plants' change is against the grid without the data center; the added system cost, new plants and gas for the whole grid, against no rule.</p>
<p class="lx-hint">The buyer's own bill depends on contracts and prices, which this model does not calculate.</p>`;
  const EXPLAIN = `<dl class="lx-ideas">
<dt>A cap</dt><dd>A rule on the year's CO₂. At 70% of ${mt(E0)} the plan costs ${dm(c70.x.R.resource - base.R.resource).replace("+", "")} more, and the cap's dual is ${f2(c70.x.R.capPrice)} per t.</dd>
<dt>The frontier</dt><dd>The dual is the extra cost of cutting one more tonne, the magnitude of the frontier's downward slope: from ${f2(caps[0].x.R.capPrice)} at 90% to ${f2(caps[caps.length - 1].x.R.capPrice)} at 30%.</dd>
<dt>A price and its ties</dt><dd>A price at the 70% cap's unrounded dual ties every plan from ${mt(t70.lo)} to ${mt(t70.hi)}; the cap picks one CO₂ level.</dd>
<dt>A procurement rule</dt><dd>A rule on one buyer's purchases. Hourly matching's system cost is ${dm(Hr.resource - An.resource).replace("+", "")} a year above annual matching's here.</dd>
<dt>Claim and cause</dt><dd>Under the market-based method, three purchases may claim 0 t on the six days; with no rule, the load's share counts at average factors. Against no data center, the plants emit ${dmt(Hr.co2 - E0)} to ${dmt(N.co2 - E0)}.</dd>
</dl>`;
  const FULL = `<ul>
<li><b>Annual matching.</b> On all 8,760 hours of 2025 the ${mw(An.Wb)} of wind make ${Math.round(FY.annualShare * 100)}% of the data center's load over the year: the six weighted days were windier than the year.</li>
<li><b>Hourly matching.</b> Run hour by hour through 2025, the portfolio leaves at least ${Math.round(FY.shortMWh).toLocaleString("en-US")} MWh unmatched, ${(FY.shortMWh / loadYear * 100).toFixed(2)}% of the load's year, in hours of low wind and sun. Which hours carry it can differ between equally good schedules.</li>
<li><b>So:</b> a rule met on representative days is a representative-day result. Check it on the full year, as the notebook does.</li>
</ul>`;
  const CHECK = `<div class="lx-myths" data-quiz="m6-myth">
<div class="lx-qq" data-id="price-cap" data-answer="myth">
<p class="lx-qtext">Myth or fact? “A carbon price equal to a cap's dual gives back exactly the cap's plan.”</p>
<ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>Myth. At the 70% cap's dual (${f2(t70.tau)} per t, rounded; the tie needs its full precision), every plan from ${mt(t70.lo)} to ${mt(t70.hi)} scores the same. The cap's plan is one of them.</p></details>
</div>
<div class="lx-qq" data-id="hourly-cut" data-answer="myth">
<p class="lx-qtext">Myth or fact? “If a buyer's purchases let it claim zero emissions, the plants emit no more than without it.”</p>
<ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>Myth. With certificates from existing wind the data center claims 0 t, and the plants emit ${dmt(N.co2 - E0)} a year more.</p></details>
</div>
<div class="lx-qq" data-id="dual-rise" data-answer="fact">
<p class="lx-qtext">Myth or fact? “In an LP, the cost of cutting one more tonne never falls as the cap tightens.”</p>
<ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>Fact. The LP's frontier is convex: here the dual rises from ${f2(caps[0].x.R.capPrice)} at 90% to ${f2(caps[caps.length - 1].x.R.capPrice)} at 30%.</p></details>
</div>
</div>
<div class="lx-quiz" data-quiz="m6">
<div class="lx-qq" data-id="dual" data-answer="b">
<p class="lx-qtext">A cap's dual is ${f2(c70.x.R.capPrice)} per t. Loosening the cap by 1,000 t changes the best cost by about how much?</p>
<ul class="lx-choices"><li data-value="a">It rises by about $${(+c70.x.R.capPrice.toFixed(2) * 1000).toLocaleString("en-US")}</li><li data-value="b">It falls by about $${(+c70.x.R.capPrice.toFixed(2) * 1000).toLocaleString("en-US")}</li><li data-value="c">It falls by $${c70.x.R.capPrice.toFixed(2)}</li><li data-value="d">Nothing: the dual is only a price</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>It falls by about $${(+c70.x.R.capPrice.toFixed(2) * 1000).toLocaleString("en-US")}: ${f2(c70.x.R.capPrice)} × 1,000 t, the dual rounded to the cent, while the cap stays in the dual's range.</p></details>
</div>
</div>`;
  const blocks = { "m06-fallback": FALLBACK, "m06-explain": EXPLAIN, "m06-fullyear": FULL, "m06-check": CHECK };
  const blockRx = k => new RegExp("(<!-- " + k + ":start[^>]*-->\\n)[\\s\\S]*?(<!-- " + k + ":end -->)");
  if (process.argv.includes("--write")) {
    Object.keys(blocks).forEach(k => { PAGE = PAGE.replace(blockRx(k), "$1" + blocks[k].replace(/\$/g, "$$$$") + "\n$2"); });
    fs.writeFileSync(QMD, PAGE); D.reference = ref; fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n");
    console.log("wrote the page's blocks and the reference block");
  }
  Object.keys(blocks).forEach(k => ok(PAGE.includes(blocks[k] + "\n<!-- " + k + ":end -->"), "the page's block " + k + " is written from the model (run --write)"));
  ok(JSON.stringify(D.reference) === JSON.stringify(JSON.parse(JSON.stringify(ref))), "the reference block equals a fresh solve (run --write)");

  // ---------------- research wording, scope, links, text
  const norm = s => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const SNAP = {
    "E6.6": "Reductions are computed under average-emission-intensity accounting with perfect foresight; they are not estimates of the consequential (marginal) system response.",
    "E10.1": "A two-stage stochastic linear program sized electrolyzers, hydrogen tanks and fuel cells once in each of ERCOT's eight weather zones, with hydrogen pipelines between neighboring zones, then scheduled the system hour by hour over a full year in nine scenarios: three completion rates of planned renewable capacity by three electricity-demand levels.",
    "E10.2": "When gas-fired backup power became much more expensive, the model built fuel cells and turned stored green hydrogen back into electricity.",
    "E10.3": "Industry then drew more hydrogen from gas reformers, and the round trip from power to hydrogen and back lost energy, so total emissions rose although gas-plant emissions fell.",
    "E10.4": "Inputs reflect 2022–2023 conditions; post-2023 federal hydrogen credit rules are not modeled."
  };
  const RP = PRIV.all("excerpts", "publications"); let APPROVED = SNAP;   // the wording checks also read the publication list
  if (RP) {
    const md = fs.readFileSync(RP, "utf8"), reg = {};
    md.split("\n").forEach(line => { const m = line.match(/^\| (E(6|10|11)\.\d+)(?: \[N\])? \| (.*) \|\s*$/); if (m && !reg[m[1]]) reg[m[1]] = norm(m[3].split(" | ")[0]); });
    Object.keys(SNAP).forEach(k => ok(reg[k] === SNAP[k], `approved wording ${k} equals the snapshot`));
    ok(/E10 in CF3, M8, A10, M6/.test(md) && /E6 in A10, M6/.test(md), "the approved wording records the M6 placements (E6, E10)");
    APPROVED = reg;
    const bib = fs.readFileSync(PRIV.path("publications"), "utf8").toLowerCase();
    [...PAGE.matchAll(/<li>Li et al\. \(\d{4}\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>/g)].forEach(m => {
      const entry = bib.split("\n@").find(e => e.includes("title={" + m[2].toLowerCase() + "}")) || "", doi = (entry.match(/doi\s*=\s*\{([^}]+)\}/) || [])[1];
      ok(entry && (!doi || doi === m[1].replace("https://doi.org/", "").toLowerCase()), "citation title (and DOI) as in the publication list: " + m[2].slice(0, 50));
    });
  } else console.log("note: the approved excerpt wording and the publication list are not both available (set LEARN_SOURCES); checked against the snapshot");
  const UNITS = Object.values(APPROVED).map(norm), approved = s => { s = norm(s); return s.length > 0 && UNITS.some(u => u === s || u.split(/(?<=[.?!])\s+/).indexOf(s) >= 0); };
  const quotes = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>/g)];
  ok(quotes.map(q => q[1]).join(",") === "excerpt:ghg,excerpt:txh2", "two excerpts: ghg and txh2");
  quotes.forEach(q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].forEach(p => ok(approved(p[1]), `${q[1]}: approved sentence: ${norm(p[1]).slice(0, 60)}`)));
  const paras = q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(p => norm(p[1])).join(" ");
  ok(paras(quotes[0]) === SNAP["E6.6"] && paras(quotes[1]) === [SNAP["E10.1"], SNAP["E10.2"], SNAP["E10.3"]].join(" "), "ghg: E6.6; txh2: E10.1, E10.2, E10.3, word for word");
  ok(!/Modest load flexibility/.test(PAGE + JS), "E11.10 is not placed in M6");
  ok(PAGE.includes(`<p class="lx-hint">${SNAP["E10.4"]}</p>`), "E10.4 under the txh2 excerpt");
  const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "");
  const RX = /\b(stud(y|ies)|paper|Li et al|course author|excerpt|ERCOT|Texas|weather zones?|load regulation)\b/i;
  const LABELS = [/^Paper page and citation$/, /^From: Li et al\. \(2025\), (Cell Reports Sustainability|International Journal of Hydrogen Energy)\.$/, /^Li et al\. \(2025\)\. .+\.$/,
    /^(Paper page and citation · )?Case file CF6: how much shifting load to cleaner hours can cut emissions, and when\.$/];
  const elems = OWN.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|summary|details|h[1-6]|header|script)\b[^>]*>/i).map(norm).filter(s => /[A-Za-z]/.test(s));
  const strs = (JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || []).map(s => s.slice(1, -1));
  const fine = x => approved(x) || !RX.test(x) || LABELS.some(r => r.test(norm(x)));
  const badW = elems.concat(strs).filter(s => RX.test(s) && !fine(s) && !norm(s).split(/(?<=[.?!])\s+/).every(fine));
  ok(badW.length === 0, "research wording: every sentence about the studies is approved:\n  " + badW.slice(0, 6).join("\n  "));
  ok(!/92\.[49]|(?<![\d.])3\.8%|131 t|1,300 t/.test(PAGE + JS), "no number from the txh2 paper");
  ok(/ghg-framework synthetic my_inputs\//.test(PAGE) && /ghg-framework run my_inputs\/ --region Mixed --limit 0\.08 --lam 5/.test(PAGE), "Try it yourself: the README's commands");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(OWN + JS + JSON.stringify(D)), "no nuclear term in the lesson's own files");
  ok(!/\bAI\b|artificial intelligence/.test(OWN + JS), "no AI wording");
  { const dc = (OWN + JS).match(/[^.;:!?"]*data cent[^.;:!?"]*/gi) || []; ok(dc.every(s => /load|buy|claim|purchas|300 MW|plants emit|without the|with the|for it|serves|cost|matching/i.test(s)), "data centers appear only as a load: " + dc.filter(s => !/load|buy|claim|purchas|300 MW|plants emit|without the|with the|for it|serves|cost|matching/i.test(s)).join(" | ")); }
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
  const ALLOW = /^(https:\/\/(doi\.org|www\.eia\.gov|docs\.nlr\.gov|atb\.nlr\.gov|ergo-code\.github\.io|ghgprotocol\.org|github\.com\/Henryutd2021\/ghg-load-regulation)(\/|$)|notebooks\/m06-carbon-in-models\.ipynb$|[0-9a-z-]+\.html|\.\.\/assets\/|#)/;
  ok(hrefs.every(h => h === "../files/papers/li2025ghg.html" || ALLOW.test(h)), "links only to the listed paper/handbook pages, allowed domains and learn pages: " + hrefs.filter(h => !(h === "../files/papers/li2025ghg.html" || ALLOW.test(h))).join(", "));
  const stepTexts = [...JS.matchAll(/\{ text: "([^\n]+)",\n\s+build:/g)].map(m => m[1].replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1"));
  const sentences = t => t.replace(/\*\*/g, "").split(/(?<=[.?!])\s+(?=[A-Z0-9“"$])/).filter(x => /[A-Za-z]/.test(x)).length;
  ok(stepTexts.length === 7 && stepTexts.every(t => t.split(/\s+/).length <= 40 && sentences(t) <= 2), "seven step texts of 40 words and two sentences at most: " + stepTexts.map(t => t.split(/\s+/).length + "/" + sentences(t)).join(","));
  ok(/\(battery; each day ends with the energy it began with\)/.test(PAGE) && /\(what exists\)/.test(PAGE) && /\(build limits\)/.test(PAGE) && /Every variable is zero or more\./.test(PAGE) && /W, S \\le 8\{,\}000, \\quad B &\\le 4\{,\}000/.test(PAGE) && D.build.wind.max === 8000 && D.build.solar.max === 8000 && D.build.battery.max === 4000 && F.A.plains.plants.cc.mw === 2000 && F.A.plains.plants.ct.mw === 2300,
    "the algebra box states every bound the LP has (what exists, build limits, nonnegativity) with the data's values");
  ok(/\| \$V\$ \| the value of lost load, \\\$10,000 \| \\\$\/MWh \|/.test(PAGE) && /\| \$u_t\$ \| unserved demand \| MW \|/.test(PAGE) && /combined-cycle plants and of the gas peakers/.test(PAGE) && /each step lasts one hour/.test(PAGE), "symbols: u and V apart with their units; cc and ct named; one-hour steps");
  ok(/magnitude of its downward slope/.test(PAGE) && !/Its slope is the dual/.test(PAGE) && /This is complementary slackness: a rule with a nonzero dual holds exactly/.test(PAGE), "the dual is the magnitude of the frontier's slope; complementary slackness in plain words");
  ok(!/still-air/.test(PAGE + JS) && !/\d+ hours short/.test(PAGE), "the full-year box gives no hour count and no 'still-air'");
  { const O2 = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<blockquote[\s\S]*?<\/blockquote>/g, "").replace(/\$\$[\s\S]*?\$\$/g, "");
    const els = O2.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|dd|dt|td|th|summary|footer)\b[^>]*>|\n/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
    const long = els.filter(x => x.split(" ").length > 40);
    ok(long.length === 0, "every page element is 40 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | ")); }
  ok(/glossary:/.test(SIDE) || SIDE === "", "sidecar readable");
  { const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), r = PY.slice(PY.indexOf("id: " + ID), PY.indexOf("id: " + ID) + 1800);
    ok(/status: active/.test(r.split("- kind:")[0]) && r.includes("after: [M1, A10, 12]") && /lab_minutes: 45/.test(r) && PAGE.includes('subtitle: "' + (r.match(/subtitle: "([^"]+)"/) || [])[1] + '"'), "path.yml: active, after M1, A10 and lesson 12, a 45-minute lab, subtitle equal to the page's"); }
  // the notebook reads the same data and asserts the reference
  ok(NB.length > 0 && ["a10-emissions-questions.json", "m06-carbon-in-models.json", "town_year.json", "cf_targets.json"].every(n => NB.includes(n)) && /REF\[\\"caps\\"\]|REF\["caps"\]/.test(NB) && /REF\[\\"buy\\"\]|REF\["buy"\]/.test(NB) && /REF\[\\"fullYear\\"\]|REF\["fullYear"\]/.test(NB), "the notebook reads the four data files and asserts the caps, purchases and full-year checks");
  ok(/def check_task2/.test(NB) && /REF\[\\"practice\\"\]|REF\["practice"\]/.test(NB) && /test whether/.test(NB) && !/Why can the curtailed energy differ/.test(NB), "practice task 2 asks whether total curtailment can differ, and the notebook's check_task2 checks it against the reference block");
  ok(/within a small numerical tolerance/.test(NB) && !/plus a cent\)/.test(NB), "the notebook states the optimal face's tolerance as it is");

  // ---------------- the page on a stub document: a solve that fails, then works
  {
    const { env, load } = require("./stubdom.js");
    const E = env();
    E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
    ["solver", "cards", "controls", "plot", "profiles", "solvestep", "formulate", "ledger", "boundary", "plainsplan"].forEach(n => load(n, E));
    let failing = true, hold = false; const held = [];
    const slv = E.LX.solver; slv.preload = () => Promise.resolve("worker"); slv.mode = "worker";
    slv.solve = m => { if (failing) return Promise.resolve({ status: "time-limit", ok: false, values: null, ms: { roundTrip: 10000 } }); const r = F.solve(m);
      if (hold) return new Promise(res => held.push(() => res(r))); return Promise.resolve(r); };
    let init = null, demo = null;
    E.LX.mount = (slug, fn) => { if (slug === ID) init = fn; };
    E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
    const xp = E.LX.H("div", { id: "m06-explain" }, E.body);
    vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 });
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
    let threw = null;
    try { init(live, { m06_carbon_in_models: D, a10_emissions_questions: F.A, town_year: F.year, cf_targets: F.T }, root); } catch (e) { threw = e.stack; }
    ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
    const tick = async n => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
    try {
      const card = () => demo.cards.el, btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent));
      btns(/Solve: no carbon rule/)[0].click(); await tick(6);
      ok(card().querySelectorAll(".m6-fail").length === 1 && btns(/Try again/).length === 1, "a failed solve shows a note and Try again");
      failing = false; btns(/Try again/)[0].click(); await tick(6);
      ok(card().querySelectorAll(".m6-fail").length === 0 && card().textContent.includes(mt(E0)), "after Try again: no carbon rule solved, CO₂ " + mt(E0));
      demo.cards.go(1); await tick(8);
      const cz = caps.find(z => z.c === 70);
      ok(card().textContent.includes(f2(cz.x.R.capPrice)), "step 2 solves the default 70% cap and shows its dual");
      demo.cards.go(3); await tick(10);
      btns(/Use the dual/)[0].click(); await tick(20);
      ok(card().textContent.includes(mt(t70.lo)) && card().textContent.includes(mt(t70.hi)), "step 4: the cap's dual as a price shows the tied stretch");
      ok(card().textContent.includes("Price in use: the 70% cap's exact dual, " + f2(t70.tau) + " per t rounded, not the slider."), "step 4: the price in use is named (the cap's exact dual, not the slider's value)");
      demo.cards.go(6); await tick(4); btns(/Compare the four purchases/)[0].click(); await tick(30);
      ok(card().textContent.includes(dmt(N.co2 - E0)) && card().textContent.includes(dmt(Hr.co2 - E0)), "step 7: the purchase ledger");
      { const th = [...card().querySelectorAll("th")].map(e => e.textContent).join("|");
        ok(/May claim, six days\|On all of 2025\|The plants emit\|Added system cost/.test(th) && card().textContent.includes(YR.annual) && card().textContent.includes(YR.hourly) && card().textContent.includes("which this model does not calculate"),
          "step 7: the ledger puts the full year beside each claim and names the cost as the added system cost, not the buyer's bill: " + th); }
      ok(xp.textContent.includes("Three ways to put carbon in the LP"), "explain: the three ways");
      const ttl = () => live.querySelector("h3").textContent;
      ok(/with the 300 MW data center/.test(ttl()) && !live.textContent.includes("Your cap") && !live.textContent.includes("The cap's dual"), "steps 5-7: the stage shows the year with the data center, not the earlier cap: " + ttl());
      ok(card().textContent.includes("three purchases may claim 0 t") && !card().textContent.includes("all four may claim"), "step 7: three purchases claim 0 t; the no-rule case counts at average factors");
      // every line the page assembles, at every setting: 40 words and two sentences at most
      const said = [], over = [];
      const grab = () => card().querySelectorAll(".lx-saw, .lx-hint, li, td, th").forEach(e => said.push(e.textContent.replace(/\s+/g, " ").trim()));
      const press = re => card().querySelectorAll("button").filter(b => re.test(b.getAttribute("aria-label") || ""))[0];
      demo.cards.go(0); await tick(4); grab();
      demo.cards.go(1); await tick(8);
      for (let i = 0; i < 4; i++) { press(/^Lower/).click(); await tick(8); }
      for (let i = 0; i < 7; i++) { grab(); if (i < 6) { press(/^Raise/).click(); await tick(8); } }
      ok(xp.textContent.includes("at your cap of 90%"), "explain: the cap card follows the reader's solved cap");
      demo.cards.go(2); await tick(4); btns(/Trace seven caps/)[0].click(); await tick(40); grab();
      demo.cards.go(3); await tick(10);
      for (let i = 0; i < 4; i++) { press(/^Lower/).click(); await tick(12); }
      for (let i = 0; i < 15; i++) { grab(); if (i < 14) { press(/^Raise/).click(); await tick(12); } }
      ok(card().textContent.includes("Price in use: the slider's $140 per t."), "step 4: after the slider moves, the slider's price is the one in use");
      btns(/Use the dual/)[0].click(); await tick(20); grab();
      ok(said.some(t => /^A price at the cap's exact dual \(\$\d+\.\d\d per t, rounded\): every plan from/.test(t)), "step 4: the dual's price is labelled exact, its print rounded");
      demo.cards.go(4); await tick(4); btns(/Solve with the data center/)[0].click(); await tick(10); grab();
      demo.cards.go(5); await tick(10); grab(); btns(/^Hour by hour/)[0].click(); await tick(10); grab();
      ok(card().textContent.includes("may claim 0 t on the six days; on all of 2025, " + YR.hourly) && live.textContent.includes("On all of 2025") && card().textContent.includes("Claims follow the market-based method: each certificate counted once and retired for this buyer alone."),
        "step 6: the claim holds on the six days, under the market-based method, with the full year beside it");
      ok(live.textContent.includes("Built for it") && /hour by hour/.test(ttl()), "step 6: the purchase's capacities are readouts on the stage, not in the sentence");
      demo.cards.go(6); await tick(4); btns(/Compare the four purchases/)[0].click(); await tick(30); grab();
      said.filter(t => /[A-Za-z]/.test(t)).forEach(t => { if (t.split(" ").length > 40 || sentences(t) > 2) over.push(t.slice(0, 70) + " (" + t.split(" ").length + "/" + sentences(t) + ")"); });
      ok(said.length > 60 && over.length === 0, "every assembled line (" + said.length + ") is 40 words and two sentences at most: " + over.slice(0, 4).join(" | "));
      // a solve that ends after the reader has left its step paints nothing
      demo.cards.go(1); await tick(8); hold = true; press(/^Lower/).click(); await tick(2);
      demo.cards.go(4); await tick(4); const before = ttl(); hold = false; held.splice(0).forEach(f => f()); await tick(12);
      ok(ttl() === before && /data center/.test(ttl()), "a late cap solve does not paint the data-center step: " + ttl());
    } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
  }

  console.log(`test_m06-carbon-in-models: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
