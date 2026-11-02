/* profiles.js — wind and solar output for a plant of a given size, with a realistic annual capacity factor (data
   convention for wave W1, 2026-11-02).
   The wind and solar shapes in assets/learn/data/town_days.json and town_year.json are each normalised to their own 2025
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
   Methods, and what each does to the shape (say which one on the page):
     scale  output = capacity × min(1, k × s). If k > 1 (target above the shape's mean), the best hours are clipped at
            capacity, like a turbine or inverter limit; if k < 1, output never reaches capacity (peakFrac = k): for SPP
            wind against the U.S. 33.8% target, the windiest hour reaches about 64% of capacity.
     power  output = capacity × s ^ g. The best hour stays at capacity and weaker hours shrink (g > 1) or grow (g < 1);
            no clipping. Use it when a lesson shows peaks against capacity.
   Both keep zero hours at zero (night stays dark) and are exact to 1e-9 on the annual mean (bisection). Lesson 0 keeps its
   single real day scaled to farm size, labelled; it does not use this helper.
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
  function townProfile(tech, capacityMW, opts) {
    opts = opts || {};
    if (tech !== "wind" && tech !== "solar") throw new Error("townProfile: tech must be wind or solar");
    if (!(capacityMW >= 0)) throw new Error("townProfile: capacityMW must be a number of MW");
    var year = opts.year;
    if (!year || !year[tech] || year[tech].length < 24) throw new Error("townProfile: pass opts.year (town_year.json)");
    var T = opts.targets, target = opts.annualCF != null ? opts.annualCF : T && T.targets && T.targets[tech] && T.targets[tech].cf;
    if (target == null) throw new Error("townProfile: give opts.annualCF or opts.targets (cf_targets.json)");
    var method = opts.method || "scale", x = cfScale(year[tech], target, method), s = unit(year[tech]);
    var f = method === "power" ? function (v) { return v > 0 ? Math.pow(Math.min(1, v), x) : 0; } : function (v) { return Math.min(1, x * v); };
    var mw = new Array(s.length), clipped = 0, peak = 0;
    for (var i = 0; i < s.length; i++) { var u = f(s[i]); if (method === "scale" && x * s[i] > 1) clipped++; if (u > peak) peak = u; mw[i] = capacityMW * u; }
    var out = { tech: tech, capacityMW: capacityMW, method: method, target: target, cf: cfOf(s, x, method), peakFrac: peak, clippedHours: clipped, mw: mw,
      scaleDay: function (shape) { return unit(shape).map(function (v) { return capacityMW * f(v); }); },
      source: T && T.source ? T.source.publisher + ", " + T.source.short + " (" + T.targets[tech].year + ")" : null };
    out[method === "power" ? "gamma" : "k"] = x;
    return out;
  }
  var api = { cfScale: cfScale, townProfile: townProfile, cfOf: function (shape, x, method) { return cfOf(unit(shape), x, method || "scale"); } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;
  window.LX.cfScale = cfScale;
  window.LX.townProfile = townProfile;
})();
