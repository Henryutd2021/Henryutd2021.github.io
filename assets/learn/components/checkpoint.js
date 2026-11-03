/* checkpoint.js — LX.Checkpoint: the checkpoint runner (curriculum v2 §3.3 and §18.3; promoted from CK-F, W1 2026-11-02;
   CK-A, CK-M and CK-R reuse it). One task at a time; a clock that runs only while a task is on screen and the tab is
   visible; first-try recording; five task kinds; a rubric self-rating read from the page's rubric table; a results view;
   and a plain-text summary the tester copies into a form (nothing is sent anywhere).
   var cp = LX.Checkpoint(host, { data: D, key: "ckf-v1", code: "CK-F", lessonId: "ck-f-estimate",
     intro: ["Nine tasks, about 40 minutes: ...", "No hints. ...", "Your answers and times stay in this browser. ..."],
     rubric: "#ckf-rubric", lock: "#ckf-lock", solution: "#ckf-solution-body",
     chart: function (t, body) { LX.Checkpoint.lineChart(body, D.charts[t.chart], series, label); },
     estimateNote: "Two routes ... are in the <a href=\"#solution\">Worked solution</a> section below; it opens when you submit." });
   data (D): { version: "ck-f v1 (2 Nov 2026)",
               rule: { auto: 7, autoProficient: 5, autoStrong: 6, autoDeveloping: 3 (default 3), criteria: ["units", ...],
                       levels: ["Not yet", "Developing", "Proficient", "Strong"] },
               tasks: [{ id, kind, title, lesson (draws on), skill, prompt, solution (one or two sentences), ... }] }
               solution, points and choice feedback (why) take [[glossary-id|words]] marks; prompts stay plain (no hints)
     kinds   "choice"      options: [[value, text]], answer, why: {value: feedback}, chart (optional: drawn by o.chart)
             "order"       items: [[key, text]] in the right order; start: [keys], the shuffled start (↑ ↓ buttons)
             "numeric"     units: [[name, factor to MWh]] (0 or null: a unit of power, flagged as such); answer: {mwh, tol}
             "open-short"  points: [the sentences a full answer makes]; after submitting, the reader ticks the points made
             "estimate"    units (as numeric), range: [lo, hi] MWh a year, show: [lo, hi] as printed; low, high (above the low), unit and
                           three short texts (inputs and steps, the main uncertainty, a check); then a self-rating per rubric
                           criterion. The worked-solution section of the page opens on submit.
   Options:
     key         LX.store key of the attempt; an attempt stored under another data.version starts afresh. Keep it fixed
                 once testers use a checkpoint (CK-F: "ckf-v1"), so their summaries stay comparable.
     code        the checkpoint's code: the summary's first line is "Learn · <code> results (<version>)"
     lessonId    marked complete (LX.progress.done) when the level is Proficient or Strong
     intro       the overview card's sentences (default: a generic three)
     rubric      selector of the rubric table: <tr data-c="criterion id"><th>name</th><td>Not yet</td>...<td>Strong</td></tr>
     lock        selector of the box shown until the estimate is submitted; its <button> opens the solution early (recorded),
                 as does the estimate task's own "Show the worked solution now"; "Start again" shuts it again
     solution    selector of the worked-solution block; give it class lx-ck-gated in the page, so it stays shut with
                 JavaScript until opened (without JavaScript it shows)
     chart       function (task, body): draws a chart task's chart (LX.Checkpoint.lineChart helps)
     estimateNote  HTML for the estimate's in-task solution box (default: a pointer to the Worked solution section)
     checks      { choice, order, numeric, estimate }: replace a pure check (same arguments and result fields)
     level, summary  replace the pure level rule or the summary text (same arguments)
   Returns { show(i), results(), intro(), state() }. A stored, finished attempt opens on the results (unless the address
   has a #hash); otherwise the overview.
   Measures, per task (stored under data.tasks ids): ms (active time), msFirst (time to the first answer), tries, first
   (first answer right; for open-short, all points ticked), solFirst (solution opened before answering), skipped, answer.
   Keyboard: every control is a native button, input, select or radio; the task's prompt takes focus on each new task; the
   order task's ↑ ↓ buttons keep focus on the moved item. The results table becomes labelled lines on phones.
   Text version: LX.Checkpoint.lineChart adds a table of the hourly values.
   Pure (Node: module.exports): task, checkChoice, checkOrder, checkNumeric, checkEstimate, level, summary, fmtMs, firstWord.
   level and summary find the explanation and the estimate as the first "open-short" and the first "estimate" task. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure part
  function task(D, id) { for (var i = 0; i < D.tasks.length; i++) if (D.tasks[i].id === id) return D.tasks[i]; return null; }
  function ofKind(D, kind) { for (var i = 0; i < D.tasks.length; i++) if (D.tasks[i].kind === kind) return D.tasks[i]; return null; }
  function checkChoice(t, v) { return { right: v === t.answer, why: (t.why || {})[v] || "" }; }
  function checkOrder(t, order) {
    var want = t.items.map(function (x) { return x[0]; }), at = order.map(function (k, i) { return k === want[i]; });
    return { right: at.every(Boolean), places: at, n: at.filter(Boolean).length };
  }
  function unitFactor(t, u) { for (var i = 0; i < t.units.length; i++) if (t.units[i][0] === u) return t.units[i][1]; return undefined; }
  function checkNumeric(t, value, unit) {
    var f = unitFactor(t, unit);
    if (!(value > 0)) return { right: false, msg: "Enter a positive number." };
    if (f === 0 || f === null) return { right: false, power: true, msg: unit + " measures power, a rate. Energy over a year needs MWh or GWh." };
    var mwh = value * f, a = t.answer, rel = Math.abs(mwh - a.mwh) / a.mwh;
    return { right: rel <= a.tol, mwh: mwh, rel: rel,
      msg: rel <= a.tol ? "Right: about " + Math.round(a.mwh / 1000) + " GWh." : mwh > a.mwh * 2.5 ? "Too high. Did every hour count at full output?" : mwh < a.mwh / 2.5 ? "Too low. Check the hours in a year and the units." : "Close, but more than 10% off. Recheck the multiplication." };
  }
  // the estimate: units, order, and how the range sits against the worked solution's range (MWh a year). A range needs
  // a high above its low: one number (low = high) shows no uncertainty, which the rubric marks Not yet.
  function checkEstimate(t, low, high, unit) {
    var f = unitFactor(t, unit), out = { unitsOk: f > 0, ordered: low > 0 && high > low };
    if (f === null) out.unitMsg = unit + " is a unit of power. Electricity used over a year is energy: kWh, MWh or GWh per year.";
    else if (!(f > 0)) out.unitMsg = "Choose a unit.";
    else out.unitMsg = "Energy per year: the right kind of unit.";
    if (out.unitsOk && out.ordered) {
      var lo = low * f, hi = high * f, R = t.range;
      out.lo = lo; out.hi = hi; out.overlaps = lo <= R[1] && hi >= R[0]; out.width = lo > 0 ? hi / lo : Infinity;
      if (out.overlaps) out.rangeMsg = "Your range overlaps the worked solution's (about " + t.show[0] + " to " + t.show[1] + " MWh a year).";
      else if (hi < R[0]) out.rangeMsg = "Your range lies below the worked solution's, by about " + Math.round(R[0] / hi) + " times at its closest. Compare your inputs with its two routes.";
      else out.rangeMsg = "Your range lies above the worked solution's, by about " + Math.round(lo / R[1]) + " times at its closest. Compare your inputs with its two routes.";
      if (out.width > 10) out.rangeMsg += " Your high is more than ten times your low: narrow it with a stated input.";
    } else if (!out.ordered) out.rangeMsg = low > 0 && high === low
      ? "Your low and high are the same number, so they show no range. Give a high above your low that brackets your uncertainty."
      : "Give a low and a high value, with the high above the low.";
    return out;
  }
  function isAuto(t) { return t.kind === "choice" || t.kind === "order" || t.kind === "numeric"; }
  // the published rule: auto-marked items right on the first try, the estimate's self-ratings, the explanation's points.
  // Levels by index in rule.levels: 0 Not yet, 1 Developing, 2 Proficient, 3 Strong.
  function level(D, st) {
    var R = D.rule, autoIds = D.tasks.filter(isAuto).map(function (t) { return t.id; });
    var k = autoIds.filter(function (id) { return st.tasks[id] && st.tasks[id].first === true; }).length;
    var exT = ofKind(D, "open-short"), esT = ofKind(D, "estimate");
    var ex = (exT && st.tasks[exT.id]) || {}, es = (esT && st.tasks[esT.id]) || {}, rt = es.rating || {};
    var crit = R.criteria.map(function (c) { return rt[c] != null ? R.levels.indexOf(rt[c]) : -1; });
    var estMin = Math.min.apply(null, crit), estStrong = crit.filter(function (x) { return x === 3; }).length;
    var pts = ex.points || [], explainOk = pts.length > 0 && pts.length === (exT && exT.points ? exT.points.length : 2) && pts.every(Boolean);
    var complete = autoIds.every(function (id) { return st.tasks[id] && st.tasks[id].first != null; }) && estMin >= 0 && ex.points != null;
    var lv = R.levels[0];
    if (k >= R.autoStrong && estMin >= 2 && estStrong >= 2 && explainOk) lv = R.levels[3];
    else if (k >= R.autoProficient && estMin >= 2 && explainOk) lv = R.levels[2];
    else if (k >= (R.autoDeveloping != null ? R.autoDeveloping : 3) && estMin >= 1) lv = R.levels[1];
    return { level: lv, auto: k, autoOf: autoIds.length, estMin: estMin, explainOk: explainOk, complete: complete };
  }
  function fmtMs(ms) {
    if (ms == null) return "–";
    var s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m ? m + " min " + (s % 60 < 10 ? "0" : "") + (s % 60) + " s" : s + " s";
  }
  function firstWord(D, t, r) {
    if (!r || r.first == null) return r && r.skipped ? "skipped" : "not answered";
    if (t.kind === "open-short") return (r.points || []).filter(Boolean).length + " of " + (t.points ? t.points.length : 2) + " points (self)";
    if (t.kind === "estimate") return "submitted";
    return r.first ? "right" : "not right";
  }
  // the copied summary: keep its format fixed once testers use it (their summaries are compared across versions)
  function summary(D, st, env, o) {
    env = env || {}; o = o || {};
    var L = (o.level || level)(D, st), total = 0, lines = [];
    D.tasks.forEach(function (t) { var r = st.tasks[t.id]; if (r && r.ms) total += r.ms; });
    lines.push("Learn · " + (o.code || "Checkpoint") + " results (" + D.version + ")");
    lines.push("Finished: " + (st.finished || "not yet") + " (this device's clock) · active time " + fmtMs(total));
    lines.push("Level by the published rule: " + L.level + " (auto-marked right on the first try: " + L.auto + " of " + L.autoOf +
      "; estimate's lowest self-rating: " + (L.estMin >= 0 ? D.rule.levels[L.estMin] : "not rated") + "; explanation: " + (L.explainOk ? "both points" : "not both points") + ")");
    lines.push("");
    lines.push("# | Task | Draws on | First answer | Tries | Time to first answer | Time on task | Solution opened before answering");
    D.tasks.forEach(function (t, i) {
      var r = st.tasks[t.id] || {};
      lines.push((i + 1) + " | " + t.title + " | " + t.lesson + " | " + firstWord(D, t, r) + " | " + (r.tries || 0) + " | " + fmtMs(r.msFirst) + " | " + fmtMs(r.ms) + " | " + (r.solFirst ? "yes" : "no"));
    });
    var esT = ofKind(D, "estimate"), es = esT && st.tasks[esT.id];
    if (es && es.answer) {
      var a = es.answer;
      lines.push("");
      lines.push("Estimate: " + a.low + " to " + a.high + " " + a.unit + (es.check ? " · " + (es.check.overlaps ? "overlaps" : "does not overlap") + " the worked range" : ""));
      if (es.rating) lines.push("Self-rating: " + D.rule.criteria.map(function (c) { return c + " " + (es.rating[c] || "not rated"); }).join(", "));
      ["reasoning", "uncertainty", "check"].forEach(function (k) { if (a[k]) lines.push("Your " + k + ": " + String(a[k]).replace(/\s+/g, " ").slice(0, 600)); });
    }
    var exT = ofKind(D, "open-short"), ex = exT && st.tasks[exT.id];
    if (ex && ex.answer) lines.push("Your explanation (task " + (D.tasks.indexOf(exT) + 1) + "): " + String(ex.answer).replace(/\s+/g, " ").slice(0, 400));
    lines.push("");
    lines.push("Screen width " + (env.width || "?") + " px. Kept in this browser only; copied by you.");
    return lines.join("\n");
  }

  var pure = { task: task, checkChoice: checkChoice, checkOrder: checkOrder, checkNumeric: checkNumeric, checkEstimate: checkEstimate,
    level: level, summary: summary, fmtMs: fmtMs, firstWord: firstWord };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, E = LX.H, S = LX.S;
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function q(sel) { return !sel ? null : typeof sel === "string" ? document.querySelector(sel) : sel; }

  // a small 24-hour line chart for chart tasks, with a text version. C: {yMin, yMax} (the axis need not start at zero:
  // a task may ask the reader to notice it); series: [{label, color, v: [24 values], dash}]
  function lineChart(host, C, series, label) {
    var w = E("div", { class: "lx-ck-chart" }, host), legend = E("div", { class: "lx-legend" }, host);
    var alt = E("details", { class: "lx-textalt" }, host); E("summary", { text: "Text version" }, alt);
    var tb = E("table", { class: "lx-mini-table" }, E("div", { class: "lx-scroll-x" }, alt)), hr = E("tr", null, E("thead", null, tb));
    E("th", { scope: "col", text: "Hour" }, hr); series.forEach(function (s) { E("th", { scope: "col", text: s.label + " (MW)" }, hr); });
    var body = E("tbody", null, tb);
    for (var t = 0; t < 24; t++) { var tr = E("tr", null, body); E("td", { text: (t < 10 ? "0" : "") + t + ":00" }, tr); series.forEach(function (s) { E("td", { text: s.v[t] }, tr); }); }
    series.forEach(function (s) { var sp = E("span", null, legend); E("i", { class: s.dash ? "line" : "", style: "--c:" + s.color }, sp); E("span", { text: s.label }, sp); });
    var svg = null;
    function render() {
      var W = Math.max(280, w.clientWidth || 600), Hh = W < 480 ? 200 : 240, m = { l: 48, r: 10, t: 12, b: 26 }, iw = W - m.l - m.r, ih = Hh - m.t - m.b;
      var y = function (v) { return m.t + ih - (v - C.yMin) / (C.yMax - C.yMin) * ih; }, x = function (t) { return m.l + t / 23 * iw; };
      if (svg) svg.remove();
      svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": label }, w);
      for (var v = C.yMin; v <= C.yMax + 1e-9; v += (C.yMax - C.yMin) / 4) {
        S("path", { d: "M" + m.l + " " + y(v) + " H" + (W - m.r), stroke: "var(--lx-line)", "stroke-width": 1 }, svg);
        S("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = Math.round(v) + " MW";
      }
      (W < 480 ? [0, 6, 12, 18] : [0, 6, 12, 18, 23]).forEach(function (h) {
        S("text", { x: x(h), y: Hh - 7, "text-anchor": h === 0 ? "start" : h === 23 ? "end" : "middle", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = (h < 10 ? "0" : "") + h + ":00";
      });
      series.forEach(function (s) {
        var d = ""; s.v.forEach(function (val, t) { d += (t ? " L" : "M") + x(t).toFixed(1) + " " + y(val).toFixed(1); });
        S("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 2.6, "stroke-dasharray": s.dash ? "6 4" : null, "stroke-linejoin": "round" }, svg);
      });
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(w)) render(); }).observe(w);
    LX.onTheme(function () { if (LX.visible(w)) render(); });
    setTimeout(render, 0);
    return { render: render };
  }

  LX.Checkpoint = function (host, o) {
    var D = o.data, KEY = o.key, N = D.tasks.length, code = o.code || "Checkpoint";
    var CK = o.checks || {}, cChoice = CK.choice || checkChoice, cOrder = CK.order || checkOrder, cNum = CK.numeric || checkNumeric, cEst = CK.estimate || checkEstimate;
    var levelOf = o.level || level, summaryOf = o.summary || function (D, st, env) { return summary(D, st, env, { code: code, level: o.level }); };
    var esT = ofKind(D, "estimate");
    function fresh() { return { version: D.version, started: null, finished: null, cur: 0, tasks: {} }; }
    var st = LX.store.get(KEY, null);
    if (!st || st.version !== D.version) st = fresh();
    var wrap = E("div", { class: "lx-ck" }, host), clock = { id: null, t0: null };
    function save() { LX.store.set(KEY, st); }
    function rec(id) { if (!st.tasks[id]) st.tasks[id] = { ms: 0, msFirst: null, tries: 0, first: null, solFirst: false }; return st.tasks[id]; }
    // ---- the clock: runs only while a task is on screen and the tab is visible
    function tick() { if (clock.id && clock.t0 != null) { var r = rec(clock.id), t = now(); r.ms += t - clock.t0; clock.t0 = t; } }
    function startClock(id) { tick(); clock.id = id; clock.t0 = document.visibilityState === "hidden" ? null : now(); }
    function stopClock() { tick(); clock.id = null; clock.t0 = null; save(); }
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") { tick(); clock.t0 = null; save(); } else if (clock.id) clock.t0 = now(); });
    window.addEventListener("pagehide", function () { tick(); save(); });
    function answered(id, right, answer, extra) {
      tick(); var r = rec(id); r.tries += 1;
      if (r.first == null) { r.first = right; r.msFirst = r.ms; }
      if (answer !== undefined) r.answer = answer;
      if (extra) for (var k in extra) r[k] = extra[k];
      save(); return r;
    }

    // ---- views: intro, a task, results
    function intro() {
      stopClock(); wrap.innerHTML = "";
      var c = E("div", { class: "lx-ck-card" }, wrap);
      E("p", { class: "lx-eyebrow", text: "How this checkpoint works" }, c);
      var ul = E("ul", { class: "lx-ck-intro" }, c);
      (o.intro || [N + " tasks, one at a time.", "No hints. Each worked solution opens after your first answer; you may open it earlier, and that is recorded.",
        "Your answers and times stay in this browser. At the end, “Copy my results” gives you a summary to paste into a form."]).forEach(function (s) { E("li", { text: s }, ul); });
      var row = E("div", { class: "lx-ck-row" }, c), started = !!st.started;
      E("button", { type: "button", class: "lx-btn", html: (started ? "Resume at task " + (st.cur + 1) : "Start the checkpoint") + LX.icon("arrow"), onclick: function () { if (!st.started) { st.started = new Date().toISOString(); save(); } show(st.cur); } }, row);
      if (started) E("button", { type: "button", class: "lx-btn ghost", text: "Start again (clears this browser's answers)", onclick: reset }, row);
    }
    function reset() {
      if (!window.confirm("Clear your " + code + " answers and times in this browser?")) return;
      st = fresh(); save(); lockSolution(); intro();
    }
    function show(i) {
      st.cur = i; save(); wrap.innerHTML = "";
      var t = D.tasks[i], r = rec(t.id), qid = LX.uid("ck-q");
      var c = E("div", { class: "lx-ck-card", role: "group", "aria-labelledby": qid }, wrap);
      var top = E("div", { class: "lx-ck-top" }, c);
      var dots = E("div", { class: "lx-dots", "aria-hidden": "true" }, top);
      for (var d = 0; d < N; d++) E("i", { class: d < i ? "done" : d === i ? "cur" : "" }, dots);
      E("span", { class: "lx-ck-tag", text: "Task " + (i + 1) + " of " + N + " · " + t.skill + " · draws on " + t.lesson }, top);
      var qp = E("p", { class: "lx-ck-q", id: qid, tabindex: "-1", text: t.prompt }, c);
      var body = E("div", { class: "lx-ck-body" }, c), fb = E("div", { "aria-live": "polite" }, c);
      var sol = E("details", { class: "lx-ck-sol", hidden: r.first == null && !r.solFirst }, c);
      E("summary", { text: "Worked solution" }, sol);
      solution(t, sol);
      var early = E("button", { type: "button", class: "lx-link", text: "Show the worked solution now (recorded as opened before answering)", hidden: r.first != null || r.solFirst,
        onclick: function () { rec(t.id).solFirst = true; save(); sol.hidden = false; sol.open = true; early.hidden = true; if (t === esT) openSolution(); } }, c);
      function unlock() { sol.hidden = false; early.hidden = true; }
      ({ "choice": choice, "order": order, "numeric": numeric, "open-short": openShort, "estimate": estimate })[t.kind](t, body, fb, unlock);
      var foot = E("div", { class: "lx-ck-foot" }, c);
      E("button", { type: "button", class: "lx-btn ghost small", text: i ? "Back" : "Overview", onclick: function () { if (i) show(i - 1); else intro(); } }, foot);
      E("button", { type: "button", class: "lx-btn small", html: (i === N - 1 ? "See my results" : "Next task") + LX.icon("arrow"),
        onclick: function () { var rr = rec(t.id); if (rr.first == null) rr.skipped = true; save(); if (i === N - 1) results(); else show(i + 1); } }, foot);
      startClock(t.id);
      qp.focus({ preventScroll: true });
      c.scrollIntoView({ block: "nearest", behavior: LX.reduced() ? "auto" : "smooth" });
      LX.emit("layout");
    }
    function feedback(fb, ok, html) { fb.innerHTML = ""; E("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + html + "</div>" }, fb); }
    function solution(t, sol) {
      if (t.kind === "estimate") { E("p", { html: o.estimateNote || "The worked solution and the marking guide are in the <a href=\"#solution\">Worked solution</a> section below; it opens when you submit." }, sol); return; }
      E("p", { html: LX.rich(t.solution) }, sol);   // [[glossary-id|words]] marks work here (shown only after answering or on request)
      if (t.kind === "open-short") { var ul = E("ul", { class: "lx-ck-solpts" }, sol); t.points.forEach(function (p) { E("li", { html: LX.rich(p) }, ul); }); }
    }
    function choice(t, body, fb, unlock) {
      if (t.chart && o.chart) o.chart(t, body);
      var r = rec(t.id), box = E("div", { class: "lx-ck-opts", role: "group", "aria-label": "Answers" }, body), btns = {};
      t.options.forEach(function (op) {
        btns[op[0]] = E("button", { type: "button", class: "lx-choice", "aria-pressed": r.answer === op[0] ? "true" : "false", text: op[1], onclick: function () {
          var res = cChoice(t, op[0]);
          answered(t.id, res.right, op[0]);
          Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === op[0] ? "true" : "false"); btns[k].classList.toggle("right", res.right && k === op[0]); btns[k].classList.toggle("wrong", !res.right && k === op[0]); });
          feedback(fb, res.right, LX.rich(res.why) + (res.right ? "" : " Try again, or open the worked solution."));
          unlock();
        } }, box);
      });
    }
    function order(t, body, fb, unlock) {
      var r = rec(t.id), cur = (r.answer && r.answer.length === t.items.length) ? r.answer.slice() : t.start.slice();
      var text = {}; t.items.forEach(function (x) { text[x[0]] = x[1]; });
      var ol = E("ol", { class: "lx-ck-order" }, body), row = E("div", { class: "lx-ck-row" }, body);
      var go = E("button", { type: "button", class: "lx-btn small", text: "Check the order" }, row), marks = null;
      function paint(focusKey, dir) {
        ol.innerHTML = "";
        cur.forEach(function (k, i) {
          var li = E("li", { class: marks ? (marks[i] ? "ok" : "no") : "" }, ol);
          E("span", { class: "n", text: (i + 1) + "." }, li); E("span", { text: text[k] }, li);
          var mv = E("span", { class: "mv" }, li);
          var up = E("button", { type: "button", "aria-label": "Move up: " + text[k], text: "↑", onclick: function () { move(i, -1); } }, mv);
          var dn = E("button", { type: "button", "aria-label": "Move down: " + text[k], text: "↓", onclick: function () { move(i, 1); } }, mv);
          up.disabled = i === 0; dn.disabled = i === cur.length - 1;
          if (k === focusKey) (dir < 0 ? (up.disabled ? dn : up) : (dn.disabled ? up : dn)).focus();
        });
      }
      function move(i, d) { var j = i + d; if (j < 0 || j >= cur.length) return; var k = cur[i]; cur[i] = cur[j]; cur[j] = k; marks = null; paint(k, d); }
      go.addEventListener("click", function () {
        var res = cOrder(t, cur); marks = res.places; answered(t.id, res.right, cur.slice()); paint();
        feedback(fb, res.right, res.right ? "That is the sequence." : res.n + " of " + cur.length + " in the right place (green). Try again, or open the worked solution.");
        unlock();
      });
      paint();
    }
    function unitSelect(host, t, chosen) {
      var f = E("div", { class: "lx-ck-field" }, host), id = LX.uid("ck");
      E("label", { for: id, text: "Unit" }, f);
      var sel = E("select", { id: id }, f);
      E("option", { value: "", text: "Choose…" }, sel);
      t.units.forEach(function (u) { E("option", { value: u[0], text: u[0], selected: chosen === u[0] ? "selected" : null }, sel); });
      return sel;
    }
    function numeric(t, body, fb, unlock) {
      var r = rec(t.id), g = E("div", { class: "lx-ck-grid2" }, body);
      var f1 = E("div", { class: "lx-ck-field" }, g), id1 = LX.uid("ck");
      E("label", { for: id1, text: "Your answer" }, f1);
      var inp = E("input", { type: "number", id: id1, min: "0", step: "any", inputmode: "decimal", value: r.answer ? r.answer.value : "" }, f1);
      var sel = unitSelect(g, t, r.answer && r.answer.unit);
      var row = E("div", { class: "lx-ck-row" }, body);
      E("button", { type: "button", class: "lx-btn small", text: "Check", onclick: function () {
        if (!sel.value) { feedback(fb, false, "Choose a unit first."); return; }
        var res = cNum(t, parseFloat(inp.value), sel.value);
        answered(t.id, res.right, { value: parseFloat(inp.value), unit: sel.value });
        feedback(fb, res.right, LX.esc(res.msg) + (res.right ? "" : " Try again, or open the worked solution."));
        unlock();
      } }, row);
    }
    function openShort(t, body, fb, unlock) {
      var r = rec(t.id), id = LX.uid("ck");
      E("label", { for: id, class: "lx-sr", text: "Your explanation" }, body);
      var ta = E("textarea", { id: id, rows: "3", placeholder: "Your explanation" }, body); ta.value = r.answer || "";
      var row = E("div", { class: "lx-ck-row" }, body), self = E("div", { hidden: r.points == null }, body);
      E("p", { class: "lx-hint", text: "Compare with the worked solution, then tick each point your answer makes." }, self);
      var ul = E("ul", { class: "lx-ck-points" }, self), boxes = t.points.map(function (p, k) {
        var lab = E("label", null, E("li", null, ul)), cb = E("input", { type: "checkbox" }, lab); cb.checked = !!(r.points && r.points[k]);
        E("span", { html: LX.rich(p) }, lab);
        cb.addEventListener("change", function () { var rr = rec(t.id); rr.points = boxes.map(function (b) { return b.checked; }); rr.first = rr.points.every(Boolean); save(); });
        return cb;
      });
      E("button", { type: "button", class: "lx-btn small", text: "Submit my explanation", onclick: function () {
        if (!ta.value.trim()) { feedback(fb, false, "Write a sentence or two first."); return; }
        var rr = answered(t.id, false, ta.value.trim()); rr.points = rr.points || t.points.map(function () { return false; }); rr.first = rr.points.every(Boolean); save();
        self.hidden = false; unlock(); fb.innerHTML = "";
        E("div", { class: "lx-saw", html: LX.icon("check") + "<div><b>Submitted.</b> Open the worked solution below and tick the points you made.</div>" }, fb);
      } }, row);
    }
    function estimate(t, body, fb, unlock) {
      var r = rec(t.id), a = r.answer || {}, g = E("div", { class: "lx-ck-grid2" }, body), F = {};
      function field(host, key, label, type) {
        var f = E("div", { class: "lx-ck-field" }, host), id = LX.uid("ck");
        E("label", { for: id, text: label }, f);
        var el = type === "textarea" ? E("textarea", { id: id, rows: "2" }, f) : E("input", { type: "number", id: id, min: "0", step: "any", inputmode: "decimal" }, f);
        el.value = a[key] != null ? a[key] : ""; F[key] = el; return el;
      }
      field(g, "low", "Low value"); field(g, "high", "High value");
      var sel = unitSelect(g, t, a.unit);
      field(body, "reasoning", "How you got there: your inputs and steps", "textarea");
      field(body, "uncertainty", "The main uncertainty, and why it matters most", "textarea");
      field(body, "check", "One way to check your answer", "textarea");
      var row = E("div", { class: "lx-ck-row" }, body);
      fb = E("div", { class: "lx-ck-fb", "aria-live": "polite" }, body);
      var out = E("div", { class: "lx-ck-rating" }, body);
      E("button", { type: "button", class: "lx-btn small", text: "Submit my estimate", onclick: function () {
        var lo = parseFloat(F.low.value), hi = parseFloat(F.high.value);
        if (!sel.value || !(lo > 0) || !(hi > 0)) { fb.innerHTML = ""; E("div", { class: "lx-saw no", html: LX.icon("question") + "<div>Give a low and a high value and choose a unit.</div>" }, fb); return; }
        var ans = { low: lo, high: hi, unit: sel.value, reasoning: F.reasoning.value.trim(), uncertainty: F.uncertainty.value.trim(), check: F.check.value.trim() };
        var chk = cEst(t, lo, hi, sel.value);
        // a range needs its high above its low: say why and wait (not recorded as an answer, like an empty field)
        if (!chk.ordered) { fb.innerHTML = ""; E("div", { class: "lx-saw no", html: LX.icon("question") + "<div><b>Range.</b> " + LX.esc(chk.rangeMsg) + "</div>" }, fb); return; }
        answered(t.id, chk.unitsOk && chk.ordered && !!chk.overlaps, ans, { check: chk });
        fb.innerHTML = "";
        E("div", { class: "lx-saw" + (chk.unitsOk ? "" : " no"), html: LX.icon(chk.unitsOk ? "check" : "question") + "<div><b>Units.</b> " + LX.esc(chk.unitMsg) + "</div>" }, fb);
        if (chk.rangeMsg) E("div", { class: "lx-saw" + (chk.overlaps ? "" : " no"), html: LX.icon(chk.overlaps ? "check" : "question") + "<div><b>Range.</b> " + LX.esc(chk.rangeMsg) + "</div>" }, fb);
        openSolution(); rate(out);
      } }, row);
      if (r.answer) rate(out);
      function rate(host) {
        host.innerHTML = "";
        E("p", { class: "lx-eyebrow", text: "Rate your estimate on the rubric" }, host);
        E("p", { class: "lx-hint", html: "Read the <a href=\"#solution\">worked solution</a> and the <a href=\"#rubric\">rubric</a>, then pick a level for each criterion." }, host);
        var box = E("div", { class: "lx-ck-rate" }, host), rr = rec(t.id); rr.rating = rr.rating || {};
        RUBRIC.forEach(function (cr) {
          var fs = E("fieldset", null, box); E("legend", { text: cr.name }, fs);
          var opts = E("div", { class: "opts" }, fs), anc = E("p", { class: "anchor", "aria-live": "polite" }, fs), nm = LX.uid("ck-" + cr.id);
          D.rule.levels.forEach(function (lv, k) {
            var lab = E("label", null, opts), rb = E("input", { type: "radio", name: nm, value: lv }, lab); E("span", { text: lv }, lab);
            rb.checked = rr.rating[cr.id] === lv; if (rb.checked) anc.textContent = cr.levels[k];
            rb.addEventListener("change", function () { rr.rating[cr.id] = lv; anc.textContent = cr.levels[k]; save(); });
          });
        });
        unlock();
      }
    }
    function openSolution() {
      var lock = q(o.lock), body = q(o.solution);
      if (lock) lock.hidden = true; if (body) body.classList.add("is-open");
    }
    // "Start again": the page's worked solution shuts again until the new attempt's estimate is submitted (or opened early)
    function lockSolution() {
      var lock = q(o.lock), body = q(o.solution);
      if (lock && body) { lock.hidden = false; body.classList.remove("is-open"); }
    }
    function results() {
      stopClock();
      if (!st.finished) { var dt = new Date(), p2 = function (x) { return (x < 10 ? "0" : "") + x; };
        st.finished = dt.getFullYear() + "-" + p2(dt.getMonth() + 1) + "-" + p2(dt.getDate()) + " " + p2(dt.getHours()) + ":" + p2(dt.getMinutes()); save(); }
      wrap.innerHTML = "";
      var L = levelOf(D, st), c = E("div", { class: "lx-ck-card" }, wrap);
      E("p", { class: "lx-eyebrow", text: "Your results (this browser only)" }, c);
      E("p", { class: "lx-ck-level", tabindex: "-1", text: "Level: " + L.level }, c).focus({ preventScroll: true });
      E("p", { text: "Auto-marked tasks right on the first try: " + L.auto + " of " + L.autoOf + ". Estimate: lowest self-rating " + (L.estMin >= 0 ? D.rule.levels[L.estMin] : "not rated yet") + ". Explanation: " + (L.explainOk ? "both points." : "not both points ticked.") + (L.complete ? "" : " Some tasks are not finished; the level counts them as not right.") }, c);
      var sc = E("div", { class: "lx-scroll-x" }, c), tb = E("table", { class: "lx-ck-res" }, sc), hr = E("tr", null, E("thead", null, tb));
      ["Task", "First answer", "Tries", "Time to first answer", "Solution first"].forEach(function (h) { E("th", { scope: "col", text: h }, hr); });
      var bd = E("tbody", null, tb);
      D.tasks.forEach(function (t, i) {
        var r = st.tasks[t.id] || {}, tr = E("tr", null, bd);
        var td = E("td", { "data-l": "Task" }, tr); E("button", { type: "button", class: "lx-link", text: (i + 1) + ". " + t.title, onclick: function () { show(i); } }, td);
        E("td", { "data-l": "First answer", text: firstWord(D, t, r) }, tr);
        E("td", { class: "n", "data-l": "Tries", text: String(r.tries || 0) }, tr);
        E("td", { class: "n", "data-l": "Time to first answer", text: fmtMs(r.msFirst) }, tr);
        E("td", { "data-l": "Solution first", text: r.solFirst ? "yes" : "no" }, tr);
      });
      var text = summaryOf(D, st, { width: window.innerWidth });
      var row = E("div", { class: "lx-ck-row" }, c), msg = E("p", { class: "lx-hint", "aria-live": "polite" }, c);
      var id = LX.uid("ck"); E("label", { for: id, class: "lx-sr", text: "Your results as text" }, c);
      var ta = E("textarea", { id: id, class: "lx-ck-out", readonly: "readonly", rows: "10" }, c); ta.value = text;
      E("button", { type: "button", class: "lx-btn small", html: LX.icon("check") + "Copy my results", onclick: function () {
        // the clipboard API where allowed; else select the text and copy, or ask the reader to copy it by hand
        function fallback() { ta.focus(); ta.select(); try { document.execCommand("copy"); msg.textContent = "Copied. Paste it into the tester form."; } catch (e) { msg.textContent = "Select the text below and copy it."; } }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { msg.textContent = "Copied. Paste it into the tester form."; }, fallback);
        else fallback();
      } }, row);
      E("button", { type: "button", class: "lx-btn ghost small", text: "Back to the tasks", onclick: function () { show(0); } }, row);
      E("button", { type: "button", class: "lx-btn ghost small", text: "Start again", onclick: reset }, row);
      if (o.lessonId && (L.level === D.rule.levels[2] || L.level === D.rule.levels[3])) LX.progress.done(o.lessonId);
      LX.emit("layout");
    }
    // the rubric, read from the page's table (one source for the page and the self-rating)
    var RUBRIC = [], rt = q(o.rubric);
    if (rt) rt.querySelectorAll("tbody tr").forEach(function (tr) {
      var cells = tr.querySelectorAll("th, td");
      RUBRIC.push({ id: tr.getAttribute("data-c"), name: cells[0].textContent.trim(), levels: [1, 2, 3, 4].map(function (k) { return cells[k] ? cells[k].textContent.trim() : ""; }) });
    });
    // the worked-solution section: shut until the estimate is submitted (or opened on purpose, which is recorded)
    var lock = q(o.lock), solBody = q(o.solution);
    if (lock && solBody) {
      var er = esT && st.tasks[esT.id], done = er && (er.first != null || er.solFirst);
      lock.hidden = !!done; if (done) solBody.classList.add("is-open");
      var ob = lock.querySelector("button");
      if (ob) ob.addEventListener("click", function () { if (esT) { var r = rec(esT.id); if (r.first == null) r.solFirst = true; save(); } openSolution(); });
    }
    if (st.finished && !location.hash) results(); else intro();
    return { show: show, results: results, intro: intro, state: function () { return st; } };
  };
  Object.keys(pure).forEach(function (k) { LX.Checkpoint[k] = pure[k]; });
  LX.Checkpoint.lineChart = lineChart;
})();
