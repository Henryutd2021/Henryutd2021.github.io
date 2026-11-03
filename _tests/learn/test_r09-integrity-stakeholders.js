// test_r09-integrity-stakeholders.js — Node tests for research studio R9 (assets/learn/r09-integrity-stakeholders.js and
// data/r09-integrity-stakeholders.json):
//   - the sort: ten practices, two per norm, each with a reason; the six dilemmas of the curriculum row, each with one
//     defensible option, a norm, a primary source and the stakeholders it involves
//   - the stakeholder map and the statement builder; the scoring of first picks
//   - every section cited exists in the sources (ALLEA 2023 §2.4–2.7, §3.1; DOE Order 443.1D §4.a); fictional cases only
//   - the no-JS blocks equal the model's (--write rewrites them); text budget; links on the allow-list
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
  "r09-exemplars": () => EX.staticHTML(M.exemplarsSpec(D)),
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
ok(D.dilemmas.find(d => d.id === "survey").options.find(o => o.verdict === "good").why.indexOf("DOE Order 443.1D, §4.a") >= 0, "survey: the DOE order's section");
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
ok(st.split("\n").length === 7 && /Funding and conflicts of interest: Funded by X\./.test(st) && /Contributions: \(to write\)/.test(st), "statement: six labelled lines; empty parts marked to write");

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
ok(D.dilemmas.every(d => task.indexOf(d.title) >= 0) && D.dilemmas.every(d => d.options.every(o => task.indexOf(o.text.replace(/&/g, "&amp;")) >= 0)), "no-JS task: every dilemma and option");
ok(/approved 5 August 2026/.test(PAGE) && /CC BY 4\.0/.test(PAGE) && /174–182/.test(PAGE) && /151–155/.test(PAGE), "sources: dates and pages as checked");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const urls = (OWN + JSON.stringify(D)).match(/https?:\/\/[^\s"'<>)]+/g) || [];
const allowed = /^https:\/\/([\w-]+\.)*(energy\.gov|eia\.gov|doi\.org)\//;
ok(urls.every(u => allowed.test(u)), "every link on an allow-listed host: " + urls.filter(u => !allowed.test(u)).join(" "));
ok(!/\bAI\b|artificial intelligence|nuclear|reactor|\bSMR\b|learning[- ](curve|rate)/i.test(JSON.stringify(D) + JS + OWN), "no deny-listed or out-of-scope words");

// ---------------- text budget
const words = t => t.trim().split(/\s+/).length;
D.dilemmas.forEach(d => { ok(words(d.case) <= 40, d.id + ": case at most 40 words (" + words(d.case) + ")"); d.options.forEach(o => ok(words(o.why) <= 35, d.id + "/" + o.id + ": reason at most 35 words (" + words(o.why) + ")")); });
D.practices.forEach(p => ok(words(p.text) <= 18, p.id + ": a short card"));
const stepTexts = (JS.match(/text: "([^"]+)", build/g) || []).map(t => t.slice(7, -8));
ok(stepTexts.length === 2, "the first and last step texts");
D.dilemmas.forEach((d, i) => stepTexts.push("Dilemma " + (i + 1) + " of 6 · " + d.title + ". Read the case, choose what you would do, then read the norm behind it."));
ok(/"Dilemma " \+ \(i \+ 1\) \+ " of 6 · " \+ d\.title \+ "\. Read the case, choose what you would do, then read the norm behind it\."/.test(JS), "dilemma step text template");
stepTexts.forEach((t, i) => ok(words(t) <= 35, "step text " + (i + 1) + ": at most 35 words (" + words(t) + ")"));

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
