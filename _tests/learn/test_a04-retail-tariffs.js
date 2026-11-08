// test_a04-retail-tariffs.js — Node tests for lesson A4 (assets/learn/a04-retail-tariffs.js, its data file and the page,
// learn/a04-retail-tariffs.qmd):
//   - the day: 9 June 2025 cut and scaled as lesson 9 and CF6 do; the town's prices and its tightest hour
//   - the model: costs of service by part, revenue-neutral tariffs (each class pays its cost at the defaults, so the
//     gaps add to zero over the class), bills by part, what each move changes, net billing, scarcity, the large load
//   - every number on the page (step sentences, Go deeper, myths, the quick question, practice, the no-JS blocks,
//     numbers to remember) matches the model or the data file
//   - the two no-JS blocks (fallback, practice) equal what the model writes (--write rewrites them)
//   - research wording (the course's sourcing rule): the real-world box quotes the approved excerpt E7.6 word for word,
//     with CF7's footer; no other sentence describes the study
//   - state: steps 2-4 show the start whatever the reader chose later (revisiting step 3 or 4 keeps the answer and says
//     so); step 8's lines and steps 5-6's reveals follow the reader's state, as the ledger does
//   - wording: "the model's cost of serving ... falls", never "saves"; recovery from other customers is an
//     assumption; the real-time adder is a plant-and-wire charge; the large load's share is its highest hourly demand;
//     the meter statistic is dated December 2023
//   - scope: data centers only as loads; no nuclear terms anywhere in the page, the data or the script; no "AI"; links on
//     the allow-list; text budget of the step cards, the reveals, the no-JS blocks and the page's own prose
// Usage (from the site folder):  node _tests/learn/test_a04-retail-tariffs.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const PRIV = require("./private_sources.js");
const ID = "a04-retail-tariffs";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const town = require(L("data/town.json")), year = require(L("data/town_year.json"));
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

const W = M.prepare(town, year, D), T = M.calibrate(D, W);
const E0 = M.evaluate(D, W, T, {});

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = { "a04-fallback": () => M.staticFallback(D, W, T), "a04-practice": () => M.staticPractice(D, W, T) };
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

// ---------------- the day
ok(W.price.length === 24 && W.price.every(p => [0, 0.04, 0.1].indexOf(p) >= 0), "each hour's price is $0, $40 or $100 per MWh");
ok(W.tight === 20 && W.gap[20] === 179 && W.gap.every(g => g <= 179), "the town's tightest hour is 20:00–21:00 (gas need 179 MW, the day's largest)");
ok(W.key.slice(8, 17).every(k => k === "spill") && W.key.slice(20, 23).every(k => k === "pk"), "spare sun 08:00–17:00, the peaker 20:00–23:00 (as lesson 9 and CF6)");
ok(!/nuclear/.test(JS.replace(/\/\/[^\n]*/g, "")), "the script finds the always-on plant by its behaviour, never by name");

// ---------------- costs of service
const r = E0.renter, s = E0.solarev, f = E0.factory;
ok(near(r.kwh, 559.5, 1e-6) && near(r.peak, 1.7) && r.atTight === 1.7, "renter: 559.5 kWh a month (shown 560), busiest hour 1.7 kW at 20:00");
ok(near(s.kwh, 381.24, 1e-6) && near(s.peak, 9.252) && M.busiest(s.net) === 20 && Math.round(s.exportKWh) === 494, "solar and EV home: 381 kWh net, 494 kWh sent back, busiest hour 9.25 kW at 20:00");
ok(f.kwh === 170400 && f.peak === 500 && M.busiest(f.net) === 13 && f.atTight === 300, "factory: 170,400 kWh, 500 kW at 13:00, 300 kW at 20:00");
D.customers.forEach(c => { const k = E0[c.key].cost; ok(near(k.total, k.energy + k.capacity + k.wires + k.meter, 1e-9), c.key + ": cost parts add up"); });
ok(M.usd(s.cost.capacity) === "$139" && M.usd(s.cost.energy) === "$58" && M.usd(s.cost.total) === "$262", "solar and EV home: plants $139, energy $58, total $262");
ok(s.cost.capacity > s.cost.energy && s.cost.energy > s.cost.wires && s.cost.wires > s.cost.meter, "at the start the home's costs rank plants > energy > local wires > meter");
ok(s.net.slice(8, 17).every(v => v < 0) && W.price.slice(8, 17).every(p => p === 0), "its midday kWh sent back fall in hours priced $0");
ok(M.usd(f.cost.total) === "$11,984", "factory costs $11,984 a month");

// ---------------- revenue-neutral tariffs
Object.keys(D.classes).forEach(k => {
  const mix = D.classes[k].mix;
  D.tariffs.forEach(x => {
    const g = Object.keys(mix).reduce((a, ck) => a + mix[ck] * E0[ck].gap[x.key], 0);
    ok(near(g, 0, 1e-6), k + " / " + x.key + ": the class pays its cost at the defaults (gaps add to " + g.toFixed(9) + ")");
  });
});
D.customers.forEach(c => D.tariffs.forEach(x => { const b = E0[c.key].bill[x.key]; ok(near(b.total, b.fixed + b.energy + b.demand), c.key + "/" + x.key + ": bill parts add up"); }));
ok(M.cents(T.home.flat.p) === "14.7¢" && M.cents(T.home.tou.off) === "8.2¢" && M.cents(T.home.tou.peak) === "24.5¢" && near(T.home.tou.peak, 3 * T.home.tou.off), "homes: flat 14.7¢; time-of-use 8.2¢ and 24.5¢ (3×)");
ok(T.home.demand.d === 21 && M.cents(T.home.demand.e) === "5.2¢" && M.cents(T.home.rtp.a) === "9.5¢", "homes: $21.00 per kW + 5.2¢; real-time adder 9.5¢");
ok(T.business.demand.d === 15, "businesses: $15 per kW");
// the bills at the defaults (the fallback table and the step sentences)
const want = { renter: [71, 92, 87, 75, 88], solarev: [262, 66, 115, 224, 104] };
Object.keys(want).forEach(k => { const e = E0[k], v = [e.cost.total].concat(D.tariffs.map(x => e.bill[x.key].total)).map(Math.round);
  ok(v.join() === want[k].join(), k + ": cost and four bills = " + want[k].join(", ") + " (got " + v.join(", ") + ")"); });
ok(M.dusd(r.gap.flat) === "+$22" && M.dusd(s.gap.flat) === "−$196" && M.dusd(r.gap.demand) === "+$4" && M.dusd(s.gap.demand) === "−$38", "gaps: +$22 / −$196 flat, +$4 / −$38 demand");

// ---------------- what each move changes
const ev = M.change(D, W, T, "solarev", { ev: "evening" }, { ev: "night" });
ok(M.usd(-ev.cost) === "$126" && M.usd(-ev.bill.tou) === "$68" && M.usd(-ev.bill.demand) === "$30" && M.usd(-ev.bill.rtp) === "$13" && ev.bill.flat === 0, "car to 01:00: cost −$126; bills −$68 (TOU), −$30 (demand), −$13 (real-time), $0 (flat)");
const E1 = M.evaluate(D, W, T, { ev: "night" });
ok(M.busiest(E1.solarev.net) === 1 && M.usd(E1.solarev.gap.demand) === "$58", "after the move the home's busiest hour is 01:00, and it pays $58 above its cost under the demand charge");
const bt = M.change(D, W, T, "factory", { batch: "day" }, { batch: "night" });
ok(bt.cost === -720 && bt.bill.demand === -3000 && near(bt.bill.rtp, 480, 1e-6) && bt.bill.flat === 0 && bt.bill.tou === 0, "batch to midnight: cost −$720; bills −$3,000 (demand), +$480 (real-time), $0 (flat, TOU)");
const f0 = M.cost(D, W, M.profile(D, W, "factory", { batch: "day" }), "business"), f1 = M.cost(D, W, M.profile(D, W, "factory", { batch: "night" }), "business");
ok(near(f0.wires - f1.wires, 1200) && near(f1.energy - f0.energy, 480, 1e-6) && f0.capacity === f1.capacity, "the batch move: wires −$1,200, energy +$480, plants unchanged");
const Es = M.evaluate(D, W, T, { scarce: true });
ok(M.usd(Es.renter.bill.rtp.total) === "$132" && M.usd(Es.renter.bill.flat.total) === "$92" && M.usd(Es.renter.cost.total) === "$114" && near(Es.renter.gap.rtp, r.gap.rtp, 1e-9),
  "scarcity: renter's real-time bill $88 → $132, flat stays $92, cost $114; real-time keeps its gap (passes the price through)");
const nb = M.netBilling(D, W);
ok(M.cents(nb.p) === "13.5¢" && M.usd(nb.renter) === "$86" && M.usd(nb.solarev) === "$127", "net billing: 13.5¢; renter $86, home $127");
{ const C = D.classes.home, cost0 = Object.keys(C.mix).reduce((a, k) => a + C.mix[k] * E0[k].cost.total, 0), bills = Object.keys(C.mix).reduce((a, k) => a + C.mix[k] * nb[k], 0);
  ok(near(bills, cost0, 1e-6), "net billing is revenue-neutral for homes too"); }
// the large load
const L0 = M.large(D.large, 50, 0), L80 = M.large(D.large, 50, 80), L60 = M.large(D.large, 60, 80), L100 = M.large(D.large, 100, 0);
ok(L0.k === 12.5 && L0.load === 7.5e6 && L0.others === 7.5e6, "half its contract, no minimum: $7.5M each");
ok(L80.load === 12e6 && L80.others === 3e6 && L80.unused === 30, "half its contract, 80% minimum: $12.0M and $3.0M; 30 MW billed but unused");
ok(L60.billedMW === 80 && L60.others === 3e6 && L100.others === 0, "60% use at an 80% minimum bills 80 MW; full use leaves others $0");
for (let u = 25; u <= 100; u += 5) for (let m = 0; m <= 100; m += 5) {
  const x = M.large(D.large, u, m);
  if (!(x.load + x.others === D.large.upgradeCostPerYear && x.others >= 0 && (m <= u || x.others <= M.large(D.large, u, Math.max(0, m - 5)).others))) ok(false, "large load u=" + u + " m=" + m + ": the split adds up, never negative, and a higher minimum never raises others' share");
}
ok(D.large.lbnlMedian === 80 && D.facts[2].what.indexOf("median minimum billing demand was 80%") >= 0, "the slider's marker is the LBNL median in the facts");

// ---------------- the page's sentences (from the model) and numbers in the prose
const S = {
  costReveal: "Plants: $139 a month, for its 9.25 kW at 20:00 while the car charges. Its energy costs $58; the kWh it sends back at midday are worth $0, because the town is already spilling sun.",
  flatReveal: "At 14.7¢ per kWh the renter pays $92 for a cost of $71, and the solar and EV home $66 for $262. Nine renters, about $22 each above cost, cover that home's $196.",
  tou: "Charging at 01:00 cuts the time-of-use bill by $68 a month, while the model's cost of serving the home falls $126. Under the flat price the bill would not move at all.",
  demand: "At midnight the demand-charge bill falls $3,000 a month, but the model's cost of serving the factory falls only $720: the batch's energy now costs $480 more. Under real-time pricing the bill rises $480.",
  scarce: "Real-time: the renter's bill jumps from $88 to $132 this month; flat, it stays $92 while serving the renter costs $114. We assume the utility pays that gap now and recovers it from all customers later."
};
ok(Math.round(9 * r.gap.flat) === 196 && Math.round(r.gap.flat) === 22 && 9 * Math.round(r.gap.flat) !== 196, "nine renters' gaps add to $196, about $22 each (9 × $22 would be $198, so the page never writes it)");
ok(M.costReveal(D, W, E0) === S.costReveal, "step 3 reveal");
ok(M.flatReveal(D, T, E0) === S.flatReveal, "step 4 reveal");
ok(M.touReveal(D, W, T, "night") === S.tou, "step 5 reveal");
ok(M.demandReveal(D, W, T, "night") === S.demand, "step 6 reveal");
ok(M.scarcityReveal(D, W, T, true) === S.scarce, "step 7 reveal");
// steps 5-7 in the reader's state: with the scarcity week on, the car's move lowers the model's cost of serving the home more
ok(M.touReveal(D, W, T, { ev: "night", scarce: true }) === "Charging at 01:00 cuts the time-of-use bill by $68 a month, while the model's cost of serving the home falls $193 (scarcity week on). Under the flat price the bill would not move at all.",
  "step 5 reveal with the scarcity week on (revisited)");
ok(M.demandReveal(D, W, T, { batch: "night", scarce: true }) === S.demand, "step 6 reveal is the same with the scarcity week on (the batch's hours are not scarce)");

// ---------------- revisiting steps 2-4: they show the start, whatever the reader chose later
const STATES = [];
["evening", "night"].forEach(ev => ["day", "night"].forEach(batch => [false, true].forEach(scarce => STATES.push({ ev, batch, scarce }))));
STATES.forEach(st => {
  const cs = M.costStep(D, W, T, st), fs = M.flatStep(D, W, T, st), tag = JSON.stringify(st);
  ok(cs.answer === "capacity" && cs.reveal === S.costReveal, "step 3 revisited " + tag + ": the answer stays plants, from the start");
  ok(fs.answer === "renter" && fs.reveal === S.flatReveal, "step 4 revisited " + tag + ": the answer stays the renter, from the start");
  ok(!!cs.note === !M.atStart(st) && (!cs.note || /^Shown as at the start: the car charges at 19:00, the batch runs at 13:00, no scarcity week\./.test(cs.note)), "step 3 revisited " + tag + ": a note says the start is shown when the state differs");
  // the answer really is the largest part at the start, and each wrong pick's feedback is only "Not ..."
  const c = M.evaluate(D, W, T, M.START).solarev.cost, top = D.parts.map(p => p.key).sort((a, b) => c[b] - c[a])[0];
  ok(top === cs.answer && Object.keys(cs.feedback).every(k => k === top || /^Not (the meter|energy|local wires|plants)\.$/.test(cs.feedback[k])), "step 3 " + tag + ": the answer is the largest part; wrong picks get no ranking claim");
});
// in the reader's own state the ranking changes (why steps 3-4 pin the start): wires lead after the move, energy with scarcity
{ const n = M.evaluate(D, W, T, { ev: "night" }).solarev.cost, sc = M.evaluate(D, W, T, { scarce: true }).solarev.cost;
  ok(n.wires > n.energy && n.energy > n.capacity && sc.energy > sc.capacity, "after the move wires lead ($47 > $45 > $34); with scarcity energy leads"); }
ok(/pin = true; stage\.hidden = false; var seen/.test(JS) && /pin = true; stage\.hidden = false; S\.cust = "solarev"/.test(JS) && /pin = true; stage\.hidden = false; S\.tariff = "flat"/.test(JS) && (JS.match(/pin = true/g) || []).length === 3,
  "steps 2, 3 and 4 pin the start; no other step does");
ok(/costStep\(D, W, T, S\)/.test(JS) && /flatStep\(D, W, T, S\)/.test(JS), "steps 3 and 4 take their answer from costStep and flatStep");

// ---------------- step 8 in the reader's state, the same as the ledger beside it
STATES.forEach(st => {
  const E = M.evaluate(D, W, T, st), tag = JSON.stringify(st), b = M.busiest(E.solarev.net);
  const ch = M.change(D, W, T, "solarev", { ev: "evening", batch: st.batch, scarce: st.scarce }, { ev: "night", batch: st.batch, scarce: st.scarce });
  const fl = M.pickLine(D, W, T, "flat", st), tu = M.pickLine(D, W, T, "tou", st), dm = M.pickLine(D, W, T, "demand", st), rt = M.pickLine(D, W, T, "rtp", st);
  ok(fl.indexOf("the renter pays " + M.gapWords(E.renter.gap.flat) + " and the solar and EV home " + M.gapShort(E.solarev.gap.flat) + ",") >= 0 && ch.bill.flat === 0, "step 8 flat " + tag + ": the ledger's gaps; the move saves nothing");
  ok(tu.indexOf("saves its owner " + M.usd(-ch.bill.tou) + ", while the model's cost of serving the home falls " + M.usd(-ch.cost) + "; the renter pays " + M.gapWords(E.renter.gap.tou) + ".") >= 0, "step 8 time-of-use " + tag);
  ok(dm.indexOf("the renter pays " + M.gapWords(E.renter.gap.demand) + " and the home " + M.gapShort(E.solarev.gap.demand) + ". It bills the home's own busiest hour, " + M.hm(b)) >= 0 &&
     (b === W.tight) === /also the town's tightest hour/.test(dm), "step 8 demand charge " + tag);
  ok(rt.indexOf("saves its owner " + M.usd(-ch.bill.rtp) + ", while the model's cost falls " + M.usd(-ch.cost) + ".") >= 0 && /a scarcity week adds \$44 to the renter's bill/.test(rt), "step 8 real-time " + tag);
});
ok(/the renter pays \$22 below its cost and the solar and EV home \$322 below/.test(M.pickLine(D, W, T, "flat", { scarce: true })) &&
   /the home \$2 below/.test(M.pickLine(D, W, T, "demand", { ev: "night", scarce: true })) && /the home \$58 above/.test(M.pickLine(D, W, T, "demand", { ev: "night" })),
  "step 8: with the scarcity week the renter pays $22 below under Flat; the moved home $2 below (scarcity) or $58 above under the demand charge");
// the closing note: for every tariff some customer, in some habit, is nearer to cost under another tariff
D.tariffs.forEach(x => {
  let beaten = false;
  STATES.filter(st => !st.scarce).forEach(st => { const E = M.evaluate(D, W, T, st);
    D.customers.forEach(c => { const g = k => Math.abs(Math.round(E[c.key].gap[k])); if (D.tariffs.some(y => g(y.key) < g(x.key))) beaten = true; }); });
  ok(beaten, "\"" + M.PICK_NOTE + "\": " + x.key + " is beaten for some customer and habit");
});
// Go deeper, myths, quick question
has("Serving them costs $897.58 a month, and they use 5,416.7 kWh net.", "Go deeper: the class's cost and kWh");
ok(near(T.home.cost, 897.5776, 1e-9) && near(T.home.kwh, 5416.74, 1e-9), "class cost $897.58 and 5,416.7 kWh");
{ const mix = D.classes.home.mix, tou = D.tariffs[1]; let off = 0, pk = 0, net = 0, peaks = 0;
  Object.keys(mix).forEach(k => { const p = M.profile(D, W, k, M.DEFAULT), c = M.cost(D, W, p, "home"); net += mix[k] * (c.capacity + c.wires); peaks += mix[k] * Math.max(...p);
    p.forEach((v, t) => { if (M.onPeak(tou, t)) pk += mix[k] * v * 30; else off += mix[k] * v * 30; }); });
  ok(off.toFixed(1) === "3233.6" && pk.toFixed(1) === "2183.2" && net.toFixed(2) === "515.59" && peaks.toFixed(2) === "24.55", "Go deeper table: 3,233.6 and 2,183.2 kWh; $515.59; 24.55 kW");
  has("the same $797.58 ÷ (3,233.6 off-peak kWh + 3 × 2,183.2 peak kWh)", "Go deeper: TOU row");
  has("plants and wires, $515.59, ÷ the sum of the busiest hours, 24.55 kW", "Go deeper: demand row"); }
has("it falls to 13.5¢", "Go deeper: net billing price");
has("The renter's bill falls from $92 to $86; the solar and EV home's rises from $66 to $127, still below its $262 cost.", "Go deeper: net billing bills");
has("In the toy the renter pays $22 above its cost and the solar and EV home $196 below", "myth 1");
has("Moving the factory's batch saves $3,000 on its bill, but the model's cost of serving it falls only $720", "myth 2");
has("Fact: a scarcity week raises the renter's real-time bill from $88 to $132. Under the other tariffs the utility pays first; here we assume it recovers that from all customers later.", "myth 3");
has("With its highest demand at half its contract, other customers pay $7.5M a year of the upgrades with no minimum, and $3.0M with a minimum of 80% (if they cover what it does not pay).", "myth 4");
has("Time-of-use: $68 a month, against $30 under the demand charge, $13 under real-time and nothing flat; the model's cost of serving the home falls $126. With the scarcity week on, real-time saves $79, time-of-use still $68.", "quick question");
// the quick question names its state: without the scarcity week time-of-use saves most; with it, real-time does
{
  const q0 = M.change(D, W, T, "solarev", { ev: "evening" }, { ev: "night" }), q1 = M.change(D, W, T, "solarev", { ev: "evening", scarce: true }, { ev: "night", scarce: true });
  const best = q => D.tariffs.map(x => x.key).sort((a, b) => q.bill[a] - q.bill[b])[0];
  ok(best(q0) === "tou" && M.usd(-q0.bill.tou) === "$68" && M.usd(-q0.bill.demand) === "$30" && M.usd(-q0.bill.rtp) === "$13" && q0.bill.flat === 0 && M.usd(-q0.cost) === "$126", "quick question without the scarcity week: time-of-use $68, demand $30, real-time $13, flat $0; cost $126");
  ok(best(q1) === "rtp" && M.usd(-q1.bill.rtp) === "$79" && M.usd(-q1.bill.tou) === "$68", "quick question with the scarcity week: real-time saves $79, more than time-of-use's $68");
  has("Without the scarcity week, under which tariff does moving the car's charging from 19:00 to 01:00 save its owner the most?", "quick question: the state is named");
}
// step 3: how each part is priced, and a worked example that reproduces $139 from the shown operands
{
  const cr = M.costRates(D, W, E0);
  ok(cr.worked === "Plants for the solar and EV home: 9.252 kW × $15 = $138.78 a month." && (9.252 * 15).toFixed(2) === "138.78" && M.usd(E0.solarev.cost.capacity) === "$139" && near(E0.solarev.atTight, 9.252, 1e-9), "step 3: the worked example, 9.252 kW × $15 = $138.78 ($139)");
  ok(cr.lines.length === 4 && /\$15 a month per kW drawn at 20:00, the town's tightest hour/.test(cr.lines[1]) && /\$6 a month per kW of the customer's own busiest hour/.test(cr.lines[2]) && /\$10 a month for a home, \$200 for a business/.test(cr.lines[3]) && /cr\.lines\.forEach/.test(JS), "step 3: the four rates are shown");
}
// the Modeler box's bill has the hour factor, so a kW becomes a kWh
has("$$\\text{bill}(x) = F + n \\sum_{t} p_t\\, x_t\\, \\Delta t + d \\max_t x_t$$", "Modeler box: the bill with Δt");
has("one kW held for one hour uses one kWh", "Modeler box: power and energy");
// the large load's text alternative names its billing demand
ok(/aria: "Billing demand " \+ Math\.round\(r\.billedMW\) \+ " MW\. Upgrades, "/.test(JS), "large load: the cost split's text alternative names the billing demand");
// protections are stated as reducing exposure, not as a guarantee
has("Minimum bills, long contracts and exit fees can reduce other customers' exposure to a large load's upgrades; how much depends on their amounts and terms.", "explain: large-load protections");
ok(!/keep a large load's upgrades from falling/.test(PAGE) && /can reduce other customers' exposure/.test(fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8")), "large-load tariff: no guarantee in the explain layer or the glossary");
// first-use terms: EV, rate case, collateral, slopes
ok(/\[\[electric-vehicle\|EV\]\] home\?/.test(JS) && /an electric vehicle \(EV\)/.test(RAW) && /\[\[rate-case\|rate case\]\]/.test(JS) && /\[rate cases\]\{\.lx-term term="rate-case"\}\*\*, the regulator's reviews that set a utility's prices/.test(OWN) && /collateral \(security against nonpayment\)/.test(OWN) && /slopes \(how the bill changes when one hour's kW changes\)/.test(OWN), "terms: EV, rate case, collateral and slopes are explained where they first appear");
// the Modeler box: the demand charge falls only when every tied peak falls (the factory's 13:00 and 14:00)
ok(f.net[13] === f.peak && f.net[14] === f.peak && f.net.filter(v => v === f.peak).length === 2, "the factory's busiest hours, 13:00 and 14:00, are tied at 500 kW");
{ const one = f.net.slice(); one[13] -= 100; ok(near(M.bill(T.business.demand, "demand", W, one, W.price).demand, M.bill(T.business.demand, "demand", W, f.net, W.price).demand), "lowering only one tied peak leaves the demand charge unchanged"); }
has("The demand charge falls only when the highest hourly demand falls: all tied peaks must come down", "Modeler box: tied peaks");
has("sends the right signals for the costs this model represents", "Modeler box: limited to the model's costs");
// numbers to remember: each row = the data file, with its source and date
D.facts.forEach(fc => {
  const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
  const cell = row >= 0 ? PAGE.slice(row, row + 900) : "";
  ok(cell.indexOf(fc.url) >= 0 && cell.indexOf(fc.asof) >= 0 && cell.indexOf(fc.source) >= 0, "numbers to remember: '" + fc.n + "' carries its source and date");
});

ok(/in December 2023 \(128\.4 of 167\.2 million\)/.test(D.facts[1].what) && D.facts[1].asof === "December 2025; data for December 2023" && !/2024/.test(D.facts[1].what + D.facts[1].asof),
  "the meter statistic is dated December 2023 (FERC 2025 Assessment, Table 2-1), not 2024");
ok(/Time-of-use needs use split by price period; real-time pricing needs hourly readings\./.test(D.facts[1].what), "time-of-use needs use by price period, not hourly records");
ok(!/_tests|test_a04/.test(D.about), "data: the public metadata names no test file");

// ---------------- wording: costs of service, recovery, the real-time adder, the large load
const ALLTXT = T_PAGE + " " + RAW + " " + JS.replace(/\/\/[^\n]*/g, "");
ok(!/saves the utility|it saves the utility|costs \$[\d,]+ less|really save|what does the utility save/i.test(ALLTXT), "no allocated cost presented as a saving (\"the model's cost of serving ... falls\")");
ok(JS.indexOf('H("p", { class: "lx-hint", text: ALLOC }, act)') >= 0 && /may avoid future upgrades, which this model does not compute/.test(M.ALLOC), "step 5 says what the cost of serving is, and what the model does not compute");
ok(!/recovers it from everyone|then everyone|and everyone later/.test(ALLTXT) && /assume/.test(M.scarcityReveal(D, W, T, true)), "recovery from all customers is stated as an assumption");
ok(!/wires charge|for the wires/.test(ALLTXT) && /per kWh for plants and wires/.test(M.rateLines(T.home, "rtp")) && /plant-and-wire charge/.test(D.tariffs[3].pays), "the real-time adder is a plant-and-wire charge everywhere");
ok(/Its highest hourly demand each month, share of the/.test(JS) && /Demand in MW, not energy in MWh/.test(JS) && !/it does not use|uses only part|Its use, share/.test(ALLTXT), "the large load's slider is its highest hourly demand, not its energy");
ok(/Assumed here: whatever the data center does not pay/.test(JS), "the large load's residual allocation is labelled an assumption");
ok(/\[\[tariff\|tariff\]\]/.test(JS) && /\[\[customer-class\|class\]\]/.test(JS) && /tightest hour \(most gas needed\)/.test(JS) && !/Power Pool shapes/.test(JS), "tariff, class and the tightest hour are defined at first use; no unexplained 'shapes'");
{ const side = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8"); ok(/id: customer-class/.test(side), "the sidecar defines customer-class for the glossary"); }

// ---------------- research wording: E7.6, word for word (the sourcing rule)
const E76 = "Ratepayer exposure depends strongly on large-load tariff design.";
const CF7_FOOT = "From: Li et al. (2026), accepted paper, 2026 North American Power Symposium (NAPS); DOI pending.";
const RP = PRIV.path("excerpts");
if (RP) {
  const reg = fs.readFileSync(RP, "utf8");
  const row = reg.split("\n").find(l => /^\| E7\.6 \|/.test(l));
  ok(row && row.split(" | ")[1] === E76, "E7.6 in the approved wording is the sentence this test checks");
  ok(!/^\| E7\.6 \|/m.test(reg.slice(reg.indexOf("## Revisions after review"))), "E7.6 has no revision after review");
} else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); E7.6 checked against this test's copy");
{
  const real = (OWN.match(/<div class="lx-card lx-real">([\s\S]*?)<\/div>/) || ["", ""])[1];
  const bq = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  ok(bq.length === 1 && bq[0][1] === "excerpt:code" && real.indexOf(bq[0][0]) >= 0, "one excerpt, excerpt:code, in the real-world box");
  ok(bq.length === 1 && bq[0][2].replace(/<\/p><p>/g, " ").replace(/<[^>]+>/g, "").trim() === E76, "the excerpt is E7.6, word for word");
  ok(bq.length === 1 && bq[0][3] === CF7_FOOT, "the excerpt's footer is CF7's citation");
  ok(/<a href="cf7-cost-of-waiting\.html">CF7<\/a>/.test(real), "the real-world box links case file CF7");
  // no other sentence about the study: the only other mention is the citation in the sources list
  const rest = OWN.replace(/<blockquote[\s\S]*?<\/blockquote>/g, " ").replace(/<li>Li et al\. \(2026\)\. Accepted paper on the cost of delayed energization for large loads, 2026 North American Power Symposium \(NAPS\), presented October 2026; DOI pending\.<\/li>/, " ");
  ok(!/\bNAPS\b|Li et al|course author|my (study|research)|\bour (study|research)/i.test(text(rest) + " " + RAW + " " + JS), "no wording about the study outside the excerpt and its citation");
  ok(OWN.indexOf("<li>Li et al. (2026). Accepted paper on the cost of delayed energization for large loads, 2026 North American Power Symposium (NAPS), presented October 2026; DOI pending.</li>") >= 0, "the citation is E7.14, word for word");
}

// ---------------- scope
const ALL = PAGE + "\n" + RAW + "\n" + JS;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear terms on the page, in the data or in the script");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/data[- ]cent\w*[^.]{0,80}\b(supply|supplies|supplied|power plant|builds?|generat)/i.test(T_PAGE + " " + RAW + " " + JS.replace(/\/\/[^\n]*/g, "")), "data centers appear as loads only");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
ok(hrefs.every(h => /^https:\/\/(www\.eia\.gov|www\.ferc\.gov|eta-publications\.lbl\.gov)\//.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links: EIA, FERC, Berkeley Lab and learn pages only (" + hrefs.filter(h => !/^(https:\/\/(www\.eia|www\.ferc|eta-publications\.lbl)|[0-9a-z-]+\.html|#)/.test(h)).join(", ") + ")");
ok(!/projects\/|research\.html/.test(PAGE), "no project page and no Research page");

// ---------------- text budget
// inline math is $...$ holding TeX (a backslash, _, ^ or braces); "$15 per kW ... $6" is prose with two dollar amounts
const plain = t => t.replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]*[\\_^{}][^$\n]*\$/g, "x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const stepTexts = [...JS.matchAll(/\{ text: ("(?:[^"\\]|\\.)*"(?: \+ [^\n]*?)?),\n\s*(?:free: true,\n\s*)?build/g)].map(m => m[1]);
ok(stepTexts.length === 10, "ten step cards (" + stepTexts.length + ")");
// evaluate each step's text expression with the page's values in scope
const stepVals = stepTexts.map(src => Function("W", "D", "hm", "return " + src)(W, D, M.hm));
stepVals.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words (about 35)"); });
const nSent = t => plain(t).split(/(?<=[.?!])\s+(?=[A-Z“])/).filter(x => /[A-Za-z]/.test(x)).length;
stepVals.forEach((t, i) => ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences (one or two)"));
const lines = [M.costReveal(D, W, E0), M.flatReveal(D, T, E0), M.scarcityReveal(D, W, T, true), M.PICK_NOTE, M.ALLOC]
  .concat(STATES.map(st => M.touReveal(D, W, T, st))).concat(STATES.map(st => M.demandReveal(D, W, T, st)))
  .concat([].concat(...STATES.map(st => D.tariffs.map(x => M.pickLine(D, W, T, x.key, st))))).concat(D.customers.map(c => M.summary(D, W, E0, c.key)))
  .concat([M.startNote({ scarce: true })]).concat([25, 50, 75, 100].map(u => [0, 50, 80, 100].map(m => M.largeLine(D.large, u, m))).flat());
lines.forEach(t => { ok(nWords(t) <= 36, "a reveal of " + nWords(t) + " words: " + t.slice(0, 60)); ok(nSent(t) <= 2, "a reveal of " + nSent(t) + " sentences: " + t.slice(0, 60)); });
// the page's own prose, the no-JS blocks included: paragraphs, list items, definitions, table cells, captions
// the sources list is citations, not prose: it is left out
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^\|(.*)\|$/gm, "<td>$1</td>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|blockquote|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 36, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 2, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });
// the budget counts prose between two dollar amounts (the old math pattern dropped it)
ok(nWords("Plants: $15 a month per kW drawn at 20:00, and wires $6 a month") === 14, "budget: prose between dollar amounts is counted");

// ---------------- the step-card controls the page relies on
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("a04"/.test(JS), "live status region; the reader's choices persist in this browser");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && /"mid"/.test(JS), "a demo hook with a mid state");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
