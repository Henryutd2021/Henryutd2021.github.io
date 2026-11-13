/* scene.js — LX.Scene: the flat SVG picture of Prairie Town (wind farm, solar farm, town, nuclear plant, two gas plants).
   const sc = LX.Scene(host, { max: {wind: 150, solar: 200, cc: 150, pk: 100, demand: 360}, label: "text alternative" });
   sc.set({h: 14.5, demand, wind, solar, nuclear, cc, pk, unserved, cloud: 0..1}, instant)   eases to the new state
   sc.highlight(["cc", "town"]) | sc.labels(on, onlyKeys) | sc.reveal(key) | sc.tappable(on, onTap(key)) | sc.met(key)
   sc.event("short text") shows a chip in the corner; sc.el is the picture, sc.box its wrapper.
   Wide scenes carry value callouts; under 560 px they switch to numbered markers with a legend strip below.
   Sky colors follow the hour and the day/night toggle; animation stops under prefers-reduced-motion. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H, S = LX.S, clamp = LX.clamp;
  LX.PLANTS = {
    nuclear: { name: "Nuclear plant", short: "Nuclear", c: "var(--lx-nuc)" },
    solar: { name: "Solar farm", short: "Solar", c: "var(--lx-solar)" },
    wind: { name: "Wind farm", short: "Wind", c: "var(--lx-wind)" },
    cc: { name: "Gas combined-cycle", short: "Gas CC", c: "var(--lx-cc)" },
    pk: { name: "Gas peaker", short: "Peaker", c: "var(--lx-pk)" },
    town: { name: "Demand", short: "Demand", c: "var(--lx-demand)" }
  };
  var SKY = ["sky-day-top", "sky-day-bot", "sky-night-top", "sky-night-bot", "sky-dusk"];
  var CALLOUTS = { wind: [108, 128], solar: [112, 292], town: [356, 212], nuclear: [640, 158], cc: [498, 226], pk: [620, 236] };
  var MARKERS = { wind: [108, 120, 1], solar: [112, 296, 2], nuclear: [668, 160, 3], cc: [535, 222, 4], pk: [612, 240, 5], town: [356, 222, "D"] };

  LX.Scene = function (host, opts) {
    opts = opts || {};
    var max = Object.assign({ wind: 150, solar: 150, cc: 150, pk: 100, demand: 360 }, opts.max || {});
    var id = LX.uid("sc");
    var box = H("div", { class: "lx-scenebox" }, host);
    var wrap = H("div", { class: "lx-scene" }, box);
    var svg = S("svg", { class: "lx-art", viewBox: "0 50 720 310", role: "img",
      "aria-label": opts.label || "Prairie Town: a wind farm, a solar farm, the town, a nuclear plant and two gas plants, joined by power lines." }, wrap);
    var defs = S("defs", null, svg);
    var sky = S("linearGradient", { id: id + "sky", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    var skyTop = S("stop", { offset: "0" }, sky), skyBot = S("stop", { offset: "1" }, sky);
    var glow = S("radialGradient", { id: id + "glow" }, defs);
    S("stop", { offset: "0", "stop-color": "var(--lx-nuc)", "stop-opacity": ".55" }, glow);
    S("stop", { offset: "1", "stop-color": "var(--lx-nuc)", "stop-opacity": "0" }, glow);
    S("rect", { x: 0, y: 0, width: 720, height: 360, fill: "url(#" + id + "sky)" }, svg);
    var starsG = S("g", { fill: "#FFFFFF" }, svg);
    for (var k = 0; k < 26; k++) S("circle", { cx: (k * 137.5) % 720, cy: 58 + (k * 53) % 130, r: k % 3 ? 0.9 : 1.4 }, starsG);
    var sunG = S("g", null, svg);
    S("circle", { r: 30, fill: "var(--lx-sun)", opacity: ".22" }, sunG);
    S("circle", { r: 16, fill: "var(--lx-sun)" }, sunG);
    var cloudG = S("g", { opacity: 0 }, svg);
    [[0, 0, 34], [30, -12, 30], [62, 2, 28], [-30, 6, 24]].forEach(function (c) { S("circle", { cx: c[0], cy: c[1], r: c[2], fill: "var(--lx-cloud)" }, cloudG); });
    S("rect", { x: -54, y: 4, width: 140, height: 28, rx: 14, fill: "var(--lx-cloud)" }, cloudG);
    var shadowG = S("ellipse", { cx: 118, cy: 330, rx: 120, ry: 26, fill: "#0A1428", opacity: 0 }, null);
    S("path", { d: "M0 238 C 90 214 170 222 250 233 S 420 224 520 236 S 650 222 720 232 L720 360 L0 360Z", fill: "var(--lx-hill-far)" }, svg);

    var plantG = {};
    function pg(key) { var g = S("g", { class: "plant", "data-k": key }, svg); plantG[key] = g; return g; }
    // wind farm
    var windG = pg("wind"), rotors = [];
    [[56, 228, 80], [108, 216, 88], [162, 232, 76]].forEach(function (t) {
      var x = t[0], base = t[1], hub = base - t[2];
      S("path", { d: "M" + (x - 2.6) + " " + base + " L" + (x - 1.1) + " " + hub + " L" + (x + 1.1) + " " + hub + " L" + (x + 2.6) + " " + base + "Z", fill: "var(--lx-turbine)", stroke: "var(--lx-concrete-2)", "stroke-width": .6 }, windG);
      S("rect", { x: x - 4, y: hub - 3, width: 9, height: 5, rx: 2, fill: "var(--lx-turbine)", stroke: "var(--lx-concrete-2)", "stroke-width": .6 }, windG);
      var r = S("g", { transform: "translate(" + x + " " + hub + ")" }, windG), spin = S("g", null, r);
      for (var b = 0; b < 3; b++) S("path", { d: "M0 0 C 3 -6 2.6 -22 0.8 -34 L -0.8 -34 C -2 -20 -2.6 -8 0 0Z", fill: "var(--lx-turbine)", stroke: "var(--lx-concrete-2)", "stroke-width": .6, transform: "rotate(" + (b * 120) + ")" }, spin);
      S("circle", { r: 2.6, fill: "var(--lx-steel)" }, r);
      rotors.push({ g: spin, a: (x * 7) % 120 });
    });
    S("rect", { x: 30, y: 128, width: 160, height: 108, fill: "transparent", class: "plant-hit" }, windG);
    S("ellipse", { cx: 108, cy: 186, rx: 84, ry: 64, class: "tapring" }, windG);
    // nuclear plant
    var nucG = pg("nuclear");
    S("circle", { cx: 680, cy: 226, r: 52, fill: "url(#" + id + "glow)" }, nucG);
    S("path", { d: "M626 248 C 632 220 632 204 627 186 L 660 186 C 655 204 655 220 661 248 Z", fill: "var(--lx-concrete)", stroke: "var(--lx-concrete-2)", "stroke-width": .8 }, nucG);
    var steam = S("g", { fill: "var(--lx-steam)", opacity: ".85" }, nucG);
    [[644, 178, 13], [656, 168, 11], [636, 166, 9], [650, 156, 8]].forEach(function (c) { S("circle", { cx: c[0], cy: c[1], r: c[2] }, steam); });
    S("rect", { x: 666, y: 216, width: 40, height: 34, fill: "var(--lx-concrete)", stroke: "var(--lx-concrete-2)", "stroke-width": .8 }, nucG);
    S("path", { d: "M666 216 A 20 20 0 0 1 706 216 Z", fill: "var(--lx-concrete)", stroke: "var(--lx-concrete-2)", "stroke-width": .8 }, nucG);
    S("rect", { x: 666, y: 228, width: 40, height: 3, fill: "var(--lx-nuc)" }, nucG);
    S("rect", { x: 618, y: 168, width: 100, height: 86, fill: "transparent", class: "plant-hit" }, nucG);
    S("ellipse", { cx: 666, cy: 214, rx: 58, ry: 50, class: "tapring" }, nucG);
    // ground
    S("path", { d: "M0 262 C 140 252 300 264 420 258 S 640 250 720 260 L720 360 L0 360Z", fill: "var(--lx-ground)" }, svg);
    S("path", { d: "M0 322 C 160 312 330 326 470 318 S 650 312 720 320 L720 360 L0 360Z", fill: "var(--lx-ground-2)" }, svg);
    svg.appendChild(shadowG);
    // power lines with flowing dots toward the town
    var linesG = S("g", null, svg);
    [24, 120, 214, 500, 584, 700].forEach(function (x) { S("path", { d: "M" + x + " 286 V250 M" + (x - 7) + " 252 H" + (x + 7), stroke: "var(--lx-wire)", "stroke-width": 1.6, fill: "none" }, linesG); });
    var wireL = "M24 252 Q 72 262 120 252 Q 167 262 214 252 Q 236 258 262 262", wireR = "M700 252 Q 642 262 584 252 Q 542 262 500 252 Q 474 258 452 262";
    S("path", { d: wireL, stroke: "var(--lx-wire)", "stroke-width": 1.2, fill: "none" }, linesG);
    S("path", { d: wireR, stroke: "var(--lx-wire)", "stroke-width": 1.2, fill: "none" }, linesG);
    var flowL = S("path", { d: wireL, class: "flow", stroke: "var(--lx-sun)" }, linesG);
    var flowR = S("path", { d: wireR, class: "flow", stroke: "var(--lx-sun)" }, linesG);
    // gas plants: stacks with plumes, a facade gauge showing output
    function gasPlant(key, x, w, hgt, stacks, color) {
      var g = pg(key), base = 300, top = base - hgt, glows = [], plumes = [];
      stacks.forEach(function (sx) {
        plumes.push(S("circle", { cx: x + sx + 3, cy: top - 44, r: 9, fill: "var(--lx-steam)", opacity: 0 }, g));
        S("rect", { x: x + sx, y: top - 34, width: 7, height: 34, fill: "var(--lx-steel)" }, g);
        glows.push(S("ellipse", { cx: x + sx + 3.5, cy: top - 35, rx: 6, ry: 3, fill: color, opacity: 0 }, g));
      });
      S("rect", { x: x, y: top, width: w, height: hgt, fill: "var(--lx-concrete)", stroke: "var(--lx-concrete-2)", "stroke-width": .8 }, g);
      S("rect", { x: x, y: top, width: w, height: 4, fill: color }, g);
      var gx = x + w - 13, gy = top + 9, gh = hgt - 15;
      S("rect", { x: gx, y: gy, width: 8, height: gh, rx: 2, fill: "var(--lx-surface)", stroke: "var(--lx-concrete-2)", "stroke-width": .8 }, g);
      var fill = S("rect", { x: gx + 1.5, y: gy + gh - 1.5, width: 5, height: 0, rx: 1, fill: color }, g);
      for (var d = 0; d < 3; d++) S("rect", { x: x + 6 + d * 11, y: top + 12, width: 6, height: 8, fill: "var(--lx-concrete-2)" }, g);
      S("rect", { x: x - 6, y: top - 60, width: w + 12, height: hgt + 62, fill: "transparent", class: "plant-hit" }, g);
      S("ellipse", { cx: x + w / 2, cy: top + hgt / 2 - 18, rx: w / 2 + 14, ry: hgt / 2 + 34, class: "tapring" }, g);
      return { glows: glows, plumes: plumes, fill: fill, gy: gy, gh: gh };
    }
    var ccV = gasPlant("cc", 508, 56, 40, [12, 28], "var(--lx-cc)");
    var pkV = gasPlant("pk", 586, 46, 30, [18], "var(--lx-pk)");
    // the town: houses with windows; whole houses go dark when power is short
    var townG = pg("town"), houses = [], wins = [];
    S("rect", { x: 236, y: 300, width: 258, height: 7, rx: 3, fill: "var(--lx-road)" }, townG);
    [[244, 300, 9], [476, 300, 8]].forEach(function (t) { S("path", { d: "M" + t[0] + " " + t[1] + " v-10", stroke: "var(--lx-steel)", "stroke-width": 2 }, townG); S("circle", { cx: t[0], cy: t[1] - 16, r: t[2], fill: "var(--lx-tree)" }, townG); });
    [[252, 30, 28, 2], [288, 26, 24, 2], [318, 34, 34, 3], [356, 34, 56, 6], [394, 30, 30, 3], [428, 26, 24, 2], [458, 24, 22, 1]].forEach(function (s, hi) {
      var x = s[0], w = s[1], hgt = s[2], n = s[3], top = 300 - hgt, g = S("g", null, townG);
      S("rect", { x: x - w / 2, y: top, width: w, height: hgt, fill: hi % 2 ? "var(--lx-wall-2)" : "var(--lx-wall)" }, g);
      if (hi === 3) S("rect", { x: x - w / 2 - 1, y: top - 3, width: w + 2, height: 4, fill: "var(--lx-roof)" }, g);
      else S("path", { d: "M" + (x - w / 2 - 3) + " " + top + " L" + x + " " + (top - 13) + " L" + (x + w / 2 + 3) + " " + top + "Z", fill: hi % 2 ? "var(--lx-roof-2)" : "var(--lx-roof)" }, g);
      var cols = hi === 3 ? 3 : Math.min(n, 2), rows = Math.ceil(n / cols);
      for (var q = 0; q < n; q++) {
        var c = q % cols, r = Math.floor(q / cols);
        var el = S("rect", { x: x - w / 2 + (w - cols * 7 - (cols - 1) * 4) / 2 + c * 11, y: top + 6 + r * 15 + (rows === 1 ? 4 : 0), width: 7, height: 8, rx: 1, class: "win", fill: "var(--lx-win-off)" }, g);
        el.style.transitionDelay = (((q * 7 + hi * 13) % 9) * 35) + "ms";
        wins.push({ el: el, house: hi });
      }
      houses.push({ g: g });
    });
    S("rect", { x: 232, y: 196, width: 252, height: 112, fill: "transparent", class: "plant-hit" }, townG);
    S("ellipse", { cx: 358, cy: 262, rx: 136, ry: 56, class: "tapring" }, townG);
    var order = wins.map(function (w, i) { return { w: w, k: (i * 61) % 97 }; }).sort(function (a, b) { return a.k - b.k; }).map(function (o) { return o.w; });
    var houseOrder = [3, 1, 5, 0, 6, 2, 4];
    // solar farm
    var solarG = pg("solar"), sheens = [];
    for (var row = 0; row < 3; row++) for (var col = 0; col < 5; col++) {
      var px = 22 + col * 38 + row * 6, py = 306 + row * 15;
      S("path", { d: "M" + (px + 4) + " " + (py + 11) + " v6", stroke: "var(--lx-steel)", "stroke-width": 1.4 }, solarG);
      S("path", { d: "M" + px + " " + (py + 11) + " L" + (px + 6) + " " + py + " L" + (px + 38) + " " + py + " L" + (px + 32) + " " + (py + 11) + "Z", fill: "var(--lx-panel)" }, solarG);
      sheens.push(S("path", { d: "M" + (px + 8) + " " + (py + 2.5) + " L" + (px + 30) + " " + (py + 2.5), stroke: "var(--lx-panel-sheen)", "stroke-width": 1.6, opacity: 0 }, solarG));
    }
    S("rect", { x: 14, y: 296, width: 212, height: 62, fill: "transparent", class: "plant-hit" }, solarG);
    S("ellipse", { cx: 118, cy: 328, rx: 112, ry: 32, class: "tapring" }, solarG);
    // numbered markers for narrow scenes
    Object.keys(MARKERS).forEach(function (k) {
      var m = MARKERS[k], g = S("g", { class: "marker", "aria-hidden": "true" }, svg);
      S("circle", { cx: m[0], cy: m[1], r: 13, fill: "var(--lx-ink)" }, g);
      var t = S("text", { x: m[0], y: m[1] + 5.5, "text-anchor": "middle", fill: "var(--lx-surface)", "font-family": "var(--lx-f-mono)", "font-size": 15, "font-weight": 600 }, g);
      t.textContent = m[2];
    });
    // overlays: callouts, clock, event chip, legend strip
    var co = {};
    Object.keys(CALLOUTS).forEach(function (k) {
      var p = CALLOUTS[k], el = H("div", { class: "lx-callout", "aria-hidden": "true", style: "left:" + (p[0] / 7.2) + "%;top:" + ((p[1] - 50) / 3.1) + "%;--c:" + LX.PLANTS[k].c }, wrap);
      H("i", null, el); H("span", { text: LX.PLANTS[k].short }, el);
      co[k] = { el: el, b: H("b", null, el) };
    });
    var clock = opts.clock === false ? null : H("div", { class: "lx-clockchip", "aria-hidden": "true" }, wrap);
    var eventChip = H("div", { class: "lx-eventchip", hidden: true }, wrap);
    var legend = H("div", { class: "lx-legendstrip", "aria-hidden": "true" }, box), lg = {};
    [["wind", 1], ["solar", 2], ["nuclear", 3], ["cc", 4], ["pk", 5], ["town", "D"]].forEach(function (x) {
      var sp = H("span", null, legend); H("span", { class: "n", text: x[1] }, sp);
      H("i", { style: "--c:" + LX.PLANTS[x[0]].c }, sp); H("span", { text: LX.PLANTS[x[0]].short }, sp);
      lg[x[0]] = H("b", null, sp);
    });
    function sizeCheck() { box.classList.toggle("narrow", box.clientWidth < 560); }
    if (window.ResizeObserver) new ResizeObserver(sizeCheck).observe(box); else window.addEventListener("resize", sizeCheck);
    sizeCheck();

    var TOK = LX.tokens(wrap, SKY);
    var cur = null, tgt = null, labelsOn = opts.labels !== false, hidden = {};
    var api = {
      box: box, el: wrap, svg: svg,
      set: function (st, instant) { tgt = Object.assign({ cloud: 0, unserved: 0 }, st); if (!cur || instant || LX.reduced()) { cur = Object.assign({}, tgt); draw(); } },
      get: function () { return tgt; },
      highlight: function (keys) {
        var hl = keys && keys.length ? keys : null;
        wrap.classList.toggle("has-hl", !!hl);
        Object.keys(plantG).forEach(function (k) { plantG[k].classList.toggle("hl", !!(hl && hl.indexOf(k) >= 0)); });
        Object.keys(co).forEach(function (k) { co[k].el.classList.toggle("hl", !!(hl && hl.indexOf(k) >= 0)); });
      },
      labels: function (on, only) { labelsOn = on; hidden = {}; if (only) Object.keys(co).forEach(function (k) { if (only.indexOf(k) < 0) hidden[k] = 1; }); draw(); },
      reveal: function (k) { delete hidden[k]; draw(); },
      tappable: function (on, cb) { wrap.classList.toggle("tappable", on); api.onTap = cb; },
      met: function (k) { if (plantG[k]) plantG[k].classList.add("met"); },
      event: function (txt) { eventChip.hidden = !txt; eventChip.textContent = txt || ""; },
      redraw: function () { TOK = LX.tokens(wrap, SKY); draw(); },
      onTap: null
    };
    Object.keys(plantG).forEach(function (k) { plantG[k].addEventListener("click", function () { if (api.onTap) api.onTap(k); }); });

    var lastDur = {};
    function draw() {
      if (!cur) return;
      var s = cur, h = s.h;
      var theta = Math.PI * (h - 6.4) / 14.2, e = Math.sin(theta), up = h > 6.4 && h < 20.6;
      var day = up ? clamp(e * 2.6, 0, 1) : 0;
      var dusk = up ? clamp(1 - e * 3.2, 0, 1) * (e > -0.05 ? 1 : 0) : clamp(1 - Math.min(Math.abs(h - 20.6), Math.abs(h - 6.4)) * 1.6, 0, 1);
      var cl = clamp(s.cloud || 0, 0, 1);
      var top = LX.mix(TOK["sky-night-top"], TOK["sky-day-top"], day * (1 - 0.35 * cl)), bot = LX.mix(TOK["sky-night-bot"], TOK["sky-day-bot"], day);
      bot = LX.mix(bot, TOK["sky-dusk"], dusk * 0.75);
      skyTop.setAttribute("stop-color", LX.rgb(top)); skyBot.setAttribute("stop-color", LX.rgb(bot));
      starsG.setAttribute("opacity", (1 - day) * 0.85 * (1 - dusk * 0.6));
      if (up) {
        var sx = 360 - 320 * Math.cos(theta), sy = 262 - 196 * Math.max(0, e);
        sunG.setAttribute("transform", "translate(" + sx + " " + sy + ")"); sunG.setAttribute("opacity", 1);
        cloudG.setAttribute("transform", "translate(" + (sx - 6) + " " + (sy + 6) + ")");
      } else sunG.setAttribute("opacity", 0);
      cloudG.setAttribute("opacity", up ? 0.97 * cl : 0);
      shadowG.setAttribute("opacity", up ? 0.16 * cl : 0);
      var so = clamp(s.solar / max.solar, 0, 1);
      sheens.forEach(function (p) { p.setAttribute("opacity", 0.15 + so * 0.85); });
      [[ccV, s.cc, max.cc], [pkV, s.pk, max.pk]].forEach(function (a) {
        var v = a[0], f = clamp(a[1] / a[2], 0, 1), hgt = (v.gh - 3) * f;
        v.fill.setAttribute("height", hgt); v.fill.setAttribute("y", v.gy + v.gh - 1.5 - hgt);
        v.glows.forEach(function (g) { g.setAttribute("opacity", f > 0.01 ? 0.25 + f * 0.75 : 0); });
        v.plumes.forEach(function (p) { p.setAttribute("opacity", f * 0.7); });
      });
      var lit = Math.round(order.length * clamp((s.demand - max.demand * 0.5) / (max.demand * 0.5), 0.2, 1));
      var dark = s.unserved > 0.5 ? clamp(Math.ceil(7 * s.unserved / Math.max(1, s.demand) * 3), 1, 7) : 0, darkSet = {};
      for (var d = 0; d < dark; d++) darkSet[houseOrder[d]] = 1;
      order.forEach(function (w, i) { w.el.setAttribute("fill", (i < lit && !darkSet[w.house]) ? "var(--lx-win-on)" : "var(--lx-win-off)"); });
      houses.forEach(function (ho, i) { ho.g.setAttribute("opacity", darkSet[i] ? 0.62 : 1); });
      var left = s.wind + s.solar, right = s.nuclear + s.cc + s.pk;
      flowL.setAttribute("opacity", left > 1 ? 0.35 + 0.65 * clamp(left / (max.wind + max.solar) * 1.5, 0, 1) : 0);
      flowR.setAttribute("opacity", 0.35 + 0.65 * clamp(right / (max.cc + max.pk + 100), 0, 1));
      setDur(flowL, "l", left); setDur(flowR, "r", right);
      var vals = { wind: s.wind, solar: s.solar, nuclear: s.nuclear, cc: s.cc, pk: s.pk, town: s.demand };
      Object.keys(co).forEach(function (k) {
        var txt = Math.round(vals[k]) + " MW";
        if (co[k].b.textContent !== txt) co[k].b.textContent = txt;
        var n = Math.round(vals[k]) + "";
        if (lg[k].textContent !== n) lg[k].textContent = n;
        co[k].el.classList.toggle("off", !labelsOn || !!hidden[k]);
      });
      if (clock) { var c = LX.fmt.hh(h); if (clock.textContent !== c) clock.textContent = c; }
    }
    function setDur(p, k, v) {
      var b = v < 1 ? 0 : v < 80 ? 1 : v < 160 ? 2 : 3;
      if (lastDur[k] === b) return; lastDur[k] = b;
      p.style.setProperty("--dur", [3, 2.4, 1.6, 1.1][b] + "s");
    }
    LX.anim({
      visible: function () { return LX.visible(wrap); },
      step: function (dt) {
        if (!cur) return;
        if (!LX.reduced()) rotors.forEach(function (r) { r.a = (r.a + dt * (20 + 150 * clamp(cur.wind / max.wind, 0, 1))) % 360; r.g.setAttribute("transform", "rotate(" + r.a.toFixed(1) + ")"); });
        if (tgt) {
          var kk = 1 - Math.exp(-dt * 5), moved = false;
          for (var key in tgt) if (typeof tgt[key] === "number") {
            var a = cur[key] == null ? tgt[key] : cur[key], b = tgt[key];
            if (Math.abs(a - b) > 0.01) { cur[key] = a + (b - a) * kk; moved = true; } else cur[key] = b;
          }
          if (moved) draw();
        }
      }
    });
    LX.onTheme(function () { api.redraw(); });
    return api;
  };
})();
