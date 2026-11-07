// 01-power-energy.js — Lesson 1, "Power or energy? What is the difference between kW and kWh?" (step-card form, W1,
// 2026-11-02).
//
// Data: assets/learn/data/01-power-energy.json (appliance powers, illustrative; sourced real-world anchors with URLs and
// dates; the ladder and the wind-farm claim), assets/learn/data/town.json and town_year.json (Prairie Town's lesson-0 day:
// the SPP shape of 3 September 2025 scaled to the town's 450 MW peak and rounded hour by hour exactly as in lesson 0, so
// the day adds up to 6,957 MWh as in lesson 0, K1, K4 and K7), and town_days.json (`stats`: the Southwest Power Pool's
// 2025 energy and peak from EIA-930).
//
// Model (closed form, no solver):
//   power P (W) = sum of the watts of the appliances switched on
//   running the clock for m minutes adds energy E += P x m / 60 (Wh); each appliance keeps its own tally, and the log
//   holds one segment per stretch of constant power, so E = sum over segments of P x duration (checked in the tests)
//   time to use 1 kWh = 60,000 / P minutes
//   ladder rung of an amount of energy = the largest of Wh, kWh, MWh, GWh, TWh that keeps the number at 1 or more
//   average power of a year = energy / 8,760 h
//   homes a wind farm "powers" = average output / average draw of a home = MW x 10^6 x capacity factor / home watts
//     (an illustrative annual-energy equivalent: the home benchmark is EIA's 2022 average residential purchases)
//   the bathtub: its size only grows during an experiment (until "Reset the meter"); every change is announced and the old
//     brim stays drawn (tubScale)
//   step 4 accepts exactly the two stated jobs: each appliance run alone for its stated time, nothing else (checkJobs)
// Every number the page states comes from this model or from the sourced anchors; _tests/learn/test_01-power-energy.js
// checks them against the .qmd.
//
// Lesson-local components (candidates for the shared library, see learn/_w1/01-power-energy.yml): the appliance board
// (toggles, power and energy meters, a two-panel power/energy chart), the energy ladder (place items on rungs), the
// bathtub annotated diagram and the scale strip.
(function () {
  "use strict";
  var RUNGS = ["Wh", "kWh", "MWh", "GWh", "TWh"];

  // ---------------------------------------------------------------- pure model
  function num(v, d) { return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function power(devs, on) { return devs.reduce(function (s, d) { return s + (on[d.id] ? d.watts : 0); }, 0); }
  function newMeter() { return { t: 0, wh: 0, by: {}, log: [] }; }
  // run the clock for `minutes` with the appliances in `on`; returns a new meter (the old one is not changed)
  function run(m, devs, on, minutes) {
    var p = power(devs, on), ids = devs.filter(function (d) { return on[d.id]; }).map(function (d) { return d.id; }).join(",");
    var out = { t: m.t + minutes, wh: m.wh + p * minutes / 60, by: {}, log: m.log.slice() };
    Object.keys(m.by).forEach(function (k) { out.by[k] = m.by[k]; });
    devs.forEach(function (d) { if (on[d.id]) out.by[d.id] = (out.by[d.id] || 0) + d.watts * minutes / 60; });
    var last = out.log[out.log.length - 1];
    if (last && last.ids === ids && Math.abs(last.t1 - m.t) < 1e-9) out.log[out.log.length - 1] = { t0: last.t0, t1: out.t, w: p, ids: ids };
    else out.log.push({ t0: m.t, t1: out.t, w: p, ids: ids });
    return out;
  }
  function logEnergy(m) { return m.log.reduce(function (s, g) { return s + g.w * (g.t1 - g.t0) / 60; }, 0); }
  function minutesPerKWh(w) { return 60000 / w; }
  function rung(wh) { return wh > 0 ? Math.max(0, Math.min(RUNGS.length - 1, Math.floor(Math.log10(wh) / 3 + 1e-9))) : 0; }
  function fmtE(wh) {
    var r = rung(wh), v = wh / Math.pow(1000, r), d = v >= 100 || Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1;
    return num(v, d) + " " + RUNGS[r];
  }
  function fmtKW(w) { return num(w / 1000, w >= 10000 ? 1 : 2) + " kW"; }
  function fmtKWh(wh) { return num(wh / 1000, wh >= 10000 ? 1 : 2) + " kWh"; }
  function fmtW(w) { return w >= 1000 ? num(w / 1000, w % 1000 ? 1 : 0) + " kW" : num(w, 0) + " W"; }
  function fmtDur(min) {
    var h = Math.floor(min / 60 + 1e-9), m = Math.round(min - 60 * h), s = Math.round((min - Math.floor(min)) * 60);
    if (min < 60 && s && min < 10) return Math.floor(min) + " min " + s + " s";
    if (min < 60) return Math.round(min) + " min";
    return h + " h" + (m ? " " + m + " min" : "");
  }
  // Prairie Town's lesson-0 day: the same slice, scale and rounding as grid-operator.js prepare() (wind and solar to whole
  // MW, the gas need to the 5 MW step, demand = need + the flat plant + wind + solar; the test checks they agree), so the
  // day is the 24 hourly MW values lesson 0 plays, which add up to 6,957 MWh (the unrounded shape is 0.9 MWh less)
  function townDay(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet, t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0), demand = [];
    for (var k = 0; k < 24; k++) {
      var w = Math.round(year.wind[i + k] / 1000 * f.wind.mw), s = Math.round(year.solar[i + k] / 1000 * f.solar.mw);
      var need = Math.round((year.demand[i + k] / 1000 * sc.demandPeakMW - f.nuclear.mw - w - s) / sc.step) * sc.step;
      demand.push(need + f.nuclear.mw + w + s);
    }
    return { date: sc.date, label: sc.dateLabel || sc.date, demand: demand, mwh: demand.reduce(function (a, b) { return a + b; }, 0),
             peakMW: Math.max.apply(null, demand), scalePeakMW: sc.demandPeakMW };
  }
  function homes(mw, cf, homeW) { return mw * 1e6 * cf / homeW; }
  function closestTick(ticks, v) {
    var best = 0; ticks.forEach(function (t, i) { if (Math.abs(Math.log10(t / v)) < Math.abs(Math.log10(ticks[best] / v))) best = i; });
    return best;
  }
  // ---- the bathtub on the board: the smallest "nice" size that holds the energy, never smaller than before
  var KWH_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  function nice(v, steps) { for (var i = 0; i < steps.length; i++) if (v <= steps[i] + 1e-9) return steps[i]; return steps[steps.length - 1]; }
  // prevCap: the tub's size in kWh so far (null after a reset); wh: the energy used so far
  function tubScale(prevCap, wh) {
    var need = nice(Math.max(wh / 1000, 0.1), KWH_STEPS), cap = prevCap ? Math.max(prevCap, need) : need;
    return { cap: cap, changed: !!prevCap && cap > prevCap, was: prevCap || cap, fill: Math.min(1, wh / 1000 / cap) };
  }
  // ---- step 4: did the reader run exactly the two jobs, each alone? (a: first job, b: second job, {id, minutes})
  function checkJobs(m, a, b) {
    var r = { aMin: 0, bMin: 0, aWh: m.by[a.id] || 0, bWh: m.by[b.id] || 0, otherWh: 0, mixed: false };
    m.log.forEach(function (g) {
      if (!g.ids || g.w <= 0) return;
      var dt = g.t1 - g.t0, ids = g.ids.split(",");
      if (g.ids === a.id) r.aMin += dt;
      else if (g.ids === b.id) r.bMin += dt;
      else if (ids.indexOf(a.id) >= 0 || ids.indexOf(b.id) >= 0) r.mixed = true;
    });
    Object.keys(m.by).forEach(function (k) { if (k !== a.id && k !== b.id) r.otherWh += m.by[k]; });
    var eps = 1e-6;
    r.over = r.mixed || r.otherWh > eps || r.aMin > a.minutes + eps || r.bMin > b.minutes + eps;
    r.ok = !r.over && Math.abs(r.aMin - a.minutes) < eps && Math.abs(r.bMin - b.minutes) < eps;
    r.state = r.ok ? "ok" : r.over ? "over" : m.wh > eps ? "partial" : "empty";
    return r;
  }
  // everything the page states, derived once
  function world(D, town, year, days) {
    var A = D.anchors, st = days.stats, td = townDay(town, year), devs = D.devices.list;
    var byId = {}; devs.forEach(function (d) { byId[d.id] = d; });
    var wh = { phone: A.phone_charge.value * 1000, homeday: A.home_year.value * 1000 / 365, homeyear: A.home_year.value * 1000,
               town: td.mwh * 1e6, spp: st.annual_demand_TWh * 1e12, us: A.us_year.value * 1000 };
    var items = D.ladder.items.map(function (it) { return { id: it.id, label: it.label, wh: wh[it.id], rung: rung(wh[it.id]), text: fmtE(wh[it.id]) }; });
    var pa = D.predict.a, pb = D.predict.b, ea = byId[pa.id].watts * pa.minutes / 60, eb = byId[pb.id].watts * pb.minutes / 60;
    var avgGW = A.us_year.value / D.fermi.hours / 1e6, peakGW = A.us_peak.value / 1000;
    var homeW = A.home_year.value * 1000 / D.fermi.hours;
    return {
      devs: devs, byId: byId, wh: wh, items: items, town: td,
      predict: { a: pa, b: pb, whA: ea, whB: eb, answer: Math.abs(ea - eb) < 1e-9 ? "same" : ea > eb ? "a" : "b" },
      // the peak-to-average ratio comes from one data set (SPP's 2025 hourly demand), never from mixing U.S. totals
      fermi: { avgGW: avgGW, peakGW: peakGW, answer: closestTick(D.fermi.ticks_gw, avgGW),
               sppAvgGW: st.annual_demand_TWh * 1000 / D.fermi.hours, sppPeakGW: st.peak_demand_GW,
               sppRatio: st.peak_demand_GW / (st.annual_demand_TWh * 1000 / D.fermi.hours) },
      span: wh.us / wh.phone, spanText: num(Math.round(wh.us / wh.phone / 1e13) * 10, 0) + " trillion",
      wind: { mw: D.wind.mw, claim: homes(D.wind.mw, 1, 1000), cf: A.wind_cf.value, homeW: homeW, real: homes(D.wind.mw, A.wind_cf.value, homeW),
              refCF: Math.round(A.wind_cf.value * 1000) / 10, refW: Math.round(homeW) },
      spp: { twh: st.annual_demand_TWh, peakGW: st.peak_demand_GW }
    };
  }
  var model = { RUNGS: RUNGS, power: power, newMeter: newMeter, run: run, logEnergy: logEnergy, minutesPerKWh: minutesPerKWh, rung: rung,
                fmtE: fmtE, fmtKW: fmtKW, fmtKWh: fmtKWh, fmtW: fmtW, fmtDur: fmtDur, num: num, townDay: townDay, homes: homes,
                closestTick: closestTick, world: world, nice: nice, KWH_STEPS: KWH_STEPS, tubScale: tubScale, checkJobs: checkJobs };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S, LESSON = "01-power-energy";
  // pictograms this lesson needs beyond LX.IC (24-unit strokes, same style)
  var ICON = {
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1.2"/><path d="M2.5 18.5h19l-1.6-3.5H4.1z"/>',
    tv: '<rect x="3" y="4.5" width="18" height="12.5" rx="1.5"/><path d="M9 21h6M12 17v4"/>',
    microwave: '<rect x="2.5" y="5" width="19" height="14" rx="1.5"/><rect x="5" y="7.5" width="10" height="9" rx="1"/><path d="M18 8.5v.4M18 11v.4M18 13.5v3"/>',
    dryer: '<path d="M14 9.2a5 5 0 1 0-1.4 3.5"/><path d="M12.6 4.6l8.4-1.6v9.4l-8.4-1.6"/><path d="M8 14.2l-1.3 6.3h3.4l1.1-5.6"/><circle cx="9" cy="9.2" r="1.6"/>',
    car: '<path d="M3.5 16.5v-4.2l2.2-5.3h12.6l2.2 5.3v4.2z"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/><path d="M12.6 8.6l-2.3 3h3.4l-2.3 3"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'
  };
  function ico(name) {
    if (LX.IC[name]) return LX.icon(name);
    return '<svg class="lx-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICON[name] || "") + "</svg>";
  }
  var KW_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20], MIN_STEPS = [60, 120, 180, 240, 360, 480, 720, 1440, 2880, 10080];

  // ---- the unit key: the power ladder and the energy ladder side by side (step 1, where W first appears)
  function unitKey(host) {
    var dl = H("dl", { class: "t1-units", "aria-label": "Unit key" }, host);
    H("dt", { html: LX.rich("[[power|Power]], how fast") }, dl);
    H("dd", { html: LX.rich("W → [[kilowatt|kW]] → [[megawatt|MW]] → GW, each 1,000 times the one before") }, dl);
    H("dt", { html: LX.rich("[[energy|Energy]], how much") }, dl);
    H("dd", { html: LX.rich("Wh → [[kilowatt-hour|kWh]] → MWh → GWh → TWh: a power unit kept up for one hour") }, dl);
    return dl;
  }

  // ---- the appliance board: toggles, two meters, the clock, a power-over-time and energy-over-time chart
  function Board(W) {
    var el = H("div", { class: "t1-board" }), on = {}, m = newMeter(), listeners = [], busy = false, cap = KWH_STEPS[0];
    var devBox = H("div", { class: "t1-devs", role: "group", "aria-label": "Appliances: switch each on or off" }, el), btn = {};
    W.devs.forEach(function (d) {
      var b = H("button", { class: "t1-dev", type: "button", "aria-pressed": "false" }, devBox);
      H("span", { class: "ic", html: ico(d.icon) }, b);
      H("b", { text: d.label }, b); H("span", { class: "w", text: fmtW(d.watts) }, b);
      b.addEventListener("click", function () { on[d.id] = !on[d.id]; paint(); fire(); });
      btn[d.id] = b;
    });
    var meters = H("div", { class: "t1-meters" }, el);
    var pm = H("div", { class: "t1-m pw" }, meters);
    H("span", { class: "k", html: "Power now <small>how fast</small>" }, pm);
    var pv = H("b", { class: "v", "aria-live": "polite" }, pm);
    var bar = H("div", { class: "t1-logbar", "aria-hidden": "true" }, pm), barFill = H("i", null, bar);
    var tk = H("div", { class: "t1-logticks", "aria-hidden": "true" }, pm);
    ["1 W", "10 W", "100 W", "1 kW", "10 kW"].forEach(function (t) { H("span", { text: t }, tk); });
    var em = H("div", { class: "t1-m en" }, meters);
    H("span", { class: "k", html: "Energy used so far <small>a running total</small>" }, em);
    var ev = H("b", { class: "v", "aria-live": "polite" }, em);
    var tub = H("div", { class: "t1-tub", "aria-hidden": "true" }, em), water = H("i", null, tub), brim = H("b", { class: "t1-brim", hidden: true }, tub);
    var tubLab = H("span", { class: "t1-tublab", "aria-live": "polite" }, em);
    var ctl = H("div", { class: "t1-run" }, el);
    var r10 = H("button", { class: "lx-btn small", type: "button", html: LX.icon("clock") + "Run 10 min" }, ctl);
    var r60 = H("button", { class: "lx-btn small", type: "button", html: LX.icon("clock") + "Run 1 hour" }, ctl);
    var clock = H("span", { class: "t1-clock", "aria-live": "polite" }, ctl);
    var rs = H("button", { class: "lx-link", type: "button", text: "Reset the meter" }, ctl);
    r10.addEventListener("click", function () { go(10); });
    r60.addEventListener("click", function () { go(60); });
    rs.addEventListener("click", function () { m = newMeter(); cap = KWH_STEPS[0]; paint(); fire(); });
    var by = H("div", { class: "t1-by", "aria-live": "polite" }, el);
    var chart = H("div", { class: "t1-chart" }, el);
    var alt = H("details", { class: "lx-textalt" }, el); H("summary", { text: "Text version of the chart" }, alt);
    var altBox = H("div", null, alt);

    function go(minutes) {
      if (busy) return;
      var p = power(W.devs, on);
      if (LX.reduced() || p === 0) { m = run(m, W.devs, on, minutes); paint(); fire(); return; }
      // a short count-up: the meter runs in small slices so the tub fills and the chart grows
      busy = true; r10.disabled = r60.disabled = true;
      var done = 0, slices = 12, step = minutes / slices;
      (function tick() {
        m = run(m, W.devs, on, step); done++; paint();
        if (done < slices) setTimeout(tick, 45); else { busy = false; r10.disabled = r60.disabled = false; paint(); fire(); }
      })();
    }
    function paint() {
      var p = power(W.devs, on);
      W.devs.forEach(function (d) { btn[d.id].setAttribute("aria-pressed", on[d.id] ? "true" : "false"); });
      pv.innerHTML = fmtKW(p) + (p ? " <small>(" + num(p, 0) + " W)</small>" : "");
      barFill.style.width = (p > 0 ? Math.max(2, Math.min(100, Math.log10(p) / 4 * 100)) : 0) + "%";
      ev.textContent = fmtKWh(m.wh);
      // the tub only grows during an experiment; a bigger tub is announced, and its old brim stays drawn
      var ts = tubScale(cap, m.wh), kwh = function (v) { return num(v, v < 1 ? 1 : 0) + " kWh"; };
      water.style.height = ts.fill * 100 + "%";
      if (ts.changed) {
        brim.hidden = false; brim.style.bottom = ts.was / ts.cap * 100 + "%";
        tubLab.textContent = "Bigger tub: it now holds " + kwh(ts.cap) + ". The dashed line is the old " + kwh(ts.was) + " brim, so the same water sits lower.";
        tubLab.classList.add("is-new");
      } else if (!m.wh) { brim.hidden = true; tubLab.classList.remove("is-new"); tubLab.textContent = "Tub holds " + kwh(ts.cap) + " (it grows if you need more)"; }
      cap = ts.cap;
      clock.textContent = "Clock run: " + (m.t ? fmtDur(m.t) : "0 min");
      by.innerHTML = "";
      var ids = Object.keys(m.by).filter(function (k) { return m.by[k] > 1e-9; });
      if (ids.length) {
        H("span", { class: "k", text: "Energy by appliance:" }, by);
        ids.forEach(function (k) { var c = H("span", { class: "t1-chip" }, by); H("span", { html: ico(W.byId[k].icon) }, c); H("span", { text: W.byId[k].label + " " + fmtKWh(m.by[k]) }, c); });
      }
      draw();
    }
    function draw() {
      chart.innerHTML = "";
      var w = Math.max(280, chart.clientWidth || 640), h1 = 96, h2 = 84, gap = 30, ml = 46, mr = 10, mt = 18, Hh = mt + h1 + gap + h2 + 26;
      var svg = S("svg", { viewBox: "0 0 " + w + " " + Hh, width: w, height: Hh, role: "img",
        "aria-label": m.t ? "Power over time (top) and energy used so far (bottom), after " + fmtDur(m.t) + ": " + fmtKWh(m.wh) + "." : "Empty chart: run the clock to draw power and energy over time." }, chart);
      var T = nice(Math.max(m.t, 60), MIN_STEPS), pmax = Math.max.apply(null, [0].concat(m.log.map(function (g) { return g.w; })));
      var yP = nice(Math.max(pmax / 1000, 0.1), KW_STEPS), yE = nice(Math.max(m.wh / 1000, 0.1), KWH_STEPS);
      var iw = w - ml - mr, x = function (t) { return ml + t / T * iw; };
      var p0 = mt + h1, e0 = mt + h1 + gap + h2;
      var yp = function (kw) { return p0 - kw / yP * h1; }, ye = function (kwh) { return e0 - kwh / yE * h2; };
      function axis(y0, hh, max, unit, title) {
        [0, 0.5, 1].forEach(function (f) {
          var yy = y0 - f * hh;
          S("path", { d: "M" + ml + " " + yy + "H" + (w - mr), stroke: "var(--lx-line)", "stroke-width": 1 }, svg);
          S("text", { x: ml - 6, y: yy + 4, "text-anchor": "end", class: "t1-ax" }, svg).textContent = String(+(max * f).toFixed(2));
        });
        S("text", { x: ml, y: y0 - hh - 6, class: "t1-axt" }, svg).textContent = title + " (" + unit + ")";
      }
      axis(p0, h1, yP, "kW", "Power"); axis(e0, h2, yE, "kWh", "Energy used so far");
      var tickN = T / (T <= 120 ? 30 : T <= 480 ? 60 : T <= 720 ? 120 : T <= 1440 ? 240 : 480);
      for (var k = 0; k <= tickN; k++) {
        var tt = T * k / tickN;
        if (w < 480 && tickN > 4 && k % 2 && k !== tickN) continue;
        S("text", { x: x(tt), y: Hh - 6, "text-anchor": k === 0 ? "start" : k === tickN ? "end" : "middle", class: "t1-ax" }, svg).textContent = !tt ? "0" : tt < 60 ? Math.round(tt) + " min" : num(tt / 60, tt % 60 ? 1 : 0) + " h";
      }
      altBox.innerHTML = m.t ? "" : "<p>Nothing run yet.</p>";
      if (!m.t) { S("text", { x: ml + iw / 2, y: mt + h1 / 2 + 4, "text-anchor": "middle", class: "t1-axt" }, svg).textContent = "Switch something on and run the clock"; return; }
      // power: one block per segment, coloured by the single appliance if only one is on
      m.log.forEach(function (g) {
        if (g.w <= 0) return;
        var only = g.ids.indexOf(",") < 0 ? g.ids : "";
        S("rect", { x: x(g.t0), y: yp(g.w / 1000), width: Math.max(1, x(g.t1) - x(g.t0)), height: p0 - yp(g.w / 1000),
                    class: "t1-blk" + (only ? " d-" + only : "") }, svg);
      });
      // energy: a line whose slope is the power
      var d = "M" + x(0) + " " + ye(0), acc = 0;
      m.log.forEach(function (g) { acc += g.w * (g.t1 - g.t0) / 60; d += " L" + x(g.t1) + " " + ye(acc / 1000); });
      S("path", { d: d, fill: "none", stroke: "var(--lx-ink)", "stroke-width": 2.2, "stroke-linejoin": "round" }, svg);
      S("circle", { cx: x(m.t), cy: ye(m.wh / 1000), r: 4, fill: "var(--lx-ink)" }, svg);
      // text version
      var tb = H("table", { class: "lx-mini-table" }, H("div", { class: "lx-scroll-x" }, altBox)), hr = H("tr", null, H("thead", null, tb));
      ["From", "To", "Appliances on", "Power", "Energy added"].forEach(function (t) { H("th", { scope: "col", text: t }, hr); });
      var body = H("tbody", null, tb);
      m.log.forEach(function (g) {
        var tr = H("tr", null, body);
        [fmtDur(g.t0), fmtDur(g.t1), g.ids ? g.ids.split(",").map(function (k) { return W.byId[k].label; }).join(", ") : "none", fmtKW(g.w), fmtKWh(g.w * (g.t1 - g.t0) / 60)]
          .forEach(function (t) { H("td", { text: t }, tr); });
      });
    }
    function fire() { var st = state(); listeners.forEach(function (f) { f(st); }); LX.emit("t1-board", st); }
    function state() { return { on: on, meter: m, power: power(W.devs, on), anyOn: power(W.devs, on) > 0 }; }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(chart)) draw(); }).observe(chart);
    paint();
    return {
      el: el, state: state, listen: function (f) { listeners = f ? [f] : []; },
      reset: function () { m = newMeter(); cap = KWH_STEPS[0]; paint(); },
      only: function (ids, f) { on = {}; (ids || []).forEach(function (k) { on[k] = true; }); paint(); if (f) fire(); },
      run: function (min) { m = run(m, W.devs, on, min); paint(); fire(); }
    };
  }

  // ---- the energy ladder: one item at a time, the reader picks its rung
  function Ladder(W) {
    var el = H("div", { class: "t1-ladder" }), k = 0, right = 0, placed = {}, api = { el: el, onDone: null, done: false, right: 0 };
    var q = H("div", { class: "t1-lq" }, el);
    var rungs = H("ol", { class: "t1-rungs", "aria-label": "The ladder, from the largest unit at the top" }, el), rowEl = {};
    RUNGS.slice().reverse().forEach(function (u) {
      var i = RUNGS.indexOf(u), li = H("li", { class: "t1-rung" }, rungs);
      var lab = H("div", { class: "u" }, li); H("b", { text: u }, lab); H("small", { text: ["watt-hours", "thousand Wh", "million Wh", "billion Wh", "trillion Wh"][i] }, lab);
      rowEl[i] = H("div", { class: "items" }, li);
      if (i > 0) H("span", { class: "x", text: "×1,000", "aria-hidden": "true" }, li);
    });
    // focus: after each answer the next question (or the final score) takes keyboard focus, so the reader keeps their place
    function ask(moveFocus) {
      q.innerHTML = "";
      if (k >= W.items.length) {
        var fin = H("p", { class: "lx-q", tabindex: "-1", text: "Done: " + right + " of " + W.items.length + " on the first try." }, q);
        if (moveFocus) fin.focus();
        return;
      }
      var it = W.items[k];
      H("p", { class: "lx-eyebrow", text: "Item " + (k + 1) + " of " + W.items.length }, q);
      var qid = LX.uid("lq");
      var qp = H("p", { class: "lx-q", id: qid, tabindex: "-1", text: it.label }, q);
      var row = H("div", { class: "lx-choices-row t1-rungbtns", role: "group", "aria-labelledby": qid }, q);
      RUNGS.forEach(function (u, i) {
        H("button", { class: "lx-choice", type: "button", text: u, onclick: function () { pick(it, i); } }, row);
      });
      if (moveFocus) qp.focus();
    }
    var fb = H("div", { class: "t1-lfb", "aria-live": "polite" }, el);
    function pick(it, i) {
      var ok = i === it.rung; if (ok) right++;
      placed[it.id] = true;
      var c = H("span", { class: "t1-lchip" + (ok ? "" : " late") }, rowEl[it.rung]);
      H("b", { text: it.text }, c); H("span", { text: it.label }, c);
      fb.innerHTML = "";
      H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " +
        LX.esc(it.label) + ": " + LX.esc(it.text) + (ok ? "." : ", so it sits on the " + RUNGS[it.rung] + " rung.") + "</div>" }, fb);
      k++; ask(true);
      if (k >= W.items.length) { api.done = true; api.right = right; if (api.onDone) api.onDone(right); }
    }
    ask();
    return api;
  }

  // ---- step cards
  function view(live, data, root) {
    var D = data["01_power_energy"], W = world(D, data.town, data.town_year, data.town_days);
    var board = Board(W), ladder = null, guess = null;
    var pa = W.byId[W.predict.a.id], pb = W.byId[W.predict.b.id];
    var P = LX.store.get("t1-log", {}) || {};
    function keep(k, v) { P[k] = v; LX.store.set("t1-log", P); LX.emit("t1-log", P); }
    board.listen(null);
    var steps = [
      { text: "Two jobs, one question. A " + pa.label.toLowerCase() + " runs at " + num(pa.watts, 0) + " W for " + W.predict.a.minutes + " minutes. A " +
              pb.label.toLowerCase() + " runs at " + pb.watts + " W for " + W.predict.b.minutes / 60 + " hours. Which uses more [[energy|energy]]?",
        build: function (act, api) {
          LX.Predict(act, { id: "t1-two-jobs", options: [{ value: "a", label: "The " + pa.label.toLowerCase() }, { value: "b", label: "The " + pb.label.toLowerCase() }, { value: "same", label: "The same" }],
            lockText: "Locked in. You will test it on the appliance board in step 4.", onPick: function (v) { guess = v; api.done(); } });
          if (LX.progress.guess("t1-two-jobs")) { guess = LX.progress.guess("t1-two-jobs"); api.done(); }
          unitKey(act);
        } },
      { text: "This is a home's appliance board. Switch on two appliances, then run the clock. [[power|Power]] is how fast the home uses energy right now; energy is how much it has used so far.",
        build: function (act, api) {
          act.appendChild(board.el);
          var chk = function (s) {
            if (s.meter.wh > 0) { api.done(); api.saw("Power: " + fmtKW(s.power) + " right now. Energy: " + fmtKWh(s.meter.wh) + " after " + fmtDur(s.meter.t) + ". Power is a rate; energy is an amount."); }
          };
          board.listen(chk); chk(board.state());
        } },
      { text: "Now switch everything off. Power drops to zero at once. Watch the energy meter: does the energy already used go back down?",
        build: function (act, api) {
          act.appendChild(board.el);
          var chk = function (s) {
            if (!s.anyOn && s.meter.wh > 0) { api.done(); api.saw("Power is 0 kW, but the " + fmtKWh(s.meter.wh) + " already used stays. This meter is a running total of energy used: it never goes down, and your bill counts it."); }
          };
          board.listen(chk); chk(board.state());
        } },
      { text: "Test your prediction. Reset the meter, run the " + pa.label.toLowerCase() + " alone for " + W.predict.a.minutes + " minutes, then the " + pb.label.toLowerCase() + " alone for " + W.predict.b.minutes / 60 + " hours.",
        build: function (act, api) {
          act.appendChild(board.el);
          // only the two stated jobs pass: each appliance alone, for exactly its time (checkJobs); the reader sees their own totals
          var st = H("p", { class: "t1-jobs", "aria-live": "polite" }, act), acted = false;
          var totals = function (r) {
            return pa.label + " " + fmtKWh(r.aWh) + " (" + fmtDur(r.aMin) + " alone), " + pb.label.toLowerCase() + " " + fmtKWh(r.bWh) + " (" + fmtDur(r.bMin) + " alone)" +
              (r.otherWh > 1e-6 ? ", other appliances " + fmtKWh(r.otherWh) : "");
          };
          var chk = function (s) {
            var r = checkJobs(s.meter, W.predict.a, W.predict.b);
            if (r.ok) {
              st.textContent = ""; api.done();
              var g = guess || LX.progress.guess("t1-two-jobs"), names = { a: "the " + pa.label.toLowerCase(), b: "the " + pb.label.toLowerCase(), same: "the same" };
              api.saw((g ? (g === W.predict.answer ? "You called it. " : "You guessed " + names[g] + ". ") : "") + "Your meter: " + pa.label.toLowerCase() + " " + fmtKWh(r.aWh) + ", " +
                pb.label.toLowerCase() + " " + fmtKWh(r.bWh) + ". " + num(pa.watts / 1000, 1) + " kW × " + W.predict.a.minutes + "/60 h = " + num(pb.watts / 1000, 2) + " kW × " +
                W.predict.b.minutes / 60 + " h: energy is power × time.", g && g !== W.predict.answer);
              keep("predictTested", true);
              return;
            }
            if (!acted) return;
            if (r.state === "over") st.textContent = "Your totals: " + totals(r) + ". That is more than the two jobs" + (r.mixed ? ", or they ran together" : "") + ": reset the meter and run each one alone, for its stated time.";
            else if (r.state === "partial") st.textContent = "So far: " + totals(r) + ".";
            else st.textContent = "Meter at zero. Switch on only the " + pa.label.toLowerCase() + ", then run 10 min.";
          };
          board.listen(function (s) { acted = true; chk(s); }); chk(board.state());
        } },
      { text: "One [[kilowatt-hour|kilowatt-hour]], six ways. Tap three appliances to see how long each takes to use 1 kWh. The more power, the faster the energy adds up.",
        build: function (act, api) {
          board.listen(null);
          var list = H("ul", { class: "t1-kwh" }, act), seen = 0, maxM = Math.max.apply(null, W.devs.map(function (d) { return minutesPerKWh(d.watts); }));
          W.devs.forEach(function (d) {
            var li = H("li", null, list), b = H("button", { class: "lx-choice", type: "button", "aria-expanded": "false" }, li);
            H("span", { html: ico(d.icon) }, b); H("span", { text: d.label + " · " + fmtW(d.watts) }, b);
            var res = H("div", { class: "t1-kwhres", hidden: true }, li), bar = H("i", null, res), lab = H("b", null, res);
            b.addEventListener("click", function () {
              if (!res.hidden) return;
              var mins = minutesPerKWh(d.watts); res.hidden = false; b.setAttribute("aria-expanded", "true");
              bar.style.width = Math.max(4, Math.log10(mins) / Math.log10(maxM) * 100) + "%";
              lab.textContent = fmtDur(mins);
              if (++seen >= 3) { api.done(); api.saw("Time to use 1 kWh = 1 kWh ÷ power: ten times the power, a tenth of the time. The bars use a [[log-scale|log scale]]: each equal step along a bar means ten times longer."); }
            });
          });
        } },
      { text: "Energy comes in sizes 1,000 times apart. Put each item on its rung of the ladder, from charging a phone once to the whole country's year.",
        build: function (act, api) {
          board.listen(null);
          if (!ladder) ladder = Ladder(W);
          act.appendChild(ladder.el);
          var chk = function () {
            api.done(); api.saw("Five units, each 1,000 times the one below: four steps of ×1,000 from Wh to TWh. The U.S. year is about " + W.spanText + " times a phone charge.");
          };
          ladder.onDone = function (right) { keep("ladder", right); chk(); };
          if (ladder.done) chk();
        } },
      { text: "Stretch, optional: a [[fermi-estimate|Fermi estimate]]. The U.S. used about " + num(Math.round(W.wh.us / 1e12), 0) + " TWh of electricity in 2025, and a year has 8,760 hours. Roughly what was the [[average-power|average power]]?",
        free: true,
        build: function (act, api) {
          board.listen(null);
          var F = W.fermi, usTWh = Math.round(W.wh.us / 1e12);
          H("p", { class: "lx-hint", text: "Hint: 1 TWh = 1,000 GWh, and GWh ÷ hours gives GW." }, act);
          LX.Guess(act, { id: "t1-fermi", ticks: D.fermi.ticks_gw.map(function (t) { return num(t, 0) + " GW"; }), answer: F.answer, start: 0,
            srLabel: "Your estimate of the average U.S. power in 2025",
            onLock: function (g, out) {
              var ok = g === F.answer;
              H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right order of magnitude." : "About " + num(D.fermi.ticks_gw[F.answer], 0) + " GW.") + "</b> Average power = energy ÷ time.</div>" }, out);
              LX.UnitChain(out, { label: "Unit chain: the average U.S. power in 2025", steps: [
                { v: num(usTWh, 0) + " TWh", u: "energy, 2025" }, { op: "× 1,000 =" }, { v: num(usTWh * 1000, 0) + " GWh", u: "the same energy" },
                { op: "÷ 8,760 h =" }, { v: num(F.avgGW, 0) + " GW", u: "average power", out: true }] });
              H("p", { class: "t1-note", text: "Peaks run higher. In one grid, the Southwest Power Pool, the 2025 peak hour needed " + num(F.sppPeakGW, 1) + " GW: about " +
                num(F.sppRatio, 1) + " times its " + num(F.sppAvgGW, 1) + " GW average." }, out);
              H("p", { class: "t1-note", text: "So a grid must meet its busiest hours as well as supply the year's energy." }, out);
              keep("fermi", g); api.done();
            } });
        } },
      { text: "Stretch, optional: claims often say a " + W.wind.mw + " MW wind farm “powers " + num(W.wind.claim, 0) + " homes”: " + W.wind.mw + " MW ÷ 1 kW per home. Set the sliders to EIA's averages and see what survives.",
        free: true,
        build: function (act, api) {
          board.listen(null);
          var box = H("div", { class: "t1-wind" }, act), ctl = H("div", { class: "t1-wind-ctl" }, box), out = H("div", { class: "t1-wind-out" }, box);
          var cf = LX.Slider(ctl, { label: "Capacity factor", color: "var(--lx-wind)", min: D.wind.cf.min, max: D.wind.cf.max, step: D.wind.cf.step,
            fmt: function (v) { return num(v, 1) + "%"; },
            hint: function () { return "A year's energy as a share of running flat out. U.S. wind in 2025: " + num(W.wind.refCF, 1) + "% (EIA)."; }, onChange: upd });
          var hw = LX.Slider(ctl, { label: "Average power a home buys", color: "var(--lx-demand)", min: D.wind.home_w.min, max: D.wind.home_w.max, step: D.wind.home_w.step,
            fmt: function (v) { return num(v, 0) + " W"; },
            hint: function () { return "EIA, 2022: an average U.S. home bought 10,791 kWh a year, an average of " + num(W.wind.refW, 0) + " W."; }, onChange: upd });
          var ref = H("button", { class: "lx-btn ghost small", type: "button", text: "Use EIA's averages" }, ctl);
          ref.addEventListener("click", function () { cf.set(W.wind.refCF); hw.set(W.wind.refW); upd(); });
          cf.set(D.wind.cf.start); hw.set(D.wind.home_w.start);
          H("span", { class: "k", text: "Your settings: homes whose yearly purchases it matches" }, out);
          var big = H("b", { class: "v", "aria-live": "polite" }, out), sub = H("span", { class: "sub" }, out);
          function upd() {
            var n = homes(W.wind.mw, cf.val() / 100, hw.val());
            big.textContent = num(Math.round(n / 100) * 100, 0);
            sub.textContent = "= " + W.wind.mw + " MW × " + num(cf.val(), 1) + "% ÷ " + num(hw.val(), 0) + " W";
            keep("wind", { cf: cf.val(), w: hw.val(), homes: n });
            // done only at EIA's averages, so the feedback below always describes the number on screen
            if (Math.abs(cf.val() - W.wind.refCF) < 0.05 && Math.abs(hw.val() - W.wind.refW) < 0.5) {
              api.done();
              if (!act.querySelector(".t1-go")) {
                var row = H("div", { class: "t1-gorow" }, act);
                H("a", { class: "lx-btn small t1-go", href: "#explain", html: "See it as diagrams" + LX.icon("arrow") }, row);
                H("a", { class: "lx-link", href: "05-capacity-factor.html", text: "Capacity factor, step by step: lesson 5" }, row);
              }
              api.saw("At EIA's averages the farm's yearly energy matches what about " + num(Math.round(W.wind.real / 100) * 100, 0) +
                " homes buy: an illustrative equivalent, not " + num(W.wind.claim, 0) + ". On calm hours it makes little, so those homes still need other plants.");
            }
          }
          upd();
        } }
    ];
    var cards = LX.StepCards(live, { id: "t1-steps", steps: steps, onStep: function (i) { if (i === steps.length - 1) LX.progress.done(LESSON); } });
    // demo states for screenshots (LX.demo): "step-N" opens card N with its action done, "mid" = step 4 tested,
    // "done" = steps 2, 4, 6 and 7 done, then the last card at EIA's averages
    var act = function () { return live.querySelector(".lx-step-act"); };
    var demo = {
      1: function () {},
      2: function () { board.reset(); board.only(["hairdryer", "tv"]); board.run(10); },
      3: function () { board.reset(); board.only(["microwave"]); board.run(60); board.only([], true); },
      4: function () { board.reset(); board.only([pa.id]); board.run(W.predict.a.minutes); board.only([pb.id]); board.run(W.predict.b.minutes); board.only([], true); },
      5: function () { [].slice.call(act().querySelectorAll(".t1-kwh .lx-choice"), 0, 3).forEach(function (b) { b.click(); }); },
      6: function () { W.items.forEach(function (it) { var b = act().querySelectorAll(".t1-rungbtns .lx-choice"); if (b[it.rung]) b[it.rung].click(); }); },
      7: function () {
        var g = act().querySelector(".lx-guess input"), lk = act().querySelector(".lx-guess .lx-btn");
        if (g && lk && !lk.hidden) { g.value = W.fermi.answer; g.dispatchEvent(new Event("input")); lk.click(); }
      },
      8: function () { [].forEach.call(act().querySelectorAll("button"), function (b) { if (b.textContent === "Use EIA's averages") b.click(); }); }
    };
    LX.demo(root, function (state) {
      var n = /^step-(\d+)$/.exec(state), k = n ? Math.max(1, Math.min(steps.length, +n[1])) : state === "mid" ? 4 : state === "done" ? steps.length : 0;
      if (!k) return null;
      if (state === "done") [2, 4, 6, 7].forEach(function (j) { cards.go(j - 1); demo[j](); });
      cards.go(k - 1); demo[k]();
      return { view: "step " + k };
    }, cards);
    root.lxLesson = { board: board, world: W, model: model };
    buildExplain(W, D, P);
    LX.on("t1-board", debounce(function (s) { keep("maxW", Math.max(P.maxW || 0, s.power)); keep("wh", s.meter.wh); }, 250));
    LX.on("t1-log", debounce(function () { buildExplain(W, D, P); }, 400));
  }
  function debounce(f, ms) { var tm = null; return function (x) { clearTimeout(tm); tm = setTimeout(function () { f(x); }, ms); }; }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(W, D, P) {
    var host = document.getElementById("t1-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    // 1. the bathtub: an annotated diagram
    var c1 = H("div", { class: "lx-xcard" }, host);
    var hd = H("header", { class: "lx-x-head" }, c1); H("h3", { text: "The bathtub: flow and amount" }, hd);
    H("span", { class: "lx-hint", text: "An analogy, not a circuit" }, hd);
    var tw = H("div", { class: "t1-bath" }, c1);
    var svg = S("svg", { viewBox: "0 0 300 230", role: "img", "aria-label": "A tap fills a bathtub. The flow from the tap is power; the water in the tub is energy; the time the tap runs is the hours." }, tw);
    S("path", { d: "M20 34 H118 a10 10 0 0 1 10 10 V62", fill: "none", stroke: "var(--lx-ink-2)", "stroke-width": 9, "stroke-linecap": "round" }, svg);
    S("rect", { x: 108, y: 18, width: 26, height: 10, rx: 3, fill: "var(--lx-ink-2)" }, svg);
    S("rect", { x: 122, y: 66, width: 12, height: 86, fill: "var(--lx-wind)", opacity: 0.8 }, svg);
    S("path", { d: "M58 118 V200 a14 14 0 0 0 14 14 H254 a14 14 0 0 0 14 -14 V118", fill: "none", stroke: "var(--lx-ink)", "stroke-width": 3 }, svg);
    S("rect", { x: 60, y: 152, width: 206, height: 60, rx: 10, fill: "var(--lx-wind)", opacity: 0.32 }, svg);
    S("path", { d: "M60 152 H266", stroke: "var(--lx-wind)", "stroke-width": 2 }, svg);
    var cl = S("g", { transform: "translate(226 40)", color: "var(--lx-ink-2)" }, svg); LX.iconInto(cl, "clock", 0, 0, 34);
    [[146, 92, "1"], [248, 182, "2"], [226, 76, "3"]].forEach(function (p) {
      S("circle", { cx: p[0], cy: p[1], r: 11, fill: "var(--lx-ink)" }, svg);
      S("text", { x: p[0], y: p[1] + 4.5, "text-anchor": "middle", class: "t1-num" }, svg).textContent = p[2];
    });
    var ol = H("ol", { class: "t1-bathlist" }, tw);
    var you = P.maxW ? " Your board peaked at " + fmtKW(P.maxW) + "." : "";
    var youE = P.wh ? " Your meter last read " + fmtKWh(P.wh) + "." : "";
    [["Flow from the tap = power", "kW: how fast, right now. Open the tap wider and the flow jumps at once." + you],
     ["Water in the tub = energy used", "kWh: how much has flowed so far. This running total only rises while the tap runs." + youE],
     ["Time the tap runs = hours", "Energy = power × time: 1.5 kW for 10 minutes and 0.05 kW for 5 hours both give 0.25 kWh."]]
      .forEach(function (r) { var li = H("li", null, ol); H("b", { text: r[0] }, li); H("span", { text: r[1] }, li); });
    H("p", { class: "lx-hint", text: "Close the tap: the flow stops at once, and the water stays. A home's meter works the same way." }, c1);
    // 2. comparison table
    var c2 = H("div", { class: "lx-xcard" }, host);
    LX.CompareTable(c2, {
      title: "Power and energy, side by side", text: true,
      columns: [{ key: "name", label: "Question", main: true }, { key: "power", label: "Power" }, { key: "energy", label: "Energy" }],
      rows: [
        { key: "what", name: "What it measures", power: "How fast energy flows, right now", energy: "How much has flowed over a stretch of time" },
        { key: "units", name: "Units", power: "W, kW, MW, GW", energy: "Wh, kWh, MWh, GWh, TWh" },
        { key: "bath", name: "In the bathtub", power: "The flow from the tap", energy: "The water in the tub" },
        { key: "fall", name: "Can the number fall?", power: "Yes, at once: switch off", energy: "The meter's running total of energy used: no. Stored energy, as in a battery, can fall" },
        { key: "size", name: "What it sizes or pays for", power: "Wires and plants, which must cover the peak hour", energy: "Fuel, and most of a home's bill" },
        { key: "real", name: "A real number", power: "Lower 48 record hour: " + num(W.fermi.peakGW, 0) + " GW (29 July 2025)", energy: "U.S. year: " + num(Math.round(W.wh.us / 1e12), 0) + " TWh (2025)" }
      ].map(function (r) { r.color = "var(--lx-ink-3)"; return r; })
    });
    // 3. the scale strip
    var c3 = H("div", { class: "lx-xcard" }, host);
    var h3 = H("header", { class: "lx-x-head" }, c3); H("h3", { text: "Where this lesson sits: five scales" }, h3);
    H("p", { class: "lx-lede", text: "The course climbs five scales. The units grow with them, but power and energy stay the same two ideas." }, c3);
    var strip = H("ol", { class: "t1-strip" }, c3);
    [["S0", "Device and plant", "W to MW", "A phone charge: " + fmtE(W.wh.phone) + ". A home's year: " + fmtE(W.wh.homeyear) + ".", true],
     ["S1", "Microgrid and community", "kW to MW", "A campus or village keeping its lights on", false, ["f07-microgrids.html", "F7"]],
     ["S2", "Regional grid", "MW to GW", "Prairie Town peaks at " + num(W.town.scalePeakMW, 0) + " MW; the Southwest Power Pool peaked at " + num(W.spp.peakGW, 1) + " GW in 2025.", false],
     ["S3", "City and region", "hundreds of MW", "Prairie City's buildings, transport and industry", false, ["f09-city-energy.html", "F9"]],
     ["S4", "Nation", "hundreds of GW", "The U.S. used " + num(Math.round(W.wh.us / 1e12), 0) + " TWh in 2025; the Lower 48's record hour needed " + num(W.fermi.peakGW, 0) + " GW.", false]]
      .forEach(function (s) {
        var li = H("li", { class: s[4] ? "here" : "" }, strip);
        var top = H("div", { class: "t" }, li); H("span", { class: "code", text: s[0] }, top);
        if (s[4]) H("span", { class: "lx-pill good", text: "This lesson" }, top);
        H("b", { text: s[1] }, li); H("span", { class: "pw", text: "Power: " + s[2] }, li);
        var ex = H("span", { class: "ex", text: s[3] + (s[5] ? " (" : "") }, li);   // s[5]: the live lesson that teaches this scale
        if (s[5]) { H("a", { href: s[5][0], text: s[5][1] }, ex); ex.appendChild(document.createTextNode(").")); }
      });
  }

  LX.mount("power-energy", function (live, data, root) { view(live, data, root); });
})();
