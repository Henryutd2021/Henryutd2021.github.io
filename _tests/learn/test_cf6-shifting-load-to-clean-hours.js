// test_cf6-shifting-load-to-clean-hours.js — Node tests for case file CF6 (assets/learn/cf6-shifting-load-to-clean-hours.js,
// its data file and the page, learn/cf6-shifting-load-to-clean-hours.qmd, or the draft in learn/_drafts/):
//   - the day is lesson 9's 9 June 2025, cut and scaled the same way (same demand, wind, sun and dispatch as lesson 9)
//   - the dispatch balances every hour; average and marginal factors follow from it
//   - the three preset moves: average-factor accounting against what the plants emit, as the page states them; a move
//     that crosses from one plant to the next is re-dispatched, not multiplied by the next-MWh factor
//   - the allow-listed explainer (assets/explainers/ghg.js) counts average intensity and grows with the range, as the page
//     says; its starting day is on the page as a table; with JavaScript the table follows the slider and the toggle (the
//     explainer's "explainer-update" event, run here with a fake helper kit; the page's writer on the stub document)
//   - every number on the page (comparison table, myth answers, numbers to remember) matches the model or the data file
//   - the four no-JS blocks (timeline, idea, boundary, explainer table) equal what the components write from the data
//     (--write rewrites them)
//   - research wording (the course's sourcing rule): every sentence on the page, in the data file and in this lesson's
//     script that describes the course author's study is an approved sentence of the excerpt wording
//     (E6, with its "Revisions after review"), word for word; see "research wording" below
//   - citations: the paper's title in the sources list is the title in the author's publication list
//   - text budget of every text element and of the live status, links
// Usage (from the site folder):  node _tests/learn/test_cf6-shifting-load-to-clean-hours.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const PRIV = require("./private_sources.js");
const ID = "cf6-shifting-load-to-clean-hours";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const S9 = require(L("09-storage.js"));
const TL = require(L("components/timeline.js"));
const EX = require(path.join(SITE, "assets/explainers/ghg.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const D = JSON.parse(RAW);
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
  "cf6-bound": () => M.staticBoundary(D.boundary),
  "cf6-ghg": () => M.staticExplainer(EX.model({ range: 0.05, grid: "large" }), 0.05, "large")
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
ok(-W.gap[14] === 25 && W.margKey[14] === "spill", "14:00 spills 25 MWh of wind and sun (the toy spills them together)");
// a 10 MWh move that crosses a plant boundary: re-dispatched, not the next-MWh factor times 10 (the page's note)
const cross = M.move(W, 22, 14, 10);
ok(cross.out.pk === 4 && cross.out.cc === 6 && M.tco2(cross.system) === "−4.4 t" && Math.abs(cross.system - (-10 * W.marg[22])) > 1, "22:00 to 14:00: 4 MWh off the peaker, 6 MWh off the combined-cycle plant, −4.4 t, not 10 × 0.55");
// the live status: one idea per line, short
for (let a = 0; a < 24; a++) for (let b = 0; b < 24; b++) {
  const lines = M.statusLines(M.move(W, a, b, 10));
  if (!lines.every(t => text(t).split(" ").length <= 30)) ok(false, "status " + a + " to " + b + ": a line over 30 words");
}
ok(M.statusLines(cross)[0] === "Out of 22:00–23:00: the peaker runs 4 MWh less and the combined-cycle plant runs 6 MWh less." && M.statusLines(cross)[1] === "Into 14:00–15:00: 10 MWh of otherwise spilled wind and sun.", "status names each plant's change in the moved hours");
ok(M.move(W, 5, 5, 10).same && M.move(W, 5, 5, 10).system === 0, "the same hour twice changes nothing");
// the general rule the page states: into a spill hour (within the spill) never raises what the plants emit
for (let a = 0; a < 24; a++) spillH.forEach(b => { if (-W.gap[b] >= 10 && a !== b) ok(M.move(W, a, b, 10).system <= 1e-9, "into spare sun at " + b + " from " + a + " never raises CO2"); });

// ---------------- the allow-listed explainer counts average intensity; wider range, larger reduction
const e3 = EX.model({ range: 0.03, grid: "large" }), e8 = EX.model({ range: 0.08, grid: "large" }), s8 = EX.model({ range: 0.08, grid: "small" });
ok(e8.reductionPct > e3.reductionPct && e8.reductionPct > s8.reductionPct && near(e8.newTotal, e8.total, 1e-6), "explainer: total kept; wider range and larger swing give larger attributed reductions");
const e5 = EX.model({ range: 0.05, grid: "large" });
ok(e5.adjust.every((y, t) => Math.abs(y) <= 0.05 * e5.load[t] * 2 + 1e-9) && near(e5.newTotal, e5.total, 1e-9) && e5.reductionPct > 0, "explainer's starting day (±5%, large swing): total kept, a positive reduction (its text version on the page)");

// ---------------- the explainer's own text table follows its controls
{
  // the explainer's view with a fake helper kit: controls are captured, drawing is skipped, events are recorded
  const ctl = {}, events = [], noop = () => {};
  const fakeEl = () => ({ appendChild: noop, setAttribute: noop, style: {}, firstChild: null });
  const h = { scaffold: () => ({ controls: {}, figure: {}, side: {} }), el: fakeEl, color: () => "#000", fmt: (v, d) => Number(v).toFixed(d || 0),
              slider: (p, o) => { ctl.slider = o; return { set: v => o.onInput(v) }; }, toggle: (p, o) => { ctl.toggle = o; return { set: v => o.onChange(v) }; },
              readouts: () => noop, sentence: () => noop, responsive: () => noop, onTheme: noop };
  const root = { dispatchEvent: e => { events.push(e); return true; } };
  EX.view(root, h);
  const last = () => events[events.length - 1], same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(ctl.slider.value === 5 && events.length === 1 && last().type === "explainer-update" && last().bubbles && last().detail.slug === "ghg" &&
     same(last().detail.model, EX.model({ range: 0.05, grid: "large" })) && last().detail.range === 0.05 && last().detail.grid === "large",
     "explainer: its first update says what it shows (±5%, large swing), the state the page's no-JS table holds");
  let all = true;
  ["small", "large"].forEach(g => { ctl.toggle.onChange(g); for (let r = 0; r <= 10; r++) { ctl.slider.onInput(r); const d = last().detail; if (!(d.range === r / 100 && d.grid === g && same(d.model, EX.model({ range: r / 100, grid: g })))) all = false; } });
  ok(all && events.length === 1 + 2 * 12, "explainer: every slider step and both swings send the model's result for that state (" + events.length + " updates)");
  // the page's writer on the stub document: the table and the summary follow the state; the no-JS block is the default
  const { env } = require("./stubdom.js"), E = env(), H = E.LX.H;
  const det = H("details", { class: "lx-textalt" }, E.body), sum = H("summary", { text: "Text version: the slider's starting day, hour by hour" }, det), box = H("div", { class: "cf6-ex-table" }, det);
  const d7 = { range: 0.07, grid: "small", model: EX.model({ range: 0.07, grid: "small" }) };
  ok(M.liveTable(det, d7) && box.innerHTML === M.staticExplainer(d7.model, 0.07, "small") && sum.textContent === M.LIVE_SUMMARY,
     "page: the explainer's update rewrites the hour-by-hour table (±7%, small swing) and the summary says it follows the slider");
  const rows = (box.innerHTML.match(/<tr><td>/g) || []).length, after = [...box.innerHTML.matchAll(/<tr><td>[^<]+<\/td><td class="n">\d+<\/td><td class="n">[\d.]+<\/td><td class="n">([\d.]+)<\/td>/g)].map(m => +m[1]);
  ok(rows === 24 && after.length === 24 && near(after.reduce((a, b) => a + b, 0), d7.model.total, 24 * 0.05 + 1e-9) && /At ±7% on the small-swing day/.test(box.innerHTML), "page: 24 hours, the After column keeps the day's total, the setting named");
  ok(!M.liveTable(det, null) && box.innerHTML === M.staticExplainer(d7.model, 0.07, "small"), "page: an event without a model changes nothing");
  ok(/addEventListener\("explainer-update", function \(e\) \{ liveTable\(alt, e\.detail\); \}\)/.test(JS) && /details\.lx-textalt/.test(JS), "page script: listens to the explainer and writes into its text version");
}

// ---------------- numbers on the page
const T = text(PAGE);
ok(/Moving 10 MWh from 06:00 to 03:00">−0\.3 t</.test(PAGE) && /Moving 10 MWh from 06:00 to 03:00">0\.0 t</.test(PAGE), "comparison table: −0.3 t and 0.0 t = the dawn preset");
ok(/moving 10 MWh from 06:00 to 03:00 lowers the average-factor count by 0\.3 t, yet the plants emit the same/.test(T), "myth 1 = the dawn preset");
ok(/At 14:00 Prairie Town spills 25 MWh of wind and sun, so 10 MWh moved there from 20:00 cut the peaker's CO₂ by 5\.5 t/.test(T), "myth 2 = the evening-to-midday preset");
ok(/change in attributed emissions −2\.4 t; change in what the plants emit −5\.5 t/.test(T) && /Negative means less CO₂; t means metric tonnes\./.test(T), "no-JS presets: changes, with the sign and the unit explained");
D.facts.forEach(fc => {
  const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
  ok(row >= 0 && PAGE.slice(row, row + 600).indexOf(fc.url) >= 0 && PAGE.slice(row, row + 600).indexOf(fc.asof) >= 0, "numbers to remember: '" + fc.n + "' carries its source and date");
});
ok(/from ±5% to ±8% can boost carbon reductions from 1\.19% to 1\.64%/.test(T) && /one to two percent of regional totals or less/.test(T), "facts agree with the excerpt");

// ---------------- excerpts, links and scope
const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
ok(keys.length === 1 && keys[0] === "excerpt:ghg", "the only excerpt key is excerpt:ghg");
// the page's own links (the generated header, next box and footer are the course build step's and checked by the scope scan)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.every(h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://github.com/Henryutd2021/ghg-load-regulation" || h === "https://www.eia.gov/electricity/gridmonitor/" || /^[0-9a-z-]+\.html$/.test(h) || /^#/.test(h)),
  "links: doi.org, EIA, the allow-listed repository and learn pages only");
ok(!/projects\/|research\.html/.test(PAGE), "no project page and no Research page");
ok(!/\bnuclear\b/i.test(T), "the page text never names the town's flat plant's technology (it needs no mention here)");
ok(TL.validate(D.timeline.events).length === 0, "every timeline event has a valid date and a source");
ok(!/spills \d+ MWh of sun\b/.test(T), "the toy's spill is never called sun alone (wind and sun are spilled together)");

// ---------------- research wording (the sourcing rule)
// Every sentence that describes the course author's studies (question, method, data, findings, limits, citation) is (a) an
// approved sentence of the excerpt wording (the sections in CF.sections) or (b) a revision listed under
// "Revisions after review", word for word. A page sentence may be a clause of an approved row only where the row itself breaks
// (": ", "; ", ". "), as in "Inside: ..." or a boundary list item. Where it looks:
//   strict (every text element, unless listed in NOT_RESEARCH): the case parts, the excerpts and their notes, the
//     explainer's no-JS steps, the sources list; in the data file the texts of the study and code steps of the timeline,
//     the boundary lists and the facts' 'what'
//   signalled (an element that names a study, paper, author, site or method, by RX): everything else on the page (the
//     generated header's description and course-map line included), every string of the data file, every string literal
//     of this lesson's script
// NOT_RESEARCH lists what may name a study without describing it: part labels, provenance labels, citation labels and
// general ideas that hold in the toy; each entry has its reason. The approved wording is read through
// private_sources.js; without it the test uses APPROVED_SNAPSHOT below, which it otherwise checks against that wording.
const CF = { prefix: "cf6", sections: ["E6"], excerpts: 5, question: "E6.1", papers: 1 };
const APPROVED_SNAPSHOT = {   // the approved wording, E6 with the revisions after review
  "E6.1": "How much do the emissions attributed to electricity consumption fall when load is re-timed according to hourly average grid emission intensity across U.S. regions, and which strategies suit which types of grid?",
  "E6.2": "Longer optimization windows and wider adjustment ranges increased the reduction in attributed emissions, most in renewable-rich and diverse grids.",
  "E6.3": "In grids with diverse generation resources, expanding the adjustment range from ±5% to ±8% can boost carbon reductions from 1.19% to 1.64%.",
  "E6.4": "In the reported scenarios, reductions in attributed emissions were on the order of one to two percent of regional totals or less.",
  "E6.5": "Regions with low intensity fluctuation were more sensitive to the cost of regulating load.",
  "E6.6": "Reductions are computed under average-emission-intensity accounting with perfect foresight; they are not estimates of the consequential (marginal) system response.",
  "E6.7": "Holds when: each hour keeps its average intensity, and the whole window is known in advance. Leaves out: which plants respond.",
  "E6.8": "Inside: U.S. grid regions, every hour of 2023, and each region's load, moved within windows of a month, a quarter or a year. Left out: which plants actually change output when load moves, forecast errors, and the cost of moving load beyond a penalty.",
  "E6.9": "Decisions: how much each hour's load moves up or down. Goal: the lowest attributed emissions over the window, plus a penalty for each adjusted hour. Rules: the window's total use does not fall; no hour moves beyond the allowed range, such as ±5%.",
  "E6.10": "A mixed-integer load-regulation model, solved for each window with EIA's hourly data for 2023. Regions are grouped by renewable share, the diversity of their generation and how much their intensity swings; the window, the range and the penalty are varied.",
  "E6.11": "Load re-timed by hourly average emission intensity in U.S. grid regions, with windows of a month, a quarter or a year.",
  "E6.12": "Where the result holds: emissions are counted at each hour's average intensity; each window is known in advance (perfect foresight); each window's total use does not fall; hourly EIA data for U.S. grid regions in 2023. It leaves out: the grid's consequential response: which plants actually change output (the marginal view); forecast errors; the cost of moving load, apart from a penalty on each adjusted hour.",
  "E6.13": "Each hour of the grid has an average emission intensity. The model moves part of the load from high-intensity hours to low-intensity hours in the same window, within an allowed range, and keeps total use unchanged. Attributed emissions fall by the load moved times the intensity gap between those hours. Because the range is limited, the reduction is modest; it grows with a wider range and a longer window."
};
// names the study, its author, its data or its method: such an element is research text unless approved or listed below
const RX = /\b(stud(y|y's|ies)|paper|article|journal|Li et al|course author|excerpt|research|published|U\.S\. (grid )?regions|EIA's hourly|2023|load-regulation|regulating load|perfect foresight|binary variable|attributed emissions|strateg(y|ies))\b/i;
const NOT_RESEARCH = [
  [/^\d · [A-Z][a-z ,]+$/, "part label"],
  [/^Question type: descriptive \(how much\?\), with a prescriptive part \(which strategy suits which grid\?\)\.$/, "course label (the course's question types)"],
  [/^(Grid electricity is cleaner in some hours than in others\.|If some electricity use moves into the cleaner hours, without using less in total, how much CO₂ does that save\?)$/, "the puzzle: a general idea; no study claim"],
  [/^Words first: attributed emissions are a share of the grid's CO₂ assigned to a user; intensity is CO₂ per MWh; a window is the stretch of time within which use may move\.$/, "general definitions"],
  [/^Approved excerpt of: Li et al\. \(2025\), Cell Reports Sustainability\.$/, "provenance label"],
  [/^From the approved excerpt of Li et al\. \(2025\), Cell Reports Sustainability\.$/, "provenance label"],
  [/^Every result about the study is quoted from the approved excerpt of the published paper named in the sources\.$/, "provenance label"],
  [/^Prairie Town below is illustrative, on real hourly shapes\.$/, "provenance label (the toy)"],
  [/^Li et al\. \(2025\), Cell Reports Sustainability( 2, 100367)?( · published May 2025; data for 2023)?$/, "citation label"],
  [/^(The study in time|Where the result holds)$/, "heading"],
  [/^(Paper published|Code released)$/, "timeline step label: the kind of output"],
  [/^A separate example with stylized numbers, from the course author's open explainer: not the study's data or results\.$/, "provenance label (the explainer)"],
  [/^It counts each hour at its average intensity, so it shows attributed emissions only\.$/, "describes the explainer, not the study"],
  [/^(Run examples\/strategies\.py: it compares a month, a quarter and a year as the window on four synthetic regions\.|Which kind of grid gains most from a longer window\?)$/, "repository exercise on its synthetic examples, not the study"],
  [/^ghg-load-regulation: public example repository · MIT licence · synthetic data\.$/, "repository label"],
  [/^(\): change in attributed emissions|%\) and attributed emissions fall by|Change in attributed emissions \(average factor\))$/, "the toy's and the explainer's readouts (script strings), not the study"],
  [/^ghg-load-regulation on GitHub, version 1\.0\.0 \(30 October 2026\)\.$/, "citation of the repository"],
  [/^ghg-load-regulation on GitHub$/, "citation label (repository)"],
  [/^EIA\. Hourly Electric Grid Monitor \(Form EIA-930\): hourly demand and generation by fuel for U\.S\. balancing authorities and regions \(accessed 3 November 2026\)\.$/, "citation (EIA dataset)"]
];
const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
// {id: sentence} of the approved wording's rows in SECTIONS, each revision applied (a revised row replaces the approved one)
function register(md) {
  const out = {}; let sec = null;
  const strip = t => norm(t.replace(/^(Timeline, [^:]+|Myth answer|Citation): /, ""));
  md.split("\n").forEach(line => {
    if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+) \| (.*) \|\s*$/);
    if (!m || !sec || CF.sections.indexOf("E" + m[2]) < 0) return;
    const cells = m[3].split(" | ");
    if (sec === "REV") out[m[1]] = strip(cells[1]); else if (sec === "E" + m[2]) out[m[1]] = strip(cells[0]);
  });
  return out;
}
const RP = PRIV.path("excerpts");
let APPROVED = APPROVED_SNAPSHOT;
if (RP) {
  const reg = register(fs.readFileSync(RP, "utf8"));
  const same = (x, y) => Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => x[k] === y[k]);
  ok(same(reg, APPROVED_SNAPSHOT), "the approved-sentence snapshot in this test equals the approved wording (" + CF.sections.join(", ") + ", revisions applied); differs at: " +
    Object.keys(Object.assign({}, reg, APPROVED_SNAPSHOT)).filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
  APPROVED = reg;
} else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); research wording checked against the snapshot in this test");
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
// the offending sentence of an element, or null when the element is approved, listed or made of approved and listed sentences
function offending(seg) {
  if (approved(seg) || listed(seg)) return null;
  return sentencesOf(seg).find(x => !approved(x) && !listed(x)) || null;
}
// text elements of an HTML (or Markdown list) fragment; inline tags stay inside their element
function elements(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|caption|details|summary|header|h[1-6]|section|nav|script)\b[^>]*>|```[^\n]*\n?/i)
    .map(norm).filter(s => s && !/^(:::|\{=html\})/.test(s) && /[A-Za-z]/.test(s));
}
const bad = [];
const strict = (where, list) => list.forEach(s => { const o = offending(s); if (o) bad.push(where + ": " + o); });
const signalled = (where, list) => list.forEach(s => { if (RX.test(s)) { const o = offending(s); if (o) bad.push(where + ": " + o); } });
// the page: strict zones cut out, generated no-JS blocks dropped (their data is checked below), the rest signalled
const GENERATED = new RegExp("<!-- (" + CF.prefix + "-[a-z]+):start[\\s\\S]*?<!-- \\1:end -->", "g");
let REST = OWN.replace(GENERATED, " ");
const cut = (re, optional) => { const m = REST.match(re); ok(!!m || optional, "page zone found: " + re); if (m) REST = REST.replace(m[0], " "); return m ? m[0] : ""; };
strict("page, the case", elements(cut(/<div class="lx-case">[\s\S]*?\n<\/div>\n(?=<div class="lx-interactive")/)));
strict("page, the case's data note", elements(cut(/<p class="lx-datanote"><span>Every result[\s\S]*?<\/p>/)));
strict("page, explainer no-JS steps", elements(cut(/<ol class="ex-fallback[\s\S]*?<\/ol>/, true)));
const SRC = cut(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/);
// a paper cited with its title and DOI is checked against the publication list below; every other item is strict
const TITLED = /^<li>Li et al\. \((\d{4})\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>\./;
const SRC_LI = [...SRC.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => m[0]);
strict("page, sources", SRC_LI.filter(li => !TITLED.test(li)).map(norm));
signalled("page", elements(REST.replace(/^---[\s\S]*?\n---\n/, " ")));
const FM = (PAGE.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
signalled("front matter", [...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].map(m => m[2]));
const PATHYML = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = (PATHYML.split(/\n- kind: /).find(e => new RegExp("\\n  id: " + ID + "\\n").test(e)) || "");
ok(entry.length > 0, "path.yml has the entry");
signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome): "(.*)"$/gm)].map(m => m[2]));
// the data file
const henry = e => e.kind === "study" || e.kind === "event";
D.timeline.events.filter(henry).forEach(e => {
  if (e.text) strict("data, timeline " + e.date, [e.text]);
  ok(listed(e.label), "data, timeline " + e.date + ": the step's label names its kind only (" + e.label + ")");
});
strict("data, boundary", D.boundary.holds.concat(D.boundary.leaves, [D.boundary.title, D.boundary.source], D.boundary.lede ? [D.boundary.lede] : []));
strict("data, facts", D.facts.filter(f => /^Li et al\./.test(f.source)).map(f => f.what));
const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
signalled("data", strings(D).filter(x => ["about", "url", "date", "as_of", "asof", "built", "kind"].indexOf(x[0]) < 0).map(x => x[1]));
// this lesson's script: its string literals (comments are not shown)
const literals = JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
ok(bad.length === 0, "research wording: every sentence about the studies is approved or a recorded revision:\n  " + bad.join("\n  "));
// the excerpts themselves: approved sentences, and the question
const sentences = [...PAGE.matchAll(/<blockquote class="lx-excerpt"[^>]*>([\s\S]*?)<footer>/g)].flatMap(m => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
ok(sentences.length === CF.excerpts && sentences.every(approved), CF.excerpts + " excerpt sentences, each approved (" + sentences.length + ")");
ok(norm((PAGE.match(/<p class="lx-case-q">([\s\S]*?)<\/p>/) || [])[1] || "") === APPROVED[CF.question], "the question is " + CF.question + ", word for word");
// citations: titles as in the author's publication list
if (RP) {
  const bib = fs.readFileSync(PRIV.path("publications"), "utf8");
  const titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(m => m[1].replace(/[{}]/g, "").replace(/\\textbf/g, "").toLowerCase());
  const cites = SRC_LI.map(li => li.match(TITLED)).filter(Boolean);
  ok(cites.length === CF.papers, CF.papers + " Li et al. paper(s) with a title in the sources list (" + cites.length + ")");
  cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0 && /^https:\/\/doi\.org\//.test(c[2]), "sources: '" + c[3].slice(0, 50) + "' is the title in the publication list, with its DOI"));
}

// ---------------- text budget: every text element of the page's own prose stays short (one idea, about 35 words)
const prose = elements(OWN.replace(GENERATED, " ").replace(/<table class="lx-facts">[\s\S]*?<\/table>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/^---[\s\S]*?\n---\n/, " "));
prose.forEach(s => { const w = s.split(" ").length; ok(w <= 40 || approved(s), "text element of " + w + " words (40 at most unless one approved sentence): " + s.slice(0, 70)); });

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
