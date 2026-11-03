// test_a04-retail-tariffs.js — Node tests for lesson A4 (assets/learn/a04-retail-tariffs.js, its data file and the page,
// learn/a04-retail-tariffs.qmd):
//   - the day: 9 June 2025 cut and scaled as lesson 9 and CF6 do; the town's prices and its tightest hour
//   - the model: costs of service by part, revenue-neutral tariffs (each class pays its cost at the defaults, so the
//     gaps add to zero over the class), bills by part, what each move changes, net billing, scarcity, the large load
//   - every number on the page (step sentences, Go deeper, myths, the quick question, practice, the no-JS blocks,
//     numbers to remember) matches the model or the data file
//   - the two no-JS blocks (fallback, practice) equal what the model writes (--write rewrites them)
//   - research wording (curriculum §13, guard G-SRC): the real-world box quotes E7.6 of
//     reports/learn/excerpts_for_approval.md word for word, with CF7's footer; no other sentence describes the study
//   - scope: data centers only as loads; no nuclear terms anywhere in the page, the data or the script; no "AI"; links on
//     the allow-list; text budget of the step cards and the page's own prose
// Usage (from the site folder):  node _tests/learn/test_a04-retail-tariffs.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
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
  flatReveal: "At 14.7¢ per kWh the renter pays $92 for a cost of $71; the solar and EV home pays $66 for a cost of $262. Nine renters' $22 each cover that home's $196.",
  tou: "Charging at 01:00 cuts the time-of-use bill by $68 a month, while serving the home costs $126 less. Under the flat price the bill would not move at all.",
  demand: "At midnight the demand-charge bill falls $3,000 a month, but serving the factory costs only $720 less: the batch's energy now costs $480 more. Under real-time pricing the bill rises $480.",
  scarce: "Real-time: the renter's bill jumps from $88 to $132 this month. Flat: it stays $92 while serving the renter costs $114, so the utility pays now and recovers it from everyone later."
};
ok(M.costReveal(D, W, E0) === S.costReveal, "step 3 reveal");
ok(M.flatReveal(D, T, E0) === S.flatReveal, "step 4 reveal");
ok(M.touReveal(D, W, T, "night") === S.tou, "step 5 reveal");
ok(M.demandReveal(D, W, T, "night") === S.demand, "step 6 reveal");
ok(M.scarcityReveal(D, W, T, true) === S.scarce, "step 7 reveal");
ok(/\$4 above, home \$38 below\)\. After the move the home's busiest hour is 01:00, so it pays \$58 above/.test(M.pickLine(D, W, T, "demand")) && /\(\$44 more for the renter that month\)/.test(M.pickLine(D, W, T, "rtp")),
  "step 8 lines carry the model's numbers");
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
has("Moving the factory's batch saves $3,000 on its bill but only $720 in cost", "myth 2");
has("A scarcity week raises the renter's real-time bill from $88 to $132", "myth 3");
has("At half its contract, other customers pay $7.5M a year of the upgrades with no minimum, and $3.0M with a minimum of 80%.", "myth 4");
has("Time-of-use: $68 a month, against $30 under the demand charge, $13 under real-time pricing and nothing under the flat price. Serving the home costs $126 less.", "quick question");
// numbers to remember: each row = the data file, with its source and date
D.facts.forEach(fc => {
  const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
  const cell = row >= 0 ? PAGE.slice(row, row + 900) : "";
  ok(cell.indexOf(fc.url) >= 0 && cell.indexOf(fc.asof) >= 0 && cell.indexOf(fc.source) >= 0, "numbers to remember: '" + fc.n + "' carries its source and date");
});

// ---------------- research wording: E7.6, word for word (curriculum §13, guard G-SRC)
const E76 = "Ratepayer exposure depends strongly on large-load tariff design.";
const CF7_FOOT = "Approved excerpt of: Li et al. (2026), accepted paper, 2026 North American Power Symposium (NAPS); DOI pending.";
function portfolio() {
  const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
  try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a git checkout */ }
  return c.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
}
const RP = portfolio();
if (RP) {
  const reg = fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8");
  const row = reg.split("\n").find(l => /^\| E7\.6 \|/.test(l));
  ok(row && row.split(" | ")[1] === E76, "E7.6 in the register is the sentence this test checks");
  ok(!/^\| E7\.6 \|/m.test(reg.slice(reg.indexOf("## Revisions after review"))), "E7.6 has no revision after review");
} else console.log("note: reports/learn/excerpts_for_approval.md not found (set LEARN_PORTFOLIO); E7.6 checked against this test's copy");
{
  const real = (OWN.match(/<div class="lx-card lx-real">([\s\S]*?)<\/div>/) || ["", ""])[1];
  const bq = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  ok(bq.length === 1 && bq[0][1] === "excerpt:code" && real.indexOf(bq[0][0]) >= 0, "one excerpt, excerpt:code, in the real-world box");
  ok(bq.length === 1 && bq[0][2].replace(/<\/p><p>/g, " ").replace(/<[^>]+>/g, "").trim() === E76, "the excerpt is E7.6, word for word");
  ok(bq.length === 1 && bq[0][3] === CF7_FOOT, "the excerpt's footer is CF7's citation");
  ok(/<a href="cf7-cost-of-waiting\.html">CF7<\/a>/.test(real), "the real-world box links case file CF7");
  // no other sentence about the study: the only other mention is the citation in the sources list
  const rest = OWN.replace(/<blockquote[\s\S]*?<\/blockquote>/g, " ").replace(/<li>Li et al\. \(2026\)\. Accepted paper on the cost of delayed grid energization for large loads, 2026 North American Power Symposium \(NAPS\), presented October 2026; DOI pending\.<\/li>/, " ");
  ok(!/\bNAPS\b|Li et al|course author|my (study|research)|\bour (study|research)/i.test(text(rest) + " " + RAW + " " + JS), "no wording about the study outside the excerpt and its citation");
  ok(OWN.indexOf("<li>Li et al. (2026). Accepted paper on the cost of delayed grid energization for large loads, 2026 North American Power Symposium (NAPS), presented October 2026; DOI pending.</li>") >= 0, "the citation is E7.14, word for word");
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
const plain = t => t.replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const stepTexts = [...JS.matchAll(/\{ text: ("(?:[^"\\]|\\.)*"(?: \+ [^\n]*?)?),\n\s*(?:free: true,\n\s*)?build/g)].map(m => m[1]);
ok(stepTexts.length === 10, "ten step cards (" + stepTexts.length + ")");
// evaluate each step's text expression with the page's values in scope
const stepVals = stepTexts.map(src => Function("W", "D", "hm", "return " + src)(W, D, M.hm));
stepVals.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 42, "step " + (i + 1) + ": " + n + " words (about 35)"); });
[M.costReveal(D, W, E0), M.flatReveal(D, T, E0), M.touReveal(D, W, T, "night"), M.demandReveal(D, W, T, "night"), M.scarcityReveal(D, W, T, true)]
  .concat(D.tariffs.map(x => M.pickLine(D, W, T, x.key))).concat(D.customers.map(c => M.summary(D, W, E0, c.key)))
  .forEach(t => ok(nWords(t) <= 42, "a reveal of " + nWords(t) + " words: " + t.slice(0, 60)));
// the page's own prose: paragraphs, list items, definitions, table cells (the no-JS blocks are checked above)
const PROSE = OWN.replace(/<!-- (a04-[a-z]+):start[\s\S]*?<!-- \1:end -->/g, " ").replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^\|(.*)\|$/gm, "<td>$1</td>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|blockquote|br)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 42, "text element of " + n + " words: " + x.slice(0, 70)); });

// ---------------- the step-card controls the page relies on
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("a04"/.test(JS), "live status region; the reader's choices persist in this browser");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && /"mid"/.test(JS), "a demo hook with a mid state");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
