// test_b03-read-check-formulation.js — Node tests for bridge B3 (assets/learn/b03-read-check-formulation.js) and its data
// (assets/learn/data/b03-read-check-formulation.json): the four hours are lesson 0's day; the correct model, solved with
// the vendored HiGHS, matches the precomputed solution the page shows before solving (balance, costs, duals, curtailment);
// each planted bug gives the symptom the page describes; the row counts, units and sums are right; and every number the
// page states matches the model. The practice set (Check section): every model it runs is solved with HiGHS and matches the
// precomputed answer the page falls back to (data file practice.ref); each exercise's answer, hints and check reasons come
// from the model, right answers pass, and typical wrong answers get the reason the data file names.
// Usage (from the site folder):  node _tests/learn/test_b03-read-check-formulation.js [--ref | --static]
//   --ref     print the practice.ref block (HiGHS solutions of the practice models) for the data file, and stop
//   --static  print the page's two static blocks (the symbol key of the fallback, and the practice set without
//             JavaScript), built from the model and the precomputed answers, and stop; without it the test checks that
//             the page holds exactly these blocks
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L("b03-read-check-formulation.js"));
const G0 = require(L("grid-operator.js"));
const J = JSON.parse(fs.readFileSync(L("data/b03-read-check-formulation.json"), "utf8"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/b03-read-check-formulation.qmd"), "utf8");
const JS = fs.readFileSync(L("b03-read-check-formulation.js"), "utf8");

// ---------------- the static blocks of the page (readers without JavaScript), from the model
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const KIND = { worked: "worked example", partly: "partly worked", scratch: "from scratch" };
function staticKey(inst) {
  return '<details class="lx-textalt b3-key"><summary>Symbol key and input values</summary>\n<div class="lx-fp-tabw"><table class="lx-fp-tab b3-keytab">\n' +
    '<thead><tr><th scope="col">Symbol</th><th scope="col">Meaning</th><th scope="col">Unit</th><th scope="col">Value</th></tr></thead>\n<tbody>\n' +
    M.inputs(inst).map(r => `<tr><th scope="row">${r.sym}</th><td>${esc(r.name)}</td><td>${esc(r.unit)}</td><td>${esc(r.value)}</td></tr>`).join("\n") + "\n</tbody></table></div></details>";
}
// the formulation's lines as the page shows them without JavaScript: the same tags as the interactive lines (data, goal,
// (1) to (5)), and the same lines in words
const LN = ["par", "obj", "bal", "size", "wx", "ramp", "must"];
const tagged = (html, k) => `<li><span class="b3-tag">${esc(J.lineTags[k])}</span> ${html} <span class="b3-static-n">(${esc(J.lineNames[k])})</span></li>`;
function staticLines() {
  return '<ul class="b3-static b3-tagged">\n' + LN.map(k => tagged(J.lines[k], k)).join("\n") + "\n</ul>\n" +
    '<details class="lx-textalt"><summary>The lines in words</summary><ul class="b3-static-words">' + LN.map(k => `<li><b>${esc(J.lineTags[k])} ${esc(J.lineNames[k])}.</b> ${esc(J.lineWords[k])}</li>`).join("") + "</ul>" +
    '<dl class="b3-static-legend">' + J.legend.map(x => `<dt>${esc(x[0])}</dt><dd>${esc(x[1])}</dd>`).join("") + "</dl></details>";
}
function staticPractice() {
  const PJ = J.practice, sol = {};
  Object.keys(M.PRACTICE_RUN).forEach(k => { sol[k] = M.fromRef(M.practiceInst(town, year, J, k), k === "ok" ? J.ref : PJ.ref[k]); });
  const SP = {}; Object.keys(PJ.items).forEach(k => { SP[k] = M.practiceSpec(k, J, town, year, sol); });
  const r6 = v => String(Math.round(v * 1e6) / 1e6);
  const strip = t => { const u = String(t).replace(/^Right[:.]\s*/, ""); return u.charAt(0).toUpperCase() + u.slice(1); };
  const p = t => `<p>${esc(t)}</p>`, line = h => `<p class="b3-static-line">${h}</p>`;
  const lines = bug => '<ul class="b3-static b3-tagged">' + LN.map(k => tagged(bug && PJ.bugs[bug].line === k ? PJ.bugs[bug].html : J.lines[k], k)).join("") + "</ul>";
  const worked = w => '<ul class="b3-static-worked">' + w.map(x => `<li><b>${esc(x[0])}.</b> ${esc(x[1])}</li>`).join("") + "</ul>";
  const table = (key, sum) => {
    const i = M.practiceInst(town, year, J, key), S = sol[key];
    const rows = M.G.map(g => [M.GNAME[g], x => x[g]]).concat([["unserved", x => x.u]], sum ? [["supply", x => M.G.reduce((a, g) => a + x[g], 0) + x.u]] : [], [["demand", x => x.d]]);
    return '<div class="lx-fp-tabw"><table class="lx-fp-tab b3-ptab"><caption class="lx-sr">The solved plan, MW, by plant and hour</caption><thead><tr><th scope="col">MW</th>' + i.T.map(t => `<th scope="col">${t}:00</th>`).join("") + "</tr></thead><tbody>" +
      rows.map(r => `<tr><th scope="row">${r[0]}</th>` + S.rows.map(x => `<td class="n">${r6(r[1](x))}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>";
  };
  const body = {
    r1: (it, s) => [line(J.lines.ramp), worked(s.worked), p(s.q)],
    r2: (it, s) => [line(PJ.lines.store), p(it.words), '<ul class="b3-static-worked">' + it.given.map(x => `<li>${x[0]}: <b>${esc(x[1])}</b> (given)</li>`).join("") + "</ul>",
                    `<p>Give the unit of each: ${it.ask.map(x => x[1]).join(", ")}. ${esc(s.rowsQ)}?</p>`],
    r3: (it, s) => [line(PJ.lines.reserve), p(it.q), '<ol class="b3-static-ch" type="a">' + it.choices.map(c => `<li>${esc(c)}</li>`).join("") + "</ol>", p(s.unitQ + "? " + s.rowsQ + "? " + s.totalQ + "?")],
    g1: (it, s) => [lines("vkwh"), "<p>The solved plan:</p>", table("vkwh"), worked(s.worked), p(it.q), '<ol class="b3-static-ch" type="a">' + s.choices.map(c => `<li>${esc(c)}</li>`).join("") + "</ol>"],
    g2: (it, s) => [p(s.symptom), table("flat"), lines("flat"), p("Which line was changed, and which check catches it: " + it.checks.join("; ") + "?")],
    g3: (it, s) => [lines("twice"), "<p>The solved plan:</p>", table("twice"), p(s.supplyQ + "? " + s.shortQ + "? Which line causes it?")],
    k1: (it, s) => ["<p>The solved plan:</p>", table("ok", true), worked(s.worked), p(s.q)],
    k2: (it, s) => [p(s.note), table("eve"), worked(s.worked), p(it.pkQ + " cost? " + it.totalQ + "?")],
    k3: (it, s) => [p(s.note), table("dip"), p(s.supplyQ + "? " + s.totalQ + "? " + s.dualQ + "?")]
  };
  const answer = {
    r1: (it, s) => strip(M.fill(it.right, s.vars)),
    r2: (it, s) => it.ask.map(x => ({ q: "q(t)", eta: "η", w: "w(t)" })[x[0]] + ": " + x[2]).join("; ") + ". " + strip(M.fill(it.right, s.vars)),
    r3: (it, s) => it.choices[it.answer] + " " + strip(M.fill(it.right, s.vars)),
    g1: (it, s) => s.choices[it.answer] + ". " + strip(M.fill(it.reasons[it.answer], s.vars)),
    g2: (it, s) => strip(M.fill(it.right, s.vars)) + " Caught by: " + it.checks[it.answer].toLowerCase() + ".",
    g3: (it, s) => strip(M.fill(it.right, s.vars)),
    k1: (it, s) => strip(M.fill(it.right, s.vars)),
    k2: (it, s) => "Peaker " + s.vars.pkCost + ". " + strip(M.fill(it.right, s.vars)),
    k3: (it, s) => strip(M.fill(it.right, s.vars)) + " " + M.fill(it.duals, s.vars)
  };
  const minutes = Object.keys(PJ.items).reduce((a, k) => a + PJ.items[k].minutes, 0);
  return `<div class="lx-card b3-pstatic">\n<p class="lx-eyebrow">${esc(PJ.title)} · about ${minutes} min</p>\n<p class="lx-hint">With JavaScript on, each exercise runs the solver, gives hints one at a time and checks your answer.</p>\n` +
    PJ.tracks.map(t => `<h3>${esc(t.label)}</h3>\n<p>${esc(t.intro)}</p>\n<ol class="b3-ps">\n` + t.items.map(k => {
      const it = PJ.items[k], s = SP[k];
      return `<li><p><b>${esc(s.title || it.title)}</b> (${KIND[it.kind]}, about ${it.minutes} min)</p>\n${body[k](it, s).join("\n")}\n<details class="lx-answer"><summary>Answer</summary><p>${esc(answer[k](it, s))}</p></details></li>`;
    }).join("\n") + "\n</ol>").join("\n") + '\n<ul class="lx-fp-foot lx-fp-notes">' + PJ.foot.map(n => `<li><b>${esc(n[0])}:</b> ${esc(n[1])}</li>`).join("") + "</ul>\n</div>";
}
const between = (a, b) => { const i = QMD.indexOf(a), j = QMD.indexOf(b); return i > 0 && j > i ? QMD.slice(i + a.length, j).trim() : null; };
if (process.argv.includes("--static")) {
  console.log("<!-- b3-static-lines -->\n" + staticLines() + "\n<!-- b3-static-key -->\n" + staticKey(M.instance(town, year)) + "\n<!-- b3-static-practice -->\n" + staticPractice()); process.exit(0);
}

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));

(async () => {
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports, highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const inst = M.instance(town, year), T = inst.T, ref = J.ref;
  const solve = bug => M.summarize(inst, core.solveWith(highs, M.buildModel(inst, bug)));
  // the practice runs: each key's model (bug and window) solved with HiGHS
  const PR = {};
  Object.keys(M.PRACTICE_RUN).forEach(k => { const i = M.practiceInst(town, year, J, k); PR[k] = M.summarize(i, core.solveWith(highs, M.buildModel(i, M.PRACTICE_RUN[k].bug))); });
  if (process.argv.includes("--ref")) {
    const out = {}; Object.keys(PR).filter(k => k !== "ok").forEach(k => { out[k] = M.toRef(PR[k]); });
    console.log(JSON.stringify(out)); process.exit(0);
  }

  // ---------------- data: four hours of lesson 0's day; the start is lesson 0's cheapest-first plan at 16:00
  {
    const W = G0.prepare(town, year, "lesson0"), plan = G0.expertPlan(W);
    T.forEach(t => ok(inst.d[t] === W.demand[t] && inst.a.wind[t] === W.wind[t] && inst.a.solar[t] === W.solar[t], `data: hour ${t} equals lesson 0's day`));
    ok(inst.start === plan[16].cc && plan[16].cc === 45, "data: the combined-cycle plant starts from lesson 0's 45 MW at 16:00");
    ok(JSON.stringify(ref.hours) === JSON.stringify(T), "data: hours 17-20");
    ok(inst.c.nuc === 10 && inst.c.cc === 40 && inst.c.pk === 100 && inst.cap.nuc === 100 && inst.cap.cc === 150 && inst.cap.pk === 100 && inst.ramp === 40, "data: Prairie Town's fleet");
  }

  // ---------------- the correct model
  const S = solve(null);
  {
    ok(S.ok && S.balanced && !S.overWeather, "correct: optimal, balanced every hour, within the weather");
    ok(near(S.objective, ref.objective) && near(S.trueCost, ref.objective), `correct: cost ${S.objective} = precomputed ${ref.objective}`);
    ok(near(S.objective, 4 * 100 * 10 + 40 * (75 + 115 + 145 + 130)), "correct: $22,600 = nuclear 4 × 100 × $10 + combined-cycle 465 MWh × $40");
    S.rows.forEach((x, k) => {
      ["nuc", "cc", "pk"].forEach(g => ok(near(x[g], ref.p[g][k]), `correct ${x.t}: ${g} ${x[g]} = precomputed ${ref.p[g][k]}`));
      ok(near(x.wind + x.solar, ref.p.wind[k] + ref.p.solar[k]), `correct ${x.t}: wind + solar ${x.wind + x.solar} = precomputed`);
      ok(near(x.u, ref.u[k]) && near(x.dual, ref.balanceDuals[k]), `correct ${x.t}: unserved 0 and balance dual ${x.dual} = ${ref.balanceDuals[k]}`);
      ok(x.dual >= -1e-9, `correct ${x.t}: balance dual ≥ 0`);
      const sum = ref.p.nuc[k] + ref.p.wind[k] + ref.p.solar[k] + ref.p.cc[k] + ref.p.pk[k] + ref.u[k];
      ok(sum === inst.d[x.t], `precomputed ${x.t}: the plants add up to demand (${sum})`);
      ok(ref.p.wind[k] <= inst.a.wind[x.t] && ref.p.solar[k] <= inst.a.solar[x.t], `precomputed ${x.t}: within the weather`);
    });
    ok(near(S.rows[0].curtailed, 10) && S.rows.slice(1).every(x => near(x.curtailed, 0)), "correct: 10 MW spilled at 17:00, none later");
    T.forEach((t, k) => { if (k) ok(Math.abs(ref.p.cc[k] - ref.p.cc[k - 1]) <= 40, `correct: ramp ${t}`); });
    ok(Math.abs(ref.p.cc[0] - inst.start) <= 40, "correct: ramp from 16:00");
    ok(ref.p.cc[1] - ref.p.cc[0] === 40, "correct: the climb from 17:00 to 18:00 uses the whole ramp (why 18:00 costs $80)");
    const D = S.duals;
    T.forEach(t => { ok(D["wx_wind_" + t] <= 1e-9 && D["wx_solar_" + t] <= 1e-9, `correct ${t}: weather-limit duals ≤ 0`);});
    ok(near(D.ramp_18, -40), "correct: ramp dual at 18:00 is −40 (a looser ramp saves $40)");
    // finite difference: one more MWh at 18:00 costs $80
    const inst2 = M.instance(town, year); inst2.d[18] += 1;
    const S2 = M.summarize(inst2, core.solveWith(highs, M.buildModel(inst2, null)));
    ok(near(S2.objective - S.objective, 80), `correct: +1 MWh at 18:00 adds $${S2.objective - S.objective}`);
    const inst3 = M.instance(town, year); inst3.d[17] += 1;
    ok(near(M.summarize(inst3, core.solveWith(highs, M.buildModel(inst3, null))).objective - S.objective, 0), "correct: +1 MWh at 17:00 adds $0 (spills less)");
    // the signs are these inputs' signs, not a law: two counterexamples with the same model
    { const a = M.instance(town, year); a.d[17] = 105; const b = M.instance(town, year); b.d[17] = 106;
      const Sa = M.summarize(a, core.solveWith(highs, M.buildModel(a, null))), Sb = M.summarize(b, core.solveWith(highs, M.buildModel(b, null)));
      ok(near(Sa.objective, 27900) && near(Sb.objective, 27760) && near(Sa.rows[0].dual, -140) && near(Sa.rows[0].nuc + Sa.rows[0].cc, 105), `counterexample: 17:00 demand of 105 MW (nuclear 100 + the plant's 5 MW floor): one more MWh saves $140, dual ${Sa.rows[0].dual}`); }
    { const c = M.instance(town, year, { start: 150 }), r = core.solveWith(highs, M.buildModel(c, null));
      ok(near(r.duals.ramp_17, 40) && near(M.summarize(c, r).rows[0].cc, 110), `counterexample: a 150 MW start forces the plant down only to 110 MW at 17:00; that ramp row's dual is +$40 (${r.duals.ramp_17})`); }
    ok(near(D.ramp_18, -40) && T.every(t => D["wx_wind_" + t] <= 1e-9) && /Upper limits, such as the weather limits and the ramp's climb, have duals ≤ 0/.test(JS) && /all ≥ 0 for these inputs/.test(JS), "step 7: upper limits ≤ 0, balance duals ≥ 0 for these inputs (said so)");
    ok(!/more demand can never make the cheapest plan cheaper/.test(JS + QMD), "no universal claim about dual signs");
    ok(!/forced above demand/.test(JS + QMD) && /extra demand can lower the cost across linked hours/i.test(QMD) && /Extra demand can lower the cost across linked hours/.test(JS) && /the least nuclear and the ramp allow/.test(QMD + JS), "the negative dual is explained by linked hours at the least output nuclear and the ramp allow (105 MW; 104 MW would be infeasible), not by output above demand");
    { const a = M.instance(town, year); a.d[17] = 104; ok(core.solveWith(highs, M.buildModel(a, null)).status === "infeasible", "below 105 MW at 17:00 the model is infeasible: output cannot exceed demand"); }
    has("“A balance dual can never be negative.”", "the myth on dual signs"); has("its dual becomes −$140", "the counterexample in the myth answer"); ok(/data-id="neg2" data-answer="myth"/.test(QMD), "the dual-sign myth is a myth");
  }

  // ---------------- the five suspects
  const sym = {};
  {
    const B = {}; ["unit", "sign", "index", "double", "lunch"].forEach(b => { B[b] = solve(b); sym[b] = M.symptom(b, B[b], S, inst); ok(B[b].ok, `${b}: the buggy model still solves to optimal`); });
    ok(B.unit.balanced && B.unit.rows.every(x => x.pk > 0) && B.unit.trueCost > S.trueCost && B.unit.objective < S.objective, "unit: the peaker runs every hour; reported cost falls, true cost rises");
    ok(near(B.unit.objective, 7836) && near(B.unit.trueCost, 43800), `unit: reports $7,836, really $43,800 (${B.unit.objective}, ${B.unit.trueCost})`);
    ok(!B.sign.balanced && B.sign.rows.every(x => x.supply < x.d) && near(B.sign.objective, 4200), `sign: short every hour, $4,200 (${B.sign.objective})`);
    ok(!B.index.balanced && B.index.rows[0].balanced && B.index.rows.slice(1).every(x => !x.balanced) && near(B.index.objective, 7600), "index: balanced at 17:00 only, $7,600");
    ok(B.double.balanced && near(B.double.objective, 40600) && near(B.double.trueCost, 22800) && B.double.rows.some(x => x.pk > 0), "double: reports $40,600; the plan really costs $22,800 and runs the peaker");
    ok(B.lunch.balanced && B.lunch.overWeather && near(B.lunch.objective, 10720), "lunch: wind above the weather, $10,720");
    ok(sym.unit.indexOf("$7,836") > 0 && sym.unit.indexOf("$43,800") > 0, "symptom text: unit");
    ok(sym.sign.indexOf("$4,200") > 0, "symptom text: sign");
    ok(sym.index.indexOf("$7,600") > 0 && sym.index.indexOf("17:00 balances") > 0, "symptom text: index");
    ok(sym.double.indexOf("$40,600") > 0 && sym.double.indexOf("$22,800") > 0 && sym.double.indexOf("$200 dearer") > 0 && sym.double.indexOf("$22,600") > 0, "symptom text: double: " + sym.double);
    ok(sym.lunch.indexOf("54–89 MW") > 0, "symptom text: lunch: " + sym.lunch);
    J.bugs.forEach(b => ok(J.lines[b.line] && b.html !== J.lines[b.line], `bugs: ${b.key} changes line ${b.line}`));
    ok(new Set(J.bugs.map(b => b.key)).size === 5, "bugs: five distinct planted errors");
    // the table on the page: what each bug looks like to the solver
    ["optimal, with the dearest plant running first", "optimal, with demand unmet in every hour", "optimal, balanced at 17:00 only", "optimal, cost far above a hand calculation", "optimal, wind above what the wind allowed"].forEach(s => has(s));
  }

  // ---------------- counts, units, sums
  {
    const N = M.counts(inst);
    ok(N.balance === 4 && N.size === 20 && N.weather === 8 && N.ramp === 8 && N.must === 4 && N.rows === 44 && N.variables === 24, "counts: 4 + 20 + 8 + 8 + 4 = 44 rows, 24 variables");
    const model = M.buildModel(inst, null);
    ok(model.variables.length === N.variables, "counts: the solver model has 24 variables");
    ok(model.variables.filter(v => v.ub !== undefined && v.ub !== Infinity).length === N.size, "counts: the 20 size rows are bounds in the solver model");
    const rowsInModel = model.constraints.reduce((a, c) => a + (c.lb !== undefined && c.ub !== undefined ? 2 : 1), 0);
    ok(rowsInModel === N.balance + N.weather + N.ramp + N.must, "counts: balance, weather, ramp (two-sided) and must-run rows");
    const U = J.units; ok(U.factors.map(f => f.answer).join(" × ") === "$/MWh × MW × h" && U.result === "$", "units: $/MWh × MW × h = $");
    const k = T.indexOf(19); ok(["nuc", "wind", "solar", "cc", "pk"].reduce((a, g) => a + ref.p[g][k], 0) === inst.d[19] && inst.d[19] === 331, "sums: the 19:00 column adds to 331 MW, the demand");
    ok(ref.p.cc.reduce((a, v) => a + v, 0) === 465, "sums: the cc row adds to 465 MWh");
    ok(JS.indexOf("rows and \" + N.variables") > 0 || JS.indexOf("N.rows") > 0, "js: row count comes from counts()");
    has("120: one row for each plant in each hour, 5 × 24", "the 24-hour count in the quiz");
    ok(5 * 24 === 120, "quiz: 5 × 24 = 120");
  }

  // ---------------- the page
  {
    has("$22,600"); has("75, 115, 145 and 130 MW"); has("$10,000/MWh"); has("45 MW"); has("3 September 2025");
    has("\\$40 + \\$40 = \\$80", "the $80 explanation"); has("spills 10 MW of wind and sun", "the 17:00 spill"); has("\\$0", "the $0 dual");
    has("the cost-optimal paths of a model, under the study's alternative assumptions", "the Trutnevyte wording");
    has("9 to 23%");
    ok(J.vv.filter(v => v.answer === 0).length === 3 && J.vv.length === 6, "vv: three verification, three validation");
    { const SC = fs.readFileSync(path.join(SITE, "learn/_w1/b03-read-check-formulation.yml"), "utf8");
      ok(/equations and code implement the intended model correctly/.test(JS) && /equations and code implement the intended model correctly/.test(QMD) && /equations and code implement the intended model correctly/.test(SC) && !/does what its equations say/.test(JS + QMD + SC), "verification compares the equations and code with the intended model (step 8, the fallback, the glossary)"); }
    ok(/text: "Σ over g adds down a column: every plant, one hour\. Tap the column for Σg p\(g,19\)\.",/.test(JS) && /Next, Σ over t adds along a row/.test(JS), "step 3 asks one thing at a time: the row task appears after the column");
    ok(J.blocks.map(b => b.key).join() === "sets,par,vars,obj,cons", "blocks: the reading sequence");
    ok(/−<i>R<\/i> Δ<i>t<\/i> ≤ .* ≤ <i>R<\/i> Δ<i>t<\/i>/.test(J.lines.ramp) && between("<!-- b3-static-lines:start -->", "<!-- b3-static-lines:end -->") === staticLines(), "ramp line: R Δt, so every side is in MW (data, and the fallback's generated lines)");
    ok(LN.every(k => J.lineWords[k] && J.lineTags[k]) && JSON.stringify(LN.map(k => J.lineTags[k])) === JSON.stringify(["data", "goal", "(1)", "(2)", "(3)", "(4)", "(5)"]) && /views: o\.onPick \? \["symbols"\] : \["symbols", "words"\]/.test(JS) && /tag: J\.lineTags\[k\]/.test(JS),
      "every line has words and one tag, the same with and without JavaScript; the read-only lines offer a words view");
    ok(J.legend.some(x => x[0] === "g ∈ G" && /belongs to the set of plants/.test(x[1])) && M.inputs(inst).some(r => r.sym === "<i>p<sub>g,t</sub></i>" && r.value === "chosen") && M.inputs(inst).some(r => r.sym === "<i>u<sub>t</sub></i>" && r.value === "chosen"), "the key defines p(g,t) and u(t) and reads g ∈ G aloud");
    ok(/line \(5\), “nuclear runs flat”/.test(J.practice.items.g2.right) && /<span class="b3-tag">\(5\)<\/span> <i>p<\/i><sub>nuc,<i>t<\/i><\/sub> ≤/.test(staticPractice()) && !/<ol class="b3-static">/.test(QMD), "the static practice names line (5) by its tag and name, as its list shows it (no 1-to-7 numbering)");
    { const K = M.inputs(inst), s16 = K.find(r => /cc,16/.test(r.sym));
      ok(s16 && s16.value === "45" && s16.unit === "MW" && /given, not chosen/.test(s16.name), "key: p(cc,16) = 45 MW, a given start");
      ok(K.find(r => r.sym === "<i>d<sub>t</sub></i>").value === "17:00 349, 18:00 344, 19:00 331, 20:00 319" && K.find(r => r.sym === "<i>V</i>").value === "10,000", "key: demand by hour and V from the model"); }
    ok(between("<!-- b3-static-key:start -->", "<!-- b3-static-key:end -->") === staticKey(inst), "page: the fallback's symbol key is the generated one (node ... --static)");
    ok(between("<!-- b3-static-practice:start -->", "<!-- b3-static-practice:end -->") === staticPractice(), "page: the static practice set is the generated one (node ... --static)");
    ok(J.vv.slice(3, 5).every(v => /SPP's own fleet|that year's fleet and fuel prices/.test(v.text)), "vv: the validation examples compare like with like");
  }

  // ---------------- the practice set
  {
    const PJ = J.practice, items = Object.keys(PJ.items);
    // tracks: nine exercises, each set worked -> partly worked -> from scratch; minutes add up to the page's total
    ok(PJ.tracks.length === 3 && PJ.tracks.every(t => t.items.map(k => PJ.items[k].kind).join() === "worked,partly,scratch"), "practice: three sets, each worked -> partly worked -> from scratch");
    ok(items.length === 9 && PJ.tracks.reduce((a, t) => a + t.items.length, 0) === 9 && /nine exercises in three sets/.test(PJ.title), "practice: nine exercises, as the title says");
    const minutes = items.reduce((a, k) => a + PJ.items[k].minutes, 0), quiz = 4;
    ok(minutes === 39, `practice: the exercises take about ${minutes} min (stated in the report: 39 + ${quiz} for the quick questions = ${minutes + quiz}, target 45)`);
    items.forEach(k => { const it = PJ.items[k]; ok(it.hints.length >= 2 && it.hints.length <= 3, `practice ${k}: two or three staged hints`); });

    // the fallback: every precomputed practice answer is HiGHS's, read back through fromRef
    Object.keys(PR).filter(k => k !== "ok").forEach(k => {
      const R = PJ.ref && PJ.ref[k], i = M.practiceInst(town, year, J, k);
      ok(!!R, `practice ref ${k}: precomputed (run with --ref)`);
      if (!R) return;
      const F = M.fromRef(i, R), S = PR[k];
      ok(near(F.objective, S.objective) && near(F.trueCost, S.trueCost), `practice ref ${k}: objective ${F.objective} = HiGHS ${S.objective}`);
      S.rows.forEach((x, j) => ok(M.G.every(g => near(F.rows[j][g], x[g])) && near(F.rows[j].u, x.u) && near(F.rows[j].dual, x.dual), `practice ref ${k} ${x.t}:00: outputs, unserved and dual = HiGHS`));
    });
    // the windows start where lesson 0's cheapest-first plan leaves the combined-cycle plant
    {
      const plan = G0.expertPlan(G0.prepare(town, year, "lesson0"));
      Object.keys(PJ.windows).forEach(w => { const W = PJ.windows[w]; ok(plan[W.hours[0] - 1].cc === W.start, `practice window ${w}: starts at lesson 0's ${W.start} MW at ${W.hours[0] - 1}:00`); });
      ok(PJ.foot.length === 3 && PJ.foot[1][0] === "Starting outputs" && PJ.foot[1][1].indexOf(`the ${PJ.windows.eve.start} MW and ${PJ.windows.dip.start} MW starts are lesson 0's cheapest-first plan at ${PJ.windows.eve.hours[0] - 1}:00 and ${PJ.windows.dip.hours[0] - 1}:00`) === 0 && PJ.foot.every(n => n[1].split(/\s+/).length <= 20), "practice foot: three short labelled notes (solver, the starts and their hours, what is illustrative)");
    }
    // the three new bugs: what each does, from HiGHS
    {
      const V = PR.vkwh, F = PR.flat, W = PR.twice, S0 = PR.ok;
      ok(V.balanced && V.rows.every(x => x.u > 0 && x.cc <= 5 + 1e-6 && near(x.dual, 10)) && near(V.objective, 8700), "vkwh: unserved every hour, combined-cycle at most 5 MW, duals $10, $8,700");
      ok(F.balanced && near(F.rows[0].nuc, 90) && F.rows.slice(1).every(x => near(x.nuc, 100)) && near(F.objective, 22500) && near(F.rows[0].dual, 10) && near(S0.rows[0].dual, 0), "flat: nuclear 90 MW at 17:00, $22,500, the 17:00 dual $0 -> $10");
      ok(!W.balanced && W.rows.every(x => near(x.d - (x.nuc + x.wind + x.solar + x.cc + x.pk + x.u), x.wind)) && near(W.objective, 11440), "twice: every hour short by exactly the wind output; the model reports $11,440");
      ok(J.lines.par.indexOf("(10, 0, 0, 40, 100) $/MWh") > 0 && PJ.bugs.vkwh.html.indexOf("(10, 0, 0, 40, 100) $/MWh") > 0 && inst.V / 1000 === 10, "vkwh: the line keeps the fleet's costs; V = 10 $/kWh = $10,000/MWh");
      ["vkwh", "flat", "twice"].forEach(b => ok(J.lines[PJ.bugs[b].line] && PJ.bugs[b].html !== J.lines[PJ.bugs[b].line], `practice bug ${b} changes line ${PJ.bugs[b].line}`));
      ok(J.lineNames[PJ.bugs.flat.line] === "nuclear runs flat" && ["par", "obj", "bal", "size", "wx", "ramp", "must"].indexOf("must") - 1 === 5, "flat: the hints' line (5) is “nuclear runs flat”");
    }
    // each exercise: answers from the model, every number in its texts from the model, and its checks
    const SP = {}; items.forEach(k => { SP[k] = M.practiceSpec(k, J, town, year, PR); });
    const nums = t => (String(t).replace(/<[^>]+>/g, "").match(/\d[\d,]*(\.\d+)?/g) || []).map(x => +x.replace(/,/g, ""));
    const texts = (k, extra) => { const it = PJ.items[k], s = SP[k], v = s.vars;
      const all = [].concat(s.hints, it.worked ? it.worked.map(w => M.fill(w[1], v)) : [], it.q ? [M.fill(it.q, v)] : [], it.choices ? it.choices.map(c => M.fill(c, v)) : [],
        it.reasons ? it.reasons.map(c => M.fill(c, v)) : [], ["right", "wrong", "oneSided", "whole", "symptom", "ask", "note", "title", "badPk", "badSupply", "badShort", "badDualCC", "badDual", "duals", "lineWrong", "rowsQ", "unitQ", "totalQ", "supplyQ", "shortQ", "dualQ"].filter(x => typeof it[x] === "string").map(x => M.fill(it[x], v)),
        it.bad && !Array.isArray(it.bad) ? Object.keys(it.bad).map(b => [].concat(it.bad[b]).map(t => M.fill(t, v))).flat() : [], extra || []);
      return all; };
    const allowed = (k, more) => { const v = SP[k].vars, set = new Set([0, 1, 2, ...(more || [])]);
      Object.keys(v).forEach(x => nums(v[x]).forEach(n => set.add(n))); return set; };
    const CONST = [10, 1000, 0.9, 24, 5];   // 10 $/kWh, 1,000 kWh per MWh, η like 0.9, a day of 24 hours, line (5)
    items.forEach(k => {
      const tx = texts(k);
      ok(tx.every(t => t.indexOf("{") < 0), `practice ${k}: every placeholder filled`);
      const A = allowed(k, CONST.concat(k === "g1" ? [7] : []));   // g1's hint points to step 7
      const stray = [].concat(...tx.map(nums)).filter(n => !A.has(n));
      ok(!stray.length, `practice ${k}: every number in its texts comes from the model (stray: ${stray.join(", ")})`);
    });
    // r1: the ramp line over a day
    ok(SP.r1.vars.rows === 8 && SP.r1.vars.rows24 === 48, "r1: 8 ramp rows for four hours, 48 for a day");
    ok(SP.r1.check(48).ok && !SP.r1.check(24).ok && SP.r1.check(24).why === PJ.items.r1.oneSided && !SP.r1.check(8).ok && SP.r1.check(NaN) === null, "r1: 48 passes, 24 is one-sided, 8 fails, blank waits");
    // r2: units of the storage line
    const R2 = { q: "MW", eta: "no unit", w: "MW", rows: 4 };
    ok(SP.r2.check(R2).ok && SP.r2.check(Object.assign({}, R2, { q: "MWh" })).why === PJ.items.r2.bad.q && SP.r2.check(Object.assign({}, R2, { eta: "MW" })).why === PJ.items.r2.bad.eta && /4 hours/.test(SP.r2.check(Object.assign({}, R2, { rows: 8 })).why) && SP.r2.check({ q: "MW" }) === null, "r2: MW, no unit, MW and 4 rows; each wrong part gets its reason");
    ok(PJ.units.indexOf("MW") >= 0 && PJ.units.indexOf("no unit") >= 0 && PJ.items.r2.ask.every(a => PJ.units.indexOf(a[2]) >= 0), "r2: every answer is one of the unit choices");
    // r3: the reserve line
    const R3 = { choice: 0, unit: "MW", rows: 24, total: 288 };
    ok(SP.r3.vars.rows4 === 44 && SP.r3.vars.rowsDay === 264 && SP.r3.vars.total === 288, "r3: 44 rows for four hours, 264 for a day, 288 with 24 reserve rows");
    ok(SP.r3.check(R3).ok && SP.r3.check(Object.assign({}, R3, { choice: 1 })).why === PJ.items.r3.bad.choice[1] && SP.r3.check(Object.assign({}, R3, { unit: "MWh" })).why === PJ.items.r3.bad.unit && !SP.r3.check(Object.assign({}, R3, { total: 264 })).ok, "r3: the right answers pass; wrong meaning, unit and total fail with reasons");
    // g1: the penalty in $/kWh
    ok(SP.g1.vars.uRange === "60–145" && SP.g1.vars.ccMax === 5 && SP.g1.vars.dual === 10 && SP.g1.vars.VmwhMoney === "$10,000" && SP.g1.vars.windN === 89, "g1: 60–145 MW unserved, combined-cycle at most 5 MW, duals $10, wind 89 MW at 20:00: " + JSON.stringify(SP.g1.vars));
    ok(near(PR.ok.rows[3].wind, 89) && near(PR.ok.rows[3].pk, 0) && PR.ok.rows.every(x => near(x.pk, 0) && near(x.nuc, 100)), "g1: the right model also uses all 89 MW of wind at 20:00, runs nuclear flat and the peaker never (the wrong choices' reasons)");
    ok(SP.g1.check(0).ok && [1, 2, 3].every(i => !SP.g1.check(i).ok && SP.g1.check(i).why === M.fill(PJ.items.g1.reasons[i], SP.g1.vars)) && SP.g1.check(null) === null, "g1: choice 0 passes, the others get their reasons");
    // g2: nuclear no longer flat
    ok(SP.g2.vars.obj === "$22,500" && SP.g2.vars.diff === "$100" && SP.g2.vars.nuc0 === 90 && SP.g2.vars.d0 === 0 && SP.g2.vars.d1 === 10, "g2: $22,500, $100 less, nuclear 90 MW, dual $0 -> $10");
    ok(SP.g2.check({ line: "must", choice: 2 }).ok && SP.g2.check({}).why === PJ.items.g2.noLine && /drop below 100 MW/.test(SP.g2.check({ line: "bal", choice: 2 }).why) && SP.g2.check({ line: "must", choice: 1 }).why === PJ.items.g2.bad[1] && SP.g2.check({ line: "must" }) === null, "g2: line (5) and the outputs check pass; others get reasons");
    ok(PR.flat.balanced && PR.flat.rows.length === 4, "g2: the balance does hold (the reason for choice 2)");
    { const f = M.instance(town, year); f.d[17] += 1; const Sf = M.summarize(f, core.solveWith(highs, M.buildModel(f, "flat")));
      ok(near(Sf.rows[0].nuc, 91) && near(Sf.objective - PR.flat.objective, 10) && SP.g2.vars.nuc1 === 91 && /raises nuclear from 90 to 91 MW, at \$10/.test(M.fill(PJ.items.g2.right, SP.g2.vars)), "g2: one more MWh at 17:00 raises nuclear from 90 to 91 MW and costs $10, as the reason says"); }
    // g3: wind counted twice
    ok(SP.g3.vars.supply === 259 && SP.g3.vars.short === 72 && SP.g3.vars.wind === 72 && SP.g3.vars.d === 331 && SP.g3.vars.u === 0, "g3: 259 MW against 331 at 19:00, 72 short = the wind");
    ok(SP.g3.check({ ran: false }).why === PJ.items.g3.run && SP.g3.check({ ran: true, supply: 259, short: 72, line: "bal" }).ok && !SP.g3.check({ ran: true, supply: 331, short: 0, line: "bal" }).ok &&
       !SP.g3.check({ ran: true, supply: 259, short: 72, line: "wx" }).ok && SP.g3.check({ ran: true, supply: 259, short: 72 }).why === PJ.items.g3.noLine, "g3: run first; 259, 72 and the balance line pass; a balanced reading or another line fails");
    // k1: three checks on the right solution
    ok(SP.k1.vars.sumParts === "100 + 72 + 14 + 145 + 0" && SP.k1.vars.sum === 331 && SP.k1.vars.nucE === 400 && SP.k1.vars.ccE === 465 && SP.k1.vars.total === "$22,600" && SP.k1.vars.duals === "$0, $80, $40 and $40", "k1: the worked checks: " + JSON.stringify(SP.k1.vars));
    ok(SP.k1.check(600).ok && SP.k1.check(1000).why === M.fill(PJ.items.k1.whole, SP.k1.vars) && !SP.k1.check(60).ok && SP.k1.vars.extra === "$600" && SP.k1.vars.save === "$400", "k1: +$600; $1,000 is the peaker's whole cost; $400 saved");
    { const i2 = M.instance(town, year); const m = M.buildModel(i2, null); m.constraints.push({ name: "pk19", terms: { p_pk_19: 1 }, eq: 10 });
      ok(near(M.summarize(i2, core.solveWith(highs, m)).objective - PR.ok.objective, 600), "k1: forcing 10 MW of peaker at 19:00 costs HiGHS exactly $600 more"); }
    // k2: the evening
    ok(SP.k2.vars.t0 === 18 && SP.k2.vars.tN === 21 && SP.k2.vars.sum === 344 && SP.k2.vars.nucCost === "$4,000" && SP.k2.vars.ccE === 485 && SP.k2.vars.ccCost === "$19,400" && SP.k2.vars.pkE === 10 && SP.k2.vars.pkCost === "$1,000" && SP.k2.vars.total === "$24,400", "k2: $4,000 + $19,400 + $1,000 = $24,400");
    ok(near(PR.eve.objective, 24400) && PR.eve.balanced && SP.k2.check({ pk: 1000, total: 24400 }).ok && !SP.k2.check({ pk: 100, total: 24400 }).ok && !SP.k2.check({ pk: 1000, total: 23400 }).ok, "k2: the solver agrees; wrong peaker cost or total fail");
    // k3: the solar dip
    ok(SP.k3.vars.t0 === 14 && SP.k3.vars.supply === 340 && SP.k3.vars.total === "$15,200" && SP.k3.vars.dual === 100 && SP.k3.vars.cc0 === 85 && SP.k3.vars.start + SP.k3.vars.ramp === 85, "k3: 340 MW, $15,200, a $100 dual, the plant at 45 + 40 = 85 MW");
    ok(SP.k3.check({ ran: true, supply: 340, total: 15200, dual: 100 }).ok && SP.k3.check({ ran: true, supply: 340, total: 15200, dual: 40 }).why === M.fill(PJ.items.k3.badDualCC, SP.k3.vars) && !SP.k3.check({ ran: true, supply: 340, total: 14200, dual: 100 }).ok && SP.k3.check({ ran: false }).why === PJ.items.k3.run, "k3: right answers pass; a $40 dual gets the ramp reason");
    { const i3 = M.practiceInst(town, year, J, "dip"); i3.d[14] += 1;
      ok(near(M.summarize(i3, core.solveWith(highs, M.buildModel(i3, null))).objective - PR.dip.objective, 100), "k3: one more MWh at 14:00 costs HiGHS exactly $100 (the dual)"); }
    // the page hosts the set; the JS builds every exercise
    ok(QMD.indexOf('<div id="b3-practice">\n<!-- b3-static-practice:start -->') > 0 && /host\.innerHTML = ""/.test(JS), "page: the practice host in the Check section holds the static set, which the runner replaces");
    items.forEach(k => ok(JS.indexOf(k + ": function") > 0, `js: the view builds exercise ${k}`));
  }

  console.log(`b03-read-check-formulation: ${checks - fails} of ${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
