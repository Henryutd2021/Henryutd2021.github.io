// pages.js — inner-page behaviour (2026-10-30 redesign): project breadcrumb, theme filter on Projects,
// type filter on Publications. Each feature runs only when its elements exist; without JS the pages are complete.
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // breadcrumb on project pages: Projects / <theme>
  if (document.body.classList.contains("project-page")) {
    const title = document.querySelector("#title-block-header .quarto-title");
    const cat = document.querySelector("#title-block-header .quarto-category");
    if (title && !title.querySelector(".crumbs")) {
      const nav = document.createElement("nav");
      nav.className = "crumbs";
      nav.setAttribute("aria-label", "Breadcrumb");
      const a = document.createElement("a");
      a.href = "../projects.html";
      a.textContent = "Projects";
      const sep = document.createElement("span");
      sep.setAttribute("aria-hidden", "true");
      sep.textContent = "/";
      const here = document.createElement("span");
      here.className = "here";
      here.setAttribute("aria-current", "page");
      here.textContent = cat ? cat.textContent.trim() : "Project";
      nav.append(a, sep, here);
      title.prepend(nav);
    }
  }

  // a row of toggle chips; groups = [{key, label, count, cls}], the first one is "all"
  function filterBar(ariaLabel, before, groups, apply) {
    const bar = document.createElement("div");
    bar.className = "filter-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", ariaLabel);
    groups.forEach(function (g, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter-chip" + (i === 0 ? " is-all" : "") + (g.cls ? " " + g.cls : "");
      b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      b.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="lbl"></span><span class="count"></span>';
      b.querySelector(".lbl").textContent = g.label;
      b.querySelector(".count").textContent = g.count;
      b.addEventListener("click", function () {
        bar.querySelectorAll(".filter-chip").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        apply(g.key);
      });
      bar.appendChild(b);
    });
    before.parentNode.insertBefore(bar, before);
  }
  function show(el, on) {
    el.classList.toggle("is-hidden", !on);
    if (on && !reduce) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
    if (on) el.querySelectorAll(".reveal").forEach(function (r) { r.classList.add("in"); });
    if (on && el.classList.contains("reveal")) el.classList.add("in");
  }

  // Projects: filter cards by research theme (label), colored by theme key
  const grid = document.querySelector(".project-grid");
  if (grid) {
    const items = Array.prototype.slice.call(grid.querySelectorAll("[data-label]"));
    const seen = new Map();
    items.forEach(function (it) {
      const k = it.dataset.label;
      if (!seen.has(k)) seen.set(k, { key: k, label: k, count: 0, cls: "theme-" + it.dataset.theme });
      seen.get(k).count++;
    });
    if (seen.size > 1) {
      filterBar("Filter projects by research theme", grid,
        [{ key: "*", label: "All", count: items.length }].concat(Array.from(seen.values())),
        function (key) { items.forEach(function (it) { show(it, key === "*" || it.dataset.label === key); }); });
    }
  }

  // Publications: filter groups by type
  const groups = Array.prototype.slice.call(document.querySelectorAll(".pub-group[data-group]"));
  if (groups.length > 1) {
    const total = document.querySelectorAll(".pub-group .pub-item").length;
    filterBar("Filter publications by type", groups[0],
      [{ key: "*", label: "All", count: total }].concat(groups.map(function (g) {
        return { key: g.dataset.group, label: g.dataset.label, count: g.querySelectorAll(".pub-item").length, cls: "pt-" + g.dataset.group };
      })),
      function (key) { groups.forEach(function (g) { show(g, key === "*" || g.dataset.group === key); }); });
  }
})();
