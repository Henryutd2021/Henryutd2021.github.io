// test_components_w3_shared.js — Node tests for the W3 shared fixes (reports/learn/w3_shared_fixes.md, 2026-11-03):
//   1 LX.Drill writes its question and its hint through LX.rich, so drill items carry glossary marks (A1's CRF); text
//     is never read as HTML
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

  console.log(fails ? `FAILED ${fails} of ${checks} checks (test_components_w3_shared)` : `ok ${checks}/${checks} checks (test_components_w3_shared)`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL: test crashed:", e && e.stack); process.exit(1); });
