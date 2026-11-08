// ck-f-estimate.js — CK-F, the Foundations checkpoint (the Foundations tier's end-of-tier task).
//
// Nine tasks on unfamiliar situations across T0-T6 and N1 (assets/learn/data/ck-f-estimate.json): one open explanation,
// seven auto-marked items (choices, an ordering, a number with units) and the main estimate (a town's school buses go
// electric: a range with units, the main uncertainty and a check), self-rated on the published rubric. No hints: each
// task's worked solution opens after the first answer, or earlier on request, which is recorded.
//
// The runner is the shared LX.Checkpoint (assets/learn/components/checkpoint.js): one task at a time, the visibility-aware
// clock, first-try recording, the rubric self-rating, the results view and the copyable summary. This file holds CK-F's
// configuration, its two chart tasks, the worked solution's numbers and the mount.
//
// Measured in this browser only (LX.store, key "ckf-v1", unchanged since the
// first testers): active time per task (the clock runs only while the task is on screen and the tab is visible), time to
// the first answer, whether the first answer was right, the number of tries, and whether the solution was opened before
// answering. "Copy my results" puts a plain-text summary on the clipboard for the tester to paste into a form; nothing is
// sent anywhere. The summary format is the component's, with the code "CK-F".
//
// Pure part (exported for _tests/learn/test_ck-f-estimate.js): worked() and staticTasks() here; task, the checks, the
// level rule, the summary and fmtMs from the component (window.LX.Checkpoint in the page, components/checkpoint.js in Node).
// No-JS version: staticTasks() is written into learn/ck-f-estimate.qmd between the ckf-fallback markers by the test's
// write mode (`node _tests/learn/test_ck-f-estimate.js --write`); the test checks that the page and the data agree.
(function () {
  "use strict";
  var KEY = "ckf-v1", CODE = "CK-F";

  // ---------------------------------------------------------------- pure part
  function CP() {
    if (typeof window !== "undefined" && window.LX && window.LX.Checkpoint) return window.LX.Checkpoint;
    return require("./components/checkpoint.js");
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
  // the nine tasks as static HTML for readers without JavaScript: each prompt (with its options, the order task's items as
  // shuffled, and the chart tasks' hourly values as a table), then its worked solution in a closed box
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function chartTable(C, series) {
    var h = '<details class="lx-textalt"><summary>Chart data: ' + esc(C.label) + ", MW by hour</summary><div class=\"lx-scroll-x\"><table class=\"lx-mini-table\"><thead><tr><th scope=\"col\">Hour</th>";
    series.forEach(function (s) { h += '<th scope="col">' + esc(s[0]) + " (MW)</th>"; });
    h += "</tr></thead><tbody>";
    for (var i = 0; i < 24; i++) { h += "<tr><td>" + (i < 10 ? "0" : "") + i + ":00</td>"; series.forEach(function (s) { h += "<td>" + s[1][i] + "</td>"; }); h += "</tr>"; }
    return h + "</tbody></table></div></details>";
  }
  function staticTasks(D) {
    var h = ['<p class="lx-eyebrow">The nine tasks</p>',
      '<p class="lx-hint">Answer each task on paper first, then open its worked solution. Task ' + D.tasks.length + " is the main estimate; its worked solution and the rubric are further down this page.</p>",
      '<ol class="ckf-static">'];
    D.tasks.forEach(function (t, i) {
      var x = "<li><p><b>" + esc(t.title) + '</b> <span class="lx-hint">' + esc(t.skill) + " · draws on " + esc(t.lesson) + "</span></p><p>" + esc(t.prompt) + "</p>";
      if (t.chart) { var C = D.charts[t.chart]; x += chartTable(C, t.chart === "dec" ? [["Demand", C.demand]] : [["Actual demand", C.demand], ["Day-ahead forecast", C.forecast]]); }
      var text = {}; (t.items || []).forEach(function (it) { text[it[0]] = it[1]; });
      if (t.kind === "choice") x += "<ul>" + t.options.map(function (o) { return "<li>" + o[0] + ". " + esc(o[1]) + "</li>"; }).join("") + "</ul>";
      if (t.kind === "order") x += "<p>As shuffled:</p><ul>" + t.start.map(function (k) { return "<li>" + esc(text[k]) + "</li>"; }).join("") + "</ul>";
      if (t.kind === "numeric") x += "<p>Answer with a number and a unit.</p>";
      if (t.kind === "estimate") { h.push(x + "<p>On paper: a low and a high value with units, your inputs and steps, the main uncertainty and one way to check.</p></li>"); return; }
      x += '<details class="lx-textalt"><summary>Worked solution, task ' + (i + 1) + "</summary>";
      if (t.kind === "choice") x += "<p><b>Answer: " + t.answer + ". " + esc(t.options.filter(function (o) { return o[0] === t.answer; })[0][1]) + ".</b></p>";
      if (t.kind === "numeric") x += "<p><b>Answer: about " + Math.round(t.answer.mwh / 1000) + " GWh.</b></p>";
      if (t.kind === "order") x += "<ol>" + t.items.map(function (it) { return "<li>" + esc(it[1]) + "</li>"; }).join("") + "</ol>";
      x += "<p>" + esc(t.solution) + "</p>";
      if (t.kind === "open-short") x += "<p>A full answer makes two points:</p><ul>" + t.points.map(function (pt) { return "<li>" + esc(pt) + "</li>"; }).join("") + "</ul>";
      h.push(x + "</details></li>");
    });
    h.push("</ol>");
    return h.join("\n");
  }
  var api = { worked: worked, staticTasks: staticTasks, KEY: KEY, CODE: CODE,
    level: function (D, st) { return CP().level(D, st); },
    summary: function (D, st, env) { return CP().summary(D, st, env, { code: CODE }); } };
  ["task", "checkChoice", "checkOrder", "checkNumeric", "checkEstimate", "fmtMs"].forEach(function (k) {
    api[k] = function () { var c = CP(); return c[k].apply(c, arguments); };
  });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX || !window.LX.Checkpoint) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX;
  LX.mount("ck-f-estimate", function (live, data, root) {
    var D = data.ck_f_estimate;
    var cp = LX.Checkpoint(live, { data: D, key: KEY, code: CODE, lessonId: "ck-f-estimate",
      intro: ["Nine tasks, about 40 minutes: seven short ones, a short explanation and one estimate.",
        "No hints. Each worked solution opens after your first answer; you may open it earlier, and that is recorded.",
        "Your answers and times stay in this browser. At the end, “Copy my results” gives a plain-text summary for you to share; it includes what you typed in tasks 1 and 9."],
      rubric: "#ckf-rubric", lock: "#ckf-lock", solution: "#ckf-solution-body",
      estimateNote: "Two routes, a check and the marking guide are in the <a href=\"#solution\">Worked solution</a> section below; it opens when you submit.",
      // the two chart tasks (the December chart's axis deliberately does not start at zero: the task asks the reader to notice it)
      chart: function (t, body) {
        var C = D.charts[t.chart];
        if (t.chart === "dec") LX.Checkpoint.lineChart(body, C, [{ label: "Demand, " + C.label, color: "var(--lx-demand)", v: C.demand }], "Prairie Town's demand, hour by hour, on " + C.label + ". The vertical axis runs from " + C.yMin + " to " + C.yMax + " MW.");
        else LX.Checkpoint.lineChart(body, C, [{ label: "Actual demand", color: "var(--lx-demand)", v: C.demand }, { label: "Day-ahead forecast", color: "var(--lx-accent)", dash: true, v: C.forecast }],
          "Actual demand and the day-ahead forecast, hour by hour, on " + C.label + ", scaled to Prairie Town.");
        LX.H("p", { class: "lx-hint", text: "Real Southwest Power Pool shape (EIA-930), " + C.label + ", scaled to Prairie Town; hours in local time." }, body);
      } });
    // demo states (core.js LX.demo): "mid" = the first task on screen; "done" = the results view
    LX.demo(root, function (state) {
      if (state === "mid") { cp.show(0); return { view: "task 1" }; }
      if (state === "done") { cp.results(); return { view: "results" }; }
      return null;
    });
  });
})();
