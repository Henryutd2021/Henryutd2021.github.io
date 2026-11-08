// 04-forecasts.js — Lesson 4, "Forecasts and surprises" (step cards).
//
// Data (all real, Southwest Power Pool, 2025, from EIA-930; see each file's meta):
//   assets/learn/data/town_days.json   the days typical_forecast (10 Feb 2025) and big_forecast_miss (4 Feb 2025): hourly
//                                      demand and SPP's day-ahead demand forecast as shares of the 2025 peak hour, and
//                                      solar as a share of its 2025 maximum hour (integers in thousandths)
//   assets/learn/data/town_year.json   every hour of 2025 (demand, wind, solar shapes): the persistence baselines
//   assets/learn/data/04-forecasts.json  the peak demand and maximum solar hour (to turn shapes back into MW), the
//                                      January-April error statistics, the monthly forecast/demand ratio, and the wind
//                                      persistence error by lead time
// Only January-April forecasts are used: from May 2025 the forecast SPP reports to EIA averages 8-15% above its reported
// demand every month (04-forecasts.json monthly_forecast_ratio). The cause is unverified (possibly a reporting or definition
// mismatch between the two series); leaving those months out is an editorial choice pending validation.
//
// Model (statistical, no solver). Hours are labelled by their start (index t covers t:00 to t+1:00), as in lesson 0.
//   MAE  = mean |A - P| (MW);  MAPE = mean |A - P| / A over hours with A > 0 (night hours of solar are skipped)
//   bias = mean (A - P);  skill against a baseline B = 1 - MAE(P) / MAE(B)
//   band = forecast x (1 + q_lo) to forecast x (1 + q_hi), with q the January-April quantiles of e = (A - F) / F
//   cushion game (an illustrative scheduling cushion, not a reserve requirement): schedule F x (1 + r); per hour, unused
//   capacity F(r - e)+ costs cOver $/MWh and missing energy F(e - r)+ costs cUnder $/MWh (both illustrative), with F the
//   January-April mean forecast; the cheapest r is where P(e <= r) reaches cUnder / (cUnder + cOver): +5.9% on the
//   errors' 0.1-point grid, +6.0% on the slider's 0.5-point grid.
//   Two percentages: MAPE divides by the actual value; the signed error in the tooltip, table and band divides by the
//   forecast (the page labels both).
// Every number the page states comes from these functions or the data files and is checked in
// _tests/learn/test_04_forecasts.js. The pure model is exported for Node; the view uses the component library.
// The chart card is the shared LX.PlotCard and its chart LX.Plot (components/plot.js).
(function () {
  "use strict";
  var COSTS = { over: 10, under: 300 };                     // $/MWh, illustrative (the page says so)
  var BANDS = { "50": ["0.25", "0.75"], "80": ["0.1", "0.9"], "95": ["0.025", "0.975"] };

  // ---------------------------------------------------------------- pure model
  function slice(year, key, date, offset) {
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(date + "T00:00:00Z"), i = Math.round((d0 - t0) / 3600000) + 1 - offset;
    if (i < 0 || i + 24 > year[key].length) throw new Error("date " + date + " is outside the year file");
    return year[key].slice(i, i + 24);
  }
  function shift(date, days) { var d = new Date(Date.parse(date + "T12:00:00Z") + days * 86400000); return d.toISOString().slice(0, 10); }
  function label(date) {   // "Monday 10 February 2025"
    var d = new Date(Date.parse(date + "T12:00:00Z")), W = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var Mo = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return { weekday: W[d.getUTCDay()], short: d.getUTCDate() + " " + Mo[d.getUTCMonth()].slice(0, 3), long: d.getUTCDate() + " " + Mo[d.getUTCMonth()] + " " + d.getUTCFullYear() };
  }
  function prepare(days, year, fc, key) {
    var d = days.days[key], pk = fc.spp_peak_demand_mw / 1000, sm = fc.spp_max_solar_mw / 1000, off = -6;   // Central standard time
    var mwD = function (a) { return a.map(function (v) { return v * pk; }); }, mwS = function (a) { return a.map(function (v) { return v * sm; }); };
    var y = shift(d.date, -1), w = shift(d.date, -7);
    return { key: key, date: d.date, label: label(d.date), note: d.note,
             A: mwD(d.demand), F: mwD(d.forecast), Y: mwD(slice(year, "demand", y, off)), Wk: mwD(slice(year, "demand", w, off)),
             S: mwS(d.solar), Sy: mwS(slice(year, "solar", y, off)), yDate: y, wDate: w, yLabel: label(y), wLabel: label(w) };
  }
  function mae(A, P) { var s = 0; for (var t = 0; t < A.length; t++) s += Math.abs(A[t] - P[t]); return s / A.length; }
  function mape(A, P) {
    var s = 0, n = 0;
    for (var t = 0; t < A.length; t++) if (A[t] > 0) { s += Math.abs(A[t] - P[t]) / A[t]; n++; }
    return { value: n ? s / n : NaN, hours: n, skipped: A.length - n };
  }
  function bias(A, P) { var s = 0; for (var t = 0; t < A.length; t++) s += A[t] - P[t]; return s / A.length; }
  function worst(A, P) { var k = 0; for (var t = 1; t < A.length; t++) if (Math.abs(A[t] - P[t]) > Math.abs(A[k] - P[k])) k = t; return { t: k, mw: A[k] - P[k], pct: (A[k] - P[k]) / P[k] }; }
  function band(fc, F, level) {
    var q = BANDS[level], lo = fc.jan_apr.quantiles[q[0]], hi = fc.jan_apr.quantiles[q[1]];
    return { level: +level, qlo: lo, qhi: hi, lo: F.map(function (v) { return v * (1 + lo); }), hi: F.map(function (v) { return v * (1 + hi); }) };
  }
  function outside(A, b) { var n = 0; for (var t = 0; t < A.length; t++) if (A[t] < b.lo[t] - 1e-9 || A[t] > b.hi[t] + 1e-9) n++; return n; }
  function errors(fc) { return fc.jan_apr.rel_error_tenths_pct.map(function (v) { return v / 1000; }); }
  function marginCost(fc, r, errs, costs) {   // average $ per hour over January-April, at the mean forecast
    var c = costs || COSTS, F = fc.jan_apr.mean_forecast_mw, over = 0, under = 0, short = 0;
    errs.forEach(function (e) { if (e > r) { under += F * (e - r); short++; } else over += F * (r - e); });
    var n = errs.length;
    return { r: r, overMWh: over / n, underMWh: under / n, overCost: c.over * over / n, underCost: c.under * under / n,
             total: (c.over * over + c.under * under) / n, shortShare: short / n, marginMW: F * r };
  }
  function bestMargin(fc, errs, grid, costs) {
    var best = null; grid.forEach(function (r) { var m = marginCost(fc, r, errs, costs); if (!best || m.total < best.total - 1e-9) best = m; }); return best;
  }
  // chip labels for the two scores: plain words until step 4 names them (MAE and MAPE appear only after their definition)
  function scoreLabels(named) {
    return named ? { pct: "MAPE, % of actual", abs: "MAE, GW" } : { pct: "Average miss, % of actual", abs: "Average miss, GW" };
  }
  // the cost chart's text version: every slider setting (0.5-point steps), the reader's own marked
  function costRows(fc, errs, grid, cur, costs) {
    return grid.map(function (r) {
      var m = marginCost(fc, r, errs, costs), s = (r >= 0 ? "+" : "−") + Math.abs(100 * r).toFixed(1) + "%";
      return [s + (Math.abs(r - cur) < 1e-9 ? " (yours)" : ""), "$" + Math.round(m.overCost).toLocaleString("en-US"), "$" + Math.round(m.underCost).toLocaleString("en-US"),
              "$" + Math.round(m.total).toLocaleString("en-US"), (100 * m.shortShare).toFixed(0) + "%"];
    });
  }
  function marginGrid(lo, hi, step) { var g = []; for (var k = Math.round(lo / step); k <= Math.round(hi / step); k++) g.push(Math.round(k * step * 1e6) / 1e6); return g; }
  var model = { COSTS: COSTS, BANDS: BANDS, prepare: prepare, mae: mae, mape: mape, bias: bias, worst: worst, band: band, outside: outside,
                errors: errors, marginCost: marginCost, bestMargin: bestMargin, marginGrid: marginGrid, shift: shift, label: label,
                scoreLabels: scoreLabels, costRows: costRows };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view helpers
  var LX = window.LX, H = LX.H, LESSON = "04-forecasts";
  var gw = function (mw) { return (mw / 1000).toFixed(1) + " GW"; }, gw2 = function (mw) { return (mw / 1000).toFixed(2) + " GW"; };
  var pct = function (x, d) { return (100 * x).toFixed(d == null ? 1 : d) + "%"; }, spct = function (x) { return (x >= 0 ? "+" : "−") + Math.abs(100 * x).toFixed(1) + "%"; };
  var mwf = function (v) { return Math.round(v).toLocaleString("en-US") + " MW"; }, money = function (v) { return "$" + Math.round(v).toLocaleString("en-US"); };

  // ---------------------------------------------------------------- the lesson
  var SHORT_NOTE = "“Short” means demand came in above this first schedule and costlier power filled the gap; it does not mean a blackout.";
  function inSample(level) { return "This band holds about " + level + "% of the January–April hours used to build it; how well it covers future days is untested."; }
  var COL = { actual: "var(--lx-ink)", spp: "var(--lx-accent)", base: "var(--lx-tier-4)", under: "var(--lx-warn)", over: "var(--lx-tier-3)", band: "var(--lx-accent)", solar: "var(--lx-solar)", wind: "var(--lx-wind)" };
  var PRED = {
    q: "On an ordinary winter day, how far off is that forecast, on average, hour by hour?",
    options: [{ value: "0.5", label: "About 0.5%" }, { value: "2", label: "About 2%" }, { value: "5", label: "About 5%" }, { value: "10", label: "About 10%" }]
  };

  function view(live, data, root) {
    var fc = data["04_forecasts"], DAYS = { typical: prepare(data.town_days, data.town_year, fc, "typical_forecast"), miss: prepare(data.town_days, data.town_year, fc, "big_forecast_miss") };
    var ERR = errors(fc), GRID = marginGrid(0, 0.10, 0.005), BEST = bestMargin(fc, ERR, GRID), NEAR = 1.05;
    var S_ = { day: "typical", show: "actual", base: "yesterday", series: "demand", level: "80", margin: 0, lead: 24, pick: null, chart: "day", named: false };
    // the chart card (plot.js): title, value chips, the chart and its text version
    var card = LX.PlotCard(live, { text: "Text version of the chart" }), ttl = card.title, chips = card.chips, P = card.plot, altBody = card.text;
    function chip(l, v, tone) { card.chip(l, v, tone); }
    function hourTicks() { return [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]]; }
    function hourTicksN() { return [[0, "00:00"], [12, "12:00"], [24, "24:00"]]; }
    function series(arr) { var p = []; arr.forEach(function (v, t) { p.push([t + 0.5, v]); }); return p; }
    function gwTicks(lo, hi) { var t = [], st = hi - lo > 12 ? 4 : 2; for (var v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) t.push([v * 1000, v + ""]); return t; }
    function table(head, rows) {
      var sc = H("div", { class: "lx-scroll-x" }, altBody), tb = H("table", { class: "lx-mini-table" }, sc), hr = H("tr", null, H("thead", null, tb));
      head.forEach(function (h) { H("th", { scope: "col", text: h }, hr); }); var b = H("tbody", null, tb);
      rows.forEach(function (r) { var tr = H("tr", null, b); r.forEach(function (c) { H("td", { text: c }, tr); }); });
    }

    function draw(animate) {
      chips.innerHTML = ""; altBody.innerHTML = "";
      if (S_.chart === "cost") return drawCost();
      if (S_.chart === "wind") return drawWind();
      var d = DAYS[S_.day], solar = S_.series === "solar";
      var A = solar ? d.S : d.A, lines = [], bars = [], legend = [], areas = [];
      var name = d.label.weekday + " " + d.label.long;
      if (solar) {
        ttl.textContent = "SPP solar output, " + name + ", against the same hour the day before";
        var mp = mape(d.S, d.Sy), ma = mae(d.S, d.Sy);
        for (var t = 0; t < 24; t++) if (Math.abs(d.S[t] - d.Sy[t]) > 0.5) bars.push({ x0: t + 0.2, x1: t + 0.8, y0: d.Sy[t], y1: d.S[t], color: d.S[t] > d.Sy[t] ? COL.under : COL.over, op: 0.35 });
        lines.push({ pts: series(d.Sy), color: COL.base, dash: "6 4" }); lines.push({ pts: series(d.S), color: COL.solar, width: 2.8 });
        legend.push({ label: "Actual solar", color: COL.solar }, { label: "Same hour, day before (" + d.yLabel.short + ")", color: COL.base, dash: true });
        chip("MAE", Math.round(ma) + " MW"); chip("MAPE", pct(mp.value, 0), "warn"); chip("Hours left out (no sun)", mp.skipped + " of 24");
        var ymax = Math.ceil(Math.max(Math.max.apply(null, d.S), Math.max.apply(null, d.Sy)) / 100) * 100 + 100;
        P.render({ x: { min: 0, max: 24, ticks: hourTicks(), ticksN: hourTicksN() }, y: { min: 0, max: ymax, unit: "MW", ticks: [0, ymax / 4, ymax / 2, 3 * ymax / 4, ymax].map(function (v) { return [v, Math.round(v) + ""]; }) },
          lines: lines, bars: bars, legend: legend, ml: 44, aria: "Hourly solar output in MW for the day and the day before. The text version below gives the numbers.",
          tip: function (x) { var t = Math.min(23, Math.floor(x)), e = d.S[t] > 0 ? " (" + pct(Math.abs(d.S[t] - d.Sy[t]) / d.S[t], 0) + ")" : " (no sun: MAPE skips it)"; return "<div><b>" + LX.fmt.hh(t) + "</b></div><div><span>Actual</span><b>" + Math.round(d.S[t]) + " MW</b></div><div><span>Day before</span><b>" + Math.round(d.Sy[t]) + " MW</b></div><div><span>Miss (% of actual)</span><b>" + Math.round(Math.abs(d.S[t] - d.Sy[t])) + " MW" + e + "</b></div>"; } }, animate);
        table(["Hour", "Actual MW", "Day before MW", "Miss as % of actual"], d.S.map(function (v, t) { return [LX.fmt.hh(t), Math.round(v), Math.round(d.Sy[t]), v > 0 ? pct(Math.abs(v - d.Sy[t]) / v, 0) : "no sun"]; }));
        return;
      }
      var showF = S_.show !== "actual", showB = S_.show === "base", showBand = S_.show === "band";
      var B = S_.base === "week" ? d.Wk : d.Y, bName = S_.base === "week" ? "Same hour last week (" + d.wLabel.weekday + " " + d.wLabel.short + ")" : "Same hour yesterday (" + d.yLabel.weekday + " " + d.yLabel.short + ")";
      ttl.textContent = "SPP demand, " + name + (showF ? ": day-ahead forecast against actual" : "");
      var all = A.concat(showF ? d.F : []).concat(showB ? B : []), bd = showBand ? band(fc, d.F, S_.level) : null;
      if (bd) all = all.concat(bd.lo, bd.hi);
      var lo = Math.floor(Math.min.apply(null, all) / 2000) * 2, hi = Math.ceil(Math.max.apply(null, all) / 2000) * 2;
      if (bd) {
        for (var k = 0; k < 24; k++) bars.push({ x0: k + 0.04, x1: k + 0.96, y0: bd.lo[k], y1: bd.hi[k], color: COL.band, op: LX.isDark() ? 0.32 : 0.18 });
        legend.push({ label: S_.level + "% band from Jan–Apr errors", color: "color-mix(in srgb, var(--lx-accent) 30%, transparent)" });
      }
      if (S_.show === "forecast") for (var u = 0; u < 24; u++) bars.push({ x0: u + 0.2, x1: u + 0.8, y0: d.F[u], y1: A[u], color: A[u] > d.F[u] ? COL.under : COL.over, op: 0.4 });
      if (showB) { lines.push({ pts: series(B), color: COL.base, dash: "6 4" }); legend.push({ label: bName, color: COL.base, dash: true }); }
      if (showF) { lines.push({ pts: series(d.F), color: COL.spp, width: 2.4, anim: animate }); legend.push({ label: "SPP day-ahead forecast", color: COL.spp }); }
      lines.push({ pts: series(A), color: COL.actual, width: 2.8 }); legend.push({ label: "Actual demand", color: COL.actual });
      if (S_.show === "forecast") legend.push({ label: "Demand above forecast", color: COL.under }, { label: "Below forecast", color: COL.over });
      var w = worst(A, d.F), ma = mae(A, d.F), mp = mape(A, d.F);
      if (!showF) { chip("Lowest hour", gw(Math.min.apply(null, A))); chip("Highest hour", gw(Math.max.apply(null, A))); }
      else if (bd) { var out = outside(A, bd); chip("Band", spct(bd.qlo) + " to " + spct(bd.qhi)); chip("Hours outside the band", out + " of 24", out > 24 * (1 - bd.level / 100) * 2 ? "bad" : out ? "warn" : "good"); }
      else if (showB) { var mb = mae(A, B); chip("SPP forecast, average miss", gw2(ma), ma < mb ? "good" : "warn"); chip("Baseline, average miss", gw2(mb), mb < ma ? "good" : "warn"); }
      else { var SL = scoreLabels(S_.named); chip(SL.pct, pct(mp.value)); chip(SL.abs, gw2(ma)); chip("Worst hour", LX.fmt.hh(w.t) + ", " + (w.mw > 0 ? "+" : "−") + gw(Math.abs(w.mw)), Math.abs(w.pct) > 0.05 ? "bad" : ""); }
      P.render({ x: { min: 0, max: 24, ticks: hourTicks(), ticksN: hourTicksN() }, y: { min: lo * 1000, max: hi * 1000, ticks: gwTicks(lo, hi), unit: "GW" }, lines: lines, bars: bars, legend: legend, ml: 40,
        aria: "Hourly SPP demand in GW for " + name + (showF ? ", with the day-ahead forecast" : "") + ". The text version below gives the numbers.",
        tip: function (x) {
          var t = Math.min(23, Math.floor(x)), h = "<div><b>" + LX.fmt.hh(t) + "</b></div><div><span>Actual</span><b>" + gw(A[t]) + "</b></div>";
          if (showF) h += "<div><span>Forecast</span><b>" + gw(d.F[t]) + "</b></div><div><span>Signed error, % of forecast</span><b>" + spct((A[t] - d.F[t]) / d.F[t]) + "</b></div>";
          if (showB) h += "<div><span>Baseline</span><b>" + gw(B[t]) + "</b></div>";
          if (bd) h += "<div><span>Band</span><b>" + (bd.lo[t] / 1000).toFixed(1) + "–" + gw(bd.hi[t]) + "</b></div>";
          return h;
        } }, animate);
      var head = ["Hour", "Actual GW"].concat(showF ? ["Forecast GW", "Signed error, % of forecast"] : []).concat(showB ? ["Baseline GW"] : []).concat(bd ? ["Band GW"] : []);
      table(head, A.map(function (v, t) {
        var r = [LX.fmt.hh(t), (v / 1000).toFixed(1)];
        if (showF) r.push((d.F[t] / 1000).toFixed(1), spct((v - d.F[t]) / d.F[t]));
        if (showB) r.push((B[t] / 1000).toFixed(1));
        if (bd) r.push((bd.lo[t] / 1000).toFixed(1) + "–" + (bd.hi[t] / 1000).toFixed(1));
        return r;
      }));
    }
    function drawCost() {
      var cur = marginCost(fc, S_.margin, ERR), all = GRID.map(function (r) { return marginCost(fc, r, ERR); });
      var pts = function (k) { return all.map(function (m) { return [100 * m.r, m[k]]; }); };
      var ymax = Math.ceil(all[0].total / 20000) * 20000;
      ttl.textContent = "Extra cost of forecast misses, average per hour, January–April 2025 (costs illustrative)";
      chip("Cushion above forecast", spct(S_.margin) + " ≈ " + gw(cur.marginMW)); chip("Hours short of the schedule", pct(cur.shortShare, 0), cur.shortShare > 0.2 ? "bad" : cur.shortShare > 0.06 ? "warn" : "good");
      chip("Cost per hour", money(cur.total), cur.total <= NEAR * BEST.total ? "good" : "");
      P.render({ x: { min: 0, max: 10, ticks: [[0, "0"], [2, "+2%"], [4, "+4%"], [6, "+6%"], [8, "+8%"], [10, "+10%"]] },
        y: { min: 0, max: ymax, unit: "$ per hour", ticks: [0, ymax / 4, ymax / 2, 3 * ymax / 4, ymax].map(function (v) { return [v, "$" + Math.round(v / 1000) + "k"]; }) },
        lines: [{ pts: pts("overCost"), color: COL.over, dash: "6 4", width: 1.8 }, { pts: pts("underCost"), color: COL.under, dash: "6 4", width: 1.8 }, { pts: pts("total"), color: COL.spp, width: 2.8 }], ml: 48,
        bars: [{ x0: 100 * S_.margin - 0.06, x1: 100 * S_.margin + 0.06, y0: 0, y1: cur.total, color: "var(--lx-ink-3)", op: 0.5 }],
        marks: (Math.abs(S_.margin - BEST.r) < 1e-9 ? [] : [{ x: 100 * S_.margin, y: cur.total, label: "You: " + money(cur.total) + "/h", color: COL.actual, above: true }]).concat([{ x: 100 * BEST.r, y: BEST.total, label: "Cheapest " + spct(BEST.r), color: "var(--lx-good)", above: true }]),
        legend: [{ label: "Total", color: COL.spp }, { label: "Emergency power", color: COL.under, dash: true }, { label: "Unused capacity", color: COL.over, dash: true }],
        aria: "Average hourly cost of forecast misses against the cushion scheduled above the forecast. The text version below gives the numbers.",
        tip: function (x) { var r = Math.round(x * 2) / 200, m = marginCost(fc, r, ERR); return "<div><b>Cushion " + spct(r) + "</b></div><div><span>Unused capacity</span><b>" + money(m.overCost) + "</b></div><div><span>Emergency power</span><b>" + money(m.underCost) + "</b></div><div><span>Short of the schedule</span><b>" + pct(m.shortShare, 0) + " of hours</b></div>"; } });
      table(["Cushion", "Unused capacity $/h", "Emergency power $/h", "Total $/h", "Hours short"], costRows(fc, ERR, GRID, S_.margin));
    }
    function drawWind() {
      var W = fc.wind_persistence, k = W.lead_hours.indexOf(S_.lead);
      ttl.textContent = "Wind: average miss of “it stays as it is now”, by how far ahead you look (SPP, 2025)";
      chip("Looking ahead", S_.lead + (S_.lead === 1 ? " hour" : " hours")); chip("Average miss", W.mae_pct_of_max[k] + "% of max", k > 2 ? "bad" : k > 0 ? "warn" : "good"); chip("In GW", gw(W.mae_pct_of_max[k] / 100 * W.max_wind_mw));
      var bars = W.lead_hours.map(function (L, i) { return { x0: i + 0.18, x1: i + 0.82, y0: 0, y1: W.mae_pct_of_max[i], color: i === k ? COL.wind : "var(--lx-line-2)", rx: 3 }; });
      P.render({ x: { min: 0, max: W.lead_hours.length, ticks: W.lead_hours.map(function (L, i) { return [i + 0.5, L + " h"]; }) }, y: { min: 0, max: 25, unit: "% of max", ticks: [[0, "0%"], [5, "5%"], [10, "10%"], [15, "15%"], [20, "20%"], [25, "25%"]] },
        bars: bars, lines: [], ml: 40, marks: [{ x: k + 0.5, y: W.mae_pct_of_max[k], label: W.mae_pct_of_max[k] + "%", color: COL.wind, above: true }],
        legend: [{ label: "Average miss, % of the 2025 maximum hourly wind output (" + gw(W.max_wind_mw) + ")", color: COL.wind }],
        aria: "Bar chart: average error of a persistence forecast for SPP wind output by lead time. The text version below gives the numbers." });
      table(["Looking ahead", "Average miss, % of max", "Average miss, GW"], W.lead_hours.map(function (L, i) { return [L + " h", W.mae_pct_of_max[i] + "%", (W.mae_pct_of_max[i] / 100 * W.max_wind_mw / 1000).toFixed(1)]; }));
    }
    function seg(act, label, opts, cur, on) {
      var g = H("div", { class: "lx-seg", role: "group", "aria-label": label }, act), bs = [];
      opts.forEach(function (o) { var b = H("button", { type: "button", "aria-pressed": o[0] === cur ? "true" : "false", text: o[1] }, g); b.addEventListener("click", function () { bs.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); on(o[0]); }); bs.push(b); });
      return g;
    }
    function dayName(k) { var d = DAYS[k]; return d.label.weekday.slice(0, 3) + " " + d.label.short; }
    function enter(o) { Object.keys(o).forEach(function (k) { S_[k] = o[k]; }); draw(false); }
    function remember() { LX.store.set("l4-case", { day: S_.day, base: S_.base, level: S_.level, margin: S_.margin, lead: S_.lead }); LX.emit("l4-change"); }

    var typ = DAYS.typical, mis = DAYS.miss, Q = fc.jan_apr, PM = Q.persistence_mae_mw;
    var steps = [
      { text: "The black line is what Southwest Power Pool (SPP) customers used on " + typ.label.weekday + " " + typ.label.long + ". The day before, SPP forecast every one of these hours. Predict how close it came.",
        build: function (act, api) {
          enter({ chart: "day", day: "typical", show: "actual", series: "demand" });
          LX.Predict(act, { id: "l4-guess", q: PRED.q, options: PRED.options, answer: "2", fresh: true, lockText: "Locked in. Reveal the forecast next.", onPick: function (p) { S_.pick = p; api.done(); } });
        } },
      { text: "Here is SPP's [[day-ahead-forecast|day-ahead forecast]]. Each shaded bar is one hour's [[forecast-error|forecast error]]. Now switch to the worst day of January to April 2025.",
        build: function (act, api) {
          enter({ chart: "day", show: "forecast", series: "demand", named: false }); draw(true);
          var mpT = mape(typ.A, typ.F).value, ok = S_.pick === "2";
          var said = function () {
            var d = DAYS[S_.day], w = worst(d.A, d.F);
            if (S_.day === "typical") api.saw((S_.pick ? (ok ? "You called it: " : "Not quite: ") : "") + "on " + typ.label.short + " the forecast missed by " + pct(mpT) + " on average, " + gw2(mae(typ.A, typ.F)) + ". Over January–April the average miss was " + pct(Q.mape) + ".");
            else { var above = d.A.filter(function (v, t) { return v > d.F[t]; }).length;
              api.saw("On " + d.label.weekday + " " + d.label.short + " demand came in above the forecast in " + (above === 24 ? "every hour" : above + " of 24 hours") + ", by up to " + gw(w.mw) + " (" + spct(w.pct) + ") at " + LX.fmt.hh(w.t) + ". The average miss was about " + (mape(d.A, d.F).value / mpT).toFixed(0) + " times the typical day's.", true); api.done(); }
          };
          seg(act, "Day", [["typical", "Typical · " + DAYS.typical.label.short], ["miss", "Worst · " + DAYS.miss.label.short]], S_.day, function (v) { S_.day = v; draw(false); said(); remember(); });
          said(); if (S_.day === "miss") api.done();
        } },
      { text: "Is SPP's forecast any good? Compare it with the laziest forecast there is, [[persistence-forecast|persistence]]: tomorrow looks like today. Pick a baseline and see which misses less.",
        build: function (act, api) {
          enter({ chart: "day", show: "base", series: "demand" });
          var said = function () {
            var d = DAYS[S_.day], B = S_.base === "week" ? d.Wk : d.Y, ms = mae(d.A, d.F), mb = mae(d.A, B), J = S_.base === "week" ? [PM.spp_same_hours_last_week, PM.last_week] : [PM.spp_same_hours_yesterday, PM.yesterday];
            api.saw("On " + d.label.short + ", SPP's average miss was " + gw2(ms) + " against " + gw2(mb) + " for the baseline. Over January–April it was " + pct(1 - J[0] / J[1], 0) + " smaller than this baseline's: real skill.");
          };
          seg(act, "Baseline", [["yesterday", "Yesterday"], ["week", "Last week"]], S_.base, function (v) { S_.base = v; draw(false); said(); remember(); api.done(); });
          seg(act, "Day", [["typical", dayName("typical")], ["miss", dayName("miss")]], S_.day, function (v) { S_.day = v; draw(false); said(); remember(); });
          said();
        } },
      { text: "The two average misses have names: [[mae|mean absolute error (MAE)]], in MW, and [[mape|mean absolute percentage error (MAPE)]], in percent of actual. Switch from demand to solar and watch what MAPE does.",
        build: function (act, api) {
          enter({ chart: "day", show: "forecast", series: "demand", named: true });
          var take;
          var said = function () {
            var d = DAYS[S_.day]; take.hidden = S_.series !== "solar";
            if (S_.series === "demand") { api.saw("Demand never gets near zero, so MAPE (" + pct(mape(d.A, d.F).value) + ") and MAE (" + gw2(mae(d.A, d.F)) + ") tell the same story."); return; }
            var t0 = d.S.findIndex(function (v) { return v > 0; });
            api.saw("Solar at " + LX.fmt.hh(t0) + ": a miss of only " + Math.round(Math.abs(d.S[t0] - d.Sy[t0])) + " MW counts as " + pct(Math.abs(d.S[t0] - d.Sy[t0]) / d.S[t0], 0) + " of actual output.", true);
            api.done();
          };
          seg(act, "Series", [["demand", "Demand"], ["solar", "Solar"]], S_.series, function (v) { S_.series = v; draw(false); said(); });
          take = H("p", { class: "lx-hint", text: "Takeaway: when output can be near zero, score with MAE or a skill score, not MAPE." }, act);
          said(); if (S_.series === "solar") api.done();
        } },
      { text: "One line hides how unsure a forecast is. Draw a [[prediction-interval|band]] from four months of SPP's past misses, each as a percentage of the forecast. Choose how often actual demand should land inside it.",
        build: function (act, api) {
          enter({ chart: "day", show: "band", series: "demand" });
          var note;
          var said = function () {
            var d = DAYS[S_.day], b = band(fc, d.F, S_.level), o = outside(d.A, b);
            note.textContent = inSample(S_.level);
            api.saw(S_.level + "% band: " + spct(b.qlo) + " to " + spct(b.qhi) + " around the forecast. On " + d.label.short + ", " + o + " of 24 hours fell outside" + (o > 24 * (1 - b.level / 100) * 2 ? ": misses come in runs, and when a day goes wrong most of its hours do." : "."), o > 24 * (1 - b.level / 100) * 2);
          };
          seg(act, "Band", [["50", "50% band"], ["80", "80% band"], ["95", "95% band"]], S_.level, function (v) { S_.level = v; draw(false); said(); remember(); api.done(); });
          note = H("p", { class: "lx-hint" }, act);
          seg(act, "Day", [["typical", dayName("typical")], ["miss", dayName("miss")]], S_.day, function (v) { S_.day = v; draw(false); said(); remember(); });
          said();
        } },
      { text: "Misses are lopsided in cost. Schedule too little and you buy emergency power; too much and capacity sits unused. Slide an illustrative scheduling cushion above the forecast to find the cheapest.",
        build: function (act, api) {
          enter({ chart: "cost" });
          var s = LX.Slider(act, { label: "Cushion above the forecast", color: COL.spp, min: 0, max: 10, step: 0.5, unit: "%",
            hint: function () { return "Unused capacity $" + COSTS.over + "/MWh, emergency power $" + COSTS.under + "/MWh: illustrative prices."; },
            onChange: function (v) {
              S_.margin = Math.round(v * 10) / 1000; draw(false); remember(); var m = marginCost(fc, S_.margin, ERR);
              if (m.total <= NEAR * BEST.total) { api.saw((Math.abs(S_.margin - BEST.r) < 1e-9 ? "The cheapest cushion under these assumed prices: " : "Within 5% of the cheapest, " + spct(BEST.r) + ": ") + spct(S_.margin) + ", about " + gw(m.marginMW) + ". Short of the schedule in only " + pct(m.shortShare, 0) + " of hours, because a short MWh costs " + COSTS.under / COSTS.over + " times an unused one."); api.done(); }
              else api.saw("At " + spct(S_.margin) + ": " + money(m.total) + " per hour, short of the schedule in " + pct(m.shortShare, 0) + " of hours. " + (S_.margin < BEST.r ? "Try a wider cushion." : "Try a narrower cushion."), true);
            } });
          H("p", { class: "lx-hint", text: SHORT_NOTE }, act);
          s.set(Math.round(S_.margin * 1000) / 10);
          if (marginCost(fc, S_.margin, ERR).total <= NEAR * BEST.total) api.done();
        } },
      { text: "Now wind. Persistence for wind means “it keeps blowing as it is now”. Pick how far ahead you look and watch the average miss grow.",
        build: function (act, api) {
          enter({ chart: "wind" });
          var W = fc.wind_persistence;
          seg(act, "Hours ahead", W.lead_hours.map(function (L) { return [L, L + " h"]; }), S_.lead, function (v) {
            S_.lead = v; draw(false); remember(); var k = W.lead_hours.indexOf(v);
            api.saw(v + (v === 1 ? " hour" : " hours") + " ahead, “same as now” misses by " + W.mae_pct_of_max[k] + "% of SPP's largest wind hour on average. Operators also use weather forecasts as inputs; later lessons compare forecasting methods.");
            if (v >= 12) { api.done(); LX.progress.done(LESSON); }
          });
          if (S_.lead >= 12) api.done();
        } }
    ];
    var cards = LX.StepCards(live, { id: "l4-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    draw(false); LX.onTheme(function () { draw(false); });   // the band's opacity depends on day or night
    LX.demo(root, function (state) {   // standard states (core.js LX.demo) plus band and cost
      if (state === "mid") { S_.day = "miss"; cards.go(1); }
      else if (state === "band") { S_.day = "miss"; S_.level = "80"; cards.go(4); }
      else if (state === "cost") { S_.margin = BEST.r; cards.go(5); }
      else return null;
      return { view: state };
    }, cards);
    root.lxModel = { model: model, days: DAYS, best: BEST, state: function () { return S_; } };
    buildExplain(fc, DAYS, BEST);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(fc, DAYS, BEST) {
    var host = document.getElementById("l4-explain"); if (!host) return;
    var keep = host.querySelector(".lx-myths");     // the myth-or-fact cards are page markup (they work without JS)
    host.innerHTML = ""; host.classList.add("is-live");
    var mis = DAYS.miss, w = worst(mis.A, mis.F), Q = fc.jan_apr;
    var chainBox = H("div", { class: "lx-xcard" }, host);
    function chain() {
      var c = LX.store.get("l4-case", null), m = c && c.margin != null ? c.margin : null;
      chainBox.innerHTML = "";
      LX.CausalChain(chainBox, {
        title: "Cause and effect: when demand beats the forecast",
        links: [
          { title: "Forecast made a day ahead", text: "Plants are scheduled to meet it.", value: "SPP, " + mis.label.short },
          { title: "Demand comes in higher", text: "The forecast ran low all day.", value: "+" + gw(w.mw) + " at " + LX.fmt.hh(w.t) },
          { title: "Scheduled plants fall short", text: "Unless a cushion was scheduled above the forecast.", value: m != null ? "your cushion " + spct(m) : "a cushion above it" },
          { title: "Reserves and fast plants fill in", text: "Costly per MWh, but cheaper than the alternative.", value: "$" + COSTS.under + "/MWh, illustrative" },
          { title: "Last resort: disconnect some customers", text: "Only if available response cannot restore balance.", value: "see lesson 3" }
        ],
        note: "Under these illustrative prices a short MWh costs " + COSTS.under / COSTS.over + " times an unused one, so the cheapest cushion leans high: " + spct(BEST.r) + ". Real reserve rules also weigh plant trips, outages and response speed."
      });
    }
    chain(); LX.on("l4-change", chain);
    var row = H("div", { class: "lx-row2" }, host), c2 = H("div", { class: "lx-xcard" }, row), c3 = H("div", { class: "lx-xcard" }, row);
    var typ = DAYS.typical, PM = Q.persistence_mae_mw;
    LX.CompareTable(c2, {
      title: "Four ways to score a forecast", text: true,   // "Misleads when" is words: on phones each score is a card of labelled lines
      columns: [{ key: "name", label: "Score", main: true }, { key: "spp", label: "SPP, Jan–Apr 2025", num: true }, { key: "trap", label: "Misleads when" }],
      rows: [
        { key: "mae", color: "var(--lx-accent)", name: "MAE", note: "average miss, in GW", spp: { text: gw2(Q.mae_mw) }, trap: "comparing grids of different sizes" },
        { key: "mape", color: "var(--lx-warn)", name: "MAPE", note: "average miss, in % of actual", spp: { text: pct(Q.mape) }, trap: "actual values get near zero (solar, wind)" },
        { key: "bias", color: "var(--lx-tier-4)", name: "[[forecast-bias|Bias]]", note: "average signed miss", spp: { text: "+" + gw2(Q.mean_error_mw) }, trap: "big misses in both directions cancel out" },
        { key: "skill", color: "var(--lx-good)", name: "[[skill-score|Skill]]", note: "MAE against persistence", spp: { text: pct(1 - PM.spp_same_hours_yesterday / PM.yesterday, 0) + " better" }, trap: "the baseline is too easy to beat" }
      ],
      sorts: [{ label: "As listed", order: ["mae", "mape", "bias", "skill"], note: "Positive bias: demand came in above the forecast on average. Skill is against “same hour yesterday”." }]
    });
    if (keep) { H("h3", { text: "Myth or fact" }, H("header", { class: "lx-x-head" }, c3)); c3.appendChild(keep); }
  }

  LX.mount("forecasts", function (live, data, root) { view(live, data, root); });
})();
