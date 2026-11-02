// test_12-trade-offs.js — Node tests for lesson 12 (assets/learn/12-trade-offs.js, data/12-trade-offs.json) and every
// number that learn/12-trade-offs.qmd states. The plans' years and the frontier come from lesson 13's model
// (assets/learn/13-capstone.js), solved here with the vendored HiGHS.
//   - the six plans: each precomputed year matches a fresh solve; every light stays on
//   - dominance: exactly plan E is dominated, and D beats it on both counts
//   - weighted sums: the winners A, B, D, F and their price breakpoints; C (not dominated) never wins at any price
//   - the epsilon-constraint and the price route meet: a cap's shadow price, used as a price, lands on the cap's point,
//     or on the same straight piece of the frontier; the Go deeper claims about straight pieces and uneven spacing
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
const TP = require(L("13-capstone.js"));
const M = require(L("12-trade-offs.js"));
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const cfg = JSON.parse(fs.readFileSync(L("data/13-capstone.json"), "utf8"));
const t12 = JSON.parse(fs.readFileSync(L("data/12-trade-offs.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const page = fs.readFileSync(path.join(SITE, "learn/12-trade-offs.qmd"), "utf8");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
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
  ok(near(bp[0], 52.9, 0.05) && near(bp[1], 63.8, 0.05) && near(bp[2], 163.8, 0.05), `breakpoints $${bp.slice(0, 3).map(x => x.toFixed(1)).join(", $")} a tonne`);
  ok(BIG.never.join() === "C,E" && M.supported(plans).join() === "A,B,D,F", "C and E never win at any price; A, B, D, F are supported");
  let cWins = false; for (let p = 0; p <= 1e5; p += p < 1000 ? 0.5 : 50) if (M.winner(plans, p).id === "C") cWins = true;
  ok(!cWins, "scan: C wins at no price from $0 to $100,000 a tonne");
  ok(M.slope(by.B, by.C) > M.slope(by.B, by.D), "C lies above the straight line from B to D (a dent)");
  ok(M.winner(plans, 70).id === "D", "at $70 a tonne D wins (the demo state)");
  // fallback table
  const notes = { A: "cheapest at no carbon price", B: "wins between $53 and $64 a tonne", C: "not dominated, but no carbon price picks it", D: "wins between $64 and $164 a tonne",
                  E: "dominated: D costs less and emits less", F: "wins above $164 a tonne" };
  ok(Math.round(bp[0]) === 53 && Math.round(bp[1]) === 64 && Math.round(bp[2]) === 164, "fallback notes: $53, $64, $164");
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
  const p200 = priced(at(200).dual);
  ok(Math.abs(p200.co2 - 200e3) <= 0.01 * 200e3 && Math.abs(p200.cost - at(200).cost) <= 0.002 * at(200).cost, `a $${at(200).dual.toFixed(1)} price lands at ${kt(p200.co2)}, ${musd(p200.cost)}: the 200 kt cap's point`);
  onPage(`a 200 kt cap has $\\lambda^* = \\$${at(200).dual.toFixed(1)}$ per tonne, and a \\$${at(200).dual.toFixed(1)} price with no cap lands at 200 kt and \\$${musd(at(200).cost).slice(1)}`, "the duality example");
  onPage(`A 200 kt cap has a shadow price of $${at(200).dual.toFixed(1)} a tonne`, "the myth");
  // every capped point with a usable dual lands within 3% of its cap or on the same straight piece
  pts.filter(p => p.cap != null && p.cap >= 25 && p.dual > 0.5).forEach(p => {
    const s = priced(p.dual), close = Math.abs(s.co2 - p.co2) <= Math.max(5e3, 0.03 * p.co2);
    const lo = pts.filter(q => q.dual != null && q.cap > 0 && Math.abs(q.dual - p.dual) / p.dual < 0.01).map(q => q.co2);
    ok(close || (lo.length > 1 && s.co2 >= Math.min(...lo) - 2e4 && s.co2 <= Math.max(...lo) + 2e4), `cap ${p.cap} kt: its price lands at ${kt(s.co2)}`);
  });
  // straight piece between 500 and 400 kt, and uneven spacing
  ok(Math.abs(at(500).dual - at(400).dual) < 0.5 && near(at(400).dual, 40, 0.5), `500 and 400 kt share a slope of about $40 ($${at(500).dual.toFixed(2)}, $${at(400).dual.toFixed(2)})`);
  const a397 = priced(39.7), a3973 = priced(at(400).dual);
  ok(a397.co2 > 380e3 && a397.co2 < 505e3 && a3973.co2 > 380e3 && a3973.co2 < 505e3 && Math.abs(a397.co2 - a3973.co2) > 1e4, `prices near $39.7 land at different ends of the piece: ${kt(a397.co2)} and ${kt(a3973.co2)}`);
  onPage("a price near $39.7 can land anywhere on that piece", "the straight piece");
  const p40 = priced(40), p220 = priced(220);
  ok(p40.co2 < 400e3 && p40.co2 > 300e3 && Math.abs(p220.co2 - 100e3) < 5e3 && Math.round(free.co2 / 1e3) === 792, `uneven spacing: $40 -> ${kt(p40.co2)}, $220 -> ${kt(p220.co2)}, no price -> ${kt(free.co2)}`);
  onPage("up to $40 a tonne moves the plan from 792 kt to below 400 kt; from $40 to $220 it moves only to 100 kt", "uneven spacing");
  // the frontier lies below every hand-made plan (step 3's saw)
  plans.forEach(p => { const f = TP.frontierAt(pts, p.co2); ok(f == null || f < p.cost, `the frontier at ${kt(p.co2)} (${f == null ? "outside" : musd(f)}) is below plan ${p.id}`); });

  console.log(`test_12-trade-offs: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
