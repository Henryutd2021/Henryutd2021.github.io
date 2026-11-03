// b02-python-data.js — Lesson B2, "Python and data for energy: how do you load, plot and check a year of hourly data?"
// (bridge lesson, step cards; W1, 2026-11-02).
//
// Data (all real, Southwest Power Pool 2025, from EIA Form EIA-930):
//   assets/learn/data/b02-python-data.json  demand, wind and solar in MW exactly as EIA publishes them, BEFORE cleaning;
//                                           index i = the hour ENDING at start_utc + i hours, in UTC (EIA-930 convention)
//   assets/learn/data/town_year.json        the cleaned shapes Prairie Town uses (thousandths of each series' 2025 maximum)
//   assets/learn/data/town_days.json        the data build's counts of flagged hours (stats), to compare with the reader's
//   assets/learn/data/town.json             Prairie Town's farm sizes and peak demand (illustrative), as in lesson 0
//
// What the reader does: load the raw year, find the impossible number in its summary, fix the time stamps (UTC, hour
// ending -> U.S. Central, hour beginning; daylight saving gives 23- and 25-hour days), find the run length the data build
// used to flag frozen telemetry, plot the worst week, run a physics check (solar at night) on the raw and cleaned files,
// resample Prairie Town's wind farm, read a duration curve and capacity factors, and run five asserts on both files.
// Each step shows the same step in pandas; learn/notebooks/b02-python-data.ipynb runs that code for real.
//
// Local time is computed here from the U.S. rule (since 2007): Central daylight time (UTC-5) from 08:00 UTC on the second
// Sunday in March to 07:00 UTC on the first Sunday in November, standard time (UTC-6) otherwise. The Node test checks it
// against the ICU time-zone database (America/Chicago) for every hour of 2025.
//
// Lesson-local components (candidates for the shared library; see learn/_w1/b02-python-data.yml): LX.Checklist (same code
// as in n01-news-lens.js), a code panel, a year strip, and a light line/bar chart with a text version. CSS is injected
// once by injectCSS(), with --lx-* tokens only.
(function () {
  "use strict";
  var HOUR = 3600000, NIGHT_END = 4, NIGHT_FRAC = 0.05, SPIKE_FRAC = 0.5, MAX_REPEAT = 6;

  // ---------------------------------------------------------------- pure model
  function frame(file) {
    var t0 = Date.parse(file.start_utc + "Z"), n = file.demand.length;
    return { t0: t0, n: n, cols: { demand: file.demand, wind: file.wind, solar: file.solar } };
  }
  function ending(F, i) { return F.t0 + i * HOUR; }
  function beginning(F, i) { return F.t0 + (i - 1) * HOUR; }
  function nthSunday(y, month, k) { var dow = new Date(Date.UTC(y, month, 1)).getUTCDay(); return 1 + (7 - dow) % 7 + 7 * (k - 1); }
  function dstBounds(y) { return [Date.UTC(y, 2, nthSunday(y, 2, 2), 8), Date.UTC(y, 10, nthSunday(y, 10, 1), 7)]; }
  function centralOffset(ms) { var b = dstBounds(new Date(ms).getUTCFullYear()); return ms >= b[0] && ms < b[1] ? -5 : -6; }
  function pad(v) { return (v < 10 ? "0" : "") + v; }
  function local(ms) {
    var off = centralOffset(ms), t = new Date(ms + off * HOUR);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), off: off,
             date: t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate()) };
  }
  function utcDate(ms) { var t = new Date(ms); return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate()); }
  // hours per day, grouped three ways: "utc-end" (UTC date of the stamp), "local-end" (local date of the stamp, which is
  // the hour's end), "local-start" (local date of the hour's start: the right way for EIA-930 data)
  function hoursPerDay(F, mode) {
    var c = {}, keys = [];
    for (var i = 0; i < F.n; i++) {
      var k = mode === "utc-end" ? utcDate(ending(F, i)) : mode === "local-end" ? local(ending(F, i)).date : local(beginning(F, i)).date;
      if (!(k in c)) { c[k] = 0; keys.push(k); }
      c[k]++;
    }
    var hist = {}, odd = [];
    keys.forEach(function (k) { hist[c[k]] = (hist[c[k]] || 0) + 1; if (c[k] !== 24) odd.push([k, c[k]]); });
    return { days: keys.length, hist: hist, odd: odd };
  }
  function quantile(sorted, p) { var k = (sorted.length - 1) * p, f = Math.floor(k), c = Math.min(f + 1, sorted.length - 1); return sorted[f] + (sorted[c] - sorted[f]) * (k - f); }
  // pandas-style describe: count, mean, std (n - 1), min, quartiles (linear), max; plus where the min and max sit
  function describe(a) {
    var v = a.filter(function (x) { return x != null && isFinite(x); }), n = v.length, s = 0, ss = 0, i;
    for (i = 0; i < n; i++) s += v[i];
    var mean = s / n;
    for (i = 0; i < n; i++) ss += (v[i] - mean) * (v[i] - mean);
    var so = v.slice().sort(function (x, y) { return x - y; });
    return { count: n, mean: mean, std: Math.sqrt(ss / (n - 1)), min: so[0], q25: quantile(so, 0.25), q50: quantile(so, 0.5), q75: quantile(so, 0.75), max: so[n - 1],
             argmin: a.indexOf(so[0]), argmax: a.indexOf(so[n - 1]) };
  }
  // runs of the same non-zero value (pandas: run id = (s != s.shift()).cumsum(); length per run; length >= k and s != 0)
  function runs(a, minRun) {
    var out = [], i = 0;
    while (i < a.length) {
      var j = i;
      while (j + 1 < a.length && a[j + 1] === a[i]) j++;
      if (a[i] && j - i + 1 >= minRun) out.push({ start: i, len: j - i + 1, value: a[i] });
      i = j + 1;
    }
    return out;
  }
  function flagged(a, minRun) { return runs(a, minRun).reduce(function (s, r) { return s + r.len; }, 0); }
  function longestRun(a) { return runs(a, 1).reduce(function (m, r) { return Math.max(m, r.len); }, 0); }
  function mask(a, minRun) { var m = a.map(function () { return false; }); runs(a, minRun).forEach(function (r) { for (var k = r.start; k < r.start + r.len; k++) m[k] = true; }); return m; }
  // solar output while the sun is down: local hours beginning 00:00 to 03:00, above NIGHT_FRAC of the year's maximum
  function nightBad(F, a) {
    var mx = Math.max.apply(null, a), idx = [];
    for (var i = 0; i < F.n; i++) if (local(beginning(F, i)).h < NIGHT_END && a[i] > NIGHT_FRAC * mx) idx.push(i);
    return idx;
  }
  // the largest cluster of failing hours on consecutive local dates: {from, to, hours}
  function cluster(F, idx) {
    var dates = [], per = {};
    idx.forEach(function (i) { var d = local(beginning(F, i)).date; if (!(d in per)) { per[d] = 0; dates.push(d); } per[d]++; });
    var best = null, cur = null;
    dates.forEach(function (d, k) {
      var prev = k ? Date.parse(dates[k - 1] + "T00:00:00Z") : null, gap = prev === null ? 99 : (Date.parse(d + "T00:00:00Z") - prev) / 86400000;
      if (gap <= 1 && cur) { cur.to = d; cur.hours += per[d]; } else { cur = { from: d, to: d, hours: per[d] }; }
      if (!best || cur.hours > best.hours) best = { from: cur.from, to: cur.to, hours: cur.hours };
    });
    return best;
  }
  // group values by local date or month (of the hour's start): mean or sum
  function resample(F, a, by, how) {
    var g = {}, keys = [];
    for (var i = 0; i < F.n; i++) {
      var L = local(beginning(F, i)), k = by === "month" ? L.y + "-" + pad(L.m) : L.date;
      if (!(k in g)) { g[k] = { s: 0, n: 0 }; keys.push(k); }
      g[k].s += a[i]; g[k].n++;
    }
    return keys.map(function (k) { return { key: k, value: how === "sum" ? g[k].s : g[k].s / g[k].n, hours: g[k].n }; });
  }
  function scale(a, size) { return a.map(function (v) { return v / 1000 * size; }); }
  function sortedDesc(a) { return a.slice().sort(function (x, y) { return y - x; }); }
  function hoursAbove(a, level) { return a.filter(function (v) { return v > level; }).length; }
  function capacityFactor(mw, size) { return mw.reduce(function (s, v) { return s + v; }, 0) / (size * mw.length); }
  // the five asserts of the last step, on any file with demand, wind and solar columns
  var ASSERTS = [
    { id: "rows", code: 'assert len(df) == 8760, "not one row per hour of 2025"' },
    { id: "gaps", code: 'assert df.notna().all().all(), "missing values"' },
    { id: "spike", code: 'assert df["demand"].min() > 0.5 * df["demand"].median(), "a demand spike"' },
    { id: "repeat", code: 'assert longest_repeat(df).max() < 6, "a sensor stuck for 6+ hours"' },
    { id: "night", code: 'assert bad_night(df).sum() == 0, "solar output at night"' }
  ];
  function checks(F) {
    var c = F.cols, d = describe(c.demand), lr = Math.max(longestRun(c.demand), longestRun(c.wind), longestRun(c.solar)), nb = nightBad(F, c.solar).length;
    var gaps = ["demand", "wind", "solar"].reduce(function (s, k) { return s + c[k].filter(function (v) { return v == null || !isFinite(v); }).length; }, 0);
    return [
      { id: "rows", ok: F.n === 8760, detail: F.n + " rows" },
      { id: "gaps", ok: gaps === 0, detail: gaps + " missing" },
      { id: "spike", ok: d.min > SPIKE_FRAC * d.q50, detail: "min " + Math.round(d.min).toLocaleString("en-US") + " vs half the median " + Math.round(SPIKE_FRAC * d.q50).toLocaleString("en-US") },
      { id: "repeat", ok: lr < MAX_REPEAT, detail: "longest repeat " + lr + " h" },
      { id: "night", ok: nb === 0, detail: nb + " night hours" }
    ];
  }
  function prairie(town, year) {
    var f = town.fleet, peak = town.scenarios.lesson0.demandPeakMW;
    return { sizes: { demand: peak, wind: f.wind.mw, solar: f.solar.mw },
             demand: scale(year.demand, peak), wind: scale(year.wind, f.wind.mw), solar: scale(year.solar, f.solar.mw) };
  }
  var model = { HOUR: HOUR, NIGHT_END: NIGHT_END, NIGHT_FRAC: NIGHT_FRAC, SPIKE_FRAC: SPIKE_FRAC, MAX_REPEAT: MAX_REPEAT, ASSERTS: ASSERTS,
    frame: frame, ending: ending, beginning: beginning, dstBounds: dstBounds, centralOffset: centralOffset, local: local, hoursPerDay: hoursPerDay,
    describe: describe, runs: runs, flagged: flagged, longestRun: longestRun, mask: mask, nightBad: nightBad, cluster: cluster, resample: resample,
    scale: scale, sortedDesc: sortedDesc, hoursAbove: hoursAbove, capacityFactor: capacityFactor, checks: checks, prairie: prairie };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S;
  var int = function (v) { return Math.round(v).toLocaleString("en-US"); };
  var pct1 = function (v) { return (Math.round(v * 1000) / 10).toFixed(1) + "%"; };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MON = MONTHS.map(function (m) { return m.slice(0, 3); });
  function dayLabel(iso) { var p = iso.split("-"); return (+p[2]) + " " + MONTHS[+p[1] - 1] + (p[0] !== "2025" ? " " + p[0] : ""); }
  var COLS = { demand: { label: "Demand", color: "var(--lx-demand)" }, wind: { label: "Wind", color: "var(--lx-wind)" }, solar: { label: "Solar", color: "var(--lx-solar)" } };

  function injectCSS() {
    if (document.getElementById("b2-css")) return;
    var css = [
      ".b2-code{margin:0;border-radius:12px;background:var(--lx-surface-2);border:1px solid var(--lx-line);overflow:hidden}",
      ".b2-code p{margin:0;padding:6px 12px;font-family:var(--lx-f-display);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--lx-ink-3);border-bottom:1px solid var(--lx-line)}",
      ".b2-code pre{margin:0;padding:10px 12px;overflow-x:auto;background:transparent;border:0;font-family:var(--lx-f-mono);font-size:13px;line-height:1.55;color:var(--lx-ink)}",
      ".b2-code .c{color:var(--lx-ink-3)}",
      ".b2-tbl{border-collapse:collapse;font-size:14px;width:100%}",
      ".page-learn .b2-tbl>:not(caption)>*>*{background:transparent!important;color:inherit;box-shadow:none!important}",
      ".b2-tbl th,.b2-tbl td{padding:4px 8px;border-bottom:1px solid var(--lx-line);text-align:right;font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".b2-tbl th{font-family:var(--lx-f-display);font-weight:500;font-size:12.5px;color:var(--lx-ink-3)}",
      ".b2-tbl th[scope=row],.b2-tbl td.l{text-align:left}",
      ".b2-cell{font:inherit;font-family:var(--lx-f-mono);border:1px solid transparent;background:transparent;color:var(--lx-ink);border-radius:6px;padding:2px 6px;cursor:pointer;min-height:32px}",
      ".b2-cell:hover{border-color:var(--lx-line-2)} .b2-cell.right{border-color:var(--lx-good);box-shadow:inset 0 0 0 1px var(--lx-good)} .b2-cell.wrong{border-color:var(--lx-warn)}",
      ".b2-scroll{overflow-x:auto;max-width:100%}",
      ".b2-pills{display:flex;flex-wrap:wrap;gap:6px}",
      ".b2-big{font-family:var(--lx-f-mono);font-size:20px;font-weight:600;color:var(--lx-ink)}",
      ".b2-res{display:grid;gap:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--lx-line);background:var(--lx-surface)}",
      ".b2-res .k{font-size:13px;color:var(--lx-ink-3)}",
      ".b2-ok{color:var(--lx-good);font-weight:600} .b2-bad{color:var(--lx-bad);font-weight:600} .b2-na{color:var(--lx-ink-3)}",
      
      ".b2-dl{display:flex;flex-wrap:wrap;gap:8px}",
      ".lx-checklist{display:grid;gap:6px;margin:0;padding:0;list-style:none}",
      ".lx-checklist li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:start;padding:8px 10px;border-radius:10px;border:1px solid var(--lx-line);background:var(--lx-surface)}",
      ".lx-checklist input{width:20px;height:20px;margin:3px 0 0;accent-color:var(--lx-good)}",
      ".lx-checklist label{display:grid;gap:2px;cursor:pointer;margin:0}",
      ".lx-checklist label b{font-family:var(--lx-f-display);font-weight:500;font-size:15px;color:var(--lx-ink)}",
      ".lx-checklist label span{font-size:14px;color:var(--lx-ink-2)}",
      ".lx-checklist label small{font-size:12.5px;color:var(--lx-ink-3);font-family:var(--lx-f-mono);overflow-wrap:anywhere}",
      ".lx-checklist li.on{border-color:color-mix(in srgb,var(--lx-good) 45%,var(--lx-line))}",
      ".lx-checklist-foot{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:13.5px;color:var(--lx-ink-3)}",
      ".b2-asserts{display:grid;gap:8px;margin:0;padding:0;list-style:none}",
      ".b2-asserts li{display:grid;gap:6px;padding:9px 11px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface)}",
      ".b2-asserts code{font-family:var(--lx-f-mono);font-size:12.5px;color:var(--lx-ink);white-space:pre-wrap;overflow-wrap:anywhere;background:none;padding:0}",
      ".b2-asserts .r{display:flex;flex-wrap:wrap;gap:4px 14px;font-family:var(--lx-f-mono);font-size:12.5px}",
      "@media (max-width:560px){.page-learn .b2-code pre,.page-learn .b2-code pre code{font-size:12px;white-space:pre-wrap!important;overflow-wrap:anywhere;word-break:break-word}.b2-tbl{font-size:13px}.b2-tbl th,.b2-tbl td{padding:4px 5px}}"
    ].join("\n");
    H("style", { id: "b2-css", text: css }, document.head);
  }

  // ---- lesson-local checklist (a candidate shared component; the same code is in n01-news-lens.js)
  LX.Checklist = LX.Checklist || function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var ul = H("ul", { class: "lx-checklist" }, host), state = LX.store.get(o.id, {}) || {}, boxes = [];
    o.items.forEach(function (it) {
      var li = H("li", null, ul), id = LX.uid("ck");
      var cb = H("input", { type: "checkbox", id: id }, li);
      var lab = H("label", { for: id }, li);
      H("b", { html: LX.rich(it.label) }, lab);
      if (it.text) H("span", { html: LX.rich(it.text) }, lab);
      if (it.note) H("small", { html: LX.rich(it.note) }, lab);
      cb.checked = !!state[it.id];
      cb.addEventListener("change", function () { state[it.id] = cb.checked; LX.store.set(o.id, state); paint(); });
      boxes.push({ cb: cb, li: li });
    });
    var foot = H("div", { class: "lx-checklist-foot" }, host);
    var cnt = H("span", { "aria-live": "polite" }, foot);
    var reset = H("button", { class: "lx-link", type: "button", text: "Clear the ticks" }, foot);
    reset.addEventListener("click", function () { state = {}; LX.store.set(o.id, state); boxes.forEach(function (b) { b.cb.checked = false; }); paint(); });
    function paint() {
      var n = boxes.filter(function (b) { b.li.classList.toggle("on", b.cb.checked); return b.cb.checked; }).length;
      cnt.textContent = n + " of " + boxes.length + " checked" + (o.doneText && n === boxes.length ? ". " + o.doneText : ".");
    }
    paint();
  };

  // ---- the same step in pandas: comments after "#" are the readable pseudo-code
  function code(host, lines) {
    var fig = H("figure", { class: "b2-code" }, host);
    H("p", { text: "The same step in pandas" }, fig);
    var pre = H("pre", null, fig), c = H("code", null, pre);
    c.innerHTML = lines.map(function (l) {
      var k = l.indexOf("  #"); if (k < 0 && l.trim().charAt(0) === "#") k = 0;
      return k < 0 ? LX.esc(l) : LX.esc(l.slice(0, k)) + '<span class="c">' + LX.esc(l.slice(k)) + "</span>";
    }).join("\n");
    return fig;
  }
  function seg(host, label, items, onPick) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": label }, host), btns = {};
    items.forEach(function (it) {
      var b = H("button", { type: "button", "aria-pressed": "false", text: it[1] }, g);
      b.addEventListener("click", function () { set(it[0]); onPick(it[0]); });
      btns[it[0]] = b;
    });
    function set(k) { Object.keys(btns).forEach(function (x) { btns[x].setAttribute("aria-pressed", x === k ? "true" : "false"); }); }
    return { set: set };
  }

  // ---- charts: the shared LX.Plot (components/plot.js) draws them; this adapter turns B2's options into its spec.
  //      o: n, series [{values, color, width, area}], bars (true: one bar per value), yMax, yStep, yFmt, height, title,
  //      ticks ([[i, label, anchor]] or function (W)), shade ([[from, to]] index spans), level + levelLabel, label, alt (HTML)
  function chart(host, o) {
    var P = LX.Plot(host, { box: true, legend: false, text: o.alt ? "Text version" : null });
    function spec() {
      var bars = !!o.bars, n = o.n;
      var ticks = function (W) { return (typeof o.ticks === "function" ? o.ticks(W) : o.ticks || []).map(function (t) { return [bars ? t[0] + 0.5 : t[0], t[1], t[2]]; }); };
      return {
        x: { min: 0, max: bars ? n : Math.max(1, n - 1), ticks: ticks },
        y: { min: 0, max: o.yMax, step: o.yStep || o.yMax / 4, fmt: o.yFmt || int },
        height: o.height || 200, heightN: o.height || 170, margin: { l: 46, r: 8, t: 10, b: 22 }, title: o.title, aria: o.label,
        spans: (o.shade || []).map(function (sp) { return { x0: sp[0], x1: sp[1], color: "var(--lx-bad-soft)" }; }),
        refs: o.level != null ? [{ y: o.level, color: "var(--lx-bad)", dash: "5 4", width: 1.5, label: o.levelLabel, labelColor: "var(--lx-ink-2)" }] : [],
        bars: !bars ? [] : [].concat.apply([], o.series.map(function (s) { return s.values.map(function (v, i) { return v ? { x0: i + 0.15, x1: i + 0.85, y0: 0, y1: v, color: s.color } : null; }).filter(Boolean); })),
        lines: bars ? [] : o.series.map(function (s) { return { values: s.values, color: s.color, width: s.width || 1.4, area: s.area ? 0.22 : 0, cap: "butt" }; }),
        text: o.alt ? { html: o.alt } : null
      };
    }
    var api = { el: P.box, draw: function () { P.render(spec()); }, set: function (p) { for (var k in p) o[k] = p[k]; api.draw(); } };
    api.draw();   // LX.Plot draws once the chart is visible, and again on resize
    return api;
  }
  // a round axis top and gridline step: the smallest step of 1, 2, 2.5 or 5 x 10^n that covers mx in at most 5 steps
  function nice(mx) {
    var p = Math.pow(10, Math.floor(Math.log10(Math.max(mx, 1e-9) / 5))), steps = [1, 2, 2.5, 5, 10, 20];
    for (var i = 0; i < steps.length; i++) { var st = steps[i] * p; if (Math.ceil(mx / st - 1e-9) <= 5) return { max: Math.ceil(mx / st - 1e-9) * st, step: st }; }
    return { max: mx, step: mx / 4 };
  }
  function monthTicks(F, n, by) {
    var out = [], seen = {};
    for (var i = 0; i < F.n; i++) {
      var L = local(beginning(F, i)); if (seen[L.m]) continue; seen[L.m] = true;
      if ((L.m - 1) % 3 === 0) out.push([by === "day" ? Math.floor(i / 24) : i, MON[L.m - 1], L.m === 1 ? "start" : "middle"]);
    }
    return out;
  }

  // ---------------------------------------------------------------- the steps
  function view(live, data) {
    var R = frame(data["b02-python-data"] || data.b02_python_data), C = frame(data.town_year), stats = data.town_days.stats;
    var P = prairie(data.town, data.town_year);
    var steps = [];

    // 1 load
    steps.push({ text: "A year of hourly grid data has 8,760 rows, one per hour. Load the Southwest Power Pool's 2025 file, exactly as EIA publishes it, and look at the first rows.",
      build: function (act, api) {
        var b = H("button", { class: "lx-btn small", type: "button", html: LX.icon("arrow") + "Load the file" }, act), out = H("div", { "aria-live": "polite" }, act);
        code(act, ['raw = json.load(open("b02-python-data.json"))',
          'ends = pd.date_range(raw["start_utc"], periods=8760, freq="h", tz="UTC")',
          'df = pd.DataFrame({c: raw[c] for c in ["demand", "wind", "solar"]}, index=ends)',
          "df.shape  # rows, columns", "df.head()  # the first five rows"]);
        b.addEventListener("click", function () {
          out.innerHTML = ""; b.disabled = true;
          H("p", { class: "b2-big", text: "df.shape → (" + int(R.n) + ", 3)" }, out);
          var sc = H("div", { class: "b2-scroll" }, out), t = H("table", { class: "b2-tbl" }, sc), hr = H("tr", null, H("thead", null, t));
          ["Hour ending (UTC)", "demand", "wind", "solar"].forEach(function (h) { H("th", { scope: "col", text: h }, hr); });
          var tb = H("tbody", null, t);
          for (var i = 0; i < 5; i++) {
            var tr = H("tr", null, tb), e = new Date(ending(R, i)).toISOString().replace("T", " ").slice(0, 16);
            H("th", { scope: "row", text: e }, tr);
            ["demand", "wind", "solar"].forEach(function (k) { H("td", { text: int(R.cols[k][i]) }, tr); });
          }
          api.done(); api.saw("Each value is MW averaged over one hour, so it is also the MWh of that hour. The stamps are in UTC and mark the end of each hour (EIA-930's rule): keep that in mind.");
        });
      } });

    // 2 inspect
    var dR = { demand: describe(R.cols.demand), wind: describe(R.cols.wind), solar: describe(R.cols.solar) };
    steps.push({ text: "Summary statistics are the first check. One number in this table cannot be right for a grid that serves millions of people. Find it and tap it.",
      build: function (act, api) {
        var sc = H("div", { class: "b2-scroll" }, act), t = H("table", { class: "b2-tbl" }, sc), hr = H("tr", null, H("thead", null, t));
        H("th", { scope: "col", text: "MW" }, hr); ["demand", "wind", "solar"].forEach(function (k) { H("th", { scope: "col", text: k }, hr); });
        var tb = H("tbody", null, t), fb = H("div", { "aria-live": "polite" }, act), cells = [];
        var spike = R.cols.demand[dR.demand.argmin], before = R.cols.demand[dR.demand.argmin - 1], after = R.cols.demand[dR.demand.argmin + 1], when = local(beginning(R, dR.demand.argmin));
        var HINT = {
          count: "One row per hour of 2025: right.",
          "demand.max": "SPP's 2025 peak, on a hot afternoon in late July: plausible.",
          "wind.min": "A calm hour: low, not broken.", "solar.min": "Zero solar is normal: the sun sets every night.",
          other: "Plausible for this grid. Look for a value far from all the others." };
        [["count", "count"], ["mean", "mean"], ["std", "std"], ["min", "min"], ["q25", "25%"], ["q50", "50%"], ["q75", "75%"], ["max", "max"]].forEach(function (r) {
          var tr = H("tr", null, tb); H("th", { scope: "row", text: r[1] }, tr);
          ["demand", "wind", "solar"].forEach(function (k) {
            var td = H("td", null, tr), b = H("button", { class: "b2-cell", type: "button", text: int(dR[k][r[0]]), "aria-label": k + " " + r[1] + ": " + int(dR[k][r[0]]) }, td);
            cells.push(b);
            b.addEventListener("click", function () {
              cells.forEach(function (c) { c.classList.remove("right", "wrong"); });
              var ok = k === "demand" && r[0] === "min"; b.classList.add(ok ? "right" : "wrong"); fb.innerHTML = "";
              var msg = ok ? "Demand read " + int(spike) + " MW for one hour on " + when.d + " " + MONTHS[when.m - 1] + ", under 5% of the median (" + int(dR.demand.q50) + " MW), between hours of " + int(before) + " and " + int(after) + " MW. A reporting error, not a real collapse."
                : HINT[r[0] === "count" ? "count" : k + "." + r[0]] || HINT.other;
              H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Found it." : "Not this one.") + "</b> " + LX.esc(msg) + "</div>" }, fb);
              if (ok) api.done();
            });
          });
        });
        code(act, ["df.describe()  # count, mean, spread, quartiles, min and max of each column", 'df["demand"].idxmin()  # when was demand lowest?']);
      } });

    // 3 time stamps
    var ways = [["utc-end", "UTC date, stamp at hour end"], ["local-end", "Local date, stamp at hour end"], ["local-start", "Local date, stamp at hour start"]];
    steps.push({ text: "EIA stamps each hour in [[utc|UTC]], at the [[hour-ending|hour's end]]; Prairie Town runs on Central time. Count the hours in each day three ways, and see which way is right.",
      build: function (act, api) {
        var out = H("div", { "aria-live": "polite" }, act);
        var sg = seg(act, "How to group hours into days", ways, show);
        act.insertBefore(sg && act.lastChild, out);
        function show(mode) {
          var r = hoursPerDay(R, mode); out.innerHTML = "";
          var res = H("div", { class: "b2-res" }, out);
          H("p", { class: "k", text: r.days + " days found" }, res);
          H("p", { class: "b2-big", text: Object.keys(r.hist).sort(function (a, b) { return r.hist[b] - r.hist[a]; }).map(function (h) { return r.hist[h] + " × " + h + " h"; }).join(" · ") }, res);
          H("p", { text: "Not 24 hours: " + r.odd.map(function (x) { return dayLabel(x[0]) + " (" + x[1] + " h)"; }).join(", ") }, res);
          var ok = mode === "local-start";
          var why = ok ? "Daylight saving makes 9 March 23 hours long and 2 November 25. Those days are real, so a check that demands 24 hours a day would be wrong."
            : mode === "utc-end" ? "UTC days cut Central days in the evening, so the first and last days of the file are fragments." : "Stamped at its end, the hour before midnight lands on the next day: 1 January loses an hour and a 1-hour day appears in 2026.";
          H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not this way.") + "</b> " + LX.esc(why) + "</div>" }, out);
          if (ok) api.done();
        }
        code(act, ["starts = df.index - pd.Timedelta(hours=1)  # label each hour by its start",
          'df.index = starts.tz_convert("America/Chicago")  # UTC to Central time, with daylight saving',
          "df.groupby(df.index.date).size().value_counts()  # how many days have 24, 23 or 25 hours"]);
      } });

    // 4 repeats
    var BUILD = { wind: stats.frozen_hours_filled.wind, solar: stats.frozen_hours_filled.solar, demand: stats.demand_hours_flagged_as_implausible };
    steps.push({ text: "A [[frozen-telemetry|stuck sensor]] repeats its last reading. Flag runs of the same non-zero value that last at least N hours. Find the N the data build used: your count will match its count.",
      build: function (act, api) {
        var col = "solar", minRun = 2, dayTicks = monthTicks(R, Math.ceil(R.n / 24), "day");
        var sg = seg(act, "Column", [["wind", "Wind"], ["solar", "Solar"], ["demand", "Demand"]], function (k) { col = k; draw(); });
        var sl = LX.Slider(act, { label: "Shortest run to flag (N)", color: "var(--lx-bad)", min: 2, max: 24, step: 1, unit: "h", onChange: function (v) { minRun = v; draw(); },
          hint: function () { return "Shorter runs flag more hours, some by chance; longer runs miss short freezes."; } });
        var res = H("div", { class: "b2-res", "aria-live": "polite" }, act);
        var strip = null, stripHost = H("div", null, act);
        function draw() {
          var a = R.cols[col], rs = runs(a, minRun), n = rs.reduce(function (s, r) { return s + r.len; }, 0), m = mask(a, minRun), per = [];
          for (var i = 0; i < R.n; i++) { var dd = Math.floor((i) / 24); per[dd] = (per[dd] || 0) + (m[i] ? 1 : 0); }
          res.innerHTML = "";
          H("p", { class: "b2-big", text: int(n) + " hours flagged in " + rs.length + " runs" }, res);
          var match = n === BUILD[col] || (col === "demand" && n + 1 === BUILD[col]);
          H("p", { class: "k", text: "The data build flagged " + int(BUILD[col]) + (col === "demand" ? " demand hours: its repeats plus the one spike." : " hours.") + (match ? " Your count matches." : "") }, res);
          var opts = { n: per.length, bars: true, yMax: 24, yStep: 6, height: 120, series: [{ values: per, color: "var(--lx-bad)" }], ticks: dayTicks,
            label: "Flagged hours per day of 2025 for " + col + ": " + int(n) + " hours in " + rs.length + " runs.", yFmt: function (v) { return v + " h"; },
            title: "Flagged hours per day, " + COLS[col].label.toLowerCase() };
          if (strip) strip.set(opts); else strip = chart(stripHost, opts);
          if (match && minRun === 3) { api.done(); api.saw("N = 3: three or more identical non-zero readings in a row. Your " + int(n) + " " + col + " hours match the data build. The rule is a choice; the next step shows what it catches."); }
        }
        sg.set(col); sl.set(minRun); draw();
        code(act, ["def repeats(s, min_run=3):", "    run = (s != s.shift()).cumsum()  # a new id each time the value changes",
          '    length = s.groupby(run).transform("size")  # how long each run lasts', "    return (length >= min_run) & (s != 0)  # long runs of one non-zero value",
          'repeats(df["solar"]).sum()  # hours flagged']);
      } });

    // 5 the worst run, plotted
    var lr = runs(R.cols.solar, 3).reduce(function (b, r) { return !b || r.len > b.len ? r : b; }, null);
    var lrA = local(beginning(R, lr.start)), lrB = local(beginning(R, lr.start + lr.len - 1));
    steps.push({ text: "Counts hide the story; a plot shows it. Plot 12 to 24 December, where the longest run sits, and look at what solar does after dark.",
      build: function (act, api) {
        var b = H("button", { class: "lx-btn small", type: "button", html: LX.icon("chart") + "Plot 12–24 December" }, act), out = H("div", null, act);
        b.addEventListener("click", function () {
          b.disabled = true; out.innerHTML = "";
          var i0 = 0; while (local(beginning(R, i0)).date !== "2025-12-12") i0++;
          var i1 = i0; while (i1 < R.n && local(beginning(R, i1)).date <= "2025-12-24") i1++;
          var ticks = function (W) { var t = [], every = W < 480 ? 96 : 48; for (var i = i0; i < i1; i += every) t.push([i - i0, local(beginning(R, i)).d + (i === i0 || W >= 480 ? " Dec" : ""), i === i0 ? "start" : "middle"]); return t; };
          var spans = runs(R.cols.solar, 3).filter(function (r) { return r.start < i1 && r.start + r.len > i0; })
            .map(function (r) { return [Math.max(0, r.start - i0), Math.min(i1 - i0 - 1, r.start - i0 + r.len - 1)]; });
          ["demand", "wind", "solar"].forEach(function (k) {
            var v = R.cols[k].slice(i0, i1), ny = nice(Math.max.apply(null, v));
            chart(out, { n: v.length, yMax: ny.max, yStep: ny.step, height: 120, series: [{ values: v, color: COLS[k].color, width: 1.8 }], shade: spans, ticks: ticks,
              title: COLS[k].label + ", MW", label: COLS[k].label + " from 12 to 24 December 2025, with the hours flagged as repeats shaded." });
          });
          H("p", { class: "lx-hint", text: "Shaded: solar hours flagged as repeats. The longest run lasts " + lr.len + " hours, from " + lrA.d + " December " + pad(lrA.h) + ":00 to " + lrB.d + " December " + pad(lrB.h) + ":00 (local); a second run at another value follows straight after." }, out);
          api.done(); api.saw("Solar holds " + int(lr.value) + " MW through six nights, while demand and wind also stand still. When every column freezes at once, suspect the data feed, not the weather.");
        });
        code(act, ['df.loc["2025-12-12":"2025-12-24"].plot(subplots=True)  # one panel per column']);
      } });

    // 6 night check
    var nbR = nightBad(R, R.cols.solar), nbC = nightBad(C, C.cols.solar), mR = mask(R.cols.solar, 3);
    var caughtR = nbR.filter(function (i) { return mR[i]; }).length, cl = cluster(C, nbC);
    steps.push({ text: "Repeats are one symptom; physics gives another. Between midnight and 4 a.m. solar output must be near zero. Run this night check on the raw file and on the cleaned one.",
      build: function (act, api) {
        var row = H("div", { class: "b2-pills" }, act), done = {};
        var bR = H("button", { class: "lx-btn small ghost", type: "button", text: "Check the raw file" }, row), bC = H("button", { class: "lx-btn small ghost", type: "button", text: "Check the cleaned file" }, row);
        var out = H("div", { class: "lx-stack", "aria-live": "polite" }, act);
        function show(which) {
          if (done[which]) return; done[which] = true;
          var res = H("div", { class: "b2-res" }, out);
          if (which === "raw") {
            H("p", { class: "b2-big", text: "Raw: " + nbR.length + " night hours fail" }, res);
            H("p", { class: "k", text: "The repeat rule (N = 3) had already flagged " + caughtR + " of them." }, res);
          } else {
            H("p", { class: "b2-big", text: "Cleaned: " + nbC.length + " night hours " + (nbC.length ? "still fail" : "fail") }, res);
            H("p", { class: "k", text: nbC.length ? cl.hours + " of them fall between " + dayLabel(cl.from) + " and " + dayLabel(cl.to) + "." :
              "The data build adds a physics rule: solar is set to zero in night hours." }, res);
          }
          if (done.raw && done.clean) { api.done(); api.saw(nbC.length ? "In those weeks raw solar barely changed between day and night yet never repeated exactly, so no repeat rule saw it, and the gap-filling copied it. No single rule catches everything: combine range, repeat and physics checks." :
            "In late winter raw solar barely changed between day and night yet never repeated exactly, so no repeat rule saw it; the cleaned file passes only because its build adds the physics rule. No single rule catches everything: combine range, repeat and physics checks."); }
        }
        bR.addEventListener("click", function () { show("raw"); }); bC.addEventListener("click", function () { show("clean"); });
        code(act, ["night = df.index.hour < 4  # hours starting 00:00 to 03:00, local time", 'bad = night & (df["solar"] > 0.05 * df["solar"].max())  # sun down, yet over 5% of the peak', "bad.sum()"]);
      } });

    // 7 resample
    var ticksH = monthTicks(C, C.n, "hour"), dWind = resample(C, P.wind, "day", "mean"), mWind = resample(C, P.wind, "month", "sum");
    var best = mWind.reduce(function (b, x) { return !b || x.value > b.value ? x : b; }, null), worst = mWind.reduce(function (b, x) { return !b || x.value < b.value ? x : b; }, null);
    steps.push({ text: "Switch to the cleaned file, scaled to Prairie Town's " + P.sizes.wind + " MW wind farm. 8,760 points are too many to read: [[resample|resample]] to daily averages, then to monthly energy.",
      build: function (act, api) {
        var seen = {}, host = H("div", null, act);
        var sg = seg(act, "Time step", [["h", "Hourly MW"], ["d", "Daily MW"], ["m", "Monthly GWh"]], show);
        act.insertBefore(act.lastChild, host);
        function show(k) {
          host.innerHTML = ""; seen[k] = true;
          if (k === "h") chart(host, { n: C.n, yMax: nice(P.sizes.wind).max, yStep: nice(P.sizes.wind).step, series: [{ values: P.wind, color: "var(--lx-wind)", width: 0.6 }], ticks: ticksH, title: "Wind farm output, every hour (MW)", label: "Prairie Town's wind farm, 8,760 hourly values: a dense band." });
          else if (k === "d") chart(host, { n: dWind.length, yMax: nice(P.sizes.wind).max, yStep: nice(P.sizes.wind).step, series: [{ values: dWind.map(function (x) { return x.value; }), color: "var(--lx-wind)", width: 1.4 }], ticks: monthTicks(C, dWind.length, "day"), title: "Daily mean output (MW)", label: "Daily mean output of Prairie Town's wind farm, 365 values." });
          else chart(host, { n: 12, bars: true, yMax: nice(best.value / 1000).max, yStep: nice(best.value / 1000).step, yFmt: function (v) { return int(v); }, series: [{ values: mWind.map(function (x) { return x.value / 1000; }), color: "var(--lx-wind)" }],
            ticks: MON.map(function (m, i) { return [i, m.charAt(0)]; }), title: "Energy each month (GWh)", label: "Monthly wind energy of Prairie Town's farm, in GWh.",
            alt: "<table class='b2-tbl'><thead><tr><th scope='col'>Month</th><th scope='col'>GWh</th><th scope='col'>Hours</th></tr></thead><tbody>" + mWind.map(function (x, i) { return "<tr><td class='l'>" + MONTHS[i] + "</td><td>" + (x.value / 1000).toFixed(1) + "</td><td>" + x.hours + "</td></tr>"; }).join("") + "</tbody></table>" });
          if (seen.h && seen.d && seen.m) { api.done(); api.saw("Average power uses the mean; energy uses the sum, because each hourly MW value is also that hour's MWh. Most wind energy: " + MONTHS[+best.key.slice(5) - 1] + " (" + (best.value / 1000).toFixed(1) + " GWh); least: " + MONTHS[+worst.key.slice(5) - 1] + " (" + (worst.value / 1000).toFixed(1) + " GWh)."); }
        }
        sg.set("h"); show("h");
        code(act, ['wind = town["wind"] * ' + P.sizes.wind + "  # MW: the cleaned shape × the farm's size", 'wind.resample("D").mean()  # MW: average power each day', 'wind.resample("MS").sum() / 1000  # GWh: energy each month']);
      } });

    // 8 duration curve and capacity factor
    var cfW = capacityFactor(P.wind, P.sizes.wind), cfS = capacityFactor(P.solar, P.sizes.solar), h90 = hoursAbove(P.demand, 0.9 * P.sizes.demand), h95 = hoursAbove(P.demand, 0.95 * P.sizes.demand);
    steps.push({ text: "Sort a year of hours from highest to lowest: a [[duration-curve|duration curve]]. It shows how many hours a level is reached, and the capacity factor as an area.",
      build: function (act, api) {
        var col = "demand", sorted = false;
        var sg = seg(act, "Series", [["demand", "Demand"], ["wind", "Wind farm"], ["solar", "Solar farm"]], function (k) { col = k; draw(); });
        var tg = H("button", { class: "lx-btn small", type: "button", "aria-pressed": "false", text: "Sort the hours" }, act);
        var host = H("div", null, act), res = H("div", { class: "b2-res", "aria-live": "polite" }, act);
        tg.addEventListener("click", function () { sorted = !sorted; tg.setAttribute("aria-pressed", sorted ? "true" : "false"); tg.textContent = sorted ? "Back to calendar order" : "Sort the hours"; draw(); if (sorted) { api.done(); api.saw("Demand is above 90% of its peak for only " + h90 + " of 8,760 hours, yet the system must be ready for them. For the farms, the shaded share is the capacity factor: wind " + pct1(cfW) + ", solar " + pct1(cfS) + "."); } });
        function draw() {
          var size = P.sizes[col], v = sorted ? sortedDesc(P[col]) : P[col];
          host.innerHTML = "";
          chart(host, { n: v.length, yMax: nice(size).max, yStep: nice(size).step, series: [{ values: v, color: COLS[col].color, area: col !== "demand" && sorted, width: sorted ? 2 : 0.6 }],
            ticks: sorted ? function (W) { return W < 480 ? [[0, "1", "start"], [4380, "4,380"], [8759, "8,760 h", "end"]] : [[0, "1", "start"], [2190, "2,190"], [4380, "4,380"], [6570, "6,570"], [8759, "8,760 h", "end"]]; } : ticksH,
            level: col === "demand" ? 0.9 * size : null, levelLabel: col === "demand" ? "90% of peak" : null,
            title: (sorted ? "Hours sorted from highest to lowest" : "Calendar order") + " (MW)", label: COLS[col].label + " of Prairie Town, " + (sorted ? "as a duration curve." : "in calendar order.") });
          res.innerHTML = "";
          if (col === "demand") { H("p", { class: "b2-big", text: h90 + " hours above 90% of the peak" }, res); H("p", { class: "k", text: h95 + " hours above 95%; peak " + size + " MW (Prairie Town, illustrative)." }, res); }
          else { var cf = col === "wind" ? cfW : cfS; H("p", { class: "b2-big", text: "Capacity factor " + pct1(cf) }, res); H("p", { class: "k", text: "Energy ÷ (" + size + " MW × 8,760 h). Illustrative: the farm is sized to reach full output in SPP's best hour of 2025." }, res); }
        }
        sg.set(col); draw();
        code(act, ['curve = town_mw["demand"].sort_values(ascending=False).reset_index(drop=True)', 'curve.plot()  # the duration curve',
          '(town["demand"] > 0.9).sum()  # hours above 90% of the peak', "wind.sum() / (" + P.sizes.wind + " * len(wind))  # capacity factor = energy ÷ (size × hours)"]);
      } });

    // 9 asserts
    var kR = checks(R), kC = checks(C);
    steps.push({ text: "Turn each check into an [[assert|assert]], so a bad file stops the notebook with a message instead of slipping into your results. Run the five asserts on both files.",
      build: function (act, api) {
        var row = H("div", { class: "b2-pills" }, act), ran = {};
        var bR = H("button", { class: "lx-btn small ghost", type: "button", text: "Run on the raw file" }, row), bC = H("button", { class: "lx-btn small ghost", type: "button", text: "Run on the cleaned file" }, row);
        var ul = H("ul", { class: "b2-asserts" }, act), cells = ASSERTS.map(function (a) {
          var li = H("li", null, ul); H("code", { text: a.code }, li); var r = H("div", { class: "r" }, li);
          var c1 = H("span", { class: "b2-na", text: "raw: not run" }, r), c2 = H("span", { class: "b2-na", text: "cleaned: not run" }, r);
          return [c1, c2];
        });
        function run(which) {
          ran[which] = true;
          (which === "raw" ? kR : kC).forEach(function (r, i) { var c = cells[i][which === "raw" ? 0 : 1]; c.className = r.ok ? "b2-ok" : "b2-bad"; c.textContent = (which === "raw" ? "raw: " : "cleaned: ") + (r.ok ? "pass" : "FAIL") + " · " + r.detail; });
          if (ran.raw && ran.clean) {
            var fR = kR.filter(function (r) { return !r.ok; }).length, fC = kC.filter(function (r) { return !r.ok; }).length;
            api.done(); api.saw("The raw file fails " + fR + " of 5; the cleaned file " + (fC ? "fails " + fC + ", the night check" : "passes all five") + ". A failing assert is doing its job: it stops the run until someone decides what to do.");
          }
        }
        bR.addEventListener("click", function () { run("raw"); }); bC.addEventListener("click", function () { run("clean"); });
        code(act, ["# the helpers longest_repeat and bad_night are defined in the notebook", "# an assert is silent when true and stops with its message when false"]);
      } });

    LX.StepCards(live, { id: "b2-steps", steps: steps });
    explain();
    return { R: R, C: C, P: P };
  }

  function explain() {
    var host = document.getElementById("b2-explain"); if (!host) return;
    host.innerHTML = "";
    var row = H("div", { class: "lx-row2" }, host), c1 = H("div", { class: "lx-xcard" }, row), c2 = H("div", { class: "lx-xcard" }, row);
    LX.Flowchart(c1, {
      title: "Checking a year of data", lede: "The same questions for every file. Trace four real cases from SPP's 2025 data through them.",
      nodes: {
        load: { t: "Load the file", s: "rows, columns, units", k: "end" },
        time: { t: "Fix the time stamps", tN: ["Fix the", "time stamps"], s: "hour start, local time", sN: "hour start, local" },
        q1: { t: "Out of range?", tN: ["Out of", "range?"], k: "q" },
        q2: { t: "Stuck repeats?", tN: ["Stuck", "repeats?"], k: "q" },
        q3: { t: "Breaks physics?", tN: ["Breaks", "physics?"], k: "q" },
        flag: { t: "Flag the hours", s: "never delete silently", sN: "never silently" },
        fill: { t: "Fill, drop or keep", tN: ["Fill, drop", "or keep"], s: "and write down which", sN: "write it down" },
        end: { t: "Assert and document", tN: ["Assert and", "document"], k: "end" }
      },
      cols: 3, at: { load: [1, 0], time: [1, 1], q1: [1, 2], q2: [1, 3], q3: [1, 4], flag: [2, 3], fill: [2, 5], end: [1, 6] },
      colsN: 2, atN: { load: [0, 0], time: [0, 1], q1: [0, 2], q2: [0, 3], q3: [0, 4], flag: [1, 3], fill: [1, 5], end: [0, 6] },
      edges: [["load", "time"], ["time", "q1"], ["q1", "flag", "yes"], ["q1", "q2", "no"], ["q2", "flag", "yes"], ["q2", "q3", "no"], ["q3", "flag", "yes"], ["q3", "end", "no"], ["flag", "fill"], ["fill", "end"]],
      traces: [
        { label: "21 June · the spike", path: ["load", "time", "q1", "flag", "fill", "end"], text: "Demand read **1,505 MW** for one hour, under 5% of the median: out of range, flagged, and filled by the data build from the day-ahead forecast." },
        { label: "December · the freeze", path: ["load", "time", "q1", "q2", "flag", "fill", "end"], text: "Every column stood still for **155 hours**: flagged as repeats and filled with the same hour on nearby valid days." },
        { label: "9 March · 23 hours", path: ["load", "time", "q1", "q2", "q3", "end"], text: "A **23-hour** day when the clocks go forward: nothing is wrong, so nothing is flagged; the checks must allow it." },
        { label: "Late-winter nights", path: ["load", "time", "q1", "q2", "q3", "flag", "fill", "end"], text: "Solar above zero at **2 a.m.**, never repeating exactly: only the physics check sees it. The notebook flags those days and refills them." }
      ], sel: 1
    });
    LX.Checklist(c2, { id: "b2-checklist", title: "A data check you can reuse", lede: "Before any analysis, tick each line for your file. The pandas line under each is where to start.",
      doneText: "Write what you found in a data note.",
      items: [
        { id: "rows", label: "Rows and span", text: "One row per hour: 8,760 for 2025, 8,784 in a leap year.", note: "len(df), df.index.min(), df.index.max()" },
        { id: "stamps", label: "Time stamps", text: "Which time zone, and does each stamp mark the hour's start or its end?", note: "df.index.tz" },
        { id: "dst", label: "Daylight saving", text: "Local days of 23 and 25 hours are real, not errors.", note: "df.groupby(df.index.date).size()" },
        { id: "units", label: "Units", text: "[[power|MW]] is a rate, [[energy|MWh]] an amount; hourly data hide the difference, so name it.", note: "" },
        { id: "range", label: "Range and spikes", text: "Minimum, maximum, and anything under half the median.", note: "df.describe()" },
        { id: "repeat", label: "Repeats", text: "Runs of the same non-zero value: a stuck sensor.", note: "repeats(df[col]).sum()" },
        { id: "physics", label: "Physics", text: "Sun at night, negative demand, output above [[capacity|capacity]].", note: "bad_night(df).sum()" },
        { id: "gaps", label: "Gaps and fills", text: "Count missing values, and record how each was filled.", note: "df.isna().sum()" },
        { id: "source", label: "Provenance", text: "Source, file names, download date, checksums and licence.", note: "" }
      ] });
  }

  LX.mount("python-data", function (live, data, root) {
    injectCSS();
    root.lxLesson = view(live, data);
    // demo states (core.js LX.demo): "step-N" plays steps 1..N with their actions; "mid" = step 4 at N = 3
    LX.demo(root, function (state) {
      var upto = state === "mid" ? 4 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!upto) return null;
      var card = live.querySelector(".lx-stepcard");
      var q = function (sel, i) { return card.querySelectorAll(sel)[i || 0]; }, click = function (el) { if (el) el.click(); };
      var acts = [function () { click(q(".lx-step-act .lx-btn")); }, function () { click(q(".b2-cell", 9)); }, function () { click(q(".lx-seg button", 2)); },
        function () { click(q(".lx-ctl-row button", 1)); }, function () { click(q(".lx-step-act > .lx-btn")); }, function () { click(q(".b2-pills .lx-btn", 0)); click(q(".b2-pills .lx-btn", 1)); },
        function () { click(q(".lx-seg button", 1)); click(q(".lx-seg button", 2)); }, function () { click(q(".lx-step-act > .lx-btn")); }, function () { click(q(".b2-pills .lx-btn", 0)); click(q(".b2-pills .lx-btn", 1)); }];
      for (var k = 0; k < upto && k < acts.length; k++) { acts[k](); if (k < upto - 1) click(q(".lx-step-foot .lx-btn:not(.ghost)")); }
      return { view: "step " + Math.min(upto, acts.length) };
    });
  });
})();
