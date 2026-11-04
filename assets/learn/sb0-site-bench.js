// sb0-site-bench.js — Sandbox SB0, the Site Bench (wave W3, 2026-11-03). Page: learn/sb0-site-bench.qmd (sandbox form:
// Brief, Bench, Results, Explain, Sources).
// The page is a thin layer over engine E0 (assets/learn/components/engine-e0.js, LX.E0, in the bundle): the bench (its
// controls, presets, run box, sizing run and plan link) is LX.E0.ui.bench; every number comes from LX.E0.solve and
// LX.E0.summarize. This file adds the explain layer (the rules in words, where the answers hold, the check on one
// full-year LP) from data/sb0-site-bench.json and e0.json's reference block, and the demo states for screenshots.
// Data: e0.json (the engine's inputs and sources), town_year.json (SPP 2025 shapes, EIA-930), cf_targets.json (EIA 2025
// capacity factors), sb0-site-bench.json (the explain words), path.json (links to other lessons).
// The no-JS blocks (the bench's controls, the default plan's results, the explain layer, the inputs and the sources)
// are written into the page by _tests/learn/test_sb0-site-bench.js --write from the same functions (staticBlocks below).
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var TERM = "data-" + "term";   // (spelled in two parts so the build's glossary scan does not read this line as a mark)
  function rich(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" ' + TERM + '="' + id + '">' + w + "</span>"; }); }
  // the explain layer's no-JS version: the rules in words, where the answers hold, and the check table
  function explainHTML(X, D, E0) {
    return '<dl class="lx-ideas">' + X.rules.items.map(function (i) { return "<dt>" + esc(i.k) + "</dt><dd>" + rich(i.v) + "</dd>"; }).join("") +
      "<dt>It holds when</dt><dd><ul>" + X.bound.holds.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul></dd>" +
      "<dt>It leaves out</dt><dd><ul>" + X.bound.leaves.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul></dd></dl>" +
      '<p class="lx-eyebrow">' + esc(X.check.title) + "</p><p class=\"lx-hint\">" + esc(X.check.lede) + "</p>" + E0.checkHTML(D.reference && D.reference.check);
  }
  // every generated block of the page: { bench, results, explain, inputs, sources }
  function staticBlocks(D, X, P, E0, SS) {
    return { bench: SS.staticHTML(E0.schema, E0.defaults()), results: E0.fallback(D), explain: explainHTML(X, D, E0), inputs: E0.inputsHTML(D, P), sources: E0.sourcesHTML(D) };
  }
  var model = { explainHTML: explainHTML, staticBlocks: staticBlocks };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.mount("sb0", function (live, data, root) {
    var E0 = LX.E0, D = data.e0, X = data.sb0_site_bench, P = E0.prepare(D, data.town_year, data.cf_targets);
    var rh = document.getElementById("sb0-results");
    rh.innerHTML = "";
    var B = E0.ui.bench(live, { P: P, resultsHost: rh, id: "sb0" });
    // explain: the rules in words, where the answers hold, the check on one full-year LP
    var x = document.getElementById("sb0-explain");
    x.innerHTML = "";
    var rc = H("div", { class: "lx-xcard" }, x), rhd = H("header", { class: "lx-x-head" }, rc); H("h3", { text: X.rules.title }, rhd);
    var dl = H("dl", { class: "lx-ideas" }, rc);
    X.rules.items.forEach(function (i) { H("dt", { text: i.k }, dl); H("dd", { html: LX.rich(i.v) }, dl); });
    LX.Boundary(H("div", { class: "lx-xcard" }, x), X.bound);
    var cc = H("div", { class: "lx-xcard" }, x), chd = H("header", { class: "lx-x-head" }, cc); H("h3", { text: X.check.title }, chd);
    H("p", { class: "lx-hint", text: X.check.lede }, cc);
    H("div", { class: "lx-scroll-x", html: E0.checkHTML(D.reference && D.reference.check) }, cc);
    var first = B.run.run(B.plan());   // the plan from the link, or the default plan
    // demo states (core.js LX.demo): "mid" = the ridge wind farm with a 50 MW electrolyzer, run; "done" = the first run
    LX.demo(root, function (state) {
      if (state === "mid") {
        var p = E0.presets.filter(function (q) { return q.id === "farmel"; })[0];
        return first.then(function () { return B.set(p.state, true); }).then(function () { return { view: "farm with an electrolyzer" }; });
      }
      if (state === "done") return first.then(function () { return { view: "default plan run" }; });
      return null;
    });
  });
})();
