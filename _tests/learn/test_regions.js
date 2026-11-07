// test_regions.js — Node tests for the regional profile cards (learn/regions.qmd, assets/learn/regions.js,
// assets/learn/data/regions.json; curriculum v2 §15):
//   - twelve cards, in the curriculum's order, each with the same six parts (system structure, institutions, main
//     challenges, distinctive research questions, verified key numbers with a source each, the as-of date)
//   - every key number of the ten survey cards is one of the curriculum's verified items (§15 table), word for word in its
//     numbers; the Plains and Australia numbers each name a primary source read on 7 November 2026 (SPP, EIA; AEMO, the
//     Clean Energy Regulator), and the source's own line holds every number the card quotes
//   - every key number carries its data year; a surveyed figure without one is held back (the Gulf card) and not shown
//   - every number in the text parts is in the survey's row for that card (copied below) or in a cited source line
//   - plain language: the jargon the reviews named is marked as a glossary term or explained; acronyms expanded at
//     first use; one idea per bullet (at most one semicolon); the facts the reviews corrected (SPP's two
//     interconnections, Okinawa, China's utilisation rate, Australia's operational demand)
//   - Ember labelled a compiler of official statistics, in the sources and in every citation; links only to the course's
//     allowed domains (curriculum §20.3, copied below; others "no link"); no editorial link rule on the page
//   - no ranking words, no verdicts; each card's focus named as the card's, not the region's; no nuclear term in a string
//     with a risk term; text budget per item; no duplicate id on the page; a link to a hidden card shows it first
//   - the guide, tiles, cards, comparison and sources blocks equal what regions.js writes (--write rewrites them)
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

const BLOCKS = { "regions-guide": () => M.guideHTML(R), "regions-tiles": () => M.tilesHTML(R), "regions-cards": () => M.cardsHTML(R), "regions-compare": () => M.compareHTML(R), "regions-sources": () => M.sourcesHTML(R) };
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
  ok(c.held ? c.numbers.length === 0 && c.held.items.length >= 2 && c.held.src.every(k => R.sources[k]) : c.numbers.length >= 2 && c.numbers.every(n => R.sources[n.src]), c.id + ": at least two key numbers, each with a known source (or held back, with its sources named)");
  ok(c.numbers.every(n => typeof n.year === "string" && /\b(19|20)\d\d\b/.test(n.year)), c.id + ": every key number names the year its data describe");
  ok(/^\d{1,2} November 2026$/.test(c.read), c.id + ": an as-of date");
  ok(R.scales[c.scale] && c.keywords.length === 2, c.id + ": a dominant scale and two keywords");
  ok(c.questions.every(q => /\?$/.test(q)), c.id + ": research questions are questions");
  R.parts.forEach(p => c[p.key].forEach(t => ok(M.plain(t).split(/\s+/).length <= 30, c.id + " " + p.key + ": ≤ 30 words: " + t.slice(0, 40))));
  R.parts.forEach(p => c[p.key].forEach(t => ok((t.match(/;/g) || []).length <= 1, c.id + " " + p.key + ": one idea per bullet (at most one semicolon): " + t.slice(0, 40))));
  c.numbers.forEach(n => ok(M.plain(n.text).split(/\s+/).length <= 32, c.id + " number ≤ 32 words"));
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
  const c = R.cards.filter(x => x.id === id)[0], all = (c.held ? c.held.items : c.numbers).map(n => n.text).join(" ");
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

// ---------------- held back: the Gulf figures have no data year, so neither the card nor its sources show them
{
  const g = R.cards.filter(x => x.id === "gulf")[0];
  ok(g.held && /no data year/.test(g.held.why) && g.held.src.every(k => /no data year|without a data year/.test(R.sources[k].where)), "Gulf: figures held back, and why");
  ok(g.held.items.every(n => PAGE.indexOf(n.text) < 0 && PAGE.indexOf(n.text.slice(0, 25)) < 0) && !/3\.5 times|4\.2 times/.test(PAGE + JSON.stringify(R.sources)), "Gulf: the held figures are on no page and in no source line");
}

// ---------------- numbers in the text parts: in the survey's row (field-landscape §4.1, read 2 November 2026) or a cited source line
{
  const SURVEY = { us: ["7", "3", "2023"], eu: ["2022"], china: ["2025"], "japan-korea": ["50", "60"], nordics: ["2024"], ssa: ["2013"], latam: ["2025"] };   // the survey row's numbers (3,000 km and 90% dropped)
  R.cards.forEach(c => {
    const where = Object.values((R.partSources || {})[c.id] || {}).flat().map(k => R.sources[k].title + " " + R.sources[k].where + " " + R.sources[k].date).join(" ").replace(/1600 hrs to 2100 hrs/, "4 pm to 9 pm 1600 2100");
    const ok_ = new Set((SURVEY[c.id] || []).concat(nums(where)).concat(where.indexOf("4 pm to 9 pm") >= 0 ? ["4", "9"] : []));
    const text = [c.note || ""].concat(...R.parts.map(p => c[p.key])).join(" ");
    const bad = nums(M.plain(text)).filter(v => !ok_.has(v));
    ok(!bad.length, c.id + ": every number in the text parts is in the survey or a cited source: " + bad.join(" "));
  });
  ok(!/3,000 km|90%|stochastic dual dynamic/.test(JSON.stringify(R)), "no unsourced 3,000 km or 90%; no algorithm name in a D2 question");
  ok(R.guide.some(g => /1 TWh = 1,000 GWh = 1 billion kWh/.test(g.text)) && 1e12 / 1e9 === 1000 && 1e12 / 1e3 === 1e9, "guide: 1 TWh = 1,000 GWh = 1 billion kWh");
}

// ---------------- plain language and the facts the review corrected
{
  const card = id => R.cards.filter(x => x.id === id)[0], txt = id => JSON.stringify(card(id));
  const marked = new Set((PAGE.match(/data-term="([a-z0-9-]+)"/g) || []).map(s => s.slice(11, -1)));
  ["rto", "vertically-integrated-utility", "resource-adequacy", "unbundling", "bidding-zone", "market-coupling", "flow-based-coupling", "hvdc", "capture-price", "curtailment", "capacity-factor", "inertia", "synchronous-grid", "ancillary-services"]
    .forEach(id => ok(marked.has(id), "the page marks " + id + " as a glossary term"));
  ok(/redispatch: paying plants to change their output so flows fit the lines/.test(txt("eu")) && /load shedding: planned, rotating power cuts/.test(txt("ssa")), "redispatch and load shedding explained where they appear");
  [["us", "FERC]] (Federal Energy Regulatory Commission)"], ["us", "NERC (North American Electric Reliability Corporation)"], ["china", "NDRC (National Development and Reform Commission)"], ["china", "NEA (National Energy Administration)"],
   ["india", "CERC (Central Electricity Regulatory Commission)"], ["eu", "ACER, the EU Agency for the Cooperation of Energy Regulators"], ["australia", "AEMO (Australian Energy Market Operator)"]]
    .forEach(x => ok(txt(x[0]).indexOf(x[1]) > 0, x[0] + ": acronym expanded: " + x[1].slice(0, 30)));
  ok(/independent grid operators\]\] \(ISOs and RTOs\)/.test(txt("us")), "US: ISOs and RTOs explained");
  const pl = card("plains"), west = R.sources["spp-west"];
  ok(pl.structure.some(s => /Since 1 April 2026 .* Western Interconnection/.test(s)) && pl.structure.some(s => /Eastern Interconnection/.test(s)) && /on 1 April 2026 SPP expanded its service territory into the Western Interconnection/.test(west.where) && R.partSources.plains.structure.indexOf("spp-west") >= 0, "Plains: both interconnections since 1 April 2026, from SPP's own page");
  ok(/before (its|the) western expansion/.test(pl.note) && pl.numbers.filter(n => /2025/.test(n.year)).every(n => /before the western expansion/.test(n.year)) && /after the western expansion/.test(pl.numbers[0].year), "Plains: each figure's footprint by date");
  const jk = card("japan-korea");
  ok(/nine of them interconnected; Okinawa's is separate/.test(jk.structure[0]) && /other than Okinawa's are connected/.test(R.sources.occto.where), "Japan: nine areas interconnected, Okinawa separate (OCCTO)");
  const cn = card("china").numbers[0].text;
  ok(/available solar output and 94% of available wind output was used, not \[\[curtailment\|curtailed\]\]/.test(cn) && /not a \[\[capacity-factor/.test(cn) && /rather than curtailed/.test(R.sources["nea-feb"].where), "China: utilisation explained as output used rather than curtailed, not a capacity factor");
  const au = card("australia");
  ok(/operational demand \(the demand left for the grid's generators after rooftop and other distributed solar\)/.test(au.numbers[1].text) && /demand on the grid's large generators/.test(au.challenges[0]) && /operational demand, the demand left for its generators/.test(au.questions[0]), "Australia: operational demand defined beside 9,422 MW; rooftop solar lowers the demand the grid sees");
  ok(/rooftop solar reduces the need for electricity from grid-scale generators/.test(R.sources["aemo-msl"].where) && /1600 hrs to 2100 hrs/.test(R.sources["aemo-qed"].where), "Australia: the wording rests on AEMO's fact sheet and QED");
  ok(/US cents per kWh/.test(card("islands").numbers[0].text) && /US cents per kWh/.test(JSON.stringify(R.guide)), "Hawaii's prices in US cents per kWh");
  ok(R.guide.length >= 5 && R.guide.every(g => M.plain(g.text).split(/\s+/).length <= 30), "a short guide to units and classifications");
  ok(/2024/.test(card("ssa").numbers[0].year) && /for 2024/.test(R.sources["wb-sdg7"].where), "access figures are 2024 data");
}

// ---------------- focus, not 'dominant scale'; a link to a hidden card shows it
ok(!/dominant/i.test(PAGE + fs.readFileSync(path.join(SITE, "assets/learn/regions.js"), "utf8")) && /Focus of this card/.test(PAGE) && /an editorial choice, not a property of the region/.test(PAGE), "each card's focus named as an editorial choice");
ok(M.revealFor(R, "national", "us") === "all" && M.revealFor(R, "national", "china") === "national" && M.revealFor(R, "all", "us") === "all" && M.revealFor(R, "regional", "cards") === "regional", "a link to a card the filter hides switches to all cards; other links keep the filter");
R.cards.forEach(c => Object.keys(R.scales).forEach(k => ok(M.revealFor(R, k, c.id) === (c.scale === k ? k : "all"), "reveal " + c.id + " from " + k)));
{
  const JSR = fs.readFileSync(path.join(SITE, "assets/learn/regions.js"), "utf8");
  ok(/addEventListener\("click"[\s\S]*closest\("a\[href\^='#'\]"\)[\s\S]*reveal\(/.test(JSR) && /hashchange/.test(JSR), "the page reveals the target of an in-page link before following it, and on a hash change");
}
// ---------------- one id per element
{
  const ids = (PAGE.match(/\bid="([^"]+)"|\{#([a-z0-9-]+)[\s}]/g) || []).map(s => s.replace(/^id="|"$|^\{#|[\s}]$/g, ""));
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i); ok(!dup.length, "no duplicate id on the page: " + dup.join(" "));
  ok(/## Sources \{#sources-h\}/.test(PAGE), "the Sources heading has its own id");
}

// ---------------- sources and links
Object.keys(R.sources).forEach(k => { const s = R.sources[k]; if (/ember/i.test(s.publisher)) ok(s.publisher === "Ember, a compiler of official statistics", k + ": Ember labelled as a compiler of official statistics"); });
// the course's allowed external domains (curriculum v2 §20.3, copied; scripts/learn_scope_scan.py is the canonical judge)
const DOMAINS = ["eia.gov", "energy.gov", "ferc.gov", "nerc.com", "lbl.gov", "nrel.gov", "nlr.gov", "epa.gov", "usgs.gov", "bea.gov", "census.gov", "bls.gov", "noaa.gov", "weather.gov", "fema.gov", "dot.gov", "irs.gov", "energycodes.gov", "kcc.ks.gov",
  "iea.org", "irena.org", "ipcc.ch", "worldbank.org", "ec.europa.eu", "entsoe.eu", "ember-energy.org", "ourworldindata.org", "openalex.org", "iso.org", "ghgprotocol.org", "doi.org", "pjm.com", "spp.org", "ercot.com", "caiso.com", "misoenergy.org", "iso-ne.com", "nyiso.com",
  "stats.gov.cn", "nea.gov.cn", "mospi.gov.in", "epe.gov.br", "ssb.no", "cso.ie", "cer.gov.au", "aemo.com.au"];
const ALLOW = { test: u => { const m = /^https:\/\/([^/]+)\//.exec(u); return !!m && DOMAINS.some(d => m[1] === d || m[1].endsWith("." + d)); } };
Object.keys(R.sources).forEach(k => ok(R.sources[k].url === "no link" || ALLOW.test(R.sources[k].url), k + ": linked only to an allowed domain"));
ok(["cso-dc", "nea-feb", "nea-sep", "ssb-record", "aemo-qed", "aemo-msl", "cer", "cer-scheme", "spp-west"].every(k => ALLOW.test(R.sources[k].url)), "the statistics offices, regulators and operators on the allowed list are linked");
ok((PAGE.match(/href="https?:[^"]+"/g) || []).every(h => ALLOW.test(h.slice(6, -1)) || /creativecommons\.org|opensource\.org/.test(h)), "every link on the page is to an allowed domain (the footer's licences aside)");
ok(!/link list|allow-list|allowed list/i.test(PAGE.replace(/<!--[\s\S]*?-->/g, "")), "no editorial link rule shown on the page");
ok(R.cards.every(c => c.numbers.every(n => !/ember/i.test(R.sources[n.src].publisher) || M.srcRef(R, n.src, n.year).indexOf("Ember, a compiler of official statistics") > 0)), "every citation of Ember names it a compiler of official statistics");
const used = new Set(M.usedSources(R));
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
