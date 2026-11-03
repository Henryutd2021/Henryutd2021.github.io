// ck-m-unseen-problem.js — CK-M, the Modeler checkpoint (curriculum v2 §3.3; wave W2, 2026-11-03).
//
// About 240 minutes, in three parts, on problems the course has not shown:
//   A  formulate and implement an unseen problem from a one-paragraph brief (model variant: a water utility's pumping
//      schedule with a tower and a demand charge, a linear program), or, in the empirical variant, analyse a supplied
//      dataset (Prairie Town's 2025 year: what its wind and solar farms give in the hours of highest demand and net load);
//   B  find the planted defect in a supplied model (a small capacity-expansion LP on three representative days);
//   C  validate one result against an independent reference (model: hand-worked bounds; empirical: EIA's published 2025
//      capacity factor).
// Learners work in the starter notebook (learn/notebooks/ck-m-start.ipynb) and enter their results in the shared
// checkpoint runner (LX.Checkpoint, components/checkpoint.js): one task at a time, first-try recording, the visibility-
// aware clock, a results view and a plain-text summary. This file holds CK-M's configuration: the two variants' task
// lists, CK-M's level rule, its results sentence and summary, and the supplied model run in the browser. The runner's
// options do the rest (W2 integration): its numeric check takes any unit (answer.value), `describe` writes the results
// sentence, `submitTask` opens the worked solutions when the final task is submitted (or on purpose, which is recorded),
// and `destroy()` swaps the runner when the reader changes variant.
//
// Pure part (exported for _tests/learn/test_ck-m-unseen-problem.js, which solves every model with the vendored HiGHS):
// waterModel (the worked formulation of the model variant), waterBounds, defectModel and defectReport (the supplied
// model, with and without its defect), empStats (the empirical variant's numbers from town_year.json), checkNumeric
// (the shared runner's, components/checkpoint.js), level, describe, summary, variantData, staticTasks.
(function () {
  "use strict";
  var CODE = "CK-M";

  // ---------------------------------------------------------------- pure part
  // the model variant's worked formulation, as an LX.solver model. o: { DC, Smax, Q } override the brief (validation runs)
  //   min  sum_t price_t k q_t + DC P
  //   s_t = s_{t-1} + q_t - w_t (s_{-1} = S0);  Smin <= s_t <= Smax;  0 <= q_t <= Q;  k q_t <= P;  s_23 >= S0
  function waterModel(B, o) {
    o = o || {};
    var DC = o.DC != null ? o.DC : B.demandCharge, Smax = o.Smax != null ? o.Smax : B.towerMax, Q = o.Q != null ? o.Q : B.pumpMax;
    var vars = [], cons = [], T = B.water.length;
    for (var t = 0; t < T; t++) {
      vars.push({ name: "q_" + t, ub: Q, cost: B.price[t] * B.kWhPerM3 });
      vars.push({ name: "s_" + t, lb: B.towerMin, ub: Smax });
    }
    vars.push({ name: "P", cost: DC });
    for (t = 0; t < T; t++) {
      var lv = {}; lv["s_" + t] = 1; lv["q_" + t] = -1; if (t) lv["s_" + (t - 1)] = -1;
      cons.push({ name: "tower_" + t, terms: lv, eq: (t ? 0 : B.towerStart) - B.water[t] });
      var pk = { P: -1 }; pk["q_" + t] = B.kWhPerM3;
      cons.push({ name: "peak_" + t, terms: pk, le: 0 });
    }
    var end = {}; end["s_" + (T - 1)] = 1;
    cons.push({ name: "end", terms: end, ge: B.towerStart });
    return { sense: "min", variables: vars, constraints: cons };
  }
  function waterResult(B, r) {
    if (!r || !r.ok) return { ok: false };
    var q = [], s = [], T = B.water.length;
    for (var t = 0; t < T; t++) { q.push(r.values["q_" + t]); s.push(r.values["s_" + t]); }
    var peakHours = B.price.map(function (p, t) { return p === Math.max.apply(null, B.price) ? t : -1; }).filter(function (t) { return t >= 0; });
    return { ok: true, cost: r.objective, peak: r.values.P, q: q, s: s,
      peakWater: peakHours.reduce(function (a, t) { return a + q[t]; }, 0), peakHours: peakHours,
      energyCost: q.reduce(function (a, v, t) { return a + v * B.kWhPerM3 * B.price[t]; }, 0) };
  }
  // the independent references of part C, by hand: pump as you go (a feasible plan: an upper bound) and every m3 at the
  // cheapest price with the draw spread evenly over the day (a lower bound); and the special case with no demand charge
  // and an unlimited tower and pumps (exactly the cheapest price times the day's energy)
  function waterBounds(B) {
    var k = B.kWhPerM3, W = B.water.reduce(function (a, v) { return a + v; }, 0), pmin = Math.min.apply(null, B.price);
    var ub = B.water.reduce(function (a, v, t) { return a + B.price[t] * k * v; }, 0) + B.demandCharge * k * Math.max.apply(null, B.water);
    var lb = pmin * k * W + B.demandCharge * k * W / B.water.length;
    return { water: W, energy: k * W, ub: ub, lb: lb, special: pmin * k * W, maxDraw: k * Math.max.apply(null, B.water), avgDraw: k * W / B.water.length };
  }

  // the supplied model of part B: capacity expansion on three representative days. defect: the weights as a share of
  // the year (days / 365) instead of days, so a year of capital meets one average day of running costs
  var TECH = ["wind", "solar", "cc", "pk"];
  function defectModel(M, o) {
    o = o || {};
    var vars = [], cons = [];
    TECH.forEach(function (g) { vars.push({ name: "K_" + g, cost: M.techs[g].capital }); });
    M.days.forEach(function (d) {
      var w = o.defect ? d.weight / 365 : d.weight;
      for (var t = 0; t < 24; t++) {
        TECH.forEach(function (g) { vars.push({ name: "p_" + g + "_" + d.id + "_" + t, cost: w * M.techs[g].cost }); });
        vars.push({ name: "u_" + d.id + "_" + t, cost: w * M.V });
      }
    });
    M.days.forEach(function (d) {
      for (var t = 0; t < 24; t++) {
        var bal = {}; TECH.forEach(function (g) { bal["p_" + g + "_" + d.id + "_" + t] = 1; }); bal["u_" + d.id + "_" + t] = 1;
        cons.push({ name: "bal_" + d.id + "_" + t, terms: bal, eq: d.demand[t] });
        TECH.forEach(function (g) {
          var lim = {}; lim["p_" + g + "_" + d.id + "_" + t] = 1;
          lim["K_" + g] = -(g === "wind" ? d.wind[t] : g === "solar" ? d.solar[t] : 1);
          cons.push({ name: "lim_" + g + "_" + d.id + "_" + t, terms: lim, le: 0 });
        });
      }
    });
    return { sense: "min", variables: vars, constraints: cons };
  }
  // the report the supplied code prints (with its own weights), and the true annual cost of the same plan (days)
  function defectReport(M, r, o) {
    o = o || {};
    if (!r || !r.ok) return { ok: false };
    var K = {}, x = r.values, E = {}, sumW = 0, dem = 0, unserved = 0, demTrue = 0, trueCost = 0;
    TECH.forEach(function (g) { K[g] = x["K_" + g]; E[g] = 0; trueCost += M.techs[g].capital * K[g]; });
    M.days.forEach(function (d) {
      var w = o.defect ? d.weight / 365 : d.weight; sumW += w;
      for (var t = 0; t < 24; t++) {
        dem += w * d.demand[t]; demTrue += d.weight * d.demand[t]; unserved += w * x["u_" + d.id + "_" + t];
        TECH.forEach(function (g) { E[g] += w * x["p_" + g + "_" + d.id + "_" + t]; trueCost += d.weight * M.techs[g].cost * x["p_" + g + "_" + d.id + "_" + t]; });
        trueCost += d.weight * M.V * x["u_" + d.id + "_" + t];
      }
    });
    var maxU = 0; M.days.forEach(function (d) { for (var t = 0; t < 24; t++) maxU = Math.max(maxU, x["u_" + d.id + "_" + t]); });
    return { ok: true, K: K, cost: r.objective, weights: sumW, demandYear: dem, demandTrue: demTrue, unservedYear: unserved, maxUnserved: maxU,
      perMWh: r.objective / dem, energy: E, trueCost: trueCost };
  }

  // the empirical variant's numbers from town_year.json, scaled as lesson 0 (demand x peak, wind and solar x farm size);
  // "the N highest" hours sorted from the highest, the earlier hour first where values tie
  function topHours(vals, n) {
    var idx = vals.map(function (v, i) { return i; });
    idx.sort(function (a, b) { return vals[b] - vals[a] || a - b; });
    return idx.slice(0, n);
  }
  function empStats(year, E) {
    var d = year.demand.map(function (v) { return v / 1000 * E.demandPeakMW; });
    var w = year.wind.map(function (v) { return v / 1000 * E.windMW; }), s = year.solar.map(function (v) { return v / 1000 * E.solarMW; });
    var net = d.map(function (v, i) { return v - w[i] - s[i]; });
    var mean = function (a, ix) { return (ix || a.map(function (v, i) { return i; })).reduce(function (q, i) { return q + a[i]; }, 0) / (ix ? ix.length : a.length); };
    var tD = topHours(d, E.topN), tN = topHours(net, E.topN);
    var tie = function (a, t) { return a[t[E.topN - 1]] === a[topHours(a, E.topN + 1)[E.topN]]; };
    return { hours: d.length, cfWind: mean(w) / E.windMW * 100, cfSolar: mean(s) / E.solarMW * 100, demandGWh: d.reduce(function (a, v) { return a + v; }, 0) / 1000,
      windTopD: mean(w, tD) / E.windMW * 100, solarTopD: mean(s, tD) / E.solarMW * 100,
      windTopN: mean(w, tN) / E.windMW * 100, solarTopN: mean(s, tN) / E.solarMW * 100,
      bothTopN: tN.reduce(function (a, i) { return a + w[i] + s[i]; }, 0) / tN.length, bothTopD: tD.reduce(function (a, i) { return a + w[i] + s[i]; }, 0) / tD.length,
      gap: mean(w) / E.windMW * 100 - E.eiaWind * 100, ratioTopN: mean(w, tN) / mean(w), ratioTopD: mean(w, tD) / mean(w),
      tieD: tie(d, tD), tieN: tie(net, tN), topD: tD, topN: tN, minTopD: d[tD[E.topN - 1]], minTopN: net[tN[E.topN - 1]] };
  }

  // a number with any unit: the shared runner's check (components/checkpoint.js, promoted from this file at the W2
  // integration): units [[name, factor to the answer's unit]] (null: the wrong kind, unitNote[name] says why); answer
  // {value, tol (relative), show}
  var CPK = (typeof window !== "undefined" && window.LX && window.LX.Checkpoint) || require("./components/checkpoint.js");
  var checkNumeric = CPK.checkNumeric;
  function isAuto(t) { return t.kind === "choice" || t.kind === "order" || t.kind === "numeric"; }
  function points(st, t) { var r = st.tasks[t.id] || {}; return (r.points || []).filter(Boolean).length; }
  // CK-M's published rule (the page's rubric section says it in words). Levels: 0 Not yet ... 3 Strong.
  function level(D, st) {
    var R = D.rule, auto = D.tasks.filter(isAuto), opens = D.tasks.filter(function (t) { return t.kind === "open-short"; });
    var k = auto.filter(function (t) { return st.tasks[t.id] && st.tasks[t.id].first === true; }).length;
    var defect = !!(st.tasks[R.defect] && st.tasks[R.defect].first === true);
    var pa = points(st, opens[0]), pc = points(st, opens[1]), na = opens[0].points.length, nc = opens[1].points.length;
    var complete = auto.every(function (t) { return st.tasks[t.id] && st.tasks[t.id].first != null; }) && opens.every(function (t) { return st.tasks[t.id] && st.tasks[t.id].answer; });
    var lv = R.levels[0];
    if (k >= R.autoStrong && defect && pa === na && pc === nc) lv = R.levels[3];
    else if (k >= R.autoProficient && defect && pa >= R.pointsA && pc >= R.pointsC) lv = R.levels[2];
    else if (k >= R.autoDeveloping) lv = R.levels[1];
    return { level: lv, auto: k, autoOf: auto.length, defect: defect, pointsA: pa, pointsAOf: na, pointsC: pc, pointsCOf: nc, complete: complete,
      estMin: -1, explainOk: pa === na };   // the shared rule's field names, for code that reads either rule
  }
  function describe(D, L) {
    return "Auto-marked tasks right on the first try: " + L.auto + " of " + L.autoOf + ". The defect's line on the first try: " + (L.defect ? "yes" : "no") +
      ". Points you ticked: " + L.pointsA + " of " + L.pointsAOf + " in part A, " + L.pointsC + " of " + L.pointsCOf + " in part C." + (L.complete ? "" : " Some tasks are not finished; the level counts them as not right.");
  }
  function fmtMs(ms) {
    if (ms == null) return "–";
    var s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m ? m + " min " + (s % 60 < 10 ? "0" : "") + (s % 60) + " s" : s + " s";
  }
  function firstWord(t, r) {
    if (!r || r.first == null) return r && r.skipped ? "skipped" : r && r.answer ? "submitted" : "not answered";
    if (t.kind === "open-short") return (r.points || []).filter(Boolean).length + " of " + t.points.length + " points (self)";
    return r.first ? "right" : "not right";
  }
  // the copied summary: keep its format fixed once testers use it
  function summary(D, st, env) {
    env = env || {};
    var L = level(D, st), total = 0, lines = [];
    D.tasks.forEach(function (t) { var r = st.tasks[t.id]; if (r && r.ms) total += r.ms; });
    lines.push("Learn · " + CODE + " results (" + D.version + ")");
    lines.push("Variant: " + D.variantLabel);
    lines.push("Finished: " + (st.finished || "not yet") + " (this device's clock) · active time on this page " + fmtMs(total) + " (work in the notebook is not timed)");
    lines.push("Level by the published rule: " + L.level + " (" + describe(D, L) + ")");
    lines.push("");
    lines.push("# | Part | Task | First answer | Tries | Time to first answer | Solution opened before answering");
    D.tasks.forEach(function (t, i) {
      var r = st.tasks[t.id] || {};
      lines.push((i + 1) + " | " + t.part + " | " + t.title + " | " + firstWord(t, r) + " | " + (r.tries || 0) + " | " + fmtMs(r.msFirst) + " | " + (r.solFirst ? "yes" : "no"));
    });
    D.tasks.filter(function (t) { return t.kind === "open-short"; }).forEach(function (t) {
      var r = st.tasks[t.id]; if (r && r.answer) lines.push("Your text, " + t.title.toLowerCase() + ": " + String(r.answer).replace(/\s+/g, " ").slice(0, 800));
    });
    D.tasks.filter(function (t) { return t.kind === "numeric"; }).forEach(function (t) {
      var r = st.tasks[t.id]; if (r && r.answer) lines.push("Your number, " + t.title.toLowerCase() + ": " + r.answer.value + " " + r.answer.unit);
    });
    lines.push("");
    lines.push("Screen width " + (env.width || "?") + " px. Kept in this browser only; copied by you.");
    return lines.join("\n");
  }
  // one variant's runner data: its own tasks for parts A and C around the shared part B
  function variantData(J, key) {
    var V = J.variants[key];
    return { version: J.version, variantLabel: V.label, rule: J.rule,
      tasks: V.tasksA.concat(J.tasksB, V.tasksC).map(function (t) { var o = {}; for (var k in t) o[k] = t[k]; if (t.kind === "numeric" && t.unitNote) o.unitNote = t.unitNote; return o; }) };
  }
  // the tasks for readers without JavaScript (written into the page by the test's --write mode)
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plain(t) { return esc(String(t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1")); }
  function staticTasks(J) {
    var h = [];
    ["model", "empirical"].forEach(function (key) {
      var D = variantData(J, key);
      h.push('<p class="lx-eyebrow">' + esc(D.variantLabel) + ": the tasks</p>");
      h.push('<ol class="ckm-static">');
      D.tasks.forEach(function (t, i) {
        var x = "<li><p><b>" + esc(t.title) + '</b> <span class="lx-hint">Part ' + esc(t.part) + " · " + esc(t.skill) + "</span></p><p>" + esc(t.prompt) + "</p>";
        if (t.kind === "choice") x += "<ul>" + t.options.map(function (o) { return "<li>" + o[0] + ". " + esc(o[1]) + "</li>"; }).join("") + "</ul>";
        if (t.kind === "numeric") x += "<p>Answer with a number and a unit.</p>";
        x += '<details class="lx-textalt"><summary>Worked solution, task ' + (i + 1) + "</summary>";
        if (t.kind === "choice") x += "<p><b>Answer: " + t.answer + ". " + esc(t.options.filter(function (o) { return o[0] === t.answer; })[0][1]) + "</b></p>";
        if (t.kind === "numeric") x += "<p><b>Answer: " + esc(t.answer.show) + ".</b></p>";
        x += "<p>" + plain(t.solution) + "</p>";
        if (t.kind === "open-short") x += "<p>A full answer makes these points:</p><ul>" + t.points.map(function (p) { return "<li>" + plain(p) + "</li>"; }).join("") + "</ul>";
        h.push(x + "</details></li>");
      });
      h.push("</ol>");
    });
    return h.join("\n");
  }

  // ---- the page's static blocks, written by the test's --write mode from the data and the solved models
  function usd(v) { return "$" + (Math.round(v * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function n1(v) { return (Math.round(v * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function n0(v) { return Math.round(v).toLocaleString("en-US"); }
  function hh(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function briefModelHTML(J) {
    var B = J.brief, h = ["<p>" + esc(B.text) + ' <span class="lx-hint">' + esc(B.note) + "</span></p>"];
    h.push('<ul class="ckm-facts"><li>Pumps: up to ' + n0(B.pumpMax) + " m³ an hour, " + B.kWhPerM3 + " kWh per m³</li><li>Tower: " + n0(B.towerMin) + " to " + n0(B.towerMax) + " m³; " + n0(B.towerStart) +
      " m³ at the start, at least as much at the end</li><li>Demand charge: $" + B.demandCharge.toFixed(2) + " per kW of the day's highest hourly draw</li></ul>");
    h.push('<details class="lx-textalt"><summary>Hourly water use and price</summary><div class="lx-scroll-x"><table class="lx-mini-table"><thead><tr><th scope="col">Hour</th><th scope="col">Water use (m³)</th><th scope="col">Price ($/kWh)</th></tr></thead><tbody>' +
      B.water.map(function (w, t) { return "<tr><td>" + hh(t) + "</td><td>" + w + "</td><td>" + B.price[t].toFixed(2) + "</td></tr>"; }).join("") + "</tbody></table></div></details>");
    return h.join("\n");
  }
  function briefEmpiricalHTML(J) {
    var E = J.empirical;
    return "<p>" + esc(E.text) + "</p>\n" + '<ul class="ckm-facts"><li>File: <a href="../assets/learn/data/town_year.json" download>town_year.json</a>, 8,760 hours of 2025; its <code>meta</code> block gives the source, the time convention and how bad hours were filled</li>' +
      "<li>Scaling: demand × " + E.demandPeakMW + " MW, wind × " + E.windMW + " MW, solar × " + E.solarMW + " MW</li><li>Hours: the " + E.topN + " highest by demand, and by net load; the earlier hour first where values tie</li></ul>";
  }
  function suppliedHTML(J, R) {
    var M = J.defect, h = ["<p>" + esc(M.about) + "</p>"];
    h.push('<p class="lx-eyebrow">On paper</p><ul class="ckm-paper">' + M.paper.map(function (p) { return "<li><b>" + esc(p[0]) + ":</b> <code>" + esc(p[1]) + "</code></li>"; }).join("") + "</ul>");
    h.push('<p class="lx-eyebrow">In code (the starter notebook runs it)</p><ol class="ckm-code">' + M.code.map(function (l) { return "<li><span>" + esc(l) + "</span></li>"; }).join("") + "</ol>");
    h.push('<p class="lx-hint">' + esc(M.note) + " Days: " + M.days.map(function (d) { return esc(d.label) + " for " + esc(d.stands); }).join("; ") + ".</p>");
    h.push('<details class="lx-textalt"><summary>What the code prints when run</summary><table class="lx-facts ckm-report-t"><tbody>' +
      TECH.map(function (g) { return '<tr><th scope="row">Built: ' + esc(M.techs[g].label) + '</th><td class="n">' + n1(R.K[g]) + " MW</td></tr>"; }).join("") +
      '<tr><th scope="row">Annual cost</th><td class="n">$' + (R.cost / 1e6).toFixed(1) + " million</td></tr>" +
      '<tr><th scope="row">Demand in the year</th><td class="n">' + n0(R.demandYear) + " MWh</td></tr>" +
      '<tr><th scope="row">Demand left unserved in the year</th><td class="n">' + n0(R.unservedYear) + " MWh</td></tr></tbody></table></details>");
    return h.join("\n");
  }
  function solModelHTML(J, W, Bd, x) {
    var B = J.brief, row = function (k, v) { return "<tr><td>" + k + '</td><td class="n">' + v + "</td></tr>"; };
    var h = ['<div class="lx-scroll-x"><table class="lx-facts ckm-sol"><thead><tr><th scope="col">Result</th><th scope="col">Value</th></tr></thead><tbody>' +
      row("Least cost of the day", usd(W.cost) + " = " + usd(W.energyCost) + " energy + " + usd(W.cost - W.energyCost) + " demand charge") +
      row("Highest draw", n0(W.peak) + " kW (" + n0(W.peak / B.kWhPerM3) + " m³ an hour)") +
      row("Pumped at the peak price, 16:00 to 21:00", n0(W.peakWater) + " m³") +
      row("Saving from a tower 100 m³ larger", usd(x.tower100) + " a day") +
      row("Lower bound by hand", usd(Bd.lb)) + row("Upper bound by hand (pump as you go)", usd(Bd.ub)) +
      row("Special case: no demand charge, no limits", usd(x.special) + " = " + n0(Bd.energy) + " kWh × $" + Math.min.apply(null, B.price).toFixed(2)) + "</tbody></table></div>"];
    h.push('<ul class="ckm-list"><li><b>Reading it:</b> the pumps never draw more than ' + n0(W.peak) + " kW (" + n0(W.peak / B.kWhPerM3) + " m³ an hour). In the schedule below they fill the tower at night and by day and stop for most of the peak-price evening. Every least-cost schedule pumps exactly " + n0(W.peakWater) +
      " m³ at the peak price, so the tower can end the day at " + n0(B.towerStart) + " m³; forbidding it costs more (" + usd(x.noPeakCost) + ") because the highest draw must rise to " + n0(x.noPeakP) + " kW.</li>" +
      "<li><b>Validation:</b> " + usd(W.cost) + " lies between the hand bounds, " + usd(Bd.lb) + " and " + usd(Bd.ub) + ", and the special case is matched exactly. These checks show the model is plausible; that its schedule is the cheapest rests on the formulation and the solver.</li>" +
      "<li><b>Not unique:</b> other schedules cost exactly the same (the tower level at 17:00 can be anywhere from " + n0(x.s16[0]) + " to " + n0(x.s16[1]) + " m³), so compare costs, not schedules.</li></ul>");
    h.push('<details class="lx-textalt"><summary>One least-cost schedule, hour by hour</summary><div class="lx-scroll-x"><table class="lx-mini-table"><thead><tr><th scope="col">Hour</th><th scope="col">Use (m³)</th><th scope="col">Pumped (m³)</th><th scope="col">Tower at the end (m³)</th><th scope="col">Price ($/kWh)</th></tr></thead><tbody>' +
      B.water.map(function (w, t) { return "<tr><td>" + hh(t) + "</td><td>" + w + "</td><td>" + n0(W.q[t]) + "</td><td>" + n0(W.s[t]) + "</td><td>" + B.price[t].toFixed(2) + "</td></tr>"; }).join("") + "</tbody></table></div></details>");
    return h.join("\n");
  }
  function pct(v) { return n1(v) + "%"; }
  function solEmpiricalHTML(J, S) {
    var E = J.empirical, row = function (a, b, c, d) { return "<tr><td>" + a + '</td><td class="n">' + b + '</td><td class="n">' + c + '</td><td class="n">' + d + "</td></tr>"; };
    var h = ['<ol class="ckm-list"><li><b>Design first:</b> a descriptive screen; metrics in % of each farm\'s size and in MW; 100% means SPP\'s highest 2025 hour; the top hours sorted from the highest, the earlier hour first on ties.</li>' +
      "<li><b>Load and check:</b> " + n0(S.hours) + " hours, no gaps; demand peaks at " + E.demandPeakMW + " MW and totals " + n0(S.demandGWh) + " GWh; wind and solar never above their sizes; the time index is hour-ending, from the file's <code>start_utc</code>.</li>" +
      "<li><b>Compute:</b> averages over the year and over the two sets of " + E.topN + " hours.</li></ol>"];
    h.push('<div class="lx-scroll-x"><table class="lx-facts ckm-sol"><thead><tr><th scope="col">Hours</th><th scope="col">Wind (% of 150 MW)</th><th scope="col">Solar (% of 200 MW)</th><th scope="col">Both (MW)</th></tr></thead><tbody>' +
      row("The whole year", pct(S.cfWind), pct(S.cfSolar), n1(S.cfWind * E.windMW / 100 + S.cfSolar * E.solarMW / 100)) +
      row(E.topN + " highest demand", pct(S.windTopD), pct(S.solarTopD), n1(S.bothTopD)) +
      row(E.topN + " highest net load", pct(S.windTopN), pct(S.solarTopN), n1(S.bothTopN)) + "</tbody></table></div>");
    h.push('<ul class="ckm-list"><li><b>Reading it:</b> at the demand peaks (summer afternoons) both farms give more than their year averages; at the net-load peaks (evenings, winter nights and mornings) wind gives ' + (Math.round(S.ratioTopN * 100) / 100).toFixed(2) + " of its average and solar almost nothing. The net-load hours are the ones the rest of the fleet must cover.</li>" +
      "<li><b>Validation:</b> the dataset's wind capacity factor, " + pct(S.cfWind) + ", is " + n1(S.gap) + " percentage points above EIA's 2025 U.S. value of 33.8%; solar's " + pct(S.cfSolar) + " is close to EIA's 24.0%. The shapes are shares of their own highest hour, not of capacity, and SPP's fleet and wind differ from the U.S. average; these data alone cannot split the gap.</li>" +
      "<li><b>What survives:</b> rescaled linearly to 33.8% (each hour × 0.338 ÷ " + (S.cfWind / 100).toFixed(4) + "), wind's MW and percentages fall by the same factor, so the ratio to its own average, " + (Math.round(S.ratioTopN * 100) / 100).toFixed(2) + " at the net-load peaks, is unchanged.</li>" +
      "<li><b>What it leaves out:</b> one weather year, outages, imports and an adequacy model; averages over top hours screen, they do not measure a capacity credit.</li></ul>");
    return h.join("\n");
  }
  function solDefectHTML(J, Rd, Rf) {
    var M = J.defect, row = function (k, a, b) { return "<tr><td>" + k + '</td><td class="n">' + a + '</td><td class="n">' + b + "</td></tr>"; };
    var h = ['<ol class="ckm-list"><li><b>Symptom:</b> a gas peaker only, demand left unserved, and a year that holds ' + n0(Rd.demandYear) + " MWh of demand: about one day of the town's.</li>" +
      "<li><b>Root cause, line 2:</b> <code>weight = DAYS[d] / 365</code> turns the days each representative day stands for into shares of the year. The paper says the weight is the number of days. With shares, the running costs of one average day meet a whole year of capital costs, so fuel looks almost free and capital-light plants win.</li>" +
      "<li><b>The check that shows it:</b> the year's total against an independent reference: the model's demand in the year, " + n0(Rd.demandYear) + " MWh, against the town's " + n0(Rf.demandYear / 1000) + " GWh. Units say the same: capital in $ a year, running costs in $ a day.</li>" +
      "<li><b>The fix:</b> <code>weight = DAYS</code> (121, 122, 122 days). Solve again.</li></ol>"];
    h.push('<div class="lx-scroll-x"><table class="lx-facts ckm-sol"><thead><tr><th scope="col">Report line</th><th scope="col">Supplied (defect)</th><th scope="col">Fixed</th></tr></thead><tbody>' +
      TECH.map(function (g) { return row("Built: " + esc(M.techs[g].label), n1(Rd.K[g]) + " MW", n1(Rf.K[g]) + " MW"); }).join("") +
      row("Annual cost", "$" + (Rd.cost / 1e6).toFixed(1) + " million", "$" + (Rf.cost / 1e6).toFixed(1) + " million") +
      row("Demand in the year", n0(Rd.demandYear) + " MWh", n0(Rf.demandYear) + " MWh") +
      row("Demand left unserved in the year", n0(Rd.unservedYear) + " MWh", n0(Rf.unservedYear) + " MWh") +
      row("Cost per MWh of demand", usd(Rd.perMWh), usd(Rf.perMWh)) + "</tbody></table></div>");
    h.push('<p class="lx-hint">The fixed plan is the answer to the model as written, not a recommendation: its costs are illustrative, and three typical days keep no extreme day, so the plan meets the peaks of those days, not the year\'s (M3 keeps the extremes).</p>');
    return h.join("\n");
  }

  var api = { CODE: CODE, waterModel: waterModel, waterResult: waterResult, waterBounds: waterBounds, TECH: TECH, defectModel: defectModel,
    defectReport: defectReport, topHours: topHours, empStats: empStats, checkNumeric: checkNumeric, level: level, describe: describe,
    summary: summary, variantData: variantData, staticTasks: staticTasks, briefModelHTML: briefModelHTML, briefEmpiricalHTML: briefEmpiricalHTML,
    suppliedHTML: suppliedHTML, solModelHTML: solModelHTML, solEmpiricalHTML: solEmpiricalHTML, solDefectHTML: solDefectHTML };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX || !window.LX.Checkpoint) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  var KEYS = { model: "ckm-model-v1", empirical: "ckm-emp-v1" };
  function finalId(J, key) { var C = J.variants[key].tasksC; return C[C.length - 1].id; }
  function money(v) { return "$" + (Math.round(v * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function mw(v) { return (Math.round(v * 10) / 10).toLocaleString("en-US") + " MW"; }

  // the supplied model of part B, run in the browser as its code would run, and its report
  function supplied(J) {
    var host = document.getElementById("ckm-supplied-run"); if (!host) return;
    host.innerHTML = "";
    var row = H("div", { class: "ckm-run" }, host);
    var go = H("button", { type: "button", class: "lx-btn small", html: "Run the supplied model" + LX.icon("arrow") }, row), st = LX.SolverStatus(row);
    var out = H("div", { class: "ckm-report", "aria-live": "polite" }, host);
    go.addEventListener("click", function () {
      go.disabled = true; st.set("solving");
      LX.solver.solve(defectModel(J.defect, { defect: true }), { timeLimit: 10, key: "ckm-supplied" }).then(function (r) {
        var R = defectReport(J.defect, r, { defect: true }), pre = !R.ok;
        if (pre) R = J.ref.supplied;
        st.set(pre ? "" : r); if (pre) st.el.textContent = "The solver could not load: this is the precomputed report.";
        out.innerHTML = "";
        H("p", { class: "lx-eyebrow", text: "What the code prints" }, out);
        var tb = H("table", { class: "lx-facts ckm-report-t" }, H("div", { class: "lx-scroll-x" }, out)), bd = H("tbody", null, tb);
        var line = function (k, v) { var tr = H("tr", null, bd); H("th", { scope: "row", text: k }, tr); H("td", { class: "n", text: v }, tr); };
        TECH.forEach(function (g) { line("Built: " + J.defect.techs[g].label, mw(R.K[g])); });
        line("Annual cost", "$" + (R.cost / 1e6).toFixed(1) + " million");
        line("Demand in the year", Math.round(R.demandYear).toLocaleString("en-US") + " MWh");
        line("Demand left unserved in the year", Math.round(R.unservedYear).toLocaleString("en-US") + " MWh");
        H("p", { class: "lx-hint", text: "Solved to optimal. Is it right? That is task 6." }, out);
      });
    });
  }

  LX.mount("ck-m-unseen-problem", function (live, data, root) {
    var J = data.ck_m_unseen_problem, cp = null, cur = null, D = null;
    var lock = document.getElementById("ckm-lock"), body = document.getElementById("ckm-solution-body");
    // the variant picker
    var pk = H("div", { class: "ckm-pick lx-card" }, live);
    H("p", { class: "lx-eyebrow", text: "Choose your variant" }, pk);
    var prow = H("div", { class: "ckm-pick-row", role: "group", "aria-label": "Choose your variant" }, pk), btns = {};
    ["model", "empirical"].forEach(function (k) {
      var V = J.variants[k];
      btns[k] = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", html: "<span><b>" + LX.esc(V.label) + "</b><small>" + LX.esc(V.short) + "</small></span>",
        onclick: function () { choose(k, true); } }, prow);
    });
    H("p", { class: "lx-hint", text: "Part B, the planted defect, is the same in both. Each variant keeps its own answers in this browser; you may do both." }, pk);
    // one runner on screen at a time: changing variant removes the runner (destroy: its clock, listeners and markup) and
    // makes the chosen variant's, which resumes that variant's stored attempt. The runner opens the worked solutions when
    // the variant's final task is submitted, or on purpose (recorded on that task), and shuts them on "Start again".
    var host = H("div", { class: "ckm-runner" }, live), Ds = {};
    function choose(k, user) {
      if (cur === k && cp) return;
      if (cp) cp.destroy();
      cur = k; LX.store.set("ckm-variant", k);
      Object.keys(btns).forEach(function (b) { btns[b].setAttribute("aria-pressed", b === k ? "true" : "false"); });
      host.setAttribute("data-variant", k);
      D = Ds[k] = Ds[k] || variantData(J, k);
      cp = LX.Checkpoint(host, { data: D, key: KEYS[k], code: CODE, lessonId: "ck-m-unseen-problem", intro: J.intro,
        lock: lock, solution: body, submitTask: finalId(J, k), level: level, describe: describe, summary: summary });
      if (user) host.scrollIntoView({ block: "nearest", behavior: LX.reduced() ? "auto" : "smooth" });
    }
    // the lock box's button before any variant is chosen: start the model variant and record the early opening there
    // (once a runner exists, its own listener handles the button)
    if (lock) {
      var ob = lock.querySelector("button");
      if (ob) ob.addEventListener("click", function () { if (!cp) { choose("model"); cp.solutionNow(); } });
    }
    var saved = LX.store.get("ckm-variant", null);
    if (saved === "model" || saved === "empirical") choose(saved); else if (lock) lock.hidden = false;   // no variant yet: the solutions stay shut
    supplied(J);
    var cr = document.getElementById("ckm-course-rubric");
    if (cr && LX.Rubric) {
      cr.innerHTML = "";
      LX.Rubric(H("div", { class: "lx-xcard" }, cr), { id: "ckm-rubric-course", code: CODE, title: "Rate your work against the course rubric",
        lede: "CK-M is where the course rubric's Trustworthy analysis is first shown on an unseen problem.", competences: [{ id: "trust", look: J.rubricLook }] });
    }
    // demo states (core.js LX.demo): "mid" = model variant, task 2 on screen; "done" = its results; "solution" = opened
    LX.demo(root, function (state) {
      if (state === "mid") { choose("model"); cp.show(1); return { view: "task 2" }; }
      if (state === "empirical") { choose("empirical"); cp.show(1); return { view: "empirical task 2" }; }
      if (state === "done") { choose(cur || "model"); cp.results(); return { view: "results" }; }
      if (state === "solution") { if (lock) lock.hidden = true; if (body) body.classList.add("is-open"); var s = document.getElementById("solution"); if (s) s.scrollIntoView(); return { view: "solution" }; }
      return null;
    });
  });
})();
