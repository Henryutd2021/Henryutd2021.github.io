// test_a05-adequacy.js — Node tests for Analyst lesson A5 (assets/learn/a05-adequacy.js): the simulation is seeded and
// reproducible; weather blocks and outages follow their stated rules (outage share and repair time on a long run); the
// kept-hours shortcut is exact against a brute-force pass over all 8,760 hours, with a battery; accreditation is unique
// (EUE falls strictly through the matched value); the claims made on the page hold (at seed 2025, and where a card says so
// for any seed, over seeds 1 to 20); every number the page states matches the model (statements one by one and a
// unexpected-number scan); the drill's answers are right; the reference block and the no-JS table are what the model
// gives; and the page mounts and runs its eight cards on a stub document. Accreditation is the smallest perfect MW that
// matches: unique while the target is above zero (checked for every single block and every block in a row), a flagged
// boundary of the sample when it is zero. The number scan flags a number nobody accounted for; it does not prove what a
// number means (the statements do that).
// Usage (from the site folder):  node _tests/learn/test_a05-adequacy.js [--write]
//   --write rewrites the no-JS table in learn/a05-adequacy.qmd and the reference block of data/a05-adequacy.json
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/a05-adequacy.js"));
const PR = require(path.join(SITE, "assets/learn/components/profiles.js"));
const { mulberry32 } = require(path.join(SITE, "assets/learn/components/core.js"));
const DPATH = path.join(SITE, "assets/learn/data/a05-adequacy.json"), QPATH = path.join(SITE, "learn/a05-adequacy.qmd");
const read = f => JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data", f), "utf8"));
const Y25 = read("town_year.json"), Y24 = read("m03-capacity-expansion-2024.json"), CF = read("cf_targets.json");
let D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
const SRC = M.sources(D, Y25, Y24, CF, PR.townProfile);
const { fm } = M, pct = fm.pct, d3 = fm.d3, d2 = fm.d2, int = fm.int;
const IDS = D.adds.options.map(o => o.id);

// ---------------- the study at seed 2025, and the repeats (seeds 1..20) behind the page's counts
const ST = M.study(D, SRC, 2025), S = ST.S, B0 = ST.base;
const SOL3 = M.blocks(D, S, "solar"), MIX = M.mix(D, S);
const REP = [];
for (let s = D.sim.repeats.first; s <= D.sim.repeats.last; s++) {
  const Sx = M.simulate(D, SRC, s), b = M.evaluate(Sx, {}, true), mx = M.mix(D, Sx);
  REP.push({ seed: s, b, yw: M.yearsWith(b), mix: mx, one: Object.fromEntries(IDS.map(id => [id, M.evaluate(Sx, M.block(D, id)).lole])), solar3: M.blocks(D, Sx, "solar").rows.map(r => r.share) });
}
const reference = {
  about: "Results of the lesson's simulation of 500 resampled years at seed 2025: the grid as it is, each resource added alone, three blocks of solar and the solar-battery mix; repeats counts, over seeds 1 to 20, the runs in which solar counts for more with the battery than alone, and the battery with solar.",
  base: { lole: B0.lole, lolh: +B0.lolh.toFixed(4), eue: +B0.eue.toFixed(2), se: +ST.se.toFixed(5), yearsWith: ST.yearsWith, days: B0.days },
  single: Object.fromEntries(IDS.map(id => { const x = ST.single[id]; return [id, { lole: x.lole, eue: +x.eue.toFixed(2), mw: +x.mw.toFixed(2), share: +x.share.toFixed(4) }]; })),
  solarBlocks: SOL3.rows.map(r => +r.share.toFixed(4)),
  mix: { solar: +MIX.solar.toFixed(4), solarWithBattery: +MIX.solarWithBattery.toFixed(4), battery: +MIX.battery.toFixed(4), batteryWithSolar: +MIX.batteryWithSolar.toFixed(4) },
  repeats: { n: REP.length, solarUp: REP.filter(r => r.mix.solarWithBattery > r.mix.solar).length, batteryUp: REP.filter(r => r.mix.batteryWithSolar > r.mix.battery).length }
};
function staticTable() {
  const rows = D.adds.options.map(o => { const x = ST.single[o.id]; return `<tr><td>${o.label}</td><td>${o.detail}</td><td>${d3(x.lole)}</td><td>${int(x.mw)} MW</td><td>${pct(x.share)}</td></tr>`; });
  return [`<table class="a5-static" aria-label="Each 500 MW added to the Plains Grid: LOLE and accreditation, 500 simulated years, seed 2025">`,
    `<thead><tr><th scope="col">500 MW of</th><th scope="col">What it is</th><th scope="col">LOLE (days a year)</th><th scope="col">Firm MW at equal unserved energy</th><th scope="col">Accreditation</th></tr></thead>`,
    `<tbody>`, `<tr><td>Nothing added</td><td>–</td><td>${d3(B0.lole)}</td><td>–</td><td>–</td></tr>`, ...rows, `</tbody></table>`].join("\n");
}
const BLOCK = /(<!-- a5-table:start[^>]*-->\n)([\s\S]*?)(<!-- a5-table:end -->)/;
if (process.argv.includes("--write")) {
  D.reference = reference; fs.writeFileSync(DPATH, JSON.stringify(D, null, 2) + "\n");
  let q = fs.readFileSync(QPATH, "utf8"); q = q.replace(BLOCK, (m, a, b, c) => a + staticTable() + "\n" + c); fs.writeFileSync(QPATH, q);
  console.log("reference block and no-JS table written"); D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
}
const QMD = fs.readFileSync(QPATH, "utf8"), JS = fs.readFileSync(path.join(SITE, "assets/learn/a05-adequacy.js"), "utf8");
const PATHY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/a05-adequacy.yml"), "utf8");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || JSON.stringify(str)));

// ---------------- inputs
{
  const G = D.grid;
  ok(G.peakMW === 4000 && G.windMW === 3000 && G.solarMW === 1200 && M.capacity(D) === 4000, "grid: 4,000 MW peak, 4,000 MW of units, 3,000 MW wind, 1,200 MW solar");
  ok(D.sim.years === 500 && D.sim.seed === 2025 && D.sim.threshold === 1500 && D.adds.blockMW * D.adds.maxBlocks <= D.sim.threshold, "simulation: 500 years, seed 2025; the largest battery (3 blocks) is within the kept-hours threshold");
  ok(/data-src="\.\.\/assets\/learn\/data\/town_year\.json \.\.\/assets\/learn\/data\/m03-capacity-expansion-2024\.json \.\.\/assets\/learn\/data\/cf_targets\.json \.\.\/assets\/learn\/data\/a05-adequacy\.json \.\.\/assets\/learn\/data\/path\.json"/.test(QMD), "page: reads the five data files");
  ok(Y24.demand.length === 8760 && Y25.demand.length === 8760 && Math.max(...Y24.demand) === 1000 && Math.max(...Y25.demand) === 1000, "weather years: 8,760 hours each, demand over its own peak");
  // both years' wind and solar reach EIA's 2025 annual capacity factors (2024 scaled to 2025's, as in M3)
  SRC.forEach(s => { const cw = s.w.reduce((a, v) => a + v, 0) / 8760, cs = s.s.reduce((a, v) => a + v, 0) / 8760; ok(near(cw, CF.targets.wind.cf, 1e-6) && near(cs, CF.targets.solar.cf, 1e-6), `${s.year}: wind ${(100 * cw).toFixed(1)}%, solar ${(100 * cs).toFixed(1)}% (EIA 2025)`); });
  ok(D.criterion.lole === 0.1 && /Manual 20A/.test(D.criterion.source) && /section 1\.3 \(p\. 8\)/.test(D.criterion.source), "criterion: 0.1 days a year, PJM Manual 20A section 1.3");
  const P = Object.fromEntries(D.pjm.rows.map(r => [r.id, r.pct]));
  ok(P.dr === 91 && P.cc === 78 && P.ct === 67 && P.battery === 59 && P.wind === 34 && P.solar === 10 && P["solar-fixed"] === 7 && !/nuclear/i.test(JSON.stringify(D.pjm)), "PJM 2028/29 class ratings as published (no nuclear row)");
}

// ---------------- the simulation: seeded, weather blocks, outages
{
  const a = M.simulate(D, SRC, 2025, { years: 20 }), b = M.simulate(D, SRC, 2025, { years: 20 }), c = M.simulate(D, SRC, 2026, { years: 20 });
  const sig = s => s.years.map(y => y.idx.length + ":" + Array.from(y.m.slice(0, 50)).join(",")).join("|");
  ok(sig(a) === sig(b) && sig(a) !== sig(c), "seed: the same seed gives the same years, another seed others");
  ok(sig(M.simulate(D, SRC, 2025, { years: 20 })) === sig({ years: S.years.slice(0, 20) }), "seed: the first 20 years are the same whether 20 or 500 are drawn");
  // weather: each block is 7 days of 2025 or 2024, shifted by -1, 0 or +1 week, inside the year
  const k = M.simulate(D, SRC, 2025, { years: 4, keep: 3 }), F = k.full;
  ok(F.blocks.length === 53 && F.blocks.every(x => (x.year === 2024 || x.year === 2025) && [-1, 0, 1].indexOf(x.shift) >= 0), "weather: 53 blocks, each from 2024 or 2025, shifted by at most a week");
  let wbad = 0; const r = mulberry32(2025), map = new Int32Array(8760);
  for (let n = 0; n < 4; n++) {
    const bl = []; M.weather(r, map, bl); const tmp = new Float64Array(8761);
    D.units.forEach(u => { for (let i = 0; i < u.n; i++) M.outages(r, u, tmp); });
    if (n === 3) for (let t = 0; t < 8760; t++) { const y = map[t] >= 8760 ? 1 : 0, h = map[t] - y * 8760; if (!near(F.demand[t], 4000 * SRC[y].d[h], 1e-9) || !near(F.wind[t], 3000 * SRC[y].w[h], 1e-9)) wbad++; if (t % 24 !== h % 24) wbad++; }
  }
  ok(wbad === 0, "weather: demand, wind and sun come from the same source hour, at the same hour of day (" + wbad + " bad)");
  // the kept year equals the year inside the 500
  const S4 = M.simulate(D, SRC, 2025, { years: 4 });
  ok(Array.from(S4.years[3].m).join() === Array.from(S.years[3].m).join(), "keep: a rolled year is the same year as in the 500");
  // outages: a long run of one peaker is out 7% of the time, with spells of 24 hours on average
  const u = D.units[2], rr = mulberry32(99); let out = 0, spells = 0, hours = 0;
  for (let n = 0; n < 4000; n++) { const df = new Float64Array(8761); M.outages(rr, u, df); let a0 = 0, prev = false; for (let t = 0; t < 8760; t++) { a0 += df[t]; const o = a0 < 0; if (o) { out++; if (!prev) spells++; } prev = o; } hours += 8760; }
  ok(near(out / hours, u.forcedOutage, 0.003) && near(out / spells, u.repairHours, 1.5), `outages: out ${(100 * out / hours).toFixed(2)}% of the time, spells ${(out / spells).toFixed(1)} h (7%, 24 h)`);
  ok(M.geom(0, 0.5) === 1 && M.geom(0.75, 0.5) === 2 && M.geom(0.9, 0.1) === Math.ceil(Math.log(0.1) / Math.log(0.9)), "outages: geometric spell lengths, at least one hour");
}

// ---------------- the kept-hours shortcut is exact: brute force over all 8,760 hours of a few years
function brute(full, add, Sy) {
  const P = add.sP || 0, E = add.sE || 0, eta = add.eta || 0.85, dr = add.dr || 0, drH = add.drH || 4, C = add.C || 0;
  let e = E, days = 0, eue = 0, hrs = 0;
  for (let d = 0; d < 365; d++) {
    let lol = false, used = 0;
    for (let h = 0; h < 24; h++) {
      const t = d * 24 + h; let x = full.margin[t] + C + (add.wind || 0) * full.wind[t] / 3000 + (add.solar || 0) * full.solar[t] / 1200;
      if (add.ct) { const j = Array.prototype.indexOf.call(Sy.idx, t); x += j >= 0 ? Sy.ct[j] : 500; }
      if (x >= 0) { if (P > 0) e = Math.min(E, e + eta * Math.min(P, x)); continue; }
      if (P > 0 && e > 0) { const z = Math.min(P, -x, e); e -= z; x += z; }
      if (x < 0 && dr > 0 && used < drH) { used++; x = Math.min(0, x + dr); }
      if (x < -1e-9) { lol = true; eue -= x; hrs++; }
    }
    if (lol) days++;
  }
  return { days, eue, hrs };
}
{
  const with_ = ST.base.per, picks = [0, 1, 2]; for (let n = 0; n < 500 && picks.length < 7; n++) if (with_[n] > 0 && picks.indexOf(n) < 0) picks.push(n);
  const adds = [{}, M.block(D, "battery", 3), M.plus(M.block(D, "battery"), M.block(D, "solar", 2)), M.block(D, "dr"), { C: 120, wind: 500 }];
  let bad = 0, n0 = 0;
  picks.forEach(n => {
    const Sk = M.simulate(D, SRC, 2025, { years: n + 1, keep: n }), one = { N: 1, years: [S.years[n]], SRC: SRC, windW: null };
    adds.forEach(a => { const e1 = M.evaluate(one, a), e2 = brute(Sk.full, a, S.years[n]); n0++; if (e1.days !== e2.days || !near(e1.eue, e2.eue, 1e-3) || e1.hours !== e2.hrs) bad++; });
  });
  ok(bad === 0 && n0 === 35, `exact: the kept-hours pass equals a pass over all 8,760 hours in ${n0} checks (years ${picks.join(", ")}; with batteries up to 1,500 MW, demand response, wind) (${bad} bad)`);
  // peakers added through their own stream: brute force with all hours' extra availability
  const n = picks[3], Sk = M.simulate(D, SRC, 2025, { years: n + 1, keep: n }), one = { N: 1, years: [S.years[n]], SRC: SRC };
  ok(M.evaluate(one, { ct: 1 }).days === brute(Sk.full, { ct: 1 }, S.years[n]).days, "exact: the extra peakers' availability is read from their own stream");
}

// ---------------- accreditation: unique, inside the block, and the page's claims
{
  let bad = 0;
  IDS.forEach(id => {
    const a = M.accredit(D, S, {}, id), t = a.target, f = c => M.evaluate(S, { C: c }).eue;
    if (!(f(a.mw - 0.5) > t && f(a.mw + 0.5) < t && a.mw > 0 && a.mw < 500)) bad++;
    if (!(f(Math.round(a.mw) - 0.5) > t || f(Math.round(a.mw) + 0.5) < t)) bad++;
  });
  ok(bad === 0, "accreditation: EUE crosses the matched value inside half a MW of each rating, so each whole-MW rating is unique");
  // blocks in a row (step 6): unique above a zero target; at a zero target, the smallest perfect MW, flagged
  let bb = 0, zeros = [], adds0 = [];
  ["solar", "wind", "battery", "dr"].forEach(id => {
    const r = M.blocks(D, S, id);
    r.rows.forEach((x, b) => {
      const base = M.block(D, id, b), e = M.efc(S, base, M.block(D, id), 500), f = c => M.evaluate(S, M.plus(base, { C: c })).eue;
      if (Math.abs(e.mw - x.mw) > 1e-9 || e.zero !== x.zero) bb++;
      if (e.base <= e.target + 1e-9) { adds0.push(id + " " + (b + 1)); if (x.mw !== 0) bb++; return; }
      if (e.target > 1e-9) { if (!(f(x.mw - 0.5) > e.target && f(x.mw + 0.5) < e.target) || x.zero) bb++; }
      else { zeros.push(id + " " + (b + 1)); if (!(x.zero && f(x.mw - 0.5) > 0 && f(x.mw + 0.5) === 0 && f(x.mw + 100) === 0)) bb++; }
    });
  });
  ok(bb === 0 && zeros.join() === "battery 3" && adds0.join() === "dr 3", "accreditation of blocks in a row: unique where the target is above zero; battery block 3 leaves no shortfall (flagged: the smallest perfect MW, " + pct(M.blocks(D, S, "battery").rows[2].share) + "); demand response's block 3 adds nothing (" + bb + " bad)");
  ok(/smallest perfect MW that also leaves none: a limit of the sample, not proof of zero risk/.test(D.texts.ZERO_NOTE) && /smallest \$C\$/.test(QMD) && /not zero risk/.test(QMD), "accreditation: the page calls a zero-target rating a boundary of the sample");
  let mono = true; let zero = null; for (let c = 0; c < 900; c += 25) { const e0 = M.evaluate(S, { C: c }).eue, e1 = M.evaluate(S, { C: c + 25 }).eue; if (e0 > 0 && !(e1 < e0)) mono = false; if (e0 > 0 && e1 === 0 && zero === null) zero = c + 25; }
  ok(mono && zero > 500, "accreditation: EUE falls strictly as perfect MW are added, until it reaches zero (by " + zero + " MW)");
  const A = ST.single;
  ok(near(B0.lole, 0.228) && d3(2 * ST.se) === "0.049" && d2(B0.lolh) === "0.70" && int(B0.eue) === "108" && ST.yearsWith === 90 && B0.days === 114, "seed 2025: LOLE 0.228 ± 0.049, 0.70 hours, 108 MWh, 90 years with a shortfall (114 days)");
  ok(ST.hist.join() === "410,72,13,5", "seed 2025: years by shortfall days 410, 72, 13, 5");
  const se = M.season(B0.byMonth);
  ok(pct(se.summer / se.total) === "81%" && se.winter > se.other && Array.from(B0.byHour).indexOf(Math.max(...B0.byHour)) === 19, "seed 2025: 81% of shortfall hours in June-September, most in the hour starting 19:00, December-February most of the rest");
  ok(d3(A.ct.lole) === "0.012" && d3(A.battery.lole) === "0.014" && d3(A.dr.lole) === "0.048" && d3(A.wind.lole) === "0.160" && d3(A.solar.lole) === "0.200", "seed 2025: LOLE with 500 MW of each");
  ok(pct(A.ct.share) === "89%" && pct(A.battery.share) === "55%" && pct(A.dr.share) === "26%" && pct(A.wind.share) === "16%" && pct(A.solar.share) === "15%" && int(A.wind.mw) === "79", "seed 2025: accreditation 89%, 55%, 26%, 16%, 15%; wind 79 MW");
  ok(SOL3.rows.map(r => pct(r.share)).join() === "15%,6%,3%", "seed 2025: solar blocks 15%, 6%, 3%");
  ok(pct(MIX.solar) === "15%" && pct(MIX.solarWithBattery) === "31%" && pct(MIX.battery) === "55%" && pct(MIX.batteryWithSolar) === "78%", "seed 2025: solar 15% alone, 31% beside a battery; battery 55% alone, 78% beside more solar");
  ok(fm.rm(M.reserveMargin(D)) === "105.0%" && fm.rm(M.reserveMargin(D, 500)) === "117.5%" && fm.rm(M.reserveMargin(D, 500) - M.reserveMargin(D)) === "12.5%", "reserve margin: 105.0% at nameplate, 117.5% with 500 MW, 12.5 points");
  // the DR clause of step 5 (LOLE below wind's, rating below the battery's) holds at seed 2025
  ok(A.dr.lole < A.wind.lole && A.dr.share < A.battery.share, "seed 2025: demand response cuts more days than wind but rates below the battery");
  // the claims every seed must keep (a reader can change the seed in step 2): over seeds 1..20
  ok(REP.every(r => r.yw < 250 && Math.max(...r.b.per) >= 2), "any seed: most years have no shortfall day, and some have several (seeds 1-20)");
  ok(REP.every(r => { const s = M.season(r.b.byMonth), top = Array.from(r.b.byHour).indexOf(Math.max(...r.b.byHour)); return s.summer > s.total / 2 && top >= 17 && top <= 21 && s.winter > s.other; }), "any seed: summer evenings hold most shortfall hours; December-February most of the rest (step 3's answer and saw)");
  ok(REP.every(r => r.b.lole > 0.1 && r.one.wind > 0.1 && r.one.solar > 0.1 && r.one.ct <= 0.1 && r.one.battery <= 0.1), "any seed: the grid misses 0.1; wind or solar alone do not fix it; peakers and the battery do");
  ok(REP.every(r => r.solar3[0] > r.solar3[1] && r.solar3[1] > r.solar3[2]), "any seed: solar's blocks fall one after the other");
  ok(D.reference.repeats && D.reference.repeats.solarUp === reference.repeats.solarUp && D.reference.repeats.batteryUp === reference.repeats.batteryUp, `repeats: solar higher beside the battery in ${reference.repeats.solarUp} of 20, battery higher beside solar in ${reference.repeats.batteryUp} of 20 (data file up to date)`);
  ok(JSON.stringify(D.reference.base) === JSON.stringify(reference.base) && JSON.stringify(D.reference.single) === JSON.stringify(reference.single) && JSON.stringify(D.reference.mix) === JSON.stringify(reference.mix), "reference block: equals the model (run --write after a change)");
}

// ---------------- texts: the generated messages say what the numbers show, for any input
{
  const o = D.adds.options[2];
  ok(/Each block counts less than the one before/.test(M.blocksText(o, { rows: [{ share: 0.15 }, { share: 0.06 }, { share: 0.03 }] })) && /Not a steady fall here/.test(M.blocksText(o, { rows: [{ share: 0.55 }, { share: 0.6 }, { share: 0.1 }] })), "texts: the blocks message names a fall only when each block is lower");
  ok(/each raises the other's rating/.test(M.mixText({ solar: 0.1, solarWithBattery: 0.2, battery: 0.5, batteryWithSolar: 0.6 })) && !/each raises/.test(M.mixText({ solar: 0.1, solarWithBattery: 0.07, battery: 0.5, batteryWithSolar: 0.6 })), "texts: the mix message says 'each raises' only when both rise");
  const plain = t => t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "");
  const words = t => plain(t).split(/\s+/).filter(Boolean).length;
  const prompts = [...JS.matchAll(/\{ text: ("(?:[^\n])*?"),\n\s*build/g)].map(m => m[1].replace(/" \+ fm\.rm\(reserveMargin\(D\)\) \+ "/, "105.0%").replace(/^"|"$/g, ""));
  ok(prompts.length === 8, "steps: eight cards (" + prompts.length + ")");
  prompts.forEach((p, i) => { const s = (plain(p).match(/[.?!](?=\s+[A-Z(]|$)/g) || []).length; ok(words(p) <= 35 && s <= 2, `prompt ${i + 1}: ${words(p)} words, ${s} sentences (≤ 35, ≤ 2)`); });
  const msgs = [M.blocksText(o, { rows: [{ share: 0.15 }, { share: 0.06 }, { share: 0.03 }] }), M.mixText(MIX),
    "Most simulated years have no shortfall day, and a few have several. **Adequacy is about the rare bad year, so one year shows little.**",
    "LOLE 0.228 days a year, above the 1-in-10 criterion of 0.1. In 410 of 500 years nothing went short; the [[expected-unserved-energy|unserved energy]] averages 108 MWh a year.",
    "81% of the 349 shortfall hours fall in June to September, most often in the hour starting 19:00; December to February hold most of the rest.",
    "Peakers 89%, battery 55%, demand response 26%, wind 16%, solar 15%. Demand response removes many short days but less energy: long evenings outlast its 4 hours."];
  msgs.push(D.texts.ZERO_NOTE, D.texts.SE_NOTE, D.texts.SEED_NOTE, D.texts.SCREEN_NOTE, D.texts.PJM_SAW, D.texts.PJM_Q.weather, D.texts.PJM_Q.metric, D.texts.PJM_Q.same, ...D.adds.options.map(o => o.label + ": " + o.detail + "."));
  msgs.forEach((t, i) => ok(words(t) <= 36, `message or note ${i + 1}: ${words(t)} words (≤ 36)`));
  ok(!/\.join\("\. "\)/.test(JS) && /a5-opts/.test(JS), "step 4: one line per resource, not one long paragraph");
  ok(/one possible contributor/.test(D.texts.PJM_Q.weather) && /both rate by expected unserved energy/.test(D.texts.PJM_Q.metric) && /can lower a peaker's rating/.test(D.texts.PJM_SAW) && !/lower the peakers' rating;/.test(JS), "step 8: the PJM gap is not pinned on one cause; the question asks which assumption differs");
  ok(JS.indexOf('"Most simulated years have no shortfall day, and a few have several. **Adequacy is about the rare bad year, so one year shows little.**"') >= 0 && JS.indexOf('the [[expected-unserved-energy|unserved energy]] averages " + int(b.eue) + " MWh a year."') >= 0, "texts: the checked messages are the page's");
  ["capacity-accreditation", "equivalent-firm-capacity", "forced-outage-rate", "lolh", "resampled-weather"].forEach(id => ok(new RegExp("id: " + id + "\\n").test(SIDE) && JS.indexOf("[[" + id + "|") >= 0, "glossary: " + id + " defined in the sidecar and marked"));
  ["lole", "expected-unserved-energy", "reserve-margin", "monte-carlo-error", "standard-error", "random-seed"].forEach(id => ok((JS + JSON.stringify(D.texts)).indexOf("[[" + id + "|") >= 0, "glossary: " + id + " marked"));
}

// ---------------- the page at seed 2025: statements one by one
{
  has("4,000 MW of coal and gas units, 3,000 MW of wind and 1,200 MW of solar serve a 4,000 MW peak.");
  has("Over 500 simulated years the loss-of-load expectation is 0.228 days a year (± 0.049 from sampling alone), above the 1-in-10 criterion of 0.1. In 410 years nothing went short.");
  ok(/two \[\[standard-error\|standard errors\]\] of the average over 500 years/.test(D.texts.SE_NOTE) && /leaves out uncertainty in the weather history and the model's assumptions/.test(D.texts.SE_NOTE) && /LOLE is shown with its Monte Carlo error, which leaves out uncertainty in the weather history and the assumptions/.test(QMD) && !/another seed moves the LOLE about this much/.test(JS), "uncertainty: ± two standard errors of sampling, given the inputs; only LOLE carries one");
  has("81% of the shortfall hours fall in June to September.");
  has("Each 500 MW added, demand response counted as supply, lifts a nameplate reserve margin from 105.0% to 117.5%, yet LOLE ends anywhere from 0.012 to 0.200.");
  ok(/deliberately crude screen/.test(D.texts.SCREEN_NOTE) && /500 MW of demand response counts as 500 MW of supply against the gross 4,000 MW peak/.test(D.texts.SCREEN_NOTE), "screen: demand response counted as supply-equivalent MW, said so");
  has("- **Marginal, not average.** Each block is rated against the mix already present. An average can hide how the contribution of the next block differs.");
  ok(/\| \$f\$ \| forced outage rate/.test(QMD) && /\| \$r\$ \| average length of one outage/.test(QMD) && /\| \$w_t\$, \$s_t\$ \| wind and solar output per MW installed/.test(QMD) && /\| \$d_t\$ \| demand over its own yearly peak/.test(QMD) && /halve the range of MW again and again/.test(QMD), "formula box: every symbol defined with its unit; bisection explained");
  ok(d3(Math.min(...IDS.map(id => ST.single[id].lole))) === "0.012" && d3(Math.max(...IDS.map(id => ST.single[id].lole))) === "0.200", "fallback: LOLE from 0.012 to 0.200 over the five additions");
  has("the five resources range from 89% (peakers) to 15% (solar) of their 500 MW");
  has("Three blocks of solar in a row: 15%, then 6%, then 3%. Beside a 500 MW battery, solar's first block rates 31%.");
  has("Here 0.228 days a year came with 0.70 shortfall hours a year");
  has("In this grid the peakers rate 89% of their 500 MW and solar 15%");
  has("solar's third block rates 3% here, and its first block 31% beside a battery.");
  has("Each 500 MW added gives 117.5% at nameplate, yet LOLE ends at 0.012 with peakers and 0.200 with solar.");
  has("In 500 simulated years, 114 days had at least one hour of shortfall."); has("114 ÷ 500 = 0.228 shortfall days a year");
  has("500 MW of wind cuts unserved energy as much as 79 MW of perfect capacity would."); has("79 ÷ 500 ≈ 16%.");
  ok(/data-id="count" data-answer="b"[\s\S]{0,400}<li data-value="b">0\.228 days a year<\/li>/.test(QMD) && /data-id="share" data-answer="c"[\s\S]{0,400}<li data-value="c">16%<\/li>/.test(QMD), "quiz: answers point at the right options");
  ok(/data-id="hours" data-answer="myth"/.test(QMD) && /data-id="nameplate" data-answer="myth"/.test(QMD) && /data-id="fixed" data-answer="myth"/.test(QMD) && /data-id="margin" data-answer="fact"/.test(QMD), "myths: three myths, one fact");
  has("<td class=\"n\">0.228 days a year</td>");
  const m = QMD.match(BLOCK);
  ok(m && m[2].trim() === staticTable().trim(), "page: the no-JS table equals the model (run --write)");
  // sources: dated, with sections; resampled and illustrative labels
  ok(/Manual 20A: Resource Adequacy Analysis<\/a> \(PDF\), Rev\. 3, effective 24 June 2026\. The criterion: section 1\.3, p\. 8\. Outages simulated as a function of weather: section 2\.3, p\. 16\. Class ratings by EUE: sections 2\.4 and 2\.6, pp\. 20–21\./.test(QMD), "sources: Manual 20A with sections and pages");
  ok(/Weather is resampled, not observed/.test(QMD) && /resampled weather/.test(QMD) && /illustrative/.test(QMD) && /Units fail independently/.test(QMD), "data note: resampled weather, illustrative fleet, independent outages");
  ok(/A simulated year is not a forecast/.test(QMD), "data note: not a forecast");
  // budget of fallback, data-note and Go deeper elements
  const elems = [].concat((QMD.match(/<li>[\s\S]*?<\/li>/g) || []).filter(t => !/data-value=/.test(t) && !/<li>(PJM|NERC|EIA|Where this goes)/.test(t)), QMD.match(/^- \*\*[\s\S]*?$/gm) || []);
  const words = t => t.replace(/<[^>]+>/g, " ").replace(/\$[^$]*\$/g, "x").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
  const long = elems.filter(t => words(t) > 36).map(t => words(t) + ": " + t.replace(/<[^>]+>/g, "").slice(0, 60));
  ok(elems.length >= 14 && long.length === 0, "budget: " + elems.length + " fallback, data-note and Go deeper elements are 36 words or fewer: " + JSON.stringify(long));
  ok(/href="a09-hazards\.html"/.test(QMD) && /href="m03-capacity-expansion\.html"/.test(QMD) && /href="k05-probability-statistics\.html"/.test(QMD) && /href="03-balancing\.html"/.test(QMD) && /href="06-three-jobs\.html"/.test(QMD), "links: lessons 3, 6, K5, M3 and A9");
}

// ---------------- every number in the visible text is one the model or a source gives (whitelist scan)
{
  let body = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ")
    .replace(/^(- \*\*|\|).*$/gm, l => l.replace(/\$[^$\n]*\$/g, " "));   // math only in Go deeper bullets and tables, so a dollar amount never pairs with another
  const allowed = new Set(), add = v => allowed.add(String(v));
  staticTable().replace(/<[^>]+>/g, " ").match(/\d[\d,]*(?:\.\d+)?/g).forEach(add);
  ["0.228", "0.049", "0.1", "410", "81", "105.0", "117.5", "0.012", "0.200", "89", "15", "6", "3", "31", "0.70", "114", "79", "16", "34", "67", "59", "10", "7", "12.5", "4,000", "3,000", "1,200", "500", "2024", "2025", "2026", "2028", "29", "2029", "1.3", "2.3", "2.4", "2.6", "20", "21", "8", "16", "24", "4", "1", "2", "0.002", "100", "20A", "9", "930", "2.28"].forEach(add);
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "unexpected-number check: no number on the page is outside the model's, the sources' and the structural counts; unknown: " + unknown.join(" "));
  ok(found.length > 60, `the scan saw the page's numbers (${found.length})`);
}

// ---------------- the drill
{
  const { series } = require(path.join(SITE, "assets/learn/components/drill.js"));
  const items = series(M.drillItem, 42, 600), kinds = {};
  let bad = 0;
  items.forEach(it => {
    kinds[it.kind] = 1;
    const n = s => +s.replace(/,/g, "");
    if (it.kind === "lole") { const m = /In ([\d,]+) simulated years, (\d+) days/.exec(it.q); if (!near(it.answer, Math.round(n(m[2]) / n(m[1]) * 1000) / 1000)) bad++; }
    if (it.kind === "acc") { const m = /Adding (\d+) MW of a resource cuts unserved energy as much as (\d+) MW/.exec(it.q); if (!near(it.answer, Math.round(n(m[2]) / n(m[1]) * 1000) / 10)) bad++; }
    if (it.kind === "rm") { const m = /has ([\d,]+) MW installed for a ([\d,]+) MW peak/.exec(it.q); if (!near(it.answer, Math.round((n(m[1]) - n(m[2])) / n(m[2]) * 1000) / 10)) bad++; }
    if (!(it.tol > 0) || it.why.indexOf(it.answer.toFixed(it.kind === "lole" ? 3 : 1)) < 0) bad++;
  });
  ok(Object.keys(kinds).length === 3 && bad === 0, "drill: three kinds; every answer and worked line recomputed (" + bad + " bad)");
}

// ---------------- path.yml, scope
{
  ok(/id: a05-adequacy\n  code: A5\n  tier: analyst\n  form: cards\n  icon: dial\n  status: active\n  minutes: 30\n  practice_minutes: 30/.test(PATHY) && /after: \[3, 6, K5\]/.test(PATHY), "path.yml: A5 active, 30 + 30 minutes, after lessons 3, 6 and K5");
  const sub = (QMD.match(/^subtitle: "([^"]+)"/m) || [])[1], desc = (QMD.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(PATHY.indexOf('subtitle: "' + sub + '"') >= 0, "path.yml: subtitle equals the page's");
  ok(desc.split(/\s+/).length <= 35, `budget: the description is ${desc.split(/\s+/).length} words (≤ 35)`);
  const body = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "");
  ok(!/nuclear|reactor|\bSMR\b|data cent|learning/i.test(body + JS.replace(/\/\/.*$/gm, "") + JSON.stringify(D)), "scope: no nuclear, data-center or learning wording");
  ok(!/\b(Inc|LLC|Corp|Ltd)\b|Google|Amazon|Microsoft|Meta\b|NextEra|Tesla/.test(body + JS), "scope: no company names");
  ok(!/href="[^"]*(projects\/|research\.)/i.test(QMD), "scope: no project or Research links");
}

// ---------------- the page on a stub document: every card's action runs
{
  const vm = require("vm");
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.visible = () => false; E.LX.progress.guess = () => null; E.LX.progress.done = () => {};
  ["numanswer", "drill", "cards", "controls", "plot", "predict", "profiles", "adequacy"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "a05-adequacy") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: undefined, require: undefined, performance: E.window.performance, setTimeout: f => { f(); return 0; }, clearTimeout: () => {} };
  let threw = null;
  try {
    vm.runInNewContext(JS, mctx);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "a05-adequacy" }, E.body), live = E.LX.H("div", null, root);
    init(live, { town_year: Y25, m03_capacity_expansion_2024: Y24, cf_targets: CF, a05_adequacy: D, path: read("path.json") }, root);
  } catch (e) { threw = e.stack || e.message; }
  ok(!threw && demo && demo.cards, "stub: the page mounts" + (threw ? ": " + threw : ""));
  if (!threw && demo) try {
    const card = () => demo.cards.el, saw = () => { const a = card().querySelectorAll(".lx-saw"); return a.length ? a[a.length - 1].textContent : ""; };
    const btns = re => card().querySelectorAll("button").filter(b => re.test(b.getAttribute("aria-label") || b.textContent));
    demo.cards.go(0); const roll = btns(/Roll a year/)[0]; roll.click();
    ok(/1 of 3 years rolled/.test(card().textContent) && !/Most simulated years/.test(saw()), "stub: step 1 counts the rolls: 1 of 3");
    roll.click(); roll.click();
    ok(/Most simulated years have no shortfall day/.test(saw()) && /Simulated year\s*3/.test(card().textContent) && /3 of 3 years rolled/.test(card().textContent), "stub: step 1 rolls three years: " + card().textContent.slice(0, 200));
    demo.cards.go(1); btns(/Run 500 years/)[0].click();
    ok(/LOLE 0\.228 days a year, above the 1-in-10 criterion of 0\.1\. In 410 of 500 years nothing went short/.test(saw()) && /Seed 2025 · 500 years/.test(card().textContent) && /standard errors of the average over 500 years/.test(card().textContent) && /numbers the random draws/.test(card().textContent), "stub: step 2 runs 500 years at seed 2025, with what the ± and the seed mean: " + saw().slice(0, 80));
    demo.cards.go(2); btns(/Summer evenings/)[0].click();
    ok(/^81% of the 349 shortfall hours fall in June to September, most often in the hour starting 19:00/.test(saw()), "stub: step 3: " + saw().slice(0, 80));
    demo.cards.go(3); ["Gas peakers", "Wind farm", "Solar farm"].forEach(l => btns(new RegExp("^" + l + "$"))[0].click());
    ok(/LOLE runs from 0\.012 to 0\.200/.test(saw()) && /12\.5% added each time/.test(saw()) && card().querySelectorAll(".a5-opts li").length === 5 && /deliberately crude screen/.test(card().textContent), "stub: step 4: " + saw().slice(0, 90));
    demo.cards.go(4); btns(/Rate all five/)[0].click();
    ok(/^Peakers 89%, battery 55%, demand response 26%, wind 16%, solar 15%\. Demand response removes many short days/.test(saw()), "stub: step 5: " + saw().slice(0, 90));
    demo.cards.go(5); btns(/^Solar farm$/)[0].click();
    ok(/^Solar farm: 15%, then 6%, then 3%\. Each block counts less than the one before/.test(saw()) && !/limit of the sample/.test(card().textContent), "stub: step 6: " + saw().slice(0, 90));
    btns(/^4-hour battery$/)[0].click();
    ok(/^4-hour battery: 55%, then 37%, then 8%\./.test(saw()) && /8%\*/.test(card().textContent) && /\* No shortfall is left in the 500 years/.test(card().textContent), "stub: step 6's battery block 3 leaves no shortfall and says so: " + saw().slice(0, 60));
    demo.cards.go(6); btns(/Rate the pairs/)[0].click();
    ok(/^Solar 15% alone, 31% beside the battery; the battery 55% alone, 78% beside more solar\./.test(saw()) && new RegExp("in " + reference.repeats.solarUp + " of 20").test(card().textContent), "stub: step 7: " + saw().slice(0, 90));
    demo.cards.go(7); btns(/ties outages to the weather/)[0].click();
    ok(/A rating belongs to one grid, one mix and one model/.test(saw()) && /Gascombustionturbine67%89%/.test(card().textContent.replace(/\s+/g, "")), "stub: step 8 compares PJM's 67% with this lesson's 89%: " + (card().textContent.replace(/\s+/g, "").match(/Gascomb.{0,40}/) || ["none"])[0]);
    // a new seed changes the numbers and the cached ratings
    demo.cards.go(1); btns(/Draw another 500 years/)[0].click();
    ok(/Seed 1 · 500 years/.test(card().textContent) && new RegExp("LOLE " + d3(REP[0].b.lole).replace(".", "\\.")).test(saw()), "stub: Draw another 500 years draws seed 1's years: " + saw().slice(0, 40));
  } catch (e) { ok(false, "stub: the page test threw: " + (e && e.stack || e)); }
}

console.log(`a05-adequacy: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
