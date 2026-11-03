// test_components_w2_int.js — Node tests for the pieces promoted or fixed by the W2 integration itself (2026-11-03):
//   - stakeholders.js/.css (e-stakeholders): LX.Stakeholders (A22's role table, cards on phones) and LX.StakeholderMap
//     (R9's rings of groups): pure parts, the views on a stub document, A22 and R9 using them with no copy left
//   - forms.css: the case files' controls and comparison table (.cf-*), the Try-it box that wraps, and the theme colour of an
//     allow-listed explainer on a Learn page; the three case-file drafts keep no page style and no theme-* body class
//   - the header's practice badge in hours from 120 minutes (build_learn.py) on every page that has one
//   - the Teaching card's lesson count equals the live lessons in data/path.json
// Usage (from the site folder):  node _tests/learn/test_components_w2_int.js
"use strict";
const fs = require("fs");
const path = require("path");
const { env, load, buttons } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const bundleJS = rd("assets/learn/learn.js"), bundleCSS = rd("assets/learn/learn.css");

// ---------------------------------------------------------------- stakeholders: pure part
const SH = require(L("components/stakeholders.js"));
const T = { title: "Who decides", cols: [{ key: "dec", label: "Decides" }, { key: "pay", label: "Pays" }],
  rows: [{ key: "homes", name: "Households", note: "including renters", cells: { dec: { v: "part", t: "comment at [[tariff|hearings]]" }, pay: { v: "yes" } } },
         { key: "reg", name: "Regulator", cells: { dec: { v: "yes", t: "approves" }, pay: { t: "no bills" } } }], note: "Illustrative roles." };
ok(SH.cellText(T.rows[0].cells.dec) === "Partly: comment at hearings" && SH.cellText(T.rows[0].cells.pay) === "Yes" && SH.cellText(T.rows[1].cells.pay) === "no bills" && SH.cellText(undefined) === "",
   "stakeholders: a cell in words (Yes, Partly or No, then its line, glossary marks dropped)");
const st = SH.staticHTML(T);
ok(/^<table class="lx-stake-static"><thead><tr><th scope="col">Who<\/th><th scope="col">Decides<\/th><th scope="col">Pays<\/th><\/tr><\/thead>/.test(st) &&
   st.indexOf('<th scope="row">Households (including renters)</th><td>Partly: comment at hearings</td><td>Yes</td>') > 0, "stakeholders: staticHTML writes a plain table for a no-JS fallback");
const M = { rings: [{ ring: "Inside", items: [{ id: "a", label: "Co-authors", owed: "credit", also: ["The error"] }] }, { ring: "Around", items: [{ id: "b", label: "Renters", owed: "a say" }] }] };
ok(JSON.stringify(SH.mapItems(M).map(x => [x.id, x.ring, x.k, x.also.length])) === JSON.stringify([["a", "Inside", 0, 1], ["b", "Around", 1, 0]]), "stakeholder map: every group with its ring, in order");

// ---------------------------------------------------------------- stakeholders: the views on a stub page
{
  const E = env(); load("stakeholders", E);
  const host = E.LX.H("div", null, E.body), t = E.LX.Stakeholders(host, T);
  const tds = host.querySelectorAll("td");
  ok(host.querySelector("h3").textContent === "Who decides" && host.querySelectorAll("tbody tr").length === 2 && tds.length === 4, "Stakeholders: a heading, one row per role, one cell per question");
  ok(tds[0].getAttribute("data-label") === "Decides" && host.querySelectorAll(".mk").length === 3 && /Partly/.test(tds[0].textContent), "Stakeholders: labelled cells (phone cards) and a word beside every dot");
  t.set("reg", "pay", "Your plan: none");
  ok(/Your plan: none/.test(tds[3].textContent) && host.querySelector(".lx-hint").textContent === "Illustrative roles.", "Stakeholders: set() rewrites a cell; the note follows the table");
  const host2 = E.LX.H("div", null, E.body); let seen = 0;
  const m = E.LX.StakeholderMap(host2, Object.assign({ onOpen: n => { seen = n; } }, M));
  const chips = host2.querySelectorAll("button.lx-smap-chip"), owed = host2.querySelector(".lx-smap-owed");
  ok(host2.querySelectorAll(".lx-smap-ring").length === 2 && chips.length === 2 && owed.getAttribute("aria-live") === "polite" && /Tap a group/.test(owed.textContent), "StakeholderMap: rings of buttons and a live answer line");
  chips[0].click();
  ok(chips[0].getAttribute("aria-pressed") === "true" && /Co-authors/.test(owed.innerHTML) && /In: The error\./.test(owed.innerHTML) && seen === 1, "StakeholderMap: a button opens what the group is owed and where it appears");
  m.open("b");
  ok(chips[1].getAttribute("aria-pressed") === "true" && chips[0].getAttribute("aria-pressed") === "false" && seen === 2 && !/In:/.test(owed.innerHTML), "StakeholderMap: open(id) moves the selection; rings seen are counted");
  ok(host2.querySelectorAll("details.lx-textalt li").length === 2, "StakeholderMap: a text version lists every group");
}
ok(bundleJS.indexOf("LX.Stakeholders = ") > 0 && bundleJS.indexOf("LX.StakeholderMap = ") > 0 && /\.lx-stake \{/.test(bundleCSS) && /\.lx-smap-chip\[aria-pressed="true"\]/.test(bundleCSS), "stakeholders: in the bundle");
{
  const a22 = rd("assets/learn/a22-tradeoff-explorer.js"), r9 = rd("assets/learn/r09-integrity-stakeholders.js");
  ok(/LX\.Stakeholders\(/.test(a22) && !/function Stakeholders|a22-stake/.test(a22), "A22 uses LX.Stakeholders and keeps no copy or style");
  ok(/LX\.StakeholderMap\(/.test(r9) && !/function StakeholderMap|r9-map|r9-chip|r9-ring|r9-owed/.test(r9), "R9 uses LX.StakeholderMap and keeps no copy or style");
}

// ---------------------------------------------------------------- forms.css: case files and explainers
{
  const forms = rd("assets/learn/components/forms.css");
  ["\\.cf-ctl \\{", "\\.cf-ctl-l \\{", "\\.cf-row \\{", "\\.cf-selects \\{", "\\.cf-sel select \\{", "\\.cf-two \\{", "\\.cf-two td::before \\{ content: attr\\(data-l\\)",
   "\\.lx-case-try code \\{ white-space: normal; overflow-wrap: anywhere; \\}", "body\\.page-learn \\{ --t: var\\(--lx-accent\\); \\}", "\\.page-learn \\.explainer \\{ --t-ink: "].forEach(r =>
    ok(new RegExp(r).test(forms), "forms.css has " + r.replace(/\\/g, "")));
  fs.readdirSync(path.join(SITE, "learn/_drafts")).filter(f => /^cf\d/.test(f)).forEach(f => {
    const q = rd("learn/_drafts/" + f);
    ok(!/<style>/.test(q) && !/theme-[a-z]+/.test(q.split("\n---")[0]), f + ": no page style and no theme-* body class (forms.css holds them)");
  });
  ok(/<code>python run\.py --case toy<\/code>/.test(rd("learn/_template-case.qmd")), "case template: the Try-it example shows a command, which wraps");
}

// ---------------------------------------------------------------- the practice badge, and the Teaching card's count
{
  const P = JSON.parse(rd("assets/learn/data/path.json"));
  const all = [].concat(P.starter, P.more, P.toolbox).filter(l => l.ready && l.id);
  let n = 0;
  all.forEach(l => {
    const f = path.join(SITE, "learn", l.id + ".qmd"); if (!fs.existsSync(f)) return;
    const q = fs.readFileSync(f, "utf8"), m = q.match(/<li>(\d+) min guided · about ([^<]+) practice<\/li>/); if (!m) return;
    const data = JSON.parse(q.match(/<script type="application\/json" class="lx-lesson-data">([\s\S]*?)<\/script>/)[1]), pm = data.practice;
    n++;
    const want = pm ? (pm < 120 ? pm + " min" : (Math.round(pm / 30) / 2) + " h") : null;
    ok(m[2] === want, `${l.id}: practice badge "${m[2]}" (${pm} min)`);
  });
  ok(n >= 20, `practice badges checked on ${n} pages; 120 minutes and more read in hours`);
  ok(rd("teaching.qmd").indexOf(all.length + " lessons live; more coming") > 0, `Teaching card: ${all.length} lessons live, as in path.json`);
}

console.log(fails ? `FAILED ${fails} of ${checks} checks (test_components_w2_int)` : `ok ${checks}/${checks} checks (test_components_w2_int)`);
process.exit(fails ? 1 : 0);
