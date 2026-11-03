// c0-behind-one-meter.js — Capstone C0, "Behind one meter: what should one home or one plant install?" (wave W3,
// 2026-11-03). Page: learn/c0-behind-one-meter.qmd (capstone form: Brief, Plan, Note, Self-check, Sources).
// Built on the Site Bench (SB0): the plan runs on engine E0 (assets/learn/components/engine-e0.js, LX.E0, in the bundle)
// through the same bench kit (LX.E0.ui.bench), under its own plan-link key (#c0-v1-...). This file adds the sensitivity
// chart (LX.Tornado over LX.E0.sensitivity, the plan held fixed), the one-page note (LX.ReportNote: the reader's three
// fields plus LX.E0.note), the exemplars (LX.Exemplars) and the self-check (LX.Rubric).
// Data: e0.json, town_year.json, cf_targets.json (the engine's), c0-behind-one-meter.json (note fields, exemplars,
// rubric), path.json (links to other lessons).
// The no-JS blocks (the plan's controls, the default plan's results, the note's outline, the exemplars, the rubric, the
// inputs and the sources) are written by _tests/learn/test_c0-behind-one-meter.js --write (staticBlocks below).
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  // the note's sensitivity line from tornado rows: the input with the widest swing ({ metric, input, held, base, cases })
  function sensLine(s, sens, E0) {
    if (!sens || !sens.rows || !sens.rows.length) return null;
    var r = sens.rows.slice().sort(function (a, b) { return Math.abs(b.atHi - b.atLo) - Math.abs(a.atHi - a.atLo); })[0], m = E0.fmt.money, f = E0.field(r.key);
    var at = r.key === "cost" ? s.cost + "% of the sourced costs" : E0.fmt.field(f, s[r.key]);
    return { metric: "The NPV", input: "the " + r.label.toLowerCase(), inputLabel: r.label, held: "the plan held fixed" + (r.rerun ? " and each case run again hour by hour" : ""),
      base: { at: at, value: m(sens.base) }, cases: [{ at: r.loText, value: m(r.atLo) }, { at: r.hiText, value: m(r.atHi) }] };
  }
  function staticBlocks(D, C, P, E0, SS, RN, EX, RB) {
    return { plan: SS.staticHTML(E0.schemaFor("c0"), E0.defaults()), results: E0.fallback(D), note: RN.outlineHTML(C.note.fields),
      exemplars: EX.staticHTML(C.exemplars), rubric: RB.staticHTML(C.rubric.competences), inputs: E0.inputsHTML(D, P) };
  }
  var model = { sensLine: sensLine, staticBlocks: staticBlocks };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.mount("c0", function (live, data, root) {
    var E0 = LX.E0, D = data.e0, C = data.c0_behind_one_meter, P = E0.prepare(D, data.town_year, data.cf_targets), S = E0.schemaFor("c0", "Behind one meter plan");
    var rh = document.getElementById("c0-results");
    rh.innerHTML = "";
    var sens = null, sensKey = null, tornado = null, sensRun = null, sensHost = null, rn = null;
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
            return E0.sensitivity(l.state, P, l.r, { signal: ctx.signal, timeLimit: ctx.attempt > 1 ? 30 : 10 }).then(function (x) {
              return x ? { status: "optimal", ok: true, results: x } : { status: "error", ok: false, message: "A run of the sensitivity did not finish." };
            });
          },
          render: function (x, st) { sens = x; sensKey = key(st); drawSens(st); },
          onDone: function () { if (rn) rn.refresh(); },
          results: [chart], busy: null,
          words: { ok: "Done: each bar is the NPV with one input at its low or high value, the plan held fixed." } });
      }
      if (sens && sensKey !== key(s)) { sens = null; sensKey = null; }
      drawSens(s);
      if (rn) rn.refresh();
    }
    function drawSens(s) {
      if (!tornado) return;
      if (!sens) { tornado.draw({ base: 0, rows: [], lede: "Run the sensitivity to see which input moves the NPV most." }); return; }
      tornado.draw({ base: sens.base, rows: sens.rows, lede: "**NPV of this plan**: " + E0.fmt.money(sens.base) + " at your settings (black line).",
        note: "Green: higher than your NPV; red: lower. A price case was run again through all 52 weeks." });
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
        n.run = { ok: true, stale: !LX.ShareState.same(S, l.state, B.plan()), text: "every hour of 2025, as 52 weeks" };
        n.sensitivity = sens && sensKey === key(l.state) ? sensLine(l.state, sens, E0) : null;
        return n;
      } });
    // the self-check: exemplars and the rubric
    var ex = document.getElementById("exemplars"); ex.innerHTML = "";
    LX.Exemplars(H("div", { class: "lx-xcard" }, ex), C.exemplars);
    var rb = document.getElementById("c0-rubric"); rb.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rb), { id: "c0-rubric", code: "C0", title: C.rubric.title, lede: C.rubric.lede, competences: C.rubric.competences, note: C.rubric.note });
    var first = B.run.run(B.plan());
    // demo states: "mid" = the default plan run and its sensitivity; "done" = that, plus the strong note's words in the
    // note's fields (for the note's screenshot)
    LX.demo(root, function (state) {
      if (state !== "mid" && state !== "done") return null;
      return first.then(function () { return sensRun ? sensRun.run(B.run.last().state) : null; }).then(function () {
        if (state === "done") {
          var g = C.exemplars.answers.filter(function (a) { return a.key === "good"; })[0], t = g.parts.map(function (q) { return typeof q === "string" ? q : q.text; }).join("");
          var parts = t.split(/(?<=\.)\s+/);
          rn.set({ recommend: parts[0] + " " + parts[1], alone: parts[2], change: parts[3] });
        }
        return { view: state === "done" ? "note filled" : "sensitivity run" };
      });
    });
  });
})();
