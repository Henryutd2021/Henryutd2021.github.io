// test_f01-five-scales.js — Node tests for F1 (assets/learn/f01-five-scales.js), its data
// (assets/learn/data/f01-five-scales.json with 01-power-energy.json, town_days.json, town.json) and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_f01-five-scales.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
const M = require(path.join(SITE, "assets/learn/f01-five-scales.js"));
const D = JSON.parse(rd("assets/learn/data/f01-five-scales.json"));
const P1 = JSON.parse(rd("assets/learn/data/01-power-energy.json"));
const TD = JSON.parse(rd("assets/learn/data/town_days.json"));
const TOWN = JSON.parse(rd("assets/learn/data/town.json"));
const YEAR = JSON.parse(rd("assets/learn/data/town_year.json"));
const QMD = rd("learn/f01-five-scales.qmd");
const JS = rd("assets/learn/f01-five-scales.js");
const PATH = rd("learn/path.yml");
const PJ = JSON.parse(rd("assets/learn/data/path.json"));
const CORE = require(path.join(SITE, "assets/learn/components/core.js"));
const SS = require(path.join(SITE, "assets/learn/components/scalestrip.js"));

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const sentences = s => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;
const words = s => s.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;

// Two kinds of check below. Source consistency: the page, the script and the data say the same thing (strings, counts,
// links). Model validation: a stated quantity is recomputed from its inputs (the home's average power, the town's peak
// hour, the unit key) and the assembled feedback is read as the reader sees it.

// ---------------- source consistency: the five scales (curriculum v2 §5.3) and the card rounds
{
  ok(D.scales.map(s => s.id).join() === "S0,S1,S2,S3,S4" && M.SCALES.join() === "S0,S1,S2,S3,S4", "five scales, S0 to S4, in order");
  D.scales.forEach(s => ["name", "place", "setting", "power", "question", "who", "what", "physics", "inputs", "outputs"].forEach(k => ok(typeof s[k] === "string" && s[k].length > 2, `${s.id}.${k} present`)));
  ok(/data-center campus \(a large load\)/.test(D.scales[3].setting), "S3: the data-center campus appears only as a load");
  ok(/running the regional grid is a different role/.test(D.scales[3].who) && /even when a city owns a utility/.test(D.rounds.who.cards[3].why), "S3: city planning and regional dispatch are different roles, even where a city owns a utility (review F1 #7)");
  ok(!/not power plants or wholesale markets/.test(JSON.stringify(D)), "S3: no claim that a city never owns plants or trades in markets");
  const allText = JSON.stringify(D) + JS + QMD;
  ok(!/never needs frequency|cannot do without/.test(allText), "physics: no claim that a home model never needs frequency (review F1 #1)");
  ok(!/whole synchronous grid|a regional grid is one synchronous network/.test(allText), "S2: an operator runs its region, not a whole synchronous grid (review F1 #4)");
  ok(!/(share|cover) the same land/.test(allText), "a city and a grid region overlap; they do not 'share the same land' (review F1 #6)");
  ok(!/\b(ISO|RTO)\b/.test(JSON.stringify(D.rounds) + QMD.replace(/<!--[\s\S]*?-->/g, "")), "no unexpanded ISO or RTO in the cards or on the page (review F1 #8)");
  D.rounds.exchange.cards.forEach(c => ok(/^[A-Z][a-z ]+ → [a-z ]+: /.test(c.text), `exchange.${c.id}: names its sender and receiver ("${c.text}")`));
  D.scales.forEach(s => ok(typeof s.gloss === "string" && words(s.gloss) <= 35 && sentences(s.gloss) <= 2, `${s.id}: one gloss line under the zoom, within budget`));
  ok(/\[\[microgrid\|/.test(D.scales[1].gloss) && /\[\[islanding\|/.test(D.scales[1].gloss) && /\[\[feeder\|/.test(D.scales[1].gloss), "S1's zoom frame defines microgrid, islanding and feeder at first use");
  ok(/\[\[local-optimum\|/.test(D.optimum) && /optimum/.test(JS.match(/function buildExplain[\s\S]*$/)[0]), "the live explain layer keeps a visible definition of a local optimum");
  ok(D.scales.map(s => s.power).join("|") === "W to MW|kW to MW|MW to GW|hundreds of MW|hundreds of GW", "power ranges as on lesson 1's scale strip");
  const L1 = rd("assets/learn/01-power-energy.js");
  ["W to MW", "kW to MW", "MW to GW", "hundreds of MW", "hundreds of GW"].forEach(r => ok(L1.indexOf('"' + r + '"') >= 0, `lesson 1 uses the same range "${r}"`));
  const ids = new Set(D.scales.map(s => s.id));
  Object.keys(D.rounds).forEach(k => {
    const R = D.rounds[k], bins = R.bins ? new Set(R.bins.map(b => b.id)) : ids;
    ok(R.cards.length === (k === "exchange" ? 6 : 5), `${k}: ${R.cards.length} cards`);
    R.cards.forEach(c => { ok(bins.has(c.bin), `${k}.${c.id}: bin ${c.bin} exists`); ok(sentences(c.why) <= 2 && c.why.length < 160, `${k}.${c.id}: reason in one or two short sentences`); });
    if (!R.bins) ok(new Set(R.cards.map(c => c.bin)).size === 5, `${k}: one card per scale`);
    const ref = {}; R.cards.forEach(c => { ref[c.id] = c.bin; });
    const g = M.grade(R.cards, ref); ok(g.right === g.total && g.placed === g.total, `${k}: the reference sort scores ${g.right} of ${g.total}`);
    ok(M.grade(R.cards, {}).placed === 0, `${k}: an empty sort places nothing`);
  });
  ok(D.rounds.exchange.cards.filter(c => c.bin === "down").length === 3 && D.rounds.exchange.cards.filter(c => c.bin === "up").length === 3, "exchange: three down, three up");
  // the who / what / physics cards say the same as the scale rows
  ["who", "what", "physics"].forEach(k => D.rounds[k].cards.forEach(c => ok(D.scales.find(s => s.id === c.bin)[k].split(/[ ,]+/).filter(w => w.length >= 5).some(w => c.text.indexOf(w) >= 0 || c.text.toLowerCase().indexOf(w.toLowerCase()) >= 0), `${k}.${c.id}: card shares words with ${c.bin}'s row`)));
  // the ladder of the explain layer
  const placed = {}; ["who", "what", "physics"].forEach(k => { placed[k] = {}; D.rounds[k].cards.forEach(c => { placed[k][c.id] = c.bin; }); });
  placed.who.who0 = "S1";
  const L = M.ladder(D, placed);
  ok(L.S0.who === false && L.S1.who === true && L.S4.physics === true, "ladder: a misplaced card shows on its own scale");
  ok(M.ladder(D, {}).S2.what === null, "ladder: unsorted cards show as not sorted");
  ok(D.predict.answer === "S2" && D.predict.options.length === 5 && D.apply.answer === "changes" && Object.keys(D.apply.feedback).length === 3, "predict and apply questions");
  // the apply question states that the old plan breaks the limit, and claims only what follows: operation must change,
  // the equipment may (review F1 #2)
  const ans = D.apply.options.find(o => o.value === "changes").label;
  ok(/below what that plan sends out/.test(D.apply.q) && /operation must change/.test(ans) && /may change/.test(ans) && /takes a new run/.test(D.apply.feedback.changes), "apply: the limit binds; operation must change, the cheapest equipment may");
  ok(/Modeler lesson \[\[lesson:m05-microgrid-size-and-run\|M5\]\] solves exactly this campus/.test(JS) && !/M5 \(upcoming\)/.test(JS) && D.lessons.S1.some(x => x.code === "M5" && x.note === "size and run a microgrid") && CORE.lessonRef(PJ, "M5").ready, "the campus question links M5, now live");
}

// ---------------- model validation: the real anchors of the zoom, recomputed
{
  const A = M.anchors({ "01_power_energy": P1, town_days: TD, town: TOWN });
  ok(Math.abs(A.homeKW - 10791 / 8760) < 1e-12 && A.homeText === "1.2 kW", `home: 10,791 kWh ÷ 8,760 h = ${A.homeKW.toFixed(3)} kW`);
  ok(P1.anchors.home_year.value === 10791 && /eia\.gov/.test(P1.anchors.home_year.url), "home year from EIA (lesson 1's data file)");
  ok(A.sppPeakGW === 54.4 && A.sppText === "54.4 GW" && TD.stats.peak_demand_GW === 54.4, "SPP 2025 peak 54.4 GW (EIA-930 statistics)");
  ok(A.usPeakMW === 759180 && A.usText === "759 GW" && /65864/.test(P1.anchors.us_peak.url), "Lower 48 record 759,180 MW = 759 GW (EIA)");
  ok(A.windMW === 150 && A.townPeakMW === 450, "Prairie Town: 150 MW wind farm, 450 MW scaling (illustrative, town.json)");
  // 450 MW is the highest hour of the town's illustrative year (SPP's 2025 shape × the scaling), not lesson 0's day (review F1 #3)
  const yearPeak = Math.max.apply(null, YEAR.demand) / 1000 * TOWN.scenarios.lesson0.demandPeakMW;
  ok(yearPeak === A.townPeakMW, `the town's highest hour of the year, recomputed from town_year.json: ${yearPeak} MW`);
  const L0 = TOWN.scenarios.lesson0, dayIdx = Math.round((Date.parse(L0.date + "T00:00:00Z") - Date.parse(YEAR.start_utc + "Z")) / 3600e3) + 1 - L0.utcOffsetHours;   // as grid-operator.js
  const dayPeak = Math.max.apply(null, YEAR.demand.slice(dayIdx, dayIdx + 24)) / 1000 * TOWN.scenarios.lesson0.demandPeakMW;
  ok(dayPeak < yearPeak - 50, `lesson 0's day peaks lower (${dayPeak.toFixed(0)} MW), so the page must say 'of the year'`);
  ok(/Prairie Town's highest hour of the year needs " \+ W\.townPeakMW/.test(JS) && /yearly peak: ' \+ W\.townPeakMW/.test(JS) && /450 MW is the highest hour of its illustrative year/.test(QMD), "page and zoom label 450 MW as the year's highest hour");
  ok(!/draws about|average draw/.test(JS + QMD), "EIA's figure is electricity bought per residential customer, not a home's total draw (review F1 #11)");
  // the unit key: each step is a factor of 1,000
  const UNITS = [["kW", 1e3, "W"], ["MW", 1e3, "kW"], ["GW", 1e3, "MW"]], key = D.scales[0].gloss.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1");
  UNITS.forEach(u => { ok(key.indexOf("1 " + u[0] + " = " + u[1].toLocaleString("en-US") + " " + u[2]) >= 0, `unit key: 1 ${u[0]} = 1,000 ${u[2]} (zoom)`); ok(QMD.indexOf("1 " + u[0] + " = " + u[1].toLocaleString("en-US") + " " + u[2]) >= 0, `unit key: 1 ${u[0]} = 1,000 ${u[2]} (no-JS page)`); });
  // the page states exactly these numbers with units
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/https?:\/\/[^\s"')]+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ");
  const prose = strip(QMD);
  const fmtN = v => v.toLocaleString("en-US");
  const allowed = new Set([A.homeText, A.sppText, A.usText, fmtN(P1.anchors.home_year.value) + " kWh", fmtN(A.usPeakMW) + " MW", "8,760 hours", yearPeak + " MW"]
    .concat(UNITS.map(u => "1 " + u[0]), UNITS.filter(u => u[2] !== "W").map(u => fmtN(u[1]) + " " + u[2])));
  const rx = /(\d[\d,]*(?:\.\d+)?)\s*(kWh|kW|MWh|MW|GW|hours)\b/g;
  let m, n = 0;
  while ((m = rx.exec(prose))) { n++; ok(allowed.has(m[1] + " " + m[2]), `page states "${m[0]}": from the data`); }
  ok(n >= 8, `${n} numbers with units on the page checked`);
  // the JS never hard-codes the anchors; it reads them from the data
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]).join("\n");
  ok(!/\b(1\.2|54\.4|759|150|450)\s*(kW|GW|MW)\b/.test(lits), "the script's text never hard-codes an anchor");
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  ok((facts.match(/<tr>/g) || []).length - 1 === 3 && /eia\.gov\/tools\/faqs/.test(facts) && /gridmonitor/.test(facts) && /65864/.test(facts), "facts table: three rows, each with its EIA source");
}

// ---------------- page structure, path.yml and the no-JS fallback
{
  const fm = QMD.match(/^---\n([\s\S]*?)\n---/)[1];
  const blk = PATH.slice(PATH.indexOf("id: f01-five-scales"), PATH.indexOf("id: f02-systems-and-map"));
  const sub = (blk.match(/subtitle: "([^"]+)"/) || [])[1];
  ok(sub && fm.indexOf('subtitle: "' + sub + '"') >= 0, "front-matter subtitle = path.yml subtitle");
  ok(/code: F1/.test(blk) && /minutes: 15/.test(blk) && /practice_minutes: 10/.test(blk) && /status: active/.test(blk) && /after: \[0\]/.test(blk) && /next: F2/.test(blk), "path.yml: F1, 15 + 10 min, active, after lesson 0, next F2");
  const fb = (QMD.match(/<div class="lx-fallback">[\s\S]*?<\/table>/) || [""])[0];
  D.scales.forEach(s => ok(fb.indexOf(s.id + " " + s.name) >= 0, `fallback lists ${s.id} ${s.name}`));
  ok(/1\.2 kW/.test(QMD.match(/<div class="lx-fallback">[\s\S]*?lx-hint/)[0]) && /759 GW/.test(QMD.match(/<div class="lx-fallback">[\s\S]*?lx-hint/)[0]), "fallback carries the key numbers");
  ok(/id="f1-explain"/.test(QMD) && /data-learn="five-scales"/.test(QMD) && /LX\.mount\("five-scales"/.test(JS), "mount points match");
  ok((QMD.match(/class="lx-qq"/g) || []).length === 9, "practice: three myths and six questions");
  // step texts: about 35 words, no Markdown bold (step text is not Markdown)
  const steps = [...JS.matchAll(/\{ text: "((?:[^"\\]|\\.)*)"/g)].map(x => x[1]);
  ok(steps.length >= 6, `${steps.length} literal step texts`);
  steps.forEach(t => { ok(words(t) <= 40 && sentences(t) <= 2, `step text within budget (two sentences, about 35 words): "${t.slice(0, 50)}…"`); ok(t.indexOf("**") < 0, "no ** in step text"); });
  ok(words(D.apply.q) <= 40 && sentences(D.apply.q) <= 2, "apply question within budget");
  // the assembled feedback, as the reader sees it after Check, for every score (review F1 #12)
  ["who", "what", "physics", "exchange", "battery"].forEach(k => { const n = D.rounds[k].cards.length; for (let r = 0; r <= n; r++) [null, "S2", "S0"].forEach(p => {
    const t = M.feedback(D, k, { right: r, total: n, placed: n }, p);
    ok(words(t) <= 45 && sentences(t.replace(/^\*\*[^*]+\*\*[^.]*\.\s*/, "")) <= (k === "who" ? 3 : 2), `${k} feedback at ${r} of ${n}: within budget (${words(t)} words)`);
  }); });
  ok(M.feedback(D, "who", { right: 5, total: 5, placed: 5 }, "S2").indexOf("Your prediction: right.") > 0 && M.feedback(D, "who", { right: 5, total: 5, placed: 5 }, "S0").indexOf("not quite") > 0, "who feedback names the reader's prediction");
  const A3 = M.anchors({ "01_power_energy": P1, town_days: TD, town: TOWN }), zd = M.zoomDone(A3); ok(words(zd) <= 45 && sentences(zd) <= 2 && zd.indexOf(A3.homeText) > 0 && zd.indexOf(A3.usText) > 0, `zoom done: ${words(zd)} words, with the two anchors`);
}

// ---------------- scope: deny-list, nuclear-plus-risk combination, data centers only as loads, links on the allow-list
{
  const deny = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
    /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/, /artificial intelligence/i, /ChatGPT|Claude/, /generated by/i];
  const page = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]);
  const vals = []; (function walk(o) { if (typeof o === "string") vals.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  const visible = [page.replace(/<[^>]+>/g, " ")].concat(lits, vals).join("\n");
  deny.forEach(r => ok(!r.test(visible), `scope: no ${r}`));
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  const RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  visible.split(/(?<=[.!?])\s+|\n+/).forEach(s => ok(!(NUC.test(s) && RISK.test(s)), `scope: nuclear term with a risk term in "${s.slice(0, 90)}"`));
  ok(!NUC.test(visible), "F1 names no nuclear technology at all");
  visible.split(/(?<=[.!?])\s+|\n+/).filter(s => /data[- ]cent/i.test(s)).forEach(s => ok(/load|one site|campus/i.test(s), `data centers only as loads: "${s.slice(0, 80)}"`));
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
  const ALLOW = /^(https:\/\/(www\.|docs\.)?(eia\.gov|energy\.gov|ferc\.gov|nerc\.com|nlr\.gov|nrel\.gov|doi\.org|ipcc\.ch)\/|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  let nl = 0;
  for (const h of own.matchAll(/href="([^"]+)"|\]\(([^)]+)\)/g)) { const u = (h[1] || h[2]).replace(/&amp;/g, "&"); nl++; ok(ALLOW.test(u), `link on the allow-list: ${u}`); }
  // the lessons per scale follow path.json (LX.ScaleStrip with LX.lessonRef): a live one links to its page, the rest are
  // named as upcoming with their note
  let nLive = 0;
  D.scales.forEach(sc => {
    const L = SS.lessonParts(D.lessons[sc.id], PJ, CORE.lessonRef);
    ok(L.live.length + L.upcoming.length === D.lessons[sc.id].length, `${sc.id}: every lesson listed is linked or named as upcoming`);
    L.live.forEach(x => { nLive++; ok(/^[0-9a-z-]+\.html$/.test(x.href) && fs.existsSync(path.join(SITE, "learn", x.href.replace(/\.html$/, ".qmd"))), `explain link ${x.href} (${x.label}) is a live page`); });
    L.upcoming.forEach(u => ok(!CORE.lessonRef(PJ, u.split(" ")[0]).ready, `${sc.id}: "${u}" is not live yet`));
  });
  ok(nLive >= 8 && SS.lessonParts(D.lessons.S2, PJ, CORE.lessonRef).live.some(x => x.label === "M2" && x.href === "m02-unit-commitment.html"), `${nLive} lessons per scale linked, M2 among them now that it is live`);
  ok(/LX\.ScaleStrip\(/.test(JS) && !/function ScaleStrip\s*\(/.test(JS) && !/f1s-/.test(JS + QMD) && !/--f1-s\d/.test(JS + QMD) && /--lx-scale-\d/.test(QMD),
    "F1 uses the shared LX.ScaleStrip and the --lx-scale-0 ... 4 colours, and keeps no copy of either");
  ok(/data\/path\.json/.test((QMD.match(/data-learn="five-scales"[^>]*/) || [""])[0]), "F1 loads path.json, so its lesson links follow what is live");
  ok(nl >= 8, `${nl} lesson links checked`);
}

// ---------------- the rendered page (only when _site holds a render newer than the source; run after quarto render)
{
  const html = path.join(SITE, "_site/learn/f01-five-scales.html");
  if (fs.existsSync(html) && fs.statSync(html).mtimeMs >= fs.statSync(path.join(SITE, "learn/f01-five-scales.qmd")).mtimeMs) {
    const H = fs.readFileSync(html, "utf8");
    ["1.2 kW", "54.4 GW", "759 GW", "759,180 MW", "1 GW = 1,000 MW", "450 MW is the highest hour of its illustrative year"].forEach(s => ok(H.indexOf(s) >= 0, `rendered page states "${s}"`));
    ok(!/never needs frequency|same land|whole synchronous grid|draws about/.test(H), "rendered page: none of the corrected wordings");
    ok(/data-learn="five-scales"/.test(H) && /id="f1-explain"/.test(H) && (H.match(/class="lx-qq"/g) || []).length === 9, "rendered page: mount points and the nine practice items");
  } else console.log("note: rendered page not checked (no _site render newer than the source)");
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
