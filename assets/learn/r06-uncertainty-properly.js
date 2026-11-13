/* r06-uncertainty-properly.js — research studio R6, "Uncertainty done properly: what to vary, how, and how to say it".
   Data: assets/learn/data/r06-uncertainty-properly.json (the fictional study, its twelve uncertainty cards, five treatment
   picks, the rewrite checks and examples, the exemplars, the comparison table, the rubric line, the checklist), town_year.json
   (SPP's 2025 hourly demand, from EIA-930: the real hourly pattern the model adds car charging to) and path.json (lesson
   links through LX.lessonRef).
   Page: learn/r06-uncertainty-properly.qmd (studio form: Task, Exemplars, Self-check, Sources).

   The fictional study: Prairie Town's peak demand in 2035 (the town's 2025 peak hour is 450 MW, lesson 0's scale).
   Model (closed form; every input illustrative except the 2025 hourly pattern):
     year k = 1 ... 10 after 2025:  c = (1 + g)^k × w        g: growth a year apart from cars; w: a weather multiplier on background demand
     added cars  n = (cars2035 − cars2025) × k / 10           a scenario (slow, central, fast); 2025's cars are in the 450
     charging energy a day  D = n × e / 1,000 MWh              e: a car's daily kWh
     form "peaks" (peaks added):  peak = c × 450 + D × max_h s_h
     form "hours" (hours added):  peak = max_h ( c × 450 × B_h + D × s_h )
       s_h: the share of a day's charging in local hour h (unmanaged or managed profile); B_h: the highest demand at local
       hour h on any day of 2025, over the year's highest hour (so max_h B_h = 1). Because s_h is the same every day, this
       equals the highest hour of the whole year with charging added: max_t (c·b_t + D·s_h(t)) = max_h (c·B_h + D·s_h).
       Hence peaks ≥ hours always (a sum of maxima is at least the maximum of a sum).
     k = 0 (2025) is the observed 450 MW.
   Sampling: 1,000 runs, seed 6, LX.mulberry32 (core.js), each run drawing g, w and e independently and uniformly (in that
   order): equal odds across each range, an assumption of the illustration that the page states wherever it samples; P10, P50,
   P90 by linear interpolation at rank (N − 1) p (K5's and M7's rule). Inputs are ranked by Spearman's rank correlation with
   the 2035 peak (no ties among continuous draws). Every number the page shows is rounded to 5 MW (the claim and the
   weak exemplar keep the study's own whole-megawatt figures), and a stated difference is the difference of the unrounded
   values, rounded: the test checks it equals the difference of the rounded values shown beside it.

   Task (step cards): sort twelve uncertainties into the four kinds, plus a pile for the utility's own choices (LX.CardSort);
   pick a treatment for one card of each pile (verdicts, as R9's dilemmas); turn the single number into a band (i-band, on
   LX.Plot): parameters sampled, then scenarios and model form, then a deep what-if line; rewrite the claim for a paper, the
   board and the public (form-only checks, then examples written as labeled sentences); write an uncertainty plan for the
   reader's own study (a row counts only with an uncertainty, a pile and the reader's own treatment; the pile's suggestion
   stays a placeholder and never enters the copied plan).
   Exemplars: a weak and a strong uncertainty paragraph (LX.Exemplars), a weak and a strong plan row, the kinds compared
   (LX.CompareTable, e-table) and "which treatment?" (LX.Flowchart, e-flowchart; its no-JS version is question-action rows). Self-check: the rubric's Uncertainty (LX.Rubric) and a checklist
   (LX.Checklist, e-checklist); the myth cards are page markup.
   Node: module.exports = the pure model; _tests/learn/test_r06-uncertainty-properly.js checks it and writes the page's no-JS
   blocks with --write. */
(function () {
  "use strict";
  var MB = (typeof window !== "undefined" && window.LX && window.LX.mulberry32) || require("./components/core.js").mulberry32;
  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var KINDS = ["parameter", "structural", "scenario", "deep", "choice"];
  var FORMS = { peaks: "Peaks added", hours: "Hours added" };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // glossary marks as the page's term spans (core.js LX.rich does the same in the browser), built from parts so the build's
  // glossary scan finds no placeholder id
  function rich(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; }); }
  function plain(t) { return String(t == null ? "" : t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"); }
  function words(t) { return plain(t).trim().split(/\s+/).filter(Boolean).length; }
  function fmt(v) { return Math.round(v).toLocaleString("en-US"); }

  // the 2025 clock (as lesson 2): town_year index i is the hour ending at start_utc + i; Central time with daylight saving
  function sundayUTC(y, m, nth) { var d = new Date(Date.UTC(y, m, 1)), c = 0; for (;;) { if (d.getUTCDay() === 0 && ++c === nth) return d.getTime(); d.setUTCDate(d.getUTCDate() + 1); } }
  var MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // B_h: the highest demand at each local hour h (hour starting h:00) on any day of the year, over the year's highest hour
  function hourMax(year) {
    var t0 = Date.parse(year.start_utc + "Z") - 3600000, Y = new Date(t0 + 12 * 3600000).getUTCFullYear();
    var on = sundayUTC(Y, 2, 2) + 8 * 3600000, off = sundayUTC(Y, 10, 1) + 7 * 3600000, B = [], top = -1, at = null;
    for (var h = 0; h < 24; h++) B.push(0);
    year.demand.forEach(function (v, i) {
      var ts = t0 + i * 3600000, L = new Date(ts + (ts >= on && ts < off ? -5 : -6) * 3600000), hh = L.getUTCHours();
      if (v > B[hh]) B[hh] = v;
      if (v > top) { top = v; at = L; }
    });
    return { B: B.map(function (v) { return v / top; }), hour: at.getUTCHours(), date: at.getUTCDate() + " " + MONTH[at.getUTCMonth()] + " " + at.getUTCFullYear() };
  }
  // the model's working object, once per page
  function prepare(D, year) {
    var m = D.model, hm = hourMax(year), sc = {};
    m.scenarios.forEach(function (s) { sc[s.id] = s; });
    var frac = function (a) { return a.map(function (x) { return x / 100; }); };
    return { m: m, B: hm.B, peakHour: hm.hour, peakDate: hm.date, sc: sc, prof: { unmanaged: frac(m.profiles.unmanaged), managed: frac(m.profiles.managed) } };
  }
  function draws(M, seed, n) {
    var r = MB(seed), m = M.m, out = [];
    for (var i = 0; i < n; i++) {
      var g = m.growth[0] + r() * (m.growth[1] - m.growth[0]), w = m.weather[0] + r() * (m.weather[1] - m.weather[0]), e = m.kwh[0] + r() * (m.kwh[1] - m.kwh[0]);
      out.push({ g: g, w: w, kwh: e });
    }
    return out;
  }
  function base(M) { return { g: M.m.growthBase, w: M.m.weatherBase, kwh: M.m.kwhBase }; }
  // MWh of charging a day in year k (cars added since 2025 only)
  function charging(M, k, d, scen) { var m = M.m; return (M.sc[scen].cars2035 - m.cars2025) * k / (m.y1 - m.y0) * d.kwh / 1000; }
  function peakAt(M, k, d, scen, form, managed) {
    var m = M.m;
    if (k === 0) return m.p0;
    var c = Math.pow(1 + d.g, k) * d.w, Dy = charging(M, k, d, scen), s = managed ? M.prof.managed : M.prof.unmanaged;
    if (form === "peaks") return c * m.p0 + Dy * Math.max.apply(null, s);
    var best = -Infinity;
    for (var h = 0; h < 24; h++) best = Math.max(best, c * m.p0 * M.B[h] + Dy * s[h]);
    return best;
  }
  // the type-7 percentile of a sorted list
  function pct(s, p) { var r = (s.length - 1) * p, lo = Math.floor(r), hi = Math.min(lo + 1, s.length - 1); return s[lo] + (s[hi] - s[lo]) * (r - lo); }
  function summary(v) { var s = v.slice().sort(function (a, b) { return a - b; }); return { p10: pct(s, 0.1), p50: pct(s, 0.5), p90: pct(s, 0.9) }; }
  var CACHE = {};
  // the sampled study for one scenario, form and charging profile: each year's P10, P50 and P90, and the 2035 runs
  function study(M, scen, form, managed, seed, n) {
    seed = seed == null ? M.m.seed : seed; n = n || M.m.runs;
    var key = [scen, form, managed ? 1 : 0, seed, n].join("|");
    if (CACHE[key] && CACHE[key].M === M) return CACHE[key];
    var ds = draws(M, seed, n), years = [], m = M.m, last = null;
    for (var k = 0; k <= m.y1 - m.y0; k++) {
      var v = ds.map(function (d) { return peakAt(M, k, d, scen, form, managed); });
      var s = summary(v); s.year = m.y0 + k; years.push(s); last = v;
    }
    var out = { M: M, years: years, runs: last, draws: ds, end: years[years.length - 1] };
    CACHE[key] = out;
    return out;
  }
  function line(M, d, scen, form, managed) { var out = []; for (var k = 0; k <= M.m.y1 - M.m.y0; k++) out.push(peakAt(M, k, d, scen, form, managed)); return out; }
  function r5(v, step) { step = step || 5; return Math.round(v / step) * step; }
  // Spearman's rank correlation of each input with the 2035 peak
  function ranks(a) { var idx = a.map(function (v, i) { return i; }).sort(function (x, y) { return a[x] - a[y]; }), r = []; idx.forEach(function (j, k) { r[j] = k + 1; }); return r; }
  function corr(x, y) {
    var n = x.length, mx = 0, my = 0, i; for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0; for (i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
    return sxy / Math.sqrt(sxx * syy);
  }
  function rho(S) {
    var ry = ranks(S.runs), out = {};
    ["g", "w", "kwh"].forEach(function (k) { out[k] = corr(ranks(S.draws.map(function (d) { return d[k]; })), ry); });
    return out;
  }
  // EVPI of a two-plan, two-future payoff table (Go deeper): expected payoffs, the best plan, perfect information
  function evpi(E) {
    var ex = function (a) { return a[0] * E.p[0] + a[1] * E.p[1]; }, ea = ex(E.a), eb = ex(E.b);
    var perfect = Math.max(E.a[0], E.b[0]) * E.p[0] + Math.max(E.a[1], E.b[1]) * E.p[1];
    return { ea: ea, eb: eb, best: Math.max(ea, eb), perfect: perfect, evpi: perfect - Math.max(ea, eb) };
  }

  // every number the text quotes, as strings, from the model (the data file's {placeholders})
  function facts(M) {
    var m = M.m, ER = function (sc, f, mg) { return study(M, sc, f, mg).end; }, F = {};
    var c = ER("central", "hours"), s = ER("slow", "hours"), f = ER("fast", "hours"), pc = ER("central", "peaks"), pf = ER("fast", "peaks");
    var fm = ER("fast", "hours", true), pfm = ER("fast", "peaks", true), b = base(M);
    var claim = peakAt(M, 10, b, "central", "peaks"), grown = m.p0 * Math.pow(1 + b.g, 10) * b.w;
    F.claim = fmt(claim);
    F.evA = fmt(claim - grown);
    [["c", c], ["s", s], ["f", f], ["pc", pc], ["pf", pf], ["fm", fm]].forEach(function (x) { F[x[0] + "10"] = fmt(r5(x[1].p10)); F[x[0] + "50"] = fmt(r5(x[1].p50)); F[x[0] + "90"] = fmt(r5(x[1].p90)); });
    F.gap = fmt(r5(pc.p50 - c.p50));
    F.mHours = fmt(r5(f.p50 - fm.p50));          // managed charging, fast uptake, hours added: lower median by
    F.mPeaks = fmt(r5(pfm.p50 - pf.p50));        // ... and peaks added: higher median by
    F.newMW = fmt(m.newLoad.mw);
    F.cNew = fmt(r5(c.p50 + m.newLoad.mw));
    var R = rho(study(M, "central", "hours"));
    F.rg = R.g.toFixed(2); F.rw = R.w.toFixed(2); F.rk = R.kwh.toFixed(2);
    F.peakHour = (M.peakHour < 10 ? "0" : "") + M.peakHour + ":00";
    F.peakDate = M.peakDate;
    F.runs = fmt(m.runs); F.seed = String(m.seed);
    F.evMax = Math.max.apply(null, m.profiles.unmanaged) + "%"; F.mgMax = Math.max.apply(null, m.profiles.managed) + "%";
    return F;
  }
  // {key} placeholders filled from facts (an unknown key throws, so a typo cannot reach the page)
  function fill(t, F) { return String(t).replace(/\{([a-zA-Z0-9]+)\}/g, function (all, k) { if (!(k in F)) throw new Error("r06: no fact " + k); return F[k]; }); }
  function fillDeep(x, F) {
    if (typeof x === "string") return fill(x, F);
    if (Array.isArray(x)) return x.map(function (y) { return fillDeep(y, F); });
    if (x && typeof x === "object") { var o = {}; Object.keys(x).forEach(function (k) { o[k] = fillDeep(x[k], F); }); return o; }
    return x;
  }
  function kindLabel(D, id) { var k = D.kinds.filter(function (x) { return x.id === id; })[0]; return k ? k.label : id; }
  function card(D, id) { return D.cards.filter(function (c) { return c.id === id; })[0]; }
  function best(t) { return t.options.filter(function (o) { return o.verdict === "good"; })[0]; }

  // the band chart's state → what it shows and what the reader is told (pure, so the test can check every state)
  //   S = { params: bool, scen: "slow" | "central" | "fast" | "all", form: "peaks" | "hours", whatif: bool }
  function bandView(M, S) {
    var F = facts(M), scens = S.scen === "all" ? ["slow", "central", "fast"] : [S.scen], b = base(M);
    var single = line(M, b, "central", "peaks");
    var bands = S.params ? scens.map(function (sc) { return { scen: sc, years: study(M, sc, S.form).years }; }) : [];
    var wsc = S.scen === "all" ? "central" : S.scen, W = study(M, wsc, S.form);
    var what = S.whatif && S.params ? W.years.map(function (y) { return y.year >= M.m.newLoad.year ? y.p50 + M.m.newLoad.mw : null; }) : null;
    return { single: single, bands: bands, what: what, whatScen: wsc, F: F };
  }
  function bandSaw(M, S) {
    var F = facts(M), m = M.m, E = function (sc, f) { return study(M, sc, f).end; }, R = function (v) { return fmt(r5(v)); };
    if (!S.params) return { text: "One line: the study's single number, **" + F.claim + " MW** in 2035. It says nothing about how sure anyone is.", bad: true };
    if (S.whatif) {
      var w = E(S.scen === "all" ? "central" : S.scen, S.form), nm = S.scen === "all" ? "central" : S.scen;
      return { text: "If the customer connects, the 2035 median (" + nm + " uptake) moves from " + R(w.p50) + " to **" + R(w.p50 + m.newLoad.mw) + " MW**, above the band's top (" + R(w.p90) + "). Kept apart, it is a case with its own signal, not a blur in the band." };
    }
    if (S.scen === "all") {
      var lo = E("slow", S.form), hi = E("fast", S.form);
      return { text: "Three storylines, three bands: from the slow P10 (" + R(lo.p10) + " MW) to the fast P90 (**" + R(hi.p90) + " MW**), " + FORMS[S.form].toLowerCase() + ". With no odds, that envelope is not an 80% range." };
    }
    var e = E(S.scen, S.form), lab = M.sc[S.scen].label.toLowerCase();
    if (S.form === "hours") {
      var p = E(S.scen, "peaks");
      // the gap is the difference of the two medians as shown (rounded), so a reader's subtraction agrees with it
      var gp = r5(p.p50) - r5(e.p50), gs = gp > 0 ? fmt(gp) + " MW higher" : "less than 5 MW higher";
      return { text: "Hours added, " + lab + ": **" + R(e.p10) + "–" + R(e.p90) + " MW**. Adding peaks assumed the cars' busiest hour falls in the town's; it reads " + gs + " at the median." };
    }
    return { text: "Peaks added, " + lab + ": P10 " + R(e.p10) + ", median " + R(e.p50) + ", P90 **" + R(e.p90) + " MW** in 2035, from " + F.runs + " runs. The single number, " + F.claim + " MW, is one point inside it." };
  }

  // the study's single number, step by step (middle inputs, central uptake, peaks added): what the page shows under the
  // claim, so a reader can rebuild it without the code
  function worked(M) {
    var m = M.m, b = base(M), k = m.y1 - m.y0, s = M.prof.unmanaged, top = Math.max.apply(null, s);
    var grown = m.p0 * Math.pow(1 + b.g, k) * b.w, day = charging(M, k, b, "central"), add = day * top;
    return { p0: m.p0, g: b.g, w: b.w, k: k, grown: grown, cars2025: m.cars2025, cars2035: M.sc.central.cars2035, cars: M.sc.central.cars2035 - m.cars2025,
      kwh: b.kwh, day: day, share: top, hour: s.indexOf(top), add: add, total: grown + add };
  }
  function workedHTML(M) {
    var W = worked(M), f1 = function (v) { return v.toFixed(1); }, hh = function (h) { return (h < 10 ? "0" : "") + h + ":00"; };
    var row = function (k, v) { return '<tr><th scope="row">' + k + "</th><td>" + v + "</td></tr>"; };
    return '<details class="lx-textalt r6-worked"><summary>How the single number is built</summary><div class="lx-scroll-x"><table class="lx-facts"><tbody>' +
      row("Demand apart from cars, " + M.m.y1, fmt(W.p0) + " MW × " + (1 + W.g).toFixed(3) + "<sup>" + W.k + "</sup> (growth " + (100 * W.g).toFixed(1) + "% a year) × " + W.w.toFixed(2) + " (middle weather) = " + f1(W.grown) + " MW") +
      row("Cars added since " + M.m.y0, fmt(W.cars2035) + " − " + fmt(W.cars2025) + " = " + fmt(W.cars) + " (central uptake; the " + fmt(W.cars2025) + " of " + M.m.y0 + " are already in the " + fmt(W.p0) + " MW)") +
      row("Their charging in a day", fmt(W.cars) + " × " + W.kwh + " kWh = " + fmt(W.day) + " MWh, in the same pattern every day") +
      row("Its busiest hour", Math.round(100 * W.share) + "% of a day's charging, " + hh(W.hour) + " to " + hh(W.hour + 1) + ": " + fmt(W.day) + " MWh × " + W.share.toFixed(2) + " = " + f1(W.add) + " MWh in one hour, " + f1(W.add) + " MW") +
      row("Peaks added", f1(W.grown) + " + " + f1(W.add) + " = " + fmt(W.total) + " MW, the study's single number") +
      '</tbody></table></div><p class="lx-hint">Middle inputs, central uptake. Adding the two peaks assumes they fall in the same hour; the model-form step tests that.</p></details>';
  }
  // the band chart's key: what P10, the median and P90 mean (shown under the chart)
  var KEY = "[[percentile|Percentiles]] of the runs: P10, about 1 run in 10 is below it; median, half below; P90, about 9 in 10 below.";
  // the sort's feedback: a count against the course's piles, read as given this exercise's assumptions
  function sortSaw(g) {
    return { text: "**" + g.right + " of " + g.total + "** where the course puts them, given this exercise's assumptions. The two choices are the utility's own: a study compares them, it never samples them. A different pile is fair if you can give the reason.", bad: g.right < g.total - 3 };
  }
  // the rewrite's form checks: which parts each version has (they see words, not quality)
  var RANGE = /\d[\d,.]*\s*(?:MW|megawatts?)?\s*(?:–|—|-|to)\s*\d/i;
  function rwChecks(D, id, t) {
    t = String(t || ""); var jar = D.rewrite.jargon.filter(function (j) { return new RegExp("\\b" + j.replace(/ /g, "\\s+") + "\\b", "i").test(t); });
    var bare = /\bwill\s+(?:be|reach|hit)\b/i.test(t) && !RANGE.test(t);
    if (id === "paper") return [
      { id: "range", label: "a range", ok: RANGE.test(t) },
      { id: "how", label: "what varied, or how many runs", ok: /(sampl|runs?\b|varied|vary|P10|P90|percentile|Monte Carlo|range[sd]? of)/i.test(t) },
      { id: "form", label: "the model choice", ok: /(hour|peaks? added|adding peaks|model form|form of the model|coinciden)/i.test(t) },
      { id: "nowill", label: "no bare “will be” one number", ok: words(t) > 0 && !bare }];
    if (id === "board") return [
      { id: "number", label: "a number from the result", ok: /\d{2,}/.test(t) },
      { id: "case", label: "the case it belongs to", ok: /(central|fast|slow|uptake|scenario|if |under )/i.test(t) },
      { id: "signal", label: "what would change it", ok: /(trigger|review|revisit|update|signal|unless|new forecast)/i.test(t) }];
    return [
      { id: "range", label: "a range", ok: RANGE.test(t) },
      { id: "plain", label: "plain words" + (jar.length ? " (try without: " + jar.join(", ") + ")" : ""), ok: !jar.length && words(t) > 0 },
      { id: "short", label: "at most 60 words (" + words(t) + ")", ok: words(t) > 0 && words(t) <= 60 }];
  }
  // an example rewrite: its labeled sentences, filled; and the same as one text (what the checks read)
  function exLines(D, id, F) { return D.rewrite.examples[id].map(function (x) { return { k: x.k, v: fill(x.v, F) }; }); }
  function exText(D, id, F) { return exLines(D, id, F).map(function (x) { return x.v; }).join(" "); }
  function exHTML(D, id, F, cls) { return '<ul class="' + (cls || "r6-exl") + '">' + exLines(D, id, F).map(function (x) { return "<li><b>" + esc(x.k) + ":</b> " + rich(x.v) + "</li>"; }).join("") + "</ul>"; }
  // the reader's plan as plain text; rows: [{u, kind, how}]. Only the reader's own words go in: an empty part reads
  // "(to write)", never the pile's suggestion, so an unfinished plan cannot pass for a finished one
  function planText(D, rows) {
    var out = ["UNCERTAINTY PLAN", "Study: (your question)"];
    (rows || []).forEach(function (r, i) {
      if (!r || !(String(r.u || "").trim() || r.kind || String(r.how || "").trim())) return;
      out.push((i + 1) + ". " + (String(r.u || "").trim() || "(uncertainty: to write)") + " | " + (r.kind ? kindLabel(D, r.kind) : "(pile: to choose)") + " | " + (String(r.how || "").trim() || "(treatment: to write)"));
    });
    return out.join("\n");
  }
  // a row counts when it has all three parts: an uncertainty, a pile and the reader's own treatment
  function planRow(r) { return !!(r && String(r.u || "").trim() && r.kind && String(r.how || "").trim()); }
  function planDone(rows) { return (rows || []).filter(planRow).length; }
  // a weak and a strong plan row (the exemplars of the plan itself)
  function planRowsHTML(D) {
    var E = D.plan.examples;
    return '<p class="lx-eyebrow">' + esc(E.title) + '</p><div class="lx-scroll-x"><table class="lx-facts r6-prows"><thead><tr><th scope="col"></th><th scope="col">Uncertainty</th><th scope="col">Pile</th><th scope="col">Treatment, and how you will say it</th><th scope="col">Why</th></tr></thead><tbody>'
      + E.rows.map(function (r) { return '<tr><th scope="row">' + esc(r.label) + "</th><td>" + esc(r.u) + "</td><td>" + esc(r.kind) + "</td><td>" + esc(r.how) + "</td><td>" + rich(r.note) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }

  function exemplarsSpec(D, F) { return fillDeep(D.exemplars, F); }
  function kindsHTML(D) {
    return '<p class="lx-eyebrow">The kinds compared</p><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Kind</th><th scope="col">What it is</th><th scope="col">In this study</th><th scope="col">Treatment</th><th scope="col">How to say it</th></tr></thead><tbody>'
      + D.kindsTable.map(function (r) { return '<tr><th scope="row">' + esc(r.kind) + "</th><td>" + rich(r.what) + "</td><td>" + rich(r.here) + "</td><td>" + rich(r.treat) + "</td><td>" + rich(r.say) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  // the no-JS version of the task: the piles with their cards and reasons, the five treatments, the band in numbers, the
  // three example rewrites
  function staticTask(D, M) {
    var F = facts(M), h = [], V = { good: "Defensible", ok: "Partly", bad: "Hard to defend" };
    h.push('<p class="lx-eyebrow">The claim</p><p class="r6-claim">“' + esc(fill(D.study.claim, F)) + "”</p>");
    h.push('<p class="lx-hint">' + esc(D.study.assume) + "</p>");
    h.push(workedHTML(M));
    h.push('<details class="lx-textalt"><summary>Twelve uncertainties behind it, sorted, with reasons</summary><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Uncertainty</th><th scope="col">Pile</th><th scope="col">Why</th></tr></thead><tbody>');
    D.cards.forEach(function (c) { h.push("<tr><td>" + esc(c.text) + "</td><td>" + esc(kindLabel(D, c.bin)) + "</td><td>" + rich(c.why) + "</td></tr>"); });
    h.push("</tbody></table></div></details>");
    h.push('<details class="lx-textalt"><summary>Five treatments, one for each pile</summary>');
    D.treatments.forEach(function (t, i) {
      var cd = card(D, t.card);
      h.push('<p class="lx-eyebrow">' + (i + 1) + " · " + esc(kindLabel(D, cd.bin)) + " · " + esc(cd.text) + "</p><ul>");
      t.options.forEach(function (o) { h.push("<li>" + esc(o.text) + " <b>" + V[o.verdict] + ".</b> " + rich(o.why) + "</li>"); });
      h.push("</ul>");
    });
    h.push("</details>");
    h.push('<details class="lx-textalt"><summary>The 2035 peak as bands, in numbers</summary><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Case</th><th scope="col">P10</th><th scope="col">Median</th><th scope="col">P90</th></tr></thead><tbody>');
    h.push("<tr><td>The study's single number (peaks added, central, middle inputs)</td><td class=\"n\" colspan=\"3\">" + F.claim + " MW</td></tr>");
    ["peaks", "hours"].forEach(function (f) { ["slow", "central", "fast"].forEach(function (sc) {
      var e = study(M, sc, f).end;
      h.push("<tr><td>" + FORMS[f] + ", " + esc(M.sc[sc].label.toLowerCase()) + "</td><td class=\"n\">" + fmt(r5(e.p10)) + "</td><td class=\"n\">" + fmt(r5(e.p50)) + "</td><td class=\"n\">" + fmt(r5(e.p90)) + "</td></tr>");
    }); });
    h.push("<tr><td>What-if: " + esc(D.model.newLoad.label.charAt(0).toLowerCase() + D.model.newLoad.label.slice(1)) + " (hours added, central)</td><td class=\"n\" colspan=\"3\">median " + F.cNew + " MW</td></tr>");
    h.push('</tbody></table></div><p class="lx-hint">MW, rounded to 5; ' + F.runs + " runs, seed " + F.seed + ", each input drawn independently with equal odds across its range; no odds across the three uptake scenarios.</p><p class=\"lx-hint\">" + rich(KEY) + "</p></details>");
    h.push('<details class="lx-textalt"><summary>The claim rewritten for three readers (examples)</summary><dl class="lx-ideas">');
    D.rewrite.fields.forEach(function (f) { h.push("<dt>" + esc(f.label) + "</dt><dd>" + exHTML(D, f.id, F) + "</dd>"); });
    h.push("</dl></details>");
    return h.join("\n");
  }
  // the "which treatment?" flowchart (e-flowchart): one question at a time, each yes ends in a treatment
  var FLOW = {
    title: "Which treatment? Four questions in order",
    lede: "Ask them of each uncertainty in your list. The first yes gives its treatment.",
    nodes: {
      s: { t: "An uncertainty", k: "end" },
      q1: { t: "Your own choice?", tN: ["Your own", "choice?"], s: "a decision or a value", sN: "decision or value", k: "q" },
      a1: { t: "Compare the options", tN: ["Compare the", "options"], s: "one result each", k: "end" },
      q2: { t: "In the model's form?", tN: ["In the model's", "form?"], k: "q" },
      a2: { t: "Run another form", tN: ["Run another", "form"], s: "report the gap", k: "end" },
      q3: { t: "Odds you can defend?", tN: ["Odds you can", "defend?"], s: "a range, and how likely its values are", sN: "range and odds", k: "q" },
      a3: { t: "Sample it with the rest", tN: ["Sample it with", "the rest"], s: "P10–P90; rank inputs", sN: "P10–P90", k: "end" },
      q4: { t: "Bounds, or a few futures?", tN: ["Bounds, or a", "few futures?"], k: "q" },
      a4: { t: "Run each case", tN: ["Run each", "case"], s: "side by side, no odds", sN: "no odds", k: "end" },
      a5: { t: "Deep: a what-if", tN: ["Deep:", "a what-if"], s: "robust plan, signposts", sN: "and signposts", k: "end" }
    },
    cols: 3, at: { s: [1, 0], q1: [1, 1], a1: [2, 1.9], q2: [1, 2.4], a2: [2, 3.3], q3: [1, 3.8], a3: [2, 4.7], q4: [1, 5.2], a4: [2, 6.1], a5: [0.2, 6.1] },
    colsN: 2, atN: { s: [0, 0], q1: [0, 1], a1: [1, 1.9], q2: [0, 2.4], a2: [1, 3.3], q3: [0, 3.8], a3: [1, 4.7], q4: [0, 5.2], a4: [1, 6.1], a5: [0, 6.6] },
    edges: [["s", "q1"], ["q1", "a1", "yes"], ["q1", "q2", "no"], ["q2", "a2", "yes"], ["q2", "q3", "no"], ["q3", "a3", "yes"], ["q3", "q4", "no"], ["q4", "a4", "yes"], ["q4", "a5", "no"]],
    traces: [
      { label: "Growth a year", path: ["s", "q1", "q2", "q3", "a3"], text: "Not a choice, not the model's form. This exercise gives it a range with equal odds across it (a real study would need data for both): sample it with the other parameters." },
      { label: "Peaks or hours", path: ["s", "q1", "q2", "a2"], text: "It is how the model is built, and these runs vary numbers only: run both forms and report the gap." },
      { label: "Car uptake", path: ["s", "q1", "q2", "q3", "q4", "a4"], text: "No odds anyone can defend, but three storylines the town accepts: run each and show them side by side." },
      { label: "A large customer", path: ["s", "q1", "q2", "q3", "q4", "a5"], text: "No odds, and no agreed size or arrival: a what-if beside the result, a plan that holds either way, and a signal to review." },
      { label: "Managed charging", path: ["s", "q1", "a1"], text: "The utility's own decision: run the study with and without it, and compare." }
    ], sel: 0 };
  // the flowchart's no-JS version: one row per question, with what a yes leads to; the last row is "none of these"
  function flowHTML() {
    var N = FLOW.nodes, rows = [], q = "q1", yes = function (n) { return FLOW.edges.filter(function (e) { return e[0] === n && e[2] === "yes"; })[0][1]; };
    var no = function (n) { return FLOW.edges.filter(function (e) { return e[0] === n && e[2] === "no"; })[0][1]; };
    var act = function (a) { return N[a].t + (N[a].s ? " (" + N[a].s + ")" : ""); };
    while (N[q] && N[q].k === "q") { rows.push([N[q].t + (N[q].s ? " (" + N[q].s + ")" : ""), act(yes(q))]); var nx = no(q); if (N[nx].k !== "q") { rows.push(["None of these", act(nx)]); break; } q = nx; }
    return '<p class="lx-eyebrow">' + esc(FLOW.title) + '</p><p class="lx-hint">' + esc(FLOW.lede) + '</p><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Ask</th><th scope="col">If yes</th></tr></thead><tbody>'
      + rows.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  var model = { KINDS: KINDS, FORMS: FORMS, hourMax: hourMax, prepare: prepare, draws: draws, base: base, charging: charging, peakAt: peakAt, pct: pct, summary: summary,
                study: study, line: line, r5: r5, rho: rho, ranks: ranks, corr: corr, evpi: evpi, facts: facts, fill: fill, fillDeep: fillDeep, kindLabel: kindLabel,
                card: card, best: best, bandView: bandView, bandSaw: bandSaw, rwChecks: rwChecks, exLines: exLines, exText: exText, exHTML: exHTML,
                planText: planText, planRow: planRow, planDone: planDone, planRowsHTML: planRowsHTML, exemplarsSpec: exemplarsSpec, kindsHTML: kindsHTML,
                staticTask: staticTask, worked: worked, workedHTML: workedHTML, FLOW: FLOW, flowHTML: flowHTML, KEY: KEY, sortSaw: sortSaw, rich: rich, plain: plain, words: words, fmt: fmt, RANGE: RANGE };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  var COL = { slow: "var(--lx-tier-2)", central: "var(--lx-accent)", fast: "var(--lx-tier-5)", single: "var(--lx-ink)", what: "var(--lx-bad)" };
  function injectCSS() {
    if (document.getElementById("r6-css")) return;
    H("style", { id: "r6-css", text: [
      ".r6-claim{margin:0;padding:10px 14px;border-radius:12px;border-left:4px solid var(--lx-accent);background:var(--lx-surface-2);font-family:var(--lx-f-display);font-weight:500;font-size:16.5px;color:var(--lx-ink)}",
      ".r6-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".r6-ctl{display:grid;gap:4px}.r6-ctl>span{font-family:var(--lx-f-display);font-weight:500;font-size:13.5px;color:var(--lx-ink-2)}",
      ".r6-opts{display:grid;gap:8px}",
      ".r6-opts .lx-choice{text-align:left;justify-content:flex-start;font:inherit;font-size:15px;color:var(--lx-ink);background:var(--lx-surface)}",
      ".r6-pill{display:inline-flex;align-items:center;min-height:26px;padding:2px 10px;border-radius:999px;border:1px solid var(--lx-line-2);font-family:var(--lx-f-display);font-weight:500;font-size:13px;color:var(--lx-ink)}",
      ".r6-form{display:grid;gap:12px}",
      ".r6-form label{display:grid;gap:4px;font-family:var(--lx-f-display);font-weight:500;font-size:14px;color:var(--lx-ink)}",
      ".r6-form .lx-hint{font-family:var(--lx-f-body,inherit);font-weight:400}",
      ".r6-form textarea,.r6-plan input,.r6-plan select{font:inherit;font-size:14.5px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);width:100%;box-sizing:border-box;min-width:0}",
      ".r6-form textarea{min-height:60px;resize:vertical}",
      ".r6-checks{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;padding:0;list-style:none;font-size:13.5px;color:var(--lx-ink-2)}",
      ".r6-checks li{display:inline-flex;align-items:center;gap:4px}.r6-checks .lx-ic{width:15px;height:15px}",
      ".r6-checks li.ok{color:var(--lx-good)}",
      ".r6-ex{margin:0;padding:8px 12px;border-radius:10px;background:var(--lx-surface-2);font-size:14.5px;color:var(--lx-ink)}",
      ".r6-exl{margin:0;padding:0;list-style:none;display:grid;gap:4px}.r6-exl b{font-family:var(--lx-f-display);font-weight:500;color:var(--lx-ink-2)}",
      ".r6-plan{display:grid;gap:10px}",
      ".r6-prow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.9fr) minmax(0,1.6fr);gap:6px 8px;align-items:end}",
      ".r6-prow label{display:grid;gap:3px;font-family:var(--lx-f-display);font-weight:500;font-size:13px;color:var(--lx-ink-2);min-width:0}",
      ".r6-pre{margin:0;padding:8px 10px;border-radius:10px;background:var(--lx-surface-2);border:1px solid var(--lx-line);font-family:var(--lx-f-mono);font-size:12.5px;line-height:1.5;color:var(--lx-ink);white-space:pre-wrap;word-break:break-word}",
      "@media (max-width:640px){.r6-prow{grid-template-columns:minmax(0,1fr)}.r6-prow{padding-bottom:8px;border-bottom:1px solid var(--lx-line)}}"
    ].join("\n") }, document.head);
  }
  function saw(host, kind, html) {
    host.innerHTML = "";
    H("div", { class: "lx-saw" + (kind === "good" ? "" : " no"), html: LX.icon(kind === "good" ? "check" : "question") + "<div>" + html + "</div>" }, host);
  }
  // a segmented control: opts [[value, label]], cur, onPick(value)
  function seg(host, label, opts, cur, onPick) {
    var w = H("div", { class: "r6-ctl" }, host); H("span", { text: label }, w);
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": label }, w);
    var bs = opts.map(function (o) {
      var b = H("button", { type: "button", "aria-pressed": o[0] === cur ? "true" : "false", text: o[1] }, g);
      b.addEventListener("click", function () { bs.forEach(function (x, i) { x.setAttribute("aria-pressed", opts[i][0] === o[0] ? "true" : "false"); }); onPick(o[0]); });
      return b;
    });
    return g;
  }

  function view(live, data, root) {
    var D = data.r06_uncertainty_properly, M = prepare(D, data.town_year), F = facts(M), P = data.path;
    var S = LX.store.get("r6-band", null) || { params: false, scen: "central", form: "peaks", whatif: false };
    function keep() { LX.store.set("r6-band", S); }

    // ---- step 1: the sort
    function sortStep(act, api) {
      H("p", { class: "r6-claim", text: "“" + fill(D.study.claim, F) + "”" }, act);
      H("p", { class: "lx-hint", text: D.study.assume }, act);
      H("div", { html: workedHTML(M) }, act);
      var key = "r6-sort", placed = LX.store.get(key, {}) || {};
      var cs = LX.CardSort(act, { bins: D.kinds, cards: D.cards, maxWhy: 12, checkLabel: "Check my sort",
        onCheck: function (g) {
          LX.store.set(key, cs.placed());
          if (g.placed < g.total) { api.saw("Place every card first: " + (g.total - g.placed) + " still in the pool.", true); return; }
          api.done();
          var sw = sortSaw(g); api.saw(sw.text, sw.bad);
        } });
      cs.place(placed);
      act.addEventListener("click", function () { LX.store.set(key, cs.placed()); });
    }
    // ---- steps 2-6: one treatment per pile
    function treatStep(t) {
      return function (act, api) {
        var cd = card(D, t.card), picks = LX.store.get("r6-treat", {}) || {};
        var head = H("div", { class: "r6-row" }, act);
        H("span", { class: "r6-pill", text: kindLabel(D, cd.bin) }, head);
        H("p", { class: "r6-claim", text: cd.text }, act);
        var opts = H("div", { class: "r6-opts", role: "group", "aria-label": "How would you treat it?" }, act), fb = H("div", { "aria-live": "polite" }, act);
        var bs = t.options.map(function (o) {
          var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: o.text }, opts);
          b.addEventListener("click", function () {
            bs.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.classList.remove("right", "wrong"); });
            if (o.verdict !== "ok") b.classList.add(o.verdict === "good" ? "right" : "wrong");
            if (!picks[t.id]) { picks[t.id] = o.id; LX.store.set("r6-treat", picks); }
            saw(fb, o.verdict, "<b>" + (o.verdict === "good" ? "Defensible." : o.verdict === "ok" ? "Partly." : "Hard to defend.") + "</b> " + LX.rich(o.why));
            api.done();
          });
          return b;
        });
      };
    }
    // ---- steps 7-9: the band (i-band)
    function bandStep(which) {
      return function (act, api) {
        if (which === "scen" && !S.params) { S.params = true; keep(); }
        if (which === "deep") { if (!S.params) S.params = true; keep(); }
        var ctl = H("div", { class: "r6-row" }, act), host = H("div", null, act);
        var plot = LX.Plot(host, { caption: true, text: "Text version of the chart", box: true });
        H("p", { class: "lx-hint", html: LX.rich(KEY) }, act);
        function draw() {
          var V = bandView(M, S), yrs = [], k, specBars = [], lines = [], legend = [], marks = [];
          for (k = M.m.y0; k <= M.m.y1; k++) yrs.push(k);
          var nb = V.bands.length, wid = nb > 1 ? 0.22 : 0.56, off = nb > 1 ? [-0.27, 0, 0.27] : [0];
          V.bands.forEach(function (bd, j) {
            bd.years.forEach(function (y) { if (y.year > M.m.y0) specBars.push({ x0: y.year + off[j] - wid / 2, x1: y.year + off[j] + wid / 2, y0: y.p10, y1: y.p90, color: COL[bd.scen], op: LX.isDark() ? 0.42 : 0.28, rx: 2 }); });
            lines.push({ pts: bd.years.map(function (y) { return [y.year + off[j], y.p50]; }), color: COL[bd.scen], width: 2, dots: true });
            legend.push({ label: M.sc[bd.scen].label + ": P10–P90 and median", color: COL[bd.scen] });
          });
          lines.push({ pts: V.single.map(function (v, i) { return [yrs[i], v]; }), color: COL.single, width: S.params ? 1.6 : 2.6, dash: S.params ? "5 4" : null, anim: !S.params });
          legend.push({ label: "The study's single number", color: COL.single, dash: S.params ? "5 4" : null });
          marks.push({ x: M.m.y1, y: V.single[V.single.length - 1], label: F.claim + " MW", kind: "dot", pos: S.params ? "above" : "above" });
          if (V.what) {
            lines.push({ pts: V.what.map(function (v, i) { return [yrs[i], v]; }), color: COL.what, width: 2, dash: "2 4" });
            legend.push({ label: "What-if: " + D.model.newLoad.label.charAt(0).toLowerCase() + D.model.newLoad.label.slice(1) + " (" + V.whatScen + ", median)", color: COL.what, dash: "2 4" });
          }
          var rows = yrs.map(function (yr, i) {
            var cells = [String(yr), fmt(V.single[i])];
            V.bands.forEach(function (bd) { var y = bd.years[i]; cells.push(i === 0 ? "450 (observed)" : fmt(r5(y.p10)) + " / " + fmt(r5(y.p50)) + " / " + fmt(r5(y.p90))); });
            if (V.what) cells.push(V.what[i] == null ? "–" : fmt(r5(V.what[i])));
            return cells;
          });
          var head = ["Year", "Single number"].concat(V.bands.map(function (bd) { return M.sc[bd.scen].short + ": P10 / median / P90"; })).concat(V.what ? ["What-if median"] : []);
          plot.render({
            caption: "Prairie Town's peak demand, MW: " + (S.params ? FORMS[S.form].toLowerCase() + ", " + F.runs + " runs (seed " + F.seed + ")" : "the study's one line") + ". Illustrative inputs on 2025's real hourly pattern.",
            x: { min: M.m.y0 - 0.6, max: M.m.y1 + 0.6, ticks: [[2025, "2025"], [2027, "2027"], [2029, "2029"], [2031, "2031"], [2033, "2033"], [2035, "2035"]], ticksN: [[2025, "2025"], [2030, "2030"], [2035, "2035"]] },
            y: { min: 400, max: 620, step: 50, fmt: function (v) { return String(v); }, unit: "MW" },
            bars: specBars, lines: lines, marks: marks, legend: legend, height: 280, heightN: 240,
            aria: "Peak demand from 2025 to 2035. " + bandSaw(M, S).text.replace(/\*\*/g, ""),
            text: { head: head, rows: rows, note: "MW. Bands rounded to 5 MW; the single number to 1 MW, as the study gave it." }
          }, false);
          var s = bandSaw(M, S); api.saw(s.text, s.bad);
        }
        if (which === "params") {
          seg(ctl, "Inputs", [[false, "Middle values only"], [true, "Vary the parameters"]], S.params, function (v) { S.params = v; keep(); draw(); if (v) api.done(); });
          if (S.params) api.done();
        } else if (which === "scen") {
          seg(ctl, "Car uptake", [["slow", "Slow"], ["central", "Central"], ["fast", "Fast"], ["all", "All three"]], S.scen, function (v) { S.scen = v; keep(); draw(); });
          seg(ctl, "Model form", [["peaks", FORMS.peaks], ["hours", FORMS.hours]], S.form, function (v) { S.form = v; keep(); draw(); if (v === "hours") api.done(); });
          if (S.form === "hours") api.done();
        } else {
          seg(ctl, "A constant 60 MW customer", [[false, "Not shown"], [true, "Show the what-if"]], S.whatif, function (v) { S.whatif = v; keep(); draw(); if (v) api.done(); });
          if (S.whatif) api.done();
        }
        draw();
      };
    }
    // ---- step 10: the rewrite
    function rewriteStep(act, api) {
      var v = LX.store.get("r6-rewrite", {}) || {}, form = H("div", { class: "r6-form" }, act), lists = {};
      H("p", { class: "r6-claim", text: "“" + fill(D.study.claim, F) + "”" }, form);
      D.rewrite.fields.forEach(function (f) {
        var lab = H("label", null, form); H("span", { text: f.label }, lab); H("span", { class: "lx-hint", text: f.hint }, lab);
        var ta = H("textarea", { rows: 3, maxlength: "900" }, lab); ta.value = v[f.id] || "";
        lists[f.id] = H("ul", { class: "r6-checks", "aria-label": "Parts found in this version" }, form);   // not live: the count line below speaks
        ta.addEventListener("input", function () { v[f.id] = ta.value; LX.store.set("r6-rewrite", v); paint(); });
      });
      var row = H("div", { class: "r6-row" }, act), cmp = H("button", { class: "lx-btn ghost small", type: "button", text: "Compare with examples", "aria-expanded": "false" }, row);
      var cnt = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
      var ex = H("dl", { class: "lx-ideas", hidden: true }, act);
      D.rewrite.fields.forEach(function (f) { H("dt", { text: f.label }, ex); H("dd", { class: "r6-ex", html: exHTML(D, f.id, F) }, ex); });
      cmp.addEventListener("click", function () { ex.hidden = !ex.hidden; cmp.setAttribute("aria-expanded", ex.hidden ? "false" : "true"); cmp.textContent = ex.hidden ? "Compare with examples" : "Hide the examples"; LX.emit("layout"); });
      var said = false;
      function paint() {
        D.rewrite.fields.forEach(function (f) {
          var ul = lists[f.id]; ul.innerHTML = "";
          rwChecks(D, f.id, v[f.id]).forEach(function (c) { H("li", { class: c.ok ? "ok" : "", html: LX.icon(c.ok ? "check" : "question") + "<span>" + LX.esc(c.label) + "</span>" }, ul); });
        });
        var n = D.rewrite.fields.filter(function (f) { return words(v[f.id]) >= 8; }).length;
        var cs = n + " of 3 versions written (8 words or more).";
        if (cnt.textContent !== cs) cnt.textContent = cs;   // announced only when the count changes, not at every key
        if (n === 3) { api.done(); if (!said) { said = true; api.saw("Three versions written. The checks see only which parts are there; compare your wording with the examples."); } }
      }
      paint();
    }
    // ---- step 11: the reader's own plan
    function planStep(act, api) {
      var rows = LX.store.get("r6-plan", null) || [];
      for (var i = rows.length; i < D.plan.rows; i++) rows.push({ u: "", kind: "", how: "" });
      var wrap = H("div", { class: "r6-plan" }, act), pre = H("pre", { class: "r6-pre" }, act);
      rows.forEach(function (r, i) {
        var pr = H("div", { class: "r6-prow" }, wrap);
        var l1 = H("label", null, pr); H("span", { text: "Uncertainty " + (i + 1) }, l1);
        var u = H("input", { type: "text", maxlength: "200" }, l1); u.value = r.u || "";
        var l2 = H("label", null, pr); H("span", { text: "Pile" }, l2);
        var sel = H("select", null, l2); H("option", { value: "", text: "Choose…" }, sel);
        D.kinds.forEach(function (k) { H("option", { value: k.id, text: k.label }, sel); }); sel.value = r.kind || "";
        var l3 = H("label", null, pr); H("span", { text: "Treatment, and how you will say it" }, l3);
        var hw = H("input", { type: "text", maxlength: "240" }, l3); hw.value = r.how || "";
        function ph() { hw.placeholder = r.kind ? "Suggestion: " + D.plan.kindHint[r.kind] : "Pick a pile for a suggestion"; }
        ph();
        u.addEventListener("input", function () { r.u = u.value; save(); });
        sel.addEventListener("change", function () { r.kind = sel.value; ph(); save(); });
        hw.addEventListener("input", function () { r.how = hw.value; save(); });
      });
      var row = H("div", { class: "r6-row" }, act), cp = H("button", { class: "lx-btn small", type: "button", text: "Copy my plan" }, row);
      var st = H("span", { class: "lx-hint", "aria-live": "polite", text: "Your plan stays in this browser." }, row);
      H("a", { class: "lx-btn small ghost", href: "#exemplars", text: "Compare with two plan rows" }, row);
      cp.addEventListener("click", function () { LX.copyText(pre.textContent).then(function (ok) { st.textContent = ok ? "Copied." : "Select the plan and copy it."; }); });
      function save() { LX.store.set("r6-plan", rows); draw(); }
      var said = false, lastN = -1;
      function draw() {
        pre.textContent = planText(D, rows); var n = planDone(rows);
        if (n !== lastN) { lastN = n; st.textContent = Math.min(n, 3) + " of 3 rows complete (uncertainty, pile and your own treatment). Your plan stays in this browser."; }   // announced only when the count changes
        if (n >= 3) { api.done(); if (!said) { said = true; api.saw("Three complete rows. Compare them with the strong row under Exemplars: a range and its source, how it is drawn, how the result will be said."); } }
      }
      draw();
    }
    var steps = [{ text: "A study reports one number. Sort the twelve uncertainties behind it into four kinds, plus a pile for the utility's own choices. Tap a card, then its pile.", build: sortStep }];
    D.treatments.forEach(function (t, i) {
      var cd = card(D, t.card);
      steps.push({ text: "Treatment " + (i + 1) + " of 5 · " + kindLabel(D, cd.bin) + ". Choose how you would handle this one, then read why.", build: treatStep(t) });
    });
    steps.push({ text: "One number hides the spread. Vary three [[parameter|parameters]] together (growth, a car's daily energy, a weather multiplier on demand), each drawn independently with equal odds across its range, in " + F.runs + " runs (seed " + F.seed + ").", build: bandStep("params") });
    steps.push({ text: "These runs vary three numbers only. Pick a car-uptake [[scenario|scenario]], then switch the [[structural-uncertainty|model form]]: peaks added, or hours added on 2025's real hourly pattern. This exercise gives neither any odds.", build: bandStep("scen") });
    steps.push({ text: "Last, a [[deep-uncertainty|deep uncertainty]]: a customer drawing a constant 60 MW that may connect from 2030, or never. Show it as a what-if line, not inside the band.", build: bandStep("deep") });
    steps.push({ text: "Rewrite the claim for three readers. The checks look only for the parts each version needs; judge the wording yourself against the examples.", build: rewriteStep });
    steps.push({ text: "Now your own study. List up to four uncertainties, put each on a pile, and write its treatment in your own words. Three complete rows finish here.", build: planStep });
    var cards = LX.StepCards(live, { id: "r6-steps", steps: steps });
    return { cards: cards, D: D, M: M, F: F, P: P, S: S };
  }
  function explain(V) {
    var x = document.getElementById("r06-exemplars"); if (!x) return;
    x.innerHTML = "";
    LX.Exemplars(H("div", { class: "lx-xcard" }, x), exemplarsSpec(V.D, V.F));
    H("div", { class: "lx-xcard", html: planRowsHTML(V.D) }, x);
    var tiers = ["var(--lx-tier-2)", "var(--lx-tier-3)", "var(--lx-tier-4)", "var(--lx-tier-5)", "var(--lx-ink-3)"];
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), { title: "The kinds of uncertainty, side by side", text: true,
      columns: [{ key: "name", label: "Kind", main: true }, { key: "here", label: "In this study" }, { key: "treat", label: "Treatment" }, { key: "say", label: "How to say it" }],
      rows: V.D.kindsTable.map(function (r, i) { return { key: "k" + i, color: tiers[i], name: r.kind, note: r.what, here: r.here, treat: r.treat, say: r.say }; }),
      caption: "The last row is set apart on purpose: a choice is compared, never sampled." });
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), FLOW);
  }
  function selfcheck(V) {
    var x = document.getElementById("r06-rubric"); if (!x) return;
    x.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, x), V.D.rubric);
    var r8 = LX.lessonRef(V.P, "R8");
    LX.Checklist(H("div", { class: "lx-xcard" }, x), { id: "r6-checklist", title: "An uncertainty check for your own study", columns: 2,
      lede: "Tick each line before a result leaves your desk.", doneText: "Next, show it so readers see its limits (" + r8.label + (r8.ready ? "" : ", upcoming") + ").", items: V.D.checklist });
  }

  LX.mount("r06-uncertainty-properly", function (live, data, root) {
    injectCSS();
    var V = view(live, data, root);
    explain(V); selfcheck(V);
    root.lxLesson = { model: model, view: V };
    // demo states: "mid" = the sort placed as the course places it and checked; "band" = step 8 with the parameters
    // varied, central uptake, hours added; "whatif" = step 9 with the what-if line; "step-N" = card N
    LX.demo(root, function (st) {
      if (st === "mid") {
        var placed = {}; V.D.cards.forEach(function (c) { placed[c.id] = c.bin; }); LX.store.set("r6-sort", placed);
        V.cards.go(0);
        setTimeout(function () { [].forEach.call(live.querySelectorAll("button"), function (b) { if (/^Check my sort$/.test(b.textContent)) b.click(); }); }, 60);
        return { view: "sort checked" };
      }
      if (st === "band" || st === "whatif") {
        LX.store.set("r6-band", { params: true, scen: "central", form: "hours", whatif: st === "whatif" });
        V.S.params = true; V.S.scen = "central"; V.S.form = "hours"; V.S.whatif = st === "whatif";
        V.cards.go(st === "band" ? 7 : 8);
        return { view: st };
      }
      return null;
    }, V.cards);
  });
})();
