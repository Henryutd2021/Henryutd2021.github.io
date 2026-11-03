// test_m04-storage-multienergy.js — Node tests for M4 (assets/learn/m04-storage-multienergy.js) with the vendored HiGHS.
//   - the weeks: 9-15 December and 14-20 July 2025 read like lesson 9's day; Prairie Town's price is $0, $40 or $100 and
//     no hour is short; heat demand follows the town's shape to its stated peaks
//   - the LP: every configuration optimal; the power, hydrogen and heat balances, levels (each ending where it starts),
//     the tank's limits and the heat network's limit hold in every hour of the solved plan
//   - the reported numbers are optimal values or differences of optimal values (the same for every best plan); the
//     configurations nest (each adds devices), so each step's cost cannot rise
//   - minimum load: relaxed LP <= exact mixed-integer program <= LP forced on (the page's bound claim), and the MILP's
//     cost is in the reference block
//   - prices (W3 brief §2.2): every hour the page offers has unique marginal values (raising and lowering that hour's
//     demand by 0.01 changes the cost at the same rate, for each carrier), and its sentence holds (heat = power ÷ 3 when
//     the heat pump sets it, the boiler's $15 when the boiler does, and so on)
//   - every number on the page (fallback, explain, Go deeper, myths, quiz) against the model and the reference block;
//     the notebook reads the same data and asserts the same reference
//   - the page on a stub document with a solver that fails, then works
// Usage (from the site folder):  node _tests/learn/test_m04-storage-multienergy.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const ID = "m04-storage-multienergy";
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
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const PAGE = fs.readFileSync(path.join(SITE, "learn", ID + ".qmd"), "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const NB = readOr(path.join(SITE, "learn/notebooks", ID + ".ipynb")), SIDE = readOr(path.join(SITE, "learn/_w1", ID + ".yml"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const PAGE0 = PAGE.replace(/ data-label="[^"]*"/g, "");
const onPage = (s, what) => ok(PAGE0.includes(s), `page states ${what}: "${s}"`);
const fm = M.fm, r1 = v => Math.round(v * 10) / 10;
const DAYN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

(async () => {
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solve = m => core.solveWith(highs, m, { timeLimit: 120 });
  const town = J("town.json"), year = J("town_year.json"), T = J("cf_targets.json");
  let D = J(ID + ".json");
  const Wk = {}; D.weeks.forEach(w => { Wk[w.id] = M.prepare(D, town, year, T, PR.townProfile, w.id); });
  const cfg = id => M.cfgOf(D, id), shown = D.configs.filter(c => !c.hidden);
  const run = (w, c, o) => { const r = solve(M.build(Wk[w], D, cfg(c), o)); return { r, o: M.read(Wk[w], D, cfg(c), r) }; };
  const rowOf = { power: "p", h2: "h", heat: "q" };
  // one-sided changes of the optimal cost when the hour's demand of a carrier rises or falls by d
  function sides(w, c, t, key, f0, d) {
    const row = rowOf[key] + t, sg = key === "power" ? -1 : 1;
    const up = solve(M.build(Wk[w], D, cfg(c), { delta: { [row]: sg * d } })).objective, dn = solve(M.build(Wk[w], D, cfg(c), { delta: { [row]: -sg * d } })).objective;
    return [(up - f0) / d, (f0 - dn) / d];
  }
  const label = (w, t) => { const d = new Date(Date.parse(D.weeks.find(x => x.id === w).date + "T00:00:00Z") + Math.floor(t / 24) * 864e5); return DAYN[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()] + ", " + String(t % 24).padStart(2, "0") + ":00"; };

  if (process.argv.includes("--write")) {
    const ref = { about: "Written by node _tests/learn/test_m04-storage-multienergy.js --write; re-solved by the same test on every run. Costs in $ a week (negative: the plant earns), energy in MWh, hydrogen in kg.", costs: {}, value: {} };
    D.weeks.forEach(w => { ref.costs[w.id] = {}; D.configs.forEach(c => { ref.costs[w.id][c.id] = r1(run(w.id, c.id).o.cost); }); });
    shown.filter(c => c.id !== "power").forEach(c => { ref.value[c.id] = {}; D.weeks.forEach(w => { ref.value[c.id][w.id] = r1(ref.costs[w.id].power - ref.costs[w.id][c.id]); }); });
    ref.on = { cost: r1(run("winter", "h2", { minLoad: "on" }).o.cost) };
    const b = solve(M.build(Wk.winter, D, cfg("h2"), { minLoad: "binary" }));
    ref.binary = { cost: r1(b.objective), status: b.status, gap: b.mipGap };
    const all = run("winter", "all"), A = all.o;
    ref.flows = { wind: r1(Wk.winter.windMWh), exp: r1(A.exp), imp: r1(A.imp), kg: Math.round(A.kg), tr: Math.round(A.tr), hp: r1(A.hpHeat), boil: r1(A.boil), rec: r1(A.rec) };
    ref.priceHours = { zero: Wk.winter.price.filter(x => x === 0).length, cc: Wk.winter.price.filter(x => x === 40).length, pk: Wk.winter.price.filter(x => x === 100).length };
    const m0 = M.build(Wk.winter, D, cfg("all")); ref.size = { cols: m0.variables.length, rows: m0.constraints.length };
    ref.series = {}; D.weeks.forEach(w => { ref.series[w.id] = { wind: Wk[w.id].wind, price: Wk[w.id].price, heat: Wk[w.id].heat }; });
    const pats = [
      { id: "free", test: p => near(p.power, 0, 1e-6) && near(p.h2, 0, 1e-6) && near(p.heat, 0, 1e-6),
        why: p => "Power is worth $0 here: one more MWh of wind could be neither sold nor used, so hydrogen and heat made from it are worth $0 too." },
      { id: "pump", test: p => near(p.power, 40, 1e-6) && near(p.heat, 40 / 3, 1e-4) && near(p.h2, 0, 1e-6),
        why: p => "The heat pump sets heat's price: $40 ÷ 3 = $13.33 per MWh of heat. Hydrogen is worth $0: the tank links this hour to hours of curtailed wind." },
      { id: "dear", test: p => near(p.power, 100, 1e-6) && near(p.heat, D.heat.boilerPerMWh, 1e-6) && p.h2 > 0.01 && p.h2 < D.hydrogen.truckPerKg - 0.01,
        why: p => "Power is dear ($100 per MWh), so the boiler sets heat's price at $15, below $100 ÷ 3. Hydrogen is worth " + fm.p(p.h2) + " per kg, set through the tank by other hours, below the $2.50 truck." }
    ];
    ref.hours = [];
    pats.forEach(pt => {
      for (let t = 0; t < Wk.winter.T; t++) {
        const p = M.prices(all.r, t); if (!pt.test(p)) continue;
        const okU = ["power", "h2", "heat"].every(k => { const s = sides("winter", "all", t, k, all.r.objective, 0.01); return near(s[0], s[1], 1e-4); });
        if (!okU) continue;
        ref.hours.push({ id: pt.id, t, label: label("winter", t), power: Math.round(p.power * 1e4) / 1e4, h2: Math.round(p.h2 * 1e4) / 1e4, heat: Math.round(p.heat * 1e4) / 1e4, why: pt.why(p) });
        break;
      }
    });
    D.reference = ref; fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n"); D = J(ID + ".json");
    console.log("  wrote the reference block");
  }
  const R = D.reference;
  ok(R && R.costs && R.hours, "the data file has a reference block (run with --write once)");

  // ---------------- the weeks
  ok(Wk.winter.i0 === M.startIndex(year, D.weeks[0]) && Wk.winter.T === 168 && Wk.summer.T === 168, "two weeks of 168 hours, read by local date");
  D.weeks.forEach(w => { const W = Wk[w.id];
    ok(W.price.every(p => p === 0 || p === 40 || p === 100) && W.short === 0, `${w.id}: Prairie Town's price is $0, $40 or $100 in every hour, and no hour is short`);
    ok(near(Math.max(...W.heat), w.heatPeakMW, 0.01) && W.heat.every(h => h > 0), `${w.id}: heat demand peaks at ${w.heatPeakMW} MW`);
  });
  ok(R.priceHours.zero === Wk.winter.price.filter(x => x === 0).length && R.priceHours.zero + R.priceHours.cc + R.priceHours.pk === 168, "the winter week's price hours");
  D.weeks.forEach(w => ok(JSON.stringify(R.series[w.id]) === JSON.stringify({ wind: Wk[w.id].wind, price: Wk[w.id].price, heat: Wk[w.id].heat }), `${w.id}: the series in the reference block (the notebook rebuilds and checks them) are the model's`));
  ok(Wk.winter.spare > Wk.summer.spare, "the winter week has more wind above the connection than the summer week");

  // ---------------- the LP, configuration by configuration
  const sol = {};
  D.weeks.forEach(w => D.configs.forEach(c => {
    const x = run(w.id, c.id), v = x.r.values, W = Wk[w.id], o = x.o; sol[w.id + c.id] = x;
    ok(x.r.status === "optimal" && near(o.cost, R.costs[w.id][c.id], 0.06), `${w.id} ${c.id}: optimal, ${fm.k(o.cost)} for the week`);
    let good = true; const k = 1000 / D.electrolyzer.kWhPerKg, lam = 1 - Math.pow(0.98, 1 / 24);
    for (let t = 0; t < W.T; t++) {
      const pr = (t + 167) % 168, val = n => v[n + t], pv = n => v[n + pr];
      if (!near(val("exp") + val("bc") + val("ez") + val("hp") + val("cur") - val("imp") - val("bd"), W.wind[t], 1e-5)) good = false;
      if (!near(k * val("ez") + val("tr") + pv("L") - val("L"), D.hydrogen.demandKgPerHour, 1e-4)) good = false;
      if (!near(3 * val("hp") + val("rec") - val("hin") + val("hout") + val("boil"), W.heat[t], 1e-5)) good = false;
      if (3 * val("hp") + val("rec") - val("hin") + val("hout") > D.heat.networkMW + 1e-6) good = false;
      if (!near(val("s"), pv("s") + D.battery.eta * val("bc") - val("bd"), 1e-5) || !near(val("Q"), (1 - lam) * pv("Q") + val("hin") - val("hout"), 1e-5)) good = false;
      if (val("L") < D.tank.minKg - 1e-6 || val("L") > D.tank.kg + 1e-6 || val("rec") > 0.2 * val("ez") + 1e-6) good = false;
    }
    ok(good, `${w.id} ${c.id}: balances, levels (ending where they start), tank and network limits hold every hour`);
  }));
  D.weeks.forEach(w => { const C = R.costs[w.id]; ok(C.nobat >= C.power - 1e-6 && C.power >= C.h2 - 1e-6 && C.h2 >= C.heat - 1e-6 && C.heat >= C.all - 1e-6, `${w.id}: each configuration adds devices, so its cost cannot rise`); });
  ok(R.value.heat.summer - R.value.h2.summer < 0.25 * (R.value.heat.winter - R.value.h2.winter), "step 6's answer: heat coupling saves much less in summer than in winter");
  ok(R.value.h2.winter > 0 && R.value.h2.summer > 0, "hydrogen coupling saves money in both weeks");

  // ---------------- minimum load
  const relaxed = R.costs.winter.h2;
  ok(R.binary.status === "optimal" && R.binary.gap <= 1e-6 && relaxed <= R.binary.cost + 0.1 && R.binary.cost <= R.on.cost + 0.1, `relaxed ${fm.k(relaxed)} <= exact MILP ${fm.k(R.binary.cost)} <= forced on ${fm.k(R.on.cost)}`);
  const bx = solve(M.build(Wk.winter, D, cfg("h2"), { minLoad: "binary" }));
  ok(bx.status === "optimal" && near(bx.objective, R.binary.cost, 0.06) && bx.duals === null, "the MILP re-solves to the reference cost and gives no duals");
  ok(near(run("winter", "h2", { minLoad: "on" }).o.cost, R.on.cost, 0.06), "forced on re-solves to the reference");
  ok(Math.abs(R.binary.cost - relaxed) < 1 ? JS.includes(": the same as the relaxed LP, so here the low-load hours can be avoided at no cost.") : true, "step 4 says the MILP equals the relaxed LP only when it does");
  ok(sol.winterh2.o.below > 0, "the solved relaxed plan runs the electrolyzer below 15% in some hours (the page names it 'this relaxed plan')");

  // ---------------- prices: unique in every offered hour, and the sentence holds
  ok(R.hours.length === 3 && R.hours.map(h => h.id).join() === "free,pump,dear", "three hours offered: free power, heat pump sets heat, dear power");
  const all = sol.winterall;
  R.hours.forEach(h => {
    const p = M.prices(all.r, h.t);
    ok(near(p.power, h.power, 1e-3) && near(p.h2, h.h2, 1e-3) && near(p.heat, h.heat, 1e-3), `${h.label}: the duals are the reference's`);
    ["power", "h2", "heat"].forEach(k => { const s = sides("winter", "all", h.t, k, all.r.objective, 0.01); ok(near(s[0], s[1], 1e-4) && near(s[0], p[k], 1e-3), `${h.label}, ${k}: unique (one-sided ${s[0].toFixed(4)} and ${s[1].toFixed(4)})`); });
    ok(h.why.split(" ").length <= 40 && h.label === label("winter", h.t), `${h.label}: short sentence and the right label`);
  });
  const hp = R.hours.find(h => h.id === "pump"), dr = R.hours.find(h => h.id === "dear");
  ok(near(hp.heat, hp.power / 3, 1e-3) && near(dr.heat, 15, 1e-6) && dr.power / 3 > 15 && dr.h2 < 2.5, "the sentences: heat = power ÷ 3 when the pump sets it; boiler $15 below $100 ÷ 3; hydrogen below the truck");

  // ---------------- numbers on the page
  const V = R.value;
  onPage(`<tr><td>+ electrolyzer and tank</td><td>${fm.k(V.h2.winter)}</td><td>${fm.k(V.h2.summer)}</td></tr>`, "the fallback row: hydrogen");
  onPage(`<tr><td>+ heat pump and heat store</td><td>${fm.k(V.heat.winter)}</td><td>${fm.k(V.heat.summer)}</td></tr>`, "the fallback row: heat");
  onPage(`<tr><td>+ waste heat from the electrolyzer</td><td>${fm.k(V.all.winter)}</td><td>${fm.k(V.all.summer)}</td></tr>`, "the fallback row: waste heat");
  onPage(`relaxed ${fm.k(relaxed)}, exact ${fm.k(R.binary.cost)}, forced on ${fm.k(R.on.cost)}`.replace(/\$/g, "\\$"), "Go deeper: the three minimum-load costs");
  onPage(`${R.size.cols.toLocaleString("en-US")} columns and ${R.size.rows.toLocaleString("en-US")} rows`, "the LP's size");
  ok(M.build(Wk.winter, D, cfg("all")).variables.length === R.size.cols, "the LP's size is the reference's");
  onPage(`heat coupling saves ${fm.k(V.heat.winter - V.h2.winter)} in the winter week and ${fm.k(V.heat.summer - V.h2.summer)} in the summer week`, "myth 1");
  onPage(`costs ${fm.k(R.on.cost - relaxed)} more`, "myth 2: forcing the unit on");
  onPage("$40 ÷ 3 = $13.33", "the heat pump price relation");
  onPage("1,000 ÷ 57 = 17.5", "the quiz"); ok(near(1000 / 57, 17.54, 0.005), "17.5 kg per MWh");
  ok(!/always|never/i.test((JS.replace(/\/\/.*$/gm, "").match(/"[^"\n]*"/g) || []).join(" ").replace(/whenever/g, "")), "no 'always' or 'never' in the page's strings");
  const stepTexts = (JS.match(/\{ text: "([^"]+)"/g) || []).map(s => s.slice(9, -1));
  ok(stepTexts.length === 8 && stepTexts.every(t => t.split(/\s+/).length <= 40), "eight step texts of 40 words at most");

  // ---------------- sources, scope, notebook, sidecar
  ok(D.battery.source.url && D.electrolyzer.source.url && D.electrolyzer.loadSource.url && D.heat.copSource.url, "efficiencies carry sources");
  ok(/illustrative/i.test(D.hydrogen.note) && /illustrative/i.test(D.heat.note) && /illustrative/i.test(D.tank.note) && /Illustrative/.test(D.plant.note), "prices and sizes are labelled illustrative");
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  const prose = (PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "") + (JS.match(/"[^"\n]*"/g) || []).join(" ") + SIDE + NB);
  ok(!NUC.test(prose.replace(/town\.fleet|f\.nuclear\.mw|nuclear\.mw|f\[\\"nuclear\\"\]\[\\"mw\\"\]|f\["nuclear"\]\["mw"\]/g, "")), "no nuclear term in the page, its strings, the sidecar or the notebook (the town's fleet is read in code only)");
  ok(!/\bAI\b|data cent/i.test(PAGE + JS), "no AI wording, no data centers");
  ok(/github\.com\/Henryutd2021\/reopt-hydrogen-framework/.test(PAGE) && !/projects\/|research\.html/.test(PAGE), "the allow-listed repository is linked; no project page");
  ok(NB.includes(ID + ".json") && NB.includes("reference") && NB.includes("assert") && NB.includes("linprog") && NB.includes("milp"), "notebook: reads the reference block and asserts it with linprog and milp");
  ["reservoir-limit", "sector-coupling", "value-of-coupling"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE), "sidecar defines " + id));
  const E3 = "Compared with wind and a battery alone, adding an electrolyzer reduced total system cost by about 7%, and using hydrogen as the storage medium for fuel cells reduced it by about 26%.";
  const q = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)"><p>([\s\S]*?)<\/p><footer>/g)];
  ok(q.length === 1 && q[0][1] === "excerpt:wind-hydrogen" && q[0][2] === E3, "the excerpt is E3.4, word for word");

  // ---------------- the page on a stub document: a solve that fails, then works
  {
    const { env, load } = require("./stubdom.js");
    const E = env();
    E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
    ["solver", "cards", "predict", "controls", "plot", "profiles", "solvestep"].forEach(n => load(n, E));
    let failing = true, calls = 0;
    const slv = E.LX.solver; slv.preload = () => Promise.resolve("worker"); slv.mode = "worker";
    slv.solve = m => { calls++; if (failing) return Promise.resolve({ status: "time-limit", ok: false, values: null, ms: { roundTrip: 10000 } }); const r = solve(m); r.ms = Object.assign({ roundTrip: 1 }, r.ms); return Promise.resolve(r); };
    let init = null, demo = null;
    E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
    E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
    const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {} };
    vm.runInNewContext(JS, mctx);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
    const unhandled = []; const onUn = e => unhandled.push(String(e && e.message || e)); process.on("unhandledRejection", onUn);
    let threw = null;
    try { init(live, { m04_storage_multienergy: D, town, town_year: year, cf_targets: T }, root); } catch (e) { threw = e.message; }
    ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
    const flush = () => new Promise(r => setImmediate(r));
    const card = () => demo.cards.el, btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent)), next = () => btns(/Next/)[0], failBox = () => card().querySelector(".m4-fail");
    try {
      demo.cards.go(2); failing = true; calls = 0;
      btns(/Solve with hydrogen/)[0].click(); await flush();
      ok(failBox() && failBox().getAttribute("role") === "alert" && /time limit/.test(failBox().textContent) && /Try again/.test(failBox().textContent), "step 3: a failed solve shows a plain message and Try again");
      ok(card().getAttribute("aria-busy") == null && next().disabled && !btns(/Solve with hydrogen/)[0].disabled, "step 3: busy cleared, the button works again, Next waits");
      failing = false; calls = 0; btns(/Try again/)[0].click(); await flush();
      ok(!failBox() && /Value of coupling/.test(card().textContent) && !next().disabled && calls === 2, "step 3: Try again solves both configurations and unlocks Next (" + calls + " solves)");
      demo.cards.go(5); failing = false; calls = 0; card().querySelectorAll(".lx-choice")[0].click(); await flush();
      ok(card().querySelectorAll(".m4-tbl tbody tr").length === 3 && !next().disabled && calls === 6, "step 6: the eight cases solve (one already solved) and the table has three rows (" + calls + " solves)");
    } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
    process.removeListener("unhandledRejection", onUn);
    ok(!unhandled.length, "no unhandled promise rejection: " + unhandled.join(" | "));
  }

  console.log(`test_m04-storage-multienergy: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL: the test threw:", e && e.stack || e); process.exit(1); });
