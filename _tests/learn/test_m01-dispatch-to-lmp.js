// test_m01-dispatch-to-lmp.js — Node tests for M1 (assets/learn/m01-dispatch-to-lmp.js) with the vendored HiGHS, the
// same solver core the page runs in its Web Worker. What it checks, and what it does not:
//   - the day in the data file is lesson 0's day (grid-operator.js prepare() on town.json and town_year.json)
//   - part A (one bus, 24 h, ramp rule): cost, every hourly price, the step up and the step down at 19:00 and 14:00
//     (both equal the dual there) and the 14:00 recipe; 07:00 is a corner (step up $100, step down $80, dual $80);
//     without the ramp rule: cost and flat prices
//   - DC power flow: PTDFs of the triangle and the 90 MW transfer split; part B with 200 MW lines equals part A
//   - the slider: every position solves; where the noon line fills; the step up at noon at every bus equals the dual;
//     LMP = LMP_ref - PTDF x mu; congestion rent = load payments - generator payments = sum mu x flow, every hour
//   - the 110 MW case: prices, recipe, flows, mu, rent ($24,880 - $11,680 = $13,200, not the gap x flow $8,800), the
//     step down at noon at every bus, the 14:00 corner ($200 up, $80 down), the noon-only quiz (+1 MW limit at noon:
//     $120, Ridge +3 MW and gas -3 MW, nothing else moves; the all-day change differs) and the reference data block
//   - page text: chosen strings in learn/m01-dispatch-to-lmp.qmd (numbers and the corrected wordings) and the absence
//     of the wordings found wrong; fixed numbers in the step cards' script text; the sidecar's
//     glossary definitions; the notebook's asserted numbers. The step cards' other sentences are built at run time from
//     the solver's result, so they cannot drift; the rendered HTML and the page's interaction (stale-solve guard, Next
//     lock) are not exercised here: check them in the browser (the screenshot check).
// Usage (from the site folder):  node _tests/learn/test_m01-dispatch-to-lmp.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
const { core, VERSION } = ctx.module.exports;
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const M = require(L("m01-dispatch-to-lmp.js"));
const G0 = require(L("grid-operator.js"));
const D = JSON.parse(fs.readFileSync(L("data/m01-dispatch-to-lmp.json"), "utf8"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const PAGE = readOr(path.join(SITE, "learn/m01-dispatch-to-lmp.qmd"));
const NB = readOr(path.join(SITE, "learn/notebooks/m01-dispatch-to-lmp.ipynb"));
const SIDE = readOr(path.join(SITE, "learn/_w1/m01-dispatch-to-lmp.yml"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const has = (s, msg) => ok(PAGE.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (msg ? " (" + msg + ")" : ""));

(async () => {
  const highs = await loadHighs();
  const run = o => { const r = core.solveWith(highs, M.build(D, o)); return { r, day: M.read(D, o, r) }; };
  const bump = (o, base, bus, hour, eps) => M.recipe(D, base, core.solveWith(highs, M.build(D, Object.assign({}, o, { add: { bus, hour, mw: eps } }))), eps);

  // ---------------- the day is lesson 0's day
  const W = G0.prepare(town, year);
  ok(JSON.stringify(W.demand) === JSON.stringify(D.day.demand), "demand = lesson 0's prepared day");
  ok(JSON.stringify(W.wind) === JSON.stringify(D.day.wind) && JSON.stringify(W.solar) === JSON.stringify(D.day.solar), "wind and solar = lesson 0's day");
  ok(W.date === D.day.date && D.day.label === town.scenarios.lesson0.dateLabel, "date and label");
  ["nuclear", "wind", "solar"].forEach(k => ok(D.fleet[k].mw === town.fleet[k].mw && D.fleet[k].cost === town.fleet[k].cost, k + " = town.json"));
  ok(D.fleet.cc.mw === town.fleet.cc.mw && D.fleet.cc.cost === town.fleet.cc.cost && D.fleet.cc.ramp === town.fleet.cc.ramp && D.fleet.cc.start === town.scenarios.lesson0.startCC, "cc = town.json and lesson 0's start");
  ok(D.fleet.pk.mw === town.fleet.peaker.mw && D.fleet.pk.cost === town.fleet.peaker.cost, "peaker = town.json");

  // ---------------- part A: one bus
  const oA = { network: false }, A = run(oA);
  ok(A.r.status === "optimal" && A.r.kind === "lp", "part A: optimal LP");
  const sA = M.size(M.build(D, oA));
  ok(sA.vars === 120 && sA.rows === 48, `part A: 120 outputs and 48 rules (${sA.vars}, ${sA.rows})`);
  ok(near(A.day.cost, 104000), "part A: $104,000 (lesson 0's Go deeper optimum)");
  const want = { 7: 80, 8: 0, 13: 0, 14: 80, 17: 0, 18: 80 };
  A.day.hours.forEach(h => ok(near(h.price.T, want[h.t] != null ? want[h.t] : 40), `part A: price at ${h.t}:00 = ${h.price.T}`));
  ok(A.day.hours.every(h => h.gen.pk < 1e-6), "part A: the peaker makes nothing all day");
  const p19 = run({ network: false, add: { bus: "T", hour: 19, mw: 1 } });
  ok(near(p19.r.objective - A.r.objective, 40), "part A: +1 MWh at 19:00 costs $40 = the dual");
  const rc19 = M.recipe(D, A.r, p19.r, 1);
  ok(rc19.items.length === 1 && rc19.items[0].plant === "cc" && rc19.items[0].hour === 19 && near(rc19.items[0].d, 1), "part A: the gas combined-cycle plant makes the extra MWh at 19:00");
  const rc14 = bump(oA, A.r, "T", 14, D.lesson.eps);
  ok(near(rc14.fd, 80) && near(rc14.total, 80), `part A: 14:00 recipe costs $80 (${rc14.fd})`);
  // the page's recipe box shows both sides; at 19:00 and 14:00 they agree with the dual, at 07:00 they do not
  ok(near(bump(oA, A.r, "T", 14, -D.lesson.eps).fd, 80) && near(bump(oA, A.r, "T", 19, -D.lesson.eps).fd, 40), "part A: the step down at 14:00 ($80) and 19:00 ($40) equals the dual");
  ok(near(bump(oA, A.r, "T", 7, 1).fd, 100) && near(bump(oA, A.r, "T", 7, -1).fd, 80) && near(A.day.hours[7].price.T, 80), "part A: 07:00 is a corner: step up $100, step down $80, dual $80");
  const it = k => rc14.items.find(x => x.plant === k.p && x.hour === k.h);
  ok(it({ p: "cc", h: 13 }) && near(it({ p: "cc", h: 13 }).d, 1) && it({ p: "cc", h: 14 }) && near(it({ p: "cc", h: 14 }).d, 1) && it({ p: "ren", h: 13 }) && near(it({ p: "ren", h: 13 }).d, -1) && rc14.items.length === 3,
    "part A: 14:00 recipe = cc +1 at 13:00 and 14:00, wind and solar -1 at 13:00 " + JSON.stringify(rc14.items));
  ok(A.day.hours[13].spill > 0 && A.day.hours[8].spill > 0 && A.day.hours[17].spill > 0, "part A: wind and solar spilled at the $0 hours");
  const Aoff = run({ network: false, ramp: false });
  ok(near(Aoff.day.cost, 102600) && near(A.day.cost - Aoff.day.cost, 1400), "part A without the ramp rule: $102,600, $1,400 less");
  ok(Aoff.day.hours.every(h => near(h.price.T, 40)), "part A without the ramp rule: $40 every hour");

  // ---------------- DC power flow
  const P = M.ptdf(D);
  ok(near(P.RT.R, 2 / 3) && near(P.RG.R, 1 / 3) && near(P.GT.R, 1 / 3) && near(P.RT.G, 1 / 3) && near(P.RG.G, -1 / 3) && near(P.GT.G, 2 / 3) && P.RT.T === 0, "PTDFs of the triangle: 2/3 and 1/3 " + JSON.stringify(P));
  const tr = M.transfer(D, "R", "T", 90);
  ok(near(tr.RT, 60) && near(tr.RG, 30) && near(tr.GT, 30), "90 MW from Ridge to town: 60 direct, 30 via the Gas Hub");
  const oB = lim => ({ network: true, limit: lim });
  const sB = M.size(M.build(D, oB(110)));
  ok(sB.vars === 240 && sB.rows === 240, `part B: 240 variables, 240 rules at 110 MW (${sB.vars}, ${sB.rows})`);
  const B200 = run(oB(200));
  ok(near(B200.day.cost, 104000), "part B at 200 MW: $104,000, as part A");
  ok(B200.day.hours.every(h => near(h.price.T, h.price.R) && near(h.price.T, h.price.G) && near(h.price.T, A.day.hours[h.t].price.T)), "part B at 200 MW: three equal prices, as part A, every hour");
  let maxFlow = 0; B200.day.hours.forEach(h => D.lines.forEach(l => { maxFlow = Math.max(maxFlow, Math.abs(h.flow[l.id])); }));
  ok(Math.round(maxFlow) === 154 && maxFlow < 200, `part B at 200 MW: busiest line ${maxFlow.toFixed(2)} MW`);

  // ---------------- the slider
  const sl = D.lesson.slider;
  for (let v = sl.min; v <= sl.max; v += sl.step) {
    const x = run(oB(v));
    ok(x.r.status === "optimal", `slider ${v} MW: optimal`);
    const noon = x.day.hours[12];
    ok(noon.full.RT === (v <= 130), `slider ${v} MW: noon line full = ${noon.full.RT}`);
    D.buses.forEach(b => {
      const rc = bump(oB(v), x.r, b.id, 12, D.lesson.eps);
      ok(near(rc.fd, noon.price[b.id], 1e-4), `slider ${v} MW: finite difference at ${b.id} noon ${rc.fd} = dual ${noon.price[b.id]}`);
    });
    const dc = M.decompose(D, noon);
    D.buses.forEach(b => ok(near(dc[b.id].total, noon.price[b.id], 1e-6), `slider ${v} MW: LMP = LMP_ref - PTDF x mu at ${b.id}`));
    x.day.hours.forEach(h => { const rr = M.rent(D, h); ok(near(rr.rent, rr.viaMu, 1e-6) && near(rr.rent, rr.load - rr.gen, 1e-6), `slider ${v} MW, ${h.t}:00: rent ${rr.rent} = load ${rr.load} - generators ${rr.gen} = sum mu x flow ${rr.viaMu}`); });
  }
  const B = run(oB(110)), n12 = B.day.hours[12], R = D.reference;
  ok(near(B.day.cost, R.cost), `110 MW: cost ${B.day.cost}`);
  ["T", "R", "G"].forEach(b => ok(near(n12.price[b], R.price[b]), `110 MW noon price ${b} = ${n12.price[b]}`));
  ["RT", "RG", "GT"].forEach(l => ok(near(n12.flow[l], R.flow[l], 1e-6), `110 MW noon flow ${l} = ${n12.flow[l]}`));
  ok(near(n12.mu.RT, R.mu), `110 MW noon mu = ${n12.mu.RT}`);
  const rr12 = M.rent(D, n12);
  ok(near(rr12.rent, R.rent) && near(rr12.load, 24880) && near(rr12.gen, 11680), `110 MW noon rent $13,200 = loads $24,880 - generators $11,680 (${rr12.load}, ${rr12.gen})`);
  ok(near((n12.price.T - n12.price.R) * n12.flow.RT, 8800) && !near(8800, R.rent), "110 MW noon: the Ridge-Town price gap x flow ($8,800) is not the congestion rent");
  // the explain layer's annotation rebuilds load and generator payments from the reference block
  ok(near(R.price.T * D.day.demand[R.hour], rr12.load) && near(R.price.T * D.fleet.nuclear.mw + R.price.G * R.cc + R.price.R * R.ridge, rr12.gen), "reference block: load and generator payments as the annotation computes them");
  D.buses.forEach(b => ok(near(bump(oB(110), B.r, b.id, 12, -D.lesson.eps).fd, n12.price[b.id], 1e-4), `110 MW noon ${b.id}: step down = dual ${n12.price[b.id]} (no corner, the recipe box says both sides agree)`));
  ok(near(n12.gen.cc, R.cc) && near(n12.gen.wind + n12.gen.solar, R.ridge) && D.day.wind[12] + D.day.solar[12] === R.ridgeAvail, "110 MW noon: cc 92, Ridge 119 of 191");
  const fh = M.fullHours(B.day, "RT");
  ok(fh[0] === R.congestedHours[0] && fh[fh.length - 1] === R.congestedHours[1] && fh.length === 10, "110 MW: line full 09:00 to 18:00 " + fh);
  const rcT = bump(oB(110), B.r, "T", 12, D.lesson.eps);
  ok(rcT.items.length === 2 && rcT.items.some(i => i.plant === "cc" && near(i.d, 2)) && rcT.items.some(i => i.plant === "ren" && near(i.d, -1)), "110 MW noon town recipe: gas +2, Ridge -1 " + JSON.stringify(rcT.items));
  ok(M.recipeSum(rcT) === "2 × $40 − 1 × $0 = $80", "recipe in words: " + M.recipeSum(rcT));
  const h19 = B.day.hours[19];
  ok(!h19.full.RT && Math.round(h19.flow.RT) === 106 && near(h19.price.T, 40) && near(h19.price.R, 40), "110 MW at 19:00: 106 of 110 MW, one price $40");
  const B90 = run(oB(90));
  ok(near(B90.day.hours[16].price.T, 200) && near(B90.day.hours[16].price.G, 100) && B90.day.hours[16].gen.pk > 0, "90 MW at 16:00: the peaker sets $100 at the Gas Hub, $200 in town");

  // the quick question: 1 MW more limit for the noon interval only lowers the day's cost by mu = $120, by swapping
  // 3 MW of Gas Hub gas for Ridge power (each swapped MW adds 2/3 - 1/3 = 1/3 MW to the line); nothing else moves
  const mB = M.build(D, oB(110)); mB.constraints.find(c => c.name === "cap_RT_12").ub = 111;
  const rq = core.solveWith(highs, mB), qd = M.read(D, oB(110), rq).hours[12];
  ok(near(B.r.objective - rq.objective, 120), "110 MW: 1 MW more limit at noon only saves $120 (mu)");
  ok(near(P.RT.R - P.RT.G, 1 / 3), "quiz: swapping 1 MW of gas for Ridge power adds 1/3 MW to Ridge-Town");
  ok(near(qd.gen.wind + qd.gen.solar - (n12.gen.wind + n12.gen.solar), 3) && near(qd.gen.cc - n12.gen.cc, -3) && near(qd.gen.pk, n12.gen.pk) && near(qd.flow.RT, 111),
    `quiz: at noon Ridge +3 MW, gas -3 MW, line at 111 MW (${qd.gen.wind + qd.gen.solar}, ${qd.gen.cc}, ${qd.flow.RT})`);
  const moved = Object.keys(rq.values).filter(k => !/^th_/.test(k) && !/_12$/.test(k) && Math.abs(rq.values[k] - B.r.values[k]) > 1e-6);
  ok(moved.length === 0, "quiz: no other hour changes " + moved.join(" "));
  const B111 = run(oB(111));
  ok(near(B.r.objective - B111.r.objective, 1840), `quiz: the slider's all-day 111 MW saves $1,840, not $120, so the question names the noon interval (${B.r.objective - B111.r.objective})`);
  const B140 = run(oB(140));
  ok(!B140.day.hours[12].full.RT && Math.round(B140.day.hours[12].flow.RT) === 134 && near(B140.day.hours[12].price.R, B140.day.hours[12].price.T), "140 MW: noon line has room (134 MW), one price");
  // Go deeper: the 14:00 corner at 110 MW
  ok(near(B.day.hours[14].gen.cc, 150), "110 MW at 14:00: the gas combined-cycle plant at exactly 150 MW");
  ok(near(bump(oB(110), B.r, "T", 14, 0.1).fd, 200) && near(bump(oB(110), B.r, "T", 14, -0.1).fd, 80) && near(B.day.hours[14].price.T, 80), "110 MW at 14:00: +1 MWh costs $200, -1 saves $80, the dual is $80");
  // Go deeper: rent in money
  ok(D.day.demand[12] === 311 && near(n12.price.T, 80) && 311 * 80 === 24880 && D.fleet.nuclear.mw * 80 === 8000 && near(n12.gen.cc, 92) && 92 * 40 === 3680 && near(n12.gen.wind + n12.gen.solar, 119) &&
     24880 - 8000 - 3680 - 0 === 13200 && 120 * 110 === 13200, "rent arithmetic on the page (Go deeper table)");

  // ---------------- the page and the notebook state these numbers
  ["311 MWh × \\$80 | \\$24,880", "100 MWh × \\$80 | \\$8,000", "92 MWh × \\$40 | \\$3,680", "119 MWh × \\$0 | \\$0", "costs \\$200", "saves only \\$80", "134 MW",
   "$120 \\times 110$ MW", "($80 \\times 110 = \\$8{,}800$)", "\\$13,200 for the hour", "$13,200 at noon with the line at 110 MW"].forEach(s => has(s));
  // the corrected wordings: rent, the dual, the quiz, $0 offers, voltage, FTRs, MILP duals, RTO/ISO
  ["Congestion rent is what loads pay minus what generators are paid", "extra cost per MWh of a small change in that row's demand", "step up and the step down differ",
   "for the noon interval only", "2/3 − 1/3 = 1/3 MW", "3 MW of free Ridge power replace 3 MW of $40 gas", "the $80 matches no plant's offer",
   "holds voltage magnitudes fixed", "Many organized markets use congestion revenue to fund financial transmission rights",
   "does not provide these LP shadow prices", "prices conditional on them"].forEach(s => has(s));
  ["gap times the flow", "no plant offers either", "no duals at all", "Real markets pass it to", "Losses, voltage and reactive power", "RTO or ISO", "If its limit were 111 MW, noon"]
    .forEach(s => ok(PAGE.indexOf(s) < 0, "page no longer says " + JSON.stringify(s)));
  ok(SIDE.indexOf("holds voltage magnitudes fixed") >= 0 && SIDE.indexOf("ignores losses and voltage") < 0, "sidecar: DC power flow keeps voltage angles and fixed magnitudes");
  ok(SIDE.indexOf("What loads pay at their locational prices minus what generators are paid") >= 0, "sidecar: congestion rent = load payments - generator payments");
  // (the step cards' own sentences are built at run time from the solver's result, e.g. money(A.cost), so they cannot drift)
  ["$40", "$80", "$13,200", "$120", "2 × $40 − 1 × $0", "$200", "110 MW", "2/3", "1/3"].forEach(s => has(s));
  // fixed numbers in the step cards' text (assets/learn/m01-dispatch-to-lmp.js), each backed by a check above
  const JS = fs.readFileSync(L("m01-dispatch-to-lmp.js"), "utf8");
  [["120 outputs that obey all 48 rules", sA.vars === 120 && sA.rows === 48], ["At 19:00 the solver reports $40", near(A.day.hours[19].price.T, 40)],
   ["Now 14:00. The dual is $80 per MWh", near(A.day.hours[14].price.T, 80)], ["Ridge sends 90 MW to town", D.lesson.split.mw === 90],
   ["the $0 and $80 hours", A.day.hours.every(h => [0, 40, 80].indexOf(Math.round(h.price.T)) >= 0)], ["every line 200 MW", D.lines.every(l => l.limit === 200)],
   ["The nuclear plant makes 100 MW every hour", D.fleet.nuclear.mw === 100], ["at most 40 MW from one hour to the next; it starts the day from 115 MW", D.fleet.cc.ramp === 40 && D.fleet.cc.start === 115],
   ["1,000 MW per radian", D.lines.every(l => l.b === 1000)], ["running cost, $/MWh: 10, 0, 0, 40, 100", ["nuclear", "wind", "solar", "cc", "pk"].map(k => D.fleet[k].cost).join() === "10,0,0,40,100"],
   ["output before the day starts: 115 MW", D.fleet.cc.start === 115], ["SUB(\"cc,&minus;1\") + \"&nbsp;=&nbsp;115\"", D.fleet.cc.start === 115],
   ["a small rise in its demand, away from a corner of the model", true], ["in this hour only, would save", near(n12.mu.RT, R.mu)]]
    .forEach(([s, c]) => ok(JS.indexOf(s) >= 0 && c, "step text " + JSON.stringify(s) + " is in the script and true"));
  ok(NB.indexOf("104000") >= 0 && NB.indexOf("133160") >= 0 && NB.indexOf("[0, 40, 80]") >= 0, "notebook asserts the browser's numbers");
  ok(NB.indexOf("p_{\\\\text{cc},-1} = 115") >= 0 && NB.indexOf("not the price gap") >= 0, "notebook: ramp start condition and the rent wording");

  console.log(`${checks - fails} of ${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
