// test_components_checkpoint_options.js — Node tests for the checkpoint runner's per-task options (components/checkpoint.js,
// generalised from CK-R's task 1 first):
//   - opensAfter: [task ids]: a task opens only once each named task is submitted; until then its card shows a notice in
//     place of its question, answers, early button and worked solution, a "Go to task N" button, and its clock does not run
//     and its tag, the results table and the copied summary call it "Opens after task 1" (no title, skill or lessons)
//   - freeze: true: once submitted, the task's answer stays as given (every kind: text, choice, order, number, estimate);
//     points and self-ratings can still be ticked; feedback on a wrong first answer points to the worked solution; the
//     kept line describes the kept controls and takes focus after a submission; an empty number is not kept
//   - the pure helpers: submitted, waitsFor, outOfOrder, taskList, waitText, openProblems
//   - a task without either option behaves as before (its retry line; no notice, no kept line)
// CK-R's own test checks the page that uses them; CK-F, CK-A and CK-M use neither and keep their own tests.
// Usage (from the site folder):  node _tests/learn/test_components_checkpoint_options.js
"use strict";
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const CP = require(path.join(SITE, "assets/learn/components/checkpoint.js"));
const { env, load, El, active } = require("./stubdom.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const text = s => String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const LEVELS = ["Not yet", "Developing", "Proficient", "Strong"];
function data() {
  return { version: "options v1", rule: { auto: 4, autoProficient: 3, autoStrong: 4, criteria: ["units"], levels: LEVELS },
    tasks: [
      { id: "own", kind: "open-short", title: "Your own text", skill: "Write", lesson: "R1", prompt: "Write two sentences.", points: ["One point.", "Another point."], solution: "Your own.", freeze: true },
      { id: "pick", kind: "choice", title: "Pick one", skill: "Choose", lesson: "R2", prompt: "Which one?", options: [["a", "Option A"], ["b", "Option B"]], answer: "b",
        why: { a: "Not this one.", b: "This one." }, solution: "B, because.", opensAfter: ["own"], freeze: true },
      { id: "seq", kind: "order", title: "Put in order", skill: "Order", lesson: "R3", prompt: "Order these.", items: [["x", "First"], ["y", "Second"], ["z", "Third"]], start: ["z", "x", "y"],
        solution: "First, second, third.", opensAfter: ["own", "num"], freeze: true },
      { id: "num", kind: "numeric", title: "A number", skill: "Compute", lesson: "R4", prompt: "How much?", answer: { value: 10, tol: 0.01, show: "10 kW" }, units: [["kW", 1], ["W", 0.001]],
        solution: "10 kW.", freeze: true, freezeNote: "Kept as you gave it." },
      { id: "est", kind: "estimate", title: "An estimate", skill: "Estimate", lesson: "R5", prompt: "Estimate it.", units: [["MWh", 1], ["MW", null]], range: [100, 200], show: [100, 200],
        opensAfter: ["own"], freeze: true },
      { id: "free", kind: "choice", title: "No options", skill: "Choose", lesson: "R6", prompt: "Which other one?", options: [["a", "Option A"], ["b", "Option B"]], answer: "a",
        why: { a: "Right.", b: "Wrong." }, solution: "A." }
    ] };
}

// ---------------- pure helpers
{
  const D = data(), st = { tasks: {} };
  ok(!CP.submitted(null) && !CP.submitted({ first: null }) && CP.submitted({ first: false }) && CP.submitted({ first: null, answer: "text" }), "submitted: a first answer, or a written task's text");
  ok(CP.waitsFor(D, st, D.tasks[1]).join() === "own" && CP.waitsFor(D, st, D.tasks[2]).join() === "own,num" && CP.waitsFor(D, st, D.tasks[0]).length === 0 && CP.waitsFor(D, st, D.tasks[5]).length === 0,
    "waitsFor: the opensAfter names not yet submitted, in task order");
  st.tasks.own = { first: false, answer: "text", at: "2026-11-07T10:00:00.000Z" };
  ok(CP.waitsFor(D, st, D.tasks[1]).length === 0 && CP.waitsFor(D, st, D.tasks[2]).join() === "num", "waitsFor: task 1 submitted opens task 2; task 3 still waits for task 4");
  ok(CP.taskList(D, ["own"]) === "task 1" && CP.taskList(D, ["own", "num"]) === "tasks 1 and 4" && CP.taskList(D, ["own", "pick", "num"]) === "tasks 1, 2 and 4", "taskList: task 1; tasks 1 and 4; tasks 1, 2 and 4");
  const w1 = CP.waitText(D, D.tasks[1], ["own"]), w2 = CP.waitText(D, D.tasks[2], ["own", "num"]);
  ok(w1.question === "This task opens once task 1 is submitted." && /^<b>Task 1 first\.<\/b> This task's question and worked solution would shape your answer there, so they open once it is submitted\.$/.test(w1.why),
    "waitText for one task: " + w1.question + " " + text(w1.why));
  ok(w2.question === "This task opens once tasks 1 and 4 are submitted." && /^<b>Tasks 1 and 4 first\.<\/b> .*your answers there, so they open once those are submitted\.$/.test(w2.why), "waitText for two: " + w2.question + " " + text(w2.why));
  const late = { tasks: { own: { first: false, answer: "t", at: "2026-11-07T10:10:00.000Z" }, pick: { first: true, at: "2026-11-07T10:00:00.000Z" } } };
  ok(CP.outOfOrder(D, late).join() === "own", "outOfOrder: task 1 submitted after task 2 (which waits for it) was answered");
  ok(CP.outOfOrder(D, st).length === 0 && CP.outOfOrder(D, { tasks: { pick: { first: true, at: "2026-11-07T10:00:00.000Z" } } }).length === 0 &&
    CP.outOfOrder(D, { tasks: { own: { answer: "t", at: "2026-11-07T10:00:00.000Z" }, pick: { first: true, at: "2026-11-07T10:00:00.000Z" } } }).length === 0, "outOfOrder: none when in order, at the same time, or not submitted");
  ok(CP.openProblems(D).length === 0, "openProblems: none in a sound checkpoint");
  const bad = data(); bad.tasks[0].opensAfter = ["seq"]; bad.tasks[5].opensAfter = ["free", "nope"];
  const pr = CP.openProblems(bad);
  ok(pr.some(x => x === "free waits for itself") && pr.some(x => x === "free waits for an unknown task nope") && pr.some(x => /^circle: .*own -> seq -> own|^circle: .*seq -> own -> seq/.test(x)), "openProblems: itself, unknown, a circle: " + pr.join("; "));
}

// ---------------- the runner on a stub document
function mount(opts, store) {   // store: an earlier page's stored values (a reload)
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env({ store }); let clock = 0;
  E.window.performance.now = () => (clock += 1000);   // every reading one second later, so time on a task shows
  load("checkpoint", E);
  const tb = E.LX.H("tbody", null, E.LX.H("table", { id: "opts-rubric" }, E.body)), tr = E.LX.H("tr", { "data-c": "units" }, tb);
  E.LX.H("th", { text: "Units" }, tr); ["No unit", "A unit of power", "Energy, wrong scale", "Energy per year"].forEach(x => E.LX.H("td", { text: x }, tr));
  const D = (opts && opts.data) || data(), live = E.LX.H("div", null, E.body);
  const cp = E.LX.Checkpoint(live, Object.assign({ data: D, key: "opts-v1", code: "TEST", rubric: "#opts-rubric" }, opts || {}));
  const btn = re => live.querySelectorAll("button").filter(x => re.test(x.textContent))[0];
  const tag = () => { const t = live.querySelector(".lx-ck-tag"); return t ? +/Task (\d+)/.exec(t.textContent)[1] - 1 : -1; };
  const goTo = i => { for (let k = 0; k < 20 && tag() !== i; k++) (tag() < i ? btn(/Next task|Start the checkpoint|Resume/) : btn(/^Back$/)).click(); };
  const q = () => live.querySelector(".lx-ck-q").textContent, all = () => text(live.textContent), rec = id => (E.LX.store.get("opts-v1", { tasks: {} }).tasks[id] || {});
  return { E, D, cp, live, btn, goTo, q, all, rec };
}
{
  const P = mount(), { live, btn, goTo, q, all, rec } = P;
  // waiting tasks: a notice instead of the question; nothing to answer; no early button; no solution; no clock
  goTo(1);
  ok(q() === "This task opens once task 1 is submitted." && !live.querySelector(".lx-ck-body") && !live.querySelector(".lx-choice") && !live.querySelector(".lx-ck-sol") && !live.querySelector("button.lx-link"),
    "task 2 before task 1: the notice in place of its question; no answers, solution or early button");
  ok(live.querySelector(".lx-ck-wait") && /Task 1 first\./.test(text(live.querySelector(".lx-ck-wait").innerHTML)) && !/Which one/.test(all()), "the notice says why, and the question stays hidden");
  ok(/^Task 2 of 6/.test(live.querySelector(".lx-ck-tag").textContent) && btn(/^Next task$/) && btn(/^Back$/), "the card keeps its place, its dots and its Back and Next buttons");
  ok(live.querySelector(".lx-ck-tag").textContent === "Task 2 of 6 · opens after task 1" && !/Pick one|Choose|R2/.test(all()), "its tag names what it waits for, not its title, skill or lessons");
  P.cp.results();
  { const rows = live.querySelectorAll(".lx-ck-res tbody tr").map(r => r.children[0].textContent), sum = live.querySelector("textarea.lx-ck-out").value;
    ok(rows.join("|") === "1. Your own text|2. Opens after task 1|3. Opens after tasks 1 and 4|4. A number|5. Opens after task 1|6. No options", "results before task 1: waiting tasks listed as 'Opens after ...': " + rows.join("|"));
    ok(/\n2 \| Opens after task 1 \| – \|/.test(sum) && !/Pick one|Put in order|An estimate/.test(sum), "the copied summary too, without their lessons"); }
  btn(/^Back to the tasks$/).click(); goTo(1);
  goTo(2);
  ok(q() === "This task opens once tasks 1 and 4 are submitted." && btn(/^Go to task 1$/), "task 3 waits for two tasks, and its button goes to the first");
  goTo(4); ok(/opens once task 1 is submitted/.test(q()), "the estimate waits too");
  goTo(5); ok(q() === "Which other one?" && live.querySelectorAll(".lx-choice").length === 2, "a task without opensAfter is open");
  goTo(2); btn(/^Go to task 1$/).click();
  ok(live.querySelector(".lx-ck-tag").textContent.indexOf("Task 1 of 6") === 0, "'Go to task 1' goes there");
  ok(!rec("pick").ms && !rec("seq").ms && !rec("est").ms && rec("free").ms > 0, "no time is counted on a waiting task (a task without the option counts as before)");
  ok(rec("pick").first == null && !rec("pick").answer, "a waiting task records no answer");

  // freeze, a written task: read-only once submitted; its points can still be ticked
  live.querySelector("textarea").value = "My two sentences."; btn(/^Submit my explanation$/).click();
  const ta = live.querySelector("textarea");
  ok(ta.hasAttribute("readonly") && ta.readOnly && !btn(/^Submit my explanation$/) && live.querySelector(".lx-ck-kept").textContent === "Submitted: your text stays as you wrote it. Tick the points it makes below.",
    "task 1 submitted: its text is read-only, the Submit button gone, the default kept line in its place");
  const cbs = live.querySelectorAll(".lx-ck-points input"); cbs.forEach(cb => { cb.checked = true; cb.fire("change"); });
  { const k = live.querySelector(".lx-ck-kept");
    ok(active() === k && k.getAttribute("tabindex") === "-1" && (ta.getAttribute("aria-describedby") || "").split(" ").indexOf(k.id) >= 0, "the kept line takes focus after submitting and describes the read-only text"); }
  ok(rec("own").points.join() === "true,true" && rec("own").first === true && rec("own").answer === "My two sentences.", "its points can still be ticked; the text stays as submitted");
  goTo(1); goTo(0);
  ok(live.querySelector("textarea").hasAttribute("readonly") && live.querySelector("textarea").value === "My two sentences." && !btn(/^Submit my explanation$/) &&
    live.querySelectorAll(".lx-ck-kept").length === 1 && live.querySelectorAll(".lx-ck-points input").length === 2, "back on task 1: still read-only, one kept line, the points shown");

  // task 2 opens; a frozen choice: a wrong first answer stays, the options are disabled, the feedback points to the solution
  goTo(1);
  ok(q() === "Which one?" && live.querySelectorAll(".lx-choice").length === 2 && !live.querySelector(".lx-ck-wait"), "task 1 submitted: task 2 shows its question and options");
  ok(live.querySelector(".lx-ck-tag").textContent === "Task 2 of 6 · Choose · draws on R2", "and its tag its skill and lessons");
  live.querySelectorAll(".lx-choice")[0].click();
  ok(/Not quite\./.test(all()) && /The worked solution is below\./.test(all()) && !/Try again/.test(all()), "frozen choice: the wrong answer's feedback points to the worked solution, not to a retry");
  ok(live.querySelectorAll(".lx-choice").every(b => b.disabled) && live.querySelector(".lx-ck-kept").textContent === "Submitted: your answer stays as you gave it.", "its options are disabled, with the kept line");
  ok(active() === live.querySelector(".lx-ck-kept") && live.querySelectorAll(".lx-choice").every(b => b.getAttribute("aria-describedby") === live.querySelector(".lx-ck-kept").id), "focus moves from the disabled option to the kept line, which describes the options");
  live.querySelectorAll(".lx-choice")[1].click();
  ok(rec("pick").tries === 1 && rec("pick").answer === "a" && rec("pick").first === false, "a second click changes nothing: one try, the first answer kept");
  ok(!live.querySelector(".lx-ck-sol").hidden, "its worked solution opened with the first answer, as before");

  // task 3 still waits for task 4; a frozen number: read-only field and unit, its own kept line
  goTo(2); ok(q() === "This task opens once task 4 is submitted.", "task 3 now waits only for task 4");
  goTo(3); live.querySelector("input").value = ""; live.querySelector("select").value = "kW"; btn(/^Check$/).click();
  ok(rec("num").first == null && !rec("num").tries && !live.querySelector("input").hasAttribute("readonly") && btn(/^Check$/) && /Enter a positive number\./.test(all()) && /opens once task 4/.test((goTo(2), q())),
    "frozen number: an empty entry is not kept (no answer, still editable, task 3 still waits)");
  goTo(3); live.querySelector("input").value = "10"; live.querySelector("select").value = "kW"; btn(/^Check$/).click();
  ok(rec("num").first === true && live.querySelector("input").hasAttribute("readonly") && live.querySelector("select").disabled && !btn(/^Check$/) && live.querySelector(".lx-ck-kept").textContent === "Kept as you gave it.",
    "frozen number: right, then a read-only field, a fixed unit, no Check, the task's own kept line");

  // a frozen order task: the moves and the check are gone once checked
  goTo(2);
  ok(q() === "Order these." && btn(/^Check the order$/), "task 3 opens once tasks 1 and 4 are submitted");
  btn(/^Check the order$/).click();
  ok(rec("seq").first === false && /in the right place \(green\)\. The worked solution is below\./.test(all()) && !btn(/^Check the order$/) &&
    live.querySelectorAll(".lx-ck-order .mv button").every(b => b.disabled) && live.querySelector(".lx-ck-kept"), "frozen order: checked once, then the moves disabled and the check gone");

  // a frozen estimate: fields read-only after a submitted range; the self-ratings stay
  goTo(4);
  const ins = live.querySelectorAll("input"); ins[0].value = "120"; ins[1].value = "150"; live.querySelector("select").value = "MWh";
  live.querySelectorAll("textarea").forEach((t, k) => { t.value = "text " + k; }); btn(/^Submit my estimate$/).click();
  ok(rec("est").answer && rec("est").answer.low === 120 && live.querySelectorAll(".lx-ck-body input").filter(x => x.getAttribute("type") === "number").every(x => x.hasAttribute("readonly")) &&
    live.querySelectorAll(".lx-ck-body textarea").every(x => x.hasAttribute("readonly")) && live.querySelector("select").disabled && !btn(/^Submit my estimate$/) &&
    live.querySelector(".lx-ck-kept").textContent === "Submitted: your estimate stays as you gave it. Rate it below.", "frozen estimate: read-only fields and unit, no Submit, the kept line");
  { const rb = () => live.querySelectorAll(".lx-ck-rate input");
    ok(rb().length === 4 && rb().every(x => !x.disabled && !x.hasAttribute("readonly")), "its self-rating stays open: four levels for the one criterion");
    rb()[2].checked = true; rb()[2].fire("change");
    ok(rec("est").rating.units === "Proficient", "a self-rating after freezing is stored");
    goTo(3); goTo(4);
    ok(rb()[2].checked && live.querySelectorAll(".lx-ck-kept").length === 1 && !btn(/^Submit my estimate$/) && live.querySelector(".lx-ck-body input").hasAttribute("readonly"), "re-shown: the rating kept, still read-only, one kept line");
    rb()[3].checked = true; rb()[3].fire("change"); ok(rec("est").rating.units === "Strong" && rec("est").answer.low === 120, "the rating can still change; the estimate does not"); }

  // a task without the options: the retry line, nothing disabled, a second try counts
  goTo(5); live.querySelectorAll(".lx-choice")[1].click();
  ok(/Try again, or open the worked solution\./.test(all()) && live.querySelectorAll(".lx-choice").every(b => !b.disabled) && !live.querySelector(".lx-ck-kept"), "a task without freeze: the retry line, options still open");
  live.querySelectorAll(".lx-choice")[0].click();
  ok(rec("free").tries === 2 && rec("free").first === false && rec("free").answer === "a", "a second try is recorded as before");
  ok(CP.outOfOrder(P.D, P.cp.state()).length === 0, "this attempt kept the order: outOfOrder finds nothing");

  // "Start again": every waiting task shuts again
  P.cp.results(); btn(/^Start again$/).click(); btn(/Start the checkpoint/).click(); goTo(1);
  ok(/opens once task 1 is submitted/.test(q()), "after Start again, task 2 waits for task 1 again");
  goTo(0); ok(!live.querySelector("textarea").hasAttribute("readonly") && btn(/^Submit my explanation$/), "and task 1 is open to write again");
}
// waitNote: the page's words, as text or from a function
{
  const P = mount({ waitNote: { question: "Opens after your review.", why: "<b>Review first.</b> Its concerns are your own." } });
  P.btn(/Start the checkpoint/).click(); P.goTo(1);
  ok(P.q() === "Opens after your review." && /Review first\. Its concerns are your own\./.test(text(P.live.querySelector(".lx-ck-wait").innerHTML)) && P.btn(/^Go to task 1$/), "waitNote as text");
  const seen = [];
  const F = mount({ waitNote: (t, ids, D) => { seen.push(t.id + ":" + ids.join("+") + ":" + D.tasks.length); return { question: "Wait for " + ids.join(" and ") + ".", why: "Because." }; } });
  F.btn(/Start the checkpoint/).click(); F.goTo(2);
  ok(F.q() === "Wait for own and num." && seen.indexOf("seq:own+num:6") >= 0, "waitNote as a function of the task, the ids waited for and the data");
}
// drafts: what is typed or picked before submitting is kept apart from the attempt, restored on Back, Next and a reload,
// and never counts as a submission; submitting clears it, and so does "Start again"
{
  const plain = () => { const D = data(); D.version = "options v1 drafts"; D.tasks.forEach(t => { delete t.freeze; delete t.opensAfter; }); return D; };
  const P = mount({ data: plain() }), { live, btn, goTo, all, rec, E } = P, DK = () => ((E.LX.store.get("opts-v1-drafts", {}) || {}).tasks || {});
  goTo(0); const ta = () => live.querySelector("textarea");
  ta().value = "Half a sentence"; ta().fire("input");
  goTo(3);   // a number and its unit, not checked
  live.querySelector("input").value = "12"; live.querySelector("input").fire("input"); live.querySelector("select").value = "W"; live.querySelector("select").fire("change");
  goTo(2);   // an order, moved once, not checked
  const first = () => live.querySelectorAll(".lx-ck-order li")[0].children[1].textContent;
  live.querySelectorAll("button").filter(b => b.getAttribute("aria-label") === "Move up: First")[0].click();
  const moved = live.querySelectorAll(".lx-ck-order li").map(li => li.children[1].textContent).join("|");
  goTo(4);   // the estimate's fields
  { const ins = live.querySelectorAll("input"); ins[0].value = "90"; ins[0].fire("input"); live.querySelectorAll("textarea")[0].value = "Buses times miles"; live.querySelectorAll("textarea")[0].fire("input"); }
  ok(/Draft kept in this browser; not submitted yet\./.test(all()), "drafts: the line under the fields says a draft is kept");
  ok(DK().own.text === "Half a sentence" && DK().num.value === "12" && DK().num.unit === "W" && DK().seq.order.length === 3 && DK().est.low === "90", "drafts: each kind keeps its draft under '<key>-drafts'");
  ok(["own", "num", "seq", "est"].every(id => rec(id).answer == null && rec(id).first == null && !rec(id).tries && !rec(id).at), "drafts: nothing is recorded on the attempt");
  goTo(0); ok(ta().value === "Half a sentence", "drafts: Back restores the text");
  goTo(3); ok(live.querySelector("input").value === "12" && live.querySelector("select").querySelectorAll("option").some(o => o.getAttribute("selected") === "selected" && o.getAttribute("value") === "W"), "drafts: the number and its unit come back");
  goTo(2); ok(live.querySelectorAll(".lx-ck-order li").map(li => li.children[1].textContent).join("|") === moved, "drafts: the unchecked order comes back: " + moved);
  goTo(4); ok(live.querySelectorAll("input")[0].value === "90" && live.querySelectorAll("textarea")[0].value === "Buses times miles", "drafts: the estimate's fields come back");
  P.cp.results();
  ok(!live.querySelector("textarea.lx-ck-out").value.includes("Half a sentence") && !live.querySelector("textarea.lx-ck-out").value.includes("Buses times") && CP.level(P.D, P.cp.state()).auto === 0,
    "drafts: not in the copied summary or the level");
  // a reload
  const R = mount({ data: plain() }, E.store);
  R.btn(/^Back to the tasks$/).click(); R.goTo(0);
  ok(R.live.querySelector("textarea").value === "Half a sentence", "drafts: after a reload, the text is back");
  R.goTo(3); ok(R.live.querySelector("input").value === "12", "drafts: after a reload, the number is back");
  // submitting clears the draft; a later edit of a submitted text is a new draft
  R.goTo(0); R.btn(/^Submit my explanation$/).click();
  const DR = () => ((R.E.LX.store.get("opts-v1-drafts", {}) || {}).tasks || {});
  ok(R.rec("own").answer === "Half a sentence" && !DR().own && !/Draft kept/.test(text(R.live.querySelector(".lx-ck-body").textContent)), "drafts: submitting records the text and clears its draft and line");
  R.live.querySelector("textarea").value = "Half a sentence, now finished."; R.live.querySelector("textarea").fire("input");
  ok(DR().own.text === "Half a sentence, now finished." && R.rec("own").answer === "Half a sentence", "drafts: editing a submitted text keeps a draft; the submission stays until submitted again");
  R.live.querySelector("textarea").value = "Half a sentence"; R.live.querySelector("textarea").fire("input");
  ok(!DR().own, "drafts: back to the submitted text: no draft");
  R.goTo(3); R.live.querySelector("select").value = "W"; R.btn(/^Check$/).click();   // (the stub select does not read its selected option)
  ok(R.rec("num").tries === 1 && !DR().num, "drafts: checking the number clears its draft");
  // "Start again" clears every draft
  R.cp.results(); R.btn(/^Start again$/).click();
  ok(Object.keys(DR()).length === 0, "drafts: Start again clears them");
  // a draft stored for a frozen task is never shown: the submitted answer is
  const F = mount(), FD = F.E.LX.store;
  F.goTo(0); F.live.querySelector("textarea").value = "Kept text"; F.btn(/^Submit my explanation$/).click();
  FD.set("opts-v1-drafts", { version: F.D.version, tasks: { own: { text: "A stale draft" } } });
  F.goTo(1); F.goTo(0);
  ok(F.live.querySelector("textarea").value === "Kept text" && !((FD.get("opts-v1-drafts", {}) || {}).tasks || {}).own, "drafts: a frozen task shows its submission and drops a stale draft");
}
// the copy button: "Copied" only when the browser copied; otherwise the text is selected and the reader is asked to copy it
{
  const P = mount(); P.cp.results();
  const copy = () => P.btn(/Copy my results/).click(), msg = () => P.live.querySelector("p.lx-hint[aria-live]").textContent;
  P.E.document.execCommand = () => false; copy();
  ok(/did not copy it\. The text below is selected: copy it with Ctrl\+C/.test(msg()) && !/^Copied/.test(msg()), "copy refused (execCommand false): no 'Copied', the reader is asked to copy: " + msg());
  P.E.document.execCommand = () => { throw new Error("blocked"); }; copy();
  ok(/did not copy it/.test(msg()), "copy throws: the same request");
  P.E.document.execCommand = () => true; copy();
  ok(msg() === "Copied. Keep these results, or share them with a mentor.", "copy done: " + msg());
  ok(!/tester|form/.test(msg()), "no tester or form wording");
}
console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (checkpoint per-task options)");
process.exit(fails ? 1 : 0);
