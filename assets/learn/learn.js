// learn/learn.js — shared components for the Learn section (pilot, 2026-11-02; design: reports 09, sections 4 and 7).
//   Learn.progress     lessons completed, guesses and quiz answers, kept in this browser only (localStorage, wrapped in
//                      try/catch: with storage blocked the page still works, it just forgets)
//   Learn.mount        start a lesson interactive: load its data files (data-src, space-separated JSON URLs), then
//                      init(root, helpers, data) with data = {basename: parsed JSON}, e.g. {town: ..., town_days: ...};
//                      the static fallback (.ex-fallback) stays visible unless init succeeds
//   back-to-top guard  hides the site's floating back-to-top button while it would cover lesson controls
//   predict / reveal   one-click guess before the interactive; the answer later on the page names the stored guess
//   quiz               "Check yourself" and "Myth or fact?": instant feedback that explains each option
//   course map         ticks completed lessons on the landing page; "mark complete" buttons on lesson pages
// Markup is complete without JavaScript (options as lists, answers in <details>); this file upgrades it.
// Helpers (el, scale, svg, responsive, ...) come from assets/explainers/common.js, which must load first.
(function () {
  "use strict";
  var KEY = "learn.v1";
  var H = window.Explainer && window.Explainer.helpers;
  document.documentElement.classList.add("lx-js");

  // ---------------------------------------------------------------- progress store
  function read() { try { return JSON.parse(window.localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function write(s) { try { window.localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
  function bucket(s, name) { if (!s[name] || typeof s[name] !== "object") s[name] = {}; return s[name]; }
  var progress = {
    isDone: function (id) { return !!bucket(read(), "done")[id]; },
    done: function (id, on) {
      var s = read(), d = bucket(s, "done");
      if (on === false) delete d[id]; else d[id] = new Date().toISOString().slice(0, 10);
      write(s); paintMap();
    },
    guess: function (id, value) {
      var s = read(), g = bucket(s, "guess");
      if (value === undefined) return g[id];
      g[id] = value; write(s);
    },
    answer: function (id, value) {
      var s = read(), a = bucket(s, "quiz");
      if (value === undefined) return a[id];
      a[id] = value; write(s);
    }
  };

  // ---------------------------------------------------------------- interactives
  function mount(slug, init) {
    document.querySelectorAll('.lx-interactive[data-learn="' + slug + '"]').forEach(function (root) {
      if (root.classList.contains("is-live")) return;
      var srcs = (root.getAttribute("data-src") || "").split(/\s+/).filter(Boolean);
      var go = function (data) {
        var live = document.createElement("div");
        live.className = "lx-live";
        root.appendChild(live);
        try { init(live, H, data); root.classList.add("is-live"); }
        catch (e) { console.error("Learn interactive " + slug + " failed:", e); root.removeChild(live); }
      };
      var fail = function (e) {
        console.error("Learn data " + srcs.join(", ") + " could not be loaded:", e);
        if (location.protocol === "file:") {
          var p = document.createElement("p");
          p.className = "lx-offline";
          p.textContent = "The interactive version needs the page to be served by a web server (for example with quarto preview); opened as a file, the browser blocks its data.";
          root.appendChild(p);
        }
      };
      if (!H) { console.error("Learn: assets/explainers/common.js must load before learn.js"); return; }
      if (!srcs.length) { go({}); return; }
      Promise.all(srcs.map(getJSON)).then(function (list) {
        var data = {};
        srcs.forEach(function (u, i) { data[u.split("/").pop().replace(/\.json$/, "").replace(/[^A-Za-z0-9_]/g, "_")] = list[i]; });
        go(data);
      }, fail);
    });
  }

  function getJSON(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ": " + r.status + " " + r.statusText); return r.json(); });
  }

  // ---------------------------------------------------------------- small DOM helpers
  function make(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function choicesOf(box) {
    return Array.prototype.map.call(box.querySelectorAll(".lx-choices > li"), function (li) {
      var why = li.querySelector(".lx-why");
      var label = Array.prototype.filter.call(li.childNodes, function (n) { return n !== why; })
        .map(function (n) { return n.textContent; }).join("").trim();
      return { li: li, value: li.getAttribute("data-value"), label: label, why: why ? why.innerHTML : "" };
    });
  }

  // ---------------------------------------------------------------- predict, then reveal
  function setupPredict(box) {
    var id = box.getAttribute("data-predict"), list = box.querySelector(".lx-choices");
    if (!id || !list) return;
    var opts = choicesOf(box), group = make("div", "lx-pick", null, null);
    group.setAttribute("role", "group");
    var q = box.querySelector(".lx-q");
    if (q) { if (!q.id) q.id = "lx-q-" + id; group.setAttribute("aria-labelledby", q.id); }
    var note = make("p", "lx-pick-note", null, null);
    note.setAttribute("aria-live", "polite");
    var buttons = opts.map(function (o) {
      var b = make("button", "lx-choice", o.label, group);
      b.type = "button"; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { progress.guess(id, o.value); paint(o.value, true); });
      return b;
    });
    function paint(v, fresh) {
      buttons.forEach(function (b, i) { b.setAttribute("aria-pressed", opts[i].value === v ? "true" : "false"); });
      if (v) {
        var o = opts.filter(function (x) { return x.value === v; })[0];
        note.textContent = (fresh ? "Saved: " : "Your guess: ") + (o ? o.label : v) + ". Keep it in mind; the answer comes after you play.";
      } else note.textContent = "One click. Your guess stays in this browser.";
      document.querySelectorAll('.lx-reveal[data-reveal="' + id + '"]').forEach(function (r) { r._lxPaint && r._lxPaint(); });
    }
    list.parentNode.replaceChild(group, list);
    group.parentNode.insertBefore(note, group.nextSibling);
    var old = box.querySelector(".lx-nojs"); if (old) old.hidden = true;
    box._lxOptions = opts;
    paint(progress.guess(id), false);
  }

  function setupReveal(box) {
    var id = box.getAttribute("data-reveal"), answer = box.getAttribute("data-answer");
    var src = document.querySelector('.lx-predict[data-predict="' + id + '"]');
    var det = box.querySelector("details");
    if (!id || !det) return;
    var line = make("p", "lx-reveal-guess", null, null);
    box.insertBefore(line, det);
    box._lxPaint = function () {
      var g = progress.guess(id), opts = (src && src._lxOptions) || [];
      var o = opts.filter(function (x) { return x.value === g; })[0];
      line.innerHTML = "";
      if (!g) { line.textContent = "You did not make a guess. Here is the answer."; return; }
      line.appendChild(document.createTextNode("You guessed: "));
      make("strong", null, o ? o.label : g, line);
      line.appendChild(document.createTextNode(". "));
      if (det.open) make("span", g === answer ? "lx-ok" : "lx-no", g === answer ? "That's right." : "Not quite, and that is a common guess.", line);
    };
    det.addEventListener("toggle", box._lxPaint);
    box._lxPaint();
  }

  // ---------------------------------------------------------------- quiz and myth-or-fact cards
  function setupQuestion(q, qid) {
    var answer = q.getAttribute("data-answer"), list = q.querySelector(".lx-choices");
    if (!answer || !list) return;
    var opts = choicesOf(q), group = make("div", "lx-pick lx-pick-quiz", null, null);
    group.setAttribute("role", "group");
    var stem = q.querySelector(".lx-qtext");
    if (stem) { if (!stem.id) stem.id = qid + "-stem"; group.setAttribute("aria-labelledby", stem.id); }
    var fb = make("div", "lx-feedback", null, null);
    fb.setAttribute("aria-live", "polite");
    var buttons = opts.map(function (o) {
      var b = make("button", "lx-choice", o.label, group);
      b.type = "button";
      b.addEventListener("click", function () { progress.answer(qid, o.value); paint(o.value); });
      return b;
    });
    function paint(v) {
      buttons.forEach(function (b, i) {
        var o = opts[i];
        b.classList.toggle("is-right", !!v && o.value === v && v === answer);
        b.classList.toggle("is-wrong", !!v && o.value === v && v !== answer);
        b.setAttribute("aria-pressed", o.value === v ? "true" : "false");
      });
      q.classList.toggle("is-answered", !!v);
      q.classList.toggle("is-correct", v === answer);
      fb.innerHTML = "";
      if (!v) return;
      var o = opts.filter(function (x) { return x.value === v; })[0];
      var head = make("p", v === answer ? "lx-ok" : "lx-no", v === answer ? "Correct." : "Not quite. Try another option.", fb);
      head.setAttribute("role", "status");
      if (o && o.why) { var p = make("p", "lx-why-shown", null, fb); p.innerHTML = o.why; }
      score(q.closest(".lx-quiz"));
    }
    list.parentNode.replaceChild(group, list);
    group.parentNode.insertBefore(fb, group.nextSibling);
    var det = q.querySelector("details.lx-answer"); if (det) det.hidden = true;
    paint(progress.answer(qid));
  }
  function score(quiz) {
    if (!quiz) return;
    var out = quiz.querySelector(".lx-score");
    if (!out) { out = make("p", "lx-score", null, quiz); out.setAttribute("aria-live", "polite"); }
    var qs = quiz.querySelectorAll(".lx-qq"), right = quiz.querySelectorAll(".lx-qq.is-correct").length,
        answered = quiz.querySelectorAll(".lx-qq.is-answered").length;
    out.textContent = answered ? right + " of " + qs.length + " right so far." + (right === qs.length ? " Well done." : "") : "";
  }
  function setupQuiz(quiz) {
    var id = quiz.getAttribute("data-quiz") || "quiz";
    quiz.querySelectorAll(".lx-qq").forEach(function (q, i) { setupQuestion(q, id + "-" + (q.getAttribute("data-id") || i + 1)); });
    score(quiz);
  }

  // ---------------------------------------------------------------- course map and completion
  function paintMap() {
    document.querySelectorAll("[data-lesson-id]").forEach(function (n) {
      var done = progress.isDone(n.getAttribute("data-lesson-id"));
      n.classList.toggle("is-done", done);
      var tag = n.querySelector(".lx-done-tag");
      if (tag) tag.hidden = !done;
    });
    document.querySelectorAll("[data-complete]").forEach(function (b) {
      var done = progress.isDone(b.getAttribute("data-complete"));
      b.setAttribute("aria-pressed", done ? "true" : "false");
      b.textContent = done ? "✓ Completed (click to undo)" : "Mark this lesson as complete";
    });
  }
  function setupComplete(b) {
    b.hidden = false;
    b.addEventListener("click", function () {
      var id = b.getAttribute("data-complete");
      progress.done(id, !progress.isDone(id));
    });
  }

  // ---------------------------------------------------------------- keep the back-to-top button off lesson controls
  function guardToTop() {
    var zones = document.querySelectorAll(".lx-interactive, .lx-quiz, .lx-predict");
    if (!zones.length) return;
    var pending = false;
    function check() {
      pending = false;
      var btn = document.querySelector(".to-top");
      if (!btn) return;
      // the button's box (fixed, bottom right); while it is hidden, use where it would appear
      var s = getComputedStyle(btn), w = btn.offsetWidth || 42, hgt = btn.offsetHeight || 42;
      var right = window.innerWidth - (parseFloat(s.right) || 19), bottom = window.innerHeight - (parseFloat(s.bottom) || 19);
      var b = { left: right - w - 8, right: right + 8, top: bottom - hgt - 8, bottom: bottom + 8 };
      var hit = Array.prototype.some.call(zones, function (z) {
        var r = z.getBoundingClientRect();
        return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      });
      document.body.classList.toggle("lx-totop-off", hit);
    }
    function request() { if (!pending) { pending = true; window.requestAnimationFrame(check); } }
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    request();
  }

  function start() {
    document.querySelectorAll(".lx-predict").forEach(setupPredict);
    document.querySelectorAll(".lx-reveal").forEach(setupReveal);
    document.querySelectorAll(".lx-quiz").forEach(setupQuiz);
    document.querySelectorAll("button[data-complete]").forEach(setupComplete);
    guardToTop();
    paintMap();
  }

  window.Learn = { progress: progress, mount: mount, helpers: H };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
