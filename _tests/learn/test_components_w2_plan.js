// test_components_w2_plan.js — Node tests for the shared planning pieces first written for lesson M3:
// LX.townPlan.link, .yearPeriods, .readCheck and .errors (components/planengine.js) and LX.WeekStrip
// (components/weekstrip.js, weekstrip.css).
//   - files: exported for Node and in the browser, in the generated bundle (learn.js, learn.css), colours from --lx-*
//     tokens only, and no copy left in M3
//   - link: "linked" returns the model unchanged; "cyclic" adds one row s<p>_167 = 0 per representative week; "free" drops
//     exactly the 52 calendar-chain rows; any other mode throws; solved with the vendored HiGHS on a small what-if, the
//     three rules order the costs (no link <= cyclic, linked) and keep their identities
//   - readCheck on a synthetic full-year result: unserved MWh, hours above 0.05 MW, the largest shortfall, each calendar
//     week's MWh (31 December in week 52) and the totals of summarize(); errors: the stated formulas and tolerances
//   - the week strip's pure part (names, letters, colours, dates, the label and the text version) and its view on a stub
//     document (_tests/learn/stubdom.js): 52 cells in four rows, outlined extremes, red dots, the key, role="img" with a
//     sentence, the text version's columns, redraws that replace the old cells
// Usage (from the site folder):  node _tests/learn/test_components_w2_plan.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { env, load } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p), J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const TP = require(L("components/planengine.js")), WS = require(L("components/weekstrip.js"));
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const cfg = J("13-capstone.json"), Y = TP.prepareYear(J("town_year.json"), J("cf_targets.json"), cfg, pctx.module.exports.townProfile);
const C = TP.costs(cfg, {});

(async () => {
  // ---------------------------------------------------------------- files and bundle
  const src = fs.readFileSync(L("components/weekstrip.js"), "utf8"), css = fs.readFileSync(L("components/weekstrip.css"), "utf8");
  const eng = fs.readFileSync(L("components/planengine.js"), "utf8"), m3 = fs.readFileSync(L("m03-capacity-expansion.js"), "utf8");
  const bundleJS = fs.readFileSync(L("learn.js"), "utf8"), bundleCSS = fs.readFileSync(L("learn.css"), "utf8");
  ok(src.indexOf("/* weekstrip.js — LX.WeekStrip") === 0 && css.indexOf("/* weekstrip.css — ") === 0, "weekstrip.js and .css: header comments name the files");
  ok(!/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && !/#[0-9a-fA-F]{6}\b|rgba?\(/.test(src), "weekstrip: colours from --lx-* tokens only");
  ok(bundleJS.indexOf(src.trim().split("\n")[0]) >= 0 && bundleCSS.indexOf(css.trim().split("\n")[0]) >= 0, "weekstrip: in the generated bundle (run the course build step)");
  ok(bundleJS.indexOf(src.trim().split("\n")[0]) > bundleJS.indexOf(eng.trim().split("\n")[0]), "weekstrip loads after the planning engine in learn.js");
  ok(bundleJS.indexOf("link: link, yearPeriods: yearPeriods, readCheck: readCheck, errors: errors") > 0, "the bundled engine exports link, yearPeriods, readCheck and errors");
  ["link", "yearPeriods", "readCheck", "errors"].forEach(f => ok(typeof TP[f] === "function", `LX.townPlan.${f} is exported to Node`));
  ok(!/function (link|readCheck|errors|yearPeriods|WeekStrip)\(/.test(m3) && /TP\.link\(/.test(m3) && /TP\.readCheck\(/.test(m3) && /TP\.errors\(/.test(m3) && /LX\.WeekStrip\(/.test(m3),
     "M3 calls the engine's link, readCheck, errors and LX.WeekStrip and keeps no copy");

  // ---------------------------------------------------------------- link
  const RW = TP.selectWeeks(Y, cfg.weeks), base = TP.weekModel(C, RW, { cap: 200e3 });
  const W = base.constraints.filter(c => /^W\d+$/.test(c.name)).length;
  ok(W === 52 && RW.chrono.length === 52, "the linked model has one chain row per calendar week (52)");
  ok(TP.link(base, RW, "linked") === base && TP.link(base, RW) === base && TP.link(base, RW, null) === base, "linked (or no mode): the model unchanged");
  const cyc = TP.link(base, RW, "cyclic"), free = TP.link(base, RW, "free");
  ok(cyc.variables === base.variables && cyc.constraints.length === base.constraints.length + RW.reps.length, "cyclic: the same variables and one row more per representative week");
  ok(RW.reps.every((r, p) => cyc.constraints.some(c => c.name === "cyc" + p && c.eq === 0 && Object.keys(c.terms).join() === "s" + p + "_167" && c.terms["s" + p + "_167"] === 1)),
     "cyclic: each representative week ends where it starts (s<p>_167 = 0)");
  ok(free.variables === base.variables && free.constraints.length === base.constraints.length - 52 && !free.constraints.some(c => /^W\d+$/.test(c.name)) &&
     free.constraints.filter(c => /^W[lh]\d+$/.test(c.name)).length === 104, "free: exactly the 52 chain rows dropped, the level bounds kept");
  ok(base.constraints.length === TP.weekModel(C, RW, { cap: 200e3 }).constraints.length, "link does not change the model it is given");
  let threw = false; try { TP.link(base, RW, "loose"); } catch (e) { threw = /linked, cyclic or free/.test(e.message); }
  ok(threw, "an unknown mode throws");
  // solved: a cheap-storage what-if, where the rule between weeks matters
  const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
  const { core, VERSION } = sctx.module.exports, highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solve = m => core.solveWith(highs, m, { timeLimit: 300 });
  const cw = JSON.parse(JSON.stringify(cfg)); cw.techs.battery.energyCapex = 20;
  const Cw = TP.costs(cw, {}), mw = TP.weekModel(Cw, RW, { cap: 200e3 }), r = {};
  ["linked", "cyclic", "free"].forEach(m => { r[m] = solve(TP.link(mw, RW, m)); });
  ok(r.linked.ok && r.cyclic.ok && r.free.ok, "the three rules solve (seven weeks, 200 kt, storage energy at an illustrative $20 per kWh)");
  ok(r.free.objective <= r.cyclic.objective + 1 && r.free.objective <= r.linked.objective + 1, "no link is a relaxation of both: never dearer on paper");
  const d = (x, k) => x.values["s" + k + "_167"] || 0;
  ok(RW.reps.every((q, k) => near(d(r.cyclic, k), 0, 1e-6)), "cyclic solved: every week ends where it started");
  ok(near(RW.chrono.reduce((a, k) => a + d(r.linked, k), 0), 0, 1e-4), "linked solved: the calendar chain closes over the year");

  // ---------------------------------------------------------------- yearPeriods, readCheck, errors
  const yp = TP.yearPeriods(Y);
  ok(yp.length === 1 && yp[0].demand === Y.demand && yp[0].wind === Y.wind && yp[0].solar === Y.solar && yp[0].weight === 1, "yearPeriods: the whole year as one period of weight 1");
  // a synthetic full-year result for a gas-only plan: shortfalls in chosen hours, one exactly at the 0.05 MW threshold
  const plan = { wind: 0, solar: 0, cc: 300, pk: 100, nuc: 0, bp: 0, be: 0 }, v = {};
  const short = { 0: 2, 167: 1.5, 168: 4, 3000: 0.05, 3001: 0.06, 8735: 3, 8736: 7, 8759: 9 };
  for (let h = 0; h < 8760; h++) { const u = short[h] || 0, g = Math.max(0, Y.demand[h] - u); v["g0_" + h] = Math.min(300, g); v["p0_" + h] = g - Math.min(300, g); v["u0_" + h] = u; }
  const res = { values: v, duals: null, status: "optimal" }, chk = TP.readCheck(C, Y, res, plan), sm = TP.summarize(C, yp, res, { plan });
  const allU = Object.values(short).reduce((a, b) => a + b, 0);
  ok(near(chk.unserved, allU, 1e-9) && chk.hours === 7 && near(chk.maxShort, 9), "readCheck: unserved MWh (every hour), hours short above 0.05 MW (7 of 8), the largest shortfall");
  ok(chk.byWeek.length === 52 && near(chk.byWeek[0], 3.5) && near(chk.byWeek[1], 4) && near(chk.byWeek[17], 0.06) && near(chk.byWeek[51], 19), "readCheck: MWh by calendar week; hours 8,736 to 8,759 (31 December) count in week 52");
  ok(near(chk.byWeek.reduce((a, b) => a + b, 0), allU - 0.05, 1e-9), "readCheck: the weeks hold every short hour above the threshold");
  ok(chk.cost === sm.cost && chk.co2 === sm.co2 && chk.demand === sm.demand && chk.spilled === sm.spilledShare && chk.unservedShare === sm.unservedShare, "readCheck: totals as summarize() gives them");
  const est = { cost: 100e6 }, full = { cost: 101e6, co2: 210e3, unserved: 0.4, hours: 0, maxShort: 0.4 };
  let e = TP.errors(est, full, 200e3, { cost: 104e6 });
  ok(near(e.costGap, 0.01) && near(e.co2Over, 0.05) && near(e.estErr, 100 / 104 - 1) && e.served && !e.co2ok, "errors: cost gap, CO2 over the cap, estimate error; served below 0.5 MWh");
  e = TP.errors(est, { cost: 99e6, co2: 200000.4, unserved: 0.5, hours: 1, maxShort: 0.5 }, 200e3, null);
  ok(e.estErr === null && !e.served && e.co2ok && near(e.costGap, -0.01) && e.hours === 1 && e.maxShort === 0.5, "errors: no reference, no estimate error; 0.5 MWh is not served; the cap holds within 0.5 t");

  // ---------------------------------------------------------------- the week strip: pure part
  const RW8 = TP.selectWeeks(Y, { perSeason: 2, extremes: ["peak", "netpeak", "calm"], netRef: cfg.weeks.netRef });
  const names = RW8.reps.map(q => WS.weekName(q));
  ok(names.filter(n => n === "Typical winter").length === 2 && names.includes("Peak demand") && names.includes("Peak net load") && names.includes("Least wind"), "names: typical weeks by season, extremes by kind");
  const lets = RW8.reps.map((q, k) => WS.letter(RW8, k));
  ok(["W1", "W2", "Sp1", "Sp2", "Su1", "Su2", "F1", "F2", "P", "N", "C"].every(x => lets.includes(x)) && new Set(lets).size === lets.length, "letters: numbered when a season has two typical weeks, one letter per extreme, all distinct");
  const w2 = RW8.reps.findIndex((q, k) => WS.letter(RW8, k) === "W2"), w1 = RW8.reps.findIndex((q, k) => WS.letter(RW8, k) === "W1");
  ok(WS.color(RW8, w1) === "var(--lx-hyd)" && WS.color(RW8, w2) === "color-mix(in srgb, var(--lx-hyd) 72%, var(--lx-ink))" && WS.number(RW8, w2) === " 2", "colours: a season's second typical week is mixed toward the ink; its name gets a number");
  const RW4 = TP.selectWeeks(Y, { perSeason: 1, extremes: [], netRef: cfg.weeks.netRef });
  ok(RW4.reps.every((q, k) => WS.letter(RW4, k) === { winter: "W", spring: "Sp", summer: "Su", fall: "F" }[q.season] && WS.number(RW4, k) === ""), "one typical week per season: plain letters, no numbers");
  ok(WS.dateOf(Y, 0) === "1 Jan" && WS.dateOf(Y, 13) === "2 Apr" && WS.dateOf(Y, 26) === "2 Jul" && WS.dateOf(Y, 39) === "1 Oct" && WS.yearOf(Y) === 2025, "dates: the four rows start 1 Jan, 2 Apr, 2 Jul and 1 Oct of 2025");
  const by = new Array(52).fill(0); by[3] = 12.4; by[10] = 0.05; by[51] = 0.06;
  ok(WS.label(RW4, null, 2025) === "The 52 weeks of 2025 in four rows of 13, each coloured by the representative week that stands for it: " +
     RW4.reps.map(q => WS.weekName(q) + " for " + q.n + " weeks").join(", ") + ".", "label: every representative week and the weeks it stands for");
  ok(/ 2 weeks have unserved demand in the full-year check\.$/.test(WS.label(RW4, by, 2025)) && / No week has unserved demand/.test(WS.label(RW4, new Array(52).fill(0), 2025)), "label: how many weeks are short (above 0.05 MWh)");
  const rows = WS.rows(Y, RW8, by);
  ok(rows.length === 52 && rows[3].unserved === "12 MWh" && rows[10].unserved === "0" && rows[51].unserved === "0 MWh" && WS.rows(Y, RW8, null).every(x => x.unserved === null),
     "text version: 52 rows, MWh only for short weeks, no column without a check");
  ok(rows.every(x => x.standsIn === WS.weekName(RW8.reps[x.k]) + WS.number(RW8, x.k) && RW8.reps[x.k].members.includes(x.i)), "text version: each week names the representative week standing for it");

  // ---------------------------------------------------------------- the week strip: view on a stub document
  const E = env(); E.LX.townPlan = TP;
  load("weekstrip", E);
  ok(typeof E.LX.WeekStrip === "function" && E.LX.WeekStrip.letter.toString() === WS.letter.toString(), "LX.WeekStrip is defined in the browser, with the same pure part as in Node");
  ok(typeof E.LX.WeekStrip.weekName === "function" && typeof E.LX.WeekStrip.rows === "function", "the pure part hangs on LX.WeekStrip too");
  const host = E.LX.H("div", null, E.body), ws = E.LX.WeekStrip(host, Y);
  ws.draw(RW8, null);
  const grid = host.querySelector(".lx-wks-grid"), cells = () => host.querySelectorAll(".lx-wks-cell");
  ok(grid.getAttribute("role") === "img" && grid.getAttribute("aria-label") === WS.label(RW8, null, 2025), "the grid is an image with the label sentence");
  ok(cells().length === 52 && grid.querySelectorAll("span.rl").length === 4 && grid.querySelectorAll("span.rl").map(x => x.textContent).join() === "1 Jan,2 Apr,2 Jul,1 Oct", "52 cells in four rows behind their start dates");
  ok(cells().filter(c => c.cls().includes("x")).length === 3 && !cells().some(c => c.cls().includes("short")), "three extreme weeks outlined; no dots without a check");
  ok(cells().every((c, i) => c.textContent === WS.letter(RW8, RW8.chrono[i]) && c.getAttribute("style") === "--c:" + WS.color(RW8, RW8.chrono[i])), "each cell carries its week's letter and colour");
  const keys = host.querySelector(".lx-wks-keys");
  ok(keys.getAttribute("aria-hidden") === "true" && keys.querySelectorAll("li").length === RW8.reps.length && !keys.querySelector("i.dot"), "the key: one item per representative week (hidden from screen readers: the grid's label says it)");
  const tv = host.querySelector("details.lx-textalt"), tvb = host.querySelector(".lx-wks-tbl");
  ok(tv.querySelector("summary").textContent === "Text version: the 52 weeks of 2025" && (tvb.innerHTML.match(/<tr>/g) || []).length === 53 && !/Unserved/.test(tvb.innerHTML), "text version: a table of 52 weeks, two columns");
  ws.draw(RW8, by);
  ok(cells().length === 52 && cells().filter(c => c.cls().includes("short")).length === 2 && cells()[3].cls().includes("short") && cells()[51].cls().includes("short"), "with a check: red dots on the two weeks above 0.05 MWh (a redraw replaces the cells)");
  ok(keys.querySelectorAll("li").length === RW8.reps.length + 1 && keys.querySelector("i.dot") && /2 weeks have unserved demand/.test(grid.getAttribute("aria-label")), "with a check: the key explains the dot; the label counts the short weeks");
  ok(/<th scope='col'>Unserved, full year<\/th>/.test(tvb.innerHTML) && tvb.innerHTML.includes("<td>12 MWh</td>"), "with a check: the text version adds the unserved MWh");
  const h2 = E.LX.H("div", null, E.body); E.LX.WeekStrip(h2, Y, { year: 2024 }).draw(RW4, null);
  ok(h2.querySelector("summary").textContent === "Text version: the 52 weeks of 2024" && /^The 52 weeks of 2024/.test(h2.querySelector(".lx-wks-grid").getAttribute("aria-label")), "opts.year names another weather year");

  console.log(`test_components_w2_plan: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
