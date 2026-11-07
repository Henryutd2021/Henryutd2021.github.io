// regions.js — the twelve regional profile cards (learn/regions.qmd; curriculum v2 §15; wave W6, builder learn-w6-a,
// 2026-11-07). A reference page, not a lesson: the cards themselves are static HTML written from data/regions.json by the
// test's --write mode (so every reader, with or without JavaScript, sees all of them); this script adds a filter by the
// region's dominant scale. Every card has the same six parts: system structure, institutions, main challenges,
// distinctive research questions, verified key numbers (each with its source and date) and the as-of date.
// Tests: node _tests/learn/test_regions.js [--write]. Shared components: LX.H, LX.mount.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure writers (no DOM; exported for Node)
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function shortPub(s) { return s.publisher.split(",")[0].replace(/ \(.*$/, ""); }
  function srcRef(R, key) {   // "(Publisher, date)", linked when the source has an allow-listed address
    var s = R.sources[key], d = s.date.split(";")[0], txt = esc(shortPub(s)) + ", " + esc(d);
    return "<span class=\"rg-src\">(" + (s.url && s.url !== "no link" ? "<a href=\"" + esc(s.url) + "\">" + txt + "</a>" : txt) + ")</span>";
  }
  function tilesHTML(R) {
    return "<ul class=\"rg-tiles\">" + R.cards.map(function (c) {
      return "<li data-scale=\"" + c.scale + "\"><a href=\"#" + c.id + "\"><b>" + esc(c.title) + "</b><span>" + esc(R.scales[c.scale]) + "</span><i>" + esc(c.keywords.join(" · ")) + "</i></a></li>";
    }).join("") + "</ul>";
  }
  function cardHTML(R, c) {
    return "<article class=\"lx-card rg-card\" id=\"" + c.id + "\" data-scale=\"" + c.scale + "\">" +
      "<header class=\"rg-head\"><h3>" + esc(c.title) + "</h3><p class=\"rg-tags\">" + esc(R.scales[c.scale]) + " · " + esc(c.keywords.join(" · ")) + "</p></header>" +
      (c.note ? "<p class=\"lx-hint rg-note\">" + esc(c.note) + "</p>" : "") +
      "<dl class=\"rg-parts\">" + R.parts.map(function (p) {
        return "<div class=\"rg-part\"><dt>" + esc(p.label) + "</dt><dd><ul>" + c[p.key].map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></dd></div>";
      }).join("") + "</dl>" +
      "<div class=\"rg-nums\"><p class=\"lx-eyebrow\">Verified key numbers</p><ul>" + c.numbers.map(function (n) { return "<li>" + esc(n.text) + " " + srcRef(R, n.src) + "</li>"; }).join("") + "</ul></div>" +
      "<p class=\"rg-asof\"><b>As of " + esc(c.read) + "</b>, when each number was read on its source; each source line gives its own date.</p>" +
      "<p class=\"rg-top\"><a href=\"#cards\">Back to all regions</a></p></article>";
  }
  function cardsHTML(R) { return R.cards.map(function (c) { return cardHTML(R, c); }).join("\n"); }
  function compareHTML(R) {
    return "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table rg-compare\"><thead><tr><th scope=\"col\">Region</th><th scope=\"col\">Dominant scale</th><th scope=\"col\">Keywords</th><th scope=\"col\">Key numbers</th><th scope=\"col\">As of</th></tr></thead><tbody>" +
      R.cards.map(function (c) { return "<tr><td><a href=\"#" + c.id + "\">" + esc(c.title) + "</a></td><td>" + esc(R.scales[c.scale]) + "</td><td>" + esc(c.keywords.join(", ")) + "</td><td>" + c.numbers.length + "</td><td>" + esc(c.read) + "</td></tr>"; }).join("") +
      "</tbody></table></div>";
  }
  function sourcesHTML(R) {
    var used = [];
    R.cards.forEach(function (c) { c.numbers.forEach(function (n) { if (used.indexOf(n.src) < 0) used.push(n.src); }); });
    Object.keys(R.partSources || {}).forEach(function (id) { var p = R.partSources[id]; Object.keys(p).forEach(function (k) { p[k].forEach(function (s) { if (used.indexOf(s) < 0) used.push(s); }); }); });
    return "<ul>" + used.map(function (k) {
      var s = R.sources[k], t = s.url && s.url !== "no link" ? "<a href=\"" + esc(s.url) + "\">" + esc(s.title) + "</a>" : esc(s.title) + " (no link)";
      return "<li>" + esc(s.publisher) + ". " + t + ". " + esc(cap(s.date)) + ". " + esc(cap(s.where)) + ".</li>";
    }).join("") + "</ul>";
  }
  function counts(R) {   // cards per dominant scale, for the filter's labels
    var n = {}; R.cards.forEach(function (c) { n[c.scale] = (n[c.scale] || 0) + 1; }); return n;
  }
  var model = { tilesHTML: tilesHTML, cardHTML: cardHTML, cardsHTML: cardsHTML, compareHTML: compareHTML, sourcesHTML: sourcesHTML, counts: counts, srcRef: srcRef };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view: a filter by dominant scale
  var LX = window.LX, H = LX.H;
  LX.mount("regions", function (live, data, root) {
    var R = data.regions, n = counts(R), cur = "all";
    var g = H("div", { class: "lx-seg rg-filter", role: "group", "aria-label": "Show regions by their dominant scale" }, live), b = {};
    var st = H("p", { class: "lx-hint", "aria-live": "polite" }, live);
    [["all", "All " + R.cards.length]].concat(Object.keys(R.scales).map(function (k) { return [k, R.scales[k] + " (" + (n[k] || 0) + ")"]; })).forEach(function (x) {
      b[x[0]] = H("button", { type: "button", text: x[1], "aria-pressed": "false" }, g);
      b[x[0]].addEventListener("click", function () { show(x[0]); });
    });
    function show(k) {
      cur = k;
      Object.keys(b).forEach(function (j) { b[j].setAttribute("aria-pressed", String(j === k)); });
      document.querySelectorAll(".rg-tiles li, .rg-card").forEach(function (el) { el.hidden = k !== "all" && el.getAttribute("data-scale") !== k; });
      st.textContent = k === "all" ? "Showing all " + R.cards.length + " cards." : "Showing " + n[k] + " cards whose dominant scale is " + R.scales[k].toLowerCase() + "; the others are hidden.";
    }
    show("all");
    LX.demo(root, function (state) { if (state === "mid") { show("national"); return { view: "national" }; } return null; });
    root.lxRegions = { model: model, show: show };
  });
})();
