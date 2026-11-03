// test_a07-flexible-demand.js — Node tests for lesson A7 (assets/learn/a07-flexible-demand.js, its data file and the
// page, learn/a07-flexible-demand.qmd):
//   - the day: the same 9 June 2025 as lesson 9, CF6 and A4 (gaps, average factors, prices)
//   - the shift: bookkeeping (added = (1 + loss) x moved; bounds; total use), and the shift rule against a linear
//     program solved with the vendored HiGHS for every setting the page offers (cheapest goal: the least running cost
//     plus users' cost; attributed goal: the least attributed CO2), with the plants' CO2 the same in every least-cost shift
//     (min and max CO2 at the optimal cost); the claims the page makes about which hours give and take
//   - the virtual power plant: energy that comes back = ret x energy cut; the value shared among kinds adds up to the
//     town's saving; earnings; Feeder 7; the neighbours' trade (a pure transfer; the wires charge = A4's)
//   - every number on the page (step sentences, Go deeper, myths, quiz, practice, no-JS block, numbers to remember)
//   - research wording (curriculum §13, guard G-SRC): the excerpts are E6.4, E6.6 (excerpt:ghg) and E8.2, E8.4 with the
//     note E8.7 (excerpt:supply-chain-mg) of reports/learn/excerpts_for_approval.md, word for word; no other sentence on
//     the page, in the data or in the script describes the studies; the cited titles are those in inputs/publications.bib
//   - scope: no nuclear terms, no "AI", links on the allow-list; text budget
// Usage (from the site folder):  node _tests/learn/test_a07-flexible-demand.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const ID = "a07-flexible-demand";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
const { core, VERSION } = ctx.module.exports;
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const M = require(L(ID + ".js"));
const M4 = require(L("a04-retail-tariffs.js"));
const M6 = require(L("cf6-shifting-load-to-clean-hours.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const A4 = require(L("data/a04-retail-tariffs.json")), D6 = require(L("data/cf6-shifting-load-to-clean-hours.json"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const town = require(L("data/town.json")), year = require(L("data/town_year.json"));
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const W = M.prepare(town, year, D), wires = D.trade.wires;

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = { "a07-fallback": () => M.staticFallback(W, D, A4, wires), "a07-practice": () => M.staticPractice(W, D, A4, wires) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("no-JS blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
const T_PAGE = text(OWN);
const has = (s, msg) => ok(T_PAGE.indexOf(s) >= 0, msg + ": '" + s + "' on the page");

(async () => {
  const highs = await loadHighs();

  // ---------------- the day: the same as CF6's and A4's
  const W6 = M6.prepare(town, year, D6.idea.day), W4 = M4.prepare(town, year, A4), T4 = M4.calibrate(A4, W4);
  ok(W.gap.join() === W6.gap.join() && W.avg.every((a, t) => near(a, W6.avg[t], 1e-12)), "gaps and average factors = CF6's day");
  ok(W.price.every((p, t) => near(p / 1000, W4.price[t], 1e-12)), "prices = A4's day");
  ok(W.cost === 56460 && near(W.co2, 500.13, 1e-6), "the day as dispatched: running cost $56,460, plants' CO₂ 500.1 t");
  ok(!/nuclear/.test(JS.replace(/\/\/[^\n]*/g, "")), "the script finds the always-on plant by its behaviour, never by name");

  // ---------------- the hook
  const hk = M.move(W, 20, 14, 10);
  ok(hk.cost === -1000 && near(hk.co2, -5.5, 1e-9), "10 MWh from 20:00 to 14:00: −$1,000 and −5.5 t (CF6's own example)");

  // ---------------- the shift: bookkeeping and the rule against the linear program
  function lp(o, objective, costCap) {
    const l = o.loss ? D.shift.loss : 0, u = o.goal === "cost" ? (o.user || 0) : 0, vars = [], cons = [], sumX = {}, P = W.plants;
    for (let t = 0; t < 24; t++) {
      const cap = o.share * W.demand[t];
      vars.push({ name: "x" + t, ub: cap, cost: objective === "cost" ? u : objective === "attr" ? -W.avg[t] : 0 },
                { name: "y" + t, ub: cap, cost: objective === "attr" ? W.avg[t] : 0 },
                { name: "c" + t, ub: P.cc.mw, cost: objective === "cost" ? P.cc.cost : objective === "co2" ? P.cc.co2 : objective === "-co2" ? -P.cc.co2 : 0 },
                { name: "p" + t, ub: P.pk.mw, cost: objective === "cost" ? P.pk.cost : objective === "co2" ? P.pk.co2 : objective === "-co2" ? -P.pk.co2 : 0 },
                { name: "s" + t, ub: W.ren[t] });
      const bal = {}; bal["c" + t] = 1; bal["p" + t] = 1; bal["s" + t] = -1; bal["x" + t] = 1; bal["y" + t] = -1;
      cons.push({ name: "b" + t, terms: bal, eq: W.gap[t] });
      sumX["y" + t] = 1; sumX["x" + t] = -(1 + l);
    }
    cons.push({ name: "keep", terms: sumX, eq: 0 });
    if (costCap != null) { const cc = {}; for (let t = 0; t < 24; t++) { cc["c" + t] = W.plants.cc.cost; cc["p" + t] = W.plants.pk.cost; cc["x" + t] = u; } cons.push({ name: "cap", terms: cc, le: costCap }); }
    return core.solveWith(highs, { sense: "min", variables: vars, constraints: cons }, {});
  }
  const shares = []; for (let k = D.shift.shares[0]; k <= D.shift.shares[1]; k += D.shift.shares[2]) shares.push(k / 100);
  const users = []; for (let u = D.shift.userCost[0]; u <= D.shift.userCost[1]; u += D.shift.userCost[2]) users.push(u);
  let nLP = 0, worst = 0, co2Spread = 0, bad = [];
  for (const share of shares) for (const loss of [false, true]) {
    for (const user of users) {
      const o = { share, goal: "cost", loss, user }, r = M.shift(W, D, o);
      if (!(near(r.added, (1 + (loss ? D.shift.loss : 0)) * r.moved, 1e-6) && r.dn.every((x, t) => x <= share * W.demand[t] + 1e-9) && r.up.every((y, t) => y <= share * W.demand[t] + 1e-9) &&
            near(M.sum(r.use), M.sum(W.demand) + r.added - r.moved, 1e-6))) bad.push("bookkeeping " + JSON.stringify(o));
      const s = lp(o, "cost"); nLP++;
      const mine = W.cost + r.cost + r.user;
      if (!s.ok) { bad.push("LP not optimal " + JSON.stringify(o)); continue; }
      worst = Math.max(worst, mine - s.objective);
      if (mine - s.objective > 1e-6) bad.push("not least-cost " + JSON.stringify(o) + ": " + mine + " vs " + s.objective);
      {
        const lo = lp(o, "co2", s.objective + 1e-6), hi = lp(o, "-co2", s.objective + 1e-6);
        co2Spread = Math.max(co2Spread, -hi.objective - lo.objective);
        if (!(near(lo.objective, W.co2 + r.co2, 1e-5) && near(-hi.objective, W.co2 + r.co2, 1e-5))) bad.push("plants' CO2 not unique at least cost " + JSON.stringify(o));
      }
    }
    const oa = { share, goal: "attr", loss }, ra = M.shift(W, D, oa), sa = lp(oa, "attr");
    const attr0 = M.sum(W.demand.map((d, t) => d * W.avg[t]));
    nLP++;
    if (!sa.ok || !near(ra.attr, sa.objective, 1e-6)) bad.push("attributed goal not least attributed CO2 " + JSON.stringify(oa) + ": " + ra.attr + " vs " + (sa.objective));
    void attr0;
  }
  ok(bad.length === 0, "the shift rule = the linear program's optimum at all " + nLP + " settings (worst gap $" + worst.toExponential(1) + "), the plants' CO₂ unique at least cost (spread " + co2Spread.toExponential(1) + " t):\n  " + bad.slice(0, 6).join("\n  "));
  // the page's claims at 5%
  const c5 = M.shift(W, D, { share: 0.05, goal: "cost" }), a5 = M.shift(W, D, { share: 0.05, goal: "attr" });
  const c5l = M.shift(W, D, { share: 0.05, goal: "cost", loss: true }), a5l = M.shift(W, D, { share: 0.05, goal: "attr", loss: true });
  ok(c5.dn.every((x, t) => x < 1e-9 || W.key[t] !== "spill") && c5.up.every((y, t) => y < 1e-9 || c5.gap[t] <= 1e-9), "cheapest shift: use leaves gas hours and arrives only where sun is still spilled (\"from gas hours into spare-sun hours\")");
  ok(c5l.up.every((y, t) => y < 1e-9 || c5l.gap[t] <= 1e-9) && c5l.dn.every((x, t) => x < 1e-9 || W.price[t] >= 40), "with losses too: each MWh leaves a $40 or $100 hour and arrives in a $0 one");
  ok(near(a5.co2, c5.co2, 1e-9) && near(a5.cost, c5.cost, 1e-9) && a5.moved > c5.moved, "at 5% without losses the attributed goal moves more, at the same cost and plants' CO₂");
  for (const share of shares) { if (!share) continue; const c = M.shift(W, D, { share, goal: "cost" }), a = M.shift(W, D, { share, goal: "attr" });
    if (!(a.attr <= c.attr + 1e-9 && c.cost <= a.cost + 1e-9)) ok(false, "share " + share + ": each goal wins its own measure"); }
  const tbl = [[c5, "99 MWh", "0 MWh", "−$5,995", "−42.8 t", "−17.5 t"], [a5, "161 MWh", "0 MWh", "−$5,995", "−42.8 t", "−22.0 t"], [c5l, "90 MWh", "−9 MWh", "−$5,634", "−39.5 t", "−16.7 t"], [a5l, "150 MWh", "−15 MWh", "−$5,396", "−37.3 t", "−20.8 t"]];
  tbl.forEach((x, i) => { const r = x[0], got = [M.mwh(r.moved), M.dmwh(r.saved), M.dusd(r.cost), M.dt(r.co2), M.dt(r.attr)];
    ok(got.join() === x.slice(1).join(), "Go deeper case " + (i + 1) + ": " + x.slice(1).join(", ") + " (got " + got.join(", ") + ")"); });
  // the two Go deeper tables (without and with losses): one row per measure, the cheapest goal then the attributed goal
  ["Moved out", "Energy saved", "Running cost", "Plants' CO₂", "Attributed CO₂"].forEach((m, k) => [0, 2].forEach(j => {
    const row = "| " + m + " | " + tbl[j][k + 1] + " | " + tbl[j + 1][k + 1] + " |", from = PAGE.indexOf(j ? "| With 10% losses |" : "| Without losses |");
    ok(from >= 0 && PAGE.indexOf(row, from) >= 0 && PAGE.indexOf(row, from) < from + 600, "Go deeper table (" + (j ? "with" : "without") + " losses): " + row); }));
  ok(M.dmwh(0) === "0 MWh" && M.dmwh(-9.02) === "−9 MWh", "energy saved reads 0 MWh or −9 MWh");

  // ---------------- the virtual power plant
  const all = M.allKinds(D), v = M.vpp(W, D, all, false), vs = M.vpp(W, D, all, true);
  D.vpp.devices.forEach(x => { const p = M.profiles(D, all, false)[x.key]; ok(near(M.sum(p.back), x.ret * M.sum(p.cut), 1e-9), x.key + ": energy that comes back = " + x.ret + " × energy cut"); });
  ok(near(v.mw, 21.33, 1e-9) && near(v.cutMWh, 63.99, 1e-9) && near(v.backMWh, 44.568, 1e-9), "pool 21.3 MW for 3 h; 64 MWh cut, 44.6 MWh back");
  ok(M.usd(-v.cost) === "$3,360" && M.dmwh(v.peakerMWh) === "−43 MWh" && M.usd(-vs.cost) === "$3,576", "the town saves $3,360 that day (staggered $3,576); the peaker runs 43 MWh less");
  ok(near(v.savedMWh + v.sunMWh + v.backMWh, v.cutMWh, 1e-9) && M.mwh(v.savedMWh) === "4 MWh" && M.mwh(v.sunMWh) === "15 MWh", "energy cut = saved (4 MWh, warmer homes) + moved to the next day's sun (15 MWh, batteries) + comes back (45 MWh)");
  ok(v.h[23].pk > 0 && vs.h[23].pk === 0, "released at once, the return restarts the peaker at 23:00; staggered, it does not");
  ok(near(Object.keys(v.dev).reduce((a, k) => a + v.dev[k].day, 0), -v.cost, 1e-6) && near(Object.keys(vs.dev).reduce((a, k) => a + vs.dev[k].day, 0), -vs.cost, 1e-6), "the kinds' shares of the day's saving add up to the town's saving");
  const E30 = M.earnings(W, D, 30);
  ok(M.usd(E30.battery.owner) === "$127" && M.usd(E30.thermostat.owner) === "$6" && M.usd(E30.ev.owner) === "$90" && M.usd(E30.dairy.owner) === "$11,566", "owners at $30: battery $127, thermostat $6, EV charger $90, dairy $11,566");
  ok(M.usd(E30.thermostat.value) === "$45" && M.usd(E30.thermostat.value * 0.8) === "$36" && (1.2 * 0.7 * 50).toFixed(0) === "42", "thermostat: $45 a year ($42 for being ready); earns nothing at $36");
  D.vpp.devices.forEach(x => { const e = E30[x.key]; ok(near(e.owner, 0.8 * e.value - 30, 1e-9), x.key + ": owner = 80% of value − coordination"); });
  const f0 = M.feeder(W, D, false), f1 = M.feeder(W, D, true);
  ok(M.mw2(f0.peakAfter) === "3.25 MW" && f0.at === 23 && M.mw2(f0.over) === "0.25 MW" && M.mw2(f1.peakAfter) === "2.58 MW" && f1.over < 0, "Feeder 7: 3.25 MW at 23:00 at once (over by 0.25), 2.58 MW staggered");
  ok(near(Math.max.apply(null, f0.base), D.feeder.peakMW, 1e-12) && f0.base.indexOf(Math.max.apply(null, f0.base)) === 17, "Feeder 7 peaks at its 3.0 MW rating at 17:00 without the pool");
  // the neighbours' trade
  ok(near(wires, T4.home.rtp.a, 1e-6), "the trade's wires charge = A4's real-time wires charge for homes (" + T4.home.rtp.a + ")");
  { const sev = M4.profile(A4, W4, "solarev", { ev: "evening" }), ren = M4.profile(A4, W4, "renter", {}); let k = 0;
    sev.forEach((v4, t) => { if (v4 < 0) k += Math.min(-v4 + 0 * t, ren[t]); });
    // A4's net profile includes the EV (evening): at midday it is house − solar, the same as A7's export
    ok(near(M.tradeKWh(A4, W), k * A4.days, 1e-6) && Math.round(M.tradeKWh(A4, W)) === 168, "traded kWh = A4's midday exports met by the renter's use: 168 a month"); }
  for (let pl = 0; pl <= 0.095; pl += 0.005) [false, true].forEach(pay => { const r = M.trade(A4, W, wires, pl, pay); if (!near(r.seller + r.buyer + r.others, 0, 1e-9) || r.plants !== 0) ok(false, "trade at " + pl + ": a pure transfer"); });
  ok(W.price.slice(8, 17).every(p => p === 0), "the traded hours are spare-sun hours, priced $0");
  { const r = M.trade(A4, W, wires, 0.05, false); ok(M.usd(r.seller) === "$8" && M.usd(r.buyer) === "$8" && M.usd(-r.others) === "$16", "at 5¢: seller $8, buyer $8, others $16"); }

  // ---------------- the page's sentences and numbers
  ok(M.hookReveal(W, D) === "None: the town still uses the same 10 MWh, at 14:00 instead of 20:00. Spare sun replaces the peaker, so the running cost falls $1,000 and the plants' CO₂ 5.5 t.", "step 1 reveal");
  ok(M.shiftLine(W, D, { share: 0.05, goal: "cost" }) === "At 5%, 99 MWh move from gas hours into spare-sun hours: the running cost falls $5,995 and the plants' CO₂ 42.8 t. Energy saved: 0 MWh.", "step 2 line at 5%");
  ok(/moves 161 MWh, 62 MWh more, and books 22\.0 t less attributed CO₂, against 17\.5 t\. The plants emit the same 42\.8 t less/.test(M.goalLine(W, D, 0.05)), "step 3 line at 5%");
  has("The attributed goal moves 62 MWh more than the cheapest shift and books 4.5 t more attributed savings, yet the plants emit the same", "myth 2");
  ok(Math.round(a5.moved - c5.moved) === 62 && (Math.round(-a5.attr * 10) - Math.round(-c5.attr * 10)) / 10 === 4.5, "myth 2's 62 MWh and 4.5 t");
  has("The 5% cheapest shift moves 99 MWh and saves 0 MWh; with losses the town uses 9 MWh more.", "myth 1");
  has("At $30 a device for coordination, a thermostat earns its owner $6 a year and a dairy $11,566.", "myth 3");
  has("Released at once, Feeder 7 carries 3.25 MW at 23:00 against its 3.0 MW rating; a staggered restart keeps it at 2.58 MW.", "myth 4");
  D.facts.forEach(fc => {
    const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
    ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
    const cell = row >= 0 ? PAGE.slice(row, row + 900) : "";
    ok(cell.indexOf(fc.url) >= 0 && cell.indexOf(fc.asof) >= 0 && cell.indexOf(fc.source) >= 0, "numbers to remember: '" + fc.n + "' carries its source and date");
  });

  // ---------------- research wording (curriculum §13, guard G-SRC)
  const SNAP = {   // excerpts_for_approval.md, 2026-11-03 (E6 approved W2; E8 approved W3)
    "E6.4": "In the reported scenarios, reductions in attributed emissions were on the order of one to two percent of regional totals or less.",
    "E6.6": "Reductions are computed under average-emission-intensity accounting with perfect foresight; they are not estimates of the consequential (marginal) system response.",
    "E8.2": "From the course author's research: in the modeled supply chains, each open factory or warehouse could run its own microgrid, with on-site wind, solar and storage, an energy balance every hour, and energy bought from and sold to the grid.",
    "E8.4": "Because the transactive energy market brought a new revenue stream, locations with stronger renewables became competitive to establish facilities despite higher fixed and logistics cost.",
    "E8.7": "Holds when: stylized networks with synthetic distances and costs, candidate sites in California, Arizona and Nevada, and one year, planned week by week for products and hour by hour for energy. Leaves out: grid outages, which the studies do not model."
  };
  function portfolio() {
    const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
    try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a git checkout */ }
    return c.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
  }
  const RP = portfolio();
  if (RP) {
    const reg = fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"), revs = reg.slice(reg.indexOf("## Revisions after review"));
    Object.keys(SNAP).forEach(id => {
      const row = reg.split("\n").find(l => l.indexOf("| " + id + " | ") === 0);
      ok(row && row.split(" | ")[1] === SNAP[id], id + " in the register is the sentence this test checks");
      ok(revs.split("\n").every(l => l.indexOf("| " + id + " | ") !== 0), id + " has no revision after review");
    });
    const st = reg.slice(reg.indexOf("## W3 sources"), reg.indexOf("## E8."));
    ok(/approved as recommended/.test(st) && /E8\.1–E8\.10 and E8\.13–E8\.17/.test(st), "the register records E8.1–E8.10 and E8.13–E8.17 as approved (E8.2, E8.4, E8.7 among them)");
    ok(/E8\.2 \|[^\n]*\| F7 and A7, Real-world box/.test(reg) && /E8\.4 \|[^\n]*\| CF1 \*\*Excerpt\*\*; A7 and A14, Real-world box/.test(reg) && /E8\.7 \|[^\n]*under E8\.2–E8\.6 in every lesson that quotes them/.test(reg),
      "the register places E8.2 and E8.4 in A7's real-world box and E8.7 under them");
    const bib = fs.readFileSync(path.join(RP, "inputs/publications.bib"), "utf8");
    const titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(m => m[1].replace(/[{}]/g, "").toLowerCase());
    const cites = [...OWN.matchAll(/<li>Li et al\. \((\d{4})\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>\./g)];
    ok(cites.length === 2, "two Li et al. papers cited with titles (" + cites.length + ")");
    cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0, "sources: '" + c[3].slice(0, 50) + "' is the title in publications.bib"));
  } else console.log("note: reports/learn/excerpts_for_approval.md not found (set LEARN_PORTFOLIO); excerpts checked against this test's snapshot");
  const norm = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const bq = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  ok(bq.length === 2 && bq[0][1] === "excerpt:ghg" && bq[1][1] === "excerpt:supply-chain-mg", "two excerpts: excerpt:ghg, then excerpt:supply-chain-mg");
  const ps = b => [...b[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => norm(m[1]));
  ok(bq.length === 2 && ps(bq[0]).join("|") === [SNAP["E6.4"], SNAP["E6.6"]].join("|"), "the first excerpt is E6.4 and E6.6, word for word");
  ok(bq.length === 2 && ps(bq[1]).join("|") === [SNAP["E8.2"], SNAP["E8.4"]].join("|"), "the second excerpt is E8.2 and E8.4, word for word");
  ok(bq.length === 2 && bq[0][3] === 'Approved excerpt of: Li et al. (2025), <a href="https://doi.org/10.1016/j.crsus.2025.100367">Cell Reports Sustainability</a>.', "footer: CF6's citation, with its DOI");
  ok(bq.length === 2 && bq[1][3] === 'Approved excerpt of: Li et al. (2023), <a href="https://doi.org/10.1016/j.apm.2023.02.014">Applied Mathematical Modelling</a>.', "footer: Li et al. (2023), Applied Mathematical Modelling, with its DOI");
  const real = (OWN.match(/<div class="lx-card lx-real">([\s\S]*?)<\/div>\n<div class="lx-card lx-sources">/) || ["", ""])[1];
  ok(real.indexOf('<p class="lx-hint">' + SNAP["E8.7"] + "</p>") >= 0, "the note under the second excerpt is E8.7, word for word");
  ok(/<a href="cf6-shifting-load-to-clean-hours\.html">CF6<\/a>/.test(real), "the real-world box links case file CF6");
  // no other sentence describes the studies: strip the excerpts, E8.7, the CF6 link line and the two citations, then look
  const rest = OWN.replace(/<blockquote[\s\S]*?<\/blockquote>/g, " ").replace(SNAP["E8.7"], " ")
    .replace(/<p class="lx-hint">The full case: case file <a href="cf6-shifting-load-to-clean-hours\.html">CF6<\/a> \(how much shifting load to cleaner hours can cut emissions, and when\)\.<\/p>/, " ")
    .replace(/<li>Li et al\. \(\d{4}\)\. <a href="https:\/\/doi\.org\/[^"]+">[^<]+<\/a>\. [^<]+<\/li>/g, " ");
  const RX = /\b(stud(y|ies)|paper|course author|Li et al|excerpt|research|published|supply chain|warehouse|transactive|scenarios? reported)\b/i;
  const offenders = text(rest).split(/(?<=[.?!])\s+/).filter(s => RX.test(s) && !/^(Tests|Model, step cards)/.test(s));
  ok(offenders.length === 0, "no other sentence about the studies on the page:\n  " + offenders.slice(0, 5).join("\n  "));
  const lits = (JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || []).map(l => l.slice(1, -1));
  ok(!lits.concat(Object.values(D).filter(x => typeof x === "string")).some(s => /course author|Li et al|\bstud(y|ies)\b/i.test(s)), "no sentence about the studies in the script or the data");

  // ---------------- scope
  const ALL = PAGE + "\n" + RAW + "\n" + JS;
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear terms on the page, in the data or in the script");
  ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
  ok(!/data[- ]cent/i.test(ALL), "no data centers in this lesson");
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
  ok(hrefs.every(h => /^https:\/\/(www\.eia\.gov|www\.ferc\.gov|doi\.org)\//.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links: EIA, FERC, doi.org and learn pages only");
  ok(!/projects\/|research\.html/.test(PAGE), "no project page and no Research page");

  // ---------------- text budget
  const plain = t => t.replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/&amp;/g, "&").trim();
  const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
  const stepSrc = [...JS.matchAll(/\{ text: ((?:"|D\.)[^\n]*?),\n\s*(?:free: true,\n\s*)?build/g)].map(m => m[1]);
  ok(stepSrc.length === 9, "nine step cards (" + stepSrc.length + ")");
  stepSrc.map(src => Function("W", "D", "hm", "cents", "wires", "pct", "return " + src)(W, D, M.hm, M.cents, wires, M.pct)).forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 42, "step " + (i + 1) + ": " + n + " words (about 35)"); });
  [M.hookReveal(W, D), M.shiftLine(W, D, { share: 0.1, goal: "cost" }), M.goalLine(W, D, 0.1), M.costsLine(W, D, { share: 0.1, goal: "cost", loss: true, user: 60 }), M.vppLine(W, D, all, true),
   M.earnLine(D, E30, 30), M.feederLine(W, D, false), M.feederLine(W, D, true), M.tradeLine(A4, W, wires, 0.05, false), M.tradeLine(A4, W, wires, 0.05, true)]
    .forEach(t => ok(nWords(t) <= 42, "a line of " + nWords(t) + " words: " + t.slice(0, 60)));
  for (const share of shares) for (const user of users) for (const loss of [false, true]) { const t = M.costsLine(W, D, { share, goal: "cost", loss, user }); if (nWords(t) > 42) ok(false, "costs line too long at " + share + "/" + user); }
  const PROSE = OWN.replace(/<!-- (a07-[a-z]+):start[\s\S]*?<!-- \1:end -->/g, " ").replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^\|(.*)\|$/gm, "<td>$1</td>").replace(/<blockquote[\s\S]*?<\/blockquote>/g, " ");
  PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
    const n = nWords(x); ok(n <= 42 || x.indexOf("Holds when: stylized") === 0, "text element of " + n + " words: " + x.slice(0, 70)); });

  ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("a07"/.test(JS), "live status region; the reader's choices persist in this browser");
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
})();
