// test_a14-microgrid-value.js — Node tests for lesson A14 (assets/learn/a14-microgrid-value.js, its data file and
// learn/a14-microgrid-value.qmd):
//   - the real numbers equal their sources as read (the co-op survey's body tables, EIA's 2025 prices), one price year
//   - the outage year, the marginal hour, the best sizes (unique: no ties), the three designs, the four owners and the
//     village, as the page states them; the village shares lesson F7's households, mill, sun and rule
//   - every number on the page (fallbacks, myths, quiz, practice, Go deeper, facts, data notes) matches the model or data
//   - the five no-JS blocks equal what the lesson's generators write (--write rewrites them)
//   - research wording (the course's sourcing rule): the Real-world box quotes the approved excerpts E8.4, E8.6 and E8.7
//     word for word, and nothing else on the page, in the data file or in the script
//     describes the course author's work
//   - links (allowed domains, learn pages, doi.org), the text budget, the owners' role tables against their sentences
// Usage (from the site folder):  node _tests/learn/test_a14-microgrid-value.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const PRIV = require("./private_sources.js");
const ID = "a14-microgrid-value";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const F7 = require(L("f07-microgrids.js"));
const D = JSON.parse(fs.readFileSync(L("data/" + ID + ".json"), "utf8"));
const D7 = JSON.parse(fs.readFileSync(L("data/f07-microgrids.json"), "utf8"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
const O = D.outages, Ho = D.hospital, I = D.ice;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = { "a14-steps": () => M.staticSteps(D), "a14-explain": () => M.staticExplain(D), "a14-myth": () => M.staticMyth(D),
                 "a14-practice": () => M.staticPractice(D), "a14-facts": () => M.staticFacts(D) };
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
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const T = text(PAGE);

// ---------------- the real numbers, as read in the sources (3 Nov 2026)
// Berkeley Lab and partners, ICE Calculator 2 co-op report (November 2026): Table 4-2 (residential $ per event),
// Table 4-4 (residential $ per unserved kWh), Table 5-2 (non-residential $ per event), Table 5-4 (non-residential $ per
// unserved kWh), the 2-, 8- and 24-hour rows; p. 11 (three-day outage: 65% shut down, 16% backup); p. 59 (19.5% weighted
// share with backup generation). EIA Electric Power Monthly Table 5.3, 2025 annual: residential 17.23, commercial 13.37 ¢/kWh.
const READ = { household: { event: [7.08, 29.42, 53.68], kwh: [3.10, 3.22, 1.96] }, business: { event: [3772, 7898, 15106], kwh: [82, 41, 29] },
               retail: { residential: 17.23, commercial: 13.37 }, threeDay: { shut: 65, backup: 16 }, backupShare: 19.5 };
ok(JSON.stringify(I.household) === JSON.stringify(READ.household) && JSON.stringify(I.business) === JSON.stringify(READ.business), "survey values equal the report's body tables (point estimates)");
ok(I.retailCents.residential === READ.retail.residential && I.retailCents.commercial === READ.retail.commercial, "EIA 2025 retail prices");
ok(I.threeDay.shut === 65 && I.threeDay.backup === 16 && I.backupShare === 19.5 && /65% of businesses said a three-day outage would shut them down, and 16% would keep going on backup generation/.test(T), "the three-day answers and the backup share");
ok(I.hours.join() === "2,8,24" && I.names.join() === "2 hours,8 hours,24 hours", "the survey's three sustained lengths");
ok(/2025 dollars/.test(T) && !/20(1\d|2[0-4]) dollars|\$20(1\d|2[0-4])/.test(T), "one price year on the page: 2025 dollars");

// ---------------- the outage year
ok(near(M.outageCount(O), 1.43, 1e-9) && near(M.totalHours(O), 7.8, 1e-9) && near(Ho.perHour * M.totalHours(O), 70200, 1e-6), "1.43 outages and 7.8 hours a year; $70,200 for the hospital at $9,000 an hour");
const C = M.contributions(O, Ho.perHour), lg = C.filter(x => x.hours >= 12);
ok(Math.round(100 * lg.reduce((s, x) => s + x.perYear, 0) / 1.43) === 16 && Math.round(100 * lg.reduce((s, x) => s + x.expHours, 0) / 7.8) === 69 && near(Ho.perHour * lg.reduce((s, x) => s + x.expHours, 0), 48600, 1e-6),
  "outages of 12 hours or more: 16% of the outages, 69% of the hours, $48,600");
ok(near(M.S(O, 0), M.outageCount(O)) && near(M.S(O, 4), 0.23, 1e-9) && M.S(O, 72) === 0, "S(h): 1.43 at 0, 0.23 after 4 hours, 0 after 72");
for (let h = 0; h < 80; h++) ok(near(M.A(O, h + 1) - M.A(O, h), M.S(O, h), 1e-9), "the next hour of backup covers S(h) more outage hours (h = " + h + ")");

// ---------------- the battery and the generator
const bh = M.batteryHourCost(D);
ok(near(M.crf(0.07, 15), 0.10979, 1e-5) && Math.round(bh) === 14975, "an hour of battery: 300 kWh × $400 × (CRF 7%, 15 y + 1.5%) = $14,975 a year");
ok(/CRF ≈ 0\.1098: \$740,000 of equipment costs about \$81,248 a year/.test(T) && M.design(D, D.designs[2], Ho.perHour).capital === 740000 && M.usd(740000 * M.crf(0.07, 15)) === "$81,248", "Go deeper: CRF ≈ 0.1098, $740,000 → $81,248 a year");
const uniqueBest = (kind, c, max) => { const xs = []; for (let H = 0; H <= max; H++) xs.push(M.design(D, kind === "battery" ? { bat: H } : { gen: H }, c).net); const s = xs.slice().sort((a, b) => b - a); return s[0] - s[1] > 1; };
Ho.values.forEach(v => {
  ok(uniqueBest("battery", v, 12), "battery at $" + v + " an hour: the best size is unique (no tie within $1)");
  const b = M.best(D, "battery", v, 12);
  ok(b.bat === 0, "battery at $" + v + " an hour: no battery pays from outages alone (best size 0)");
});
ok(M.marginalSize(D, "battery", 3000, 12) === 0 && M.marginalSize(D, "battery", 9000, 12) === 0 && M.marginalSize(D, "battery", 27000, 12) === 4, "the marginal test: 0 hours at $3,000 and $9,000, 4 hours at $27,000");
const d4 = M.design(D, { bat: 4 }, 27000);
ok(M.usd(d4.annual) === "$97,340" && M.usd(d4.avoided) === "$89,640" && d4.net < 0, "4 hours at $27,000: $97,340 a year against $89,640 avoided");
ok(M.usd(M.nextHour(D, "battery", 0, 9000).saves) === "$12,870", "the first hour saves $12,870 at $9,000 an hour");
ok(uniqueBest("gen", Ho.perHour, 72), "generator: the best tank is unique");
const g = M.best(D, "gen", Ho.perHour, 72);
ok(g.gen === 72 && M.signed(g.net) === "+$14,219" && M.marginalSize(D, "gen", Ho.perHour, 72) === 72, "generator: the best tank holds 72 hours, +$14,219 a year");
ok(M.nextHour(D, "gen", 71, Ho.perHour).saves > D.costs.tankPerHour, "the 72nd hour still saves more than the tank's $120");
// the three designs, without and with the everyday savings
const want = { false: ["−$48,849", "+$14,219", "−$34,276"], true: ["+$5,151", "+$14,219", "+$19,724"] };
[false, true].forEach(ev => D.designs.forEach((d, i) => ok(M.signed(M.design(D, d, Ho.perHour, { everyday: ev }).net) === want[ev][i], "design " + d.key + (ev ? " with" : " without") + " everyday savings: " + want[ev][i])));
ok(M.everydaySavings(D) === 54000 && D.costs.everyday.minHours === 2 && M.design(D, { bat: 1 }, Ho.perHour, { everyday: true }).everyday === 0, "everyday savings: $54,000 a year, only with at least 2 hours of battery");
// the four owners
const own = { utility: "$104,476", coop: "$94,521", county: "$89,784", private: "$120,518" };
D.owners.forEach(o => ok(M.usd(M.design(D, D.designs[2], Ho.perHour, { everyday: true, rate: o.rate }).annual) === own[o.key], "owner " + o.key + ": annual cost " + own[o.key]));
ok(D.owners.every(o => near(M.design(D, D.designs[2], Ho.perHour, { everyday: true, rate: o.rate }).avoided, 70200, 1e-6)), "the outage cost avoided is the same for every owner");
D.owners.forEach(o => ok(o.pays && o.gains && o.risk && o.everydayTo && o.gains.indexOf(o.everydayTo.replace(/^(all )?the (utility's |co-op's )?/, "").replace(/s$/, "")) >= 0, "owner " + o.key + ": the everyday savings go to a party its 'gains' sentence names"));
// the bill savings are the campus's: the bill payer gains them under every owner; the utility and the
// co-op lose that revenue; no text calls the net a gain "for everyone"
ok(D.owners.every(o => o.everydayTo === "the campus" && /the campus \((backup and )?a lower bill/i.test(o.gains)) && /utility no longer collects/.test(D.owners[0].gains) && /co-op no longer collects/.test(D.owners[1].gains), "every owner: the bill savings go to the campus; utility and co-op owners lose that revenue");
ok(!/for everyone/i.test(JS.replace(/\/\/[^\n]*/g, "") + JSON.stringify(D) + PAGE), "no net is called a net 'for everyone'");
ok(/revenue the utility no longer collects/.test(D.texts.billNote) && /only if the smaller peak also cuts the utility's own costs/.test(D.texts.billNote) && PAGE.indexOf(D.texts.billNote) >= 0 && (JS.match(/D\.texts\.billNote/g) || []).length >= 3,
  "the campus-view boundary is stated in the no-JS version, in step 6 and under the ledger");
// value stacking is conditional
ok(/two-hour monthly peak, time to recharge before every outage, and no extra charging or wear costs/.test(D.texts.stackAssume) && JS.indexOf("D.texts.stackAssume") >= 0 && /if the battery is full when each outage starts/.test(M.stackFeedback(D)) &&
   /assumed full when each outage starts/.test(M.staticExplain(D)) && /the battery is assumed full when each outage starts/.test(PAGE), "stacking states its condition: the battery full at each outage");
// the ownership idea matches the numbers: the owner's rate moves the net
ok(!/The net is the same/.test(M.staticExplain(D) + JS) && /each owner also borrows at its own rate, so the net changes too/.test(M.staticExplain(D)) && Math.abs(own2(2) - own2(3)) > 1000, "the explain says the owner's rate changes the net, as the model's owners show");
function own2(i) { return M.design(D, D.designs[2], Ho.perHour, { everyday: true, rate: D.owners[i].rate }).net; }
// the explain ledger follows the owner picked in step 7
ok(/if \(onOwner\) onOwner\(St\.owner\)/.test(JS) && /onOwner = ledger \? ledger\.setOwner : null/.test(JS) && /return \{ setOwner: setOwner \}/.test(JS), "step 7 redraws the explain ledger for the picked owner");
// the battery's cost, worked out
const W = M.batteryWorked(D);
ok(W.steps.length === 5 && W.steps[4][1] === M.usd(M.batteryHourCost(D)) + " a year" && W.steps[1][1] === "$120,000" && W.steps[2][1] === "$13,175 a year" && W.steps[3][1] === "$1,800 a year" && near(120000 * M.crf(0.07, 15) + 1800, M.batteryHourCost(D), 1e-6),
  "an hour of battery: 300 kWh × $400 = $120,000; × CRF 0.1098 = $13,175; upkeep $1,800; $14,975 a year");
ok(W.fixed.some(r => /inverter/.test(r[0]) && r[1] === "$150,000") && PAGE.indexOf(M.workedTable(D)) >= 0 && /workedTable\(D\)/.test(JS), "the worked table, with the inverter, is in the no-JS version and in step 3");
// the village is a toy, said on the page
ok(/the same average day repeats all year; cloudy spells, seasons and battery power limits are left out/.test(D.texts.villageToy) && PAGE.indexOf(D.texts.villageToy) >= 0 && JS.indexOf("D.texts.villageToy") >= 0 && !/Cheapest panels|Cheapest battery/.test(JS) && /cheapest sizes for the repeated average day/.test(M.villageTable(D)),
  "the village's toy boundary and 'cheapest for the repeated day' are stated");
// feedback texts stay short
[M.stackFeedback(D), M.villageFeedback(D)].concat(D.owners.map(o => M.ownerFeedback(D, o) + " Try another owner.")).forEach(t => { const w = text(t.replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1")).split(" ").length; ok(w <= 40, "feedback stays short (" + w + " words): " + t.slice(0, 50)); });
D.texts.ledgerNotes.concat([D.texts.billNote, D.texts.stackAssume, D.texts.villageToy]).forEach(t => ok(t.split(" ").length <= 35, "a note stays short: " + t.slice(0, 40)));
ok(/\$0\.31 per kWh for the households, \$0\.23 with the mill at midday, \$0\.20 with a cold store too\. In the evening the mill needs more battery: \$0\.28\./.test(M.villageFeedback(D)), "step 8's feedback: the four costs per kWh");
// the household's price is the U.S. average, not its own tariff
ok(!/it pays/.test(JS.replace(/\/\/[^\n]*/g, "") + PAGE) && /the 2025 U\.S\. residential average of 17\.23¢ per kWh/.test(PAGE) && JS.indexOf("the 2025 U.S. residential average of ") >= 0, "17.23¢ is named the 2025 U.S. residential average");

// ---------------- the village: lesson F7's households, mill, sun and rule
["households", "householdW", "mill", "eff", "sun"].forEach(k => ok(JSON.stringify(D.village[k]) === JSON.stringify(D7.village[k]), "village " + k + " equals lesson F7's"));
const VC = M.CASES.map(k => ({ k: k, x: M.villageCase(D.village, k.o) }));
VC.filter(v => !v.k.o.cold).forEach(v => {
  const mill = v.k.o.mill || null, r = F7.villageDay(D7.village, v.x.kw, v.x.kwh, mill), r2 = F7.villageDay(D7.village, v.x.kw - 1, v.x.kwh, mill);
  ok(r.ok, "village " + v.k.key + ": F7's rule serves every hour with A14's cheapest design (" + v.x.kw + " kW, " + v.x.kwh + " kWh)");
  ok(v.x.kwh === 0 || !F7.villageDay(D7.village, v.x.kw, v.x.kwh - 5, mill).ok, "village " + v.k.key + ": 5 kWh less does not serve every hour");
});
VC.forEach(v => {
  const V = D.village, L = M.villageLoad(V, v.k.o), f = M.crf(V.rate, V.years) + V.om, costs = [];
  for (let kw = 1; kw <= V.panelsMax; kw++) for (let b = 0; b <= V.batteryMax; b += V.batteryStep) if (M.villageShort(V, L, kw, b) === 0) { costs.push((V.solarPerKW * kw + V.batteryPerKWh * b) * f); break; }
  costs.sort((a, b) => a - b);
  ok(costs[1] - costs[0] > 1 && near(costs[0] + V.fixed, v.x.annual, 1e-6), "village " + v.k.key + ": the cheapest design is unique");
});
const pk = VC.map(v => M.usd2(v.x.perKWh));
ok(pk.join() === "$0.31,$0.23,$0.28,$0.20", "village cost per kWh: households $0.31, mill at midday $0.23, in the evening $0.28, with a cold store $0.20 (" + pk.join() + ")");
ok(VC[1].x.kwh === VC[0].x.kwh && VC[2].x.kwh > VC[1].x.kwh, "the midday mill needs no more battery than the households alone; the evening mill needs more");

// ---------------- numbers on the page
ok(/\$14,400: 0\.4 outages × 4 hours × \$9,000 an hour/.test(T) && near(0.4 * 4 * 9000, 14400) && O.perYear[1] === 0.4 && O.hours[1] === 4, "quiz: 0.4 × 4 × $9,000 = $14,400");
ok(/spread over 15 years at 7%/.test(T) && D.finance.years === 15 && D.finance.rate === 0.07, "the data note's 15 years at 7%");
ok(/an hour without power costs \$9,000/.test(T) && Ho.perHour === 9000 && /survive 72 hours/.test(T) && O.hours[O.hours.length - 1] === 72, "Go deeper: $9,000 an hour, 72 hours");
D.facts.forEach(f => ok(PAGE.indexOf('<td class="n">' + f.n + "</td><td>" + f.what + "</td>") >= 0 && PAGE.indexOf(f.url) >= 0, "numbers to remember: '" + f.n + "' row on the page with its source"));
ok(D.facts[0].n === M.usd2(I.household.event[1]) + " · " + M.usd(I.business.event[1]) && D.facts[1].n === M.usd2(I.household.kwh[1]) + " · " + I.retailCents.residential + "¢", "facts 1 and 2 equal the survey's 8-hour values and EIA's price");
ok(M.times(I.household.kwh[1], I.retailCents.residential / 100) === 19 && M.times(I.household.kwh[2], I.retailCents.residential / 100) === 11, "a household's 8-hour loss per kWh is about 19 times its price; 24-hour about 11");
ok(D.texts.ownersNote.split(" ").length <= 40 && D.texts.tableCaption.split(" ").length <= 30, "the data's notes stay short");

// ---------------- links
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
const OKH = /^(https:\/\/doi\.org\/10\.|https:\/\/www\.eia\.gov\/|https:\/\/www\.energy\.gov\/|https:\/\/www\.ferc\.gov\/|https:\/\/eta-publications\.lbl\.gov\/|[0-9a-z-]+\.html$|\.\.\/assets\/|#)/;
ok(hrefs.length > 0 && hrefs.every(h => OKH.test(h)), "links: doi.org, EIA, DOE, FERC, Berkeley Lab and learn pages only: " + hrefs.filter(h => !OKH.test(h)).join(", "));
ok(!/projects\/|research\.html/.test(PAGE + JSON.stringify(D)), "no project page and no Research page");
// CF1's link follows its status in path.yml: linked once live, named only while it is a draft
const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), cf1 = (PY.split(/\n- kind: /).find(e => /\n  id: cf1-supply-chain-microgrids\n/.test(e)) || "");
const cf1Live = /\n  status: active\n/.test(cf1) && fs.existsSync(path.join(SITE, "learn/cf1-supply-chain-microgrids.qmd"));
ok(cf1Live ? /<a href="cf1-supply-chain-microgrids\.html">case file CF1<\/a>/.test(PAGE) && !/upcoming/.test(T) : /case file CF1 \(upcoming\)/.test(T) && !/cf1-supply-chain-microgrids\.html/.test(PAGE),
  "CF1 is " + (cf1Live ? "live: the Real-world box links it" : "a draft: named, not linked"));

// ---------------- research wording (the sourcing rule)
// Every sentence about the course author's work is an approved sentence of the excerpt wording (E8 and E9), word for
// word, or a clause of one where the row itself breaks (": ", "; ", ". "). Strict zone: the Real-world box. Signalled
// (an element that names the author's work, by RX): everything else on the page, every string of the data file, every
// string literal of this script. NOT_RESEARCH lists the labels and general sentences that may sit beside the excerpts.
const RG = { sections: ["E8"], used: ["E8.4", "E8.6", "E8.7"] };
const APPROVED_SNAPSHOT = {   // the approved wording's E8.4, E8.6 and E8.7 (approved 2026-11-03)
  "E8.4": "Because the transactive energy market brought a new revenue stream, locations with stronger renewables became competitive to establish facilities despite higher fixed and logistics cost.",
  "E8.6": "Contrary to intuition, energy storage systems, which balance intermittent power and uncertain load, had limited benefits for cost saving.",
  "E8.7": "Holds when: stylized networks with synthetic distances and costs, candidate sites in California, Arizona and Nevada, and one year, planned week by week for products and hour by hour for energy. Leaves out: grid outages, which the studies do not model."
};
const RX = /\b(course author|research|stud(y|ies)|paper|article|Li et al|excerpt|internship|confidential|supply chains?|factor(y|ies)|warehouses?|transactive|Applied Mathematical Modelling|SEGRE|California|Arizona|Nevada|synthetic|techno-economic|facilit(y|ies))\b/i;
const NOT_RESEARCH = [
  [/^From: Li et al\. \(2023\), Applied Mathematical Modelling\.$/, "provenance label"],
  [/^In the real world$/, "heading"],
  [/^The full case: case file CF1( \(upcoming\))?\.$/, "pointer to the case file"],
  [/^Beyond outages, on-site energy can also change where a business chooses to build:$/, "bridge to the excerpt: a general idea, no study claim"],
  [/^In the 2025 survey of rural co-op members, 65% of businesses said a three-day outage would shut them down, and 16% would keep going on backup generation \(Berkeley Lab and partners, p\. 11\)\.$/, "a public survey, sourced, not the course author's work"],
  [/^Li et al\. \(2023\)\. Facility and microgrid location-allocation for integrated supply chain and transactive energy operations\. Applied Mathematical Modelling 119, 119–136\.$/, "citation (checked against the publication list below)"],
  [/^Berkeley Lab with NRECA and partners \(2026\)\. ICE Calculator 2 Initiative/, "citation (the survey report)"]
];
const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
// {id: sentence} of the approved wording's rows in the sections, each revision applied (a revised row replaces the approved one)
function register(md) {
  const out = {}; let sec = null;
  const strip = t => norm(t.replace(/^(Timeline, [^:]+|Myth answer|Citations?): /, ""));
  md.split("\n").forEach(line => {
    if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+)( \[J\])? \| (.*) \|\s*$/);
    if (!m || !sec || RG.sections.indexOf("E" + m[2]) < 0) return;
    const cells = m[4].split(" | ");
    if (sec === "REV") out[m[1]] = strip(cells[1]); else if (sec === "E" + m[2]) out[m[1]] = strip(cells[0]);
  });
  return out;
}
const RP = PRIV.all("excerpts", "publications");   // the wording checks also read the publication list
let APPROVED = APPROVED_SNAPSHOT;
if (RP) {
  const MD = fs.readFileSync(RP, "utf8");
  const reg = register(MD);
  ok(RG.used.every(k => reg[k] === APPROVED_SNAPSHOT[k]), "the approved-sentence snapshot in this test equals the approved wording; differs at: " + RG.used.filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
  ok(/E8\.1–E8\.10 and E8\.13–E8\.17; E8\.11–E8\.12 dropped/.test(MD), "the approved wording records E8 (without E8.11-E8.12) as approved");
  APPROVED = {}; Object.keys(reg).filter(k => k !== "E8.11" && k !== "E8.12").forEach(k => { APPROVED[k] = reg[k]; });
} else console.log("note: the approved excerpt wording and the publication list are not both available (set LEARN_SOURCES); research wording checked against the snapshot in this test");
const UNITS = Object.values(APPROVED).map(norm);
function approved(seg) {
  const s = norm(seg);
  return s.length > 0 && UNITS.some(u => {
    for (let i = u.indexOf(s); i >= 0; i = u.indexOf(s, i + 1)) {
      const pre = u.slice(0, i), post = u.slice(i + s.length);
      if ((i === 0 || /[:;.?!] $/.test(pre)) && (post === "" || /^[:;.]/.test(post) || (/^ /.test(post) && /[.;:?!]$/.test(s)))) return true;
    }
    return false;
  });
}
const listed = s => NOT_RESEARCH.some(r => r[0].test(norm(s)));
const sentencesOf = s => norm(s).split(/(?<=[.?!])\s+(?=[A-Z“"])/);
function offending(seg) {
  if (approved(seg) || listed(seg)) return null;
  return sentencesOf(seg).find(x => !approved(x) && !listed(x)) || null;
}
function elements(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|caption|details|summary|header|h[1-6]|section|nav|script|style)\b[^>]*>|```[^\n]*\n?/i)
    .map(norm).filter(s => s && !/^(:::|\{=html\})/.test(s) && /[A-Za-z]/.test(s));
}
const bad = [];
const strict = (where, list) => list.forEach(s => { const o = offending(s); if (o) bad.push(where + ": " + o); });
const signalled = (where, list) => list.forEach(s => { if (RX.test(s)) { const o = offending(s); if (o) bad.push(where + ": " + o); } });
let REST = OWN.replace(/<style>[\s\S]*?<\/style>/g, " ");
const REAL = (REST.match(/<div class="lx-card lx-real">[\s\S]*?\n<\/div>/) || [""])[0];
ok(REAL.length > 0, "page zone found: the Real-world box");
REST = REST.replace(REAL, " ");
strict("page, the Real-world box", elements(REAL));
const SRC = (REST.match(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/) || [""])[0];
const TITLED = /^<li>Li et al\. \((\d{4})\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>\./;
const SRC_LI = [...SRC.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => m[0]);
REST = REST.replace(SRC, " ");
signalled("page, sources", SRC_LI.filter(li => !TITLED.test(li)).map(norm));
signalled("page", elements(REST.replace(/^---[\s\S]*?\n---\n/, " ")));
const FM = (PAGE.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
signalled("front matter", [...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].map(m => m[2]));
const PATHYML = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = (PATHYML.split(/\n- kind: /).find(e => new RegExp("\\n  id: " + ID + "\\n").test(e)) || "");
ok(entry.length > 0, "path.yml has the entry");
signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome): "(.*)"$/gm)].map(m => m[2]));
const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
signalled("data", strings(D).filter(x => ["about", "url", "built"].indexOf(x[0]) < 0).map(x => x[1]));
const literals = JS.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
ok(bad.length === 0, "research wording: every sentence about the course author's work is approved:\n  " + bad.join("\n  "));
// the excerpts: each sentence approved; the blocks carry the approved source keys; E9 has no citation and no link
const quotes = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<\/blockquote>/g)];
ok(quotes.length === 1 && quotes[0][1] === "excerpt:supply-chain-mg", "one excerpt block, keyed excerpt:supply-chain-mg");
const sents = quotes.flatMap(q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
ok(sents.length === 2 && sents[0] === norm(APPROVED["E8.4"]) && sents[1] === norm(APPROVED["E8.6"]), "two excerpt sentences: E8.4 and E8.6, whole rows, word for word");
ok(/<footer>From: Li et al\. \(2023\), <a href="https:\/\/doi\.org\/10\.1016\/j\.apm\.2023\.02\.014">Applied Mathematical Modelling<\/a>\.<\/footer>/.test(quotes[0][2]), "the excerpt's footer names the AMM paper with its DOI");
const E87 = APPROVED_SNAPSHOT["E8.7"].split(/(?<=\.) (?=Leaves out:)/);
ok(E87.length === 2 && norm(PAGE).indexOf(norm("<li>" + E87[0] + "</li><li>" + E87[1] + "</li>")) >= 0, "E8.7 sits under the excerpt, word for word, as two lines (holds when; leaves out)");
ok(/data-term="transactive-energy">transactive energy<\/span>/.test(PAGE) && /data-term="logistics-cost">logistics cost<\/span>/.test(PAGE) && /data-term="stylized-network">stylized networks<\/span>/.test(PAGE), "the excerpt's jargon is marked for the glossary");
// citations: titles as in the author's publication list
if (RP) {
  const bib = fs.readFileSync(PRIV.path("publications"), "utf8");
  const titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(m => m[1].replace(/[{}]/g, "").replace(/\\textbf/g, "").toLowerCase());
  const cites = SRC_LI.map(li => li.match(TITLED)).filter(Boolean);
  ok(cites.length === 1, "one Li et al. paper in the sources list");
  cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0, "sources: '" + c[3].slice(0, 50) + "' is the title in the publication list"));
}


// ---------------- text budget: every text element of the page's own prose stays short (one idea, about 35 words),
// the generated no-JS blocks and the facts table included
const prose = elements(OWN.replace(/<style>[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/^---[\s\S]*?\n---\n/, " "));
prose.forEach(s => { const w = s.split(" ").length; ok(w <= 40 || approved(s), "text element of " + w + " words (40 at most unless one approved sentence): " + s.slice(0, 70)); });
const stepSrc = [...JS.matchAll(/\n      \{ text: ([\s\S]*?),\n        build:/g)].map(m => m[1]);
ok(stepSrc.length === 8, "eight step cards (" + stepSrc.length + ")");
stepSrc.forEach((src, i) => {
  const t = norm(Function("D", "O", "usd", "batteryHourCost", "everydaySavings", "fmt1", "outageCount", "return " + src)(D, O, M.usd, M.batteryHourCost, M.everydaySavings, v => (Math.round(v * 100) / 100).toString(), M.outageCount));
  ok(t.split(" ").length <= 40, "step " + (i + 1) + " text: " + t.split(" ").length + " words (40 at most): " + t.slice(0, 60));
  ok(!/\d/.test(src.replace(/O\.hours\[[^\]]+\]|[A-Za-z_]\w*\.[\w.]+|\[\[[^\]]+\]\]|\b\w+\(/g, "")), "step " + (i + 1) + " text: every number comes from the data");
});

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
