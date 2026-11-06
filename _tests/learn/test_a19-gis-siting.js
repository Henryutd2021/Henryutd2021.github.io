// test_a19-gis-siting.js — Node tests for A19 (assets/learn/a19.js, the map model; assets/learn/a19-gis-siting.js, the
// lesson; data/a19-gis-siting.json; the page learn/a19-gis-siting.qmd):
//   - the region from first principles: noise in [0, 1), classes that exclude each other, homes in open cells, distances
//     to homes and built-up land against a brute-force search (the 3 km cap changes no result), setback shares that fall
//     as the setback grows, the 2 km region keeping every km²
//   - exclusions, scores, blocks and sites recomputed by hand for the shown sites; sites that do not overlap; the tie rule
//     and the uniqueness of every shown rank (no two of the 60 best blocks within 1e-9); the land needed from the sources
//   - least-cost paths against an independent Dijkstra (O(N²), no heap) on the same cost surface; the path's cost is the
//     sum of its steps; every least-cost path (ties included) shares the shown length and km through protected land;
//     the line's cost per km from NREL
//   - costs and energy recomputed (land, road, water, the capacity factors from cf_targets.json); random weights sum to 1
//   - words true for every input: each step's reveal over every exclusion set, setbacks from 100 to 1,500 m, weights,
//     within the text budget (about 35 words, three sentences)
//   - every number on the page (fallback, Go deeper, myths, quiz, practice, numbers to remember) from the model or the data
//   - scope: siting examples are solar, wind, a line and a data center only; no nuclear technology; data centers as loads
//     and buildings; no "AI"; links to learn pages and allowed domains only; the approved excerpt word for word
//   - path.yml entry, front matter, sidecar; the page on a stub document (mount, every demo state, the explain layer)
// Usage (from the site folder):  node _tests/learn/test_a19-gis-siting.js [--write]
//   --write rewrites the no-JS block between the a19-fallback markers and the data file's "reference" block (the
//   notebook's asserts).
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "a19-gis-siting";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const A19 = require(L("a19.js"));
const LS = require(L(ID + ".js"));
const DPATH = L("data/" + ID + ".json");
let RAW = fs.readFileSync(DPATH, "utf8");
const D = JSON.parse(RAW);
const CF = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8"), MJS = fs.readFileSync(L("a19.js"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const M = LS.model(D, CF), R = M.R, T = D.types, F = LS.fmt;

// ---------------- the reference block (the notebook's asserts) and the no-JS block: write (--write) or check
const r6 = v => Math.round(v * 1e6) / 1e6;
function reference() {
  const sum = A => { let t = 0; for (let n = 0; n < A.length; n++) t += A[n]; return t; };
  const cnt = A => { let t = 0; for (let n = 0; n < A.length; n++) if (A[n]) t++; return t; };
  const run = (type, over, o) => {
    const r = M.run(type, over, o);
    return { eligibleKm2: r6(r.X.areaKm2), blocks: r.BL.length,
      top: r.top.map((s, k) => Object.assign({ id: s.id, i: s.i, j: s.j, score: r6(s.score), cell: s.cell }, r.P ? { connect: Math.round(r.costs[k].connect), land: Math.round(r.costs[k].land), road: Math.round(r.costs[k].road), water: Math.round(r.costs[k].water), upfront: Math.round(r.costs[k].upfront), sub: r.costs[k].sub } : {}, r.costs[k].mwh ? { mwh: Math.round(r.costs[k].mwh) } : {})) };
  };
  const cor = p => { const c = LS.corridor(M, T.wind.setbackM, p); return { sub: c.route.sub, km: r6(c.route.km), cost: Math.round(c.route.cost), cells: c.route.cells.length, start: c.route.cells[0], end: c.route.cells[c.route.cells.length - 1] }; };
  const sh = M.shares("solar");
  return {
    note: "Written by node _tests/learn/test_a19-gis-siting.js --write from the page's model; the notebook rebuilds these numbers from the seed and asserts them.",
    layers: { sums: { slope: r6(sum(R.slope)), wind: r6(sum(R.wind)), sun: r6(sum(R.sun)), land: r6(sum(R.land)), dHome: r6(sum(R.dHome)), dRoad: r6(sum(R.dRoad)), dWater: r6(sum(R.dWater)) },
      counts: { water: cnt(R.water), flood: cnt(R.flood), built: cnt(R.built), ind: cnt(R.ind), prot: cnt(R.prot), subc: cnt(R.subc) }, homes: R.homes.length, newer: R.nNewer,
      cells: [0, 300, 615, 900, 1319].map(n => ({ n, slope: r6(R.slope[n]), wind: r6(R.wind[n]), sun: r6(R.sun[n]), land: r6(R.land[n]) })),
      fracSum: { m61: r6(sum(R.frac(0.061))), m220: r6(sum(R.frac(0.22))), m400: r6(sum(R.frac(0.4))) } },
    solar: run("solar"), wind: run("wind"), dc: run("dc"), dcAny: run("dc", { anySub: true }),
    windSetback: [220, 400, 800, 1500].map(sb => ({ setbackM: sb, eligibleKm2: r6(M.run("wind", { setbackM: sb }).X.areaKm2), blocks: M.run("wind", { setbackM: sb }).BL.length })),
    corridor: { forbid: cor("forbid"), allow: cor("allow") },
    shares: { draws: sh.draws, seed: sh.seed, wins: sh.wins, other: sh.other },
    coarse: run("solar", undefined, { coarse: true }), newer: run("solar", undefined, { newer: true })
  };
}
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing");
  return { from: a.index + a[0].length, to: b };
}
const BLOCK = () => LS.staticFallback(M);
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8"); const rg = between(q, "a19-fallback");
  q = q.slice(0, rg.from) + BLOCK() + "\n" + q.slice(rg.to); fs.writeFileSync(QPATH, q);
  const d = JSON.parse(RAW); d.reference = reference();
  RAW = JSON.stringify(d, null, 1) + "\n"; fs.writeFileSync(DPATH, RAW);
  console.log("no-JS block and reference block written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");
{ const rg = between(PAGE, "a19-fallback"); ok(PAGE.slice(rg.from, rg.to) === BLOCK() + "\n", "a19-fallback block is up to date (run with --write)"); }
ok(JSON.stringify(JSON.parse(RAW).reference) === JSON.stringify(reference()), "the data file's reference block is up to date (run with --write)");
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const TXT = text(PAGE);
const has = (s, msg) => ok(TXT.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (msg ? " (" + msg + ")" : ""));

// ---------------- 1 the region
const N = R.N;
ok(R.W === 44 && R.H === 30 && N === 1320 && R.area === 1, "44 × 30 cells of 1 km²");
{ let bad = 0; for (let x = 0; x < 44; x += 0.37) for (let y = 0; y < 30; y += 0.41) { const v = A19.noise(x, y, 5, 99); if (!(v >= 0 && v < 1)) bad++; } ok(bad === 0, "value noise stays in [0, 1)"); }
{ let bad = 0; for (let n = 0; n < N; n++) { if (R.water[n] && (R.flood[n] || R.built[n] || R.ind[n])) bad++; if (R.built[n] && R.ind[n]) bad++; if (R.prot[n] && (R.built[n] || R.ind[n])) bad++; } ok(bad === 0, "river, built-up land, industrial park and protected land never overlap"); }
ok(R.homes.every(h => { const n = Math.floor(h.y) * 44 + Math.floor(h.x); return !R.water[n] && !R.built[n] && !R.ind[n] && !R.prot[n]; }), "every home sits in an open cell");
ok(R.homes.length === 159 && R.nNewer === 36, "159 homes in the 2019 layer, 36 built since");
// distances against brute force, capped at 3 km
{
  const built = []; for (let n = 0; n < N; n++) if (R.built[n]) built.push(n);
  const brute = (px, py, homes) => { let b = Infinity; homes.forEach(h => { const d = Math.hypot(h.x - px, h.y - py); if (d < b) b = d; }); built.forEach(c => { const i = c % 44, j = (c - i) / 44, dx = Math.max(i - px, 0, px - i - 1), dy = Math.max(j - py, 0, py - j - 1), d = Math.hypot(dx, dy); if (d < b) b = d; }); return Math.min(3, b); };
  let bad = 0, worst = 0;
  for (let n = 0; n < N; n += 7) { const i = n % 44, j = (n - i) / 44, b = brute(i + 0.5, j + 0.5, R.homes); worst = Math.max(worst, Math.abs(b - R.dHome[n])); if (!near(b, R.dHome[n], 1e-12)) bad++;
    const sp = R.sp[n * 16 + 5], bs = brute(i + 1.5 / 4, j + 1.5 / 4, R.homes); if (!near(bs, sp, 1e-12)) bad++; }
  ok(bad === 0, "distances to homes and built-up land = a brute-force search (worst gap " + worst + ")");
  const ramps = Object.keys(T).map(k => T[k].ramps.homes[1]).concat([T.wind.setbackMaxM / 1000]);
  ok(Math.max(...ramps) < 3, "the 3 km cap lies beyond every ramp and setback (" + Math.max(...ramps) + " km)");
}
{ const f1 = R.frac(0.1), f2 = R.frac(0.5), f3 = R.frac(1.5); let bad = 0; for (let n = 0; n < N; n++) if (!(f1[n] >= f2[n] && f2[n] >= f3[n] && f1[n] <= 1 && f3[n] >= 0)) bad++; ok(bad === 0, "a larger setback never leaves more land"); }
{ const C2 = M.region({ coarse: true }); ok(C2.W === 22 && C2.H === 15 && C2.N * C2.area === N * R.area, "2 km cells: 22 × 15 cells keep all 1,320 km²");
  let s = 0; for (let n = 0; n < N; n++) s += R.slope[n]; let s2 = 0; for (let n = 0; n < C2.N; n++) s2 += C2.slope[n] * 4; ok(near(s, s2, 1e-6), "2 km slopes are the means of their four cells"); }
// the layer facts the page states
{
  let lo = Infinity, hi = -Infinity, wmax = -Infinity, wx = -1; for (let n = 0; n < N; n++) { lo = Math.min(lo, R.sun[n]); hi = Math.max(hi, R.sun[n]); if (R.wind[n] > wmax) { wmax = R.wind[n]; wx = n % 44; } }
  ok((100 * (hi - lo) / lo).toFixed(1) === "4.5" && wmax.toFixed(1) === "9.0" && wx < 12, "sunshine varies by 4.5%; wind peaks at 9.0 m/s in the west (x = " + wx + ")");
  let lmax = -Infinity, lq = 0; for (let n = 0; n < N; n++) if (R.land[n] > lmax) { lmax = R.land[n]; lq = R.q[n]; } ok(lq < D.city.built + 3, "land costs most next to the city");
}

// ---------------- 2 exclusions, scores, blocks, sites
const need = A19.need(D, "solar");
ok(near(150 * 1.29 * 4.2, 812.7, 1e-9) && near(need, 812.7 / 247.105, 1e-12) && need.toFixed(2) === "3.29", "solar arrays: 150 × 1.29 × 4.2 = 812.7 acres = 3.29 km²");
ok(A19.need(D, "wind") === 24.5 && A19.need(D, "dc") === 0.5, "wind: half of a 49 km² block; data center: 0.5 km²");
ok(near(49 * 100 / 150, 32.67, 0.01) && near(D.types.wind.directHaPerMW, 0.3), "wind block: 49 km² for 150 MW = 32.7 ha per MW (NREL: 34.5 ± 22.4)");
const r0 = M.run("solar");
{
  let bad = 0; const c = r0.c;
  for (let n = 0; n < N; n++) {
    const want = R.water[n] ? 1 : R.built[n] ? 2 : R.ind[n] ? 3 : R.subc[n] ? 7 : R.prot[n] ? 4 : R.flood[n] ? 5 : R.slope[n] > c.slopeMax ? 6 : 0;
    if (r0.X.reason[n] !== want) bad++;
    if (!(r0.X.buildable[n] >= 0 && r0.X.buildable[n] <= 1)) bad++;
  }
  ok(bad === 0, "every cell's exclusion reason, in order: river, built-up, industrial, substation, protected, flood, slope");
}
const solo = k => M.solo("solar", k, false), none = solo(null);
ok(Math.round(r0.X.areaKm2) === 954 && Math.round(100 * r0.X.share) === 72, "solar, default rules: 954 km², 72% of the region");
ok([["protected", 97], ["flood", 92], ["slope", 40], ["setback", 2]].every(([k, v]) => Math.round(none - solo(k)) === v), "on its own: protected land 97 km², flood zones 92, slopes 40, setbacks 2");
// a site recomputed by hand: buildable area, criterion means, score
function handScore(r, s) {
  let B = 0; const m = {}; r.CR.keys.forEach(k => { m[k] = 0; });
  for (let b = 0; b < s.k; b++) for (let a = 0; a < s.k; a++) { const n = (s.j + b) * r.R.W + s.i + a, bu = r.X.buildable[n]; B += bu; r.CR.keys.forEach(k => { m[k] += r.CR.values[k][n] * bu; }); }
  let t = 0, tw = 0; r.CR.keys.forEach(k => { t += r.c.weights[k] * m[k] / B; tw += r.c.weights[k]; });
  return { B, score: t / tw };
}
for (const type of ["solar", "wind", "dc"]) {
  const r = M.run(type);
  r.top.forEach(s => { const h = handScore(r, s); ok(near(h.score, s.score, 1e-12) && near(h.B, s.B, 1e-9) && h.B >= A19.need(D, type) - 1e-9, type + " site " + s.id + ": score and room recomputed by hand"); });
  const g = T[type].gap || 0;
  ok(r.top.every((a, x) => r.top.every((b, y) => x === y || !A19.overlap(a, b, g))), type + ": the five sites keep " + g + " cell(s) apart");
  const sc = r.top.map(s => s.score); ok(sc.every((v, x) => x === 0 || v <= sc[x - 1]), type + ": sites in score order");
  const best60 = r.top.ranked.slice(0, 60).map(b => b.score); let tie = 0; for (let x = 1; x < best60.length; x++) if (best60[x - 1] - best60[x] < 1e-9) tie++;
  ok(tie === 0, type + ": no two of the 60 best blocks tie (within 1e-9), so every shown rank is unique");
  // criteria in [0, 1] and the suitability map
  const suit = A19.suitability(r.R, D, type, r.c, r.X, r.CR); let bad = 0;
  for (let n = 0; n < N; n++) { r.CR.keys.forEach(k => { const v = r.CR.values[k][n]; if (!(v >= 0 && v <= 1)) bad++; }); if (r.X.reason[n] ? !isNaN(suit[n]) : !(suit[n] >= 0 && suit[n] <= 1)) bad++; }
  ok(bad === 0, type + ": scores within 0 to 1; suitability blank where excluded");
}
// the tie rule on a constructed tie
{ const a = { score: 0.5, i: 3, j: 2 }, b = { score: 0.5, i: 1, j: 4 }; const BL = [b, a]; const s = BL.slice().sort((x, y) => (x.score > y.score || (x.score === y.score && (x.j < y.j || (x.j === y.j && x.i < y.i)))) ? -1 : 1); ok(s[0] === a, "tie rule: equal scores, the more northern block first"); }

// ---------------- 3 least-cost paths: an independent Dijkstra, the path's sum, uniqueness
const base = D.costs.lineUSDperMile / 1.609344;
ok(Math.round(base) === 1003577 && D.costs.lineUSDperMile === 1615100 && D.costs.mult.wet === 1.8 && D.costs.mult.built === 1.2 && D.costs.mitigationUSDperMile === 38000, "NREL Table 11–12 figures: $1,615,100 a mile = $1,003,577 a km; wetland × 1.8, urban × 1.2; mitigation $38,000 a mile");
function slowDijkstra(surf, srcCells) {
  const dist = new Float64Array(N).fill(Infinity), done = new Uint8Array(N);
  srcCells.forEach(c => { dist[c] = 0; });
  for (;;) {
    let u = -1, best = Infinity; for (let n = 0; n < N; n++) if (!done[n] && dist[n] < best) { best = dist[n]; u = n; }
    if (u < 0) break; done[u] = 1;
    const ui = u % 44, uj = (u - ui) / 44;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const vi = ui + di, vj = uj + dj; if (vi < 0 || vj < 0 || vi >= 44 || vj >= 30) continue; const v = vj * 44 + vi; if (surf.c[v] === Infinity) continue;
      const nd = dist[u] + (surf.c[u] + surf.c[v]) / 2 * (di && dj ? Math.SQRT2 : 1); if (nd < dist[v]) dist[v] = nd; }
  }
  return dist;
}
for (const prot of ["forbid", "allow"]) {
  const surf = A19.surface(R, D, { protected: prot }), P = M.paths(R, prot, 150);
  const srcs = D.substations.filter(s => s.headroomMW >= 150).map(s => Math.floor(s.y) * 44 + Math.floor(s.x));
  const sd = slowDijkstra(surf, srcs); let bad = 0; for (let n = 0; n < N; n++) if (!(sd[n] === P.dist[n] || near(sd[n], P.dist[n], 1e-6))) bad++;
  ok(bad === 0, "least-cost distances (" + prot + ") = an independent Dijkstra over all 1,320 cells");
  const c = LS.corridor(M, T.wind.setbackM, prot), cells = c.route.cells;
  let tot = 0, km = 0;
  for (let x = 0; x + 1 < cells.length; x++) {
    const a = cells[x], b = cells[x + 1], diag = (a % 44 !== b % 44) && (Math.floor(a / 44) !== Math.floor(b / 44)), len = diag ? Math.SQRT2 : 1;
    tot += (surf.c[a] + surf.c[b]) / 2 * len; km += len;
  }
  ok(near(tot, c.route.cost, 1e-6) && near(km, c.route.km, 1e-9), "the " + prot + " path's cost and length are the sums of its steps");
  // ties: several paths may cost the same (diagonal and straight steps in another order); every least-cost path must
  // share what the page shows: its cost (the distance), its length and its km through protected land, to the shown digit
  const tight = (u, v, di, dj) => Math.abs(P.dist[v] + (surf.c[u] + surf.c[v]) / 2 * (di && dj ? Math.SQRT2 : 1) - P.dist[u]) < 1e-6;
  const memo = {};
  function span(u) {   // [min, max] of km and of protected km over every least-cost path from u to a substation
    if (memo[u]) return memo[u];
    if (P.dist[u] === 0) return (memo[u] = [0, 0, 0, 0]);
    const ui = u % 44, uj = (u - ui) / 44; let out = [Infinity, -Infinity, Infinity, -Infinity];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const vi = ui + di, vj = uj + dj; if (vi < 0 || vj < 0 || vi >= 44 || vj >= 30) continue; const v = vj * 44 + vi;
      if (P.dist[v] === Infinity || !(P.dist[v] < P.dist[u]) || !tight(u, v, di, dj)) continue;
      const len = di && dj ? Math.SQRT2 : 1, pr = ((surf.cls[u] === "protected" ? 0.5 : 0) + (surf.cls[v] === "protected" ? 0.5 : 0)) * len, s = span(v);
      out = [Math.min(out[0], s[0] + len), Math.max(out[1], s[1] + len), Math.min(out[2], s[2] + pr), Math.max(out[3], s[3] + pr)]; }
    return (memo[u] = out);
  }
  const sp = span(c.site.cell);
  ok(F.km(sp[0]) === F.km(sp[1]) && F.km(sp[2]) === F.km(sp[3]) && F.km(sp[0]) === F.km(c.route.km), "every least-cost " + prot + " path shares the shown length (" + F.km(sp[0]) + "–" + F.km(sp[1]) + ") and km through protected land (" + F.km(sp[2]) + "–" + F.km(sp[3]) + ")");
  ok(cells[0] === c.site.cell && srcs.indexOf(cells[cells.length - 1]) >= 0, "the " + prot + " path runs from wind site A to a substation with room");
  ok(near(Object.values(c.route.parts).reduce((a, b) => a + b, 0), c.route.km, 1e-9), "the land types along the " + prot + " path add up to its length");
}
const cF = LS.corridor(M, 220, "forbid"), cA = LS.corridor(M, 220, "allow");
ok(cF.route.sub === "S3" && F.km(cF.route.km) === "13.7 km" && F.musd(cF.route.cost) === "$14.0 million" && F.km(cA.route.km) === "10.2 km" && F.musd(cA.route.cost) === "$10.7 million" && F.km(cA.route.parts.protected) === "3.4 km" && !cF.route.parts.protected,
  "corridor: forbidden 13.7 km, $14.0 million; allowed 10.2 km, $10.7 million, 3.4 km through protected land");
ok(F.musd(cF.route.cost - cA.route.cost) === "$3.3 million", "forbidding protected land adds $3.3 million");

// ---------------- 4 costs, energy, random weights
{
  const r = M.run("wind"), s = r.top[0], k = r.costs[0];
  ok(near(k.land, 150 * 0.3 * 2.47105 * s.land, 1e-6) && near(k.road, R.dRoad[s.cell] * 600000, 1e-9) && near(k.upfront, k.connect + k.road + k.land, 1e-6), "wind site A's costs: land (0.3 ha per MW), access road, line");
  ok(near(k.cf, CF.targets.wind.cf + 0.07 * (s.res - R.windMean), 1e-12) && near(k.mwh, 150 * k.cf * 8760, 1e-6), "wind energy: EIA's 33.8% at the region's mean, 7 points per m/s");
  const rs = M.run("solar"), ss = rs.top[0], ks = rs.costs[0];
  ok(near(ks.cf, CF.targets.solar.cf * ss.res / R.sunMean, 1e-12) && near(ks.land, 812.7 * ss.land, 1e-6), "solar energy in proportion to sunshine (EIA's 24.0% at the mean); land for 812.7 acres");
  const rd = M.run("dc"), kd = rd.costs[0];
  ok(near(kd.water, R.dWater[rd.top[0].cell] * 1500000, 1e-9) && near(kd.land, 0.5 * 247.105 * rd.top[0].land, 1e-6) && kd.mwh === undefined, "data center: water main, 0.5 km² of land, no energy column");
  ok(rs.costs.every(x => x.upfront === x.connect + x.road + x.water + x.land) && rs.costs.every(x => x.mwh > 0), "up front and a year's energy are kept apart, never added");
  ok(F.musd(r.costs[0].upfront) === "$15.3 million" && F.musd(r.costs[4].upfront) === "$11.5 million" && r.top[0].score > r.top[4].score, "myth: wind site A $15.3 million, site E $11.5 million, A scores higher");
}
{
  const rng = require(L("components/core.js")).mulberry32(19); let bad = 0;
  for (let d = 0; d < 200; d++) { const u = [rng(), rng(), rng(), rng()].sort((a, b) => a - b), w = [u[0], u[1] - u[0], u[2] - u[1], u[3] - u[2], 1 - u[3]]; if (!near(w.reduce((a, b) => a + b, 0), 1, 1e-12) || w.some(x => x < 0)) bad++; }
  ok(bad === 0, "random weights: five gaps of sorted uniforms, each ≥ 0, summing to 1");
  const sh = M.shares("solar"); ok(Object.values(sh.wins).reduce((a, b) => a + b, 0) + sh.other === 500, "the 500 draws are all counted");
  ok(F.pct(sh.wins.A / 500) === "25%" && F.pct(sh.other / 500) === "61%", "default site A wins 25%; outside the top five 61%");
}
// newer homes next to solar site A; 2 km cells
{
  const Ln = LS.limits(M), A = Ln.A, Rn = M.region({ newer: true });
  const close = Rn.homes.filter(h => h.newer && h.x > A.i - 1 && h.x < A.i + A.k + 1 && h.y > A.j - 1 && h.y < A.j + A.k + 1).length;
  ok(Ln.stillHas && !Ln.nA && close >= 1, "with the homes built since 2019, solar site A keeps its room but leaves the top five; " + close + " new home(s) within 1 km of it");
  ok(Math.round(Ln.coarse.X.areaKm2) === 889 && Math.round(Ln.fine.X.areaKm2) === 954, "2 km cells: 889 km² against 954");
}

// ---------------- 5 words: true and short for every input
const plain = t => String(t).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const nWords = t => plain(t).split(" ").filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").split(/(?<=[.?!])\s+(?=[A-Z“$0-9−+])/).filter(x => /[A-Za-z]/.test(x)).length;
const budget = (t, where, w, n) => { if (!(nWords(t) <= w && nSent(t) <= n)) ok(false, where + ": " + nWords(t) + " words, " + nSent(t) + " sentences: " + plain(t).slice(0, 90)); };
const stepTexts = [...JS.matchAll(/\n      \{ text: (".*?"),\n        build/g)].map(m => m[1]);
ok(stepTexts.length === 8, "eight step cards (" + stepTexts.length + ")");
const filled = stepTexts.map(s => s.replace(/" \+ ([^+]+?) \+ "/g, (m, e) => "xx"));
filled.forEach((s, i) => budget(s, "step " + (i + 1) + " text", 36, 3));
budget(LS.s1Saw(M), "step 1 reveal", 36, 2);
ok(LS.s1Saw(M).indexOf("up to **9.0 m/s**") > 0 && LS.s1Saw(M).indexOf("**4.5%**") > 0, "step 1 reveal: 9.0 m/s, 4.5%");
const combos = []; for (let b = 0; b < 32; b++) combos.push({ ex: { protected: !!(b & 1), flood: !!(b & 2), slope: !!(b & 4), setback: !!(b & 8) }, strict: !!(b & 16) });
combos.forEach(cmb => {
  const st = { ex: cmb.ex, strict: cmb.strict, w: LS.weightsOf(D, "solar"), sb: 220 };
  const t2 = LS.s2Saw(M, st), r = M.run("solar", Object.assign({ exclusions: cmb.ex }, LS.strictOver(D, "solar", cmb.strict)));
  budget(t2, "step 2 reveal " + JSON.stringify(cmb), 36, 2);
  if (t2.indexOf("**" + F.km2(r.X.areaKm2) + "**") < 0) ok(false, "step 2 reveal states the land left for " + JSON.stringify(cmb));
  budget(LS.s3Saw(M, st), "step 3 reveal " + JSON.stringify(cmb), 36, 3);
  budget(LS.s8Saw(M, cmb.ex, cmb.strict), "step 8 reveal " + JSON.stringify(cmb), 36, 2);
  const L8 = LS.limits(M, cmb.ex, cmb.strict), t8 = LS.s8Saw(M, cmb.ex, cmb.strict);
  if (L8.A && (L8.stillHas ? /loses its room/.test(t8) : !/loses its room/.test(t8))) ok(false, "step 8 reveal's fate of site A is true for " + JSON.stringify(cmb));
  LS.limitRows(M, st).forEach(row => { budget(row.here, "limit row " + row.key, 30, 2); budget(row.study, "limit row study " + row.key, 25, 2); });
});
{ const rng = require(L("components/core.js")).mulberry32(7);
  for (let d = 0; d < 40; d++) { const w = {}; T.solar.criteria.forEach(k => { w[k] = 5 * Math.floor(rng() * 21); }); if (!Object.values(w).some(v => v > 0)) continue;
    const st = { ex: T.solar.exclusions, strict: false, w, sb: 220 }, t3 = LS.s3Saw(M, st), r = M.run("solar", LS.solarOver(D, st));
    budget(t3, "step 3 reveal " + JSON.stringify(w), 36, 3);
    if (r.top[0] && t3.indexOf("**" + F.sc(r.top[0].score) + "**") < 0) ok(false, "step 3 reveal states site A's score for " + JSON.stringify(w)); } }
budget(LS.s4Saw(M), "step 4 reveal", 36, 2);
for (let sb = 100; sb <= T.wind.setbackMaxM; sb += 20) {
  const t5 = LS.s5Saw(M, sb), r = M.run("wind", { setbackM: sb });
  budget(t5, "step 5 reveal at " + sb + " m", 36, 2);
  if (sb !== 220 && t5.indexOf("**" + F.km2(r.X.areaKm2) + "**") < 0) ok(false, "step 5 reveal states the land left at " + sb + " m");
  if (sb % 100 === 0) { const t6 = LS.s6Saw(M, sb); budget(t6, "step 6 reveal at " + sb + " m", 38, 2); const f = LS.corridor(M, sb, "forbid"), a = LS.corridor(M, sb, "allow");
    if (!(f && a) || t6.indexOf(F.musd(f.route.cost)) < 0 || f.route.cost < a.route.cost - 1e-6) ok(false, "step 6 reveal true at " + sb + " m (forbidding never makes the line cheaper)");
    if (a && (a.route.parts.protected > 0) !== /through protected land/.test(t6)) ok(false, "step 6 reveal says 'through protected land' only when the allowed line crosses it, at " + sb + " m"); }
}
ok(/\$38,000 a mile barely deters it/.test(LS.s6Saw(M, 220)), "step 6 reveal at 220 m: the mitigation cost barely deters the line");
budget(LS.s7Saw(M), "step 7 reveal", 40, 2);
ok(/site B would use North \(S2\), which has only 180 MW spare/.test(LS.s7Saw(M)) && LS.s7Saw(M).indexOf(F.musd(M.run("dc").costs[0].upfront)) > 0, "step 7 reveal: with any substation, B uses North (S2) with 180 MW spare");
const HX = LS.hints(M); Object.keys(HX).forEach(k => budget(HX[k], "hint " + k, 35, 2));
ok(/function keep\(k, v\) \{[^\n]*setTimeout\(buildExplain/.test(JS), "every saved setting refreshes the explain layer");

// ---------------- 6 every number on the page
has("Prairie City is fictional; its numbers are illustrative.");
has("solar arrays take 4.2 acres per MW of panels, single-axis tracking, with 1.29 MW of panels per MW of inverters");
ok(T.solar.acresPerMWdc === 4.2 && T.solar.dcac === 1.29, "data: 4.2 acres per MW (DC), DC:AC 1.29");
has("wind farms spread over 34.5 ha per MW");
has("150 × 1.29 × 4.2 = 812.7 acres = 3.29 km² of a 4 km² block");
has("$1,003,577 per km on farmland, × 1.8 in flood zones");
has("1 at 0 km, 0 from 15 km (solar)"); ok(T.solar.ramps.sub[0] === 0 && T.solar.ramps.sub[1] === 15, "solar ramp near a substation: 0 to 15 km");
has("default solar weights 20, 35, 15, 20, 10"); ok(["res", "sub", "road", "land", "homes"].map(k => T.solar.weights[k]).join(",") === "20,35,15,20,10", "data: default solar weights");
has("land price falls from 1 at $2,500 an acre to 0 at $15,000"); ok(T.solar.ramps.land.join(",") === "2500,15000", "data: the land ramp");
has("NREL's $1,615,100 a mile divided by 1.609344 km a mile");
has("checked at 16 points"); ok(D.grid.sub * D.grid.sub === 16, "16 setback points per cell");
has("about 67,000 cells of 11.5 km × 11.5 km");
has("Wind site A costs $15.3 million up front, site E $11.5 million.");
has("Priced at $38,000 a mile, the new line crossed 3.4 km of protected land");
has("sunshine differs by only 4.5% across the 44 km region");
has("this map checks 16 points in each cell, and NREL's supply curves check setbacks on 90 m cells");
has("In step 8, 36 homes built since 2019 push solar site A out of the top five.");
// practice, recomputed
{
  const s = [0.6, 0.9, 1.0, 0.4, 0.5], w1 = [20, 35, 15, 20, 10], w2 = [10, 10, 5, 5, 70];
  const dot = (a, b) => a.reduce((t, v, k) => t + v * b[k], 0) / b.reduce((t, v) => t + v, 0);
  ok(near(100 * dot(s, w1), 71.5, 1e-9) && near(100 * dot(s, w2), 57, 1e-9), "practice 1–2: 71.5 and 57");
  has("= 71.5 of 100"); has("(6 + 9 + 5 + 2 + 35) ÷ 100 = 57 of 100");
  ok(w2.join(",") === ["res", "sub", "road", "land", "homes"].map(k => D.presets.neighbours[k]).join(","), "practice 2 uses the neighbours' preset");
  ok(near(200 * 1.3 * 4.2, 1092, 1e-9) && (1092 / 247.105).toFixed(2) === "4.42", "practice 3: 1,092 acres = 4.42 km²"); has("200 × 1.3 × 4.2 = 1,092 acres, about 4.42 km²");
  ok(100 * 34.5 === 3450 && 100 * 0.3 === 30 && 30 / 3450 < 0.01, "practice 4: 3,450 ha, 30 ha, under 1%"); has("3,450 ha (34.5 km²) in all; 30 ha for good, under 1%");
  ok((40 * Math.PI * 0.16).toFixed(1) === "20.1" && (40 * Math.PI * 0.22 * 0.22).toFixed(1) === "6.1", "practice 5: 20.1 and 6.1 km²"); has("40 × π × 0.4² = 20.1 km² against 40 × π × 0.22² = 6.1 km²");
  ok((base * (8 + 4 * 1.8) / 1e6).toFixed(1) === "15.3", "practice 6: $15.3 million"); has("$1,003,577 a km × (8 + 4 × 1.8) = $15.3 million");
  // practice 7: Dijkstra on the 3 × 3 grid, side-by-side moves only
  const G = [[1, 1, 4], [1, 5, 1], [2, 1, 1]], dist = [[Infinity, Infinity, Infinity], [Infinity, Infinity, Infinity], [Infinity, Infinity, Infinity]], done = {};
  dist[0][0] = 0;
  for (;;) { let u = null, b = Infinity; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!done[r + "," + c] && dist[r][c] < b) { b = dist[r][c]; u = [r, c]; } if (!u) break; done[u.join(",")] = 1;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const r = u[0] + dr, c = u[1] + dc; if (r < 0 || c < 0 || r > 2 || c > 2) return; const nd = dist[u[0]][u[1]] + (G[u[0]][u[1]] + G[r][c]) / 2; if (nd < dist[r][c]) dist[r][c] = nd; }); }
  const top = (1 + 1) / 2 + (1 + 4) / 2 + (4 + 1) / 2 + (1 + 1) / 2;
  ok(dist[2][2] === 5 && top === 7, "practice 7: the cheapest path costs 5, the top-and-right one 7"); has("1 + 1.5 + 1.5 + 1 = 5"); has("costs 7");
}
// numbers to remember and the sources' figures
has("4.2 acres per MW"); has("34.5 ha per MW"); has("220 m · 61 m"); has("$1.6 million a mile");
ok(T.wind.setbackM === 220 && T.solar.setbackM === 61 && T.wind.setbackOptions[1] === 400 && T.solar.setbackOptions[1] === 152 && T.wind.slopeOptions.join(",") === "25,13" && T.solar.slopeOptions.join(",") === "10,5", "data: NREL Tables 7 and 9 (220/400 m, 61/152 m; 25/13%, 10/5%)");
ok(/34\.5 ± 22\.4 ha per MW/.test(RAW) && /0\.3 ± 0\.3 ha per MW/.test(RAW) && /Table 1, p\. 10/.test(RAW), "data: NREL 2009 Table 1");
ok(/4\.2 acres per MW \(DC\) for single-axis tracking arrays, slide 13/.test(RAW) && /DC:AC ratio 1\.29 for 2019 tracking plants, slide 8/.test(RAW), "data: LBNL slides 8 and 13");

// ---------------- 7 scope
const MINE = PAGE + "\n" + RAW + "\n" + JS + "\n" + MJS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(MINE), "no nuclear technology on the page, in the data, the scripts or the sidecar");
ok(!/\bAI\b|artificial intelligence/.test(MINE), "no 'AI'");
ok(!/projects\/|research\.(html|qmd)/.test(PAGE + RAW), "no project page and no Research page");
ok(Object.keys(T).join(",") === "solar,wind,dc" && D.corridor.need === "wind", "siting examples: a solar farm, a wind farm, a data-center campus and a line from the wind farm, nothing else");
const dcS = (TXT + " " + plain(JS)).match(/[^.]*data[- ]cent[^.]*\./gi) || [];
ok(dcS.length >= 3 && dcS.every(s => !/\b(supply|supplies|supplied|power plant|generat|buyer|order|timing|commerciali)/i.test(s)), "data centers appear as a load and a building only (" + dcS.length + " sentences)");
ok(/load and a building/.test(PAGE + JS), "the page says what a data center is here: a load and a building");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN.matchAll(/\]\((https?:[^)]+)\)/g)].map(m => m[1]));
const ALLOW = /^https:\/\/(www\.)?(eia\.gov|emp\.lbl\.gov|docs\.nlr\.gov|doi\.org|fema\.gov|docs\.qgis\.org)\//;
ok(hrefs.length > 8 && hrefs.every(h => ALLOW.test(h) || /^[0-9a-z-]+\.html$/.test(h) || /^notebooks\/a19-gis-siting\.ipynb$/.test(h) || h === "../assets/learn/data/a19-gis-siting.json"), "links: learn pages and allowed domains only: " + hrefs.filter(h => !(ALLOW.test(h) || /^[0-9a-z-]+\.html$/.test(h))).join(", "));
["m03-capacity-expansion.html", "cf7-cost-of-waiting.html", "a06-interconnection.html"].forEach(h => ok(OWN.indexOf('href="' + h + '"') >= 0 || OWN.indexOf("](" + h + ")") >= 0, "links " + h));
// the approved excerpt: E7.2 and E7.3, word for word, with CF7's footer; E7.8 under it
{
  const X = require("./excerpt_check.js"), REG = X.register(["E7"]);
  const bq = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  const sent = bq.length ? [...bq[0][2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => X.norm(m[1])) : [];
  if (REG) {
    ok(bq.length === 1 && bq[0][1] === "excerpt:code" && sent.join("|") === [REG.raw["E7.2"], REG.raw["E7.3"]].map(X.norm).join("|"), "one excerpt (excerpt:code): E7.2 and E7.3, word for word");
    ok(PAGE.indexOf('<p class="lx-hint">' + REG.raw["E7.8"] + "</p>") > 0, "E7.8 under the excerpt, word for word");
  } else console.log("note: excerpts_for_approval.md not found (set LEARN_PORTFOLIO); excerpt wording not checked");
  ok(bq.length === 1 && bq[0][3] === "Approved excerpt of: Li et al. (2026), accepted paper, 2026 North American Power Symposium (NAPS); DOI pending.", "the excerpt's footer is CF7's citation");
  ok(!/Li et al|NAPS|accepted paper/.test(JS + MJS + RAW), "no research wording in the scripts or the data");
}

// ---------------- 8 text budget of the page's own prose
{
  const prose = OWN.replace(/<!-- a19-fallback:start[\s\S]*?<!-- a19-fallback:end -->/, " ").replace(/<style>[\s\S]*?<\/style>/, " ").replace(/<table class="lx-facts">[\s\S]*?<\/table>/g, " ").replace(/^---[\s\S]*?\n---\n/, " ")
    .replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ").replace(/<blockquote[\s\S]*?<\/blockquote>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").split(/<\/?(?:p|li|dd|dt|summary|td|th)\b[^>]*>|<br>|\n\n|\n- /).filter(s => /[A-Za-z]{3}/.test(text(s)) && !/^\|/.test(text(s)) && !/^(:::|```)/.test(text(s)));
  prose.forEach(raw => { const s = text(raw), w = s.split(" ").length, n = nSent(text(raw.replace(/^\s*<b>[^<]*<\/b>/, ""))); ok(w <= 45 && n <= 3, "text element of " + w + " words, " + n + " sentences (≤ 45, ≤ 3): " + s.slice(0, 70)); });
}

// ---------------- 9 path.yml entry, front matter, sidecar, glossary
{
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(e => /\n  id: a19-gis-siting\n/.test(e)) || "";
  ok(/\n  code: A19\n/.test(entry) && /\n  status: active\n/.test(entry) && /\n  minutes: 25\n/.test(entry) && /\n  practice_minutes: 30/.test(entry) && /\n  lab_minutes: 60/.test(entry) && /\n  form: cards\n/.test(entry) && /\n  tier2: modeler\n/.test(entry), "path.yml: A19, cards, Analyst–Modeler, 25 + 60 + 30 minutes, active");
  const sub = (entry.match(/\n  subtitle: "(.*)"\n/) || [])[1];
  ok(sub && PAGE.indexOf('subtitle: "' + sub + '"') >= 0, "front matter subtitle = path.yml");
  const terms = [...SIDE.matchAll(/- id: ([a-z-]+)/g)].map(m => m[1]);
  ok(terms.join(",") === "raster,exclusion-layer,setback,weighted-overlay,suitability-score,cost-surface,least-cost-path,spatial-resolution,flood-zone,spare-capacity", "sidecar: ten new glossary terms");
  const used = new Set([...(PAGE + JS).matchAll(/data-term="([a-z0-9-]+)"|\[\[([a-z0-9-]+)\|/g)].map(m => m[1] || m[2]).filter(Boolean));
  const GL = JSON.parse(fs.readFileSync(L("data/glossary.json"), "utf8"));
  ok([...used].every(t => GL[t]), "every glossary mark is defined: " + [...used].filter(t => !GL[t]).join(", "));
}

// ---------------- 10 the page on a stub document: mount, every demo state, the explain layer
{
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = () => false; E.LX.reduced = () => true;
  E.LX.fmt = E.LX.fmt || { int: v => String(Math.round(v)) };
  const core = require(L("components/core.js")); E.LX.lessonRefHTML = core.lessonRefHTML; E.LX.lessonRef = core.lessonRef;
  ["cards", "controls", "toggle", "flowchart", "table", "boundary"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "siting") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const xp = E.LX.H("div", { id: "a19-explain" }, E.body);
  const ctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: undefined, performance: E.window.performance,
    setTimeout: f => { f(); return 1; }, clearTimeout: () => {}, requestAnimationFrame: () => 0 };
  vm.createContext(ctx);
  let threw = null;
  try { vm.runInContext(MJS, ctx); vm.runInContext(JS, ctx); } catch (e) { threw = e.stack; }
  ok(!threw && E.LX.A19 && E.LX.SiteMap, "a19.js sets LX.A19 and LX.SiteMap" + (threw ? ": " + threw : ""));
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "siting" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  const PJ = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
  try { init(live, { a19_gis_siting: D, cf_targets: CF, path: PJ }, root); } catch (e) { threw = e.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  try {
    ok(/Your solar run/.test(xp.textContent) && /Five limits of a suitability map/.test(xp.textContent) && /Where this screen holds/.test(xp.textContent), "explain layer: flowchart, comparison table, boundary box");
    ok(xp.textContent.indexOf("1 km cells leave 954 km² for solar") >= 0, "explain at first: the default 954 km²");
    for (let s = 1; s <= 8; s++) { const r = demo.fn("step-" + s); if (!r) ok(false, "demo step-" + s + " handled"); }
    const wDemo = M.run("solar", LS.solarOver(D, { ex: T.solar.exclusions, strict: false, w: Object.assign({}, T.solar.weights, { homes: 40 }) })).top[0];
    ok(xp.textContent.indexOf("your weights put A " + A19.place(R, wDemo.i, wDemo.j, wDemo.k)) >= 0, "after the demo states, the explain layer shows the reader's weights (homes 40)");
    demo.cards.go(1); const act = () => live.querySelector(".lx-step-act");
    act().lxSet("strict", true);
    const strictLeft = F.km2(M.run("solar", Object.assign({ exclusions: T.solar.exclusions }, LS.strictOver(D, "solar", true))).X.areaKm2);
    ok(xp.textContent.indexOf("1 km cells leave " + strictLeft) >= 0, "stricter rules reach the explain layer (" + strictLeft + ")");
    ok(live.querySelectorAll(".a19-svg").length >= 1 && live.querySelectorAll("rect").length > 1320, "the map draws its 1,320 cells");
  } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
}

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
