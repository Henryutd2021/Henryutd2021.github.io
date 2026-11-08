/* sankey.js — LX.Sankey: energy flows drawn as bands whose width keeps the value (i-sankey, e-sankey: F3, F4, F9 and
   F10). First written for F3; its styles are in sankey.css.
   Pure (Node: require("assets/learn/components/sankey.js") = { layout, band, flows }; page: LX.Sankey.layout, .band,
   .flows): the layout of a spec in a W x H box, a band's ribbon path, and each node's flows in and out.
   View: LX.Sankey(host, opts) -> { el, set(spec), pick(id), layout(), readout } (options below). */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure layout (no DOM; exported for Node)
  // spec  = { nodes: [{ id, label, short, col, color, kind, note }], links: [{ from, to, value, color }] }
  //   col    the node's column, 0 = left; nodes keep their order inside a column (top to bottom)
  //   kind   "loss" draws the node and the flows into it pale and hatched (energy that leaves as waste heat)
  //   value  of a node = the larger of what flows in and what flows out (a source has only outflows, a sink only inflows)
  // layout(spec, W, H, o) -> { nodes: {id: {x, y, h, v, vin, vout, col, ...}}, order: [ids], links: [{..., sy, ty, w}],
  //   k (px per unit), cols, W, H, nodeW }. Bands keep the value: w = value × k in every column (one scale for the whole
  //   drawing: the column with the most energy and gaps fills the height). Zero-value links are dropped from the drawing.
  function sankeyLayout(spec, W, H, o) {
    o = o || {};
    var nodeW = o.nodeW || 12, gap = o.gap == null ? 14 : o.gap, padT = o.padT || 2, padB = o.padB || 2;
    var nodes = {}, order = [], cols = 0;
    spec.nodes.forEach(function (n) {
      var c = {}; for (var k in n) c[k] = n[k];
      c.vin = 0; c.vout = 0; c.col = n.col || 0; nodes[n.id] = c; order.push(n.id);
      cols = Math.max(cols, c.col + 1);
    });
    var links = [];
    spec.links.forEach(function (l, i) {
      if (!nodes[l.from] || !nodes[l.to]) throw new Error("Sankey: link " + l.from + " -> " + l.to + " names an unknown node");
      if (!(l.value > 0)) return;
      var c = {}; for (var k in l) c[k] = l[k];
      c.i = i; c.key = l.from + ">" + l.to; links.push(c);
      nodes[l.from].vout += l.value; nodes[l.to].vin += l.value;
    });
    order.forEach(function (id) { var n = nodes[id]; n.v = Math.max(n.vin, n.vout); });
    var byCol = [];
    for (var c = 0; c < cols; c++) byCol.push(order.filter(function (id) { return nodes[id].col === c && nodes[id].v > 0; }));
    var avail = H - padT - padB, k = Infinity;
    byCol.forEach(function (ids) {
      if (!ids.length) return;
      var sum = ids.reduce(function (s, id) { return s + nodes[id].v; }, 0);
      k = Math.min(k, (avail - gap * (ids.length - 1)) / sum);
    });
    if (!isFinite(k) || k < 0) k = 0;
    byCol.forEach(function (ids, ci) {
      var hc = ids.reduce(function (s, id) { return s + nodes[id].v * k; }, 0) + gap * Math.max(0, ids.length - 1);
      var y = padT + (avail - hc) / 2;
      ids.forEach(function (id) {
        var n = nodes[id];
        n.x = cols === 1 ? 0 : (W - nodeW) * ci / (cols - 1);
        n.y = y; n.h = n.v * k; y += n.h + gap;
      });
    });
    order.forEach(function (id) { var n = nodes[id]; if (n.v === 0) { n.x = 0; n.y = 0; n.h = 0; } });
    // stack the bands: out of a node in the order of their targets (top first), into a node in the order of their sources
    order.forEach(function (id) {
      var n = nodes[id], acc = 0;
      links.filter(function (l) { return l.from === id; })
        .sort(function (a, b) { return nodes[a.to].y - nodes[b.to].y || a.i - b.i; })
        .forEach(function (l) { l.w = l.value * k; l.sy = n.y + acc; acc += l.w; });
      acc = 0;
      links.filter(function (l) { return l.to === id; })
        .sort(function (a, b) { return nodes[a.from].y - nodes[b.from].y || a.i - b.i; })
        .forEach(function (l) { l.ty = n.y + acc; acc += l.w; });
    });
    return { nodes: nodes, order: order, links: links, k: k, cols: cols, W: W, H: H, nodeW: nodeW, byCol: byCol };
  }
  // the band between two columns: a filled ribbon of constant width w, from (x0, sy) to (x1, ty)
  function sankeyBand(x0, sy, x1, ty, w) {
    var xm = (x0 + x1) / 2, f = function (v) { return Math.round(v * 10) / 10; };
    return "M" + f(x0) + " " + f(sy) + "C" + f(xm) + " " + f(sy) + " " + f(xm) + " " + f(ty) + " " + f(x1) + " " + f(ty) +
      "L" + f(x1) + " " + f(ty + w) + "C" + f(xm) + " " + f(ty + w) + " " + f(xm) + " " + f(sy + w) + " " + f(x0) + " " + f(sy + w) + "Z";
  }
  // per node: what flows in and out (for spoken labels, the readout and tests); balance = in − out (0 for a pass-through)
  function sankeyFlows(spec) {
    var out = {};
    spec.nodes.forEach(function (n) { out[n.id] = { inn: [], out: [], vin: 0, vout: 0 }; });
    spec.links.forEach(function (l) {
      if (!(l.value > 0)) return;
      out[l.from].out.push(l); out[l.from].vout += l.value;
      out[l.to].inn.push(l); out[l.to].vin += l.value;
    });
    return out;
  }
  var sankey = { layout: sankeyLayout, band: sankeyBand, flows: sankeyFlows };
  if (typeof module !== "undefined" && module.exports) module.exports = sankey;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S;
  // LX.Sankey(host, opts) -> { el, set(spec), pick(id), layout() }
  //   opts: label (aria name of the drawing), unit ("kWh"), fmt(v) (default: whole numbers with commas), height (px, wide
  //   screens), heightN (px, under 560 px), describe(node, flows) (the readout sentence; default: in and out with values),
  //   caption (shown above the text version), textHead ([from, to, value] column titles), onPick(id), badges ("auto":
  //   under 560 px with three or more columns every node gets a numbered badge and a key below names it; true; false),
  //   colNames (headings for the key, one per column), lede (one line above). Labels sit right of their bars; the last
  //   column's labels get a reserved right margin, so no label crosses another column
  // Nodes are buttons (Tab, Enter, Space): picking one dims the other flows and says what flows in and out (aria-live).
  // Redraws at its real width on resize and tweens between specs (not under reduced motion). Colours: tokens only.
  function defFmt(v) { return Math.round(v).toLocaleString("en-US"); }

  LX.Sankey = function (host, o) {
    o = o || {};
    var fmt = o.fmt || defFmt, unit = o.unit || "", spec = null, L = null, prev = null, pickId = null, raf = 0;
    var w = H("figure", { class: "lx-sk" }, host);
    if (o.lede) H("p", { class: "lx-sk-lede", html: LX.rich(o.lede) }, w);
    var box = H("div", { class: "lx-sk-box" }, w);
    var svg = S("svg", { role: "group", "aria-label": o.label || "Energy flows" }, box);
    var key = H("ol", { class: "lx-sk-key", hidden: true }, w);
    var read = H("p", { class: "lx-sk-read", "aria-live": "polite" }, w);
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the flows" }, alt);
    var altBody = H("div", { class: "lx-scroll-x" }, alt);
    function u(v) { return fmt(v) + (unit ? " " + unit : ""); }
    function name(n, narrow) { return (narrow && n.short) || n.label; }
    function describe(id) {
      var n = L.nodes[id], F = sankey.flows(spec)[id];
      if (o.describe) return o.describe(n, F, u);
      var parts = ["<b>" + LX.esc(n.label) + "</b>: " + u(n.v)];
      if (F.inn.length && F.out.length) parts.push("in from " + F.inn.map(function (l) { return LX.esc(spec.nodes.filter(function (m) { return m.id === l.from; })[0].label.toLowerCase()) + " " + u(l.value); }).join(", "));
      if (F.out.length) parts.push((F.inn.length ? "out to " : "to ") + F.out.map(function (l) { return LX.esc(spec.nodes.filter(function (m) { return m.id === l.to; })[0].label.toLowerCase()) + " " + u(l.value); }).join(", "));
      else if (F.inn.length) parts.push("from " + F.inn.map(function (l) { return LX.esc(spec.nodes.filter(function (m) { return m.id === l.from; })[0].label.toLowerCase()) + " " + u(l.value); }).join(", "));
      return parts.join("; ") + ".";
    }
    function textTable() {
      var head = o.textHead || ["From", "To", unit || "Amount"], byId = {};
      spec.nodes.forEach(function (n) { byId[n.id] = n; });
      var rows = spec.links.filter(function (l) { return l.value > 0; }).map(function (l) {
        return "<tr><td>" + LX.esc(byId[l.from].label) + "</td><td>" + LX.esc(byId[l.to].label) + "</td><td>" + LX.esc(fmt(l.value)) + "</td></tr>";
      }).join("");
      altBody.innerHTML = (o.caption ? '<p class="lx-hint">' + LX.rich(o.caption) + "</p>" : "") +
        '<table class="lx-mini-table"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + LX.esc(h) + "</th>"; }).join("") +
        "</tr></thead><tbody>" + rows + "</tbody></table>";
    }
    function width() { return Math.max(240, Math.round(box.clientWidth || host.clientWidth || 600)); }
    function narrowNow() { return width() < 560; }
    // geometry of a layout, keyed for tweening
    function geo(Lx) {
      var g = { n: {}, l: {} };
      Lx.order.forEach(function (id) { var n = Lx.nodes[id]; g.n[id] = { x: n.x, y: n.y, h: n.h }; });
      Lx.links.forEach(function (l) { g.l[l.key] = { sy: l.sy, ty: l.ty, w: l.w }; });
      return g;
    }
    function lerpGeo(a, b, t) {
      var g = { n: {}, l: {} }, k;
      for (k in b.n) { var p = a.n[k] || { x: b.n[k].x, y: b.n[k].y + b.n[k].h / 2, h: 0 }; g.n[k] = { x: LX.lerp(p.x, b.n[k].x, t), y: LX.lerp(p.y, b.n[k].y, t), h: LX.lerp(p.h, b.n[k].h, t) }; }
      for (k in b.l) { var q = a.l[k] || { sy: b.l[k].sy + b.l[k].w / 2, ty: b.l[k].ty + b.l[k].w / 2, w: 0 }; g.l[k] = { sy: LX.lerp(q.sy, b.l[k].sy, t), ty: LX.lerp(q.ty, b.l[k].ty, t), w: LX.lerp(q.w, b.l[k].w, t) }; }
      return g;
    }
    function colsOf(sp) { return sp.nodes.reduce(function (m, n) { return Math.max(m, (n.col || 0) + 1); }, 0); }
    // phones: with three or more columns every node gets a numbered badge and the key below names it, so no label can
    // overlap another; otherwise each label sits right of its bar, and the last column's labels get a reserved margin
    function badgeMode() { return o.badges === true || (o.badges !== false && narrowNow() && colsOf(spec) > 2); }
    function labelText(n, narrow) { return name(n, narrow) + " " + fmt(n.v); }
    function textW(t) { return t.length * 6.9 + 4; }
    function draw(g) {
      var narrow = narrowNow(), Wd = L.W, Hd = L.H, nodeW = L.nodeW, badges = badgeMode();
      svg.setAttribute("viewBox", "0 0 " + Wd + " " + Hd);
      svg.innerHTML = "";
      var gl = S("g", { class: "bands" }, svg), gn = S("g", { class: "nodes" }, svg), keyItems = [], nb = 0, lastCol = -1;
      L.links.forEach(function (l) {
        var a = L.nodes[l.from], b = L.nodes[l.to], gg = g.l[l.key];
        var loss = b.kind === "loss" || a.kind === "loss";
        var col = l.color || (loss ? "var(--lx-ink-3)" : a.color || "var(--lx-ink-3)");
        var pth = S("path", { class: "band" + (loss ? " loss" : ""), d: sankeyBand(g.n[l.from].x + nodeW, gg.sy, g.n[l.to].x, gg.ty, gg.w), style: "fill:" + col, "data-from": l.from, "data-to": l.to }, gl);
        if (pickId && (l.from === pickId || l.to === pickId)) pth.classList.add("on");
      });
      L.order.slice().sort(function (a, b) { return L.nodes[a].col - L.nodes[b].col || L.order.indexOf(a) - L.order.indexOf(b); }).forEach(function (id) {
        var n = L.nodes[id]; if (!(n.v > 0)) return;
        var gg = g.n[id];
        var nd = S("g", { class: "node" + (n.kind === "loss" ? " loss" : "") + (pickId === id ? " on" : ""), tabindex: "0", role: "button", "data-id": id,
          "aria-pressed": pickId === id ? "true" : "false", "aria-label": n.label + ", " + u(n.v) + (n.note ? ". " + n.note : "") }, gn);
        S("rect", { x: gg.x, y: gg.y, width: nodeW, height: Math.max(1, gg.h), rx: 2, style: "fill:" + (n.color || "var(--lx-ink-3)") }, nd);
        S("rect", { class: "hit", x: gg.x - 3, y: gg.y - 3, width: nodeW + 6, height: Math.max(1, gg.h) + 6, rx: 3 }, nd);
        var cy = gg.y + gg.h / 2;
        if (badges) {
          nb++;
          var bx = gg.x + nodeW + 10;
          S("circle", { class: "badge", cx: bx, cy: cy, r: 7.5 }, nd);
          var tb = S("text", { class: "badge", x: bx, y: cy + 3.8, "text-anchor": "middle", "aria-hidden": "true" }, nd); tb.textContent = String(nb);
          if (o.colNames && n.col !== lastCol) { lastCol = n.col; keyItems.push('<li class="h">' + LX.esc((o.colNames[n.col] || "") + (unit ? ", " + unit : "")) + "</li>"); }
          keyItems.push("<li><b>" + nb + "</b><span>" + LX.esc(name(n, true)) + " <i>" + LX.esc(fmt(n.v)) + (o.colNames ? "" : " " + unit) + "</i></span></li>");
        } else {
          var t = S("text", { x: gg.x + nodeW + 5, y: cy + 4.2, "text-anchor": "start", "aria-hidden": "true" }, nd);
          var t1 = S("tspan", null, t); t1.textContent = name(n, narrow) + " ";
          var t2 = S("tspan", { class: "v" }, t); t2.textContent = fmt(n.v);
        }
        nd.addEventListener("click", function () { pick(pickId === id ? null : id); });
        nd.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(pickId === id ? null : id); } });
      });
      key.hidden = !keyItems.length; key.innerHTML = keyItems.join("");
    }
    function layoutNow() {
      var narrow = narrowNow(), Hh = narrow ? (o.heightN || o.height || 300) : (o.height || 260), W = width(), bm = badgeMode(), last = colsOf(spec) - 1, pad = 0;
      if (bm) pad = 20;
      else if (last > 0) spec.nodes.forEach(function (n) { if ((n.col || 0) === last) pad = Math.max(pad, textW(labelText(n, narrow)) + 6); });
      var Lx = sankeyLayout(spec, Math.max(120, W - pad), Hh, { nodeW: narrow ? 10 : 12, gap: o.gap == null ? (bm ? 16 : narrow ? 12 : 14) : o.gap });
      Lx.W = W;
      return Lx;
    }
    function render(anim) {
      if (!spec) return;
      var focusId = document.activeElement && svg.contains(document.activeElement) ? pickOf(document.activeElement) : null;
      var oldGeo = prev && L ? geo(L) : null;
      L = layoutNow();
      var target = geo(L);
      cancelAnimationFrame(raf);
      if (anim && oldGeo && !LX.reduced()) {
        var t0 = performance.now();
        var step = function (now) {
          var t = Math.min(1, (now - t0) / 450), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          draw(lerpGeo(oldGeo, target, e));
          if (t < 1) raf = requestAnimationFrame(step); else refocus(focusId);
        };
        raf = requestAnimationFrame(step);
      } else { draw(target); refocus(focusId); }
      prev = spec;
    }
    function pickOf(el) { var g = el && el.closest ? el.closest(".node") : null; return g ? g.getAttribute("data-id") : null; }
    function refocus(id) {
      if (!id || !L) return;
      var el = svg.querySelector('.node[data-id="' + id + '"]');
      if (el) el.focus({ preventScroll: true });
    }
    function pick(id) {
      pickId = id && L && L.nodes[id] && L.nodes[id].v > 0 ? id : null;
      w.classList.toggle("has-pick", !!pickId);
      var f = pickId; render(false);
      read.innerHTML = pickId ? describe(pickId) : "";
      if (o.onPick) o.onPick(pickId);
      if (f) refocus(f);
    }
    function set(s) {
      spec = s;
      if (pickId && !s.nodes.some(function (n) { return n.id === pickId; })) pickId = null;
      render(true); textTable();
      if (pickId) read.innerHTML = describe(pickId);
      w.classList.toggle("has-pick", !!pickId);
    }
    var lastW = 0;
    if (window.ResizeObserver) new ResizeObserver(function () { var x = width(); if (Math.abs(x - lastW) > 2) { lastW = x; render(false); } }).observe(box);
    if (o.read) read.innerHTML = o.read;
    return { el: w, set: set, pick: pick, layout: function () { return L; }, readout: read };
  };
  LX.Sankey.layout = sankeyLayout; LX.Sankey.band = sankeyBand; LX.Sankey.flows = sankeyFlows;
})();
