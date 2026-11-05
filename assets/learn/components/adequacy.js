/* adequacy.js — LX.A5: the resource-adequacy simulator (loss of load by Monte Carlo, seeded), promoted at the W4
   integration (2026-11-05) from Analyst lesson A5 (assets/learn/a05-adequacy.js), whose code it is, unchanged; lesson A9
   (hazards) runs the same simulator with its hazards as multipliers (o.mod). Pure: no DOM; the page passes the data in.
   Data the pages load and pass in: town_year.json (SPP's 2025 hourly shapes, EIA-930), m03-capacity-expansion-2024.json
   (SPP's 2024 shapes), cf_targets.json (EIA's 2025 capacity factors) and a05-adequacy.json (the Plains Grid, its units,
   the resources added, the seeded simulation). Each page keeps its own text, drill and view (A5: drillItem, blocksText,
   mixText). Node: require("assets/learn/components/adequacy.js"); tests: _tests/learn/test_a05-adequacy.js,
   test_a09-hazards.js (every number), test_components_w4_int.js (the promotion).

   The model (simulation, no solver; pure, exported for Node and as LX.A5):
     sources(D, y25, y24, targets, profile)  both weather years as unit shapes: demand / its own peak; wind and solar per MW
         of plant, each year scaled by LX.townProfile (method "scale", EIA's 2025 monthly then annual capacity factors), so
         2024 has 2025's capacity factors, as in M3
     simulate(D, SRC, seed, o)  N simulated years (default 500), seeded with mulberry32 (LX.mulberry32):
         weather  each year is 53 blocks of 7 days (the last holds 1 day); block k takes the same days of 2025 or 2024
                  (one draw: below 0.5 is 2025) shifted by -1, 0 or +1 week (one draw: floor(3u) - 1), kept inside the
                  year; demand, wind and sun move together. Resampled, not observed: the extremes are days of 2024 or 2025.
         outages  every unit, in the data's order, is available or out. It starts out with chance f (its forced outage
                  rate); a spell lasts a geometric number of hours: out with mean r (repair hours), available with mean
                  r (1 - f) / f, so it is out a share f of the time in the long run. Draw: ceil(ln(1 - u) / ln(1 - p)),
                  at least 1. Units are independent of each other and of the weather. The 5 extra peakers of step 4 draw
                  from their own stream (seed XOR 0x5bd1e995), so adding them leaves every other draw unchanged.
         margin   M_t = available units + 3,000 MW x wind_t + 1,200 MW x solar_t - 4,000 MW x demand_t (MW, hour t).
                  Only hours with M_t < threshold (1,500 MW) are kept; resources added only raise M, so no other hour can
                  fall short, and a battery of at most 1,500 MW charges at full power in every hour not kept (exact).
         o.mod    optional changes for lesson A9 (hazards): arrays of 8,760 multipliers over the calendar hours of every
                  simulated year: demand, wind, and the available MW of each unit type
         o.tally  optional, for A9: 8,760 shares of demand switched off directly (shutoffs) by calendar hour. That
                  demand leaves the balance (M_t uses connected demand, demand_t x (1 - share_t): supply need not serve
                  customers who are disconnected), and its yearly mean energy, sum(share_t x demand_t), is S.tally
     evaluate(S, add, detail)  the simulated years with resources added: add = {C perfect MW, wind MW, solar MW, sP and sE
         a battery's MW and MWh, eta, dr MW and drH hours a day, ct 0 or 1 blocks of extra peakers}. Each hour: x = M + C +
         wind x w_t + solar x s_t + extra peakers; if x >= 0 the battery charges min(P, x) x eta; if x < 0 the battery
         discharges min(P, -x, stored), then demand response cuts min(dr, rest) if the day has used fewer than drH hours;
         what is left is unserved. A day with any unserved hour is a loss-of-load day.
           LOLE = loss-of-load days / N (days a year); LOLH = unserved hours / N; EUE = unserved MWh / N.
     efc(S, base, add)  equivalent firm capacity: the smallest perfect MW C that gives base + C an EUE no higher than
         base + add's (bisection on [0, the block's MW]: halve the range 18 times, to 0.002 MW). EUE falls continuously
         and strictly with C while it is above zero, so when the target is above zero C is the unique match. When base +
         add leaves no unserved energy in the sampled years (target 0), every C above the smallest also gives 0: the
         result is flagged zero, a boundary of the finite sample, not proof of zero risk. Accreditation = C / MW added.
         PJM also rates classes by expected unserved energy (Manual 20A, sections 2.4 and 2.6), with its own formula (a
         ratio of EUE improvements), not this matching.
   Every number A5 and A9 state comes from these functions; their tests check them.
*/
(function () {
  "use strict";
  var T = 8760, DAYS = 365, MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var mulberry32 = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) || require("./core.js").mulberry32;

  // ---------------------------------------------------------------- pure model
  function sources(D, y25, y24, targets, profile) {
    var G = D.grid;
    return [y25, y24].map(function (Y, k) {
      var o = { year: Y, targets: targets, method: G.profileMethod, monthlyCF: G.monthlyCF, monthDays: MD };
      var w = profile("wind", 1, o).mw, s = profile("solar", 1, o).mw, d = new Float64Array(T), wf = new Float64Array(T), sf = new Float64Array(T);
      for (var i = 0; i < T; i++) { d[i] = Y.demand[i] / 1000; wf[i] = w[i]; sf[i] = s[i]; }
      return { year: k ? 2024 : 2025, d: d, w: wf, s: sf };
    });
  }
  function geom(u, p) { return Math.max(1, Math.ceil(Math.log(1 - u) / Math.log(1 - p))); }
  // one unit's outages over the year, into a difference array of available MW
  function outages(r, u, diff) {
    var f = u.forcedOutage, pf = f / (u.repairHours * (1 - f)), pr = 1 / u.repairHours, down = r() < f, t = 0;
    while (t < T) {
      var dur = geom(r(), down ? pr : pf);
      if (down) { diff[t] -= u.mw; diff[Math.min(T, t + dur)] += u.mw; }
      t += dur; down = !down;
    }
  }
  // the weather of one simulated year: map[t] = source year x 8,760 + source hour
  function weather(r, map, blocks) {
    for (var k = 0; k * 7 < DAYS; k++) {
      var len = Math.min(7, DAYS - k * 7), y = r() < 0.5 ? 0 : 1, sh = Math.floor(r() * 3) - 1;
      var d0 = Math.min(Math.max(0, k * 7 + sh * 7), DAYS - len);
      if (blocks) blocks.push({ year: y ? 2024 : 2025, shift: sh });
      for (var h = 0; h < len * 24; h++) map[k * 168 + h] = y * T + d0 * 24 + h;
    }
  }
  function capacity(D) { return D.units.reduce(function (s, u) { return s + u.n * u.mw; }, 0); }
  function simulate(D, SRC, seed, o) {
    o = o || {};
    var G = D.grid, N = o.years || D.sim.years, TH = D.sim.threshold, X = D.adds.ct, mod = o.mod || {};
    var r = mulberry32(seed), rx = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    var map = new Int32Array(T), U = D.units, diffs = U.map(function () { return new Float64Array(T + 1); }), dx = new Float64Array(T + 1);
    var years = [], full = null, kept = 0, tally = 0, tw = o.tally || null;
    for (var n = 0; n < N; n++) {
      var blocks = o.keep === n ? [] : null;
      weather(r, map, blocks);
      diffs.forEach(function (a) { a.fill(0); }); dx.fill(0);
      U.forEach(function (u, k) { for (var i = 0; i < u.n; i++) outages(r, u, diffs[k]); });
      for (var i = 0; i < X.n; i++) outages(rx, X, dx);
      var a = U.map(function (u) { return u.n * u.mw; }), b = X.n * X.mw, idx = [], m = [], src = [], ct = [];
      if (blocks) full = { n: n, blocks: blocks, demand: new Float64Array(T), wind: new Float64Array(T), solar: new Float64Array(T), units: new Float64Array(T), margin: new Float64Array(T) };
      for (var t = 0; t < T; t++) {
        var av = 0;
        for (var k = 0; k < U.length; k++) { a[k] += diffs[k][t]; av += mod.avail && mod.avail[U[k].id] ? a[k] * mod.avail[U[k].id][t] : a[k]; }
        b += dx[t];
        var q = map[t], y = q >= T ? 1 : 0, h = q - y * T, S = SRC[y];
        var dem = G.peakMW * S.d[h] * (mod.demand ? mod.demand[t] : 1), wi = G.windMW * S.w[h] * (mod.wind ? mod.wind[t] : 1), so = G.solarMW * S.s[h];
        var cut = tw ? tw[t] * dem : 0, M = av + wi + so - (dem - cut);
        tally += cut;
        if (full) { full.demand[t] = dem; full.wind[t] = wi; full.solar[t] = so; full.units[t] = av; full.margin[t] = M; }
        if (M < TH) { idx.push(t); m.push(M); src.push(q); ct.push(b); }
      }
      kept += idx.length;
      years.push({ idx: Uint16Array.from(idx), m: Float32Array.from(m), src: Uint16Array.from(src), ct: Uint16Array.from(ct) });
    }
    return { seed: seed, N: N, years: years, SRC: SRC, full: full, kept: kept, threshold: TH, cap: capacity(D), mod: !!o.mod, windW: o.mod && o.mod.wind ? o.mod.wind : null, tally: tally / N };
  }
  function plus(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) o[k] = (k === "eta" || k === "drH") ? b[k] : (o[k] || 0) + b[k];
    return o;
  }
  // a block of a resource, as an `add`
  function block(D, id, n) {
    n = n == null ? 1 : n;
    var B = D.adds.blockMW * n;
    if (id === "wind") return { wind: B };
    if (id === "solar") return { solar: B };
    if (id === "battery") return { sP: B, sE: B * D.adds.battery.hours, eta: D.adds.battery.eta };
    if (id === "dr") return { dr: B, drH: D.adds.dr.hoursPerDay };
    if (id === "ct") return { ct: n };
    if (id === "perfect") return { C: B };
    return {};
  }
  function evaluate(S, add, detail) {
    add = add || {};
    var SRC = S.SRC, C = add.C || 0, aw = add.wind || 0, as = add.solar || 0, P = add.sP || 0, E = add.sE || 0, eta = add.eta || 0.85;
    var dr = add.dr || 0, drH = add.drH || 4, act = add.ct || 0, ww = S.windW;
    var days = 0, lolh = 0, eue = 0, per = new Int32Array(S.N), byMonth = detail ? new Float64Array(12) : null, byHour = detail ? new Float64Array(24) : null, events = detail ? [] : null;
    var mStart = [], s0 = 0; MD.forEach(function (d) { mStart.push(s0); s0 += d; });
    for (var n = 0; n < S.N; n++) {
      var Y = S.years[n], e = E, prev = -1, day = -1, dayLOL = false, drUsed = 0, cnt = 0, run = 0, last = -2, depth = 0;
      for (var j = 0; j < Y.idx.length; j++) {
        var t = Y.idx[j], g = t - prev - 1; prev = t;
        if (P > 0 && g > 0 && e < E) e = Math.min(E, e + eta * P * g);
        var d = (t / 24) | 0;
        if (d !== day) { if (dayLOL) cnt++; day = d; dayLOL = false; drUsed = 0; }
        var q = Y.src[j], y = q >= T ? 1 : 0, h = q - y * T;
        var x = Y.m[j] + C + aw * SRC[y].w[h] * (ww ? ww[t] : 1) + as * SRC[y].s[h] + act * Y.ct[j];
        if (x >= 0) { if (P > 0 && e < E) e = Math.min(E, e + eta * Math.min(P, x)); continue; }
        if (P > 0 && e > 0) { var z = Math.min(P, -x, e); e -= z; x += z; }
        if (x < 0 && dr > 0 && drUsed < drH) { drUsed++; x = Math.min(0, x + dr); }
        if (x < -1e-9) {
          dayLOL = true; lolh++; eue -= x;
          if (detail) {
            var mo = 11; while (mStart[mo] > d) mo--;
            byMonth[mo]++; byHour[t % 24]++;
            if (t === last + 1) { run++; depth = Math.max(depth, -x); } else { if (run) events.push({ hours: run, depth: depth }); run = 1; depth = -x; }
            last = t;
          }
        }
      }
      if (dayLOL) cnt++;
      if (detail && run) events.push({ hours: run, depth: depth });
      per[n] = cnt; days += cnt;
    }
    var out = { days: days, lole: days / S.N, lolh: lolh / S.N, eue: eue / S.N, per: per, hours: lolh };
    if (detail) { out.byMonth = byMonth; out.byHour = byHour; out.events = events; }
    return out;
  }
  // the Monte Carlo error of LOLE: the standard error of the mean of the yearly counts
  function loleSE(ev) { var p = ev.per, n = p.length, m = ev.lole, s = 0; for (var i = 0; i < n; i++) s += (p[i] - m) * (p[i] - m); return Math.sqrt(s / (n - 1)) / Math.sqrt(n); }
  function yearsWith(ev) { var c = 0; for (var i = 0; i < ev.per.length; i++) if (ev.per[i] > 0) c++; return c; }
  function histogram(ev) { var b = [0, 0, 0, 0]; for (var i = 0; i < ev.per.length; i++) b[Math.min(3, ev.per[i])]++; return b; }
  function efc(S, base, add, B) {
    base = base || {};
    var target = evaluate(S, plus(base, add)).eue, eb = evaluate(S, base).eue, hi = B, lo = 0;
    if (eb <= target + 1e-9) return { mw: 0, target: target, base: eb, zero: target <= 1e-9 };
    for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (evaluate(S, plus(base, { C: mid })).eue <= target) hi = mid; else lo = mid; }
    return { mw: (lo + hi) / 2, target: target, base: eb, zero: target <= 1e-9 };
  }
  function accredit(D, S, base, id) { var r = efc(S, base, block(D, id), D.adds.blockMW); r.share = r.mw / D.adds.blockMW; r.id = id; return r; }
  // the yearly reserve margin counted at nameplate: every MW installed, over the planning peak
  function reserveMargin(D, addedMW) { var G = D.grid; return (capacity(D) + G.windMW + G.solarMW + (addedMW || 0) - G.peakMW) / G.peakMW; }
  // daily view of one full simulated year: the tightest hour of each day
  function daily(full) {
    var out = [];
    for (var d = 0; d < DAYS; d++) {
      var lo = Infinity, at = 0;
      for (var h = 0; h < 24; h++) { var v = full.margin[d * 24 + h]; if (v < lo) { lo = v; at = h; } }
      out.push({ day: d, min: lo, hour: at });
    }
    return out;
  }
  function dateOf(d) { var m = 0; while (d >= MD[m]) { d -= MD[m]; m++; } return (d + 1) + " " + MONTHS[m]; }
  function season(byMonth) {
    var s = { summer: byMonth[5] + byMonth[6] + byMonth[7] + byMonth[8], winter: byMonth[11] + byMonth[0] + byMonth[1], other: 0 }, tot = 0;
    for (var i = 0; i < 12; i++) tot += byMonth[i];
    s.other = tot - s.summer - s.winter; s.total = tot;
    return s;
  }
  // the whole study at one seed: the base, the five single blocks, three blocks of four resources, the mix
  function study(D, SRC, seed) {
    var S = simulate(D, SRC, seed), base = evaluate(S, {}, true), out = { seed: seed, S: S, base: base, se: loleSE(base), yearsWith: yearsWith(base), hist: histogram(base), single: {}, blocks: {}, mix: {} };
    D.adds.options.forEach(function (op) {
      var ev = evaluate(S, block(D, op.id)), a = accredit(D, S, {}, op.id);
      out.single[op.id] = { lole: ev.lole, lolh: ev.lolh, eue: ev.eue, days: ev.days, mw: a.mw, share: a.share };
    });
    return out;
  }
  function blocks(D, S, id, n) {
    var rows = [];
    for (var b = 0; b < (n || D.adds.maxBlocks); b++) { var a = efc(S, block(D, id, b), block(D, id), D.adds.blockMW); rows.push({ k: b + 1, mw: a.mw, share: a.mw / D.adds.blockMW, zero: a.zero }); }
    var all = efc(S, {}, block(D, id, rows.length), D.adds.blockMW * rows.length);
    return { id: id, rows: rows, total: all.mw, average: all.mw / (D.adds.blockMW * rows.length) };
  }
  function mix(D, S) {
    var sol = accredit(D, S, {}, "solar"), solB = accredit(D, S, block(D, "battery"), "solar");
    var bat = accredit(D, S, {}, "battery"), batS = accredit(D, S, block(D, "solar", 2), "battery");
    return { solar: sol.share, solarWithBattery: solB.share, battery: bat.share, batteryWithSolar: batS.share, zero: sol.zero || solB.zero || bat.zero || batS.zero };
  }

  // ---------------------------------------------------------------- formats (shared by the page and the test)
  var MINUS = "−";
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  function mw(v) { return (v < 0 ? MINUS : "") + int(Math.abs(v)) + " MW"; }
  function pct(f) { return Math.round(100 * f) + "%"; }
  function d2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function d3(v) { return (Math.round(v * 1000) / 1000).toFixed(3); }
  var fm = { int: int, mw: mw, pct: pct, d2: d2, d3: d3,
    lole: function (v) { return d2(v) + " days a year"; },
    lolh: function (v) { return d2(v) + " hours a year"; },
    eue: function (v) { return int(v) + " MWh a year"; },
    rm: function (f) { return (Math.round(f * 1000) / 10).toFixed(1) + "%"; } };
  var model = { T: T, DAYS: DAYS, MD: MD, MONTHS: MONTHS, sources: sources, geom: geom, outages: outages, weather: weather, simulate: simulate, plus: plus, block: block, evaluate: evaluate,
                loleSE: loleSE, yearsWith: yearsWith, histogram: histogram, efc: efc, accredit: accredit, reserveMargin: reserveMargin, capacity: capacity,
                daily: daily, dateOf: dateOf, season: season, study: study, blocks: blocks, mix: mix, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window !== "undefined" && window.LX) window.LX.A5 = model;
})();
