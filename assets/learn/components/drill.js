/* drill.js — LX.Drill: a seeded practice drill, a stream of short items in rotation with instant feedback and a running
   score (promoted from the toolbox, K1 to K4, at the W2 merge, 2026-11-03; K5 and K8 use it too). Numeric items use
   LX.NumAnswer (numanswer.js). Styles in drill.css.
   LX.Drill(host, { item, hint, title, seed, unit, check, empty, focus, width, widthPhone, cls, choicesClass })
     item(k, r)    the page's item maker: item k (0, 1, 2, ...) drawn with the seeded random source r (r() in [0, 1));
                   returns { q, why, choices?, answer, unit?, tol? }: with choices, answer is the index of the right one;
                   without, answer is a number and the reader types it
     hint          one line under the title (the kinds of item and an honest time)
     title         the card's heading (default "Practice drill")
     seed          the seed (default: a new one per visit, (Date.now() % 100000) + 1); the same seed gives the same items
     unit(it)      the unit shown after a numeric item's box (default it.unit or none)
     check(v, it)  is the typed number right? (default close(v, it.answer, it.tol): within tol, or exact without tol)
     empty         what an empty or non-numeric box does: a message string is shown and the item stays open ("Type a
                   number first."); false grades it as wrong; left out, nothing happens
     focus         where focus goes after "Next item": "question" (default; the question takes focus, tabindex -1),
                   "answer" (the first button or box of the new item), or false (focus stays on "Next item")
     width, widthPhone   the number box's widths (LX.NumAnswer)
     cls           extra classes on the card (page hooks); choicesClass extra classes on a choice item's button row
   Returns { card, seed, next(focus), current(), score() -> { right, done } }. Nothing is stored: the drill lives in this
   visit only. The score is announced (aria-live), and each item's feedback has its own live region.
   Pure (no DOM; Node: require("assets/learn/components/drill.js"); page: LX.Drill.rng, LX.Drill.series):
     rng(seed)              a small linear congruential generator: the same seed gives the same numbers in [0, 1)
     series(item, seed, n)  the first n items of a drill, as the view draws them (tests replay a seed with it)
     newSeed()              a seed for a new visit
   Classes: .lx-drill (the card), .lx-drill-q (the current item). Shared pieces: .lx-qtext, .lx-qbtns, .lx-choice
   (.right, .wrong), .lx-saw (.no). */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function rng(seed) { var x = seed >>> 0 || 1; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
  function series(item, seed, n) { var r = rng(seed), out = []; for (var k = 0; k < n; k++) out.push(item(k, r)); return out; }
  function newSeed() { return (Date.now() % 100000) + 1; }
  var pure = { rng: rng, series: series, newSeed: newSeed };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX;
  LX.Drill = function (host, o) {
    var H = LX.H, seed = o.seed != null ? o.seed : newSeed(), r = rng(seed), k = 0, right = 0, done = 0, cur = null;
    var focusMode = o.focus === undefined ? "question" : o.focus;
    var check = o.check || function (v, it) { return LX.NumAnswer.close(v, it.answer, it.tol); };
    var unitOf = o.unit || function (it) { return it.unit || ""; };
    var card = H("div", { class: "lx-card lx-drill" + (o.cls ? " " + o.cls : "") }, host);
    var top = H("div", { class: "lx-x-head" }, card); H("h3", { text: o.title || "Practice drill" }, top);
    var score = H("span", { class: "lx-step-n", "aria-live": "polite", text: "0 done" }, top);
    if (o.hint) H("p", { class: "lx-hint", text: o.hint }, card);
    var box = H("div", { class: "lx-drill-q" }, card);
    var next = H("button", { type: "button", class: "lx-btn ghost small", html: "Next item" + LX.icon("arrow") }, card);
    function show(focus) {
      var it = o.item(k, r); k++; box.innerHTML = ""; cur = it;
      var qp = H("p", { class: "lx-qtext", tabindex: focusMode === "question" ? "-1" : null, text: it.q }, box);
      var fb = null, answered = false;
      function mark(ok) {
        if (answered) return; answered = true; done++; if (ok) right++;
        score.textContent = right + " of " + done + " right";
        fb.innerHTML = ""; H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + LX.esc(it.why) + "</div>" }, fb);
      }
      if (it.choices) {
        var row = H("div", { class: "lx-qbtns" + (o.choicesClass ? " " + o.choicesClass : "") }, box);
        it.choices.forEach(function (c, i) {
          var b = H("button", { type: "button", class: "lx-choice", text: c }, row);
          b.addEventListener("click", function () { if (!answered) { b.classList.add(i === it.answer ? "right" : "wrong"); mark(i === it.answer); } });
        });
      } else {
        LX.NumAnswer(box, { label: "Answer", unit: unitOf(it), width: o.width, widthPhone: o.widthPhone, onCheck: function (v) {
          if (v == null && o.empty !== false) { if (o.empty) fb.textContent = o.empty; return; }
          mark(check(v, it));
        } });
      }
      fb = H("div", { "aria-live": "polite" }, box);   // the item's feedback, under its answer
      if (focus) {
        if (focusMode === "question") qp.focus();
        else if (focusMode === "answer") { var f = box.querySelector("button, input"); if (f) f.focus(); }
      }
    }
    next.addEventListener("click", function () { show(true); });
    show(false);
    return { card: card, seed: seed, next: show, current: function () { return cur; }, score: function () { return { right: right, done: done }; } };
  };
  LX.Drill.rng = rng;
  LX.Drill.series = series;
  LX.Drill.newSeed = newSeed;
})();
