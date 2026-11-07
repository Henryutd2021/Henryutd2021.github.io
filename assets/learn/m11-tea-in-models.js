// m11-tea-in-models.js — Modeler lesson M11, "Techno-economic analysis inside an optimization model" (model-lab: step
// cards with solver runs), wave W5, builder learn-w5-f, 2026-11-06.
//
// Data: assets/learn/data/m11-tea-in-models.json (the plant, the electrolyzer's costs, the credit as the IRS states it, the
// counting rules, the boundaries, the tie rule, a reference block written by the test, and a "lesson13" block the test
// copies from 13-capstone.json and checks on every run: the wind farm's costs, the rate and the life, as lesson 13 shows
// them, so this page and its notebook need only that subset), a16-hydrogen-ptx.json (57 kWh per kg, as A16 shows it), town.json
// (Prairie Town's fleet, for its price and CO2), town_year.json (SPP 2025 hourly shapes, EIA-930), cf_targets.json (EIA's
// wind capacity factor), path.json (step 8 names case file CF5 and step 9 case file CF4 through LX.lessonRefHTML).
//
// The model: one linear program for a plant's whole life, on 36 representative days (three per month, each weighted by
// the days it stands for). Every variable is >= 0 and 0 <= S <= 100 MW. Money is in real 2025 dollars; the objective is the plant's ANNUAL EQUIVALENT net cost, $ a year
// (its present value divided by the annuity factor of its life). Decisions:
//   S                   the electrolyzer's size (MW), or fixed
//   per period p, day d, hour t:
//     ez   electrolyzer power (MW over the hour = MWh); it makes k = 1000 / 57 kg per MWh
//     dw   wind taken directly by the electrolyzer (behind the plant's meter; 0 across the grid)
//     exp  wind sold to the grid at Prairie Town's price p_t (at most the 50 MW connection)
//     cur  wind curtailed
//     imp  power bought from the grid at p_t plus a delivery charge c (at most 50 MW; across the grid, all of ez)
//     u    bought MWh not matched by a certificate from the same hour (hourly matching across the grid only: behind
//          one meter the tie rule never buys and sells in one hour, so every MWh bought counts, as with no certificates)
// Rules each hour:  dw + exp + cur = w_t (wind);  ez = dw + imp (power into the electrolyzer);  ez <= S
//                   across the grid: ez = imp, and the wind farm alone sells min(w_t, 50) (its certificates)
// Periods: with a credit counted in its own years, period 1 is the credit's 10 years and period 2 the rest of the life;
//   each period's hourly cash flows are weighted by its share of the life's discounted years, phi_1 = AF(r, 10) / AF(r, N)
//   and phi_2 = 1 - phi_1 (AF: annuity factor); one period with phi = 1 otherwise. The two periods share one size.
// Goal (min, $ a year):  (CRF(r, N) + fom) x capex x S
//                        + sum_p phi_p sum_d days_d sum_t [ (p_t + c) imp + wear x ez - p_t exp - (h + credit_p) k ez ]
//   CRF(r, N) = r / (1 - (1 + r)^-N); fom = 5% of capex a year; wear = 11% of capex per 40,000 full-load hours, per MWh;
//   h the hydrogen price ($/kg). Constants (the wind farm's own costs) are added when the result is read.
// The credit's tier: a tier is a cap in period 1: sum_d days_d sum_t (e x counted - limit x k ez / 1000) <= 0, in tonnes,
//   where counted = imp (no certificates; hourly matching behind one meter), u (hourly matching across the grid), or, with
//   annual matching, the year's imp minus the certificates (wind sold), which may go negative in the row because the
//   right side is never negative (e x max(0, X) <= L x kg is e x X <= L x kg); e = the grid's t CO2 per MWh.
//   A tier's rule is a step, which no single LP can hold: the page solves one LP per tier (and one with no credit) and keeps
//   the best (pick(): the largest value; within $1 a year of it, the case listed first). Credit amounts are the law's; no page searches over them (guard G-POL).
// Reported numbers leave out the tie rule's hair costs (data "tie"); the test proves the reported numbers the same on every
// best plan and re-runs the plans on all 8,760 hours of 2025 (data reference.fullYear).
(function () {
  "use strict";
  var HOURS = 24, MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // ---------------------------------------------------------------- finance
  function crf(r, n) { return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n)); }
  function af(r, n) { return r === 0 ? n : (1 - Math.pow(1 + r, -n)) / r; }
  function to2025(D, v, from) { var x = D.deflator.index; return v * x["2025"] / x[String(from)]; }
  // the costs the page and the LP use, in 2025 dollars; o: { capexKW (2025 $/kW), r (fraction), N (years) }
  function costs(D, C13, A16, o) {
    var E = D.electrolyzer, W = C13.techs.wind, capex = o.capexKW;
    return {
      capexKW: capex, r: o.r, N: o.N, crf: crf(o.r, o.N), af: af(o.r, o.N),
      fomKW: E.fomShare * capex,                                   // $/kW-yr
      wear: E.replaceShare * capex * 1000 / E.replaceHours,        // $/MWh into the electrolyzer
      k: 1000 / A16.electrolyzer.kWhPerKg,                          // kg per MWh
      windCapexKW: W.capex, windFomKW: W.fom, windMW: D.plant.windMW, C: D.plant.connectionMW
    };
  }
  function capexRange(D) { var c = D.electrolyzer.capex2022; return { low: to2025(D, c.low, 2022), mid: to2025(D, c.mid, 2022), high: to2025(D, c.high, 2022) }; }

  // ---------------------------------------------------------------- the year and its representative days
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  // Prairie Town's price and CO2 each hour of 2025 (lesson 9's merit order), and the plant's wind
  function prepare(D, town, year, targets, profile) {
    var f = town.fleet, n = year.demand.length, pw = profile("wind", D.plant.windMW, { year: year, targets: targets, method: D.plant.profileMethod });
    var Y = { n: n, w: new Array(n), p: new Array(n), co2: 0, use: 0, short: 0 };
    for (var i = 0; i < n; i++) {
      var d = Math.round(year.demand[i] / 1000 * D.town.demandPeakMW), w = Math.round(year.wind[i] / 1000 * f.wind.mw), s = Math.round(year.solar[i] / 1000 * f.solar.mw);
      var g = d - f.nuclear.mw - w - s, cc = Math.min(Math.max(g, 0), f.cc.mw), pk = Math.min(Math.max(g - f.cc.mw, 0), f.peaker.mw);
      Y.p[i] = g <= 0 ? 0 : g <= f.cc.mw ? f.cc.cost : f.peaker.cost; if (g > f.cc.mw + f.peaker.mw) Y.short++;
      Y.co2 += cc * f.cc.co2 + pk * f.peaker.co2; Y.use += d;
      Y.w[i] = Math.round(pw.mw[i] * 100) / 100;
    }
    Y.rate = Y.co2 / Y.use;                         // t CO2 per MWh used: the town's 2025 average (operating only)
    Y.cf = sum(Y.w) / (D.plant.windMW * n);
    Y.days = medoids(Y);
    Y.ccRate = f.cc.co2;
    return Y;
  }
  // three representative days per month: the month's days split into thirds by the plant's daily wind energy (ties to the
  // earlier day), and in each third its medoid day (the day closest to the others of that third in the plant's hourly wind
  // per MW and the hourly price per $100; ties to the earlier day), weighted by the third's days (365 in all)
  function medoids(Y) {
    var out = [], k0 = 0, wMW = Math.max.apply(null, Y.w) || 1, NB = 3;
    MDAYS.forEach(function (nd, m) {
      var ds = [];
      for (var k = k0; k < k0 + nd; k++) { var e = 0; for (var t = 0; t < HOURS; t++) e += Y.w[k * HOURS + t]; ds.push({ k: k, e: e }); }
      ds.sort(function (a, b) { return a.e - b.e || a.k - b.k; });
      for (var g = 0; g < NB; g++) {
        var grp = ds.slice(Math.round(g * nd / NB), Math.round((g + 1) * nd / NB)), best = null, bestD = Infinity;
        grp.slice().sort(function (a, b) { return a.k - b.k; }).forEach(function (a) {
          var s = 0;
          grp.forEach(function (b) { for (var t = 0; t < HOURS; t++) { var dw = (Y.w[a.k * HOURS + t] - Y.w[b.k * HOURS + t]) / wMW, dp = (Y.p[a.k * HOURS + t] - Y.p[b.k * HOURS + t]) / 100; s += dw * dw + dp * dp; } });
          if (s < bestD - 1e-9) { bestD = s; best = a; }
        });
        var i0 = best.k * HOURS;
        out.push({ m: m, month: MON[m], third: g, day: best.k, date: dateOf(best.k), weight: grp.length, w: Y.w.slice(i0, i0 + HOURS), p: Y.p.slice(i0, i0 + HOURS) });
      }
      k0 += nd;
    });
    return out;
  }
  function dateOf(day) { return new Date(Date.UTC(2025, 0, 1) + day * 864e5).toISOString().slice(0, 10); }
  // every day of 2025 as its own period of weight 1 (the full-year check)
  function allDays(Y) { var o = []; for (var k = 0; k < Y.n / HOURS; k++) o.push({ m: -1, day: k, date: dateOf(k), weight: 1, w: Y.w.slice(k * HOURS, k * HOURS + HOURS), p: Y.p.slice(k * HOURS, k * HOURS + HOURS) }); return o; }

  // ---------------------------------------------------------------- the LP
  // o: { boundary: "plant"|"increment"|"grid", size: null | MW, h ($/kg), c ($/MWh), rule: "none"|"annual"|"hourly",
  //      e (t CO2 per MWh), credit: null | $/kg, years (credit years, default 10), window: "right"|"all", tier: null | {max, strict},
  //      days (default Y.days), delta (row -> rhs change, for the test), hair (default true) }
  function periods(K, o) {
    if (!o.credit) return [{ id: 1, phi: 1, credit: 0, cap: false }];
    if (o.window === "all" || K.N <= (o.years || 10)) return [{ id: 1, phi: 1, credit: o.credit, cap: !!o.tier }];
    var p1 = af(K.r, o.years || 10) / K.af;
    return [{ id: 1, phi: p1, credit: o.credit, cap: !!o.tier }, { id: 2, phi: 1 - p1, credit: 0, cap: false }];
  }
  function build(Y, K, D, o) {
    var days = o.days || Y.days, grid = o.boundary === "grid", vars = [], cons = [], P = periods(K, o), dl = o.delta || {};
    var hair = o.hair === false ? { import: 0, curtail: 0 } : D.tie, maxMW = D.plant.maxMW, rule = o.rule || "none", fixed = o.size != null;
    var lim = o.tier ? o.tier.max - (o.tier.strict ? D.credit.strictMargin : 0) : 0;
    if (!fixed) vars.push({ name: "S", ub: maxMW, cost: (K.crf + D.electrolyzer.fomShare) * K.capexKW * 1000 });
    P.forEach(function (pp) {
      var capT = {}, nb = 0;
      days.forEach(function (dy, di) {
        for (var t = 0; t < HOURS; t++) {
          var s = pp.id + "_" + di + "_" + t, wt = pp.phi * dy.weight, p = dy.p[t], w = dy.w[t];
          var ezCost = wt * (K.wear - (o.h + pp.credit) * K.k);          // each MWh into the electrolyzer (ez = dw + imp)
          var add = function (o2, n, c) { o2[n] = (o2[n] || 0) + c; };
          vars.push({ name: "imp" + s, ub: grid ? (fixed ? o.size : maxMW) : K.C, cost: wt * (p + o.c + hair.import) + ezCost });
          var ez = {}; ez["imp" + s] = 1;
          if (!grid) {
            // wind: taken by the electrolyzer, sold (selling at $0 is preferred to curtailing by the tie rule's hair), or
            // curtailed (the slack of this row)
            vars.push({ name: "dw" + s, ub: w, cost: ezCost }, { name: "exp" + s, ub: Math.min(K.C, w), cost: -wt * (p + hair.curtail) });
            var b = {}; b["dw" + s] = 1; b["exp" + s] = 1;
            cons.push({ name: "w" + s, terms: b, le: w + (dl["w" + s] || 0) });
            ez["dw" + s] = 1;
          }
          if (!fixed) { var c = {}; Object.keys(ez).forEach(function (n) { c[n] = 1; }); c.S = -1; cons.push({ name: "s" + s, terms: c, le: dl["s" + s] || 0 }); }
          else if (!grid) cons.push({ name: "s" + s, terms: ez, le: o.size + (dl["s" + s] || 0) });
          // counted MWh for the tier's cap
          var sold = grid ? Math.min(K.C, w) : 0;
          if (pp.cap) {
            // behind one meter the tie rule never buys and sells in one hour, so hourly matching counts every MWh bought,
            // as "no certificates" does: the plant needs no u (a smaller LP, the same optimum; the test checks it)
            if (rule === "hourly" && grid) {
              vars.push({ name: "u" + s, ub: grid ? maxMW : K.C });
              var hu = {}; hu["u" + s] = 1; hu["imp" + s] = -1; if (!grid) hu["exp" + s] = 1;
              cons.push({ name: "h" + s, terms: hu, ge: -sold });
              add(capT, "u" + s, dy.weight * o.e);
            } else if (rule === "none" || rule === "hourly") add(capT, "imp" + s, dy.weight * o.e);
            // annual matching: e x max(0, bought - certificates) <= limit x kg is the same as e x (bought - certificates)
            // <= limit x kg, since the right side is never negative: one row, no U
            else { add(capT, "imp" + s, dy.weight * o.e); if (!grid) add(capT, "exp" + s, -dy.weight * o.e); else nb += dy.weight * o.e * sold; }
            Object.keys(ez).forEach(function (n) { add(capT, n, -dy.weight * lim * K.k / 1000); });
          }
        }
      });
      if (pp.cap) cons.push({ name: "cap" + pp.id, terms: capT, le: nb + (dl["cap" + pp.id] || 0) });
    });
    return { sense: "min", variables: vars, constraints: cons };
  }

  // ---------------------------------------------------------------- reading a solved plan
  // the wind farm on its own: it sells what its connection takes, at p_t (a year, $)
  function windAlone(Y, K, days) { var s = 0; (days || Y.days).forEach(function (dy) { for (var t = 0; t < HOURS; t++) s += dy.weight * dy.p[t] * Math.min(K.C, dy.w[t]); }); return s; }
  function read(Y, K, D, o, r) {
    if (!r || !r.values) return { ok: false, status: r ? r.status : "error" };
    var days = o.days || Y.days, grid = o.boundary === "grid", P = periods(K, o), x = r.values;
    var v = function (n) { var a = x[n]; return a == null || Math.abs(a) < 1e-7 ? 0 : a; };
    var S = o.size == null ? v("S") : o.size, per = [];
    P.forEach(function (pp) {
      var a = { id: pp.id, phi: pp.phi, credit: pp.credit, ez: 0, dw: 0, imp: 0, exp: 0, cur: 0, counted: 0, matched: 0, bought: 0, sales: 0, wind: 0, soldAlone: 0 };
      days.forEach(function (dy, di) {
        for (var t = 0; t < HOURS; t++) {
          var s = pp.id + "_" + di + "_" + t, wt = dy.weight, im = v("imp" + s);
          a.ez += wt * (im + (grid ? 0 : v("dw" + s))); a.imp += wt * im; a.bought += wt * (dy.p[t] + o.c) * im; a.wind += wt * dy.w[t];
          a.soldAlone += wt * dy.p[t] * Math.min(K.C, dy.w[t]);
          if (!grid) { a.dw += wt * v("dw" + s); a.exp += wt * v("exp" + s); a.cur += wt * Math.max(0, dy.w[t] - v("dw" + s) - v("exp" + s)); a.sales += wt * dy.p[t] * v("exp" + s); }
          var sold = grid ? Math.min(K.C, dy.w[t]) : v("exp" + s);
          a.hourly = (a.hourly || 0) + wt * Math.max(0, im - sold);
          a.certs = (a.certs || 0) + wt * sold;
        }
      });
      a.kg = a.ez * K.k;
      a.counted = (o.rule || "none") === "hourly" ? a.hourly : o.rule === "annual" ? Math.max(0, a.imp - a.certs) : a.imp;
      a.rate = a.kg > 0 ? a.counted * (o.e || 0) * 1000 / a.kg : 0;   // kg CO2 per kg of hydrogen (the counted grid power only)
      a.wear = K.wear * a.ez; a.revenue = o.h * a.kg; a.creditUSD = pp.credit * a.kg;
      per.push(a);
    });
    return money(Y, K, D, o, { ok: !!r.ok, status: r.status, S: S, per: per, objective: r.objective });
  }
  // the plant's money: annual items per period, the cash flows, NPV, the annual equivalent and the cost per kg
  function money(Y, K, D, o, R) {
    var b = o.boundary || "plant", N = K.N, fomEz = K.fomKW * 1000 * R.S, capEz = K.capexKW * 1000 * R.S;
    var windFom = K.windFomKW * 1000 * K.windMW, windCap = K.windCapexKW * 1000 * K.windMW;
    R.capex0 = capEz + (b === "plant" ? windCap : 0);
    R.per.forEach(function (a) {
      var sales = b === "plant" ? a.sales : b === "increment" ? a.sales - a.soldAlone : 0;   // increment: lost sales are negative
      a.costs = a.bought + a.wear + fomEz + (b === "plant" ? windFom : 0) - sales;           // costs net of power sales
      a.net = a.revenue + a.creditUSD - a.costs;
      a.salesB = sales;
    });
    var years = Math.min(N, (o.credit && o.window !== "all") ? (o.years || 10) : N), flows = [-R.capex0], kgPV = 0, costPV = R.capex0, npv = -R.capex0, credPV = 0;
    for (var y = 1; y <= N; y++) {
      var a = R.per.length > 1 && y > years ? R.per[1] : R.per[0], df = Math.pow(1 + K.r, -y);
      flows.push(a.net); npv += a.net * df; kgPV += a.kg * df; costPV += a.costs * df; credPV += a.creditUSD * df;
    }
    R.flows = flows; R.npv = npv; R.annual = npv / K.af; R.kgPV = kgPV;
    R.lcoh = kgPV > 0 ? costPV / kgPV : null;        // the cost per kg before credits ($/kg, levelized)
    R.creditLev = kgPV > 0 ? credPV / kgPV : 0;      // the credit per kg, levelized over the life
    R.kg = R.per[0].kg; R.util = R.S > 1e-6 ? R.per[0].ez / (R.S * 8760) : 0;
    R.rate = R.per[0].rate;
    return R;
  }
  // one LP per tier, keep the best (largest NPV; ties within $1 a year to the cleaner tier)
  function tierCases(D, o, creditOn) {
    var L = [{ id: "none", tier: null, credit: null }];
    if (creditOn) D.credit.tiers.forEach(function (t) { L.push({ id: t.id, tier: t, credit: t.amount * (o.wage === false ? 1 : D.credit.multiplier) }); });
    return L;
  }
  // the best case: the largest annual equivalent, and of the cases within TIE_USD ($1 a year) of it the one listed first
  // ("none", then the cleaner tier); a plan that makes no hydrogen claims nothing ("none")
  var TIE_USD = 1;
  function pick(list) {
    var ok = list.filter(function (c) { return c.R && c.R.ok; });
    if (!ok.length) return null;
    var top = Math.max.apply(null, ok.map(function (c) { return c.R.annual; }));
    var best = ok.filter(function (c) { return c.R.annual >= top - TIE_USD; })[0];
    if (best.R.kg < 1) best = list.filter(function (c) { return c.id === "none"; })[0] || best;
    return best;
  }
  // A bound for each case without an LP: the same LP with no cap. With no cap the hours are independent once the size S
  // is set, so each hour's best use of S is a short ladder (wind the connection cannot carry, then wind it could sell,
  // then power bought, each worth less than the one before), and the year's cost is a convex, piecewise-linear function
  // of S: its least value is found by sweeping its corners. It equals the uncapped LP's optimum (the test checks), which
  // annualBound() turns into a bound on what the capped case can report. For "none" it is exact. Returns the LP
  // objective ($ a year, the tie rule's hair costs included unless o.hair is false) and the best S.
  function freeObj(Y, K, D, o) {
    var days = o.days || Y.days, grid = o.boundary === "grid", hair = o.hair === false ? { import: 0, curtail: 0 } : D.tie, maxMW = D.plant.maxMW;
    var base = 0, ev = [], capCost = o.size == null ? (K.crf + D.electrolyzer.fomShare) * K.capexKW * 1000 : 0;
    function seg(start, len, m) { if (m > 0 && len > 0 && start < maxMW) { ev.push([start, -m]); ev.push([Math.min(maxMW, start + len), m]); } }
    periods(K, o).forEach(function (pp) {
      days.forEach(function (dy) {
        for (var t = 0; t < HOURS; t++) {
          var wt = pp.phi * dy.weight, p = dy.p[t], w = dy.w[t], V = (o.h + pp.credit) * K.k - K.wear;
          if (grid) { seg(0, maxMW, wt * (V - p - o.c - hair.import)); continue; }
          var spill = Math.max(0, w - K.C), sell = Math.min(w, K.C);
          base -= wt * (p + hair.curtail) * sell;                 // the wind sold with no electrolyzer
          seg(0, spill, wt * V);                                   // wind the connection cannot carry
          seg(spill, sell, wt * (V - p - hair.curtail));           // wind it could have sold
          seg(spill + sell, K.C, wt * (V - p - o.c - hair.import)); // power bought
        }
      });
    });
    ev.sort(function (a, b) { return a[0] - b[0]; });
    var pos = 0, F = base, slope = capCost, best = { obj: F, S: 0 };
    for (var i = 0; i < ev.length; ) {
      var x = ev[i][0]; F += slope * (x - pos); pos = x;
      if (F < best.obj - 1e-9) best = { obj: F, S: x };
      while (i < ev.length && ev[i][0] === x) { slope += ev[i][1]; i++; }
    }
    F += slope * (maxMW - pos); if (F < best.obj - 1e-9) best = { obj: F, S: maxMW };
    return best;
  }
  // An upper bound on a case's reported annual equivalent ($ a year) without an LP: the uncapped LP's optimum with no hair
  // costs (freeObj, hair: false), turned into the annual equivalent as read() reports it (minus the wind farm's own costs
  // for one plant, minus the wind farm alone for the increment). The capped LP's plan is feasible for the uncapped one, so
  // it reports no more (the test checks it on a grid of settings).
  function annualBound(Y, K, D, o) {
    var oc = {}; for (var k in o) oc[k] = o[k]; oc.hair = false; oc.tier = null;
    var b = o.boundary || "plant", f = freeObj(Y, K, D, oc), fixedCap = o.size != null ? (K.crf + D.electrolyzer.fomShare) * K.capexKW * 1000 * o.size : 0;
    var windC = K.windFomKW * 1000 * K.windMW + K.crf * K.windCapexKW * 1000 * K.windMW;
    return -(f.obj + fixedCap) - (b === "plant" ? windC : 0) - (b === "increment" ? windAlone(Y, K, o.days) : 0);
  }
  // The cases' bounds and the order to solve them in: tiers by bound, best first, then "none". A case c needs no LP when
  // it cannot be pick()'s answer, which holds in either of two cases:
  //   (a) its bound is more than TIE_USD + BOUND_GUARD below the best annual equivalent already solved (top): c cannot
  //       come within $1 a year of the best (BOUND_GUARD, $1 a year, covers the solver's rounding of objectives of a few
  //       $M), and skipping it leaves the best unchanged;
  //   (b) a case listed before c in pick()'s order is solved and reports at least c's bound (less BOUND_EPS, a cent): if c
  //       were within $1 of the best, so would that earlier case be, and the earlier one wins the tie.
  // The test checks on a grid of settings that the skips never change the answer. "none" is solved only when it could win.
  var BOUND_GUARD = 1, BOUND_EPS = 0.01;
  function bounded(Y, K, D, o, list, window) {
    list.forEach(function (c) { var oc = {}; for (var k in o) oc[k] = o[k]; oc.credit = c.credit; oc.tier = null; oc.window = window || "right"; c.ub = annualBound(Y, K, D, oc); });
    return list.filter(function (c) { return c.id !== "none"; }).sort(function (a, b) { return b.ub - a.ub; }).concat(list.filter(function (c) { return c.id === "none"; }));
  }
  // c: a case with its bound (bounded); list: the cases in pick()'s order, with R once solved; top: the best annual
  // equivalent solved so far (-Infinity before the first LP)
  function canSkip(c, list, top) {
    if (c.ub < top - TIE_USD - BOUND_GUARD) return true;
    var at = list.indexOf(c);
    return list.some(function (i, j) { return j < at && i.R && i.R.ok && i.R.annual >= c.ub - BOUND_EPS; });
  }
  // the representative days' weights in words ("9, 10 or 11")
  function weightWords(days) {
    var u = []; days.forEach(function (d) { if (u.indexOf(d.weight) < 0) u.push(d.weight); }); u.sort(function (a, b) { return a - b; });
    return u.length > 1 ? u.slice(0, -1).join(", ") + " or " + u[u.length - 1] : String(u[0]);
  }
  function eligible(D, start) { var s = D.credit.starts.filter(function (x) { return x.year === start; })[0]; return !!(s && s.ok); }

  var fm = {
    musd: function (v) { var a = Math.abs(v) / 1e6; return (v <= -0.05e6 ? "−$" : "$") + (a >= 1000 ? Math.round(a).toLocaleString("en-US") : a.toFixed(1)) + "M"; },
    usd: function (v) { return (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US"); },
    kg: function (v) { return "$" + v.toFixed(2) + "/kg"; },
    mw: function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-US") + " MW"; },
    t: function (kg) { return Math.round(kg / 1000).toLocaleString("en-US") + " t"; },
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    pct: function (v) { return Math.round(v * 100) + "%"; },
    rate: function (v) { return v.toFixed(3) + " kg CO₂/kg"; }   // operating CO2 of the counted grid power (illustrative)
  };
  var model = { HOURS: HOURS, MON: MON, crf: crf, af: af, to2025: to2025, costs: costs, capexRange: capexRange, prepare: prepare, medoids: medoids, allDays: allDays, dateOf: dateOf,
    periods: periods, build: build, read: read, money: money, windAlone: windAlone, tierCases: tierCases, pick: pick, eligible: eligible, freeObj: freeObj, annualBound: annualBound,
    bounded: bounded, canSkip: canSkip, TIE_USD: TIE_USD, BOUND_GUARD: BOUND_GUARD, BOUND_EPS: BOUND_EPS, weightWords: weightWords, sum: sum, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "m11-tea-in-models", KEY = "m11-own";
  function css() {
    if (document.getElementById("m11-css")) return;
    H("style", { id: "m11-css", text: [
      ".m11-lab .lx-stepcard{grid-template-columns:minmax(0,1fr)}.m11-lab .lx-step-act{grid-template-columns:minmax(0,1fr)}.m11-lab .lx-stepcard>*,.m11-lab .lx-step-act>*{min-width:0}",
      ".m11-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".m11-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".m11-kpi{display:grid;padding:7px 11px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:104px}",
      ".m11-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display)}.m11-kpi b{font-family:var(--lx-f-mono);font-size:16px;font-weight:600}",
      ".m11-kpi.bad b{color:var(--lx-bad)}.m11-kpi.good b{color:var(--lx-good)}",
      ".m11-formula{font-family:var(--lx-f-mono);font-size:14px;padding:9px 12px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);overflow-x:auto;white-space:nowrap}",
      ".m11-formula var{font-family:var(--lx-f-body);font-style:italic}",
      ".m11-tbl{overflow-x:auto;max-width:100%}.m11-tbl table{width:100%;border-collapse:collapse;font-size:14px}",
      ".m11-tbl th,.m11-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:right;font-weight:400}.m11-tbl th:first-child,.m11-tbl td:first-child{text-align:left}",
      ".m11-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3);vertical-align:bottom}.m11-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.m11-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".m11-tbl tr.best td{background:var(--lx-good-soft);font-weight:600}",
      ".m11-note{font-size:13.5px;color:var(--lx-ink-3);margin:0}",
      ".m11-key{margin:0;padding-left:1.1rem;display:grid;gap:2px;font-size:13.5px;color:var(--lx-ink-2)}.m11-key var{font-style:italic}",
      ".m11-law{border:1px solid var(--lx-line);border-radius:12px;padding:10px 12px;background:var(--lx-surface-2);display:grid;gap:6px}",
      ".m11-law p{margin:0;font-size:14px}.m11-law .src{font-size:12.5px;color:var(--lx-ink-3)}",
      ".m11-choice{display:grid;gap:4px}.m11-choice>span{font-size:13px;color:var(--lx-ink-3);font-family:var(--lx-f-display)}",
      ".m11-sel{font:inherit;font-size:14px;padding:5px 8px;border:1px solid var(--lx-line);border-radius:8px;background:var(--lx-surface);color:var(--lx-ink);max-width:100%}",
      /* the scene: what is inside the plant's boundary, and the money that crosses it */
      ".m11-scene{display:grid;gap:10px;margin:0 0 1rem;padding:12px;border:1px solid var(--lx-line);border-radius:14px;background:var(--lx-surface);min-width:0;overflow-wrap:anywhere}",
      ".m11-scene-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px}",
      ".m11-box{flex:1 1 260px;display:flex;flex-wrap:wrap;gap:8px;padding:10px;border:2px dashed var(--lx-accent);border-radius:14px;position:relative;align-content:flex-start;min-width:0}",
      ".m11-box>.m11-box-l{flex-basis:100%;font-size:12px;font-family:var(--lx-f-display);color:color-mix(in srgb,var(--lx-accent) 70%,var(--lx-ink));margin:-2px 0 0}",
      ".m11-out{flex:0 1 190px;display:flex;flex-direction:column;gap:8px;min-width:0}",
      ".m11-part{flex:1 1 130px;min-width:0;border:1px solid var(--lx-line);border-radius:10px;padding:7px 9px;background:var(--lx-surface-2)}",
      ".m11-part b{display:block;font-family:var(--lx-f-display);font-size:13.5px}.m11-part .v{font-size:12.5px;color:var(--lx-ink-2);font-family:var(--lx-f-mono);margin-top:2px}",
      ".m11-part.p-wind{border-left:4px solid var(--lx-wind)}.m11-part.p-ez{border-left:4px solid var(--lx-good)}.m11-part.p-grid{border-left:4px solid var(--lx-cc)}.m11-part.p-buyer{border-left:4px solid var(--lx-ink-3)}",
      ".m11-part.p-ghost{border-style:dashed}",
      ".m11-cross{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--lx-ink-2)}",
      ".m11-cross li b{font-family:var(--lx-f-mono);font-weight:600;color:var(--lx-ink)}",
      ".m11-scene-h{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;align-items:baseline}.m11-scene-h p{margin:0;min-width:0}",
      "@media (max-width:560px){.m11-tbl table{font-size:12.5px}.m11-tbl th,.m11-tbl td{padding:4px 3px}.m11-tbl .ph{display:none}.m11-box{flex-basis:100%}.m11-out{flex-basis:100%;flex-direction:row;flex-wrap:wrap}}"
    ].join("\n") }, document.head);
  }
  function kpi(host, label, value, tone) { var k = H("div", { class: "m11-kpi" + (tone ? " " + tone : "") }, host); H("small", { text: label }, k); H("b", { text: value }, k); return k; }
  function table(host, head, rows, label, best) {
    var w = H("div", { class: "m11-tbl", tabindex: "0", role: "region", "aria-label": label }, host), t = H("table", null, w), hr = H("tr", null, H("thead", null, t)), ph = head.map(function (x) { return x.charAt(0) === "~"; });
    head.forEach(function (x, i) { H("th", { scope: "col", class: ph[i] ? "ph" : "", text: x.replace(/^~/, "") }, hr); });
    var b = H("tbody", null, t); rows.forEach(function (r, j) { var tr = H("tr", { class: best === j ? "best" : "" }, b); r.forEach(function (c, i) { H(i === 0 ? "th" : "td", { scope: i === 0 ? "row" : null, class: ph[i] ? "ph" : "", text: c }, tr); }); });
    return w;
  }
  function seg(host, label, items, sel, onPick) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": label }, host), bs = [];
    items.forEach(function (it) { bs.push(H("button", { type: "button", "aria-pressed": String(it.id === sel), text: it.label, onclick: function () { bs.forEach(function (b, i) { b.setAttribute("aria-pressed", String(items[i].id === it.id)); }); onPick(it.id); } }, g)); });
    return g;
  }
  function choice(host, label) { var d = H("div", { class: "m11-choice" }, host); H("span", { text: label }, d); return d; }
  // rich text with glossary marks and **bold** (LX.rich escapes any HTML tag)
  function rb(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  LX.mount(SLUG, function (live, data, root) {
    css(); root.classList.add("m11-lab");
    // C13: lesson 13's wind farm, rate and life, as the test copies them from 13-capstone.json into this lesson's data
    var D = data.m11_tea_in_models, C13 = D.lesson13, A16 = data.a16_hydrogen_ptx, REF = D.reference, PJ = data.path || null;   // PJ: path.json, for LX.lessonRefHTML
    var Y = prepare(D, data.town, data.town_year, data.cf_targets, LX.townProfile), CX = capexRange(D), own = LX.store.get(KEY, {}) || {};
    function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    // the reader's settings, shared by every step
    var st = { h: D.hydrogen.price.def, size: D.fixedSize.def, r: C13.finance.wacc, N: C13.finance.life, cap: "mid", start: 2027, wage: true, eKey: "town", rule: "hourly", boundary: "plant", c: D.charge.def };
    function eOf(k) { return k === "cc" ? Y.ccRate : Y.rate; }
    function K() { return costs(D, C13, A16, { capexKW: CX[st.cap], r: st.r / 100, N: st.N }); }
    function base(extra) { var o = { boundary: st.boundary, h: st.h, c: st.c, rule: st.rule, e: eOf(st.eKey) }; for (var k in extra) o[k] = extra[k]; return o; }
    function creditOK() { return eligible(D, st.start); }
    function perKg(t) { return t.amount * (st.wage ? D.credit.multiplier : 1); }
    var cache = {};
    function keyOf(o, k) { return JSON.stringify([o.boundary, o.h, o.c, o.rule, o.e, o.size, o.credit, o.tier && o.tier.id, o.window, k.capexKW, k.r, k.N]); }
    // one LP: resolves to { R, r } (R null when the solve failed)
    function solve1(o) {
      var k = K(), key = keyOf(o, k);
      if (cache[key] && cache[key].R) return Promise.resolve(cache[key]);
      return LX.solver.solve(build(Y, k, D, o), { timeLimit: 10, key: "m11-" + key, label: "m11" }).then(function (r) {
        var x = { r: r, R: r.ok ? read(Y, k, D, o, r) : null, o: o, K: k }; cache[key] = x; return x;
      });
    }
    // the tier enumeration: one LP per case at most, each solve its own step with progress (onStep). Each case's bound
    // (annualBound: its LP with no cap, in closed form) orders the tiers and skips any that cannot win even at its bound
    // (canSkip); "none" is solved only if it could win. Resolves to { cases, best, solved }
    // or { failed }
    function evaluate(o, window, onStep) {
      var k0 = K(), L = tierCases(D, { wage: st.wage }, creditOK()).map(function (c) { return { id: c.id, tier: c.tier, credit: c.credit }; }), top = -Infinity, n = 0;
      var order = bounded(Y, k0, D, o, L, window);
      return order.reduce(function (pr, c) {
        return pr.then(function (bad) { if (bad) return bad;
          if (canSkip(c, L, top)) { c.skip = true; return null; }
          var oc = {}; for (var k in o) oc[k] = o[k]; oc.credit = c.credit; oc.tier = c.tier; oc.window = window || "right";
          return solve1(oc).then(function (x) { c.R = x.R; c.r = x.r;
            if (x.R) { n++; top = Math.max(top, x.R.annual); if (onStep) onStep(n, c); }
            return x.R ? null : x.r; });
        });
      }, Promise.resolve(null)).then(function (bad) {
        if (bad) return { failed: bad };
        var best = pick(L), none = L.filter(function (c) { return c.id === "none"; })[0];
        if (best && best.id === "none" && !none.R) {   // no tier makes hydrogen: "none" is that same empty plan
          var any = L.filter(function (c) { return c.R; })[0]; none.R = any.R; none.r = any.r; none.same = true; best = none;
        }
        return { cases: L, best: best, solved: n };
      });
    }
    // one line of progress per solved LP (each solve is its own step on the page)
    function progress(el) {
      return function (n, c) { el.textContent = "Solved " + n + ": " + (c.id === "none" ? "no credit" : "tier " + c.tier.label + " kg") + "…"; };
    }
    function done(ev) { var n = ev.cases.length; return "Solved " + ev.solved + " of " + n + " LP" + (n > 1 ? "s" : "") + (ev.solved < n ? "; " + (n - ev.solved) + " skipped by their bounds." : "."); }
    function caseName(c) { return c.id === "none" ? "no credit" : "the tier " + c.tier.label.charAt(0).toLowerCase() + c.tier.label.slice(1) + " kg CO₂e per kg"; }

    // ------------------------------------------------ the scene: inside the boundary, and what crosses it
    var scene = H("div", { class: "m11-scene", "aria-live": "polite" }, live);
    function drawScene(R, o) {
      scene.innerHTML = "";
      var b = (o && o.boundary) || st.boundary, B = D.boundaries.filter(function (x) { return x.id === b; })[0];
      var hd = H("div", { class: "m11-scene-h" }, scene);
      H("p", { class: "lx-eyebrow", text: "The plant's boundary: " + B.label }, hd);
      H("p", { class: "m11-note", text: R ? "Numbers: your last solved plan, a year" + (R.per.length > 1 ? " in its credit years" : "") : "Solve step 1 to fill in the numbers" }, hd);
      var row = H("div", { class: "m11-scene-row" }, scene), box = H("div", { class: "m11-box", role: "group", "aria-label": "Inside the boundary" }, row);
      H("p", { class: "m11-box-l", text: "Inside the boundary" }, box);
      var out = H("div", { class: "m11-out", role: "group", "aria-label": "Outside the boundary" }, row), a = R ? R.per[0] : null;
      function part(host, cls, name, val) { var d = H("div", { class: "m11-part " + cls.split(" ").map(function (c) { return "p-" + c; }).join(" ") }, host); H("b", { text: name }, d); if (val) H("div", { class: "v", text: val }, d); return d; }
      var windTxt = "100 MW · " + (a ? fm.mwh(a.wind) : "33.8% capacity factor");
      var ezTxt = R ? fm.mw(R.S) + " · " + fm.t(a.kg) : "size to choose";
      if (b === "plant") { part(box, "wind", "Wind farm", windTxt); part(box, "grid", "50 MW connection", a ? "sold " + fm.mwh(a.exp) + " · bought " + fm.mwh(a.imp) : "sells and buys"); part(box, "ez", "Electrolyzer", ezTxt); }
      else if (b === "increment") { part(box, "ez", "Electrolyzer", ezTxt); part(out, "wind ghost", "Wind farm and connection", "counted as with minus without"); }
      else { part(box, "ez", "Electrolyzer, at the buyer", ezTxt); part(out, "wind", "Wind farm", "sells alone; its certificates go to the electrolyzer"); }
      part(out, "grid", "Prairie Town's grid", b === "grid" ? "every MWh pays the charge" : "prices $0, $40, $100");
      part(out, "buyer", "Hydrogen buyer", "$" + st.h.toFixed(2) + " per kg");
      if (R) {
        var ul = H("ul", { class: "m11-cross", "aria-label": "Money crossing the boundary, a year" }, scene);
        [["Hydrogen sold", a.revenue], ["Credit", a.creditUSD], [b === "increment" ? "Power sales lost" : "Power sold", b === "increment" ? a.salesB : b === "plant" ? a.sales : 0], ["Power bought", -a.bought]].forEach(function (x) {
          if (b === "grid" && x[0] === "Power sold") return;
          H("li", { html: LX.esc(x[0]) + " <b>" + LX.esc(fm.musd(x[1])) + "</b>" }, ul);
        });
        H("li", { html: "Up front <b>" + LX.esc(fm.musd(-R.capex0)) + "</b>" }, ul);
      }
    }
    drawScene(null);

    var DAYTXT = ["calm", "middle", "windy"];
    function dayLabel(dy) { return dy.month + ", " + DAYTXT[dy.third] + " third (" + new Date(dy.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) + ")"; }
    function dayPlot(host, x, di) {
      var dy = Y.days[di], k = x.K, o = x.o, v = function (n) { var a = x.r.values[n]; return a == null ? 0 : Math.max(0, a); }, s = function (t) { return "1_" + di + "_" + t; };
      var ez = [], imp = [], exp = [], w = dy.w.slice();
      for (var t = 0; t < HOURS; t++) { imp.push(v("imp" + s(t))); exp.push(v("exp" + s(t))); ez.push(v("imp" + s(t)) + v("dw" + s(t))); }
      var P = LX.Plot(host, { box: true, text: "Text version of the chart" });
      var hh = function (t) { return (t < 10 ? "0" : "") + t + ":00"; };
      P.render({ x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]] }, y: { min: 0, max: 100, step: 25, fmt: function (q) { return String(q); }, unit: "MW" },
        lines: [{ values: w, x0: 0.5, color: "var(--lx-wind)", area: 0.12, width: 1.6, step: 1 }, { values: ez, x0: 0.5, color: "var(--lx-good)", step: 1 }, { values: imp, x0: 0.5, color: "var(--lx-cc)", dash: "5 3", step: 1 }, { values: exp, x0: 0.5, color: "var(--lx-ink-3)", dash: "2 3", step: 1 }],
        legend: [{ label: "Wind", color: "var(--lx-wind)" }, { label: "Electrolyzer", color: "var(--lx-good)" }, { label: "Bought", color: "var(--lx-cc)", dash: "5 3" }, { label: "Sold", color: "var(--lx-ink-3)", dash: "2 3" }],
        tip: function (q) { var t = Math.min(23, Math.max(0, Math.floor(q))); return "<div><b>" + hh(t) + "–" + hh(t + 1) + "</b> · price $" + dy.p[t] + "/MWh</div><div>Wind " + w[t].toFixed(1) + " MW · electrolyzer " + ez[t].toFixed(1) + " · bought " + imp[t].toFixed(1) + " · sold " + exp[t].toFixed(1) + "</div>"; },
        aria: "One plan's hours on " + dayLabel(dy) + ": wind, electrolyzer, power bought and sold",
        text: { head: ["Hour", "Price ($/MWh)", "Wind (MW)", "Electrolyzer", "Bought", "Sold"], rows: w.map(function (q, t) { return [hh(t), String(dy.p[t]), q.toFixed(1), ez[t].toFixed(1), imp[t].toFixed(1), exp[t].toFixed(1)]; }), note: "One best plan: other plans of the same value can run some hours differently." } });
      return P;
    }
    var runs = [];   // the reader's boundary runs (step 8)

    var steps = [
      // 1 the operating model
      { text: "The plant: 100 MW of new wind behind a 50 MW [[point-of-common-coupling|grid connection]], and an [[electrolyzer|electrolyzer]] of a size you set, whose hydrogen a buyer takes at a set price. Solve its year, hour by hour.",
        build: function (act, api) {
          var c = H("div", { class: "lx-ctls" }, act);
          LX.Slider(c, { label: "Hydrogen price", min: D.hydrogen.price.min, max: D.hydrogen.price.max, step: D.hydrogen.price.step, value: st.h, color: "var(--lx-good)", fmt: function (q) { return "$" + q.toFixed(2) + " per kg"; }, onChange: function (q) { st.h = q; } });
          LX.Slider(c, { label: "Electrolyzer size (given)", min: D.fixedSize.min, max: D.fixedSize.max, step: D.fixedSize.step, value: st.size, color: "var(--lx-good)", fmt: function (q) { return q + " MW"; }, onChange: function (q) { st.size = q; } });
          H("p", { class: "m11-note", html: LX.rich("The year: 36 real 2025 days, three per month (calm, middle and windy thirds), each weighted by the days it stands for. Power bought pays Prairie Town's price plus a $" + st.c + " per MWh delivery charge (illustrative).") }, act);
          var row = H("div", { class: "m11-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the year" }, row), stt = LX.SolverStatus(row), out = H("div", { "aria-live": "polite" }, act), ph = H("div", null, act), last = null;
          go.addEventListener("click", LX.SolveStep.action({ api: api, st: stt, host: act, go: go, cls: "m11-fail", job: function () { var o = base({ boundary: "plant", size: st.size }); return solve1(o).then(function (x) { last = x; return x.R ? null : x.r; }); },
            show: function () {
              var R = last.R, a = R.per[0]; stt.set(last.r); out.innerHTML = ""; var k = H("div", { class: "m11-kpis" }, out);
              kpi(k, "Hydrogen a year", fm.t(a.kg)); kpi(k, "Capacity utilization", fm.pct(R.util)); kpi(k, "Power bought", fm.mwh(a.imp)); kpi(k, "Wind curtailed", fm.mwh(a.cur));
              drawScene(R, last.o);
              ph.innerHTML = ""; var sel = H("select", { class: "m11-sel", "aria-label": "Day to show" }, H("label", { class: "m11-choice" }, ph));
              Y.days.forEach(function (dy, i) { H("option", { value: String(i), text: dayLabel(dy) }, sel); }); sel.value = "8";
              var pl = H("div", null, ph); dayPlot(pl, last, 8);
              sel.addEventListener("change", function () { pl.innerHTML = ""; dayPlot(pl, last, +sel.value); });
              remember("s1", { S: R.S, kg: a.kg });
              api.done(); api.saw("[[capacity-utilization|Capacity utilization]] " + fm.pct(R.util) + ": the MWh it used ÷ (size × 8,760 h); half power all year would be 50%. Wind comes first, then power bought when a kilogram earns more than power and charge. **An operating model: hours given a size.**");
            } }));
        } },
      // 2 annualize capital
      { text: "Building costs money once, up front; the hours earn every year. The [[capital-recovery-factor|capital recovery factor]] turns the up-front cost into an equal yearly amount over the life, at a [[real-rate|real]] rate.",
        build: function (act, api) {
          H("div", { class: "m11-formula", role: "math", "aria-label": "CRF equals r divided by 1 minus 1 plus r to the power minus N", html: "<var>CRF</var> = <var>r</var> ÷ (1 − (1 + <var>r</var>)<sup>−<var>N</var></sup>)" }, act);
          var key = H("ul", { class: "m11-key" }, act);
          [["r", "the real discount rate, a year (lesson 13's 4% by default)"], ["N", "the life in years (DOE's 30-year electrolyzer system life)"]].forEach(function (x) { H("li", { html: "<var>" + x[0] + "</var>: " + LX.esc(x[1]) }, key); });
          var c = H("div", { class: "lx-ctls" }, act), out = H("div", { "aria-live": "polite" }, act), moved = false;
          function show() {
            var k = K(), up = k.capexKW * 1000 * st.size; out.innerHTML = ""; var g = H("div", { class: "m11-kpis" }, out);
            kpi(g, "CRF", k.crf.toFixed(4)); kpi(g, "Up front (one time)", fm.musd(up)); kpi(g, "Annual equivalent", fm.musd(up * k.crf) + " a year"); kpi(g, "Fixed upkeep", fm.musd(k.fomKW * 1000 * st.size) + " a year");
            return { up: up, k: k };
          }
          LX.Slider(c, { label: "Real discount rate", min: D.rate.min, max: D.rate.max, step: D.rate.step, value: st.r, color: "var(--lx-tier-3)", fmt: function (q) { return q.toFixed(1) + "%"; }, onChange: function (q) { st.r = q; done(); } });
          LX.Slider(c, { label: "Life", min: D.life.min, max: D.life.max, step: D.life.step, value: st.N, color: "var(--lx-tier-3)", fmt: function (q) { return q + " years"; }, onChange: function (q) { st.N = q; done(); } });
          var cs = choice(act, "Electrolyzer installed cost (DOE's three cases, 2025 dollars)");
          seg(cs, "Electrolyzer installed cost", ["low", "mid", "high"].map(function (id) { return { id: id, label: "$" + Math.round(CX[id]).toLocaleString("en-US") + "/kW" }; }), st.cap, function (id) { st.cap = id; done(); });
          function done() {
            var x = show(); moved = true;
            api.done(); remember("s2", { crf: x.k.crf, up: x.up });
            api.saw("For " + st.size + " MW: " + fm.musd(x.up) + " up front, or " + fm.musd(x.up * x.k.crf) + " a year for " + st.N + " years at " + st.r.toFixed(1) + "% real (the annual equivalent). Fixed upkeep adds " + fm.musd(x.k.fomKW * 1000 * st.size) + " a year. **Never add the two kinds of number.**");
          }
          show(); if (!moved) H("p", { class: "m11-note", text: "Move a slider or pick a cost to go on." }, act);
        } },
      // 3 capital in the goal: the model sizes the electrolyzer
      { text: "Now put that annual capital in the LP's goal and let the solver choose the size too: each MW costs its capital recovery and upkeep every year, and earns what its hours earn.",
        build: function (act, api) {
          var out, go, fixedX = null, freeX = null;
          var po = { id: "m11-size", fresh: true, q: "Against your " + st.size + " MW, the model will build…", answer: null, feedback: {},
            options: [{ value: "less", label: "less" }, { value: "same", label: "about the same" }, { value: "more", label: "more" }], onPick: function () { if (go) go.click(); } };
          var pr = LX.Predict(act, po);
          var row = H("div", { class: "m11-row" }, act); go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve: size and hours together" }, row);
          var stt = LX.SolverStatus(row); out = H("div", { "aria-live": "polite" }, act);
          go.addEventListener("click", LX.SolveStep.action({ api: api, st: stt, host: act, go: go, cls: "m11-fail",
            job: function () { return solve1(base({ boundary: "plant", size: st.size })).then(function (x) { fixedX = x; if (!x.R) return x.r; return solve1(base({ boundary: "plant" })).then(function (y) { freeX = y; return y.R ? null : y.r; }); }); },
            show: function () {
              var A = fixedX.R, B = freeX.R; stt.set(freeX.r); out.innerHTML = "";
              table(out, ["Plan", "Size", "Utilization", "Value a year (annual equivalent)", "~Cost per kg"], [["Your size", fm.mw(A.S), fm.pct(A.util), fm.musd(A.annual), A.lcoh == null ? "–" : fm.kg(A.lcoh)], ["The model's size", fm.mw(B.S), fm.pct(B.util), fm.musd(B.annual), B.lcoh == null ? "–" : fm.kg(B.lcoh)]], "Your size against the model's", 1);
              H("p", { class: "m11-note", html: LX.rich("Value a year: the plan's [[net-present-value|NPV]] spread evenly over its life, wind farm included (step 4). Cost per kg: the [[lcoh|levelized cost]] before any credit.") }, out);
              var d = B.S - A.S, word = Math.abs(d) < 0.5 ? "about the same as" : d < 0 ? "less than" : "more than";
              po.answer = Math.abs(d) < 0.5 ? "same" : d < 0 ? "less" : "more"; pr.reveal("The model built " + fm.mw(B.S) + ": " + word + " your " + fm.mw(A.S) + ".");
              drawScene(B, freeX.o); remember("s3", { S: B.S, annual: B.annual, lcoh: B.lcoh });
              var lc = (A.lcoh != null && B.lcoh != null) ? (B.lcoh > A.lcoh + 0.005 ? " Its cost per kg is higher, " + fm.kg(B.lcoh) + " against " + fm.kg(A.lcoh) + ", yet the plan is worth more: **the LP maximizes value, not the cost per kg** (CF2)." : " **The LP maximizes the plan's value; the cost per kg is a result, not the goal.**") : B.S < 0.05 ? " At this price no electrolyzer pays for itself." : "";
              api.done(); api.saw("It builds " + fm.mw(B.S) + (B.S > 0.05 ? ", at " + fm.pct(B.util) + " capacity utilization" : "") + "; value " + fm.musd(B.annual) + " a year against " + fm.musd(A.annual) + " at your size." + lc);
            } }));
        } },
      // 4 lifetime cash flows
      { text: "From one year to the whole life: the build in year 0, then the same operating year again and again. Discount each year at your rate and add them up: the [[net-present-value|net present value]].",
        build: function (act, api) {
          var row = H("div", { class: "m11-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Lay out the cash flows" }, row), stt = LX.SolverStatus(row), out = H("div", { "aria-live": "polite" }, act), x = null;
          go.addEventListener("click", LX.SolveStep.action({ api: api, st: stt, host: act, go: go, cls: "m11-fail", job: function () { return solve1(base({ boundary: "plant" })).then(function (y) { x = y; return y.R ? null : y.r; }); },
            show: function () { stt.set(x.r); out.innerHTML = ""; cashChart(out, x.R, x.K, "The model's plan, wind farm and electrolyzer"); var k = H("div", { class: "m11-kpis" }, out);
              kpi(k, "NPV", fm.musd(x.R.npv), x.R.npv < 0 ? "bad" : "good"); kpi(k, "Annual equivalent × annuity factor", fm.musd(x.R.annual) + " × " + x.K.af.toFixed(2));
              H("p", { class: "m11-note", html: rb("The [[annuity-factor|annuity factor]], " + x.K.af.toFixed(2) + " here, is what $1 a year for " + st.N + " years is worth today: 1 ÷ CRF.") }, out);
              remember("s4", { npv: x.R.npv }); drawScene(x.R, x.o);
              api.done(); api.saw("NPV " + fm.musd(x.R.npv) + ": " + (x.R.npv < 0 ? "at these settings the plant, wind farm included, does not earn back its cost at " + st.r.toFixed(1) + "% real." : "the plant earns back its cost at " + st.r.toFixed(1) + "% real, with " + fm.musd(x.R.npv) + " to spare.") + " **When every year is alike, the LP's annual goal and the NPV rank plans the same way.**");
            } }));
        } },
      // 5 the credit under current law
      { text: "A [[production-credit|production credit]] pays per kilogram. Read the U.S. hydrogen credit as the IRS states it today, then say when your plant begins construction and whether it meets the wage rules.",
        build: function (act, api) {
          var C = D.credit, law = H("div", { class: "m11-law" }, act), picked = {};
          H("p", { html: rb("**Who can still claim it.** A facility whose construction begins before 1 January 2028; Public Law 119-21 (2025) ended the credit for later starts.") }, law);
          H("p", { html: rb("**For how long.** 10 years from the day the facility is [[placed-in-service|placed in service]].") }, law);
          H("p", { html: rb("**What qualifies.** Hydrogen with at most 4 kg [[co2e|CO₂e]] per kg, [[well-to-gate|well to gate]], from DOE's 45VH2-GREET model. The cleaner, the larger the share:") }, law);
          table(law, ["kg CO₂e per kg", "Share", "2025 amount", "With the wage rules"], C.tiers.map(function (t) { return [t.label, (t.pct * 100).toFixed(1).replace(".0", "") + "%", "$" + t.amount.toFixed(3), "$" + (t.amount * C.multiplier).toFixed(3)]; }), "The credit's tiers in 2025");
          H("p", { class: "src", html: "Source: IRS, <a href=\"" + D.sources["irs-i7210"].url + "\">Instructions for Form 7210 (2025)</a>, page updated 30 April 2026, read 6 November 2026. The amount is adjusted for inflation each year; this lesson holds the 2025 amount in 2025 dollars." }, law);
          var c1 = choice(act, "Construction begins in"), c2 = choice(act, "Prevailing wage and apprenticeship rules"), out = H("div", { "aria-live": "polite" }, act);
          seg(c1, "Year construction begins", C.starts.map(function (s) { return { id: s.year, label: String(s.year) }; }), null, function (y) { st.start = y; picked.a = 1; upd(); });
          seg(c2, "Wage and apprenticeship rules", [{ id: true, label: "met (× 5)" }, { id: false, label: "not met" }], null, function (v) { st.wage = v; picked.b = 1; upd(); });
          H("p", { class: "m11-note", html: rb("[[prevailing-wage-apprenticeship|Wage rules]]: those who build or repair the facility earn at least the local prevailing wage, and registered apprentices work a set number of hours. Meeting both multiplies the credit by 5.") }, c2);
          function upd() {
            out.innerHTML = ""; var k = H("div", { class: "m11-kpis" }, out), ok = creditOK(), top = perKg(C.tiers[0]);
            kpi(k, "Top tier, if its emissions qualify", ok ? "$" + top.toFixed(3) + "/kg" : "none", ok ? "good" : "bad"); kpi(k, "Years", ok ? "1 to " + C.years : "–");
            if (picked.a && picked.b) { api.done(); remember("s5", { ok: ok, top: top });
              api.saw(ok ? "The construction-date condition is met. The credit then depends on the plant's emissions tier (steps 6 and 7): up to $" + top.toFixed(2) + " per kg in the top tier, for years 1 to " + C.years + " of its " + st.N + "." : "Construction in " + st.start + " is too late: no credit. The next steps then run without one."); }
          }
          H("p", { class: "m11-note", text: "Pick both to go on." }, act);
        } },
      // 6 the credit's ten years inside the model
      { text: "Put the credit in the LP for its own ten years: two copies of the year share one size, and only the first earns the credit. Then compare it with a credit counted in every year.",
        build: function (act, api) {
          var row = H("div", { class: "m11-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve: ten years, and all years" }, row), stt = LX.SolverStatus(row), out = H("div", { "aria-live": "polite" }, act), A = null, B = null;
          go.addEventListener("click", LX.SolveStep.action({ api: api, st: stt, host: act, go: go, cls: "m11-fail",
            job: function () {
              if (!creditOK()) return solve1(base({ boundary: "plant" })).then(function (x) { A = B = x; return x.R ? null : x.r; });
              var t = D.credit.tiers[0], o = base({ boundary: "plant", rule: "hourly", credit: perKg(t), tier: t });
              return solve1(Object.assign({}, o, { window: "right" })).then(function (x) { A = x; if (!x.R) return x.r; return solve1(Object.assign({}, o, { window: "all" })).then(function (y) { B = y; return y.R ? null : y.r; }); });
            },
            show: function () {
              stt.set(A.r); out.innerHTML = "";
              if (!creditOK()) { H("p", { class: "m11-note", text: "No credit applies (construction in " + st.start + "), so both runs are the plan of step 4: " + fm.mw(A.R.S) + ", NPV " + fm.musd(A.R.npv) + "." }, out); api.done(); api.saw("Without a credit there is nothing to place in time. Pick 2026 or 2027 in step 5 to see the difference."); return; }
              var k = A.K, phi = af(k.r, D.credit.years) / k.af, kp = perKg(D.credit.tiers[0]), share = A.R.creditLev / kp, mkg = function (v) { return (v / 1e6).toFixed(2) + " million kg"; };
              H("p", { class: "m11-note", text: "Both runs claim the top tier: in the credit years, the counted grid CO₂ (operating only, illustrative) stays under 0.45 kg per kg." }, out);
              H("p", { class: "m11-note", text: "The first copy carries " + fm.pct(phi) + " of the life's discounted years: AF(" + st.r.toFixed(1) + "%, 10) ÷ AF(" + st.r.toFixed(1) + "%, " + st.N + ") = " + af(k.r, D.credit.years).toFixed(2) + " ÷ " + k.af.toFixed(2) + "." }, out);
              if (A.R.per.length > 1) H("p", { class: "m11-note", text: "It makes " + mkg(A.R.per[0].kg) + " a year under the cap, " + mkg(A.R.per[1].kg) + " after the credit ends. So the credit years hold " + (share * 100).toFixed(1) + "% of the discounted kilograms: $" + kp.toFixed(3) + " × " + share.toFixed(3) + " ≈ " + fm.kg(A.R.creditLev) + " over the life." }, out);
              table(out, ["Credit counted", "Size", "Hydrogen a year", "NPV", "Credit per kg over the life"], [["Its 10 years (right)", fm.mw(A.R.S), fm.t(A.R.kg), fm.musd(A.R.npv), fm.kg(A.R.creditLev)], ["All " + st.N + " years (wrong)", fm.mw(B.R.S), fm.t(B.R.kg), fm.musd(B.R.npv), fm.kg(B.R.creditLev)]], "The credit in its own years against in every year", 0);
              cashChart(out, A.R, A.K, "Its 10 years: the credit stops after year 10");
              drawScene(A.R, A.o); remember("s6", { npv: A.R.npv, wrong: B.R.npv, lev: A.R.creditLev });
              api.done(); api.saw("Counted in its own years the credit is worth " + fm.kg(A.R.creditLev) + " over the life, not $" + perKg(D.credit.tiers[0]).toFixed(2) + ". Counting it every year " + (B.R.S > A.R.S + 0.05 ? "builds " + fm.mw(B.R.S - A.R.S) + " more and " : "") + "overstates the NPV by " + fm.musd(B.R.npv - A.R.npv) + ". **Write out the years before you annualize.**");
            } }));
        } },
      // 7 tiers: one LP per step
      { text: "The tier depends on the grid power you count. A step rule cannot sit in one LP, so solve one LP per tier, each capping the counted CO₂ per kg, and one with no credit. Keep the best.",
        build: function (act, api) {
          var c1 = choice(act, "The grid's CO₂ rate counted for power bought");
          seg(c1, "Grid CO₂ rate", D.grid.presets.map(function (g) { return { id: g.id, label: g.label + ": " + eOf(g.id).toFixed(3) + " t/MWh" }; }), st.eKey, function (id) { st.eKey = id; });
          H("p", { class: "m11-note", html: rb("Counting rule: [[hourly-matching|hourly matching]], the rule from 2030. Operating CO₂ only: the rules' life-cycle grid rate is higher (simplified).") }, act);
          var row = H("div", { class: "m11-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the tiers" }, row), stt = LX.SolverStatus(row), prog = H("p", { class: "m11-note", "aria-live": "polite" }, act), out = H("div", { "aria-live": "polite" }, act), ev = null;
          go.addEventListener("click", LX.SolveStep.action({ api: api, st: stt, host: act, go: go, cls: "m11-fail",
            job: function () { prog.textContent = ""; return evaluate(base({ boundary: "plant", rule: "hourly" }), "right", progress(prog)).then(function (e) { ev = e; return e.failed || null; }); },
            show: function () {
              stt.set(ev.best.r); prog.textContent = done(ev); out.innerHTML = ""; var L = ev.cases, bi = L.indexOf(ev.best);
              table(out, ["Case", "Credit per kg", "Size", "~Counted grid CO₂ per kg", "Value a year"], L.map(function (c) {
                var name = c.id === "none" ? "No credit" : c.tier.label + " kg";
                if (!c.R || c.same) return [name, c.credit ? "$" + c.credit.toFixed(3) : "–", c.same ? fm.mw(c.R.S) : "–", "–", c.same ? fm.musd(c.R.annual) : "skipped: bound"];
                return [name, c.credit ? "$" + c.credit.toFixed(3) : "–", fm.mw(c.R.S), c.R.kg > 0 ? fm.rate(c.R.rate) : "–", fm.musd(c.R.annual)]; }), "One LP per tier", bi);
              H("p", { class: "m11-note", text: "Best plan highlighted: the largest value, or the first row listed within $1 a year of it. Each cap sits 0.001 under its 'less than' limit." }, out);
              if (ev.solved < L.length) H("p", { class: "m11-note", html: "<b>Bounding.</b> With no cap, a case's hours solve in a few lines: that bounds its value. A case that cannot win even at its bound needs no LP: " + (L.length - ev.solved) + " of " + L.length + " skipped." }, out);
              drawScene(ev.best.R, null); remember("s7", { best: ev.best.id });
              var b = ev.best, why = b.id === "none" ? (L.length === 1 ? "No credit applies, so one LP is all there is." : "Claiming any tier costs more than it pays: the grid power it rules out is worth more.") : b.id === "t1" ? "The top tier wins: the grid power it rules out is worth less than the larger credit." : "A lower tier wins: buying more grid power is worth more than the larger credit.";
              api.done(); api.saw("Best: " + caseName(b) + ": " + fm.mw(b.R.S) + ", " + fm.musd(b.R.annual) + " a year. " + why + " **A step rule is a set of LPs, one per step.**");
            } }));
        } },
      // 8 move the boundary
      { text: "Move the boundary: what belongs to the plant, and what to the grid? Change one thing at a time, solve, and watch the conclusion in the table.",
        build: function (act, api) {
          var c1 = choice(act, "The plant's boundary"), c2 = choice(act, "Bought power counts as clean with"), c = H("div", { class: "lx-ctls" }, act);
          seg(c1, "Boundary", D.boundaries.map(function (b) { return { id: b.id, label: b.label }; }), st.boundary, function (id) { st.boundary = id; note(); });
          H("p", { class: "m11-note", html: rb("**Increment**: the electrolyzer's value against keeping the wind farm alone, an [[incremental-analysis|incremental analysis]].") }, c1);
          seg(c2, "Counting rule", D.rules.map(function (r) { return { id: r.id, label: r.label }; }), st.rule, function (id) { st.rule = id; note(); });
          LX.Slider(c, { label: "Delivery charge on power bought", min: D.charge.min, max: D.charge.max, step: D.charge.step, value: st.c, color: "var(--lx-cc)", fmt: function (q) { return "$" + q + " per MWh"; }, onChange: function (q) { st.c = q; } });
          var nt = H("p", { class: "m11-note" }, act);
          function note() { var b = D.boundaries.filter(function (x) { return x.id === st.boundary; })[0], r = D.rules.filter(function (x) { return x.id === st.rule; })[0]; nt.textContent = (b.note ? b.note + " " : "") + r.note; drawScene(null, { boundary: st.boundary }); }
          note();
          var row = H("div", { class: "m11-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve this boundary" }, row), stt = LX.SolverStatus(row), prog = H("p", { class: "m11-note", "aria-live": "polite" }, act), out = H("div", { "aria-live": "polite" }, act), ev = null, o = null;
          if (PJ && LX.lessonRefHTML) H("p", { class: "m11-note", html: "Case file " + LX.lessonRefHTML(PJ, "CF5") + ": where should a cogeneration study's boundary be drawn?" }, act);
          go.addEventListener("click", LX.SolveStep.action({ api: api, st: stt, host: act, go: go, cls: "m11-fail",
            job: function () { o = base({}); prog.textContent = ""; return evaluate(o, "right", progress(prog)).then(function (e) { ev = e; return e.failed || null; }); },
            show: function () {
              var b = ev.best, R = b.R; stt.set(b.r); prog.textContent = done(ev); drawScene(R, o);
              var lab = D.boundaries.filter(function (x) { return x.id === o.boundary; })[0].short + ", " + o.rule + ", $" + o.c;
              runs = runs.filter(function (q) { return q.lab !== lab; }); runs.push({ lab: lab, R: R, best: b }); if (runs.length > 6) runs.shift();
              out.innerHTML = "";
              table(out, ["Boundary, rule, charge", "Credit claimed", "Size", "NPV", "~Cost per kg"], runs.map(function (q) { return [q.lab, q.best.id === "none" ? "none" : q.best.tier.label + " kg", fm.mw(q.R.S), fm.musd(q.R.npv), q.R.lcoh == null ? "–" : fm.kg(q.R.lcoh)]; }), "Your boundary runs", runs.length - 1);
              remember("s8", runs.map(function (q) { return { lab: q.lab, npv: q.R.npv, S: q.R.S }; }));
              var prev = runs.length > 1 ? runs[runs.length - 2] : null, msg = "This boundary: " + (R.S > 0.05 ? fm.mw(R.S) + ", NPV " + fm.musd(R.npv) + (R.lcoh != null ? ", " + fm.kg(R.lcoh) : "") : "no electrolyzer pays for itself") + ".";
              if (prev) msg += " Against your last run: NPV " + (R.npv >= prev.R.npv ? "+" : "−") + fm.musd(Math.abs(R.npv - prev.R.npv)).replace(/^[−$]+/, "$") + ", size " + (R.S >= prev.R.S ? "+" : "−") + fm.mw(Math.abs(R.S - prev.R.S)) + ".";
              if (runs.length >= 2) { api.done(); api.saw(msg + " **The boundary is part of the answer: state it with every number.**"); }
              else H("p", { class: "m11-note", text: msg + " Now change the boundary, the rule or the charge, and solve again." }, out);
            } }));
        } },
      // 9 formulate it
      { text: "You built a techno-economic analysis inside an LP: annual capital in the goal, hours that earn, a credit in its own years, a tier as a set of LPs, and a boundary you stated.",
        free: true,
        build: function (act) {
          H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "The model, symbol by symbol" + LX.icon("arrow") }, act);
          if (PJ && LX.lessonRefHTML) H("p", { class: "m11-note", html: "Case file " + LX.lessonRefHTML(PJ, "CF4") + " (hydrogen at existing plants): what an hourly dispatch model and a lifetime cash flow each add, when the plant's own capital is already spent." }, act);
          LX.progress.done(SLUG);
        } }
    ];
    // the year-by-year cash flows (real 2025 dollars) with the running discounted total
    function cashChart(host, R, k, label) {
      var N = R.flows.length - 1, cum = [], s = 0, top = 0, bot = 0;
      R.flows.forEach(function (f, y) { s += f * Math.pow(1 + k.r, -y); cum.push(s / 1e6); top = Math.max(top, f / 1e6, s / 1e6); bot = Math.min(bot, f / 1e6, s / 1e6); });
      var step = top - bot > 400 ? 100 : top - bot > 160 ? 50 : 25, ymin = Math.floor(bot / step) * step, ymax = Math.ceil(top / step) * step || step;
      var P = LX.Plot(host, { box: true, text: "Text version of the chart" });
      P.render({ x: { min: -0.5, max: N + 0.5, ticks: [[0, "0"], [10, "10"], [20, "20"], [N, String(N)]].filter(function (t, i, a) { return t[0] <= N && a.findIndex(function (u) { return u[0] === t[0]; }) === i; }) },
        y: { min: ymin, max: ymax, step: step, fmt: function (q) { return (q < 0 ? "−" : "") + "$" + Math.abs(q); }, unit: "$M", zero: true },
        bars: R.flows.map(function (f, y) { var v = f / 1e6; return { x0: y - 0.35, x1: y + 0.35, y0: Math.min(0, v), y1: Math.max(0, v), color: v < 0 ? "var(--lx-bad)" : "var(--lx-good)", op: 0.75 }; }),
        lines: [{ pts: cum.map(function (c, y) { return [y, c]; }), color: "var(--lx-ink)", width: 2 }],
        legend: [{ label: "Cash flow in the year", color: "var(--lx-good)" }, { label: "Running total, discounted", color: "var(--lx-ink)" }],
        tip: function (q) { var y = Math.min(N, Math.max(0, Math.round(q))); return "<div><b>Year " + y + "</b></div><div>Cash flow " + fm.musd(R.flows[y]) + " · running discounted total " + fm.musd(cum[y] * 1e6) + "</div>"; },
        aria: label + ": cash flow each year and the running discounted total",
        text: { head: ["Year", "Cash flow", "Running total, discounted"], rows: R.flows.map(function (f, y) { return [String(y), fm.musd(f), fm.musd(cum[y] * 1e6)]; }), note: "Real 2025 dollars. Year 0 is the build; the last running total is the NPV." } });
      return P;
    }
    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "m11-steps", steps: steps, onStep: function (i) { if (i === 0) { try { LX.solver.preload(); } catch (e) { /* the first solve loads it */ } } } });
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 7 : m ? +m[1] : 0;
      if (!n) return null;
      cards.go(Math.min(steps.length, n) - 1);
      var act = cardsHost.querySelector(".lx-step-act");
      if (n === 3) { var c = act && act.querySelectorAll(".lx-choice"); if (c && c[0]) c[0].click(); }
      else if (n === 5) { var bs = act && act.querySelectorAll(".lx-seg button"); if (bs && bs[1]) { bs[1].click(); bs[3].click(); } }
      else { var g = act && act.querySelector(".m11-row .lx-btn"); if (g) g.click(); }
      return { view: state };
    }, cards);
    root.lxLesson = { model: model, Y: Y, st: st, cache: cache, cards: cards, evaluate: evaluate };
    explain(D, Y, REF);
  });

  // ---------------------------------------------------------------- explain layer: boundary box, equation card, table
  function explain(D, Y, R) {
    var x = document.getElementById("m11-explain"); if (!x || !R) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var d = R.defaults;
    LX.Boundary(H("div", { class: "lx-xcard" }, x), {
      title: "Where this answer holds", lede: "Scope, assumptions, jurisdiction and date of the lesson's plant.",
      holds: ["Prairie Town's prices ($0, $40, $100 per MWh) and the plant takes them without moving them;", "36 real 2025 days stand for the year: the test re-runs the default plans on all 8,760 hours (hydrogen within " + R.fullYear.maxKgGapPct + "%, NPV within $" + R.fullYear.maxNpvGapM + "M);", "every dollar is a real 2025 dollar, at one real rate, for one life;", "the U.S. federal credit (section 45V) as the IRS states it for 2025, read 6 November 2026; one counting rule for all ten credit years;", "perfect foresight of every hour and price."],
      leaves: ["taxes, depreciation, debt and how the credit is claimed (elective pay, transfers);", "compression, storage and delivery of the hydrogen, and water;", "the region's life-cycle grid rate from 45VH2-GREET (here: operating CO₂ only);", "stack wear by hours at any load (here: per MWh), and output that falls with age;", "uncertainty in prices, wind and the rules (M7, M8)."],
      source: "Costs: DOE Hydrogen Program Record 24005 (electrolyzer, 2022 dollars, converted with BEA's GDP deflator) and lesson 13 (wind farm, rate, life). Credit: IRS, Instructions for Form 7210 (2025); T.D. 10023."
    });
    var sym = LX.EquationCard.sym;
    LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "The plant's LP, symbol by symbol", lede: "One LP for the whole life, in annual-equivalent dollars. Tap a symbol: what it means, its unit and its value at the lesson's defaults.", dense: true, label: "The plant's linear program; each symbol is a button",
      fields: [{ key: "you", label: "At the defaults" }, { key: "code", label: "In code", code: true }],
      rows: [
        { html: "min (" + sym("crf", "<var>CRF</var>") + " + " + sym("fom", "<var>f</var>") + ") " + sym("capex", "<var>c</var>") + " " + sym("S", "<var>S</var>") + " + Σ<sub><var>p</var></sub> " + sym("phi", "<var>φ</var><sub><var>p</var></sub>") + " Σ<sub><var>d</var>,<var>t</var></sub> " + sym("wd", "<var>n</var><sub><var>d</var></sub>") + " [(" + sym("p", "<var>p</var><sub><var>t</var></sub>") + " + " + sym("ch", "<var>q</var>") + ") " + sym("imp", "<var>imp</var>") + " − <var>p</var><sub><var>t</var></sub> " + sym("exp", "<var>exp</var>") + " + (" + sym("wear", "<var>v</var>") + " − (" + sym("h", "<var>h</var>") + " + " + sym("cr", "<var>κ</var><sub><var>p</var></sub>") + ") " + sym("k", "<var>k</var>") + ") " + sym("ez", "<var>ez</var>") + "]", tag: "goal", say: "Minimise the annual equivalent net cost: capital recovery and upkeep of the size, plus each period's weighted hours of power bought and sold, stack wear, hydrogen sales and the credit." },
        { html: sym("dw", "<var>dw</var>") + " + <var>exp</var> ≤ " + sym("w", "<var>w</var><sub><var>t</var></sub>") + ", &nbsp; <var>ez</var> = <var>dw</var> + <var>imp</var> ≤ <var>S</var>, &nbsp; <var>exp</var>, <var>imp</var> ≤ 50", tag: "hours", say: "Wind goes to the electrolyzer or is sold, the rest curtailed; the electrolyzer takes wind and bought power up to its size; the connection carries at most 50 megawatts each way." },
        { html: "<var>dw</var>, <var>exp</var>, <var>imp</var>, <var>u</var> ≥ 0, &nbsp; 0 ≤ <var>S</var> ≤ 100", tag: "bounds", say: "Every power variable is zero or more, and the size runs from 0 to 100 megawatts. Without u ≥ 0, an hour that sells could cancel power bought in another hour: that would be annual matching, not hourly." },
        { html: "Σ<sub><var>d</var>,<var>t</var></sub> <var>n</var><sub><var>d</var></sub> (" + sym("e", "<var>e</var>") + " " + sym("u", "<var>u</var>") + " − " + sym("L", "<var>L</var>") + " <var>k</var> <var>ez</var> ÷ 1000) ≤ 0, &nbsp; <var>u</var> ≥ <var>imp</var> − <var>exp</var>, &nbsp; <var>u</var> ≥ 0", tag: "tier (period 1)", say: "In the credit years, the counted grid power's CO2 stays under the tier's limit per kilogram; with hourly matching, only power bought beyond the same hour's sales counts, and never less than zero." }
      ],
      symbols: {
        crf: { name: "CRF", label: "CRF, the capital recovery factor", unit: "per year", words: "r ÷ (1 − (1 + r)^−N): the equal yearly share of an up-front cost over N years at rate r.", you: d.crf.toFixed(4) + " (4% real, 30 years).", code: "crf(K.r, K.N)" },
        fom: { name: "f", label: "f, fixed upkeep", unit: "share of capital a year", words: "DOE: 5% of the installed cost a year.", you: "0.05", code: "D.electrolyzer.fomShare" },
        capex: { name: "c", label: "c, installed cost", unit: "$ per MW", words: "DOE's $2,000 per kW in 2022 dollars, × 128.893 ÷ 118.026 (BEA's GDP deflator) to 2025 dollars, × 1,000 kW per MW.", you: "$" + Math.round(d.capexKW).toLocaleString("en-US") + " per kW = about $" + (Math.round(d.capexKW) * 1000).toLocaleString("en-US") + " per MW.", code: "K.capexKW * 1000" },
        S: { name: "S", label: "S, the electrolyzer's size", unit: "MW", words: "A decision: chosen with the hours, up to 100 MW.", you: "Top tier, one plant: " + d.t1.S.toFixed(1) + " MW.", code: '"S"' },
        phi: { name: "φ_p", label: "phi p, a period's weight", unit: "share", words: "The share of the life's discounted years: AF(r, 10) ÷ AF(r, N) for the credit years, the rest after.", you: d.phi.toFixed(3) + " and " + (1 - d.phi).toFixed(3) + ".", code: "periods(K, o)" },
        wd: { name: "n_d", label: "n d, a day's weight", unit: "days", words: "The days of its month's third that a representative day stands for; 365 in all.", you: weightWords(Y.days) + " days each, " + Y.days.length + " days.", code: "dy.weight" },
        p: { name: "p_t", label: "p t, the grid price", unit: "$/MWh", words: "Prairie Town's cost of one more MWh in hour t: $0, $40 or $100.", you: R.priceShare.zero + " of 2025's hours at $0.", code: "dy.p[t]" },
        ch: { name: "q", label: "q, the delivery charge", unit: "$/MWh", words: "A transmission and delivery charge on power bought (illustrative).", you: "$" + D.charge.def + ".", code: "o.c" },
        imp: { name: "imp", label: "imp, power bought", unit: "MW", words: "Bought from the grid in an hour, at most 50 MW (all of the electrolyzer's power across the grid).", you: "Top tier: " + Math.round(d.t1.imp).toLocaleString("en-US") + " MWh a year.", code: '"imp" + s' },
        exp: { name: "exp", label: "exp, wind sold", unit: "MW", words: "Wind sold through the 50 MW connection at the hour's price.", you: "Its certificates count only under annual or hourly matching.", code: '"exp" + s' },
        wear: { name: "v", label: "v, stack wear", unit: "$/MWh", words: "11% of the installed cost every 40,000 full-load hours, charged per MWh (illustrative).", you: "$" + d.wear.toFixed(2) + " per MWh.", code: "K.wear" },
        h: { name: "h", label: "h, the hydrogen price", unit: "$/kg", words: "What the buyer pays per kilogram, set by you.", you: "$" + D.hydrogen.price.def.toFixed(2) + ".", code: "o.h" },
        cr: { name: "κ_p", label: "kappa p, the credit", unit: "$/kg", words: "The tier's amount in the credit years, 0 after them.", you: "$" + (D.credit.tiers[0].amount * D.credit.multiplier).toFixed(3) + " at the top tier with the wage rules.", code: "pp.credit" },
        k: { name: "k", label: "k, kilograms per MWh", unit: "kg/MWh", words: "1,000 ÷ 57 kWh per kg, about 17.54 (DOE).", you: "17.54", code: "K.k" },
        ez: { name: "ez", label: "ez, power into the electrolyzer", unit: "MW", words: "Shorthand for dw + imp, never above S.", you: "Top tier: capacity utilization " + Math.round(d.t1.util * 100) + "%, its MWh ÷ (S × 8,760 h).", code: "dw + imp" },
        dw: { name: "dw", label: "dw, wind taken directly", unit: "MW", words: "Wind the electrolyzer takes behind the plant's meter (none across the grid).", you: "Counts as zero CO2 here.", code: '"dw" + s' },
        w: { name: "w_t", label: "w t, the plant's wind", unit: "MW", words: "100 MW following SPP's 2025 shape at EIA's 33.8% capacity factor.", you: "Representative days: " + (R.repCF * 100).toFixed(1) + "% against the year's 33.8%.", code: "dy.w[t]" },
        e: { name: "e", label: "e, the grid's CO2 rate", unit: "t/MWh", words: "The rate counted for power bought (operating CO2 only; simplified).", you: "Prairie Town's 2025 average, " + R.townRate.toFixed(3) + ".", code: "o.e" },
        u: { name: "u", label: "u, unmatched power", unit: "MW", words: "Bought power not covered by certificates from the same hour (hourly matching); never below 0.", you: "No certificates: u = imp; annual matching: the year's bought minus sold, in one row.", code: '"u" + s' },
        L: { name: "L", label: "L, the tier's limit", unit: "kg CO2e per kg", words: "0.45, 1.5, 2.5 or 4.0 kg per kg; the LP uses 0.001 below each 'less than' and counts operating CO2 against it (simplified).", you: "Top tier: 0.449.", code: "o.tier.max" }
      }
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "One plant, three boundaries", lede: "The lesson's defaults ($" + D.hydrogen.price.def.toFixed(2) + " per kg, $" + D.charge.def + " charge, Prairie Town's grid rate, hourly matching), with the credit's tier chosen by the five LPs.",
      columns: [{ key: "name", label: "Boundary", main: true }, { key: "size", label: "Size", num: true, phone: "MW" }, { key: "npv", label: "NPV", num: true }, { key: "lcoh", label: "Cost per kg", num: true, phone: "$/kg" }, { key: "none", label: "NPV with no credit", num: true, phoneHide: true }],
      rows: R.boundaries.map(function (b) { return { key: b.id, color: "var(--lx-good)", name: b.label, size: { text: b.S.toFixed(1) + " MW", value: b.S }, npv: { text: fm.musd(b.npv), value: b.npv }, lcoh: { text: b.lcoh == null ? "–" : fm.kg(b.lcoh), value: b.lcoh || 0 }, none: { text: fm.musd(b.npvNone), value: b.npvNone } }; }),
      sorts: [{ label: "As listed", order: R.boundaries.map(function (b) { return b.id; }), note: "Each row draws the boundary differently around the same wind and the same buyer." },
              { label: "By NPV", order: R.boundaries.slice().sort(function (a, b) { return b.npv - a.npv; }).map(function (b) { return b.id; }), ranked: true, note: "The ranking is a statement about the boundary as much as about the plant." }]
    });
  }
})();
