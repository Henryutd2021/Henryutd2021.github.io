// test_a10-emissions-questions.js — Node tests for A10 (assets/learn/a10-emissions-questions.js, its data file and page).
//   - the fleet from first principles: CO2 per MWh = EIA heat rate x 52.91 kg per MMBtu; running cost = heat rate x $3.85
//     + variable O&M; the merit order (combined cycle before peakers; the new plant before both)
//   - the day: 7 November 2025 (Central standard time), 24 hours, wind and solar at EIA's 2025 capacity factors over the
//     year; every hour balances (gas + wind and sun used = use), spill never exceeds wind and sun, nothing is unserved,
//     with and without each load, the new plant, the new wind and the must-run rule
//   - the electrolyzer's hours: the 12 lowest average factors of the grid without it, ties to the earlier hour
//   - question 1: inventory shares of the load and everyone else add to the grid's total (identity); question 2: the
//     short-run change equals the CO2 rate of each plant times its change in MWh, and the plants' changes add up to the
//     load's MWh (energy balance); must-run: spill appears only below 800 MW of gas need; question 3 and 4 as the header
//   - every number on the page (fallback, explain, myths, quiz) against the model; ties: the dispatch is cheapest first
//     with distinct costs, so every number is unique (no LP)
//   - wording and model checks: the 300 MW step's overflow onto the peakers (hourly changes add to the short-run change;
//     next-MWh marginal factors miss it in 4 hours); the chart draws each step's scenario; claims under illustrative
//     rules after the Scope 2 Guidance (2015), additionality and deliverability as assumptions, the grid-average proxy
//     named; the heat-to-CO2 bridge; every line the page assembles, for every input, is 40 words and two sentences at most
//   - research wording (the course's sourcing rule): every excerpt sentence is approved wording (E6, E10), word for word;
//     no number from the txh2 paper; citation titles as in the author's publication list
//   - scope: no nuclear term in the lesson's own files; data centers only as a load; links only to allowed domains;
//     text budget; glossary terms; the page on a stub document
// Usage (from the site folder):  node _tests/learn/test_a10-emissions-questions.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PRIV = require("./private_sources.js");
const ID = "a10-emissions-questions";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const PR = pctx.module.exports;
const M = require(L(ID + ".js"));
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const A = J(ID + ".json"), P = A.plains, JS = fs.readFileSync(L(ID + ".js"), "utf8");
const PAGE = fs.readFileSync(path.join(SITE, "learn", ID + ".qmd"), "utf8"), SIDE = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const PAGE0 = PAGE.replace(/ data-label="[^"]*"/g, "");
const onPage = (s, what) => ok(PAGE0.includes(s), `page states ${what}: "${s}"`);
const fm = M.fm, year = J("town_year.json"), T = J("cf_targets.json");
const W = M.prepare(P, A, year, T, PR.townProfile), F = W.F;

// ---------------- the fleet, from first principles
ok(near(F.cc.rate, 7.535 * 52.91 / 1000) && near(F.ct.rate, 10.975 * 52.91 / 1000) && near(F.ccn.rate, 6.226 * 52.91 / 1000), "CO2 rates = heat rate x 52.91 kg/MMBtu");
ok(F.cc.rate.toFixed(2) === "0.40" && F.ct.rate.toFixed(2) === "0.58", "rates on the page: 0.40 and 0.58 t per MWh");
ok(near(F.cc.cost, 7.535 * 3.85 + 3.49) && near(F.ct.cost, 10.975 * 3.85 + 4.17) && near(F.ccn.cost, 6.226 * 3.85 + 3.49), "running costs = heat rate x $3.85 + variable O&M");
ok(F.ccn.cost < F.cc.cost && F.cc.cost < F.ct.cost, "merit order: new combined cycle, combined cycle, peakers (distinct costs: no ties)");
ok(P.gas.price === 3.85 && P.gas.co2PerMMBtu === 52.91 && P.plants.cc.heatRate === 7.535 && P.plants.ct.heatRate === 10.975, "EIA values in the data file");
["heat", "fuel", "co2", "vom", "shapes", "cf"].forEach(k => ok(/^https:\/\/www\.eia\.gov\//.test(P.sources[k].url) && P.sources[k].asOf, "source " + k + ": EIA, with a date"));

// ---------------- the day and the dispatch
ok(W.date === "2025-11-07" && A.day.utcOffsetHours === -6 && W.demand.length === 24, "the day: 7 November 2025, Central standard time, 24 hours");
ok(W.i0 === Math.round((Date.parse("2025-11-07T00:00:00Z") - Date.parse(year.start_utc + "Z")) / 3600000) + 7, "the day's first hour ends at 01:00 local (index rule of town_year.json)");
{ const po = { year, targets: T, method: "scale", monthlyCF: true }, pw = PR.townProfile("wind", P.windMW, po), ps = PR.townProfile("solar", P.solarMW, po);
  ok(near(pw.cf, 0.338, 1e-9) && near(ps.cf, 0.24, 1e-9), "wind and solar profiles at EIA's 2025 capacity factors (33.8%, 24.0%)"); }
const loads = { dc: M.loadShape(W, "dc"), ez: M.loadShape(W, "ez") };
function balanced(D, o) {
  return D.h.every((x, t) => { const use = W.demand[t] + (o.load ? o.load[t] : 0), vre = W.wind[t] + W.solar[t] + (o.extraWind ? o.extraWind[t] : 0);
    return near(x.ccn + x.cc + x.ct + vre - x.sp, use, 1e-6) && x.sp >= -1e-9 && x.sp <= vre + 1e-9 && x.un === 0 && x.cc <= F.cc.mw + 1e-9 && x.ct <= F.ct.mw + 1e-9 && (!o.mustRun || x.cc >= o.mustRun - 1e-9); });
}
const nwDC = W.windShape.map(s => s * M.newWindMW(W, loads.dc)), nwEZ = W.windShape.map(s => s * M.newWindMW(W, loads.ez));
[{}, { mustRun: 800 }, { newCC: true }].forEach(o => [null, loads.dc, loads.ez].forEach(ld => [null, nwDC].forEach(ex => {
  const oo = Object.assign({}, o, ld ? { load: ld } : {}, ex ? { extraWind: ex } : {});
  ok(balanced(M.day(W, oo), oo), "every hour balances, no spill beyond wind and sun, nothing unserved: " + JSON.stringify(Object.keys(oo)));
})));
const b0 = M.day(W);
ok(b0.co2.toFixed(0) === "10627" && Math.min(...b0.avg).toFixed(2) === "0.10" && Math.max(...b0.avg).toFixed(2) === "0.34", "the day without a load: 10,627 t, average factors 0.10 to 0.34");
// the electrolyzer's hours
{ const idx = [...Array(24).keys()].sort((a, b) => b0.avg[a] - b0.avg[b] || a - b).slice(0, 12), on = loads.ez.map((v, t) => v > 0 ? t : -1).filter(t => t >= 0);
  ok(JSON.stringify(idx.sort((a, b) => a - b)) === JSON.stringify(on) && on.join() === "0,1,2,3,4,5,6,7,8,9,10,11", "electrolyzer: the 12 lowest average factors are 00:00-12:00");
  const lo = Math.min(...on.map(t => b0.avg[t])), hi = Math.max(...on.map(t => b0.avg[t])), out = Math.min(...[...Array(24).keys()].filter(t => on.indexOf(t) < 0).map(t => b0.avg[t]));
  ok(out > hi, "no tie at the edge of the 12 hours: the 13th lowest average is above the 12th, so the tie rule never decides");
  onPage(`(${lo.toFixed(2)} to ${hi.toFixed(2)} t CO₂ per MWh)`, "the electrolyzer's averages in the fallback");
  ok(on.every(t => b0.key[t] === "cc"), "in every electrolyzer hour the combined-cycle plants are on the margin (default model)"); }

// ---------------- the four questions
const Q = { dc: M.questions(W, "dc", false), ez: M.questions(W, "ez", false), dcM: M.questions(W, "dc", true), ezM: M.questions(W, "ez", true) };
Object.keys(Q).forEach(k => {
  const q = Q[k], mr = /M$/.test(k);
  ok(near(q.inv.share + q.inv.others, q.inv.total, 1e-6), k + ": inventory shares add to the grid's total");
  let s = 0; q.inv.g.avg.forEach((a, t) => { s += q.load[t] * a; }); ok(near(s, q.inv.share, 1e-6), k + ": inventory = sum of load x average factor");
  const c = q.ch, co2 = c.ccn * F.ccn.rate + c.cc * F.cc.rate + c.ct * F.ct.rate;
  ok(near(co2, q.short, 1e-6) && near(c.ccn + c.cc + c.ct + c.spill, q.mwh, 1e-6), k + ": short-run change = plants' rates x their extra MWh, and the extra MWh plus spilled wind used = the load");
  ok(!mr || q.withLoad.h.every((x, t) => x.sp === 0 || W.demand[t] + q.load[t] - W.wind[t] - W.solar[t] < 800), k + ": with the must-run rule, spill only where gas need is below 800 MW");
  ok(near(q.long.none, q.shortDefault, 1e-9), k + ": long run with nothing built = the short run (default model)");
  ok(q.plants.old === q.shortDefault && q.plants.far === q.shortDefault && q.plants.new === q.long.wind && q.plants.hourly === q.long.wind && q.claims.old === 0 && q.claims.new === 0 && q.claims.location === q.inv.share, k + ": the purchase table follows its rule");
});
ok(near(Q.dc.newWindMW, 300 * 8760 / (0.338 * 8760), 1e-9) && near(Q.ez.newWindMW, 150 * 8760 / (0.338 * 8760), 1e-9), "new wind = the load's yearly energy / (33.8% x 8,760 h)");
ok(Q.ez.short > 2 * Q.ez.inv.share && Q.dc.short > Q.dc.inv.share, "the short-run change is larger than the inventory share for both loads");
ok(Q.ezM.short < Q.ez.short / 2 && near(Q.ezM.inv.share, Q.ez.inv.share, 1e-9), "the must-run rule more than halves the electrolyzer's short-run change; its inventory share does not move");
ok(near(Q.ez.short, 3600 * F.cc.rate, 1e-6), "the electrolyzer's short run: every MWh from the combined-cycle plants, 3,600 x 0.399 t");
// the fallback table, the explain fallback, myths and quiz
const row = (lab, a, b) => onPage(`<tr><td>${lab}</td><td>${a}</td><td>${b}</td></tr>`, "fallback row " + lab);
onPage(`<th scope="col">Data center (${fm.mwh(Q.dc.mwh)})</th><th scope="col">Electrolyzer (${fm.mwh(Q.ez.mwh)})</th>`, "fallback head");
row("1 · Inventory share, at average factors", fm.t(Q.dc.inv.share), fm.t(Q.ez.inv.share));
row("2 · Short-run change at the plants", fm.dt(Q.dc.short), fm.dt(Q.ez.short));
row("2 · The same, with a must-run rule", fm.dt(Q.dcM.short), fm.dt(Q.ezM.short));
row("3 · Long run, a new 300 MW gas plant", fm.dt(Q.dc.long.cc), fm.dt(Q.ez.long.cc));
row("3 · Long run, new wind for its yearly energy", fm.dt(Q.dc.long.wind), fm.dt(Q.ez.long.wind));
row("4 · Claim, certificates matched over the year", fm.t(Q.dc.claims.old), fm.t(Q.ez.claims.old));
row("4 · Claim, new wind matched hour by hour (short hours at the grid average, a proxy)", fm.t(Q.dc.claims.hourly), fm.t(Q.ez.claims.hourly));
onPage(`Each of its extra MWh is still served by the combined-cycle plants, at ${F.cc.rate.toFixed(2)} t.`, "fallback: the electrolyzer's margin");
onPage(`the data center's ${fm.t(Q.dc.inv.share)} and everyone else's ${fm.t(Q.dc.inv.others)} add up to the grid's ${fm.t(Q.dc.inv.total)}`, "explain: inventory");
onPage(`the data center adds ${fm.t(Q.dc.short)}, mostly at the combined-cycle plants`, "explain: short run"); ok(Q.dc.ch.cc > Q.dc.ch.ct && Q.dc.ch.spill === 0, "the data center's short-run MWh are mostly combined cycle");
onPage(`the electrolyzer's change falls from ${fm.t(Q.ez.short)} to ${fm.t(Q.ezM.short)}`, "explain: the model matters");
onPage(`${fm.dt(Q.dc.long.cc)} with a new gas plant, ${fm.dt(Q.dc.long.wind)} with new wind, for the data center that day`, "explain: long run");
onPage(`From 00:00 to 12:00 the average is ${Math.min(...loads.ez.map((v, t) => v ? b0.avg[t] : 9)).toFixed(2)} to ${Math.max(...loads.ez.map((v, t) => v ? b0.avg[t] : 0)).toFixed(2)} t per MWh, yet each extra MWh comes from the combined-cycle plants at ${F.cc.rate.toFixed(2)} t.`, "myth 1");
onPage(`the data center may claim 0 t, while the plants emit ${fm.t(Q.dc.plants.old)} more that day`, "myth 2");
ok(2000 / 8000 * 100 === 25, "quiz: 2,000 / 8,000 x 100 = 25"); onPage("2,000 ÷ 8,000 = 0.25 t per MWh, times 100 MWh", "quiz");
onPage(`40 t would be the ${F.cc.rate.toFixed(2)} t of a combined-cycle plant`, "quiz: the marginal distractor");
onPage(`${P.windMW.toLocaleString("en-US")} MW of wind, ${P.solarMW} MW of solar, ${P.plants.cc.mw.toLocaleString("en-US")} MW of gas combined-cycle plants and ${P.plants.ct.mw.toLocaleString("en-US")} MW of gas peakers`, "data note: the fleet");
onPage("0.40 and 0.58 t per MWh, counted at the stack", "data note: the rates");
ok(Math.round(7.535 * 52.91) === 399, "the worked bridge: 7.535 MMBtu per MWh x 52.91 kg = 399 kg"); onPage("7,535 Btu per kWh = 7.535 <span class=\"lx-term\" data-term=\"mmbtu\">MMBtu</span> per MWh; × 52.91 kg = 399 kg", "data note: the worked bridge");
onPage("t is a metric tonne, 1,000 kg", "data note: t is a metric tonne");
ok(/full-load <span class="lx-term" data-term="heat-rate">heat rates<\/span>/.test(PAGE) && /held at every output/.test(PAGE) && /Part-load efficiency: each plant burns its full-load fuel per MWh at every output/.test(PAGE) && /reported at full load/.test(P.sources.heat.label), "heat rates: full load (EIA Table 8.2's note), held at every output, said on the page");
// a 300 MW step can overflow the combined-cycle plants' spare room: the next-MWh marginal factor times the load is then not
// the change; the page draws the load's own extra CO2 per MWh, whose load-weighted sum is the change
["dc", "ez"].forEach(k => {
  const q = Q[k], dl = M.hourDelta(q.day0, q.inv.g), n = M.overflow(q.day0, q.inv.g, q.load);
  ok(near(dl.reduce((s, d) => s + d.co2, 0), q.short, 1e-6) && near(q.load.reduce((s, l, t) => s + (l > 0 ? l * (dl[t].co2 / l) : 0), 0), q.short, 1e-6), k + ": the hourly changes (and the load's own extra CO2 per MWh x its MWh) add up to the short-run change");
  const margSum = q.load.reduce((s, l, t) => s + l * q.inv.g.marg[t], 0);
  ok(n > 0 ? Math.abs(margSum - q.short) > 50 : near(margSum, q.short, 1e-6), k + ": " + n + " overflow hours; next-MWh marginal factors x the load " + (n > 0 ? "miss" : "give") + " the change (" + margSum.toFixed(0) + " t against " + q.short.toFixed(0) + " t)");
});
ok(M.overflow(Q.dc.day0, Q.dc.inv.g, Q.dc.load) === 4 && M.overflow(Q.ez.day0, Q.ez.inv.g, Q.ez.load) === 0, "overflow hours: 4 for the data center, none for the electrolyzer");
ok(A.mustRunMW === 800 && JS.includes("800 MW of combined-cycle plants stay on") && PAGE.includes("800 MW of combined-cycle plants running"), "the must-run rule's 800 MW is the data's");
A.facts.forEach(f => { const i = PAGE.indexOf('<td class="n">' + f.n + "</td><td>" + f.what + "</td>"); ok(i >= 0 && PAGE.slice(i, i + 600).includes(f.url) && PAGE.slice(i, i + 600).includes(f.asof), "numbers to remember: " + f.n); });

// ---------------- research wording (the sourcing rule): approved sentences only
const norm = s => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const SNAP = {
  "E6.4": "In the reported scenarios, reductions in attributed emissions were on the order of one to two percent of regional totals or less.",
  "E6.6": "Reductions are computed under average-emission-intensity accounting with perfect foresight; they are not estimates of the consequential (marginal) system response.",
  "E10.2": "When gas-fired backup power became much more expensive, the model built fuel cells and turned stored green hydrogen back into electricity.",
  "E10.3": "Industry then drew more hydrogen from gas reformers, and the round trip from power to hydrogen and back lost energy, so total emissions rose although gas-plant emissions fell.",
  "E10.4": "Inputs reflect 2022–2023 conditions; post-2023 federal hydrogen credit rules are not modeled."
};
const RP = PRIV.all("excerpts", "publications");   // the wording checks also read the publication list
let APPROVED = SNAP;
if (RP) {
  const md = fs.readFileSync(RP, "utf8"), reg = {};
  md.split("\n").forEach(line => { const m = line.match(/^\| (E(6|10)\.\d+) \| (.*) \|\s*$/); if (m && !reg[m[1]]) reg[m[1]] = norm(m[3].split(" | ")[0].replace(/^Timeline, [^:]+: /, "")); });
  Object.keys(SNAP).forEach(k => ok(reg[k] === SNAP[k], `approved ${k} equals the snapshot`));
  ok(!/\| E6\.(4|6) \|[^\n]*\| E6\.(4|6) \|/.test(md.split("## Revisions after review")[1] || ""), "no revision replaces E6.4 or E6.6");
  ok(/E6 in A10, M6/.test(md) && /E10 in CF3, M8, A10, M6/.test(md), "the approved wording records the new placements (E6 and E10 in A10)");
  APPROVED = reg;
  const bib = fs.readFileSync(PRIV.path("publications"), "utf8").toLowerCase();
  [...PAGE.matchAll(/<li>Li et al\. \(\d{4}\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>/g)].forEach(m => {
    const entry = bib.split("\n@").find(e => e.includes("title={" + m[2].toLowerCase() + "}")) || "", doi = (entry.match(/doi\s*=\s*\{([^}]+)\}/) || [])[1];
    ok(entry && (!doi || doi === m[1].replace("https://doi.org/", "").toLowerCase()), "citation title (and DOI) as in the publication list: " + m[2].slice(0, 50));
  });
} else console.log("note: the approved excerpt wording and the publication list are not both available (set LEARN_SOURCES); checked against the snapshot");
const UNITS = Object.values(APPROVED).map(norm);
const approved = s => { s = norm(s); return s.length > 0 && UNITS.some(u => u === s || u.split(/(?<=[.?!])\s+/).indexOf(s) >= 0); };
const quotes = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>/g)];
ok(quotes.map(q => q[1]).join(",") === "excerpt:ghg,excerpt:txh2", "two excerpts: ghg and txh2");
quotes.forEach(q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].forEach(p => ok(approved(p[1]), `${q[1]}: approved sentence: ${norm(p[1]).slice(0, 60)}`)));
const paras = q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(p => norm(p[1])).join(" ");
ok(paras(quotes[0]) === SNAP["E6.4"] + " " + SNAP["E6.6"] && paras(quotes[1]) === SNAP["E10.2"] + " " + SNAP["E10.3"], "ghg: E6.4 then E6.6; txh2: E10.2 then E10.3, word for word");
onPage(`<p class="lx-hint">${SNAP["E10.4"]}</p>`, "E10.4 under the txh2 excerpt");
ok(/From: Li et al\. \(2025\), <a href="https:\/\/doi\.org\/10\.1016\/j\.crsus\.2025\.100367">Cell Reports Sustainability<\/a>\./.test(PAGE) && /From: Li et al\. \(2025\), <a href="https:\/\/doi\.org\/10\.1016\/j\.ijhydene\.2025\.02\.303">International Journal of Hydrogen Energy<\/a>\./.test(PAGE), "excerpt footers and DOIs");
const RX = /\b(stud(y|ies)|paper|Li et al|course author|excerpt|ERCOT|Texas|weather zones?|load regulation|re-timed)\b/i;
const LABELS = [/^From: Li et al\. \(2025\), (Cell Reports Sustainability|International Journal of Hydrogen Energy)\.$/, /^Li et al\. \(2025\)\. .+\.$/,
  /^Case file CF6: how much shifting load to cleaner hours can cut emissions, and when\.$/];
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "");
const elems = OWN.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|summary|details|h[1-6]|header|script)\b[^>]*>/i).map(norm).filter(s => /[A-Za-z]/.test(s));
const strs = (JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || []).map(s => s.slice(1, -1));
const fine = x => approved(x) || !RX.test(x) || LABELS.some(r => r.test(norm(x)));
const bad = elems.concat(strs, (JSON.stringify(A).match(/"[^"]{12,}"/g) || []).map(s => s.slice(1, -1))).filter(s => RX.test(s) && !fine(s) && !norm(s).split(/(?<=[.?!])\s+/).every(fine));
ok(bad.length === 0, "research wording: every sentence about the studies is approved:\n  " + bad.slice(0, 6).join("\n  "));
ok(!/92\.[49]|(?<![\d.])3\.8%|131 t|1,300 t|1\.19%|1\.64%/.test(PAGE + JS), "no number from the txh2 paper; E6.3's numbers are not placed here");

// ---------------- scope, links, text, glossary
const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
ok(!NUC.test(OWN + JS + JSON.stringify(A) + SIDE), "no nuclear term in the lesson's own files");
ok(!/\bAI\b|artificial intelligence/.test(OWN + JS), "no AI wording");
{ const dc = (OWN + JS + JSON.stringify(A)).match(/[^.;:!?"]*data cent[^.;:!?"]*/gi) || [];
  const loadish = /load|uses|runs|switch|use|joins|share|footprint|claim|purchase|batch|300 MW|7,200|flat|adds|emit|plants|its|Data center/i;
  ok(dc.length > 0 && dc.every(s => loadish.test(s)), "data centers appear only as a load: " + dc.filter(s => !loadish.test(s)).join(" | ")); }
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
const ALLOW = /^(https:\/\/(doi\.org|www\.eia\.gov|ghgprotocol\.org)\/|[0-9a-z-]+\.html|\.\.\/assets\/|#)/;
ok(hrefs.every(h => ALLOW.test(h)), "links only to allowed domains and learn pages: " + hrefs.filter(h => !ALLOW.test(h)).join(", "));
const stepTexts = [...JS.matchAll(/\{ text: "([^\n]+)",\n\s+build:/g)].map(m => m[1].replace(/" \+ W\.dateLabel \+ "/g, "7 November 2025").replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1"));
const sentences = t => t.replace(/\*\*/g, "").split(/(?<=[.?!])\s+(?=[A-Z0-9“"])/).filter(x => /[A-Za-z]/.test(x)).length;
ok(stepTexts.length === 7 && stepTexts.every(t => t.split(/\s+/).length <= 40 && sentences(t) <= 2), "seven step texts of 40 words and two sentences at most: " + stepTexts.map(t => t.split(/\s+/).length + "/" + sentences(t)).join(","));
{ const O2 = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<blockquote[\s\S]*?<\/blockquote>/g, "");
  const els = O2.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|dd|dt|td|th|summary|footer)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
  const long = els.filter(x => x.split(" ").length > 40);
  ok(long.length === 0, "every page element is 40 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | ")); }
["emissions-inventory", "consequential-analysis", "must-run", "location-based", "market-based", "scope-2", "residual-mix"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE) && new RegExp("\\[\\[" + id + "\\||term=\"" + id + "\"").test(JS + PAGE), "sidecar defines and the page marks " + id));
["electrolyzer", "additionality", "deliverability", "procurement-rule"].forEach(id => ok(JS.includes("[[" + id + "|"), "the page marks the course glossary's " + id));
{ const R = A.claimRules; ok(/Scope 2 Guidance \(2015\)/.test(R.label) && /alone/.test(R.assume) && /retired/.test(R.assume) && /same market/.test(R.assume) && /teaching proxy/.test(R.proxy) && /residual mix/.test(R.proxy) && /proposals, not adopted rules/.test(R.status) &&
    R.sources.length === 2 && R.sources.every(x => /^https:\/\/ghgprotocol\.org\//.test(x.url) && /read 5 November 2026/.test(x.asOf)) && /Table 7\.1/.test(R.sources[0].label) && /29 July 2026/.test(R.sources[1].asOf), "claims: illustrative rules with the Scope 2 Guidance's conditions (Table 7.1), the grid-average proxy and the consultation's status, each dated");
  ok(A.procure.filter(p => p.supply === "wind").every(p => /grid average, a teaching proxy|Assume the purchase gets it built \(additional\) and no line limits \(deliverable\)/.test(p.note)) && /^Assume/.test(A.procure.find(p => p.id === "old").note) && /same certificate market/.test(A.procure.find(p => p.id === "far").label), "purchases: additionality and deliverability are stated assumptions, not facts"); }
ok(A.sort.cards.length === 8 && A.sort.cards.every(c => A.sort.bins.some(b => b.id === c.bin) && c.why.split(" ").length <= 30) && A.sort.bins.every(b => A.sort.cards.filter(c => c.bin === b.id).length === 2), "card sort: eight cards, two per question, each with a short reason");
ok(!/\b(always|never)\b/i.test(strs.join(" ")), "no 'always' or 'never' in the page's strings");
{ const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), r = PY.slice(PY.indexOf("id: " + ID), PY.indexOf("id: " + ID) + 1500);
  ok(/status: active/.test(r.split("- kind:")[0]) && r.includes("after: [12, 8]") && PAGE.includes('subtitle: "' + (r.match(/subtitle: "([^"]+)"/) || [])[1] + '"'), "path.yml: active, after lessons 12 and 8, subtitle equal to the page's"); }

// ---------------- the page on a stub document
{
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
  ["cards", "controls", "plot", "profiles", "cardsort", "toggle", "ledger", "table", "boundary"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const xp = E.LX.H("div", { id: "a10-explain" }, E.body);
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { a10_emissions_questions: A, town_year: year, cf_targets: T }, root); } catch (e) { threw = e.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  try {
    const card = () => demo.cards.el, btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent));
    btns(/^Electrolyzer/)[0].click();
    ok(live.textContent.includes(fm.mwh(Q.ez.mwh)), "step 1: picking the electrolyzer shows its 3,600 MWh");
    demo.cards.go(1); btns(/^Count its share/)[0].click();
    ok(card().textContent.includes(fm.t(Q.ez.inv.share)) && card().textContent.includes(fm.t(Q.ez.inv.total)), "step 2: the inventory line with the reader's load");
    demo.cards.go(2); btns(/^Dispatch with and without/)[0].click();
    ok(card().textContent.includes(fm.dt(Q.ez.short)), "step 3: the short-run change");
    demo.cards.go(3); card().querySelectorAll("button").filter(b => /Must-run/.test(b.textContent) || /Must-run/.test(b.getAttribute("aria-label") || ""))[0].click();
    ok(card().textContent.includes(fm.dt(Q.ezM.short)) && card().textContent.includes("stays at " + fm.t(Q.ez.inv.share)), "step 4: both models' answers; the inventory share stays");
    demo.cards.go(4); btns(/^New wind/)[0].click();
    ok(card().textContent.includes(fm.dt(Q.ez.long.wind)) && card().textContent.includes(fm.mw(Q.ez.newWindMW)), "step 5: new wind's long-run change and its size");
    demo.cards.go(5);
    ok(card().textContent.includes(fm.t(Q.ez.claims.hourly)) && card().textContent.includes(fm.dt(Q.ez.plants.old)), "step 6: the purchase table");
    ok(xp.textContent.includes("Four questions, four methods") && xp.textContent.includes(fm.t(Q.ez.inv.share)), "explain: the four-question table with the reader's numbers");
    // the chart draws the scenario of the step: new wind in step 5 and with a new-wind purchase in step 6, not the old fleet
    demo.cards.go(4); btns(/^New wind/)[0].click();
    const ttl = () => live.querySelector("h3").textContent;
    ok(ttl().includes(fm.mw(Q.ez.newWindMW) + " of new wind") && live.textContent.includes("CO₂ change against no load, t"), "step 5: the chart's title and text table show the grid with the new wind: " + ttl());
    btns(/^A new 300 MW gas plant/)[0].click(); ok(ttl().includes("a new 300 MW gas plant"), "step 5: and with the new gas plant");
    demo.cards.go(5); const sel = card().querySelector("#a10-buy"); sel.value = "old"; sel.fire("change");
    ok(!/new wind|gas plant/.test(ttl()), "step 6: a purchase that adds nothing shows the grid without new plants");
    sel.value = "hourly"; sel.fire("change"); ok(ttl().includes(fm.mw(Q.ez.newWindMW) + " of new wind"), "step 6: a new-wind purchase shows the new wind");
    ok(card().textContent.includes("Illustrative reporting rules") && card().textContent.includes("teaching proxy"), "step 6: the illustrative rules and the grid-average proxy are stated");
    // every line the page assembles, for every input: 40 words and two sentences at most
    const said = [], over = [];
    const grab = () => { card().querySelectorAll(".lx-saw, .lx-hint, li").forEach(e => said.push(e.textContent.replace(/\s+/g, " ").trim())); };
    for (const ld of ["Data center", "Electrolyzer"]) {
      demo.cards.go(0); btns(new RegExp("^" + ld))[0].click(); grab();
      demo.cards.go(1); btns(/^Count its share/)[0].click(); grab();
      demo.cards.go(2); btns(/^Dispatch with and without/)[0].click(); grab();
      demo.cards.go(3); for (let i = 0; i < 2; i++) { card().querySelectorAll("button").filter(b => /Must-run/.test(b.textContent) || /Must-run/.test(b.getAttribute("aria-label") || ""))[0].click(); grab(); }
      demo.cards.go(4); for (const b of ["New wind", "A new 300 MW gas plant", "Nothing new"]) { btns(new RegExp("^" + b))[0].click(); grab(); }
      demo.cards.go(5); for (const p of A.procure) { const s2 = card().querySelector("#a10-buy"); s2.value = p.id; s2.fire("change"); grab(); }
    }
    said.filter(t => /[A-Za-z]/.test(t)).forEach(t => { if (t.split(" ").length > 40 || sentences(t) > 2) over.push(t.slice(0, 70) + " (" + t.split(" ").length + "/" + sentences(t) + ")"); });
    ok(said.length > 40 && over.length === 0, "every assembled line (" + said.length + ") is 40 words and two sentences at most: " + over.slice(0, 4).join(" | "));
    ok(said.some(t => t.includes("300 MW × 24 h = 7,200 MWh")) && said.some(t => t.includes("300 MW × 12 h = 3,600 MWh")), "step 1: MW x hours = MWh, worked");
    ok(said.some(t => t.startsWith("In 4 hours the 300 MW overflows")) && said.some(t => t.startsWith("Every extra MWh fits")), "step 3: the overflow hint for the data center, the exact one for the electrolyzer");
  } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
}

console.log(`test_a10-emissions-questions: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
