// test_a08-storage-duration.js — Node tests for A8 (assets/learn/a08-storage-duration.js) with the vendored HiGHS, the
// solver core the page runs in its Web Worker.
//   - the week: 2-8 January 2025 read like lesson 9's day (index 24), 168 hours; it is the 2025 winter week with the largest
//     shortfall for this fleet (as the data file says); the daily wind shares and shortfalls the page states
//   - the LP for each store: optimal; balance and level rules hold; the store starts full and stays within its limits;
//     unserved energy equals the reference block
//   - ties (W3 brief §2.2): the tie rule changes no reported number (the least unserved energy is the same without it), and
//     the schedule drawn is one of several best schedules (another tie rule gives a different schedule with the same
//     unserved energy), as the page says
//   - claims (§2.4): unserved energy never falls below the power floor (the MWh by which the gap tops firm output plus the
//     store's power), and for the week-long hydrogen store it equals that floor at every power on step 6's slider
//   - costs: capital recovery, the cycle limit (the report's own 4.5-hour example), cost per MWh delivered at the page's
//     defaults, fixed upkeep under a quarter of the capital where the report gives it
//   - every number on the page (fallback, explain, Go deeper, myths, quiz, numbers to remember) against the model and data
//   - the excerpt sentences against the approved register (E3, word for word, with the revisions after review)
//   - the page on a stub document with a solver that fails, then works: steps 5 and 6 show a message, clear their busy
//     state, offer "Try again", keep what is solved and work on the retry
// Usage (from the site folder):  node _tests/learn/test_a08-storage-duration.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const SITE = path.resolve(__dirname, "..", "..");
const ID = "a08-storage-duration";
const L = p => path.join(SITE, "assets/learn", p);
const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
const { core, VERSION } = sctx.module.exports;
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const PR = pctx.module.exports;
const M = require(L(ID + ".js"));
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const DPATH = L("data/" + ID + ".json");
const PAGE = fs.readFileSync(path.join(SITE, "learn", ID + ".qmd"), "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const PAGE0 = PAGE.replace(/ data-label="[^"]*"/g, "");
const onPage = (s, what) => ok(PAGE0.includes(s), `page states ${what}: "${s}"`);
const fm = M.fm, r1 = v => Math.round(v * 10) / 10;

(async () => {
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solve = m => core.solveWith(highs, m, { timeLimit: 60 });
  const year = J("town_year.json"), T = J("cf_targets.json");
  let D = J(ID + ".json");
  const W = M.prepare(D, year, T, PR.townProfile), G = D.plains;
  const run = (s, o) => { const r = solve(M.build(W, s, Object.assign({ plains: G }, o || {}))); return { r, o: M.read(W, s, r) }; };

  if (process.argv.includes("--write")) {
    const ref = { about: "Written by node _tests/learn/test_a08-storage-duration.js --write; re-solved by the same test on every run. Energy in MWh.", stores: {} };
    D.techs.forEach(t => { const x = run(M.store(D, t.id)).o; ref.stores[t.id] = { unserved: r1(x.unserved), covered: Math.round(x.covered * 1e4) / 1e4 }; });
    Object.assign(ref, { shortSum: W.shortSum, peakGap: W.peakGap, shortHours: W.shortHours, floor1000: M.powerFloor(W, 1000), hoursAbove: W.short0.filter(x => x > 1000).length, cyclesShown: 250, priceShown: 20 });
    D.reference = ref; fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n"); D = J(ID + ".json");
    console.log("  wrote the reference block");
  }
  const R = D.reference;
  ok(R && R.stores, "the data file has a reference block (run with --write once)");

  // ---------------- the week
  ok(W.i0 === 24 && W.T === 168 && M.weekStart(year, D.week) === 24, "the week starts at index 24 (00:00 CST on 2 January 2025) and has 168 hours");
  ok(Math.max(...year.demand) === 1000 && Math.max(...W.demand) <= G.demandPeakMW, "demand = shape (thousandths of SPP's 2025 peak) x 4,000 MW");
  ok(W.shortSum === R.shortSum && W.peakGap === R.peakGap && W.shortHours === R.shortHours, `no storage: ${fm.mwh(W.shortSum)} short in ${W.shortHours} hours, largest gap ${fm.mw(W.peakGap)}`);
  // the week claim: the winter week (December-February) with the largest shortfall for this fleet
  {
    let best = -1, bestDay = null;
    for (let d0 = 0; d0 < 358; d0++) {
      const day = new Date(Date.UTC(2025, 0, 1 + d0)), end = new Date(Date.UTC(2025, 0, 7 + d0)), win = m => m === 11 || m <= 1;
      if (!win(day.getUTCMonth()) || !win(end.getUTCMonth()) || end.getUTCFullYear() > 2025) continue;
      const D2 = JSON.parse(JSON.stringify(D)); D2.week.date = day.toISOString().slice(0, 10);
      try { const W2 = M.prepare(D2, year, T, PR.townProfile); if (W2.shortSum > best) { best = W2.shortSum; bestDay = D2.week.date; } } catch (e) { /* outside the year */ }
    }
    ok(bestDay === D.week.date, `2-8 January is the winter week with the largest shortfall (best start ${bestDay}, ${best} MWh)`);
  }
  ok(W.daily.length === 7 && W.daily[2].short === 0 && W.daily[3].short === 0 && W.daily[4].wind < W.windCF && W.daily[5].wind < W.windCF, "days 3 and 4 have no shortfall; 6 and 7 January are calmer than the week");
  const last3 = M.sum(W.daily.slice(4).map(d => d.short));
  ok(last3 > 0.8 * W.shortSum, `the last three days hold most of the shortfall (${fm.mwh(last3)})`);
  ok(JS.includes('"On 6 and 7 January wind gives " + fm.pct(W.daily[4].wind)'), "step 4's feedback names the days it measures");

  // ---------------- the LP, store by store
  const out = {};
  D.techs.forEach(t => {
    const s = M.store(D, t.id), x = run(s), o = x.o, v = x.r.values;
    out[t.id] = o;
    ok(x.r.status === "optimal" && near(o.unserved, R.stores[t.id].unserved, 0.05) && near(o.covered, R.stores[t.id].covered, 1e-4), `${t.id}: ${fm.mwh(o.unserved)} unserved, ${fm.pct(o.covered)} covered`);
    let balOK = true, levOK = true, limOK = true; const lam = M.lossPerHour(s);
    for (let h = 0; h < W.T; h++) {
      if (!near(v["g" + h] + v["u" + h] - v["sp" + h] - v["c" + h] + v["d" + h], W.gap[h], 1e-5)) balOK = false;
      const prev = h ? v["e" + (h - 1)] : s.E;
      if (!near(v["e" + h], (1 - lam) * prev + s.eta * v["c" + h] - v["d" + h], 1e-5)) levOK = false;
      if (v["e" + h] < -1e-6 || v["e" + h] > s.E + 1e-6 || v["d" + h] > s.P + 1e-6 || v["c" + h] > s.P + 1e-6 || v["g" + h] > W.firm + 1e-6) limOK = false;
    }
    ok(balOK && levOK && limOK, `${t.id}: balance, level (start full, standing loss ${(lam * 100).toFixed(4)}% an hour) and limits hold every hour`);
    // ties: the least unserved energy is the same without the tie rule
    const y = run(s, { tie: false });
    ok(near(y.o.unserved, o.unserved, 0.01), `${t.id}: the tie rule changes no reported number (without it: ${fm.mwh(y.o.unserved)})`);
    ok(o.unserved >= M.powerFloor(W, s.P) - 0.01, `${t.id}: unserved is at least the power floor (${fm.mwh(M.powerFloor(W, s.P))})`);
  });
  // the schedule drawn is one of several best schedules: a reversed tie rule gives another one with the same unserved energy
  {
    const s = M.store(D, "psh"), m = M.build(W, s, { plains: G });
    m.variables.forEach(vv => { if (/^u\d+$/.test(vv.name)) vv.cost = G.voll + G.tieStep * (+vv.name.slice(1) + 1); });
    const a = run(s).o, b = M.read(W, s, solve(m)), diff = a.level.some((e, i) => Math.abs(e - b.level[i]) > 1);
    ok(near(a.unserved, b.unserved, 0.01) && diff, "pumped hydro: another tie rule gives a different best schedule with the same unserved energy (the page draws one of them)");
  }
  ok(out.battery.covered < out.psh.covered && out.psh.covered < out.thermal.covered && out.thermal.covered < out.hydrogen.covered, "longer stores cover more of this week (21%, 36%, 64%, 92%)");
  ok(near(out.hydrogen.unserved, M.powerFloor(W, 1000), 0.01) && R.floor1000 === M.powerFloor(W, 1000) && R.hoursAbove === 23, "hydrogen: unserved = the power floor at 1,000 MW (4,009 MWh, 23 hours)");
  const h2 = M.store(D, "hydrogen");
  for (let P = 500; P <= 2000; P += 100) {
    const s = M.store(D, "hydrogen", { P }); s.E = h2.E;
    const o = run(s).o; ok(near(o.unserved, M.powerFloor(W, P), 0.01), `step 6 at ${P} MW: unserved = the power floor (${fm.mwh(o.unserved)})`);
  }
  ok(M.powerFloor(W, W.peakGap) === 0 && M.powerFloor(W, W.peakGap - 1) > 0, `every hour served from ${fm.mw(W.peakGap)} of store power, the largest gap above firm output`);

  // ---------------- standing losses (step 3) and costs (step 7)
  const th = M.store(D, "thermal");
  ok(near(M.idle(th, 0), 0.5) && near(M.idle(th, 7), 0.5 * Math.pow(0.98, 7)) && near(M.idle(M.store(D, "hydrogen"), 30), 0.31), "1 MWh in: 0.50 back from the heat store at once, 0.43 after 7 days; hydrogen 0.31 at any time");
  ok(near(M.lossPerHour(th), 1 - Math.pow(0.98, 1 / 24)), "2% a day = 1 - 0.98^(1/24) an hour");
  const C = D.costs, it = id => C.items.find(i => i.id === id);
  ok(near(M.crf(0.04, 16), 0.04 / (1 - Math.pow(1.04, -16))) && it("battery").perKW === 385 * 4 && Math.round(it("psh").perKWh * 10) === 2625 && Math.round(it("hydrogen").perKWh * 24) === 3033,
     "installed costs: $/kW = $/kWh x duration (battery $1,540; pumped hydro $2,625; hydrogen $3,033)");
  ok(M.maxCycles({ hours: 2, eta: 0.8 }, 10) === Math.floor(8760 / 4.5) && M.maxCycles({ hours: 2, eta: 0.8 }) === 365, "cycle rule: the report's example, 2 hours at 80% runs 4.5 hours a cycle");
  ok(M.maxCycles(it("battery")) === 365 && M.maxCycles(it("psh")) === 365 && M.maxCycles(it("hydrogen")) === 86, "cycle limits: 365, 365 and 86 a year");
  const c = id => M.perMWh(it(id), 250, 20, C.rate);
  ok(Math.round(c("battery").total) === 156 && Math.round(c("battery").capital) === 132 && Math.round(c("battery").charging) === 24, "battery at 250 cycles and $20: $156 ($132 capital, $24 charging)");
  ok(Math.round(c("psh").total) === 71 && Math.round(c("hydrogen").total) === 149 && Math.round(c("hydrogen").charging) === 65 && c("hydrogen").capped, "pumped hydro $71; hydrogen $149 at its 86-cycle cap, $65 of it charging");
  ok(c("psh").total < c("hydrogen").total && c("psh").total < c("battery").total && it("hydrogen").perKWh < it("psh").perKWh, "myth 3: hydrogen has the lowest cost per kWh, pumped hydro the cheapest MWh at 250 cycles");
  ["psh", "hydrogen"].forEach(id => ok(it(id).fom / (M.crf(C.rate, it(id).life) * it(id).perKW) < 0.25, `${id}: fixed upkeep under a quarter of the capital's yearly cost`));
  ok(it("battery").fom === null, "the battery's fixed upkeep at 100 MW is not in the report's tables we read: left null, as the page says");
  ok(near(24 + 24 / 0.31, 101.4, 0.05), "Go deeper: a 24-hour, 31% store needs 101 hours a cycle");
  ok(R.cyclesShown === 250 && R.priceShown === 20 && /var C = D\.costs, cyc = 250, price = 20/.test(JS), "the explain table and step 7 start at the same defaults");

  // ---------------- numbers on the page
  const names = { battery: "Lithium-ion battery, 4 h", psh: "Pumped storage hydro, 10 h", thermal: "Heat store, 24 h", hydrogen: "Hydrogen in a salt cavern, 168 h" };
  D.techs.forEach(t => { const s = M.store(D, t.id), o = out[t.id];
    onPage(`<tr><td>${names[t.id]}</td><td>${fm.mwh(s.E)}</td><td>${fm.pct(t.eta)}</td><td>${fm.mwh(o.unserved)}</td><td>${fm.pct(o.covered)}</td></tr>`, "the fallback row for " + t.id); });
  onPage(`Without storage the week is ${fm.mwh(W.shortSum)} short, in ${W.shortHours} hours. The hydrogen store's ${fm.mwh(out.hydrogen.unserved)} left`, "the fallback hint");
  onPage(`the battery covers ${fm.pct(out.battery.covered)} of the shortfall, the hydrogen store ${fm.pct(out.hydrogen.covered)}`, "explain: endurance");
  onPage(`In ${R.hoursAbove} hours the gap tops firm output plus 1,000 MW`, "explain: power still matters");
  onPage(`holds 168,000 MWh against a ${fm.mwh(W.shortSum)} shortfall, yet leaves ${fm.mwh(out.hydrogen.unserved)} unserved: in ${R.hoursAbove} hours`, "myth 1");
  onPage("\\$132 of capital, plus \\$24 of charging: \\$156 per MWh", "Go deeper: the battery's cost");
  onPage("so at most 86 cycles a year: \\$149 per MWh at best, \\$65 of it charging", "Go deeper: hydrogen's cost");
  onPage("($126, against $263 for pumped hydro and $385 for the battery).</p><p>At 250 cycles a year pumped hydro delivers the cheapest MWh, $71; hydrogen, capped at 86 cycles, $149 (DOE's 24-hour cost case).", "myth 3");
  // the cost table names the store it costs (review 1): each row's duration is the costed duration, and the week's table
  // (1,000 MW stores, the hydrogen one 168 hours) carries no cost column
  { const cr = M.costRows(D);
    ok(cr.length === 3 && cr.every(r => { const it2 = C.items.find(i => i.id === r.key); return r.hours === it2.hours && r.note.startsWith("100 MW, " + it2.hours + " h") && r.cost.text === fm.usd(M.perMWh(it2, R.cyclesShown, R.priceShown, C.rate).total); }), "explain: the cost table's durations are the costed durations (hydrogen 24 h), with the costs the model gives");
    ok(cr.find(r => r.key === "hydrogen").hours === 24 && M.store(D, "hydrogen").hours === 168 && /The hydrogen case holds 24 hours, not a week\./.test(JS), "explain: the week's hydrogen store (168 h) and DOE's hydrogen cost case (24 h) are named apart");
    const weekTable = JS.slice(JS.indexOf('title: "Four stores, one calm week"'), JS.indexOf("var cr = costRows(D);"));
    ok(weekTable.length > 0 && !/cost|\$ per MWh/.test(weekTable.replace(/costRows/g, "")), "explain: the week's table has no cost column"); }
  // the formula with its units (review 4): 1,000 x CRF x $/kW / (cycles x hours) reproduces the battery's $132
  ok(near(1000 * M.crf(0.04, 16) * 1540 / (250 * 4), c("battery").capital, 1e-9) && PAGE.includes("1,000 × 0.0858 × 1,540 ÷ (250 × 4) = \\$132") && PAGE.includes("= 1,000 × capital recovery × installed cost (\\$ per kW) ÷ (cycles a year × duration in hours)"), "Go deeper: the formula carries the 1,000 (kW to MW) and its units");
  onPage("(\\$28.19 and \\$23.90 per kW-year)", "fixed upkeep from the report"); onPage("at \\$5.82 per kWh", "the cavern cost");
  ok(it("psh").fom === 28.19 && it("hydrogen").fom === 23.90 && it("hydrogen").cavernPerKWh === 5.82, "the data file holds the report's upkeep and cavern costs");
  onPage("10 × 0.50 × 0.98<sup>5</sup> = 4.52", "quiz 2"); ok(near(10 * M.idle(th, 5), 4.52, 0.005), "quiz 2 = the model");
  onPage("8 hours: 3,200 MWh ÷ 400 MW", "quiz 1");
  onPage("a 4,000 MW peak, as in", "the Plains Grid's peak"); onPage(`with ${G.windMW.toLocaleString("en-US")} MW of wind, ${G.solarMW.toLocaleString("en-US")} MW of solar and ${G.firmMW.toLocaleString("en-US")} MW of firm gas`, "the fleet");
  D.facts.forEach(f => { const row = PAGE.indexOf('<td class="n">' + f.n + "</td><td>" + f.what + "</td>"); ok(row >= 0 && PAGE.slice(row, row + 700).includes(f.url) && PAGE.slice(row, row + 700).includes(f.asof.replace("published ", "published ")), "numbers to remember: '" + f.n + "' with its source and date"); });
  ok(D.techs.every(t => t.source && /^https:\/\//.test(t.source.url) && t.source.as_of), "every store's parameters carry a source and a date");
  ok(D.ladder.cards.every(cc => D.ladder.bins.some(b => b.id === cc.bin) && cc.why.split(" ").length <= 25), "ladder: every card has a bin and a short reason");
  // review 7: a card whose DOE range spans two bins carries one example rating inside its bin
  { const rate = id => { const t = D.ladder.cards.find(x => x.id === id).text, m = t.match(/(\d+)[- ]hour/); return m ? +m[1] : null; };
    ok(rate("psh") === 8 && D.ladder.cards.find(x => x.id === "psh").bin === "short" && rate("metal") === 100 && D.ladder.cards.find(x => x.id === "metal").bin === "multi", "ladder: pumped hydro at 8 hours (up to 10 h), iron-air at 100 hours (36 to 160 h), one right bin each");
    ok(/0 to 15 hours/.test(D.ladder.cards.find(x => x.id === "psh").why) && /50 to 200 hours/.test(D.ladder.cards.find(x => x.id === "metal").why), "ladder: the reasons still give DOE's full ranges"); }
  // review 9 and 12: terms marked; the heat store's loss is an illustrative assumption with its own source
  ok(/\[\[standing-loss\|/.test(JSON.stringify(D)) && /\[\[electrolyzer\|/.test(JSON.stringify(D)) && /\[\[fuel-cell\|/.test(JSON.stringify(D)) && /LX\.rich\(s\.limit\)/.test(JS), "step 3's limits mark standing loss, electrolyzer and fuel cell for the glossary");
  ok(/\[\[full-cycle\|full cycles\]\]/.test(JS) && /\[\[capital-recovery-factor\|capital recovery\]\]/.test(JS) && /\[\[real-rate\|real\]\] \(inflation taken out\)/.test(JS) && /id: full-cycle\b/.test(SIDE), "step 7 defines full cycles, capital recovery and a real rate");
  ok(D.ladder.cards.find(x => x.id === "air").text.includes("(air chilled to a liquid") && /Iron rusts as it discharges/.test(D.ladder.cards.find(x => x.id === "metal").why), "ladder: liquid air and the metal-anode battery are explained");
  { const th2 = D.techs.find(t => t.id === "thermal");
    ok(/Illustrative/.test(th2.lossSource.label) && /77910/.test(th2.lossSource.url) && !/77910/.test(th2.source.url) && PAGE.includes("The heat store's 2% a day is an illustrative assumption, borrowed from a 2020 NREL tank design target.") && !/one source and one year/.test(PAGE), "data note: the 2% a day is attributed to its own source, as an illustrative assumption"); }
  // review 11: every symbol of the LP has a row
  ["$g_t$", "$w_t$, $\\sigma_t$", "$f_t$", "$u_t$, $s_t$", "$c_t$, $d_t$", "$e_t$", "$P$, $E$", "$\\eta$", "$\\lambda$", "$V$", "$\\tau$", "$\\delta$"].forEach(x => ok(PAGE.includes("| " + x + " |"), "symbol table row " + x));
  ok(PAGE.includes("\\$/MWh per hour"), "the tie rule's tau carries its own unit");
  // review 6: refilling is not tied to wind returning
  ok(!/refill only if wind returns/.test(JS) && JS.includes("They refill when supply tops demand, within their charging power and losses."), "causal chain: stores refill when supply tops demand");
  ok(!/earns its cost back only/.test(JS), "step 7 spreads a cost; it does not claim how a store earns");

  // ---------------- the excerpt (curriculum §13): approved sentences, word for word
  const SNAP = {
    "E3.4": "Compared with wind and a battery alone, adding an electrolyzer reduced total system cost by about 7%, and using hydrogen as the storage medium for fuel cells reduced it by about 26%.",
    "E3.5": "Holds when: one planned West Texas wind farm, ERCOT prices, costs from 2020 to 2023. Leaves out: final federal hydrogen credit rules.",
    "E3.15": "Battery, hydrogen and hybrid storage were compared, each set to deliver the largest stabilized output in every hour at the lowest life-cycle cost."
  };
  const reg = (() => {
    const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
    try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a checkout */ }
    const p = c.filter(Boolean).map(x => path.join(x, "reports/learn/excerpts_for_approval.md")).find(x => fs.existsSync(x));
    return p ? fs.readFileSync(p, "utf8") : null;
  })();
  if (reg) {
    const rows = {}; let sec = null;
    reg.split("\n").forEach(line => { if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
      const m = line.match(/^\| (E3\.\d+) \| (.*) \|\s*$/); if (!m || !sec) return; const cells = m[2].split(" | "); if (sec === "REV") rows[m[1]] = cells[1]; else if (sec === "E3") rows[m[1]] = cells[0]; });
    Object.keys(SNAP).forEach(k => ok(rows[k] === SNAP[k], `register ${k} equals the snapshot`));
  } else console.log("note: excerpts_for_approval.md not found; checked against the snapshot");
  const quoted = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)"><p>([\s\S]*?)<\/p><footer>/g)];
  ok(quoted.length === 1 && quoted[0][1] === "excerpt:wind-hydrogen" && quoted[0][2] === SNAP["E3.4"], "the excerpt is E3.4, word for word, under excerpt:wind-hydrogen");
  onPage(`<p class="lx-hint">${SNAP["E3.15"]}</p>`, "E3.15 under the excerpt"); onPage(`<p class="lx-hint">${SNAP["E3.5"]}</p>`, "E3.5 under the excerpt");
  ok(!/txh2|solar-hydrogen/.test(PAGE), "no other study is described");

  // ---------------- text, scope, sidecar
  const stepTexts = (JS.match(/\{ text: "([^"]+)"/g) || []).map(s => s.slice(9, -1));
  ok(stepTexts.length >= 7 && stepTexts.every(t => t.split(/\s+/).length <= 40), "step texts: 40 words at most");
  // review 10: every element of the page's own text (data notes, explain, Go deeper, answers, numbers) stays within budget
  { const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/\$\$[\s\S]*?\$\$/g, "");
    const els = OWN.replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^\|(.*)\|$/gm, "<td>$1</td>").split(/<\/?(?:p|li|dd|dt|td|th|summary|blockquote|footer)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
    const long = els.filter(x => x.split(" ").length > 40);
    ok(long.length === 0, "every page element is 40 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | ")); }
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  ok(!NUC.test(PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "") + JS + JSON.stringify(D)), "no nuclear term anywhere in the lesson (outside the generated header, which names other lessons)");
  ok(!/\bAI\b|data cent/i.test(PAGE + JS), "no AI wording, no data centers");
  ["standing-loss", "long-duration-storage"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE), "sidecar defines " + id));
  ok(!/always|never/i.test((JS.replace(/\/\/.*$/gm, "").match(/"[^"\n]*"/g) || []).join(" ")), "no 'always' or 'never' in the page's strings");

  // ---------------- the page on a stub document: solves that fail, then work
  {
    const { env, load } = require("./stubdom.js");
    const E = env();
    E.LX.ready = () => {}; E.LX.progress.guess = () => null;
    E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
    ["solver", "cards", "predict", "cardsort", "controls", "plot", "profiles", "solvestep"].forEach(n => load(n, E));
    const specs = [], P0 = E.LX.Plot;   // the stub never shows a chart, so the specs passed to LX.Plot are read directly
    E.LX.Plot = (h, o) => { const p = P0(h, o), r0 = p.render; p.render = (sp, a) => { specs.push(sp); return r0(sp, a); }; return p; };
    let failing = true, calls = 0, hold = null;
    const slv = E.LX.solver; slv.preload = () => Promise.resolve("worker"); slv.mode = "worker";
    slv.solve = m => { calls++; if (failing) return Promise.resolve({ status: "time-limit", ok: false, values: null, ms: { roundTrip: 10000 } }); const r = solve(m); r.ms = Object.assign({ roundTrip: 1 }, r.ms);
      if (hold) return new Promise(res => { hold.release = () => res(r); }); return Promise.resolve(r); };
    let init = null, demo = null;
    E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
    E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
    const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {} };
    vm.runInNewContext(JS, mctx);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
    const unhandled = []; const onUn = e => unhandled.push(String(e && e.message || e)); process.on("unhandledRejection", onUn);
    let threw = null;
    try { init(live, { a08_storage_duration: D, town_year: year, cf_targets: T }, root); } catch (e) { threw = e.message; }
    ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
    const flush = () => new Promise(r => setImmediate(r));
    const card = () => demo.cards.el, btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent));
    const next = () => btns(/Next/)[0], failBox = () => card().querySelector(".a8-fail");
    try {
      demo.cards.go(4); failing = true; calls = 0;
      btns(/Battery · 4 h/)[0].click(); await flush();
      ok(failBox() && failBox().getAttribute("role") === "alert" && /time limit/.test(failBox().textContent) && /Try again/.test(failBox().textContent), "step 5: a failed solve shows a plain message and Try again");
      ok(card().getAttribute("aria-busy") == null && next().disabled && btns(/Battery · 4 h/)[0].disabled === false, "step 5: busy cleared, the button works again, Next waits");
      failing = false; btns(/Try again/)[0].click(); await flush();
      ok(!failBox() && /Unserved left/.test(card().textContent) && calls === 2, "step 5: Try again solves and shows the table (" + calls + " solves, boxes " + card().querySelectorAll(".a8-fail").length + ": " + (failBox() ? failBox().textContent : "") + ")");
      ["Pumped hydro · 10 h", "Heat store · 24 h"].forEach(l => btns(new RegExp(l))[0].click()); await flush();
      ok(!next().disabled && card().querySelectorAll(".a8-tbl tbody tr").length === 3, "step 5: three stores run, Next unlocks");
      const n0 = calls; btns(/Battery · 4 h/)[0].click(); await flush();
      ok(calls === n0, "step 5: a store already solved is not solved again");
      demo.cards.go(5); failing = true; btns(/^Solve$/)[0].click(); await flush();
      ok(failBox() && next().disabled, "step 6: a failed solve shows the message; Next waits");
      failing = false; btns(/Try again/)[0].click(); await flush();
      ok(!failBox() && card().textContent.includes(fm.mwh(R.floor1000)) && !next().disabled, "step 6: the retry shows the power floor and unlocks Next");
      // review 2: the slider is off while a solve runs; the result belongs to the power that was solved; a moved slider marks it stale
      const raise = () => card().querySelectorAll("button").filter(b => /^Raise Hydrogen store's power/.test(b.getAttribute("aria-label") || ""))[0];
      const staleTxt = () => (card().querySelectorAll(".a8-note").filter(n => /These results are for/.test(n.textContent) && !n.hidden)[0] || { textContent: "" }).textContent;
      raise().click();
      ok(/These results are for 1,000 MW\. Solve again for 1,100 MW\./.test(staleTxt()) && card().querySelector(".a8-kpis").classList.contains("a8-stale"), "step 6: moving the slider after a solve marks the result stale: " + staleTxt());
      hold = {}; btns(/^Solve$/)[0].click(); await flush();
      const inp = card().querySelector("input");
      ok(inp.disabled && raise().disabled, "step 6: the power slider is off while the solve runs");
      inp.value = 1500; inp.fire("input");   // a change that slips through while solving: the result must stay the solved power's
      hold.release(); hold = null; await flush(); await flush();
      const fl11 = M.powerFloor(W, 1100);
      ok(!inp.disabled && card().textContent.includes(fm.mwh(fl11)) && /These results are for 1,100 MW\. Solve again for 1,500 MW\./.test(staleTxt()), "step 6: the result shown is the submitted 1,100 MW's (" + fm.mwh(fl11) + "), marked stale against the slider's 1,500 MW; the slider is back on");
      inp.value = 1100; inp.fire("input");
      ok(staleTxt() === "" && !card().querySelector(".a8-kpis").classList.contains("a8-stale"), "step 6: back at the solved power, the stale mark goes");
      // review 8: the week's text version lists every hour, with the store's schedule once a store is shown
      demo.cards.go(4); await flush();
      const tx = specs[specs.length - 1].text, bat = M.read(W, M.store(D, "battery"), solve(M.build(W, M.store(D, "battery"), { plains: G })));
      ok(tx.rows.length === 168 && tx.head.join("|") === "Hour starting|Demand|Wind + sun + firm|Short without storage|Battery out (+) or in (−)|Unserved with it" && tx.rows[0][0] === "2 Jan 00:00" && tx.rows[167][0] === "8 Jan 23:00",
         "step 5: the week's text version has a row for each of the 168 hours, with the store's output and the unserved demand (" + tx.rows.length + " rows: " + tx.head.join(", ") + ")");
      ok(near(tx.rows.reduce((a, r) => a + +r[5].replace(/,/g, ""), 0), R.stores.battery.unserved, 168) && near(tx.rows.reduce((a, r) => a + +r[3].replace(/,/g, ""), 0), W.shortSum, 168), "step 5: the hourly text sums to the week's shortfall and the battery's unserved energy (rounding aside)");
    } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
    process.removeListener("unhandledRejection", onUn);
    ok(!unhandled.length, "no unhandled promise rejection: " + unhandled.join(" | "));
  }
  // review 5: step 8 without a battery run states the reference run's share, labelled as such
  {
    const { env, load } = require("./stubdom.js");
    const E = env();
    E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
    ["solver", "cards", "predict", "cardsort", "controls", "plot", "profiles", "solvestep"].forEach(n => load(n, E));
    const sorts = [], CS0 = E.LX.CardSort; E.LX.CardSort = (h, o) => { sorts.push(o); return CS0(h, o); };
    let init = null, demo = null;
    E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
    E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
    vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {} });
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
    try {
      init(live, { a08_storage_duration: D, town_year: year, cf_targets: T }, root);
      demo.cards.go(7);
      const card = demo.cards.el, b = re => card.querySelectorAll("button").filter(x => re.test(x.textContent) || re.test(x.getAttribute("aria-label") || ""))[0];
      const why = sorts[sorts.length - 1].cards.find(c => c.id === "battery").why;
      ok(why.includes(fm.pct(R.stores.battery.covered) + " of the shortfall in the lesson's reference run (step 5)") && !/a quarter/.test(JS), "step 8 without a battery run: " + why.slice(0, 120));
    } catch (e) { ok(false, "the step 8 stub test threw: " + (e && e.stack || e)); }
  }

  console.log(`test_a08-storage-duration: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL: the test threw:", e && e.stack || e); process.exit(1); });
