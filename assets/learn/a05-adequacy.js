// a05-adequacy.js — Analyst lesson A5, "Will there be enough power when it matters? Resource adequacy and capacity
// accreditation" (step cards, simulation mode, Learn W4, 2026-11-05).
//
// Data (read through data-src):
//   assets/learn/data/town_year.json                    SPP's 2025 hourly shapes (EIA-930), local standard time
//   assets/learn/data/m03-capacity-expansion-2024.json  SPP's 2024 shapes, 29 February left out (M3's second weather year)
//   assets/learn/data/cf_targets.json                   EIA's 2025 monthly and annual capacity factors (wind, solar)
//   assets/learn/data/a05-adequacy.json                 the Plains Grid, its units, the resources added, the seeded
//                                                       simulation, PJM's class ratings and a reference block (test)
//   assets/learn/data/path.json                         live lessons, for LX.lessonRef
//
// The model (simulation, no solver; pure, exported for Node and as LX.A5 for lesson A9):
//   sources(D, y25, y24, targets, profile)  both weather years as unit shapes: demand / its own peak; wind and solar per MW
//       of plant, each year scaled by LX.townProfile (method "scale", EIA's 2025 monthly then annual capacity factors), so
//       2024 has 2025's capacity factors, as in M3
//   simulate(D, SRC, seed, o)  N simulated years (default 500), seeded with mulberry32 (LX.mulberry32):
//       weather  each year is 53 blocks of 7 days (the last holds 1 day); block k takes the same days of 2025 or 2024
//                (one draw: below 0.5 is 2025) shifted by -1, 0 or +1 week (one draw: floor(3u) - 1), kept inside the
//                year; demand, wind and sun move together. Resampled, not observed: the extremes are days of 2024 or 2025.
//       outages  every unit, in the data's order, is available or out. It starts out with chance f (its forced outage
//                rate); a spell lasts a geometric number of hours: out with mean r (repair hours), available with mean
//                r (1 - f) / f, so it is out a share f of the time in the long run. Draw: ceil(ln(1 - u) / ln(1 - p)),
//                at least 1. Units are independent of each other and of the weather. The 5 extra peakers of step 4 draw
//                from their own stream (seed XOR 0x5bd1e995), so adding them leaves every other draw unchanged.
//       margin   M_t = available units + 3,000 MW x wind_t + 1,200 MW x solar_t - 4,000 MW x demand_t (MW, hour t).
//                Only hours with M_t < threshold (1,500 MW) are kept; resources added only raise M, so no other hour can
//                fall short, and a battery of at most 1,500 MW charges at full power in every hour not kept (exact).
//       o.mod    optional changes for lesson A9 (hazards): arrays of 8,760 multipliers over the calendar hours of every
//                simulated year: demand, wind, and the available MW of each unit type
//   evaluate(S, add, detail)  the simulated years with resources added: add = {C perfect MW, wind MW, solar MW, sP and sE
//       a battery's MW and MWh, eta, dr MW and drH hours a day, ct 0 or 1 blocks of extra peakers}. Each hour: x = M + C +
//       wind x w_t + solar x s_t + extra peakers; if x >= 0 the battery charges min(P, x) x eta; if x < 0 the battery
//       discharges min(P, -x, stored), then demand response cuts min(dr, rest) if the day has used fewer than drH hours;
//       what is left is unserved. A day with any unserved hour is a loss-of-load day.
//         LOLE = loss-of-load days / N (days a year); LOLH = unserved hours / N; EUE = unserved MWh / N.
//   efc(S, base, add)  equivalent firm capacity: the perfect MW C that gives base + C the same EUE as base + add. EUE falls
//       continuously and strictly with C while it is above zero, so C is unique; bisection on [0, the block's MW], 18
//       halvings (to 0.002 MW). Accreditation = C / MW added. PJM likewise rates classes by expected unserved energy
//       (Manual 20A, sections 2.4 and 2.6); its own formula is a ratio of EUE improvements, not this matching.
// Every number the page states comes from these functions; _tests/learn/test_a05-adequacy.js checks them.
(function () {
  "use strict";
  var T = 8760, DAYS = 365, MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var mulberry32 = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) || require("./components/core.js").mulberry32;

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
    var years = [], full = null, kept = 0;
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
        var M = av + wi + so - dem;
        if (full) { full.demand[t] = dem; full.wind[t] = wi; full.solar[t] = so; full.units[t] = av; full.margin[t] = M; }
        if (M < TH) { idx.push(t); m.push(M); src.push(q); ct.push(b); }
      }
      kept += idx.length;
      years.push({ idx: Uint16Array.from(idx), m: Float32Array.from(m), src: Uint16Array.from(src), ct: Uint16Array.from(ct) });
    }
    return { seed: seed, N: N, years: years, SRC: SRC, full: full, kept: kept, threshold: TH, cap: capacity(D), mod: !!o.mod, windW: o.mod && o.mod.wind ? o.mod.wind : null };
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
    if (eb <= target + 1e-9) return { mw: 0, target: target, base: eb };
    for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (evaluate(S, plus(base, { C: mid })).eue <= target) hi = mid; else lo = mid; }
    return { mw: (lo + hi) / 2, target: target, base: eb };
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
    for (var b = 0; b < (n || D.adds.maxBlocks); b++) { var a = efc(S, block(D, id, b), block(D, id), D.adds.blockMW); rows.push({ k: b + 1, mw: a.mw, share: a.mw / D.adds.blockMW }); }
    var all = efc(S, {}, block(D, id, rows.length), D.adds.blockMW * rows.length);
    return { id: id, rows: rows, total: all.mw, average: all.mw / (D.adds.blockMW * rows.length) };
  }
  function mix(D, S) {
    var sol = accredit(D, S, {}, "solar"), solB = accredit(D, S, block(D, "battery"), "solar");
    var bat = accredit(D, S, {}, "battery"), batS = accredit(D, S, block(D, "solar", 2), "battery");
    return { solar: sol.share, solarWithBattery: solB.share, battery: bat.share, batteryWithSolar: batS.share };
  }

  // practice drill items (three kinds, seeded; the test recomputes every answer)
  function drillItem(k, r) {
    var kind = k % 3;
    if (kind === 0) {
      var n = [200, 500, 1000][Math.floor(r() * 3)], c = 5 + Math.floor(r() * 120);
      return { kind: "lole", q: "In " + n.toLocaleString("en-US") + " simulated years, " + c + " days had at least one hour of shortfall. What is the [[lole|LOLE]], in days a year?", answer: Math.round(c / n * 1000) / 1000, tol: 0.0015, unit: "days a year",
               why: c + " ÷ " + n.toLocaleString("en-US") + " = " + (Math.round(c / n * 1000) / 1000).toFixed(3) + " days a year; " + (c / n <= 0.1 ? "within" : "above") + " the 0.1 criterion." };
    }
    if (kind === 1) {
      var size = [100, 200, 500][Math.floor(r() * 3)], f = 5 + Math.floor(r() * 90), e = Math.round(size * f / 100);
      return { kind: "acc", q: "Adding " + size + " MW of a resource cuts unserved energy as much as " + e + " MW of perfect capacity. What is its accreditation, in %?", answer: Math.round(e / size * 1000) / 10, tol: 0.6, unit: "%",
               why: e + " ÷ " + size + " = " + (Math.round(e / size * 1000) / 10).toFixed(1) + "%." };
    }
    var peak = 1000 * (3 + Math.floor(r() * 6)), inst = peak + 100 * (1 + Math.floor(r() * 12));
    return { kind: "rm", q: "A grid has " + inst.toLocaleString("en-US") + " MW installed for a " + peak.toLocaleString("en-US") + " MW peak. What is its reserve margin at nameplate, in %?", answer: Math.round((inst - peak) / peak * 1000) / 10, tol: 0.06, unit: "%",
             why: "(" + inst.toLocaleString("en-US") + " − " + peak.toLocaleString("en-US") + ") ÷ " + peak.toLocaleString("en-US") + " = " + (Math.round((inst - peak) / peak * 1000) / 10).toFixed(1) + "%." };
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

  function blocksText(o, r) {
    var s = r.rows.map(function (x) { return x.share; }), falling = s[1] < s[0] && s[2] < s[1];
    return o.label + ": " + s.map(pct).join(", then ") + ". " + (falling ? "**Each block counts less than the one before:** it covers hours the earlier blocks already made safe."
      : "**Not a steady fall here:** one block's rating carries sampling noise in 500 years, and a block can open hours where the next one helps.");
  }
  function mixText(m) {
    var up1 = m.solarWithBattery > m.solar, up2 = m.batteryWithSolar > m.battery;
    return "Solar " + pct(m.solar) + " alone, " + pct(m.solarWithBattery) + " beside the battery; the battery " + pct(m.battery) + " alone, " + pct(m.batteryWithSolar) + " beside more solar. " +
      (up1 && up2 ? "**Here each raises the other's rating:** solar shortens the evening gap, the battery covers it." : "**A rating moves with the mix:** state the mix whenever you quote one.");
  }
  var model = { T: T, DAYS: DAYS, MD: MD, MONTHS: MONTHS, sources: sources, geom: geom, outages: outages, weather: weather, simulate: simulate, plus: plus, block: block, evaluate: evaluate,
                loleSE: loleSE, yearsWith: yearsWith, histogram: histogram, efc: efc, accredit: accredit, reserveMargin: reserveMargin, capacity: capacity,
                daily: daily, dateOf: dateOf, season: season, study: study, blocks: blocks, mix: mix, drillItem: drillItem, blocksText: blocksText, mixText: mixText, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;
  window.LX.A5 = model;
  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "a05-adequacy", KEY = "a5-own";
  function css() {
    if (document.getElementById("a5-css")) return;
    H("style", { id: "a5-css", text: [
      ".a5-lab .lx-stepcard{grid-template-columns:minmax(0,1fr)}.a5-lab .lx-step-act{grid-template-columns:minmax(0,1fr)}.a5-lab .lx-stepcard>*,.a5-lab .lx-step-act>*{min-width:0}",
      ".a5-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".a5-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".a5-kpi{display:grid;padding:7px 11px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:104px}",
      ".a5-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display)}.a5-kpi b{font-family:var(--lx-f-mono);font-size:16px;font-weight:600}",
      ".a5-kpi.bad b{color:var(--lx-bad)}.a5-kpi.good b{color:var(--lx-good)}",
      ".a5-tbl{overflow-x:auto;max-width:100%}.a5-tbl table{width:100%;border-collapse:collapse;font-size:14px}",
      ".a5-tbl th,.a5-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:right;font-weight:400}",
      ".a5-tbl th:first-child,.a5-tbl td:first-child{text-align:left}",
      ".a5-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3);vertical-align:bottom}",
      ".a5-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.a5-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".a5-tbl td i{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--c);margin-right:6px}",
      ".a5-tbl td.ok{color:var(--lx-good)}.a5-tbl td.no{color:var(--lx-bad)}",
      ".a5-bars{margin:0;padding:0;list-style:none;display:grid;gap:6px}",
      ".a5-bars li{display:grid;grid-template-columns:minmax(6em,10em) minmax(0,1fr) 4.6em;gap:8px;align-items:center;font-size:14px}",
      ".a5-bars .bar{height:14px;border-radius:6px;background:var(--lx-surface-3);overflow:hidden;display:flex}",
      ".a5-bars .bar i{display:block;height:100%}.a5-bars b{font-family:var(--lx-f-mono);font-weight:600;text-align:right}",
      ".a5-cols{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}@media (min-width:760px){.a5-cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}",
      ".a5-cols h4{margin:0 0 6px;font-size:14px;font-weight:600}",
      ".a5-note{font-size:13.5px;color:var(--lx-ink-3);margin:0}",
      ".a5-busy{font-size:13.5px;color:var(--lx-ink-2);margin:0;min-height:1.3em}",
      "@media (max-width:560px){.a5-tbl table{font-size:12.5px}.a5-tbl th,.a5-tbl td{padding:4px 3px}.a5-tbl .ph{display:none}.a5-bars li{grid-template-columns:minmax(5em,7.5em) minmax(0,1fr) 4.2em;font-size:13px}}"
    ].join("\n") }, document.head);
  }
  function kpi(host, label, value, tone) { var k = H("div", { class: "a5-kpi" + (tone ? " " + tone : "") }, host); H("small", { text: label }, k); H("b", { text: value }, k); return k; }
  function table(host, head, rows, label) {
    var w = H("div", { class: "a5-tbl", tabindex: "0", role: "region", "aria-label": label }, host), t = H("table", null, w), hr = H("tr", null, H("thead", null, t));
    var ph = head.map(function (x) { return x.charAt(0) === "~"; });
    head.forEach(function (x, i) { H("th", { scope: "col", class: ph[i] ? "ph" : "", text: x.replace(/^~/, "") }, hr); });
    var b = H("tbody", null, t);
    rows.forEach(function (r) { var tr = H("tr", null, b); r.forEach(function (c, i) { var td = H("td", { class: (ph[i] ? "ph " : "") + (c && c.cls ? c.cls : "") }, tr); if (c && c.html != null) td.innerHTML = c.html; else td.textContent = c && c.text != null ? c.text : c; }); });
    return w;
  }
  function bars(host, rows, max, label) {
    var ul = H("ul", { class: "a5-bars", "aria-label": label }, host);
    rows.forEach(function (r) {
      var li = H("li", null, ul); H("span", { text: r.label }, li);
      var b = H("span", { class: "bar", role: "img", "aria-label": r.label + ": " + r.text }, li);
      H("i", { style: "width:" + Math.max(0, Math.min(100, r.value / max * 100)).toFixed(1) + "%;background:" + (r.color || "var(--lx-accent)") }, b);
      H("b", { text: r.text }, li);
    });
    return ul;
  }
  // run jobs one per tick, so the page stays responsive while accreditations are computed
  function queue(jobs, each, done) {
    var i = 0, out = [];
    (function step() {
      if (i >= jobs.length) { done(out); return; }
      setTimeout(function () { var v; try { v = jobs[i](); } catch (e) { done(null, e); return; } out.push(v); if (each) each(i, v); i++; step(); }, 0);
    })();
  }
  function hourLabel(h) { return (h < 10 ? "0" : "") + h + ":00"; }

  LX.mount(SLUG, function (live, data, root) {
    css(); root.classList.add("a5-lab");
    var D = data.a05_adequacy, P = data.path, SRC = sources(D, data.town_year, data.m03_capacity_expansion_2024, data.cf_targets, LX.townProfile);
    var own = LX.store.get(KEY, {}) || {}; function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var ST = { seed: D.sim.seed, S: null, base: null, cache: {} };
    function current() {
      if (!ST.S) { ST.S = simulate(D, SRC, ST.seed); ST.base = evaluate(ST.S, {}, true); ST.cache = {}; }
      return ST;
    }
    function reseed(s) { ST.seed = s; ST.S = null; current(); }
    function cached(key, f) { var c = ST.cache; if (!(key in c)) c[key] = f(); return c[key]; }
    function opt(id) { return D.adds.options.filter(function (o) { return o.id === id; })[0]; }
    var crit = D.criterion.lole, B = D.adds.blockMW;

    var steps = [
      // 1 one year
      { text: "The Plains Grid has 4,000 MW of coal and gas units, 3,000 MW of wind and 1,200 MW of solar for a 4,000 MW peak. Roll simulated years and look for days that run short.",
        build: function (act, api) {
          var row = H("div", { class: "a5-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Roll a year" }, row);
          var k = H("div", { class: "a5-kpis", "aria-live": "polite" }, act), ph = H("div", null, act), rolls = 0;
          go.addEventListener("click", function () {
            var st = current(), n = rolls, Sy = simulate(D, SRC, st.seed, { years: n + 1, keep: n }), dl = daily(Sy.full), short = dl.filter(function (x) { return x.min < 0; }).length;
            var tight = dl.slice().sort(function (a, b) { return a.min - b.min || a.day - b.day; })[0];
            rolls++; k.innerHTML = "";
            kpi(k, "Simulated year", String(n + 1)); kpi(k, "Days with a shortfall", String(short), short ? "bad" : "good"); kpi(k, "Tightest day", dateOf(tight.day) + ", " + (tight.min < 0 ? mw(-tight.min) + " short" : mw(tight.min) + " spare"));
            ph.innerHTML = "";
            var P1 = LX.Plot(ph, { box: true, text: "Text version of the year" }), ticks = [], tN = [], s0 = 0;
            MD.forEach(function (d, m) { ticks.push([s0, MONTHS[m]]); if (m % 3 === 0) tN.push([s0, MONTHS[m]]); s0 += d; });
            P1.render({ x: { min: 0, max: DAYS, ticks: ticks, ticksN: tN }, y: { min: -1000, max: 3000, step: 1000, fmt: function (v) { return v.toLocaleString("en-US").replace("-", "−"); }, unit: "MW" },
              lines: [{ values: dl.map(function (x) { return x.min; }), x0: 0.5, color: "var(--lx-accent)", width: 1.6 }],
              refs: [{ y: 0, label: "Short below this line", labelN: "Short", dash: "5 4" }],
              marks: dl.filter(function (x) { return x.min < 0; }).slice(0, 6).map(function (x) { return { x: x.day + 0.5, y: Math.max(-1000, x.min), kind: "dot", label: "" }; }),
              aria: "Simulated year " + (n + 1) + ": the spare MW in the tightest hour of each day; " + short + " days below zero.",
              text: { head: ["Day", "Spare MW in its tightest hour", "Hour starting (standard time)"], note: "Spare = available units + wind + sun − demand. Below zero is a shortfall.",
                rows: dl.filter(function (x) { return x.min < 300; }).map(function (x) { return [dateOf(x.day), int(x.min).replace("-", "−"), hourLabel(x.hour)]; }) } });
            if (rolls >= 3) { api.done(); remember("rolls", rolls); api.saw("Most simulated years have no shortfall day, and a few have several. **Adequacy is about the rare bad year, so one year shows little.**"); }
          });
          H("p", { class: "a5-note", html: LX.rich("Each week of a simulated year is a real week of 2024 or 2025, [[resampled-weather|resampled]]; units fail at random ([[forced-outage-rate|forced outages]]).") }, act);
        } },
      // 2 500 years
      { text: "Now 500 simulated years. Count the days with any shortfall and divide by 500: that is the [[lole|loss-of-load expectation]] (LOLE).",
        build: function (act, api) {
          var row = H("div", { class: "a5-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Run 500 years" }, row);
          var again = H("button", { type: "button", class: "lx-btn ghost small", text: "New seed", hidden: true }, row);
          var seedL = H("span", { class: "a5-note", "aria-live": "polite" }, row), out = H("div", { "aria-live": "polite" }, act);
          function show() {
            var st = current(), b = st.base, se = loleSE(b), h = histogram(b), y0 = h[0];
            seedL.textContent = "Seed " + st.seed + " · " + st.S.N + " years"; out.innerHTML = "";
            var k = H("div", { class: "a5-kpis" }, out);
            kpi(k, "LOLE", d3(b.lole) + " ± " + d3(2 * se) + " days/yr", b.lole > crit ? "bad" : "good"); kpi(k, "Criterion", String(crit) + " days/yr");
            kpi(k, "Shortfall hours", d2(b.lolh) + " h/yr"); kpi(k, "Unserved energy", int(b.eue) + " MWh/yr");
            bars(out, [{ label: "No shortfall day", value: h[0], text: String(h[0]) }, { label: "1 day", value: h[1], text: String(h[1]) }, { label: "2 days", value: h[2], text: String(h[2]) }, { label: "3 days or more", value: h[3], text: String(h[3]) }], st.S.N, "Simulated years by their number of shortfall days");
            H("p", { class: "a5-note", html: LX.rich("± two [[monte-carlo-error|Monte Carlo errors]]: another seed moves the LOLE about this much. Shortfall hours are the [[lolh|LOLH]]. Bars: years by shortfall days.") }, out);
            again.hidden = false; api.done(); remember("lole", b.lole);
            api.saw("LOLE " + d3(b.lole) + " days a year, " + (b.lole > crit ? "above" : "within") + " the 1-in-10 criterion of " + String(crit) + ". In " + y0 + " of " + st.S.N + " years nothing went short; the [[expected-unserved-energy|unserved energy]] averages " + int(b.eue) + " MWh a year.");
          }
          go.addEventListener("click", function () { current(); show(); });
          again.addEventListener("click", function () { reseed(ST.seed === D.sim.seed ? 1 : ST.seed + 1); show(); });
        } },
      // 3 when
      { text: "When do the shortfalls happen? Guess first, then see the 500 years' shortfall hours by month and by hour of day.",
        build: function (act, api) {
          var out = H("div", null, act);
          var pr = LX.Predict(act, { id: "a5-when", fresh: true, q: "", title: false, answer: "eve",
            options: [{ value: "noon", label: "Summer middays" }, { value: "eve", label: "Summer evenings" }, { value: "night", label: "Winter nights" }],
            feedback: { eve: "Yes: demand is still high when the sun sets.", noon: "Middays have the sun; the risk comes after sunset.", night: "Some winter hours go short, but most are summer evenings." },
            onPick: function () {
              var b = current().base, se = season(b.byMonth), top = 0;
              for (var h = 1; h < 24; h++) if (b.byHour[h] > b.byHour[top]) top = h;
              out.innerHTML = ""; var c = H("div", { class: "a5-cols" }, out), c1 = H("div", null, c), c2 = H("div", null, c);
              H("h4", { text: "Shortfall hours by month" }, c1); H("h4", { text: "By hour of day (hour starting, standard time)" }, c2);
              var mx = Math.max.apply(null, Array.prototype.slice.call(b.byMonth)) || 1, hx = Math.max.apply(null, Array.prototype.slice.call(b.byHour)) || 1;
              bars(c1, MONTHS.map(function (m, i) { return { label: m, value: b.byMonth[i], text: int(b.byMonth[i]), color: "var(--lx-bad)" }; }), mx, "Shortfall hours by month, all 500 years");
              var hrs = []; for (var q = 0; q < 24; q += 1) if (b.byHour[q] > 0) hrs.push(q);
              bars(c2, hrs.map(function (q) { return { label: hourLabel(q), value: b.byHour[q], text: int(b.byHour[q]), color: "var(--lx-bad)" }; }), hx, "Shortfall hours by hour of day, all 500 years");
              pr.reveal(); api.done(); remember("when", true);
              api.saw(pct(se.summer / se.total) + " of the " + int(se.total) + " shortfall hours fall in June to September, most often in the hour starting " + hourLabel(top) + "; December to February hold most of the rest.");
            } });
        } },
      // 4 reserve margin
      { text: "Each 500 MW below lifts a nameplate [[reserve-margin|reserve margin]] of " + fm.rm(reserveMargin(D)) + " by the same 12.5 points. Try three: which bring LOLE under 0.1?",
        build: function (act, api) {
          var row = H("div", { class: "a5-row", role: "group", "aria-label": "Add 500 MW of" }, act), out = H("div", { "aria-live": "polite" }, act), tried = {};
          function show() {
            out.innerHTML = ""; var st = current(), b = st.base;
            var rows = [["Nothing added", fm.rm(reserveMargin(D)), d3(b.lole), { text: b.lole <= crit ? "yes" : "no", cls: b.lole <= crit ? "ok" : "no" }]];
            D.adds.options.forEach(function (o) { if (!tried[o.id]) return; var e = cached("one-" + o.id, function () { return evaluate(st.S, block(D, o.id)); });
              rows.push([{ html: "<i style='--c:" + o.color + "'></i>" + LX.esc(o.label) }, fm.rm(reserveMargin(D, B)), d3(e.lole), { text: e.lole <= crit ? "yes" : "no", cls: e.lole <= crit ? "ok" : "no" }]); });
            table(out, ["500 MW added", "Margin at nameplate", "LOLE (days/yr)", "Meets 1-in-10?"], rows, "The reserve margin and LOLE with each 500 MW added");
            var n = Object.keys(tried).length;
            if (n >= 3) {
              var ls = Object.keys(tried).map(function (id) { return cached("one-" + id, function () { return evaluate(st.S, block(D, id)); }).lole; });
              api.done(); remember("tried", n);
              api.saw("The same " + fm.rm(reserveMargin(D, B) - reserveMargin(D)) + " added each time, yet LOLE runs from " + d3(Math.min.apply(null, ls)) + " to " + d3(Math.max.apply(null, ls)) + ". **A margin counted at nameplate cannot tell these apart.**");
            }
          }
          D.adds.options.forEach(function (o) {
            var b = H("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: o.label }, row);
            b.addEventListener("click", function () { tried[o.id] = true; b.setAttribute("aria-pressed", "true"); show(); });
          });
          H("p", { class: "a5-note", text: D.adds.options.map(function (o) { return o.label + ": " + o.detail; }).join(". ") + "." }, act);
          show();
        } },
      // 5 accreditation
      { text: "[[capacity-accreditation|Accreditation]] asks: how many MW of perfect, always-available capacity would cut [[expected-unserved-energy|unserved energy]] as much as this resource? Rate all five.",
        build: function (act, api) {
          var row = H("div", { class: "a5-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Rate all five" }, row);
          var busy = H("p", { class: "a5-busy", "aria-live": "polite" }, act), out = H("div", null, act);
          go.addEventListener("click", function () {
            go.disabled = true; api.busy(true); var st = current(), ops = D.adds.options;
            queue(ops.map(function (o) { return function () { return cached("acc-" + o.id, function () { return accredit(D, st.S, {}, o.id); }); }; }),
              function (i) { busy.textContent = "Rated " + (i + 1) + " of " + ops.length + "…"; },
              function (res, err) {
                go.disabled = false; api.busy(false);
                if (!res) { busy.textContent = "The rating stopped (" + (err && err.message || "error") + "). Try again."; return; }
                busy.textContent = ""; out.innerHTML = "";
                var rows = res.map(function (a, i) { var o = ops[i]; return { label: o.label, value: a.share, text: pct(a.share), color: o.color, a: a }; });
                bars(out, rows, 1, "Accredited share of 500 MW");
                table(out, ["Resource", "Firm MW at equal unserved energy", "~Unserved energy with it"], rows.map(function (r, i) { var e = cached("one-" + ops[i].id, function () { return evaluate(st.S, block(D, ops[i].id)); }); return [r.label, mw(r.a.mw), int(e.eue) + " MWh/yr"]; }), "Accredited MW of each 500 MW resource");
                api.done(); remember("acc", res.map(function (a) { return a.share; }));
                var by = {}; res.forEach(function (a, i) { by[ops[i].id] = a; });
                var eDR = cached("one-dr", function () { return evaluate(st.S, block(D, "dr")); }), eW = cached("one-wind", function () { return evaluate(st.S, block(D, "wind")); });
                api.saw("Peakers " + pct(by.ct.share) + ", battery " + pct(by.battery.share) + ", demand response " + pct(by.dr.share) + ", wind " + pct(by.wind.share) + ", solar " + pct(by.solar.share) + "." +
                  (eDR.lole < eW.lole && by.dr.share < by.battery.share ? " Demand response removes many short days but less energy: long evenings outlast its 4 hours." : ""));
              });
          });
          H("p", { class: "a5-note", html: LX.rich("The perfect MW is the [[equivalent-firm-capacity|equivalent firm capacity]]. Equal reliability here means equal unserved energy, as PJM rates its classes; a count of days moves in whole steps.") }, act);
        } },
      // 6 more of the same
      { text: "Add more of the same. Pick a resource and rate three blocks of 500 MW, each on top of the blocks before it.",
        build: function (act, api) {
          var row = H("div", { class: "a5-row", role: "group", "aria-label": "Resource" }, act), busy = H("p", { class: "a5-busy", "aria-live": "polite" }, act), out = H("div", null, act), btns = [];
          ["solar", "wind", "battery", "dr"].forEach(function (id) {
            var o = opt(id), b = H("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: o.label }, row); btns.push(b);
            b.addEventListener("click", function () {
              btns.forEach(function (x) { x.disabled = true; x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); api.busy(true); busy.textContent = "Rating three blocks…";
              setTimeout(function () {
                var r; try { r = cached("blocks-" + id, function () { return blocks(D, current().S, id); }); } catch (e) { r = null; }
                btns.forEach(function (x) { x.disabled = false; }); api.busy(false);
                if (!r) { busy.textContent = "The rating stopped. Try again."; return; }
                busy.textContent = ""; out.innerHTML = "";
                bars(out, r.rows.map(function (x) { return { label: "Block " + x.k + " (" + int(B * (x.k - 1)) + " MW before it)", value: x.share, text: pct(x.share), color: o.color }; }), 1, o.label + ": accreditation of each 500 MW block");
                api.done(); remember("blocks-" + id, r.rows.map(function (x) { return x.share; }));
                api.saw(blocksText(o, r));
              }, 0);
            });
          });
        } },
      // 7 the mix
      { text: "Resources change each other's ratings. Rate 500 MW of solar alone and beside a 500 MW battery; then the battery alone and beside 1,000 MW more solar.",
        build: function (act, api) {
          var row = H("div", { class: "a5-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Rate the pairs" }, row);
          var busy = H("p", { class: "a5-busy", "aria-live": "polite" }, act), out = H("div", null, act);
          go.addEventListener("click", function () {
            go.disabled = true; api.busy(true); busy.textContent = "Rating…";
            setTimeout(function () {
              var m; try { m = cached("mix", function () { return mix(D, current().S); }); } catch (e) { m = null; }
              go.disabled = false; api.busy(false);
              if (!m) { busy.textContent = "The rating stopped. Try again."; return; }
              busy.textContent = ""; out.innerHTML = "";
              table(out, ["500 MW of", "Alone", "Beside the other"], [["Solar (beside a 500 MW battery)", pct(m.solar), pct(m.solarWithBattery)], ["Battery (beside 1,000 MW more solar)", pct(m.battery), pct(m.batteryWithSolar)]], "Accreditation alone and beside another resource");
              var R = D.reference.repeats;
              if (R) H("p", { class: "a5-note", text: "Repeated with seeds 1 to 20: solar rated higher beside the battery in " + R.solarUp + " of 20, the battery higher beside more solar in " + R.batteryUp + " of 20." }, out);
              api.done(); remember("mix", m);
              api.saw(mixText(m));
            }, 0);
          });
        } },
      // 8 real ratings
      { text: "PJM, the largest U.S. grid operator, rates each class for its 2028/29 capacity auction: gas peakers 67%, below this lesson's peakers. Why might that be?",
        build: function (act, api) {
          var out = H("div", null, act);
          var pr = LX.Predict(act, { id: "a5-pjm", fresh: true, q: "", title: false, answer: "weather",
            options: [{ value: "weather", label: "PJM's outages depend on the weather" }, { value: "size", label: "PJM's peakers are larger" }, { value: "years", label: "PJM simulates fewer years" }],
            feedback: { weather: "Yes: PJM simulates outages as a function of weather (its Manual 20A); here they are independent.", size: "Size is not the reason given: PJM simulates outages as a function of weather.", years: "Not the reason: PJM simulates outages as a function of weather; here they are independent." },
            onPick: function () {
              var st = current(); out.innerHTML = "";
              var mine = {}; D.adds.options.forEach(function (o) { var a = st.cache["acc-" + o.id]; if (a) mine[o.id] = a.share; });
              table(out, ["Class", "PJM 2028/29", "This lesson"], D.pjm.rows.filter(function (r) { return r.id !== "cc"; }).map(function (r) { return [r.label, r.pct + "%", mine[r.id] != null && r.id !== "solar-fixed" ? pct(mine[r.id]) : "–"]; }), "PJM's class ratings next to this lesson's");
              H("p", { class: "a5-note", text: "PJM: " + D.pjm.source + " (" + D.pjm.asOf + "). One auction's ratings for one grid, not values for every grid." }, out);
              pr.reveal(); api.done(); LX.progress.done(SLUG);
              api.saw("A rating belongs to one grid, one mix and one model. **Cold snaps that knock out many units at once lower the peakers' rating; Analyst lesson [[lesson:a09-hazards|A9]] brings such hazards in.**");
            } });
        } }
    ];
    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "a5-steps", steps: steps });
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 2 : m ? +m[1] : 0;
      if (!n) return null;
      cards.go(Math.min(steps.length, n) - 1);
      var b = cardsHost.querySelector(".lx-step-act .lx-btn");
      if (n === 1 && b) { b.click(); b.click(); b.click(); }
      else if (n === 3) { var c = cardsHost.querySelector(".lx-step-act .lx-choice"); if (c) c.click(); }
      else if (n === 4) { Array.prototype.slice.call(cardsHost.querySelectorAll(".lx-step-act .a5-row .lx-btn"), 0, 3).forEach(function (x) { x.click(); }); }
      else if (b) b.click();
      return { view: state };
    }, cards);
    drill();
    root.lxLesson = { model: model, D: D, ST: ST, cards: cards };
    explain(D, current(), P);
  });

  // ---------------------------------------------------------------- practice drill (three kinds, seeded; answers recomputed in the test)
  function drill() {
    var host = document.getElementById("a5-drill"); if (!host || !LX.Drill) return;
    LX.Drill(host, { item: drillItem, hint: "LOLE from a count of days, an accreditation, a reserve margin. About 10 minutes for ten items.", empty: "Type a number first." });
  }

  // ---------------------------------------------------------------- explain layer: concept map, flowchart, comparison table
  function explain(D, st, P) {
    var x = document.getElementById("a5-explain"); if (!x) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var b = st.base, R = D.reference, A = R.single || {};
    LX.ConceptMap(H("div", { class: "lx-xcard" }, x), {
      title: "What an adequacy study connects", lede: "Tap a node to see what it means in this lesson.",
      groups: { in: ["Inputs", "var(--lx-wind)"], sim: ["Simulation", "var(--lx-accent)"], out: ["Measures", "var(--lx-bad)"] },
      cols: 4, rows: 3, colsN: 3, rowsN: 4, sel: "margin",
      nodes: [
        { id: "weather", g: "in", label: "Weather", at: [0, 0], atN: [0, 0], text: "Demand, wind and sun move together. Here: real weeks of 2024 and 2025, resampled into 500 years." },
        { id: "outages", g: "in", label: "Unit outages", lines: ["Unit", "outages"], at: [1, 0], atN: [1, 0], text: "Units fail at random and wait for repair: out 5% to 8% of the time here, independently." },
        { id: "fleet", g: "in", label: "Fleet and mix", lines: ["Fleet and", "mix"], at: [2, 0], atN: [2, 0], text: "What is installed: units, wind, solar, storage, demand response." },
        { id: "margin", g: "sim", label: "Hourly margin", lines: ["Hourly", "margin"], at: [1, 1], atN: [1, 1], text: "Available supply minus demand, every hour of every simulated year; storage and demand response act on it." },
        { id: "short", g: "sim", label: "Shortfall", at: [2.6, 1], atN: [1, 2], text: "Any hour the margin stays below zero: demand that cannot be served." },
        { id: "lole", g: "out", label: "LOLE", at: [0.4, 2], atN: [0, 3], text: "Shortfall days a year: " + d3(R.base ? R.base.lole : b.lole) + " here, against a criterion of 0.1." },
        { id: "eue", g: "out", label: "EUE", at: [1.5, 2], atN: [1, 3], text: "Unserved MWh a year: depth and length, which LOLE ignores." },
        { id: "acc", g: "out", label: "Accreditation", at: [2.6, 2], atN: [2, 3], text: "Perfect MW giving the same unserved energy, as a share of the MW added; it changes with the mix." }
      ],
      edges: [["weather", "margin", "sets demand and output"], ["outages", "margin", "removes MW"], ["fleet", "margin", "adds MW"], ["margin", "short", "below zero"], ["short", "lole", "count days"], ["short", "eue", "add MWh"], ["eue", "acc", "matched by"]]
    });
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "An adequacy study, move by move", lede: "Trace how a planner checks a grid and rates a new resource.",
      nodes: {
        w: { t: "Draw a weather year", tN: ["Draw a", "weather year"], s: "resampled weeks", sN: "weeks" },
        o: { t: "Draw unit outages", tN: ["Draw unit", "outages"], s: "random, independent", sN: "random" },
        h: { t: "Hour by hour: margin", tN: ["Hour by hour:", "margin"], s: "storage, demand response", sN: "8,760 h" },
        n: { t: "500 years done?", tN: ["500 years", "done?"], k: "q" },
        m: { t: "LOLE, LOLH, EUE", tN: ["LOLE, LOLH,", "EUE"], s: "with their error", sN: "± error" },
        c: { t: "Meets 0.1 days/yr?", tN: ["Meets 0.1", "days/yr?"], k: "q" },
        a: { t: "Add a resource", tN: ["Add a", "resource"], s: "rate it by EUE", sN: "rate by EUE" },
        r: { t: "Report the rating with its mix", tN: ["Report rating", "with its mix"], k: "end" }
      },
      cols: 3, at: { w: [1, 0], o: [1, 1], h: [1, 2], n: [1, 3], m: [1, 4], c: [1, 5], a: [2, 5], r: [1, 6] },
      colsN: 2, atN: { w: [0, 0], o: [0, 1], h: [0, 2], n: [0, 3], m: [0, 4], c: [0, 5], a: [1, 5], r: [0, 6] },
      edges: [["w", "o"], ["o", "h"], ["h", "n"], ["n", "w", "no", { l: "next year" }], ["n", "m", "yes"], ["m", "c"], ["c", "a", "no"], ["a", "w", "re-run", { l: "same seed" }], ["c", "r", "yes"]],
      traces: [
        { label: "This grid", path: ["w", "o", "h", "n", "m", "c", "a"], text: "LOLE " + d3(R.base ? R.base.lole : b.lole) + " fails the criterion: add a resource and re-run with the same seed." },
        { label: "With 500 MW of peakers", path: ["w", "o", "h", "n", "m", "c", "r"], text: A.ct ? "LOLE " + d3(A.ct.lole) + ": it meets 0.1, accredited at " + pct(A.ct.share) + "." : "It meets the criterion." }
      ], sel: 0
    });
    var rows = [
      { key: "screen", name: "Reserve-margin screen", what: "MW installed over the peak", need: "a peak forecast and a list of plants", miss: "when MW show up; outages; storage limits" },
      { key: "study", name: "Probabilistic study", what: "shortfall days, hours and MWh", need: "weather years, outage rates, hourly dispatch", miss: "what its weather and outage model leave out" }
    ];
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "A screen against a study", text: true,
      columns: [{ key: "name", label: "Method", main: true }, { key: "what", label: "Counts" }, { key: "need", label: "Needs" }, { key: "miss", label: "Misses" }],
      rows: rows, sorts: [{ label: "As listed", order: ["screen", "study"], note: "Planners set the screen's target margin from a study, then use the margin between studies." }]
    });
  }
})();
