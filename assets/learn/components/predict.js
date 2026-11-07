/* predict.js — predict, then reveal. The reader commits to a guess; the answer comes later and names the guess.
   JS:  const p = LX.Predict(host, { id: "g0-evening", q: "Who fills the evening gap?", answer: "gas",
                                     options: [{value: "gas", label: "Gas", color: "var(--lx-cc)"}, ...],
                                     feedback: {gas: "One sentence.", wind: "One sentence."}, lockText: "Locked in.", onPick: fn });
        p.reveal("extra sentence with the reader's own numbers")   |  p.picked()
        LX.Guess(host, { id, q, ticks: ["A day", "An hour", ...], answer: 4, start: 1, onLock: function (g, out) {} })
             a guess on an ordered scale (range input with labelled ticks); onLock adds the reveal into `out`
   Markup (works without JS; upgraded to buttons):
        <div class="lx-predict" data-predict="id"><p class="lx-q">Question?</p>
          <ul class="lx-choices"><li data-value="a">Option A</li> ...</ul></div>
        <div class="lx-reveal" data-reveal="id" data-answer="a"><details><summary>Show the answer</summary><p>...</p></details></div>
   title: false hides the question heading (the page shows the question itself); the choices are then named by q as plain
   text (aria-label), so a screen reader still hears what they answer.
   Guesses stay in this browser (LX.progress.guess). */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  // a question as plain text for an accessible name: glossary and lesson marks to their words, no bold marks or tags
  function plain(s) {
    return String(s).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().replace(/:$/, "");
  }
  LX.Predict = function (host, o) {
    var w = H("div", { class: "lx-predictbox" }, host);
    var qid = LX.uid("q");
    if (o.q && o.title !== false) H("p", { class: "lx-q", id: qid, html: LX.rich(o.q) }, w);
    // the choices are named by the question: through its heading, or, with title: false (the page shows the question
    // itself), by q as plain text (W5 final integration, from the A13 review); no q: "Your prediction"
    var ch = H("div", { class: "lx-choices-row", role: "group", "aria-label": !o.q ? "Your prediction" : o.title === false ? plain(o.q) : null, "aria-labelledby": o.q && o.title !== false ? qid : null }, w);
    var out = H("div", { class: "lx-predict-out", "aria-live": "polite" }, w);
    var btns = {}, picked = LX.progress.guess(o.id) || null, labels = (LX._guessLabels = LX._guessLabels || {})[o.id] = {};
    o.options.forEach(function (op) { labels[op.value] = op.label; });
    if (o.fresh) picked = null;
    o.options.forEach(function (op) {
      var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false" }, ch);
      if (op.color) H("span", { class: "sw", style: "--c:" + op.color }, b);
      H("span", { text: op.label }, b);
      b.addEventListener("click", function () {
        if (picked && o.once !== false && w.classList.contains("locked")) return;
        picked = op.value; paint(); LX.progress.guess(o.id, picked);
        w.classList.add("locked");
        if (o.lockText) { out.innerHTML = ""; H("p", { class: "lx-hint", text: o.lockText }, out); }
        if (o.onPick) o.onPick(picked);
      });
      btns[op.value] = b;
    });
    function paint() { Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === picked ? "true" : "false"); }); }
    paint();
    return {
      el: w, picked: function () { return picked; },
      reveal: function (extra) {
        if (btns[o.answer]) btns[o.answer].classList.add("right");
        if (picked && picked !== o.answer && btns[picked]) btns[picked].classList.add("wrong");
        out.innerHTML = "";
        var ok = picked === o.answer, fb = (o.feedback || {})[picked] || (o.feedback || {})[o.answer] || "";
        H("div", { class: "lx-saw" + (ok || !picked ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" +
          (picked ? (ok ? "You called it." : "Not quite.") : "The answer.") + "</b> " + LX.rich(fb) + (extra ? " " + LX.rich(extra) : "") + "</div>" }, out);
      }
    };
  };

  LX.Guess = function (host, o) {
    var w = H("div", { class: "lx-guess" }, host), id = LX.uid("g");
    if (o.q) H("p", { class: "lx-q", html: LX.rich(o.q) }, w);
    var sc = H("div", { class: "lx-guess-scale" }, w);
    H("label", { for: id, class: "lx-sr", text: o.srLabel || o.q || "Your guess" }, sc);
    var inp = H("input", { type: "range", id: id, min: 0, max: o.ticks.length - 1, step: 1, value: o.start || 0 }, sc);
    var ticks = H("div", { class: "lx-guess-ticks", "aria-hidden": "true", style: "grid-template-columns:repeat(" + o.ticks.length + ",minmax(0,1fr))" }, sc);
    var tk = o.ticks.map(function (a) { return H("span", { text: a }, ticks); });
    function mark() { tk.forEach(function (t, i) { t.classList.toggle("sel", i === +inp.value); }); inp.setAttribute("aria-valuetext", o.ticks[+inp.value]); }
    inp.addEventListener("input", mark); mark();
    var row = H("div", { class: "lx-step-foot" }, w);
    var lock = H("button", { class: "lx-btn small", type: "button", text: o.lockLabel || "Lock in my guess" }, row);
    var out = H("div", { class: "lx-predict-out", "aria-live": "polite" }, w);
    lock.addEventListener("click", function () {
      var g = +inp.value; inp.disabled = true; lock.hidden = true;
      if (tk[o.answer]) tk[o.answer].classList.add("ans");
      LX.progress.guess(o.id, g);
      if (o.onLock) o.onLock(g, out);
    });
    return { el: w };
  };

  // ---------------------------------------------------------------- markup upgrade
  function upgradePredict(box) {
    var id = box.getAttribute("data-predict"), list = box.querySelector(".lx-choices"); if (!id || !list) return;
    var q = box.querySelector(".lx-q"), host = H("div", null, null);
    var options = Array.prototype.map.call(list.querySelectorAll("li"), function (li) {
      return { value: li.getAttribute("data-value"), label: li.textContent.trim(), color: li.getAttribute("data-color") };
    });
    list.parentNode.replaceChild(host, list);
    LX.Predict(host, { id: id, q: q ? q.textContent : "", title: false, options: options,
      lockText: box.getAttribute("data-lock") || "Locked in. The answer comes later on the page.", onPick: function () { paintReveals(id); } });
  }
  function paintReveals(id) { document.querySelectorAll('.lx-reveal[data-reveal="' + id + '"]').forEach(function (r) { if (r._lx) r._lx(); }); }
  function upgradeReveal(box) {
    var id = box.getAttribute("data-reveal"), ans = box.getAttribute("data-answer"), det = box.querySelector("details"); if (!det) return;
    var line = H("p", { class: "lx-reveal-guess" }, null); box.insertBefore(line, det);
    box._lx = function () {
      var g = LX.progress.guess(id);
      line.innerHTML = g == null ? "You did not make a guess." : "You guessed <b>" + LX.esc(((LX._guessLabels || {})[id] || {})[g] || g) + "</b>." + (det.open ? (g === ans ? " Right." : " Not quite.") : "");
    };
    det.addEventListener("toggle", box._lx); box._lx();
  }
  LX.ready(function () {
    document.querySelectorAll(".lx-predict[data-predict]").forEach(upgradePredict);
    document.querySelectorAll(".lx-reveal[data-reveal]").forEach(upgradeReveal);
  });
})();
