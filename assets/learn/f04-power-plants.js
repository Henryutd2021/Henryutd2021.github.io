// f04-power-plants.js — F4, "How do power plants turn heat, water, wind and sunlight into electricity?" (step cards).
//
// Data: assets/learn/data/f04-power-plants.json (sources, plants, scenes, toy settings; every real number with its source
// and date), town.json (Prairie Town's fleet, illustrative), town_year.json (the Southwest Power Pool's 2025 hourly shapes,
// EIA-930) and path.json (lesson links). LX.Sankey, the Sankey F3 and F4 share, is in the bundle (components/sankey.js).
//
// Closed-form model (pure, exported for Node):
//   share(p, btu)         the share of the energy going in that reaches the wire, per 100 units: thermal plants
//                         100 x 3,412 Btu / heat rate (EIA's 2025 tested heat rates), to one decimal; the others EIA's
//                         notional efficiency (AER 2010, Table F1) or its description of today's best solar modules
//   sankeySpec(p, D)      the plant's 100 units as a Sankey: energy in -> electricity and losses (ids in, elec, loss)
//   effFromHeatRate(hr)   3,412 / hr (a fraction)
//   solarDays(Y, D)       the three real September 2025 days of the SPP solar shape, scaled the lesson-0 way to the
//                         200 MW farm (MW = round(shape x 200)): MW per hour, energy (MWh), the day's capacity factor,
//                         peak, and the largest midday fall from one hour to the next (into the hours from 10:00 to
//                         16:00, so sunrise and sunset do not count)
//   hydroMW(H, Q, h)      rho x g x Q x H x eta / 1e6 (MW); reservoirHours(V, Q) = V / (Q x 3,600)
//   gasNeed(town, Y)      lesson 0's day (3 September 2025) prepared exactly as grid-operator.js prepare() does: the gas
//                         each hour must supply (demand - nuclear - wind - solar, rounded to the 5 MW step)
//   rampRun(need, o)      the combined-cycle plant follows the need hour by hour within its ramp limit and size (greedy,
//                         from its start level); the peaker fills what is missing up to its size; what is still missing
//                         is short (MW, = MWh in one hour); a fall faster than the ramp leaves the plant above the need
//                         (over, MW). The hour balances only with nothing short and nothing over (tot.balanced): nothing
//                         else in the toy can take the extra, so the step asks for both
//   fuelBtu(hr, mw, dt)   fuel burned in a time step: 1,000 kW per MW x heat rate (Btu/kWh) x output (MW) x dt (h)
//   reservoirMWh(V, H, h) electricity in the toy reservoir's water: rho x g x H x V x eta / 3.6e9 (no inflow, constant
//                         head and efficiency) = hydroMW x reservoirHours at any flow
//   plantNote, predictText, compareText, dayText, rampText, rampFeedback   the feedback sentences, pure so the test can
//                         read each one's numbers against the model and its length against the text budget
// Units: one hour per step, so MW held for an hour = MWh. Prairie Town, its plants' sizes and ramp, the hydro plant and
// its reservoir are illustrative; the solar shapes and the plant data are real (see the data file). Thermal shares are
// full-load test values (EIA Table 8.2), not a year's measured fuel use; the solar share is DC at the module.
//
// Lesson-local component (used by this page only): PlantExplorer (six cutaways, a keyboard rail, the energy chain,
// a text version). Shared: LX.StepCards, LX.Predict, LX.Sankey (components/sankey.js), LX.NumAnswer, LX.Plot/LX.PlotCard, LX.Slider,
// LX.Toggle, LX.CardSort, LX.CompareTable.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  var HOURS = 24;
  function round1(v) { return Math.round(v * 10) / 10; }
  function effFromHeatRate(hr, btu) { return (btu || 3412) / hr; }
  function share(p, btu) { return p.kind === "thermal" ? round1(100 * effFromHeatRate(p.heatRate, btu)) : p.share; }
  function lost(p, btu) { return round1(100 - share(p, btu)); }
  function plantByKey(D, k) { return D.plants.filter(function (p) { return p.key === k; })[0]; }
  function sankeySpec(p, D) {
    var s = share(p, D.meta.btuPerKWh), l = round1(100 - s);
    return {
      nodes: [
        { id: "in", label: p.inLabel, short: "Energy in", col: 0, color: p.color },
        { id: "elec", label: p.outLabel || "Electricity to the wire", short: p.outShort || "Electricity", col: 1, color: "var(--lx-good)" },
        { id: "loss", label: p.lossLabel, short: p.lossShort, col: 1, kind: "loss", color: "var(--lx-ink-3)" }
      ],
      links: [{ from: "in", to: "elec", value: s, color: "var(--lx-good)" }, { from: "in", to: "loss", value: l }]
    };
  }
  function daySlice(Y, date, off) {
    var t0 = Date.parse(Y.start_utc + "Z"), d0 = Date.parse(date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (off || 0);
    if (i < 0 || i + HOURS > Y.solar.length) throw new Error("date " + date + " is outside the year file");
    return { demand: Y.demand.slice(i, i + HOURS), wind: Y.wind.slice(i, i + HOURS), solar: Y.solar.slice(i, i + HOURS) };
  }
  function solarDays(Y, D) {
    var S = D.solar;
    return S.days.map(function (d) {
      var mw = daySlice(Y, d.date, S.utcOffsetHours).solar.map(function (v) { return Math.round(v / 1000 * S.farmMW); });
      var energy = mw.reduce(function (a, b) { return a + b; }, 0), peak = Math.max.apply(null, mw), drop = { mw: 0, hour: null };
      for (var t = S.midFrom; t <= S.midTo; t++) if (mw[t - 1] - mw[t] > drop.mw) drop = { mw: mw[t - 1] - mw[t], hour: t };
      return { key: d.key, date: d.date, label: d.label, long: d.long, note: d.note, mw: mw, energy: energy,
               cf: energy / (S.farmMW * HOURS), peak: peak, peakHour: mw.indexOf(peak), drop: drop };
    });
  }
  function hydroMW(Hm, Q, h) { return h.rho * h.g * Q * Hm * h.eta / 1e6; }
  function reservoirHours(V, Q) { return V / (Q * 3600); }
  // lesson 0's prepare() for its scenario, without its game fields: the gas need of each hour
  function gasNeed(town, Y) {
    var sc = town.scenarios.lesson0, f = town.fleet, d = daySlice(Y, sc.date, sc.utcOffsetHours), step = sc.step;
    var wind = d.wind.map(function (v) { return Math.round(v / 1000 * f.wind.mw); });
    var solar = d.solar.map(function (v) { return Math.round(v / 1000 * f.solar.mw); });
    var raw = d.demand.map(function (v) { return v / 1000 * sc.demandPeakMW; });
    return raw.map(function (v, t) { return Math.round((v - f.nuclear.mw - wind[t] - solar[t]) / step) * step; });
  }
  function rampRun(need, o) {
    var cc = [], pk = [], short = [], over = [], prev = o.ccStart, tot = { short: 0, pk: 0, over: 0, firstShort: null, firstOver: null };
    for (var t = o.from; t <= o.to; t++) {
      var lo = Math.max(0, prev - o.ramp), hi = Math.min(o.ccMax, prev + o.ramp);
      var c = t === o.from ? Math.min(o.ccMax, Math.max(0, o.ccStart)) : Math.max(lo, Math.min(hi, need[t]));
      var gap = Math.max(0, need[t] - c), p = o.peaker ? Math.min(o.pkMax, gap) : 0, s = gap - p, ov = Math.max(0, c - need[t]);
      cc.push(c); pk.push(p); short.push(s); over.push(ov);
      tot.short += s; tot.pk += p; tot.over += ov;
      if (s > 0 && tot.firstShort === null) tot.firstShort = t;
      if (ov > 0 && tot.firstOver === null) tot.firstOver = t;
      prev = c;
    }
    tot.balanced = tot.short === 0 && tot.over === 0;
    return { hours: need.slice(o.from, o.to + 1).map(function (v, i) { return o.from + i; }), need: need.slice(o.from, o.to + 1), cc: cc, pk: pk, short: short, over: over, tot: tot };
  }
  // the smallest ramp limit on the slider that balances every hour without the peaker (null if none)
  function rampNeeded(need, o) {
    for (var r = o.rampMin; r <= o.rampMax; r += o.rampStep) {
      var x = rampRun(need, { from: o.from, to: o.to, ccStart: o.ccStart, ccMax: o.ccMax, pkMax: o.pkMax, ramp: r, peaker: false });
      if (x.tot.balanced) return r;
    }
    return null;
  }
  function fuelBtu(hr, mw, dt) { return 1000 * hr * mw * dt; }
  function reservoirMWh(V, Hm, h) { return h.rho * h.g * Hm * V * h.eta / 3.6e9; }
  function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function fmtShare(v) { return v % 1 === 0 ? String(v) : fmt1(v); }
  // a share as the page prints it: thermal plants to one decimal (34.0), typical values as whole numbers (16)
  function shareText(p, btu) { return p.kind === "thermal" ? fmt1(share(p, btu)) : String(share(p, btu)); }
  function unitsFmt(p) { return function (v) { return v === 100 ? "100" : p.kind === "thermal" ? fmt1(v) : String(Math.round(v)); }; }

  // ---- the feedback sentences (pure: the test reads their numbers and their length). "**" marks bold, double brackets a
  // glossary term (LX.rich renders both); plantNote returns HTML.
  function intS(v) { return Math.round(v).toLocaleString("en-US"); }
  function hh(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function escT(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function plantNote(p, D) {
    var btu = D.meta.btuPerKWh, s = share(p, btu), name = "<b>" + escT(p.name) + "</b>: ";
    if (p.kind === "thermal") return name + shareText(p, btu) + " of 100 units reach the wire at full load: " + intS(btu) + " ÷ " + intS(p.heatRate) + ' <span class="lx-term" data-term="btu">Btu</span> per kWh (EIA\'s 2025 tested heat rate).';
    if (p.key === "pv") return name + p.shareWord + " " + s + " of 100 units leave the module as direct current (EIA: the best modules approach " + s + "%); the inverter and wiring lose some more before the grid.";
    var base = name + (p.shareWord ? p.shareWord + " " : "about ") + s + " of 100 units reach the wire";
    if (p.key === "wind") return base + " (EIA's typical value at rated wind speed); no rotor can catch more than " + D.facts.betz.value + "% of the wind's power.";
    if (p.key === "hydro") return base + " (EIA's typical value): water turbines lose little.";
    return base + " (EIA's typical value): its heat is cooler than a boiler's, so less of it becomes electricity.";
  }
  function predictText(v, D) {
    var btu = D.meta.btuPerKWh, p = plantByKey(D, v), g = plantByKey(D, "geo");
    return (v === D.predict.answer ? "Right: " : "Not quite: ") + "the geothermal plant sends about " + shareText(g, btu) + " of 100 to the wire" + (v !== "geo" ? "; your " + p.short.toLowerCase() + " sends " + shareText(p, btu) : "") + ". Its heat is only " + D.facts.geoTempF.lo + " to " + D.facts.geoTempF.hi + " °F, and cooler heat turns into less electricity.";
  }
  function compareText(viewed, D) {
    var btu = D.meta.btuPerKWh, sh = function (k) { return share(plantByKey(D, k), btu); };
    var best = viewed.slice().sort(function (a, b) { return sh(b) - sh(a); })[0], worst = viewed.slice().sort(function (a, b) { return sh(a) - sh(b); })[0];
    return "Of the plants you opened, **" + plantByKey(D, best).short + "** turns the most into electricity (" + shareText(plantByKey(D, best), btu) + " of 100) and **" + plantByKey(D, worst).short + "** the least (" + shareText(plantByKey(D, worst), btu) + "). Heat plants lose most as [[waste-heat|waste heat]].";
  }
  function dayText(days) {
    var c = days[0], o = days[2];
    return "The low-output day made **" + intS(o.energy) + " MWh**, " + Math.round(o.energy / c.energy * 100) + "% of the high-output day's " + intS(c.energy) + " MWh six days later. Same panels: clouds or haze could explain the gap, but output alone cannot show the cause.";
  }
  function rampText(st, x, D, town) {
    var ct = plantByKey(D, "ct"), cc = plantByKey(D, "cc"), more = Math.round((ct.heatRate / cc.heatRate - 1) * 100);
    if (st.pk && x.tot.pk > 0) return "Every hour matched: the peaker filled **" + x.tot.pk + " MWh**. Fast but thirsty: at full load it burns about " + more + "% more gas per kWh than the combined cycle (EIA's tested heat rates).";
    return "Every hour matched: at " + st.r + " MW per hour the combined-cycle plant keeps up on its own. Prairie Town's own plant manages " + town.fleet.cc.ramp + " MW per hour (illustrative).";
  }
  function rampFeedback(st, x) {
    var t = x.tot;
    if (t.short > 0 && t.over > 0) return "Short by **" + t.short + " MWh** (first at " + hh(t.firstShort) + ") and **" + t.over + " MWh** too much (first at " + hh(t.firstOver) + "): at " + st.r + " MW per hour the combined-cycle plant can neither climb nor turn down fast enough.";
    if (t.short > 0) return "Short by **" + t.short + " MWh**, first at " + hh(t.firstShort) + ": climbing at most " + st.r + " MW per hour, the combined-cycle plant falls behind the need.";
    return "Nothing short, but **" + t.over + " MWh** too much, first at " + hh(t.firstOver) + ": at " + st.r + " MW per hour the combined-cycle plant cannot turn down as fast as the need falls. Raise the ramp limit.";
  }
  var model = { share: share, lost: lost, sankeySpec: sankeySpec, effFromHeatRate: effFromHeatRate, daySlice: daySlice,
                solarDays: solarDays, hydroMW: hydroMW, reservoirHours: reservoirHours, reservoirMWh: reservoirMWh, fuelBtu: fuelBtu,
                gasNeed: gasNeed, rampRun: rampRun, rampNeeded: rampNeeded, plantByKey: plantByKey, fmt1: fmt1, fmtShare: fmtShare,
                shareText: shareText, unitsFmt: unitsFmt, round1: round1, hh: hh,
                plantNote: plantNote, predictText: predictText, compareText: compareText, dayText: dayText, rampText: rampText, rampFeedback: rampFeedback };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, LESSON = "f04-power-plants";
  var int = function (v) { return Math.round(v).toLocaleString("en-US"); };

  // ---- the six cutaways (viewBox 400 x 230); class names (f4c-) are styled from the page's tokens
  function arrow(x1, y1, x2, y2, cls) {
    var a = Math.atan2(y2 - y1, x2 - x1), s = 7, p1 = [x2 - s * Math.cos(a - .45), y2 - s * Math.sin(a - .45)], p2 = [x2 - s * Math.cos(a + .45), y2 - s * Math.sin(a + .45)];
    return '<path class="' + (cls || "f4c-flow") + '" d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '"/><path class="' + (cls || "f4c-flow") + ' head" d="M' + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + "L" + x2 + " " + y2 + "L" + p2[0].toFixed(1) + " " + p2[1].toFixed(1) + '"/>';
  }
  function genBox(x, y, lbl) { return '<rect class="f4c-gen" x="' + x + '" y="' + y + '" width="40" height="34" rx="5"/><path class="f4c-coil" d="M' + (x + 8) + " " + (y + 17) + "h24M" + (x + 8) + " " + (y + 11) + "h24M" + (x + 8) + " " + (y + 23) + 'h24"/>' + (lbl ? '<text class="f4c-t" x="' + (x + 20) + '" y="' + (y + 50) + '" text-anchor="middle">' + lbl + "</text>" : ""); }
  function tower(x, y) { return '<path class="f4c-tower" d="M' + x + " " + (y + 70) + " C" + (x + 10) + " " + (y + 40) + " " + (x + 6) + " " + (y + 18) + " " + (x + 2) + " " + y + " L" + (x + 52) + " " + y + " C" + (x + 48) + " " + (y + 18) + " " + (x + 44) + " " + (y + 40) + " " + (x + 54) + " " + (y + 70) + ' Z"/><path class="f4c-vapour" d="M' + (x + 14) + " " + (y - 6) + " q6 -10 0 -18 M" + (x + 27) + " " + (y - 6) + " q6 -12 0 -22 M" + (x + 40) + " " + (y - 6) + ' q6 -10 0 -18"/>'; }
  function turbineShape(x, y, w, h0, h1, cls) { return '<path class="' + (cls || "f4c-turb") + '" d="M' + x + " " + (y - h0 / 2) + "L" + (x + w) + " " + (y - h1 / 2) + "L" + (x + w) + " " + (y + h1 / 2) + "L" + x + " " + (y + h0 / 2) + 'Z"/><path class="f4c-blades" d="M' + (x + w * .3) + " " + (y - h0 * .35) + "v" + h0 * .7 + "M" + (x + w * .55) + " " + (y - (h0 + h1) * .2) + "v" + (h0 + h1) * .4 + "M" + (x + w * .8) + " " + (y - h1 * .38) + "v" + h1 * .76 + '"/>'; }
  var SCENE = {
    gas: function () {
      return '<rect class="f4c-sky" width="400" height="230"/><rect class="f4c-ground" y="196" width="400" height="34"/>' +
        genBox(10, 98, "generator") + '<path class="f4c-shaft" d="M50 115H64"/>' +
        '<g class="f4c-hl">' + '<path class="f4c-turb" d="M64 92L112 104L112 126L64 138Z"/>' +
        '<rect class="f4c-comb" x="112" y="100" width="24" height="30" rx="4"/><path class="f4c-flame" d="M124 124c-6-4-6-10 0-16 1 4 3 5 5 6 0-4 2-7 4-8-1 6 3 8 3 12 0 5-5 8-12 6z"/>' +
        turbineShape(136, 115, 46, 30, 54) + "</g>" +
        arrow(72, 58, 76, 88, "f4c-flow air") + '<text class="f4c-t" x="58" y="52">air</text>' +
        arrow(124, 62, 124, 96, "f4c-flow fuel") + '<text class="f4c-t" x="112" y="56">gas</text>' +
        '<rect class="f4c-duct" x="182" y="96" width="18" height="38"/>' +
        '<rect class="f4c-hrsg" x="200" y="72" width="56" height="94" rx="4"/><path class="f4c-tubes" d="M210 86h36l-36 12h36l-36 12h36l-36 12h36l-36 12h36"/>' +
        '<rect class="f4c-stack" x="238" y="26" width="14" height="46"/>' + '<path class="f4c-vapour" d="M241 20q5-8 0-14M249 20q5-8 0-14"/>' +
        '<path class="f4c-pipe steam" d="M220 72V52H300V92"/>' + turbineShape(286, 112, 40, 26, 44) +
        '<path class="f4c-shaft" d="M326 112H340"/>' + genBox(340, 95, "generator") +
        '<path class="f4c-pipe steam" d="M306 130V146"/>' + arrow(258, 45, 280, 45, "f4c-flow") +
        '<rect class="f4c-cond" x="282" y="146" width="48" height="22" rx="4"/><path class="f4c-pipe water" d="M306 168V182H228V166"/>' + arrow(298, 176, 278, 176, "f4c-flow water") +
        '<text class="f4c-t b" x="82" y="160">gas turbine</text><text class="f4c-t" x="82" y="174">(a peaker alone)</text>' +
        '<text class="f4c-t" x="228" y="184" text-anchor="middle">exhaust-heated</text><text class="f4c-t" x="228" y="198" text-anchor="middle">boiler (HRSG)</text><text class="f4c-t b" x="306" y="74" text-anchor="middle">steam turbine</text>' +
        '<text class="f4c-t" x="306" y="216" text-anchor="middle">condenser</text>';
    },
    steam: function (bare) {
      var fl = "";
      for (var k = 0; k < 4; k++) fl += '<path class="f4c-flame" d="M' + (34 + k * 14) + ' 176c-5-4-5-10 0-15 1 4 3 5 4 6 0-4 2-6 3-7-1 6 3 8 3 11 0 5-4 7-10 5z"/>';
      return '<rect class="f4c-sky" width="400" height="230"/><rect class="f4c-ground" y="196" width="400" height="34"/>' +
        '<rect class="f4c-boiler" x="22" y="56" width="74" height="132" rx="6"/><path class="f4c-tubes" d="M34 70v84M46 70v84M58 70v84M70 70v84M82 70v84"/>' + fl +
        '<rect class="f4c-stack" x="70" y="18" width="14" height="38"/><path class="f4c-vapour" d="M73 12q5-8 0-14M81 12q5-8 0-14"/>' +
        arrow(4, 182, 22, 182, "f4c-flow fuel") + (bare ? "" : '<text class="f4c-t" x="6" y="212">fuel</text>') +
        '<path class="f4c-pipe steam" d="M60 56V40H146V84"/>' + turbineShape(136, 104, 54, 30, 52) +
        '<path class="f4c-shaft" d="M190 104H204"/>' + genBox(204, 87, bare ? "" : "generator") +
        '<path class="f4c-pipe steam" d="M176 127V140"/>' + arrow(96, 33, 118, 33, "f4c-flow") +
        '<rect class="f4c-cond" x="132" y="140" width="68" height="28" rx="4"/>' +
        '<path class="f4c-pipe water" d="M166 168V182H96"/>' + arrow(120, 176, 100, 176, "f4c-flow water") +
        '<path class="f4c-pipe cool" d="M200 150H300M200 160H300"/>' + tower(296, 120) + (bare ? "" :
        '<text class="f4c-t b" x="59" y="206" text-anchor="middle">boiler</text><text class="f4c-t b" x="163" y="74" text-anchor="middle">steam turbine</text>' +
        '<text class="f4c-t" x="166" y="158" text-anchor="middle">condenser</text><text class="f4c-t" x="131" y="195" text-anchor="middle">pump</text>' +
        '<text class="f4c-t" x="323" y="216" text-anchor="middle">cooling tower</text>');
    },
    hydro: function () {
      return '<rect class="f4c-sky" width="400" height="230"/><path class="f4c-ground" d="M0 196H400V230H0Z"/>' +
        '<path class="f4c-water" d="M0 62H160V196H0Z"/><path class="f4c-wave" d="M10 70q8-5 16 0t16 0M70 80q8-5 16 0t16 0M24 100q8-5 16 0t16 0"/>' +
        '<path class="f4c-dam" d="M156 48H182L214 198H150Z"/>' +
        '<path class="f4c-pen" d="M166 150L250 186"/><text class="f4c-t" x="196" y="150">penstock</text>' +
        '<rect class="f4c-house" x="246" y="160" width="72" height="40" rx="3"/><circle class="f4c-wheel" cx="268" cy="186" r="11"/><path class="f4c-blades" d="M268 175v22M257 186h22"/>' +
        '<path class="f4c-shaft" d="M268 175V164"/>' + genBox(276, 132, "") + '<text class="f4c-t" x="296" y="126" text-anchor="middle">generator</text>' +
        '<path class="f4c-water" d="M318 196H400V214H318Z"/>' + arrow(322, 206, 356, 206, "f4c-flow water") +
        '<path class="f4c-head" d="M120 64V194M114 70L120 62L126 70M114 188L120 196L126 188"/><text class="f4c-t b" x="96" y="134" text-anchor="end">head</text>' +
        '<text class="f4c-t b" x="40" y="56">reservoir</text><text class="f4c-t" x="186" y="40" text-anchor="middle">dam</text>' +
        '<text class="f4c-t" x="282" y="222" text-anchor="middle">turbine</text><text class="f4c-t" x="372" y="190" text-anchor="middle">river</text>';
    },
    geo: function () {
      return '<rect class="f4c-sky" width="400" height="230"/><rect class="f4c-ground" y="120" width="400" height="110"/>' +
        '<path class="f4c-rock" d="M0 150H400M0 176H400"/><rect class="f4c-hot" y="198" width="400" height="32"/>' +
        '<text class="f4c-t" x="200" y="220" text-anchor="middle">hot rock and water, 300 to 700 °F</text>' +
        '<path class="f4c-pipe hotw" d="M60 200V96H112"/>' + arrow(52, 180, 52, 132, "f4c-flow hot") +
        '<rect class="f4c-sep" x="112" y="76" width="30" height="40" rx="10"/><text class="f4c-t" x="127" y="66" text-anchor="middle">flash</text>' +
        '<path class="f4c-pipe steam" d="M142 86H170"/>' + turbineShape(170, 90, 44, 26, 44) +
        '<path class="f4c-shaft" d="M214 90H226"/>' + genBox(226, 73, "generator") +
        '<path class="f4c-pipe water" d="M127 116V128H318V200"/>' + arrow(330, 140, 330, 186, "f4c-flow water") +
        tower(286, 50) +
        '<text class="f4c-t b" x="60" y="88" text-anchor="middle">well up</text><text class="f4c-t b" x="312" y="190" text-anchor="end">well down</text>' +
        '<text class="f4c-t b" x="192" y="60" text-anchor="middle">turbine</text>';
    },
    wind: function () {
      var g = '<rect class="f4c-sky" width="400" height="230"/><rect class="f4c-ground" y="200" width="400" height="30"/>' +
        '<path class="f4c-mast" d="M214 104L206 200H226L218 104Z"/>' +
        '<g class="f4c-rotor"><path class="f4c-blade" d="M172 90C166 58 168 30 176 10C182 30 182 58 176 90Z"/><path class="f4c-blade" d="M172 92C146 108 120 120 100 124C116 110 140 96 168 86Z"/><path class="f4c-blade" d="M176 94C190 118 202 140 208 162C192 148 178 126 170 98Z"/></g>' +
        '<circle class="f4c-hub" cx="174" cy="91" r="8"/>' +
        '<rect class="f4c-nac" x="182" y="78" width="96" height="28" rx="8"/><rect class="f4c-gear" x="196" y="84" width="24" height="16" rx="3"/><path class="f4c-shaft" d="M182 92H196M220 92H232"/>' +
        '<rect class="f4c-gen" x="232" y="83" width="34" height="18" rx="4"/>';
      for (var k = 0; k < 3; k++) g += arrow(14, 60 + k * 40, 70, 60 + k * 40, "f4c-flow air");
      return g + '<text class="f4c-t" x="20" y="186">wind</text><text class="f4c-t b" x="206" y="72" text-anchor="middle">gearbox</text>' +
        '<text class="f4c-t b" x="282" y="70" text-anchor="middle">generator</text><text class="f4c-t" x="128" y="150" text-anchor="middle">rotor</text>' +
        '<text class="f4c-t" x="240" y="170">tower</text><text class="f4c-t" x="300" y="98">nacelle</text>';
    },
    pv: function () {
      var g = '<rect class="f4c-sky" width="400" height="230"/><rect class="f4c-ground" y="168" width="400" height="62"/>' +
        '<circle class="f4c-sun" cx="46" cy="40" r="18"/><path class="f4c-ray" d="M70 56L112 98M80 40L150 96M60 66L84 120"/>';
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
        var x = 60 + c * 64 + r * 14, y = 128 + r * 22;
        g += '<path class="f4c-panel" d="M' + x + " " + y + "L" + (x + 50) + " " + y + "L" + (x + 40) + " " + (y + 16) + "L" + (x - 10) + " " + (y + 16) + 'Z"/>';
      }
      return g + '<path class="f4c-wire dc" d="M250 190H284"/><rect class="f4c-inv" x="284" y="172" width="40" height="36" rx="5"/><path class="f4c-acw" d="M292 194q4-8 8 0t8 0t8 0"/>' +
        '<path class="f4c-wire" d="M324 190H354V150"/><rect class="f4c-sub" x="340" y="122" width="30" height="28" rx="3"/>' +
        '<text class="f4c-t b" x="150" y="118" text-anchor="middle">panels: direct current</text><text class="f4c-t b" x="304" y="222" text-anchor="middle">inverter: AC</text>' +
        '<text class="f4c-t" x="356" y="114" text-anchor="middle">to the grid</text><text class="f4c-t" x="300" y="40">no moving parts</text>';
    }
  };
  var SCENE_ALT = {
    gas: "A combined-cycle plant: air and gas enter a gas turbine (compressor, combustor with a flame, turbine) that turns a generator; its hot exhaust passes through an exhaust-heated boiler, the heat recovery steam generator (HRSG), with a stack, whose steam drives a steam turbine and a second generator, then flows into a condenser; the water returns to the boiler. The gas turbine alone is a peaker.",
    steam: "A steam plant: fuel burns under a boiler of water tubes with a stack on top; steam drives a steam turbine and a generator, then flows down into a condenser that turns it back to water, cooled by a loop to a cooling tower; a pump returns the water to the boiler.",
    hydro: "A hydro dam: a reservoir behind a concrete dam; water falls through a penstock to a powerhouse, where a turbine turns a generator; the water leaves into the river; an arrow marks the head, the height from the reservoir surface down to the river.",
    geo: "A flash-steam geothermal plant, one of several kinds: a well brings hot water up from hot rock at 300 to 700 °F; as its pressure drops, part of it boils into steam that drives a turbine and a generator; the cooled water flows to a second well and back down; a cooling tower stands by.",
    wind: "A wind turbine: wind arrows meet three blades on a rotor hub; inside the nacelle, the equipment housing on top of the tower, a shaft turns a gearbox and a generator.",
    pv: "A solar photovoltaic farm: the sun shines on three rows of tilted panels that make direct current (DC, flowing one way); a wire runs to an inverter that makes alternating current (AC, reversing direction many times a second), then to a transformer and the grid; nothing moves."
  };

  // ---- PlantExplorer: a rail of six plants, a cutaway each, the energy chain and a text version (lesson-local)
  function PlantExplorer(host, o) {
    var S = o.scenes, w = H("div", { class: "f4x" }, host), cur = -1, seen = {};
    (o.seen || []).forEach(function (k) { seen[k] = true; });
    var rail = H("div", { class: "f4x-rail", role: "group", "aria-label": "Plants" }, w), btns = [];
    S.forEach(function (s, i) {
      var b = H("button", { type: "button", class: "f4x-stop", "aria-pressed": "false", style: "--c:" + s.color, html: LX.icon(s.icon) + "<span>" + LX.esc(s.short || s.name) + "</span>", "aria-label": s.name }, rail);
      b.addEventListener("click", function () { go(i); });
      btns.push(b);
    });
    var fig = H("figure", { class: "f4x-frame" }, w), box = H("div", { class: "f4x-svg" }, fig), cap = H("figcaption", { class: "f4x-cap", "aria-live": "polite" }, fig);
    var count = H("p", { class: "lx-hint f4x-count" }, w);
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the six plants" }, alt);
    var ul = H("ul", null, alt);
    S.forEach(function (s) { H("li", { html: "<b>" + LX.esc(s.name) + ".</b> " + LX.esc(SCENE_ALT[s.key]) + " Energy in: " + LX.esc(s.energy) + ". What spins: " + LX.esc(s.spins) + "." }, ul); });
    function go(i, quiet) {
      cur = LX.clamp(i, 0, S.length - 1); var s = S[cur]; seen[s.key] = true;
      box.innerHTML = '<svg class="f4c" viewBox="0 0 400 230" role="img" aria-label="' + LX.esc(s.name + ": " + SCENE_ALT[s.key]) + '">' + SCENE[s.key]() + "</svg>";
      cap.innerHTML = "";
      var t = H("p", { class: "f4x-title", style: "--c:" + s.color }, cap); t.innerHTML = LX.icon(s.icon) + "<b>" + LX.esc(s.name) + "</b>";
      var dl = H("dl", { class: "f4x-dl" }, cap);
      H("dt", { text: "Energy in" }, dl); H("dd", { text: s.energy }, dl);
      H("dt", { text: "What spins" }, dl); H("dd", { text: s.spins }, dl);
      var ch = H("ol", { class: "f4x-chain", "aria-label": "Energy chain" }, cap);
      s.chain.forEach(function (c) { H("li", { text: c }, ch); });
      H("p", { class: "f4x-text", html: LX.rich(s.text) }, cap);
      btns.forEach(function (b, k) { b.setAttribute("aria-pressed", k === cur ? "true" : "false"); b.classList.toggle("seen", !!seen[S[k].key]); });
      var n = Object.keys(seen).filter(function (k) { return S.some(function (x) { return x.key === k; }); }).length;
      count.textContent = n < S.length ? "Plants opened: " + n + " of " + S.length + "." : "All six plants opened.";
      if (!quiet && o.onGo) o.onGo(s.key, n);
      LX.emit("layout");
    }
    go(o.start || 0, true);
    return { el: w, go: go, seen: function () { return Object.keys(seen); } };
  }

  // a row of toggle buttons (one pressed), keyboard-friendly; returns {el, set(key)}
  function Seg(host, items, label, onPick, sel) {
    var g = H("div", { class: "lx-seg f4-seg", role: "group", "aria-label": label }, host), bs = {};
    items.forEach(function (it) {
      var b = H("button", { type: "button", "aria-pressed": it.key === sel ? "true" : "false", text: it.label }, g);
      if (it.color) b.style.setProperty("--c", it.color);
      b.addEventListener("click", function () { set(it.key); onPick(it.key); });
      bs[it.key] = b;
    });
    function set(k) { Object.keys(bs).forEach(function (x) { bs[x].setAttribute("aria-pressed", x === k ? "true" : "false"); }); }
    return { el: g, set: set };
  }

  function view(live, data, root) {
    var D = data.f04_power_plants, town = data.town, Y = data.town_year, P = data.path, btu = D.meta.btuPerKWh;
    var log = LX.store.get("f4-log", {}) || {};
    function keep(k, v) { log[k] = v; LX.store.set("f4-log", log); }
    var days = solarDays(Y, D), need = gasNeed(town, Y), R = D.ramp, Hy = D.hydro;
    var rampBase = { from: R.from, to: R.to, ccStart: R.ccStart, ccMax: town.fleet.cc.mw, pkMax: town.fleet.peaker.mw };
    var lastPlant = log.plant || "cc", hooks = {};

    var steps = [
      { text: "Most power plants spin a [[generator|generator]]; one kind does not. Open all six plants and see what each starts from and what it turns into motion.",
        build: function (act, api) {
          // the explorer shows the first plant at once and counts it as opened, so it is saved here too: the count, the
          // "All six plants opened" line and Next all read the same saved list, before and after a reload
          var seen = log.seen || [], first = D.scenes[0].key;
          if (seen.indexOf(first) < 0) { seen.push(first); keep("seen", seen); }
          PlantExplorer(act, { scenes: D.scenes, seen: seen, start: 0, onGo: function (k, n) {
            if (seen.indexOf(k) < 0) { seen.push(k); keep("seen", seen); }
            if (n >= D.scenes.length) { api.done(); api.saw("Five of the six spin a turbine that turns a generator; the solar farm has no moving parts. Most U.S. electricity comes from turbines driving generators (EIA)."); }
          } });
          if (seen.length >= D.scenes.length) api.done();
        } },
      { text: "Every plant loses some energy on the way to the wire. Lock in a guess before you look.",
        build: function (act, api) {
          var Q = D.predict;
          var p = LX.Predict(act, { id: Q.id, q: Q.q, answer: Q.answer, options: Q.options, fresh: !log.pred, lockText: "Locked in. The next step shows every plant's 100 units.",
            onPick: function (v) { keep("pred", v); api.done(); api.saw(predictText(v, D)); } });
          if (log.pred) { api.done(); }
        } },
      { text: "Follow 100 units of energy into each plant: the green band becomes electricity, the pale one is lost. Compare at least three plants.",
        build: function (act, api) {
          var viewed = log.viewed || [];
          var items = D.plants.map(function (p) { return { key: p.key, label: p.short }; });
          var seg = Seg(act, items, "Plant", function (k) { show(k); }, lastPlant);
          var curP = plantByKey(D, lastPlant);
          var sk = LX.Sankey(act, { label: "100 units of energy into a plant, out as electricity and losses", unit: "units", fmt: function (v) { return unitsFmt(curP)(v); }, height: 200, heightN: 220,
            textHead: ["From", "To", "Units of 100"], caption: "Each band's width is its share of 100 units; the bands out add up to the 100 in." });
          var note = H("p", { class: "f4-note", "aria-live": "polite" }, act);
          function show(k) {
            lastPlant = k; keep("plant", k); var p = plantByKey(D, k); curP = p;
            sk.set(sankeySpec(p, D));
            note.innerHTML = plantNote(p, D);
            if (viewed.indexOf(k) < 0) { viewed.push(k); keep("viewed", viewed); }
            if (viewed.length >= 3) { api.done(); api.saw(compareText(viewed, D)); }
            buildExplain(D, data);
          }
          seg.set(lastPlant); show(lastPlant);
        } },
      { text: "A [[heat-rate|heat rate]] is the fuel energy burned per kWh sent out. In EIA's 2025 full-load tests, U.S. coal steam plants burned 10,040 Btu per kWh: what share reaches the wire?",
        build: function (act, api) {
          var coal = plantByKey(D, "coal"), ans = share(coal, btu);
          H("p", { class: "lx-hint", text: "1 kWh of electricity = " + int(btu) + " Btu (British thermal units, a unit of heat energy)." }, act);
          var na = LX.NumAnswer(act, { label: "Share of the fuel's energy that becomes electricity", unit: "%", width: "6em", onCheck: function (v) {
            if (v === null) { api.saw("Type a percentage first, such as 30.", true); return; }
            var okv = Math.abs(v - ans) <= 0.6;
            api.saw(okv ? "**" + fmt1(ans) + "%**: 3,412 ÷ " + int(coal.heatRate) + " = " + (ans / 100).toFixed(3) + ". The other " + fmt1(lost(coal, btu)) + "% leaves as waste heat, mostly through the condenser."
                        : "Not quite: divide the energy in one kWh by the heat rate, 3,412 ÷ " + int(coal.heatRate) + ", then turn it into a percentage.", !okv);
            if (okv) { keep("hr", true); api.done(); }
          } });
          hooks.na = na; if (log.hr) api.done();
        } },
      { text: "Prairie Town's fictional 200 MW solar farm follows the regional solar fleet's output on three real days of September 2025, scaled to its size. Compare them, and open the low-output one.",
        build: function (act, api) {
          var sel = log.day || "clear", seenD = log.days || [];
          var seg = Seg(act, days.map(function (d) { return { key: d.key, label: d.label }; }), "Day", function (k) { draw(k); }, sel);
          var card = LX.PlotCard(act, { text: "Text version of the day" }), clear = days[0];
          function draw(k) {
            sel = k; keep("day", k); var d = days.filter(function (x) { return x.key === k; })[0];
            if (seenD.indexOf(k) < 0) { seenD.push(k); keep("days", seenD); }
            card.title.textContent = d.long + ": " + d.note;
            card.clear();
            card.chip("Energy made", int(d.energy) + " MWh", d.key === "overcast" ? "bad" : null);
            card.chip("Day's capacity factor", fmt1(d.cf * 100) + "%");
            card.chip("Peak hour", int(d.peak) + " MW");
            card.chip("Largest midday fall", d.drop.mw > 0 ? int(d.drop.mw) + " MW, into " + LX.fmt.hh(d.drop.hour) : "none", d.drop.mw >= 20 ? "bad" : null);
            var lines = [{ values: d.mw, x0: 0, color: "var(--lx-solar)", area: 0.18, width: 2.4, step: 1 }];
            var legend = [{ label: d.label + " (" + d.date + ")", color: "var(--lx-solar)" }];
            if (k !== "clear") { lines.unshift({ values: clear.mw, x0: 0, color: "var(--lx-ink-3)", dash: "5 4", width: 1.6, step: 1 }); legend.push({ label: clear.label + " (" + clear.date + ")", color: "var(--lx-ink-3)", dash: "5 4" }); }
            card.plot.render({
              x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [12, "12"], [24, "24"]] },
              y: { min: 0, max: 200, step: 50, fmt: LX.fmt.int, unit: "MW" }, lines: lines, legend: legend,
              refs: [{ y: D.solar.farmMW, label: "Farm size, 200 MW", labelN: "200 MW", dash: "3 3" }],
              tip: function (x) { var t = Math.floor(x); if (t < 0 || t > 23) return ""; return "<div><b>" + LX.fmt.hh(t) + "</b> " + d.mw[t] + " MW" + (k !== "clear" ? " · " + clear.label.toLowerCase() + " day " + clear.mw[t] + " MW" : "") + "</div>"; },
              aria: "Hourly output of the 200 MW solar farm on " + d.long + ": " + int(d.energy) + " MWh in the day, peak " + d.peak + " MW.",
              text: { head: ["Hour from", d.label + ", MW"].concat(k !== "clear" ? [clear.label + " day, MW"] : []), rows: d.mw.map(function (v, t) { return [LX.fmt.hh(t), String(v)].concat(k !== "clear" ? [String(clear.mw[t])] : []); }) }
            }, true);
            if (k === "overcast") { api.done(); api.saw(dayText(days)); }
          }
          draw(sel); if (seenD.indexOf("overcast") >= 0) api.done();
        } },
      { text: "A hydro plant's power grows with its [[hydraulic-head|head]] and its flow. Set both until the plant makes at least 100 MW, then see how long the [[reservoir|reservoir]] lasts.",
        build: function (act, api) {
          var st = log.hydro || { H: Hy.head.start, Q: Hy.flow.start };
          var ctl = H("div", { class: "f4-ctls" }, act);
          var sH = LX.Slider(ctl, { label: "Head", color: "var(--lx-hyd)", min: Hy.head.min, max: Hy.head.max, step: Hy.head.step, value: st.H, unit: "m", fmt: function (v) { return v + " m"; }, onChange: function (v) { st.H = v; upd(); } });
          var sQ = LX.Slider(ctl, { label: "Flow", color: "var(--lx-wind)", min: Hy.flow.min, max: Hy.flow.max, step: Hy.flow.step, value: st.Q, unit: "m³/s", fmt: function (v) { return v + " m³/s"; }, onChange: function (v) { st.Q = v; upd(); } });
          var out = H("div", { class: "f4-hyd", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: "Toy reservoir: no inflow, all the water usable, head and efficiency held constant. In a real one the head falls as the lake drains, and release rules can limit the flow." }, act);
          // the formula as a labelled chain: each factor named, then watts to MW
          function hydroChain(st) {
            var rows = [["water density", int(Hy.rho) + " kg/m³"], ["× gravity", Hy.g + " m/s²"], ["× flow: cubic meters passing each second", st.Q + " m³/s"],
                        ["× head: the height the water falls", st.H + " m"], ["× efficiency of turbine and generator", String(Hy.eta)], ["= power in watts; ÷ 1,000,000 watts per MW", fmt1(hydroMW(st.H, st.Q, Hy)) + " MW"]];
            return '<table class="lx-mini-table f4-hcalc"><caption class="lx-sr">How the power is worked out</caption><tbody>' + rows.map(function (r) { return "<tr><th scope=\"row\">" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table>";
          }
          function upd() {
            keep("hydro", st);
            var mw = hydroMW(st.H, st.Q, Hy), hrs = reservoirHours(Hy.volumeM3, st.Q), okv = mw >= Hy.goalMW;
            out.innerHTML = '<div class="f4-meter" aria-hidden="true"><i style="width:' + Math.min(100, mw / 150 * 100).toFixed(1) + '%"></i><b class="goal" style="left:' + (Hy.goalMW / 150 * 100).toFixed(1) + '%"></b></div>' +
              "<p><b>" + fmt1(mw) + " MW</b>" + (okv ? ' <span class="f4-goal">' + LX.icon("check") + "100 MW or more</span>" : "") + "</p>" + hydroChain(st) +
              "<p>With no water flowing in, the reservoir's 20 million m³ last <b>" + fmt1(hrs) + " hours</b> at " + st.Q + " m³/s: about " + int(mw * hrs) + " MWh.</p>";
            if (okv) { api.done(); api.saw("Head and flow trade off: twice the head or twice the flow doubles the power. A [[run-of-river|run-of-river]] plant has almost no reservoir, so it makes what the river brings today."); }
          }
          upd();
        } },
      { text: "Evening on lesson 0's day: the gas plants must climb as the sun sets. Match the gas needed in every hour, with a quicker [[ramp-rate|ramp]] or with the peaker.",
        build: function (act, api) {
          var st = log.ramp || { r: town.fleet.cc.ramp, pk: false };
          var ctl = H("div", { class: "f4-ctls" }, act);
          LX.Slider(ctl, { label: "Combined-cycle ramp limit", color: "var(--lx-cc)", min: R.rampMin, max: R.rampMax, step: R.rampStep, value: st.r, unit: "MW/h", fmt: function (v) { return v + " MW/h"; }, downLabel: "Lower", upLabel: "Raise", onChange: function (v) { st.r = v; upd(); } });
          var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Plants on or off" }, ctl);
          LX.Toggle(tg, { label: "Gas peaker (100 MW, fast)", on: st.pk, onChange: function (on) { st.pk = on; upd(); } });
          var card = LX.PlotCard(act, { text: "Text version of the evening" });
          function upd() {
            keep("ramp", st);
            var x = rampRun(need, Object.assign({ ramp: st.r, peaker: st.pk }, rampBase)), hh = x.hours;
            card.title.textContent = "Gas needed and gas made, 3 September 2025 (Prairie Town, illustrative)";
            card.clear();
            card.chip("Energy short", int(x.tot.short) + " MWh", x.tot.short > 0 ? "bad" : null);
            card.chip("Energy over", int(x.tot.over) + " MWh", x.tot.over > 0 ? "warn" : null);
            if (st.pk) card.chip("From the peaker", int(x.tot.pk) + " MWh");
            var bars = [];
            hh.forEach(function (t, i) {
              if (x.pk[i] > 0) bars.push({ x0: t, x1: t + 1, y0: x.cc[i], y1: x.cc[i] + x.pk[i], color: "var(--lx-pk)", op: 0.85 });
              if (x.short[i] > 0) bars.push({ x0: t, x1: t + 1, y0: x.cc[i] + x.pk[i], y1: x.need[i], color: "var(--lx-bad)", op: 0.45 });
              if (x.over[i] > 0) bars.push({ x0: t, x1: t + 1, y0: x.need[i], y1: x.cc[i], color: "var(--lx-warn)", op: 0.55 });
            });
            card.plot.render({
              x: { min: R.from, max: R.to + 1, ticks: [[R.from, LX.fmt.hh(R.from)], [18, "18:00"], [R.to + 1, LX.fmt.hh(R.to + 1)]] },
              y: { min: 0, max: 160, step: 40, fmt: LX.fmt.int, unit: "MW" },
              bars: bars,
              lines: [{ values: x.cc, x0: R.from, color: "var(--lx-cc)", area: 0.22, width: 2, step: 1 },
                      { values: x.need, x0: R.from, color: "var(--lx-demand)", width: 2.4, step: 1, dash: "6 3" }],
              legend: [{ label: "Gas needed", color: "var(--lx-demand)", dash: "6 3" }, { label: "Combined cycle", color: "var(--lx-cc)" }].concat(st.pk ? [{ label: "Peaker", color: "var(--lx-pk)" }] : []).concat(x.tot.short ? [{ label: "Short", color: "var(--lx-bad)" }] : []).concat(x.tot.over ? [{ label: "Over", color: "var(--lx-warn)" }] : []),
              tip: function (xx) { var t = Math.floor(xx), i = t - R.from; if (i < 0 || i >= hh.length) return ""; return "<div><b>" + LX.fmt.hh(t) + "</b> need " + x.need[i] + " MW · combined cycle " + x.cc[i] + " MW" + (st.pk ? " · peaker " + x.pk[i] + " MW" : "") + (x.short[i] ? " · short " + x.short[i] + " MW" : "") + (x.over[i] ? " · over " + x.over[i] + " MW" : "") + "</div>"; },
              aria: "Gas needed against gas made from " + LX.fmt.hh(R.from) + " to " + LX.fmt.hh(R.to + 1) + ": " + x.tot.short + " MWh short, " + x.tot.over + " MWh over.",
              text: { head: ["Hour from", "Needed, MW", "Combined cycle, MW", "Peaker, MW", "Short, MW", "Over, MW"], rows: hh.map(function (t, i) { return [LX.fmt.hh(t), String(x.need[i]), String(x.cc[i]), String(x.pk[i]), String(x.short[i]), String(x.over[i])]; }) }
            }, true);
            if (x.tot.balanced) { api.done(); api.saw(rampText(st, x, D, town)); }
            else api.saw(rampFeedback(st, x), true);
          }
          upd();
        } },
      { text: "Every plant has a limit that bites first. Put each situation with the limit that stops the plant.",
        build: function (act, api) {
          var L = D.limits;
          var cs = LX.CardSort(act, { bins: L.bins.map(function (b, i) { return { id: b.id, label: b.label, sub: b.sub, color: ["var(--lx-solar)", "var(--lx-hyd)", "var(--lx-cc)", "var(--lx-pk)"][i] }; }),
            cards: L.cards, checkLabel: "Check my sort", maxWhy: 5,
            onCheck: function (g) {
              keep("limits", cs.placed());
              if (g.placed < g.total) { api.saw("Place every card first: " + (g.total - g.placed) + " still in the pool.", true); return; }
              api.done(); LX.progress.done(LESSON);
              api.saw("**" + g.right + " of " + g.total + "** right. Weather caps wind and solar, water caps hydro, fuel caps thermal plants, and the ramp rate caps how fast any of them can follow demand.", g.right < g.total);
            } });
          hooks.cs = cs; if (log.limits) cs.place(log.limits);
        } }
    ];
    var cards = LX.StepCards(live, { id: "f4-steps", steps: steps });

    // demo states: "step-N" opens step N with its action done; "mid" = step 3, the Sankey with three plants compared
    LX.demo(root, function (state) {
      var n = state === "mid" ? 3 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var i = Math.max(0, Math.min(steps.length - 1, n - 1));
      if (i === 0) log.seen = []; if (i === 1) log.pred = null;
      if (i === 2) { log.viewed = ["ct", "hydro"]; log.plant = "cc"; lastPlant = "cc"; }
      if (i === 3) log.hr = false; if (i === 4) { log.day = "clouds"; log.days = ["clear", "clouds"]; }
      if (i === 5) log.hydro = { H: 120, Q: 100 }; if (i === 6) log.ramp = { r: 40, pk: true };
      if (i === 7) { var m = {}; D.limits.cards.forEach(function (c) { m[c.id] = c.bin; }); m.calm = "water"; log.limits = m; }
      cards.go(i);
      var click = function (sel, j) { var b = cards.el.querySelectorAll(sel)[j || 0]; if (b) b.click(); };
      if (i === 0) click(".f4x-stop", 1);
      if (i === 1) click(".lx-choice", 2);
      if (i === 3 && hooks.na) { hooks.na.input.value = "34"; hooks.na.go(); }
      if (i === 4) click(".f4-seg button", 2);
      if (i === 7 && hooks.cs) hooks.cs.check();
      return { view: "step " + (i + 1) };
    }, cards);
    buildExplain(D, data);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, data) {
    var host = document.getElementById("f4-explain"); if (!host) return;
    var btu = D.meta.btuPerKWh, log = LX.store.get("f4-log", {}) || {}, p = plantByKey(D, log.plant || "cc") || plantByKey(D, "cc");
    host.innerHTML = ""; host.classList.add("is-live");
    // 1. annotated cutaway: the heat engine that coal, gas-steam, geothermal and fission plants share
    var c1 = H("div", { class: "lx-xcard" }, host), h1 = H("header", { class: "lx-x-head" }, c1);
    H("h3", { text: "One heat engine, many fuels" }, h1); H("span", { class: "lx-hint", text: "Annotated cutaway" }, h1);
    H("p", { class: "lx-lede", html: "Coal and gas boilers make steam for a loop like this one, and so does fission (" + LX.lessonRefHTML(data.path, "F5") + "). Geothermal plants turn turbines with the earth's heat in several ways; each number marks one part." }, c1);
    var fig = H("div", { class: "f4-annot" }, c1);
    var marks = [[59, 120, "1"], [163, 104, "2"], [224, 104, "3"], [166, 154, "4"], [323, 160, "5"], [131, 182, "6"]];
    fig.innerHTML = '<svg class="f4c" viewBox="0 0 400 230" role="img" aria-label="' + LX.esc(SCENE_ALT.steam) + '">' + SCENE.steam(true) +
      marks.map(function (m) { return '<g class="f4-mark"><circle cx="' + m[0] + '" cy="' + m[1] + '" r="11"/><text x="' + m[0] + '" y="' + (m[1] + 5) + '" text-anchor="middle">' + m[2] + "</text></g>"; }).join("") + "</svg>";
    var ol = H("ol", { class: "f4-parts" }, c1);
    [["Boiler", "fuel heats water into high-pressure steam."], ["Steam turbine", "steam pushes the blades round."], ["Generator", "the spinning shaft makes electricity."],
     ["Condenser", "steam turns back to water; most of the waste heat leaves here."], ["Cooling tower", "carries that heat away to the air."], ["Pump", "sends the water back to the boiler."]]
      .forEach(function (r) { H("li", { html: "<b>" + r[0] + ":</b> " + r[1] }, ol); });
    // 2. e-sankey: the reader's last plant, with a reading guide
    var c2 = H("div", { class: "lx-xcard" }, host), h2 = H("header", { class: "lx-x-head" }, c2);
    H("h3", { text: "Reading a Sankey: " + p.short }, h2); H("span", { class: "lx-hint", text: "your last plant in step 3" }, h2);
    if (LX.Sankey) LX.Sankey(c2, { label: "100 units into the " + p.short.toLowerCase() + " plant", unit: "units", fmt: unitsFmt(p), height: 160, heightN: 180, textHead: ["From", "To", "Units of 100"] }).set(sankeySpec(p, D));
    var gl = H("ul", { class: "f4-guide" }, c2);
    ["Width is energy: a band twice as wide carries twice as much.", "Energy in on the left, where it goes on the right; the bands out add up to the 100 in.",
     "Pale hatched bands are losses: heat, friction, or energy that was never caught."].forEach(function (t) { H("li", { text: t }, gl); });
    // 3. e-table: the plants side by side
    var c3 = H("div", { class: "lx-xcard" }, host);
    var rowsInfo = {
      cc: { spins: "gas turbine, then steam turbine", start: "1 to 12 hours, most plants", limit: "fuel; how fast it ramps" },
      ct: { spins: "gas turbine", start: "relatively fast", limit: "fuel" },
      coal: { spins: "steam turbine", start: "more than half a day", limit: "fuel; slow to start" },
      geo: { spins: "turbine (steam, or a second fluid)", start: "not in the EIA article", limit: "the heat in its wells" },
      hydro: { spins: "water turbine", start: "under 10 minutes, most", limit: "water in the reservoir" },
      wind: { spins: "rotor and generator", start: "follows the wind", limit: "weather" },
      pv: { spins: "nothing", start: "follows the sun", limit: "weather and daylight" }
    };
    LX.CompareTable(c3, {
      title: "The plants side by side", text: true,
      columns: [{ key: "name", label: "Plant", main: true }, { key: "share", label: "Electricity out, of 100 in" }, { key: "spins", label: "What spins" },
                { key: "start", label: "Start-up, cold to full" }, { key: "limit", label: "What limits it" }],
      rows: D.plants.map(function (q) { var r = rowsInfo[q.key]; return { key: q.key, color: q.color, name: q.short, note: q.kind === "thermal" ? "full-load heat rate " + int(q.heatRate) + " Btu/kWh" : q.key === "pv" ? "best modules; DC at the module, before the inverter" : "typical value", share: (q.shareWord ? q.shareWord + " " : q.kind === "thermal" ? "" : "about ") + shareText(q, btu), spins: r.spins, start: r.start, limit: r.limit }; }),
      caption: "Shares: EIA's 2025 full-load tested heat rates for gas and coal, to the wire; EIA's typical equipment values for geothermal, hydro and wind; for solar, today's best modules, as DC before the inverter. Start-up: EIA, November 2020."
    });
  }

  LX.mount("power-plants", function (live, data, root) { view(live, data, root); });
})();
