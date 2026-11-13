/* stakeholders.js — e-stakeholders (who decides, who pays, who benefits): A22's role table and R9's stakeholder map;
   F8, F9, F11 and A13 can reuse them.

   LX.Stakeholders(host, o): a table of roles against questions; on phones each role becomes a card of labeled lines.
     o = { title, lede ([[glossary|marks]]), cols: [{ key, label }],
           rows: [{ key, name, note, cells: { colKey: { v: "yes" | "part" | "no", t: "text with [[marks]]" } } }], note }
     A cell with v shows a filled, half-filled or empty dot and the word Yes, Partly or No, so color is never the only
     cue; t adds a short line. Returns { el, set(rowKey, colKey, text) } (set rewrites a cell's line, e.g. with the
     reader's own picks).
   LX.StakeholderMap(host, o): rings of groups around a study, each group a button that opens what the study owes it.
     o = { rings: [{ ring: "Ring name", items: [{ id, label, owed, also: ["where the group appears", ...] }] }],
           prompt: "Tap a group to see what your study owes it.", alsoLabel: "In", altLabel: "Text version of the map",
           onOpen: function (ringsSeen) {} }
     The first ring is drawn solid, the others dashed; the answer line is aria-live; a "Text version" lists every group.
     Returns { el, open(id) }.
   Pure (Node: require("components/stakeholders.js"); also on LX.Stakeholders): WORD, cellText, staticHTML(o) (the role
   table as a plain table for a no-JS fallback), mapItems(o) (every group with its ring, in order), mapStaticHTML(o) (the
   map as a plain table for a no-JS fallback: group, ring, what it is owed, where it appears; staticTitle, owedHead and
   alsoHead name its parts). Colors: --lx-* only. */
(function () {
  "use strict";
  var WORD = { yes: "Yes", part: "Partly", no: "No" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plain(s) { return String(s == null ? "" : s).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1"); }
  // a cell in words: "Partly: comment at hearings"
  function cellText(x) { x = x || {}; return (x.v ? WORD[x.v] + (x.t ? ": " : "") : "") + plain(x.t || ""); }
  function staticHTML(o) {
    return '<table class="lx-stake-static"><thead><tr><th scope="col">Who</th>' + o.cols.map(function (c) { return '<th scope="col">' + esc(c.label) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      o.rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r.name) + (r.note ? " (" + esc(r.note) + ")" : "") + "</th>" + o.cols.map(function (c) { return "<td>" + esc(cellText(r.cells[c.key])) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }
  function mapItems(o) {
    var out = [];
    o.rings.forEach(function (r, k) { r.items.forEach(function (s) { out.push({ id: s.id, ring: r.ring, k: k, label: s.label, owed: s.owed, also: s.also || [] }); }); });
    return out;
  }
  // the map as a plain table for a no-JS fallback: one row per group (group, ring, what it is owed and, when any group
  // has them, where it appears, joined with "; "), with an optional eyebrow above it. Labels: o.staticTitle (eyebrow;
  // none by default), o.owedHead ("What it is owed"), o.alsoHead (the also column; default o.alsoLabel or "In")
  function mapStaticHTML(o) {
    var items = mapItems(o), also = items.some(function (s) { return s.also.length; });
    return (o.staticTitle ? '<p class="lx-eyebrow">' + esc(o.staticTitle) + "</p>" : "") +
      '<div class="lx-scroll-x"><table class="lx-facts lx-smap-static"><thead><tr><th scope="col">Group</th><th scope="col">Ring</th><th scope="col">' + esc(o.owedHead || "What it is owed") + "</th>" +
      (also ? '<th scope="col">' + esc(o.alsoHead || o.alsoLabel || "In") + "</th>" : "") + "</tr></thead><tbody>" +
      items.map(function (s) { return '<tr><th scope="row">' + esc(s.label) + "</th><td>" + esc(s.ring) + "</td><td>" + esc(plain(s.owed)) + "</td>" + (also ? "<td>" + esc(s.also.join("; ")) + "</td>" : "") + "</tr>"; }).join("") +
      "</tbody></table></div>";
  }
  var pure = { WORD: WORD, cellText: cellText, staticHTML: staticHTML, mapItems: mapItems, mapStaticHTML: mapStaticHTML };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  var LX = window.LX, H = LX.H;
  LX.Stakeholders = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var t = H("table", { class: "lx-stake" }, host), hr = H("tr", null, H("thead", null, t));
    H("th", { scope: "col", text: "Who" }, hr);
    o.cols.forEach(function (c) { H("th", { scope: "col", text: c.label }, hr); });
    var b = H("tbody", null, t), cells = {};
    o.rows.forEach(function (r) {
      var tr = H("tr", null, b), th = H("th", { scope: "row" }, tr); H("b", { text: r.name }, th); if (r.note) H("small", { text: r.note }, th);
      o.cols.forEach(function (c) {
        var x = r.cells[c.key] || {}, td = H("td", { "data-label": c.label }, tr);
        if (x.v) { var mk = H("span", { class: "mk " + x.v }, td); H("i", { "aria-hidden": "true" }, mk); H("span", { text: WORD[x.v] }, mk); }
        cells[r.key + "|" + c.key] = H(x.v ? "small" : "span", { html: LX.rich(x.t || "") }, td);
      });
    });
    if (o.note) H("p", { class: "lx-hint", text: o.note }, host);
    return { el: t, set: function (rowKey, colKey, text) { var c = cells[rowKey + "|" + colKey]; if (c) c.innerHTML = LX.rich(text); } };
  };
  LX.StakeholderMap = function (host, o) {
    var items = mapItems(o), box = H("div", { class: "lx-smap" }, host);
    var owed = H("p", { class: "lx-smap-owed", "aria-live": "polite", text: o.prompt || "Tap a group to see what your study owes it." }, host), seen = {}, chips = {};
    function open(id) {
      var s = items.filter(function (x) { return x.id === id; })[0]; if (!s) return;
      Object.keys(chips).forEach(function (k) { chips[k].setAttribute("aria-pressed", k === id ? "true" : "false"); });
      owed.innerHTML = "<b>" + LX.esc(s.label) + "</b>: " + LX.esc(s.owed) + (s.also.length ? ' <span class="lx-hint">' + LX.esc(o.alsoLabel || "In") + ": " + LX.esc(s.also.join("; ")) + ".</span>" : "");
      seen[s.ring] = true; if (o.onOpen) o.onOpen(Object.keys(seen).length);
    }
    o.rings.forEach(function (r, k) {
      var ring = H("div", { class: "lx-smap-ring r" + k, role: "group", "aria-label": r.ring }, box);
      H("p", { class: "lx-eyebrow", text: (k + 1) + " · " + r.ring }, ring);
      var row = H("div", { class: "lx-smap-chips" }, ring);
      r.items.forEach(function (s) {
        chips[s.id] = H("button", { type: "button", class: "lx-smap-chip", "aria-pressed": "false", text: s.label, onclick: function () { open(s.id); } }, row);
      });
    });
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: o.altLabel || "Text version of the map" }, alt);
    var ul = H("ul", null, alt);
    items.forEach(function (s) { H("li", { text: s.ring + " · " + s.label + ": " + s.owed }, ul); });
    return { el: box, open: open };
  };
  Object.keys(pure).forEach(function (k) { LX.Stakeholders[k] = pure[k]; });
})();
