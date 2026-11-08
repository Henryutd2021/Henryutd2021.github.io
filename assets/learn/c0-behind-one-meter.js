// c0-behind-one-meter.js — Capstone C0, "Behind one meter: what should one home or one plant install?".
// Page: learn/c0-behind-one-meter.qmd (capstone form: Brief, Plan, Note, Self-check, Sources).
// Built on the Site Bench (SB0): the plan runs on engine E0 (assets/learn/components/engine-e0.js, LX.E0, in the bundle)
// through the same bench kit (LX.E0.ui.bench), under its own plan-link key (#c0-v1-...). This file adds the sensitivity
// chart (LX.Tornado over LX.E0.sensitivity, the equipment held fixed), the one-page note (LX.ReportNote: the reader's
// three fields plus LX.E0.note, with every bar of the chart in numbers, LX.E0.sensWords), the exemplars (LX.Exemplars)
// and the self-check (LX.Rubric). The no-JS route gets the default plan's link and sensitivity (data file, reference).
// Data: e0.json, town_year.json, cf_targets.json (the engine's), c0-behind-one-meter.json (note fields, exemplars,
// rubric), path.json (links to other lessons).
// The no-JS blocks (the plan's controls, the default plan's link, sensitivity and results, the note's outline, the
// exemplars, the rubric, the inputs) are written by _tests/learn/test_c0-behind-one-meter.js --write (staticBlocks).
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // the note's sensitivity part: every bar of the chart in numbers, widest swing first, and what was held or re-run
  function sensLine(s, sens, E0) { var w = E0.sensWords(s, sens); return w ? w.line : null; }
  // the plan link's end (after this page's address) for a plan on this page
  function hashOf(SS, E0, s) { return "#" + SS.encode(E0.schemaFor("c0"), s); }
  // the no-JS route: the default plan's link, and its sensitivity (C.reference, written by the test) as a table
  function nojsHTML(C, E0, SS) {
    var R = C.reference, m = E0.fmt.money;
    var h = '<p class="lx-eyebrow">The default plan, without JavaScript</p><p class="lx-hint">Its plan link, for your note: this page\'s address followed by <code>' + esc(hashOf(SS, E0, E0.defaults())) + "</code></p>";
    if (!R || !R.sens) return h;
    var w = E0.sensWords(E0.defaults(), R.sens);
    return h + '<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Input (the equipment held fixed)</th><th scope="col">Low case</th><th scope="col">NPV</th><th scope="col">High case</th><th scope="col">NPV</th></tr></thead><tbody>' +
      R.sens.rows.map(function (r) { return "<tr><td>" + esc(r.label) + "</td><td>" + esc(r.loText) + '</td><td class="n">' + esc(m(r.atLo)) + "</td><td>" + esc(r.hiText) + '</td><td class="n">' + esc(m(r.atHi)) + "</td></tr>"; }).join("") +
      '</tbody></table></div><p class="lx-hint">The NPV at the default plan is ' + esc(m(R.sens.base)) + ". " + esc(w.note.replace(/^Green: above your NPV; red: below\. /, "")) + " Computed on " + esc(R.date) + ".</p>";
  }
  function staticBlocks(D, C, P, E0, SS, RN, EX, RB) {
    return { plan: SS.staticHTML(E0.schemaFor("c0"), E0.defaults()), nojs: nojsHTML(C, E0, SS), results: E0.fallback(D),
      note: RN.outlineHTML(C.note.fields, { sensitivity: "Sensitivity: every bar of the sensitivity chart in numbers, and what was held fixed" }),
      exemplars: EX.staticHTML(C.exemplars), rubric: RB.staticHTML(C.rubric.competences, { bar: C.rubric.bar }), inputs: E0.inputsHTML(D, P) };
  }
  // the strong exemplar's lines as the note's three fields (the screenshot's "done" state and the test)
  function exemplarWords(C) {
    var g = C.exemplars.answers.filter(function (a) { return a.key === "good"; })[0];
    var t = g.parts.map(function (q) { return typeof q === "string" ? q : q.text; }).join(""), L = {};
    t.split("\n").forEach(function (line) { var m = /^([A-Z][^:]{0,40}):\s*(.*)$/.exec(line); if (m) L[m[1]] = m[2]; });
    return { recommend: L.Recommendation + " " + L["CO₂"], alone: L.Alone, change: L.Sensitivity };
  }
  var model = { sensLine: sensLine, staticBlocks: staticBlocks, nojsHTML: nojsHTML, hashOf: hashOf, exemplarWords: exemplarWords };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.mount("c0", function (live, data, root) {
    var E0 = LX.E0, D = data.e0, C = data.c0_behind_one_meter, P = E0.prepare(D, data.town_year, data.cf_targets), S = E0.schemaFor("c0", "Behind one meter plan");
    var rh = document.getElementById("c0-results");
    rh.innerHTML = "";
    var sens = null, sensKey = null, sensFor = null, tornado = null, sensRun = null, sensHost = null, rn = null;
    var key = function (s) { return JSON.stringify(s); };
    // the sensitivity card sits with the results; it re-runs the plan whose results are drawn
    function onDraw(res, s, extra) {
      if (!sensHost) {
        sensHost = H("div", { class: "lx-xcard c0-sens" }, extra);
        var hd = H("header", { class: "lx-x-head" }, sensHost); H("h3", { text: C.sensitivity.title }, hd);
        H("p", { class: "lx-hint", text: C.sensitivity.lede }, sensHost);
        var box = H("div", null, sensHost), chart = H("div", { class: "c0-tornado" }, sensHost);
        tornado = LX.Tornado(chart, { fmt: E0.fmt.money, measure: "NPV", below: "var(--lx-bad)", above: "var(--lx-good)", pad: 0.55, padAbs: 0 });
        sensRun = LX.BenchRun(box, { label: "Run the sensitivity", state: function () { var l = B.run.last(); return l ? l.state : null; },
          solve: function (st, ctx) {
            var l = B.run.last();
            if (!l) return Promise.resolve({ status: "error", ok: false, message: "Run the year first." });
            sensFor = key(l.state);
            // inputs that change the operation re-run the whole year twice (14.6 s at 6x for the farm with everything,
            // solver bench 2026-11-08): the progress line counts the inputs
            ctx.step(1, E0.sensRows(l.state).length);
            return E0.sensitivity(l.state, P, l.r, { signal: ctx.signal, timeLimit: ctx.attempt > 1 ? 30 : 10, progress: function (i, n) { if (i < n) ctx.step(i + 1, n); } }).then(function (x) {
              return x ? { status: "optimal", ok: true, results: x } : { status: "error", ok: false, message: "A run of the sensitivity did not finish." };
            });
          },
          // a sensitivity of an earlier plan that ends after the year was run again is dropped, never drawn as this plan's
          render: function (x, st) { var l = B.run.last(); if (!l || key(l.state) !== key(st)) return; sens = x; sensKey = key(st); drawSens(st); },
          onDone: function () { if (rn) rn.refresh(); },
          results: [chart], busy: null, progress: { unit: "input" },
          words: { ok: "Done: each bar is the NPV with one input at its low or high value, the equipment held fixed." } });
      }
      if (sens && sensKey !== key(s)) { sens = null; sensKey = null; }
      if (sensRun.running() && sensFor !== key(s)) sensRun.cancel();   // new results for another plan: its sensitivity run stops
      drawSens(s);
      if (rn) rn.refresh();
    }
    function drawSens(s) {
      if (!tornado) return;
      if (!sens) { tornado.draw({ base: 0, rows: [], lede: "Run the sensitivity to see which input moves the NPV most." }); return; }
      tornado.draw({ base: sens.base, rows: sens.rows, lede: "**NPV of this plan**: " + E0.fmt.money(sens.base) + " at your settings (black line).",
        note: E0.sensWords(s, sens).note });
    }
    var B = E0.ui.bench(live, { P: P, schema: S, resultsHost: rh, id: "c0", onDraw: onDraw, onDone: function () { if (rn) rn.refresh(); }, onChange: function () { if (rn) rn.refresh(); } });
    // the note
    var nh = document.getElementById("c0-note");
    nh.innerHTML = "";
    rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c0-note", code: "C0", title: C.note.title, lede: C.note.lede, fields: C.note.fields,
      get: function () {
        var l = B.run.last(); if (!l) return null;
        var n = E0.note(l.state, l.r.results);
        n.link = B.ss.url();
        n.run = { ok: true, stale: !LX.ShareState.same(S, l.state, B.plan()), text: "every hour of 2025, as 52 weeks and 31 December" };
        n.sensitivity = sens && sensKey === key(l.state) ? sensLine(l.state, sens, E0) : null;
        return n;
      } });
    // the self-check: exemplars and the rubric
    var ex = document.getElementById("exemplars"); ex.innerHTML = "";
    LX.Exemplars(H("div", { class: "lx-xcard" }, ex), C.exemplars);
    var rb = document.getElementById("c0-rubric"); rb.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rb), { id: "c0-rubric", code: "C0", title: C.rubric.title, lede: C.rubric.lede, competences: C.rubric.competences, note: C.rubric.note, bar: C.rubric.bar });
    var first = B.run.run(B.plan());
    // demo states: "mid" = the default plan run and its sensitivity; "done" = that, plus the strong note's words in the
    // note's fields (for the note's screenshot)
    LX.demo(root, function (state) {
      if (state !== "mid" && state !== "done") return null;
      return first.then(function () { return sensRun ? sensRun.run(B.run.last().state) : null; }).then(function () {
        if (state === "done") {
          rn.set(exemplarWords(C));
        }
        return { view: state === "done" ? "note filled" : "sensitivity run" };
      });
    });
  });
})();
