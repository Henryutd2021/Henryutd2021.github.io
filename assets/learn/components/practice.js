/* practice.js — LX.Practice: faded practice sets with staged hints and an automatic check (promoted from bridges B1 and B3
   at the W1 merge, 2026-11-02; styles and the small exercise pieces in practice.css).
   LX.Practice(host, { id, title, lede, foot, blank, tracks: [{ label, intro, items: [{ key, kind, minutes, title, build }] }] })
     id      LX.store key: which exercises are done, in this browser only
     blank   the reason shown when Check is pressed with an empty answer
     tracks  sets of exercises that fade from a worked example to a blank page; kind "worked" | "partly" | "scratch";
             minutes is the honest time for one learner (the header adds them up)
     build(area, api) draws the exercise into `area` and registers, through api:
       api.hints([...])        two or three hints, shown one at a time ("Hint 1 of 3"); "Show the answer" appears after the last
       api.check(fn, {button}) fn() -> {ok, why} | null (null = nothing entered yet); {button: false} for a tap-to-answer item
       api.answer(fn)          fill in the answer (then the check runs)
       api.run()               run the check now (e.g. from a tap)
       api.done()              mark the exercise done when it has its own check (a builder with hints of its own)
   Returns { go(track, item, focus), cur(), find(key) -> [track, item] | null }.
   Keyboard: the set switcher and the exercise list are buttons; Enter in a number box runs the check; focus moves to the
   exercise title when one is opened. Classes: .lx-fp (card), .lx-fp-fade (exercise list), .lx-fp-ex (the open exercise);
   exercise pieces: .lx-fp-model, .lx-fp-tab, .lx-fp-pt, .lx-fp-ans, .lx-fp-ask, .lx-fp-worked, .lx-fp-choices. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  function seg(host, labels, sel, onPick, aria) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": aria || "Choose" }, host), bs = [];
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", "aria-pressed": i === sel ? "true" : "false", text: l }, g);
      b.addEventListener("click", function () { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); onPick(i); });
      bs.push(b);
    });
    return { el: g, set: function (i) { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); } };
  }
  var KIND = { worked: "Worked example", partly: "Partly worked", scratch: "From scratch" };
  LX.Practice = function (host, o) {
    var card = H("div", { class: "lx-card lx-fp" }, host), done = LX.store.get(o.id, {}) || {};
    var hd = H("div", { class: "lx-x-head" }, card); H("h3", { text: o.title }, hd);
    var cnt = H("span", { class: "lx-step-n", "aria-live": "polite" }, hd);
    if (o.lede) H("p", { class: "lx-fp-lede", html: LX.rich(o.lede) }, card);
    var tg = seg(H("div", { class: "lx-fp-bar" }, card), o.tracks.map(function (t) { return t.label; }), 0, function (i) { go(i, null, true); }, "Choose a practice set");
    var intro = H("p", { class: "lx-fp-intro" }, card), fade = H("ol", { class: "lx-fp-fade", "aria-label": "Exercises in this set" }, card);
    var ex = H("section", { class: "lx-fp-ex", "aria-live": "off" }, card);
    if (o.foot) H("p", { class: "lx-fp-foot", html: LX.rich(o.foot) }, card);
    var items = []; o.tracks.forEach(function (t) { items = items.concat(t.items); });
    var total = items.reduce(function (s, it) { return s + it.minutes; }, 0), T = 0, I = 0, cur = null;
    function tally() { cnt.textContent = items.filter(function (it) { return done[it.key]; }).length + " of " + items.length + " done · about " + total + " min"; }
    function mark(it) { done[it.key] = true; LX.store.set(o.id, done); tally(); paintFade(); }
    function paintFade() {
      fade.innerHTML = "";
      o.tracks[T].items.forEach(function (it, i) {
        var b = H("button", { type: "button", class: "lx-fp-step" + (done[it.key] ? " done" : ""), "aria-pressed": i === I ? "true" : "false",
          "aria-label": (i + 1) + ". " + KIND[it.kind] + ", about " + it.minutes + " minutes" + (done[it.key] ? ", done" : "") }, H("li", null, fade));
        H("span", { class: "lx-fp-k", html: (done[it.key] ? LX.icon("check") : "<b>" + (i + 1) + "</b>") + LX.esc(KIND[it.kind]) }, b);
        H("span", { class: "lx-fp-m", text: "about " + it.minutes + " min" }, b);
        b.addEventListener("click", function () { go(T, i, true); });
      });
    }
    function go(t, i, focus) {
      T = t; tg.set(t);
      var its = o.tracks[t].items, open1 = its.map(function (it) { return !done[it.key]; }).indexOf(true);
      I = i == null ? Math.max(0, open1) : i;
      intro.innerHTML = LX.rich(o.tracks[t].intro || ""); paintFade(); open(focus);
    }
    function open(focus) {
      var it = o.tracks[T].items[I], n = 0; ex.innerHTML = "";
      H("p", { class: "lx-eyebrow", text: KIND[it.kind] + " · " + (I + 1) + " of " + o.tracks[T].items.length + " · about " + it.minutes + " min" }, ex);
      var h = H("h4", { class: "lx-fp-title", text: it.title, tabindex: "-1" }, ex);
      var area = H("div", { class: "lx-fp-area" }, ex), reg = { hints: [], check: null, button: true, answer: null };
      var hb = H("div", { class: "lx-fp-hints", "aria-live": "polite" }, ex), acts = H("div", { class: "lx-fp-acts" }, ex), why = H("div", { class: "lx-fp-why", "aria-live": "polite" }, ex);
      var api = { hints: function (x) { reg.hints = x || []; }, check: function (fn, opt) { reg.check = fn; reg.button = !(opt && opt.button === false); },
                  answer: function (fn) { reg.answer = fn; }, run: run, done: function () { mark(it); nextOn(); } };
      cur = { api: api, hint: hint, show: show };
      it.build(area, api);
      var chk = reg.check && reg.button ? H("button", { type: "button", class: "lx-btn small", html: LX.icon("check") + "Check" }, acts) : null;
      var hbtn = reg.hints.length ? H("button", { type: "button", class: "lx-btn ghost small", text: "Hint 1 of " + reg.hints.length }, acts) : null;
      var sbtn = reg.answer ? H("button", { type: "button", class: "lx-btn ghost small", text: "Show the answer", hidden: true }, acts) : null;
      var last = T === o.tracks.length - 1 && I === o.tracks[T].items.length - 1;
      var nbtn = last ? null : H("button", { type: "button", class: "lx-btn ghost small lx-fp-next", hidden: !done[it.key],
        html: (I < o.tracks[T].items.length - 1 ? "Next exercise" : "Next set: " + LX.esc(o.tracks[T + 1].label)) + LX.icon("arrow") }, acts);
      if (chk) chk.addEventListener("click", run);
      if (hbtn) hbtn.addEventListener("click", hint);
      if (sbtn) sbtn.addEventListener("click", show);
      if (nbtn) nbtn.addEventListener("click", function () { if (I < o.tracks[T].items.length - 1) go(T, I + 1, true); else go(T + 1, 0, true); });
      area.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.tagName === "INPUT" && reg.check) { e.preventDefault(); run(); } });
      function run() {
        if (!reg.check) return;
        var r = reg.check(); why.innerHTML = "";
        if (!r) r = { ok: false, why: o.blank };
        H("div", { class: "lx-saw" + (r.ok ? "" : " no"), html: LX.icon(r.ok ? "check" : "question") + "<div>" + LX.rich(r.why) + "</div>" }, why);
        if (r.ok) { mark(it); nextOn(); }
      }
      function hint() {
        if (!hbtn || n >= reg.hints.length) return;
        H("p", { class: "lx-fp-hint", html: "<b>Hint " + (n + 1) + ".</b> " + LX.rich(reg.hints[n]) }, hb); n++;
        hbtn.textContent = n < reg.hints.length ? "Hint " + (n + 1) + " of " + reg.hints.length : "No more hints";
        hbtn.disabled = n >= reg.hints.length; if (sbtn) sbtn.hidden = n < reg.hints.length;
      }
      function show() { if (reg.answer) { reg.answer(); run(); } }
      function nextOn() { if (nbtn) nbtn.hidden = false; }
      if (focus) h.focus();
    }
    tally(); go(0, null, false);
    return { go: go, cur: function () { return cur; }, find: function (key) {
      for (var t = 0; t < o.tracks.length; t++) for (var i = 0; i < o.tracks[t].items.length; i++) if (o.tracks[t].items[i].key === key) return [t, i];
      return null; } };
  };
})();
