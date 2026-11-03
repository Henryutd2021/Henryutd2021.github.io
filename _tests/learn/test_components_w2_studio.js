// test_components_w2_studio.js — Node tests for the studio pieces promoted at the W2 integration (2026-11-03):
//   - LX.lessonRef and LX.lessonRefHTML (core.js): a lesson linked when data/path.json marks it live, named "upcoming"
//     otherwise; R1, R3 and R10 use them and keep no copy
//   - LX.ScaleStrip (scalestrip.js/.css, e-scale-strip): the pure part, and the view on a stub document in F1's use (power,
//     the flow chips, the reader's ticks, lessons per scale from path.json) and R3's (who decides, step and horizon, one
//     scale marked, one colour); the scale palette --lx-scale-0 ... 4; F1 and R3 keep no copy
//   - LX.Exemplars' `lines` option (the answers' line breaks kept, in the view and in staticHTML); R1 and R10 use it and
//     keep no page or injected style for it
//   - LX.QuestionCard applies a shared #q- link once (stored as the draft, the hash dropped), so a card built again shows
//     the reader's edits; a hash the page wrote itself is not applied; R10 keeps no workaround
//   - LX.CompareTable's `caption` without sorts
//   - the studio template and every live studio show the task to readers with JavaScript (a task card above the
//     interactive, outside its fallback; R5 draws its own); .lx-studio-brief lives in forms.css, not in page styles
//   - no Researcher or Foundations hub page names a live lesson as "upcoming"
// Usage (from the site folder):  node _tests/learn/test_components_w2_studio.js
"use strict";
const fs = require("fs");
const path = require("path");
const { env, load, buttons } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const P = JSON.parse(rd("assets/learn/data/path.json"));
const bundleJS = rd("assets/learn/learn.js"), bundleCSS = rd("assets/learn/learn.css");
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------- core.js: lessonRef, lessonRefHTML
const CORE = require(L("components/core.js"));
{
  const all = [].concat(P.starter, P.more, P.toolbox);
  const live = all.filter(l => l.code && l.ready && l.href), soon = all.filter(l => l.code && !l.ready);
  ok(typeof CORE.lessonRef === "function" && typeof CORE.lessonRefHTML === "function", "core.js exports lessonRef and lessonRefHTML to Node");
  ok(JSON.stringify(CORE.lessonRef(P, 3)) === JSON.stringify({ href: "03-balancing.html", ready: true, label: "lesson 3" }), "lessonRef: a starter lesson by number");
  ok(live.every(l => { const r = CORE.lessonRef(P, l.code); return r.ready && r.href === l.href && r.label === l.code; }), `lessonRef: every live code (${live.length}) links to its page`);
  ok(soon.length > 0 && soon.every(l => !CORE.lessonRef(P, l.code).ready), `lessonRef: every upcoming code (${soon.length}) is not ready`);
  ok(CORE.lessonRefHTML(P, "R2") === '<a href="r02-literature.html">R2</a>' && CORE.lessonRefHTML(P, "M5") === "M5 (upcoming)" && CORE.lessonRefHTML(P, 0) === '<a href="00-grid-operator.html">lesson 0</a>',
    "lessonRefHTML: a link when live, the label and (upcoming) otherwise");
  ok(JSON.stringify(CORE.lessonRef(null, "R2")) === JSON.stringify({ href: null, ready: false, label: "R2" }) && CORE.lessonRef(P, "Z9").ready === false && CORE.lessonRefHTML(undefined, 7) === "lesson 7 (upcoming)",
    "lessonRef: without path.json, or for an unknown code, nothing is linked");
  const fake = { more: [{ code: "X1", ready: true, href: null }, { code: "X<2>", ready: true, href: 'a"b.html' }] };
  ok(!CORE.lessonRef(fake, "X1").ready && CORE.lessonRefHTML(fake, "X<2>") === '<a href="a&quot;b.html">X&lt;2&gt;</a>', "lessonRef: a ready lesson without a page is not linked; the HTML is escaped");
  ok(/LX\.lessonRef = lessonRef;/.test(bundleJS) && /LX\.lessonRefHTML = lessonRefHTML;/.test(bundleJS), "the bundle defines LX.lessonRef and LX.lessonRefHTML");
  ["r01-framing", "r03-system-and-method", "r10-question-studio"].forEach(f => {
    const js = rd("assets/learn/" + f + ".js"), M = require(L(f + ".js"));
    ok(!/function ref(HTML)?\s*\(/.test(js) && !("ref" in M) && !("refHTML" in M), `${f}: keeps no copy of the lesson-link helper`);
  });
  ok(/LX\.lessonRef\(P, "R3"\)/.test(rd("assets/learn/r01-framing.js")) && /LX\.lessonRefHTML\(P, c\)/.test(rd("assets/learn/r10-question-studio.js")), "R1 and R10 link lessons through LX.lessonRef");
}

// ---------------------------------------------------------------- scale strip: pure
const SS = require(L("components/scalestrip.js"));
const F1 = JSON.parse(rd("assets/learn/data/f01-five-scales.json")), R3 = JSON.parse(rd("assets/learn/data/r03-system-and-method.json"));
{
  ok(["S0", "S1", "S2", "S3", "S4"].map(SS.scaleIndex).join() === "0,1,2,3,4" && SS.scaleIndex("S5") === -1 && SS.scaleIndex("x") === -1, "scaleIndex: S0 to S4");
  ok(SS.colorOf({ id: "S3" }) === "var(--lx-scale-3)" && SS.colorOf({ id: "S3" }, "var(--lx-tier-4)") === "var(--lx-tier-4)" && SS.colorOf({ id: "Q" }) === "var(--lx-ink-3)", "colorOf: the scale's token, or one colour for all");
  const lp = SS.lessonParts([{ code: 1 }, { code: "M2", note: "unit commitment" }, { code: "M5", note: "a microgrid" }, { code: "C4" }, { href: "x.html", label: "X" }], P, CORE.lessonRef);
  ok(JSON.stringify(lp.live) === JSON.stringify([{ href: "01-power-energy.html", label: "lesson 1" }, { href: "m02-unit-commitment.html", label: "M2" }, { href: "x.html", label: "X" }]) &&
     lp.upcoming.join("|") === "M5 (a microgrid)|C4", "lessonParts: live lessons linked (their note dropped), the rest named with their note, explicit links kept");
  ok(SS.lessonParts([{ code: "R2", note: "n" }]).upcoming[0] === "R2 (n)" && SS.lessonParts(undefined, P, CORE.lessonRef).live.length === 0, "lessonParts: without lessonRef nothing is linked; no list, no parts");
  ok(SS.tickSummary(F1.scales.slice(0, 2), { S0: { who: true, what: false } }) === "Your sorts, scale by scale: S0 who right, what elsewhere, physics not sorted; S1 who not sorted, what not sorted, physics not sorted.", "tickSummary: one sentence for screen readers");
  ok(SS.TICKS.map(t => t[0]).join() === "who,what,physics", "ticks: who, what, physics by default");
}

// ---------------------------------------------------------------- scale strip: view (F1's use, then R3's)
{
  const E = env(); E.LX.lessonRef = CORE.lessonRef; load("scalestrip", E);
  ok(typeof E.LX.ScaleStrip === "function" && typeof E.LX.ScaleStrip.lessonParts === "function", "LX.ScaleStrip, with its pure part on it");
  const host = E.LX.H("div", null, E.body);
  const ticks = { S0: { who: true, what: false, physics: null }, S2: { who: true, what: true, physics: true } };
  const ss = E.LX.ScaleStrip(host, { title: "Five scales at a glance", lede: "Each scale has its own [[system-scale|decision makers]].", scales: F1.scales, power: true, flow: true,
    ticks: ticks, lessons: F1.lessons, path: P });
  const lis = host.querySelectorAll("ol.lx-ss-strip li");
  ok(host.querySelector(".lx-x-head h3").textContent === "Five scales at a glance" && host.querySelector("p.lx-lede").innerHTML.indexOf('data-term="system-scale"') > 0, "view: title and lede with glossary marks");
  ok(lis.length === 5 && lis.every((li, i) => li.getAttribute("style") === "--c:var(--lx-scale-" + i + ")"), "view: five cards, each edged in its scale's colour");
  ok(lis[0].querySelector(".lx-ss-code").textContent === "S0" && lis[0].querySelector(".lx-ss-pw").textContent === F1.scales[0].power && lis[0].querySelector(".lx-ss-name").textContent === F1.scales[0].name &&
     lis[0].querySelector(".lx-ss-who").textContent === F1.scales[0].who, "view (F1): code, power range, name and who decides");
  const flow = host.querySelector(".lx-ss-flow");
  ok(flow && flow.getAttribute("aria-hidden") === "true" && /Passed down: prices, tariffs, limits, targets/.test(flow.textContent) && /Passed up: load profiles/.test(flow.textContent), "view (F1): what passes down and up (decorative; the lede says it)");
  const t0 = lis[0].querySelectorAll(".lx-ss-tick");
  ok(t0.map(t => t.className.split(" ")[1]).join() === "ok,no,na" && t0[0].getAttribute("title") === "Who: placed right" && t0[1].getAttribute("title") === "What: placed elsewhere" &&
     t0[2].getAttribute("title") === "Physics: not sorted yet" && t0[0].innerHTML.indexOf('data-icon="check"') >= 0 && t0[1].innerHTML.indexOf('data-icon="cross"') >= 0, "view (F1): ticks in words and icons, not colour alone");
  const sr = host.querySelector("p.lx-sr");
  ok(!sr.hidden && sr.textContent === SS.tickSummary(F1.scales, ticks), "view (F1): the sorts summed up for screen readers");
  const les2 = lis[2].querySelector(".lx-ss-les"), links2 = les2.querySelectorAll("a");
  ok(links2.map(a => a.getAttribute("href")).join() === "00-grid-operator.html,03-balancing.html,08-merit-order.html,m01-dispatch-to-lmp.html,m02-unit-commitment.html" &&
     /; upcoming: C2 \(the Plains Grid in a hard year\)$/.test(les2.textContent), "view (F1): S2's lessons, M2 linked now that it is live, C2 still upcoming");
  ok(lis[1].querySelector(".lx-ss-les").textContent === "Go further: upcoming: F7 (microgrids), M5 (size and run a microgrid), C1 (keep the campus running)", "view (F1): a scale with no live lesson yet");
  ok(!host.querySelector(".is-marked") && !host.querySelector(".lx-ss-line"), "view (F1): no mark, no step lines unless asked");
  ss.update({ ticks: { S0: { who: false } } });
  ok(host.querySelectorAll("ol.lx-ss-strip li").length === 5 && host.querySelectorAll(".lx-ss-tick.no").length === 1 && /S0 who elsewhere/.test(host.querySelector("p.lx-sr").textContent), "view: update() redraws with new ticks");

  const h3 = E.LX.H("div", null, E.body);
  const r3 = E.LX.ScaleStrip(h3, { title: "Five scales: who decides, and typical steps and horizons", scales: R3.scales, decides: true, steps: true, color: "var(--lx-tier-4)",
    mark: "S1", markText: "Your brief sits here (you placed it at S2)." });
  const l3 = h3.querySelectorAll("ol.lx-ss-strip li"), s1 = R3.scales[1];
  ok(l3.length === 5 && l3.every(li => li.getAttribute("style") === "--c:var(--lx-tier-4)"), "view (R3): one colour for every card");
  ok(l3[1].querySelector(".lx-ss-who").textContent === "Decides " + s1.decides + "; " + s1.who + "." &&
     l3[1].querySelectorAll(".lx-ss-line").map(x => x.textContent).join("|") === "Time step: " + s1.step + ".|Horizon: " + s1.horizon + ".", "view (R3): who decides what, the typical time step and horizon");
  ok(l3[1].classList.contains("is-marked") && l3[1].querySelector(".lx-ss-tag").textContent === "Your brief sits here (you placed it at S2)." && h3.querySelectorAll(".is-marked").length === 1, "view (R3): the reader's brief marked, in words");
  ok(!h3.querySelector(".lx-ss-flow") && !h3.querySelector(".lx-ss-tick") && !h3.querySelector(".lx-ss-pw") && !h3.querySelector(".lx-ss-les") && h3.querySelector("p.lx-sr").hidden, "view (R3): no flow chips, ticks, power or lessons unless asked");
  r3.update({ mark: "S3", markText: "Your brief sits here." });
  const l3b = h3.querySelectorAll("ol.lx-ss-strip li");
  ok(!l3b[1].classList.contains("is-marked") && l3b[3].classList.contains("is-marked") && l3b[3].querySelector(".lx-ss-tag").textContent === "Your brief sits here.", "view (R3): update() moves the mark");
  r3.update({ mark: null });
  ok(!h3.querySelector(".is-marked") && !h3.querySelector(".lx-ss-tag"), "view (R3): no brief chosen, no mark");
}

// ---------------------------------------------------------------- scale strip: files, palette, users
{
  const js = rd("assets/learn/components/scalestrip.js"), css = rd("assets/learn/components/scalestrip.css");
  ok(js.split("\n")[0].indexOf("/* scalestrip.js — LX.ScaleStrip") === 0 && css.split("\n")[0].indexOf("/* scalestrip.css — ") === 0, "scalestrip: header comments");
  ok(!/#[0-9a-fA-F]{6}\b|rgba?\(/.test(noComments(js)), "scalestrip.js: no hard-coded colours");
  const cssBody = noComments(css), tokenLines = cssBody.split("\n").filter(l => /--lx-scale-0:/.test(l));
  ok(tokenLines.length === 2 && /^body\.page-learn \{/.test(tokenLines[0]) && /^body\.page-learn\.quarto-dark \{/.test(tokenLines[1]) && tokenLines.every(l => [0, 1, 2, 3, 4].every(i => new RegExp("--lx-scale-" + i + ": #[0-9A-F]{6};").test(l))),
    "scalestrip.css: the scale palette --lx-scale-0 ... 4, day and night");
  ok(!/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(cssBody.split("\n").filter(l => !/--lx-scale-0:/.test(l)).join("\n")), "scalestrip.css: every other colour from tokens");
  ok(bundleJS.indexOf(js.split("\n")[0]) >= 0 && /LX\.ScaleStrip = function/.test(bundleJS) && bundleCSS.indexOf(css.split("\n")[0]) >= 0 && bundleCSS.indexOf("--lx-scale-4: #6A3F9E") >= 0, "scalestrip: in the generated bundle");
  const f1 = rd("assets/learn/f01-five-scales.js"), f1q = rd("learn/f01-five-scales.qmd"), r3 = rd("assets/learn/r03-system-and-method.js");
  ok(/LX\.ScaleStrip\(c1, \{/.test(f1) && !/function ScaleStrip/.test(f1) && !/f1s-|--f1-s\d/.test(f1 + f1q), "F1 uses LX.ScaleStrip and the shared palette; no copy, no --f1-s tokens");
  ok(/LX\.ScaleStrip\(/.test(r3) && /strip\.update\(stripMark\(\)\)/.test(r3) && !/r3-strip/.test(r3), "R3 uses LX.ScaleStrip (its brief marked through update) and keeps no copy");
  ok(!/<style>[\s\S]*?\.lx-ss-/.test(f1q + rd("learn/r03-system-and-method.qmd")), "no page restyles the strip");
}

// ---------------------------------------------------------------- exemplars: lines
{
  const EX = require(L("components/exemplars.js"));
  const ex = { answers: [{ key: "weak", label: "Weak", parts: ["Question: x?\nType: ", { text: "none", note: "No type." }] }, { key: "good", label: "Strong", parts: ["Question: y?\nType: ", { text: "evaluative", note: "Typed." }] }] };
  ok(EX.staticHTML(Object.assign({ lines: true }, ex)).indexOf('<p class="lx-ex-lines">Question: x?\nType: none [1]</p>') > 0 && EX.staticHTML(ex).indexOf("<p>Question: x?\nType: none [1]</p>") > 0, "exemplars: staticHTML keeps line breaks with lines: true, plain <p> without");
  const E = env(); load("exemplars", E);
  const h = E.LX.H("div", null, E.body); E.LX.Exemplars(h, Object.assign({ lines: true }, ex));
  const h2 = E.LX.H("div", null, E.body); E.LX.Exemplars(h2, ex);
  ok(h.querySelectorAll("p.lx-ex-text").every(p => p.classList.contains("lx-ex-lines")) && h2.querySelectorAll("p.lx-ex-text").every(p => !p.classList.contains("lx-ex-lines")), "exemplars view: the answer's text keeps line breaks only with lines: true");
  ok(/\.lx-ex-lines \{ white-space: pre-line; \}/.test(rd("assets/learn/components/exemplars.css")) && bundleCSS.indexOf(".lx-ex-lines { white-space: pre-line; }") >= 0, "exemplars.css: .lx-ex-lines keeps line breaks (bundled)");
  [["r01-framing", "r01-exemplars"], ["r10-question-studio", "r10-exemplars"]].forEach(([f, id]) => {
    const D = JSON.parse(rd("assets/learn/data/" + f + ".json")), js = rd("assets/learn/" + f + ".js"), q = rd("learn/" + f + ".qmd");
    ok(D.exemplars.lines === true && (q.match(/<p class="lx-ex-lines">/g) || []).length === 2, `${f}: exemplars with lines: true, in the view and the no-JS block`);
    ok(!/white-space\s*:\s*pre-line/.test(js) && !/white-space\s*:\s*pre-line/.test(q) && q.indexOf("#" + id + " .lx-ex") < 0, `${f}: no page or injected style for the exemplars' line breaks`);
  });
}

// ---------------------------------------------------------------- question card: a link is applied once
(async function () {
  const QC = require(L("components/questioncard.js"));
  const link = { question: "Why did heating demand fall?", type: "explanatory" };
  // the link opens its card, becomes the draft and leaves the address
  const E = env({ hash: "#" + QC.encode(link), store: { "t-qc": JSON.stringify({ question: "an older draft?" }) } }); load("questioncard", E); load("share", E);
  const urls = []; E.window.history = { state: null, replaceState: (st, t, u) => { urls.push(u); E.location.hash = ""; E.location.href = u; } };
  const h1 = E.LX.H("div", null, E.body), q1 = E.LX.QuestionCard(h1, { id: "t-qc", share: true });
  ok(q1.get().question === link.question && q1.get().type === "explanatory" && /came with the link/.test(h1.querySelector("p.lx-hint").textContent), "question card: a #q- link opens its card, over an older draft");
  ok(JSON.parse(E.store["t-qc"]).question === link.question && urls.length === 1 && urls[0] === "https://example.org/learn/x.html" && E.location.hash === "", "question card: the link's card is kept as the draft and the hash leaves the address");
  const ta = h1.querySelector("textarea"); ta.value = "Why did heating demand fall more in some homes?"; ta.fire("input");
  // the page builds the card again (a step card after Back and Next): the reader's edit, not the link's card
  const h2 = E.LX.H("div", null, E.body), q2 = E.LX.QuestionCard(h2, { id: "t-qc", share: true });
  ok(q2.get().question === "Why did heating demand fall more in some homes?" && q2.get().type === "explanatory" && !/came with the link/.test(h2.textContent) && urls.length === 1, "question card: built again, it shows the reader's edit");
  // where the address cannot be changed, the link is still applied only once
  const E2 = env({ hash: "#" + QC.encode(link) }); load("questioncard", E2);
  const a = E2.LX.QuestionCard(E2.LX.H("div", null, E2.body), { id: "t-qc" });
  const ta2 = a.el.querySelector("textarea"); ta2.value = "My own question?"; ta2.fire("input");
  ok(E2.location.hash !== "" && E2.LX.QuestionCard(E2.LX.H("div", null, E2.body), { id: "t-qc" }).get().question === "My own question?", "question card: with the hash still in the address, a second card keeps the edit");
  // a hash this page wrote itself ("Share this card") is not applied over later edits
  const E3 = env({ store: { "t-qc": JSON.stringify({ question: "Mine?" }) } }); load("questioncard", E3); load("share", E3);
  const c3 = E3.LX.QuestionCard(E3.LX.H("div", null, E3.body), { id: "t-qc", share: true });
  const shared = c3.share.url(); E3.location.hash = shared.slice(shared.indexOf("#"));
  const ta3 = c3.el.querySelector("textarea"); ta3.value = "Mine, edited after sharing?"; ta3.fire("input");
  ok(/^#q-/.test(E3.location.hash) && E3.LX.QuestionCard(E3.LX.H("div", null, E3.body), { id: "t-qc", share: true }).get().question === "Mine, edited after sharing?", "question card: its own share link is not applied over later edits");
  // a card without an id: the link is shown, nothing is stored
  const E4 = env({ hash: "#" + QC.encode(link) }); load("questioncard", E4); E4.window.history = { replaceState: () => { E4.location.hash = ""; } };
  ok(E4.LX.QuestionCard(E4.LX.H("div", null, E4.body), {}).get().question === link.question && Object.keys(E4.store).length === 0 && E4.location.hash === "", "question card: without an id, the link's card is shown and the hash dropped");
  ok(!/replaceState|decode\(location\.hash\)\)\s*\{/.test(rd("assets/learn/r10-question-studio.js")), "R10 keeps no lesson-local workaround for the link");
  rest();
})();

function rest() {
  // ---------------------------------------------------------------- compare table: caption without sorts
  {
    const E = env(); load("table", E);
    const host = E.LX.H("div", null, E.body);
    E.LX.CompareTable(host, { title: "Nine families", text: true, columns: [{ key: "name", label: "Family", main: true }, { key: "a", label: "Answers" }],
      rows: [{ key: "x", name: "X", a: "one" }, { key: "y", name: "Y", a: "two" }], caption: "No family is the **default**: the [[question-type|type]] sets the choice." });
    const cap = host.querySelector("p.lx-lede");
    ok(cap.innerHTML.indexOf('data-term="question-type"') > 0 && /^No family is the/.test(cap.textContent) && !host.querySelector(".lx-seg"), "compare table: a caption without sorts, no sort buttons");
    ok(host.querySelectorAll("tbody tr").map(tr => tr.querySelector("th").textContent).join() === "X,Y", "compare table: rows in the given order");
    const h2 = E.LX.H("div", null, E.body);
    E.LX.CompareTable(h2, { title: "T", columns: [{ key: "name", label: "N", main: true }], rows: [{ key: "x", name: "X" }], caption: "C." });
    ok(h2.querySelector("p.lx-lede").textContent === "C.", "compare table: caption alone");
    ["r03-system-and-method", "r10-question-studio", "f01-five-scales"].forEach(f => ok(!/sorts: \[\{ label: "(All nine|As listed|From one site to a nation)"/.test(rd("assets/learn/" + f + ".js")) && /caption: "/.test(rd("assets/learn/" + f + ".js")), `${f}: a caption instead of a one-sort order`));
  }

  // ---------------------------------------------------------------- the studio template, forms.css, every live studio
  {
    const forms = rd("assets/learn/components/forms.css");
    const iB = forms.indexOf(".lx-studio-brief {"), iT = forms.indexOf(".lx-studio-task {");
    ok(iB >= 0 && iT > iB && forms.slice(iB, iT).split("\n").length <= 2, "forms.css: .lx-studio-brief next to the .lx-studio-task rules");
    ok(/:where\(\.lx-form-studio\) #selfcheck \.lx-myths \{ margin-top: 18px; \}/.test(forms) && bundleCSS.indexOf(".lx-studio-brief { margin-bottom: 14px; display: grid; gap: 8px; }") >= 0, "forms.css: the self-check's myth cards spaced; bundled");
    const tpl = rd("learn/_template-studio.qmd"), tb = tpl.indexOf('<div class="lx-card lx-studio-brief">'), ti = tpl.indexOf('<div class="lx-interactive');
    const tfb = tpl.slice(ti, tpl.indexOf("</div>\n</div>", ti));
    ok(tb >= 0 && tb < ti && /<b>Produce:<\/b>[\s\S]*<b>From:<\/b>[\s\S]*<b>Done when:<\/b>/.test(tpl.slice(tb, ti)) && !/Produce:/.test(tfb), "template: the task card sits above the interactive, outside its fallback");
    const studios = (P.more || []).filter(m => /^R\d+$/.test(m.code || "") && m.ready);
    ok(studios.length >= 7, `${studios.length} live studios: ${studios.map(s => s.code).join(", ")}`);
    studios.forEach(m => {
      const id = m.href.replace(/\.html$/, ""), q = rd("learn/" + id + ".qmd"), js = rd("assets/learn/" + id + ".js");
      const b = q.indexOf('<div class="lx-card lx-studio-brief">'), i = q.indexOf('<div class="lx-interactive');
      const card = b >= 0 && b < i && /<b>Produce:<\/b>[\s\S]*<b>From:<\/b>[\s\S]*<b>Done when:<\/b>/.test(q.slice(b, i));
      const drawn = /H\("ol", \{ class: "lx-studio-task" \}, task\)/.test(js) && /H\("div", \{ class: "lx-card r5-task" \}, live\)/.test(js);   // R5 draws its task card in the view
      ok(card || drawn, `${m.code}: readers with JavaScript see the task (${card ? "task card above the interactive" : drawn ? "drawn by the view" : "hidden in the fallback"})`);
      ok(!/<style>[^]*?\.lx-studio-brief/.test(q) && !/\.lx-studio-brief\s*\{/.test(js), `${m.code}: no page style for .lx-studio-brief (forms.css has it)`);
    });
    ["r01-framing", "r03-system-and-method", "r10-question-studio"].forEach(f => ok(!/<style>/.test(rd("learn/" + f + ".qmd")), `${f}: no page <style> left`));
  }

  // ---------------------------------------------------------------- no live lesson named as upcoming on the Researcher and hub pages
  {
    const all = [].concat(P.more, P.toolbox), live = new Set(all.filter(l => l.code && l.ready).map(l => l.code));
    const pages = fs.readdirSync(path.join(SITE, "learn")).filter(f => /^(r\d\d|f0\d)-.*\.qmd$/.test(f));
    let n = 0;
    pages.forEach(f => {
      let t = rd("learn/" + f).replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
      t = t.replace(/<a [^>]*>[\s\S]*?<\/a>/g, "LINK").replace(/\[[^\]]*\]\([^)]*\)/g, "LINK").replace(/<[^>]+>/g, " ");
      for (const m of t.matchAll(/upcoming/g)) {
        n++;
        const win = t.slice(Math.max(0, m.index - 110), m.index), cut = Math.max(win.lastIndexOf(". "), win.lastIndexOf("; "), win.lastIndexOf(": "), win.lastIndexOf("\n"));
        const codes = (win.slice(cut + 1).match(/\b(?:[A-Z]{1,2}\d{1,2}|CK-[A-Z]|CR)\b/g) || []).filter(c => live.has(c));
        ok(!codes.length, `${f}: no live lesson named as upcoming (${codes.join(", ")} in "…${win.slice(cut + 1).trim()} upcoming")`);
      }
    });
    ok(n >= 8, `${n} "upcoming" mentions checked on ${pages.length} pages`);
    ok(/<a href="k08-git-notebooks\.html">K8<\/a> \(Git and reproducible notebooks\)/.test(rd("learn/r05-build-validate.qmd")) && /M5, upcoming in the Modeler tier/.test(rd("learn/r05-build-validate.qmd")), "R5: K8 linked, M5 still named as upcoming");
  }

  // ---------------------------------------------------------------- README
  {
    const R = rd("assets/learn/README.md");
    const tl = R.indexOf("**Timeline** (`timeline.js`"), ss = R.indexOf("**Scale strip** (`scalestrip.js`"), pe = R.indexOf("**Planning engine** (`planengine.js`");
    ok(/LX\.lessonRef\(P, code\)/.test(R) && tl > 0 && ss > tl && pe > ss && /lines: true/.test(R) && /`\.lx-studio-brief`/.test(R), "README: lessonRef in Core, the Scale strip after the Timeline, Exemplars' lines, the task card in Form pieces");
  }
  console.log(`${checks - fails} of ${checks} checks pass (test_components_w2_studio)`);
  process.exit(fails ? 1 : 0);
}
