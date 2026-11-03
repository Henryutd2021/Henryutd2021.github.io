// ck-f-estimate.js — CK-F, the Foundations checkpoint (curriculum v2 §3.3; wave W1, 2026-11-02).
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
// Measured for the W1 validation (curriculum §18.3), in this browser only (LX.store, key "ckf-v1", unchanged since the
// first testers): active time per task (the clock runs only while the task is on screen and the tab is visible), time to
// the first answer, whether the first answer was right, the number of tries, and whether the solution was opened before
// answering. "Copy my results" puts a plain-text summary on the clipboard for the tester to paste into a form; nothing is
// sent anywhere. The summary format is the component's, with the code "CK-F".
//
// Pure part (exported for _tests/learn/test_ck-f-estimate.js): worked() here; task, the checks, the level rule, the
// summary and fmtMs from the component (window.LX.Checkpoint in the page, components/checkpoint.js in Node).
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
  var api = { worked: worked, KEY: KEY, CODE: CODE,
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
        "Your answers and times stay in this browser. At the end, “Copy my results” gives you a summary to paste into a form."],
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
