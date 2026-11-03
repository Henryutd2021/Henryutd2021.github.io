// test_m03-capacity-expansion.js — Node tests for M3 (assets/learn/m03-capacity-expansion.js on the shared planning
// engine, assets/learn/components/planengine.js) with the vendored HiGHS, the solver core the page runs in its Web Worker.
//   - inputs: the second weather year (2024) has 8,760 hours, the 2025 town's demand energy and the same capacity factors;
//     the seven-week set is lesson 13's model exactly (same objective as 13-capstone.json's 200 kt frontier point)
//   - the weeks: for every set, weights add up to 8,760 h and every calendar week maps to the representative standing
//     for it
//   - the three storage rules: linked (the calendar chain closes, the year's net change is zero), cyclic (every
//     representative week ends where it starts), no link (energy appears: the calendar weeks' net changes sum below zero)
//   - the reference block of data/m03-capacity-expansion.json: every number re-solved (plans, estimates, the full-year
//     checks on 2025 and 2024, the full-year optimum, the storage what-if, the real-cost storage agreement)
//   - every number the page states: the fallback table, Go deeper, myths and quiz, the step cards' fixed text, the
//     notebook's reference to the same data, the sidecar's glossary terms; scope of the data and script strings
// Usage (from the site folder):  node _tests/learn/test_m03-capacity-expansion.js [--write]
//   --write  re-solve and rewrite the reference block first (the full-year optimum takes seconds to a minute)
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
const P = pctx.module.exports;
const M = require(L("m03-capacity-expansion.js"));
const TP = require(L("components/planengine.js"));
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const DPATH = L("data/m03-capacity-expansion.json");
const PAGE = readOr(path.join(SITE, "learn/m03-capacity-expansion.qmd")), JS = fs.readFileSync(L("m03-capacity-expansion.js"), "utf8");
const NB = readOr(path.join(SITE, "learn/notebooks/m03-capacity-expansion.ipynb")), SIDE = readOr(path.join(SITE, "learn/_w1/m03-capacity-expansion.yml"));
const WRITE = process.argv.includes("--write");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const rel = (a, b, r) => Math.abs(a - b) <= r * Math.max(1, Math.abs(b));
const PAGE0 = PAGE.replace(/ data-label="[^"]*"/g, "");
const onPage = (s, what) => ok(PAGE0.includes(s), `page states ${what}: "${s}"`);
const fm = M.fm;
const r1 = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

(async () => {
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solve = m => core.solveWith(highs, m, { timeLimit: 900 });
  const cfg = J("13-capstone.json"), year = J("town_year.json"), T = J("cf_targets.json"), Y2raw = J("m03-capacity-expansion-2024.json");
  let D = J("m03-capacity-expansion.json");
  let S = M.prepare(cfg, D, year, T, Y2raw, P.townProfile);
  const cap = D.cap * 1e3;
  const keepPlan = p => M.roundPlan(p);
  const keepCheck = c => ({ cost: r1(c.cost, 0), co2: r1(c.co2, 0), unserved: r1(c.unserved, 1), hours: c.hours, maxShort: r1(c.maxShort, 1),
                            shortWeeks: c.byWeek.map((x, i) => (x > 0.05 ? i : -1)).filter(i => i >= 0) });

  // ---------------- --write: the reference block
  if (WRITE) {
    const ref = { about: "Written by node _tests/learn/test_m03-capacity-expansion.js --write; re-solved by the same test on every run. Costs in $ a year, CO2 in t a year, energy in MWh, power in MW.", sets: {}, storage: {} };
    let t0 = Date.now();
    const fm0 = M.fullModel(S.C, S.Y, cap), rf = solve(fm0), sf = TP.summarize(S.C, TP.yearPeriods(S.Y), rf, { cap });
    const fplan = keepPlan(sf.plan), f24 = TP.readCheck(S.C, S.Y2, solve(M.checkModel(S.C, S.Y2, fplan)), fplan);
    ref.full = { cols: fm0.variables.length, rows: fm0.constraints.length, plan: fplan, cost: r1(sf.cost, 0), co2: r1(sf.co2, 0), capDual: r1(sf.capDual, 2), y2024: keepCheck(f24) };
    console.log(`  wrote the full-year optimum (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    D.sets.forEach(set => {
      const RW = S.weeks(set.id), m = M.planModel(S.C, RW, { cap }), r = solve(m), est = M.readPlan(S.C, RW, r, { cap }), plan = keepPlan(est.plan);
      const c25 = TP.readCheck(S.C, S.Y, solve(M.checkModel(S.C, S.Y, plan)), plan), c24 = TP.readCheck(S.C, S.Y2, solve(M.checkModel(S.C, S.Y2, plan)), plan);
      ref.sets[set.id] = { weeks: RW.reps.length, hours: RW.reps.length * M.HPW, cols: m.variables.length, rows: m.constraints.length,
                           picks: RW.reps.map(r => ({ week: r.week, kind: r.kind, season: r.season, n: r.n })), plan, cost: r1(est.cost, 0), co2: r1(est.co2, 0),
                           y2025: keepCheck(c25), y2024: keepCheck(c24) };
    });
    const st = D.storage, RWs = S.weeks(st.set);
    st.modes.forEach(mode => {
      const r = solve(M.planModel(S.Cw, RWs, { cap: st.cap * 1e3, mode })), est = M.readPlan(S.Cw, RWs, r, { cap: st.cap * 1e3 }), plan = keepPlan(est.plan);
      const c = TP.readCheck(S.Cw, S.Y, solve(M.checkModel(S.Cw, S.Y, plan)), plan);
      const rr = solve(M.planModel(S.C, RWs, { cap: st.cap * 1e3, mode }));
      ref.storage[mode] = { plan, cost: r1(est.cost, 0), full: keepCheck(c), fullCo2: r1(c.co2, 0), realCost: r1(rr.objective, 0) };
    });
    D.reference = ref;
    fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n");
    D = J("m03-capacity-expansion.json"); S = M.prepare(cfg, D, year, T, Y2raw, P.townProfile);
    console.log("  wrote the reference block of data/m03-capacity-expansion.json");
  }
  const R = D.reference;
  ok(R && R.sets && R.full && R.storage, "the data file has a reference block (run with --write once)");

  // ---------------- the promoted pieces: M3 calls the engine's link, readCheck and errors and the library's week strip
  ok(M.link === TP.link && M.readCheck === TP.readCheck && M.errors === TP.errors && M.yearPeriods === TP.yearPeriods, "M3 lists the engine's link, readCheck, errors and yearPeriods (the same functions)");
  ok(!/function (link|readCheck|errors|yearPeriods|WeekStrip|repColor|repLetter)\(/.test(JS) && /LX\.WeekStrip\(/.test(JS) && !/m3-(strip|grid|cell|keys)/.test(JS), "M3 keeps no copy of them or of the strip and its styles");

  // ---------------- inputs
  const Y = S.Y, Y2 = S.Y2, sum = a => a.reduce((s, v) => s + v, 0), mean = a => sum(a) / a.length;
  ok(Y2.demand.length === 8760 && Y2raw.demand.length === 8760 && Y2raw.start_utc === "2024-01-01T07:00:00", "2024: 8,760 hours from 00:00 CST on 1 January (29 February left out)");
  ok(rel(sum(Y2.demand), sum(Y.demand), 1e-12), "2024 is scaled to the 2025 town's yearly demand energy");
  ok(near(mean(Y2.wind), T.targets.wind.cf, 1e-6) && near(mean(Y2.solar), T.targets.solar.cf, 1e-6), "2024 wind and solar at the same capacity factors (33.8%, 24.0%)");
  const peak24 = Math.max(...Y2.demand);
  ok(peak24 > Y.peak, `2024's peak at equal energy (${peak24.toFixed(1)} MW) is above 2025's 450 MW`);
  ok(/build_learn_m03_weather_year\.py/.test(Y2raw.meta.built_by) && Y2raw.meta.files.length === 2 && /eia\.gov/.test(Y2raw.meta.source_url), "2024 data: builder script, two EIA-930 files with checksums, source URL");
  const C = S.C;
  ok(near(S.Cw.techs.be.fixed, 1000 * D.storage.energyCapex * (TP.crf(0.04, 15) + 0.04), 1e-6) && near(S.Cw.techs.bp.fixed, C.techs.bp.fixed, 1e-9), "what-if: only the storage energy cost changes");

  // ---------------- the weeks
  D.sets.forEach(set => {
    const RW = S.weeks(set.id);
    ok(near(sum(RW.reps.map(r => r.weight * 168)), 8760, 1e-6) && RW.chrono.length === 52 && RW.chrono.every((k, i) => RW.reps[k].members.includes(i)),
       `${set.label}: weights add to 8,760 h; every calendar week maps to its representative`);
    ok(RW.reps.length === R.sets[set.id].weeks && RW.reps.filter(r => r.kind !== "season").length === set.extremes.length, `${set.label}: ${RW.reps.length} weeks, ${set.extremes.length} extreme`);
    ok(JSON.stringify(RW.reps.map(r => ({ week: r.week, kind: r.kind, season: r.season, n: r.n }))) === JSON.stringify(R.sets[set.id].picks), `${set.label}: the weeks chosen are the reference's (the notebook asserts them too)`);
    let worst = 0, demandOK = true;
    RW.reps.filter(r => r.kind === "season").forEach(r => {
      ["demand", "wind", "solar"].forEach(k => {
        let real = 0; r.members.forEach(m => { for (let h = 0; h < 168; h++) real += Y[k][m * 168 + h]; });
        const mod = r[k].reduce((a, b) => a + b, 0) * r.n;
        if (k === "demand") { if (!rel(mod, real, 1e-9)) demandOK = false; } else worst = Math.max(worst, 1 - mod / real);
      });
    });
    ok(demandOK && worst >= -1e-9 && worst < 0.005, `${set.label}: each group keeps its demand energy, and its wind and solar energy within 0.5% (capping at the plant's size loses ${(worst * 100).toFixed(2)}%)`);
  });
  const wk7 = S.weeks("wk7");
  const m7 = M.planModel(C, wk7, { cap }), l13 = TP.weekModel(C, TP.selectWeeks(Y, cfg.weeks), { cap });
  ok(m7.variables.length === l13.variables.length && m7.constraints.length === l13.constraints.length, "4 + 3 extreme weeks is lesson 13's seven-week model");
  const r7 = solve(m7), p200 = cfg.frontier.points.find(p => p.cap === 200);
  ok(r7.ok && rel(r7.objective, p200.cost, 1e-6), `the 4 + 3 estimate equals lesson 13's 200 kt frontier point (${fm.musd(p200.cost)})`);

  // ---------------- the three storage rules (what-if costs, where the battery is large)
  const st = D.storage, RWs = S.weeks(st.set), scap = st.cap * 1e3, sol = {};
  st.modes.forEach(mode => { sol[mode] = solve(M.planModel(S.Cw, RWs, { cap: scap, mode })); });
  const delta = (r, k) => r.values["s" + k + "_167"] || 0;
  const yearNet = r => sum(RWs.chrono.map(k => delta(r, k)));
  ok(near(yearNet(sol.linked), 0, 1e-4), "linked: the calendar chain closes (the year's net change is zero)");
  let chainOK = true;
  for (let i = 0; i < 52; i++) if (!near(sol.linked.values["W" + ((i + 1) % 52)], sol.linked.values["W" + i] + delta(sol.linked, RWs.chrono[i]), 1e-4)) chainOK = false;
  ok(chainOK, "linked: S(i+1) = S(i) + Δ for all 52 calendar weeks");
  ok(RWs.reps.every((r, k) => near(delta(sol.cyclic, k), 0, 1e-6)), "cyclic: every representative week ends where it starts");
  ok(yearNet(sol.free) < -1000, `no link: the 52 weeks' net changes sum to ${Math.round(yearNet(sol.free)).toLocaleString("en-US")} MWh, energy from nothing`);
  ok(M.planModel(S.Cw, RWs, { cap: scap, mode: "free" }).constraints.length === M.planModel(S.Cw, RWs, { cap: scap }).constraints.length - 52, "no link drops exactly the 52 chain rows");

  // ---------------- every reference number, re-solved
  const t0 = Date.now(), fm0 = M.fullModel(C, Y, cap), rf = solve(fm0), sf = TP.summarize(C, TP.yearPeriods(Y), rf, { cap }), fullSecs = (Date.now() - t0) / 1000;
  ok(rf.ok && rel(sf.cost, R.full.cost, 1e-6) && near(sf.co2, R.full.co2, 1) && rel(sf.capDual, R.full.capDual, 1e-3) && fm0.variables.length === R.full.cols && fm0.constraints.length === R.full.rows,
     `full-year optimum: ${fm.musd(sf.cost)}, ${fm.kt(sf.co2)}, last tonne $${sf.capDual.toFixed(0)} (${fullSecs.toFixed(1)} s here)`);
  ok(TP.KEYS.every(k => near(sf.plan[k], R.full.plan[k], 0.05)), "full-year optimum: the plan");
  const chk = (Yx, plan) => TP.readCheck(C, Yx, solve(M.checkModel(C, Yx, plan)), plan);
  const same = (c, r, what) => ok(rel(c.cost, r.cost, 1e-6) && near(c.co2, r.co2, 1) && near(c.unserved, r.unserved, 0.1) && c.hours === r.hours && near(c.maxShort, r.maxShort, 0.1) &&
    JSON.stringify(c.byWeek.map((x, i) => (x > 0.05 ? i : -1)).filter(i => i >= 0)) === JSON.stringify(r.shortWeeks), `${what}: ${fm.musd(c.cost)}, ${fm.kt(c.co2)}, ${fm.mwh(c.unserved)} in ${c.hours} h`);
  same(chk(Y2, R.full.plan), R.full.y2024, "full-year optimum on 2024");
  const est = {};
  D.sets.forEach(set => {
    const RW = S.weeks(set.id), m = M.planModel(C, RW, { cap }), r = solve(m), e = M.readPlan(C, RW, r, { cap }), ref = R.sets[set.id];
    est[set.id] = e;
    ok(r.ok && rel(e.cost, ref.cost, 1e-6) && near(e.co2, cap, 1) && TP.KEYS.every(k => near(e.plan[k], ref.plan[k], 0.01)) && m.variables.length === ref.cols && m.constraints.length === ref.rows,
       `${set.label}: estimate ${fm.musd(e.cost)}, LP ${m.variables.length} x ${m.constraints.length}`);
    same(chk(Y, ref.plan), ref.y2025, `${set.label} on 2025`);
    same(chk(Y2, ref.plan), ref.y2024, `${set.label} on 2024`);
  });
  st.modes.forEach(mode => {
    const e = M.readPlan(S.Cw, RWs, sol[mode], { cap: scap }), ref = R.storage[mode];
    ok(rel(e.cost, ref.cost, 1e-6) && TP.KEYS.every(k => near(e.plan[k], ref.plan[k], 0.01)), `storage ${mode}: ${batText(e.plan)} MW/MWh, ${fm.musd(e.cost)}`);
    const c = TP.readCheck(S.Cw, Y, solve(M.checkModel(S.Cw, Y, ref.plan)), ref.plan);
    ok(near(c.co2, ref.full.co2, 1) && near(c.unserved, ref.full.unserved, 0.1) && c.hours === ref.full.hours, `storage ${mode} on the full year: ${fm.kt(c.co2)}, ${fm.mwh(c.unserved)}`);
    ok(rel(solve(M.planModel(C, RWs, { cap: scap, mode })).objective, ref.realCost, 1e-6), `storage ${mode} at the real cost: ${fm.musd(ref.realCost)}`);
  });
  function batText(p) { return Math.round(p.bp) + " / " + Math.round(p.be); }

  // ---------------- what the page says about these numbers (claims checked against the reference)
  const S7 = R.sets, F = R.full, E = id => S7[id].cost / F.cost - 1, ids = ["typ4", "wk7", "typ8", "wk11", "wk15"];
  ok(ids.every(id => E(id) < 0), "every estimate is below the full-year optimum");
  ok(E("typ4") < E("typ8") && E("typ8") < E("wk7") && E("wk7") < E("wk11") && E("wk11") < E("wk15"), "estimate error shrinks in the table's size order (4, 8, 4+3, 8+3, 12+3)");
  ok(S7.typ8.y2025.unserved > S7.wk7.y2025.unserved && S7.typ8.y2024.unserved > S7.wk7.y2024.unserved, "8 typical weeks do worse than 4 + 3 extreme on both years (step 6's answer)");
  ok(S7.wk15.y2025.unserved === 0 && S7.wk15.y2025.co2 > cap && S7.wk15.y2024.hours > 0, "12 + 3: every hour of 2025 served, CO2 over the cap, short in some hours of 2024");
  ok(F.y2024.hours > 0 && F.y2024.unserved > 0, "the full-year optimum of 2025 is short in some hours of 2024");
  ok(ids.every(id => S7[id].y2025.co2 > cap), "every plan overshoots the cap on the full year of 2025");
  ok(Math.abs(S7.wk7.y2025.cost / S7.wk7.cost - 1) <= 0.02 && Math.abs(S7.wk7.y2024.cost / S7.wk7.cost - 1) <= 0.02, "conclusion card: the 4 + 3 plan's cost is within 2% of its estimate on both years");
  ok(Math.abs(S7.wk7.y2024.cost / S7.wk7.y2025.cost - 1) <= 0.01, "conclusion card: the plan's yearly cost differs by at most 1% between the years");
  ok(Math.abs(S7.typ4.y2025.cost / S7.typ4.cost - 1) <= 0.02, "step 4: the four-week cost holds within 2%");
  const SR = R.storage, realSpread = Math.max(...st.modes.map(m => SR[m].realCost)) - Math.min(...st.modes.map(m => SR[m].realCost));
  ok(realSpread < 0.1e6, `at the real storage cost the three rules agree within $0.1M (spread $${Math.round(realSpread).toLocaleString("en-US")})`);
  ok(SR.free.cost < SR.linked.cost && SR.free.plan.be > 2 * SR.linked.plan.be && SR.free.fullCo2 > SR.linked.fullCo2, "no link: cheapest on paper, more battery, more CO2 on the full year (step 8's answer)");
  ok(Math.abs(SR.cyclic.cost - SR.linked.cost) < 0.005 * SR.linked.cost, "linked and cyclic agree at the what-if cost (step 8's sentence)");
  ok(S7.wk7.plan.wind > S7.wk7.plan.cc && Math.max(...TP.KEYS.map(k => S7.wk7.plan[k])) === S7.wk7.plan.wind, "the 4 + 3 plan's largest build is wind");

  // the fallback table and Go deeper
  const unsTxt = c => (c.unserved < 0.5 ? "0" : fm.mwh(c.unserved));
  ids.forEach(id => {
    const s = D.sets.find(x => x.id === id), r = S7[id];
    onPage(`<tr><td>${s.label}</td><td>${fm.musd(r.cost)}</td><td>${fm.spct(E(id))}</td><td>${unsTxt(r.y2025)}</td><td>${unsTxt(r.y2024)}</td><td>${fm.kt(r.y2025.co2)}</td></tr>`, `the fallback row for ${s.label}`);
  });
  onPage(`full-year optimum: ${fm.musd(F.cost)}, an LP`, "the full-year optimum in the fallback");
  onPage(`${F.cols.toLocaleString("en-US")} columns`, "the full-year LP's size");
  onPage(`${fm.mwh(F.y2024.unserved)} in ${F.y2024.hours} hours of 2024`, "the full-year optimum on 2024");
  onPage(`13 \\times 8{,}760 / 8{,}736 = ${(13 * 8760 / 8736).toFixed(2)}`, "the weight of a week standing for 13 weeks");
  onPage(`${fm.mwh(SR.free.plan.be)} of battery`, "the no-link battery (myth)");
  onPage(`emits ${fm.kt(SR.free.fullCo2)}`, "the no-link plan's full-year CO2 (myth)");
  onPage(`8 typical weeks leave ${fm.mwh(S7.typ8.y2025.unserved)} unserved on the full year; 4 typical + 3 extreme leave ${fm.mwh(S7.wk7.y2025.unserved)}`, "the more-weeks myth");
  onPage(`short in ${F.y2024.hours} hours of 2024`, "the adequacy myth");
  const q = S7.wk7.cost / F.cost - 1, a = (S7.wk7.cost / 1e6).toFixed(2), b = (F.cost / 1e6).toFixed(2);
  onPage(`The seven weeks estimate $${a}M a year; the full-year optimum costs $${b}M.`, "the quiz");
  onPage(`${(+a / +b - 1 >= 0 ? "+" : "−")}${Math.abs((+a / +b - 1) * 100).toFixed(1)}%: ${a} ÷ ${b} − 1 = ${(+a / +b - 1).toFixed(3).replace("-", "−")}`, "the quiz answer");
  ok(Math.abs((+a / +b - 1) - q) < 0.001, "the quiz's rounded numbers give the model's error to 0.1 point");
  onPage(`${fm.mwh(S7.typ4.y2025.unserved)} unserved in ${S7.typ4.y2025.hours} hours of 2025, spread over ${S7.typ4.y2025.shortWeeks.length} weeks`, "the four-week shortfall (Go deeper)");
  onPage(`| −3.0% |`.replace("−3.0%", fm.spct(E("wk7"))), "the estimate error in the Go deeper table");
  onPage(`| ${fm.spct(S7.wk7.y2025.cost / S7.wk7.cost - 1)} on 2025 |`, "the cost gap in the Go deeper table");
  onPage(`| ${fm.mwh(S7.wk7.y2025.unserved)} in ${S7.wk7.y2025.hours} hours |`, "the 4 + 3 shortfall in the Go deeper table");
  onPage(`cut the full-year shortfall from ${fm.mwh(S7.typ4.y2025.unserved).replace(" MWh", "")} to ${fm.mwh(S7.wk7.y2025.unserved)}`, "the explain fallback");
  onPage(`gives +${((F.cost / S7.wk7.cost - 1) * 100).toFixed(1)}%`, "the quiz's wrong denominator");
  onPage(`−$${((F.cost - S7.wk7.cost) / 1e6).toFixed(2)}M is the gap in dollars`, "the quiz's dollar gap");
  onPage(`<td class="n">${fm.spct(E("wk7"))}</td>`, "numbers to remember: the seven weeks' error");
  onPage(`an LP with ${F.cols.toLocaleString("en-US")} columns solved on all 8,760 hours`, "the full-year LP in the fallback hint");
  onPage(`${fm.kt(S7.wk7.y2025.co2)} on 2025 and ${fm.kt(S7.wk7.y2024.co2)} on 2024`, "the 4 + 3 plan's CO2 (Go deeper)");
  onPage("$" + D.storage.energyCapex + " per kWh", "the what-if storage cost");
  onPage("keeps its demand energy, and its wind and solar energy to within 0.5%", "the scaling sentence (checked per set above)");
  const ILL = "illustrative what-if", NOT = "not a forecast or a sourced cost";
  ok(D.storage.energyCapexNote.includes("An " + ILL + ", " + NOT) && D.storage.energyCapexNote.includes("$" + D.storage.energyCapex + " per kWh") &&
     D.storage.energyCapexNote.includes("$" + cfg.techs.battery.energyCapex + " per kWh"), "data file: the what-if storage cost carries its illustrative note");
  onPage(`with storage energy at $${D.storage.energyCapex} per kWh: an ${ILL}, ${NOT}.`, "the no-JS fallback's what-if label");
  onPage(`<b>Storage what-if (step 8):</b> battery energy at $${D.storage.energyCapex} per kWh instead of the sourced $${cfg.techs.battery.energyCapex} (lesson 13): an ${ILL}, ${NOT}.`, "the data note's what-if label");
  onPage(`In an ${ILL} with storage energy at $${D.storage.energyCapex} per kWh (${NOT})`, "the myth answer's what-if label");
  ok(JS.includes("**An " + ILL + ", " + NOT + ":** battery energy at $") && JS.includes("In this " + ILL + ", no link") && JS.includes("at the " + ILL + " storage cost"),
     "step 8: the note, the result line and the table name label the what-if");
  ok((PAGE.match(/\$20 per kWh/g) || []).length === 3 && (JS.match(/D\.storage\.energyCapex \+ " per kWh/g) || []).length === 1, "the what-if cost appears only where it is labelled (three page places, one step note)");
  onPage("0.05291", "the CO2 factor"); onPage(`${C.techs.cc.co2.toFixed(3)}\\, g`, "the combined-cycle CO2 rate in the algebra");
  onPage(`${peak24.toFixed(0)} MW`, "2024's peak at equal energy");

  // ---------------- the step cards' fixed text, the notebook, the sidecar
  ok(JS.includes("× 8,760 ÷ 8,736") && JS.includes("\"m03-capacity-expansion\"") && JS.includes("within $0.1M"), "step text: the 31 December factor and the $0.1M agreement");
  ok(!/always|never/i.test(JS.replace(/\/\/.*$/gm, "").match(/"[^"\n]*"/g).join(" ")), "no 'always' or 'never' in the page's strings");
  ok(NB.includes("m03-capacity-expansion.json") && NB.includes("reference") && NB.includes("assert") && NB.includes("linprog"), "notebook: reads the reference block and asserts it with linprog");
  ok(NB.includes("13-capstone.json") && NB.includes("town_year.json") && NB.includes("m03-capacity-expansion-2024.json"), "notebook: the same four data files");
  ["period-weight", "resource-adequacy", "medoid"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE), `sidecar defines ${id}`));

  // ---------------- scope: no data or script sentence pairs nuclear with a risk term
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  const strs = []; (function walk(o) { if (typeof o === "string") strs.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  (JS.match(/"[^"\n]*"/g) || []).forEach(s => strs.push(s));
  PAGE.split(/\n/).forEach(s => strs.push(s));
  const bad = []; strs.forEach(s => s.split(/(?<=[.;:!?])\s+/).forEach(x => { if (NUC.test(x) && RISK.test(x.replace(/merit[- ]order|in order to|orders? of magnitude/gi, ""))) bad.push(x.slice(0, 120)); }));
  ok(!bad.length, "no sentence pairs nuclear with a risk term: " + bad.join(" | "));

  console.log(`test_m03-capacity-expansion: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
