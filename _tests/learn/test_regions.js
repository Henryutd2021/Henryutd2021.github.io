// test_regions.js — Node tests for the regional profile cards (learn/regions.qmd, assets/learn/regions.js,
// assets/learn/data/regions.json; curriculum v2 §15):
//   - twelve cards, in the curriculum's order, each with the same six parts (system structure, institutions, main
//     challenges, distinctive research questions, verified key numbers with a source each, the as-of date)
//   - every key number of the ten survey cards is one of the curriculum's verified items (§15 table), word for word in its
//     numbers; the Plains and Australia numbers each name a primary source read on 7 November 2026 (SPP, EIA; AEMO, the
//     Clean Energy Regulator), and the source's own line holds every number the card quotes
//   - Ember labelled a compiler of official statistics; links only on the allow-list (others "no link")
//   - no ranking words, no verdicts; no nuclear term in a string with a risk term; text budget per item
//   - the tiles, cards, comparison and sources blocks equal what regions.js writes (--write rewrites them)
// Usage (from the site folder):  node _tests/learn/test_regions.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/regions.js"));
const R = require(path.join(SITE, "assets/learn/data/regions.json"));
const QPATH = path.join(SITE, "learn/regions.qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

const BLOCKS = { "regions-tiles": () => M.tilesHTML(R), "regions-cards": () => M.cardsHTML(R), "regions-compare": () => M.compareHTML(R), "regions-sources": () => M.sourcesHTML(R) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing");
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q); console.log("blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });

// ---------------- twelve cards, six parts each
const ORDER = ["us", "plains", "eu", "china", "india", "japan-korea", "nordics", "gulf", "ssa", "latam", "islands", "australia"];
ok(R.cards.map(c => c.id).join() === ORDER.join(), "twelve cards in the curriculum's order");
ok(R.parts.map(p => p.key).join() === "structure,institutions,challenges,questions", "four text parts, then the numbers and the as-of date");
R.cards.forEach(c => {
  ok(R.parts.every(p => Array.isArray(c[p.key]) && c[p.key].length >= 2 && c[p.key].length <= 5), c.id + ": every text part has 2 to 5 items");
  ok(c.numbers.length >= 2 && c.numbers.every(n => R.sources[n.src]), c.id + ": at least two key numbers, each with a known source");
  ok(/^\d{1,2} November 2026$/.test(c.read), c.id + ": an as-of date");
  ok(R.scales[c.scale] && c.keywords.length === 2, c.id + ": a dominant scale and two keywords");
  ok(c.questions.every(q => /\?$/.test(q)), c.id + ": research questions are questions");
  R.parts.forEach(p => c[p.key].forEach(t => ok(t.split(/\s+/).length <= 30, c.id + " " + p.key + ": ≤ 30 words: " + t.slice(0, 40))));
  c.numbers.forEach(n => ok(n.text.split(/\s+/).length <= 32, c.id + " number ≤ 32 words"));
});

// ---------------- numbers: the survey's verified items (curriculum §15), and the new primary sources
const nums = s => (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/,/g, "")).filter(x => x !== "");
const VERIFIED = {   // curriculum v2 §15, verified key numbers (the field-landscape survey, 2026-11-02)
  us: ["2,061", "1,312", "749", "17%", "19%", "4.4%", "176"], eu: ["47.5%", "90.1%", "10.7%", "30%", "29%", "23%", "5%"],
  china: ["317", "95%", "94%", "1,286", "1,285", "58%", "22%"], india: ["300.50", "54%", "552", "73%", "9.4%"],
  "japan-korea": ["67%", "10%", "9%", "60%", "7%"], nordics: ["161.8", "89.9%", "22.8", "88.1%", "79.7%", "54.3%"],
  gulf: ["98%", "3.5", "68%", "4.2"], ssa: ["655", "560", "83%", "13%"], latam: ["52%", "27%", "89%", "20,483.5", "39,104.4", "74%", "13%"],
  islands: ["38.00", "12.94", "213"]
};
Object.keys(VERIFIED).forEach(id => {
  const c = R.cards.filter(x => x.id === id)[0], all = c.numbers.map(n => n.text).join(" ");
  const want = VERIFIED[id].map(v => v.replace(/[,%]/g, "")), got = nums(all).map(v => v.replace(/%/g, ""));
  ok(want.every(v => got.includes(v)), id + ": every verified number appears");
  const extra = v => !want.includes(v) && !/^20\d\d$/.test(v) && !(/^\d{1,2}$/.test(v) && /\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(all) && all.indexOf(v + " ") >= 0 && +v <= 31);
  ok(!got.some(extra), id + ": no number beyond the verified items (years and dates aside): " + got.filter(extra).join(" "));
});
["plains", "australia"].forEach(id => {
  const c = R.cards.filter(x => x.id === id)[0];
  c.numbers.forEach(n => {
    const s = R.sources[n.src], inSrc = nums(s.where + " " + s.date + " " + s.title).map(v => v.replace(/^0+(?=\d)/, ""));
    const missing = nums(n.text).filter(v => !/^(20\d\d)$/.test(v) && !inSrc.includes(v) && !["1", "15", "16", "20", "21", "27", "30"].includes(v));
    ok(!missing.length, id + ": numbers of '" + n.text.slice(0, 40) + "' are in its source's line: missing " + missing.join(" "));
    ok(/7 November 2026|October 2026|15 October 2026|May 2026|undated/.test(s.date), id + ": source " + n.src + " dated and read");
  });
  ok(c.read === "7 November 2026", id + ": verified on 7 November 2026");
});
{
  const pl = R.cards.filter(x => x.id === "plains")[0];
  ok(pl.challenges[0].indexOf("136 MW in 2019 to 1,097 MW in 2023") > 0 && R.sources["eia-62406"].where.indexOf("136 MW in 2019 to 1,097 MW in 2023") > 0, "Plains: curtailment numbers in their EIA source");
  ok(R.sources["spp-facts"].where.indexOf("wind 36.7%") > 0 && R.sources["spp-facts"].where.indexOf("300,382 GWh") > 0, "Plains: 36.7% of 300,382 GWh (Fast Facts)");
  const au = R.cards.filter(x => x.id === "australia")[0];
  ok(au.numbers[3].text.indexOf("all of Australia, not only the NEM") > 0, "Australia: the Clean Energy Regulator's count is national, said so");
}

// ---------------- sources and links
Object.keys(R.sources).forEach(k => { const s = R.sources[k]; if (/ember/i.test(s.publisher)) ok(s.publisher === "Ember, a compiler of official statistics", k + ": Ember labelled as a compiler of official statistics"); });
// the course allow-list (curriculum v2 §20.3), with the statistics offices and regulators named on a card (W6 integration)
const ALLOW = /^https:\/\/(www\.)?(eia\.gov|ec\.europa\.eu|ember-energy\.org|eta-publications\.lbl\.gov|energy\.gov|worldbank\.org|spp\.org|cso\.ie|nea\.gov\.cn|ssb\.no|aemo\.com\.au|cer\.gov\.au)\//;
Object.keys(R.sources).forEach(k => ok(R.sources[k].url === "no link" || ALLOW.test(R.sources[k].url), k + ": linked only if allow-listed"));
const used = new Set(); R.cards.forEach(c => c.numbers.forEach(n => used.add(n.src))); Object.values(R.partSources).forEach(p => Object.values(p).forEach(a => a.forEach(s => used.add(s))));
ok(Object.keys(R.sources).every(k => used.has(k)), "every source is used: " + Object.keys(R.sources).filter(k => !used.has(k)).join(" "));

// ---------------- scope and neutrality
const strs = []; (function walk(x) { if (typeof x === "string") strs.push(x); else if (x && typeof x === "object") Object.keys(x).forEach(k => walk(x[k])); })(R);
const NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
ok(!strs.filter(s => NUC.test(s) && RISK.test(s)).length, "no string pairs a nuclear term with a risk term: " + strs.filter(s => NUC.test(s) && RISK.test(s)).join(" | "));
ok(!strs.some(s => /\b(best|worst|leader|leading|lags?|ahead of|behind|should adopt|failed policy|successful policy|ranked?)\b/i.test(s)), "no ranking or verdict words: " + strs.filter(s => /\b(best|worst|leader|leading|lags?|ahead of|behind|should adopt|ranked?)\b/i.test(s)).join(" | "));
ok(!strs.some(s => /\bAI\b|artificial intelligence/.test(s)), "no AI wording");
const text = PAGE.replace(/<[^>]+>/g, " ");
ok(!text.split(/(?<=[.;?])\s+/).filter(s => NUC.test(s) && RISK.test(s)).length, "no page sentence pairs a nuclear term with a risk term");
ok(/<meta|description:/.test(PAGE) && /^description: /m.test(PAGE), "the page has a description");
const n = M.counts(R); ok(n.regional + n.national + n.microgrid === 12, "the filter's counts add to 12");

console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (regions)");
process.exit(fails ? 1 : 0);
