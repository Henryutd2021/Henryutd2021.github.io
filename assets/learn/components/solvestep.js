/* solvestep.js — LX.SolveStep: a step card's solver action and its failure note (promoted at the W3 integration,
   2026-11-03, from M3, A8 and M4, which each had the same code; W2 review finding 3). A step that solves disables its
   own button, shows LX.SolverStatus, holds the page's busy state (so "Next" waits), and on a failed solve, a time limit or
   a solver that would not load says so in plain words, clears the busy state and offers "Try again"; results already
   solved are kept, so a retry solves only what is missing.
   var go = LX.SolveStep.action({
     api,              the step card's api (api.busy(on))
     st,               an LX.SolverStatus (st.set("solving" | "loading" | "") )
     host,             where the failure note goes
     go,               the step's own button (disabled while it runs), or null
     job: function () { return Promise },   the solves; it may resolve to the failed result (or { r: result }), else null
     failed: function () { return null },   optional: the first failed result, read after job() (M3's form)
     show: function () {},                  draws the results when nothing failed
     cls: "a8-fail",   extra class on the note (pages and tests find it by it)
     kept: " Results already solved are kept." });   the note's last sentence (this is the default)
   go() runs it (the step's button, a prediction, or "Try again" call the same function); it returns the Promise.
   LX.SolveStep.failNote(host, r, again, { cls, kept }) draws the note alone (role="alert"; "Try again" calls again()).
   Why not LX.BenchRun: a sandbox's run box owns its Run button and status line, never disables them, and marks drawn
   results stale when the plan changes; a step card has its own button, a SolverStatus and Next, which this keeps. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.LX) return;
  var LX = window.LX, H = LX.H, KEPT = " Results already solved are kept.";
  function why(r) {
    return r.status === "time-limit" ? "The solver stopped at its time limit before it finished."
      : r.status === "cancelled" || r.status === "superseded" ? "The run was stopped before it finished."
      : ((LX.solver && LX.solver.describe ? LX.solver.describe(r) : "") || "The solver did not finish.") + (r.message && r.status === "error" ? " (" + r.message + ")" : "");
  }
  function failNote(host, r, again, o) {
    o = o || {};
    var box = H("div", { class: "lx-solve-fail" + (o.cls ? " " + o.cls : ""), role: "alert" }, host);
    H("p", { html: "<b>No result to show.</b> " + LX.esc(why(r)) + (o.kept != null ? o.kept : KEPT) }, box);
    H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Try again", onclick: function () { again(); } }, box);
    return box;
  }
  function action(o) {
    var note = null;
    function end(r) {
      o.api.busy(false); if (o.go) o.go.disabled = false;
      if (r) { o.st.set(""); if (note) note.remove(); note = failNote(o.host, r, attempt, o); }
    }
    function attempt() {
      if (note) { note.remove(); note = null; }
      if (o.go) o.go.disabled = true;
      o.st.set(LX.solver && LX.solver.mode ? "solving" : "loading"); o.api.busy(true);
      return Promise.resolve().then(o.job).then(function (bad) {
        var f = o.failed ? o.failed() : bad ? (bad.r || bad) : null;
        end(f); if (!f) o.show();
      }).catch(function (e) { end({ status: "error", ok: false, message: String((e && e.message) || e) }); });
    }
    return attempt;
  }
  LX.SolveStep = { action: action, failNote: failNote, why: why };
})();
