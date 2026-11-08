// test_m11-tea-in-models.js — Node tests for M11 (assets/learn/m11-tea-in-models.js) with the vendored HiGHS.
//   - data: the 2022 -> 2025 conversion (BEA's deflator), DOE's three installed costs, the wind farm's costs, rate and life
//     read from lesson 13's data and 57 kWh per kg from A16's (cross-page numbers), the credit's tiers as the IRS states
//     them for 2025 (each with the wage rules' x5), its dates, the counting rules and their dates
//   - finance from first principles: CRF and the annuity factor against the sum of discounted years; the periods' weights
//   - the year: Prairie Town's prices as lesson 9's merit order, its 2025 average CO2 rate recomputed hour by hour, the 36
//     representative days (three per month by daily wind, each the medoid of its third) recomputed independently
//   - the LP: every default plan optimal; every hour's rules hold in the solved plan; the tier's cap holds; the reported
//     annual equivalent equals minus the LP objective (hair costs and constants accounted for); NPV = annual x AF; the
//     cash flows rebuilt year by year; the credit only in its years
//   - ties: each reported size, kilograms and NPV is the same on the whole optimal face (minimized and
//     maximized with the objective held within $1 a year)
//   - the full-year check: each default plan's size re-run on all 8,760 hours of 2025; the page states the largest gap
//   - every number on the page (fallback, explain, Go deeper, myths, quiz, numbers to remember) against the reference
//   - research wording: the Real-world box quotes approved E3 sentences word for word (excerpt_check.js)
//   - the page on a stub document: a solve that fails shows the note and Try again, which then works
// Usage (from the site folder):  node _tests/learn/test_m11-tea-in-models.js [--write]   (--write rewrites the reference block)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PRIV = require("./private_sources.js");
const SITE = path.resolve(__dirname, "..", "..");
const ID = "m11-tea-in-models";
const L = p => path.join(SITE, "assets/learn", p);
const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
const { core, VERSION } = sctx.module.exports;
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const PR = pctx.module.exports;
const M = require(L(ID + ".js"));
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const DPATH = L("data/" + ID + ".json");
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const PAGE = fs.readFileSync(path.join(SITE, "learn", ID + ".qmd"), "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const NB = readOr(path.join(SITE, "learn/notebooks", ID + ".ipynb")), SIDE = readOr(path.join(SITE, "learn/_w1", ID + ".yml"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const PAGE0 = PAGE.replace(/ data-label="[^"]*"/g, "");
const onPage = (s, what) => ok(PAGE0.includes(s), `page states ${what}: "${s}"`);
const fm = M.fm, r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;

(async () => {
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solve = m => core.solveWith(highs, m, { timeLimit: 300 });
  const town = J("town.json"), year = J("town_year.json"), T = J("cf_targets.json"), C13 = J("13-capstone.json"), A16 = J("a16-hydrogen-ptx.json");
  let D = J(ID + ".json");
  const Y = M.prepare(D, town, year, T, PR.townProfile), CX = M.capexRange(D);
  const K0 = M.costs(D, C13, A16, { capexKW: CX.mid, r: C13.finance.wacc / 100, N: C13.finance.life });
  const t1 = D.credit.tiers[0], top = t1.amount * D.credit.multiplier;
  const base = { boundary: "plant", h: D.hydrogen.price.def, c: D.charge.def, rule: "hourly", e: Y.rate };
  const run = (o, K) => { K = K || K0; const m = M.build(Y, K, D, o), r = solve(m); return { m, r, R: M.read(Y, K, D, o, r), o, K }; };
  const evaluate = (o, K) => { const L2 = M.tierCases(D, { wage: true }, true).map(c => ({ ...c, ...run({ ...o, credit: c.credit, tier: c.tier, window: "right" }, K) })); return { cases: L2, best: M.pick(L2) }; };
  // the page's evaluation: each case's bound (its uncapped LP in closed form, M.annualBound) orders the tiers and skips any
  // case that cannot win even at its bound (M.bounded, M.canSkip); "none" is solved only if it could win
  const pruned = (o, K) => {
    K = K || K0;
    const L2 = M.tierCases(D, { wage: true }, true).map(c => ({ ...c })); let top = -Infinity, n = 0;
    M.bounded(Y, K, D, o, L2, "right").forEach(c => {
      if (M.canSkip(c, L2, top)) { c.skip = true; return; }
      Object.assign(c, run({ ...o, credit: c.credit, tier: c.tier, window: "right" }, K)); n++; top = Math.max(top, c.R.annual);
    });
    let best = M.pick(L2);
    if (best && best.id === "none" && !best.R) { const any = L2.find(c => c.R), none = L2.find(c => c.id === "none"); none.R = any.R; none.same = true; best = none; }
    return { cases: L2, best, solved: n };
  };
  const ALL = M.allDays(Y);
  // lesson 13's numbers M11 uses, as the "lesson13" block of M11's data (the page and the notebook read only this subset,
  // so neither loads lesson 13's whole file): the wind farm's installed cost and upkeep, the rate and the life, with sources
  const sub13 = () => ({ about: "Copied from lesson 13's data (13-capstone.json) by node _tests/learn/test_m11-tea-in-models.js --write and checked against it on every run: the wind farm's installed cost and fixed upkeep (2025 dollars), the real rate and the life. Edit lesson 13's data, never this block.",
    techs: { wind: { label: C13.techs.wind.label, capex: C13.techs.wind.capex, fom: C13.techs.wind.fom, src: C13.techs.wind.src } },
    finance: { wacc: C13.finance.wacc, life: C13.finance.life, src: C13.finance.src },
    sources: Object.fromEntries([].concat(C13.techs.wind.src, C13.finance.src).map(k => [k, C13.sources[k]])) });
  const PLANS = {
    fixed30: { ...base, size: D.fixedSize.def },
    sized: { ...base },
    t1: { ...base, credit: top, tier: t1, window: "right" },
    t1all: { ...base, credit: top, tier: t1, window: "all" },
    increment: { ...base, boundary: "increment", credit: top, tier: t1, window: "right" },
    grid: { ...base, boundary: "grid", credit: top, tier: t1, window: "right" },
    annual: { ...base, rule: "annual", credit: top, tier: t1, window: "right" }
  };

  if (process.argv.includes("--write")) {
    const ref = { about: "Written by node _tests/learn/test_m11-tea-in-models.js --write; re-solved by the same test on every run. Defaults: $" + D.hydrogen.price.def + " per kg, $" + D.charge.def + " per MWh charge, DOE's middle installed cost, lesson 13's rate and life, Prairie Town's grid rate, hourly matching, construction in 2027 with the wage rules met. Money in real 2025 dollars; NPV over the life, annual = NPV / annuity factor; kg a year in the credit years." };
    ref.days = Y.days.map(d => ({ date: d.date, weight: d.weight }));
    ref.repCF = r3(Y.days.reduce((s, d) => s + d.weight * M.sum(d.w), 0) / (365 * 24 * D.plant.windMW));
    ref.townRate = r3(Y.rate); ref.ccRate = Y.ccRate;
    const n = Y.p.length, sh = v => Math.round(Y.p.filter(x => x === v).length / n * 100) + "%";
    ref.priceShare = { zero: sh(0), cc: sh(town.fleet.cc.cost), pk: sh(town.fleet.peaker.cost) };
    const R = {}; Object.keys(PLANS).forEach(k => { R[k] = run(PLANS[k]).R; });
    const pick = R2 => ({ S: r1(R2.S), kg: Math.round(R2.kg), imp: Math.round(R2.per[0].imp), cur: Math.round(R2.per[0].cur), util: r3(R2.util), npv: Math.round(R2.npv), annual: Math.round(R2.annual), lcoh: R2.lcoh == null ? null : r3(R2.lcoh), creditLev: r3(R2.creditLev), rate: r3(R2.rate) });
    const ev = evaluate(base);
    ref.defaults = { crf: K0.crf, af: K0.af, capexKW: K0.capexKW, wear: K0.wear, phi: M.af(K0.r, D.credit.years) / K0.af, top,
      fixed: pick(R.fixed30), sized: pick(R.sized), t1: pick(R.t1), t1all: pick(R.t1all), annual: pick(R.annual),
      tiers: ev.cases.map(c => ({ id: c.id, S: r1(c.R.S), annual: Math.round(c.R.annual), rate: r3(c.R.rate) })), best: ev.best.id };
    ref.boundaries = D.boundaries.map(b => {
      const e = evaluate({ ...base, boundary: b.id }), none = run({ ...base, boundary: b.id }).R;
      return { id: b.id, label: b.label, tier: e.best.id, S: r1(e.best.R.S), npv: Math.round(e.best.R.npv), lcoh: e.best.R.lcoh == null ? null : r3(e.best.R.lcoh), npvNone: Math.round(none.npv), sNone: r1(none.S) };
    });
    ref.gridNone = (() => { const e = evaluate({ ...base, boundary: "grid", rule: "none" }); return { tier: e.best.id, S: r1(e.best.R.S) }; })();
    const fy = [];
    ["fixed30", "sized", "t1", "t1all", "increment", "grid", "annual"].forEach(k => {
      const F = run({ ...PLANS[k], size: R[k].S, days: ALL }).R;
      fy.push({ id: k, npvRep: Math.round(R[k].npv), npvFull: Math.round(F.npv), kgGapPct: r1((R[k].kg - F.kg) / F.kg * 100) });
    });
    ref.fullYear = { about: "Each default plan's size fixed, its hours re-optimized on all 8,760 hours of 2025 (the same rules); npvGap = 36 days - full year ($); kgGapPct = (36 days - full year) / full year.", plans: fy,
      maxNpvGapM: Math.ceil(Math.max.apply(null, fy.map(f => Math.abs(f.npvRep - f.npvFull))) / 1e6), maxKgGapPct: Math.ceil(Math.max.apply(null, fy.map(f => Math.abs(f.kgGapPct)))) };
    ref.defaults.t1.kgAfter = Math.round(R.t1.per[1].kg); ref.defaults.t1.kgShare = Math.round(R.t1.creditLev / top * 1e4) / 1e4;
    const m0 = M.build(Y, K0, D, PLANS.t1); ref.size = { cols: m0.variables.length, rows: m0.constraints.length };
    ref.defaults.solved = pruned(base).solved;
    D.reference = ref; D.lesson13 = sub13();
    // arrays of numbers or strings on one line
    fs.writeFileSync(DPATH, JSON.stringify(D, null, 1).replace(/\[([^\[\]{}]*)\]/g, (m, x) => "[" + x.trim().split(/,\s*\n\s*/).join(", ") + "]") + "\n");
    console.log("wrote the reference block of", DPATH);
    D = J(ID + ".json");
  }
  const REF = D.reference;
  ok(REF, "the data file has a reference block (run with --write)");

  // ---------------- data and cross-page numbers
  const def = D.deflator.index;
  ok(def["2024"] === C13.deflator.index["2024"] && def["2025"] === C13.deflator.index["2025"], "the deflator's 2024 and 2025 values are lesson 13's (one series)");
  ok(near(CX.mid, 2000 * 128.893 / 118.026, 1e-9) && near(CX.low, 1500 * 128.893 / 118.026, 1e-9) && near(CX.high, 2500 * 128.893 / 118.026, 1e-9), "DOE's installed costs converted from 2022 to 2025 dollars");
  ok(A16.electrolyzer.kWhPerKg === 57 && A16.electrolyzer.capexPerKW === D.electrolyzer.capex2022.mid, "57 kWh per kg and DOE's $2,000 per kW are A16's numbers");
  ok(near(K0.k, 1000 / 57) && near(K0.wear, 0.11 * CX.mid * 1000 / 40000) && near(K0.fomKW, 0.05 * CX.mid), "kg per MWh, stack wear per MWh and fixed upkeep from DOE's record");
  ok(C13.techs.wind.capex === 1712 && C13.techs.wind.fom === 34.57 && C13.finance.wacc === 4 && C13.finance.life === 30, "the wind farm's costs, the rate and the life are lesson 13's");
  ok(JSON.stringify(D.lesson13) === JSON.stringify(sub13()), "the lesson13 block is lesson 13's data, unchanged (run with --write after lesson 13 changes)");
  ok(JSON.stringify(M.costs(D, D.lesson13, A16, { capexKW: CX.mid, r: D.lesson13.finance.wacc / 100, N: D.lesson13.finance.life })) === JSON.stringify(K0), "the page's costs from the lesson13 block equal those from lesson 13's file");
  ok(!/nuclear|reactor/i.test(JSON.stringify(D.lesson13)), "the lesson13 block holds no nuclear entry or wording");
  ok(!/data\/13-capstone\.json/.test(PAGE) && !/13-capstone\.json/.test(NB) && !/13_capstone/.test(JS), "the page and the notebook load no lesson 13 file (only the subset)");
  ok(D.credit.tiers.map(t => t.pct).join() === "1,0.334,0.25,0.2" && D.credit.tiers.map(t => t.amount).join() === "0.637,0.213,0.159,0.127" && D.credit.multiplier === 5 && D.credit.years === 10 && D.credit.limit === 4, "the credit's tiers, 2025 amounts, x5 and 10 years as the IRS states them");
  D.credit.tiers.forEach(t => ok(Math.abs(t.amount - 0.637 * t.pct) <= 0.0006, "each tier's amount is its share of $0.637 (IRS rounding): " + t.id));
  ok(D.credit.constructBefore === "2028-01-01" && D.credit.starts.map(s => s.year + ":" + s.ok).join() === "2026:true,2027:true,2028:false", "construction must begin before 1 January 2028");
  ok(D.credit.tiers.slice(0, 3).every(t => t.strict) && !D.credit.tiers[3].strict && D.credit.strictMargin === 0.001, "'less than' limits are strict; 4.0 is 'not greater than'");
  ["irs-i7210", "irs-td10023", "irs-45v", "irs-pwa", "doe-24005", "bea-nipa-119"].forEach(k => ok(D.sources[k] && D.sources[k].url && /\d{4}/.test(D.sources[k].asOf), "source with url and date: " + k));
  ok(D.sources["irs-i7210"].url.startsWith("https://www.irs.gov/") && D.sources["irs-td10023"].url.startsWith("https://www.irs.gov/"), "the credit's sources are on irs.gov (allow-listed)");
  ok(/Illustrative/.test(D.plant.note) && /Illustrative/.test(D.hydrogen.note) && /Illustrative/.test(D.charge.note) && /Simplified/.test(D.grid.note) && /Simplified/.test(D.rulesNote), "illustrative and simplified parts say so");

  // ---------------- finance from first principles
  [[0.04, 30], [0.07, 20], [0.02, 15], [0, 25]].forEach(([r, n]) => {
    let pv = 0; for (let y = 1; y <= n; y++) pv += Math.pow(1 + r, -y);
    ok(near(M.af(r, n), pv, 1e-9) && near(M.crf(r, n) * pv, 1, 1e-12), `annuity factor and CRF (${r}, ${n})`);
  });
  ok(near(REF.defaults.crf, M.crf(0.04, 30)) && near(REF.defaults.af, M.af(0.04, 30)), "the reference's CRF and annuity factor");
  const P2 = M.periods(K0, PLANS.t1);
  ok(P2.length === 2 && near(P2[0].phi, M.af(0.04, 10) / M.af(0.04, 30)) && near(P2[0].phi + P2[1].phi, 1), "credit years and the rest: weights AF(10)/AF(30) and the rest");
  ok(M.periods(K0, PLANS.t1all).length === 1 && M.periods(K0, PLANS.sized).length === 1, "one period without the credit or with it in every year");

  // ---------------- the year and its days
  {
    const f = town.fleet; let co2 = 0, use = 0, z = 0;
    for (let i = 0; i < year.demand.length; i++) {
      const d = Math.round(year.demand[i] / 1000 * 450), w = Math.round(year.wind[i] / 1000 * f.wind.mw), s = Math.round(year.solar[i] / 1000 * f.solar.mw), g = d - f.nuclear.mw - w - s;
      const cc = Math.min(Math.max(g, 0), f.cc.mw), pk = Math.min(Math.max(g - f.cc.mw, 0), f.peaker.mw); co2 += 0.37 * cc + 0.55 * pk; use += d;
      if (Y.p[i] !== (g <= 0 ? 0 : g <= 150 ? 40 : 100)) z++;
    }
    ok(z === 0 && near(Y.rate, co2 / use, 1e-12), "Prairie Town's price and its 2025 average CO2 rate recomputed hour by hour (" + (co2 / use).toFixed(4) + " t/MWh)");
    ok(near(Y.cf, 0.338, 1e-4), "the plant's wind averages EIA's 33.8% over 2025");
    ok(Y.days.length === 36 && M.sum(Y.days.map(d => d.weight)) === 365, "36 days, weights add to 365");
    const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let k0 = 0, bad = 0;
    MD.forEach((nd, m) => {
      const ds = []; for (let k = k0; k < k0 + nd; k++) ds.push({ k, e: M.sum(Y.w.slice(k * 24, k * 24 + 24)) });
      ds.sort((a, b) => a.e - b.e || a.k - b.k);
      for (let g = 0; g < 3; g++) {
        const grp = ds.slice(Math.round(g * nd / 3), Math.round((g + 1) * nd / 3)), dd = Y.days[m * 3 + g], wM = Math.max(...Y.w);
        const cost = k => grp.reduce((s, b) => { let q = 0; for (let t = 0; t < 24; t++) { const a = (Y.w[k * 24 + t] - Y.w[b.k * 24 + t]) / wM, c = (Y.p[k * 24 + t] - Y.p[b.k * 24 + t]) / 100; q += a * a + c * c; } return s + q; }, 0);
        const best = grp.map(b => b.k).sort((a, b) => a - b).reduce((a, k) => (cost(k) < cost(a) - 1e-9 ? k : a));
        if (dd.day !== best || dd.weight !== grp.length || dd.m !== m || dd.third !== g) bad++;
      }
      k0 += nd;
    });
    ok(bad === 0, "each day is the medoid of its month's third by daily wind (recomputed)");
    ok(REF.days.map(d => d.date).join() === Y.days.map(d => d.date).join() && near(REF.repCF, r3(Y.days.reduce((s, d) => s + d.weight * M.sum(d.w), 0) / 876000)), "the reference's days and their capacity factor");
  }

  // ---------------- the LP: rules, identities, ties
  const RUN = {}; Object.keys(PLANS).forEach(k => { RUN[k] = run(PLANS[k]); ok(RUN[k].r.status === "optimal", "optimal: " + k); });
  function rulesHold(x) {
    const { R, o, r } = x, v = n => r.values[n] || 0; let bad = 0;
    M.periods(x.K, o).forEach(pp => Y.days.forEach((dy, di) => { for (let t = 0; t < 24; t++) {
      const s = pp.id + "_" + di + "_" + t, ez = v("imp" + s) + (o.boundary === "grid" ? 0 : v("dw" + s));
      if (ez > R.S + 1e-6) bad++;
      if (o.boundary !== "grid" && (v("dw" + s) + v("exp" + s) > dy.w[t] + 1e-6 || v("exp" + s) > 50 + 1e-9 || v("imp" + s) > 50 + 1e-9)) bad++;
      if (Math.min(v("imp" + s), v("exp" + s) || 0) > 1e-6) bad++;   // never buys and sells in one hour (tie rule)
    } }));
    return bad;
  }
  Object.keys(RUN).forEach(k => ok(rulesHold(RUN[k]) === 0, "every hour's rules hold: " + k));
  ["t1", "t1all", "increment", "grid", "annual"].forEach(k => ok(RUN[k].R.rate <= t1.max - 0.001 + 1e-6, "the top tier's cap holds: " + k + " " + RUN[k].R.rate.toFixed(4)));
  function hairOf(x) { const { r, o } = x; let h = 0; M.periods(x.K, o).forEach(pp => Y.days.forEach((dy, di) => { for (let t = 0; t < 24; t++) { const s = pp.id + "_" + di + "_" + t; h += pp.phi * dy.weight * (D.tie.import * (r.values["imp" + s] || 0) - D.tie.curtail * (r.values["exp" + s] || 0)); } })); return h; }
  Object.keys(RUN).forEach(k => {
    const x = RUN[k], R = x.R, K = x.K, b = x.o.boundary, fixedCap = x.o.size != null ? (K.crf + D.electrolyzer.fomShare) * K.capexKW * 1000 * x.o.size : 0;
    const windC = K.windFomKW * 1000 * K.windMW + K.crf * K.windCapexKW * 1000 * K.windMW, alone = M.windAlone(Y, K);
    const ann = -(x.r.objective - hairOf(x) + fixedCap) - (b === "plant" ? windC : 0) - (b === "increment" ? alone : 0);
    ok(near(R.annual, ann, 0.5), `annual equivalent = - LP objective (hair and constants accounted for): ${k} ${R.annual.toFixed(1)} vs ${ann.toFixed(1)}`);
    let npv = 0; R.flows.forEach((f, y) => { npv += f * Math.pow(1 + K.r, -y); });
    ok(near(npv, R.npv, 1e-3) && near(R.npv, R.annual * K.af, 1e-3), "NPV from the year-by-year flows and = annual x AF: " + k);
    const crY = R.flows.map((f, y) => y);   // the credit only in years 1-10 (right window)
    if (x.o.credit && x.o.window === "right") ok(near(R.flows[10] - R.flows[11], R.per[0].net - R.per[1].net, 1e-6) && R.per[1].creditUSD === 0 && R.per[0].creditUSD > 0, "the credit is paid in years 1-10 only: " + k);
    ok(crY.length === K.N + 1, "flows for years 0 to N: " + k);
  });
  // ties: the size, kilograms and NPV over the optimal face
  function face(x) {
    const m = M.build(Y, x.K, D, x.o), terms = {}; m.variables.forEach(v => { if (v.cost) terms[v.name] = v.cost; });
    const cons = m.constraints.concat([{ name: "opt", terms, le: x.r.objective + 1 }]), out = {};
    const kgT = {}; m.variables.forEach(v => { if (/^(imp|dw)1_/.test(v.name)) kgT[v.name] = 1; });
    [["S", x.o.size == null ? { S: 1 } : null], ["ez", kgT]].forEach(([n, obj]) => { if (!obj) return;
      const lo = solve({ sense: "min", variables: m.variables.map(v => ({ ...v, cost: obj[v.name] || 0 })), constraints: cons }), hi = solve({ sense: "max", variables: m.variables.map(v => ({ ...v, cost: obj[v.name] || 0 })), constraints: cons });
      out[n] = [lo.objective, hi.objective]; });
    return out;
  }
  ["sized", "t1", "t1all", "increment", "grid", "annual"].forEach(k => {
    const f = face(RUN[k]), R = RUN[k].R;
    ok(f.S[1] - f.S[0] < 0.06, `${k}: the size is the same on the optimal face to 0.1 MW (${f.S[0].toFixed(3)} to ${f.S[1].toFixed(3)})`);
    ok((f.ez[1] - f.ez[0]) * K0.k / Math.max(1, R.per[0].kg) < 0.002, `${k}: the credit years' hydrogen is the same on the face to 0.2% (${(f.ez[0] * K0.k).toFixed(0)} to ${(f.ez[1] * K0.k).toFixed(0)} kg)`);
  });

  // ---------------- the reference block, re-solved
  const P = (R2, rf, k) => {
    ok(near(r1(R2.S), rf.S) && Math.abs(Math.round(R2.kg) - rf.kg) <= 1 && Math.abs(Math.round(R2.npv) - rf.npv) <= 1 && (rf.lcoh == null ? R2.lcoh == null : near(r3(R2.lcoh), rf.lcoh)), "reference re-solved: " + k);
  };
  P(RUN.fixed30.R, REF.defaults.fixed, "fixed"); P(RUN.sized.R, REF.defaults.sized, "sized"); P(RUN.t1.R, REF.defaults.t1, "t1"); P(RUN.t1all.R, REF.defaults.t1all, "t1all"); P(RUN.annual.R, REF.defaults.annual, "annual");
  const EV = evaluate(base);
  // the bound: on a grid of settings the pruned evaluation picks the same case, with the same value, as all five LPs
  {
    let bad = 0, cnt = 0, saved = 0, bnd = 0;
    [3, 4, 5].forEach(h => [Y.rate, Y.ccRate].forEach(e => ["none", "annual", "hourly"].forEach(rule => ["plant", "grid"].forEach(boundary => {
      const o = { ...base, h, e, rule, boundary }, full = evaluate(o), pr = pruned(o); cnt++; saved += 5 - pr.solved;
      if (full.best.id !== pr.best.id || Math.abs(full.best.R.annual - pr.best.R.annual) > 1e-6) bad++;
      pr.cases.forEach((c, i) => { const f = full.cases[i];
        // a skipped case is more than $1 below the best, or no better than a solved case listed before it (which wins the tie)
        if (!c.R && !(f.R.annual < pr.best.R.annual - M.TIE_USD || pr.cases.some((q, j) => j < i && q.R && q.R.annual >= f.R.annual - M.BOUND_EPS))) bad++;
        if (f.R.annual > c.ub + 0.5) bnd++; });                                    // the bound is a bound (0.5: solver rounding)
    }))));
    ok(bad === 0, `the bound never changes the answer; each skipped case is more than $1 a year below the best or tied with an earlier solved case: ${cnt} settings, ${saved} of ${cnt * 5} LPs skipped`);
    ok(bnd === 0, "every case's annual equivalent is at most its bound (M.annualBound), on every setting");
    ok(pruned(base).solved === REF.defaults.solved, "the defaults solve " + REF.defaults.solved + " of 5 LPs");
  }
  // the bound is the uncapped LP's optimum, in closed form
  { let worst = 0;
    [3, 4, 5].forEach(h => ["plant", "grid"].forEach(boundary => [null, 0.635, 3.185].forEach(credit => [0, 10].forEach(c => {
      const o = { ...base, h, boundary, c, credit, tier: null, window: "right" }, f = M.freeObj(Y, K0, D, o), x = run(o);
      worst = Math.max(worst, Math.abs(f.obj - x.r.objective));
      const x0 = run({ ...o, hair: false }); worst = Math.max(worst, Math.abs(M.freeObj(Y, K0, D, { ...o, hair: false }).obj - x0.r.objective));
    })))); ok(worst < 0.01, "the closed-form bound equals the uncapped LP's optimum, with and without hair costs (largest gap $" + worst.toExponential(1) + " a year)"); }
  // the tie rule: the largest value, and within $1 a year of it the case listed first, whatever else is in the list
  { const c = (id, a) => ({ id, R: { ok: true, annual: a, kg: 5 } });
    ok(M.pick([c("none", 100), c("t1", 100.5)]).id === "none" && M.pick([c("none", 0), c("t1", 0.5), c("t2", 1.2)]).id === "t1" && M.pick([c("t1", 0.5), c("t2", 1.2)]).id === "t1" && M.pick([c("none", 0), c("t2", 1.2)]).id === "t2",
      "pick: the first case listed within $1 a year of the largest value, the same with or without a case more than $1 below"); }
  // the plant's hourly matching is the same LP optimum as no certificates (no u needed behind one meter)
  [D.credit.tiers[0], D.credit.tiers[2]].forEach(t => { const a = run({ ...base, credit: 3, tier: t, window: "right" }), b = run({ ...base, rule: "none", credit: 3, tier: t, window: "right" }); ok(near(a.r.objective, b.r.objective, 1e-6) && a.m.variables.length === b.m.variables.length, "plant: hourly matching = no certificates (" + t.id + ")"); });
  ok(EV.best.id === REF.defaults.best && EV.cases.every((c, i) => near(r1(c.R.S), REF.defaults.tiers[i].S) && Math.abs(Math.round(c.R.annual) - REF.defaults.tiers[i].annual) <= 1), "the five LPs re-solved; best " + EV.best.id);
  REF.boundaries.forEach(b => {
    const e = evaluate({ ...base, boundary: b.id }), none = run({ ...base, boundary: b.id }).R;
    ok(e.best.id === b.tier && near(r1(e.best.R.S), b.S) && Math.abs(Math.round(e.best.R.npv) - b.npv) <= 1 && Math.abs(Math.round(none.npv) - b.npvNone) <= 1, "boundary re-solved: " + b.id);
  });
  {
    const K = K0, alone = (M.windAlone(Y, K) - K.windFomKW * 1000 * K.windMW) * K.af - K.windCapexKW * 1000 * K.windMW;
    ok(near(RUN.increment.R.npv, RUN.t1.R.npv - alone, 1) && near(RUN.increment.R.S, RUN.t1.R.S, 1e-6), "the increment's NPV is the plant's minus the wind farm alone (" + fm.musd(alone) + "), with the same plan");
  }
  ok(REF.fullYear.plans.length === 7 && REF.fullYear.maxNpvGapM * 1e6 >= Math.max(...REF.fullYear.plans.map(f => Math.abs(f.npvRep - f.npvFull))) && REF.fullYear.maxKgGapPct >= Math.max(...REF.fullYear.plans.map(f => Math.abs(f.kgGapPct))), "the full-year check covers seven plans; the stated gaps are their largest");
  if (process.argv.includes("--full")) {
    REF.fullYear.plans.forEach(f => { const F = run({ ...PLANS[f.id], size: RUN[f.id].R.S, days: ALL }).R; ok(Math.abs(Math.round(F.npv) - f.npvFull) <= 1, "full year re-run: " + f.id); });
  }

  // ---------------- the page against the model
  const d = REF.defaults, B = id => REF.boundaries.find(b => b.id === id);
  REF.boundaries.forEach(b => { onPage(`<td>${b.S.toFixed(1)} MW</td>`, "fallback size " + b.id); onPage(`<td>${fm.musd(b.npv)}</td>`, "fallback NPV " + b.id); onPage(`<td>${fm.musd(b.npvNone)}</td>`, "fallback NPV with no credit " + b.id); if (b.lcoh != null) onPage(`<td>${fm.kg(b.lcoh)}</td>`, "fallback cost per kg " + b.id); });
  onPage("0.0578", "CRF at 4% over 30 years"); onPage("$" + top.toFixed(3), "the top tier with the wage rules ($3.185)");
  onPage("about " + fm.kg(d.t1.creditLev), "the credit levelized over the life"); onPage(fm.pct(d.phi), "the credit years' share of the discounted life");
  onPage(fm.musd(d.t1all.npv - d.t1.npv), "the wrong window's overstatement");
  ok(near(d.t1.kgShare, d.t1.creditLev / top, 6e-4) && near(d.t1.kgShare, d.t1.kg * M.af(0.04, 10) / (d.t1.kg * M.af(0.04, 10) + d.t1.kgAfter * (M.af(0.04, 30) - M.af(0.04, 10))), 1e-4), "the credit years' share of discounted kilograms, from the two production rates");
  onPage((d.t1.kgShare * 100).toFixed(1) + "%", "the credit years' share of the discounted kilograms"); onPage(top.toFixed(3) + " × " + d.t1.kgShare.toFixed(3), "the credit per kg over the life as a product");
  onPage((d.t1.kg / 1e6).toFixed(2) + " million kg", "hydrogen a year in the credit years"); onPage((d.t1.kgAfter / 1e6).toFixed(2) + " million", "hydrogen a year after the credit");
  ok(near(top * d.t1.kgShare, d.t1.creditLev, 0.002), "3.185 x the share is the credit per kg over the life");
  ok(M.weightWords(Y.days) === "9, 10 or 11" && /weightWords\(Y\.days\)/.test(JS) && !/10 or 11 days/.test(JS + PAGE), "the days' weights in words come from the days (9, 10 or 11)");
  onPage("u \\ge 0", "u is never below zero in the algebra"); onPage("0 \\le S \\le 100", "the size's bounds in the algebra"); ok(/u<\/var> ≥ 0/.test(JS) && /0 ≤ <var>S<\/var> ≤ 100/.test(JS), "the equation card states u >= 0 and 0 <= S <= 100");
  ok(!/Electrolyzer running|"Running"|running " \+ fm\.pct|Your plant qualifies/.test(JS), "utilization is never called running time; the construction date is not called qualifying");
  onPage("$" + Math.round(d.capexKW).toLocaleString("en-US") + " per kW = about $" + (Math.round(d.capexKW) * 1000).toLocaleString("en-US") + " per MW", "the installed cost per kW and per MW");
  onPage("within $" + REF.fullYear.maxNpvGapM + "M", "the full-year check's NPV gap"); onPage("within " + REF.fullYear.maxKgGapPct + "%", "the full-year check's hydrogen gap");
  onPage(fm.mw(d.sized.S), "the model's size without a credit"); onPage(fm.mw(d.t1.S), "the top tier's size");
  onPage("$" + Math.round(d.capexKW).toLocaleString("en-US") + " per kW", "the installed cost in 2025 dollars");
  onPage(REF.townRate.toFixed(3), "Prairie Town's grid rate");
  onPage("here, " + (5 - REF.defaults.solved) + " of 5 skipped", "LPs the bound skips at the defaults"); onPage("About " + (Math.round(REF.size.cols / 100) * 100).toLocaleString("en-US") + " columns and " + (Math.round(REF.size.rows / 100) * 100).toLocaleString("en-US") + " rows", "the LP's size");
  onPage("$" + d.wear.toFixed(2), "stack wear per MWh");
  ok(!/break[- ]even/i.test(PAGE + (JS.match(/"[^"\n]*"/g) || []).join(" ") + NB), "no break-even wording on the page, in its strings or the notebook");

  // ---------------- scope and research wording
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  const prose = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "") + (JS.match(/"[^"\n]*"/g) || []).join(" ") + SIDE + NB;
  ok(!NUC.test(prose.replace(/f\.nuclear\.mw|town\.fleet\.nuclear|fleet\.nuclear/g, "")), "no nuclear term in the page, its strings, the sidecar or the notebook (the town's fleet is read in code only)");
  ok(!/\bAI\b|data cent/i.test(PAGE + JS + NB), "no AI wording, no data centers");
  ok(/github\.com\/Henryutd2021\/reopt-hydrogen-framework/.test(PAGE) && !/projects\/|research\.html/.test(PAGE + JS), "the allow-listed repository is linked; no project page");
  const X = require("./excerpt_check.js"), RG = X.register(["E3"]);
  const quotes = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>/g)];
  ok(quotes.length === 1 && quotes[0][1] === "excerpt:wind-hydrogen", "one excerpt, from excerpt:wind-hydrogen");
  if (RG) {
    quotes.forEach(q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].forEach(p => ok(X.approved(RG, p[1]), "approved E3 sentence: " + X.norm(p[1]).slice(0, 60))));
    const real = (PAGE.match(/<div class="lx-card lx-real">([\s\S]*?)<div class="lx-case-try">/) || [])[1] || "";
    [...real.matchAll(/<p class="lx-hint">([\s\S]*?)<\/p>/g)].forEach(p => ok(X.approved(RG, p[1]) || /^Case file |^Optional, about/.test(X.norm(p[1])), "Real-world hint is approved E3 wording or a label: " + X.norm(p[1]).slice(0, 60)));
    ok(!/\| E3\.(2|3|8|13) \|/.test(RG.md.split("## Revisions after review")[1] || ""), "no revision after review replaces E3.2, E3.3, E3.8 or E3.13");
  } else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); excerpts not checked against it");
  ok(NB.includes(ID + ".json") && NB.includes("reference") && NB.includes("assert") && NB.includes("linprog"), "notebook: reads the reference block and asserts it with linprog");
  ["lcoh", "kg", "creditLev", "npv", "S"].forEach(f => ok(new RegExp('assert[^\\n]*\\[\\\\"' + f + '\\\\"\\][^\\n]*ref\\[\\\\"' + f + '\\\\"\\]').test(NB), "notebook asserts " + f + " against the reference block"));
  ok(/def periods\(K, o, service=/.test(NB) || /PERIODS_2028/.test(NB), "notebook task 4 gives the period structure (start, end, rule)");
  ["energy-attribute-certificate", "incremental-analysis", "placed-in-service", "capacity-utilization", "prevailing-wage-apprenticeship"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE), "sidecar defines " + id));

  // ---------------- the page on a stub document: a solve that fails, then works
  {
    const { env, load } = require("./stubdom.js");
    const E = env();
    E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
    ["solver", "cards", "predict", "controls", "plot", "profiles", "solvestep"].forEach(n => load(n, E));
    let failing = true, calls = 0;
    const slv = E.LX.solver; slv.preload = () => Promise.resolve("worker"); slv.mode = "worker";
    slv.solve = m => { calls++; if (failing) return Promise.resolve({ status: "time-limit", ok: false, values: null, ms: { roundTrip: 10000 } }); const r = solve(m); r.ms = Object.assign({ roundTrip: 1 }, r.ms); return Promise.resolve(r); };
    let init = null, demo = null;
    E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
    E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
    E.LX.Boundary = () => ({}); E.LX.EquationCard = Object.assign(() => ({}), { sym: (k, h) => h }); E.LX.CompareTable = () => ({});
    const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {} };
    vm.runInNewContext(JS, mctx);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
    const unhandled = []; const onUn = e => unhandled.push(String(e && e.message || e)); process.on("unhandledRejection", onUn);
    let threw = null;
    try { init(live, { m11_tea_in_models: D, a16_hydrogen_ptx: A16, town, town_year: year, cf_targets: T }, root); } catch (e) { threw = e.stack; }
    ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
    const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); };
    const card = () => demo.cards.el, btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent)), next = () => btns(/Next/)[0], failBox = () => card().querySelector(".m11-fail");
    try {
      demo.cards.go(6); failing = true; calls = 0;
      btns(/Solve the tiers/)[0].click(); await flush();
      ok(failBox() && failBox().getAttribute("role") === "alert" && /time limit/.test(failBox().textContent) && /Try again/.test(failBox().textContent), "step 7: a failed solve shows a plain message and Try again");
      ok(card().getAttribute("aria-busy") == null && next().disabled && !btns(/Solve the tiers/)[0].disabled, "step 7: busy cleared, the button works again, Next waits");
      failing = false; calls = 0; btns(/Try again/)[0].click(); await flush();
      ok(!failBox() && card().querySelectorAll(".m11-tbl tbody tr").length === 5 && !next().disabled && calls === d.solved, "step 7: Try again solves the tiers it needs (" + calls + " of 5; the rest bounded) and unlocks Next");
      ok(card().textContent.includes("Solved " + d.solved + " of 5 LPs" + (d.solved < 5 ? "; " + (5 - d.solved) + " skipped by their bounds." : ".")) && /skipped: bound/.test(card().textContent) === (d.solved < 5) && card().textContent.includes((5 - d.solved) + " of 5 skipped") === (d.solved < 5) && !/\*\*/.test(card().textContent), "step 7: progress, the skipped rows and the bounding note say why");
      ok(card().textContent.includes(fm.mw(d.t1.S)) && /The top tier wins/.test(card().textContent), "step 7: the best tier and its size as the reference says");
      demo.cards.go(7); failing = false; calls = 0;
      btns(/Solve this boundary/)[0].click(); await flush();
      ok(calls === 0 && !failBox() && /Now change the boundary/.test(card().textContent), "step 8: the default boundary reuses the LPs step 7 solved");
      card().querySelectorAll(".lx-seg button").filter(b => /increment/.test(b.textContent))[0].click();
      btns(/Solve this boundary/)[0].click(); await flush();
      ok(calls === d.solved && !next().disabled && card().textContent.includes(fm.musd(B("increment").npv)), "step 8: a second boundary solves (" + calls + " LPs) and unlocks Next, NPV " + fm.musd(B("increment").npv));
    } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
    process.removeListener("unhandledRejection", onUn);
    ok(!unhandled.length, "no unhandled promise rejection: " + unhandled.join(" | "));
  }

  console.log(`test_${ID}: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL: the test threw:", e && e.stack || e); process.exit(1); });
