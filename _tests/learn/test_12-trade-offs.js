// test_12-trade-offs.js — Node tests for lesson 12 (assets/learn/12-trade-offs.js, data/12-trade-offs.json) and every
// number that learn/12-trade-offs.qmd states. The plans' years and the frontier come from the shared planning engine of
// lessons 12 and 13 (assets/learn/components/planengine.js, LX.townPlan), solved here with the vendored HiGHS.
//   - the six plans: each precomputed year matches a fresh solve; every light stays on
//   - dominance: exactly plan E is dominated, and D beats it on both counts
//   - weighted sums: the winners A, B, D, F and their price breakpoints; C (not dominated) never wins at any price
//   - step 2's task (see all four winners) and the cheapest-plan myth (A wins only below the first breakpoint)
//   - the epsilon-constraint and the price route meet: a cap's shadow price, used as a price, lands near the cap's point,
//     or further along a nearly straight piece; the printed $85.2 is re-solved exactly as printed; uneven spacing
//   - wording guards: seven-week estimates, F's gas backup, E's spill base, matching-CO2 comparison in step 3
//   - the fallback table, the myths and the quick question
// Usage (from the site folder):  node _tests/learn/test_12-trade-offs.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
const { core, VERSION } = sctx.module.exports;
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const TP = require(L("components/planengine.js"));
const M = require(L("12-trade-offs.js"));
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const cfg = JSON.parse(fs.readFileSync(L("data/13-capstone.json"), "utf8"));
const t12 = JSON.parse(fs.readFileSync(L("data/12-trade-offs.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const page = fs.readFileSync(path.join(SITE, "learn/12-trade-offs.qmd"), "utf8");
const JS = fs.readFileSync(L("12-trade-offs.js"), "utf8");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
// one price year (W4 carry-over): the data note, as lesson 13 and M3 state it, with the deflator's ratio from the data
const PF = cfg.deflator.index[String(cfg.priceYear)] / cfg.deflator.index[String(cfg.techs.battery.source.dollarYear)];
ok(page.indexOf("<b>Price year:</b> " + cfg.priceYear + " dollars throughout; NREL's " + cfg.techs.battery.source.dollarYear + " battery costs are converted with BEA's GDP implicit price deflator (×" + PF.toFixed(4) + ").") > 0 &&
   page.indexOf("without conversion") < 0, "data note: one price year, with the deflator (as lesson 13 and M3)");
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const musd = v => "$" + (v / 1e6).toFixed(1) + "M", kt = v => Math.round(v / 1e3).toLocaleString("en-US") + " kt";
const onPage = (s, what) => ok(page.includes(s), `page states ${what}: "${s}"`);

(async () => {
  const highs = await loadHighs();
  const solve = (m) => core.solveWith(highs, m, { timeLimit: 600 });
  const Y = TP.prepareYear(year, T, cfg, pctx.module.exports.townProfile), RW = TP.selectWeeks(Y, cfg.weeks), per = TP.periodsOf(RW), C = TP.costs(cfg, {});
  const plans = t12.plans.map(p => ({ id: p.id, label: p.label, cost: p.result.cost, co2: p.result.co2, spilled: p.result.spilled, plan: p.plan }));
  const by = {}; plans.forEach(p => { by[p.id] = p; });

  // ---------------- each plan's year
  t12.plans.forEach(p => {
    const plan = Object.assign({ wind: 0, solar: 0, cc: 0, pk: 0, nuc: 0, bp: 0, be: 0 }, p.plan);
    const r = solve(TP.weekModel(C, RW, { plan })), s = TP.summarize(C, per, r, { plan });
    ok(r.ok && Math.abs(s.cost - p.result.cost) <= 1 && Math.abs(s.co2 - p.result.co2) <= 1 && near(s.spilledShare, p.result.spilled, 1e-4), `plan ${p.id}: ${musd(s.cost)}, ${kt(s.co2)} (precomputed year matches a fresh solve)`);
    ok(s.unserved === 0, `plan ${p.id}: every hour served`);
  });

  // ---------------- dominance and weighted sums
  const DOM = M.dominated(plans), W = M.winners(plans, t12.priceMax), BIG = M.winners(plans, 1e7);
  ok(DOM.join() === "E", "exactly one dominated plan: E");
  ok(by.D.cost < by.E.cost && by.D.co2 < by.E.co2, `D beats E on both counts: ${musd(by.E.cost - by.D.cost)} less, ${kt(by.E.co2 - by.D.co2)} less`);
  ok(W.intervals.map(w => w.id).join() === "A,B,D,F", "as the price rises the winner moves A, B, D, F");
  const bp = W.intervals.map(w => w.to);
  ok(near(bp[0], 53.0, 0.05) && near(bp[1], 64.0, 0.05) && near(bp[2], 166.1, 0.05), `breakpoints $${bp.slice(0, 3).map(x => x.toFixed(1)).join(", $")} a tonne (F's, $166.1, with the battery in 2025 dollars)`);
  ok(BIG.never.join() === "C,E" && M.supported(plans).join() === "A,B,D,F", "C and E never win at any price; A, B, D, F are supported");
  let cWins = false; for (let p = 0; p <= 1e5; p += p < 1000 ? 0.5 : 50) if (M.winner(plans, p).id === "C") cWins = true;
  ok(!cWins, "scan: C wins at no price from $0 to $100,000 a tonne");
  ok(M.slope(by.B, by.C) > M.slope(by.B, by.D), "C lies above the straight line from B to D (a dent)");
  ok(M.winner(plans, 70).id === "D", "at $70 a tonne D wins (the demo state)");
  // step 2's task: see every winner; the slider's $5 steps reach each of them
  ok(M.toSee(plans, t12.priceMax).join() === "A,B,D,F", "step 2 asks for four winners: A, B, D, F");
  const onSlider = {}; for (let p = 0; p <= t12.priceMax; p += t12.priceStep) onSlider[M.winner(plans, p).id] = true;
  ok(Object.keys(onSlider).sort().join() === "A,B,D,F", "every winner appears at some slider step");
  ok(/Slide the price until you have seen " \+ target\.length \+ " different winners/.test(JS) && /Winners seen: /.test(JS), "step 2 states the task and shows progress");
  // the cheapest-plan myth: A stays the pick only below the first breakpoint (not only at a zero price)
  ok(M.winner(plans, 10).id === "A" && M.winner(plans, Math.round(bp[0]) + 1).id !== "A", "A wins at $10 a tonne and loses above $" + Math.round(bp[0]));
  onPage(`plan A stays the pick only while CO₂ is priced below $${Math.round(bp[0])} a tonne`, "the cheapest-plan myth");
  // plan F names its gas backup; the spill share names its base
  ok(/gas backup/.test(by.F.label) && t12.plans.find(p => p.id === "F").plan.cc > 0, "plan F's label names its gas backup");
  onPage("Plan F: 600 MW wind, 200 MW solar, a 100 MW / 400 MWh battery, and 300 MW of combined-cycle gas plus 80 MW of peakers as backup", "plan F's plants in the fallback");
  const pE = t12.plans.find(p => p.id === "E").plan;
  ok(!pE.wind && !pE.nuc && pE.solar > 0 && /" farm spills "\) \+ fm\.pct\(e\.spilled, 0\) \+ " of what "/.test(JS) && !/of its output, mostly solar/.test(JS), "E's spill is a share of what its solar farm could make (E has no wind or nuclear)");
  // fallback table
  const rb = bp.map(Math.round);
  const notes = { A: "cheapest at no carbon price", B: `wins between $${rb[0]} and $${rb[1]} a tonne`, C: "not dominated, but no carbon price picks it", D: `wins between $${rb[1]} and $${rb[2]} a tonne`,
                  E: "dominated: D costs less and emits less", F: `wins above $${rb[2]} a tonne` };
  ok(rb[0] === 53 && rb[1] === 64 && rb[2] === 166, "fallback notes: $53, $64, $166");
  plans.forEach(p => onPage(`<tr><td>${p.id} · ${p.label}</td><td>${musd(p.cost)}</td><td>${kt(p.co2)}</td><td>${notes[p.id]}</td></tr>`, `the fallback row for ${p.id}`));
  onPage(`Plan C (${musd(by.C.cost)}, ${kt(by.C.co2)})`, "plan C in Go deeper");
  // quick question
  const dc = by.D.cost - by.B.cost, de = by.B.co2 - by.D.co2;
  onPage(`Plan B costs ${musd(by.B.cost)} a year and emits ${kt(by.B.co2)}; plan D costs ${musd(by.D.cost)} and emits ${kt(by.D.co2)}`, "the quick question");
  onPage(`D costs ${musd(dc)} more and emits ${kt(de)} less`, "the quick answer");
  ok(Math.round(dc / de) === 64, `quick answer: ${(dc / de).toFixed(1)} $/t, about $64`);

  // ---------------- cap and price meet (step 4, Go deeper, myth)
  const pts = cfg.frontier.points, at = c => pts.find(p => p.cap === c), free = pts.find(p => p.cap == null);
  const priced = price => TP.summarize(C, per, solve(TP.weekModel(C, RW, { price })), {});
  const d200 = +at(200).dual.toFixed(1), p200 = priced(d200);   // the printed price, exactly as the page states it
  ok(Math.abs(p200.co2 - 200e3) <= 0.01 * 200e3 && Math.abs(p200.cost - at(200).cost) <= 0.002 * at(200).cost, `a $${d200} price lands at ${kt(p200.co2)}, ${musd(p200.cost)}: next to the 200 kt cap's point`);
  onPage(`A 200 kt cap has $\\lambda^* = \\$${d200}$ per tonne; a \\$${d200} price with no cap lands at ${kt(p200.co2)} and \\$${musd(p200.cost).slice(1)}`, "the duality example (the printed price, re-solved)");
  onPage(`A 200 kt cap has a shadow price of $${d200} a tonne; that price, with no cap, lands at ${kt(p200.co2)}`, "the myth");
  // every capped point with a usable dual lands within 3% of its cap or on the same straight piece
  pts.filter(p => p.cap != null && p.cap >= 25 && p.dual > 0.5).forEach(p => {
    const s = priced(p.dual), close = Math.abs(s.co2 - p.co2) <= Math.max(5e3, 0.03 * p.co2);
    const lo = pts.filter(q => q.dual != null && q.cap > 0 && Math.abs(q.dual - p.dual) / p.dual < 0.01).map(q => q.co2);
    ok(close || (lo.length > 1 && s.co2 >= Math.min(...lo) - 2e4 && s.co2 <= Math.max(...lo) + 2e4), `cap ${p.cap} kt: its price lands at ${kt(s.co2)}`);
  });
  // straight piece between 500 and 400 kt, and uneven spacing
  ok(Math.abs(at(500).dual - at(400).dual) < 1 && near(at(400).dual, 44, 0.5), `500 and 400 kt share a slope of about $44 ($${at(500).dual.toFixed(2)}, $${at(400).dual.toFixed(2)})`);
  const a44a = priced(at(500).dual), a44b = priced(at(400).dual);
  ok(Math.round(at(500).dual) === 43 && Math.round(at(400).dual) === 44 && a44a.co2 > 380e3 && a44a.co2 < 510e3 && a44b.co2 > 380e3 && a44b.co2 < 510e3 && Math.abs(a44a.co2 - a44b.co2) > 1e4,
     `prices near $44 ($${at(500).dual.toFixed(2)}, $${at(400).dual.toFixed(2)}) land far apart on the piece: ${kt(a44a.co2)} and ${kt(a44b.co2)}`);
  const p43 = priced(43), p45b = priced(45);
  onPage(`the slope barely changes ($${at(500).dual.toFixed(1)} to $${at(400).dual.toFixed(1)} a tonne), so prices from $43 to $45 move the plan from ${kt(p43.co2)} to ${kt(p45b.co2)}`, "the nearly straight piece");
  ok(p43.co2 - p45b.co2 > 100e3, "a $2 change in price moves the plan more than 100 kt");
  const p45 = priced(45), p220 = priced(220);
  ok(p45.co2 < 400e3 && p45.co2 > 300e3 && Math.abs(p220.co2 - 100e3) < 5e3 && Math.round(free.co2 / 1e3) === 792, `uneven spacing: $45 -> ${kt(p45.co2)}, $220 -> ${kt(p220.co2)}, no price -> ${kt(free.co2)}`);
  onPage("up to $45 a tonne moves the plan from 792 kt to below 400 kt; from $45 to $220 it moves only to 100 kt", "uneven spacing");
  // at each hand-made plan's CO2 the cheapest plan costs less (step 3's saw; straight lines between solved caps lie above
  // the true frontier, so this is a safe test); the old claim that every solved plan lies below and left is gone
  plans.forEach(p => { const f = TP.frontierAt(pts, p.co2); ok(f == null || f < p.cost, `the frontier at ${kt(p.co2)} (${f == null ? "outside" : musd(f)}) is below plan ${p.id}`); });
  ok(/At the CO₂ of each hand-made plan, the solver's cheapest plan costs less/.test(JS) && !/Every solved plan lies below and left/.test(JS), "step 3's feedback compares at matching CO2");
  ok(at(700).cost > by.A.cost, "why: the 700 kt solution costs more than plan A, so not every solved plan is below and left");
  // the chart calls the traced line approximate; the plan note gives cost and plants in separate sentences
  ok(/shadeLabel: "out of reach \(approximately\)"/.test(JS) && /solved caps joined by straight lines/.test(JS), "the traced frontier is labelled as straight lines between solved caps");
  ok(/" a year\. It builds wind "/.test(JS), "the plan note puts cost and plants in separate sentences");
  // every plan's year is an estimate from seven representative weeks, said where the plans appear
  onPage("yearly estimates from seven representative weeks of 2025", "the fallback says seven weeks");
  onPage("it estimates each plan's year from seven representative weeks, and a full-year check is separate", "the data note says seven weeks");

  console.log(`test_12-trade-offs: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
