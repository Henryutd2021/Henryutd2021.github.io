// test_c3-prairie-city-2040.js — Node tests for C3 (learn/c3-prairie-city-2040.qmd, assets/learn/c3-prairie-city-2040.js),
// on engine E3 (its own tests: test_e3-engine.js). What it checks:
//   - the no-JS blocks: the plan's table (LX.ShareState.staticHTML), the results of 2025 and of the reference plan
//     (precomputed.c3), the summary's outline (LX.ReportNote.outlineHTML), the exemplars (LX.Exemplars.staticHTML of
//     precomputed.c3ex, written from a fresh run of the reference plan), the rubric (LX.Rubric.staticHTML), the inputs
//   - the brief's numbers: the budget, the time split adding to 150 minutes, the Modeler version's 60 minutes
//   - the reference plan: within the budget, its exemplar numbers equal a fresh run, its levers as the strong summary says
//   - the stakeholder panel: every reaction true of its run and its stated rule, for every preset and the reference plan
//   - the sensitivity: inputs moved to the ends of their ranges, every case solved again (building and equipment choices
//     fixed; dispatch and substation upgrades re-optimized, their MW and up-front cost reported); the park's gas price
//     with its own 2025 baseline; the joint cheaper and dearer cases equal fresh runs and bracket every one-at-a-time case
//   - the evidence pack for the summary without JavaScript: households, jobs, panel, sensitivity,
//     sites and the city's wind and solar, from fresh runs (the c3-evidence block)
//   - the summary: one answer field per stakeholder, the "answered" check, a sources field, the rubric's own levels, and
//     room for the reader's words inside the two pages
//   - the full-year check (data/e3-full-year.json, rebuilt by test_e3-full-year.js): a check for each preset and the
//     reference plan, found by the plan link (the site's details ignored); the check's eight days are the reference
//     plan's own run; the farms' MWh used higher on the year, as the words say; no full-year solve on the page
//   - 2025's baseline carries no site's costs (only a plan with a solar farm pays for its site)
//   - the hooks: A19's siting (no site changes a number until the map is wired) and A13's jobs (no number shown)
//   - siting scope (solar, wind, transmission corridors and data centers only): the only siting on the page is a solar
//     farm; no nuclear term on the page, its script or the data; no AI wording
// --write: recomputes precomputed.c3 and c3ex and writes the marker blocks.
// Usage (from the site folder):  node _tests/learn/test_c3-prairie-city-2040.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e3_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const QPATH = path.join(X.SITE, "learn/c3-prairie-city-2040.qmd"), DPATH = X.L("data/e3-city-hub.json");
const RUN_DATE = "6 November 2026";

(async () => {
  const { E3, city, cfg, P, SS, solver, L } = await X.load();
  const PG = require(L("c3-prairie-city-2040.js"));
  const RN = require(L("components/reportnote.js")), EX = require(L("components/exemplars.js")), RB = require(L("components/rubric.js"));
  const S = E3.c3Schema(cfg), def = SS.defaults(S), ref = Object.assign({}, def, PG.REF_PLAN);
  ok(!SS.validate(S, ref).length, "the reference plan is a valid plan");
  // A19's map model, as the page builds it (HOOK(A19), wired): the region, the five best solar blocks and their costs
  const A19 = require(L("components/siting.js")), AD = A19.withCity(JSON.parse(fs.readFileSync(L("data/a19-gis-siting.json"), "utf8")), city), CFT = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
  const SM = PG.siteModel(A19, AD, { solar: CFT.targets.solar.cf, wind: CFT.targets.wind.cf });
  const withSite = st => { const x = Object.assign({}, st); if (st.farm > 0) x.siteInfo = PG.siteInfo(SM, st.site, st.farm); return x; };
  const r0 = await E3.solve(def, P, { solver }), r1 = await E3.solve(withSite(ref), P, { solver });
  ok(r0.ok && r1.ok, "2025 and the reference plan run optimal");
  const R1 = r1.results, b1 = PG.budget(R1, P);
  ok(b1.within, "the reference plan is within the budget (" + PG.mil(b1.upfront) + ")");
  ok(Math.abs(R1.base.acc.city.money - r0.results.acc.city.money) < 1 && Math.abs(R1.base.acc.upfrontTotal) < 1 && E3.sysOf(E3.baseState(withSite(ref)), P).siteAdj === null,
    "2025's baseline carries no site's line, road or land: the reference plan is compared with the same 2025 as every plan");
  const rows = (R, tag) => [[tag + ": up front, 2026 to 2040 (2025 dollars)", PG.mil(R.acc.upfrontTotal) + " of a " + PG.mil(cfg.c3.budget.def * 1e6) + " budget"],
    [tag + ": the city's yearly cost against 2025", PG.smil(R.delta.cityCost)], [tag + ": the city's CO₂ (location-based, operating)", E3.kilo(R.acc.city.co2) + " t a year"],
    [tag + ": busiest hour against the limit, core · suburbs · fringe", R.dist.map(d => E3.kilo(d.peak) + "/" + E3.kilo(d.limit)).join(" · ") + " MW"],
    [tag + ": energy burden, homes below 80% of area median income (screening)", PG.pct1(R.hh.low.burden)]];
  const pre = { head: "Result: 2025 as it is, then the reference plan of the exemplars (70% heat pumps, 40% electric cars, 200 MW of city-owned wind, a 100 MW solar farm at A19's site " + ref.site + ")",
    rows: rows(r0.results, "2025").concat(rows(R1, "Reference plan")),
    note: "Precomputed with HiGHS on " + RUN_DATE + ". Prairie City is fictional; its numbers are illustrative. With JavaScript on, you run your own plan." };
  const worst = R1.dist.slice().sort((a, b) => b.peak / b.limit - a.peak / a.limit)[0].label.toLowerCase();
  // the reference plan's evidence: the panel, the park, the site, jobs, the sensitivity (as the page computes them)
  const A13 = require(L("components/whopays.js")), JD = JSON.parse(fs.readFileSync(L("data/a13-fairness-jobs.json"), "utf8")).jobs, jb = PG.jobs(R1, A13, JD);
  const pn1 = PG.panel(R1, P), pk1 = PG.parkCost(R1, P), pk0 = PG.parkCost(R1.base, P), site1 = PG.siteInfo(SM, ref.site, ref.farm);
  const solveFn = (st, PP) => E3.solve(st, PP, { solver });
  const sens1 = await PG.runSens(R1, withSite(ref), S, P, E3, solveFn);
  ok(!!sens1, "the reference plan's sensitivity runs");
  const top1 = PG.biggest(sens1.rows), alt1 = E3.summarize(Object.assign({}, withSite(ref), { rec: "income" }), P, R1.raw, R1.base);
  const x = { upfront: b1.upfront, budget: b1.budget, dCost: R1.delta.cityCost, co2: R1.acc.city.co2, cut: PG.co2Cut(R1), up: PG.upTotal(R1), worst, burden0: R1.hh.low.burden0, burden: R1.hh.low.burden,
    altBurden: alt1.hh.low.burden, objectors: pn1.filter(p => p.cell.v !== "yes").map(p => p.key), contractT: R1.acc.contract.t, dPark: pk1 - pk0, dParkShare: (pk1 - pk0) / pk0,
    site: { id: site1.id, connectUSD: site1.connectUSD, km: site1.km, sub: site1.sub, acres: site1.acres, cf: site1.cf },
    jobs: { jobYears: jb.jobYears, jobYearsNet: jb.jobYearsNet, permDirect: jb.permDirect, permGross: jb.permGross, permNet: jb.permNet, mw: jb.mw },
    sens: { cheap: sens1.joint.cheap, dear: sens1.joint.dear, top: { label: top1.label, loText: top1.loText, hiText: top1.hiText } } };
  // the reference plan's full-year check (data/e3-full-year.json, rebuilt by test_e3-full-year.js)
  const FY = JSON.parse(fs.readFileSync(L("data/e3-full-year.json"), "utf8")), FYc = city.fullYear, c3F = FY.plans.filter(e => e.page === "c3"), er = c3F.find(e => e.id === "ref");
  const upF = V => V.dist.reduce((t, d) => t + d.upg, 0), erExtra = upF(er.year) - upF(er.days);
  x.full = { extra: erExtra, days: E3.dateList(er.year.shortDays.map(s => s.day)) };
  const c3ex = PG.exemplars(x);
  // the evidence pack: small tables from the same runs, for the summary without JavaScript
  const tb = (head, rows) => E3.tableHTML(head, rows, "c3-ev");
  const evidence = () => [
    "<p class=\"lx-hint\"><b>Who pays (screening, accounting layer, not the LP; every group adopting alike):</b></p>",
    tb(["Household group", "Home energy bills", "Energy burden", "Transport: fuel and charging"], R1.hh.rows.map(r => [r.label, E3.money(r.home0) + " → " + E3.money(r.home), PG.pct1(r.burden0) + " → " + PG.pct1(r.burden), E3.money(r.tr0) + " → " + E3.money(r.tr)])),
    "<p class=\"lx-hint\"><b>Jobs (screening, lesson A13's coefficients):</b> " + E3.kilo(jb.jobYears) + " construction job-years, 2026 to 2040 (gross), " + E3.kilo(jb.jobYearsNet) + " net of displacement; ongoing at the farms " + E3.kilo(jb.permDirect) + " direct, " + E3.kilo(jb.permGross) + " gross supported, " + E3.kilo(jb.permNet) + " net of displacement.</p>",
    "<p class=\"lx-hint\"><b>The panel:</b></p>",
    tb(["Stakeholder", "Reaction", "Why", "Their rule"], pn1.map((q, i) => [q.name, { yes: "Yes", part: "Partly", no: "No" }[q.cell.v], q.cell.t, PG.PANEL[i].rule])),
    "<p class=\"lx-hint\"><b>Sensitivity</b> (each case solved again: " + PG.SENS_HOW + "):</p>",
    tb(["Input", "Range tested", "Yearly cost against 2025", "Substation upgrades: MW, up front", "What kind of number"], sens1.rows.map(r => [r.label, r.loText + " to " + r.hiText, PG.mil(r.atLo) + " to " + PG.mil(r.atHi), PG.upText(r.upLo, r.upHi), r.kind]).concat([["All together", "every cheaper end, then every dearer end", PG.mil(sens1.joint.cheap) + " to " + PG.mil(sens1.joint.dear), PG.upText(sens1.joint.cheapUp, sens1.joint.dearUp), "a joint test"]])),
    "<p class=\"lx-hint\"><b>The five solar sites</b> (A19's screen, a " + E3.kilo(ref.farm) + " MW farm; up front: line, road and land, 2025 dollars):</p>",
    tb(["Site", "Where", "Line to", "Up front", "Capacity factor (a full year)"], SM.top.map(t => { const q = PG.siteInfo(SM, t.id, ref.farm); return [t.id + (t.id === ref.site ? " (the plan's)" : ""), q.where + " of the centre", q.sub + ", " + q.km.toFixed(1) + " km", PG.mil(q.connectUSD), (q.cf * 100).toFixed(1) + "%"]; })),
    "<p class=\"lx-hint\"><b>Full-year check</b> (all 8,760 hours of 2025, precomputed): substation upgrades " + E3.kilo(upF(er.days)) + " MW on the eight days, " + E3.kilo(upF(er.year)) + " MW sized on the year; with the eight days' upgrades, " + E3.kilo(er.year.unserved) + " MWh unserved on " + E3.dateList(er.year.shortDays.map(s => s.day)) + "; cost and CO₂ within " + (Math.max(Math.abs(er.year.cost / er.days.cost - 1), Math.abs(er.year.co2 / er.days.co2 - 1)) < 0.001 ? "0.1%" : "about " + PG.pct1(Math.max(Math.abs(er.year.cost / er.days.cost - 1), Math.abs(er.year.co2 / er.days.co2 - 1)))) + ".</p>",
    "<p class=\"lx-hint\"><b>The city's wind and solar:</b> the city used " + E3.kilo(R1.acc.contract.mwh / 1000) + " GWh a year of its farms' " + E3.kilo(R1.acc.contract.gen / 1000) + " GWh; not deducted from the location-based CO₂. At the grid's average rate those MWh come to about " + E3.kilo(R1.acc.contract.t) + " t: an illustrative grid-average comparison, not a market-based inventory result (that needs qualifying certificates and a residual mix) and not a physical cut.</p>"].join("\n");
  const withPre = Object.assign({}, P, { cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { c3: pre }) }) });
  const BLOCKS = { "c3-plan": () => SS.staticHTML(S, def), "c3-results": () => E3.fallback(withPre, "c3"), "c3-note": () => RN.outlineHTML(PG.FIELDS, PG.OUTLINE),
    "c3-exemplars": () => EX.staticHTML(c3ex), "c3-rubric": () => RB.staticHTML(PG.RUBRIC, { bar: PG.RUBRIC_BAR }), "c3-inputs": () => E3.inputsHTML(P, { c3: true }), "c3-evidence": evidence };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { c3: pre, c3ex: c3ex });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    const w = {}; Object.keys(BLOCKS).forEach(k => { w[k] = BLOCKS[k](); }); X.writeBlocks(QPATH, w);
    console.log("wrote precomputed.c3 and c3ex and the marker blocks");
  }
  const PAGE = fs.readFileSync(QPATH, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
  ok(JSON.stringify(D.precomputed.c3) === JSON.stringify(pre) && JSON.stringify(D.precomputed.c3ex) === JSON.stringify(c3ex), "precomputed.c3 and c3ex equal fresh runs (run with --write after a change)");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
  ok(!EX.validate(c3ex).length, "the exemplars are valid");
  const T = X.norm(PAGE), JS = fs.readFileSync(L("c3-prairie-city-2040.js"), "utf8");
  const has = s => ok(T.indexOf(s) >= 0, "page states " + JSON.stringify(s));

  // ---------------- the full-year check
  ok(c3F.map(e => e.id).join() === E3.c3presets.map(p => p.id).concat(["ref"]).join(), "a full-year check for each preset and the reference plan");
  ok(E3.fullFind(FY, "c3", S, withSite(ref), SS) === er && E3.fullFind(FY, "c3", S, def, SS) === c3F[0] && E3.fullFind(FY, "c3", S, Object.assign({}, ref, { site: "D" }), SS) === null, "the page finds the reference plan's and the default's checks (the site's details ignored), none for another site");
  ok(er.days.dCost === Math.round(R1.delta.cityCost / 1e3) / 1e3 && er.days.co2 === Math.round(R1.acc.city.co2), "the check's eight days are the reference plan's own run");
  const wr = E3.fullWhy(er, FYc, FY.date).map(k => k[0] + ": " + k[1]).join(" ");
  const strongF = EX.plain(c3ex.answers[1]);
  ok(er.year.unserved >= 0.5 && strongF.indexOf("(on all 8,760 hours the upgrades fall " + erExtra.toFixed(1) + " MW short, on " + E3.dateList(er.year.shortDays.map(s => s.day)) + ")") >= 0, "the strong summary states what the full-year check found (" + erExtra.toFixed(1) + " MW short)");
  ok(PG.fullAssume(er) === "Eight days stand for the year; on all 8,760 hours its upgrades fall " + erExtra.toFixed(1) + " MW short." && PG.fullAssume(c3F[0]) === "Eight days stand for the year; on all 8,760 hours its upgrades hold." &&
    /n\.assumptions = n\.assumptions\.map/.test(JS), "the summary's assumption names the full-year check's finding for a checked plan");
  ok(wr.indexOf((upF(er.year) - upF(er.days)).toFixed(1) + " MW more") >= 0 && wr.indexOf(E3.kilo(er.year.unserved) + " MWh unserved on 19 Feb and 20 Feb") >= 0 && /Wind and sun/.test(wr), "the reference plan's words: the MW more the year would buy, the unserved MWh and days, wind and sun");
  ok(c3F.filter(e => e.days.contractGWh > 0).every(e => e.year.contractGWh > e.days.contractGWh) && FYc.windCF.days < FYc.windCF.year && FYc.solarCF.days > FYc.solarCF.year, "the contract MWh are higher on the year for every plan with contracts; the eight days carry less wind and more sun than 2025");
  ok(/U\.fullCard\(res, E3\.fullFind\(FY, "c3", S, R\.state, LX\.ShareState\)/.test(JS) && !/fullYear\s*\(/.test(JS) && /e3-full-year\.json/.test(PAGE), "the card for the plan that ran; the page reads the data file and never solves the year");
  has("eight representative days, with a full-year check of the presets and the reference plan on every hour of 2025 beside the results");

  // ---------------- the brief
  has("$" + E3.kilo(cfg.c3.budget.def) + " million of up-front spending");
  const mins = (T.match(/About 150 minutes: (\d+) to build and test plans, (\d+) to site the solar farm, (\d+) to write the summary, (\d+) to check it/) || []).slice(1).map(Number);
  ok(mins.length === 4 && mins.reduce((a, b) => a + b, 0) === 150, "the time split adds to 150 minutes");
  const PY = fs.readFileSync(path.join(X.SITE, "learn/path.yml"), "utf8"), row = PY.slice(PY.indexOf("id: c3-prairie-city-2040"), PY.indexOf("id: c3-prairie-city-2040") + 1500);
  ok(/minutes: 150/.test(row) && /lab_minutes: 60/.test(row) && /sandbox: SB3/.test(row), "path.yml: 150 minutes, a 60-minute lab, built on SB3");
  has("about 60 minutes: run your plan's district levers in its last section");
  ok(/MY = dict\(DEFAULT/.test(fs.readFileSync(path.join(X.SITE, "learn/notebooks/m12-city-model.ipynb"), "utf8")), "M12's notebook has the plan section the brief names");

  // ---------------- the reference plan's words
  const strong = EX.plain(c3ex.answers[1]);
  const R = PG.REF_PLAN;
  ok(strong.indexOf("Sizes: heat pumps " + R.hp + "% · retrofits " + R.ret + "% · electric cars " + R.ev + "%, managed · batteries " + R.bat + " MW · food plants' low-temperature heat " + R.ihp + "% · wind " + R.wind + " MW · solar " + R.farm + " MW, site " + R.site) >= 0 &&
    R.evm === "managed" && R.dh === 0 && R.ely === 0 && R.pv === 0 && /build city-owned wind and solar/.test(strong), "the strong summary's levers are the reference plan's, as a short recommendation and a list of sizes");
  { const lines = strong.split("\n"), rec = lines.find(l => /^Recommendation:/.test(l)); ok(rec && rec.split(/\s+/).length <= 35 && lines.filter(l => /^Panel:/.test(l)).length === x.objectors.length, "the recommendation is one short line (" + (rec || "").split(/\s+/).length + " words); one panel line per stakeholder who objects"); }
  // the strong summary answers every objection with the run's numbers, gives the site's reason, a sensitivity result and
  // the jobs; no instruction left in place of an answer
  ok(x.objectors.length >= 2 && x.objectors.every(k => strong.indexOf(PG.ANSWER[k](x)) >= 0) && !/a line each on what I would change/.test(strong) && !/jobs not yet estimated/.test(strong), "the strong summary answers each objector (" + x.objectors.join(", ") + ")");
  const sc = SM.costs.map(c => c.connect + c.road + c.land), ia = SM.top.map(t => t.id).indexOf(ref.site);
  ok(ia === 0 && sc[ia] === Math.min(...sc) && strong.indexOf("the best of A19's five blocks and the cheapest to connect (" + PG.mil(site1.connectUSD) + ")") >= 0, "site " + ref.site + ": the screen's best block and the cheapest to connect, as the summary says");
  ok(strong.indexOf(PG.mil(sens1.joint.cheap) + " to " + PG.mil(sens1.joint.dear)) >= 0 && strong.indexOf(PG.lc1(top1.label) + " moves it most") >= 0 && sens1.rows.every(r => /set for teaching/.test(r.kind)), "the strong summary's sensitivity: the joint range and the input that moves it most");
  ok(strong.indexOf(E3.kilo(jb.jobYears) + " construction job-years to 2040 (gross), " + E3.kilo(jb.jobYearsNet) + " net of displacement") >= 0 && strong.indexOf(E3.kilo(jb.permDirect) + " direct ongoing jobs, " + E3.kilo(jb.permGross) + " gross supported, " + E3.kilo(jb.permNet) + " net") >= 0, "the strong summary's jobs: construction job-years gross and net, apart from ongoing jobs, direct, gross and net");
  ok(x.objectors.indexOf("climate") >= 0 && /city's wind and solar do not lower the location-based CO₂/.test(strong) && !/market-based report could claim/.test(strong) && near(x.cut, (r0.results.acc.city.co2 - R1.acc.city.co2) / r0.results.acc.city.co2, 1e-12), "the climate group is answered on the location-based boundary");

  // ---------------- the panel, for every preset and the reference plan
  const plans = E3.c3presets.map(p => E3.withPreset(def, p)).concat([ref, Object.assign({}, ref, { wind: 400, farm: 150, site: "E" })]);
  for (const st of plans) {
    const r = await E3.solve(withSite(st), P, { solver }); ok(r.ok, "plan optimal");
    if (!r.ok) continue;
    const Rr = r.results, pn = PG.panel(Rr, P), byKey = {}; pn.forEach(p => { byKey[p.key] = p.cell; });
    const b = PG.budget(Rr, P), up = PG.upTotal(Rr), dB = Rr.hh.low.burden - Rr.hh.low.burden0, cut = PG.co2Cut(Rr);
    ok(byKey.council.v === (b.within ? "yes" : "no"), "council: budget rule");
    ok(byKey.utility.v === (up <= 20 ? "yes" : up <= 60 ? "part" : "no"), "utility: upgrade rule (" + up.toFixed(1) + " MW)");
    ok(byKey.advocates.v === (dB <= 0 ? "yes" : dB < 0.003 ? "part" : "no"), "advocates: burden rule");
    ok(byKey.climate.v === (cut >= 0.35 ? "yes" : cut >= 0.15 ? "part" : "no"), "climate: CO2 rule (" + (cut * 100).toFixed(1) + "%)");
    const pc = PG.parkCost(Rr, P), pc0 = PG.parkCost(Rr.base, P), dp = (pc - pc0) / pc0;
    ok(byKey.park.v === (dp <= 0 ? "yes" : dp <= 0.1 ? "part" : "no"), "park: cost rule (" + (dp * 100).toFixed(1) + "%)");
    ok(byKey.rural.v === (st.farm > 0 ? "part" : "yes") && (st.farm === 0 || byKey.rural.t.indexOf(E3.kilo(Rr.sys.siteAdj.acres) + " acres") >= 0), "rural: siting rule, with the site's acres from A19");
    ok(PG.PANEL.every(p => p.rule && p.rule.length > 10), "each stakeholder's rule is stated");
    // the park's cost: its electricity at the industrial price, the gas it still burns, its new equipment
    const S1 = Rr.sys, el = P.out.foodEl + P.out.fertEl + (S1.ihpElMW + S1.elyMW) * 8760;
    ok(near(pc, el * P.price.ind + (P.out.foodGas + P.out.fertGas - S1.ihp * P.out.lowHeat / P.out.burner - S1.ely * P.out.fertGas) * P.price.gasInd + (Rr.acc.money.ihp || 0) + (Rr.acc.money.ely || 0), 1), "the park's yearly cost as stated");
  }

  // ---------------- the sensitivity: every case solved again, its upgrades re-optimized and reported
  {
    let calls = 0;
    const counted = (st, PP) => { calls++; return E3.solve(st, PP, { solver }); };
    const again = await PG.runSens(R1, withSite(ref), S, P, E3, counted);
    ok(again && calls === PG.SENS.length * 2 + 2 && JSON.stringify(again.rows) === JSON.stringify(sens1.rows), "every case is a solve: " + calls + " (each input at both ends, then the two joint cases); the same rows again");
    for (const r of sens1.rows) {
      const f = S.fields.filter(q => q.id === r.key)[0];
      if (!f) continue;
      const re = (await E3.solve(withSite(Object.assign({}, ref, { [r.key]: f.max })), P, { solver })).results;
      ok(near(r.atHi, re.delta.cityCost, 1) && near(r.upHi.mw, PG.upTotal(re), 1e-6) && near(r.upHi.usd, re.acc.upfront.up, 1), r.key + " at " + f.max + ": a fresh solve, with its upgrades (" + PG.upText(r.upLo, r.upHi) + ")");
    }
    const upc = sens1.rows.find(r => r.key === "upc"), sv = sens1.rows.find(r => r.key === "save"), fu = S.fields.find(q => q.id === "upc");
    ok(near(upc.upLo.usd, upc.upLo.mw * fu.min * 1000, 1) && near(upc.upHi.usd, upc.upHi.mw * fu.max * 1000, 1) && Math.abs(sv.upLo.mw - sv.upHi.mw) > 1, "the upgrades are re-optimized: their spending at each upgrade cost, and the MW move with the retrofit saving (" + PG.upText(sv.upLo, sv.upHi) + ")");
    const ur = PG.upRange(sens1);
    ok(ur.mwLo < PG.upTotal(R1) && ur.mwHi > PG.upTotal(R1), "the upgrades over the test bracket the plan's own " + E3.kilo(PG.upTotal(R1)) + " MW (" + E3.kilo(ur.mwLo) + " to " + E3.kilo(ur.mwHi) + ")");
  }
  const sw = PG.sensWords(R1.delta.cityCost, sens1.rows, sens1.joint, PG.upRange(sens1));
  ok(/Equipment fixed; dispatch and upgrades re-optimized \(/.test(sw) && sw.indexOf(PG.mil(PG.upRange(sens1).usdHi) + " up front") >= 0 && !/the plan held fixed/.test(sw) && sw.indexOf(PG.mil(sens1.joint.cheap)) >= 0, "the sensitivity line says what is held fixed and what is re-optimized, with the joint range and the upgrades");
  ok(!/held fixed\)|plan held fixed|re-run through the LP/.test(fs.readFileSync(L("c3-prairie-city-2040.js"), "utf8")), "no old 'plan held fixed' wording");
  // the park's gas price: the run and its 2025 baseline re-costed at the price; the joint cases equal fresh runs
  {
    const g = cfg.c3.gasInd, gr = sens1.rows.filter(r => r.key === "gasInd")[0], Q = PG.gasP(P, g.hi), base2 = (await E3.solve(withSite(ref), Q, { solver })).results;
    ok(near(gr.atHi, base2.delta.cityCost, 50) && near(Q.price.gasInd / P.price.gasInd, g.hi / city.prices.gasPerMcf.industrial, 1e-12), "the park's gas price at $" + g.hi + "/Mcf: its case is a solve at that price, with its own 2025 run (" + PG.mil(gr.atHi) + ")");
    ok(gr.atHi < gr.atLo && sens1.joint.gas[1] === g.lo, "this plan burns less gas than 2025, so a dearer gas price lowers its cost: the joint dearer case takes the low gas price");
    const J = sens1.joint;
    sens1.rows.forEach(r => { if (r.key === "gasInd") return; const f = S.fields.filter(z => z.id === r.key)[0], up = r.atHi >= r.atLo; ok(J.dearState[r.key] === (up ? f.max : f.min) && J.cheapState[r.key] === (up ? f.min : f.max), r.key + ": the joint cases take the end the one-at-a-time run says raises or lowers the cost"); });
    const jd = (await E3.solve(J.dearState, PG.gasP(P, J.gas[1]), { solver })).results, jc = (await E3.solve(J.cheapState, PG.gasP(P, J.gas[0]), { solver })).results;
    ok(near(jd.delta.cityCost, J.dear, 1) && near(jc.delta.cityCost, J.cheap, 1), "the joint dearer and cheaper cases equal fresh runs");
    ok(sens1.rows.every(r => Math.max(r.atLo, r.atHi) <= sens1.joint.dear + 1 && Math.min(r.atLo, r.atHi) >= sens1.joint.cheap - 1), "the joint cases bracket every one-at-a-time case");
  }
  // the summary: one answer box per stakeholder; the check wants four words or more from each who objects; the note's
  // results carry each reaction, objection and answer (the stakeholder response table)
  const F = PG.FIELDS;
  ok(PG.PANEL.every(q => PG.ANS_HINT[q.key]) && F.some(f => f.key === "sources" && f.need) && !F.some(f => f.key === "panel"), "one answer box per stakeholder, and a sources field");
  const w0 = {}; ok(!PG.answered(pn1, w0), "no answers: the check is open");
  x.objectors.forEach(k => { w0[k] = "I keep it, with a reason"; });
  ok(PG.answered(pn1, w0) && !PG.answered(pn1, Object.assign({}, w0, { [x.objectors[0]]: "No." })), "an answer from each who objects closes the check; a one-word answer does not");
  const WORD = { yes: "Yes", part: "Partly", no: "No" }, prs = PG.panelRows(pn1, w0, WORD);
  ok(prs.length === 6 && prs.every((r, i) => r.label === "Panel: " + PG.PANEL[i].name && r.note.indexOf(pn1[i].cell.t) === 0 && (pn1[i].cell.v === "yes" || / My answer: I keep it, with a reason$/.test(r.note))), "the note's results: each stakeholder's reaction, objection and answer");
  ok(/the panel's reactions, with your answer to each stakeholder who objects; the sensitivity table/.test(RN.outlineHTML(F, PG.OUTLINE)), "the no-JS outline says where the answers and the sensitivity table go");
  // the two pages: the run's own lines leave the reader room (the note as the page builds it, with every field empty)
  {
    const n = E3.note(ref, R1, P); n.link = "https://example.org/x#c3"; n.run = { ok: true, stale: false, text: "the 2040 plan" };
    n.results = n.results.concat(PG.panelRows(pn1, {}, WORD));
    n.assumptions = n.assumptions.map(t => /^Eight representative days/.test(t) ? PG.fullAssume(er) : t);   // as the page does for a checked plan
    n.results.push({ label: "Jobs (screening)", value: E3.kilo(jb.jobYears) + " construction job-years gross, " + E3.kilo(jb.jobYearsNet) + " net; ongoing 18 direct, 29 gross supported, 23 net", note: "lesson A13's coefficients" }); n.assumptions.push(jb.assumeLine); n.results = n.results.concat(PG.sensRows(sens1)); n.sensitivity = sw;
    // the reader's own parts left empty ("(not written yet)", 3 words each) do not count as the run's lines
    const composed = RN.compose(n, {}, F, { format: "text" }), auto = RN.countWords(composed) - 3 * (composed.match(/\(not written yet\)/g) || []).length;
    if (process.env.C3_SHOW_NOTE) console.log(composed);
    ok(auto <= PG.TWO_PAGES - 350, "the run's own lines take " + auto + " of the two pages' " + PG.TWO_PAGES + " words, leaving the reader at least 350");
  }
  // the rubric: C3's own words for uncertainty, integrity and communication; jobs and the site in the look-fors
  ok(["uncertainty", "integrity", "communication"].every(k => PG.RUBRIC.filter(c => c.id === k)[0].levels.proficient) && /joint/.test(PG.RUBRIC[1].levels.proficient) && /sources and licences/.test(PG.RUBRIC[3].levels.proficient) &&
    /jobs/.test(PG.RUBRIC[0].look) && /site/.test(PG.RUBRIC[2].look), "the rubric's levels fit what the page lets the reader do");

  // ---------------- the hooks
  ok(SM.top.length === 5 && SM.top.map(t => t.id).join("") === "ABCDE" && S.fields.filter(f => f.id === "site")[0].values.join("") === "ABCDE", "HOOK(A19): A19's five best solar blocks are the plan's sites A to E");
  ok(SM.mw === 150 && S.fields.filter(f => f.id === "farm")[0].max === SM.mw, "a farm is at most A19's 150 MW block");
  SM.top.forEach((t, k) => {
    const x = PG.siteInfo(SM, t.id, 150), co = SM.costs[k];
    ok(isFinite(x.connectUSD) && x.connectUSD > 0 && near(x.connectUSD, co.connect + co.road + co.land, 1e-6) && near(x.cfK * CFT.targets.solar.cf, co.cf, 1e-12) && /^S[1-4]$/.test(x.sub), "site " + t.id + ": line, road and land from A19's cost (" + PG.mil(x.connectUSD) + ", " + (x.cf * 100).toFixed(1) + "%, to " + x.sub + ")");
    ok(near(PG.siteInfo(SM, t.id, 75).land, co.land / 2, 1e-6) && near(PG.siteInfo(SM, t.id, 75).line, co.connect, 1e-6), "site " + t.id + ": land in proportion to the MW, the line as A19 costs it");
  });
  const rNo = (await E3.solve(ref, P, { solver })).results, x1 = PG.siteInfo(SM, ref.site, ref.farm);
  const farmOnly = Object.assign({}, ref, { wind: 0 }), fA = (await E3.solve(withSite(farmOnly), P, { solver })).results, fB = (await E3.solve(farmOnly, P, { solver })).results;
  ok(near(R1.acc.upfrontTotal - rNo.acc.upfrontTotal, x1.connectUSD, 1) && Math.abs(fA.acc.outside.farmGen / fB.acc.outside.farmGen - x1.cfK) < 1e-9, "the chosen site's up-front cost and output factor reach the plan (" + x1.cfK.toFixed(4) + ")");
  const rD = (await E3.solve(withSite(Object.assign({}, ref, { site: "D" })), P, { solver })).results;
  ok(Math.abs(rD.acc.city.money - R1.acc.city.money) > 1, "another site changes the plan's cost");
  // HOOK(A13), wired: jobs by A13's model at A13's default coefficients
  const exp = A13.jobs({ staff: 0, mineJobs: 0, multiplier: JD.multiplier.start, localShare: JD.localShare, jobYearsPerM: JD.jobYearsPerM.start, displacement: JD.displacement.start / 100,
    horizonYears: JD.horizonYears, buildYears: 15, newMW: R1.acc.upfrontTotal / 1e6, capexPerKW: 1000, omPer100MW: 0, buildDisplacement: JD.displacement.start / 100 });
  ok(jb && near(jb.jobYears, R1.acc.upfrontTotal / 1e6 * JD.localShare * JD.jobYearsPerM.start * JD.multiplier.start, 1e-6) && near(jb.jobYears, exp.buildJobYears, 1e-9), "jobs: building job-years from all up-front spending by A13's model (" + Math.round(jb.jobYears) + ")");
  ok(near(jb.jobYearsNet, exp.buildJobYearsNet, 1e-9) && near(jb.jobYearsNet, jb.jobYears * (1 - JD.displacement.start / 100), 1e-6) && jb.jobYearsNet < jb.jobYears &&
    /less " \+ Math\.round\(c\.buildDisplacement \* 100\) \+ "% displacement \(net\)/.test(JS) && /work that would have happened anyway/.test(JS),
    "jobs: net building job-years by A13's buildJobYearsNet, less A13's displacement share as A13 applies it to building and running alike, with the assumption stated (" + Math.round(jb.jobYearsNet) + ")");
  ok(near(jb.permDirect, (ref.wind + ref.farm) / 100 * JD.omPer100MW.start, 1e-9) && near(jb.permGross, jb.permDirect * JD.multiplier.start, 1e-9) && near(jb.permNet, jb.permGross * (1 - JD.displacement.start / 100), 1e-9), "jobs: ongoing direct, gross supported and net from the wind and solar farms' MW");
  ok(!/Permanent, at the wind and solar farms/.test(JS) && /Ongoing, supported by the wind and solar farms/.test(JS) && /Construction, 2026 to 2040 \(gross\) and net/.test(JS) && /" job-years gross \(about " \+ kilo\(jb\.perYear\) \+ " a year\) · " \+ kilo\(jb\.jobYearsNet\) \+ " net"/.test(JS), "jobs labelled: construction job-years gross and net, ongoing jobs supported by the farms");
  ok(/HOOK\(A19\)/.test(JS) && /HOOK\(A13\)/.test(JS) && PG.jobs(R1, null, JD) === null, "both hooks are marked; without A13's model no jobs number is shown");
  ok(!/a13-who-pays-and-benefits\.js|whopays\.js"/.test(PAGE) && /a13-fairness-jobs\.json/.test(PAGE), "A13's accounting layer comes in the bundle (components/whopays.js); the page loads its coefficients");
  ok(/<script src="\.\.\/assets\/learn\/learn\.js" defer><\/script>\s*<script src="\.\.\/assets\/learn\/c3-prairie-city-2040\.js"/.test(PAGE) && !/a19\.js"/.test(PAGE) && !/\.a19-map \{/.test(PAGE) && /a19-gis-siting\.json/.test(PAGE) && /cf_targets\.json/.test(PAGE), "A19's map comes in the bundle (components/siting.js and siting.css; no copied styles); the page loads A19's data");

  // ---------------- siting scope and the rest
  const siting = (T.match(/\b(site|siting|sited)\b[^.]*\./gi) || []).join(" ");
  ok(!/wind farm site|transmission corridor|data[- ]center site/i.test(siting), "the only siting is a solar farm");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(PAGE + JS), "no nuclear term (siting scope)");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS), "no AI wording");
  ok(T.indexOf(city.about.line) >= 0, "the fictional line");
  ["brief", "plan", "note", "selfcheck", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (C3)");
  process.exit(fails ? 1 : 0);
})();
