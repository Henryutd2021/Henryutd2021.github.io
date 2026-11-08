// test_a03-market-design.js — Node tests for Analyst lesson A3 (assets/learn/a03-market-design.js): the costs are lesson
// 7's; each hour clears as stated (merit order, the scarcity adder, the cap when short, dispatch equal to demand); the
// year's numbers, the solar sweep, which new plants cover their costs, the energy-only resting point and the capacity
// market's price match the page; the displayed equations reproduce the model in every hour (the cap when short, the
// adder's floor, the credit in renewable margins, the capacity price's floor); scarcity hours include the hours short;
// the claims hold over every slider setting a card can produce; step 3's solar stays in step 3 and later steps say so;
// the five arrangements carry dated sources on the allow-list, and the no-JS page lists them; no design is called
// best; every displayed note keeps the text budget; the unexpected-number scan finds no number nobody accounted for (it
// does not prove what a number means: the statements do); and the page mounts and runs its eight cards on a stub
// document.
// Usage (from the site folder):  node _tests/learn/test_a03-market-design.js [--write]
//   --write rewrites the no-JS tables in learn/a03-market-design.qmd and the reference block of data/a03-market-design.json
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/a03-market-design.js"));
const PR = require(path.join(SITE, "assets/learn/components/profiles.js"));
const DPATH = path.join(SITE, "assets/learn/data/a03-market-design.json"), QPATH = path.join(SITE, "learn/a03-market-design.qmd");
const read = f => JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data", f), "utf8"));
const Y = read("town_year.json"), CF = read("cf_targets.json"), L7 = read("07-cost.json");
let D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
const X = M.setup(D, Y, CF, PR.townProfile, L7);
const { usd, usd0, int, pct, mwday } = M.fm;
const G = D.market, S0 = G.solar.value, C0 = G.peakers.value;
const EO = M.year(D, X, { solar: S0, ct: C0, design: "eo" }), CM = M.year(D, X, { solar: S0, ct: C0, design: "cm" });
const NOON = M.hour(D, X, M.hourOf(D.hours[0]), { solar: S0, ct: C0, design: "eo" }), EVE = M.hour(D, X, M.hourOf(D.hours[1]), { solar: S0, ct: C0, design: "eo" });
const RP = M.restingPoint(D, X, S0), STAY = M.upkeepPoint(D, X, S0);
const SOL = []; for (let s = G.solar.min; s <= G.solar.max; s += G.solar.step) SOL.push(M.year(D, X, { solar: s, ct: C0, design: "eo" }));
const reference = {
  about: "Results of the lesson's market model at the defaults (1,200 MW of solar, 700 MW of peakers): the year under each design, a noon and an evening hour, and the energy-only resting point.",
  ct: C0, solar: S0,
  eo: { avg: +EO.avg.toFixed(4), neg: EO.neg, scarce: EO.scarce, short: EO.short, top: +EO.top.toFixed(2), consumer: +EO.consumer.toFixed(4) },
  cm: { avg: +CM.avg.toFixed(4), capPrice: +CM.capPrice.toFixed(4), consumer: +CM.consumer.toFixed(4), top: +CM.top.toFixed(2) },
  noon: { price: +NOON.price.toFixed(2), spare: +NOON.spare.toFixed(1) }, eve: { price: +EVE.price.toFixed(2), spare: +EVE.spare.toFixed(1), adder: +EVE.adder.toFixed(2) },
  resting: { pays: RP.below.ct, fails: RP.above.ct, shortAtPays: RP.below.r.short, stays: STAY }
};
const NAMES = { wind: "Wind farm", solar: "Solar farm", cc: "Gas combined cycle", ct: "Gas peaker" };
function staticTable() {
  const row = k => `<tr><td>${NAMES[k]}</td><td>${usd0(X.fixed[k])}</td><td>${usd0(EO.perKW[k])}</td><td>${usd0(CM.perKW[k] + CM.capPrice * D.designs.ratings[k])}</td></tr>`;
  return [`<table class="a3-static" aria-label="Each new plant's margin after running costs per kW a year against its fixed cost, with 1,200 MW of solar and 700 MW of peakers">`,
    `<thead><tr><th scope="col">New plant</th><th scope="col">Fixed cost ($/kW a year)</th><th scope="col">Margin after running costs, energy-only</th><th scope="col">Margin with the payment, simplified capacity market</th></tr></thead>`,
    `<tbody>`, ...["wind", "solar", "cc", "ct"].map(row), `<tr><td>Wholesale payments ($ per MWh demanded)</td><td>–</td><td>${usd(EO.consumer)}</td><td>${usd(CM.consumer)}</td></tr>`, `</tbody></table>`].join("\n");
}
// the five arrangements for readers without JavaScript: where, how capacity is paid for, the dated facts, the sources
const escH = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const richH = t => escH(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, '<span class="lx-term" data-term="$1">$2</span>');
function worldTable() {
  const src = x => x.url ? `<a href="${x.url}">${escH(x.label)}</a>` : escH(x.label);
  return [`<table class="a3-static a3-world" aria-label="Five arrangements around the world: how each pays for enough capacity, with dated sources">`,
    `<thead><tr><th scope="col">Where</th><th scope="col">How capacity is paid for</th><th scope="col">Dated facts</th><th scope="col">Sources</th></tr></thead>`, `<tbody>`,
    ...D.world.map(w => `<tr><td>${escH(w.label)}</td><td>${richH(w.how)}</td><td>${richH(w.facts)}</td><td>${w.sources.map(src).join("; ")}</td></tr>`), `</tbody></table>`].join("\n");
}
const BLOCK = /(<!-- a3-table:start[^>]*-->\n)([\s\S]*?)(<!-- a3-table:end -->)/, WBLOCK = /(<!-- a3-world:start[^>]*-->\n)([\s\S]*?)(<!-- a3-world:end -->)/;
if (process.argv.includes("--write")) {
  D.reference = reference; fs.writeFileSync(DPATH, JSON.stringify(D, null, 2) + "\n");
  let q = fs.readFileSync(QPATH, "utf8"); q = q.replace(BLOCK, (m, a, b, c) => a + staticTable() + "\n" + c).replace(WBLOCK, (m, a, b, c) => a + worldTable() + "\n" + c); fs.writeFileSync(QPATH, q);
  console.log("reference block and no-JS table written"); D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
}
const QMD = fs.readFileSync(QPATH, "utf8"), JS = fs.readFileSync(path.join(SITE, "assets/learn/a03-market-design.js"), "utf8");
const PATHY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/a03-market-design.yml"), "utf8");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || JSON.stringify(str)));

// ---------------- inputs: lesson 7's costs, the market
{
  ok(near(X.cost.cc, 6.226 * 3.85 + 3.57) && usd(X.cost.cc) === "$27.54" && usd(X.cost.ct) === "$39.37" && X.cost.coal === 24 && L7.fuel.gas === 3.85, "offers: gas CC $27.54 and peakers $39.37 from lesson 7 (heat rate × $3.85 + upkeep); coal $24 illustrative");
  const k = 0.04 / (1 - Math.pow(1.04, -30));
  ok(near(X.crf, k) && near(X.fixed.ct, 1158 * k + 7.18) && near(X.fixed.wind, 1712 * k + 34.57) && usd0(X.fixed.ct) === "$74", "fixed costs: building cost × CRF(4%, 30 years) + upkeep (lesson 7); a new peaker $74 per kW a year");
  ok(G.windMW === 3000 && G.peakMW === 4000 && G.credit === 25 && D.designs.eo.cap === 5000 && D.designs.cm.cap === 1000 && D.designs.reserve === 600, "market: 3,000 MW wind, 4,000 MW peak, $25 credit, caps $5,000 and $1,000, 600 MW threshold");
  ok(/data-src="\.\.\/assets\/learn\/data\/town_year\.json \.\.\/assets\/learn\/data\/cf_targets\.json \.\.\/assets\/learn\/data\/07-cost\.json \.\.\/assets\/learn\/data\/a03-market-design\.json"/.test(QMD) && /data\["07_cost"\]/.test(JS), "page: reads the four data files");
  const w = X.w.reduce((a, v) => a + v, 0) / 8760, s = X.s.reduce((a, v) => a + v, 0) / 8760;
  ok(near(w, CF.targets.wind.cf, 1e-6) && near(s, CF.targets.solar.cf, 1e-6), "wind and solar at EIA's 2025 capacity factors (33.8%, 24.0%)");
}

// ---------------- clearing: every hour of the default year
{
  let bad = 0, sum = 0;
  for (let t = 0; t < 8760; t++) {
    const h = M.hour(D, X, t, { solar: S0, ct: C0, design: "eo" }), run = h.run.ren + h.run.coal + h.run.cc + h.run.ct;
    if (h.short === 0 && !near(run, h.d, 1e-6)) bad++;
    if (h.spare >= 600 && !near(h.price, h.offer)) bad++;
    if (h.spare >= 0 && h.spare < 600 && !near(h.price, h.offer + (5000 - h.offer) * Math.pow(1 - h.spare / 600, 2), 1e-9)) bad++;
    if (h.spare < 0 && h.price !== 5000) bad++;
    if (!near(h.Wd + h.Sd, h.run.ren, 1e-6)) bad++;
    sum += h.price;
  }
  ok(bad === 0 && near(sum / 8760, EO.avg, 1e-9), "clearing: dispatch meets demand, the price is the last offer, plus the adder below 600 MW spare, the cap when short (" + bad + " bad)");
  // the page's equations (Go deeper · Modeler) give the model's price in every hour of every slider fleet, both designs,
  // including shortage hours (the cap, never above it)
  let eq = 0, over = 0, nShort = 0;
  for (let c = G.peakers.min; c <= G.peakers.max; c += G.peakers.step) ["eo", "cm"].forEach(dz => {
    const cap = D.designs[dz].cap;
    for (let t = 0; t < 8760; t++) {
      const h = M.hour(D, X, t, { solar: S0, ct: c, design: dz }), sp = h.spare;
      const pEq = sp < 0 ? cap : h.offer + (cap - h.offer) * Math.pow(Math.max(0, 1 - sp / 600), 2);
      if (!near(h.price, pEq, 1e-9)) eq++; if (h.price > cap + 1e-9) over++; if (sp < 0) nShort++;
    }
  });
  ok(eq === 0 && over === 0 && nShort > 0 && /With \$s_t < 0\$, demand exceeds supply: \$p_t = \\bar p\$/.test(QMD) && /\\max\(0, 1 - s_t\/600\)\^2/.test(QMD), "equations: the page's price formula, with its shortage branch, equals the model in every hour of every fleet (" + nShort + " shortage hours checked); no price above the cap");
  // margins: wind and solar earn the credit too, as the page's equation says
  const wm = (() => { let m = 0; for (let t = 0; t < 8760; t++) { const h = M.hour(D, X, t, { solar: S0, ct: C0, design: "eo" }); m += (h.price + G.credit) * h.Wd; } return m; })();
  ok(near(EO.perKW.wind, wm / (G.windMW * 1000), 1e-9) && /\\sum_t \(p_t \+ 25\)\\,q_t\$, the credit included/.test(QMD), "equations: wind's margin is the sum of (price + $25 credit) × output, as the page says");
  // the capacity price's floor: a peaker whose energy margin already covers its fixed cost gets no payment
  const Xlow = Object.assign({}, X, { fixed: Object.assign({}, X.fixed, { ct: 1 }) }), low = M.year(D, Xlow, { solar: S0, ct: C0, design: "cm" });
  ok(low.capPrice === 0 && low.perKW.ct > 1 && /\\max\(0, F - \\pi\)\/0\.93\$/.test(QMD), "equations: the capacity price never goes below zero (max(0, F − π)/0.93)");
  // scarcity hours include the hours short (a shortage hour is priced at the cap, with no adder)
  const y4 = M.year(D, X, { solar: S0, ct: 400, design: "eo" });
  let adderOnly = 0; for (let t = 0; t < 8760; t++) { const h = M.hour(D, X, t, { solar: S0, ct: 400, design: "eo" }); if (h.adder > 0) adderOnly++; }
  ok(y4.short === 20 && adderOnly === 409 && y4.scarce === 429, "scarcity hours at 400 MW of peakers: 409 with an adder + 20 short = 429");
  ok(near(NOON.price, -25) && NOON.W + NOON.S > NOON.d && NOON.marginal === "ren", "spring midday: wind and sun exceed demand; price −$25.00");
  ok(EVE.marginal === "ct" && int(EVE.spare) === "401" && usd(EVE.price) === "$586.76" && usd(EVE.adder) === "$547.40" && D.hours[1].date === read("town_days.json").days.summer_peak.date, "summer evening (SPP's 2025 peak day): 401 MW spare, $586.76, adder $547.40");
  const sq = 1 - 401 / 600, q = 39.37 + 4960.63 * Math.round(sq * sq * 1000) / 1000;
  ok(Math.round(q) === 585 && Math.round(sq * sq * 1000) / 1000 === 0.11 && near(EVE.spare, 400.7, 0.05), "quiz: 39.37 + 4,960.63 × 0.110 ≈ $585 from the rounded spare; the page's $586.76 uses 400.7 MW");
}

// ---------------- the year, solar, covers, the resting point, the capacity market
{
  ok(usd(EO.avg) === "$35.79" && EO.neg === 111 && EO.scarce === 155 && EO.short === 0 && usd0(EO.top) === "$4,665", "default year: average $35.79, 111 negative hours, 155 scarcity hours, none short, top $4,665");
  const s1200 = SOL[S0 / G.solar.step], s2800 = SOL[2800 / G.solar.step];
  ok(usd(s1200.solarCapture) === "$33.16" && usd(s2800.solarCapture) === "$7.38" && pct(s1200.solarRatio) === "93%" && pct(s2800.solarRatio) === "32%" && s2800.neg === 1350, "solar: capture $33.16 (93%) at 1,200 MW, $7.38 (32%) at 2,800 MW; 1,350 negative hours");
  let mono = true; for (let i = 2; i < SOL.length; i++) if (!(SOL[i].solarCapture < SOL[i - 1].solarCapture && SOL[i].neg >= SOL[i - 1].neg)) mono = false;
  ok(mono, "solar: over every slider step from 400 MW, the capture price falls and negative hours do not fall (step 3's message)");
  ok(SOL.filter(r => r.o.solar >= 2800).every(r => r.solarCapture < s1200.solarCapture && r.neg > s1200.neg), "step 3: its message is true for every value that opens Next (2,800 and 3,200 MW)");
  ok(EO.covers.ct < 0 && usd0(-EO.covers.ct) === "$25" && EO.covers.wind > 0 && EO.covers.solar > 0 && EO.covers.cc > 0, "energy-only at 700 MW: a new peaker falls $25 short; wind, solar and gas CC cover their costs");
  ok(RP.below.ct === 600 && RP.above.ct === 700 && RP.below.r.short === 2 && RP.below.r.covers.ct >= 0, "resting point: a new peaker pays at 600 MW, not at 700; 2 hours short at 600");
  ok(STAY === 900 && near(X.fom.ct, 7.18) && M.year(D, X, { solar: S0, ct: 900, design: "eo" }).perKW.ct >= 7.18 && M.year(D, X, { solar: S0, ct: 1000, design: "eo" }).perKW.ct < 7.18 && usd0(EO.perKW.ct - X.fom.ct) === "$41", "upkeep: an existing peaker covers its $7.18 upkeep up to 900 MW, not at 1,000; at 700 MW it has $41 per kW a year over upkeep");
  let ups = true; for (let c = G.peakers.min; c <= G.peakers.max; c += G.peakers.step) { const r = M.year(D, X, { solar: S0, ct: c, design: "eo" }); if ((c <= 900) !== (r.perKW.ct - X.fom.ct >= 0)) ups = false; }
  ok(ups, "upkeep: one crossing, between 900 and 1,000 MW");
  const tt = M.thresholdText(RP, STAY, G.peakers);
  ok(tt === "New peakers pay at 600 MW, not at 700; existing ones cover their upkeep up to 900 MW. **Between the two, none is built and none retires: simplified thresholds, not a forecast.**", "step 5's message: " + tt);
  ok(/never pay across 400 to 1,400 MW; existing ones cover their upkeep across the range\. \*\*Simplified/.test(M.thresholdText({ below: { ct: 1400 }, above: { ct: 0 } }.below ? { below: null, above: { ct: 400 } } : null, 1400, G.peakers)) && /always pay across/.test(M.thresholdText({ below: { ct: 1400 }, above: null }, null, G.peakers)) && /miss their upkeep at every fleet/.test(M.thresholdText({ below: { ct: 1400 }, above: null }, null, G.peakers)), "step 5's message: true when either threshold lies outside the slider's range");
  let steps = true; for (let c = G.peakers.min; c <= G.peakers.max; c += G.peakers.step) { const r = M.year(D, X, { solar: S0, ct: c, design: "eo" }); if ((c <= 600) !== (r.covers.ct >= 0)) steps = false; }
  ok(steps, "resting point: a new peaker pays at every fleet up to 600 MW and at none above (one crossing)");
  ok(near(CM.capPrice, (X.fixed.ct - CM.perKW.ct) / 0.93) && near(CM.covers.ct, 0, 1e-9) && mwday(CM.capPrice) === "$191" && usd(CM.capPrice) === "$69.59", "capacity market: the capacity price fills a new peaker's gap exactly: $69.59 per rated kW a year, $191/MW-day");
  let byCon = true; for (let c = G.peakers.min; c <= G.peakers.max; c += G.peakers.step) { const r = M.year(D, X, { solar: S0, ct: c, design: "cm" }); if (!near(r.covers.ct, 0, 1e-9)) byCon = false; }
  ok(byCon && /Capacity market \(simplified\)/.test(D.designs.cm.label) && /breaks even by construction/.test(D.designs.cmNotes.join(" ")) && /no auction buys against a requirement/.test(D.designs.cmNotes.join(" ")) && /separate illustrative assumption/.test(D.designs.cmNotes.join(" ")), "simplified capacity market: a new peaker breaks even at every fleet, by construction, and the page says so (no auction, the $1,000 cap a separate assumption)");
  ok(usd(EO.consumer) === "$39.89" && usd(CM.consumer) === "$40.79" && usd0(CM.top) === "$935", "consumers: $39.89/MWh energy-only, $40.79 with a capacity market; top price $935 under the $1,000 cap");
  ok(near(CM.consumer * CM.demand, CM.energyPay + CM.capPay, 1e-3) && near(CM.rated, 0.92 * 1000 + 0.95 * 1600 + 0.93 * 700 + 0.16 * 3000 + 0.15 * 1200, 1e-9), "capacity market: consumers pay energy plus capacity on rated MW");
  ok(JSON.stringify(D.reference) === JSON.stringify(reference), "reference block: equals the model (run --write after a change)");
  const m = QMD.match(BLOCK); ok(m && m[2].trim() === staticTable().trim(), "page: the no-JS table equals the model (run --write)");
}

// ---------------- the page's statements
{
  has("On a spring midday wind and sun exceed demand and the price is −$25.00/MWh; on a summer evening only 401 MW are spare and scarcity pricing lifts it to $586.76.");
  has("Over the year the price averages $35.79/MWh, with 111 negative-price hours and 155 scarcity hours.");
  has("From 1,200 to 2,800 MW of solar, solar's capture price falls from $33.16 to $7.38 per MWh.");
  has("Energy-only, a new peaker falls $25 per kW a year short of its fixed cost; at 600 MW of peakers a new one pays, and the year has 2 hours short.");
  has("Existing peakers cover their upkeep up to 900 MW, so from 700 to 900 MW none is built and none retires: simplified thresholds.");
  has("With the simplified capacity market, its price set to fill a new peaker's gap, the capacity price is $191/MW-day; wholesale payments are $40.79 per MWh demanded against $39.89 energy-only (table below).");
  // what the wholesale payments count: energy and capacity over all demand; the credit and network charges outside
  ok(near(EO.creditPerMWh, 25 * (() => { let q = 0; for (let t = 0; t < 8760; t++) { const h = M.hour(D, X, t, { solar: S0, ct: C0, design: "eo" }); q += h.Wd + h.Sd; } return q; })() / EO.demand, 1e-9) && usd(EO.creditPerMWh) === "$12.97", "wholesale payments: the $25 credit adds $12.97 per MWh demanded, outside them");
  has(M.payNote(EO)); ok(M.payNote(EO) === "Wholesale payments: energy and capacity payments over all demand, served or not. Left out: the $25 production credit, $12.97 per MWh demanded here, paid by taxpayers, and network charges." && /H\("p", \{ class: "a3-note", text: payNote\(base\("eo"\)\) \}, act\)/.test(JS) && /kpi\(k, "Wholesale payments per MWh demanded", usd\(r\.consumer\)\)/.test(JS) && !/Consumers pay/.test(JS + QMD), "wholesale payments: labelled per MWh demanded, with what they leave out, on the page and in step 6");
  has("in 111 hours of the year"); has("<p>Myth, once solar is common: here its capture price is 93% of the average at 1,200 MW and 32% at 2,800 MW.</p><p class=\"lx-hint\">A real measure: in CAISO in 2023, solar's value factor, a broader measure with capacity value, was 38% (LBNL; Numbers to remember).</p>");
  has("with 700 MW of peakers here, wholesale payments are $39.89 per MWh demanded energy-only and $40.79 with the simplified capacity market.");
  ok(/value factor was 38%/.test(D.solarValue.what) && /compares solar's energy and capacity value with a flat block's, the same power in every hour; this lesson's capture ratio counts energy only/.test(D.solarValue.measure) && /energy plus capacity value, over a flat block's/.test(QMD) && !/its output-weighted price over the average price/.test(JSON.stringify(D)), "solar value: LBNL's 38% is a value factor with capacity value (slide 50), kept apart from the energy-only capture ratio");
  has("39.37 + (5,000 − 39.37) × (1 − 401 ÷ 600)² = 39.37 + 4,960.63 × 0.110 ≈ $585 per MWh. Step 1 shows $586.76: its spare is 400.7 MW before rounding.");
  has("69.59 × 1,000 ÷ 365 = 190.66, about $191 per MW-day");
  ok(/data-id="adder" data-answer="c"[\s\S]{0,500}<li data-value="c">About \$585<\/li>/.test(QMD) && /data-id="mwday" data-answer="b"[\s\S]{0,400}<li data-value="b">About \$191<\/li>/.test(QMD), "quiz: answers point at the right options");
  ok(/data-id="negative" data-answer="myth"/.test(QMD) && /data-id="average" data-answer="myth"/.test(QMD) && /data-id="free" data-answer="myth"/.test(QMD) && /data-id="cap" data-answer="fact"/.test(QMD), "myths: three myths, one fact");
}

const WJ0 = () => JSON.stringify(D.world);
// ---------------- the world: sources on the allow-list, neutral wording, a sort with one answer each
{
  const hosts = ["ferc.gov", "pjm.com", "misoenergy.org", "ercot.com", "ec.europa.eu", "ember-energy.org", "lbl.gov", "eia.gov"];
  const all = D.world.reduce((a, w) => a.concat(w.sources), []).concat([D.solarValue.source]), linked = all.filter(s => s.url), unlinked = all.filter(s => !s.url);
  ok(D.world.length === 5 && linked.every(s => hosts.some(h => new URL(s.url).hostname === h || new URL(s.url).hostname.endsWith("." + h))), "world: five arrangements, every linked source on the allow-list (" + linked.length + ")");
  ok(unlinked.length === 2 && unlinked.every(s => /\b(19|20)\d\d\)?/.test(s.label)) && /^NDRC, /.test(unlinked[0].label + "") === false ? true : unlinked.some(s => /^NDRC, .*30 January 2026/.test(s.label)) && unlinked.some(s => /^Regulation \(EU\) 2024\/1747, Article 19d/.test(s.label)), "world: two primary sources named without a link (NDRC, 30 January 2026; Regulation (EU) 2024/1747), until their domains are allow-listed");
  ok(new Set(D.world.map(w => w.how)).size === 5 && D.world.every(w => w.how.split(/\s+/).length <= 36 && w.facts.split(/\s+/).length <= 36), "world: five distinct sorting cards of 36 words or fewer; facts of 36 or fewer, in their own column");
  // ERCOT's caps as of January 2026: $5,000 day-ahead (also its value of lost load), $2,000 real-time; the lesson's
  // $5,000 cap on the clearing price is labelled a teaching assumption
  const ER = D.world.filter(w => w.id === "ercot")[0];
  ok(/Offer caps \(January 2026\): \$5,000\/MWh day-ahead, \$2,000 in real time; once peakers' yearly net margin passes a threshold, the day-ahead cap also drops to \$2,000\./.test(ER.facts) && !/offers are capped at \$5,000\/MWh\./.test(ER.how) && /high day-ahead offer cap/.test(D.designs.eo.capNote) && ER.sources.some(x => /2026_01-Day-Ahead-Market-Operations\.pdf$/.test(x.url) && /slide 8/.test(x.label)) && /teaching assumption/.test(D.designs.eo.capNote) && /real-time offer cap is \$2,000/.test(D.designs.eo.capNote), "world: ERCOT's day-ahead and real-time offer caps, dated and sourced; the lesson's cap a teaching assumption");
  has("The $5,000/MWh cap is ERCOT's high day-ahead offer cap and value of lost load; real-time offers are capped at $2,000 (January 2026). Here $5,000 caps the clearing price, a teaching simplification.");
  has("ERCOT's high day-ahead and its real-time offer caps; $5,000 is also its value of lost load. The cap was $9,000 until 1 January 2022.");
  ok(/qualifying reliable capacity is gradually to be paid under one rule/.test(D.world.filter(w => w.id === "china")[0].facts) && !/all reliable capacity/.test(JSON.stringify(D.world)), "world: China's single payment is for qualifying capacity, introduced gradually");
  ok(!/system-wide offer cap since 1 January 2022/.test(QMD + JSON.stringify(D)), "world: no page text calls $5,000 ERCOT's one offer cap");
  // the EU rule: generally two-way contracts for difference or equivalent schemes, with exceptions
  ok(/is generally a two-way contract for difference \(top-ups below an agreed price, paybacks above\) or an equivalent scheme, with stated exceptions/.test(WJ0()) && !/must be two-way contracts/.test(WJ0()), "world: the EU rule says 'generally', names equivalent schemes and the exceptions");
  ok(D.world.filter(w => w.id === "vertical")[0].label === "U.S. regions without a regional transmission organization (RTO)", "world: RTO spelled out in its sorting bin");
  const WJ = JSON.stringify(D.world);
  ok(/16 July 2024/.test(WJ) && /From 17 July 2027, new direct price support/.test(WJ) && /5 December 2025/.test(WJ) && /coal's since 2024; a January 2026 notice revised them/.test(WJ) && /\$269\.92\/MW-day for most of its region in 2025\/26 \(two zones cleared higher, at their caps\) and \$325, at the cap, for its entire region in 2028\/29/.test(WJ) && /The NDRC/.test(WJ) && !/widened to gas/.test(WJ), "world: dated facts (EU in force 16 July 2024, CfDs from 17 July 2027; ERCOT 5 December 2025; China's 2026 notice revised its mechanisms, the NDRC named; PJM $269.92 for most of its region, $325 for all of it)");
  const wm2 = QMD.match(WBLOCK); ok(wm2 && wm2[2].trim() === worldTable().trim() && /<td>The European Union<\/td>/.test(worldTable()), "page: the no-JS page lists the five arrangements with their sources (run --write)");
  const vis = QMD.replace(/<!--[\s\S]*?-->/g, "") + JS.replace(/\/\/.*$/gm, "") + JSON.stringify(D);
  ok(!/\b(best|better|superior|worse|should adopt|the right design)\b/i.test(vis), "neutral: no design is called best or better");
  ok(/takes no side/.test(JS) && /For energy-only/.test(JS) && /For a capacity market/.test(JS), "neutral: the Steelman card gives each design its strongest case");
  ok(/Investors choose what to build from expected revenues; no central auction buys a capacity requirement years ahead\./.test(JS) && !/No planner has to forecast demand/.test(JS), "steelman: energy-only still forecasts demand; it has no central capacity auction");
}

// ---------------- texts and budgets
{
  const plain = t => t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "");
  const words = t => plain(t).split(/\s+/).filter(Boolean).length;
  const prompts = [...JS.matchAll(/\{ text: ("(?:[^\n])*?"),\n\s*build/g)].map(m => m[1].replace(/^"|"$/g, ""));
  ok(/Slide to 2,800 MW or more/.test(prompts[2]) && /no capacity payment: energy and reserve sales must pay for plants/.test(prompts[3]) && /an existing one stays while it covers its upkeep/.test(prompts[4]) && /This toy is simplified: no auction against a requirement/.test(prompts[5]), "prompts: step 3 names the target; energy-only includes reserves; entry and upkeep thresholds; the simplified capacity market");
  ok(prompts.length === 8, "steps: eight cards (" + prompts.length + ")");
  prompts.forEach((p, i) => { const s = (plain(p).match(/[.?!](?=\s+[A-Z(]|$)/g) || []).length; ok(words(p) <= 35 && s <= 2, `prompt ${i + 1}: ${words(p)} words, ${s} sentences (≤ 35, ≤ 2)`); });
  const msgs = [M.solarText(SOL[3], SOL[7]), "Midday: wind and sun exceed demand, so a credit-backed offer sets −$25.00. Evening: only 401 MW spare, so [[scarcity-price|scarcity pricing]] lifts the price to $586.76.",
    "155 scarcity hours reach up to $4,665/MWh, while 111 hours go [[negative-price|negative]]. The average, $35.79, hides both ends.",
    "A peaker lives on a few scarcity hours; wind and solar on many ordinary ones, plus the credit. **A new plant's shortfall is [[missing-money|missing money]] only if the grid needs that plant to stay reliable.**",
    M.thresholdText(RP, STAY, G.peakers),
    "With 700 MW of peakers, wholesale payments are $39.89 per MWh demanded energy-only and $40.79 with the simplified capacity market at $191/MW-day. **The same fleet, paid by different rules.**",
    M.payNote(EO), M.solarAtText(SOL[0]), M.solarAtText(SOL[1]), D.world.map(w => w.facts).join(" ").split(/(?<=\.) (?=[A-Z])/)[0],
    ...D.designs.curveNotes, ...D.designs.cmNotes, G.creditNote, D.solarValue.what, D.solarValue.measure, ...D.world.map(w => w.how), "Market here: 1,200 MW of solar (the default; step 3's slider stays in step 3) and 700 MW of peakers."];
  msgs.forEach((t, i) => ok(words(t) <= 36, `message or displayed note ${i + 1}: ${words(t)} words (≤ 36)`));
  ok(!/D\.designs\.curve\b|ratingsNote/.test(JS) && D.designs.curveNotes.length === 3 && D.designs.cmNotes.length === 3, "notes: one idea per displayed note (the scarcity curve and the capacity market each in three)");
  ok(/scarcity hours" \+ \(r\.short \? " \(" \+ int\(r\.short\) \+ " of them short\)"/.test(JS) && /Scarcity hours \(short ones included\)/.test(JS), "step 2: scarcity hours counted with the hours short, and labelled so");
  ok(/per kW-yr/.test(JS) && /Margin after running costs/.test(JS) && !/"Earns \(\$\/kW a year\)"/.test(JS), "units: the peaker KPIs say per kW a year; tables say margin after running costs, not earnings");
  ok(/one shortfall event in ten years/.test(JS) && /one shortfall event in ten years/.test(QMD) && !/1-in-10/.test(JS + QMD), "terms: PJM's reliability standard in words");
  ["capture-price", "energy-only-market", "capacity-market", "missing-money", "offer-cap", "rto"].forEach(id => ok(new RegExp("id: " + id + "\\n").test(SIDE) && (JS + JSON.stringify(D)).indexOf("[[" + id + "|") >= 0, "glossary: " + id + " defined in the sidecar and marked"));
  ["capacity-accreditation", "reserve-margin", "scarcity-price"].forEach(id => ok((JS + JSON.stringify(D)).indexOf("[[" + id + "|") >= 0, "glossary: " + id + " marked"));
  ok(/no separate capacity market, in which energy and reserve prices/.test(SIDE) && /clearing prices can still rise above it/.test(SIDE) && !/ceiling on scarcity prices/.test(SIDE), "glossary: energy-only includes reserve revenue; an offer cap limits offers, not clearing prices");
  const elems = [].concat((QMD.match(/<li>[\s\S]*?<\/li>/g) || []).filter(t => !/data-value=/.test(t) && !/<li>(FERC|ERCOT \(|PJM\.|MISO|European|Ember|LBNL)/.test(t)), QMD.match(/^- \*\*[\s\S]*?$/gm) || []);
  const w2 = t => t.replace(/<[^>]+>/g, " ").replace(/\$[^$]*\$/g, "x").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
  const long = elems.filter(t => w2(t) > 36).map(t => w2(t) + ": " + t.replace(/<[^>]+>/g, "").slice(0, 60));
  ok(elems.length >= 13 && long.length === 0, "budget: " + elems.length + " fallback, data-note and Go deeper elements are 36 words or fewer: " + JSON.stringify(long));
}

// ---------------- every number in the visible text is accounted for
{
  let body = QMD.replace(BLOCK, " ").replace(WBLOCK, " ").replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ")
    .replace(/^(- \*\*|\|).*$/gm, l => l.replace(/\$[^$\n]*\$/g, " "));   // math only in Go deeper bullets and tables, so a dollar amount never pairs with another
  const allowed = new Set(), add = v => allowed.add(String(v));
  staticTable().replace(/<[^>]+>/g, " ").match(/\d[\d,]*(?:\.\d+)?/g).forEach(add);
  worldTable().replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+/g, " ").match(/\d[\d,]*(?:\.\d+)?/g).forEach(add);
  ["3,000", "1,200", "700", "25.00", "401", "586.76", "35.79", "111", "155", "2,800", "33.16", "7.38", "26", "600", "2", "191", "40.79", "39.89", "25", "1,000", "930", "2025", "7", "4", "30", "5,000", "1", "2022", "2014", "5", "2023", "93", "32", "38", "325", "2028", "29", "6,831", "10", "39.37", "585", "0.110", "4,960.63", "400.7", "69.59", "190.66", "365", "1,000", "9,000", "2021", "2026", "269.92", "2025", "26", "27", "47", "50", "16", "2024", "0.93", "60", "66", "72", "63", "18", "17", "14", "12", "3", "1.3", "15", "8", "0.19", "25,400", "190.66", "110525", "04", "24", "5.1", "2029", "21", "900", "1747", "19", "2027", "1,690", "2,000", "12.97"].forEach(add);
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "unexpected-number check: no number on the page is outside the model's, the sources' and the structural counts; unknown: " + unknown.join(" "));
}

// ---------------- path.yml, scope
{
  ok(/id: a03-market-design\n  code: A3\n  tier: analyst\n  form: cards\n  icon: chart\n  status: active\n  minutes: 30\n  practice_minutes: 30/.test(PATHY) && /after: \[8\]\n/.test(PATHY), "path.yml: A3 active, 30 + 30 minutes, after lesson 8");
  const sub = (QMD.match(/^subtitle: "([^"]+)"/m) || [])[1], desc = (QMD.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(PATHY.indexOf('subtitle: "' + sub + '"') >= 0, "path.yml: subtitle equals the page's");
  ok(desc.split(/\s+/).length <= 35, `budget: the description is ${desc.split(/\s+/).length} words (≤ 35)`);
  const body = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "");
  ok(!/nuclear|reactor|\bSMR\b|data cent|learning/i.test(body + JS.replace(/\/\/.*$/gm, "") + JSON.stringify(D)), "scope: no nuclear, data-center or learning wording");
  ok(!/href="[^"]*(projects\/|research\.)/i.test(QMD) && /href="08-merit-order\.html"/.test(QMD) && /href="07-cost\.html"/.test(QMD) && /href="a05-adequacy\.html"/.test(QMD), "links: lessons 7, 8 and A5; no project or Research links");
}

// ---------------- the page on a stub document
{
  const vm = require("vm");
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.visible = () => false; E.LX.progress.guess = () => null; E.LX.progress.done = () => {};
  ["numanswer", "drill", "cards", "controls", "plot", "predict", "profiles", "cardsort"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "a03-market-design") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const ctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: undefined, require: undefined, performance: E.window.performance, setTimeout: f => { f(); return 0; }, clearTimeout: () => {} };
  let threw = null;
  try {
    vm.runInNewContext(JS, ctx);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "a03-market-design" }, E.body), live = E.LX.H("div", null, root);
    init(live, { town_year: Y, cf_targets: CF, "07_cost": L7, a03_market_design: D }, root);
  } catch (e) { threw = e.stack || e.message; }
  ok(!threw && demo && demo.cards, "stub: the page mounts" + (threw ? ": " + threw : ""));
  if (!threw && demo) try {
    const card = () => demo.cards.el, saw = () => { const a = card().querySelectorAll(".lx-saw"); return a.length ? a[a.length - 1].textContent : ""; };
    const btns = re => card().querySelectorAll("button").filter(b => re.test(b.getAttribute("aria-label") || b.textContent));
    demo.cards.go(0); btns(/^A spring midday$/)[0].click(); btns(/^A summer evening$/)[0].click();
    ok(/^Midday: wind and sun exceed demand, so a credit-backed offer sets −\$25\.00\. Evening: only 401 MW spare/.test(saw()), "stub: step 1: " + saw().slice(0, 80));
    demo.cards.go(1); btns(/Clear the year/)[0].click();
    ok(/^155 scarcity hours reach up to \$4,665\/MWh, while 111 hours go negative/.test(saw()) && /Here the offer cap also caps the clearing price, a simplification/.test(card().textContent), "stub: step 2: " + saw().slice(0, 80));
    demo.cards.go(2); const raise = () => card().querySelectorAll("button").filter(b => /^Raise Solar on the Plains market/.test(b.getAttribute("aria-label") || ""))[0];
    for (let i = 0; i < 4; i++) raise().click();
    ok(/^From 1,200 to 2,800 MW of solar/.test(saw()) && /The next steps go back to the default 1,200 MW of solar/.test(card().textContent), "stub: step 3 at 2,800 MW, and it says the next steps use the default: " + saw().slice(0, 50));
    // lowered again after the target, the message describes what the slider now shows
    const lower = () => card().querySelectorAll("button").filter(b => /^Lower Solar on the Plains market/.test(b.getAttribute("aria-label") || ""))[0];
    for (let i = 0; i < 7; i++) lower().click();
    ok(/^With no solar there is no capture price/.test(saw()) && !/\$7\.38/.test(saw()) && /Capture ratio \(capture price ÷ average\)/.test(card().textContent), "stub: step 3 lowered to 0 MW no longer reports 2,800 MW's numbers: " + saw().slice(0, 60));
    for (let i = 0; i < 7; i++) raise().click();
    ok(/^From 1,200 to 2,800 MW of solar/.test(saw()), "stub: step 3 back at 2,800 MW");
    demo.cards.go(3);
    ok(/Market here: 1,200 MW of solar \(the default; step 3's slider stays in step 3\) and 700 MW of peakers/.test(card().textContent), "stub: step 4 says which market it shows");
    demo.cards.go(2);
    ok(/2,800 MW/.test(card().querySelector("output").textContent), "stub: back in step 3, its slider keeps 2,800 MW");
    demo.cards.go(3); btns(/^No$/)[0].click();
    ok(/missing money only if the grid needs that plant/.test(saw()) && /falls \$25 short per kW a year/.test(card().textContent) && /Margin after running costs/.test(card().textContent), "stub: step 4 shows each new plant's margin after running costs");
    demo.cards.go(4); const up = btns(/^(Lower|Decrease|−|-)|Lower Gas peakers/)[0] || card().querySelectorAll("button").filter(b => /Gas peakers/.test(b.getAttribute("aria-label") || ""))[0];
    if (up) up.click();
    ok(/^New peakers pay at 600 MW, not at 700; existing ones cover their upkeep up to 900 MW/.test(saw()) && /per kW-yr/.test(card().textContent) && /An existing peaker \(upkeep only\)/.test(card().textContent), "stub: step 5: " + saw().slice(0, 80));
    demo.cards.go(5); btns(/^Energy-only with scarcity pricing$/)[0].click(); btns(/^Capacity market \(simplified\)$/)[0].click();
    ok(/wholesale payments are \$\d+\.\d\d per MWh demanded energy-only and \$\d+\.\d\d with the simplified capacity market at \$\d+\/MW-day/.test(saw()) && /breaks even by construction/.test(card().textContent) && /Left out: the \$25 production credit/.test(card().textContent), "stub: step 6: " + saw().slice(0, 100));
    demo.cards.go(6); btns(/reserves are thinner/)[0].click();
    ok(/A capacity price is set by a demand curve/.test(saw()) && /6,831 MW/.test(card().textContent), "stub: step 7");
  } catch (e) { ok(false, "stub: the page test threw: " + (e && e.stack || e)); }
}

console.log(`a03-market-design: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
