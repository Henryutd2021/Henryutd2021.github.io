// test_r03-system-and-method.js — Node tests for research studio R3 (assets/learn/r03-system-and-method.js, its data file
// and learn/r03-system-and-method.qmd):
//   - three briefs at three different scales, of three different question types; eight boundary cards each, in all three
//     bins; exactly one "good" time step and horizon; a fit note for each of the nine method families
//   - method pluralism (§11.2): the nine families of the curriculum's R3 row; every brief has at least two families that
//     fit or help; the three example defences use three different families, and optimization is only one of them
//   - each example defence is for a family that fits well, names a same-family alternative and another family, and passes
//     the studio's own structure checks; the checks never pass an empty defence
//   - the design card's text; the five scales are the question card's; the exemplars are well formed and the strong one
//     states a limit and its mitigation (the rubric's Strong anchor for method fit)
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
ok(D.briefs.every(b => QC.TYPES.some(t => t.id === b.type)), "brief types are the five types of §11.2");
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
  const d = b.defence, c = M.defenceChecks({ same: d.same, other: d.other, text: d.text }, d.method);
  ok(c.every(x => x.ok), b.id + ": the example defence passes the four structure checks");
  ok(b.fits[d.method][0] === "good" && d.other !== d.method, b.id + ": defends a well-fitting family against another family");
  ok(d.text.indexOf(d.same) >= 0 || d.text.toLowerCase().indexOf(d.same.split(" ").slice(-2).join(" ")) >= 0, b.id + ": the text names the same-family alternative");
});
ok(M.defenceChecks({}, "opt").every(x => !x.ok), "defence checks: an empty defence passes nothing");
ok(!M.defenceChecks({ other: "opt" }, "opt")[1].ok, "defence checks: the same family does not count as another family");
const tpl = "I chose optimization over [a simpler version], because … . I chose it over [another family], because … . Its main limit is …; I reduce it by … .";
ok(M.defenceChecks({ text: tpl }, "opt").filter(c => c.id === "why" || c.id === "limit").every(c => !c.ok), "defence checks: the bare template passes neither the reasons nor the limit");
const st = { brief: "hospital", per: { hospital: { scale: "S1", placed: { a1: "inside", a6: "out" }, step: "1h", horizon: "yr", method: "opt", same: "an LP", other: "sim", text: "I chose ..." } } };
const dt = M.designText(D, st).split("\n");
ok(dt[0] === "Learn · R3 design card" && dt[3] === "Scale: S1 microgrid and community" && dt[4] === "Boundary, inside: Sizes of solar, battery and generator" && dt[6] === "Boundary, left out: Wholesale prices across the Plains Grid", "design card text: scale and the reader's boundary");
ok(dt[7] === "Time step: 1 hour" && dt[8] === "Horizon: A typical year plus the outage" && dt[9] === "Method family: Optimization" && dt[10] === "Alternatives: an LP; Simulation", "design card text: step, horizon, method, alternatives");
ok(M.designText(D, { brief: null }) === "", "design card: nothing before a brief is chosen");

// ---------------- exemplars and rubric
ok(EX.validate(D.exemplars).length === 0, "exemplars are well formed: " + EX.validate(D.exemplars).join("; "));
const good = EX.plain(D.exemplars.answers.find(a => a.key === "good")), weak = EX.plain(D.exemplars.answers.find(a => a.key === "weak"));
ok(/main limit/.test(good) && /I reduce it/.test(good) && D.exemplars.answers.find(a => a.key === "good").level === "Strong", "strong defence states a limit and its mitigation: labelled Strong (method fit)");
ok(/I chose it over/.test(good) && /system-dynamics/.test(good), "strong defence: two alternatives, one from another family");
ok(/standard tool/.test(weak) && !/\bover\b/.test(weak), "weak defence: chosen by habit, no alternatives");
ok(D.rubric.competences.map(c => c.id).join() === "framing,method" && D.rubric.competences.every(c => RB.COMPETENCES.some(x => x.id === c.id)), "rubric: framing and method fit, the course's ids");
ok(/not a certificate/.test(D.rubric.note), "the narrow promise (§3.1)");

// ---------------- page
Object.keys(MARK).forEach(k => {
  const r = between(PAGE, MARK[k]);
  ok(r && PAGE.slice(r.a, r.b) === BLOCKS[k] + "\n", "no-JS block " + MARK[k] + " equals the generated one (run with --write after a data edit)");
});
ok(PAGE.indexOf('class="lx-card lx-studio-brief"') < PAGE.indexOf('data-learn="r03-system-and-method"') && /<b>Done when:<\/b>/.test(PAGE), "the task card sits above the interactive");
ok(/About 30 minutes guided here, then about an hour on your own/.test(PAGE), "guided and practice time stated (30 + 60 min)");
ok(/300 MW/.test(D.briefs.find(b => b.id === "flexload").question) && /the 300 MW load are illustrative/.test(PAGE), "the 300 MW load is labelled illustrative");
["https://docs.pypsa.org/", "https://jump.dev/", "https://www.pyomo.org/"].forEach(u => ok(PAGE.indexOf('href="' + u + '"') >= 0, "tool link " + u));

// ---------------- text budget and scope
const words = s => String(s).trim().split(/\s+/).length;
const stepTexts = [...JS.matchAll(/\{ text: "([^"]+)",\s*\n?\s*(free: true,\s*\n?\s*)?build/g)].map(m => m[1]);
ok(stepTexts.length === 7 && stepTexts.every(t => words(t.replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1")) <= 35), "seven step cards, each at most 35 words");
D.briefs.forEach(b => b.boundary.concat(b.steps, b.horizons).forEach(x => ok(words(x.why) <= 25, b.id + " note within budget: " + x.why)));
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
const DENY = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
  /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/i, /artificial intelligence/i,
  /nuclear|reactor|\bSMR\b|small modular/i, /data[- ]cent/i, /\bClaude\b|ChatGPT|language model/i];
const texts = [JSON.stringify(D), JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), OWN];
DENY.forEach(re => ok(texts.every(t => !re.test(t)), "scope: nothing matches " + re));

console.log((fails ? "FAILED " : "ok ") + (checks - fails) + "/" + checks + " checks (test_r03-system-and-method)");
process.exit(fails ? 1 : 0);
