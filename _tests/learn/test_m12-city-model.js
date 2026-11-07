// test_m12-city-model.js — Node tests for M12 (learn/m12-city-model.qmd, assets/learn/m12-city-model.js), on engine E3
// (its own tests: test_e3-engine.js). What it checks:
//   - the no-JS blocks: the lesson table (2025, electrify, electrify with flexibility, the LP's choice under an 80% cap)
//     and the inputs table, written from fresh runs; `precomputed.m12` in e3-city-hub.json (the table and the reference
//     numbers the notebook asserts) equals fresh runs
//   - every step's words against the engine: the busiest hours, the upgrades and the summed duals (the upgrade's yearly
//     cost), the upgrades flexibility saves, the LP's chosen shares and the cap's dual, for every cap the slider offers
//     (65% to 100%), and each "who adopts first" rule leaving the LP's cost and CO2 unchanged
//   - the prediction's answer: the suburbs' busiest electrified hour is on the cold winter design day, at night
//   - the page: the cards form, the notebook links, the formulation's symbols, the tie rule's numbers, the myth answers
//     true of the model; no nuclear term; no AI wording
// --write: recomputes `precomputed.m12` and writes the m12-static and m12-inputs blocks.
// Usage (from the site folder):  node _tests/learn/test_m12-city-model.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e3_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const QPATH = path.join(X.SITE, "learn/m12-city-model.qmd"), DPATH = X.L("data/e3-city-hub.json");
const RUN_DATE = "6 November 2026";

(async () => {
  const { E3, city, cfg, P, SS, solver, L } = await X.load();
  const PG = require(L("m12-city-model.js"));
  const S = E3.sb3Schema(cfg), DEF = SS.defaults(S);
  const run = async id => { const r = await E3.solve(Object.assign({}, DEF, PG.PLANS[id].state), P, { solver }); ok(r.ok, id + ": optimal"); return r.results; };
  const R = { today: await run("today"), electrify: await run("electrify"), flex: await run("flex") };
  R.flex.prev = R.electrify;
  const chooseAt = async cap => { const r = await E3.solve(Object.assign({}, DEF, PG.CHOOSE.base), P, { solver, size: true, cap: R.today.acc.co2Hub * cap / 100, retMax: PG.CHOOSE.retMax, dhMax: PG.CHOOSE.dhMax, pvMax: PG.CHOOSE.pvMax, batMax: PG.CHOOSE.batMax }); return r; };
  const c80 = await chooseAt(PG.CHOOSE.capDef);
  ok(c80.ok, "the LP's choice at 80%: optimal");
  const runs = ["today", "electrify", "flex"].map(k => ({ key: k, label: PG.PLANS[k].label, R: R[k] })).concat([{ key: "choose", label: "The LP's choice, CO₂ ≤ 80% of 2025", R: c80.results }]);
  const rows = PG.compareRows(runs).map(r => [r.name, PG.signedMil(r.cost), E3.kilo(r.co2) + " t", E3.kilo(r.up) + " MW", PG.pct1(r.burden)]);
  const table = E3.tableHTML(["Plan", "Yearly cost against 2025", "CO₂ of the districts (a year)", "Substation upgrades", "Burden, homes below 80% of AMI (screening)"], rows, "m12-table") +
    '<p class="lx-hint">Precomputed with HiGHS on ' + RUN_DATE + ". Cost includes the cars' fuel and charging, not their prices; equipment and upgrades as yearly payments.</p>";
  const ref = { runs: {} };
  runs.forEach(x => { ref.runs[x.key] = { peaks: x.R.dist.map(d => +d.peak.toFixed(3)), upg: x.R.dist.map(d => +d.upg.toFixed(3)), cost: Math.round(x.R.acc.total), co2: Math.round(x.R.acc.co2Hub), imp: Math.round(x.R.acc.imp), burdenLow: +x.R.hh.low.burden.toFixed(5), burdenOther: +x.R.hh.other.burden.toFixed(5) }; });
  ref.runs.choose.capDual = +c80.results.raw.capDual.toFixed(2);
  ref.runs.choose.hp = c80.results.acc.d.map(o => +o.share.hp.toFixed(4));
  ref.runs.choose.pvAdd = +c80.results.raw.sizes.pvAdd.toFixed(3);
  ref.runs.electrify.value = R.electrify.dist.map(d => +(d.value || 0).toFixed(2));
  ref.cap = PG.CHOOSE.capDef; ref.base = Math.round(R.today.acc.co2Hub);
  const pre = { table: table, ref: ref };
  const BLOCKS = { "m12-static": () => table, "m12-inputs": () => E3.inputsHTML(P) };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { m12: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    X.writeBlocks(QPATH, { "m12-static": BLOCKS["m12-static"](), "m12-inputs": BLOCKS["m12-inputs"]() });
    console.log("wrote precomputed.m12 and the m12-static and m12-inputs blocks");
  }
  const PAGE = fs.readFileSync(QPATH, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
  ok(JSON.stringify(D.precomputed && D.precomputed.m12) === JSON.stringify(pre), "precomputed.m12 equals fresh runs (run with --write after a change)");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
  const T = X.norm(PAGE), JS = fs.readFileSync(L("m12-city-model.js"), "utf8");
  const has = s => ok(T.indexOf(s) >= 0, "page states " + JSON.stringify(s));

  // ---------------- the steps' words
  const w0 = PG.words("today", R.today, P);
  ok(R.today.dist.every(d => d.upg < 1e-6 && d.peak <= d.limit) && R.today.dist.every(d => w0.indexOf(E3.kilo(d.peak) + " of " + E3.kilo(d.limit) + " MW") >= 0), "step 3: every substation within its limit, as said");
  ok(R.today.dist.every((d, i) => near(d.limit, Math.ceil(city.districts[i].peak2025MW * 1.15 / 10) * 10)), "each limit is 15% above the 2025 peak, rounded up to 10 MW, as said");
  const w1 = PG.words("electrify", R.electrify, P), up1 = PG.upTotal(R.electrify);
  ok(w1.indexOf(E3.kilo(up1) + " MW of upgrades") >= 0 && R.electrify.dist.filter(d => d.upg > 0.05).every(d => near(d.value, E3.sysOf(DEF, P).a.up, 1)), "step 4: upgrades and the summed duals = the upgrade's yearly cost");
  const sb = R.electrify.dist[1];
  ok(P.days[sb.at.k].design === true && (sb.at.h < 9 || sb.at.h > 17), "the prediction: the suburbs' busiest electrified hour is on the cold design day, at night or in the evening (" + sb.at.h + ":00)");
  ok(w1.indexOf("cold winter design day") >= 0, "step 4 says when");
  const w2 = PG.words("flex", R.flex, P), up2 = PG.upTotal(R.flex);
  ok(up2 < up1 && w2.indexOf(E3.kilo(up2) + " MW of upgrades, " + E3.kilo(up1 - up2) + " MW fewer") >= 0, "step 5: flexibility saves upgrades, as said (" + up1.toFixed(1) + " → " + up2.toFixed(1) + ")");
  // the cap slider: every value it offers solves, the words hold, the dual never falls as the cap tightens
  let lastDual = -1;
  for (let cap = PG.CHOOSE.capMax; cap >= PG.CHOOSE.capMin; cap -= PG.CHOOSE.capStep) {
    const r = await chooseAt(cap);
    ok(r.ok, "step 6 at " + cap + "%: optimal");
    if (!r.ok) continue;
    const Rc = r.results, wc = PG.chooseWords(Rc, cap), cd = Rc.raw.capDual;
    ok(Rc.acc.co2Hub <= R.today.acc.co2Hub * cap / 100 + 1, cap + "%: CO2 within the cap");
    ok(cd > 0.5 ? wc.indexOf("$" + E3.kilo(cd)) >= 0 && /binds/.test(wc) : /does not bind/.test(wc), cap + "%: the cap's words match its dual ($" + cd.toFixed(1) + ")");
    ok(cd >= lastDual - 0.5, cap + "%: the dual does not fall as the cap tightens"); lastDual = cd;
    ok(Rc.acc.d.every(o => wc.indexOf(PG.pct0(o.share.hp)) >= 0), cap + "%: the chosen heat-pump shares as said");
  }
  // step 7: the rule moves the household table only
  ["low", "high"].forEach(rule => {
    const src = c80.results, R2 = E3.summarize(Object.assign({}, src.state, { rule }), P, src.raw, src.base);
    ok(near(R2.acc.total, src.acc.total) && near(R2.acc.co2Hub, src.acc.co2Hub) && Math.abs(R2.hh.low.burden - src.hh.low.burden) > 1e-5, "step 7 (" + rule + "): the rule moves burden, not cost or CO2");
  });

  // ---------------- the page
  has("about 60 minutes, then 120 minutes of practice");
  ok(/notebooks\/m12-city-model\.ipynb/.test(PAGE) && fs.existsSync(path.join(X.SITE, "learn/notebooks/m12-city-model.ipynb")), "the notebook link and file");
  ok(/prairie-city\.json" download/.test(PAGE) && /e3-city-hub\.json" download/.test(PAGE), "both data files offered with the notebook");
  has("$" + cfg.tie.peak + " a year per MW of each district's busiest hour, $" + cfg.tie.cityPeak + " per MW of the three together");
  has("0.85");  ok(cfg.battery.rte === 0.85, "the battery's 85% in the formulation");
  ok(/q_\{dk,-1\} = q_\{dk,23\}/.test(PAGE), "storage cyclic within each day, as built");
  ok(/managed charging \(each day's charge in any hours of that day\)/.test(JS) && cfg.ev.minHours === 6, "managed charging as built");
  ["ev", "sto"].forEach(k => ok(JS.indexOf(k) >= 0, "uses " + k));
  ok(/accounting layer/.test(PAGE) && /not in the LP|never in the LP/.test(JS), "the household outputs are said to come from an accounting layer, not the LP");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(PAGE + JS), "no nuclear term");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS), "no AI wording");
  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (M12)");
  process.exit(fails ? 1 : 0);
})();
