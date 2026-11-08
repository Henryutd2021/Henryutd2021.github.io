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
const plain = S.plain, nWords = S.nWords, nSent = S.nSent;

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
// the curriculum row's six methods; its "policy analysis" is named here as what the card does, document-based
const ROW = ["Survey", "Interview", "Choice experiment", "Ethnography", "Document-based policy analysis", "Participatory mapping"];
ok(D.methods.map(m => m.label).join() === ROW.join(), "the curriculum row's six methods, in its order");
D.methods.forEach(m => ok(m.asks && m.data && m.gives && m.cannot && ["yes", "no", "partly"].indexOf(m.people) >= 0, m.id + ": asks, data, gives, cannot, and whether people take part"));
ok(D.questions.length === 6 && D.questions.map(q => q.bin).sort().join() === D.methods.map(m => m.id).sort().join(), "six questions, one per method");
D.questions.forEach(q => { const m = M.method(D, q.bin); ok(/\?$/.test(q.text) && q.why.toLowerCase().indexOf(m.label.toLowerCase().split(" ")[0].replace(/y$/, "")) === 0, q.id + ": a question, and a reason that names " + m.label); });
{ const g = CS.grade(D.questions, Object.fromEntries(D.questions.map(q => [q.id, q.bin]))); ok(g.right === 6 && /^6 of 6 match/.test(M.matchLine(g)), "a perfect match scores 6 of 6");
  const e = CS.grade(D.questions, {}); ok(e.placed === 0 && /^Place every question first: 6 still/.test(M.matchLine(e)), "an empty check asks for every question first"); }
// people toggles: the reference agrees with every clear cell; "partly" accepts either
{ const items = M.peopleItems(D), ref = CS.reference(items, ["people"]), sc = CS.score(ref, items, ["people"]);
  ok(sc.differ === 0 && sc.agree + sc.partly === items.length, "the people toggles' reference agrees with every row");
  ok(D.methods.filter(m => m.people === "yes").length === 5 && M.method(D, "policy").people === "partly", "five methods involve people; policy analysis partly (once officials are interviewed)");
  ok(items.every(t => t.why.people && D.peopleWhy[t.ref.people]), "every row has a reason for its mark"); }
[D.predict, D.selection].forEach(Q => ok(Q.options.some(o => o.value === Q.answer) && Q.options.every(o => Q.feedback[o.value]), Q.q.slice(0, 40) + ": the answer is an option and every option has feedback"));
ok(D.predict.answer === "peak" && D.selection.answer === "notalone" && /M14/.test(D.selection.feedback.notalone), "the model computes the peak; a survey difference is not an effect by itself, see M14");
ok(/data-answer="a"/.test(M.checkHTML(D)) && /A survey of a representative sample/.test(M.checkHTML(D)), "the quick question's answer is the survey");

// ---------------- facts and sources
const SRC = D.sources, TXT = k => SRC[k].cite + ": " + SRC[k].used.join(" ");
ok(/27% of U\.S\. households/.test(TXT("eia-recs")) && /34 million/.test(TXT("eia-recs")) && /18,496/.test(TXT("eia-recs")) && /web or mail/.test(TXT("eia-recs")), "the RECS facts as EIA states them");
ok(D.facts[0].n === "27%" && /34 million/.test(D.facts[0].what) && D.facts[1].n === "18,496" && /web or mail/.test(D.facts[1].what), "the facts equal the source line");
ok(D.facts[2].n === "7" && /experiments, literature reviews, data collection, data analysis, quantitative energy modeling, qualitative analysis and case studies/.test(D.facts[2].what) && /seven method categories/.test(TXT("sovacool2018")), "seven method categories, as the review's abstract lists them");
Object.keys(SRC).forEach(k => ok(/\d{4}/.test(SRC[k].asOf) && S.linkOK(SRC[k].url), k + ": dated, link on the allow-list"));
D.facts.forEach(f => ok(SRC[f.src], f.n + ": a source"));
Object.keys(SRC).forEach(k => { ok(SRC[k].cite && SRC[k].used.length >= 1 && nWords(SRC[k].cite) <= 32, k + ": a citation of " + nWords(SRC[k].cite) + " words and the claims it supports");
  SRC[k].used.forEach(u => ok(nWords(u) <= 30, k + ": a 'supports' line of " + nWords(u) + " words")); });

// ---------------- the sort: short definitions, and a match only when every question is placed
{ const B = M.bins(D); ok(B.length === 6 && B.every(b => b.label && b.sub && nWords(b.sub) <= 8), "every box of the sort carries a short definition of its method, so nothing is tested before it is explained"); }
ok(/if \(g\.placed < g\.total\) \{ api\.saw\(matchLine\(g\), true\); return; \} act\.appendChild\(why\)/.test(JS), "the match counts only with every question placed, then shows every pairing's reason");
{ const r = M.reasonsHTML(D); ok(D.questions.every(q => r.indexOf(q.why) > 0), "every pairing's reason is shown after a full check, right or wrong"); }
ok(!/needs informed consent and an ethics board's review/.test(RAW + JS + PAGE) && /decides whether any requirement can be relaxed/.test(D.peopleWhy.yes) && /identifiable personal records/.test(D.peopleWhy.partly) && /ethics board decides/.test(M.PEOPLE_SAW) && /decides whether any requirement can be relaxed/.test(M.ideasHTML(D)), "ethics: the board decides what review and consent apply, and whether any requirement can be relaxed; records count too");
{ const cut = x => x.replace(/exemption determinations/g, "").replace(/including who decides on review and on exemptions/g, "");   // the DOE order's own subjects, in the reading ladder and its source
  ok(!/\bexemptions?\b|\bwaivers?\b/i.test(cut(PAGE) + cut(RAW) + JS), "no unexplained 'exemption' or 'waiver' in the lesson's own text: plain words for what the board may relax"); }
ok(/ethics board\]\] decides what review/.test(M.STEPS[3]) && /decides what review and consent apply/.test(D.stop.includes[1]) && /and whether any requirement can be relaxed, before data are collected/.test(PAGE), "the step, the stop box and the Go deeper say the same");
ok(/^For these questions/.test(M.MATCH_SAW) && !/needs a survey|need interviews/.test(M.MATCH_SAW) && /^Everyday experience the records miss, especially of people who left no record/.test(M.method(D, "policy").cannot) && !/Documents alone do not show/.test(RAW), "method boundaries stated for these questions, not as rules; documents can record experiences, so the limit is records that miss people");
// one story: every question is about the council's heat-pump program, as the subtitle promises
D.questions.forEach(q => ok(/heat[- ]pump|program/.test(q.text), q.id + ": the question is about the heat-pump program (" + q.text.slice(0, 50) + ")"));
ok(!/rooftop solar|solar farm|thermostat|efficiency upgrade/.test(D.questions.map(q => q.text).join(" ")), "no question drifts to another program");
// surveys estimate; who responds matters
ok(/estimates shares or numbers by group, and who responds affects how reliable they are/.test(M.checkHTML(D)) && !/a count by group across a population is what surveys do/.test(JS) && /estimates shares by group; who responds affects/.test(D.questions[0].why) && /^Estimated shares/.test(M.method(D, "survey").gives), "a survey estimates shares from those who respond; it does not count them");
ok(!/adoption scenarios/.test(RAW) && /how many take up an offer/.test(M.method(D, "choice").gives), "plain words for adoption scenarios");
ok(!/behaviour|programme|modeller/.test(RAW + JS), "American spelling in the page's own text: behavior, program, modeler");
{ const fb = M.staticFallback(D); ok(/<th scope="col">Data<\/th>/.test(fb) && D.methods.every(m => fb.indexOf(m.data.replace(/'/g, "'")) > 0), "the no-JS table has each method's data");
  ok([D.predict, D.selection].every(Q => Q.options.every(o => fb.indexOf(Q.feedback[o.value]) > 0)) && /homes in the heat-pump program use less energy/.test(fb), "the no-JS block has both predictions, every option with its feedback");
  ok(D.questions.every(q => fb.indexOf(q.text + "<br>" + q.why.replace(/'/g, "'")) > 0), "the no-JS block gives every pairing with its reason");
  ok(/Which methods involve people as participants/.test(fb) && D.methods.every(m => fb.indexOf("<b>" + m.label + ".</b> " + D.peopleWhy[m.people]) > 0) && /once officials are interviewed, or identifiable personal records are used/.test(fb), "the no-JS block says which methods involve people, and when document analysis needs the ethics board too"); }
ok(!/dockets and filings|siting screen/.test(RAW) && /difficulty paying energy bills, or a home kept at an unsafe temperature/.test(D.facts[0].what), "plain words for case records and map layers; energy insecurity defined where the 27% is");
ok(/does not, by itself, establish the program's effect/.test(M.ideasHTML(D)), "the static causal line: not by itself");
// the whole first view of a method's card, labels and the "More" summary included
D.methods.forEach(m => { const h = M.methodHTML(D, m.id), vis = h.replace(/<details[\s\S]*?<summary>([\s\S]*?)<\/summary>[\s\S]*<\/details>/, "$1"); ok(nWords(vis) <= 40, m.id + ": the card's first view is " + nWords(vis) + " words, labels included"); });
D.methods.forEach(m => { const P = M.methodParts(D, m.id); ok(nWords(P.shown.join(" ")) <= 40, m.id + ": the card shows " + nWords(P.shown.join(" ")) + " words at first"); ok(nWords(P.more.join(" ")) <= 40, m.id + ": 'More' holds " + nWords(P.more.join(" ")) + " words"); });

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
ok(M.STEPS.length === 5, "five step cards");
M.STEPS.forEach((t, i) => { const n = nWords(t); ok(n >= 14 && n <= 36, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.MATCH_SAW, M.PICK_SAW, M.PEOPLE_SAW, M.matchLine({ right: 4, placed: 6, total: 6 })].concat(Object.values(D.predict.feedback), Object.values(D.selection.feedback), D.questions.map(q => q.why), D.questions.map(q => q.text),
  [].concat.apply([], D.methods.map(m => [m.asks, m.data, m.gives, m.cannot])), Object.values(D.peopleWhy));
lines.forEach(t => { ok(nWords(t) <= 36, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption|h3|h4)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 42, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls
ok(/aria-live/.test(JS) && (JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 5, "live regions; a demo hook with an action for each of the five steps");
ok(/mode: "toggles"/.test(JS) && /checkLabel: "Check my marks"/.test(JS), "the people marks use the shared toggles sort");
["choice-experiment", "ethnography", "participatory-mapping"].forEach(t => ok(new RegExp("id: " + t + "\\b").test(SIDE) && D.methods.some(m => m.term === t), "the sidecar defines " + t + " and a method card marks it"));
ok(/\[\[informed-consent\|/.test(M.STEPS[3]) && /\[\[ethics-board\|/.test(M.STEPS[3]), "step 4 marks R9's terms, informed consent and ethics board");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
