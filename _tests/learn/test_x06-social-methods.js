// test_x06-social-methods.js — Node tests for side topic X6 (assets/learn/x06-social-methods.js, its data file and the
// page learn/x06-social-methods.qmd):
//   - the curriculum row's six methods, each with what it asks, its data, what it gives a model and what it cannot tell,
//     and whether people take part; six questions, one per method, each with a reason naming its method
//   - every predict's answer is one of its options and every option has feedback; the people toggles' reference is
//     scored by the shared card sort (reference marks agree on every clear cell)
//   - method-neutral: no ranking words, no "best method", no "gold standard"; the selection question points to M14
//   - facts from dated primary sources, word for word with the source line (27%, 34 million, 18,496; seven categories)
//   - the no-JS block, ideas, stop box, check, facts and sources equal what the model writes (--write)
//   - scope: no nuclear or data-center term, no "AI", links on the allow-list; Prairie City labelled fictional
//   - text budget of the step cards, reveals and the page's prose
// Usage (from the site folder):  node _tests/learn/test_x06-social-methods.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "x06-social-methods";
const SITE = path.resolve(__dirname, "..", "..");
const L_ = p => path.join(SITE, "assets/learn", p);
const M = require(L_(ID + ".js"));
const S = require("./shelf_stop.js");
const CS = require(L_("components/cardsort.js"));
const RAW = fs.readFileSync(L_("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const JS = fs.readFileSync(L_(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// ---------------- the generated blocks
const BLOCKS = { "x06-fallback": () => M.staticFallback(D), "x06-ideas": () => M.ideasHTML(D), "x06-stop": () => S.stopHTML(D.stop, "x06"), "x06-check": () => M.checkHTML(D),
  "x06-facts": () => M.factsHTML(D), "x06-sources": () => M.sourcesHTML(D) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");

// ---------------- methods and questions
const ROW = ["Survey", "Interview", "Choice experiment", "Ethnography", "Policy analysis", "Participatory mapping"];
ok(D.methods.map(m => m.label).join() === ROW.join(), "the curriculum row's six methods, in its order");
D.methods.forEach(m => ok(m.asks && m.data && m.gives && m.cannot && ["yes", "no", "partly"].indexOf(m.people) >= 0, m.id + ": asks, data, gives, cannot, and whether people take part"));
ok(D.questions.length === 6 && D.questions.map(q => q.bin).sort().join() === D.methods.map(m => m.id).sort().join(), "six questions, one per method");
D.questions.forEach(q => { const m = M.method(D, q.bin); ok(/\?$/.test(q.text) && q.why.toLowerCase().indexOf(m.label.toLowerCase().split(" ")[0].replace(/y$/, "")) === 0, q.id + ": a question, and a reason that names " + m.label); });
{ const g = CS.grade(D.questions, Object.fromEntries(D.questions.map(q => [q.id, q.bin]))); ok(g.right === 6 && /^6 of 6 match/.test(M.matchLine(g)), "a perfect match scores 6 of 6"); }
// people toggles: the reference agrees with every clear cell; "partly" accepts either
{ const items = M.peopleItems(D), ref = CS.reference(items, ["people"]), sc = CS.score(ref, items, ["people"]);
  ok(sc.differ === 0 && sc.agree + sc.partly === items.length, "the people toggles' reference agrees with every row");
  ok(D.methods.filter(m => m.people === "yes").length === 5 && M.method(D, "policy").people === "partly", "five methods involve people; policy analysis partly (once officials are interviewed)");
  ok(items.every(t => t.why.people && D.peopleWhy[t.ref.people]), "every row has a reason for its mark"); }
[D.predict, D.selection].forEach(Q => ok(Q.options.some(o => o.value === Q.answer) && Q.options.every(o => Q.feedback[o.value]), Q.q.slice(0, 40) + ": the answer is an option and every option has feedback"));
ok(D.predict.answer === "peak" && D.selection.answer === "notalone" && /M14/.test(D.selection.feedback.notalone), "the model computes the peak; a survey difference is not an effect by itself, see M14");
ok(/data-answer="a"/.test(M.checkHTML(D)) && /A survey of a representative sample/.test(M.checkHTML(D)), "the quick question's answer is the survey");

// ---------------- facts and sources
const SRC = D.sources;
ok(/27% of U\.S\. households/.test(SRC["eia-recs"].text) && /34 million/.test(SRC["eia-recs"].text) && /18,496/.test(SRC["eia-recs"].text) && /web or mail/.test(SRC["eia-recs"].text), "the RECS facts as EIA states them");
ok(D.facts[0].n === "27%" && /34 million/.test(D.facts[0].what) && D.facts[1].n === "18,496" && /web or mail/.test(D.facts[1].what), "the facts equal the source line");
ok(D.facts[2].n === "7" && /experiments, literature reviews, data collection, data analysis, quantitative energy modeling, qualitative analysis and case studies/.test(D.facts[2].what) && /seven method categories/.test(SRC.sovacool2018.text), "seven method categories, as the review's abstract lists them");
Object.keys(SRC).forEach(k => ok(/\d{4}/.test(SRC[k].asOf) && S.linkOK(SRC[k].url), k + ": dated, link on the allow-list"));
D.facts.forEach(f => ok(SRC[f.src], f.n + ": a source"));

// ---------------- the stop box, neutrality, scope and links
ok(S.problems(D.stop).length === 0, "the stop box has its parts: " + S.problems(D.stop).join("; "));
const ALL = PAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/\b(best method|gold standard|superior|most rigorous|hierarchy of evidence|better than (a |an )?(survey|interview|ethnograph))/i.test(ALL.replace(/rather than relying on evidence hierarchies/, "")), "method-neutral: no ranking of methods");
ok(/no method is ranked above another/i.test(PAGE) && /no method is ranked above another/i.test(JS), "the page and the table say no method is ranked");
ok(!/nuclear|reactor|\bSMR\b|small modular|data[- ]cent/i.test(ALL), "no nuclear or data-center term");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html|smr-dc|field-notes/.test(ALL), "no project page, Research page or Field Notes link");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
ok(hrefs.every(h => S.linkOK(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links on the allow-list (" + hrefs.filter(h => !(S.linkOK(h) || /^[0-9a-z-]+\.html/.test(h) || /^#/.test(h))).join(", ") + ")");
ok(/\(fictional\)/.test(M.STEPS[0]) && /fictional/.test(PAGE), "Prairie City's council is labelled fictional");
["M14", "A13", "A19", "R9", "R3"].forEach(c => ok(new RegExp('\\["' + c + '",').test(JS) || new RegExp('lessonRefHTML\\(P, "' + c + '"\\)').test(JS), c + " is named through LX.lessonRefHTML"));

// ---------------- text budget
const plain = S.plain, nWords = S.nWords, nSent = S.nSent;
ok(M.STEPS.length === 5, "five step cards");
M.STEPS.forEach((t, i) => { const n = nWords(t); ok(n >= 14 && n <= 40, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.MATCH_SAW, M.PICK_SAW, M.PEOPLE_SAW, M.matchLine({ right: 4, total: 6 })].concat(Object.values(D.predict.feedback), Object.values(D.selection.feedback), D.questions.map(q => q.why), D.questions.map(q => q.text),
  [].concat.apply([], D.methods.map(m => [m.asks, m.data, m.gives, m.cannot])), Object.values(D.peopleWhy));
lines.forEach(t => { ok(nWords(t) <= 40, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!-- x06-(sources|facts):start[\s\S]*?:end -->/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption|h3|h4)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 42, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls
ok(/aria-live/.test(JS) && (JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 5, "live regions; a demo hook with an action for each of the five steps");
ok(/mode: "toggles"/.test(JS) && /checkLabel: "Check my marks"/.test(JS), "the people marks use the shared toggles sort");
["choice-experiment", "ethnography", "participatory-mapping"].forEach(t => ok(new RegExp("id: " + t + "\\b").test(SIDE) && D.methods.some(m => m.term === t), "the sidecar defines " + t + " and a method card marks it"));
ok(/\[\[informed-consent\|/.test(M.STEPS[3]) && /\[\[ethics-board\|/.test(M.STEPS[3]), "step 4 marks R9's terms, informed consent and ethics board");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
