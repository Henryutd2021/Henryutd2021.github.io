/* checkpoint.js — LX.Checkpoint: the runner of the tier checkpoints (CK-F, CK-A, CK-M and CK-R use it). One task at
   a time; a clock that runs only while a task is on screen and the tab is visible; first-try recording; five task
   kinds; a rubric self-rating read from the page's rubric table; a results view; and a plain-text summary the reader can
   copy, to keep or to share with a mentor (nothing is sent anywhere). Unfinished answers are kept as drafts (below).
   var cp = LX.Checkpoint(host, { data: D, key: "ckf-v1", code: "CK-F", lessonId: "ck-f-estimate",
     intro: ["Nine tasks, about 40 minutes: ...", "No hints. ...", "Your answers and times stay in this browser. ..."],
     rubric: "#ckf-rubric", lock: "#ckf-lock", solution: "#ckf-solution-body",
     chart: function (t, body) { LX.Checkpoint.lineChart(body, D.charts[t.chart], series, label); },
     estimateNote: "Two routes ... are in the <a href=\"#solution\">Worked solution</a> section below; it opens when you submit." });
   data (D): { version: "ck-f v1 (2 Nov 2026)",
               rule: { auto: 7, autoProficient: 5, autoStrong: 6, autoDeveloping: 3 (default 3), criteria: ["units", ...],
                       levels: ["Not yet", "Developing", "Proficient", "Strong"] },
               tasks: [{ id, kind, title, lesson (draws on), skill, prompt, solution (one or two sentences), ... }] }
               solution, points and choice feedback (why) take [[glossary-id|words]] marks; prompts stay plain (no hints)
     kinds   "choice"      options: [[value, text]], answer, why: {value: feedback}, chart (optional: drawn by o.chart)
             "order"       items: [[key, text]] in the right order; start: [keys], the shuffled start (↑ ↓ buttons)
             "numeric"     answer: {mwh, tol} with units: [[name, factor to MWh]] (0 or null: a unit of power, flagged as
                           such; CK-F); or, for any unit, answer: {value, tol (relative), show} with units: [[name, factor to
                           the answer's unit]] (null: a unit of the wrong kind; unitNote: {name: why}; CK-M)
             "open-short"  points: [the sentences a full answer makes]; after submitting, the reader ticks the points made
             "estimate"    units (as numeric), range: [lo, hi] MWh a year, show: [lo, hi] as printed; low, high (above the low), unit and
                           three short texts (inputs and steps, the main uncertainty, a check); then a self-rating per rubric
                           criterion. The worked-solution section of the page opens on submit. Where the range sits against
                           the worked one is shown as a neutral comparison, not a mark (the rubric judges the reasoning);
                           the record's `first` is true for a valid estimate (energy units, a high above the low)
     per task (any kind; a task without them behaves as before)
             opensAfter    [task ids]: the task opens only once each named task is submitted (a first answer recorded, or
                           a written task submitted). Until then its card shows, in place of its question, answers, early
                           button and worked solution, a notice and a "Go to task N" button; its clock does not run; its
                           tag, the results table and the copied summary name it "Opens after task 1" in place of its
                           title, skill and lessons. For a task whose question, title or feedback would shape the answer
                           to another (CK-R: task 1, the reader's own review, comes before the seven marked tasks that
                           name its concerns)
             freeze        true: once submitted, the task's answer stays as given (read-only text and number fields, a
                           fixed unit, choices and order buttons disabled); a line in place of the submit button says so
                           (freezeNote, else a default), describes the kept controls and takes focus after the submission.
                           A written task's points and the estimate's self-ratings can still be ticked. Feedback on a wrong
                           first answer then points to the worked solution, not to a retry. Written tasks (open-short,
                           estimate) take it so that the first submission is the one assessed
             solAfter      [task ids]: the task's worked solution, and a written task's points to tick, open only once each
                           named task is submitted too: for a task whose solution names another task's answer (CK-A: the
                           main result's solution names the up-front cost). Until then a notice stands in their place and
                           the early button is not offered. solWaits(D, st, task) names the tasks still waited for; a
                           page's test checks with solLeaks(D) that no solution names an answer it does not wait for
   An empty or non-positive number is never recorded as an answer (every number task asks for a positive value).
   Options:
     key         LX.store key of the attempt; an attempt stored under another data.version starts afresh. Keep it fixed
                 once readers use a checkpoint (CK-F: "ckf-v1"), so their summaries stay comparable.
     code        the checkpoint's code: the summary's first line is "Learn · <code> results (<version>)"
     lessonId    marked complete (LX.progress.done) when the level is Proficient or Strong
     intro       the overview card's sentences (default: a generic three)
     rubric      selector of the rubric table: <tr data-c="criterion id"><th>name</th><td>Not yet</td>...<td>Strong</td></tr>
     lock        selector of the box shown until the submit task (below; CK-F: the estimate) is answered; its <button> opens
                 the solution early (recorded), as does that task's own "Show the worked solution now"; "Start again" shuts
                 it again
     solution    selector of the worked-solution block; give it class lx-ck-gated in the page, so it stays shut with
                 JavaScript until opened (without JavaScript it shows)
     chart       function (task, body): draws a chart task's chart (LX.Checkpoint.lineChart helps)
     estimateNote  HTML for the estimate's in-task solution box (default: a pointer to the Worked solution section)
     checks      { choice, order, numeric, estimate }: replace a pure check (same arguments and result fields)
     tolerance   false hides the line under a number task's answer field that states its tolerance (default: shown, from
                 the task's tolNote, else "Within 1% of the right value counts as right." from answer.tol)
     openFirst   "not-right": in the shared level rule, a task whose worked solution was opened before its first answer
                 counts as not right (independent work only; data.rule.openFirst sets it too): an auto-marked task as
                 not right, a written task with no points, the estimate with no self-ratings (writtenCounts below);
                 default "counts"
     level, summary  replace the pure level rule or the summary text (same arguments)
     describe    function (D, L): the results view's sentence under the level (L = the level rule's result); default
                 describe(), which names CK-F's parts (auto-marked tasks, the estimate's lowest self-rating, the explanation)
     submitTask  the id of the task whose answer opens the page's worked solution (lock and solution above), or whose own
                 "Show the worked solution now" opens it early (recorded); default: the first estimate task (CK-F). CK-M
                 names its final open-short task
     onAnswer    function (taskId, record, state): called after each recorded answer, and when a solution is opened before
                 answering (record.solFirst), for pages that keep their own state beside the runner's
     gateAll     true: the page's worked solution (lock and solution above) opens only once every task is answered (a
                 first answer, or a written task submitted), in any order, never by one task; the lock's button and
                 solutionNow() still open it early, recorded on the attempt (state.solEarly, the ISO time); each task's
                 own "Show the worked solution now" opens only that task's solution (answering the submit task first
                 never opens every answer)
     late        "practice": the shared late-answer rule. A task first answered after the page's worked solution opened
                 (its `at` later than LX.Checkpoint.solOpened(key)) counts as practice: an auto-marked task as not right, a
                 written task's points and the estimate's self-ratings not at all; the answer that opened it is not late
                 (its `at` is the opening time). The runner adds the rule to the intro (lateRule) so it is said up front;
                 the results name the late tasks, and the copied summary marks them. Default: off (CK-F's rule)
     waitNote    for tasks with opensAfter: { question, why } (text, and HTML for the notice), or function (task, ids
                 waited for, D) returning them; default waitText(D, task, ids): "This task opens once task 1 is
                 submitted." and why
     A page's own level function gets a third argument { solOpen, late, gateAll } (solOpen: when the page's worked
     solution first opened for this runner, or null). The runner keeps a task with opensAfter shut, so only an attempt
     stored elsewhere can answer it first; outOfOrder(D, st) names the tasks submitted after a task that waits for them
     was answered, for a page's level rule to drop their credit (CK-R does; the shared rule has no such tasks).
   Returns { show(i), results(), intro(), state(), solutionNow(), destroy() }. solutionNow() opens the page's worked
   solution early, recorded on the submit task as above. destroy() stops the clock, saves, removes the runner's document,
   window and lock-button listeners and its markup, so a page can swap runners (CK-M keeps one per variant on screen); the
   page's worked-solution block stays as it is. A stored, finished attempt opens on the results (unless the address has a
   #hash); otherwise the overview.
   Drafts: what a reader types or picks in a task before submitting it (a text, a number and its unit, the estimate's
   fields, an order not yet checked) is saved on input under "<key>-drafts" ({version, tasks: {id: draft}}), apart from
   the attempt, and restored when the task is shown again (Next, Back, the overview, a reload). A draft is never a
   submission: it does not open a task that waits (opensAfter), does not freeze, record a try or a time, open a worked
   solution or enter the results and the copied summary. Submitting the task clears its draft; "Start again" clears all.
   A frozen task shows its submitted answer, never a draft.
   Measures, per task (stored under data.tasks ids): ms (active time), msFirst (time to the first answer), tries, first
   (first answer right; for open-short, all points ticked), solFirst (solution opened before answering), skipped, answer,
   at (ISO time of the first answer). The time the page's worked solution first opened is kept per runner, under
   "<key>-sol-open", and survives "Start again": LX.Checkpoint.solOpened(key) reads it (CK-M's rule compares it with the
   final task's `at`). Stored attempts need no new data version: the new fields are only added.
   Keyboard: every control is a native button, input, select or radio; the task's prompt takes focus on each new task; the
   order task's ↑ ↓ buttons keep focus on the moved item. The results table becomes labelled lines on phones.
   Text version: LX.Checkpoint.lineChart adds a table of the hourly values.
   Pure (Node: module.exports): task, checkChoice, checkOrder, checkNumeric (either answer form), checkMWh, checkValue,
   checkEstimate, level(D, st, {openFirst, late, solOpen}), firstRight(record, openFirst), writtenCounts(record,
   openFirst), lateAnswer(record, solOpen), allAnswered(D, st), lastAnswerAt(D, st), lateRule({gateAll, n}), tolText(task),
   describe, summary, fmtMs, firstWord; for the per-task options: submitted(record), waitsFor(D, st, task),
   solWaits(D, st, task), solLeaks(D), outOfOrder(D, st), taskList(D, ids), waitText(D, task, ids), shownTitle(D, st,
   task), openProblems(D) (unknown or circular opensAfter or solAfter names; a page's test should find none).
   level and summary find the explanation and the estimate as the first "open-short" and the first "estimate" task. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure part
  function task(D, id) { for (var i = 0; i < D.tasks.length; i++) if (D.tasks[i].id === id) return D.tasks[i]; return null; }
  function ofKind(D, kind) { for (var i = 0; i < D.tasks.length; i++) if (D.tasks[i].kind === kind) return D.tasks[i]; return null; }
  function checkChoice(t, v) { return { right: v === t.answer, why: (t.why || {})[v] || "" }; }
  function checkOrder(t, order) {
    var want = t.items.map(function (x) { return x[0]; }), at = order.map(function (k, i) { return k === want[i]; });
    return { right: at.every(Boolean), places: at, n: at.filter(Boolean).length };
  }
  function unitFactor(t, u) { for (var i = 0; i < t.units.length; i++) if (t.units[i][0] === u) return t.units[i][1]; return undefined; }
  // a numeric task: answer {value, tol, show} for any unit (checkValue), else answer {mwh, tol} in MWh (checkMWh, CK-F)
  function checkNumeric(t, value, unit) { return t.answer && t.answer.value != null ? checkValue(t, value, unit) : checkMWh(t, value, unit); }
  function checkMWh(t, value, unit) {
    var f = unitFactor(t, unit);
    if (!(value > 0)) return { right: false, msg: "Enter a positive number." };
    if (f === 0 || f === null) return { right: false, power: true, msg: unit + " measures power, a rate. Energy over a year needs MWh or GWh." };
    var mwh = value * f, a = t.answer, rel = Math.abs(mwh - a.mwh) / a.mwh;
    return { right: rel <= a.tol, mwh: mwh, rel: rel,
      msg: rel <= a.tol ? "Right: about " + Math.round(a.mwh / 1000) + " GWh." : mwh > a.mwh * 2.5 ? "Too high. Did every hour count at full output?" : mwh < a.mwh / 2.5 ? "Too low. Check the hours in a year and the units." : "Close, but more than 10% off. Recheck the multiplication." };
  }
  // a number with any unit (first used by CK-M): units [[name, factor to the answer's unit]] (null: a unit of the wrong
  // kind, unitNote[name] saying why; result kind: true); answer {value, tol (relative), show}
  function checkValue(t, value, unit) {
    var f = unitFactor(t, unit);
    if (!(value > 0)) return { right: false, msg: "Enter a positive number." };
    if (f === null) return { right: false, kind: true, msg: (t.unitNote || {})[unit] || unit + " is the wrong kind of unit for this answer." };
    if (f === undefined) return { right: false, msg: "Choose a unit." };
    var v = value * f, a = t.answer, rel = Math.abs(v - a.value) / a.value;
    return { right: rel <= a.tol, value: v, rel: rel,
      msg: rel <= a.tol ? a.show.charAt(0).toUpperCase() + a.show.slice(1) + "." : v > a.value * 1.5 ? "Too high. Recheck your model and its units." : v < a.value / 1.5 ? "Too low. Recheck your model and its units." : "Close, but outside the tolerance (" + Math.round(a.tol * 1000) / 10 + "%). Recheck your numbers." };
  }
  // the estimate: units, order, and how the range sits against the worked solution's range (MWh a year). A range needs
  // a high above its low: one number (low = high) shows no uncertainty, which the rubric marks Not yet. Where the range
  // sits is a comparison, not a mark: another range is fine when its inputs are stated and defensible (the rubric)
  var NOT_A_MARK = " That is a comparison, not a mark: a different range can be right if its inputs are stated and defensible. Compare them with its two routes.";
  function checkEstimate(t, low, high, unit) {
    var f = unitFactor(t, unit), out = { unitsOk: f > 0, ordered: low > 0 && high > low };
    if (f === null) out.unitMsg = unit + " is a unit of power. Electricity used over a year is energy: kWh, MWh or GWh per year.";
    else if (!(f > 0)) out.unitMsg = "Choose a unit.";
    else out.unitMsg = "Energy per year: the right kind of unit.";
    if (out.unitsOk && out.ordered) {
      var lo = low * f, hi = high * f, R = t.range;
      out.lo = lo; out.hi = hi; out.overlaps = lo <= R[1] && hi >= R[0]; out.width = lo > 0 ? hi / lo : Infinity;
      if (out.overlaps) out.rangeMsg = "Your range overlaps the worked solution's (about " + t.show[0] + " to " + t.show[1] + " MWh a year).";
      else if (hi < R[0]) out.rangeMsg = "Your range lies below the worked solution's, by about " + Math.round(R[0] / hi) + " times at its closest." + NOT_A_MARK;
      else out.rangeMsg = "Your range lies above the worked solution's, by about " + Math.round(lo / R[1]) + " times at its closest." + NOT_A_MARK;
      if (out.width > 10) out.rangeMsg += " Your high is more than ten times your low: narrow it with a stated input.";
    } else if (!out.ordered) out.rangeMsg = low > 0 && high === low
      ? "Your low and high are the same number, so they show no range. Give a high above your low that brackets your uncertainty."
      : "Give a low and a high value, with the high above the low.";
    return out;
  }
  // the line under a number task's answer field: its tolerance, before the first answer (t.tolNote, else from answer.tol)
  function tolText(t) {
    if (t.tolNote) return t.tolNote;
    var a = t.answer || {}, tol = a.tol;
    if (!(tol > 0)) return "";
    return "Within " + Math.round(tol * 1000) / 10 + "%" + (a.value != null ? " of the right value" : "") + " counts as right.";
  }
  function isAuto(t) { return t.kind === "choice" || t.kind === "order" || t.kind === "numeric"; }
  // a task's first answer counts as right; with openFirst "not-right" (independent work), not when its worked solution
  // was opened before that answer (solFirst). Default "counts": CK-F's published rule.
  function firstRight(r, openFirst) { return !!(r && r.first === true && !(openFirst === "not-right" && r.solFirst)); }
  // a written task (open-short, estimate) counts: its points or self-ratings, unless openFirst is "not-right" and its
  // worked solution was opened before it was submitted
  function writtenCounts(r, openFirst) { return !!r && !(openFirst === "not-right" && r.solFirst); }
  // the shared late-answer rule (option late "practice"): a task first answered after the page's worked solution opened
  // (solOpen, ISO time) is practice. The answer that opened it is not late: the runner records the opening at that
  // answer's own `at`. ISO strings from toISOString compare in time order.
  function lateAnswer(r, solOpen) { return !!(solOpen && r && r.at && r.at > solOpen); }
  // every task answered: a first answer recorded, or a written task submitted (gateAll opens the worked solution then)
  function allAnswered(D, st) {
    return D.tasks.every(function (t) { var r = st.tasks[t.id]; return !!(r && (r.first != null || r.answer != null)); });
  }
  // ---- per-task opening and freezing (task.opensAfter, task.freeze)
  // a task's record is submitted once a first answer is recorded, or a written task submitted (as allAnswered counts it)
  function submitted(r) { return !!(r && (r.first != null || r.answer != null)); }
  // the tasks a task still waits for (its opensAfter ids not yet submitted), in task order; [] when it is open
  function waitsFor(D, st, t) {
    var need = (t && t.opensAfter) || [];
    return D.tasks.filter(function (x) { return need.indexOf(x.id) >= 0 && !submitted(st.tasks[x.id]); }).map(function (x) { return x.id; });
  }
  // the tasks a task's worked solution still waits for (its solAfter ids not yet submitted), in task order
  function solWaits(D, st, t) {
    var need = (t && t.solAfter) || [];
    return D.tasks.filter(function (x) { return need.indexOf(x.id) >= 0 && x.id !== t.id && !submitted(st.tasks[x.id]); }).map(function (x) { return x.id; });
  }
  // the numbers a task's answer is given as (a number task's value, in its own unit; CK-F's in MWh and GWh)
  function numsIn(s) { return (String(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(function (x) { return parseFloat(x.replace(/,/g, "")); }); }
  function answerNums(t) {
    if (t.kind !== "numeric" || !t.answer) return [];
    var a = t.answer, out = [];
    if (a.value != null) out.push(Math.abs(a.value));
    if (a.mwh != null) out.push(a.mwh, a.mwh / 1000);
    return out.filter(function (v) { return v >= 10; });   // its value (0.5% covers the rounded forms); small numbers match by chance
  }
  // the texts a task shows after its answer (its worked solution, its points, its choices' feedback)
  function afterText(t) {
    var w = t.why || {}; return [t.solution || ""].concat(t.points || [], Object.keys(w).map(function (k) { return w[k]; })).join(" ");
  }
  // solution leaks: a task whose after-answer texts name another number task's answer (within 0.5%) that its solAfter
  // does not list: [{task, names, value}]. A page's test should find none (or only the ones it lists as coincidences)
  function solLeaks(D) {
    var out = [];
    D.tasks.forEach(function (u) {
      var n = numsIn(afterText(u)), wait = u.solAfter || [];
      D.tasks.forEach(function (t) {
        if (t === u || wait.indexOf(t.id) >= 0) return;
        answerNums(t).forEach(function (a) { if (n.some(function (x) { return Math.abs(x - a) <= a * 0.005; })) out.push({ task: u.id, names: t.id, value: a }); });
      });
    });
    return out;
  }
  // the tasks named in another task's opensAfter that were submitted after that task's first answer, in task order
  // (the runner keeps a waiting task shut, so only an attempt stored elsewhere shows one)
  function outOfOrder(D, st) {
    var late = {};
    D.tasks.forEach(function (t) {
      var r = st.tasks[t.id];
      (t.opensAfter || []).forEach(function (id) { var n = st.tasks[id]; if (r && r.at && n && n.at && r.at < n.at) late[id] = true; });
    });
    return D.tasks.filter(function (x) { return late[x.id]; }).map(function (x) { return x.id; });
  }
  // tasks by number: "task 1", "tasks 1 and 4", "tasks 1, 2 and 4"
  function taskList(D, ids) {
    var n = ids.map(function (id) { return D.tasks.indexOf(task(D, id)) + 1; });
    return n.length > 1 ? "tasks " + n.slice(0, -1).join(", ") + " and " + n[n.length - 1] : "task " + n[0];
  }
  // a task's title where the attempt lists its tasks (the results table, the copied summary): a waiting task's title
  // could name what the task it waits for should find, so it reads "Opens after task 1" until then
  function shownTitle(D, st, t) { var w = waitsFor(D, st, t); return w.length ? "Opens after " + taskList(D, w) : t.title; }
  // what a waiting task shows: the line in place of its question, and the notice under it (HTML)
  function waitText(D, t, ids) {
    var w = taskList(D, ids), many = ids.length > 1;
    return { question: "This task opens once " + w + (many ? " are" : " is") + " submitted.",
      why: "<b>" + w.charAt(0).toUpperCase() + w.slice(1) + " first.</b> This task's question and worked solution would shape your answer" + (many ? "s" : "") +
        " there, so they open once " + (many ? "those are" : "it is") + " submitted." };
  }
  // opensAfter names that cannot work: an unknown task, the task itself, or a circle of tasks waiting for each other
  function openProblems(D) {
    var out = [], ids = D.tasks.map(function (t) { return t.id; });
    D.tasks.forEach(function (t) {
      (t.opensAfter || []).forEach(function (id) {
        if (id === t.id) out.push(t.id + " waits for itself");
        else if (ids.indexOf(id) < 0) out.push(t.id + " waits for an unknown task " + id);
      });
      (t.solAfter || []).forEach(function (id) {   // no circle is possible: a submission never waits for a solution
        if (id === t.id) out.push(t.id + "'s solution waits for itself");
        else if (ids.indexOf(id) < 0) out.push(t.id + "'s solution waits for an unknown task " + id);
      });
    });
    var state = {};
    function visit(id, path) {
      if (state[id] === 2) return;
      if (state[id] === 1) { out.push("circle: " + path.concat(id).join(" -> ")); return; }
      state[id] = 1;
      var t = task(D, id);
      ((t && t.opensAfter) || []).forEach(function (n) { if (n !== id && ids.indexOf(n) >= 0) visit(n, path.concat(id)); });
      state[id] = 2;
    }
    ids.forEach(function (id) { visit(id, []); });
    return out;
  }
  // the attempt's latest first answer (ISO), or null
  function lastAnswerAt(D, st) {
    var m = null; D.tasks.forEach(function (t) { var r = st.tasks[t.id]; if (r && r.at && (!m || r.at > m)) m = r.at; }); return m;
  }
  // the rule in words, said before the tasks (the runner adds it to the intro when late is "practice")
  function lateRule(o) {
    o = o || {};
    var W = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"], n = o.n ? (W[o.n] || String(o.n)) + " " : "";
    return (o.gateAll ? "The worked solution section opens once all " + n + "tasks are answered, in any order; opening it earlier is recorded."
      : "The worked solution section opens when you submit " + (o.submit ? "task " + o.submit : "the last task") + "; opening it earlier is recorded.") +
      " An answer given after it opens counts as practice, not as right, and a written task then earns no points.";
  }
  // the published rule: auto-marked items right on the first try, the estimate's self-ratings, the explanation's points.
  // Levels by index in rule.levels: 0 Not yet, 1 Developing, 2 Proficient, 3 Strong. openFirst: opt.openFirst, else
  // D.rule.openFirst, else "counts"; the result's `early` counts the auto-marked tasks opened first. late: opt.late, else
  // D.rule.late ("practice": the late-answer rule, with opt.solOpen); the result's `late` counts the late tasks.
  function level(D, st, opt) {
    var R = D.rule, autoIds = D.tasks.filter(isAuto).map(function (t) { return t.id; });
    var of = (opt && opt.openFirst) || R.openFirst || "counts";
    var lateOn = ((opt && opt.late) || R.late) === "practice", so = (opt && opt.solOpen) || null;
    var isLate = function (id) { return lateOn && lateAnswer(st.tasks[id], so); };
    var k = autoIds.filter(function (id) { return firstRight(st.tasks[id], of) && !isLate(id); }).length;
    var early = autoIds.filter(function (id) { return st.tasks[id] && st.tasks[id].solFirst; }).length;
    var exT = ofKind(D, "open-short"), esT = ofKind(D, "estimate");
    var ex = (exT && st.tasks[exT.id]) || {}, es = (esT && st.tasks[esT.id]) || {};
    var exOpen = !!(exT && ex.solFirst && !writtenCounts(ex, of)), esOpen = !!(esT && es.solFirst && !writtenCounts(es, of));   // opened first: not counted
    var rt = (esT && isLate(esT.id)) || esOpen ? {} : es.rating || {};
    var crit = R.criteria.map(function (c) { return rt[c] != null ? R.levels.indexOf(rt[c]) : -1; });
    var estMin = Math.min.apply(null, crit), estStrong = crit.filter(function (x) { return x === 3; }).length;
    var pts = ex.points || [], explainOk = pts.length > 0 && pts.length === (exT && exT.points ? exT.points.length : 2) && pts.every(Boolean) && !(exT && isLate(exT.id)) && !exOpen;
    var lateIds = lateOn ? D.tasks.filter(function (t) { return isLate(t.id); }).map(function (t) { return t.id; }) : [];
    var complete = autoIds.every(function (id) { return st.tasks[id] && st.tasks[id].first != null; }) && (esOpen ? !!es.answer : estMin >= 0) && ex.points != null;
    var lv = R.levels[0];
    if (k >= R.autoStrong && estMin >= 2 && estStrong >= 2 && explainOk) lv = R.levels[3];
    else if (k >= R.autoProficient && estMin >= 2 && explainOk) lv = R.levels[2];
    else if (k >= (R.autoDeveloping != null ? R.autoDeveloping : 3) && estMin >= 1) lv = R.levels[1];
    return { level: lv, auto: k, autoOf: autoIds.length, estMin: estMin, explainOk: explainOk, complete: complete, early: early, openFirst: of, late: lateIds.length, lateIds: lateIds,
      explainOpened: exOpen, estimateOpened: esOpen };
  }
  // the late tasks in words, for a results sentence ("" when none)
  function lateText(L) {
    return L && L.late ? " Answered after the worked solution opened, so counted as practice (not right, no points): " + L.late + " task" + (L.late > 1 ? "s" : "") + "." : "";
  }
  // the results view's sentence under the level (CK-F's parts; a checkpoint with another rule passes its own describe)
  function describe(D, L) {
    return "Auto-marked tasks right on the first try: " + L.auto + " of " + L.autoOf + (L.openFirst === "not-right" && L.early ? " (" + L.early + " with the solution opened first, counted as not right)" : "") +
      ". Estimate: " + (L.estimateOpened ? "worked solution opened before submitting, so its self-ratings do not count" : "lowest self-rating " + (L.estMin >= 0 ? D.rule.levels[L.estMin] : "not rated yet")) +
      ". Explanation: " + (L.explainOpened ? "worked solution opened before answering, so no points." : L.explainOk ? "both points." : "not both points ticked.") + lateText(L) + (L.complete ? "" : " Some tasks are not finished; the level counts them as not right.");
  }
  function fmtMs(ms) {
    if (ms == null) return "–";
    var s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m ? m + " min " + (s % 60 < 10 ? "0" : "") + (s % 60) + " s" : s + " s";
  }
  function firstWord(D, t, r) {
    if (!r || r.first == null) return r && r.skipped ? "skipped" : "not answered";
    if (t.kind === "open-short") return (r.points || []).filter(Boolean).length + " of " + (t.points ? t.points.length : 2) + " points (self)";
    if (t.kind === "estimate") return "submitted";
    return r.first ? "right" : "not right";
  }
  // the copied summary: keep its format fixed once readers use it (summaries are compared across versions)
  function summary(D, st, env, o) {
    env = env || {}; o = o || {};
    var L = o.level ? o.level(D, st, { solOpen: o.solOpen || null, late: o.late }) : level(D, st, { openFirst: o.openFirst, late: o.late, solOpen: o.solOpen }), total = 0, lines = [];
    var isLate = function (r) { return o.late === "practice" && lateAnswer(r, o.solOpen); };
    D.tasks.forEach(function (t) { var r = st.tasks[t.id]; if (r && r.ms) total += r.ms; });
    lines.push("Learn · " + (o.code || "Checkpoint") + " results (" + D.version + ")");
    lines.push("Finished: " + (st.finished || "not yet") + " (this device's clock) · active time " + fmtMs(total));
    lines.push("Level by the published rule: " + L.level + " (auto-marked right on the first try: " + L.auto + " of " + L.autoOf +
      "; estimate's lowest self-rating: " + (L.estMin >= 0 ? D.rule.levels[L.estMin] : "not rated") + "; explanation: " + (L.explainOk ? "both points" : "not both points") + ")");
    lines.push("");
    lines.push("# | Task | Draws on | First answer | Tries | Time to first answer | Time on task | Solution opened before answering");
    D.tasks.forEach(function (t, i) {
      var r = st.tasks[t.id] || {};
      var hide = waitsFor(D, st, t).length > 0;   // a waiting task's title and lessons stay unsaid, as on its card
      lines.push((i + 1) + " | " + shownTitle(D, st, t) + " | " + (hide ? "–" : t.lesson) + " | " + firstWord(D, t, r) + " | " + (r.tries || 0) + " | " + fmtMs(r.msFirst) + " | " + fmtMs(r.ms) + " | " + (r.solFirst ? "yes" : isLate(r) ? "yes (the worked solution section)" : "no"));
    });
    var esT = ofKind(D, "estimate"), es = esT && st.tasks[esT.id];
    if (es && es.answer) {
      var a = es.answer;
      lines.push("");
      lines.push("Estimate: " + a.low + " to " + a.high + " " + a.unit + (es.check ? " · " + (es.check.overlaps ? "overlaps" : "does not overlap") + " the worked range (a comparison, not a mark)" : ""));
      if (es.rating) lines.push("Self-rating: " + D.rule.criteria.map(function (c) { return c + " " + (es.rating[c] || "not rated"); }).join(", "));
      ["reasoning", "uncertainty", "check"].forEach(function (k) { if (a[k]) lines.push("Your " + k + ": " + String(a[k]).replace(/\s+/g, " ")); });   // in full: nothing is cut
    }
    var exT = ofKind(D, "open-short"), ex = exT && st.tasks[exT.id];
    if (ex && ex.answer) lines.push("Your explanation (task " + (D.tasks.indexOf(exT) + 1) + "): " + String(ex.answer).replace(/\s+/g, " "));
    lines.push("");
    lines.push("Screen width " + (env.width || "?") + " px. Kept in this browser only; copied by you.");
    return lines.join("\n");
  }

  var pure = { task: task, checkChoice: checkChoice, checkOrder: checkOrder, checkNumeric: checkNumeric, checkMWh: checkMWh, checkValue: checkValue,
    checkEstimate: checkEstimate, level: level, firstRight: firstRight, writtenCounts: writtenCounts, lateAnswer: lateAnswer, allAnswered: allAnswered, lastAnswerAt: lastAnswerAt, lateRule: lateRule, lateText: lateText,
    tolText: tolText, describe: describe, summary: summary, fmtMs: fmtMs, firstWord: firstWord,
    submitted: submitted, waitsFor: waitsFor, solWaits: solWaits, solLeaks: solLeaks, outOfOrder: outOfOrder, taskList: taskList, waitText: waitText, openProblems: openProblems, shownTitle: shownTitle };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, E = LX.H, S = LX.S;
  var DRAFT_NOTE = "Draft kept in this browser; not submitted yet.";
  var COPIED = "Copied. Keep these results, or share them with a mentor.";
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function q(sel) { return !sel ? null : typeof sel === "string" ? document.querySelector(sel) : sel; }

  // a small 24-hour line chart for chart tasks, with a text version. C: {yMin, yMax} (the axis need not start at zero:
  // a task may ask the reader to notice it); series: [{label, color, v: [24 values], dash}]
  function lineChart(host, C, series, label) {
    var w = E("div", { class: "lx-ck-chart" }, host), legend = E("div", { class: "lx-legend" }, host);
    var alt = E("details", { class: "lx-textalt" }, host); E("summary", { text: "Text version" }, alt);
    var tb = E("table", { class: "lx-mini-table" }, E("div", { class: "lx-scroll-x" }, alt)), hr = E("tr", null, E("thead", null, tb));
    E("th", { scope: "col", text: "Hour" }, hr); series.forEach(function (s) { E("th", { scope: "col", text: s.label + " (MW)" }, hr); });
    var body = E("tbody", null, tb);
    for (var t = 0; t < 24; t++) { var tr = E("tr", null, body); E("td", { text: (t < 10 ? "0" : "") + t + ":00" }, tr); series.forEach(function (s) { E("td", { text: s.v[t] }, tr); }); }
    series.forEach(function (s) { var sp = E("span", null, legend); E("i", { class: s.dash ? "line" : "", style: "--c:" + s.color }, sp); E("span", { text: s.label }, sp); });
    var svg = null;
    function render() {
      var W = Math.max(280, w.clientWidth || 600), Hh = W < 480 ? 200 : 240, m = { l: 48, r: 10, t: 12, b: 26 }, iw = W - m.l - m.r, ih = Hh - m.t - m.b;
      var y = function (v) { return m.t + ih - (v - C.yMin) / (C.yMax - C.yMin) * ih; }, x = function (t) { return m.l + t / 23 * iw; };
      if (svg) svg.remove();
      svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": label }, w);
      for (var v = C.yMin; v <= C.yMax + 1e-9; v += (C.yMax - C.yMin) / 4) {
        S("path", { d: "M" + m.l + " " + y(v) + " H" + (W - m.r), stroke: "var(--lx-line)", "stroke-width": 1 }, svg);
        S("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = Math.round(v) + " MW";
      }
      (W < 480 ? [0, 6, 12, 18] : [0, 6, 12, 18, 23]).forEach(function (h) {
        S("text", { x: x(h), y: Hh - 7, "text-anchor": h === 0 ? "start" : h === 23 ? "end" : "middle", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = (h < 10 ? "0" : "") + h + ":00";
      });
      series.forEach(function (s) {
        var d = ""; s.v.forEach(function (val, t) { d += (t ? " L" : "M") + x(t).toFixed(1) + " " + y(val).toFixed(1); });
        S("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 2.6, "stroke-dasharray": s.dash ? "6 4" : null, "stroke-linejoin": "round" }, svg);
      });
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(w)) render(); }).observe(w);
    LX.onTheme(function () { if (LX.visible(w)) render(); });
    setTimeout(render, 0);
    return { render: render };
  }

  LX.Checkpoint = function (host, o) {
    var D = o.data, KEY = o.key, N = D.tasks.length, code = o.code || "Checkpoint";
    var CK = o.checks || {}, cChoice = CK.choice || checkChoice, cOrder = CK.order || checkOrder, cNum = CK.numeric || checkNumeric, cEst = CK.estimate || checkEstimate;
    var SOL = KEY + "-sol-open";   // when the page's worked solution first opened for this runner (kept across "Start again")
    function solAt() { return LX.store.get(SOL, null); }
    var levelOf = function (D, st) { return o.level ? o.level(D, st, { solOpen: solAt(), late: o.late, gateAll: !!o.gateAll }) : level(D, st, { openFirst: o.openFirst, late: o.late, solOpen: solAt() }); };
    var summaryOf = o.summary || function (D, st, env) { return summary(D, st, env, { code: code, level: o.level, openFirst: o.openFirst, late: o.late, solOpen: solAt() }); };
    var esT = ofKind(D, "estimate"), gateT = o.submitTask ? task(D, o.submitTask) : esT, describeOf = o.describe || describe;
    function fresh() { return { version: D.version, started: null, finished: null, cur: 0, tasks: {} }; }
    var st = LX.store.get(KEY, null);
    if (!st || st.version !== D.version) st = fresh();
    var wrap = E("div", { class: "lx-ck" }, host), clock = { id: null, t0: null };
    function save() { LX.store.set(KEY, st); }
    // drafts: unfinished answers, kept apart from the attempt (see the header); never a submission
    var DR = KEY + "-drafts";
    function drafts() { var d = LX.store.get(DR, null); return d && d.version === D.version && d.tasks ? d : { version: D.version, tasks: {} }; }
    function draftOf(id) { return drafts().tasks[id] || null; }
    function keepDraft(id, v) {
      var d = drafts();
      if (v == null) { if (!(id in d.tasks)) return; delete d.tasks[id]; } else d.tasks[id] = v;
      LX.store.set(DR, d);
    }
    // the line under a task's fields that says a draft is kept (shown once the reader types; hidden after submitting)
    function draftLine(host, has) { return E("p", { class: "lx-hint lx-ck-draft", "aria-live": "polite", text: has ? DRAFT_NOTE : "" }, host); }
    function rec(id) { if (!st.tasks[id]) st.tasks[id] = { ms: 0, msFirst: null, tries: 0, first: null, solFirst: false }; return st.tasks[id]; }
    // ---- the clock: runs only while a task is on screen and the tab is visible
    function tick() { if (clock.id && clock.t0 != null) { var r = rec(clock.id), t = now(); r.ms += t - clock.t0; clock.t0 = t; } }
    function startClock(id) { tick(); clock.id = id; clock.t0 = document.visibilityState === "hidden" ? null : now(); }
    function stopClock() { tick(); clock.id = null; clock.t0 = null; save(); }
    function onVis() { if (document.visibilityState === "hidden") { tick(); clock.t0 = null; save(); } else if (clock.id) clock.t0 = now(); }
    function onHide() { tick(); save(); }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    function answered(id, right, answer, extra) {
      var ft = task(D, id); if (ft && frozen(ft)) return rec(id);   // a frozen task keeps its first submission
      tick(); var r = rec(id); r.tries += 1;
      if (r.first == null) { r.first = right; r.msFirst = r.ms; }
      if (!r.at) r.at = new Date().toISOString();   // when the task was first answered (the submit task: when it was submitted)
      if (answer !== undefined) r.answer = answer;
      if (extra) for (var k in extra) r[k] = extra[k];
      save();
      keepDraft(id, null);   // submitted: the draft has done its job
      var dl = wrap.querySelector(".lx-ck-draft"); if (dl) dl.textContent = "";
      if (o.gateAll) { if (allAnswered(D, st)) openSolution(r.at); }   // every task answered, in any order (this answer's `at`)
      else if (gateT && id === gateT.id && gateT !== esT) openSolution(r.at);   // the estimate opens it itself, after its range check
      if (o.onAnswer) o.onAnswer(id, r, st);
      return r;
    }
    // the page's worked solution opened before the submit task is answered: recorded on that task
    function early() {
      if (o.gateAll) {   // recorded on the attempt (practice), unless every task was already answered
        if (!allAnswered(D, st) && !st.solEarly) st.solEarly = new Date().toISOString();
        save(); openSolution(); return;
      }
      var r = gateT ? rec(gateT.id) : null;
      if (r && r.first == null && !r.answer) r.solFirst = true;
      save(); openSolution();   // recorded before onAnswer runs, so the page reads the opening there
      if (r && o.onAnswer) o.onAnswer(gateT.id, r, st);
    }

    // ---- views: intro, a task, results
    function intro() {
      stopClock(); wrap.innerHTML = "";
      var c = E("div", { class: "lx-ck-card" }, wrap);
      E("p", { class: "lx-eyebrow", text: "How this checkpoint works" }, c);
      var ul = E("ul", { class: "lx-ck-intro" }, c);
      (o.intro || [N + " tasks, one at a time.", "No hints. Each worked solution opens after your first answer; you may open it earlier, and that is recorded.",
        "Your answers, drafts and times stay in this browser. At the end, “Copy my results” gives you a summary to keep or to share with a mentor."]).concat(o.late === "practice" ? [lateRule({ gateAll: o.gateAll, n: N, submit: gateT ? D.tasks.indexOf(gateT) + 1 : null })] : [])
        .forEach(function (s) { E("li", { text: s }, ul); });
      var row = E("div", { class: "lx-ck-row" }, c), started = !!st.started;
      E("button", { type: "button", class: "lx-btn", html: (started ? "Resume at task " + (st.cur + 1) : "Start the checkpoint") + LX.icon("arrow"), onclick: function () { if (!st.started) { st.started = new Date().toISOString(); save(); } show(st.cur); } }, row);
      if (started) E("button", { type: "button", class: "lx-btn ghost", text: "Start again (clears this browser's answers)", onclick: reset }, row);
    }
    function reset() {
      if (!window.confirm("Clear your " + code + " answers, drafts and times in this browser?")) return;
      st = fresh(); save(); LX.store.set(DR, null); lockSolution(); intro();
    }
    function show(i) {
      st.cur = i; save(); wrap.innerHTML = "";
      var t = D.tasks[i], r = rec(t.id), qid = LX.uid("ck-q"), wait = waitsFor(D, st, t), wt = wait.length ? waitNoteOf(t, wait) : null;
      var c = E("div", { class: "lx-ck-card", role: "group", "aria-labelledby": qid }, wrap);
      var top = E("div", { class: "lx-ck-top" }, c);
      var dots = E("div", { class: "lx-dots", "aria-hidden": "true" }, top);
      for (var d = 0; d < N; d++) E("i", { class: d < i ? "done" : d === i ? "cur" : "" }, dots);
      E("span", { class: "lx-ck-tag", text: "Task " + (i + 1) + " of " + N + (wt ? " · opens after " + taskList(D, wait) : " · " + t.skill + " · draws on " + t.lesson) }, top);
      var qp = E("p", { class: "lx-ck-q", id: qid, tabindex: "-1", text: wt ? wt.question : t.prompt }, c);
      if (wt) shut(c, wait, wt); else open(t, c, r);
      var foot = E("div", { class: "lx-ck-foot" }, c);
      E("button", { type: "button", class: "lx-btn ghost small", text: i ? "Back" : "Overview", onclick: function () { if (i) show(i - 1); else intro(); } }, foot);
      E("button", { type: "button", class: "lx-btn small", html: (i === N - 1 ? "See my results" : "Next task") + LX.icon("arrow"),
        onclick: function () { var rr = rec(t.id); if (rr.first == null) rr.skipped = true; save(); if (i === N - 1) results(); else show(i + 1); } }, foot);
      if (wt) stopClock(); else startClock(t.id);   // a waiting task's clock does not run: there is nothing to work on yet
      qp.focus({ preventScroll: true });
      c.scrollIntoView({ block: "nearest", behavior: LX.reduced() ? "auto" : "smooth" });
      LX.emit("layout");
    }
    // an open task: its answer controls, the feedback line, its worked solution and the early button
    function open(t, c, r) {
      var body = E("div", { class: "lx-ck-body" }, c), fb = E("div", { "aria-live": "polite" }, c);
      var sw = solWaits(D, st, t);   // solAfter: the solution names another task's answer, so it waits for that task too
      var sol = E("details", { class: "lx-ck-sol", hidden: sw.length > 0 || (r.first == null && !r.solFirst) }, c);
      E("summary", { text: "Worked solution" }, sol);
      if (!sw.length) solution(t, sol);
      var swNote = sw.length ? E("p", { class: "lx-hint lx-ck-solwait", text: solWaitText(t, sw) }, c) : null;   // said before answering too: it is why no early button shows
      var earlyBtn = E("button", { type: "button", class: "lx-link", text: "Show the worked solution now (recorded as opened before answering)", hidden: sw.length > 0 || r.first != null || r.solFirst,
        onclick: function () { var rr = rec(t.id); rr.solFirst = true; save(); sol.hidden = false; sol.open = true; earlyBtn.hidden = true;
          if (t === gateT && !o.gateAll) openSolution(); if (o.onAnswer) o.onAnswer(t.id, rr, st); } }, c);
      function unlock() { if (sw.length) return; sol.hidden = false; earlyBtn.hidden = true; }
      ({ "choice": choice, "order": order, "numeric": numeric, "open-short": openShort, "estimate": estimate })[t.kind](t, body, fb, unlock, sw);
    }
    // the line in place of a waiting worked solution (solAfter): which tasks it waits for, and why
    function solWaitText(t, sw) {
      var w = taskList(D, sw), many = sw.length > 1;
      return "This worked solution" + (t.kind === "open-short" ? " and the points to tick" : "") + " name" + (t.kind === "open-short" ? "" : "s") + " the answer" + (many ? "s" : "") + " to " + w +
        ", so " + (t.kind === "open-short" ? "they open" : "it opens") + " once " + (many ? "those are" : "that is") + " submitted. Come back to this task then.";
    }
    // a task that waits for others (opensAfter): a notice and a way to the first task it waits for, nothing to answer
    function waitNoteOf(t, wait) {
      var w = typeof o.waitNote === "function" ? o.waitNote(t, wait, D) : o.waitNote;
      return w && w.question ? w : waitText(D, t, wait);
    }
    function shut(c, wait, wt) {
      var to = D.tasks.indexOf(task(D, wait[0]));
      E("div", { class: "lx-saw no lx-ck-wait", html: LX.icon("question") + "<div>" + wt.why + "</div>" }, c);
      E("button", { type: "button", class: "lx-btn small", text: "Go to task " + (to + 1), onclick: function () { show(to); } }, E("div", { class: "lx-ck-row" }, c));
    }
    // a frozen task (freeze): submitted, so its answer stays as given
    function frozen(t) { return !!t.freeze && submitted(st.tasks[t.id]); }
    // kept(t, btn, host, els, move): the line that says so, in place of the submit button (or, without one, at the end of
    // `host`); the kept answer's controls (els) are described by it; after a submission (move) focus goes to it, since the
    // button that had focus is gone or disabled
    function kept(t, btn, host, els, move) {
      var where = btn ? btn.parentNode : host, p = where ? where.querySelector(".lx-ck-kept") : null;
      if (!p && where) p = E("p", { class: "lx-hint lx-ck-kept", id: LX.uid("ck-kept"), tabindex: "-1", text: t.freezeNote || (t.kind === "open-short" ? "Submitted: your text stays as you wrote it. " +
          (solWaits(D, st, t).length ? "Its points to tick open once the tasks they name are answered." : "Tick the points it makes below.")
        : t.kind === "estimate" ? "Submitted: your estimate stays as you gave it. Rate it below." : "Submitted: your answer stays as you gave it.") }, where);
      if (btn) btn.remove();
      if (!p) return;
      (els || []).forEach(function (el) {
        var d = el && el.getAttribute("aria-describedby");
        if (el && (!d || d.split(" ").indexOf(p.id) < 0)) el.setAttribute("aria-describedby", (d ? d + " " : "") + p.id);
      });
      if (move) p.focus({ preventScroll: true });
    }
    function readOnly(els) { els.forEach(function (el) { if (el) { el.setAttribute("readonly", ""); el.readOnly = true; } }); }
    // the line after a wrong first answer: a retry, or for a frozen task the worked solution
    function retry(t) {
      if (solWaits(D, st, t).length) return t.freeze ? " Its worked solution opens later (below)." : " Try again.";   // solAfter: not open yet
      return t.freeze ? " The worked solution is below." : " Try again, or open the worked solution.";
    }
    function feedback(fb, ok, html) { fb.innerHTML = ""; E("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + html + "</div>" }, fb); }
    function solution(t, sol) {
      if (t.kind === "estimate") { E("p", { html: o.estimateNote || "The worked solution and the marking guide are in the <a href=\"#solution\">Worked solution</a> section below; it opens when you submit." }, sol); return; }
      E("p", { html: LX.rich(t.solution) }, sol);   // [[glossary-id|words]] marks work here (shown only after answering or on request)
      if (t.kind === "open-short") { var ul = E("ul", { class: "lx-ck-solpts" }, sol); t.points.forEach(function (p) { E("li", { html: LX.rich(p) }, ul); }); }
    }
    function choice(t, body, fb, unlock) {
      if (t.chart && o.chart) o.chart(t, body);
      var r = rec(t.id), box = E("div", { class: "lx-ck-opts", role: "group", "aria-label": "Answers" }, body), btns = {};
      t.options.forEach(function (op) {
        btns[op[0]] = E("button", { type: "button", class: "lx-choice", "aria-pressed": r.answer === op[0] ? "true" : "false", text: op[1], onclick: function () {
          var res = cChoice(t, op[0]);
          answered(t.id, res.right, op[0]);
          Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === op[0] ? "true" : "false"); btns[k].classList.toggle("right", res.right && k === op[0]); btns[k].classList.toggle("wrong", !res.right && k === op[0]); });
          feedback(fb, res.right, LX.rich(res.why) + (res.right ? "" : retry(t)));
          unlock();
          if (frozen(t)) fix(true);
        } }, box);
      });
      function fix(move) { var bs = Object.keys(btns).map(function (k) { return btns[k]; }); bs.forEach(function (b) { b.disabled = true; }); kept(t, null, body, bs, move); }
      if (frozen(t)) fix();
    }
    function order(t, body, fb, unlock) {
      var r = rec(t.id), keys = t.items.map(function (x) { return x[0]; }).sort().join("|");
      var perm = function (a) { return !!(a && a.length === t.items.length && a.slice().sort().join("|") === keys); };
      if (frozen(t)) keepDraft(t.id, null);
      var dr = frozen(t) ? null : draftOf(t.id);
      var cur = dr && perm(dr.order) ? dr.order.slice() : perm(r.answer) ? r.answer.slice() : t.start.slice();
      var text = {}; t.items.forEach(function (x) { text[x[0]] = x[1]; });
      var ol = E("ol", { class: "lx-ck-order" }, body), row = E("div", { class: "lx-ck-row" }, body);
      var go = E("button", { type: "button", class: "lx-btn small", text: "Check the order" }, row), marks = null, dl = draftLine(body, !!(dr && perm(dr.order)));
      function paint(focusKey, dir) {
        ol.innerHTML = "";
        cur.forEach(function (k, i) {
          var li = E("li", { class: marks ? (marks[i] ? "ok" : "no") : "" }, ol);
          E("span", { class: "n", text: (i + 1) + "." }, li); E("span", { text: text[k] }, li);
          var mv = E("span", { class: "mv" }, li);
          var up = E("button", { type: "button", "aria-label": "Move up: " + text[k], text: "↑", onclick: function () { move(i, -1); } }, mv);
          var dn = E("button", { type: "button", "aria-label": "Move down: " + text[k], text: "↓", onclick: function () { move(i, 1); } }, mv);
          var lk = frozen(t); up.disabled = lk || i === 0; dn.disabled = lk || i === cur.length - 1;
          if (k === focusKey) (dir < 0 ? (up.disabled ? dn : up) : (dn.disabled ? up : dn)).focus();
        });
      }
      function move(i, d) {
        var j = i + d; if (j < 0 || j >= cur.length) return; var k = cur[i]; cur[i] = cur[j]; cur[j] = k; marks = null; paint(k, d);
        var same = perm(rec(t.id).answer) && rec(t.id).answer.join("|") === cur.join("|");   // back to the checked order: no draft
        keepDraft(t.id, same ? null : { order: cur.slice() }); dl.textContent = same ? "" : DRAFT_NOTE;
      }
      go.addEventListener("click", function () {
        var res = cOrder(t, cur); marks = res.places; answered(t.id, res.right, cur.slice()); paint();
        feedback(fb, res.right, res.right ? "That is the sequence." : res.n + " of " + cur.length + " in the right place (green)." + retry(t));
        unlock();
        if (frozen(t)) kept(t, go, null, [ol], true);
      });
      paint();
      if (frozen(t)) kept(t, go, null, [ol]);
    }
    function unitSelect(host, t, chosen) {
      var f = E("div", { class: "lx-ck-field" }, host), id = LX.uid("ck");
      E("label", { for: id, text: "Unit" }, f);
      var sel = E("select", { id: id }, f);
      E("option", { value: "", text: "Choose…" }, sel);
      t.units.forEach(function (u) { E("option", { value: u[0], text: u[0], selected: chosen === u[0] ? "selected" : null }, sel); });
      return sel;
    }
    function numeric(t, body, fb, unlock) {
      var r = rec(t.id), g = E("div", { class: "lx-ck-grid2" }, body);
      if (frozen(t)) keepDraft(t.id, null);
      var dr = frozen(t) ? null : draftOf(t.id);
      var f1 = E("div", { class: "lx-ck-field" }, g), id1 = LX.uid("ck");
      E("label", { for: id1, text: "Your answer" }, f1);
      var inp = E("input", { type: "number", id: id1, min: "0", step: "any", inputmode: "decimal", value: dr ? dr.value : r.answer ? r.answer.value : "" }, f1);
      if (dr) inp.value = dr.value;
      var sel = unitSelect(g, t, dr ? dr.unit : r.answer && r.answer.unit), tt = o.tolerance === false ? "" : tolText(t);
      if (tt) { var tid = id1 + "-tol"; E("p", { id: tid, class: "lx-hint lx-ck-tol", text: tt }, body); inp.setAttribute("aria-describedby", tid); }
      var dl = draftLine(body, !!dr);
      function draft() {
        if (frozen(t)) return;
        var a = rec(t.id).answer, same = a ? String(a.value) === String(inp.value) && a.unit === sel.value : !inp.value && !sel.value;   // as submitted, or still empty
        keepDraft(t.id, same ? null : { value: inp.value, unit: sel.value }); dl.textContent = same ? "" : DRAFT_NOTE;
      }
      inp.addEventListener("input", draft); sel.addEventListener("change", draft);
      var row = E("div", { class: "lx-ck-row" }, body);
      var chk = E("button", { type: "button", class: "lx-btn small", text: "Check", onclick: function () {
        if (!sel.value) { feedback(fb, false, "Choose a unit first."); return; }
        if (!(parseFloat(inp.value) > 0)) { feedback(fb, false, "Enter a positive number."); return; }   // not recorded: an empty field is not an answer
        var res = cNum(t, parseFloat(inp.value), sel.value);
        answered(t.id, res.right, { value: parseFloat(inp.value), unit: sel.value });
        feedback(fb, res.right, LX.esc(res.msg) + (res.right ? "" : retry(t)));
        unlock();
        if (frozen(t)) fix(true);
      } }, row);
      function fix(move) { readOnly([inp]); sel.disabled = true; kept(t, chk, null, [inp, sel], move); }
      if (frozen(t)) fix();
    }
    function openShort(t, body, fb, unlock, sw) {
      var r = rec(t.id), id = LX.uid("ck"), waiting = !!(sw && sw.length);   // solAfter: the points name other answers too
      if (frozen(t)) keepDraft(t.id, null);
      var dr = frozen(t) ? null : draftOf(t.id);
      E("label", { for: id, class: "lx-sr", text: "Your explanation" }, body);
      var ta = E("textarea", { id: id, rows: "3", placeholder: "Your explanation" }, body); ta.value = dr && dr.text != null ? dr.text : (r.answer || "");
      var dl = draftLine(body, !!dr);
      ta.addEventListener("input", function () {
        if (frozen(t)) return;
        var same = ta.value.trim() === String(rec(t.id).answer || "");   // the submitted text, or nothing yet: no draft
        keepDraft(t.id, same ? null : { text: ta.value }); dl.textContent = same ? "" : DRAFT_NOTE;
      });
      var row = E("div", { class: "lx-ck-row" }, body), self = E("div", { hidden: r.points == null || waiting }, body);
      E("p", { class: "lx-hint", text: "Compare with the worked solution, then tick each point your answer makes." }, self);
      var ul = E("ul", { class: "lx-ck-points" }, self), boxes = (waiting ? [] : t.points).map(function (p, k) {
        var lab = E("label", null, E("li", null, ul)), cb = E("input", { type: "checkbox" }, lab); cb.checked = !!(r.points && r.points[k]);
        E("span", { html: LX.rich(p) }, lab);
        cb.addEventListener("change", function () { var rr = rec(t.id); rr.points = boxes.map(function (b) { return b.checked; }); rr.first = rr.points.every(Boolean); save(); });
        return cb;
      });
      var sub = E("button", { type: "button", class: "lx-btn small", text: "Submit my explanation", onclick: function () {
        if (!ta.value.trim()) { feedback(fb, false, "Write a sentence or two first."); return; }
        var rr = answered(t.id, false, ta.value.trim()); rr.points = rr.points || t.points.map(function () { return false; }); rr.first = rr.points.every(Boolean); save();
        self.hidden = waiting; unlock(); fb.innerHTML = "";
        E("div", { class: "lx-saw", html: LX.icon("check") + "<div><b>Submitted.</b> " + (waiting ? "Its worked solution and points open later (below)." : "Open the worked solution below and tick the points you made.") + "</div>" }, fb);
        if (frozen(t)) fix(true);
      } }, row);
      function fix(move) { readOnly([ta]); kept(t, sub, null, [ta], move); }
      if (frozen(t)) fix();
    }
    function estimate(t, body, fb, unlock) {
      var r = rec(t.id), a = r.answer || {}, g = E("div", { class: "lx-ck-grid2" }, body), F = {};
      if (frozen(t)) keepDraft(t.id, null);
      var dr = frozen(t) ? null : draftOf(t.id), from = dr || a;   // a draft wins over the submitted answer it edits
      function field(host, key, label, type) {
        var f = E("div", { class: "lx-ck-field" }, host), id = LX.uid("ck");
        E("label", { for: id, text: label }, f);
        var el = type === "textarea" ? E("textarea", { id: id, rows: "2" }, f) : E("input", { type: "number", id: id, min: "0", step: "any", inputmode: "decimal" }, f);
        el.value = from[key] != null ? from[key] : ""; F[key] = el; return el;
      }
      field(g, "low", "Low value"); field(g, "high", "High value");
      var sel = unitSelect(g, t, from.unit);
      field(body, "reasoning", "How you got there: your inputs and steps", "textarea");
      field(body, "uncertainty", "The main uncertainty, and why it matters most", "textarea");
      field(body, "check", "One way to check your answer", "textarea");
      var dl = draftLine(body, !!dr);
      function draft() {
        if (frozen(t)) return;
        var v = { unit: sel.value }, ra = rec(t.id).answer || { unit: "" }, same = (ra.unit || "") === sel.value;   // as submitted, or still empty
        Object.keys(F).forEach(function (k) { v[k] = F[k].value; if (String(ra[k] != null ? ra[k] : "") !== (k === "low" || k === "high" ? v[k] : v[k].trim())) same = false; });
        keepDraft(t.id, same ? null : v); dl.textContent = same ? "" : DRAFT_NOTE;
      }
      Object.keys(F).forEach(function (k) { F[k].addEventListener("input", draft); }); sel.addEventListener("change", draft);
      var row = E("div", { class: "lx-ck-row" }, body);
      fb = E("div", { class: "lx-ck-fb", "aria-live": "polite" }, body);
      var out = E("div", { class: "lx-ck-rating" }, body);
      var sub = E("button", { type: "button", class: "lx-btn small", text: "Submit my estimate", onclick: function () {
        var lo = parseFloat(F.low.value), hi = parseFloat(F.high.value);
        if (!sel.value || !(lo > 0) || !(hi > 0)) { fb.innerHTML = ""; E("div", { class: "lx-saw no", html: LX.icon("question") + "<div>Give a low and a high value and choose a unit.</div>" }, fb); return; }
        var ans = { low: lo, high: hi, unit: sel.value, reasoning: F.reasoning.value.trim(), uncertainty: F.uncertainty.value.trim(), check: F.check.value.trim() };
        var chk = cEst(t, lo, hi, sel.value);
        // a range needs its high above its low: say why and wait (not recorded as an answer, like an empty field)
        if (!chk.ordered) { fb.innerHTML = ""; E("div", { class: "lx-saw no", html: LX.icon("question") + "<div><b>Range.</b> " + LX.esc(chk.rangeMsg) + "</div>" }, fb); return; }
        var er = answered(t.id, chk.unitsOk && chk.ordered, ans, { check: chk });   // a valid estimate; where it sits is a comparison, not a mark
        fb.innerHTML = "";
        E("div", { class: "lx-saw" + (chk.unitsOk ? "" : " no"), html: LX.icon(chk.unitsOk ? "check" : "question") + "<div><b>Units.</b> " + LX.esc(chk.unitMsg) + "</div>" }, fb);
        if (chk.rangeMsg) E("div", { class: "lx-saw" + (chk.overlaps ? "" : " info"), html: LX.icon(chk.overlaps ? "check" : "chart") + "<div><b>Range.</b> " + LX.esc(chk.rangeMsg) + "</div>" }, fb);   // neutral when apart
        if (!o.gateAll) openSolution(er.at); rate(out);
        if (frozen(t)) fix(true);
      } }, row);
      if (r.answer) rate(out);
      function fix(move) { var els = Object.keys(F).map(function (k) { return F[k]; }); readOnly(els); sel.disabled = true; kept(t, sub, null, els.concat([sel]), move); }
      if (frozen(t)) fix();
      function rate(host) {
        host.innerHTML = "";
        E("p", { class: "lx-eyebrow", text: "Rate your estimate on the rubric" }, host);
        E("p", { class: "lx-hint", html: "Read the <a href=\"#solution\">worked solution</a> and the <a href=\"#rubric\">rubric</a>, then pick a level for each criterion." }, host);
        var box = E("div", { class: "lx-ck-rate" }, host), rr = rec(t.id); rr.rating = rr.rating || {};
        RUBRIC.forEach(function (cr) {
          var fs = E("fieldset", null, box); E("legend", { text: cr.name }, fs);
          var opts = E("div", { class: "opts" }, fs), anc = E("p", { class: "anchor", "aria-live": "polite" }, fs), nm = LX.uid("ck-" + cr.id);
          D.rule.levels.forEach(function (lv, k) {
            var lab = E("label", null, opts), rb = E("input", { type: "radio", name: nm, value: lv }, lab); E("span", { text: lv }, lab);
            rb.checked = rr.rating[cr.id] === lv; if (rb.checked) anc.textContent = cr.levels[k];
            rb.addEventListener("change", function () { rr.rating[cr.id] = lv; anc.textContent = cr.levels[k]; save(); });
          });
        });
        unlock();
      }
    }
    // open the page's worked solution, and record when it first opened for this runner (at: the submit task's answer
    // time when that opened it, else now); the record outlives "Start again", so a page can tell a fresh attempt from one
    // made after the solutions were seen (LX.Checkpoint.solOpened(key))
    function openSolution(at) {
      var lock = q(o.lock), body = q(o.solution);
      if (lock) lock.hidden = true; if (body) body.classList.add("is-open");
      if ((lock || body) && !LX.store.get(SOL, null)) LX.store.set(SOL, at || new Date().toISOString());
    }
    // "Start again": the page's worked solution shuts again until the new attempt's submit task is answered (or opened early)
    function lockSolution() {
      var lock = q(o.lock), body = q(o.solution);
      if (lock && body) { lock.hidden = false; body.classList.remove("is-open"); }
    }
    function results() {
      stopClock();
      if (!st.finished) { var dt = new Date(), p2 = function (x) { return (x < 10 ? "0" : "") + x; };
        st.finished = dt.getFullYear() + "-" + p2(dt.getMonth() + 1) + "-" + p2(dt.getDate()) + " " + p2(dt.getHours()) + ":" + p2(dt.getMinutes()); save(); }
      wrap.innerHTML = "";
      var L = levelOf(D, st), c = E("div", { class: "lx-ck-card" }, wrap);
      E("p", { class: "lx-eyebrow", text: "Your results (this browser only)" }, c);
      E("p", { class: "lx-ck-level", tabindex: "-1", text: "Level: " + L.level }, c).focus({ preventScroll: true });
      E("p", { class: "lx-ck-describe", text: describeOf(D, L) }, c);
      var sc = E("div", { class: "lx-scroll-x" }, c), tb = E("table", { class: "lx-ck-res" }, sc), hr = E("tr", null, E("thead", null, tb));
      ["Task", "First answer", "Tries", "Time to first answer", "Solution first"].forEach(function (h) { E("th", { scope: "col", text: h }, hr); });
      var bd = E("tbody", null, tb);
      D.tasks.forEach(function (t, i) {
        var r = st.tasks[t.id] || {}, tr = E("tr", null, bd);
        var td = E("td", { "data-l": "Task" }, tr); E("button", { type: "button", class: "lx-link", text: (i + 1) + ". " + shownTitle(D, st, t), onclick: function () { show(i); } }, td);
        E("td", { "data-l": "First answer", text: firstWord(D, t, r) }, tr);
        E("td", { class: "n", "data-l": "Tries", text: String(r.tries || 0) }, tr);
        E("td", { class: "n", "data-l": "Time to first answer", text: fmtMs(r.msFirst) }, tr);
        E("td", { "data-l": "Solution first", text: r.solFirst ? "yes" : o.late === "practice" && lateAnswer(r, solAt()) ? "yes (worked solution open)" : "no" }, tr);
      });
      var text = summaryOf(D, st, { width: window.innerWidth });
      var row = E("div", { class: "lx-ck-row" }, c), msg = E("p", { class: "lx-hint", "aria-live": "polite" }, c);
      var id = LX.uid("ck"); E("label", { for: id, class: "lx-sr", text: "Your results as text" }, c);
      var ta = E("textarea", { id: id, class: "lx-ck-out", readonly: "readonly", rows: "10" }, c); ta.value = text;
      E("button", { type: "button", class: "lx-btn small", html: LX.icon("check") + "Copy my results", onclick: function () {
        // the clipboard API where allowed; else select the text and copy, or ask the reader to copy it by hand
        // execCommand returns false when the browser refuses: then only the selection is left, and the reader is told so
        function fallback() { ta.focus(); ta.select(); var done = false; try { done = document.execCommand("copy") === true; } catch (e) { done = false; }
          msg.textContent = done ? COPIED : "This browser did not copy it. The text below is selected: copy it with Ctrl+C (⌘C on a Mac)."; }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { msg.textContent = COPIED; }, fallback);
        else fallback();
      } }, row);
      E("button", { type: "button", class: "lx-btn ghost small", text: "Back to the tasks", onclick: function () { show(0); } }, row);
      E("button", { type: "button", class: "lx-btn ghost small", text: "Start again", onclick: reset }, row);
      if (o.lessonId && (L.level === D.rule.levels[2] || L.level === D.rule.levels[3])) LX.progress.done(o.lessonId);
      LX.emit("layout");
    }
    // the rubric, read from the page's table (one source for the page and the self-rating)
    var RUBRIC = [], rt = q(o.rubric);
    if (rt) rt.querySelectorAll("tbody tr").forEach(function (tr) {
      var cells = tr.querySelectorAll("th, td");
      RUBRIC.push({ id: tr.getAttribute("data-c"), name: cells[0].textContent.trim(), levels: [1, 2, 3, 4].map(function (k) { return cells[k] ? cells[k].textContent.trim() : ""; }) });
    });
    // the worked-solution section: shut until the submit task (the estimate) is answered, or with gateAll until every task
    // is answered (or opened on purpose, which is recorded)
    var lock = q(o.lock), solBody = q(o.solution), ob = null;
    if (lock && solBody) {
      var er = gateT && st.tasks[gateT.id], done = o.gateAll ? allAnswered(D, st) || !!st.solEarly : !!(er && (er.first != null || er.answer || er.solFirst));
      lock.hidden = done; solBody.classList.toggle("is-open", done);
      ob = lock.querySelector("button");
      if (ob) ob.addEventListener("click", early);
    }
    // clean removal, so a page can swap runners: the clock stops and the attempt is saved; listeners and markup go
    function destroy() {
      stopClock();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      if (ob) ob.removeEventListener("click", early);
      wrap.remove();
    }
    if (st.finished && !location.hash) results(); else intro();
    return { show: show, results: results, intro: intro, state: function () { return st; }, solutionNow: early, destroy: destroy };
  };
  Object.keys(pure).forEach(function (k) { LX.Checkpoint[k] = pure[k]; });
  // when the page's worked solution first opened for the runner stored under `key` (ISO time), or null
  LX.Checkpoint.solOpened = function (key) { return LX.store.get(key + "-sol-open", null); };
  LX.Checkpoint.lineChart = lineChart;
})();
