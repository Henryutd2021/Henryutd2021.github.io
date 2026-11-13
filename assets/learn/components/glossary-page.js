/* glossary-page.js — progressive filtering of the complete, static reference glossary. */
(function () {
  "use strict";
  window.LX.ready(function () {
    var root = document.querySelector("[data-lx-glossary-page]");
    if (!root) return;
    var input = root.querySelector("#glossary-filter"), reset = root.querySelector("#glossary-reset");
    var count = root.querySelector("#glossary-count"), empty = root.querySelector("#glossary-empty");
    var entries = Array.from(root.querySelectorAll(".lx-glossary-entry"));
    var groups = Array.from(root.querySelectorAll(".lx-glossary-group"));
    function normalize(text) {
      return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }
    var searchable = entries.map(function (entry) {
      var aliases = Array.from(entry.querySelectorAll(".lx-glossary-alias")).map(function (a) { return a.id; });
      return normalize(entry.id + " " + aliases.join(" ") + " " + entry.querySelector("h3").textContent + " " + entry.querySelector(".lx-glossary-definition").textContent);
    });
    function filter() {
      var query = normalize(input.value), words = query ? query.split(/\s+/) : [], n = 0;
      entries.forEach(function (entry, i) {
        entry.hidden = !words.every(function (word) { return searchable[i].indexOf(word) >= 0; });
        if (!entry.hidden) n++;
      });
      groups.forEach(function (group) {
        group.hidden = !!query && !Array.from(group.querySelectorAll(".lx-glossary-entry")).some(function (entry) { return !entry.hidden; });
      });
      count.textContent = query ? n + " of " + entries.length + " terms" : entries.length + " terms";
      empty.hidden = n !== 0;
    }
    function clear() { input.value = ""; filter(); input.focus(); }
    function reveal(hash) {
      var id;
      try { id = decodeURIComponent(hash.slice(1)); } catch (e) { return; }
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      var entry = target.closest(".lx-glossary-entry"), group = target.closest(".lx-glossary-group");
      if (!group) return;
      if (group.hidden || (entry && entry.hidden)) { input.value = ""; filter(); }
      (entry || group).scrollIntoView();
      if (entry) entry.focus({ preventScroll: true });
    }
    input.disabled = false; reset.disabled = false;
    input.addEventListener("input", filter);
    input.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); clear(); } });
    reset.addEventListener("click", clear);
    window.addEventListener("hashchange", function () { reveal(location.hash); });
    // A click on the current fragment does not fire hashchange, but may need to undo a filter.
    root.addEventListener("click", function (e) {
      var a = e.target.closest("a"), href = a && a.getAttribute("href");
      if (href && href.charAt(0) === "#") reveal(href);
    });
    filter(); reveal(location.hash);
  });
})();
