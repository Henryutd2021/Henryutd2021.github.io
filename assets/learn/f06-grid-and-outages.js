// f06-grid-and-outages.js — F6, "How does power reach your plug, and why does it sometimes fail?" (step cards, W3, 2026-11-03).
//
// Data: assets/learn/data/f06-grid-and-outages.json (the eight stops from plant to socket with sourced U.S. voltage
// classes, the illustrative 5-ohm line, Prairie Town's east-side network and storm, EIA's reliability table 2015-2025,
// DOE's distribution finding, each with its source and date), 03-balancing.json (lesson 3's Winter Storm Uri numbers,
// FERC-NERC and EIA) and path.json (lesson links that appear once a lesson is live).
//
// No optimization model (model mode "none"). The pure functions below:
//   loss(P, kV, R)         one wire, no reactive power: current I = P / V (A), heat lost I² R (MW) and its share of P
//   outage(net, failed)    which homes go dark, and why: the high-voltage loop feeds the substation while any working
//                          path joins it to the plant or the rest of the grid; below it the feeders are radial trees, and a
//                          fault opens the closest protective device upstream of it (the section's own fuse, recloser or
//                          breaker), darkening every section below that device
//   restore(net, faults, order)  one crew repairs the distribution faults in the reader's order (a transmission crew
//                          works in parallel); returns the timeline of homes dark and the customer-minutes it adds up to
//   bestOrders(net, faults) every order, and the orders that reach the least customer-minutes (ties listed, not hidden)
//   reliability(cm, interrupted, served)  SAIDI = customer-minutes / customers served; SAIFI = customers interrupted /
//                          customers served (one storm; EIA's measures count non-momentary interruptions over a year)
//   medShare(row), losShare(row)  shares of a year's SAIDI from major event days, and from loss of supply on the bulk
//                          system (EIA Table 11.1)
// Prairie Town's network, homes and repair hours are illustrative; the voltage classes and reliability numbers are real.
//
// Lesson-local components (candidates for promotion): VoltPath (a plant-to-socket path with eight stops, two layouts,
// and a voltage staircase of buttons), GridNet (i-network for distribution: a one-line diagram whose parts are buttons
// that fail and repair, with protection logic, dark homes and a text version; i-hazard: a preset storm to inspect).
// Shared components: LX.StepCards, LX.Slider, LX.Predict, LX.NumAnswer, LX.Plot, LX.EnergyChain, LX.CausalChain,
// LX.ConceptMap, LX.CompareTable.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  function loss(P_MW, kV, R) {
    var I = P_MW * 1e6 / (kV * 1e3), lossMW = I * I * R / 1e6;
    return { I: I, lossMW: lossMW, pct: 100 * lossMW / P_MW };
  }
  function byId(list) { var o = {}; list.forEach(function (x) { o[x.id] = x; }); return o; }
  function homesTotal(net) { return net.sections.reduce(function (s, x) { return s + x.homes; }, 0); }
  // is the substation joined to a working source through working lines?
  function fed(net, failed) {
    var src = {}, seen = { S: true }, stack = ["S"];
    net.sources.forEach(function (s) { src[s.id] = true; });
    while (stack.length) {
      var u = stack.pop();
      if (src[u]) return true;
      net.lines.forEach(function (l) {
        if (failed[l.id]) return;
        var v = l.from === u ? l.to : l.to === u ? l.from : null;
        if (v && !seen[v]) { seen[v] = true; stack.push(v); }
      });
    }
    return false;
  }
  function chainUp(net, id) {   // the section and its ancestors, nearest first
    var S = byId(net.sections), out = [];
    while (id && id !== "S") { out.push(id); id = S[id].parent; }
    return out;
  }
  function below(net, id) {     // the section and every section downstream of it
    var out = [id], grew = true;
    while (grew) { grew = false; net.sections.forEach(function (s) { if (out.indexOf(s.parent) >= 0 && out.indexOf(s.id) < 0) { out.push(s.id); grew = true; } }); }
    return out;
  }
  // failed: {id: true} for lines, "XF" and sections. Each faulted section opens its own device (the closest one upstream
  // of the fault). A section is dark when it or a section above it has failed; its cause is the opened device nearest the
  // substation. Above the feeders: a substation cut off from every source ("loop"), or a failed transformer ("XF"),
  // darkens every section.
  function outage(net, failed) {
    failed = failed || {};
    var Sx = byId(net.sections), dark = {}, cause = {}, opened = {}, upstream = null;
    if (!fed(net, failed)) upstream = "loop";
    else if (failed.XF) upstream = "XF";
    net.sections.forEach(function (s) {
      if (upstream) { dark[s.id] = true; cause[s.id] = upstream; return; }
      if (failed[s.id]) opened[s.dev] = s.id;
      chainUp(net, s.id).forEach(function (a) { if (failed[a]) { dark[s.id] = true; cause[s.id] = Sx[a].dev; } });   // the last hit is nearest the substation
    });
    var homes = 0; net.sections.forEach(function (s) { if (dark[s.id]) homes += s.homes; });
    return { dark: dark, cause: cause, opened: opened, upstream: upstream, homesDark: homes, homesTotal: homesTotal(net) };
  }
  // the groups of dark homes, one per cause, in the order of the drawing
  function groups(net, out) {
    var g = {}, order = [];
    net.sections.forEach(function (s) {
      if (!out.dark[s.id]) return;
      var c = out.cause[s.id];
      if (!g[c]) { g[c] = { cause: c, sections: [], homes: 0 }; order.push(c); }
      g[c].sections.push(s.id); g[c].homes += s.homes;
    });
    return order.map(function (c) { return g[c]; });
  }
  // one distribution crew in the reader's order; faults with crew "transmission" are repaired in parallel from hour 0
  function restore(net, faults, order) {
    var F = byId(faults), done = {}, t = 0;
    order.forEach(function (id) { t += F[id].repair_h; done[id] = t; });
    faults.forEach(function (f) { if (f.crew === "transmission") done[f.id] = f.repair_h; });
    var times = Object.keys(done).map(function (k) { return done[k]; }).concat([0]).sort(function (a, b) { return a - b; })
      .filter(function (v, i, a) { return i === 0 || v !== a[i - 1]; });
    var steps = [], cm = 0, hit = {};
    for (var i = 0; i < times.length; i++) {
      var failed = {}; faults.forEach(function (f) { if (done[f.id] > times[i]) failed[f.id] = true; });
      var o = outage(net, failed);
      net.sections.forEach(function (s) { if (o.dark[s.id]) hit[s.id] = true; });
      steps.push({ t: times[i], homes: o.homesDark });
      if (i + 1 < times.length) cm += o.homesDark * (times[i + 1] - times[i]) * 60;
    }
    var interrupted = 0; net.sections.forEach(function (s) { if (hit[s.id]) interrupted += s.homes; });
    return { order: order.slice(), done: done, steps: steps, end: t, customerMinutes: cm, interrupted: interrupted };
  }
  function perms(a) { if (a.length < 2) return [a.slice()]; var out = []; a.forEach(function (x, i) { perms(a.slice(0, i).concat(a.slice(i + 1))).forEach(function (p) { out.push([x].concat(p)); }); }); return out; }
  function crewFaults(faults) { return faults.filter(function (f) { return f.crew !== "transmission"; }).map(function (f) { return f.id; }); }
  function bestOrders(net, faults) {
    var all = perms(crewFaults(faults)).map(function (o) { return restore(net, faults, o); });
    var min = Math.min.apply(null, all.map(function (r) { return r.customerMinutes; }));
    return { all: all, min: min, best: all.filter(function (r) { return r.customerMinutes === min; }) };
  }
  function reliability(cm, interrupted, served) { var saidi = cm / served, saifi = interrupted / served; return { saidi: saidi, saifi: saifi, caidi: saifi ? saidi / saifi : 0 }; }
  function medShare(r) { return (r.saidi - r.saidi_nomed) / r.saidi; }
  function losShare(r) { return (r.saidi - r.saidi_nolos) / r.saidi; }
  // the years, ending with the latest, in which major event days gave more than half of SAIDI; and the year before them
  function medRun(rows) {
    var k = rows.length - 1; while (k >= 0 && medShare(rows[k]) > 0.5) k--;
    return { from: rows[k + 1].year, to: rows[rows.length - 1].year, before: k >= 0 ? rows[k] : null };
  }
  function medRunText(rows) {
    var r = medRun(rows);
    return "Major event days, mostly storms, gave more than half of each year's minutes from " + r.from + " to " + r.to +
      (r.before ? " (" + r.before.year + ": " + fmtN(100 * medShare(r.before)) + "%)" : "") + ". Elsewhere, and in other years, the ranking of causes can differ.";
  }
  function fmtN(v, d) { return v.toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function kvText(v) { return (v < 10 ? fmtN(v, 2).replace(/0$/, "") : fmtN(v, v % 1 ? 2 : 0)) + " kV"; }
  var model = { loss: loss, outage: outage, groups: groups, restore: restore, bestOrders: bestOrders, perms: perms, reliability: reliability,
    medShare: medShare, losShare: losShare, medRun: medRun, medRunText: medRunText, fed: fed, below: below, chainUp: chainUp, homesTotal: homesTotal, crewFaults: crewFaults, fmtN: fmtN, kvText: kvText };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S, LESSON = "f06-grid-and-outages";
  var VCLS = { gen: "Generator voltage", tx: "Transmission voltage", dist: "Distribution voltage", low: "Low voltage at the home" };
  var SEG = ["gen", "tx", "tx", "dist", "dist", "low", "low"];   // the voltage each wire between two stops carries
  var VOUT = { gen: 18000, up: 345000, line: 345000, sub: 12470, feeder: 12470, service: 240, meter: 240, socket: 120 };

  // ---- VoltPath: the path from plant to socket (lesson-local component)
  // glyphs drawn around (x, y) = (centre, ground); every fill and stroke from tokens (f6- classes in the page's style)
  var GLYPH = {
    gen: function (x, y) { return '<rect class="bld" x="' + (x - 30) + '" y="' + (y - 46) + '" width="44" height="46" rx="2"/><path class="stack" d="M' + (x + 4) + ' ' + (y - 46) + ' V' + (y - 70) + '"/>' +
      '<circle class="genc" cx="' + (x + 22) + '" cy="' + (y - 16) + '" r="13"/><text class="gl" x="' + (x + 22) + '" y="' + (y - 12) + '">G</text>'; },
    up: function (x, y) { return '<rect class="box" x="' + (x - 18) + '" y="' + (y - 40) + '" width="36" height="40" rx="3"/><path class="coil" d="M' + (x - 9) + ' ' + (y - 34) + ' v28 M' + (x + 9) + ' ' + (y - 34) + ' v28"/>' +
      '<path class="fin" d="M' + (x - 22) + ' ' + (y - 30) + ' h4 M' + (x - 22) + ' ' + (y - 20) + ' h4 M' + (x + 18) + ' ' + (y - 30) + ' h4 M' + (x + 18) + ' ' + (y - 20) + ' h4"/>'; },
    line: function (x, y) { return '<path class="tower" d="M' + (x - 16) + ' ' + y + ' L' + (x - 4) + ' ' + (y - 88) + ' L' + (x + 4) + ' ' + (y - 88) + ' L' + (x + 16) + ' ' + y +
      ' M' + (x - 22) + ' ' + (y - 72) + ' H' + (x + 22) + ' M' + (x - 18) + ' ' + (y - 56) + ' H' + (x + 18) + ' M' + (x - 12) + ' ' + (y - 40) + ' L' + (x + 12) + ' ' + y + ' M' + (x + 12) + ' ' + (y - 40) + ' L' + (x - 12) + ' ' + y + '"/>'; },
    sub: function (x, y) { return '<rect class="fence" x="' + (x - 34) + '" y="' + (y - 44) + '" width="68" height="44" rx="2"/><rect class="box" x="' + (x - 24) + '" y="' + (y - 34) + '" width="22" height="28" rx="2"/>' +
      '<rect class="brk" x="' + (x + 6) + '" y="' + (y - 26) + '" width="8" height="20"/><rect class="brk" x="' + (x + 18) + '" y="' + (y - 26) + '" width="8" height="20"/>'; },
    feeder: function (x, y) { return '<path class="pole" d="M' + x + ' ' + y + ' V' + (y - 66) + ' M' + (x - 18) + ' ' + (y - 60) + ' H' + (x + 18) + '"/>'; },
    service: function (x, y) { return '<path class="pole" d="M' + x + ' ' + y + ' V' + (y - 66) + ' M' + (x - 14) + ' ' + (y - 60) + ' H' + (x + 14) + '"/><rect class="can" x="' + (x + 3) + '" y="' + (y - 48) + '" width="13" height="18" rx="3"/>'; },
    meter: function (x, y) { return '<rect class="wall" x="' + (x - 26) + '" y="' + (y - 50) + '" width="52" height="50"/><path class="roof" d="M' + (x - 32) + ' ' + (y - 48) + ' L' + x + ' ' + (y - 72) + ' L' + (x + 32) + ' ' + (y - 48) + ' Z"/>' +
      '<rect class="mtr" x="' + (x - 20) + '" y="' + (y - 34) + '" width="14" height="18" rx="2"/><circle class="dial" cx="' + (x - 13) + '" cy="' + (y - 26) + '" r="4"/>'; },
    socket: function (x, y) { return '<rect class="wall" x="' + (x - 28) + '" y="' + (y - 50) + '" width="56" height="50"/><rect class="plate" x="' + (x - 22) + '" y="' + (y - 26) + '" width="14" height="18" rx="2"/>' +
      '<path class="lampc" d="M' + (x - 15) + ' ' + (y - 17) + ' C' + (x - 4) + ' ' + (y - 4) + ' ' + (x + 4) + ' ' + (y - 2) + ' ' + (x + 12) + ' ' + (y - 2) + '"/>' +
      '<path class="lamp" d="M' + (x + 4) + ' ' + (y - 46) + ' h16 l4 12 h-24 z"/><path class="pole" d="M' + (x + 12) + ' ' + (y - 34) + ' V' + (y - 2) + '"/>'; }
  };
  var ATTACH = { gen: [22, -16], up: [0, -40], line: [0, -80], sub: [0, -40], feeder: [0, -60], service: [0, -60], meter: [-26, -40], socket: [-28, -40] };
  function layout(narrow) {
    if (!narrow) return { w: 780, h: 200, at: [60, 152, 246, 352, 450, 540, 628, 720].map(function (x) { return [x, 176]; }), disc: -100 };
    return { w: 360, h: 330, at: [[44, 140], [126, 140], [210, 140], [304, 140], [304, 304], [210, 304], [126, 304], [44, 304]], disc: -100 };
  }
  function VoltPath(host, o) {
    var stops = o.stops, w = H("div", { class: "f6p" }, host), sel = o.start || 0, seen = {}, mode = null;
    var fig = H("div", { class: "f6p-fig" }, w);
    var legend = H("ul", { class: "f6p-legend", "aria-label": "Wire colours" }, w);
    ["gen", "tx", "dist", "low"].forEach(function (k) { var li = H("li", null, legend); H("i", { class: "v-" + k }, li); H("span", { text: VCLS[k] }, li); });
    var rail = H("div", { class: "f6p-rail", role: "group", "aria-label": "Stops from plant to socket, with each one's voltage" }, w), btns = [];
    var lo = Math.log10(50), hi = Math.log10(1e6);
    stops.forEach(function (s, i) {
      var b = H("button", { type: "button", class: "f6p-stop v-" + s.cls, "aria-pressed": "false", "aria-label": "Stop " + s.n + ": " + s.name + ", " + s.kv }, rail);
      var bar = H("span", { class: "bar", "aria-hidden": "true" }, b);
      H("i", { style: "height:" + Math.round(100 * (Math.log10(VOUT[s.key]) - lo) / (hi - lo)) + "%" }, bar);
      H("span", { class: "n", text: s.n }, b);
      var vo = VOUT[s.key], vt = vo >= 1000 ? fmtN(vo / 1000, vo % 1000 ? 2 : 0) : String(vo), vl = H("span", { class: "v" + (vt.length >= 5 ? " long" : "") }, b); H("span", { text: vt }, vl); H("span", { class: "u", text: vo >= 1000 ? "kV" : "V" }, vl);
      b.addEventListener("click", function () { go(i); });
      btns.push(b);
    });
    var panel = H("div", { class: "f6p-panel", "aria-live": "polite" }, w);
    var nav = H("div", { class: "f6p-nav" }, w);
    var bPrev = H("button", { type: "button", class: "lx-btn ghost small", html: LX.icon("back") + "Back a stop" }, nav);
    var bNext = H("button", { type: "button", class: "lx-btn small", html: "Next stop" + LX.icon("arrow") }, nav);
    var count = H("span", { class: "lx-hint" }, nav);
    bPrev.addEventListener("click", function () { go(sel - 1); }); bNext.addEventListener("click", function () { go(sel + 1); });
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the path" }, alt);
    var ol = H("ol", null, alt);
    stops.forEach(function (s) { H("li", { html: "<b>" + LX.esc(s.name) + "</b>, " + LX.esc(s.kv) + " in Prairie Town (U.S. range: " + LX.esc(s.range) + "). " + LX.rich(s.what) }, ol); });
    function draw() {
      var narrow = fig.clientWidth < 560, L = layout(narrow), svg = "";
      mode = narrow;
      var pts = stops.map(function (s, i) { return [L.at[i][0] + ATTACH[s.key][0], L.at[i][1] + ATTACH[s.key][1]]; });
      svg += '<rect class="sky" x="0" y="0" width="' + L.w + '" height="' + L.h + '"/>';
      (narrow ? [176, 330] : [200]).forEach(function (gy) { svg += '<rect class="ground" x="0" y="' + (gy - 24) + '" width="' + L.w + '" height="24"/>'; });
      // wires, coloured by the voltage they carry
      for (var i = 0; i < pts.length - 1; i++) {
        var c = SEG[i];
        var a = pts[i], b = pts[i + 1], d = narrow && i === 3 ? "M" + a[0] + " " + a[1] + " C" + (a[0] + 46) + " " + a[1] + " " + (b[0] + 46) + " " + b[1] + " " + b[0] + " " + b[1]
          : "M" + a[0] + " " + a[1] + " Q" + ((a[0] + b[0]) / 2) + " " + (Math.max(a[1], b[1]) + 14) + " " + b[0] + " " + b[1];
        svg += '<path class="wire v-' + c + '" d="' + d + '"/><path class="flow v-' + c + '" d="' + d + '"/>';
      }
      stops.forEach(function (s, k) {
        var at = L.at[k], on = k === sel;
        svg += '<g class="stop' + (on ? " on" : "") + '" data-i="' + k + '">' + (on ? '<rect class="halo" x="' + (at[0] - 42) + '" y="' + (at[1] - 112) + '" width="84" height="118" rx="10"/>' : "") +
          GLYPH[s.key](at[0], at[1]) + '<circle class="disc" cx="' + at[0] + '" cy="' + (at[1] + L.disc) + '" r="12"/><text class="dn" x="' + at[0] + '" y="' + (at[1] + L.disc + 4.5) + '">' + s.n + '</text></g>';
      });
      fig.innerHTML = '<svg class="f6p-svg" viewBox="0 0 ' + L.w + ' ' + L.h + '" role="img" aria-label="' + LX.esc(o.aria) + '">' + svg + "</svg>";
      fig.querySelectorAll("g.stop").forEach(function (g) { g.addEventListener("click", function () { go(+g.getAttribute("data-i")); }); });
    }
    function go(i, quiet) {
      i = LX.clamp(i, 0, stops.length - 1); sel = i; seen[i] = true;
      var s = stops[i], had = document.activeElement;
      draw();
      panel.innerHTML = "";
      var t = H("p", { class: "f6p-title" }, panel); H("span", { class: "c v-" + s.cls, text: s.n }, t); H("b", { text: s.name }, t);
      var ch = H("p", { class: "f6p-v" }, panel);
      H("span", { class: "lx-pill neutral", text: "Prairie Town: " + s.kv }, ch); H("span", { class: "lx-hint", text: "Typical in the U.S.: " + s.range }, ch);
      H("p", { class: "f6p-what", html: LX.rich(s.what) }, panel);
      btns.forEach(function (b, k) { b.setAttribute("aria-pressed", k === i ? "true" : "false"); b.classList.toggle("seen", !!seen[k]); });
      bPrev.disabled = i === 0; bNext.disabled = i === stops.length - 1;
      if (had === bNext && bNext.disabled) bPrev.focus({ preventScroll: true });
      if (had === bPrev && bPrev.disabled) bNext.focus({ preventScroll: true });
      var n = Object.keys(seen).length;
      count.textContent = n < stops.length ? "Stops visited: " + n + " of " + stops.length + "." : "All eight stops visited.";
      if (!quiet && o.onGo) o.onGo(i, n);
      LX.emit("layout");
    }
    (o.seen || []).forEach(function (k) { seen[k] = true; });
    go(sel, true);
    if (window.ResizeObserver) new ResizeObserver(function () { var nw = fig.clientWidth < 560; if (nw !== mode) draw(); }).observe(fig);
    return { el: w, go: go, seen: function () { return Object.keys(seen).length; } };
  }

  // ---- GridNet: the east side's one-line diagram (lesson-local i-network with i-hazard)
  // drawing in a 400 × 384 box: the high-voltage loop on top, the substation, two radial feeders with fused laterals
  var GEO = {
    nodes: { G: [58, 46], N: [342, 46], S: [200, 128] },
    sections: {
      F1A: [[150, 158], [110, 158], [110, 262]], L1: [[110, 206], [24, 206]], L2: [[110, 244], [196, 244]],
      F1B: [[110, 262], [110, 352]], L3: [[110, 300], [24, 300]], L4: [[110, 338], [196, 338]],
      F2A: [[250, 158], [290, 158], [290, 330]], L5: [[290, 214], [212, 214]], L6: [[290, 286], [376, 286]]
    },
    dev: { B1: [150, 158], B2: [250, 158], R1: [110, 262], FU1: [98, 206], FU2: [122, 244], FU3: [98, 300], FU4: [122, 338], FU5: [278, 214], FU6: [302, 286] }
  };
  var GLABEL = { F1A: [116, 186], F1B: [116, 284], F2A: [296, 196], L1: [26, 198], L2: [140, 236], L3: [26, 292], L4: [140, 330], L5: [216, 206], L6: [324, 278] };
  function homesOf(id, n) {   // house positions along a lateral, beyond its fuse
    var p = GEO.sections[id], a = p[0], b = p[1], out = [], dir = b[0] > a[0] ? 1 : -1;
    for (var k = 0; k < n; k++) out.push([a[0] + dir * (24 + k * 12), a[1] + 12]);
    return out;
  }
  function GridNet(host, o) {
    var net = o.net, w = H("div", { class: "f6n" }, host), failed = {}, inspect = null, mode = o.mode || "free", seen = {};
    var stage = H("div", { class: "f6n-stage" }, w), side = H("div", { class: "f6n-side" }, w);
    var status = H("div", { class: "f6n-status", "aria-live": "polite" }, side);
    var key = H("ul", { class: "f6n-key", "aria-label": "Key" }, side);
    [["lit", "Home with power"], ["dark", "Home without power"], ["fault", "Failed part"], ["open", "Device that opened"]].forEach(function (k) { var li = H("li", null, key); H("i", { class: k[0] }, li); H("span", { text: k[1] }, li); });
    var tools = H("div", { class: "f6n-tools" }, side);
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the network" }, alt);
    var altBody = H("div", null, alt);
    var SEC = byId(net.sections), LIN = byId(net.lines);
    function elName(id) { return id === "XF" ? net.xf.name : LIN[id] ? LIN[id].name : SEC[id].name; }
    function canPick(id) { return mode === "free" || (mode === "storm" && failed[id]); }
    function devWord(d) { var k = net.devices[d].kind; return k === "fuse" ? "the fuse on " + d.replace("FU", "L") : "the " + (k === "recloser" ? "[[recloser|recloser]]" : "[[circuit-breaker|breaker]]") + " " + d; }
    function devName(d) { return d === "loop" ? "No working line reaches the substation" : d === "XF" ? "The substation transformer failed" : net.devices[d].name; }
    function explain(id, out) {
      if (!failed[id]) return elName(id) + ": working.";
      if (LIN[id]) return elName(id) + " is down. " + (out.upstream === "loop" ? "With no working line left into the substation, all " + out.homesTotal + " homes are dark." : "Power takes another way round the loop: no home loses power.");
      if (id === "XF") return net.xf.name + " failed: every feeder loses power, all " + out.homesTotal + " homes.";
      var d = SEC[id].dev, n = 0; MODEL.below(net, id).forEach(function (x) { n += SEC[x].homes; });
      if (out.upstream) return elName(id) + " is down, but the substation is already dark.";
      return elName(id) + " is down. The closest device upstream, " + devWord(d) + ", opened: the " + n + " home" + (n === 1 ? "" : "s") + " below it went dark.";
    }
    function draw() {
      var out = MODEL.outage(net, failed), svg = "";
      svg += '<rect class="bg" x="0" y="0" width="400" height="384" rx="10"/>';
      svg += '<text class="zone" x="12" y="20">High-voltage loop (meshed)</text><text class="zone" x="12" y="376">Feeders (radial)</text>';
      // lines of the loop
      net.lines.forEach(function (l) {
        var a = GEO.nodes[l.from], b = GEO.nodes[l.to], d = "M" + a[0] + " " + a[1] + " L" + b[0] + " " + b[1];
        svg += el(l.id, d, "tx" + (failed[l.id] ? " fault" : ""), along([a, b], 0.5));
      });
      svg += '<g class="src"><rect x="30" y="30" width="56" height="32" rx="4"/><text x="58" y="51">Plant</text></g>';
      svg += '<g class="src"><rect x="306" y="30" width="72" height="32" rx="4"/><text x="342" y="51">Plains Grid</text></g>';
      // substation and its transformer
      var subDark = out.upstream ? " dark" : "";
      svg += el("XF", "M200 116 V146", "xf" + (failed.XF ? " fault" : "") + subDark, [200, 131], '<rect class="subbox' + subDark + '" x="176" y="110" width="48" height="40" rx="4"/><circle class="xfc" cx="200" cy="124" r="7"/><circle class="xfc" cx="200" cy="136" r="7"/>');
      svg += '<path class="bus' + subDark + '" d="M200 150 V158 M150 158 H250"/><text class="lab" x="232" y="124">Substation</text>';
      // feeders and laterals
      net.sections.forEach(function (s) {
        var p = GEO.sections[s.id], d = "M" + p.map(function (q) { return q[0] + " " + q[1]; }).join(" L");
        svg += el(s.id, d, (s.kind === "main" ? "main" : "lat") + (out.dark[s.id] ? " dark" : "") + (failed[s.id] ? " fault" : ""), along(p, 0.65));
        svg += '<text class="lab sm" x="' + GLABEL[s.id][0] + '" y="' + GLABEL[s.id][1] + '">' + (s.kind === "main" ? s.id.replace("F1A", "North 1").replace("F1B", "North 2").replace("F2A", "South") : s.id) + "</text>";
        if (s.homes) homesOf(s.id, s.homes).forEach(function (h) { svg += '<path class="home' + (out.dark[s.id] ? " dark" : "") + '" d="M' + (h[0] - 5) + " " + (h[1] + 9) + " V" + (h[1] + 3) + " L" + h[0] + " " + (h[1] - 2) + " L" + (h[0] + 5) + " " + (h[1] + 3) + " V" + (h[1] + 9) + ' Z"/>'; });
      });
      // protective devices
      Object.keys(GEO.dev).forEach(function (d) {
        var p = GEO.dev[d], k = net.devices[d].kind, op = out.opened[d] ? " open" : "";
        if (k === "fuse") svg += '<rect class="dev fuse' + op + '" x="' + (p[0] - 6) + '" y="' + (p[1] - 4) + '" width="12" height="8" rx="2"/>';
        else svg += '<rect class="dev ' + k + op + '" x="' + (p[0] - 8) + '" y="' + (p[1] - 8) + '" width="16" height="16" rx="' + (k === "recloser" ? 8 : 2) + '"/><text class="devl" x="' + p[0] + '" y="' + (p[1] + 4) + '">' + d.charAt(0) + "</text>";
      });
      stage.innerHTML = '<svg class="f6n-svg" viewBox="0 0 400 384" role="group" aria-label="' + LX.esc(o.aria) + '">' + svg + "</svg>";
      stage.querySelectorAll("g.el").forEach(function (g) {
        var id = g.getAttribute("data-id");
        if (!canPick(id)) { g.removeAttribute("tabindex"); g.removeAttribute("role"); g.setAttribute("aria-hidden", "true"); return; }
        function act() { pick(id, true); }
        g.addEventListener("click", act);
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      });
      paintStatus(out);
      paintAlt(out);
      LX.emit("layout");
      return out;
    }
    function along(p, t) { var a = p[p.length - 2], b = p[p.length - 1]; return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; }
    function el(id, d, cls, at, extra) {
      var lab = mode === "storm" ? elName(id) + (failed[id] ? ", failed: tap to see why" : "") : elName(id) + (failed[id] ? ", failed: tap to repair" : ", working: tap to fail");
      return '<g class="el ' + cls + (inspect === id ? " sel" : "") + '" data-id="' + id + '" role="button" tabindex="0" aria-pressed="' + (failed[id] ? "true" : "false") + '" aria-label="' + LX.esc(lab) + '">' +
        '<path class="hit" d="' + d + '"/>' + (extra || "") + '<path class="wire" d="' + d + '"/>' + (failed[id] ? '<path class="x" d="M' + (at[0] - 6) + " " + (at[1] - 6) + " l12 12 m0 -12 l-12 12" + '"/>' : "") + "</g>";
    }
    function paintStatus(out) {
      status.innerHTML = "";
      var head = H("p", { class: "f6n-count" }, status);
      H("b", { text: out.homesDark + " of " + out.homesTotal }, head); H("span", { text: " homes without power" }, head);
      var line = inspect ? explain(inspect, out) : (Object.keys(failed).length ? "Tap a failed part for the reason." : o.hint);
      H("p", { class: "f6n-why", html: LX.rich(line) }, status);
    }
    function paintAlt(out) {
      altBody.innerHTML = "";
      var tb = H("table", { class: "lx-mini-table" }, altBody), th = H("tr", null, H("thead", null, tb));
      ["Part", "State", "Homes it serves", "Without power now"].forEach(function (h) { H("th", { scope: "col", text: h }, th); });
      var bd = H("tbody", null, tb);
      net.lines.concat([net.xf]).concat(net.sections).forEach(function (p) {
        var r = H("tr", null, bd), n = 0, dk = 0;
        if (SEC[p.id]) MODEL.below(net, p.id).forEach(function (x) { n += SEC[x].homes; if (out.dark[x]) dk += SEC[x].homes; });
        H("td", { text: elName(p.id) }, r); H("td", { text: failed[p.id] ? "failed" : "working" }, r);
        H("td", { text: SEC[p.id] ? String(n) : "all " + out.homesTotal }, r); H("td", { text: SEC[p.id] ? String(dk) : (out.upstream ? "all" : "0") }, r);
      });
      H("p", { class: "lx-hint", text: "Protection opens the closest fuse, recloser or breaker upstream of a fault. The loop has three lines, so power can take another path." }, altBody);
    }
    function pick(id, user) {
      if (mode === "free") { if (failed[id]) delete failed[id]; else failed[id] = true; }
      inspect = id; seen[id] = true;
      var out = draw();
      var g = stage.querySelector('g.el[data-id="' + id + '"]'); if (user && g) g.focus({ preventScroll: true });
      if (o.onPick) o.onPick(id, out, failed, seen);
      return out;
    }
    if (o.reset !== false && mode === "free") {
      var rb = H("button", { type: "button", class: "lx-btn ghost small", text: "Repair everything" }, tools);
      rb.addEventListener("click", function () { failed = {}; inspect = null; var out = draw(); if (o.onPick) o.onPick(null, out, failed, seen); });
    }
    (o.failed || []).forEach(function (id) { failed[id] = true; });
    draw();
    return { el: w, pick: pick, failed: function () { return failed; }, seen: function () { return seen; }, set: function (f) { failed = {}; (f || []).forEach(function (id) { failed[id] = true; }); inspect = null; return draw(); } };
  }
  var MODEL = model;

  // ---------------------------------------------------------------- the lesson
  function view(live, data, root) {
    var D = data.f06_grid_and_outages, U = data["03_balancing"].uri, P = data.path, net = D.net, faults = D.storm.faults;
    var log = LX.store.get("f6-log", {}) || {};
    function keep(k, v) { log[k] = v; LX.store.set("f6-log", log); }
    var served = homesTotal(net), best = bestOrders(net, faults), last = D.reliability.rows[D.reliability.rows.length - 1];
    var stormOut = outage(net, (function () { var f = {}; faults.forEach(function (x) { f[x.id] = true; }); return f; })());
    var FA = byId(faults);
    function faultName(id) { var s = byId(net.sections)[id]; return s ? s.short : byId(net.lines)[id].short; }

    var steps = [
      { text: "Power from Prairie Town's gas plant passes eight stops on its way to a lamp. Tap each stop, or use Next stop, to see its [[voltage|voltage]] and what it does.",
        build: function (act, api) {
          var seen0 = log.path || [];
          VoltPath(act, { stops: D.stops, seen: seen0, aria: "The path from Prairie Town's plant to a lamp: generator, step-up transformer, transmission tower, substation, feeder pole, service transformer, a home's meter and a socket.",
            onGo: function (i, n) {
              if (seen0.indexOf(i) < 0) { seen0.push(i); keep("path", seen0); }
              if (n === D.stops.length) { api.done(); api.saw("Up from **" + D.town.genKV + " kV** to **" + D.town.txKV + " kV** for the long trip, then down in steps to **" + D.town.socketV + " V** at the socket. Transformers make each step."); }
            } });
          if (seen0.length >= D.stops.length) api.done();
        } },
      { text: "Why step up? Send 100 MW through one line at different voltages: higher voltage needs less [[electric-current|current]], and the heat lost in the wire grows with current squared.",
        build: function (act, api) { lossStep(act, api); } },
      { text: "Predict: when a U.S. home loses power, where does the problem usually start?",
        build: function (act, api) {
          LX.Predict(act, { id: "f6-where", answer: "dist", fresh: true, lockText: "Locked in. The last step shows the answer.",
            options: [{ value: "plant", label: "At a power plant" }, { value: "tx", label: "On a high-voltage transmission line" }, { value: "dist", label: "On local wires: a substation, a feeder or a lateral" }],
            onPick: function (p) { keep("pred", p); api.done(); } });
          if (log.pred) api.done();
        } },
      { text: "Prairie Town's east side: a high-voltage loop above, two [[radial-network|radial]] feeders below. Tap parts to fail them: try one loop line, then one feeder part, and compare.",
        build: function (act, api) {
          var tried = log.tried || {};
          GridNet(act, { net: net, mode: "free", aria: "Prairie Town's east side: tap a part to fail or repair it", hint: "Every part is working. Tap a line, the substation or a feeder part to fail it.",
            onPick: function (id, out) {
              if (!id) return;
              if (byId(net.lines)[id]) tried.tx = true; else if (id !== "XF") tried.dist = true;
              keep("tried", tried);
              if (tried.tx && tried.dist) { api.done(); api.saw("One loop line down: power goes round the other way, the **[[n-minus-one|N−1]]** idea. A feeder fault: the closest device opens and every home below it goes dark, because a radial feeder has one path."); }
            } });
          if (tried.tx && tried.dist) api.done();
        } },
      { text: "A storm hits overnight: four parts fail. Tap each failed part to see which device opened, and how many homes it darkened.",
        build: function (act, api) {
          var seenS = {};
          GridNet(act, { net: net, mode: "storm", failed: faults.map(function (f) { return f.id; }), aria: "The east side after the storm: tap each failed part",
            hint: "Tap a failed part (marked with a cross) for the reason.",
            onPick: function (id) {
              seenS[id] = true;
              var n = faults.filter(function (f) { return seenS[f.id]; }).length;
              if (n === faults.length) { api.done(); api.saw("**" + stormOut.homesDark + " of " + served + "** homes are dark, for three local reasons; the downed loop line darkened none. A fault closer to the substation darkens more homes."); }
              else api.saw(FA[id].cause + ". " + n + " of " + faults.length + " failed parts checked.");
            } });
        } },
      { text: "One crew repairs the three local faults, one after another. Choose the order: every hour a home waits adds 60 [[customer-minutes|customer-minutes]].",
        build: function (act, api) { restoreStep(act, api); } },
      { text: "Reliability has two yardsticks: [[saidi|SAIDI]] (minutes without power per customer) and [[saifi|SAIFI]] (interruptions per customer). Work out your storm's SAIFI.",
        build: function (act, api) { measureStep(act, api); } },
      { text: "Now the real U.S. numbers. Pick a year to see how much of the average customer's outage time came on a few stormy days.", free: true,
        build: function (act, api) { realStep(act, api); } }
    ];

    // ---- step 2: the loss slider
    function lossStep(act, api) {
      var L = D.losses, tried = {}, row = H("div", { class: "f6l" }, act);
      var fig = H("div", { class: "f6l-fig", "aria-hidden": "true" }, row);
      var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, row);
      var sl = LX.Slider(row, { label: "Line voltage", color: "var(--lx-pk)", min: 0, max: L.classes_kV.length - 1, step: 1, value: log.kvi != null ? log.kvi : L.start,
        fmt: function (v) { return fmtN(L.classes_kV[v]) + " kV"; }, onChange: paint });
      H("p", { class: "lx-hint", html: LX.rich("Illustrative: one line of " + L.R_ohm + " ohms (Ω), the resistance of the wire, carrying " + L.P_MW + " MW. Real lines carry three phases.") }, row);
      function paint(v) {
        var kv = L.classes_kV[v], r = loss(L.P_MW, kv, L.R_ohm), wpx = 2 + 10 * Math.sqrt(r.I / loss(L.P_MW, L.classes_kV[0], L.R_ohm).I), heat = Math.min(1, r.pct / 10);
        fig.innerHTML = '<svg viewBox="0 0 320 72"><rect class="pl" x="4" y="18" width="40" height="34" rx="3"/><path class="town" d="M282 52 V34 L296 22 L310 34 V52 Z"/><text x="24" y="66">Plant</text><text x="296" y="66">Town</text>' +
          '<path class="glow" d="M46 35 H280" style="stroke-width:' + (wpx + 14) + "px;opacity:" + heat.toFixed(2) + '"/><path class="cur" d="M46 35 H280" style="stroke-width:' + wpx.toFixed(1) + 'px"/></svg>';
        ro.innerHTML = "";
        [["Voltage", fmtN(kv) + " kV"], ["Current", fmtN(r.I) + " A"], ["Heat lost", fmtN(r.lossMW, r.lossMW < 1 ? 2 : 1) + " MW"], ["Share lost", fmtN(r.pct, r.pct < 1 ? 2 : 1) + "%"]].forEach(function (x, i) {
          var c = H("div", { class: "lx-readout" + (i === 3 ? (r.pct > 5 ? " bad" : r.pct < 1 ? " good" : "") : "") }, ro); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c);
        });
        tried[v] = true; keep("kvi", v);
        var n = Object.keys(tried).length;
        if (n >= 2) {
          var lo = loss(L.P_MW, L.classes_kV[0], L.R_ohm), hi = loss(L.P_MW, L.classes_kV[4], L.R_ohm);
          api.done();
          api.saw("At " + L.classes_kV[0] + " kV the wire loses **" + fmtN(lo.pct, 1) + "%**; at " + L.classes_kV[4] + " kV, five times higher, only **" + fmtN(hi.pct, 2) + "%**, one twenty-fifth. All U.S. lines and wires together lose about " + L.real_pct + "% (EIA, " + L.real_years + ").");
        }
      }
      paint(sl.val());
    }

    // ---- step 6: the repair order
    function restoreStep(act, api) {
      var ids = crewFaults(faults), order = [], wrap = H("div", { class: "f6r" }, act);
      H("p", { class: "lx-hint", text: "Tap the faults in the order the crew should fix them." }, wrap);
      var pick = H("div", { class: "f6r-pick", role: "group", "aria-label": "Repair next" }, wrap);
      var seq = H("ol", { class: "f6r-seq", "aria-live": "polite" }, wrap);
      var chart = H("div", null, wrap), out = H("div", { class: "lx-readouts", "aria-live": "polite" }, wrap);
      var again = H("button", { type: "button", class: "lx-btn ghost small", text: "Start a new order", hidden: true }, wrap);
      var Pl = LX.Plot(chart, { text: "Text version of the chart", legend: true });
      H("p", { class: "lx-hint", html: LX.rich("The shaded area is your storm's [[customer-minutes|customer-minutes]]: homes dark × hours × 60.") }, wrap);
      var btns = {};
      ids.forEach(function (id) {
        var f = FA[id], homes = 0; below(net, id).forEach(function (x) { homes += byId(net.sections)[x].homes; });
        var b = H("button", { type: "button", class: "lx-btn ghost small f6r-b", "aria-label": "Repair next: " + faultName(id) + ", " + homes + " homes, " + f.repair_h + " hours of work" }, pick);
        H("b", { text: faultName(id) }, b); H("span", { text: homes + " homes · " + f.repair_h + " h of work" }, b);
        b.addEventListener("click", function () { if (order.indexOf(id) < 0) { order.push(id); paint(true, b); } });
        btns[id] = b;
      });
      again.addEventListener("click", function () { order = []; paint(true); btns[ids[0]].focus({ preventScroll: true }); });
      function series(r) { var pts = []; r.steps.forEach(function (s, i) { pts.push([s.t, s.homes]); if (i + 1 < r.steps.length) pts.push([r.steps[i + 1].t, s.homes]); }); pts.push([r.end, 0]); return pts; }
      function paint(user, focusBtn) {
        seq.innerHTML = ""; order.forEach(function (id, i) { H("li", { text: (i + 1) + ". " + faultName(id) + " (" + FA[id].repair_h + " h)" }, seq); });
        ids.forEach(function (id) { btns[id].disabled = order.indexOf(id) >= 0; });
        out.innerHTML = "";
        var full = order.length === ids.length, B = best.best[0];
        var spec = { x: { min: 0, max: 12, ticks: [[0, "0 h"], [3, "3"], [6, "6"], [9, "9"], [12, "12 h"]] }, y: { min: 0, max: 30, step: 10, fmt: LX.fmt.int, unit: "homes dark" },
          lines: [{ pts: series(B), color: "var(--lx-ink-3)", dash: "5 4", width: 2 }], legend: [{ label: "Best order", color: "var(--lx-ink-3)", dash: "5 4" }],
          aria: "Homes without power hour by hour after the storm", height: 200, heightN: 180 };
        if (full) {
          var r = restore(net, faults, order); keep("order", order); buildExplain();
          spec.lines.push({ pts: series(r), color: "var(--lx-bad)", width: 3, area: 0.12 }); spec.legend.unshift({ label: "Your order", color: "var(--lx-bad)" });
          spec.text = { head: ["Hour", "Homes dark, your order", "Homes dark, best order"], rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (h) { return [h + ":00 to " + (h + 1) + ":00", String(at(r, h + 0.5)), String(at(B, h + 0.5))]; }) };
          [["Your order", fmtN(r.customerMinutes) + " customer-minutes"], ["Best order", fmtN(best.min) + " customer-minutes"]].forEach(function (x, i) { var c = H("div", { class: "lx-readout" + (i === 0 && r.customerMinutes === best.min ? " good" : "") }, out); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); });
          again.hidden = false;
          api.done();
          var same = r.customerMinutes === best.min;
          api.saw((same ? "That is the best order: " : "Yours: " + fmtN(r.customerMinutes) + "; the best: ") + "**" + fmtN(best.min) + " customer-minutes**, from " + best.best[0].order.map(faultName).join(", then ") + ". Fix the most homes per hour of work first.", !same);
          if (user && focusBtn) again.focus({ preventScroll: true });
        } else {
          again.hidden = order.length === 0;
          var nb = ids.filter(function (id) { return order.indexOf(id) < 0; })[0];
          if (user && focusBtn && nb) btns[nb].focus({ preventScroll: true });
        }
        Pl.render(spec);
      }
      function at(r, t) { var v = 0; r.steps.forEach(function (s) { if (s.t <= t) v = s.homes; }); return t >= r.end ? 0 : v; }
      if (log.order && log.order.length === ids.length && log.order.every(function (id) { return ids.indexOf(id) >= 0; })) order = log.order.slice();
      paint(false);
      act.lxRestore = { set: function (o2) { order = o2.slice(); paint(false); } };
    }

    // ---- step 7: SAIDI and SAIFI of the storm
    function measureStep(act, api) {
      var r = restore(net, faults, log.order && log.order.length === 3 ? log.order : best.best[0].order), m = reliability(r.customerMinutes, r.interrupted, served);
      var box = H("div", { class: "f6m" }, act);
      var eq = H("div", { class: "f6m-eqs" }, box);
      var e1 = H("div", { class: "f6m-eq" }, eq);
      H("span", { class: "k", html: LX.rich("[[saidi|SAIDI]] of your storm") }, e1);
      H("p", { html: fmtN(r.customerMinutes) + " customer-minutes ÷ " + served + " customers = <b>" + fmtN(m.saidi) + " minutes</b>" }, e1);
      var e2 = H("div", { class: "f6m-eq" }, eq);
      H("span", { class: "k", html: LX.rich("[[saifi|SAIFI]] of your storm") }, e2);
      H("p", { html: r.interrupted + " customers interrupted ÷ " + served + " customers = <b>?</b>" }, e2);
      var na = LX.NumAnswer(box, { label: "SAIFI, interruptions per customer", unit: "", width: "6em", onCheck: function (v, inp) {
        if (v == null) { api.saw("Type a number first: customers interrupted ÷ customers served.", true); return; }
        var ok = Math.abs(v - m.saifi) <= 0.01;
        inp.classList.toggle("right", ok); inp.classList.toggle("wrong", !ok);
        e2.querySelector("p").innerHTML = r.interrupted + " customers interrupted ÷ " + served + " customers = <b>" + fmtN(m.saifi, 2) + "</b>";
        api.done();
        api.saw((ok ? "Right: " : "It is ") + "**" + fmtN(m.saifi, 2) + "** interruptions per customer. In 2025 the average U.S. customer had " + last.saifi + " interruptions and " + fmtN(last.saidi, 1) + " minutes without power, over a whole year (EIA).", !ok);
      } });
      if (log.saifi) { na.input.value = fmtN(m.saifi, 2); na.go(); }
      na.input.addEventListener("change", function () { keep("saifi", true); });
      na.button.addEventListener("click", function () { keep("saifi", true); });
    }

    // ---- step 8: EIA's table, and the prediction revealed
    function realStep(act, api) {
      var rows = D.reliability.rows, sel = rows.length - 1, box = H("div", { class: "f6y" }, act);
      var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, box), ch = H("div", null, box);
      var Pl = LX.Plot(ch, { text: "Text version of the chart", legend: true });
      H("p", { class: "lx-hint", html: LX.rich(medRunText(rows) + " Data: EIA, Electric Power Annual, Table 11.1; utilities using the IEEE method.") }, box);
      var rev = H("div", { class: "f6y-rev" }, box);
      function paint(i, user) {
        sel = i; var r = rows[i];
        ro.innerHTML = "";
        [["Year", String(r.year)], ["SAIDI, all days", fmtN(r.saidi, 1) + " min"], ["Other days only", fmtN(r.saidi_nomed, 1) + " min"], ["Major event days' share", fmtN(100 * medShare(r)) + "%"]].forEach(function (x) { var c = H("div", { class: "lx-readout" }, ro); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); });
        var bars = [];
        rows.forEach(function (q, k) {
          bars.push({ x0: k + 0.18, x1: k + 0.82, y0: 0, y1: q.saidi_nomed, color: "var(--lx-tier-2)", op: k === sel ? 1 : 0.75, rx: 2 });
          bars.push({ x0: k + 0.18, x1: k + 0.82, y0: q.saidi_nomed, y1: q.saidi, color: "var(--lx-cc)", op: k === sel ? 1 : 0.75, rx: 2 });
        });
        Pl.render({ x: { min: 0, max: rows.length, ticks: rows.map(function (q, k) { return [k + 0.5, String(q.year)]; }), ticksN: rows.filter(function (q, k) { return k % 2 === 0; }).map(function (q) { return [rows.indexOf(q) + 0.5, "’" + String(q.year).slice(2)]; }) },
          y: { min: 0, max: 700, step: 100, fmt: LX.fmt.int, unit: "minutes per customer" }, bars: bars, height: 230, heightN: 200,
          legend: [{ label: "Major event days", color: "var(--lx-cc)" }, { label: "Other days", color: "var(--lx-tier-2)" }],
          pick: { n: rows.length, sel: sel, onPick: function (k) { paint(k, true); } },
          aria: "Minutes without power per U.S. customer, 2015 to 2025, split into major event days and other days; utilities using the IEEE method (EIA)",
          text: { head: ["Year", "SAIDI, all events (min)", "Without major event days (min)", "Share from major event days"], rows: rows.map(function (q) { return [String(q.year), fmtN(q.saidi, 1), fmtN(q.saidi_nomed, 1), fmtN(100 * medShare(q)) + "%"]; }) } });
      }
      paint(sel);
      var pred = log.pred, right = pred === "dist";
      H("p", { class: "f6y-p", html: LX.rich("**Your prediction: " + (pred ? (right ? "right." : "not quite.") : "none.") + "** DOE found in 2017 that over " + D.distribution_share.pct + "% of U.S. power interruptions start on the [[distribution|distribution]] system, mostly in bad weather.").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }, rev);
      H("p", { class: "f6y-p", html: LX.rich("In " + last.year + ", leaving out outages caused by losing supply from the high-voltage system lowers the average from " + fmtN(last.saidi, 1) + " to " + fmtN(last.saidi_nolos, 1) + " minutes. Failures upstream, such as the plant outages in Texas in 2021 (") + LX.lessonRefHTML(P, 3) + LX.rich(": " + fmtN(U.peakShedMW) + " MW of demand ordered off), are rarer but can darken millions at once.") }, rev);
      yearPick = paint;
    }

    var yearPick = null, cards = LX.StepCards(live, { id: "f6-steps", steps: steps });

    // demo states: "step-N" opens step N with its action done; "mid" = the storm, every failed part inspected;
    // "term" = step 4 with the far half of the north feeder failed and the glossary popover of "recloser" open (at the
    // panel's edge on phones); "term-saifi" = step 7 with the popover of SAIFI open from the step text
    LX.demo(root, function (state) {
      if (state === "term" || state === "term-saifi") {
        var k = state === "term" ? 3 : 6;
        if (k === 6) log.order = ["L2", "F2A", "F1B"];
        cards.go(k);
        if (k === 3) { var g0 = live.querySelector('g.el[data-id="F1B"]'); if (g0) g0.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
        setTimeout(function () {
          var t = live.querySelector(k === 3 ? '.f6n-why .lx-term[data-term="recloser"]' : '.lx-step-text .lx-term[data-term="saifi"]');
          if (t) t.click();
        }, 120);
        return { view: state };
      }
      var n = state === "mid" ? 5 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var i = Math.max(0, Math.min(steps.length - 1, n - 1));
      if (i >= 2) { log.pred = log.pred || "tx"; }
      if (i === 5 || i === 6) log.order = ["L2", "F2A", "F1B"];
      cards.go(i);
      var q = function (s) { return live.querySelectorAll(s); };
      if (i === 0) [1, 2, 3, 4, 5, 6, 7].forEach(function (k) { var b = q(".f6p-stop")[k]; if (b) b.click(); });
      if (i === 1) { var plus = q(".lx-ctl-row button")[0]; if (plus) { plus.click(); plus.click(); plus.click(); plus.click(); } }
      if (i === 3) { ["GN", "F1B"].forEach(function (id) { var g = live.querySelector('g.el[data-id="' + id + '"]'); if (g) g.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
      if (i === 4) faults.forEach(function (f) { var g = live.querySelector('g.el[data-id="' + f.id + '"]'); if (g) g.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      if (i === 6) { var inp = live.querySelector(".lx-na-num"); if (inp) { inp.value = "0.87"; var b2 = live.querySelector(".lx-na .lx-btn"); if (b2) b2.click(); } }
      if (i === 7 && yearPick) yearPick(9);   // the 2024 column
      return { view: "step " + (i + 1) };
    }, cards);

    // ---------------------------------------------------------------- the explain layer (the reader's own storm where it can)
    function buildExplain() {
      var host = document.getElementById("f6-explain"); if (!host) return;
      host.innerHTML = ""; host.classList.add("is-live");
      var c1 = H("div", { class: "lx-xcard" }, host), v = D.voltages;
      LX.EnergyChain(c1, { title: "From plant to socket, voltage by voltage", aside: "Typical U.S. values (DOE)",
        lede: "Transformers raise the voltage for the long trip and lower it in steps near homes.",
        stops: [{ icon: "plant", title: "Power plant", text: "makes it", value: v.generator.lo + "–" + v.generator.hi + " kV" },
                { icon: "tower", title: "Transmission", text: "carries it far", value: v.transmission.list[0] + "–" + v.transmission.list[v.transmission.list.length - 1] + " kV" },
                { icon: "sub", title: "Substation and feeder", text: "spreads it locally", value: v.distribution.list[0] + "–" + v.distribution.list[v.distribution.list.length - 1] + " kV" },
                { icon: "house", title: "Home", text: "uses it", value: v.service.text } ] });
      var mine = !!(log.order && log.order.length === 3), order = mine ? log.order : best.best[0].order, r = restore(net, faults, order), m = reliability(r.customerMinutes, r.interrupted, served);
      var l2h = r.done.L2, l2n = byId(net.sections).L2.homes, c2 = H("div", { class: "lx-xcard" }, host);
      LX.CausalChain(c2, { title: "Cause and effect: one branch on Oak Street",
        links: [{ title: "Wind breaks a branch", text: "It falls across lateral L2's wires.", value: "storm" },
                { title: "A fault", text: "Current rushes through the branch to the ground.", value: "short circuit" },
                { title: "The closest device opens", text: "L2's [[fuse|fuse]] blows; the rest of the feeder stays on.", value: "1 fuse" },
                { title: "Homes go dark", text: "Every home beyond the fuse loses power.", value: l2n + " homes" },
                { title: "Minutes add up", text: (mine ? "In your repair order" : "In the best repair order") + ", L2 is fixed after " + l2h + " h.", value: fmtN(l2n * l2h * 60) + " customer-minutes" },
                { title: "SAIDI grows", text: "Divided over all " + served + " customers.", value: "+" + fmtN(l2n * l2h * 60 / served) + " min" }],
        note: (mine ? "Your whole storm: " : "The whole storm, best order: ") + fmtN(r.customerMinutes) + " customer-minutes, SAIDI " + fmtN(m.saidi) + " minutes, SAIFI " + fmtN(m.saifi, 2) + "." });
      var c3 = H("div", { class: "lx-xcard" }, host);
      LX.ConceptMap(c3, { title: "The ideas, and how they connect", lede: "Tap an idea.",
        groups: { path: ["The path", "var(--lx-tier-2)"], prot: ["Protection", "var(--lx-warn)"], rel: ["Reliability", "var(--lx-cc)"] },
        nodes: [
          { id: "gen", g: "path", label: "Generation", text: "Plants make electricity at " + v.generator.lo + "–" + v.generator.hi + " kV.", game: "Stop 1: the gas plant at " + D.town.genKV + " kV.", at: [0, 0], atN: [0, 0] },
          { id: "tx", g: "path", label: "Transmission", lines: ["Transmission"], text: "High-voltage lines joined in loops ([[meshed-network|meshed]]): one line can fail and power goes round.", game: "The loop of three lines.", at: [1, 0], atN: [1, 0] },
          { id: "dist", g: "path", label: "Distribution", lines: ["Distribution"], text: "Substations, feeders and laterals: mostly [[radial-network|radial]], one path to each home.", game: "Two feeders, six laterals, " + served + " homes.", at: [2, 0], atN: [2, 0] },
          { id: "prot", g: "prot", label: "Protection", text: "Breakers, [[recloser|reclosers]] and fuses open the smallest section they can around a fault.", game: "B1, B2, R1 and six fuses.", at: [2, 1], atN: [2, 1] },
          { id: "out", g: "rel", label: "Outage", text: "Homes beyond an opened device lose power until the crew repairs the fault.", game: stormOut.homesDark + " of " + served + " homes after the storm.", at: [1, 1], atN: [1, 1] },
          { id: "cm", g: "rel", label: "Customer-minutes", lines: ["Customer-", "minutes"], text: "Homes without power times minutes without it; the repair order changes the total.", game: "Your order: " + fmtN(r.customerMinutes) + ".", at: [0, 1], atN: [0, 1] },
          { id: "idx", g: "rel", label: "SAIDI and SAIFI", lines: ["SAIDI and", "SAIFI"], text: "Minutes and interruptions per customer, the yardsticks utilities report to EIA every year.", game: "SAIDI " + fmtN(m.saidi) + " min, SAIFI " + fmtN(m.saifi, 2) + ".", at: [0, 2], atN: [0, 2] },
          { id: "med", g: "rel", label: "Major event days", lines: ["Major", "event days"], text: "A few stormy days that give most of a year's outage minutes in recent U.S. data.", game: "Step 8: EIA's 2015–2025 table.", at: [1, 2], atN: [1, 2] }],
        edges: [["gen", "tx", "steps up into"], ["tx", "dist", "steps down into"], ["dist", "prot", "is guarded by"], ["prot", "out", "opens, causing an"], ["out", "cm", "adds up to"], ["cm", "idx", "per customer gives"], ["med", "idx", "dominate"]],
        cols: 3, rows: 3, colsN: 3, rowsN: 3, gameLabel: "In this lesson" });
      var c4 = H("div", { class: "lx-xcard" }, host);
      LX.CompareTable(c4, { title: "Transmission and distribution side by side", text: true,
        columns: [{ key: "name", label: "Part of the grid", main: true }, { key: "v", label: "Voltage (U.S.)" }, { key: "shape", label: "Shape" }, { key: "prot", label: "When a part fails" }, { key: "share", label: "Share of interruptions" }],
        rows: [{ key: "tx", color: "var(--lx-pk)", name: "Transmission", v: v.transmission.list[0] + "–" + v.transmission.list[v.transmission.list.length - 1] + " kV", shape: "Meshed: loops between regions", prot: "Power usually takes another path; a rare wide failure darkens many", share: "Under " + (100 - D.distribution_share.pct) + "%, with power plants (DOE, 2017)" },
               { key: "dist", color: "var(--lx-tier-2)", name: "Distribution", v: v.distribution.list[0] + "–" + v.distribution.list[v.distribution.list.length - 1] + " kV, then " + v.service.text, shape: "Radial: one path from the substation", prot: "The closest fuse or recloser opens; the homes below it go dark", share: "Over " + D.distribution_share.pct + "% (DOE, 2017)" }],
        caption: "Read across for one part of the grid; read down to compare." });
    }
    buildExplain();
  }

  LX.mount("grid-outages", function (live, data, root) { view(live, data, root); });
})();
