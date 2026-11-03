// f03-energy-services.js — F3, "What do people actually want from energy?" (step cards, W3, 2026-11-03).
//
// Part 1 (this file's top): LX.Sankey, a lesson-local component that F4 (f04-power-plants) also loads; a candidate for
// promotion as components/sankey.js and sankey.css (i-sankey, e-sankey; curriculum v2 §16: F3, F4, F9, F10).
// Part 2: F3's model and view (below the Sankey).
(function () {
  "use strict";

  // ================================================================ Sankey: pure layout (no DOM; exported for Node)
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

  // ================================================================ F3: pure model (no DOM; exported for Node)
  // Data: assets/learn/data/f03-energy-services.json (every sourced number with its table or page and date).
  // The Prairie Town home (illustrative) uses EIA RECS 2020 averages for the West North Central division (Table CE4.6,
  // million Btu per household using each fuel and end use), converted at 3,412 Btu per kWh, plus one typical car (EPA,
  // 2022: 10,917 miles at 22.8 mpg, 120,214 Btu per gallon). Each flow is rounded to the nearest 100 kWh FIRST, and every
  // total on the page is a sum of rounded flows, so the parts always add up to the totals shown.
  //   bought(D)            {service: {carrier: kWh}} for a year, rounded
  //   car(D)               gallons, kWh (unrounded) and km of the typical car
  //   split(D, o)          per service: bought by carrier, useful and lost (o.heatPump: the furnace becomes a heat pump with
  //                        the DOE challenge's seasonal COP; the same useful heat, bought as electricity plus outdoor heat)
  //   totals(D, o)         by carrier, bought, useful, lost, not split (cooling, kitchen, devices), outdoor heat
  //   spec(D, o)           the Sankey: o.view "bought" (carriers -> services) or "useful" (-> useful, lost, not split)
  //   cop(D, T), day(D, T) the cold-day model: COP = 144 ÷ (45 − T) (2.4 × 60, so COP = 2.4 at −15 °C), backup heat at
  //                        COP 1 below the −23 °C cut-out; a day needs 5 kWh of heat per °C below 18 °C (illustrative)
  //   seasonCOP(D)         HSPF2 8.5 Btu per Wh ÷ 3.412 = 2.49
  //   primary(D, P4, P6)   Go deeper: gas burned at a combined-cycle plant (F4's heat rate) for the heat pump's year,
  //                        through grid losses (F6's about 5%), against the furnace's gas
  function r100(x) { return Math.round(x / 100) * 100; }
  function kwhOf(D, mmbtu) { return mmbtu * 1e6 / D.units.btuPerKWh; }
  function car(D) {
    var c = D.car, gal = c.miles / c.mpg;
    return { gallons: gal, kwh: gal * D.units.btuPerGallon / D.units.btuPerKWh, km: c.miles * c.kmPerMile };
  }
  function bought(D) {
    var out = {};
    D.services.forEach(function (s) {
      var b = out[s.key] = {};
      if (s.car) b.gasoline = r100(car(D).kwh);
      else Object.keys(s.mmbtu).forEach(function (k) { b[k] = r100(kwhOf(D, s.mmbtu[k])); });
    });
    return out;
  }
  function seasonCOP(D) { return D.heatpump.hspf2 * 1000 / D.units.btuPerKWh; }
  function sum(o) { var t = 0; for (var k in o) t += o[k]; return t; }
  function split(D, o) {
    o = o || {};
    var B = bought(D), out = {};
    D.services.forEach(function (s) {
      var b = {}, k; for (k in B[s.key]) b[k] = B[s.key][k];
      var tot = sum(b), r = { key: s.key, bought: b, total: tot, useful: null, lost: null, air: 0 };
      if (s.useful) {
        var eff = D.efficiency[s.useful].value;
        r.useful = r100(tot * eff); r.lost = tot - r.useful;
        if (s.key === "warmth" && o.heatPump) {
          var el = r100(r.useful / seasonCOP(D));
          r.bought = { el: el }; r.total = el; r.air = r.useful - el; r.lost = 0;
        }
      }
      out[s.key] = r;
    });
    return out;
  }
  function totals(D, o) {
    o = o || {};
    var S = split(D, o), t = { gas: 0, el: 0, gasoline: 0, air: 0, bought: 0, useful: 0, lost: 0, notSplit: 0, home: 0 };
    D.services.forEach(function (s) {
      var r = S[s.key];
      if (s.car && !o.car) return;
      for (var k in r.bought) { t[k] += r.bought[k]; t.bought += r.bought[k]; if (!s.car) t.home += r.bought[k]; }
      t.air += r.air;
      if (r.useful == null) t.notSplit += r.total; else { t.useful += r.useful; t.lost += r.lost; }
    });
    return t;
  }
  function spec(D, o) {
    o = o || {};
    var S = split(D, o), C = {}, nodes = [], links = [];
    D.carriers.forEach(function (c) { C[c.key] = c; });
    var used = {};
    D.services.forEach(function (s) { if (s.car && !o.car) return; for (var k in S[s.key].bought) used[k] = true; if (S[s.key].air) used.air = true; });
    // carriers top to bottom; with the heat pump, outdoor air and electricity sit next to warmth (the top service), so
    // their bands do not cross the diagram
    var corder = o.heatPump ? ["air", "el", "gas", "gasoline"] : ["gas", "el", "gasoline", "air"];
    corder.forEach(function (k) { var c = C[k]; if (c && used[k]) nodes.push({ id: c.key, label: c.label, short: c.short, col: 0, color: c.color }); });
    D.services.forEach(function (s) {
      if (s.car && !o.car) return;
      var r = S[s.key];
      nodes.push({ id: s.key, label: s.label, short: s.short, col: 1, color: "var(--lx-ink-2)" });
      for (var k in r.bought) links.push({ from: k, to: s.key, value: r.bought[k] });
      if (r.air) links.push({ from: "air", to: s.key, value: r.air });
    });
    if (o.view === "useful") {
      nodes.push({ id: "useful", label: "Useful heat and motion", short: "Useful", col: 2, color: "var(--lx-good)" });
      nodes.push({ id: "lost", label: "Lost as waste heat", short: "Lost", col: 2, color: "var(--lx-ink-3)", kind: "loss" });
      nodes.push({ id: "notsplit", label: "Appliances, not split", short: "Not split", col: 2, color: "var(--lx-steel)" });
      D.services.forEach(function (s) {
        if (s.car && !o.car) return;
        var r = S[s.key];
        if (r.useful == null) links.push({ from: s.key, to: "notsplit", value: r.total, color: "var(--lx-steel)" });
        else { links.push({ from: s.key, to: "useful", value: r.useful, color: "var(--lx-good)" }); if (r.lost) links.push({ from: s.key, to: "lost", value: r.lost }); }
      });
    }
    return { nodes: nodes, links: links };
  }
  function cop(D, T) {
    var h = D.heatpump;
    if (T < h.cutoutC) return 1;
    return h.anchorCOP * (h.supplyC - h.anchorC) / (h.supplyC - T);
  }
  function day(D, T) {
    var d = D.day, Q = d.kWhPerDegreeDay * Math.max(0, d.baseC - T), c = cop(D, T);
    return { T: T, Q: Q, cop: c, el: Q / c, air: Q - Q / c, gas: Q / D.efficiency.furnace.value, backup: T < D.heatpump.cutoutC };
  }
  function primary(D, P4, P6) {
    var hp = split(D, { heatPump: true }).warmth, furnace = split(D, {}).warmth;
    var cc = P4.plants.filter(function (p) { return p.key === "cc"; })[0], lossPct = P6.losses.real_pct;
    var sent = hp.bought.el / (1 - lossPct / 100), gasKWh = sent * cc.heatRate / D.units.btuPerKWh;
    return { el: hp.bought.el, lossPct: lossPct, sent: sent, heatRate: cc.heatRate, gas: gasKWh, furnaceGas: furnace.bought.gas, cut: 1 - gasKWh / furnace.bought.gas };
  }
  function fmtK(v) { return Math.round(v).toLocaleString("en-US"); }
  var model = { sankey: sankey, r100: r100, kwhOf: kwhOf, car: car, bought: bought, split: split, totals: totals, spec: spec,
    cop: cop, day: day, seasonCOP: seasonCOP, primary: primary, fmtK: fmtK };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ Sankey: view
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
  var CSS = [
    ".lx-sk { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-width: 0; margin: 0; }",
    ".lx-sk-lede { margin: 0; font-size: 14.5px; color: var(--lx-ink-2); }",
    ".lx-sk-box { position: relative; min-width: 0; }",
    ".lx-sk svg { display: block; width: 100%; height: auto; overflow: visible; }",
    ".lx-sk .band { opacity: .42; transition: opacity .2s; }",
    ".lx-sk .band.loss { opacity: .22; }",
    ".lx-sk.has-pick .band { opacity: .1; }",
    ".lx-sk.has-pick .band.on { opacity: .62; }",
    ".lx-sk .node rect { stroke: var(--lx-surface); stroke-width: 1; }",
    ".lx-sk .node.loss rect { fill-opacity: .55; stroke: var(--lx-ink-3); stroke-dasharray: 3 2; }",
    ".lx-sk .node { cursor: pointer; outline: none; }",
    ".lx-sk .node:focus-visible rect.hit, .lx-sk .node.on rect.hit { stroke: var(--lx-accent); stroke-width: 2.5; fill: none; }",
    ".lx-sk .node rect.hit { fill: transparent; stroke: none; }",
    ".lx-sk text { font-family: var(--lx-f-body); font-size: 12.5px; fill: var(--lx-ink); paint-order: stroke; stroke: var(--lx-surface); stroke-width: 3.2px; stroke-linejoin: round; }",
    ".lx-sk text .v { font-family: var(--lx-f-mono); font-size: 11.5px; fill: var(--lx-ink-2); }",
    ".lx-sk text.badge { font-family: var(--lx-f-mono); font-size: 11px; font-weight: 600; stroke: none; fill: var(--lx-ink); }",
    ".lx-sk circle.badge { fill: var(--lx-surface); stroke: var(--lx-ink-3); stroke-width: 1.2; }",
    ".lx-sk-key { display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5em, 1fr)); gap: 2px 12px; margin: 0; padding: 0; list-style: none; font-size: 13.5px; color: var(--lx-ink-2); }",
    ".lx-sk-key li { display: flex; gap: 6px; align-items: baseline; min-width: 0; }",
    ".lx-sk-key li.h { grid-column: 1 / -1; margin-top: 4px; font-family: var(--lx-f-display); font-size: 13px; font-weight: 600; color: var(--lx-ink-3); }",
    ".lx-sk-key b { font-family: var(--lx-f-mono); font-size: 12px; color: var(--lx-ink); }",
    ".lx-sk-key i { font-style: normal; font-family: var(--lx-f-mono); font-size: 12.5px; color: var(--lx-ink); }",
    ".lx-sk-read { margin: 0; min-height: 1.4em; font-size: 14.5px; color: var(--lx-ink-2); }",
    ".lx-sk-read b { color: var(--lx-ink); }",
    ".lx-sk table { font-size: 13.5px; }",
    "@media (prefers-reduced-motion: reduce) { .lx-sk .band { transition: none; } }"
  ].join("\n");
  function css() {
    if (document.getElementById("lx-sankey-css")) return;
    var st = document.createElement("style"); st.id = "lx-sankey-css"; st.textContent = CSS; document.head.appendChild(st);
  }
  function defFmt(v) { return Math.round(v).toLocaleString("en-US"); }

  LX.Sankey = function (host, o) {
    css();
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

  // ================================================================ F3: view
  // Lesson-local: HomeScene (a cutaway of the home with six service buttons, the rooms each one uses lit, a text version).
  // Shared: LX.StepCards, LX.CardSort, LX.Predict, LX.Guess, LX.Slider, LX.Plot, LX.NumAnswer, LX.CompareTable,
  // LX.CausalChain, LX.demo; and LX.Sankey above.
  var LESSON = "f03-energy-services";
  function kwh(v) { return fmtK(v) + " kWh"; }
  function pct(v) { return Math.round(v * 100) + "%"; }
  function degC(t) { return (t < 0 ? "−" : "") + Math.abs(t) + " °C"; }

  // ---- the home cutaway (viewBox 420 × 250); class names style it from the page's tokens (f3h- in the page's style block)
  var ZONES = {   // the rooms and equipment each service lights up
    living: '<rect class="zone" x="44" y="156" width="119" height="54" rx="3"/><rect class="zone" x="60" y="216" width="40" height="26" rx="3"/>',
    bath: '<rect class="zone" x="167" y="100" width="119" height="52" rx="3"/><rect class="zone" x="112" y="216" width="30" height="26" rx="3"/>',
    ac: '<rect class="zone" x="298" y="182" width="40" height="30" rx="4"/><rect class="zone" x="44" y="100" width="119" height="52" rx="3"/>',
    kitchen: '<rect class="zone" x="167" y="156" width="119" height="54" rx="3"/>',
    study: '<rect class="zone" x="44" y="100" width="119" height="52" rx="3"/>',
    car: '<rect class="zone" x="344" y="178" width="70" height="36" rx="4"/>'
  };
  var HOME_SVG =
    '<rect class="sky" x="0" y="0" width="420" height="250"/>' +
    '<rect class="ground" x="0" y="212" width="420" height="38"/><rect class="base" x="44" y="212" width="242" height="34"/>' +
    // the power line and the gas pipe
    '<path class="wire" d="M420 70 L392 70 M392 64 V212 M392 72 L292 118"/><path class="pipe" d="M286 232 H330 V250"/>' +
    // house shell, roof, floors and inner wall
    '<path class="roof" d="M28 98 L165 38 L302 98 Z"/><rect class="wall" x="40" y="96" width="250" height="116"/>' +
    '<path class="floor" d="M40 154 H290 M165 96 V212"/>' +
    // study upstairs left: desk, laptop, lamp and a TV
    '<rect class="desk" x="58" y="132" width="44" height="5"/><path class="desk" d="M62 137 V150 M98 137 V150"/>' +
    '<path class="screen" d="M70 131 L72 120 H90 L92 131 Z"/><path class="lampk" d="M108 150 V122 M100 122 H116 L112 114 H104 Z"/>' +
    '<rect class="screen" x="124" y="112" width="30" height="20" rx="2"/><path class="desk" d="M139 132 V140 M131 140 H147"/>' +
    // bathroom upstairs right: shower and drops
    '<path class="pipe2" d="M190 104 V112 H206"/><path class="head" d="M200 112 h14 l-3 5 h-8 z"/>' +
    '<path class="drop" d="M203 121 v5 M207 123 v6 M211 121 v5"/><rect class="tub" x="186" y="138" width="60" height="12" rx="4"/>' +
    // living room downstairs left: sofa, thermostat, warm-air vent
    '<rect class="sofa" x="58" y="186" width="56" height="18" rx="4"/><rect class="sofa" x="54" y="180" width="10" height="24" rx="3"/><rect class="sofa" x="108" y="180" width="10" height="24" rx="3"/>' +
    '<rect class="vent" x="126" y="200" width="22" height="6"/><path class="warm" d="M131 196 q3 -5 0 -10 M137 196 q3 -5 0 -10 M143 196 q3 -5 0 -10"/>' +
    '<rect class="therm" x="140" y="166" width="12" height="14" rx="2"/>' +
    // kitchen downstairs right: fridge, stove with a flame, dryer
    '<rect class="fridge" x="176" y="166" width="24" height="42" rx="2"/><path class="desk" d="M176 184 H200"/>' +
    '<rect class="stove" x="208" y="188" width="30" height="20" rx="2"/><path class="flame" d="M216 186 q2 -5 4 0 M226 186 q2 -5 4 0"/>' +
    '<rect class="stove" x="246" y="182" width="28" height="26" rx="3"/><circle class="dial" cx="260" cy="195" r="7"/>' +
    // basement: furnace and water heater
    '<rect class="furnace" x="64" y="218" width="32" height="22" rx="2"/><path class="flame" d="M74 232 q3 -7 6 0 q3 -7 6 0"/>' +
    '<rect class="tank" x="116" y="218" width="22" height="22" rx="6"/><path class="pipe2" d="M98 222 H112 M127 218 V158"/>' +
    // meters on the outside wall, the outdoor air conditioner and the car
    '<rect class="meter" x="290" y="140" width="10" height="13" rx="2"/><rect class="meter" x="290" y="222" width="10" height="10" rx="2"/>' +
    '<rect class="acu" x="302" y="186" width="32" height="24" rx="3"/><circle class="fan" cx="318" cy="198" r="8"/><path class="fan" d="M310 198 H326 M318 190 V206"/>' +
    '<path class="car" d="M348 208 L352 194 Q356 186 366 186 L392 186 Q402 186 406 194 L410 208 Z"/><circle class="wheel" cx="362" cy="210" r="6"/><circle class="wheel" cx="396" cy="210" r="6"/>' +
    // labels
    '<text x="48" y="112" class="mini">study</text><text x="171" y="112" class="mini">bathroom</text>' +
    '<text x="48" y="168" class="mini">living room</text><text x="171" y="168" class="mini">kitchen</text>' +
    '<text x="148" y="236" class="mini">basement</text><text x="304" y="180" class="mini">AC</text>' +
    '<text x="300" y="138" class="mini">meters</text><text x="336" y="244" class="mini">gas pipe</text><text x="350" y="62" class="mini">power line</text>';
  var HOME_ALT = "A two-storey Prairie Town home in cross-section: a study with a laptop, a lamp and a TV and a bathroom upstairs; a living room with a warm-air vent and a kitchen with a fridge, a gas stove and a dryer downstairs; a gas furnace and a gas water heater in the basement; an outdoor air conditioner; electricity and gas meters on the wall; a car in the driveway.";

  function HomeScene(host, o) {
    var D = o.D, S = split(D, {}), seen = {}, cur = null;
    (o.seen || []).forEach(function (k) { seen[k] = true; });
    var w = H("div", { class: "f3h" }, host);
    var rail = H("div", { class: "f3h-rail", role: "group", "aria-label": "Services in this home" }, w), btns = {};
    D.services.forEach(function (s) {
      var b = H("button", { type: "button", class: "f3h-stop", "aria-pressed": "false", html: LX.icon(s.icon) + "<span>" + LX.esc(s.short || s.label) + "</span>", "aria-label": s.label }, rail);
      b.addEventListener("click", function () { go(s.key); });
      btns[s.key] = b;
    });
    var fig = H("figure", { class: "f3h-frame" }, w);
    var box = H("div", { class: "f3h-svg" }, fig);
    box.innerHTML = '<svg class="f3h-pic" viewBox="0 0 420 250" role="img" aria-label="' + LX.esc(HOME_ALT) + '">' + HOME_SVG + '<g class="f3h-lit"></g></svg>';
    var lit = box.querySelector(".f3h-lit");
    var cap = H("figcaption", { class: "f3h-cap", "aria-live": "polite" }, fig);
    var count = H("p", { class: "lx-hint f3h-count" }, w);
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the home" }, alt);
    var ul = H("ul", null, alt);
    D.services.forEach(function (s) { H("li", { html: "<b>" + LX.esc(s.label) + "</b>: " + LX.esc(s.want) + " " + LX.esc(line(s)) }, ul); });
    function carrierWords(s) {
      var b = S[s.key].bought, names = { gas: "natural gas", el: "electricity", gasoline: "gasoline" };
      return Object.keys(b).map(function (k) { return names[k] + " " + kwh(b[k]); }).join(" and ");
    }
    function line(s) { return "Device: " + s.device + ". Carrier, in a year: " + carrierWords(s) + "."; }
    function go(key, quiet) {
      var s = D.services.filter(function (x) { return x.key === key; })[0]; if (!s) return;
      cur = key; seen[key] = true;
      lit.innerHTML = ZONES[s.zone];
      cap.innerHTML = "";
      var t = H("p", { class: "f3h-title" }, cap); t.innerHTML = LX.icon(s.icon) + "<b>" + LX.esc(s.label) + "</b>";
      var dl = H("dl", { class: "f3h-dl" }, cap);
      [["You want", s.want], ["Device", s.device], ["Carrier", carrierWords(s) + " a year"]].forEach(function (p) { H("dt", { text: p[0] }, dl); H("dd", { text: p[1] }, dl); });
      if (s.note) H("p", { class: "f3h-note", text: s.note }, cap);
      Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === key ? "true" : "false"); btns[k].classList.toggle("seen", !!seen[k]); });
      var n = Object.keys(seen).length;
      count.textContent = n < D.services.length ? "Services visited: " + n + " of " + D.services.length + "." : "All six services visited.";
      if (!quiet && o.onGo) o.onGo(key, n);
      LX.emit("layout");
    }
    go(o.start || D.services[0].key, true);
    return { el: w, go: go, seen: function () { return Object.keys(seen); } };
  }

  // ---- the cold day: COP against the outdoor temperature, and one day's heat, electricity and gas
  function ColdDay(host, D, o) {
    var w = H("div", { class: "f3d" }, host), d = D.day;
    var sl = LX.Slider(H("div", { class: "f3d-ctl" }, w), { label: "The day's outdoor average", color: "var(--lx-wind)", min: d.min, max: d.max, step: d.step, value: o.start == null ? d.start : o.start,
      fmt: degC, downLabel: "Colder by 1 °C", upLabel: "Warmer by 1 °C", onChange: function (v) { draw(v, true); } });
    var out = H("div", { class: "f3d-out", "aria-live": "polite" }, w);
    var bars = H("div", { class: "f3d-bars" }, w);
    var P = LX.Plot(H("div", { class: "f3d-plot" }, w), { text: "Text version of the COP curve", legend: false });
    var pts = [], rows = [];
    for (var T = d.min; T <= d.max; T += 1) { var c = cop(D, T); pts.push([T, c]); if (T % 5 === 0 || T === D.heatpump.cutoutC) rows.push([degC(T), c.toFixed(2)]); }
    function draw(T, fire) {
      var r = day(D, T), maxQ = day(D, d.min).gas;
      out.innerHTML = "<b>COP " + r.cop.toFixed(2) + "</b>" + (r.backup ? " (below the cut-out: the backup heater)" : "") + " · heat needed <b>" + kwh(r.Q) + "</b> · heat pump electricity <b>" + kwh(r.el) + "</b>";
      bars.innerHTML = "";
      [["Heat the home needs", r.Q, "var(--lx-good)"], ["Heat pump: electricity", r.el, "var(--lx-bat)"], ["Heat pump: from outdoor air", r.air, "var(--lx-wind)"], ["Furnace instead: gas", r.gas, "var(--lx-cc)"]].forEach(function (b) {
        var row = H("div", { class: "f3d-row" }, bars);
        H("span", { text: b[0] }, row);
        var bar = H("div", { class: "f3d-bar" }, row); H("i", { style: "width:" + (100 * b[1] / maxQ).toFixed(1) + "%;background:" + b[2] }, bar);
        H("b", { text: kwh(b[1]) }, row);
      });
      P.render({ x: { min: d.min, max: d.max, ticks: [[-25, "−25 °C"], [-15, "−15 °C"], [-5, "−5 °C"], [5, "5 °C"], [15, "15 °C"]], ticksN: [[-25, "−25"], [-15, "−15"], [-5, "−5"], [5, "5"], [15, "15 °C"]] },
        y: { min: 0, max: 5, step: 1, fmt: function (v) { return String(v); }, unit: "COP" }, height: 200, heightN: 180,
        lines: [{ pts: pts.filter(function (p) { return p[0] >= D.heatpump.cutoutC; }), color: "var(--lx-wind)" }, { pts: pts.filter(function (p) { return p[0] < D.heatpump.cutoutC; }), color: "var(--lx-ink-3)", dash: "4 3" }],
        refs: [{ y: 1, label: "COP 1: a plain electric heater", labelN: "COP 1", dash: "3 3", color: "var(--lx-ink-3)" }],
        marks: [{ x: T, y: r.cop, label: "COP " + r.cop.toFixed(2), kind: "dot", pos: "above" }],
        aria: "The heat pump's COP against the outdoor temperature: it falls as the day gets colder, from " + cop(D, d.max).toFixed(1) + " at " + d.max + " °C to " + cop(D, D.heatpump.anchorC).toFixed(1) + " at " + degC(D.heatpump.anchorC) + ", and drops to 1 below the " + degC(D.heatpump.cutoutC) + " cut-out.",
        text: { head: ["Outdoor temperature", "COP"], rows: rows } });
      if (o.onChange) o.onChange(T, r, fire);
    }
    draw(sl.val(), false);
    return { el: w, slider: sl, draw: draw };
  }

  function view(live, data, root) {
    var D = data.f03_energy_services;
    var log = LX.store.get("f3-log", {}) || {};
    function keep(k, v) { log[k] = v; LX.store.set("f3-log", log); }
    var state = { car: !!log.car, heatPump: !!log.hp, temp: log.temp == null ? D.day.start : log.temp };
    var T0 = totals(D, {}), T1 = totals(D, { car: true }), T2 = totals(D, { car: true, heatPump: true }), Sp = split(D, {}), Sh = split(D, { heatPump: true });
    function sk(host, o) {
      return LX.Sankey(host, { label: "A year of energy in the Prairie Town home, in kWh", unit: "kWh", fmt: fmtK, height: 300, heightN: 340,
        textHead: ["From", "To", "kWh in a year"], caption: o && o.caption, colNames: ["Bought", "Services", "Becomes"] });
    }
    var steps = [
      { text: "People don't want energy itself: they want a warm room, a hot shower, a ride to school. Tap each [[energy-service|service]] in this Prairie Town home.",
        build: function (act, api) {
          HomeScene(act, { D: D, seen: log.seen || [], onGo: function (k, n) {
            var s = log.seen || []; if (s.indexOf(k) < 0) { s.push(k); keep("seen", s); }
            if (n === D.services.length) { api.done(); api.saw("Six services, three [[energy-carrier|carriers]]: natural gas, electricity and gasoline. A carrier only brings the energy; a device turns it into the service."); }
          } });
          if ((log.seen || []).length >= D.services.length) api.done();
        } },
      { text: "Sort the cards: a service is what people want, a carrier brings the energy, a device turns one into the other.",
        build: function (act, api) {
          var cs = LX.CardSort(act, { bins: D.sort.bins.map(function (b, i) { return { id: b.id, label: b.label, sub: b.sub, color: ["var(--lx-good)", "var(--lx-bat)", "var(--lx-ink-3)"][i] }; }),
            cards: D.sort.cards, checkLabel: "Check my sort", maxWhy: 4, hint: "Tap a card, then tap the box it belongs in. Tap a placed card to move it.",
            onCheck: function (g) {
              keep("sort", JSON.parse(JSON.stringify(cs.placed())));
              if (g.placed < g.total) { api.saw("Place every card first: " + (g.total - g.placed) + " still in the pool.", true); return; }
              api.done(); api.saw("**" + g.right + " of " + g.total + "** right" + (g.right < g.total ? "; the reasons are under the boxes." : ".") + " One service can have several devices: a furnace or a heat pump can deliver the same warm room.", g.right < 6);
            } });
          if (log.sort) cs.place(JSON.parse(JSON.stringify(log.sort)));
        } },
      { text: D.predict.q + " Lock in a guess; the next step shows the year in kWh.",
        build: function (act, api) {
          LX.Predict(act, { id: D.predict.id, answer: D.predict.answer, fresh: true, options: D.predict.options, lockText: "Locked in. The next step shows the answer.",
            onPick: function (p) { keep("pred", p); api.done(); } });
          if (log.pred) api.done();
        } },
      { text: "Here is the home's year, from the carriers it buys (left) to the services they deliver (right). Tap a bar for its numbers, then add the family car.",
        build: function (act, api) {
          var row = H("div", { class: "lx-step-foot f3-ctlrow" }, act);
          var s = sk(act);
          var b = H("button", { type: "button", class: "lx-btn small f3-add", "aria-pressed": state.car ? "true" : "false", text: state.car ? "Car added" : "Add the family car" }, row);
          function show() { s.set(spec(D, { car: state.car })); }
          function reveal() {
            var right = log.pred === "warmth", share = Sp.warmth.total / T0.home;
            api.saw((log.pred ? (right ? "Your guess was right: " : "Not quite: ") : "") + "**warmth** takes " + kwh(Sp.warmth.total) + " of the home's " + kwh(T0.home) + " (" + pct(share) + "). The car adds " + kwh(Sp.mobility.total) + " of gasoline, about as much as the furnace.", log.pred && !right);
          }
          b.addEventListener("click", function () {
            state.car = true; keep("car", true); b.setAttribute("aria-pressed", "true"); b.textContent = "Car added"; b.disabled = true;
            show(); api.done(); reveal();
          });
          if (state.car) { b.disabled = true; api.done(); reveal(); }
          show();
        } },
      { text: "Energy bought is not energy used: a furnace loses heat up the flue, a car's engine warms the air. Guess first, then see the useful share.",
        build: function (act, api) {
          var s = null;
          LX.Guess(act, { id: D.guess.id, q: D.guess.q, ticks: D.guess.ticks.map(function (t) { return t + "%"; }), answer: D.guess.ticks.indexOf(D.guess.answer), start: 2,
            onLock: function (g, out) {
              keep("guess", g);
              var right = D.guess.ticks[g] === D.guess.answer;
              out.innerHTML = "<p>" + LX.rich((right ? "Right: " : "Not quite: ") + "about " + D.guess.answer + "% of the fuel's energy moves a typical gasoline car (DOE). The rest leaves as [[waste-heat|waste heat]].") + "</p>";
              state.car = true; keep("car", true);
              s = sk(act); s.set(spec(D, { car: true, view: "useful" }));
              api.done();
              api.saw("Of " + kwh(T1.bought) + " bought, **" + kwh(T1.useful) + "** becomes [[useful-energy|useful]] heat and motion and " + kwh(T1.lost) + " is lost. Cooling, the kitchen and devices (" + kwh(T1.notSplit) + ") are not split here.");
            } });
          if (log.guess != null) { s = sk(act); s.set(spec(D, { car: true, view: "useful" })); api.done(); }
        } },
      { text: "Swap the furnace for a [[heat-pump|heat pump]]. It moves heat in from the outdoor air, so the same warm rooms need far less energy bought.",
        build: function (act, api) {
          var seg = H("div", { class: "lx-seg f3-seg", role: "group", "aria-label": "How the home is heated" }, act), bs = {}, s = sk(act);
          [["furnace", "Gas furnace"], ["hp", "Heat pump"]].forEach(function (p) {
            var b = H("button", { type: "button", "aria-pressed": "false", text: p[1] }, seg); bs[p[0]] = b;
            b.addEventListener("click", function () { set(p[0] === "hp", true); });
          });
          function set(hp, fire) {
            state.heatPump = hp; keep("hp", hp);
            bs.furnace.setAttribute("aria-pressed", hp ? "false" : "true"); bs.hp.setAttribute("aria-pressed", hp ? "true" : "false");
            s.set(spec(D, { car: true, heatPump: hp, view: "useful" }));
            if (hp) {
              api.done();
              api.saw("Same useful heat, " + kwh(Sh.warmth.useful) + ", now from " + kwh(Sh.warmth.bought.el) + " of electricity plus " + kwh(Sh.warmth.air) + " of outdoor heat: a seasonal [[coefficient-of-performance|COP]] of " + seasonCOP(D).toFixed(1) + ". Home and car now buy " + kwh(T2.bought) + ", not " + kwh(T1.bought) + ".");
            } else if (fire) api.saw("The furnace: " + kwh(Sp.warmth.total) + " of gas for " + kwh(Sp.warmth.useful) + " of useful heat (" + pct(D.efficiency.furnace.value) + " [[afue|AFUE]]).");
          }
          set(state.heatPump, false);
          if (state.heatPump) api.done();
        } },
      { text: "A heat pump's COP is not fixed. Drag the day colder, to " + degC(D.day.goal) + " or below, and watch the COP fall as the heat the home needs climbs.",
        build: function (act, api) {
          var done = false;
          ColdDay(act, D, { start: state.temp, onChange: function (T, r, fire) {
            state.temp = T; if (fire) keep("temp", T);
            if (T <= D.day.goal) {
              var a = day(D, D.day.start);
              if (!done) { done = true; api.done(); }
              api.saw(r.backup ? "Below " + degC(D.heatpump.cutoutC) + " the compressor stops and a backup heater runs at COP 1: " + kwh(r.el) + " of electricity for " + kwh(r.Q) + " of heat." :
                "At " + degC(T) + " the home needs " + (r.Q / a.Q).toFixed(1) + " times the heat of a " + degC(D.day.start) + " day, but the heat pump uses " + (r.el / a.el).toFixed(1) + " times the electricity: COP " + r.cop.toFixed(2) + ".");
            }
          } });
          if (state.temp <= D.day.goal) { done = true; api.done(); }
        } },
      { text: D.apply.q,
        build: function (act, api) {
          var na = LX.NumAnswer(act, { label: "Electricity used", unit: D.apply.unit, onCheck: function (v, input) {
            if (v == null) { fb.textContent = "Type a number first."; return; }
            var okv = Math.abs(v - D.apply.answer) <= D.apply.tol;
            input.classList.toggle("right", okv); input.classList.toggle("wrong", !okv);
            fb.innerHTML = "<span>" + LX.rich((okv ? "Right. " : "Not quite. ") + D.apply.why) + "</span>";
            if (okv) { api.done(); LX.progress.done(LESSON); }
          } });
          var fb = H("p", { class: "lx-predict-out", "aria-live": "polite" }, act);
          void na;
        } }
    ];
    var cards = LX.StepCards(live, { id: "f3-steps", steps: steps });

    // demo states: "step-N" opens step N with its action done; "mid" = step 4 with the car added
    LX.demo(root, function (st) {
      var n = st === "mid" ? 4 : +((/^step-(\d+)$/.exec(st) || [])[1] || 0); if (!n) return null;
      var i = Math.max(0, Math.min(steps.length - 1, n - 1));
      keep("seen", D.services.map(function (s) { return s.key; })); keep("pred", "devices");
      if (i >= 4) { keep("car", true); state.car = true; }
      cards.go(i);
      var q = function (sel) { return cards.el.querySelector(sel); };
      if (i === 0) { var b = cards.el.querySelectorAll(".f3h-stop")[4]; if (b) b.click(); }
      if (i === 1) { var m = {}; D.sort.cards.forEach(function (c) { m[c.id] = c.bin; }); m.hp = "carrier"; keep("sort", m); cards.go(0); cards.go(1); var ck = q(".lx-cs .lx-step-foot .lx-btn"); if (ck) ck.click(); }
      if (i === 3) { var add = q(".f3-add"); if (add && !add.disabled) add.click(); }
      if (i === 4) { var lk = q(".lx-guess .lx-btn"); if (lk) lk.click(); }
      if (i === 5) { var hb = cards.el.querySelectorAll(".f3-seg button")[1]; if (hb) hb.click(); }
      if (i === 6) { var sv = q(".f3d-ctl input[type=range]"); if (sv) { sv.value = -15; sv.dispatchEvent(new Event("input", { bubbles: true })); } }
      if (i === 7) { var inp = q(".lx-na-num"); if (inp) { inp.value = "30"; var cb = q(".lx-na .lx-btn"); if (cb) cb.click(); } }
      return { view: "step " + (i + 1) };
    }, cards);
    buildExplain(D, state);
    LX.on("f3-state", function () { buildExplain(D, state); });
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, state) {
    var host = document.getElementById("f3-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var hp = !!state.heatPump, Sx = split(D, { heatPump: hp }), Tx = totals(D, { car: true, heatPump: hp });
    var c1 = H("div", { class: "lx-xcard lx-wide" }, host), h1 = H("header", { class: "lx-x-head" }, c1);
    H("h3", { text: "A year in one picture: " + (hp ? "with the heat pump" : "with the gas furnace") }, h1);
    var guide = H("ol", { class: "f3-guide" }, c1);
    ["**Width is energy.** Each band's width is its kWh in a year.", "**Left: what the home buys.** The [[energy-carrier|carriers]], plus free heat from outdoor air with a heat pump.",
     "**Middle: the services.** What the energy is for.", "**Right: what it becomes.** [[useful-energy|Useful]] heat and motion, heat lost on the way, or appliances not split here."].forEach(function (t) { H("li", { html: LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }, guide); });
    var s = LX.Sankey(c1, { label: "The Prairie Town home's year, carriers to services to useful energy, in kWh", unit: "kWh", fmt: fmtK, height: 320, heightN: 360, textHead: ["From", "To", "kWh in a year"], colNames: ["Bought", "Services", "Becomes"] });
    s.set(spec(D, { car: true, heatPump: hp, view: "useful" }));
    H("p", { class: "lx-hint", html: LX.rich("Bought " + kwh(Tx.bought) + "; useful " + kwh(Tx.useful) + "; lost " + kwh(Tx.lost) + (hp ? "; from outdoor air " + kwh(Tx.air) : "") + ". Flows rounded to the nearest 100 kWh.") }, c1);

    var c2 = H("div", { class: "lx-xcard" }, host);
    LX.CompareTable(c2, {
      title: "Six services, their carriers and devices", text: true,
      columns: [{ key: "name", label: "Service", main: true }, { key: "want", label: "What people want" }, { key: "dev", label: "Device" }, { key: "car", label: "Bought in a year" }, { key: "use", label: "Useful share" }],
      rows: D.services.map(function (sv) {
        var r = Sx[sv.key], names = { gas: "gas", el: "electricity", gasoline: "gasoline" };
        var dev = sv.key === "warmth" && hp ? "Heat pump" : sv.device;
        var use = r.useful == null ? "not split here" : (r.air ? "COP " + seasonCOP(D).toFixed(1) + " (more heat than electricity)" : (sv.key === "warmth" ? "" : "about ") + pct(D.efficiency[sv.useful].value));
        return { key: sv.key, color: "var(--lx-ink-2)", name: sv.label, want: sv.want, dev: dev,
          car: Object.keys(r.bought).map(function (k) { return kwh(r.bought[k]) + " " + names[k]; }).join(" + "), use: use };
      }),
      caption: "Carriers are what you pay for; services are what you get. A better device changes the carrier you buy, not the service."
    });

    var a = day(D, D.day.start), b = day(D, D.heatpump.anchorC);
    var c3 = H("div", { class: "lx-xcard" }, host);
    LX.CausalChain(c3, { title: "Cause and effect: a cold snap and a heat pump",
      links: [
        { title: "The day turns cold", text: "The outdoor average falls from " + degC(D.day.start) + " to " + degC(D.heatpump.anchorC) + ".", value: degC(D.day.start) + " → " + degC(D.heatpump.anchorC) },
        { title: "The home needs more heat", text: "Heat leaks out faster when the gap to 18 °C is bigger (illustrative home).", value: kwh(a.Q) + " → " + kwh(b.Q) },
        { title: "The COP falls", text: "Pulling heat from colder air is harder work.", value: a.cop.toFixed(2) + " → " + b.cop.toFixed(2) },
        { title: "Electricity climbs faster than heat", text: "More heat at a lower COP multiplies.", value: kwh(a.el) + " → " + kwh(b.el) },
        { title: "Cold evenings set the peak", text: "When many homes do this at once, the grid's winter peak grows (lesson 2).", value: "×" + (b.el / a.el).toFixed(1) + " electricity" }
      ],
      note: "Heat need ×" + (b.Q / a.Q).toFixed(1) + ", electricity ×" + (b.el / a.el).toFixed(1) + ": numbers from this lesson's illustrative cold-day model." });
  }

  LX.mount("energy-services", function (live, data, root) {
    view(live, data, root);
    // rebuild the explain layer when the reader switches the heating (the Sankey there follows the reader's choice)
    live.addEventListener("click", function (e) { if (e.target && e.target.closest && e.target.closest(".f3-seg")) setTimeout(function () { LX.emit("f3-state"); }, 0); });
  });
})();
