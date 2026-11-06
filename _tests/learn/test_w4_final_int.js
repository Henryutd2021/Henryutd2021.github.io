// test_w4_final_int.js — Node tests for the W4 final integration (2026-11-05), after the seven fix branches were merged:
//   - case-file links: CF3 (now live) from A16, M6 and A10; CF8 (now live) from M9, M10, lesson 4 and lesson 5; one line
//     each, in the page's real-world card, naming the case file by its own title (no new claim about the studies)
//   - F1's data: the S2 gloss in the wording CF3's review proposed (finding 7): a synchronous grid shares one AC frequency;
//     synchronous generators turn in step, inverters connect the rest (it no longer says every generator turns in step)
//   - the uq-mfgpr explainer tells its host page what it shows ("explainer-update"), so CF8's text version follows the
//     slider (CF8's own test checks the table); the explainer's project page has no listener and stays as it was
// Usage (from the site folder):  node _tests/learn/test_w4_final_int.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// ---------------------------------------------------------------- case-file links
const PJ = JSON.parse(rd("assets/learn/data/path.json"));
const live = id => JSON.stringify(PJ).indexOf('"href":"' + id + '.html"') >= 0 || JSON.stringify(PJ).indexOf('"href": "' + id + '.html"') >= 0;
const LINKS = {
  "cf3-hydrogen-under-uncertainty": { line: '<p class="lx-hint">Case file <a href="cf3-hydrogen-under-uncertainty.html">CF3</a>: where hydrogen should go when nobody knows how much wind will be built.</p>',
    from: ["a16-hydrogen-ptx", "m06-carbon-in-models", "a10-emissions-questions"] },
  "cf8-power-curves-from-scarce-data": { line: '<p class="lx-hint">Case file <a href="cf8-power-curves-from-scarce-data.html">CF8</a>: learning a wind turbine\'s power curve from scarce data.</p>',
    from: ["m09-surrogates-uq", "m10-ml-forecasting", "04-forecasts", "05-capacity-factor"] }
};
Object.keys(LINKS).forEach(cf => {
  const L = LINKS[cf], page = rd("learn/" + cf + ".qmd"), title = (page.match(/^title: "(.*)"$/m) || [])[1] || "";
  ok(fs.existsSync(path.join(SITE, "learn", cf + ".qmd")) && !fs.existsSync(path.join(SITE, "learn/_drafts", cf + ".qmd")) && live(cf), cf + " is live (a page, no draft, linked in path.json)");
  const words = L.line.replace(/<[^>]+>/g, "").replace(/^Case file CF\d: /, "").replace(/\.$/, "").toLowerCase();
  const bag = t => t.toLowerCase().replace(/[?.]$/, "").split(/\s+/).sort().join(" ");   // a question title may read as a statement (as M8's link)
  ok(bag(title) === bag(words), cf + ": the link line names the case file by its own title, in the same words (" + title + ")");
  L.from.forEach(id => {
    const q = rd("learn/" + id + ".qmd");
    const real = (q.match(/<div class="lx-card lx-real">[\s\S]*?\n<\/div>/) || [""])[0];
    ok(q.split(L.line).length === 2, id + ": links " + cf.slice(0, 3).toUpperCase() + " once");
    ok(real.indexOf(L.line) > 0, id + ": the link sits in the page's real-world card");
  });
});

// ---------------------------------------------------------------- F1's S2 gloss (CF3 review, finding 7)
{
  const S2 = JSON.parse(rd("assets/learn/data/f01-five-scales.json")).scales.find(s => s.id === "S2");
  const plain = S2.gloss.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1");
  ok(plain.startsWith("A synchronous grid shares one AC frequency. Synchronous generators rotate in step electrically; inverters connect other resources to that frequency"),
     "S2 gloss: the review's wording (a synchronous grid shares one AC frequency; synchronous generators turn in step; inverters connect the rest)");
  ok(!/All the generators|turn in step/.test(plain) && /several operators can share the grid, each balancing its own region\.$/.test(plain), "S2 gloss: no longer says every generator turns in step; still says operators share the grid (F1 review #4)");
  ok(/\[\[synchronous-grid\|/.test(S2.gloss) && /\[\[frequency\|/.test(S2.gloss) && /\[\[inverter\|/.test(S2.gloss), "S2 gloss: synchronous grid, frequency and inverter carry their glossary marks");
}

// ---------------------------------------------------------------- the uq-mfgpr explainer and its project page
{
  const EX = rd("assets/explainers/uq-mfgpr.js"), PROJ = rd("projects/uq-mfgpr.qmd");
  ok(/root\.dispatchEvent\(new CustomEvent\("explainer-update", \{ bubbles: true, detail: \{ slug: "uq-mfgpr", n: m\.n, mode: state\.mode, model: m, api: API \} \}\)\)/.test(EX),
     "uq-mfgpr explainer: every update sends what it shows (n, the Show choice, the model's result and its pure model)");
  ok(/data-explainer="uq-mfgpr"/.test(PROJ) && !/explainer-update/.test(PROJ), "projects/uq-mfgpr: loads the explainer and listens to nothing (the page is unchanged)");
}

console.log(fails ? `FAILED ${fails} of ${checks} checks (test_w4_final_int)` : `ok ${checks}/${checks} checks (test_w4_final_int)`);
process.exit(fails ? 1 : 0);
