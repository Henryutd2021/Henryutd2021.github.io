// pages.js — inner-page behaviour (2026-10-30, second redesign: simple and calm).
//   1. Project pages: a breadcrumb "Projects / <theme>" above the title (replaces the category label).
//   2. Projects: text tabs that filter the cards by research theme.
//   3. Publications: text tabs that filter the groups by type.
// Each feature runs only when its elements exist. Without JS every page is complete; nothing here animates.
(function () {
  // ---------- 1. breadcrumb on project pages ----------
  const title = document.querySelector(".project-page #title-block-header .quarto-title");
  if (title && !title.querySelector(".crumbs")) {
    const cat = title.querySelector(".quarto-category");
    const nav = document.createElement("nav");
    nav.className = "crumbs";
    nav.setAttribute("aria-label", "Breadcrumb");
    const a = document.createElement("a");
    a.href = "../projects.html";
    a.textContent = "Projects";
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "/";
    const here = document.createElement("span");
    here.className = "here";
    here.textContent = cat ? cat.textContent.trim() : "Project";
    nav.append(a, sep, here);
    title.prepend(nav);
    title.classList.add("has-crumbs");   // styles.css then hides the category label it replaces
  }

  // ---------- shared: a row of text tabs (toggle buttons) ----------
  // groups = [{key, label, count, cls}]; the first one is "all". cls (a theme-* class) adds a small colour dot.
  // A visually hidden live region announces how many items are shown after each change.
  function filterTabs(ariaLabel, before, groups, noun, apply) {
    const bar = document.createElement("div");
    bar.className = "filter-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", ariaLabel);
    const status = document.createElement("p");
    status.className = "visually-hidden";
    status.setAttribute("aria-live", "polite");
    groups.forEach(function (g, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter-chip" + (g.cls ? " " + g.cls : "");
      b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      b.setAttribute("aria-label", g.label + " (" + g.count + ")");   // label and count would otherwise run together
      if (g.cls) {
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.setAttribute("aria-hidden", "true");
        b.appendChild(dot);
      }
      const lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = g.label;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = g.count;
      b.append(lbl, count);
      b.addEventListener("click", function () {
        bar.querySelectorAll(".filter-chip").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        apply(g.key);
        status.textContent = "Showing " + g.count + " " + noun + (g.count === 1 ? "" : "s") + (i === 0 ? "" : ": " + g.label);
      });
      bar.appendChild(b);
    });
    before.parentNode.insertBefore(bar, before);
    before.parentNode.insertBefore(status, before);
  }
  function show(el, on) {
    el.classList.toggle("is-hidden", !on);
    if (!on) return;   // content shown by a filter is shown at once (no fade)
    if (el.classList.contains("reveal")) el.classList.add("in");
    el.querySelectorAll(".reveal").forEach(function (r) { r.classList.add("in"); });
  }

  // ---------- 2. Projects: filter cards by research theme ----------
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
      filterTabs("Filter projects by research theme", grid,
        [{ key: "*", label: "All", count: items.length }].concat(Array.from(seen.values())), "project",
        function (key) { items.forEach(function (it) { show(it, key === "*" || it.dataset.label === key); }); });
    }
  }

  // ---------- 3. Publications: filter groups by type ----------
  const groups = Array.prototype.slice.call(document.querySelectorAll(".pub-group[data-group]"));
  if (groups.length > 1) {
    const total = document.querySelectorAll(".pub-group .pub-item").length;
    filterTabs("Filter publications by type", groups[0],
      [{ key: "*", label: "All", count: total }].concat(groups.map(function (g) {
        return { key: g.dataset.group, label: g.dataset.label, count: g.querySelectorAll(".pub-item").length };
      })), "publication",
      function (key) { groups.forEach(function (g) { show(g, key === "*" || g.dataset.group === key); }); });
  }
})();
