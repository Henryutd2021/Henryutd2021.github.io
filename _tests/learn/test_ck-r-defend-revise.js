// test_ck-r-defend-revise.js — Node tests for CK-R, the Researcher checkpoint (assets/learn/ck-r-defend-revise.js, its data
// file and the page learn/ck-r-defend-revise.qmd):
//   - the fictional co-op study's numbers agree with each other everywhere they appear (pumps by group, the first and
//     revised results, the interval, the rerun, the tolerance, the board's threshold, the hold-out summer), and the
//     worked arithmetic shows the numbers it uses (0.3 ÷ 4.6 = 0.065, 6.5%)
//   - the tasks: twelve, seven auto-marked and five written with four points each; the answers, the unit check, the order
//     task's start; the level rule on sample attempts (late answers, early openings, practice)
//   - the worked review, response and revision (LX.Exemplars) are well formed; the revision pair names the three rubric
//     competences that moved from Proficient to Strong, in the rubric's own Strong words
//   - the course rubric in the curriculum's words (framing, method, trust), never reworded; the page's rules agree with
//     the data's rule; the parts add up to 240 minutes
//   - the page on a stub document with the real runner: gateAll (eleven answers leave it shut, the twelfth opens it), the
//     lock's early opening makes the attempt practice, every task right in order gives Strong
//   - scope: no nuclear term, no data-center term, no "AI", no deny-listed term; links to learn pages and doi.org only
// Usage (from the site folder):  node _tests/learn/test_ck-r-defend-revise.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "ck-r-defend-revise";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RB = require(L("components/rubric.js"));
const EXS = require(L("components/exemplars.js"));
const DPATH = L("data/" + ID + ".json"), QPATH = path.join(SITE, "learn", ID + ".qmd"), SIDE = path.join(SITE, "learn/_w1", ID + ".yml");
const D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const rel = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t) * Math.max(1, Math.abs(b));
const text = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
const BLOCKS = { "ckr-study": () => M.staticStudy(D), "ckr-forms": () => M.staticForms(D), "ckr-tasks": () => M.staticTasks(D), "ckr-solution": () => M.staticSolution(D),
  "ckr-criteria": () => M.staticCriteria(D), "ckr-course-rubric": () => RB.staticHTML(D.rubric) };
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("wrote the page's static blocks");
}
const PAGE = fs.readFileSync(QPATH, "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8"), RAW = fs.readFileSync(DPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", "block " + k + " is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, ""), TX = text(OWN);
const has = (s, what) => ok(TX.includes(s), "page: " + what + ": '" + s + "'");

// ---------------- the fictional study's numbers, everywhere they appear
const N = D.numbers, ALLTXT = text(RAW.replace(/\\n/g, " "));
ok(N.joined2024 + N.notJoined2024 === N.pumps && N.joined2025 + N.never === N.notJoined2024 && N.joined2024 + N.joined2025 + N.never === N.pumps, "pumps: 41 + 71 = 112; 71 = 29 + 42");
ok(N.lo < N.revised && N.revised < N.hi && N.lo < N.holdout && N.holdout < N.hi, "the revised result (4.6) and the hold-out summer (4.1) both lie inside the interval 2.9 to 6.3");
ok(N.lo > N.keep, "the whole interval is above the board's 1.5 kW: 'above 1.5 kW across the interval' holds");
ok(N.first > N.revised, "the fairer comparison lowered the estimate (6.2 to 4.6), as the response says");
{
  const gap = (N.revised - N.rerun) / N.revised, t = D.tasks.find(x => x.id === "gap");
  ok(rel(t.answer.value, gap * 100, 1e-12), "the gap task's answer is (4.6 − 4.3) ÷ 4.6 = " + (gap * 100).toFixed(4) + "%");
  ok(rel(N.revised - N.rerun, 0.3, 1e-9) && (0.3 / 4.6).toFixed(3) === "0.065" && (gap * 100).toFixed(1) === "6.5", "the arithmetic as displayed: 0.3 ÷ 4.6 = 0.065, 6.5%");
  ok(gap * 100 > N.tolerancePct, "the gap is over the 1% tolerance, as the tasks say");
  ok(M.checkNumeric(t, 6.5, "%").right && M.checkNumeric(t, 6.52, "%").right && M.checkNumeric(t, 0.065, "share (0 to 1)").right, "the gap: 6.5%, 6.52% and 0.065 as a share are right");
  ok(!M.checkNumeric(t, 6.9, "%").right && !M.checkNumeric(t, 7.0, "%").right, "the gap against the rerun (0.3 ÷ 4.3 = 7.0%) is not right");
  const kw = M.checkNumeric(t, 0.3, "kW"); ok(!kw.right && kw.kind && /share of the reported value/.test(kw.msg), "kW is flagged as the wrong kind of answer");
  ok(/0\.13 percentage points/.test(t.tolNote) && rel(t.answer.value * t.answer.tol, 0.13, 0.01), "the tolerance note: 2% of 6.52% is about 0.13 points");
}
[["41 pumps that joined in 2024", "41"], ["the 71 that did not", "71"], ["112 irrigation pumps", "112"], ["29 farms that joined in 2025", "29"], ["6.2 kW per pump", "6.2"],
  ["4.6 kW per pump (95% interval 2.9 to 6.3)", "4.6"], ["4.3 kW", "4.3"], ["within 0.5 kW", "0.5"], ["above 1.5 kW", "1.5"], ["4.1 kW", "4.1"], ["four summers before 2024", "4"], ["20 highest-load summer hours", "20"]]
  .forEach(([s]) => ok(ALLTXT.includes(s), "data text says '" + s + "'"));
{ const kw = [...ALLTXT.matchAll(/(\d+(?:\.\d+)?) kW/g)].map(m => +m[1]), allowed = [N.first, N.revised, N.rerun, N.holdout, N.keep, N.pretrend, +(N.revised - N.rerun).toFixed(1)];   // 0.3 kW: the rerun's gap
  ok(kw.length > 10 && kw.every(v => allowed.includes(v)), "every kW figure in the data is one of the study's numbers: " + [...new Set(kw.filter(v => !allowed.includes(v)))].join(", "));
  const cnt = [...ALLTXT.matchAll(/(\d+) (?:irrigation )?(?:pumps|farms|that did not)/g)].map(m => +m[1]), counts = [N.pumps, N.joined2024, N.joined2025, N.never, N.notJoined2024];
  ok(cnt.length >= 4 && cnt.every(v => counts.includes(v)), "every count of pumps or farms is one of the study's: " + [...new Set(cnt.filter(v => !counts.includes(v)))].join(", ")); }
["The rerun from a clean clone gives 4.6 kW", "the rerun gives 4.6 kW", "reran it from the repository: 4.6 kW", "reran the clean clone and got 4.6 kW"].forEach(s => ok(ALLTXT.toLowerCase().includes(s.toLowerCase()) || ALLTXT.includes(s), "after the fix, the rerun is 4.6 kW: '" + s + "'"));
ok(D.worked.rerun.some(r => r[0] === "Values" && r[1].includes("(4.6 − 4.3) ÷ 4.6 = 0.3 ÷ 4.6 = 0.065, or 6.5%")), "the worked rerun shows its arithmetic as displayed");
has("4.3 kW and 1%", "the numbers table: rerun and tolerance");
has("112 pumps", "the numbers table: pumps");

// ---------------- the tasks
const T = D.tasks, task = id => T.find(t => t.id === id), auto = T.filter(t => ["choice", "order", "numeric"].includes(t.kind)), written = T.filter(t => t.kind === "open-short");
ok(T.length === 12 && auto.length === 7 && written.length === 5 && D.rule.auto === 7, "twelve tasks: seven auto-marked, five written");
ok(written.every(t => t.points.length === 4), "every written task has four points");
ok(written.map(t => T.indexOf(t) + 1).join() === "1,6,7,8,12", "the written tasks are 1, 6, 7, 8 and 12, as the page says");
has("at least 3 of the 4 points of each written task (1, 6, 7, 8 and 12)", "the written tasks named before the tasks");
ok(written.slice(1).every(t => /your|Your/.test(t.prompt) && t.part !== "A"), "tasks 6, 7, 8 and 12 are on the reader's own study (parts B to D)");
ok(auto.every(t => t.part === "A" || t.part === "D") && auto.every(t => !/your research capstone|your own/i.test(t.prompt)), "the auto-marked tasks are on the fictional study");
T.filter(t => t.kind === "choice").forEach(t => {
  ok(t.options.some(o => o[0] === t.answer) && t.options.every(o => t.why[o[0]]), "choice " + t.id + ": the answer is an option, and every option has feedback");
  ok(M.checkChoice(t, t.answer).right && t.options.filter(o => o[0] !== t.answer).every(o => !M.checkChoice(t, o[0]).right), "choice " + t.id + ": only the answer is right");
});
ok(task("rank").answer === "b" && task("competence").answer === "a" && task("respond").answer === "c" && task("strong").answer === "b" && task("report").answer === "c", "the choice answers: selection, Framing, the 2025 joiners, the limit mitigated, find and fix the cause");
{ const o = task("steps"), want = o.items.map(x => x[0]);
  ok(o.start.slice().sort().join() === want.slice().sort().join() && o.start.join() !== want.join(), "the order task starts shuffled, with every step");
  ok(M.checkOrder(o, want).right && !M.checkOrder(o, o.start).right, "the order task's answer is its listed order");
  ok(want.join() === "clone,env,data,run,compare,log", "clone, environment, data, run, compare, log"); }
// the Strong words the worked answers lean on are the rubric's own
{ const comp = id => RB.COMPETENCES.find(c => c.id === id);
  ok(task("strong").solution.includes("“" + comp("method").strong + "”"), "task 5's solution quotes Method fit's Strong level word for word");
  const diff = D.worked.revision.diff;
  ok(diff.map(d => d.label).join() === [comp("framing").label, comp("method").label, comp("trust").label].join(), "the revision's difference table: Framing, Method fit, Trustworthy analysis");
  ok(/what answer would change a decision/.test(comp("framing").strong) && /limits of the chosen method stated and partly mitigated/.test(comp("method").strong) && /independent reproduction by someone else; validation on data not used to build the analysis/.test(comp("trust").strong), "the three Strong anchors the worked revision shows");
  const good = EXS.plain(D.worked.revision.answers[1]);
  ok(/would keep the tariff/.test(good) && /Limit: later joiners may still differ\. Mitigated/.test(good) && /co-op engineer reran the clean clone/.test(good) && /not used to build the analysis/.test(good), "the Strong revision shows each of the three moves"); }
// the worked exemplars are well formed
["review", "response", "revision"].forEach(k => {
  const o = M.exOpts(D, k);
  ok(EXS.validate(o).length === 0, "worked " + k + ": " + EXS.validate(o).join("; "));
  ok(!o.diff || o.diff.every(d => o.answers.every(a => d[a.key])), "worked " + k + ": every difference row has a cell for each answer");
});
ok(D.worked.revision.answers.map(a => a.level).join() === "Proficient,Strong" && D.worked.review.answers.map(a => a.level).join() === "Developing,Strong", "levels: the reviews Developing and Strong; the revisions Proficient and Strong");
// the forms: each says what the tasks ask for
{ const F = id => D.forms.find(f => f.id === id).lines.join(" ");
  ok(/rubric competence/.test(F("review")) && /another family/.test(F("review")) && /rerun/.test(F("review")), "the review form asks for competences, another family and the rerun");
  ok(/accepted \/ partly accepted \/ declined/.test(F("response")) && /where/.test(F("response")), "the response form: accepted, partly, declined; the change and where");
  ok(/Before → after/.test(F("log")) && /self-rating/.test(F("log")), "the change log: before → after, and the self-rating");
  ok(/before the rerun/.test(F("rerun")) && /share of the reported value/.test(F("rerun")) && /Who reran it/.test(F("rerun")), "the rerun report: tolerance first, the share, who reran it"); }

// ---------------- the level rule on sample attempts
{
  const rec = (first, extra) => Object.assign({ first, tries: 1, at: "2026-11-07T10:00:00Z" }, extra || {});
  const st = (k, p, o) => { const s = { tasks: {} }; written.forEach((t, i) => { const n = Array.isArray(p) ? p[i] : p; s.tasks[t.id] = rec(n === 4, { answer: "text", points: t.points.map((_, j) => j < n) }); });
    auto.forEach((t, i) => { s.tasks[t.id] = rec(i < k); }); return Object.assign(s, o || {}); };
  const R = s => M.level(Object.assign({}, D), s).level;
  ok(R(st(7, 4)) === "Strong" && R(st(6, 4)) === "Strong" && R(st(6, [4, 4, 3, 4, 4])) === "Proficient" && R(st(5, 3)) === "Proficient" && R(st(5, [3, 3, 2, 3, 3])) === "Developing" &&
    R(st(4, 4)) === "Developing" && R(st(3, 0)) === "Developing" && R(st(2, 4)) === "Not yet", "the level rule on sample attempts");
  ok(M.level(D, st(7, 4, { solEarly: "2026-11-07T09:00:00Z" })).level === "Practice (no level)", "the worked solution opened early by this attempt: practice");
  const opened = st(7, 4); opened.tasks.rank.solFirst = true; ok(M.level(D, opened).auto === 6, "a task opened before answering counts as not right");
  const seen = st(7, 4);
  ok(M.level(Object.assign({ solOpen: "2026-11-06T00:00:00Z" }, D), seen).level === "Practice (no level)" && M.level(Object.assign({ solOpen: "2026-11-07T10:00:00Z" }, D), seen).level === "Strong", "opened by an earlier attempt: practice; opened by the last answer: counts");
  const late = st(7, 4); T.forEach(t => { late.tasks[t.id].at = t.id === "review" ? "2026-11-07T10:00:00.000Z" : "2026-11-07T10:05:00.000Z"; });
  const LL = M.level(Object.assign({ solOpen: "2026-11-07T10:00:00.000Z" }, D), late);
  ok(LL.level === "Practice (no level)" && LL.auto === 0 && LL.points.join() === "4,0,0,0,0" && LL.late === 11, "answers after the worked solution opened are practice: " + LL.level + ", " + LL.points.join() + ", " + LL.late + " late");
  ok(/so this attempt is practice and gets no level/.test(M.describe(D, LL)) && /counted as practice \(not right, no points\): 11 tasks/.test(M.describe(D, Object.assign({}, LL, { assisted: null }))), "the results sentence says why");
  ok(/your review of the co-op proposal 4 of 4; your mock review 4 of 4; your response 4 of 4; your revision 4 of 4; your rerun 4 of 4\./.test(M.describe(D, M.level(D, st(7, 4)))), "the results sentence names each written task's points");
  ok(/yes \(the worked solution\)/.test(M.summary(Object.assign({ solOpen: "2026-11-07T10:00:00.000Z" }, D), late, {})), "the copied summary marks late answers");
  ok(/^Learn · CK-R results \(ck-r v1 \(7 Nov 2026\)\)\n/.test(M.summary(D, st(7, 4), { width: 375 })) && /Your text, your mock review: text/.test(M.summary(D, st(7, 4), {})), "the copied summary's first line, and the reader's texts in it");
}

// ---------------- the page's own text
{ const mins = [...OWN.matchAll(/\(about (\d+) min\)/g)].map(m => +m[1]); ok(mins.length === 5 && mins.reduce((a, x) => a + x, 0) === 240, "the parts add up to about 240 minutes: " + mins.join(" + ")); }
has("How this checkpoint works · about 240 minutes, no hints", "240 minutes");
has("Proficient: at least 5 of the 7 auto-marked tasks right on the first try", "Proficient's auto count");
has("Strong: at least 6 of 7 on the first try, and every written point.", "Strong");
has("Developing: at least 3 of 7 on the first try.", "Developing");
ok(D.rule.autoProficient === 5 && D.rule.autoStrong === 6 && D.rule.autoDeveloping === 3 && D.rule.pointsProficient === 3, "the data's rule equals the page's");
has("Enter your results in the twelve tasks below, in any order. The worked review, response and revision open once all twelve are answered.", "gateAll, before the tasks");
has("After the worked solution opens: an answer given after that counts as practice, not as right, and a written task then earns no points.", "the late-answer rule, before the tasks");
has("Opens once all twelve tasks are answered.", "the lock box");
ok(/gateAll: true, late: "practice"/.test(JS) && !/submitTask/.test(JS.slice(JS.indexOf("LX.Checkpoint(live"))), "the runner: gateAll and the late-answer rule, no submit task");
has("The co-op, its farms and every number here are fictional (illustrative).", "the fictional label on the study");
ok(OWN.includes('href="cr-your-own-study.html"'), "the page links the research capstone it defends");
// the rubric: the course's words, never reworded
{
  const ids = D.rubric.map(x => x.id);
  ok(ids.join() === "framing,method,trust" && D.rubric.every(x => !x.levels && x.look), "rubric: framing, method fit and trustworthy analysis, with look lines and no reworded levels");
  const cur = path.join(SITE, "..", "reports/learn/curriculum_v2.md"), CUR = process.env.LEARN_CURRICULUM || (fs.existsSync(cur) ? cur : null);
  if (CUR && fs.existsSync(CUR)) {
    const c = fs.readFileSync(CUR, "utf8");
    ok(ids.every(id => { const x = RB.COMPETENCES.find(y => y.id === id); return ["developing", "proficient", "strong"].every(l => c.includes(x[l])); }), "rubric words are curriculum §3.4's, word for word");
    ok(/\| CK-R \| Researcher \| Defend your CR question and method in a written mock review; answer the critique; revise; reproduce your main result from a clean clone and report any difference\. \| An annotated example of a review, a response and a revision, with what moved the study from Proficient to Strong\. \| 240 min \| R8, R9 \|/.test(c), "the curriculum's CK-R row is the one built here (task, solution, 240 min, R8 and R9)");
  }
}
{ const crit = D.criteria; ok(crit.length === 4 && crit.every(c => c.levels.length === 4) && crit.map(c => c.id).join() === "review,response,revision,rerun", "CK-R's own criteria: review, response, revision, rerun, four anchored levels each"); }

// ---------------- the page on a stub document, with the real runner
(async () => {
  const P = mountFresh();
  ok(!P.threw, "the page mounts on the stub document" + (P.threw ? ": " + P.threw : ""));
  if (P.threw) return finish();
  ok(P.E.body.querySelectorAll("#ckr-ex-review .lx-ex-mark").length >= 7 || /The worked review/.test(P.E.body.querySelector("#ckr-ex-review").textContent), "the worked review is drawn live inside the gated solution");
  ok(P.cr.querySelectorAll("fieldset").length === 3 || /Trustworthy analysis/.test(P.cr.textContent), "the course rubric draws its three competences");
  ok(text(P.live.textContent).includes("The worked solution section opens once all twelve tasks are answered, in any order; opening it earlier is recorded. An answer given after it opens counts as practice, not as right, and a written task then earns no points."), "runner: the intro states the gate and the late-answer rule");
  ["mid", "done", "solution"].forEach(s => { let q = null; try { q = P.demo(s); } catch (err) { q = null; } ok(q && q.view, "demo state " + s + " runs"); });
  ok(P.E.LX.store.get(M.KEY + "-sol-open", null) && P.E.body.querySelector("#ckr-solution-body").classList.contains("is-open"), "the solution demo opens the worked solution through the runner, recorded");
  await gateSequence();
  await earlySequence();
  finish();
})().catch(err => { ok(false, "the stub page test threw: " + (err && err.stack || err)); finish(); });

function mountFresh() {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env(); E.LX.ready = () => {}; E.LX.reduced = () => true; E.window.innerWidth = 1280;
  ["checkpoint", "rubric", "exemplars"].forEach(n => load(n, E));
  let init = null, demo = null; E.LX.mount = (slug, f) => { if (slug === ID) init = f; }; E.LX.demo = (root, fn) => { demo = fn; return () => null; };
  const lock = E.LX.H("div", { id: "ckr-lock", hidden: "" }, E.body); E.LX.H("button", { type: "button" }, lock);
  E.LX.H("div", { id: "ckr-solution-body", class: "lx-ck-gated" }, E.body);
  ["review", "response", "revision"].forEach(k => E.LX.H("div", { id: "ckr-ex-" + k, class: "lx-xcard" }, E.body));
  const cr = E.LX.H("div", { id: "ckr-course-rubric" }, E.body);
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, setTimeout: f => { f(); return 0; }, clearTimeout: () => {}, require });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { ck_r_defend_revise: D }, root); } catch (err) { threw = err.stack; }
  const btn = re => live.querySelectorAll("button").filter(x => re.test(x.textContent))[0];
  const goTo = i => { for (let k = 0; k < 16; k++) { const tag = live.querySelector(".lx-ck-tag"); const cur = tag ? +/Task (\d+)/.exec(tag.textContent)[1] - 1 : -1; if (cur === i) return; (cur < i ? btn(/Next task|Start the checkpoint|Resume/) : btn(/^Back$/)).click(); } };
  // answer task i right on its first try (written tasks: submit a text, then tick every point)
  const answer = i => {
    goTo(i); const t = D.tasks[i];
    if (t.kind === "numeric") { live.querySelector("input").value = String(t.answer.value); live.querySelector("select").value = "%"; btn(/^Check$/).click(); }
    if (t.kind === "choice") live.querySelectorAll(".lx-choice").filter(b => b.textContent === t.options.find(o => o[0] === t.answer)[1])[0].click();
    if (t.kind === "order") {
      const want = t.items.map(x => x[1]);
      for (let guard = 0; guard < 40; guard++) {
        const cur = live.querySelectorAll(".lx-ck-order li").map(li => li.children[1].textContent);
        const i0 = cur.findIndex((x, j) => x !== want[j]); if (i0 < 0) break;
        const j = cur.indexOf(want[i0]);
        live.querySelectorAll("button").filter(b => b.getAttribute("aria-label") === "Move up: " + cur[j])[0].click();
      }
      btn(/Check the order/).click();
    }
    if (t.kind === "open-short") { live.querySelector("textarea").value = "My own text for " + t.id + "."; btn(/Submit my explanation/).click();
      live.querySelectorAll(".lx-ck-points input").forEach(cb => { cb.checked = true; cb.fire("change"); }); }
  };
  const level = () => { goTo(D.tasks.length - 1); btn(/See my results/).click(); return text(live.querySelector(".lx-ck-level").textContent); };
  return { E, live, answer, level, threw, demo, cr };
}
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
// gateAll on the real runner: task 12 first opens nothing; eleven answers leave it shut; the twelfth opens it
async function gateSequence() {
  const P = mountFresh();
  P.answer(11);
  ok(!P.E.body.querySelector("#ckr-solution-body").classList.contains("is-open"), "runner: answering task 12 first opens nothing (gateAll)");
  await sleep(5);
  for (let i = 0; i < 10; i++) P.answer(i);
  ok(!P.E.body.querySelector("#ckr-solution-body").classList.contains("is-open"), "runner: eleven of twelve answered, still shut");
  P.answer(10);
  const st = P.E.LX.store.get(M.KEY, {}), so = P.E.LX.store.get(M.KEY + "-sol-open", null);
  ok(P.E.body.querySelector("#ckr-solution-body").classList.contains("is-open") && so === st.tasks[D.tasks[10].id].at, "runner: the twelfth answer opens the worked solution, recorded at its time");
  ok(D.tasks.every(t => st.tasks[t.id] && st.tasks[t.id].first === true), "runner: every task right on its first try, the order and the share included");
  const lv = P.level();
  ok(lv === "Level: Strong", "runner: every answer given before the solution opened counts, in any order: " + lv);
}
async function earlySequence() {
  const P = mountFresh();
  P.answer(0);
  await sleep(5);
  P.E.body.querySelector("#ckr-lock button").click();
  ok(P.E.body.querySelector("#ckr-solution-body").classList.contains("is-open") && P.E.LX.store.get(M.KEY, {}).solEarly, "runner: the lock's button opens it early, recorded on the attempt");
  await sleep(5);
  for (let i = 1; i < 12; i++) P.answer(i);
  const lv = P.level();
  ok(lv === "Level: Practice (no level)", "runner: opened early: practice: " + lv);
}

function finish() {
  const ALL = [PAGE, RAW, JS, fs.existsSync(SIDE) ? fs.readFileSync(SIDE, "utf8") : ""].join("\n");
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term (page, data, script)");
  ok(!/data[- ]?cent/i.test(ALL), "no data-center term (the excluded topics stay out of the checkpoint's examples)");
  ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere");
  ok(!/\bFOAK\b|\bNOAK\b|first[- ]of[- ]a[- ]kind|nth[- ]of[- ]a[- ]kind|learning[- ](curve|rate)|order[- ]book|anchor[- ](customer|buyer)|subsidy[- ]free|break[- ]even|parity capital|smr-dc|projects\/|research\.(html|qmd)/i.test(ALL), "no deny-listed term");
  const OKH = h => /^https:\/\/doi\.org\/10\.[0-9]+\/[^\s"<>]+$/.test(h) || /^[0-9a-z-]+\.html(#[a-z0-9-]+)?$/.test(h);
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...(RAW + JS).matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(m => m[0]));
  ok(hrefs.length > 5 && hrefs.every(OKH), "links: learn pages and doi.org only: " + [...new Set(hrefs.filter(h => !OKH(h)))].join(" "));
  const live = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8")), all = [].concat(live.starter, live.more, live.toolbox);
  ok([...OWN.matchAll(/href="([0-9a-z-]+)\.html"/g)].every(m => all.some(l => l.id === m[1] && l.ready)), "every learn link reaches a live page");
  ok(!/data-source="excerpt:/.test(PAGE), "no excerpt of the course author's research");
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(x => new RegExp("\\n  id: " + ID + "\\n").test(x)) || "";
  ok(/\n  status: active\n/.test(entry) && /\n  minutes: 240\n/.test(entry) && /\n  form: checkpoint\n/.test(entry) && /\n  after: \[R8, R9\]/.test(entry) && /\n  tier: researcher\n/.test(entry), "path.yml: an active Researcher checkpoint, 240 minutes, after R8 and R9 (curriculum §3.3)");
  const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
  ok(fm("title") === py("title") && fm("subtitle") === py("subtitle"), "the page's title and subtitle equal path.yml's");
  const GJ = JSON.parse(fs.readFileSync(L("data/glossary.json"), "utf8")), marks = [...(JS + RAW).matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]).concat([...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]));
  ok(marks.length >= 3 && marks.every(m => GJ[m]), "every glossary mark has a definition: " + marks.filter(m => !GJ[m]).join(", "));
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
}
