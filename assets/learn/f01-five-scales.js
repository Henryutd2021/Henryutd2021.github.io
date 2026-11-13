// f01-five-scales.js — F1, "Who decides what, from a light switch to a nation?" (step cards).
//
// Data: assets/learn/data/f01-five-scales.json (the five scales, each by its decisions, authority, physics, inputs and outputs, the card rounds, the predict and
// apply questions, the lessons per scale), 01-power-energy.json (a U.S. home's year and the Lower 48 record hour, with
// sources), town_days.json (the Southwest Power Pool's 2025 statistics, EIA-930) and town.json (Prairie Town's peak and
// wind farm, illustrative).
//
// No optimization model (model mode "none"). The pure functions below:
//   anchors(D)          the real and illustrative power numbers of the zoom: electricity bought per U.S. residential
//                       customer as average power (EIA's yearly kWh ÷ 8,760 h), Prairie Town's highest hour of its
//                       illustrative year and its wind farm (town.json), SPP's 2025 peak, the Lower 48 record
//   feedback(D, key, g, pred)  the sentence a card round shows after Check (score plus one or two sentences)
//   zoomDone(W)         the sentence shown once all five scales are visited
//   grade(cards, placed) a card round's score (LX.CardSort.grade, components/cardsort.js)
//   ladder(results)     per scale, which of the three sorts (who, what, physics) the reader placed right
// A scale is set apart by who decides what, not by size or by land: a city and a grid region can overlap on the map, but
// their boundaries and decisions differ. The scales are overlapping views, not levels of authority.
//
// Lesson-local component (used by this page only): ScaleZoom (the powers-of-ten zoom through five drawn scenes,
// keyboard rail, text version). Shared components: LX.StepCards, LX.Predict, LX.CardSort ("cards" mode), LX.CompareTable,
// LX.ScaleStrip (e-scale-strip: the five scales with the reader's sorts, signals passed down and needs passed up, and the
// lessons per scale, linked when live by data/path.json). The five scale colors are the shared --lx-scale-0 ... 4.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  var SCALES = ["S0", "S1", "S2", "S3", "S4"];
  var CS = (typeof window !== "undefined" && window.LX && window.LX.CardSort) || require("./components/cardsort.js");
  function anchors(D) {
    var A = D["01_power_energy"].anchors, st = D.town_days.stats, town = D.town;
    var homeKW = A.home_year.value / 8760;
    return {
      homeKW: homeKW, homeText: homeKW.toFixed(1) + " kW",
      windMW: town.fleet.wind.mw, townPeakMW: town.scenarios.lesson0.demandPeakMW,
      sppPeakGW: st.peak_demand_GW, sppText: st.peak_demand_GW.toFixed(1) + " GW",
      usPeakMW: A.us_peak.value, usPeakGW: A.us_peak.value / 1000, usText: Math.round(A.us_peak.value / 1000) + " GW"
    };
  }
  function grade(cards, placed) { return CS.grade(cards, placed || {}); }
  function scoreText(g) { return "**" + g.right + " of " + g.total + "** right" + (g.right < g.total ? "; the reasons are under the boxes." : "."); }
  var NOTE = {
    what: "Each scale decides different things, on different clocks: hours at a home, years in a city plan.",
    physics: "A grid model may need line limits, and studies of fast disturbances need [[frequency|frequency]] (lesson 3). A home scheduling model usually leaves both out.",
    exchange: "Signals and limits usually travel down; profiles and needs travel up. A model at one scale takes these arrows as given data, like the Given bin of lesson 10.",
    battery: "One question, five answers: a battery can pay off for a home and not for the grid, or the other way round."
  };
  function feedback(D, key, g, pred) {
    if (key !== "who") return scoreText(g) + " " + NOTE[key];
    var right = pred === D.predict.answer, lead = pred ? (right ? "Your prediction was right: the" : "Not quite: the") : "The";
    return scoreText(g) + " " + lead + " regional grid operator, a [[balancing-authority|balancing authority]], chooses next hour's plants to keep supply equal to demand in its region.";
  }
  function zoomDone(W) {
    return "From about " + W.homeText + " (one home's average) to " + W.usText + " (the Lower 48's record hour), size grows, but a scale is set apart by **who decides what**.";
  }
  function ladder(D, placedBy) {
    var out = {};
    SCALES.forEach(function (s) { out[s] = {}; });
    ["who", "what", "physics"].forEach(function (r) {
      var p = (placedBy || {})[r] || {};
      D.rounds[r].cards.forEach(function (c) { out[c.bin][r] = p[c.id] == null ? null : p[c.id] === c.bin; });
    });
    return out;
  }
  var model = { SCALES: SCALES, anchors: anchors, grade: grade, ladder: ladder, feedback: feedback, zoomDone: zoomDone, scoreText: scoreText, NOTE: NOTE };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, LESSON = "f01-five-scales";
  function scol(s) { return "var(--lx-scale-" + LX.ScaleStrip.scaleIndex(s.id) + ")"; }   // the scale's color token

  // ---- the five scenes (viewBox 400 × 230); class names style them from the page's tokens (f1z- in the page's style block)
  var SCENE = {
    S0: function (W) {
      return '<rect class="sky" x="0" y="0" width="400" height="230"/>' +
        '<path class="hill" d="M250 186 C290 120 340 110 400 128 L400 230 L250 230 Z"/>' +
        '<rect class="ground" x="0" y="180" width="400" height="50"/>' +
        // the home: walls, roof, rooftop solar, lit windows, door, meter, heat pump, car and charger
        '<rect class="wall" x="62" y="112" width="116" height="68"/>' +
        '<path class="roof" d="M50 114 L120 66 L190 114 Z"/>' +
        '<path class="panel" d="M126 76 L160 99 L146 104 L112 81 Z"/>' +
        '<rect class="win" x="78" y="126" width="22" height="18" rx="2"/><rect class="win" x="140" y="126" width="22" height="18" rx="2"/>' +
        '<rect class="door" x="110" y="146" width="18" height="34" rx="2"/>' +
        '<rect class="meter" x="168" y="146" width="12" height="16" rx="2"/><circle class="dial" cx="174" cy="153" r="3"/>' +
        '<rect class="box" x="30" y="160" width="26" height="20" rx="3"/><circle class="fan" cx="43" cy="170" r="6"/>' +
        '<path class="car" d="M196 176 L200 164 Q204 158 212 158 L236 158 Q244 158 248 164 L252 176 Z"/><circle class="wheel" cx="208" cy="178" r="5"/><circle class="wheel" cx="240" cy="178" r="5"/>' +
        '<rect class="box" x="186" y="150" width="7" height="30" rx="1.5"/>' +
        // the wind farm on the ridge
        '<g class="turb"><path d="M330 128 L330 74"/><path d="M330 74 L330 50 M330 74 L351 86 M330 74 L309 86"/><circle cx="330" cy="74" r="2.6"/></g>' +
        '<g class="turb small"><path d="M372 124 L372 88"/><path d="M372 88 L372 72 M372 88 L386 96 M372 88 L358 96"/><circle cx="372" cy="88" r="2"/></g>' +
        // labels
        '<path class="lead" d="M89 135 L89 40 L104 40"/><text class="lbl" x="108" y="44">a light switch</text>' +
        '<path class="lead" d="M174 162 L174 198"/><text x="150" y="212">one meter</text>' +
        '<text x="10" y="200">heat pump</text><text x="214" y="200">EV and charger</text>' +
        '<text class="lbl" x="292" y="150">wind farm</text><text x="292" y="164">' + W.windMW + ' MW, one site</text>';
    },
    S1: function () {
      return '<rect class="sky" x="0" y="0" width="400" height="230"/><rect class="ground" x="0" y="168" width="400" height="62"/>' +
        '<rect class="bound" x="14" y="34" width="290" height="186" rx="14"/><text class="lbl" x="24" y="52">Prairie Campus microgrid</text>' +
        // college
        '<rect class="wall" x="30" y="100" width="82" height="68"/><path class="roof" d="M24 102 L71 74 L118 102 Z"/>' +
        '<path class="col" d="M42 108 V164 M58 108 V164 M74 108 V164 M90 108 V164 M104 108 V164"/>' +
        '<text x="71" y="70" text-anchor="middle" class="mini">college</text>' +
        // hospital
        '<rect class="wall" x="126" y="84" width="74" height="84"/><path class="cross" d="M157 98 h12 v10 h10 v12 h-10 v10 h-12 v-10 h-10 v-12 h10 z"/>' +
        '<text x="138" y="80" class="mini">hospital</text>' +
        // co-op
        '<rect class="wall" x="212" y="120" width="58" height="48"/><path class="roof" d="M206 122 L241 102 L276 122 Z"/>' +
        '<text x="226" y="98" class="mini">co-op</text>' +
        // solar, battery, generator
        '<path class="panel" d="M28 196 L48 182 L76 182 L56 196 Z M78 196 L98 182 L126 182 L106 196 Z"/>' +
        '<rect class="bat" x="140" y="180" width="44" height="22" rx="3"/><text x="140" y="214" class="mini">battery</text>' +
        '<rect class="gen" x="196" y="182" width="36" height="20" rx="3"/><text x="192" y="214" class="mini">generator</text>' +
        '<text x="40" y="214" class="mini">solar</text>' +
        // the switch at the boundary and the host feeder
        '<path class="wire" d="M270 150 L304 150"/><circle class="sw" cx="304" cy="150" r="7"/><path class="swk" d="M300 153 L309 145"/>' +
        '<path class="wire" d="M311 150 L400 150"/><path class="pole" d="M340 150 V182 M372 150 V182"/>' +
        '<text class="lbl" x="314" y="138">switch:</text><text x="314" y="124" class="mini">can island</text>' +
        '<text x="316" y="200" class="mini">host feeder</text>' +
        // the S0 home next door
        '<rect class="wall" x="352" y="96" width="34" height="26"/><path class="roof" d="M348 98 L369 82 L390 98 Z"/>' +
        '<rect class="mark" x="342" y="74" width="54" height="54" rx="6"/><text x="396" y="68" text-anchor="end" class="mini">the S0 home</text>';
    },
    S2: function (W) {
      return '<rect class="map" x="0" y="0" width="400" height="230"/>' +
        '<ellipse class="zone z1" cx="88" cy="122" rx="76" ry="74"/><ellipse class="zone z2" cx="206" cy="108" rx="66" ry="70"/><ellipse class="zone z3" cx="322" cy="126" rx="70" ry="72"/>' +
        '<text class="lbl" x="44" y="60">West zone</text><text class="lbl" x="168" y="48">Central zone</text><text class="lbl" x="290" y="64">East zone</text>' +
        // transmission lines with towers
        '<path class="line" d="M96 132 L206 112 L318 130 M96 132 L318 130"/>' +
        '<path class="tower" d="M150 128 l-5 14 h10 z M262 126 l-5 14 h10 z"/>' +
        // plants
        '<g class="turb"><path d="M60 110 V86 M60 86 V74 M60 86 L71 92 M60 86 L49 92"/></g><g class="turb"><path d="M84 104 V82 M84 82 V70 M84 82 L95 88 M84 82 L73 88"/></g>' +
        '<rect class="plantb" x="196" y="78" width="22" height="20" rx="2"/><path class="stack" d="M212 78 V64"/>' +
        '<path class="panel" d="M318 98 L332 88 L352 88 L338 98 Z"/>' +
        // Prairie Town node, marked, and the operator
        '<circle class="node" cx="96" cy="132" r="7"/><rect class="mark" x="24" y="144" width="98" height="34" rx="6"/>' +
        '<text x="30" y="158" class="mini">Prairie Town</text><text x="30" y="171" class="mini">(S0 and S1 inside)</text>' +
        '<circle class="node" cx="206" cy="112" r="5"/><circle class="node" cx="318" cy="130" r="5"/>' +
        '<rect class="desk" x="164" y="176" width="84" height="30" rx="4"/><text x="172" y="195" class="mini">grid operator</text>' +
        '<text x="26" y="194" class="mini">yearly peak: ' + W.townPeakMW + ' MW</text>';
    },
    S3: function () {
      var blocks = "";
      for (var r = 0; r < 3; r++) for (var c = 0; c < 5; c++) blocks += '<rect class="blk" x="' + (122 + c * 34) + '" y="' + (58 + r * 34) + '" width="26" height="26" rx="2"/>';
      return '<rect class="map" x="0" y="0" width="400" height="230"/>' +
        '<path class="field" d="M300 168 L398 160 L398 228 L292 228 Z"/><path class="furrow" d="M306 178 L396 172 M304 192 L396 186 M300 206 L396 200 M298 220 L396 214"/>' +
        blocks +
        '<path class="heat" d="M134 70 H262 V130 H134 Z"/>' +
        '<path class="transit" d="M20 150 L120 150 L200 126 L300 126 L390 100"/><circle class="stop" cx="120" cy="150" r="4"/><circle class="stop" cx="200" cy="126" r="4"/><circle class="stop" cx="300" cy="126" r="4"/>' +
        '<rect class="sub" x="40" y="70" width="34" height="26" rx="3"/><path class="feeder" d="M74 80 L122 70 M74 86 L122 104 M74 92 L122 138"/>' +
        '<path class="fact" d="M24 196 V176 l14 -8 v8 l14 -8 v8 l14 -8 V196 Z"/><path class="fact" d="M80 196 V180 h26 V196 Z"/>' +
        '<rect class="dc" x="214" y="170" width="64" height="34" rx="3"/>' +
        '<text x="40" y="64" class="mini">substation</text><text x="24" y="212" class="mini">industrial park</text>' +
        '<text x="184" y="222" class="mini">data-center campus (a load)</text><text x="318" y="154" class="mini">farms</text>' +
        '<text x="300" y="116" class="mini">transit</text><text x="160" y="50" class="mini heatl">heat network</text>' +
        '<text class="lbl" x="8" y="24">Prairie City, about 250,000 people</text><text x="8" y="40" class="mini">inside the area of the Plains Grid</text>';
    },
    S4: function () {
      return '<rect class="sea" x="0" y="0" width="400" height="230"/>' +
        '<path class="reg r1" d="M40 40 L180 24 L330 34 L362 80 L250 94 L120 90 L38 86 Z"/>' +
        '<path class="reg r2" d="M38 86 L120 90 L130 160 L62 190 L30 140 Z"/>' +
        '<path class="reg r3" d="M120 90 L250 94 L240 164 L130 160 Z"/>' +
        '<path class="reg r4" d="M250 94 L362 80 L372 148 L300 170 L240 164 Z"/>' +
        '<path class="reg r5" d="M62 190 L130 160 L240 164 L300 170 L286 204 L150 212 L84 206 Z"/>' +
        '<path class="ridge" d="M44 128 L96 122 L102 164 L64 184 Z"/>' +
        '<path class="grid" d="M34 92 L246 98 L236 166 L128 164 L60 194 L28 140 Z"/>' +
        '<path class="ship" d="M332 206 h26 l-4 7 h-18 z"/><path class="route" d="M346 202 C330 192 310 190 292 194"/>' +
        '<path class="star" d="M184 118 l3 6 6.5 1 -4.7 4.5 1.1 6.5 -5.9 -3.1 -5.9 3.1 1.1 -6.5 -4.7 -4.5 6.5 -1 z"/>' +
        '<circle class="node" cx="214" cy="140" r="5"/><circle class="node" cx="84" cy="110" r="4"/>' +
        '<text class="lbl" x="150" y="62">North</text><text class="lbl" x="268" y="130">East</text><text class="lbl" x="150" y="194">South</text>' +
        '<text class="mini" x="196" y="110">capital</text><text class="mini" x="202" y="156">Prairie City</text><text class="mini" x="90" y="106">Prairie Town</text>' +
        '<text class="mini" x="40" y="204">Ridge County (coal)</text><text class="mini gridl" x="34" y="84">the Plains Grid</text>' +
        '<text class="mini" x="396" y="226" text-anchor="end">the strait: oil imports</text>';
    }
  };
  var SCENE_ALT = {
    S0: "A Prairie Town home with rooftop solar, lit windows, a meter, a heat pump, an electric car and its charger; on the ridge, the wind farm.",
    S1: "Prairie Campus inside a dashed microgrid boundary: a college, the county hospital, a co-op, solar, a battery and a generator; a switch at the boundary to the host feeder; the home next door marked.",
    S2: "The Plains Grid: three zones joined by transmission lines, with wind in the west, a gas plant in the center and solar in the east; Prairie Town is one node in the west; a grid operator's desk.",
    S3: "Prairie City, inside the area of the Plains Grid: blocks of buildings ringed by a heat network, a transit line, a substation with feeders, an industrial park, farms and a data-center campus as a large load.",
    S4: "Prairieland: five regions, coal-dependent Ridge County, the capital, Prairie City and Prairie Town, the Plains Grid's area outlined, and oil tankers arriving through a strait."
  };

  // ---- ScaleZoom: a powers-of-ten zoom through the five scenes (lesson-local component)
  function ScaleZoom(host, o) {
    var D = o.scales, W = o.anchors, w = H("div", { class: "f1z" }, host), cur = o.start || 0, seen = {};
    var rail = H("div", { class: "f1z-rail", role: "group", "aria-label": "Zoom level" }, w), btns = [];
    D.forEach(function (s, i) {
      var b = H("button", { type: "button", class: "f1z-stop", "aria-pressed": "false", "aria-label": s.id + ", " + s.name, style: "--c:" + scol(s) }, rail);
      H("span", { class: "c", text: s.id }, b); H("span", { class: "n", text: s.short }, b);
      b.addEventListener("click", function () { go(i); });
      btns.push(b);
    });
    var fig = H("figure", { class: "f1z-frame" }, w), svgBox = H("div", { class: "f1z-svg-box" }, fig);
    var cap = H("figcaption", { class: "f1z-cap", "aria-live": "polite" }, fig);
    var nav = H("div", { class: "f1z-nav" }, w);
    var bIn = H("button", { type: "button", class: "lx-btn ghost small", html: LX.icon("back") + "Zoom in" }, nav);
    var bOut = H("button", { type: "button", class: "lx-btn small", html: "Zoom out" + LX.icon("arrow") }, nav);
    var count = H("span", { class: "lx-hint" }, nav);
    bIn.addEventListener("click", function () { go(cur - 1); }); bOut.addEventListener("click", function () { go(cur + 1); });
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the zoom" }, alt);
    var ul = H("ul", null, alt);
    D.forEach(function (s) { H("li", { html: "<b>" + s.id + " · " + LX.esc(s.name) + "</b> (" + LX.esc(s.power) + "): " + LX.esc(SCENE_ALT[s.id]) + " " + LX.esc(power(s.id)) }, ul); });
    function power(id) {
      if (id === "S0") return "Electricity a U.S. home buys from its utility, as average power: about " + W.homeText + " (2022). The ridge's wind farm is " + W.windMW + " MW (illustrative).";
      if (id === "S2") return "Prairie Town's highest hour of the year needs " + W.townPeakMW + " MW (illustrative); the real Southwest Power Pool peaked at " + W.sppText + " in 2025.";
      if (id === "S4") return "The U.S. Lower 48 states' record hour needed " + W.usText + " (29 July 2025).";
      if (id === "S1") return "A campus or village: kilowatts to a few megawatts.";
      return "A city: hundreds of megawatts.";
    }
    function go(i, quiet) {
      i = LX.clamp(i, 0, D.length - 1);
      var dir = i > cur ? "out" : i < cur ? "in" : "";
      cur = i; seen[i] = true; var s = D[i];
      svgBox.innerHTML = '<svg class="f1z-svg ' + s.key + '" viewBox="0 0 400 230" role="img" aria-label="' + LX.esc(s.id + ", " + s.name + ": " + SCENE_ALT[s.id]) + '">' + SCENE[s.id](W) + "</svg>";
      if (dir && !LX.reduced()) { var sv = svgBox.firstChild; sv.classList.add("z-" + dir); requestAnimationFrame(function () { requestAnimationFrame(function () { sv.classList.remove("z-" + dir); }); }); }
      cap.innerHTML = "";
      var t = H("p", { class: "f1z-title", style: "--c:" + scol(s) }, cap); H("span", { class: "c", text: s.id }, t); H("b", { text: s.name }, t);
      H("p", { class: "f1z-set", text: s.setting }, cap);
      var ch = H("p", { class: "f1z-power" }, cap); H("span", { class: "lx-pill neutral", text: "Power: " + s.power }, ch); H("span", { text: power(s.id) }, ch);
      H("p", { class: "f1z-q", html: "<span>Its question</span> " + LX.esc(s.question) }, cap);
      if (s.gloss) H("p", { class: "f1z-gloss", html: LX.rich(s.gloss) }, cap);
      btns.forEach(function (b, k) { b.setAttribute("aria-pressed", k === i ? "true" : "false"); b.classList.toggle("seen", !!seen[k]); });
      var had = document.activeElement;
      bIn.disabled = i === 0; bOut.disabled = i === D.length - 1;
      if (had === bOut && bOut.disabled) bIn.focus({ preventScroll: true });   // keep keyboard focus on the nav row
      if (had === bIn && bIn.disabled) bOut.focus({ preventScroll: true });
      var n = Object.keys(seen).length;
      count.textContent = n < D.length ? "Scales visited: " + n + " of " + D.length + "." : "All five scales visited.";
      if (!quiet && o.onGo) o.onGo(i, n);
      LX.emit("layout");
    }
    (o.seen || []).forEach(function (k) { seen[k] = true; });
    go(cur, true);
    return { el: w, go: go, seen: function () { return Object.keys(seen).length; } };
  }

  function view(live, data, root) {
    var D = data.f01_five_scales, W = anchors(data), P = data.path, byId = {};
    D.scales.forEach(function (s) { byId[s.id] = s; });
    var log = LX.store.get("f1-log", {}) || {};
    function keep(k, v) { log[k] = v; LX.store.set("f1-log", log); }
    var placed = log.placed || {}, done = log.done || {}, zoomSeen = log.zoom || [], pred = null, apply = null;
    var scaleBins = D.scales.map(function (s) { return { id: s.id, label: s.id + " · " + s.short, sub: s.place, color: scol(s) }; });

    // one card round: tap a card, then a scale; Next opens once every card is placed and checked
    function round(key, act, api, bins, onCheck) {
      var R = D.rounds[key];
      var cs = LX.CardSort(act, { bins: bins || scaleBins, cards: R.cards, checkLabel: "Check my sort", maxWhy: 5,
        hint: "Tap a card, then tap the box it belongs in. Tap a placed card to move it.",
        onCheck: function (g) {
          placed[key] = JSON.parse(JSON.stringify(cs.placed())); keep("placed", placed);
          if (g.placed < g.total) { api.saw("Place every card first: " + (g.total - g.placed) + " still in the pool.", true); return; }
          done[key] = g.right; keep("done", done); api.done();
          onCheck(g);
          buildExplain(D, W, placed, P);
        } });
      if (placed[key]) cs.place(JSON.parse(JSON.stringify(placed[key])));
      if (done[key] != null) api.done();
      return cs;
    }

    var steps = [
      { text: "Each frame is a [[system-scale|scale]]: a view where different people make different decisions. Zoom from a Prairie Town light switch out to a whole nation, and visit all five.",
        build: function (act, api) {
          ScaleZoom(act, { scales: D.scales, anchors: W, seen: zoomSeen, start: 0, onGo: function (i, n) {
            if (zoomSeen.indexOf(i) < 0) { zoomSeen.push(i); keep("zoom", zoomSeen); }
            if (n === D.scales.length) { api.done(); api.saw(zoomDone(W)); }
          } });
          if (zoomSeen.length >= D.scales.length) api.done();
        } },
      { text: "A heat wave is pushing demand toward a record. Predict: who decides which power plants run in the next hour?",
        build: function (act, api) {
          LX.Predict(act, { id: D.predict.id, answer: D.predict.answer, fresh: true,
            lockText: "Locked in. The next step shows the answer.", options: D.predict.options,
            onPick: function (p) { pred = p; keep("pred", p); api.done(); } });
          if (pred) api.done();
        } },
      { text: "Who decides? Put each decision maker on its scale; a [[co-op|co-op]] is a utility owned by its members, and a [[tariff|tariff]] is the rule that sets a bill.",
        build: function (act, api) {
          round("who", act, api, null, function (g) {
            api.saw(feedback(D, "who", g, pred || log.pred), g.right < 3);
          });
        } },
      { text: "What does each one decide? Sort the decisions onto the scales; [[reserves|reserves]] are spare capacity kept ready for a sudden loss.",
        build: function (act, api) {
          round("what", act, api, null, function (g) { api.saw(feedback(D, "what", g), g.right < 3); });
        } },
      { text: "Models at each scale usually focus on different physics, such as a battery's [[state-of-charge|state of charge]] (the energy it holds) or a grid's [[inertia|inertia]]. Match each description to its scale.",
        build: function (act, api) {
          round("physics", act, api, null, function (g) { api.saw(feedback(D, "physics", g), g.right < 3); });
        } },
      { text: "The scales overlap, yet they pass messages. Each card names a sender and a receiver: is it a signal or a limit sent down to a smaller scale, or a profile or a need sent up?",
        build: function (act, api) {
          var bins = D.rounds.exchange.bins.map(function (b) { return { id: b.id, label: b.label, sub: b.sub, color: b.id === "down" ? "var(--lx-scale-4)" : "var(--lx-scale-0)" }; });
          round("exchange", act, api, bins, function (g) { api.saw(feedback(D, "exchange", g), g.right < 4); });
        } },
      { text: "Each scale asks “" + D.rounds.battery.question + "” in its own way. Match each version to its scale.",
        build: function (act, api) {
          round("battery", act, api, null, function (g) { api.saw(feedback(D, "battery", g), g.right < 3); });
        } },
      { text: D.apply.q,
        build: function (act, api) {
          var p = LX.Predict(act, { id: D.apply.id, answer: D.apply.answer, fresh: true, options: D.apply.options, feedback: D.apply.feedback,
            onPick: function (v) {
              apply = v; keep("apply", v); p.reveal(v === D.apply.answer ? "Modeler lesson [[lesson:m05-microgrid-size-and-run|M5]] solves exactly this campus." : "");
              if (v === D.apply.answer) { api.done(); LX.progress.done(LESSON); }
            }, once: false });
        } }
    ];
    var cards = LX.StepCards(live, { id: "f1-steps", steps: steps });

    // demo states: "step-N" opens step N with its action done; "mid" = the "who decides" sort, placed and checked
    LX.demo(root, function (state) {
      var n = state === "mid" ? 3 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var i = Math.max(0, Math.min(steps.length - 1, n - 1)), keys = [null, null, "who", "what", "physics", "exchange", "battery"];
      zoomSeen = [0, 1, 2, 3, 4]; pred = "S0";
      var k = keys[i];
      if (k) {   // a reference sort with one card in the wrong box, so the reasons show
        var m = {}; D.rounds[k].cards.forEach(function (c) { m[c.id] = c.bin; });
        var first = D.rounds[k].cards[0], other = D.rounds[k].cards[1]; m[first.id] = other.bin;
        placed[k] = m; delete done[k];
      }
      cards.go(i);
      var click = function (sel, j) { var b = cards.el.querySelectorAll(sel)[j || 0]; if (b) b.click(); };
      if (i === 0) click(".f1z-stop", 2);
      if (i === 1) click(".lx-choice", 2);
      if (k) click(".lx-cs .lx-step-foot .lx-btn");
      if (i === 7) click(".lx-choice", 1);
      return { view: "step " + (i + 1) };
    }, cards);
    buildExplain(D, W, placed, P);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, W, placed, P) {
    var host = document.getElementById("f1-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var res = ladder(D, placed), c1 = H("div", { class: "lx-xcard" }, host);
    LX.ScaleStrip(c1, { title: "Five scales at a glance", scales: D.scales, power: true, flow: true, ticks: res, lessons: D.lessons, path: P,
      lede: "Each scale has its own decision makers; your sorts are ticked on each one. Signals and limits usually pass down, profiles and needs up." });
    var c2 = H("div", { class: "lx-xcard" }, host);
    LX.CompareTable(c2, {
      title: "What sets each scale apart", text: true,
      columns: [{ key: "name", label: "Scale", main: true }, { key: "who", label: "Who decides" }, { key: "what", label: "What they decide" },
                { key: "physics", label: "What a model usually focuses on" }, { key: "inputs", label: "Takes in from other scales" }, { key: "outputs", label: "Passes on" }],
      rows: D.scales.map(function (s) { return { key: s.id, color: scol(s), name: s.id + " · " + s.name, note: s.power, who: s.who, what: s.what, physics: s.physics, inputs: s.inputs, outputs: s.outputs }; }),
      caption: "Read across a row for one scale; read down a column to see one question change with scale."
    });
    var c3 = H("div", { class: "lx-xcard" }, host), h3 = H("header", { class: "lx-x-head" }, c3);
    H("h3", { text: "The campus's best plan and the grid's" }, h3);
    H("p", { class: "lx-lede", html: LX.rich(D.optimum) }, c3);
  }

  LX.mount("five-scales", function (live, data, root) { view(live, data, root); });
})();
