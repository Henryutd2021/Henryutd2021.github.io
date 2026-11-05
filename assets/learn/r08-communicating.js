/* r08-communicating.js — research studio R8, "How do you show results so people understand their limits?" (curriculum v2
   §11; W4, 2026-11-05).
   Data: assets/learn/data/r08-communicating.json (nine findings to sort, three charts with their diagnoses and fixes, the
   findings, briefing and public-paragraph steps, exemplars, the comparison table, the boundary box, the rubric line, the
   checklist, and fromR6: the numbers of R6's fictional study, which the test recomputes with R6's model), cf_targets.json
   (EIA, Electric Power Monthly, Table 6.07.B: the U.S. wind fleet's 2025 monthly capacity factors), town_year.json (SPP's
   2025 hourly demand and wind, EIA-930) and path.json (lesson links).
   Page: learn/r08-communicating.qmd (studio form: Task, Exemplars, Self-check, Sources).

   The three charts are drawn here from those files (nothing is downloaded):
     1 the wind fleet by month    bars of the 2025 monthly capacity factor; misleading version: the axis starts at 20%
                                   (a bar's height then shows value − 20); fixed: from zero
     2 SPP's daily wind           the mean of each local day (Central time, daylight saving as lesson 2), as a share of
                                   2025's windiest hour; misleading version: the 14 days whose last day is the smallest
                                   share of the first (the steepest two-week fall of the year, a cherry-picker's rule;
                                   unique); fixed: the whole year with the two weeks marked
     3 Prairie Town's average day each local hour's mean over the year's days (MW = shape × 450, lesson 0's scale);
                                   fixed: P10–P90 across days at each hour (linear interpolation, K5's rule) and the
                                   year's highest hour
   Task (step cards): sort nine findings into holds as written, missing its conditions, claims more than shown (LX.CardSort);
   for each chart, diagnose what misleads (feedback on every option, i-quiz) and apply fixes that redraw it (LX.Plot). The
   title and caption always describe what is drawn (a title fixed before the evidence names only what is shown), and a
   chart counts as repaired only when its key fix and its title fix are both on (chartState). Write a one-sentence finding
   for each redesigned chart; write a briefing for the city council and a paragraph for the public (form-only checks,
   then examples; copy as text). A writing step is done only when every form check passes; before that it says which
   are still open (a draft is not yet the requirements met).
   Exemplars: a weak and a strong briefing (LX.Exemplars), the three charts compared (LX.CompareTable, e-table) and where the
   briefing's main finding holds (LX.Boundary, e-boundary). Self-check: Communication (LX.Rubric) and a checklist
   (LX.Checklist, e-checklist); the myth cards are page markup.
   Node: module.exports = the pure model; _tests/learn/test_r08-communicating.js checks it and writes the no-JS blocks. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rich(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; }); }
  function plain(t) { return String(t == null ? "" : t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"); }
  function words(t) { return plain(t).trim().split(/\s+/).filter(Boolean).length; }
  function hh(h) { return (h < 10 ? "0" : "") + h + ":00"; }
  function sundayUTC(y, m, nth) { var d = new Date(Date.UTC(y, m, 1)), c = 0; for (;;) { if (d.getUTCDay() === 0 && ++c === nth) return d.getTime(); d.setUTCDate(d.getUTCDate() + 1); } }
  // local days of the year: for each, its date, month and the hours' demand, wind and local hour (as lesson 2's clock)
  function localDays(year) {
    var t0 = Date.parse(year.start_utc + "Z") - 3600000, Y = new Date(t0 + 12 * 3600000).getUTCFullYear();
    var on = sundayUTC(Y, 2, 2) + 8 * 3600000, off = sundayUTC(Y, 10, 1) + 7 * 3600000, out = [], last = null;
    year.demand.forEach(function (v, i) {
      var ts = t0 + i * 3600000, L = new Date(ts + (ts >= on && ts < off ? -5 : -6) * 3600000), k = L.toISOString().slice(0, 10);
      if (k !== last) { out.push({ date: k, month: L.getUTCMonth(), day: L.getUTCDate(), d: [], w: [], h: [] }); last = k; }
      var o = out[out.length - 1]; o.d.push(v); o.w.push(year.wind[i]); o.h.push(L.getUTCHours());
    });
    return out;
  }
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function pct(v, p) { var s = v.slice().sort(function (a, b) { return a - b; }), r = (s.length - 1) * p, lo = Math.floor(r), hi = Math.min(lo + 1, s.length - 1); return s[lo] + (s[hi] - s[lo]) * (r - lo); }
  // everything the three charts and the text need, from the course's data
  function prepare(D, cf, year, peakMW) {
    peakMW = peakMW || 450;
    var days = localDays(year), wm = cf.monthly.wind.map(function (x) { return x * 100; });
    // chart 2: each day's mean wind (% of the year's windiest hour), and the cherry-picker's window
    var dm = days.map(function (d) { return mean(d.w) / 10; }), win = null, L = 14;
    for (var i = 0; i + L - 1 < dm.length; i++) { var f = dm[i + L - 1] / dm[i]; if (!win || f < win.f) win = { i: i, f: f }; }
    // chart 3: each local hour's mean, P10, P90 and maximum over the days (MW)
    var byH = []; for (var h = 0; h < 24; h++) byH.push([]);
    days.forEach(function (d) { d.d.forEach(function (v, j) { byH[d.h[j]].push(v / 1000 * peakMW); }); });
    var hours = byH.map(function (v, h) { return { h: h, n: v.length, mean: mean(v), p10: pct(v, 0.1), p90: pct(v, 0.9), max: Math.max.apply(null, v) }; });
    var avgTop = hours.reduce(function (b, x) { return x.mean > b.mean ? x : b; }), p90Top = hours.reduce(function (b, x) { return x.p90 > b.p90 ? x : b; });
    // the year's highest hour, and when daily peaks come in summer and winter
    var top = { v: -1 }; days.forEach(function (d) { d.d.forEach(function (v, j) { if (v > top.v) top = { v: v, date: d, h: d.h[j] }; }); });
    var sum = days.filter(function (d) { return d.month >= 5 && d.month <= 7; }), win2 = days.filter(function (d) { return d.month === 11 || d.month <= 1; });
    var peakIdx = function (d) { return d.h[d.d.indexOf(Math.max.apply(null, d.d))]; };
    return { days: days, wm: wm, dm: dm, win: { i: win.i, n: L, f: win.f, a: dm[win.i], b: dm[win.i + L - 1] }, hours: hours, avgTop: avgTop, p90Top: p90Top, top: top, peakMW: peakMW,
             sumDays: sum.length, sumAfternoon: sum.filter(function (d) { var p = peakIdx(d); return p >= 12 && p < 18; }).length,
             winDays: win2.length, winMorn: win2.filter(function (d) { return peakIdx(d) < 12; }).length, cfYear: cf.targets.wind.cf * 100 };
  }
  var TRUNC = 20;   // the misleading chart's axis start, %
  function dayLabel(d) { return d.day + " " + MONTH[d.month]; }
  function facts(D, C) {
    var F = {}, lo = Math.min.apply(null, C.wm), hi = Math.max.apply(null, C.wm);
    F.cfYear = C.cfYear.toFixed(1); F.cfLo = lo.toFixed(1); F.cfHi = hi.toFixed(1);
    F.monthLo = MONTH[C.wm.indexOf(lo)]; F.monthHi = MONTH[C.wm.indexOf(hi)];
    F.truncRatio = ((hi - TRUNC) / (lo - TRUNC)).toFixed(1); F.realRatio = (hi / lo).toFixed(1);
    F.winStart = dayLabel(C.days[C.win.i]); F.winEnd = dayLabel(C.days[C.win.i + C.win.n - 1]);
    F.winFall = String(Math.round((1 - C.win.f) * 100)); F.winA = String(Math.round(C.win.a)); F.winB = String(Math.round(C.win.b));
    F.dLo = String(Math.round(Math.min.apply(null, C.dm))); F.dHi = String(Math.round(Math.max.apply(null, C.dm))); F.dMean = String(Math.round(mean(C.dm)));
    F.avgPeak = String(Math.round(C.avgTop.mean)); F.avgHour = hh(C.avgTop.h); F.p90Max = String(Math.round(C.p90Top.p90)); F.p90Hour = hh(C.p90Top.h);
    F.yearPeak = String(Math.round(C.top.v / 1000 * C.peakMW)); F.peakHour = hh(C.top.h); F.peakDay = dayLabel(C.top.date);
    F.sumDays = String(C.sumDays); F.winMorn = String(C.winMorn); F.winDays = String(C.winDays);
    Object.keys(D.fromR6).forEach(function (k) { if (k !== "about") F[k] = D.fromR6[k]; });
    return F;
  }
  function fill(t, F) { return String(t).replace(/\{([a-zA-Z0-9]+)\}/g, function (all, k) { if (!(k in F)) throw new Error("r08: no fact " + k); return F[k]; }); }
  function fillDeep(x, F) {
    if (typeof x === "string") return fill(x, F);
    if (Array.isArray(x)) return x.map(function (y) { return fillDeep(y, F); });
    if (x && typeof x === "object") { var o = {}; Object.keys(x).forEach(function (k) { o[k] = fillDeep(x[k], F); }); return o; }
    return x;
  }
  function chart(D, id) { return D.charts.filter(function (c) { return c.id === id; })[0]; }
  function keyFix(c) { return c.fixes.filter(function (f) { return f.key; })[0]; }

  // a chart's LX.Plot spec for a set of fixes (fx: {fixId: true}); pure, so the test reads every number it draws
  // the title a chart shows: the misleading one, or once the title fix is on, the one that names what is drawn (the full
  // title only when the key fix shows its evidence; partTitle otherwise)
  function titleOf(D, F, c, fx) { return fill(!fx.title ? c.badTitle : fx[keyFix(c).id] || !c.partTitle ? c.goodTitle : c.partTitle, F); }
  function spec(D, C, F, id, fx) {
    fx = fx || {}; var c = chart(D, id), title = titleOf(D, F, c, fx), s;
    if (id === "axis") {
      var y0 = fx.zero ? 0 : TRUNC;
      s = { x: { min: 0, max: 12, ticks: MON.map(function (m, i) { return [i + 0.5, m]; }), ticksN: MON.map(function (m, i) { return [i + 0.5, m.charAt(0)]; }) },
            y: { min: y0, max: fx.zero ? 50 : 45, step: fx.zero ? 10 : 5, fmt: function (v) { return v + "%"; }, unit: "Capacity factor" },
            bars: C.wm.map(function (v, i) { return { x0: i + 0.16, x1: i + 0.84, y0: y0, y1: v, color: "var(--lx-wind)", op: 0.85, rx: 2 }; }),
            text: { head: ["Month", "Capacity factor"], rows: C.wm.map(function (v, i) { return [MONTH[i], v.toFixed(1) + "%"]; }) } };
      s.caption = title + (fx.scope ? " (U.S. utility-scale wind fleet, 2025; EIA, Electric Power Monthly, Table 6.07.B)" : "");
      s.aria = s.caption + ". Monthly capacity factors from " + F.cfLo + "% (" + F.monthLo + ") to " + F.cfHi + "% (" + F.monthHi + "), axis from " + y0 + "%.";
      s.heights = C.wm.map(function (v) { return v - y0; });
    } else if (id === "window") {
      var a = C.win.i, n = C.win.n, yr = !!fx.year, pts = yr ? C.dm.map(function (v, i) { return [i + 1, v]; }) : C.dm.slice(a, a + n).map(function (v, i) { return [i, v]; });
      var startOfMonth = []; C.days.forEach(function (d, i) { if (d.day === 1) startOfMonth.push([i + 1, MON[d.month]]); });
      s = { x: yr ? { min: 1, max: C.dm.length, ticks: startOfMonth.filter(function (t, i) { return i % 2 === 0; }), ticksN: startOfMonth.filter(function (t, i) { return i % 3 === 0; }) }
                  : { min: 0, max: n - 1, ticks: [[0, dayLabel(C.days[a]).replace(/ (\w{3})\w*/, " $1")], [Math.floor((n - 1) / 2), dayLabel(C.days[a + Math.floor((n - 1) / 2)]).replace(/ (\w{3})\w*/, " $1")], [n - 1, dayLabel(C.days[a + n - 1]).replace(/ (\w{3})\w*/, " $1")]] },
            y: { min: 0, max: 100, step: 25, fmt: function (v) { return v + "%"; }, unit: "% of 2025's windiest hour" },
            lines: [{ pts: pts, color: "var(--lx-wind)", width: yr ? 1.4 : 2.6, dots: !yr }],
            spans: yr && fx.mark ? [{ x0: a + 0.5, x1: a + n + 0.5, color: "var(--lx-warn-soft)", op: 1, label: "the two weeks" }] : [],
            text: { head: ["Day", "Mean wind, % of the windiest hour"], rows: (yr ? C.days : C.days.slice(a, a + n)).map(function (d, i) { return [d.date, (yr ? C.dm[i] : C.dm[a + i]).toFixed(1) + "%"]; }) } };
      s.caption = title + (fx.title ? " (daily mean, % of 2025's windiest hour; EIA-930)" : "");
      s.aria = s.caption + (yr ? ". The whole year: daily means from " + F.dLo + "% to " + F.dHi + "%." : ". " + F.winStart + " to " + F.winEnd + ": from " + F.winA + "% to " + F.winB + "%.");
    } else {
      var H = C.hours;
      s = { x: { min: -0.5, max: 23.5, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [23, "23:00"]], ticksN: [[0, "00"], [6, "06"], [12, "12"], [18, "18"], [23, "23"]] },
            y: { min: 150, max: 475, step: 50, fmt: function (v) { return String(v); }, unit: "MW" },
            lines: [{ pts: H.map(function (x) { return [x.h, x.mean]; }), color: "var(--lx-accent)", width: 2.6, dots: true }],
            bars: fx.spread ? H.map(function (x) { return { x0: x.h - 0.36, x1: x.h + 0.36, y0: x.p10, y1: x.p90, color: "var(--lx-accent)", op: 0.22, rx: 2 }; }) : [],
            refs: fx.max ? [{ y: C.top.v / 1000 * C.peakMW, label: "Highest hour of 2025: " + F.yearPeak + " MW", labelN: F.yearPeak + " MW", color: "var(--lx-bad)", dash: "5 4" }] : [],
            text: { head: ["Hour", "Average (MW)"].concat(fx.spread ? ["P10 (MW)", "P90 (MW)"] : []), rows: H.map(function (x) { return [hh(x.h), Math.round(x.mean)].concat(fx.spread ? [Math.round(x.p10), Math.round(x.p90)] : []).map(String); }) } };
      var topLine = "Highest hourly demand in 2025: " + F.yearPeak + " MW, at " + F.peakHour + " on " + F.peakDay + ".";
      if (fx.max) s.text.note = topLine;
      s.caption = title + (fx.title ? " (Prairie Town on SPP's 2025 pattern" + (fx.spread ? "; band: [[percentile|P10–P90]] across days, the middle 8 days in 10" : "") + ")" : "");
      s.aria = plain(s.caption) + ". Average day peaks at " + F.avgPeak + " MW at " + F.avgHour + (fx.spread ? "; 1 day in 10 the " + F.p90Hour + " hour is above " + F.p90Max + " MW" : "") + "." + (fx.max ? " " + topLine : "");
    }
    s.height = 250; s.heightN = 220;
    return s;
  }

  // a chart's state: repaired only when a diagnosis is picked and the key fix and the title fix are both on, so the title,
  // the scope and the drawing agree; otherwise what is still open, in one line
  function chartState(D, F, c, st) {
    var fx = (st && st.fx) || {}, kf = keyFix(c), tf = c.fixes.filter(function (f) { return f.id === "title"; })[0];
    var open = [kf, tf].filter(function (f) { return !fx[f.id]; });
    if (!st || !st.pick) return { done: false, text: null };
    if (!open.length) { var r = D.chartsTable[D.charts.indexOf(c)]; return { done: true, text: "Redrawn, and the title says what is drawn. " + fill(r.finding, F) + " Next you write that as a sentence." }; }
    if (open.length === 2) return { done: false, text: "Now apply the fix that removes the problem, “" + kf.label + "”, then make the title match what is drawn." };
    if (open[0] === kf) return { done: false, text: "The title is honest now, but the drawing still misleads: apply “" + kf.label + "”." };
    return { done: false, text: "The drawing is fixed, but its title still says “" + fill(c.badTitle, F) + "”: apply “" + tf.label + "”." };
  }
  // the writing checks (form only: which parts are there)
  var RANGE = /\d[\d,.]*\s*(?:%|MW|megawatts?)?\s*(?:–|—|-|to|and)\s*\d/i;
  function findingChecks(t) {
    t = String(t || ""); var n = words(t);
    return [
      { id: "num", label: "a number with its unit", ok: /\d[\d,.]*\s*(?:%|MW|MWh|kWh|megawatts?|percent)/i.test(t) },
      { id: "where", label: "where or what", ok: /(U\.S\.|\bUS\b|SPP|Southwest Power Pool|Prairie Town|Plains|national|nation|country|region|state|county|city|utility|fleet|grid|town|wind farms?|turbines?|plants?)/i.test(t) },
      { id: "when", label: "when", ok: /(20\d\d|year|annual|month|quarter|season|daily|day|hour|week|summer|winter|spring|autumn|fall\b|morning|afternoon|evening|night|noon|January|February|March|April|May|June|July|August|September|October|November|December)/i.test(t) },
      { id: "short", label: "one sentence, at most 35 words (" + n + ")", ok: n > 0 && n <= 35 && (t.trim().replace(/U\.S\./g, "US").match(/[.!?](?=\s|$)/g) || []).length <= 1 }];   // "U.S." ends no sentence
  }
  function briefChecks(id, t) {
    t = String(t || ""); var n = words(t);
    if (id === "finding") return [{ id: "range", label: "a range", ok: RANGE.test(t) }, { id: "case", label: "the case it belongs to", ok: /(central|fast|slow|uptake|if |with |under )/i.test(t) }];
    if (id === "programme") return [{ id: "num", label: "a number with its unit", ok: /\d[\d,.]*\s*(?:%|MW|megawatts?)/i.test(t) }, { id: "case", label: "the case it holds in", ok: /(central|fast|slow|uptake|if |with |when |under |hour by hour|hourly)/i.test(t) }];
    if (id === "change") return [{ id: "signal", label: "a signal to watch", ok: n >= 4 && /(if |when|unless|request|trigger|review|new forecast|would|should)/i.test(t) }];
    return [{ id: "words", label: "at least four words", ok: n >= 4 }];
  }
  function publicChecks(D, t) {
    t = String(t || ""); var n = words(t), jar = D.public.jargon.filter(function (j) { return new RegExp("\\b" + j.replace(/ /g, "\\s+") + "\\b", "i").test(t); });
    return [
      { id: "range", label: "a range", ok: RANGE.test(t) },
      { id: "plain", label: "plain words" + (jar.length ? " (try without: " + jar.join(", ") + ")" : ""), ok: n > 0 && !jar.length },
      { id: "limit", label: "what it leaves out or depends on", ok: /(leave[s]? out|left out|depend|unless|if |do not include|does not include|not included|would add)/i.test(t) },
      { id: "short", label: "at most " + D.public.limit + " words (" + n + ")", ok: n > 0 && n <= D.public.limit }];
  }
  function briefExample(D, F) { var E = D.briefing.example, o = {}; D.briefing.fields.forEach(function (f) { o[f.id] = fill(E[f.id], F); }); return o; }
  // a writing step's state: "done" only when every form check of every field passes; else the checks still open
  function writeState(lists) {
    var open = []; lists.forEach(function (L) { L.checks.forEach(function (c) { if (!c.ok) open.push((L.label ? L.label + ": " : "") + c.label.replace(/ \(\d+\)$/, "")); }); });
    return { done: !open.length, open: open };
  }
  function findingsState(D, v) { return writeState(D.findingsStep.fields.map(function (f) { return { label: f.label.replace(/,.*$/, ""), checks: findingChecks((v || {})[f.id]) }; })); }
  function briefState(D, v) { return writeState(D.briefing.fields.map(function (f) { return { label: f.label, checks: briefChecks(f.id, (v || {})[f.id]) }; })); }
  function publicState(D, t) { return writeState([{ label: "", checks: publicChecks(D, t) }]); }
  function briefText(D, v, pub) {
    var out = ["BRIEFING FOR THE CITY COUNCIL"];
    D.briefing.fields.forEach(function (f) { out.push(f.label + ": " + (String((v || {})[f.id] || "").trim() || "(to write)")); });
    out.push("", "FOR THE PUBLIC", String(pub || "").trim() || "(to write)");
    return out.join("\n");
  }
  function exemplarsSpec(D, F) { return fillDeep(D.exemplars, F); }
  // R6's result, as the briefing and the paragraph need it (a fact sheet above both steps, and in the no-JS version)
  function factsHTML(D, F) {
    return '<dl class="lx-ideas r8-facts">' + D.briefing.facts.map(function (f) { return "<dt>" + esc(f.k) + "</dt><dd>" + rich(fill(f.v, F)) + "</dd>"; }).join("") + "</dl>";
  }
  function chartsHTML(D, F) {
    return '<p class="lx-eyebrow">Three charts, what misled and the fix</p><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Chart</th><th scope="col">What misled</th><th scope="col">The fix</th><th scope="col">A finding with its conditions</th></tr></thead><tbody>'
      + D.chartsTable.map(function (r) { return '<tr><th scope="row">' + esc(r.chart) + "</th><td>" + rich(fill(r.misled, F)) + "</td><td>" + rich(r.fix) + "</td><td>" + rich(fill(r.finding, F)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  function boundaryHTML(D) {
    var B = D.boundary;
    return '<p class="lx-eyebrow">' + esc(B.title) + '</p><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">It holds when</th><th scope="col">It leaves out</th></tr></thead><tbody><tr><td><ul>'
      + B.holds.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul></td><td><ul>" + B.leaves.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + '</ul></td></tr></tbody></table></div><p class="lx-hint">' + esc(B.source) + "</p>";
  }
  // the no-JS version of the task: the findings sorted, the three charts as numbers with their diagnoses, the examples
  function staticTask(D, C) {
    var F = facts(D, C), h = [], V = { good: "Defensible", ok: "Partly", bad: "Not it" }, B = {};
    D.bins.forEach(function (b) { B[b.id] = b.label; });
    h.push('<details class="lx-textalt"><summary>Nine findings, sorted, with reasons</summary><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Finding</th><th scope="col">Where it goes</th><th scope="col">Why</th></tr></thead><tbody>');
    D.findings.forEach(function (f) { h.push("<tr><td>" + rich(fill(f.text, F)) + "</td><td>" + esc(B[f.bin]) + "</td><td>" + rich(fill(f.why, F)) + "</td></tr>"); });
    h.push("</tbody></table></div></details>");
    D.charts.forEach(function (c, i) {
      h.push('<details class="lx-textalt"><summary>Chart ' + (i + 1) + ": “" + esc(fill(c.badTitle, F)) + "”</summary>");
      h.push('<p><b>' + esc(c.question) + "</b></p><ul>");
      c.options.forEach(function (o) { h.push("<li>" + esc(o.text) + " <b>" + V[o.verdict] + ".</b> " + rich(fill(o.why, F)) + "</li>"); });
      h.push("</ul><p>Fixes: " + c.fixes.map(function (f) { return esc(f.label) + (f.key ? " (the key one)" : ""); }).join("; ") + ".</p>");
      var s = spec(D, C, F, c.id, (function () { var o = {}; c.fixes.forEach(function (f) { o[f.id] = true; }); return o; })());
      if (c.id === "window") h.push("<p>The whole year in numbers: daily means from " + F.dLo + "% to " + F.dHi + "% of 2025's windiest hour, averaging " + F.dMean + "%; " + F.winStart + " to " + F.winEnd + " fell from " + F.winA + "% to " + F.winB + "%.</p>");
      else h.push('<div class="lx-scroll-x"><table class="lx-mini-table"><thead><tr>' + s.text.head.map(function (x) { return '<th scope="col">' + esc(x) + "</th>"; }).join("") + "</tr></thead><tbody>"
        + s.text.rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + esc(x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"
        + (s.text.note ? '<p class="lx-hint">' + esc(s.text.note) + "</p>" : ""));
      h.push("</details>");
    });
    h.push('<details class="lx-textalt"><summary>R6\'s result, for the briefing and the paragraph</summary>' + factsHTML(D, F) + "</details>");
    h.push('<details class="lx-textalt"><summary>Example findings, briefing and public paragraph</summary><dl class="lx-ideas">');
    D.findingsStep.fields.forEach(function (f) { h.push("<dt>" + esc(f.label) + "</dt><dd>" + rich(fill(f.example, F)) + "</dd>"); });
    var E = briefExample(D, F);
    D.briefing.fields.forEach(function (f) { h.push("<dt>Briefing · " + esc(f.label) + "</dt><dd>" + rich(E[f.id]) + "</dd>"); });
    h.push("<dt>For the public</dt><dd>" + rich(fill(D.public.example, F)) + "</dd></dl></details>");
    return h.join("\n");
  }
  var model = { MONTH: MONTH, TRUNC: TRUNC, localDays: localDays, prepare: prepare, facts: facts, fill: fill, fillDeep: fillDeep, chart: chart, keyFix: keyFix, spec: spec,
                titleOf: titleOf, chartState: chartState, findingsState: findingsState, briefState: briefState, publicState: publicState,
                findingChecks: findingChecks, briefChecks: briefChecks, publicChecks: publicChecks, briefExample: briefExample, briefText: briefText, exemplarsSpec: exemplarsSpec,
                chartsHTML: chartsHTML, boundaryHTML: boundaryHTML, factsHTML: factsHTML, staticTask: staticTask, pct: pct, mean: mean, rich: rich, plain: plain, words: words, RANGE: RANGE };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function injectCSS() {
    if (document.getElementById("r8-css")) return;
    H("style", { id: "r8-css", text: [
      ".r8-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".r8-q{margin:0;font-family:var(--lx-f-display);font-weight:500;font-size:15.5px;color:var(--lx-ink)}",
      ".r8-opts{display:grid;gap:8px}",
      ".r8-opts .lx-choice{text-align:left;justify-content:flex-start;font:inherit;font-size:15px;color:var(--lx-ink);background:var(--lx-surface)}",
      ".r8-fixes{display:flex;flex-wrap:wrap;gap:8px}",
      ".r8-fixes button{font:inherit;font-size:14px;min-height:40px;padding:6px 12px;border-radius:999px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer;display:inline-flex;align-items:center;gap:6px}",
      ".r8-fixes button[aria-pressed=\"true\"]{border-color:var(--lx-accent);background:var(--lx-accent-soft)}",
      ".r8-fixes button:focus-visible{outline:2px solid var(--lx-accent);outline-offset:2px}",
      ".r8-fixes .lx-ic{width:16px;height:16px}",
      ".r8-fixes button[aria-pressed=\"false\"] .lx-ic{opacity:.35}",
      ".r8-form{display:grid;gap:10px}",
      ".r8-form label{display:grid;gap:4px;font-family:var(--lx-f-display);font-weight:500;font-size:14px;color:var(--lx-ink)}",
      ".r8-form .lx-hint{font-family:var(--lx-f-body,inherit);font-weight:400}",
      ".r8-form textarea{font:inherit;font-size:14.5px;min-height:48px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);resize:vertical;width:100%;box-sizing:border-box}",
      ".r8-checks{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;padding:0;list-style:none;font-size:13.5px;color:var(--lx-ink-2)}",
      ".r8-checks li{display:inline-flex;align-items:center;gap:4px}.r8-checks .lx-ic{width:15px;height:15px}",
      ".r8-checks li.ok{color:var(--lx-good)}",
      ".r8-ex dd{margin:0 0 6px;padding:8px 12px;border-radius:10px;background:var(--lx-surface-2);font-size:14.5px;color:var(--lx-ink)}",
      ".r8-factbox{padding:10px 12px;border-radius:12px;border-left:4px solid var(--lx-accent);background:var(--lx-surface-2)}",
      ".r8-factbox .lx-eyebrow{margin:0 0 4px}.r8-facts{margin:0;font-size:14.5px}",
      ".r8-pre{margin:0;padding:8px 10px;border-radius:10px;background:var(--lx-surface-2);border:1px solid var(--lx-line);font-family:var(--lx-f-mono);font-size:12.5px;line-height:1.5;color:var(--lx-ink);white-space:pre-wrap;word-break:break-word}"
    ].join("\n") }, document.head);
  }
  function saw(host, kind, html) {
    host.innerHTML = "";
    H("div", { class: "lx-saw" + (kind === "good" ? "" : " no"), html: LX.icon(kind === "good" ? "check" : "question") + "<div>" + html + "</div>" }, host);
  }
  function checkList(ul, list) {
    ul.innerHTML = "";
    list.forEach(function (c) { H("li", { class: c.ok ? "ok" : "", html: LX.icon(c.ok ? "check" : "question") + "<span>" + LX.esc(c.label) + "</span>" }, ul); });
  }
  function exampleBox(act, label, pairs) {
    var row = H("div", { class: "r8-row" }, act), b = H("button", { class: "lx-btn ghost small", type: "button", text: label, "aria-expanded": "false" }, row);
    var dl = H("dl", { class: "lx-ideas r8-ex", hidden: true }, act);
    pairs.forEach(function (p) { H("dt", { text: p[0] }, dl); H("dd", { html: LX.rich(p[1]) }, dl); });
    b.addEventListener("click", function () { dl.hidden = !dl.hidden; b.setAttribute("aria-expanded", dl.hidden ? "false" : "true"); b.textContent = dl.hidden ? label : "Hide the examples"; LX.emit("layout"); });
    return row;
  }

  function view(live, data, root) {
    var D = data.r08_communicating, C = prepare(D, data.cf_targets, data.town_year), F = facts(D, C), P = data.path;
    // R6's result above the briefing and the paragraph, with a link to R6 (live or upcoming, through path.json)
    function factCard(act) {
      var r6 = LX.lessonRef(P, "R6"), box = H("div", { class: "r8-factbox" }, act);
      H("p", { class: "lx-eyebrow", html: "R6's result (" + (r6.ready ? '<a href="' + LX.esc(r6.href) + '">' + LX.esc(r6.label) + "</a>" : LX.esc(r6.label) + ", upcoming") + ", fictional study)" }, box);
      box.insertAdjacentHTML("beforeend", factsHTML(D, F));
    }
    function sortStep(act, api) {
      var key = "r8-sort", placed = LX.store.get(key, {}) || {};
      var cards = D.findings.map(function (f) { return { id: f.id, text: fill(f.text, F), bin: f.bin, why: fill(f.why, F) }; });
      var cs = LX.CardSort(act, { bins: D.bins, cards: cards, maxWhy: 9, checkLabel: "Check my sort",
        onCheck: function (g) {
          LX.store.set(key, cs.placed());
          if (g.placed < g.total) { api.saw("Place every finding first: " + (g.total - g.placed) + " still in the pool.", true); return; }
          api.done();
          api.saw("**" + g.right + " of " + g.total + "** where the course puts them. A finding that holds names its number, its scope and what it rests on; the next three steps show how charts drop those.", g.right < g.total - 3);
        } });
      cs.place(placed);
      act.addEventListener("click", function () { LX.store.set(key, cs.placed()); });
    }
    function chartStep(c) {
      return function (act, api) {
        var st = LX.store.get("r8-chart-" + c.id, null) || { pick: null, fx: {} };
        var host = H("div", null, act), plot = LX.Plot(host, { caption: true, text: "Text version of the chart", box: true });
        H("p", { class: "r8-q", text: c.question }, act);
        var opts = H("div", { class: "r8-opts", role: "group", "aria-label": c.question }, act), fb = H("div", { "aria-live": "polite" }, act);
        var fixRow = H("div", { class: "r8-fixes", role: "group", "aria-label": "Fixes to apply" }, act);
        function keep() { LX.store.set("r8-chart-" + c.id, st); }
        function draw() { plot.render(spec(D, C, F, c.id, st.fx), false); }
        function maybeDone() {
          var cs = chartState(D, F, c, st);
          if (cs.done) api.done();
          if (cs.text) api.saw(cs.text, !cs.done);
        }
        var bs = c.options.map(function (o) {
          var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": st.pick === o.id ? "true" : "false", text: o.text }, opts);
          b.addEventListener("click", function () {
            bs.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.classList.remove("right", "wrong"); });
            if (o.verdict !== "ok") b.classList.add(o.verdict === "good" ? "right" : "wrong");
            st.pick = o.id; keep();
            saw(fb, o.verdict, "<b>" + (o.verdict === "good" ? "That's it." : o.verdict === "ok" ? "Partly." : "Not it.") + "</b> " + LX.rich(fill(o.why, F)));
            maybeDone();
          });
          return b;
        });
        c.fixes.forEach(function (f) {
          var b = H("button", { type: "button", "aria-pressed": st.fx[f.id] ? "true" : "false", html: LX.icon("check") + "<span>" + LX.esc(f.label) + "</span>" }, fixRow);
          b.addEventListener("click", function () { st.fx[f.id] = !st.fx[f.id]; b.setAttribute("aria-pressed", st.fx[f.id] ? "true" : "false"); keep(); draw(); maybeDone(); });
        });
        draw();
        if (st.pick) { var o = c.options.filter(function (x) { return x.id === st.pick; })[0]; if (o) { bs[c.options.indexOf(o)].click(); } }
      };
    }
    function findingsStep(act, api) {
      var v = LX.store.get("r8-findings", {}) || {}, form = H("div", { class: "r8-form" }, act), lists = {};
      D.findingsStep.fields.forEach(function (f) {
        var lab = H("label", null, form); H("span", { text: f.label }, lab);
        var ta = H("textarea", { rows: 2, maxlength: "400" }, lab); ta.value = v[f.id] || "";
        lists[f.id] = H("ul", { class: "r8-checks", "aria-label": "Parts found" }, form);
        ta.addEventListener("input", function () { v[f.id] = ta.value; LX.store.set("r8-findings", v); paint(); });
      });
      exampleBox(act, "Compare with examples", D.findingsStep.fields.map(function (f) { return [f.label, fill(f.example, F)]; }));
      var last = null;
      function paint() {
        D.findingsStep.fields.forEach(function (f) { checkList(lists[f.id], findingChecks(v[f.id])); });
        if (!D.findingsStep.fields.every(function (f) { return words(v[f.id]) >= 8; })) return;
        var ws = findingsState(D, v), msg = ws.done ? "Every check met in all three findings. The checks see only which parts are there; whether each would survive a sceptical reader is yours to judge."
          : "Drafts entered; still open: " + ws.open.join("; ") + ".";
        if (ws.done) api.done();
        if (msg !== last) { last = msg; api.saw(msg, !ws.done); }   // spoken only when it changes, not at every key
      }
      paint();
    }
    function briefStep(act, api) {
      factCard(act);
      var v = LX.store.get("r8-brief", {}) || {}, form = H("div", { class: "r8-form" }, act), lists = {};
      D.briefing.fields.forEach(function (f) {
        var lab = H("label", null, form); H("span", { text: f.label }, lab); H("span", { class: "lx-hint", text: f.hint }, lab);
        var ta = H("textarea", { rows: 2, maxlength: "500" }, lab); ta.value = v[f.id] || "";
        lists[f.id] = H("ul", { class: "r8-checks", "aria-label": "Parts found" }, form);
        ta.addEventListener("input", function () { v[f.id] = ta.value; LX.store.set("r8-brief", v); paint(); });
      });
      var E = briefExample(D, F);
      exampleBox(act, "Compare with an example", D.briefing.fields.map(function (f) { return [f.label, E[f.id]]; }));
      var last = null;
      function paint() {
        D.briefing.fields.forEach(function (f) { checkList(lists[f.id], briefChecks(f.id, v[f.id])); });
        if (!D.briefing.fields.every(function (f) { return words(v[f.id]) >= 4; })) return;
        var ws = briefState(D, v), msg = ws.done ? "Every check met in all six parts. Read it as a council member who has ten minutes and no chart: could you vote on it without misreading it?"
          : "Draft entered; still open: " + ws.open.join("; ") + ".";
        if (ws.done) api.done();
        if (msg !== last) { last = msg; api.saw(msg, !ws.done); }
      }
      paint();
    }
    function publicStep(act, api) {
      factCard(act);
      var form = H("div", { class: "r8-form" }, act), lab = H("label", null, form);
      H("span", { text: "For the public: the town's newsletter" }, lab); H("span", { class: "lx-hint", text: "Plain words, a range, what it leaves out, at most " + D.public.limit + " words." }, lab);
      var ta = H("textarea", { rows: 6, maxlength: "1500" }, lab); ta.value = LX.store.get("r8-public", "") || "";
      var ul = H("ul", { class: "r8-checks", "aria-label": "Parts found" }, form);
      exampleBox(act, "Compare with an example", [["For the public", fill(D.public.example, F)]]);
      var pre = H("pre", { class: "r8-pre" }, act);
      var row = H("div", { class: "r8-row" }, act), cp = H("button", { class: "lx-btn small", type: "button", text: "Copy briefing and paragraph" }, row);
      var st = H("span", { class: "lx-hint", "aria-live": "polite", text: "Your text stays in this browser." }, row);
      H("a", { class: "lx-btn small ghost", href: "#exemplars", text: "Compare with two briefings" }, row);
      cp.addEventListener("click", function () { LX.copyText(pre.textContent).then(function (ok) { st.textContent = ok ? "Copied." : "Select the text and copy it."; }); });
      ta.addEventListener("input", function () { LX.store.set("r8-public", ta.value); paint(); });
      var last = null;
      function paint() {
        checkList(ul, publicChecks(D, ta.value));
        pre.textContent = briefText(D, LX.store.get("r8-brief", {}) || {}, ta.value);
        if (words(ta.value) < 30) return;
        var ws = publicState(D, ta.value), msg = ws.done ? "Every check met. Now ask someone outside the field to read it and tell you what it says. If they repeat a single number, the range did not land."
          : "Draft entered; still open: " + ws.open.join("; ") + ".";
        if (ws.done) api.done();
        if (msg !== last) { last = msg; api.saw(msg, !ws.done); }
      }
      paint();
    }
    var steps = [{ text: "A finding is only as good as its [[boundary-condition|conditions]]. Sort nine findings: holds as written, missing its conditions, or claims more than the analysis shows.", build: sortStep }];
    D.charts.forEach(function (c, i) {
      steps.push({ text: "Chart " + (i + 1) + " of 3, drawn from the course's own data. Say what misleads, then apply the fixes and watch it redraw.", build: chartStep(c) });
    });
    steps.push({ text: "Write one sentence for each redesigned chart: the number with its unit, where, when, and nothing it cannot carry.", build: findingsStep });
    steps.push({ text: "Now R6's result, for the city council, which votes on a managed-charging programme that moves most charging after 23:00. Six short parts: the decision first, the signal that would change the advice last.", build: briefStep });
    steps.push({ text: "Last, the same result for the public: one paragraph of at most 150 words, with a range and what it leaves out.", build: publicStep });
    var cards = LX.StepCards(live, { id: "r8-steps", steps: steps });
    return { cards: cards, D: D, C: C, F: F, P: P };
  }
  function explain(V) {
    var x = document.getElementById("r08-exemplars"); if (!x) return;
    x.innerHTML = "";
    LX.Exemplars(H("div", { class: "lx-xcard" }, x), exemplarsSpec(V.D, V.F));
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), { title: "Three charts, what misled and the fix", text: true,
      columns: [{ key: "name", label: "Chart", main: true }, { key: "fix", label: "The fix" }, { key: "finding", label: "A finding with its conditions" }],
      rows: V.D.chartsTable.map(function (r, i) { return { key: "c" + i, color: ["var(--lx-wind)", "var(--lx-tier-2)", "var(--lx-accent)"][i], name: r.chart, note: fill(r.misled, V.F), fix: r.fix, finding: fill(r.finding, V.F) }; }),
      caption: "Each fix puts back what the chart had dropped: the zero, the context, or the spread." });
    var B = V.D.boundary;
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: B.title, lede: B.lede, holds: B.holds, leaves: B.leaves, source: B.source });
  }
  function selfcheck(V) {
    var x = document.getElementById("r08-rubric"); if (!x) return;
    x.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, x), V.D.rubric);   // bar: the capstone's; R8 rates its practice
    LX.Checklist(H("div", { class: "lx-xcard" }, x), { id: "r8-checklist", title: "Before a result leaves your desk", columns: 2,
      lede: "Run it on your key figure, your findings and your summaries.", doneText: "Then ask someone outside the field to read them back to you.", items: V.D.checklist });
  }

  LX.mount("r08-communicating", function (live, data, root) {
    injectCSS();
    var V = view(live, data, root);
    explain(V); selfcheck(V);
    root.lxLesson = { model: model, view: V };
    // demo states: "mid" = chart 1 diagnosed and fixed; "chart2", "chart3" = those charts diagnosed and fixed; "step-N"
    LX.demo(root, function (st) {
      var m = { mid: 0, chart1: 0, chart2: 1, chart3: 2 }[st];
      if (m == null) return null;
      var c = V.D.charts[m], fx = {}; c.fixes.forEach(function (f) { fx[f.id] = true; });
      LX.store.set("r8-chart-" + c.id, { pick: c.options.filter(function (o) { return o.verdict === "good"; })[0].id, fx: fx });
      V.cards.go(m + 1);
      return { view: "chart " + (m + 1) + " fixed" };
    }, V.cards);
  });
})();
