/* profiles.js — wind and solar output for a plant of a given size, with a realistic annual capacity factor (the
   course's data convention).
   The wind and solar shapes in assets/learn/data/town_days.json and town_year.json are each normalized to their own 2025
   maximum hour (integers in thousandths). Their mean/max (wind 0.53, solar 0.24 for SPP in 2025) is therefore NOT a
   capacity factor. To turn a shape into a plant's output, scale it so that its annual capacity factor equals a sourced
   target: assets/learn/data/cf_targets.json (EIA, Electric Power Monthly, Table 6.07.B, 2025 annual, U.S. utility scale).
     LX.cfScale(shape, cf, method)   the factor for a whole-year shape (thousandths; any length): "scale" (default) returns
                                     k with mean(min(1, k * s)) = cf; "power" returns g with mean(s ^ g) = cf
     LX.townProfile(tech, capacityMW, opts) -> { mw: [8760 values], cf, target, k | gamma, method, peakFrac,
                                     clippedHours, scaleDay(shape) (the same scaling for a 24-hour or 168-hour shape),
                                     source }
       tech: "wind" | "solar";  opts.year: town_year.json (required); opts.annualCF: a target as a fraction, or
       opts.targets: cf_targets.json (its targets[tech].cf is used); opts.method: "scale" | "power"
       opts.monthlyCF: true (use opts.targets.monthly[tech], EIA's 2025 monthly values) or an array of 12 fractions:
                       each calendar month of the shape is first brought to that month's capacity factor with the same
                       method, then the year is set to the annual target. Why: the SPP shapes carry the fleets' growth
                       during 2025 (solar's January maximum is 0.56 of its November maximum), so an annual-only scaling
                       gives December solar about 22% against EIA's 13.1%. Months follow the local calendar of the shape
                       (index 0 = 00:00 on 1 January; opts.monthDays overrides the month lengths). The result's
                       `monthly` holds the 12 monthly capacity factors.
   Methods, and what each does to the shape (say which one on the page):
     scale  output = capacity × min(1, k × s). If k > 1 (target above the shape's mean), the best hours are clipped at
            capacity, like a turbine or inverter limit; if k < 1, output never reaches capacity (peakFrac = k): for SPP
            wind against the U.S. 33.8% target, the windiest hour reaches about 64% of capacity.
     power  output = capacity × s ^ g. The best hour stays at capacity and weaker hours shrink (g > 1) or grow (g < 1);
            no clipping. Use it when a lesson shows peaks against capacity.
   Both keep zero hours at zero (night stays dark) and are exact to 1e-9 on the annual mean (bisection). Lesson 0 keeps its
   single real day scaled to farm size, labeled; it does not use this helper.
   Node: module.exports = { cfScale, townProfile, cfOf } (tests: _tests/learn/test_profiles.js). */
(function () {
  "use strict";
  function unit(shape) { var s = new Array(shape.length); for (var i = 0; i < shape.length; i++) s[i] = Math.max(0, shape[i]) / 1000; return s; }
  // annual capacity factor of a unit shape s after scaling
  function cfOf(s, x, method) {
    var t = 0, i;
    if (method === "power") for (i = 0; i < s.length; i++) t += s[i] > 0 ? Math.pow(Math.min(1, s[i]), x) : 0;
    else for (i = 0; i < s.length; i++) t += Math.min(1, x * s[i]);
    return t / s.length;
  }
  function cfScale(shape, cf, method) {
    method = method || "scale";
    if (method !== "scale" && method !== "power") throw new Error("cfScale: method must be scale or power");
    if (!(cf > 0 && cf < 1)) throw new Error("cfScale: the target capacity factor must be between 0 and 1");
    var s = unit(shape), nz = 0;
    for (var i = 0; i < s.length; i++) if (s[i] > 0) nz++;
    var reach = nz / s.length;   // the most any scaling can give: every non-zero hour at capacity
    if (cf >= reach) throw new Error("cfScale: a capacity factor of " + cf + " is out of reach for this shape (at most " + reach.toFixed(3) + ")");
    var lo, hi, it;
    if (method === "scale") {   // cfOf rises with k
      lo = 0; hi = 1; while (cfOf(s, hi, method) < cf) hi *= 2;
    } else {                    // cfOf falls with g
      lo = 1e-6; hi = 1; while (cfOf(s, hi, method) > cf) { lo = hi; hi *= 2; }
      if (cfOf(s, lo, method) < cf) lo = 1e-6;
    }
    for (it = 0; it < 200 && hi - lo > 1e-13 * Math.max(1, hi); it++) {
      var mid = (lo + hi) / 2, v = cfOf(s, mid, method);
      if ((method === "scale") === (v < cf)) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function monthDays(year) {
    var y = +String(year.start_utc || "").slice(0, 4), d = MONTH_DAYS.slice();
    if (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) d[1] = 29;
    return d;
  }
  // bring each month of a shape (thousandths) to its own capacity factor; returns a new shape in thousandths
  function byMonth(shape, cfs, method, days) {
    var out = shape.slice(), t0 = 0;
    days.forEach(function (d, m) {
      var seg = shape.slice(t0, t0 + d * 24), x = cfScale(seg, cfs[m], method), s = unit(seg);
      for (var h = 0; h < seg.length; h++) out[t0 + h] = 1000 * (method === "power" ? (s[h] > 0 ? Math.pow(Math.min(1, s[h]), x) : 0) : Math.min(1, x * s[h]));
      t0 += d * 24;
    });
    return out;
  }
  function townProfile(tech, capacityMW, opts) {
    opts = opts || {};
    if (tech !== "wind" && tech !== "solar") throw new Error("townProfile: tech must be wind or solar");
    if (!(capacityMW >= 0)) throw new Error("townProfile: capacityMW must be a number of MW");
    var year = opts.year;
    if (!year || !year[tech] || year[tech].length < 24) throw new Error("townProfile: pass opts.year (town_year.json)");
    var T = opts.targets, target = opts.annualCF != null ? opts.annualCF : T && T.targets && T.targets[tech] && T.targets[tech].cf;
    if (target == null) throw new Error("townProfile: give opts.annualCF or opts.targets (cf_targets.json)");
    var method = opts.method || "scale", shape = year[tech], mcf = opts.monthlyCF, days = null;
    if (mcf) {
      if (mcf === true) mcf = T && T.monthly && T.monthly[tech];
      if (!mcf || mcf.length !== 12) throw new Error("townProfile: monthlyCF needs 12 values, or true with opts.targets.monthly (cf_targets.json)");
      days = opts.monthDays || monthDays(year);
      if (days.reduce(function (a, b) { return a + b; }, 0) * 24 !== shape.length) throw new Error("townProfile: monthlyCF needs a whole calendar year of hours");
      shape = byMonth(shape, mcf, method, days);
    }
    var x = cfScale(shape, target, method), s = unit(shape);
    var f = method === "power" ? function (v) { return v > 0 ? Math.pow(Math.min(1, v), x) : 0; } : function (v) { return Math.min(1, x * v); };
    var mw = new Array(s.length), clipped = 0, peak = 0;
    for (var i = 0; i < s.length; i++) { var u = f(s[i]); if (method === "scale" && x * s[i] > 1) clipped++; if (u > peak) peak = u; mw[i] = capacityMW * u; }
    var out = { tech: tech, capacityMW: capacityMW, method: method, target: target, cf: cfOf(s, x, method), peakFrac: peak, clippedHours: clipped, mw: mw,
      scaleDay: function (shape) { return unit(shape).map(function (v) { return capacityMW * f(v); }); },
      source: T && T.source ? T.source.publisher + ", " + T.source.short + " (" + T.targets[tech].year + ")" : null };
    out[method === "power" ? "gamma" : "k"] = x;
    if (days) {   // the result's monthly capacity factors
      out.monthly = []; var t0 = 0;
      days.forEach(function (d) { var e = 0; for (var h = 0; h < d * 24; h++) e += mw[t0 + h]; out.monthly.push(capacityMW > 0 ? e / (capacityMW * d * 24) : 0); t0 += d * 24; });
      out.monthlyTargets = mcf.slice();
    }
    return out;
  }
  var api = { cfScale: cfScale, townProfile: townProfile, monthDays: monthDays, cfOf: function (shape, x, method) { return cfOf(unit(shape), x, method || "scale"); } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;
  window.LX.cfScale = cfScale;
  window.LX.townProfile = townProfile;
})();
