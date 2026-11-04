// test_c1-keep-the-campus-running.js — Node tests for capstone C1 (learn/c1-keep-the-campus-running.qmd,
// assets/learn/c1-keep-the-campus-running.js), on engine E1. What it checks:
//   - the no-JS blocks: the plan's table (C1's schema defaults), the default plan's precomputed results (`precomputed.c1`
//     in the data file, equal to a fresh run), the note's outline (LX.ReportNote.outlineHTML of the page's fields), the
//     exemplars (LX.Exemplars.staticHTML) and the rubric (LX.Rubric.staticHTML)
//   - the research text: every excerpt sentence is an approved register row, word for word (E8.2 and its E8.7 note,
//     E9.1-E9.3); E9 carries no citation and no link; E8's footer cites the AMM paper by DOI
//   - the strong exemplar quotes the engine's numbers for the plan Size it for me gives from the defaults, and the
//     owners' comparison; the owners' words follow from their numbers; the sensitivity line from the run
//   - the brief: the decision, Hand in, From, Done when, the time (90 minutes as 35 + 35 + 20); the capstone's sections
//   - the W3 review fixes: the brief's critical loads reported whatever their priorities (C1 2); each owner's row prices
//     the rounded plan it shows (C1 4); no claim of heated dorms (C1 5); the cost's boundary and the storm's diesel in
//     the note (C1 6); the strong note is a complete short note (C1 7); the rubric's communication line (C1 1); the
//     notebook step names section 8 (C1 10); the no-JS route is a reading exercise with the sized plan's numbers (C1 12)
// --write: recomputes `precomputed.c1` and writes the five marker blocks.
// Usage (from the site folder):  node _tests/learn/test_c1-keep-the-campus-running.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e1_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const QPATH = path.join(X.SITE, "learn/c1-keep-the-campus-running.qmd"), DPATH = X.L("data/e1-prairie-campus.json");
const APPROVED_SNAPSHOT = {
  "E8.2": "From the course author's research: in the modeled supply chains, each open factory or warehouse could run its own microgrid, with on-site wind, solar and storage, an energy balance every hour, and energy bought from and sold to the grid.",
  "E8.7": "Holds when: stylized networks with synthetic distances and costs, candidate sites in California, Arizona and Nevada, and one year, planned week by week for products and hour by hour for energy. Leaves out: grid outages, which the studies do not model.",
  "E9.1": "In an industry internship, the course author worked on this question: how should solar PV, battery storage and backup generation be sized for an industrial campus to meet demand through grid outages?",
  "E9.2": "The work used a techno-economic optimization model to size a resilient microgrid for the campus.",
  "E9.3": "The company's data, models and results are confidential and are not shown here." };

(async () => {
  const { E1, cfg, P, SS, solver } = await X.load();
  const C = require(X.L("c1-keep-the-campus-running.js"));
  const EX = require(X.L("components/exemplars.js")), RB = require(X.L("components/rubric.js")), RN = require(X.L("components/reportnote.js"));
  const S = E1.makeSchema({ key: "c1", title: "C1 plan", defaults: { pd: "must", out: ["jan3"] } }), def = SS.defaults(S);
  // the default plan (F7's sizes, the dorms must stay on), the storm and its lengths
  const run = await E1.solve(def, P, { solver, scenarios: C.scenarios(E1, P, "run") });
  ok(run.ok && run.results.outages.length === 4 && run.results.outages[0].sc.id === "jan3", "the default plan's run: the storm and three other lengths, optimal");
  const R0 = run.results, L0 = C.lengthsOf(R0);
  ok(P.loads.slice(0, 3).map(l => l.key).join() === "hospital,water,dorms", "the brief's critical loads are the engine's first three (C.crit sums perLoad 0 to 2)");
  // the plan Size it for me gives from the defaults, its run, and each owner's cheapest plan, rounded up and run
  const sz = await E1.solve(def, P, { solver, task: "size", check: false, scenarios: [P.scen.jan3] });
  const rs = await E1.solve(sz.results.plan, P, { solver, scenarios: C.scenarios(E1, P, "run") });
  const owners = [];
  for (const ow of cfg.owners) {
    const s2 = Object.assign({}, def, { own: ow.key }); const q = await E1.solve(s2, P, { solver, task: "size", check: false, scenarios: [P.scen.jan3] }); ok(q.ok, ow.key + ": sized, optimal");
    const qr = await E1.solve(q.results.plan, P, { solver, scenarios: [P.scen.jan3] }); ok(qr.ok, ow.key + ": its rounded plan runs, optimal");
    owners.push({ owner: ow, sized: q.results.sized, plan: qr.results.plan, total: qr.results.total, crit: C.crit(qr.results.outages[0]), R: qr.results });
  }
  const RS = rs.results, Ls = C.lengthsOf(RS), payS = C.paidBy(E1, P, RS);
  const rows0 = [["Plan", E1.kilo(R0.plan.pv) + " kW of solar · " + E1.kilo(R0.plan.bat) + " kWh battery · " + R0.plan.gen + " sets of 200 kW · " + E1.kilo(R0.plan.fuel) + " gallons; hospital, water and heat, dorms must stay on"],
    ["Annual cost: equipment and upkeep plus the normal-year grid bill on 12 average days (2025 dollars, illustrative; outage diesel not included)", E1.money(R0.total)], ["The year's bill with nothing built", E1.money(R0.base)],
    ["Critical load unserved in the 72-hour storm (hospital, water and heat, dorms)", E1.kilo(C.crit(R0.outages[0])) + " kWh (" + E1.kilo(R0.outages[0].fuel) + " gal of diesel, " + E1.fuelMoney(R0.outages[0].fuelCost) + "; " + (R0.outages[0].co2 / 1000).toFixed(1) + " t CO₂)"],
    ["The same plan if the storm lasts 1, 2, 3 or 4 days", L0.map(x => E1.kilo(x.crit)).join(" · ") + " kWh unserved"],
    ["CO₂ from grid electricity in a normal year", E1.kilo(R0.year.co2) + " t"],
    ["The plan Size it for me gives from the default", E1.kilo(RS.plan.pv) + " kW of solar · " + E1.kilo(RS.plan.bat) + " kWh battery · " + RS.plan.gen + " sets · " + E1.kilo(RS.plan.fuel) + " gallons: " + E1.money(RS.total) + " a year, community-owned"],
    ["That plan in the storm, and on a fourth day", E1.kilo(C.crit(RS.outages[0])) + " kWh of critical load unserved (" + E1.kilo(RS.outages[0].fuel) + " gal of diesel, " + E1.fuelMoney(RS.outages[0].fuelCost) + "); " + E1.kilo(Ls.filter(x => x.days === 4)[0].crit) + " kWh if the storm lasts 4 days"],
    ["That plan, paid by each owner (each owner's cheapest, rounded up)", cfg.owners.map(o => o.label.replace("-owned", "") + " " + E1.money(payS(o.key))).join(" · ")]];
  const pre = { head: "Results for the default plan (F7's campus as built) and the sized plan", rows: rows0, note: "Precomputed with HiGHS on 3 November 2026. Without JavaScript, write the note on the sized plan from these numbers, naming the plan in words in place of a link; with JavaScript on, you run your own plan, compare the owners and size it with the solver." };
  const exo = C.exemplars(RS, payS, cfg.fuel.price);
  const BLOCKS = {
    "c1-plan": () => SS.staticHTML(S, def),
    "c1-results": () => E1.fallback({ cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { c1: pre }) }) }, "c1"),
    "c1-note": () => RN.outlineHTML(C.FIELDS),
    "c1-exemplars": () => EX.staticHTML(exo),
    "c1-rubric": () => RB.staticHTML(C.RUBRIC) };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { c1: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    const b = {}; Object.keys(BLOCKS).forEach(k => { b[k] = BLOCKS[k](); }); X.writeBlocks(QPATH, b);
    console.log("wrote precomputed.c1 and the blocks " + Object.keys(BLOCKS).join(", "));
  }
  const PAGE = fs.readFileSync(QPATH, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8")), T = X.norm(PAGE);
  ok(JSON.stringify(D.precomputed && D.precomputed.c1) === JSON.stringify(pre), "the data file's precomputed C1 run equals a fresh run (--write after a change)");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
  ok(!EX.validate(exo).length, "the exemplars are well formed");

  // ---------------- the research text against the register
  const RP = X.portfolio(); let APP = APPROVED_SNAPSHOT;
  if (RP) {
    const reg = X.register(fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"), ["E8", "E9"]);
    const diff = Object.keys(APPROVED_SNAPSHOT).filter(k => reg[k] !== X.norm(APPROVED_SNAPSHOT[k]));
    ok(!diff.length, "the snapshot of E8.2, E8.7, E9.1-E9.3 equals the register; differs at: " + diff.join(", "));
    APP = {}; Object.keys(APPROVED_SNAPSHOT).forEach(k => { APP[k] = reg[k]; });
  } else console.log("note: the register was not found (set LEARN_PORTFOLIO); checked against the snapshot");
  const ex = X.excerpts(PAGE), all = ex.flatMap(e => e.sentences.map(s => ({ s, src: e.source })));
  const want = { "excerpt:supply-chain-mg": ["E8.2", "E8.7"], "excerpt:campus-resilience-question": ["E9.1", "E9.2", "E9.3"] };
  Object.keys(want).forEach(src => {
    const got = all.filter(x => x.src === src).map(x => x.s), need = want[src].map(k => X.norm(APP[k]));
    ok(got.length === need.length && got.every((s, i) => s === need[i]), src + ": the sentences are " + want[src].join(", ") + ", word for word and in order");
  });
  ok(all.every(x => Object.values(APP).map(X.norm).indexOf(x.s) >= 0), "every excerpt sentence on the page is an approved row");
  const e9 = ex.filter(e => e.source === "excerpt:campus-resilience-question")[0], e8 = ex.filter(e => e.source === "excerpt:supply-chain-mg")[0];
  ok(e9 && !e9.footer && !/<a\b/.test(e9.html), "E9: no citation and no link");
  ok(e8 && /Approved excerpt of: Li et al\. \(2023\), <a href="https:\/\/doi\.org\/10\.1016\/j\.apm\.2023\.02\.014">Applied Mathematical Modelling<\/a>\./.test(e8.footer), "E8: the footer cites the AMM paper by its DOI");

  // ---------------- the exemplars' and owners' numbers
  const R = RS, d4 = Ls.filter(x => x.days === 4)[0], good = EX.plain(exo.answers[1]);
  const pc = payS("coop"), pu = payS("utility");
  [E1.kilo(R.plan.pv) + " kW of solar", E1.kilo(R.plan.bat) + " kWh battery", E1.money(R.total) + " a year, community-owned, 2025 dollars: equipment, upkeep and the normal-year grid bill",
    E1.money(R.saving) + " below the grid-only bill", "powered for all 72 hours of the storm (" + E1.kilo(C.crit(R.outages[0])) + " kWh short)", "0 kWh short for a storm of 1 to 3 days, but " + E1.kilo(d4.crit) + " kWh on a fourth day, the plan held fixed",
    "The storm's " + E1.kilo(R.outages[0].fuel) + " gallons of diesel (" + E1.fuelMoney(R.outages[0].fuel * cfg.fuel.price) + ") are extra", (R.outages[0].co2 / 1000).toFixed(1) + " t of CO₂ from the storm's diesel; " + E1.kilo(R.year.co2) + " t from a normal year's grid electricity",
    "A co-op would pay " + E1.money(pc) + " a year for the same plan, a utility " + E1.money(pu), "worth " + E1.money(R.total - pc) + " a year more than a co-op here"].forEach(s =>
    ok(good.indexOf(s) >= 0, "the strong note quotes the engine: " + s));
  ["Recommendation:", "Cost:", "Sensitivity:", "Emissions:", "Assumptions:", "Owner:", "Limits:"].forEach(f => ok(good.indexOf(f) >= 0, "the strong note is a complete short note: " + f + " (C1 7)"));
  ok(exo.lines === true && good.split("\n").every(l => l.split(/\s+/).length <= 50), "the strong note: one field a line, each short (C1 9): " + good.split("\n").map(l => l.split(/\s+/).length).join(", ") + " words");
  ok(/another plan or owner is just as strong/.test(exo.note), "the exemplars accept other plans and owners when supported (C1 7)");
  ok(C.crit(R.outages[0]) < 0.5 && Ls.filter(x => x.days <= 3).every(x => x.crit < 0.5) && d4.crit > 0.5, "the sized plan carries the storm (0 kWh) and falls short on a fourth day (" + E1.kilo(d4.crit) + " kWh)");
  ok(pc < R.total && pu > R.total, "the same plan at 4% and 6% (" + E1.money(pc) + ", " + E1.money(pu) + ")");
  const co = owners.filter(x => x.owner.key === "coop")[0], ut = owners.filter(x => x.owner.key === "utility")[0], cm = owners.filter(x => x.owner.key === "community")[0];
  const same = owners.every(x => x.plan.pv === owners[0].plan.pv && x.plan.bat === owners[0].plan.bat && x.plan.gen === owners[0].plan.gen);
  ok(same && owners[0].plan.pv === R.plan.pv && owners[0].plan.bat === R.plan.bat && owners[0].plan.gen === R.plan.gen, "the three owners' cheapest plans, rounded up, are the sized plan (so the no-JS row 'each owner's cheapest' is that plan's cost)");
  // C1 4: each owner's row shows a rounded plan and that rounded plan's own annual cost (its run), not the exact sizing's
  owners.forEach(x => ok(Math.abs(x.total - (x.R.equipment.equipment + x.R.year.bill)) < 1e-6 && Math.abs(x.total - payS(x.owner.key)) < 0.5 && x.total > x.sized.total && x.crit < 0.5,
    x.owner.key + ": the row's cost is its rounded plan's (" + E1.money(x.total) + ", the exact sizing " + E1.money(x.sized.total) + "), which serves the brief"));
  const ow = C.ownersWords(owners);
  ok(/same sizes here/.test(ow) === same && ow.indexOf("Co-op-owned costs least, " + E1.money(co.total)) >= 0 && co.total < cm.total && ut.total > co.total, "owners' words follow from their numbers: " + ow);
  const sl = RN.sensitivityLine(C.sensitivity(R));
  ok(/^Unserved critical load \(hospital, water and heat, dorms\) is 0 kWh with the storm's length at 3 days \(this plan\), 0 kWh at 1 day, 0 kWh at 2 days and [\d,]+ kWh at 4 days, with the plan held fixed\.$/.test(sl), "the sensitivity line: " + sl);
  // C1 2: relabelling the critical loads cannot hide their shortfall
  const relab = await E1.solve(Object.assign({}, def, { ph: "shed", pw: "shed", pd: "shed" }), P, { solver, scenarios: [P.scen.jan3] });
  ok(relab.ok && relab.results.outages[0].must < 0.5 && C.crit(relab.results.outages[0]) > 1000, "the three loads relabelled 'shed': 0 kWh of must-stay-on load but " + E1.kilo(C.crit(relab.results.outages[0])) + " kWh of the brief's critical load, which the page reports (C1 2)");
  const JS = fs.readFileSync(X.L("c1-keep-the-campus-running.js"), "utf8");
  ok(/id: "brief", label: "The brief met: "/.test(JS) && /crit\(l\.R\.outages\[0\]\) < 0\.5/.test(JS), "the note checks the brief's loads, not the plan's own priorities (C1 2)");

  // ---------------- the brief and the frame
  ["brief", "plan", "note", "selfcheck", "sources"].forEach(id => ok(new RegExp('::: \\{#' + id + ' \\.lx-sec\\}').test(PAGE), "section #" + id));
  ["keeps electricity flowing to the county hospital, its water and heating plant and the dorms through a three-day winter storm, within the host feeder's limits", "Hand in:", "Done when:", "About 90 minutes: 35 to build and run the plan, 35 to write the note, 20 to check it."].forEach(s => ok(T.indexOf(s) >= 0, "brief: " + s));
  ok(T.indexOf("Assume that powering these loads keeps their heating equipment working: heat demand and indoor temperature are not modeled.") >= 0 && !/\bheated\b/.test(T + JS), "no claim that the model keeps anything heated; the assumption is stated (C1 5)");
  ok(/self-check reaches Proficient on accounting, uncertainty and realism\. For communication, the one-page note is the bar\./.test(T) && /one-page note: plan link, evidence, sensitivity and limits/.test(C.RUBRIC[3].look), "Done when and the rubric's communication line agree on the one-page note (C1 1)");
  ok(/section 8, “Your plan”: the cell that starts <code>MY = <\/code>/.test(PAGE), "the Modeler steps name the notebook's section 8 (C1 10)");
  ok(T.indexOf("the capstone becomes a reading exercise: write the note on the sized plan") >= 0, "the no-JS route: a reading exercise on the sized plan (C1 12)");
  ok(T.indexOf("not measured campus output") >= 0 && !/real (hourly )?sun|SPP's real/.test(T), "solar: a teaching profile, not real campus sun (C1 13)");
  ["feeder", "photovoltaic", "techno-economic-analysis", "cost-of-capital"].forEach(id => ok(new RegExp('data-term="' + id + '"').test(PAGE), "glossary mark: " + id + " (C1 8)"));
  ok(35 + 35 + 20 === 90, "the time adds up to path.yml's 90 minutes");
  ok(T.indexOf("650 kW") >= 0 && P.loads.slice(0, 3).reduce((a, l) => a + l.kw, 0) === 650, "650 kW must stay on to start: hospital, water and heat, dorms");
  ok(/notebooks\/m05-microgrid-size-and-run\.ipynb/.test(PAGE) && fs.existsSync(path.join(X.SITE, "learn/notebooks/m05-microgrid-size-and-run.ipynb")), "the Modeler version links the M5 notebook, which exists");
  ok(C.RUBRIC.map(r => r.id).join() === "accounting,uncertainty,realism,communication", "rubric: accounting, uncertainty, realism, communication (README: C0 and C1)");
  console.log(`test_c1-keep-the-campus-running: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
