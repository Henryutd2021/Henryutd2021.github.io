// ck-f-estimate.js — CK-F, the Foundations checkpoint (curriculum v2 §3.3; wave W1, 2026-11-02).
//
// Nine tasks on unfamiliar situations across T0-T6 and N1 (assets/learn/data/ck-f-estimate.json): one open explanation,
// seven auto-marked items (choices, an ordering, a number with units) and the main estimate (a town's school buses go
// electric: a range with units, the main uncertainty and a check), self-rated on the published rubric. No hints: each
// task's worked solution opens after the first answer, or earlier on request, which is recorded.
//
// Measured for the W1 validation (curriculum §18.3), in this browser only (LX.store, key "ckf-v1"): active time per task
// (the clock runs only while the task is on screen and the tab is visible), time to the first answer, whether the first
// answer was right, the number of tries, and whether the solution was opened before answering. "Copy my results" puts a
// plain-text summary on the clipboard for the tester to paste into a form; nothing is sent anywhere.
//
// The pure part (checks, the level rule, the summary text) is exported for _tests/learn/test_ck-f-estimate.js.
(function () {
  "use strict";
  var KEY = "ckf-v1";

  // ---------------------------------------------------------------- pure part
  function task(D, id) { for (var i = 0; i < D.tasks.length; i++) if (D.tasks[i].id === id) return D.tasks[i]; return null; }
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
  // the main estimate: units, order, and how the range sits against the worked solution's range (MWh a year)
  function checkEstimate(t, low, high, unit) {
    var f = unitFactor(t, unit), out = { unitsOk: f > 0, ordered: low > 0 && high >= low };
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
    } else if (!out.ordered) out.rangeMsg = "Give a low and a high value, with the low no larger than the high.";
    return out;
  }
  // the worked solution's numbers (two routes)
  function worked(D) {
    var w = D.worked, a = w.routeA, b = w.routeB;
    var A = a.kwhPerMile.map(function (k) { return w.buses * a.milesPerDay * a.days * k / 1000; });
    var B = b.kwhPerMile.map(function (k) { return w.buses * b.milesPerYear * k / 1000; });
    var mid = (Math.min(A[0], B[0]) + Math.max(A[1], B[1])) / 2;
    return { A: A, B: B, lo: Math.min(A[0], B[0]), hi: Math.max(A[1], B[1]), mid: mid, homes: mid * 1000 / w.homeKWh,
      share: mid / (w.townGWh * 1000), daily: a.milesPerDay * a.kwhPerMile[1] };
  }
  // the published rule: auto-marked items right on the first try, plus the two open items
  var RANK = { "Not yet": 0, "Developing": 1, "Proficient": 2, "Strong": 3 };
  function level(D, st) {
    var autoIds = D.tasks.filter(function (t) { return t.kind === "choice" || t.kind === "order" || t.kind === "numeric"; }).map(function (t) { return t.id; });
    var k = autoIds.filter(function (id) { return st.tasks[id] && st.tasks[id].first === true; }).length;
    var ex = st.tasks["t0-explain"] || {}, es = st.tasks["est-buses"] || {}, rt = es.rating || {}, R = D.rule;
    var crit = R.criteria.map(function (c) { return rt[c] != null ? RANK[rt[c]] : -1; });
    var estMin = Math.min.apply(null, crit), estStrong = crit.filter(function (x) { return x === 3; }).length;
    var explainOk = (ex.points || []).length === 2 && ex.points.every(Boolean);
    var complete = autoIds.every(function (id) { return st.tasks[id] && st.tasks[id].first != null; }) && estMin >= 0 && ex.points != null;
    var lv = "Not yet";
    if (k >= R.autoStrong && estMin >= 2 && estStrong >= 2 && explainOk) lv = "Strong";
    else if (k >= R.autoProficient && estMin >= 2 && explainOk) lv = "Proficient";
    else if (k >= 3 && estMin >= 1) lv = "Developing";
    return { level: lv, auto: k, autoOf: autoIds.length, estMin: estMin, explainOk: explainOk, complete: complete };
  }
  function fmtMs(ms) {
    if (ms == null) return "–";
    var s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m ? m + " min " + (s % 60 < 10 ? "0" : "") + (s % 60) + " s" : s + " s";
  }
  function firstWord(D, t, r) {
    if (!r || r.first == null) return r && r.skipped ? "skipped" : "not answered";
    if (t.kind === "open-short") return (r.points || []).filter(Boolean).length + " of 2 points (self)";
    if (t.kind === "estimate") return "submitted";
    return r.first ? "right" : "not right";
  }
  function summary(D, st, env) {
    env = env || {};
    var L = level(D, st), total = 0, lines = [];
    D.tasks.forEach(function (t) { var r = st.tasks[t.id]; if (r && r.ms) total += r.ms; });
    lines.push("Learn · CK-F results (" + D.version + ")");
    lines.push("Finished: " + (st.finished || "not yet") + " (this device's clock) · active time " + fmtMs(total));
    lines.push("Level by the published rule: " + L.level + " (auto-marked right on the first try: " + L.auto + " of " + L.autoOf +
      "; estimate's lowest self-rating: " + (L.estMin >= 0 ? D.rule.levels[L.estMin] : "not rated") + "; explanation: " + (L.explainOk ? "both points" : "not both points") + ")");
    lines.push("");
    lines.push("# | Task | Draws on | First answer | Tries | Time to first answer | Time on task | Solution opened before answering");
    D.tasks.forEach(function (t, i) {
      var r = st.tasks[t.id] || {};
      lines.push((i + 1) + " | " + t.title + " | " + t.lesson + " | " + firstWord(D, t, r) + " | " + (r.tries || 0) + " | " + fmtMs(r.msFirst) + " | " + fmtMs(r.ms) + " | " + (r.solFirst ? "yes" : "no"));
    });
    var es = st.tasks["est-buses"];
    if (es && es.answer) {
      var a = es.answer;
      lines.push("");
      lines.push("Estimate: " + a.low + " to " + a.high + " " + a.unit + (es.check ? " · " + (es.check.overlaps ? "overlaps" : "does not overlap") + " the worked range" : ""));
      if (es.rating) lines.push("Self-rating: " + D.rule.criteria.map(function (c) { return c + " " + (es.rating[c] || "not rated"); }).join(", "));
      ["reasoning", "uncertainty", "check"].forEach(function (k) { if (a[k]) lines.push("Your " + k + ": " + String(a[k]).replace(/\s+/g, " ").slice(0, 600)); });
    }
    var ex = st.tasks["t0-explain"];
    if (ex && ex.answer) lines.push("Your explanation (task 1): " + String(ex.answer).replace(/\s+/g, " ").slice(0, 400));
    lines.push("");
    lines.push("Screen width " + (env.width || "?") + " px. Kept in this browser only; copied by you.");
    return lines.join("\n");
  }

  var api = { task: task, checkChoice: checkChoice, checkOrder: checkOrder, checkNumeric: checkNumeric, checkEstimate: checkEstimate,
    worked: worked, level: level, summary: summary, fmtMs: fmtMs, KEY: KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, E = LX.H, S = LX.S;
  function css() {
    if (document.getElementById("ckf-css")) return;
    E("style", { id: "ckf-css", text: [
      ".ckf{max-width:820px;margin:0 auto;display:grid;gap:14px}",
      ".ckf-card{background:var(--lx-surface);border:1px solid var(--lx-line);border-radius:var(--lx-r-lg);padding:18px 20px;display:grid;gap:12px;box-shadow:var(--lx-shadow)}",
      ".ckf-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}",
      ".ckf-tag{font-size:13px;color:var(--lx-ink-3);font-family:var(--lx-f-display)}",
      ".ckf-q{font-size:18.5px;line-height:1.45;max-width:62ch;color:var(--lx-ink)}",
      ".ckf-q:focus{outline:none}",
      ".ckf-opts{display:grid;gap:8px}",
      ".ckf-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}",
      ".ckf-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".ckf-field{display:grid;gap:4px}.ckf-field label{font-family:var(--lx-f-display);font-weight:500;font-size:14.5px}",
      ".ckf input[type=number],.ckf select,.ckf textarea{font:inherit;font-size:16px;color:var(--lx-ink);background:var(--lx-surface);border:1px solid var(--lx-line-2);border-radius:10px;padding:8px 10px;min-height:44px;max-width:100%}",
      ".ckf input[type=number]{width:10em}.ckf textarea{width:100%;min-height:76px;resize:vertical}",
      ".ckf-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}",
      ".ckf-order{list-style:none;margin:0;padding:0;display:grid;gap:8px}",
      ".ckf-order li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--lx-line-2);border-radius:11px;background:var(--lx-surface)}",
      ".ckf-order li.ok{border-color:var(--lx-good)}.ckf-order li.no{border-color:var(--lx-bad)}",
      ".ckf-order .n{font-family:var(--lx-f-mono);color:var(--lx-ink-3)}",
      ".ckf-order .mv{display:flex;gap:4px}.ckf-order .mv button{min-width:40px;min-height:40px;border-radius:9px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer;font-size:16px}",
      ".ckf-order .mv button:disabled{opacity:.35;cursor:not-allowed}",
      ".ckf details.ckf-sol{border:1px solid var(--lx-line);border-radius:12px;padding:8px 12px;background:var(--lx-surface-2)}",
      ".ckf details.ckf-sol>summary{cursor:pointer;font-family:var(--lx-f-display);font-weight:500;min-height:32px;display:flex;align-items:center}",
      ".ckf details.ckf-sol p{margin:.4rem 0 0}",
      ".ckf-chart svg{display:block;width:100%;height:auto}",
      ".ckf-points{display:grid;gap:6px;margin:0;padding:0;list-style:none}",
      ".ckf-points label{display:flex;gap:10px;align-items:flex-start;font-size:15px;cursor:pointer}",
      ".ckf-points input{width:22px;height:22px;margin-top:1px;flex:none}",
      ".ckf-rate{display:grid;gap:10px}",
      ".ckf-rate fieldset{border:1px solid var(--lx-line);border-radius:12px;padding:8px 12px;margin:0;display:grid;gap:6px}",
      ".ckf-rate legend{font-family:var(--lx-f-display);font-weight:500;font-size:15px;padding:0 4px}",
      ".ckf-rate .opts{display:flex;flex-wrap:wrap;gap:6px}",
      ".ckf-rate .opts label{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:4px 10px;border:1px solid var(--lx-line-2);border-radius:10px;cursor:pointer;font-size:14.5px}",
      ".ckf-rate .opts input{width:18px;height:18px}",
      ".ckf-rate .anchor{font-size:13.5px;color:var(--lx-ink-2)}",
      ".ckf-res{width:100%;border-collapse:collapse;font-size:14px}",
      ".ckf-res th{text-align:left;font-family:var(--lx-f-display);font-weight:500;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--lx-ink-3);padding:6px 8px;border-bottom:1px solid var(--lx-line-2)}",
      ".ckf-res td{padding:7px 8px;border-bottom:1px solid var(--lx-line);vertical-align:top}",
      ".ckf-res td.n{font-family:var(--lx-f-mono);white-space:nowrap}",
      ".page-learn .ckf-res,.page-learn .ckf-res>:not(caption)>*,.page-learn .ckf-res>:not(caption)>*>*{background:transparent !important;box-shadow:none !important;color:var(--lx-ink)}",
      "@media (max-width:600px){.ckf-res thead{display:none}.ckf-res,.ckf-res tbody,.ckf-res tr,.ckf-res td{display:block}.ckf-res tr{padding:6px 0;border-bottom:1px solid var(--lx-line)}.ckf-res td{border:0;padding:1px 0}.ckf-res td[data-l]::before{content:attr(data-l) \": \";color:var(--lx-ink-3);font-size:12.5px;font-family:var(--lx-f-body)}}",
      ".ckf-level{font-family:var(--lx-f-display);font-weight:600;font-size:22px}.ckf-level:focus{outline:none}",
      ".ckf textarea.ckf-out{font-family:var(--lx-f-mono);font-size:12.5px;min-height:160px}",
      ".ckf-lock{border:1px dashed var(--lx-line-2);border-radius:var(--lx-r-lg);padding:16px 18px;display:grid;gap:10px;background:var(--lx-surface)}",
      "@media (max-width:560px){.ckf-card{padding:14px}.ckf-q{font-size:17.5px}}"
    ].join("\n") }, document.head);
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function load(D) {
    var s = LX.store.get(KEY, null);
    if (!s || s.version !== D.version) s = { version: D.version, started: null, finished: null, cur: 0, tasks: {} };
    return s;
  }

  // a small line chart for the two chart tasks (axis deliberately not from zero in the December chart: the task asks
  // the reader to notice it)
  function Chart(host, C, series, label) {
    var w = E("div", { class: "ckf-chart" }, host), legend = E("div", { class: "lx-legend" }, host);
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

  LX.mount("ck-f-estimate", function (live, data, root) {
    css();
    var D = data.ck_f_estimate, st = load(D), N = D.tasks.length;
    var wrap = E("div", { class: "ckf" }, live), clock = { id: null, t0: null };
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
      var c = E("div", { class: "ckf-card" }, wrap);
      E("p", { class: "lx-eyebrow", text: "How this checkpoint works" }, c);
      var ul = E("ul", { style: "margin:0;padding-left:1.2rem;display:grid;gap:4px" }, c);
      ["Nine tasks, about 40 minutes: seven short ones, a short explanation and one estimate.",
       "No hints. Each worked solution opens after your first answer; you may open it earlier, and that is recorded.",
       "Your answers and times stay in this browser. At the end, “Copy my results” gives you a summary to paste into a form."].forEach(function (s) { E("li", { text: s }, ul); });
      var row = E("div", { class: "ckf-row" }, c), started = !!st.started;
      E("button", { type: "button", class: "lx-btn", html: (started ? "Resume at task " + (st.cur + 1) : "Start the checkpoint") + LX.icon("arrow"), onclick: function () { if (!st.started) { st.started = new Date().toISOString(); save(); } show(st.cur); } }, row);
      if (started) E("button", { type: "button", class: "lx-btn ghost", text: "Start again (clears this browser's answers)", onclick: reset }, row);
    }
    function reset() {
      if (!window.confirm("Clear your CK-F answers and times in this browser?")) return;
      st = { version: D.version, started: null, finished: null, cur: 0, tasks: {} }; save(); intro();
    }
    function show(i) {
      st.cur = i; save(); wrap.innerHTML = "";
      var t = D.tasks[i], r = rec(t.id);
      var c = E("div", { class: "ckf-card", role: "group", "aria-labelledby": "ckf-q-" + i }, wrap);
      var top = E("div", { class: "ckf-top" }, c);
      var dots = E("div", { class: "lx-dots", "aria-hidden": "true" }, top);
      for (var d = 0; d < N; d++) E("i", { class: d < i ? "done" : d === i ? "cur" : "" }, dots);
      E("span", { class: "ckf-tag", text: "Task " + (i + 1) + " of " + N + " · " + t.skill + " · draws on " + t.lesson }, top);
      var q = E("p", { class: "ckf-q", id: "ckf-q-" + i, tabindex: "-1", text: t.prompt }, c);
      var body = E("div", { style: "display:grid;gap:12px" }, c), fb = E("div", { "aria-live": "polite" }, c);
      var sol = E("details", { class: "ckf-sol", hidden: r.first == null && !r.solFirst }, c);
      E("summary", { text: "Worked solution" }, sol);
      solution(t, sol);
      var early = E("button", { type: "button", class: "lx-link", text: "Show the worked solution now (recorded as opened before answering)", hidden: r.first != null || r.solFirst,
        onclick: function () { rec(t.id).solFirst = true; save(); sol.hidden = false; sol.open = true; early.hidden = true; } }, c);
      function unlock() { sol.hidden = false; early.hidden = true; }
      ({ "choice": choice, "order": order, "numeric": numeric, "open-short": openShort, "estimate": estimate })[t.kind](t, body, fb, unlock);
      var foot = E("div", { class: "ckf-foot" }, c);
      E("button", { type: "button", class: "lx-btn ghost small", text: i ? "Back" : "Overview", onclick: function () { if (i) show(i - 1); else intro(); } }, foot);
      E("button", { type: "button", class: "lx-btn small", html: (i === N - 1 ? "See my results" : "Next task") + LX.icon("arrow"),
        onclick: function () { var rr = rec(t.id); if (rr.first == null) rr.skipped = true; save(); if (i === N - 1) results(); else show(i + 1); } }, foot);
      startClock(t.id);
      q.focus({ preventScroll: true });
      c.scrollIntoView({ block: "nearest", behavior: LX.reduced() ? "auto" : "smooth" });
      LX.emit("layout");
    }
    function feedback(fb, ok, html) { fb.innerHTML = ""; E("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + html + "</div>" }, fb); }
    function solution(t, sol) {
      if (t.kind === "estimate") { E("p", { html: "Two routes, a check and the marking guide are in the <a href=\"#solution\">Worked solution</a> section below; it opens when you submit." }, sol); return; }
      E("p", { text: t.solution }, sol);
      if (t.kind === "open-short") { var ul = E("ul", { style: "margin:.4rem 0 0;padding-left:1.2rem" }, sol); t.points.forEach(function (p) { E("li", { text: p }, ul); }); }
    }
    function choice(t, body, fb, unlock) {
      if (t.chart) chart(t, body);
      var r = rec(t.id), box = E("div", { class: "ckf-opts", role: "group", "aria-label": "Answers" }, body), btns = {};
      t.options.forEach(function (o) {
        btns[o[0]] = E("button", { type: "button", class: "lx-choice", "aria-pressed": r.answer === o[0] ? "true" : "false", text: o[1], onclick: function () {
          var res = checkChoice(t, o[0]);
          answered(t.id, res.right, o[0]);
          Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === o[0] ? "true" : "false"); btns[k].classList.toggle("right", res.right && k === o[0]); btns[k].classList.toggle("wrong", !res.right && k === o[0]); });
          feedback(fb, res.right, LX.esc(res.why) + (res.right ? "" : " Try again, or open the worked solution."));
          unlock();
        } }, box);
      });
    }
    function chart(t, body) {
      var C = D.charts[t.chart];
      if (t.chart === "dec") Chart(body, C, [{ label: "Demand, " + C.label, color: "var(--lx-demand)", v: C.demand }], "Prairie Town's demand, hour by hour, on " + C.label + ". The vertical axis runs from " + C.yMin + " to " + C.yMax + " MW.");
      else Chart(body, C, [{ label: "Actual demand", color: "var(--lx-demand)", v: C.demand }, { label: "Day-ahead forecast", color: "var(--lx-accent)", dash: true, v: C.forecast }],
        "Actual demand and the day-ahead forecast, hour by hour, on " + C.label + ", scaled to Prairie Town.");
      E("p", { class: "lx-hint", text: "Real Southwest Power Pool shape (EIA-930), " + C.label + ", scaled to Prairie Town; hours in local time." }, body);
    }
    function order(t, body, fb, unlock) {
      var r = rec(t.id), cur = (r.answer && r.answer.length === t.items.length) ? r.answer.slice() : t.start.slice();
      var text = {}; t.items.forEach(function (x) { text[x[0]] = x[1]; });
      var ol = E("ol", { class: "ckf-order" }, body), row = E("div", { class: "ckf-row" }, body);
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
        var res = checkOrder(t, cur); marks = res.places; answered(t.id, res.right, cur.slice()); paint();
        feedback(fb, res.right, res.right ? "That is the sequence." : res.n + " of " + cur.length + " in the right place (green). Try again, or open the worked solution.");
        unlock();
      });
      paint();
    }
    function numeric(t, body, fb, unlock) {
      var r = rec(t.id), g = E("div", { class: "ckf-grid2" }, body);
      var f1 = E("div", { class: "ckf-field" }, g), id1 = LX.uid("ckf");
      E("label", { for: id1, text: "Your answer" }, f1);
      var inp = E("input", { type: "number", id: id1, min: "0", step: "any", inputmode: "decimal", value: r.answer ? r.answer.value : "" }, f1);
      var f2 = E("div", { class: "ckf-field" }, g), id2 = LX.uid("ckf");
      E("label", { for: id2, text: "Unit" }, f2);
      var sel = E("select", { id: id2 }, f2);
      E("option", { value: "", text: "Choose…" }, sel);
      t.units.forEach(function (u) { E("option", { value: u[0], text: u[0], selected: r.answer && r.answer.unit === u[0] ? "selected" : null }, sel); });
      var row = E("div", { class: "ckf-row" }, body);
      E("button", { type: "button", class: "lx-btn small", text: "Check", onclick: function () {
        if (!sel.value) { feedback(fb, false, "Choose a unit first."); return; }
        var res = checkNumeric(t, parseFloat(inp.value), sel.value);
        answered(t.id, res.right, { value: parseFloat(inp.value), unit: sel.value });
        feedback(fb, res.right, LX.esc(res.msg) + (res.right ? "" : " Try again, or open the worked solution."));
        unlock();
      } }, row);
    }
    function openShort(t, body, fb, unlock) {
      var r = rec(t.id), id = LX.uid("ckf");
      E("label", { for: id, class: "lx-sr", text: "Your explanation" }, body);
      var ta = E("textarea", { id: id, rows: "3", placeholder: "Your explanation" }, body); ta.value = r.answer || "";
      var row = E("div", { class: "ckf-row" }, body), self = E("div", { hidden: r.points == null }, body);
      E("p", { class: "lx-hint", text: "Compare with the worked solution, then tick each point your answer makes." }, self);
      var ul = E("ul", { class: "ckf-points" }, self), boxes = t.points.map(function (p, k) {
        var lab = E("label", null, E("li", null, ul)), cb = E("input", { type: "checkbox" }, lab); cb.checked = !!(r.points && r.points[k]);
        E("span", { text: p }, lab);
        cb.addEventListener("change", function () { var rr = rec(t.id); rr.points = boxes.map(function (b) { return b.checked; }); rr.first = rr.points.every(Boolean); save(); });
        return cb;
      });
      E("button", { type: "button", class: "lx-btn small", text: "Submit my explanation", onclick: function () {
        if (!ta.value.trim()) { feedback(fb, false, "Write a sentence or two first."); return; }
        var rr = answered(t.id, false, ta.value.trim()); rr.points = rr.points || [false, false]; rr.first = rr.points.every(Boolean); save();
        self.hidden = false; unlock(); fb.innerHTML = "";
        E("div", { class: "lx-saw", html: LX.icon("check") + "<div><b>Submitted.</b> Open the worked solution below and tick the points you made.</div>" }, fb);
      } }, row);
    }
    function estimate(t, body, fb, unlock) {
      var r = rec(t.id), a = r.answer || {}, g = E("div", { class: "ckf-grid2" }, body), F = {};
      function field(host, key, label, type) {
        var f = E("div", { class: "ckf-field" }, host), id = LX.uid("ckf");
        E("label", { for: id, text: label }, f);
        var el = type === "textarea" ? E("textarea", { id: id, rows: "2" }, f) : E("input", { type: "number", id: id, min: "0", step: "any", inputmode: "decimal" }, f);
        el.value = a[key] != null ? a[key] : ""; F[key] = el; return el;
      }
      field(g, "low", "Low value"); field(g, "high", "High value");
      var fu = E("div", { class: "ckf-field" }, g), idu = LX.uid("ckf"); E("label", { for: idu, text: "Unit" }, fu);
      var sel = E("select", { id: idu }, fu); E("option", { value: "", text: "Choose…" }, sel);
      t.units.forEach(function (u) { E("option", { value: u[0], text: u[0], selected: a.unit === u[0] ? "selected" : null }, sel); });
      field(body, "reasoning", "How you got there: your inputs and steps", "textarea");
      field(body, "uncertainty", "The main uncertainty, and why it matters most", "textarea");
      field(body, "check", "One way to check your answer", "textarea");
      var row = E("div", { class: "ckf-row" }, body);
      fb = E("div", { "aria-live": "polite", style: "display:grid;gap:8px" }, body);
      var out = E("div", { style: "display:grid;gap:10px" }, body);
      E("button", { type: "button", class: "lx-btn small", text: "Submit my estimate", onclick: function () {
        var lo = parseFloat(F.low.value), hi = parseFloat(F.high.value);
        if (!sel.value || !(lo > 0) || !(hi > 0)) { fb.innerHTML = ""; E("div", { class: "lx-saw no", html: LX.icon("question") + "<div>Give a low and a high value and choose a unit.</div>" }, fb); return; }
        var ans = { low: lo, high: hi, unit: sel.value, reasoning: F.reasoning.value.trim(), uncertainty: F.uncertainty.value.trim(), check: F.check.value.trim() };
        var chk = checkEstimate(t, lo, hi, sel.value);
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
        var box = E("div", { class: "ckf-rate" }, host), rr = rec(t.id); rr.rating = rr.rating || {};
        RUBRIC.forEach(function (cr) {
          var fs = E("fieldset", null, box); E("legend", { text: cr.name }, fs);
          var opts = E("div", { class: "opts" }, fs), anc = E("p", { class: "anchor", "aria-live": "polite" }, fs);
          D.rule.levels.forEach(function (lv, k) {
            var lab = E("label", null, opts), rb = E("input", { type: "radio", name: "ckf-" + cr.id, value: lv }, lab); E("span", { text: lv }, lab);
            rb.checked = rr.rating[cr.id] === lv; if (rb.checked) anc.textContent = cr.levels[k];
            rb.addEventListener("change", function () { rr.rating[cr.id] = lv; anc.textContent = cr.levels[k]; save(); });
          });
        });
        unlock();
      }
    }
    function openSolution() {
      var lock = document.getElementById("ckf-lock"), body = document.getElementById("ckf-solution-body");
      if (lock) lock.hidden = true; if (body) body.classList.add("ckf-open");
    }
    function results() {
      stopClock();
      if (!st.finished) { var dt = new Date(), p2 = function (x) { return (x < 10 ? "0" : "") + x; };
        st.finished = dt.getFullYear() + "-" + p2(dt.getMonth() + 1) + "-" + p2(dt.getDate()) + " " + p2(dt.getHours()) + ":" + p2(dt.getMinutes()); save(); }
      wrap.innerHTML = "";
      var L = level(D, st), c = E("div", { class: "ckf-card" }, wrap);
      E("p", { class: "lx-eyebrow", text: "Your results (this browser only)" }, c);
      E("p", { class: "ckf-level", tabindex: "-1", text: "Level: " + L.level }, c).focus({ preventScroll: true });
      E("p", { text: "Auto-marked tasks right on the first try: " + L.auto + " of " + L.autoOf + ". Estimate: lowest self-rating " + (L.estMin >= 0 ? D.rule.levels[L.estMin] : "not rated yet") + ". Explanation: " + (L.explainOk ? "both points." : "not both points ticked.") + (L.complete ? "" : " Some tasks are not finished; the level counts them as not right.") }, c);
      var sc = E("div", { class: "lx-scroll-x" }, c), tb = E("table", { class: "ckf-res" }, sc), hr = E("tr", null, E("thead", null, tb));
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
      var text = summary(D, st, { width: window.innerWidth });
      var row = E("div", { class: "ckf-row" }, c), msg = E("p", { class: "lx-hint", "aria-live": "polite" }, c);
      var id = LX.uid("ckf"); E("label", { for: id, class: "lx-sr", text: "Your results as text" }, c);
      var ta = E("textarea", { id: id, class: "ckf-out", readonly: "readonly", rows: "10" }, c); ta.value = text;
      E("button", { type: "button", class: "lx-btn small", html: LX.icon("check") + "Copy my results", onclick: function () {
        function fallback() { ta.focus(); ta.select(); try { document.execCommand("copy"); msg.textContent = "Copied. Paste it into the tester form."; } catch (e) { msg.textContent = "Select the text below and copy it."; } }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { msg.textContent = "Copied. Paste it into the tester form."; }, fallback);
        else fallback();
      } }, row);
      E("button", { type: "button", class: "lx-btn ghost small", text: "Back to the tasks", onclick: function () { show(0); } }, row);
      E("button", { type: "button", class: "lx-btn ghost small", text: "Start again", onclick: reset }, row);
      if (L.level === "Proficient" || L.level === "Strong") LX.progress.done("ck-f-estimate");
      LX.emit("layout");
    }
    var RUBRIC = [];
    document.querySelectorAll("#ckf-rubric tbody tr").forEach(function (tr) {
      var cells = tr.querySelectorAll("th, td");
      RUBRIC.push({ id: tr.getAttribute("data-c"), name: cells[0].textContent.trim(), levels: [1, 2, 3, 4].map(function (k) { return cells[k] ? cells[k].textContent.trim() : ""; }) });
    });
    // the worked solution section: locked until the estimate is submitted (or opened on purpose, which is recorded)
    var lock = document.getElementById("ckf-lock"), solBody = document.getElementById("ckf-solution-body");
    if (lock && solBody) {
      var done = st.tasks["est-buses"] && (st.tasks["est-buses"].first != null || st.tasks["est-buses"].solFirst);
      lock.hidden = !!done; if (done) solBody.classList.add("ckf-open");
      var ob = lock.querySelector("button");
      if (ob) ob.addEventListener("click", function () { var r = rec("est-buses"); if (r.first == null) r.solFirst = true; save(); openSolution(); });
    }
    if (st.finished && !location.hash) results(); else intro();
    // demo states (core.js LX.demo): "mid" = the first task on screen; "done" = the results view
    LX.demo(root, function (state) {
      if (state === "mid") { show(0); return { view: "task 1" }; }
      if (state === "done") { results(); return { view: "results" }; }
      return null;
    });
  });
})();
