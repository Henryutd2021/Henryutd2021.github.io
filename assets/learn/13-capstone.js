// 13-capstone.js — Lesson 13, "What should Prairie Town build? Plan its power system" (play-first capstone, W1).
// Also the planning engine of lesson 12 (12-trade-offs.js reads it as LX.townPlan).
//
// Data: assets/learn/data/13-capstone.json (technology costs with primary sources and dates, the default scenario, the
// representative-week rule), town_year.json (every hour of 2025 on the Southwest Power Pool grid, EIA-930, as shapes) and
// cf_targets.json (EIA 2025 capacity factors, used by LX.townProfile to size wind and solar output).
//
// The model (a linear program; Prairie Town is fictional, its costs are real and dated):
//   decisions   capacities: wind, solar, gas combined-cycle (cc), gas peaker (pk), nuclear (nuc) in MW; battery power
//               (bp, MW) and energy (be, MWh). Every hour: cc and peaker output, battery charge and discharge, unserved
//               demand (only when the reader's plan is fixed; the optimizer must serve all demand).
//   goal        least annual cost = annualised capital + fixed O&M (per MW or MWh built) + fuel and variable O&M (per MWh)
//               [+ a carbon price x CO2: lesson 12's weighted sum]. Nuclear runs flat, so its fuel is a fixed yearly cost.
//   rules       every hour: wind + solar + nuclear + cc + peaker + discharge - charge + unserved >= demand (what is left
//               over is spilled); wind and solar make capacity x the hour's availability (LX.townProfile, "scale" method,
//               EIA 2025 targets; solar telemetry at night set to zero first); nuclear runs flat at 91.1% (EIA's 2025
//               fleet capacity factor), as in lesson 0; gas output <= its capacity; charge + discharge <= battery MW;
//               battery energy within [0, MWh], 85% round trip (losses on charging); optional: annual CO2 <= cap.
//   time        seven weeks of 2025 (168 chronological hours each): one medoid week per season, scaled so the season's
//               demand, wind and solar energy are kept, plus three weeks kept as they are (the year's peak demand, the
//               highest net load, the least wind). Each stands for its weeks (weights); the year's 52 calendar weeks keep
//               their order, and the battery's state is linked across them (Kotzur et al. 2018: the level at the start of
//               each calendar week plus the representative week's own swing stays within [0, MWh]; the year ends where it
//               starts). The 24 hours of 31 December are covered by scaling the weights to 8,760 h.
//   check       fullYearModel(): the same LP on all 8,760 hours in calendar order (_tests/learn/test_13-capstone.js
//               compares plans, costs, CO2, unserved and spilled energy; the page offers it as "check on all 8,760 hours").
// Every number the page states is checked against this model by the Node test.
(function () {
  "use strict";
  var HPW = 168, WEEKS = 52, HOURS = 8760;

  // ---------------------------------------------------------------- inputs: the town's year
  // Y = { demand[8760] MW, wind[8760], solar[8760] (MW per MW built), nucAvail, peak, energy }
  // Index i of town_year.json is the hour that starts i hours after 00:00 on 1 January, Central standard time (UTC-6).
  // Solar telemetry reports small output at night on some days (an error in the source); hours starting 20:00 to 04:59
  // are set to zero before the shape is scaled (the sun is down then everywhere on the SPP grid, all year).
  function nightless(solar) { return solar.map(function (v, i) { var h = i % 24; return h >= 20 || h <= 4 ? 0 : v; }); }
  function prepareYear(year, targets, cfg, profile) {
    var tp = profile || (typeof window !== "undefined" && window.LX && window.LX.townProfile);
    if (!tp) throw new Error("prepareYear: the capacity-factor helper (LX.townProfile) is missing");
    var peakMW = cfg.town.demandPeakMW;
    var demand = year.demand.map(function (v) { return v / 1000 * peakMW; });
    var clean = { start_utc: year.start_utc, demand: year.demand, wind: year.wind, solar: nightless(year.solar) };
    var w = tp("wind", 1, { year: clean, targets: targets, method: cfg.town.profileMethod });
    var s = tp("solar", 1, { year: clean, targets: targets, method: cfg.town.profileMethod });
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
  //   winter  the winter week with the highest hourly net load (a cold, still spell)
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
          if (!plan) {   // charge + discharge <= battery MW (one row: charging and discharging at once never pays)
            var c1 = {}; c1["c" + id] = 1; c1["d" + id] = 1; c1.K_bp = -1; cons.push({ name: "P" + id, terms: c1, le: 0 });
          }
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
  // slight overestimate between points); null outside the solved range
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

  var model = { HPW: HPW, WEEKS: WEEKS, HOURS: HOURS, KEYS: KEYS, prepareYear: prepareYear, nightless: nightless, selectWeeks: selectWeeks, weekMonth: weekMonth, weekStart: weekStart,
                crf: crf, costs: costs, build: build, weekModel: weekModel, fullYearModel: fullYearModel, periodsOf: periodsOf,
                summarize: summarize, fixedCost: fixedCost, encodePlan: encodePlan, decodePlan: decodePlan, weekSeries: weekSeries,
                frontierAt: frontierAt, ceilPlan: ceilPlan, stars: stars };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;
  var LX = window.LX;
  LX.townPlan = model;
  if (!LX.H) return;
  // ================================================================ the page (component library: window.LX)
  var H = LX.H, S = LX.S, LESSON = "13-capstone";
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
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function css() {
    if (document.getElementById("lx13-css")) return;
    H("style", { id: "lx13-css", text: [
      ".lx13-stage{display:grid;gap:14px;min-width:0}",
      ".lx13-card{background:var(--lx-surface);border:1px solid var(--lx-line);border-radius:var(--lx-r-lg);padding:14px 16px;display:grid;gap:10px;min-width:0}",
      ".page-learn .lx13-card h3{font-size:17px}",
      ".lx13-head{display:flex;justify-content:space-between;align-items:center;gap:6px 12px;flex-wrap:wrap}",
      ".lx13-sub{font-size:13.5px;color:var(--lx-ink-3)}",
      ".lx13-chart svg{display:block;width:100%;height:auto}",
      ".lx13-chart text{font-family:var(--lx-f-mono);font-size:12px;fill:var(--lx-ink-3)}",
      ".lx13-chart text.lab{font-family:var(--lx-f-display);font-size:13px;font-weight:600;fill:var(--lx-ink)}",
      ".lx13-chart text.note{font-family:var(--lx-f-body);font-size:12.5px;fill:var(--lx-ink-3)}",
      ".lx13-mix{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--lx-surface-3)}",
      ".lx13-mix i{display:block;height:100%;background:var(--c)}",
      ".lx13-group{display:grid;gap:12px}",
      ".page-learn .lx13-group>p{font-family:var(--lx-f-display);font-weight:500;font-size:12.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--lx-ink-3)}",
      ".lx13-tallies{grid-template-columns:repeat(2,minmax(0,1fr))}",
      ".lx13-tallies .lx-tally.bad b{color:var(--lx-bad)}",
      ".lx13-box{border:1px solid var(--lx-line-2);border-radius:12px;padding:12px;display:grid;gap:10px;background:var(--lx-surface-2)}",
      ".lx13-plan{width:100%;border-collapse:collapse;font-size:14px}",
      ".lx13-plan td,.lx13-plan th{padding:3px 4px;border-bottom:1px solid var(--lx-line);text-align:left;font-weight:400}",
      ".lx13-plan .n{text-align:right;font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".lx13-tt{width:100%;border-collapse:collapse;font-size:14.5px}.lx13-tt th,.lx13-tt td{padding:8px 8px;border-bottom:1px solid var(--lx-line);text-align:left;vertical-align:top;font-weight:400}",
      ".lx13-tt thead th{font-family:var(--lx-f-display);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--lx-ink-3)}",
      ".lx13-tt tbody th b{display:flex;align-items:center;gap:8px;font-family:var(--lx-f-display);font-weight:600}.lx13-tt tbody th b i{width:10px;height:10px;border-radius:3px;background:var(--c);flex:none}",
      ".lx13-tt tbody th small{display:block;color:var(--lx-ink-3);font-size:12.5px;margin-left:18px}",
      "@media (max-width:620px){.lx13-tt thead{display:none}.lx13-tt,.lx13-tt tbody,.lx13-tt tr,.lx13-tt th,.lx13-tt td{display:block;width:100%}.lx13-tt tr{border:1px solid var(--lx-line);border-radius:12px;padding:6px 10px;margin-bottom:10px}",
      ".lx13-tt th,.lx13-tt td{border:0;padding:4px 0}.lx13-tt td::before{content:attr(data-label);display:block;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--lx-ink-3)}}",
      ".lx13-plan th{font-family:var(--lx-f-display);font-size:12.5px;color:var(--lx-ink-3)}",
      ".lx13-rowb{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".lx13-share input{width:100%;font-family:var(--lx-f-mono);font-size:12.5px;padding:7px 8px;border:1px solid var(--lx-line-2);border-radius:8px;background:var(--lx-surface);color:var(--lx-ink)}",
      ".lx13-scen>summary{cursor:pointer;font-family:var(--lx-f-display);font-weight:500;font-size:14.5px;color:var(--lx-ink-2);min-height:40px;display:flex;align-items:center}",
      ".lx13-scen[open]{display:grid;gap:12px}",
      ".lx13-bound{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}",
      ".lx13-bound ul{margin:0;padding-left:1.1rem;font-size:14.5px;color:var(--lx-ink-2)}.lx13-bound li{margin:4px 0}",
      ".page-learn .lx13-bound h4{font-size:15px;margin:0 0 4px}",
      ".lx13-fc .dot.pick{cursor:pointer}.lx13-fc .dot:focus{outline:none}.lx13-fc .dot:focus-visible circle.c{stroke:var(--lx-accent);stroke-width:4}",
      ".lx13-week .lx-seg button{min-height:34px;padding:0 9px;font-size:13px}",
      ".lx13-alt table{border-collapse:collapse;font-size:13.5px;margin-top:6px}.lx13-alt td,.lx13-alt th{padding:2px 8px 2px 0;text-align:left}",
      ".lx13-cmp{width:100%;border-collapse:collapse;font-size:14px}.lx13-cmp th,.lx13-cmp td{padding:4px 6px;border-bottom:1px solid var(--lx-line);text-align:right}",
      ".lx13-cmp th:first-child,.lx13-cmp td:first-child{text-align:left}.lx13-cmp td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.lx13-cmp td:first-child{font-family:var(--lx-f-body)}",
      "@media (max-width:560px){.lx13-bound{grid-template-columns:minmax(0,1fr)}.lx13-card{padding:12px}}"
    ].join("") }, document.head);
  }

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

  // ---------------------------------------------------------------- cost against CO2 (also lesson 12's chart)
  // FrontierChart(host, {label, yMin, xMax}) -> { frontier(points, label), plans([{id, label, co2 t, cost $, color, kind,
  //   mark, note}]), price(p $/t, through {co2, cost} | null), pick(fn), el }
  function FrontierChart(host, o) {
    o = o || {};
    var box = H("div", { class: "lx13-chart lx13-fc" }, host);
    var W = 640, HH = 310, ml = 64, mr = 14, mt = 26, mb = 44, lastW = 0;   // drawn at the box's own width: text stays 12 px
    var svg = S("svg", { viewBox: "0 0 " + W + " " + HH, role: "group", "aria-label": o.label || "Cost per year against CO₂ per year" }, box);
    var gA = S("g", null, svg), gF = S("g", null, svg), gL = S("g", null, svg), gP = S("g", null, svg);
    var leg = H("div", { class: "lx-legend", "aria-hidden": "true" }, box);
    var alt = H("details", { class: "lx-textalt lx13-alt" }, box); H("summary", { text: "Text version of the chart" }, alt);
    var altB = H("div", null, alt);
    var st = { fr: [], frLabel: "", plans: [], price: null, onPick: null, xMax: o.xMax || 850, yMin: o.yMin || 90, yMax: 280 };
    function X(t) { return ml + Math.min(st.xMax, t / 1e3) / st.xMax * (W - ml - mr); }
    function Y(c) { return mt + (1 - (Math.min(st.yMax, c / 1e6) - st.yMin) / (st.yMax - st.yMin)) * (HH - mt - mb); }
    function scale() {
      var mx = 0; st.fr.concat(st.plans).forEach(function (p) { if (p.cost > mx) mx = p.cost; });
      st.yMax = Math.max(o.yMax || 200, Math.ceil(mx / 1e6 / 40) * 40 + 10);
    }
    function axes() {
      gA.innerHTML = "";
      var span = st.yMax - st.yMin, stp = span > 250 ? 50 : span > 120 ? 25 : 20;
      for (var y = Math.ceil(st.yMin / stp) * stp; y <= st.yMax; y += stp) {
        S("line", { x1: ml, x2: W - mr, y1: Y(y * 1e6), y2: Y(y * 1e6), stroke: "var(--lx-line)" }, gA);
        S("text", { x: ml - 6, y: Y(y * 1e6) + 4, "text-anchor": "end" }, gA).textContent = "$" + y + "M";
      }
      for (var x = 0; x <= st.xMax; x += 200) {
        S("line", { x1: X(x * 1e3), x2: X(x * 1e3), y1: mt, y2: HH - mb, stroke: "var(--lx-line)", "stroke-dasharray": "2 4" }, gA);
        S("text", { x: X(x * 1e3), y: HH - mb + 17, "text-anchor": "middle" }, gA).textContent = x;
      }
      S("text", { x: (ml + W - mr) / 2, y: HH - 6, "text-anchor": "middle", class: "note" }, gA).textContent = "CO₂ per year, kt (thousand tonnes)";
      S("text", { x: 4, y: 12, class: "note" }, gA).textContent = "Cost per year";
    }
    function size() { W = Math.max(300, Math.round(box.clientWidth || 640)); HH = W < 520 ? 270 : 310; ml = W < 520 ? 52 : 64; svg.setAttribute("viewBox", "0 0 " + W + " " + HH); lastW = W; }
    function draw() {
      size(); scale(); axes(); gF.innerHTML = ""; gL.innerHTML = ""; gP.innerHTML = ""; leg.innerHTML = "";
      var fr = st.fr.slice().sort(function (a, b) { return a.co2 - b.co2; });
      if (fr.length > 1) {
        var d = fr.map(function (p, i) { return (i ? "L" : "M") + X(p.co2).toFixed(1) + "," + Y(p.cost).toFixed(1); }).join("");
        S("path", { d: d + "L" + X(fr[fr.length - 1].co2).toFixed(1) + "," + (HH - mb) + "L" + X(fr[0].co2).toFixed(1) + "," + (HH - mb) + "Z", fill: "var(--lx-surface-3)", opacity: ".55" }, gF);
        S("path", { d: d, fill: "none", stroke: "var(--lx-ink)", "stroke-width": 2.2 }, gF);
        var mid = fr[Math.floor(fr.length * 0.55)];
        S("text", { x: X(mid.co2), y: HH - mb - 8, "text-anchor": "middle", class: "note" }, gF).textContent = "out of reach";
        fr.forEach(function (p) { if (p.solved) S("circle", { cx: X(p.co2), cy: Y(p.cost), r: 3.5, fill: "var(--lx-ink)" }, gF); });
        var s1 = H("span", null, leg); H("i", { style: "--c:var(--lx-ink);height:3px" }, s1); H("span", { text: st.frLabel || "Frontier: the cheapest plan at each CO₂" }, s1);
      }
      if (st.price && st.price.through) {
        var p0 = st.price.through, slope = st.price.p;   // cost($) = c0 + p * (co2_0 - co2)
        var xa = 0, xb = st.xMax * 1e3, ya = p0.cost + slope * (p0.co2 - xa), yb = p0.cost + slope * (p0.co2 - xb);
        S("line", { x1: X(xa), y1: Y(ya), x2: X(xb), y2: Y(yb), stroke: "var(--lx-accent)", "stroke-width": 2, "stroke-dasharray": "6 4" }, gL);
        var s2 = H("span", null, leg); H("i", { class: "line", style: "border-top-color:var(--lx-accent)" }, s2); H("span", { text: "Equal score at $" + Math.round(slope) + "/t" }, s2);
      }
      st.plans.forEach(function (p) {
        var g = S("g", { class: "dot" + (st.onPick && p.kind === "plan" ? " pick" : ""), transform: "translate(" + X(p.co2).toFixed(1) + "," + Y(p.cost).toFixed(1) + ")" }, gP);
        var r = p.kind === "you" ? 9 : p.kind === "plan" ? 8 : 6.5;
        if (p.ring) S("circle", { r: r + 5, fill: "none", stroke: "var(--lx-accent)", "stroke-width": 2.5 }, g);
        S("circle", { class: "c", r: r, fill: p.mark === "dominated" || p.mark === "never" ? "var(--lx-surface)" : p.color || "var(--lx-ink)",
                      stroke: p.color || "var(--lx-ink)", "stroke-width": 2.5, "stroke-dasharray": p.mark === "dominated" ? "3 2" : null }, g);
        if (p.kind === "you") S("circle", { r: 3, fill: "var(--lx-surface)" }, g);
        if (p.id) S("text", { x: r + 4, y: -r + 2, class: "lab" }, g).textContent = p.id;
        if (st.onPick && p.kind === "plan") {
          g.setAttribute("tabindex", "0"); g.setAttribute("role", "button");
          g.setAttribute("aria-label", "Plan " + p.id + ", " + p.label + ": " + fm.musd(p.cost) + " and " + fm.kt(p.co2) + " of CO₂ a year");
          var go = function () { st.onPick(p.id); };
          g.addEventListener("click", go);
          g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        }
      });
      var kinds = {};
      st.plans.forEach(function (p) { if (p.kind !== "plan" && !kinds[p.kind] && p.legend) { kinds[p.kind] = 1; var s = H("span", null, leg); H("i", { style: "--c:" + p.color + ";border-radius:50%" }, s); H("span", { text: p.legend }, s); } });
      // text version
      altB.innerHTML = "";
      var tb = H("table", null, altB), hr = H("tr", null, H("thead", null, tb));
      ["Point", "CO₂ a year", "Cost a year", "Note"].forEach(function (t) { H("th", { scope: "col", text: t }, hr); });
      var bd = H("tbody", null, tb);
      st.plans.concat(fr.map(function (p) { return { id: "Frontier", label: p.cap == null ? "no cap" : "cap " + p.cap + " kt", co2: p.co2, cost: p.cost }; })).forEach(function (p) {
        var tr = H("tr", null, bd);
        [(p.id ? p.id + ": " : "") + (p.label || ""), fm.kt(p.co2), fm.musd(p.cost), p.note || (p.mark === "dominated" ? "dominated" : "")].forEach(function (t) { H("td", { text: t }, tr); });
      });
    }
    LX.onTheme(draw);
    if (window.ResizeObserver) new ResizeObserver(function () { if (Math.abs((box.clientWidth || 0) - lastW) > 8) draw(); }).observe(box);
    draw();
    return {
      el: box,
      frontier: function (pts, label) { st.fr = pts || []; st.frLabel = label || ""; draw(); },
      plans: function (pl) { st.plans = pl || []; draw(); },
      price: function (p, through) { st.price = p == null ? null : { p: p, through: through }; draw(); },
      pick: function (fn) { st.onPick = fn; draw(); },
      focusDot: function (id) { var n = [].filter.call(gP.querySelectorAll(".dot"), function (g) { return g.textContent === id; })[0]; if (n) n.focus(); }
    };
  }

  // ---------------------------------------------------------------- one modelled week as a stacked chart
  var STACK = [["nuc", "Nuclear", "var(--lx-nuc)"], ["wind", "Wind", "var(--lx-wind)"], ["solar", "Solar", "var(--lx-solar)"],
               ["dis", "Battery out", "var(--lx-tier-2)"], ["cc", "Gas CC", "var(--lx-cc)"], ["pk", "Peaker", "var(--lx-pk)"]];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function WeekChart(host) {
    var box = H("div", { class: "lx13-chart" }, host);
    var W = 640, HH = 240, ml = 44, mr = 8, mt = 10, mb = 28, last = null;
    var svg = S("svg", { viewBox: "0 0 " + W + " " + HH, role: "img" }, box);
    var leg = H("div", { class: "lx-legend", "aria-hidden": "true" }, box);
    STACK.forEach(function (s) { var x = H("span", null, leg); H("i", { style: "--c:" + s[2] }, x); H("span", { text: s[1] }, x); });
    [["Unserved", "var(--lx-bad)"], ["Charging (below zero)", "color-mix(in srgb, var(--lx-tier-2) 45%, transparent)"]].forEach(function (s) { var x = H("span", null, leg); H("i", { style: "--c:" + s[1] }, x); H("span", { text: s[0] }, x); });
    var dl = H("span", null, leg); H("i", { class: "line" }, dl); H("span", { text: "Demand" }, dl);
    var alt = H("p", { class: "lx-sr" }, box);
    function draw(ws, start) {
      last = [ws, start];
      W = Math.max(300, Math.round(box.clientWidth || 640)); HH = W < 520 ? 210 : 240; ml = W < 520 ? 38 : 44;
      svg.setAttribute("viewBox", "0 0 " + W + " " + HH); svg.innerHTML = "";
      var n = ws.demand.length, top = 0, bot = 0, i;
      var tot = []; for (i = 0; i < n; i++) { var t = 0; STACK.forEach(function (s) { t += ws[s[0]][i]; }); tot.push(t); top = Math.max(top, t + ws.unserved[i], ws.demand[i]); bot = Math.max(bot, ws.ch[i]); }
      var yMax = Math.max(100, Math.ceil(top / 100) * 100), yMin = bot > 1 ? -Math.ceil(bot / 100) * 100 : 0;
      function X(h) { return ml + h / n * (W - ml - mr); }
      function Y(v) { return mt + (yMax - v) / (yMax - yMin) * (HH - mt - mb); }
      for (var v = yMin; v <= yMax; v += 100) {
        S("line", { x1: ml, x2: W - mr, y1: Y(v), y2: Y(v), stroke: v === 0 ? "var(--lx-line-2)" : "var(--lx-line)" }, svg);
        S("text", { x: ml - 6, y: Y(v) + 4, "text-anchor": "end" }, svg).textContent = v;
      }
      var d0 = new Date(start + "T00:00:00Z");
      for (var day = 0; day <= 7; day++) {
        S("line", { x1: X(day * 24), x2: X(day * 24), y1: mt, y2: HH - mb, stroke: "var(--lx-line)", "stroke-dasharray": "2 4" }, svg);
        if (day < 7) { var dd = new Date(d0.getTime() + day * 864e5); S("text", { x: X(day * 24 + 12), y: HH - mb + 17, "text-anchor": "middle" }, svg).textContent = dd.getUTCDate() + (day === 0 ? " " + MON[dd.getUTCMonth()] : ""); }
      }
      var base = new Array(n).fill(0);
      STACK.forEach(function (s) {
        var a = ws[s[0]]; if (!a.some(function (x) { return x > 0.05; })) return;
        var up = "", dn = "";
        for (i = 0; i < n; i++) { up += (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(base[i] + a[i]).toFixed(1) + "L" + X(i + 1).toFixed(1) + "," + Y(base[i] + a[i]).toFixed(1); }
        for (i = n - 1; i >= 0; i--) { dn += "L" + X(i + 1).toFixed(1) + "," + Y(base[i]).toFixed(1) + "L" + X(i).toFixed(1) + "," + Y(base[i]).toFixed(1); }
        S("path", { d: up + dn + "Z", fill: s[2] }, svg);
        for (i = 0; i < n; i++) base[i] += a[i];
      });
      for (i = 0; i < n; i++) if (ws.unserved[i] > 0.05) S("rect", { x: X(i), y: Y(base[i] + ws.unserved[i]), width: X(1) - X(0) + 0.3, height: Y(base[i]) - Y(base[i] + ws.unserved[i]), fill: "var(--lx-bad)" }, svg);
      if (bot > 1) {
        var p = "M" + X(0) + "," + Y(0);
        for (i = 0; i < n; i++) p += "L" + X(i).toFixed(1) + "," + Y(-ws.ch[i]).toFixed(1) + "L" + X(i + 1).toFixed(1) + "," + Y(-ws.ch[i]).toFixed(1);
        S("path", { d: p + "L" + X(n) + "," + Y(0) + "Z", fill: "var(--lx-tier-2)", opacity: ".45" }, svg);
      }
      var dpath = ""; for (i = 0; i < n; i++) dpath += (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(ws.demand[i]).toFixed(1) + "L" + X(i + 1).toFixed(1) + "," + Y(ws.demand[i]).toFixed(1);
      S("path", { d: dpath, fill: "none", stroke: "var(--lx-ink)", "stroke-width": 1.6, "stroke-dasharray": "5 3" }, svg);
      S("text", { x: ml + 4, y: mt + 12, class: "note" }, svg).textContent = "MW";
      var sum = function (a) { return a.reduce(function (s, x) { return s + x; }, 0); };
      var un = sum(ws.unserved), hrs = ws.unserved.filter(function (x) { return x > 0.05; }).length;
      var txt = "Hourly supply for the week starting " + d0.getUTCDate() + " " + MON[d0.getUTCMonth()] + ": peak demand " + Math.round(Math.max.apply(null, ws.demand)) + " MW; gas made " +
        Math.round(sum(ws.cc) + sum(ws.pk)).toLocaleString("en-US") + " MWh, the battery gave back " + Math.round(sum(ws.dis)).toLocaleString("en-US") + " MWh; " +
        (hrs ? hrs + " hours short, " + Math.round(un).toLocaleString("en-US") + " MWh unserved; " : "every hour served; ") + Math.round(sum(ws.spilled)).toLocaleString("en-US") + " MWh spilled.";
      svg.setAttribute("aria-label", txt); alt.textContent = txt;
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (last && Math.abs((box.clientWidth || 0) - W) > 8) draw(last[0], last[1]); }).observe(box);
    LX.onTheme(function () { if (last) draw(last[0], last[1]); });
    return { el: box, draw: draw };
  }

  // ---------------------------------------------------------------- "this holds when" (the e-boundary explain component, lesson-local)
  function Boundary(host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var g = H("div", { class: "lx13-bound" }, host);
    o.cols.forEach(function (c) { var d = H("div", null, g); H("h4", { text: c.title }, d); var ul = H("ul", null, d); c.items.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); }); });
    if (o.foot) H("p", { class: "lx13-sub", html: LX.rich(o.foot) }, host);
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

  LX.townPlan.ui = { FrontierChart: FrontierChart, TextTable: TextTable, Num: Num, css: css, fm: fm, TECH: TECH };

  // ---------------------------------------------------------------- the game
  function view(live, data, root) {
    css();
    var cfg = data["13_capstone"], Y = model.prepareYear(data.town_year, data.cf_targets, cfg), RW = model.selectWeeks(Y, cfg.weeks), per = model.periodsOf(RW);
    var G = cfg.game, lim = cfg.limits, target = G.co2Target * 1e3;
    var DEF = { gas: cfg.fuel.gas, nucCapex: cfg.techs.nuc.capex };
    var S_ = { plan: copy(cfg.start.plan), sc: copy(DEF), sum: null, raw: null, seq: 0, frontier: cfg.frontier.points, frontierLive: false,
               short: false, spill: 0, bat: false, asked: null, full: null, done: false, pred: null, week: 4, from: "start" };
    S_.C = model.costs(cfg, S_.sc);
    var shared = model.decodePlan(location.hash, cfg);
    if (shared) {
      S_.plan = shared.plan; S_.from = "link";
      if (shared.scenario.gas != null) S_.sc.gas = shared.scenario.gas;
      if (shared.scenario.nucCapex != null) S_.sc.nucCapex = shared.scenario.nucCapex;
      S_.C = model.costs(cfg, S_.sc);
    }
    function isDefault() { return Math.abs(S_.sc.gas - DEF.gas) < 1e-9 && Math.abs(S_.sc.nucCapex - DEF.nucCapex) < 1e-9; }

    // ---- missions, the stage, the panel
    var ms = LX.Missions(live, [
      { id: "lights", label: "Keep every light on, all year", short: "Lights on", main: true },
      { id: "co2", label: "Emit under " + G.co2Target + " kt of CO₂ a year", short: "Under " + G.co2Target + " kt" },
      { id: "cost", label: "Cost within " + Math.round(G.costSlack * 100) + "% of the frontier", short: "Near the frontier" }
    ]);
    var lay = H("div", { class: "lx-play" }, live);
    var stage = H("div", { class: "lx-play-stage lx13-stage" }, lay);
    var panel = H("div", { class: "lx-play-panel lx-stepcard" }, lay);
    var deb = H("div", { class: "lx-debrief lx-stepcard", hidden: true, tabindex: "-1" }, lay);

    var c1 = H("section", { class: "lx13-card lx13-week", "aria-label": "Your plan, run for a year" }, stage);
    var h1 = H("div", { class: "lx13-head" }, c1); H("h3", { text: "Your plan, run for a year" }, h1);
    var status = LX.SolverStatus(h1);
    var mix = H("div", { class: "lx13-mix", role: "img" }, c1), mixLeg = H("p", { class: "lx13-sub" }, c1);
    var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Week to show" }, c1);
    var KIND = { peak: "Peak demand", netpeak: "Peak net load", calm: "Least wind" };
    var tabs = RW.reps.map(function (r, i) {
      var name = r.kind === "season" ? r.season.charAt(0).toUpperCase() + r.season.slice(1) : KIND[r.kind];
      return H("button", { type: "button", "aria-pressed": i === S_.week ? "true" : "false", text: name, onclick: function () { S_.week = i; drawWeek(); } }, seg);
    });
    var wsub = H("p", { class: "lx13-sub" }, c1);
    var wc = WeekChart(c1);

    var c2 = H("section", { class: "lx13-card", "aria-label": "Your plan on the cost and CO₂ frontier" }, stage);
    var h2 = H("div", { class: "lx13-head" }, c2); H("h3", { text: "Your plan on the frontier" }, h2);
    H("p", { class: "lx13-sub", html: LX.rich("The line is the cheapest possible plan at each CO₂ level ([[pareto-frontier|lesson 12]]). Below it is out of reach.") }, c2);
    var fc = FrontierChart(c2, { label: "Your plan and the optimizer's plan against the cost and CO₂ frontier" });
    var frNote = H("p", { class: "lx13-sub", hidden: true }, c2);
    var frBtn = H("button", { class: "lx-link", type: "button", hidden: true, text: "Solve the frontier again for these costs" }, c2);

    var ph = H("div", { class: "lx13-head" }, panel); H("h3", { text: "What to build" }, ph);
    var resetBtn = H("button", { class: "lx-link", type: "button", text: "Back to lesson 0's plants" }, ph);
    var evBox = H("div", { class: "lx-events", "aria-live": "polite" }, panel);
    var sl = {};
    [["Clean power", ["wind", "solar", "nuc"]], ["Gas", ["cc", "pk"]], ["Storage", ["bp", "be"]]].forEach(function (g) {
      var gw = H("div", { class: "lx13-group" }, panel); H("p", { text: g[0] }, gw);
      g[1].forEach(function (k) {
        sl[k] = LX.Slider(gw, { label: TECH[k].label, color: TECH[k].color, max: lim[k].max, step: lim[k].step, unit: k === "be" ? "MWh" : "MW",
          hint: function () { return hintOf(k); }, onChange: changed });
      });
    });
    function hintOf(k) {
      var T = S_.C.techs, t = cfg.techs;
      if (k === "wind") return fm.k(T.wind.fixed) + " per MW-year; makes " + fm.pct(Y.windCF) + " of its size on average.";
      if (k === "solar") return fm.k(T.solar.fixed) + " per MW-year; makes " + fm.pct(Y.solarCF) + " of its size on average.";
      if (k === "nuc") return fm.k(T.nuc.fixedTotal) + " per MW-year with fuel; runs flat at " + fm.pct(t.nuc.avail) + ".";
      if (k === "cc") return fm.k(T.cc.fixed) + " per MW-year + $" + T.cc.run.toFixed(0) + "/MWh to run; " + T.cc.co2.toFixed(2) + " t CO₂/MWh.";
      if (k === "pk") return fm.k(T.pk.fixed) + " per MW-year + $" + T.pk.run.toFixed(0) + "/MWh to run; " + T.pk.co2.toFixed(2) + " t CO₂/MWh.";
      if (k === "bp") return fm.k(T.bp.fixed) + " per MW-year: how fast it charges or discharges.";
      return fm.k(T.be.fixed) + " per MWh-year: how much it holds; " + Math.round(cfg.techs.battery.rte * 100) + "% round trip.";
    }
    var tal = H("div", { class: "lx-tallies lx13-tallies" }, panel);
    function tally(label) { var d = H("div", { class: "lx-tally" }, tal); H("span", { text: label }, d); return { box: d, b: H("b", { text: "…" }, d) }; }
    var tCost = tally("Cost a year"), tCo2 = tally("CO₂ a year"), tUns = tally("Unserved energy"), tSpill = tally("Spilled energy");

    var ob = H("div", { class: "lx13-box" }, panel);
    H("p", { class: "lx-eyebrow", text: "Ask the optimizer" }, ob);
    var capSl = LX.Slider(ob, { label: "CO₂ cap", color: "var(--lx-ink-2)", max: G.capMax, step: G.capStep, unit: "kt",
      hint: function () { return "The cheapest plan that emits at most this much in a year."; } });
    capSl.set(G.capDefault);
    var askBtn = H("button", { class: "lx-btn small", type: "button", html: "Find the cheapest plan" + LX.icon("target") }, ob);
    var optOut = H("div", { "aria-live": "polite" }, ob);

    var acts = H("div", { class: "lx13-rowb" }, panel);
    var finBtn = H("button", { class: "lx-btn", type: "button", html: "Score my plan" + LX.icon("star") }, acts);
    var shareBtn = H("button", { class: "lx-btn ghost small", type: "button", html: "Share this plan" }, acts);
    var shareBox = H("div", { class: "lx13-share", hidden: true }, panel);
    var scen = H("details", { class: "lx13-scen" }, panel);
    H("summary", { text: "Costs in this scenario: gas price, nuclear cost" }, scen);
    var gasN = Num(scen, { label: "Gas price", color: "var(--lx-cc)", min: lim.gas.min, max: lim.gas.max, step: 0.05, value: S_.sc.gas,
      fmt: function (v) { return "$" + v.toFixed(2) + "/MMBtu"; }, hint: "2025 U.S. average for power plants: $" + DEF.gas.toFixed(2) + " (EIA).", onChange: scenChanged });
    var nucN = Num(scen, { label: "Nuclear capital cost", color: "var(--lx-nuc)", min: lim.nucCapex.min, max: lim.nucCapex.max, step: 5, value: S_.sc.nucCapex,
      fmt: function (v) { return "$" + Math.round(v).toLocaleString("en-US") + "/kW"; }, hint: "EIA's overnight cost for a large light-water plant: $" + DEF.nucCapex.toLocaleString("en-US") + "/kW.", onChange: scenChanged });
    H("button", { class: "lx-link", type: "button", text: "Back to the EIA values", onclick: function () { gasN.set(DEF.gas); nucN.set(DEF.nucCapex); scenChanged(); } }, scen);
    var links = H("p", { class: "lx-play-links" }, live);
    var retour = H("button", { class: "lx-link", type: "button", text: "Show the three tips again" }, links);

    // ---- solving
    function readPlan() { var p = {}; KEYS.forEach(function (k) { p[k] = sl[k].val(); }); return p; }
    function setPlan(p) { KEYS.forEach(function (k) { sl[k].set(p[k]); }); S_.plan = readPlan(); }
    var timer = null;
    function changed() { S_.plan = readPlan(); S_.from = "you"; clearTimeout(timer); timer = setTimeout(run, 120); }
    function run() {
      var plan = copy(S_.plan), C = S_.C, my = ++S_.seq;
      status.set(LX.solver.mode ? "solving" : "loading");
      return LX.solver.solve(model.weekModel(C, RW, { plan: plan }), { key: "t13-plan", label: "t13-plan", timeLimit: 10 }).then(function (r) {
        if (my !== S_.seq) return;
        status.set(r);
        if (!r.ok) return;
        S_.sum = model.summarize(C, per, r, { plan: plan }); S_.raw = r.values; S_.full = null; S_.exactGap = null;
        if (S_.sum.unserved > 0.5) S_.short = true;
        S_.spill = Math.max(S_.spill, S_.sum.spilledShare);
        if (S_.sum.energy.dis > 1) S_.bat = true;
        render();
      });
    }
    function scenChanged() {
      S_.sc = { gas: gasN.val(), nucCapex: nucN.val() }; S_.C = model.costs(cfg, S_.sc);
      KEYS.forEach(function (k) { sl[k].range(0, lim[k].max); });
      if (isDefault()) { S_.frontier = cfg.frontier.points; S_.frontierLive = false; frBtn.hidden = true; frNote.hidden = true; }
      else { S_.frontier = []; frBtn.hidden = false; frNote.hidden = false; frNote.textContent = "The frontier depends on the costs: solve it again for these settings (about 14 solves)."; }
      S_.asked = null; optOut.innerHTML = "";
      changed();
    }
    frBtn.addEventListener("click", function () {
      var caps = cfg.frontier.caps, pts = [], i = 0, key = S_.sc.gas + "|" + S_.sc.nucCapex;
      frBtn.hidden = true; frNote.textContent = "Solving…";
      (function next() {
        if (key !== S_.sc.gas + "|" + S_.sc.nucCapex) return;
        if (i >= caps.length) { S_.frontier = pts; S_.frontierLive = true; frNote.textContent = "Frontier solved for gas at $" + S_.sc.gas.toFixed(2) + "/MMBtu and nuclear at $" + Math.round(S_.sc.nucCapex).toLocaleString("en-US") + "/kW."; render(); return; }
        var cap = caps[i++], o = cap == null ? {} : { cap: cap * 1e3 };
        LX.solver.solve(model.weekModel(S_.C, RW, o), { label: "t13-frontier", timeLimit: 10 }).then(function (r) {
          if (r.ok) { var s = model.summarize(S_.C, per, r, o); pts.push({ cap: cap, cost: s.cost, co2: s.co2, dual: s.capDual, plan: s.plan }); S_.frontier = pts.slice(); frNote.textContent = "Solving… " + i + " of " + caps.length; drawFrontier(); }
          next();
        });
      })();
    });
    function ask() {
      var cap = capSl.val() * 1e3, C = S_.C;
      optOut.innerHTML = ""; status.set("solving"); askBtn.disabled = true;
      LX.solver.solve(model.weekModel(C, RW, { cap: cap }), { key: "t13-opt", label: "t13-opt", timeLimit: 15 }).then(function (r) {
        askBtn.disabled = false; status.set(r);
        if (!r.ok) { H("p", { class: "lx13-sub", text: LX.solver.describe(r) }, optOut); return; }
        var s = model.summarize(C, per, r, { cap: cap });
        S_.asked = { cap: cap, sum: s, ms: r.ms.roundTrip };
        LX.store.set("t13-asked", { cap: cap, cost: s.cost, co2: s.co2, dual: s.capDual });
        showOpt(); drawFrontier(); LX.emit("t13-asked");
      });
    }
    askBtn.addEventListener("click", ask);
    function showOpt() {
      var a = S_.asked; optOut.innerHTML = ""; if (!a) return;
      var s = a.sum, t = H("table", { class: "lx13-plan" }, optOut), hr = H("tr", null, H("thead", null, t));
      H("th", { scope: "col", text: "Optimizer, cap " + Math.round(a.cap / 1e3) + " kt" }, hr); H("th", { scope: "col", class: "n", text: "Optimizer" }, hr); H("th", { scope: "col", class: "n", text: "You" }, hr);
      var b = H("tbody", null, t);
      KEYS.forEach(function (k) { var tr = H("tr", null, b); H("td", { text: TECH[k].label }, tr); H("td", { class: "n", text: Math.round(s.plan[k]) + (k === "be" ? " MWh" : " MW") }, tr); H("td", { class: "n", text: S_.plan[k] + (k === "be" ? " MWh" : " MW") }, tr); });
      var line = "Cost " + fm.musd(s.cost) + " a year for " + fm.kt(s.co2) + " of CO₂." + (s.capDual > 0.5 && a.cap > 0 ? " Cutting one more tonne would cost $" + Math.round(s.capDual) + ": the cap's [[shadow-price|shadow price]]." : " The cap does not bind: this is the cheapest plan of all.");
      H("p", { class: "lx13-sub", html: LX.rich(line) }, optOut);
      H("button", { class: "lx-btn ghost small", type: "button", text: "Use this plan", title: "Rounded up to the sliders' steps", onclick: function () { setPlan(model.ceilPlan(s.plan, lim)); S_.from = "optimizer"; run(); } }, optOut);
    }
    resetBtn.addEventListener("click", function () { setPlan(cfg.start.plan); S_.from = "start"; run(); });

    // ---- drawing
    function drawWeek() {
      tabs.forEach(function (b, i) { b.setAttribute("aria-pressed", i === S_.week ? "true" : "false"); });
      var r = RW.reps[S_.week];
      wsub.textContent = (r.kind === "season" ? "A typical " + r.season + " week of 2025, standing for " + r.n + " weeks" :
        r.kind === "peak" ? "The week of 2025's highest demand, kept as it was" : r.kind === "netpeak" ? "The week when demand minus wind and sun peaked, kept as it was" :
        "The week with the least wind of 2025, kept as it was") + ".";
      if (S_.raw) wc.draw(model.weekSeries(S_.C, per[S_.week], S_.raw, S_.week, S_.plan), r.start);
    }
    function drawFrontier() {   // the 0 kt point ($268.5M at the default costs) is left off the chart: it would squash the curve
      fc.frontier(S_.frontier.filter(function (p) { return p.cap == null || p.cap >= 25; }), S_.frontierLive ? "Frontier for this scenario" : null);
      var pts = [];
      if (S_.asked) pts.push({ id: "", label: "Optimizer, cap " + Math.round(S_.asked.cap / 1e3) + " kt", co2: S_.asked.sum.co2, cost: S_.asked.sum.cost, color: "var(--lx-ink-2)", kind: "opt", legend: "The optimizer's plan" });
      if (S_.sum) pts.push({ id: "You", label: "Your plan", co2: S_.sum.co2, cost: S_.sum.cost, color: S_.sum.unserved > 0.5 ? "var(--lx-bad)" : "var(--lx-accent)", kind: "you", legend: "Your plan", note: S_.sum.unserved > 0.5 ? "some demand unserved" : "" });
      fc.plans(pts);
    }
    function gapNow() {
      if (!S_.sum || !S_.frontier.length) return null;
      var f = model.frontierAt(S_.frontier, S_.sum.co2); return f ? S_.sum.cost / f - 1 : null;
    }
    function render() {
      var s = S_.sum; if (!s) return;
      tCost.b.textContent = fm.musd(s.cost); tCo2.b.textContent = fm.kt(s.co2);
      tUns.b.textContent = s.unserved < 0.5 ? "0 MWh" : fm.mwh(s.unserved); tUns.box.classList.toggle("bad", s.unserved >= 0.5);
      tSpill.b.textContent = fm.pct(s.spilledShare, 1);
      // energy mix of the year (served energy, spill taken pro rata from wind, sun and nuclear)
      mix.innerHTML = "";
      var keep = s.available > 0 ? 1 - s.spilled / s.available : 1, e = s.energy;
      var parts = [["Nuclear", e.nuc * keep, "var(--lx-nuc)"], ["Wind", e.wind * keep, "var(--lx-wind)"], ["Solar", e.solar * keep, "var(--lx-solar)"], ["Gas CC", e.cc, "var(--lx-cc)"], ["Peaker", e.pk, "var(--lx-pk)"], ["Unserved", s.unserved, "var(--lx-bad)"]];
      var tot = parts.reduce(function (a, p) { return a + p[1]; }, 0);
      var words = parts.filter(function (p) { return p[1] / tot >= 0.005; }).map(function (p) { H("i", { style: "--c:" + p[2] + ";width:" + (p[1] / tot * 100).toFixed(2) + "%" }, mix); return p[0] + " " + Math.round(p[1] / tot * 100) + "%"; });
      mix.setAttribute("aria-label", "The year's energy: " + words.join(", ")); mixLeg.textContent = "The year's energy: " + words.join(" · ") + ". Demand " + (s.demand / 1e6).toFixed(2) + " TWh.";
      drawWeek(); drawFrontier(); missions(); event(); store();
      if (S_.asked) showOpt();
    }
    function missions() {
      var s = S_.sum, g = S_.exactGap != null ? S_.exactGap : gapNow(), lit = s.unserved < 0.5;
      ms.set("lights", { frac: lit ? 1 : Math.max(0.05, 1 - s.unservedShare * 200), text: lit ? "Every hour served" : fm.mwh(s.unserved) + " unserved", fail: !lit, won: lit });
      ms.set("co2", { frac: s.co2 / target, text: fm.kt(s.co2), fail: s.co2 > target + 0.5, won: s.co2 <= target + 0.5 });
      ms.set("cost", { frac: g == null ? 0 : Math.max(0.03, g / G.costSlack), text: g == null ? "frontier not solved" : (S_.exactGap != null ? "+" : "about +") + fm.pct(Math.max(0, g), 1) + " vs frontier", fail: g != null && g > G.costSlack, won: lit && g != null && g <= G.costSlack });
    }
    function event() {
      evBox.querySelectorAll(".lx-event.t13").forEach(function (n) { n.remove(); });
      var s = S_.sum, msg, icon = "check";
      if (S_.from === "link" && !S_.linkSaid) { S_.linkSaid = true; msg = "A plan loaded from a shared link."; icon = "map"; }
      else if (s.unserved >= 0.5) {
        var worst = 0, wk = 0; per.forEach(function (P, p) { var ws = model.weekSeries(S_.C, P, S_.raw, p, S_.plan); ws.unserved.forEach(function (u) { if (u > worst) { worst = u; wk = p; } }); });
        icon = "question"; msg = "Lights out: up to " + Math.round(worst) + " MW short in the " + tabs[wk].textContent.toLowerCase() + " week. Add [[firm-capacity|firm]] plants or storage.";
      } else if (s.spilledShare > 0.1) { icon = "question"; msg = fm.pct(s.spilledShare, 0) + " of the wind, sun and nuclear output is [[curtailment|spilled]]: more than the town and the battery can use."; }
      else if (s.co2 > target + 0.5) msg = "Every hour served. Cut " + fm.kt(s.co2 - target) + " more CO₂ to reach the target.";
      else { var g = gapNow(); msg = "Every hour served, under the CO₂ target" + (g != null ? ", " + fm.pct(Math.max(0, g), 1) + " above the frontier." : "."); }
      var e = H("div", { class: "lx-event t13", html: LX.icon(icon) + "<div>" + LX.rich(msg) + "</div>" }, evBox);
      return e;
    }
    function store() {
      var s = S_.sum;
      LX.store.set("t13-log", { cost: s.cost, co2: s.co2, unserved: s.unserved, spilled: s.spilledShare, plan: S_.plan, gap: gapNow(), short: S_.short, bat: S_.bat });
      LX.emit("t13-run");
    }

    // ---- the opening question (first visit, not for a shared link)
    if (!shared) {
      var q = H("div", { class: "lx-ecard" }, evBox);
      H("p", { class: "lx-etime", text: "Before you build · 2025, hour by hour" }, q);
      S_.pred = LX.Predict(q, { id: "t13-start", fresh: true, q: "Lesson 0's five plants must now serve a whole year, with a peak of " + Math.round(Y.peak) + " MW. Will every light stay on?",
        options: [{ value: "yes", label: "Yes, all year" }, { value: "no", label: "No, some hours go dark" }], answer: "no",
        feedback: { yes: "Not quite.", no: "Right." }, lockText: "Locked in.",
        onPick: function () { S_.picked = true; setTimeout(function () { if (!S_.done && S_.tourWait) tour.start(0); }, 900); var go = function () { var s = S_.sum; S_.pred.reveal(s.unserved >= 0.5 ? "The year leaves " + fm.mwh(s.unserved) + " unserved. Gas and nuclear give at most " + Math.round(S_.plan.cc + S_.plan.pk + S_.plan.nuc * cfg.techs.nuc.avail) + " MW; on some hot, still evenings wind and sun cannot cover the rest." : "Every hour is served."); };
          if (S_.sum) go(); else LX.on("t13-run", function once() { if (S_.pred) { go(); S_.pred = null; } }); } });
    }

    // ---- finishing: stars, notes, the full-year check
    finBtn.addEventListener("click", finish);
    function finish() {
      if (!S_.sum) return;
      var s = S_.sum, C = S_.C;
      finBtn.disabled = true; status.set("solving");
      LX.solver.solve(model.weekModel(C, RW, { cap: s.co2 }), { key: "t13-opt", label: "t13-score", timeLimit: 15 }).then(function (r) {
        finBtn.disabled = false; status.set(r);
        var f = r.ok ? model.summarize(C, per, r, { cap: s.co2 }).cost : model.frontierAt(S_.frontier, s.co2);
        debrief(s, f);
      });
    }
    function debrief(s, fCost) {
      var st = model.stars(s, target, fCost);
      S_.exactGap = st.gap; missions();
      S_.done = true; LX.progress.done(LESSON);
      LX.store.set("t13-score", { stars: st, frontier: fCost, cost: s.cost, co2: s.co2, unserved: s.unserved });
      panel.hidden = true; links.hidden = true; deb.hidden = false; deb.innerHTML = "";
      var hd = H("div", { class: "lx-deb-head" }, deb);
      H("h3", { text: s.unserved < 0.5 ? "Your plan keeps every light on." : "Your plan leaves " + fm.mwh(s.unserved) + " unserved." }, hd);
      H("a", { class: "lx-btn small", href: "#explain", html: "See it as diagrams" + LX.icon("arrow") }, hd);
      LX.Stars(deb, [{ label: "Lights on", n: st.lights, value: s.unserved < 0.5 ? "every hour" : fm.mwh(s.unserved) + " short" },
                     { label: "CO₂", n: st.co2, value: fm.kt(s.co2) }, { label: "Cost", n: st.cost, value: st.gap == null ? fm.musd(s.cost) : "+" + fm.pct(Math.max(0, st.gap), 1) }]);
      if (fCost) H("p", { class: "lx-hint", text: "The cheapest plan with your CO₂ (" + fm.kt(s.co2) + ") costs " + fm.musd(fCost) + " a year; yours costs " + fm.musd(s.cost) + "." }, deb);
      // check on all 8,760 hours
      var fb = H("div", { class: "lx13-box" }, deb);
      H("p", { class: "lx-eyebrow", text: "Check it on the full year" }, fb);
      H("p", { class: "lx13-sub", text: "Your plan was run on seven weeks. Real planners re-run a chosen plan hour by hour on the whole year." }, fb);
      var fbtn = H("button", { class: "lx-btn ghost small", type: "button", text: "Run all 8,760 hours (a few seconds)" }, fb), fout = H("div", { "aria-live": "polite" }, fb);
      fbtn.addEventListener("click", function () {
        fbtn.disabled = true; fout.textContent = "Solving the full year…";
        var plan = copy(S_.plan), C = S_.C, fy = [{ demand: Y.demand, wind: Y.wind, solar: Y.solar, weight: 1 }];
        LX.solver.solve(model.fullYearModel(C, Y, { plan: plan }), { key: "t13-full", label: "t13-full", timeLimit: 30 }).then(function (r) {
          fbtn.disabled = false; fout.innerHTML = "";
          if (!r.ok) { fout.textContent = LX.solver.describe(r); return; }
          var f = model.summarize(C, fy, r, { plan: plan }); S_.full = f;
          LX.store.set("t13-full", { cost: f.cost, co2: f.co2, unserved: f.unserved, spilled: f.spilledShare, wcost: s.cost, wco2: s.co2, wun: s.unserved });
          var t = H("table", { class: "lx13-cmp" }, fout), hr = H("tr", null, H("thead", null, t));
          ["", "Seven weeks", "All 8,760 hours"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
          var b = H("tbody", null, t);
          [["Cost a year", fm.musd(s.cost), fm.musd(f.cost)], ["CO₂ a year", fm.kt(s.co2), fm.kt(f.co2)], ["Unserved", fm.mwh(s.unserved), fm.mwh(f.unserved)], ["Spilled", fm.pct(s.spilledShare), fm.pct(f.spilledShare)]]
            .forEach(function (row) { var tr = H("tr", null, b); row.forEach(function (x) { H("td", { text: x }, tr); }); });
          H("p", { class: "lx13-sub", text: "Solved in " + Math.max(1, Math.round(r.ms.roundTrip)) + " ms. " + (f.unserved > s.unserved + 0.5 ? "Some hours outside the seven weeks go short: a representative week cannot show every still, hot evening." : "The seven weeks held up for this plan.") }, fout);
          LX.emit("t13-run");
        });
      });
      var g = st.gap;
      var NOTES = [
        { icon: "scale", title: "Firm capacity", text: "On a still, dark evening only [[firm-capacity|firm]] plants and storage serve the peak.", moment: "", got: S_.short, lock: "See a plan go short once to collect this." },
        { icon: "cloud", title: "Spilled energy", text: "Output beyond what the town and the battery can take is thrown away.", moment: "Your highest spill: " + fm.pct(S_.spill, 0) + ".", got: S_.spill >= 0.05, lock: "Build enough wind or sun to spill 5% to collect this." },
        { icon: "battery", title: "Storage", text: "A battery moves energy to the hours that need it and loses 15% on the way.", moment: "", got: S_.bat, lock: "Run a plan with a battery to collect this." },
        { icon: "target", title: "Shadow price of the cap", text: "What one more tonne of allowed CO₂ would save the cheapest plan.", moment: S_.asked && S_.asked.sum.capDual ? "$" + Math.round(S_.asked.sum.capDual) + " per tonne at " + Math.round(S_.asked.cap / 1e3) + " kt." : "", got: !!S_.asked, lock: "Ask the optimizer to collect this." },
        { icon: "frontier", title: "The frontier", text: "No plan is both cheaper and cleaner than a plan on the frontier.", moment: g != null ? "Your plan: " + fm.pct(Math.max(0, g), 1) + " above it." : "", got: g != null && g <= G.costSlack && s.unserved < 0.5, lock: "Get within " + Math.round(G.costSlack * 100) + "% of the frontier with every light on." }
      ];
      H("h4", { class: "lx-deb-notes", text: "Notes collected: " + NOTES.filter(function (n) { return n.got; }).length + " of " + NOTES.length }, deb);
      LX.Notes(deb, NOTES.map(function (n) { n.link = { href: "#explain", text: "On the concept map" }; return n; }));
      var row = H("div", { class: "lx13-rowb" }, deb);
      H("button", { class: "lx-btn ghost small", type: "button", text: "Back to my plan", onclick: function () { deb.hidden = true; panel.hidden = false; links.hidden = false; panel.scrollIntoView({ block: "nearest" }); } }, row);
      H("button", { class: "lx-btn ghost small", type: "button", text: "Share this plan", onclick: function () { deb.hidden = true; panel.hidden = false; links.hidden = false; share(); } }, row);
      deb.focus({ preventScroll: true }); LX.emit("t13-done"); LX.emit("layout");
    }

    // ---- sharing: the plan in the address, as #plan-w530-s160-...
    function share() {
      var hash = model.encodePlan(S_.plan, isDefault() ? null : S_.sc), url = location.href.split("#")[0] + "#" + hash;
      try { history.replaceState(null, "", "#" + hash); } catch (e) { /* not allowed here */ }
      shareBox.hidden = false; shareBox.innerHTML = "";
      H("label", { class: "lx13-sub", for: "t13-link", text: "Anyone who opens this link sees your plan and runs its year themselves." }, shareBox);
      var inp = H("input", { id: "t13-link", type: "text", readonly: true, value: url }, shareBox);
      var msg = H("p", { class: "lx13-sub", "aria-live": "polite" }, shareBox);
      inp.addEventListener("focus", function () { inp.select(); });
      try { navigator.clipboard.writeText(url).then(function () { msg.textContent = "Copied to the clipboard."; }, function () { msg.textContent = "Select the link and copy it."; }); }
      catch (e) { msg.textContent = "Select the link and copy it."; }
      shareBox.scrollIntoView({ block: "nearest" });
    }
    shareBtn.addEventListener("click", share);

    // ---- the coach tour and start
    var tour = LX.Coach(root, [
      { el: sl.wind.el, text: "Choose how much of each plant to build. Every change runs the town's year again." },
      { el: tal, text: "Watch the year's cost and CO₂, and any demand left unserved or energy spilled." },
      { el: askBtn, text: "Stuck? Ask the optimizer for the cheapest plan under a CO₂ cap, then compare it with yours." }
    ], { key: "t13-coach" });
    retour.addEventListener("click", function () { root.scrollIntoView({ block: "start" }); setTimeout(function () { tour.start(0, true); }, 60); });
    setPlan(S_.plan); gasN.set(S_.sc.gas); nucN.set(S_.sc.nucCapex);
    tCost.b.textContent = "…"; drawFrontier(); status.set("loading");
    var first = run();
    if ("IntersectionObserver" in window && !/lx-demo/.test(location.hash)) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) {   // after the opening question, when there is one
          io.disconnect(); if (S_.pred && !S_.picked) { S_.tourWait = true; return; } setTimeout(function () { if (!S_.done) tour.start(0); }, 350); }
      }, { threshold: 0.95 });
      io.observe(sl.wind.el);
    }
    // screenshot and demo states: #lx-demo-mid (the optimizer's plan at the target, loaded), #lx-demo-done (then scored)
    var demo = /lx-demo-(mid|done)/.exec(location.hash);
    if (demo) first.then(function () {
      if (S_.pred) { S_.pred = null; evBox.querySelectorAll(".lx-ecard").forEach(function (n) { n.remove(); }); }
      capSl.set(G.co2Target); ask();
      LX.on("t13-asked", function () { setPlan(model.ceilPlan(S_.asked.sum.plan, lim)); S_.from = "optimizer"; run().then(function () { if (demo[1] === "done") finish(); }); });
    });
    root.lxGame = { model: model, state: function () { return S_; }, finish: finish, ask: ask, setPlan: function (p) { setPlan(p); return run(); }, tour: tour };
    buildExplain(cfg, Y, RW);
  }

  // ---------------------------------------------------------------- the explain layer (the reader's numbers where they exist)
  function buildExplain(cfg, Y, RW) {
    var host = document.getElementById("t13-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var C = model.costs(cfg, {}), pts = cfg.frontier.points, at200 = pts.filter(function (p) { return p.cap === cfg.game.co2Target; })[0];
    var free = pts.filter(function (p) { return p.cap == null; })[0];
    var log = function () { return LX.store.get("t13-log", null); };
    var later = "Upcoming: M3 (capacity expansion) writes this model in code and solves it with a modelling language.";
    var cm = LX.ConceptMap(H("div", { class: "lx-xcard" }, host), {
      title: "The planning problem, and how its parts connect", lede: "Tap an idea to see what it means and where it appeared in your plan.",
      groups: { dec: ["Decisions", "var(--lx-tier-3)"], ops: ["Operation", "var(--lx-cc)"], time: ["Time", "var(--lx-tier-2)"], out: ["Results", "var(--lx-good)"] },
      cols: 4, rows: 3, colsN: 3, rowsN: 4, sel: "build",
      nodes: [
        { id: "build", g: "dec", label: "What to build", lines: ["What to", "build"], at: [3, 1], atN: [2, 1], text: "Seven numbers: MW of five plants, and the battery's MW and MWh. Each costs money every year, used or not.", game: "Your sliders.", later: later },
        { id: "run", g: "ops", label: "Hourly operation", lines: ["Hourly", "operation"], at: [1, 1], atN: [1, 1], text: "Given what is built, the solver runs the plants and the battery at least cost, every modelled hour.", game: "The week chart." },
        { id: "weeks", g: "time", label: "Seven weeks", lines: ["Seven", "weeks"], at: [0, 0], atN: [0, 0], text: "Four typical weeks (one per season) and three extreme ones stand for the 52 weeks of 2025.", game: "The week tabs." },
        { id: "rules", g: "dec", label: "Rules", at: [2, 0], atN: [0, 1], text: "Supply covers demand each hour; no plant above its size; the battery's charge stays within its MWh.", game: "Unserved energy appears when a rule cannot be met." },
        { id: "store", g: "time", label: "Storage link", lines: ["Storage", "link"], at: [1, 0], atN: [1, 0], text: "The battery's charge carries from each calendar week to the next, so energy can move across weeks.", game: "Charging, below zero on the chart." },
        { id: "cost", g: "out", label: "Cost a year", lines: ["Cost", "a year"], at: [3, 2], atN: [2, 2], text: "Capital and fixed costs of what is built, plus fuel for what runs. The goal the optimizer keeps as low as it can.", game: "The cost tally." },
        { id: "co2", g: "out", label: "CO₂ a year", lines: ["CO₂", "a year"], at: [1, 2], atN: [1, 2], text: "Gas burned, times " + C.techs.cc.co2.toFixed(2) + " t per MWh in the combined-cycle plant and " + C.techs.pk.co2.toFixed(2) + " in the peaker.", game: "The CO₂ tally." },
        { id: "cap", g: "dec", label: "CO₂ cap", lines: ["CO₂", "cap"], at: [3, 0], atN: [2, 0], text: "An extra rule: the year's CO₂ at most the cap. Its shadow price is the cost of the last tonne cut.", game: at200 ? "At " + cfg.game.co2Target + " kt the last tonne cut costs $" + Math.round(at200.dual) + "." : "" },
        { id: "front", g: "out", label: "Frontier", at: [2, 2], atN: [1, 3], text: "The cheapest plan at each CO₂ level. Lesson 12 traced it; your plan sits on it or above it.", game: free ? "From " + fm.musd(free.cost) + " with no cap to " + fm.musd(at200.cost) + " at " + cfg.game.co2Target + " kt." : "" },
        { id: "short", g: "out", label: "Unserved and spilled", lines: ["Unserved,", "spilled"], at: [0, 2], atN: [0, 2], text: "Demand nobody could serve, and output nobody could use: both signs that a plan is out of balance.", game: "The red bars, and the spilled tally." }
      ],
      edges: [["build", "run", "limits"], ["weeks", "run", "set the hours of"], ["store", "run", "links weeks in"], ["rules", "run", "constrain"],
              ["build", "cost", "capital adds to"], ["run", "co2", "gas burns"], ["run", "short", "shows"], ["cap", "build", "pushes"], ["cost", "front", "plots on"], ["co2", "front", "plots on"]],
      moment: function (id) {
        var L = log(); if (!L) return null;
        if (id === "cost") return "Your plan: " + fm.musd(L.cost) + " a year.";
        if (id === "co2") return "Your plan: " + fm.kt(L.co2) + " a year.";
        if (id === "front") return L.gap != null ? "Your plan: " + fm.pct(Math.max(0, L.gap), 1) + " above the frontier." : null;
        if (id === "short") return "Your plan: " + fm.mwh(L.unserved) + " unserved, " + fm.pct(L.spilled) + " spilled.";
        if (id === "weeks") { var F = LX.store.get("t13-full", null); return F ? "Your full-year check: " + fm.musd(F.cost) + " and " + fm.kt(F.co2) + " on all 8,760 hours, against " + fm.musd(F.wcost) + " and " + fm.kt(F.wco2) + " on seven weeks." : null; }
        return null;
      }
    });
    LX.on("t13-done", function () { cm.select("front"); });
    Boundary(H("div", { class: "lx-xcard" }, host), {
      title: "Where this answer holds",
      lede: "A model's plan is only as good as what it includes. This one is built to teach; read its answers with these limits.",
      cols: [
        { title: "It holds when", items: [
          "the weather of 2025 is a fair guide: one year of real Southwest Power Pool shapes, scaled to the town;",
          "costs stay as entered: EIA's 2026 values in 2025 dollars, the battery in 2024 dollars, the same in every year;",
          "the town is an island: no imports, no transmission limits inside it;",
          "seven weeks stand in for the year (check it on all 8,760 hours in the debrief)." ] },
        { title: "It leaves out", items: [
          "start-up costs, minimum output and ramp limits of gas plants (lesson 0 had a ramp limit);",
          "plant outages and a reserve margin: adequacy needs many weather years (A5, upcoming);",
          "taxes, tax credits and financing beyond a 4% real cost of capital;",
          "who pays, jobs, land and local air quality: costs here are the system's, not any one household's." ] }
      ],
      foot: "Data: EIA-930 hourly data for 2025; costs from EIA's Annual Energy Outlook 2026 and an NREL battery study, listed under Sources."
    });
    var tcard = H("div", { class: "lx-xcard" }, host);
    TextTable(tcard, {
      title: "What real planning models do",
      lede: "All four solve the same kind of problem: least cost, subject to rules, over many hours.",
      columns: [{ key: "name", label: "Model" }, { key: "plans", label: "What it plans" }, { key: "time", label: "How it handles time" }, { key: "open", label: "Code" }],
      rows: [
        { color: "var(--lx-accent)", name: "This lesson", note: "one town, one year", plans: "Seven capacities for one town", time: "Seven weeks, battery linked across the year", open: "Open (this page)" },
        { color: "var(--lx-tier-3)", name: "GenX", note: "Julia and JuMP", plans: "Generation, storage, transmission and demand-side resources", time: "Representative periods with storage linked between them, or the full year", open: "Open source (GPL-2.0)" },
        { color: "var(--lx-tier-4)", name: "ReEDS", note: "NLR (formerly NREL), the contiguous U.S.", plans: "Generation, storage and transmission across 132 regions, to 2050 and beyond", time: "33 representative days by default, plus stress periods for reliability", open: "Open source" },
        { color: "var(--lx-tier-5)", name: "PyPSA", note: "Python", plans: "Investment and operation of power and energy networks", time: "Any set of time steps with weights: full years or reduced ones", open: "Open source (MIT)" }
      ]
    });
    H("p", { class: "lx13-sub", html: 'Official pages: <a href="https://www.nlr.gov/analysis/reeds/">ReEDS (NLR)</a> and its <a href="https://docs.nlr.gov/docs/fy26osti/93617.pdf">2025 documentation</a> (PDF); <a href="https://docs.pypsa.org/">PyPSA documentation</a>. GenX publishes its code and documentation openly.' }, tcard);
  }

  LX.mount("town-plan", function (live, data, root) { view(live, data, root); });
})();
