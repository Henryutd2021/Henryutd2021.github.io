// test_ck-m-unseen-problem.js — Node tests for CK-M, the Modeler checkpoint (assets/learn/ck-m-unseen-problem.js and
// assets/learn/data/ck-m-unseen-problem.json). The water brief's worked formulation, its bounds, special case and
// marginal value, and the supplied model with and without its defect are solved with the vendored HiGHS; the
// empirical variant's numbers are computed from town_year.json. The test checks every task's answer, the uniqueness of
// every number the solutions state as unique, each solution sentence's numbers, the numeric check, CK-M's level rule
// and summary, the supplied model's data (three real days, scaled with the course's profile helper), the page's no-JS
// blocks, and the notebooks' data and asserted numbers.
// Usage (from the site folder):  node _tests/learn/test_ck-m-unseen-problem.js [--ref] [--write]
// The data file and the four notebooks are generated (ResearchPortfolio folder):
//   python3 scripts/build_learn_ckm_data.py --site <site> && python3 scripts/build_learn_ckm_notebooks.py --site <site>
// then run this test with --ref (the supplied model's report) and --write (the page's blocks).
//   --ref    rewrite the data file's `ref` block (the supplied model's report, shown if the solver cannot load)
//   --write  rewrite the page's blocks between the ckm-* markers
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const C = require(L("ck-m-unseen-problem.js"));
const CP = require(L("components/checkpoint.js"));
const JSC = fs.readFileSync(L("ck-m-unseen-problem.js"), "utf8");
const PR = require(L("components/profiles.js"));
const RB = require(L("components/rubric.js"));
const DATA = L("data/ck-m-unseen-problem.json"), PAGE = path.join(SITE, "learn/ck-m-unseen-problem.qmd");
const J = JSON.parse(fs.readFileSync(DATA, "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const cft = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
function between(text, name) {
  const re = new RegExp("<!-- " + name + ":start[^>]*-->([\\s\\S]*?)<!-- " + name + ":end -->");
  const m = re.exec(text); return m ? m[1].replace(/^\n/, "").replace(/\n$/, "") : null;
}
function put(text, name, body) {
  const re = new RegExp("(<!-- " + name + ":start[^>]*-->)([\\s\\S]*?)(<!-- " + name + ":end -->)");
  if (!re.test(text)) throw new Error("marker " + name + " not found");
  return text.replace(re, (m, a, b, c) => a + "\n" + body + "\n" + c);
}
const task = id => [].concat(J.variants.model.tasksA, J.variants.model.tasksC, J.variants.empirical.tasksA, J.variants.empirical.tasksC, J.tasksB).filter(t => t.id === id)[0];
const usd = v => "$" + (Math.round(v * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports, highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solve = m => core.solveWith(highs, m);
  // the range of one variable over every optimal solution of model m (optimum known): min and max with the objective held
  function range(m, opt, name) {
    const costs = {}; m.variables.forEach(v => { if (v.cost) costs[v.name] = v.cost; });
    const lim = { name: "objective-cap", terms: costs, le: opt + Math.max(1e-7, Math.abs(opt) * 1e-9) };
    const mk = sense => ({ sense, variables: m.variables.map(v => Object.assign({}, v, { cost: v.name === name ? 1 : 0 })), constraints: m.constraints.concat([lim]) });
    return [solve(mk("min")).objective, solve(mk("max")).objective];
  }

  // ---------------- model variant: the worked formulation and its numbers
  const B = J.brief, Bd = C.waterBounds(B), mW = C.waterModel(B), rW = solve(mW), W = C.waterResult(B, rW);
  const r100 = solve(C.waterModel(B, { Smax: B.towerMax + 100 })), rS = solve(C.waterModel(B, { DC: 0, Smax: 1e9, Q: 1e9 }));
  const mNo = C.waterModel(B); mNo.variables.forEach(v => { if (/^q_/.test(v.name) && B.price[+v.name.slice(2)] === Math.max(...B.price)) v.ub = 0; });
  const rNo = solve(mNo);
  const x = { tower100: rW.objective - r100.objective, special: rS.objective, noPeakCost: rNo.objective, noPeakP: rNo.values.P, s16: range(mW, rW.objective, "s_16") };
  {
    ok(rW.status === "optimal" && near(W.cost, 526.9) && near(W.peak, 255) && near(W.peakWater, 330) && near(W.energyCost, 424.9), `model: $${W.cost}, ${W.peak} kW, ${W.peakWater} m³ at the peak price`);
    ok(mW.variables.length === 49 && mW.constraints.filter(c => /^tower_/.test(c.name)).length === 24 && mW.constraints.filter(c => /^peak_/.test(c.name)).length === 24 && mW.constraints.some(c => c.name === "end"), "model: 49 variables, 24 tower rows, 24 draw rows, one end row");
    const Pr = range(mW, rW.objective, "P"), Wr = (() => { const m = C.waterModel(B), costs = {}; m.variables.forEach(v => { if (v.cost) costs[v.name] = v.cost; });
      const pk = {}; W.peakHours.forEach(t => { pk["q_" + t] = 1; }); const lim = { name: "cap", terms: costs, le: rW.objective + 1e-7 };
      const mk = s => ({ sense: s, variables: m.variables.map(v => Object.assign({}, v, { cost: pk[v.name] || 0 })), constraints: m.constraints.concat([lim]) });
      return [solve(mk("min")).objective, solve(mk("max")).objective]; })();
    ok(near(Pr[0], 255, 1e-4) && near(Pr[1], 255, 1e-4), "model: the highest draw is the same in every optimal schedule (255 kW)");
    ok(near(Wr[0], 330, 1e-4) && near(Wr[1], 330, 1e-4), "model: every optimal schedule pumps 330 m³ at the peak price");
    ok(x.s16[1] - x.s16[0] > 1, `model: the schedule is not unique (level at 17:00 from ${x.s16[0]} to ${x.s16[1]} m³), as the page says`);
    ok(near(Math.max(...W.q), 510) && near(W.peak / B.kWhPerM3, 510), "model: pumps at most 510 m³ an hour");
    ok(near(x.tower100, 6.833333, 1e-5), `model: +100 m³ saves $${x.tower100}`);
    const rc = Object.keys(rW.reducedCosts).filter(k => /^s_/.test(k)).reduce((a, k) => a + rW.reducedCosts[k], 0);
    ok(near(-rc * 100, x.tower100, 1e-6), `model: the tower's upper-limit duals add up to $${-rc} per m³ (= the 100 m³ step ÷ 100)`);
    ok(near(Bd.ub, 731.8) && near(Bd.ub - B.demandCharge * Bd.maxDraw, 601.8) && near(Bd.maxDraw, 325), "bounds: pump as you go $731.80 = $601.80 + 325 kW × $0.40");
    ok(near(Bd.lb, 375.666667, 1e-5) && near(Bd.energy, 4900) && near(Bd.water, 9800) && near(Bd.avgDraw, 204.166667, 1e-5), "bounds: lower bound $375.67 = $294 + 204.2 kW × $0.40");
    ok(Bd.lb <= W.cost && W.cost <= Bd.ub, "bounds bracket the optimum");
    ok(near(x.special, 294) && near(x.special, Bd.special), "special case: exactly $294.00");
    ok(x.noPeakCost > W.cost && x.noPeakP > W.peak && near(x.noPeakCost, 528) && near(x.noPeakP, 310), `no peak-price pumping: $${x.noPeakCost} at ${x.noPeakP} kW (costs more)`);
    // the tasks
    [["m-cost", W.cost], ["m-peak", W.peak], ["m-peakwater", W.peakWater], ["m-tower", x.tower100], ["m-ub", Bd.ub], ["m-lb", Bd.lb]].forEach(([id, v]) => {
      const t = task(id); ok(near(t.answer.value, v, Math.abs(v) * 1e-4), `task ${id}: answer ${t.answer.value} = model ${v}`);
      ok(C.checkNumeric(t, v, t.units[0][0]).right && !C.checkNumeric(t, v * 1.1, t.units[0][0]).right, `task ${id}: the check accepts the model's value and rejects 10% off`);
    });
    ok(C.checkNumeric(task("m-peak"), 0.255, "MW").right && C.checkNumeric(task("m-peak"), 255, "kWh").kind && /power|rate/i.test(C.checkNumeric(task("m-peak"), 255, "kWh").msg), "m-peak: MW converts; kWh is the wrong kind");
    ok(C.checkNumeric(task("m-cost"), 52690, "cents").right && C.checkNumeric(task("m-cost"), 526.9, "kWh").kind, "m-cost: cents convert; kWh is the wrong kind");
    // the cost's tolerance tells the optimum from the schedule that never pumps at the peak price ($528.00)
    ok(!C.checkNumeric(task("m-cost"), x.noPeakCost, "$").right && C.checkNumeric(task("m-cost"), 527, "$").right && C.checkNumeric(task("m-cost"), 526.9, "$").right, `m-cost: rejects the suboptimal $${x.noPeakCost}, accepts $527 (rounded)`);
    // no task's own solution gives away a later task's answer (task 2 once named task 3's 255 kW)
    ["model", "empirical"].forEach(k => {
      const T = C.variantData(J, k).tasks;
      T.forEach((t, i) => T.slice(i + 1).filter(u => u.kind === "numeric").forEach(u => {
        const n = (/[\d,]+(\.\d+)?/.exec(u.answer.show) || [""])[0];
        ok(!n || t.solution.indexOf(n) < 0, `${k}: task ${i + 1}'s solution does not give task ${T.indexOf(u) + 1}'s answer (${n})`);
      }));
      ok(T.indexOf(task("m-cost")) < 0 || !/255|\$102/.test(task("m-cost").solution), "m-cost solution: no demand-charge split (it gives the highest draw)");
    });
    ok(C.solModelHTML(J, W, Bd, x).indexOf(usd(W.energyCost) + " energy + $102.00 demand charge") > 0, "worked solution: the energy and demand-charge parts");
    // every number task states its tolerance in its prompt, as the relative tolerance it is marked with
    [].concat(J.variants.model.tasksA, J.variants.model.tasksC, J.variants.empirical.tasksA, J.variants.empirical.tasksC, J.tasksB).filter(t => t.kind === "numeric").forEach(t => {
      ok(t.prompt.indexOf("Within " + (Math.round(t.answer.tol * 1000) / 10) + "%") >= 0 && /counts as right\.$/.test(t.prompt), `task ${t.id}: the prompt states its tolerance (${t.answer.tol * 100}%)`);
    });
    // with JavaScript the runner shows it under the answer field (shared fix 14): the runner's task moves that sentence
    // into tolNote, so it is said once; the no-JS list keeps the whole prompt
    ["model", "empirical"].forEach(k => C.variantData(J, k).tasks.filter(t => t.kind === "numeric").forEach(t => {
      const raw = [].concat(J.variants[k].tasksA, J.tasksB, J.variants[k].tasksC).filter(u => u.id === t.id)[0];
      ok(t.tolNote && /^Within .* counts as right\.$/.test(t.tolNote) && !/counts as right/.test(t.prompt) && t.prompt + " " + t.tolNote === raw.prompt && CP.tolText(t) === t.tolNote,
        `${k} ${t.id}: the runner's prompt leaves the tolerance to the line under the field (${t.tolNote})`);
    }));
    ok(/openFirst: "not-right"/.test(JSC) && !/ckm-sol-open", solOpen\)/.test(JSC) && /LX\.Checkpoint\.solOpened\(KEYS\[k\]\)/.test(JSC), "CK-M: the runner records the solutions' opening per runner (the old ckm-sol-open record is still read) and applies openFirst");
    // another valid special case, as task 11's point allows: one flat price and no demand charge
    const Bf = Object.assign({}, B, { price: B.price.map(() => 0.1) }), rF0 = solve(C.waterModel(Bf, { DC: 0 }));
    ok(near(rF0.objective, 0.1 * Bd.energy) && near(rF0.objective, 490) && /flat price/.test(task("m-valid").points[1]) && /\$294\.00/.test(task("m-valid").points[1]), "special case: a flat $0.10/kWh with no demand charge gives $490.00 by hand and by the model; the point accepts any such case");
    ok(task("m-valid").points[0].indexOf("$526.90") >= 0 && task("m-valid").points[0].indexOf("$375.67") >= 0 && task("m-valid").points[0].indexOf("$731.80") >= 0 && task("m-valid").points[1].indexOf("$294.00") >= 0, "m-valid points: the numbers");
    ok(task("m-ub").solution.indexOf("$601.80") >= 0 && task("m-lb").solution.indexOf("$81.67") >= 0 && task("m-lb").solution.indexOf("204.2 kW") >= 0, "bound solutions: the parts");
    ok(/650 m³ ÷ 1 h = 325 kW/.test(task("m-ub").solution) && /4,900 kWh ÷ 24 h = 204\.2 kW/.test(task("m-lb").solution) && /0\.5 kWh\/m³/.test(task("m-lb").solution), "bound solutions: units kept, energy divided by hours to give kW");
  }

  // ---------------- empirical variant
  const E = J.empirical, S = C.empStats(year, E);
  {
    ok(S.hours === 8760 && near(S.demandGWh, 2469.13065, 1e-4), `empirical: 8,760 hours, ${S.demandGWh} GWh`);
    ok(Math.max(...year.demand) === 1000 && Math.max(...year.wind) === 1000 && Math.max(...year.solar) === 1000, "empirical: each shape's highest hour is 1000 (the farm at full size)");
    [["e-cf", S.cfWind], ["e-wind-peak", S.windTopD], ["e-solar-peak", S.solarTopD], ["e-net", S.bothTopN], ["e-gap", S.gap]].forEach(([id, v]) => {
      const t = task(id); ok(near(t.answer.value, v, 1e-3), `task ${id}: answer ${t.answer.value} = data ${v}`);
      ok(C.checkNumeric(t, v, t.units[0][0]).right, `task ${id}: the check accepts the data's value`);
    });
    ok(C.checkNumeric(task("e-cf"), 0.5275, "fraction (0 to 1)").right && !C.checkNumeric(task("e-cf"), 33.8, "%").right, "e-cf: a fraction converts; EIA's 33.8% is not the dataset's figure");
    ok(near(S.windTopN, 29.575, 1e-6) && near(S.solarTopN, 4.263, 1e-6) && near(S.ratioTopN, 0.5606, 1e-4), "empirical: net-load peaks: wind 29.6%, solar 4.3%, ratio 0.56");
    ok(S.windTopD > S.cfWind && S.solarTopD > S.cfSolar, "empirical: at the demand peaks both farms give more than their year averages");
    ok(task("e-net").solution.indexOf("29.6%") >= 0 && task("e-net").solution.indexOf("4.3%") >= 0 && task("e-valid").points[2].indexOf("0.56") >= 0, "empirical solutions: the numbers");
    // rescaling wind: the ratio is unchanged for the same hours; picking the net-load hours again changes them and it
    ok(near(S.ratioTopNSame, S.ratioTopN, 1e-12) && near(S.ratioTopNPicked, 0.7138, 1e-4) && S.keptTopN === 82, `rescaled: same hours ${S.ratioTopNSame.toFixed(4)}, picked again ${S.ratioTopNPicked.toFixed(4)} with ${S.keptTopN} of 100 hours kept`);
    ok(/0\.71/.test(task("e-valid").points[2]) && /82 of 100/.test(task("e-valid").points[2]) && /same 100 net-load hours/.test(task("e-valid").points[2]), "e-valid: both rescaling routes stated, so either is accepted with its boundary");
    ok(!/capacity factor/i.test(task("e-cf").title + task("e-cf").prompt) && /not a capacity factor/.test(task("e-cf").solution), "e-cf: the dataset's statistic is named a mean output as a share of the highest hour, not a capacity factor");
    // where the top hours fall (local Central time, hour beginning): the solution sentences
    const local = i => { const end = Date.parse(year.start_utc + "Z") + i * 3600000; const d = new Date(end - 3600000);
      const y = d.getUTCFullYear(), dst0 = Date.UTC(y, 2, 9, 8), dst1 = Date.UTC(y, 10, 2, 7); const off = (d.getTime() >= dst0 && d.getTime() < dst1) ? 5 : 6;
      const l = new Date(d.getTime() - off * 3600000); return { m: l.getUTCMonth() + 1, h: l.getUTCHours() }; };
    const LD = S.topD.map(local), LN = S.topN.map(local);
    ok(LD.every(q => q.m >= 6 && q.m <= 8 && q.h >= 12 && q.h <= 20), "e-solar-peak solution: the highest-demand hours are June to August, 12:00 to 21:00");
    ok(LN.every(q => (q.h >= 17 && q.h <= 23) || ((q.m <= 2 || q.m === 12) && q.h <= 10)), "e-net solution: the highest net-load hours are evenings, or winter nights and mornings");
    ok(LN.filter(q => q.h >= 19 && q.h <= 21).length > 50, "e-net solution: mostly 19:00 to 22:00");
    // the tie rule: stated in the brief, and it matters at the cut
    ok(S.tieD && S.tieN && E.facts.some(f => /earlier one first/.test(f[1])), "empirical: hours tie at the 100th place, so the brief states the tie rule");
    ok(C.topHours([3, 5, 5, 1], 2).join() === "1,2", "tie rule: the earlier hour first");
    // a linear rescaling keeps the ratio
    const k = 0.338 / (S.cfWind / 100), w = year.wind.map(v => v / 1000 * 150 * k), meanAll = w.reduce((a, b) => a + b, 0) / w.length;
    const meanN = S.topN.reduce((a, i) => a + w[i], 0) / S.topN.length;
    ok(near(meanAll / 150, 0.338, 1e-9) && near(meanN / meanAll, S.ratioTopN, 1e-12), "validation: rescaled to 33.8%, the net-load ratio is unchanged");
    ok(near(task("e-gap").answer.value, S.cfWind - 33.8, 1e-3) && E.eiaWind === cft.targets.wind.cf && E.eiaSolar === cft.targets.solar.cf, "e-gap: against cf_targets.json's EIA value");
  }

  // ---------------- the supplied model: three real days, the defect, the fix
  const M = J.defect;
  {
    const t0 = Date.parse(year.start_utc + "Z"), kw = PR.cfScale(year.wind, 0.338, "scale"), ks = PR.cfScale(year.solar, 0.24, "scale");
    const off = { winter: -6, shoulder: -5, summer: -5 }, date = { winter: "2025-01-16", shoulder: "2025-04-02", summer: "2025-09-15" };
    M.days.forEach(d => {
      const i = Math.round((Date.parse(d.date + "T00:00:00Z") - t0) / 3600000) + 1 - off[d.id], cut = a => a.slice(i, i + 24);
      ok(d.date === date[d.id], `defect day ${d.id}: ${d.date}`);
      ok(JSON.stringify(d.demand) === JSON.stringify(cut(year.demand).map(v => Math.round(v / 1000 * 450 * 100) / 100)), `defect day ${d.id}: demand = shape × 450 MW`);
      ok(JSON.stringify(d.wind) === JSON.stringify(cut(year.wind).map(v => Math.round(Math.min(1, kw * v / 1000) * 1e4) / 1e4)), `defect day ${d.id}: wind per MW = the course's scale method to 33.8%`);
      ok(JSON.stringify(d.solar) === JSON.stringify(cut(year.solar).map(v => Math.round(Math.min(1, ks * v / 1000) * 1e4) / 1e4)), `defect day ${d.id}: solar per MW = the course's scale method to 24.0%`);
    });
    ok(M.days.reduce((a, d) => a + d.weight, 0) === 365 && M.days.map(d => d.weight).join() === "121,122,122", "defect: weights 121, 122, 122 days (Dec-Mar, Apr-May and Oct-Nov, Jun-Sep)");
    ok(M.code[1].indexOf("/ 365") > 0 && task("d-line").answer === "a" && task("d-line").options[0][1].indexOf("Line 2") === 0, "defect: line 2 of the code holds it");
    // line 6 (the objective) is as the paper and the executable model: the unserved-demand penalty once per day and hour
    ok(/sum\(weight\[d\] \* \(sum\(cost\[g\] \* p\[g,d,t\] for g\) \+ V \* u\[d,t\]\) for d, t\)/.test(M.code[5]) && !/for g, d, t\) \)/.test(M.code[5]) && /\(Σ_g c_g p_g,d,t\) \+ V u_d,t/.test(M.paper[1][1]), "defect: the objective line charges unserved demand once, as the paper and the model do (the only defect is line 2)");
    ok(M.paper.some(p => p[0] === "Domains" && /K_g ≥ 0/.test(p[1]) && /u_d,t ≥ 0/.test(p[1])), "defect: the paper states the variables' domains");
    ["g", "w_d", "A_g", "K_g", "c_g", "p_g,d,t", "u_d,t", "V", "D_d,t", "a_g,d,t"].forEach(q => ok(M.symbols.some(r => r[0].split(", ").indexOf(q) >= 0 || r[0] === q) || (q === "g"), `defect: symbol ${q} in the key, with its unit`));
  }
  const mD = C.defectModel(M, { defect: true }), mF = C.defectModel(M, {});
  const rD = solve(mD), rF = solve(mF), Rd = C.defectReport(M, rD, { defect: true }), Rf = C.defectReport(M, rF, {});
  {
    ok(rD.status === "optimal" && rF.status === "optimal", "defect: both versions solve to optimal");
    ok(near(Rd.K.wind, 0) && near(Rd.K.solar, 0) && near(Rd.K.cc, 0) && near(Rd.K.pk, 308.7, 1e-6) && Rd.unservedYear > 0, `defect: a peaker only (${Rd.K.pk} MW), demand left unserved`);
    ok(near(Rd.weights, 1) && near(Rd.demandYear, Rf.demandYear / 365, 1e-6) && Math.round(Rd.demandYear) === 6757, `defect: the year holds ${Rd.demandYear} MWh, one 365th of ${Rf.demandYear}`);
    ok((Rd.cost / 1e6).toFixed(1) === "18.1" && task("d-check").options[3][1].indexOf("$18.1 million") > 0 && task("d-check").options[1][1].indexOf("6,757 MWh") > 0, "d-check options: the report's numbers");
    ok(near(Rf.unservedYear, 0) && near(Rf.cost, Rf.trueCost) && near(task("d-fixed").answer.value, Rf.cost, 0.01), `d-fixed: $${Rf.cost} a year, no unserved demand`);
    ok(near(Rf.demandYear / 1000, 2466.2754, 1e-4) && near(Rf.perMWh, 43.31, 0.01), "fixed: 2,466 GWh in the year, about $43 per MWh");
    ["wind", "solar", "cc", "pk"].forEach(g => { const r = range(mF, rF.objective, "K_" + g); ok(near(r[0], r[1], 0.01), `fixed: ${g} capacity is the same in every optimal plan (${r[0]}–${r[1]})`); });
    const sol = task("d-fixed").solution; ok(["548 MW", "211 MW", "152 MW", "54 MW", "$106.8 million", "$43"].every(s => sol.indexOf(s) >= 0) && Math.round(Rf.K.wind) === 548 && Math.round(Rf.K.solar) === 211 && Math.round(Rf.K.cc) === 152 && Math.round(Rf.K.pk) === 54, "d-fixed solution: the plan's numbers");
    ok(C.checkNumeric(task("d-fixed"), 106.82, "$ million").right && !C.checkNumeric(task("d-fixed"), 18.12, "$ million").right, "d-fixed: $ million converts; the defect's cost is rejected");
    ok(Math.abs(Rf.demandYear / 1000 - S.demandGWh) / S.demandGWh < 0.002, "fixed: the three weighted days hold the year's demand within 0.2% of the full 2025 data");
  }

  // ---------------- the checkpoint: tasks, rule, summary
  {
    ["model", "empirical"].forEach(k => {
      const D = C.variantData(J, k), ids = D.tasks.map(t => t.id);
      ok(D.tasks.length === 11 && new Set(ids).size === 11 && D.tasks.filter(t => ["choice", "numeric"].includes(t.kind)).length === 9 && D.tasks.filter(t => t.kind === "open-short").length === 2, `${k}: 11 tasks, 9 auto-marked, 2 written`);
      ok(D.tasks[D.tasks.length - 1].kind === "open-short" && D.tasks[0].kind === "open-short" && ids.indexOf("d-line") === 5, `${k}: written tasks first and last; the defect's line is task 6`);
      D.tasks.forEach(t => { if (t.kind === "choice") ok(t.options.some(o => o[0] === t.answer) && t.options.every(o => t.why[o[0]]), `${k} ${t.id}: answer among the options, feedback for each`); });
      // the rule on made-up attempts
      const st = (right, ptsA, ptsC, defect) => { const s = { tasks: {} }; let n = 0;
        D.tasks.forEach(t => { if (t.kind === "open-short") s.tasks[t.id] = { answer: "x", points: t.points.map((p, i) => i < (t === D.tasks[0] ? ptsA : ptsC)) };
          else if (t.id === "d-line") s.tasks[t.id] = { first: defect };
          else s.tasks[t.id] = { first: n++ < right - (defect ? 1 : 0) }; });
        return s; };
      ok(C.level(D, st(9, 4, 3, true)).level === "Strong", `${k} rule: 9 of 9, all points: Strong`);
      ok(C.level(D, st(8, 4, 3, true)).level === "Strong" && C.level(D, st(8, 3, 3, true)).level === "Proficient", `${k} rule: 8 of 9 needs every point for Strong`);
      ok(C.level(D, st(6, 3, 2, true)).level === "Proficient" && C.level(D, st(6, 2, 2, true)).level === "Developing", `${k} rule: Proficient needs 3 of 4 points in part A`);
      ok(C.level(D, st(8, 4, 3, false)).level === "Developing", `${k} rule: missing the defect's line on the first try caps at Developing`);
      ok(C.level(D, st(3, 4, 3, true)).level === "Not yet" && C.level(D, st(4, 0, 0, true)).level === "Developing", `${k} rule: 4 of 9 for Developing`);
      // assisted work: a solution opened before answering does not count; the full solutions opened early make it practice
      const last = D.tasks[D.tasks.length - 1].id;
      const all = st(9, 4, 3, true); Object.keys(all.tasks).forEach(id => { all.tasks[id].solFirst = true; });
      ok(C.level(D, all).level === J.rule.practice, `${k} rule: every solution opened first, then every answer right: practice, not Strong`);
      const one = st(9, 4, 3, true); one.tasks["d-line"].solFirst = true;
      ok(C.level(D, one).level === "Developing" && C.level(D, one).auto === 8, `${k} rule: the defect's solution opened first: that task is not right, so Developing`);
      const two = st(9, 4, 3, true); two.tasks[D.tasks[1].id].solFirst = true;
      ok(C.level(D, two).level === "Strong" && C.level(D, two).early === 1, `${k} rule: one other solution opened first: 8 of 9, still Strong`);
      const gate = st(9, 4, 3, true); gate.tasks[last].solFirst = true;
      ok(C.level(D, gate).level === J.rule.practice && C.level(D, gate).assisted === "early", `${k} rule: the full worked solutions opened before task 11: practice`);
      const Dseen = Object.assign({}, D, { solOpen: {} }), late = st(9, 4, 3, true); late.tasks[last].at = "2026-11-03T12:00:00.000Z";
      Dseen.solOpen[D.other] = "2026-11-03T11:00:00.000Z";
      ok(C.level(Dseen, late).level === J.rule.practice && C.level(Dseen, late).assisted === "seen", `${k} rule: the other variant's solutions open before this one was submitted: practice`);
      Dseen.solOpen = {}; Dseen.solOpen[D.other] = "2026-11-03T13:00:00.000Z"; Dseen.solOpen[D.key] = late.tasks[last].at;
      ok(C.level(Dseen, late).level === "Strong", `${k} rule: solutions opened by this attempt's own submission, or by the other variant later, do not count`);
      ok(/practice/.test(C.describe(D, C.level(D, all))), `${k} describe: says why an assisted attempt has no level`);
      const sm = C.summary(D, Object.assign(st(7, 3, 2, true), { finished: "2026-11-03 10:00" }), { width: 375 });
      ok(sm.split("\n")[0] === "Learn · CK-M results (" + J.version + ")" && sm.indexOf("Variant: " + J.variants[k].label) > 0 && /Level by the published rule: Proficient/.test(sm), `${k} summary: first line, variant, level`);
    });
    ok(J.rule.autoProficient === 6 && J.rule.autoStrong === 8 && J.rule.autoDeveloping === 4 && J.rule.pointsA === 3 && J.rule.pointsC === 2, "rule as the page states it");
  }

  // ---------------- the page's static blocks, and its stated numbers
  const blocks = {
    "ckm-brief-model": C.briefModelHTML(J), "ckm-brief-empirical": C.briefEmpiricalHTML(J), "ckm-supplied": C.suppliedHTML(J, Rd),
    "ckm-fallback": C.staticTasks(J), "ckm-sol-model": C.solModelHTML(J, W, Bd, x), "ckm-sol-empirical": C.solEmpiricalHTML(J, S),
    "ckm-sol-defect": C.solDefectHTML(J, Rd, Rf), "ckm-course-rubric": RB.staticHTML([{ id: "trust", look: J.rubricLook }])
  };
  if (process.argv.includes("--ref")) {
    const out = JSON.parse(fs.readFileSync(DATA, "utf8"));
    const r6 = v => Math.round(v * 1e6) / 1e6;
    out.ref = { supplied: { K: Object.fromEntries(Object.entries(Rd.K).map(([k, v]) => [k, r6(v)])), cost: r6(Rd.cost), demandYear: r6(Rd.demandYear), unservedYear: r6(Rd.unservedYear) } };
    fs.writeFileSync(DATA, JSON.stringify(out, null, 1) + "\n"); console.log("wrote ref");
  }
  if (process.argv.includes("--write")) {
    let page = fs.readFileSync(PAGE, "utf8"); Object.keys(blocks).forEach(k => { page = put(page, k, blocks[k]); });
    fs.writeFileSync(PAGE, page); console.log("wrote the page's blocks");
  }
  {
    const QMD = fs.readFileSync(PAGE, "utf8"), J2 = JSON.parse(fs.readFileSync(DATA, "utf8"));
    Object.keys(blocks).forEach(k => ok(between(QMD, k) === blocks[k], `page block ${k} is up to date (run --write)`));
    ok(J2.ref && J2.ref.supplied && near(J2.ref.supplied.cost, Rd.cost, 1e-5) && near(J2.ref.supplied.K.pk, Rd.K.pk, 1e-5), "ref: the supplied model's report (run --ref)");
    // the no-JS task list holds prompts only; the page's downloads hold no answers
    const FB = between(QMD, "ckm-fallback");
    [].concat(J.variants.model.tasksA, J.variants.model.tasksC, J.variants.empirical.tasksA, J.variants.empirical.tasksC, J.tasksB).forEach(t => {
      if (t.kind === "numeric") ok(FB.indexOf(t.answer.show) < 0, `no-JS task list: no answer for ${t.id}`);
      ok(FB.indexOf(t.solution.replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").slice(0, 40).replace(/&/g, "&amp;")) < 0, `no-JS task list: no worked solution for ${t.id}`);
    });
    ok(!/Worked solution, task/.test(FB) && /nothing here is locked/.test(FB), "no-JS task list: no worked solutions, and it says the solutions below are not locked");
    const BR = L("data/ck-m-unseen-problem-briefs.json"), BJ = fs.existsSync(BR) ? JSON.parse(fs.readFileSync(BR, "utf8")) : null, BT = BJ ? JSON.stringify(BJ) : "";
    ok(BJ && BJ.brief && BJ.empirical && BJ.defect && !BJ.variants && !BJ.tasksB && !BJ.ref && !/"(answer|solution|points|why)"/.test(BT) && !/526\.9|106817573|52\.75|18\.95|6,757/.test(BT), "briefs-only download: briefs and model data, no tasks, answers or report");
    ok(QMD.indexOf('href="../assets/learn/data/ck-m-unseen-problem-briefs.json"') > 0 && QMD.indexOf('href="../assets/learn/data/ck-m-unseen-problem.json"') < 0, "page: the JSON download is the briefs-only file");
    ok(/How it is marked, before you start/.test(QMD) && /counts as not right/.test(QMD) && /practice, with no level/.test(QMD), "page: the marking rule, tolerances and early-solution rule come before the tasks");
    ok(J.intro.some(t => /tolerance/.test(t)) && J.intro.some(t => /practice/.test(t)), "runner intro: tolerances and the practice rule before Start");
    ok(/at least 6 of the 9 auto-marked tasks/.test(QMD) && /at least 8 of 9/.test(QMD) && /at least 4 of 9/.test(QMD) && /3 of the 4 points/.test(QMD) && /2 of the 3 points/.test(QMD), "page: the level rule in words matches the data");
    ok(/49 variables, 24 tower rows, 24 draw rows and one end-of-day row/.test(QMD), "page: the model's size");
    ok(QMD.indexOf('class="lx-ck-gated ckm-solution-body"') > 0 && QMD.indexOf('id="ckm-lock"') > 0, "page: the worked solutions are gated");
    ok(J.intro[0].indexOf("about 240 minutes") > 0 && /120[\s\S]*60[\s\S]*45[\s\S]*15/.test(J.intro[0]), "intro: 120 + 60 + 45 + 15 = 240 minutes");
    // the shared runner's options do what CK-M once did by hand (W2 integration): no observer, no own numeric check or gate
    const SRC = fs.readFileSync(L("ck-m-unseen-problem.js"), "utf8");
    ok(!/MutationObserver|function checkNumeric|function gate\(|fixResults/.test(SRC) && /describe: describe/.test(SRC) && /submitTask: finalId\(J, k\)/.test(SRC) && /cp\.destroy\(\)/.test(SRC),
       "page code: the runner's describe, submitTask and destroy options; the numeric check is the shared one");
    ok(C.checkNumeric === require(L("components/checkpoint.js")).checkNumeric, "checkNumeric is the shared runner's (any unit)");
  }

  // ---------------- notebooks: the starter holds the data and the defect; the solutions assert the numbers
  {
    const nbText = f => { const p = path.join(SITE, "learn/notebooks", f); if (!fs.existsSync(p)) return null; const nb = JSON.parse(fs.readFileSync(p, "utf8"));
      ok(nb.cells.every(c => c.cell_type !== "code" || (c.outputs || []).every(o => o.output_type !== "error")), f + ": no error outputs saved");
      return nb.cells.map(c => (Array.isArray(c.source) ? c.source.join("") : c.source)).join("\n"); };
    const st = nbText("ck-m-start.ipynb"), sm = nbText("ck-m-solution-model.ipynb"), se = nbText("ck-m-solution-empirical.ipynb"), sd = nbText("ck-m-solution-defect.ipynb");
    ok(st && sm && se && sd, "the four notebooks exist");
    if (st) {
      ok(st.indexOf("water = [" + B.water.join(", ") + "]") >= 0 && st.indexOf("weight = {d: DAYS[d] / 365 for d in DAYS}") >= 0, "starter: the brief's data and the supplied code, defect included");
      ok(!/526\.9|255 kW|weight = DAYS\b(?!\[)/.test(st), "starter: no answers and no fix");
      M.days.forEach(d => ok(st.indexOf(JSON.stringify(d.demand).replace(/,/g, ", ")) >= 0, `starter: day ${d.id} demand`));
    }
    if (sm) ["526.9", "255", "330", "6.8333", "731.8", "375.6667", "294"].forEach(n => ok(sm.indexOf(n) >= 0, "model solution asserts " + n));
    if (se) ["52.75", "58.11", "68.97", "52.89", "18.95", "0.5606", "0.7138", "== 82"].forEach(n => ok(se.indexOf(n) >= 0, "empirical solution asserts " + n));
    if (se) ok(/except Exception/.test(se) && /tzdata/.test(se) && /Python 3\.9/.test(se), "empirical solution: Python 3.9+, a time-zone-data fallback");
    if (st) ok(/\| Domains \|/.test(st) && st.indexOf("\\big(\\sum_g c_g p_{g,d,t}\\big) + V u_{d,t}") >= 0 && /\| \$V\$ \|/.test(st), "starter: the objective with the penalty once, the variables' domains and a symbol key");
    if (sd) ["308.7", "6756.9", "106817573.9", "548.4", "210.7", "151.9", "54.3"].forEach(n => ok(sd.indexOf(n) >= 0, "defect solution asserts " + n));
  }

  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
