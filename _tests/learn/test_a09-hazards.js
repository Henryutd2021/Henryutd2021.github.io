// test_a09-hazards.js — Node tests for Analyst lesson A9 (assets/learn/a09-hazards.js, on lesson A5's simulator): the
// hazards enter as the data say (windows, multipliers, the defences' eased shares, the shutoff tally); switched-off demand
// leaves the supply balance (the margins equal a run with that demand removed); a supply hazard only ever lowers the
// supply margin; the page's results at seed 2025 (each hazard, the pairs, the defences, the best portfolio
// within the budget, found by trying every one) match the model; the messages say what the numbers show for every
// input; the real events' numbers are those of their sources; every number on the page is accounted for; the drill's
// answers are right; and the page mounts and runs its six cards on a stub document. The number scan is an
// unexpected-number check: it flags a number nobody accounted for; it does not prove what a number means (the
// statements above do that).
// Usage (from the site folder):  node _tests/learn/test_a09-hazards.js [--write]
//   --write rewrites the no-JS table in learn/a09-hazards.qmd and the reference block of data/a09-hazards.json
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const A5 = require(path.join(SITE, "assets/learn/components/adequacy.js"));
const M = require(path.join(SITE, "assets/learn/a09-hazards.js"));
const PR = require(path.join(SITE, "assets/learn/components/profiles.js"));
const HPATH = path.join(SITE, "assets/learn/data/a09-hazards.json"), QPATH = path.join(SITE, "learn/a09-hazards.qmd");
const read = f => JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data", f), "utf8"));
const Y25 = read("town_year.json"), Y24 = read("m03-capacity-expansion-2024.json"), CF = read("cf_targets.json"), D5 = read("a05-adequacy.json");
let H = JSON.parse(fs.readFileSync(HPATH, "utf8"));
const SRC = A5.sources(D5, Y25, Y24, CF, PR.townProfile);
const { int, d3, times, money } = M.fm;
const HZ = H.hazards.map(h => h.id), DEF = H.defences.map(d => d.id);

// ---------------- the results at seed 2025
const SW = M.sweep(D5, SRC, H, []);
const PAIRS = H.pairs.map(p => { const ab = M.run(D5, SRC, H, p, []); return { p, ab, c: M.compound(SW.none, SW[p[0]], SW[p[1]], ab) }; });
const PORT = [];
for (let m = 1; m < (1 << DEF.length); m++) {
  const ds = DEF.filter((_, i) => m & (1 << i)), c = M.cost(H, ds);
  if (c > H.budget) continue;
  const s = M.sweep(D5, SRC, H, ds), total = HZ.reduce((a, h) => a + s[h].eue, 0);
  PORT.push({ ds, c, s, total });
}
PORT.sort((a, b) => a.total - b.total || a.c - b.c);
const BEST = PORT[0], WINT = PORT.filter(p => p.ds.join() === "winterize")[0], BAT = PORT.filter(p => p.ds.join() === "battery")[0];
const reference = {
  about: "Written by node _tests/learn/test_a09-hazards.js --write at seed 2025 and checked on every run.",
  years: Object.fromEntries(Object.keys(SW).map(k => [k, { lole: SW[k].lole, eue: +SW[k].eue.toFixed(2), shut: +SW[k].shut.toFixed(1) }])),
  pairs: PAIRS.map(x => ({ ids: x.p, lole: x.ab.lole, eue: +x.ab.eue.toFixed(2), ratio: +x.c.ratio.toFixed(4) })),
  best: { defences: BEST.ds, cost: BEST.c, total: +BEST.total.toFixed(2), portfolios: PORT.length }
};
const shutCell = (a, b) => a < 0.5 && b < 0.5 ? "0" : int(a) + " → " + int(b);
function staticTable() {
  const rows = H.hazards.map(h => `<tr><td>${h.label}</td><td>${h.when}</td><td>${d3(SW[h.id].lole)}</td><td>${int(SW[h.id].eue)}</td><td>${int(BEST.s[h.id].eue)}</td><td>${shutCell(SW[h.id].shut, BEST.s[h.id].shut)}</td></tr>`);
  return [`<table class="a9-static" aria-label="The Plains Grid in a year when each hazard strikes: LOLE, unserved energy and energy switched off directly, 500 resampled years, seed 2025">`,
    `<thead><tr><th scope="col">Year with</th><th scope="col">When</th><th scope="col">LOLE (days a year)</th><th scope="col">Unserved energy (MWh a year)</th><th scope="col">With winterizing, hardened lines and demand response</th><th scope="col">Switched off directly (MWh a year), without → with those defences</th></tr></thead>`,
    `<tbody>`, `<tr><td>No hazard</td><td>–</td><td>${d3(SW.none.lole)}</td><td>${int(SW.none.eue)}</td><td>–</td><td>0</td></tr>`, ...rows, `</tbody></table>`].join("\n");
}
const BLOCK = /(<!-- a9-table:start[^>]*-->\n)([\s\S]*?)(<!-- a9-table:end -->)/;
if (process.argv.includes("--write")) {
  H.reference = reference; fs.writeFileSync(HPATH, JSON.stringify(H, null, 2) + "\n");
  let q = fs.readFileSync(QPATH, "utf8"); q = q.replace(BLOCK, (m, a, b, c) => a + staticTable() + "\n" + c); fs.writeFileSync(QPATH, q);
  console.log("reference block and no-JS table written"); H = JSON.parse(fs.readFileSync(HPATH, "utf8"));
}
const QMD = fs.readFileSync(QPATH, "utf8"), JS = fs.readFileSync(path.join(SITE, "assets/learn/a09-hazards.js"), "utf8");
const PATHY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/a09-hazards.yml"), "utf8");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || JSON.stringify(str)));

// ---------------- the hazards enter as the data say
{
  ok(M.dayOf("01-01") === 0 && M.dayOf("01-14") === 13 && M.dayOf("07-15") === 195 && M.dayOf("12-31") === 364, "calendar: day numbers of a 365-day year");
  const heat = M.mods(H, ["heat"]).mod, cold = M.mods(H, ["cold"]).mod, fire = M.mods(H, ["fire"]);
  const count = a => Array.from(a).filter(v => v !== 1).length;
  ok(count(heat.demand) === 31 * 24 && heat.demand[195 * 24] === 1.07 && heat.demand[195 * 24 - 1] === 1 && near(heat.avail.cc[200 * 24], 0.95) && count(heat.avail.coal) === 0, "heat wave: 15 July to 14 August, demand ×1.07, gas units ×0.95");
  ok(count(cold.demand) === 7 * 24 && near(cold.avail.cc[13 * 24], 0.7) && near(cold.avail.coal[13 * 24], 0.9) && near(cold.wind[19 * 24 + 23], 0.7) && cold.wind[20 * 24] === 1, "cold snap: 14 to 20 January, demand ×1.12, gas ×0.7, coal ×0.9, wind ×0.7");
  const f0 = M.dayOf("08-01") * 24;
  ok(count(fire.mod.wind) === 21 * 8 && fire.mod.wind[f0 + 11] === 1 && near(fire.mod.wind[f0 + 12], 0.6667) && fire.mod.wind[f0 + 20] === 1 && near(fire.tally[f0 + 12], 0.05) && fire.tally[f0 + 20] === 0 && near(fire.mod.avail.cc[f0 + 12], 0.75) && fire.mod.avail.ct[f0 + 12] === 1, "wildfire: 1 to 21 August, 12:00 to 20:00, a third of the wind output and a quarter of the available combined-cycle output cut off, 5% of demand switched off (the page's words)");
  ok(/a third of the wind output and a quarter of the available combined-cycle output/.test(M.hazard(H, "fire").what) && /5% of demand/.test(M.hazard(H, "fire").what) && !/400 MW gas unit|customers/.test(M.hazard(H, "fire").what), "wildfire: the description matches the model (a share of every available combined-cycle unit, a share of demand)");
  // defences keep a share of each loss; demand is never eased
  const w = M.mods(H, ["cold"], ["winterize"]).mod, fh = M.mods(H, ["fire"], ["harden"]);
  ok(near(w.avail.cc[13 * 24], 1 - (1 / 3) * 0.3, 1e-4) && near(w.demand[13 * 24], 1.12) && near(fh.tally[f0 + 12], 0.4 * 0.05) && near(fh.mod.wind[f0 + 12], 1 - 0.4 * (1 - 0.6667)), "defences: winterizing keeps a third of the cold losses (gas 30% to 10%), demand unchanged; hardening keeps 40% of the shutoff");
  { const c0 = M.mods(H, ["cold"]).mod, t = 13 * 24, k = 0.3333; ok(["cc", "ct", "coal"].every(u => near(w.avail[u][t], 1 - k * (1 - c0.avail[u][t]), 1e-12)) && near(w.wind[t], 1 - k * 0.3, 1e-12) && /gas, coal and wind/.test(M.defence(H, "winterize").what) && /wind turbines/.test(M.defence(H, "winterize").label), "winterizing eases gas, coal and wind alike, and its name and text say so"); }
  ok(M.keep(H, "heat", ["cooling"]) === 0.5 && M.keep(H, "drought", ["cooling"]) === 0.3333 && M.keep(H, "cold", ["cooling"]) === 1, "defences: cooling eases heat and drought only");
  ok(M.cost(H, ["winterize", "harden", "dr"]) === 60 && H.budget === 60 && M.cost(H, ["battery", "cooling"]) === 85, "costs: $25M + $20M + $15M = $60M, the budget");
  // a hazard only lowers the margin: every kept hour of every year is at or below the no-hazard margin
  const S0 = A5.simulate(D5, SRC, 2025, { years: 30 });
  let worse = true; HZ.forEach(id => { const S1 = A5.simulate(D5, SRC, 2025, { years: 30, mod: M.mods(H, [id]).mod });
    S0.years.forEach((y, n) => { const m1 = new Map(); S1.years[n].idx.forEach((t, j) => m1.set(t, S1.years[n].m[j])); y.idx.forEach((t, j) => { if (!m1.has(t) || m1.get(t) > y.m[j] + 1e-3) worse = false; }); }); });
  ok(worse, "hazards: in 30 years, every hour short of 1,500 MW of margin without a hazard stays at or below it with each hazard");
  // switched-off demand leaves the balance: the margins with the tally equal a run whose demand is cut by the same share
  const fm = M.mods(H, ["fire"]), dem = Float64Array.from(fm.mod.demand, (v, t) => v * (1 - fm.tally[t]));
  const Sa = A5.simulate(D5, SRC, 2025, { years: 30, mod: fm.mod, tally: fm.tally }), Sb = A5.simulate(D5, SRC, 2025, { years: 30, mod: Object.assign({}, fm.mod, { demand: dem }) });
  let same = Sa.years.length === Sb.years.length; Sa.years.forEach((y, n) => { const z = Sb.years[n]; if (y.idx.join() !== z.idx.join() || !y.m.every((v, j) => Math.abs(v - z.m[j]) < 1e-3)) same = false; });
  ok(same && Sa.tally > 0 && Sb.tally === 0, "shutoffs: switched-off demand leaves the supply balance (30 years: the same kept hours and margins as with that demand removed); its energy is counted apart");
  ok(M.overlap(H, "heat", "drought") && M.overlap(H, "heat", "fire") && !M.overlap(H, "cold", "fire"), "pairs: heat overlaps drought and wildfire; the cold snap overlaps neither");
}

// ---------------- results at seed 2025: the page's statements
{
  ok(d3(SW.none.lole) === "0.228" && int(SW.none.eue) === "108", "no hazard: A5's grid, 0.228 days and 108 MWh a year");
  ok(int(SW.heat.eue) === "451" && int(SW.drought.eue) === "357" && int(SW.cold.eue) === "5,802" && int(SW.fire.eue) === "230" && int(SW.fire.shut) === "28,871", "hazard years: 451, 357, 5,802 and 230 MWh; 28,871 MWh switched off directly");
  ok(Math.max(...HZ.map(h => SW[h].eue)) === SW.cold.eue, "the cold snap is the worst hazard year");
  const hd = PAIRS[0];
  ok(hd.p.join() === "heat,drought" && int(hd.ab.eue) === "1,649" && int(hd.c.both) === "1,541" && int(hd.c.sum) === "591" && times(hd.c.ratio) === "2.6", "heat and drought: 1,649 MWh, adding 1,541 against 591, 2.6 times");
  ok(PAIRS[1].c.ratio > 0.999 && PAIRS[1].c.ratio < 1.001 && PAIRS[2].c.ratio > 1.05, "pairs: cold snap and wildfire simply add; heat and wildfire compound");
  ok(BEST.ds.join() === "winterize,harden,dr" && BEST.c === 60 && int(BEST.total) === "686" && PORT[1].total - BEST.total > 1, `best portfolio within $60M by total unserved energy over the four years: winterize, harden, DR (686 MWh), unique (next ${int(PORT[1].total)}) of ${PORT.length}`);
  ok(int(WINT.s.cold.eue) === "528" && int(BAT.s.cold.eue) === "3,365" && WINT.c * 2 < BAT.c, "battery myth: the battery alone leaves 3,365 MWh in the cold-snap year, winterizing 528, at less than half the cost");
  ok(JSON.stringify(H.reference) === JSON.stringify(reference), "reference block: equals the model (run --write after a change)");
  has("Unserved energy rises from 108 MWh a year with no hazard to 5,802 MWh in a cold-snap year (table below).");
  has("A heat wave and a drought together add 1,541 MWh a year, 2.6 times the 591 MWh of the two alone.");
  has("Within $60M a year, winterizing, hardening lines and demand response together leave the least unserved energy across the four hazard years: 686 MWh.");
  has("A heat wave and a drought together added 2.6 times the unserved energy of the two alone");
  has("28,871 MWh a year switched off directly, against 230 MWh of supply shortfall in that year.");
  has("A 4-hour battery alone leaves 3,365 MWh unserved in the cold-snap year, against 528 MWh with winterizing at less than half its cost.");
  has("With no hazard, 108 MWh a year go unserved; with a heat wave 451, with a drought 357, with both 1,649. Subtract the no-hazard 108 from each: the increase with both is how many times the sum of the two separate increases?");
  has("(1,649 − 108) ÷ ((451 − 108) + (357 − 108)) = 1,541 ÷ 592 ≈ 2.6 times (from the rounded numbers).");
  ok((1649 - 108) === 1541 && (451 - 108) + (357 - 108) === 592 && Math.round(SW.heat.eue) + Math.round(SW.drought.eue) - 2 * Math.round(SW.none.eue) === 592 && (1541 / 592).toFixed(1) === "2.6" && Math.round(PAIRS[0].ab.eue) === 1649, "quiz: the worked line recomputes from the rounded numbers it shows: 1,541 ÷ 592 = 2.6");
  ok(/data-id="ratio" data-answer="b"[\s\S]{0,500}<li data-value="b">2\.6 times<\/li>/.test(QMD), "quiz: the answer points at 2.6 times");
  ok(/data-id="wind" data-answer="myth"/.test(QMD) && /data-id="add" data-answer="myth"/.test(QMD) && /data-id="shutoff" data-answer="fact"/.test(QMD) && /data-id="battery" data-answer="myth"/.test(QMD), "myths: three myths, one fact");
  const m = QMD.match(BLOCK);
  ok(m && m[2].trim() === staticTable().trim(), "page: the no-JS table equals the model (run --write)");
}

// ---------------- real events: the numbers as the sources give them
{
  const ev = id => H.events.filter(e => e.id === id)[0], txt = id => JSON.stringify(ev(id));
  ok(/1,045 units/.test(txt("uri")) && /4,124 outages/.test(txt("uri")) && /75\.6%/.test(txt("uri")) && /44\.2%/.test(txt("uri")) && /31\.4%/.test(txt("uri")) && /58%, 27%, 6%/.test(txt("uri")) && /20,000 MW/.test(txt("uri")) && /23,418 MW/.test(txt("uri")) && /59\.304 Hz/.test(txt("uri")) && /4 minutes 23 seconds/.test(txt("uri")) && /printed pp\. 9, 15 and 137/.test(ev("uri").source.label), "Uri: FERC–NERC report figures, printed pages 9, 15, 137");
  ok(/not counting units already out before the storm/.test(txt("elliott")) && /not counting units already out/.test(QMD) && /over 8 to 20 February/.test(txt("uri")), "Elliott's 90,500 MW excludes units already out (report p. 5); Uri's 1,045 units are counted over 8 to 20 February");
  ok(/90,500 MW/.test(txt("elliott")) && /55%/.test(txt("elliott")) && /31%/.test(txt("elliott")) && /24%/.test(txt("elliott")) && /over 5,400 MW/.test(txt("elliott")) && /pp\. 5, 6 and 18/.test(ev("elliott").source.label), "Elliott: 90,500 MW, 55% (31% + 24%), over 5,400 MW; pages 5, 6, 18");
  ok(/491,600/.test(txt("caiso")) && /321,000/.test(txt("caiso")) && /pp\. 1 and 34–35/.test(ev("caiso").source.label) && /48%/.test(txt("drought")) && /14%/.test(txt("drought")) && /738,000/.test(txt("psps")) && /13%/.test(txt("psps")), "heat, drought and shutoff events: CAISO RCA, EIA figures");
  ok(H.prepare.length === 4 && H.prepare.every(p => p.source && /^https:\/\//.test(p.source.url)) && /EOP-012-3/.test(JSON.stringify(H.prepare)) && /2025-10-01/.test(JSON.stringify(H.prepare)), "preparation timeline: four dated steps, each with a source");
  ok(!/\b(PG&E|Pacific Gas)\b/.test(JSON.stringify(H) + QMD) && !/\b(governor|CEO|chairman|commissioner)\b/i.test(JSON.stringify(H.events) + QMD), "events: no utility named in the text, no people named or blamed");
  has("In Winter Storm Uri (February 2021) units of every kind failed: 58% of the 1,045 affected units were gas, 27% wind and 6% coal.");
}

// ---------------- texts: messages true for every input, budgets
{
  const plain = t => t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "");
  const words = t => plain(t).split(/\s+/).filter(Boolean).length;
  // pairText: compound only when the ratio is above 1.05; "different times" only when the windows do not overlap
  ok(/bite deeper than the sum/.test(M.pairText(H, "heat", "drought", PAIRS[0].c)) && /in the same year add [\d,]+ MWh a year, against [\d,]+ MWh for the two alone: they strike months apart, so their harms simply add\./.test(M.pairText(H, "cold", "fire", PAIRS[1].c)) && !/bite deeper|together/.test(M.pairText(H, "cold", "fire", { sum: 100, both: 300, ratio: 3 })) && !/months apart/.test(M.pairText(H, "heat", "fire", { sum: 100, both: 100, ratio: 1 })), "texts: the pair message follows the ratio and the overlap; a pair months apart is never called a compound");
  ok(M.pairLabel(H, "heat", "drought") === "Heat wave + drought" && M.pairLabel(H, "heat", "fire") === "Heat wave + wildfire shutoffs" && M.pairLabel(H, "cold", "fire") === "Cold snap, then wildfire shutoffs (months apart)", "texts: pair buttons say when a pair falls months apart");
  ok(M.packageText(H, ["winterize", "harden", "dr"]) === "Winterize, Harden lines and Demand response, $60M a year" && M.packageText(H, ["battery"]) === "Battery, $55M a year", "texts: results name the defences they belong to");
  ok(/less than the/.test(M.pairText(H, "heat", "drought", { sum: 100, both: 50, ratio: 0.5 })), "texts: a pair can also add less than the sum");
  const dt = M.defenceText(H, SW, BEST.s, BEST.ds);
  ok(/^For \$60M a year: in the cold snap year, unserved energy falls from 5,802 to 288 MWh, the largest cut\. \*\*Some risk remains/.test(dt) && words(dt) <= 36, "texts: the defence message (" + words(dt) + " words): " + dt);
  ok(/No shortfall is left/.test(M.defenceText(H, SW, Object.fromEntries(HZ.map(h => [h, { eue: 0 }])), ["battery"])), "texts: the defence message says none is left only when none is");
  const prompts = [...JS.matchAll(/\{ text: (?:function \(\) \{ return )?("(?:[^\n])*?")(?:; \})?,\n\s*build/g)].map(m => m[1].replace(/" \+ money\(H\.budget\) \+ "/, "$60M").replace(/^"|"$/g, ""));
  ok(prompts.length === 6, "steps: six cards (" + prompts.length + ")");
  prompts.forEach((p, i) => { const s = (plain(p).match(/[.?!](?=\s+[A-Z(\[]|$)/g) || []).length; ok(words(p) <= 35 && s <= 2, `prompt ${i + 1}: ${words(p)} words, ${s} sentences (≤ 35, ≤ 2)`); });
  const msgs = ["Uri was a [[correlated-failure|correlated failure]]: cold raised demand while freezing and fuel problems took units of every kind out together. **Lesson A5 drew outages independently; here they are not.**",
    "A cold snap year: 5,802 MWh unserved against 108 without. Shutoffs add 122 MWh of shortfall, and switch off 28,871 MWh of customers' power directly.",
    M.pairText(H, "heat", "drought", PAIRS[0].c), M.pairText(H, "cold", "fire", PAIRS[1].c), dt,
    M.CLOSING];
  msgs.forEach((t, i) => ok(words(t) <= 36, `message ${i + 1}: ${words(t)} words (≤ 36)`));
  ok(int(SW.fire.eue - SW.none.eue) === "122", "step 3: shutoffs add 122 MWh of shortfall");
  ok(/Some defences target one hazard; storage and flexible demand help in several, but cannot restore switched-off lines/.test(M.CLOSING) && DEF.filter(d => M.defence(H, d).add).every(d => HZ.every(h => PORT.filter(p => p.ds.join() === d)[0].s[h].eue < SW[h].eue - 1 && PORT.filter(p => p.ds.join() === d)[0].s[h].shut === SW[h].shut)), "step 6: the battery and demand response cut the shortfall in all four hazard years and leave the shutoffs as they are (the closing message)");
  ["correlated-failure", "compound-hazard", "public-safety-power-shutoff", "winterization", "stress-test", "derate", "firm-load-shed"].forEach(id => ok(new RegExp("id: " + id + "\\n").test(SIDE) && (JS + JSON.stringify(H)).indexOf("[[" + id + "|") >= 0, "glossary: " + id + " defined in the sidecar and marked"));
  ok(!/Thermal plants|Wellheads/.test(JS) && /\[\[derate\|derates\]\]/.test(JSON.stringify(H)), "terms: no unexplained 'thermal plants' or 'wellheads'; derates and firm load shed marked");
  const elems = [].concat((QMD.match(/<li>[\s\S]*?<\/li>/g) || []).filter(t => !/data-value=/.test(t) && !/<li>(FERC|CAISO|EIA|NERC|ERCOT)/.test(t)), QMD.match(/^- \*\*[\s\S]*?$/gm) || []);
  const w2 = t => t.replace(/<[^>]+>/g, " ").replace(/\$[^$]*\$/g, "x").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
  const long = elems.filter(t => w2(t) > 36).map(t => w2(t) + ": " + t.replace(/<[^>]+>/g, "").slice(0, 60));
  ok(elems.length >= 13 && long.length === 0, "budget: " + elems.length + " fallback, data-note and Go deeper elements are 36 words or fewer: " + JSON.stringify(long));
}

// ---------------- every number in the visible text is accounted for (whitelist scan)
{
  let body = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ")
    .replace(/^(- \*\*|\|).*$/gm, l => l.replace(/\$[^$\n]*\$/g, " "));   // math only in Go deeper bullets and tables, so a dollar amount never pairs with another
  const allowed = new Set(), add = v => allowed.add(String(v));
  staticTable().replace(/<[^>]+>/g, " ").match(/\d[\d,]*(?:\.\d+)?/g).forEach(add);
  ["500", "2025", "2021", "58", "1,045", "27", "6", "108", "5,802", "1,541", "2.6", "591", "60", "686", "28,871", "230", "3,365", "528", "451", "357", "1,649", "75.6", "20,000", "90,500", "2022", "2023", "2025", "1", "12", "44.2", "31.4", "31", "24", "4", "1.0", "1.9", "0.5", "15", "9", "137", "5", "18", "592", "2020", "13", "34", "35", "2019", "17", "30", "14", "2012", "012", "3", "7", "M-A120721", "120721", "01", "9,000", "5,000", "11", "41714", "51839", "54639", "2024", "2"].forEach(add);
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "unexpected-number check: no number on the page is outside the model's, the sources' and the structural counts; unknown: " + unknown.join(" "));
}

// ---------------- the drill
{
  const { series } = require(path.join(SITE, "assets/learn/components/drill.js"));
  const items = series(M.drillItem, 42, 400), kinds = {}; let bad = 0;
  const n = s => +s.replace(/,/g, "");
  items.forEach(it => {
    kinds[it.kind] = 1;
    if (it.kind === "perM") { const m = /costing \$(\d+)M a year cuts a hazard year's unserved energy from ([\d,]+) to ([\d,]+) MWh/.exec(it.q); if (!near(it.answer, Math.round((n(m[2]) - n(m[3])) / n(m[1]) * 10) / 10)) bad++; }
    if (it.kind === "ratio") { const m = /([\d,]+) MWh with no hazard, ([\d,]+) with hazard A, ([\d,]+) with hazard B, ([\d,]+) with both/.exec(it.q); const v = (n(m[4]) - n(m[1])) / ((n(m[2]) - n(m[1])) + (n(m[3]) - n(m[1]))); if (!near(it.answer, Math.round(v * 10) / 10)) bad++; }
    if (it.why.indexOf(it.answer.toFixed(1)) < 0) bad++;
  });
  ok(Object.keys(kinds).length === 2 && bad === 0, "drill: two kinds; every answer and worked line recomputed (" + bad + " bad)");
}

// ---------------- path.yml, scope, links
{
  ok(/id: a09-hazards\n  code: A9\n  tier: analyst\n  form: cards\n  icon: cloud\n  status: active\n  minutes: 25\n  practice_minutes: 30/.test(PATHY) && /after: \[F6, A5\]/.test(PATHY), "path.yml: A9 active, 25 + 30 minutes, after F6 and A5");
  const sub = (QMD.match(/^subtitle: "([^"]+)"/m) || [])[1], desc = (QMD.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(PATHY.indexOf('subtitle: "' + sub + '"') >= 0, "path.yml: subtitle equals the page's");
  ok(desc.split(/\s+/).length <= 35, `budget: the description is ${desc.split(/\s+/).length} words (≤ 35)`);
  ok(/<script src="\.\.\/assets\/learn\/learn\.js" defer><\/script>\n<script src="\.\.\/assets\/learn\/a09-hazards\.js" defer><\/script>/.test(QMD) && !/<script src="[^"]*a05-adequacy\.js"/.test(QMD), "page: A5's simulator comes with the bundle (components/adequacy.js); the page loads no other lesson's script");
  const body = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "");
  ok(!/nuclear|reactor|\bSMR\b|data cent|learning/i.test(body + JS.replace(/\/\/.*$/gm, "") + JSON.stringify(H)), "scope: no nuclear, data-center or learning wording");
  ok(!/href="[^"]*(projects\/|research\.)/i.test(QMD) && /href="a05-adequacy\.html"/.test(QMD) && /href="f06-grid-and-outages\.html"/.test(QMD), "links: A5 and F6; no project or Research links");
  ok(/Stress tests, not forecasts/.test(QMD) && /illustrative/.test(QMD) && /resampled/.test(QMD) && /how often each hazard strikes/.test(QMD), "data note: stress tests, illustrative, resampled, frequency left out");
}

// ---------------- the page on a stub document
{
  const vm = require("vm");
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.visible = () => false; E.LX.progress.guess = () => null; E.LX.progress.done = () => {};
  ["numanswer", "drill", "cards", "controls", "plot", "predict", "profiles", "cardsort", "timeline", "adequacy"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "a09-hazards") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const ctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: undefined, require: undefined, performance: E.window.performance, setTimeout: f => { f(); return 0; }, clearTimeout: () => {} };
  let threw = null;
  try {
    vm.runInNewContext(JS, ctx);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "a09-hazards" }, E.body), live = E.LX.H("div", null, root);
    init(live, { town_year: Y25, m03_capacity_expansion_2024: Y24, cf_targets: CF, a05_adequacy: D5, a09_hazards: H }, root);
  } catch (e) { threw = e.stack || e.message; }
  ok(!threw && demo && demo.cards, "stub: the page mounts" + (threw ? ": " + threw : ""));
  if (!threw && demo) try {
    const card = () => demo.cards.el, saw = () => { const a = card().querySelectorAll(".lx-saw"); return a.length ? a[a.length - 1].textContent : ""; };
    const btns = re => card().querySelectorAll("button").filter(b => re.test(b.getAttribute("aria-label") || b.textContent));
    demo.cards.go(1); btns(/^Gas units$/)[0].click();
    ok(/Uri was a correlated failure/.test(saw()) && /1,045 units/.test(card().textContent), "stub: step 2 shows Uri's facts");
    demo.cards.go(2); btns(/^Cold snap$/)[0].click(); btns(/^Wildfire shutoffs$/)[0].click();
    ok(/^A cold snap year: 5,802 MWh unserved against 108 without\. Shutoffs add 122 MWh of shortfall, and switch off 28,871 MWh/.test(saw()), "stub: step 3: " + saw().slice(0, 90));
    demo.cards.go(3); btns(/^Heat wave \+ drought$/)[0].click();
    ok(/^Heat wave and drought together add 1,541 MWh a year of unserved energy, 2\.6 times the 591 MWh/.test(saw()), "stub: step 4: " + saw().slice(0, 90));
    btns(/^Cold snap, then wildfire shutoffs \(months apart\)$/)[0].click();
    ok(/Cold snap, then wildfire shutoffs/.test(card().textContent) && /strike months apart/.test(saw()), "stub: step 4's pair months apart is labelled so: " + saw().slice(0, 90));
    demo.cards.go(4); ["Winterize", "Harden lines", "Demand response"].forEach(l => btns(new RegExp("^" + l + " · "))[0].click());
    ok(/Chosen: \$60M of \$60M a year/.test(card().textContent), "stub: step 5's budget line");
    btns(/Run the hazard years/)[0].click();
    ok(/^For \$60M a year: in the cold snap year, unserved energy falls from 5,802 to 288 MWh/.test(saw()), "stub: step 5: " + saw().slice(0, 90));
    ok(/Results for: Winterize, Harden lines and Demand response, \$60M a year\./.test(card().textContent) && /28,871 → 11,548/.test(card().textContent) && /Switched off directly, before → with \(MWh\/yr\)/.test(card().textContent), "stub: step 5 labels its results with their defences and shows the direct shutoffs on every screen");
    const stale = () => card().querySelector(".a9-warn");
    ok(stale() && stale().hidden, "stub: step 5: no stale warning right after a run");
    btns(/^Battery · /)[0].click();
    ok(/over budget/.test(card().textContent) && btns(/Run the hazard years/)[0].disabled, "stub: step 5 refuses a plan over the budget");
    ok(!stale().hidden && /Your choice has changed/.test(saw()), "stub: step 5 marks the old results stale when the choice changes");
    btns(/^Battery · /)[0].click();
    ok(stale().hidden && /^For \$60M a year/.test(saw()), "stub: step 5: back to the choice that was run, the results are current again");
    demo.cards.go(5); btns(/Done reading/)[0].click();
    ok(/Some defences target one hazard/.test(saw()) && /EOP-012-3/.test(card().textContent), "stub: step 6 shows the preparation timeline");
  } catch (e) { ok(false, "stub: the page test threw: " + (e && e.stack || e)); }
}

console.log(`a09-hazards: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
