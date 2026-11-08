// test_components_w2.js — Node tests for the studio and case-file components:
//   exemplars.js (LX.Exemplars), rubric.js (LX.Rubric), questioncard.js (LX.QuestionCard), timeline.js (LX.Timeline),
//   the page pieces of the two forms (forms.css), and lesson 13's planning engine, shared as planengine.js/.css.
//   - each file defines its LX.<Name> with a stub window.LX, exports its pure part to Node, uses --lx-* tokens only, and is
//     in the generated bundle (learn.js, learn.css)
//   - the pure parts: exemplar marks, plain text, checks and the no-JS version; the rubric's words (against the course
//     plan's rubric when it is available through private_sources.js), counts and summary; the question card's checks,
//     text and link round trip; timeline dates, gaps, order and checks
//   - the views on a stub document (_tests/learn/stubdom.js): keyboard and click reveal, aria state, live regions,
//     browser storage, copy boxes, links
//   - the planning engine: exported for Node and as LX.townPlan (with its page kit), the same object from 13-capstone.js,
//     no copy left in lesson 13, lesson 12 no longer loads 13-capstone.js (test_12 and test_13 check the numbers)
// Usage (from the site folder):  node _tests/learn/test_components_w2.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { env, load, buttons } = require("./stubdom.js");
const PRIV = require("./private_sources.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const tick = () => new Promise(r => setImmediate(r));

// ---------------------------------------------------------------- files, tokens, bundle
const NAMES = { exemplars: "Exemplars", rubric: "Rubric", questioncard: "QuestionCard", timeline: "Timeline" };
const bundleJS = fs.readFileSync(L("learn.js"), "utf8"), bundleCSS = fs.readFileSync(L("learn.css"), "utf8");
Object.keys(NAMES).forEach(f => {
  const src = fs.readFileSync(L("components/" + f + ".js"), "utf8"), css = fs.readFileSync(L("components/" + f + ".css"), "utf8");
  ok(src.split("\n")[0].indexOf("/* " + f + ".js — LX." + NAMES[f]) === 0, `${f}.js: header comment names the file and the component`);
  ok(css.split("\n")[0].indexOf("/* " + f + ".css — ") === 0, `${f}.css: header comment names the file`);
  ok(!/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && !/#[0-9a-fA-F]{6}\b|rgba?\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), `${f}: colours from --lx-* tokens only`);
  const ctx = { window: { LX: {} }, module: { exports: {} }, document: {} };
  try { vm.runInNewContext(src, ctx); } catch (e) { ok(false, `${f}.js runs with a stub window.LX: ${e.message}`); return; }
  ok(typeof ctx.window.LX[NAMES[f]] === "function" && new RegExp("LX\\." + NAMES[f] + " = ").test(src), `${f}.js defines LX.${NAMES[f]}`);
  ok(Object.keys(ctx.module.exports).length > 0, `${f}.js exports its pure part to Node`);
  ok(bundleJS.indexOf(src.trim().split("\n")[0]) >= 0 && bundleCSS.indexOf(css.trim().split("\n")[0]) >= 0, `${f}: in the generated bundle (run the course build step)`);
});
const forms = fs.readFileSync(L("components/forms.css"), "utf8");
ok(forms.split("\n")[0].indexOf("/* forms.css — ") === 0 && !/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(forms.replace(/\/\*[\s\S]*?\*\//g, "")) && bundleCSS.indexOf(".lx-case-part") >= 0,
  "forms.css: header, tokens only, bundled");
["lx-studio-task", "lx-case", "lx-case-part", "lx-case-q", "lx-excerpt", "lx-tl-static", "lx-ex-static", "lx-rb-static", "lx-case-try"].forEach(c =>
  ok(new RegExp("\\." + c + "\\b").test(forms), `forms.css styles .${c} (used by the templates)`));
["_template-studio.qmd", "_template-case.qmd"].forEach(t => {
  const s = fs.readFileSync(path.join(SITE, "learn", t), "utf8");
  ok(/^# TEMPLATE/m.test(s) && /<!-- learn:meta:start -->/.test(s) && /<!-- learn:next:start -->/.test(s) && /<!-- learn:footer:start -->/.test(s), `${t}: template header and the three marker pairs`);
  const ids = t.indexOf("studio") >= 0 ? ["task", "exemplars", "selfcheck", "sources"] : ["case", "explain", "check", "sources"];
  ids.forEach(id => ok(s.indexOf("::: {#" + id + " .lx-sec}") >= 0, `${t}: section #${id} (a step link of the form)`));
  ok(s.indexOf('body-classes: "page-learn page-lesson lx-form-' + (t.indexOf("studio") >= 0 ? "studio" : "case") + '"') >= 0, `${t}: body class names the form`);
});
ok(/data-source="excerpt:<key>"/.test(fs.readFileSync(path.join(SITE, "learn/_template-case.qmd"), "utf8")), "case template: the excerpt carries its approved source key");

// ---------------------------------------------------------------- exemplars: pure
const EX = require(L("components/exemplars.js"));
const exo = { title: "Two answers", task: "Write a question for the co-op board.",
  answers: [
    { key: "weak", label: "Weak answer", level: "Developing", parts: ["Is ", { text: "community solar", note: "No type, no metric." }, " good for ", { text: "people", note: "No audience: whose bills?" }, "?"] },
    { key: "good", label: "Strong answer", level: "Proficient", parts: ["Did the co-op's programme lower ", { n: 1, text: "renters' energy burden", note: "A metric: the share of income spent on energy, in %." },
      " more than ", { n: 2, text: "bill credits of the same cost", note: "A [[counterfactual|counterfactual]] of **equal cost**." }, "?"] }],
  diff: [{ label: "Framing", weak: "untyped", good: "evaluative, with a counterfactual" }] };
ok(EX.validate(exo).length === 0, "exemplars: a well-formed pair passes validate()");
ok(EX.marks(exo.answers[0]).map(m => m.n).join() === "1,2" && EX.marks(exo.answers[1])[1].text === "bills credits of the same cost".replace("bills", "bill"), "exemplars: marks are numbered in reading order, or by n");
ok(EX.plain(exo.answers[0]) === "Is community solar [1] good for people [2]?", "exemplars: plain text with [n] after each mark");
ok(EX.validate({ answers: [exo.answers[0]] })[0] === "needs at least two answers", "exemplars: one answer is not a pair");
ok(EX.validate({ answers: [exo.answers[0], { key: "weak", label: "B", parts: ["x"] }] }).some(p => /key repeated/.test(p)) &&
   EX.validate({ answers: [exo.answers[0], { key: "good", label: "B", parts: ["x"] }] }).some(p => /no marked phrase/.test(p)) &&
   EX.validate({ answers: [exo.answers[0], { key: "good", label: "B", parts: [{ text: "x" }] }] }).some(p => /no note/.test(p)) &&
   EX.validate({ answers: [exo.answers[0], { key: "good", label: "B", parts: [{ n: 1, text: "x", note: "a" }, { n: 1, text: "y", note: "b" }] }] }).some(p => /repeated/.test(p)),
   "exemplars: validate() names repeated keys, missing marks, missing notes and repeated numbers");
const exh = EX.staticHTML(exo);
ok(exh.indexOf('<div class="lx-ex-ans weak"><p class="lx-eyebrow">Weak answer · Developing</p><p>Is community solar [1] good for people [2]?</p>') >= 0 &&
   exh.indexOf('<li value="1"><b>Falls short:</b> No type, no metric.</li>') >= 0 &&
   exh.indexOf('<li value="2"><b>Works:</b> A <span class="lx-term" data-term="counterfactual">counterfactual</span> of <b>equal cost</b>.</li>') >= 0 &&
   exh.indexOf("renters' energy burden [1]") > 0 && exh.indexOf("<th scope=\"row\">Framing</th><td>untyped</td>") >= 0,
   "exemplars: staticHTML gives both answers, their levels, numbered notes with lead words, marks and the difference table");
ok(EX.staticHTML({ answers: [{ key: "weak", label: "<b>", parts: [{ text: "a<b", note: "x" }] }, { key: "good", label: "G", parts: [{ text: "y", note: "z" }] }] }).indexOf("&lt;b&gt;") >= 0, "exemplars: staticHTML escapes text");

// ---------------------------------------------------------------- exemplars: view
(function () {
  const E = env({ store: { "kv": "{}" } }); load("exemplars", E);
  const host = E.LX.H("div", null, E.body); let opens = [];
  const ex = E.LX.Exemplars(host, Object.assign({ id: "t-ex", onOpen: (k, n) => opens.push(k + n), note: "Both are illustrative." }, exo));
  const marks = host.querySelectorAll(".lx-ex-mark"), notes = host.querySelectorAll("li.lx-ex-note");
  ok(host.querySelectorAll("section.lx-ex-ans").length === 2 && marks.length === 4 && notes.length === 4, "exemplars view: two answers, four marks, four notes");
  ok(marks.every(m => m.getAttribute("role") === "button" && m.getAttribute("tabindex") === "0" && m.getAttribute("aria-expanded") === "false"), "exemplars view: marks are keyboard buttons, shut");
  ok(marks.every(m => { const li = host.querySelector("#" + m.getAttribute("aria-controls")); return li && li.hidden; }), "exemplars view: each mark controls its hidden note");
  ok(marks[0].getAttribute("aria-label") === "community solar, note 1", "exemplars view: a mark's spoken name says its note number");
  marks[2].click();
  const live = host.querySelector("p.lx-sr");
  ok(!notes[2].hidden && marks[2].getAttribute("aria-expanded") === "true" && marks[2].classList.contains("on"), "exemplars view: a click opens the note");
  ok(live.textContent === "Strong answer, note 1: Works: A metric: the share of income spent on energy, in %.", "exemplars view: the opened note is read out");
  ok(opens.join() === "good1" && JSON.stringify(JSON.parse(E.store.kv || "{}")) === "{}" && JSON.parse(E.store["t-ex"]).good.join() === "1", "exemplars view: onOpen and browser storage");
  const e1 = marks[0].fire("keydown", { key: "Enter" });
  ok(!notes[0].hidden && e1.defaultPrevented, "exemplars view: Enter opens a note");
  marks[0].fire("keydown", { key: " " });
  ok(notes[0].hidden && marks[0].getAttribute("aria-expanded") === "false", "exemplars view: Space shuts it again");
  marks[1].fire("keydown", { key: "Tab" });
  ok(notes[1].hidden, "exemplars view: other keys do nothing");
  const count = host.querySelector(".lx-ex-count");
  ok(count.textContent === "1 of 4 notes open", "exemplars view: the count line");
  const all = buttons(host, /Show all notes/)[0]; all.click();
  ok(notes.every(n => !n.hidden) && all.textContent === "Hide the notes" && count.textContent === "4 of 4 notes open", "exemplars view: Show all notes opens every note");
  all.click();
  ok(notes.every(n => n.hidden) && all.textContent === "Show all notes", "exemplars view: Hide the notes shuts them");
  ex.open("weak", 2);
  ok(!notes[1].hidden && JSON.stringify(ex.opened()) === '{"weak":[2],"good":[]}', "exemplars view: open(key, n) and opened()");
  ok(host.querySelector("table.lx-ex-diff") && host.querySelectorAll(".lx-ex-diff td").length === 2 && host.querySelector(".lx-ex-diff td").getAttribute("data-label") === "Weak answer", "exemplars view: the difference table with labelled cells");
  // a second visit restores what was open
  const E2 = env({ store: { "t-ex": JSON.stringify({ weak: [2], good: [1, 2] }) } }); load("exemplars", E2);
  const h2 = E2.LX.H("div", null, E2.body); E2.LX.Exemplars(h2, Object.assign({ id: "t-ex" }, exo));
  ok(h2.querySelectorAll("li.lx-ex-note").filter(n => !n.hidden).length === 3 && h2.querySelector(".lx-ex-count").textContent === "3 of 4 notes open", "exemplars view: browser storage restores the open notes");
  let threw = false; try { E.LX.Exemplars(host, { answers: [exo.answers[0]] }); } catch (e) { threw = /two answers/.test(e.message); }
  ok(threw, "exemplars view: a malformed spec throws with the reason");
})();

// ---------------------------------------------------------------- rubric: pure, and the words of the course rubric
const RB = require(L("components/rubric.js"));
ok(RB.LEVELS.map(l => l.label).join() === "Not yet,Developing,Proficient,Strong" && RB.LEVELS.filter(l => l.bar).map(l => l.id).join() === "proficient", "rubric: four levels, Proficient is the bar");
ok(RB.COMPETENCES.map(c => c.id).join() === "framing,positioning,method,trust,uncertainty,accounting,realism,communication,integrity", "rubric: the nine competences in the curriculum's order");
const cur = PRIV.path("curriculum");
if (cur) {
  const md = fs.readFileSync(cur, "utf8"), sec = md.slice(md.indexOf("### 3.4 The rubric"), md.indexOf("## 4. Lines and depth"));
  const rows = sec.split("\n").filter(l => /^\| [A-Z]/.test(l) && !/^\| Competence/.test(l)).map(l => l.split("|").slice(1, -1).map(x => x.trim()));
  ok(rows.length === 9, "rubric: the course rubric has nine competence rows");
  rows.forEach((r, i) => {
    const C = RB.COMPETENCES[i];
    ok(C && C.label === r[0] && C.developing === r[1] && C.proficient === r[2] && C.strong === r[3] && C.builtIn === r[4], `rubric: ${r[0]} word for word as in the course rubric`);
  });
} else console.log("note: the course plan is not available (set LEARN_SOURCES); the rubric's words were not compared");
const fr = RB.competence({ id: "framing", look: "Your card's eight checks." });
ok(fr.text.developing === "Question vague or untyped; no audience or counterfactual." && fr.text["not-yet"] === "Developing is not reached yet." && fr.look === "Your card's eight checks.", "rubric: descriptions as sentences, Not yet, and the look line");
let bad = false; try { RB.competence("novelty"); } catch (e) { bad = /unknown competence "novelty"/.test(e.message); }
ok(bad, "rubric: an unknown competence throws");
const n1 = RB.count(["framing", "method", "trust"], { framing: "strong", method: "proficient", trust: "developing" });
ok(n1.rated === 3 && n1.atBar === 2 && !n1.all && RB.count(["framing"], { framing: "proficient" }).all && RB.count(["framing"], {}).rated === 0, "rubric: count of rated and at-the-bar competences");
const sum = RB.summary(["framing", "method"], { framing: "proficient" }, { code: "R1" });
ok(sum === "Learn · R1 self-check (the course rubric)\nFraming: Proficient — Typed question with audience or decision-maker, metric with units, counterfactual, scale and boundary; one falsification statement.\nMethod fit: not rated\n1 of 2 at Proficient or above; Proficient on every competence is the bar.", "rubric: the copied summary");
ok(RB.summary(["framing"], { framing: "strong" }).split("\n")[2] === "1 of 1 at Proficient or above: the bar for the readiness claim, on these competences.", "rubric: the summary when every competence reaches the bar");
const rbh = RB.staticHTML([{ id: "positioning", look: "At least <12> sources." }]);
ok(rbh.indexOf("<th scope=\"col\">Proficient (the bar)</th>") >= 0 && rbh.indexOf("Concept matrix of at least 12 sources; a stated gap with evidence.") >= 0 && rbh.indexOf("At least &lt;12&gt; sources.") >= 0 && rbh.indexOf('data-l="Strong"') >= 0, "rubric: staticHTML table with the bar, the words, an escaped look line and labelled cells");

// ---------------------------------------------------------------- rubric: view
(async function () {
  const E = env(); load("rubric", E);
  const host = E.LX.H("div", null, E.body); let changes = [];
  const rb = E.LX.Rubric(host, { id: "t-rb", code: "R3", title: "Rate it", competences: ["framing", { id: "method", look: "Two alternatives." }], onChange: p => changes.push(p) });
  const fss = host.querySelectorAll("fieldset.lx-rb-comp");
  ok(fss.length === 2 && fss.every(f => f.querySelectorAll("input").length === 4 && f.querySelector("legend")), "rubric view: a fieldset with a legend and four radios per competence");
  const r0 = fss[0].querySelectorAll("input"), labs = fss[0].querySelectorAll("label.lx-rb-level");
  ok(r0.every(i => i.getAttribute("type") === "radio" && i.getAttribute("name") === r0[0].getAttribute("name")) && fss[1].querySelector("input").getAttribute("name") !== r0[0].getAttribute("name"), "rubric view: one radio group per competence");
  ok(labs[2].textContent.indexOf("Proficientthe bar") === 0 && labs[2].textContent.indexOf("Typed question with audience") > 0 && labs[2].classList.contains("bar"), "rubric view: each label carries its level, the bar and the anchored description");
  ok(fss[1].querySelector(".lx-rb-look").innerHTML === "<b>Look for:</b> Two alternatives.", "rubric view: the look line");
  const res = host.querySelector(".lx-rb-result");
  ok(res.textContent === "Pick a level for each competence." && res.getAttribute("aria-live") === "polite", "rubric view: the result line starts empty and is live");
  r0[3].checked = true; r0[3].fire("change");
  ok(labs[3].classList.contains("on") && !labs[2].classList.contains("on") && res.textContent === "1 of 2 at Proficient or above; Proficient on every competence is the bar.", "rubric view: picking a level marks it and counts it");
  ok(JSON.parse(E.store["t-rb"]).framing === "strong" && changes.length === 1 && changes[0].framing === "strong" && changes[0].method === null, "rubric view: browser storage and onChange");
  rb.set("method", "proficient");
  ok(fss[1].querySelectorAll("input")[2].checked && rb.picks().method === "proficient" && /2 of 2 .*the bar for the readiness claim/.test(res.textContent) && changes.length === 1, "rubric view: set() picks without onChange");
  buttons(host, /Copy my self-check/)[0].click(); await tick();
  const box = host.querySelector(".lx-rb-copy"), area = box.querySelector("textarea");
  ok(!box.hidden && area.value.split("\n")[0] === "Learn · R3 self-check (the course rubric)" && /^Rated on \d{4}-\d{2}-\d{2}$/.test(area.value.split("\n").pop()), "rubric view: Copy shows the summary with the date");
  ok(box.querySelector("p").textContent === "Select the text and copy it.", "rubric view: without a clipboard it says to select and copy");
  buttons(host, /Clear my ratings/)[0].click();
  ok(rb.picks().framing === null && res.textContent === "Pick a level for each competence." && box.hidden && r0.every(i => !i.checked), "rubric view: Clear");
  const E2 = env({ store: { "t-rb": JSON.stringify({ framing: "developing", method: "bogus" }) } }); load("rubric", E2);
  const h2 = E2.LX.H("div", null, E2.body), rb2 = E2.LX.Rubric(h2, { id: "t-rb", competences: ["framing", "method"] });
  ok(rb2.picks().framing === "developing" && rb2.picks().method === null && h2.querySelectorAll("label.on").length === 1, "rubric view: storage restores valid picks only");
  ok(typeof E.LX.Rubric.summary === "function" && E.LX.Rubric.COMPETENCES.length === 9, "rubric view: the pure part on LX.Rubric");
})().then(questioncard);

// ---------------------------------------------------------------- question card
async function questioncard() {
  const QC = require(L("components/questioncard.js"));
  ok(QC.TYPES.map(t => t.id).join() === "descriptive,explanatory,evaluative,predictive,prescriptive" && QC.TYPES[4].template === "What should [decision-maker] do about … to achieve …, compared with …?", "question card: the course's five question types and templates");
  ok(QC.SCALES.map(s => s[0]).join() === "S0,S1,S2,S3,S4" && QC.CHECKS.length === 8, "question card: five scales, eight checks");
  const full = { type: "evaluative", question: "Did a rural co-op's community-solar programme lower renters' energy burden more than bill credits of the same cost would have?",
    audience: "the co-op's board", metric: "renters' energy burden", units: "% of household income", counterfactual: "bill credits of the same cost",
    scale: "S1", boundary: "the co-op's service area, 2019-2025; owners excluded", wrong: "burden fell no more for participants than for matched non-participants",
    uncertainty: "how well the matched households stand in for participants" };
  const c0 = QC.check({}), cf = QC.check(full);
  ok(c0.pass === 0 && c0.total === 8 && cf.all && cf.pass === 8, "question card: an empty card passes nothing; the question studio's example passes all eight");
  const noUnits = QC.check(Object.assign({}, full, { units: " " }));
  ok(!noUnits.items[3].ok && noUnits.items[3].why === "Give the metric's units." && noUnits.pass === 7, "question card: a metric without units warns about the units");
  ok(!QC.check(Object.assign({}, full, { question: "Community solar and renters." })).items[0].ok && !QC.check(Object.assign({}, full, { question: "Why?" })).items[0].ok, "question card: a question needs a question mark and a few words");
  // a draft that still holds a bracketed placeholder is not a written question
  const br = QC.check(Object.assign({}, full, { question: "Did community solar lower the energy burden for renters, compared with […]?" }));
  ok(!br.items[0].ok && br.items[0].why === "Replace the parts in brackets, such as […], with your own words." && br.pass === 7, "question card: a draft with […] fails the question check, and says why");
  ok(!QC.check(Object.assign({}, full, { question: "What should [decision-maker] do about heat pumps in the city?" })).items[0].ok, "question card: any bracketed placeholder fails, such as [decision-maker]");
  ok(QC.FIELDS.filter(f => f.key === "audience")[0].hint === "Who would use the answer, and who it affects: a co-op board, a regulator or a city council; low-income renters, farmers…", "question card: the audience hint names users and an affected group");
  ok(QC.check(Object.assign({}, full, { scale: "S9" })).items[5].why === "Pick a scale." && QC.check(Object.assign({}, full, { boundary: "" })).items[5].why === "Say what is inside the study and what is left out.", "question card: scale and boundary warn separately");
  const cl = QC.clean({ type: "novel", scale: "S7", question: "x".repeat(700), extra: "dropped" });
  ok(cl.type === "" && cl.scale === "" && cl.question.length === 600 && !("extra" in cl), "question card: clean() keeps known fields, list values and a length cap");
  const tx = QC.text(full, { code: "R10" }).split("\n");
  ok(tx[0] === "Learn · R10 question card" && tx[2] === "Type: Evaluative (Did … achieve …, compared with …?)" && tx[4] === "Metric: renters' energy burden (units: % of household income)" &&
     tx[6] === "Scale: S1 microgrid and community; boundary: the co-op's service area, 2019-2025; owners excluded" && tx[9] === "Parts filled in: 8 of 8.", "question card: the card as text");
  ok(QC.text({}).split("\n")[1] === "Question: (not yet)" && /^Parts filled in: 0 of 8; to do: the question is written/.test(QC.text({}).split("\n")[9]), "question card: an empty card as text lists what is to do");
  const uni = Object.assign({}, full, { wrong: "CO₂ fell “anyway” — café émissions 中文" }), h = QC.encode(uni);
  ok(/^q-[A-Za-z0-9_-]+$/.test(h) && JSON.stringify(QC.decode("#" + h)) === JSON.stringify(QC.clean(uni)) && JSON.stringify(QC.decode(h)) === JSON.stringify(QC.clean(uni)), "question card: a name-safe link round trip, with non-ASCII text");
  ok(QC.decode("#q-%%%") === null && QC.decode("#plan-w1") === null && QC.decode("q-" + Buffer.from("[1,2]").toString("base64url")) !== null && QC.decode("q-" + Buffer.from("{oops").toString("base64url")) === null,
     "question card: bad links decode to null");
  ok(QC.encode({ question: "a" }) === "q-" + Buffer.from(JSON.stringify({ q: "a" })).toString("base64url"), "question card: the link is base64url of the short-key JSON");
  const evil = QC.decode("q-" + Buffer.from(JSON.stringify({ q: "<img src=x onerror=alert(1)>", t: "evaluative", s: "S2" })).toString("base64url"));
  ok(evil.question === "<img src=x onerror=alert(1)>" && evil.type === "evaluative" && evil.scale === "S2", "question card: link text stays text (the view puts it in form fields, never in HTML)");

  // view
  const E = env(); load("questioncard", E); load("share", E);
  const host = E.LX.H("div", null, E.body); let last = null;
  const qc = E.LX.QuestionCard(host, { id: "t-qc", code: "R1", title: "Your card", values: { question: "Is solar good for renters?" }, share: true,
    fix: { metric: { href: "a01-cost-benefit.html", label: "A1" } }, onChange: (v, c) => { last = c; } });
  const inputs = host.querySelectorAll("input"), labels = host.querySelectorAll("label");
  const textIds = host.querySelector(".lx-qc-form").querySelectorAll("input[type=\"text\"], textarea").map(i => i.id);
  ok(textIds.length === 8 && textIds.every(id => labels.some(l => l.getAttribute("for") === id)), "question card view: every text field has a label");
  ok(host.querySelectorAll("input[type=\"radio\"]").length === 5 && host.querySelector("fieldset.lx-qc-types legend").textContent === "Type of question", "question card view: the type is a labelled radio group of five");
  ok(host.querySelector("select").querySelectorAll("option").length === 6, "question card view: the scale picker");
  const q = host.querySelector("textarea");
  ok(q.value === "Is solar good for renters?" && host.querySelector(".lx-qc-ckhead").textContent === "1 of 8 parts filled in: the rest are marked to do.", "question card view: starts from the given values, with its checks");
  ok(host.querySelector(".lx-qc-checks .lx-hint").textContent === "The checks only see which parts are filled in, not how good they are: rate that against the rubric. They never judge whether a question is new or important." && !/rigour only/.test(fs.readFileSync(path.join(SITE, "assets/learn/components/questioncard.js"), "utf8")), "question card view: the note says the checks see only which parts are filled in");
  const warnMetric = host.querySelectorAll(".lx-qc-cklist li")[3];
  ok(warnMetric.classList.contains("warn") && /To do: /.test(warnMetric.innerHTML) && warnMetric.innerHTML.indexOf('<a href="a01-cost-benefit.html">See A1.</a>') > 0 && warnMetric.innerHTML.indexOf('data-icon="question"') >= 0,
     "question card view: a warning in words, with an icon and its fix link");
  const radio = host.querySelectorAll("input[type=\"radio\"]")[2]; radio.checked = true; radio.fire("change");
  ok(host.querySelector(".lx-qc-tinfo").innerHTML.indexOf("<b>Template:</b> Did … achieve …, compared with …?") === 0 && radio.parentNode.classList.contains("on") && last.pass === 2, "question card view: picking a type shows its template and passes its check");
  const metric = host.querySelectorAll(".f-metric input")[0]; metric.value = "energy burden"; metric.fire("input");
  ok(!last.items[3].ok && last.items[3].why === "Give the metric's units.", "question card view: typing updates the checks");
  qc.set(full);
  ok(q.value === full.question && host.querySelector("select").value === "S1" && last.all && host.querySelectorAll(".lx-qc-cklist li.ok").length === 8, "question card view: set() fills every field");
  ok(JSON.parse(E.store["t-qc"]).audience === "the co-op's board" && qc.get().units === "% of household income" && qc.text().split("\n")[0] === "Learn · R1 question card", "question card view: storage, get() and text()");
  buttons(host, /Copy as text/)[0].click(); await tick();
  const cb = host.querySelector(".lx-qc-copy");
  ok(!cb.hidden && cb.querySelector("textarea").value === QC.text(full, { code: "R1" }) && cb.querySelector("p").textContent === "Select the text and copy it.", "question card view: Copy as text");
  ok(buttons(host, /Share this card/).length === 1 && qc.share && /#q-[A-Za-z0-9_-]+$/.test(qc.share.url()), "question card view: the share button builds a #q- link");
  // a link wins over the stored draft and the starting values
  const E2 = env({ hash: "#" + QC.encode({ question: "Why did heating demand fall?", type: "explanatory" }), store: { "t-qc": JSON.stringify({ question: "stored" }) } }); load("questioncard", E2);
  const h2 = E2.LX.H("div", null, E2.body), q2 = E2.LX.QuestionCard(h2, { id: "t-qc", values: { question: "given" } });
  ok(q2.get().question === "Why did heating demand fall?" && q2.get().type === "explanatory" && /came with the link/.test(h2.querySelector("p.lx-hint").textContent), "question card view: a #q- link opens its card");
  const E3 = env({ store: { "t-qc": JSON.stringify({ question: "stored?" }) } }); load("questioncard", E3);
  ok(E3.LX.QuestionCard(E3.LX.H("div", null, E3.body), { id: "t-qc", values: { question: "given" } }).get().question === "stored?", "question card view: a stored draft wins over the starting values");
  timeline();
}

// ---------------------------------------------------------------- timeline
function timeline() {
  const TL = require(L("components/timeline.js"));
  ok(JSON.stringify(TL.parse("2023-05-14")) === JSON.stringify({ y: 2023, m: 5, d: 14, p: "day", t: 20230514 }) && TL.parse("2023").p === "year" && TL.parse("2023-05").p === "month", "timeline: parse() at three precisions");
  ok(TL.parse("2023-02-30") === null && TL.parse("2024-02-29") !== null && TL.parse("2023-13") === null && TL.parse("May 2023") === null && TL.parse("") === null, "timeline: parse() refuses impossible dates and other forms");
  ok(TL.fmt("2023") === "2023" && TL.fmt("2023-05") === "May 2023" && TL.fmt("2023-05-04") === "4 May 2023", "timeline: fmt()");
  ok(TL.gap("2023-05", "2024-07") === "14 months later" && TL.gap("2023-05", "2023-06") === "1 month later" && TL.gap("2023-05", "2023-05") === "the same month" &&
     TL.gap("2019-01", "2023-06") === "about 4 years later" && TL.gap("2019", "2023-06") === "4 years later" && TL.gap("2023", "2024") === "1 year later" &&
     TL.gap("2025-04-28", "2025-04-29") === "1 day later" && TL.gap("2025-04-28", "2025-05-30") === "32 days later" && TL.gap("2025-04-28", "2025-06-10") === "2 months later" && TL.gap("2025-04-28", "2025-04-28") === "the same day" &&
     TL.gap("2025-04-28", "2025-07-01") === "3 months later" && TL.gap("2023-05", "bad") === "", "timeline: gap() in days, months or years, at the coarser precision");
  const evs = [
    { date: "2025-06", label: "Paper published", kind: "study", key: true, source: { label: "Journal", url: "https://doi.org/10.0000/x" } },
    { date: "2023", label: "Data year", kind: "data", text: "Hourly [[load|load]] from **EIA-930**.", source: [{ label: "EIA-930", url: "https://www.eia.gov/electricity/gridmonitor/", as_of: "2025-11-01" }, { label: "Utility report" }] },
    { date: "2024-01-15", label: "Model built", source: { label: "Repository" }, deeper: "The repository's first release." }];
  ok(TL.sortEvents(evs).map(e => e.label).join() === "Data year,Model built,Paper published" && TL.sortEvents(evs, "desc")[0].label === "Paper published", "timeline: events sorted by date, either way");
  ok(TL.sortEvents([{ date: "2023", label: "a" }, { date: "2023", label: "b" }]).map(e => e.label).join() === "a,b", "timeline: equal dates keep their order");
  ok(TL.validate(evs).length === 0, "timeline: well-formed events pass validate()");
  const vb = TL.validate([{ date: "May 2023", label: "x", source: { label: "s" } }, { date: "2023", source: { label: "s", url: "ftp://x" } }, { date: "2023", label: "y" }, { date: "2023", label: "z", kind: "rumour", source: { label: "s", as_of: "soon" } }]);
  ok(vb.some(p => /date "May 2023"/.test(p)) && vb.some(p => /no label/.test(p)) && vb.some(p => /not http/.test(p)) && vb.some(p => /no source/.test(p)) && vb.some(p => /unknown kind rumour/.test(p)) && vb.some(p => /as_of "soon"/.test(p)), "timeline: validate() names each problem");
  const st = TL.staticHTML(evs);
  ok(st.indexOf('<ol class="lx-tl-static"><li><b>2023</b> · Data year. Hourly <span class="lx-term" data-term="load">load</span> from <b>EIA-930</b>. <span class="lx-hint">Source: <a href="https://www.eia.gov/electricity/gridmonitor/">EIA-930</a>, as of 1 November 2025; Utility report</span></li>') === 0, "timeline: staticHTML, in date order, with sources");
  const E = env(); load("timeline", E);
  const host = E.LX.H("div", null, E.body), tl = E.LX.Timeline(host, { title: "The study in time", events: evs, note: "Dates as published." });
  const lis = host.querySelectorAll("li.lx-tl-ev");
  ok(host.querySelector("ol.lx-tl-list").getAttribute("aria-label") === "The study in time" && lis.length === 3 && tl.events[0].label === "Data year", "timeline view: an ordered list, sorted");
  ok(lis[0].querySelector("time").getAttribute("datetime") === "2023" && lis[2].querySelector("time").textContent === "June 2025", "timeline view: <time datetime> and readable dates");
  ok(!lis[0].querySelector(".lx-tl-gap") && lis[1].querySelector(".lx-tl-gap").textContent === "1 year later" && lis[2].querySelector(".lx-tl-gap").textContent === "17 months later", "timeline view: the time between events");
  ok(lis[0].querySelector(".lx-tl-kind").textContent === "Data" && lis[1].querySelector(".lx-tl-kind").textContent === "Event" && lis[2].classList.contains("key") && lis[2].querySelector(".lx-tl-keytag").textContent === "Key step",
     "timeline view: kinds and key steps in words, not colour alone");
  ok(lis[0].querySelector(".lx-tl-src").innerHTML === 'Source: <a href="https://www.eia.gov/electricity/gridmonitor/">EIA-930</a>, as of 1 November 2025; Utility report' && lis[0].querySelector(".lx-tl-text").innerHTML.indexOf('data-term="load"') > 0, "timeline view: sources as links, glossary marks in text");
  ok(lis[1].querySelector("details.lx-tl-more summary").textContent === "More", "timeline view: optional longer text in a details box");
  const d = E.LX.H("div", null, E.body); E.LX.Timeline(d, { events: evs, order: "desc", gaps: true });
  ok(d.querySelectorAll(".lx-tl-gap")[0].textContent === "17 months earlier" && !d.querySelector("header"), "timeline view: newest first counts back");
  let threw = false; try { E.LX.Timeline(d, { events: [{ date: "x" }] }); } catch (e) { threw = /LX.Timeline: event 1/.test(e.message); }
  ok(threw, "timeline view: malformed events throw with the reason");
  engine();
}
// ---------------------------------------------------------------- the planning engine (planengine.js), shared by lessons 12 and 13
function engine() {
  const src = fs.readFileSync(L("components/planengine.js"), "utf8"), css = fs.readFileSync(L("components/planengine.css"), "utf8");
  const t13 = fs.readFileSync(L("13-capstone.js"), "utf8"), t12 = fs.readFileSync(L("12-trade-offs.js"), "utf8");
  ok(src.split("\n")[0].indexOf("/* planengine.js — LX.townPlan") === 0 && css.split("\n")[0].indexOf("/* planengine.css — ") === 0, "planengine: header comments");
  ok(!/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && !/#[0-9a-fA-F]{6}\b|rgba?\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "planengine: colours from --lx-* tokens only");
  ok(bundleJS.indexOf(src.trim().slice(0, 200)) >= 0 && bundleCSS.indexOf(css.trim().slice(0, 200)) >= 0, "planengine: in the generated bundle");
  const E = require(L("components/planengine.js"));
  ["prepareYear", "selectWeeks", "costs", "build", "weekModel", "fullYearModel", "periodsOf", "summarize", "encodePlan", "decodePlan", "frontierAt", "fullVerdict"].forEach(k =>
    ok(typeof E[k] === "function", `planengine: exports ${k}`));
  ok(require(L("13-capstone.js")) === E, "planengine: require(\"13-capstone.js\") gives the same engine (older callers)");
  const ctx = { window: { LX: { H: () => ({}) } }, module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  const ui = ctx.window.LX.townPlan && ctx.window.LX.townPlan.ui;
  ok(ctx.window.LX.townPlan && ui && ["TextTable", "Num", "css", "fm", "TECH"].every(k => k in ui) && ui.fm.musd(129.3e6) === "$129.3M" && ui.fm.kt(200000) === "200 kt",
     "planengine: LX.townPlan and its page kit (TextTable, Num, css, fm, TECH) in the browser");
  ok(!/function (weekModel|fullYearModel|selectWeeks|summarize|prepareYear|TextTable|Num)\s*\(/.test(t13) && /require\("\.\/components\/planengine\.js"\)/.test(t13) && !/lx13-css/.test(t13),
     "lesson 13 keeps no copy of the engine, its page kit or its injected styles");
  ok(!/<script[^>]*13-capstone\.js/.test(fs.readFileSync(path.join(SITE, "learn/12-trade-offs.qmd"), "utf8")) && !/13-capstone\.js(?!on)/.test(t12.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")),
     "lesson 12 no longer loads 13-capstone.js");
  ["lx13-card", "lx13-stage", "lx13-head", "lx13-sub", "lx13-tt"].forEach(c => ok(css.indexOf("." + c) >= 0, `planengine.css styles .${c} (used by lessons 12 and 13)`));
  finish();
}
function finish() {
  console.log(`${checks - fails} of ${checks} checks pass`);
  process.exit(fails ? 1 : 0);
}
