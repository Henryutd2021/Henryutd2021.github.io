/* conceptmap.js — LX.ConceptMap: the lesson's ideas as tappable nodes joined by labeled arrows, with a detail panel.
   LX.ConceptMap(host, { title: "The ideas, and how they connect", lede: "Tap an idea.",
     groups: { bal: ["Balance", "var(--lx-good)"], ... },
     nodes: [{ id: "balance", g: "bal", label: "Balance", lines: ["Two", "lines"], (on phones), text: "One or two sentences.",
               game: "Where it appeared in the game.", at: [col, row], atN: [col, row], (on phones), later: "Lesson 10 ..." }],
     edges: [["supply", "balance", "must equal"], ...],
     cols: 4, rows: 4, colsN: 3, rowsN: 5,           grid positions may be fractional (1.5 = halfway between columns)
     sel: "balance", moment: function (id) { return "Your shift: ..." | null; },
     gameLabel: "In the lesson" });                  heading of each node's `game` line (default: "In the game" on play-form pages, else "In this lesson")
   An edge's words are optional: without them it reads "links to" in the text version and the panel, and draws no label.
   Nodes are keyboard buttons; the panel is announced; a "Text version" lists every idea with what its panel says (text,
   the game or lesson line under its heading, the later line) and every link, for screen readers and without the map.
   Under 620 px the map switches to the phone grid (atN) and hides edge labels (they stay in the panel). */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H, S = LX.S;
  // a link's words; a link given without them reads "links to" (never "undefined") and draws no label on the map
  function rel(e) { return e[2] != null && String(e[2]).trim() ? String(e[2]) : "links to"; }
  LX.ConceptMap = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host);
    var tag = LX.hTag(3, hd), sub = "h" + (+tag.charAt(1) + 1);   // an h2 right under the page title; the panel's heading one below
    H(tag, { text: o.title || "The ideas, and how they connect" }, hd);
    var gl = H("div", { class: "lx-cgroups", "aria-hidden": "true" }, hd);
    Object.keys(o.groups).forEach(function (k) { var s = H("span", null, gl); H("i", { style: "--c:" + o.groups[k][1] }, s); H("span", { text: o.groups[k][0] }, s); });
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var wrap = H("div", { class: "lx-cmap" }, host), svgBox = H("div", null, wrap);
    var det = H("div", { class: "lx-cdetail", "aria-live": "polite" }, wrap);
    var byId = {}; o.nodes.forEach(function (n) { byId[n.id] = n; });
    var sel = o.sel || o.nodes[0].id, mode = null, nodes = {}, edges = [], mk = LX.uid("cm");
    // text version: every idea with what its panel says (its text, its game or lesson line, its "later" line) and its links
    var gameHead = o.gameLabel || (LX.lesson && LX.lesson() && LX.lesson().form === "play" ? "In the game" : "In this lesson");
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version of the map" }, alt);
    var ul = H("ul", null, alt);
    o.nodes.forEach(function (n) {
      var links = o.edges.filter(function (e) { return e[0] === n.id || e[1] === n.id; }).map(function (e) {
        return e[0] === n.id ? n.label + " " + rel(e) + " " + byId[e[1]].label : byId[e[0]].label + " " + rel(e) + " " + n.label;
      });
      H("li", { html: "<b>" + LX.esc(n.label) + "</b>: " + LX.rich(n.text) + (n.game ? " <i>" + LX.esc(gameHead) + ":</i> " + LX.rich(n.game) : "") +
        (n.later ? " " + LX.rich(n.later) : "") + (links.length ? " Links: " + LX.esc(links.join("; ")) + "." : "") }, ul);
    });
    function pos(n, m) {
      var narrow = m === "narrow", at = narrow ? (n.atN || n.at) : n.at;
      var W = narrow ? 360 : 760, pad = narrow ? 62 : 90, cols = (narrow ? o.colsN : o.cols) || 4, rh = narrow ? 112 : 116;
      return [pad + at[0] * (W - 2 * pad) / Math.max(1, cols - 1), 46 + at[1] * rh];
    }
    function build() {
      var m = wrap.clientWidth < 620 ? "narrow" : "wide";
      if (m === mode) return; mode = m;
      wrap.classList.toggle("narrow", m === "narrow");
      svgBox.innerHTML = ""; nodes = {}; edges = [];
      var rows = (m === "narrow" ? o.rowsN : o.rows) || 4, W = m === "narrow" ? 360 : 760, Hh = 46 * 2 + (rows - 1) * (m === "narrow" ? 112 : 116);
      var svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, role: "group", "aria-label": (o.title || "Concept map") + ": select an idea for its details" }, svgBox);
      var defs = S("defs", null, svg), mkr = S("marker", { id: mk, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
      S("path", { d: "M0 1 L9 5 L0 9 z", fill: "var(--lx-ink-3)" }, mkr);
      var eg = S("g", null, svg), ng = S("g", null, svg), size = {}, P = {};
      o.nodes.forEach(function (n) {
        var lines = m === "narrow" && n.lines ? n.lines : [n.label];
        var wd = Math.max.apply(null, lines.map(function (t) { return t.length; })) * 7.7 + 26;
        if (m === "narrow") wd = Math.min(wd, 108);
        size[n.id] = [wd, 14 + lines.length * 17]; P[n.id] = pos(n, m);
      });
      function edgePt(p, q, s) { var dx = q[0] - p[0], dy = q[1] - p[1]; var tx = dx ? (s[0] / 2 + 4) / Math.abs(dx) : 1e9, ty = dy ? (s[1] / 2 + 4) / Math.abs(dy) : 1e9, t = Math.min(tx, ty); return [p[0] + dx * t, p[1] + dy * t]; }
      // a link's label sits at the middle of its line; when two links cross there, the later label moves along its
      // own line (40%, 60%, 30%, 70% of the way) to the first place where it meets no earlier label
      var taken = [], meets = function (x, y, w) { return taken.some(function (t) { return Math.abs(t[0] - x) < (t[2] + w) / 2 + 4 && Math.abs(t[1] - y) < 15; }); };
      o.edges.forEach(function (e) {
        var a = P[e[0]], b = P[e[1]], g = S("g", { class: "cedge" }, eg);
        var p1 = edgePt(a, b, size[e[0]]), p2 = edgePt(b, a, size[e[1]]);
        S("path", { d: "M" + p1[0] + " " + p1[1] + " L" + p2[0] + " " + p2[1], "marker-end": "url(#" + mk + ")" }, g);
        var words = e[2] != null ? String(e[2]).trim() : "", lw = words.length * 6.2, dy = Math.abs(p1[1] - p2[1]) < 2 ? -6 : 4, at = function (f) { return [p1[0] + (p2[0] - p1[0]) * f, p1[1] + (p2[1] - p1[1]) * f + dy]; };
        var spot = [0.5, 0.4, 0.6, 0.3, 0.7].map(at).filter(function (q) { return !meets(q[0], q[1], lw); })[0] || at(0.5);
        var mx = spot[0], my = spot[1];
        if (words) {
          taken.push([spot[0], spot[1], lw]);
          S("text", { x: mx, y: my, "text-anchor": "middle", class: "bg" }, g).textContent = words;
          S("text", { x: mx, y: my, "text-anchor": "middle" }, g).textContent = words;
        }
        edges.push({ g: g, a: e[0], b: e[1] });
      });
      o.nodes.forEach(function (n) {
        var p = P[n.id], s = size[n.id], lines = m === "narrow" && n.lines ? n.lines : [n.label];
        var g = S("g", { class: "cnode", tabindex: 0, role: "button", "aria-label": n.label, "aria-pressed": "false", style: "--c:" + o.groups[n.g][1] }, ng);
        S("rect", { x: p[0] - s[0] / 2, y: p[1] - s[1] / 2, width: s[0], height: s[1], rx: 10 }, g);
        S("rect", { class: "grp", x: p[0] - s[0] / 2 + 8, y: p[1] + s[1] / 2 - 5, width: s[0] - 16, height: 2.5, rx: 1.2 }, g);
        lines.forEach(function (ln, i) { S("text", { x: p[0], y: p[1] - (lines.length - 1) * 8.5 + i * 17 + 4, "text-anchor": "middle" }, g).textContent = ln; });
        g.addEventListener("click", function () { select(n.id); });
        g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(n.id); } });
        nodes[n.id] = g;
      });
      select(sel, true);
    }
    function select(id) {
      sel = id; var nb = {}; nb[id] = 1;
      edges.forEach(function (e) { var on = e.a === id || e.b === id; e.g.classList.toggle("on", on); e.g.classList.toggle("dim", !on); if (on) { nb[e.a] = 1; nb[e.b] = 1; } });
      Object.keys(nodes).forEach(function (k) { nodes[k].classList.toggle("sel", k === id); nodes[k].setAttribute("aria-pressed", k === id ? "true" : "false"); nodes[k].classList.toggle("dim", !nb[k]); });
      var n = byId[id]; det.innerHTML = "";
      H("p", { class: "lx-eyebrow", text: o.groups[n.g][0] }, det);
      H(sub, { text: n.label }, det); H("p", { html: LX.rich(n.text) }, det);
      if (n.game) { var ig = H("div", { class: "ingame" }, det); H("b", { text: gameHead }, ig); H("span", { html: LX.rich(n.game) }, ig);
        var gm = o.moment && o.moment(id); if (gm) H("div", { class: "you", text: gm }, ig); }
      var links = o.edges.filter(function (e) { return e[0] === id || e[1] === id; });
      if (links.length) {
        var lk = H("div", { class: "ingame" }, det); H("b", { text: "Connects to" }, lk);
        var ch = H("div", { class: "lx-chips" }, lk);
        links.forEach(function (e) {
          var other = e[0] === id ? e[1] : e[0], on = byId[other];
          var b = H("button", { class: "lx-chip", type: "button", style: "--c:" + o.groups[on.g][1] }, ch);
          H("i", null, b); H("span", { text: on.label }, b); H("small", { text: rel(e) }, b);
          b.addEventListener("click", function () { select(other); if (nodes[other]) nodes[other].focus({ preventScroll: true }); });
        });
      }
      if (n.later) H("p", { class: "lx-hint", html: LX.rich(n.later) }, det);
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(wrap)) build(); }).observe(wrap);
    setTimeout(build, 0);
    return { build: build, select: function (id) { build(); select(id); } };
  };
})();
