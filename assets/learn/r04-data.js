// r04-data.js — Research studio R4, "Data you can defend: sources, cleaning, licences and provenance" (W2, 2026-11-03).
//
// Data (real, Southwest Power Pool 2025, from EIA Form EIA-930; the same raw extract as lesson B2):
//   assets/learn/data/b02-python-data.json  demand, wind and solar in MW from EIA's adjusted columns, before any cleaning;
//                                           index i = the hour ENDING at start_utc + i hours, in UTC (EIA-930 convention)
//   assets/learn/data/r04-data.json         the studio's text: the decisions and their options, the licence cards, the
//                                           spatial-layer question, the exemplars, the rubric lines, sources with dates
//
// B2 finds the problems (a one-hour spike, frozen telemetry, 23- and 25-hour days). R4 is about defending what you do
// about them: for each problem the reader picks an option, the page cleans the real year with that option, and four
// reported numbers move (annual demand energy, the lowest hour of demand, the clock time of the peak hour, annual wind
// energy). A sensitivity table then varies one choice at a time, the log writes itself from the choices, and the reader
// finishes a data note. The rules are the course's own documented example (scripts/build_learn_town_data.py, which
// builds Prairie Town's shapes): spikes under half the median, runs of 3 or more identical non-zero readings, gaps filled
// from the same hour on nearby valid days (7, then 21, then 45 days each side). The course's build fills demand from the
// rescaled day-ahead forecast, which this raw file does not carry, so here every column uses the same-hour rule.
//
// Local time follows the U.S. rule used in B2 (Central daylight time, UTC-5, from 08:00 UTC on the second Sunday in March
// to 07:00 UTC on the first Sunday in November; standard time, UTC-6, otherwise). The Node test checks it against B2's
// model and the ICU time-zone database.
//
// Shared components: LX.StepCards, LX.CardSort (the licence sort), LX.Plot (the frozen week), LX.Flowchart,
// LX.CompareTable, LX.Checklist, LX.Exemplars, LX.Rubric. Lesson-local: the decision buttons, the four-number readout,
// the sensitivity table and the data-note form; CSS injected once with --lx-* tokens only.
//
// The pure model is exported for Node (_tests/learn/test_r04-data.js checks every number the page states).
(function () {
  "use strict";
  var HOUR = 3600000, WINDOWS = [7, 21, 45];
  var COLS = ["demand", "wind", "solar"];

  // ---------------------------------------------------------------- pure model
  function frame(file) {
    return { t0: Date.parse(file.start_utc + "Z"), n: file.demand.length, cols: { demand: file.demand, wind: file.wind, solar: file.solar } };
  }
  function nthSunday(y, month, k) { var dow = new Date(Date.UTC(y, month, 1)).getUTCDay(); return 1 + (7 - dow) % 7 + 7 * (k - 1); }
  function dstBounds(y) { return [Date.UTC(y, 2, nthSunday(y, 2, 2), 8), Date.UTC(y, 10, nthSunday(y, 10, 1), 7)]; }
  function centralOffset(ms) { var b = dstBounds(new Date(ms).getUTCFullYear()); return ms >= b[0] && ms < b[1] ? -5 : -6; }
  function pad(v) { return (v < 10 ? "0" : "") + v; }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // the clock reading of the START of row i's hour in a time base: "utc", "cst" (UTC-6 all year) or "local" (Central with
  // daylight saving); zone is the label a reader sees (UTC, CST, CDT)
  function clock(F, i, base) {
    var start = F.t0 + (i - 1) * HOUR, off = base === "utc" ? 0 : base === "cst" ? -6 : centralOffset(start);
    var t = new Date(start + off * HOUR);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), off: off,
             zone: base === "utc" ? "UTC" : off === -5 ? "CDT" : "CST",
             date: t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate()) };
  }
  function dateText(iso) { var p = iso.split("-"); return (+p[2]) + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function hourLabel(c) { return pad(c.h) + ":00–" + pad((c.h + 1) % 24) + ":00 " + c.zone + ", " + c.d + " " + MONTHS[c.m - 1]; }
  // rows per local day (hour start, Central with daylight saving): 9 March 2025 has 23, 2 November 25
  function localDays(F) {
    var keys = [], per = {};
    for (var i = 0; i < F.n; i++) { var k = clock(F, i, "local").date; if (!(k in per)) { per[k] = 0; keys.push(k); } per[k]++; }
    return keys.map(function (k) { return { date: k, hours: per[k] }; });
  }
  function median(a) {
    var v = a.filter(function (x) { return x != null; }).sort(function (x, y) { return x - y; }), n = v.length;
    return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  }
  function meanSd(a) {
    var v = a.filter(function (x) { return x != null; }), n = v.length, s = 0, ss = 0, i;
    for (i = 0; i < n; i++) s += v[i];
    var m = s / n;
    for (i = 0; i < n; i++) ss += (v[i] - m) * (v[i] - m);
    return { mean: m, sd: Math.sqrt(ss / (n - 1)) };
  }
  // spike rules for demand: "half" (under half the median, the course's rule) or "sd3" (more than 3 standard deviations
  // below the mean); "keep" flags nothing
  function spikeFlags(a, rule) {
    var f = a.map(function () { return false; });
    if (rule === "keep") return f;
    var lim = rule === "sd3" ? (function (s) { return s.mean - 3 * s.sd; })(meanSd(a)) : 0.5 * median(a);
    a.forEach(function (v, i) { if (v != null && v < lim) f[i] = true; });
    return f;
  }
  function spikeLimit(a, rule) { if (rule === "sd3") { var s = meanSd(a); return s.mean - 3 * s.sd; } return 0.5 * median(a); }
  // frozen readings: runs of minRun or more identical non-zero values (0 = off); zeros are legitimate (solar at night)
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
  function runFlags(a, minRun) {
    var f = a.map(function () { return false; });
    if (minRun) runs(a, minRun).forEach(function (r) { for (var k = r.start; k < r.start + r.len; k++) f[k] = true; });
    return f;
  }
  // fill flagged hours: "drop" (leave them out of every total), "linear" (a straight line between the valid hours either
  // side), "same" (the mean of the same row on valid days nearby: 7, then 21, then 45 days each side, as the course's
  // data build does for wind and solar)
  function fill(a, flags, method) {
    var out = a.slice(), n = a.length, i, j, k;
    if (method === "drop") { for (i = 0; i < n; i++) if (flags[i]) out[i] = null; return out; }
    if (method === "linear") {
      i = 0;
      while (i < n) {
        if (!flags[i]) { i++; continue; }
        j = i; while (j < n && flags[j]) j++;
        var L = i > 0 ? a[i - 1] : a[j], R = j < n ? a[j] : L;
        for (k = i; k < j; k++) out[k] = L + (R - L) * (k - i + 1) / (j - i + 1);
        i = j;
      }
      return out;
    }
    for (i = 0; i < n; i++) {
      if (!flags[i]) continue;
      out[i] = 0;
      for (var w = 0; w < WINDOWS.length; w++) {
        var s = 0, c = 0;
        for (k = -WINDOWS[w]; k <= WINDOWS[w]; k++) { var q = i + 24 * k; if (k && q >= 0 && q < n && !flags[q]) { s += a[q]; c++; } }
        if (c) { out[i] = s / c; break; }
      }
    }
    return out;
  }
  // forcing every local day to 24 rows: the spring day gets a copy of its last standard-time hour where the clock jumped,
  // the autumn day loses its second 01:00 hour. Returns {a, added, dropped} (row indices in the original series).
  function dstForce(F, a) {
    var b = dstBounds(new Date(F.t0).getUTCFullYear());
    var add = Math.round((b[0] - F.t0) / HOUR) + 1;   // first row whose hour starts at the spring jump (08:00 UTC)
    var drop = Math.round((b[1] - F.t0) / HOUR) + 1;  // the row whose hour starts at 07:00 UTC in autumn: the second 01:00
    var out = a.slice(0, add).concat([a[add - 1]], a.slice(add, drop), a.slice(drop + 1));
    return { a: out, added: add - 1, dropped: drop };
  }
  var DEFAULT = { time: "label", spike: "half", frozen: 3, fill: "same" };
  // the whole pipeline for one set of choices: time, spike, frozen, fill (see DEFAULT; time "utc", "label", "cst", "force")
  function clean(F, ch) {
    ch = Object.assign({}, DEFAULT, ch || {});
    var flags = {}, out = {}, count = {};
    COLS.forEach(function (k) {
      var f = runFlags(F.cols[k], ch.frozen), sp = k === "demand" ? spikeFlags(F.cols[k], ch.spike) : null;
      count[k] = { frozen: f.filter(Boolean).length, spike: sp ? sp.filter(function (x, i) { return x && !f[i]; }).length : 0, runs: ch.frozen ? runs(F.cols[k], ch.frozen).length : 0 };
      if (sp) f = f.map(function (x, i) { return x || sp[i]; });
      flags[k] = f;
      out[k] = fill(F.cols[k], f, ch.fill);
    });
    var forced = null;
    if (ch.time === "force") COLS.forEach(function (k) { var r = dstForce(F, out[k]); out[k] = r.a; forced = r; });
    return { choice: ch, flags: flags, cols: out, count: count, forced: forced };
  }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) if (a[i] != null) s += a[i]; return s; }
  function argExt(a, sign) { var b = -1; for (var i = 0; i < a.length; i++) if (a[i] != null && (b < 0 || sign * a[i] > sign * a[b])) b = i; return b; }
  // the four reported numbers (and the rows): demand TWh, lowest hour (GW and when), peak hour (when, in the time base the
  // reader chose; UTC rows when labels are UTC), wind TWh
  function report(F, R) {
    var d = R.cols.demand, base = R.choice.time === "utc" ? "utc" : R.choice.time === "cst" ? "cst" : "local";
    var lo = argExt(d, -1), hi = argExt(d, 1);
    // with forced days the rows after the spring copy are one place late until the autumn drop: map back to the true row
    var row = function (i) { var f = R.forced; return !f ? i : i <= f.added ? i : i <= f.dropped ? i - 1 : i; };
    return {
      rows: d.length, hours: d.filter(function (v) { return v != null; }).length,
      demandTWh: sum(d) / 1e6, windTWh: sum(R.cols.wind) / 1e6, solarTWh: sum(R.cols.solar) / 1e6,
      minGW: d[lo] / 1e3, minAt: hourLabel(clock(F, row(lo), base)), peakGW: d[hi] / 1e3, peakAt: hourLabel(clock(F, row(hi), base)),
      peakHour: clock(F, row(hi), base).h, peakZone: clock(F, row(hi), base).zone
    };
  }
  var OPTIONS = {
    time: ["utc", "label", "cst", "force"],
    spike: ["keep", "half", "sd3"],
    frozen: [0, 2, 3, 4, 6, 12, 24],
    fill: ["drop", "linear", "same"]
  };
  // vary one decision at a time from the reader's choices: a row per alternative, with its four numbers
  function sensitivity(F, ch) {
    ch = Object.assign({}, DEFAULT, ch || {});
    var base = report(F, clean(F, ch)), rows = [];
    Object.keys(OPTIONS).forEach(function (key) {
      OPTIONS[key].forEach(function (opt) {
        if (opt === ch[key]) return;
        var c = Object.assign({}, ch); c[key] = opt;
        rows.push({ key: key, option: opt, rep: report(F, clean(F, c)) });
      });
    });
    return { base: base, rows: rows };
  }
  // the largest absolute change of each reported number across the alternatives of each decision
  function swings(S) {
    var out = {};
    S.rows.forEach(function (r) {
      var o = out[r.key] = out[r.key] || { demandTWh: 0, minGW: 0, windTWh: 0, peak: 0 };
      o.demandTWh = Math.max(o.demandTWh, Math.abs(r.rep.demandTWh - S.base.demandTWh));
      o.minGW = Math.max(o.minGW, Math.abs(r.rep.minGW - S.base.minGW));
      o.windTWh = Math.max(o.windTWh, Math.abs(r.rep.windTWh - S.base.windTWh));
      if (r.rep.peakAt !== S.base.peakAt) o.peak = 1;
    });
    return out;
  }
  // the cleaning log, one line per step, from the choices (D: the studio's text for each option)
  function f1(v) { return (Math.round(v * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function f2(v) { return (Math.round(v * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function f0(v) { return Math.round(v).toLocaleString("en-US"); }
  function logLines(F, R, D, why) {
    var ch = R.choice, c = R.count, rep = report(F, R), w = why || {};
    var opt = function (key) {
      var o = D.decisions[key].options.filter(function (x) { return String(x.id) === String(ch[key]); })[0];
      return { log: o.log.replace("{limit}", f0(spikeLimit(F.cols.demand, ch.spike))) };
    };
    var lines = [];
    lines.push({ key: "time", step: "Time base", what: opt("time").log, count: ch.time === "force" ? "1 hour copied (9 March), 1 hour dropped (2 November)" : "8,760 rows kept",
                 why: w.time || "" });
    lines.push({ key: "spike", step: "Spike rule", what: opt("spike").log,
                 count: ch.spike === "keep" ? "0 hours flagged" : c.demand.spike + " demand hour" + (c.demand.spike === 1 ? "" : "s") + " flagged", why: w.spike || "" });
    lines.push({ key: "frozen", step: "Frozen-reading rule", what: opt("frozen").log,
                 count: ch.frozen ? COLS.map(function (k) { return k + " " + f0(c[k].frozen) + " h"; }).join(", ") : "none flagged", why: w.frozen || "" });
    lines.push({ key: "fill", step: "Fill method", what: opt("fill").log,
                 count: f0(COLS.reduce(function (s, k) { return s + R.flags[k].filter(Boolean).length; }, 0)) + " flagged values " + (ch.fill === "drop" ? "left out" : "filled"), why: w.fill || "" });
    lines.push({ key: "result", step: "Effect", what: "Demand " + f2(rep.demandTWh) + " TWh; lowest hour " + f1(rep.minGW) + " GW; peak hour " + rep.peakAt + "; wind " + f2(rep.windTWh) + " TWh",
                 count: f0(rep.hours) + " of " + f0(rep.rows) + " demand rows with values", why: "" });
    return lines;
  }
  // the data note as plain text: provenance from the data file's meta, the log, and the reader's own lines
  function dataNote(meta, F, R, D, notes) {
    var n = notes || {}, L = logLines(F, R, D, n.why), out = [];
    out.push("DATA NOTE");
    out.push("Dataset: " + meta.title);
    out.push("Source: " + meta.source + " (" + meta.source_url + ")");
    out.push("Files and SHA-256: " + meta.files.map(function (f) { return f.name + " " + f.sha256; }).join("; "));
    out.push("Accessed: " + meta.accessed);
    out.push("Licence: " + (n.licence || meta.license));
    out.push("Units: " + meta.units);
    out.push("Time: " + meta.time);
    out.push("Cleaning log:");
    L.forEach(function (l, i) { out.push("  " + (i + 1) + ". " + l.step + ": " + l.what + " [" + l.count + "]" + (l.why ? " Why: " + l.why : "")); });
    out.push("Known limits: " + (n.limits || ""));
    out.push("Rerun: " + (n.rerun || ""));
    return out.join("\n");
  }
  // the December freeze for the chart: rows from..to (local dates 12 to 24 December), raw and filled
  function week(F, R, from, to) {
    var i0 = -1, i1 = -1;
    for (var i = 0; i < F.n; i++) { var dt = clock(F, i, "local").date; if (dt >= from && i0 < 0) i0 = i; if (dt <= to) i1 = i; }
    return { i0: i0, i1: i1, raw: F.cols.wind.slice(i0, i1 + 1), clean: R.cols.wind.slice(i0, i1 + 1), flags: R.flags.wind.slice(i0, i1 + 1) };
  }
  var RAW = { time: "utc", spike: "keep", frozen: 0, fill: "same" };
  // the two data-note excerpts of the exemplars, written from the model so every number is the page's own
  function exemplarParts(F, meta) {
    var base = clean(F, DEFAULT), rb = report(F, base), raw = report(F, clean(F, RAW)), drop = report(F, clean(F, Object.assign({}, DEFAULT, { fill: "drop" })));
    var c = base.count, sp = F.cols.demand.indexOf(Math.min.apply(null, F.cols.demand)), when = clock(F, sp, "local");
    var weak = ["Data from ", { text: "EIA", note: "Which form, area, files, download date and licence? A reader cannot find the same file." }, ". We ",
      { text: "removed outliers", note: "No rule and no count; and removing is not flagging: the hours vanish from every total." }, " and ",
      { text: "filled missing values", note: "EIA's adjusted file has no blanks: the gaps are the hours you flagged. Which method, and how many hours?" }, ", and ",
      { text: "converted times to local time", note: "Which zone, and what happened to the 23- and 25-hour days?" }, ". Annual demand was ",
      { text: "about " + f0(rb.demandTWh) + " TWh", note: "Raw or cleaned? Here both round to " + f0(rb.demandTWh) + " TWh (" + f2(raw.demandTWh) + " and " + f2(rb.demandTWh) + "), so only a log can say which." }, "."];
    var good = ["Source: EIA Form EIA-930 six-month BALANCE files, balancing authority SWPP, 2025, ",
      { text: "accessed " + dateText(meta.accessed) + ", SHA-256 " + meta.files.map(function (x) { return x.sha256.slice(0, 8); }).join("… and ") + "…", note: "Date and checksums let anyone confirm they hold the same file." }, "; ",
      { text: "public domain, cited with the date", note: "The licence is checked and its request (an acknowledgment with a date) is met." }, ". Time: ",
      { text: "rows kept in UTC, hour ending; results labelled in Central time with daylight saving", note: "No hour is lost or doubled, and every clock time on the page is named." }, ". Spikes: ",
      { text: "demand under half the median (" + f0(spikeLimit(F.cols.demand, "half")) + " MW): " + c.demand.spike + " hour, " + when.d + " " + MONTHS[when.m - 1] + ", " + f0(F.cols.demand[sp]) + " MW", note: "Rule, threshold, count and the value itself." }, ". Frozen: ",
      { text: "runs of 3 or more identical non-zero readings: demand " + f0(c.demand.frozen) + " h, wind " + f0(c.wind.frozen) + " h, solar " + f0(c.solar.frozen) + " h", note: "Counts per column, so the reader sees what each rule removed." }, ". Fill: the same hour on valid days within 7, 21 or 45 days. ",
      { text: "Effect: annual demand " + f2(rb.demandTWh) + " TWh (raw " + f2(raw.demandTWh) + "); lowest hour " + f1(rb.minGW) + " GW (raw " + f1(raw.minGW) + ")", note: "Raw against cleaned: the reader sees what cleaning changed." }, "; ",
      { text: "leaving the flagged hours out would give " + f2(drop.demandTWh) + " TWh", note: "The rejected alternative and its effect: the choice is defended, not just made." }, "."];
    return { weak: weak, good: good };
  }
  function exemplarsSpec(F, meta) {
    var P = exemplarParts(F, meta);
    return { title: "Two data notes for the same file", task: "Write the data note for your cleaned SPP 2025 file.", id: "r4-ex",
      answers: [{ key: "weak", label: "Weak answer", level: "Developing", parts: P.weak }, { key: "good", label: "Strong answer", level: "Proficient", parts: P.good }],
      diff: [{ label: "Provenance", weak: "“EIA”", good: "Form, area, year, access date, checksums, licence" },
             { label: "Each step", weak: "A verb", good: "Rule, threshold, count" },
             { label: "Effect", weak: "One rounded number", good: "Raw against cleaned, and the rejected alternative" }],
      note: "Both notes are illustrative; every number in them is computed on this page from the raw file." };
  }
  // the no-JS version of the task: what to produce, the four numbers raw and with the course's choices, the
  // one-choice-at-a-time table, the licence sort and the coordinate systems, as HTML
  function staticTask(F, D, build) {
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var raw = report(F, clean(F, RAW)), S = sensitivity(F, DEFAULT), h = [];
    var v = function (rep, id) { return id === "peakAt" ? rep.peakAt : id === "minGW" ? f1(rep.minGW) + " GW" : f2(rep[id]) + " TWh"; };
    var lab = function (key, id) { return D.decisions[key].options.filter(function (o) { return String(o.id) === String(id); })[0].label; };
    h.push('<p class="lx-eyebrow">The task</p>');
    h.push('<ol class="lx-studio-task">');
    h.push("<li><b>Produce:</b> a cleaning log (rule, count, reason and effect for each step), a licence check of every source, and a data note someone else can rerun from.</li>");
    h.push("<li><b>From:</b> SPP's raw hourly file for 2025 (demand, wind, solar; EIA-930, public domain) and, in practice, one spatial layer.</li>");
    h.push("<li><b>Done when:</b> the rubric's bar: a complete audit trail and a verification log, with licences checked and credit stated.</li></ol>");
    h.push('<p class="lx-hint">About 30 minutes guided here, then about 2 hours on your own.</p>');
    h.push('<p class="lx-eyebrow">Four numbers, raw and with the course\'s choices</p>');
    h.push('<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Choices</th>' + D.numbers.map(function (n) { return '<th scope="col">' + esc(n.label) + "</th>"; }).join("") + "</tr></thead><tbody>");
    h.push("<tr><td>Raw: UTC labels, no rules</td>" + D.numbers.map(function (n) { return '<td class="n">' + esc(v(raw, n.id)) + "</td>"; }).join("") + "</tr>");
    h.push("<tr><td>The course's: " + ["time", "spike", "frozen", "fill"].map(function (k) { return esc(D.decisions[k].label.toLowerCase() + ": " + lab(k, DEFAULT[k]).replace(/ \(the course's rule\)/, "")); }).join("; ") + "</td>" +
      D.numbers.map(function (n) { return '<td class="n">' + esc(v(S.base, n.id)) + "</td>"; }).join("") + "</tr>");
    S.rows.forEach(function (r) {
      h.push("<tr><td>Change " + esc(D.decisions[r.key].label.toLowerCase()) + ": " + esc(lab(r.key, r.option).replace(/ \(the course's rule\)/, "")) + "</td>" +
        D.numbers.map(function (n) { return '<td class="n">' + esc(v(r.rep, n.id)) + "</td>"; }).join("") + "</tr>");
    });
    h.push("</tbody></table></div>");
    var c = clean(F, DEFAULT).count;
    h.push("<p>With the course's rules the counts match its data build: demand " + f0(c.demand.frozen + c.demand.spike) + " hours flagged (" + f0(build.demand_hours_flagged_as_implausible) +
      " in the build), wind " + f0(c.wind.frozen) + " (" + f0(build.frozen_hours_filled.wind) + "), solar " + f0(c.solar.frozen) + " (" + f0(build.frozen_hours_filled.solar) + ").</p>");
    h.push('<p class="lx-eyebrow">Licences: what each source asks of you</p><ul>');
    D.licences.cards.forEach(function (k) { var b = D.licences.bins.filter(function (x) { return x.id === k.bin; })[0]; h.push("<li><b>" + esc(k.text) + "</b>: " + esc(b.label) + ". " + esc(k.why) + "</li>"); });
    h.push("</ul>");
    h.push('<p class="lx-eyebrow">A spatial layer</p><p>' + esc(D.spatial.context) + "</p><ul>");
    D.spatial.questions.forEach(function (q) { h.push("<li>" + esc(q.q) + " " + esc(q.why[q.answer]) + "</li>"); });
    h.push("</ul>");
    return h.join("\n");
  }
  var model = { staticTask: staticTask, dateText: dateText, RAW: RAW, exemplarParts: exemplarParts, exemplarsSpec: exemplarsSpec, HOUR: HOUR, WINDOWS: WINDOWS, DEFAULT: DEFAULT, OPTIONS: OPTIONS, frame: frame, dstBounds: dstBounds, centralOffset: centralOffset,
    clock: clock, hourLabel: hourLabel, localDays: localDays, median: median, meanSd: meanSd, spikeFlags: spikeFlags, spikeLimit: spikeLimit, runs: runs, runFlags: runFlags,
    fill: fill, dstForce: dstForce, clean: clean, report: report, sensitivity: sensitivity, swings: swings, logLines: logLines, dataNote: dataNote, week: week,
    f0: f0, f1: f1, f2: f2 };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function injectCSS() {
    if (document.getElementById("r4-css")) return;
    var css = [
      ".r4-read{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}",
      ".r4-tile{display:grid;gap:2px;align-content:start;padding:9px 11px;border-radius:12px;border:1px solid var(--lx-line);background:var(--lx-surface)}",
      ".r4-tile .k{font-family:var(--lx-f-display);font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--lx-ink-3)}",
      ".r4-tile .v{font-family:var(--lx-f-mono);font-weight:600;font-size:17px;color:var(--lx-ink);line-height:1.25}",
      ".r4-tile .r{font-size:12.5px;color:var(--lx-ink-3)}",
      ".r4-tile.moved{border-color:var(--lx-accent);box-shadow:inset 0 0 0 1px var(--lx-accent)}",
      ".r4-opts{display:grid;gap:8px}",
      ".r4-opts .lx-choice{text-align:left;justify-content:flex-start;font:inherit;font-size:15px;color:var(--lx-ink);background:var(--lx-surface)}",
      ".r4-opts .lx-choice .tag{margin-left:auto;font-size:12px;color:var(--lx-ink-3);white-space:nowrap}",
      ".r4-log{margin:0;padding:8px 10px;border-radius:10px;background:var(--lx-surface-2);border:1px solid var(--lx-line);font-family:var(--lx-f-mono);font-size:12.5px;line-height:1.5;color:var(--lx-ink);white-space:pre-wrap;word-break:break-word}",
      ".r4-tbl{border-collapse:collapse;font-size:13.5px;width:100%}",
      ".page-learn .r4-tbl>:not(caption)>*>*{background:transparent!important;color:inherit;box-shadow:none!important}",
      ".r4-tbl th,.r4-tbl td{padding:5px 8px;border-bottom:1px solid var(--lx-line);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".r4-tbl th{font-family:var(--lx-f-display);font-weight:500;font-size:12px;color:var(--lx-ink-3)}",
      ".r4-tbl th[scope=row],.r4-tbl td.l{text-align:left;white-space:normal}",
      ".r4-tbl tr.base td,.r4-tbl tr.base th{font-weight:600;background:var(--lx-surface-2)!important}",
      ".r4-tbl td.big{color:var(--lx-bad);font-weight:600}",
      ".r4-form{display:grid;gap:10px}",
      ".r4-form label{display:grid;gap:4px;font-family:var(--lx-f-display);font-weight:500;font-size:14px;color:var(--lx-ink)}",
      ".r4-form textarea{font:inherit;font-size:14.5px;min-height:44px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);resize:vertical;width:100%}",
      ".r4-form .lx-hint{font-family:var(--lx-f-body,inherit);font-weight:400}",
      ".r4-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".r4-plan{margin:0;padding-left:1.2rem;font-size:14px;color:var(--lx-ink-2)} .r4-plan li{margin:3px 0}",
      "@media (max-width:760px){.r4-read{grid-template-columns:repeat(2,minmax(0,1fr))}}"
    ].join("\n");
    H("style", { id: "r4-css", text: css }, document.head);
  }
  function saw(host, ok, html) { host.innerHTML = ""; H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div>" + html + "</div>" }, host); }
  function val(rep, id) { return id === "peakAt" ? rep.peakAt : id === "minGW" ? f1(rep.minGW) + " GW" : f2(rep[id]) + " TWh"; }
  // the four numbers as tiles: now, and the raw value under it; tiles that just moved are outlined
  function Readout(host, D, raw) {
    var box = H("div", { class: "r4-read", role: "group", "aria-label": "Your four reported numbers" }, host), tiles = {};
    var live = H("p", { class: "lx-sr", "aria-live": "polite" }, host);
    D.numbers.forEach(function (n) { var t = H("div", { class: "r4-tile" }, box); H("span", { class: "k", text: n.label }, t); tiles[n.id] = { t: t, v: H("span", { class: "v" }, t), r: H("span", { class: "r", text: "raw: " + val(raw, n.id) }, t) }; });
    return { set: function (rep, prev) {
      var said = [];
      D.numbers.forEach(function (n) {
        var x = tiles[n.id], now = val(rep, n.id), was = prev ? val(prev, n.id) : now;
        x.v.textContent = now; x.t.classList.toggle("moved", now !== was);
        if (now !== was) said.push(n.label + ": " + was + " to " + now);
      });
      live.textContent = said.length ? "Changed: " + said.join("; ") + "." : "No number changed.";
    } };
  }
  function optLabel(D, key, id) { return D.decisions[key].options.filter(function (o) { return String(o.id) === String(id); })[0]; }

  function view(live, data, root) {
    var D = data.r04_data, F = frame(data.b02_python_data), meta = data.b02_python_data.meta, build = data.town_days.stats;
    var stored = LX.store.get("r4-choice", null) || {}, ch = Object.assign({}, RAW, stored), R = clean(F, ch), rep = report(F, R);
    var raw = report(F, clean(F, RAW)), picked = LX.store.get("r4-picked", {}) || {};
    function setChoice(key, id) {
      var prev = rep; ch[key] = id; picked[key] = true;
      LX.store.set("r4-choice", ch); LX.store.set("r4-picked", picked);
      R = clean(F, ch); rep = report(F, R);
      return prev;
    }
    // a decision card: the options, the readout, the verdict and the log line
    function decision(key, extra) {
      return function (act, api) {
        var dec = D.decisions[key], ro;
        H("p", { class: "lx-eyebrow", text: dec.q }, act);
        var opts = H("div", { class: "r4-opts", role: "group", "aria-label": dec.q }, act), fb = H("div", { "aria-live": "polite" }, act);
        var roBox = H("div", null, act); ro = Readout(roBox, D, raw); ro.set(rep);
        var more = H("div", null, act), logp = H("pre", { class: "r4-log", hidden: true }, act);
        var bs = dec.options.map(function (o) {
          var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": picked[key] && String(ch[key]) === String(o.id) ? "true" : "false" }, opts);
          b.appendChild(document.createTextNode(o.label));
          b.addEventListener("click", function () {
            var prev = setChoice(key, o.id);
            bs.forEach(function (x, i) { x.setAttribute("aria-pressed", dec.options[i] === o ? "true" : "false"); });
            ro.set(rep, prev);
            saw(fb, o.verdict !== "bad", "<b>" + (o.verdict === "good" ? "Defensible." : o.verdict === "ok" ? "Defensible if you say so." : "Hard to defend.") + "</b> " + LX.rich(o.note));
            var line = logLines(F, R, D).filter(function (l) { return l.key === key; })[0];
            logp.hidden = false; logp.textContent = "Log: " + line.step + ": " + line.what + " [" + line.count + "]";
            if (extra) extra(more, o);
            api.done();
          });
          return b;
        });
        if (extra) extra(more, null);
      };
    }
    // ---- step 1: predict
    function predictStep(act, api) {
      var q = D.predict, pick = LX.store.get("r4-predict", null);
      H("p", { class: "lx-eyebrow", text: q.q }, act);
      var g = H("div", { class: "lx-qbtns", role: "group", "aria-label": q.q }, act);
      var ro = Readout(H("div", null, act), D, raw); ro.set(raw);
      H("p", { class: "lx-hint", text: "The raw file: SPP 2025 from EIA-930, before any cleaning, with UTC clock times. The answer comes in step 6." }, act);
      D.numbers.forEach(function (n) {
        var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": pick === n.id ? "true" : "false", text: n.label }, g);
        b.addEventListener("click", function () {
          pick = n.id; LX.store.set("r4-predict", pick);
          [].forEach.call(g.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          api.done(); api.saw("Locked in. Now make the four choices one at a time and watch which tiles move.");
        });
      });
      if (pick) api.done();
    }
    // ---- step 4 extra: counts per column against the course's data build
    function frozenExtra(host) {
      host.innerHTML = "";
      if (!picked.frozen) return;
      var t = H("table", { class: "r4-tbl" }, H("div", { class: "lx-scroll-x" }, host)), hr = H("tr", null, H("thead", null, t));
      ["Column", "Hours flagged", "Runs", "The course's build (3 h)"].forEach(function (x, i) { H("th", { scope: "col", text: x, class: i ? "" : "l" }, hr); });
      var tb = H("tbody", null, t), bc = { demand: build.demand_hours_flagged_as_implausible, wind: build.frozen_hours_filled.wind, solar: build.frozen_hours_filled.solar };
      COLS.forEach(function (k) {
        var tr = H("tr", null, tb); H("th", { scope: "row", text: k }, tr);
        H("td", { text: f0(R.count[k].frozen + R.count[k].spike) }, tr); H("td", { text: f0(R.count[k].runs) }, tr); H("td", { text: f0(bc[k]) + (k === "demand" ? " (with the spike)" : "") }, tr);
      });
      var match = ch.frozen === 3 && ch.spike !== "keep" && COLS.every(function (k) { return R.count[k].frozen + R.count[k].spike === bc[k]; });
      H("p", { class: "lx-hint", text: match ? "Your counts match the course's data build exactly." : "Demand counts include the spike hour when your spike rule flags it." }, host);
    }
    // ---- step 5 extra: the December freeze, raw and filled
    function fillExtra(host) {
      host.innerHTML = "";
      var W = week(F, R, "2025-12-12", "2025-12-24"), n = W.raw.length, spans = [], i = 0;
      while (i < n) { if (!W.flags[i]) { i++; continue; } var j = i; while (j + 1 < n && W.flags[j + 1]) j++; spans.push({ x0: i, x1: j, color: "var(--lx-bad-soft)" }); i = j + 1; }
      var ticks = function (Wd) { var t = [], every = Wd < 480 ? 96 : 48; for (var k = 0; k < n; k += every) { var c = clock(F, W.i0 + k, "local"); t.push([k, c.d + (k === 0 || Wd >= 480 ? " Dec" : ""), k === 0 ? "start" : "middle"]); } return t; };
      var P = LX.Plot(host, { box: true, text: "Text version of the chart" });
      var mx = Math.max.apply(null, W.raw.concat(W.clean.filter(function (v) { return v != null; })));
      var flagged = W.flags.filter(Boolean).length;
      P.render({ x: { min: 0, max: n - 1, ticks: ticks }, y: { min: 0, max: Math.ceil(mx / 5000) * 5000, step: 5000, fmt: function (v) { return f0(v); } }, title: "Wind output, MW",
        height: 210, heightN: 180, margin: { l: 52, r: 8, t: 10, b: 22 }, spans: spans,
        lines: [{ values: W.raw, color: "var(--lx-ink-3)", width: 1.2, dash: "4 3" }, { values: W.clean, color: "var(--lx-wind)", width: 1.8 }],
        legend: [{ label: "Raw", color: "var(--lx-ink-3)", dash: "4 3" }, { label: "After your fill", color: "var(--lx-wind)" }],
        aria: "SPP wind output from 12 to 24 December 2025, raw and after your fill, with the " + flagged + " flagged hours shaded.",
        text: { head: ["Rows", "Hours flagged", "Raw mean, MW", "Filled mean, MW"], rows: [[n, flagged, f0(W.raw.reduce(function (s, v) { return s + v; }, 0) / n),
          (function () { var v = W.clean.filter(function (x) { return x != null; }); return v.length ? f0(v.reduce(function (s, x) { return s + x; }, 0) / v.length) : "–"; })()]] } }, true);
      H("p", { class: "lx-hint", text: "Wind, 12 to 24 December (local dates). Shaded: hours your rules flagged. " + (ch.fill === "drop" ? "Left out, they leave a hole in every total." : ch.fill === "linear" ? "The straight line runs flat through the freeze." : "The fill borrows the same hour from nearby valid days.") }, host);
    }
    // ---- step 6: one choice at a time
    function sensStep(act, api) {
      var S = sensitivity(F, ch), sw = swings(S), pick = LX.store.get("r4-predict", null);
      var t = H("table", { class: "r4-tbl" }, H("div", { class: "lx-scroll-x" }, act)), hr = H("tr", null, H("thead", null, t));
      H("th", { scope: "col", class: "l", text: "Change one choice" }, hr);
      D.numbers.forEach(function (n) { H("th", { scope: "col", text: n.label }, hr); });
      var tb = H("tbody", null, t), b0 = H("tr", { class: "base" }, tb); H("th", { scope: "row", text: "Your choices" }, b0);
      D.numbers.forEach(function (n) { H("td", { text: val(S.base, n.id) }, b0); });
      S.rows.forEach(function (r) {
        var tr = H("tr", null, tb), o = optLabel(D, r.key, r.option);
        H("th", { scope: "row", text: D.decisions[r.key].label + ": " + o.label.replace(/ \(the course's rule\)/, "") }, tr);
        D.numbers.forEach(function (n) {
          var v = val(r.rep, n.id), big = n.id === "peakAt" ? v !== val(S.base, n.id) : n.id === "minGW" ? Math.abs(r.rep.minGW - S.base.minGW) > 1 : Math.abs(r.rep[n.id] - S.base[n.id]) > 1;
          var td = H("td", { class: big ? "big" : "" }, tr); if (big) H("span", { "aria-hidden": "true", text: "◆ " }, td); td.appendChild(document.createTextNode(v)); if (big) H("span", { class: "lx-sr", text: " (moved)" }, td);
        });
      });
      var rel = { demandTWh: 0, minGW: 0, windTWh: 0 };
      S.rows.forEach(function (r) { Object.keys(rel).forEach(function (k) { rel[k] = Math.max(rel[k], Math.abs(r.rep[k] - S.base[k]) / S.base[k]); }); });
      var sv = S.rows.filter(function (r) { return r.key === "spike"; }).map(function (r) { return r.rep.minGW; }).concat([S.base.minGW]);
      var spikeLo = Math.min.apply(null, sv), spikeHi = Math.max.apply(null, sv);
      var most = Object.keys(rel).sort(function (a, b) { return rel[b] - rel[a]; })[0], name = D.numbers.filter(function (n) { return n.id === most; })[0].label;
      H("p", { class: "lx-hint", text: "Red with ◆: more than 1 TWh or 1 GW away from your choices, or a different clock time." }, act);
      api.done();
      api.saw("**" + name + "** moved most: " + (most === "minGW" ? "the spike rule alone moves it between " + f1(spikeLo) + " and " + f1(spikeHi) + " GW" : "by up to " + Math.round(rel[most] * 100) + "%") +
        ". Leaving flagged hours out cuts the year's demand by " + f2(sw.fill.demandTWh) + " TWh. " + (pick ? (pick === D.predict.answer ? "Your prediction was right." : "You predicted another number.") : ""));
    }
    // ---- step 7: licences
    function licenceStep(act, api) {
      var L = D.licences;
      LX.CardSort(act, { bins: L.bins, cards: L.cards, checkLabel: "Check my sort",
        onCheck: function (g) { api.done(); api.saw("**" + g.right + " of " + g.total + "** right. Public domain still asks for a citation; share-alike and non-commercial terms travel with your derived data.", g.right < g.total - 2); } });
    }
    // ---- step 8: a spatial layer
    function spatialStep(act, api) {
      var Sp = D.spatial, answered = {};
      H("p", { text: Sp.context }, act);
      Sp.questions.forEach(function (q) {
        H("p", { class: "lx-eyebrow", text: q.q }, act);
        var g = H("div", { class: "lx-qbtns", role: "group", "aria-label": q.q }, act), fb = H("div", { "aria-live": "polite" }, act);
        q.options.forEach(function (o) {
          var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: o[1] }, g);
          b.addEventListener("click", function () {
            [].forEach.call(g.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.classList.remove("right", "wrong"); });
            var ok = o[0] === q.answer; b.classList.add(ok ? "right" : "wrong"); answered[q.id] = true;
            saw(fb, ok, LX.esc(q.why[o[0]]));
            if (Object.keys(answered).length === Sp.questions.length) { LX.store.set("r4-spatial", true); api.done(); api.saw("Log line: " + Sp.log); }
          });
        });
      });
    }
    // ---- step 9: the data note
    function noteStep(act, api) {
      var notes = LX.store.get("r4-note", {}) || {}; notes.why = notes.why || {};
      var form = H("div", { class: "r4-form" }, act), pre = H("pre", { class: "r4-log" }, act);
      ["time", "spike", "frozen", "fill"].forEach(function (k) {
        var o = optLabel(D, k, ch[k]), lab = H("label", null, form); H("span", { text: "Your reason · " + D.decisions[k].label + ": " + o.label.replace(/ \(the course's rule\)/, "") }, lab);
        var ta = H("textarea", { rows: 1 }, lab); ta.value = notes.why[k] || "";
        ta.addEventListener("input", function () { notes.why[k] = ta.value; save(); });
      });
      D.note_fields.forEach(function (f) {
        var lab = H("label", null, form); H("span", { text: f.label }, lab); H("span", { class: "lx-hint", text: f.hint }, lab);
        var ta = H("textarea", { rows: 2 }, lab); ta.value = notes[f.id] || "";
        ta.addEventListener("input", function () { notes[f.id] = ta.value; save(); });
      });
      var row = H("div", { class: "r4-row" }, act), cp = H("button", { class: "lx-btn small", type: "button", text: "Copy the data note" }, row), st = H("span", { class: "lx-hint", "aria-live": "polite", text: "Your note stays in this browser." }, row);
      cp.addEventListener("click", function () { LX.copyText(pre.textContent).then(function (ok) { st.textContent = ok ? "Copied." : "Select the note and copy it."; }); api.done(); });
      function save() { LX.store.set("r4-note", notes); draw(); }
      function draw() { pre.textContent = dataNote(meta, F, R, D, notes) + (LX.store.get("r4-spatial", false) ? "\n" + D.spatial.log : ""); if (Object.keys(notes.why).filter(function (k) { return (notes.why[k] || "").trim(); }).length >= 2) api.done(); }
      draw();
      var pl = H("details", { class: "lx-textalt" }, act); H("summary", { text: "Your own practice: about 2 hours" }, pl);
      var ol = H("ol", { class: "r4-plan" }, pl);
      D.practice.forEach(function (p) { H("li", { text: p.task + " (" + p.min + " min)" }, ol); });
      var dl = H("p", { class: "r4-row" }, pl);
      H("a", { class: "lx-btn small ghost", href: "../assets/learn/data/b02-python-data.json", download: "", text: "Raw SPP data (JSON)" }, dl);
      H("a", { class: "lx-btn small ghost", href: "notebooks/b02-python-data.ipynb", download: "", text: "B2's notebook (.ipynb)" }, dl);
    }
    var steps = [
      { text: "You will report four numbers from SPP's raw 2025 file. Before you clean anything, predict which one your cleaning will move most.", build: predictStep },
      { text: "EIA stamps each hour in [[utc|UTC]] at the hour's end (B2). Choose how your study keeps time; the clock time of the peak depends on it.", build: decision("time") },
      { text: "One demand hour reads 1,505 MW on 21 June (B2). Choose a rule for impossible values and watch the lowest hour of demand.", build: decision("spike") },
      { text: "A stuck feed repeats its last reading ([[frozen-telemetry|frozen telemetry]]). Choose how long a run must be before you flag it.", build: decision("frozen", frozenExtra) },
      { text: "Flagged hours are now gaps. Choose how to fill them, and watch the December freeze and the year's totals.", build: decision("fill", fillExtra) },
      { text: "Now vary one choice at a time from yours. Which choices move which numbers? This table is what defends your choices.", build: sensStep },
      { text: "Data come with a [[data-licence|licence]]. Sort eight sources by what their terms ask of you.", build: licenceStep },
      { text: "A spatial layer needs its own decisions. Pick a [[coordinate-reference-system|coordinate system]] for each job.", build: spatialStep },
      { text: "Write the [[data-note|data note]]: your log writes itself; add a reason for each choice, the known limits and how to rerun.", build: noteStep }
    ];
    var cards = LX.StepCards(live, { id: "r4-steps", steps: steps });
    return { cards: cards, D: D, F: F, meta: meta, choose: function (c) { Object.keys(c).forEach(function (k) { setChoice(k, c[k]); }); } };
  }
  function explain(D, F, meta) {
    var x = document.getElementById("r04-exemplars"); if (!x) return;
    x.innerHTML = "";
    LX.Exemplars(H("div", { class: "lx-xcard" }, x), exemplarsSpec(F, meta));
    var base = report(F, clean(F, DEFAULT)), raw = report(F, clean(F, RAW)), drop = report(F, clean(F, Object.assign({}, DEFAULT, { fill: "drop" })));
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "Defending one cleaning step", lede: "The same route for every suspect value. Trace three real cases from SPP's 2025 file.",
      nodes: {
        s: { t: "A suspect value", k: "end" },
        q1: { t: "Physically possible?", tN: ["Physically", "possible?"], k: "q" },
        q2: { t: "A real event?", tN: ["A real", "event?"], k: "q" },
        keep: { t: "Keep it, say why", tN: ["Keep it,", "say why"] },
        flag: { t: "Flag by a stated rule", tN: ["Flag by a", "stated rule"], s: "count the hours", sN: "count them" },
        fill: { t: "Fill or leave out", tN: ["Fill or", "leave out"], s: "and log which", sN: "log which" },
        rerun: { t: "Rerun with the alternative", tN: ["Rerun with the", "alternative"] },
        q3: { t: "Does the result move?", tN: ["Does the", "result move?"], k: "q" },
        both: { t: "Report both numbers", tN: ["Report both", "numbers"], k: "end" },
        rob: { t: "Say it is robust", tN: ["Say it is", "robust"], k: "end" }
      },
      cols: 3, at: { s: [1, 0], q1: [1, 1], q2: [2, 2], keep: [2, 3], flag: [1, 3], fill: [1, 4], rerun: [1, 5], q3: [1, 6], both: [0, 7], rob: [2, 7] },
      colsN: 2, atN: { s: [0, 0], q1: [0, 1], q2: [1, 2], keep: [1, 3], flag: [0, 3], fill: [0, 4], rerun: [0, 5], q3: [0, 6], both: [0, 7], rob: [1, 7] },
      edges: [["s", "q1"], ["q1", "flag", "no"], ["q1", "q2", "yes"], ["q2", "keep", "yes"], ["q2", "flag", "no"], ["flag", "fill"], ["fill", "rerun"], ["rerun", "q3"], ["q3", "both", "yes"], ["q3", "rob", "no"]],
      traces: [
        { label: "21 June · the spike", path: ["s", "q1", "flag", "fill", "rerun", "q3", "both"], text: "1,505 MW is not possible for this grid. Flag it; the lowest hour moves from **" + f1(raw.minGW) + "** to **" + f1(base.minGW) + " GW**. Two spike rules flag the same hour." },
        { label: "December · the freeze", path: ["s", "q1", "q2", "flag", "fill", "rerun", "q3", "both"], text: "Each value is possible, but not for 155 hours in a row. Flag the run; the fill moves the year's demand: **" + f2(base.demandTWh) + " TWh** filled against **" + f2(drop.demandTWh) + "** with the hours left out." },
        { label: "2 November · 25 hours", path: ["s", "q1", "q2", "keep"], text: "The clocks went back: a real 25-hour day. Keep every row; label it in local time." }
      ], sel: 0 });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), { title: "Ways to fill a gap, and when each is defensible", text: true,
      lede: "No fill is neutral. Pick the one that fits the gap and the question, and log it.",
      columns: [{ key: "name", label: "Fill", main: true }, { key: "shape", label: "Daily shape" }, { key: "fits", label: "Fits" }, { key: "risk", label: "Risk" }],
      rows: [
        { key: "drop", name: "Leave out", shape: "Not needed", fits: "Statistics of real readings only", risk: "Totals add up fewer hours: energy is understated" },
        { key: "lin", name: "Straight line", shape: "Lost over long gaps", fits: "Gaps of an hour or two", risk: "Flattens a week-long freeze" },
        { key: "same", name: "Same hour, nearby days", note: "the course's rule for wind and solar", shape: "Kept", fits: "Gaps of hours to weeks", risk: "Borrows other days' weather; log the hours filled" },
        { key: "fc", name: "Scaled day-ahead forecast", note: "the course's rule for demand", shape: "Kept", fits: "Demand, when a forecast column exists", risk: "Inherits any forecast bias; the course's build uses January to April checks" },
        { key: "model", name: "A model of the series", note: "for example a regression on weather", shape: "Kept", fits: "Long gaps with good inputs", risk: "Needs its own validation, and more to explain" }
      ] });
  }
  function selfcheck(D) {
    var x = document.getElementById("r04-rubric"); if (!x) return;
    x.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, x), { id: "r4-rubric", code: "R4", title: "Rate your data note against the rubric", lede: "Use the note you wrote, not the worked one.", competences: D.rubric });
    LX.Checklist(H("div", { class: "lx-xcard" }, x), { id: "r4-checklist", title: "A data note you can defend", columns: 2,
      lede: "Tick each line for your own file before you use it in a result: together they are its [[provenance|provenance]].", doneText: "Ask someone to rerun your numbers from it.",
      items: [
        { id: "source", label: "Source", text: "Agency, form or product, area, years and the address." },
        { id: "files", label: "Files and checksums", text: "File names and SHA-256, so the same bytes can be found." },
        { id: "date", label: "Access date", text: "When you downloaded it: data are revised." },
        { id: "licence", label: "Licence", text: "The terms, and the attribution line they ask for." },
        { id: "units", label: "Units", text: "[[power|MW]] or [[energy|MWh]], per what period." },
        { id: "time", label: "Time base", text: "Zone, hour start or end, daylight saving." },
        { id: "steps", label: "Each step", text: "Rule, threshold, count and reason." },
        { id: "effect", label: "Effect", text: "Raw against cleaned, and the alternative you rejected." },
        { id: "limits", label: "Known limits", text: "What the cleaning cannot catch." },
        { id: "rerun", label: "Rerun", text: "The script and command that rebuild the file." }
      ] });
  }

  LX.mount("r04", function (live, data, root) {
    injectCSS();
    var V = view(live, data, root);
    explain(V.D, V.F, V.meta); selfcheck(V.D);
    root.lxLesson = { model: model, view: V };
    // demo states: "mid" = the course's choices made, step 5 (fill) open; "sens" = step 6
    LX.demo(root, function (st) {
      if (st !== "mid" && st !== "sens") return null;
      V.choose(DEFAULT);
      V.cards.go(st === "mid" ? 4 : 5);
      if (st === "mid") setTimeout(function () { var b = live.querySelector(".r4-opts .lx-choice"); if (b) b.click(); }, 40);
      return { view: st === "mid" ? "step 5, fill chosen" : "step 6" };
    }, V.cards);
  });
})();
