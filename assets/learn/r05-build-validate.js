// r05-build-validate.js — Research studio R5, "Can you trust your analysis? Verification, validation and
// reproducibility" (studio form, Learn W2, 2026-11-03).
//
// The study under test: "How much would a 50 MW, 200 MWh battery have saved Prairie Town on Wednesday 20 August 2025?"
// One day of dispatch with a battery, as a linear program: Prairie Town's five plants (lesson 0's fleet and costs), a
// battery that charges, stores and discharges (85% round trip, counted on charging), unserved energy at $10,000/MWh
// (illustrative), the gas combined-cycle plant's 40 MW-an-hour ramp from 115 MW, and the battery ending the day with the
// 100 MWh it started with. Demand, wind and solar follow the real hourly shapes of 20 August 2025 on the Southwest Power
// Pool grid (town_year.json, EIA-930), scaled to the town exactly as in lesson 0 (town.json) and B3.
//
// Ten step cards: the study; five versions of its code, each with one planted bug (a unit error, a sign flip, a free
// lunch, a missing rule, a leaked future), each run with the real solver to see its symptom, then the check that catches
// it and the fix; a benchmark day with an answer worked out by hand, run on every version; validation against measured
// data (EIA's 82% round trip for the U.S. battery fleet in 2019); a rerun from a clean clone; and the reader's
// verification log to copy. The explain parts (flowchart, checklist, myth or fact) are on the page.
//
// buildModel(day, o) writes the LX.solver model (HiGHS, components/solver.js) for the correct study or one bug; RUNS
// names every model the page solves. The page solves them in the browser; _tests/learn/test_r05-build-validate.js
// solves the same models with the vendored HiGHS, checks every number the page states, and writes the precomputed
// results the page falls back to (data file `ref`) and the no-JS blocks of the page.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var G = ["nuc", "wind", "solar", "cc", "pk"];
  var FKEY = { nuc: "nuclear", wind: "wind", solar: "solar", cc: "cc", pk: "peaker" };

  // one local day of town_year.json, scaled as lesson 0 (grid-operator.js prepare): wind and solar = shape x farm size
  // (rounded MW), demand = shape x peak, then rounded so the gas needed each hour is a multiple of `step`
  function townDay(town, year, date, o) {
    o = o || {};
    var sc = town.scenarios.lesson0, f = town.fleet, step = o.step || sc.step, peak = o.peak || sc.demandPeakMW;
    var off = o.utcOffsetHours != null ? o.utcOffsetHours : sc.utcOffsetHours;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - off;
    var cut = function (a) { return a.slice(i, i + 24); };
    var wind = cut(year.wind).map(function (v) { return Math.round(v / 1000 * f.wind.mw); });
    var solar = cut(year.solar).map(function (v) { return Math.round(v / 1000 * f.solar.mw); });
    var raw = cut(year.demand).map(function (v) { return v / 1000 * peak; });
    var demand = raw.map(function (v, t) { return Math.round((v - f.nuclear.mw - wind[t] - solar[t]) / step) * step + f.nuclear.mw + wind[t] + solar[t]; });
    return { date: date, demand: demand, wind: wind, solar: solar };
  }
  // the benchmark: a made-up day whose answer can be worked out by hand (no wind or solar; two demand levels)
  function benchDay(B) {
    var d = [];
    for (var t = 0; t < 24; t++) d.push(t >= B.hours[0] && t <= B.hours[1] ? B.high : B.flat);
    return { date: "benchmark", demand: d, wind: d.map(function () { return 0; }), solar: d.map(function () { return 0; }) };
  }
  function days(town, year, J) {
    var S = J.study;
    return { study: townDay(town, year, S.date), forecast: townDay(town, year, S.forecastDate), lesson0: townDay(town, year, town.scenarios.lesson0.date),
      bench: benchDay(J.bench) };
  }

  // o: { battery (default true), bug: null | "unit" | "sign" | "lunch" | "missing", eta, fix: {c: [24], d: [24]} }
  //   unit     the battery's energy size typed from a spec sheet in kWh (200,000) into a model that counts MWh
  //   sign     the battery's terms in the balance with the wrong sign: charging counted as supply
  //   lunch    no end-of-day rule: the battery may end the day emptier than it started
  //   missing  no ramp rows for the gas combined-cycle plant
  // (the leaked future is not in the model: it is which day the battery's schedule is planned on; see RUNS)
  function buildModel(day, J, o) {
    o = o || {};
    var f = J.fleet, B = J.study.battery, V = J.study.V, bat = o.battery !== false, bug = o.bug || null;
    var eta = o.eta != null ? o.eta : B.eta, E = bug === "unit" ? B.E * 1000 : B.E;
    var vars = [], cons = [];
    for (var t = 0; t < 24; t++) {
      G.forEach(function (g) {
        var v = { name: "p_" + g + "_" + t, cost: f[FKEY[g]].cost };
        if (g === "nuc") { v.lb = f.nuclear.mw; v.ub = f.nuclear.mw; }
        else v.ub = g === "wind" || g === "solar" ? day[g][t] : f[FKEY[g]].mw;
        vars.push(v);
      });
      vars.push({ name: "u_" + t, cost: V });
      if (bat) {
        var vc = { name: "c_" + t, ub: B.P }, vd = { name: "d_" + t, ub: B.P };
        if (o.fix) { vc.lb = vc.ub = o.fix.c[t]; vd.lb = vd.ub = o.fix.d[t]; }
        vars.push(vc, vd, { name: "e_" + t, ub: E });
      }
    }
    for (t = 0; t < 24; t++) {
      var terms = {}; G.forEach(function (g) { terms["p_" + g + "_" + t] = 1; }); terms["u_" + t] = 1;
      if (bat) { var s = bug === "sign" ? -1 : 1; terms["d_" + t] = s; terms["c_" + t] = -s; }
      cons.push({ name: "bal_" + t, terms: terms, eq: day.demand[t] });
      if (bat) {
        var st = {}; st["e_" + t] = 1; st["c_" + t] = -eta; st["d_" + t] = 1;
        if (t > 0) st["e_" + (t - 1)] = -1;
        cons.push({ name: "soc_" + t, terms: st, eq: t > 0 ? 0 : B.E0 });
      }
      if (bug !== "missing") {
        var rt = {}; rt["p_cc_" + t] = 1;
        if (t > 0) { rt["p_cc_" + (t - 1)] = -1; cons.push({ name: "ramp_" + t, terms: rt, lb: -f.cc.ramp, ub: f.cc.ramp }); }
        else cons.push({ name: "ramp_" + t, terms: rt, lb: J.study.startCC - f.cc.ramp, ub: J.study.startCC + f.cc.ramp });
      }
    }
    if (bat && bug !== "lunch") cons.push({ name: "end", terms: { e_23: 1 }, eq: B.E0 });
    return { sense: "min", variables: vars, constraints: cons };
  }
  // rows of the model by rule (the "paper against code" check)
  function rowCount(m) {
    var n = { bal: 0, soc: 0, ramp: 0, end: 0 };
    m.constraints.forEach(function (c) { var k = c.name.split("_")[0]; if (n[k] != null) n[k]++; });
    return n;
  }

  function r2(v) { return Math.round(v * 100) / 100 + 0; }
  function r6(v) { return Math.round(v * 1e6) / 1e6 + 0; }
  // a solved model as hourly rows and the checks' measures (true costs from the true prices, battery convention: d feeds
  // the town, c draws from it)
  function summarize(day, J, r, o) {
    o = o || {};
    if (!r || !r.ok) return { ok: false, status: r ? r.status : "none" };
    var f = J.fleet, bat = o.battery !== false, x = r.values, rows = [];
    for (var t = 0; t < 24; t++) {
      var w = { t: t, d: day.demand[t], u: x["u_" + t] || 0, c: bat ? x["c_" + t] || 0 : 0, dis: bat ? x["d_" + t] || 0 : 0, e: bat ? x["e_" + t] || 0 : null };
      G.forEach(function (g) { w[g] = x["p_" + g + "_" + t] || 0; });
      rows.push(w);
    }
    var eps = 1e-6, prev = J.study.startCC, maxRamp = 0;
    rows.forEach(function (w) { maxRamp = Math.max(maxRamp, Math.abs(w.cc - prev)); prev = w.cc; });
    var sum = function (k) { return rows.reduce(function (a, w) { return a + w[k]; }, 0); };
    var S = { ok: true, cost: r6(r.objective), rows: rows, maxRamp: r6(maxRamp), pk: r6(sum("pk")), unserved: r6(sum("u")),
      charged: r6(sum("c")), discharged: r6(sum("dis")) };
    if (bat) {
      S.maxE = r6(Math.max.apply(null, rows.map(function (w) { return w.e; })));
      S.minE = r6(Math.min.apply(null, rows.map(function (w) { return w.e; })));
      S.endE = r6(rows[23].e);
      S.both = rows.filter(function (w) { return w.c > eps && w.dis > eps; }).length;
      // what each hour's balance row counted from the battery (+ feeds the town), against the physical convention
      var sgn = o.bug === "sign" ? -1 : 1;
      S.fedAsModelled = r6(rows.reduce(function (a, w) { return a + sgn * (w.dis - w.c); }, 0));
      S.storedChange = r6(rows[23].e - J.study.battery.E0);
    }
    return S;
  }
  // a summary as the data file stores it (the page's fallback when the solver cannot load), and back
  function toRef(S) {
    var o = {}; ["cost", "maxRamp", "pk", "unserved", "charged", "discharged", "maxE", "minE", "endE", "both", "fedAsModelled", "storedChange"].forEach(function (k) { if (S[k] != null) o[k] = S[k]; });
    o.h = {}; ["cc", "pk", "u", "c", "dis", "e"].forEach(function (k) { if (S.rows[0][k] != null) o.h[k] = S.rows.map(function (w) { return r6(w[k]); }); });
    return o;
  }
  function fromRef(day, R) {
    var rows = day.demand.map(function (d, t) { var w = { t: t, d: d }; Object.keys(R.h).forEach(function (k) { w[k] = R.h[k][t]; }); return w; });
    var S = { ok: true, rows: rows, fromRef: true }; Object.keys(R).forEach(function (k) { if (k !== "h") S[k] = R[k]; });
    return S;
  }

  // every model the page solves: day, options, and (for the honest run) the run whose battery schedule it follows
  var RUNS = {
    base: { day: "study", battery: false },            // the day without a battery
    ok: { day: "study" },                               // the study as it should be (planned on the day itself)
    unit: { day: "study", bug: "unit" },
    sign: { day: "study", bug: "sign" },
    lunch: { day: "study", bug: "lunch" },
    missing: { day: "study", bug: "missing" },
    missingBase: { day: "study", battery: false, bug: "missing" },
    l0base: { day: "lesson0", battery: false },
    l0ok: { day: "lesson0" },
    l0missingBase: { day: "lesson0", battery: false, bug: "missing" },
    l0missing: { day: "lesson0", bug: "missing" },
    plan: { day: "forecast" },                          // the schedule planned on the day before (persistence forecast)
    honest: { day: "study", follow: "plan" },           // 20 August run with that schedule fixed
    eta82: { day: "study", eta: 0.82 },
    benchBase: { day: "bench", battery: false },
    benchOk: { day: "bench" },
    benchUnit: { day: "bench", bug: "unit" },
    benchSign: { day: "bench", bug: "sign" },
    benchLunch: { day: "bench", bug: "lunch" },
    benchMissing: { day: "bench", bug: "missing" },
    benchMissingBase: { day: "bench", battery: false, bug: "missing" }
  };
  function runModel(key, D, J, sol) {
    var R = RUNS[key], o = { battery: R.battery, bug: R.bug, eta: R.eta };
    if (R.follow) { var P = sol[R.follow]; o.fix = { c: P.rows.map(function (w) { return w.c; }), d: P.rows.map(function (w) { return w.dis; }) }; }
    return buildModel(D[R.day], J, o);
  }
  // the order runs need (a followed schedule first)
  var ORDER = Object.keys(RUNS).sort(function (a, b) { return (RUNS[a].follow ? 1 : 0) - (RUNS[b].follow ? 1 : 0); });

  // the numbers the page states, from the solved runs. A saving is the version's own day without a battery minus the
  // same version with it, as that version's code would report it.
  function numbers(J, sol) {
    var s = sol, sv = function (b, w) { return r2(s[b].cost - s[w].cost); }, B = J.study.battery, x = {};
    x.base = r2(s.base.cost);
    x.ok = sv("base", "ok"); x.unit = sv("base", "unit"); x.sign = sv("base", "sign"); x.lunch = sv("base", "lunch");
    x.missing = sv("missingBase", "missing"); x.honest = sv("base", "honest"); x.eta82 = sv("base", "eta82");
    x.unitMaxE = r2(s.unit.maxE); x.okMaxE = r2(s.ok.maxE); x.signBoth = s.sign.both; x.signFed = r2(s.sign.fedAsModelled);
    x.lunchEnd = r2(s.lunch.endE); x.lunchGain = r2(x.lunch - x.ok); x.missingRamp = r2(s.missing.maxRamp);
    x.l0base = r2(s.l0base.cost); x.l0missingBase = r2(s.l0missingBase.cost);
    x.l0ok = sv("l0base", "l0ok"); x.l0missing = sv("l0missingBase", "l0missing");
    x.honestShare = Math.round(x.honest / x.ok * 100);
    x.eta82Change = Math.round((x.ok - x.eta82) / x.ok * 100);
    x.okYear = x.ok * 365;
    x.benchOk = sv("benchBase", "benchOk"); x.benchUnit = sv("benchBase", "benchUnit"); x.benchSign = sv("benchBase", "benchSign");
    x.benchLunch = sv("benchBase", "benchLunch"); x.benchMissing = sv("benchMissingBase", "benchMissing");
    x.benchHand = r2(B.E * (J.fleet.peaker.cost - J.fleet.cc.cost / B.eta));
    var zero = { demand: [], wind: [], solar: [] };
    for (var t = 0; t < 24; t++) { zero.demand.push(0); zero.wind.push(0); zero.solar.push(0); }
    var R = rowCount(buildModel(zero, J, {})), Rm = rowCount(buildModel(zero, J, { bug: "missing" }));
    x.rampRows = R.ramp; x.rampRowsMissing = Rm.ramp;
    return x;
  }
  // money with cents only when there are cents: $8,205.88, $12,150
  function money(v) {
    var c = Math.round(Math.abs(v) * 100), whole = c % 100 === 0;
    var t = (whole ? Math.round(c / 100) : c / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
    return (v < 0 ? "−$" : "$") + t;
  }
  function num(v) { return (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
  // the page's strings for each number
  var MONEY = ["base", "ok", "unit", "sign", "lunch", "missing", "honest", "eta82", "lunchGain", "l0base", "l0missingBase", "l0ok", "l0missing",
    "benchOk", "benchUnit", "benchSign", "benchLunch", "benchMissing", "benchHand"];
  function vals(J, x) {
    var v = {};
    Object.keys(x).forEach(function (k) { v[k] = MONEY.indexOf(k) >= 0 ? money(x[k]) : num(x[k]); });
    v.okYear = "$" + (x.okYear / 1e6).toFixed(1) + " million";
    v.lesson0Label = J.study.lesson0Label;
    return v;
  }
  function fill(t, v) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return v[k] == null ? m : String(v[k]); }); }
  // the exemplars with their numbers filled in
  function exemplars(J, v) {
    var E = J.exemplars, fp = function (p) { return typeof p === "string" ? fill(p, v) : { text: fill(p.text, v), note: fill(p.note, v) }; };
    return { title: E.title, task: E.task, note: E.note, diff: E.diff,
      answers: E.answers.map(function (a) { return { key: a.key, label: a.label, level: a.level, parts: a.parts.map(fp) }; }) };
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function bold(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  // the study for readers without JavaScript: the rules, the five versions with their symptoms, check and fix, the
  // benchmark table, validation and the rerun (written into the page by the test's --write mode)
  function staticStudy(J, v) {
    var C = {}; J.checks.forEach(function (c) { C[c.id] = c.label; });
    var h = ['<p class="lx-eyebrow">The study, its five buggy versions and the checks that catch them</p>',
      "<p><b>" + esc(J.study.question) + "</b> One day of dispatch as a linear program; " + esc(J.study.battery.label) + " battery, 85% round trip; data: " + esc(J.study.dateLabel) + ".</p>",
      '<ul class="r5-static-rules">' + J.rules.map(function (r) { return "<li><b>" + esc(r.name) + ":</b> " + esc(r.words) + " <span class=\"lx-hint\">(" + esc(r.rows) + ")</span></li>"; }).join("") + "</ul>",
      '<ol class="r5-static">'];
    J.bugs.forEach(function (b) {
      h.push("<li><p><b>Version " + b.n + ": " + esc(b.kind) + ".</b> " + b.symptoms.map(function (s) { return esc(fill(s[0], v)) + ": <b>" + esc(fill(s[1], v)) + "</b>"; }).join(". ") + ".</p>"
        + "<p>Caught by: <b>" + esc(C[b.check]) + "</b>. " + esc(fill(b.right, v).replace(/^Right\.\s*/, "")) + "</p>"
        + '<p class="r5-static-code"><code>' + esc(b.line.before) + "</code> → <code>" + esc(b.line.after).replace(/\n/g, "<br>") + "</code></p>"
        + "<p>" + bold(fill(b.fixed, v)) + "</p></li>");
    });
    h.push("</ol>");
    h.push("<p><b>Benchmark</b> (" + esc(J.bench.label) + "): by hand, 200 MWh × ($100 − $40 ÷ 0.85) = " + v.benchHand + ".</p>");
    h.push('<div class="lx-scroll-x"><table class="lx-facts r5-bench"><thead><tr><th scope="col">Version</th><th scope="col">Saving on the benchmark</th><th scope="col">Matches the hand answer?</th></tr></thead><tbody>'
      + J.benchVersions.map(function (b) { var k = "bench" + b.id.charAt(0).toUpperCase() + b.id.slice(1); return "<tr><td>" + esc(b.label) + '</td><td class="n">' + v[k] + "</td><td>" + (v[k] === v.benchHand ? "yes" : "no") + "</td></tr>"; }).join("")
      + "</tbody></table></div>");
    h.push("<p><b>Validation:</b> with the U.S. fleet's measured 82% round trip (EIA, 2019 data) instead of 85%, the perfect-foresight saving is " + v.eta82 + " instead of " + v.ok + ".</p>");
    h.push("<p><b>Rerun from a clean clone:</b> it failed on a data file read from one laptop's desktop; a download script with a checksum, relative paths, a pinned environment and a tag fix it.</p>");
    return h.join("\n");
  }

  var model = { G: G, townDay: townDay, benchDay: benchDay, days: days, buildModel: buildModel, rowCount: rowCount, summarize: summarize,
    toRef: toRef, fromRef: fromRef, RUNS: RUNS, ORDER: ORDER, runModel: runModel, numbers: numbers, money: money, vals: vals, fill: fill,
    exemplars: exemplars, staticStudy: staticStudy };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  var HOURS_X = { min: 0, max: 24, ticks: [[0, "00:00", "start"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00", "end"]],
    ticksN: [[0, "00:00", "start"], [12, "12:00"], [24, "24:00", "end"]] };
  function hh(t) { return (t < 10 ? "0" : "") + t + ":00"; }

  function view(live, data, root) {
    var J = data.r05_build_validate, town = data.town, year = data.town_year;
    J.fleet = town.fleet;
    var D = days(town, year, J), B = J.study.battery;
    // the precomputed results (data file `ref`, re-solved by the Node test): texts outside the step cards use them;
    // the cards show the browser's own solves
    var refSol = {}; Object.keys(RUNS).forEach(function (k) { refSol[k] = fromRef(D[RUNS[k].day], J.ref[k]); });
    var v0 = vals(J, numbers(J, refSol)), C = {}; J.checks.forEach(function (c) { C[c.id] = c; });
    var sol = {}, res = {}, x = null, v = null, fellBack = false, allP = null;
    function solveOne(key) {
      if (sol[key]) return Promise.resolve(sol[key]);
      var R = RUNS[key];
      var pre = R.follow ? solveOne(R.follow) : Promise.resolve();
      return pre.then(function () {
        return LX.solver.solve(runModel(key, D, J, sol), { timeLimit: 5, key: "r5-" + key }).then(function (r) {
          var S = summarize(D[R.day], J, r, { battery: R.battery, bug: R.bug });
          if (!S.ok) { S = refSol[key]; fellBack = true; }
          sol[key] = S; res[key] = r; return S;
        });
      });
    }
    // every run (about twenty small linear programs, a few milliseconds each), once
    function solveAll() {
      if (!allP) allP = ORDER.reduce(function (p, k) { return p.then(function () { return solveOne(k); }); }, Promise.resolve())
        .then(function () { x = numbers(J, sol); v = vals(J, x); return v; });
      return allP;
    }
    var picks = {};   // the reader's first pick of a check for each version, and validation and rerun answers

    // ---- the task, as a card above the steps
    var task = H("div", { class: "lx-card r5-task" }, live);
    H("p", { class: "lx-eyebrow", text: "The task" }, task);
    var ol = H("ol", { class: "lx-studio-task" }, task);
    J.task.forEach(function (t) { H("li", { html: "<b>" + LX.esc(t[0]) + ":</b> " + LX.rich(t[1]) }, ol); });
    H("p", { class: "lx-hint", text: J.taskTime }, task);

    // ---- a chart card for one run (stored energy, charge and discharge, the gas plant, or two schedules)
    function chartCard(host) {
      var c = LX.PlotCard(host, { text: "Text version of the chart", cls: "r5-plot" });
      return c;
    }
    function socPts(S) { return [[0, B.E0]].concat(S.rows.map(function (w, t) { return [t + 1, w.e]; })); }
    function draw(card, kind, A, Bfix, label) {
      var spec = { x: HOURS_X, y: { min: 0, max: 300, step: 100, fmt: function (q) { return String(q); }, unit: "MWh" }, lines: [], refs: [], legend: [], aria: label, height: 220, heightN: 190 };
      var head = ["Hour"], rows = [];
      if (kind === "soc" || kind === "plan") {
        var top = Math.max(B.E, A.maxE || 0, Bfix ? Bfix.maxE || 0 : 0);
        spec.y.max = top > 250 ? Math.ceil(top / 100) * 100 : 250; spec.y.step = 50;
        spec.refs.push({ y: B.E, label: "Battery size, 200 MWh", labelN: "200 MWh", dash: "5 4" });
        spec.lines.push({ pts: socPts(A), color: kind === "plan" ? "var(--lx-bat)" : "var(--lx-bad)", width: 2.6, dots: false });
        spec.legend.push({ label: kind === "plan" ? "Planned on 20 August itself (perfect foresight)" : "This version", color: kind === "plan" ? "var(--lx-bat)" : "var(--lx-bad)" });
        if (Bfix) { spec.lines.push({ pts: socPts(Bfix), color: "var(--lx-good)", width: 2.4, dash: "6 4" }); spec.legend.push({ label: kind === "plan" ? "Planned on 19 August, then followed" : "Fixed", color: "var(--lx-good)", dash: true }); }
        head.push(kind === "plan" ? "Perfect foresight (MWh)" : "This version (MWh)"); if (Bfix) head.push(kind === "plan" ? "Planned the day before (MWh)" : "Fixed (MWh)");
        A.rows.forEach(function (w, t) { var r = [hh(t + 1), num(w.e)]; if (Bfix) r.push(num(Bfix.rows[t].e)); rows.push(r); });
        spec.text = { head: head.map(function (h0, i) { return i ? h0 : "Hour ending"; }), rows: rows, note: "Stored energy at the end of each hour; the day starts with " + B.E0 + " MWh." };
      } else if (kind === "cd") {
        var S = Bfix || A;
        spec.y = { min: 0, max: 60, step: 20, fmt: function (q) { return String(q); }, unit: "MW" };
        spec.lines.push({ values: S.rows.map(function (w) { return w.c; }), x0: 0, step: 1, color: "var(--lx-accent)", width: 2.4 });
        spec.lines.push({ values: S.rows.map(function (w) { return w.dis; }), x0: 0, step: 1, color: "var(--lx-bat)", width: 2.4, dash: "6 4", offset: 2 });
        spec.legend = [{ label: "Charging", color: "var(--lx-accent)" }, { label: "Discharging", color: "var(--lx-bat)", dash: true }];
        spec.spans = S.rows.map(function (w, t) { return w.c > 1e-6 && w.dis > 1e-6 ? { x0: t, x1: t + 1, color: "var(--lx-bad)", op: 0.12 } : null; }).filter(Boolean);
        if (spec.spans.length) spec.legend.push({ label: "Both at once (shaded)", color: "var(--lx-bad)" });
        spec.text = { head: ["Hour", "Charging (MW)", "Discharging (MW)"], rows: S.rows.map(function (w, t) { return [hh(t), num(w.c), num(w.dis)]; }) };
      } else if (kind === "cc") {
        spec.y = { min: 0, max: 160, step: 40, fmt: function (q) { return String(q); }, unit: "MW" };
        spec.lines.push({ values: A.rows.map(function (w) { return w.cc; }), x0: 0, step: 1, color: "var(--lx-cc)", width: 2.6 });
        spec.legend = [{ label: label.indexOf("3 September") >= 0 ? "Gas combined-cycle plant, 3 September, no ramp rows" : "Gas combined-cycle plant, this version", color: "var(--lx-cc)" }];
        if (Bfix) { spec.lines.push({ values: Bfix.rows.map(function (w) { return w.cc; }), x0: 0, step: 1, color: "var(--lx-good)", width: 2.2, dash: "6 4", offset: 2 }); spec.legend.push({ label: "With the ramp rows", color: "var(--lx-good)", dash: true }); }
        var prev = J.study.startCC; spec.marks = [];
        A.rows.forEach(function (w, t) { if (Math.abs(w.cc - prev) > J.fleet.cc.ramp + 1e-6) spec.marks.push({ x: t + 0.5, y: w.cc, kind: "dot", label: (w.cc > prev ? "+" : "−") + num(Math.abs(w.cc - prev)), color: "var(--lx-bad)", pos: w.cc > prev ? "above" : "below" }); prev = w.cc; });
        spec.text = { head: ["Hour", "Gas plant, this run (MW)"].concat(Bfix ? ["With the ramp rows (MW)"] : []), rows: A.rows.map(function (w, t) { return [hh(t), num(w.cc)].concat(Bfix ? [num(Bfix.rows[t].cc)] : []); }) };
      }
      card.plot.render(spec, true);
    }

    function checkButtons(host, ask, onPick) {
      H("p", { class: "r5-ask", text: ask }, host);
      var g = H("div", { class: "r5-checks", role: "group", "aria-label": ask }, host), bs = {};
      J.checks.forEach(function (c) {
        bs[c.id] = H("button", { type: "button", class: "lx-choice small", "aria-pressed": "false", html: "<span><b>" + LX.esc(c.label) + "</b><small>" + LX.esc(c.text) + "</small></span>",
          onclick: function () { onPick(c.id, bs); } }, g);
      });
      return bs;
    }
    function codeDiff(host, line) {
      var d = H("div", { class: "r5-diff", role: "group", "aria-label": "The line, before and after the fix" }, host);
      H("p", { class: "r5-diff-k", text: "In the code" }, d);
      H("pre", { class: "r5-del" }, d).appendChild(document.createTextNode("− " + line.before));
      H("pre", { class: "r5-add" }, d).appendChild(document.createTextNode("+ " + line.after.replace(/\n/g, "\n+ ")));
      return d;
    }

    // ---- one buggy version: run it, read the symptom, pick the check, see the line, fix and run again
    function bugStep(b) {
      return {
        text: "Version " + b.n + " of the study has " + b.kind + ". Run it and read the result. Then pick the check that catches the bug first.",
        build: function (act, api) {
          var row = H("div", { class: "r5-run" }, act);
          var go = H("button", { type: "button", class: "lx-btn small", html: "Run version " + b.n + LX.icon("arrow") }, row);
          var st = LX.SolverStatus(row), card = chartCard(act); card.title.textContent = "Version " + b.n + " · " + J.study.short;
          var stage = H("div", { class: "r5-stage", hidden: true }, act), fb = H("div", { "aria-live": "polite" }, act), after = H("div", { class: "r5-after", hidden: true }, act);
          var tries = 0;
          function chips(list) { card.clear(); list.forEach(function (s, i) { card.chip(fill(s[0], v), fill(s[1], v), i ? null : "bad"); }); }
          go.addEventListener("click", function () {
            go.disabled = true; st.set("solving"); api.busy(true);
            solveAll().then(function () {
              api.busy(false); st.set(fellBack ? "" : res[b.run]); if (fellBack) st.el.textContent = "The solver could not load: these are the precomputed results.";
              var S = sol[b.run];
              chips(b.symptoms);
              draw(card, b.chart === "plan" ? "plan" : b.chart, S, null, "Version " + b.n + ", " + J.study.dateLabel);
              stage.hidden = false; go.hidden = true;
            });
          });
          var bs = checkButtons(stage, "Which check catches this bug first?", function (id, all) {
            tries++;
            var also = (b.also || []).indexOf(id) >= 0, right = id === b.check || also;
            if (!picks[b.id]) picks[b.id] = { first: id, right: right };
            Object.keys(all).forEach(function (k) { all[k].setAttribute("aria-pressed", k === id ? "true" : "false"); all[k].classList.toggle("right", right && k === id); all[k].classList.toggle("wrong", !right && k === id); });
            fb.innerHTML = "";
            H("div", { class: "lx-saw" + (right ? "" : " no"), html: LX.icon(right ? "check" : "question") + "<div>" + LX.rich(fill(id === b.check ? b.right : also ? b.alsoText : b.wrong, v)) + "</div>" }, fb);
            if (right || tries >= 2) showFix();
          });
          function showFix() {
            if (!after.hidden) return;
            after.hidden = false;
            codeDiff(after, b.line);
            var fx = H("button", { type: "button", class: "lx-btn small", html: (b.id === "missing" ? "Run both versions on 3 September" : b.id === "leak" ? "Plan on 19 August, then run 20 August" : "Fix it and run again") + LX.icon("arrow") }, after);
            fx.addEventListener("click", function () {
              fx.disabled = true;
              var S = sol[b.run];
              if (b.id === "missing") { draw(card, "cc", sol.l0missingBase, sol.l0base, "The gas plant on 3 September, without and with the ramp rows"); card.title.textContent = "Version 4 · 3 September 2025"; }
              else if (b.id === "leak") draw(card, "plan", sol.ok, sol.honest, "Stored energy: planned on 20 August itself, and planned on 19 August then followed");
              else draw(card, b.chart, S, sol.ok, "Version " + b.n + " and the fixed study, " + J.study.dateLabel);
              card.clear();
              if (b.id === "missing") { card.chip("Day without a battery", v.l0missingBase + " (should be " + v.l0base + ")", "bad"); card.chip("Battery saves", v.l0missing + " (should be " + v.l0ok + ")", "bad"); }
              else if (b.id === "leak") { card.chip("Perfect foresight", v.ok, "warn"); card.chip("Planned the day before", v.honest, "good"); }
              else { card.chip("Fixed: saving", v.ok, "good"); card.chip("Most energy stored", v.okMaxE + " MWh", "good"); }
              api.saw(fill(b.fixed, v)); api.done();
            });
          }
        }
      };
    }

    var steps = [
      { free: true, text: "The claim to check: " + J.study.question + " The study is one day of dispatch as a [[linear-program|linear program]], with these five rules.",
        build: function (act) {
          var t = H("div", { class: "lx-scroll-x" }, act), tb = H("table", { class: "lx-facts r5-rules" }, t), hr = H("tr", null, H("thead", null, tb));
          ["Rule", "In words", "In the code"].forEach(function (h0) { H("th", { scope: "col", text: h0 }, hr); });
          var bd = H("tbody", null, tb);
          J.rules.forEach(function (r) { var tr = H("tr", null, bd); H("th", { scope: "row", text: r.name }, tr); H("td", { html: LX.rich(r.words) }, tr); H("td", { text: r.rows }, tr); });
          var q = H("ul", { class: "r5-three" }, act);
          J.three.forEach(function (x) { H("li", { html: "<b>" + LX.rich(x[0]) + "</b> " + LX.rich(x[1]) }, q); });
          H("p", { class: "lx-hint", text: J.study.dataNote }, act);
        } }
    ].concat(J.bugs.map(bugStep)).concat([
      { text: "A [[benchmark|benchmark]] is a case with a known answer. On a made-up day, the battery should save 200 MWh × ($100 − $40 ÷ 0.85) = " + v0.benchHand + " by hand. Run every version on it.",
        build: function (act, api) {
          H("p", { class: "lx-hint", text: "The day: " + J.bench.label + ". The battery fills to 200 MWh before noon, empties into the five dear hours, and refills afterwards." }, act);
          var row = H("div", { class: "r5-run" }, act), go = H("button", { type: "button", class: "lx-btn small", html: "Run all five versions on the benchmark" + LX.icon("arrow") }, row), st = LX.SolverStatus(row);
          var out = H("div", { class: "lx-scroll-x" }, act);
          go.addEventListener("click", function () {
            go.disabled = true; st.set("solving"); api.busy(true);
            solveAll().then(function () {
              api.busy(false); st.set(res.benchOk);
              var tb = H("table", { class: "lx-facts r5-bench" }, out), hr = H("tr", null, H("thead", null, tb));
              ["Version", "Saving on the benchmark", "Matches the hand answer?"].forEach(function (h0) { H("th", { scope: "col", text: h0 }, hr); });
              var bd = H("tbody", null, tb);
              J.benchVersions.forEach(function (bv) {
                var val = r2(sol[bv.base].cost - sol[bv.run].cost), okk = Math.abs(val - x.benchHand) < 0.005, tr = H("tr", { class: okk ? "ok" : "no" }, bd);
                H("td", { text: bv.label }, tr); H("td", { class: "n", text: money(val) }, tr); H("td", { html: LX.icon(okk ? "check" : "question") + (okk ? " yes" : " no") }, tr);
              });
              api.saw(fill(J.benchSaw, v)); api.done();
            });
          });
        } },
      { text: "[[verification|Verification]] asked whether the code solves its equations. [[validation|Validation]] asks whether the equations describe the real system well enough for the claim. Which of these is validation?",
        build: function (act, api) {
          var g = H("div", { class: "r5-checks", role: "group", "aria-label": "Which is validation?" }, act), fb = H("div", { "aria-live": "polite" }, act), more = H("div", { hidden: true }, act), bs = {};
          var V = J.validation;
          V.options.forEach(function (o2) {
            bs[o2[0]] = H("button", { type: "button", class: "lx-choice small", "aria-pressed": "false", text: o2[1], onclick: function () {
              var right = o2[0] === V.answer; if (!picks.validation) picks.validation = { first: o2[0], right: right };
              Object.keys(bs).forEach(function (k) { bs[k].setAttribute("aria-pressed", k === o2[0] ? "true" : "false"); bs[k].classList.toggle("right", right && k === o2[0]); bs[k].classList.toggle("wrong", !right && k === o2[0]); });
              fb.innerHTML = ""; H("div", { class: "lx-saw" + (right ? "" : " no"), html: LX.icon(right ? "check" : "question") + "<div>" + LX.rich(V.why[o2[0]]) + "</div>" }, fb);
              more.hidden = false;
            } }, g);
          });
          H("p", { html: LX.rich(J.validationText) }, more);
          var row = H("div", { class: "r5-run" }, more), go = H("button", { type: "button", class: "lx-btn small", html: "Run with the measured 82%" + LX.icon("arrow") }, row), st = LX.SolverStatus(row);
          var chipsBox = H("div", { class: "lx-readouts", "aria-live": "polite" }, more);
          go.addEventListener("click", function () {
            go.disabled = true; st.set("solving"); api.busy(true);
            solveAll().then(function () {
              api.busy(false); st.set(res.eta82);
              [["85% round trip (the study)", v.ok], ["82% (U.S. fleet, measured, 2019)", v.eta82]].forEach(function (c2) { var r = H("div", { class: "lx-readout" }, chipsBox); H("span", { class: "k", text: c2[0] }, r); H("b", { text: c2[1] }, r); });
              api.saw(fill(J.validationSaw, v)); api.done();
            });
          });
        } },
      { text: "Can someone else rerun it? A colleague makes a fresh [[clone|clone]] of the study's [[repository|repository]] and runs it. What makes the rerun fail?",
        build: function (act, api) {
          var R = J.repro, pre = H("pre", { class: "r5-log", "aria-label": "The colleague's terminal" }, act);
          pre.appendChild(document.createTextNode(R.log.join("\n")));
          var g = H("div", { class: "r5-checks", role: "group", "aria-label": "What makes the rerun fail?" }, act), fb = H("div", { "aria-live": "polite" }, act), more = H("div", { hidden: true }, act), bs = {};
          R.options.forEach(function (o2) {
            bs[o2[0]] = H("button", { type: "button", class: "lx-choice small", "aria-pressed": "false", text: o2[1], onclick: function () {
              var right = o2[0] === R.answer; if (!picks.repro) picks.repro = { first: o2[0], right: right };
              Object.keys(bs).forEach(function (k) { bs[k].setAttribute("aria-pressed", k === o2[0] ? "true" : "false"); bs[k].classList.toggle("right", right && k === o2[0]); bs[k].classList.toggle("wrong", !right && k === o2[0]); });
              fb.innerHTML = ""; H("div", { class: "lx-saw" + (right ? "" : " no"), html: LX.icon(right ? "check" : "question") + "<div>" + LX.rich(R.why[o2[0]]) + "</div>" }, fb);
              more.hidden = false;
            } }, g);
          });
          H("p", { class: "r5-ask", text: "The fixes, before anyone else tries:" }, more);
          var ul = H("ul", { class: "r5-fixes" }, more); R.fixes.forEach(function (f2) { H("li", { html: LX.rich(f2).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }, ul); });
          var row = H("div", { class: "r5-run" }, more), go = H("button", { type: "button", class: "lx-btn small", html: "Rerun from a fresh clone" + LX.icon("arrow") }, row), st = LX.SolverStatus(row);
          go.addEventListener("click", function () {
            go.disabled = true; st.set("solving"); api.busy(true);
            solveAll().then(function () { api.busy(false); st.set(res.ok); api.saw(fill(J.reproSaw, v)); api.done(); });
          });
        } },
      { free: true, text: "Your verification log, from your answers on this page. Copy it as the start of the log for your own study, and add what each check found there.",
        build: function (act) {
          var id = LX.uid("r5"), lab = H("label", { for: id, class: "lx-sr", text: "Your verification log as text" }, act);
          var ta = H("textarea", { id: id, class: "r5-logtext", readonly: "readonly", rows: "14" }, act);
          var row = H("div", { class: "r5-run" }, act), msg = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          function text() { return logText(J, v || v0, picks, C); }
          ta.value = text();
          H("button", { type: "button", class: "lx-btn small", html: LX.icon("check") + "Copy my log", onclick: function () {
            ta.value = text();
            LX.copyText(ta.value, { select: ta }).then(function (okk) { msg.textContent = okk ? "Copied." : "Select the text and copy it."; });
          } }, row);
        } }
    ]);
    var cards = LX.StepCards(H("div", null, live), { steps: steps });
    explain(J, v0);
    return { cards: cards, solveAll: solveAll, picks: picks };
  }

  // the reader's log as plain text
  function logText(J, v, picks, C) {
    var L = ["Verification log · " + J.study.question, "Data: " + J.study.dateLabel + " (SPP shapes, EIA-930, scaled to Prairie Town); model: one-day dispatch LP with a " + J.study.battery.label + " battery.", ""];
    L.push("Checks run, and what each caught on this page:");
    J.bugs.forEach(function (b) {
      var p = picks[b.id];
      L.push("- " + C[b.check].label + ": caught version " + b.n + " (" + b.kind + ")" + (p ? (p.right ? "; my first pick was right" : "; my first pick was " + C[p.first].label) : "; not tried yet") + ".");
    });
    L.push("Benchmark: " + J.bench.label + "; hand answer " + v.benchHand + ", fixed model " + v.benchOk + ". Version 4 (missing rule) also passes it.");
    L.push("Validation: round trip 85% (study) against 82% measured for the U.S. fleet in 2019 (EIA): saving " + v.ok + " against " + v.eta82 + ".");
    L.push("Result: " + v.honest + " with a plan made the day before; " + v.ok + " with perfect foresight (an upper bound).");
    L.push("Rerun: a fresh clone failed on a data file outside the repository; fixed with a download script and checksum, relative paths, a pinned environment and a tag.");
    L.push("");
    L.push("For your own study: name the commit or tag, the environment file, and where the data come from.");
    return L.join("\n");
  }

  // ---- the explain parts: the workflow as a flowchart, the exemplars, the checklist and the rubric
  function explain(J, v) {
    var x1 = document.getElementById("r5-workflow");
    if (x1) {
      x1.innerHTML = "";
      LX.Flowchart(H("div", { class: "lx-xcard" }, x1), {
        title: "Verify, benchmark, validate, rerun", lede: "The order to check a study in. Trace the versions of this page's study through it.",
        nodes: {
          paper: { t: "Formulation on paper", tN: ["Formulation", "on paper"], k: "end" },
          code: { t: "Code and data", s: "the study as built" },
          ver: { t: "Verification checks", tN: ["Verification", "checks"], s: "the five checks above", sN: "five checks" },
          q1: { t: "All pass?", k: "q" },
          fix: { t: "Fix the code", s: "then run every check again", sN: "then recheck" },
          bench: { t: "Benchmark", s: "a case with a hand answer", sN: "a hand answer" },
          q2: { t: "Matches?", k: "q" },
          val: { t: "Validation", s: "measured data, or an independent reference", sN: "measured data" },
          q3: { t: "Close enough?", tN: ["Close", "enough?"], k: "q" },
          rev: { t: "Revisit assumptions", tN: ["Revisit", "assumptions"], s: "or narrow the claim", sN: "or the claim" },
          rep: { t: "Rerun from a clean clone", tN: ["Rerun from a", "clean clone"] },
          end: { t: "Report with limits", tN: ["Report", "with limits"], k: "end" }
        },
        cols: 3, at: { paper: [1, 0], code: [1, 1], ver: [1, 2], q1: [1, 3], fix: [2, 3], bench: [1, 4], q2: [1, 5], val: [1, 6], q3: [1, 7], rev: [2, 7], rep: [1, 8], end: [1, 9] },
        colsN: 2, atN: { paper: [0, 0], code: [0, 1], ver: [0, 2], q1: [0, 3], fix: [1, 3], bench: [0, 4], q2: [0, 5], val: [0, 6], q3: [0, 7], rev: [1, 7], rep: [0, 8], end: [0, 9] },
        edges: [["paper", "code"], ["code", "ver"], ["ver", "q1"], ["q1", "fix", "no"], ["q1", "bench", "yes"], ["bench", "q2"], ["q2", "fix", "no"], ["q2", "val", "yes"],
          ["val", "q3"], ["q3", "rev", "no"], ["q3", "rep", "yes"], ["rep", "end"]],
        traces: [
          { label: "Version 1 (unit)", path: ["paper", "code", "ver", "q1", "fix"], text: fill("The size check fails: **{unitMaxE} MWh** stored in a 200 MWh battery. Fix the line, run again.", v) },
          { label: "Version 4 (missing rule)", path: ["paper", "code", "ver", "q1", "fix"], text: fill("Only paper against code catches it: {rampRows} ramp rows on paper, {rampRowsMissing} in the code. It would pass the benchmark (**{benchMissing}**).", v) },
          { label: "The fixed study", path: ["paper", "code", "ver", "q1", "bench", "q2", "val", "q3", "rep", "end"], text: fill("Checks pass, the benchmark matches (**{benchOk}**), the measured 82% round trip moves the saving by {eta82Change}%, and a clean clone reruns it. Report **{honest}** planned the day before, **{ok}** with perfect foresight.", v) }
        ], sel: 2 });
    }
    var x2 = document.getElementById("r5-exemplars");
    if (x2) { x2.innerHTML = ""; var E = exemplars(J, v); E.id = "r5-ex"; LX.Exemplars(H("div", { class: "lx-xcard" }, x2), E); }
    var x3 = document.getElementById("r5-rubric");
    if (x3) {
      x3.innerHTML = "";
      LX.Checklist(H("div", { class: "lx-xcard" }, x3), { id: "r5-log-check", title: "A verification log in nine lines", lede: "Tick each line for your own study. Each one names a check and what it found.",
        items: J.checklist.map(function (c) { return { id: c[0], label: c[1], text: c[2] }; }), columns: 2, doneText: "Paste the result of each check into your log." });
      LX.Rubric(H("div", { class: "lx-xcard" }, x3), { id: "r5-rubric", code: "R5", title: "Rate your log against the rubric", lede: "Trustworthy analysis is the competence this studio builds.",
        competences: [{ id: "trust", look: J.rubric.look }] });
    }
  }

  LX.mount("r05-build-validate", function (live, data, root) {
    var V = view(live, data, root);
    // demo states (core.js LX.demo): "mid" = version 1 run and checked; "step-N" opens card N (its action done where it is a run)
    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      V.cards.go(n - 1);
      var card = live.querySelector(".lx-stepcard"), b = card.querySelector(".r5-run .lx-btn");
      if (b && !b.disabled) b.click();
      if (state === "mid") V.solveAll().then(function () { setTimeout(function () { var c = card.querySelector(".r5-checks .lx-choice"); if (c) c.click(); }, 50); });
      return { view: "step " + n };
    }, V.cards);
  });
})();
