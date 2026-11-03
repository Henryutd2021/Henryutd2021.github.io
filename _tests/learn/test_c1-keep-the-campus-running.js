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
  const rows0 = [["Plan", E1.kilo(R0.plan.pv) + " kW of solar · " + E1.kilo(R0.plan.bat) + " kWh battery · " + R0.plan.gen + " sets of 200 kW · " + E1.kilo(R0.plan.fuel) + " gallons; hospital, water and heat, dorms must stay on"],
    ["Annual cost (2025 dollars, illustrative)", E1.money(R0.total)], ["The year's bill with nothing built", E1.money(R0.base)],
    ["Must-stay-on load unserved in the 72-hour storm", E1.kilo(R0.outages[0].must) + " kWh (" + E1.kilo(R0.outages[0].fuel) + " gal of diesel, " + (R0.outages[0].co2 / 1000).toFixed(1) + " t CO₂)"],
    ["The same plan if the storm lasts 1, 2, 3 or 4 days", L0.map(x => E1.kilo(x.must)).join(" · ") + " kWh unserved"],
    ["CO₂ from grid electricity in a normal year", E1.kilo(R0.year.co2) + " t"]];
  const pre = { head: "Result for the default plan (F7's campus as built)", rows: rows0, note: "Precomputed with HiGHS on 3 November 2026; with JavaScript on, you run your own plan, compare the owners and size it with the solver." };
  // the plan Size it for me gives from the defaults, its run, and each owner's cheapest plan
  const sz = await E1.solve(def, P, { solver, task: "size", check: false, scenarios: [P.scen.jan3] });
  const rs = await E1.solve(sz.results.plan, P, { solver, scenarios: C.scenarios(E1, P, "run") });
  const owners = [];
  for (const ow of cfg.owners) { const s2 = Object.assign({}, def, { own: ow.key }); const q = await E1.solve(s2, P, { solver, task: "size", check: false, scenarios: [P.scen.jan3] }); ok(q.ok, ow.key + ": sized, optimal"); owners.push({ owner: ow, sized: q.results.sized }); }
  const exo = C.exemplars(rs.results, C.paidBy(E1, P, rs.results));
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
  const R = rs.results, d4 = C.lengthsOf(R).filter(x => x.days === 4)[0], good = EX.plain(exo.answers[1]);
  [E1.kilo(R.plan.pv) + " kW of solar", E1.kilo(R.plan.bat) + " kWh battery", E1.money(R.total) + " a year", E1.money(R.saving) + " below the grid-only bill",
    "lose " + E1.kilo(R.outages[0].must) + " kWh in the 72-hour storm", "but " + E1.kilo(d4.must) + " kWh if it lasts a fourth day", "burns " + E1.kilo(R.outages[0].fuel) + " gallons", E1.kilo(R.year.co2) + " t"].forEach(s =>
    ok(good.indexOf(s) >= 0, "the strong note quotes the engine: " + s));
  ok(R.outages[0].must < 0.5 && d4.must > 0.5, "the sized plan carries the storm (0 kWh) and falls short on a fourth day (" + E1.kilo(d4.must) + " kWh)");
  const co = owners.filter(x => x.owner.key === "coop")[0], ut = owners.filter(x => x.owner.key === "utility")[0];
  const pc = E1.costs(Object.assign({}, def, { own: "coop" }), P, R.plan).annual.equipment + R.year.bill, pu = E1.costs(Object.assign({}, def, { own: "utility" }), P, R.plan).annual.equipment + R.year.bill;
  ok(good.indexOf("A co-op would pay " + E1.money(pc) + " a year for the same plan, a utility " + E1.money(pu)) >= 0 && pc < R.total && pu > R.total, "the strong note's owner numbers: the same plan at 4% and 6% (" + E1.money(pc) + ", " + E1.money(pu) + ")");
  const same = owners.every(x => x.sized.rounded.pv === owners[0].sized.rounded.pv && x.sized.rounded.bat === owners[0].sized.rounded.bat && x.sized.rounded.gen === owners[0].sized.rounded.gen);
  ok(same, "the three owners' cheapest plans have the same sizes here (the claim in the strong note: 'the same plan')");
  const ow = C.ownersWords(owners);
  ok(/same sizes here/.test(ow) === same && ow.indexOf("Co-op-owned costs least, " + E1.money(co.sized.total)) >= 0 && co.sized.total < owners.filter(x => x.owner.key === "community")[0].sized.total && ut.sized.total > co.sized.total, "owners' words follow from their numbers: " + ow);
  const sl = RN.sensitivityLine(C.sensitivity(R));
  ok(/^Unserved must-stay-on load is 0 kWh with the storm's length at 3 days \(this plan\), 0 kWh at 1 day, 0 kWh at 2 days and [\d,]+ kWh at 4 days, with the plan held fixed\.$/.test(sl), "the sensitivity line: " + sl);

  // ---------------- the brief and the frame
  ["brief", "plan", "note", "selfcheck", "sources"].forEach(id => ok(new RegExp('::: \\{#' + id + ' \\.lx-sec\\}').test(PAGE), "section #" + id));
  ["keeps the county hospital, its water and heating plant and the dorms heated through a three-day winter storm, within the host feeder's limits", "Hand in:", "Done when:", "About 90 minutes: 35 to build and run the plan, 35 to write the note, 20 to check it."].forEach(s => ok(T.indexOf(s) >= 0, "brief: " + s));
  ok(35 + 35 + 20 === 90, "the time adds up to path.yml's 90 minutes");
  ok(T.indexOf("650 kW") >= 0 && P.loads.slice(0, 3).reduce((a, l) => a + l.kw, 0) === 650, "650 kW must stay on to start: hospital, water and heat, dorms");
  ok(/notebooks\/m05-microgrid-size-and-run\.ipynb/.test(PAGE) && fs.existsSync(path.join(X.SITE, "learn/notebooks/m05-microgrid-size-and-run.ipynb")), "the Modeler version links the M5 notebook, which exists");
  ok(C.RUBRIC.map(r => r.id).join() === "accounting,uncertainty,realism,communication", "rubric: accounting, uncertainty, realism, communication (README: C0 and C1)");
  console.log(`test_c1-keep-the-campus-running: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
