/* engine-e0.js — LX.E0: engine E0 of the course (curriculum v2 §16.4): one site behind one meter, sized and run hour by
   hour as a linear program. Written for the Site Bench (SB0) and its capstone (C0). Lesson A8 keeps its own week LP (least unserved
   energy on a regional grid, stores with their own losses that start full), which this engine does not model.
   Data a page passes in: assets/learn/data/e0.json (the two sites, every cost with its source and dollar year, the price
   index, the week rule, the tie rule), town_year.json (every hour of 2025 on the Southwest Power Pool grid, EIA-930, as
   shapes) and cf_targets.json (EIA's 2025 capacity factors, used through LX.townProfile, components/profiles.js).

   The sites (fictional; their hourly shapes are real, their loads illustrative):
     home   household use (the town's demand shape, 9,000 kWh a year) and a heating need (a smooth made-up temperature,
            14,000 kWh of heat a year). Decisions: rooftop solar (kW), a battery (kWh; power = kWh / 2.5 h), a heat pump
            (none: keep the gas furnace; standard; high efficiency), the tariff (flat or time-of-use) and the export credit.
     farm   the ridge wind farm: wind (MW), the line to the grid (MW, sell only), a 4-hour battery (MWh), an electrolyzer
            (MW), a hydrogen tank (t) and a buyer who takes at most so many kg of hydrogen an hour at a set price.
   The model (an LP for LX.solver; every cost in 2025 dollars, converted in costs() with EIA's GDP price index):
     decisions  every modelled hour: home: grid import and export, battery charge and discharge, state of charge;
                farm: sales to the grid, battery charge and discharge, state of charge, electrolyzer power (what is left of
                the wind is spilled: the balance row's slack),
                hydrogen sold, hydrogen in the tank. With opts.size the sizes are decisions too (home: solar, battery;
                farm: battery, electrolyzer, tank), each charged its equivalent annual cost (capital recovery factor at
                the plan's rate over its own life, plus fixed upkeep).
     goal       least yearly cost: home: imports × the hour's price − exports × the credit; farm: −(sales × the hour's
                price + hydrogen × its price) + the electrolyzer's stack wear; plus the tie rule below.
     rules      every hour: the site's energy balance; charge and discharge at most the battery's power; state of
                charge between 0 and its energy (85% round trip, the loss on charging); farm: sales at most the line,
                electrolyzer at most its size, hydrogen made = MWh × 1000 / 57.5 kg, tank between 0 and its size, hydrogen
                sold at most the buyer's take; home: exports at most the panels' output (the battery does not export).
                Every plan is feasible (the grid balances the home; spilled wind balances the farm).
     time       representative weeks (weeks(): one medoid week per season, scaled to keep the season's energy, plus
                extreme weeks kept as they are; each stands for its weeks, and the 24 hours of 31 December are spread
                over the weights). Storage ends each week where it started (no storage between weeks). opts.full builds
                the same LP on all 8,760 hours with storage cyclic over the year: the check used by the tests.
     tie rule   a wear charge (e0.json tie: $0.0002/kWh home, $0.02/MWh farm) on battery charge and discharge, and on the
                farm a hair's preference (TIME, one part in a million at most) for selling power and hydrogen earlier in the
                week; both are left out of every reported number (read() prices the flows itself). Hour-by-hour schedules can still tie; the totals summarize() reports are shared
                by every least-cost schedule (_tests/learn/test_sb0-site-bench.js pushes each one up and down on the
                optimal face).
     money      NPV over the site's horizon (home 25 years, farm 30) at the plan's real rate: year 0 the equipment,
                then each year the saving (home: the bill and gas against the same home with nothing new) or the net
                revenue (farm), less fixed upkeep; replacements when a life ends; a straight-line residual value at the
                end. One weather year (2025) is repeated; prices and costs stay the same in real terms.
     CO2        operating CO2 only. Home: (bought − sent back) × Kansas's 2024 average factor, plus gas burned. Farm: no
                operating CO2; CO2 avoided if its hydrogen replaces hydrogen made from natural gas.
   Pure API (Node: require("assets/learn/components/engine-e0.js"); browser: LX.E0):
     schema, presets, SITES, defaults(), prepare(D, year, targets[, townProfile]) -> P, costs(D, s), periods(P, s, full),
     build(P, s, opts) -> model, read(P, s, solverResult, opts) -> raw, summarize(s, raw) -> results (every number a page
     shows), solve(s, P, { signal, timeLimit, attempt, size, full, solver }) -> Promise of { status, ok, message, hint,
     results, kind, ms } (never rejects; solver defaults to LX.solver.solve; Node tests pass core.solveWith), snap(s,
     sizes), sensitivity(s, P, base, opts) -> Promise of tornado rows, note(s, results), fallback(D) (no-JS tables from
     D.reference), resultsHTML(results), crf, usd, cashflow, HOURS, HPW, WEEKS.
   Page kit (browser): LX.E0.ui (components/engine-e0.js, view part below): bench(host, opts) builds the controls,
   presets, run box (LX.BenchRun), plan link (LX.ShareState), readouts and results. Styles: engine-e0.css. */
(function () {
  "use strict";
  var HPW = 168, WEEKS = 52, HOURS = 8760, TIME = 1e-6;
  // the LP's units (scaling, for speed; read() converts back): home costs in cents; farm costs in thousands of dollars,
  // hydrogen and the tank in tonnes
  var SC = { home: 100, farm: 1e-3 };
  var SEASONS = [["winter", [12, 1, 2]], ["spring", [3, 4, 5]], ["summer", [6, 7, 8]], ["fall", [9, 10, 11]]];
  var SITES = ["home", "farm"];

  // ---------------------------------------------------------------- the plan (LX.ShareState schema)
  var schema = { key: "sb0", version: 1, title: "Site Bench plan",
    fields: [
      { id: "site", short: "s", type: "enum", values: ["home", "farm"], names: { home: "Prairie Town home", farm: "Ridge wind farm" }, def: "home", label: "Site" },
      { id: "pv", short: "pv", type: "num", min: 0, max: 15, step: 0.5, def: 6, label: "Rooftop solar", unit: "kW", site: "home" },
      { id: "hb", short: "hb", type: "num", min: 0, max: 30, step: 0.5, def: 0, label: "Home battery", unit: "kWh", site: "home" },
      { id: "hp", short: "hp", type: "enum", values: ["none", "standard", "high"], names: { none: "none (keep the gas furnace)", standard: "standard heat pump", high: "high-efficiency heat pump" }, def: "none", label: "Heat pump", site: "home" },
      { id: "tariff", short: "t", type: "enum", values: ["flat", "tou"], names: { flat: "flat price", tou: "time-of-use" }, def: "flat", label: "Tariff", site: "home" },
      { id: "xc", short: "x", type: "num", min: 0, max: 8, step: 0.5, def: 4, label: "Export credit", unit: "¢/kWh", site: "home" },
      { id: "wind", short: "w", type: "int", min: 0, max: 300, step: 10, def: 150, label: "Wind farm", unit: "MW", site: "farm" },
      { id: "line", short: "l", type: "int", min: 10, max: 300, step: 10, def: 100, label: "Line to the grid", unit: "MW", site: "farm" },
      { id: "fb", short: "fb", type: "int", min: 0, max: 1000, step: 10, def: 0, label: "Battery (4 hours)", unit: "MWh", site: "farm" },
      { id: "el", short: "e", type: "int", min: 0, max: 200, step: 5, def: 0, label: "Electrolyzer", unit: "MW", site: "farm" },
      { id: "tank", short: "k", type: "int", min: 0, max: 200, step: 1, def: 0, label: "Hydrogen tank", unit: "t", site: "farm" },
      { id: "take", short: "o", type: "int", min: 0, max: 5000, step: 100, def: 1000, label: "Buyer takes at most", unit: "kg/h", site: "farm" },
      { id: "h2", short: "h", type: "num", min: 1, max: 8, step: 0.25, def: 4, label: "Hydrogen price", unit: "$/kg", site: "farm" },
      { id: "sale", short: "p", type: "enum", values: ["flat", "tou"], names: { flat: "fixed $50/MWh", tou: "time-of-use" }, def: "flat", label: "Power contract", site: "farm" },
      { id: "rate", short: "r", type: "num", min: 0, max: 10, step: 0.5, def: 4, label: "Discount rate (real)", unit: "%" },
      { id: "cost", short: "c", type: "int", min: 50, max: 150, step: 5, def: 100, label: "Equipment cost", unit: "% of sourced" }],
    check: function () { return null; } };
  // presets fill their own site's fields and the site; every other field keeps the reader's value
  var presets = [
    { id: "solar", site: "home", label: "Solar only", state: { site: "home", pv: 6, hb: 0, hp: "none", tariff: "flat" } },
    { id: "solarbat", site: "home", label: "Solar and a battery", state: { site: "home", pv: 6, hb: 12.5, hp: "none", tariff: "tou" } },
    { id: "hp", site: "home", label: "Heat pump only", state: { site: "home", pv: 0, hb: 0, hp: "standard", tariff: "flat" } },
    { id: "allin", site: "home", label: "All three", state: { site: "home", pv: 8, hb: 12.5, hp: "high", tariff: "tou" } },
    { id: "farm", site: "farm", label: "Wind farm alone", state: { site: "farm", wind: 150, line: 100, fb: 0, el: 0, tank: 0, sale: "flat" } },
    { id: "farmbat", site: "farm", label: "Add a battery", state: { site: "farm", wind: 150, line: 100, fb: 200, el: 0, tank: 0, sale: "tou" } },
    { id: "farmel", site: "farm", label: "Add an electrolyzer", state: { site: "farm", wind: 150, line: 100, fb: 0, el: 50, tank: 0, take: 1000, sale: "flat" } },
    { id: "farmtank", site: "farm", label: "Electrolyzer and tank", state: { site: "farm", wind: 150, line: 100, fb: 0, el: 50, tank: 10, take: 500, sale: "flat" } }];
  // the same plan under another page's key (a capstone's links never open on the sandbox, and the other way round)
  function schemaFor(key, title) { var o = {}, k; for (k in schema) o[k] = schema[k]; o.key = key; if (title) o.title = title; return o; }
  function defaults() { var o = {}; schema.fields.forEach(function (f) { o[f.id] = Array.isArray(f.def) ? f.def.slice() : f.def; }); return o; }
  function withPreset(s, p) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in p.state) o[k] = p.state[k]; return o; }
  function field(id) { return schema.fields.filter(function (f) { return f.id === id; })[0]; }

  // ---------------------------------------------------------------- money helpers
  function crf(r, n) { return r === 0 ? 1 / n : r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1); }
  function usd(D, v, year) { var ix = D.deflator.index; return v * ix[String(D.priceYear)] / ix[String(year || D.priceYear)]; }
  // unit costs of a plan, 2025 dollars: capex per unit (home: $/kW, $/kWh, $ a unit; farm: $/MW, $/MWh, $/kg), fixed
  // upkeep a year, life (years) and the equivalent annual cost per unit (capital recovery at the plan's rate + upkeep)
  function costs(D, s) {
    var r = s.rate / 100, m = s.cost / 100, H = D.home, F = D.farm, C = {};
    function item(capex, fom, life) { return { capex: capex * m, fom: fom * m, life: life, eac: capex * m * crf(r, life) + fom * m }; }
    var hpk = s.hp && s.hp !== "none" ? H.hp[s.hp] : null;
    C.pv = item(usd(D, H.pv.capex, H.pv.capexYear), H.pv.fom, H.pv.life);                                  // per kW
    var hbc = usd(D, H.battery.capex, H.battery.capexYear);
    C.hb = item(hbc, hbc * H.battery.fomShare, H.battery.life);                                             // per kWh
    C.hp = hpk ? item(usd(D, hpk.capex, H.hp.capexYear), 0, H.hp.life) : item(0, 0, H.hp.life);             // one unit
    C.wind = item(1000 * usd(D, F.wind.capex, F.wind.capexYear), 1000 * F.wind.fom, F.wind.life);           // per MW
    var fbk = 1000 * usd(D, F.battery.capexPerkW, F.battery.capexYear) / F.battery.hours;
    C.fb = item(fbk, 1000 * F.battery.fomPerkW / F.battery.hours, F.battery.life);                          // per MWh
    var elc = 1000 * usd(D, F.electrolyzer.capex, F.electrolyzer.capexYear);
    C.el = item(elc, elc * F.electrolyzer.fomShare, F.electrolyzer.life);                                   // per MW
    C.elWear = elc * m * F.electrolyzer.stackShare / F.electrolyzer.stackHours;                             // $ per MWh used
    C.tank = item(usd(D, F.tank.capexPerKg, F.tank.capexYear), 0, F.tank.life);                             // per kg
    return C;
  }

  // ---------------------------------------------------------------- the sites' hours
  function sum(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t; }
  function temperature(Ht) {   // °C, every hour of the year: a smooth made-up year (illustrative)
    var T = new Array(HOURS);
    for (var i = 0; i < HOURS; i++) {
      var d = Math.floor(i / 24), h = i % 24;
      T[i] = Ht.mean - Ht.season * Math.cos(2 * Math.PI * (d - (Ht.coldDay - 1)) / 365) + Ht.daily * Math.cos(2 * Math.PI * (h - Ht.warmHour) / 24);
    }
    return T;
  }
  function weekStart(start, i) { return new Date(Date.parse(start + "Z") + (i * HPW - 1) * 3600000 - 6 * 3600000); }
  function weekMonth(start, i) { return new Date(weekStart(start, i).getTime() + 84 * 3600000).getUTCMonth() + 1; }
  function seasonOf(start, i) { var m = weekMonth(start, i); return SEASONS.filter(function (S) { return S[1].indexOf(m) >= 0; })[0][0]; }
  function prepare(D, year, targets, profile) {
    var tp = profile || (typeof window !== "undefined" && window.LX && window.LX.townProfile);
    if (!tp) throw new Error("E0.prepare: the capacity-factor helper (LX.townProfile) is missing");
    if (!year || !year.demand || year.demand.length !== HOURS) throw new Error("E0.prepare: town_year.json must hold 8,760 hours");
    var H = D.home, F = D.farm, P = { D: D, start_utc: year.start_utc };
    // home: use, heat, panels, heat pump electricity, prices
    var ds = sum(year.demand), use = year.demand.map(function (v) { return v / ds * H.use.kWh; });
    var T = temperature(H.heat), hdh = T.map(function (t) { return Math.max(0, H.heat.base - t); }), hs = sum(hdh);
    var heat = hdh.map(function (v) { return v / hs * H.heat.kWh; });
    var pv = tp("solar", 1, { year: year, targets: targets, annualCF: H.solar.cf, method: H.solar.method, monthlyCF: true });
    var tw = 0; for (var i = 0; i < HOURS; i++) tw += heat[i] * T[i]; tw /= H.heat.kWh;   // heat-weighted mean temperature
    var hpE = {};
    ["standard", "high"].forEach(function (k) {
      var cs = H.hp[k].hspf / 3.412, f = T.map(function (t) { return Math.max(0.4, 1 + H.hp.slope * (t - tw)); });
      var a = 0; for (var j = 0; j < HOURS; j++) a += heat[j] / f[j];
      var kk = cs * a / H.heat.kWh;                                   // so that the season's heat / electricity = cs
      hpE[k] = heat.map(function (q, j) { return q / (kk * f[j]); });
    });
    var pk = H.tariff.peak, inPk = function (i) { var h = i % 24; return h >= pk[0] && h < pk[1]; };
    var up = 0; for (i = 0; i < HOURS; i++) up += use[i] * (inPk(i) ? H.tariff.touRatio : 1);
    var off = H.tariff.flat * sum(use) / up;                         // off-peak price: revenue-neutral on the household use
    P.home = { use: use, heat: heat, temp: T, pv: pv.mw, pvCF: pv.cf, hpE: hpE,
      buy: { flat: use.map(function () { return H.tariff.flat; }), tou: use.map(function (_, j) { return inPk(j) ? off * H.tariff.touRatio : off; }) },
      touOff: off, touPeak: off * H.tariff.touRatio, cop: { standard: H.hp.standard.hspf / 3.412, high: H.hp.high.hspf / 3.412 } };
    // farm: wind per MW, contract prices
    var w = tp("wind", 1, { year: year, targets: targets, annualCF: F.wind.cf, method: F.wind.method, monthlyCF: true });
    var tk = F.sale.tou, inT = function (j) { var h = j % 24; return h >= tk.hours[0] && h < tk.hours[1]; };
    P.farm = { wind: w.mw, windCF: w.cf, sell: { flat: w.mw.map(function () { return F.sale.flat; }), tou: w.mw.map(function (_, j) { return inT(j) ? tk.peak : tk.off; }) } };
    // representative weeks
    var WK = D.weeks;
    P.home.weeks = weeks(P.start_utc, { use: use, heat: heat, hpS: hpE.standard, hpH: hpE.high, pv: pv.mw }, ["use", "heat", "pv"], { pv: true },
      WK.home.extremes.map(function (k) {
        if (k === "peak") return { kind: k, score: function (h0) { var m = 0; for (var h = h0; h < h0 + HPW; h++) m = Math.max(m, use[h]); return m; } };
        if (k === "netpeak") return { kind: k, score: function (h0) { var m = -Infinity; for (var h = h0; h < h0 + HPW; h++) m = Math.max(m, use[h] + hpE.standard[h] - WK.home.pvRef * pv.mw[h]); return m; } };
        throw new Error("E0: unknown home extreme " + k);
      }), WK.home.perSeason);
    P.farm.weeks = weeks(P.start_utc, { wind: w.mw }, ["wind"], { wind: true },
      WK.farm.extremes.map(function (k) {
        if (k === "calm") return { kind: k, score: function (h0) { var t = 0; for (var h = h0; h < h0 + HPW; h++) t += w.mw[h]; return -t; } };
        throw new Error("E0: unknown farm extreme " + k);
      }), WK.farm.perSeason);
    return P;
  }
  // representative weeks of a site: RW = { reps: [{ week, kind, season, n, members, weight, start, scale, series }], chrono }
  // (the shape LX.WeekStrip draws). series: {key: 8,760 values}; dist: the keys compared hour by hour (each over its own
  // maximum); frac: keys that are fractions of a size (capped at 1 after scaling); extremes: [{kind, score(firstHour)}]
  function weeks(start, series, dist, frac, extremes, per) {
    var keys = Object.keys(series), norm = {}, i, taken = {}, picks = [];
    dist.forEach(function (k) { var m = 0; series[k].forEach(function (v) { if (v > m) m = v; }); norm[k] = m || 1; });
    function wsum(k, wk) { var t = 0; for (var h = wk * HPW; h < (wk + 1) * HPW; h++) t += series[k][h]; return t; }
    function wdist(a, b) {
      var x = 0, A = a * HPW, B = b * HPW;
      dist.forEach(function (k) { var s = series[k], n = norm[k]; for (var h = 0; h < HPW; h++) { var d = (s[A + h] - s[B + h]) / n; x += d * d; } });
      return x;
    }
    extremes.forEach(function (x) {
      var b = -1, bs = -Infinity;
      for (var j = 0; j < WEEKS; j++) if (!taken[j]) { var sc = x.score(j * HPW); if (sc > bs) { bs = sc; b = j; } }
      taken[b] = true; picks.push({ week: b, kind: x.kind });
    });
    function medoid(m) {
      var bw = -1, bd = Infinity;
      m.forEach(function (c) { var t = 0; m.forEach(function (o) { if (o !== c) t += wdist(c, o); }); if (t < bd) { bd = t; bw = c; } });
      return bw;
    }
    function groups(members) {
      if (per === 1 || members.length <= per) return [members];
      var meds = [medoid(members)];
      while (meds.length < per) {
        var far = -1, fd = -1;
        members.forEach(function (m) { if (meds.indexOf(m) >= 0) return; var d = Math.min.apply(null, meds.map(function (q) { return wdist(m, q); })); if (d > fd) { fd = d; far = m; } });
        meds.push(far);
      }
      for (var it = 0; it < 20; it++) {
        var gs = meds.map(function () { return []; });
        members.forEach(function (m) { var b = 0, bd = Infinity; meds.forEach(function (q, k) { var d = wdist(m, q); if (d < bd) { bd = d; b = k; } }); gs[b].push(m); });
        var nm = gs.map(medoid);
        if (nm.join() === meds.join()) return gs;
        meds = nm;
      }
      return gs;
    }
    var reps = [], map = new Array(WEEKS);
    SEASONS.forEach(function (S) {
      var members = [];
      for (var j = 0; j < WEEKS; j++) if (!taken[j] && seasonOf(start, j) === S[0]) members.push(j);
      groups(members).forEach(function (g) {
        var bw = medoid(g), scale = {};
        keys.forEach(function (k) { var tot = 0; g.forEach(function (m) { tot += wsum(k, m); }); var b = wsum(k, bw); scale[k] = b > 0 ? tot / g.length / b : 1; });
        g.forEach(function (m) { map[m] = reps.length; });
        reps.push({ week: bw, kind: "season", season: S[0], n: g.length, members: g, scale: scale });
      });
    });
    picks.forEach(function (x) {
      map[x.week] = reps.length;
      var scale = {}; keys.forEach(function (k) { scale[k] = 1; });
      reps.push({ week: x.week, kind: x.kind, season: seasonOf(start, x.week), n: 1, members: [x.week], scale: scale });
    });
    var f = HOURS / (WEEKS * HPW);
    reps.forEach(function (r) {
      r.weight = r.n * f;
      r.start = weekStart(start, r.week).toISOString().slice(0, 10);
      r.series = {};
      keys.forEach(function (k) {
        var a = [], A = r.week * HPW;
        for (var h = 0; h < HPW; h++) { var v = series[k][A + h] * r.scale[k]; a.push(frac[k] ? Math.min(1, v) : v); }
        r.series[k] = a;
      });
    });
    return { reps: reps, chrono: map };
  }

  // ---------------------------------------------------------------- periods and the LP
  // the periods a model covers. mode "week": the 52 calendar weeks of 2025 as they are, then 31 December (24 hours):
  // every hour of the year once, storage cyclic within each period; "reps": the representative weeks with their weights
  // (sizing); "year": all 8,760 hours as one period, storage cyclic over the year (the check)
  function seriesOf(P, site) {
    var S = P[site];
    return site === "home" ? { use: S.use, heat: S.heat, hpS: S.hpE.standard, hpH: S.hpE.high, pv: S.pv } : { wind: S.wind };
  }
  function slice(P, site, h0, n, i) {
    var all = seriesOf(P, site), series = {};
    for (var k in all) series[k] = all[k].slice(h0, h0 + n);
    return { n: n, w: 1, h0: h0, week: i, kind: i === WEEKS ? "day" : "week", weeks: 1, start: i === WEEKS ? "2025-12-31" : weekStart(P.start_utc, i).toISOString().slice(0, 10), series: series };
  }
  function periods(P, s, mode) {
    var site = s.site;
    if (mode === "year") return [{ n: HOURS, w: 1, h0: 0, week: null, kind: "year", weeks: WEEKS, start: P.start_utc.slice(0, 10), series: seriesOf(P, site) }];
    if (mode === "reps") return P[site].weeks.reps.map(function (r) { return { n: HPW, w: r.weight, h0: r.week * HPW, week: r.week, kind: r.kind, season: r.season, weeks: r.n, start: r.start, series: r.series }; });
    var out = []; for (var i = 0; i < WEEKS; i++) out.push(slice(P, site, i * HPW, HPW, i));
    out.push(slice(P, site, WEEKS * HPW, HOURS - WEEKS * HPW, WEEKS));
    return out;
  }
  // the plan in model units
  function sizes(s) {
    if (s.site === "home") return { pv: s.pv, hb: s.hb, hbP: s.hb / 2.5 };
    return { wind: s.wind, line: s.line, fb: s.fb, fbP: s.fb / 4, el: s.el, tank: s.tank * 1000, take: s.take };
  }
  // the hour's need (home, kWh) and prices of a period
  function homeHours(P, s, p) {
    var hp = s.hp === "standard" ? p.series.hpS : s.hp === "high" ? p.series.hpH : null, buy = P.home.buy[s.tariff], out = [];
    for (var h = 0; h < p.n; h++) out.push({ need: p.series.use[h] + (hp ? hp[h] : 0), use: p.series.use[h], pv: p.series.pv[h], buy: buy[p.h0 + h], heat: p.series.heat[h] });
    return out;
  }
  function farmHours(P, s, p) {
    var sell = P.farm.sell[s.sale], out = [];
    for (var h = 0; h < p.n; h++) out.push({ wind: p.series.wind[h], price: sell[p.h0 + h] });
    return out;
  }
  // the LP of a plan over a list of periods (opts.periods, or opts.mode: "week" all 52, "reps", "year"); opts.size: the
  // sizes are decisions too. Variable names carry the period's index k and the hour h ("i3_17").
  function build(P, s, opts) {
    opts = opts || {};
    var D = P.D, Z = sizes(s), C = costs(D, s), size = !!opts.size, ps = opts.periods || periods(P, s, opts.mode || (size ? "reps" : "week")), V = [], R = [];
    if (s.site === "home") {
      var tie = D.tie.home, xc = s.xc / 100, rte = D.home.battery.rte, bat = size || Z.hb > 0, u = SC.home;
      if (size) V.push({ name: "PV", ub: field("pv").max, cost: C.pv.eac * u }, { name: "HB", ub: field("hb").max, cost: C.hb.eac * u });
      ps.forEach(function (p, k) {
        var hrs = homeHours(P, s, p), w = p.w;
        hrs.forEach(function (x, h) {
          var id = k + "_" + h;
          V.push({ name: "i" + id, cost: w * x.buy * u });
          // exports: only the panels' output (a bound, or a row when the panels are sized)
          V.push(size ? { name: "x" + id, cost: -w * xc * u } : { name: "x" + id, ub: x.pv * Z.pv, cost: -w * xc * u });
          var bal = {}; bal["i" + id] = 1; bal["x" + id] = -1;
          if (bat) {
            V.push({ name: "c" + id, ub: size ? Infinity : Z.hbP, cost: w * tie * u }, { name: "d" + id, ub: size ? Infinity : Z.hbP, cost: w * tie * u }, { name: "s" + id, ub: size ? Infinity : Z.hb });
            bal["d" + id] = 1; bal["c" + id] = -1;
            var q = {}, prev = k + "_" + (h ? h - 1 : p.n - 1);   // cyclic: the period's first hour follows its last
            q["s" + id] = 1; q["s" + prev] = -1; q["c" + id] = -rte; q["d" + id] = 1;
            R.push({ name: "q" + id, terms: q, eq: 0 });
            if (size) {
              var e = {}; e["s" + id] = 1; e.HB = -1; R.push({ name: "e" + id, terms: e, le: 0 });
              var pw = {}; pw["c" + id] = 1; pw["d" + id] = 1; pw.HB = -1 / 2.5; R.push({ name: "pw" + id, terms: pw, le: 0 });
            }
          }
          if (size) { bal.PV = x.pv; R.push({ name: "b" + id, terms: bal, eq: x.need }); var xr = {}; xr["x" + id] = 1; xr.PV = -x.pv; R.push({ name: "xp" + id, terms: xr, le: 0 }); }
          else R.push({ name: "b" + id, terms: bal, eq: x.need - x.pv * Z.pv });
        });
      });
    } else {
      var ft = D.tie.farm, frte = D.farm.battery.rte, tpm = 1 / D.farm.electrolyzer.kWhPerKg, h2p = s.h2, f = SC.farm;   // tpm: t of hydrogen per MWh
      var fbat = size || Z.fb > 0, ely = size || Z.el > 0, tank = ely && (size || Z.tank > 0);
      if (size) V.push({ name: "FB", ub: field("fb").max, cost: C.fb.eac * f }, { name: "EL", ub: field("el").max, cost: C.el.eac * f }, { name: "TK", ub: field("tank").max, cost: C.tank.eac * 1000 * f });
      ps.forEach(function (p, k) {
        var hrs = farmHours(P, s, p), w = p.w;
        hrs.forEach(function (x, h) {
          var id = k + "_" + h, prev = k + "_" + (h ? h - 1 : p.n - 1), early = 1 + TIME * (p.n - h) / p.n;   // the second tie rule: sooner by a hair
          V.push({ name: "g" + id, ub: Z.line, cost: -w * x.price * early * f });
          var bal = {}; bal["g" + id] = 1;   // what the row leaves over is spilled (a slack, not a variable)
          if (fbat) {
            V.push({ name: "c" + id, ub: size ? Infinity : Z.fbP, cost: w * ft * f }, { name: "d" + id, ub: size ? Infinity : Z.fbP, cost: w * ft * f }, { name: "s" + id, ub: size ? Infinity : Z.fb });
            bal["c" + id] = 1; bal["d" + id] = -1;
            var q = {}; q["s" + id] = 1; q["s" + prev] = -1; q["c" + id] = -frte; q["d" + id] = 1;
            R.push({ name: "q" + id, terms: q, eq: 0 });
            if (size) {
              var e = {}; e["s" + id] = 1; e.FB = -1; R.push({ name: "e" + id, terms: e, le: 0 });
              var pw = {}; pw["c" + id] = 1; pw["d" + id] = 1; pw.FB = -1 / 4; R.push({ name: "pw" + id, terms: pw, le: 0 });
            }
          }
          if (ely) {
            V.push({ name: "y" + id, ub: size ? Infinity : Z.el, cost: w * C.elWear * f }, { name: "h" + id, ub: Z.take / 1000, cost: -w * h2p * 1000 * early * f });
            bal["y" + id] = 1;
            var z = {}; z["h" + id] = 1; z["y" + id] = -tpm;
            if (tank) {
              V.push({ name: "k" + id, ub: size ? Infinity : Z.tank / 1000 });
              z["k" + id] = 1; z["k" + prev] = -1;
              if (size) { var t = {}; t["k" + id] = 1; t.TK = -1; R.push({ name: "tk" + id, terms: t, le: 0 }); }
            }
            R.push({ name: "z" + id, terms: z, eq: 0 });
            if (size) { var yl = {}; yl["y" + id] = 1; yl.EL = -1; R.push({ name: "yl" + id, terms: yl, le: 0 }); }
          }
          R.push({ name: "b" + id, terms: bal, le: x.wind * Z.wind });
        });
      });
    }
    return { sense: "min", variables: V, constraints: R };
  }

  // ---------------------------------------------------------------- reading solved periods
  // acc = start(P, s[, sizes]); add(acc, P, s, periods, solverResult) for each solved model; finish(acc) -> raw
  function start(P, s, z) {
    var Z = sizes(s);
    if (z) { if (s.site === "home") { Z.pv = z.pv; Z.hb = z.hb; Z.hbP = z.hb / 2.5; } else { Z.fb = z.fb; Z.fbP = z.fb / 4; Z.el = z.el; Z.tank = z.tank * 1000; } }
    return { P: P, s: s, Z: Z, T: {}, periods: [], sizes: z || null };
  }
  function add(acc, ps, r) {
    var P = acc.P, s = acc.s, D = P.D, Z = acc.Z, T = acc.T, v = r.values, C = costs(D, s);
    var g = function (n) { var x = v[n]; return x > 0 ? x : 0; };
    function t(k, x) { T[k] = (T[k] || 0) + x; }
    ps.forEach(function (p, k) {
      var w = p.w, S, wk = {};
      function tw(key, x) { wk[key] = (wk[key] || 0) + x; }
      if (s.site === "home") {
        var xc = s.xc / 100, hrs = homeHours(P, s, p);
        S = { need: [], pv: [], imp: [], exp: [], ch: [], dis: [], soc: [], buy: [] };
        hrs.forEach(function (x, h) {
          var id = k + "_" + h, imp = g("i" + id), exp = g("x" + id), ch = g("c" + id), dis = g("d" + id), pv = x.pv * Z.pv;
          S.need.push(x.need); S.pv.push(pv); S.imp.push(imp); S.exp.push(exp); S.ch.push(ch); S.dis.push(dis); S.soc.push(g("s" + id)); S.buy.push(x.buy);
          t("need", w * x.need); t("use", w * x.use); t("heat", w * x.heat); t("pv", w * pv); t("imp", w * imp); t("exp", w * exp);
          t("ch", w * ch); t("dis", w * dis); t("buyCost", w * imp * x.buy); t("credit", w * exp * xc); t("baseBill", w * x.use * x.buy);
          if (imp > 1e-3) t("gridHours", w);
          if (imp > (T.peakImp || 0)) T.peakImp = imp;
          tw("need", x.need); tw("imp", imp);
        });
        wk.share = wk.need > 0 ? wk.imp / wk.need : 0;
      } else {
        var hrs2 = farmHours(P, s, p);
        S = { wind: [], sell: [], spill: [], ch: [], dis: [], soc: [], el: [], h2: [], tank: [], price: [] };
        hrs2.forEach(function (x, h) {
          var id = k + "_" + h, wind = x.wind * Z.wind, sell = g("g" + id), el = g("y" + id), h2 = g("h" + id) * 1000, ch = g("c" + id), dis = g("d" + id), sp = Math.max(0, wind + dis - sell - ch - el);
          S.wind.push(wind); S.sell.push(sell); S.spill.push(sp); S.ch.push(ch); S.dis.push(dis); S.soc.push(g("s" + id)); S.el.push(el); S.h2.push(h2); S.tank.push(g("k" + id) * 1000); S.price.push(x.price);
          t("wind", w * wind); t("sell", w * sell); t("spill", w * sp); t("ch", w * ch); t("dis", w * dis); t("el", w * el); t("h2", w * h2);
          t("sales", w * sell * x.price); t("h2Rev", w * h2 * s.h2); t("wear", w * el * C.elWear);
          if (Z.line > 0 && sell >= Z.line - 1e-6) t("lineHours", w);
          if (Z.take > 0 && Z.el > 0 && h2 >= Z.take - 1e-6) t("fullTake", w);
          var alone = Math.min(wind, Z.line); t("aloneSell", w * alone); t("aloneSales", w * alone * x.price);
          tw("wind", wind); tw("spill", sp); tw("h2", h2);
        });
        wk.share = wk.wind > 0 ? wk.spill / wk.wind : 0;
      }
      acc.periods.push({ kind: p.kind, week: p.week, season: p.season, start: p.start, w: w, weeks: p.weeks, series: S, sums: wk });
    });
  }
  function finish(acc) {
    var P = acc.P, s = acc.s, D = P.D, T = acc.T, Z = acc.Z, z = function (k) { return T[k] || 0; };
    ["need", "use", "heat", "pv", "imp", "exp", "ch", "dis", "buyCost", "credit", "baseBill", "gridHours", "peakImp", "wind", "sell", "spill", "el", "h2", "sales", "h2Rev", "wear", "lineHours", "fullTake", "aloneSell", "aloneSales"].forEach(function (k) { T[k] = z(k); });
    if (s.site === "home") {
      var gas = D.home.gas, perKWhGas = gas.pricePerMcf / (gas.btuPerCf / 1000) / 293.071, ef = D.home.grid.lbPerMWh * 0.45359237 / 1000;   // $ per kWh of gas; kg CO2 per kWh
      T.gasKWh = s.hp === "none" ? T.heat / gas.afue : 0;
      T.gasCost = T.gasKWh * perKWhGas; T.baseGasCost = T.heat / gas.afue * perKWhGas;
      T.gasCO2 = T.gasKWh / 293.071 * gas.co2PerMMBtu / 1000; T.baseGasCO2 = T.heat / gas.afue / 293.071 * gas.co2PerMMBtu / 1000;   // t
      T.gridCO2 = (T.imp - T.exp) * ef / 1000; T.baseGridCO2 = T.use * ef / 1000;                                                     // t
      T.bill = T.buyCost - T.credit; T.cost = T.bill + T.gasCost; T.baseCost = T.baseBill + T.baseGasCost;
      T.co2 = T.gridCO2 + T.gasCO2; T.baseCO2 = T.baseGridCO2 + T.baseGasCO2;
      T.selfShare = T.need > 0 ? 1 - T.imp / T.need : 0; T.pvUsed = T.pv - T.exp; T.ef = ef;
    } else {
      var kg = 1000 / D.farm.electrolyzer.kWhPerKg, gasCO2 = D.farm.h2.gasMMBtuPerKg * D.farm.h2.co2PerMMBtu;   // kg CO2 per kg of hydrogen made from gas
      T.revenue = T.sales + T.h2Rev - T.wear; T.aloneRevenue = T.aloneSales;
      T.spillShare = T.wind > 0 ? T.spill / T.wind : 0; T.aloneSpill = T.wind - T.aloneSell; T.aloneSpillShare = T.wind > 0 ? T.aloneSpill / T.wind : 0;
      T.h2Made = T.el * kg; T.co2Avoided = T.h2 * gasCO2 / 1000; T.kgPerMWh = kg;
    }
    return { site: s.site, tot: T, sized: Z, sizes: acc.sizes, costs: costs(D, s), horizon: D[s.site].horizon, periods: acc.periods, _D: D };
  }
  function read(P, s, r, opts) {   // one solved model (opts as for build) -> raw
    opts = opts || {};
    var ps = opts.periods || periods(P, s, opts.mode || (opts.size ? "reps" : "week")), z = null;
    if (opts.size) { var v = r.values, g = function (n) { return Math.max(0, v[n] || 0); }; z = s.site === "home" ? { pv: g("PV"), hb: g("HB") } : { fb: g("FB"), el: g("EL"), tank: g("TK") }; }
    var acc = start(P, s, z); add(acc, ps, r); return finish(acc);
  }

  // ---------------------------------------------------------------- money
  // year-by-year cash flows of a plan: items [{key, capex (total $), fom ($ a year), life}], annual ($ a year before
  // upkeep), N years, r. Replacements in the year a life ends (if before N); a straight-line residual value at N.
  function cashflow(items, annual, N, r) {
    var rows = [], npv = 0, cum = 0, payback = null;
    for (var t = 0; t <= N; t++) {
      var cap = 0, rep = 0, res = 0, fom = 0;
      items.forEach(function (it) {
        if (!(it.capex > 0) && !(it.fom > 0)) return;
        if (t === 0) cap += it.capex;
        else {
          fom += it.fom;
          if (t < N && t % it.life === 0) rep += it.capex;
          if (t === N) { var age = N % it.life; if (age > 0) res += it.capex * (it.life - age) / it.life; }
        }
      });
      var net = t === 0 ? -cap : annual - fom - rep + res, disc = net / Math.pow(1 + r, t);
      npv += disc; cum += net;
      if (payback === null && t > 0 && cum >= 0) payback = t;
      rows.push({ year: t, capex: cap, annual: t === 0 ? 0 : annual, fom: fom, replace: rep, residual: res, net: net, cum: cum, disc: disc, npv: npv });
    }
    return { rows: rows, npv: npv, payback: payback };
  }
  function items(s, raw) {
    var C = raw.costs, Z = raw.sized;
    if (s.site === "home") return [{ key: "pv", label: "Rooftop solar", capex: C.pv.capex * Z.pv, fom: C.pv.fom * Z.pv, life: C.pv.life },
      { key: "hb", label: "Home battery", capex: C.hb.capex * Z.hb, fom: C.hb.fom * Z.hb, life: C.hb.life },
      { key: "hp", label: "Heat pump", capex: s.hp === "none" ? 0 : C.hp.capex, fom: 0, life: C.hp.life }];
    return [{ key: "wind", label: "Wind farm", capex: C.wind.capex * Z.wind, fom: C.wind.fom * Z.wind, life: C.wind.life },
      { key: "fb", label: "Battery", capex: C.fb.capex * Z.fb, fom: C.fb.fom * Z.fb, life: C.fb.life },
      { key: "el", label: "Electrolyzer", capex: C.el.capex * Z.el, fom: C.el.fom * Z.el, life: C.el.life },
      { key: "tank", label: "Hydrogen tank", capex: C.tank.capex * Z.tank, fom: 0, life: C.tank.life }];
  }

  // ---------------------------------------------------------------- every number a page shows
  var r0 = function (x) { return Math.round(x); };
  function money(v) {   // $1,234 (rounded to the dollar) or $12.3M; a minus sign, not a hyphen
    var a = Math.abs(v), neg = v < -0.5 ? "−" : "";
    if (a >= 1e6) return neg + "$" + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
    return neg + "$" + Math.round(a).toLocaleString("en-US");
  }
  function num(v, d) { return (+v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return num(v * 100, d == null ? 0 : d) + "%"; }
  function summarize(s, raw) {
    var T = raw.tot, Z = raw.sized, N = raw.horizon, r = s.rate / 100, out = { site: s.site, full: raw.full, sized: Z, tot: T, periods: raw.periods };
    var it = items(s, raw), capex = it.reduce(function (a, x) { return a + x.capex; }, 0), fom = it.reduce(function (a, x) { return a + x.fom; }, 0);
    if (s.site === "home") {
      var saving = T.baseCost - T.cost, cf = cashflow(it, saving, N, r);
      out.money = { annualCost: T.cost, baseCost: T.baseCost, saving: saving, capex: capex, fom: fom, npv: cf.npv, payback: cf.payback, cash: cf.rows, items: it, horizon: N };
      out.co2 = { plan: T.co2, base: T.baseCO2, cut: T.baseCO2 - T.co2 };
      out.readouts = [
        { key: "npv", label: "Net present value, " + N + " years", value: money(cf.npv), note: "against the same home with nothing new, at " + num(s.rate, 1) + "% real" },
        { key: "saving", label: "Saved on bills and gas, a year", value: money(saving), note: money(T.baseCost) + " a year before, " + money(T.cost) + " with the plan" },
        { key: "capex", label: "Equipment, up front", value: money(capex), note: capex > 0 ? "upkeep " + money(fom) + " a year" : "nothing to buy" },
        { key: "co2", label: "CO₂ a year", value: num(T.co2, 1) + " t", note: (T.baseCO2 - T.co2 >= 0 ? "down " : "up ") + num(Math.abs(T.baseCO2 - T.co2), 1) + " t from " + num(T.baseCO2, 1) + " t" },
        { key: "self", label: "Own solar and battery cover", value: pct(T.selfShare), note: "of the home's electricity use" },
        { key: "grid", label: "Hours that need the grid", value: num(T.gridHours) + " h", note: "of 8,760; the most it draws in one hour: " + num(T.peakImp, 1) + " kWh" }];
      out.flows = [
        { label: "Household use", value: T.use, unit: "kWh" }, { label: "Heat pump electricity", value: T.need - T.use, unit: "kWh" },
        { label: "Solar made", value: T.pv, unit: "kWh" }, { label: "Bought from the grid", value: T.imp, unit: "kWh" },
        { label: "Sent back to the grid", value: T.exp, unit: "kWh" }, { label: "Through the battery (out)", value: T.dis, unit: "kWh" },
        { label: "Battery losses", value: T.ch - T.dis, unit: "kWh" }, { label: "Gas burned", value: T.gasKWh, unit: "kWh" }];
    } else {
      var C = raw.costs, cfP = cashflow(it, T.revenue, N, r);
      var alone = [it[0]], cfA = cashflow(alone, T.aloneRevenue, N, r);
      var extra = it.slice(1), h2eac = Z.el * C.el.eac + Z.tank * C.tank.eac, lcoh = T.h2 > 0 ? (h2eac + T.wear) / T.h2 : null;
      out.money = { revenue: T.revenue, aloneRevenue: T.aloneRevenue, capex: capex, fom: fom, npv: cfP.npv, aloneNpv: cfA.npv, added: cfP.npv - cfA.npv,
        payback: cfP.payback, cash: cfP.rows, items: it, horizon: N, lcoh: lcoh, extraCapex: extra.reduce(function (a, x) { return a + x.capex; }, 0) };
      out.co2 = { avoided: T.co2Avoided };
      out.readouts = [
        { key: "npv", label: "Net present value, " + N + " years", value: money(cfP.npv), note: "the whole plant, at " + num(s.rate, 1) + "% real" },
        { key: "added", label: "What the extra equipment adds", value: money(cfP.npv - cfA.npv), note: "against the same wind farm alone (" + money(cfA.npv) + ")" },
        { key: "revenue", label: "Net revenue a year", value: money(T.revenue), note: "power " + money(T.sales) + (T.h2 > 0 ? ", hydrogen " + money(T.h2Rev) : "") },
        { key: "spill", label: "Wind spilled", value: pct(T.spillShare, 1), note: "alone: " + pct(T.aloneSpillShare, 1) + "; the line is full " + num(T.lineHours || 0) + " h a year" },
        { key: "h2", label: "Hydrogen sold a year", value: num(T.h2 / 1000) + " t", note: T.h2 > 0 ? "buyer's full take in " + num(T.fullTake || 0) + " h; " + num(T.co2Avoided) + " t CO₂ avoided" : "no electrolyzer" },
        { key: "lcoh", label: "Cost per kg of hydrogen", value: lcoh === null ? "–" : "$" + num(lcoh, 2), note: lcoh === null ? "no hydrogen" : "electrolyzer and tank only; the wind is counted as free" }];
      out.flows = [
        { label: "Wind made", value: T.wind, unit: "MWh" }, { label: "Sold to the grid", value: T.sell, unit: "MWh" },
        { label: "Spilled", value: T.spill, unit: "MWh" }, { label: "Into the electrolyzer", value: T.el, unit: "MWh" },
        { label: "Through the battery (out)", value: T.dis, unit: "MWh" }, { label: "Battery losses", value: T.ch - T.dis, unit: "MWh" },
        { label: "Hydrogen sold", value: T.h2 / 1000, unit: "t" }, { label: "Electrolyzer full-load hours", value: Z.el > 0 ? T.el / Z.el : 0, unit: "h" }];
    }
    return out;
  }

  // ---------------------------------------------------------------- the run
  var STEP = { pv: 0.5, hb: 0.5, fb: 10, el: 5, tank: 1 };
  function snap(s, z) {
    var o = {}, k;
    for (k in s) o[k] = s[k];
    for (k in z) { var f = field(k); o[k] = Math.min(f.max, Math.max(f.min, Math.round(z[k] / STEP[k]) * STEP[k])); o[k] = +o[k].toFixed(2); }
    return o;
  }
  var HINT = "Every plan on this bench should be feasible (the grid or spilled wind balances each hour), so this is a fault in the bench: reload the page or change one control and run again.";
  // a run. Default: the 52 calendar weeks of 2025, one small LP each, solved one after another (storage starts and ends
  // each week at the same level); o.full: one LP on all 8,760 hours with storage cyclic over the year (the check);
  // o.mode "reps": the representative weeks; o.size: sizing on the representative weeks (results.sizes, .snapped).
  // Never rejects: { status, ok, message, hint, results, raw, kind, ms }; ok only when every model is optimal.
  function fail(status, message) { return { status: status, ok: false, message: message, hint: status === "infeasible" ? HINT : null, results: null }; }
  function solve(s, P, o) {
    o = o || {};
    var solver = o.solver || (typeof window !== "undefined" && window.LX && window.LX.solver && function (m, q) { return window.LX.solver.solve(m, q); });
    if (!solver) return Promise.resolve(fail("error", "The solver is not available on this page."));
    var mode = o.full ? "year" : o.size || o.mode === "reps" ? "reps" : "week", t0 = Date.now(), ms = { solve: 0, total: 0, roundTrip: 0, models: 0 };
    var groups;
    try { var ps = periods(P, s, mode); groups = mode === "week" ? ps.map(function (p) { return [p]; }) : [ps]; }
    catch (e) { return Promise.resolve(fail("error", "The bench could not set up this plan (" + e.message + ").")); }
    var acc = null, gi = 0, timeLimit = o.timeLimit || 10;
    function one(r, g) {
      if (!r || typeof r !== "object") return fail("error", "The solver gave no answer.");
      ms.models++; if (r.ms) { ms.solve += r.ms.solve || 0; ms.total += r.ms.total || 0; ms.roundTrip += r.ms.roundTrip || r.ms.total || 0; }
      if (r.status !== "optimal" || !r.ok) {
        var f = fail(r.status || "error", r.status === "error" ? (r.message || null) : null);
        if (mode === "week") f.message = (f.message ? f.message + " " : "") + "(It stopped in the week of " + g[0].start + ".)";
        f.kind = r.kind || "lp"; return f;
      }
      if (!acc) {
        var z = null;
        if (o.size) { var v = r.values, gz = function (n) { return Math.max(0, v[n] || 0); }; z = s.site === "home" ? { pv: gz("PV"), hb: gz("HB") } : { fb: gz("FB"), el: gz("EL"), tank: gz("TK") }; }
        acc = start(P, s, z);
      }
      add(acc, g, r);
      return null;
    }
    return new Promise(function (resolve) {
      function next() {
        if (o.signal && o.signal.aborted) { resolve(fail("cancelled", null)); return; }
        if (gi >= groups.length) {
          try {
            var raw = finish(acc), out = { status: "optimal", ok: true, kind: "lp", message: null, hint: null, raw: raw, ms: ms };
            ms.wall = Date.now() - t0;
            out.results = summarize(s, raw);
            if (o.size) { out.results.sizes = raw.sizes; out.results.snapped = snap(s, raw.sizes); }
            resolve(out);
          } catch (e) { resolve(fail("error", "The bench could not read the solver's answer (" + e.message + ").")); }
          return;
        }
        var g = groups[gi++], model;
        try { model = build(P, s, { periods: g, size: !!o.size }); } catch (e) { resolve(fail("error", "The bench could not build this plan's model (" + e.message + ").")); return; }
        Promise.resolve().then(function () { return solver(model, { timeLimit: timeLimit, signal: o.signal, key: o.key }); }).then(function (r) {
          var f;
          try { f = one(r, g); } catch (e) { f = fail("error", "The bench could not read the solver's answer (" + e.message + ")."); }
          if (f) { f.ms = ms; resolve(f); } else next();
        }, function (e) { resolve(fail("error", "The run failed (" + (e && e.message || e) + ").")); });
      }
      next();
    });
  }
  // one-at-a-time sensitivity of the NPV, the plan held fixed. Equipment cost and the rate need no new run (operation
  // does not depend on them); the prices are re-run. Returns rows for LX.Tornado, or null if a run fails.
  function sensRows(s) {
    var rows = [{ key: "cost", label: "Equipment cost", lo: { cost: Math.max(50, s.cost - 25) }, hi: { cost: Math.min(150, s.cost + 25) }, run: false },
      { key: "rate", label: "Discount rate (real)", lo: { rate: 2 }, hi: { rate: 7 }, run: false }];
    if (s.site === "home") rows.push({ key: "xc", label: "Export credit", lo: { xc: 0 }, hi: { xc: 8 }, run: true });
    else {
      if (s.el > 0) rows.push({ key: "h2", label: "Hydrogen price", lo: { h2: Math.max(1, s.h2 - 1) }, hi: { h2: Math.min(8, s.h2 + 1) }, run: true });
      rows.push({ key: "line", label: "Line to the grid", lo: { line: Math.max(10, s.line - 20) }, hi: { line: Math.min(300, s.line + 20) }, run: true });
    }
    return rows;
  }
  function text(key, v) { var f = field(key); return key === "cost" ? v + "% of sourced" : key === "xc" ? num(v, 1) + "¢/kWh" : key === "h2" ? "$" + num(v, 2) + "/kg" : key === "rate" ? num(v, 1) + "%" : v + " " + f.unit; }
  function sensitivity(s, P, base, o) {   // base: the plan's solve() answer (with .raw)
    o = o || {};
    var rows = sensRows(s), outRows = [], i = 0;
    function mk(over) { var x = {}, k; for (k in s) x[k] = s[k]; for (k in over) x[k] = over[k]; return x; }
    function npvOf(st) {
      if (o.signal && o.signal.aborted) return Promise.resolve(null);
      return solve(st, P, o).then(function (r) { return r.ok ? r.results.money.npv : null; });
    }
    function next() {
      if (i >= rows.length) return Promise.resolve({ base: base.results.money.npv, rows: outRows });
      var R = rows[i++], lo = mk(R.lo), hi = mk(R.hi), k = R.key;
      var p = R.run ? npvOf(lo).then(function (a) { return npvOf(hi).then(function (b) { return [a, b]; }); })
        : Promise.resolve([summarize(lo, recost(base.raw, lo)).money.npv, summarize(hi, recost(base.raw, hi)).money.npv]);
      return p.then(function (ab) {
        if (ab[0] === null || ab[1] === null) return null;
        outRows.push({ key: k, label: R.label, loText: text(k, lo[k]), hiText: text(k, hi[k]), atLo: ab[0], atHi: ab[1], rerun: R.run });
        if (o.progress) o.progress(i, rows.length);
        return next();
      });
    }
    return next();
  }
  // the same operation with other unit costs (equipment cost or rate changed): only the money changes
  function recost(raw, s) { var o = {}, k; for (k in raw) o[k] = raw[k]; o.costs = costs(raw._D, s); return o; }

  // ---------------------------------------------------------------- words: the plan, the note, the no-JS tables
  function fmtField(f, v) {
    if (f.type === "enum") return f.names ? f.names[v] : String(v);
    if (f.id === "xc") return num(v, 1) + "¢/kWh";
    if (f.id === "h2") return "$" + num(v, 2) + "/kg";
    if (f.id === "rate") return num(v, 1) + "%";
    if (f.id === "cost") return v + "% of the sourced costs";
    if (f.id === "tank") return v + " t";
    return (+v).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " " + f.unit;
  }
  function planRows(s) {
    return schema.fields.filter(function (f) { return f.id !== "site" && (!f.site || f.site === s.site); }).map(function (f) { return { label: f.label, value: fmtField(f, s[f.id]) }; });
  }
  function joinAnd(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function heading(s) {
    var a = [];
    if (s.site === "home") {
      if (s.pv > 0) a.push(fmtField(field("pv"), s.pv) + " of rooftop solar");
      if (s.hb > 0) a.push("a " + fmtField(field("hb"), s.hb) + " battery");
      if (s.hp !== "none") a.push("a " + field("hp").names[s.hp]);
      return "The Prairie Town home: " + (a.length ? joinAnd(a) : "nothing new");
    }
    a.push(fmtField(field("wind"), s.wind) + " of wind");
    if (s.fb > 0) a.push("a " + fmtField(field("fb"), s.fb) + " battery");
    if (s.el > 0) a.push("a " + fmtField(field("el"), s.el) + " electrolyzer");
    if (s.el > 0 && s.tank > 0) a.push("a " + s.tank + " t hydrogen tank");
    return "The ridge wind farm: " + joinAnd(a);
  }
  function note(s, res) {
    var home = s.site === "home", M = res.money, n = {
      heading: heading(s), made: "the Site Bench (engine E0, a linear program)",
      run: { ok: true, stale: false, text: "every hour of 2025, as 52 weeks" },
      plan: planRows(s),
      results: res.readouts.map(function (r) { return { label: r.label, value: r.value }; }),
      assumptions: [
        "All money is in 2025 dollars at a " + num(s.rate, 1) + "% real discount rate, over " + M.horizon + " years.",
        "The weather and prices of 2025 repeat every year, and costs stay the same.",
        home ? "The household use and the heating need are illustrative; the solar shape is SPP's for 2025." : "The wind follows SPP's 2025 shape at a 33.8% capacity factor; the prices are illustrative.",
        home ? "CO₂ counts operating emissions only: grid power at Kansas's 2024 average, and gas burned." : "CO₂ avoided assumes each kg of hydrogen replaces one made from natural gas.",
        "Equipment costs are " + s.cost + "% of the sourced values, with no tax credits or incentives."],
      sensitivity: null,
      limits: [
        "Storage starts and ends each week at the same level, so nothing is stored from one week to the next.",
        home ? "The grid is always there: outages and backup power are outside this bench." : "The farm only sells: it cannot buy power for the electrolyzer or the battery.",
        home ? "One average CO₂ factor for every hour: timing does not change the CO₂ here (case file CF6)." : "One buyer takes the hydrogen at one price; storage beyond the tank and delivery are outside the bench."]
    };
    return n;
  }
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // the no-JS results table of a run (written into a page's fallback by its test)
  function resultsHTML(res, date) {
    return '<table class="lx-facts"><thead><tr><th scope="col">Result for the default plan</th><th scope="col">Value</th></tr></thead><tbody>' +
      res.readouts.map(function (r) { return "<tr><td>" + esc(r.label) + ' <span class="lx-hint">(' + esc(r.note) + ')</span></td><td class="n">' + esc(r.value) + "</td></tr>"; }).join("") +
      "</tbody></table>" + (date ? '<p class="lx-hint">Run on all 52 weeks of 2025 with this engine on ' + esc(date) + ".</p>" : "");
  }
  // the default plan's precomputed results (D.reference.default, written by the test) as the no-JS block
  function fallback(D) {
    var R = D.reference && D.reference["default"];
    if (!R) return '<p class="lx-hint">Run the bench with JavaScript on to see the results.</p>';
    return resultsHTML({ readouts: R.readouts }, R.date);
  }

  // the inputs the engine uses, as a table (Input, Value, Source), with each value in its source's dollars and in 2025
  // dollars; P (prepare) gives the time-of-use prices and the capacity factors
  function src(D, keys) {
    return (keys || []).map(function (k) { var x = D.sources[k]; return x ? '<a href="' + esc(x.url) + '">' + esc(x.short || x.text.split(":")[0]) + "</a>" : ""; }).filter(Boolean).join("; ");
  }
  function inputRows(D, P) {
    var H = D.home, F = D.farm, d = function (v, y) { return "$" + num(usd(D, v, y)); }, C = costs(D, { rate: D.finance.rate, cost: 100, hp: "standard" });
    var ef = H.grid.lbPerMWh * 0.45359237 / 1000, gasMM = H.gas.pricePerMcf / (H.gas.btuPerCf / 1000), x22 = usd(D, 1, 2022);
    return [
      ["Price index", "$1 of 2022 = $" + num(x22, 3) + " of 2025; $1 of 2024 = $" + num(usd(D, 1, 2024), 3), ["eia-steo-9a"]],
      ["Discount rate", num(D.finance.rate) + "% real (you can change it)", ["atb2025-fin"]],
      ["Home: household use", num(H.use.kWh) + " kWh a year, the town's 2025 demand shape (illustrative)", ["eia-930"]],
      ["Home: heating need", num(H.heat.kWh) + " kWh of heat a year, from a smooth made-up temperature (illustrative)", []],
      ["Home: rooftop solar", "$" + num(H.pv.capex) + "/kW in 2022 dollars = " + d(H.pv.capex, H.pv.capexYear) + "/kW; " + pct(P.home.pvCF, 1) + " capacity factor; " + H.pv.life + " years; upkeep $" + H.pv.fom + "/kW a year (illustrative)", ["eia-aeo2026-rdm", "eia-dg-2024"]],
      ["Home: battery", "$" + num(H.battery.capex) + "/kWh (illustrative); 2.5 hours; " + pct(H.battery.rte) + " round trip; " + H.battery.life + " years; upkeep " + pct(H.battery.fomShare) + " a year", ["atb2025-resbat"]],
      ["Home: heat pumps", "$" + num(H.hp.standard.capex) + " (HSPF " + H.hp.standard.hspf + ") and $" + num(H.hp.high.capex) + " (HSPF " + H.hp.high.hspf + ") in 2022 dollars = " + d(H.hp.standard.capex, 2022) + " and " + d(H.hp.high.capex, 2022), ["eia-aeo2026-rdm"]],
      ["Home: gas furnace and gas", pct(H.gas.afue) + " efficient; $" + num(H.gas.pricePerMcf, 2) + " per thousand cubic feet = $" + num(gasMM, 2) + "/MMBtu; " + H.gas.co2PerMMBtu + " kg CO₂/MMBtu", ["eia-ng-ks", "eia-btu", "eia-co2"]],
      ["Home: tariffs", num(H.tariff.flat * 100) + "¢/kWh flat; time-of-use " + num(P.home.touOff * 100, 2) + "¢ and " + num(P.home.touPeak * 100, 2) + "¢ (16:00–21:00), illustrative", ["eia-epm-5-6-b"]],
      ["Home: grid CO₂", num(H.grid.lbPerMWh) + " lb/MWh = " + num(ef, 3) + " kg CO₂/kWh (Kansas, 2024)", ["eia-ks-profile"]],
      ["Farm: wind", "$" + num(F.wind.capex) + "/kW and $" + num(F.wind.fom, 2) + "/kW a year (2025 dollars); " + pct(P.farm.windCF, 1) + " capacity factor; " + F.wind.life + " years: $" + num(C.wind.eac) + " a year per MW at " + D.finance.rate + "%", ["eia-aeo2026-emm", "eia-epm-cf"]],
      ["Farm: battery", "$" + num(F.battery.capexPerkW) + "/kW for 4 hours = $" + num(F.battery.capexPerkW / 4, 2) + "/kWh; $" + num(F.battery.fomPerkW, 2) + "/kW a year; " + pct(F.battery.rte) + " round trip; " + F.battery.life + " years", ["eia-aeo2026-emm", "nrel-battery-2025"]],
      ["Farm: electrolyzer", "$" + num(F.electrolyzer.capex) + "/kW in 2022 dollars = " + d(F.electrolyzer.capex, F.electrolyzer.capexYear) + "/kW; upkeep " + pct(F.electrolyzer.fomShare) + " a year; " + F.electrolyzer.kWhPerKg + " kWh/kg; stack wear $" + num(C.elWear, 2) + "/MWh", ["doe-h2-24005"]],
      ["Farm: hydrogen tank", "$" + num(F.tank.capexPerKg) + " per kg held (illustrative); " + F.tank.life + " years", []],
      ["Farm: prices", "power $" + F.sale.flat + "/MWh fixed, or $" + F.sale.tou.off + " and $" + F.sale.tou.peak + "/MWh (16:00–21:00); hydrogen $" + num(F.h2.def, 2) + "/kg by default (all illustrative)", []],
      ["Farm: CO₂ avoided", num(F.h2.gasMMBtuPerKg, 2) + " MMBtu of gas per kg of hydrogen from natural gas × " + F.h2.co2PerMMBtu + " = " + num(F.h2.gasMMBtuPerKg * F.h2.co2PerMMBtu, 2) + " kg CO₂ per kg", ["eia-aeo2026-hmm", "eia-co2"]]];
  }
  function inputsHTML(D, P) {
    return '<table class="lx-facts"><thead><tr><th scope="col">Input</th><th scope="col">Value</th><th scope="col">Source</th></tr></thead><tbody>' +
      inputRows(D, P).map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + '</td><td class="s">' + (src(D, r[2]) || "illustrative") + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function sourcesHTML(D) {
    return "<ul>" + Object.keys(D.sources).map(function (k) { var x = D.sources[k]; return '<li><a href="' + esc(x.url) + '">' + esc(x.text) + "</a> · " + esc(x.asOf) + "</li>"; }).join("") + "</ul>";
  }
  // the check of the 52-week run (D.reference.check, written by the test): [{ id, label, weeks, year, sized }]
  function checkRows(check) {
    return (check && check.rows || []).map(function (r) {
      return [r.label, money(r.weeks), money(r.year), (r.year - r.weeks >= 0 ? "+" : "−") + money(Math.abs(r.year - r.weeks)).replace("−", "") + " (" + num(Math.abs(r.year - r.weeks) / Math.max(1, Math.abs(r.capex || r.weeks)) * 100, 2) + "% of the equipment cost)"];
    });
  }
  function checkHTML(check) {
    if (!check) return "";
    return '<table class="lx-facts"><thead><tr><th scope="col">Preset</th><th scope="col">NPV, 52 weeks</th><th scope="col">NPV, one full-year LP</th><th scope="col">Difference</th></tr></thead><tbody>' +
      checkRows(check).map(function (r) { return "<tr><td>" + esc(r[0]) + '</td><td class="n">' + esc(r[1]) + '</td><td class="n">' + esc(r[2]) + "</td><td>" + esc(r[3]) + "</td></tr>"; }).join("") + "</tbody></table>" +
      (check.date ? '<p class="lx-hint">Solved on ' + esc(check.date) + ' with HiGHS by the bench\'s test.</p>' : "");
  }

  var api = { HOURS: HOURS, HPW: HPW, WEEKS: WEEKS, SITES: SITES, schema: schema, schemaFor: schemaFor, presets: presets, defaults: defaults, withPreset: withPreset,
    field: field, crf: crf, usd: usd, costs: costs, temperature: temperature, prepare: prepare, weeks: weeks, periods: periods, build: build,
    read: read, start: start, add: add, finish: finish, summarize: summarize, cashflow: cashflow, items: items, solve: solve, snap: snap, sensitivity: sensitivity, sensRows: sensRows,
    recost: recost, HINT: HINT, fmt: { money: money, num: num, pct: pct, field: fmtField }, note: note, heading: heading, planRows: planRows,
    resultsHTML: resultsHTML, fallback: fallback, inputRows: inputRows, inputsHTML: inputsHTML, sourcesHTML: sourcesHTML, checkRows: checkRows, checkHTML: checkHTML };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;
  window.LX.E0 = api;
  if (!window.LX.H) return;

  // ================================================================ page kit (browser): the bench and its results
  var LX = window.LX, H = LX.H;
  var GROUPS = [
    { site: "home", title: "The home's equipment", ids: ["pv", "hb", "hp"] },
    { site: "home", title: "The home's tariff", ids: ["tariff", "xc"] },
    { site: "farm", title: "The plant's equipment", ids: ["wind", "fb", "el", "tank"] },
    { site: "farm", title: "The line, the buyer and the prices", ids: ["line", "take", "h2", "sale"] },
    { site: null, title: "Money", ids: ["rate", "cost"] }];
  var COLOR = { pv: "var(--lx-solar)", hb: "var(--lx-bat)", fb: "var(--lx-bat)", wind: "var(--lx-wind)", el: "var(--lx-hyd)", tank: "var(--lx-hyd)", take: "var(--lx-hyd)", h2: "var(--lx-hyd)" };
  function hintOf(P, f) {
    var D = P.D;
    if (f.id === "pv") return function (lo, hi, mx, v) { return "Makes about " + num(v * P.home.pvCF * HOURS) + " kWh a year."; };
    if (f.id === "hb") return function (lo, hi, mx, v) { return v > 0 ? "Charges and discharges at up to " + num(v / 2.5, 1) + " kW (2.5 hours)." : "No battery."; };
    if (f.id === "wind") return function (lo, hi, mx, v) { return "Makes about " + num(v * P.farm.windCF * HOURS) + " MWh a year."; };
    if (f.id === "fb") return function (lo, hi, mx, v) { return v > 0 ? "Up to " + num(v / 4) + " MW in or out (4 hours)." : "No battery."; };
    if (f.id === "el") return function (lo, hi, mx, v) { return v > 0 ? "Makes up to " + num(v * 1000 / D.farm.electrolyzer.kWhPerKg) + " kg of hydrogen an hour." : "No electrolyzer."; };
    if (f.id === "tank") return function (lo, hi, mx, v) { return v > 0 ? "Holds " + num(v * 1000) + " kg of hydrogen." : "No tank: hydrogen is sold as it is made."; };
    if (f.id === "line") return function () { return "Sell only: the farm cannot buy power."; };
    if (f.id === "cost") return function () { return "100% = the sourced costs (2025 dollars)."; };
    return null;
  }
  // a row of buttons for a choice (aria-pressed); returns { el, set(v) }
  function Seg(host, f, value, onPick, hide) {
    var w = H("div", { class: "lx-ctl e0-choice" }, host);
    H("span", { class: hide ? "lx-sr" : "e0-choice-l", text: f.label, id: LX.uid("e0c") }, w);
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": f.label }, w), bs = {};
    f.values.forEach(function (x) {
      var b = H("button", { type: "button", text: f.names ? f.names[x] : x, "aria-pressed": x === value ? "true" : "false" }, g);
      b.addEventListener("click", function () { set(x); onPick(x); });
      bs[x] = b;
    });
    function set(x) { for (var k in bs) bs[k].setAttribute("aria-pressed", k === x ? "true" : "false"); }
    return { el: w, set: set };
  }
  var SITE_WORDS = { home: "the home", farm: "the wind farm" };
  // results: tiles, a week chart with a 52-week strip, the cash flow and a table of the year's energy
  function Results(host, o) {
    var P = o.P, wrap = H("div", { class: "lx-sb-results e0-results" }, host), sel = { home: null, farm: null }, last = null;
    var tiles = H("div", { class: "e0-tiles" }, wrap);
    var charts = H("div", { class: "lx-sb-charts" }, wrap);
    var wkCard = H("div", { class: "lx-xcard lx-sb-chart" }, charts);
    var wkHead = H("header", { class: "lx-x-head" }, wkCard), wkTitle = H("h3", { text: "A week of 2025, hour by hour" }, wkHead);
    var stripL = H("p", { class: "lx-hint e0-strip-l" }, wkCard);
    var strip = H("div", { class: "e0-strip", role: "group", "aria-label": "Pick a week of 2025" }, wkCard);
    var wkNav = H("div", { class: "e0-wknav" }, wkCard);
    var prev = H("button", { type: "button", class: "lx-btn ghost small", text: "← Week before" }, wkNav);
    var wkName = H("span", { class: "e0-wkname", "aria-live": "polite" }, wkNav);
    var next = H("button", { type: "button", class: "lx-btn ghost small", text: "Week after →" }, wkNav);
    var plot = LX.Plot(wkCard, { text: "Text version: this week, day by day", legend: true });
    var cfCard = H("div", { class: "lx-xcard lx-sb-chart" }, charts);
    var cfHead = H("header", { class: "lx-x-head" }, cfCard); H("h3", { text: "Cash flow, year by year" }, cfHead);
    var cfLede = H("p", { class: "lx-hint" }, cfCard);
    var cfPlot = LX.Plot(cfCard, { text: "Text version: the cash flow", legend: true });
    var extra = H("div", { class: "e0-extra" }, wrap);
    var flowCard = H("div", { class: "lx-xcard" }, wrap);
    var fh = H("header", { class: "lx-x-head" }, flowCard); H("h3", { text: "The year's energy" }, fh);
    var flowT = H("div", { class: "lx-scroll-x" }, flowCard);
    // a week picked from the strip keeps the keyboard focus on its square (the strip is redrawn)
    function pickWeek(site, i, focus) {
      sel[site] = Math.max(0, Math.min(WEEKS - 1, i)); if (last) drawWeek(last.res, last.s);
      if (focus && strip.children[sel[site]]) strip.children[sel[site]].focus();
    }
    prev.addEventListener("click", function () { if (last) pickWeek(last.s.site, sel[last.s.site] - 1); });
    next.addEventListener("click", function () { if (last) pickWeek(last.s.site, sel[last.s.site] + 1); });
    function dayLabel(iso, d) { var t = new Date(Date.parse(iso + "T00:00:00Z") + d * 86400000); return t.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getUTCMonth()]; }
    function drawStrip(res, s) {
      strip.innerHTML = "";
      var ps = res.periods.filter(function (p) { return p.kind === "week"; }), home = s.site === "home";
      var lo = Math.min.apply(null, ps.map(function (p) { return p.sums.share; })), hi = Math.max.apply(null, ps.map(function (p) { return p.sums.share; }));
      stripL.textContent = (home ? "Each square is a week: the stronger its colour, the larger the share of the home's electricity bought from the grid (" : "Each square is a week: the stronger its colour, the more of the wind is spilled (") +
        pct(lo) + " to " + pct(hi) + "). Pick one.";
      ps.forEach(function (p, i) {
        var v = p.sums.share, k = hi > lo ? (v - lo) / (hi - lo) : 0, b = H("button", { type: "button", class: "e0-cell" + (i === sel[s.site] ? " on" : ""), style: "--v:" + Math.round(8 + 82 * k) + "%",
          "aria-pressed": i === sel[s.site] ? "true" : "false", "aria-label": "Week of " + dayLabel(p.start, 0) + ": " + pct(v) + (home ? " from the grid" : " spilled") }, strip);
        b.addEventListener("click", function () { pickWeek(s.site, i, true); });
      });
    }
    function drawWeek(res, s) {
      var ps = res.periods.filter(function (p) { return p.kind === "week"; }), i = sel[s.site], p = ps[i], S = p.series, home = s.site === "home", bars = [], u = home ? "kWh" : "MWh";
      drawStrip(res, s);
      wkName.textContent = "Week of " + dayLabel(p.start, 0) + " to " + dayLabel(p.start, 6) + " (" + (i + 1) + " of 52)";
      prev.disabled = i === 0; next.disabled = i === WEEKS - 1;
      var ymax = 0, ymin = 0, h;
      for (h = 0; h < HPW; h++) {
        var stack = home ? [[S.pv[h] - S.exp[h] - S.ch[h], "var(--lx-solar)"], [S.dis[h], "var(--lx-bat)"], [S.imp[h], "var(--lx-ink-3)"]]
          : [[S.sell[h], "var(--lx-wind)"], [S.el[h], "var(--lx-hyd)"], [S.ch[h], "var(--lx-bat)"], [S.spill[h], "var(--lx-bad)"]];
        var y = 0;
        stack.forEach(function (q) { var v = Math.max(0, q[0]); if (v > 1e-6) bars.push({ x0: h, x1: h + 0.92, y0: y, y1: y + v, color: q[1] }); y += v; });
        if (home && S.exp[h] > 1e-6) { bars.push({ x0: h, x1: h + 0.92, y0: -S.exp[h], y1: 0, color: "var(--lx-solar)", op: 0.45 }); ymin = Math.min(ymin, -S.exp[h]); }
        if (home && S.ch[h] > 1e-6) { bars.push({ x0: h, x1: h + 0.92, y0: -S.exp[h] - S.ch[h], y1: -S.exp[h], color: "var(--lx-bat)", op: 0.45 }); ymin = Math.min(ymin, -S.exp[h] - S.ch[h]); }
        ymax = Math.max(ymax, y, home ? S.need[h] : S.wind[h] + S.dis[h]);
      }
      var ax = axis(ymin, ymax), top = ax.top, bot = ax.bot;
      var xt = []; for (var d = 0; d < 7; d++) xt.push([d * 24 + 12, dayLabel(p.start, d)]);
      var spec = { x: { min: 0, max: HPW, ticks: xt, ticksN: xt.filter(function (_, k) { return k % 2 === 0; }) }, y: { min: bot, max: top, step: ax.step, fmt: function (v) { return (v < 0 ? "−" : "") + num(Math.abs(v), ax.step < 1 ? 1 : 0); }, unit: u, zero: true },
        bars: bars, height: 240, heightN: 210, aria: "The week's hourly energy, as stacked bars",
        lines: [{ values: home ? S.need : S.wind, color: "var(--lx-ink)", width: 1.6, step: 1 }],
        refs: home ? [] : [{ y: res.sized.line, label: "line " + num(res.sized.line) + " MW", color: "var(--lx-ink-2)", dash: "4 3" }],
        legend: home ? [{ label: "solar used at home", color: "var(--lx-solar)" }, { label: "from the battery", color: "var(--lx-bat)" }, { label: "from the grid", color: "var(--lx-ink-3)" }, { label: "below zero: sent back or into the battery", color: "var(--lx-solar)", dash: "2 2" }, { label: "the home's need", color: "var(--lx-ink)" }]
          : [{ label: "sold", color: "var(--lx-wind)" }, { label: "into the electrolyzer", color: "var(--lx-hyd)" }, { label: "into the battery", color: "var(--lx-bat)" }, { label: "spilled", color: "var(--lx-bad)" }, { label: "wind made", color: "var(--lx-ink)" }],
        tip: function (x) {
          var k = Math.max(0, Math.min(HPW - 1, Math.floor(x))), dd = Math.floor(k / 24), hh = k % 24, t = dayLabel(p.start, dd) + ", " + (hh < 10 ? "0" : "") + hh + ":00";
          return home ? "<b>" + t + "</b><br>need " + num(S.need[k], 2) + " kWh · solar " + num(S.pv[k], 2) + " · grid " + num(S.imp[k], 2) + " · battery " + num(S.dis[k] - S.ch[k], 2) + " · sent back " + num(S.exp[k], 2)
            : "<b>" + t + "</b><br>wind " + num(S.wind[k]) + " MW · sold " + num(S.sell[k]) + " · electrolyzer " + num(S.el[k]) + " · battery " + num(S.dis[k] - S.ch[k]) + " · spilled " + num(S.spill[k]);
        }, tipStep: 1 };
      var rows = [];
      for (d = 0; d < 7; d++) {
        var a = d * 24, z = function (k) { var t = 0; for (var q = a; q < a + 24; q++) t += S[k][q]; return t; };
        rows.push(home ? [dayLabel(p.start, d), num(z("need"), 1), num(z("pv"), 1), num(z("imp"), 1), num(z("exp"), 1), num(z("dis"), 1)]
          : [dayLabel(p.start, d), num(z("wind")), num(z("sell")), num(z("el")), num(z("spill")), num(z("h2") / 1000, 1)]);
      }
      spec.text = { head: home ? ["Day", "Need, kWh", "Solar, kWh", "Bought, kWh", "Sent back, kWh", "From the battery, kWh"] : ["Day", "Wind, MWh", "Sold, MWh", "Electrolyzer, MWh", "Spilled, MWh", "Hydrogen sold, t"], rows: rows,
        note: "Hours run from 00:00, Central standard time. The bars show where each hour's energy went; the line is " + (home ? "the home's need." : "what the wind made.") };
      plot.render(spec);
    }
    function niceTop(v) { var e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
    // an axis from mn to mx (mn <= 0 <= mx) with gridlines every step, 0 among them
    function axis(mn, mx) { mn = Math.min(0, mn); mx = Math.max(0, mx); if (mx - mn <= 0) mx = 1; var st = niceTop((mx - mn) / 4); return { step: st, bot: -Math.ceil(-mn / st - 1e-9) * st, top: Math.ceil(mx / st - 1e-9) * st }; }
    function drawCash(res, s) {
      var M = res.money, rows = M.cash, k = s.site === "home" ? 1 : 1e6, unit = s.site === "home" ? "$" : "$M", bars = [];
      var mx = 0, mn = 0;
      rows.forEach(function (r) { var v = r.net / k; bars.push({ x0: r.year + 0.12, x1: r.year + 0.88, y0: Math.min(0, v), y1: Math.max(0, v), color: v >= 0 ? "var(--lx-good)" : "var(--lx-bad)" }); mx = Math.max(mx, v); mn = Math.min(mn, v); });
      var cum = rows.map(function (r) { return [r.year + 0.5, r.npv / k]; });
      cum.forEach(function (c) { mx = Math.max(mx, c[1]); mn = Math.min(mn, c[1]); });
      var ax = axis(mn, mx), top = ax.top, bot = ax.bot;
      var xt = []; for (var y = 0; y <= M.horizon; y += 5) xt.push([y + 0.5, String(y)]);
      cfLede.textContent = "Year 0: the equipment. Then each year " + (s.site === "home" ? "the saving" : "the net revenue") + " less upkeep; replacements when a life ends. The line adds them up, discounted: where it ends is the NPV, " + money(M.npv) + ".";
      cfPlot.render({ x: { min: 0, max: M.horizon + 1, ticks: xt }, y: { min: bot, max: top, step: ax.step, fmt: function (v) { var sg = v < -1e-9 ? "−" : "", a = Math.abs(v); return sg + (k === 1 ? "$" + num(a / 1000, ax.step < 1000 ? 1 : 0) + "k" : "$" + num(a, ax.step < 1 ? 1 : 0) + "M"); }, zero: true },
        bars: bars, lines: [{ pts: cum, color: "var(--lx-ink)", width: 2, dots: false }], height: 220, heightN: 200, aria: "Cash flow bars by year and the discounted running total",
        legend: [{ label: "net cash in the year", color: "var(--lx-good)" }, { label: "money out", color: "var(--lx-bad)" }, { label: "running total, discounted", color: "var(--lx-ink)" }],
        tip: function (x) { var r = rows[Math.max(0, Math.min(rows.length - 1, Math.floor(x)))]; return "<b>Year " + r.year + "</b><br>net " + money(r.net) + " · discounted " + money(r.disc) + " · running total " + money(r.npv); }, tipStep: 1,
        text: { head: ["Year", "Equipment", "Saving or revenue", "Upkeep", "Replacement", "Residual value", "Net", "Running total, discounted"],
          rows: rows.map(function (r) { return [String(r.year), money(r.capex), money(r.annual), money(r.fom), money(r.replace), money(r.residual), money(r.net), money(r.npv)]; }),
          note: "Real " + num(s.rate, 1) + "% discount rate; 2025 dollars; " + unit + " on the chart." } });
    }
    function draw(res, s) {
      last = { res: res, s: s };
      if (sel[s.site] === null) {   // the week where the site leans on the grid (home) or spills (farm) most
        var ps = res.periods.filter(function (p) { return p.kind === "week"; }), b = 0;
        ps.forEach(function (p, i) { if (p.sums.share > ps[b].sums.share) b = i; });
        sel[s.site] = b;
      }
      tiles.innerHTML = "";
      res.readouts.forEach(function (r) {
        var t = H("div", { class: "e0-tile" }, tiles);
        H("span", { class: "l", text: r.label }, t); H("b", { text: r.value }, t); H("span", { class: "n", text: r.note }, t);
      });
      wkTitle.textContent = "A week of 2025 at " + SITE_WORDS[s.site] + ", hour by hour";
      drawWeek(res, s); drawCash(res, s);
      flowT.innerHTML = "<table class='lx-facts'><thead><tr><th scope='col'>In the year</th><th scope='col'>Amount</th></tr></thead><tbody>" +
        res.flows.map(function (f) { return "<tr><td>" + LX.esc(f.label) + "</td><td class='n'>" + num(f.value, f.unit === "t" ? 0 : 0) + " " + f.unit + "</td></tr>"; }).join("") + "</tbody></table>";
      if (o.onDraw) o.onDraw(res, s, extra);
    }
    return { el: wrap, draw: draw, last: function () { return last; }, extra: extra, week: function (site, i) { if (i != null) pickWeek(site, i); return sel[site]; } };
  }
  // the bench: controls from the schema, presets, the run box, the sizing run, readouts and the plan link
  function bench(live, o) {
    var P = o.P, S = o.schema || schema, F = {};
    S.fields.forEach(function (f) { F[f.id] = f; });
    var frame = H("div", { class: "lx-sb e0-bench" }, live);
    var ctl = H("div", { class: "lx-sb-controls" }, frame), side = H("div", { class: "lx-sb-side" }, frame);
    var presetBox = H("div", { class: "e0-presets" }, side), runBox = H("div", null, side), roBox = H("div", { class: "lx-readouts e0-ro", "aria-live": "polite" }, side);
    var sizeBox = o.size === false ? null : H("div", { class: "e0-size" }, side), linkBox = H("div", null, side);
    var ss = LX.ShareState(linkBox, { schema: S, id: (o.id || "sb0") + "-link", onLoad: function (st) { plan = st; refill(); changed(); run.run(plan); } });
    side.insertBefore(ss.status, side.firstChild);   // a link opened or refused is said at the top of the run box
    var plan = ss.state, ctrls = {}, groupEls = [], sizeHint = null;
    var siteF = F.site, siteSeg = Seg(H("fieldset", { class: "lx-sb-group" }, ctl), siteF, plan.site, function (v) { plan.site = v; showSite(); changed(); }, true);
    siteSeg.el.parentNode.insertBefore(H("legend", { text: "Site" }), siteSeg.el);
    GROUPS.forEach(function (g) {
      var fs = H("fieldset", { class: "lx-sb-group" }, ctl); H("legend", { text: g.title }, fs);
      groupEls.push({ el: fs, site: g.site });
      g.ids.forEach(function (id) {
        var f = F[id]; if (!f) return;
        if (f.type === "enum") ctrls[id] = Seg(fs, f, plan[id], function (v) { plan[id] = v; changed(); });
        else {
          var sl = LX.Slider(fs, { label: f.label, min: f.min, max: f.max, step: f.step || 1, value: plan[id], color: COLOR[id] || "var(--lx-ink-2)", unit: f.unit,
            fmt: function (v) { return id === "cost" ? v + "%" : fmtField(f, v); }, hint: hintOf(P, f), onChange: function (v) { plan[id] = v; changed(); } });
          ctrls[id] = { el: sl.el, set: function (v) { sl.set(v); } };
        }
      });
    });
    function refill() { siteSeg.set(plan.site); for (var id in ctrls) ctrls[id].set(plan[id]); showSite(); }
    var shownSite = null;
    function showSite() {
      groupEls.forEach(function (g) { g.el.hidden = !!g.site && g.site !== plan.site; });
      if (sizeHint) sizeHint.textContent = "Or let the engine choose the " + (plan.site === "home" ? "solar and battery" : "battery, electrolyzer and tank") + " sizes with the least yearly cost, on " +
        P[plan.site].weeks.reps.length + " representative weeks; your other choices stay.";
      if (shownSite === plan.site) return;
      shownSite = plan.site;
      presetBox.innerHTML = "";
      H("p", { class: "e0-presets-l", text: "Start from" }, presetBox);
      var row = H("div", { class: "lx-sb-presets" }, presetBox);
      (o.presets || presets).filter(function (p) { return p.site === plan.site; }).forEach(function (p) {
        var b = H("button", { type: "button", class: "lx-btn ghost small", text: p.label }, row);
        b.addEventListener("click", function () { plan = withPreset(plan, p); refill(); changed(); run.run(plan); });
      });
    }
    var res = Results(o.resultsHost, { P: P, onDraw: o.onDraw });
    var staleP = H("p", null); o.resultsHost.insertBefore(staleP, res.el);
    function chips(r) {
      roBox.innerHTML = "";
      r.readouts.slice(0, 3).forEach(function (x) { var c = H("div", { class: "lx-readout" }, roBox); H("span", { text: x.label }, c); H("b", { text: x.value }, c); });
    }
    var run = LX.BenchRun(runBox, { label: "Run the year", state: function () { return plan; },
      solve: function (st, ctx) { return solve(st, P, { signal: ctx.signal, timeLimit: ctx.attempt > 1 ? 30 : 10 }); },
      render: function (r, st, full) { res.draw(r, st); chips(r); if (o.onRun) o.onRun(r, st, full); },
      results: [res.el, roBox], stale: staleP, busy: o.api && o.api.busy, onDone: function (r, st) { if (o.onDone) o.onDone(r, st); },
      words: { ok: "Done: the cheapest way to run this plan through every hour of 2025, as 52 weeks (the solver reports each one optimal)." } });
    var sizer = null;
    if (sizeBox) {
      var sizeHint = H("p", { class: "lx-hint" }, sizeBox);
      sizer = LX.BenchRun(sizeBox, { label: "Size it for me", state: function () { return plan; },
        solve: function (st, ctx) { return solve(st, P, { size: true, signal: ctx.signal, timeLimit: ctx.attempt > 1 ? 30 : 10 }); },
        render: function (r) { var sn = r.snapped; SIZE_KEYS[plan.site].forEach(function (k) { plan[k] = sn[k]; }); refill(); changed(); setTimeout(function () { run.run(plan); }, 0); },
        busy: o.api && o.api.busy,
        words: { ok: "Sized: the engine's least-cost sizes, rounded to the controls' steps, are on the controls, and the year is running with them." } });
    }
    function changed() { ss.set(plan); run.changed(plan); if (o.onChange) o.onChange(plan); }
    refill();
    return { ss: ss, run: run, sizer: sizer, results: res, plan: function () { return JSON.parse(JSON.stringify(plan)); },
      set: function (st, go) { plan = withPreset(plan, { state: st }); refill(); changed(); if (go) return run.run(plan); },
      frame: frame };
  }
  var SIZE_KEYS = { home: ["pv", "hb"], farm: ["fb", "el", "tank"] };
  api.ui = { bench: bench, Results: Results, Seg: Seg, GROUPS: GROUPS, SIZE_KEYS: SIZE_KEYS };
})();
