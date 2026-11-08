// f05-nuclear-basics.js — F5, "How does a nuclear reactor make electricity, and heat?" (step cards).
//
// Data: assets/learn/data/f05-nuclear-basics.json (the chain-reaction toy, Prairie Town's plant, the designs and heat
// uses, every real number with its source and date), town.json (Prairie Town's 100 MW plant, illustrative),
// cf_targets.json (the U.S. fleet's 2025 capacity factor, EIA, for the Modeler's note; read by the test, stated on the page).
//
// Physics and technology only (the course's nuclear scope; no research excerpt): no costs, no deployment, no siting, no data centers.
//
// Closed-form model (pure, exported for Node):
//   kOf(T, rods, mod)   the toy's multiplication factor: kFull(mod) x (1 - rodAbsorb x rods/100), where kFull rises in a
//                       straight line from kMin (no moderator) to kMax (all of it). Illustrative, not reactor data.
//   stateOf(k, band)    "dying" (k < 1 - band), "steady" (k = 1, within a floating-point band: critical) or "growing"
//   series(k, n0, G)    neutrons in each generation, N(g+1) = k x N(g)
//   steadyGrid(T)       every slider setting the toy calls steady (only k = 1 exactly: rods 40%, moderator 100%)
//   step3Start(T, S)    the state step 3 always starts from: the rods as the reader left them, the moderator refilled
//   plant(F, mw)        heat, efficiency, and rejected heat plus other losses of a plant sending out mw, at the efficiency
//                       implied by EIA's 2025 weighted average tested heat rate for nuclear units
//   atm(mpa, F)         a pressure as a multiple of sea-level air pressure, rounded to the nearest ten
//   overlap(d, u)       how a design's outlet range sits against a heat use's band, temperatures only: "all" (electricity,
//                       every design), "qual" (a use with no band drawn), "na" (outlet depends on the design), "below"
//                       (top outlet at or below the band's bottom: heat flows only from hotter to cooler), "part" (the
//                       hottest designs run above part of the band) or "whole" (the hottest run above all of it).
//                       Overlap is not capability: the chosen design and its heat exchangers decide.
//   reached(D, key)     the heat uses whose band a design's outlet overlaps (or electricity), in data order
// Lesson-local components (used by this page only): FissionScene (tap to fire one
// neutron), ChainToy (rods and moderator sliders, a core picture and neutrons per generation, with a text version),
// PlantDiagram (PWR or BWR, tappable parts with numbered markers and chips, an aria-live note), HeatLadder (designs on
// a temperature axis against the heat-use bands, rows as buttons). Shared: LX.StepCards, LX.Slider, LX.Predict,
// LX.Guess, LX.CardSort, LX.CompareTable, LX.EnergyChain, LX.CausalChain.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  function kOf(T, rods, mod) {
    var kFull = T.kMin + (T.kMax - T.kMin) * mod / 100;
    return kFull * (1 - T.rodAbsorb * rods / 100);
  }
  function stateOf(k, band) { return k < 1 - band ? "dying" : k > 1 + band ? "growing" : "steady"; }
  // step 3 always starts with the moderator full, so its promise (rods out: k = kMax) and its goal (k = 1) hold even
  // after the reader drained the water in step 4 and came back
  function step3Start(T, S) { return { rods: S.rods, mod: T.moderator.max, refilled: S.mod !== T.moderator.max }; }
  function series(k, n0, G) { var a = [n0]; for (var g = 1; g <= G; g++) a.push(a[g - 1] * k); return a; }
  function grid(c) { var a = []; for (var v = c.min; v <= c.max + 1e-9; v += c.step) a.push(Math.round(v)); return a; }
  function steadyGrid(T) {
    var out = [];
    grid(T.rods).forEach(function (r) { grid(T.moderator).forEach(function (m) { var k = kOf(T, r, m); if (stateOf(k, T.steadyBand) === "steady") out.push({ rods: r, mod: m, k: k }); }); });
    return out;
  }
  function plant(F, mw) {
    var hr = F.heat_rate_btu_kwh.value, btu = F.btu_per_kwh.value, heat = mw * hr / btu;
    return { mw: mw, eff: btu / hr, heat: heat, waste: heat - mw };
  }
  function atm(mpa, F) { return Math.round(mpa / F.atm_mpa.value / 10) * 10; }
  function overlap(d, u) {
    if (u.all) return "all";
    if (u.lo == null) return "qual";
    if (d.hi == null) return "na";
    if (d.hi <= u.lo) return "below";
    return d.hi > u.hi ? "whole" : "part";
  }
  function reached(D, key) { var d = D.designs.filter(function (x) { return x.key === key; })[0]; return D.uses.filter(function (u) { var o = overlap(d, u); return o === "all" || o === "part" || o === "whole"; }); }
  // what the heat ladder says for each use, by overlap (step 8)
  var OVER = { all: "every design here.", qual: "no band drawn; water-cooled plants supply it in some places.", na: "depends on the design.",
               below: "outlet below this band.", part: "outlet overlaps part of this band.", whole: "the hottest designs run above all of this band." };
  var STATE = { dying: "Dying out", steady: "Steady: critical", growing: "Growing" };
  // what step 9 says once the reader predicts: the chain stops, decay heat goes on (storage and passive cooling are their
  // own myth cards in the practice)
  var DECAY = { no: "The [[fission|fission]] products keep decaying and give off [[decay-heat|decay heat]], so cooling must go on.",
                yes: "The fission products keep decaying and give off decay heat, so cooling must go on.",
                reveal: "Fission stops but decay does not; the myth cards below cover used fuel and passive cooling." };
  // what a step says after the toy's goal is met, or missed (steps 3 and 4)
  var SAW = {
    critical: "**Critical**: the rods absorb just enough neutrons. Critical is a reactor's normal, steady state, not an alarm.",
    notSteady: "Not steady yet: move the rods until k reads 1.00 and the bars stay level.",
    drained: "Without slowing, few neutrons split uranium-235 in this fuel. In water-cooled plants the water is the moderator, so less water means less slowing.",
    notDrained: "Drain more of the moderator and watch k fall below 1."
  };
  function fmtK(k) { return Math.abs(k - 1) < 0.005 && Math.abs(k - 1) > 1e-9 ? k.toFixed(3) : k.toFixed(2); }
  function fmtN(v) { return Math.round(v).toLocaleString("en-US"); }
  function pct1(x) { return (x * 100).toFixed(1) + "%"; }
  function count(v) { return v < 1 ? "under one" : fmtN(v); }
  // the sentence after a change of the toy's sliders (steps 3 and 4): one sentence
  function toyText(T, rods, mod) {
    var k = kOf(T, rods, mod), s = stateOf(k, T.steadyBand), N = series(k, T.n0, T.generations), last = N[N.length - 1];
    var head = "k = " + fmtK(k) + " (rods " + rods + "% in, moderator " + mod + "%): ";
    if (s === "steady") return head + "**steady**, each generation as large as the last.";
    return head + "**" + (s === "growing" ? "growing" : "dying out") + "**, from " + fmtN(T.n0) + " neutrons to " + count(last) + " in " + T.generations + " generations.";
  }
  var model = { kOf: kOf, stateOf: stateOf, series: series, steadyGrid: steadyGrid, step3Start: step3Start, plant: plant, atm: atm, overlap: overlap, reached: reached,
                OVER: OVER, DECAY: DECAY, fmtK: fmtK, fmtN: fmtN, pct1: pct1, count: count, toyText: toyText, STATE: STATE, SAW: SAW, grid: grid };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, LESSON = "f05-nuclear-basics";
  var NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, parent) { return LX.S(tag, attrs, parent); }

  // ---- FissionScene: one neutron splits one uranium-235 nucleus (lesson-local)
  function FissionScene(host, o) {
    var w = H("div", { class: "f5-fission" }, host);
    var box = H("div", { class: "f5-fission-box" }, w);
    var s = LX.S("svg", { viewBox: "0 0 420 170", class: "f5-fission-svg", role: "img",
      "aria-label": "A neutron flies toward a uranium-235 nucleus. When it hits, the nucleus splits into two smaller atoms, three new neutrons fly out, and heat spreads from the split." }, box);
    var glow = svg("circle", { class: "f5-glow", cx: 170, cy: 85, r: 10, opacity: 0 }, s);
    var nuc = svg("g", { class: "f5-nuc" }, s);
    svg("circle", { cx: 170, cy: 85, r: 26, class: "f5-nucleus" }, nuc);
    var nl = svg("text", { x: 170, y: 90, "text-anchor": "middle", class: "f5-lbl" }, nuc); nl.textContent = "U-235";
    var fA = svg("circle", { cx: 170, cy: 85, r: 17, class: "f5-frag", opacity: 0 }, s);
    var fB = svg("circle", { cx: 170, cy: 85, r: 15, class: "f5-frag b", opacity: 0 }, s);
    var n0 = svg("circle", { cx: 18, cy: 85, r: 6, class: "f5-neutron" }, s);
    var outs = [0, 1, 2].map(function () { return svg("circle", { cx: 170, cy: 85, r: 6, class: "f5-neutron", opacity: 0 }, s); });
    var lab = svg("g", { class: "f5-labs", opacity: 0 }, s);
    function txt(x, y, t, cls, anchor) { var e = svg("text", { x: x, y: y, class: cls || "f5-lbl small", "text-anchor": anchor || "start" }, lab); e.textContent = t; return e; }
    txt(276, 34, "fission product"); txt(276, 140, "fission product");
    txt(400, 62, "new neutrons", null, "end");
    txt(170, 150, "heat", "f5-lbl heat", "middle");
    var nl0 = svg("text", { x: 18, y: 70, "text-anchor": "start", class: "f5-lbl small n0lab" }, s); nl0.textContent = "neutron";
    var row = H("div", { class: "f5-row" }, w);
    var fire = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Fire a neutron" }, row);
    var again = H("button", { type: "button", class: "lx-btn ghost small", text: "Reset", hidden: true }, row);
    var END = { A: [252, 30], B: [252, 136], N: [[384, 24], [400, 88], [384, 150]] };
    function draw(t) {            // t in [0, 1]: 0 to 0.4 the neutron flies in, then the split spreads out
      var a = Math.min(1, t / 0.4), b = Math.max(0, (t - 0.4) / 0.6);
      n0.setAttribute("cx", LX.lerp(18, 146, a)); n0.setAttribute("opacity", t < 0.4 ? 1 : 0);
      nl0.setAttribute("opacity", t < 0.05 ? 1 : 0);
      nuc.setAttribute("opacity", t < 0.4 ? 1 : 0);
      [fA, fB].forEach(function (f, i) { var e = i ? END.B : END.A; f.setAttribute("opacity", b > 0 ? 1 : 0); f.setAttribute("cx", LX.lerp(170, e[0], b)); f.setAttribute("cy", LX.lerp(85, e[1], b)); });
      outs.forEach(function (n, i) { n.setAttribute("opacity", b > 0 ? 1 : 0); n.setAttribute("cx", LX.lerp(170, END.N[i][0], b)); n.setAttribute("cy", LX.lerp(85, END.N[i][1], b)); });
      glow.setAttribute("r", 10 + 30 * b); glow.setAttribute("opacity", b > 0 ? 0.5 * (1 - 0.3 * b) : 0);
      lab.setAttribute("opacity", b >= 1 ? 1 : 0);
    }
    var raf = null, fired = false, focusReset = false;
    function go() {
      if (raf) cancelAnimationFrame(raf);
      if (LX.reduced()) { draw(1); finish(); return; }
      var t0 = null;
      function step(ts) { if (t0 == null) t0 = ts; var t = Math.min(1, (ts - t0) / 1100); draw(t); if (t < 1) raf = requestAnimationFrame(step); else { raf = null; finish(); } }
      raf = requestAnimationFrame(step);
    }
    function finish() {
      fire.hidden = true; again.hidden = false;
      if (focusReset) { focusReset = false; again.focus({ preventScroll: true }); }   // Fire is hidden now: keep the reader's place
      if (!fired) { fired = true; if (o.onFire) o.onFire(); } else if (o.onFire) o.onFire(true);
    }
    fire.addEventListener("click", function () { focusReset = true; go(); });
    again.addEventListener("click", function () { draw(0); fire.hidden = false; again.hidden = true; fire.focus({ preventScroll: true }); });
    s.addEventListener("click", function () { if (!fire.hidden) go(); });
    draw(o.done ? 1 : 0); if (o.done) { fire.hidden = true; again.hidden = false; fired = true; }
    return { el: w, fire: function () { draw(1); finish(); } };
  }

  // ---- ChainToy: rods and moderator set k; a core picture and neutrons per generation (lesson-local)
  function ChainToy(host, o) {
    var T = o.toy, st = o.state, w = H("div", { class: "f5-toy" }, host);
    var ctl = H("div", { class: "f5-toy-ctl" }, w);
    var sRods = LX.Slider(ctl, { label: "Control rods in", color: "var(--lx-ink-2)", min: T.rods.min, max: T.rods.max, step: T.rods.step, value: st.rods,
      fmt: function (v) { return v + "%"; }, downLabel: "Pull out", upLabel: "Push in", onChange: function (v) { st.rods = v; paint(true); } });
    var sMod = LX.Slider(ctl, { label: "Moderator (water) left", color: "var(--lx-hyd)", min: T.moderator.min, max: T.moderator.max, step: T.moderator.step, value: st.mod,
      fmt: function (v) { return v + "%"; }, downLabel: "Drain", upLabel: "Refill", onChange: function (v) { st.mod = v; paint(true); } });
    var stage = H("div", { class: "f5-toy-stage" }, w);
    var core = LX.S("svg", { viewBox: "0 0 120 150", class: "f5-core", role: "img" }, stage);
    var chart = H("div", { class: "f5-gens" }, stage);
    var bars = LX.S("svg", { class: "f5-bars", role: "img" }, chart), lastN = null, lastS = null;
    var read = H("p", { class: "f5-read", "aria-live": "polite" }, w);
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the chart" }, alt);
    var altBox = H("div", { class: "lx-scroll-x" }, alt);
    function drawCore() {
      core.innerHTML = "";
      svg("rect", { x: 8, y: 8, width: 104, height: 134, rx: 16, class: "f5-vessel" }, core);
      var wh = 110 * st.mod / 100;
      svg("rect", { x: 14, y: 20 + 110 - wh, width: 92, height: wh, class: "f5-water" }, core);
      [24, 46, 68, 90].forEach(function (x) { svg("rect", { x: x - 5, y: 38, width: 10, height: 90, rx: 3, class: "f5-fuelrod" }, core); });
      var depth = 90 * st.rods / 100;
      [35, 57, 79].forEach(function (x) { svg("rect", { x: x - 3, y: 2, width: 6, height: 36 + depth, rx: 2, class: "f5-crod" }, core); });
      core.setAttribute("aria-label", "A reactor core: four fuel rods, three control rods " + st.rods + "% in, and moderator water " + st.mod + "% full.");
    }
    function drawBars(N, s) {
      bars.innerHTML = "";
      lastN = N; lastS = s;
      var VW = Math.max(220, Math.min(460, chart.clientWidth || 330)), VH = 170;
      bars.setAttribute("viewBox", "0 0 " + VW + " " + VH); bars.setAttribute("width", VW); bars.setAttribute("height", VH);
      var ml = 34, mt = 14, W = VW - ml - 8, Hh = 124, top = 4 * T.n0, bw = W / N.length;
      [0, 1, 2, 3, 4].forEach(function (i) {
        var v = i * T.n0, y = mt + Hh - Hh * v / top;
        svg("line", { x1: ml, x2: ml + W, y1: y, y2: y, class: "f5-gridl" }, bars);
        var t = svg("text", { x: ml - 5, y: y + 4, "text-anchor": "end", class: "f5-ax" }, bars); t.textContent = fmtN(v);
      });
      N.forEach(function (v, g) {
        var hgt = Hh * Math.min(v, top) / top, x = ml + g * bw + 2, y = mt + Hh - hgt;
        svg("rect", { x: x, y: y, width: Math.max(2, bw - 4), height: Math.max(0.5, hgt), rx: 2, class: "f5-bar " + s }, bars);
        if (v > top) { var u = svg("text", { x: x + (bw - 4) / 2, y: mt - 3, "text-anchor": "middle", class: "f5-ax over" }, bars); u.textContent = "▲"; }
        if (g % 3 === 0) { var gl = svg("text", { x: x + (bw - 4) / 2, y: mt + Hh + 14, "text-anchor": "middle", class: "f5-ax" }, bars); gl.textContent = g; }
      });
      svg("line", { x1: ml, x2: ml + W, y1: mt + Hh - Hh * T.n0 / top, y2: mt + Hh - Hh * T.n0 / top, class: "f5-steadyl" }, bars);
      var cap = svg("text", { x: ml + W, y: mt + Hh - Hh * T.n0 / top - 4, "text-anchor": "end", class: "f5-ax steady" }, bars); cap.textContent = "steady level";
      var xl = svg("text", { x: ml + W / 2, y: VH - 2, "text-anchor": "middle", class: "f5-ax" }, bars); xl.textContent = "generation";
      bars.setAttribute("aria-label", "Neutrons in each of " + (N.length) + " generations, from " + fmtN(N[0]) + " to " + fmtN(N[N.length - 1]) + ": " + STATE[s].toLowerCase() + ". Bars above " + fmtN(top) + " are cut off and marked with a triangle.");
    }
    function drawAlt(N) {
      altBox.innerHTML = "";
      var t = H("table", { class: "lx-mini-table" }, altBox), hr = H("tr", null, H("thead", null, t));
      H("th", { scope: "col", text: "Generation" }, hr); H("th", { scope: "col", text: "Neutrons" }, hr);
      var b = H("tbody", null, t);
      N.forEach(function (v, g) { var r = H("tr", null, b); H("td", { text: g }, r); H("td", { text: fmtN(v) }, r); });
    }
    function paint(user) {
      var k = kOf(T, st.rods, st.mod), s = stateOf(k, T.steadyBand), N = series(k, T.n0, T.generations);
      drawCore(); drawBars(N, s); drawAlt(N);
      read.innerHTML = '<span class="lx-pill ' + (s === "steady" ? "good" : s === "growing" ? "bad" : "warn") + '">' + STATE[s] + "</span><span>" +
        LX.rich(toyText(T, st.rods, st.mod)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") + "</span>";
      if (o.onChange) o.onChange(k, s, !!user);
    }
    paint(false);
    if (window.ResizeObserver) { var rw = 0; new ResizeObserver(function () { var c = chart.clientWidth; if (c && Math.abs(c - rw) > 2 && lastN) { rw = c; drawBars(lastN, lastS); } }).observe(chart); }
    return { el: w, set: function (r, m) { st.rods = r; st.mod = m; sRods.set(r); sMod.set(m); paint(true); } };
  }

  // ---- PlantDiagram: from fuel to steam to the grid; PWR or BWR (lesson-local)
  var PARTS = ["containment", "core", "rods", "vessel", "sg", "turbine", "generator", "condenser", "tower"];
  function partNote(D, F, p, type, W) {
    var pwr = type === "pwr", n = {
      containment: "**Containment**: a strong structure, often a large concrete dome, built to hold in radioactive material in an accident.",
      core: "**Core**: " + F.assemblies_per_core.text + " [[fuel-assembly|fuel assemblies]], each of " + F.rods_per_assembly.text + " rods about 1 cm wide, filled with uranium pellets. [[fission|Fission]] heats the water around them.",
      rods: "**Control rods**: pushed into the core to slow the chain reaction, pulled out to speed it up.",
      vessel: pwr ? "**Vessel**: water at about " + F.pwr_mpa.value + " MPa ([[megapascal|megapascals]]), about " + atm(F.pwr_mpa.value, F) + " times the air pressure at sea level, so it stays liquid at about " + F.pwr_c.value + " °C."
                  : "**Vessel**: water at about " + F.bwr_mpa.value + " MPa ([[megapascal|megapascals]]), about " + atm(F.bwr_mpa.value, F) + " times the air pressure at sea level. It boils right here, at about " + F.bwr_c.value + " °C.",
      sg: pwr ? "**[[steam-generator|Steam generator]]**: the core's water flows through its tubes and boils a separate, clean loop into steam. The core's water stays in its own loop."
              : "**No steam generator** in this design: the vessel's own steam goes straight to the turbine.",
      turbine: pwr ? "**Turbine**: steam from the second loop spins it." : "**Turbine**: steam straight from the vessel spins it.",
      generator: "**Generator**: the turbine turns it, and it makes electricity: " + W.mw + " MW from Prairie Town's plant.",
      condenser: "**Condenser**: cold water turns the used steam back into water, which goes back to be heated again. Most of the " + fmtN(W.waste) + " MW of rejected heat and losses leaves here.",
      tower: "**Cooling tower**: sheds the condenser's heat into the air. Not every plant has one: some cool with water from a lake, river or ocean."
    };
    return n[p];
  }
  var PART_NAME = { containment: "Containment", core: "Core and fuel", rods: "Control rods", vessel: "Vessel", sg: "Steam generator",
                    turbine: "Turbine", generator: "Generator", condenser: "Condenser", tower: "Cooling tower" };
  function plantSVG(type, F, W) {
    var pwr = type === "pwr", s = "";
    // ground and containment
    s += '<rect class="f5-ground" x="0" y="236" width="520" height="24"/>';
    s += '<path data-part="containment" class="f5-p f5-cont" d="M18 236 V96 A94 70 0 0 1 206 96 V236 Z"/>';
    // vessel and core
    s += '<rect data-part="vessel" class="f5-p f5-vesselp" x="56" y="' + (pwr ? 92 : 78) + '" width="62" height="' + (pwr ? 128 : 142) + '" rx="24"/>';
    s += '<rect class="f5-waterp" x="62" y="' + (pwr ? 104 : 150) + '" width="50" height="' + (pwr ? 108 : 62) + '" rx="10"/>';
    if (!pwr) s += '<path class="f5-bubbles" d="M72 146 v-6 M84 140 v-8 M96 146 v-6 M106 140 v-6"/>';
    s += '<g data-part="core" class="f5-p f5-corep"><rect x="68" y="160" width="38" height="46" rx="4"/><path d="M75 162 V204 M83 162 V204 M91 162 V204 M99 162 V204"/></g>';
    s += '<g data-part="rods" class="f5-p f5-rodsp"><path d="M79 ' + (pwr ? 70 : 230) + ' V' + (pwr ? 176 : 190) + ' M95 ' + (pwr ? 70 : 230) + ' V' + (pwr ? 176 : 190) + '"/></g>';
    if (pwr) {
      s += '<path class="f5-pipe hot" d="M118 116 H146"/><path class="f5-pipe cool" d="M118 196 H146"/>';
      s += '<rect data-part="sg" class="f5-p f5-sgp" x="146" y="86" width="40" height="128" rx="18"/>';
      s += '<path class="f5-pipe steam" d="M176 92 V62 H262 V84"/>';
      s += '<path class="f5-pipe feed" d="M300 210 V224 H166 V214"/>';
    } else {
      s += '<path class="f5-pipe steam" d="M118 96 H250"/>';
      s += '<path class="f5-pipe feed" d="M300 210 V224 H118 V206"/>';
    }
    // turbine, generator, condenser, cooling tower, grid
    s += '<path data-part="turbine" class="f5-p f5-turb" d="M250 84 L320 98 L320 132 L250 146 Z"/>';
    s += '<rect data-part="generator" class="f5-p f5-gen" x="334" y="98" width="44" height="34" rx="6"/><text class="f5-lbl" x="356" y="120" text-anchor="middle">G</text>';
    s += '<path class="f5-shaft" d="M320 115 H334"/><path class="f5-wire" d="M378 108 H404 V40 H512"/>';
    s += '<text class="f5-lbl tag" x="512" y="30" text-anchor="end">' + W.mw + ' MW to the grid</text>';
    s += '<path class="f5-pipe steam" d="M286 140 V164"/>';
    s += '<rect data-part="condenser" class="f5-p f5-cond" x="250" y="164" width="76" height="46" rx="6"/>';
    s += '<path class="f5-pipe coolw" d="M326 196 H426 M326 180 H426"/>';
    s += '<path data-part="tower" class="f5-p f5-tower" d="M418 236 C432 196 430 150 424 112 H500 C494 150 492 196 506 236 Z"/>';
    s += '<path class="f5-vapour" d="M440 104 c-8 -10 6 -16 -2 -28 M462 104 c-8 -10 6 -16 -2 -28 M484 104 c-8 -10 6 -16 -2 -28"/>';
    // the numbers on the drawing
    s += '<text class="f5-lbl tag" x="112" y="60" text-anchor="middle">' + (pwr ? F.pwr_c.value + " °C · " + F.pwr_mpa.value + " MPa" : F.bwr_c.value + " °C · " + F.bwr_mpa.value + " MPa") + "</text>";
    // numbered markers (the chips below carry the same numbers)
    var M = { containment: [32, 108], core: [52, 186], rods: [pwr ? 122 : 122, pwr ? 74 : 232], vessel: [128, pwr ? 150 : 128], sg: [166, 230], turbine: [286, 76], generator: [356, 150], condenser: [242, 200], tower: [462, 228] };
    PARTS.forEach(function (p, i) {
      if (!pwr && p === "sg") return;
      var m = M[p]; s += '<g class="f5-mark" data-part="' + p + '"><circle cx="' + m[0] + '" cy="' + m[1] + '" r="13"/><text x="' + m[0] + '" y="' + (m[1] + 5.5) + '" text-anchor="middle">' + (i + 1) + "</text></g>";
    });
    return s;
  }
  function PlantDiagram(host, o) {
    var D = o.D, F = D.facts, W = o.W, st = o.state, w = H("div", { class: "f5-plant" }, host);
    var seg = H("div", { class: "lx-seg f5-seg", role: "group", "aria-label": "Reactor design" }, w), tb = {};
    [["pwr", "Pressurized water (PWR)"], ["bwr", "Boiling water (BWR)"]].forEach(function (t) {
      tb[t[0]] = H("button", { type: "button", "aria-pressed": "false", text: t[1] }, seg);
      tb[t[0]].addEventListener("click", function () { set(t[0], st.part === "sg" && t[0] === "bwr" ? "turbine" : st.part, true); });
    });
    var box = H("div", { class: "f5-plant-box" }, w), sv = null;
    var chips = H("div", { class: "f5-chips", role: "group", "aria-label": "Parts of the plant" }, w), cb = {};
    PARTS.forEach(function (p, i) {
      cb[p] = H("button", { type: "button", class: "f5-chip", "aria-pressed": "false", html: '<span class="n">' + (i + 1) + "</span>" + PART_NAME[p] }, chips);
      cb[p].addEventListener("click", function () { set(st.type, p, true); });
    });
    var note = H("p", { class: "f5-note", "aria-live": "polite" }, w);
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the plant" }, alt);
    var altList = H("ol", null, alt);
    function set(type, part, user) {
      st.type = type; st.part = part || st.part || "core";
      if (type === "bwr" && st.part === "sg") st.part = "turbine";
      var had = document.activeElement;
      box.innerHTML = '<svg class="f5-plant-svg" viewBox="0 0 520 260" role="img" aria-label="' + LX.esc((type === "pwr" ? "A pressurized-water reactor plant: " : "A boiling-water reactor plant: ") +
        "containment, vessel with core and control rods, " + (type === "pwr" ? "steam generator, " : "") + "turbine, generator, condenser and cooling tower; " + W.mw + " MW to the grid.") + '">' + plantSVG(type, F, W) + "</svg>";
      sv = box.firstChild;
      Array.prototype.forEach.call(sv.querySelectorAll("[data-part]"), function (el) {
        var p = el.getAttribute("data-part"); el.classList.toggle("sel", p === st.part);
        el.addEventListener("click", function () { set(st.type, p, true); });
      });
      Object.keys(tb).forEach(function (k) { tb[k].setAttribute("aria-pressed", k === type ? "true" : "false"); });
      PARTS.forEach(function (p) { cb[p].setAttribute("aria-pressed", p === st.part ? "true" : "false"); cb[p].hidden = type === "bwr" && p === "sg"; });
      note.innerHTML = LX.rich(partNote(D, F, st.part, type, W)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      altList.innerHTML = "";
      PARTS.forEach(function (p) { if (type === "bwr" && p === "sg") return; H("li", { html: LX.rich(partNote(D, F, p, type, W)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }, altList); });
      if (had && (had === tb.pwr || had === tb.bwr || had.classList.contains("f5-chip"))) had.focus({ preventScroll: true });
      if (o.onSet) o.onSet(st.type, st.part, user);
      LX.emit("layout");
    }
    set(st.type || "pwr", st.part || "core", false);
    return { el: w, set: set };
  }

  // ---- HeatLadder: heat-use bands and designs on one temperature axis; design rows are buttons (lesson-local)
  function HeatLadder(host, o) {
    var D = o.D, w = H("div", { class: "f5-ladder" }, host), TMAX = 1000;
    function pos(t) { return (100 * t / TMAX).toFixed(2) + "%"; }
    function span(lo, hi) { return "left:" + pos(lo) + ";width:calc(" + pos(hi) + " - " + pos(lo) + " + 4px)"; }
    var plot = H("div", { class: "f5-lad-plot" }, w);
    var axis = H("div", { class: "f5-lad-axis", "aria-hidden": "true" }, plot);
    [0, 250, 500, 750, 1000].forEach(function (t) { H("span", { style: "left:" + pos(t), text: t === 1000 ? "1,000 °C" : String(t) }, axis); });
    var guide = D.uses.filter(function (u) { return u.hi != null; })[0];
    H("div", { class: "f5-lad-guide", style: "left:calc(var(--lab) + (100% - var(--lab) - var(--pr)) * " + (guide.lo / TMAX) + ")", "aria-hidden": "true" }, plot);
    H("p", { class: "f5-lad-h", text: "Heat a use needs" }, plot);
    D.uses.filter(function (u) { return u.hi != null; }).forEach(function (u) {
      var r = H("div", { class: "f5-lad-row use" }, plot);
      H("span", { class: "nm", html: LX.rich(u.mark || u.name) }, r);
      var tr = H("span", { class: "tr" }, r); H("i", { style: span(u.lo, u.hi) }, tr);
      H("span", { class: "lx-sr", text: ": " + u.lo + " to " + u.hi + " °C" }, r);
    });
    H("p", { class: "f5-lad-h", text: "Outlet temperature of each design (tap one)" }, plot);
    var rows = H("div", { class: "f5-lad-rows", role: "group", "aria-label": "Designs by outlet temperature" }, plot), rb = {};
    D.designs.forEach(function (d) {
      var b = H("button", { type: "button", class: "f5-lad-row", "aria-pressed": "false" }, rows);
      H("span", { class: "nm", text: d.name }, b);
      var tr = H("span", { class: "tr" }, b);
      if (d.hi != null) H("i", { style: span(d.lo, d.hi) }, tr);
      else H("em", { text: d.outlet }, tr);
      H("span", { class: "lx-sr", text: ", outlet " + d.outlet }, b);
      b.addEventListener("click", function () { pick(d.key, true); });
      rb[d.key] = b;
    });
    var out = H("div", { class: "f5-lad-out", "aria-live": "polite" }, w);
    H("p", { class: "lx-hint", html: LX.rich("Overlap is not capability: heat flows only from hotter to cooler, through [[heat-exchanger|heat exchangers]], so a plant must run hotter than its process. The design decides.") }, w);
    function pick(key, user) {
      var d = D.designs.filter(function (x) { return x.key === key; })[0]; o.state.design = key;
      Object.keys(rb).forEach(function (k) { rb[k].setAttribute("aria-pressed", k === key ? "true" : "false"); });
      var r = reached(D, key);
      out.innerHTML = "";
      H("p", { html: "<b>" + LX.esc(d.name) + "</b> · " + LX.esc(d.size) + " · coolant: " + LX.esc(d.coolant) + " · outlet " + LX.esc(d.outlet) + "." }, out);
      var ul = H("ul", { class: "f5-lad-uses" }, out);
      D.uses.forEach(function (u) {
        var v = overlap(d, u), cls = v === "below" ? "no" : v === "na" || v === "qual" ? "na" : "ok";
        H("li", { class: cls, html: LX.icon(cls === "ok" ? "check" : cls === "na" ? "question" : "cross") + "<span><b>" + LX.rich(u.mark || u.name) + "</b>" +
          (u.hi != null ? " (" + u.lo + " to " + u.hi + " °C)" : "") + ": " + OVER[v] + "</span>" }, ul);
      });
      if (o.onPick) o.onPick(key, r, user);
    }
    if (o.state.design) pick(o.state.design, false);
    return { el: w, pick: pick };
  }

  // ---------------------------------------------------------------- the lesson
  function view(live, data, root) {
    var D = data.f05_nuclear_basics, F = D.facts, T = D.toy;
    var W = plant(F, data.town.fleet.nuclear.mw);
    var log = LX.store.get("f5-log", {}) || {};
    function keep() { LX.store.set("f5-log", log); }
    var S = { rods: log.rods != null ? log.rods : T.rods.start, mod: log.mod != null ? log.mod : T.moderator.start, type: log.type || "pwr", part: log.part || "core", design: log.design || null };
    var seen = { fired: !!log.fired, steady: !!log.steady, drained: !!log.drained, both: !!log.both, sorted: log.sorted || null, guess: log.guess, designs: log.designs || [] };
    var sortCards = [
      { id: "pellets", text: "Fuel rods of uranium pellets", bin: "chain", why: "The fuel is where uranium-235 splits." },
      { id: "mod", text: "Moderator (the water)", bin: "chain", why: "It slows neutrons so uranium-235 catches them; without it this chain dies out." },
      { id: "rods", text: "Control rods", bin: "chain", why: "They absorb neutrons: pushed in to slow the chain, pulled out to speed it up." },
      { id: "pumps", text: "Coolant pumps", bin: "heat", why: "They push water through the core to carry its heat away." },
      { id: "sg", text: "Steam generator (PWR)", bin: "heat", why: "The core's hot water boils a second, clean loop into steam." },
      { id: "turbine", text: "Turbine", bin: "power", why: "Steam spins its blades." },
      { id: "gen", text: "Generator", bin: "power", why: "The turbine turns it, and it makes electricity." },
      { id: "cond", text: "Condenser", bin: "waste", why: "Cold water turns used steam back into water; most of the heat leaves here." },
      { id: "tower", text: "Cooling tower", bin: "waste", why: "It sheds the condenser's heat into the air; some plants use a lake, river or ocean." }
    ];
    var sortBins = [
      { id: "chain", label: "Runs the chain reaction", color: "var(--lx-nuc)" }, { id: "heat", label: "Carries the heat", color: "var(--lx-cc)" },
      { id: "power", label: "Makes electricity", color: "var(--lx-accent)" }, { id: "waste", label: "Sheds low-temperature heat", color: "var(--lx-wind)" }];
    var cards;
    var steps = [
      { text: "Fire a [[neutron|neutron]] at a uranium-235 nucleus and watch what comes out.",
        build: function (act, api) {
          FissionScene(act, { done: seen.fired, onFire: function () {
            seen.fired = log.fired = true; keep(); api.done();
            api.saw("**[[fission|Fission]]**: the nucleus splits into two smaller atoms, a few new neutrons and heat. Each new neutron can split another nucleus: a [[chain-reaction|chain reaction]].");
          } });
          if (seen.fired) api.done();
        } },
      { text: "Suppose every new neutron goes on to split another nucleus. Predict: what happens to the number of splits, generation after generation?",
        build: function (act, api) {
          var p = LX.Predict(act, { id: "f5-runaway", answer: "grows", fresh: true, options: [{ value: "dies", label: "It dies out" }, { value: "same", label: "It stays the same" }, { value: "grows", label: "It grows fast" }],
            feedback: { grows: "Each split leads to several more, so the count multiplies every generation." },
            onPick: function (v) { log.pred = v; keep(); p.reveal("A reactor keeps it steady instead: on average, each split leads to exactly one more."); api.done(); } });
          if (log.pred) api.done();
        } },
      { text: "With the rods out and the [[moderator|moderator]] (water) full, each split leads to " + fmtK(kOf(T, 0, T.moderator.max)) + " more. Push the [[control-rod|control rods]] in until the bars stay level: steady, or [[criticality|critical]].",
        build: function (act, api) {
          var st3 = step3Start(T, S); S.mod = st3.mod; log.mod = S.mod; keep();
          if (st3.refilled) H("p", { class: "lx-hint", text: "The moderator is back at 100% for this step." }, act);
          ChainToy(act, { toy: T, state: S, onChange: function (k, s, user) {
            log.rods = S.rods; log.mod = S.mod; keep();
            if (s === "steady") { seen.steady = log.steady = true; keep(); api.done(); }
            if (s === "steady" && (user || seen.steady)) api.saw(SAW.critical);
            else if (user) api.saw(SAW.notSteady, true);
          } });
          if (seen.steady) api.done();
        } },
      { text: "Now drain the [[moderator|moderator]], the water that slows neutrons so uranium-235 catches them. Watch the chain.",
        build: function (act, api) {
          ChainToy(act, { toy: T, state: S, onChange: function (k, s, user) {
            log.rods = S.rods; log.mod = S.mod; keep();
            if (s === "dying" && S.mod < T.moderator.max) { seen.drained = log.drained = true; keep(); api.done(); }
            if (s === "dying" && S.mod < T.moderator.max && (user || seen.drained)) api.saw(SAW.drained);
            else if (user) api.saw(SAW.notDrained, true);
          } });
          if (seen.drained) api.done();
        } },
      { text: "Follow the heat from fuel to steam. Tap the parts, then switch between the two U.S. designs.",
        build: function (act, api) {
          var types = {}; types[S.type] = true;
          PlantDiagram(act, { D: D, W: W, state: S, onSet: function (type, part, user) {
            log.type = type; log.part = part; keep();
            if (user) types[type] = true;
            if (types.pwr && types.bwr) { seen.both = log.both = true; keep(); api.done();
              api.saw("**PWR**: water at about " + F.pwr_mpa.value + "\u00a0MPa stays liquid at about " + F.pwr_c.value + "\u00a0°C and boils a second loop. **BWR**: at about " + F.bwr_mpa.value + "\u00a0MPa it boils in the vessel, at about " + F.bwr_c.value + "\u00a0°C."); }
          } });
          if (seen.both) api.done();
        } },
      { text: "Each part has one main job. Sort the parts of a pressurized-water plant by the job they do.",
        build: function (act, api) {
          var cs = LX.CardSort(act, { bins: sortBins, cards: sortCards, checkLabel: "Check my sort", maxWhy: 4,
            onCheck: function (g) {
              log.placed = JSON.parse(JSON.stringify(cs.placed())); keep();
              if (g.placed < g.total) { api.saw("Place every card first: " + (g.total - g.placed) + " still in the pool.", true); return; }
              seen.sorted = log.sorted = g.right; keep(); api.done();
              api.saw("**" + g.right + " of " + g.total + "** right. Three parts run the chain, two move its heat, two make electricity and two shed the heat that is left.", g.right < g.total);
            } });
          if (log.placed) cs.place(JSON.parse(JSON.stringify(log.placed)));
          if (seen.sorted != null) api.done();
          return null;
        } },
      { text: "Prairie Town's plant sends " + W.mw + " MW to the grid. Guess: how much heat must its core make?",
        build: function (act, api) {
          var ticks = [100, 150, 300, 600], ans = ticks.reduce(function (b, v, i) { return Math.abs(v - W.heat) < Math.abs(ticks[b] - W.heat) ? i : b; }, 0);
          LX.Guess(act, { id: "f5-heat", q: "Heat from the core, in MW of heat ([[mwt-mwe|MWt]])", ticks: ticks.map(function (v) { return v + " MW"; }), answer: ans, start: 0,
            onLock: function (g, out) {
              seen.guess = log.guess = g; keep(); api.done();
              energyBars(out, W);
              api.saw("About **" + fmtN(W.heat) + " MW** of heat for " + W.mw + " MW of electricity, at the " + pct1(W.eff) + " [[efficiency|efficiency]] implied by EIA's 2025 tested [[heat-rate|heat rate]]. The other " + fmtN(W.waste) + " MW is rejected heat and losses, mostly through the condenser.", g !== ans);
            } });
          if (seen.guess != null) { api.done(); energyBars(act, W); }
        } },
      { text: "Designs differ in size, [[coolant|coolant]] and [[outlet-temperature|outlet temperature]]. Pick two designs: which heat-use bands does each outlet temperature overlap?",
        build: function (act, api) {
          HeatLadder(act, { D: D, state: S, onPick: function (key, r, user) {
            log.design = key; if (seen.designs.indexOf(key) < 0) seen.designs.push(key); log.designs = seen.designs; keep();
            if (seen.designs.length >= 2) api.done();
            if (user) api.saw(seen.designs.length < 2 ? "Now pick a second design and compare." : "Hotter outlets overlap more uses: only the designs at **" + F.htr_lo_c.value + " to " + F.htr_hi_c.value + " °C** overlap the " + F.proc_lo_c.value + " to " + F.proc_hi_c.value + " °C industrial band. Overlap is a start; the design and its heat exchangers decide.");
          } });
          if (seen.designs.length >= 2) api.done();
        } },
      { text: "The control rods drop in and the chain reaction stops. Predict: does the fuel stop making heat?",
        build: function (act, api) {
          var p = LX.Predict(act, { id: "f5-decay", answer: "no", fresh: true, options: [{ value: "yes", label: "Yes, at once" }, { value: "no", label: "No, it keeps making some heat" }],
            feedback: { no: DECAY.no, yes: DECAY.yes },
            onPick: function (v) {
              log.decay = v; keep();
              p.reveal(DECAY.reveal);
              api.done(); LX.progress.done(LESSON); buildExplain(D, W, S, data);
            } });
          if (log.decay) api.done();
        } }
    ];
    function energyBars(host, W) {
      var old = host.querySelector(".f5-ebars"); if (old) old.parentNode.removeChild(old);
      var b = H("div", { class: "f5-ebars" }, host);
      [["Heat from the core", W.heat, "var(--lx-nuc)"], ["Electricity to the grid", W.mw, "var(--lx-accent)"], ["Rejected heat and losses, mostly at the condenser", W.waste, "var(--lx-wind)"]].forEach(function (r) {
        var row = H("div", { class: "f5-ebar" }, b);
        H("span", { class: "l", text: r[0] }, row);
        var tr = H("span", { class: "t" }, row); H("i", { style: "width:" + (100 * r[1] / W.heat).toFixed(1) + "%;background:" + r[2] }, tr);
        H("b", { text: fmtN(r[1]) + " MW" }, row);
      });
    }
    cards = LX.StepCards(live, { id: "f5-steps", steps: steps });

    // demo states: "step-N" opens step N with its action done; "mid" = the chain held steady (step 3); "done" = the last
    // step answered, with the toy held steady and the PWR's vessel picked, so the explain layer shows those settings
    LX.demo(root, function (state) {
      var n = state === "mid" ? 3 : state === "done" ? 9 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      if (state === "done") { S.rods = 40; S.mod = 100; S.type = "pwr"; S.part = "vessel"; }
      var i = Math.max(0, Math.min(steps.length - 1, n - 1));
      var click = function (sel, j) { var b = cards.el.querySelectorAll(sel)[j || 0]; if (b) b.click(); };
      if (i === 2) { S.rods = 0; S.mod = 100; }
      if (i === 3) { S.rods = 40; S.mod = 100; }
      if (i === 5) { var m = {}; sortCards.forEach(function (c) { m[c.id] = c.bin; }); m.tower = "heat"; log.placed = m; seen.sorted = null; }
      cards.go(i);
      if (i === 0) click(".f5-fission .lx-btn");
      if (i === 1) click(".lx-choice", 2);
      if (i === 2) { var plus = cards.el.querySelectorAll(".f5-toy .lx-ctl")[0].querySelectorAll("button")[1]; for (var r = 0; r < 4; r++) plus.click(); }
      if (i === 3) { var minus = cards.el.querySelectorAll(".f5-toy .lx-ctl")[1].querySelectorAll("button")[0]; for (var q = 0; q < 6; q++) minus.click(); }
      if (i === 4) { click(".f5-seg button", 1); click(".f5-chip", 5); }
      if (i === 5) click(".lx-cs .lx-step-foot .lx-btn");
      if (i === 6) { var inp = cards.el.querySelector(".lx-guess input"); if (inp) { inp.value = 2; inp.dispatchEvent(new Event("input")); } click(".lx-guess .lx-btn"); }
      if (i === 7) { click("button.f5-lad-row", 0); click("button.f5-lad-row", 4); }
      if (i === 8) click(".lx-choice", 1);
      return { view: "step " + (i + 1) };
    }, cards);
    buildExplain(D, W, S, data);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, W, S, data) {
    var host = document.getElementById("f5-explain"); if (!host) return;
    var F = D.facts, T = D.toy;
    host.innerHTML = ""; host.classList.add("is-live");
    // 1 the annotated plant (e-annotated), on the reader's last design
    var c1 = H("div", { class: "lx-xcard" }, host), h1 = H("header", { class: "lx-x-head" }, c1);
    H("h3", { text: "The plant from fuel to the grid" }, h1); H("span", { class: "lx-hint", text: "Tap a part or a number" }, h1);
    H("p", { class: "lx-lede", html: LX.rich("From reactor to turbine: two separate water loops in a pressurized-water plant, one in a boiling-water plant. Both also have a separate condenser-cooling loop.") }, c1);
    PlantDiagram(c1, { D: D, W: W, state: { type: S.type, part: S.part } });
    // 2 the energy chain, with the reader's design
    var c2 = H("div", { class: "lx-xcard" }, host), pwr = S.type !== "bwr";
    LX.EnergyChain(c2, { title: "Where the core's heat goes", aside: "Prairie Town's plant (illustrative), at EIA's 2025 tested heat rate",
      lede: "A reactor is a heat source: about a third of its heat becomes electricity.",
      stops: [
        { icon: "atom", title: "Fission in the fuel", text: "heat in the core", value: fmtN(W.heat) + " MW of heat" },
        { icon: "flame", title: pwr ? "Hot water, then steam" : "Steam in the vessel", text: pwr ? "about " + F.pwr_c.value + " °C at " + F.pwr_mpa.value + " MPa" : "about " + F.bwr_c.value + " °C at " + F.bwr_mpa.value + " MPa", value: pwr ? "two loops to the turbine" : "one loop to the turbine" },
        { icon: "turbine", title: "Turbine and generator", text: pct1(W.eff) + " of the heat", value: W.mw + " MW to the grid" },
        { icon: "drop", title: "Condenser and tower", text: "rejected heat and other losses", value: fmtN(W.waste) + " MW" }
      ] });
    // 3 the designs compared (e-table)
    var c3 = H("div", { class: "lx-xcard" }, host);
    LX.CompareTable(c3, { title: "Designs compared by size, outlet temperature and uses", text: true,
      caption: "Generic designs and one concept, as DOE described them (2015, 2021); MWe counts electricity, MWt heat.",
      columns: [{ key: "name", label: "Design", main: true }, { key: "size", label: "Size" }, { key: "coolant", label: "Coolant" }, { key: "moderator", label: "Moderator" },
                { key: "outlet", label: "Outlet temperature" }, { key: "uses", label: "Uses" }],
      rows: D.designs.map(function (d, i) { return { key: d.key, color: "var(--lx-tier-" + (1 + i % 5) + ")", name: d.name, size: d.size, coolant: d.coolant, moderator: d.moderator, outlet: d.outlet, uses: d.uses }; }) });
    // 4 how the rods steer the chain (causal chain), with the reader's last setting
    var c4 = H("div", { class: "lx-xcard" }, host), k = kOf(T, S.rods, S.mod);
    LX.CausalChain(c4, { title: "How the control rods steer the chain",
      links: [
        { title: "Rods pushed in", text: "more neutrons absorbed", value: "rods " + S.rods + "% in" },
        { title: "Fewer neutrons left", text: "each split leads to fewer splits", value: "k = " + fmtK(k) },
        { title: "Fewer splits", text: "less heat in the core", value: STATE[stateOf(k, T.steadyBand)] },
        { title: "Less steam", text: "less electricity", value: "rods out: the reverse" }
      ],
      note: "The values are your last setting of the illustrative toy (moderator " + S.mod + "%)." });
  }

  LX.mount("nuclear-basics", function (live, data, root) { view(live, data, root); });
})();
