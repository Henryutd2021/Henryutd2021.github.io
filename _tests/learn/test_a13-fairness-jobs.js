// test_a13-fairness-jobs.js — Node tests for lesson A13: the accounting layer (assets/learn/components/whopays.js,
// LX.A13, also for SB3 and C3), the lesson's words (assets/learn/a13-fairness-jobs.js), its data file and the page
// (learn/a13-fairness-jobs.qmd):
//   - the accounting from first principles: each design recovers exactly the cost; transfers between designs sum to zero;
//     merged groups' burden = total spending / total income and matches prairie-city.json's own LEAD-band figures; the
//     options SB3 and C3 need (use after the plan, other spending changes); jobs and tax recomputed by hand
//   - every reveal and line is true over its whole input range (every cost, design, grouping, multiplier, MW, cost per kW,
//     job-years per $M, jobs per 100 MW, displacement, tax rate and taxable share on the sliders); rounded values agree
//   - Ridge County keeps Prairieland's anchors (20 million people, 3% of the workforce, coal 40% of the county's tax
//     revenue) and carries its note that SB4 and C4 reuse these numbers; Prairie City's numbers are read, never retyped
//   - every number stated on the page matches the model; the no-JS block and the practice set equal what the model writes
//     (--write rewrites them); every output is labelled a screening estimate with assumptions; both fictional lines appear
//   - the jobs accounting: displacement comes off building and running alike, on one
//     timeline (building years 1-2, running years 3-20, the lost jobs in all 20); every output SB3, M12 and C3 read is
//     unchanged against a frozen copy of the layer's first version; the mines' coal taxes are held fixed and the change
//     if they ended is shown; the explain layer's words follow the reader's design and tax settings
//   - scope: no nuclear term, no "AI", links on the allow-list; text budget (two sentences, about 35 words)
// Usage (from the site folder):  node _tests/learn/test_a13-fairness-jobs.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "a13-fairness-jobs";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const A13 = require(L("components/whopays.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const PC = require(L("data/prairie-city.json"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const ACC = fs.readFileSync(L("components/whopays.js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const range = r => { const out = []; for (let k = 0; ; k++) { const v = +(r.min + k * r.step).toFixed(6); if (v > r.max + 1e-9) break; out.push(v); } return out; };

// ---------------- the generated blocks: write (--write) or check
const BLOCKS = { "a13-fallback": () => M.staticFallback(D, PC), "a13-practice": () => M.practice(D, PC) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const text = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const T_PAGE = text(OWN);
const has = (s, msg) => ok(T_PAGE.indexOf(s) >= 0, msg + ": '" + s + "'");

// ---------------- the accounting layer (LX.A13), from first principles
const R = A13.groupsFrom(PC);
ok(R.length === 5 && R.every((r, i) => r.households === PC.groups[i].households && r.income === PC.groups[i].income && r.kWh === PC.groups[i].use.electricityKWh && r.spend === PC.groups[i].homeEnergy), "groups read from prairie-city.json");
ok(R.reduce((s, r) => s + r.households, 0) === PC.city.households, "the groups' households add up to the city's");
const E = R.reduce((s, r) => s + r.households * r.kWh, 0), Hh = R.reduce((s, r) => s + r.households, 0), Y = R.reduce((s, r) => s + r.households * r.income, 0);
range(D.plan.costM).forEach(cM => {
  const C = cM * 1e6;
  ["kwh", "fixed", "income"].forEach(k => {
    const a = A13.allocate(R, C, k);
    if (!near(a.total, C, 1e-6)) ok(false, k + " recovers exactly the cost at $" + cM + "M");
    a.rows.forEach((r, i) => {
      const c = k === "kwh" ? C * R[i].kWh / E : k === "fixed" ? C / Hh : C * R[i].income / Y;
      if (!near(r.charge, c, 1e-9) || !near(r.burdenAfter, (R[i].spend + c) / R[i].income, 1e-12) || !near(r.group, c * R[i].households, 1e-6)) ok(false, k + " charge and burden of " + r.key + " at $" + cM + "M");
    });
  });
  ["fixed", "income"].forEach(k => { const t = A13.transfers(A13.allocate(R, C, "kwh"), A13.allocate(R, C, k)); if (!near(t.sum, 0, 1e-5)) ok(false, "transfers sum to zero: " + k + " at $" + cM + "M"); });
});
ok(true, "every design recovers the cost and every transfer sums to zero over the cost slider");
{ const a = A13.allocate(R, 24e6, "income"); ok(a.rows.every(r => near(r.delta, a.rows[0].delta, 1e-12)), "by income, every group's burden rises by the same share"); }
{ const a = A13.allocate(R, 24e6, "fixed"); ok(a.rows.every(r => near(r.charge, a.rows[0].charge)) && a.rows[0].delta > a.rows[4].delta, "a fixed charge: same dollars, the largest burden for the lowest income"); }
// regrouping: total spending over total income; matches prairie-city.json's LEAD-band figures
{ const a = A13.allocate(R, 0, "kwh"), g = A13.regroup(a, D.bands.two.groups, D.bands.two.labels);
  ok(near(g[0].burden, PC.groupsNote.lowIncomeBurden, 5e-5) && near(g[1].burden, PC.groupsNote.otherBurden, 5e-5), "two bands: 6.1% and 2.0%, as prairie-city.json's groupsNote says");
  ok(g[0].households + g[1].households === Hh && g[0].keys.join() === "g1,g2,g3", "the bands cover every household once"); }
{ const a = A13.allocate(R, 24e6, "kwh"), g = A13.regroup(a, D.bands.five.groups); ok(g.every((x, i) => near(x.burden, a.rows[i].burden, 1e-12) && near(x.burdenAfter, a.rows[i].burdenAfter, 1e-12)), "five single-group bands reproduce the groups"); }
// the options SB3 and C3 need: use after the plan, and other changes in spending
{ const kAfter = { g1: 10000, g2: 11000, g3: 12000, g4: 12500, g5: 14000 }, sd = { g1: -100, g2: -120, g3: -140, g4: -150, g5: -200 };
  const a = A13.allocate(R, 30e6, "kwh", { kWh: kAfter, spendDelta: sd }), E2 = R.reduce((s, r) => s + r.households * kAfter[r.key], 0);
  ok(near(a.total, 30e6, 1e-6) && a.rows.every(r => near(r.charge, 30e6 * kAfter[r.key] / E2) && near(r.spendAfter, r.spend + sd[r.key] + r.charge) && r.kWhAfter === kAfter[r.key]), "options: per-kWh charge on use after the plan; other spending changes in the burden after");
  ok(near(A13.allocate(R, 30e6, "fixed", { spendDelta: sd }).rows[0].burdenAfter, (R[0].spend - 100 + 30e6 / Hh) / R[0].income), "options: spendDelta with a fixed charge"); }
{ let threw = false; try { A13.allocate(R, 1, "nonsense"); } catch (e) { threw = true; } ok(threw, "an unknown design is refused"); }
{ const a = A13.allocate(R, 24e6, "kwh"), ab = A13.above(a, 0.06, true), b0 = A13.above(a, 0.06, false); ok(ab.groups === 2 && b0.groups === 2 && ab.households === R[0].households + R[1].households, "above 6%: the two lowest groups, before and after"); }
ok(A13.VERSION && /Screening estimate/.test(A13.SCREENING) && A13.ASSUME.split.length && A13.ASSUME.jobs.length && A13.ASSUME.tax.length, "the layer carries its label and assumptions");
ok(/allocate\(rows, cost, design, opts\)/.test(ACC) && /SB3/.test(ACC) && /C3/.test(ACC) && !/document\.|window\.document|LX\.H\(/.test(ACC), "the layer documents its API for SB3 and C3 and touches no DOM");

// ---------------- jobs and tax, by hand
const S0 = M.defaults(D), J0 = A13.jobs(M.jobInputs(D, PC, S0)), RC = D.ridgeCounty;
ok(J0.lostDirect === RC.plant.staff + RC.plant.mineJobs && near(J0.lostTotal, 1150 * 1.6) && J0.capexM === 2000 * 1500 / 1000 && J0.localM === 900 && near(J0.buildJobYears, 900 * 5 * 1.6) && near(J0.buildJobsAvg, 7200 / 2), "jobs at the defaults: 1,150 on site, 1,840 total; $3,000M, $900M local; 7,200 job-years; 3,600 a year for 2 years");
ok(near(J0.newPermGross, 2000 / 100 * 6 * 1.6) && near(J0.newPermNet, 192 * 0.8) && near(J0.netPerm, 153.6 - 1840) && near(J0.horizon.lostPerm, 1840 * 20), "jobs: 192 gross, 153.6 net, −1,686.4; 36,800 job-years lost over 20 years");
// one timeline: building years 1-2, running years 3-20, the lost jobs in all 20; displacement on building and running
ok(J0.buildDisplacement === 0.2 && near(J0.buildJobYearsNet, 7200 * 0.8) && J0.buildJobYearsGross === J0.buildJobYears && J0.horizon.operatingYears === 18 && J0.horizon.buildYears === 2,
   "jobs: 5,760 building job-years net of 20%; the farms run 18 of the 20 years");
ok(near(J0.horizon.newPermGross, 192 * 18) && near(J0.horizon.newPerm, 153.6 * 18) && near(J0.horizon.gross, 7200 + 192 * 18 - 36800) && near(J0.horizon.net, 7200 * 0.8 + 153.6 * 18 - 36800) && Math.round(J0.horizon.net) === -28275 && Math.round(J0.horizon.gross) === -26144,
   "the 20 years: gross 7,200 + 3,456 − 36,800 = −26,144; net 5,760 + 2,764.8 − 36,800 = −28,275");
// by hand, the formula of the Modeler box: m [(B + (T - b) J_new)(1 - d) - T J_lost]
ok(near(J0.horizon.net, 1.6 * ((4500 + 18 * 120) * 0.8 - 20 * 1150)), "the Modeler box's formula gives the same −28,275");
// the review's case (4,000 MW, $2,500/kW, 9 job-years/$M, multiplier 2.5, 20 jobs/100 MW, 50%): the old sum was +30,000
{ const c = { staff: 450, mineJobs: 700, multiplier: 2.5, newMW: 4000, capexPerKW: 2500, localShare: 0.3, jobYearsPerM: 9, buildYears: 2, omPer100MW: 20, displacement: 0.5, horizonYears: 20 };
  const now = A13.jobs(c), old = A13.jobs(Object.assign({}, c, { buildDisplacement: 0, operatingYears: 20 }));
  ok(near(old.horizon.net, 30000) && near(now.horizon.net, 33750 + 1000 * 18 - 57500) && near(now.horizon.net, -5750) && near(now.horizon.gross, 46000),
     "the review's case: gross building plus net running over 20 years was +30,000; net on one timeline −5,750 (gross +46,000)"); }
// API: every output of the layer's first version (a13-accounting-1) is unchanged except horizon.newPerm and horizon.net
{ const v1 = J => { const m = J.multiplier, lostDirect = J.staff + J.mineJobs, capexM = J.newMW * J.capexPerKW / 1000, localM = capexM * J.localShare;
    const bd = localM * J.jobYearsPerM, bt = bd * m, npd = J.newMW / 100 * J.omPer100MW, npg = npd * m, npn = npg * (1 - J.displacement), lost = lostDirect * m, Hy = J.horizonYears;
    return { lostDirect, lostTotal: lost, capexM, localM, buildJobYearsDirect: bd, buildJobYears: bt, buildJobsAvg: J.buildYears > 0 ? bt / J.buildYears : 0, newPermDirect: npd, newPermGross: npg, newPermNet: npn, netPerm: npn - lost,
             horizon: { years: Hy, build: bt, newPerm: npn * Hy, lostPerm: lost * Hy, net: bt + npn * Hy - lost * Hy } }; };
  let same = true, n = 0;
  [0, 450].forEach(st => [0, 1000, 4000].forEach(mw => [0, 1000, 2500].forEach(cx => [1, 5, 10].forEach(jy => [0, 6, 20].forEach(om => [0, 0.2, 0.5].forEach(dp => [2, 15].forEach(by => {
    const c = { staff: st, mineJobs: st ? 700 : 0, multiplier: 1.6, newMW: mw, capexPerKW: cx, localShare: 0.3, jobYearsPerM: jy, buildYears: by, omPer100MW: om, displacement: dp, horizonYears: 20 };
    const a = v1(c), b = A13.jobs(c); n++;
    Object.keys(a).forEach(k => { if (k !== "horizon" && !near(a[k], b[k], 1e-9)) same = false; });
    ["years", "build", "lostPerm"].forEach(k => { if (!near(a.horizon[k], b.horizon[k], 1e-9)) same = false; });
    // with buildDisplacement 0 and the old operating years, the old horizon comes back
    const o = A13.jobs(Object.assign({}, c, { buildDisplacement: 0, operatingYears: 20 }));
    if (!near(o.horizon.newPerm, a.horizon.newPerm, 1e-9) || !near(o.horizon.net, a.horizon.net, 1e-9)) same = false;
  })))))));
  ok(same && n === 972, "API: every first-version output is unchanged (" + n + " cases); only horizon.newPerm and horizon.net moved, and the old ones return with buildDisplacement 0 and operatingYears 20"); }
// C3's call (capstone C3): building from up-front spending at capexPerKW 1000 over 15 years, upkeep with capexPerKW 0
{ const JD = D.jobs, cc = { staff: 0, mineJobs: 0, multiplier: JD.multiplier.start, localShare: JD.localShare, jobYearsPerM: JD.jobYearsPerM.start, displacement: JD.displacement.start / 100, horizonYears: JD.horizonYears, buildYears: 15 };
  const b = A13.jobs(Object.assign({}, cc, { newMW: 812.5, capexPerKW: 1000, omPer100MW: 0 })), o = A13.jobs(Object.assign({}, cc, { newMW: 900, capexPerKW: 0, omPer100MW: JD.omPer100MW.start }));
  ok(near(b.buildJobYears, 812.5 * 0.3 * 5 * 1.6) && near(b.buildJobsAvg, b.buildJobYears / 15) && near(o.newPermGross, 9 * 6 * 1.6) && near(o.newPermNet, 9 * 6 * 1.6 * 0.8) && near(b.buildJobYearsNet, b.buildJobYears * 0.8),
     "C3's call: building job-years gross and per year, permanent gross and net as before; building net now available as buildJobYearsNet");
  ok(JD.multiplier.start === 1.6 && JD.localShare === 0.3 && JD.jobYearsPerM.start === 5 && JD.displacement.start === 20 && JD.horizonYears === 20 && JD.omPer100MW.start === 6, "the coefficients C3 reads from this data file keep their defaults"); }
const T0 = A13.taxBase(M.taxInputs(D, S0));
ok(T0.plantTaxM === 60 && near(T0.newTaxM, 30) && near(T0.changeM, -30) && T0.revenueBeforeM === 900 && near(T0.changeShare, -30 / 900), "tax at the defaults: $60M lost, $30M gained, −$30M of $900M");
ok(near(T0.ifMinesCloseM, -30 - 300) && near(T0.ifMinesCloseShare, -330 / 900) && near(T0.coalShareAfter, 300 / 870), "tax: the mines' $300M held fixed (coal 34% after); if it ended too, −$330M (−36.7%)");
ok(/mineCoalTaxM/.test(D.tax.mines) && /plant-property-tax comparison/.test(D.tax.mines) && /plant-property-tax comparison/.test(A13.ASSUME.tax.join(" ")), "the data and the layer say the mines' taxes are held fixed");
// Ridge County's anchors (Prairieland's parameter card) and its note on reuse by SB4 and C4
ok(RC.prairielandPeople === 20000000 && RC.workforceShare === 0.03 && near(T0.coalShareBefore, RC.coalTaxShare) && RC.coalTaxShare === 0.40, "Ridge County: 20 million people in Prairieland, 3% of its workforce, coal 40% of the county's tax revenue at the default rate");
ok(/SB4/.test(RC.note) && /C4/.test(RC.note) && /fictional/.test(RC.fiction), "Ridge County carries its note on reuse by SB4 and C4, and its fictional line");

// ---------------- every line, over its whole input range
const SH = M.shortOf(PC);
ok(SH.join() === "0–30%,30–50%,50–80%,80–100%,100%+", "group short labels from prairie-city.json's AMI bands");
range(D.plan.costM).forEach(cM => {
  ["kwh", "fixed", "income"].forEach(k => {
    const a = M.split(D, PC, cM, k), line = M.designLine(D, PC, cM, k);
    if (line.indexOf("The poorest group pays " + M.money(a.rows[0].charge) + " a year (" + M.pts(a.rows[0].delta) + ")") < 0 || line.indexOf("the top group " + M.money(a.rows[4].charge) + " (" + M.pts(a.rows[4].delta) + ")") < 0) ok(false, "design line " + k + " at $" + cM + "M");
    if (cM > 0 && k === "kwh" && !(a.rows[0].delta === Math.max(...a.rows.map(r => r.delta)))) ok(false, "per kWh the 0–30% group's burden rises most at $" + cM + "M");
    [["five"], ["two"]].forEach(([b]) => { const gl = M.groupLine(D, PC, cM, k, b), g = A13.regroup(a, D.bands[b].groups, D.bands[b].labels || null);
      if (gl.indexOf("**" + M.pct(b === "two" ? g[0].burdenAfter : a.rows[0].burdenAfter) + "**") < 0) ok(false, "group line " + b + " " + k + " at $" + cM + "M"); });
  });
  const ds = M.designSaw(D, PC, cM);
  if (cM === 0 ? !/no burden moves/.test(ds) : ds.indexOf("**" + M.fmtN(100 * M.split(D, PC, cM, "kwh").rows[0].delta, 1) + "** points per kWh") < 0) ok(false, "design reveal at $" + cM + "M");
  ["fixed", "income"].forEach(k => { const tl = M.transferLine(D, PC, cM, k), x = M.moved(D, PC, cM, k);
    if (cM === 0 ? !/nothing moves/.test(tl) : (tl.indexOf("**" + M.moneyM(x.up / 1e6) + "**") < 0 || tl.indexOf("stays " + M.moneyM(cM, 0)) < 0 || tl.indexOf(k === "fixed" ? "onto three groups" : "onto one group") < 0)) ok(false, "transfer line " + k + " at $" + cM + "M"); });
});
ok(M.RISE.answer === "g1" && PC.groups.every(g => M.RISE.feedback[g.key]), "step 1: the 0–30% group; feedback for every group");
// the explain layer's stakeholder words: true for every lower-income group (below 80% of AMI) against every higher one
range(D.plan.costM).forEach(cM => ["kwh", "fixed", "income"].forEach(k => {
  const a = M.split(D, PC, cM, k), w = M.payWords(a);
  if (cM === 0) { if (!w.none) ok(false, "explain words with no cost"); return; }
  const dW = (r, o) => Math.abs(r.charge - o.charge) < 0.005 ? "the same dollars" : r.charge < o.charge ? "fewer dollars" : "more dollars";
  const sW = (r, o) => Math.abs(r.delta - o.delta) < 1e-12 ? "the same share of income" : r.delta > o.delta ? "a larger share of income" : "a smaller share of income";
  const low = a.rows.slice(0, 3), high = a.rows.slice(3);
  low.forEach(r => high.forEach(o => { if (dW(r, o) + ", " + sW(r, o) !== w.low || dW(o, r) + ", " + sW(o, r) !== w.high) ok(false, "explain words " + k + " at $" + cM + "M: " + r.key + " against " + o.key); }));
}));
ok(M.payWords(M.split(D, PC, 24, "kwh")).high === "more dollars, a smaller share of income" && M.payWords(M.split(D, PC, 24, "fixed")).high === "the same dollars, a smaller share of income" && M.payWords(M.split(D, PC, 24, "income")).low === "fewer dollars, the same share of income", "explain words per design (the review's cases)");
ok(/function keep\(\) \{[^\n]*paintExplain/.test(JS) && /function paintExplain\(\)/.test(JS) && /moneyM\(S\.costM, 0\)/.test(JS.slice(JS.indexOf("function paintExplain"))) && !/D\.plan\.costM\.start, "kwh"\), lf/.test(JS), "the explain layer is redrawn from the reader's settings (cost, design, jobs, tax)");
ok(M.riseSaw(D, PC, 24) === "At 2.07¢ a kWh the poorest group pays $192 a year, **+1.5 points** of burden; the top group pays $269, +0.2 points.", "step 1 reveal at the default");
ok(M.designSaw(D, PC, 24) === "At $24M a year the poorest group's burden rises **1.5** points per kWh, 1.8 with a fixed charge and 0.3 by income.", "step 2 reveal at the default");
ok(M.transferLine(D, PC, 24, "fixed") === "Against per kWh, fixed charge moves **$1.34M** a year onto three groups; the total stays $24M, so the money moved adds up to zero.", "step 3 line, fixed");
ok(M.groupSaw(D, PC) === "Before any plan, the merged group averages 6.1%, near LEAD's national average of about 6%, while the poorest group averages 14.9%. Say how you grouped households.", "step 4 reveal");
const J = D.jobs, T = D.tax;
range(J.multiplier).forEach(m => { const S = Object.assign({}, S0, { m: m }), j = A13.jobs(M.jobInputs(D, PC, S));
  if (M.lostLine(D, PC, S).indexOf("about **" + M.fmtN(Math.round(j.lostTotal)) + "**") < 0 || M.lostSaw(D, PC, S).indexOf(M.pct(j.lostTotal / 300000, 2) + " of Ridge County's 300,000 workers") < 0) ok(false, "lost lines at multiplier " + m); });
range(J.newMW).forEach(mw => range(J.capexPerKW).forEach(cx => [1, 5, 10].forEach(jy => {
  const S = Object.assign({}, S0, { mw: mw, capex: cx, jy: jy }), j = A13.jobs(M.jobInputs(D, PC, S)), bl = M.buildLine(D, PC, S);
  if (mw === 0 ? !/No new farms/.test(bl) : (bl.indexOf(M.moneyM(j.localM, 0) + " spent in the county × " + M.fmtN(jy, 1) + " = " + M.fmtN(Math.round(j.buildJobYearsDirect)) + " direct job-years; × 1.6 = ") < 0 || bl.indexOf("**" + M.fmtN(Math.round(j.buildJobYears)) + " job-years**") < 0 || bl.indexOf("about " + M.fmtN(Math.round(j.buildJobsAvg)) + " jobs for 2 years") < 0)) ok(false, "build line at " + mw + " MW, $" + cx + ", " + jy);
  if (mw > 0 && Math.abs(Math.round(j.buildJobYearsDirect) * 1.6 - j.buildJobYears) > 0.5 * 1.6 + 1e-9) ok(false, "build line: the rounded direct job-years times the multiplier is within rounding of the total at " + mw + " MW");
  if (M.buildSaw(D, PC, S).indexOf("about " + M.fmtN(Math.round(j.horizon.lostPerm)) + " job-years over 20 years") < 0) ok(false, "build reveal at " + mw + " MW");
})));
range(J.omPer100MW).forEach(om => range(J.displacement).forEach(dp => [0, 2000, 4000].forEach(mw => {
  const S = Object.assign({}, S0, { om: om, disp: dp, mw: mw }), j = A13.jobs(M.jobInputs(D, PC, S)), pl = M.permLine(D, PC, S), ps = M.permSaw(D, PC, S);
  const sgn = v => (v < 0 ? "−" : "+") + M.fmtN(Math.abs(Math.round(v)));
  if (pl.indexOf(M.fmtN(j.newPermDirect) + " direct jobs × 1.6 = about **" + M.fmtN(Math.round(j.newPermGross)) + "**") < 0 || !Number.isInteger(j.newPermDirect) || pl.indexOf(M.fmtN(Math.round(j.newPermNet)) + " net of " + dp + "%") < 0 || pl.indexOf("a net change of " + sgn(j.netPerm)) < 0) ok(false, "permanent line at " + om + ", " + dp + "%, " + mw + " MW");
  if (ps.indexOf("**" + M.sgn(j.horizon.net) + "** job-years net") < 0) ok(false, "permanent reveal at " + om + ", " + dp + "%");
  if (!near(j.buildJobYearsNet, j.buildJobYears * (1 - dp / 100)) || !near(j.horizon.net, j.buildJobYearsNet + j.newPermNet * 18 - j.lostTotal * 20)) ok(false, "displacement on building and running, one timeline, at " + om + ", " + dp + "%, " + mw + " MW");
  const tr = M.timelineRows(D, PC, S);
  if (tr.length !== 4 || tr.map(r => r.years).join() !== "1–2,3–20,1–20," || !near(tr[0].net + tr[1].net + tr[2].net, tr[3].net) || !near(tr[0].gross + tr[1].gross + tr[2].gross, tr[3].gross) || !near(tr[3].net, j.horizon.net)) ok(false, "timeline rows add up at " + om + ", " + dp + "%, " + mw + " MW");
  if (j.newPermNet > j.newPermGross + 1e-9) ok(false, "net never exceeds gross");
})));
range(T.rate).forEach(r => range(T.taxableShare).forEach(sh => [0, 2000, 4000].forEach(mw => {
  const S = Object.assign({}, S0, { rate: r, taxable: sh, mw: mw }), t = A13.taxBase(M.taxInputs(D, S)), tl = M.taxLine(D, S), ts = M.taxSaw(D, S);
  if (!near(t.plantTaxM, 3000 * r / 100) || !near(t.newTaxM, mw * 1.5 * sh / 100 * r / 100)) ok(false, "tax by hand at " + r + "%, " + sh + "%");
  const sc = (t.changeShare < 0 ? "−" : "+") + M.fmtN(Math.abs(100 * t.changeShare), 1) + "%";
  if (tl.indexOf("**" + M.signed0(t.changeM, 1) + "**") < 0 || tl.indexOf(sc + " of its " + M.moneyM(t.revenueBeforeM, 0)) < 0 || tl.indexOf("paid " + M.moneyM(t.plantTaxM, 1)) < 0) ok(false, "tax line at " + r + "%, " + sh + "%, " + mw + " MW");
  if (ts.indexOf("from " + M.pct(t.coalShareBefore, 0) + " to " + M.pct(t.coalShareAfter, 0)) < 0 || !/uses up nothing/.test(ts) || !/mines' taxes fixed/.test(ts)) ok(false, "tax reveal at " + r + "%");
  const ml = M.mineLine(D, S), msh = (t.ifMinesCloseShare < 0 ? "−" : "+") + M.fmtN(Math.abs(100 * t.ifMinesCloseShare), 1) + "%";
  if (!near(t.ifMinesCloseM, t.changeM - RC.mineCoalTaxM) || ml.indexOf("The mines' $300M a year") < 0 || ml.indexOf(M.signed0(t.ifMinesCloseM, 1) + " (" + msh + ")") < 0) ok(false, "mine line at " + r + "%, " + sh + "%, " + mw + " MW");
  const cc = M.countyCells(t);
  if ((cc.pay.v === "part") !== (t.changeM < -1e-9) || (t.changeM < -1e-9 && cc.pay.t.indexOf(M.signed0(t.changeM, 1)) < 0) || (cc.ben.v === "part") !== (t.newTaxM > 1e-9)) ok(false, "explain layer: the county's cells follow the tax at " + r + "%, " + sh + "%, " + mw + " MW");
})));
// a zero change prints as $0.0M, never a bare sign
{ const S = Object.assign({}, S0, { rate: 2.0, taxable: 100, mw: 2000 }); const t = A13.taxBase(M.taxInputs(D, S)); ok(near(t.changeM, 0) && M.taxLine(D, S).indexOf("**$0.0M**") >= 0 && !/\*\*\*\*/.test(M.taxLine(D, S)), "a zero tax change prints as $0.0M"); }

// ---------------- numbers on the page (ideas, myths, Go deeper)
has("Per kWh the poorest group's burden rises 1.5 points, with a fixed charge 1.8 and by income 0.3, for the same $24M a year", "ideas: designs");
has("Moving from per kWh to a fixed charge shifts $1.34M a year between groups", "ideas: transfer");
has("Below 80% of area median income the merged burden is 6.1%; the poorest group alone carries 14.9%", "ideas: grouping");
has("7,200 job-years of building, gross, last two years; 1,840 permanent jobs lost add up to 36,800 job-years over 20 years", "ideas: job-years");
has("Building in years 1–2 and running in years 3–20, both net of displacement, against 20 years of lost jobs: −28,275 job-years", "ideas: one timeline"); ok(M.sgn(J0.horizon.net) === "−28,275", "−28,275");
has("192 new permanent jobs gross, 154 net of displacement: a net change of −1,686 against the jobs lost", "ideas: gross and net");
has("The county's revenue falls $30.0M a year, the mines' taxes held fixed. The payment uses up nothing", "ideas: tax");
has("Every design here recovers the same $24M a year", "myth: cheaper");
has("$237 a year is 1.8 points of burden for the poorest group and 0.2 for the top group", "myth: fixed");
has("A two-year construction boom of 3,600 jobs replaces 1,840 permanent jobs", "myth: boom (question)");
has("building gives 7,200 job-years before displacement; the lost jobs add up to 36,800 job-years over 20 years", "myth: boom (answer)");
has("A plant's property tax is a resource cost, like the fuel it burns", "myth: tax (question)");
has("The plant's $60.0M a year of tax moved money from owners to the county and used up nothing; losing it cuts the county's budget, with effects on services and the region this model does not estimate", "myth: tax (answer)"); ok(M.moneyM(T0.plantTaxM, 1) === "$60.0M", "myth: tax, $60.0M");
ok(!/region loses that much wealth|the region's resources do not change|not a cost to the region|for the region a transfer/.test(PAGE + JS + ACC), "no claim that the region's wealth is unchanged");
{ const f = M.split(D, PC, 24, "fixed"); ok(M.money(f.rate.perHousehold) === "$237" && M.fmtN(100 * f.rows[0].delta, 1) === "1.8" && M.fmtN(100 * f.rows[4].delta, 1) === "0.2", "myth: fixed-charge numbers"); }
ok(Math.round(J0.newPermNet) === 154 && Math.round(J0.netPerm) === -1686 && Math.round(J0.buildJobsAvg) === 3600, "page numbers 154, −1,686, 3,600");
has("$m\\,[(B + (T - b)\\,J_{\\text{new}})(1 - d) - T\\,J_{\\text{lost}}]$", "Go deeper: the timeline formula"); has("With direct (on-site) new permanent jobs", "Go deeper: J are direct jobs");
ok(D.plan.costM.start === 24, "the default cost the page names is the data's");
// numbers to remember come from the data file's sources
ok(/LEAD/.test(D.sources.lead.title) && OWN.indexOf(D.sources.lead.url) >= 0 && OWN.indexOf(D.sources.aceee.url) >= 0 && OWN.indexOf(D.sources.jediResults.url) >= 0 && OWN.indexOf(D.sources.jediLimits.url) >= 0, "numbers to remember: LEAD, ACEEE, JEDI pages");
["rims", "qcew", "useer"].forEach(k => ok(OWN.indexOf(D.sources[k].url) >= 0, "source linked: " + k));
ok(/2,080-hour|2,080 hours/.test(D.sources.jediResults.where) && /only the gross impacts/.test(D.sources.jediLimits.where), "JEDI claims as read from the pages");
ok(/CPUC Decision 24-05-028/.test(PAGE) && !/cpuc\.ca\.gov/.test(PAGE + RAW + JS) && D.sources.cpuc.url === null, "CPUC cited by name and date, no link");

// ---------------- labels: screening estimates, assumptions, fiction
ok((JS.match(/assume\(act/g) || []).length >= 4 && /Assumptions behind this screening estimate/.test(JS), "assumptions beside the split, the jobs and the tax");
ok(/Screening estimate/.test(JS) && (JS.match(/[Ss]creening estimate/g) || []).length >= 5, "outputs labelled screening estimates");
ok(M.FICTION_PC === PC.about.line && PAGE.indexOf("<b>" + PC.about.line + "</b>") >= 0 && M.staticFallback(D, PC).indexOf(PC.about.line) >= 0 && /FICTION_PC/.test(JS), "Prairie City's fictional line, word for word");
ok(PAGE.indexOf("<b>" + RC.fiction + "</b>") >= 0 && (JS.match(/ridgeCounty\.fiction/g) || []).length >= 2, "Ridge County's fictional line on the page and with its steps");
ok(/An energy model does not produce these outcomes by itself/.test(PAGE) && /An energy model gives costs and MW/.test(JS), "the page says the accounting layer, not the energy model, produces these outcomes");
ok(/not predictions/.test(PAGE) && /\(illustrative\)/.test(JS), "coefficients are learner inputs, not predictions");
ok(!/(?<![\d,$])(13,?000|145,?000|16,?225|101,?410|9,?295|13,?012|1,?940|2,?702)(?![\d,])/.test(JS + RAW + ACC), "no Prairie City number is retyped in the scripts or the data file");

// ---------------- scope and links
const ALL = PAGE + "\n" + RAW + "\n" + JS + "\n" + ACC + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term anywhere in A13");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html/.test(PAGE + JS), "no project page and no Research page");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
const okHref = h => /^https:\/\/(www\.energy\.gov|www\.nlr\.gov|apps\.bea\.gov|www\.bls\.gov)\//.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h);
ok(hrefs.every(okHref), "links: DOE, NLR, BEA, BLS and learn pages only (" + hrefs.filter(h => !okHref(h)).join(", ") + ")");
ok(/a04-retail-tariffs\.html/.test(OWN) && /f11-air-climate-people\.html/.test(OWN), "links back to A4 and F11");
ok(/not a ranking|Illustrative roles/.test(JS), "roles, not blame");

// ---------------- text budget
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/(\d)\.(\d)/g, "$1,$2").split(/(?<=[.?!])\s+(?=[A-Z“$0-9−])/).filter(x => /[A-Za-z]/.test(x)).length;
const stepTexts = [...JS.matchAll(/\{ text: "((?:[^"\\]|\\.)*)",\n\s*build/g)].map(m => m[1].replace(/\\"/g, '"'));
ok(stepTexts.length === 9, "nine step cards (" + stepTexts.length + ")");
stepTexts.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words (about 35)"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.riseSaw(D, PC, 24), M.designSaw(D, PC, 24), M.TRANSFER_SAW, M.groupSaw(D, PC), M.lostSaw(D, PC, S0), M.buildSaw(D, PC, S0), M.permSaw(D, PC, S0), M.taxSaw(D, S0)]
  .concat(["kwh", "fixed", "income"].map(k => M.designLine(D, PC, 60, k)), ["fixed", "income"].map(k => M.transferLine(D, PC, 60, k)), ["five", "two"].map(b => M.groupLine(D, PC, 60, "fixed", b)),
          [M.lostLine(D, PC, S0), M.buildLine(D, PC, S0), M.permLine(D, PC, S0), M.taxLine(D, S0), M.mineLine(D, S0), M.timelineLine(D), M.POINTS], A13.ASSUME.split, A13.ASSUME.jobs, A13.ASSUME.tax);
lines.forEach(t => { ok(nWords(t) <= 36, "a line of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a line of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
Object.keys(M.RISE.feedback).forEach(v => { const t = (v === M.RISE.answer ? "You called it. " : "Not quite. ") + M.RISE.feedback[v]; ok(nWords(t) <= 35 && nSent(t) <= 2, "RISE feedback for " + v); });
const PROSE = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ").replace(/<!-- a13-(fallback|practice):start[\s\S]*?<!-- a13-\1:end -->/g, " ").replace(/^---[\s\S]*?\n---\n/, " ")
  .replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 38, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 2, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- the practice set balances
{ const P = M.practice(D, PC), a = M.split(D, PC, 24, "kwh"), f = M.split(D, PC, 24, "fixed");
  ok((P.match(/<li>/g) || []).length === 6, "six worked exercises");
  ok(P.indexOf("$24M ÷ " + M.fmtN(E) + " kWh = $" + M.fmtN(a.rate.perKWh, 4)) >= 0 && near(24e6 / E, a.rate.perKWh), "exercise 1 balances");
  ok(P.indexOf("236.66 ÷ 13,000 = " + M.pct(f.rows[0].delta, 2)) >= 0 && near(Number(M.fmtN(f.rate.perHousehold, 2)) / 13000, f.rows[0].delta, 1e-6), "exercise 2 balances (rounded charge within rounding)");
  ok(P.indexOf("$3,000M × 30% = $900M; × 5.0 = 4,500 direct job-years; × 1.6 = 7,200 job-years in all (gross), against 1,840 × 20 = 36,800 job-years lost") >= 0 && 900 * 5 === 4500 && 4500 * 1.6 === 7200, "exercise 5 balances, direct then the multiplier");
  ok(P.indexOf("$60M lost, $30M gained: −$30M a year for the county's budget, the mines' taxes held fixed") >= 0 && /is not estimated/.test(P), "exercise 6 balances and says what the model leaves open");
  ok(/Screening estimate/.test(P) && P.indexOf(PC.about.line) >= 0 && P.indexOf(RC.fiction) >= 0, "the practice set carries the labels"); }

// ---------------- the page's controls
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("a13"/.test(JS), "live regions; settings persist in this browser");
ok(!/title: false/.test(JS) && /LX\.Predict\(act, \{ id: "a13-rise", q: RISE\.q, answer/.test(JS), "the prediction keeps its question heading, which names its choices for screen readers");
ok(/\[\[area-median-income\|/.test(stepTexts[0]) && /percentage points: from 15% to 17% of income is \+2 points/.test(M.POINTS) && /POINTS/.test(JS.slice(JS.indexOf('id: "a13-rise"'), JS.indexOf("demo[0]"))), "step 1 defines AMI and percentage points before and beside the first prediction");
ok(/The groups' inputs: income, electricity use and home energy spending/.test(JS) && /function inputs\(host\)/.test(JS), "step 2: the groups' incomes, use and spending behind every charge, in a collapsed table");
ok(/The groups' inputs, a year per household, before the plan\./.test(M.staticFallback(D, PC)) && M.rows(PC).every(r => M.staticFallback(D, PC).indexOf(M.money(r.income)) >= 0 && M.staticFallback(D, PC).indexOf(M.money(r.spend)) >= 0), "the no-JS version lists each group's income, use and spending too");
ok(/a year in all\. Charged by income/.test(M.practice(D, PC)), "practice 3 gives the total household income in its prompt");
ok(/employment, in jobs; earnings and labor costs not valued here/.test(JS) && /the plant and its supplying mines close/.test(JS) && /if the mines' taxes end too/.test(JS), "the final ledger: jobs as employment, not earnings; the mine case named on both rows");
ok(PAGE.includes("all at the page's default inputs.") && PAGE.includes("this page's default inputs,"), "the check section's numbers are the defaults, said so");
ok(/assessments \(the value set for tax\) and abatements \(tax reductions\)/.test(JS + PAGE) && /input-output tables, accounts of what each industry buys/.test(JS), "tax and input-output terms explained where they appear");
ok(/Direct job-years per \$M/.test(JS) && /Direct permanent jobs per 100 MW/.test(JS) && /direct \(on-site\) job/.test(JS), "the coefficients are labelled direct");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && /"mid"/.test(JS) && (JS.match(/demo\[\d\] = function/g) || []).length === 9, "a demo hook for each of the nine steps");
ok(/<script src="\.\.\/assets\/learn\/learn\.js" defer><\/script>\n<script src="\.\.\/assets\/learn\/a13-fairness-jobs\.js"/.test(PAGE) && !/who-pays-and-benefits|whopays\.js"/.test(PAGE), "the accounting layer comes in the bundle (components/whopays.js); the page loads learn.js and its own script only");
["area-median-income", "employment-multiplier", "gross-jobs", "net-jobs", "tax-base", "screening-estimate", "income-based-charge"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE) && new RegExp("\\[\\[" + id + "\\||term=\"" + id + "\"").test(JS + PAGE), "the sidecar defines and the page marks " + id));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
