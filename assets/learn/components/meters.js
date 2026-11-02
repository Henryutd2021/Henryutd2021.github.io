/* meters.js — LX.Meters: the technical balance beam (supply stack left, demand right) and the 60 Hz frequency dial.
   const m = LX.Meters(host, { maxMW: 360 });
   m.set({nuclear, solar, wind, cc, pk, demand, freq, curtailed})   numbers in MW and Hz; the beam tips toward the heavier side
   The status pill ("Balanced", "Short by 20 MW", "Too much by 5 MW") is announced politely to screen readers.
   Supply stack order (bottom to top): nuclear, solar, wind, gas combined-cycle, gas peaker. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H, S = LX.S, clamp = LX.clamp;
  var STACK = ["nuclear", "solar", "wind", "cc", "pk"];
  LX.Meters = function (host, opts) {
    opts = opts || {};
    var K = 72 / (opts.maxMW || 360);
    var row = H("div", { class: "lx-meters" }, host);
    var m1 = H("div", { class: "lx-meter", role: "group", "aria-label": "Balance of supply and demand" }, row);
    H("div", { class: "lx-meter-h", html: "<span>Supply vs demand</span>" }, m1);
    var svg = S("svg", { class: "bal", viewBox: "0 0 320 150", "aria-hidden": "true" }, m1);
    S("path", { d: "M128 136 H192", stroke: "var(--lx-ink-3)", "stroke-width": 1.5 }, svg);
    for (var i = 0; i < 8; i++) S("path", { d: "M" + (132 + i * 8) + " 137 l-6 7", stroke: "var(--lx-ink-3)", "stroke-width": 1 }, svg);
    S("path", { d: "M160 106 L146 136 H174 Z", fill: "var(--lx-surface-2)", stroke: "var(--lx-ink-2)", "stroke-width": 1.5 }, svg);
    S("path", { d: "M30 106 H290", stroke: "var(--lx-line-2)", "stroke-width": 1, "stroke-dasharray": "3 4" }, svg);
    var beam = S("g", null, svg);
    S("rect", { x: 46, y: 103, width: 228, height: 6, rx: 2, fill: "var(--lx-ink-2)" }, beam);
    S("circle", { cx: 160, cy: 106, r: 4, fill: "var(--lx-surface)", stroke: "var(--lx-ink-2)", "stroke-width": 1.5 }, svg);
    var panL = S("g", null, svg), panR = S("g", null, svg), segs = {};
    STACK.forEach(function (k) { segs[k] = S("rect", { x: -22, width: 44, rx: 1.5, fill: LX.PLANTS[k].c }, panL); });
    S("path", { d: "M-28 0 H28", stroke: "var(--lx-ink-2)", "stroke-width": 2.5 }, panL);
    var dBar = S("rect", { x: -22, width: 44, rx: 1.5, fill: "var(--lx-demand)" }, panR);
    S("path", { d: "M-28 0 H28", stroke: "var(--lx-ink-2)", "stroke-width": 2.5 }, panR);
    var rd = H("div", { class: "lx-bal-read" }, m1);
    var a = H("div", null, rd); H("span", { text: "Supply" }, a); var supB = H("b", null, a);
    var b = H("div", null, rd); H("span", { text: "Demand" }, b); var demB = H("b", null, b);
    var st = H("div", { class: "lx-bal-status", "aria-live": "polite" }, m1);
    var note = H("div", { class: "lx-bal-note" }, m1);

    var m2 = H("div", { class: "lx-meter", role: "group", "aria-label": "Grid frequency" }, row);
    H("div", { class: "lx-meter-h", html: "<span>Frequency</span>" }, m2);
    var dsv = S("svg", { class: "dial", viewBox: "0 0 140 92", "aria-hidden": "true" }, m2);
    var cx = 70, cy = 78, R = 56;
    function pol(v, r) { var ang = Math.PI * (1 - (v - 59.5) / 1.0); return [cx + r * Math.cos(ang), cy - r * Math.sin(ang)]; }
    function arc(v0, v1, r) { var p0 = pol(v0, r), p1 = pol(v1, r); return "M" + p0[0] + " " + p0[1] + " A " + r + " " + r + " 0 0 1 " + p1[0] + " " + p1[1]; }
    S("path", { d: arc(59.5, 60.5, R), stroke: "var(--lx-surface-3)", "stroke-width": 10, fill: "none" }, dsv);
    S("path", { d: arc(59.5, 59.8, R), stroke: "var(--lx-bad)", "stroke-width": 10, fill: "none", opacity: ".55" }, dsv);
    S("path", { d: arc(60.2, 60.5, R), stroke: "var(--lx-warn)", "stroke-width": 10, fill: "none", opacity: ".55" }, dsv);
    S("path", { d: arc(59.97, 60.03, R), stroke: "var(--lx-good)", "stroke-width": 10, fill: "none" }, dsv);
    [59.5, 59.75, 60, 60.25, 60.5].forEach(function (v) { var p = pol(v, R - 8), q = pol(v, R + 6); S("path", { d: "M" + p[0] + " " + p[1] + " L" + q[0] + " " + q[1], stroke: "var(--lx-ink-3)", "stroke-width": v === 60 ? 2 : 1 }, dsv); });
    [[59.5, "59.5"], [60, "60"], [60.5, "60.5"]].forEach(function (v) {
      var p = pol(v[0], R + 4);
      var t = S("text", { x: p[0], y: v[0] === 60 ? p[1] - 4 : p[1] + 12, "text-anchor": v[0] < 60 ? "start" : v[0] > 60 ? "end" : "middle", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, dsv);
      t.textContent = v[1];
    });
    var needle = S("g", null, dsv);
    S("path", { d: "M" + cx + " " + cy + " L" + cx + " " + (cy - R + 8), stroke: "var(--lx-ink)", "stroke-width": 2.5, "stroke-linecap": "round" }, needle);
    S("circle", { cx: cx, cy: cy, r: 4.5, fill: "var(--lx-ink)" }, dsv);
    var hz = H("div", { class: "lx-hz-read" }, m2);
    var hzs = H("div", { class: "lx-hz-state" }, m2);

    var cur = { ang: 0, f: 60 }, tgt = { ang: 0, f: 60 }, parts = null, tot = { s: 0, d: 0 }, inited = false;
    function set(x) {
      parts = {}; STACK.forEach(function (k) { parts[k] = x[k] || 0; });
      var sup = STACK.reduce(function (s, k) { return s + parts[k]; }, 0), dem = x.demand, diff = sup - dem;
      tot = { s: sup, d: dem };
      tgt.ang = Math.abs(diff) < 2.5 ? 0 : -Math.sign(diff) * Math.min(9, 2.5 + Math.abs(diff) * 0.08);
      tgt.f = x.freq == null ? 60 : x.freq;
      supB.textContent = LX.fmt.mw(sup); demB.textContent = LX.fmt.mw(dem);
      if (Math.abs(diff) < 2.5) st.innerHTML = '<span class="lx-pill good">' + LX.icon("check") + "Balanced</span>";
      else if (diff < 0) st.innerHTML = '<span class="lx-pill bad">Short by ' + Math.round(-diff) + " MW</span>";
      else st.innerHTML = '<span class="lx-pill warn">Too much by ' + Math.round(diff) + " MW</span>";
      note.textContent = x.curtailed > 0.5 ? "Spilling " + Math.round(x.curtailed) + " MW of wind and sun" : "";
      hz.innerHTML = tgt.f.toFixed(2) + " <small>Hz</small>";
      var off = Math.abs(tgt.f - 60) < 0.005;
      hzs.className = "lx-hz-state " + (off ? "good" : tgt.f < 60 ? "bad" : "warn");
      hzs.textContent = off ? "On target" : tgt.f < 60 ? "Generators slowing" : "Generators speeding up";
      if (LX.reduced() || !inited) { cur.ang = tgt.ang; cur.f = tgt.f; inited = true; }
      draw();
    }
    function draw() {
      if (!parts) return;
      var a = cur.ang * Math.PI / 180, L = 110;
      beam.setAttribute("transform", "rotate(" + cur.ang.toFixed(2) + " 160 106)");
      panL.setAttribute("transform", "translate(" + (160 - L * Math.cos(a)).toFixed(1) + " " + (106 - L * Math.sin(a) - 3).toFixed(1) + ")");
      panR.setAttribute("transform", "translate(" + (160 + L * Math.cos(a)).toFixed(1) + " " + (106 + L * Math.sin(a) - 3).toFixed(1) + ")");
      var y = 0;
      STACK.forEach(function (key) {
        var hgt = Math.max(0, parts[key] * K - (parts[key] > 0.5 ? 1.5 : 0));
        y -= parts[key] * K; segs[key].setAttribute("y", y.toFixed(1)); segs[key].setAttribute("height", hgt.toFixed(1));
      });
      dBar.setAttribute("y", (-tot.d * K).toFixed(1)); dBar.setAttribute("height", (tot.d * K).toFixed(1));
      needle.setAttribute("transform", "rotate(" + (clamp((cur.f - 60) / 0.5, -1, 1) * 90).toFixed(1) + " " + cx + " " + cy + ")");
    }
    LX.anim({ visible: function () { return LX.visible(row); }, step: function (dt) {
      var k = 1 - Math.exp(-dt * 6), moved = false;
      ["ang", "f"].forEach(function (key) { if (Math.abs(cur[key] - tgt[key]) > 0.0005) { cur[key] += (tgt[key] - cur[key]) * k; moved = true; } else cur[key] = tgt[key]; });
      if (moved) draw();
    } });
    return { el: row, beam: m1, dial: m2, set: set };
  };
})();
