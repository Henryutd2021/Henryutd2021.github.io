/* planengine.js — LX.townPlan: the planning engine of lessons 12 and 13, Prairie Town's capacity plan as a linear program
   (first written for lesson 13, assets/learn/13-capstone.js). It is the one-region capacity-expansion LP that M3 and
   A22 can build on (one of the course's scale engines).
   Data a lesson passes in: assets/learn/data/13-capstone.json (technology costs with primary sources and dates, the
   default scenario, the representative-week rule), town_year.json (every hour of 2025 on the Southwest Power Pool grid,
   EIA-930, as shapes) and cf_targets.json (EIA 2025 capacity factors, used by LX.townProfile to size wind and solar).

   The model (a linear program; Prairie Town is fictional, its costs are real and dated):
     decisions   capacities: wind, solar, gas combined-cycle (cc), gas peaker (pk), nuclear (nuc) in MW; battery power
                 (bp, MW) and energy (be, MWh). Every hour: cc and peaker output, battery charge and discharge, unserved
                 demand (only when the reader's plan is fixed; the optimizer must serve all demand).
     goal        least annual cost = annualised capital + fixed O&M (per MW or MWh built) + fuel and variable O&M (per MWh)
                 [+ a carbon price x CO2: lesson 12's weighted sum]. Nuclear runs flat, so its fuel is a fixed yearly cost.
     rules       every hour: wind + solar + nuclear + cc + peaker + discharge - charge + unserved >= demand (what is left
                 over is spilled); wind and solar make capacity x the hour's availability (LX.townProfile, "scale" method,
                 EIA 2025 targets; night-time solar is zero in the data itself); nuclear runs flat at 91.1% (EIA's 2025
                 fleet capacity factor, a yearly average used as every hour's output: a simplification the page states),
                 as in lesson 0; gas output <= its capacity; charge + discharge <= battery MW;
                 battery energy within [0, MWh], 85% round trip (losses on charging); optional: annual CO2 <= cap.
     time        seven weeks of 2025 (168 chronological hours each): one medoid week per season, scaled so the season's
                 demand, wind and solar energy are kept, plus three weeks kept as they are (the year's peak demand, the
                 highest net load, the least wind). Each stands for its weeks (weights); the year's 52 calendar weeks keep
                 their order, and the battery's state is linked across them (Kotzur et al. 2018: the level at the start of
                 each calendar week plus the representative week's own swing stays within [0, MWh]; the year ends where it
                 starts). The 24 hours of 31 December are covered by scaling the weights to 8,760 h.
     check       fullYearModel(): the same LP on all 8,760 hours in calendar order (_tests/learn/test_13-capstone.js
                 compares plans, costs, CO2, unserved and spilled energy; the page offers it as "check on all 8,760 hours").
   Pure API (Node: require("assets/learn/components/planengine.js"); browser: LX.townPlan):
     prepareYear(year, targets, cfg[, townProfile]) -> Y;  selectWeeks(Y, cfg.weeks) -> RW (seven weeks, weights, chrono);
     costs(cfg, scenario) -> C;  weekModel(C, RW, {cap, price, plan}) and fullYearModel(C, Y, opts) -> models for LX.solver;
     summarize(C, periods, result, opts) -> {cost, co2, plan, unserved, spilledShare, capDual, ...};  periodsOf(RW);
     encodePlan and decodePlan (#plan-... links), weekSeries, frontierAt, ceilPlan, stars, capReading, fullVerdict, crf,
     fixedCost, build, KEYS, HPW, WEEKS, HOURS, weekMonth, weekStart;
     from lesson M3: link(model, RW, mode) (the battery between representative weeks: "linked",
     "cyclic" or "free"), yearPeriods(Y), readCheck(C, Y, result, plan) (a fixed plan's full-year run: totals and MWh
     unserved in each calendar week) and errors(est, full, cap, ref) (cost gap, CO2 over the cap, estimate error).
     LX.WeekStrip (components/weekstrip.js) draws a set of weeks and readCheck's byWeek as a 52-week calendar.
   Page kit (browser only): LX.townPlan.ui = { TECH (names and colours), fm (number formats), Num (a numeric control in
     the slider look), TextTable (a comparison table of words; cards on phones), css (kept for callers; the styles are in
     planengine.css, bundled into learn.css) }.
   Tests: _tests/learn/test_13-capstone.js (also with --full), test_12-trade-offs.js, test_m03-capacity-expansion.js and
   test_components_w2_plan.js (link, readCheck, errors, the week strip). */
(function () {
  "use strict";
  var HPW = 168, WEEKS = 52, HOURS = 8760;

  // ---------------------------------------------------------------- inputs: the town's year
  // Y = { demand[8760] MW, wind[8760], solar[8760] (MW per MW built), nucAvail, peak, energy }
  // Index i of town_year.json is the hour that starts i hours after 00:00 on 1 January, Central standard time (UTC-6).
  // Night-time solar telemetry errors are set to zero by the town data build step, so the shapes
  // are used as they are.
  function prepareYear(year, targets, cfg, profile) {
    var tp = profile || (typeof window !== "undefined" && window.LX && window.LX.townProfile);
    if (!tp) throw new Error("prepareYear: the capacity-factor helper (LX.townProfile) is missing");
    var peakMW = cfg.town.demandPeakMW;
    var demand = year.demand.map(function (v) { return v / 1000 * peakMW; });
    var w = tp("wind", 1, { year: year, targets: targets, method: cfg.town.profileMethod });
    var s = tp("solar", 1, { year: year, targets: targets, method: cfg.town.profileMethod });
    var e = 0, pk = 0;
    demand.forEach(function (d) { e += d; if (d > pk) pk = d; });
    return { demand: demand, wind: w.mw, solar: s.mw, windCF: w.cf, solarCF: s.cf, nucAvail: cfg.techs.nuc.avail,
             peak: pk, energy: e, start_utc: year.start_utc };
  }

  // ---------------------------------------------------------------- representative weeks
  var SEASONS = [["winter", [12, 1, 2]], ["spring", [3, 4, 5]], ["summer", [6, 7, 8]], ["fall", [9, 10, 11]]];
  function weekStart(Y, i) { return new Date(Date.parse(Y.start_utc + "Z") + (i * HPW - 1) * 3600000 - 6 * 3600000); }  // local standard time
  function weekMonth(Y, i) { return new Date(weekStart(Y, i).getTime() + 84 * 3600000).getUTCMonth() + 1; }   // month of its middle
  function seasonOf(Y, i) { var m = weekMonth(Y, i); return SEASONS.filter(function (S) { return S[1].indexOf(m) >= 0; })[0][0]; }
  function weekStats(Y, i, ref) {
    var o = { d: 0, w: 0, s: 0, peak: 0, net: -Infinity };
    for (var h = i * HPW; h < (i + 1) * HPW; h++) {
      o.d += Y.demand[h]; o.w += Y.wind[h]; o.s += Y.solar[h]; if (Y.demand[h] > o.peak) o.peak = Y.demand[h];
      var n = Y.demand[h] - ref.wind * Y.wind[h] - ref.solar * Y.solar[h]; if (n > o.net) o.net = n;
    }
    return o;
  }
  // distance between two weeks: hour-by-hour squared differences of demand (as a share of the peak), wind and solar
  function weekDist(Y, a, b) {
    var x = 0, A = a * HPW, B = b * HPW, P = Y.peak;
    for (var h = 0; h < HPW; h++) {
      var dd = (Y.demand[A + h] - Y.demand[B + h]) / P, dw = Y.wind[A + h] - Y.wind[B + h], ds = Y.solar[A + h] - Y.solar[B + h];
      x += dd * dd + dw * dw + ds * ds;
    }
    return x;
  }
  // opts (13-capstone.json "weeks"): extremes, kept as they are, from
  //   peak    the week with the year's highest hourly demand
  //   netpeak the week with the highest hourly net load (demand minus the output of reference wind and solar farms)
  //   calm    the week with the least wind energy
  //   winter  the winter week with the highest hourly net load (chosen after the other extremes)
  // then one medoid week per season among the other weeks of that season (the week closest, hour by hour, to all the
  // others), scaled so that the season's demand, wind and solar energy are kept.
  function selectWeeks(Y, opts) {
    opts = opts || {};
    var ref = opts.netRef || { wind: 150, solar: 200 }, ext = opts.extremes || ["peak", "netpeak", "calm", "winter"];
    var stats = [], i;
    for (i = 0; i < WEEKS; i++) stats.push(weekStats(Y, i, ref));
    var taken = {}, picks = [];
    function best(score, ok) {
      var b = -1;
      for (var j = 0; j < WEEKS; j++) if (!taken[j] && (!ok || ok(j)) && (b < 0 || score(j) > score(b))) b = j;
      return b;
    }
    ext.forEach(function (kind) {
      var j = kind === "peak" ? best(function (k) { return stats[k].peak; })
        : kind === "netpeak" ? best(function (k) { return stats[k].net; })
        : kind === "calm" ? best(function (k) { return -stats[k].w; })
        : kind === "winter" ? best(function (k) { return stats[k].net; }, function (k) { return seasonOf(Y, k) === "winter"; }) : -1;
      if (j < 0) throw new Error("selectWeeks: unknown extreme " + kind);
      taken[j] = true; picks.push({ week: j, kind: kind });
    });
    var reps = [], map = new Array(WEEKS), per = opts.perSeason || 1;
    function medoid(members) {
      var bestW = -1, bestD = Infinity;
      members.forEach(function (c) {
        var tot = 0; members.forEach(function (m) { if (m !== c) tot += weekDist(Y, c, m); });
        if (tot < bestD) { bestD = tot; bestW = c; }
      });
      return bestW;
    }
    // k-medoids inside a season (k = per): start from the medoid and the week farthest from it, then alternate
    // assigning weeks to the nearest medoid and re-centring each group, until nothing changes
    function groups(members) {
      if (per === 1 || members.length <= per) return [members];
      var meds = [medoid(members)];
      while (meds.length < per) {
        var far = -1, fd = -1;
        members.forEach(function (m) { if (meds.indexOf(m) >= 0) return; var d = Math.min.apply(null, meds.map(function (q) { return weekDist(Y, m, q); })); if (d > fd) { fd = d; far = m; } });
        meds.push(far);
      }
      for (var it = 0; it < 20; it++) {
        var gs = meds.map(function () { return []; });
        members.forEach(function (m) { var b = 0, bd = Infinity; meds.forEach(function (q, k) { var d = weekDist(Y, m, q); if (d < bd) { bd = d; b = k; } }); gs[b].push(m); });
        var nm = gs.map(medoid);
        if (nm.join() === meds.join()) return gs;
        meds = nm;
      }
      return gs;
    }
    SEASONS.forEach(function (S) {
      var members = [];
      for (var j = 0; j < WEEKS; j++) if (!taken[j] && seasonOf(Y, j) === S[0]) members.push(j);
      groups(members).forEach(function (g) {
        var bestW = medoid(g), sum = { d: 0, w: 0, s: 0 };
        g.forEach(function (m) { sum.d += stats[m].d; sum.w += stats[m].w; sum.s += stats[m].s; });
        var n = g.length, b = stats[bestW];
        g.forEach(function (m) { map[m] = reps.length; });
        reps.push({ week: bestW, kind: "season", season: S[0], n: n, members: g,
                    scale: { d: sum.d / n / b.d, w: sum.w / n / b.w, s: b.s > 0 ? sum.s / n / b.s : 1 } });
      });
    });
    picks.forEach(function (x) {
      map[x.week] = reps.length;
      reps.push({ week: x.week, kind: x.kind, season: seasonOf(Y, x.week), n: 1, members: [x.week], scale: { d: 1, w: 1, s: 1 } });
    });
    var f = HOURS / (WEEKS * HPW);   // the 24 hours of 31 December, spread over the weights
    reps.forEach(function (r) {
      r.weight = r.n * f;            // hours of the year each modelled hour stands for
      r.start = weekStart(Y, r.week).toISOString().slice(0, 10);
      var A = r.week * HPW;
      r.demand = []; r.wind = []; r.solar = [];
      for (var h = 0; h < HPW; h++) {
        r.demand.push(Y.demand[A + h] * r.scale.d);
        r.wind.push(Math.min(1, Y.wind[A + h] * r.scale.w));
        r.solar.push(Math.min(1, Y.solar[A + h] * r.scale.s));
      }
    });
    return { reps: reps, chrono: map };
  }

  // ---------------------------------------------------------------- costs
  function crf(r, n) { return r === 0 ? 1 / n : r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1); }
  // annual $ per MW (per MWh for battery energy) and running $ per MWh, for a scenario {gas, nucCapex, ...}
  function costs(cfg, sc) {
    sc = sc || {};
    var T = cfg.techs, fin = cfg.finance, gas = sc.gas != null ? sc.gas : cfg.fuel.gas, ef = cfg.fuel.co2PerMMBtu / 1000;
    var C = { gas: gas, wacc: fin.wacc, techs: {} };
    function fixed(capexPerkW, fomPerkWyr, life) { return 1000 * (capexPerkW * crf(fin.wacc / 100, life) + fomPerkWyr); }
    ["wind", "solar", "cc", "pk", "nuc"].forEach(function (k) {
      var t = T[k], capex = k === "nuc" && sc.nucCapex != null ? sc.nucCapex : t.capex;
      var run = (t.heatRate ? t.heatRate * gas : 0) + (t.fuel || 0) + (t.vom || 0);
      var co2 = t.heatRate ? t.heatRate * ef : 0;
      C.techs[k] = { capex: capex, fixed: fixed(capex, t.fom, t.life || fin.life), run: run, co2: co2 };
    });
    var b = T.battery;
    C.techs.bp = { capex: b.powerCapex, fixed: fixed(b.powerCapex, b.powerCapex * b.fomShare, b.life), run: 0, co2: 0 };
    C.techs.be = { capex: b.energyCapex, fixed: fixed(b.energyCapex, b.energyCapex * b.fomShare, b.life), run: 0, co2: 0 };
    C.eta = b.rte; C.voll = cfg.unservedPenalty; C.nucAvail = T.nuc.avail;
    // nuclear runs flat: its running cost is a fixed annual cost per MW built
    C.techs.nuc.fixedTotal = C.techs.nuc.fixed + C.techs.nuc.run * T.nuc.avail * HOURS;
    return C;
  }

  // ---------------------------------------------------------------- the LP
  var KEYS = ["wind", "solar", "cc", "pk", "nuc", "bp", "be"];
  // periods: [{demand[], wind[], solar[], weight}] in order; chrono: for the linked model, the calendar sequence of period
  // indices (the battery's start level is linked across it); full: one period, the whole year, cyclic.
  // opts: plan {wind, solar, ...} fixes capacities (else they are decisions), cap (t CO2 per year), price ($/t),
  //       unserved (allow unserved demand at the penalty; default: only when the plan is fixed)
  function build(C, periods, chrono, opts) {
    opts = opts || {};
    var plan = opts.plan || null, price = opts.price || 0, allowU = opts.unserved != null ? opts.unserved : !!plan;
    var T = C.techs, vars = [], cons = [], nuc = C.nucAvail;
    function V(name, lb, ub, cost) { vars.push({ name: name, lb: lb, ub: ub, cost: cost || 0 }); }
    var cap = {};
    if (!plan) KEYS.forEach(function (k) {
      V("K_" + k, 0, Infinity, k === "nuc" ? T.nuc.fixedTotal : T[k].fixed);
      cap[k] = "K_" + k;
    });
    var hasBat = plan ? plan.bp > 0 && plan.be > 0 : true;
    var co2Terms = {}, single = periods.length === 1 && !chrono;
    periods.forEach(function (P, p) {
      var w = P.weight, n = P.demand.length;
      var ccRun = w * (T.cc.run + price * T.cc.co2), pkRun = w * (T.pk.run + price * T.pk.co2);
      if (hasBat && !single) {   // the representative week's own swing: lo <= level - start level <= hi
        V("lo" + p, -Infinity, 0); V("hi" + p, 0, Infinity);
      }
      for (var h = 0; h < n; h++) {
        var id = p + "_" + h, d = P.demand[h];
        V("g" + id, 0, plan ? plan.cc : Infinity, ccRun);
        V("p" + id, 0, plan ? plan.pk : Infinity, pkRun);
        if (allowU) V("u" + id, 0, Infinity, w * C.voll);
        // supply >= demand: what is left over is spilled (wind, sun or the flat nuclear output that nobody can use)
        var bal = {}; bal["g" + id] = 1; bal["p" + id] = 1; if (allowU) bal["u" + id] = 1;
        var rhs = d;
        if (plan) rhs -= P.wind[h] * plan.wind + P.solar[h] * plan.solar + nuc * plan.nuc;
        else { bal.K_wind = P.wind[h]; bal.K_solar = P.solar[h]; bal.K_nuc = nuc; }
        if (hasBat) {
          V("c" + id, 0, plan ? plan.bp : Infinity, 0); V("d" + id, 0, plan ? plan.bp : Infinity, 0);
          V("s" + id, single ? 0 : -Infinity, single && plan ? plan.be : Infinity, 0);
          bal["d" + id] = 1; bal["c" + id] = -1;
          var dyn = {}; dyn["s" + id] = 1; dyn["c" + id] = -C.eta; dyn["d" + id] = 1;
          var prev = h > 0 ? "s" + p + "_" + (h - 1) : single ? "s" + p + "_" + (n - 1) : null;   // full year: cyclic
          if (prev) dyn[prev] = (dyn[prev] || 0) - 1;
          cons.push({ name: "S" + id, terms: dyn, eq: 0 });
          if (!single) {
            var a = {}; a["s" + id] = 1; a["lo" + p] = -1; cons.push({ name: "L" + id, terms: a, ge: 0 });
            var b = {}; b["s" + id] = 1; b["hi" + p] = -1; cons.push({ name: "U" + id, terms: b, le: 0 });
          } else if (!plan) {
            var e = {}; e["s" + id] = 1; e.K_be = -1; cons.push({ name: "E" + id, terms: e, le: 0 });
          }
          // charge + discharge <= battery MW, for the optimizer and for a fixed plan alike (one row: charging and
          // discharging at once never pays, so the row changes no cost; it keeps every solution physical)
          var c1 = {}; c1["c" + id] = 1; c1["d" + id] = 1;
          if (plan) cons.push({ name: "P" + id, terms: c1, le: plan.bp });
          else { c1.K_bp = -1; cons.push({ name: "P" + id, terms: c1, le: 0 }); }
        }
        if (!plan) {
          var g = {}; g["g" + id] = 1; g.K_cc = -1; cons.push({ name: "Gc" + id, terms: g, le: 0 });
          var q = {}; q["p" + id] = 1; q.K_pk = -1; cons.push({ name: "Gp" + id, terms: q, le: 0 });
        }
        cons.push({ name: "B" + id, terms: bal, ge: rhs });
        co2Terms["g" + id] = w * T.cc.co2; co2Terms["p" + id] = w * T.pk.co2;
      }
    });
    // the battery's level at the start of each calendar week, linked across the year
    if (hasBat && !single) {
      var N = chrono.length;
      for (var i = 0; i < N; i++) V("W" + i, 0, Infinity, 0);
      for (i = 0; i < N; i++) {
        var r = chrono[i], last = "s" + r + "_" + (periods[r].demand.length - 1), nx = (i + 1) % N;
        var link = {}; link["W" + nx] = 1; link["W" + i] = -1; link[last] = -1;
        cons.push({ name: "W" + i, terms: link, eq: 0 });
        var lo = {}; lo["W" + i] = 1; lo["lo" + r] = 1; cons.push({ name: "Wl" + i, terms: lo, ge: 0 });
        var hi = {}; hi["W" + i] = 1; hi["hi" + r] = 1;
        if (plan) cons.push({ name: "Wh" + i, terms: hi, le: plan.be });
        else { hi.K_be = -1; cons.push({ name: "Wh" + i, terms: hi, le: 0 }); }
      }
    }
    if (opts.cap != null) cons.push({ name: "co2", terms: co2Terms, le: opts.cap });
    return { sense: "min", variables: vars, constraints: cons };
  }
  function periodsOf(RW) { return RW.reps.map(function (r) { return { demand: r.demand, wind: r.wind, solar: r.solar, weight: r.weight }; }); }
  // the model on the six representative weeks (what the page solves)
  function weekModel(C, RW, opts) { return build(C, periodsOf(RW), RW.chrono, opts); }
  // the same LP on all 8,760 hours in calendar order (the check)
  function fullYearModel(C, Y, opts) { return build(C, [{ demand: Y.demand, wind: Y.wind, solar: Y.solar, weight: 1 }], null, opts); }

  // ---------------------------------------------------------------- reading a solution
  function fixedCost(C, plan) {
    var T = C.techs;
    return T.wind.fixed * plan.wind + T.solar.fixed * plan.solar + T.cc.fixed * plan.cc + T.pk.fixed * plan.pk +
           T.nuc.fixed * plan.nuc + T.bp.fixed * plan.bp + T.be.fixed * plan.be;
  }
  function planOf(res, plan) {
    if (plan) return plan;
    var o = {}; KEYS.forEach(function (k) { o[k] = Math.max(0, res.values["K_" + k] || 0); }); return o;
  }
  // annual totals of a solved model: cost split, CO2, energy by source, unserved and spilled energy
  function summarize(C, periods, res, opts) {
    opts = opts || {};
    var plan = planOf(res, opts.plan), T = C.techs, v = res.values;
    var o = { plan: plan, demand: 0, energy: { wind: 0, solar: 0, nuc: 0, cc: 0, pk: 0, dis: 0, ch: 0 }, unserved: 0, spilled: 0, co2: 0, fuel: 0, maxUnservedMW: 0 };
    periods.forEach(function (P, p) {
      var w = P.weight;
      for (var h = 0; h < P.demand.length; h++) {
        var id = p + "_" + h;
        var g = v["g" + id] || 0, q = v["p" + id] || 0, u = v["u" + id] || 0, dis = v["d" + id] || 0, ch = v["c" + id] || 0;
        var avail = P.wind[h] * plan.wind + P.solar[h] * plan.solar + C.nucAvail * plan.nuc;
        var x = Math.max(0, avail + g + q + dis - ch + u - P.demand[h]);   // spilled
        o.demand += w * P.demand[h];
        o.energy.wind += w * P.wind[h] * plan.wind; o.energy.solar += w * P.solar[h] * plan.solar; o.energy.nuc += w * C.nucAvail * plan.nuc;
        o.energy.cc += w * g; o.energy.pk += w * q; o.energy.dis += w * dis; o.energy.ch += w * ch;
        o.spilled += w * x; o.unserved += w * u; if (u > o.maxUnservedMW) o.maxUnservedMW = u;
      }
    });
    o.co2 = o.energy.cc * T.cc.co2 + o.energy.pk * T.pk.co2;
    o.fuel = o.energy.cc * T.cc.run + o.energy.pk * T.pk.run + o.energy.nuc * T.nuc.run;
    o.fixed = fixedCost(C, plan);
    o.cost = o.fixed + o.fuel;                        // the unserved-energy penalty is not a cost anyone pays: reported apart
    o.available = o.energy.wind + o.energy.solar + o.energy.nuc;
    o.spilledShare = o.available > 0 ? o.spilled / o.available : 0;
    o.unservedShare = o.demand > 0 ? o.unserved / o.demand : 0;
    o.capDual = res.duals && res.duals.co2 != null ? -res.duals.co2 : null;   // $ saved per extra tonne allowed = marginal abatement cost
    o.status = res.status;
    return o;
  }

  // ---------------------------------------------------------------- plans in a shareable link: #plan-w150-s200-...
  var CODE = { wind: "w", solar: "s", cc: "g", pk: "p", nuc: "n", bp: "b", be: "e" };
  var SCODE = { gas: "fuel", nucCapex: "nk" };
  function encodePlan(plan, sc) {
    var s = "plan-" + KEYS.map(function (k) { return CODE[k] + Math.round(plan[k] || 0); }).join("-");
    if (sc) Object.keys(SCODE).forEach(function (k) { if (sc[k] != null) s += "-" + SCODE[k] + Math.round(k === "gas" ? sc[k] * 100 : sc[k]); });
    return s;
  }
  function decodePlan(str, cfg) {
    if (typeof str !== "string") return null;
    str = str.replace(/^#/, "");
    if (!/^plan(-[a-z]+\d{1,6})+$/.test(str)) return null;
    var plan = {}, sc = {}, lim = cfg.limits;
    str.split("-").slice(1).forEach(function (part) {
      var m = /^([a-z]+)(\d+)$/.exec(part); if (!m) return;
      var n = +m[2];
      KEYS.forEach(function (k) { if (CODE[k] === m[1]) plan[k] = Math.min(lim[k].max, Math.max(0, n)); });
      if (m[1] === "fuel") sc.gas = Math.min(lim.gas.max, Math.max(lim.gas.min, n / 100));
      if (m[1] === "nk") sc.nucCapex = Math.min(lim.nucCapex.max, Math.max(lim.nucCapex.min, n));
    });
    if (KEYS.some(function (k) { return plan[k] == null; })) return null;
    return { plan: plan, scenario: sc };
  }

  // ---------------------------------------------------------------- helpers for the page (pure)
  // one modelled week, hour by hour: what each source made, the battery, unserved and spilled power (MW)
  function weekSeries(C, P, values, p, plan) {
    var v = values || {}, n = P.demand.length, o = { demand: [], nuc: [], wind: [], solar: [], dis: [], ch: [], cc: [], pk: [], unserved: [], spilled: [] };
    for (var h = 0; h < n; h++) {
      var id = p + "_" + h, g = v["g" + id] || 0, q = v["p" + id] || 0, d = v["d" + id] || 0, c = v["c" + id] || 0, u = v["u" + id] || 0;
      var nu = C.nucAvail * plan.nuc, w = P.wind[h] * plan.wind, s = P.solar[h] * plan.solar;
      o.demand.push(P.demand[h]); o.nuc.push(nu); o.wind.push(w); o.solar.push(s); o.dis.push(d); o.ch.push(c); o.cc.push(g); o.pk.push(q); o.unserved.push(u);
      o.spilled.push(Math.max(0, nu + w + s + d + g + q + u - c - P.demand[h]));
    }
    return o;
  }
  // the frontier's cost at a given CO2 (straight lines between solved points; the true frontier is convex, so this is a
  // slight overestimate between points: the page calls it approximate, and scoring re-solves at the plan's own CO2);
  // null outside the solved range
  function frontierAt(points, co2) {
    var pts = points.slice().sort(function (a, b) { return a.co2 - b.co2; });
    if (!pts.length || co2 < pts[0].co2 - 1e-6) return null;
    if (co2 >= pts[pts.length - 1].co2) return pts[pts.length - 1].cost;
    for (var i = 1; i < pts.length; i++) if (co2 <= pts[i].co2) {
      var a = pts[i - 1], b = pts[i], t = (co2 - a.co2) / (b.co2 - a.co2);
      return a.cost + t * (b.cost - a.cost);
    }
    return null;
  }
  // round a plan up to the sliders' steps (rounding up keeps the optimizer's plan able to serve every hour)
  function ceilPlan(plan, limits) {
    var o = {};
    KEYS.forEach(function (k) { var st = limits[k].step; o[k] = Math.min(limits[k].max, Math.ceil((plan[k] - 1e-6) / st) * st); if (o[k] < 0) o[k] = 0; });
    return o;
  }
  // one to three stars: lights on (unserved energy), CO2 against the target, cost against the frontier at the plan's CO2
  function stars(sum, target, frontierCost) {
    var lights = sum.unserved < 0.5 ? 3 : sum.unservedShare < 0.001 ? 2 : 1;
    var co2 = sum.co2 <= target + 0.5 ? 3 : sum.co2 <= target * 1.25 ? 2 : 1;
    var gap = frontierCost ? sum.cost / frontierCost - 1 : null;
    var cost = lights < 3 || gap == null ? 1 : gap <= 0.02 ? 3 : gap <= 0.10 ? 2 : 1;
    return { lights: lights, co2: co2, cost: cost, gap: gap };
  }

  // what the optimizer's cap means for its plan (cap and co2 in tonnes; sum = summarize() of the capped solve):
  //   "zero"  a zero cap: no gas may run; the cap binds, but its shadow price at that edge is not a useful carbon price
  //   "binds" the plan sits on the cap and cutting one more tonne would cost capDual dollars
  //   "free"  the cap is looser than the cheapest plan's own CO2, so it changes nothing
  function capReading(cap, sum) {
    if (cap <= 0) return { kind: "zero" };
    if (sum.capDual != null && sum.capDual > 1e-6 && sum.co2 >= cap - 1) return { kind: "binds", dual: sum.capDual };
    return { kind: "free" };
  }
  // the full-year verdict for a plan scored on the seven weeks: demand served and CO2 against the target, judged again on
  // all 8,760 hours (week, full = summarize() of the seven-week run and of the full-year run; target in tonnes)
  function fullVerdict(week, full, target) {
    var served = full.unserved < 0.5, co2ok = full.co2 <= target + 0.5;
    return { served: served, unserved: full.unserved, unservedShare: full.unservedShare, co2ok: co2ok, co2: full.co2,
             over: full.co2 - target, overShare: full.co2 / target - 1, held: served && co2ok,
             changed: (week.unserved < 0.5) !== served || (week.co2 <= target + 0.5) !== co2ok };
  }

  // ---------------------------------------------------------------- representative periods: the battery between them,
  // the full-year check and its error measures (first written for lesson M3)
  // link(m, RW, mode): a model from weekModel() (the linked chain) with another rule for the battery between weeks:
  //   "linked" (or none)  the model as it is: one calendar chain of 52 start levels (Kotzur et al. 2018)
  //   "cyclic"            the 52 chain rows are dropped and each representative week ends where it starts
  //                       (s<p>_167 = 0): every week starts at a level of its own, so no energy moves between weeks
  //   "free"              no rule between weeks: the 52 chain rows are dropped, so each week may start at any level and
  //                       stored energy can appear from nothing
  // Variable names are build()'s: s<p>_<h> is the level in representative week p after hour h, relative to the week's
  // start; W<i> the level at the start of calendar week i; constraint W<i> is the chain W<i+1> = W<i> + s<rep(i)>_167.
  // Without the chain, the rows Wl<i> and Wh<i> (0 <= W<i> + lowest swing, W<i> + highest swing <= MWh) still hold, each
  // with a start level W<i> of its own.
  function link(m, RW, mode) {
    if (!mode || mode === "linked") return m;
    if (mode !== "cyclic" && mode !== "free") throw new Error("link: mode must be linked, cyclic or free");
    var cons = m.constraints.filter(function (c) { return !/^W\d+$/.test(c.name); });
    if (mode === "cyclic") RW.reps.forEach(function (r, p) { var t = {}; t["s" + p + "_" + (HPW - 1)] = 1; cons.push({ name: "cyc" + p, terms: t, eq: 0 }); });
    return { sense: m.sense, variables: m.variables, constraints: cons };
  }
  // the whole year as one period, as fullYearModel() builds it (for summarize() of a full-year run)
  function yearPeriods(Y) { return [{ demand: Y.demand, wind: Y.wind, solar: Y.solar, weight: 1 }]; }
  // a solved full-year check (fullYearModel with the plan fixed): totals, plus where the shortfalls fall: MWh unserved in
  // each calendar week (an hour counts when it is more than 0.05 MW short; the last 24 hours of the year, 31 December,
  // count in week 52)
  function readCheck(C, Y, r, plan) {
    var s = summarize(C, yearPeriods(Y), r, { plan: plan }), v = r.values, byWeek = [], hours = 0;
    for (var i = 0; i < WEEKS; i++) byWeek.push(0);
    for (var h = 0; h < Y.demand.length; h++) {
      var u = v["u0_" + h] || 0;
      if (u > 0.05) { hours++; byWeek[Math.min(WEEKS - 1, Math.floor(h / HPW))] += u; }
    }
    return { cost: s.cost, co2: s.co2, unserved: s.unserved, unservedShare: s.unservedShare, hours: hours, maxShort: s.maxUnservedMW,
             byWeek: byWeek, spilled: s.spilledShare, dis: s.energy.dis, demand: s.demand };
  }
  // the stated error measures. est: the planning run ({cost} at least, e.g. summarize() of weekModel); full: readCheck()
  // of the same plan; cap in t; ref: the full-year optimum ({cost}), or null
  //   costGap  (cost of the plan on the full year) / (cost the weeks estimated) - 1
  //   co2Over  (CO2 of the plan on the full year) / cap - 1          (positive: over the cap)
  //   estErr   (cost the weeks estimated) / (cost of the full-year optimum) - 1   (negative: the weeks were too optimistic)
  //   served   no hour short by more than 0.05 MW (0.5 MWh in the year in all); co2ok: within the cap (0.5 t tolerance)
  function errors(est, full, cap, ref) {
    return { costGap: full.cost / est.cost - 1, co2Over: full.co2 / cap - 1, estErr: ref ? est.cost / ref.cost - 1 : null,
             unserved: full.unserved, hours: full.hours, maxShort: full.maxShort, served: full.unserved < 0.5, co2ok: full.co2 <= cap + 0.5 };
  }
  var model = { HPW: HPW, WEEKS: WEEKS, HOURS: HOURS, KEYS: KEYS, prepareYear: prepareYear, selectWeeks: selectWeeks, weekMonth: weekMonth, weekStart: weekStart,
                crf: crf, costs: costs, build: build, weekModel: weekModel, fullYearModel: fullYearModel, periodsOf: periodsOf,
                summarize: summarize, fixedCost: fixedCost, encodePlan: encodePlan, decodePlan: decodePlan, weekSeries: weekSeries,
                frontierAt: frontierAt, ceilPlan: ceilPlan, stars: stars, capReading: capReading, fullVerdict: fullVerdict,
                link: link, yearPeriods: yearPeriods, readCheck: readCheck, errors: errors };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;
  var LX = window.LX;
  LX.townPlan = model;
  if (!LX.H) return;
  // ================================================================ the page kit shared by lessons 12 and 13 (window.LX)
  var H = LX.H;
  var TECH = {
    wind: { label: "Wind", color: "var(--lx-wind)" }, solar: { label: "Solar", color: "var(--lx-solar)" },
    nuc: { label: "Nuclear", color: "var(--lx-nuc)" }, cc: { label: "Gas combined-cycle", short: "Gas CC", color: "var(--lx-cc)" },
    pk: { label: "Gas peaker", short: "Peaker", color: "var(--lx-pk)" },
    bp: { label: "Battery power", short: "Battery", color: "var(--lx-tier-2)", unit: "MW" },
    be: { label: "Battery energy", short: "Battery", color: "var(--lx-tier-2)", unit: "MWh" }
  };
  var fm = {
    musd: function (v) { return "$" + (v / 1e6).toFixed(1) + "M"; },
    kt: function (v) { return Math.round(v / 1e3).toLocaleString("en-US") + " kt"; },
    pct: function (x, d) { return (x * 100).toFixed(d == null ? 1 : d) + "%"; },
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    k: function (v) { return "$" + Math.round(v / 1e3) + "k"; }
  };
  // the styles (lx13-* classes, kept because lessons 12 and 13 use them) are in planengine.css, bundled into learn.css
  function css() {}

  // ---------------------------------------------------------------- a numeric control in the library's slider look
  function Num(host, o) {
    var id = LX.uid("nm"), val = o.value;
    var w = H("div", { class: "lx-ctl", style: "--c:" + (o.color || "var(--lx-ink-2)") }, host);
    var top = H("div", { class: "lx-ctl-top" }, w), lab = H("label", { for: id }, top); H("i", null, lab); H("span", { text: o.label }, lab);
    var out = H("output", { for: id }, top), row = H("div", { class: "lx-ctl-row" }, w);
    var minus = H("button", { type: "button", "aria-label": "Lower " + o.label, text: "−" }, row);
    var tr = H("div", { class: "lx-ctl-track" }, row); H("div", { class: "lx-ctl-rail" }, tr); var fill = H("div", { class: "lx-ctl-fill" }, tr);
    var inp = H("input", { type: "range", id: id, min: o.min, max: o.max, step: o.step, value: val }, tr);
    var plus = H("button", { type: "button", "aria-label": "Raise " + o.label, text: "+" }, row);
    var hint = o.hint ? H("p", { class: "lx-ctl-hint", text: o.hint }, w) : null;
    function paint() { inp.value = val; out.textContent = o.fmt(val); inp.setAttribute("aria-valuetext", o.fmt(val)); fill.style.width = (13 + (val - o.min) / (o.max - o.min) * (tr.clientWidth - 26)) / Math.max(1, tr.clientWidth) * 100 + "%"; }
    function set(v, user) { v = Math.min(o.max, Math.max(o.min, Math.round(v / o.step) * o.step)); v = +v.toFixed(6); var ch = v !== val; val = v; paint(); if (user && ch && o.onChange) o.onChange(val); }
    inp.addEventListener("input", function () { set(+inp.value, true); });
    minus.addEventListener("click", function () { set(val - o.step, true); });
    plus.addEventListener("click", function () { set(val + o.step, true); });
    if (window.ResizeObserver) new ResizeObserver(paint).observe(tr);
    paint();
    return { el: w, val: function () { return val; }, set: function (v) { set(v, false); }, hint: hint };
  }

  // ---------------------------------------------------------------- a comparison table for words (the e-table explain
  // component, lesson-local): a real table on wide screens, one card per row on phones
  function TextTable(host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var t = H("table", { class: "lx13-tt" }, host), hr = H("tr", null, H("thead", null, t));
    o.columns.forEach(function (c) { H("th", { scope: "col", text: c.label }, hr); });
    var b = H("tbody", null, t);
    o.rows.forEach(function (r) {
      var tr = H("tr", null, b), th = H("th", { scope: "row" }, tr), n = H("b", null, th);
      H("i", { style: "--c:" + (r.color || "var(--lx-ink-3)") }, n); H("span", { text: r.name }, n);
      if (r.note) H("small", { text: r.note }, th);
      o.columns.slice(1).forEach(function (c) { H("td", { "data-label": c.label, html: LX.rich(r[c.key] || "") }, tr); });
    });
    return t;
  }

  LX.townPlan.ui = { TextTable: TextTable, Num: Num, css: css, fm: fm, TECH: TECH };
})();
