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
const QMD = rd("learn/f01-five-scales.qmd");
const JS = rd("assets/learn/f01-five-scales.js");
const PATH = rd("learn/path.yml");
const PJ = JSON.parse(rd("assets/learn/data/path.json"));
const CORE = require(path.join(SITE, "assets/learn/components/core.js"));
const SS = require(path.join(SITE, "assets/learn/components/scalestrip.js"));

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const sentences = s => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;

// ---------------- the five scales (curriculum v2 §5.3) and the card rounds
{
  ok(D.scales.map(s => s.id).join() === "S0,S1,S2,S3,S4" && M.SCALES.join() === "S0,S1,S2,S3,S4", "five scales, S0 to S4, in order");
  D.scales.forEach(s => ["name", "place", "setting", "power", "question", "who", "what", "physics", "inputs", "outputs"].forEach(k => ok(typeof s[k] === "string" && s[k].length > 2, `${s.id}.${k} present`)));
  ok(/data-center campus \(a large load\)/.test(D.scales[3].setting), "S3: the data-center campus appears only as a load");
  ok(/not power plants or wholesale markets/.test(D.scales[3].who), "S3: a city does not control power plants or wholesale markets (§5.3)");
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
  ok(/M5 \(upcoming\)/.test(JS) && D.lessons.S1.some(x => x.code === "M5" && x.note === "size and run a microgrid") && !CORE.lessonRef(PJ, "M5").ready, "the campus question points at M5, upcoming");
}

// ---------------- the real anchors of the zoom
{
  const A = M.anchors({ "01_power_energy": P1, town_days: TD, town: TOWN });
  ok(Math.abs(A.homeKW - 10791 / 8760) < 1e-12 && A.homeText === "1.2 kW", `home: 10,791 kWh ÷ 8,760 h = ${A.homeKW.toFixed(3)} kW`);
  ok(P1.anchors.home_year.value === 10791 && /eia\.gov/.test(P1.anchors.home_year.url), "home year from EIA (lesson 1's data file)");
  ok(A.sppPeakGW === 54.4 && A.sppText === "54.4 GW" && TD.stats.peak_demand_GW === 54.4, "SPP 2025 peak 54.4 GW (EIA-930 statistics)");
  ok(A.usPeakMW === 759180 && A.usText === "759 GW" && /65864/.test(P1.anchors.us_peak.url), "Lower 48 record 759,180 MW = 759 GW (EIA)");
  ok(A.windMW === 150 && A.townPeakMW === 450, "Prairie Town: 150 MW wind farm, 450 MW peak (illustrative, town.json)");
  // the page states exactly these numbers with units
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/https?:\/\/[^\s"')]+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ");
  const prose = strip(QMD);
  const allowed = new Set(["1.2 kW", "54.4 GW", "759 GW", "10,791 kWh", "759,180 MW", "8,760 hours"]);
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
  steps.forEach(t => { ok(t.split(/\s+/).length <= 45, `step text within budget: "${t.slice(0, 50)}…"`); ok(t.indexOf("**") < 0, "no ** in step text"); });
  ok(D.apply.q.split(/\s+/).length <= 45, "apply question within budget");
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

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
