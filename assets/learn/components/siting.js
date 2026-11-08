/* siting.js — LX.A19: the siting map of lesson A19, its pure model (LX.A19) and its view (LX.SiteMap), shared by A19
   and capstone C3; its styles are siting.css. Prairie City is fictional; its numbers are
   illustrative.

   A seeded region around Prairie City as raster layers on a grid of 1 km cells (data/a19-gis-siting.json holds the
   recipe), and what a screening study does with them: exclusion masks, a weighted overlay (suitability), candidate sites
   in blocks, weight sensitivity, a cost surface with least-cost paths to substations, and a simple site-cost model.
   Every layer uses only + − × ÷, square roots, floor and a 32-bit seeded hash, so the lesson's NumPy notebook rebuilds
   the same numbers (the notebook's build step checks them).

   Pure model (Node: const A19 = require("assets/learn/components/siting.js"); the browser: window.LX.A19, in learn.js)
     A19.build(D, { newer })            the region: layers, homes, distances (newer: add the homes built since 2019)
     A19.coarsen(R, 2)                  the same region on 2 km cells (layers averaged, classes by majority)
     A19.cfg(D, type, over)             a site type's settings: { exclusions, slopeMax, setbackM, weights } (+ overrides)
     A19.exclude(R, D, type, cfg)       { reason (per cell: 0 ok, 1 water, 2 built-up, 3 industrial, 4 protected,
                                          5 flood, 6 slope), frac (share outside setbacks), buildable (km²), areaKm2 }
     A19.criteria(R, D, type)           { keys, values: { key: Float64Array of 0..1 scores, 1 best } }
     A19.suitability(R, D, type, cfg)   per-cell weighted overlay, 0..1 (NaN where excluded)
     A19.blocks(R, D, type, cfg)        every block of the type's size that has room: { i, j, k, B, m: {key: mean} }
     A19.sites(R, D, type, cfg, n)      the n best blocks that do not overlap: [{ id: "A".., i, j, k, score, ... }]
                                        (tie rule: higher score first; equal scores: the more northern, then western).
                                        Every weight 0: no ranking, [] with .noWeights = true
     A19.surface(R, D, { protected })   cost surface, $ per km of new line ("forbid" makes protected land impassable)
     A19.paths(R, D, surf, needMW)      multi-source Dijkstra from substations with that much room: { dist, pred, src }
     A19.route(R, P, cell)              the least-cost path from a cell: { cells, km, cost, sub, parts }
     A19.cost(R, D, type, site, cfg, P) a site's costs (2025 dollars): { land, connect, road, water, upfront, cf, mwh, sub }
     A19.shares(R, D, type, cfg, sites, draws, seed)  how often each site is the winning block under random weights:
                                        { wins (the very same block, not a winner that overlaps it), other
                                        (any other block), near (of those, winners that overlap a site) }
     A19.need(D, type), A19.place(R, i, j, k), A19.cellText(R, n)   helpers (cellText names a substation and the
                                        lines in a cell, from A19.gridAt(R, n))
     A19.gridRows(R)                    the grid layer as text: each substation's place, spare MW and lines
     A19.withCity(D, PC)                D with Prairie City's shared numbers filled in (PC = data/prairie-city.json): the
                                        data-center campus's MW is PC.dataCenter.contractMW, read here, never typed in D;
                                        call it first (the lesson, its test, C3)
     A19.usd(D, amount, year)           an amount of a given year in the page's dollars (2025), by BEA's GDP deflator
   Substations: S1 to S4 (D.substations) are transmission substations, where new plants and large loads connect, each with
   its spare capacity (headroomMW, set for teaching). They are not the districts' own substations of prairie-city.json
   (districts[].substationMW, the peak-hour limits of distribution substations); the campus builds its own substation and
   a line to one of S1 to S4, as prairie-city.json's dataCenter.connection says.
   Costs: 2025 dollars. NREL's line and mitigation costs (2022 dollars) are converted with D.costs.deflator; the teaching
   values (road, water main, land) are set in 2025 dollars. Each input names its year (lineYear, mitigationYear, ...).
   View (browser): LX.SiteMap(host, { R, D, label }) → { draw(state), cursor(n), el } — an SVG map with a keyboard
     cursor (arrow keys) and a live line describing the cell under it; see SiteMap below.
   Data: data/a19-gis-siting.json and cf_targets.json (EIA's 2025 capacity factors). */
(function () {
  "use strict";
  var mb = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) ||
    (typeof require === "function" ? require("./core.js").mulberry32 : null);
  var SQRT2 = Math.SQRT2, KM_PER_MILE = 1.609344, ACRES_PER_KM2 = 247.105;

  // ---------------------------------------------------------------- seeded value noise (arithmetic only)
  function imul(a, b) { return Math.imul(a, b); }
  function lattice(ix, iy, seed) {
    var s = (imul(ix, 0x27d4eb2d) ^ imul(iy, 0x165667b1) ^ imul(seed, 0x2c1b3c6d)) >>> 0;
    return mb(s)();
  }
  function noise(x, y, scale, seed) {
    var u = x / scale, v = y / scale, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed), c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
    var top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  }
  function fbm(x, y, scale, seed) { return (noise(x, y, scale, seed) + 0.5 * noise(x, y, scale / 2, seed + 1)) / 1.5; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ---------------------------------------------------------------- the region
  function riverY(D, x) {
    var r = D.river, s = D.grid.seed;
    return r.y0 + r.amp * (fbm(x, 0, r.scale, s + r.salt) - 0.5) + r.tilt * (x - r.tiltAt);
  }
  function floodHalf(D, x) { var f = D.river.flood; return f.base + f.amp * fbm(x, 3, f.scale, D.grid.seed + f.salt); }
  function ridgeX(D, y) { var g = D.slope.ridge; return g.x0 + g.amp * (fbm(0, y, g.scale, D.grid.seed + g.salt) - 0.5); }
  function cityQ(D, x, y) {
    var c = D.city, dx = (x - c.cx) / c.ax, dy = (y - c.cy) / c.ay;
    return Math.sqrt(dx * dx + dy * dy) + c.wobble * (fbm(x, y, 4, D.grid.seed + 3) - 0.5);
  }
  function inEllipse(D, p, x, y) {
    var dx = (x - p.cx) / p.rx, dy = (y - p.cy) / p.ry;
    return dx * dx + dy * dy + 0.5 * (noise(x, y, 2, D.grid.seed + p.salt) - 0.5) <= 1;
  }
  function distSquare(px, py, i, j, size) {
    var dx = Math.max(i - px, 0, px - (i + size)), dy = Math.max(j - py, 0, py - (j + size));
    return Math.sqrt(dx * dx + dy * dy);
  }

  function build(D, opts) {
    opts = opts || {};
    var G = D.grid, W = G.W, H = G.H, N = W * H, s = G.seed;
    var R = { D: D, W: W, H: H, cellKm: G.cellKm, area: G.cellKm * G.cellKm, N: N, newer: !!opts.newer, fine: null };
    var water = new Uint8Array(N), flood = new Uint8Array(N), built = new Uint8Array(N), ind = new Uint8Array(N), prot = new Uint8Array(N);
    var district = new Uint8Array(N), slope = new Float64Array(N), wind = new Float64Array(N), sun = new Float64Array(N), land = new Float64Array(N), q = new Float64Array(N);
    var yr = [], wf = [], xr = [];
    for (var i = 0; i < W; i++) { yr.push(riverY(D, i + 0.5)); wf.push(floodHalf(D, i + 0.5)); }
    for (var j = 0; j < H; j++) xr.push(ridgeX(D, j + 0.5));
    var C = D.city, SL = D.slope, WI = D.wind, SU = D.sun, LA = D.land, IN = D.industrial;
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      var n = j * W + i, x = i + 0.5, y = j + 0.5, dyr = Math.abs(y - yr[i]);
      var qq = cityQ(D, x, y); q[n] = qq;
      if (dyr < 0.5) water[n] = 1;
      else if (dyr <= wf[i]) flood[n] = 1;
      if (!water[n] && qq <= C.built) built[n] = 1;
      if (i >= IN.i0 && i <= IN.i1 && j >= IN.j0 && j <= IN.j1 && !water[n]) { ind[n] = 1; built[n] = 0; }
      district[n] = qq <= C.core ? 3 : qq <= C.built ? 2 : qq <= C.fringe ? 1 : 0;
      // slope: base, river bluffs just outside the flood zone, the ridge's flanks, a few hills in the west
      var sl = SL.base + SL.baseAmp * fbm(x, y, SL.baseScale, s + SL.baseSalt);
      var dfz = dyr - wf[i];
      if (dfz >= 0 && dfz < SL.bluffKm) sl += SL.bluff * (1 - dfz / SL.bluffKm);
      var rg = SL.ridge, dr = Math.abs(x - xr[j]);
      if (dr < rg.half) sl += rg.peak * 4 * (dr / rg.half) * (1 - dr / rg.half);
      var hl = SL.hills, hv = fbm(x, y, hl.scale, s + hl.salt);
      if (hv > hl.from && x < hl.xMax) sl += hl.gain * (hv - hl.from);
      slope[n] = sl;
      var rx = (x - xr[j]) / WI.ridgeKm;
      wind[n] = WI.east + WI.westGain * (1 - x / W) + WI.ridgeGain / (1 + rx * rx) + WI.amp * (fbm(x, y, WI.scale, s + WI.salt) - 0.5);
      sun[n] = SU.base + SU.southGain * (y / H) + SU.amp * (fbm(x, y, SU.scale, s + SU.salt) - 0.5);
      var dc = Math.max(0, qq - C.built) / LA.cityKm;
      land[n] = LA.base + LA.amp * fbm(x, y, LA.scale, s + LA.salt) + LA.cityGain / (1 + dc * dc);
    }
    // protected land: ellipses with a seeded edge, and a riparian strip (the flood zone and river between two x's)
    D.protected.forEach(function (p, k) {
      for (var jj = 0; jj < H; jj++) for (var ii = 0; ii < W; ii++) {
        var nn = jj * W + ii, xx = ii + 0.5, yy = jj + 0.5;
        if (built[nn] || ind[nn]) continue;
        var hit = p.riparian ? ((flood[nn] || water[nn]) && xx >= p.x0 && xx <= p.x1) : inEllipse(D, p, xx, yy);
        if (hit && !prot[nn]) prot[nn] = k + 1;
      }
    });
    // homes: one seeded draw of three numbers per cell, in row order; a home where the first is below the cell's chance
    var homes = [], HM = D.homes, rng = mb((s + HM.salt) >>> 0);
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      n = j * W + i;
      var r1 = rng(), r2 = rng(), r3 = rng(), open = !water[n] && !built[n] && !ind[n] && !prot[n];
      var p = district[n] === 1 ? HM.pFringe : HM.pRural;
      if (open && r1 < p) homes.push({ x: i + 0.15 + 0.7 * r2, y: j + 0.15 + 0.7 * r3, newer: false });
    }
    var NW = HM.newer, rng2 = mb((s + NW.salt) >>> 0), nNew = 0;
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      n = j * W + i;
      r1 = rng2(); r2 = rng2(); r3 = rng2();
      var grow = !water[n] && !built[n] && !ind[n] && !prot[n] && !flood[n] && i >= NW.i0 && i <= NW.i1 && j >= NW.j0 && j <= NW.j1;
      if (grow && r1 < NW.pGrow) { nNew++; if (R.newer) homes.push({ x: i + 0.15 + 0.7 * r2, y: j + 0.15 + 0.7 * r3, newer: true }); }
    }
    R.nNewer = nNew;
    var subc = new Uint8Array(N);
    D.substations.forEach(function (sb) { subc[Math.floor(sb.y) * W + Math.floor(sb.x)] = 1; });
    // distances: to the nearest home or built-up cell (a cell centre and 4 × 4 points in each cell), to roads, water
    // Homes and built-up cells are looked up within 3 cells; anything farther counts as CAP km (3 km: beyond every
    // setback and every "away from homes" ramp, so the cap changes no result).
    var SUB = G.sub, CAP = 3, sp = new Float64Array(N * SUB * SUB), dHome = new Float64Array(N), dRoad = new Float64Array(N), dWater = new Float64Array(N);
    var waterCells = [], bucket = [];
    for (n = 0; n < N; n++) { bucket.push([]); if (water[n] || built[n]) waterCells.push(n); }
    homes.forEach(function (h) { bucket[Math.floor(h.y) * W + Math.floor(h.x)].push(h); });
    function nearHome(ci, cj, px, py) {
      var best = CAP, h, dx, dy, d;
      for (var bj = Math.max(0, cj - 3); bj <= Math.min(H - 1, cj + 3); bj++) for (var bi = Math.max(0, ci - 3); bi <= Math.min(W - 1, ci + 3); bi++) {
        var c = bj * W + bi;
        if (built[c]) { d = distSquare(px, py, bi, bj, 1); if (d < best) best = d; }
        var hb = bucket[c];
        for (var k = 0; k < hb.length; k++) { h = hb[k]; dx = h.x - px; dy = h.y - py; d = Math.sqrt(dx * dx + dy * dy); if (d < best) best = d; }
      }
      return best;
    }
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      n = j * W + i;
      for (var b = 0; b < SUB; b++) for (var a = 0; a < SUB; a++) sp[(n * SUB + b) * SUB + a] = nearHome(i, j, i + (a + 0.5) / SUB, j + (b + 0.5) / SUB);
      dHome[n] = nearHome(i, j, i + 0.5, j + 0.5);
      dRoad[n] = roadDist(D, i + 0.5, j + 0.5);
      var bw = Infinity;
      for (var k2 = 0; k2 < waterCells.length; k2++) {
        var cw = waterCells[k2], wx = cw % W + 0.5 - (i + 0.5), wy = (cw - cw % W) / W + 0.5 - (j + 0.5), dw = Math.sqrt(wx * wx + wy * wy);
        if (dw < bw) bw = dw;
      }
      dWater[n] = bw;
    }
    var mean = function (A) { var t = 0; for (var z = 0; z < A.length; z++) t += A[z]; return t / A.length; };
    Object.assign(R, { water: water, flood: flood, built: built, ind: ind, prot: prot, subc: subc, district: district, slope: slope, wind: wind, sun: sun, land: land, q: q,
      homes: homes, sp: sp, dHome: dHome, dRoad: dRoad, dWater: dWater, riverY: yr, floodHalf: wf, ridgeX: xr,
      windMean: mean(wind), sunMean: mean(sun), x: function (n) { return (n % W + 0.5) * R.cellKm; }, y: function (n) { return ((n - n % W) / W + 0.5) * R.cellKm; } });
    R.frac = function (setbackKm) {
      var f = new Float64Array(N), S2 = SUB * SUB;
      for (var nn = 0; nn < N; nn++) { var c = 0; for (var t = 0; t < S2; t++) if (sp[nn * S2 + t] > setbackKm) c++; f[nn] = c / S2; }
      return f;
    };
    return R;
  }
  function roadDist(D, x, y) {
    var best = Infinity;
    D.roads.forEach(function (r) { var d = Math.abs((r.axis === "h" ? y : x) - r.at); if (d < best) best = d; });
    return best;
  }
  function subDist(D, x, y, needMW) {
    var best = Infinity, id = null;
    D.substations.forEach(function (s) {
      if (s.headroomMW < needMW) return;
      var dx = s.x - x, dy = s.y - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) { best = d; id = s.id; }
    });
    return { d: best, id: id };
  }

  // the same region on cells f times larger: means for numbers, a majority (at least half) for classes
  function coarsen(R, f) {
    var W = R.W / f, H = R.H / f, N = W * H, D = R.D, f2 = f * f;
    var C = { D: D, W: W, H: H, cellKm: R.cellKm * f, area: R.area * f2, N: N, newer: R.newer, fine: R, nNewer: R.nNewer, homes: R.homes };
    ["water", "flood", "built", "ind", "subc"].forEach(function (k) { C[k] = new Uint8Array(N); });
    C.prot = new Uint8Array(N); C.district = new Uint8Array(N);
    ["slope", "wind", "sun", "land", "dHome", "dRoad", "dWater", "q"].forEach(function (k) { C[k] = new Float64Array(N); });
    for (var J = 0; J < H; J++) for (var I = 0; I < W; I++) {
      var n = J * W + I, cnt = { water: 0, flood: 0, built: 0, ind: 0, prot: 0 }, sums = { slope: 0, wind: 0, sun: 0, land: 0, q: 0 }, pk = 0, dmax = 0;
      for (var b = 0; b < f; b++) for (var a = 0; a < f; a++) {
        var m = (J * f + b) * R.W + I * f + a;
        cnt.water += R.water[m]; cnt.flood += R.flood[m] || R.water[m] ? 1 : 0; cnt.built += R.built[m]; cnt.ind += R.ind[m];
        if (R.prot[m]) { cnt.prot++; pk = R.prot[m]; }
        sums.slope += R.slope[m]; sums.wind += R.wind[m]; sums.sun += R.sun[m]; sums.land += R.land[m]; sums.q += R.q[m];
        if (R.district[m] > dmax) dmax = R.district[m];
      }
      var half = f2 / 2;
      C.water[n] = cnt.water >= half ? 1 : 0;
      C.flood[n] = !C.water[n] && cnt.flood >= half ? 1 : 0;
      C.built[n] = !C.water[n] && cnt.built >= half ? 1 : 0;
      C.ind[n] = !C.water[n] && cnt.ind >= half ? 1 : 0;
      C.prot[n] = cnt.prot >= half ? pk : 0;
      C.district[n] = dmax;
      for (b = 0; b < f; b++) for (a = 0; a < f; a++) if (R.subc[(J * f + b) * R.W + I * f + a]) C.subc[n] = 1;
      ["slope", "wind", "sun", "land", "q"].forEach(function (k) { C[k][n] = sums[k] / f2; });
      var x = (I + 0.5) * f, y = (J + 0.5) * f;
      C.dRoad[n] = roadDist(D, x, y);
      var bh = 3, bw = Infinity, k, d, dx, dy;
      for (k = 0; k < R.homes.length; k++) { dx = R.homes[k].x - x; dy = R.homes[k].y - y; d = Math.sqrt(dx * dx + dy * dy); if (d < bh) bh = d; }
      for (k = 0; k < R.N; k++) {
        var ii = k % R.W, jj = (k - ii) / R.W;
        if (R.built[k]) { d = distSquare(x, y, ii, jj, 1); if (d < bh) bh = d; }
        if (R.water[k] || R.built[k]) { dx = ii + 0.5 - x; dy = jj + 0.5 - y; d = Math.sqrt(dx * dx + dy * dy); if (d < bw) bw = d; }
      }
      C.dHome[n] = bh; C.dWater[n] = bw;
    }
    C.windMean = R.windMean; C.sunMean = R.sunMean;
    C.x = function (n) { return (n % W + 0.5) * C.cellKm; }; C.y = function (n) { return ((n - n % W) / W + 0.5) * C.cellKm; };
    C.frac = function (setbackKm) {
      var ff = R.frac(setbackKm), out = new Float64Array(N);
      for (var JJ = 0; JJ < H; JJ++) for (var II = 0; II < W; II++) {
        var t = 0;
        for (var bb = 0; bb < f; bb++) for (var aa = 0; aa < f; aa++) t += ff[(JJ * f + bb) * R.W + II * f + aa];
        out[JJ * W + II] = t / f2;
      }
      return out;
    };
    return C;
  }

  // ---------------------------------------------------------------- exclusions, criteria, suitability
  function cfg(D, type, over) {
    var T = D.types[type], c = { exclusions: Object.assign({}, T.exclusions), slopeMax: T.slopeMax, setbackM: T.setbackM, weights: Object.assign({}, T.weights), anySub: false };
    over = over || {};
    if (over.anySub != null) c.anySub = !!over.anySub;
    if (over.exclusions) Object.assign(c.exclusions, over.exclusions);
    ["slopeMax", "setbackM"].forEach(function (k) { if (over[k] != null) c[k] = over[k]; });
    if (over.weights) Object.keys(c.weights).forEach(function (k) { if (over.weights[k] != null) c.weights[k] = over.weights[k]; });
    return c;
  }
  var REASONS = ["", "river", "built-up land", "industrial park", "protected land", "flood zone", "too steep", "a substation"];
  function exclude(R, D, type, c) {
    var N = R.N, reason = new Uint8Array(N), E = c.exclusions;
    var frac = E.setback ? R.frac(c.setbackM / 1000) : null, buildable = new Float64Array(N), tot = 0;
    for (var n = 0; n < N; n++) {
      var r = 0;
      if (R.water[n]) r = 1;
      else if (R.built[n]) r = 2;
      else if (R.ind[n] && type !== "dc") r = 3;
      else if (R.subc[n]) r = 7;
      else if (E.protected && R.prot[n]) r = 4;
      else if (E.flood && R.flood[n]) r = 5;
      else if (E.slope && R.slope[n] > c.slopeMax) r = 6;
      reason[n] = r;
      buildable[n] = r ? 0 : R.area * (frac ? frac[n] : 1);
      tot += buildable[n];
    }
    if (!frac) { frac = new Float64Array(N); frac.fill(1); }
    return { reason: reason, frac: frac, buildable: buildable, areaKm2: tot, share: tot / (N * R.area) };
  }
  function needMW(D, type, c) { return c && c.anySub ? 0 : D.types[type].mw; }
  function criteria(R, D, type, c) {
    var T = D.types[type], N = R.N, vals = {}, rp = T.ramps, mw = needMW(D, type, c);
    var res = type === "wind" ? R.wind : R.sun, lo = Infinity, hi = -Infinity, n;
    for (n = 0; n < N; n++) { if (res[n] < lo) lo = res[n]; if (res[n] > hi) hi = res[n]; }
    var dsub = new Float64Array(N);
    for (n = 0; n < N; n++) dsub[n] = subDist(D, R.x(n), R.y(n), mw).d;
    T.criteria.forEach(function (k) {
      var v = new Float64Array(N);
      for (n = 0; n < N; n++) {
        if (k === "res") v[n] = (res[n] - lo) / (hi - lo);
        else if (k === "sub") v[n] = 1 - clamp01((dsub[n] - rp.sub[0]) / (rp.sub[1] - rp.sub[0]));
        else if (k === "road") v[n] = 1 - clamp01((R.dRoad[n] - rp.road[0]) / (rp.road[1] - rp.road[0]));
        else if (k === "water") v[n] = 1 - clamp01((R.dWater[n] - rp.water[0]) / (rp.water[1] - rp.water[0]));
        else if (k === "land") v[n] = 1 - clamp01((R.land[n] - rp.land[0]) / (rp.land[1] - rp.land[0]));
        else if (k === "homes") v[n] = clamp01((R.dHome[n] - rp.homes[0]) / (rp.homes[1] - rp.homes[0]));
      }
      vals[k] = v;
    });
    return { keys: T.criteria.slice(), values: vals, resLo: lo, resHi: hi, dsub: dsub };
  }
  function wsum(w, keys) { var t = 0; keys.forEach(function (k) { t += w[k] || 0; }); return t; }
  function suitability(R, D, type, c, X, CR) {
    X = X || exclude(R, D, type, c); CR = CR || criteria(R, D, type, c);
    var s = new Float64Array(R.N), tw = wsum(c.weights, CR.keys);
    for (var n = 0; n < R.N; n++) {
      if (X.reason[n]) { s[n] = NaN; continue; }
      var t = 0;
      CR.keys.forEach(function (k) { t += (c.weights[k] || 0) * CR.values[k][n]; });
      s[n] = tw > 0 ? t / tw : 0;
    }
    return s;
  }

  // ---------------------------------------------------------------- blocks and sites
  function need(D, type) {
    var T = D.types[type];
    if (type === "solar") return T.mw * T.dcac * T.acresPerMWdc / ACRES_PER_KM2;
    if (type === "wind") return T.needShare * T.blockKm * T.blockKm;
    return T.needKm2;
  }
  function blocks(R, D, type, c, X, CR) {
    var T = D.types[type], k = T.blockKm / R.cellKm, out = [], req = need(D, type);
    if (k !== Math.floor(k) || k < 1) return out;
    X = X || exclude(R, D, type, c); CR = CR || criteria(R, D, type, c);
    for (var j = 0; j + k <= R.H; j++) for (var i = 0; i + k <= R.W; i++) {
      var B = 0, m = {}, lp = 0, rs = 0;
      CR.keys.forEach(function (key) { m[key] = 0; });
      for (var b = 0; b < k; b++) for (var a = 0; a < k; a++) {
        var n = (j + b) * R.W + i + a, bu = X.buildable[n];
        if (!bu) continue;
        B += bu;
        for (var q = 0; q < CR.keys.length; q++) m[CR.keys[q]] += CR.values[CR.keys[q]][n] * bu;
        lp += R.land[n] * bu; rs += (type === "wind" ? R.wind[n] : R.sun[n]) * bu;
      }
      if (B < req - 1e-9) continue;
      CR.keys.forEach(function (key) { m[key] = m[key] / B; });
      out.push({ i: i, j: j, k: k, B: B, m: m, land: lp / B, res: rs / B });
    }
    return out;
  }
  function blockScore(bl, w, keys) {
    var t = 0, tw = 0;
    for (var q = 0; q < keys.length; q++) { var wk = w[keys[q]] || 0; t += wk * bl.m[keys[q]]; tw += wk; }
    return tw > 0 ? t / tw : 0;
  }
  function better(a, b) { return a.score > b.score || (a.score === b.score && (a.j < b.j || (a.j === b.j && a.i < b.i))); }
  function overlap(a, b, g) { g = g || 0; return a.i - g < b.i + b.k && b.i - g < a.i + a.k && a.j - g < b.j + b.k && b.j - g < a.j + a.k; }
  // the cell a site connects from: its buildable cell nearest the block's centre (ties: the first in row order)
  function connCell(R, X, p) {
    var best = -1, bd = Infinity, c = (p.k - 1) / 2;
    for (var b = 0; b < p.k; b++) for (var a = 0; a < p.k; a++) {
      var n = (p.j + b) * R.W + p.i + a, d = (a - c) * (a - c) + (b - c) * (b - c);
      if (X.buildable[n] > 0 && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function sites(R, D, type, c, n, X, CR, BL) {
    CR = CR || criteria(R, D, type, c); X = X || exclude(R, D, type, c);
    BL = BL || blocks(R, D, type, c, X, CR);
    // every weight 0: every score is 0 and only the tie rule would rank, so there is no short list
    if (!(wsum(c.weights, CR.keys) > 0)) { var none = []; none.qualifying = BL.length; none.ranked = []; none.noWeights = true; return none; }
    var ranked = BL.map(function (bl) { return Object.assign({ score: blockScore(bl, c.weights, CR.keys) }, bl); });
    ranked.sort(function (a, b) { return better(a, b) ? -1 : better(b, a) ? 1 : 0; });
    var pick = [], gap = D.types[type].gap || 0;
    for (var z = 0; z < ranked.length && pick.length < (n || 5); z++) {
      if (pick.some(function (p) { return overlap(p, ranked[z], gap); })) continue;
      pick.push(ranked[z]);
    }
    pick.forEach(function (p, r) {
      p.id = String.fromCharCode(65 + r); p.rank = r + 1;
      p.cell = connCell(R, X, p);
      p.margin = r + 1 < pick.length ? p.score - pick[r + 1].score : null;
    });
    pick.qualifying = BL.length; pick.ranked = ranked;
    return pick;
  }

  // ---------------------------------------------------------------- cost surface and least-cost paths
  function cellClass(R, D, n) {
    var M = D.costs.mult, mult = M.farmland, cls = "farmland";
    if (R.district[n] === 1 && M.fringe > mult) { mult = M.fringe; cls = "fringe"; }
    if ((R.built[n] || R.ind[n]) && M.built > mult) { mult = M.built; cls = "built"; }
    if (R.slope[n] > D.costs.hillyFrom && M.hilly > mult) { mult = M.hilly; cls = "hilly"; }
    if ((R.flood[n] || R.water[n]) && M.wet > mult) { mult = M.wet; cls = "wet"; }
    return { mult: mult, cls: cls };
  }
  // an amount of a given year in the page's dollar year (D.costs.year), by the GDP deflator's ratio
  function usd(D, amount, year) { var ix = D.costs.deflator.index; return amount * (ix[D.costs.year] / ix[year]); }
  function withCity(D, PC) {
    var out = Object.assign({}, D), types = {};
    Object.keys(D.types).forEach(function (k) { types[k] = Object.assign({}, D.types[k]); });
    types.dc.mw = PC.dataCenter.contractMW;
    out.types = types; out.city2 = { dataCenter: PC.dataCenter, line: PC.about.line };
    return out;
  }
  function surface(R, D, o) {
    o = o || {};
    var K = D.costs, base = usd(D, K.lineUSDperMile, K.lineYear) / KM_PER_MILE, mit = usd(D, K.mitigationUSDperMile, K.mitigationYear) / KM_PER_MILE, c = new Float64Array(R.N), cls = [];
    for (var n = 0; n < R.N; n++) {
      var cc = cellClass(R, D, n);
      cls.push(R.prot[n] ? "protected" : cc.cls);
      if (R.prot[n] && o.protected === "forbid") { c[n] = Infinity; continue; }
      c[n] = base * cc.mult + (R.prot[n] ? mit : 0);
    }
    return { c: c, cls: cls, base: base, mit: mit, protected: o.protected || "allow" };
  }
  // the eight neighbours, in a fixed order (N, S, W, E, then the diagonals): the tie rule for equal paths
  var NB = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  function Heap() { this.a = []; }
  Heap.prototype.less = function (x, y) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); };
  Heap.prototype.push = function (e) {
    var a = this.a, k = a.length; a.push(e);
    while (k > 0) { var p = (k - 1) >> 1; if (!this.less(a[k], a[p])) break; var t = a[k]; a[k] = a[p]; a[p] = t; k = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var k = 0;
      for (;;) {
        var l = 2 * k + 1, r = l + 1, m = k;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === k) break;
        var t = a[k]; a[k] = a[m]; a[m] = t; k = m;
      }
    }
    return top;
  };
  function subCell(R, s) { return Math.floor(s.y / R.cellKm) * R.W + Math.floor(s.x / R.cellKm); }
  function paths(R, D, surf, needMW) {
    var N = R.N, dist = new Float64Array(N), pred = new Int32Array(N), src = new Int32Array(N), done = new Uint8Array(N), h = new Heap(), L = R.cellKm;
    dist.fill(Infinity); pred.fill(-1); src.fill(-1);
    D.substations.forEach(function (s, k) {
      if (s.headroomMW < needMW) return;
      var n = subCell(R, s);
      if (dist[n] > 0 && surf.c[n] < Infinity) { dist[n] = 0; src[n] = k; h.push([0, n]); }
    });
    while (h.a.length) {
      var e = h.pop(), u = e[1];
      if (done[u]) continue;
      done[u] = 1;
      var ui = u % R.W, uj = (u - ui) / R.W;
      for (var z = 0; z < 8; z++) {
        var vi = ui + NB[z][0], vj = uj + NB[z][1];
        if (vi < 0 || vj < 0 || vi >= R.W || vj >= R.H) continue;
        var v = vj * R.W + vi;
        if (done[v] || surf.c[v] === Infinity) continue;
        var w = (surf.c[u] + surf.c[v]) / 2 * (z < 4 ? L : SQRT2 * L), nd = dist[u] + w;
        if (nd < dist[v]) { dist[v] = nd; pred[v] = u; src[v] = src[u]; h.push([nd, v]); }
      }
    }
    return { dist: dist, pred: pred, src: src, needMW: needMW, surf: surf };
  }
  function route(R, P, cell) {
    if (!(P.dist[cell] < Infinity)) return null;
    var cells = [cell], km = 0, parts = {}, n = cell, L = R.cellKm;
    while (P.pred[n] >= 0) {
      var m = P.pred[n], diag = (n % R.W) !== (m % R.W) && Math.floor(n / R.W) !== Math.floor(m / R.W), len = diag ? SQRT2 * L : L;
      km += len;
      [n, m].forEach(function (c) { var k = P.surf.cls[c]; parts[k] = (parts[k] || 0) + len / 2; });
      cells.push(m); n = m;
    }
    return { cells: cells, km: km, cost: P.dist[cell], sub: R.D.substations[P.src[cell]].id, parts: parts };
  }

  // ---------------------------------------------------------------- a site's costs (2025 dollars) and energy
  function cost(R, D, type, site, c, P, cft) {
    var T = D.types[type], K = D.costs, out = { type: type };
    var rt = P ? route(R, P, site.cell) : null;
    out.route = rt; out.connect = rt ? rt.cost : Infinity; out.sub = rt ? rt.sub : null;
    out.roadKm = R.dRoad[site.cell]; out.road = out.roadKm * usd(D, K.roadUSDperKm, K.roadYear);
    out.waterKm = type === "dc" ? R.dWater[site.cell] : 0; out.water = out.waterKm * usd(D, K.waterUSDperKm, K.waterYear);
    out.acres = type === "solar" ? T.mw * T.dcac * T.acresPerMWdc : type === "wind" ? T.mw * T.directHaPerMW * ACRES_PER_KM2 / 100 : T.needKm2 * ACRES_PER_KM2;
    out.land = out.acres * site.land;
    out.upfront = out.connect + out.road + out.water + out.land;
    if (cft && type !== "dc") {
      out.cf = type === "solar" ? cft.solar * site.res / R.sunMean : cft.wind + T.cfPerMs * (site.res - R.windMean);
      out.mwh = T.mw * out.cf * 8760;
    }
    return out;
  }

  // ---------------------------------------------------------------- weight sensitivity: random weights, uniform on the simplex
  // A draw counts for a site only when its best block is that very block; a winner that merely overlaps a site (a block
  // a cell or two away) counts as another block, and is tallied in `near` too.
  function shares(R, D, type, c, top, draws, seed, BL, CR) {
    CR = CR || criteria(R, D, type, c); BL = BL || blocks(R, D, type, c, null, CR);
    var keys = CR.keys, K = keys.length, rng = mb(seed >>> 0), tally = {}, other = 0, near = 0;
    top.forEach(function (s) { tally[s.id] = 0; });
    for (var d = 0; d < draws; d++) {
      var u = []; for (var z = 0; z < K - 1; z++) u.push(rng());
      u.sort(function (a, b) { return a - b; });
      var w = {}, prev = 0;
      for (z = 0; z < K - 1; z++) { w[keys[z]] = u[z] - prev; prev = u[z]; }
      w[keys[K - 1]] = 1 - prev;
      var best = null;
      for (var q = 0; q < BL.length; q++) {
        var cand = { score: blockScore(BL[q], w, keys), i: BL[q].i, j: BL[q].j, k: BL[q].k };
        if (!best || better(cand, best)) best = cand;
      }
      var hit = best && top.filter(function (s) { return s.i === best.i && s.j === best.j; })[0];
      if (hit) tally[hit.id]++;
      else { other++; if (best && top.some(function (s) { return overlap(s, best); })) near++; }
    }
    return { draws: draws, seed: seed, wins: tally, other: other, near: near };
  }

  // ---------------------------------------------------------------- the grid layer as text
  // Each cell's grid features: the substation in it and the lines that cross it (straight segments between substations,
  // or from a substation to the map's edge, sampled every 0.01 km). Cached on the region.
  // a line to the map's edge is named by its compass direction from the substation (north-east, east, ...)
  function edgeDir(D, l) {
    var a = D.substations.filter(function (s) { return s.id === l.from; })[0], dx = l.to[0] - a.x, dy = l.to[1] - a.y, d = Math.sqrt(dx * dx + dy * dy);
    var ns = dy < -0.4 * d ? "north" : dy > 0.4 * d ? "south" : "", ew = dx > 0.4 * d ? "east" : dx < -0.4 * d ? "west" : "";
    return ns && ew ? ns + "-" + ew : ns || ew;
  }
  function lineName(D, l) { return typeof l.to === "string" ? l.from + "–" + l.to : l.from + " to the regional grid (" + edgeDir(D, l) + ")"; }
  function gridCells(R) {
    var D = R.D, out = [], byId = {}, k = R.cellKm;
    for (var n = 0; n < R.N; n++) out.push({ sub: null, lines: [] });
    D.substations.forEach(function (s) { byId[s.id] = s; out[Math.floor(s.y / k) * R.W + Math.floor(s.x / k)].sub = s; });
    D.lines.forEach(function (l) {
      var a = byId[l.from], b = typeof l.to === "string" ? byId[l.to] : { x: l.to[0], y: l.to[1] }, name = lineName(D, l);
      var steps = Math.ceil(Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)) / 0.01);
      for (var z = 0; z <= steps; z++) {
        var x = a.x + (b.x - a.x) * z / steps, y = a.y + (b.y - a.y) * z / steps;
        var i = Math.min(R.W - 1, Math.floor(x / k)), j = Math.min(R.H - 1, Math.floor(y / k)), c = out[j * R.W + i];
        if (c.lines.indexOf(name) < 0) c.lines.push(name);
      }
    });
    return out;
  }
  function gridAt(R, n) { if (!R.gridCache) R.gridCache = gridCells(R); return R.gridCache[n]; }
  // one row per substation: id, name, where (from the centre), spare MW, and where its lines go
  function gridRows(R) {
    var D = R.D;
    return D.substations.map(function (s) {
      var to = [], edge = 0;
      D.lines.forEach(function (l) {
        if (l.from === s.id) { if (typeof l.to === "string") to.push(l.to); else edge++; }
        else if (l.to === s.id) to.push(l.from);
      });
      var uniq = to.filter(function (t, x) { return to.indexOf(t) === x; });
      if (edge) uniq.push("regional grid (" + edge + (edge > 1 ? " lines)" : " line)"));
      var k = R.cellKm;
      return { id: s.id, name: s.name, where: place(R, Math.floor(s.x / k), Math.floor(s.y / k), 1), spareMW: s.headroomMW, to: uniq };
    });
  }
  function gridWords(R, n) {
    var g = gridAt(R, n), out = [];
    if (g.sub) out.push("substation " + g.sub.id + " (" + g.sub.name + "), " + g.sub.headroomMW + " MW spare");
    if (g.lines.length) out.push("crossed by the line" + (g.lines.length > 1 ? "s " : " ") + g.lines.join(", "));
    return out;
  }

  // ---------------------------------------------------------------- words
  function place(R, i, j, k) {
    var C = R.D.city, x = (i + k / 2) * R.cellKm, y = (j + k / 2) * R.cellKm, dx = Math.round(x - C.cx), dy = Math.round(y - C.cy);
    var ew = dx === 0 ? "" : Math.abs(dx) + " km " + (dx < 0 ? "W" : "E"), ns = dy === 0 ? "" : Math.abs(dy) + " km " + (dy < 0 ? "N" : "S");
    return (ew && ns ? ew + ", " + ns : ew || ns || "at the centre");
  }
  function cellText(R, n) {
    var i = n % R.W, j = (n - i) / R.W, bits = [];
    var kind = R.water[n] ? "river" : R.built[n] ? "built-up" : R.ind[n] ? "industrial park" : R.prot[n] ? R.D.protected[R.prot[n] - 1].name : R.flood[n] ? "flood zone" : "farmland";
    bits.push(kind);
    bits.push("slope " + R.slope[n].toFixed(1) + "%");
    bits.push("wind " + R.wind[n].toFixed(1) + " m/s");
    bits.push("sun " + R.sun[n].toFixed(2) + " kWh/m² a day");
    bits.push("land $" + Math.round(R.land[n] / 100) * 100 + " an acre");
    return "Cell " + place(R, i, j, 1) + " of the centre: " + bits.concat(gridWords(R, n)).join(", ") + ".";
  }

  var A19 = { build: build, coarsen: coarsen, cfg: cfg, exclude: exclude, criteria: criteria, suitability: suitability, need: need, blocks: blocks,
    blockScore: blockScore, sites: sites, surface: surface, paths: paths, route: route, cost: cost, shares: shares, place: place, cellText: cellText,
    gridAt: gridAt, gridRows: gridRows, gridWords: gridWords,
    REASONS: REASONS, riverY: riverY, floodHalf: floodHalf, ridgeX: ridgeX, roadDist: roadDist, subDist: subDist, noise: noise, fbm: fbm, lattice: lattice,
    ACRES_PER_KM2: ACRES_PER_KM2, KM_PER_MILE: KM_PER_MILE, overlap: overlap, connCell: connCell, needMW: needMW, usd: usd, withCity: withCity };
  if (typeof module !== "undefined" && module.exports) module.exports = A19;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- the map view
  var LX = window.LX, H = LX.H, S = LX.S;
  LX.A19 = A19;
  var VB = 10;   // SVG units per km at 1 km cells
  function TX(attrs, parent, words) { var e = S("text", attrs, parent); e.textContent = words; return e; }
  /* LX.SiteMap(host, { R, D, label, onCell(n) }) → { draw(state), cursor(n), el }
     state: { layer: "base" | "protected" | "slope" | "homes" | "flood" | "grid" | "roads" | "wind" | "sun" | "land" | "suit",
              R (another region, e.g. coarsened), suit (Float64Array 0..1, NaN where excluded), X (exclude()'s result: hatch
              the excluded cells, by kind; shade cells cut by setbacks), sites ([{ id, i, j, k, label }]; label replaces the
              letter), sitesKey (the legend's words for them), sel (a site id), ghost ({ i, j, k, label, key }: a dashed
              block, e.g. where a site was before a change), path ([cells]), homes (true: draw the homes),
              grid (true: show the substations table, the grid layer's text version, in a closed details box; the "grid"
              layer shows it open) }
     Site letters go to the first free place (inside a large block, above, beside, below) that covers no substation,
     the city's name or another letter. The SVG is hidden from screen readers; its text versions are the line under the
     map (the cell under the cursor, with any substation and line in it) and the substations table. */
  LX.SiteMap = function (host, o) {
    var R0 = o.R, D = o.D, uid = "a19m" + Math.floor(Math.random() * 1e6);
    var wrap = H("div", { class: "a19-map" }, host);
    var fig = H("div", { class: "a19-fig", tabindex: "0", role: "group", "aria-label": (o.label || "Map of the region around Prairie City") + ". Arrow keys move a cursor over the cells; the line under the map describes the cell." }, wrap);
    var svg = S("svg", { viewBox: "0 0 " + R0.W * VB + " " + R0.H * VB, class: "a19-svg", "aria-hidden": "true", focusable: "false" }, fig);
    var defs = S("defs", null, svg);
    // one hatch per kind of exclusion, so the reader can tell them apart (legend: "Out: protected land", ...)
    var HATCH = { 4: "prot", 5: "flood", 6: "slope", 3: "other", 7: "other" };
    ["prot", "flood", "slope", "other"].forEach(function (k) {
      var pat = S("pattern", { id: uid + "-h-" + k, width: 4, height: 4, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
      S("rect", { width: 4, height: 4, class: "a19-hatch-bg" }, pat);
      S("line", { x1: 0, y1: 0, x2: 0, y2: 4, class: "a19-hatch-ln " + k }, pat);
    });
    var gCells = S("g", { class: "a19-cells" }, svg), gHatch = S("g", { class: "a19-hatch" }, svg), gFeat = S("g", { class: "a19-feat" }, svg);
    var gSites = S("g", { class: "a19-sites" }, svg), gPath = S("g", { class: "a19-path" }, svg), gLab = S("g", { class: "a19-labs" }, svg);
    var cur = S("rect", { class: "a19-cur", width: VB, height: VB, x: 0, y: 0, visibility: "hidden" }, svg);
    var legend = H("div", { class: "a19-legend" }, wrap);
    // the grid layer as text: one row per transmission substation, in a details box (open with the grid layer; shown
    // but closed when a step asks for it with grid: true)
    var gbox = H("details", { class: "a19-gbox" }, wrap);
    (function gridTable() {
      H("summary", { class: "a19-gcap", text: "Substations and lines, the grid layer as text (km from the city centre)" }, gbox);
      var t = H("table", { class: "a19-gtbl" }, H("div", { class: "lx-scroll-x" }, gbox)), tr = H("tr", null, H("thead", null, t)), tb = H("tbody", null, t);
      ["Substation", "Where", "Spare capacity", "Lines to"].forEach(function (h) { H("th", { scope: "col", text: h }, tr); });
      A19.gridRows(R0).forEach(function (g) {
        var row = H("tr", null, tb); H("th", { scope: "row", text: g.id + " " + g.name }, row);
        [g.where, g.spareMW + " MW", g.to.join(", ")].forEach(function (c, x) { H("td", { class: x < 2 ? "a19-gnw" : null, text: c }, row); });
      });
    })();
    gbox.hidden = true;
    var live = H("p", { class: "a19-cell", "aria-live": "polite", text: "Tap a cell, or focus the map and use the arrow keys, to read what is there." }, wrap);
    var st = { layer: "base" }, R = R0, curN = null, cellEls = [], suitRange = null, lastLayer = null;

    // features that do not change: river, roads, lines, substations, the city's districts
    (function features() {
      var pts = [];
      for (var x = 0; x <= R0.W; x += 0.5) pts.push((x * VB).toFixed(1) + "," + (A19.riverY(D, x) * VB).toFixed(1));
      S("polyline", { points: pts.join(" "), class: "a19-river" }, gFeat);
      D.roads.forEach(function (r) {
        var a = r.at * VB;
        S("line", r.axis === "h" ? { x1: 0, y1: a, x2: R0.W * VB, y2: a, class: "a19-road" + (r.name === "Interstate" ? " major" : "") } : { x1: a, y1: 0, x2: a, y2: R0.H * VB, class: "a19-road" + (/U\.S\./.test(r.name) ? " major" : "") }, gFeat);
      });
      var subById = {}; D.substations.forEach(function (s) { subById[s.id] = s; });
      D.lines.forEach(function (l) {
        var a = subById[l.from], b = typeof l.to === "string" ? subById[l.to] : { x: l.to[0], y: l.to[1] };
        S("line", { x1: a.x * VB, y1: a.y * VB, x2: b.x * VB, y2: b.y * VB, class: "a19-line" }, gFeat);
      });
    })();
    var gHomes = S("g", { class: "a19-homes" }, gFeat);
    // label and marker boxes the site letters must not cover (SVG units; sc > 1 on phones, where labels are drawn larger)
    function fixedBoxes(sc) {
      var out = [];
      D.substations.forEach(function (s) {
        out.push([s.x * VB - 6, s.y * VB - 6, 12, 12], s.x > 38 ? [s.x * VB - 8 - 22 * sc, s.y * VB - 7 - 14 * sc, 22 * sc, 17 * sc] : [s.x * VB + 6, s.y * VB - 7 - 14 * sc, 22 * sc, 17 * sc]);
      });
      out.push([D.city.cx * VB - 50 * sc, (D.city.cy - 2.2) * VB - 14 * sc, 100 * sc, 18 * sc]);
      return out;
    }
    D.substations.forEach(function (s) {
      S("rect", { x: s.x * VB - 5, y: s.y * VB - 5, width: 10, height: 10, class: "a19-sub" }, gLab);
      TX({ x: s.x * VB + (s.x > 38 ? -8 : 8), y: s.y * VB - 7, class: "a19-lab" + (s.x > 38 ? " end" : "") }, gLab, s.id);
    });
    TX({ x: D.city.cx * VB, y: (D.city.cy - 2.2) * VB, class: "a19-lab city" }, gLab, D.city.name);
    function hits(b, list) { return list.some(function (q) { return b[0] < q[0] + q[2] && q[0] < b[0] + b[2] && b[1] < q[1] + q[3] && q[1] < b[1] + b[3]; }); }

    function cellsFor(Rx) {
      gCells.innerHTML = ""; cellEls = [];
      var v = Rx.cellKm * VB;
      for (var n = 0; n < Rx.N; n++) {
        var i = n % Rx.W, j = (n - i) / Rx.W;
        cellEls.push(S("rect", { x: i * v, y: j * v, width: v + 0.3, height: v + 0.3 }, gCells));
      }
    }
    cellsFor(R0);

    var LEG = {
      base: { kind: "cat", items: [["a19-c-built", "Built-up land"], ["a19-c-ind", "Industrial park"], ["a19-c-water", "River"], ["a19-c-farm", "Farmland"]] },
      protected: { kind: "cat", items: [["a19-c-prot", "Protected land"], ["a19-c-farm", "Other land"]] },
      flood: { kind: "cat", items: [["a19-c-flood", "Flood zone"], ["a19-c-water", "River"]] },
      homes: { kind: "cat", items: [["a19-c-home", "Home (dot)"], ["a19-c-built", "Built-up land"]] },
      grid: { kind: "cat", items: [["a19-c-sub", "Substation"], ["a19-c-line", "Power line"]] },
      roads: { kind: "cat", items: [["a19-c-road", "Paved road"]] },
      slope: { kind: "ramp", cls: "a19-r-slope", lo: "0%", hi: "15% or more", what: "Slope" },
      wind: { kind: "ramp", cls: "a19-r-wind", what: "Wind speed at 100 m" },
      sun: { kind: "ramp", cls: "a19-r-sun", what: "Sunshine" },
      land: { kind: "ramp", cls: "a19-r-land", what: "Land price" },
      suit: { kind: "ramp", cls: "a19-r-suit", lo: "0", hi: "100", what: "Suitability" }
    };
    function range(A) { var lo = Infinity, hi = -Infinity; for (var n = 0; n < A.length; n++) { if (A[n] < lo) lo = A[n]; if (A[n] > hi) hi = A[n]; } return [lo, hi]; }
    function drawLegend(layer, Rx) {
      legend.innerHTML = "";
      var L = LEG[layer] || LEG.base;
      if (L.kind === "cat") L.items.forEach(function (it) { var s = H("span", { class: "a19-key" }, legend); H("i", { class: "a19-sw " + it[0], "aria-hidden": "true" }, s); H("span", { text: it[1] }, s); });
      else {
        var lo = L.lo, hi = L.hi, r;
        if (layer === "wind") { r = range(Rx.wind); lo = r[0].toFixed(1) + " m/s"; hi = r[1].toFixed(1) + " m/s"; }
        if (layer === "sun") { r = range(Rx.sun); lo = r[0].toFixed(2); hi = r[1].toFixed(2) + " kWh/m² a day"; }
        if (layer === "land") { r = range(Rx.land); lo = "$" + Math.round(r[0] / 100) * 100; hi = "$" + Math.round(r[1] / 1000) + ",000 an acre"; }
        if (layer === "suit" && suitRange) { lo = String(Math.round(100 * suitRange[0])); hi = Math.round(100 * suitRange[1]) + " of 100"; }
        var s2 = H("span", { class: "a19-key ramp" }, legend);
        H("span", { text: L.what + ":" }, s2);
        var nw = H("span", { class: "a19-nw" }, s2);
        H("span", { text: lo }, nw); H("i", { class: "a19-ramp " + L.cls, "aria-hidden": "true" }, nw); H("span", { text: hi }, nw);
      }
      if (st.X) {
        var seen = {}; for (var n = 0; n < st.X.reason.length; n++) if (HATCH[st.X.reason[n]]) seen[HATCH[st.X.reason[n]]] = true;
        [["prot", "Out: protected land"], ["flood", "Out: flood zone"], ["slope", "Out: too steep"], ["other", "Out: other"]].forEach(function (h) {
          if (!seen[h[0]]) return;
          var sh = H("span", { class: "a19-key" }, legend); H("i", { class: "a19-sw a19-c-excl " + h[0], "aria-hidden": "true" }, sh); H("span", { text: h[1] }, sh);
        });
        var cutAny = false; for (n = 0; n < st.X.frac.length; n++) if (!st.X.reason[n] && st.X.frac[n] < 1) { cutAny = true; break; }
        if (cutAny) { var sc = H("span", { class: "a19-key" }, legend); H("i", { class: "a19-sw a19-c-cutk", "aria-hidden": "true" }, sc); H("span", { text: "Part lost to setbacks" }, sc); }
      }
      if (st.sites && st.sites.length) { var sk = H("span", { class: "a19-key" }, legend); H("i", { class: "a19-sw a19-c-site", "aria-hidden": "true" }, sk); H("span", { text: st.sitesKey || "Top sites, A best" }, sk); }
      if (st.ghost) { var gk = H("span", { class: "a19-key" }, legend); H("i", { class: "a19-sw a19-c-ghost", "aria-hidden": "true" }, gk); H("span", { text: st.ghost.key }, gk); }
      if (st.path) { var pk = H("span", { class: "a19-key" }, legend); H("i", { class: "a19-sw a19-c-path", "aria-hidden": "true" }, pk); H("span", { text: "New line" }, pk); }
    }

    function draw(s) {
      st = Object.assign({ layer: "base" }, s || {});
      var Rx = st.R || R0;
      if (Rx !== R) { R = Rx; cellsFor(R); }
      var layer = st.layer, rr = null;
      if (layer === "wind") rr = range(R.wind); if (layer === "sun") rr = range(R.sun); if (layer === "land") rr = range(R.land);
      // suitability: the shading stretches from the lowest to the highest score on land that is left (the legend says which)
      suitRange = null;
      if (layer === "suit" && st.suit) { var lo = Infinity, hi = -Infinity; for (var z = 0; z < st.suit.length; z++) if (!isNaN(st.suit[z])) { lo = Math.min(lo, st.suit[z]); hi = Math.max(hi, st.suit[z]); } if (lo < hi) suitRange = [lo, hi]; }
      for (var n = 0; n < R.N; n++) {
        var el = cellEls[n], cls = "a19-c-farm", op = 1;
        if (R.water[n]) cls = "a19-c-water";
        else if (layer === "suit" && st.suit) { if (isNaN(st.suit[n])) cls = "a19-c-none"; else { cls = "a19-c-suit"; op = 0.05 + 0.9 * (suitRange ? (st.suit[n] - suitRange[0]) / (suitRange[1] - suitRange[0]) : 0.5); } }
        else if (layer === "slope") { cls = "a19-c-slope"; op = 0.05 + 0.9 * clamp01(R.slope[n] / 15); }
        else if (layer === "wind" || layer === "sun" || layer === "land") { var A = R[layer]; cls = "a19-c-" + layer; op = 0.06 + 0.9 * (A[n] - rr[0]) / (rr[1] - rr[0]); }
        else if (R.built[n]) cls = "a19-c-built";
        else if (R.ind[n]) cls = "a19-c-ind";
        else if (layer === "protected" && R.prot[n]) cls = "a19-c-prot";
        else if (layer === "flood" && R.flood[n]) cls = "a19-c-flood";
        el.setAttribute("class", cls); el.setAttribute("fill-opacity", op.toFixed(3));
      }
      // hatch the excluded cells (the river and built-up land are drawn as they are); shade land lost to setbacks
      gHatch.innerHTML = "";
      if (st.X) {
        var v = R.cellKm * VB;
        for (n = 0; n < R.N; n++) {
          var i = n % R.W, j = (n - i) / R.W, rs = st.X.reason[n];
          if (rs >= 3) S("rect", { x: i * v, y: j * v, width: v, height: v, fill: "url(#" + uid + "-h-" + HATCH[rs] + ")", class: "a19-ex" }, gHatch);
          else if (!rs && st.X.frac[n] < 1) S("rect", { x: i * v, y: j * v, width: v, height: v, class: "a19-cut", "fill-opacity": (0.6 * (1 - st.X.frac[n])).toFixed(3) }, gHatch);
        }
      }
      gHomes.innerHTML = "";
      var showHomes = layer === "homes" || layer === "base" || st.homes;
      if (showHomes) (R.homes || R0.homes).forEach(function (h) { S("circle", { cx: (h.x * VB).toFixed(1), cy: (h.y * VB).toFixed(1), r: h.newer ? 2.4 : 1.7, class: "a19-home" + (h.newer ? " new" : "") }, gHomes); });
      gFeat.setAttribute("data-layer", layer);
      gSites.innerHTML = "";
      // site letters: the first place, in this order, that covers no substation, city or earlier letter and stays on the map
      var bw = fig.getBoundingClientRect ? fig.getBoundingClientRect().width : 0, sc = bw && bw < 480 ? 1.4 : 1;
      svg.classList.toggle("big", sc > 1);
      var placed = fixedBoxes(sc), MW = R0.W * VB, MH = R0.H * VB, v2 = R.cellKm * VB;
      if (st.ghost) {
        var g = st.ghost;
        S("rect", { x: g.i * v2, y: g.j * v2, width: g.k * v2, height: g.k * v2, class: "a19-site ghost" }, gSites);
      }
      (st.sites || []).forEach(function (p) { placed.push([p.i * v2, p.j * v2, p.k * v2, p.k * v2]); });
      (st.sites || []).concat(st.ghost ? [Object.assign({ ghost: true }, st.ghost)] : []).forEach(function (p) {
        var on = st.sel === p.id, word = p.label || p.id, w = (9 * word.length + 4) * sc, h = 15 * sc, x0 = p.i * v2, y0 = p.j * v2, sz = p.k * v2;
        if (!p.ghost) S("rect", { x: x0, y: y0, width: sz, height: sz, class: "a19-site" + (on ? " on" : "") }, gSites);
        var cands = [[x0, y0 - h - 1], [x0 + sz - w, y0 - h - 1], [x0 + sz + 2, y0], [x0 - w - 2, y0], [x0, y0 + sz + 2], [x0 + sz - w, y0 + sz + 2],
          [x0 + sz + 2, y0 + sz - h], [x0 - w - 2, y0 + sz - h], [x0 - w - 2, y0 + sz + 2], [x0 - w - 2, y0 - h - 1], [x0 - w - 14, y0 + sz + 6]];
        if (sz >= h + 4) cands.unshift([x0 + 2, y0 + 2]);
        var box = null;
        for (var c = 0; c < cands.length && !box; c++) {
          var b = [cands[c][0], cands[c][1], w, h];
          if (b[0] < 0 || b[1] < 0 || b[0] + b[2] > MW || b[1] + b[3] > MH) continue;
          if (!hits(b, placed.filter(function (q) { return !(q[0] === x0 && q[1] === y0 && q[2] === sz); }))) box = b;
        }
        if (!box) box = [Math.max(0, Math.min(MW - w, x0)), Math.max(0, y0 - h - 1), w, h];
        placed.push(box);
        TX({ x: box[0] + 2 * sc, y: box[1] + 12 * sc, class: "a19-site-lab" + (on ? " on" : "") + (p.ghost ? " ghost" : "") }, gSites, word);
      });
      gPath.innerHTML = "";
      if (st.path && st.path.length) {
        var pts = st.path.map(function (c) { return ((R.x(c)) * VB).toFixed(1) + "," + ((R.y(c)) * VB).toFixed(1); });
        S("polyline", { points: pts.join(" "), class: "a19-route" }, gPath);
      }
      drawLegend(layer, R);
      gbox.hidden = !(layer === "grid" || st.grid);
      if (layer === "grid" && lastLayer !== "grid") gbox.open = true;   // the grid layer opens its text version
      lastLayer = layer;
      if (curN != null && curN >= R.N) curN = null;
      cursor(curN);
    }
    function cursor(n) {
      curN = n;
      if (n == null) { cur.setAttribute("visibility", "hidden"); return; }
      var v = R.cellKm * VB, i = n % R.W, j = (n - i) / R.W;
      cur.setAttribute("x", i * v); cur.setAttribute("y", j * v); cur.setAttribute("width", v); cur.setAttribute("height", v); cur.setAttribute("visibility", "visible");
      var extra = "";
      if (st.X) { var rs = st.X.reason[n]; extra = rs ? " Excluded: " + A19.REASONS[rs] + "." : st.X.frac[n] < 1 ? " " + Math.round(100 * (1 - st.X.frac[n])) + "% of it inside home setbacks." : " Open for this site."; }
      if (st.suit && !isNaN(st.suit[n]) && !(st.X && st.X.reason[n])) extra += " Suitability " + Math.round(100 * st.suit[n]) + ".";
      live.textContent = (R.fine ? cellTextCoarse(R, n) : cellText(R, n)) + extra;
      if (o.onCell) o.onCell(n);
    }
    function cellTextCoarse(Rc, n) {
      var i = n % Rc.W, j = (n - i) / Rc.W;
      return "Cell (2 km) " + place(Rc, i, j, 1) + " of the centre: " + ["slope " + Rc.slope[n].toFixed(1) + "% on average", "sun " + Rc.sun[n].toFixed(2) + " kWh/m² a day", "land $" + Math.round(Rc.land[n] / 100) * 100 + " an acre"].concat(A19.gridWords(Rc, n)).join(", ") + ".";
    }
    fig.addEventListener("keydown", function (e) {
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d && e.key !== "Home") return;
      e.preventDefault();
      if (curN == null || e.key === "Home") { cursor(Math.floor(R.H / 2) * R.W + Math.floor(R.W / 2)); return; }
      var i = curN % R.W + d[0], j = (curN - curN % R.W) / R.W + d[1];
      if (i < 0 || j < 0 || i >= R.W || j >= R.H) return;
      cursor(j * R.W + i);
    });
    fig.addEventListener("focus", function () { if (curN == null) cursor(Math.floor(R.H / 2) * R.W + Math.floor(R.W / 2)); });
    svg.addEventListener("click", function (e) {
      var r = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null; if (!r || !r.width) return;
      var i = Math.floor((e.clientX - r.left) / r.width * R.W), j = Math.floor((e.clientY - r.top) / r.height * R.H);
      if (i >= 0 && j >= 0 && i < R.W && j < R.H) cursor(j * R.W + i);
    });
    draw({ layer: "base" });
    return { el: wrap, draw: draw, cursor: cursor, live: live };
  };
})();
