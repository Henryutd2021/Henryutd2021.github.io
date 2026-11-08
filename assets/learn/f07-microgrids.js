// f07-microgrids.js — Lesson F7, "What is a microgrid? From a hospital that keeps its lights on to a village with no grid"
// (Foundations, step cards).
//
// Data: assets/learn/data/f07-microgrids.json (Prairie Campus and the village, both fictional and illustrative; real 2025
// solar shapes from SPP, scaled per kW of panels as the data file's "about" says) and data/path.json (lesson links).
//
// The campus island (closed form, one rule, hour by hour over a 72-hour outage that starts at midnight):
//   solar_t   = solarKW × shape_t                         kW the panels make in hour t (they run only inside a live island)
//   need_t    = kept load − solar_t                       kW still needed (below 0: spare sun)
//   gen_t     = min(need_t, genKW, fuel left)             the generator runs first while it has fuel
//   bat_t     = min(need_t − gen_t, batKW, stored)        the battery gives the rest, up to its power and its energy
//   short_t   = need_t − gen_t − bat_t                    kW the island cannot carry: the kept loads must shrink
//   spare sun charges the battery: stored += min(spare, batKW, room / eff) × eff (eff: the share of a charge it gives back)
//   lasts     = the number of hours before the first short hour (72 when it rides through)
// The battery starts full; the fuel holds fuelHours at full generator power. Power (kW) sets what the island can carry at
// one moment; stored energy and fuel (kWh) set for how long.
//
// The village (closed form): 60 households and a grain mill, an average day repeated until the battery's level at
// midnight settles (30 days): the sun first, the battery for the rest (no power limit in this toy), the battery charged
// from spare sun with the same eff. "Every hour served" = no short hour on the settled day.
// Every number on the page is checked by _tests/learn/test_f07-microgrids.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var HOURS = 72;
  function keptKW(C, keep) { return C.loads.reduce(function (s, l) { return s + (keep[l.key] ? l.kw : 0); }, 0); }
  function totalKW(C) { return C.loads.reduce(function (s, l) { return s + l.kw; }, 0); }
  function nightKW(C) { return C.battery.kw + C.gen.kw; }
  function fuelKWh(C) { return C.gen.kw * C.gen.fuelHours; }
  // the island over the outage window; opts.batKWh overrides the battery's energy (the myth about doubling it)
  function island(C, keep, season, opts) {
    opts = opts || {};
    var load = keptKW(C, keep), sh = C.windows[season].solar, B = C.battery, cap = opts.batKWh == null ? B.kwh : opts.batKWh;
    var stored = cap, fuel = fuelKWh(C), first = null, shortKWh = 0, rows = [];
    for (var t = 0; t < HOURS; t++) {
      var solar = C.solarKW * sh[t], need = load - solar, gen = 0, bat = 0, charge = 0, spill = 0, short = 0, used = Math.min(load, solar);
      if (need <= 0) {
        charge = Math.min(-need, B.kw, (cap - stored) / B.eff); stored += charge * B.eff; spill = -need - charge;
      } else {
        gen = Math.min(need, C.gen.kw, fuel); fuel -= gen;
        bat = Math.min(need - gen, B.kw, stored); stored -= bat;
        short = need - gen - bat;
        if (short < 1e-9) short = 0;
      }
      if (short > 0) { shortKWh += short; if (first === null) first = t; }
      rows.push({ t: t, load: load, solar: solar, used: used, gen: gen, bat: bat, charge: charge, spill: spill, short: short, stored: stored, fuel: fuel });
    }
    return { load: load, rows: rows, lasts: first === null ? HOURS : first, full: first === null, shortKWh: shortKWh, fuelLeft: fuel, stored: stored };
  }
  // what the switch, the grid and the island-forming source leave live (the one-line diagram's state)
  function liveState(s) {
    var live = s.sw === "closed" ? !!s.grid : (s.former === "battery" || s.former === "gen");
    return { live: live, island: s.sw === "open" && live, solarOn: live };
  }
  // the loads the island must keep (critical) and a set of kept loads checked against them and the night's power:
  // "critical" (a critical load is off), "over" (more kW than the battery and generator give at night) or "ok"
  function criticalKeys(C) { return C.loads.filter(function (l) { return l.critical; }).map(function (l) { return l.key; }); }
  function keepStatus(C, keep) {
    if (criticalKeys(C).some(function (k) { return !keep[k]; })) return "critical";
    return keptKW(C, keep) > nightKW(C) ? "over" : "ok";
  }
  // the diagram's word for each part: connected (switched in) is not the same as supplied. In an island the kept loads are
  // supplied at the outage's start only when they fit the night's power (battery plus generator); the run then says for
  // how long. Solar makes power only when the sun shines; the battery and the generator both run in a live island.
  function partWords(C, s, k) {
    var L = liveState(s), load = C.loads.filter(function (l) { return l.key === k; })[0];
    if (load) {
      if (s.sw === "closed") return L.live ? "lit by the grid" : "dark";
      if (!L.live) return "dark";
      if (!s.keep[k]) return "shed";
      return keptKW(C, s.keep) > nightKW(C) ? "connected, but the island cannot carry every connected load" : "connected and supplied";
    }
    if (k === "solar") return L.live ? "on, making power only when the sun shines" : "off";
    if (k === "battery") return L.island ? (s.former === "battery" ? "forming the island" : "running") : L.live ? "ready" : "idle";
    if (k === "gen") return L.island ? (s.former === "gen" ? "forming the island" : "running") : "off";
    if (k === "feeder") return s.grid ? "live" : "down (storm)";
    if (k === "switch") return s.sw === "closed" ? "closed" : "open";
    return "on";
  }
  // a load drawn as lit: supplied by the grid, or kept inside an island that can carry all its kept loads at night
  function loadLit(C, s, k) { var w = partWords(C, s, k); return w === "lit by the grid" || w === "connected and supplied"; }

  // the January step: the predicted answer, the feedback for each choice and the result line, from the two runs
  function winter(C, keep) {
    var jul = island(C, keep, "jul"), jan = island(C, keep, "jan");
    var ans = jan.lasts < jul.lasts ? "short" : jan.lasts > jul.lasts ? "long" : "same";
    var charged = function (r) { return r.rows.some(function (h) { return h.charge > 0.5; }); }, cj = charged(jul), cn = charged(jan);
    var hrs = function (r) { return r.full ? "all 72 hours" : r.lasts + " hours"; };
    var why = "weaker sun leaves more load to the generator and battery";
    var fb = ans === "short" ? { short: "Yes: " + why + ".", same: "January's " + why + ", so the hours differ.", long: "January's sun is weaker, not stronger." } :
             ans === "same" ? { short: "Not here: both runs last " + hrs(jan) + ".", same: "Yes: both runs last " + hrs(jan) + ".", long: "Not here: both runs last " + hrs(jan) + "." } :
                              { short: "Not here: January lasts " + hrs(jan) + ", July " + hrs(jul) + ".", same: "Not here: January lasts " + hrs(jan) + ", July " + hrs(jul) + ".", long: "Yes: January lasts " + hrs(jan) + ", July " + hrs(jul) + "." };
    var refill = cj && !cn ? " Only July had spare sun to recharge the battery." : cj && cn ? " Spare sun recharged the battery in both runs." : "";
    var line = "**" + kw(jan.load) + " " + lastsText(jan) + " in January**, against " + hrs(jul) + " in July" +
      (ans === "short" ? ": " + why + "." + refill + " The microgrid is weaker in winter." :
       ans === "same" ? ": the battery and fuel ran out before the sun could make a difference." : "." + refill);
    return { jul: jul, jan: jan, answer: ans, feedback: fb, line: line, charged: { jul: cj, jan: cn } };
  }

  // the village: one day's load in kW per hour (households plus the mill at its hours)
  function villageLoad(V, mill) {
    var L = V.householdW.map(function (w) { return w * V.households / 1000; });
    if (mill) V.mill[mill].forEach(function (h) { L[h] += V.mill.kw; });
    return L;
  }
  // the settled average day for kw of panels and kwh of battery
  function villageDay(V, kw, kwh, mill) {
    var L = villageLoad(V, mill), stored = kwh / 2, rows, startLevel = stored, d;
    for (d = 0; d < 30; d++) {
      startLevel = stored; rows = [];
      for (var h = 0; h < 24; h++) {
        var sun = kw * V.sun[h], need = L[h] - sun, direct = Math.min(L[h], sun), bat = 0, charge = 0, spill = 0, short = 0;
        if (need <= 0) { charge = kwh > 0 ? Math.min(-need, (kwh - stored) / V.eff) : 0; stored += charge * V.eff; spill = -need - charge; }
        else { bat = Math.min(need, stored); stored -= bat; short = need - bat; if (short < 1e-9) short = 0; }
        rows.push({ h: h, load: L[h], sun: sun, direct: direct, bat: bat, charge: charge, spill: spill, short: short, stored: stored });
      }
    }
    var sum = function (k) { return rows.reduce(function (s, r) { return s + r[k]; }, 0); };
    var load = sum("load"), short = sum("short");
    return { rows: rows, load: load, short: short, spill: sum("spill"), served: 1 - short / load, ok: short < 1e-6,
             shortHours: rows.filter(function (r) { return r.short > 0; }).length, settled: Math.abs(stored - startLevel) < 1e-6 };
  }
  function batteryChoices(V) { var a = []; for (var b = V.battery.min; b <= V.battery.max + 1e-9; b += V.battery.step) a.push(b); return a; }
  function panelChoices(V) { var a = []; for (var p = V.panels.min; p <= V.panels.max + 1e-9; p += V.panels.step) a.push(p); return a; }
  // the smallest battery on the slider that serves every hour with kw of panels (null: none does)
  function minBattery(V, kw, mill) {
    var B = batteryChoices(V);
    for (var i = 0; i < B.length; i++) if (villageDay(V, kw, B[i], mill).ok) return B[i];
    return null;
  }
  // the fewest panels on the slider that can serve every hour with some battery, and the smallest battery with them
  function smallest(V, mill) {
    var P = panelChoices(V);
    for (var i = 0; i < P.length; i++) { var b = minBattery(V, P[i], mill); if (b !== null) return { kw: P[i], kwh: b }; }
    return null;
  }
  // step 8: which part of the smallest design grows when the mill moves from midday to the evening, and the feedback
  function millMove(V) {
    var n = smallest(V, "noon"), e = smallest(V, "evening");
    var p = e.kw > n.kw, b = e.kwh > n.kwh, ans = p && b ? "both" : p ? "panels" : b ? "battery" : "neither";
    var was = kw(n.kw) + " and " + kwh(n.kwh), now = kw(e.kw) + " and " + kwh(e.kwh);
    var fb = {};
    ["panels", "battery", "both", "neither"].forEach(function (k) {
      fb[k] = k === ans ? "Yes: the smallest design goes from " + was + " to " + now + (b ? "; after sunset only the battery can run the mill." : ".") :
        k === "neither" ? "The smallest midday design, " + was + ", falls short once the mill runs in the evening." :
        "The smallest design goes from " + was + " to " + now + ": the day's energy is the same; what changes is when it is used.";
    });
    return { noon: n, evening: e, answer: ans, feedback: fb };
  }
  // the village's flowchart trace, from the reader's design (q3 is always yes here: the toy gives the battery no power limit)
  // (own: the reader's design; otherwise the smallest design with the mill at midday stands in, and the text says so)
  function villageTrace(V, kwp, kwhb, mill, own) {
    if (!own) { var s = smallest(V, "noon"); kwp = s.kw; kwhb = s.kwh; mill = "noon"; }
    var r = villageDay(V, kwp, kwhb, mill), t = kw(kwp) + " of panels and " + kwh(kwhb) + ", the mill " + (mill === "evening" ? "in the evening" : "at midday");
    return { path: ["q2", "q3", "q4", r.ok ? "ok" : "lasts"], label: own ? "The village, your design" : "The village",
             text: (own ? "Your village, " : "The smallest design, ") + t + ": " + (r.ok ? "every hour of an average day served." : "short in " + r.shortHours + " hours of an average day, so some loads go dark.") +
               " The toy tests stored energy only, on one average day." };
  }

  function kw(v) { return Math.round(v).toLocaleString("en-US") + " kW"; }
  function kwh(v) { return Math.round(v).toLocaleString("en-US") + " kWh"; }
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  function pct(v) { return (Math.floor(v * 1000 + 1e-9) / 10).toFixed(1).replace(/\.0$/, "") + "%"; }
  // the campus result in words (step 5, step 6, the explain layer)
  function lastsText(r) { return r.full ? "rode through all 72 hours" : "lasted " + r.lasts + " hours"; }

  // ---------------------------------------------------------------- no-JS blocks (the test's --write mode writes them)
  function rich(t) {
    // glossary marks to spans (the attribute is built in pieces so the build's term scanner does not read "$1" as an id)
    return String(t).replace(/&(?!amp;|lt;|gt;)/g, "&amp;").replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) {
      return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>";
    });
  }
  function keepOf(C, keys) { var k = {}; C.loads.forEach(function (l) { k[l.key] = keys.indexOf(l.key) >= 0; }); return k; }
  function names(C, keys) { var n = C.loads.filter(function (l) { return keys.indexOf(l.key) >= 0; }).map(function (l) { return l.words; }); return n.length < 2 ? n.join("") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; }
  // the cases the page states: three loads kept, and the two critical loads alone
  function cases(C) {
    return [["hospital", "water", "dorms"], ["hospital", "water"]].map(function (keys) {
      var k = keepOf(C, keys);
      return { keys: keys, keep: k, kw: keptKW(C, k), jul: island(C, k, "jul"), jan: island(C, k, "jan"), jul2: island(C, k, "jul", { batKWh: 2 * C.battery.kwh }) };
    });
  }
  function staticSteps(D) {
    var C = D.campus, V = D.village, X = cases(C), v0 = smallest(V, null), vn = smallest(V, "noon"), ve = smallest(V, "evening");
    var rows = C.loads.map(function (l) { return "<tr><td>" + l.label + "</td><td>" + kw(l.kw) + "</td><td>" + (l.critical ? "critical" : "can be shed") + "</td></tr>"; }).join("");
    var hours = function (r) { return r.full ? "all 72 hours" : r.lasts + " hours"; };
    return "<p class=\"lx-eyebrow\">" + C.name + " in a storm, and a village with no grid (illustrative)</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table f7-fb\"><caption class=\"lx-hint\">The campus's loads; its sources: " + kw(C.solarKW) + " of solar, a " + kw(C.battery.kw) + " battery holding " + kwh(C.battery.kwh) + ", a " + kw(C.gen.kw) + " generator with fuel for " + C.gen.fuelHours + " hours at full power.</caption>" +
      "<thead><tr><th scope=\"col\">Load</th><th scope=\"col\">Power</th><th scope=\"col\">In an outage</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      "<ul><li>Ordinary grid-connected solar switches off when the grid fails. The battery's " + rich("[[grid-forming|grid-forming]]") + " inverter, or the generator, can form an island.</li>" +
      "<li>At night the island can give " + kw(nightKW(C)) + " (battery plus generator); the campus draws " + kw(totalKW(C)) + ", so some loads must be shed. The hospital and the water plant must stay on.</li>" +
      X.map(function (x) { return "<li>Keeping " + names(C, x.keys) + " (" + kw(x.kw) + "): " + hours(x.jul) + " from midnight on " + C.windows.jul.first + ", " + hours(x.jan) + " from midnight on " + C.windows.jan.first + ".</li>"; }).join("") + "</ul>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table f7-fb\"><caption class=\"lx-hint\">The village's smallest designs on the sliders, for an average day. " + D.texts.villageToy + "</caption>" +
      "<thead><tr><th scope=\"col\">The village</th><th scope=\"col\">Panels</th><th scope=\"col\">Battery</th></tr></thead><tbody>" +
      [[V.households + " households alone", v0], ["With the mill at 10:00–14:00", vn], ["With the mill at 18:00–22:00", ve]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + kw(r[1].kw) + "</td><td>" + kwh(r[1].kwh) + "</td></tr>"; }).join("") +
      "</tbody></table></div>";
  }
  function staticExplain(D) {
    var C = D.campus, X = cases(C)[0];
    var ideas = [
      ["A microgrid", "Loads and sources inside one boundary, run as one unit by a controller, that can island: open its switch and run on its own."],
      ["Forming an island", "A " + rich("[[grid-forming|grid-forming]]") + " source, such as a battery's " + rich("[[inverter|inverter]]") + " or a generator, sets " + rich("[[voltage|voltage]]") + " and " + rich("[[frequency|frequency]]") + "; ordinary solar inverters follow it."],
      ["Power, then energy", "Power (kW) decides which loads the island can carry at once; stored energy and fuel (kWh) decide for how long."],
      ["Seasons", "The same campus kept " + kw(X.kw) + " for " + X.jul.lasts + " hours in July and " + X.jan.lasts + " in January: weaker sun leaves more of the load to the generator and battery, so their energy runs out sooner."],
      ["No grid at all", "A village " + rich("[[mini-grid|mini-grid]]") + " runs as an island every day; running big loads while the sun shines keeps its battery small."]
    ];
    return "<dl class=\"lx-ideas\">" + ideas.map(function (i) { return "<dt>" + i[0] + "</dt><dd>" + i[1] + "</dd>"; }).join("") + "</dl>" +
      "<p class=\"lx-eyebrow\">The parts of a microgrid</p><ol class=\"f7-notes\">" + D.parts.map(function (p) { return "<li><b>" + p.name + ".</b> " + rich(p.note) + "</li>"; }).join("") + "</ol>" +
      "<p class=\"lx-eyebrow\">" + D.kinds.title + "</p><div class=\"lx-scroll-x\"><table class=\"lx-mini-table f7-fb\"><caption class=\"lx-hint\">" + D.kinds.caption + "</caption><thead><tr>" +
      D.kinds.columns.map(function (c) { return "<th scope=\"col\">" + c.label + "</th>"; }).join("") + "</tr></thead><tbody>" +
      D.kinds.rows.map(function (r) { return "<tr>" + D.kinds.columns.map(function (c) { return "<td>" + r[c.key] + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function staticMyth(D) {
    var C = D.campus, X = cases(C)[1];
    return "<div class=\"lx-qq\" data-id=\"double\" data-answer=\"myth\">\n<p class=\"lx-qtext\">Myth or fact? “Doubling the battery doubles how long the hospital stays lit.”</p>\n" +
      "<ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul>\n" +
      "<details class=\"lx-answer\"><summary>Answer</summary><p>Myth. Keeping the hospital and the water plant from midnight on " + C.windows.jul.first + ", " + kwh(C.battery.kwh) + " lasts " + X.jul.lasts + " hours and " + kwh(2 * C.battery.kwh) + " lasts " + X.jul2.lasts + ": the fuel and the sun set the rest.</p></details>\n</div>";
  }
  function staticSort(D) {
    var bin = {}; D.sort.bins.forEach(function (b) { bin[b.id] = b.label; });
    return "<ul>" + D.sort.cards.map(function (c) { return "<li>" + c.text + "</li>"; }).join("") + "</ul>" +
      "<details class=\"lx-answer\"><summary>Answers</summary><ul>" + D.sort.cards.map(function (c) { return "<li><b>" + bin[c.bin] + ":</b> " + c.text.charAt(0).toLowerCase() + c.text.slice(1) + ". " + c.why + "</li>"; }).join("") + "</ul></details>";
  }
  function staticFacts(D) {
    return D.facts.map(function (f) { return "<tr><td class=\"n\">" + f.n + "</td><td>" + f.what + "</td><td class=\"s\"><a href=\"" + f.url + "\">" + f.source + "</a> · " + f.asof + "</td></tr>"; }).join("\n");
  }

  var model = { HOURS: HOURS, cases: cases, staticSteps: staticSteps, staticExplain: staticExplain, staticMyth: staticMyth, staticSort: staticSort, staticFacts: staticFacts, rich: rich, keptKW: keptKW, totalKW: totalKW, nightKW: nightKW, fuelKWh: fuelKWh, island: island, liveState: liveState,
                criticalKeys: criticalKeys, keepStatus: keepStatus, partWords: partWords, loadLit: loadLit, winter: winter, millMove: millMove, villageTrace: villageTrace,
                villageLoad: villageLoad, villageDay: villageDay, minBattery: minBattery, smallest: smallest, batteryChoices: batteryChoices,
                panelChoices: panelChoices, kw: kw, kwh: kwh, int: int, pct: pct, lastsText: lastsText };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S, KEY = "f07_microgrids";
  var COLOR = { solar: "var(--lx-solar)", battery: "var(--lx-bat)", gen: "var(--lx-pk)", short: "var(--lx-bad)", load: "var(--lx-ink)" };
  var SRC = ["solar", "battery", "gen"];

  // The campus one-line diagram: feeder, switch (point of common coupling), controller, three sources and four loads.
  // Every part is a button (Enter or Space); numbered: true adds a number to each part (the explain layer's notes).
  function CampusLine(host, C, P, o) {
    o = o || {};
    var fig = H("figure", { class: "f7-line" + (o.numbered ? " numbered" : "") }, host);
    var box = H("div", { class: "f7-line-box" }, fig);
    var cap = H("figcaption", { class: "f7-line-cap", "aria-live": "polite" }, fig);
    var alt = H("details", { class: "lx-textalt" }, fig); H("summary", { text: "Text version of the diagram" }, alt);
    var altBody = H("ul", {}, alt);
    var st = { grid: true, sw: "closed", former: null, keep: {}, pick: null, storm: false };
    C.loads.forEach(function (l) { st.keep[l.key] = true; });
    var order = ["feeder", "switch", "controller"].concat(SRC, C.loads.map(function (l) { return l.key; }));
    var num = {}; order.forEach(function (k, i) { num[k] = i + 1; });
    var load = {}; C.loads.forEach(function (l) { load[l.key] = l; });
    var lastNarrow = null;

    function layout(narrow) {
      if (!narrow) {
        var xs = [262, 340, 418, 520, 598, 676, 754];   // sources, a gap, then loads
        var at = {}; SRC.concat(C.loads.map(function (l) { return l.key; })).forEach(function (k, i) { at[k] = [xs[i], 146]; });
        return { vb: [0, 0, 790, 214], feeder: [8, 52, 104], sw: [104, 148, 52], bus: [[148, 52], [780, 52]], ctrl: [140, 82, 92, 28], at: at, drops: function (k) { return [[at[k][0], 52], [at[k][0], at[k][1] - 22]]; } };
      }
      var at2 = { solar: [150, 126], battery: [220, 126], gen: [290, 126] }, lx = [60, 140, 220, 300];
      C.loads.forEach(function (l, i) { at2[l.key] = [lx[i], 272]; });
      return { vb: [0, 0, 340, 330], feeder: [6, 40, 62], sw: [62, 98, 40], bus: [[98, 40], [330, 40], [330, 206], [40, 206]], ctrl: [6, 76, 92, 26], at: at2,
               drops: function (k) { var a = at2[k]; return a[1] > 200 ? [[a[0], 206], [a[0], a[1] - 22]] : [[a[0], 40], [a[0], a[1] - 22]]; } };
    }
    // lit: a load the grid or the island supplies (partWords: connected is not the same as supplied); a running source
    function lit(k) {
      var L = liveState(st);
      if (load[k]) return loadLit(C, st, k);
      if (k === "solar") return L.solarOn;
      if (k === "battery") return L.live;
      if (k === "gen") return L.island;
      if (k === "feeder") return !!st.grid;
      if (k === "switch") return st.sw === "closed";
      if (k === "controller") return true;
      return false;
    }
    function over(k) { return !!load[k] && liveState(st).island && !!st.keep[k] && !loadLit(C, st, k); }
    function label(k) { return k === "solar" ? "Solar" : k === "battery" ? "Battery" : k === "gen" ? "Generator" : load[k] ? load[k].short : k; }
    function sizeOf(k) {
      if (k === "solar") return kw(C.solarKW); if (k === "battery") return kw(C.battery.kw) + " · " + kwh(C.battery.kwh);
      if (k === "gen") return kw(C.gen.kw); return load[k] ? kw(load[k].kw) : "";
    }
    function partState(k) { return partWords(C, st, k); }
    function icon(g, k, x, y) {
      var ic = { solar: "sun", battery: "battery", gen: "flame" }[k] || (load[k] && load[k].icon === "plus" ? null : load[k] && load[k].icon) || "bolt";
      if (load[k] && load[k].icon === "plus") { S("path", { d: "M" + (x - 6) + " " + y + "h12M" + x + " " + (y - 6) + "v12", class: "f7-plus" }, g); return; }
      LX.iconInto(g, ic, x, y, 20);
    }
    function draw() {
      var narrow = box.clientWidth > 0 && box.clientWidth < 520;
      lastNarrow = narrow;
      var Lo = layout(narrow), L = liveState(st);
      box.innerHTML = "";
      var svg = S("svg", { viewBox: Lo.vb.join(" "), class: "f7-svg", role: "group", "aria-label": "One-line diagram of " + C.name + ": the utility feeder, the switch to the grid, the controller, three sources and four loads" }, box);
      // wires
      var live = L.live;
      S("path", { d: "M" + Lo.feeder[0] + " " + Lo.feeder[1] + " H" + Lo.feeder[2], class: "f7-wire" + (st.grid ? " on" : " off") }, svg);
      if (!st.grid) S("path", { d: "M" + (Lo.feeder[0] + 30) + " " + (Lo.feeder[1] - 10) + " l8 10 -6 0 8 10", class: "f7-bolt" }, svg);
      S("path", { d: Lo.bus.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + p[1]; }).join(" "), class: "f7-wire bus" + (live ? " on" : " off") }, svg);
      Object.keys(Lo.at).forEach(function (k) {
        var d = Lo.drops(k), on = live && (load[k] ? lit(k) || over(k) : k === "solar" ? L.solarOn : k === "battery" ? true : L.island);
        S("path", { d: "M" + d[0][0] + " " + d[0][1] + " V" + d[1][1], class: "f7-wire drop" + (on ? " on" : " off") }, svg);
      });
      // parts as buttons
      function part(k, draw1, aria) {
        var g = S("g", { class: "f7-part" + (st.pick === k ? " picked" : "") + (lit(k) ? " is-lit" : ""), role: "button", tabindex: "0", "aria-label": aria, "data-part": k }, svg);
        draw1(g);
        if (o.numbered) {
          var bb = { feeder: [Lo.feeder[0] + 10, Lo.feeder[1] + 16], switch: [Lo.sw[1] + 10, Lo.sw[2] - 12], controller: [Lo.ctrl[0] + Lo.ctrl[2] - 2, Lo.ctrl[1] + 2] }[k] || [Lo.at[k][0] + 27, Lo.at[k][1] - 10];
          S("circle", { cx: bb[0], cy: bb[1], r: 8, class: "f7-num" }, g); S("text", { x: bb[0], y: bb[1] + 4, class: "f7-numt", "text-anchor": "middle" }, g).textContent = num[k];
        }
        function act() { st.pick = k; if (o.onPick) o.onPick(k); draw(); var again = box.querySelector('[data-part="' + k + '"]'); if (again) again.focus(); }
        g.addEventListener("click", act);
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      }
      part("feeder", function (g) {
        S("rect", { x: Lo.feeder[0] - 4, y: Lo.feeder[1] - 14, width: Lo.feeder[2] - Lo.feeder[0], height: 28, class: "f7-hit" }, g);
        S("text", { x: Lo.feeder[0], y: Lo.feeder[1] - 18, class: "f7-t" }, g).textContent = "Grid feeder";
      }, "Utility feeder, " + partState("feeder"));
      part("switch", function (g) {
        var a = Lo.sw[0], b = Lo.sw[1], y = Lo.sw[2];
        S("rect", { x: a - 4, y: y - 18, width: b - a + 8, height: 34, class: "f7-hit" }, g);
        S("circle", { cx: a + 4, cy: y, r: 4, class: "f7-term" }, g); S("circle", { cx: b - 4, cy: y, r: 4, class: "f7-term" }, g);
        S("path", { d: st.sw === "closed" ? "M" + (a + 4) + " " + y + " L" + (b - 4) + " " + y : "M" + (a + 4) + " " + y + " L" + (b - 8) + " " + (y - 16), class: "f7-blade" }, g);
        S("text", { x: (a + b) / 2, y: y + 24, class: "f7-t small", "text-anchor": "middle" }, g).textContent = st.sw === "closed" ? "Switch" : "Open";
      }, "Switch to the grid (point of common coupling), " + partState("switch"));
      part("controller", function (g) {
        var c = Lo.ctrl;
        S("rect", { x: c[0], y: c[1], width: c[2], height: c[3], rx: 6, class: "f7-ctrl" }, g);
        S("text", { x: c[0] + c[2] / 2, y: c[1] + c[3] / 2 + 4, class: "f7-t small", "text-anchor": "middle" }, g).textContent = "Controller";
      }, "Microgrid controller");
      Object.keys(Lo.at).forEach(function (k) {
        var a = Lo.at[k];
        part(k, function (g) {
          S("circle", { cx: a[0], cy: a[1], r: 20, class: "f7-node " + (load[k] ? "load" : "src " + k) + (lit(k) ? " on" : "") + (over(k) ? " over" : "") }, g);
          icon(g, k, a[0], a[1]);
          S("text", { x: a[0], y: a[1] + 36, class: "f7-t", "text-anchor": "middle" }, g).textContent = label(k);
          S("text", { x: a[0], y: a[1] + 51, class: "f7-t small", "text-anchor": "middle" }, g).textContent = load[k] ? kw(load[k].kw) : k === "battery" ? kwh(C.battery.kwh) : sizeOf(k);
          if (load[k] && load[k].critical) S("text", { x: a[0], y: a[1] - 26, class: "f7-t crit", "text-anchor": "middle" }, g).textContent = "critical";
        }, label(k) + ", " + sizeOf(k) + (load[k] && load[k].critical ? ", critical load" : "") + ", " + partState(k));
      });
      cap.innerHTML = LX.rich(caption());
      altBody.innerHTML = "";
      order.forEach(function (k) {
        var nm = { feeder: "Utility feeder", switch: "Switch to the grid (point of common coupling)", controller: "Controller" }[k] || label(k);
        H("li", { text: (o.numbered ? num[k] + ". " : "") + nm + (sizeOf(k) ? " (" + sizeOf(k) + ")" : "") + ": " + partState(k) + "." }, altBody);
      });
    }
    function caption() {
      var L = liveState(st);
      if (st.grid && st.sw === "closed") return "Grid on, switch closed: the grid and the campus's own solar carry every load.";
      if (st.sw === "closed") return "Grid down, switch closed: the whole campus is dark, its solar too.";
      if (!L.live) return st.former === "solar" ? "Switch open: the solar inverters have no voltage to follow, so the island stays dark." : "Switch open, and nothing has formed the island yet: dark.";
      var on = C.loads.filter(function (l) { return st.keep[l.key]; }), off = C.loads.filter(function (l) { return !st.keep[l.key]; });
      var said = function (a) { return names(C, a.map(function (l) { return l.key; })); }, k = keptKW(C, st.keep), fits = k <= nightKW(C);
      return "Island formed by the " + (st.former === "battery" ? "battery, with the generator" : "generator, with the battery") + ": " +
        (on.length ? said(on) + " connected (" + kw(k) + "), " + (fits ? "within" : "more than") + " the " + kw(nightKW(C)) + " the two give at night" : "no loads kept") +
        (off.length ? "; " + said(off) + " shed." : ".") + (fits || !on.length ? "" : " Shed loads until it fits.");
    }
    var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(function () { var n = box.clientWidth > 0 && box.clientWidth < 520; if (n !== lastNarrow) draw(); }) : null;
    if (ro) ro.observe(box); else window.addEventListener("resize", draw);
    draw();
    return { el: fig, state: st, set: function (p) { Object.keys(p).forEach(function (k) { st[k] = p[k]; }); draw(); } };
  }

  // the 72-hour chart of one island run (kW by source, stacked; the short part in red; the kept load as a line)
  function islandSpec(C, r, season) {
    var bars = [], W = C.windows[season], ymax = Math.max(800, Math.ceil((r.load + 50) / 200) * 200);
    r.rows.forEach(function (h) {
      var y = 0;
      [["gen", h.gen], ["battery", h.bat], ["solar", h.used]].forEach(function (p) {
        if (p[1] > 0.5) { bars.push({ x0: h.t + 0.06, x1: h.t + 0.94, y0: y, y1: y + p[1], color: COLOR[p[0]], op: 0.85 }); y += p[1]; }
      });
      if (h.short > 0.5) bars.push({ x0: h.t + 0.06, x1: h.t + 0.94, y0: y, y1: y + h.short, color: COLOR.short, op: 0.3 });
    });
    var day = W.dates[0].slice(8) === "28" ? ["28 Jul", "29 Jul", "30 Jul", "31 Jul"] : ["20 Jan", "21 Jan", "22 Jan", "23 Jan"];
    return {
      x: { min: 0, max: HOURS, ticks: [[0, day[0], "start"], [12, "noon"], [24, day[1]], [36, "noon"], [48, day[2]], [60, "noon"], [72, day[3], "end"]],
           ticksN: [[0, "0 h", "start"], [24, "24 h"], [48, "48 h"], [72, "72 h", "end"]] },
      y: { min: 0, max: ymax, step: 200, fmt: function (v) { return int(v); }, unit: "kW" },
      height: 240, heightN: 210, bars: bars,
      lines: [{ pts: [[0, r.load], [HOURS, r.load]], color: COLOR.load, width: 1.6, dash: "5 4" }],
      marks: r.full ? [] : [{ x: r.lasts, y: r.load, vline: true, label: "Short from hour " + r.lasts, color: "var(--lx-bad)" }],
      legend: [{ label: "Generator", color: COLOR.gen }, { label: "Battery", color: COLOR.battery }, { label: "Solar used", color: COLOR.solar }, { label: "Short", color: COLOR.short }, { label: "Loads kept", color: COLOR.load, dash: "5 4" }],
      aria: "Hourly supply of the island over 72 hours from midnight on " + W.first + ": " + kw(r.load) + " kept; " + lastsText(r) + ".",
      text: { head: ["Hour", "Solar used (kW)", "Generator (kW)", "Battery (kW)", "Short (kW)", "Battery holds (kWh)", "Fuel left (kWh)"],
              rows: r.rows.map(function (h) { return [String(h.t), int(h.used), int(h.gen), int(h.bat), int(h.short), int(h.stored), int(h.fuel)]; }),
              note: kw(r.load) + " kept from midnight on " + W.first + ": " + lastsText(r) + "." }
    };
  }
  function villageSpec(V, r, mill) {
    var bars = [];
    r.rows.forEach(function (h) {
      if (h.direct > 0.05) bars.push({ x0: h.h + 0.08, x1: h.h + 0.92, y0: 0, y1: h.direct, color: COLOR.solar, op: 0.85 });
      if (h.bat > 0.05) bars.push({ x0: h.h + 0.08, x1: h.h + 0.92, y0: h.direct, y1: h.direct + h.bat, color: COLOR.battery, op: 0.85 });
      if (h.short > 0.05) bars.push({ x0: h.h + 0.08, x1: h.h + 0.92, y0: h.direct + h.bat, y1: h.load, color: COLOR.short, op: 0.3 });
    });
    return {
      x: { min: 0, max: 24, ticks: [[0, "00:00", "start"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00", "end"]],
           ticksN: [[0, "0", "start"], [6, "6"], [12, "12"], [18, "18"], [24, "24 h", "end"]] },
      y: { min: 0, max: 16, step: 4, fmt: function (v) { return int(v); }, unit: "kW" }, height: 220, heightN: 200, bars: bars,
      lines: [{ values: r.rows.map(function (h) { return h.load; }), x0: 0, step: 1, color: COLOR.load, width: 1.6 }],
      legend: [{ label: "From the panels", color: COLOR.solar }, { label: "From the battery", color: COLOR.battery }, { label: "Short", color: COLOR.short }, { label: "Village load", color: COLOR.load }],
      aria: "The village's average day, hour by hour: load, panels, battery and any shortfall; " + (r.ok ? "every hour served." : r.shortHours + " hours short."),
      text: { head: ["Hour", "Load (kW)", "From the panels (kW)", "From the battery (kW)", "Short (kW)", "Battery holds (kWh)"],
              rows: r.rows.map(function (h) { return [LX.fmt.hh(h.h), h.load.toFixed(1), h.direct.toFixed(1), h.bat.toFixed(1), h.short.toFixed(1), h.stored.toFixed(1)]; }),
              note: "Mill " + (mill === "evening" ? "18:00–22:00" : "10:00–14:00") + "; " + (r.ok ? "every hour served." : r.shortHours + " hours short.") }
    };
  }

  LX.mount("f7", function (live, data, root) {
    var D = data[KEY], C = D.campus, V = D.village, P = data.path;
    var stageBox = H("div", { class: "f7-stage" }, live);
    var line = CampusLine(stageBox, C, P, { onPick: function (k) { if (pickHook) pickHook(k); } });
    var vStage = H("div", { class: "f7-vstage", hidden: true }, live);
    var vHead = H("div", { class: "f7-vhead" }, vStage);
    var pickHook = null;
    // S0.keep: the last set of kept loads that passes keepStatus (the runs and the explain layer use it); the toggles of
    // step 4 may show a set that does not pass, which only the diagram draws
    var S0 = { keep: critical(), ran: {}, vkw: V.panels.start, vkwh: V.battery.start, mill: "noon", former: null };
    var saved = LX.store.get("f7-keep");
    if (!saved || typeof saved !== "object" || keepStatus(C, Object.assign(critical(), saved)) !== "ok") saved = null;
    if (saved) S0.keep = Object.assign(critical(), saved);
    var X = null;   // the explain layer (built at the end of mount); X.refresh() follows the reader's loads and village
    function setKeep(k) {
      line.set({ keep: k });
      if (keepStatus(C, k) !== "ok") return;
      S0.keep = k; LX.store.set("f7-keep", k); if (X) X.refresh(S0);
    }
    function parts(k) { return (D.parts.filter(function (p) { return p.key === k; })[0] || {}).note || ""; }
    function villageHead() {
      vHead.innerHTML = "";
      [["sun", "Panels", kw(S0.vkw)], ["battery", "Battery", kwh(S0.vkwh)], ["house", "Households", String(V.households)], ["dial", "Grain mill", V.mill.kw + " kW · " + (S0.mill === "evening" ? "18:00–22:00" : "10:00–14:00")]].forEach(function (c) {
        var d = H("div", { class: "lx-readout" }, vHead); H("span", { html: LX.icon(c[0]) + c[1] }, d); H("b", { text: c[2] }, d);
      });
    }

    var cards = LX.StepCards(live, { id: "f7-steps", onStep: function (i) { stageBox.hidden = i >= 6; vStage.hidden = i < 6; if (i !== 0) pickHook = null; if (i >= 6) villageHead(); }, steps: [
      { text: C.name + " (fictional) holds a college and the county hospital. One [[feeder|feeder]] brings grid power through one switch, the [[point-of-common-coupling|point of common coupling]]. Tap the parts; then tap the switch.",
        build: function (act, api) {
          line.set({ grid: true, sw: "closed", former: null, pick: null });
          var seen = {}, n = H("p", { class: "lx-hint", text: "Parts met: 0 of 10." }, act);
          pickHook = function (k) {
            seen[k] = true; var c = Object.keys(seen).length; n.textContent = "Parts met: " + c + " of 10.";
            api.saw(parts(k)); if (seen.switch) api.done();
          };
        } },
      { text: "A storm brings down the feeder. The campus has " + kw(C.solarKW) + " of solar panels on its roofs. With the switch still closed, do they keep the hospital lit?",
        build: function (act, api) {
          line.set({ grid: false, sw: "closed", former: null, pick: null });
          var pr = LX.Predict(act, { id: "f7-solar", q: "", title: false, fresh: true, answer: "no",
            options: [{ value: "yes", label: "Yes, while the sun shines" }, { value: "no", label: "No, they switch off too" }],
            feedback: { yes: D.texts.solarOff, no: D.texts.solarOff },
            onPick: function () { pr.reveal("The whole campus is dark, hospital included."); api.done(); } });
        } },
      { text: "A [[microgrid|microgrid]] can open its switch and run alone: it [[islanding|islands]]. Something must set the island's [[voltage|voltage]] and [[frequency|frequency]]. Open the switch, then pick what forms the island.",
        build: function (act, api) {
          line.set({ grid: false, sw: "closed", former: null, pick: null });
          var row = H("div", { class: "cf-row" }, act);
          var open = H("button", { type: "button", class: "lx-btn small", text: "Open the switch" }, row);
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "What forms the island" }, act); seg.hidden = true;
          var opts = [["solar", "The solar inverters"], ["battery", "The battery"], ["gen", "The generator"]];
          var bs = opts.map(function (x) {
            var b = H("button", { type: "button", text: x[1], "aria-pressed": "false" }, seg);
            b.addEventListener("click", function () {
              bs.forEach(function (y, j) { y.setAttribute("aria-pressed", String(opts[j][0] === x[0])); });
              S0.former = x[0]; line.set({ former: x[0], keep: critical() });
              if (x[0] === "solar") api.saw(D.texts.formSolar, true);
              else { api.saw(x[0] === "battery" ? D.texts.formBattery : D.texts.formGen); api.done(); }
            });
            return b;
          });
          open.addEventListener("click", function () { line.set({ sw: "open" }); open.setAttribute("aria-disabled", "true"); seg.hidden = false; open.textContent = "Switch open"; bs[0].focus(); });
        } },
      { text: "At night the island has the battery (" + kw(C.battery.kw) + ") and the generator (" + kw(C.gen.kw) + "): " + kw(nightKW(C)) + ". The campus draws " + kw(totalKW(C)) + ". Choose the loads to keep; the critical ones must stay on.",
        build: function (act, api) {
          line.set({ grid: false, sw: "open", former: S0.former === "gen" ? "gen" : "battery" });
          var keep = saved ? Object.assign(critical(), saved) : all();   // the last set kept (a valid one), else every load: the reader sheds
          var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Loads to keep" }, act);
          var sum = H("div", { class: "lx-readouts" }, act);
          C.loads.forEach(function (l) {
            LX.Toggle(tg, { label: l.short + " · " + kw(l.kw), on: !!keep[l.key], onChange: function (on) { keep = Object.assign({}, keep); keep[l.key] = on; paint(); } });
          });
          function paint() {
            setKeep(keep);
            var k = keptKW(C, keep), fits = k <= nightKW(C);
            sum.innerHTML = "";
            [["Loads kept", kw(k), fits ? null : "bad"], ["The island can give at night", kw(nightKW(C)), null]].forEach(function (c) {
              var d = H("div", { class: "lx-readout" + (c[2] ? " " + c[2] : "") }, sum); H("span", { text: c[0] }, d); H("b", { text: c[1] }, d);
            });
            var stt = keepStatus(C, keep);
            if (stt === "critical") api.saw(D.texts.keepCritical, true);
            else if (stt === "over") api.saw("**" + kw(k) + "** is more than the island's " + kw(nightKW(C)) + ". Switch off another load.", true);
            else { saved = keep; api.saw("You keep **" + kw(k) + "**, within the island's " + kw(nightKW(C)) + ". Loads that must stay on are its [[critical-load|critical load]]."); api.done(); }
          }
          paint();
        } },
      { text: "Power (kW) sets what the island can carry; stored energy and fuel (kWh) set for how long. The storm hit at midnight on " + C.windows.jul.first + ". Run the outage with your loads.",
        build: function (act, api) { runStep(act, api, "jul"); } },
      { text: "Same campus, same loads, but the storm hits at midnight on " + C.windows.jan.first + ": shorter days and weaker sun. Predict first, then run it.",
        build: function (act, api) {
          var w = winter(C, S0.keep);
          var box = H("div", {}, act);
          var pr = LX.Predict(act, { id: "f7-winter", q: "", title: false, fresh: true, answer: w.answer,
            options: [{ value: "short", label: "It lasts less long" }, { value: "same", label: "The same" }, { value: "long", label: "It lasts longer" }],
            feedback: w.feedback,
            onPick: function () { pr.reveal(); act.appendChild(box); runStep(box, api, "jan", w.jul); } });
        } },
      { text: "This village (fictional) has no grid at all: " + V.households + " households and a grain mill that runs from 10:00 to 14:00. Pick panels and a battery that serve every hour of an average day.",
        build: function (act, api) { S0.mill = "noon"; villageStep(act, api, "noon"); } },
      { text: "The miller would rather grind from 18:00 to 22:00. Which part of the smallest design that serves every hour has to grow? Predict, then fix the village.",
        build: function (act, api) {
          var box = H("div", {}, act), mv = millMove(V);
          var pr = LX.Predict(act, { id: "f7-mill", q: "", title: false, fresh: true, answer: mv.answer,
            options: [{ value: "panels", label: "The panels" }, { value: "battery", label: "The battery" }, { value: "both", label: "Both" }, { value: "neither", label: "Neither" }],
            feedback: mv.feedback,
            onPick: function () { pr.reveal(); S0.mill = "evening"; act.appendChild(box); villageStep(box, api, "evening"); } });
        } }
    ] });

    // step 3: the controller picks up the critical loads first (this lesson's rule); all(): every load switched on
    function critical() { var k = {}; C.loads.forEach(function (l) { k[l.key] = !!l.critical; }); return k; }
    function all() { var k = {}; C.loads.forEach(function (l) { k[l.key] = true; }); return k; }

    function runStep(act, api, season, other) {
      line.set({ grid: false, sw: "open", former: S0.former === "gen" ? "gen" : "battery", keep: S0.keep });
      var keep = S0.keep;
      var row = H("div", { class: "cf-row" }, act);
      var go = H("button", { type: "button", class: "lx-btn small", text: "Run the " + (season === "jul" ? "July" : "January") + " outage" }, row);
      var dorm = null;
      if (keep.dorms !== undefined && C.loads.some(function (l) { return l.key === "dorms"; }) && season === "jul") {
        dorm = LX.Toggle(H("div", { class: "lx-toggles" }, act), { label: "Keep the dorms", on: !!keep.dorms, onChange: function (on) { var k2 = Object.assign({}, keep); k2.dorms = on; if (keepStatus(C, k2) === "ok") { keep = k2; setKeep(keep); } else { dorm.set(!on); return; } if (ran) paint(); } });
      }
      var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
      var P = LX.Plot(act, { text: "Text version of the chart" });
      var ran = false;
      function paint() {
        var r = island(C, keep, season); ran = true; S0.ran[season] = r;
        chips.innerHTML = "";
        var cs = [["Loads kept", kw(r.load)], ["They lasted", r.full ? "all 72 hours" : r.lasts + " hours"], ["Fuel left at the end", kwh(r.fuelLeft)]];
        if (other) cs.splice(2, 1, ["In July", other.full ? "all 72 hours" : other.lasts + " hours"]);
        cs.forEach(function (c) { var d = H("div", { class: "lx-readout" + (c[2] ? " " + c[2] : "") }, chips); H("span", { text: c[0] }, d); H("b", { text: c[1] }, d); });
        P.render(islandSpec(C, r, season), true);
        if (season === "jul") {
          var alt = Object.assign({}, keep); alt.dorms = !keep.dorms; var r2 = keepStatus(C, alt) === "ok" ? island(C, alt, "jul") : null;
          var refill = r.rows.some(function (h) { return h.charge > 0.5; });
          api.saw("**" + kw(r.load) + " " + lastsText(r) + ".** The generator ran first and the battery filled the gap; " + (refill ? "spare sun refilled the battery" : "no sun was left over to refill the battery") +
            (r2 ? ". With" + (alt.dorms ? "" : "out") + " the dorms, " + kw(r2.load) + " " + lastsText(r2) + "." : "."));
        } else {
          api.saw(winter(C, keep).line);
        }
        api.done();
      }
      go.addEventListener("click", function () { go.textContent = "Run it again"; paint(); });
      if (S0.autorun) paint();
    }

    function villageStep(act, api, mill) {
      var ctl = H("div", { class: "lx-ctls" }, act);
      var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
      var P = LX.Plot(act, { text: "Text version of the chart" });
      var sp = LX.Slider(ctl, { label: "Solar panels", color: COLOR.solar, min: V.panels.min, max: V.panels.max, step: V.panels.step, value: S0.vkw, fmt: function (v) { return kw(v); }, onChange: function (v) { S0.vkw = v; paint(); } });
      var sb = LX.Slider(ctl, { label: "Battery", color: COLOR.battery, min: V.battery.min, max: V.battery.max, step: V.battery.step, value: S0.vkwh, fmt: function (v) { return kwh(v); }, onChange: function (v) { S0.vkwh = v; paint(); } });
      act.insertBefore(H("p", { class: "lx-hint", text: D.texts.villageToy }, act), chips);
      function paint() {
        villageHead(); S0.mill = mill; S0.vseen = true; if (X) X.refresh(S0);
        var r = villageDay(V, S0.vkw, S0.vkwh, mill), mb = minBattery(V, S0.vkw, mill);
        chips.innerHTML = "";
        [["Load served", pct(r.served), r.ok ? null : "bad"], ["Hours short", String(r.shortHours), r.ok ? null : "bad"], ["Spare sun spilled", kwh(r.spill) + " a day"]].forEach(function (c) {
          var d = H("div", { class: "lx-readout" + (c[2] ? " " + c[2] : "") }, chips); H("span", { text: c[0] }, d); H("b", { text: c[1] }, d);
        });
        P.render(villageSpec(V, r, mill));
        if (!r.ok) { api.saw(mb === null ? "With " + kw(S0.vkw) + " of panels no battery on the slider is enough: the day's sun is too small. Add panels." : "Short in " + r.shortHours + " hours. With " + kw(S0.vkw) + " of panels, try a larger battery.", true); return; }
        var sm = smallest(V, mill), other = smallest(V, mill === "noon" ? "evening" : "noon");
        if (mill === "noon") api.saw("**Every hour served.** With " + kw(S0.vkw) + " of panels the smallest battery that works is " + kwh(mb) + "; the smallest pair on the sliders is " + kw(sm.kw) + " and " + kwh(sm.kwh) + ".");
        else api.saw("**Every hour served.** Evening milling needs at least " + kw(sm.kw) + " and " + kwh(sm.kwh) + ", against " + kw(other.kw) + " and " + kwh(other.kwh) + " at midday: the battery now runs the mill. Run big loads while the sun shines.");
        api.done();
      }
      paint();
      act.lxSliders = { panels: sp, battery: sb, paint: paint };
    }

    // demo states (core.js LX.demo): "mid" = step 4 done with the hospital, water and dorms kept; "july", "january",
    // "village" (the smallest design with the mill at midday), "evening" (the mill moved, the smallest design)
    function keep3() { var k = {}; C.loads.forEach(function (l) { k[l.key] = l.key !== "labs"; }); return k; }
    LX.demo(root, function (state) {
      if (state === "term") { cards.go(0); setTimeout(function () { var tm = live.querySelector(".lx-step-text .lx-term"); if (tm) tm.click(); }, 600); return { view: "a glossary popover open" }; }
      if (state === "mid") { saved = keep3(); S0.former = "battery"; cards.go(3); return { view: "loads kept" }; }
      if (state === "july" || state === "step-5") { S0.keep = keep3(); S0.former = "battery"; S0.autorun = true; cards.go(4); S0.autorun = false; return { view: "July outage" }; }
      if (state === "january" || state === "step-6") { S0.keep = keep3(); S0.former = "battery"; S0.autorun = true; cards.go(5); var b = live.querySelector(".lx-step-act .lx-predictbox .lx-choice"); if (b) b.click(); S0.autorun = false; return { view: "January outage" }; }
      if (state === "village" || state === "step-7") { var s = smallest(V, "noon"); S0.vkw = s.kw; S0.vkwh = s.kwh; cards.go(6); return { view: "village" }; }
      if (state === "evening" || state === "step-8") { var e = smallest(V, "evening"); S0.vkw = e.kw; S0.vkwh = e.kwh; cards.go(7); var c = live.querySelectorAll(".lx-step-act .lx-predictbox .lx-choice")[1]; if (c) c.click(); return { view: "evening mill" }; }
      return null;
    }, cards);
    var sortHost = document.getElementById("f7-sort");
    if (sortHost) {
      var fb = sortHost.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
      LX.CardSort(sortHost, { bins: D.sort.bins, cards: D.sort.cards, checkLabel: "Check my sort" });
    }
    root.lxLesson = { model: model, cards: cards, line: line, S: S0 };
    X = buildExplain(D, P, S0);
  });

  // ---------------------------------------------------------------- the explain layer
  // Built once at mount; refresh(S0) follows the reader: the kept loads (S0.keep, a set that passes keepStatus) and the
  // village design (S0.vkw, S0.vkwh, S0.mill). Before the reader has kept a set, the hospital, the water plant and the
  // dorms stand in, and the text says so.
  function buildExplain(D, Pth, S0) {
    var x = document.getElementById("f7-explain"); if (!x) return null;
    x.innerHTML = ""; x.classList.add("is-live");
    var C = D.campus, V = D.village, F = D.flow;
    // 1 the annotated diagram (e-annotated)
    var c1 = H("div", { class: "lx-xcard wide" }, x);
    H("header", { class: "lx-x-head", html: "<h3>The parts of a microgrid</h3>" }, c1);
    var mineP = H("p", { class: "lx-hint", "aria-live": "polite" }, c1);
    var note = H("p", { class: "f7-note", "aria-live": "polite", text: "" }, c1);
    var dg = CampusLine(c1, C, Pth, { numbered: true, onPick: function (k) { var p = D.parts.filter(function (q) { return q.key === k; })[0]; note.innerHTML = "<b>" + LX.esc(p.name) + ".</b> " + LX.rich(p.note); } });
    var ol = H("ol", { class: "f7-notes" }, c1);
    D.parts.forEach(function (p) { H("li", { html: "<b>" + LX.esc(p.name) + ".</b> " + LX.rich(p.note) }, ol); });
    // 2 the flowchart (e-flowchart): what happens when the grid goes down, with the reader's loads and village as traces
    var c2 = H("div", { class: "lx-xcard" }, x);
    var traces = F.traces.map(function (t) { return Object.assign({}, t); });
    var mine = traces.filter(function (t) { return t.key === "mine"; })[0], vil = traces.filter(function (t) { return t.key === "village"; })[0];
    var fc = null;
    // 3 the comparison table (e-table)
    function refresh(st) {
      var own = st && st.keep && keepStatus(C, st.keep) === "ok" && LX.store.get("f7-keep");
      var keep = own ? st.keep : null;
      if (!keep) { keep = {}; C.loads.forEach(function (l) { keep[l.key] = l.key !== "labs"; }); }
      var jul = island(C, keep, "jul"), jan = island(C, keep, "jan");
      mineP.textContent = (own ? "Your island: " : "An island that keeps the hospital, the water plant and the dorms: ") + kw(jul.load) + " kept, " + lastsText(jul) + " in July and " + lastsText(jan) + " in January. Tap a part to read about it.";
      dg.set({ grid: false, sw: "open", former: "battery", keep: keep });
      if (mine) {
        mine.label = own ? "Prairie Campus, your loads" : "Prairie Campus, three loads kept";
        mine.path = jul.full ? ["start", "q1", "q2", "q3", "q4", "ok"] : ["start", "q1", "q2", "q3", "shed", "q4", "lasts"];
        mine.text = (own ? "You kept " : "Kept: ") + kw(jul.load) + " of the campus's " + kw(totalKW(C)) + ": the island " + lastsText(jul) + " in July and " + lastsText(jan) + " in January.";
      }
      if (vil) { var vt = villageTrace(V, st && st.vkw, st && st.vkwh, st && st.mill, !!(st && st.vseen)); vil.path = vt.path; vil.text = vt.text; vil.label = vt.label; }
      if (fc) fc.update(traces);
    }
    refresh(S0);
    fc = LX.Flowchart(c2, { title: F.title, lede: F.lede, nodes: F.nodes, cols: 3, at: F.at, colsN: 2, atN: F.atN, edges: F.edges, traces: traces, sel: 1 });
    var c3 = H("div", { class: "lx-xcard" }, x), K = D.kinds;
    LX.CompareTable(c3, { title: K.title, text: true, columns: K.columns, rows: K.rows, caption: K.caption });
    return { refresh: refresh };
  }
})();
