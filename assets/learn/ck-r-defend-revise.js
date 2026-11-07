// ck-r-defend-revise.js — CK-R, the Researcher checkpoint (curriculum v2 §3.3; wave W7, builder learn-w7-b, 2026-11-07).
//
// About 240 minutes. The reader defends their research capstone's (CR) question and method in a written mock review,
// answers the critique, revises, and reruns the main result from a clean clone. Because the reader's own study cannot be
// marked by a page, the checkpoint has two halves:
//   - seven auto-marked tasks on a fictional study (a co-op's night-pumping tariff, evaluated by difference-in-
//     differences): which concern matters most, which competence a concern belongs to, which response answers rather
//     than deflects, which change moves Method fit from Proficient to Strong, the steps of a clean-clone rerun, the size
//     of a rerun's difference, and what to report;
//   - five written tasks the reader rates against stated points: their review of the fictional proposal, then their own
//     mock review, response, revision log and rerun report.
// The worked solution (gated with the shared runner's gateAll; the shared late-answer rule) is the annotated example the
// curriculum names: a review, a response and a revision of the fictional study, with what moved it from Proficient to
// Strong (LX.Exemplars), the rerun worked through, and the seven marked answers.
// Task 1 first: the seven marked tasks are all on the co-op study, and their questions and feedback name concerns task 1's
// review should find for itself. The data gives each of them the shared runner's per-task option opensAfter: ["review"]
// (until task 1 is submitted, a notice in place of its question; the notice's words are the data's `wait`), and task 1
// freeze: true (once submitted, its text stays as written; its points can still be ticked). The level rule backs this up:
// a review submitted after a marked task was answered earns no points (reviewAfter, from the runner's outOfOrder).
//
// Data: assets/learn/data/ck-r-defend-revise.json. Pure part (exported for _tests/learn/test_ck-r-defend-revise.js):
// level, describe, summary, runnerData, exOpts, reviewAfter, firstDone and the page's static blocks (staticStudy,
// staticForms, staticTasks, staticSolution, staticCriteria), KEY, CODE, FIRST, after, checkNumeric.
(function () {
  "use strict";
  var CODE = "CK-R", KEY = "ckr-v1", ID = "ck-r-defend-revise", FIRST = "review";

  // ---------------------------------------------------------------- pure part
  var CPK = (typeof window !== "undefined" && window.LX && window.LX.Checkpoint) || require("./components/checkpoint.js");
  var EXS = (typeof window !== "undefined" && window.LX && window.LX.Exemplars) || require("./components/exemplars.js");
  var RICH = (typeof window !== "undefined" && window.LX && window.LX.rich) || require("./components/core.js").rich;
  function isAuto(t) { return t.kind === "choice" || t.kind === "order" || t.kind === "numeric"; }
  function isOpen(t) { return t.kind === "open-short"; }
  function points(st, t) { var r = st.tasks[t.id] || {}; return (r.points || []).filter(Boolean).length; }
  // a task first answered after the page's worked solution opened (D.solOpen: the runner's record): the shared
  // late-answer rule (the answer that opened it, the last of all, is not late)
  function after(D, st, t) { return CPK.lateAnswer(st.tasks[t.id], D.solOpen); }
  function firstRight(st, t, D) { return CPK.firstRight(st.tasks[t.id], "not-right") && !(D && after(D, st, t)); }
  // task 1 (the independent review of the co-op proposal) submitted: the seven marked tasks open then
  function firstDone(st) { var r = st.tasks[FIRST]; return !!(r && r.answer); }
  // task 1 submitted after one of the marked tasks (which wait for it) was answered: the runner keeps them shut until
  // then, so only a stored attempt from elsewhere could show it; its points do not count
  function reviewAfter(D, st) { return CPK.outOfOrder(D, st).indexOf(FIRST) >= 0; }
  // practice: the worked solution was open before every task was answered (this attempt's lock button or demo, recorded
  // as st.solEarly; or an earlier attempt in this browser)
  function assisted(D, st) {
    if (st.solEarly) return "early";
    var last = CPK.lastAnswerAt(D, st);
    if (D.solOpen && (!CPK.allAnswered(D, st) || !last || D.solOpen < last)) return "seen";
    return null;
  }
  // CK-R's published rule (the page says it before the tasks and in the rubric section). Proficient: at least
  // rule.autoProficient of the seven auto-marked tasks right on the first try, and at least rule.pointsProficient of the
  // four points of every written task; Strong: rule.autoStrong and every written point; Developing: rule.autoDeveloping.
  function level(D, st) {
    var R = D.rule, auto = D.tasks.filter(isAuto), opens = D.tasks.filter(isOpen);
    var k = auto.filter(function (t) { return firstRight(st, t, D); }).length;
    var rAfter = reviewAfter(D, st);
    var pts = opens.map(function (t) { return after(D, st, t) || (t.id === FIRST && rAfter) ? 0 : points(st, t); }), of = opens.map(function (t) { return t.points.length; });
    var late = D.tasks.filter(function (t) { return after(D, st, t); }).length, help = assisted(D, st);
    var complete = auto.every(function (t) { return st.tasks[t.id] && st.tasks[t.id].first != null; }) && opens.every(function (t) { return st.tasks[t.id] && st.tasks[t.id].answer; });
    var early = auto.filter(function (t) { return st.tasks[t.id] && st.tasks[t.id].solFirst && !after(D, st, t); }).length;
    var every = pts.every(function (p, i) { return p === of[i]; }), enough = pts.every(function (p) { return p >= R.pointsProficient; });
    var lv = R.levels[0];
    if (help) lv = R.practice;
    else if (k >= R.autoStrong && every) lv = R.levels[3];
    else if (k >= R.autoProficient && enough) lv = R.levels[2];
    else if (k >= R.autoDeveloping) lv = R.levels[1];
    return { level: lv, auto: k, autoOf: auto.length, points: pts, pointsOf: of, written: opens.map(function (t) { return t.title; }),
      complete: complete, early: early, late: late, assisted: help, estMin: -1, explainOk: every, reviewAfter: rAfter };
  }
  function describe(D, L) {
    if (L.assisted) return (L.assisted === "early" ? "The worked solution was opened before all " + D.tasks.length + " tasks were answered" : "The worked solution had already been open in this browser (an earlier attempt)") +
      ", so this attempt is practice and gets no level. Your answers and their feedback stay.";
    return "Auto-marked tasks right on the first try: " + L.auto + " of " + L.autoOf + (L.early ? " (" + L.early + " with the solution opened first, counted as not right)" : "") +
      (L.late ? ". Answered after the worked solution opened, so counted as practice (not right, no points): " + L.late + " task" + (L.late > 1 ? "s" : "") : "") +
      ". Points counted: " + L.written.map(function (w, i) { return w.charAt(0).toLowerCase() + w.slice(1) + " " + L.points[i] + " of " + L.pointsOf[i]; }).join("; ") + "." +
      (L.reviewAfter ? " Task 1 was submitted after a marked task was answered, so its points do not count." : "") +
      (L.complete ? "" : " Some tasks are not finished; the level counts them as not right.");
  }
  // the copied summary: keep its format fixed once testers use it
  function summary(D, st, env) {
    env = env || {};
    var L = level(D, st), total = 0, lines = [];
    D.tasks.forEach(function (t) { var r = st.tasks[t.id]; if (r && r.ms) total += r.ms; });
    lines.push("Learn · " + CODE + " results (" + D.version + ")");
    lines.push("Finished: " + (st.finished || "not yet") + " (this device's clock) · active time on this page " + CPK.fmtMs(total) + " (work on your own study is not timed)");
    lines.push("Level by the published rule: " + L.level + " (" + describe(D, L) + ")");
    lines.push("");
    lines.push("# | Part | Task | First answer | Tries | Time to first answer | Solution opened before answering");
    D.tasks.forEach(function (t, i) {
      var r = st.tasks[t.id] || {}, w = r.first == null ? (r.answer ? "submitted" : "not answered") : isOpen(t) ? points(st, t) + " of " + t.points.length + " points (self)" : r.first ? "right" : "not right";
      lines.push((i + 1) + " | " + t.part + " | " + CPK.shownTitle(D, st, t) + " | " + w + " | " + (r.tries || 0) + " | " + CPK.fmtMs(r.msFirst) + " | " + (after(D, st, t) ? "yes (the worked solution)" : r.solFirst ? "yes" : "no"));
    });
    // the reader's own texts in full, line by line (indented, so a mentor sees where each ends); nothing is cut
    D.tasks.forEach(function (t) {
      var r = st.tasks[t.id]; if (!r || !r.answer) return;
      if (isOpen(t)) {
        lines.push(""); lines.push("Your text, " + t.title.charAt(0).toLowerCase() + t.title.slice(1) + ":");
        String(r.answer).replace(/\r\n?/g, "\n").split("\n").forEach(function (x) { lines.push("  " + x.replace(/\s+$/, "")); });
      }
      if (t.kind === "numeric") lines.push("Your number, " + t.title.toLowerCase() + ": " + r.answer.value + " " + r.answer.unit);
    });
    lines.push("");
    lines.push("Screen width " + (env.width || "?") + " px. Kept in this browser only; copied by you.");
    return lines.join("\n");
  }
  function runnerData(D) {
    return { version: D.version, rule: D.rule, tasks: D.tasks.map(function (t) { var o = {}; for (var k in t) o[k] = t[k]; return o; }) };
  }
  // the worked exemplars as LX.Exemplars options (review, response, revision)
  function exOpts(D, key) {
    var W = D.worked[key], o = { title: W.title, task: W.task, answers: W.answers, lines: !!W.lines, note: W.note, id: "ckr-ex-" + key };
    if (W.diff) o.diff = W.diff;
    return o;
  }

  // ---- static blocks (written into the page by the test's --write mode; the page's scripts read the same data)
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plain(t) { return esc(String(t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1")); }
  function staticStudy(D) {
    var S = D.study;
    return "<h3>" + esc(S.title) + "</h3>\n<p>" + esc(S.who) + "</p>\n" +
      '<dl class="ckr-fields">' + S.fields.map(function (f) { return "<div><dt>" + esc(f[0]) + "</dt><dd>" + RICH(f[1]) + "</dd></div>"; }).join("") + "</dl>\n" +
      '<p class="lx-hint">' + esc(S.label) + "</p>";
  }
  function formText(f) { return f.lines.join("\n"); }
  function staticForms(D) {
    return D.forms.map(function (f) {
      return '<details class="lx-textalt ckr-form" data-form="' + esc(f.id) + '"><summary>' + esc(f.title) + " (" + esc(f.use.charAt(0).toLowerCase() + f.use.slice(1)) + ")</summary>" +
        "<pre>" + esc(formText(f)) + "</pre></details>";
    }).join("\n");
  }
  function staticTasks(D) {
    var h = ['<p class="lx-hint"><b>Without JavaScript:</b> nothing here is locked or marked, and the worked solution is further down the page, so use this list as practice. A level needs the interactive tasks.</p>',
      '<p class="lx-hint">Write task 1, your review, before you open the marked tasks: their questions name concerns your review should find.</p>', '<ol class="ckr-static">'];
    D.tasks.forEach(function (t) {
      var x = "<p>" + plain(t.prompt) + "</p>" + (t.tolNote ? '<p class="lx-hint">' + plain(t.tolNote) + "</p>" : "");
      if (t.kind === "choice") x += "<ul>" + t.options.map(function (o) { return "<li>" + o[0] + ". " + plain(o[1]) + "</li>"; }).join("") + "</ul>";
      if (t.kind === "order") x += "<ul>" + t.start.map(function (k) { return "<li>" + plain(t.items.filter(function (i) { return i[0] === k; })[0][1]) + "</li>"; }).join("") + "</ul><p>Put these in order.</p>";
      if (t.kind === "numeric") x += "<p>Answer with a number and a unit.</p>";
      if (isOpen(t)) x += "<p>Self-rated against " + t.points.length + " points, shown after you submit.</p>";
      var head = "<p><b>" + esc(t.title) + '</b> <span class="lx-hint">Part ' + esc(t.part) + " · " + esc(t.skill) + "</span></p>";
      // a task that waits for task 1: its title and skill, which could name a concern, are folded with its question
      if (t.opensAfter && t.opensAfter.length) {
        x = '<details class="ckr-later"><summary>Open after task 1, your review</summary><p><b>' + esc(t.title) + '</b> <span class="lx-hint">' + esc(t.skill) + "</span></p>" + x + "</details>";
        head = '<p><b>Opens after task 1</b> <span class="lx-hint">Part ' + esc(t.part) + "</span></p>";
      }
      h.push("<li>" + head + x + "</li>");
    });
    h.push("</ol>");
    return h.join("\n");
  }
  function exCard(D, key) {
    var o = exOpts(D, key);
    return '<div class="lx-xcard ckr-ex" id="ckr-ex-' + key + '"><header class="lx-x-head"><h3>' + esc(o.title) + "</h3></header>" +
      '<p class="lx-hint">' + esc(o.task) + "</p>\n" + EXS.staticHTML(o) + '\n<p class="lx-hint">' + esc(o.note) + "</p></div>";
  }
  function staticSolution(D) {
    var auto = D.tasks.filter(isAuto), h = [exCard(D, "review"), exCard(D, "response"), exCard(D, "revision")];
    h.push('<div class="lx-xcard"><header class="lx-x-head"><h3>The rerun, worked</h3></header><dl class="ckr-fields one">' +
      D.worked.rerun.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl></div>");
    h.push('<div class="lx-xcard"><header class="lx-x-head"><h3>The seven marked tasks</h3></header><div class="lx-scroll-x"><table class="lx-facts ckr-ans">' +
      '<thead><tr><th scope="col">Task</th><th scope="col">Answer</th><th scope="col">Why</th></tr></thead><tbody>' +
      auto.map(function (t) {
        var n = D.tasks.indexOf(t) + 1, a;
        if (t.kind === "choice") a = t.answer + ". " + plain(t.options.filter(function (o) { return o[0] === t.answer; })[0][1]);
        else if (t.kind === "order") a = t.items.map(function (x, i) { return (i + 1) + ". " + plain(x[1]); }).join(" ");
        else a = esc(t.answer.show.charAt(0).toUpperCase() + t.answer.show.slice(1));
        return '<tr><th scope="row">' + n + ". " + esc(t.title) + '</th><td data-l="Answer">' + a + '</td><td data-l="Why">' + RICH(t.solution) + "</td></tr>";
      }).join("") + "</tbody></table></div></div>");
    return h.join("\n");
  }
  function staticCriteria(D) {
    var L = ["Not yet", "Developing", "Proficient", "Strong"];
    return '<table id="ckr-rubric" class="lx-facts">\n<thead><tr><th scope="col">Criterion</th>' + L.map(function (l) { return '<th scope="col">' + l + "</th>"; }).join("") + "</tr></thead>\n<tbody>\n" +
      D.criteria.map(function (c) {
        return '<tr data-c="' + esc(c.id) + '"><th scope="row">' + esc(c.label) + "</th>" + c.levels.map(function (x, i) { return '<td data-l="' + L[i] + '">' + esc(x) + "</td>"; }).join("") + "</tr>";
      }).join("\n") + "\n</tbody>\n</table>";
  }
  var api = { CODE: CODE, KEY: KEY, ID: ID, FIRST: FIRST, level: level, describe: describe, summary: summary, runnerData: runnerData, exOpts: exOpts, after: after,
    reviewAfter: reviewAfter, firstDone: firstDone, isAuto: isAuto,
    staticStudy: staticStudy, staticForms: staticForms, staticTasks: staticTasks, staticSolution: staticSolution, staticCriteria: staticCriteria, formText: formText,
    checkNumeric: CPK.checkNumeric, checkOrder: CPK.checkOrder, checkChoice: CPK.checkChoice };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX || !window.LX.Checkpoint) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  // a "Copy the form" button under each form; without a clipboard the form shows in a box to select
  function formButtons(D) {
    D.forms.forEach(function (f) {
      var d = document.querySelector('.ckr-form[data-form="' + f.id + '"]'); if (!d || d.querySelector(".ckr-copy")) return;
      var row = H("div", { class: "ckr-copy" }, d), b = H("button", { type: "button", class: "lx-btn ghost small", text: "Copy the form" }, row);
      var msg = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
      var box = H("textarea", { readonly: "readonly", rows: "6", hidden: true, "aria-label": f.title + ", as text" }, d);
      b.addEventListener("click", function () {
        box.value = formText(f);
        LX.copyText(box.value, { select: box }).then(function (ok) {
          box.hidden = !!ok;
          msg.textContent = ok ? "Copied." : "Your browser did not allow copying: select the text below and copy it.";
        });
      });
    });
  }
  LX.mount(ID, function (live, data, root) {
    var D = data.ck_r_defend_revise, RD = runnerData(D);
    Object.defineProperty(RD, "solOpen", { get: function () { return LX.Checkpoint.solOpened(KEY); } });
    // gateAll: the worked solution opens once all twelve tasks are answered, in any order; late: the shared late-answer
    // rule, which the runner adds to the intro. Task 1 first comes from the tasks' own opensAfter and freeze options;
    // waitNote gives the waiting tasks the co-op study's words. Tasks 6, 7, 8 and 12 (the reader's own study) are open
    // throughout.
    var cp = LX.Checkpoint(live, { data: RD, key: KEY, code: CODE, lessonId: ID, intro: D.intro,
      lock: "#ckr-lock", solution: "#ckr-solution-body", gateAll: true, late: "practice", level: level, describe: describe, summary: summary, openFirst: "not-right",
      waitNote: D.wait });
    // the annotated review, response and revision, live (notes to open), inside the gated worked solution
    if (LX.Exemplars) ["review", "response", "revision"].forEach(function (k) {
      var h = document.getElementById("ckr-ex-" + k); if (!h) return;
      h.innerHTML = ""; LX.Exemplars(h, exOpts(D, k));
    });
    if (LX.copyText) formButtons(D);
    var cr = document.getElementById("ckr-course-rubric");
    if (cr && LX.Rubric) {
      cr.innerHTML = "";
      LX.Rubric(H("div", { class: "lx-xcard" }, cr), { id: "ckr-rubric-course", code: CODE, title: "Rate your study against the course rubric",
        lede: "The three competences this checkpoint shows, in the course's words.", competences: D.rubric });
    }
    LX.demo(root, function (state) {
      if (state === "mid") { cp.show(1); return { view: "task 2 (shut until task 1 is submitted)" }; }
      if (state === "done") { cp.results(); return { view: "results" }; }
      // the solution state opens it as the lock's button does, recorded (practice), never silently (CK-A review #1)
      if (state === "solution") { cp.solutionNow(); var s = document.getElementById("solution"); if (s) s.scrollIntoView(); return { view: "solution" }; }
      return null;
    });
  });
})();
