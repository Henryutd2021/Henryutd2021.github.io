// a11-lca-nexus.js — Analyst lesson A11, "What does 'clean' mean from cradle to grave? Life cycles, water and land"
// (step cards, closed form), wave W5, builder learn-w5-c, 2026-11-06.
//
// Data: assets/learn/data/a11-lca-nexus.json (footprints by life-cycle stage, each a published median or range with its
// source and date), a10-emissions-questions.json (lesson A10's EIA heat rate and CO2 coefficient for the stack check),
// f08-large-loads.json (lesson F8's campus: 240 MW in every hour) and path.json (lesson links).
//
// Three objects, four stages (Build, Supply, On site, End of life), three footprints:
//   carbon  g CO2e per kWh (= kg per MWh); solar and gas: NREL's medians of published estimates by phase (Table 1,
//           NREL/FS-6A50-80580, 2021): one-time upstream -> Build, ongoing non-combustion -> Supply (upkeep; for gas
//           the fuel cycle), ongoing combustion -> On site, one-time downstream -> End of life. Medians of phases need
//           not add to the median of totals (NREL's own note): gas phases add to 460.82, the total median is 486.
//           Data center: LBNL's 0.34 kg CO2e per kWh (2023) at the power plants that supply U.S. data centers.
//   water   gallons consumed per MWh; operation (On site): Macknick et al. (2012) medians and ranges, by cooling type for
//           gas; Build and Supply: Meldrum et al. (2013), whose plant stage includes taking down (End of life is "with
//           Build"). Data center: LBNL 2023, direct 66 billion litres over 176 TWh, indirect 4.52 litres per kWh;
//           litres to gallons at 3.785411784.
//   land    m² held per MWh made in a year; solar: 1 acre (4,046.86 m²) / 394 MWh a year, the median energy density of
//           single-axis tracking plants built in 2019 (LBNL), arrays only; "the land between" scales to the whole lease
//           at one Nevada plant's ratio (1,375 / 945 acres, LBNL's example): an illustrative scaling, not a published
//           result. Gas: Lovering et al. (2022), 410 ha per TWh a
//           year (footprint: well pads, roads, pipelines, plant) or 1,900 (spacing: the whole gas field); over 90% is
//           indirect (fuel supply), so Supply alone is "over" 90% of the total and On site "under" 10%.
// The boundary is a run of stages [L, R] (indices 0..3). The total inside sums its stages; a stage "not counted" is
// listed, never added. Consequential answer for a new solar farm against not building it (illustrative arithmetic on
// NREL's medians): its whole life (43) minus what its MWh avoid: existing gas plants' burning and gas supply, 389 + 71
// (the 71 treated as all fuel supply); existing wind farms 0 (built already, their upkeep goes on: review 2026-11-06);
// spilled power 0.
// Every number on the page is checked by _tests/learn/test_a11-lca-nexus.js. A data center appears only as a load.
(function () {
  "use strict";
  var STAGES = ["build", "supply", "run", "end"];

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function galPerMWh(LperKWh, D) { return LperKWh * 1000 / D.litresPerGallon; }
  function haToM2(haPerTWh) { return haPerTWh * 1e4 / 1e6; }   // ha per TWh a year -> m² per MWh a year
  function landPv(D, wide) { var m2 = D.land.acreM2 / D.land.pvTracking; return wide ? m2 * D.land.copperSiteAcres / D.land.copperArrayAcres : m2; }
  function landPvFixed(D) { return D.land.acreM2 / D.land.pvFixed; }
  function landGas(D, wide) { return haToM2(wide ? D.land.gasSpacing : D.land.gasFootprint); }
  function dcVals(D) { var d = D.dcData; return { direct: galPerMWh(d.directL2023 / d.twh2023, D), directL: d.directL2023 / d.twh2023, indirect: galPerMWh(d.indirectLperKWh, D), ghg: d.ghgKgPerKWh * 1000 }; }
  function coolingOf(D, id) { return D.cooling.filter(function (c) { return c.id === id; })[0] || D.cooling[0]; }
  // one stage of one object for one footprint; o: { cooling, wide }
  function stage(D, obj, meter, sid, o) {
    o = o || {}; var e = D.objects[obj][meter][sid], out = { sid: sid, src: e.src || null, note: e.note || null };
    if (e.nc) { out.kind = "nc"; out.note = e.nc; return out; }
    if (e.none) { out.kind = "none"; out.v = 0; out.note = e.none; return out; }
    if (e.with) { out.kind = "with"; out.v = 0; out.note = "counted with " + e.with.replace("build", "Build"); return out; }
    out.kind = "num";
    if (e.cooling) { var c = coolingOf(D, o.cooling); out.v = c.use; out.lo = c.useLo; out.hi = c.useHi; out.wd = c.wd; out.wdLo = c.wdLo; out.wdHi = c.wdHi; out.note = c.label + ": " + c.how; return out; }
    if (e.dc) { var V = dcVals(D); out.v = e.dc === "ghg" ? V.ghg : e.dc === "direct" ? V.direct : V.indirect; return out; }
    if (e.fromDensity) { out.v = landPv(D, o.wide); out.note = o.wide ? "illustrative: the arrays scaled to one Nevada plant's whole lease (LBNL's example)" : e.note; return out; }
    if (e.share) {
      var tot = landGas(D, o.wide), m = D.land.gasIndirectMin;
      out.kind = "bound"; out.dir = e.share === "indirect" ? "over" : "under"; out.v = tot * (e.share === "indirect" ? m : 1 - m); out.joint = tot;
      out.note = e.note + (o.wide ? " (the whole field)" : ""); return out;
    }
    out.v = e.v; if (e.lo != null) { out.lo = e.lo; out.hi = e.hi; } if (e.loText) out.loText = e.loText; if (e.about) out.about = true;
    return out;
  }
  // the total inside a boundary of stages L..R (inclusive)
  function inside(D, obj, meter, L, R, o) {
    var parts = [], nc = [], v = 0, bounds = [], n = 0;
    for (var i = L; i <= R; i++) { var s = stage(D, obj, meter, STAGES[i], o); parts.push(s); if (s.kind === "nc") nc.push(STAGES[i]); else if (s.kind === "bound") bounds.push(s); else { v += s.v; n++; } }
    var res = { parts: parts, nc: nc, v: v, kind: "num", dir: null };
    if (bounds.length === 2) { res.v = v + bounds[0].joint; n++; }          // both gas land stages inside: the whole total
    else if (bounds.length === 1) { res.v = v + bounds[0].v; res.kind = "bound"; res.dir = bounds[0].dir; n++; }
    if (n === 0) res.kind = "nc";
    return res;
  }
  function full(D, obj, meter, o) { return inside(D, obj, meter, 0, 3, o); }
  // the consequential change per kWh of a new solar farm: its whole life minus the ongoing phases of what it replaces
  // existing plants that run less: gas avoids its burning and its gas supply; wind's upkeep goes on whether it runs or not
  function avoided(D, k) { var g = D.objects.gas.carbon; return k === "gas" ? g.supply.v + g.run.v : 0; }
  function consequential(D, k) { return D.nrelTotals.solar - avoided(D, k); }
  function stack(A10) { var P = A10.plains; return P.plants.cc.heatRate * P.gas.co2PerMMBtu; }   // MMBtu/MWh x kg/MMBtu = kg/MWh = g/kWh
  function campus(D, F8) { var mwh = F8.campus.drawMW * 8760, V = dcVals(D); return { mw: F8.campus.drawMW, mwh: mwh, co2: mwh * D.dcData.ghgKgPerKWh, indirect: mwh * V.indirect, direct: mwh * V.direct }; }
  function ratio(a, b) { return a / b; }
  function consArith(D, k) {   // "43 − (71 + 389) = −417": the change against not building the farm, with its arithmetic
    var g = D.objects.gas.carbon, sub = k === "gas" ? "(" + num("carbon", g.supply.v) + " + " + num("carbon", g.run.v) + ")" : "0";
    return D.nrelTotals.solar + " − " + sub + " = " + signed(consequential(D, k));
  }

  // formats
  function grp(n) { return Math.round(n).toLocaleString("en-US"); }
  function num(meter, v) {
    if (meter === "land") return (Math.round(v * 10) / 10).toFixed(1);
    if (meter === "carbon" && Math.abs(v) < 1 && v !== 0) return Math.abs(v) < 0.1 ? v.toFixed(2) : v.toFixed(1);
    return grp(v);
  }
  var UNIT = { carbon: "g CO₂e per kWh", water: "gal per MWh", land: "m² per MWh a year" };
  // the header's unit line: the footprint's own denominator, made (a plant) or used (a load)
  function unitLine(obj, meter) {
    var v = obj === "dc" ? "used" : "made";
    return meter === "carbon" ? "carbon in g CO₂e per kWh " + v + " (= kg per MWh)" : meter === "water" ? "water in gallons consumed per MWh " + v : "land in m² held per MWh " + v + " in a year";
  }
  function val(meter, s) {
    if (s.kind === "nc") return "not counted";
    if (s.kind === "none") return "none";
    if (s.kind === "with") return "in Build";
    if (s.kind === "bound") return s.dir + " " + num(meter, s.v);
    if (s.loText && s.v <= 1) return "about " + num(meter, s.v);
    return (s.about ? "about " : "") + num(meter, s.v);
  }
  function totalText(meter, r) {
    if (r.kind === "nc") return "not counted";
    var t = (r.kind === "bound" ? r.dir + " " : "") + num(meter, r.v) + " " + UNIT[meter];
    return t + (r.nc.length ? " (" + r.nc.length + (r.nc.length === 1 ? " stage" : " stages") + " not counted)" : "");
  }
  // the gas plant's stages add to 460.82 g, while NREL's median of whole-life totals is 486 g: say so wherever the full sum shows
  function wholeNote(D, obj, meter, L, R) { return obj === "gas" && meter === "carbon" && L === 0 && R === 3 ? "stages added; whole-life median " + D.nrelTotals.gas : null; }
  function range(s) { return s.lo != null ? (s.loText ? s.loText : grp(s.lo)) + " to " + grp(s.hi) : null; }
  function signed(v) { var r = Math.round(v); return (r < 0 ? "−" : r > 0 ? "+" : "") + Math.abs(r).toLocaleString("en-US"); }
  function billions(g) { return (g / 1e9).toFixed(1) + " billion"; }
  function millions(g) { return Math.round(g / 1e6).toLocaleString("en-US") + " million"; }

  // the lines the page assembles (also checked in the test, for every input)
  function lineSolar(D) {
    var b = stage(D, "solar", "carbon", "build"), t = full(D, "solar", "carbon");
    return "**Cradle to grave:** about " + num("carbon", t.v) + " g CO₂e per kWh, NREL's median; making the panels and building the farm is about " + num("carbon", b.v) + " g of it.";
  }
  function lineGas(D, A10) {
    var g = D.objects.gas.carbon, w = inside(D, "gas", "carbon", 1, 2);
    return "**With the gas supply:** " + num("carbon", g.run.v) + " + " + num("carbon", g.supply.v) + " = " + num("carbon", w.v) + " g per kWh. The [[median|median]] of whole-life totals is " + D.nrelTotals.gas + " g: medians of stages need not add up.";
  }
  function stackHint(A10) { return "A check: EIA's 2025 average tested [[heat-rate|heat rate]] of combined-cycle plants at full load (lesson A10) gives about " + grp(stack(A10)) + " g CO₂ per kWh at the stack, close to NREL's median."; }
  function brochureRatio(D) { return D.objects.gas.carbon.run.v / D.nrelTotals.solar; }
  function fairRatio(D) { return D.nrelTotals.gas / D.nrelTotals.solar; }
  function lineCompare(D) {
    return "**One boundary, cradle to grave:** " + D.nrelTotals.gas + " g against " + D.nrelTotals.solar + " g, about " + Math.round(fairRatio(D)) + " times. The ranking holds; the ratio depends on the boundary.";
  }
  function lineWater(D, id) {
    var c = coolingOf(D, id);
    return "**" + c.label + ":** withdraws " + grp(c.wd) + " gal per MWh and consumes " + grp(c.use) + " (medians). " + (c.wd > 1000 ? "Most of it goes back, warmer." : c.id === "dry" ? "Almost no water, at some cost in efficiency." : "Most of what it takes in evaporates.");
  }
  function lineLand(D, wide) {
    return wide ? "**With the land between:** solar about " + num("land", landPv(D, true)) + " m² (illustrative: arrays scaled to one plant's lease), gas " + num("land", landGas(D, true)) + " m² (the whole gas field). In this example the order reverses."
      : "**Footprints only:** solar " + num("land", landPv(D, false)) + " m² per MWh a year under its arrays; gas " + num("land", landGas(D, false)) + " m², over 90% of it at wells, roads and pipelines.";
  }
  function lineDC(D, F8) {
    var V = dcVals(D), c = campus(D, F8);
    return "**With its power:** " + grp(V.direct) + " + " + grp(V.indirect) + " = " + grp(V.direct + V.indirect) + " gal per MWh and " + grp(V.ghg) + " g CO₂e per kWh. For F8's " + c.mw + " MW campus at these averages: " + billions(c.direct + c.indirect) + " gallons a year.";
  }
  function lineCons(D, k) {
    var o = D.consequential.filter(function (x) { return x.id === k; })[0];
    var v = consequential(D, k);
    return "**" + o.label + ":** against not building the farm, " + consArith(D, k) + " g per kWh of solar" + (v < 0 ? ": " + grp(-v) + " g avoided, not removed from the air." : ": more than without it.");
  }
  function lineDrought(D, on) {
    var s = D.drought.summer[on ? "drought" : "median"];
    return on ? "**Drought case:** hydropower falls to " + s.hydro + "% of California's summer generation, gas rises to " + s.gas + "%, imports grow. More gas burned means more CO₂ and can mean more cooling water; this page does not total it."
      : "**Median water year:** hydropower " + s.hydro + "% and gas " + s.gas + "% of California's summer generation (EIA's model).";
  }

  // ---- the no-JS blocks (written into the page by the test's --write mode; the test checks they are unchanged)
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fallbackHTML(D) {
    var o = { cooling: "tower", wide: false }, h = [];
    h.push('<p class="lx-eyebrow">Three objects, two boundaries: on site only, and cradle to grave</p>');
    h.push('<div class="lx-scroll-x"><table class="lx-facts a11-fb">');
    h.push('<thead><tr><th scope="col">Object and footprint</th><th scope="col">On site only</th><th scope="col">Cradle to grave</th></tr></thead><tbody>');
    ["solar", "gas", "dc"].forEach(function (k) {
      [["carbon", "carbon"], ["water", "water consumed"], ["land", "land"]].forEach(function (m) {
        var a = inside(D, k, m[0], 2, 2, o), b = full(D, k, m[0], o), wn = wholeNote(D, k, m[0], 0, 3);
        h.push("<tr><td>" + esc(D.objects[k].name + ", " + m[1]) + '</td><td data-label="On site only">' + esc(totalText(m[0], a)) + '</td><td data-label="Cradle to grave">' + esc(totalText(m[0], b) + (wn ? " (" + wn + ")" : "")) + "</td></tr>");
      });
    });
    h.push("</tbody></table></div>");
    h.push('<p class="lx-hint">The gas plant has a cooling tower; the data center is the 2023 U.S. average, per unit of electricity it uses.</p>');
    h.push('<p class="lx-hint">A new solar farm\'s attributional share is about ' + D.nrelTotals.solar + " g per kWh.</p>");
    h.push('<p class="lx-hint">If gas plants run less, the consequential change against not building it is ' + consArith(D, "gas") + " g per kWh: avoided, not removed.</p>");
    h.push('<p class="lx-hint">With JavaScript on, you drag the boundary stage by stage, pick the cooling, count the land between and switch on a drought.</p>');
    return h.join("\n");
  }
  function explainHTML(D) {
    var d = D.drought.summer, V = dcVals(D);
    var ideas = [
      ["Boundary", "On site, a solar farm emits 0 g per kWh; from cradle to grave, about " + D.nrelTotals.solar + " g, mostly from making the panels."],
      ["One boundary", "Gas at its stack (" + D.objects.gas.carbon.run.v + " g) against solar from cradle to grave (" + D.nrelTotals.solar + " g) is unfair; on one boundary it is " + D.nrelTotals.gas + " against " + D.nrelTotals.solar + "."],
      ["Water", "Withdrawn is not consumed: once-through cooling takes " + grp(coolingOf(D, "once").wd) + " gal per MWh and consumes " + grp(coolingOf(D, "once").use) + "."],
      ["Land", "Counting the land between moves gas from " + num("land", landGas(D, false)) + " to " + num("land", landGas(D, true)) + " m² per MWh a year, past solar's illustrative " + num("land", landPv(D, true)) + "."],
      ["A load", "A data center's indirect water, " + grp(V.indirect) + " gal per MWh it uses, is about " + Math.round(V.indirect / V.direct) + " times its own cooling water (U.S., 2023)."],
      ["Two questions", "A new solar farm's share is about " + D.nrelTotals.solar + " g per kWh; what changes depends on what it replaces."],
      ["Drought", "In EIA's drought case, hydropower falls from " + d.median.hydro + "% to " + d.drought.hydro + "% of California's summer generation and gas rises from " + d.median.gas + "% to " + d.drought.gas + "%."]
    ];
    return '<dl class="lx-ideas">\n' + ideas.map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("\n") + "\n</dl>";
  }

  var model = { STAGES: STAGES, fallbackHTML: fallbackHTML, explainHTML: explainHTML, galPerMWh: galPerMWh, haToM2: haToM2, landPv: landPv, landPvFixed: landPvFixed, landGas: landGas, dcVals: dcVals, coolingOf: coolingOf,
    stage: stage, inside: inside, full: full, avoided: avoided, consequential: consequential, consArith: consArith, unitLine: unitLine, stack: stack, campus: campus, ratio: ratio,
    num: num, val: val, totalText: totalText, wholeNote: wholeNote, range: range, signed: signed, grp: grp, billions: billions, millions: millions, UNIT: UNIT,
    brochureRatio: brochureRatio, fairRatio: fairRatio,
    lineSolar: lineSolar, lineGas: lineGas, stackHint: stackHint, lineCompare: lineCompare, lineWater: lineWater, lineLand: lineLand, lineDC: lineDC, lineCons: lineCons, lineDrought: lineDrought };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "a11-lca-nexus";
  var OBJ = [["solar", "Solar farm"], ["gas", "Gas plant"], ["dc", "Data center"]];
  var MET = [["carbon", "Carbon"], ["water", "Water"], ["land", "Land"]];
  var SCOL = { build: "var(--lx-tier-2)", supply: "var(--lx-warn)", run: "var(--lx-accent)", end: "var(--lx-ink-3)" };

  // The life-cycle box: the object and footprint controls, the chain with its draggable boundary (LX.LifeBox, i-boundary;
  // components/lifebox.js, promoted from this page at the W5 integration), the readouts inside and the text version.
  //   var box = footprintBox(host, D, S, onChange);  box.paint();  S = { obj, meter, L, R, cooling, wide }
  function footprintBox(host, D, S, onChange) {
    var wrap = H("div", { class: "a11-box" }, host);
    var top = H("div", { class: "a11-top" }, wrap);
    function segCtl(label, opts, key) {
      var w = H("div", { class: "cf-ctl" }, top), id = LX.uid("a11"); H("p", { class: "cf-ctl-l", id: id, text: label }, w);
      var g = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, w), bs = {};
      opts.forEach(function (o) { var b = H("button", { type: "button", text: o[1] }, g); b.addEventListener("click", function () { S[key] = o[0]; change(); }); bs[o[0]] = b; });
      return bs;
    }
    var objB = segCtl("Object", OBJ, "obj"), metB = segCtl("Footprint", MET, "meter");
    var head = H("p", { class: "a11-fu" }, wrap);
    var life = LX.LifeBox(wrap, {
      stages: D.stages, state: S, cls: "a11", color: function (i) { return SCOL[STAGES[i]]; },
      presets: [["site", "On site only", 2, 2], ["supply", "Supply and site", 1, 2], ["grave", "Cradle to grave", 0, 3]],
      tile: function (t, i, inB) {
        var sid = STAGES[i], ob = D.objects[S.obj], s = stage(D, S.obj, S.meter, sid, { cooling: S.cooling, wide: S.wide }), st = D.stages[i];
        t.innerHTML = ""; t.classList.toggle("nc", s.kind === "nc");
        H("span", { class: "a11-st", text: st.label }, t);
        H("span", { class: "a11-sn", text: ob.stageNames[sid] }, t);
        H("b", { class: "a11-v", text: val(S.meter, s) }, t);
        t.setAttribute("aria-label", st.label + ", " + ob.stageNames[sid] + ": " + val(S.meter, s) + (s.kind === "num" || s.kind === "bound" ? " " + UNIT[S.meter] : "") + (inB ? ", inside the boundary" : ", outside the boundary"));
      },
      onChange: function () { paintRest(); if (onChange) onChange(S); } });
    var chips = H("div", { class: "lx-readouts a11-chips", "aria-live": "polite" }, wrap);
    var alt = H("details", { class: "lx-textalt" }, wrap); H("summary", { text: "Text version: every stage of this object" }, alt);
    var altBody = H("div", { class: "lx-scroll-x" }, alt);
    function change() { paint(); if (onChange) onChange(S); }
    function paint() { paintHead(); life.paint(); paintRest(); }
    function paintHead() {
      var ob = D.objects[S.obj];
      Object.keys(objB).forEach(function (k) { objB[k].setAttribute("aria-pressed", String(k === S.obj)); });
      Object.keys(metB).forEach(function (k) { metB[k].setAttribute("aria-pressed", String(k === S.meter)); });
      head.innerHTML = ""; H("b", { text: ob.name }, head); H("span", { text: " · " + ob.kind + " · " + unitLine(S.obj, S.meter) }, head);
    }
    function paintRest() {
      var ob = D.objects[S.obj], o = { cooling: S.cooling, wide: S.wide };
      chips.innerHTML = "";
      MET.forEach(function (m) {
        var r = inside(D, S.obj, m[0], S.L, S.R, o), c = H("div", { class: "lx-readout" + (m[0] === S.meter ? " a11-on" : "") }, chips);
        H("span", { text: D.meters.filter(function (x) { return x.id === m[0]; })[0].label + " inside" }, c); H("b", { text: totalText(m[0], r).replace(/ \(.*\)$/, "") }, c);
        var wn = wholeNote(D, S.obj, m[0], S.L, S.R);
        if (wn) H("small", { text: wn }, c); else if (r.nc.length && r.kind !== "nc") H("small", { text: r.nc.length + " not counted" }, c);
      });
      altBody.innerHTML = "";
      var tb = H("table", { class: "lx-facts" }, altBody), hr0 = H("tr", null, H("thead", null, tb));
      ["Stage", "Carbon, g CO₂e per kWh", "Water, gal per MWh", "Land, m² per MWh a year", "Inside?"].forEach(function (x) { H("th", { scope: "col", text: x }, hr0); });
      var bd = H("tbody", null, tb);
      STAGES.forEach(function (sid, i) {
        var tr = H("tr", null, bd); H("td", { text: D.stages[i].label + ": " + ob.stageNames[sid] }, tr);
        MET.forEach(function (m) { var s = stage(D, S.obj, m[0], sid, o); H("td", { text: val(m[0], s) + (range(s) ? " (" + range(s) + ")" : "") }, tr); });
        H("td", { text: i >= S.L && i <= S.R ? "yes" : "no" }, tr);
      });
    }
    paintHead(); paintRest();
    return { el: wrap, paint: paint, tiles: life.tiles, handles: life.handles };
  }

  LX.mount(SLUG, function (live, data, root) {
    var D = data.a11_lca_nexus, A10 = data.a10_emissions_questions, F8 = data.f08_large_loads, P = data.path;
    var saved = LX.store.get("a11", {}) || {};
    var S = { obj: "solar", meter: "carbon", L: 2, R: 2, cooling: saved.cooling || "tower", wide: !!saved.wide, cons: saved.cons || null, drought: !!saved.drought, tried: {} };
    function keep() { LX.store.set("a11", { cooling: S.cooling, wide: S.wide, cons: S.cons, drought: S.drought }); }
    function ref(code) { return LX.lessonRefHTML ? LX.lessonRefHTML(P, code) : code; }
    var watch = null;   // the current step's check, run on every change of the box
    var stageEl = H("div", { class: "lx-stage a11-stage" }, live);
    H("p", { class: "a11-how lx-hint", text: "Drag the dashed boundary's edges, tap a stage to bring it in or move it out, or pick a preset." }, stageEl);
    var box = footprintBox(stageEl, D, S, function () { if (watch) watch(); buildExplain(); });
    function set(o) { Object.keys(o).forEach(function (k) { S[k] = o[k]; }); box.paint(); buildExplain(); if (watch) watch(); }

    var steps = [
      { text: "Is a solar farm clean? Inside a [[system-boundary|boundary]] around its panels at work nothing burns, so carbon is 0 g per kWh; drag the edges out, from the factory to the scrapyard.",
        build: function (act, api) {
          set({ obj: "solar", meter: "carbon", L: 2, R: 2 });
          H("p", { class: "lx-hint", html: LX.rich("The [[functional-unit|functional unit]] is one kWh the farm makes. Its [[life-cycle-assessment|life cycle]] runs from Build to End of life.") }, act);
          H("p", { class: "lx-hint", text: "Build happens once: its emissions are divided by all the electricity the farm is expected to make over its life, so they show as g per kWh." }, act);
          watch = function () { if (S.obj === "solar" && S.meter === "carbon" && S.L === 0 && S.R === 3) { api.saw(lineSolar(D)); api.done(); } };
        } },
      { text: "Now a gas plant: inside a boundary at its stack it emits " + D.objects.gas.carbon.run.v + " g CO₂e per kWh, NREL's median. Drag the left edge back to the gas field, where gas is produced, processed and piped.",
        build: function (act, api) {
          set({ obj: "gas", meter: "carbon", L: 2, R: 2 });
          H("p", { class: "lx-hint", html: LX.rich(stackHint(A10)) }, act);
          watch = function () { if (S.obj === "gas" && S.meter === "carbon" && S.L <= 1 && S.R >= 2) { api.saw(lineGas(D, A10)); api.done(); } };
        } },
      { text: "A brochure says gas emits " + D.objects.gas.carbon.run.v + " g per kWh and solar " + D.nrelTotals.solar + " g, so solar is " + Math.round(brochureRatio(D)) + " times cleaner. Is that comparison fair?",
        build: function (act, api) {
          watch = null; set({ obj: "gas", meter: "carbon", L: 2, R: 2 });
          var tab = H("div", { hidden: true }, act);
          var pr = LX.Predict(act, { id: "a11-brochure", fresh: true, q: "What is wrong with it?", answer: "bound",
            options: [{ value: "bound", label: "Two boundaries: the stack for gas, cradle to grave for solar" }, { value: "zero", label: "Solar's number should be 0" }, { value: "fine", label: "Nothing: both are NREL's medians" }],
            feedback: { bound: "Right: compare on one boundary.", zero: "0 is solar on site only; on that boundary gas is " + D.objects.gas.carbon.run.v + " g, so the two must match.", fine: "Both are medians, but of different boundaries." },
            onPick: function () { pr.reveal(); tab.hidden = false; api.saw(lineCompare(D)); api.done(); } });
          var g = D.objects.gas.carbon, rows = [["On site only", "0", grp(g.run.v)], ["Cradle to grave, NREL's median", String(D.nrelTotals.solar), String(D.nrelTotals.gas)],
            ["Harmonized median (middle half)", D.harmonized.solar.median + " (" + D.harmonized.solar.lo + " to " + D.harmonized.solar.hi + ")", D.harmonized.gas.median + " (" + D.harmonized.gas.lo + " to " + D.harmonized.gas.hi + ")"]];
          LX.Ledger(tab, { cls: "a11-led", caption: "g CO₂e per kWh made, on each boundary.", columns: ["Boundary", "Solar farm", "Gas plant"], rows: rows.map(function (r) { return { head: r[0], cells: [r[1], r[2]] }; }) });
          H("p", { class: "lx-hint", html: LX.rich("Harmonized: studies re-run on common assumptions; the [[interquartile-range|middle half]] of their results in brackets (crystalline panels; combined-cycle plants).") }, tab);
        } },
      { text: "Switch to water: a plant [[water-withdrawal|withdraws]] water, returns part of it and [[water-consumption|consumes]] the rest, mostly by evaporation; the split depends on the cooling. Pick two ways to cool the gas plant and compare.",
        build: function (act, api) {
          set({ obj: "gas", meter: "water", L: 0, R: 3 }); S.tried = {};
          var w = H("div", { class: "cf-ctl" }, act), id = LX.uid("a11c"); H("p", { class: "cf-ctl-l", id: id, text: "Cooling" }, w);
          var g = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, w), bs = {}, out = H("div", null, act);
          function draw() {
            Object.keys(bs).forEach(function (k) { bs[k].setAttribute("aria-pressed", String(k === S.cooling)); });
            out.innerHTML = "";
            LX.Ledger(out, { cls: "a11-led", caption: "Operation only, gallons per MWh: median (range).", columns: ["Cooling", "Withdrawn", "Consumed"],
              rows: D.cooling.map(function (c) { return { head: c.label, sub: c.how, cells: [grp(c.wd) + " (" + grp(c.wdLo) + " to " + grp(c.wdHi) + ")", grp(c.use) + " (" + grp(c.useLo) + " to " + grp(c.useHi) + ")"].map(function (t) { return c.id === S.cooling ? { text: t, cls: "a11-pick" } : t; }) }; }) });
          }
          D.cooling.forEach(function (c) {
            var b = H("button", { type: "button", text: c.label }, g); bs[c.id] = b;
            b.addEventListener("click", function () { S.cooling = c.id; S.tried[c.id] = 1; keep(); box.paint(); buildExplain(); draw(); api.saw(lineWater(D, c.id)); if (Object.keys(S.tried).length >= 2) api.done(); });
          });
          draw();
          var u = D.usgs;
          H("p", { class: "lx-hint", text: "U.S. power plants withdrew " + (u.freshWithdrawal / 1000).toFixed(1) + " billion gallons of fresh water a day in " + u.year + " and consumed " + (u.consumptive / 1000).toFixed(1) + " billion, about " + Math.round(u.consumptive / u.freshWithdrawal * 100) + "% (USGS)." }, act);
          watch = null;
        } },
      { text: "Switch to [[land-use-intensity|land]], the square metres held for each MWh made in a year: solar's lies under its arrays, most of gas's at wells, roads and pipelines. Now count the land between them too.",
        build: function (act, api) {
          set({ obj: "solar", meter: "land", L: 0, R: 3 }); watch = null;
          var out = H("div", null, act);
          function draw() {
            out.innerHTML = "";
            LX.Ledger(out, { cls: "a11-led", caption: "m² held per MWh made in a year.", columns: ["Counted", "Solar farm", "Gas plant"],
              rows: [{ head: "Footprint", sub: "arrays; well pads, roads, pipelines, plant", cells: [num("land", landPv(D, false)), num("land", landGas(D, false))] },
                     { head: "With the land between", sub: "arrays scaled to one plant's lease (illustrative); the whole gas field", cells: [num("land", landPv(D, true)), num("land", landGas(D, true))] }] });
          }
          LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Land counted" }, act), { label: "Count the land between", on: S.wide,
            onChange: function (on) { S.wide = on; keep(); box.paint(); buildExplain(); api.saw(lineLand(D, on)); api.done(); } });
          draw();
          if (S.wide) { api.saw(lineLand(D, true)); api.done(); }
          H("p", { class: "lx-hint", text: "Land held is not all land lost: what else it can do differs by site. Count what a decision needs, and say which." }, act);
        } },
      { text: "A data center is a load, so count per MWh it uses: at its fence it consumes cooling water. Drag the boundary to take in the power plants that make its electricity.",
        build: function (act, api) {
          set({ obj: "dc", meter: "water", L: 2, R: 2 });
          H("p", { class: "lx-hint", html: LX.rich("Per MWh used is a different [[functional-unit|functional unit]] from per MWh made: compare a data center with other loads, not with plants.") }, act);
          watch = function () { if (S.obj === "dc" && S.L <= 1 && S.R >= 2) { api.saw(lineDC(D, F8)); api.done(); } };
        } },
      { text: "Two questions about a new solar farm: [[attributional-analysis|attributional]], what share of today's burdens is its own, and [[consequential-analysis|consequential]], what changes because it is built. Pick what its output replaces.",
        build: function (act, api) {
          set({ obj: "solar", meter: "carbon", L: 0, R: 3 }); watch = null;
          var w = H("div", { class: "cf-ctl" }, act), id = LX.uid("a11q"); H("p", { class: "cf-ctl-l", id: id, text: "Its output replaces" }, w);
          var g = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, w), bs = {}, chipsC = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), note = H("p", { class: "lx-hint" }, act);
          function draw() {
            Object.keys(bs).forEach(function (k) { bs[k].setAttribute("aria-pressed", String(k === S.cons)); });
            chipsC.innerHTML = "";
            var a = H("div", { class: "lx-readout" }, chipsC); H("span", { text: "Attributional: its share" }, a); H("b", { text: "about " + D.nrelTotals.solar + " g per kWh" }, a);
            if (S.cons) { var v = consequential(D, S.cons), c = H("div", { class: "lx-readout " + (v < 0 ? "good" : "bad") }, chipsC); H("span", { text: "Consequential: against not building it" }, c); H("b", { text: consArith(D, S.cons) + " g per kWh" }, c);
              note.textContent = D.consequential.filter(function (x) { return x.id === S.cons; })[0].note; }
          }
          D.consequential.forEach(function (c) {
            var b = H("button", { type: "button", text: c.label }, g); bs[c.id] = b;
            b.addEventListener("click", function () { S.cons = c.id; keep(); draw(); buildExplain(); api.saw(lineCons(D, c.id)); api.done(); });
          });
          draw(); if (S.cons) { api.saw(lineCons(D, S.cons)); api.done(); }
          H("p", { class: "lx-hint", html: "Illustrative arithmetic on NREL's medians; a real consequential study models which plants respond. " + ref("A10") + " does that hour by hour for a data center." }, act);
        } },
      { text: "A drought ties water and power: less water behind the dams means less hydropower, and the gas plants that fill the gap need cooling water. Switch California's summer to EIA's drought case.",
        build: function (act, api) {
          watch = null;
          var parts = [{ key: "hydro", label: "Hydropower", color: "var(--lx-hyd)" }, { key: "gas", label: "Natural gas", color: "var(--lx-cc)" }, { key: "other", label: "Other in-state sources", color: "var(--lx-line-2)" }];
          function vals(k) { var s = D.drought.summer[k]; return { hydro: s.hydro, gas: s.gas, other: 100 - s.hydro - s.gas }; }
          var holder = H("div", null, act), cs = null;
          function draw() {
            holder.innerHTML = "";
            var cases = [["median", "Median water year"], ["drought", "Drought case"]].filter(function (r) { return r[0] === "median" || S.drought; });
            cs = LX.CostSplit(holder, { parts: parts, scale: 100, fmt: function (v) { return Math.round(v) + "%"; },
              rows: cases.map(function (r) { var v = vals(r[0]); return { key: r[0], label: r[1], values: v, total: 100, aria: r[1] + ": hydropower " + v.hydro + "%, natural gas " + v.gas + "%, other in-state sources " + v.other + "% of California's summer generation." }; }) });
            LX.Ledger(holder, { cls: "a11-led a11-dr", caption: "Shares of California's summer generation, % (EIA's model).", columns: ["Water year", "Hydropower", "Natural gas", "Other in-state"],
              rows: cases.map(function (r) { var v = vals(r[0]); return { head: r[1], cells: [v.hydro + "%", v.gas + "%", v.other + "%"] }; }) });
          }
          LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Water year" }, act), { label: "Drought case (EIA, May 2022)", on: S.drought,
            onChange: function (on) { S.drought = on; keep(); draw(); api.saw(lineDrought(D, on)); if (on) api.done(); } });
          draw(); if (S.drought) { api.saw(lineDrought(D, true)); api.done(); }
          H("p", { class: "lx-hint", text: "In 2021 California's hydropower made " + D.drought.ca2021Below + "% less than its 2011–2020 average (EIA)." }, act);
          H("p", { class: "lx-hint", html: "Plants cooled by rivers can be forced to cut output when the water runs warm or low: " + ref("A9") + " stress-tests it. EIA did not expect a significant effect in California in 2022." }, act);
          H("p", { class: "lx-hint", text: "A data center's indirect water sits in these plants and reservoirs: LBNL names thermal plants' cooling and hydropower reservoirs' evaporation." }, act);
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });

    // ---------- the explain layer, with the reader's choices
    var xhost = document.getElementById("a11-explain");
    function buildExplain() {
      if (!xhost) return;
      var o = { cooling: S.cooling, wide: S.wide }, cool = coolingOf(D, S.cooling);
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var row = function (k) { return function (m) { var r = full(D, k, m, o), wn = wholeNote(D, k, m, 0, 3); return totalText(m, r) + (wn ? " (" + wn + ")" : ""); }; };
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), {
        title: "Three footprints, cradle to grave", text: true,
        caption: "Your choices: " + cool.label.toLowerCase() + " cooling; land " + (S.wide ? "with the land between" : "as footprints") + ". Medians and 2023 averages; stages not counted are flagged.",
        columns: [{ key: "name", label: "Object", main: true }, { key: "c", label: "Carbon" }, { key: "w", label: "Water consumed" }, { key: "l", label: "Land" }],
        rows: [["solar", "var(--lx-solar)"], ["gas", "var(--lx-cc)"], ["dc", "var(--lx-dr)"]].map(function (x) {
          var f = row(x[0]); return { key: x[0], color: x[1], name: D.objects[x[0]].name, note: D.objects[x[0]].per, c: f("carbon"), w: f("water"), l: f("land") }; }) });
      LX.ConceptMap(H("div", { class: "lx-xcard" }, xhost), { title: "The ideas, and how they connect", lede: "Tap an idea.",
        groups: { frame: ["Framing", "var(--lx-accent)"], foot: ["Footprints", "var(--lx-tier-3)"], q: ["Questions", "var(--lx-warn)"] },
        nodes: [
          { id: "fu", g: "frame", label: "Functional unit", lines: ["Functional", "unit"], text: "What one unit of service is: a kWh made, or a MWh a data center uses.", at: [0, 0], atN: [0, 0] },
          { id: "bound", g: "frame", label: "Boundary", text: "Which life-cycle stages are counted: on site only, supply and site, or cradle to grave.", at: [1.5, 0], atN: [2, 0] },
          { id: "carbon", g: "foot", label: "Carbon", text: "Solar is mostly in Build; gas is mostly in burning and supply.", at: [0, 1], atN: [0, 1] },
          { id: "water", g: "foot", label: "Water", text: "Withdrawn is not consumed: once-through cooling takes a lot and returns most.", at: [1.5, 1], atN: [1, 1.6] },
          { id: "land", g: "foot", label: "Land", text: "Footprint or the land between: the order can reverse.", at: [3, 1], atN: [2, 1] },
          { id: "attr", g: "q", label: "Attributional", text: "Its share of today's burdens, from average data.", at: [0, 2], atN: [0, 2.4] },
          { id: "cons", g: "q", label: "Consequential", lines: ["Conse-", "quential"], text: "What changes because of a decision; it depends on what responds.", at: [1.3, 2], atN: [2, 2.4] },
          { id: "drought", g: "q", label: "Drought", text: "Less hydropower and more gas burned; more cooling-water demand is possible, not calculated here.", at: [3, 2], atN: [1, 3.2] }
        ],
        edges: [["fu", "bound", "sets the frame for"], ["bound", "carbon", "decides"], ["bound", "water", "decides"], ["bound", "land", "decides"], ["carbon", "attr", "answers"], ["carbon", "cons", "answers"], ["drought", "water", "tightens"]],
        cols: 4, rows: 3, colsN: 3, rowsN: 4, gameLabel: "In this lesson" });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where these footprints hold",
        holds: ["each number is a published median for its technology and stage, or a 2023 U.S. average, not one real plant; solar's land between is an illustrative scaling;", "carbon in CO₂ equivalents: methane and other gases converted to CO₂'s warming effect;", "water is consumption in U.S. conditions, with making and building where the reviews count them; land is held area, not damage to it;", "the data center is the 2023 U.S. average of LBNL's report."],
        leaves: ["one site's sun, gas field, river or grid: ranges show how far a real plant can sit from the median;", "the land of mines and factories;", "a data center's servers, buildings and site;", "air pollution and health."],
        source: "Sources: NREL (2021), Meldrum et al. (2013), Macknick et al. (2012), Bolinger and Bolinger (2022), Lovering et al. (2022), LBNL (2024), EIA and USGS; dates in Sources below." });
      H("p", { class: "lx-hint", html: "Air pollution and health, from a tonne of fuel to the people who breathe it: " + ref("F11") + "." }, xhost);
    }

    buildExplain();
    LX.demo(root, function (state) {
      if (state === "mid") { cards.go(1); set({ obj: "gas", meter: "carbon", L: 1, R: 2 }); return { view: "gas plant with its fuel supply" }; }
      if (state === "water") { cards.go(3); set({ obj: "gas", meter: "water", L: 0, R: 3, cooling: "once" }); return { view: "once-through cooling" }; }
      if (state === "dc") { cards.go(5); set({ obj: "dc", meter: "water", L: 1, R: 2 }); return { view: "data center with its power" }; }
      function press(re) { var b = cards.el.querySelectorAll("button"); for (var i = 0; i < b.length; i++) if (re.test(b[i].textContent)) { b[i].click(); return; } }
      if (state === "cons") { cards.go(6); press(/^Gas plants run less/); return { view: "the consequential change against not building the farm" }; }
      if (state === "drought") { S.drought = false; cards.go(7); var tg = cards.el.querySelector(".lx-toggle"); if (tg) tg.click(); return { view: "the drought case with its table" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, D: D, S: S, cards: cards, box: box };
  });
})();
