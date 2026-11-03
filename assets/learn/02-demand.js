// 02-demand.js — Lesson 2, "Why does electricity demand rise and fall?" (step-card form, W1, 2026-11-02).
//
// Data: assets/learn/data/town_days.json (named real days) and town_year.json (all 8,760 hours of 2025) on the Southwest
// Power Pool grid, from EIA-930, as shapes in thousandths of SPP's 2025 peak hour; assets/learn/data/02-demand.json (which
// days and week to show, the slider ranges, sourced anchors). Prairie Town's demand = shape x town_peak_mw (450 MW, the
// scale lesson 0 uses: its highest hour of 2025 is 450 MW). A hypothetical solar farm of S MW follows SPP's real solar
// shape for the chosen day (shape = output / SPP's 2025 maximum solar hour).
//
// Clock: town_year index i is the hour ending at start_utc + i (UTC). clock() turns it into the local hour that starts
// one hour earlier, in U.S. Central time with daylight saving (second Sunday of March 02:00 to first Sunday of November
// 02:00), so hour h on a date means h:00 to h+1:00, as in town_days.json and lesson 0.
//
// Model (closed form):
//   weekly rhythm  mean of weekend hours vs weekday hours, overall and hour by hour
//   seasons        each day's lowest and highest hour; each month's highest hour
//   load-duration  the 8,760 hours sorted from highest to lowest; hours above a line; the share of the year's energy
//                  that lies above the line, sum(max(0, d - line)) / sum(d)
//   load factor    average / peak
//   duck curve     net demand(t) = demand(t) - S x solar shape(t); its midday low, and the steepest 3-hour climb after noon
// Every number the page states comes from this model or from the sourced anchors; _tests/learn/test_02-demand.js checks
// them against the .qmd, and checks the clock against the separately stored days of town_days.json.
//
// The hourly line and area charts (the curriculum's "i-curve-viewer") are drawn by the shared LX.Plot (components/plot.js,
// W1 integration); hourly() below only turns this lesson's series into its spec. Lesson-local: YearDots (8,760 hours as
// dots on a canvas that re-sort into a load-duration curve, with a month highlight and a threshold line).
(function () {
  "use strict";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // ---------------------------------------------------------------- pure model
  function num(v, d) { return v.toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function hh(t) { t = ((Math.floor(t) % 24) + 24) % 24; return (t < 10 ? "0" : "") + t + ":00"; }
  function sundayUTC(Y, m, n) { var first = new Date(Date.UTC(Y, m, 1)).getUTCDay(); return Date.UTC(Y, m, 1 + (7 - first) % 7 + 7 * (n - 1)); }
  function clock(year) {
    var t0 = Date.parse(year.start_utc + "Z") - 3600000, n = year.demand.length, Y = new Date(t0 + 12 * 3600000).getUTCFullYear();
    var on = sundayUTC(Y, 2, 2) + 8 * 3600000, off = sundayUTC(Y, 10, 1) + 7 * 3600000;
    var C = { date: [], hour: [], dow: [], month: [], day: [], dst: [on, off] }, k = -1, last = null;
    for (var i = 0; i < n; i++) {
      var ts = t0 + i * 3600000, L = new Date(ts + (ts >= on && ts < off ? -5 : -6) * 3600000), ds = L.toISOString().slice(0, 10);
      if (ds !== last) { k++; last = ds; }
      C.date.push(ds); C.hour.push(L.getUTCHours()); C.dow.push((L.getUTCDay() + 6) % 7); C.month.push(L.getUTCMonth()); C.day.push(k);
    }
    C.days = k + 1;
    return C;
  }
  function argmax(a, i0, i1) { var b = i0 || 0; for (var i = b; i <= (i1 == null ? a.length - 1 : i1); i++) if (a[i] > a[b]) b = i; return b; }
  function argmin(a, i0, i1) { var b = i0 || 0; for (var i = b; i <= (i1 == null ? a.length - 1 : i1); i++) if (a[i] < a[b]) b = i; return b; }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function niceUp(v) { var p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9)))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function prepare(D, days, year) {
    var PK = D.town_peak_mw, mw = function (v) { return v / 1000 * PK; };
    var C = clock(year), dem = year.demand.map(mw), n = dem.length;
    function day(spec) { var d = days.days[spec.key]; return { key: spec.key, label: spec.label, date: d.date, demand: d.demand.map(mw), solar: d.solar.map(function (v) { return v / 1000; }) }; }
    var summer = day(D.days.summer), winter = day(D.days.winter), duck = day(D.days.duck);
    var s = { tmin: argmin(summer.demand), tmax: argmax(summer.demand) };
    s.min = summer.demand[s.tmin]; s.max = summer.demand[s.tmax]; s.late = summer.demand[23];
    var w = { tam: argmax(winter.demand, 4, 11), tpm: argmax(winter.demand, 15, 22) };
    w.am = winter.demand[w.tam]; w.pm = winter.demand[w.tpm]; w.tlow = argmin(winter.demand, w.tam, w.tpm); w.low = winter.demand[w.tlow];
    // weeks: Monday 00:00 to Sunday 23:00, complete weeks only
    var weeks = [], cur = null;
    for (var i = 0; i < n; i++) {
      if (C.dow[i] === 0 && C.hour[i] === 0 && (i === 0 || C.date[i] !== C.date[i - 1])) { cur = { start: C.date[i], idx: [] }; weeks.push(cur); }
      if (cur) cur.idx.push(i);
    }
    weeks = weeks.filter(function (x) { return x.idx.length >= 167 && C.dow[x.idx[x.idx.length - 1]] === 6 && C.hour[x.idx[x.idx.length - 1]] === 23; });
    // weekday and weekend, overall and by hour of day
    var wd = [], we = [], nwd = [], nwe = [], sWd = 0, sWe = 0, cWd = 0, cWe = 0;
    for (var h = 0; h < 24; h++) { wd.push(0); we.push(0); nwd.push(0); nwe.push(0); }
    for (i = 0; i < n; i++) { if (C.dow[i] >= 5) { we[C.hour[i]] += dem[i]; nwe[C.hour[i]]++; sWe += dem[i]; cWe++; } else { wd[C.hour[i]] += dem[i]; nwd[C.hour[i]]++; sWd += dem[i]; cWd++; } }
    wd = wd.map(function (v, k) { return v / nwd[k]; }); we = we.map(function (v, k) { return v / nwe[k]; });
    var gapByHour = wd.map(function (v, k) { return 1 - we[k] / v; }), gapH = argmax(gapByHour);
    // days and months
    var dmin = [], dmax = [], dmonth = [], ddate = [];
    for (i = 0; i < n; i++) {
      var d = C.day[i];
      if (dmin[d] == null) { dmin[d] = dem[i]; dmax[d] = dem[i]; dmonth[d] = C.month[i]; ddate[d] = C.date[i]; }
      else { dmin[d] = Math.min(dmin[d], dem[i]); dmax[d] = Math.max(dmax[d], dem[i]); }
    }
    var mmax = [], mmin = [], mmean = [], mcount = [], mtop = [];
    for (var mo = 0; mo < 12; mo++) { mmax.push(-Infinity); mmin.push(Infinity); mmean.push(0); mcount.push(0); mtop.push(-1); }
    for (i = 0; i < n; i++) { mo = C.month[i]; if (dem[i] > mmax[mo]) { mmax[mo] = dem[i]; mtop[mo] = i; } mmin[mo] = Math.min(mmin[mo], dem[i]); mmean[mo] += dem[i]; mcount[mo]++; }
    mmean = mmean.map(function (v, k) { return v / mcount[k]; });
    // the load-duration curve
    var order = dem.map(function (v, k) { return k; }).sort(function (a, b) { return dem[b] - dem[a] || a - b; });
    var rank = new Array(n); order.forEach(function (k, r) { rank[k] = r; });
    var sorted = order.map(function (k) { return dem[k]; }), total = sum(dem), peakI = argmax(dem);
    var Wd = {
      PK: PK, C: C, dem: dem, n: n, summer: summer, winter: winter, duckDay: duck, s: s, w: w, weeks: weeks,
      week: { wd: wd, we: we, gapMean: 1 - (sWe / cWe) / (sWd / cWd), gapByHour: gapByHour, gapH: gapH, gapMax: gapByHour[gapH] },
      daily: { min: dmin, max: dmax, month: dmonth, date: ddate },
      months: { max: mmax, min: mmin, mean: mmean, top: mtop, peak: argmax(mmax), quiet: argmin(mmax) },
      sorted: sorted, rank: rank, order: order, totalMWh: total, mean: total / n, peak: dem[peakI], peakI: peakI, loadFactor: total / n / dem[peakI],
      solarShare: days.stats.share_of_net_generation.solar, spp: days.stats
    };
    return Wd;
  }
  function hoursAbove(Wd, thr) { var c = 0; for (var i = 0; i < Wd.n; i++) if (Wd.dem[i] > thr + 1e-9) c++; return c; }
  function energyAbove(Wd, thr) { var e = 0; for (var i = 0; i < Wd.n; i++) e += Math.max(0, Wd.dem[i] - thr); return e / Wd.totalMWh; }
  function duck(Wd, S) {
    var d = Wd.duckDay, net = d.demand.map(function (v, t) { return v - S * d.solar[t]; });
    var tmin = argmin(net, 6, 18), best = -Infinity, from = 12;
    for (var t = 12; t <= 20; t++) if (net[t + 3] - net[t] > best + 1e-9) { best = net[t + 3] - net[t]; from = t; }
    var tpk = argmax(net, 12, 23);
    return { S: S, net: net, solar: d.solar.map(function (v) { return v * S; }), min: net[tmin], tmin: tmin, ramp: best, rampFrom: from, rampTo: from + 3,
             peak: net[tpk], tpeak: tpk, neg: net.filter(function (v) { return v < -1e-9; }).length };
  }
  function predictAnswer(D, Wd) { var o = D.predict.options; return o.reduce(function (b, x) { return Math.abs(x - Wd.s.tmax) < Math.abs(b - Wd.s.tmax) ? x : b; }, o[0]); }
  function weekLabel(Wd, k) {
    var w = Wd.weeks[k], a = new Date(w.start + "T00:00:00Z"), b = new Date(a.getTime() + 6 * 86400000);
    return a.getUTCDate() + (a.getUTCMonth() === b.getUTCMonth() ? "" : " " + MONTH[a.getUTCMonth()]) + "–" + b.getUTCDate() + " " + MONTH[b.getUTCMonth()];
  }
  function weekStats(Wd, k) { var v = Wd.weeks[k].idx.map(function (i) { return Wd.dem[i]; }); return { min: Math.min.apply(null, v), max: Math.max.apply(null, v) }; }
  // the static figure readers without JavaScript see (the .qmd holds exactly this string; the test regenerates it)
  function fallbackSVG(Wd) {
    var W = 720, Hh = 270, l = 46, r = 12, t = 14, b = 30, iw = W - l - r, ih = Hh - t - b, yMax = 500;
    var x = function (i) { return (l + (i + 0.5) / 24 * iw).toFixed(1); }, y = function (v) { return (t + ih - v / yMax * ih).toFixed(1); };
    var s = '<svg viewBox="0 0 ' + W + " " + Hh + '" role="img" aria-labelledby="t2-static-title">\n<title id="t2-static-title">Prairie Town\'s demand on two real days of 2025. ' +
      Wd.summer.label + ": one hump, from " + Math.round(Wd.s.min) + " MW at " + hh(Wd.s.tmin) + " to " + Math.round(Wd.s.max) + " MW at " + hh(Wd.s.tmax) + ". " +
      Wd.winter.label + ": two humps, " + Math.round(Wd.w.am) + " MW at " + hh(Wd.w.tam) + " and " + Math.round(Wd.w.pm) + " MW at " + hh(Wd.w.tpm) + ".</title>\n<g>";
    for (var v = 0; v <= yMax; v += 100) s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--lx-line)"/><text x="' + (l - 6) + '" y="' + (+y(v) + 4).toFixed(1) + '" text-anchor="end" font-size="13" fill="var(--lx-ink-3)">' + v + "</text>";
    [0, 6, 12, 18, 24].forEach(function (h) { s += '<text x="' + (l + h / 24 * iw).toFixed(1) + '" y="' + (Hh - 8) + '" text-anchor="' + (h === 0 ? "start" : h === 24 ? "end" : "middle") + '" font-size="13" fill="var(--lx-ink-3)">' + (h < 10 ? "0" : "") + h + ":00</text>"; });
    s += "</g>\n";
    [[Wd.winter.demand, "var(--lx-wind)"], [Wd.summer.demand, "var(--lx-cc)"]].forEach(function (p) {
      s += '<polyline fill="none" stroke="' + p[1] + '" stroke-width="3" stroke-linejoin="round" points="' + p[0].map(function (v, i) { return x(i) + "," + y(v); }).join(" ") + '"/>\n';
    });
    return s + "</svg>";
  }
  var model = { MON: MON, MONTH: MONTH, num: num, hh: hh, clock: clock, prepare: prepare, hoursAbove: hoursAbove, energyAbove: energyAbove, duck: duck,
                predictAnswer: predictAnswer, weekLabel: weekLabel, weekStats: weekStats, fallbackSVG: fallbackSVG, niceUp: niceUp, argmax: argmax, argmin: argmin };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, LESSON = "02-demand";
  var pct = function (f, d) { return num(f * 100, d == null ? 0 : d) + "%"; };

  // ---- hourly charts on the shared LX.Plot: one value per hour (drawn mid-hour), a MW axis from zero (or below it,
  //      shaded), hour shading, marks, a readout and the text version as a table (a day's chart marks every 12 hours on
  //      phones). o: n(), title(), label(), series()
  //      [{label, color, values, hidden, area, dash, width}], shade() [[from, to, label]], xticks() [{at | i, label}],
  //      marks() [{i, v, label, color, pos, vline, n}], tipHead(i), altHead, yMax, yMin
  function hourly(host, o) {
    var P = LX.Plot(host, { caption: !!o.title, box: true, text: "Text version of the chart" });
    function spec() {
      var series = o.series().filter(function (s) { return !s.hidden; }), n = o.n(), all = [];
      series.forEach(function (s) { all = all.concat(s.values); });
      var yMax = o.yMax || niceUp(Math.max.apply(null, all)), lo = Math.min.apply(null, all.concat([o.yMin || 0]));
      var step = (yMax - lo) <= 300 ? 50 : (yMax - lo) <= 800 ? 100 : 200, yMin = lo < 0 ? -Math.ceil(-lo / step - 1e-9) * step : 0;
      var rows = [], every = n > 48 ? 6 : 1, xt = o.xticks().map(function (t) { return [t.at != null ? t.at : t.i + 0.5, t.label]; });
      for (var i = 0; i < n; i += every) rows.push([o.tipHead(i)].concat(series.map(function (s) { return s.values[i] == null ? "" : num(s.values[i]); })));
      return {
        caption: o.title ? o.title() : "", aria: o.label(),
        x: { min: 0, max: n, ticks: xt, ticksN: n === 24 ? xt.filter(function (t) { return t[0] % 12 === 0; }) : xt },
        y: { min: yMin, max: yMax, step: step, fmt: function (v) { return num(v); }, unit: "MW", zero: true },
        margin: { l: 44, r: 10, t: 22, b: 26 },
        spans: (o.shade ? o.shade() : []).map(function (sh) { return { x0: sh[0], x1: sh[1], label: sh[2] }; }),
        hbands: yMin < 0 ? [{ y0: yMin, y1: 0, color: "var(--lx-bad-soft)", op: 0.6, label: "Below zero: more solar than demand" }] : [],
        lines: series.map(function (s) { return { values: s.values, x0: 0.5, color: s.color, width: s.width == null ? 2.5 : s.width, dash: s.dash, area: s.area }; }),
        marks: (o.marks ? o.marks() : []).map(function (mk) { return { x: mk.i + 0.5, y: mk.v, label: mk.label, color: mk.color, kind: "dot", n: mk.n, pos: mk.pos, vline: mk.vline, dot: mk.dot }; }),
        legend: series.map(function (s) { return { label: s.label, color: s.color, dash: !!s.dash }; }),
        tip: function (x) {
          var i = Math.max(0, Math.min(n - 1, Math.floor(x)));
          return "<div><b>" + LX.esc(o.tipHead(i)) + "</b></div>" + series.map(function (s) { return s.values[i] == null ? "" : "<div><span>" + LX.esc(s.label) + "</span><b>" + num(s.values[i]) + " MW</b></div>"; }).join("");
        },
        tipStep: 1,
        text: { head: [o.altHead || "Hour"].concat(series.map(function (s) { return s.label + " (MW)"; })), rows: rows, note: every > 1 ? "Every " + every + "th hour shown." : null }
      };
    }
    return { el: P.box, render: function () { P.render(spec()); } };
  }

  // ---- YearDots: 8,760 hours as dots that re-sort into a load-duration curve (canvas; text version alongside)
  function YearDots(host, Wd) {
    var box = H("div", { class: "t2-year" }, host), cap = H("p", { class: "t2-cv-t", "aria-live": "polite" }, box);
    var wrap = H("div", { class: "t2-canvas" }, box), cv = H("canvas", { role: "img" }, wrap);
    var legend = H("div", { class: "lx-legend" }, box);
    var alt = H("details", { class: "lx-textalt" }, box); H("summary", { text: "Text version of the chart" }, alt);
    var altBox = H("div", null, alt);
    var st = { p: 0, month: -1, thr: null }, anim = null, yMax = niceUp(Wd.PK);
    var ease = function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };
    function draw() {
      var W = Math.max(280, wrap.clientWidth || 640), Hh = W < 480 ? 220 : 260, dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); cv.style.width = W + "px"; cv.style.height = Hh + "px";
      var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
      var T = LX.tokens(document.body, ["ink", "ink-3", "line", "cc", "pk", "surface"]), col = function (c, a) { return "rgba(" + c.join(",") + "," + a + ")"; };
      var font = getComputedStyle(document.body).getPropertyValue("--lx-f-mono") || "monospace";
      var m = { l: 44, r: 10, t: 22, b: 26 }, iw = W - m.l - m.r, ih = Hh - m.t - m.b, n = Wd.n;
      var y = function (v) { return m.t + (1 - v / yMax) * ih; }, e = ease(st.p);
      g.font = "11px " + font; g.fillStyle = col(T["ink-3"], 1); g.textAlign = "right";
      for (var v = 0; v <= yMax; v += 100) { g.fillStyle = col(T.line, 1); g.fillRect(m.l, Math.round(y(v)), iw, 1); g.fillStyle = col(T["ink-3"], 1); g.fillText(num(v), m.l - 6, y(v) + 4); }
      g.fillText("MW", m.l - 6, 12);
      g.textAlign = "center";
      if (e < 0.5) MON.forEach(function (mn, k) { var i0 = Wd.C.month.indexOf(k), i1 = Wd.C.month.lastIndexOf(k); g.fillText(W < 480 ? mn[0] : mn, m.l + ((i0 + i1) / 2 + 0.5) / n * iw, Hh - 8); });
      else { var hx = W < 480 ? [0, 4380, 8760] : [0, 2000, 4000, 6000, 8760];
        hx.forEach(function (h, k) { g.textAlign = k === 0 ? "left" : k === hx.length - 1 ? "right" : "center"; g.fillText(num(h) + (k ? " h" : ""), m.l + h / n * iw, Hh - 8); }); }
      var px = function (i) { return m.l + ((1 - e) * i + e * Wd.rank[i] + 0.5) / n * iw; };
      var r = W < 480 ? 1.3 : 1.6;
      g.fillStyle = col(T["ink-3"], 0.42);
      for (var i = 0; i < n; i++) { if (Wd.C.month[i] === st.month || (st.thr != null && Wd.dem[i] > st.thr)) continue; g.fillRect(px(i) - r / 2, y(Wd.dem[i]) - r / 2, r, r); }
      if (st.thr != null) { g.fillStyle = col(T.pk, 0.95); for (i = 0; i < n; i++) if (Wd.dem[i] > st.thr && Wd.C.month[i] !== st.month) g.fillRect(px(i) - r, y(Wd.dem[i]) - r, 2 * r, 2 * r); }
      if (st.month >= 0) { g.fillStyle = col(T.cc, 0.95); for (i = 0; i < n; i++) if (Wd.C.month[i] === st.month) g.fillRect(px(i) - r, y(Wd.dem[i]) - r, 2 * r, 2 * r); }
      if (st.thr != null) {
        g.strokeStyle = col(T.ink, 1); g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(m.l, y(st.thr)); g.lineTo(m.l + iw, y(st.thr)); g.stroke(); g.setLineDash([]);
        g.font = "600 12px " + font; g.textAlign = "right"; g.fillStyle = col(T.ink, 1); g.fillText(num(st.thr) + " MW", m.l + iw - 4, y(st.thr) - 6);
      }
      cv.setAttribute("aria-label", label());
    }
    function label() {
      var s = st.p >= 1 ? "Load-duration curve: the 8,760 hours of 2025 sorted from " + num(Wd.peak) + " MW down to " + num(Wd.sorted[Wd.n - 1]) + " MW." :
        "Prairie Town's demand in every hour of 2025, one dot per hour, by date: highest in July and August, a second winter season, lowest in spring and autumn.";
      if (st.month >= 0) s += " " + MONTH[st.month] + " highlighted.";
      if (st.thr != null) s += " " + num(hoursAbove(Wd, st.thr)) + " hours above " + num(st.thr) + " MW.";
      return s;
    }
    function legendPaint() {
      legend.innerHTML = "";
      var add = function (c, t) { var sp = H("span", null, legend); H("i", { style: "--c:" + c }, sp); H("span", { text: t }, sp); };
      add("var(--lx-ink-3)", "One hour of 2025");
      if (st.month >= 0) add("var(--lx-cc)", MONTH[st.month]);
      if (st.thr != null) add("var(--lx-pk)", "Above the line");
      cap.textContent = st.p >= 1 ? "The same 8,760 hours, sorted from highest to lowest demand" : "Every hour of 2025, in date order";
    }
    function paintAlt() {
      altBox.innerHTML = "";
      var tb = H("table", { class: "lx-mini-table" }, H("div", { class: "lx-scroll-x" }, altBox)), hr = H("tr", null, H("thead", null, tb));
      ["Month", "Highest hour (MW)", "Average (MW)", "Lowest hour (MW)"].forEach(function (t) { H("th", { scope: "col", text: t }, hr); });
      var body = H("tbody", null, tb);
      MONTH.forEach(function (mn, k) { var tr = H("tr", null, body); [mn, num(Wd.months.max[k]), num(Wd.months.mean[k]), num(Wd.months.min[k])].forEach(function (t) { H("td", { text: t }, tr); }); });
      var t2 = H("table", { class: "lx-mini-table" }, H("div", { class: "lx-scroll-x" }, altBox)), h2 = H("tr", null, H("thead", null, t2));
      ["Sorted: hours", "Demand at least (MW)"].forEach(function (t) { H("th", { scope: "col", text: t }, h2); });
      var b2 = H("tbody", null, t2);
      [1, 100, 500, 1000, 2000, 4380, 6000, 8000, 8760].forEach(function (k) { var tr = H("tr", null, b2); H("td", { text: num(k) }, tr); H("td", { text: num(Wd.sorted[k - 1]) }, tr); });
    }
    function sort(on, cb) {
      var to = on ? 1 : 0;
      if (anim) cancelAnimationFrame(anim);
      if (LX.reduced()) { st.p = to; legendPaint(); draw(); if (cb) cb(); return; }
      var from = st.p, t0 = null, dur = 1600;
      (function frame(ts) {
        if (t0 == null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur); st.p = from + (to - from) * k; draw();
        if (k < 1) anim = requestAnimationFrame(frame); else { anim = null; legendPaint(); draw(); if (cb) cb(); }
      })(performance.now());
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(wrap)) draw(); }).observe(wrap);
    LX.onTheme(function () { if (LX.visible(wrap)) draw(); });
    legendPaint(); paintAlt();
    return { el: box, draw: draw, sort: sort, sorted: function () { return st.p >= 1; },
             month: function (k) { st.month = k; legendPaint(); draw(); }, thr: function (v) { st.thr = v; legendPaint(); draw(); } };
  }

  // ---- step cards
  function view(live, data, root) {
    var D = data["02_demand"], Wd = prepare(D, data.town_days, data.town_year), ans = predictAnswer(D, Wd);
    var P = LX.store.get("t2-log", {}) || {};
    function keep(k, v) { P[k] = v; LX.store.set("t2-log", P); LX.emit("t2-log", P); }
    var guess = LX.progress.guess("t2-peak"), showWinter = false, wk = D.week.start - 1, solarMW = D.solar.start;
    var townSolar = data.town.fleet.solar.mw;
    // the charts, built once and moved into each step that needs them
    var dayChart = hourly(H("div"), {
      n: function () { return 24; }, yMax: niceUp(Wd.PK),
      title: function () { return "Prairie Town's demand, hour by hour"; },
      label: function () { return "Prairie Town's demand on " + Wd.summer.label + (showWinter ? " and " + Wd.winter.label : "") + "; peak " + num(Wd.s.max) + " MW at " + hh(Wd.s.tmax) + "."; },
      series: function () { return [{ label: Wd.winter.label, color: "var(--lx-wind)", values: Wd.winter.demand, hidden: !showWinter }, { label: Wd.summer.label, color: "var(--lx-cc)", values: Wd.summer.demand, area: 0.12 }]; },
      xticks: function () { return [0, 6, 12, 18, 24].map(function (h) { return { at: h, label: h === 24 ? "24:00" : hh(h) }; }); },
      marks: function () {
        var mk = [{ i: Wd.s.tmax, v: Wd.s.max, label: "Peak " + num(Wd.s.max) + " MW", color: "var(--lx-cc)" }];
        if (guess) mk.push({ i: +guess, v: Wd.summer.demand[+guess], vline: true, label: "Your guess" });
        if (showWinter) mk.push({ i: Wd.w.tam, v: Wd.w.am, label: num(Wd.w.am) + " MW", color: "var(--lx-wind)" }, { i: Wd.w.tpm, v: Wd.w.pm, label: num(Wd.w.pm) + " MW", color: "var(--lx-wind)", pos: "below" });
        return mk;
      },
      tipHead: function (i) { return hh(i) + "–" + hh(i + 1); }
    });
    var weekChart = hourly(H("div"), {
      n: function () { return Wd.weeks[wk].idx.length; }, yMax: niceUp(Wd.PK),
      title: function () { return "Week " + (wk + 1) + " of " + Wd.weeks.length + ": " + weekLabel(Wd, wk) + " 2025"; },
      label: function () { var s = weekStats(Wd, wk); return "Prairie Town's demand, week of " + weekLabel(Wd, wk) + " 2025: from " + num(s.min) + " to " + num(s.max) + " MW; the weekend is shaded."; },
      series: function () { return [{ label: "Demand", color: "var(--lx-demand)", values: Wd.weeks[wk].idx.map(function (i) { return Wd.dem[i]; }), area: 0.1 }]; },
      shade: function () { var ix = Wd.weeks[wk].idx, a = ix.findIndex(function (i) { return Wd.C.dow[i] === 5; }); return [[a, ix.length, "Weekend"]]; },
      xticks: function () {
        var ix = Wd.weeks[wk].idx, out = [];
        ix.forEach(function (i, k) { if (Wd.C.hour[i] === 12 && (k === 0 || Wd.C.date[i] !== Wd.C.date[ix[k - 1]])) out.push({ i: k, label: DOW[Wd.C.dow[i]] }); });
        return out;
      },
      tipHead: function (k) { var i = Wd.weeks[wk].idx[k]; return DOW[Wd.C.dow[i]] + " " + +Wd.C.date[i].slice(8) + " " + MON[Wd.C.month[i]] + ", " + hh(Wd.C.hour[i]); },
      altHead: "Hour"
    });
    var year = YearDots(H("div"), Wd);
    var duckChart = hourly(H("div"), {
      n: function () { return 24; }, yMax: niceUp(Wd.PK),
      title: function () { return Wd.duckDay.label + ": demand, solar and net demand"; },
      label: function () { var k = duck(Wd, solarMW); return "With " + solarMW + " MW of solar on " + Wd.duckDay.label + ", net demand falls to " + num(k.min) + " MW at " + hh(k.tmin) + " and climbs " + num(k.ramp) + " MW from " + hh(k.rampFrom) + " to " + hh(k.rampTo) + "."; },
      series: function () {
        var k = duck(Wd, solarMW);
        return [{ label: "Demand", color: "var(--lx-ink-3)", values: Wd.duckDay.demand, dash: "6 4", width: 2 },
                { label: "Solar", color: "var(--lx-solar)", values: k.solar, area: 0.35, width: 1.5 },
                { label: "Net demand", color: "var(--lx-ink)", values: k.net, width: 3 }];
      },
      marks: function () {
        var k = duck(Wd, solarMW); if (!solarMW) return [];
        return [{ i: k.tmin, v: k.min, label: "Belly: " + num(k.min) + " MW", pos: "below" }, { i: k.rampTo, v: k.net[k.rampTo], label: "Neck: +" + num(k.ramp) + " MW in 3 h" }];
      },
      xticks: function () { return [0, 6, 12, 18, 24].map(function (h) { return { at: h, label: h === 24 ? "24:00" : hh(h) }; }); },
      tipHead: function (i) { return hh(i) + "–" + hh(i + 1); }
    });
    function attach(act, c) { act.appendChild(c.el); requestAnimationFrame(function () { (c.render || c.draw)(); }); }
    var s0 = duck(Wd, 0), s200 = duck(Wd, D.solar.target);
    var steps = [
      { text: Wd.summer.label + " was the busiest day of the year on the Southwest Power Pool, the real grid whose shapes Prairie Town follows. When did its [[demand|demand]] peak?",
        build: function (act, api) {
          LX.Predict(act, { id: "t2-peak", options: D.predict.options.map(function (h) { return { value: String(h), label: h === 12 ? "Around noon" : "Around " + hh(h) }; }),
            lockText: "Locked in. The next step shows the real day.", onPick: function (v) { guess = v; keep("guess", v); api.done(); } });
          if (guess) api.done();
        } },
      { text: "Here is that day, scaled to Prairie Town. Now add a cold winter day, " + Wd.winter.label + ", and compare the two shapes.",
        build: function (act, api) {
          var rv = H("div", null, act);
          H("div", { class: "lx-saw" + (guess && +guess !== ans ? " no" : ""), html: LX.icon(guess && +guess === ans ? "check" : "question") + "<div><b>" +
            (guess ? (+guess === ans ? "You called it." : "You guessed " + (+guess === 12 ? "noon" : hh(+guess)) + ".") : "The answer.") + "</b> The peak, " + num(Wd.s.max) + " MW, came in the hour from " + hh(Wd.s.tmax) + " to " + hh(Wd.s.tmax + 1) +
            ": buildings had soaked up heat all day.</div>" }, rv);
          var b = H("button", { class: "lx-btn ghost small", type: "button", "aria-pressed": showWinter ? "true" : "false", html: LX.icon("cloud") + "Add " + Wd.winter.label }, act);
          attach(act, dayChart);
          function upd() {
            b.setAttribute("aria-pressed", showWinter ? "true" : "false"); b.innerHTML = LX.icon("cloud") + (showWinter ? "Hide " : "Add ") + Wd.winter.label; dayChart.render();
            if (showWinter) {
              api.done(); keep("winter", true);
              api.saw("Summer: one hump, from " + num(Wd.s.min) + " MW at " + hh(Wd.s.tmin) + " to " + num(Wd.s.max) + " MW at " + hh(Wd.s.tmax) + " (cooling). Winter: two humps, " +
                num(Wd.w.am) + " MW at " + hh(Wd.w.tam) + " and " + num(Wd.w.pm) + " MW at " + hh(Wd.w.tpm) + " (heating and lights when people are home).");
            }
          }
          b.addEventListener("click", function () { showWinter = !showWinter; upd(); });
          if (showWinter) upd();
        } },
      { text: "Slide through the " + Wd.weeks.length + " full weeks of 2025. Weekends are shaded. Look for the weekly rhythm, and for how the whole level shifts with the season.",
        build: function (act, api) {
          var sl = LX.Slider(act, { label: "Week of 2025", min: 1, max: Wd.weeks.length, step: 1, unit: "of " + Wd.weeks.length, color: "var(--lx-demand)",
            hint: function () { var s = weekStats(Wd, wk); return weekLabel(Wd, wk) + ": " + num(s.min) + " to " + num(s.max) + " MW."; },
            onChange: function (v) {
              wk = v - 1; weekChart.render(); keep("week", v);
              if (v !== D.week.start) {
                api.done();
                api.saw("Across 2025, weekend hours ran " + pct(Wd.week.gapMean) + " below weekday hours on average, and up to " + pct(Wd.week.gapMax) + " lower around " + hh(Wd.week.gapH) +
                  ", when work starts later. The season moves the whole week up or down far more.");
              }
            } });
          sl.set(wk + 1);
          attach(act, weekChart);
        } },
      { text: "Each dot is one hour of 2025: 8,760 dots, in date order. Tap the month whose hours climb highest.",
        build: function (act, api) {
          var row = H("div", { class: "t2-months", role: "group", "aria-label": "Months" }, act), fb = H("div", { "aria-live": "polite" }, act);
          if (year.sorted()) year.sort(false);
          MON.forEach(function (mn, k) {
            H("button", { class: "lx-choice", type: "button", "aria-pressed": P.month === k ? "true" : "false", text: mn, "aria-label": MONTH[k], onclick: function (ev) {
              [].forEach.call(row.children, function (bb) { bb.setAttribute("aria-pressed", "false"); }); ev.currentTarget.setAttribute("aria-pressed", "true");
              year.month(k); keep("month", k);
              var top = Wd.months.peak, ok = k === top;
              fb.innerHTML = "";
              H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : MONTH[k] + " peaks at " + num(Wd.months.max[k]) + " MW.") + "</b> " +
                (ok ? "" : "Try the summer months. ") + "</div>" }, fb);
              api.done();
              api.saw(MONTH[top] + " holds the top hour, " + num(Wd.months.max[top]) + " MW on the " + ordinal(+Wd.C.date[Wd.months.top[top]].slice(8)) + ". Winter cold snaps make a second, lower season (up to " +
                num(Math.max(Wd.months.max[0], Wd.months.max[1], Wd.months.max[11])) + " MW); " + MONTH[Wd.months.quiet] + " is the quietest month, peaking at " + num(Wd.months.max[Wd.months.quiet]) + " MW.");
            } }, row);
          });
          attach(act, year);
          year.month(P.month != null ? P.month : -1);
        } },
      { text: "Now line up the same 8,760 hours from highest to lowest demand. Press Sort and watch the year turn into a [[load-duration-curve|load-duration curve]].",
        build: function (act, api) {
          var b = H("button", { class: "lx-btn small", type: "button", html: LX.icon("bars") + "Sort the hours" }, act);
          year.month(-1); attach(act, year);
          function after() {
            b.innerHTML = LX.icon("back") + "Back to date order"; api.done(); keep("sorted", true);
            api.saw("Read it left to right: the busiest hours are few, so the curve falls fast and then flattens. The area under it is still the year's energy, " + num(Wd.totalMWh / 1000) + " GWh.");
          }
          b.addEventListener("click", function () { if (year.sorted()) { year.sort(false); b.innerHTML = LX.icon("bars") + "Sort the hours"; } else year.sort(true, after); });
          if (year.sorted()) after();
        } },
      { text: "Drag the line down to " + D.threshold.target + "% of the peak, " + num(Wd.peak * D.threshold.target / 100) + " MW. How many hours of the year need more power than that?",
        build: function (act, api) {
          year.month(-1); if (!year.sorted()) year.sort(true);
          var sl = LX.Slider(act, { label: "Line at", min: D.threshold.min, max: D.threshold.max, step: D.threshold.step, unit: "% of peak", color: "var(--lx-pk)",
            hint: function () { return "= " + num(Wd.peak * sl0() / 100) + " MW"; }, onChange: upd });
          function sl0() { return sl ? sl.val() : D.threshold.start; }
          var out = H("p", { class: "t2-read", "aria-live": "polite" }, act);
          attach(act, year);
          function upd() {
            var f = sl.val() / 100, thr = Wd.peak * f, hrs = hoursAbove(Wd, thr), e = energyAbove(Wd, thr);
            year.thr(thr); keep("thr", sl.val());
            out.innerHTML = "<b>" + num(hrs) + " hours</b> above " + num(thr) + " MW: " + pct(hrs / Wd.n, 1) + " of the year, " + pct(e, 2) + " of its energy.";
            if (sl.val() <= D.threshold.target) {
              api.done();
              api.saw("The top " + num(Wd.peak - thr) + " MW of capacity is needed in only " + num(hrs) + " hours. Plants built for those hours sit idle most of the year: the job of [[peaker|peakers]], as in lesson 0.");
            }
          }
          sl.set(P.thr || D.threshold.start); upd();
        } },
      { text: Wd.duckDay.label + " was mild and sunny. Slide Prairie Town's solar farm up and watch [[net-demand|net demand]]: the demand left for other plants after solar.",
        build: function (act, api) {
          year.thr(null);
          var sl = LX.Slider(act, { label: "Solar farm", min: D.solar.min, max: D.solar.max, step: D.solar.step, unit: "MW", color: "var(--lx-solar)",
            hint: function () { return "Lesson 0's farm: " + townSolar + " MW."; }, onChange: function (v) { solarMW = v; upd(); } });
          attach(act, duckChart);
          function upd() {
            duckChart.render(); keep("solar", solarMW);
            var k = duck(Wd, solarMW);
            if (solarMW >= D.solar.target) {
              api.done(); LX.progress.done(LESSON); toExplain(act);
              api.saw("With " + solarMW + " MW of solar, net demand falls to " + num(k.min) + " MW at " + hh(k.tmin) + ", then climbs " + num(k.ramp) + " MW in three hours, " + hh(k.rampFrom) + " to " + hh(k.rampTo) +
                ": the [[duck-curve|duck curve]]'s belly and neck." + (k.neg ? " For " + k.neg + " hours solar alone exceeds demand: the surplus must be spilled, stored or exported." : ""));
            }
          }
          sl.set(solarMW); upd();
        } }
    ];
    var cards = LX.StepCards(live, { id: "t2-steps", steps: steps });
    // demo states (core.js LX.demo): "step-N" opens card N (1-7); "mid" = step 2 with the winter day added
    LX.demo(root, function (state) {
      var n = /^step-(\d+)$/.exec(state);
      if (n) { cards.go(Math.max(0, Math.min(steps.length - 1, +n[1] - 1))); return { view: "step " + Math.min(steps.length, Math.max(1, +n[1])) }; }
      if (state !== "mid") return null;
      showWinter = true; cards.go(1);
      return { view: "winter day" };
    }, cards);
    root.lxLesson = { world: Wd, model: model, year: year };
    buildExplain(Wd, D, P, s0, s200);
    LX.on("t2-log", debounce(function () { buildExplain(Wd, D, P, s0, s200); }, 500));
  }
  function toExplain(act) { if (!act.querySelector(".t2-go")) H("a", { class: "lx-btn small t2-go", href: "#explain", html: "See it as diagrams" + LX.icon("arrow") }, act); }
  function ordinal(d) { return d + (d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"); }
  function debounce(f, ms) { var tm = null; return function (x) { clearTimeout(tm); tm = setTimeout(function () { f(x); }, ms); }; }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(Wd, D, P, s0, s200) {
    var host = document.getElementById("t2-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var s = Wd.s, thr90 = Wd.peak * 0.9, h90 = hoursAbove(Wd, thr90);
    // 1. annotated diagram: the summer peak day
    var c1 = H("div", { class: "lx-xcard" }, host);
    var hd = H("header", { class: "lx-x-head" }, c1); H("h3", { text: "Anatomy of a hot day" }, hd); H("span", { class: "lx-hint", text: Wd.summer.label + ", real SPP shape" }, hd);
    var morn = 9, eve = 21;
    var an = hourly(c1, {
      n: function () { return 24; }, yMax: niceUp(Wd.PK),
      label: function () { return "Prairie Town's demand on " + Wd.summer.label + " with four numbered points, explained in the list below the chart."; },
      series: function () { return [{ label: "Demand", color: "var(--lx-cc)", values: Wd.summer.demand, area: 0.12 }]; },
      marks: function () { return [{ i: s.tmin, v: s.min, n: "1" }, { i: morn, v: Wd.summer.demand[morn], n: "2" }, { i: s.tmax, v: s.max, n: "3" }, { i: eve, v: Wd.summer.demand[eve], n: "4" }]; },
      xticks: function () { return [0, 6, 12, 18, 24].map(function (h) { return { at: h, label: h === 24 ? "24:00" : hh(h) }; }); },
      tipHead: function (i) { return hh(i) + "–" + hh(i + 1); }
    });
    an.render();
    var ol = H("ol", { class: "t2-anno" }, c1);
    [["Night low: " + num(s.min) + " MW at " + hh(s.tmin), "Most people asleep, the air at its coolest; factories and data centers still run."],
     ["Morning climb: " + num(Wd.summer.demand[morn]) + " MW at " + hh(morn), "Homes wake, shops and offices open, and the day heats up."],
     ["Peak: " + num(s.max) + " MW at " + hh(s.tmax), "Buildings have soaked up heat all day, so air conditioning works hardest in the late afternoon."],
     ["Evening fall: " + num(Wd.summer.demand[eve]) + " MW at " + hh(eve), "The sun sets and businesses close; homes stay busy, so demand eases slowly."]]
      .forEach(function (r) { var li = H("li", null, ol); H("b", { text: r[0] }, li); H("span", { text: r[1] }, li); });
    // 2. causal chain
    LX.CausalChain(H("div", { class: "lx-xcard" }, host), {
      title: "Cause and effect: a heat wave",
      links: [{ title: "Hot weather", text: "EIA: hot weather raises demand for cooling.", value: Wd.summer.label },
              { title: "Buildings soak up heat", text: "Walls and roofs warm all day, so cooling needs keep rising after noon." },
              { title: "Air conditioners work harder", text: "Millions of units run longer, at the same time." },
              { title: "Demand climbs", text: "Prairie Town, night low to peak.", value: num(s.min) + " → " + num(s.max) + " MW" },
              { title: "The rarest plants run", text: "The top 10% of the peak is needed only in the hottest hours.", value: num(h90) + " h a year" }],
      note: "Prices tend to jump in these hours; lesson 8 shows why."
    });
    // 3. comparison table
    var c3 = H("div", { class: "lx-xcard" }, host);
    LX.CompareTable(c3, {
      title: "What shapes demand at each time scale", text: true,
      columns: [{ key: "name", label: "Time scale", main: true }, { key: "drivers", label: "Main drivers" }, { key: "data", label: "In 2025's data" }, { key: "who", label: "Who plans for it", phoneHide: true }],
      rows: [
        { key: "day", name: "Day", color: "var(--lx-cc)", drivers: "Routines (sleep, work, school), sunlight, outdoor temperature", data: num(s.min) + " → " + num(s.max) + " MW on " + Wd.summer.label, who: "Operators, hour by hour (lesson 0)" },
        { key: "week", name: "Week", color: "var(--lx-demand)", drivers: "Work and school calendars", data: "Weekends " + pct(Wd.week.gapMean) + " lower on average; up to " + pct(Wd.week.gapMax) + " at " + hh(Wd.week.gapH), who: "Operators and forecasters (lesson 4)" },
        { key: "season", name: "Season", color: "var(--lx-wind)", drivers: "Cooling in summer, heating in winter", data: "Monthly peaks from " + num(Wd.months.max[Wd.months.quiet]) + " MW (" + MONTH[Wd.months.quiet] + ") to " + num(Wd.months.max[Wd.months.peak]) + " MW (" + MONTH[Wd.months.peak] + ")", who: "Planners, months ahead (lesson 6)" },
        { key: "years", name: "Years", color: "var(--lx-tier-3)", drivers: "Population, the economy, efficiency, electrification, new large loads such as data centers and factories", data: "U.S. use hit a record " + num(D.anchors.us_year.value / 1e12, 2) + " trillion kWh in 2025", who: "Planners, years ahead (lesson 13)" }
      ]
    });
    // 4. concept map
    var c4 = H("div", { class: "lx-xcard" }, host);
    var G = { drv: ["What drives it", "var(--lx-tier-2)"], dem: ["Demand", "var(--lx-good)"], read: ["Ways to read it", "var(--lx-tier-3)"], grid: ["What the grid must do", "var(--lx-cc)"] };
    var mom = function (id) {
      if (id === "daily" && P.winter) return "You compared " + Wd.summer.label + " with " + Wd.winter.label + ".";
      if (id === "calendar" && P.week) return "You browsed week " + P.week + ": " + weekLabel(Wd, P.week - 1) + ".";
      if (id === "ldc" && P.thr) return "Your line at " + P.thr + "%: " + num(hoursAbove(Wd, Wd.peak * P.thr / 100)) + " hours above it.";
      if (id === "duck" && P.solar) { var k = duck(Wd, P.solar); return "Your " + P.solar + " MW farm: belly " + num(k.min) + " MW, neck +" + num(k.ramp) + " MW in 3 h."; }
      return null;
    };
    LX.ConceptMap(c4, {
      title: "The ideas, and how they connect", lede: "Tap an idea to see what it means and where it appeared in the steps.", groups: G,
      cols: 4, rows: 4, colsN: 3, rowsN: 6, sel: "demand",
      nodes: [
        { id: "weather", g: "drv", label: "Weather", at: [0, 0], atN: [0, 0], text: "Heat and cold drive cooling and heating; sunlight and clouds change lighting needs.", game: "Step 2: the hot July day and the cold January day." },
        { id: "routine", g: "drv", label: "Daily routines", lines: ["Daily", "routines"], at: [1, 0], atN: [1, 0], text: "Sleep, work, school and cooking set the daily rhythm.", game: "Step 2: the night low and the morning climb." },
        { id: "calendar", g: "drv", label: "Weeks and seasons", lines: ["Weeks and", "seasons"], at: [2, 0], atN: [2, 0], text: "Weekends run a little lower; summer and winter run higher than spring and autumn.", game: "Step 3: the week slider." },
        { id: "growth", g: "drv", label: "Long-term growth", lines: ["Long-term", "growth"], at: [3, 0], atN: [1, 1], text: "Population, the economy, efficiency, electrification and new large loads move demand year by year.", game: "Not in this lesson's single year of data." },
        { id: "demand", g: "dem", label: "Demand (MW)", lines: ["Demand", "(MW)"], at: [1.5, 1], atN: [1, 2], text: "The total power all users draw at a moment. Prairie Town peaks at " + num(Wd.peak) + " MW and averages " + num(Wd.mean) + " MW.", game: "Every curve in the steps." },
        { id: "daily", g: "read", label: "Daily shape", lines: ["Daily", "shape"], at: [0, 2], atN: [0, 3], text: "Demand hour by hour through one day: one hump in summer, two in winter.", game: "Step 2." },
        { id: "ldc", g: "read", label: "Load-duration curve", lines: ["Load-duration", "curve"], at: [1.5, 2], atN: [1, 3], text: "The year's hours sorted from highest to lowest demand; it shows how many hours each level is needed.", game: "Steps 5 and 6." },
        { id: "peak", g: "read", label: "Peak hour", lines: ["Peak", "hour"], at: [3, 2], atN: [2, 3], text: "The year's highest hour: " + num(Wd.peak) + " MW on " + Wd.summer.label + ".", game: "Step 1, your prediction." },
        { id: "solar", g: "drv", label: "Solar output", lines: ["Solar", "output"], at: [0, 3], atN: [0, 4], text: "Solar panels make power only in daylight, most at midday.", game: "Step 7, the slider." },
        { id: "net", g: "read", label: "Net demand", lines: ["Net", "demand"], at: [1, 3], atN: [1, 4], text: "Demand minus solar (and, in real grids, wind): what other plants must still supply.", game: "Step 7, the dark line." },
        { id: "duck", g: "read", label: "Duck curve", lines: ["Duck", "curve"], at: [2, 3], atN: [2, 4], text: "Net demand on a sunny day: a midday belly and a steep evening neck.", game: "Step 7." },
        { id: "plants", g: "grid", label: "Plants and wires", lines: ["Plants and", "wires"], at: [3, 3], atN: [1, 5], text: "Built to cover the peak hour, and flexible enough to climb the evening ramp.", game: "Step 6: the top 10% of the peak is needed in only " + num(h90) + " hours.", later: "Later: lesson 6 sorts plants by job; lesson 9 shows storage filling the duck's belly." }
      ],
      edges: [["weather", "demand", "heats, cools"], ["routine", "demand", "sets rhythm"], ["calendar", "demand", "shifts level"], ["growth", "demand", "year by year"],
              ["demand", "daily", "hour by hour"], ["demand", "ldc", "sorted"], ["demand", "peak", "highest hour"], ["peak", "plants", "sizes"],
              ["ldc", "plants", "hours needed"], ["solar", "net", "subtracted"], ["daily", "net", "minus solar"], ["net", "duck", "on sunny days"], ["duck", "plants", "must ramp"]],
      moment: mom
    });
  }

  LX.mount("demand", function (live, data, root) { view(live, data, root); });
})();
