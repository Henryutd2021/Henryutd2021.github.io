// 05-capacity-factor.js — Lesson 5, "Capacity factor: why is 1 MW not always 1 MW?" (step cards, W1, 2026-11-02).
//
// Data: assets/learn/data/town_year.json (every hour of 2025 on the Southwest Power Pool grid, EIA-930, as shapes),
// assets/learn/data/cf_targets.json (shared: EIA Electric Power Monthly, Table 6.07.B, 2025 annual capacity factors) and
// assets/learn/data/05-capacity-factor.json (the 2025 monthly capacity factors, the solar day, the illustrative turbine).
//
// IMPORTANT data rule. The wind and solar shapes in town_year.json are each divided by their own 2025 maximum hour, so
// their mean is not a capacity factor (wind 0.528, solar 0.238). profile() turns a shape into a plant's output with the
// shared helper (assets/learn/components/profiles.js: LX.cfScale, LX.townProfile), method "power": output = size x s^g,
// so the best hours reach the plant's size and the year's capacity factor equals the 2025 U.S. average. "power" rather
// than "scale" because this lesson shows output against nameplate: with "scale", the SPP wind shape scaled down to 33.8%
// never passes 64% of the farm's size, which reads as "a 100 MW farm cannot make 100 MW", the opposite of the point
// (it can; it rarely does). Two lesson-local steps come first (requested for the shared helper in the sidecar):
//   (1) solar hours with the sun below the horizon across the SPP region are set to zero (sunUp): the shape reports
//       night-time output from 18 February to 21 March 2025 and on a few other nights, which is telemetry error;
//   (2) each month is brought to the U.S. monthly capacity factor (LX.cfScale, "power", per month), because the SPP
//       shapes contain the fleets' growth during 2025 (solar's January maximum is 0.56 of its November maximum);
// then LX.townProfile sets the annual capacity factor exactly. Nuclear has no shape: it runs at full size except for
// one illustrative refuelling outage sized to the same target.
//
// Model (closed form):
//   capacity factor  CF = E / (P x T)      E energy made (MWh), P size (MW), T hours in the period
//   energy in a year E  = P x 8,760 h x CF  (2025 had 365 days)
//   average output       = E / T, so CF = average output / P (the "flat line" of step 3)
//   wind turbine (clean power curve, illustrative): P(v) = rated x (v / v_rated)^3 for cut-in <= v < v_rated; rated for
//   v_rated <= v <= cut-out; 0 otherwise. Doubling v below the rated speed multiplies P by 2^3 = 8.
//
// Lesson-local component (for the coordinator to promote): EquationCard, the e-equation explain element (an equation
// whose symbols link to words, the reader's numbers and code). The pure model is exported for Node.
(function () {
  "use strict";
  var HOURS = 8760;

  // ---------------------------------------------------------------- pure model
  // the shared capacity-factor helper: window.LX in the browser (learn.js bundle), the component file in Node
  function helper() {
    if (typeof window !== "undefined" && window.LX && window.LX.townProfile) return window.LX;
    return require("./components/profiles.js");
  }
  // Is the sun above the horizon at some point of the hour, somewhere in the region (D.solarClean: a latitude and
  // longitude box)? Hour index i: 00:00 Central standard time on 1 January 2025 + i hours. Simple solar geometry
  // (declination from the day of the year, no equation of time; the box's corners cover the error).
  function sunUp(i, box) {
    var rad = Math.PI / 180, day = Math.floor(i / 24) + 1, h0 = i % 24, decl = 23.44 * Math.sin(2 * Math.PI * (284 + day) / 365) * rad, best = -90;
    [h0, h0 + 1].forEach(function (h) {
      [box.latS, box.latN].forEach(function (la) {
        [box.lonW, box.lonE].forEach(function (lo) {
          var H = 15 * (h + (lo + 90) / 15 - 12) * rad, phi = la * rad;
          best = Math.max(best, Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H)) / rad);
        });
      });
    });
    return best > 0;
  }
  // hourly output (MW) of a plant of size mw over the year, with annual capacity factor cf (see the header).
  function profile(year, tech, mw, cf, D, monthlyCF) {
    var out = new Array(HOURS), t, HP = helper();
    if (tech === "nuclear") {
      var nu = D.nuclear, a = nu.outageStartDay * 24, b = a + nu.outageHours;
      for (t = 0; t < HOURS; t++) out[t] = t >= a && t < b ? 0 : mw;
      return out;
    }
    var shape = year[tech].map(function (x, i) { return tech === "solar" && D.solarClean && !sunUp(i, D.solarClean) ? 0 : x; });
    if (monthlyCF) {
      var t0 = 0;
      D.year.monthDays.forEach(function (d, m) {
        var seg = shape.slice(t0, t0 + d * 24), g = HP.cfScale(seg, monthlyCF[m], "power");
        for (var h = 0; h < seg.length; h++) shape[t0 + h] = seg[h] > 0 ? 1000 * Math.pow(Math.min(1, seg[h] / 1000), g) : 0;
        t0 += d * 24;
      });
    }
    var y = {}; y[tech] = shape;
    return HP.townProfile(tech, mw, { year: y, annualCF: cf, method: "power" }).mw;
  }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function capacityFactor(outputs, mw) { return sum(outputs) / (mw * outputs.length); }
  function annualEnergy(mw, cf, hours) { return mw * (hours || HOURS) * cf; }
  // monthly capacity factors of a year profile (local standard time; D.year.monthDays)
  function monthly(outputs, mw, monthDays) {
    var res = [], t = 0;
    monthDays.forEach(function (d) { var s = 0; for (var h = 0; h < d * 24; h++) s += outputs[t + h]; res.push(s / (mw * d * 24)); t += d * 24; });
    return res;
  }
  // one local day of a year profile: index i = the hour ending at start_utc + i (as in lesson 0)
  function dayIndex(year, date, utcOffsetHours) {
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(date + "T00:00:00Z");
    return Math.round((d0 - t0) / 3600000) + 1 - (utcOffsetHours || 0);
  }
  function day(outputs, year, date, utcOffsetHours) {
    var i = dayIndex(year, date, utcOffsetHours);
    if (i < 0 || i + 24 > outputs.length) throw new Error("date " + date + " is outside the year");
    return outputs.slice(i, i + 24).map(function (v) { return Math.round(v); });
  }
  // the flat line of step 3: energy above and below a level L (MW), one-hour steps
  function levels(bars, L) {
    var above = 0, below = 0;
    bars.forEach(function (b) { above += Math.max(0, b - L); below += Math.max(0, L - b); });
    return { above: above, below: below, total: sum(bars), line: L * bars.length };
  }
  function levelled(bars, L) { return Math.abs(sum(bars) - L * bars.length) <= bars.length + 1e-9; }   // within 1 MW of the average
  // clean power curve of the illustrative turbine (kW)
  function power(v, tb) {
    if (v < tb.cutIn || v > tb.cutOut) return 0;
    if (v >= tb.ratedSpeed) return tb.ratedKW;
    return tb.ratedKW * Math.pow(v / tb.ratedSpeed, 3);
  }
  // power in the wind through the rotor (kW): 1/2 rho A v^3
  function windPower(v, tb) { var A = Math.PI * Math.pow(tb.rotorM / 2, 2); return 0.5 * tb.airDensity * A * Math.pow(v, 3) / 1000; }
  function homes(mwh, kwhPerHome) { return mwh * 1000 / kwhPerHome; }
  // everything the page states, from one place (used by the view and by the Node test)
  function targets(CT) { return { nuclear: CT.reference.nuclear.cf, wind: CT.targets.wind.cf, solar: CT.targets.solar.cf }; }
  function world(year, D, CT) {
    var P = D.plantMW, T = targets(CT), w = { T: T };
    ["nuclear", "wind", "solar"].forEach(function (k) {
      var out = profile(year, k, P, T[k], D, k === "nuclear" ? null : D.monthly_2025[k]), E = sum(out);
      w[k] = { out: out, energy: E, cf: E / (P * HOURS), max: Math.max.apply(null, out), monthly: monthly(out, P, D.year.monthDays),
               perMW: annualEnergy(1, T[k]), homesPerMW: homes(annualEnergy(1, T[k]), D.homes.kwhPerHomeYear) };
    });
    w.dayBars = day(w[D.day.tech].out, year, D.day.date, D.day.utcOffsetHours);
    w.dayEnergy = sum(w.dayBars); w.dayAvg = w.dayEnergy / 24; w.dayCF = w.dayAvg / P;
    var lit = w.dayBars.filter(function (b) { return b > 0; }).length;
    w.dayLit = lit; w.dayLitCF = w.dayEnergy / (P * lit); w.dayBest = Math.max.apply(null, w.dayBars);
    w.applyMWh = annualEnergy(D.apply.mw, T.wind);
    return w;
  }
  var model = { HOURS: HOURS, sunUp: sunUp, profile: profile, capacityFactor: capacityFactor, annualEnergy: annualEnergy, monthly: monthly,
                dayIndex: dayIndex, day: day, levels: levels, levelled: levelled, power: power, windPower: windPower, homes: homes, targets: targets, world: world, sum: sum };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S, F = LX.fmt, LESSON = "05-capacity-factor";
  var TECH = { nuclear: { label: "Nuclear", tok: "nuc", col: "var(--lx-nuc)" }, wind: { label: "Wind", tok: "wind", col: "var(--lx-wind)" },
               solar: { label: "Solar", tok: "solar", col: "var(--lx-solar)" } };
  var NOTES = {
    nuclear: function () { return "Flat at 100 MW, except an illustrative [[refuelling-outage|refuelling outage]] of 32.5 days in spring: the gap in late March and April."; },
    wind: function (w) { return "Gusty and calm by turns: in its best hours the farm makes its full " + Math.round(w.max) + " MW, but on average a third of that."; },
    solar: function () { return "Bright in summer, faint in winter, nothing at night: the farm reaches 100 MW only near noon on the clearest days."; }
  };
  var KEYS = ["nuclear", "wind", "solar"], MON = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function pct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + "%"; }
  function kw(v) { return F.int(v) + " kW"; }
  function seg(host, items, label, onPick) {   // a row of choice buttons that remember which were seen
    var row = H("div", { class: "lx-choices-row", role: "group", "aria-label": label }, host), btns = {};
    items.forEach(function (it) {
      var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false" }, row);
      if (it.color) H("span", { class: "sw", style: "--c:" + it.color }, b);
      H("span", { text: it.label }, b);
      b.addEventListener("click", function () { pick(it.value); });
      btns[it.value] = b;
    });
    function pick(v) { Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === v ? "true" : "false"); }); onPick(v); }
    return { pick: pick, el: row };
  }

  // ---- a year at a glance: one column per day, one row per hour; darker = closer to full size
  function YearMap(host, W, D) {
    var box = H("div", { class: "lx5-year" }, host);
    var cv = H("canvas", { role: "img" }, box), ticks = H("div", { class: "lx5-months", "aria-hidden": "true" }, box);
    MON.forEach(function (m, i) { H("span", { text: m, style: "flex:" + D.year.monthDays[i] }, ticks); });
    var cur = null;
    function draw() {
      if (!cur) return;
      var wpx = Math.max(280, box.clientWidth), rowH = wpx < 480 ? 4 : 5, hpx = rowH * 24, dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(wpx * dpr); cv.height = Math.round(hpx * dpr); cv.style.width = wpx + "px"; cv.style.height = hpx + "px";
      var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var tk = LX.tokens(box, [TECH[cur].tok, "surface-2"]), c1 = tk[TECH[cur].tok], c0 = tk["surface-2"], out = W[cur].out, P = D.plantMW, cw = wpx / 365;
      for (var d = 0; d < 365; d++) for (var h = 0; h < 24; h++) {
        g.fillStyle = LX.rgb(LX.mix(c0, c1, Math.max(0, Math.min(1, out[d * 24 + h] / P))));
        g.fillRect(d * cw, h * rowH, cw + 0.6, rowH);
      }
      cv.setAttribute("aria-label", TECH[cur].label + ", 100 MW: every hour of the year, one column per day, midnight at the top. Capacity factor " + pct(W[cur].cf) + ".");
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(box)) draw(); }).observe(box);
    LX.onTheme(draw);
    return { show: function (k) { cur = k; draw(); } };
  }
  // ---- energy made against the full box (the plant at full size every hour)
  function FillBar(host) {
    var w = H("div", { class: "lx5-fill" }, host), bar = H("div", { class: "lx5-fill-bar" }, w), fill = H("i", null, bar), lab = H("p", { class: "lx5-fill-l" }, w);
    return { set: function (frac, color, text) { fill.style.width = (frac * 100).toFixed(2) + "%"; fill.style.background = color; lab.innerHTML = text; } };
  }
  function monthBars(host, vals, color, label) {
    var Wd = 360, Hh = 92, m = { l: 30, r: 4, t: 8, b: 18 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b, bw = iw / 12;
    var svg = S("svg", { viewBox: "0 0 " + Wd + " " + Hh, role: "img", "aria-label": label, class: "lx5-mbars" }, host);
    [0, 0.5, 1].forEach(function (v) {
      var y = m.t + ih - v * ih;
      S("path", { d: "M" + m.l + " " + y + "H" + (Wd - m.r), stroke: "var(--lx-line)" }, svg);
      S("text", { x: m.l - 4, y: y + 4, "text-anchor": "end", class: "lx5-ax" }, svg).textContent = v * 100 + "%";
    });
    vals.forEach(function (v, i) {
      S("rect", { x: m.l + i * bw + 3, y: m.t + ih - v * ih, width: bw - 6, height: Math.max(0.5, v * ih), rx: 2, fill: color }, svg);
      S("text", { x: m.l + (i + 0.5) * bw, y: Hh - 4, "text-anchor": "middle", class: "lx5-ax" }, svg).textContent = MON[i];
    });
  }

  // ---- step 3: 24 bars and a flat line
  function DayLevel(host, bars, o) {
    var cw = host.clientWidth || 600, phone = cw < 520;   // on phones the drawing is laid out at its real width, so labels stay legible
    var Wd = phone ? Math.max(300, cw) : 600, Hh = phone ? 200 : 230, m = { l: 34, r: 8, t: 12, b: 26 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b, bw = iw / 24, ymax = 100;
    var svg = S("svg", { viewBox: "0 0 " + Wd + " " + Hh, class: "lx5-day", role: "img" }, host);
    var y = function (v) { return m.t + ih - v / ymax * ih; };
    [0, 25, 50, 75, 100].forEach(function (v) {
      S("path", { d: "M" + m.l + " " + y(v) + "H" + (Wd - m.r), stroke: "var(--lx-line)" }, svg);
      S("text", { x: m.l - 5, y: y(v) + 4, "text-anchor": "end", class: "lx5-ax" }, svg).textContent = v;
    });
    [0, 6, 12, 18, 24].forEach(function (h) { S("text", { x: m.l + h * bw, y: Hh - 6, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle", class: "lx5-ax" }, svg).textContent = (h < 10 ? "0" : "") + h + ":00"; });
    var gB = S("g", null, svg), gL = S("g", null, svg);
    function render(L) {
      gB.innerHTML = ""; gL.innerHTML = "";
      bars.forEach(function (b, t) {
        var x = m.l + t * bw + 1.5, ww = bw - 3;
        if (b > 0) S("rect", { x: x, y: y(Math.min(b, L)), width: ww, height: y(0) - y(Math.min(b, L)), fill: "var(--lx-solar)", opacity: 0.45 }, gB);
        if (b > L) S("rect", { x: x, y: y(b), width: ww, height: y(L) - y(b), fill: "var(--lx-solar)" }, gB);
        if (b < L) S("rect", { x: x, y: y(L), width: ww, height: y(b) - y(L), fill: "none", stroke: "var(--lx-accent)", "stroke-width": 1.2, "stroke-dasharray": "3 2" }, gB);
      });
      S("path", { d: "M" + m.l + " " + y(L) + "H" + (Wd - m.r), stroke: "var(--lx-ink)", "stroke-width": 2.4, "stroke-dasharray": "7 4" }, gL);
      S("text", { x: Wd - m.r - 4, y: y(L) - 6, "text-anchor": "end", class: "lx5-lab" }, gL).textContent = "flat line " + L + " MW";
      svg.setAttribute("aria-label", "The solar farm's 24 hourly outputs on " + o.dateLabel + ", with a flat line at " + L + " MW.");
    }
    return { render: render };
  }

  // ---- steps 5-6: the clean power curve
  function Curve(host, tb) {
    var cw = host.clientWidth || 600, phone = cw < 520;
    var Wd = phone ? Math.max(300, cw) : 600, Hh = phone ? 236 : 262, m = { l: 48, r: 10, t: 14, b: 42 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b, vmax = tb.maxSlider, pmax = 3200;
    var svg = S("svg", { viewBox: "0 0 " + Wd + " " + Hh, class: "lx5-curve", role: "img" }, host);
    var x = function (v) { return m.l + v / vmax * iw; }, y = function (p) { return m.t + ih - p / pmax * ih; };
    S("rect", { x: x(tb.cutIn), y: m.t, width: x(tb.ratedSpeed) - x(tb.cutIn), height: ih, fill: "var(--lx-wind)", opacity: 0.08 }, svg);
    [0, 1000, 2000, 3000].forEach(function (p) {
      S("path", { d: "M" + m.l + " " + y(p) + "H" + (Wd - m.r), stroke: "var(--lx-line)" }, svg);
      S("text", { x: m.l - 6, y: y(p) + 4, "text-anchor": "end", class: "lx5-ax" }, svg).textContent = F.int(p);
    });
    [0, 5, 10, 15, 20, 25].forEach(function (v) { S("text", { x: x(v), y: m.t + ih + 16, "text-anchor": "middle", class: "lx5-ax" }, svg).textContent = v; });
    S("text", { x: m.l + iw / 2, y: Hh - 4, "text-anchor": "middle", class: "lx5-ax" }, svg).textContent = "wind speed, m/s";
    S("text", { x: m.l + 4, y: m.t + 10, class: "lx5-ax" }, svg).textContent = "output, kW";
    [[tb.ratedSpeed, "rated " + tb.ratedSpeed + " m/s"], [tb.cutOut, "cut-out " + tb.cutOut]].forEach(function (r) {
      S("path", { d: "M" + x(r[0]) + " " + m.t + "V" + (m.t + ih), stroke: "var(--lx-ink-3)", "stroke-dasharray": "3 3" }, svg);
      S("text", { x: x(r[0]) - 4, y: m.t + ih - 6, "text-anchor": "end", class: "lx5-ax" }, svg).textContent = r[1];
    });
    S("text", { x: (x(tb.cutIn) + x(tb.ratedSpeed)) / 2, y: y(2400), "text-anchor": "middle", class: "lx5-lab" }, svg).textContent = "cube law";
    var d = "";
    for (var v = 0; v <= vmax + 1e-9; v += 0.1) d += (d ? " L" : "M") + x(v).toFixed(1) + " " + y(power(v, tb)).toFixed(1);
    S("path", { d: d, fill: "none", stroke: "var(--lx-wind)", "stroke-width": 3 }, svg);
    var gP = S("g", null, svg);
    function mark(v, cls) {
      var p = power(v, tb), g = S("g", { class: cls }, gP);
      S("path", { d: "M" + x(v) + " " + y(0) + "V" + y(p) + "H" + m.l, stroke: "var(--lx-ink-3)", "stroke-dasharray": "2 3", fill: "none" }, g);
      S("circle", { cx: x(v), cy: y(p), r: cls === "now" ? 7 : 5, fill: cls === "now" ? "var(--lx-ink)" : "var(--lx-surface)", stroke: "var(--lx-ink)", "stroke-width": 2 }, g);
    }
    return { show: function (v, prev) { gP.innerHTML = ""; if (prev != null) mark(prev, "was"); mark(v, "now");
      svg.setAttribute("aria-label", "Power curve of an illustrative 3 MW turbine: output rises with the cube of wind speed from " + tb.cutIn + " m/s to the rated speed of " + tb.ratedSpeed + " m/s, stays at " + F.int(tb.ratedKW) + " kW up to " + tb.cutOut + " m/s, then stops. Marked: " + v + " m/s, " + kw(power(v, tb)) + "."); } };
  }

  // ---- lesson-local explain component: an equation whose symbols open their meaning, the reader's numbers and code
  function EquationCard(host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var wrap = H("div", { class: "lx5-eq" }, host), rows = H("div", { class: "lx5-eq-rows" }, wrap), det = H("div", { class: "lx-cdetail", "aria-live": "polite" }, wrap);
    var btns = {};
    o.rows.forEach(function (r) {
      var row = H("p", { class: "lx5-eq-row", role: "group", "aria-label": r.say }, rows);
      r.parts.forEach(function (p) {
        if (typeof p === "string") { H("span", { class: "op", text: p, "aria-hidden": "true" }, row); return; }
        var s = o.symbols[p.k], b = H("button", { type: "button", class: "sym", style: "--c:" + s.color, "aria-pressed": "false", "aria-label": s.name }, row);
        b.innerHTML = s.sym; b.addEventListener("click", function () { select(p.k); });
        (btns[p.k] = btns[p.k] || []).push(b);
      });
      if (r.note) H("span", { class: "note", text: r.note }, row);
    });
    var code = H("details", { class: "lx-textalt lx5-code" }, rows); H("summary", { text: "The same equation in code (Python)" }, code);
    H("pre", { text: o.code }, code);
    var alt = H("details", { class: "lx-textalt" }, rows); H("summary", { text: "Text version" }, alt);
    var ul = H("ul", null, alt);
    o.rows.forEach(function (r) { H("li", { text: r.say }, ul); });
    Object.keys(o.symbols).forEach(function (k) { var s = o.symbols[k]; H("li", { html: "<b>" + LX.esc(s.name) + "</b>: " + LX.rich(s.text) }, ul); });
    function select(k) {
      Object.keys(btns).forEach(function (j) { btns[j].forEach(function (b) { b.setAttribute("aria-pressed", j === k ? "true" : "false"); }); });
      var s = o.symbols[k]; det.innerHTML = "";
      H("p", { class: "lx-eyebrow", text: "Symbol" }, det); H("h4", { text: s.name + (s.unit ? " (" + s.unit + ")" : "") }, det);
      H("p", { html: LX.rich(s.text) }, det);
      var you = typeof s.you === "function" ? s.you() : s.you;
      if (you) { var ig = H("div", { class: "ingame" }, det); H("b", { text: "In this lesson" }, ig); H("span", { html: LX.rich(you) }, ig); }
    }
    select(o.sel || Object.keys(o.symbols)[0]);
    return { select: select };
  }

  function view(live, data, root) {
    var D = data["05_capacity_factor"], year = data.town_year, W = world(year, D, data.cf_targets), T = W.T, P = D.plantMW, tb = D.turbine;
    var log = LX.store.get("t5-log", {}) || {};
    function keep(k, v) { log[k] = v; LX.store.set("t5-log", log); LX.emit("t5-log", log); }
    var seen = {}, seenMW = {}, doubled = {}, pred = null, level = 15, speed = 5, prevSpeed = null;
    var predQ = { id: "t5-most", q: "Which 100 MW plant makes the most energy in a year?", answer: "nuclear",
      options: [{ value: "nuclear", label: "Nuclear", color: TECH.nuclear.col }, { value: "wind", label: "Wind", color: TECH.wind.col },
                { value: "solar", label: "Solar", color: TECH.solar.col }, { value: "same", label: "All the same: they are all 100 MW" }],
      feedback: { nuclear: "Nuclear runs at full size almost all year.", wind: "Wind made about a third of what it could.",
                  solar: "Solar made the least: no sun at night, less in winter.", same: "Same size, very different energy: that is this lesson's point." } };
    var totals = KEYS.map(function (k) { return TECH[k].label.toLowerCase() + " " + F.int(W[k].energy) + " MWh"; });

    var steps = [
      { text: "Prairie Town is adding three plants of the same size: 100 MW of nuclear, 100 MW of wind and 100 MW of solar. Commit to a guess before you see a year of their output.",
        build: function (act, api) {
          LX.Predict(act, { id: predQ.id, q: predQ.q, options: predQ.options, answer: predQ.answer, fresh: true, lockText: "Locked in. The next step shows the year.",
            onPick: function (p) { pred = p; keep("pred", p); api.done(); } });
          if (pred) api.done();
        } },
      { text: "Here is every hour of a year for each plant: one column per day, midnight at the top. Darker means closer to full size. Look at all three plants.",
        build: function (act, api) {
          var top = H("div", null, act), map = H("div", null, act), note = H("p", { class: "lx-hint" }, act), stat = H("div", { class: "lx5-stats", "aria-live": "polite" }, act);
          var fb = FillBar(act), mb = H("div", { class: "lx5-mwrap" }, act);
          var ym = YearMap(map, W, D);
          var tabs = seg(top, KEYS.map(function (k) { return { value: k, label: TECH[k].label + " 100 MW", color: TECH[k].col }; }), "Plant", function (k) {
            seen[k] = true; ym.show(k); note.innerHTML = LX.rich(NOTES[k](W[k]));
            stat.innerHTML = "<div><span>Energy in the year</span><b>" + F.int(W[k].energy) + " MWh</b></div><div><span>Capacity factor</span><b>" + pct(W[k].cf) +
              "</b></div><div><span>Best hour</span><b>" + Math.round(W[k].max) + " MW</b></div>";
            fb.set(W[k].cf, TECH[k].col, "Made " + F.int(W[k].energy) + " of the " + F.int(P * HOURS) + " MWh it could make at full size every hour: " + pct(W[k].cf) + ".");
            mb.innerHTML = ""; monthBars(mb, W[k].monthly, TECH[k].col, TECH[k].label + ": capacity factor by month, January to December.");
            if (KEYS.every(function (j) { return seen[j]; })) {
              api.done(); keep("year", true);
              var ok = pred === "nuclear", fbk = predQ.feedback[pred] || "";
              api.saw((pred ? (ok ? "You called it. " : "Your pick: " + (pred === "same" ? "all the same" : pred) + ". ") + fbk + " " : "") + "Totals: " + totals.join(", ") + ". Same size, very different energy.", pred && !ok);
            }
          });
          var alt = H("details", { class: "lx-textalt" }, act); H("summary", { text: "Text version: capacity factor by month" }, alt);
          var tbx = H("table", { class: "lx-mini-table" }, H("div", { class: "lx-scroll-x" }, alt)), hr = H("tr", null, H("thead", null, tbx));
          ["Month"].concat(KEYS.map(function (k) { return TECH[k].label; })).forEach(function (t) { H("th", { scope: "col", text: t }, hr); });
          var bd = H("tbody", null, tbx);
          MONTHS.forEach(function (mn, i) { var tr = H("tr", null, bd); H("td", { text: mn }, tr); KEYS.forEach(function (k) { H("td", { text: pct(W[k].monthly[i]) }, tr); }); });
          var trY = H("tr", null, bd); H("td", { text: "Year" }, trY); KEYS.forEach(function (k) { H("td", { text: pct(W[k].cf) }, trY); });
          tabs.pick(KEYS.filter(function (k) { return !seen[k]; })[0] || "nuclear");
        } },
      { text: "Count one day. These are the solar farm's 24 hourly outputs on " + D.day.dateLabel + ", the day from lesson 0. Slide the flat line until it holds the same energy as the bars.",
        build: function (act, api) {
          var chart = DayLevel(act, W.dayBars, D.day);
          var grid = H("ol", { class: "lx5-hours", "aria-label": "Hourly output, MW" }, act);
          W.dayBars.forEach(function (b, t) { var li = H("li", null, grid); H("span", { text: F.hh(t) }, li); H("b", { text: b }, li); });
          var read = H("p", { class: "lx5-read", "aria-live": "polite" }, act);
          var sl = LX.Slider(act, { label: "Flat line", color: "var(--lx-ink)", max: P, step: 1, unit: "MW", onChange: upd,
            hint: function () { return "Sun above the line should fill the dashed gaps below it."; } });
          function upd(L) {
            level = L; chart.render(L);
            var z = levels(W.dayBars, L);
            read.innerHTML = "Sun above the line: <b>" + F.int(z.above) + " MWh</b> · dashed gaps below it: <b>" + F.int(z.below) + " MWh</b>";
            if (levelled(W.dayBars, L)) {
              api.done(); keep("level", L);
              api.saw("Level. The bars hold " + F.int(W.dayEnergy) + " MWh; a flat " + W.dayAvg.toFixed(1) + " MW for 24 hours holds the same. That flat line is the day's average output.");
            }
          }
          sl.set(level); upd(level);
        } },
      { text: "Capacity factor compares that average with the plant's size: average output ÷ size, or energy made ÷ (size × hours). What was the solar farm's [[capacity-factor|capacity factor]] on " + D.day.dateLabel + "?",
        build: function (act, api) {
          var opts = [{ v: "cf", t: pct(W.dayCF) }, { v: "lit", t: pct(W.dayLitCF) }, { v: "best", t: pct(W.dayBest / P, 0) }, { v: "full", t: "100%" }];
          var why = { cf: "Right: " + F.int(W.dayEnergy) + " MWh ÷ (100 MW × 24 h) = " + pct(W.dayCF) + ". Night hours count too: the farm was ready, the sun was not.",
                      lit: "That counts only the " + W.dayLit + " sunlit hours. Capacity factor uses every hour of the period: " + pct(W.dayCF) + ".",
                      best: "That is the best hour, " + W.dayBest + " MW. The average over all 24 hours is lower: " + pct(W.dayCF) + ".",
                      full: "It was available all day, but it made " + F.int(W.dayEnergy) + " MWh, not 2,400: " + pct(W.dayCF) + "." };
          seg(act, opts.map(function (o) { return { value: o.v, label: o.t }; }), "Capacity factor of the day", function (v) {
            keep("cfPick", v); api.saw(why[v], v !== "cf"); if (v === "cf") api.done();
          });
        } },
      { text: "Why does wind swing so much? The power in the wind grows with the [[cube-law|cube of its speed]]. Set a speed between 3 and 6 m/s, then double it.",
        build: function (act, api) { return windStep(act, api, "cube"); } },
      { text: "Now start at 8 m/s and double again. Watch what the turbine does above its [[rated-speed|rated speed]] of " + tb.ratedSpeed + " m/s.",
        build: function (act, api) { return windStep(act, api, "rated"); } },
      { text: "How many MWh does 1 MW make in a year? Running at full size all 8,760 hours of 2025, it would make 8,760 MWh. Tap each plant to see what 1 MW really makes.",
        build: function (act, api) {
          var top = H("div", null, act), out = H("div", { class: "lx5-permw", "aria-live": "polite" }, act), bars = H("div", { class: "lx5-pbars" }, act);
          function row(label, v, col, sel) {
            var r = H("div", { class: "lx5-prow" + (sel ? " sel" : "") }, bars); H("span", { text: label }, r);
            var b = H("div", { class: "lx5-fill-bar" }, r); H("i", { style: "width:" + (v / 8760 * 100).toFixed(2) + "%;background:" + col }, b); H("b", { text: F.int(v) + " MWh" }, r);
          }
          seg(top, KEYS.map(function (k) { return { value: k, label: "1 MW of " + TECH[k].label.toLowerCase(), color: TECH[k].col }; }), "Plant", function (k) {
            seenMW[k] = true; bars.innerHTML = "";
            row("At full size all year", 8760, "var(--lx-ink-3)");
            KEYS.forEach(function (j) { if (seenMW[j]) row(TECH[j].label + " at " + pct(T[j]), W[j].perMW, TECH[j].col, j === k); });
            out.innerHTML = "<b>1 MW of " + TECH[k].label.toLowerCase() + "</b>: 8,760 h × " + pct(T[k]) + " = <b>" + F.int(W[k].perMW) + " MWh</b> a year, enough for about " +
              F.int(W[k].homesPerMW) + " average U.S. homes.";
            if (KEYS.every(function (j) { return seenMW[j]; })) {
              api.done(); keep("permw", true);
              api.saw("Same 1 MW: " + KEYS.map(function (j) { return TECH[j].label.toLowerCase() + " " + F.int(W[j].perMW) + " MWh (" + F.int(W[j].homesPerMW) + " homes)"; }).join(", ") + ".");
            }
          });
        } },
      { text: "Your turn. Prairie Town's " + D.apply.mw + " MW wind farm runs at the 2025 U.S. wind average, " + pct(T.wind) + ". How much energy does it make in a year?",
        build: function (act, api) {
          var right = F.int(W.applyMWh) + " MWh";
          var opts = [{ v: "a", t: right }, { v: "b", t: F.int(D.apply.mw * HOURS) + " MWh" }, { v: "c", t: (D.apply.mw * T.wind).toFixed(1) + " MWh" }, { v: "d", t: F.int(D.apply.mw * HOURS * T.wind / 1000) + " MWh" }];
          var why = { a: D.apply.mw + " MW × 8,760 h × " + T.wind + " = " + right + ". Lesson 7 turns this energy into a cost per MWh.",
                      b: "That is the full box, as if the wind blew hard every hour. Multiply by the capacity factor, " + T.wind + ".",
                      c: "That is " + D.apply.mw + " MW × " + T.wind + ", the average output in MW. Energy needs hours: × 8,760 h.",
                      d: "Check the units: MW × h gives MWh, with no division by 1,000." };
          seg(act, opts.map(function (o) { return { value: o.v, label: o.t }; }), "Energy in a year", function (v) {
            keep("apply", v); api.saw(why[v], v !== "a"); if (v === "a") { api.done(); LX.progress.done(LESSON); }
          });
        } }
    ];
    function windStep(act, api, mode) {
      var cv = Curve(act, tb), read = H("div", { class: "lx5-stats", "aria-live": "polite" }, act);
      var row = H("div", { class: "lx5-wrow" }, act);
      var sl = LX.Slider(row, { label: "Wind speed", color: "var(--lx-wind)", max: tb.maxSlider, step: 0.5, unit: "m/s", onChange: function (v) { speed = v; prevSpeed = null; show(); },
        hint: function () { return "Cut-in " + tb.cutIn + " m/s, rated " + tb.ratedSpeed + " m/s, [[cut-out-speed|cut-out]] " + tb.cutOut + " m/s (illustrative 3 MW turbine)."; } });
      var dbl = H("button", { class: "lx-btn small", type: "button", text: "Double the wind speed" }, row);
      var res = H("p", { class: "lx5-read", "aria-live": "polite" }, act);
      speed = mode === "cube" ? 5 : 8; prevSpeed = null; sl.set(speed);
      function show() {
        cv.show(speed, prevSpeed);
        var p = power(speed, tb);
        read.innerHTML = "<div><span>Wind speed</span><b>" + speed + " m/s</b></div><div><span>Turbine output</span><b>" + kw(p) + "</b></div><div><span>Share of rated</span><b>" + pct(p / tb.ratedKW, 0) + "</b></div>";
        dbl.disabled = speed * 2 > tb.maxSlider || speed < 0.5;
      }
      dbl.addEventListener("click", function () {
        var v0 = speed, v1 = speed * 2, p0 = power(v0, tb), p1 = power(v1, tb);
        prevSpeed = v0; speed = v1; sl.set(v1); show();
        var ratio = p0 > 0 ? p1 / p0 : null;
        res.textContent = v0 + " → " + v1 + " m/s: " + kw(p0) + " → " + kw(p1) + (ratio != null ? " (× " + (Math.abs(ratio - 8) < 1e-9 ? "8" : ratio.toFixed(1)) + ")" : "") + ".";
        var inCube = v0 >= tb.cutIn && v1 <= tb.ratedSpeed, over = v1 > tb.ratedSpeed && v0 >= tb.cutIn;
        if (mode === "cube") {
          if (inCube) { doubled.cube = true; keep("cube", [v0, v1]); api.done(); api.saw("Eight times as much power (2 × 2 × 2) for twice the wind speed. Small changes in the wind make big changes in output."); }
          else api.saw(v0 < tb.cutIn ? "Below " + tb.cutIn + " m/s the blades do not turn: zero output. Try a start between 3 and 6 m/s." : "That double passed the rated speed. Start between 3 and 6 m/s to stay on the cube law.", true);
        } else {
          if (v1 > tb.cutOut) { api.saw("Above " + tb.cutOut + " m/s the turbine stops to protect itself: zero output. Try 8 m/s.", true); return; }
          if (over) { doubled.rated = true; keep("rated", [v0, v1]); api.done(); api.saw("Only × " + (p1 / p0).toFixed(1) + ": above " + tb.ratedSpeed + " m/s the blades turn out of the wind and hold " + F.int(tb.ratedKW) + " kW. Above " + tb.cutOut + " m/s the turbine stops to protect itself."); }
          else api.saw("Still below the rated speed: eight times again. Start at 8 m/s or more so the double passes " + tb.ratedSpeed + " m/s.", true);
        }
      });
      show();
    }
    var cards = LX.StepCards(live, { id: "t5-steps", steps: steps });
    // screenshot and demo hook: #lx-demo-<n> opens step n (1-8) with its action done (scripts/learn_screenshots.mjs, state "mid";
    // plain #lx-demo opens step 3). Readers never see it unless they type the hash.
    root.lxDemo = function (n) {
      var i = Math.max(0, Math.min(steps.length - 1, (n || 3) - 1)), el = function () { return cards.el; };
      var click = function (sel, k) { var b = el().querySelectorAll(sel)[k || 0]; if (b) b.click(); };
      pred = "nuclear"; KEYS.forEach(function (k) { seen[k] = true; }); level = Math.round(W.dayAvg);
      cards.go(i);
      if (i === 0) click(".lx-choice", 0);
      if (i === 1) { click(".lx-choice", 1); click(".lx-choice", 2); }
      if (i === 3 || i === 7) click(".lx-choice", 0);
      if (i === 4 || i === 5) click(".lx5-wrow .lx-btn");
      if (i === 6) { click(".lx-choice", 0); click(".lx-choice", 1); click(".lx-choice", 2); }
    };
    var dm = /^#lx-demo(?:-(\d+))?$/.exec(location.hash);
    if (dm) setTimeout(function () { root.lxDemo(dm[1] ? +dm[1] : 3); }, 50);
    buildExplain(W, D);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(W, D) {
    var host = document.getElementById("t5-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var P = D.plantMW, T = W.T;
    var c1 = H("div", { class: "lx-xcard" }, host);
    var reasons = { nuclear: "Off for refuelling about a month in spring", wind: "Wind speed varies; output follows its cube", solar: "Night, clouds and short winter days" };
    LX.CompareTable(c1, {
      title: "Three plants, 100 MW each, one year",
      columns: [{ key: "name", label: "Plant and why it is below 100%", main: true }, { key: "e", label: "Energy in the year, MWh", phone: "MWh", num: true },
                { key: "cf", label: "Capacity factor", phone: "CF", num: true, bar: { max: 1 } }],
      rows: KEYS.map(function (k) {
        return { key: k, color: TECH[k].col, name: TECH[k].label, note: reasons[k], e: { text: F.int(W[k].energy), value: W[k].energy },
                 cf: { text: pct(W[k].cf), value: W[k].cf } };
      }).concat([{ key: "full", color: "var(--lx-ink-3)", name: "At full size", note: "Every hour of the year", e: { text: F.int(P * HOURS), value: P * HOURS }, cf: { text: "100%", value: 1 } }]),
      sorts: [{ label: "As built", order: ["nuclear", "wind", "solar", "full"], note: "The same 100 MW of nameplate makes very different energy." },
              { label: "By capacity factor", order: ["full", "nuclear", "wind", "solar"], ranked: true, note: "<b>Capacity factor ranks the energy job.</b> It says nothing yet about when the energy comes (lesson 6)." }]
    });
    var c2 = H("div", { class: "lx-xcard" }, host);
    var log = function () { return LX.store.get("t5-log", {}) || {}; };
    EquationCard(c2, {
      title: "The capacity-factor equation",
      lede: "Tap a symbol to see what it means and where it appeared in this lesson.",
      rows: [{ parts: [{ k: "cf" }, "=", { k: "E" }, "÷", "(", { k: "P" }, "×", { k: "T" }, ")"], say: "Capacity factor equals energy made divided by size times hours." },
             { parts: [{ k: "E" }, "=", { k: "P" }, "×", { k: "T" }, "×", { k: "cf" }], say: "Turned around: energy made equals size times hours times capacity factor.", note: "the same, turned around" }],
      symbols: {
        cf: { sym: "CF", name: "Capacity factor", unit: "%", color: "var(--lx-tier-1)", text: "The share of the most energy the plant could have made that it actually made.",
              you: function () { return "Solar on " + D.day.dateLabel + ": " + pct(W.dayCF) + ". Over 2025: nuclear " + pct(W.nuclear.cf) + ", wind " + pct(W.wind.cf) + ", solar " + pct(W.solar.cf) + "."; } },
        E: { sym: "E", name: "Energy made", unit: "MWh", color: "var(--lx-solar)", text: "The sum of the hourly outputs: each hour's MW × 1 h.",
             you: function () { var L = log(); return "The solar day: " + F.int(W.dayEnergy) + " MWh" + (L.level != null ? "; your flat line, " + L.level + " MW × 24 h = " + F.int(L.level * 24) + " MWh" : "") + "."; } },
        P: { sym: "P", name: "Size (nameplate capacity)", unit: "MW", color: "var(--lx-nuc)", text: "The most power the plant can make at once: its [[capacity|capacity]].",
             you: "100 MW for each of the three plants; " + D.apply.mw + " MW for Prairie Town's wind farm." },
        T: { sym: "T", name: "Hours in the period", unit: "h", color: "var(--lx-ink-3)", text: "Every hour counts, including nights and calm days.", you: "24 h for one day; 8,760 h for 2025." }
      },
      sel: "cf",
      code: "energy_mwh = sum(hourly_mw)            # each hour: MW x 1 h\ncf = energy_mwh / (size_mw * hours)      # e.g. " + F.int(W.dayEnergy) + " / (100 * 24) = " + W.dayCF.toFixed(3) + "\nenergy_year = size_mw * 8760 * cf        # " + D.apply.mw + " * 8760 * " + T.wind + " = " + F.int(W.applyMWh)
    });
  }

  LX.mount("capacity-factor", function (live, data, root) { view(live, data, root); });
})();
