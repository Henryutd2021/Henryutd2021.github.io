// regions.js — the twelve regional profile cards (learn/regions.qmd). A reference page, not a lesson: the cards themselves are static
// HTML written from data/regions.json by the test's --write mode (so every reader, with or without JavaScript, sees all of
// them); this script adds a filter by each card's focus (an editorial choice, not a property of the region) and makes a
// link to a card the filter hides show that card first. Every card has the same six parts: system structure,
// institutions, main challenges, distinctive research questions, verified key numbers (each with its source, the
// source's date and the year its data describe) and the day the numbers were checked. A surveyed figure whose data year is
// unknown is held back (the card says so; the figure stays in the data file, unrendered). Text may carry the course's
// glossary marks, which the writers turn into glossary spans.
// Tests: node _tests/learn/test_regions.js [--write]. Shared components: LX.H, LX.mount, LX.demo.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure writers (no DOM; exported for Node)
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function rich(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, "<span class=\"lx-term\" data-term=\"$1\">$2</span>"); }
  function plain(t) { return String(t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  // a source's short name; Ember keeps its label as a compiler of official statistics wherever it is cited
  function shortPub(s) { return /compiler/.test(s.publisher) ? s.publisher : s.publisher.split(",")[0].replace(/ \(.*$/, ""); }
  function srcRef(R, key, year) {   // "(Publisher, its date; data: year)", linked when the source has an allowed address
    var s = R.sources[key], d = s.date.split(";")[0], txt = esc(shortPub(s)) + ", " + esc(d);
    return "<span class=\"rg-src\">(" + (s.url && s.url !== "no link" ? "<a href=\"" + esc(s.url) + "\">" + txt + "</a>" : txt) + (year ? "; data: " + esc(year) : "") + ")</span>";
  }
  function tilesHTML(R) {
    return "<ul class=\"rg-tiles\">" + R.cards.map(function (c) {
      return "<li data-scale=\"" + c.scale + "\"><a href=\"#" + c.id + "\"><b>" + esc(c.title) + "</b><span>" + esc(R.scales[c.scale]) + "</span><i>" + esc(c.keywords.join(" · ")) + "</i></a></li>";
    }).join("") + "</ul>";
  }
  function numbersHTML(R, c) {
    if (c.held && !c.numbers.length) {   // the sources named (each its own page), the figures not shown
      var s0 = R.sources[c.held.src[0]];
      return "<p class=\"lx-hint\">" + esc(c.held.why) + " <span class=\"rg-src\">(" + esc(shortPub(s0)) + ": " + c.held.src.map(function (k) {
        var s = R.sources[k]; return s.url && s.url !== "no link" ? "<a href=\"" + esc(s.url) + "\">" + esc(s.title) + "</a>" : esc(s.title); }).join(" and ") + ", " + esc(s0.date.split(";")[0]) + ")</span></p>";
    }
    return "<ul>" + c.numbers.map(function (n) { return "<li>" + rich(n.text) + " " + srcRef(R, n.src, n.year) + "</li>"; }).join("") + "</ul>";
  }
  function cardHTML(R, c) {
    return "<article class=\"lx-card rg-card\" id=\"" + c.id + "\" data-scale=\"" + c.scale + "\">" +
      "<header class=\"rg-head\"><h3>" + esc(c.title) + "</h3><p class=\"rg-tags\">Focus of this card: " + esc(R.scales[c.scale].toLowerCase()) + " · " + esc(c.keywords.join(" · ")) + "</p></header>" +
      (c.note ? "<p class=\"lx-hint rg-note\">" + rich(c.note) + "</p>" : "") +
      "<dl class=\"rg-parts\">" + R.parts.map(function (p) {
        return "<div class=\"rg-part\"><dt>" + esc(p.label) + "</dt><dd><ul>" + c[p.key].map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul></dd></div>";
      }).join("") + "</dl>" +
      "<div class=\"rg-nums\"><p class=\"lx-eyebrow\">Verified key numbers</p>" + numbersHTML(R, c) + "</div>" +
      "<p class=\"rg-asof\"><b>Checked " + esc(c.read) + "</b>: each number was read on its source that day.</p>" +
      "<p class=\"rg-top\"><a href=\"#cards\">Back to all regions</a></p></article>";
  }
  function cardsHTML(R) { return R.cards.map(function (c) { return cardHTML(R, c); }).join("\n"); }
  function guideHTML(R) {   // how to read the numbers: units and classifications, each in one line
    return "<dl class=\"rg-guide\">" + R.guide.map(function (g) { return "<div><dt>" + esc(g.term) + "</dt><dd>" + rich(g.text) + "</dd></div>"; }).join("") + "</dl>";
  }
  function compareHTML(R) {
    return "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table rg-compare\"><thead><tr><th scope=\"col\">Region</th><th scope=\"col\">Focus of this card</th><th scope=\"col\">Keywords</th><th scope=\"col\">Key numbers</th><th scope=\"col\">Checked</th></tr></thead><tbody>" +
      R.cards.map(function (c) { return "<tr><td><a href=\"#" + c.id + "\">" + esc(c.title) + "</a></td><td>" + esc(R.scales[c.scale]) + "</td><td>" + esc(c.keywords.join(", ")) + "</td><td>" + (c.numbers.length || "none yet (held back)") + "</td><td>" + esc(c.read) + "</td></tr>"; }).join("") +
      "</tbody></table></div>";
  }
  function usedSources(R) {
    var used = [];
    R.cards.forEach(function (c) { c.numbers.forEach(function (n) { if (used.indexOf(n.src) < 0) used.push(n.src); }); (c.held ? c.held.src : []).forEach(function (s) { if (used.indexOf(s) < 0) used.push(s); }); });
    Object.keys(R.partSources || {}).forEach(function (id) { var p = R.partSources[id]; Object.keys(p).forEach(function (k) { p[k].forEach(function (s) { if (used.indexOf(s) < 0) used.push(s); }); }); });
    return used;
  }
  function sourcesHTML(R) {   // compact entries; what was read sits in a collapsed line under each
    return "<ul class=\"rg-sources\">" + usedSources(R).map(function (k) {
      var s = R.sources[k], t = s.url && s.url !== "no link" ? "<a href=\"" + esc(s.url) + "\">" + esc(s.title) + "</a>" : esc(s.title) + " (no link)";
      return "<li>" + esc(s.publisher) + ". " + t + ". " + esc(cap(s.date)) + ".<details class=\"rg-where\"><summary>What was read</summary><p>" + esc(cap(s.where)) + ".</p></details></li>";
    }).join("") + "</ul>";
  }
  function counts(R) {   // cards per focus, for the filter's labels
    var n = {}; R.cards.forEach(function (c) { n[c.scale] = (n[c.scale] || 0) + 1; }); return n;
  }
  // the filter to show when a link points at card `id`: the current one if it shows that card, otherwise all cards
  function revealFor(R, cur, id) {
    var c = R.cards.filter(function (x) { return x.id === id; })[0];
    return !c || cur === "all" || c.scale === cur ? cur : "all";
  }
  var model = { tilesHTML: tilesHTML, cardHTML: cardHTML, cardsHTML: cardsHTML, guideHTML: guideHTML, compareHTML: compareHTML, sourcesHTML: sourcesHTML, usedSources: usedSources,
    counts: counts, srcRef: srcRef, shortPub: shortPub, revealFor: revealFor, rich: rich, plain: plain };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view: a filter by each card's focus
  var LX = window.LX, H = LX.H;
  LX.mount("regions", function (live, data, root) {
    var R = data.regions, n = counts(R), cur = "all";
    var g = H("div", { class: "lx-seg rg-filter", role: "group", "aria-label": "Show cards by their focus" }, live), b = {};
    var st = H("p", { class: "lx-hint", "aria-live": "polite" }, live);
    [["all", "All " + R.cards.length]].concat(Object.keys(R.scales).map(function (k) { return [k, R.scales[k] + " (" + (n[k] || 0) + ")"]; })).forEach(function (x) {
      b[x[0]] = H("button", { type: "button", text: x[1], "aria-pressed": "false" }, g);
      b[x[0]].addEventListener("click", function () { show(x[0]); });
    });
    function show(k) {
      cur = k;
      Object.keys(b).forEach(function (j) { b[j].setAttribute("aria-pressed", String(j === k)); });
      document.querySelectorAll(".rg-tiles li, .rg-card").forEach(function (el) { el.hidden = k !== "all" && el.getAttribute("data-scale") !== k; });
      st.textContent = k === "all" ? "Showing all " + R.cards.length + " cards." : "Showing the " + n[k] + " cards whose focus is " + R.scales[k].toLowerCase() + "; the others are hidden.";
    }
    // a link to a hidden card (the comparison table, a tile, another page's #id) shows all cards before the browser jumps
    function reveal(id) { var k = revealFor(R, cur, id); if (k !== cur) show(k); }
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href^='#']") : null;
      if (a) reveal(a.getAttribute("href").slice(1));
    });
    window.addEventListener("hashchange", function () {
      var id = location.hash.slice(1), el = id && document.getElementById(id);
      if (el && el.hidden) { reveal(id); el.scrollIntoView(); }
    });
    show("all");
    LX.demo(root, function (state) { if (state === "mid") { show("national"); return { view: "national" }; } return null; });
    root.lxRegions = { model: model, show: show, reveal: reveal };
  });
})();
