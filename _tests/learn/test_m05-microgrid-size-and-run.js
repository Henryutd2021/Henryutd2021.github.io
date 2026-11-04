// test_m05-microgrid-size-and-run.js — Node tests for M5 (learn/m05-microgrid-size-and-run.qmd,
// assets/learn/m05-microgrid-size-and-run.js) on engine E1, with the vendored HiGHS. What it checks:
//   - the lesson's path, solved here as the steps solve it: the storm on a flat tariff with no export limit (step 3);
//     the tree on the sets (step 4); exports capped at 0 kW, then time-of-use, then time-of-use without the storm (step 5:
//     the words each case adds follow from the numbers, and the cost of carrying the hospital is a difference of two
//     solved plans); the check with whole sets and the ten drawn outages (step 6); the rolling horizon on four forecasts
//     (step 7); the no-JS table (m5-static, written by --write) holds these numbers
//   - the step texts' fixed numbers (1,200 kW, 72 hours from 00:00 on 20 January 2025, 675 gallons, 0.07 gallons per kWh,
//     the 30% minimum), the numbers to remember (40 of 72 hours, 0.0001%, 10.19 kg), the model's size
//   - the research text: the Real-world box quotes E8.3, E8.5, E8.6, E8.10 and the E8.7 note word for word, with the AMM
//     footer; the open code links the allow-listed repository
//   - the notebook exists, names the engine's data file and asserts the numbers of this table
//   - the W3 review fixes: the controller's rule stated (M5 1); forecast rows kept per plan (M5 2); the formulation's
//     every constraint group, unit and domain (M5 3); the check names the rounded plan and its cost (M5 4); the storm's
//     cost described as equipment and grid cost only (M5 5); the solar input as a teaching profile (M5 6); the
//     notebook claims what it asserts and uses milp only (M5 7); glossary marks (M5 8); one comparison a line (M5 9);
//     the tree keeps the reader's focus (M5 12)
// --write: writes the m5-static block.
// Usage (from the site folder):  node _tests/learn/test_m05-microgrid-size-and-run.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e1_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const QPATH = path.join(X.SITE, "learn/m05-microgrid-size-and-run.qmd"), NBPATH = path.join(X.SITE, "learn/notebooks/m05-microgrid-size-and-run.ipynb");
const APPROVED_SNAPSHOT = {
  "E8.3": "When each facility can install its own wind, solar and storage and trade energy with the grid, a candidate site's renewable resource affects its operating cost.",
  "E8.5": "Transactive energy, time-of-use tariffs and climate conditions played a critical role in locating factories, warehouses, wind turbines, solar photovoltaics and energy storage systems.",
  "E8.6": "Contrary to intuition, energy storage systems, which balance intermittent power and uncertain load, had limited benefits for cost saving.",
  "E8.10": "A mixed-integer model opens factories and warehouses, routes products and sizes each open site's wind, solar and storage, with an hourly energy balance and grid trade. Uncertain weekly store demand enters as a chance constraint with a set service level, written as its deterministic equivalent, so the model stays a mixed-integer linear program.",
  "E8.7": "Holds when: stylized networks with synthetic distances and costs, candidate sites in California, Arizona and Nevada, and one year, planned week by week for products and hour by hour for energy. Leaves out: grid outages, which the studies do not model." };

(async () => {
  const { E1, cfg, P, SS, solver, solveSync } = await X.load();
  const M = require(X.L("m05-microgrid-size-and-run.js"));
  const size = async c => { const r = await E1.solve(M.planOf(c), P, { solver, task: "size", check: false, scenarios: c.storm ? [P.scen.jan3] : [] }); ok(r.ok, M.caseLabel(c) + ": sized, optimal"); return r.results.sized; };
  // step 3 and the path of step 5
  const path5 = [{ exp: 2000, tar: "flat", storm: true }, { exp: 0, tar: "flat", storm: true }, { exp: 0, tar: "tou", storm: true }, { exp: 0, tar: "tou", storm: false }];
  const all = {}, words = [];
  const wordLists = [];
  for (const c of path5) { const z = await size(c); const w = M.caseWords(c, z, all); wordLists.push(w); words.push(w.join(" ")); all[M.caseKey(c)] = { c, sized: z }; }
  ok(Array.isArray(wordLists[3]) && wordLists.every(w => w.every(x => x.split(/\s+/).length <= 35)), "step 5: each comparison is its own short result, at most 35 words (M5 9): " + wordLists.map(w => w.map(x => x.split(/\s+/).length).join("+")).join(", "));
  ok(wordLists[0].length === 0 && /^Sized: [\d,]+ kW of solar, [\d,]+ kWh of battery, 2 sets, \$[\d,]+ a year/.test(M.sizedWords(all["open-flat-storm"].sized)), "step 5: the first case has nothing to compare; the summary names its sizes and cost");
  const A = all["open-flat-storm"].sized, B = all["x0-flat-storm"].sized, Cc = all["x0-tou-storm"].sized, Dn = all["x0-tou-none"].sized;
  ok(B.exact.pv < A.exact.pv - 100 && /solar goes from [\d,]+ to [\d,]+ kW, since midday sun the campus cannot use is wasted/.test(words[1]), "the export cap shrinks the solar (" + E1.kilo(A.exact.pv) + " → " + E1.kilo(B.exact.pv) + " kW): " + words[1]);
  ok(Cc.exact.bat > B.exact.bat + 500 && /the battery goes from [\d,]+ to [\d,]+ kWh/.test(words[2]), "time-of-use grows the battery (" + E1.kilo(B.exact.bat) + " → " + E1.kilo(Cc.exact.bat) + " kWh): " + words[2]);
  ok(/adds \$[\d,]+ a year of equipment and grid cost \(storm diesel not included\): two solved plans, not a price/.test(words[3]) && words[3].indexOf(E1.money(Cc.total - Dn.total)) >= 0 && Cc.total > Dn.total, "the storm's cost, two solved plans, equipment and grid only (M5 5): " + words[3]);
  ok(Dn.exact.gen === 0 && Cc.exact.gen >= 1 && A.exact.gen === 2, "sets: 2 on the flat tariff, " + Cc.exact.gen + " with time-of-use, none without the storm");
  // step 4: the tree
  const Tr = E1.bb.run(E1.sizeModel(M.planOf(path5[0]), P, [P.scen.jan3]), ["N"], m => solveSync(m));
  ok(E1.bb.proven(Tr) && near(Tr.inc.bound, A.objective, 1e-6 * A.objective) && Math.round(Tr.inc.x.N) === A.exact.gen, "the tree proves step 3's plan (" + Tr.branchings + " branching, " + Tr.solved + " LPs)");
  // step 6: the check of the last storm plan (time-of-use, exports capped), then the drawn outages
  const plan = M.planOf(path5[2]); plan.pv = Cc.rounded.pv; plan.bat = Cc.rounded.bat; plan.gen = Cc.rounded.gen;
  const chk = await E1.solve(plan, P, { solver, scenarios: [P.scen.jan3] }), o = chk.results.outages[0];
  ok(chk.ok && o.must < 0.5, "the check with whole sets and their 30% minimum carries the must-stay-on loads (" + E1.kilo(o.fuel) + " gallons)");
  const sd = await E1.solve(plan, P, { solver, scenarios: P.seeded }), nOk = sd.results.outages.filter(x => x.must < 0.5).length;
  ok(sd.ok && sd.results.outages.length === 10, "the ten drawn outages: optimal runs, " + nOk + " of 10 fully served");
  // step 7: the rolling horizon
  const rows = [];
  for (const f of cfg.forecasts) { const out = await E1.roll(plan, P, P.scen.jan3, f.key, m => solveSync(m, { gap: 1e-6 })); rows.push({ key: f.key, label: f.label, totals: out.totals }); }
  const rw = M.rollWords(rows), per = rows[0], worst = rows.slice(1).reduce((a, b) => a.totals.must >= b.totals.must ? a : b);
  ok(per.totals.must < 0.5 && worst.totals.must > 500 && rw.indexOf(E1.kilo(worst.totals.must - per.totals.must) + " kWh") >= 0, "what forecast error costs: " + rw);
  ok(/^Even with a perfect forecast this plan leaves 10 kWh/.test(M.rollWords([{ key: "perfect", label: "Perfect", totals: { must: 10 } }])), "rolling words: a plan short even with a perfect forecast is not called carried");
  ok(M.rollWords([per]).indexOf("Now try a real forecast") >= 0 && /Run the perfect forecast/.test(M.rollWords(rows.slice(1))), "the rolling words before both runs exist");
  // the no-JS table
  const z = s => E1.kilo(s.exact.pv) + " kW · " + E1.kilo(s.exact.bat) + " kWh · " + s.exact.gen + " set" + (s.exact.gen === 1 ? "" : "s");
  const tr = (a, b) => "<tr><td>" + a + '</td><td class="n">' + b + "</td></tr>";
  const html = '<table class="lx-facts"><thead><tr><th scope="col">Step</th><th scope="col">Result (2025 dollars, illustrative)</th></tr></thead><tbody>' +
    tr("Sized for the storm, flat tariff, no export limit", z(A) + ", " + E1.money(A.total) + " a year") +
    tr("Branch and bound on the sets", "the relaxation buys " + (Math.round(Tr.nodes[0].x.N * 1000) / 1000) + " sets; " + Tr.branchings + " branching and " + Tr.solved + " LPs prove " + A.exact.gen) +
    tr("Exports capped at 0 kW", z(B) + ", " + E1.money(B.total)) +
    tr("Then time-of-use", z(Cc) + ", " + E1.money(Cc.total)) +
    tr("Time-of-use without the storm", z(Dn) + ", " + E1.money(Dn.total) + ": the storm adds " + E1.money(Cc.total - Dn.total) + " a year of equipment and grid cost") +
    tr("The check: rounded up to the bench's steps, whole sets, 30% minimum", E1.kilo(plan.pv) + " kW · " + E1.kilo(plan.bat) + " kWh · " + plan.gen + " set" + (plan.gen === 1 ? "" : "s") + ", " + E1.money(chk.results.total) + " a year: " + E1.kilo(o.must) + " kWh of must-stay-on load unserved, " + E1.kilo(o.fuel) + " gallons (" + E1.fuelMoney(o.fuelCost) + ")") +
    tr("Ten drawn winter outages", "must-stay-on loads fully served in " + nOk + " of 10") +
    rows.map(r => tr("Rolling horizon (the stated controller), forecast “" + r.label.toLowerCase() + "”", E1.kilo(r.totals.must) + " kWh of must-stay-on load unserved")).join("") + "</tbody></table>";
  // the notebook's reference numbers (the data file's reference.m5; the notebook asserts against them)
  const ref = { cases: path5.map(c => { const s = all[M.caseKey(c)].sized; return { key: M.caseKey(c), exp: c.exp, tar: c.tar, storm: c.storm, pv: +s.exact.pv.toFixed(3), bat: +s.exact.bat.toFixed(3), gen: s.exact.gen, total: +s.total.toFixed(2) }; }),
    tree: { rootN: +Tr.nodes[0].x.N.toFixed(4), root: +Tr.nodes[0].bound.toFixed(2), branchings: Tr.branchings, lps: Tr.solved },
    plan: { pv: plan.pv, bat: plan.bat, gen: plan.gen }, check: { must: +o.must.toFixed(3), keep: +o.keep.toFixed(3), shed: +o.shed.toFixed(3), fuel: +o.fuel.toFixed(3) },
    seeded: { starts: P.seeded.map(s => s.start), hours: P.seeded.map(s => s.hours), must: sd.results.outages.map(x => +x.must.toFixed(3)) },
    roll: rows.map(r => ({ key: r.key, must: +r.totals.must.toFixed(3), keep: +r.totals.keep.toFixed(3), fuel: +r.totals.fuel.toFixed(3) })),
    note: "Written by node _tests/learn/test_m05-microgrid-size-and-run.js --write from engine E1 (HiGHS 1.15.4 in Node); the M5 notebook asserts against it." };
  if (process.argv.includes("--write")) {
    X.writeBlocks(QPATH, { "m5-static": html });
    const DP = X.L("data/e1-prairie-campus.json"), d = JSON.parse(fs.readFileSync(DP, "utf8")); d.reference = Object.assign({}, d.reference, { m5: ref });
    fs.writeFileSync(DP, JSON.stringify(d, null, 1) + "\n");
    console.log("wrote the m5-static block and reference.m5");
  }
  const DD = JSON.parse(fs.readFileSync(X.L("data/e1-prairie-campus.json"), "utf8"));
  ok(JSON.stringify(DD.reference && DD.reference.m5) === JSON.stringify(ref), "the data file's reference.m5 equals the engine's numbers (run with --write)");
  const PAGE = fs.readFileSync(QPATH, "utf8"), T = X.norm(PAGE), JS = fs.readFileSync(X.L("m05-microgrid-size-and-run.js"), "utf8");
  const blk = X.between(PAGE, "m5-static"); ok(blk && blk.text === html + "\n", "the m5-static block is up to date (run with --write)");

  // ---------------- fixed numbers in the steps and on the page
  ok(/1,200 kW of loads/.test(JS) && P.total === 1200, "step 1: 1,200 kW");
  // ---------------- the W3 review fixes
  ok(M.CONTROLLER.length === 3 && /shed must-stay-on loads come back first, then the sets go down to their minimum, the battery charges, the other loads come back, and only then is solar curtailed/.test(M.CONTROLLER[2]) &&
    /first the\s+\/\/ must-stay-on loads the plan shed come back|must-stay-on loads the plan shed come back \(the forecast/.test(fs.readFileSync(X.L("components/engine-e1.js"), "utf8")), "step 7 states the controller's rule, as the engine's realTime runs it (M5 1)");
  ok(/With this controller, forecast error costs this plan/.test(rw), "the forecast loss is said to hold for this controller (M5 1): " + rw);
  ok(M.planKey(plan) !== M.planKey(Object.assign({}, plan, { pv: plan.pv + 25 })) && /S0\.roll\[k\]\.plan !== pk\) delete S0\.roll\[k\]/.test(JS) && /x && x\.plan === pk/.test(JS) && /var plan = function \(\) \{ var c = currentPlan\(\)/.test(JS), "forecast rows are kept per plan and never compared across plans; step 7 runs step 6's plan (M5 2)");
  ["\\Delta t = 1", "q_{m,-1} = q_{m,23}", "q_{-1} = B", "o_t \\le L^{\\text{other}}", "s_t \\le \\sigma_t S", "c_t, d_t \\le B/4", "0 \\le S \\le 4{,}000", "$F$ is not sized", "\\$/kWh (EIA's ¢ ÷ 100)", "::: {.lx-scroll-x .m5-symbols}"].forEach(f => ok(PAGE.indexOf(f) >= 0, "the formulation states " + f + " (M5 3, C1 11)"));
  ok(/rounded up from the sizing's/.test(JS) && /"Rounded plan"/.test(JS) && /"Its annual cost", money\(R\.total\)/.test(JS), "step 6 names the rounded plan and its own annual cost (M5 4)");
  ok(T.indexOf("the extra equipment-and-grid cost of carrying the hospital") >= 0 && T.indexOf("what carrying the hospital costs") < 0 && T.indexOf("Storm diesel and refilling the tank, in the annual cost") >= 0, "the storm's cost is equipment and grid only, said so (M5 5)");
  ok(T.indexOf("Real:") < 0 && T.indexOf("illustrative campus output per kW of panels: SPP's observed 2025 hourly shape") >= 0 && T.indexOf("an assumed grid outage") >= 0, "solar as a teaching profile; the storm an assumed outage (M5 6)");
  ok(!/linprog/.test(PAGE) && !/linprog/.test(fs.readFileSync(path.join(X.SITE, "learn/path.yml"), "utf8")) && T.indexOf("The rolling horizon's totals are printed beside the browser's, with each real hour's physics asserted.") >= 0, "the notebook's claims: milp only; what is asserted and what is printed (M5 7)");
  ["transactive-energy", "chance-constraint", "service-level", "deterministic-equivalent", "cost-of-capital", "feeder"].forEach(id => ok(new RegExp('data-term="' + id + '"').test(PAGE + JS), "glossary mark: " + id + " (M5 8)"));
  ok(/<details class="m5-more">/.test(PAGE), "the research box shows one sentence and its boundary; the other three are collapsed (M5 9)");
  ok(/if \(had\) \{ var g = svgBox\.querySelector\('g\[data-id="' \+ id \+ '"\]'\); if \(g\) g\.focus\(\); \}/.test(JS), "the tree: focus returns to the picked node after the redraw (M5 12)");
  ok(/72 hours from 00:00 on 20 January 2025/.test(JS) && P.scen.jan3.hours === 72 && E1.when(P.scen.jan3, 0) === "20 Jan 00:00", "step 1: the storm's start and length");
  ok(/hospital \(300 kW\)/.test(JS) && /water and heating plant \(100 kW\)/.test(JS) && P.loads[0].kw === 300 && P.loads[1].kw === 100, "step 1: the must-stay-on loads");
  ok(/0\.07 gallons per kWh, at most the 675 gallons on site/.test(JS) && cfg.tech.gen.galPerKWh === 0.07 && M.BASE.fuel === 675, "step 2: fuel use and the tank");
  ok(/30% minimum/.test(JS) && cfg.tech.gen.minLoad === 0.3, "the 30% minimum");
  ok(T.indexOf("40 of 72 hours") >= 0 && P.scen.jan3.sun.filter(v => v === 0).length === 40, "numbers to remember: 40 of 72 storm hours without sun");
  ok(T.indexOf("0.0001%") >= 0 && /"e1-size", 1e-6/.test(fs.readFileSync(X.L("components/engine-e1.js"), "utf8")), "numbers to remember: the sizing's gap is 1e-6 = 0.0001%");
  ok(T.indexOf("10.19 kg") >= 0 && cfg.fuel.co2 === 10.19, "numbers to remember: 10.19 kg per gallon");
  ok(T.indexOf("the 675-gallon tank") >= 0 && T.indexOf("13.37¢/kWh") >= 0 && T.indexOf("5% cost of capital") >= 0 && cfg.owners.filter(x => x.key === "community")[0].rate === 0.05, "the data note's numbers");
  ok(cfg.rolling.every === 6 && /every 6 hours/.test(JS), "the rolling horizon re-plans every 6 hours");
  ok(/675 gallons, about 24 hours of two sets at full output/.test(JS) && Math.abs(675 / (400 * cfg.tech.gen.galPerKWh) - 24) < 0.5 && /runs at 60 kW or more/.test(JS) && 200 * cfg.tech.gen.minLoad === 60 && /400 kW in every hour of the storm/.test(JS), "the equation card's numbers: 675 gallons ≈ 24 hours of 400 kW, a 60 kW minimum, 400 kW must stay on");
  ok(/L\^\{\\text\{must\}\} \$ the must-stay-on load \(400 kW here\)|the must-stay-on load \(400 kW here\)/.test(T) && E1.kwOf(P, E1.classes(M.BASE, P).must) === 400, "Go deeper: 400 kW must stay on");
  ok(/\\\{0, 1, \\dots, 4\\\}/.test(PAGE) && cfg.limits.gen[1] === 4, "Go deeper: N from 0 to 4");

  // ---------------- the research text against the register
  const RP = X.portfolio(); let APP = APPROVED_SNAPSHOT;
  if (RP) {
    const reg = X.register(fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"), ["E8"]);
    const diff = Object.keys(APPROVED_SNAPSHOT).filter(k => reg[k] !== X.norm(APPROVED_SNAPSHOT[k]));
    ok(!diff.length, "the snapshot equals the register; differs at: " + diff.join(", "));
    APP = {}; Object.keys(APPROVED_SNAPSHOT).forEach(k => { APP[k] = reg[k]; });
  }
  const ex = X.excerpts(PAGE);
  ok(ex.length === 1 && ex[0].source === "excerpt:supply-chain-mg", "one excerpt block, excerpt:supply-chain-mg");
  const want = ["E8.3", "E8.5", "E8.6", "E8.10", "E8.7"].map(k => X.norm(APP[k]));
  ok(ex[0].sentences.length === want.length && ex[0].sentences.every((s, i) => s === want[i]), "E8.3, E8.5, E8.6, E8.10 and the E8.7 note, word for word and in order");
  ok(/Approved excerpt of: Li et al\. \(2023\), <a href="https:\/\/doi\.org\/10\.1016\/j\.apm\.2023\.02\.014">Applied Mathematical Modelling<\/a>\./.test(ex[0].footer), "the excerpt's footer");
  ok(/href="https:\/\/github\.com\/Henryutd2021\/supply-chain-microgrid-models"/.test(PAGE), "open code: the allow-listed repository");
  ok(!/outage/i.test(ex[0].sentences.slice(0, 4).join(" ")), "the quoted study sentences claim nothing about outages (E8.7 says the studies leave them out)");

  // ---------------- the notebook
  const NB = fs.existsSync(NBPATH) ? fs.readFileSync(NBPATH, "utf8") : "";
  ok(NB.length > 0, "the notebook exists");
  if (NB) {
    const src = JSON.parse(NB).cells.map(c => c.source.join("")).join("\n");
    ok(/e1-prairie-campus\.json/.test(src) && /scipy\.optimize/.test(src) && /milp/.test(src), "the notebook loads the engine's data and uses scipy.optimize.milp");
    ok(JSON.parse(NB).cells.every(c => c.cell_type !== "code" || (!c.outputs || !c.outputs.length)), "the notebook is stored without outputs");
    ["REF[\"cases\"]", "REF[\"tree\"]", "REF[\"check\"]", "REF[\"seeded\"]", "REF[\"roll\"]"].forEach(n => ok(src.indexOf(n) >= 0, "the notebook checks " + n));
    ok(/REF = D\["reference"\]\["m5"\]/.test(src), "the notebook reads the reference block from the data file");
  }
  console.log(`test_m05-microgrid-size-and-run: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
