// test_x01-under-the-hood.js — Node tests for side topic X1 (assets/learn/x01-under-the-hood.js, its data file and the
// page learn/x01-under-the-hood.qmd):
//   - every number is read from the lesson that teaches it (F4, F5, A16, lesson 13, Prairie Town), never retyped: the
//     lesson's data file holds words only, and the script no value; each efficiency recomputed as 3,412 Btu ÷ heat rate
//   - the eight components each have a discipline, two questions, the kinds of number models borrow (from the six
//     kinds), a course number with a dated source and lessons; the sort's bins agree with its reasons
//   - the nuclear scope rule, field by field: every string that names a reactor or nuclear term carries none of the
//     scope scan's risk terms (cost change, credit, threshold, siting, timing, order, buyer, data center, ...); no design or
//     vendor name
//   - the no-JS block, ideas, stop box, check, facts and sources equal what the model writes (--write)
//   - scope: no "AI", links on the allow-list, books cited by name only
//   - text budget of the step cards, reveals and the page's prose
// Usage (from the site folder):  node _tests/learn/test_x01-under-the-hood.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "x01-under-the-hood";
const SITE = path.resolve(__dirname, "..", "..");
const L_ = p => path.join(SITE, "assets/learn", p);
const M = require(L_(ID + ".js"));
const S = require("./shelf_stop.js");
const RAW = fs.readFileSync(L_("data/" + ID + ".json"), "utf8");
const X = JSON.parse(RAW);
const d = f => JSON.parse(fs.readFileSync(L_("data/" + f + ".json"), "utf8"));
const I = { X: X, F4: d("f04-power-plants"), F5: d("f05-nuclear-basics"), C13: d("13-capstone"), A16: d("a16-hydrogen-ptx"), T: d("town") };
const JS = fs.readFileSync(L_(ID + ".js"), "utf8");
const CODE = JS.replace(/\/\/[^\n]*/g, "");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
const PATHJSON = d("path");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the generated blocks
const BLOCKS = { "x01-fallback": () => M.staticFallback(I), "x01-ideas": () => M.ideasHTML(I), "x01-stop": () => S.stopHTML(X.stop, "x01"), "x01-check": () => M.checkHTML(I),
  "x01-facts": () => M.factsHTML(I), "x01-sources": () => M.sourcesHTML(I) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");

// ---------------- read, never retyped
ok(!/[0-9]{2,}/.test(JSON.stringify({ c: X.components.map(c => [c.text, c.qs]), k: X.kinds }).replace(/\b[A-Z][0-9]{1,2}\b/g, "")), "the components and kinds carry no numbers of their own (lesson codes aside)");
["7535", "7,535", "10443", "10,443", "3412", "3,412", "59\\.3", "0\\.52", "\\b57\\b", "\\b85\\b", "\\b300\\b", "\\b40\\b"].forEach(n => ok(!new RegExp(n).test(CODE), "the script does not retype " + n));
const N = M.numbers(I), btu = I.F5.facts.btu_per_kwh.value;
ok(btu === 3412, "3,412 Btu in a kWh (F5's data, EIA)");
{ const cc = I.F4.plants.filter(p => p.key === "cc")[0]; ok(near(N.combustor[0].eff, btu / cc.heatRate) && /45\.3%/.test(N.combustor[0].what) && cc.heatRate === 7535, "combined cycle: 3,412 ÷ 7,535 = 45.3%"); }
ok(near(N.core[0 + 1].eff, btu / I.F5.facts.heat_rate_btu_kwh.value) && /32\.7%/.test(N.core[1].what), "nuclear fleet 2025: 3,412 ÷ 10,443 = 32.7%");
ok(N.blade[0].n === "59.3%" && near(16 / 27, 0.5926, 1e-4) && N.blade[1].n === "0.52", "the Betz limit (16/27 = 59.3%) and the best measured power coefficient, read from F4");
ok(N.cell[0].n === "85%" && N.cell[1].n === "15 years" && I.C13.techs.battery.rte === 0.85, "the battery's round trip and life, read from lesson 13");
ok(N.electrolyzer[0].n === "57 kWh/kg" && N.electrolyzer[1].n === "PEM 5%, alkaline 15%", "the electrolyzer's kWh per kg and minimum loads, read from A16");
ok(/complete PEM electrolyzer system/.test(N.electrolyzer[0].what) && /about 57 kWh per kilogram/.test(N.electrolyzer[0].what), "the 57 kWh/kg is the whole electrolyzer system's, as DOE's Record 24005 states");
ok(/sent into its utility-scale battery system comes back out/.test(N.cell[0].what) && /charging and discharging losses together/.test(N.cell[0].what) && /not one cell/.test(N.cell[0].what), "the 85% is a round trip of the whole battery system");
ok(/average full-load tested heat rate/.test(N.combustor[0].what) && /at full load/.test(N.combustor[0].what) && /full-load/.test(I.F4.sources.eia_t82.where + " full-load"), "the 7,535 is EIA's average full-load tested heat rate, not a year's fuel use");
ok(N.combustor[1].n === "40 MW per hour" && /illustrative/.test(N.combustor[1].what), "Prairie Town's ramp limit, labelled illustrative");
ok(N.core[0].n === "about 300 °C", "the outlet temperature of large water-cooled reactors, read from F5");

// ---------------- the components, kinds and sort
const KINDS = X.kinds.map(k => k.id);
ok(X.components.length === 8 && KINDS.length === 7, "eight components, seven kinds");
ok(/^How fast its output can change, in MW per hour\.$/.test(M.kind(X, "ramp").text) && /lowest output/.test(M.kind(X, "minload").text), "a ramp limit is a rate of change only; the minimum load is its own kind");
ok(/how often it fails, how long each outage lasts, and how many years it serves/.test(M.kind(X, "reliability").text), "reliability and life: three separate numbers");
// every course number carries a kind its component borrows (or none, for what the device does), so the kinds step shows
// only matching values, and says so when the course has none
X.components.forEach(c => N[c.id].forEach(n => ok(n.kind === null || c.borrows.indexOf(n.kind) >= 0, c.id + ": " + n.n + " is of a kind the card lists (" + n.kind + ")")));
KINDS.forEach(k => M.withKind(X, k).forEach(id => { const v = M.kindValues(I, id, k); ok(v.every(n => n.kind === k), id + " lit for " + k + ": only " + k + " values"); }));
ok(M.kindValues(I, "inverter", "rating").length === 0 && M.NONE === "This course does not quantify this property here.", "the inverter's rating: not quantified here, said so");
ok(M.withKind(X, "minload").join() === "combustor,electrolyzer" && M.kindValues(I, "electrolyzer", "minload")[0].n === "PEM 5%, alkaline 15%", "minimum loads: the combustor and the electrolyzer");
ok(N.relay[0].kind === "rating" && /detects a \[\[fault\|fault\]\] and tells a breaker to open/.test(N.relay[0].what) && !/relays (clear|defend)/i.test(RAW + JS), "the relay finds a fault and tells a breaker to open; ratings are a separate thing models keep");
ok(!/\b(ten|twenty|thirty|forty|fifty)\b/i.test(JSON.stringify(X.components)), "no spelled-out lifetimes on the cards (the blade's twenty years had no source)");
["inverter", "relay", "blade", "combustor", "core", "electrolyzer", "cell", "control"].forEach(id => ok(M.comp(X, id), "the row's component: " + id));
const live = c => { const all = [].concat(PATHJSON.starter || [], PATHJSON.more || [], PATHJSON.toolbox || []); return all.some(l => (/^\d+$/.test(c) ? l.starter === +c : l.code === c)); };
X.components.forEach(c => {
  ok(c.qs.length === 2 && c.qs.every(q => /\?$/.test(q)), c.id + ": two questions");
  ok(c.borrows.length >= 1 && c.borrows.every(k => KINDS.indexOf(k) >= 0), c.id + ": borrows from the six kinds");
  ok(N[c.id] && N[c.id].length >= 1 && N[c.id].every(n => n.n && n.what && n.src && n.src.label && n.src.asof), c.id + ": a course number with a source and date");
  ok(c.lessons.length >= 1 && c.lessons.every(live), c.id + ": lessons that exist in the course (" + c.lessons.join(", ") + ")");
  ok(c.read && !/https?:/.test(c.read), c.id + ": one book or page, cited by name");
});
KINDS.forEach(k => ok(M.withKind(X, k).length >= 1, k + ": at least one component supplies it"));
ok(M.withKind(X, "outlet").join() === "core" && M.withKind(X, "rules").join() === "control", "outlet temperature from the core; operating rules from the control room");
X.sort.cards.forEach(c => ok(X.sort.bins.some(b => b.id === c.bin) && (c.bin === "borrow" ? /^Borrowed/ : /^Kept/).test(c.why), c.id + ": its bin and its reason agree"));
ok(X.sort.cards.filter(c => c.bin === "borrow").length === 4, "four borrowed, four kept");
ok(X.cyber.answer === "b" && /apply only to bulk electric system cyber systems/.test(X.sources["nerc-sites"].text) && /not applicable to systems or assets connected to the distribution system/.test(X.sources["nerc-sites"].text), "the cyber answer follows NERC's own words (December 2022, p. 2)");
ok(Object.values(X.cyber.feedback).every(f => /bulk electric system/.test(f)), "every cyber feedback states the rule");
{ const html = M.checkHTML(I), e = 100 * btu / 7535; ok(html.indexOf("About " + Math.round(e) + "%") > 0 && html.indexOf(M.fmtN(e / 100, 3)) > 0 && /data-answer="b"/.test(html), "the efficiency question: 3,412 ÷ 7,535 = 0.453, about 45%"); }

// ---------------- the nuclear scope rule, field by field (the scope scan's nuclear-plus-risk combination)
const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
const RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
const fields = [];
(function walk(o) { if (typeof o === "string") fields.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(X);
Object.values(N).forEach(list => list.forEach(n => fields.push(n.n, n.what, n.src.label)));
fields.push(M.staticFallback(I), M.ideasHTML(I), M.checkHTML(I), M.factsHTML(I));
M.STEPS.forEach(t => fields.push(t));
// sentence level on every field that names a nuclear term
let nucFields = 0;
fields.forEach(f => S.plain(f).split(/(?<=[.?!;])\s+/).forEach(sent => { if (NUC.test(sent)) { nucFields++; if (RISK.test(sent)) ok(false, "nuclear scope: a nuclear term with a risk term: " + sent.slice(0, 90)); } }));
ok(nucFields >= 3, "the scan saw the reactor fields (" + nucFields + " sentences)");
{ const core = JSON.stringify(M.comp(X, "core")) + JSON.stringify(N.core); ok(!RISK.test(core) && !/\$|cost|price|year of|vendor|AP1000|NuScale|BWRX|Xe-100|Natrium/i.test(core), "the reactor core card: physics, heat and materials only; no cost, timing or design names"); }
ok(!/\bAI\b|artificial intelligence/.test(PAGE + RAW + JS + SIDE), "no 'AI'");
ok(!/projects\/|research\.html|smr-dc|field-notes/.test(PAGE + RAW + JS), "no project page, Research page or Field Notes link");
ok(!/data[- ]cent/i.test(PAGE + RAW + JS), "no data-center term");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
ok(hrefs.every(h => S.linkOK(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links on the allow-list (" + hrefs.filter(h => !(S.linkOK(h) || /^[0-9a-z-]+\.html/.test(h) || /^#/.test(h))).join(", ") + ")");
ok(S.problems(X.stop).length === 0, "the stop box has its parts: " + S.problems(X.stop).join("; "));
ok(["ratings", "efficiencies", "ramp limits", "outlet temperatures", "failure rates"].every(t => X.stop.lede.indexOf(t) >= 0), "the stop box states the curriculum's boundary: ratings, efficiencies, ramp limits, outlet temperatures and failure rates");
// the no-JS block holds what the cards show: both questions, what models borrow, every number with its label
{ const fb = M.staticFallback(I); X.components.forEach(c => { c.qs.concat([c.text]).forEach(q => ok(fb.indexOf(M.richS(q)) >= 0, c.id + ": the no-JS block has " + S.plain(q).slice(0, 40))); N[c.id].forEach(n => ok(fb.indexOf("<b>" + n.n + "</b> (" + n.label + ")") >= 0, c.id + ": the no-JS block names " + n.n + " as " + n.label)); });
  X.kinds.forEach(k => ok(fb.indexOf("<b>" + k.label + "</b>") >= 0, "the no-JS block lists the kind " + k.label)); ok(!/\[\[/.test(fb), "no raw glossary mark in the no-JS block"); }

// ---------------- text budget
const plain = S.plain, nWords = S.nWords, nSent = S.nSent;
ok(M.STEPS.length === 5, "five step cards");
M.STEPS.forEach((t, i) => { const n = nWords(t); ok(n >= 14 && n <= 40, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.BOARD_SAW, M.SORT_SAW, M.KIND_SAW].concat(KINDS.map(k => M.kindLine(X, k)), Object.values(X.predict.feedback), Object.values(X.cyber.feedback), X.sort.cards.map(c => c.why),
  [].concat.apply([], X.components.map(c => c.qs.concat([c.text]))), [].concat.apply([], Object.values(N).map(l => l.map(n => n.what))));
lines.forEach(t => { ok(nWords(t) <= 40, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 3, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
// the assembled card as it first shows (the discipline, one question, what models borrow) and each line under "More"
// (the whole reveal was 68 to 83 words)
X.components.forEach(c => { const P = M.cardParts(I, c.id), shown = [P.head, P.ask, P.borrow].join(" ");
  ok(nWords(shown) <= 40, c.id + ": the card shows " + nWords(shown) + " words at first");
  [P.more.ask, P.more.read].concat(P.more.nums).forEach(t => ok(nWords(t) <= 40, c.id + ": a 'More' line of " + nWords(t) + " words")); });
// the sort counts only when every card is placed (an empty check unlocked Next)
ok(/if \(g\.placed < g\.total\) \{ api\.saw\(sortNote\(g\), true\); return; \}\s*api\.done\(\)/.test(JS), "the sort: Next waits until all eight cards are placed");
ok(M.sortNote({ right: 0, placed: 0, total: 8 }) === "Place every card first: 8 still in the pool." && M.sortNote({ right: 7, placed: 8, total: 8 }) === "7 of 8 match.", "the sort's note: place every card first, then the score");
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!-- x01-(sources|facts|fallback):start[\s\S]*?:end -->/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption|h3|h4)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 42, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls
ok(/aria-live/.test(JS) && (JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 5, "live regions; a demo hook with an action for each of the five steps");
ok(/class: "x1-tile", "aria-pressed"/.test(JS) && /role: "group", "aria-label": "Eight components"/.test(JS), "the components are buttons in a labelled group");
ok(/glossary: \[\]/.test(SIDE), "the sidecar adds no glossary term (X1 uses the course's own)");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
