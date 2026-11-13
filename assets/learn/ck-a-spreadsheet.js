// ck-a-spreadsheet.js — CK-A, the Analyst checkpoint (the Analyst tier's end-of-tier task).
//
// About 150 minutes on a case the course has not shown: a school's rooftop solar and battery behind its meter. The learner
// builds an auditable spreadsheet (the starter workbook, assets/learn/data/ck-a-starter.xlsx): a boundary, an assumptions
// log with sources and dates, the model, who pays and who benefits (A13's distinctions: transfers against real costs,
// gross against net), and a sensitivity of the main result. Then nine tasks in the shared checkpoint runner
// (LX.Checkpoint): two written (self-ticked against stated points) and seven auto-marked. The worked solution (a
// workbook with live formulas, ck-a-worked.xlsx, and the page's tables) opens once all nine tasks are answered, in any
// order (the runner's gateAll option).
//
// Data: assets/learn/data/ck-a-spreadsheet.json, written with both workbooks by its data build step.
// This file's pure model recomputes every worked number from the log's values (derive, model);
// _tests/learn/test_ck-a-spreadsheet.js checks it against the data file and against the worked workbook's formulas,
// evaluated with the course's own formula engine (components/sheet.js).
//
// The model (closed form, real 2025 dollars, constant real savings): energy charge = (average price x use - demand charge
// x peak x 12) / use (the tariff gives the school EIA's average before the project); solar = kW x capacity factor x 8,760;
// savings: used x energy charge + exported x export credit + battery kW x cut share x demand charge x 12 - battery losses
// (discharges x kWh x (1 - round trip) x energy charge); upkeep; annuity factor (1 - (1 + r)^-n) / r; the battery replaced
// at the end of year 15 and a straight-line residual at year 25. Who pays: the utility avoids (solar - losses) x avoided
// energy cost + the battery's coincident peak cut x capacity cost; the rest of the school's bill saving is a transfer from
// the other customers. School + other customers = the resource view (the test proves it).
//
// Level rule (the page's rubric section says it in words): first-try answers of the seven auto-marked tasks and the points
// ticked in the two written tasks; a task whose worked solution was opened first counts as not right. The full worked
// solution opens only once every task is answered (gateAll: otherwise submitting task 9 first would open it,
// and the other answers could be copied from it); an answer given after it opened counts as practice (the runner's shared
// late-answer rule, late "practice": not right, no points for a written task); and an attempt during which it had been
// open before every task was answered (opened early on purpose, or by an earlier attempt) is practice, with no level
// (CK-M's rule).
(function () {
  "use strict";
  var CODE = "CK-A", KEY = "cka-v1";

  // ---------------------------------------------------------------- pure part
  function vals(D) { var v = {}; D.log.forEach(function (r) { if (r.value != null) v[r.id] = r.value; }); return v; }
  function derive(v0) {
    var v = {}; for (var k in v0) v[k] = v0[k];
    v.defl22 = v.i2025 / v.i2022; v.defl23 = v.i2025 / v.i2023;
    v.capital = v.capKW * v.pvKW * v.defl22; v.repl = v.batRepKW * v.batKW * v.defl22;
    v.omPV = v.pvOM * v.pvKW * v.defl23; v.omBat = v.batOM * v.batKW * v.defl22;
    v.co2 = v.co2lb * 0.45359237 / 1000;
    v.coloc = 1 - v.capKW * v.pvKW / (v.pvAloneKW * v.pvKW + v.batRepKW * v.batKW);
    return v;
  }
  function model(v) {
    var o = {};
    o.energyCharge = (v.price * v.use - v.demand * v.peak * 12) / v.use;
    o.solar = v.pvKW * v.pvCF * 8760; o.used = o.solar * v.self; o.exported = o.solar - o.used;
    o.sEnergy = o.used * o.energyCharge; o.sExport = o.exported * v.export; o.sDemand = v.batKW * v.cut * v.demand * 12;
    o.lossKWh = v.cycles * v.batKWh * (1 - v.rte); o.sLoss = -o.lossKWh * o.energyCharge;
    o.billSave = o.sEnergy + o.sExport + o.sDemand + o.sLoss;
    o.upkeep = v.omPV + v.omBat; o.net = o.billSave - o.upkeep;
    o.af = (1 - Math.pow(1 + v.rate, -v.years)) / v.rate; o.pvNet = o.net * o.af;
    o.pvRepl = v.repl * Math.pow(1 + v.rate, -v.batLife);
    o.residual = v.repl * (v.batLife - (v.years - v.batLife)) / v.batLife; o.pvResidual = o.residual * Math.pow(1 + v.rate, -v.years);
    o.npvSchool = -v.capital + o.pvNet - o.pvRepl + o.pvResidual;
    o.avoided = (o.solar - o.lossKWh) * v.avoidE + v.batKW * v.cut * v.coinc * v.capCost;
    o.shift = o.billSave - o.avoided; o.npvOthers = -o.shift * o.af;
    o.npvSociety = -v.capital - o.upkeep * o.af - o.pvRepl + o.pvResidual + o.avoided * o.af;
    o.check = o.npvSchool + o.npvOthers - o.npvSociety;
    o.co2t = (o.solar - o.lossKWh) / 1000 * v.co2;
    return o;
  }
  function swing(x, spec) { return typeof spec === "string" ? x * parseFloat(spec.slice(1)) : spec; }
  // the sensitivity: each log row with a low and a high; rows that share a key swing together (upkeep: both rows)
  function sensitivity(D, base) {
    var spec = {}; D.log.forEach(function (r) { spec[r.id] = [r.low, r.high]; });
    return D.sens.map(function (p) {
      var at = [0, 1].map(function (side) { var v = {}; for (var k in base) v[k] = base[k]; p.ids.forEach(function (i) { v[i] = swing(base[i], spec[i][side]); }); return { v: v, o: model(v) }; });
      var show = function (s) { return p.ids.length > 1 ? s.o.upkeep : s.v[p.ids[0]]; };
      return { key: p.key, label: p.label, ids: p.ids, lo: show(at[0]), hi: show(at[1]), atLo: at[0].o.npvSchool, atHi: at[1].o.npvSchool, swing: Math.abs(at[1].o.npvSchool - at[0].o.npvSchool) };
    }).sort(function (a, b) { return b.swing - a.swing; });
  }
  function facts(D) {
    var base = derive(vals(D)), res = model(base), sens = sensitivity(D, base);
    var lows = [], cum = 0, minCum = Infinity, pv = 0;
    for (var y = 0; y <= base.years; y++) {
      var f = (y === 0 ? -base.capital : y === base.batLife ? -base.repl : 0) + (y > 0 ? res.billSave - res.upkeep : 0) + (y === base.years ? res.residual : 0);
      cum += f; pv += f * Math.pow(1 + base.rate, -y); if (cum < minCum) minCum = cum;
    }
    sens.forEach(function (s) { lows.push(s.atLo, s.atHi); });
    return { base: base, res: res, sens: sens, pvSum: pv, minCum: minCum, range: [Math.min.apply(null, lows), Math.max.apply(null, lows)] };
  }
  function usd(v) { return (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"); }
  function usdK(v) { return (v < 0 ? "−" : "") + "$" + (Math.round(Math.abs(v) / 1000) * 1000).toLocaleString("en-US"); }
  function pct(f, d) { return (100 * f).toFixed(d == null ? 0 : d) + "%"; }
  function n0(v) { return Math.round(v).toLocaleString("en-US"); }
  // a low-to-high range with its unit, for the sensitivity table and the tornado's labels
  function unitOf(r) { return /\$\/kWh/.test(r.unit) ? " per kWh" : r.unit === "$/kW-month" ? " per kW-month" : /^\$ \(2025\)/.test(r.unit) && r.id === "upkeep" ? " a year" : ""; }
  function showRange(r, lo, hi) { return showVal(r, lo) + " to " + showVal(r, hi) + unitOf(r); }
  function showOne(r, v) { var u = unitOf(r); return showVal(r, v) + (u === " per kWh" ? "/kWh" : u === " per kW-month" ? "/kW-month" : u); }
  function showVal(r, v) {
    if (r.unit === "fraction" || r.unit === "per year" && r.id === "rate") return pct(v, Math.abs(v * 100 - Math.round(v * 100)) > 1e-9 ? 1 : 0);
    if (/\$\/kWh/.test(r.unit)) return "$" + v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    if (/^\$\//.test(r.unit)) return "$" + (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(2));
    if (/^\$ \(2025\)/.test(r.unit)) return usd(v);
    if (r.unit === "factor") return v.toFixed(4);
    if (r.unit === "t per MWh") return v.toFixed(4);
    if (r.unit === "index (2017 = 100)") return v.toFixed(3);
    return Number.isInteger(v) ? v.toLocaleString("en-US") : String(v);
  }

  // shared runner checks (components/checkpoint.js)
  var CPK = (typeof window !== "undefined" && window.LX && window.LX.Checkpoint) || require("./components/checkpoint.js");
  function isAuto(t) { return t.kind === "choice" || t.kind === "order" || t.kind === "numeric"; }
  function points(st, t) { var r = st.tasks[t.id] || {}; return (r.points || []).filter(Boolean).length; }
  // a written task whose worked solution was opened before it was submitted earns no points (the published rule: a task
  // whose answer you open before answering counts as not right)
  function opened(st, t) { var r = st.tasks[t.id]; return !!(r && r.solFirst); }
  // a task first answered after the page's full worked solution opened (D.solOpen: ISO time, the runner's record): the
  // runner's shared late-answer rule (the answer that opened it, the last of all, is not late)
  function after(D, st, t) { return CPK.lateAnswer(st.tasks[t.id], D.solOpen); }
  function firstRight(st, t, D) { return CPK.firstRight(st.tasks[t.id], "not-right") && !(D && after(D, st, t)); }
  // practice: the full worked solution was open before every task was answered: opened early by this attempt (the lock's
  // button or the solution demo, recorded as st.solEarly), or by an earlier attempt in this browser
  function assisted(D, st) {
    if (st.solEarly) return "early";
    var last = CPK.lastAnswerAt(D, st);
    if (D.solOpen && (!CPK.allAnswered(D, st) || !last || D.solOpen < last)) return "seen";
    return null;
  }
  function level(D, st) {
    var R = D.rule, auto = D.tasks.filter(isAuto), opens = D.tasks.filter(function (t) { return t.kind === "open-short"; });
    var k = auto.filter(function (t) { return firstRight(st, t, D); }).length;
    var pa = after(D, st, opens[0]) || opened(st, opens[0]) ? 0 : points(st, opens[0]), pb = after(D, st, opens[1]) || opened(st, opens[1]) ? 0 : points(st, opens[1]);
    var late = D.tasks.filter(function (t) { return after(D, st, t); }).length;
    var na = opens[0].points.length, nb = opens[1].points.length, help = assisted(D, st);
    var complete = auto.every(function (t) { return st.tasks[t.id] && st.tasks[t.id].first != null; }) && opens.every(function (t) { return st.tasks[t.id] && st.tasks[t.id].answer; });
    var early = auto.filter(function (t) { return st.tasks[t.id] && st.tasks[t.id].solFirst && !after(D, st, t); }).length;
    var writtenEarly = opens.filter(function (t) { return opened(st, t) && !after(D, st, t); }).length;
    var lv = R.levels[0];
    if (help) lv = R.practice;
    else if (k >= R.autoStrong && pa === na && pb === nb) lv = R.levels[3];
    else if (k >= R.autoProficient && pa >= R.pointsProficient && pb >= R.pointsProficient) lv = R.levels[2];
    else if (k >= R.autoDeveloping) lv = R.levels[1];
    return { level: lv, auto: k, autoOf: auto.length, pointsA: pa, pointsAOf: na, pointsB: pb, pointsBOf: nb, complete: complete, early: early, writtenEarly: writtenEarly, late: late, assisted: help, estMin: -1, explainOk: pa === na };
  }
  function describe(D, L) {
    if (L.assisted) return (L.assisted === "early" ? "The worked solution was opened before all " + D.tasks.length + " tasks were answered" : "The worked solution had already been open in this browser (an earlier attempt)") +
      ", so this attempt is practice and gets no level. Your answers and their feedback stay.";
    return "Auto-marked tasks right on the first try: " + L.auto + " of " + L.autoOf + (L.early ? " (" + L.early + " with the solution opened first, counted as not right)" : "") +
      (L.late ? ". Answered after the worked solution opened, so counted as practice (not right, no points): " + L.late + " task" + (L.late > 1 ? "s" : "") : "") +
      ". Points counted: " + L.pointsA + " of " + L.pointsAOf + " for the boundary, " + L.pointsB + " of " + L.pointsBOf + " for the log and sensitivity" +
      (L.writtenEarly ? " (" + L.writtenEarly + " written task" + (L.writtenEarly > 1 ? "s" : "") + " with the solution opened first: no points)" : "") + "." + (L.complete ? "" : " Some tasks are not finished; the level counts them as not right.");
  }
  function summary(D, st, env) {
    env = env || {};
    var L = level(D, st), total = 0, lines = [];
    D.tasks.forEach(function (t) { var r = st.tasks[t.id]; if (r && r.ms) total += r.ms; });
    lines.push("Learn · " + CODE + " results (" + D.version + ")");
    lines.push("Finished: " + (st.finished || "not yet") + " (this device's clock) · active time on this page " + CPK.fmtMs(total) + " (work in the spreadsheet is not timed)");
    lines.push("Level by the published rule: " + L.level + " (" + describe(D, L) + ")");
    lines.push("");
    lines.push("# | Part | Task | First answer | Tries | Time to first answer | Solution opened before answering");
    D.tasks.forEach(function (t, i) {
      var r = st.tasks[t.id] || {}, w = !r || r.first == null ? (r && r.answer ? "submitted" : "not answered") : t.kind === "open-short" ? (r.points || []).filter(Boolean).length + " of " + t.points.length + " points (self)" : r.first ? "right" : "not right";
      lines.push((i + 1) + " | " + t.part + " | " + t.title + " | " + w + " | " + (r.tries || 0) + " | " + CPK.fmtMs(r.msFirst) + " | " + (after(D, st, t) ? "yes (the full worked solution)" : r.solFirst ? "yes" : "no"));
    });
    D.tasks.forEach(function (t) {
      var r = st.tasks[t.id]; if (!r || !r.answer) return;
      if (t.kind === "open-short") lines.push("Your text, " + t.title.toLowerCase() + ": " + String(r.answer).replace(/\s+/g, " "));   // in full: nothing is cut
      if (t.kind === "numeric") lines.push("Your number, " + t.title.toLowerCase() + ": " + r.answer.value + " " + r.answer.unit);
    });
    lines.push("");
    lines.push("Screen width " + (env.width || "?") + " px. Kept in this browser only; copied by you.");
    return lines.join("\n");
  }
  // the runner's data: the prompt's tolerance sentence goes under the answer field (tolNote, as CK-M)
  function runnerData(D) {
    return { version: D.version, rule: D.rule, tasks: D.tasks.map(function (t) { var o = {}; for (var k in t) o[k] = t[k]; return o; }) };
  }

  // ---- static blocks (written into the page by the test's --write mode; the page reads the same data)
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plain(t) { return esc(String(t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1")); }
  // text with glossary marks to safe HTML with the page's term spans, in static blocks: the course's own writer (core.js)
  var RICH = (typeof window !== "undefined" && window.LX && window.LX.rich) || require("./components/core.js").rich;
  function term(t) { return RICH(t); }
  // the case in three parts: situation, deliverable, inputs
  function staticBrief(D) {
    return '<p><b>Situation:</b> ' + term(D.case.situation) + "</p>\n<p><b>Deliverable:</b> " + term(D.case.deliverable) + "</p>\n" +
      '<p class="lx-eyebrow cka-in">Inputs, illustrative where marked</p>\n' +
      '<ul class="cka-facts">' + D.case.facts.map(function (f) { return "<li><b>" + esc(f[0]) + ":</b> " + term(f[1]) + "</li>"; }).join("") + "</ul>\n" +
      '<p class="lx-hint">' + esc(D.case.fictional) + "</p>";
  }
  function staticTasks(D) {
    var h = ['<p class="lx-hint">Without JavaScript nothing here is locked: the worked solution is further down the page. Build your spreadsheet first, write your answers down, then compare.</p>', '<ol class="cka-static">'];
    D.tasks.forEach(function (t) {
      var x = "<li><p><b>" + esc(t.title) + '</b> <span class="lx-hint">Part ' + esc(t.part) + " · " + esc(t.skill) + "</span></p><p>" + esc(t.prompt) + (t.tolNote ? " " + esc(t.tolNote) : "") + "</p>";
      if (t.kind === "choice") x += "<ul>" + t.options.map(function (o) { return "<li>" + o[0] + ". " + esc(o[1]) + "</li>"; }).join("") + "</ul>";
      if (t.kind === "numeric") x += "<p>Answer with a number and a unit.</p>";
      if (t.kind === "open-short") x += "<p>Self-rated against " + t.points.length + " points, shown after you submit.</p>";
      h.push(x + "</li>");
    });
    h.push("</ol>");
    return h.join("\n");
  }
  function staticSolution(D) {
    var F = facts(D), b = F.base, r = F.res, S = F.sens, h = [];
    var row = function (k, v) { return "<tr><th scope=\"row\">" + k + '</th><td class="n">' + v + "</td></tr>"; };
    h.push('<div class="lx-xcard"><header class="lx-x-head"><h3>The answer in one line</h3></header>');
    h.push("<p class=\"cka-big\">Net present value to the school: <b>" + usd(r.npvSchool) + "</b> (2025 dollars, " + b.years + " years, " + pct(b.rate) + " real). In present value the district pays " + usdK(-r.npvSchool) + " more than it saves.</p>");
    h.push('<p class="lx-hint">One-at-a-time swings put it between ' + usdK(F.range[0]) + " and " + usdK(F.range[1]) + ": no single swing changes its sign. Cumulative cash stays below zero in every year (lowest " + usdK(F.minCum) + "), so there is no payback within " + b.years + " years.</p>");
    h.push('<p class="cka-dl"><a class="lx-btn small" href="../assets/learn/data/' + D.files.worked + '" download>Worked spreadsheet (.xlsx, live formulas)</a></p></div>');
    // the worked numbers, task by task
    h.push('<div class="lx-xcard"><header class="lx-x-head"><h3>The numbers, step by step</h3></header><div class="lx-scroll-x"><table class="lx-facts cka-sol">');
    h.push('<thead><tr><th scope="col">Quantity</th><th scope="col">Worked value</th></tr></thead><tbody>');
    h.push(row("Energy charge (derived from EIA's average)", "$" + r.energyCharge.toFixed(4) + "/kWh"));
    h.push(row("Solar output", n0(r.solar) + " kWh a year (" + n0(r.used) + " used, " + n0(r.exported) + " sent out)"));
    h.push(row("Up-front cost", usd(b.capital) + " (2025 dollars; " + usd(b.capKW * b.pvKW) + " in 2022 dollars × " + b.defl22.toFixed(4) + ")"));
    h.push(row("Bill saving, gross", usd(r.billSave) + " a year = " + usd(r.sEnergy) + " energy + " + usd(r.sExport) + " exports + " + usd(r.sDemand) + " demand − " + usd(-r.sLoss) + " losses"));
    h.push(row("Upkeep", usd(r.upkeep) + " a year (" + usd(b.omPV) + " solar, " + usd(b.omBat) + " battery)"));
    h.push(row('<span class="lx-term" data-term="annuity-factor">Annuity factor</span>', r.af.toFixed(2) + " (" + b.years + " years at " + pct(b.rate) + ")"));
    h.push(row("Battery replacement, year " + b.batLife, usd(b.repl) + "; present value " + usd(r.pvRepl)));
    h.push(row('<span class="lx-term" data-term="residual-value">Residual value</span>, year ' + b.years, usd(r.residual) + " (" + (b.batLife - (b.years - b.batLife)) + " of " + b.batLife + " years left, straight line); present value " + usd(r.pvResidual)));
    h.push(row("Net present value to the school", usd(r.npvSchool)));
    h.push("</tbody></table></div>");
    h.push('<p class="lx-hint">Check in the workbook: the year-by-year cash flow sums to the same ' + usd(F.pvSum) + ". The installed cost read as per kW-DC of solar is " + pct(b.coloc) + " below the two systems' separate costs, as the report says installing together saves.</p></div>");
    // who pays
    h.push('<div class="lx-xcard"><header class="lx-x-head"><h3>Who pays and who benefits</h3></header><div class="lx-scroll-x"><table class="lx-facts cf-two cka-led">');
    h.push('<thead><tr><th scope="col">Party</th><th scope="col">A year</th><th scope="col">Present value</th></tr></thead><tbody>');
    [["The school district", r.net, r.npvSchool], ["The utility's other customers (at the next rate reset)", -r.shift, r.npvOthers], ["Federal taxpayers (no credit counted)", 0, 0], ["Resource view: all parties together", r.avoided - r.upkeep, r.npvSociety]].forEach(function (p) {
      h.push('<tr><th scope="row">' + esc(p[0]) + '</th><td class="n" data-l="A year">' + usd(p[1]) + '</td><td class="n" data-l="Present value">' + usd(p[2]) + "</td></tr>");
    });
    h.push("</tbody></table></div>");
    h.push('<ul class="cka-list"><li><b>Gross against net:</b> of the school\'s ' + usd(r.billSave) + " gross bill saving a year, " + usd(r.avoided) + " is a real cost the utility avoids; " + usd(r.shift) + " is a <span class=\"lx-term\" data-term=\"transfer\">transfer</span> from its other customers.</li>");
    h.push("<li><b>Adds up:</b> school " + usd(r.npvSchool) + " + other customers " + usd(r.npvOthers) + " = resource view " + usd(r.npvSociety) + ".</li>");
    h.push("<li><b>Screening estimate:</b> the cost shift holds only under the brief's rate-reset assumption. It comes from the accounting of who pays, not from the model of the school's bill.</li>");
    h.push("<li><b>CO₂, not valued:</b> about " + n0(r.co2t) + " t a year at Kansas's 2024 average factor: an inventory number, not the change the project causes.</li>");
    h.push('<li><b>Resilience, not counted:</b> no <span class="lx-term" data-term="islanding">islanding</span> equipment is costed, so the battery gives no backup in an outage.</li>');
    h.push("<li><b>Jobs, not estimated:</b> installation is job-years of temporary work, not permanent jobs.</li></ul></div>");
    // sensitivity
    h.push('<div class="lx-xcard" id="cka-sens"><header class="lx-x-head"><h3>Sensitivity of the main result</h3></header><div class="lx-scroll-x"><table class="lx-facts cf-two cka-sens">');
    h.push('<thead><tr><th scope="col">Input</th><th scope="col">Low to high</th><th scope="col">NPV at low</th><th scope="col">NPV at high</th></tr></thead><tbody>');
    var lab = {}; D.log.forEach(function (x) { lab[x.id] = x; });
    S.forEach(function (s) {
      var lr = s.ids.length > 1 ? { unit: "$ (2025)", id: "upkeep" } : lab[s.ids[0]];
      h.push('<tr><th scope="row">' + esc(s.label) + '</th><td class="n" data-l="Low to high">' + showRange(lr, s.lo, s.hi) + '</td><td class="n" data-l="NPV at low">' + usd(s.atLo) + '</td><td class="n" data-l="NPV at high">' + usd(s.atHi) + "</td></tr>");
    });
    h.push("</tbody></table></div>");
    h.push('<p class="lx-hint">Sorted by swing. The demand-charge row varies the demand charge while holding the school\'s pre-project annual bill constant, so the energy charge falls as it rises.</p>');
    h.push('<p class="lx-hint">Then the reduction in solar savings exceeds the increase in battery savings: the result falls.</p>');
    h.push('<div id="cka-tornado"></div></div>');
    // boundary and log
    h.push('<div class="lx-xcard"><header class="lx-x-head"><h3>Boundary and assumptions log</h3></header>');
    h.push('<ul class="cka-list"><li><b>Counted:</b> the school district\'s money: bill saving, capital, upkeep, the battery\'s replacement and its residual value; ' + b.years + ' years, real 2025 dollars, a ' + pct(b.rate) + ' <span class="lx-term" data-term="real-rate">real discount rate</span>.</li>');
    h.push('<li><b>Left out:</b> tax credits (a transfer if claimed through <span class="lx-term" data-term="elective-pay">elective pay</span>), financing, resilience, CO₂\'s value, solar wear, tariff changes over time.</li>');
    h.push("<li><b>Reported apart:</b> the other customers, federal taxpayers and the resource view.</li></ul>");
    h.push('<details class="lx-textalt"><summary>The worked assumptions log (' + D.log.length + " rows)</summary><div class=\"lx-scroll-x\"><table class=\"lx-mini-table cka-log\"><thead><tr><th scope=\"col\">Input</th><th scope=\"col\">Value</th><th scope=\"col\">Unit</th><th scope=\"col\">Type</th><th scope=\"col\">Source</th></tr></thead><tbody>");
    D.log.forEach(function (x) {
      var v = x.value != null ? x.value : b[x.id];
      h.push("<tr><td>" + esc(x.input) + "</td><td>" + showVal(x, v) + "</td><td>" + esc(x.unit) + "</td><td>" + esc(x.type) + "</td><td>" + esc(x.src ? D.sources[x.src].short : x.type === "Derived" ? "formula in the log" : "this case") + "</td></tr>");
    });
    h.push("</tbody></table></div></details></div>");
    // marking guide for the written tasks
    h.push('<div class="lx-xcard"><header class="lx-x-head"><h3>The points of the two written tasks</h3></header>');
    D.tasks.filter(function (t) { return t.kind === "open-short"; }).forEach(function (t) {
      h.push("<p><b>" + esc(t.title) + "</b></p><ul class=\"cka-list\">" + t.points.map(function (p) { return "<li>" + plain(p) + "</li>"; }).join("") + "</ul>");
    });
    h.push("</div>");
    return h.join("\n");
  }
  function tornadoRows(D, F) {
    var lab = {}; D.log.forEach(function (x) { lab[x.id] = x; });
    return F.sens.map(function (s) { var lr = s.ids.length > 1 ? { unit: "$ (2025)", id: "upkeep" } : lab[s.ids[0]]; return { label: s.label, loText: showOne(lr, s.lo), hiText: showOne(lr, s.hi), atLo: s.atLo, atHi: s.atHi }; });
  }
  var RUBRIC = [
    { id: "accounting", look: "One boundary for every cost and saving, in 2025 dollars; the school's result kept apart from the other customers' and the resource view; transfers kept apart from real costs." },
    { id: "uncertainty", look: "Low and high values for the inputs that matter, the main result as a range, the input that moves it most named." },
    { id: "trust", look: "Every number traces to a formula or to a log row with a source and a date; a second calculation (a year-by-year cash flow) checks the first." },
    { id: "realism", look: "Illustrative inputs labeled as such; what the spreadsheet leaves out listed (credits, resilience, solar wear, tariff changes)." }
  ];
  var api = { derive: derive, model: model, vals: vals, sensitivity: sensitivity, facts: facts, level: level, describe: describe, summary: summary, runnerData: runnerData,
    staticBrief: staticBrief, staticTasks: staticTasks, staticSolution: staticSolution, tornadoRows: tornadoRows, usd: usd, usdK: usdK, pct: pct, showVal: showVal, showRange: showRange, after: after, RUBRIC: RUBRIC, KEY: KEY, CODE: CODE,
    checkNumeric: CPK.checkNumeric };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX || !window.LX.Checkpoint) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.mount("ck-a-spreadsheet", function (live, data, root) {
    var D = data.ck_a_spreadsheet, F = facts(D), RD = runnerData(D);
    Object.defineProperty(RD, "solOpen", { get: function () { return LX.Checkpoint.solOpened(KEY); } });
    var cp = LX.Checkpoint(live, { data: RD, key: KEY, code: CODE, lessonId: "ck-a-spreadsheet",
      intro: ["Nine tasks on your own spreadsheet: two short texts you rate yourself, and seven answers marked at once.", "No hints. Build the spreadsheet first (about two hours). Each worked answer opens after your first answer; two wait until the tasks whose answers they name are answered too. Opening one early is recorded.",
        "A written text stays as you first submit it: that submission is the one you rate.", "Your answers and times stay in this browser. At the end, “Copy my results” gives a plain-text summary for you to share, with what you typed."],
      // gateAll: the full worked solution opens once all nine are answered; late: the shared late-answer rule, which the
      // runner adds to the intro
      lock: "#cka-lock", solution: "#cka-solution-body", gateAll: true, late: "practice", level: level, describe: describe, summary: summary, openFirst: "not-right" });
    var tw = document.getElementById("cka-tornado");
    if (tw && LX.Tornado) {
      tw.innerHTML = "";
      LX.Tornado(tw, { fmt: function (v) { return (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v) / 1000).toLocaleString("en-US") + "k"; }, fmtAlt: usd, measure: "the school's NPV", below: "var(--lx-bad)", above: "var(--lx-good)" })
        .draw({ base: F.res.npvSchool, rows: tornadoRows(D, F), lede: "**The school's NPV**: " + usd(F.res.npvSchool) + " at the base values (black line).", note: "One input at a time, the others at their base values. No swing changes the sign." });
    }
    var cr = document.getElementById("cka-course-rubric");
    if (cr && LX.Rubric) {
      cr.innerHTML = "";
      LX.Rubric(H("div", { class: "lx-xcard" }, cr), { id: "cka-rubric", code: CODE, title: "Rate your spreadsheet against the course rubric", lede: "The four competences this checkpoint shows, in the course's words.", competences: RUBRIC });
    }
    LX.demo(root, function (state) {
      if (state === "mid") { cp.show(1); return { view: "task 2" }; }
      if (state === "done") { cp.results(); return { view: "results" }; }
      // the solution state opens it as the lock button does, recorded (practice), never silently
      if (state === "solution") { cp.solutionNow(); var s = document.getElementById("solution"); if (s) s.scrollIntoView(); return { view: "solution" }; }
      return null;
    });
  });
})();
