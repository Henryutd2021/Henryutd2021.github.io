// test_cf6-shifting-load-to-clean-hours.js — Node tests for case file CF6 (assets/learn/cf6-shifting-load-to-clean-hours.js,
// its data file and the page, a draft in learn/_drafts/ until Henry approves the excerpt):
//   - the day is lesson 9's 9 June 2025, cut and scaled the same way (same demand, wind, sun and dispatch as lesson 9)
//   - the dispatch balances every hour; average and marginal factors follow from it
//   - the three preset moves: average-factor accounting against what the plants emit, as the page states them
//   - the allow-listed explainer (assets/explainers/ghg.js) counts average intensity and grows with the range, as the page says
//   - every number on the page (comparison table, myth answers, numbers to remember) matches the model or the data file
//   - the three no-JS blocks (timeline, idea, boundary) equal what the components write from the data (--write rewrites them)
//   - excerpts: only excerpt:ghg; with LEARN_EXCERPTS (or ../reports/learn/excerpts_for_approval.md) every excerpt
//     sentence and the question are listed there
//   - text budget of the case parts, links
// Usage (from the site folder):  node _tests/learn/test_cf6-shifting-load-to-clean-hours.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "cf6-shifting-load-to-clean-hours";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const S9 = require(L("09-storage.js"));
const TL = require(L("components/timeline.js"));
const EX = require(path.join(SITE, "assets/explainers/ghg.js"));
const D = JSON.parse(fs.readFileSync(L("data/" + ID + ".json"), "utf8"));
const D9 = JSON.parse(fs.readFileSync(L("data/09-storage.json"), "utf8"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const QPATH = [path.join(SITE, "learn", ID + ".qmd"), path.join(SITE, "learn/_drafts", ID + ".qmd")].find(p => fs.existsSync(p));
const I = D.idea;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const W = M.prepare(town, year, I.day);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "cf6-timeline": () => TL.staticHTML(D.timeline.events),
  "cf6-idea": () => M.staticIdea(W, I),
  "cf6-bound": () => M.staticBoundary(D.boundary)
};
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

// ---------------- the day: lesson 9's, cut and scaled the same way
ok(I.day.date === D9.day.date && I.day.utcOffsetHours === D9.day.utcOffsetHours && I.day.demandPeakMW === D9.day.demandPeakMW, "the day is lesson 9's (9 June 2025, UTC-5, 450 MW peak)");
const W9 = S9.prepare(town, year, D9);
ok(JSON.stringify(W9.demand) === JSON.stringify(W.demand) && JSON.stringify(W9.wind) === JSON.stringify(W.wind) && JSON.stringify(W9.solar) === JSON.stringify(W.solar) && JSON.stringify(W9.gap) === JSON.stringify(W.gap),
  "demand, wind, sun and gas need equal lesson 9's");
ok(W.margKey.every((k, t) => (k === "spill") === (W9.marginal[t] === "spill")), "spilled hours are lesson 9's");
const f = town.fleet;
for (let t = 0; t < 24; t++) {
  const h = W.h[t], served = f.nuclear.mw + W.wind[t] + W.solar[t] - h.sp + h.cc + h.pk + h.un;
  ok(near(served, W.demand[t]), "hour " + t + " balances");
  ok(h.un === 0 && h.cc <= f.cc.mw && h.pk <= f.peaker.mw && (h.pk === 0 || h.cc === f.cc.mw), "hour " + t + ": cheapest first, within sizes, no unserved demand");
  ok(near(W.avg[t], (f.cc.co2 * h.cc + f.peaker.co2 * h.pk) / W.demand[t]), "hour " + t + ": average factor = CO2 / demand");
}
const spillH = W.margKey.map((k, t) => k === "spill" ? t : -1).filter(t => t >= 0);
ok(spillH.length === 9 && spillH[0] === 8 && spillH[8] === 16, "nine spill hours, 08:00-17:00 (as lesson 9)");
ok(W.margKey[20] === "pk" && W.margKey[21] === "pk" && W.margKey[22] === "pk" && W.margKey.filter(k => k === "pk").length === 3, "the peaker is on the margin 20:00-23:00");

// ---------------- the preset moves
const R = {}; I.presets.forEach(p => { R[p.id] = M.move(W, p.from, p.to, I.q); });
ok(I.q === 10, "10 MWh moves");
ok(M.tco2(R["eve-mid"].attributed) === "−2.4 t" && M.tco2(R["eve-mid"].system) === "−5.5 t" && near(R["eve-mid"].system, -10 * f.peaker.co2), "evening to midday: average −2.4 t, plants −5.5 t (peaker off, spilled sun used)");
ok(R["eve-mid"].into.sp === 10 && R["eve-mid"].out.pk === 10, "evening to midday: 10 MWh off the peaker, 10 MWh of spilled sun used");
ok(M.tco2(R["dawn-night"].attributed) === "−0.3 t" && near(R["dawn-night"].system, 0, 1e-9) && M.tco2(R["dawn-night"].system) === "0.0 t", "dawn to small hours: average −0.3 t, plants 0.0 t");
ok(W.margKey[6] === "cc" && W.margKey[3] === "cc", "06:00 and 03:00: the combined-cycle plant is on the margin in both");
ok(M.tco2(R["eve-morning"].attributed) === "−2.4 t" && M.tco2(R["eve-morning"].system) === "−2.9 t" && R["eve-morning"].into.sp === 3 && R["eve-morning"].into.cc === 7, "evening to 08:00: only 3 MWh of sun spare, 7 MWh from the combined-cycle plant");
ok(-W.gap[14] === 25 && W.margKey[14] === "spill", "14:00 spills 25 MWh of sun");
ok(M.move(W, 5, 5, 10).same && M.move(W, 5, 5, 10).system === 0, "the same hour twice changes nothing");
// the general rule the page states: into a spill hour (within the spill) never raises what the plants emit
for (let a = 0; a < 24; a++) spillH.forEach(b => { if (-W.gap[b] >= 10 && a !== b) ok(M.move(W, a, b, 10).system <= 1e-9, "into spare sun at " + b + " from " + a + " never raises CO2"); });

// ---------------- the allow-listed explainer counts average intensity; wider range, larger reduction
const e3 = EX.model({ range: 0.03, grid: "large" }), e8 = EX.model({ range: 0.08, grid: "large" }), s8 = EX.model({ range: 0.08, grid: "small" });
ok(e8.reductionPct > e3.reductionPct && e8.reductionPct > s8.reductionPct && near(e8.newTotal, e8.total, 1e-6), "explainer: total kept; wider range and larger swing give larger attributed reductions");

// ---------------- numbers on the page
const T = text(PAGE);
ok(/Moving 10 MWh from 06:00 to 03:00">−0\.3 t</.test(PAGE) && /Moving 10 MWh from 06:00 to 03:00">0\.0 t</.test(PAGE), "comparison table: −0.3 t and 0.0 t = the dawn preset");
ok(/moving 10 MWh from 06:00 to 03:00 lowers the average-factor count by 0\.3 t, yet the plants emit the same/.test(T), "myth 1 = the dawn preset");
ok(/At 14:00 Prairie Town spills 25 MWh of sun, so 10 MWh moved there from 20:00 cut the peaker's CO₂ by 5\.5 t/.test(T), "myth 2 = the evening-to-midday preset");
D.facts.forEach(fc => {
  const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
  ok(row >= 0 && PAGE.slice(row, row + 600).indexOf(fc.url) >= 0 && PAGE.slice(row, row + 600).indexOf(fc.asof) >= 0, "numbers to remember: '" + fc.n + "' carries its source and date");
});
ok(/from ±5% to ±8% can boost carbon reductions from 1\.19% to 1\.64%/.test(T) && /one to two percent of regional totals or less/.test(T), "facts agree with the excerpt");

// ---------------- excerpts and sources
const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
ok(keys.length === 1 && keys[0] === "excerpt:ghg", "the only excerpt key is excerpt:ghg");
const sentences = [...PAGE.matchAll(/<blockquote class="lx-excerpt"[^>]*>([\s\S]*?)<footer>/g)].flatMap(m => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => text(x[1])));
const question = text((PAGE.match(/<p class="lx-case-q">([\s\S]*?)<\/p>/) || [])[1] || "");
ok(sentences.length === 5 && question.length > 40, "five excerpt sentences and the question on the page");
const EXF = process.env.LEARN_EXCERPTS || path.join(SITE, "..", "reports/learn/excerpts_for_approval.md");
if (fs.existsSync(EXF)) {
  const ap = fs.readFileSync(EXF, "utf8").replace(/\s+/g, " ");
  sentences.concat([question]).forEach(s => ok(ap.indexOf(s) >= 0, "listed for approval: " + s.slice(0, 60)));
} else console.log("note: excerpts_for_approval.md not found (set LEARN_EXCERPTS); excerpt sentences not cross-checked");
// the page's own links (the generated header, next box and footer are build_learn.py's and checked by the scope scan)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.every(h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://github.com/Henryutd2021/ghg-load-regulation" || h === "https://www.eia.gov/electricity/gridmonitor/" || /^[0-9a-z-]+\.html$/.test(h) || /^#/.test(h)),
  "links: doi.org, EIA, the allow-listed repository and learn pages only");
ok(!/projects\/|research\.html/.test(PAGE), "no project page and no Research page");
ok(!/\bnuclear\b/i.test(T), "the page text never names the town's flat plant's technology (it needs no mention here)");
ok(TL.validate(D.timeline.events).length === 0, "every timeline event has a valid date and a source");

// ---------------- text budget
[...PAGE.matchAll(/<div class="lx-case-part[^"]*">([\s\S]*?)<\/div>\n/g)].forEach((m, i) => {
  const words = text(m[1].replace(/<blockquote[\s\S]*?<\/blockquote>/g, "").replace(/<p class="lx-case-q">[\s\S]*?<\/p>/, "")).split(" ").length;
  ok(words <= 60, "case part " + (i + 1) + " has " + words + " words (60 at most, excerpts excluded)");
});

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
