// test_r03-system-and-method.js — Node tests for research studio R3 (assets/learn/r03-system-and-method.js, its data file
// and learn/r03-system-and-method.qmd):
//   - three briefs at three different scales, of three different question types; eight boundary cards each, in all three
//     bins; exactly one "good" time step and horizon; a fit note for each of the nine method families
//   - method pluralism (method-neutral): the nine families of the curriculum's R3 row; every brief has at least two families that
//     fit or help; the three example defences use three different families, and optimization is only one of them
//   - each example defence is for a family that fits well, names a same-family alternative and another family, and has
//     every part the reader's form asks for; the structure checks never pass an empty part and never ask for a word
//   - the defence step is done only when its five required parts are there; opening the example defence completes
//     nothing, and its feedback follows the fit of the reader's own family
//   - the design card as fields (a defence with line breaks stays one value) and as text; the five scales are the question
//     card's; the exemplars are well formed, the strong one reads the question as conditional planning and states a
//     boundary, a limit and its mitigation (the rubric's Strong anchor for method fit, labelled as such)
//   - the details: the boundary bins, the credits' assumption, the adequacy area, the islanding and pausing
//     assumptions, family limits by variant, glossary marks at first use
//   - the three no-JS blocks on the page equal the generated ones (write them with --write after a data edit)
//   - text budget and the scope deny-list on the data, script and page
// Usage (from the site folder):  node _tests/learn/test_r03-system-and-method.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L("r03-system-and-method.js"));
const QC = require(L("components/questioncard.js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const D = JSON.parse(fs.readFileSync(L("data/r03-system-and-method.json"), "utf8"));
const QPATH = path.join(SITE, "learn/r03-system-and-method.qmd");
const BLOCKS = M.staticBlocks(D, { exemplars: EX.staticHTML, rubric: RB.staticHTML });
const MARK = { task: "r03-task", exemplars: "r03-exemplars", rubric: "r03-rubric" };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  return a && b >= a.index ? { a: a.index + a[0].length, b: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(MARK).forEach(k => { const r = between(q, MARK[k]); if (!r) throw new Error(MARK[k] + " markers missing"); q = q.slice(0, r.a) + BLOCKS[k] + "\n" + q.slice(r.b); });
  fs.writeFileSync(QPATH, q);
  console.log("r03 no-JS blocks written");
}
const PAGE = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(L("r03-system-and-method.js"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// ---------------- briefs
ok(M.check(D).length === 0, "data checks pass: " + M.check(D).join("; "));
ok(D.briefs.length === 3 && new Set(D.briefs.map(b => b.scale)).size === 3 && new Set(D.briefs.map(b => b.type)).size === 3, "three briefs, three scales, three question types");
ok(D.briefs.every(b => QC.TYPES.some(t => t.id === b.type)), "brief types are the course's five question types");
ok(JSON.stringify(D.scales.map(s => s.id)) === JSON.stringify(QC.SCALES.map(s => s[0])), "the five scales are the question card's S0-S4");
ok(D.briefs.every(b => b.scaleWhy.indexOf(b.scale + ":") === 0), "every scale note opens with the right scale");
ok(D.briefs.every(b => b.boundary.every(c => c.why && c.text)), "every boundary card has a reason");

// ---------------- method pluralism
const FAM = ["optimization", "simulation", "statistics", "machine learning", "system dynamics", "agent-based", "equilibrium", "qualitative", "mixed"];
ok(D.families.length === 9 && FAM.every((w, i) => D.families[i].label.toLowerCase().indexOf(w) === 0), "the nine families of the curriculum's R3 row, in its order");
ok(D.families.every(f => f.answers && f.needs && f.limit && f.types.length), "every family: what it answers, needs, its limit and typical types");
ok(D.families.filter(f => f.types.indexOf("prescriptive") >= 0).map(f => f.id).join() === "opt,mixed", "only optimization (and mixed designs) list prescriptive as their typical type; the others answer other types");
D.briefs.forEach(b => ok(Object.keys(b.fits).filter(k => b.fits[k][0] !== "poor").length >= 2, b.id + ": at least two families fit or help"));
const defended = D.briefs.map(b => b.defence.method);
ok(new Set(defended).size === 3 && defended.filter(x => x === "opt").length === 1, "the example defences use three families; optimization is one of them (" + defended.join(", ") + ")");
ok(D.briefs.find(b => b.id === "rebate").fits.opt[0] === "poor", "an evaluative question is a poor fit for optimization (the flowchart's habit trace)");

// ---------------- defences and their checks
D.briefs.forEach(b => {
  const d = b.defence, v = M.asReader(d), c = M.defenceChecks(v, d.method);
  ok(c.length === 6 && c[0].id === "choice" && c.every(x => x.ok) && M.defenceDone(v, d.method) && String(v.reduce || "").trim(), b.id + ": the example defence has the six required parts (its method named first) and a way to reduce its limit");
  ok(b.fits[d.method][0] === "good" && d.other !== d.method, b.id + ": defends a well-fitting family against another family");
  M.defenceFields(D, d).forEach(f => ok(M.words(f[0] + " " + f[1]) <= 35, b.id + ": defence part within 35 words: " + M.plainMarks(f[0])));
});
ok(M.defenceChecks({}, "opt").every(x => !x.ok) && !M.defenceDone({}, "opt"), "defence checks: an empty defence passes nothing");
ok(!M.defenceDone({ same: "a single run", why1: "x", other: "sd", why2: "y", limit: "z" }, "opt"), "defence checks: a defence that never names the chosen method is not done");
ok(/function showQ\(act\) \{\n\s*H\("p", \{ class: "r3-q"[^\n]*\n\s*if \(B\(\)\.assume\) H\("p", \{ class: "r3-assume/.test(JS), "the brief's question and its assumption are two separate elements");
D.briefs.forEach(b => ok(M.words(b.question) <= 35 && (!b.assume || M.words(b.assume) <= 35), b.id + ": the question and the assumption each within 35 words, as shown"));
ok(/Words in these briefs: " \+ LX\.rich\(D\.terms\)/.test(JS) && /\[\[expected-unserved-energy\|/.test(D.terms), "the brief picker keeps glossary help for the briefs' terms beside its plain-text buttons");
ok(/\[\[representative-period\|representative hours\]\]/.test(JSON.stringify(D.exemplars)), "the exemplar marks representative hours");
ok(!M.defenceChecks({ other: "opt" }, "opt")[3].ok, "defence checks: the same family does not count as another family");
const plainDef = { choice: "A linear program of the outage days.", same: "a single run", why1: "One run hides the spread the question asks about.", other: "sd", why2: "It has no hourly grid.", limit: "Foresight inside each case." };
ok(M.defenceDone(plainDef, "opt") && !/because/.test(JSON.stringify(plainDef)), "defence checks: a defence passes on its parts alone, without any required word (no 'because')");
ok(!M.defenceDone(Object.assign({}, plainDef, { why2: " " }), "opt"), "defence checks: a blank reason does not count");
// the defence step: done only from the six parts; the example button completes nothing
const STEP6 = JS.slice(JS.indexOf('{ text: "Name your method and defend it'), JS.indexOf('{ text: "Your design card'));
const CMP = STEP6.slice(STEP6.indexOf('cmp.addEventListener("click"'), STEP6.indexOf("paint();\n        } },"));
ok((STEP6.match(/api\.done\(\)/g) || []).length === 1 && /if \(done\) api\.done\(\)/.test(STEP6) && CMP.length > 0 && !/api\.done/.test(CMP), "defence step: api.done() only when the six parts are there, never from 'Compare with an example defence'");
ok(/if \(done\) api\.done\(\); else api\.undone\(\);/.test(STEP6) && /undone: function \(\) \{ if \(st\.free\) return; unlocked\[k\] = false; nx\.disabled = true; \}/.test(fs.readFileSync(path.join(SITE, "assets/learn/components/cards.js"), "utf8")),
   "defence step: clearing a part after all six were there shuts Next again (the step cards' api.undone)");
const H0 = D.briefs.find(b => b.id === "hospital");
ok(/poor fit/.test(M.compareFeedback(D, H0, "ml")) && !/Both/.test(M.compareFeedback(D, H0, "ml")), "comparison feedback: a poorly fitting family is told so, not that both can be defended");
ok(/Same family/.test(M.compareFeedback(D, H0, "opt")) && /helps with a part/.test(M.compareFeedback(D, H0, "stat")) && /both fit/.test(M.compareFeedback(D, H0, "sim")), "comparison feedback: same family, a family that helps with a part, and one that fits well");
D.briefs.forEach(b => D.families.forEach(f => ok(M.words(M.compareFeedback(D, b, f.id)) <= 35, "comparison feedback within 35 words (" + b.id + ", " + f.id + ")")));
const st = { brief: "hospital", per: { hospital: { scale: "S1", placed: { a1: "inside", a6: "out" }, step: "1h", horizon: "yr", method: "opt", choice: "A MILP of the outage days.", same: "an LP", why1: "First sentence.\nSecond sentence.", other: "sim", why2: "A ranking is not a choice.", limit: "Perfect foresight." } } };
const F = M.designFields(D, st), FL = F.map(x => x[0]);
const fv = k => (F.find(x => x[0] === k) || [])[1];
ok(FL.join("|") === "Question|Type|Assumption|Scale|Boundary, decided or computed|Boundary, fixed inputs|Boundary, left out|Time step|Horizon|Method family|Method|Alternative 1|Why not alternative 1|Alternative 2|Why not alternative 2|Main limit|Reduced or checked by", "design card fields, in order: " + FL.join(", "));
ok(fv("Scale") === "S1 microgrid and community" && fv("Boundary, decided or computed") === "Sizes of solar, battery and generator" && fv("Boundary, left out") === "Wholesale prices across the Plains Grid" && fv("Boundary, fixed inputs") === "(not yet)", "design card: scale and the reader's boundary");
ok(fv("Time step") === "1 hour" && fv("Horizon") === "A typical year plus the outage" && fv("Method family") === "Optimization" && fv("Method") === "A MILP of the outage days." && fv("Alternative 1") === "an LP" && fv("Alternative 2") === "Simulation" && fv("Reduced or checked by") === "(not yet)", "design card: step, horizon, method, alternatives");
ok(fv("Why not alternative 1") === "First sentence.\nSecond sentence." && F.length === 17, "design card: a reason with a line break stays one field, whole (no extra field, no lost character)");
ok(/designFields\(D, st\)\.forEach/.test(JS) && !/txt\.split\("\\n"\)/.test(JS) && /white-space:pre-line/.test(JS), "design card: drawn from its fields (not by splitting the text), with line breaks kept");
const dt = M.designText(D, st).split("\n");
ok(dt[0] === "Learn · R3 design card" && dt[1].indexOf("Question: What sizes") === 0 && !/\[\[/.test(M.designText(D, st)), "design card text: plain, without glossary marks");
ok(M.designText(D, { brief: null }) === "" && M.designFields(D, { brief: null }).length === 0, "design card: nothing before a brief is chosen");

// ---------------- exemplars and rubric
ok(EX.validate(D.exemplars).length === 0, "exemplars are well formed: " + EX.validate(D.exemplars).join("; "));
const good = EX.plain(D.exemplars.answers.find(a => a.key === "good")), weak = EX.plain(D.exemplars.answers.find(a => a.key === "weak"));
ok(/Main limit:/.test(good) && /Reduced by:/.test(good) && D.exemplars.answers.find(a => a.key === "good").level === "Strong on method fit", "strong defence states a limit and its mitigation: labelled Strong on method fit");
ok(/Alternative 1:/.test(good) && /Alternative 2: a system-dynamics/.test(good), "strong defence: two alternatives, one from another family");
ok(/conditional planning study/.test(good) && /not predicted deployment/.test(good) && !/predictive question/i.test(good), "strong defence: optimization read as conditional planning, its results as model-optimal plans, not predictions");
ok(/Scale and boundary: S4;/.test(good) && /left out/.test(good), "strong defence: states its scale and boundary, as the weak one is faulted for not doing");
ok(/standard tool/.test(weak) && !/Alternative/.test(weak), "weak defence: chosen by habit, no alternatives");
ok(D.exemplars.lines === true && EX.plain(D.exemplars.answers[1]).split("\n").every(l => M.words(l) <= 35), "exemplars: one labelled part per line, each at most 35 words");
ok(D.rubric.competences.map(c => c.id).join() === "framing,method" && D.rubric.competences.every(c => RB.COMPETENCES.some(x => x.id === c.id)), "rubric: framing and method fit, the course's ids");
ok(/not a certificate/.test(D.rubric.note), "the narrow promise (the course's promise)");

// ---------------- page
Object.keys(MARK).forEach(k => {
  const r = between(PAGE, MARK[k]);
  ok(r && PAGE.slice(r.a, r.b) === BLOCKS[k] + "\n", "no-JS block " + MARK[k] + " equals the generated one (run with --write after a data edit)");
});
ok(PAGE.indexOf('class="lx-card lx-studio-brief"') < PAGE.indexOf('data-learn="r03-system-and-method"') && /<b>Done when:<\/b>/.test(PAGE), "the task card sits above the interactive");
ok(/About 30 minutes guided here, then about an hour on your own/.test(PAGE), "guided and practice time stated (30 + 60 min)");
ok(/300 MW/.test(D.briefs.find(b => b.id === "flexload").question) && /the 300 MW load are illustrative/.test(PAGE), "the 300 MW load is labelled illustrative");
ok(/a time step and horizon/.test(PAGE.slice(PAGE.indexOf("<b>Done when:</b>"), PAGE.indexOf("<b>Done when:</b>") + 300)) && /R1 card/.test(D.rubric.competences[0].look), "done when: the time step and horizon too; the rest of Framing comes from the R1 card");
ok(!("built_by" in D.meta), "the public data file carries no production note");

// ---------------- the details, one by one
ok(D.bins.map(b => b.label).join("|") === "Decided or computed|Fixed inputs|Left out" && /^in the study/.test(D.bins[1].sub) && /^outside/.test(D.bins[2].sub), "boundary bins: fixed inputs are inside the analysis, not 'from outside'");
const BR = id => D.briefs.find(b => b.id === id), cardOf = (b, id) => b.boundary.find(c => c.id === id);
ok(/Assumed to affect both groups alike/.test(cardOf(BR("rebate"), "b5").why) && !/removes them/.test(JSON.stringify(D)), "rebate: federal credits are assumed to affect both groups alike, not removed by the comparison");
ok(!/synchronous/i.test(JSON.stringify(D) + PAGE) && /planned for a region, such as a market operator's or a utility's planning area/.test(BR("flexload").scaleWhy) && /transfer limits/.test(BR("flexload").scaleWhy), "flexible load: adequacy planned for a region or planning area (as F1 now words it), with transfer limits; no 'whole synchronous grid'");
ok(/separate, faster study/.test(BR("hospital").steps.find(x => x.id === "5m").why) && /islanding/.test(BR("hospital").assume) && /not the switch itself/.test(BR("hospital").assume), "hospital: five-minute steps do not verify the switch; the result assumes islanding works");
ok(/four hours in a row per event/.test(BR("flexload").assume) && /events a year/.test(BR("flexload").assume) && /not made up later/.test(BR("flexload").assume) && /apart from unserved energy/.test(BR("flexload").assume), "flexible load: the pausing rule is stated (per event, events a year, no recovery, counted apart)");
const FAMS = id => D.families.find(f => f.id === id);
ok(/rolling horizon/.test(FAMS("opt").limit) && /unless/.test(FAMS("opt").limit) && /deterministic run may treat/.test(FAMS("opt").limit) && /what each decision can know/.test(FAMS("opt").limit) && /^Least reliable outside/.test(FAMS("ml").limit) && /^Static versions/.test(FAMS("eq").limit), "family limits by variant: foresight is a formulation choice, ML extrapolates unreliably, static equilibrium");
["expected-unserved-energy", "linear-program", "mixed-integer-program", "perfect-foresight", "resource-adequacy", "islanding"].forEach(id => ok(JSON.stringify(D).indexOf("[[" + id + "|") >= 0, "glossary mark at first use in the data: " + id));
ok(/\(LP\)/.test(BR("hospital").defence.same) && /\(MILP\)/.test(BR("hospital").defence.choice), "LP and MILP spelled out at first use");
["https://docs.pypsa.org/", "https://jump.dev/", "https://www.pyomo.org/"].forEach(u => ok(PAGE.indexOf('href="' + u + '"') >= 0, "tool link " + u));

// ---------------- text budget and scope
const words = s => String(s).trim().split(/\s+/).length;
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n?\s*(free: true,\s*\n?\s*)?build/g)].map(m => m[1]);
ok(stepTexts.length === 7 && stepTexts.every(t => words(t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1")) <= 35), "seven step cards, each at most 35 words");
D.briefs.forEach(b => b.boundary.concat(b.steps, b.horizons).forEach(x => ok(words(x.why) <= 25, b.id + " note within budget: " + x.why)));
D.briefs.forEach(b => [b.scaleWhy, b.assume].filter(Boolean).forEach(t => ok(M.words(t) <= 35, b.id + ": scale note and assumption within 35 words")));
const sentences = t => (t.replace(/\b(U\.S\.|e\.g\.|i\.e\.)/g, "x").match(/[.!?](\s|$)/g) || []).length;
ok(stepTexts.every(t => sentences(t) <= 2), "every step card is at most two sentences");
// every text element the page shows, with JavaScript off: at most 35 words and two sentences (an answer written as a card
// is checked line by line; references are left out)
const VIS = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "");
const long = [];
for (const m of VIS.matchAll(/<(li|p|td|th|caption|summary|dd)\b([^>]*)>((?:(?!<\/?\1\b)[\s\S])*?)<\/\1>/g)) {
  const parts = /lx-ex-lines/.test(m[2]) ? m[3].split("\n") : [m[3]];
  parts.forEach(x => { const t = x.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, "x").replace(/\s+/g, " ").trim(); if (t && (words(t) > 35 || sentences(t) > 2)) long.push(t.slice(0, 60)); });
}
ok(long.length === 0, "every visible text element of the page is at most 35 words and two sentences: " + long.join(" | "));
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
const DENY = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
  /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/i, /artificial intelligence/i,
  /nuclear|reactor|\bSMR\b|small modular/i, /data[- ]cent/i, /\bClaude\b|ChatGPT|language model/i];
const texts = [JSON.stringify(D), JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), OWN];
DENY.forEach(re => ok(texts.every(t => !re.test(t)), "scope: nothing matches " + re));

console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (test_r03-system-and-method)");
process.exit(fails ? 1 : 0);
