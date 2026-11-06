// test_c3-prairie-city-2040.js — Node tests for C3 (learn/c3-prairie-city-2040.qmd, assets/learn/c3-prairie-city-2040.js),
// on engine E3 (its own tests: test_e3-engine.js). What it checks:
//   - the no-JS blocks: the plan's table (LX.ShareState.staticHTML), the results of 2025 and of the reference plan
//     (precomputed.c3), the summary's outline (LX.ReportNote.outlineHTML), the exemplars (LX.Exemplars.staticHTML of
//     precomputed.c3ex, written from a fresh run of the reference plan), the rubric (LX.Rubric.staticHTML), the inputs
//   - the brief's numbers: the budget, the time split adding to 150 minutes, the Modeler version's 60 minutes
//   - the reference plan: within the budget, its exemplar numbers equal a fresh run, its levers as the strong summary says
//   - the stakeholder panel: every reaction true of its run and its stated rule, for every preset and the reference plan
//   - the sensitivity: inputs moved to the ends of their ranges, the plan held fixed (re-solved where the LP depends on
//     them); accounting-only inputs equal a re-solve
//   - the hooks: A19's siting (no site changes a number until the map is wired) and A13's jobs (no number shown)
//   - guard G-GIS: the only siting on the page is a solar farm; no nuclear term on the page, its script or the data; no
//     AI wording
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
  const A19 = require(L("a19.js")), AD = A19.withCity(JSON.parse(fs.readFileSync(L("data/a19-gis-siting.json"), "utf8")), city), CFT = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
  const SM = PG.siteModel(A19, AD, { solar: CFT.targets.solar.cf, wind: CFT.targets.wind.cf });
  const withSite = st => { const x = Object.assign({}, st); if (st.farm > 0) x.siteInfo = PG.siteInfo(SM, st.site, st.farm); return x; };
  const r0 = await E3.solve(def, P, { solver }), r1 = await E3.solve(withSite(ref), P, { solver });
  ok(r0.ok && r1.ok, "2025 and the reference plan run optimal");
  const R1 = r1.results, b1 = PG.budget(R1, P);
  ok(b1.within, "the reference plan is within the budget (" + PG.mil(b1.upfront) + ")");
  const rows = (R, tag) => [[tag + ": up front, 2026 to 2040 (2025 dollars)", PG.mil(R.acc.upfrontTotal) + " of a " + PG.mil(cfg.c3.budget.def * 1e6) + " budget"],
    [tag + ": the city's yearly cost against 2025", PG.smil(R.delta.cityCost)], [tag + ": the city's CO₂ (location-based, operating)", E3.kilo(R.acc.city.co2) + " t a year"],
    [tag + ": busiest hour against the limit, core · suburbs · fringe", R.dist.map(d => E3.kilo(d.peak) + "/" + E3.kilo(d.limit)).join(" · ") + " MW"],
    [tag + ": energy burden, homes below 80% of area median income (screening)", PG.pct1(R.hh.low.burden)]];
  const pre = { head: "Result: 2025 as it is, then the reference plan of the exemplars (70% heat pumps, 40% electric cars, 200 MW of wind, a 100 MW solar farm at A19's site " + ref.site + ")",
    rows: rows(r0.results, "2025").concat(rows(R1, "Reference plan")),
    note: "Precomputed with HiGHS on " + RUN_DATE + ". Prairie City is fictional; its numbers are illustrative. With JavaScript on, you run your own plan." };
  const worst = R1.dist.slice().sort((a, b) => b.peak / b.limit - a.peak / a.limit)[0].label.toLowerCase();
  const x = { upfront: b1.upfront, budget: b1.budget, dCost: R1.delta.cityCost, co2: R1.acc.city.co2, cut: PG.co2Cut(R1), up: PG.upTotal(R1), worst, burden0: R1.hh.low.burden0, burden: R1.hh.low.burden,
    objectors: PG.panel(R1, P).filter(p => p.cell.v !== "yes").map(p => p.name.toLowerCase()) };
  const c3ex = PG.exemplars(x);
  const withPre = Object.assign({}, P, { cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { c3: pre }) }) });
  const BLOCKS = { "c3-plan": () => SS.staticHTML(S, def), "c3-results": () => E3.fallback(withPre, "c3"), "c3-note": () => RN.outlineHTML(PG.FIELDS),
    "c3-exemplars": () => EX.staticHTML(c3ex), "c3-rubric": () => RB.staticHTML(PG.RUBRIC, { bar: PG.RUBRIC_BAR }), "c3-inputs": () => E3.inputsHTML(P, { c3: true }) };
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
  ok(strong.indexOf(R.hp + "% of furnaces") >= 0 && strong.indexOf("retrofit " + R.ret + "%") >= 0 && strong.indexOf(R.ev + "% of cars") >= 0 && strong.indexOf(R.bat + " MW of substation batteries") >= 0 &&
    strong.indexOf(R.wind + " MW of wind") >= 0 && strong.indexOf(R.farm + " MW solar farm at site " + R.site) >= 0 && R.ihp === 100 && R.dh === 0 && R.ely === 0 && R.pv === 0, "the strong summary's levers are the reference plan's");

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

  // ---------------- the sensitivity: the accounting-only inputs equal a re-solve
  for (const sx of PG.SENS.filter(s => !s.solve)) {
    const f = S.fields.filter(q => q.id === sx.key)[0];
    for (const v of [f.min, f.max]) {
      const s = withSite(Object.assign({}, ref, { [sx.key]: v })), acc = E3.summarize(s, P, R1.raw, R1.base), re = (await E3.solve(s, P, { solver })).results;
      ok(near(acc.delta.cityCost, re.delta.cityCost, 50), sx.key + " at " + v + ": the accounting equals a re-solve (" + PG.mil(acc.delta.cityCost) + ")");
    }
  }
  const sw = PG.sensWords(R1.delta.cityCost, [{ label: "Upgrade cost", loText: "$200/kW", hiText: "$2,000/kW", atLo: 1, atHi: 2 }]);
  ok(/the plan held fixed/.test(sw), "the sensitivity line says the plan is held fixed");

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
  const A13 = require(L("a13-who-pays-and-benefits.js")), JD = JSON.parse(fs.readFileSync(L("data/a13-fairness-jobs.json"), "utf8")).jobs, jb = PG.jobs(R1, A13, JD);
  const exp = A13.jobs({ staff: 0, mineJobs: 0, multiplier: JD.multiplier.start, localShare: JD.localShare, jobYearsPerM: JD.jobYearsPerM.start, displacement: JD.displacement.start / 100,
    horizonYears: JD.horizonYears, buildYears: 15, newMW: R1.acc.upfrontTotal / 1e6, capexPerKW: 1000, omPer100MW: 0 });
  ok(jb && near(jb.jobYears, R1.acc.upfrontTotal / 1e6 * JD.localShare * JD.jobYearsPerM.start * JD.multiplier.start, 1e-6) && near(jb.jobYears, exp.buildJobYears, 1e-9), "jobs: building job-years from all up-front spending by A13's model (" + Math.round(jb.jobYears) + ")");
  ok(near(jb.permGross, (ref.wind + ref.farm) / 100 * JD.omPer100MW.start * JD.multiplier.start, 1e-9) && near(jb.permNet, jb.permGross * (1 - JD.displacement.start / 100), 1e-9), "jobs: permanent gross and net from the wind and solar farms' MW");
  ok(/HOOK\(A19\)/.test(JS) && /HOOK\(A13\)/.test(JS) && PG.jobs(R1, null, JD) === null, "both hooks are marked; without A13's model no jobs number is shown");
  ok(/a13-who-pays-and-benefits\.js/.test(PAGE) && /a13-fairness-jobs\.json/.test(PAGE), "the page loads A13's accounting layer and its coefficients");
  ok(/<script src="\.\.\/assets\/learn\/a19\.js" defer><\/script>\s*<script src="\.\.\/assets\/learn\/c3-prairie-city-2040\.js"/.test(PAGE) && /a19-gis-siting\.json/.test(PAGE) && /cf_targets\.json/.test(PAGE), "the page loads A19's map before its own script, and A19's data");

  // ---------------- guard G-GIS and the rest
  const siting = (T.match(/\b(site|siting|sited)\b[^.]*\./gi) || []).join(" ");
  ok(!/wind farm site|transmission corridor|data[- ]center site/i.test(siting), "the only siting is a solar farm");
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(PAGE + JS), "no nuclear term (guard G-GIS)");
  ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(PAGE + JS), "no AI wording");
  ok(T.indexOf(city.about.line) >= 0, "the fictional line");
  ["brief", "plan", "note", "selfcheck", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (C3)");
  process.exit(fails ? 1 : 0);
})();
