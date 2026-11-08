/* linkedviews.js — LX.LinkedViews: the same model shown several ways (in words, in symbols, as a table), linked: tap a line
   in any view and the same part lights up in every view, and the lesson can light it on its chart too
   (lesson 10, step 8).
   var lv = LX.LinkedViews(host, {
     panels: [{title: "In words", items: [{key: "demand", html: "<b>Demand:</b> at least 145 MW."}, {html: "Not linked."}]},
              {title: "In symbols", items: [...]}],                   // an item without a key is a plain line
     table: {title: "As a table", head: ["Rule", "x", "y", "Limit"], rows: [{key: "demand", cells: ["Demand", 1, 1, "≥ 145"], label}]},
     hint: "One sentence under the views.",
     onPick: function (key) {}                                        // e.g. highlight the same rule on the chart
   });
   lv.update({panels, table})   rebuild the lines (same titles, new numbers)     lv.pick(key)   light up one part
   Layout: the panels in two columns and the table across the full width; one column under 640 px; a wide table scrolls
   inside its own box. Keyboard: the lines are buttons with aria-pressed, the table rows take focus (Enter or Space picks).
   The views are text, so they are their own text version. Symbols: wrap them in <span class="lx-lv-sym"> (<var> for letters). */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.LinkedViews = function (host, o) {
    var w = H("div", { class: "lx-lv" }, host), rows = {}, lists = [], tbody = null;
    (o.panels || []).forEach(function (p) { var v = H("div", { class: "lx-lv-view" }, w); H("h4", { text: p.title }, v); lists.push(v); });
    if (o.table) {
      var vt = H("div", { class: "lx-lv-view tbl" }, w); H("h4", { text: o.table.title }, vt);
      var tb = H("table", { class: "lx-lv-tbl" }, H("div", { class: "lx-lv-tblwrap" }, vt)), thr = H("tr", null, H("thead", null, tb));
      (o.table.head || []).forEach(function (t) { H("th", { scope: "col", text: t }, thr); });
      tbody = H("tbody", null, tb);
    }
    if (o.hint) H("p", { class: "lx-hint", text: o.hint }, host);
    function pick(k) {
      Object.keys(rows).forEach(function (q) {
        rows[q].forEach(function (e) { e.classList.toggle("on", q === k); if (e.tagName === "BUTTON") e.setAttribute("aria-pressed", q === k ? "true" : "false"); });
      });
      if (o.onPick) o.onPick(k);
    }
    function keep(k, el) { (rows[k] = rows[k] || []).push(el); }
    function update(c) {
      rows = {};
      (c.panels || []).forEach(function (p, i) {
        var v = lists[i]; if (!v) return;
        [].slice.call(v.querySelectorAll(".lx-lv-row")).forEach(function (e) { e.remove(); });
        p.items.forEach(function (it) {
          if (it.key == null) { H("p", { class: "lx-lv-row static", html: it.html }, v); return; }
          var b = H("button", { type: "button", class: "lx-lv-row", "data-k": it.key, "aria-pressed": "false", html: it.html }, v);
          b.addEventListener("click", function () { pick(it.key); });
          keep(it.key, b);
        });
      });
      if (tbody && c.table) {
        tbody.innerHTML = "";
        c.table.rows.forEach(function (r) {
          var tr = H("tr", { tabindex: "0", "data-k": r.key, "aria-label": (r.label || r.cells[0]) + " row" }, tbody);
          r.cells.forEach(function (x) { H("td", { text: String(x) }, tr); });
          tr.addEventListener("click", function () { pick(r.key); });
          tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(r.key); } });
          keep(r.key, tr);
        });
      }
    }
    update(o);
    return { el: w, update: update, pick: pick };
  };
})();
