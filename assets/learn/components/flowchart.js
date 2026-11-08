/* flowchart.js — LX.Flowchart: a decision flowchart that traces real cases through its boxes, one step at a time.
   LX.Flowchart(host, { title: "The operator's hourly decision", lede: "One sentence.",
     nodes: { start: {t: "New hour", s: "small second line", k: "end"},   k: "end" (rounded), "q" (diamond), default box
              q1: {t: "Short of power?", k: "q"}, a1: {t: "Turn up the combined-cycle", tN: ["Turn up the", "combined-cycle"], s: "$40/MWh", sN: "$40/MWh"} },
     at:  { start: [1, 0], q1: [1, 1], a1: [0, 2] },   grid [column, row] on wide screens; columns may be fractional
     atN: { ... },                                      the same on phones (under 560 px); cols / colsN set the grid width
     edges: [["start", "q1"], ["q1", "a1", "yes"], ["a3", "end", null, {v: true}], ["q3", "end", "no", {dN: "M344 206 H354 V482 H308", lN: [336, 196]}]],
            routing is automatic: straight when aligned, otherwise sideways then down ({v: true}: down then sideways);
            {d, l, dN, lN} draw a hand-made path and label position instead, for the rare crossing
     traces: [{label: "14:00 · the cloud", path: ["start", "q1", "a1", "q2", "a2", "end"], text: "What happened, with numbers."}],
     sel: 1 });
   The chosen trace lights up box by box (all at once under reduced motion); its text is announced. A "Text version"
   spells out every branch.
   Returns { build(), run(i, quick), update(traces) }. update(traces) changes the traces without redrawing the chart (e.g.
   a "Your settings" trace that follows the reader's numbers): the buttons take the new labels, and the selected trace
   shows its new path and text at once. update() with no argument rereads the same list after an in-place change. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H, S = LX.S;
  LX.Flowchart = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host);
    H(LX.hTag(3, hd), { text: o.title }, hd);   // an h2 right under the page title
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var trace = H("div", { class: "lx-ftrace", role: "group", "aria-label": "Trace a case" }, host);
    var box = H("div", { class: "lx-flow" }, host);
    var out = H("p", { class: "lx-ftrace-out", "aria-live": "polite" }, host);
    var mk = LX.uid("fc"), mode = null, nodes = {}, edges = [], timer = null, cur = o.sel || 0, N = o.nodes;
    // text version
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version of the flowchart" }, alt);
    var ol = H("ol", null, alt);
    Object.keys(N).forEach(function (k) {
      var outs = o.edges.filter(function (e) { return e[0] === k; });
      if (!outs.length) { H("li", { text: N[k].t + ". (End.)" }, ol); return; }
      H("li", { text: N[k].t + (N[k].s ? " (" + N[k].s + ")" : "") + ": " + outs.map(function (e) { return (e[2] ? "if " + e[2] + ", " : "then ") + N[e[1]].t; }).join("; ") + "." }, ol);
    });
    function geo(m) {
      var narrow = m === "narrow", W = narrow ? 360 : 720, cols = (narrow ? o.colsN : o.cols) || 3, pad = narrow ? 92 : 150, rh = narrow ? 92 : 88;
      var P = {}, sz = {}, maxRow = 0;
      Object.keys(N).forEach(function (k) {
        var at = (narrow ? o.atN && o.atN[k] : null) || o.at[k], n = N[k];
        P[k] = [pad + at[0] * (W - 2 * pad) / Math.max(1, cols - 1), 34 + at[1] * rh]; maxRow = Math.max(maxRow, at[1]);
        var lines = narrow ? (n.tN || [n.t]) : [n.t], sub = narrow ? n.sN : n.s;
        if (n.k === "q") { var qw = Math.max(narrow ? 62 : 70, n.t.length * (narrow ? 3.4 : 3.9) + 18); if (narrow && n.tN) qw = Math.max(62, Math.max.apply(null, n.tN.map(function (x) { return x.length; })) * 3.6 + 20); sz[k] = [qw, 32, lines, sub]; }
        else {
          var len = Math.max.apply(null, lines.concat(sub ? [sub] : []).map(function (x, i) { return x.length * (i < lines.length ? 7.4 : 6.3); }));
          sz[k] = [Math.min(narrow ? 170 : 230, Math.max(narrow ? 110 : 150, len + 24)) / 2, (14 + lines.length * 16 + (sub ? 15 : 0)) / 2, lines, sub];
        }
      });
      return { W: W, H: 34 * 2 + maxRow * rh + 10, P: P, sz: sz };
    }
    function route(e, G, m) {
      var x = e[3] || {}, narrow = m === "narrow";
      if (narrow && x.dN) return { d: x.dN, l: x.lN };
      if (!narrow && x.d) return { d: x.d, l: x.l };
      var a = G.P[e[0]], b = G.P[e[1]], sa = G.sz[e[0]], sb = G.sz[e[1]], dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.abs(dx) < 1 || (!x.v && dy > 0 && Math.abs(dx) < sb[0] - 10)) {                                  // straight down (or up)
        var xx = a[0], y1 = a[1] + (dy > 0 ? sa[1] : -sa[1]), y2 = b[1] - (dy > 0 ? sb[1] + 2 : -sb[1] - 2);
        return { d: "M" + xx + " " + y1 + " V" + y2, l: [xx + 8, y1 + 16], anchor: "start" };
      }
      if (Math.abs(dy) < 1) {                                                                                   // straight across
        var s = dx > 0 ? 1 : -1;
        return { d: "M" + (a[0] + s * sa[0]) + " " + a[1] + " H" + (b[0] - s * (sb[0] + 2)), l: [(a[0] + b[0]) / 2, a[1] - 8] };
      }
      if (x.v) {                                                                                                // down, then across
        var s2 = dx > 0 ? 1 : -1;
        return { d: "M" + a[0] + " " + (a[1] + sa[1]) + " V" + b[1] + " H" + (b[0] - s2 * (sb[0] + 2)), l: [a[0] + 8, a[1] + sa[1] + 16], anchor: "start" };
      }
      var s3 = dx > 0 ? 1 : -1, ex = b[0] - s3 * Math.min(40, Math.max(0, sb[0] - 24)) * (x.center ? 0 : 1);   // across, then down
      if (Math.abs(ex - b[0]) > 0 && G.multi && !G.multi[e[1]]) ex = b[0];
      var sx = a[0] + s3 * sa[0], ey = b[1] - (dy > 0 ? sb[1] + 2 : -sb[1] - 2);
      return { d: "M" + sx + " " + a[1] + " H" + ex + " V" + ey, l: [(sx + ex) / 2, a[1] - 8] };
    }
    function build() {
      var m = box.clientWidth < 560 ? "narrow" : "wide"; if (m === mode) return; mode = m;
      box.innerHTML = ""; nodes = {}; edges = [];
      var G = geo(m), into = {};
      o.edges.forEach(function (e) { into[e[1]] = (into[e[1]] || 0) + 1; });
      G.multi = {}; Object.keys(into).forEach(function (k) { G.multi[k] = into[k] > 1; });
      var svg = S("svg", { viewBox: "0 0 " + G.W + " " + G.H, role: "img", "aria-label": (o.title || "Flowchart") + ". The text version below lists every branch." }, box);
      var mkr = S("marker", { id: mk, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto" }, S("defs", null, svg));
      S("path", { d: "M0 1 L9 5 L0 9 z", fill: "var(--lx-ink-3)" }, mkr);
      var eg = S("g", null, svg), ng = S("g", null, svg);
      o.edges.forEach(function (e) {
        var r = route(e, G, m), g = S("g", { class: "fedge" }, eg);
        S("path", { d: r.d, "marker-end": "url(#" + mk + ")" }, g);
        if (e[2] && r.l) S("text", { x: r.l[0], y: r.l[1], "text-anchor": r.anchor || "middle" }, g).textContent = e[2];
        edges.push({ g: g, a: e[0], b: e[1] });
      });
      Object.keys(N).forEach(function (k) {
        var n = N[k], p = G.P[k], s = G.sz[k], g = S("g", { class: "fnode" + (n.k === "q" ? " q" : "") }, ng), lines = s[2], sub = s[3];
        if (n.k === "q") S("polygon", { points: [p[0], p[1] - s[1], p[0] + s[0], p[1], p[0], p[1] + s[1], p[0] - s[0], p[1]].join(" ") }, g);
        else S("rect", { x: p[0] - s[0], y: p[1] - s[1], width: 2 * s[0], height: 2 * s[1], rx: n.k === "end" ? s[1] : 8 }, g);
        var tot = lines.length + (sub && n.k !== "q" ? 0.9 : 0), y0 = p[1] - (tot - 1) * 8 + 4;
        lines.forEach(function (ln, i) { S("text", { x: p[0], y: y0 + i * 16, "text-anchor": "middle" }, g).textContent = ln; });
        if (sub && n.k !== "q") S("text", { x: p[0], y: y0 + lines.length * 16 - 1, "text-anchor": "middle", class: "sub" }, g).textContent = sub;
        nodes[k] = g;
      });
      run(cur, true);
    }
    function run(i, quick) {
      clearInterval(timer); cur = i;
      var tr = o.traces[i], k = 0;
      btns.forEach(function (b, j) { b.setAttribute("aria-pressed", j === i ? "true" : "false"); });
      Object.keys(nodes).forEach(function (n) { nodes[n].classList.remove("on"); }); edges.forEach(function (e) { e.g.classList.remove("on"); });
      out.innerHTML = "";
      function stepOn() {
        var n = tr.path[k]; if (nodes[n]) nodes[n].classList.add("on");
        if (k > 0) edges.forEach(function (e) { if (e.a === tr.path[k - 1] && e.b === n) e.g.classList.add("on"); });
        k++; if (k >= tr.path.length) { clearInterval(timer); out.innerHTML = LX.rich(tr.text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
      }
      if (quick || LX.reduced()) { while (k < tr.path.length) stepOn(); } else { stepOn(); timer = setInterval(stepOn, 420); }
    }
    function button(t, i) {
      var b = H("button", { class: "lx-choice small", type: "button", "aria-pressed": i === cur ? "true" : "false", text: t.label }, trace);
      b.addEventListener("click", function () { build(); run(i); });
      return b;
    }
    var btns = o.traces.map(button);
    function update(traces) {
      if (traces) o.traces = traces;
      cur = Math.max(0, Math.min(cur, o.traces.length - 1));
      if (o.traces.length === btns.length) o.traces.forEach(function (t, i) { btns[i].textContent = t.label; });   // in place: focus stays
      else { trace.innerHTML = ""; btns = o.traces.map(button); }
      if (mode) run(cur, true); else btns.forEach(function (b, j) { b.setAttribute("aria-pressed", j === cur ? "true" : "false"); });
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(box)) build(); }).observe(box);
    setTimeout(build, 0);
    return { build: build, run: run, update: update };
  };
})();
