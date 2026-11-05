// test_c2-plains-grid-hard-year.js — Node tests for capstone C2 (learn/c2-plains-grid-hard-year.qmd,
// assets/learn/c2-plains-grid-hard-year.js), on engine E2 (its own tests: test_e2-engine.js). What it checks:
//   - the no-JS blocks: the plan's table (C2's schema defaults), the precomputed results of the default plan and the
//     reference plan, the representative-day check, the note's outline, the exemplars, the rubric, the costs and inputs
//   - the data file's precomputed blocks (`c2base`: today's grid a year for each reserve; `c2ex`: the reference plan;
//     `c2check`: four plans on every day of 2025 and of 2024) against fresh runs (the full years only with --write; one
//     full year of 2025 re-solved on every run)
//   - who pays: the ledger adds up (the two parties together pay the energy, minus the rent, plus uplift and new costs);
//     the allocation rules as the page states them; the cost range from the fixed ranges
//   - the adequacy words and the sensitivity line follow from their numbers; the strong exemplar quotes the engine
//   - the research text: every excerpt sentence an approved E7 row, word for word, with CF7's footer and no title
//   - scope: no nuclear term anywhere (guard G-DC); costs fixed ranges the reader sets, nothing that falls with
//     deployment, no generic firm option and no timelines (guard G-COST); no AI wording; links to live lessons only
// --write: regenerates the precomputed library (data/e2-c2-library.json: all 128 plans, several minutes), the results and
// the reference plan, and writes the marker blocks; with --full also today's grid for every reserve and the four plans on
// every day of 2025 and 2024 (several more minutes); --keep-library writes the rest but keeps the library. --library:
// checks every library entry against a fresh run.
// Usage (from the site folder):  node _tests/learn/test_c2-plains-grid-hard-year.js [--write [--full]] [--library]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e2_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const QPATH = path.join(X.SITE, "learn/c2-plains-grid-hard-year.qmd"), DPATH = X.L("data/e2-plains-grid.json");
const RUN_DATE = "5 November 2026", WRITE = process.argv.includes("--write"), FULL = WRITE && process.argv.includes("--full");
const APPROVED_SNAPSHOT = {
  "E7.2": "A late grid connection costs the developer lost margin and carrying costs; ratepayers face utility carrying and stranding costs; society bears external costs.",
  "E7.3": "The study keeps these present-value accounts separate.",
  "E7.5": "Staged energization can recover a large share of that cost.",
  "E7.6": "Ratepayer exposure depends strongly on large-load tariff design." };

(async () => {
  const { E2, cfg, P, SS, solver, solveSync } = await X.load();
  const C = require(X.L("c2-plains-grid-hard-year.js"));
  const EX = require(X.L("components/exemplars.js")), RB = require(X.L("components/rubric.js")), RN = require(X.L("components/reportnote.js"));
  const S = E2.c2Schema(cfg), def = SS.defaults(S), D0 = JSON.parse(fs.readFileSync(DPATH, "utf8"));
  const sum = a => a.reduce((s, v) => s + v, 0);
  const year = async st => { const r = await E2.solve(st, P, { solver, task: "year" }); ok(r.ok, "year run optimal: " + JSON.stringify(st).slice(0, 80)); return r.results; };
  const baseOf = R => ({ pay: sum(R.tot.pay), rent: R.tot.rent, uplift: R.tot.upliftAll, served: sum(R.served), prod: R.tot.prod, co2: R.tot.co2 });
  const today = st => Object.assign({}, st, { conn: 0, flex: 0, pk: 0, bat: 0, up: 0 });

  // ---------------- today's grid for each reserve (precomputed: the page compares every plan with it)
  const resF = S.fields.filter(f => f.id === "res")[0], resVals = []; for (let v = resF.min; v <= resF.max; v += resF.step) resVals.push(v);
  let c2base = D0.precomputed && D0.precomputed.c2base;
  if (FULL) { c2base = {}; for (const v of resVals) c2base[String(v)] = baseOf(await year(today(Object.assign({}, def, { res: v })))); }
  ok(c2base && resVals.every(v => c2base[String(v)]), "today's grid is precomputed for every reserve the plan can set (" + resVals.join(", ") + " MW)");
  for (const v of [def.res, resF.max]) { const b = baseOf(await year(today(Object.assign({}, def, { res: v })))); ok(JSON.stringify(b) === JSON.stringify(c2base[String(v)]), "today's grid at " + v + " MW of reserve equals a fresh run"); }

  // ---------------- the precomputed library: every plan of the grid, its year (26 days) solved by E2 at a generous
  // time limit, each day's status and gap recorded. --write regenerates all of it (several minutes); --library checks all
  // of it without writing; a plain run regenerates a sample (the four presets, the reference plan and three seeded grid
  // plans) and checks each entry byte for byte
  const LPATH = X.L("data/e2-c2-library.json"), GRID = E2.c2Grid(S, def), ref = Object.assign({}, def, E2.c2presets[1].state, { share: 50 });
  const libOf = async st => C.libEntry(E2, P, st, await E2.solve(st, P, { solver, task: "year", timeLimit: C.LIB_LIMIT }));
  const grid = {}; E2.C2_DISPATCH.forEach(k => { const f = S.fields.filter(x => x.id === k)[0], v = []; for (let x = f.min; x <= f.max; x += f.step) v.push(x); grid[k] = v; });
  const libText = plans => '{"about":"Engine E2\'s precomputed library for capstone C2 (learn/c2-plains-grid-hard-year.qmd): every plan of the grid (the dispatch fields of C2\'s plan), its year of 26 days (12 representative days and the two hard weeks) solved with E2 itself on ' + RUN_DATE +
    ', each day a MILP (gap 1e-6, at most ' + C.LIB_LIMIT + ' s) then the dispatch LP with the commitment fixed. Written by node _tests/learn/test_c2-plains-grid-hard-year.js --write; checked byte for byte.","date":"' + RUN_DATE + '","timeLimit":' + C.LIB_LIMIT +
    ',"grid":' + JSON.stringify(grid) + ',"plans":[\n' + plans.map(e => JSON.stringify(e)).join(",\n") + "\n]}\n";
  let LIB = fs.existsSync(LPATH) ? JSON.parse(fs.readFileSync(LPATH, "utf8")) : null;
  if (WRITE && !process.argv.includes("--keep-library")) {
    const plans = []; let k = 0;
    for (const st of GRID) { plans.push(await libOf(st)); if (++k % 16 === 0) console.log("library: " + k + " of " + GRID.length); }
    fs.writeFileSync(LPATH, libText(plans)); LIB = JSON.parse(fs.readFileSync(LPATH, "utf8"));
  }
  ok(LIB && LIB.plans.length === GRID.length && LIB.plans.every((e, i) => e.k === E2.c2Key(GRID[i])) && JSON.stringify(LIB.grid) === JSON.stringify(grid), "the library holds every plan of the grid (" + GRID.length + "), in the grid's order");
  ok(fs.readFileSync(LPATH, "utf8") === libText(LIB.plans), "the library file is written exactly as the test writes it");
  const byKey = {}; LIB.plans.forEach(e => { byKey[e.k] = e; });
  const sampleIdx = new Set(E2.c2presets.map(p => GRID.findIndex(g => E2.c2Key(g) === E2.c2Key(Object.assign({}, def, p.state)))).concat([GRID.findIndex(g => E2.c2Key(g) === E2.c2Key(ref))]));
  let sd = 5; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647; while (sampleIdx.size < 8) sampleIdx.add(Math.floor(rnd() * GRID.length));
  const check = process.argv.includes("--library") ? GRID.map((g, i) => i) : [...sampleIdx];
  let libBad = [];
  for (const i of check) { const e = await libOf(GRID[i]); if (JSON.stringify(e) !== JSON.stringify(LIB.plans[i])) libBad.push(LIB.plans[i].k); }
  ok(!libBad.length, "the library equals fresh runs, byte for byte, for " + check.length + " plans (" + (check.length === GRID.length ? "all" : "the presets, the reference and seeded samples") + ")" + (libBad.length ? ": " + libBad.join(", ") : ""));
  ok(LIB.plans.every(e => e.days.length === 26 && e.weeks.town.length === 336), "every entry has 26 days and Town's 336 hard-week hours");
  const early = LIB.plans.filter(e => !C.libStatus(e).ok);
  ok(LIB.plans.every(e => e.days.every(d => d[0] === "optimal" || d[0] === "time-limit")), "every recorded day is optimal or stopped at the time limit with its gap (" + early.length + " plans with a day not proven optimal)");
  ok(/not proven optimal \(largest gap 1\.23%\)/.test(C.libStatus({ days: [["optimal", 0], ["time-limit", 0.0123]] }).text) && C.libStatus(LIB.plans[0]).ok === LIB.plans[0].days.every(d => d[0] === "optimal"), "a day that stopped early is labelled not proven optimal, with its gap");
  // C2's sizes, as the page caps them (the grid)
  ok(GRID.length === 128 && JSON.stringify(grid) === '{"conn":[150,300],"flex":[0,20],"pk":[0,2,4,6],"bat":[0,100],"up":[0,300],"res":[150,250]}', "the grid: 2 × 2 × 4 × 2 × 2 × 2 = 128 plans, as the page states");

  // ---------------- the default plan and the reference plan (the strong exemplar's), from the library
  const e0 = byKey[E2.c2Key(def)], eR = byKey[E2.c2Key(ref)], R0 = await year(def);
  const ade = st => E2.adequacy(P, E2.sysOf(st, P), { sync: true });
  const refL = C.ledger(ref, eR.year, c2base[String(ref.res)], cfg), refCR = C.costRange(ref, eR.year, c2base[String(ref.res)], cfg);
  const c2today = ade(today(def));
  const refA = { plan: ade(ref), today: c2today, bare: ade(Object.assign(today(ref), { conn: 300 })), sweep: C.SWEEP.map(mw => Object.assign(ade(Object.assign({}, ref, { conn: mw })), { mw })) };
  const c2ex = { plan: ref, A: refA, L: Object.assign({}, refL, { lo: refCR.lo, hi: refCR.hi }), W: { shed: eR.weeks.shed, maxT: eR.weeks.max[P.zix.T] }, co2: eR.year.co2 };
  c2ex.exemplars = C.exemplars(c2ex);
  ok(!EX.validate(c2ex.exemplars).length, "the exemplars are well formed");
  ok(JSON.stringify(ade(Object.assign(today(def), { res: 150, share: 70, cpk: 100 }))) === JSON.stringify(c2today), "today's grid's adequacy does not depend on the reserve, the share or the costs (precomputed once)");
  // ---------------- the results without JavaScript
  const A0 = ade(def), L0 = C.ledger(def, e0.year, c2base[String(def.res)], cfg);
  const rowsOf = (tag, st, e, L, A) => [
    [tag + ": the plan", C.kilo(st.conn) + " MW connected · " + st.pk + " new peakers · " + C.kilo(st.up) + " MW uprate · " + st.share + "% of new costs paid by the large load"],
    [tag + ": production cost, a year (2025 dollars)", C.mil(e.year.prod)],
    [tag + ": other customers against today's grid, a year", (L.delta >= 0 ? "+" : "") + C.mil(L.delta)],
    [tag + ": the large load pays, a year", C.mil(L.ll.total)],
    [tag + ": hard weeks, unserved · Town's highest price (conditional on the commitment)", C.kilo(e.weeks.shed) + " MWh · " + C.price(e.weeks.max[P.zix.T]) + "/MWh"],
    [tag + ": loss-of-load expectation (90% interval)", A.lole.toFixed(2) + " days a year (" + A.ci[0].toFixed(2) + " to " + A.ci[1].toFixed(2) + ")"]];
  const pre = { head: "Results: the default plan (all 300 MW, nothing built), then the reference plan", rows: rowsOf("Default", def, e0, L0, A0).concat(rowsOf("Reference", ref, eR, refL, refA.plan)),
    note: "Precomputed with this engine on " + RUN_DATE + "; today's grid: " + c2today.lole.toFixed(2) + " loss-of-load days a year. Without JavaScript, write the note on the reference plan from these numbers, naming the plan in words in place of a link." };

  // ---------------- the representative-day check: four plans on every day of 2025 and of 2024
  const PLANS = E2.c2presets.map(p => [p.label, Object.assign({}, def, p.state)]);
  const pick = R => ({ prod: R.tot.prod, priceT: R.avgPrice[P.zix.T], uplift: R.tot.upliftAll, co2: R.tot.co2, shed: R.tot.shed, cong: R.tot.cong.TM });
  let c2check = D0.precomputed && D0.precomputed.c2check;
  if (FULL) {
    c2check = [];
    for (const [label, st] of PLANS) {
      const est = pick(await year(st)), f25 = pick(X.fullYear(E2, P, st, solveSync, 2025)), f24 = pick(X.fullYear(E2, P, st, solveSync, 2024));
      c2check.push({ label, est, f25, f24 }); console.log("checked " + label);
    }
  }
  ok(c2check && c2check.length === 4, "the representative-day check holds four plans");
  const f25 = pick(X.fullYear(E2, P, PLANS[0][1], solveSync, 2025));
  ok(JSON.stringify(f25) === JSON.stringify(c2check[0].f25), "re-solved: the first plan on every day of 2025 equals the stored check");
  const est0 = pick(R0);
  ok(JSON.stringify(est0) === JSON.stringify(c2check[0].est), "the first plan's estimate equals the stored check");
  const pct = (a, b) => (a - b) / b * 100;
  const checkHTML = () => {
    const cell = (x, k, f) => f(x[k]);
    const m = v => C.mil(v), pr = v => C.price(v), kt = v => C.kilo(v / 1000) + " kt", mw = v => C.kilo(v) + " MWh", h = v => C.kilo(v) + " h";
    const cols = [["Production cost", "prod", m], ["Town's average price", "priceT", pr], ["Uplift", "uplift", m], ["CO₂", "co2", kt], ["Unserved", "shed", mw], ["Town–Metro at its limit", "cong", h]];
    let t = '<div class="lx-scroll-x"><table class="lx-facts e2-lab c2-check"><thead><tr><th scope="col">Plan and year</th>' + cols.map(c => '<th scope="col">' + c[0] + "</th>").join("") + "</tr></thead><tbody>";
    c2check.forEach(r => [["estimate (26 days)", r.est], ["every day of 2025", r.f25], ["every day of 2024", r.f24]].forEach(([w, x], i) => {
      t += '<tr><th scope="row">' + (i ? "" : r.label + ": ") + w + "</th>" + cols.map(c => '<td class="n" data-l="' + c[0] + '">' + cell(x, c[1], c[2]) + "</td>").join("") + "</tr>";
    }));
    t += "</tbody></table></div>";
    const all = k => c2check.flatMap(r => [r.f25, r.f24].map(f => ({ e: r.est[k], f: f[k] })));
    const errMax = k => Math.ceil(Math.max(...all(k).map(x => Math.abs(pct(x.e, x.f))))), ratio = k => all(k).filter(x => x.f > 0.5).map(x => x.e / x.f);
    const up = ratio("uplift"), cg = ratio("cong");
    t += '<p class="lx-hint">For these four plans, production cost and CO₂ come within ' + Math.max(errMax("prod"), errMax("co2")) + "% of every day of 2025 and of 2024, and Town's average price within " + errMax("priceT") + "%. Uplift does not survive: the estimate is " + Math.min(...up).toFixed(1) + " to " + Math.max(...up).toFixed(1) + " times the full years'. Nor do the hours at Town–Metro's limit: the estimate finds " + Math.round(Math.min(...cg) * 100) + "% to " + Math.round(Math.max(...cg) * 100) + "% of them. Read congestion and unserved load from the hard weeks and the adequacy check, and the uplift as a rough figure.</p>";
    return t;
  };

  // ---------------- the blocks
  const withPre = { cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { c2: pre }) }) };
  const BLOCKS = { "c2-plan": () => SS.staticHTML(S, def), "c2-results": () => E2.fallback(withPre, "c2"), "c2-check": checkHTML, "c2-note": () => RN.outlineHTML(C.FIELDS),
    "c2-exemplars": () => EX.staticHTML(c2ex.exemplars), "c2-rubric": () => RB.staticHTML(C.RUBRIC, { bar: C.RUBRIC_BAR }), "c2-costs": () => C.costsHTML(cfg), "c2-inputs": () => E2.inputsHTML(P) };
  if (WRITE) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { c2: pre, c2base, c2ex, c2check, c2today });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    const b = {}; Object.keys(BLOCKS).forEach(k => { b[k] = BLOCKS[k](); }); X.writeBlocks(QPATH, b);
    console.log("wrote precomputed c2, c2base, c2ex, c2check and the blocks " + Object.keys(BLOCKS).join(", "));
  }
  const PAGE = fs.readFileSync(QPATH, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8")), T = X.norm(PAGE);
  ok(JSON.stringify(D.precomputed.c2) === JSON.stringify(pre), "the data file's precomputed C2 results equal fresh runs (--write after a change)");
  ok(JSON.stringify(D.precomputed.c2ex) === JSON.stringify(c2ex), "the reference plan's numbers (the strong exemplar's) equal fresh runs");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });

  // ---------------- who pays: the ledger adds up, and the words follow the numbers
  ok(JSON.stringify(D.precomputed.c2today) === JSON.stringify(c2today), "today's grid's adequacy (precomputed for the page) equals a fresh run");
  [[def, e0], [ref, eR]].forEach(([st, e]) => {
    const L = C.ledger(st, e.year, c2base[String(st.res)], cfg), Y = e.year;
    ok(near(L.ll.total + L.oth.total, Y.pay - Y.rent + Y.uplift + L.N, 1e-3), "ledger: the two parties pay the energy at zone prices, minus the rent, plus uplift and the new costs (" + C.mil(L.ll.total + L.oth.total) + ")");
    ok(near(L.ll.energy, Y.llPay, 1e-6) && near(L.Ell, Y.ll, 1e-6) && near(Y.pay, Math.round(sum(R0.tot.pay)), st === def ? 0.5 : Infinity), "ledger: the large load pays Town's price for each MWh served; the entry's sums are the run's");
    ok(near(L.parts.energy + L.parts.rent + L.parts.uplift + L.parts.fixed, L.delta, 1e-6) && C.partsWords(L).indexOf(C.mil(L.parts.energy).replace("−", "")) >= 0, "ledger: the change's parts add up and are said: " + C.partsWords(L));
    ok(near(L.N, 1000 * (st.pk * 50 * st.cpk + st.bat * st.cbat + st.up * st.cup), 1e-6), "ledger: new costs = MW × $/kW-year × 1,000");
  });
  ok(C.priceErr(D) === Math.ceil(Math.max(...c2check.flatMap(r => [r.f25, r.f24].map(f => Math.abs(pct(r.est.priceT, f.priceT)))))) && T.indexOf("Town's average price within " + C.priceErr(D) + "%") >= 0, "the ledger's price caution and the check's caption give the same error (" + C.priceErr(D) + "%)");
  ok(near(refL.ll.fixed, refL.N * 0.5 + refL.N * 0.5 * refL.Ell / (refL.Ell + refL.Eoth), 1e-3), "the reference plan: the large load pays half the new costs directly, and its energy share of the rest");
  ok(refCR.lo <= refL.delta && refL.delta <= refCR.hi, "the cost range brackets the default (" + C.mil(refCR.lo) + " ≤ " + C.mil(refL.delta) + " ≤ " + C.mil(refCR.hi) + ")");
  ok(C.moneyOnly(S, def, Object.assign({}, def, { cpk: 90, share: 40 })) && !C.moneyOnly(S, def, Object.assign({}, def, { pk: 2 })) && !C.moneyOnly(S, def, Object.assign({}, def, { res: 150 })) &&
    C.MONEY.every(k => S.fields.some(f => f.id === k)), "only the costs and the share count as money-only changes (they redraw the ledger without a new run; the reserve and the builds need one)");
  // the adequacy numbers behind the brief and the presets
  ok(refA.today.lole < cfg.c2.adequacy.criterion, "today's grid is within 0.1 loss-of-load days a year (" + refA.today.lole.toFixed(3) + ")");
  ok(A0.lole > 1, "the default plan (all 300 MW, nothing built) is far above it (" + A0.lole.toFixed(2) + ")");
  ok(refA.plan.lole <= cfg.c2.adequacy.criterion, "the reference plan meets the brief (" + refA.plan.lole.toFixed(3) + "), so the strong exemplar's recommendation is consistent");
  ok(refA.sweep.every((x, i) => i === 0 || x.lole >= refA.sweep[i - 1].lole - 1e-9), "the sensitivity rises as more of the load connects, with the builds held fixed: " + refA.sweep.map(x => x.lole.toFixed(3)).join(", "));
  const aw = C.adequacyWords(refA, cfg.c2.adequacy.criterion);
  ok(/^Within the 0\.1 criterion/.test(aw) && aw.indexOf(refA.plan.lole.toFixed(2)) > 0 && aw.indexOf(refA.today.lole.toFixed(2)) > 0, "adequacy words follow the numbers: " + aw);
  ok(/^Above/.test(C.adequacyWords({ plan: A0, today: refA.today }, 0.1)), "and say 'Above' when the plan misses the criterion");
  const sl = C.sensitivity(refA, ref);
  ok(sl.base.at === "300 MW" && sl.base.value === refA.plan.lole.toFixed(2) && sl.cases.length === 3 && /held fixed/.test(sl.held), "the sensitivity line: the plan's own connection and the three others, builds held fixed");
  const good = EX.plain(c2ex.exemplars.answers[1]);
  [C.mil(refL.ll.total), refA.plan.lole.toFixed(2), refA.today.lole.toFixed(2), C.kilo(eR.weeks.shed) + " MWh unserved", C.kilo(eR.year.co2 / 1000) + " kt"].forEach(s => ok(good.indexOf(s) >= 0, "the strong exemplar states " + s));

  // ---------------- the research text against the register
  const RP = X.portfolio(); let APP = APPROVED_SNAPSHOT;
  if (RP) { const reg = X.register(fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"), ["E7"]); APP = {}; Object.keys(APPROVED_SNAPSHOT).forEach(k => { APP[k] = reg[k]; }); }
  ok(Object.keys(APPROVED_SNAPSHOT).every(k => APP[k] === APPROVED_SNAPSHOT[k]), "the register's E7.2, E7.3, E7.5 and E7.6 equal this test's snapshot" + (RP ? "" : " (register not found; snapshot used)"));
  const exs = X.excerpts(PAGE);
  ok(exs.length === 1 && exs[0].source === "excerpt:code", "one excerpt, excerpt:code");
  ok(exs[0].sentences.join("|") === ["E7.2", "E7.3", "E7.5", "E7.6"].map(k => APP[k]).join("|"), "every excerpt sentence is an approved E7 row, word for word, in order (E7.4 left out)");
  const cf7 = fs.readFileSync(path.join(X.SITE, "learn/cf7-cost-of-waiting.qmd"), "utf8"), cf7foot = (cf7.match(/<footer>([\s\S]*?)<\/footer>/) || [])[1];
  ok(exs[0].footer === cf7foot && !/North American Power Symposium.*Delayed|for AI/.test(PAGE), "the footer is CF7's (cited by description, no title)");
  ok(PAGE.indexOf("<li>Li et al. (2026). Accepted paper on the cost of delayed grid energization for large loads, 2026 North American Power Symposium (NAPS), presented October 2026; DOI pending.</li>") >= 0, "the citation is CF7's (E7.14), word for word");

  ok(T.indexOf("the year of each of the 128 plans on the grid (half or all of the load, flexible or not, 0, 2, 4 or 6 new peakers, a battery or not, an uprate or not, a 150 or 250 MW reserve), solved with this engine on " + LIB.date) >= 0 && LIB.date === RUN_DATE, "the page states the grid and the library's date");
  ok(/The choices step across a precomputed grid of " \+ LIB\.plans\.length \+ " plans/.test(fs.readFileSync(X.L("c2-plains-grid-hard-year.js"), "utf8")) && /Precomputed with this engine on/.test(fs.readFileSync(X.L("c2-plains-grid-hard-year.js"), "utf8")), "the bench labels the year as precomputed with this engine, with its date");
  // ---------------- the brief, the time, the frame and the guards
  const PY = fs.readFileSync(path.join(X.SITE, "learn/path.yml"), "utf8"), row = PY.slice(PY.indexOf("id: c2-plains-grid-hard-year"), PY.indexOf("after: [SB2, M2]"));
  ok(/minutes: 180/.test(row) && /About 180 minutes: 70 to build and test plans, 70 to write the note, 40 to check it\./.test(T), "the time: 180 minutes = 70 + 70 + 40, as path.yml and the curriculum give it");
  ok(/sandbox: SB2/.test(row) && /lab_minutes: 45/.test(row) && /lab_minutes: 45/.test(PY.slice(PY.indexOf("id: m02-unit-commitment"), PY.indexOf("id: m02-unit-commitment") + 800)), "built on SB2; the Modeler version's 45 minutes are M2's notebook lab");
  ["brief", "plan", "note", "selfcheck", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  ok(/data-learn="c2" data-src="\.\.\/assets\/learn\/data\/e2-plains-grid\.json \.\.\/assets\/learn\/data\/e2-c2-library\.json \.\.\/assets\/learn\/data\/town_year\.json \.\.\/assets\/learn\/data\/m03-capacity-expansion-2024\.json \.\.\/assets\/learn\/data\/cf_targets\.json \.\.\/assets\/learn\/data\/path\.json"/.test(PAGE), "data-src: the engine's data, the precomputed library, both weather years, the capacity factors");
  const JS = fs.readFileSync(X.L("c2-plains-grid-hard-year.js"), "utf8"), ENG = fs.readFileSync(X.L("components/engine-e2.js"), "utf8"), DATA = fs.readFileSync(DPATH, "utf8");
  ok(!/\b(nuclear|reactor|SMR|small modular)\b/i.test(PAGE + JS + ENG + DATA), "no nuclear term on the page, in its script, the engine or the data (guard G-DC)");
  ok(!/\blearning\b|cost (decline|reduction|fall)|cheaper as|falls? with (deploy|build)|firm clean|clean firm|timeline to|online by|in service by/i.test(PAGE + JS), "no cost that falls with deployment, no generic firm option, no technology timelines (guard G-COST)");
  ok(S.fields.filter(f => /^c(pk|bat|up)$/.test(f.id)).length === 3 && /stays the same however much is built/.test(JS), "three costs, each a fixed range the reader sets, said to stay the same however much is built");
  ok(!/\bAI\b|artificial intelligence|Claude|ChatGPT|generated by/i.test(T + JS), "no AI wording");
  ok(/conditional on the commitment/.test(T + JS) && !/MILP price|price from the MILP|mixed-integer program's price/i.test(T + JS), "prices are conditional on the commitment; none from the MILP");
  const desc = (PAGE.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 40, "the description is short (" + desc.split(/\s+/).length + " words)");
  const hrefs = [...PAGE.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^(https?:|mailto:|#|\.\.\/)/.test(h) && !/^index\.html(#|$)/.test(h) && !/^notebooks\//.test(h));
  const P2 = JSON.parse(fs.readFileSync(X.L("data/path.json"), "utf8")), live = new Set([].concat(P2.starter || [], P2.more || [], P2.toolbox || []).filter(l => l.ready).map(l => l.href));
  ok(hrefs.every(h => live.has(h.replace(/#.*$/, ""))), "internal links go to live lessons only: " + hrefs.filter(h => !live.has(h.replace(/#.*$/, ""))).join(", "));
  ok(fs.existsSync(path.join(X.SITE, "learn/notebooks/m02-unit-commitment.ipynb")), "M2's notebook exists for the download link");
  console.log(`test_c2-plains-grid-hard-year: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
