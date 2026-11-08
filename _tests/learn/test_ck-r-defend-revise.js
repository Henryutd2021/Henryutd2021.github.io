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
//     lock's early opening makes the attempt practice, every task right in order gives Strong; task 1 first (the seven
//     marked tasks shut until it is submitted, then open; task 1 read-only once submitted)
//   - wording and checks: the validation's rule worked from the intervals; the measurement check named as
//     such; the rerun's dependency stated; no written point demands a count of defects; prompts within the text budget;
//     the copied summary keeps every text whole
//   - scope: no nuclear term, no data-center term, no "AI", no deny-listed term; links to learn pages and doi.org only
// Usage (from the site folder):  node _tests/learn/test_ck-r-defend-revise.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PRIV = require("./private_sources.js");
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
ok(N.lo < N.revised && N.revised < N.hi && N.holdLo < N.holdout && N.holdout < N.holdHi, "the revised result (4.6) lies inside 2.9 to 6.3; the 2025 check's (4.1) inside its own 1.8 to 6.4");
// the validation's rule, set before looking: the 2025 estimate's whole 95% interval above the board's 1.5 kW, so the
// decision would not change. Compatible with the main estimate is not equal to it, and the two share farms (the 29 were
// comparison farms in the first analysis), so no interval for their gap is shown.
{ ok(N.holdLo > N.keep && N.gapLo === undefined && N.gapHi === undefined, "the rule: the 2025 interval's low end (1.8) is above 1.5 kW; no gap interval in the data");
  const good = EXS.plain(D.worked.revision.answers[1]), notes = EXS.marks(D.worked.revision.answers[1]).map(m => m.note).join(" ");
  ok(good.includes("if its whole 95% interval is above 1.5 kW, so the board's decision would not change. 2025: 4.1 kW (1.8 to 6.4): it is.") && !/includes zero|treated as independent|−2\.4|3\.4\)/.test(good + " " + ALLTXT),
    "the worked revision shows the rule and its numbers; no independence assumption, no 'includes zero'");
  ok(/not proof the effects are equal/.test(notes) && /share farms/.test(notes) && /no interval for their gap/.test(notes), "the note: compatible is not equal; the estimates share farms");
  ok(/the 29 farms that joined in 2025, against the 42 that never joined/.test(good) && !/they agree/.test(good), "the 2025 check names its comparison group, and claims no agreement");
  ok(!/\bvalidated\b/.test(ALLTXT), "nothing claims the analysis was 'validated' by one consistent number"); }
// the meter check is a measurement check on a matching boundary
{ const prof = D.worked.revision.answers[0], t = EXS.plain(prof), notes = EXS.marks(prof).map(m => m.note).join(" ");
  ok(/feeders that serve only pumps, same hours, after line losses/.test(t) && /of the measurements, not of the tariff's effect/.test(notes) && !/substation meter/.test(ALLTXT), "the meter check: pump-only feeders, line losses, and labelled a measurement check"); }
// the results are assumed outputs, said where they are shown
ok(/assumed example outputs, not computed from data/.test(D.study.label) && /assumed example outputs/.test(D.worked.revision.note) && /assumed example outputs/.test(D.meta.note), "the study's results are labelled assumed example outputs");
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
  ok(/would keep the tariff/.test(good) && /Limit: the later joiners' demand might still have moved differently\. Mitigated/.test(good) && /co-op engineer reran the clean clone/.test(good) && /not used to build the analysis/.test(good), "the Strong revision shows each of the three moves"); }
// difference-in-differences without overstating selection: levels may differ; the trend is what needs evidence
{ const sol = task("rank").solution + " " + task("respond").solution;
  ok(/Different starting levels alone do no harm/.test(sol) && /matters more than equal starting levels/.test(sol) && /one possible comparison/.test(sol) && !/fairer comparison/.test(ALLTXT) && !/may differ before the tariff/.test(ALLTXT), "selection: different levels are fine; parallel trends needs evidence; later joiners are one possible comparison"); }
// the rerun's order: the dependency that fixes it is stated
// the cleaning rule decides, set before any result; matching the old number does not
ok(D.worked.rerun.some(r => r[0] === "Cause" && /set that rule before any result/.test(r[1])) && D.worked.rerun.some(r => r[0] === "Fix" && /not agreement with the old number, decides/.test(r[1])) &&
  /a rule the data note set before any result/.test(task("report").solution), "the rerun's fix: an exclusion rule set before any result, not the old number, decides");
// minor concerns are weighed, not dismissed; one or two summary sentences, as the Strong review has
ok(!/better sources would not move the estimate|the software does not change the answer|other three concerns are minor/.test(ALLTXT) && /threatens the causal claim less directly/.test(task("rank").why.a) && /versions can change results/.test(task("rank").why.c),
  "the minor concerns: weighed against selection, not dismissed");
ok(/one or two sentences/.test(task("review").prompt) && /one or two sentences/.test(task("review").points[0]) && /one or two sentences/.test(D.forms.find(f => f.id === "review").lines[0]) && !/in two sentences/.test(ALLTXT),
  "task 1 asks for one or two summary sentences, as the worked Strong review gives");
// every written text stays as submitted: a later edit, after the worked solution opened, cannot keep the first one's time
ok(written.every(t => t.freeze === true), "all five written tasks are frozen once submitted");
ok(/Each step needs the one before it/.test(task("steps").prompt) && /which runs in that environment/.test(task("steps").items.find(x => x[0] === "data")[1]) && /environment comes first/.test(task("steps").solution), "the order task states why the environment comes before the data");
// no written point asks for manufactured defects; the qualitative route and a result near zero
ok(!written.some(t => t.points.some(p => /^At least (one|two)\b/.test(p))) && !D.criteria.some(c => c.levels.some(l => /^At least (one|two)\b|at least one change to the analysis/.test(l))), "no point or criterion demands a count of concerns, changes or moved levels");
{ const r = task("mine-rerun").points.join(" "); ok(/audit trail/.test(r) && /what would count as the same finding/.test(r) && /in the result's units when that value is zero or near it/.test(r) && /coding decisions documented/.test(r), "the rerun's points: a qualitative route, and an absolute difference near zero"); }
ok(/tick it if you declined none/.test(task("mine-response").points[3]) && /if none could/.test(task("mine-revision").points[3]) && /if the reviewer found none/.test(task("mine-review").points[1]), "points that may not apply say how to tick them");
// the text budget: prompts at most 35 words; the number task's prompt and tolerance note at most 40
{ const nw = t => t.replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).filter(Boolean).length;
  ok(T.every(t => nw(t.prompt) <= 35), "every prompt is at most 35 words: " + T.filter(t => nw(t.prompt) > 35).map(t => t.id + " " + nw(t.prompt)).join(", "));
  ok(nw(task("gap").prompt + " " + task("gap").tolNote) <= 40, "the number task's prompt and tolerance note: " + nw(task("gap").prompt + " " + task("gap").tolNote) + " words");
  ok(written.every(t => t.points.every(p => nw(p) <= 35)), "every written point is at most 35 words"); }
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
  ok(/^Learn · CK-R results \(ck-r v1 \(7 Nov 2026\)\)\n/.test(M.summary(D, st(7, 4), { width: 375 })) && /\nYour text, your mock review:\n  text\n/.test(M.summary(D, st(7, 4), {})), "the copied summary's first line, and the reader's texts in it");
  // every written text whole, its lines kept
  const long = st(7, 4), body = ["Major 1 · Method fit: " + "word ".repeat(400).trim(), "", "Major 2 · Framing: whose peak?"].join("\n"); long.tasks["mine-review"].answer = body;
  const sm = M.summary(D, long, {});
  ok(sm.includes("  Major 1 · Method fit: " + "word ".repeat(400).trim() + "\n  \n  Major 2 · Framing: whose peak?") && body.length > 1500, "the copied summary keeps a " + body.length + "-character review whole, line by line");
  // task 1 first, backed by the level rule: a review submitted after a marked task was answered earns no points
  const rv = st(7, 4); T.forEach(t => { rv.tasks[t.id].at = t.id === "review" ? "2026-11-07T10:10:00.000Z" : "2026-11-07T10:00:00.000Z"; });
  const LR = M.level(D, rv);
  ok(M.reviewAfter(D, rv) && LR.points[0] === 0 && LR.level === "Developing" && /Task 1 was submitted after a marked task was answered, so its points do not count/.test(M.describe(D, LR)), "a review written after the marked tasks: no points, said why (" + LR.level + ")");
  ok(!M.reviewAfter(D, st(7, 4)) && M.firstDone(st(7, 4)) && !M.firstDone({ tasks: {} }), "the review first (or at the same time): it counts");
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
has("The co-op, its farms and every number here are fictional: the results are assumed example outputs, not computed from data.", "the fictional label on the study");
has("Task 1 first: the seven marked tasks open once your review is submitted. Each written task stays as you submit it.", "task 1 first, and written tasks kept as submitted, said before the tasks");
has("submit it as task 1; the seven marked tasks (2–5, 9–11) open after it.", "part A names every task that waits for task 1");
ok(T.map((t, i) => t.opensAfter ? i + 1 : 0).filter(Boolean).join() === "2,3,4,5,9,10,11", "the tasks that wait are 2 to 5 and 9 to 11");
has("The level is not the table's: it comes from this rule.", "the level against the criterion table, said before the tasks");
has("Not the table's Strong: this level needs no second person.", "the level against the criterion table, in the rubric section");
ok(D.intro.some(x => /^Task 1 first: the seven marked tasks open once your review/.test(x)), "the runner's intro says task 1 comes first");
// task 1 first through the shared runner's per-task options: the seven marked tasks wait for task 1, which is frozen once
// submitted; no rule of the page's own does it
{ const CPK = require(L("components/checkpoint.js")), waiting = T.filter(t => t.opensAfter);
  ok(waiting.length === 7 && waiting.every(t => M.isAuto(t) && t.opensAfter.join() === "review") && auto.every(t => t.opensAfter), "the seven marked tasks, and only they, open after task 1 (opensAfter)");
  ok(T.filter(t => t.freeze).map(t => t.id).join() === written.map(t => t.id).join() && /stays as you wrote it, before the marked tasks/.test(task("review").freezeNote), "the five written tasks are frozen once submitted; task 1 with its own line");
  ok(CPK.openProblems(D).length === 0, "the opensAfter names all work: " + CPK.openProblems(D).join("; "));
  ok(/opens once task 1, your review of the co-op proposal/.test(D.wait.question) && /^<b>Task 1 first\.<\/b>/.test(D.wait.why) && /waitNote: D\.wait/.test(JS), "the waiting tasks' notice is the data's, passed to the runner");
  ok(!/LX\.on\("layout"/.test(JS) && !/function (guard|shut|keep)\b/.test(JS), "no guard of the page's own on the runner's markup"); }
{ const st = M.staticTasks(D); ok((st.match(/<details class="ckr-later">/g) || []).length === 7 && /Write task 1, your review, before you open the marked tasks/.test(st), "without JavaScript, the seven marked tasks are folded until after task 1");
  ok(/<p class="lx-hint">Within 2% of the value/.test(st), "the tolerance note is its own line");
  // a marked task's title and skill could name a concern: without JavaScript they are folded with its question
  const items = st.split("<li><p>").slice(1);
  ok(items.length === 12 && T.every((t, i) => !t.opensAfter || (items[i].indexOf(t.title) > items[i].indexOf('<details class="ckr-later">') && items[i].indexOf(t.skill) > items[i].indexOf('<details class="ckr-later">') && /^<b>Opens after task 1<\/b>/.test(items[i]))),
    "without JavaScript, each marked task shows 'Opens after task 1'; its title and skill are inside the fold"); }
ok(/data-term="difference-in-differences"/.test(M.staticStudy(D)) && /data-term="time-of-use-tariff"/.test(M.staticStudy(D)) && ["clean-clone", "lock-file", "checksum", "confidence-interval"].every(k => PAGE.includes('data-term="' + k + '"')), "terms at first use: the study card's, and the tasks' words");
ok(/<b>Reproducibility:<\/b>/.test(PAGE) && /<b>Replicability:<\/b>/.test(PAGE), "the National Academies' two definitions in rows of their own");
ok(OWN.includes('href="cr-your-own-study.html"'), "the page links the research capstone it defends");
// the text budget beyond the prompts: every hint, data note and list item of the page's own text (the sources' citations
// apart) holds at most 35 words
{ const own = OWN.replace(/<!-- (ckr-[\w-]+):start[\s\S]*?<!-- \1:end -->/g, ""), long = [];
  for (const m of own.matchAll(/<(p|li)(?: class="[^"]*")?>([\s\S]*?)<\/\1>/g)) {
    const t = text(m[2].replace(/<svg[\s\S]*?<\/svg>/g, "")), n = t.split(" ").filter(Boolean).length;
    if (n > 35 && !/\(\d{4}\)\./.test(t)) long.push(n + " words: " + t.slice(0, 60)); }
  ok(long.length === 0, "the page's own hints, notes and list items are at most 35 words: " + long.join(" | ")); }
// the rubric: the course's words, never reworded
{
  const ids = D.rubric.map(x => x.id);
  ok(ids.join() === "framing,method,trust" && D.rubric.every(x => !x.levels && x.look), "rubric: framing, method fit and trustworthy analysis, with look lines and no reworded levels");
  const CUR = PRIV.path("curriculum");
  if (CUR && fs.existsSync(CUR)) {
    const c = fs.readFileSync(CUR, "utf8");
    ok(ids.every(id => { const x = RB.COMPETENCES.find(y => y.id === id); return ["developing", "proficient", "strong"].every(l => c.includes(x[l])); }), "rubric words are the course rubric's, word for word");
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
  await firstSequence();
  finish();
})().catch(err => { ok(false, "the stub page test threw: " + (err && err.stack || err)); finish(); });

function mountFresh() {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env(); E.LX.ready = () => {}; E.LX.reduced = () => true; E.window.innerWidth = 1280;
  const subs = {}; E.LX.on = (ev, f) => { (subs[ev] = subs[ev] || []).push(f); }; E.LX.emit = (ev, x) => (subs[ev] || []).forEach(f => f(x));   // as core.js
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
  return { E, live, answer, level, threw, demo, cr, goTo, btn };
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
  P.goTo(6);
  ok(P.live.querySelector("textarea").hasAttribute("readonly") && !P.btn(/^Submit my explanation$/) && st.tasks["mine-response"].tries === 1, "runner: after the worked solution opened, a written text cannot be replaced");
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

// task 1 first: before task 1 is submitted, every marked task shows a notice and no answers; tasks 6, 7, 8
// and 12 are open; once task 1 is submitted its text is read-only, and the marked tasks open
async function firstSequence() {
  const P = mountFresh(), q = () => P.live.querySelector(".lx-ck-q").textContent;
  let clock = 0; P.E.window.performance.now = () => (clock += 1000);   // every reading one second later: time on a task shows
  P.goTo(1);
  ok(/opens once task 1/.test(q()) && !P.live.querySelector(".lx-choice") && !P.live.querySelector(".lx-ck-sol") && !P.live.querySelector("button.lx-link") && /Task 1 first\./.test(text(P.live.textContent)) && !/Which concern/.test(text(P.live.textContent)),
    "runner: task 2 before task 1: a notice instead of its question, no answers, no solution");
  const shut = D.tasks.map((t, i) => { P.goTo(i); return /opens once task 1/.test(q()); });
  ok(shut.every((x, i) => x === M.isAuto(D.tasks[i])), "runner: the seven marked tasks are shut, the five written ones open: " + shut.map(x => x ? "shut" : "open").join(" "));
  P.goTo(1); ok(/^Task 2 of 12 · opens after task 1$/.test(P.live.querySelector(".lx-ck-tag").textContent), "runner: a shut task's tag names no skill or lessons");
  // the results and the copied summary before task 1: the marked tasks' titles stay unsaid
  P.goTo(11); P.btn(/See my results/).click();
  { const rows = P.live.querySelectorAll(".lx-ck-res tbody tr").map(r => r.children[0].textContent), sum = P.live.querySelector("textarea.lx-ck-out").value;
    ok(D.tasks.every((t, i) => rows[i] === (i + 1) + ". " + (t.opensAfter ? "Opens after task 1" : t.title)) && D.tasks.filter(t => t.opensAfter).every(t => !sum.includes(t.title)),
      "runner: before task 1, the results and the copied summary list the marked tasks as 'Opens after task 1'"); }
  P.btn(/^Back to the tasks$/).click();
  P.goTo(4); P.btn(/^Go to task 1$/).click();
  ok(/^Task 1 of 12/.test(P.live.querySelector(".lx-ck-tag").textContent), "runner: 'Go to task 1' goes there");
  ok(!P.E.LX.store.get(M.KEY, {}).tasks.rank || P.E.LX.store.get(M.KEY, {}).tasks.rank.first == null, "runner: a shut task records no answer");
  { const s = P.E.LX.store.get(M.KEY, {}); ok(D.tasks.filter(M.isAuto).every(t => !s.tasks[t.id] || !s.tasks[t.id].ms), "runner: no time is counted on a shut task"); }
  P.answer(0);
  const ta = () => P.live.querySelector("textarea");
  ok(ta().hasAttribute("readonly") && !P.btn(/^Submit my explanation$/) && /stays as you wrote it/.test(text(P.live.textContent)), "runner: once submitted, task 1's text is read-only, with no Submit button");
  P.goTo(1);
  ok(!/opens once task 1/.test(q()) && P.live.querySelectorAll(".lx-choice").length === 4, "runner: after task 1, task 2 shows its question and answers");
  P.goTo(0);
  ok(ta().hasAttribute("readonly") && !P.btn(/^Submit my explanation$/) && P.live.querySelectorAll(".lx-ck-points input").length === 4, "runner: back on task 1, the text stays read-only and the points can still be ticked");
  for (let i = 1; i < 12; i++) P.answer(i);
  ok(P.level() === "Level: Strong", "runner: task 1 first, then the rest: Strong");
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
  ok(/\n  status: active\n/.test(entry) && /\n  minutes: 240\n/.test(entry) && /\n  form: checkpoint\n/.test(entry) && /\n  after: \[R8, R9\]/.test(entry) && /\n  tier: researcher\n/.test(entry), "path.yml: an active Researcher checkpoint, 240 minutes, after R8 and R9 (the tier checkpoint)");
  const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
  ok(fm("title") === py("title") && fm("subtitle") === py("subtitle"), "the page's title and subtitle equal path.yml's");
  const GJ = JSON.parse(fs.readFileSync(L("data/glossary.json"), "utf8")), marks = [...(JS + RAW).matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]).concat([...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]));
  ok(marks.length >= 3 && marks.every(m => GJ[m]), "every glossary mark has a definition: " + marks.filter(m => !GJ[m]).join(", "));
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
}
