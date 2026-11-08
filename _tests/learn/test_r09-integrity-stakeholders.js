// test_r09-integrity-stakeholders.js — Node tests for research studio R9 (assets/learn/r09-integrity-stakeholders.js and
// data/r09-integrity-stakeholders.json):
//   - the sort: ten practices, two per norm, each with a reason; the six dilemmas of the curriculum row, each with one
//     defensible option, a norm, a primary source and the stakeholders it involves
//   - the stakeholder map and the statement builder; the scoring of first picks
//   - every section cited exists in the sources (ALLEA 2023 §2.4–2.7, §3.1; DOE Order 443.1D §4.a); fictional cases only
//   - the no-JS blocks equal the model's (--write rewrites them): the task, the fact sheet with both exemplars and the
//     stakeholder table, the rubric; text budget (cases, reasons, exemplar lines and notes, fact sheet, hints, data note)
//   - the flowchart declares funding and ties on every path; path.yml's practice count matches the data
// Usage (from the site folder):  node _tests/learn/test_r09-integrity-stakeholders.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L("r09-integrity-stakeholders.js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const D = JSON.parse(fs.readFileSync(L("data/r09-integrity-stakeholders.json"), "utf8"));
const QPATH = path.join(SITE, "learn/r09-integrity-stakeholders.qmd");
const JS = fs.readFileSync(L("r09-integrity-stakeholders.js"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

const BLOCKS = {
  "r09-task": () => M.staticTask(D),
  "r09-exemplars": () => M.factsHTML(D) + "\n" + EX.staticHTML(M.exemplarsSpec(D)) + "\n" + M.mapHTML(D),
  "r09-rubric": () => RB.staticHTML(D.rubric)
};
function between(text, key) {
  const a = text.match(new RegExp("<!-- " + key + ":start[^>]*-->\\n")), b = text.indexOf("<!-- " + key + ":end -->");
  return a && b > a.index ? { from: a.index + a[0].length, to: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); if (!r) throw new Error(k + " markers missing"); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("r09 fallback blocks written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");
const LXesc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------- the sort
ok(D.norms.map(n => n.id).join() === "consent,credit,coi,licences,honest", "five norms: consent, credit, conflicts of interest, data licences, honest reporting");
ok(D.practices.length === 10 && D.norms.every(n => D.practices.filter(p => p.bin === n.id).length === 2) && D.practices.every(p => p.why), "ten practices, two per norm, each with a reason");

// ---------------- the six dilemmas (curriculum row: a funder wants a headline, a convenient scenario, a co-author's
// data, a community meeting, a survey without consent, an error found after publication)
ok(D.dilemmas.map(d => d.id).join() === "funder,scenario,data,meeting,survey,error", "the six dilemmas of the row, in order");
const people = M.people(D), ids = people.map(p => p.id);
D.dilemmas.forEach(d => {
  ok(d.options.length === 3 && d.options.filter(o => o.verdict === "good").length === 1 && d.options.some(o => o.verdict === "bad"), d.id + ": three options, one defensible, at least one hard to defend");
  ok(M.normLabel(D, d.norm) && M.normLabel(D, d.norm) !== d.norm, d.id + ": its norm has a name (" + M.normLabel(D, d.norm) + ")");
  ok(/ALLEA \(2023\)|DOE Order 443\.1D|Jenkins et al\. \(2016\)/.test(d.source), d.id + ": a primary source");
  ok(d.who.length >= 2 && d.who.every(w => ids.indexOf(w) >= 0), d.id + ": involves named stakeholders on the map");
  const secs = (d.source.match(/§\d+(\.\d+|\.[a-z])?/g) || []).concat(...d.options.map(o => o.why.match(/§\d+(\.\d+|\.[a-z])?/g) || []));
  ok(secs.every(s => ["§2.4", "§2.5", "§2.6", "§2.7", "§3.1", "§4.a"].indexOf(s) >= 0 || s === "§4"), d.id + ": sections cited exist (" + secs.join(", ") + ")");
});
{ const w = D.dilemmas.find(d => d.id === "survey").options.find(o => o.verdict === "good").why;
  ok(/DOE Order 443\.1D/.test(w) && /§4\.a/.test(w), "survey: the DOE order and its section"); }
ok(!/\b(Inc|LLC|Corp|University of|Co-op of)\b/.test(JSON.stringify(D.dilemmas)) && D.dilemmas.every(d => /Prairie Town|co-op|funder|scenario|survey|publication|co-author/i.test(d.case)), "cases are fictional and name no real organisation");
ok(/illustrative/.test(D.dilemmas[0].case) && /illustrative/.test(D.dilemmas[3].case) && /illustrative/.test(D.dilemmas[5].case), "the cases with numbers or places say they are illustrative");

// ---------------- scoring, map, statement
const allGood = {}; D.dilemmas.forEach(d => { allGood[d.id] = M.best(d).id; });
const s = M.score(D, allGood);
ok(s.right === 6 && s.done === 6 && s.total === 6, "score: six defensible first picks");
const half = { funder: "a", scenario: "a", data: "b" };
const s2 = M.score(D, half);
ok(s2.done === 3 && s2.right === 2, "score: three picks, two defensible");
ok(D.stakeholders.length === 3 && people.length === 10 && people.every(p => p.owed), "map: three rings, ten groups, what each is owed");
ok(people.filter(p => p.dilemmas.length).length === people.length, "every group on the map appears in at least one dilemma");
const st = M.statement(D, { funding: "Funded by X.", credit: " " });
ok(st.split("\n").length === 8 && /Funding and conflicts of interest: Funded by X\./.test(st) && /Contributions: \(to write\)/.test(st), "statement: a stage line and six labelled lines; empty parts marked to write");
ok(/^Stage: planned study/m.test(st) && /^Stage: completed study/m.test(M.statement(D, { mode: "done" })), "statement: a planned study by default (pending lines are next actions), or a completed one");
ok(D.statement.every(f => f.hint && f.planned && M.hint(f, "planned") === f.planned && M.hint(f, "done") === f.hint), "statement: every part has a hint for a planned and for a completed study");
ok(/pending/.test(D.statement.find(f => f.id === "ethics").planned) && /not applicable/.test(D.statement.find(f => f.id === "ethics").hint), "statement: 'pending' and 'not applicable' are offered where they are honest answers");

// ---------------- the flowchart: disclosure is unconditional
const FL = M.FLOW, FL0 = FL;
ok(FL.edges.filter(e => e[0] === "s").map(e => e[1]).join() === "f" && FL.edges.filter(e => e[1] === "q1").map(e => e[0]).join() === "f", "flowchart: every path goes through 'declare funding and ties' before the first question");
ok(FL.traces.every(t => t.path[0] === "s" && t.path[1] === "f" && t.path[t.path.length - 1] === "e"), "flowchart: every trace declares funding and ends in the statement");
ok(FL.traces.every(t => t.path.slice(1).every((n, i) => FL.edges.some(e => e[0] === t.path[i] && e[1] === n))), "flowchart: every trace follows the edges");
ok(!/Review and consent first/.test(JSON.stringify(FL)) && /determination/.test(FL.nodes.a1.t), "flowchart: an ethics determination (review, waiver or reuse basis), not review and consent for every use of data");

// ---------------- path.yml says what the data hold
{ const P = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), row = P.slice(P.indexOf("id: r09-integrity-stakeholders"), P.indexOf("id: r10-question-studio"));
  const W = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  ok(new RegExp("Sort " + W[D.practices.length] + " practices").test(row), "path.yml: 'Sort " + W[D.practices.length] + " practices', as many as the data hold");
  ok(new RegExp("Sort " + W[D.practices.length] + " everyday practices").test(JS), "step 1 names as many practices as the data hold"); }

// ---------------- exemplars and the page
const spec = M.exemplarsSpec(D);
ok(EX.validate(spec).length === 0, "exemplars well formed: " + EX.validate(spec).join("; "));
ok(/fictional/.test(D.exemplars.note), "exemplars say the study is fictional");
const good = EX.plain(spec.answers[1]);
ok(D.statement.every(f => ({ funding: /Funding:/, credit: /Contributions:/, data: /Data:/, ethics: /Ethics:/, people: /Stakeholders:/, corrections: /Corrections:/ })[f.id].test(good)), "the strong statement covers the statement's parts");
ok(/conceptualization, formal analysis, writing \(original draft\)/.test(good) && /data curation, writing \(review and editing\)/.test(good), "contributor roles named as CRediT lists them");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(r && PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + ": the page's no-JS block equals the model's (run with --write after a data edit)"); });
{ const brief = PAGE.indexOf('<div class="lx-card lx-studio-brief">'), inter = PAGE.indexOf('<div class="lx-interactive');
  ok(brief >= 0 && brief < inter && /<b>Produce:<\/b>[\s\S]*<b>From:<\/b>[\s\S]*<b>Done when:<\/b>[\s\S]*About 30 minutes guided here, then about 30 minutes on your own/.test(PAGE.slice(brief, inter)),
    "the task card (produce, from, done when, time) sits above the interactive, outside its fallback, so readers with JavaScript see it"); }
const task = M.staticTask(D);
ok(!/\[\[/.test(task + M.factsHTML(D) + M.mapHTML(D)), "no-JS blocks: glossary marks become term spans");
ok(M.people(D).every(p => M.mapHTML(D).indexOf(LXesc(p.owed)) >= 0 && M.mapHTML(D).indexOf(LXesc(p.label)) >= 0), "no-JS stakeholder table: every group and what it is owed");
ok(D.exemplars.facts.length >= 6 && ["Funding", "Ties", "Data", "Survey", "People", "Response"].every(k => D.exemplars.facts.some(f => f.k === k)), "fact sheet: the facts both answers draw on");
ok(D.dilemmas.every(d => task.indexOf(d.title) >= 0) && D.dilemmas.every(d => d.options.every(o => task.indexOf(o.text.replace(/&/g, "&amp;")) >= 0)), "no-JS task: every dilemma and option");
ok(/approved 5 August 2026/.test(PAGE) && /CC BY 4\.0/.test(PAGE) && /174–182/.test(PAGE) && /151–155/.test(PAGE), "sources: dates and pages as checked");
ok(/https:\/\/doi\.org\/10\.3789\/ansi\.niso\.z39\.104-2022/.test(PAGE) && /ANSI\/NISO Z39\.104-2022/.test(PAGE), "sources: CRediT's 2022 standard cited by its own DOI");
ok(/without justification/.test(PAGE) && /without justification/.test(JSON.stringify(D.practices)), "honest reporting: ALLEA's 'without justification' kept");
ok(!/Report every scenario/.test(JSON.stringify(D) + JS) && /designee/.test(JSON.stringify(D)) && /supported by the U\.S\. Department of Energy \(DOE\)/.test(D.dilemmas.find(d => d.id === "survey").case), "no 'report every scenario'; DOE's order applies to a DOE-supported study (DOE spelled out at first use) and names the designee");
ok(!/all scenarios|all the results/i.test(JSON.stringify(D.stakeholders) + JSON.stringify(D.norms)) && /material results/.test(JSON.stringify(D.stakeholders)) && /owed the material results/.test(PAGE), "stakeholders are owed the material results and how scenarios were chosen, not an unconditional 'all the results'");
// proceeding before the ethics determination is never partly right; a data agreement is not an ethics basis
{ const sv = D.dilemmas.find(d => d.id === "survey");
  ok(sv.options.filter(o => /^Go ahead/.test(o.text)).every(o => o.verdict === "bad"), "survey: every 'go ahead' option is hard to defend (collecting less does not replace the determination)");
  const tr = FL0.traces.find(t => /co-author/i.test(t.label)).text;
  ok(!/agreement's permission/.test(tr) && /ethics determination/.test(tr) && /agreement's terms/.test(tr), "flowchart: the ethics determination and the data agreement are two separate checks"); }
ok(!/Share-alike/i.test(JSON.stringify(D.practices)) && /license/.test(D.practices.find(p => p.id === "c8").why), "map layer: the reason checks the layer's own license, assuming no share-alike terms");
ok(/electric cooperative \(co-op\)/.test(D.dilemmas.find(d => d.id === "data").case), "co-op introduced at first use in the dilemmas");
// the guided step: three parts finish it, as its text says; copying does not finish it
ok(M.GUIDED === 3 && M.drafted(D, { funding: "x", credit: " ", data: "y" }) === 2 && M.drafted(D, { funding: "x", data: "y", ethics: "z" }) === 3, "statement: the guided step counts the parts that hold text (three finish it)");
ok(/Draft three of the six parts here; finish all six on your own/.test(JS) && !/Three parts finish here/.test(JS), "statement step: says three here, all six on your own");
ok(!/copyText\([^)]*\)\.then\([^;]*;\s*\}\);\s*api\.done\(\)/.test(JS) && !/\}\); api\.done\(\); \}\);/.test(JS), "statement step: copying an empty statement does not finish the step");
// the strong exemplar uses only the fact sheet: every fact it states is on it
{ const fs2 = D.exemplars.facts.map(f => f.v).join(" ");
  ok(/Prairie Utilities Association \(fictional\)/.test(fs2) && /saw the results one week before publication/.test(fs2) && /accessed 3 March 2026/.test(fs2) && /synthetic sample/.test(fs2) && /requests for the real data go to the co-op/.test(fs2), "fact sheet: the funder's name, the preview that took place, the access date, the posted code and sample and the request route");
  ok(/Prairie Utilities Association funded/.test(EX.plain(M.exemplarsSpec(D).answers[1])) && /3 March 2026/.test(EX.plain(M.exemplarsSpec(D).answers[1])), "strong answer: names the funder and the access date from the fact sheet"); }
ok(/after seeing the results/i.test(D.dilemmas.find(d => d.id === "scenario").case) && !/outlier/.test(JSON.stringify(D.dilemmas)), "the convenient scenario: chosen after the results, not called an outlier by count");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const urls = (OWN + JSON.stringify(D)).match(/https?:\/\/[^\s"'<>)]+/g) || [];
const allowed = /^https:\/\/([\w-]+\.)*(energy\.gov|eia\.gov|doi\.org)\//;
ok(urls.every(u => allowed.test(u)), "every link on an allow-listed host: " + urls.filter(u => !allowed.test(u)).join(" "));
ok(!/\bAI\b|artificial intelligence|nuclear|reactor|\bSMR\b|learning[- ](curve|rate)/i.test(JSON.stringify(D) + JS + OWN), "no deny-listed or out-of-scope words");

// ---------------- text budget
const words = t => M.plain(t).trim().split(/\s+/).length;
EX.plain(spec.answers[1]).replace(/ \[\d+\]/g, "").split("\n").forEach((l, i) => ok(words(l) <= 35, "strong answer line " + (i + 1) + ": at most 35 words (" + words(l) + ")"));
spec.answers.forEach(a => EX.marks(a).forEach(m => ok(words(m.note) <= 25, a.key + " note " + m.n + ": at most 25 words")));
D.exemplars.facts.forEach(f => ok(words(f.v) <= 30, "fact " + f.k + ": at most 30 words (" + words(f.v) + ")"));
D.statement.forEach(f => ok(words(f.hint) <= 30 && words(f.planned) <= 30, f.id + ": hints at most 30 words"));
{ const dn = (PAGE.match(/<p class="lx-datanote">[\s\S]*?<\/p>/) || [""])[0].split(/<br>/).map(r => r.replace(/<[^>]+>/g, " "));
  ok(dn.length >= 2, "data note in labelled rows");
  dn.forEach((r, i) => ok(words(r) <= 35, "data note row " + (i + 1) + ": at most 35 words (" + words(r) + ")")); }
FL.traces.forEach(t => ok(words(t.text) <= 35, "flowchart trace " + t.label + ": at most 35 words"));
// the Go-deeper boxes: every list item and paragraph within the budget
{ const deep = OWN.match(/<div class="lx-deeper-body">[\s\S]*?<\/div>/g) || [];
  ok(deep.length >= 3, "three Go-deeper boxes");
  deep.forEach((d, i) => (d.match(/<(li|p)>[\s\S]*?<\/\1>/g) || []).forEach((el, j) => { const w = el.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length; ok(w <= 35, "Go deeper " + (i + 1) + ", element " + (j + 1) + ": at most 35 words (" + w + ")"); })); }
D.dilemmas.forEach(d => { ok(words(d.case) <= 40, d.id + ": case at most 40 words (" + words(d.case) + ")"); d.options.forEach(o => ok(words(o.why) <= 35, d.id + "/" + o.id + ": reason at most 35 words (" + words(o.why) + ")")); });
D.practices.forEach(p => ok(words(p.text) <= 18, p.id + ": a short card"));
const stepTexts = (JS.match(/text: "([^"]+)", build/g) || []).map(t => t.slice(7, -8));
ok(stepTexts.length === 2, "the first and last step texts");
D.dilemmas.forEach((d, i) => stepTexts.push("Dilemma " + (i + 1) + " of 6 · " + d.title + ". Read the case, choose what you would do, then read the norm behind it."));
ok(/"Dilemma " \+ \(i \+ 1\) \+ " of 6 · " \+ d\.title \+ "\. Read the case, choose what you would do, then read the norm behind it\."/.test(JS), "dilemma step text template");
stepTexts.forEach((t, i) => ok(words(t) <= 35, "step text " + (i + 1) + ": at most 35 words (" + words(t) + ")"));

// ---------------- the page on a stub document: the statement step finishes with three parts, never on Copy alone
{
  const vm = require("vm"), { env, load } = require("./stubdom.js"), E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false);
  ["cards", "cardsort", "exemplars", "flowchart", "stakeholders", "steelman", "rubric", "checklist"].forEach(n => { try { load(n, E); } catch (e) { /* a component the stub cannot run is not needed below */ } });
  const SC = E.LX.StepCards, doneAt = {};
  E.LX.StepCards = (host, o) => SC(host, Object.assign({}, o, { steps: o.steps.map((st, k) => Object.assign({}, st, { build: (act, api) => { const d = api.done; api.done = () => { doneAt[k] = (doneAt[k] || 0) + 1; d(); }; return st.build(act, api); } })) }));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "r09") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  E.LX.H("div", { id: "r09-exemplars" }, E.body); E.LX.H("div", { id: "r09-rubric" }, E.body);
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "r09" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { r09_integrity_stakeholders: D }, root); } catch (e) { threw = e.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  if (!threw && demo) {
    const last = demo.cards.count - 1; demo.cards.go(last);
    const card = demo.cards.el, copy = card.querySelectorAll("button").filter(b => /Copy my statement/.test(b.textContent))[0];
    copy.click();
    ok(!doneAt[last], "statement step: copying an empty statement does not finish it");
    const tas = card.querySelectorAll("textarea");
    ok(tas.length === 6, "statement step: six parts to write");
    [0, 1].forEach(i => { tas[i].value = "pending: agreed with the team next week"; tas[i].fire("input"); });
    ok(!doneAt[last], "statement step: two parts do not finish it");
    tas[2].value = "EIA-930, public domain; meter data under agreement"; tas[2].fire("input");
    ok(doneAt[last] >= 1 && /Draft three of the six parts here/.test(card.textContent), "statement step: three parts finish the guided step, as its text says");
  }
}

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
