/* benchrun.js — LX.BenchRun: the Run button, status line and failure states of a sandbox or capstone. The page
   hands it the engine's solve; it runs one plan at a time, says what happened in plain words, offers "Try again" after a
   failure, a time limit or an infeasible plan, keeps the last results that were drawn (marked as belonging to an earlier
   plan), and holds the page's busy state while a run is on.
   var run = LX.BenchRun(host, {
     state: function () { return plan; },   the plan on the controls (the Run button runs it)
     solve: function (state, ctx) { return engine.solve(state, data, { signal: ctx.signal, timeLimit: ctx.attempt > 1 ? 30 : 10 }); },
                       Promise of { status, ok, message, hint, results, kind, mipGap, ms } with LX.solver's statuses
                       (optimal, infeasible, time-limit, ...; ok only when optimal); ctx = { signal (an AbortSignal,
                       when the browser has one), attempt (1, then 2, 3 ... after "Try again" on the same plan) }; a
                       rejection or a throw counts as status "error"
     render: function (results, state, r) {},   draws a run's results: called for ok runs, and for early stops that
                       kept a plan only with partial: true (the status then says the plan is not proven best); a throw
                       here is reported as a failed run
     results: element or [elements], the results areas (the results section, readouts beside the controls):
                       aria-busy while a run is on, data-stale="true" (dimmed) while they show another plan's results
     stale: element,   where the "results are for an earlier plan" line goes (a <p> above the results; hidden when fresh)
     label: "Run the year",  busy: function (on) {},  onDone: function (r, state) {},  partial: false,
     words: { ok: "...", infeasible: "..." },   the engine's own sentence for a kind (else r.message, else ours)
     progress: { usual: 12 or function (state) { return seconds or null; }, unit: "day" } });
                       the progress line under the buttons (LX.SolveProgress, solver.js): it appears when a run lasts more
                       than two seconds; usual is the click's expected time from the solver bench (6x), unit names a step.
                       A run of several solves passes its count through ctx.step(k, n) (ctx = { signal, attempt, step })
   run.run(state) -> Promise of the result ({ status: "superseded" } when a newer run replaced it)
   run.changed(state)   call when the reader changes the plan: drawn results are marked stale until the next run
   run.last() -> { state, r } of the last run that drew results, or null;  run.running();  run.cancel();  run.el
   Pure (Node; also on LX.BenchRun): classify(r, words, partial) -> { kind, draw, retry, text }
     kind  "ok" | "early" (time-limit, iteration-limit, objective-bound or -target, interrupted) | "infeasible" |
           "unbounded" | "error" | "cancelled" | "superseded" (ignored: a newer run is on)
   Wording: "optimal" only for status optimal, with a MILP's gap when it has one (no false certificates); an early stop
   never says best. Focus stays where it was: the buttons are never rebuilt or disabled (a busy Run is aria-disabled and
   ignores presses), and the status line (role="status") speaks. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  var EARLY = ["time-limit", "iteration-limit", "objective-bound", "objective-target", "interrupted"];
  var SAY = {
    ok: "Done: the solver reports this answer as optimal for the bench's model.",
    early: "The run stopped at its time limit before it finished, so no result is shown.",
    earlyDrawn: "The run stopped at its time limit: the plan shown is the best found so far, not proven best.",
    infeasible: "No way to run this plan meets every rule. Change the plan, then run it again.",
    unbounded: "The model has no limit on its objective, so a rule is missing: a fault in the bench.",
    error: "The run failed before it gave an answer.",
    cancelled: "The run was stopped."
  };
  function classify(r, words, partial) {
    words = words || {};
    var bad = !r || typeof r !== "object";
    r = bad ? {} : r;
    var st = r.status, kind;
    if (bad) kind = "error";
    else if (st === "superseded") kind = "superseded";
    else if (r.ok && st === "optimal") kind = "ok";
    else if (EARLY.indexOf(st) >= 0) kind = "early";
    else if (st === "infeasible" || st === "infeasible-or-unbounded") kind = "infeasible";
    else if (st === "unbounded") kind = "unbounded";
    else if (st === "cancelled") kind = "cancelled";
    else kind = "error";
    if (kind === "superseded") return { kind: kind, draw: false, retry: false, text: "" };
    var draw = kind === "ok" || (kind === "early" && !!partial && !!r.results);
    var text = words[kind] || r.message || (kind === "early" && draw ? SAY.earlyDrawn : SAY[kind]);
    if (kind === "early" && st !== "time-limit" && !words.early && !r.message) text = text.replace("at its time limit", "early (" + st + ")");
    if (kind === "ok" && r.kind === "milp" && r.mipGap > 0) text += " It is within " + (r.mipGap * 100).toFixed(2) + "% of the best bound.";
    if (r.hint && kind !== "ok") text += " " + r.hint;
    if (kind === "error" && r.error && !r.message) text += " (" + r.error + ")";
    return { kind: kind, draw: draw, retry: kind !== "ok", text: text };
  }
  var api = { classify: classify, SAY: SAY, EARLY: EARLY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function key(s) { return JSON.stringify(s === undefined ? null : s); }
  LX.BenchRun = function (host, o) {
    var box = H("div", { class: "lx-br" }, host);
    var row = H("div", { class: "lx-br-row" }, box);
    var label = o.label || "Run";
    var btn = H("button", { class: "lx-btn small", type: "button", text: label }, row);
    var again = H("button", { class: "lx-btn ghost small", type: "button", text: "Try again", hidden: true }, row);
    var po = o.progress || {}, prog = LX.SolveProgress ? LX.SolveProgress(box, { unit: po.unit }) : null;
    var status = H("p", { class: "lx-br-status", role: "status", "aria-live": "polite" }, box);
    var areas = o.results ? [].concat(o.results).filter(Boolean) : [];
    areas.forEach(function (a) { a.classList.add("lx-br-results"); });
    if (o.stale) { o.stale.classList.add("lx-br-stale"); o.stale.hidden = true; }
    var token = 0, ctl = null, busyNow = false, last = null, lastTried = null, attempt = 0, planKey = null;
    function setBusy(on, state) {
      busyNow = on;
      if (prog) { if (on) prog.start({ usual: typeof po.usual === "function" ? po.usual(state) : po.usual }); else prog.stop(); }
      // aria-disabled, not disabled: a disabled button would drop the keyboard focus of a reader who pressed it
      if (on) btn.setAttribute("aria-disabled", "true"); else btn.removeAttribute("aria-disabled");
      btn.textContent = on ? "Running…" : label;
      if (on) { again.hidden = true; box.setAttribute("data-state", "busy"); }
      areas.forEach(function (a) { if (on) a.setAttribute("aria-busy", "true"); else a.removeAttribute("aria-busy"); });
      if (o.busy) o.busy(on);
    }
    function paintStale(failed) {
      var stale = !!last && planKey !== null && key(last.state) !== planKey, show = stale || (failed && !!last);
      areas.forEach(function (a) { if (show) a.setAttribute("data-stale", "true"); else a.removeAttribute("data-stale"); });
      if (!o.stale) return;
      o.stale.hidden = !show;
      o.stale.textContent = !show ? "" : stale ? "These results are for an earlier plan. Run the plan on the controls to update them."
        : "These results are from your last run that finished.";
    }
    function say(kind, text) { status.setAttribute("data-kind", kind); status.textContent = text; }
    function run(state, isRetry) {
      var my = ++token, k = key(state);
      if (ctl && ctl.abort) { try { ctl.abort(); } catch (e) { /* already done */ } }
      ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      attempt = isRetry && lastTried === k ? attempt + 1 : 1;
      lastTried = k; planKey = k;
      setBusy(true, JSON.parse(k)); say("busy", "Running…");
      var p, step = function (s, n) { if (my === token && prog) prog.step(s, n); };
      try { p = Promise.resolve(o.solve(JSON.parse(k), { signal: ctl ? ctl.signal : null, attempt: attempt, step: step })); }
      catch (e) { p = Promise.resolve({ status: "error", ok: false, error: e && e.message }); }
      return p.then(null, function (e) { return { status: "error", ok: false, error: e && e.message }; }).then(function (r) {
        if (my !== token) return { status: "superseded", ok: false };   // a newer run (or a cancel) owns the page now
        var c = classify(r, o.words, o.partial);
        setBusy(false);
        if (c.draw) {
          try { if (o.render) o.render(r.results, JSON.parse(k), r); last = { state: JSON.parse(k), r: r }; }
          catch (e) { c = classify({ status: "error", ok: false, error: e && e.message }, o.words); if (typeof console !== "undefined") console.error(e); }
        }
        var ms = r && r.ms && r.ms.roundTrip ? " · " + Math.max(1, Math.round(r.ms.roundTrip)) + " ms" : "";
        say(c.kind, c.text + (c.kind === "ok" ? ms : ""));
        box.setAttribute("data-state", c.kind);
        again.hidden = !c.retry;
        paintStale(!c.draw);
        if (o.onDone) o.onDone(r, JSON.parse(k));
        if (LX.emit) LX.emit("layout");
        return r;
      });
    }
    btn.addEventListener("click", function () { if (!busyNow && o.state) run(o.state(), false); });
    again.addEventListener("click", function () { if (!busyNow && lastTried !== null) run(JSON.parse(lastTried), true); });
    return {
      el: box, button: btn, again: again, status: status,
      run: function (state) { return run(state, false); },
      changed: function (state) { planKey = key(state); paintStale(false); },
      last: function () { return last ? { state: JSON.parse(key(last.state)), r: last.r } : null; },
      running: function () { return busyNow; },
      cancel: function () {
        if (!busyNow) return;
        token++;
        if (ctl && ctl.abort) { try { ctl.abort(); } catch (e) { /* done */ } }
        setBusy(false);
        var c = classify({ status: "cancelled" }, o.words);
        say(c.kind, c.text); box.setAttribute("data-state", c.kind); again.hidden = false; paintStale(true);
      }
    };
  };
  Object.keys(api).forEach(function (k) { LX.BenchRun[k] = api[k]; });
})();
