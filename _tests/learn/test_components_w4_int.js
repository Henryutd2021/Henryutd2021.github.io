// test_components_w4_int.js — Node tests for what the W4 integration (2026-11-05) promoted and fixed:
//   - four components promoted from W4 lessons whose script a second page loaded (README, "Promoted at the W4
//     integration"): adequacy.js (LX.A5: A5, A9), gp.js (LX.M9: M9, CF8), plainsplan.js (LX.plainsPlan: M6, A12) and
//     scenario.js (LX.m08: M8, CF3). Each is in the bundle and names itself; each sets its LX name on a page and exports
//     the same object in Node; each lesson script re-exports the very same functions plus only its own page parts; no
//     page (live or draft) loads another lesson's script for them; a few numbers agree between the component and the
//     lesson (the lessons' own tests check every number)
//   - LX.SupplyStack and LX.Frontier tick steps (xStep, yStep): defaults unchanged, the options honoured
//   - forms.css: an explainer's segmented control wraps its words on phones (CF8's "Curve + data" was cut at 375 px)
// Usage (from the site folder):  node _tests/learn/test_components_w4_int.js
"use strict";
const fs = require("fs");
const path = require("path");
const { env, load } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const rd = p => fs.readFileSync(L(p), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// ---------------------------------------------------------------- the four promotions
const bundleJS = rd("learn.js");
const PROMO = [
  { file: "adequacy", lx: "A5", lesson: "a05-adequacy", own: ["drillItem", "blocksText", "mixText"], users: ["a05-adequacy", "a09-hazards"], from: "a05-adequacy.js",
    keys: ["sources", "simulate", "evaluate", "efc", "accredit", "study", "blocks", "mix", "fm"] },
  { file: "gp", lx: "M9", lesson: "m09-surrogates-uq", own: ["facts", "reference", "staticFallback"], users: ["m09-surrogates-uq", "_drafts/cf8-power-curves-from-scarce-data"], from: "m09-surrogates-uq.js",
    keys: ["fit", "predict", "covariance", "search", "fitStored", "pinball", "scores", "invPhi", "ZL", "maker", "field"] },
  { file: "plainsplan", lx: "plainsPlan", lesson: "m06-carbon-in-models", own: [], users: ["m06-carbon-in-models", "a12-policy-instruments"], from: "m06-carbon-in-models.js",
    keys: ["prepare", "build", "faceModel", "read", "medoids", "fm"] },
  { file: "scenario", lx: "m08", lesson: "m08-stochastic-robust", own: ["lockWords", "staticHTML"], users: ["m08-stochastic-robust", "_drafts/cf3-hydrogen-under-uncertainty"], from: "m08-stochastic-robust.js",
    keys: ["scen", "cost", "expected", "worst", "regret", "build", "read", "closedBest", "fm"] }
];
const ownScript = { "a09-hazards": "a09-hazards.js", "_drafts/cf8-power-curves-from-scarce-data": "cf8-power-curves-from-scarce-data.js",
  "a12-policy-instruments": "a12-policy-instruments.js", "_drafts/cf3-hydrogen-under-uncertainty": "cf3-hydrogen-under-uncertainty.js" };
for (const P of PROMO) {
  const src = rd("components/" + P.file + ".js");
  ok(src.startsWith("/* " + P.file + ".js — LX." + P.lx + ":"), P.file + ".js names itself and its LX name");
  const at = bundleJS.indexOf("window.LX." + P.lx + " = model");
  ok(bundleJS.includes(src.trim().split("\n").slice(-3).join("\n")) && at > bundleJS.indexOf("LX.Sankey =") && at > bundleJS.indexOf("LX.E2 ="), P.file + ".js is in the bundle, after the W3 promotions and engine E2 (when present)");
  ok(!/document\.|\bLX\.H\(|innerHTML/.test(src.replace(/\/\*[\s\S]*?\*\//, "")), P.file + ".js is pure (no DOM)");
  // Node: the component, and the lesson script re-exporting it
  const C = require(L("components/" + P.file + ".js")), M = require(L(P.lesson + ".js"));
  ok(P.keys.every(k => C[k] !== undefined), P.file + ".js exports " + P.keys.join(", "));
  ok(Object.keys(C).every(k => M[k] === C[k]), P.lesson + ".js re-exports the component's own objects (no copy)");
  ok(Object.keys(M).filter(k => !(k in C)).sort().join() === P.own.slice().sort().join(), P.lesson + ".js adds only its page parts: " + (P.own.join(", ") || "none"));
  // a page: the stub LX gets the name from the component file alone
  const E = env(); load(P.file, E);
  ok(E.LX[P.lx] && P.keys.every(k => E.LX[P.lx][k] !== undefined), "on a page, components/" + P.file + ".js sets LX." + P.lx);
  // the pages: none loads the other lesson's script; the dependent one has no copy of the code
  P.users.forEach(u => {
    // a draft named here may have gone live since (learn/_drafts/<id>.qmd moved to learn/<id>.qmd): read whichever exists
    const qp = [u, u.replace(/^_drafts\//, "")].map(v => path.join(SITE, "learn", v + ".qmd")).find(p => fs.existsSync(p)) || path.join(SITE, "learn", u + ".qmd");
    const q = fs.readFileSync(qp, "utf8"), scripts = [...q.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    ok(scripts.filter(s => /assets\/learn\/[a-z0-9-]+\.js$/.test(s) && !/learn\.js$/.test(s)).length === 1, u + ": loads learn.js and only its own lesson script: " + scripts.join(" "));
    if (ownScript[u]) {
      const js = rd(ownScript[u]);
      ok(!new RegExp(P.from.replace(".", "\\.") + "(?!on)").test(js), u + ": no longer reads " + P.from + " (its data file may be named)");
      ok(!/^\s*function (simulate|fit|build|scen|chol|faceModel)\(/m.test(js), u + ": keeps no copy of the shared model");
    }
  });
}
// a few numbers agree between the component and the lesson's stored reference blocks
{
  const D8 = JSON.parse(rd("data/m08-stochastic-robust.json")), S8 = require(L("components/scenario.js"));
  const S = S8.scen(D8);
  ok(Math.abs(S8.expected(D8, S, D8.reference.sp.x) - D8.reference.sp.exp) < 1, "scenario: the hedged plan's expected cost from the closed form equals M8's reference (" + S8.fm.m(D8.reference.sp.exp) + ")");
  const D9 = JSON.parse(rd("data/m09-surrogates-uq.json")), G = require(L("components/gp.js")), F = G.fitStored(D9, D9.n0, false);
  const ref = D9.reference.predict16[0], q = G.predict(F, ref[0]);
  ok(Math.abs(q.m - ref[1]) < 1e-6 * Math.max(1, Math.abs(ref[1])) && Math.abs(q.sd - ref[2]) < 1e-6 * Math.max(1, ref[2]), "gp: the one-source fit at " + ref[0] + " m/s equals M9's reference block");
  ok(Math.abs(G.invPhi(0.95) - 1.6448536) < 1e-6 && Math.abs(G.Phi(1.6448536) - 0.95) < 1e-6, "gp: the normal distribution and its inverse (z 0.95 = 1.645)");
  const A = require(L("components/adequacy.js"));
  ok(A.geom(0.5, 0.5) === 1 && A.geom(0.9, 0.1) === Math.ceil(Math.log(0.1) / Math.log(0.9)), "adequacy: geometric spell lengths, ceil(ln(1 - u) / ln(1 - p)), at least 1");
}

// ---------------------------------------------------------------- tick steps
{
  const SS = require(L("components/supplystack.js")), FR = require(L("components/frontier.js"));
  const blocks = [{ offer: 0 }, { offer: 10 }, { offer: 40 }, { offer: 100 }];
  const d = SS.scaleOf(blocks, 450), s = SS.scaleOf(blocks, 10000, { xStep: 2500, yStep: 30 }), z = SS.scaleOf(blocks, 10000, { xStep: 0, yStep: -5 });
  ok(d.step === 20 && d.xStep === 100, "supply stack: default steps unchanged ($20, 100 MW)");
  ok(s.xStep === 2500 && s.step === 30 && s.xMax === 10000 && s.yMax === d.yMax, "supply stack: xStep and yStep honoured (2,500 MW, $30)");
  ok(z.xStep === 150 && z.step === 20, "supply stack: a step that is not positive falls back to the default");
  const src = rd("components/supplystack.js");
  ok(/scaleOf\(blocks, opt\.xMax, \{ xStep: opt\.xStep \|\| o\.xStep, yStep: opt\.yStep \|\| o\.yStep \}\)/.test(src), "supply stack: draw passes its own or the constructor's steps");
  const f0 = FR.stepOf(90, 200), f1 = FR.stepOf(90, 200, { xStep: 1000, yStep: 40 }), f2 = FR.stepOf(0, 300), f3 = FR.stepOf(90, 180);
  ok(f0.x === 200 && f0.y === 20 && f2.y === 50 && f3.y === 20 && FR.stepOf(0, 200).y === 25, "frontier: default steps unchanged (200 kt; $20M, $25M or $50M by the span)");
  ok(f1.x === 1000 && f1.y === 40, "frontier: xStep and yStep honoured (1,000 kt, $40M)");
  ok(/stepOf\(st\.yMin, st\.yMax, o\)/.test(rd("components/frontier.js")), "frontier: the axes use stepOf with the chart's options");
}

// ---------------------------------------------------------------- forms.css: an explainer's segmented control on phones
{
  const css = rd("components/forms.css");
  const m = css.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n\}/);
  ok(m && /\.page-learn \.explainer \.ex-seg-opt span \{[^}]*white-space: normal;[^}]*text-overflow: clip;/.test(m[1]) && /\.page-learn \.explainer \.ex-seg-opt \{ display: flex; \}/.test(m[1]),
     "forms.css: under 481 px an explainer's segment wraps its words and fills the control's height");
  ok(rd("learn.css").includes(".page-learn .explainer .ex-seg-opt span { flex: 1 1 auto;"), "the bundle carries the rule");
}

console.log(fails ? `FAILED ${fails} of ${checks} checks (test_components_w4_int)` : `ok ${checks}/${checks} checks (test_components_w4_int)`);
process.exit(fails ? 1 : 0);
