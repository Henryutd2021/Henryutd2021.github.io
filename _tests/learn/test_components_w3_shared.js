// test_components_w3_shared.js — Node tests for the W3 shared fixes (reports/learn/w3_shared_fixes.md, 2026-11-03):
//   1 LX.Drill writes its question and its hint through LX.rich, so drill items carry glossary marks (A1's CRF); text
//     is never read as HTML
//   2 (lesson 7's own test: the EIA population of the solar capacity factor)
//   4 M5 and C1 link the live case file CF1 once each, in their real-world boxes, with no new sentence about the study
//   5 LX.rich writes lesson links, [[lesson:<id>|words]] -> <a href="<id>.html">words</a> (core.js, pure and exported),
//     so text drawn by components links a live lesson: N1's two notes (A4, A2; and its no-JS fallback), F2's effect
//     note (A4), K5's feedback (M7), F1's reveal (M5); every lesson-link mark in the Learn scripts and data names a
//     live page
//   6 a disabled segmented button looks disabled (table.css: .lx-seg button[aria-disabled="true"] and :disabled), as
//     CF1's selling-price buttons are while on-site energy is off
//   7 LX.Rubric takes a per-capstone bar label (bar) and per-competence level words (levels); C0 and C1 use them for
//     Communication (a one-page note, not the final project's six-page paper); C1's "Done when" asks for Proficient on
//     every competence; W2's studios keep the course's words and "Proficient (the bar)"
// Usage (from the site folder):  node _tests/learn/test_components_w3_shared.js
"use strict";
const fs = require("fs");
const path = require("path");
const { env, load } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const rd = p => fs.readFileSync(L(p), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

(async () => {
  // ---------------------------------------------------------------- 1 LX.Drill: glossary marks in the question and the hint
  {
    const E = env(); load("drill", E);
    const host = E.LX.H("div", null, E.body);
    const d = E.LX.Drill(host, { hint: "Each item gives a [[capital-recovery-factor|capital recovery factor]] <b>.", seed: 3,
      item: k => ({ q: "Item " + k + ": the [[capital-recovery-factor|capital recovery factor]] (CRF) is 0.08 & <i>x</i>?", why: "w", choices: ["a", "b"], answer: 0 }) });
    const hint = host.querySelector(".lx-hint"), q = host.querySelector(".lx-qtext");
    const span = '<span class="lx-term" data-term="capital-recovery-factor">capital recovery factor</span>';
    ok(q && q.innerHTML === "Item 0: the " + span + " (CRF) is 0.08 &amp; &lt;i&gt;x&lt;/i&gt;?", "drill: the question carries a glossary mark; other text stays text (" + (q && q.innerHTML) + ")");
    ok(hint && hint.innerHTML === "Each item gives a " + span + " &lt;b&gt;.", "drill: the hint carries a glossary mark; other text stays text (" + (hint && hint.innerHTML) + ")");
    d.next(false);
    ok(host.querySelector(".lx-qtext").innerHTML.indexOf("Item 1: the " + span) === 0, "drill: the next item is written the same way");
    const js = rd("components/drill.js");
    ok(/html: LX\.rich\(o\.hint\)/.test(js) && /html: LX\.rich\(it\.q\)/.test(js) && !/text: it\.q/.test(js), "drill.js: the hint and the question through LX.rich");
    // A1 uses it: the break-even items mark the term; the line under the card that marked it instead is gone
    const A = require(L("a01-project-tea.js")), a1 = rd("a01-project-tea.js");
    const be = A.drill(42, 60).filter(it => it.kind === "breakeven");
    ok(be.length > 0 && be.every(it => it.q.indexOf("[[capital-recovery-factor|capital recovery factor]] (CRF) ") > 0), "A1: the drill's break-even items mark the capital recovery factor");
    ok(a1.indexOf("a1-drill-terms") < 0, "A1: no separate line under the drill for the term");
  }

  // ---------------------------------------------------------------- 4 CF1 linked from M5 and C1
  {
    const Q = id => fs.readFileSync(path.join(SITE, "learn", id + ".qmd"), "utf8");
    const line = '<a href="cf1-supply-chain-microgrids.html">case file CF1</a>';
    const m5 = Q("m05-microgrid-size-and-run"), c1 = Q("c1-keep-the-campus-running");
    const m5real = (m5.match(/<div class="lx-card lx-real">[\s\S]*?\n<\/div>\n<div class="lx-card lx-sources">/) || [""])[0];
    const c1real = (c1.match(/<div class="lx-card lx-real c1-realworld">[\s\S]*?\n<\/div>\n<\/div>/) || [""])[0];
    ok(fs.existsSync(path.join(SITE, "learn/cf1-supply-chain-microgrids.qmd")), "CF1 is a live page");
    ok(m5real.split(line).length === 2 && m5real.indexOf("<li>The full case: " + line + ".</li>") > 0 && m5.split("cf1-supply-chain-microgrids.html").length === 2,
       "M5: one link to CF1, a list line in the real-world box");
    ok(c1real.split(line).length === 2 && c1real.indexOf('<p class="lx-hint">The full case: ' + line + ".</p>") > 0 && c1.split("cf1-supply-chain-microgrids.html").length === 2,
       "C1: one link to CF1, a hint line in the real-world box");
  }

  // ---------------------------------------------------------------- 5 lesson links in LX.rich; the stale plain-text mentions
  {
    const CORE = require(L("components/core.js"));
    ok(typeof CORE.rich === "function", "core.js exports the pure LX.rich");
    if (CORE.rich) {
      ok(CORE.rich("See [[lesson:a04-retail-tariffs|A4]] & <b>x</b>.") === 'See <a href="a04-retail-tariffs.html">A4</a> &amp; &lt;b&gt;x&lt;/b&gt;.', "rich: a lesson link; other text stays text");
      ok(CORE.rich("A [[monte-carlo|Monte Carlo]] study, as [[lesson:m07-monte-carlo|M7]] runs") === 'A <span class="lx-term" data-term="monte-carlo">Monte Carlo</span> study, as <a href="m07-monte-carlo.html">M7</a> runs', "rich: glossary marks and lesson links together");
      ok(CORE.rich("[[lesson:Bad Id|x]] [[lesson:a04|]]") === "[[lesson:Bad Id|x]] [[lesson:a04|]]", "rich: a malformed lesson mark stays as typed (so the build's raw-mark check sees it)");
    }
    const E = env();
    ok(E.LX.rich("[[lesson:a02-contracts-risk|A2]]") === '<a href="a02-contracts-risk.html">A2</a>', "stubdom's LX.rich is core's");
    const PJ = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
    const live = new Set([].concat(PJ.starter || [], PJ.more || [], PJ.toolbox || []).filter(l => l.ready && l.href).map(l => l.href.replace(/\.html$/, "")));
    const D = p => JSON.parse(rd("data/" + p));
    const n1 = D("n01-news-lens.json"), f2 = D("f02-systems-and-map.json");
    const notes = n1.stories.map(s => s.missing.note).join(" ");
    ok(/Analyst lesson \[\[lesson:a04-retail-tariffs\|A4\]\] covers large-load tariffs\./.test(notes) && /Analyst lesson \[\[lesson:a02-contracts-risk\|A2\]\] covers contracts and risk\./.test(notes), "N1: the two 'left unanswered' notes link A4 and A2");
    const n1q = fs.readFileSync(path.join(SITE, "learn/n01-news-lens.qmd"), "utf8");
    ok(n1q.indexOf('Analyst lesson <a href="a04-retail-tariffs.html">A4</a> covers large-load tariffs.') > 0 && n1q.indexOf('Analyst lesson <a href="a02-contracts-risk.html">A2</a> covers contracts and risk.') > 0 && n1q.indexOf("[[lesson:") < 0,
       "N1's no-JS fallback writes the two links (scripts/learn_n01_fallback.js)");
    ok(JSON.stringify(f2).indexOf("under the tariff: Analyst lesson [[lesson:a04-retail-tariffs|A4]].") > 0, "F2: the bills effect links A4");
    ok(rd("k05-probability-statistics.js").indexOf("as Modeler lesson [[lesson:m07-monte-carlo|M7]] runs.") > 0, "K5: the sampling feedback links M7");
    ok(rd("f01-five-scales.js").indexOf('"Modeler lesson [[lesson:m05-microgrid-size-and-run|M5]] solves exactly this campus."') > 0, "F1: the campus reveal links M5");
    // every lesson-link mark in the Learn scripts and data names a live page
    const files = fs.readdirSync(L("")).filter(f => /\.js$/.test(f) && !/^learn\.js$/.test(f)).map(f => L(f))
      .concat(fs.readdirSync(L("data")).filter(f => /\.json$/.test(f)).map(f => L("data/" + f)));
    let marks = 0, bad = [];
    files.forEach(f => { for (const m of fs.readFileSync(f, "utf8").matchAll(/\[\[lesson:([a-z0-9-]+)\|[^\]]+\]\]/g)) { marks++; if (!live.has(m[1])) bad.push(path.basename(f) + ": " + m[1]); } });
    ok(marks >= 5 && !bad.length, `lesson-link marks name live pages (${marks} marks${bad.length ? "; not live: " + bad.join(", ") : ""})`);
  }

  // ---------------------------------------------------------------- 6 disabled segmented buttons
  {
    const css = rd("components/table.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = /\.lx-seg button\[aria-disabled="true"\], \.lx-seg button:disabled \{ opacity: \.5; cursor: not-allowed; \}/;
    ok(rule.test(css) && rule.test(rd("learn.css")), "table.css: a disabled segmented button is faded with a not-allowed cursor (and in the bundle)");
    ok(css.indexOf('.lx-seg button[aria-disabled="true"]') > css.indexOf('.lx-seg button[aria-pressed="true"]'), "the disabled look comes after the pressed look, so a pressed and disabled button is faded too");
    ok(/b\.setAttribute\("aria-disabled", String\(!St\.onsite\)\)/.test(rd("cf1-supply-chain-microgrids.js")), "CF1's selling-price buttons are aria-disabled while on-site energy is off");
  }

  // ---------------------------------------------------------------- 7 LX.Rubric: per-capstone bar label and level words
  {
    const RB = require(L("components/rubric.js"));
    const own = { id: "communication", look: "x", levels: { proficient: "a one-page note with its plan link" } };
    const C = RB.competence(own), D0 = RB.competence("communication");
    ok(C.text.proficient === "A one-page note with its plan link." && C.text.developing === D0.text.developing && C.text.strong === D0.text.strong && C.own && C.own.join() === "proficient",
       "rubric: a competence can carry its own level words; the others stay the course's");
    const sh = RB.staticHTML([own, "accounting"], { bar: "the bar for this note" });
    ok(sh.indexOf('<th scope="col">Proficient (the bar for this note)</th>') > 0 && sh.indexOf("A one-page note with its plan link.") > 0 && sh.indexOf("Six-page paper") < 0, "rubric: the static table takes the bar label and the own words");
    ok(RB.staticHTML(["accounting"]).indexOf('<th scope="col">Proficient (the bar)</th>') > 0 && RB.staticHTML(["accounting"]) === RB.staticHTML(["accounting"], {}), "rubric: without options, the static table is unchanged");
    const sm = RB.summary([own], { communication: "proficient" }, { code: "C1" }).split("\n");
    ok(sm[0] === "Learn · C1 self-check (rubric v1 (curriculum v2 §3.4); Communication in C1's own words)" && sm[1] === "Communication: Proficient — A one-page note with its plan link.", "rubric: the summary says which competences use the capstone's own words (" + sm[0] + ")");
    ok(RB.summary(["framing"], {}, { code: "R1" }).split("\n")[0] === "Learn · R1 self-check (rubric v1 (curriculum v2 §3.4))", "rubric: a studio's summary line is unchanged");
    ok(RB.resultText({ rated: 2, atBar: 2, total: 2, all: true }, "the bar for this note") === "2 of 2 at Proficient or above: the bar for this note, on these competences." &&
       RB.resultText({ rated: 2, atBar: 1, total: 2, all: false }, "the bar for this note") === "1 of 2 at Proficient or above; Proficient on every competence is the bar for this note." &&
       RB.resultText({ rated: 1, atBar: 1, total: 1, all: true }) === "1 of 1 at Proficient or above: the bar for the readiness claim, on these competences.", "rubric: the result line names the bar it was given; the default is unchanged");
    // the view
    const E = env(); E.LX.store = { get: () => null, set: () => {} }; load("rubric", E);
    const host = E.LX.H("div", null, E.body);
    const rb = E.LX.Rubric(host, { id: "t", code: "C1", competences: [own], bar: "the bar for this note" });
    const labs = host.querySelectorAll("label");
    ok(labs[2].querySelector("small").textContent === "the bar for this note" && labs[2].querySelector(".lx-rb-desc").textContent === "A one-page note with its plan link.", "rubric view: the bar label and the own words on the Proficient level");
    rb.set("communication", "proficient");
    ok(host.querySelector(".lx-rb-result").textContent === "1 of 1 at Proficient or above: the bar for this note, on these competences.", "rubric view: the result line names this bar");
    const vs = rb.summary().split("\n");
    ok(vs[0] === "Learn · C1 self-check (rubric v1 (curriculum v2 §3.4); Communication in C1's own words)" && vs[1] === "Communication: Proficient — A one-page note with its plan link." && vs[2] === "1 of 1 at Proficient or above: the bar for this note, on these competences.",
       "rubric view: the copied summary keeps the own words and the bar (" + vs.slice(0, 3).join(" | ") + ")");
    // C0 and C1 use them; W2's studios do not
    const c0 = JSON.parse(rd("data/c0-behind-one-meter.json")).rubric, c1 = require(L("c1-keep-the-campus-running.js"));
    const comm = r => (r.competences || r).find(c => c.id === "communication");
    ok(c0.bar === "the bar for this note" && /one-page note/.test(comm(c0).levels.proficient) && !/six pages|final project/.test(c0.lede + c0.note), "C0: its bar label and Communication's one-page words; no six-page caveat left");
    ok(c1.RUBRIC_BAR === "the bar for this note" && /one-page note/.test(comm(c1.RUBRIC).levels.proficient) && !/full paper|six/.test(comm(c1.RUBRIC).look), "C1: its bar label and Communication's one-page words; the look line no longer explains the course's words away");
    const q0 = fs.readFileSync(path.join(SITE, "learn/c0-behind-one-meter.qmd"), "utf8"), q1 = fs.readFileSync(path.join(SITE, "learn/c1-keep-the-campus-running.qmd"), "utf8");
    ok([q0, q1].every(q => q.indexOf("<th scope=\"col\">Proficient (the bar for this note)</th>") > 0 && q.indexOf("Six-page paper") < 0), "C0 and C1: the no-JS rubric tables carry the bar label and the one-page words");
    ok(/<li><b>Done when:<\/b> every check under the note is in place, the brief's three loads served among them, and the self-check reaches Proficient on every competence\.<\/li>/.test(q1) && !/For communication, the one-page note is the bar/.test(q1), "C1: 'Done when' asks for Proficient on every competence (the workaround is gone)");
    const call = f => (rd(f).split("\n").find(l => /LX\.Rubric\(/.test(l)) || "");
    ok(/bar: C\.rubric\.bar \}\);$/.test(call("c0-behind-one-meter.js")) && /bar: page\.RUBRIC_BAR \}\);$/.test(call("c1-keep-the-campus-running.js")), "C0 and C1 pass their bar label to LX.Rubric");
    const studios = fs.readdirSync(path.join(SITE, "learn")).filter(f => /^(r\d\d|ck-m)-.*\.qmd$/.test(f));
    ok(studios.length >= 8 && studios.every(f => { const t = fs.readFileSync(path.join(SITE, "learn", f), "utf8"); return t.indexOf("lx-rb-static") < 0 || t.indexOf("<th scope=\"col\">Proficient (the bar)</th>") > 0; }), `W2 studios keep "Proficient (the bar)" (${studios.length} pages)`);
  }

  console.log(fails ? `FAILED ${fails} of ${checks} checks (test_components_w3_shared)` : `ok ${checks}/${checks} checks (test_components_w3_shared)`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL: test crashed:", e && e.stack); process.exit(1); });
