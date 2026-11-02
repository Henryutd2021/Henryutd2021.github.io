// test_06-three-jobs.js — Node tests for Lesson 6 (assets/learn/06-three-jobs.js), its data
// (assets/learn/data/06-three-jobs.json + town_year.json) and every number the lesson page states.
// Usage (from the site folder):  node _tests/learn/test_06-three-jobs.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/06-three-jobs.js"));
const year = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"));
const D = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/06-three-jobs.json"), "utf8"));
const QMD = fs.readFileSync(path.join(SITE, "learn/06-three-jobs.qmd"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/06-three-jobs.js"), "utf8");
const T = {}; D.tech.forEach(t => { T[t.key] = t; });

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const pct = (x, d) => (x * 100).toFixed(d === undefined ? 1 : d) + "%";

// ---------------- data: transcribed values, checked a second time by hand from the primary sources (read 2026-11-02)
{
  Object.keys(D.sources).forEach(k => ok((/^https:\/\//.test(D.sources[k].url) || (k === "pjm_elcc" && D.sources[k].url === null)) && D.sources[k].as_of, `source ${k} has a URL (PJM: held in the sidecar) and an as-of date`));
  const side = fs.readFileSync(path.join(SITE, "learn/_w1/06-three-jobs.yml"), "utf8");
  ok(side.indexOf("28-29-bra-elcc-class-ratings.pdf") >= 0, "sidecar holds the PJM URL and the allow-list request");
  // EIA Electric Power Monthly, Tables 6.07.A and 6.07.B, 2025 (final)
  const CF = { nuclear: 0.911, cc: 0.587, pk: 0.136, wind: 0.338, solar: 0.240, hydro: 0.344, geo: 0.659 };
  // PJM, ELCC Class Ratings for the 2028/2029 BRA
  const FIRM = { nuclear: 0.96, cc: 0.78, pk: 0.67, wind: 0.34, solar: 0.07, battery: 0.59, hydro: 0.35, dr: 0.91 };
  Object.keys(CF).forEach(k => ok(T[k].cf === CF[k], `${k}: capacity factor ${CF[k]}`));
  ["battery", "dr"].forEach(k => ok(T[k].cf === null, `${k}: no capacity factor (makes no energy)`));
  Object.keys(FIRM).forEach(k => ok(T[k].firm === FIRM[k] && T[k].firmLabel === pct(FIRM[k], 0), `${k}: firm share ${pct(FIRM[k], 0)}`));
  ok(T.geo.firm === null && T.geo.firmLabel === "not rated", "geothermal: no PJM class rating");
  const SR = D.steelman.storageRatings;
  ok(SR["4"] === 0.59 && SR["6"] === 0.68 && SR["8"] === 0.71 && SR["10"] === 0.78 && D.steelman.offshoreWind === 0.60, "storage 59/68/71/78%, offshore wind 60%");
  ok(SR["4"] === T.battery.firm, "4-hour storage rating = the battery card's firm share");
  ok(T.battery.rte === 0.82 && /82%/.test(D.sources.eia_rte.as_of), "battery: 82% round trip (EIA, 2019 data)");
  ok(T.dr.drMW === 33272 && T.dr.drShare === 0.065 && /33,272 MW/.test(D.sources.ferc_dr.as_of) && /6\.5%/.test(D.sources.ferc_dr.as_of), "demand response: 33,272 MW, 6.5% of peak (FERC, 2024 data)");
  ok(/79% with a second fuel/.test(T.pk.firmNote) && /10% with tracking/.test(T.solar.firmNote) && /offshore wind 60%/.test(T.wind.firmNote) && /71% for 8-hour, 78% for 10-hour/.test(T.battery.firmNote),
     "card notes: dual fuel 79%, tracking solar 10%, offshore 60%, 8/10-hour storage");
}

// ---------------- the reference sort and the scoring
{
  const J = M.JOBS;
  D.tech.forEach(t => {
    ok(J.every(j => ["yes", "partly", "no"].indexOf(t.jobs[j]) >= 0 && typeof t.why[j] === "string" && t.why[j].length > 10), `${t.key}: a level and a reason for every job`);
    ok(J.some(j => t.jobs[j] === "yes"), `${t.key}: does at least one job well`);
    ok(!J.every(j => t.jobs[j] === "yes"), `${t.key}: does not do every job well (no single winner)`);
    J.forEach(j => ok(t.why[j].split(/(?<=[.!?])\s+/).length <= 2, `${t.key}.${j}: reason is one or two sentences`));
  });
  const ref = M.referenceMarks(D.tech), r0 = M.score(ref, D.tech);
  ok(r0.agree === r0.clear && r0.differ === 0 && r0.clear + r0.partly === D.tech.length * 3, `reference sort: ${r0.agree} of ${r0.clear} clear cells, ${r0.partly} partly`);
  const none = M.score({}, D.tech), noCells = D.tech.reduce((n, t) => n + J.filter(j => t.jobs[j] === "no").length, 0);
  ok(none.agree === noCells && none.differ === r0.clear - noCells, "empty sort: agrees exactly on the 'no' cells");
  // toggling a 'partly' cell never changes the score; toggling a clear cell always does
  D.tech.forEach(t => J.forEach(j => {
    const m = JSON.parse(JSON.stringify(ref)); m[t.key][j] = !m[t.key][j];
    const r = M.score(m, D.tech);
    ok(t.jobs[j] === "partly" ? r.agree === r0.agree : r.agree === r0.agree - 1 && r.differ === 1, `score: toggling ${t.key}.${j}`);
  }));
  // the sort's evidence agrees with the numbers: every 'yes' for firm has a high rating or no rating; every 'no' for firm a low one
  D.tech.forEach(t => { if (t.firm != null && t.jobs.firm === "no") ok(t.firm < 0.4, `${t.key}: 'no' for firm matches a rating under 40%`); if (t.firm != null && t.jobs.firm === "yes") ok(t.firm >= 0.6, `${t.key}: 'yes' for firm matches a rating of 60% or more`); });
  D.tech.forEach(t => { if (t.cf == null) ok(t.jobs.energy === "no", `${t.key}: makes no energy, so 'no' for cheap energy`); });
  // the no-JS table lists exactly the 'yes' technologies of each job
  const fb = (QMD.match(/<div class="lx-fallback">[\s\S]*?<\/table>/) || [""])[0];
  const name = { nuclear: "nuclear", cc: "gas plants", pk: "gas peakers", wind: "wind", solar: "solar", battery: "batteries", hydro: "hydro", geo: "geothermal", dr: "demand response" };
  [["Cheap energy", "energy"], ["Firm capacity", "firm"], ["Flexibility", "flex"]].forEach(([label, j]) => {
    const row = (fb.match(new RegExp("<tr><td>" + label + "</td><td>[^<]*</td><td>([^<]*)</td>")) || [])[1] || "";
    D.tech.filter(t => t.jobs[j] === "yes").forEach(t => ok(row.toLowerCase().indexOf(name[t.key]) >= 0 || (t.key === "cc" && /gas plants/i.test(row)) || (t.key === "pk" && /gas (plants|peakers)/i.test(row)), `fallback: ${label} lists ${t.label}`));
  });
}

// ---------------- the calm spell in the Steelman card (computed from SPP's 2025 wind shape)
{
  const L = M.lull(year.wind, D.steelman.lullThreshold);
  let best = 0;
  for (let i = 0; i < year.wind.length; i++) { let n = 0; while (i + n < year.wind.length && year.wind[i + n] < D.steelman.lullThreshold) n++; best = Math.max(best, n); }
  ok(L.hours === best && L.end - L.start + 1 === L.hours, `lull: longest run below ${D.steelman.lullThreshold}/1000 = ${L.hours} h (brute force ${best})`);
  ok(year.wind.slice(L.start, L.end + 1).every(v => v < D.steelman.lullThreshold) && year.wind[L.start - 1] >= D.steelman.lullThreshold && year.wind[L.end + 1] >= D.steelman.lullThreshold, "lull: bounded by windier hours");
  const a = M.localDate(L.start), b = M.localDate(L.end);
  ok(L.hours === 67 && a.m === 7 && a.d === 30 && b.m === 8 && b.d === 1, "lull: 67 hours, 30 August to 1 September 2025");
  ok(D.steelman.lullThreshold === 250 && JS.indexOf("below a quarter of its best 2025 hour") >= 0, "Steelman text: 'a quarter' = 250/1000");
}

// ---------------- table order
{
  const cf = M.rank(D.tech, "cf"), firm = M.rank(D.tech, "firm");
  ok(cf[0] === "nuclear" && cf.slice(-2).sort().join() === "battery,dr", "rank by capacity factor: nuclear first, no-energy technologies last");
  ok(firm[0] === "nuclear" && firm[firm.length - 1] === "geo" && firm.indexOf("pk") < firm.indexOf("wind") && firm.indexOf("solar") === firm.length - 2, "rank by firm share: unrated last, peaker above wind, solar lowest rated");
}

// ---------------- every number with a unit in the page's prose matches the data file
{
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "")
    .replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<!-- learn:next:start[\s\S]*?learn:next:end -->/, "")
    .replace(/<!-- learn:footer:start[\s\S]*?learn:footer:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<table class="lx-facts">[\s\S]*?<\/table>/, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "")
    .replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/https?:\/\/[^\s"')]+/g, " ");
  const prose = strip(QMD);
  const P = new Set();
  D.tech.forEach(t => { if (t.cf != null) P.add(+(t.cf * 100).toFixed(1)); if (t.firm != null) P.add(Math.round(t.firm * 100)); });
  Object.values(D.steelman.storageRatings).forEach(v => P.add(Math.round(v * 100)));
  P.add(Math.round(T.battery.rte * 100));
  const rx = /(\d[\d,]*(?:\.\d+)?)\s*(MWh|MW|%)/g;
  let m, seen = 0;
  while ((m = rx.exec(prose))) { seen++; const v = +m[1].replace(/,/g, ""); ok(m[2] === "%" && P.has(v), `page states "${m[0]}" — in the data file`); }
  ok(seen >= 15, `page: ${seen} numbers with units checked`);
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  [pct(T.cc.cf), pct(T.pk.cf), T.solar.firmLabel, T.pk.firmLabel, T.battery.firmLabel, pct(T.battery.rte, 0), "33,272 MW", pct(T.dr.drShare)].forEach(s => ok(facts.indexOf(s) >= 0, `facts table: ${s}`));
  const rowsN = (facts.match(/<tr>/g) || []).length - 1, linked = (facts.match(/<td class="s"><a href="https:\/\/www\.(eia|ferc)\.gov/g) || []).length;
  ok(rowsN === 5 && linked === 4 && /PJM, ELCC Class Ratings for the 2028\/2029 Base Residual Auction/.test(facts), "facts table: four linked EIA/FERC rows and the PJM row cited as text");
  ok(QMD.indexOf("pjm.com/") < 0, "no link to pjm.com (not on the allow-list yet)");
}

// ---------------- scope: deny-list, the nuclear-plus-risk combination (sentence level), links on the allow-list
{
  const deny = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
    /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/, /artificial intelligence/i, /ChatGPT|Claude/];
  const page = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]);
  const vals = []; (function walk(o) { if (typeof o === "string") vals.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  const visible = [page.replace(/<[^>]+>/g, " ")].concat(lits, vals).join("\n");
  deny.forEach(r => ok(!r.test(visible), `scope: no ${r}`));
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  const RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  visible.split(/(?<=[.!?])\s+|\n+/).forEach(s => ok(!(NUC.test(s) && RISK.test(s)), `scope: nuclear term with a risk term in "${s.slice(0, 90)}"`));
  const ALLOW = /^(https:\/\/(www\.)?(eia\.gov|energy\.gov|ferc\.gov|nerc\.com|doi\.org|creativecommons\.org|opensource\.org)\/|mailto:|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  for (const h of QMD.matchAll(/href="([^"]+)"|\]\(([^)]+)\)/g)) { const u = h[1] || h[2]; ok(ALLOW.test(u), `link on the allow-list: ${u}`); }
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
