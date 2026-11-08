// test_m12-city-model.js — Node tests for M12 (learn/m12-city-model.qmd, assets/learn/m12-city-model.js), on engine E3
// (its own tests: test_e3-engine.js). What it checks:
//   - the no-JS blocks: the lesson table (2025, electrify, electrify with flexibility, the LP's choice under an 80% cap)
//     and the inputs table, written from fresh runs; `precomputed.m12` in e3-city-hub.json (the table and the reference
//     numbers the notebook asserts) equals fresh runs
//   - every step's words against the engine: the busiest hours, the upgrades and the summed duals (the upgrade's yearly
//     cost), the upgrades flexibility saves, the LP's chosen shares and the cap's dual, for every cap the slider offers
//     (65% to 100%), and each "who adopts first" rule leaving the LP's cost and CO2 unchanged
//   - the prediction's answer: the suburbs' busiest electrified hour is on the cold winter design day, at night
//   - the full-year check (data/e3-full-year.json, rebuilt by test_e3-full-year.js): the four plans' rows and words in the
//     explain layer and its no-JS table; every claim of the words true of the data (what holds, the short days, the plan
//     that misses most, step 6's cap); no full-year solve on the page
//   - the page: the cards form, the notebook links, the formulation's symbols, the tie rule's numbers, the myth answers
//     true of the model; no nuclear term; no AI wording
// --write: recomputes `precomputed.m12` and writes the m12-static, m12-full and m12-inputs blocks.
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
  const table = E3.tableHTML(["Plan", "Yearly cost against 2025", "CO₂ of the districts (a year)", "Substation upgrades", "Burden, homes below 80% of area median income (AMI; screening)"], rows, "m12-table") +
    '<p class="lx-hint">Precomputed with HiGHS on ' + RUN_DATE + ". Cost includes the cars' fuel and charging, not their prices; equipment and upgrades as yearly payments.</p>";
  const ref = { runs: {} };
  runs.forEach(x => { ref.runs[x.key] = { peaks: x.R.dist.map(d => +d.peak.toFixed(3)), upg: x.R.dist.map(d => +d.upg.toFixed(3)), cost: Math.round(x.R.acc.total), co2: Math.round(x.R.acc.co2Hub), imp: Math.round(x.R.acc.imp), burdenLow: +x.R.hh.low.burden.toFixed(5), burdenOther: +x.R.hh.other.burden.toFixed(5) }; });
  ref.runs.choose.capDual = +c80.results.raw.capDual.toFixed(2);
  ref.runs.choose.hp = c80.results.acc.d.map(o => +o.share.hp.toFixed(4));
  ref.runs.choose.pvAdd = +c80.results.raw.sizes.pvAdd.toFixed(3);
  ref.runs.electrify.value = R.electrify.dist.map(d => +(d.value || 0).toFixed(2));
  ref.cap = PG.CHOOSE.capDef; ref.base = Math.round(R.today.acc.co2Hub);
  // the notebook's own plan (its last section, with district heat): its household result, so the notebook can check
  // its district-heat billing against the browser's
  const MY = { hp: 70, ret: 40, dh: 30, dhp: 100, sto: 800, ev: 60, evm: "managed", pv: 100, bat: 20 }, rMy = await E3.solve(Object.assign({}, DEF, MY), P, { solver });
  ok(rMy.ok && rMy.results.hh.dhPrice > 0, "the notebook's plan runs, with district heat billed at its average cost");
  ref.my = { plan: MY, burdenLow: +rMy.results.hh.low.burden.toFixed(5), dhPrice: +rMy.results.hh.dhPrice.toFixed(2) };
  const pre = { table: table, ref: ref };
  const FY = JSON.parse(fs.readFileSync(L("data/e3-full-year.json"), "utf8")), FYc = city.fullYear, FE = PG.fullEntries(FY);
  const fullHTML = () => E3.tableHTML(["Full-year check: plan", "Yearly cost against 2025, no penalty on unserved energy: eight days → full year", "CO₂ gap", "Upgrades: eight days → sized on the year", "Unserved with the eight days' upgrades"],
    FE.map((e, i) => E3.fullPlanRow(e, PG.fullLabel(e, i))), "e3-fullt", [null, "n", "n", "n", "n"]) + '<p class="lx-hint">Precomputed with HiGHS on ' + FY.date + ": each plan run again on all 8,760 hours of 2025, with what its eight days decided kept. On the year, step 6's plan is " +
    E3.kilo(FE[3].year.co2 - FE[3].cap) + " t over the CO₂ cap it was chosen under.</p>";
  const BLOCKS = { "m12-static": () => table, "m12-full": fullHTML, "m12-inputs": () => E3.inputsHTML(P, { fixed: true }) };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { m12: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    X.writeBlocks(QPATH, { "m12-static": BLOCKS["m12-static"](), "m12-full": BLOCKS["m12-full"](), "m12-inputs": BLOCKS["m12-inputs"]() });
    console.log("wrote precomputed.m12 and the m12-static, m12-full and m12-inputs blocks");
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

  // ---------------- the full-year check
  ok(FE.every(Boolean) && FE.map(e => e.page + "/" + e.id).join() === "sb3/today,sb3/electrify,m12/flex,m12/choose", "the four plans' checks: 2025 and electrify (the City Planner's presets), flexibility and the LP's choice");
  ok(["today", "electrify", "flex"].every((k, i) => FE[i].key === SS.encode(S, Object.assign({}, DEF, PG.PLANS[k].state))) && FE[3].cap === Math.round(R.today.acc.co2Hub * PG.CHOOSE.capDef / 100), "each check is of the lesson's own plan (step 6's at its 80% cap of " + E3.kilo(FE[3].cap) + " t)");
  ok(FE.every((e, i) => e.days.dCost === Math.round((i < 3 ? R[["today", "electrify", "flex"][i]] : c80.results).delta.cost / 1e3) / 1e3), "the check's eight-day costs are the lesson's own runs");
  const keys = PG.fullKeys(FY, FYc, E3), kt = keys.map(k => k[0] + ": " + k[1]).join(" ");
  const up = V => V.dist.reduce((t, d) => t + d.upg, 0), worst = FE.reduce((a, e) => e.year.unserved > a.year.unserved ? e : a, FE[0]);
  ok(FE.every(e => up(e.days) < 0.5 || (e.year.unserved >= 0.5 && e.year.shortDays.length > 0 && e.year.shortDays.every(d => d.day === "2025-02-19" || d.day === "2025-02-20"))) && /every plan that buys upgrades leaves load unserved on 19 or 20 February/.test(kt), "every plan that buys upgrades leaves load unserved on 19 or 20 February (" + FE.map(e => e.year.shortDays.map(d => d.day.slice(8)).join("+") || "none").join(", ") + "), as said");
  ok(worst === FE[2] && kt.indexOf("so the plan with managed charging and batteries misses most: " + E3.kilo(worst.year.unserved) + " MWh") >= 0 && FE[2].days.batteryMW === 40, "the plan with managed charging and batteries misses most (" + E3.kilo(worst.year.unserved) + " MWh), as said");
  ok(FE[3].year.co2 > FE[3].cap && kt.indexOf(E3.kilo(FE[3].year.co2 - FE[3].cap) + " t over the cap") >= 0, "step 6's plan: over its cap on the year by " + E3.kilo(FE[3].year.co2 - FE[3].cap) + " t, as said");
  ok(keys.length === 6 && ["The check", "What holds", "Three cold days", "The grid", "Step 6's cap", "Not tested"].every((k, i) => keys[i] && keys[i][0] === k), "the card's keys, one idea each");
  ok(FE.every(e => Math.abs(e.year.cost / e.days.cost - 1) < 0.001 && Math.abs(e.year.co2 / e.days.co2 - 1) < 0.001) && /cost and CO₂ hold; the upgrades the eight days buy fall a little short on 19 or 20 February/.test(T) && FE[3].year.co2 > FE[3].cap, "the explain layer: cost and CO2 hold (within 0.1%); the upgrades fall a little short on 19 or 20 February; the no-JS table says step 6's plan ends over its cap");
  ok(/e3_full_year/.test(JS) && /e3-full-year\.json/.test(PAGE) && !/fullYear\s*\(/.test(JS), "the page reads the data file and never solves the year");
  has("Storage resets every day, on the eight days and in the full-year check: no carrying heat or charge between days.");
  ok(!/no full-year check here/.test(PAGE), "the old 'no full-year check here' is gone");

  // ---------------- the page
  has("about 60 minutes, then 120 minutes of practice");
  ok(/notebooks\/m12-city-model\.ipynb/.test(PAGE) && fs.existsSync(path.join(X.SITE, "learn/notebooks/m12-city-model.ipynb")), "the notebook link and file");
  const NB = fs.readFileSync(path.join(X.SITE, "learn/notebooks/m12-city-model.ipynb"), "utf8");
  ok(NB.indexOf('MY = dict(DEFAULT, hp=70, ret=40, dh=30, dhp=100, sto=800, ev=60, evm=\\"managed\\", pv=100, bat=20)') >= 0 && /REF\[\\"my\\"\]/.test(NB) && /city_planner_link/.test(NB), "the notebook's plan is the one in precomputed.m12.ref.my, checked against it; it prints the City Planner link");
  ok(/weight against constraints/.test(NB) && /Now remove the day itself/.test(NB), "practice 1 separates a day's weight from its constraints");
  ok(/prairie-city\.json" download/.test(PAGE) && /e3-city-hub\.json" download/.test(PAGE), "both data files offered with the notebook");
  ok(PAGE.indexOf("<td>Each district's busiest hour</td><td class=\"n\">$" + cfg.tie.peak + " a year per MW</td>") >= 0 && PAGE.indexOf("together</td><td class=\"n\">$" + cfg.tie.cityPeak + " per MW</td>") >= 0 &&
    T.indexOf("$" + cfg.tie.wear + " per MWh") >= 0 && T.indexOf("$" + cfg.tie.storeWear.toFixed(2) + " per MWh") >= 0 && T.indexOf("$" + cfg.tie.ev.toFixed(2) + " per MWh") >= 0, "the tie costs as a table, from the data");
  has("under $30 a year, in the engine's test");
  has("0.85");  ok(cfg.battery.rte === 0.85, "the battery's 85% in the formulation");
  ok(/q_\{dk,-1\} = q_\{dk,23\}/.test(PAGE), "storage cyclic within each day, as built");
  ok(/managed charging \(each day's charge in any hours of that day\)/.test(JS) && cfg.ev.minHours === 6, "managed charging as built");
  ["ev", "sto"].forEach(k => ok(JS.indexOf(k) >= 0, "uses " + k));
  ok(/accounting layer/.test(PAGE) && /not in the LP|never in the LP/.test(JS), "the household outputs are said to come from an accounting layer, not the LP");
  // the details, one by one
  ok(/\[d = \\text\{core\}\]\\, pl_\{kh\}/.test(PAGE) && /hp_\{kh\} \+ boil_\{kh\} \+ so_\{kh\} - si_\{kh\}/.test(PAGE) && /sym\("pl"/.test(JS) && /tag: "heat network \(core\)"/.test(JS) && cfg.dh.plant.cop === 3 && cfg.dh.loss === 0.1,
    "the balance carries the heat network's plant power, and the network has its own heat balance");
  ["out", "in", "sig", "pl", "net"].forEach(k => ok(new RegExp("sym\\(\"" + k + "\"").test(JS) && new RegExp("(^|[\\s{,])\"?" + k + "\"?: \\{ name").test(JS), "equation card: " + k + " is a symbol with its words"));
  // step 8 reads every row with the rule chosen in step 7
  const cr = PG.compareRows(runs, "low", (Rr, rule) => E3.summarize(Object.assign({}, Rr.state, { rule }), P, Rr.raw, Rr.base));
  ok(cr.every((r, i) => r.rule === "low" && near(r.cost, runs[i].R.delta.cost) && near(r.co2, runs[i].R.acc.co2Hub)) && cr.some((r, i) => Math.abs(r.burden - runs[i].R.hh.low.burden) > 1e-5), "the comparison uses step 7's rule for every row; cost and CO2 unchanged");
  ok(/Who adopts first, for every row's burden/.test(JS), "the comparison names the rule above the table");
  ok(/fixed here at the defaults/.test(BLOCKS["m12-inputs"]()) && !/ranges you set/.test(PAGE) && /fixed here at their defaults/.test(PAGE), "the teaching costs: their defaults shown, and where they can be changed");
  ok(/rounded up to the next 10 MW/.test(JS) && !/15% above/.test(JS + PAGE.replace(/<!-- m12-inputs:start[\s\S]*m12-inputs:end -->/, "")), "the limits: 2025 peak x 1.15, rounded up to the next 10 MW");
  ok(/an illustrative curve, 144 ÷ \(45 − T\), through DOE's challenge target/.test(JS) && /resistance backup \(1\) assumed below −23 °C/.test(JS), "the COP: an illustrative curve anchored to DOE's target");
  ok(/\[\[building-envelope\|envelope\]\]/.test(JS) && /\[\[retrofit\|/.test(JS) && /\[\[district-heating\|district heat\]\]/.test(JS) && /\[\[energy-burden\|/.test(JS) && /\[\[area-median-income\|/.test(JS), "terms marked at first use");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(PAGE + JS), "no nuclear term");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS), "no AI wording");
  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (M12)");
  process.exit(fails ? 1 : 0);
})();
