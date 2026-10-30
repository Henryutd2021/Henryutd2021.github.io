// pages.js — publications, projects listing and project pages (third redesign, 2026-10-30).
// Inlined on every page (scripts/build_site.py writes pages-js.html), so each part is guarded by element presence.
//   1. BIB buttons: show / hide an entry's BibTeX; copy button (Publications, home page, project pages)
//   2. Publications: search box and type tabs; hides empty year groups; live result count; the pressed type is
//      highlighted in the publications-per-year chart; #journal, #conference, #preprint or #thesis in the URL
//      presses that tab (the About page's stat row, site/_stats.qmd, links there)
//   3. Projects: theme tabs built from the cards; #<theme> in the URL preselects a theme (project breadcrumbs link there)
// Without JS every page is complete: the filter bars stay hidden and the BibTeX panels closed.
(function () {
  "use strict";

  // a polite live region for short confirmations ("BibTeX copied")
  let live = null;
  function announce(msg) {
    if (!live) {
      live = document.createElement("div");
      live.className = "visually-hidden"; live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");
      document.body.appendChild(live);
    }
    live.textContent = ""; window.setTimeout(function () { live.textContent = msg; }, 30);
  }
  const norm = function (s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " "); };

  // ---------- 1. BibTeX ----------
  document.querySelectorAll(".bib-toggle").forEach(function (btn) {
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    if (!panel) return;
    btn.addEventListener("click", function () {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      panel.hidden = open;
    });
  });
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {   // fallback (e.g. file:// previews)
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }
  document.querySelectorAll(".bib-copy").forEach(function (btn) {
    const label = btn.querySelector("span");
    const code = btn.parentElement.querySelector("code");
    if (!code) return;
    btn.addEventListener("click", function () {
      copyText(code.textContent).then(function () {
        btn.classList.add("done"); if (label) label.textContent = "Copied"; announce("BibTeX copied to the clipboard");
      }, function () {
        if (label) label.textContent = "Select and copy"; announce("Copy failed; select the text and copy it");
        const sel = window.getSelection(), range = document.createRange();
        range.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(range);
      }).then(function () {
        window.setTimeout(function () { btn.classList.remove("done"); if (label) label.textContent = "Copy"; }, 1800);
      });
    });
  });

  // pressed-state helper for a group of filter tabs
  function pressTab(tabs, active) {
    tabs.forEach(function (t) { t.setAttribute("aria-pressed", String(t === active)); });
  }

  // ---------- 2. Publications: search and type tabs ----------
  const pubBar = document.querySelector(".pub-filter");
  if (pubBar) {
    const input = pubBar.querySelector("#pub-q");
    const tabs = Array.prototype.slice.call(pubBar.querySelectorAll(".ftab"));
    const groups = Array.prototype.slice.call(document.querySelectorAll(".pub-year"));
    const items = Array.prototype.slice.call(document.querySelectorAll(".pub-years .pub"));
    const status = document.querySelector(".filter-status");
    const empty = document.querySelector(".filter-empty");
    const chart = document.querySelector(".pub-chart");
    const total = items.length;
    let type = "all";
    items.forEach(function (li) {   // search text: badge, title, authors, venue and year (not the BibTeX)
      li._q = norm([".abbr", ".pub-title", ".pub-authors", ".pub-venue"].map(function (s) {
        const el = li.querySelector(s); return el ? el.textContent : "";
      }).join(" ") + " " + li.getAttribute("data-year"));
    });
    function apply() {
      const terms = norm(input.value).trim().split(" ").filter(Boolean);
      let shown = 0;
      items.forEach(function (li) {
        const ok = (type === "all" || li.getAttribute("data-type") === type) && terms.every(function (t) { return li._q.indexOf(t) !== -1; });
        li.hidden = !ok; if (ok) shown++;
      });
      groups.forEach(function (g) { g.hidden = !g.querySelector(".pub:not([hidden])"); });
      if (empty) empty.hidden = shown > 0;
      if (chart) chart.setAttribute("data-type", type);
      if (status) status.textContent = (shown === total && !terms.length) ? "" :
        "Showing " + shown + " of " + total + " publications" + (terms.length ? " matching “" + input.value.trim() + "”" : "") + ".";
    }
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { type = t.getAttribute("data-filter"); pressTab(tabs, t); apply(); });
    });
    input.addEventListener("input", apply);
    input.addEventListener("keydown", function (e) { if (e.key === "Escape" && input.value) { input.value = ""; apply(); } });
    const reset = document.querySelector(".filter-reset");
    if (reset) reset.addEventListener("click", function () { input.value = ""; type = "all"; pressTab(tabs, tabs[0]); apply(); input.focus(); });
    pubBar.hidden = false;
    function typeFromHash() {   // year anchors (#y2026) match no tab and are left alone
      const h = decodeURIComponent((location.hash || "").slice(1));
      const tab = tabs.find(function (t) { return t.getAttribute("data-filter") === h; });
      if (tab) { type = h; pressTab(tabs, tab); apply(); }
    }
    typeFromHash();
    window.addEventListener("hashchange", typeFromHash);
  }

  // ---------- 3. Projects: theme tabs ----------
  const projBar = document.querySelector(".proj-filter");
  const cells = Array.prototype.slice.call(document.querySelectorAll(".project-grid [data-theme]"));
  if (projBar && cells.length) {
    const box = projBar.querySelector(".ftabs");
    const status = document.querySelector(".filter-status");
    const themes = [];   // [key, label, count] in card order
    cells.forEach(function (c) {
      const k = c.getAttribute("data-theme");
      const hit = themes.find(function (t) { return t[0] === k; });
      if (hit) hit[2]++; else themes.push([k, c.getAttribute("data-label"), 1]);
    });
    function makeTab(key, label, n) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ftab" + (key === "all" ? "" : " theme-" + key);
      b.setAttribute("data-filter", key); b.setAttribute("aria-pressed", "false");
      b.innerHTML = (key === "all" ? "" : '<span class="tdot" aria-hidden="true"></span>') + "<span></span> " + '<span class="n">' + n + "</span>";
      b.children[key === "all" ? 0 : 1].textContent = label;
      box.appendChild(b);
      return b;
    }
    const tabs = [makeTab("all", "All", cells.length)].concat(themes.map(function (t) { return makeTab(t[0], t[1], t[2]); }));
    function select(key, push) {
      const tab = tabs.find(function (t) { return t.getAttribute("data-filter") === key; }) || tabs[0];
      key = tab.getAttribute("data-filter");
      pressTab(tabs, tab);
      let shown = 0;
      cells.forEach(function (c) { const ok = key === "all" || c.getAttribute("data-theme") === key; c.hidden = !ok; if (ok) shown++; });
      if (status) status.textContent = key === "all" ? "" : "Showing " + shown + " of " + cells.length + " projects: " + tab.children[1].textContent + ".";
      if (push && window.history && history.replaceState) history.replaceState(null, "", key === "all" ? location.pathname + location.search : "#" + key);
    }
    tabs.forEach(function (t) { t.addEventListener("click", function () { select(t.getAttribute("data-filter"), true); }); });
    projBar.hidden = false;
    const initial = decodeURIComponent((location.hash || "").slice(1));
    select(initial || "all", false);
    window.addEventListener("hashchange", function () { select(decodeURIComponent(location.hash.slice(1)) || "all", false); });
  }
})();
